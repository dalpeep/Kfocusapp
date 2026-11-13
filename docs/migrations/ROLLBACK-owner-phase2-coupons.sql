BEGIN;
SET LOCAL lock_timeout = '2s';
DROP TRIGGER owner_phase2_guard_coupon_content ON public.coupons;
DROP FUNCTION owner_portal_pilot.guard_coupon_content_v1();
DROP FUNCTION public.owner_pilot_coupon_v1(uuid,uuid,jsonb);
COMMIT;
