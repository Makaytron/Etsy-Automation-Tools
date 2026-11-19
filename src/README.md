# Etsy Automation Tools: unified script source

This folder holds the source of the single userscript that will replace the five standalone Makaytron scripts. It is **not a production package yet**: nothing here is registered in `config/production-packages.json`, and the built `.user.js` is a git-ignored development build. The standalone scripts under `scripts/` remain the production code.

## Layout

| Path | Purpose |
| --- | --- |
| `main.js` | Entry point: boots storage, settings, events and the host once per top-level document. |
| `meta.js` | Data for the future `==UserScript==` header: new identity, union of `@match`/`@grant`/`@connect`, `@antifeature`. |
| `core/routes.js` | Route table. Patterns are copied from each standalone script's `RUNTIME_ROUTE_PATTERN`; a test keeps them equal. Each route has a shop-name-free template for diagnostics. |
| `core/host.js` | Mounts exactly one tool for the current page on top of the shared SPA lifecycle (`shared/lifecycle/spa-lifecycle.js`). Every route change gives the tool a fresh context, so work from an earlier URL becomes stale. |
| `core/gm.js` | Value-store adapters for `GM.*`, `GM_*`, and memory (tests). |
| `core/storage.js` | Namespaced keys `eat:v1:<namespace>:<key>`. Secrets live under `eat:secret:` and are excluded from backups; they are cleared only on explicit request. |
| `core/settings.js` | Shared settings with defaults and validation (theme, density, language, drawer edge/offset, enabled tools). |
| `core/drawer-geometry.js` | Edge button and drawer geometry: the drawer opens from the button's side, from the left when the button is on the top or bottom edge. |
| `core/i18n.js` | Browser-language detection, bundled language-picker strings, downloaded and validated language packs with caching, RTL detection. |
| `core/diagnostics.js` | Problem reports built from an allowlist: version, browser family/major, OS family, locale/region, redacted route template, known error code, category, and a scrubbed note. |
| `core/events.js` | Small event bus. |
| `core/migration.js` | Receiving side of the one-time transfer from the standalone scripts: stores each tool's data under `legacy.<key>` in its namespace and records the transfer once. |
| `modules/index.js` | Declarations of the five tools. Their code moves here in phase 5. |

## Transfer from the standalone scripts

Userscript storage is private to each script, so the data moves on an Etsy tab where both scripts run. The protocol is in `shared/migration/handoff.js`, plain script inlined into this build and, in phase 7, into the final versions of the standalone scripts.

1. The user presses "Aktar" in a standalone script; its responder accepts requests for a short window and never while a job of that script is running.
2. The unified script sends a request with a fresh ECDH P-256 public key.
3. The standalone script answers with its public key and its data encrypted with AES-GCM (key from HKDF-SHA-256 over the shared secret, salted with the session id). Both sides can show the same 4-digit check code.
4. The unified script stores the data and acknowledges with a SHA-256 digest; the standalone script records the transfer and keeps its own data.

API keys and tokens are removed before encryption and again on receipt; the user enters them once in the unified script. Locks, leases, update checks and send/publication journals are not transferred. The transfer lists are tested against the keys the standalone scripts really use.

## Build

```bash
node tools/Build-Unified-Userscript.mjs          # writes dist/etsy-automation-tools.user.js (git-ignored)
node tools/Build-Unified-Userscript.mjs --check  # builds twice, fails unless byte-identical
```

`main.js` is the entry. The build inlines `shared/lifecycle/spa-lifecycle.js` and `shared/migration/handoff.js`, wraps every module in one closure, and renders the header from `meta.js`. It accepts only named relative imports and `export` on declarations; other module syntax, `eval`, `new Function`, `require`, and dynamic `import()` fail the build. The output is a development build: its header has no `@updateURL`/`@downloadURL` until the script is registered as a production package.

## Tests

```bash
node --test tools/Test-Unified-Core.mjs tools/Test-Unified-Host-Lifecycle.mjs tools/Test-Unified-Migration.mjs tools/Test-Unified-Build.mjs
```

`Test-Unified-Host-Lifecycle.mjs` runs the host against the real shared lifecycle source. `Test-Unified-Migration.mjs` runs both ends of the transfer. `Test-Unified-Build.mjs` checks determinism and the header, then runs the built file in a sandbox with a fake userscript manager. `.github/workflows/unified-script-ci.yml` runs all of them.

## Roadmap

1. Core structure (done).
2. Single-file deterministic build and product CI (done). MKUI is inlined together with the UI shell in step 4.
3. Transfer protocol and receiving side (done). The standalone scripts get the sending side, the "Aktar" button and `@grant GM.listValues` (Listing Analyzer reads its per-listing keys) in step 7.
4. Shared UI shell: drawer, edge button, workspace, settings, onboarding.
5. Move tools in: Sale Manager, Ads Keyword Manager, Keyword & Market Analyzer, Message Assistant, Listing Analyzer.
6. Language packs.
7. Distribution: registry entry, hosted channels, migration notice in the standalone scripts (kept for six months).
8. Release.
