-- Real team profiles and project-control settings.

create type public.profile_work_status as enum ('available', 'focused', 'busy', 'away');

alter table public.profiles
  add column job_title text not null default '' check (char_length(job_title) <= 120),
  add column department text not null default '' check (char_length(department) <= 120),
  add column bio text not null default '' check (char_length(bio) <= 1000),
  add column skills text[] not null default '{}'::text[] check (cardinality(skills) <= 12),
  add column work_status public.profile_work_status not null default 'available',
  add column weekly_capacity_hours smallint not null default 40 check (weekly_capacity_hours between 1 and 80);

alter table public.project_members
  add column responsibility text not null default '' check (char_length(responsibility) <= 160),
  add column allocation_percent smallint not null default 100 check (allocation_percent between 5 and 100);

alter table public.projects
  add column wip_limit smallint not null default 3 check (wip_limit between 1 and 50);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Участник'
  );

  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    left(profile_name, 120),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'Europe/Moscow')
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

insert into public.profiles (id, display_name, timezone)
select
  users.id,
  left(coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Участник'
  ), 120),
  coalesce(nullif(users.raw_user_meta_data ->> 'timezone', ''), 'Europe/Moscow')
from auth.users as users
on conflict (id) do nothing;

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
  set
    display_name = 'Пользователь',
    avatar_path = null,
    timezone = 'Europe/Moscow',
    job_title = '',
    department = '',
    bio = '',
    skills = '{}'::text[],
    work_status = 'available',
    weekly_capacity_hours = 40
  where id = target_user_id;
end;
$$;

revoke all on function public.purge_my_data() from public, anon;
grant execute on function public.purge_my_data() to authenticated;
