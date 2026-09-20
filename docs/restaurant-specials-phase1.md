# Restaurant Specials Phase 1 execution map

## Existing production flow

- Public data starts in `app-v99.js::loadRealData()`. Businesses use paged PostgREST reads guarded by `DtmRequestCoordinator`; coupons, posts, DalPick, slides and banners are loaded afterward.
- `DtmActiveState` is the coupon/event/benefit authority. It delegates date-only and timestamp bounds to `DtmDallasTime` (`America/Chicago`).
- `mapActiveBenefitRecords()` adapts coupons, banners, slides, event posts, DalPick and inline business promotions into `event`, `coupon`, or `promotion` records.
- The map header badge is a **unique business count** (`mapBenefitBusinesses(kind).length`). The benefit dialog keeps the individual active records grouped under each business.
- Business cards use `businessHasActiveCoupon()` and `businessHasActiveBanner()`; business detail independently lists active coupons and matching banners.
- Admin business selection is owned by the existing paged `loadBusinesses()` path. Business edits use the signed-in Supabase client and the existing administrator session.

## Data meanings kept separate

| Source | Meaning | Restaurant Special relationship |
| --- | --- | --- |
| `coupons` | Issuable/redeemable coupon, including email/raffle modes | Never reused |
| event post / event DalPick | Community/business event | Never reused |
| banner / slide / `map_promotion` | General promotion or advertising placement | Shared discount discovery only |
| `business_specials` | Recurring restaurant menu/price offer | New authoritative source |

## Phase 1 authority

- `assets/restaurant-specials.js` owns special validation, Dallas weekday/time evaluation, overnight ranges, display state, filters, sorting and count semantics.
- It reuses `DtmDallasTime` for calendar bounds and `DtmActiveState.explicitlyEnabled()` for explicit inactive/hidden/deleted handling.
- Public discovery reads all `business_specials` pages, deduplicates by `id`, and commits only through the existing request coordinator generation for the current region.
- Public map/header count remains unique businesses. A list/detail renders records. Multiple specials for one business therefore count once in a business-count badge but remain separate cards.
- Admin CRUD writes only `business_specials`; it never stores derived flags on `businesses`.

## Compatibility boundaries

- Recommendation selection, paid ordering, weekly clicks, new-business 168-hour logic and six-item limits are untouched.
- `dallas-time.js`, `active-state.js`, `request-coordinator.js`, and `pagination.js` contracts are consumed, not changed.
- Coupon issuance/redemption, raffle, banners, popup/flyer rotation, Daily Core and all Netlify schedules are untouched.
- The schema migration is additive and is not executed by this change.

