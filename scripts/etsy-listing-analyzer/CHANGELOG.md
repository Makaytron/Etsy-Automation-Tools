# Changelog

## 1.0.5 - 2026-08-09

- Reworked first-scan analysis so the current 30-day reach/engagement score is distinct from history confidence; complete zero counters, renewal waste, weak discovery, weak engagement, purchase friction, and historical demand now remain explainable instead of collapsing to the same `39` display.
- Kept current funnel evidence separate from all-time sales, revenue, and renewal evidence, preserved fail-closed data-integrity handling, and retained the full history and current-zero safeguards required before any deactivation review.
- Persisted Health Engine v3 migrations before proposal, queue, AI-export, or backup actions so the action basis matches the analysis shown in the interface.
- Clarified that selecting a listing does not save a proposal, documented the manual and AI proposal paths, and made the empty-queue message point directly to **Improvement plan → Save proposal**.
- Added regression coverage for first-scan decisions, score/confidence separation, rolling versus all-time metric scopes, deactivation rebound guards, stale-engine migration, and proposal-queue safety.

## 1.0.4 - 2026-08-08

- Tightened final GitHub URL equality to reject fragment and credential drift as well as host, port, path, and query drift.
- Require exactly one trusted product name, namespace, SemVer, `@updateURL`, and `@downloadURL` before opening the verified immutable-commit userscript in Tampermonkey.
- Added automated warning, click handoff, current-version, active collection/action-queue, redirect, API-ref, identity, and wrong-file tests.
- Made all-page collection wait for three identical complete card reads, validate pagination and the seller-nav public shop identity, ignore transient tracking parameters, reject cross-page listing overlap, and invalidate older collection manifests before analysis unlocks.
- Reconciled page identity with Etsy's strict listings-route `page` parameter and made pagination prefer the shadow select's input/change contract, so stale serialized select values and icon-button event differences no longer block pages 2 through the final page.
- Scoped metrics to listing-card statistic rows so title text and menu Edit links cannot be mistaken for visits, favorites, sales, revenue, or renewals; missing metrics now stop the page read instead of being accepted.
- Separated the card renewal/expiry text from Etsy's real active/draft/expired/sold-out/inactive state, bound that state to collection scope, and excluded non-active listings from active cohorts and deactivation safeguards.
- Updated Health Engine to keep missing observations unknown, require real 60-day evidence for dormant status, isolate benchmarks to the current complete collection, exclude stale/anomalous peers, and keep deactivation fail-closed until non-seasonal status is explicit.
- Changed performance filters and threshold calibration to rolling 30-day results, bounded percentile scores to 0–100, preserved detected revenue currency, and added offline regression coverage for the corrected parser, collection, snapshot, and analysis rules.
- Etsy editing, publishing, and user-confirmed deactivation boundaries remain unchanged.

## 1.0.2 - 2026-08-04

- Finalized the public distribution release after the immutable tag-only `v1.0.1` checkpoint.
- Corrected the documented automatic update interval from six hours to the implemented 24 hours.
- Corrected Greasy Fork documentation to describe automatic Raw `main` synchronization plus the release-only immediate-refresh webhook.
- Added post-push Raw source-parity validation; no Etsy analysis, editing, deactivation, storage, or network behavior changed.

## 1.0.1 - 2026-08-04

- Verified every live repository, Raw update, support, API, install, logo, privacy, and issue URL against `Makaytron/Etsy-Automation-Tools`.
- Configured Greasy Fork automatic synchronization from the exact Raw source plus a release-only immediate-refresh webhook; no GitHub credential is shared with Greasy Fork.
- Preserved the legacy `@namespace` and its exact trust check as the stable installed-script identity while keeping every network endpoint on the canonical repository.
- Verified and retained the existing `@antifeature tracking` disclosure for the documented privacy-preserving telemetry.
- No Etsy analysis, editing, deactivation, storage, or network behavior changed in this distribution patch.

## 1.0.0 - 2026-08-03

