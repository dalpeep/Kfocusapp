BEGIN;
SET LOCAL lock_timeout='2s';
REVOKE EXECUTE ON FUNCTION public.redeem_owner_display_coupon_v1(uuid,uuid,uuid,uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.owner_issue_coupon_use_proof_v1(uuid) FROM anon,authenticated;
COMMIT;
