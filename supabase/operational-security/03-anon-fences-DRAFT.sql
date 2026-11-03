-- DRAFT ONLY. NOT APPROVED. NOT EXECUTED.
-- Anonymous direct-write containment; not a complete authenticated-user fix.
-- STOP: legacy coupon redemption updates coupons.used_count from the browser.
-- Resolve/approve that compatibility impact before applying this draft.
-- Confirm dashboard Production project ydrxuqmjzayejlnjzzew independently.
-- Existing 26 policies and ALL original GRANT/ACL entries are left unchanged.
BEGIN;

-- Metadata-only preconditions. Fail rather than apply to unexpected state.
DO $preflight$
BEGIN
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL
    AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew'
 THEN RAISE EXCEPTION 'PROJECT_MISMATCH_STOP'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='businesses' AND c.relkind IN ('r','p') AND c.relrowsecurity)
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='coupons' AND c.relkind IN ('r','p') AND c.relrowsecurity)
 THEN RAISE EXCEPTION 'RLS_REQUIRED_STOP'; END IF;
 IF pg_catalog.pg_has_role('authenticated','anon','USAGE')
 THEN RAISE EXCEPTION 'AUTHENTICATED_INHERITS_ANON_STOP'; END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon' AND (rolsuper OR rolbypassrls))
 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
 WHERE n.nspname='public' AND c.relname IN ('businesses','coupons') AND r.rolname='anon')
 THEN RAISE EXCEPTION 'ANON_RLS_BYPASS_STOP'; END IF;
END;
$preflight$;

CREATE POLICY security_bc_anon_insert_v1 ON public.businesses AS RESTRICTIVE
 FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY security_bc_anon_update_v1 ON public.businesses AS RESTRICTIVE
 FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY security_bc_anon_delete_v1 ON public.businesses AS RESTRICTIVE
 FOR DELETE TO anon USING (false);
CREATE POLICY security_cc_anon_insert_v1 ON public.coupons AS RESTRICTIVE
 FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY security_cc_anon_update_v1 ON public.coupons AS RESTRICTIVE
 FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY security_cc_anon_delete_v1 ON public.coupons AS RESTRICTIVE
 FOR DELETE TO anon USING (false);

-- Name collisions fail and abort the transaction. Do not add IF NOT EXISTS.
-- No SELECT policy, table/column grant, sequence, row or other table is changed.
COMMIT;
