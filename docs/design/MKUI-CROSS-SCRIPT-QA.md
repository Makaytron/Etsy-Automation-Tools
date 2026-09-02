# MKUI v1 Cross-script Integration QA

Status: **complete**

This gate verifies the five production Etsy userscripts as one visual system after their individual MKUI v1 migrations:

1. Ads Keyword Manager
2. Keyword & Market Analyzer
3. Sale Manager
4. Message Assistant
5. Listing Analyzer

## Threat model

The integration gate covers conflicts that can appear when all scripts are installed in the same browser and are used throughout one Etsy seller session:

- route ownership and accidental double injection
- duplicate hosts or DOM ids
- global CSS leakage into Etsy controls
- launcher, fixed-surface, modal and toast stacking
- duplicate window globals or custom event channels
- accidental storage-key sharing
- keyboard-shortcut conflicts
- body/document scroll-lock conflicts
- independent script drift away from the canonical MKUI source

The gate does not perform authenticated Etsy write operations. Sale creation, listing publication, message sending and other write paths remain covered by their dedicated behavior/safety fixtures and verification tests.

## Canonical registry

`tools/Mkui-Production-Registry.mjs` is the single audited registry for production paths, CSS prefixes, Shadow DOM modes, telemetry ids and canonical route fixtures.

Every canonical route fixture must have exactly one owner. This is the primary launcher/modal coexistence rule: on a normal userscript-manager injection, only the script assigned to the current Etsy route may mount its main UI.

The route matrix currently covers 11 representative URLs across Ads, Marketplace Insights, Sales & Discounts, messages, conversations, sold orders, shop dashboard, listing management and listing editor routes.

## Static coexistence audit

Run:

```powershell
node tools/Audit-Mkui-Cross-Script-Coexistence.mjs --check
node --test tools/Test-Mkui-Cross-Script-Coexistence.mjs
```

The committed report is:

`docs/design/previews/mkui-cross-script-coexistence-audit.json`

The audit fails closed when any of these invariants changes unexpectedly:

- production script count is not five
- `MKUI_VERSION` differs between scripts
- telemetry ids are missing, duplicated or assigned to the wrong script
- open/closed/no-Shadow-DOM modes drift from their contracts
- a canonical Etsy route has zero or multiple owners
- DOM ids, window globals, namespaced custom events or CSS prefixes collide
- storage keys collide outside the explicit protocol allowlist
- global CSS introduces generic host-page selectors
- a z-index is negative or exceeds the browser limit
- route-compatible fixed surfaces share the same anchor
- route-compatible scripts claim the same global shortcut
- a detected document/body scroll lock has no restore path

## Intentional shared protocol

Only these cross-script storage protocols are allowlisted:

- `makaytron-listing-research-request/v1`
- `makaytron-listing-research-result/v1`

They are the explicit Keyword & Market Analyzer → Listing Analyzer research handoff. Other shared storage keys fail CI.

## Real Chrome CSS isolation

Run:

```powershell
node --test tools/Test-Mkui-Cross-Script-Browser-Fixture.mjs
```

The fixture extracts the actual global CSS from all five production userscripts and injects it into one real headless Chrome document. It records computed styles for native host-page buttons, inputs, selects and ordinary content before injection, then compares every protected property after injection.

Any change to typography, spacing, border, background, layout, box sizing or positioning fails the test. This exercises the worst-case CSS-residue scenario even though canonical route ownership prevents all five main panels from mounting together during normal navigation.

## Behavior and distribution gate

`.github/workflows/mkui-cross-script-ci.yml` runs the integration audit together with every focused behavior/MKUI suite, updater tests, public-fixture privacy enforcement and the complete distribution gate.

A cross-script change is not releasable unless all five scripts still pass their individual behavioral contracts. Visual integration work must not weaken Etsy selector verification, confirmation, retry, storage, telemetry or write-safety behavior.

## Bundle and presentation drift

`shared/mkui/bundle-manifest.json` records:

- the SHA-256 hash of the canonical MKUI source bundle
- the same `MKUI_BUNDLE_HASH` expected in all five production userscripts
- each production script’s `MKUI_VERSION`
- a presentation fingerprint for every script

Run:

```powershell
node tools/Build-Mkui-Bundle-Manifest.mjs --check
node --test tools/Test-Mkui-Drift.mjs
```

`.github/workflows/mkui-drift-ci.yml` rejects canonical bundle changes, missing/stale script markers and unreviewed presentation drift.

A temporary presentation exception must identify one exact old→new fingerprint transition, include a meaningful reason and have an unexpired `YYYY-MM-DD` expiry date. Exceptions cannot bypass canonical bundle drift, wrong MKUI versions or missing bundle markers.

## Updating MKUI intentionally

1. Change the canonical files in `shared/mkui/` and the reviewed production mappings.
2. Run all script-specific migration and behavior tests.
3. Regenerate markers and the manifest:

```powershell
node tools/Build-Mkui-Bundle-Manifest.mjs --apply --write
node tools/Audit-Mkui-Cross-Script-Coexistence.mjs --write
```

4. Run both permanent gates locally.
5. Commit the canonical source, all production mappings, `bundle-manifest.json` and the coexistence audit in the same reviewed change.

Never update only the stored hashes to make CI green. The generated evidence must describe the production source that was actually reviewed.
