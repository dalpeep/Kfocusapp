-- Review catalog metadata in the target project. No object names, content or keys.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
  'columns', (SELECT jsonb_agg(jsonb_build_object(
    'schema', table_schema, 'table', table_name, 'column', column_name,
    'type', udt_name, 'nullable', is_nullable) ORDER BY table_schema, table_name, ordinal_position)
    FROM information_schema.columns
    WHERE (table_schema='public' AND table_name IN
      ('businesses','business_menu_items','business_photos','coupons','posts','events',
       'business_specials','business_special_items'))
      OR (table_schema='owner_portal_pilot' AND table_name IN ('settings','actors','business_scope','businesses'))),
  'storage_buckets', (SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'public', public, 'file_size_limit', file_size_limit,
    'allowed_mime_types', allowed_mime_types) ORDER BY id) FROM storage.buckets),
  'storage_policy_metadata', (SELECT jsonb_agg(jsonb_build_object(
    'name', policyname, 'command', cmd, 'roles', roles) ORDER BY policyname)
    FROM pg_policies WHERE schemaname='storage' AND tablename='objects'),
  'pilot_status_rpc', to_regprocedure('public.owner_pilot_status_v1(uuid)') IS NOT NULL
) AS owner_phase2_catalog;
ROLLBACK;
