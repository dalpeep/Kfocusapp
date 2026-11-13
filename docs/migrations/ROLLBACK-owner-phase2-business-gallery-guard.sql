BEGIN;
SET LOCAL lock_timeout = '2s';
DROP TRIGGER IF EXISTS owner_phase2_guard_business_gallery ON public.businesses;
DROP FUNCTION IF EXISTS owner_portal_pilot.guard_business_gallery_v1();
COMMIT;
