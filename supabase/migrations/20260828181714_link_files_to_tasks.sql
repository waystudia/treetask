alter table public.tasks
  add constraint tasks_id_project_id_key unique (id, project_id);

alter table public.project_files
  add column task_id uuid;

alter table public.project_files
  add constraint project_files_task_project_id_fkey
  foreign key (task_id, project_id)
  references public.tasks (id, project_id)
  on delete set null (task_id);

create index project_files_task_id_idx
  on public.project_files (task_id)
  where task_id is not null;
