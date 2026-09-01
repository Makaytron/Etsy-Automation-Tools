# Makaytron Etsy Listing Analyzer

<p><a href="./README.md">Türkçe</a> · <strong>English</strong></p>

Version: `1.2.2` · [Changelog](./CHANGELOG.md) · [Repository](../../README.md)

**Usage guide:** [English](./USAGE.en.md) · [Türkçe](./USAGE.md)

A Tampermonkey userscript that reads visible performance data from Etsy Shop Manager listing cards without asking for a separate API key or OAuth connection, evaluates local history with Health Engine, and prepares listing-level, user-approved improvement queues.

## Interface gallery

Every image below is an element-level capture of the userscript itself. No Etsy page, substitute website, or browser background is included.

| Overview | Listing analysis |
|---|---|
| ![Synthetic Listing Analyzer overview](../../assets/screenshots/listing-analyzer-overview-panel.png) | ![Synthetic Listing Analyzer analysis](../../assets/screenshots/listing-analyzer-analysis-panel.png) |

| AI proposals | Action queue |
|---|---|
| ![Synthetic Listing Analyzer AI proposals](../../assets/screenshots/listing-analyzer-ai-proposals-panel.png) | ![Synthetic Listing Analyzer action queue](../../assets/screenshots/listing-analyzer-action-queue-panel.png) |

![Synthetic Listing Analyzer threshold settings](../../assets/screenshots/listing-analyzer-threshold-settings-modal.png)

## Features

