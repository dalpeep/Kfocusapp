# Isolated owner-test Preview — preparation only

Test Supabase execution evidence supplied by the user: reset verification 22/22 PASS, final ref correction 7/7 PASS, Storage cleanup verification 12/12 PASS, schema verification 123/123 PASS, fixtures verification 62/62 PASS. Current state is fixtures/storage_ready=true, 11 synthetic application rows, four retained Auth users, seven buckets and no Storage objects. Netlify creation and UI regression are still pending; Migration A reapplication, Migration B, Owner Portal and Production changes remain prohibited.

Git delivery branch: `test/owner-preview` in `dalpeep/Kfocusapp`. Connect the future Test Netlify site to this branch. Base directory remains repository root; package directory MUST be `netlify/test-preview`. Do not merge this branch into Production as part of Test setup. Generated `test-dist` is ignored and must not be committed. Use Cloudflare's visible Always passes dummy sitekey and matching Always passes validation dummy secret from its official testing documentation; never reuse Production Turnstile credentials.

2026-10-05 final identity evidence: the owner-test Project ID screenshot and user-pasted ref confirm `aaikttogoejfvxbosktg` (20 characters). Earlier interpretation omitted an internal o and incorrectly appended g. All active constants and READ ONLY verification now use the confirmed Project ID. The last live catalog CSV instead recorded an incorrect 20-character state/CHECK value, so prior PASS results used the wrong expectation. 11-preview-ref-correction.sql and its guarded rollback are prepared ONLY: no SQL/API has been executed by this correction. Run the new correction only when authorized, then the corrected seven-check verification before Storage plan; Storage apply/06/07 remain prohibited.

Nothing in this directory has been applied to Supabase or deployed by this preparation. Do not run a SQL file against Production. The Test project ref is `aaikttogoejfvxbosktg`; Production ref `ydrxuqmjzayejlnjzzew` is forbidden.

2026-10-05 evidence: user-supplied catalog CSV has 407 rows, postgres session, coupons=6, businesses=6, posts=6, business_requests=20, Specials=18, items=2, Community=5, Auth=4 and profiles=2. All coupon/business labels are reported synthetic. No incoming coupon FK or Migration A backup is present. The earlier catalog export was followed by a 66-row inventory CSV: 63 application rows and three public-images/migration-a/after-protected .txt objects. Every inventory row matches the previous synthetic fixture predicates and reset target. Exact table IDs and Storage paths have been pinned in the reset preflight; any changed identity aborts before deletion. Local tests do not prove live SQL execution. No SQL, site creation, migration or deployment was performed.

Reset preparation verification: 138 related contracts passed, including exact canonical dependency embedding, Test project/role rejection, read-only default Storage helper, mocked manifest-only removal, unknown live path refusal before any API mutation, and no readiness flag on failed Storage verification. No live SQL or Storage API was invoked. Execution-readiness is READY based on the reviewed inventory: 08 -> Storage cleanup/verification -> 06 -> verification -> 07 -> verification. Live SQL/runtime verification remains a required stage, not evidence already obtained.

## Files and order (Test Project only)

