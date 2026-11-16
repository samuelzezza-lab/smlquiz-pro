CREATE OR REPLACE FUNCTION public.guard_quiz_api_request(p_user_id uuid, p_session_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_active_sessions integer;
  v_limit integer := 2;
  v_max_requests integer := 120;
  v_window interval := interval '1 minute';
  v_count integer;
  v_window_started timestamptz;
begin
  if p_user_id is null or p_session_id is null or p_action is null or length(p_action) > 80 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_session', 'status', 401);
  end if;
  if not exists (
    select 1 from auth.sessions s
    where s.id = p_session_id and s.user_id = p_user_id
      and (s.not_after is null or s.not_after > now())
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_session', 'status', 401);
  end if;
  select count(*)::integer into v_active_sessions
  from auth.sessions s
  where s.user_id = p_user_id and (s.not_after is null or s.not_after > now());

  if v_active_sessions > v_limit and not exists (
    select 1 from (
      select s.id from auth.sessions s
      where s.user_id = p_user_id and (s.not_after is null or s.not_after > now())
      order by s.created_at asc, s.id asc limit v_limit
    ) allowed_sessions where allowed_sessions.id = p_session_id
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'session_limit', 'status', 409,
      'active_sessions', v_active_sessions, 'session_limit', v_limit);
  end if;

  if p_action in ('start','semestre-start') then
    v_max_requests := 8; v_window := interval '10 minutes';
  elsif p_action = 'answer' then
    v_max_requests := 45; v_window := interval '1 minute';
  elsif p_action = 'semestre-submit' then
    v_max_requests := 10; v_window := interval '10 minutes';
  elsif p_action in ('report','referral-claim') then
    v_max_requests := 5; v_window := interval '1 hour';
  elsif p_action in ('translate-catalog','translate-quiz-set','coupon','checkout') then
    v_max_requests := 8; v_window := interval '1 hour';
  end if;

  insert into public.quiz_api_rate_limits as limits
    (user_id, action, window_started_at, request_count)
  values (p_user_id, p_action, now(), 1)
  on conflict (user_id, action) do update
  set window_started_at = case when limits.window_started_at + v_window <= now() then now() else limits.window_started_at end,
      request_count = case when limits.window_started_at + v_window <= now() then 1 else limits.request_count + 1 end
  returning request_count, window_started_at into v_count, v_window_started;

  if v_count > v_max_requests then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limit', 'status', 429,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_window_started + v_window - now())))::integer));
  end if;
  return jsonb_build_object('allowed', true, 'active_sessions', v_active_sessions, 'session_limit', v_limit);
end;
$function$
;

REVOKE ALL ON FUNCTION public.guard_quiz_api_request(uuid, uuid, text) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.guard_quiz_api_request(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.start_semestre_filtro_exam(p_materia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  v_guard jsonb;
  v_id uuid;
  v_ids uuid[];
  v_questions jsonb;
  v_access_type text;
  v_free_used integer := 0;
  v_has_entitlement boolean := false;
  v_has_unlimited boolean := false;
begin
  if v_user_id is null then raise exception 'Devi accedere per iniziare una simulazione'; end if;
  if p_materia not in ('biologia','chimica','fisica') then raise exception 'Materia non valida'; end if;

  v_guard := public.guard_quiz_api_request(v_user_id, v_session_id, 'semestre-start');
  if coalesce((v_guard->>'allowed')::boolean, false) is not true then
    if v_guard->>'reason' = 'session_limit' then
      raise exception 'Questo account è già attivo su 2 dispositivi. Esci da Quizmind su un altro dispositivo e riprova.';
    elsif v_guard->>'reason' = 'rate_limit' then
      raise exception 'Hai avviato troppe simulazioni in poco tempo. Riprova più tardi.';
    else
      raise exception 'Sessione non valida. Accedi di nuovo.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  select exists (select 1 from public.user_semestre_filtro_entitlements e
    where e.user_id=v_user_id and e.subject in ('all',p_materia)) into v_has_entitlement;
  select exists (select 1 from public.user_site_subscriptions s
    where s.user_id=v_user_id and s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end > now())) into v_has_unlimited;

  if v_has_unlimited then
    v_access_type := 'unlimited';
  elsif v_has_entitlement then
    if exists (select 1 from public.user_semestre_filtro_entitlements e
               where e.user_id=v_user_id and e.subject='all') then
      v_access_type := 'complete';
    else
      v_access_type := 'single_subject';
    end if;
  else
    select count(*)::integer into v_free_used from public.semestre_filtro_tentativi t
    where t.user_id=v_user_id and t.access_type='free';
    if v_free_used >= 5 then
      return jsonb_build_object('paywall',true,'free_used',5,'free_remaining',0,'selected_subject',p_materia);
    end if;
    v_access_type := 'free';
  end if;

  with selected as (
    (select id, 1 as grp, random() as r from public.semestre_filtro_domande
     where anno_accademico='2026/27' and materia=p_materia and attiva=true and tipo='scelta_multipla'
     order by random() limit 21)
    union all
    (select id, 2 as grp, random() as r from public.semestre_filtro_domande
     where anno_accademico='2026/27' and materia=p_materia and attiva=true and tipo='completamento'
     order by random() limit 10)
  )
  select array_agg(id order by random()) into v_ids from selected;
  if coalesce(array_length(v_ids,1),0)<>31 then raise exception 'Banca insufficiente per una simulazione completa'; end if;

  insert into public.semestre_filtro_tentativi(user_id,access_type,materia,question_ids)
  values(v_user_id,v_access_type,p_materia,v_ids) returning id into v_id;

  select jsonb_agg(jsonb_build_object(
    'id',q.id,'codice',q.codice,'materia',q.materia,'argomento',q.argomento,
    'tipo',q.tipo,'difficolta',q.difficolta,'testo_domanda',q.testo_domanda,'opzioni',q.opzioni
  ) order by array_position(v_ids,q.id))
  into v_questions from public.semestre_filtro_domande q where q.id=any(v_ids);

  return jsonb_build_object(
    'exam_id',v_id,'questions',v_questions,'duration_seconds',3000,
    'access_type',v_access_type,
    'free_used',case when v_access_type='free' then v_free_used+1 else v_free_used end,
    'free_remaining',case when v_access_type='free' then greatest(0,4-v_free_used) else greatest(0,5-v_free_used) end
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.submit_semestre_filtro_exam(p_exam_id uuid, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  v_guard jsonb;
  v_exam public.semestre_filtro_tentativi%rowtype;
  v_correct int:=0;
  v_wrong int:=0;
  v_blank int:=0;
  v_score numeric;
  v_review jsonb;
begin
  if v_user_id is null then raise exception 'Devi accedere per consegnare la simulazione'; end if;
  v_guard := public.guard_quiz_api_request(v_user_id, v_session_id, 'semestre-submit');
  if coalesce((v_guard->>'allowed')::boolean, false) is not true then
    if v_guard->>'reason' = 'session_limit' then
      raise exception 'Questo account è già attivo su 2 dispositivi. Esci da Quizmind su un altro dispositivo e riprova.';
    elsif v_guard->>'reason' = 'rate_limit' then
      raise exception 'Troppe consegne in poco tempo. Riprova più tardi.';
    else
      raise exception 'Sessione non valida. Accedi di nuovo.';
    end if;
  end if;

  select * into v_exam from public.semestre_filtro_tentativi where id=p_exam_id for update;
  if not found or v_exam.user_id is distinct from v_user_id then raise exception 'Simulazione non trovata per questo account'; end if;
  if v_exam.submitted_at is not null then raise exception 'Simulazione già consegnata'; end if;
  if v_exam.expires_at < now() then raise exception 'Sessione scaduta'; end if;

  with evaluated as (
    select q.*,
      nullif(btrim(coalesce(p_answers->>q.id::text,'')),'') as given,
      case when q.tipo='scelta_multipla' then
        case when q.risposta_corretta ~ '^[A-E]$' then q.risposta_corretta
          else (select chr(64+o.ord::int) from jsonb_array_elements_text(q.opzioni) with ordinality o(val,ord)
                where lower(trim(o.val))=lower(trim(q.risposta_corretta)) limit 1) end
        else q.risposta_corretta end as correct_normalized,
      case when q.tipo='scelta_multipla' then
        case when q.risposta_corretta ~ '^[A-E]$' then (p_answers->>q.id::text)=q.risposta_corretta
          else exists(select 1 from jsonb_array_elements_text(q.opzioni) with ordinality o(val,ord)
            where chr(64+o.ord::int)=p_answers->>q.id::text
              and lower(trim(o.val))=lower(trim(q.risposta_corretta))) end
        else exists(select 1 from jsonb_array_elements_text(q.risposte_accettate) a
          where lower(regexp_replace(trim(a),'\\s+',' ','g'))=
            lower(regexp_replace(trim(coalesce(p_answers->>q.id::text,'')),'\\s+',' ','g'))) end as is_correct
    from public.semestre_filtro_domande q where q.id=any(v_exam.question_ids)
  )
  select count(*) filter(where given is not null and is_correct),
         count(*) filter(where given is not null and not is_correct),
         count(*) filter(where given is null),
         jsonb_agg(jsonb_build_object(
           'id',id,'codice',codice,'tipo',tipo,'testo_domanda',testo_domanda,
           'opzioni',opzioni,'given',given,'correct',correct_normalized,
           'correct_text',case when tipo='scelta_multipla' and correct_normalized ~ '^[A-E]$'
                               then opzioni->>(ascii(correct_normalized)-65) else correct_normalized end,
           'accepted',risposte_accettate,'is_correct',coalesce(is_correct,false),'spiegazione',spiegazione
         ) order by array_position(v_exam.question_ids,id))
  into v_correct,v_wrong,v_blank,v_review from evaluated;

  v_score:=least(30::numeric,greatest(0::numeric,v_correct-v_wrong*0.1));
  update public.semestre_filtro_tentativi set submitted_at=now(),answers=p_answers,score=v_score where id=p_exam_id;
  return jsonb_build_object('correct',v_correct,'wrong',v_wrong,'blank',v_blank,'score',v_score,'review',v_review);
end
$function$
;