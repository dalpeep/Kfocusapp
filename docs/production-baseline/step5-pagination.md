# Phase 1-B Step 5 — pagination execution map

## Before

| Data | Path | Query | Bound | Consumer |
|---|---|---|---|---|
| Public businesses | `loadRealData()` → PostgREST `businesses` | region, active, created desc; hidden removed client-side | no range; server max could silently truncate | recommendation authority, map, nearby, search |
| Weekly clicks | `v295LoadWeeklyPopularClicks()` → PostgREST `business_activity` | `business_click`, Dallas week start | `limit=20000`; no page traversal | popular ordering |
| Admin businesses | `loadBusinesses()` → Supabase SDK | region, id desc | `limit(2000)` | admin business list/options |
| Admin exposure businesses | `loadAdsOps()` → Supabase SDK | region, name asc | no range | exposure management |

Other admin activity reports retain their report-specific bounded queries in this step; they do not feed the public weekly-click authority. No aggregation RPC was found in the repository.

## Contract

`assets/pagination.js` requests explicit inclusive ranges, follows pages through the terminal page, preserves query order, de-duplicates by stable row id, skips and counts malformed rows, and stops at a maximum-page guard. A failed later page returns `partial`; callers do not commit it. Empty/no-row complete responses are `live`. Callers expose internal load metadata through `window.__DTM_DATA_LOAD_STATE__` with `live`, `fallback`, `partial`, or `failed` status (a future cache-backed caller may use `cache`).

Public business requests use the existing request coordinator identity keyed by region and projection. A new region generation aborts the prior fetch where possible and the generation/current-region checks prevent stale commits. Weekly activity is snapshot-bounded and ordered by `created_at,id`, so rows arriving during page traversal cannot shift the result set.

## Filters and ordering retained

Public businesses remain region-scoped and `is_active=true`; `list_visible=false` is excluded while null/true remain eligible. Ordering is `created_at desc nullslast, id desc`. Existing client duplicate removal remains after pagination. Admin ordering remains id descending for the primary list and name/id ascending for exposure management.

## Limits and DB recommendation

The prior unpaged public request could truncate at the PostgREST server maximum (commonly 1,000). The explicit weekly-click client limit could truncate at 20,000 and may also be constrained by a lower server maximum. Pagination removes both correctness limits, with safety guards of 100 business pages and 200 activity pages.

For long-term activity growth, add a read-only, region-aware RPC/view that returns `business_id, count(*)` for `business_click` between Dallas-week UTC bounds. That schema change is intentionally not part of this step.
