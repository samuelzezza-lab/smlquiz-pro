create index if not exists quiz_attempts_subject_completed_idx
  on public.quiz_attempts (materia_id, completed_at desc)
  where status = 'completed';

create index if not exists quiz_attempt_questions_attempt_correct_idx
  on public.quiz_attempt_questions (attempt_id) include (esito_corretto);

create or replace function public.get_subject_leaderboard(
  p_materia_id text,
  p_current_user_id uuid default null
)
returns table (
  rank_position bigint,
  display_name text,
  score numeric,
  correct_answers bigint,
  total_answers bigint,
  accuracy numeric,
  duration_seconds bigint,
  completed_at timestamptz,
  attempts bigint,
  is_current_user boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  with attempt_stats as (
    select
      a.id,
      a.user_id,
      a.score,
      a.completed_at,
      count(q.id)::bigint as total_answers,
      count(*) filter (where q.esito_corretto is true)::bigint as correct_answers,
      greatest(0, round(extract(epoch from (a.completed_at - a.started_at))))::bigint as duration_seconds
    from public.quiz_attempts a
    join public.quiz_attempt_questions q on q.attempt_id = a.id
    where a.status = 'completed'
      and a.materia_id = p_materia_id
      and a.completed_at is not null
    group by a.id, a.user_id, a.score, a.completed_at, a.started_at
  ),
  best_attempts as (
    select
      s.*,
      row_number() over (
        partition by s.user_id
        order by
          s.correct_answers::numeric / nullif(s.total_answers, 0) desc,
          s.score desc nulls last,
          s.correct_answers desc,
          s.duration_seconds asc,
          s.completed_at asc
      ) as personal_rank,
      count(*) over (partition by s.user_id)::bigint as attempts
    from attempt_stats s
  ),
  visible_students as (
    select
      b.user_id,
      p.display_name,
      b.score,
      b.correct_answers,
      b.total_answers,
      b.duration_seconds,
      b.completed_at,
      b.attempts
    from best_attempts b
    join public.user_profiles p on p.user_id = b.user_id
    where b.personal_rank = 1
      and p.leaderboard_opt_in is true
      and nullif(btrim(p.display_name), '') is not null
  ),
  ranked as (
    select
      row_number() over (
        order by
          v.correct_answers::numeric / nullif(v.total_answers, 0) desc,
          v.score desc nulls last,
          v.correct_answers desc,
          v.duration_seconds asc,
          v.completed_at asc
      )::bigint as rank_position,
      v.*
    from visible_students v
  )
  select
    r.rank_position,
    r.display_name,
    r.score,
    r.correct_answers,
    r.total_answers,
    round(100.0 * r.correct_answers / nullif(r.total_answers, 0), 1) as accuracy,
    r.duration_seconds,
    r.completed_at,
    r.attempts,
    r.user_id = p_current_user_id as is_current_user
  from ranked r
  order by r.rank_position;
$function$;

revoke all on function public.get_subject_leaderboard(text, uuid) from public, anon, authenticated;
grant execute on function public.get_subject_leaderboard(text, uuid) to service_role;
