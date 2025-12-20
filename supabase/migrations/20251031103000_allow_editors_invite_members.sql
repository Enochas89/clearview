-- Broaden member management policy so accepted project editors can invite teammates

set check_function_bodies = off;

create or replace function public.project_owner_can_manage(target_project uuid)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform set_config('row_security', 'off', true);

  if target_project is null then
    return false;
  end if;

  if exists (
    select 1
    from public.projects p
    where p.id = target_project
      and p.user_id = auth.uid()
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project
      and pm.user_id = auth.uid()
      and pm.status = 'accepted'
      and pm.role in ('owner', 'editor')
  );
end
$$;

alter policy "owners manage project members"
on public.project_members
using (public.project_owner_can_manage(project_id))
with check (public.project_owner_can_manage(project_id));

reset check_function_bodies;
