-- Preserve the two oldest active sessions when a third device signs in.
-- The newest session is denied; established phone/desktop sessions remain usable.
create or replace function public.guard_quiz_api_request(
  p_user_id uuid,
  p_session_id uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
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
    return jsonb_build_object(
      'allowed', false, 'reason', 'session_limit', 'status', 409,
      'active_sessions', v_active_sessions, 'session_limit', v_limit
    );
  end if;

  if p_action = 'start' then
    v_max_requests := 8; v_window := interval '10 minutes';
  elsif p_action = 'answer' then
    v_max_requests := 45; v_window := interval '1 minute';
  elsif p_action = 'report' then
    v_max_requests := 5; v_window := interval '1 hour';
  elsif p_action in ('translate-catalog', 'translate-quiz-set', 'coupon') then
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
    return jsonb_build_object(
      'allowed', false, 'reason', 'rate_limit', 'status', 429,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_window_started + v_window - now())))::integer)
    );
  end if;
  return jsonb_build_object('allowed', true, 'active_sessions', v_active_sessions, 'session_limit', v_limit);
end;
$$;
revoke all on function public.guard_quiz_api_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.guard_quiz_api_request(uuid, uuid, text) to service_role;