- A collapsible premium card workspace built from pure black, white, and neutral gray Makaytron surfaces; semantic color is limited to rise/fall deltas, lifecycle pills, and the activity line, alongside standardized toasts and persistent Turkish/English selection.
- Extracts the listing ID from the edit link and reads title, SKU, stock, price, renewal/expiry text, and verified Etsy statistics sections: visits/favorites only from **Last 30 days**, and sales/revenue/renewals only from **All time**. It verifies the real active/draft/expired/sold-out/inactive state separately from Etsy's status filter.
- **Collect all pages** or `Ctrl + Alt + A` walks Etsy listing pages from page 1 to the end, returns to page 1, and shows analysis cards only after that return succeeds. It validates pagination, raw visible card roots, canonical edit links, parsed listings, unique IDs, and the metric-scope contract on every page, then requires three consecutive identical complete reads before saving. A malformed or duplicate-ID card, missing/duplicated/misplaced metric section, repeated/overlapping page, or mixed transient DOM state keeps analysis locked. Temporary card/read and navigation failures are retried three times with increasing delays; exhaustion produces a safe detailed report with page, phase, attempts, and technical counts. The same control pauses and resumes the persisted run. A revisioned manifest and content fingerprint prevent a stale tab from overwriting newer collected pages.
- Once the completed run—or its oldest captured page—reaches 24 hours, **Listing analysis** hides stale cards and does not start collection automatically. The run must also match the verified public shop identity from seller navigation, the current Etsy scope, and page count; collection fails closed when that identity cannot be verified. The centered **Start analysis** control—or the `Ctrl + Alt + A` shortcut shown directly below it—starts a fresh full run only after the user acts; cards unlock when it completes.
- Search plus scope, lifecycle, issue/opportunity, recommendation, rolling 30-day performance, change, stock, and evidence-readiness filters; context-aware counts on every facet option; six built-in presets; up to eight custom presets; priority/30-day reach-engagement/visit/all-time sales-revenue/evidence-readiness sorting; and 40-card batches keep large shops navigable.
- The Makaytron logo in panel and modal headers opens `makaytron.com` safely in a new tab.
- Replaces the same-day snapshot without carrying a metric missing from the new capture forward as if it were fresh, and keeps at most 120 snapshots and 400 days per listing in local Tampermonkey storage.
- Health Engine considers lifecycle, a performance hypothesis, the heuristic **Evidence readiness** indicator, decision evidence, and the next review time as one evaluation context.
- On the first complete scan, it evaluates current visits/favorites separately from all-time sales/revenue/renewals. A listing with two or more renewals but no sales, revenue, or favorites becomes a **Renewal waste** improvement priority, while proven sales or revenue protect a listing from risky bulk changes. This current-snapshot assessment is not a growth, decline, or deactivation decision.
- Builds a within-shop comparison group (cohort) only from fresh listings in the current completed collection; the target listing, stale/anomalous records, and out-of-scope records are not peers. A cohort becomes usable at eight peers and gains influence gradually through 30, but a hard percentile diagnosis requires full strength for that specific metric. Known product type, seasonality, price band, and currency narrow the applicable peer scope.
- Renders accessible inline SVG history charts for visits, favorites, sales, revenue, and renewals without coercing missing values to zero. Approximate and legacy points are marked, limited endpoints stay neutral, stale observations create gaps, and an all-zero series remains on the zero baseline. Revenue charts use canonical currency identities and show only the latest unit series when history contains multiple currencies, so unlike units never share a numeric scale.
- Records improvement proposals, their baseline snapshot, and verified publish outcome, then renders a planned/published/observing/evaluation/result experiment timeline. Experiment signals require a 95% exact conditional Poisson rate-ratio interval; a zero-to-positive change never becomes a fabricated percentage. Sales use matched real 30-day cumulative-sales windows, and the evaluator waits seven days after day 30 for a valid snapshot.
- Creates AI-request JSON with opaque references such as `L001`; real listing IDs are not copied outside the script. Each reference is bound to the exact editable content, analysis basis, and exported payload fingerprint.
- Imports validated AI-response JSON as title, description, tag, and material proposals, with **Before / AI proposal / Verified result** comparison limited to explicitly changed fields. Import is atomic and rejects the complete response if any referenced listing, saved proposal, or verified-deactivation state changed after export.
- Starts an optional **Research with Marketplace Insights** flow when exactly one listing is selected. If the separate **Etsy Keyword & Market Analyzer** is available, it exchanges an opaque `L001` reference and content hash, then shows validated 30-day searches, search-results/competition indicator, and Makaytron-derived opportunity score with the title/tag suggestion.
- Applies an approved proposal to the Etsy editor but never presses `Publish changes` without a separate confirmation for that listing.
- After an explicit per-listing deactivation confirmation, recomputes the listing from current records and settings before opening Etsy and again immediately before the final click. It clicks only Etsy's single visible, enabled, exact **Deactivate** menu item and the correct final **Deactivate** button. **Delete** is never selected; stale or legacy review items cannot enter the automatic click path, the queue does not advance without a visible `Active → Inactive` transition, and an uncertain submission is never retried automatically.
- Downloads a local JSON backup; import validates file size and schema, previews listing/custom-preset counts before any write, and merges only after explicit confirmation. Import is blocked while a collection or action queue is active and invalidates older completed collection evidence. Custom filter presets move with the backup, while an old action queue is never activated. Local analysis data can likewise be cleared only after explicit user confirmation.
- Displays estimated local data usage. A failed safety-critical read, near-limit condition, or quota-rejected write stops fail-closed without marking the bulk workflow complete and offers backup/cleanup recovery guidance.
- Keeps the same interactive structure and understandable accessible names in Turkish and English and publishes the active language on the application root. Keyboard focus stays visible, modal focus is trapped, `Escape` closes the dialog, and focus returns to its trigger.
- Suggests shop-calibrated analysis thresholds from readable distributions in a complete shop collection; insufficient samples produce no suggestion, impact is previewed, and suggestions are never applied automatically.
- Warns when a new change overlaps an active improvement experiment and requires an explicit choice; cancellation preserves the running experiment and performs no publish.
- Invalid AI JSON identifies the exact failing field path and expected type, provides an example payload, and writes no proposal until the complete response validates.
- An interrupted or unverified action queue opens a dedicated recovery screen with safe review and stop choices; a possibly submitted Etsy write is never retried automatically.
- Feedback is stored locally first in a privacy-safe form. The prepared text excludes listing titles and IDs, and the canonical GitHub form opens only after the user presses the action.
- For GitHub-origin installations, checks the public GitHub `main` commit identity and userscript metadata only at that immutable commit at most once every 24 hours with anonymous requests. Settings provide **Check for updates** and **Update in Tampermonkey**, including a user-confirmed same-version refresh; the exact verified commit URL always finishes in Tampermonkey’s own confirmation screen. A detected Greasy Fork or other distribution source keeps its own update mechanism instead of being forced through the GitHub flow.

