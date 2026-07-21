# DalTownMap v3 upgrade

## Included
- Main coupon area converted to DalPick
- DalPick uses AI posts first, then active coupons and new/recommended businesses as fallback
- Home board simplified to Event Guide and Dallas Life
- Dallas Guide only displays fixed guide subtypes
- Business detail includes AI Pick; linked `posts` row with subtype `ai_pick` overrides fallback text
- Admin AI writer supports DalPick, Event, Dallas Life, Dallas Guide, and Business AI Pick

## Post subtype conventions
- `dalpick_recommend`, `dalpick_coupon`, `dalpick_new`, `dalpick_weather`, `dalpick_event`
- `ai_pick` for business detail AI Pick (set `business_id`)
- Guide: `운전·차량`, `병원·보험`, `학교·교육`, `세금·비즈니스`, `주거·생활`, `비자·여권`

Deploy with `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) in Netlify.
