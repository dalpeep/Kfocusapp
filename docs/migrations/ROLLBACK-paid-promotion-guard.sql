BEGIN;
DROP TRIGGER guard_paid_promotion ON public.coupons;
DROP FUNCTION owner_portal_pilot.guard_paid_promotion_v1();
DROP FUNCTION public.can_manage_paid_promotion_v1();
COMMIT;
