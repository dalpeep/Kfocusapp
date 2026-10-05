-- TEST PROJECT ONLY. Synthetic fixtures; this file has NOT been run.
-- Prerequisite: 08 reset + Storage API verification + self-contained 06 schema.
begin;
do $$ begin
  if to_regclass('public.owner_test_project_marker') is null then
    raise exception 'Not the disposable owner-test project';
  end if;
  if not exists(select 1 from public.owner_test_preview_state where id=true
    and project_ref='aaikttogoejfvxbosktg' and phase='schema' and storage_ready=true) then
    raise exception 'Verified 06 schema phase required; fixture SQL is one-time only';
  end if;
  lock table public.businesses,public.coupons,public.posts,public.business_specials,
    public.business_special_items,public.community_posts in access exclusive mode;
  if exists(select 1 from public.businesses) or exists(select 1 from public.coupons)
    or exists(select 1 from public.posts) or exists(select 1 from public.business_specials)
    or exists(select 1 from public.business_special_items) or exists(select 1 from public.community_posts) then
    raise exception 'Fixture tables must be empty; refusing collisions or mixed data';
  end if;
  if (select format_type(atttypid,atttypmod) from pg_attribute
      where attrelid='public.coupons'::regclass and attname='id' and not attisdropped) <> 'uuid'
    or to_regprocedure('public.event_draw_run(uuid,integer,uuid,text)') is null
    or to_regprocedure('public.community_get_public_v3(uuid)') is null
    or to_regprocedure('public.business_specials_admin_access(text)') is null then
    raise exception 'Complete 06 Preview schema is required';
  end if;
  if (select count(*) from auth.users) <> 4 or (select count(*) from auth.users where email in
    ('admin@test.invalid','user@test.invalid','owner-a@test.invalid','owner-b@test.invalid')) <> 4 then
    raise exception 'Retain exactly the four synthetic Test Auth users';
  end if;
  if exists(select 1 from public.businesses where name_ko not like '[TEST]%') then
    raise exception 'Non-synthetic business rows found';
  end if;
end $$;

-- Retain Auth IDs/passwords; normalize only their Test profile roles.
insert into public.profiles(user_id,role,area)
select id,case when email='admin@test.invalid' then 'super_admin' else 'user' end,'dallas'
from auth.users where email in ('admin@test.invalid','user@test.invalid','owner-a@test.invalid','owner-b@test.invalid')
on conflict(user_id) do update set role=excluded.role,area=excluded.area;

insert into public.businesses(id,name_ko,region,area,category_ko) values
  (1001,'[TEST] Business A','dallas','Dallas','restaurant'),
  (1002,'[TEST] Business B','dallas','Dallas','retail')
on conflict(id) do nothing;

insert into public.coupons(id,business_id,business_ids,title,delivery_mode,discount_label,
  start_at,end_at,raffle_end_at,winner_count,raffle_draw_mode,is_active,notify_emails) values
  ('00000000-0000-0000-0000-000000002101',1001,array[1001],'[TEST] Display coupon','display','10% OFF',now()-interval '1 day',now()+interval '30 days',null,1,'manual',true,'admin@example.com'),
  ('00000000-0000-0000-0000-000000002102',1001,array[1001],'[TEST] Email coupon','instant_email','Free test item',now()-interval '1 day',now()+interval '30 days',null,1,'manual',true,'admin@example.com'),
  ('00000000-0000-0000-0000-000000002103',1002,array[1001,1002]::bigint[],'[TEST] Raffle coupon','raffle','Test prize',now()-interval '1 day',now()+interval '30 days',now()+interval '7 days',1,'manual',true,'admin@example.com')
on conflict(id) do nothing;

insert into public.posts(id,business_id,type,subtype,title,body,content,region,
  is_active,start_at,end_at) values
  (3101,1001,'event','general','[TEST] Event','Synthetic event only','Synthetic event only',
   'dallas',true,now()-interval '1 day',now()+interval '30 days')
on conflict(id) do nothing;

insert into public.business_specials(id,business_id,type,title,description,price_text,
  days_of_week,start_time,end_time,is_active,sort_order) values
  (4101,1001,'lunch_special','[TEST] Lunch Special','Synthetic lunch','$9.99',
   array[1,2,3,4,5]::smallint[],'11:00','14:00',true,10),
  (4102,1002,'happy_hour','[TEST] Happy Hour','Synthetic offer','$5.00',
   array[1,2,3,4,5]::smallint[],'16:00','18:00',true,20)
on conflict(id) do nothing;
insert into public.business_special_items(id,special_id,item_name,description,price_text,sort_order) values
  (5101,4101,'[TEST] Lunch item','Synthetic item','$9.99',10),
  (5102,4102,'[TEST] Happy item','Synthetic item','$5.00',20)
on conflict(id) do nothing;

-- This row is for list rendering only. Password edit/delete must be tested by
-- creating a fresh post through the real Function; no reusable password here.
insert into public.community_posts(id,region,area,category,title,body,author_name,password_hash,status,approved_at)
values('00000000-0000-0000-0000-000000003101','dallas','dallas','qna',
  '[TEST] Community post','Synthetic community content','[TEST] Author',
  'fixture-not-a-login-password','approved',now())
on conflict(id) do nothing;
update public.owner_test_preview_state set phase='fixtures' where id=true;
-- Explicit fixture IDs must not collide with later browser-generated identity IDs.
select setval(pg_get_serial_sequence('public.businesses','id'),(select max(id) from public.businesses),true);
select setval(pg_get_serial_sequence('public.posts','id'),(select max(id) from public.posts),true);
select setval(pg_get_serial_sequence('public.business_specials','id'),(select max(id) from public.business_specials),true);
select setval(pg_get_serial_sequence('public.business_special_items','id'),(select max(id) from public.business_special_items),true);
commit;
