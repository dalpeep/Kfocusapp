-- STOP ONLY rollback: preserves awarded rows, idempotency results, outbox/audit and capacity guards.
-- Stop/keep new raffle functions fail-closed before reverting any application artifact.
-- DO NOT restore the old unguarded draw/mail code as the active raffle implementation.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.coupon_raffle_draw_v1(uuid,text,text,integer,uuid[]),
 public.coupon_raffle_event_draw_v1(uuid,integer,uuid,text,text),
 public.coupon_raffle_resend_v1(uuid,text),public.coupon_raffle_mail_claim_v1(uuid),
 public.coupon_raffle_mail_finish_v1(uuid,uuid,text,text,text),
 public.coupon_raffle_mail_reconcile_v1(uuid,text,text,text) FROM service_role;
COMMIT;
-- No DROP, DELETE, TRUNCATE, winner reset or RLS weakening is included.
-- Full uninstall requires separate reviewed maintenance and retention approval.
