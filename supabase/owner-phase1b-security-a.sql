-- Migration A: narrow legacy write access before enabling any Owner Portal API.
-- REVIEW ONLY until isolated PostgreSQL and current Production-role smoke tests pass.
-- No application rows are updated or deleted.
begin;

create schema owner_phase1b_internal;
revoke all on schema owner_phase1b_internal from public, anon, authenticated;

create table owner_phase1b_internal.policy_backup as
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where false;
revoke all on owner_phase1b_internal.policy_backup from public, anon, authenticated;

create table owner_phase1b_internal.grant_backup as
select table_schema, table_name, grantee, privilege_type, is_grantable
from information_schema.table_privileges where false;
revoke all on owner_phase1b_internal.grant_backup from public, anon, authenticated;

insert into owner_phase1b_internal.policy_backup
select p.schemaname, p.tablename, p.policyname, p.permissive,
       p.roles, p.cmd, p.qual, p.with_check
from pg_policies p
join (values
  ('public','businesses','Authenticated delete businesses'),
  ('public','businesses','Authenticated insert businesses'),
  ('public','businesses','Authenticated update businesses'),
  ('public','businesses','Authenticated users can modify businesses'),
  ('public','businesses','admin write'),
  ('public','businesses','public delete businesses'),
  ('public','businesses','public insert businesses'),
  ('public','businesses','public update businesses'),
  ('public','coupons','Authenticated delete coupons'),
  ('public','coupons','Authenticated insert coupons'),
  ('public','coupons','Authenticated update coupons'),
  ('public','coupons','public delete coupons'),
  ('public','coupons','public insert coupons'),
  ('public','coupons','public update coupons'),
  ('public','posts','Authenticated delete posts'),
  ('public','posts','Authenticated insert posts'),
  ('public','posts','Authenticated update posts'),
  ('public','posts','Authenticated users can insert posts'),
  ('public','posts','Users can delete own posts'),
  ('public','posts','Users can update own posts'),
  ('public','posts','allow delete posts'),
  ('public','posts','allow insert posts'),
  ('public','posts','allow update posts'),
  ('public','business_requests','Allow authenticated delete business requests'),
  ('public','business_requests','Allow authenticated read business requests'),
  ('public','business_requests','Allow authenticated update business requests'),
  ('storage','objects','allow anon delete ktownad'),
  ('storage','objects','allow anon delete on public-images'),
  ('storage','objects','allow anon update on public-images'),
  ('storage','objects','allow anon upload ktownad'),
  ('storage','objects','allow anon upload to public-images'),
  ('storage','objects','anon upload banner images'),
  ('storage','objects','anon upload business images'),
  ('storage','objects','anon upload coupon images'),
  ('storage','objects','media_banner_upload_authenticated'),
  ('storage','objects','media_insert_anon 1ps738_0'),
  ('storage','objects','media_insert_public 1ps738_0'),
  ('storage','objects','media_insert_test'),
  ('storage','objects','media_update_anon 1ps738_0'),
  ('storage','objects','media_update_test'),
  ('storage','objects','public-images delete authenticated'),
  ('storage','objects','public-images insert authenticated'),
  ('storage','objects','public-images update authenticated')
) as d(schemaname, tablename, policyname)
  on p.schemaname=d.schemaname
 and p.tablename=d.tablename
 and p.policyname=d.policyname;

-- Back up the inspected table grants for rollback/audit. A mismatched policy
-- snapshot fails the transaction before any legacy policy changes.
-- storage.objects TRUNCATE is recorded for visibility but is never changed by
-- this migration: Supabase grants it as supabase_storage_admin, while the SQL
-- Editor's postgres role cannot SET ROLE to that managed owner. A postgres
-- REVOKE cannot safely remove or restore the owner's separate grant.
insert into owner_phase1b_internal.grant_backup
select g.table_schema, g.table_name, g.grantee,
       g.privilege_type, g.is_grantable
from information_schema.table_privileges g
where (g.table_schema='public' and g.table_name in
       ('businesses','business_requests','coupons','posts',
        'business_specials','business_special_items'))
   or (g.table_schema='storage' and g.table_name='objects');

do $$
begin
  if (select count(*) from owner_phase1b_internal.policy_backup) <> 43 then
    raise exception 'Migration A policy baseline changed; expected 43 policies';
  end if;
  if to_regprocedure('public.phase1b_is_admin()') is not null then
    raise exception 'Migration A helper already exists';
  end if;
  if not exists (select 1 from public.profiles
                 where role in ('super_admin','regional_editor')) then
    raise exception 'No profile-backed admin exists; direct admin UI would lose writes';
  end if;
  if not has_table_privilege('authenticated','public.businesses','INSERT')
     or not has_table_privilege('authenticated','public.businesses','UPDATE')
     or not has_table_privilege('authenticated','public.businesses','DELETE')
     or not has_table_privilege('authenticated','public.coupons','INSERT')
     or not has_table_privilege('authenticated','public.coupons','UPDATE')
     or not has_table_privilege('authenticated','public.coupons','DELETE')
     or not has_table_privilege('authenticated','public.posts','INSERT')
     or not has_table_privilege('authenticated','public.posts','UPDATE')
     or not has_table_privilege('authenticated','public.posts','DELETE') then
    raise exception 'Authenticated admin table grants differ from inspected baseline';
  end if;