Missing, stale, or future-dated decision metrics remain non-decision-grade. An exact count must also be a non-negative safe integer. Approximate counters cannot authorize conclusions for their own metric, deactivation, calibration, or a hard cohort diagnosis, but they no longer suppress independent exact evidence from another metric. If engagement precision is unavailable, the combined reach/engagement score remains unavailable instead of normalizing visibility alone to a complete score. No unavailable value is coerced to exact zero.

## Health Engine

Health Engine uses only the title, SKU, stock, price, status, and DOM-heading-verified metrics visible on Etsy Shop Manager listing cards: visits/favorites must come from **Last 30 days**, while sales/revenue/renewals must come from **All time**. Missing, duplicated, or misplaced values fail closed, and legacy snapshots without verified scope cannot become decision anchors. It does not connect to the Etsy API, an external benchmark dataset, or an external collection service. Because Etsy does not expose a source-refresh timestamp here, freshness is based on capture time. Snapshots are created in local Tampermonkey storage only when the user selects **Scan this page**, **Collect all pages**, or **Start analysis**, which starts the same complete collection.

Visits and favorites are rolling 30-day values, while sales, revenue, and renewals are all-time totals. The engine therefore does not treat every difference between two scans as the same kind of change. Trend and deactivation anchors are selected only from the listing's current contiguous **active-state epoch**; an inactive period starts a new epoch. Exact sales and renewal differences select their own exact anchors, and revenue differences require a comparable currency. An exact rolling-window trend requires exact visit counters and a non-overlapping anchor 30–31 days away; nearer, older, or approximate counters remain descriptive only. Short intervals are early signals, while longer windows with an adequate sample provide more decision-ready evidence.

The card's **30-day reach/engagement** score measures last-30-day visits and a sample-size-smoothed favorite rate; the favorite component gains weight gradually as traffic accumulates and keeps the same meaning on first and later scans. All-time sales/revenue can protect a listing from risky changes, while renewals can create a waste priority; those historical counters do not artificially raise the current reach/engagement score. **Evidence readiness** is a heuristic summary of evidence coverage and decision readiness, not the probability that a recommendation is correct. A low value on the first scan does not turn complete zero counters into “insufficient data”; growth/decline still requires consecutive 30-day evidence, and deactivation review still requires at least 58 days of contiguous active history plus every other safety gate.

Health Engine does not rely on one colored recommendation; its evaluation considers the following explainable contexts together:

- **Lifecycle:** stages such as building a baseline, learning, a stable/growing/declining period, an experiment, inactivity, or deactivation review. The available stage depends on the depth of local history.
- **Performance hypothesis:** a possible weakness in discovery, post-visit interest, or purchase behavior. It is a review hypothesis derived from visible metrics, not a claim of causation.
- **Evidence readiness:** a heuristic readiness score composed from data quality, history depth, traffic sample, comparison group, freshness, and consistency; it is not a statistical probability. Eight comparable peers, excluding the target, make a cohort usable, and cohort influence increases continuously until 30 peers. Missing data or short history is not enough for a definitive decision.
- **Evidence and next review:** current values, suitable local comparisons, and the time needed for another assessment should accompany the decision; insufficient evidence leaves the result inconclusive.

In a listing's **Listing context** card, seasonality can be saved as `Seasonal`, `Non-seasonal`, or `Unknown`, and product type as `Digital`, `Physical`, or `Unknown`. Known values segment the comparison group. The seasonality gate for deactivation review passes only when `Non-seasonal` is explicitly selected.

A comparison group can be formed only from meaningfully comparable local records accumulated for the same shop in this browser. The target is excluded from its own peers; recently changed, experimental, inactive, out-of-stock, or incomplete listings are excluded. A cohort is unreliable below eight peers, and its relative weight ramps gradually from 8 to 30 peers. This is not an Etsy-wide market benchmark.

