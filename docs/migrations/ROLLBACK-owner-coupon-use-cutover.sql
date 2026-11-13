BEGIN;
SET LOCAL lock_timeout='2s';
DROP TRIGGER owner_phase2_guard_coupon_counter ON public.coupons;
DROP FUNCTION owner_portal_pilot.guard_coupon_counter_v1();
DROP POLICY owner_coupon_no_browser_redemption_insert ON public.coupon_redemptions;
DROP POLICY owner_coupon_no_browser_redemption_update ON public.coupon_redemptions;
DROP POLICY owner_coupon_no_browser_redemption_delete ON public.coupon_redemptions;
COMMIT;
