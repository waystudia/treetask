begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'other@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'member@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.areas (id, owner_id, name)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'Owner area');
insert into public.projects (id, owner_id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Owner project');
insert into public.tasks (id, project_id, created_by, title, weight)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Private task', 5);
insert into public.project_members (project_id, user_id, role, invited_by)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', '11111111-1111-4111-8111-111111111111');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into public.areas (id, owner_id, name)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff', '22222222-2222-4222-8222-222222222222', 'Other area');
insert into public.projects (id, owner_id, name)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Other project');

select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'areas', 'areas table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.areas'::regclass),
  'RLS is enabled on areas'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.projects'::regclass),
  'RLS is enabled on projects'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'profiles', 'areas', 'projects', 'project_members', 'tasks', 'task_checklist_items',
      'outcomes', 'outcome_evidence', 'project_files', 'canvas_documents',
      'photo_annotations', 'notifications', 'activity_logs', 'platform_admins'
    ]) as expected(name)
    join pg_class on pg_class.relname = expected.name
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace and pg_namespace.nspname = 'public'
    where not pg_class.relrowsecurity
  ),
  'RLS is enabled on every exposed TreeTask table'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_admins'::regclass),
  'RLS is enabled on platform administrators'
);

select is(
  public.is_platform_admin(),
  false,
  'A regular authenticated user is not a platform administrator'
);

select throws_ok(
  $$ select * from public.platform_admins $$,
  '42501',
  null,
  'A regular authenticated user cannot read the administrator registry'
);

select results_eq(
  $$ select id from public.projects order by id $$,
  $$ values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) $$,
  'A user sees only projects where they are a member'
);
select results_eq(
  $$ select id from public.areas order by id $$,
  $$ values ('ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid) $$,
  'A user sees only their own areas'
);
select results_eq(
  $$ select count(*)::bigint from public.tasks $$,
  array[0::bigint],
  'A non-member cannot read project tasks'
);
select throws_ok(
  $$ insert into public.tasks (project_id, created_by, title) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'Intrusion') $$,
  '42501',
  null,
  'A non-member cannot insert tasks into another project'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$ update public.projects set area_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'P0001',
  'Project area must belong to the project owner',
  'A project cannot be attached to another users area'
);
select results_eq(
  $$ select count(*)::bigint from public.tasks $$,
  array[1::bigint],
  'A project owner can read project tasks'
);
select lives_ok(
  $$ insert into public.tasks (project_id, created_by, title) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Allowed task') $$,
  'A member can create a task in their project'
);
select throws_ok(
  $$ update public.tasks set project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' $$,
  'P0001',
  'Task project and creator are immutable',
  'Task ownership boundary cannot be reassigned'
);

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  $$ insert into public.outcomes (id, project_id, created_by, title) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'Member outcome') $$,
  'A member can create an outcome'
);
select lives_ok(
  $$ update public.outcomes set status = 'submitted', submitted_at = now() where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  'The creator can submit an outcome'
);
select throws_ok(
  $$ update public.outcomes set status = 'confirmed', reviewer_id = '33333333-3333-4333-8333-333333333333', reviewed_at = now() where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  '42501',
  null,
  'A regular member cannot confirm their own outcome'
);

select lives_ok(
  $$ select public.purge_my_data() $$,
  'An authenticated user can purge only data bound to their own auth.uid()'
);

set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok(
  $$ select * from public.projects $$,
  '42501',
  null,
  'Anon has no table grant'
);

do $test$
declare
  failure_report text;
begin
  select string_agg(result.line, E'\n')
  into failure_report
  from finish() as result(line);

  if failure_report is not null then
    raise exception 'pgTAP failures:%', E'\n' || failure_report;
  end if;
end
$test$;
rollback;
