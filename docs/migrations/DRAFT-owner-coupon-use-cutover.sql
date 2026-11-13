BEGIN;
SET LOCAL lock_timeout='2s';
CREATE FUNCTION public.is_owner_verified_coupon_v1(p_coupon uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.coupons WHERE id=p_coupon AND owner_verified_use);
$$;
REVOKE ALL ON FUNCTION public.is_owner_verified_coupon_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_verified_coupon_v1(uuid) TO anon,authenticated;
CREATE POLICY owner_coupon_no_browser_redemption_insert ON public.coupon_redemptions
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (NOT public.is_owner_verified_coupon_v1(coupon_id));
CREATE POLICY owner_coupon_no_browser_redemption_update ON public.coupon_redemptions
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (NOT public.is_owner_verified_coupon_v1(coupon_id))
  WITH CHECK (NOT public.is_owner_verified_coupon_v1(coupon_id));
CREATE POLICY owner_coupon_no_browser_redemption_delete ON public.coupon_redemptions
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (NOT public.is_owner_verified_coupon_v1(coupon_id));
COMMIT;