A recorded improvement can be compared observationally using a baseline no more than one day before publication and its changed fields. Title/tag experiments measure visit change, material experiments measure favorite-to-visit rate, and description experiments measure sale-to-visit rate. A **post-change increase/decrease signal** requires a 95% exact conditional Poisson rate-ratio interval that excludes 1. A zero baseline followed by a positive value is shown as a new absolute signal, never a fabricated relative percentage. Sales comparisons use integer cumulative-sales differences from matched real 30-day windows around the baseline and evaluation. If no valid snapshot exists on day 30, the experiment remains `Observing` through a seven-day grace period; it becomes `Inconclusive` only if that period ends without valid evidence. Because last-30-day metrics are rolling windows, results are observational rather than causal and earlier checks are provisional signals only. Overlapping changes weaken interpretation, so the workflow encourages one controlled hypothesis at a time.

`Review deactivation` alone is not an automatic deactivation command. Missing data, low evidence readiness, insufficient contiguous active history, unknown/seasonal context, a recent change, or an active experiment acts as a safety gate. Even when a listing becomes a review candidate, the user separately confirms deactivation for that listing. Current health, context, safeguards, anomaly state, proposal basis, and active status are recomputed before opening Etsy and again under the final-click lock. The script then revalidates the exact DOM contract, clicks only **Deactivate** and the final **Deactivate** control, and verifies a visible `Active → Inactive` transition. That verified state change invalidates the older completed collection, so analysis, AI export, and new queue creation require a fresh full scan. Legacy manual queue entries are verification-only and cannot trigger an automatic click.

## Workflow

1. Install the userscript in Tampermonkey.
2. Open **Listings** and enable Etsy’s **Stats** view.
3. Select **Collect all pages** or press `Ctrl + Alt + A`. The script moves from page 1 to the final page, returns to page 1, and then opens the analysis cards; use the same control to pause and resume. **Scan this page** remains available for a one-page refresh.
4. If the last completed run is 24 hours old, **Listing analysis** hides the cards. Select **Start analysis** or press `Ctrl + Alt + A`; after the full run completes, use search and filters to narrow the product group, then review lifecycle, performance hypothesis, confidence, evidence, and review timing. If evidence is insufficient, wait for another snapshot instead of forcing a decision.
5. For optional market research, select exactly one listing and press **Research with Marketplace Insights**. After the Insights tab opens, a bounded capability/READY handshake runs; if the companion is available, the research request is delivered and the validated result returns to Listing Analyzer. If it is absent, only this feature shows a Cancel/Open install page modal; all other Listing Analyzer features remain available.
6. Prepare a proposal in either of two ways. For the manual path, open **Improvement plan** on the listing card and choose an action; for **Update selected fields**, mark the fields to change, enter their replacement values, and press **Save proposal**. For the AI path, select cards, copy the request package from **AI proposals**, and import the validated response JSON; valid AI proposals are saved locally. Review and edit the proposal before queueing if needed.
7. A card selection is not a saved proposal; it only scopes research, AI export, and queue creation. Select the listing cards that have saved proposals and choose **Build queue from selection**. Cards without proposals and proposals saved as **Do nothing** (`SKIP`) are excluded; the fresh full-collection identity, proposal basis, and changed-field list are revalidated when the queue is built.
8. The queue opens listings one at a time. **Apply proposal to form** fills only the selected fields and does not publish. Review Etsy’s fields, then give **Reviewed; publish on Etsy** approval separately for each listing.
9. If publication or deactivation cannot be verified, the queue stops and never retries the write blindly. For deactivation, after the user confirms that listing, the script clicks only the exact **Deactivate** item and Etsy's final **Deactivate** button, never touches **Delete**, and advances only after `Active → Inactive` verification.

> **What does “Select at least one listing with a saved proposal” mean?** You selected a card, but did not save an actionable proposal for that listing, or saved it as **Do nothing**. Complete **Improvement plan → Save proposal** or import valid AI proposal JSON first; then select the card with that saved proposal and build the queue again.

