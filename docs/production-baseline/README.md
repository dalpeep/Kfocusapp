# DaltownMap Production Baseline — Phase 1-A

Captured: 2026-09-18 (America/Chicago)

This document is a read-only baseline of the production application at
`https://daltownmap.com`. Phase 1-A does not change application behavior,
Supabase, Netlify Functions, or the production deployment.

The only repository used for this baseline is `_git-main-clean`. The parent
`Kfocusapp-main` copy is not a deployment source.

## Rollback identity

The production baseline is a composite rather than a single clean commit:

- Base Git commit: `6171add2cee7d159233fb3b915ea759b74e2a6f7`
- Commit subject: `V269.1 fix current flyer selection and price block validation`
- Public entry point and public core assets are content-equivalent to that
  commit. Some byte hashes differ only because the deployed file and Windows
  checkout use different LF/CRLF line endings.
- The deployed admin entry point, admin stylesheet, and admin main module match
  the current uncommitted working-tree files byte-for-byte.
- The deployed traffic-source function was produced from the current
  uncommitted `netlify/functions/traffic-source-track.js` overlay.

The exact SHA-256 and Git blob identities are recorded in
`production-assets.json`. A rollback must use the base commit plus every entry
whose `rollbackLayer` is `production-overlay`; checking out the base commit
alone would revert the currently deployed admin traffic-analysis work.

## Production entry points

| Surface | Entry point | Purpose |
| --- | --- | --- |
| Public web | `/` or `/index.html` | Main map and discovery application |
| Admin | `/admin/` (`admin/index.html`) | Authenticated administration UI |
| PWA | `/manifest.json?v=263` | Install metadata; start URL is `/?source=pwa` |
| Push worker | `/OneSignalSDKWorker.js` | Imports the OneSignal service worker |
| Runtime config | `/.netlify/functions/config` | Populates public browser configuration |
| Functions | `/.netlify/functions/*` | Server-side Supabase, scheduled, and AI operations |

There is no DaltownMap application-shell cache service worker in the repository.
`OneSignalSDKWorker.js` is the only production worker entry point identified.

## Public dependency map and loading order

`index.html` loads the following resources in document order:

1. Google Analytics `gtag.js` for `G-8RXPTSNPBV`.
2. `/manifest.json?v=263`.
3. `/styles.css?v=269.1-flyer-main`.
4. `/.netlify/functions/config`.
5. Supabase browser UMD bundle from jsDelivr.
6. OneSignal Web SDK v16 with `defer`, followed by inline initialization.
7. A second reference to the same Supabase UMD bundle near the application
   bootstrap section.
8. `/assets/home-selection.js?v=313`.
9. `/app-v99.js?v=269.1-flyer-main`.
10. `/main-banners.js?v=263`.
11. Inline promotion-popup runtime and other page bootstrap scripts.
12. Lucide from unpkg, followed by inline icon initialization.

Dependency flow:

```text
index.html
├─ Netlify config function → window.APP_CONFIG / window.KFOCUS_CONFIG
├─ Supabase UMD → public REST/client globals
├─ OneSignal SDK → OneSignalSDKWorker.js
├─ home-selection.js → globalThis.DtmHomeSelection
├─ app-v99.js → DtmHomeSelection, config, Supabase, DOM
├─ main-banners.js → config/Supabase/DOM
└─ inline popup runtime → home settings, localStorage, DOM
```

`app.js` and `app-v96.js`, `app-v97.js`, `app-v109.js`, `app-v110.js`, and
`app-v111.js` are not referenced by the production public entry point. They are
retained unchanged during Phase 1-A.

## Admin dependency map and loading order

`admin/index.html` loads:

1. `assets/admin.css?v=45.8.1`.
2. `/.netlify/functions/config`.
3. Supabase browser UMD bundle from jsDelivr.
4. `/assets/home-selection.js?v=313`.
5. `assets/admin.js?v=269-price-block-traffic293` as an ES module.
6. `assets/event-routines.js?v=86.0-alert-business-fallback` as an ES module.
7. `assets/newsroom-test.js?v=59.0` as an ES module.
8. `assets/ai-studio.js?v=24.1.0` as an ES module.
9. `assets/ai-manager.js?v=24.0.1` as a deferred classic script.
10. `assets/admin-integration.js?v=27.0.0` as a deferred classic script.
11. `assets/business-crm.js?v=24.1.0` as a deferred classic script.

Additional module dependencies:

- `admin/assets/admin.js` imports
  `admin/assets/exposure-preview.js?v=300` and the Supabase ESM bundle.
- `admin/assets/newsroom-test.js` imports the Supabase ESM bundle.
- The repository-root `admin.js` is not referenced by `admin/index.html`.

```text
admin/index.html
├─ config function
├─ Supabase UMD
├─ home-selection.js
├─ admin/assets/admin.js
│  ├─ exposure-preview.js?v=300
│  └─ Supabase ESM
├─ event-routines.js
├─ newsroom-test.js → Supabase ESM
├─ ai-studio.js
├─ ai-manager.js
├─ admin-integration.js
└─ business-crm.js
```

## Netlify and cache dependencies

`netlify.toml` defines two schedules:

- `raffle-auto-draw`: every 10 minutes.
- `daily-core-refresh`: daily at 11:15 UTC.

It sets revalidation/no-cache headers for `/`, `/index.html`, `/manifest.json`,
`/app-v99.js`, `/main-banners.js`, and `/styles.css`. The active Netlify local
configuration publishes this repository root and uses `netlify/functions` as
the Functions directory. The build command is `node scripts/generate-seo.js`.

## Git HEAD versus production

The public entry point, `main-banners.js`, manifest, worker, and public core
assets are logically identical to the current Git HEAD. For `styles.css`,
`home-selection.js`, and `app-v99.js`, normalized-content hashes match and the
raw-byte difference is line endings only.

The following production files differ from Git HEAD and match the working tree:

- `admin/index.html`
- `admin/assets/admin.css`
- `admin/assets/admin.js`
- `netlify/functions/traffic-source-track.js` (deployed function overlay)

Generated SEO files currently present as working-tree changes were not part of
the known production overlay and are not part of this rollback baseline.

## Phase 1-B first three targets

1. Establish one authoritative recommendation render path and characterize the
   current admin-direct, paid, featured, new, and popular outcomes before
   disabling any repeated controller.
2. Introduce one America/Chicago date-boundary contract, initially behind tests,
   for paid visibility, new-business status, benefits, and popup expiration.
3. Add request identity/stale-response protection and instrumentation to the
   duplicate public data loaders before removing retries or fallback paths.

These targets must be implemented incrementally. Supabase schema/data, public UI,
and production deployment remain outside Phase 1-A.
