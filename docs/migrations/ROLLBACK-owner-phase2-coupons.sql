BEGIN;
REVOKE EXECUTE ON FUNCTION public.owner_pilot_coupon_v1(uuid,uuid,jsonb) FROM service_role;
-- Keep the marker and guards so existing pilot coupons remain protected.
COMMIT;
