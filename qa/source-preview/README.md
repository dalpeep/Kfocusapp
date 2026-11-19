# UUID QA Deploy Preview

The QA build uses Git source. Its Netlify Functions reuse the configuration, newsroom feed, community post creation and community moderation implementations. The application uses the UUID QA public REST API for map, directory, coupon and community reads. The Dallas Life and owner UI sources are included. The owner UI requires separate work to test authenticated operations.

Run from the checkout root with the Node version in `.node-version`.

```sh
npm ci --ignore-scripts --no-audit --no-fund
node qa/source-preview/build.cjs
node --test qa/source-preview/preview.test.mjs tests/community-phase1.test.cjs tests/community-ui4.test.cjs
node qa/source-preview/bundle.mjs
```

For the GitHub PR, use head `qa/source-preview` and the existing UUID QA base `dev/qa-netlify-link-bootstrap-20261029`. That base is a bootstrap tree. The PR head needs the full integration source plus these changes, including the currently uncommitted UI changes. The GitHub check installs the lockfile and builds and tests without service credentials. Netlify handles the separate Deploy Preview on QA site `ec0bc146-8184-4627-90e0-df82ec2b06f9`.

In that site's Deploy Previews environment, set `QA_SUPABASE_URL=https://hseaeafmmjnbynfyynao.supabase.co` and the matching `QA_SUPABASE_PUBLIC_KEY` for Builds and Functions. A QA-restricted `QA_GOOGLE_MAPS_API_KEY` is optional for the static build and needed for an interactive Google map. Check that the QA project has the public read schema and data for the pages being tested. Keep the preview's existing Private protection enabled. Browser CSP permits QA REST, public Storage and the Turnstile widget. The build excludes scheduled, messaging and booking functions.

In Cloudflare Turnstile Hostname Management, authorize `deploy-preview-56--daltownmap-owner-uuid-qa.netlify.app` on the QA widget. Set the matching `QA_COMMUNITY_TURNSTILE_SITE_KEY` and `QA_COMMUNITY_TURNSTILE_SECRET_KEY` in Deploy Previews with Functions scope. The config endpoint exposes only the site key. Set `QA_COMMUNITY_SERVICE_ROLE_KEY` to the UUID QA project's legacy service-role JWT, and set QA-only `QA_COMMUNITY_PASSWORD_PEPPER` and `QA_COMMUNITY_RATE_LIMIT_HMAC_SECRET` values in the same scope. Store all server credentials as secrets. The write functions require the Preview #56 hostname and the exact UUID QA target. Cloudflare Siteverify must confirm the same hostname before post creation proceeds.

For approval and cleanup, use a valid QA Supabase admin session with the existing community role and Dallas permissions. The QA `community-admin` endpoint accepts only the existing `status` action with `approved` or `deleted` for a post UUID. Image upload is unavailable. Confirm that the UUID QA project has the community tables, policies and rate-limit RPC before running the write test.

The previous QA deploy listed the following functions without corresponding entrypoints in the current integration Git source.

- `booking-api`
- `booking-outbox`
- `community-qa-prepare`
- `coupon-qa-mock`
- `home-settings`
- `owner-image-quarantine-cleanup`
- `owner-qa-boundaries`
- `owner-qa-recovery-export`
- `owner-uuid-health`

Owner login and writes, community uploads, coupon campaign writes and special admin pages require a separate QA configuration before functional verification.
