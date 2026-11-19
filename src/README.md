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
| `modules/index.js` | The five tools: moved-in tools and placeholders for the ones still in their standalone scripts. |
| `modules/sale-manager.js` | Sale Manager. Its engine is the standalone script itself, adopted at build time by `tools/Unified-Adopt-Sale-Manager.mjs`, so its 50 safety tests keep covering the code that runs. The engine starts once per page after a short grace period and never while the standalone Sale Manager runs on the same page (it also steps aside if that one appears later). |
| `modules/sale-manager-ui.js` | Sale Manager screens: the series card in the drawer (ready, running with progress, paused with Continue / Skip this day / Stop), the start confirmation listing every code, and the workspace page with Overview (KPI tiles and the planned campaigns table), Settings (dates, days per campaign, discount, code text, resume after reload; locked while a series runs) and Report (table, CSV and Excel). The screens read the engine snapshot and call its own actions, so its safety rules decide what happens on Etsy. Sources: `card`, `table`, `badge`, `progress`, `button`, `input`, `checkbox`, `tabs`, `dialog`, `shadcn.blocks.kpi-widgets`, `shadcn.blocks.datatable`. |
| `modules/adopted-tool.js` | Generic module for a tool whose engine is an adopted standalone script (Ads Keyword Manager today): same grace period, standalone-copy guard, tool switch and namespaced storage as Sale Manager. The engine shows its own panel until the tool's new screens arrive. |
| `core/scoped-gm.js` | The `GM` object an adopted engine sees: its keys live under `<tool>:legacy.<key>` (where the transfer writes), menu commands are dropped, resources come from the build, and the script info has no update URLs. |
| `ui/shell.js` | Edge button and drawer on seller pages, inside a closed shadow root. Click or Enter opens, Escape closes, dragging snaps the button to the nearest edge and saves it. Shopping pages get nothing. |
| `ui/styles.js` | Shell styles. Sources: `template.primitive.sheet` (non-modal), `template.primitive.button`, `template.theme.tokens` via `shared/mkui/tokens.css`, `shadcn.dashboard.applied`, `shadcn.blocks.application-shell` block "App Shell 2". |
| `ui/workspace.js` | Full-window workspace opened from the drawer: sidebar (tools, Makaytron Pro, Settings), header with "back to the drawer" and close, and pages. Escape returns to the drawer. Narrow windows get the icon rail. |
| `ui/settings-page.js`, `ui/controls.js`, `ui/styles-workspace.js` | Settings (General: theme, density, language, drawer edge and behaviour; Tools: turn tools and Pro suggestions on or off; Privacy and data: backup download/restore and deleting local data with typed confirmation, API keys only when ticked). Sources: `template.shell.base-layout`, `template.shell.app-sidebar`, `template.shell.site-header`, `template.navigation.nav-main`, `template.primitive.sidebar`, `card`, `tabs`, `checkbox`, `select`, `input`, `dialog`. The registry has no switch or slider, so on/off settings use the checkbox and the position along the edge is set by dragging. |
| `ui/onboarding.js` | First-run setup on the first seller page: language (opens in the browser language), then tools. Escape postpones it to the next seller page. Sources: `template.primitive.dialog`, `progress`, `select`, `checkbox`, `badge`, `button`; the registry has no radio list, so the language uses the select. |
| Settings › Privacy and data › transfer | The visible side of `core/migration.js`: steps, "Start the transfer", a result table (`template.primitive.table`, `badge`) with the 4-digit check code the standalone script also shows. |
| `ui/strings.js`, `ui/strings-workspace.js`, `ui/text.js`, `ui/icons.js`, `ui/dom.js` | Interface strings (English source, Turkish bundled until phase 6), lucide icon paths, and text-only DOM helpers. |

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

`main.js` is the entry. The build inlines `shared/lifecycle/spa-lifecycle.js`, `shared/migration/handoff.js`, `shared/mkui/tokens.css` and the logo, wraps every module in one closure, and renders the header from `meta.js`. It accepts only named relative imports and `export` on declarations; other module syntax, `eval`, `new Function`, `require`, and dynamic `import()` fail the build. The output is a development build: its header has no `@updateURL`/`@downloadURL` until the script is registered as a production package.

## Tests

```bash
node --test tools/Test-Unified-Core.mjs tools/Test-Unified-Host-Lifecycle.mjs tools/Test-Unified-Migration.mjs tools/Test-Unified-Build.mjs tools/Test-Unified-Shell-Browser.mjs
```

`Test-Unified-Host-Lifecycle.mjs` runs the host against the real shared lifecycle source. `Test-Unified-Migration.mjs` runs both ends of the transfer. `Test-Unified-Shell-Browser.mjs` runs the built script in real Chrome on fake Etsy pages (set `CHROME_PATH` if Chrome is elsewhere; `EAT_SCREENSHOTS=<dir>` also saves screenshots). `Test-Unified-Build.mjs` checks determinism and the header, then runs the built file in a sandbox with a fake userscript manager. `.github/workflows/unified-script-ci.yml` runs all of them.

## Roadmap

1. Core structure (done).
2. Single-file deterministic build and product CI (done). MKUI is inlined together with the UI shell in step 4.
3. Transfer protocol and receiving side (done). The standalone scripts get the sending side, the "Aktar" button and `@grant GM.listValues` (Listing Analyzer reads its per-listing keys) in step 7.
4. Shared UI shell: edge button and drawer, workspace and settings, first-run setup and the transfer screen (done).
5. Move tools in: Sale Manager (engine adopted, new screens done; the part-based code builder in the design needs a change to the standalone engine first), Ads Keyword Manager (engine adopted; new screens next), Keyword & Market Analyzer, Message Assistant, Listing Analyzer.

## Adopted engines

`tools/Unified-Adopt.mjs` holds the shared rules (exact entry marker, exact closing block, counted edits, and a prologue that gives the engine only the unified shims: `GM` for storage, `GM_xmlhttpRequest` through the unified `GM.xmlHttpRequest`, no script info, no-op menu commands). `tools/Unified-Adopt-Ads-Keyword-Manager.mjs` uses it: element ids get an `eat-ads-` prefix, the route gate and the usage-metrics switch are the same as Sale Manager, and the standalone self-start becomes `start()`. Its default word list still comes from the repository (`keyword-rules.txt`); that is the only request it makes.

`tools/Unified-Adopt-Sale-Manager.mjs` turns the standalone Sale Manager body into `createAdoptedSaleManager(__env)`. Its edit list is short and exact; each edit must match the expected number of times or the build fails:

- page-level names (panel and toast ids, Web Locks name, BroadcastChannel, sessionStorage keys) get an `eat-sale-` prefix so a standalone copy on the same tab is never touched;
- the route predicate also asks the unified script whether the tool may run (turned on, no standalone copy present);
- usage metrics stay with the standalone package;
- `renderPanel()` notifies the unified screens, and the factory returns a small surface: `snapshot()` (config, job, last report and the planned campaigns computed by the engine's own `buildPlan`) and the engine's own actions (`start`, `retry`, `skip`, `stop`, `updateConfig`, CSV/Excel download, open the create-sale page). The old panel is hidden by a style rule; the engine's notices still show.

Fixes made in the standalone Sale Manager reach the unified script with the next build. `tools/Test-Unified-Sale-Manager.mjs` covers the edits and the GM shim; the Chrome test runs the engine on a fake Sales & Discounts page, checks it reads transferred data, writes only under `eat:` and makes no network request, and checks it stays off when the standalone script is present.
6. Language packs.
7. Distribution: registry entry, hosted channels, migration notice in the standalone scripts (kept for six months).
8. Release.
