# MKUI v1 Migration Plan

## Scope

1. Etsy Ads Keyword Manager
2. Etsy Keyword & Market Analyzer
3. Etsy Sale Manager
4. Makaytron Etsy Message Assistant
5. Makaytron Etsy Listing Analyzer

Reference design: `Makaytron/Tamplate-Back-White-01`.

## Current status

- [x] Architecture/design review
- [x] Initial userscript inventory
- [x] Behavioral contract files created
- [x] MKUI source-only foundation created
- [ ] Pilot wired into Ads Keyword Manager
- [ ] Pilot regression gate passed
- [ ] Remaining four migrations
- [ ] Cross-script integration QA
- [ ] MKUI bundle/version drift CI

## Phase 0 — Freeze behavior contracts

Before editing a production UI, record version, match routes, Shadow DOM mode, global/in-shadow surfaces, important data hooks and protected business domains. Contract files live in `docs/design/contracts/`.

## Phase 1 — MKUI source foundation

`shared/mkui/` is source-only during the first stage. Nothing references it yet, so adding the directory cannot change installed userscript behavior.

## Phase 2 — Ads Keyword Manager pilot

Migration constraints:

- presentation-only first pass
- preserve all `data-*` hooks
- preserve Etsy selectors and mutation logic
- preserve storage and telemetry
- preserve update flow
- preserve enabled/disabled/busy semantics

Pilot QA must cover launcher/open/collapse/reopen, scan lifecycle, rule editing/apply, error/success state, language, update UI, page mutation/navigation and narrow viewport behavior.

## Phase 3 — Pilot gate

Do not start the other four production migrations until the Ads pilot passes:

- existing functional regression suite
- synthetic UI fixture/screenshot check
- Etsy CSS leakage check
- keyboard/focus check
- no storage schema change
- no network/grant change unless separately justified

## Phase 4 — Keyword & Market Analyzer

Preserve open Shadow DOM. Its Etsy-inline metrics/research surfaces remain separate from the panel shell; only their visual tokens are harmonized.

## Phase 5 — Sale Manager

Treat all sale creation/campaign actions as high-risk write paths. Confirmation, busy/disabled state, verification and retry protections must pass unchanged.

## Phase 6 — Message Assistant

Preserve closed Shadow DOM. First migration maps the existing base/launcher/UX/premium layers onto MKUI semantics; CSS cleanup is a later commit after behavior parity.

## Phase 7 — Listing Analyzer

Migrate last, but use it as the reference for dashboard shell geometry. Preserve navigation state, filter drawer, listing selection, queue/AI/settings views, keyboard shortcuts and publish/deactivate verification.

## Phase 8 — Cross-script QA

When multiple scripts may run in one Etsy session, verify:

- no host/id collisions
- no launcher collisions
- no unintended CSS leakage
- sane z-index stacking
- modal/toast coexistence
- no shortcut collisions
- no scroll-lock conflicts

## Phase 9 — Drift protection

After all five scripts are migrated, generate `MKUI_VERSION` and bundle hash into each script and fail CI when a production script drifts from the canonical MKUI bundle without an explicit exception.
