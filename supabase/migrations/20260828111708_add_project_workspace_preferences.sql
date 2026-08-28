-- Store the user's workspace split and the views enabled for each project.
-- Access is still governed by the existing project membership policies.

create type public.project_space_type as enum ('personal', 'team');
create type public.project_module as enum ('tasks', 'canvas', 'calendar');

alter table public.projects
  add column space_type public.project_space_type not null default 'team',
  add column enabled_views public.project_module[] not null
    default array['tasks', 'canvas', 'calendar']::public.project_module[],
  add constraint projects_enabled_views_not_empty
    check (cardinality(enabled_views) between 1 and 3);