- Renamed the product, package directory, userscript file, and canonical distribution path to **Makaytron Etsy Listing Analyzer**.
- Added bounded three-attempt recovery for temporary page-read and navigation failures, plus persisted, copyable failed-page reports that exclude session data and page content.
- Added six built-in filter presets, up to eight persistent custom presets, and disjunctive result counts on every filter option.
- Added accessible inline SVG history charts for visits, favorites, sales, revenue, and renewals; missing values remain gaps.
- Added a chronological improvement experiment timeline from proposal through publish, observation, due date, and evaluation outcome.
- Added field-scoped AI **Before / Proposal / Verified result** comparisons without changing the existing user-confirmed publish boundary.
- Added immutable-commit GitHub metadata checks, cached once-per-24-hour polling, manual same-version refresh, and Tampermonkey-confirmed installation of the exact verified commit. Greasy Fork and other detected distribution sources retain their own updater; the script never rewrites itself.
- Added optional one-listing **Marketplace Insights research** with the standalone Etsy Keyword & Market Analyzer: canonical parameter-free initial Insights navigation, bounded capability/READY probing, opaque references, SHA-256 content fencing, exact-key/type plus 64 KiB/TTL validation, one-time result receipt, terminal rejection cleanup, seven-day companion-cache acceptance, and JSON copy/import recovery.
- Added persisted search-volume, search-results/competition-indicator, and Makaytron-derived opportunity evidence plus reviewable title/tag suggestions without overwriting a saved proposal, editing Etsy, or publishing automatically. A full 13-tag set can replace exactly one low-evidence tag in the review draft when the new candidate has measurable evidence.
- Kept both userscripts independently usable. A missing companion affects only the user-triggered research action and offers Cancel, complete request JSON copy, or an explicit canonical install-page link; no silent installation is attempted.
- Added the repository-standard Message Assistant application shell, Ads-style secondary modals, standardized toast notifications, and persistent TR/EN controls.
- Added DOM-based extraction for listing ID, title, SKU, stock, price, status, visits, favorites, sales, revenue, and renewals.
- Added one-control all-page collection with `Ctrl + Alt + A`, page-1 restart, sequential collection through the final page, mandatory return to page 1 before analysis unlocks, persisted pause/resume state, unique-listing deduplication, a separate cross-tab lease, repeated-page detection, and fail-closed page-transition guards.
- Added a strict 24-hour analysis freshness gate based on completion and the oldest captured page; stale, incomplete, wrong-scope, or wrong-page-count runs keep listing cards hidden. Analysis never auto-starts a scan, and a centered user-controlled start button with its shortcut unlocks the view only after successful completion.
- Removed snapshot writes from ordinary listings-page load and added fail-closed storage-write checks, fenced collection leases, duplicate-tab identity hardening, and active-collection protection for local-data clearing.
- Added navigation handoff fencing so a persisted all-page run continues across full document loads without allowing another tab to take its lease.
- Serialized record, queue, audit, and AI-cache mutations with native Web Locks; merged concurrent record copies and verified critical write readbacks.
- Fenced AI copy/import and queue creation to the same fresh, complete collection identity at action time, and kept analysis locked whenever any manifest record is unreadable.
- Added exact freshness-expiry timing and open-panel synchronization for collection changes made in another tab.
- Added structured search, scope, lifecycle, diagnosis, performance, trend, stock, and confidence filters; priority and metric sorting; result/hidden-selection counts; and 40-card incremental rendering.
- Added bounded per-listing snapshot history, trend comparison, transparent recommendations, and improvement records.
- Replaced the dense horizontal analysis table with responsive premium listing cards in a strict black, white, and neutral-gray surface palette; limited semantic color to deltas/lifecycle/activity signals, increased metric contrast, and prevented numeric clipping.
- Added a dedicated keyboard-focusable results scroller and modal scroller with a permanently reserved, visible 12px neutral scrollbar; removed competing nested scrolling from the analysis workspace.
- Linked the Makaytron header logos to `https://makaytron.com/` in a safe new tab.
- Defined the Health Engine evaluation context for lifecycle, performance hypotheses, confidence, decision evidence, and review timing under the initial `1.0.0` package release.
- Documented conservative within-shop comparison: an insufficient local peer sample must remain low-confidence or inconclusive.
- Documented the distinction between rolling 30-day visits/favorites and cumulative sales/revenue/renewals when interpreting observation windows.
- Defined baseline-aware experiment interpretation: early checkpoints remain provisional, and undersized samples do not force a win/loss result.
- Added network-free AI request/response JSON exchange with opaque local references and strict validation.
- Added user-approved edit queue for title, description, tags, and materials.
- Added explicit per-proposal `fields` selection so absent editor data cannot silently clear tags, materials, or descriptions.
- Added fail-closed publish verification, cross-tab lease, guided Etsy-owned deactivation flow without clicking Deactivate, backup export, and confirmed local-data clearing.
- Added validated backup import with a review-before-write summary, explicit confirmation, safe record merging, custom-filter-preset migration, and automatic exclusion of stale action queues.
- Added estimated local-storage usage plus quota/capacity warnings that stop collection fail-closed and direct the user to backup or cleanup recovery.
- Added keyboard-complete modal behavior, visible focus, trigger-focus restoration, accessible control names, and Turkish/English structure and language-attribute parity.
- Added shop-calibrated threshold suggestions from complete local collection distributions, live impact preview, safe bounds, relationship validation, and explicit-only application.
- Added active-experiment overlap warnings and acknowledgement gates that preserve the running experiment and prevent publishing when cancelled.
- Added exact-path AI JSON validation guidance, expected-type help, accessible error announcements, and a copyable example payload without partial proposal writes.
- Added an interrupted-queue recovery screen that explains the last safe state, offers review/stop actions, and blocks automatic retry of an unverified Etsy submission.
- Added privacy-safe local feedback capture with optional anonymous diagnostics and a user-triggered canonical GitHub issue handoff that excludes listing titles and IDs.
- Kept deactivation as a user review outcome: missing data, low confidence, recent changes, or active experiments prevent an automatic conclusion, and the script never clicks Deactivate or Etsy's final confirmation.
- Explicitly excluded API/OAuth credentials, automatic variation/price/quantity changes, and listing deletion.
