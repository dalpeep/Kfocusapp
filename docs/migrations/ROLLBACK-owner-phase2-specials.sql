BEGIN;
SET LOCAL lock_timeout='2s';
DROP FUNCTION IF EXISTS public.owner_pilot_special_v1(uuid,uuid,jsonb);
COMMIT;
