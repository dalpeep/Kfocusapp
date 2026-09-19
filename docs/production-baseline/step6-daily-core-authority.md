# Phase 1-B Step 6 — Daily Core/OpenAI authority

## Execution map

- Scheduled Netlify invocation (`15 11 * * *`) or secret-authenticated manual recovery → `daily-core-refresh` → `ensureDailyCore` → read `newsroom_items` → claim DB generation lock → re-read → one OpenAI Responses request for only missing weather/traffic categories → insert missing rows → release lock.
- Public UI → `daltown-daily-core` → read-only `loadTodayRows` → ticker/UI. This endpoint never repairs or generates.
- Public/editor feeds (`today-daltown-feed`, direct Supabase reads) read `newsroom_items` and do not generate.
- Public home brief → `ai-daily-home` → deterministic fallback/reordering payload. It no longer calls OpenAI; browser localStorage is only a display cache, never generation authority.
- Other OpenAI functions (`analyze-newsroom`, `collect-newsroom`, `draft-newsroom`, content/image/guide functions and Supabase newsroom Edge Function) are separate administrator/editor workflows, not Daily Core producers.

## Authority and idempotency

The sole Daily Core generation authority is `daily-core-refresh`, invoked by Netlify schedule or `DAILY_CORE_REFRESH_SECRET`. Public GET is read-only. `force=1` is ignored and unauthorized callers receive 403. The idempotency scope is `daily-core:{lowercase region}:{America/Chicago YYYY-MM-DD}`; stored category keys are `daily-core-{category}-{date}`.

The existing migration `supabase/newsroom-v64-daily-core-lock.sql` provides a service-role-only primary-key lock on `(region,date_key)`, token ownership, and 120-second expiry. The authority re-reads under the lock, never updates existing daily rows, and releases in `finally`; an expired lock can be atomically replaced.

## Function access

| Function | Access | OpenAI for Daily Core |
|---|---|---|
| `daltown-daily-core` | public GET/read-only | never |
| `today-daltown-feed` | public GET/read-only | never |
| `ai-daily-home` | public POST/deterministic | never |
| `daily-core-refresh` | scheduled or shared-secret Bearer/header | sole authority |

OpenAI keys and Supabase service-role credentials remain server-only and are not emitted in responses.
