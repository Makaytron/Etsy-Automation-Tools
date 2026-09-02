# Behavioral UI Contract — Etsy Ads Keyword Manager

Baseline version: **1.0.3**
Source: `scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js`

## Mount/isolation

- Current UI is not Shadow DOM based.
- Existing UI classes use the `maw-` family and must stay scoped/prefixed during the pilot.
- Do not introduce a Shadow DOM conversion in the visual-migration commit.

## Protected behavior hooks observed

- `data-panel-state`
- `data-panel-status-title`
- `data-panel-status-text`
- `data-collapse`
- `data-script-update-check`
- `data-script-update-banner`
- `data-script-update-message`
- `data-script-update-install`

All other `data-*` attributes queried or delegated by the script are also protected even if not listed here.

## Protected domains

Do not change in MKUI migration:

- Etsy Ads table/control/pagination/verification selectors
- keyword scanning and matching logic
- keyword rule source/update flow
- apply/verification behavior
- telemetry/storage contracts
- userscript grants/connect/match URLs

## Pilot target

This is the first production MKUI migration. Prefer adding MKUI presentation classes/tokens while retaining existing behavior attributes and event topology.

## Command Center v1 source map

- Surface: Ads Keyword Manager main panel and responsive keyword-rule editor
- Template source ids: `template.shell.base-layout`, `template.shell.site-header`, `template.theme.tokens`, `template.primitive.card`, `template.primitive.button`, `template.primitive.input`, `template.primitive.table`
- Exact template locators: `Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/layouts/base-layout.tsx`, `Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/site-header.tsx`, `Makaytron/Tamplate-Back-White-01@main:vite-version/src/index.css`, `Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/ui/card.tsx`, `Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/ui/button.tsx`, `Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/ui/input.tsx`, `Makaytron/Tamplate-Back-White-01@main:vite-version/src/components/ui/table.tsx`
- Applied composition: `shadcn.dashboard.applied` — the sidebar/header/content hierarchy is translated into the standalone Compact shell without importing unrelated dashboard features
- Block sources: `shadcn.blocks.application-interface` — **Application Interface 2**; `shadcn.blocks.datatable` — **Data Table 2**
- Toast source: N/A — this presentation pass does not add or modify transient feedback; the existing toast behavior remains untouched
- Makaytron adaptation: 464 px responsive command surface, sticky header, two-by-two metric grid, three-tier action hierarchy, readable Turkish labels, isolated all-pages warning region, 960 px two-column rule editor, mobile single-column layout, and reduced-motion fallback
- Preserved behavior: all existing ids and data hooks, Etsy selectors, storage keys, confirmation boundaries, pagination, request sequencing, verification, retry, and fail-closed behavior
- Evidence: `docs/design/previews/ads-keyword-manager-command-center-v1.html`, `docs/design/previews/ads-keyword-manager-command-center-v1.audit.json`, `assets/screenshots/ads-keywords-panel-ready.png`, `assets/screenshots/ads-keywords-rule-editor.png`, focused behavior/presentation tests, MKUI drift checks, and cross-script coexistence audit
