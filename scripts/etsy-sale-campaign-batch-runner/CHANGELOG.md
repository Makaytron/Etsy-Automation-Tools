# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-08-04

### Changed

- Finalized the public distribution release after the immutable tag-only `v1.0.1` checkpoint.
- Corrected Greasy Fork documentation to describe automatic Raw `main` synchronization plus the release-only immediate-refresh webhook.
- Added post-push Raw source-parity validation; no Etsy campaign, navigation, storage, or write behavior changed.

## [1.0.1] - 2026-08-04

### Changed

- Canonical repository, Raw update, support, logo, and privacy URLs were verified against `Makaytron/Etsy-Automation-Tools`.
- Greasy Fork distribution follows the exact public Raw source with automatic synchronization and a release-only immediate-refresh webhook.
- The legacy `@namespace` remains unchanged to preserve existing userscript identity; it is not used as a network endpoint.
- The visible product name is now **Makaytron Etsy Sale Manager**, positioned as **Bulk Sales & Discounts Automation**; the established file path, userscript namespace, and `eda-*` storage keys remain unchanged for compatibility.
- In-app automatic update checks now run no more than once per 24 hours; manual checks remain user-triggered.
- Non-GitHub installation sources leave updates to their distribution platform instead of forcing the private GitHub flow.
- The Makaytron logo now prefers the userscript manager's cached `@resource` and keeps a canonical fallback.

### Security

- Verified and retained the existing `@antifeature tracking` disclosure for the documented privacy-preserving telemetry.
- Update installation remains user-confirmed and is blocked while a campaign job is active.

## [1.0.0] - 2026-08-01

### Added

- First packaged public release.
- Batch planning for percentage-off Etsy sale campaigns.
- Shop and browser-instance locking.
- Fresh duplicate preflight checks and strict post-submit verification.
- Pause/retry/skip/stop recovery controls.
- CSV and Excel-compatible XML reporting.
- Turkish installation, support, security and contribution documentation.
- Makaytron repository-based monochrome panel, modal, card, button and typography design.
- Embedded, borderless Makaytron logo linked to `https://makaytron.com`, plus visible `v1.0.0` / `@Makaytron` identity.
- Standard Tampermonkey `@updateURL` and `@downloadURL` metadata.
- GitHub version checks, manual update check, new-version banner and user-confirmed update action.
- Safe handling when the GitHub raw file is temporarily unavailable.
- Optional GitHub account and repository-watch instructions.
- Collapsible right-edge arrow tab so the panel does not remain fixed over Etsy content.
- Automatic unmount of the panel, toasts and script dialogs after navigating away from Sales and discounts; automatic remount on return.

### Security

- Isolated evidence per promotion so data from separate campaigns cannot be merged.
- Restricted detail verification to one local or structured promotion record.
- Treats loading, virtualized, filtered and incomplete promotion lists as unreadable.
- Ignores CSS-hidden/stale promotion rows in fetched HTML.
- Blocks actions behind foreign overlays, dialogs and unrelated date pickers.
- Recognizes common Etsy save, validation, date, conflict and overlap errors.
- Rejects partial listing scopes including “all listings except …”.
- Handles boolean, numeric and string cancellation flags.
- Recovers ambiguous Continue/Review reservations without infinite loops.
- Prevents copied tabs from pausing or taking over another active instance.
- Ignores hidden success text when detecting the current Etsy step.
- Correctly treats “All promotions” as the default, unfiltered view.
- Recognizes headed “No promotions yet” empty states.
- Pauses automation while the script's own settings or report window is open.
- Tightens exact campaign-code boundaries.
- Reads shop/user identity from the same Etsy context.
- Rejects redirected or mismatched promotion detail pages.
- Protects CSV/XML exports from spreadsheet formula injection.
