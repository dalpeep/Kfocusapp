BEGIN;
REVOKE EXECUTE ON FUNCTION public.business_reservation_submit_v1(uuid,uuid,uuid,timestamptz,smallint,text,text,text,text),public.customer_reservation_v1(uuid,uuid,boolean),public.owner_reservations_v1(uuid,uuid,jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.business_reservation_enabled_v1(uuid),public.business_reservation_slots_v1(uuid,date,smallint) FROM anon,authenticated,service_role;
COMMIT;
