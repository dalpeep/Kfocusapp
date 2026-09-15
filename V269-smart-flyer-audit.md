# V269 Smart Flyer audit and fixes

## Source and scope
- Base frontend: 8c877b2 / 296.11. Existing V269 home duplicate fix preserved.
- User-supplied pasted-text.txt begins VERSION='69.0.0'. Full source is now under SUPABASE-EDGE-FUNCTION/newsroom/index.ts. Remote main still lacked this path when fetched; the attachment is the authoritative source for this patch.
- The old supabase/functions/newsroom/index.ts (V62) is not modified or used as the analysis baseline.
- No DB schema/data changes, commit, push, Edge deployment or live AI analysis performed.

## Confirmed causes
1. Public API returned both Zion 36 (explicitly published draft, 30 items, main images) and Zion 33 (older active, 24 items, no main images). P130 creates a slide per row; missing-image row uses the building summary.
2. V69 flyerNum stripped all nonnumeric characters: 2/$5 became 25, packaging numerals could become money, and nonnumeric text could become zero.
3. Both extraction prompts lacked explicit bundle/box/membership handling and price-block evidence requirements.
4. normalizeFlyerSourceBox adds up to 8% margin, then admin normalizeBox adds another 7%; adjacent products can enter a crop.
5. Position reanalysis passed name/price but omitted unit and ignored returned confidence. Replacing source_box left the previous item_image_url intact until recropping.

## Original-image check
- Public Hmart item 460's stored crop includes header/grapes but excludes the name and price; the upstream box is already inaccurate. Padding removal cannot retroactively correct it.
- Zion item 490 crop includes the next vegetable row in addition to grapes/name/price.
- Original Zion rice block has no readable price. No price is inferred or written from that observation.

## Changes
- Current public flyer selection: one eligible row per business by start date, creation time, image tie-break, ID. Original publication/expiry rules preserved. Real snapshot IDs [35,36,33] -> [35,36].
- Strict numeric parser and complete price-expression parser: $/lb, EA, box/pack/case, bundle total 2/$5 -> $5 with explicit two-item unit; conflicting or missing printed evidence is rejected, never silently concatenated/divided.
- Both AI prompts request exact price_text, regular_price_text and same-block name/price/unit/box; quantity and membership conditions stay in unit_text. Evidence fields are transient, not new DB columns.
- Full-page discovery, second-pass <=3 trigger, 4x4 scan, merge/deduplication and 30-item cap retained.
- Server/client box padding removed. Reanalysis supplies units, rejects confidence below 90 and IDs outside the submitted list, and invalidates stale crop URLs when replacing coordinates.
- Main image 1/2 and original modal images remain unchanged. Frontend cache version 269 preserved; admin JS cache token updated for crop fix. Server source retains its V69 version identifier with V269 price-rule comments.

## Validation and limits
- 10 deterministic price/box/crop tests pass, including 25-item primary and 25-item second-pass mocked responses, plus hash equality of original second-pass control/discovery/merge except added price rules.
- Five public flyer selection tests pass.
- Main 360/390/1200 and modal 360/390/1280 browser regression tests pass.
- Full V69 TypeScript parsing and frontend/admin syntax checks pass.
- npm run build exits 0. Missing Supabase env limits SEO checks to static defaults; generated output changes were removed.
- Mocked model responses prove control-flow/storage behavior, not live OCR accuracy or a guaranteed 25 items on future uploads. Uncertain products are excluded by the existing normalization filter instead of fabricated to hit a count.
- Existing incorrect prices/coordinates/crops remain unchanged; live source reanalysis and verification are still needed before asserting historical-data corrections.

## Rendered-src proof and cache follow-up
- Production public response captured in tests/fixtures/weekly-public-production.json.
- tests/weekly-main-src.test.cjs runs the existing currentFlyers selector and actual shared/P130 DOM renderer, using fixed fixture date and mocked image bytes (no live image download in this test).
- At 360/390/1280, Hmart 35 and Zion 36 img.src exactly equal both market_main_image_url fields; original flyer/building sources and summary fallback are absent. Second-slide transform verified.
- Full URL traces are in tests/fixtures/weekly-main-src-results.jsonl.
- Production HTML still loads app-v99.js?v=321-map296.11 and API still returns 35,36,33. The duplicate is a deployed-code/data issue, not solely a stale browser cache.
- Production HTML Cache-Control is no-cache,no-store,must-revalidate. OneSignalSDKWorker.js only imports the v16 OneSignal push SDK; no project-controlled app asset cache name/version exists. No push worker changes made.
- Local HTML now requests app-v99.js?v=269.1-flyer-main (CSS matching token), build/meta 269.1. Delivery to an installed mobile PWA is not verified before deployment; no deployment done.
- No price/crop/discovery/second-pass/currentFlyers changes in this follow-up.
