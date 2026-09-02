# Behavioral UI Contract — Makaytron Etsy Listing Analyzer

Baseline version: **1.2.2**
Version: `1.2.3`
Migration status: `MKUI v1 complete`
MKUI source: `1.0.0`
Source: `scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js`

## Mount/isolation

- Host id: `makaytron-etsy-listing-analyzer`.
- Uses **open Shadow DOM**.
- Main UI uses `meli-` prefixed classes and `:host { all: initial; ... }`.
- Existing dashboard geometry includes collapsed and expanded left navigation, a top header, content workspace, modal and toast layers.
- Navigation behavior is driven by `data-view` / `data-action`; these are behavioral API.

## Dashboard reference

Listing Analyzer `1.2.3` is the canonical production translation of the `Tamplate-Back-White-01` dashboard model. Its collapsed/expanded navigation, header, workspace, modal, toast, token and primitive mapping define MKUI Dashboard Shell while the original behavioral routing and safety state machines remain intact.

## Protected domains

- listing cards/pagination/editor selectors
- scanning and historical comparison logic
- listing selection/filtering
- AI proposal and queue state
- publish/deactivate verification
- keyboard shortcuts
- telemetry/storage contracts
- open Shadow DOM mode
- grants/connect/match URLs

## Migration rule

Preserve the information architecture and state machine. Standardize tokens/primitives first; do not rewrite view routing or listing workflows merely to match template markup.
