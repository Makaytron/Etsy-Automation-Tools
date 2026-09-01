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
