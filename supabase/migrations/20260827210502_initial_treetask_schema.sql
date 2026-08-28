-- TreeTask initial schema. All browser-accessible tables use membership-scoped RLS.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.project_role as enum ('owner', 'admin', 'reviewer', 'member', 'viewer');
create type public.task_status as enum ('backlog', 'planned', 'in_progress', 'blocked', 'done', 'archived');
create type public.task_progress_mode as enum ('binary', 'checklist', 'manual');
create type public.outcome_status as enum ('not_started', 'in_progress', 'submitted', 'confirmed', 'rejected');
create type public.evidence_kind as enum ('photo', 'file', 'link', 'document', 'screenshot', 'review_comment');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  avatar_path text,
  timezone text not null default 'Europe/Moscow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id),
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  color text not null default '#5758eb' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null default 'tree',
  task_ratio numeric(4,3) not null default 0.700 check (task_ratio between 0 and 1),
  outcome_ratio numeric(4,3) not null default 0.300 check (outcome_ratio between 0 and 1),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_ratios_total check (task_ratio + outcome_ratio = 1)
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.project_role not null default 'member',
  invited_by uuid references auth.users (id),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_task_id uuid references public.tasks (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  assigned_to uuid references auth.users (id),
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '',
  status public.task_status not null default 'backlog',
  weight smallint not null default 3 check (weight in (1, 2, 3, 5, 8, 13)),
  progress_mode public.task_progress_mode not null default 'binary',
  manual_progress smallint not null default 0 check (manual_progress between 0 and 100),
  due_at timestamptz,
  completed_at timestamptz,
  position numeric(18,6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  completed boolean not null default false,
  position numeric(18,6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  reviewer_id uuid references auth.users (id),
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '',
  status public.outcome_status not null default 'not_started',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outcome_evidence (
  id uuid primary key default gen_random_uuid(),
  outcome_id uuid not null references public.outcomes (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  kind public.evidence_kind not null,
  storage_path text,
  external_url text,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint evidence_has_content check (
    storage_path is not null or external_url is not null or nullif(trim(comment), '') is not null
  )
);

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id),
  name text not null check (char_length(name) between 1 and 300),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  folder text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.canvas_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null default 'Основная доска',
  yjs_snapshot bytea,
  snapshot_version bigint not null default 0 check (snapshot_version >= 0),
  updated_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.photo_annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_file_id uuid not null references public.project_files (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  created_by uuid not null references auth.users (id),
  annotation_data jsonb not null default '{"version":1,"objects":[]}'::jsonb,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index project_members_user_project_idx on public.project_members (user_id, project_id);
create index project_members_project_role_idx on public.project_members (project_id, role);
create index tasks_project_status_position_idx on public.tasks (project_id, status, position);
create index tasks_assigned_due_idx on public.tasks (assigned_to, due_at) where status <> 'archived';
create index task_checklist_task_position_idx on public.task_checklist_items (task_id, position);
create index outcomes_project_status_idx on public.outcomes (project_id, status);
create index outcome_evidence_outcome_idx on public.outcome_evidence (outcome_id, created_at);
create index project_files_project_folder_idx on public.project_files (project_id, folder);
create index canvas_documents_project_idx on public.canvas_documents (project_id);
create index photo_annotations_project_file_idx on public.photo_annotations (project_id, source_file_id);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index activity_logs_project_created_idx on public.activity_logs (project_id, created_at desc);

create or replace function private.is_project_member(
  target_project_id uuid,
  allowed_roles public.project_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.project_members as member
      where member.project_id = target_project_id
        and member.user_id = (select auth.uid())
        and (allowed_roles is null or member.role = any(allowed_roles))
    );
$$;

revoke all on function private.is_project_member(uuid, public.project_role[]) from public, anon;
grant execute on function private.is_project_member(uuid, public.project_role[]) to authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.add_project_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or new.owner_id <> (select auth.uid()) then
    raise exception 'Project owner must match the authenticated user';
  end if;
  insert into public.project_members (project_id, user_id, role, invited_by)
  values (new.id, new.owner_id, 'owner', new.owner_id);
  return new;
end;
$$;

revoke all on function private.add_project_owner() from public, anon, authenticated;

create or replace function private.protect_project_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'Use the dedicated ownership-transfer operation';
  end if;
  return new;
end;
$$;

create or replace function private.protect_task_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.project_id <> old.project_id or new.created_by <> old.created_by then
    raise exception 'Task project and creator are immutable';
  end if;
  return new;
end;
$$;

create or replace function private.protect_outcome_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.project_id <> old.project_id or new.created_by <> old.created_by then
    raise exception 'Outcome project and creator are immutable';
  end if;
  return new;
end;
$$;

create or replace function private.storage_project_id(object_name text)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

create or replace function private.topic_project_id(topic text)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when topic ~* '^project:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(topic, ':', 2)::uuid
    else null
  end;
$$;

grant execute on function private.storage_project_id(text), private.topic_project_id(text) to authenticated;

create trigger projects_add_owner
after insert on public.projects
for each row execute function private.add_project_owner();

create trigger projects_protect_owner
before update on public.projects
for each row execute function private.protect_project_owner();

create trigger tasks_protect_identity
before update on public.tasks
for each row execute function private.protect_task_identity();

create trigger outcomes_protect_identity
before update on public.outcomes
for each row execute function private.protect_outcome_identity();

create trigger profiles_touch_updated_at before update on public.profiles for each row execute function private.touch_updated_at();
create trigger projects_touch_updated_at before update on public.projects for each row execute function private.touch_updated_at();
create trigger tasks_touch_updated_at before update on public.tasks for each row execute function private.touch_updated_at();
create trigger task_checklist_touch_updated_at before update on public.task_checklist_items for each row execute function private.touch_updated_at();
create trigger outcomes_touch_updated_at before update on public.outcomes for each row execute function private.touch_updated_at();
create trigger project_files_touch_updated_at before update on public.project_files for each row execute function private.touch_updated_at();
create trigger canvas_documents_touch_updated_at before update on public.canvas_documents for each row execute function private.touch_updated_at();
create trigger photo_annotations_touch_updated_at before update on public.photo_annotations for each row execute function private.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.outcomes enable row level security;
alter table public.outcome_evidence enable row level security;
alter table public.project_files enable row level security;
alter table public.canvas_documents enable row level security;
alter table public.photo_annotations enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

create policy profiles_select_project_peers on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.project_members mine
    join public.project_members theirs using (project_id)
    where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
  )
);
create policy profiles_insert_self on public.profiles for insert to authenticated
with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy projects_select_members on public.projects for select to authenticated
using (private.is_project_member(id));
create policy projects_insert_owner on public.projects for insert to authenticated
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));
create policy projects_update_admins on public.projects for update to authenticated
using (private.is_project_member(id, array['owner', 'admin']::public.project_role[]))
with check (private.is_project_member(id, array['owner', 'admin']::public.project_role[]));
create policy projects_delete_owner on public.projects for delete to authenticated
using (private.is_project_member(id, array['owner']::public.project_role[]));

