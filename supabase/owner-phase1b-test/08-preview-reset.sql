-- PREPARED ONLY / NOT EXECUTED. owner-test fixture reset; NEVER Production.
-- Intended project: daltownmap-owner-test2 / owner-test / aaikttogoejfvxbosktg.
-- A boolean marker alone is insufficient: all guards below precede deletion.
-- Ref from platform settings is checked when available; otherwise the original
-- marker + exact disposable baseline + four test-only Auth identities are required.
-- After COMMIT inspect the manifest. Storage cleanup/public flag use the guarded
-- Storage API helper, NOT SQL deletion of storage.objects or auth.users.
begin;
do $$
declare t text; platform_ref text;
begin
  if current_user <> 'postgres' then raise exception 'SQL Editor postgres role required'; end if;
  platform_ref := nullif(current_setting('supabase.project_ref',true),'');
  if platform_ref is not null and platform_ref <> 'aaikttogoejfvxbosktg' then
    raise exception 'Wrong platform project ref';
  end if;
  if to_regclass('public.owner_test_project_marker') is null then
    raise exception 'Original disposable Test marker required';
  end if;
  if (select count(*) from public.owner_test_project_marker where id=true) <> 1 then
    raise exception 'Invalid original Test marker';
  end if;
  if to_regclass('owner_phase1b_internal.policy_backup') is not null
    or to_regclass('owner_phase1b_internal.grant_backup') is not null
    or to_regprocedure('public.phase1b_is_admin()') is not null
    or to_regclass('public.owner_test_preview_state') is not null then
    raise exception 'Expected rolled-back original baseline; reset is one-time only';
  end if;
  foreach t in array array['coupon_entries','coupon_redemptions','event_draw_batches',
    'event_draw_winners','event_winner_email_attempts','community_post_images',
    'community_comments','community_upload_drafts','community_rate_limits',
    'community_image_edit_requests','community_image_cleanup_queue'] loop
    if to_regclass('public.'||t) is not null then
      raise exception 'Unexpected Preview relation %. Review without resetting.',t;
    end if;
  end loop;
  lock table public.businesses,public.coupons,public.posts,public.business_requests,
    public.business_specials,public.business_special_items,public.community_posts,
    public.profiles in access exclusive mode;
  if (select count(*) from auth.users) <> 4 or exists(
    select 1 from auth.users where email is null or email not in
      ('admin@test.invalid','user@test.invalid','owner-a@test.invalid','owner-b@test.invalid'))
    or (select count(distinct email) from auth.users) <> 4 then
    raise exception 'Only the four known synthetic Auth users may exist';
  end if;
  if exists(select 1 from public.profiles p left join auth.users u on u.id=p.user_id
    where u.id is null or p.role not in ('super_admin','user') or p.area is distinct from 'dallas') then
    raise exception 'Unexpected profile data; preserve and review';
  end if;
  if (select count(*) from public.coupons) <> 6
    or (select count(*) from public.businesses) <> 6
    or (select count(*) from public.posts) <> 6
    or (select count(*) from public.business_requests) <> 20
    or (select count(*) from public.business_specials) <> 18
    or (select count(*) from public.business_special_items) <> 2
    or (select count(*) from public.community_posts) <> 5 then
    raise exception 'Fixture counts differ from supplied 2026-10-05 CSV; no deletion performed';
  end if;
  -- Exact 66 identities reviewed in the supplied inventory CSV (63 rows + 3 paths).
  if exists (
    with expected(object_kind,object_id) as (values
      ('business_requests','1'),
      ('business_requests','2'),
      ('business_requests','3'),
      ('business_requests','4'),
      ('business_requests','5'),
      ('business_requests','6'),
      ('business_requests','7'),
      ('business_requests','8'),
      ('business_requests','9'),
      ('business_requests','10'),
      ('business_requests','11'),
      ('business_requests','12'),
      ('business_requests','13'),
      ('business_requests','14'),
      ('business_requests','15'),
      ('business_requests','16'),
      ('business_requests','17'),
      ('business_requests','18'),
      ('business_requests','19'),
      ('business_requests','20'),
      ('business_special_items','5001'),
      ('business_special_items','5002'),
      ('business_specials','4001'),
      ('business_specials','4002'),
      ('business_specials','7004'),
      ('business_specials','7005'),
      ('business_specials','7104'),
      ('business_specials','7105'),
      ('business_specials','8004'),
      ('business_specials','8005'),
      ('business_specials','8104'),
      ('business_specials','8105'),
      ('business_specials','169046326'),
      ('business_specials','169046327'),
      ('business_specials','169046426'),
      ('business_specials','169046427'),
      ('business_specials','150426495'),
      ('business_specials','150426496'),
      ('business_specials','150426595'),
      ('business_specials','150426596'),
      ('businesses','1001'),
      ('businesses','1002'),
      ('businesses','1'),
      ('businesses','2'),
      ('businesses','6'),
      ('businesses','7'),
      ('community_posts','ad10e85d-8d27-45f8-8bdc-9265fe5afcc4'),
      ('community_posts','8f2cc9e3-b606-44e3-9175-9994a0c5df9b'),
      ('community_posts','e1c661d4-7075-4b8c-9692-65b59fa982da'),
      ('community_posts','b8fa3e4a-2c89-4d33-b7d5-80f9896700cc'),
      ('community_posts','9331c2db-8404-4feb-80be-626e4657b62e'),
      ('coupons','2001'),
      ('coupons','2002'),
      ('coupons','1'),
      ('coupons','2'),
      ('coupons','6'),
      ('coupons','7'),
      ('posts','3001'),
      ('posts','3002'),
      ('posts','1'),
      ('posts','2'),
      ('posts','6'),
      ('posts','7'),
      ('storage:public-images','migration-a/after-protected-1791089841006.txt'),
      ('storage:public-images','migration-a/after-protected-1791091355756.txt'),
      ('storage:public-images','migration-a/after-protected-1791091543255.txt')
    ), actual as (
      select 'businesses'::text as object_kind,id::text as object_id from public.businesses
      union all
      select 'coupons'::text as object_kind,id::text as object_id from public.coupons
      union all
      select 'posts'::text as object_kind,id::text as object_id from public.posts
      union all
      select 'business_requests'::text as object_kind,id::text as object_id from public.business_requests
      union all
      select 'business_specials'::text as object_kind,id::text as object_id from public.business_specials
      union all
      select 'business_special_items'::text as object_kind,id::text as object_id from public.business_special_items
      union all
      select 'community_posts'::text as object_kind,id::text as object_id from public.community_posts
      union all select 'storage:'||bucket_id,name from storage.objects
    )
    select 1 from (
      (select * from actual except select * from expected)
      union all
      (select * from expected except select * from actual)
    ) difference
  ) then
    raise exception 'Reviewed inventory identities changed; no deletion performed';
  end if;
  if exists(select 1 from public.coupons where title is null or title not like '[TEST]%')
    or exists(select 1 from public.businesses where name_ko is null or name_ko not like '[TEST]%')
    or exists(select 1 from public.posts where title is null or title not like '[TEST]%')
    or exists(select 1 from public.business_requests where business_name is null or business_name not like '[TEST]%')
    or exists(select 1 from public.business_specials where title is null or title not like '[TEST]%')
    or exists(select 1 from public.business_special_items where item_name is null or item_name not like '[TEST]%')
    or exists(select 1 from public.community_posts where title is null or title not like '[TEST]%'
      or category <> 'qna' or password_hash <> 'test-only-hash') then
    raise exception 'Unrecognized/customer-like row found; entire reset refused';
  end if;
  if (select format_type(atttypid,atttypmod) from pg_attribute
      where attrelid='public.coupons'::regclass and attname='id' and not attisdropped) <> 'bigint'
    or exists(select 1 from pg_constraint where contype='f' and confrelid in
      ('public.coupons'::regclass,'public.community_posts'::regclass)) then
    raise exception 'Unexpected coupon/Community structure or incoming FK';
  end if;
  -- Never let parent deletion cascade into a table outside the guarded fixture set.
  if exists(select 1 from pg_constraint c where c.contype='f'
    and c.confrelid in ('public.businesses'::regclass,'public.posts'::regclass,
      'public.business_requests'::regclass,'public.business_specials'::regclass,
      'public.business_special_items'::regclass)
    and c.conrelid not in ('public.coupons'::regclass,'public.posts'::regclass,
      'public.business_specials'::regclass,'public.business_special_items'::regclass)) then
    raise exception 'External fixture-table dependency; no cascading cleanup permitted';
  end if;
  if exists(select 1 from storage.buckets where id not in
    ('public-images','community-images','media','business-media','coupon-media','banner-media','ktownad'))
    or (select count(*) from storage.buckets) <> 7 then
    raise exception 'Unexpected buckets; no Storage reset allowed';
  end if;
  -- Previous runner creates only these .txt objects, with body test/seed/tamper.
  -- Anything else is preserved and BLOCKS reset rather than being guessed disposable.
  if exists(select 1 from storage.objects where bucket_id not in ('public-images','community-images')
    or name !~ '^migration-a/(before|after|rollback)-(anon|admin|service|protected)-[0-9]+[.]txt$') then
    raise exception 'Unrecognized Storage object; obtain inventory before cleanup';
  end if;
  if (select count(*) from storage.objects)>500 then
    raise exception 'Unexpectedly large Storage fixture set; refuse bounded manifest cleanup';
  end if;
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname not in ('allow anon delete ktownad','allow anon delete on public-images',
      'allow anon update on public-images','allow anon upload ktownad','allow anon upload to public-images',
      'anon upload banner images','anon upload business images','anon upload coupon images',
      'media_banner_upload_authenticated','media_insert_anon 1ps738_0','media_insert_public 1ps738_0',
      'media_insert_test','media_update_anon 1ps738_0','media_update_test',
      'public-images delete authenticated','public-images insert authenticated','public-images update authenticated',
      'owner_test_community_signed_upload','owner_test_storage_public_read')) then
    raise exception 'Unknown Storage policy; refuse to overwrite';
  end if;
