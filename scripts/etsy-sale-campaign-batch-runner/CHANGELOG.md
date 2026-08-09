# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.11] - 2026-08-10

### Fixed

- Treat an exact transient-only `Loading`, `Please wait`, `Saving`, `Submitting`, or `Processing` shell tied to the current hydrating or structurally verified Etsy sale step as a bounded wait instead of immediately pausing it as a foreign modal.
- Keep the same 20-second deadline across React root replacements, then pause with a distinct timeout reason if the transient shell never disappears.

### Safety

- Change no field and click no action while the transient shell is present; resume the same date and phase only after it disappears.
- Keep hard foreign or destructive modals fail-closed and give them priority even if a transient loading shell is visible at the same time.

## [1.0.10] - 2026-08-10

### Fixed

- Persist an explicit completion-acknowledgement phase so the next campaign cannot start while the previous Etsy success modal is still open.
- Bind completion acknowledgement to the tab that submitted the campaign, so another Etsy tab cannot infer that the modal closed or advance the active date.
- Click the trusted structural success action at most once, wait for the modal to disappear, and fall back to a safe non-creating Sales & Discounts navigation when Etsy does not close it.
- Recover already-stuck v1.0.8/v1.0.9 jobs from their persistent verification queue without treating the previous day's success modal as proof for the new date.
- Keep batch verification isolated from stale sale-step DOM and prevent Retry from processing a pre-navigation document.
- Block single-day skipping while an already-created campaign is awaiting success-modal acknowledgement.

### Compatibility

- Completion detection and acknowledgement use Etsy's success-overlay/footer structure; localized or changed success copy is not required.

## [1.0.9] - 2026-08-09

### Fixed

- Require an exact current-day final-submission record before the legacy `verify_created` recovery path can read or fetch promotion data.
- Repair a stray next-day verification phase back to the read-only duplicate preflight when the current day has no final-action evidence, preventing an uncreated next-day code from exhausting five verification fetches.
- Keep mismatched or uncertain submission evidence fail-closed; it is never discarded unless its original campaign is already present in the persistent result or batch-verification queue.
- Preserve compatible v1.0.8 schema-v5 active jobs and their pending-verification queue during this patch upgrade, so the interrupted series can resume without discarding its evidence.

## [1.0.8] - 2026-08-09

### Changed

- Queue successfully submitted campaigns for one batch verification pass after the creation series, instead of navigating to Details & Stats after every campaign.
- Persist each queued campaign together with its exact locked submission/form evidence so a reload can safely resume final verification without recreating anything.

### Safety

- Keep the success dialog as the per-campaign acknowledgement, then verify every queued code, discount, date, status, type, region, and All listings scope at batch end.
- Pause with the unresolved queue intact when batch verification is incomplete; retry performs verification only and never resubmits a campaign.
- Disable single-day skipping while batch verification is paused; stopping the batch marks every unresolved campaign as unverified without resubmitting it.

## [1.0.7] - 2026-08-09

### Fixed

- Treat exact transient completion-state notices such as `Loading`, `Saving`, and `Processing` as hydration signals instead of pausing a successfully submitted series as an Etsy error.
- Keep current Etsy sale routes in a bounded structural hydration state when fields or the modal footer are temporarily absent, rather than falling into the legacy whole-page semantic crawler and freezing the tab.
- Cover the completion-to-verification-to-next-date state transition with a regression test so a successful day cannot silently stall before the following scheduled date.

### Performance

- Resolve an empty or partially hydrated current Etsy sale modal in milliseconds without blocking the browser's main thread.

## [1.0.6] - 2026-08-09

### Fixed

- Resolve the current Etsy sale form and its `Continue` action from the verified field structure instead of repeatedly rescanning every visible text node in the page.
- Resolve `Review and confirm`, `Confirm and create sale`, and the completion `Done` action from their verified sale-stage dialog, while preserving destructive-action and unrelated-modal rejection.
- Poll briefly for the expected action when React replaces or temporarily disables the footer button, then click only the freshly revalidated action.
- Confirm `Continue` and `Review and confirm` step transitions from fresh DOM state; if Etsy remains on the exact verified source step, retry that reversible navigation once without ever repeating the final sale submission.
- Wait for the document to finish loading and require each sale form, listing, review, and completion step to remain structurally stable before editing fields, selecting listings, clicking an action, or starting verification.
- Recognize Etsy completion dialogs from the verified success-overlay structure and footer submit action, so localized or changed success copy is not paused as an unrelated modal.
- Cancel the active automation turn and release its lease when the owning tab moves to the background, so an inactive Etsy tab cannot pause or click for the shared job.
- Read current `Details & Stats` promotion records from Etsy's `detailsAndStatsPageData.promotions` schema, including `shopWide` type/scope, scheduled/active time window, and the current `/details-stats/promotion/` detail route; bridge Etsy's omitted default-worldwide field only with the exact locked form/submission evidence from the same job.
- Accept Etsy's exclusive-midnight server end timestamp as evidence for the configured final sale day, while keeping mismatched region, selected-listing, stopped, discount, code, and date records fail-closed.
- Start the post-submit verification timeout only after the `Details & Stats` page is ready, preventing a slow navigation from ending with zero fetch attempts.
- Keep the generic semantic selectors as a compatibility fallback when Etsy's structured form or stage markers are unavailable.

### Performance

- Avoid repeated full-page action searches while filling the sale form; a focused synthetic Step 1 fixture based on Etsy's current copy resolves the form and `Continue` in milliseconds instead of several seconds per scan.
- Wake the runner from sale-modal DOM changes and immediately after phase updates, leaving the one-second timer as a fallback instead of paying it between every Etsy step.

## [1.0.5] - 2026-08-09

### Fixed

- Re-resolve Etsy's expected `Continue`, review, or final action after React replaces a footer button during form validation or userscript storage checks.
- Repeat the same fail-closed action-kind and sale-context validation immediately before the one permitted click; detached elements and unrelated primary buttons remain rejected.
- Keep unchanged one-second state polls from replacing panel buttons between pointer-down and pointer-up, which could swallow clicks on high-latency Remote Desktop sessions.
- Give Start, Retry/Continue, Skip, and Stop immediate busy text, spinner, live status, and a shared duplicate-action lock that survives panel rerenders without overflowing the compact action grid.

## [1.0.4] - 2026-08-09

### Fixed

- Recognize Etsy's current `Sale duration` and `Sale name` form copy so the visible, enabled `Continue` button is no longer rejected by the sale-flow safety context check.
- Keep the legacy `Start date` / `End date` / `Name your sale` form contract supported and retain fail-closed rejection outside a complete sale form.
- Make **Retry** acknowledge the click immediately, prevent duplicate clicks, surface async/storage failures, and repaint the running state after a successful resume.

## [1.0.3] - 2026-08-04

### Changed

- Synchronized the standalone package version with the reviewed analyzer updater release; no Etsy campaign, navigation, storage, or write behavior changed.

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
