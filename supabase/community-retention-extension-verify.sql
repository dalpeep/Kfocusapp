-- Read-only. Run after the retention migration and compare the aggregate
-- counts with a read-only pre-migration snapshot of community_posts.
select
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='community_posts'
      and column_name='expires_at' and data_type='timestamp with time zone') as expires_at_exists,
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='community_posts'
      and column_name='extension_count' and data_type='integer'
      and is_nullable='NO' and column_default='0') as extension_count_valid,
  exists (select 1 from pg_constraint
    where conrelid='public.community_posts'::regclass
      and conname='community_extension_count_check' and convalidated) as extension_constraint_valid,
  exists (select 1 from pg_constraint
    where conrelid='public.community_posts'::regclass
      and conname='community_marketplace_expiry_check' and convalidated) as expiry_constraint_valid,
  exists (select 1 from pg_class c join pg_index i on i.indexrelid=c.oid
    where c.oid=to_regclass('public.community_posts_retention_due_idx')
      and i.indisvalid and i.indisready) as retention_index_valid,
  exists (select 1 from pg_trigger
    where tgrelid='public.community_posts'::regclass
      and tgname='community_retention_guard_update'
      and not tgisinternal and tgenabled='O') as retention_trigger_enabled,
  to_regprocedure('public.community_retention_guard()') is not null as retention_guard_exists,
  to_regprocedure('public.community_list_public_v4(text,text,text,integer,integer)') is not null as list_v4_exists,
  to_regprocedure('public.community_get_public_v4(uuid)') is not null as detail_v4_exists,
  to_regprocedure('public.community_comments_public_v4(uuid)') is not null as comments_v4_exists,
  has_function_privilege('anon','public.community_list_public_v4(text,text,text,integer,integer)','EXECUTE') as anon_can_list_v4,
  has_function_privilege('anon','public.community_get_public_v4(uuid)','EXECUTE') as anon_can_get_v4,
  has_function_privilege('anon','public.community_comments_public_v4(uuid)','EXECUTE') as anon_can_get_comments_v4,
  has_function_privilege('authenticated','public.community_list_public_v4(text,text,text,integer,integer)','EXECUTE') as authenticated_can_list_v4,
  has_function_privilege('authenticated','public.community_get_public_v4(uuid)','EXECUTE') as authenticated_can_get_v4,
  has_function_privilege('authenticated','public.community_comments_public_v4(uuid)','EXECUTE') as authenticated_can_get_comments_v4;

-- Compare every count and category/status group with the pre-migration snapshot.
select
  count(*) as total_posts,
  count(*) filter (where category='marketplace') as marketplace_posts,
  count(*) filter (where category='housing') as housing_posts,
  count(*) filter (where category='housing' and expires_at is null) as legacy_housing_without_expiry,
  count(*) filter (where status in ('approved','sold')) as public_status_posts,
  count(*) filter (where extension_count<>0) as already_extended_posts,
  count(*) filter (where category in ('marketplace','housing')
    and status in ('approved','pending') and expires_at<=now()) as cleanup_due_now
from public.community_posts;

select category,status,count(*) as post_count
from public.community_posts
group by category,status
order by category,status;

-- Both counts must be zero: expiry is non-public; old housing with no
-- deadline remains public if it was previously approved.
select
  (select count(*) from public.community_posts p
    where p.category in ('marketplace','housing') and p.expires_at<=now()
      and exists (select 1 from public.community_get_public_v4(p.id)))
    as expired_visible_in_v4_detail,
  (select count(*) from public.community_posts p
    where p.category='housing' and p.status='approved' and p.expires_at is null
      and not exists (select 1 from public.community_get_public_v4(p.id)))
    as legacy_approved_housing_hidden_by_v4;
