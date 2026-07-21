-- DalPick compatibility migration
-- Safe to run more than once. It preserves existing data.

alter table public.dalpick add column if not exists region text default 'dallas';
alter table public.dalpick add column if not exists start_at timestamptz;
alter table public.dalpick add column if not exists end_at timestamptz;
alter table public.dalpick add column if not exists priority integer default 0;
alter table public.dalpick add column if not exists is_featured boolean default false;
alter table public.dalpick add column if not exists is_active boolean default true;
alter table public.dalpick add column if not exists updated_at timestamptz default now();

-- Copy values from earlier column names when those columns exist.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='dalpick' and column_name='start_date') then
    execute 'update public.dalpick set start_at = coalesce(start_at, start_date)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='dalpick' and column_name='end_date') then
    execute 'update public.dalpick set end_at = coalesce(end_at, end_date)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='dalpick' and column_name='featured') then
    execute 'update public.dalpick set is_featured = coalesce(featured, false) where is_featured is distinct from coalesce(featured, false)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='dalpick' and column_name='status') then
    execute $q$update public.dalpick set is_active = case when lower(coalesce(status,'')) in ('published','active') then true else false end$q$;
  end if;
end $$;

update public.dalpick set region='dallas' where region is null or btrim(region)='';
update public.dalpick set priority=0 where priority is null;
update public.dalpick set is_featured=false where is_featured is null;
update public.dalpick set is_active=true where is_active is null;

create index if not exists dalpick_region_active_idx
  on public.dalpick(region, is_active, is_featured, priority, created_at desc);

alter table public.dalpick enable row level security;

drop policy if exists "dalpick public read" on public.dalpick;
create policy "dalpick public read"
on public.dalpick for select
to anon, authenticated
using (
  is_active = true
  and (start_at is null or start_at <= now())
  and (end_at is null or end_at >= now())
);

drop policy if exists "dalpick admin select" on public.dalpick;
create policy "dalpick admin select"
on public.dalpick for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('super_admin','admin','regional_admin')
  )
);

drop policy if exists "dalpick admin insert" on public.dalpick;
create policy "dalpick admin insert"
on public.dalpick for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('super_admin','admin','regional_admin')
  )
);

drop policy if exists "dalpick admin update" on public.dalpick;
create policy "dalpick admin update"
on public.dalpick for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('super_admin','admin','regional_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('super_admin','admin','regional_admin')
  )
);

drop policy if exists "dalpick admin delete" on public.dalpick;
create policy "dalpick admin delete"
on public.dalpick for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('super_admin','admin','regional_admin')
  )
);
