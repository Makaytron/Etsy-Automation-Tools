# Makaytron Etsy Listing Analyzer usage guide

<p><a href="./USAGE.md">Türkçe</a> · <strong>English</strong></p>

Listing Analyzer collects visible Etsy Shop Manager listing statistics, evaluates local history, and prepares user-approved improvement queues. It requires no Etsy API/OAuth key.

> Health Engine is decision support, not a claim of causation, an Etsy-wide benchmark, or guaranteed sales. Opening a page alone never starts collection, saves a snapshot/proposal, or writes to Etsy.

## Supported pages

- Listings: `https://www.etsy.com/your/shops/<shop>/tools/listings*`
- Listing editor: `https://www.etsy.com/your/shops/<shop>/listing-editor/edit/<id>*`

Enable Etsy's **Stats** view and the real listing-state filter you intend to inspect. Use the `active` scope for active-listing analysis.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Listing Analyzer userscript](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js) and approve installation.
3. Refresh Etsy Shop Manager **Listings**.
4. Open the Makaytron panel on the right.

## First safe full collection

1. Confirm that listing statistic rows are visible.
2. Select **Collect all pages** or press `Ctrl + Alt + A`.
3. The script completes `1 → 2 → … → final page → 1`.
4. It validates identity, pagination, card counts, listing IDs, and all five metrics on every page.
5. Analysis cards unlock only after the return to page 1 and complete-collection verification succeed.

The same control pauses and resumes collection. **Scan this page** refreshes one page only; it is not a substitute for a complete all-page collection when analyzing the shop or building an action queue.

Missing metrics, repeated/overlapping pages, mixed transient DOM, shop-identity mismatch, or page-count mismatch keeps analysis locked. Missing data is never converted to zero.

## Interpret analysis correctly

| Indicator | Window / meaning |
|---|---|
| Visits and favorites | Etsy's visible rolling last-30-day values. |
| Sales, revenue, and renewals | All-time counters shown on Etsy cards. |
| **30-day reach/engagement** | Comparable performance score from current visits and favorite rate only. |
| **History confidence** | Readiness of local time-series evidence for trend/deactivation decisions; not a listing-quality score. |

History confidence may be `39` or low after the first full scan. That does not mean the listing's performance is 39%. Current reach/engagement and first-scan evidence are assessed separately. Growth/decline needs comparable 30-day history; deactivation review needs at least 58 days of complete history plus every other safety guard.

Complete and fresh zero counters are **no current activity**, not missing data. Unreadable, stale, or inconsistent observations stay fail-closed as **missing / inconsistent data**.

Use search, built-in/custom presets, lifecycle, issue/opportunity, recommendation, performance, stock, and data-confidence filters. Remember that sales/revenue/renewals are all-time while visits/favorites cover the last 30 days.

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
5. Proposals are stored locally only after the whole schema validates. Invalid or partial JSON writes nothing.
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

**Review deactivation** is not an automatic deactivation command. The script only opens Etsy's options and focuses **Deactivate**. The user clicks **Deactivate** and Etsy's final confirmation. After checking the Etsy result, select **Verify deactivation and continue** in the panel; only then does the script verify the visible result and advance the queue. Listing deletion is not automated.

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
