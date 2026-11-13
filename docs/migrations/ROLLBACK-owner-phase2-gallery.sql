-- Disable OWNER_PHASE2_GALLERY_ENABLED before removing the gallery RPC.
BEGIN;
SET LOCAL lock_timeout = '2s';
DROP FUNCTION IF EXISTS public.owner_pilot_gallery_v1(uuid, uuid, jsonb, jsonb);
COMMIT;
