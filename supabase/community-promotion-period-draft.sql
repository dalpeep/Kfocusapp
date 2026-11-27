begin;
alter table public.community_posts add column publish_starts_at timestamptz;

create function public.community_admin_set_promotion_period(
  p_id uuid,p_region text,p_expected_updated_at timestamptz,p_start date,p_end date
) returns void language plpgsql security invoker set search_path='' as $$
declare
  now_at timestamptz:=statement_timestamp();
  starts_at timestamptz;
  ends_at timestamptz;
begin
  if p_start is null or p_end is null or p_end<p_start or p_end>=date '9999-12-31' then
    raise exception 'Invalid publication dates' using errcode='22023';
  end if;
  starts_at:=p_start::timestamp at time zone 'America/Chicago';
  ends_at:=(p_end+1)::timestamp at time zone 'America/Chicago';
  update public.community_posts
    set publish_starts_at=starts_at,
        expires_at=ends_at,
        status=case when ends_at>now_at then 'approved' else 'expired' end,
        cleanup_after=null,
        updated_at=now_at
  where id=p_id and region=p_region and category='business_promotion'
    and status in ('approved','expired') and updated_at=p_expected_updated_at;
  if not found then
    raise exception 'Publication period cannot be updated for this post' using errcode='40001';
  end if;
end;
$$;
revoke all on function public.community_admin_set_promotion_period(uuid,text,timestamptz,date,date)
  from public,anon,authenticated,service_role;
grant execute on function public.community_admin_set_promotion_period(uuid,text,timestamptz,date,date) to service_role;

-- Preserve function identities, grants, return shapes and all existing filters.
do $$
declare
  f record;
  original text;
  revised text;
  total integer:=0;
  source text:='public.community_posts p';
  windowed text:='(select * from public.community_posts where category <> ''business_promotion'' or publish_starts_at is null or (publish_starts_at <= now() and expires_at > now())) p';
  view_anchor text:='and (status <> ''sold'' or category = ''marketplace'')';
  view_guard text:=' and (category <> ''business_promotion'' or publish_starts_at is null or (publish_starts_at <= now() and expires_at > now()))';
begin
  for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname ~ '^community_((list|get|comments)_public(_v[2-5])?|record_public_view)$'
  loop
    original:=pg_get_functiondef(f.oid);
    revised:=case when f.proname='community_record_public_view'
      then replace(original,view_anchor,view_anchor||view_guard)
      else replace(original,source,windowed) end;
    if revised=original then raise exception 'Unexpected community function definition: %',f.proname; end if;
    execute revised;
    total:=total+1;
  end loop;
  if total<>15 then raise exception 'Expected 15 public community functions, got %',total; end if;
end $$;
commit;