end $$;

do $$
declare p record;
begin
  for p in select * from owner_phase1b_internal.policy_backup loop
    execute format('drop policy %I on %I.%I',
                   p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

-- SECURITY DEFINER checks the trusted profiles table, not user_metadata.
create function public.phase1b_is_admin()
returns boolean language sql stable security definer
set search_path=pg_catalog,public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id=auth.uid()
      and p.role in ('super_admin','regional_editor')
  );
$$;
revoke all on function public.phase1b_is_admin() from public;
grant execute on function public.phase1b_is_admin() to authenticated;

-- Replace removed broad browser writes with the current admin role check.
create policy phase1b_businesses_admin_insert on public.businesses
for insert to authenticated with check (public.phase1b_is_admin());
create policy phase1b_businesses_admin_update on public.businesses
for update to authenticated using (public.phase1b_is_admin())
with check (public.phase1b_is_admin());
create policy phase1b_businesses_admin_delete on public.businesses
for delete to authenticated using (public.phase1b_is_admin());
create policy phase1b_coupons_admin_insert on public.coupons
for insert to authenticated with check (public.phase1b_is_admin());
create policy phase1b_coupons_admin_update on public.coupons
for update to authenticated using (public.phase1b_is_admin())
with check (public.phase1b_is_admin());
create policy phase1b_coupons_admin_delete on public.coupons
for delete to authenticated using (public.phase1b_is_admin());
create policy phase1b_posts_admin_insert on public.posts
for insert to authenticated with check (public.phase1b_is_admin());
create policy phase1b_posts_admin_update on public.posts
for update to authenticated using (public.phase1b_is_admin())
with check (public.phase1b_is_admin());
create policy phase1b_posts_admin_delete on public.posts
for delete to authenticated using (public.phase1b_is_admin());

-- Public INSERT for new-business requests is intentionally unchanged.
create policy phase1b_business_requests_admin_select
on public.business_requests for select to authenticated
using (public.phase1b_is_admin());
create policy phase1b_business_requests_admin_update
on public.business_requests for update to authenticated
using (public.phase1b_is_admin())
with check (public.phase1b_is_admin());
create policy phase1b_business_requests_admin_delete
on public.business_requests for delete to authenticated
using (public.phase1b_is_admin());

-- Current admin browser uploads use cfg.STORAGE_BUCKET (default public-images)
-- and upsert:false; keep admin writes to legacy buckets without public writes.
create policy phase1b_admin_image_insert
on storage.objects for insert to authenticated
with check (
  bucket_id in ('public-images','media','business-media',
                'coupon-media','banner-media','ktownad')
  and public.phase1b_is_admin()
);
create policy phase1b_admin_image_update
on storage.objects for update to authenticated
using (
  bucket_id in ('public-images','media','business-media',
                'coupon-media','banner-media','ktownad')
  and public.phase1b_is_admin()
)
with check (
  bucket_id in ('public-images','media','business-media',
                'coupon-media','banner-media','ktownad')
  and public.phase1b_is_admin()
);
create policy phase1b_admin_image_delete
on storage.objects for delete to authenticated
using (
  bucket_id in ('public-images','media','business-media',
                'coupon-media','banner-media','ktownad')
  and public.phase1b_is_admin()
);

revoke insert,update,delete on public.businesses,public.coupons,public.posts
from anon;
revoke select,update,delete on public.business_requests from anon;
-- Only application-owned public tables are in scope for TRUNCATE hardening.
-- Supabase-managed storage.objects TRUNCATE is explicitly excluded. Storage
-- object writes are instead narrowed by the INSERT/UPDATE/DELETE RLS policies
-- above; this does not claim to remove direct SQL TRUNCATE privilege.
revoke truncate on public.businesses,public.business_requests,
  public.coupons,public.posts,public.business_specials,
  public.business_special_items
from public,anon,authenticated;

-- RLS does not guard TRUNCATE. Abort if a broad/inherited grant remains on
-- application-owned public tables. storage.objects is excluded as above.
do $$
declare target text;
begin
  foreach target in array array[
    'public.businesses','public.business_requests','public.coupons',
    'public.posts','public.business_specials',
    'public.business_special_items'
  ] loop
    if has_table_privilege('anon',target,'TRUNCATE')
       or has_table_privilege('authenticated',target,'TRUNCATE') then
      raise exception 'Residual TRUNCATE privilege on %',target;
    end if;
  end loop;
  if has_table_privilege('anon','public.businesses','UPDATE')
     or has_table_privilege('anon','public.coupons','UPDATE')
     or has_table_privilege('anon','public.posts','UPDATE')
     or has_table_privilege('anon','public.business_requests','SELECT') then
    raise exception 'Residual anonymous table grant';
  end if;
end $$;

commit;
