# Recommendation Execution Flow — Phase 1-B Step 1

## Before consolidation

1. `loadRealData()` loads and normalizes the public `businesses` rows.
2. `renderHomeBusinessTabs()` calls `canonicalHomeGroups()`, which delegates to
   `DtmHomeSelection`. This renders the featured/new/popular tab list.
3. `renderHome()` starts `renderV37AIHome()` asynchronously.
4. `renderV37AIHome()` loads `home_config`, resolves schedules, calls
   `v45SelectedBusinesses()`, and paints the recommendation card.
5. `v45SelectedBusinesses()` uses `DtmHomeSelection` for featured/new/popular,
   while adapting direct IDs and event-routine modes itself.
6. V199 independently refreshes flag/rank/paid fields from `businesses` at 1.8
   and 4.2 seconds, then invokes the legacy refresh path.
7. V200 independently refetches `businesses`, runs its own `buildPool()`, and
   replaces the recommendation card at 0.9, 1.8, 3.2, 5.2, and 8 seconds. It
   repeats on focus, visibility, and recommendation-card DOM mutation.

V200 was the final writer. Its fallback across featured/new/popular and then all
active businesses differed from `DtmHomeSelection`. It could therefore replace
the initially correct canonical result with a different pool.

## After consolidation

1. `DtmHomeSelection.create()` owns canonical featured/new/popular selection and
   the `recommend()` adapter for `home_config.business_mode/business_ids`.
2. `renderHomeBusinessTabs()` continues consuming the canonical groups without
   DOM or design changes.
3. `v45SelectedBusinesses()` builds only non-core adapter groups such as coupon,
   banner, video, promotion, and random, then delegates the final choice to
   `DtmHomeSelection.recommend()`.
4. `v45RenderAuthoritativeRecommendation()` is the only normal installer of the
   chosen business pool into `v37RecommendationItems`. It paints the existing
   DOM and starts the existing item-rotation timer.
5. Initial settings rendering, routine refresh, V199 data refresh, and the V200
   compatibility API all call that same renderer.
6. V200 no longer fetches businesses, constructs a pool, installs its own timer,
   observes the DOM, or schedules delayed replacements.

The item timer changes only the visible index within the authoritative pool. It
does not recalculate or replace the pool.

The unused legacy `paintV38HomePayload()` helper still paints its summary and
life-information fields, but no longer contains a dormant recommendation-pool
replacement path.
