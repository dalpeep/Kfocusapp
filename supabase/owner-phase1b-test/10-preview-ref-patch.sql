-- SUPERSEDED: supplied catalog proves state and CHECK already have the correct 20-character ref.
-- No patch required. READ ONLY verification only; no transaction or mutation.
-- READ ONLY verification after 10-preview-ref-patch.sql.
with ref_checks as (
  select pg_get_constraintdef(c.oid) as definition,
    regexp_replace(pg_get_expr(c.conbin,c.conrelid),'[[:space:]()]','','g') as expression
  from pg_constraint c
  join pg_attribute a on a.attrelid=c.conrelid and a.attname='project_ref'
  where c.conrelid='public.owner_test_preview_state'::regclass
    and c.contype='c' and a.attnum=any(c.conkey)
), checks(name,passed,actual) as (
  select 'state_ref',
    count(*)=1 and coalesce(bool_and(id=true and project_ref='aaikttogoejfvxbosktg'),false),
    coalesce(jsonb_agg(to_jsonb(s))::text,'[]')
  from public.owner_test_preview_state s
  union all
  select 'CHECK_ref',
    count(*)=1 and coalesce(bool_and(expression='project_ref=''aaikttogoejfvxbosktg''::text'),false),
    coalesce(string_agg(definition,'; '),'absent') from ref_checks
  union all
  select 'phase_reset',count(*)=1 and coalesce(bool_and(phase='reset'),false),
    string_agg(phase,',') from public.owner_test_preview_state
  union all
  select 'storage_not_ready',count(*)=1 and coalesce(bool_and(storage_ready=false),false),
    string_agg(storage_ready::text,',') from public.owner_test_preview_state
  union all
  select 'fixture_reset_retained',
    to_regclass('public.coupons') is null and to_regclass('public.community_posts') is null
    and not exists(select 1 from public.businesses)
    and not exists(select 1 from public.posts)
    and not exists(select 1 from public.business_requests)
    and not exists(select 1 from public.business_specials)
    and not exists(select 1 from public.business_special_items),
    'coupons/community absent; retained fixture tables empty'
  union all
  select 'Storage_preserved',
    (select count(*) from storage.objects)=3
    and (select count(*) from storage.buckets)=7
    and exists(select 1 from storage.buckets where id='community-images' and public=false),
    '3 objects / 7 buckets / community-images private'
  union all
  select 'Auth_preserved',count(*)=4,count(*)::text from auth.users
)
select name,case when passed then 'PASS' else 'FAIL' end as status,actual
from checks order by name;