create policy project_members_select_members on public.project_members for select to authenticated
using (private.is_project_member(project_id));
create policy project_members_insert_admins on public.project_members for insert to authenticated
with check (
  private.is_project_member(project_id, array['owner', 'admin']::public.project_role[])
  and (role <> 'owner' or user_id = (select owner_id from public.projects where id = project_id))
);
create policy project_members_update_admins on public.project_members for update to authenticated
using (private.is_project_member(project_id, array['owner', 'admin']::public.project_role[]))
with check (
  private.is_project_member(project_id, array['owner', 'admin']::public.project_role[])
  and (role <> 'owner' or user_id = (select owner_id from public.projects where id = project_id))
);
create policy project_members_delete_admins on public.project_members for delete to authenticated
using (
  private.is_project_member(project_id, array['owner', 'admin']::public.project_role[])
  and user_id <> (select owner_id from public.projects where id = project_id)
);

create policy tasks_select_members on public.tasks for select to authenticated
using (private.is_project_member(project_id));
create policy tasks_insert_members on public.tasks for insert to authenticated
with check (
  private.is_project_member(project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[])
  and created_by = (select auth.uid())
  and (
    assigned_to is null
    or exists (select 1 from public.project_members where project_id = tasks.project_id and user_id = assigned_to)
  )
);
create policy tasks_update_members on public.tasks for update to authenticated
using (private.is_project_member(project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[]))
with check (
  private.is_project_member(project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[])
  and (
    assigned_to is null
    or exists (select 1 from public.project_members where project_id = tasks.project_id and user_id = assigned_to)
  )
);
create policy tasks_delete_admin_or_creator on public.tasks for delete to authenticated
using (
  created_by = (select auth.uid())
  or private.is_project_member(project_id, array['owner', 'admin']::public.project_role[])
);

