-- Fan out domain changes through membership-protected private project topics.
create or replace function private.broadcast_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
begin
  case tg_table_name
    when 'projects' then
      target_project_id := coalesce(new.id, old.id);
    when 'project_members' then
      target_project_id := coalesce(new.project_id, old.project_id);
    when 'tasks' then
      target_project_id := coalesce(new.project_id, old.project_id);
    when 'outcomes' then
      target_project_id := coalesce(new.project_id, old.project_id);
    when 'project_files' then
      target_project_id := coalesce(new.project_id, old.project_id);
    when 'canvas_documents' then
      target_project_id := coalesce(new.project_id, old.project_id);
    when 'photo_annotations' then
      target_project_id := coalesce(new.project_id, old.project_id);
    when 'activity_logs' then
      target_project_id := coalesce(new.project_id, old.project_id);
    when 'task_checklist_items' then
      select task.project_id
      into target_project_id
      from public.tasks as task
      where task.id = coalesce(new.task_id, old.task_id);
    when 'outcome_evidence' then
      select outcome.project_id
      into target_project_id
      from public.outcomes as outcome
      where outcome.id = coalesce(new.outcome_id, old.outcome_id);
    else
      return null;
  end case;

  if target_project_id is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'project:' || target_project_id::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

revoke all on function private.broadcast_project_change() from public, anon, authenticated;

create trigger projects_broadcast_change
after insert or update or delete on public.projects
for each row execute function private.broadcast_project_change();

create trigger project_members_broadcast_change
after insert or update or delete on public.project_members
for each row execute function private.broadcast_project_change();

create trigger tasks_broadcast_change
after insert or update or delete on public.tasks
for each row execute function private.broadcast_project_change();

create trigger task_checklist_broadcast_change
after insert or update or delete on public.task_checklist_items
for each row execute function private.broadcast_project_change();

create trigger outcomes_broadcast_change
after insert or update or delete on public.outcomes
for each row execute function private.broadcast_project_change();

create trigger outcome_evidence_broadcast_change
after insert or update or delete on public.outcome_evidence
for each row execute function private.broadcast_project_change();

create trigger project_files_broadcast_change
after insert or update or delete on public.project_files
for each row execute function private.broadcast_project_change();

create trigger canvas_documents_broadcast_change
after insert or update or delete on public.canvas_documents
for each row execute function private.broadcast_project_change();

create trigger photo_annotations_broadcast_change
after insert or update or delete on public.photo_annotations
for each row execute function private.broadcast_project_change();

create trigger activity_logs_broadcast_change
after insert or update or delete on public.activity_logs
for each row execute function private.broadcast_project_change();
