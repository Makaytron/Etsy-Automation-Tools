# Changelog

All notable changes to Makaytron Etsy Keyword & Market Analyzer are documented here.

## [1.0.2] - 2026-08-04

### Changed

- Finalized the public distribution release after the immutable tag-only `v1.0.1` checkpoint.
- Corrected Greasy Fork documentation to describe automatic Raw `main` synchronization plus the release-only immediate-refresh webhook.
- Added post-push Raw source-parity validation; no Etsy reading, navigation, storage, or write behavior changed.

## [1.0.1] - 2026-08-04

### Changed

- Verified every live repository, Raw update, support, logo, and privacy URL against `Makaytron/Etsy-Automation-Tools`.
- Configured Greasy Fork automatic synchronization from the exact Raw source plus a release-only immediate-refresh webhook; no GitHub credential is shared with Greasy Fork.
- Preserved the legacy `@namespace` as the stable installed-script identity while keeping every network endpoint on the canonical repository.
- Verified and retained the existing `@antifeature tracking` disclosure for the documented privacy-preserving telemetry.
- No Etsy reading, navigation, storage, or write behavior changed in this distribution patch.

## [1.0.0] - 2026-08-03

### Added

- Standalone Marketplace Insights search, structured capture, bounded storage, and JSON export.
- Idempotent inline keyword details for the primary result and up to 25 similar search terms.
- Etsy DOM metrics plus an explicitly labelled Makaytron-derived opportunity score.
- Optional, strict BroadcastChannel integration with Makaytron Etsy Listing Analyzer.
- Sequential and cancellable research queue, DOM timeouts, acknowledgement handshake, and seven-day cache.
- Single-leader cross-tab GM-storage lease with an instance-bound owner, bounded duplicate-tab presence handshake, safe TTL takeover, and duplicate-navigation/result protection.
- Deadline-based `awaiting-receipt` terminalization and bounded pruning that prevents expired result resends or queue exhaustion.
- Strict complete `RESEARCH_REQUEST` JSON import and complete `RESEARCH_RESULT` copy/download fallback for independent use.
- Normal Etsy query-only navigation without exposing request IDs, nonces, or research payloads in URLs or history state.
- Turkish and English Shadow DOM interface with canonical Makaytron branding and accessibility controls.
- Shared black, white, and neutral-gray panel/launcher/inline hierarchy; color is limited to compact, labelled semantic opportunity and trend badges.
- Source-aware, non-blocking 24-hour update checks and user-confirmed canonical install-page opening.
- User-confirmed local research cleanup with deletion readback while preserving language preferences.
