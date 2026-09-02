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
- [x] Keyword & Market Analyzer migration
- [x] Sale Manager migration
- [ ] Message Assistant MKUI migration — ACTIVE
- [ ] Listing Analyzer MKUI migration
- [ ] Cross-script integration QA
- [ ] MKUI bundle/version drift CI

## Phase 0 — Freeze behavior contracts

Before editing a production UI, record version, match routes, Shadow DOM mode, global/in-shadow surfaces, important data hooks and protected business domains. Contract files live in `docs/design/contracts/`.

## Phase 1 — MKUI source foundation

`shared/mkui/` is the canonical framework-free visual source. Production userscripts receive an inlined/mapped copy; they do not fetch MKUI at runtime.

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

## Phase 4 — Keyword & Market Analyzer — COMPLETE

Open Shadow DOM and Etsy-inline research/metric surfaces were preserved. The migration is presentation-only and keeps protected metadata/data-hook invariants under focused regression coverage.

## Phase 5 — Sale Manager — COMPLETE

Sale/campaign write paths remain protected. The MKUI migration is presentation-only and is covered by permanent Sale Manager regression checks so confirmation, busy/disabled state, verification and retry semantics cannot be silently altered by later visual changes.

## Phase 6 — Message Assistant — ACTIVE

Preserve closed Shadow DOM. First migration maps the existing base/launcher/UX/premium layers onto MKUI semantics; CSS cleanup is a later commit after behavior parity.

Active gate:

- `tools/Apply-Mkui-Message-Pilot.mjs` uses exact anchors and fails closed on unexpected source drift
- preserve `@match`, `@grant`, `@connect`, `@updateURL`, `@downloadURL`, `@resource` and namespace metadata
- preserve the complete `data-*` hook signature
- preserve the single closed Shadow DOM mount
- preserve `GLOBAL_CSS` and all `mema-` Etsy integration surfaces
- preserve message composer/send verification, provider, automation, orders, history, settings, telemetry and storage behavior
- run `Test-Message-Assistant.mjs`, browser fixture coverage, `Test-Mkui-Message-Assistant.mjs`, privacy and distribution gates before merge

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
