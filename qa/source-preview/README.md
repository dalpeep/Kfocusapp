# UUID QA Deploy Preview

The QA build uses Git source. Its two Netlify Functions reuse the existing configuration and newsroom feed implementations. The application uses the UUID QA public REST API for map, directory, coupon and community reads. The Dallas Life and owner UI sources are included. The owner UI requires separate work to test authenticated operations.

Run from the checkout root with the Node version in `.node-version`.

```sh
npm ci --ignore-scripts --no-audit --no-fund
node qa/source-preview/build.cjs
node --test qa/source-preview/preview.test.mjs tests/community-phase1.test.cjs tests/community-ui4.test.cjs
node qa/source-preview/bundle.mjs
```

For the GitHub PR, use head `qa/source-preview` and the existing UUID QA base `dev/qa-netlify-link-bootstrap-20261029`. That base is a bootstrap tree. The PR head needs the full integration source plus these changes, including the currently uncommitted UI changes. The GitHub check installs the lockfile and builds and tests without service credentials. Netlify handles the separate Deploy Preview on QA site `ec0bc146-8184-4627-90e0-df82ec2b06f9`.

In that site's Deploy Previews environment, set `QA_SUPABASE_URL=https://hseaeafmmjnbynfyynao.supabase.co` and the matching `QA_SUPABASE_PUBLIC_KEY` for Builds and Functions. A QA-restricted `QA_GOOGLE_MAPS_API_KEY` is optional for the static build and needed for an interactive Google map. Check that the QA project has the public read schema and data for the pages being tested. Keep the preview's existing Private protection enabled. The QA build includes no scheduled functions, messaging, booking or privileged write functions. Browser CSP allows QA REST and public Storage paths and blocks Supabase Auth paths, production Supabase connections, and push service connections.

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

Other source-backed functions stay outside the QA bundle until their effects and credentials are reviewed. In particular, owner login and writes, community posting and uploads, coupon campaign writes and special admin pages need a separate QA configuration before functional verification.
