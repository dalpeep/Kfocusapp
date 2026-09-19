# Phase 1-B Step 6 — Daily Core/OpenAI authority

## Execution map

- Scheduled Netlify invocation (`15 11 * * *`) → `daily-core-scheduled.mjs` → `ensureDailyCore` → read `newsroom_items` → claim DB generation lock → re-read → one OpenAI Responses request for only missing weather/traffic categories → insert missing rows → release lock.
- Secret-authenticated manual recovery → `daily-core-refresh.js` with `DAILY_CORE_REFRESH_SECRET` → the same `ensureDailyCore` authority and lock path. Request payload fields such as `next_run` are never authentication signals.
- Public UI → `daltown-daily-core` → read-only `loadTodayRows` → ticker/UI. This endpoint never repairs or generates.
- Public/editor feeds (`today-daltown-feed`, direct Supabase reads) read `newsroom_items` and do not generate.
- Public home brief → `ai-daily-home` → deterministic fallback/reordering payload. It no longer calls OpenAI; browser localStorage is only a display cache, never generation authority.
- Other OpenAI functions (`analyze-newsroom`, `collect-newsroom`, `draft-newsroom`, content/image/guide functions and Supabase newsroom Edge Function) are separate administrator/editor workflows, not Daily Core producers.

## Authority and idempotency

The sole Daily Core generation implementation is `ensureDailyCore`. Netlify invokes it through the URL-inaccessible scheduled entry point `daily-core-scheduled.mjs`; authenticated operators may invoke it through `daily-core-refresh.js` with `DAILY_CORE_REFRESH_SECRET`. Public/browser generation paths are zero. Public GET is read-only, `force=1` is ignored, and unauthorized callers receive 403. The idempotency scope is `daily-core:{lowercase region}:{America/Chicago YYYY-MM-DD}`; stored category keys are `daily-core-{category}-{date}`.

The existing migration `supabase/newsroom-v64-daily-core-lock.sql` provides a service-role-only primary-key lock on `(region,date_key)`, token ownership, and 120-second expiry. The authority re-reads under the lock, never updates existing daily rows, and releases in `finally`; an expired lock can be atomically replaced.

## Function access

| Function | Access | OpenAI for Daily Core |
|---|---|---|
| `daltown-daily-core` | public GET/read-only | never |
| `today-daltown-feed` | public GET/read-only | never |
| `ai-daily-home` | public POST/deterministic | never |
| `daily-core-scheduled` | Netlify Scheduled Function only; no public URL | scheduled trigger |
| `daily-core-refresh` | shared-secret Bearer/header | manual recovery trigger |
| `ai-daily-home` | public deterministic response | never |

Both authorized triggers converge on the same lock-protected `ensureDailyCore` implementation. OpenAI keys, the recovery secret, and Supabase service-role credentials remain server-only and are not emitted in frontend bundles or responses.
