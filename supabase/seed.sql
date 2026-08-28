-- Seed the first authenticated local user with a demonstration project.
-- The block intentionally does nothing when no Auth user exists yet.
do $$
declare
  seed_user uuid;
  seed_project uuid := 'de000001-0000-4000-8000-000000000001';
begin
  select id into seed_user from auth.users order by created_at limit 1;
  if seed_user is null then
    raise notice 'TreeTask seed skipped: create a local Auth user first';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', seed_user::text, true);

  insert into public.projects (id, owner_id, name, description)
  values (seed_project, seed_user, 'WayYaam', 'Демонстрационный проект TreeTask')
  on conflict (id) do nothing;

  insert into public.project_members (project_id, user_id, role, invited_by)
  values (seed_project, seed_user, 'owner', seed_user)
  on conflict (project_id, user_id) do nothing;
end;
$$;
