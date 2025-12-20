alter table public.change_orders drop constraint if exists change_orders_created_by_fkey;

alter table public.change_orders 
add constraint change_orders_created_by_fkey 
foreign key (created_by) 
references auth.users (id) on delete set null;

alter table public.change_orders drop constraint if exists change_orders_responded_by_fkey;

alter table public.change_orders 
add constraint change_orders_responded_by_fkey 
foreign key (responded_by) 
references auth.users (id) on delete set null;