create policy checklist_select_members on public.task_checklist_items for select to authenticated
using (exists (select 1 from public.tasks where tasks.id = task_id and private.is_project_member(tasks.project_id)));
create policy checklist_insert_members on public.task_checklist_items for insert to authenticated
with check (exists (select 1 from public.tasks where tasks.id = task_id and private.is_project_member(tasks.project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[])));
create policy checklist_update_members on public.task_checklist_items for update to authenticated
using (exists (select 1 from public.tasks where tasks.id = task_id and private.is_project_member(tasks.project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[])))
with check (exists (select 1 from public.tasks where tasks.id = task_id and private.is_project_member(tasks.project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[])));
create policy checklist_delete_members on public.task_checklist_items for delete to authenticated
using (exists (select 1 from public.tasks where tasks.id = task_id and private.is_project_member(tasks.project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[])));

create policy outcomes_select_members on public.outcomes for select to authenticated
using (private.is_project_member(project_id));
create policy outcomes_insert_members on public.outcomes for insert to authenticated
with check (private.is_project_member(project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[]) and created_by = (select auth.uid()));
create policy outcomes_update_reviewers on public.outcomes for update to authenticated
using (private.is_project_member(project_id, array['owner', 'admin', 'reviewer']::public.project_role[]))
with check (private.is_project_member(project_id, array['owner', 'admin', 'reviewer']::public.project_role[]));
create policy outcomes_delete_admin_or_creator on public.outcomes for delete to authenticated
using (created_by = (select auth.uid()) or private.is_project_member(project_id, array['owner', 'admin']::public.project_role[]));

create policy evidence_select_members on public.outcome_evidence for select to authenticated
using (exists (select 1 from public.outcomes where outcomes.id = outcome_id and private.is_project_member(outcomes.project_id)));
create policy evidence_insert_members on public.outcome_evidence for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.outcomes where outcomes.id = outcome_id and private.is_project_member(outcomes.project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[])));
create policy evidence_update_creator on public.outcome_evidence for update to authenticated
using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy evidence_delete_creator_or_admin on public.outcome_evidence for delete to authenticated
using (created_by = (select auth.uid()) or exists (select 1 from public.outcomes where outcomes.id = outcome_id and private.is_project_member(outcomes.project_id, array['owner', 'admin']::public.project_role[])));

create policy files_select_members on public.project_files for select to authenticated
using (private.is_project_member(project_id));
create policy files_insert_members on public.project_files for insert to authenticated
with check (private.is_project_member(project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[]) and uploaded_by = (select auth.uid()));
create policy files_update_uploader_or_admin on public.project_files for update to authenticated
using (uploaded_by = (select auth.uid()) or private.is_project_member(project_id, array['owner', 'admin']::public.project_role[]))
with check (uploaded_by = (select auth.uid()) or private.is_project_member(project_id, array['owner', 'admin']::public.project_role[]));
create policy files_delete_uploader_or_admin on public.project_files for delete to authenticated
using (uploaded_by = (select auth.uid()) or private.is_project_member(project_id, array['owner', 'admin']::public.project_role[]));

