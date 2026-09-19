# Date/Time Execution Map — Phase 1-B Step 2

## Before consolidation

| Feature | Previous clock/boundary |
| --- | --- |
| Paid visibility | Mix of UTC `toISOString().slice(0,10)`, Dallas keys, and direct strings |
| New business | Actual `Date.now() - created_at`, strict `< 168 hours` |
| Map coupon/event/benefit | Dallas date for date-only values; exact timestamps |
| Main coupon and slide | Browser `Date` parsing; date-only values became UTC midnight |
| Popup eligibility | Browser-local `toLocaleDateString('en-CA')` |
| Popup date rotation | Browser parsing of a local-noon string |
| Admin date-only inputs | Stored as `YYYY-MM-DD` strings |
| Admin datetime inputs | Converted using the administrator computer timezone |
| Daily Core | Independent `Intl.DateTimeFormat` implementations for Chicago |

Display formatting, cache ages, request timestamps, sorting timestamps, IDs, and
audit timestamps also use `Date` APIs, but do not decide promotional eligibility.
They are intentionally outside this contract migration.

## Shared contract

`assets/dallas-time.js` is loaded before `home-selection.js` on public and admin
pages and is required by the relevant Netlify Functions.

- Time zone: `America/Chicago`.
- `YYYY-MM-DD`: Dallas calendar date, inclusive start and inclusive end.
- Timestamp with offset/Z: exact instant, inclusive start and exclusive end.
- New business: strict elapsed duration below 168 hours.
- `datetime-local` administrator input: interpreted as Dallas wall time before
  conversion to ISO UTC.
- Popup date rotation: Dallas date ordinal; browser timezone does not participate.
- Invalid bounds: not active.

## Eligibility consumers migrated

- Public paid and premium visibility.
- Home-selection paid placement and weekly-click Monday midnight conversion.
- Public coupon state and active coupon filtering.
- Map coupon/event/promotion/benefit periods.
- DalPick, event-routine, alert-post, and promotional-slide periods.
- Popup eligibility and date-sequential rotation key.
- Administrator paid previews, event-linked business state, coupon preview, and
  `datetime-local` serialization.
- Coupon campaign server eligibility.
- Public smart-flyer date eligibility.
- Daily Core Dallas date generation and refresh audit date.

## Characterized boundary behavior

- Dallas midnight, not UTC midnight, changes the calendar date contract.
- Spring DST: `2026-03-08` midnight is `06:00Z`; `2026-03-09` is `05:00Z`.
- Fall DST: `2026-11-01` midnight is `05:00Z`; `2026-11-02` is `06:00Z`.
- A date-only end such as `2026-09-30` remains active through the full Dallas day
  and becomes inactive at Dallas midnight on October 1.
- A timestamp end is inactive at the exact end instant.
- Exactly 168 elapsed hours is no longer new; values below 168 hours are new.