1. The exact-ID/path inventory has been supplied and reviewed: businesses 6, coupons 6, posts 6, requests 20, Specials 18, items 2, Community 5 and Storage 3. All 66 identities are pinned in 08. Preserve the four known Auth users and earlier Migration A evidence. Any new or changed row/path blocks reset.
2. When separately authorized, execute `08-preview-reset.sql` in owner-test ONLY. It checks the original marker, optional platform ref, exact CSV counts, four test-only Auth emails, synthetic row labels, toy Community category/hash, absence of Preview dependencies/backups and recognized Storage paths. All checks precede deletion; unexpected data aborts the transaction. It deletes fixture rows child-first, drops EMPTY minimal coupon/Community tables with RESTRICT, removes toy helpers and preserves business/post/Special schema and legacy public-table RLS. Every selected ID/path is saved in private manifest tables. No Auth user/password or Storage metadata is deleted.
3. The `08 -> verification` stage includes Storage API preparation: first `node scripts/prepare-preview-storage.cjs --plan`, review exact paths, then separately authorized `--apply`. Set OWNER_TEST_URL and OWNER_TEST_SERVICE_KEY in local environment only. Native Node fetch is used; no new package installation is required. The helper validates the Test URL/JWT ref/role and reset state, checks current bucket/object contents against the manifest BEFORE mutations, removes only manifest migration-a .txt objects via Storage API, makes community-images public through the bucket API, verifies empty Storage and marks storage_ready. It never empties/deletes buckets. Run `09-preview-stage-verify.sql`; only then proceed to 06. SQL cannot perform physical Storage cleanup: [Supabase deletion guidance](https://supabase.com/docs/guides/storage/management/delete-objects).
4. Execute `06-preview-schema.sql` only after reset/storage verification. It creates UUID coupons fresh, with bigint business FK and bigint[] business_ids; no ALTER ID conversion remains. Community is recreated from canonical phase1, followed by image edit, video link, board phase3, hidden moderation, cleanup, retention, then event-winner and Special canonical SQL in ONE transaction. Do not replay those files separately. Regenerate with `node scripts/assemble-preview-schema.cjs` after canonical changes. Video upload remains off.
Repository contract: coupons.id UUID; coupon_entries.id UUID and coupon_id text; coupon_redemptions.id/coupon_id UUID; event_draw_batches.id/event_id UUID; event_draw_winners.id/event_id/entry_id/draw_batch_id UUID; event_winner_email_attempts.id/winner_id UUID. enter/admin/used-notify/redemptions-admin serialize IDs as strings; event-winner-admin validates UUID and event_draw_run compares entry coupon_id to UUID::text. coupon_entries.business_id stays text transport metadata as sent by the existing server, not a business FK. coupons.business_id and redemption business_id are bigint; multi-business IDs are bigint[]. This is CODE/SQL evidence, not a live Production schema attestation.
5. Verify 06 with `09-preview-stage-verify.sql` AND `08-readonly-catalog.sql`: coupons UUID, business fields bigint/bigint[], event UUID fields and coupon entry text contract, all actual RPC signatures, service grants and Storage boundary policies. Special business_specials_admin_access(text), touch triggers, constraints and cascade FKs are included; owner_test_admin_access(bigint) is removed. All fixture tables remain empty, state=schema. Confirm all 43 original Migration A target policy names still exist (26 public + 17 Storage), while wildcard Storage expressions are gone.
6. Execute `07-preview-fixtures.sql` only after separately authorized verification. It requires schema phase and empty tables, preserves four Auth IDs/passwords, normalizes their Test profiles (admin=super_admin, others=user), inserts 2 businesses, 3 UUID coupons, 1 post, 2 Specials, 2 items and 1 display-only Community row; advances identity sequences; state=fixtures. Raffle is manual-only and includes a multi-business array fixture. No entries, winners or test passwords are pre-created. Verify with both read-only files.
7. Save a NEW baseline, then create a Test site only when separately authorized. Actual UI scenarios run before/after any later separately authorized Test Migration A. Migration B and Production remain untouched.

The SQL is prepared but NOT executed. CSV catalog evidence is available; exact row/path inventory is verified; live SQL runtime validation is still pending. Platform project_ref settings may be absent: the original marker PLUS exact disposable baseline/four test-only Auth identities are the fallback safety gate, not a claim of cryptographic SQL Editor project attestation. The Storage helper independently enforces the owner-test host and JWT ref/role. Stop on any error; all data/structure guards remain mandatory.

Storage baseline distinction: preserve the 17 Migration A policy names but emulate anonymous writes ONLY in public-images/migration-a/. Normal public-images/business-media/coupon-media image writes require profile-backed admins. Community browser INSERT/UPDATE/DELETE is permanently denied by restrictive policies and only guarded server/signed uploads are used. Four-bucket restrictive boundary remains after Migration A, so its wider six-bucket admin replacement cannot expose unrelated buckets. Managed Storage TRUNCATE grants are not changed; this preparation covers API/RLS writes. Auth/storage schemas, bucket identities, original boolean marker and previous evidence are preserved.

`05-migration-a-tests.cjs` belongs to the earlier minimal baseline and uses the toy Community RPC. Do not rerun it after `06`; it is not Preview UI evidence. The Preview regression must exercise actual Functions instead.

## Netlify Test Site (do not create yet)

- New site linked to the same GitHub repository, no custom/Production domain, no copied Team/Production environment variables. Select the branch containing these reviewed changes, not an old Production checkout.
- Build command: `npm run build:test-preview`; publish directory: `test-dist`; Functions directory: `netlify/test-functions`. Set base directory to this checkout's repository root and package directory to `netlify/test-preview`, selecting its schedule-free `netlify.toml`. Verify resolved config path before any deploy. The root Production config contains a raffle schedule and MUST NOT be used for Test. See [Netlify configuration discovery](https://docs.netlify.com/build/configure-builds/file-based-configuration/).
- The allowlist includes `raffle-auto-draw` as a Test-only POST endpoint. It requires Test identity and authenticated admin, delegates to event-winner-admin draw and event_draw_run, and has no scheduling metadata. Invoke with event_id/count on a manual-mode fixture. This exercises canonical draw manually; it does not claim equivalence with Production automatic due-time selection, legacy coupon issuance or email. No newsroom, Daily Core, cleanup, AI scheduled handlers are deployed.
- Set variables in the **new Test site only**, in both Build and Function scopes where needed. Netlify `SITE_ID` is read-only; enter the new Test site's ID as `TEST_NETLIFY_SITE_ID`. No secrets belong in Git, screenshots or chat.
- After site creation, set `APP_PUBLIC_URL` to exactly `https://<new SITE_NAME>.netlify.app`. The guard compares Netlify's read-only `SITE_NAME` and `SITE_ID`; before these values exist, the build must fail.
- Inspect the first deploy's Function list and the `/.netlify/functions/config` response for Test URL/anon only; never print secret values. A wrong project ref or site ID must fail closed.

### Required Test-site variables

| Variable | Value / scope |
|---|---|
| `TEST_PREVIEW_MODE` | `true`, Builds + Functions |
| `TEST_SUPABASE_PROJECT_REF` | `aaikttogoejfvxbosktg`, Builds + Functions |
| `TEST_NETLIFY_SITE_ID` | new Test Netlify site ID, Builds + Functions |
| `SUPABASE_URL` | owner-test HTTPS URL, Builds + Functions |
| `SUPABASE_ANON_KEY` | owner-test anon key, Builds + Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | owner-test service key, Functions only; the build guard does not require or read it |
| `APP_PUBLIC_URL` | new Test `.netlify.app` URL, Builds + Functions |
| `COUPON_EMAIL_MODE` | `dry-run`, Builds + Functions |
| `COMMUNITY_STORAGE_BUCKET` | `community-images`, Functions |
| `COMMUNITY_PASSWORD_PEPPER` | new random Test-only secret, Functions |
| `COMMUNITY_RATE_LIMIT_HMAC_SECRET` | new random Test-only secret, Functions |
| `COMMUNITY_TURNSTILE_SITE_KEY` | Cloudflare Test site key, Functions; config publishes it |
| `COMMUNITY_TURNSTILE_SECRET_KEY` | matching Cloudflare Test secret, Functions only |
| `APP_CITY` | `dallas`, Functions |
| `COMMUNITY_RETENTION_RPC_V4_ENABLED` | `false` until separately verified, Functions |
| `COMMUNITY_VIDEO_UPLOAD_UI_ENABLED` | `false`, Functions |

Do not set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`, Production analytics/push keys, `OPENAI_API_KEY`, or legacy Supabase aliases. The Test site must have no Production key in any scope. Public config may contain only Test URL, Test anon, and non-secret UI settings; never service role.

Use owner-test legacy JWT keys with matching ref and anon/service_role claims; opaque publishable/secret keys are rejected because this guard cannot independently identify their project. Claims inspection supplements site/URL checks; actual JWT signature validation remains Supabase's responsibility.

Community dependency map: text create/update/delete and comments use guarded server CRUD plus password hashing, Turnstile and community_rate_limit_take. Signed upload uses community_upload_drafts and service Storage signing; image edit uses community_apply_post_details_image_edit -> video/image edit RPCs and edit-request/cleanup tables. Admin uses guarded service CRUD, public views use v3/v4 read RPCs; touch/comment-count/retention triggers preserve derived state. `06` grants service CRUD explicitly and revokes browser Community table access; `08` removes the toy owner_test_community_create RPC. No Production rows are copied.

Migration A does not make a browser coupon_entries fallback necessary: entries already deny browser privileges and server Functions use service_role. Do not patch entries in SQL/dashboard/browser for smoke tests. Enter through coupon-campaign-enter, draw through event-winner-admin or the Test raffle endpoint, send simulated winner notice through event-winner-admin. Existing Production legacy raffle/coupon-campaign-admin entry updates are separate server behavior and have not been changed by this preparation.

| Production site | Separate Test site |
|---|---|
| Existing Netlify site ID and domain; do not change | New site ID; default `.netlify.app` domain only |
| Production Supabase ref `ydrxuqmjzayejlnjzzew`; never copy its URL/keys | Test ref `aaikttogoejfvxbosktg`; independently obtained URL/keys |
| Existing mail, analytics, push, AI credentials | No mail provider, analytics, push or AI credentials |
| Full Functions directory and current schedules | `netlify/test-functions` allowlist; no scheduled Function deployed |
| Normal build/deploy settings | `build:test-preview`, `test-dist`, Test identity guard |

### Change classification

- **Test-only additions:** `06-preview-schema.sql`, `07-preview-fixtures.sql`, this document, `netlify/test-functions/*`, `scripts/build-test-preview.cjs`, `scripts/assert-test-preview.cjs`, `netlify/functions/lib/test-preview-guard.js`, and the guard tests. They are inert for the existing Production site unless it is incorrectly configured with Test Preview variables.
- **Shared security improvements:** remove SEO's service-role fallback; in Test mode only, central coupon email dry-run, public config/Community/coupon identity checks, scheduled handler no-op, and Test `APP_PUBLIC_URL` for winner mail. Outside Test mode the existing Production behavior is intended to remain unchanged. These shared edits still require normal code review before any Production deployment.
- **Files intentionally not changed:** Migration A and rollback, Migration B, Owner Portal, Production Netlify configuration and secrets. Test MUST resolve `netlify/test-preview/netlify.toml` with no schedules; changing Functions directory alone is insufficient because the root raffle schedule uses the same name.

### Email and Turnstile

Coupon `sendEmail` uses a central dry-run branch only when Test identity passes. It returns a synthetic provider ID and does not call Resend. Recipients must use `@test.invalid` or `@example.com/.org/.net`; `coupon-used-notify` separately dry-runs. Live mail credentials are forbidden in Test mode. UI text may still say “sent”; interpret that as simulated delivery only.

Use Cloudflare's official always-pass **Test** Turnstile site/secret pair for success paths; swap to the always-fail pair in Test scope for negative cases. The real Siteverify request remains in use. Test keys must never be added to Production. Public site key is expected in config; private secret must remain Functions-only.

## UI regression checklist (mark PASS/FAIL/NOT TESTED with Test URL and fixture ID)

1. Community: anonymous text create; image create and signed upload; edit and delete with author password; comment create/delete; Turnstile pass/fail; admin approve/hide/delete. Check anon direct Storage writes remain denied after Migration A.
2. Coupon: display; email issue; raffle entry; duplicate issue/entry; manual draw/redraw; winner handling; code redemption; admin create/edit/delete; explicit POST to raffle-auto-draw; verify no external mail request and dry-run IDs only. Production automatic due-time/legacy issuance behavior remains NOT TESTED.
3. Event: admin `posts` create/edit/delete and public rendering, including active/expired state.
4. Special: Lunch and Happy Hour create/edit/deactivate and public rendering, including item rows.
5. Images: business, coupon, Special admin uploads; Community signed upload and public read; negative anon overwrite/delete.

Run this list once before and once after Migration A on the same isolated site and Test DB. Any FAIL blocks Production-readiness judgment.