create policy canvas_select_members on public.canvas_documents for select to authenticated
using (private.is_project_member(project_id));
create policy canvas_insert_members on public.canvas_documents for insert to authenticated
with check (private.is_project_member(project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[]) and updated_by = (select auth.uid()));
create policy canvas_update_members on public.canvas_documents for update to authenticated
using (private.is_project_member(project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[]))
with check (private.is_project_member(project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[]) and updated_by = (select auth.uid()));
create policy canvas_delete_admins on public.canvas_documents for delete to authenticated
using (private.is_project_member(project_id, array['owner', 'admin']::public.project_role[]));

create policy annotations_select_members on public.photo_annotations for select to authenticated
using (private.is_project_member(project_id));
create policy annotations_insert_members on public.photo_annotations for insert to authenticated
with check (private.is_project_member(project_id, array['owner', 'admin', 'reviewer', 'member']::public.project_role[]) and created_by = (select auth.uid()));
create policy annotations_update_creator_or_admin on public.photo_annotations for update to authenticated
using (created_by = (select auth.uid()) or private.is_project_member(project_id, array['owner', 'admin']::public.project_role[]))
with check (created_by = (select auth.uid()) or private.is_project_member(project_id, array['owner', 'admin']::public.project_role[]));
create policy annotations_delete_creator_or_admin on public.photo_annotations for delete to authenticated
using (created_by = (select auth.uid()) or private.is_project_member(project_id, array['owner', 'admin']::public.project_role[]));

create policy notifications_select_self on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
create policy notifications_update_self on public.notifications for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_self on public.notifications for delete to authenticated
using (user_id = (select auth.uid()));

create policy activity_select_members on public.activity_logs for select to authenticated
using (private.is_project_member(project_id));
create policy activity_insert_members on public.activity_logs for insert to authenticated
with check (private.is_project_member(project_id) and actor_id = (select auth.uid()));

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects, public.project_members, public.tasks,
  public.task_checklist_items, public.outcomes, public.outcome_evidence, public.project_files,
  public.canvas_documents, public.photo_annotations, public.notifications, public.activity_logs
to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('project-files', 'project-files', false, 52428800),
  ('project-media', 'project-media', false, 104857600),
  ('outcome-evidence', 'outcome-evidence', false, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

create policy treetask_storage_select on storage.objects for select to authenticated
using (
  bucket_id in ('project-files', 'project-media', 'outcome-evidence')
  and private.is_project_member(private.storage_project_id(name))
);
create policy treetask_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id in ('project-files', 'project-media', 'outcome-evidence')
  and owner_id = (select auth.uid())::text
  and private.is_project_member(private.storage_project_id(name), array['owner', 'admin', 'reviewer', 'member']::public.project_role[])
);
create policy treetask_storage_update on storage.objects for update to authenticated
using (
  bucket_id in ('project-files', 'project-media', 'outcome-evidence')
  and private.is_project_member(private.storage_project_id(name), array['owner', 'admin', 'reviewer', 'member']::public.project_role[])
)
with check (
  bucket_id in ('project-files', 'project-media', 'outcome-evidence')
  and private.is_project_member(private.storage_project_id(name), array['owner', 'admin', 'reviewer', 'member']::public.project_role[])
);
create policy treetask_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id in ('project-files', 'project-media', 'outcome-evidence')
  and (
    owner_id = (select auth.uid())::text
    or private.is_project_member(private.storage_project_id(name), array['owner', 'admin']::public.project_role[])
  )
);

create policy treetask_broadcast_read on realtime.messages for select to authenticated
using (private.is_project_member(private.topic_project_id(realtime.topic())));
create policy treetask_broadcast_send on realtime.messages for insert to authenticated
with check (private.is_project_member(private.topic_project_id(realtime.topic()), array['owner', 'admin', 'reviewer', 'member']::public.project_role[]));
