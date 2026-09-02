# Changelog

## 1.2.3 - 2026-09-02

- Migrated the existing Listing Analyzer dashboard presentation to MKUI v1 while preserving the open Shadow DOM, every recorded `data-*` hook and `meli-*` class signature, navigation/filter/selection state, keyboard shortcuts, storage and telemetry contracts, and the complete publish/deactivate verification state machines.
- Mapped the dashboard shell, cards, forms, buttons, pills, semantic statuses, modal surfaces, radii, shadows, and focus rings to the canonical MKUI `1.0.0` token contract without changing Etsy selectors or listing workflows.
- Added a fail-closed source audit, guarded exact-anchor transformer, permanent MKUI invariant suite, network-isolated production-CSS preview, and dedicated Listing Analyzer CI. The full pre-existing regression suite, privacy guard, distribution gate, syntax checks, and patch-hygiene checks remain mandatory.

## 1.2.2 - 2026-08-31

- Made safety-critical GM storage reads fail closed and added explicit queue-schema/lifecycle validation, including bounded submitted-action timestamps. Record keys can no longer redirect through a mismatched embedded listing ID, active collection/queue work blocks backup import, and importing records invalidates any older completed collection.
- Revalidated queued UPDATE proposals immediately before form mutation and again under the final publish-click lock. Stale proposals, uncertain dirty-editor recovery, and unsupported future queue data now stop without an Etsy write; verified publish recovery is idempotent across partial local writes, uses the durable health/retention policy, and adopts legacy partial commits without republishing. Stable DOM reads also include price-label and currency identity.
- Advanced Health Engine results to version 7 and tightened mathematical evidence: an `exact` count must also be a non-negative safe integer, missing favorite precision cannot inflate a visibility-only result into a complete reach/engagement score, and lifecycle trend evidence now reports the exact anchor actually used by the decision.
- Reworked cohort and analysis-filter computation to reuse precomputed eligibility/groups, sort each metric distribution once, and calculate disjunctive facet counts in one record pass. Search input is debounced and language-aware case folding is deterministic.
- Hardened the existing interface with viewport-safe widths, focus preservation and transfer, fully localized accessible telemetry dialogs, truthful chart-quality exclusions, dedicated threshold validation, serialized preference writes with rollback, locale-independent preset identity, cross-tab storage-estimate invalidation, and progress semantics.
- Regenerated all five Listing Analyzer gallery images from the final userscript in an isolated localhost fixture; no Etsy account data or write action was used.
- Expanded the offline regression suite from 134 to 172 passing tests with adversarial storage, queue, proposal-race, exactness, score-evidence, cohort-scaling, facet-equivalence, persistence, localization, chart-quality, and accessibility cases.

## 1.2.1 - 2026-08-31

- Scoped compact `K`/`M`/`B` counters to the decision consumer that uses them: an approximate lifetime counter no longer suppresses independent exact traffic evidence, while that approximate value still cannot authorize sales/renewal conclusions, deactivation, calibration, or threshold previews. Exact sales and renewal anchors are selected independently.
- Made monetary analysis currency-safe: revenue differences require comparable currencies, mixed-currency history cannot create a protection signal, price-band cohorts compare only matching currencies, and a card whose price/revenue currencies disagree is rejected during collection.
- Rejected snapshots more than five minutes in the future from health, cohort, calibration, and deactivation decisions. Snapshot day keys and displayed timestamps now share one explicit UTC contract.
- Required full sample strength for the specific cohort metric behind a hard percentile diagnosis. Exact, statistically separated zero-to-positive traffic can now qualify as growth only after the configured absolute traffic floor, without inventing a percentage.
- Hardened final-page collection by requiring visible card roots, canonical edit links, parsed listings, and unique listing IDs to have identical cardinality; malformed or duplicate-ID cards can no longer disappear behind link deduplication. The collection schema and parser provenance were advanced so a collection completed under the older DOM contract is blocked until a fresh full scan.
- Added chart-quality provenance for exact, approximate, legacy, stale, and missing observations; stale values become gaps, limited endpoints stay neutral, and an all-zero series is drawn on the zero baseline. Revenue charts compare only the latest canonical currency series and explicitly exclude older units from their shared scale.
- Unified threshold normalization, calibration output, and settings-form limits so every generated recommendation can be applied and saved without leaving the supported contract.
- Expanded the offline Listing Analyzer regression suite from 120 to 134 passing tests, including adversarial consumer-specific precision, currency aliases, future-time, cohort-strength, zero-baseline, DOM-cardinality, chart-quality, UTC-day, and threshold-boundary cases.

## 1.2.0 - 2026-08-31

