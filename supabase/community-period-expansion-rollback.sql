-- Roll the web deploy back first. Keep the new dates and guard future content.
begin;
do $$
declare
  f record;
  original text;
  revised text;
  total integer:=0;
  added_guard text:='(publish_ends_at is null or (publish_starts_at <= now() and publish_ends_at > now())) and ';
begin
  if exists(select 1 from public.community_posts where publish_ends_at is not null
    and category<>'business_promotion' and status='approved'
    and (publish_starts_at>now() or publish_ends_at<=now())) then
    raise exception 'Keep the period guards until scheduled and elapsed posts are reconciled';
  end if;
  for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname ~ '^community_((list|get|comments)_public(_v[2-5])?|record_public_view)$'
  loop
    original:=pg_get_functiondef(f.oid);
    revised:=replace(original,added_guard,'');
    if revised=original then raise exception 'Unexpected community function definition: %',f.proname; end if;
    execute revised;
    total:=total+1;
  end loop;
  if total<>15 then raise exception 'Expected 15 public community functions, got %',total; end if;
end $$;
revoke execute on function public.community_admin_set_publication_period_v1(uuid,text,timestamptz,date,date)
  from service_role;
commit;
