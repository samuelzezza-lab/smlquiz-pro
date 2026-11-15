-- Persist personal study workspace and remove the legacy 30-quiz cycle ceiling.
create table if not exists public.user_study_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.user_study_data enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_study_data' and policyname='Users manage their own study data') then
    create policy "Users manage their own study data" on public.user_study_data
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;
grant select, insert, update, delete on public.user_study_data to authenticated;

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.get_next_materia_quiz(uuid,text)'::regprocedure);
  v_def := replace(v_def, 'quiz_number BETWEEN 1 AND 30', 'quiz_number >= 1');
  v_def := replace(v_def, 'q.quiz_number BETWEEN 1 AND 30', 'q.quiz_number >= 1');
  v_def := replace(v_def, 'v_seen >= v_total AND v_total = 30', 'v_seen >= v_total AND v_total > 0');
  v_def := replace(v_def, 'v_total=30', 'v_total>0');
  v_def := replace(v_def, 'FROM generate_series(1,30) n', 'FROM generate_series(1, (SELECT coalesce(max(quiz_number),0)+1 FROM public.quiz_sets WHERE materia_id=p_materia_id)) n');
  execute v_def;
end $$;

-- Harden the immutable validation helper and index frequently joined foreign keys.
alter function public.quiz_options_are_valid(jsonb,text) set search_path = '';
create index if not exists user_profiles_university_id_idx on public.user_profiles(university_id);
create index if not exists user_subject_entitlements_materia_id_idx on public.user_subject_entitlements(materia_id);

-- The fallback status branch must also work for any non-empty pool size.
do $$ declare v_def text; begin v_def:=pg_get_functiondef('public.get_next_materia_quiz(uuid,text)'::regprocedure); v_def:=replace(v_def,'v_total=30','v_total>0'); execute v_def; end $$;

-- Keep legacy SECURITY DEFINER RPCs off the public/authenticated API surface.
revoke execute on function public.get_next_materia_quiz(uuid,text) from public, anon, authenticated;
revoke execute on function public.complete_materia_quiz(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.get_next_materia_quiz(uuid,text) to service_role;
grant execute on function public.complete_materia_quiz(uuid,text,uuid) to service_role;
