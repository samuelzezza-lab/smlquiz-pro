-- Remove the legacy 60-quiz ceiling and the 30-quiz (300-question) generation ceiling.
do $$
declare v text;
begin
  select pg_get_functiondef('public.acquire_quiz_materia_generation_lock(text,smallint,integer)'::regprocedure) into v;
  v := replace(v, 'p_quiz_number > 60', 'false');
  execute v;

  select pg_get_functiondef('public.claim_quiz_generation(text,smallint)'::regprocedure) into v;
  v := replace(v, 'p_quiz_number > 60', 'false');
  execute v;

  select pg_get_functiondef('public.enqueue_quiz_generation(text,smallint,smallint)'::regprocedure) into v;
  v := replace(v, 'p_quiz_number > 60', 'false');
  v := replace(v, E'  IF v_existing >= 300 THEN\n    RETURN NULL;\n  END IF;\n', '');
  v := replace(v, E'  IF v_existing + (v_reserved * 10) >= 300 THEN\n    RETURN NULL;\n  END IF;\n', '');
  execute v;

  select pg_get_functiondef('public.process_smlquiz_stripe_event(text,text,uuid,text,text,text,text[],text,text,text,timestamptz,boolean)'::regprocedure) into v;
  v := replace(v, '''checkout.session.completed'',''invoice.paid''',
                  '''checkout.session.completed'',''checkout.session.async_payment_succeeded'',''invoice.paid''');
  v := replace(v, 'if p_event_type = ''checkout.session.completed'' then',
                  'if p_event_type in (''checkout.session.completed'',''checkout.session.async_payment_succeeded'') then');
  execute v;
end $$;
