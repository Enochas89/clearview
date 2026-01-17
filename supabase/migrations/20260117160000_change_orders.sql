-- Change order tables, statuses, and storage bucket for PDFs

set check_function_bodies = off;

-- Core change orders table
create table if not exists public.change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  subject text not null,
  body text,
  recipient_name text,
  recipient_email text not null,
  status text not null default 'pending',
  sent_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  response_at timestamptz,
  response_message text,
  created_by uuid,
  created_by_name text,
  responded_by uuid,
  responded_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  line_items jsonb not null default '[]'::jsonb,
  total_amount numeric(12,2) default 0
);

alter table public.change_orders
  add constraint change_orders_status_check
  check (status in ('pending', 'approved', 'approved_with_conditions', 'denied', 'needs_info'));

create index if not exists change_orders_project_id_idx
  on public.change_orders (project_id);

-- Recipients table
create table if not exists public.change_order_recipients (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.change_orders (id) on delete cascade,
  email text not null,
  name text,
  status text not null default 'pending',
  condition_note text,
  responded_at timestamptz,
  response_token uuid not null default gen_random_uuid()
);

alter table public.change_order_recipients
  add constraint change_order_recipients_status_check
  check (status in ('pending', 'approved', 'approved_with_conditions', 'denied', 'needs_info'));

create unique index if not exists change_order_recipients_response_token_key
  on public.change_order_recipients (response_token);

create index if not exists change_order_recipients_change_order_id_idx
  on public.change_order_recipients (change_order_id);

-- Basic storage bucket for generated PDFs (private; accessed via signed URLs)
insert into storage.buckets (id, name, public)
values ('change-order-pdfs', 'change-order-pdfs', false)
on conflict (id) do nothing;

-- Row Level Security
alter table public.change_orders enable row level security;
alter table public.change_order_recipients enable row level security;

-- Allow project owners and members to read change orders
create policy "Project members can read change orders"
on public.change_orders
for select
to authenticated
using (
  public.project_owner_can_manage(project_id)
  or public.is_project_member_user(project_id, auth.uid())
);

-- Allow project owners and members to read recipients
create policy "Project members can read change order recipients"
on public.change_order_recipients
for select
to authenticated
using (
  exists (
    select 1
    from public.change_orders co
    where co.id = change_order_id
      and (
        public.project_owner_can_manage(co.project_id)
        or public.is_project_member_user(co.project_id, auth.uid())
      )
  )
);

-- Allow owners/editors to insert/update/delete change orders
create policy "Owners or editors manage change orders"
on public.change_orders
for all
to authenticated
using (
  public.project_owner_can_manage(project_id)
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = project_id
      and pm.user_id = auth.uid()
      and pm.status = 'accepted'
      and pm.role in ('owner', 'editor')
  )
)
with check (
  public.project_owner_can_manage(project_id)
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = project_id
      and pm.user_id = auth.uid()
      and pm.status = 'accepted'
      and pm.role in ('owner', 'editor')
  )
);

-- Allow owners/editors to manage recipients
create policy "Owners or editors manage change order recipients"
on public.change_order_recipients
for all
to authenticated
using (
  exists (
    select 1
    from public.change_orders co
    join public.project_members pm
      on pm.project_id = co.project_id
    where co.id = change_order_id
      and pm.user_id = auth.uid()
      and pm.status = 'accepted'
      and pm.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.change_orders co
    join public.project_members pm
      on pm.project_id = co.project_id
    where co.id = change_order_id
      and pm.user_id = auth.uid()
      and pm.status = 'accepted'
      and pm.role in ('owner', 'editor')
  )
);

reset check_function_bodies;
