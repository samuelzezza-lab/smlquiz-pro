drop policy if exists "users read own quiz attempts" on public.quiz_attempts;
create policy "users read own quiz attempts" on public.quiz_attempts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "users read own attempt questions" on public.quiz_attempt_questions;
create policy "users read own attempt questions" on public.quiz_attempt_questions for select to authenticated
using (exists (select 1 from public.quiz_attempts a where a.id=attempt_id and a.user_id=(select auth.uid())));
drop policy if exists "users read own quiz wallet" on public.user_quiz_wallets;
create policy "users read own quiz wallet" on public.user_quiz_wallets for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "users read own credit ledger" on public.quiz_credit_ledger;
create policy "users read own credit ledger" on public.quiz_credit_ledger for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "users read own coupon redemptions" on public.quiz_coupon_redemptions;
create policy "users read own coupon redemptions" on public.quiz_coupon_redemptions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "authenticated read standard study plans" on public.programmi_standard;
create policy "authenticated read standard study plans" on public.programmi_standard for select to authenticated using (true);
