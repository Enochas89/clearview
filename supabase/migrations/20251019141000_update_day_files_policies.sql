-- Ensure day_files policies permit project members and owners to insert uploads

drop policy if exists "day_files_insert_members" on day_files;
drop policy if exists "allow_project_members_insert_day_files" on day_files;

create policy "allow_project_members_insert_day_files"
on day_files
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    project_id in (select id from projects where user_id = auth.uid())
    or project_id in (
      select project_id
      from project_members
      where user_id = auth.uid() and status = 'accepted'
    )
  )
);

