-- READ ONLY: one SELECT, one result grid, suitable for one CSV export.
-- Run in Supabase SQL Editor as postgres, ONLY in:
-- Organization daltownmap-owner-test2 / Project owner-test
-- Expected project ref: aaikttogoejfvxbosktg (verify dashboard URL manually).
-- Database name/user do NOT independently prove the Supabase project identity.
-- No DDL, DML, RPC execution, temporary objects or application row export.
-- query_to_xml below executes only generated SELECTs for counts and bucket metadata.
-- Missing tables/columns/functions/buckets are reported as absent.
with
targets(schema_name,table_name) as (values
  ('public','owner_test_project_marker'),('public','profiles'),
  ('public','businesses'),('public','business_requests'),('public','coupons'),
  ('public','coupon_entries'),('public','coupon_redemptions'),
  ('public','event_draw_batches'),('public','event_draw_winners'),
  ('public','event_winner_email_attempts'),('public','posts'),
  ('public','business_specials'),('public','business_special_items'),
  ('public','community_posts'),('public','community_post_images'),
  ('public','community_comments'),('public','community_upload_drafts'),
  ('public','community_rate_limits'),('public','community_image_edit_requests'),
  ('public','community_image_cleanup_queue'),
  ('owner_phase1b_internal','policy_backup'),
  ('owner_phase1b_internal','grant_backup'),
  ('storage','buckets'),('storage','objects'),('auth','users')
),
tables as (
  select t.*,c.oid,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
    c.reltuples,c.relacl,c.relowner
  from targets t
  left join pg_catalog.pg_namespace n on n.nspname=t.schema_name
  left join pg_catalog.pg_class c on c.relnamespace=n.oid
    and c.relname=t.table_name and c.relkind in ('r','p','v','m','f')
),
required_columns(table_name,column_name,code_contract) as (values
  ('coupons','id','uuid: event-winner-admin UUID validation / event_draw_run(uuid,...)'),
  ('coupons','business_id','businesses.id-compatible; serialized as string by API'),
  ('coupons','business_ids','businesses.id-compatible array'),
  ('coupon_entries','id','uuid: event_draw_winners.entry_id foreign key'),
  ('coupon_entries','coupon_id','text: event_draw_run compares p_event_id::text'),
  ('coupon_entries','business_id','inspect actual type; API serializes string'),
  ('coupon_redemptions','id','inspect actual catalog; 06 proposes uuid'),
  ('coupon_redemptions','coupon_id','coupons.id-compatible; 06 proposes uuid'),
  ('coupon_redemptions','business_id','businesses.id-compatible'),
  ('event_draw_batches','id','uuid'),('event_draw_batches','event_id','uuid -> coupons.id'),
  ('event_draw_batches','drawn_by','uuid: auth user'),
  ('event_draw_winners','id','uuid'),('event_draw_winners','event_id','uuid -> coupons.id'),
  ('event_draw_winners','entry_id','uuid -> coupon_entries.id'),
  ('event_draw_winners','draw_batch_id','uuid -> event_draw_batches.id'),
  ('event_draw_winners','drawn_by','uuid'),('event_draw_winners','cancelled_by','uuid'),
  ('event_draw_winners','gift_card_marked_by','uuid'),
  ('event_winner_email_attempts','id','uuid'),
  ('event_winner_email_attempts','winner_id','uuid -> event_draw_winners.id'),
  ('event_winner_email_attempts','requested_by','uuid'),
  ('posts','id','inspect actual catalog; 06 baseline bigint'),
  ('posts','business_id','businesses.id-compatible'),
  ('businesses','id','inspect actual catalog; 06 baseline bigint'),
  ('business_specials','id','inspect actual catalog; 06 baseline bigint'),
  ('business_specials','business_id','businesses.id-compatible'),
  ('business_special_items','id','inspect actual catalog; 06 baseline bigint'),
  ('business_special_items','special_id','business_specials.id-compatible')
),
expected_functions(function_name) as (values
  ('community_rate_limit_take'),('community_touch_updated_at'),
  ('community_sync_comment_count'),('community_retention_guard'),
  ('community_list_public'),('community_get_public'),('community_comments_public'),
  ('community_list_public_v2'),('community_get_public_v2'),
  ('community_list_public_v3'),('community_get_public_v3'),('community_comments_public_v3'),
  ('community_list_public_v4'),('community_get_public_v4'),('community_comments_public_v4'),
  ('community_apply_post_image_edit'),('community_apply_post_video_image_edit'),
  ('community_apply_post_details_image_edit'),('community_apply_hidden_post_image_edit'),
  ('owner_test_community_create'),('owner_test_admin_access'),('phase1b_is_admin'),
  ('event_draw_run'),('event_winner_cancel'),('event_winner_email_begin'),
  ('event_winner_email_finish'),('event_winner_mark_gift_sent'),
  ('business_specials_admin_access'),('set_business_specials_updated_at'),
  ('set_business_special_items_updated_at')
),
functions as (
  select p.*,n.nspname,pg_catalog.pg_get_userbyid(p.proowner) as owner_name
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (
    p.proname in (select function_name from expected_functions)
    or p.proname ~ '(community|coupon|event_draw|event_winner|raffle|business_special|redemption|redeem)'
  )
),
endpoints(endpoint,implementation,db_dependency) as (values
  ('community-post-create','Netlify server CRUD + password hash + Turnstile',
    'community_rate_limit_take; community_posts; community_post_images; community_upload_drafts'),
  ('community-post-update','Netlify password validation + server CRUD / image RPC',
    'community_rate_limit_take; community_apply_post_details_image_edit; community_posts'),
  ('community-post-delete','Netlify password validation + server CRUD',
    'community_rate_limit_take; community_posts; media cleanup relations'),
  ('community-post-owner','Netlify password verification; not a dedicated DB RPC',
    'community_rate_limit_take; community_posts'),
  ('community-comment-create / community-comment-delete','Netlify server CRUD + password validation',
    'community_rate_limit_take; community_comments; community_sync_comment_count trigger'),
  ('community-upload-authorize','Netlify Storage signed upload; not a dedicated DB RPC',
    'community_rate_limit_take; community_upload_drafts; community-images bucket'),
  ('community-admin','Netlify admin verification + server CRUD',
    'profiles; Community tables; community_apply_post_details_image_edit'),
  ('event-winner-admin','Netlify admin verification + DB RPC',
    'event_draw_run; event_winner_cancel; event_winner_email_begin; event_winner_email_finish; event_winner_mark_gift_sent'),
  ('raffle-auto-draw (Test)','explicit admin POST -> event-winner-admin draw',
    'event_draw_run; no schedule; no direct-entry fallback'),
  ('coupon-campaign-enter / coupon-campaign-admin','Netlify server CRUD',
    'coupons; coupon_entries; coupon_redemptions; profiles'),
  ('coupon-used-notify','Netlify notification / Test dry-run; not a DB RPC',
    'no dedicated notification RPC'),
  ('coupon-redemptions-admin','Netlify admin verification + server CRUD',
    'coupon_redemptions; profiles')
),
-- Only aggregate counts are returned, never application row contents.
-- to_jsonb(row) allows counting even when an optional column is absent.
row_counts as (
  select t.schema_name,t.table_name,t.oid,x.total,x.non_test,x.test_auth_users
  from tables t
  left join lateral xmltable('/row' passing
    case when t.oid is not null and t.relkind in ('r','p') then
      pg_catalog.query_to_xml(
        format('select count(*)::text as total, %s as non_test, %s as test_auth_users from %I.%I r',
          case when t.schema_name='public' and t.table_name='coupons'
            then 'count(*) filter (where coalesce(to_jsonb(r)->>''title'','''') not like ''[TEST]%'')::text'
          when t.schema_name='public' and t.table_name='businesses'
            then 'count(*) filter (where coalesce(to_jsonb(r)->>''name_ko'','''') not like ''[TEST]%'')::text'
          else 'null::text' end,
          case when t.schema_name='auth' and t.table_name='users'
            then 'count(*) filter (where to_jsonb(r)->>''email'' in (''admin@test.invalid'',''user@test.invalid''))::text'
          else 'null::text' end,
          t.schema_name,t.table_name),false,true,'')
    else xmlparse(document '<row/>') end
    columns total text path 'total',non_test text path 'non_test',
      test_auth_users text path 'test_auth_users'
  ) x on true
  where t.table_name not in ('objects','buckets')
),
bucket_snapshot as (
  select x.payload::jsonb as payload
  from xmltable('/row' passing
    case when to_regclass('storage.buckets') is not null then
      pg_catalog.query_to_xml(
        'select coalesce(jsonb_agg(jsonb_build_object(''id'',b.id,''name'',b.name,''public'',b.public,''file_size_limit'',to_jsonb(b)->''file_size_limit'',''allowed_mime_types'',to_jsonb(b)->''allowed_mime_types'') order by b.id),''[]''::jsonb)::text as payload from storage.buckets b',
        false,true,'')
    else xmlparse(document '<row><payload>[]</payload></row>') end
    columns payload text path 'payload'
  ) x
),
buckets as (select b.value from bucket_snapshot s cross join lateral jsonb_array_elements(s.payload) b),
expected_buckets(bucket_id) as (values ('community-images'),('public-images'),
  ('media'),('business-media'),('coupon-media'),('banner-media'),('ktownad')),
