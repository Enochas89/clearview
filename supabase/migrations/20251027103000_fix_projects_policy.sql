set check_function_bodies = off;

create or replace function public.is_project_member_user(target_project uuid, target_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform set_config('row_security', 'off', true);

  if target_project is null or target_user is null then
    return false;
  end if;

  return exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project
      and pm.user_id = target_user
      and pm.status = 'accepted'
  );
end
$$;

drop policy if exists "Project members can read projects" on public.projects;
create policy "Project members can read projects"
on public.projects
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_project_member_user(id, auth.uid())
);

reset check_function_bodies;
