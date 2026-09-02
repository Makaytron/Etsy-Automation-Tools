# MKUI v1 Migration Plan

## Scope

1. Etsy Ads Keyword Manager
2. Etsy Keyword & Market Analyzer
3. Etsy Sale Manager
4. Makaytron Etsy Message Assistant
5. Makaytron Etsy Listing Analyzer

Reference system: `Makaytron/Tamplate-Back-White-01`, the applied ShadcnStore dashboard, and the approved block catalog in `SHADCNSTORE-REFERENCE-CATALOG.md`.

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
- [x] Message Assistant MKUI migration (`1.2.9`, MKUI `1.0.0`)
- [x] Listing Analyzer MKUI migration (`1.2.3`, MKUI `1.0.0`)
- [x] Cross-script integration QA
- [x] MKUI bundle/version and presentation drift CI

All planned MKUI v1 migration phases are complete. Future presentation changes must pass the permanent per-script, cross-script and drift gates described below.

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

## Phase 6 — Message Assistant — COMPLETE

Preserve closed Shadow DOM. The first migration maps the existing base/launcher/UX/premium layers onto MKUI semantics while retaining the protected integration surfaces and behavior topology.

Completed gate:

- `tools/Apply-Mkui-Message-Pilot.mjs` uses exact anchors and fails closed on unexpected source drift
- preserve `@match`, `@grant`, `@connect`, `@updateURL`, `@downloadURL`, `@resource` and namespace metadata
- preserve the complete `data-*` hook signature
- preserve the single closed Shadow DOM mount
- preserve `GLOBAL_CSS` and all `mema-` Etsy integration surfaces
- preserve message composer/send verification, provider, automation, orders, history, settings, telemetry and storage behavior
- run `Test-Message-Assistant.mjs`, browser fixture coverage, `Test-Mkui-Message-Assistant.mjs`, privacy and distribution gates before merge

## Phase 7 — Listing Analyzer — COMPLETE

Migrated as the production reference for dashboard shell geometry. The guarded transform preserves navigation state, filter drawer, listing selection, queue/AI/settings views, keyboard shortcuts, open Shadow DOM, every recorded hook/class signature, and publish/deactivate verification. The full Listing Analyzer behavior suite, MKUI invariants, synthetic production-CSS preview, privacy and distribution gates pass before publication.

## Phase 8 — Cross-script QA — COMPLETE

Permanent source and browser gates now verify the five production scripts together:

- one canonical owner for every audited Etsy route
- unique host/DOM ids, telemetry ids, CSS prefixes, namespaced events and window globals
- only the documented Keyword Analyzer → Listing Analyzer research storage protocol may be shared
- global CSS has no generic host-page selectors
- real Chrome computed-style comparison proves combined production CSS does not alter native host controls
- fixed surfaces and z-index values are inventoried and constrained
- global keyboard shortcuts are inventoried and checked against route-compatible scripts
- body/document scroll locks must include a restore path
- every focused behavior/MKUI suite, updater test, privacy guard and distribution gate runs in the same cross-script CI job

The maintained contract and commands are in `docs/design/MKUI-CROSS-SCRIPT-QA.md`.

## Phase 9 — Drift protection — COMPLETE

`shared/mkui/bundle-manifest.json` records the canonical MKUI source hash and the production presentation fingerprint for every migrated script. The same generated `MKUI_BUNDLE_HASH` is embedded in all five userscripts.

`.github/workflows/mkui-drift-ci.yml` fails closed when:

- the canonical MKUI bundle changes without regenerated evidence
- a production script has a missing or stale bundle marker
- `MKUI_VERSION` drifts
- a production presentation changes without an exact, reviewed and unexpired exception

A presentation exception cannot bypass canonical source drift, marker drift, version drift or an unknown production script. The regeneration and review process is documented in `shared/mkui/README.md` and `docs/design/MKUI-CROSS-SCRIPT-QA.md`.
