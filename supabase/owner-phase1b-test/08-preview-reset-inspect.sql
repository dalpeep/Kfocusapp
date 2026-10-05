-- READ ONLY exact-ID inventory BEFORE reset. Existing CSV contained counts only.
-- Any false fixture_match is BLOCKED; do not execute reset. No passwords/content exported.
with inventory(object_kind,object_id,label,proposed_action,fixture_match) as (
  select 'businesses',id::text,name_ko,'delete_fixture',name_ko like '[TEST]%' from public.businesses
  union all select 'coupons',id::text,title,'delete_fixture',title like '[TEST]%' from public.coupons
  union all select 'posts',id::text,title,'delete_fixture',title like '[TEST]%' from public.posts
  union all select 'business_requests',id::text,business_name,'delete_fixture',business_name like '[TEST]%' from public.business_requests
  union all select 'business_specials',id::text,title,'delete_fixture',title like '[TEST]%' from public.business_specials
  union all select 'business_special_items',id::text,item_name,'delete_fixture',item_name like '[TEST]%' from public.business_special_items
  union all select 'community_posts',id::text,title,'delete_fixture',
    title like '[TEST]%' and category='qna' and password_hash='test-only-hash' from public.community_posts
  union all select 'auth.users',id::text,email,'preserve_auth',email in
    ('admin@test.invalid','user@test.invalid','owner-a@test.invalid','owner-b@test.invalid') from auth.users
  union all select 'storage:'||bucket_id,id::text,name,'storage_api_remove',
    bucket_id in ('public-images','community-images')
    and name ~ '^migration-a/(before|after|rollback)-(anon|admin|service|protected)-[0-9]+[.]txt$'
    from storage.objects
)
select 'reset_inventory' as section,*,
  case when fixture_match is true then 'recognized_test_fixture' else 'BLOCKED_unrecognized' end as status
from inventory order by proposed_action,object_kind,object_id;
