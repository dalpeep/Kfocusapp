BEGIN;
-- Stop new numbered submissions. Keep already issued numbers usable with the v2 Edge Function.
REVOKE EXECUTE ON FUNCTION public.business_reservation_submit_v2(uuid,uuid,uuid,timestamptz,smallint,text,text,text,text,text) FROM service_role;
COMMIT;
