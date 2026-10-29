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
