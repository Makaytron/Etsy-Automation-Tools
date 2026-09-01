# Behavioral UI Contract — Etsy Keyword & Market Analyzer

Baseline version: **1.0.3**
Source: `scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js`

## Mount/isolation

- Host id: `makaytron-etsy-keyword-market-analyzer`.
- Uses **open Shadow DOM** for the main launcher/panel UI.
- Shadow root begins with `:host { all: initial; ... }` style isolation.
- Existing panel is intentionally compact.
- Etsy-inline integration surfaces use the `ekma-`/`ekma-inline` family outside the main shell and must remain narrowly scoped.

## Protected domains

Do not change:

- Marketplace Insights selectors/navigation capture
- research parsing/envelope logic
- Listing Analyzer handoff/storage protocol
- telemetry/storage contracts
- route matching, grants and network permissions
- Shadow DOM mode

## Migration rule

The main panel may adopt Compact Shell. Inline Etsy metrics/research annotations must not be converted into a dashboard/sidebar surface; only their typography, borders, radius and semantic status tokens should be harmonized.
