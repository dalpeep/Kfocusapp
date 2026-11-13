BEGIN;
SET LOCAL lock_timeout = '2s';
DROP TRIGGER owner_phase2_guard_coupon_content ON public.coupons;
DROP FUNCTION owner_portal_pilot.guard_coupon_content_v1();
DROP FUNCTION public.owner_pilot_coupon_v1(uuid,uuid,jsonb);
ALTER TABLE public.coupons DROP CONSTRAINT owner_phase2_coupons_preserve_business;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
COMMIT;
