-- Resolve security and foreign-key findings from Supabase advisors.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

create index activity_logs_actor_idx on public.activity_logs (actor_id);
create index canvas_documents_updated_by_idx on public.canvas_documents (updated_by);
create index notifications_project_idx on public.notifications (project_id);
create index outcome_evidence_created_by_idx on public.outcome_evidence (created_by);
create index outcomes_created_by_idx on public.outcomes (created_by);
create index outcomes_reviewer_idx on public.outcomes (reviewer_id);
create index photo_annotations_created_by_idx on public.photo_annotations (created_by);
create index photo_annotations_source_file_idx on public.photo_annotations (source_file_id);
create index photo_annotations_task_idx on public.photo_annotations (task_id);
create index project_files_uploaded_by_idx on public.project_files (uploaded_by);
create index project_members_invited_by_idx on public.project_members (invited_by);
create index projects_owner_idx on public.projects (owner_id);
create index tasks_created_by_idx on public.tasks (created_by);
create index tasks_parent_task_idx on public.tasks (parent_task_id);
