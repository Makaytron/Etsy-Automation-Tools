# Makaytron Etsy Listing Analyzer v1.2.2

This standalone release packages the current Listing Analyzer source from `main` with its expanded evidence, health, experiment, AI-comparison, and fail-closed action-queue safeguards.

## Highlights

- Validates storage schemas, listing identity, active-state epochs, exact counters, currencies, and collection ownership before analysis or mutation.
- Uses context-aware cohorts, calibrated thresholds, exact non-overlapping experiment intervals, and explicit data-quality exclusions without claiming causation or Etsy-wide benchmarks.
- Exports anonymizable AI request JSON and accepts only exact, still-current proposal payloads; it does not call an AI provider itself.
- Revalidates every selected update or deactivation immediately before Etsy interaction and never retries an uncertain submission automatically.

## Package assets

- `Makaytron-Etsy-Listing-Analyzer.user.js`
- `SHA256SUMS.txt`

The userscript asset must be byte-identical to the reviewed source at the signed `etsy-listing-analyzer-v1.2.2` tag. The suite release remains GitHub `Latest`.
