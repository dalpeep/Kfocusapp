-- Review only. Requires coordinated public predicates and administrator API
-- before this function may be exposed to the application.
begin;
alter table public.community_posts add column publish_ends_at timestamptz;

create function public.community_admin_set_publication_period_v1(
  p_id uuid,p_region text,p_expected_updated_at timestamptz,p_start date,p_end date
) returns void language plpgsql security invoker set search_path='' as $$
declare
  now_at timestamptz:=statement_timestamp();
  start_at timestamptz;
  end_at timestamptz;
begin
  if p_start is null or p_end is null or p_end<p_start or p_end>=date '9999-12-31' then
    raise exception 'Invalid publication dates' using errcode='22023';
  end if;
  start_at:=p_start::timestamp at time zone 'America/Chicago';
  end_at:=(p_end+1)::timestamp at time zone 'America/Chicago';
  update public.community_posts
    set publish_starts_at=start_at,
        publish_ends_at=end_at,
        expires_at=case when category in ('marketplace','housing','business_promotion') then end_at else expires_at end,
        cleanup_after=case when category in ('marketplace','housing') then end_at+interval '7 days'
          when category='business_promotion' then null else cleanup_after end,
        status=case when end_at>now_at then 'approved' else 'expired' end,
        updated_at=now_at
  where id=p_id and region=p_region and status in ('approved','expired')
    and updated_at=p_expected_updated_at;
  if not found then
    raise exception 'Publication period cannot be updated for this post' using errcode='40001';
  end if;
end;
$$;
revoke all on function public.community_admin_set_publication_period_v1(uuid,text,timestamptz,date,date)
  from public,anon,authenticated,service_role;
grant execute on function public.community_admin_set_publication_period_v1(uuid,text,timestamptz,date,date)
  to service_role;

do $$
declare
  f record;
  original text;
  revised text;
  total integer:=0;
  previous_guard text:='category <> ''business_promotion'' or publish_starts_at is null or (publish_starts_at <= now() and expires_at > now())';
  expanded_guard text:='(publish_ends_at is null or (publish_starts_at <= now() and publish_ends_at > now())) and (category <> ''business_promotion'' or publish_starts_at is null or (publish_starts_at <= now() and expires_at > now()))';
begin
  for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname ~ '^community_((list|get|comments)_public(_v[2-5])?|record_public_view)$'
  loop
    original:=pg_get_functiondef(f.oid);
    revised:=replace(original,previous_guard,expanded_guard);
    if revised=original then raise exception 'Unexpected community function definition: %',f.proname; end if;
    execute revised;
    total:=total+1;
  end loop;
  if total<>15 then raise exception 'Expected 15 public community functions, got %',total; end if;
end $$;
commit;
