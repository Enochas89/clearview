# ClearView

ClearView is a Supabase-backed project planning tool that combines calendar notes, document uploads, and a visual timeline to help teams stay aligned.

## Development

```bash
npm install
npm run dev
```

Build the production bundle with `npm run build` and preview locally with `npm run preview`.

## Configuration

- `VITE_DAY_FILES_BUCKET` (optional): name of the Supabase Storage bucket used for daily uploads. Defaults to `daily-uploads`.
- `VITE_PURGE_DEMO_PROJECTS` (optional): set to `true` to purge seeded demo projects on load.
- `RESEND_API_KEY`: API key used for transactional emails (invites, change orders).
- `CHANGE_ORDER_EMAIL_FROM`: email address used when emailing change orders to clients (falls back to `INVITE_EMAIL_FROM` if omitted).
- `CHANGE_ORDER_CLIENT_URL_BASE` (optional): public URL that hosts the change order response page. Defaults to `https://<your-domain>/change-order-response.html`.
- `CHANGE_ORDER_SIGNATURE_BUCKET` (optional): Supabase Storage bucket used to store drawn signatures. Defaults to `change-order-signatures`.

## Mobile

- Responsive breakpoints target desktop (>=1024px), tablets (600-1023px), and phones (<=599px).
- The sidebar collapses into an accessible off-canvas drawer on smaller viewports.
- A fixed bottom tab bar surfaces Dashboard, Timeline, Docs, and Settings on mobile devices.
- Safe-area insets, fluid typography via `clamp()`, and touch-specific enhancements (momentum scrolling, scroll-snap on the timeline) ensure a comfortable experience on iOS/Android.
- Motion-heavy transitions automatically respect `prefers-reduced-motion`.

## QA Checklist

- [ ] Desktop (>=1024px) shows the two-column layout with persistent navigation.
- [ ] Sidebar drawer opens/closes with keyboard and screen readers on tablet/phone.
- [ ] Bottom tabs highlight the active view and keep tap targets at least 44px tall.
- [ ] Calendar and timeline fit the viewport without unintended horizontal scrolling.
- [ ] Timeline scrolls horizontally with touch momentum and snaps on mobile.
- [ ] Modals and forms are full-width on phones and centered on larger screens.
- [ ] Lighthouse Mobile scores >=90 overall (Performance >=85, Accessibility >=95, Best Practices >=90, SEO >=90).

## Change Order Tracking

### Database setup

Create the helper, tables, and policies below (run once in Supabase).

```sql
create or replace function public.is_project_member(project_id uuid, user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.project_members pm
    where pm.project_id = project_id
      and pm.user_id = user_id
      and pm.status = 'accepted'
  );
$$;

revoke execute on function public.is_project_member(uuid, uuid) from public;
grant execute on function public.is_project_member(uuid, uuid) to authenticated;

create table if not exists public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  company_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_profiles_project_unique unique(project_id)
);

create table if not exists public.change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  amount numeric,
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decision_by uuid references auth.users(id),
  decision_at timestamptz,
  decision_notes text,
  client_signed_name text,
  client_signed_email text,
  client_signed_at timestamptz,
  client_signed_ip inet,
  client_decision_notes text,
  client_decision_source text,
  client_view_token_expires_at timestamptz,
  client_last_sent_at timestamptz,
  client_signature_url text,
  last_notification_at timestamptz
);

create table if not exists public.change_order_links (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.change_orders(id) on delete cascade,
  client_email text not null,
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'visited', 'completed', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  decision_at timestamptz,
  decision text check (decision in ('approved', 'denied', 'needs_info')),
  decision_notes text
);

alter table public.client_profiles enable row level security;
alter table public.change_orders enable row level security;
alter table public.change_order_links enable row level security;

create policy "Client profiles visible to project members"
on public.client_profiles
for select
to authenticated
using (
  public.is_project_member(client_profiles.project_id, auth.uid())
  or exists (
    select 1 from public.projects p
    where p.id = client_profiles.project_id
      and p.user_id = auth.uid()
  )
);

create policy "Owners manage client profiles"
on public.client_profiles
for insert
to authenticated
with check (
  exists (
    select 1 from public.projects p
    where p.id = client_profiles.project_id
      and p.user_id = auth.uid()
  )
);

create policy "Owners update client profiles"
on public.client_profiles
for update
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = client_profiles.project_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = client_profiles.project_id
      and p.user_id = auth.uid()
  )
);

create policy "Owners delete client profiles"
on public.client_profiles
for delete
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = client_profiles.project_id
      and p.user_id = auth.uid()
  )
);

create policy "Change orders visible to project members"
on public.change_orders
for select
to authenticated
using (
  public.is_project_member(change_orders.project_id, auth.uid())
  or exists (
    select 1 from public.projects p
    where p.id = change_orders.project_id
      and p.user_id = auth.uid()
  )
);

create policy "Members can create change orders"
on public.change_orders
for insert
to authenticated
with check (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = change_orders.project_id
      and pm.user_id = auth.uid()
      and pm.status = 'accepted'
      and pm.role in ('owner', 'editor')
  )
  or exists (
    select 1 from public.projects p
    where p.id = change_orders.project_id
      and p.user_id = auth.uid()
  )
);

create policy "Owners review change orders"
on public.change_orders
for update
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = change_orders.project_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = change_orders.project_id
      and p.user_id = auth.uid()
  )
);

create policy "Links visible to project members"
on public.change_order_links
for select
to authenticated
using (
  public.is_project_member(
    (select co.project_id from public.change_orders co where co.id = change_order_links.change_order_id),
    auth.uid()
  )
  or exists (
    select 1 from public.projects p
    where p.id = (select co.project_id from public.change_orders co where co.id = change_order_links.change_order_id)
      and p.user_id = auth.uid()
  )
);

create policy "Owners manage change order links"
on public.change_order_links
for insert, update
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = (select co.project_id from public.change_orders co where co.id = change_order_links.change_order_id)
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = (select co.project_id from public.change_orders co where co.id = change_order_links.change_order_id)
      and p.user_id = auth.uid()
  )
);
```

> Tip: create a public storage bucket (default `change-order-signatures`) if you plan to store client-drawn signatures.

### Workflow overview

1. Owners edit the client profile (company, contact, email) in the Change Orders panel.
2. Create change orders with title, description, estimated amount, and optional response-by date.
3. Click **Send to client** â€” the app generates a magic link, emails the client, and tracks the last send time.
4. Clients open `/change-order-response.html`, review the summary, sign (typed or drawn), and approve/deny/request more information.
5. The change order record is updated with client notes/signature, and owners receive an email notification.
6. Owners can resend the link or reset the status to pending at any time.