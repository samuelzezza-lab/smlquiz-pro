alter table public.user_profiles add column if not exists leaderboard_opt_in boolean not null default false;
create index if not exists user_profiles_leaderboard_opt_in_idx on public.user_profiles(leaderboard_opt_in) where leaderboard_opt_in=true;