Toggle the panel: `Ctrl + Alt + L`. Collect/pause/resume all pages: `Ctrl + Alt + A`.

## Etsy Keyword & Market Analyzer integration

The two scripts remain standalone. Listing Analyzer does not require Keyword & Market Analyzer for collection, Health Engine, AI JSON, proposals, or the user-approved action queue. It checks companion capability over a same-origin `BroadcastChannel` only after the user presses **Research with Marketplace Insights**.

If no compatible companion responds, Listing Analyzer does not begin any installation. The modal offers **Cancel**, **Copy request** for the complete request envelope, and the explicitly user-triggered **Open install page** action. The last action opens the canonical `main` raw `.user.js` URL in a new tab; the userscript manager still owns the final installation confirmation. Silent or unattended installation is not possible.

When the companion is available, the selected listing uses this bounded delivery:

1. Analyzer stores an opaque `L001`, one seed keyword by default, and a title/tag SHA-256 hash in its bounded GM storage for ten minutes; the real listing ID remains local.
2. The Insights tab opens at the canonical Marketplace Insights address without putting the nonce, seed, or payload in its query or fragment. Bounded retries allow its userscript listener to load and complete `PROBE → CAPABILITIES + RESEARCH_READY`; all delivery then stays on `BroadcastChannel` through `RESEARCH_REQUEST → RESEARCH_ACK → RESEARCH_RESULT → RESEARCH_RECEIVED`.
   While processing a seed, Keyword & Market Analyzer opens Etsy's normal Marketplace Insights search with a `query` value. This is a real Etsy Insights query: it may consume the search allowance Etsy provides to the account and, depending on the plan, may incur a query charge. The inter-script nonce, request ID, and payload are not added to that URL.
3. Every envelope validates a versioned schema, exact key set, field types, sender, expiry, one-time nonce, and 64 KiB limit; numeric metrics must be numbers or `null`. Changed content, expired messages, unknown/extra fields, and conflicting replays fail closed. For a matching but invalid result, Listing Analyzer sends terminal `RESULT_REJECTED`; the companion removes that pending result and its seed data from the queue.
4. Valid results are stored as `researchEvidence`. Etsy’s `Search results` is labeled **search results / competition indicator**, not a definitive competition score; the opportunity score is explicitly a Makaytron-derived metric.
5. A result never edits or publishes an Etsy field and never overwrites the user’s existing proposal. The user separately opens and saves the suggestion. If editor content has not been captured, no queue-ready proposal is created until safe field comparison is possible. When all 13 tag slots are full, the strongest candidate with measurable research evidence may replace exactly one low-evidence tag in the review draft only; nothing is auto-saved or published.

Keep Analyzer open during delivery. If automatic delivery is delayed or a tab closes, the transfer modal can copy the complete request envelope and import a complete `RESEARCH_RESULT` envelope JSON copied from the companion.

## AI JSON contract

The script makes no AI network request and stores no AI API key. Exported requests use an opaque `reference` plus a local-only `requestId` mapping. Imported responses must echo both values and explicitly provide a `fields` array containing only the Etsy fields to change: `title`, `description`, `tags`, or `materials`.

Fields omitted from `fields` stay unchanged. Clearing all tags requires the explicit combination `fields: ["tags"]` and `tags: []`; an empty or unavailable page snapshot cannot silently clear them.

Supported actions are `UPDATE`, `DEACTIVATE_REVIEW`, and `SKIP`. Unknown or duplicate references, updates without an explicit field list, titles over 140 characters, more than 13 tags, and tags over 20 characters fail closed.

## Safety boundaries

