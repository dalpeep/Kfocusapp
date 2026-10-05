-- READ ONLY stage verification. One result grid; run after each authorized stage.
-- Also rerun 08-readonly-catalog.sql after 06 and 07 for actual types/RPCs/RLS.
with wanted(table_name,after_08,after_06,after_07) as (values
  ('businesses',0,0,2),('posts',0,0,1),('business_requests',0,0,0),
  ('business_specials',0,0,2),('business_special_items',0,0,2),
  ('coupons',null,0,3),('coupon_entries',null,0,0),('coupon_redemptions',null,0,0),
  ('event_draw_batches',null,0,0),('event_draw_winners',null,0,0),
  ('event_winner_email_attempts',null,0,0),('community_posts',null,0,1),
  ('community_comments',null,0,0),('community_post_images',null,0,0)
), counts as (
  select w.*,x.n from wanted w left join lateral xmltable('/row' passing
    case when to_regclass('public.'||w.table_name) is not null then
      query_to_xml(format('select count(*)::text as n from public.%I',w.table_name),false,true,'')
    else xmlparse(document '<row/>') end columns n text path 'n') x on true
), result(section,object_name,status,value,details) as (
  select 'state','owner_test_preview_state','info',s.phase,
    jsonb_build_object('project_ref',s.project_ref,'storage_ready',s.storage_ready) from public.owner_test_preview_state s
  union all select 'counts','public.'||c.table_name,
    case when c.n is null then 'absent' else 'present' end,c.n,
    jsonb_build_object('expected_after_08',c.after_08,'expected_after_06',c.after_06,'expected_after_07',c.after_07) from counts c
  union all select 'auth','auth.users','info',count(*)::text,
    jsonb_build_object('expected',4,'unexpected',count(*) filter(where email is null or email not in
      ('admin@test.invalid','user@test.invalid','owner-a@test.invalid','owner-b@test.invalid'))) from auth.users
  union all select 'storage','storage.objects','info',count(*)::text,jsonb_build_object('expected_after_API',0) from storage.objects
  union all select 'storage','community-images','info',public::text,null::jsonb from storage.buckets where id='community-images'
  union all select 'manifest',action,'info',count(*)::text,null::jsonb from public.owner_test_preview_manifest group by action
)
select * from result order by section,object_name;
