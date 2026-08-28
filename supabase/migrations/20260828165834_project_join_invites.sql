-- One-time project invitations for existing authenticated accounts.
-- Plain six-digit codes never reach the database; only SHA-256 hashes are stored.

create table public.project_join_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  role public.project_role not null default 'member' check (role <> 'owner'),
  responsibility text not null default '' check (char_length(responsibility) <= 160),
  allocation_percent smallint not null default 50 check (allocation_percent between 5 and 100),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_by is null or used_at is not null),
  check (revoked_at is null or revoked_at >= created_at)
);

create table public.project_join_claims (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.project_join_invites (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('accepted', 'already_member')),
  joined_role public.project_role not null,
  created_at timestamptz not null default now()
);

create table public.project_join_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index project_join_invites_project_idx
  on public.project_join_invites (project_id, created_at desc);
create index project_join_invites_active_idx
  on public.project_join_invites (expires_at)
  where used_at is null and revoked_at is null;
create index project_join_claims_user_idx
  on public.project_join_claims (user_id, created_at desc);
create index project_join_attempts_rate_limit_idx
  on public.project_join_attempts (user_id, attempted_at desc);

alter table public.project_join_invites enable row level security;
alter table public.project_join_claims enable row level security;
alter table public.project_join_attempts enable row level security;

revoke all on table public.project_join_invites, public.project_join_claims, public.project_join_attempts
  from public, anon, authenticated;
grant select, insert, update, delete on table public.project_join_invites, public.project_join_claims, public.project_join_attempts
  to service_role;

create or replace function private.claim_project_join_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_invite public.project_join_invites%rowtype;
  existing_role public.project_role;
  profile_name text;
begin
  select invite.*
  into target_invite
  from public.project_join_invites as invite
  where invite.code_hash = new.code_hash
    and invite.used_at is null
    and invite.revoked_at is null
    and invite.expires_at > now()
  for update;

  if not found then
    raise exception 'Код не найден, истёк или уже использован' using errcode = 'P0001';
  end if;

  select member.role
  into existing_role
  from public.project_members as member
  where member.project_id = target_invite.project_id
    and member.user_id = new.user_id;

  if found then
    new.invite_id := target_invite.id;
    new.project_id := target_invite.project_id;
    new.status := 'already_member';
    new.joined_role := existing_role;
    return new;
  end if;

  select coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Участник'
  )
  into profile_name
  from auth.users as users
  where users.id = new.user_id;

  if not found then
    raise exception 'Аккаунт приглашённого пользователя не найден' using errcode = '23503';
  end if;

  insert into public.profiles (id, display_name, timezone)
  values (new.user_id, left(profile_name, 120), 'Europe/Moscow')
  on conflict (id) do nothing;

  insert into public.project_members (
    project_id,
    user_id,
    role,
    responsibility,
    allocation_percent,
    invited_by
  )
  values (
    target_invite.project_id,
    new.user_id,
    target_invite.role,
    target_invite.responsibility,
    target_invite.allocation_percent,
    target_invite.created_by
  );

  update public.project_join_invites
  set used_at = now(), used_by = new.user_id
  where id = target_invite.id;

  new.invite_id := target_invite.id;
  new.project_id := target_invite.project_id;
  new.status := 'accepted';
  new.joined_role := target_invite.role;
  return new;
end;
$$;

revoke all on function private.claim_project_join_invite() from public, anon, authenticated;

create trigger project_join_claim
before insert on public.project_join_claims
for each row execute function private.claim_project_join_invite();
