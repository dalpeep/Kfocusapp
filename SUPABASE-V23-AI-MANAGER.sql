-- Optional production tables. The included UI works in localStorage until these are connected.
create table if not exists public.business_subscriptions (
  id uuid primary key default gen_random_uuid(), business_id uuid not null,
  plan text not null default 'free' check (plan in ('free','basic','business','premier')),
  billing_status text not null default 'prospect', monthly_price numeric(10,2) not null default 0,
  automation_mode text not null default 'review' check (automation_mode in ('manual','review','auto')),
  renewal_date date, stripe_customer_id text, stripe_subscription_id text,
  account_manager text, notes text, usage jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(business_id)
);
create table if not exists public.marketing_content_drafts (
  id uuid primary key default gen_random_uuid(), business_id uuid not null,
  content_type text not null check(content_type in ('coupon','banner','dalpick','guide','social','push','video')),
  title text, subtitle text, body text, image_url text, source text default 'ai',
  status text not null default 'draft' check(status in ('draft','approved','rejected','published')),
  approved_at timestamptz, published_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
