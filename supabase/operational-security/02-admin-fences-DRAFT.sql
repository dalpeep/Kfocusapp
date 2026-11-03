-- DRAFT ONLY. Never executed against shared QA/Production in this task.
-- Preconditions: profiles.role/area cannot be self-edited; existing admin aliases
-- and coupon linking schema match these definitions. No Owner tables required.
BEGIN;
CREATE FUNCTION public.security_current_admin_region(target_region text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND
 (p.role='super_admin' OR (p.role='regional_editor' AND
 CASE lower(p.area) WHEN 'denver' THEN 'colorado' ELSE lower(p.area) END =
 CASE lower(target_region) WHEN 'denver' THEN 'colorado' ELSE lower(target_region) END
 AND lower(target_region) IN ('dallas','colorado','denver'))))
$$;
ALTER FUNCTION public.security_current_admin_region(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.security_current_admin_region(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.security_current_admin_region(text) TO authenticated;
CREATE FUNCTION public.security_current_coupon_admin(c jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE idtext text;bid uuid;found boolean:=false;
BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND role='super_admin') THEN RETURN true;END IF;
 IF c ? 'business_ids' AND c->'business_ids'<>'null'::jsonb AND jsonb_typeof(c->'business_ids')<>'array' THEN RETURN false;END IF;
 FOR idtext IN SELECT value FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c->'business_ids')='array' THEN c->'business_ids' ELSE '[]'::jsonb END)
 UNION SELECT c->>'business_id' WHERE nullif(c->>'business_id','') IS NOT NULL
 LOOP
  bid:=idtext::uuid;found:=true;
  IF NOT EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=bid AND public.security_current_admin_region(b.region)) THEN RETURN false;END IF;
 END LOOP;
 RETURN found;
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;
ALTER FUNCTION public.security_current_coupon_admin(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.security_current_coupon_admin(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.security_current_coupon_admin(jsonb) TO authenticated;
CREATE POLICY security_business_insert_v1 ON public.businesses AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.security_current_admin_region(region));
CREATE POLICY security_business_update_v1 ON public.businesses AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.security_current_admin_region(region)) WITH CHECK(public.security_current_admin_region(region));
CREATE POLICY security_business_delete_v1 ON public.businesses AS RESTRICTIVE FOR DELETE TO authenticated USING(public.security_current_admin_region(region));
CREATE POLICY security_coupon_insert_v1 ON public.coupons AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.security_current_coupon_admin(to_jsonb(coupons)));
CREATE POLICY security_coupon_update_v1 ON public.coupons AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.security_current_coupon_admin(to_jsonb(coupons))) WITH CHECK(public.security_current_coupon_admin(to_jsonb(coupons)));
CREATE POLICY security_coupon_delete_v1 ON public.coupons AS RESTRICTIVE FOR DELETE TO authenticated USING(public.security_current_coupon_admin(to_jsonb(coupons)));
-- Add the separately reviewed anonymous six-policy fence, after compatibility QA.
-- Client redemption writes also need to be closed once the new server route is deployed.
CREATE POLICY security_redemption_insert_v1 ON public.coupon_redemptions AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(false);
CREATE POLICY security_redemption_update_v1 ON public.coupon_redemptions AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY security_redemption_delete_v1 ON public.coupon_redemptions AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(false);
COMMIT;
