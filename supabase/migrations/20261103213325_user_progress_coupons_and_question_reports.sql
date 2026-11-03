create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  language text not null default 'it' check (language in ('it','en','fr','de','es','zh')),
  privacy_policy_version text,
  terms_version text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
create policy "users read own profile" on public.user_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own profile" on public.user_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own profile" on public.user_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.domande(id) on delete cascade,
  category text not null check (category in ('errore_testo','risposta_errata','spiegazione','duplicato','altro')),
  details text not null default '',
  status text not null default 'new' check (status in ('new','reviewing','resolved','rejected')),
  created_at timestamptz not null default now()
);
alter table public.question_reports enable row level security;
create policy "users create own question reports" on public.question_reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users read own question reports" on public.question_reports for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.quiz_coupons (
  code text primary key,
  credits integer not null check (credits between 1 and 1000),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.quiz_coupons enable row level security;

create table if not exists public.quiz_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.quiz_coupons(code),
  user_id uuid not null references auth.users(id) on delete cascade,
  credits integer not null check (credits > 0),
  created_at timestamptz not null default now(),
  unique (code,user_id)
);
alter table public.quiz_coupon_redemptions enable row level security;

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id,achievement_key)
);
alter table public.user_achievements enable row level security;
create policy "users read own achievements" on public.user_achievements for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= current_streak),
  last_study_date date,
  updated_at timestamptz not null default now()
);
alter table public.user_streaks enable row level security;
create policy "users read own streak" on public.user_streaks for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.redeem_quiz_coupon(p_user_id uuid, p_code text)
returns jsonb language plpgsql set search_path = ''
as $function$
declare v_coupon public.quiz_coupons%rowtype; v_balance integer;
begin
  if p_user_id is null or nullif(btrim(p_code),'') is null then raise exception 'Codice coupon non valido'; end if;
  select * into v_coupon from public.quiz_coupons where code=upper(btrim(p_code)) and active=true for update;
  if not found or v_coupon.starts_at>now() or (v_coupon.expires_at is not null and v_coupon.expires_at<now()) then raise exception 'Coupon non valido o scaduto'; end if;
  if exists(select 1 from public.quiz_coupon_redemptions where code=v_coupon.code and user_id=p_user_id) then raise exception 'Hai già utilizzato questo coupon'; end if;
  if v_coupon.max_redemptions is not null and v_coupon.redemption_count>=v_coupon.max_redemptions then raise exception 'Coupon esaurito'; end if;
  insert into public.quiz_coupon_redemptions(code,user_id,credits) values(v_coupon.code,p_user_id,v_coupon.credits);
  update public.quiz_coupons set redemption_count=redemption_count+1 where code=v_coupon.code;
  insert into public.user_quiz_wallets(user_id,balance,updated_at) values(p_user_id,v_coupon.credits,now())
    on conflict(user_id) do update set balance=public.user_quiz_wallets.balance+excluded.balance,updated_at=now();
  insert into public.quiz_credit_ledger(user_id,delta,reason,description) values(p_user_id,v_coupon.credits,'admin_adjustment','Coupon: '||v_coupon.code);
  select balance into v_balance from public.user_quiz_wallets where user_id=p_user_id;
  return jsonb_build_object('credits_added',v_coupon.credits,'balance',v_balance);
end;
$function$;
revoke all on function public.redeem_quiz_coupon(uuid,text) from public, anon, authenticated;
grant execute on function public.redeem_quiz_coupon(uuid,text) to service_role;

create or replace function public.update_user_streak(p_user_id uuid)
returns jsonb language plpgsql set search_path = ''
as $function$
declare v_today date := (now() at time zone 'Europe/Rome')::date; v_last date; v_current integer; v_longest integer;
begin
  if p_user_id is null then raise exception 'Utente non valido'; end if;
  select last_study_date,current_streak,longest_streak into v_last,v_current,v_longest
    from public.user_streaks where user_id=p_user_id for update;
  if not found then
    insert into public.user_streaks(user_id,current_streak,longest_streak,last_study_date) values(p_user_id,1,1,v_today);
    return jsonb_build_object('current_streak',1,'longest_streak',1);
  end if;
  if v_last=v_today then return jsonb_build_object('current_streak',v_current,'longest_streak',v_longest); end if;
  if v_last=v_today-1 then v_current:=v_current+1; else v_current:=1; end if;
  v_longest:=greatest(v_longest,v_current);
  update public.user_streaks set current_streak=v_current,longest_streak=v_longest,last_study_date=v_today,updated_at=now() where user_id=p_user_id;
  return jsonb_build_object('current_streak',v_current,'longest_streak',v_longest);
end;
$function$;
revoke all on function public.update_user_streak(uuid) from public, anon, authenticated;
grant execute on function public.update_user_streak(uuid) to service_role;
