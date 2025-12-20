alter table if exists public.change_orders
  add column if not exists line_items jsonb not null default '[]'::jsonb;
