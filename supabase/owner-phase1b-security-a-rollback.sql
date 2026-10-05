-- Emergency rollback for Migration A. Restores the former broad/insecure access.
-- Review/execute only after deployment impact is assessed. Migration B must be
-- rolled back first if it was applied. The backup schema must still exist.
begin;

do $$
begin
  if to_regclass('owner_phase1b_internal.policy_backup') is null
     or to_regclass('owner_phase1b_internal.grant_backup') is null then
    raise exception 'Migration A backup is missing; cannot safely roll back';
  end if;
  if (select count(*) from owner_phase1b_internal.policy_backup) <> 43 then
    raise exception 'Migration A backup is incomplete';
  end if;
end $$;

drop policy phase1b_business_requests_admin_select on public.business_requests;
drop policy phase1b_businesses_admin_insert on public.businesses;
drop policy phase1b_businesses_admin_update on public.businesses;
drop policy phase1b_businesses_admin_delete on public.businesses;
drop policy phase1b_coupons_admin_insert on public.coupons;
drop policy phase1b_coupons_admin_update on public.coupons;
drop policy phase1b_coupons_admin_delete on public.coupons;
drop policy phase1b_posts_admin_insert on public.posts;
drop policy phase1b_posts_admin_update on public.posts;
drop policy phase1b_posts_admin_delete on public.posts;
drop policy phase1b_business_requests_admin_update on public.business_requests;
drop policy phase1b_business_requests_admin_delete on public.business_requests;
drop policy phase1b_admin_image_insert on storage.objects;
drop policy phase1b_admin_image_update on storage.objects;
drop policy phase1b_admin_image_delete on storage.objects;
drop function public.phase1b_is_admin();

do $$
declare p record; role_list text; ddl text;
begin
  for p in select * from owner_phase1b_internal.policy_backup
           order by schemaname,tablename,policyname loop
    select string_agg(
      case when lower(r::text)='public' then 'PUBLIC'
           else quote_ident(r::text) end,', '
    ) into role_list from unnest(p.roles) as r;
    ddl:=format('create policy %I on %I.%I as %s for %s to %s',
      p.policyname,p.schemaname,p.tablename,p.permissive,p.cmd,role_list);
    if p.qual is not null then ddl:=ddl||format(' using (%s)',p.qual); end if;
    if p.with_check is not null then
      ddl:=ddl||format(' with check (%s)',p.with_check);
    end if;
    execute ddl;
  end loop;
end $$;

-- Restore only application grants changed by Migration A. In particular,
-- storage.objects TRUNCATE was never revoked: its Supabase-managed grantor is
-- supabase_storage_admin, which the SQL Editor's postgres role cannot assume.
-- Do not issue a new postgres-granted TRUNCATE during rollback.
do $$
declare g record; grantee_sql text;
begin
  for g in
    select distinct table_schema,table_name,grantee,privilege_type,is_grantable
    from owner_phase1b_internal.grant_backup
    where grantee in ('PUBLIC','anon','authenticated')
      and (
        (privilege_type='TRUNCATE' and table_schema='public'
         and table_name in ('businesses','business_requests','coupons',
                            'posts','business_specials','business_special_items'))
        or (grantee='anon' and table_schema='public'
            and table_name in ('businesses','coupons','posts')
            and privilege_type in ('INSERT','UPDATE','DELETE'))
        or (grantee='anon' and table_schema='public'
            and table_name='business_requests'
            and privilege_type in ('SELECT','UPDATE','DELETE'))
      )
  loop
    grantee_sql:=case when g.grantee='PUBLIC' then 'PUBLIC'
                      else quote_ident(g.grantee) end;
    execute format('grant %s on %I.%I to %s%s',
      g.privilege_type,g.table_schema,g.table_name,grantee_sql,
      case when g.is_grantable='YES' then ' with grant option' else '' end);
  end loop;
end $$;

drop table owner_phase1b_internal.grant_backup;
drop table owner_phase1b_internal.policy_backup;
drop schema owner_phase1b_internal;

commit;
