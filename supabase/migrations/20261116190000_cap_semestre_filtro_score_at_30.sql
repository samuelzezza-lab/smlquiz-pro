-- Semestre Filtro 2026/27: cap score at 30 points per subject exam.
create or replace function public.submit_semestre_filtro_exam(p_exam_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
 v_exam public.semestre_filtro_tentativi%rowtype;
 v_correct int:=0;
 v_wrong int:=0;
 v_blank int:=0;
 v_score numeric;
 v_review jsonb;
begin
 select * into v_exam
 from public.semestre_filtro_tentativi
 where id=p_exam_id
 for update;

 if not found then raise exception 'Simulazione non trovata'; end if;
 if v_exam.submitted_at is not null then raise exception 'Simulazione già consegnata'; end if;
 if v_exam.expires_at < now() then raise exception 'Sessione scaduta'; end if;

 with evaluated as (
  select q.*,
   nullif(btrim(coalesce(p_answers->>q.id::text,'')),'') as given,
   case when q.tipo='scelta_multipla' then
     case when q.risposta_corretta ~ '^[A-E]$' then q.risposta_corretta
       else (select chr(64+o.ord::int)
             from jsonb_array_elements_text(q.opzioni) with ordinality o(val,ord)
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
  from public.semestre_filtro_domande q
  where q.id=any(v_exam.question_ids)
 )
 select count(*) filter(where given is not null and is_correct),
        count(*) filter(where given is not null and not is_correct),
        count(*) filter(where given is null),
        jsonb_agg(jsonb_build_object(
          'id',id,'codice',codice,'tipo',tipo,'testo_domanda',testo_domanda,
          'opzioni',opzioni,'given',given,'correct',correct_normalized,
          'correct_text',case when tipo='scelta_multipla' and correct_normalized ~ '^[A-E]$'
                              then opzioni->>(ascii(correct_normalized)-65)
                              else correct_normalized end,
          'accepted',risposte_accettate,'is_correct',coalesce(is_correct,false),
          'spiegazione',spiegazione
        ) order by array_position(v_exam.question_ids,id))
 into v_correct,v_wrong,v_blank,v_review
 from evaluated;

 v_score:=least(30::numeric,greatest(0::numeric,v_correct-v_wrong*0.1));
 update public.semestre_filtro_tentativi
 set submitted_at=now(),answers=p_answers,score=v_score
 where id=p_exam_id;

 return jsonb_build_object('correct',v_correct,'wrong',v_wrong,'blank',v_blank,
                           'score',v_score,'review',v_review);
end $function$;
