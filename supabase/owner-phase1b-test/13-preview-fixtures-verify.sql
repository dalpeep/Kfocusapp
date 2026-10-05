-- READ ONLY after 07. Exact synthetic fixture inventory; one CSV result.
with expected(kind,id,label,link_id,variant) as (values
('businesses','1001','[TEST] Business A','1001','restaurant'),
('businesses','1002','[TEST] Business B','1002','retail'),
('coupons','00000000-0000-0000-0000-000000002101','[TEST] Display coupon','1001','display'),
('coupons','00000000-0000-0000-0000-000000002102','[TEST] Email coupon','1001','instant_email'),
('coupons','00000000-0000-0000-0000-000000002103','[TEST] Raffle coupon','1002','raffle'),
('posts','3101','[TEST] Event','1001','event'),
('business_specials','4101','[TEST] Lunch Special','1001','lunch_special'),
('business_specials','4102','[TEST] Happy Hour','1002','happy_hour'),
('business_special_items','5101','[TEST] Lunch item','4101','item'),
('business_special_items','5102','[TEST] Happy item','4102','item'),
('community_posts','00000000-0000-0000-0000-000000003101','[TEST] Community post',null,'qna')
), actual(kind,id,label,link_id,variant) as (
  select 'businesses',id::text,name_ko,id::text,category_ko from public.businesses
  union all select 'coupons',id::text,title,business_id::text,delivery_mode from public.coupons
  union all select 'posts',id::text,title,business_id::text,type from public.posts
  union all select 'business_specials',id::text,title,business_id::text,type from public.business_specials
  union all select 'business_special_items',id::text,item_name,special_id::text,'item' from public.business_special_items
  union all select 'community_posts',id::text,title,null,category from public.community_posts
), counts(table_name,expected_count) as (values
('businesses',2),
('coupons',3),
('posts',1),
('business_specials',2),
('business_special_items',2),
('community_posts',1),
('business_requests',0),
('coupon_entries',0),
('coupon_redemptions',0),
('event_draw_batches',0),
('event_draw_winners',0),
('event_winner_email_attempts',0),
('community_post_images',0),
('community_comments',0),
('community_upload_drafts',0),
('community_rate_limits',0),
('community_image_edit_requests',0),
('community_image_cleanup_queue',0)
), actual_counts as (
  select c.*,x.n from counts c left join lateral xmltable('/row' passing
    query_to_xml(format('select count(*)::text as n from public.%I',c.table_name),false,true,'')
    columns n text path 'n') x on true
), checks(section,object_name,passed,actual_value,expected_value) as (
  select 'fixtures',e.kind||':'||e.id,
    a.id is not null and a.label is not distinct from e.label
      and a.link_id is not distinct from e.link_id and a.variant is not distinct from e.variant,
    coalesce(to_jsonb(a)::text,'absent'),to_jsonb(e)::text
  from expected e left join actual a on a.kind=e.kind and a.id=e.id
  union all select 'counts',table_name,n=expected_count::text,n,expected_count::text from actual_counts
  union all select 'synthetic_only','fixture_inventory',
    not exists(select 1 from actual a left join expected e on e.kind=a.kind and e.id=a.id where e.id is null)
    and not exists(select 1 from actual where label is null or label not like '[TEST]%'),
    (select count(*)::text from actual),'11 exact synthetic rows'
  union all select 'state','preview',
    count(*)=1 and coalesce(bool_and(id=true and project_ref='aaikttogoejfvxbosktg'
      and phase='fixtures' and storage_ready=true),false),
    coalesce(jsonb_agg(to_jsonb(s))::text,'[]'),'Test ref / fixtures / ready'
  from public.owner_test_preview_state s
  union all select 'users',v.email,
    u.id is not null and p.user_id=u.id and p.role=v.role and p.area='dallas',
    jsonb_build_object('auth_id',u.id,'profile_user_id',p.user_id,'role',p.role,'area',p.area)::text,
    'Auth/profile linked / role='||v.role||' / dallas'
  from (values ('admin@test.invalid','super_admin'),('user@test.invalid','user'),
    ('owner-a@test.invalid','user'),('owner-b@test.invalid','user')) v(email,role)
  left join auth.users u on u.email=v.email left join public.profiles p on p.user_id=u.id
  union all select 'users','only_four_test_auth_users',
    count(*)=4 and count(distinct email)=4 and count(*) filter(where email is null or email not in
      ('admin@test.invalid','user@test.invalid','owner-a@test.invalid','owner-b@test.invalid'))=0,
    count(*)::text,'4' from auth.users
  union all select 'users','profiles_count',count(*)=4,count(*)::text,'4' from public.profiles
  union all select 'users','auth_ids_preserved',
    (select count(*) from public.owner_test_preview_manifest where action='preserve_auth')=4
    and not exists(select 1 from public.owner_test_preview_manifest m left join auth.users u on u.id::text=m.object_id
      where m.action='preserve_auth' and (u.id is null or u.email is distinct from m.label)),
    'pre-reset manifest comparison','same Auth IDs/emails'
  union all select 'coupons','multi_business_raffle',
    count(*)=1 and coalesce(bool_and(business_id=1002 and business_ids=array[1001,1002]::bigint[]
      and delivery_mode='raffle' and raffle_draw_mode='manual' and winner_count=1 and raffle_end_at>now()),false),
    coalesce(jsonb_agg(jsonb_build_object('id',id,'business_id',business_id,
      'business_ids',business_ids,'mode',delivery_mode,'draw_mode',raffle_draw_mode))::text,'[]'),
    'UUID 2103 / Business B / A+B / manual'
  from public.coupons where id='00000000-0000-0000-0000-000000002103'
  union all select 'coupons','business_links',
    not exists(select 1 from public.coupons c left join public.businesses b on b.id=c.business_id where b.id is null)
    and not exists(select 1 from public.coupons c cross join lateral unnest(c.business_ids) ids(id)
      left join public.businesses b on b.id=ids.id where b.id is null),
    'scalar and array business IDs','all refer to Business A/B'
  union all select 'coupons','active_dates',
    count(*)=3 and coalesce(bool_and(is_active and start_at<now() and end_at>now()),false),
    count(*)::text,'3 active coupons' from public.coupons
  union all select 'Special','items_linked',
    count(*)=2 and coalesce(bool_and((i.id=5101 and s.id=4101 and s.business_id=1001)
      or (i.id=5102 and s.id=4102 and s.business_id=1002)),false),
    count(*)::text,'2 items linked to expected Special/business'
  from public.business_special_items i left join public.business_specials s on s.id=i.special_id
  union all select 'Community','approved_display_fixture',
    count(*)=1 and coalesce(bool_and(status='approved' and approved_at is not null
      and region='dallas' and area='dallas' and password_hash='fixture-not-a-login-password'),false),
    coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'region',region,'area',area))::text,'[]'),
    'approved qna display fixture; password flows require fresh Function-created post'
  from public.community_posts
  union all select 'Storage','objects',count(*)=0,count(*)::text,'0' from storage.objects
  union all select 'Storage','buckets',count(*)=7,count(*)::text,'7' from storage.buckets
  union all select 'Storage','community_public',count(*)=1 and coalesce(bool_and(public),false),
    coalesce(bool_and(public)::text,'absent'),'true' from storage.buckets where id='community-images'
  union all select 'Storage','policies',count(*)=26,count(*)::text,'26' from pg_policies
    where schemaname='storage' and tablename='objects'
  union all select 'ID_types',v.table_name||'.'||v.column_name,
    format_type(a.atttypid,a.atttypmod)=v.type_name,
    coalesce(format_type(a.atttypid,a.atttypmod),'absent'),v.type_name
  from (values
    ('coupons','id','uuid'),('coupon_entries','id','uuid'),('coupon_entries','coupon_id','text'),
    ('coupon_redemptions','coupon_id','uuid'),('event_draw_batches','event_id','uuid'),
    ('event_draw_winners','event_id','uuid'),('event_draw_winners','entry_id','uuid'),
    ('event_draw_winners','draw_batch_id','uuid'),('event_winner_email_attempts','winner_id','uuid')
  ) v(table_name,column_name,type_name)
  left join pg_attribute a on a.attrelid=to_regclass('public.'||v.table_name)
    and a.attname=v.column_name and not a.attisdropped and a.attnum>0
  union all select 'UUID_FKs',v.child_table||'.'||v.child_column,
    exists(select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid
      and a.attname=v.child_column join pg_attribute pa on pa.attrelid=c.confrelid and pa.attname='id'
      where c.contype='f' and c.conrelid=to_regclass('public.'||v.child_table)
        and c.confrelid=to_regclass('public.'||v.parent_table)
        and c.conkey=array[a.attnum]::smallint[] and c.confkey=array[pa.attnum]::smallint[]
        and c.convalidated),
    'catalog FK check',v.parent_table||'.id'
  from (values
    ('coupon_redemptions','coupon_id','coupons'),('event_draw_batches','event_id','coupons'),
    ('event_draw_winners','event_id','coupons'),('event_draw_winners','entry_id','coupon_entries'),
    ('event_draw_winners','draw_batch_id','event_draw_batches'),
    ('event_winner_email_attempts','winner_id','event_draw_winners')
  ) v(child_table,child_column,parent_table)
)
select section,object_name,case when passed then 'PASS' else 'FAIL' end as status,
  actual_value as actual,expected_value as expected
from checks order by section,object_name;
