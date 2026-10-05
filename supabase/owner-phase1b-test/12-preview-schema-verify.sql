-- READ ONLY after 06. One CSV result; no RPC invocation or application writes.
with wanted_tables(name) as (values
('businesses'),
('posts'),
('business_requests'),
('business_specials'),
('business_special_items'),
('coupons'),
('coupon_entries'),
('coupon_redemptions'),
('event_draw_batches'),
('event_draw_winners'),
('event_winner_email_attempts'),
('community_posts'),
('community_post_images'),
('community_comments'),
('community_upload_drafts'),
('community_rate_limits'),
('community_image_edit_requests'),
('community_image_cleanup_queue')
), wanted_types(table_name,column_name,type_name) as (values
('businesses','id','bigint'),
('posts','id','bigint'),
('posts','business_id','bigint'),
('business_specials','id','bigint'),
('business_specials','business_id','bigint'),
('business_special_items','id','bigint'),
('business_special_items','special_id','bigint'),
('coupons','id','uuid'),
('coupons','business_id','bigint'),
('coupons','business_ids','bigint[]'),
('coupon_entries','id','uuid'),
('coupon_entries','coupon_id','text'),
('coupon_entries','business_id','text'),
('coupon_redemptions','id','uuid'),
('coupon_redemptions','coupon_id','uuid'),
('coupon_redemptions','business_id','bigint'),
('event_draw_batches','id','uuid'),
('event_draw_batches','event_id','uuid'),
('event_draw_winners','id','uuid'),
('event_draw_winners','event_id','uuid'),
('event_draw_winners','entry_id','uuid'),
('event_draw_winners','draw_batch_id','uuid'),
('event_winner_email_attempts','id','uuid'),
('event_winner_email_attempts','winner_id','uuid'),
('community_posts','id','uuid')
), wanted_functions(signature) as (values
('public.community_touch_updated_at()'),
('public.community_sync_comment_count()'),
('public.community_list_public(text,text,text,integer,integer)'),
('public.community_get_public(uuid)'),
('public.community_comments_public(uuid)'),
('public.community_rate_limit_take(text,text,text,integer,integer)'),
('public.community_apply_post_image_edit(uuid,uuid,jsonb,jsonb,uuid,text)'),
('public.community_list_public_v2(text,text,text,integer,integer)'),
('public.community_get_public_v2(uuid)'),
('public.community_apply_post_video_image_edit(uuid,uuid,jsonb,jsonb,uuid,text)'),
('public.community_list_public_v3(text,text,text,integer,integer)'),
('public.community_get_public_v3(uuid)'),
('public.community_comments_public_v3(uuid)'),
('public.community_apply_post_details_image_edit(uuid,uuid,jsonb,jsonb,uuid,text)'),
('public.community_apply_hidden_post_image_edit(uuid,uuid,jsonb,jsonb,uuid,text)'),
('public.community_retention_guard()'),
('public.community_list_public_v4(text,text,text,integer,integer)'),
('public.community_get_public_v4(uuid)'),
('public.community_comments_public_v4(uuid)'),
('public.event_draw_run(uuid,integer,uuid,text)'),
('public.event_winner_cancel(uuid,uuid,text)'),
('public.event_winner_email_begin(uuid,uuid,text)'),
('public.event_winner_email_finish(uuid,text,text,text)'),
('public.event_winner_mark_gift_sent(uuid,uuid)'),
('public.set_business_specials_updated_at()'),
('public.business_specials_admin_access(text)'),
('public.set_business_special_items_updated_at()')
), table_counts as (
  select w.name,to_regclass('public.'||w.name) as relation,x.n
  from wanted_tables w left join lateral xmltable('/row' passing
    case when to_regclass('public.'||w.name) is not null then
      query_to_xml(format('select count(*)::text as n from public.%I',w.name),false,true,'')
    else xmlparse(document '<row/>') end columns n text path 'n') x on true
), result(section,object_name,status,actual,expected) as (
  select 'state','owner_test_preview_state',
    case when count(*)=1 and coalesce(bool_and(id=true
      and project_ref='aaikttogoejfvxbosktg' and phase='schema' and storage_ready=true),false)
    then 'PASS' else 'FAIL' end,
    coalesce(jsonb_agg(to_jsonb(s))::text,'[]'),'Test ref / schema / ready'
  from public.owner_test_preview_state s
  union all select 'tables_empty',name,
    case when relation is not null and n='0' then 'PASS' else 'FAIL' end,
    coalesce(n,'absent'),'0' from table_counts
  union all select 'ID_types',w.table_name||'.'||w.column_name,
    case when format_type(a.atttypid,a.atttypmod)=w.type_name then 'PASS' else 'FAIL' end,
    coalesce(format_type(a.atttypid,a.atttypmod),'absent'),w.type_name
  from wanted_types w left join pg_attribute a
    on a.attrelid=to_regclass('public.'||w.table_name)
      and a.attname=w.column_name and a.attnum>0 and not a.attisdropped
  union all select 'functions',signature,
    case when to_regprocedure(signature) is not null then 'PASS' else 'FAIL' end,
    coalesce(to_regprocedure(signature)::text,'absent'),'present'
  from wanted_functions
  union all select 'server_RPC_permissions',signature,
    case when to_regprocedure(signature) is not null
      and has_function_privilege('service_role',to_regprocedure(signature),'EXECUTE')
      and not has_function_privilege('anon',to_regprocedure(signature),'EXECUTE')
      and not has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE')
    then 'PASS' else 'FAIL' end,'catalog privileges','service only'
  from wanted_functions where signature like 'public.event_%'
    or signature like 'public.community_apply_%'
    or signature like 'public.community_rate_limit_take(%'
  union all select 'service_table_grants',w.name,
    case when to_regclass('public.'||w.name) is not null
      and has_table_privilege('service_role',to_regclass('public.'||w.name),'SELECT')
      and has_table_privilege('service_role',to_regclass('public.'||w.name),'INSERT')
      and has_table_privilege('service_role',to_regclass('public.'||w.name),'UPDATE')
    then 'PASS' else 'FAIL' end,'catalog privileges','service SELECT/INSERT/UPDATE'
  from wanted_tables w where w.name like 'community_%' or w.name like 'coupon_%' or w.name like 'event_%'
  union all select 'RLS',w.name,
    case when c.relrowsecurity then 'PASS' else 'FAIL' end,
    coalesce(c.relrowsecurity::text,'absent'),'true'
  from wanted_tables w left join pg_class c on c.oid=to_regclass('public.'||w.name)
  union all select 'triggers',v.table_name||'.'||v.trigger_name,
    case when exists(select 1 from pg_trigger t
      where t.tgrelid=to_regclass('public.'||v.table_name)
        and t.tgname=v.trigger_name and not t.tgisinternal and t.tgenabled<>'D')
    then 'PASS' else 'FAIL' end,'catalog lookup','present/enabled'
  from (values
    ('community_posts','community_posts_touch'),
    ('community_comments','community_comments_count'),
    ('community_posts','community_retention_guard_update'),
    ('business_specials','business_specials_set_updated_at'),
    ('business_special_items','business_special_items_set_updated_at')
  ) v(table_name,trigger_name)
  union all select 'Storage','objects',
    case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text,'0' from storage.objects
  union all select 'Storage','community-images.public',
    case when count(*)=1 and coalesce(bool_and(public),false) then 'PASS' else 'FAIL' end,
    coalesce(bool_and(public)::text,'absent'),'true'
    from storage.buckets where id='community-images'
  union all select 'Storage','bucket_count',
    case when count(*)=7 then 'PASS' else 'FAIL' end,count(*)::text,'7' from storage.buckets
  union all select 'Storage','policy_count',
    case when count(*)=26 then 'PASS' else 'FAIL' end,count(*)::text,'26' from pg_policies
    where schemaname='storage' and tablename='objects'
  union all select 'Auth','test_users',
    case when count(*)=4 and count(distinct email)=4 and count(*) filter(where email is null
      or email not in ('admin@test.invalid','user@test.invalid','owner-a@test.invalid','owner-b@test.invalid'))=0
    then 'PASS' else 'FAIL' end,count(*)::text,'4 known users' from auth.users
  union all select 'legacy_helper','owner_test_admin_access(bigint)',
    case when to_regprocedure('public.owner_test_admin_access(bigint)') is null then 'PASS' else 'FAIL' end,
    coalesce(to_regprocedure('public.owner_test_admin_access(bigint)')::text,'absent'),'absent'
)
select * from result order by section,object_name;
