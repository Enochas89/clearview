-- Allow project members to read day_files rows and generate signed URLs for storage objects

set check_function_bodies = off;

drop policy if exists "project members can view day files" on public.day_files;

create policy "project members can view day files"
on public.day_files
for select
to authenticated
using (
  project_id in (
    select id
    from public.projects
    where user_id = auth.uid()
  )
  or project_id in (
    select project_id
    from public.project_members
    where user_id = auth.uid()
      and status = 'accepted'
  )
);

drop policy if exists "project members can read daily uploads" on storage.objects;

create policy "project members can read daily uploads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'daily-uploads'
  and (
    exists (
      select 1
      from public.projects p
      where p.id::text = split_part(name, '/', 1)
        and p.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id::text = split_part(name, '/', 1)
        and pm.user_id = auth.uid()
        and pm.status = 'accepted'
    )
  )
);

reset check_function_bodies;
