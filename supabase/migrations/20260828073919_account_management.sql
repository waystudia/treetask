-- Account lifecycle and platform administration.
-- Privileged Auth operations stay in the authenticated Edge Function; no
-- service-role credential is ever exposed to the browser.

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.platform_admins
      where user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Make account deletion deterministic. Owned projects and content authored by
-- the deleted user are removed, while assignments/reviews on shared content
-- are anonymised.
alter table public.projects drop constraint projects_owner_id_fkey;
alter table public.projects
  add constraint projects_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;

alter table public.project_members drop constraint project_members_invited_by_fkey;
alter table public.project_members
  add constraint project_members_invited_by_fkey foreign key (invited_by) references auth.users (id) on delete set null;

alter table public.tasks drop constraint tasks_created_by_fkey;
alter table public.tasks
  add constraint tasks_created_by_fkey foreign key (created_by) references auth.users (id) on delete cascade;
alter table public.tasks drop constraint tasks_assigned_to_fkey;
alter table public.tasks
  add constraint tasks_assigned_to_fkey foreign key (assigned_to) references auth.users (id) on delete set null;

alter table public.outcomes drop constraint outcomes_created_by_fkey;
alter table public.outcomes
  add constraint outcomes_created_by_fkey foreign key (created_by) references auth.users (id) on delete cascade;
alter table public.outcomes drop constraint outcomes_reviewer_id_fkey;
alter table public.outcomes
  add constraint outcomes_reviewer_id_fkey foreign key (reviewer_id) references auth.users (id) on delete set null;

alter table public.outcome_evidence drop constraint outcome_evidence_created_by_fkey;
alter table public.outcome_evidence
  add constraint outcome_evidence_created_by_fkey foreign key (created_by) references auth.users (id) on delete cascade;

alter table public.project_files drop constraint project_files_uploaded_by_fkey;
alter table public.project_files
  add constraint project_files_uploaded_by_fkey foreign key (uploaded_by) references auth.users (id) on delete cascade;

alter table public.canvas_documents alter column updated_by drop not null;
alter table public.canvas_documents drop constraint canvas_documents_updated_by_fkey;
alter table public.canvas_documents
  add constraint canvas_documents_updated_by_fkey foreign key (updated_by) references auth.users (id) on delete set null;

alter table public.photo_annotations drop constraint photo_annotations_created_by_fkey;
alter table public.photo_annotations
  add constraint photo_annotations_created_by_fkey foreign key (created_by) references auth.users (id) on delete cascade;

create or replace function public.purge_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid := (select auth.uid());
begin
  if target_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  delete from public.projects where owner_id = target_user_id;
  delete from public.outcome_evidence where created_by = target_user_id;
  delete from public.photo_annotations where created_by = target_user_id;
  delete from public.project_files where uploaded_by = target_user_id;
  delete from public.outcomes where created_by = target_user_id;
  delete from public.tasks where created_by = target_user_id;
  update public.canvas_documents set updated_by = null where updated_by = target_user_id;
  update public.tasks set assigned_to = null where assigned_to = target_user_id;
  update public.outcomes set reviewer_id = null where reviewer_id = target_user_id;
  update public.project_members set invited_by = null where invited_by = target_user_id;
  delete from public.project_members where user_id = target_user_id;
  delete from public.notifications where user_id = target_user_id;
  delete from public.activity_logs where actor_id = target_user_id;
  update public.profiles
  set display_name = 'Пользователь', avatar_path = null, timezone = 'Europe/Moscow'
  where id = target_user_id;
end;
$$;

revoke all on function public.purge_my_data() from public, anon;
grant execute on function public.purge_my_data() to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Пользователь'
      ),
      120
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists treetask_create_profile on auth.users;
create trigger treetask_create_profile
after insert on auth.users
for each row execute function private.handle_new_user();

insert into public.profiles (id, display_name)
select
  users.id,
  left(
    coalesce(
      nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
      'Пользователь'
    ),
    120
  )
from auth.users as users
on conflict (id) do nothing;
