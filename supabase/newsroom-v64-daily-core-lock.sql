-- Daily Core의 지역/날짜별 OpenAI 생성을 Netlify 인스턴스 전체에서 한 번만 실행합니다.
create table if not exists public.daily_core_generation_locks (
  region text not null,
  date_key date not null,
  lock_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (region, date_key)
);

alter table public.daily_core_generation_locks enable row level security;

create or replace function public.claim_daily_core_generation_lock(
  p_region text,
  p_date_key date,
  p_lock_token uuid,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  insert into public.daily_core_generation_locks(region,date_key,lock_token,expires_at)
  values(lower(trim(p_region)),p_date_key,p_lock_token,now()+make_interval(secs=>greatest(p_ttl_seconds,30)))
  on conflict(region,date_key) do update
    set lock_token=excluded.lock_token,
        expires_at=excluded.expires_at,
        updated_at=now()
    where public.daily_core_generation_locks.expires_at<=now();
  get diagnostics affected = row_count;
  return affected=1;
end;
$$;

create or replace function public.release_daily_core_generation_lock(
  p_region text,
  p_date_key date,
  p_lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  delete from public.daily_core_generation_locks
  where region=lower(trim(p_region)) and date_key=p_date_key and lock_token=p_lock_token;
  get diagnostics affected = row_count;
  return affected=1;
end;
$$;

revoke all on function public.claim_daily_core_generation_lock(text,date,uuid,integer) from public, anon, authenticated;
revoke all on function public.release_daily_core_generation_lock(text,date,uuid) from public, anon, authenticated;
grant execute on function public.claim_daily_core_generation_lock(text,date,uuid,integer) to service_role;
grant execute on function public.release_daily_core_generation_lock(text,date,uuid) to service_role;
