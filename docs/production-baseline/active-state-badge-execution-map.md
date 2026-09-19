# Active-state and Badge Execution Map — Phase 1-B Step 4

## Before consolidation

| Surface | Previous helper | Count meaning |
| --- | --- | --- |
| Map marker/list/preview | `mapBusinessBadgeKinds` | presence of coupon/promotion/event per business |
| Map benefit tabs | `mapBenefitBusinesses(kind).length` | unique active businesses |
| Map category summary | active public business rows | unique business count, unrelated to benefit records |
| Home/recommendation cards | `businessHasActiveCoupon`, `businessHasActiveBanner` | boolean badge presence |
| Nearby cards | same two business helpers | boolean badge presence |
| Business detail coupon list | `activeCoupons` plus only `businessId` | active coupon records; multi-ID links could be missed |
| Coupon page | `activeCoupons`, `todayCoupons` | active coupon record count/list |
| Today shortcut: promotion | `v245EventCoupons` | active raffle coupon record count |
| Today shortcut: coupon | `v245ActiveCoupons` | all active coupon record count |
| Today shortcut: sale | `v247MarketBusinessGroups` | unique businesses |
| Today shortcut: event | `v245EventPostCount` | post rows, previously without shared date eligibility |

Previous differences included direct JavaScript timestamp comparisons for banners,
event counts that ignored periods, different inactive-status sets, and detail coupon
linking that ignored `business_ids`.

## Authoritative contract

`assets/active-state.js` adapts coupon, event, benefit/banner/DalPick and business
promotion shapes to the Step 2 `DtmDallasTime.periodActive` contract.

- date-only bounds include the full Dallas end date;
- timestamp end is exclusive at the exact instant;
- explicit false flags, hidden/deleted records and inactive statuses always win;
- event records require both event start and end and must be published;
- coupon raffle end uses `raffle_end_at` before the normal coupon end;
- missing dates remain unbounded for coupons/benefits, while undated events are not
  treated as currently happening;
- invalid dates are inactive;
- optional region context prevents cross-region badge leakage.

## Count contract

- **Record count:** coupon/event lists and the Today shortcut coupon/promotion/event
  badges. Two active coupons are two items.
- **Unique business count:** map benefit tabs and sale/business group badges. Two
  coupons linked to the same business count as one business.
- **Boolean kinds:** marker, business card, detail header, nearby card and
  recommendation/new/popular cards. Each kind appears at most once per business.