- No separate Etsy verification, OAuth, API key, or shared secret.
- No reading of Etsy cookies, browser session storage, or private API endpoints.
- No Etsy write action on page load.
- No automatic price, quantity, or variation update.
- Listing deletion is unsupported; the only lifecycle-removal proposal is the user-approved `DEACTIVATE_REVIEW` flow.
- Cross-tab queue lease and fail-closed handling for unverified publishing.
- A separate collection lease, page signatures, repeated-page guard, and 250-page safety ceiling protect all-page collection. An active action queue and an all-page collection cannot run at the same time; a stop-only recovery remains available for legacy overlapping state. If the stopped Etsy submission is still unverified, that recovery atomically blocks the overlapping collection and requires a new full collection. Collection reads visible listing data only and performs no listing write.
- Only temporary read/navigation failures are retried. Storage, schema, ownership, repeated-page, and Etsy-write failures remain fail-closed. Error reports exclude cookies, sessions, DOM HTML, and listing titles.
- Opening Listing analysis never auto-starts all-page collection; the 24-hour freshness gate hides stale cards until a new completed run exists.
- Opening the Etsy listings page writes no snapshot. Local records are created only after the user selects **Scan this page**, **Collect all pages**, **Start analysis**, or the corresponding shortcut.
- Native Web Locks serialize storage updates across tabs; record merging and write verification preserve concurrent snapshot/proposal changes. Revisioned collection compare-and-swap writes, canonical manifest fingerprints, and real page-observation timestamps prevent stale pause/resume or post-read state changes from becoming a fresh collection. Verified deactivation invalidates affected same-shop active and inactive scopes. AI import and queue creation revalidate the same fresh, complete collection identity and exact exported payload at action time.
- An open analysis view locks at the exact 24-hour expiry, and it synchronizes collections that start, complete, or become invalid in another tab.
- A storage-write failure or an active collection lease in another tab stops safely instead of marking incomplete data as completed/fresh; local analysis data cannot be cleared while collection is active.
- Recommendations are decision support; deactivation always requires the user.
- The optional Keyword & Market Analyzer bridge enforces a 64 KiB message limit, ten-minute request TTL, 30-minute absolute TTL ceiling, SHA-256 content hash, and one-time result validation. Keyword Analyzer returns research evidence only; Listing Analyzer derives the title/tag decision support locally and never publishes an Etsy field.
- Each companion-research seed can execute a normal Marketplace Insights `query` search. Consider the Etsy query allowance and any plan-dependent query charge before starting the user-approved research action.
- Health Engine results rely only on visible Etsy metrics and local history in this browser; they do not claim causation, an Etsy-wide market benchmark, or guaranteed future performance.
- For GitHub-origin installations, update checks allow only the exact canonical GitHub commit API address and the 40-character commit SHA's immutable `raw.githubusercontent.com` userscript path. The final URL, namespace, product name, and stable SemVer metadata are validated, and installation opens that same pinned URL. Other detected distribution sources retain their update mechanism. The script never replaces itself silently.

## Data and permissions

- `GM.getValue`, `GM.setValue`, `GM.deleteValue`: retain bounded snapshots, settings, queues, AI mappings, and research-delivery state in this script’s local userscript storage.
- `GM.xmlHttpRequest` + `@connect`: used for commit-pinned update verification and bounded pseudonymous telemetry; it does not call Etsy or AI APIs.
- `GM.openInTab`: opens Insights or the companion install page only after the user presses the corresponding research/install action.
- `GM_info`: distinguishes GitHub, Greasy Fork, and other installation sources so their update mechanisms are respected.
- `GM_registerMenuCommand`, `GM_unregisterMenuCommand`: manage panel, collection, analysis, and settings menu commands.
- `BroadcastChannel`: carries only versioned, size-bounded research envelopes between two Etsy tabs; it sends nothing to an external server.

Pseudonymous telemetry is on by default with a visible first-use notice and a one-click Settings opt-out that requests deletion of this userscript's server-side record. Only daily open, successful full-scan, and categorized-error counters are sent. Raw error text, listing IDs, titles, metrics, snapshots, analyses, and URLs are excluded. See [Privacy](../../PRIVACY.en.md).

This script does not use the Etsy API and is not an API integration. However, [Etsy's general Terms of Use](https://www.etsy.com/legal/terms-of-use) restrict crawling, scraping, or spidering Etsy pages without express permission. Because the script automatically reads the visible page DOM, evaluate that general provision separately when deciding how to use or distribute it.