report(section,object_name,field,status,value,details) as (
  select '00_context','database','session','info',current_database(),
    jsonb_build_object('current_user',current_user,'session_user',session_user,
      'captured_at',statement_timestamp(),'server_version',current_setting('server_version'),
      'transaction_read_only',current_setting('transaction_read_only'),
      'expected_organization','daltownmap-owner-test2','expected_project','owner-test',
      'expected_project_ref','aaikttogoejfvxbosktg',
      'identity_note','Verify dashboard URL; expected labels do not attest connection identity.')
  union all
  select '01_tables',schema_name||'.'||table_name,'relation',
    case when oid is null then 'absent' else 'present' end,
    relkind::text,jsonb_build_object('rls_enabled',relrowsecurity,
      'rls_forced',relforcerowsecurity,'owner',pg_catalog.pg_get_userbyid(relowner),
      'acl',relacl::text,'estimated_rows',reltuples)
  from tables
  union all
  select '02_required_id_types','public.'||r.table_name,r.column_name,
    case when t.oid is null then 'absent' when a.attnum is null then 'absent' else 'present' end,
    pg_catalog.format_type(a.atttypid,a.atttypmod),
    jsonb_build_object('missing_kind',case when t.oid is null then 'table' when a.attnum is null then 'column' end,
      'code_contract',r.code_contract,'not_null',a.attnotnull,'identity',a.attidentity)
  from required_columns r left join tables t on t.schema_name='public' and t.table_name=r.table_name
  left join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attname=r.column_name
    and a.attnum>0 and not a.attisdropped
  union all
  select '03_all_columns',t.schema_name||'.'||t.table_name,a.attname,'present',
    pg_catalog.format_type(a.atttypid,a.atttypmod),
    jsonb_build_object('position',a.attnum,'not_null',a.attnotnull,'identity',a.attidentity,
      'generated',a.attgenerated,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid))
  from tables t join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum>0 and not a.attisdropped
  left join pg_catalog.pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum
  where t.schema_name='public'
  union all
  select '04_constraints',t.schema_name||'.'||t.table_name,c.conname,'present',
    pg_catalog.pg_get_constraintdef(c.oid,true),
    jsonb_build_object('type',c.contype,'validated',c.convalidated,
      'referenced_table',c.confrelid::regclass::text)
  from pg_catalog.pg_constraint c join tables t on t.oid=c.conrelid
  union all
  -- Includes incoming FKs from tables outside the target list: relevant to ID conversion.
  select '05_incoming_coupon_fks',c.conrelid::regclass::text,c.conname,'present',
    pg_catalog.pg_get_constraintdef(c.oid,true),jsonb_build_object('validated',c.convalidated)
  from pg_catalog.pg_constraint c where c.contype='f' and c.confrelid=to_regclass('public.coupons')
  union all
  select '05_incoming_coupon_fks','public.coupons','incoming_fks','absent',null,null::jsonb
  where not exists(select 1 from pg_catalog.pg_constraint c
    where c.contype='f' and c.confrelid=to_regclass('public.coupons'))
  union all
  select '06_row_counts',schema_name||'.'||table_name,'exact_visible_count',
    case when oid is null then 'absent' when total is null then 'not_counted' else 'present' end,
    total,jsonb_build_object('non_test_name_or_title_rows',non_test,
      'required_admin_user_auth_count',test_auth_users,
      'note','Exact visible rows; run as postgres to avoid RLS-filtered counts.')
  from row_counts
  union all
  select '07_functions',f.nspname||'.'||f.proname,
    pg_catalog.pg_get_function_identity_arguments(f.oid),'present',
    pg_catalog.pg_get_function_result(f.oid),
    jsonb_build_object('arguments_with_defaults',pg_catalog.pg_get_function_arguments(f.oid),
      'kind',f.prokind,'security_definer',f.prosecdef,'owner',f.owner_name,
      'config',f.proconfig,'acl',f.proacl::text,
      'execute_anon',has_function_privilege('anon',f.oid,'EXECUTE'),
      'execute_authenticated',has_function_privilege('authenticated',f.oid,'EXECUTE'),
      'execute_service_role',has_function_privilege('service_role',f.oid,'EXECUTE'))
  from functions f where f.prokind in ('f','p','w')
  union all
  select '07_functions','public.'||e.function_name,'function','absent',null,null::jsonb
  from expected_functions e where not exists(select 1 from functions f where f.proname=e.function_name)
  union all
  select '08_server_endpoint_map',endpoint,'implementation','code_reference',implementation,
    jsonb_build_object('db_dependencies',db_dependency,'note','Static code map, not proof of deployed Function presence.')
  from endpoints
  union all
  select '09_triggers',t.schema_name||'.'||t.table_name,tr.tgname,'present',
    pg_catalog.pg_get_triggerdef(tr.oid,true),
    jsonb_build_object('enabled',tr.tgenabled,'function',tr.tgfoid::regprocedure::text)
  from tables t join pg_catalog.pg_trigger tr on tr.tgrelid=t.oid and not tr.tgisinternal
  union all
  select '10_indexes',t.schema_name||'.'||t.table_name,i.indexrelid::regclass::text,'present',
    pg_catalog.pg_get_indexdef(i.indexrelid),
    jsonb_build_object('unique',i.indisunique,'valid',i.indisvalid,'ready',i.indisready)
  from tables t join pg_catalog.pg_index i on i.indrelid=t.oid
  union all
  select '11_storage_buckets','storage.buckets',b.value->>'id','present',b.value->>'public',b.value
  from buckets b
  union all
  select '12_expected_buckets','storage.buckets',e.bucket_id,
    case when b.value is null then 'absent' else 'present' end,b.value->>'public',
    jsonb_build_object('bucket',b.value,'note','Baseline/code bucket IDs; section 11 lists all actual bucket names.')
  from expected_buckets e left join buckets b on b.value->>'id'=e.bucket_id
  union all
  select '12_storage_code_paths','business_specials','image_upload','code_reference',
    'cfg.STORAGE_BUCKET or public-images',
    jsonb_build_object('object_path_prefix','business-specials',
      'note','business-specials is an upload path prefix, not evidence of a separate bucket.')
  union all
  select '13_policies',p.schemaname||'.'||p.tablename,p.policyname,'present',p.cmd,
    jsonb_build_object('roles',p.roles,'permissive',p.permissive,'using',p.qual,'with_check',p.with_check)
  from pg_catalog.pg_policies p join targets t on t.schema_name=p.schemaname and t.table_name=p.tablename
  union all
  select '13_policies','storage.objects','policies','absent',null,null::jsonb
  where not exists(select 1 from pg_catalog.pg_policies where schemaname='storage' and tablename='objects')
  union all
  select '14_table_privileges',t.schema_name||'.'||t.table_name,r.role_name,
    case when t.oid is null then 'absent' else 'present' end,null,
    case when t.oid is null then null::jsonb else jsonb_build_object(
      'select',has_table_privilege(r.role_name,t.oid,'SELECT'),
      'insert',has_table_privilege(r.role_name,t.oid,'INSERT'),
      'update',has_table_privilege(r.role_name,t.oid,'UPDATE'),
      'delete',has_table_privilege(r.role_name,t.oid,'DELETE'),
      'truncate',has_table_privilege(r.role_name,t.oid,'TRUNCATE')) end
  from tables t cross join (values ('anon'),('authenticated'),('service_role')) r(role_name)
  union all
  select '15_extensions',e.extname,'version','present',e.extversion,
    jsonb_build_object('schema',n.nspname)
  from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace
  where e.extname in ('pgcrypto','uuid-ossp')
  union all
  select '16_coupon_dependencies',d.classid::regclass::text||':'||d.objid::text,
    'dependency','present',d.deptype::text,
    jsonb_build_object('object',pg_catalog.pg_describe_object(d.classid,d.objid,d.objsubid),
      'referenced_column_number',d.refobjsubid)
  from pg_catalog.pg_depend d where d.refclassid='pg_catalog.pg_class'::regclass
    and d.refobjid=to_regclass('public.coupons')
)
select section,object_name,field,status,value,details
from report
order by section,object_name,field;
