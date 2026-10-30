QA Git-link bootstrap: intentionally not an application or deploy candidate.

Only select this branch on daltownmap-owner-uuid-qa, after separate Git-link
approval. Do not connect it to the operational site. Do not merge it into main
or PR #52. It is an orphan branch with a minimal tracked tree, not the app tree.

Connection form:
Repository: dalpeep/Kfocusapp
Branch: dev/qa-netlify-link-bootstrap-20261029
Base directory: . (root; blank is equivalent)
Build command: node build-stop.cjs
Publish directory: public
Functions directory: empty-functions
Package directory: blank

Two gates: ignore="exit 0" requests cancellation; if the platform bypasses
the ignore check, the command exits 78 unconditionally. A canceled or failed
build is expected. Do not retry it to obtain Ready status. No Functions,
scheduled jobs, application files, SDKs, dependencies, DB requests, credential
reads, mail sends or public diagnostic endpoints exist in this tree.

Netlify file configuration overrides matching UI settings. The root netlify.toml
has explicit base, command, publish and Functions paths. It has no context
overrides or plugins. Do not choose a different config/package/base path,
run a different commit, or enable a framework preset. A changed source/config
or UI-installed Build Plugin is outside this proof and requires review.

Pre-link checks (read-only, then separately approved changes if necessary):
1. Record the QA Published deployment and lock; preserve the operational site.
2. Review QA Production-context resolved variables, including team shared and
   branch-specific overrides. Never assume Preview values apply to the
   initial default-branch build. Verify QA URL; treat masked credentials as
   unverified, not as a matching QA key. Do not copy production secrets.
3. Check QA UI-installed build plugins, integrations, custom config/package
   paths, NODE_OPTIONS, BASH_ENV and install-command overrides. They must not
   execute unrelated code before the stop command. Stop if not verified.
4. Existing QA Production credentials are NOT removed by this source tree.
   To prevent injection itself, a separately approved QA-only context change
   is required. This branch never reads them, but does not claim to sanitize
   Netlify's build environment or platform integrations.
5. Confirm exact branch commit and seven tracked files, protected publishing,
   then separately approve linking. No Netlify connection/build is authorized
   by this branch's CI. Do not unlock publishing.
6. After linking, confirm canceled/failed bootstrap, unchanged QA Published ID,
   no Function upload, and no app/DB/email activity; stop further builds.

PR #52 Preview verification is a later, separate step. This branch cannot
validate a Service Role key, build the Owner application, or create its Preview.
Do not change the default branch to main as part of bootstrap linking.

Rollback: if linking/configuration behaves unexpectedly, keep publishing locked,
stop builds and retain the existing QA Published deployment. Capture the
unexpected state and seek approval before changing Git/configuration again.

Official references:
https://docs.netlify.com/build/configure-builds/file-based-configuration/
https://docs.netlify.com/build/configure-builds/stop-or-activate-builds/


2026-10-30 verifier review candidate (NO NETLIFY EXECUTION):
The new verify.mjs is not the configured build command; build-stop.cjs and
ignore=exit 0 remain unchanged. CI supplies synthetic metadata and mocked fetch.
Draft PR base: dev/qa-key-verifier-review-base-20261030, a review-only branch
at the original safe bootstrap commit. This base is NOT a Netlify production
or branch-deploy-enabled branch on either QA or the operational site. Keep
this base until explicit one-off execution approval. Do not target main.

The verifier separates CONTEXT, SITE_ID, PULL_REQUEST, REVIEW_ID, HEAD,
BRANCH checkout reference, COMMIT_REF and explicit approval. All are mandatory.
Each failure has an allowlisted safe code and boolean check results; environment
values, tokens, credentials and raw Supabase responses are never printed.
HEAD must match the approved source branch. BRANCH must match pull/PR/head
(or refs/pull/PR/head) for the exact approved PR number. This is intentionally
strict; an unknown checkout format is BLOCKED and must not be silently accepted.
QA URL is a fixed allowlist, production project credentials fail before fetch.
Only one QA zero-row GET can occur; no redirects, retries, Storage, writes,
mail, coupon issuance or Worker execution. Unexpected runtime errors are redacted.

A later, separately approved execution would require:
- QA Private logs, publishing lock, Owner/Worker OFF, mock, no provider keys.
- Exact current QA site and QA credential verification guards.
- Retarget only this temporary PR to the QA safe default branch.
- Use a reviewed execution commit with ignore=exit 1 and command=node verify.mjs.
- QA Preview-only approval flag, exact PR ID, source HEAD and pinned Commit.
- One actual execution, always exit 78 before artifacts; collect safe result.
- Close temporary PR, remove execution branch/flags, confirm both Published IDs,
  QA lock, operational Firewall, main and PR #52 unchanged. Preserve audit logs.
Retargeting or changing the command/ignore flag may trigger a Preview and is NOT
approved now. Do not create environment flags or trigger/retry any Netlify build.
This candidate does not relax the Owner Production-only environment guard.
