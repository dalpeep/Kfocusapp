-- Run after migration. Test a temporary copy of the actual production indexes;
-- never insert fixtures into public tables or invoke production triggers.
BEGIN;
CREATE TEMP TABLE daily_core_url_test
  (LIKE public.newsroom_items INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
DO $$
DECLARE
  sample public.newsroom_items%ROWTYPE;
BEGIN
  SELECT * INTO STRICT sample FROM public.newsroom_items
  WHERE duplicate_key = 'daily-core-traffic-2026-08-24';
  sample.id := gen_random_uuid();
  sample.duplicate_key := 'test-ordinary-1';
  sample.event_data := NULL;
  INSERT INTO daily_core_url_test SELECT sample.*;
  sample.id := gen_random_uuid();
  sample.duplicate_key := 'test-ordinary-2';
  BEGIN
    INSERT INTO daily_core_url_test SELECT sample.*;
    RAISE EXCEPTION 'ordinary duplicate URL was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  sample.event_data := '{"daily_core":false}'::jsonb;
  BEGIN
    INSERT INTO daily_core_url_test SELECT sample.*;
    RAISE EXCEPTION 'false marker duplicate URL was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  sample.event_data := '{"daily_core":true}'::jsonb;
  sample.duplicate_key := 'daily-core-traffic-2099-01-01';
  INSERT INTO daily_core_url_test SELECT sample.*;
  sample.id := gen_random_uuid();
  sample.duplicate_key := 'daily-core-traffic-2099-01-02';
  INSERT INTO daily_core_url_test SELECT sample.*;
  sample.id := gen_random_uuid();
  BEGIN
    INSERT INTO daily_core_url_test SELECT sample.*;
    RAISE EXCEPTION 'duplicate Daily Core key was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
SELECT 'PASS: ordinary URL rejected; cross-date Daily Core allowed; same-day key rejected' AS result;
ROLLBACK;