- Bound every saved snapshot and complete collection to a verified Etsy metric contract: visits/favorites must come from the **Last 30 days** section, while sales/revenue/renewals must come from **All time**. Missing, duplicated, or misplaced metric sections now fail closed, and legacy unverified snapshots cannot become decision anchors.
- Limited trend and deactivation evidence to the listing's current contiguous active-state epoch, so inactive periods cannot be compared as if exposure had continued uninterrupted.
- Added explicit per-listing seasonality (`seasonal`, `non-seasonal`, or `unknown`) and product-type (`digital`, `physical`, or `unknown`) context. Known context segments shop peers, and deactivation review requires an explicit non-seasonal value.
- Excluded the target listing from its own cohort, retained eight comparable peers as the minimum, and ramped cohort influence continuously from 8 to full strength at 30 peers instead of applying an abrupt full-weight comparison.
- Reframed the heuristic confidence score as **Evidence readiness**: it summarizes data coverage and decision readiness, not a calibrated probability that a recommendation is correct.
- Replaced approximate experiment inference with a 95% exact conditional Poisson rate-ratio interval. A zero-to-positive result is reported as a new absolute signal without a fabricated percentage.
- Marked compact `K`/`M`/`B` counters as approximate: they remain usable for descriptive cards, but cannot produce an "exact" trend or experiment signal.
- Restricted exact rolling-traffic inference to consecutive, non-overlapping captures 30–31 days apart. Descriptive nearby-scan changes remain separate, and closer approximate captures can no longer shadow an exact decision anchor.
- Compared sales experiments with matched real 30-day cumulative-sales windows and integer event counts. The evaluator waits up to seven days after day 30 for a valid snapshot before returning an inconclusive result.
- Added monotonic collection revisions and canonical manifest fingerprints to every same-run write. Resume reloads the latest stored manifest after acquiring its lease, preventing a stale tab from overwriting pages collected by another tab; a same-ID run already completed or blocked elsewhere cannot be claimed or rewritten.
- Mutually excluded the complete action-queue and all-page-collection lifecycles under the shared storage lock. Stop-only recovery for legacy overlap now CAS-blocks the overlapping collection before closing an unverified Etsy submission, while preserving the foreign lease so its next stale write is rejected. Page manifests use the earliest real DOM observation time, and a verified active-to-inactive transition invalidates affected same-shop active and inactive scopes, including an inactive collection where the listing was not yet present.
- Bound AI imports to the exact exported editable and analytical payload plus current proposal identity for every opaque reference; any intervening content, metric, history, state, context, policy, health, proposal, or verified-deactivation change rejects the whole response atomically.
- Revalidate a deactivation candidate's current health, safeguards, context, proposal basis, and active state before opening Etsy and again under the final-click fence. A verified deactivation uses one immutable operation timestamp across recovery attempts, invalidates affected older collections, and requires a new full scan before analysis, AI export, or a new queue; legacy manual queue items are verification-only and cannot enter the automatic click path.
- Expanded the offline regression suite to 120 passing tests covering metric scopes, active epochs, context-safe merges, cohort boundaries, exact non-overlapping trends, calibrated decline populations, exact intervals, stale AI/proposal payloads, matched sales windows, collection CAS/resume races, queue/collection interlocks, page-observation races, inactive-scope membership, and deactivation revalidation.

## 1.1.0 - 2026-08-31

- Replaced the hard favorite-score cutoff with a sample-size-smoothed favorite rate and gradually increasing engagement weight, eliminating the 19-to-20-visit score discontinuity.
- Built prior traffic change from a consecutive 30-day anchor instead of independently reusing a nearby 60-day point; equal-distance anchors now prefer the longer non-overlapping interval.
- Reduced small-cohort overconfidence: eight comparable listings remain the reliability floor, while cohort-strength confidence now reaches 100 only at 30 comparable listings.
- Made experiment baselines publication-bound and fail-closed when more than one day old, normalized cumulative sales exposure to 30 days, and retained only evaluation snapshots within the existing seven-day grace window.
- Added a 90% Poisson rate-ratio interval for visit, favorite, and sale-rate winner decisions; sales confidence uses actual events and exposure duration, severe visit declines remain detectable even when resulting traffic falls below 20, and the raw percentage is labeled **30-day relative change** rather than an adjusted causal effect.
- Smoothed cohort favorite-rate percentiles so one low-traffic favorite cannot outrank stable engagement purely through a volatile raw percentage.
- Raised threshold calibration to 20 clean listings, excluded recent/active experiments, and used more conservative upper-quartile no-sale traffic and decline distributions.
- Expanded the Listing Analyzer regression suite from 84 to 90 passing tests across smoothing, consecutive windows, cohort strength, calibration, and experiment edge cases.

## 1.0.13 - 2026-08-31

- Bound cached GitHub update results to the exact installed script version so upgrading the userscript cannot leave an older remote release displayed as a new update.
- Added a live-found regression case covering the observed `v1.0.12` installed / `v1.0.5` cached banner mismatch; stale legacy update state now clears and is checked again.
- Preserve the last word of a Marketplace Insights title seed when the complete listing title already fits within the 50-character seed limit.
- Expanded the Listing Analyzer suite with protocol, hashing, seed selection, research suggestion/rematerialization, and 30-day experiment-state coverage.

## 1.0.12 - 2026-08-31

