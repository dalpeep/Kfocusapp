# Migration A — disposable Supabase Test Project

These files are **not** a Production schema dump. They reproduce the inspected
policy names/count and the smallest table/Storage shape needed to exercise
Migration A. The legacy policy expressions are intentionally permissive test
emulations. No customer data, business rows, applicant emails, or coupon codes
are included. Do not use this fixture to prove that all Production application
features work; run the real Deploy Preview/Function smoke separately.

## Dashboard preparation

1. Create a new disposable Supabase project. Record its project ref, API URL,
   anon key, and service-role key privately. Verify its ref is **not**
   `ydrxuqmjzayejlnjzzew` (Production).
2. In Authentication, enable email/password for this Test Project only. Create
   four confirmed synthetic users: `admin@test.invalid`, `user@test.invalid`,
   `owner-a@test.invalid`, `owner-b@test.invalid`. Use unique test passwords.
   These addresses must never be used to contact a person.
3. Do not link a Production Netlify site or copy Production environment values.
   Keep the Test Project URL/keys/passwords out of Git and chat screenshots.

## Exact order

1. SQL Editor: `01-test-schema.sql` on the **new empty Test Project**.
2. SQL Editor: `02-test-current-policies.sql` on that same project. This creates
   synthetic legacy policy names and seven test Storage buckets.
3. SQL Editor: `03-test-fixtures.sql` after the four test Auth users exist.
4. Save a pre-migration read-only snapshot of `pg_policies`, `information_schema.table_privileges`,
   `pg_class.relrowsecurity`, and `storage.buckets`. Export results locally;
   do not include Auth IDs or secret values.
5. Run `node 05-migration-a-tests.cjs before` with **Test Project** environment
   variables. Baseline should show deliberately excessive writes.
6. SQL Editor: run the unchanged `../owner-phase1b-security-a.sql` (Migration A).
   Confirm its transaction commits and policy backup has 43 rows.
7. Run `node 05-migration-a-tests.cjs after`; compare with baseline. Run the
   additional Function/UI cases listed below on a Deploy Preview configured
   exclusively for this Test Project.
8. SQL Editor: run the unchanged `../owner-phase1b-security-a-rollback.sql`.
9. Run `node 05-migration-a-tests.cjs rollback`. Compare policy names,
   definitions, GRANTs, and RLS settings to the saved pre-migration snapshot.
10. Discard the Test Project after recording results. No Production migration.

## Managed Storage TRUNCATE exception

Migration A revokes TRUNCATE on the six application-owned `public` tables, but
does **not** revoke or restore TRUNCATE on `storage.objects`. On the isolated
Test Project, `storage.objects` is owned by `supabase_storage_admin`; both that
role and `postgres` granted TRUNCATE to `anon`/`authenticated`. The Dashboard
SQL Editor runs as non-superuser `postgres`, which cannot SET ROLE to the
Storage owner. Its REVOKE removed only its own grant; the owner's grant remained,
so the original all-table TRUNCATE assertion aborted and rolled back the entire
migration. Changing the managed owner's grants or role membership is outside
this migration's scope and could interfere with Supabase Storage operations.
The revised migration and rollback leave all `storage.objects` TRUNCATE grants
untouched. They instead narrow object INSERT/UPDATE/DELETE through Storage RLS.
This is a documented DB-level residual privilege, **not** a claim that RLS
protects TRUNCATE; it remains a separate security review item before Production.

The Node script requires `OWNER_TEST_URL`, `OWNER_TEST_ANON_KEY`,
`OWNER_TEST_SERVICE_KEY`, and four `OWNER_TEST_ADMIN_PASSWORD`,
`OWNER_TEST_USER_PASSWORD`, `OWNER_TEST_OWNER_A_PASSWORD`,
`OWNER_TEST_OWNER_B_PASSWORD` environment variables. Set them only in the
local terminal session or a secure secret manager. The script rejects the
known Production project ref and never prints credentials.

## What the API script checks

It authenticates real test users and sends REST/Storage requests with actual
anon, authenticated, administrator, and service-role credentials. It checks
public business reads and requests; direct businesses/coupons/posts INSERT;
administrator INSERT; an anonymous Community server-path stand-in RPC;
public-images/admin/community-images uploads; and anonymous Storage overwrite
and delete. Test-only objects/rows remain in the disposable project.

## Mandatory additional tests before Migration A is approved

The minimal schema cannot run every existing Netlify Function or full UI. On
an isolated Deploy Preview wired to the Test Project, exercise actual
`community-post-create`, update, delete, and signed image upload with Test
Turnstile; admin businesses/coupons/posts INSERT/UPDATE/DELETE; business
request moderation; Lunch Special and Happy Hour CRUD; coupon issuance,
entry, and draw with test-only records; and admin image upload/update/delete.
Use separate test keys/secrets. A Function that needs a table absent from this
minimal fixture requires that table's **schema only** to be added to the Test
Project before its smoke test. Record this as a coverage gap until executed.

Do not classify the Node script alone as full regression PASS. In particular,
coupon issuance/entry/draw, Community password/Turnstile mutations, and real
signed-upload behavior require the existing Functions and their additional
schemas. A failure in any mandatory case blocks Production Migration A.
