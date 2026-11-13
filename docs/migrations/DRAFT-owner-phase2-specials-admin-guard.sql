BEGIN;
SET LOCAL lock_timeout = '2s';

-- Existing RLS calls this helper for both specials and child items.
CREATE OR REPLACE FUNCTION public.business_specials_admin_access(target_business_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, auth AS $$
DECLARE admin_role text; admin_area text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT p.role,p.area INTO admin_role,admin_area FROM public.profiles p WHERE p.user_id=auth.uid() LIMIT 1;
  IF coalesce(admin_role,'')='' THEN
    admin_role := coalesce(auth.jwt()->'app_metadata'->>'role','');
    admin_area := coalesce(auth.jwt()->'app_metadata'->>'area','');
  END IF;
  IF admin_role='super_admin' THEN RETURN true; END IF;
  IF admin_role<>'regional_editor' THEN RETURN false; END IF;
  IF admin_area='denver' THEN admin_area := 'colorado'; END IF;
  RETURN EXISTS(SELECT 1 FROM public.businesses b WHERE b.id::text=target_business_id AND b.region=admin_area);
END $$;
-- The foreign key cascades from businesses, bypassing child-table RLS.
CREATE FUNCTION public.business_has_protected_specials(target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_specials WHERE business_id=target);
$$;
REVOKE ALL ON FUNCTION public.business_has_protected_specials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_has_protected_specials(uuid) TO anon, authenticated;
CREATE POLICY owner_phase2_specials_parent_delete_guard ON public.businesses
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (NOT public.business_has_protected_specials(id)
         OR CASE WHEN current_user='authenticated' THEN public.business_specials_admin_access(id::text) ELSE false END);
COMMIT;