end $$;

create table public.owner_test_preview_state (
  id boolean primary key default true check(id),
  project_ref text not null check(project_ref='aaikttogoejfvxbosktg'),
  phase text not null check(phase in ('reset','schema','fixtures')),
  storage_ready boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.owner_test_preview_manifest (
  object_kind text not null,
  object_id text not null,
  label text,
  action text not null check(action in ('delete_fixture','storage_api_remove','preserve_auth')),
  primary key(object_kind,object_id)
);
alter table public.owner_test_preview_state enable row level security;
alter table public.owner_test_preview_manifest enable row level security;
revoke all on public.owner_test_preview_state,public.owner_test_preview_manifest from public,anon,authenticated;
grant select,update on public.owner_test_preview_state to service_role;
grant select on public.owner_test_preview_manifest to service_role;
insert into public.owner_test_preview_state(id,project_ref,phase) values(true,'aaikttogoejfvxbosktg','reset');

insert into public.owner_test_preview_manifest(object_kind,object_id,label,action)
select 'businesses',id::text,name_ko,'delete_fixture' from public.businesses
union all select 'coupons',id::text,title,'delete_fixture' from public.coupons
union all select 'posts',id::text,title,'delete_fixture' from public.posts
union all select 'business_requests',id::text,business_name,'delete_fixture' from public.business_requests
union all select 'business_specials',id::text,title,'delete_fixture' from public.business_specials
union all select 'business_special_items',id::text,item_name,'delete_fixture' from public.business_special_items
union all select 'community_posts',id::text,title,'delete_fixture' from public.community_posts
union all select 'storage:'||bucket_id,name,null,'storage_api_remove' from storage.objects
union all select 'auth.users',id::text,email,'preserve_auth' from auth.users;

-- Explicit dependency order, no TRUNCATE/CASCADE, no deletion of Auth or Storage metadata.
delete from public.business_special_items where item_name like '[TEST]%';
delete from public.business_specials where title like '[TEST]%';
delete from public.coupons where title like '[TEST]%';
delete from public.posts where title like '[TEST]%';
delete from public.community_posts where title like '[TEST]%' and category='qna' and password_hash='test-only-hash';
delete from public.business_requests where business_name like '[TEST]%';
delete from public.businesses where name_ko like '[TEST]%';

-- Remove only minimal fixture objects; unexpected dependencies abort via RESTRICT.
drop function public.owner_test_community_create(text,text) restrict;
drop table public.community_posts restrict;
drop table public.coupons restrict;
drop policy owner_test_item_admin_all on public.business_special_items;
drop policy owner_test_item_public_read on public.business_special_items;
drop policy owner_test_special_admin_all on public.business_specials;
drop policy owner_test_special_public_read on public.business_specials;
drop function public.owner_test_admin_access(bigint) restrict;

-- Replace ALL user-facing Storage policies so no permissive policy can bypass
-- the permanent Community denial. Preserve the 17 legacy policy NAMES required
-- by Migration A, but restrict their unsafe emulation to a disposable namespace.
do $$
declare p record; role_name text; predicate text;
begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop
    execute format('drop policy %I on storage.objects',p.policyname);
  end loop;
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
    role_name := case when p.policyname ilike '%authenticated%' then 'authenticated' else 'anon' end;
    predicate := 'bucket_id = ''public-images'' and name like ''migration-a/%''';
    execute format('create policy %I on storage.objects for %s to %I %s',
      p.policyname,p.cmd,role_name,
      case when p.cmd='INSERT' then 'with check ('||predicate||')'
      when p.cmd='UPDATE' then 'using ('||predicate||') with check ('||predicate||')'
      else 'using ('||predicate||')' end);
  end loop;
end $$;
-- RESTRICTIVE policy remains across Migration A; anon/non-admin writes to
-- Community and unrelated buckets can never be OR-ed into existence.
create policy owner_test_preview_storage_write_boundary on storage.objects as restrictive
  for all to anon,authenticated
  using (bucket_id in ('public-images','community-images','business-media','coupon-media'))
  with check (bucket_id in ('public-images','business-media','coupon-media'));
create policy owner_test_preview_community_no_browser_write on storage.objects as restrictive
  for insert to anon,authenticated with check(bucket_id <> 'community-images');
create policy owner_test_preview_community_no_browser_update on storage.objects as restrictive
  for update to anon,authenticated using(bucket_id <> 'community-images') with check(bucket_id <> 'community-images');
create policy owner_test_preview_community_no_browser_delete on storage.objects as restrictive
  for delete to anon,authenticated using(bucket_id <> 'community-images');
create policy owner_test_preview_image_public_read on storage.objects for select to anon,authenticated
  using(bucket_id in ('public-images','community-images','business-media','coupon-media'));
create policy owner_test_preview_image_admin_insert on storage.objects for insert to authenticated
  with check(bucket_id in ('public-images','business-media','coupon-media') and exists(
    select 1 from public.profiles p where p.user_id=auth.uid() and p.role in ('super_admin','regional_editor')));
create policy owner_test_preview_image_admin_update on storage.objects for update to authenticated
  using(bucket_id in ('public-images','business-media','coupon-media') and exists(
    select 1 from public.profiles p where p.user_id=auth.uid() and p.role in ('super_admin','regional_editor')))
  with check(bucket_id in ('public-images','business-media','coupon-media') and exists(
    select 1 from public.profiles p where p.user_id=auth.uid() and p.role in ('super_admin','regional_editor')));
create policy owner_test_preview_image_admin_delete on storage.objects for delete to authenticated
  using(bucket_id in ('public-images','business-media','coupon-media') and exists(
    select 1 from public.profiles p where p.user_id=auth.uid() and p.role in ('super_admin','regional_editor')));
create policy owner_test_community_signed_upload on storage.objects for insert to service_role
  with check(bucket_id='community-images');

do $$ begin
  if exists(select 1 from public.businesses) or exists(select 1 from public.posts)
    or exists(select 1 from public.business_requests) or exists(select 1 from public.business_specials)
    or exists(select 1 from public.business_special_items) then raise exception 'Fixture reset incomplete'; end if;
end $$;
commit;

-- One result grid identifies EVERY selected fixture and exact Storage path.
select object_kind,object_id,label,action from public.owner_test_preview_manifest
order by action,object_kind,object_id;
