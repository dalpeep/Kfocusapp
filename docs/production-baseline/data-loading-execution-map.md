# Data-loading Execution Map — Phase 1-B Step 3

## Existing production flow

| Trigger | Request path | Commit target |
| --- | --- | --- |
| `init()` | `loadRealData()` → businesses REST | global `businesses`, selected business, full initial render |
| `loadRealData()` | weekly `business_activity` REST | `v295WeeklyClickCounts`, recommendation re-render |
| `loadRealData()` | coupons, DalPick, posts/alerts, slides, banners, listings | matching global arrays and later `finalizeData()` DOM |
| recommendation | consumes `businesses` + weekly click map | `DtmHomeSelection`; no independent V200 loader |
| location/watch | updates local origin and re-renders existing business data | recommendation/map DOM; no business fetch required |
| map move/zoom | filters and clusters existing rows | map DOM only |
| focus/visibility/pageshow | coupon refresh, board refresh, home refresh, build check | several globals and home DOM |
| P122 startup retries | Daily Core Function + direct `newsroom_items` | ticker source arrays and ticker DOM |
| P010/P130 flyer modules | same `smart-flyer-public` Function | two component-local flyer arrays |
| admin saves | table-specific reload functions | admin global arrays and section DOM |

## Duplicate and race risks characterized

- `smart-flyer-public` was requested independently by P010 and P130 and again by startup timers.
- P122 requested server Daily Core and direct Daily Core at 0.7, 2.2, 5 and 9 seconds.
- coupon refresh could be scheduled separately by visibility, pageshow and focus.
- focus/visibility also scheduled board and P009 home refresh paths concurrently.
- business, weekly-click, flyer and Daily Core responses had no common generation identity;
  a response for an older region/filter could commit after a newer request.
- several catch paths cleared arrays, so a failed old request could erase newer data.

## Request contract

`assets/request-coordinator.js` defines identity as logical resource plus a stable,
sorted serialization of region/location/filter/query conditions.

- identical in-flight identity: one backend promise;
- fresh identity cache: optional short TTL;
- scope generation: only the latest identity may commit;
- new identity: prior fetch receives `AbortController.abort()` where supported;
- non-abortable SDK calls: generation/current checks still block stale commits;
- fallback runs only for the current generation;
- counters: `started`, `deduped`, `aborted`, `committed`, `stale`, `failed`,
  and `cacheHit`, exposed through `window.__DTM_REQUEST_DEBUG__()`.

## Applied consumers

- public businesses REST identity includes region and projection;
- weekly click identity includes region and Dallas week key;
- smart-flyer identity includes region and is shared by both public flyer modules;
- server Daily Core identity includes region and has a 15-second freshness window;
- direct Daily Core SDK/REST loader has an in-flight join, 15-second freshness window,
  and region-before-commit guard;
- coupon focus/visibility/pageshow triggers share one debounce scheduler and suppress
  non-manual reloads for 15 seconds after a successful load.
