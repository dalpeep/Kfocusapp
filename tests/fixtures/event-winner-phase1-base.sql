create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists public;
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  delivery_mode text not null default 'display',
  raffle_draw_mode text not null default 'manual'
);
create table public.coupon_entries (
  id uuid primary key default gen_random_uuid(),
  coupon_id text not null,
  email text not null,
  email_normalized text not null,
  entry_code text,
  status text not null default 'entered'
);
