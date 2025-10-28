-- Allow authenticated users to upload to the daily-uploads bucket while keeping bucket scoped security

drop policy if exists "Authenticated upload to daily uploads" on storage.objects;

create policy "Authenticated upload to daily uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'daily-uploads'
  and auth.role() = 'authenticated'
);

