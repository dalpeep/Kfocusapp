-- Metadata only. No user identities, row content, routine bodies, values or secret material.
select pg_catalog.jsonb_build_object(
  'role_grants', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schema', n.nspname, 'table', c.relname, 'role', r.rolname,
    'select', pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT'),
    'insert', pg_catalog.has_table_privilege(r.oid,c.oid,'INSERT'),
    'update', pg_catalog.has_table_privilege(r.oid,c.oid,'UPDATE'),
    'delete', pg_catalog.has_table_privilege(r.oid,c.oid,'DELETE')
  ) order by n.nspname, c.relname, r.rolname)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join pg_catalog.pg_roles r
  where r.rolname in ('anon','authenticated','service_role')
    and ((n.nspname='public' and c.relname in ('profiles','businesses','business_requests'))
      or (n.nspname='storage' and c.relname='objects')
      or (n.nspname='owner_portal_internal' and c.relkind in ('r','p')))),
  'owner_routines', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schema', n.nspname, 'routine', p.proname, 'definer', p.prosecdef,
    'anon_execute', pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_execute', pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) order by n.nspname,p.proname)
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='owner_portal_internal' or (n.nspname='public' and p.proname ~ '(owner|admin)')),
  'business_policies', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'table', tablename, 'policy', policyname, 'permissive', permissive, 'cmd', cmd,
    'references_region', (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* '\mregion\M',
    'references_auth_uid', (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%uid(%'
  ) order by tablename,policyname)
  from pg_catalog.pg_policies
  where schemaname='public' and tablename in ('profiles','businesses','business_requests'))
) as audit;
