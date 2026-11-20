-- Run only against owner-test (aaikttogoejfvxbosktg), with Supabase CLI --read-only.
-- Metadata and aggregates only. No identity values, file names, secrets or application rows.
with user_namespaces as (
  select oid, nspname
  from pg_catalog.pg_namespace
  where nspname not like 'pg_%' and nspname <> 'information_schema'
), relations as (
  select n.nspname as schema_name, c.relname as table_name, c.relkind as kind,
    c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
  from pg_catalog.pg_class c join user_namespaces n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'f')
), policies as (
  select schemaname as schema_name, tablename as table_name, policyname, permissive, roles, cmd,
    coalesce(qual = 'true', false) as unconditional_using,
    coalesce(with_check = 'true', false) as unconditional_check
  from pg_catalog.pg_policies
), business_columns as (
  select table_schema, table_name, column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name in ('businesses', 'business_requests', 'profiles')
), bucket_inventory as (
  select b.id as bucket_id, b.public, pg_catalog.count(o.bucket_id) as object_count
  from storage.buckets b left join storage.objects o on o.bucket_id = b.id
  group by b.id, b.public
), providers as (
  select provider, pg_catalog.count(*) as identity_count from auth.identities group by provider
), grants as (
  select table_schema, table_name, grantee, pg_catalog.array_agg(distinct privilege_type order by privilege_type) as privileges
  from information_schema.table_privileges
  where table_schema in ('public','owner_phase1b_internal','storage','auth')
    and grantee in ('PUBLIC','anon','authenticated','service_role')
  group by table_schema, table_name, grantee
)
select pg_catalog.jsonb_build_object(
  'schemas', (select pg_catalog.jsonb_agg(nspname order by nspname) from user_namespaces),
  'relations', (select pg_catalog.jsonb_agg(r order by schema_name, table_name) from relations r),
  'policies', (select pg_catalog.jsonb_agg(p order by schema_name, table_name, policyname) from policies p),
  'business_columns', (select pg_catalog.jsonb_agg(c order by table_name, column_name) from business_columns c),
  'grants', (select pg_catalog.jsonb_agg(g order by table_schema, table_name, grantee) from grants g),
  'auth_users', (select pg_catalog.count(*) from auth.users),
  'identity_providers', (select pg_catalog.jsonb_agg(p order by provider) from providers p),
  'buckets', (select pg_catalog.jsonb_agg(b order by bucket_id) from bucket_inventory b),
  'storage_objects', (select pg_catalog.count(*) from storage.objects)
) as audit;
