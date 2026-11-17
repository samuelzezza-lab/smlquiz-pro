-- Public readers must not receive the author UUID or display name for anonymous exam experiences.
-- Own rows remain identifiable to their author so they can be managed and removed.
create or replace view public.exam_experiences_public
with (security_barrier = true)
as
select
  e.id,
  case when e.is_anonymous and e.user_id is distinct from auth.uid() then null::uuid else e.user_id end as user_id,
  e.materia_id,
  e.exam_date,
  e.university_name,
  e.exam_format,
  e.difficulty,
  e.preparation_weeks,
  e.outcome,
  e.topics,
  e.description,
  e.advice,
  case when e.is_anonymous and e.user_id is distinct from auth.uid() then 'Studente anonimo'::text else e.display_name end as display_name,
  e.is_anonymous,
  e.helpful_count,
  e.status,
  case when e.user_id = auth.uid() then e.status_reason else null::text end as status_reason,
  e.created_at
from public.exam_experiences e
where e.status = 'published' or e.user_id = auth.uid();

revoke select on public.exam_experiences from anon, authenticated;
grant select on public.exam_experiences_public to anon, authenticated;

drop policy if exists "Users can report other published experiences once" on public.exam_experience_reports;
create policy "Users can report other published experiences once"
on public.exam_experience_reports for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.exam_experiences_public e
    where e.id = exam_experience_reports.experience_id
      and e.status = 'published'
      and e.user_id is distinct from (select auth.uid())
  )
);

drop policy if exists "Users can vote once on other experiences" on public.exam_experience_votes;
create policy "Users can vote once on other experiences"
on public.exam_experience_votes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.exam_experiences_public e
    where e.id = exam_experience_votes.experience_id
      and e.status = 'published'
      and e.user_id is distinct from (select auth.uid())
  )
);
