# Behavioral UI Contract — Makaytron Etsy Listing Analyzer

Baseline version: **1.2.2**
Source: `scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js`

## Mount/isolation

- Host id: `makaytron-etsy-listing-analyzer`.
- Uses **open Shadow DOM**.
- Main UI uses `meli-` prefixed classes and `:host { all: initial; ... }`.
- Existing dashboard geometry includes collapsed and expanded left navigation, a top header, content workspace, modal and toast layers.
- Navigation behavior is driven by `data-view` / `data-action`; these are behavioral API.

## Dashboard reference

Listing Analyzer is the closest existing userscript translation of the `Tamplate-Back-White-01` dashboard model. Its shell informs MKUI Dashboard Shell even though its production migration happens last.

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
