# DalTownMap v8.2 Coupon + Banner Fix

- Removed the coupon filter that discarded coupons when the linked business was not present in the currently loaded business list.
- Preserved both camelCase and Supabase column-name aliases for coupon rendering and detail views.
- Today coupons now enter the DalPick carousel using `is_today_coupon = true` and active date checks.
- Prevented `undefined · DalTownMap` by safely composing the hero description only from existing values.
- Updated cache-busting versions for `app.js` and `main-banners.js`.
- Added console markers: `[DalTownMap] v8.2 coupon-banner-fix loaded` and `[COUPONS] loaded ...`.
