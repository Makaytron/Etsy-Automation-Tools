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
- [x] Pilot wired into Ads Keyword Manager (`1.0.4`, MKUI source `1.0.0`)
- [x] Pilot regression gate passed (behavior tests, syntax, metadata/hook invariants, browser/distribution/privacy follow-up)
- [x] Message Assistant account-specific public placeholder blocker removed and verified (`1.2.8`)
- [ ] Keyword & Market Analyzer migration
- [ ] Sale Manager migration
- [ ] Message Assistant MKUI migration
- [ ] Listing Analyzer MKUI migration
- [ ] Cross-script integration QA
- [ ] MKUI bundle/version drift CI

## Phase 0 — Freeze behavior contracts

Before editing a production UI, record version, match routes, Shadow DOM mode, global/in-shadow surfaces, important data hooks and protected business domains. Contract files live in `docs/design/contracts/`.

## Phase 1 — MKUI source foundation

`shared/mkui/` is source-only during the first stage. Nothing references it yet, so adding the directory cannot change installed userscript behavior.

## Phase 2 — Ads Keyword Manager pilot — COMPLETE

Migration constraints:

- presentation-only first pass
- preserve all `data-*` hooks
- preserve Etsy selectors and mutation logic
- preserve storage and telemetry
- preserve update flow
- preserve enabled/disabled/busy semantics

Result: the public script is `1.0.4` and carries the first MKUI `1.0.0` presentation mapping without changing protected userscript metadata or business behavior.

## Phase 3 — Pilot gate — COMPLETE

The Ads pilot passed the existing behavior suite, JavaScript syntax validation, protected hook/metadata invariants and patch-hygiene checks. The subsequent repository privacy/distribution pass also exposed and removed an unrelated account-specific Message Assistant placeholder before the migration continued. Public `main` then passed the privacy guard, Message Assistant behavior/browser checks and the complete distribution gate.

## Phase 4 — Keyword & Market Analyzer — ACTIVE

Preserve open Shadow DOM. Its Etsy-inline metrics/research surfaces remain separate from the panel shell; only their visual tokens are harmonized.

Additional gate for this phase:

- create a deterministic exact-anchor UI transformer on an isolated branch
- preserve `@match`, `@grant`, `@connect`, `@updateURL` and `@downloadURL`
- preserve Shadow DOM mode and host id
- preserve every existing `data-action` / `data-*` hook count used by the UI
- run updater/distribution checks and add a focused Keyword & Market Analyzer regression test if the repository has no existing dedicated test
- do not merge until privacy and distribution checks are green

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
