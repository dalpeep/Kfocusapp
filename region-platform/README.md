# DalTownMap multi-region foundation — Phase 1

This directory is an **isolated, non-deployed prototype**, not an enabled admin screen, public route, or live database migration.

## Current state
- Main branch retains the existing Dallas runtime, Netlify deployment guard, and immutable production build fingerprints.
- `region-config.mjs` creates an empty, draft-only region definition with map coordinates.
- A new region inherits common feature names and default styling but **does not** inherit any Dallas business, post, coupon, event, or advertising records.
- Module settings and visual presentation can be updated without mutating another region's configuration.
- Tests: `node --test tests/region/region-config.test.mjs`.

## Future integration — requires separate review
1. Inspect the actual Supabase tables, foreign keys, row-level security policies and admin endpoints before proposing a tenant/region migration.
2. Design a server-enforced region boundary for reads, writes, search, registration, analytics and public SEO.
3. Add access-controlled region CRUD and preview UI, with a draft/demo/live publishing workflow.
4. Add per-region theme/layout rendering and module gates at both UI and API layers.
5. Exercise legacy Dallas regression tests, QA data-isolation tests, authorization tests, and rollback.
6. Obtain approval for database schema/authentication/security changes before implementing or deploying them.

## Safety
- Do not copy Dallas business or community data into new regions.
- Do not treat a menu toggle as an authorization boundary.
- Region slug uniqueness must be enforced on the server before publishing.
- Avoid unreviewed new region routes and auto-publication.
- The current Netlify `ignore = "exit 1"` and release snapshot restrictions are intentional and must not be bypassed.
- No production deployment is authorized by this prototype alone.
