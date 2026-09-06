-- Daily Core is identified by the existing boolean event_data.daily_core.
-- No rows or duplicate_key indexes are changed. Apply once to production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Create the narrower index before removing the global constraint so URL
-- protection for ordinary newsroom items is never absent.
CREATE UNIQUE INDEX newsroom_items_regular_region_original_url_uidx
ON public.newsroom_items (region, original_url)
WHERE NOT COALESCE(event_data @> '{"daily_core":true}'::jsonb, false);

ALTER TABLE public.newsroom_items
  DROP CONSTRAINT newsroom_items_region_original_url_key;
COMMIT;
