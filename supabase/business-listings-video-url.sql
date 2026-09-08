-- Additive migration: preserve all existing listing values and external links.
BEGIN;
ALTER TABLE public.business_listings
  ADD COLUMN IF NOT EXISTS video_url text;
NOTIFY pgrst, 'reload schema';
COMMIT;
