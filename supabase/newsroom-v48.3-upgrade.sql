-- DalTownMap Newsroom V48.3 upgrade
-- Run once in Supabase SQL Editor before deploying the Edge Function.

create extension if not exists pgcrypto;

create table if not exists public.newsroom_scheduled_topics (
  id uuid primary key default gen_random_uuid(),
  region text not null default 'dallas',
  title text not null,
  search_query text not null,
  category text not null default 'shopping',
  priority integer not null default 2 check (priority between 1 and 3),
  recurrence text not null default 'daily' check (recurrence in ('daily','weekly','monthly','once')),
  days_of_week integer[] not null default '{}',
  day_of_month integer,
  run_date date,
  is_active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists newsroom_scheduled_topics_region_active_idx
  on public.newsroom_scheduled_topics(region, is_active, priority desc);

alter table public.newsroom_items
  add column if not exists event_data jsonb not null default '{}'::jsonb;

alter table public.newsroom_items
  add column if not exists category_keywords jsonb not null default '[]'::jsonb;

alter table public.newsroom_items
  add column if not exists priority_level text;

alter table public.newsroom_items
  add column if not exists priority_score integer not null default 0;

create index if not exists newsroom_items_selection_source_idx
  on public.newsroom_items ((event_data->>'selection_source'));

-- Edge Function uses the service-role key, so direct browser access is not required.
alter table public.newsroom_scheduled_topics enable row level security;
