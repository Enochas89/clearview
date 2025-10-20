create extension if not exists "pgcrypto";

-- Create change_orders table to track project-level change requests
create table if not exists public.change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  subject text not null,
  body text,
  recipient_name text,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'needs-info')),
  sent_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  response_at timestamptz,
  response_message text,
  created_by uuid references auth.users (id),
  created_by_name text,
  responded_by uuid references auth.users (id),
  responded_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists change_orders_project_id_idx on public.change_orders (project_id);
create index if not exists change_orders_status_idx on public.change_orders (status);

alter table public.change_orders enable row level security;

-- Reusable check for project membership or ownership
create or replace function public.is_project_member(project_uuid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = project_uuid
      and (
        p.user_id = auth.uid()
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = auth.uid()
        )
      )
  );
$$;

create policy "Allow project users to read change orders"
  on public.change_orders
  for select
  using (public.is_project_member(project_id));

create policy "Allow project users to insert change orders"
  on public.change_orders
  for insert
  with check (public.is_project_member(project_id));

create policy "Allow project users to update change orders"
  on public.change_orders
  for update
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy "Allow project users to delete change orders"
  on public.change_orders
  for delete
  using (public.is_project_member(project_id));

-- Keep updated_at in sync whenever a row changes
create or replace function public.set_change_order_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_change_orders_updated_at on public.change_orders;
create trigger trg_change_orders_updated_at
  before update on public.change_orders
  for each row
  execute function public.set_change_order_updated_at();
