-- Align project member data, constraints, and policies so invited collaborators retain access

set check_function_bodies = off;

-- Normalize stored emails and key fields
update public.project_members
set email = lower(trim(email))
where email is not null
  and email <> lower(trim(email));

delete from public.project_members
where email is null;

update public.project_members
set invited_at = timezone('utc', now())
where invited_at is null;

update public.project_members
set role = 'viewer'
where role is null;

update public.project_members
set status = 'accepted',
    accepted_at = coalesce(accepted_at, timezone('utc', now()))
where user_id is not null
  and status is distinct from 'accepted';

update public.project_members
set status = 'pending'
where status is null;

with ranked_members as (
  select
    id,
    row_number() over (
      partition by project_id, lower(email)
      order by
        case when status = 'accepted' then 0 else 1 end,
        coalesce(accepted_at, invited_at) desc,
        id
    ) as rn
  from public.project_members
)
delete from public.project_members pm
using ranked_members r
where pm.id = r.id
  and r.rn > 1;

alter table public.project_members
  alter column email set not null,
  alter column role set default 'viewer',
  alter column status set default 'pending',
  alter column invited_at set default timezone('utc', now());

alter table public.project_members
  alter column role set not null,
  alter column status set not null,
  alter column invited_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_members_status_check'
      and conrelid = 'public.project_members'::regclass
  ) then
    alter table public.project_members
      add constraint project_members_status_check
      check (status in ('pending', 'accepted'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_members_role_check'
      and conrelid = 'public.project_members'::regclass
  ) then
    alter table public.project_members
      add constraint project_members_role_check
      check (role in ('owner', 'editor', 'viewer'));
  end if;
end
$$;

create unique index if not exists project_members_project_email_key
  on public.project_members (project_id, lower(email));

create unique index if not exists project_members_project_user_key
  on public.project_members (project_id, user_id)
  where user_id is not null;

create or replace function public.resolve_project_membership_for_user(target_user uuid, target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_email is null then
    return;
  end if;

  update public.project_members
  set user_id = target_user,
      status = 'accepted',
      accepted_at = coalesce(accepted_at, timezone('utc', now())),
      email = lower(trim(target_email))
  where user_id is null
    and lower(email) = lower(trim(target_email));

  update public.project_members
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, timezone('utc', now())),
      email = lower(trim(target_email))
  where user_id = target_user
    and status <> 'accepted';
end
$$;

create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.resolve_project_membership_for_user(new.id, new.email);
  return new;
end
$$;

drop trigger if exists handle_auth_user_change on auth.users;

create trigger handle_auth_user_change
after insert or update of email on auth.users
for each row
execute function public.handle_auth_user_change();

do $$
declare
  rec record;
begin
  for rec in
    select id, email
    from auth.users
  loop
    perform public.resolve_project_membership_for_user(rec.id, rec.email);
  end loop;
end
$$;

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

  return exists (
    select 1
    from public.projects p
    where p.id = target_project
      and p.user_id = auth.uid()
  );
end
$$;

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

alter table public.project_members enable row level security;

drop policy if exists "owners manage project members" on public.project_members;
drop policy if exists "members can view membership" on public.project_members;
drop policy if exists "members manage their row" on public.project_members;

create policy "owners manage project members"
on public.project_members
for all
to authenticated
using (
  public.project_owner_can_manage(project_id)
)
with check (
  public.project_owner_can_manage(project_id)
);

create policy "members can view membership"
on public.project_members
for select
to authenticated
using (
  public.project_owner_can_manage(project_id)
  or user_id = auth.uid()
  or (
    auth.jwt() ? 'email'
    and lower(email) = lower(auth.jwt()->> 'email')
  )
);

reset check_function_bodies;

drop policy if exists "Project members can read projects" on public.projects;
create policy "Project members can read projects"
on public.projects
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_project_member_user(id, auth.uid())
);
