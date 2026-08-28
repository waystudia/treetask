-- Things-inspired hierarchy and explicit project context for safe sharing.

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 300),
  color text not null default '#007aff' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position numeric(18,6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index areas_owner_position_idx on public.areas (owner_id, position, id);

alter table public.areas enable row level security;
revoke all on public.areas from anon;
grant select, insert, update, delete on public.areas to authenticated;

create policy areas_select_owner on public.areas for select to authenticated
using (owner_id = (select auth.uid()));
create policy areas_insert_owner on public.areas for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy areas_update_owner on public.areas for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy areas_delete_owner on public.areas for delete to authenticated
using (owner_id = (select auth.uid()));

create trigger areas_touch_updated_at
before update on public.areas
for each row execute function private.touch_updated_at();

alter table public.projects
  add column area_id uuid references public.areas (id) on delete set null,
  add column goal text not null default '' check (char_length(goal) <= 2000),
  add column current_stage text not null default '' check (char_length(current_stage) <= 500),
  add column plan text not null default '' check (char_length(plan) <= 10000);

create index projects_area_updated_idx on public.projects (area_id, updated_at desc);

create or replace function private.validate_project_area_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.area_id is not null and not exists (
    select 1
    from public.areas
    where id = new.area_id and owner_id = new.owner_id
  ) then
    raise exception 'Project area must belong to the project owner';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_project_area_owner() from public, anon, authenticated;

create trigger projects_validate_area_owner
before insert or update of area_id, owner_id on public.projects
for each row execute function private.validate_project_area_owner();

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
  delete from public.areas where owner_id = target_user_id;
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
