# Makaytron Etsy Listing Analyzer usage guide

<p><a href="./USAGE.md">Türkçe</a> · <strong>English</strong></p>

Listing Analyzer collects visible Etsy Shop Manager listing statistics, evaluates local history, and prepares user-approved improvement queues. It requires no Etsy API/OAuth key.

> Health Engine is decision support, not a claim of causation, an Etsy-wide benchmark, or guaranteed sales. Opening a page alone never starts collection, saves a snapshot/proposal, or writes to Etsy.

## Supported pages

- Listings: `https://www.etsy.com/your/shops/<shop>/tools/listings*`
- Listing editor: `https://www.etsy.com/your/shops/<shop>/listing-editor/edit/<id>*`

Enable Etsy's **Stats** view and the real listing-state filter you intend to inspect. Use the `active` scope for active-listing analysis. Cards must show visits/favorites under **Last 30 days** and sales/revenue/renewals under **All time**.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Listing Analyzer userscript](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js) and approve installation.
3. Refresh Etsy Shop Manager **Listings**.
4. Open the Makaytron panel on the right.

## First safe full collection

1. Confirm that the **Last 30 days** and **All time** statistic sections are visible.
2. Select **Collect all pages** or press `Ctrl + Alt + A`.
3. The script completes `1 → 2 → … → final page → 1`.
4. It validates identity, pagination, raw visible card roots, canonical edit links, parsed listings, unique listing IDs, and the correct Etsy time scope for all five metrics on every page; every card set must have identical cardinality.
5. Analysis cards unlock only after the return to page 1 and complete-collection verification succeed.

The same control pauses and resumes collection. Each saved step advances a revisioned manifest and records the earliest real DOM observation for that page; if another tab has already saved a newer page or changed listing membership after the read, the stale tab stops instead of overwriting it. An active action queue and an all-page collection are mutually exclusive. Stop or complete the queue before starting/resuming collection; a stop-only recovery remains available for state left overlapping by an older version. If that recovery stops an Etsy submission whose result is still unverified, the overlapping collection is safely blocked and a new full collection is required. **Scan this page** refreshes one page only; it is not a substitute for a complete all-page collection when analyzing the shop or building an action queue.

A missing, duplicated, or misplaced metric section, malformed or duplicate-ID card, repeated/overlapping page, mixed transient DOM, shop-identity mismatch, or page-count mismatch keeps analysis locked. Missing data is never converted to zero. Legacy snapshots without a verified scope may remain visible in charts but cannot anchor a trend, experiment, or deactivation decision.

## Interpret analysis correctly

| Indicator | Window / meaning |
|---|---|
| Visits and favorites | Etsy's visible rolling last-30-day values. |
| Sales, revenue, and renewals | All-time counters shown on Etsy cards. |
| **30-day reach/engagement** | Comparable performance score from current visits and a sample-size-smoothed favorite rate whose weight increases gradually. |
| **Evidence readiness** | Heuristic summary of data coverage and local time-series readiness; not a listing-quality score or correctness probability. |

Evidence readiness may be low after the first full scan. That does not mean the listing's performance or the recommendation's correctness has the same percentage. Current reach/engagement and first-scan evidence are assessed separately. Growth/decline needs comparable 30-day history; deactivation review needs at least 58 days of contiguous active history plus every other safety guard.

Complete, fresh, and exact zero counters are **no current activity**, not missing data. Unreadable, stale, future-dated beyond the five-minute clock-skew tolerance, approximate, or inconsistent observations stay fail-closed as **missing / inconsistent data** and cannot authorize deactivation or threshold calibration. Day keys and displayed times use UTC.

Trend and deactivation anchors are selected only inside the listing's current contiguous **active-state epoch**; an intervening inactive period starts a new epoch. Exact sales and renewal differences select their own exact anchors, and a revenue difference is computed only between matching currencies. An exact rolling-window trend additionally requires exact visit counters and a non-overlapping snapshot 30–31 days away; a nearer, older, or compact `K`/`M`/`B` value is descriptive only. In the listing detail, open **Listing context** and save seasonality (`Seasonal`, `Non-seasonal`, or `Unknown`) and product type (`Digital`, `Physical`, or `Unknown`). Known context segments the cohort, and deactivation review requires an explicit `Non-seasonal` value.

The shop cohort excludes the target listing from its own peers. It requires at least eight suitable peers, and cohort influence ramps gradually from 8 through 30 peers. A hard percentile diagnosis requires full strength in the specific metric that produces it. Product type, seasonality, price band, and currency mismatches can narrow the peer set.

History charts distinguish exact, approximate, legacy, stale, and missing observations. Stale values do not connect line segments, limited endpoints stay direction-neutral, and an all-zero series stays on the zero baseline. If revenue history contains multiple canonical currencies, only the latest unit series is plotted and older units are reported as excluded rather than sharing one numeric scale.

An experiment baseline must be no more than one day before publication. A **post-change increase/decrease signal** for visits, favorites, or sales requires a 95% exact conditional Poisson rate-ratio interval that excludes 1. Compact `K`/`M`/`B` counters are approximate display values and therefore cannot generate an exact trend or experiment signal. A positive result from a zero baseline is shown as a new absolute signal, not a relative percentage. Sales evaluation uses integer cumulative-sales differences from matched real 30-day windows. If no valid snapshot exists on day 30, the experiment remains `Observing` through a seven-day grace period, then becomes `Inconclusive` if evidence is still unavailable. These are observational signals, not causal claims.

