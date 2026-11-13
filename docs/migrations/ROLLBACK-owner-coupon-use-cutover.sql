BEGIN;
SET LOCAL lock_timeout='2s';
DROP POLICY owner_coupon_no_browser_redemption_insert ON public.coupon_redemptions;
DROP POLICY owner_coupon_no_browser_redemption_update ON public.coupon_redemptions;
DROP POLICY owner_coupon_no_browser_redemption_delete ON public.coupon_redemptions;
DROP FUNCTION public.is_owner_verified_coupon_v1(uuid);
COMMIT;
