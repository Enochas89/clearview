create table if not exists public.change_order_recipients (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.change_orders (id) on delete cascade,
  email text not null,
  name text,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'approved_with_conditions', 'denied', 'needs_info')
  ),
  condition_note text,
  response_token uuid not null default gen_random_uuid(),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists change_order_recipients_change_order_id_idx
  on public.change_order_recipients (change_order_id);

alter table public.change_order_recipients enable row level security;

<<<<<<< HEAD
drop policy if exists "project members can read recipients" on public.change_order_recipients;
=======
>>>>>>> 44ba67cd3a6c436736fbd4546f80b1903c9b24e5
create policy "project members can read recipients"
  on public.change_order_recipients
  for select
  using (
    exists (
      select 1
      from public.change_orders co
      where co.id = change_order_id
        and public.is_project_member(co.project_id)
    )
  );

<<<<<<< HEAD
drop policy if exists "project members can insert recipients" on public.change_order_recipients;
=======
>>>>>>> 44ba67cd3a6c436736fbd4546f80b1903c9b24e5
create policy "project members can insert recipients"
  on public.change_order_recipients
  for insert
  with check (
    exists (
      select 1
      from public.change_orders co
      where co.id = change_order_id
        and public.is_project_member(co.project_id)
    )
  );

<<<<<<< HEAD
drop policy if exists "project members can update recipients" on public.change_order_recipients;
=======
>>>>>>> 44ba67cd3a6c436736fbd4546f80b1903c9b24e5
create policy "project members can update recipients"
  on public.change_order_recipients
  for update
  using (
    exists (
      select 1
      from public.change_orders co
      where co.id = change_order_id
        and public.is_project_member(co.project_id)
    )
  )
  with check (true);