Use search, built-in/custom presets, lifecycle, issue/opportunity, recommendation, performance, stock, and evidence-readiness filters. Remember that sales/revenue/renewals are all-time while visits/favorites cover the last 30 days.

## Manual improvement proposal

1. Open **Improvement plan** on the listing card.
2. Choose an action.
3. For **Update selected fields**, explicitly mark title, description, tags, or materials and enter replacement values.
4. Add a reason/note when useful.
5. Select **Save proposal**.

A card checkbox does not save a proposal; it only scopes research, AI export, and queue creation. A proposal saved as **Do nothing** (`SKIP`) is not queueable.

## AI proposal

Listing Analyzer makes no network request to an AI provider and stores no AI API key.

1. Select the desired analysis cards.
2. Open **AI proposals** and copy the request package.
3. Give the package to your chosen external AI tool yourself; review its content and privacy scope first.
4. Paste the tool's complete response JSON back into Listing Analyzer and import it.
5. Proposals are stored locally only after the whole schema validates and every opaque reference still matches the exact editable content, analysis basis, saved-proposal identity, verified-deactivation state, and request payload exported for it. The import is atomic: one stale reference rejects the complete response and writes nothing.
6. Review **Before / AI proposal / Verified result** and edit the proposal when needed.

## Action queue and publishing

1. Select cards that have saved, actionable proposals.
2. Select **Build queue from selection**.
3. The script revalidates the fresh full-collection identity, listing scope, proposal basis, and changed-field list. Cards without proposals and `SKIP` proposals are excluded.
4. Open the first queued listing.
5. In the editor, select **Apply proposal to form**. This fills only selected fields and does not publish.
6. Review the Etsy form, listing ID, and every changed field.
7. Give **Reviewed; publish on Etsy** approval separately for each listing. This is live-publish authority.
8. The queue advances only after the visible result is verified.

If publication cannot be verified, the queue stops and never retries the write blindly. If listing content, analysis settings, or collection basis changed after saving the proposal, it becomes stale; reopen and save the plan again.

### “Listing with a saved proposal” warning

This means you selected a card but did not save an actionable proposal for it, or saved **Do nothing**. Complete **Improvement plan → Save proposal** or import valid AI proposal JSON, then select the card again.

## Deactivation review

**Review deactivation** alone is not an automatic deactivation command. After the user confirms that listing, the script recomputes current health, context, safeguards, anomaly state, proposal basis, and active status before opening Etsy and once more under the final-click lock. It clicks only Etsy's single visible, enabled, exact **Deactivate** menu item and the final **Deactivate** button in the correctly titled dialog. **Delete** or any deletion semantics are never accepted. The queue advances only after a visible `Active → Inactive` transition; an uncertain result is never retried automatically and can only use the read-only **Verify deactivation and continue** recovery action. Verification retains one immutable operation time across recovery attempts and invalidates affected older active/inactive collections for the same shop; run a new full collection before further analysis, AI export, or new queue creation.

A queue item left at v1.0.7's old manual step is compatibility data for read-only verification or stopping the queue. It cannot enter the current automatic click path. Rebuild a new queue from a fresh, complete analysis if deactivation is still appropriate.

## Marketplace Insights research

This integration is optional; Listing Analyzer's other features remain available without the separate Keyword & Market Analyzer.

1. Select exactly one listing card.
2. Select **Research with Marketplace Insights**.
3. If the companion is ready, a versioned request is handed off. Each seed may open a normal Etsy Marketplace Insights `query` search and consume quota or plan cost.
4. Review validated searches, the search-result/competition indicator, and the Makaytron-derived opportunity evidence.
5. Research creates review evidence only. It does not overwrite an existing proposal, edit Etsy, or publish.

If the companion is absent, its install page opens only after explicit user action and final approval remains in Tampermonkey. Use complete `RESEARCH_REQUEST` / `RESEARCH_RESULT` JSON recovery tools when automatic transfer is unavailable.

## Local data, backup, and freshness

- Snapshots, analysis, proposals, queue, experiments, and filter presets stay in Tampermonkey local storage.
- Analysis locks when the completed collection or its oldest page reaches 24 hours; run a new full collection.
- **Download backup** exports JSON. Import validates size/schema and never activates an old action queue.
- **Clear local analysis data** requires confirmation and is blocked during active collection/queue work.

## Keyboard shortcuts

- `Ctrl + Alt + L`: Toggle panel
- `Ctrl + Alt + A`: Collect / pause / resume all pages

## First use and support

Limited pseudonymous usage telemetry is enabled by default with a visible first-use notice. Turning it off in Settings requests deletion of this userscript's server-side record; see [Privacy](../../PRIVACY.en.md).

Complete the [Listing Analyzer dry-run checklist](../../docs/listing-analyzer-dry-run-checklist.en.md) before the first live listing write. Remove shop/listing identity, title, metrics, cookies, sessions, and page content before sharing an error report.

[Package README](./README.en.md) · [Changelog](./CHANGELOG.md) · [Privacy](../../PRIVACY.en.md) · [Security](../../SECURITY.en.md) · [Support](../../SUPPORT.en.md)
