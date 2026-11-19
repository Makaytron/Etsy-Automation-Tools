# Etsy Automation Tools: unified script source

This folder holds the source of the single userscript that will replace the five standalone Makaytron scripts. It is **not a production package yet**: nothing here is registered in `config/production-packages.json`, and no `.user.js` file is built. The standalone scripts under `scripts/` remain the production code.

## Layout

| Path | Purpose |
| --- | --- |
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
| `modules/index.js` | Declarations of the five tools. Their code moves here in phase 5. |

## Tests

```bash
node --test tools/Test-Unified-Core.mjs tools/Test-Unified-Host-Lifecycle.mjs
```

`Test-Unified-Host-Lifecycle.mjs` runs the host against the real shared lifecycle source.

## Roadmap

1. **Core structure** (this folder).
2. Build: render `meta.js`, inline the shared lifecycle and MKUI, bundle into one deterministic `.user.js`; add product CI.
3. Storage migration handoff from the standalone scripts' final versions.
4. Shared UI shell: drawer, edge button, workspace, settings, onboarding.
5. Move tools in: Sale Manager, Ads Keyword Manager, Keyword & Market Analyzer, Message Assistant, Listing Analyzer.
6. Language packs.
7. Distribution: registry entry, hosted channels, migration notice in the standalone scripts (kept for six months).
8. Release.
