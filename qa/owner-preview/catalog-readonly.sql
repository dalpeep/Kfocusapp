-- Prepared only; run separately after confirming QA dashboard project identity.
-- Catalog metadata only: no customer rows, key values, function bodies or writes.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name,
       current_setting('supabase.project_ref', true) AS project_ref;
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND
 (n.nspname IN ('public','storage','auth') OR n.nspname LIKE 'owner%')
ORDER BY 1,2;
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname IN ('public','storage') OR schemaname LIKE 'owner%'
ORDER BY 1,2,3;
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, p.proacl AS grants
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname LIKE 'owner%') OR n.nspname LIKE 'owner%'
ORDER BY 1,2,3;
ROLLBACK;
