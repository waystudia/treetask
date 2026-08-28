create policy outcomes_update_creator_submission
on public.outcomes
for update
to authenticated
using (
  created_by = (select auth.uid())
  and status in ('not_started', 'in_progress', 'submitted')
  and private.is_project_member(
    project_id,
    array['owner', 'admin', 'reviewer', 'member']::public.project_role[]
  )
)
with check (
  created_by = (select auth.uid())
  and status in ('not_started', 'in_progress', 'submitted')
  and reviewer_id is null
  and reviewed_at is null
  and review_comment is null
  and private.is_project_member(
    project_id,
    array['owner', 'admin', 'reviewer', 'member']::public.project_role[]
  )
);
