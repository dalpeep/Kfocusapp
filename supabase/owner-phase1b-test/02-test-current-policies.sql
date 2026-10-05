-- TEST PROJECT ONLY: deliberately permissive legacy-policy SHAPE for Migration A.
-- Names/count match the inspected baseline; expressions are test emulations, not a Production dump.
begin;
do $$ begin
  if to_regclass('public.owner_test_project_marker') is null then
    raise exception 'Test Project marker missing';
  end if;
end $$;
create policy owner_test_profiles_self on public.profiles for select to authenticated
using(user_id=auth.uid());
create policy owner_test_business_public_read on public.businesses for select to anon,authenticated using(true);
create policy owner_test_coupon_public_read on public.coupons for select to anon,authenticated using(true);
create policy owner_test_posts_public_read on public.posts for select to anon,authenticated using(true);
create policy owner_test_business_request_public_insert on public.business_requests for insert to anon,authenticated with check(true);
create policy owner_test_community_no_direct_read on public.community_posts for select to service_role using(true);
create policy owner_test_community_no_direct_write on public.community_posts for all to service_role using(true) with check(true);
create policy owner_test_special_public_read on public.business_specials for select to anon using(is_active);
create policy owner_test_special_admin_all on public.business_specials for all to authenticated
using(public.owner_test_admin_access(business_id)) with check(public.owner_test_admin_access(business_id));
create policy owner_test_item_public_read on public.business_special_items for select to anon
using(exists(select 1 from public.business_specials s where s.id=special_id and s.is_active));
create policy owner_test_item_admin_all on public.business_special_items for all to authenticated
using(exists(select 1 from public.business_specials s where s.id=special_id and public.owner_test_admin_access(s.business_id)))
with check(exists(select 1 from public.business_specials s where s.id=special_id and public.owner_test_admin_access(s.business_id)));

do $$
declare p record; target_role text;
begin
  for p in select * from (values
    ('businesses','Authenticated delete businesses','DELETE'),
    ('businesses','Authenticated insert businesses','INSERT'),
    ('businesses','Authenticated update businesses','UPDATE'),
    ('businesses','Authenticated users can modify businesses','ALL'),
    ('businesses','admin write','ALL'),
    ('businesses','public delete businesses','DELETE'),
    ('businesses','public insert businesses','INSERT'),
    ('businesses','public update businesses','UPDATE'),
    ('coupons','Authenticated delete coupons','DELETE'),
    ('coupons','Authenticated insert coupons','INSERT'),
    ('coupons','Authenticated update coupons','UPDATE'),
    ('coupons','public delete coupons','DELETE'),
    ('coupons','public insert coupons','INSERT'),
    ('coupons','public update coupons','UPDATE'),
    ('posts','Authenticated delete posts','DELETE'),
    ('posts','Authenticated insert posts','INSERT'),
    ('posts','Authenticated update posts','UPDATE'),
    ('posts','Authenticated users can insert posts','INSERT'),
    ('posts','Users can delete own posts','DELETE'),
    ('posts','Users can update own posts','UPDATE'),
    ('posts','allow delete posts','DELETE'),
    ('posts','allow insert posts','INSERT'),
    ('posts','allow update posts','UPDATE'),
    ('business_requests','Allow authenticated delete business requests','DELETE'),
    ('business_requests','Allow authenticated read business requests','SELECT'),
    ('business_requests','Allow authenticated update business requests','UPDATE')
  ) v(tablename,policyname,cmd) loop
    target_role:=case when p.policyname ilike '%authenticated%' or p.policyname='admin write'
                      or p.policyname ilike 'Users can %' then 'authenticated' else 'anon' end;
    execute format('create policy %I on public.%I for %s to %s %s',
      p.policyname,p.tablename,p.cmd,target_role,
      case when p.cmd='INSERT' then 'with check (true)'
           when p.cmd in ('UPDATE','ALL') then 'using (true) with check (true)'
           else 'using (true)' end);
  end loop;
end $$;

-- Supabase Storage owns these managed tables. Test buckets use synthetic objects only.
insert into storage.buckets(id,name,public) values
 ('public-images','public-images',true),('media','media',true),
 ('business-media','business-media',true),('coupon-media','coupon-media',true),
 ('banner-media','banner-media',true),('ktownad','ktownad',true),
 ('community-images','community-images',false);
create policy owner_test_storage_public_read on storage.objects for select to anon,authenticated
using(bucket_id in ('public-images','media','business-media','coupon-media','banner-media','ktownad'));
create policy owner_test_community_signed_upload on storage.objects for insert to service_role
with check(bucket_id='community-images');
do $$
declare p record;
begin
  for p in select * from (values
    ('allow anon delete ktownad','DELETE'),
    ('allow anon delete on public-images','DELETE'),
    ('allow anon update on public-images','UPDATE'),
    ('allow anon upload ktownad','INSERT'),
    ('allow anon upload to public-images','INSERT'),
    ('anon upload banner images','INSERT'),
    ('anon upload business images','INSERT'),
    ('anon upload coupon images','INSERT'),
    ('media_banner_upload_authenticated','INSERT'),
    ('media_insert_anon 1ps738_0','INSERT'),
    ('media_insert_public 1ps738_0','INSERT'),
    ('media_insert_test','INSERT'),
    ('media_update_anon 1ps738_0','UPDATE'),
    ('media_update_test','UPDATE'),
    ('public-images delete authenticated','DELETE'),
    ('public-images insert authenticated','INSERT'),
    ('public-images update authenticated','UPDATE')
  ) v(policyname,cmd) loop
    execute format('create policy %I on storage.objects for %s to %s %s',
      p.policyname,p.cmd,
      case when p.policyname ilike '%authenticated%' then 'authenticated' else 'anon' end,
      case when p.cmd='INSERT' then 'with check (true)'
           when p.cmd='UPDATE' then 'using (true) with check (true)'
           else 'using (true)' end);
  end loop;
end $$;
grant truncate on storage.objects to anon,authenticated;
commit;
