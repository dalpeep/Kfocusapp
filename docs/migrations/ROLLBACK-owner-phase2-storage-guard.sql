-- Disable OWNER_PHASE2_GALLERY_ENABLED before removing these guards.
BEGIN;
SET LOCAL lock_timeout = '2s';
DROP POLICY IF EXISTS owner_phase2_gallery_insert_guard ON storage.objects;
DROP POLICY IF EXISTS owner_phase2_gallery_update_guard ON storage.objects;
DROP POLICY IF EXISTS owner_phase2_gallery_delete_guard ON storage.objects;
COMMIT;