- Read Etsy's current inactive listing badge from the dedicated header status row, including its distinct `wt-badge--statusInformational` class, while excluding unrelated informational badges elsewhere in the editor.
- Added a bounded two-minute, verification-only redirect recovery: a fresh durably submitted deactivation may return from Etsy's listings page to the canonical matching editor and verify status, but it can never resubmit Deactivate.
- Expanded the offline regression suite from 77 to 80 passing tests for the inactive badge, strict durable-recovery eligibility, canonical redirect, and zero provider retries.

## 1.0.11 - 2026-08-31

- Extended the exact Etsy Deactivate dialog readiness window from three to ten seconds so slow live modal hydration does not fail before the final control becomes safely verifiable.
- Added fail-closed cleanup that clicks only the exact modal's Cancel control when a pre-submission deactivation path aborts; the final Deactivate and every Delete control remain untouched in that path.
- Expanded the offline regression suite from 76 to 77 passing tests with a modal that becomes valid only after the former three-second deadline.

## 1.0.10 - 2026-08-31

- Accounted for Etsy marking the editor background `aria-hidden` while the exact Deactivate modal is open, without weakening ordinary hidden/stale save-state rejection.
- Cancelled the exact Etsy modal automatically when a pre-submission safety check fails, while retaining verification-only recovery after any durable submission intent.
- Retained all 76 passing offline regression tests, including modal-background clean-state handling and the full automatic deactivation state machine.

## 1.0.9 - 2026-08-31

- Added a user-confirmed compatibility path for queue items left at v1.0.7's manual `awaiting-user-deactivation` step: only a still-visible `Active` listing with a clean form can enter the exact automatic Deactivate flow.
- Kept script-submitted and uncertain deactivations outside that path so they remain verification-only and can never be retried automatically.
- Expanded the offline regression suite from 75 to 76 passing tests with the legacy-queue upgrade round trip.

## 1.0.8 - 2026-08-31

- Automated the user-confirmed `DEACTIVATE_REVIEW` action against Etsy's current editor DOM: the script re-resolves and clicks only one visible, enabled, exact **Deactivate** menu item and the dedicated final **Deactivate** button in the correctly titled dialog.
- Kept listing deletion unsupported and fail-closed: deletion semantics, wrong or duplicate dialogs, disabled/replaced controls, route drift, dirty forms, and identity/lease loss result in no unsafe click.
- Persisted a unique deactivation attempt and the exact `Active` baseline before the final click; uncertain submissions cannot be retried automatically, and the queue advances only after a visible `Active → Inactive` transition.
- Added recovery-only verification for submitted deactivations and expanded the offline regression suite from 70 to 75 passing tests, including Deactivate-vs-Delete selection, unsafe-dialog rejection, double-click single submission, route-drift blocking, and durable no-retry behavior.

## 1.0.7 - 2026-08-30

- Validated the analyzer against Etsy's current listings and editor DOM, including multi-page collection, explicit zero metrics, shadow-DOM pagination, full tag fields, materials, save-state detection, queue form application, and deactivation-menu focus.
- Fixed pause/resume so a cancelled navigation settles the collection as paused and releases its lease instead of leaving a false running state behind.
- Closed the remaining pause race after a successful transient DOM read, preventing a late pause request from being reported as a successful page step.
- Accepted Etsy's disabled tag input when all 13 tag slots are already occupied, handled React-reused/replaced tag and material controls, and added the input-settle delay required before an Add action.
- Failed closed when Etsy pill rows cannot be recognized, recognized Etsy's singular unsaved-change message, ignored hidden stale save-state copies, and required an actually clean form before rollback can be reported as restored.
- Re-resolved Etsy's transient Deactivate menu item and verified keyboard focus without clicking Deactivate; listing deletion remains unsupported and the interface now states this explicitly.
- Expanded offline regression coverage from 58 to 70 tests, including a sanitized 40-card Etsy DOM fixture, single-use AI request/import and safe backup-import round trips, plus a guard that rejects `DELETE` while accepting `DEACTIVATE_REVIEW`; no Publish, Deactivate, or listing deletion action was performed by the live checks.

## 1.0.6 - 2026-08-30

- Fixed late Etsy DOM hydration and overlapping SPA route reads so cards and editors can recover after delayed rendering without an older page overwriting the current route.
- Corrected live listing-status filter detection and restored the saved collection scope when returning to the listings page.
- Fixed tag/material entry order, added action-time proposal preflight, and restored already changed editor fields when a later control fails.
- Fenced skip, stop, recovery, apply, publish, and deactivation transitions to the exact queue/listing cursor under the action lease; duplicate clicks and stale tabs can no longer advance or resurrect a newer queue.
- Kept deactivation verification available after an Etsy reload, scoped status/menu selectors to the current editor, required an unambiguous active-to-inactive transition, and released failed action leases.
- Prevented terminal Marketplace Insights requests from regressing on delayed ACK/ERROR messages and superseded obsolete planned improvements when a proposal changes to skip or deactivation review.
- Preserved explicit numeric zeroes while rejecting blank/structured metric values, failed settings writes visibly, and expanded offline regression coverage from 37 to 58 tests.

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
