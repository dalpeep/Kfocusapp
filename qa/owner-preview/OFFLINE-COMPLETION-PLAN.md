# Owner offline completion — reviewed candidate, not applied

Scope: isolated development only. PR #52, shared QA, Production, deployment gates and secrets remain unchanged.

## Candidate changes and order

1. Keep Owner/Worker/v2/cancellation OFF; notifications mock. Retain validated QA six migrations and encrypted backup; obtain a NEW schema/catalog and data-count baseline immediately before any future approved SQL.
2. Review `14-coupon-v2-lifecycle.sql`: one private cancellation ledger and one service-role-only RPC. No historical backfill, deleted records, public grants, old RPC replacement or notification-provider changes. Verify the live `coupon_entries.status` constraint permits `cancelled` (existing reserve code already recognizes this status), notification columns and FK types.
3. Review `15-owner-special-validation.sql`: wrap the existing content command, retain its delegate and ACLs. No row rewrite, public policy replacement, Storage change or customer-renderer change. Recheck the existing delegate chain and object-name collisions.
4. Apply only after separate shared-QA SQL approval; compare object definitions/ACLs and preserved counts after each transaction. Any error: STOP, no automatic retry. Neither candidate is authorized for Production. Explicit project guard accepts QA only, or an unset ref in the synthetic fixture.
5. Separate Preview approval: exact Site/QA ref/PR/head/context, private protection, QA-only Service Role proof, quarantine bucket mapping; Owner QA allowlist only, Worker OFF/mock; no production credentials/routes. Cancellation flag `OWNER_COUPON_V2_CANCEL_ENABLED` stays absent/false until migration and canary approved.

## Rollback / data retention

Before applying, record pg_get_functiondef, owner, grants, policy definitions, counts and encrypted backup manifest. Restore test backup into an isolated database first. Storage bytes need their separate verified backup; DB dump alone does not restore Storage files or hosted Auth signing/session configuration.

On errors disable the new cancellation gate/Owner QA access and worker, retain all ledgers. Restore prior static/functions artifact after separate deployment approval. For migration 14 revoke execution on the new lifecycle RPC and retain the private cancellation table and audit records; never silently reissue cancelled codes or delete cancellation history. Restore the old list RPC route with cancellation gate OFF. Migration 15 can restore the exact saved original public wrapper after checking no later dependent change exists; keep its internal delegate until dependency review. Do not blindly DROP CASCADE or roll back by deleting rows. Any rollback SQL requires separate approval.

## Canary plan (not executed)

Use approved synthetic QA business/accounts only. Snapshot membership/tier/paid_enabled, business/coupon/event/special rows and Storage object list. Free: four template create/edit/end, direct image/free-prose bypass denied. Paid: existing approved temporary-tier process with original-state restoration; JPEG/PNG/WebP <=5242880 bytes, invalid MIME/signature/oversize/cross-business paths denied. Ko/en application/claim; regional approve/reject/revoke and super-admin scope; customer public visibility/date boundary; v2 reserve/use/cancel/replay/limits with mock delivery. Capture PC1280/mobile375. Distinguish UI mocks, synthetic service integration and actual Preview E2E; never label the latter PASS before execution.

Cancellation cancels an UNUSED issued entry, not a used redemption reversal or financial refund. Same customer remains blocked from reissue by the original uniqueness policy; cancelled inventory is released according to existing reserve policy. No automatic billing/subscription-expiry job exists: grade/paid_enabled enforcement is existing server policy, data is retained on downgrade. Ordinary `discount` special discovery must be checked against existing customer presentation; no customer renderer was changed here.

## Operational blockers

Netlify Scope403 resolution; separately approved QA Preview/runtime identity authentication; actual shared Auth/Storage/UI E2E; paid temporary tier approval; new SQL14/15 review/application approval; actual email/inbox test separate approval. No production activation, migration, email or deploy is included in this branch.
