# Community Video Phase 2 — staging foundation

This branch exists to obtain an isolated Netlify Deploy Preview before any
Phase 2 infrastructure, database migration, or application code is changed.

The Preview's public config must point to the existing isolated staging
Supabase project, not Production. The exact Preview origin will be used for
staging-only Cloud Storage CORS after it is verified.

No Production configuration or Community behavior changes in this commit.
