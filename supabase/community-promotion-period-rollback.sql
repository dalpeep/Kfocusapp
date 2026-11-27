-- Roll back the web deployment first. Refuse to expose future posts early.
begin;
do $$
declare
  f record;
  original text;
  revised text;
  total integer:=0;
  source text:='public.community_posts p';
  windowed text:='(select * from public.community_posts where category <> ''business_promotion'' or publish_starts_at is null or (publish_starts_at <= now() and expires_at > now())) p';
  view_guard text:=' and (category <> ''business_promotion'' or publish_starts_at is null or (publish_starts_at <= now() and expires_at > now()))';
begin
  if exists(select 1 from public.community_posts where category='business_promotion' and status='approved'
    and publish_starts_at is not null and (publish_starts_at>now() or expires_at<=now())) then
    raise exception 'Keep visibility guards until scheduled or expired periods are reconciled';
  end if;
  for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname ~ '^community_((list|get|comments)_public(_v[2-5])?|record_public_view)$'
  loop
    original:=pg_get_functiondef(f.oid);
    revised:=case when f.proname='community_record_public_view' then replace(original,view_guard,'')
      else replace(original,windowed,source) end;
    if revised=original then raise exception 'Unexpected community function definition: %',f.proname; end if;
    execute revised;
    total:=total+1;
  end loop;
  if total<>15 then raise exception 'Expected 15 public community functions, got %',total; end if;
end $$;
revoke execute on function public.community_admin_set_promotion_period(uuid,text,timestamptz,date,date) from service_role;
-- Preserve saved dates for audit and recovery.
commit;
