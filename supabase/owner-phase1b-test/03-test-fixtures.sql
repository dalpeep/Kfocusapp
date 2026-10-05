-- TEST PROJECT ONLY. First create four synthetic Auth users in Dashboard:
-- admin@test.invalid, user@test.invalid, owner-a@test.invalid, owner-b@test.invalid.
-- Passwords belong in Dashboard/test runner environment, never in this file.
begin;
do $$ begin
  if to_regclass('public.owner_test_project_marker') is null then
    raise exception 'Test Project marker missing';
  end if;
  if (select count(*) from auth.users where email in
    ('admin@test.invalid','user@test.invalid','owner-a@test.invalid','owner-b@test.invalid')) <> 4 then
    raise exception 'Create all four synthetic Auth users in this Test Project first';
  end if;
end $$;
insert into public.profiles(user_id,role,area)
select id,case when email='admin@test.invalid' then 'super_admin' else 'user' end,'dallas'
from auth.users where email in
  ('admin@test.invalid','user@test.invalid','owner-a@test.invalid','owner-b@test.invalid');
insert into public.businesses(id,name_ko,region,area,category_ko) values
  (1001,'[TEST] Business A','dallas','Dallas','restaurant'),
  (1002,'[TEST] Business B','dallas','Dallas','retail');
insert into public.coupons(id,business_id,title,delivery_mode) values
  (2001,1001,'[TEST] A display coupon','display'),
  (2002,1002,'[TEST] B display coupon','display');
insert into public.posts(id,business_id,type,subtype,title,body) values
  (3001,1001,'event','general','[TEST] Event A','Synthetic event'),
  (3002,1002,'event','general','[TEST] Event B','Synthetic event');
insert into public.business_specials(id,business_id,type,title) values
  (4001,1001,'lunch_special','[TEST] Lunch'),
  (4002,1002,'happy_hour','[TEST] Happy Hour');
insert into public.business_special_items(id,special_id,item_name) values
  (5001,4001,'[TEST] Lunch item'),(5002,4002,'[TEST] Happy Hour item');
commit;
