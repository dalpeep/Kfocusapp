-- Review and apply before enabling owner gallery uploads.
BEGIN;
SET LOCAL lock_timeout = '2s';

CREATE POLICY owner_phase2_gallery_insert_guard ON storage.objects
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id <> 'public-images' OR split_part(name, '/', 1) <> 'owner-phase2');

CREATE POLICY owner_phase2_gallery_update_guard ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (bucket_id <> 'public-images' OR split_part(name, '/', 1) <> 'owner-phase2')
  WITH CHECK (bucket_id <> 'public-images' OR split_part(name, '/', 1) <> 'owner-phase2');

CREATE POLICY owner_phase2_gallery_delete_guard ON storage.objects
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (bucket_id <> 'public-images' OR split_part(name, '/', 1) <> 'owner-phase2');

COMMIT;
