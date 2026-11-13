BEGIN;
SET LOCAL lock_timeout='2s';
-- Set RESERVATION_EMAIL_ENABLED=false first. Preserve the delivery audit records.
DROP TRIGGER IF EXISTS reservation_mail_event ON owner_portal_pilot.reservations;
REVOKE EXECUTE ON FUNCTION public.claim_reservation_mail_v1(uuid,text),
  public.finish_reservation_mail_v1(uuid,text) FROM service_role;
COMMIT;
