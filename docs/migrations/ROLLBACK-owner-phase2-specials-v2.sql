BEGIN;
SET LOCAL lock_timeout = '2s';
DROP FUNCTION public.owner_pilot_special_v2(uuid,uuid,jsonb);
COMMIT;
