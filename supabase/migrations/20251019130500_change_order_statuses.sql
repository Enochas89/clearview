update public.change_orders
set status = 'needs_info'
where status = 'needs-info';

alter table public.change_orders
  drop constraint if exists change_orders_status_check;

alter table public.change_orders
  alter column status drop default;

alter table public.change_orders
  add constraint change_orders_status_check
  check (
    status in ('pending', 'approved', 'approved_with_conditions', 'denied', 'needs_info')
  );

alter table public.change_orders
  alter column status set default 'pending';
