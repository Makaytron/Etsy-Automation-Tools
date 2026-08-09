# Makaytron Etsy Keyword & Market Analyzer usage guide

<p><a href="./USAGE.md">Türkçe</a> · <strong>English</strong></p>

Keyword & Market Analyzer reads, explains, and locally stores visible keyword metrics from Etsy Marketplace Insights. It works standalone; Listing Analyzer integration is optional.

## Supported pages

- `/your/shops/<shop>/marketplace-insights`
- `/your/shops/<shop>/marketplace-insights/search`

You can open the panel and start a search from the Marketplace Insights landing page. To analyze or save an open result, the main query, **Searches**, **Search results**, and any related-term table must be visible. The script never writes to Etsy listings, Ads controls, or Publish fields.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Keyword & Market Analyzer userscript](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js) and approve installation.
3. Open **Marketplace Insights** in Etsy Shop Manager.
4. Use the white Makaytron launcher on the right to open the panel.

## Standalone keyword research

1. Enter the keyword you want to research.
2. Select **Search in Etsy Insights**.
3. The script navigates through Etsy's normal Marketplace Insights route with only `query` and `search_trigger`.
4. Wait for the complete result to render.
5. Read-only metric strips may appear below the main keyword and up to 25 related terms.
6. To persist the result locally, also select **Analyze and save this page**.
7. Download saved structured captures through **Export JSON**.

> **Quota warning:** **Search in Etsy Insights** is a normal Etsy Marketplace Insights query. It may consume Etsy-provided query allowance and may incur plan-dependent cost. **Analyze and save this page** only saves the already-open result locally; it does not start another Etsy query.

## Displayed metrics

| Field | Source and interpretation |
|---|---|
| 30-day searches | Etsy's visible `Searches` value. |
| Search results / competition indicator | Etsy's visible `Search results`; not direct sales or a definitive competition score. |
| 7-day change | Trend percentage when Etsy displays it. |
| Captured at | When the visible result was read. |
| Makaytron opportunity score | A derived comparison aid from searches and the result indicator; not an Etsy metric or sales guarantee. |

Inline metrics appearing on the page does not mean the result was persisted. Use **Analyze and save this page** for a local record.

## JSON export

**Export JSON** downloads saved general Marketplace Insights captures. The file:

- contains structured keywords and metrics;
- excludes cookies, sessions, raw HTML, and Etsy access tokens;
- is not the complete `RESEARCH_RESULT` envelope used by Listing Analyzer integration.

## Automatic Listing Analyzer integration

1. Select exactly one listing in Listing Analyzer.
2. Start **Research with Marketplace Insights** as the user.
3. If Keyword Analyzer is ready, a versioned handshake completes and queues the request.
4. The default is one seed and the explicit ceiling is three. Each seed can open a normal Etsy Insights query and consume quota/cost.
5. Keyword Analyzer processes seeds sequentially, validates visible results, and sends a complete result to Listing Analyzer.
6. It retains the result until Listing Analyzer acknowledges receipt.
7. Listing Analyzer creates local review evidence; no Etsy listing is edited or published automatically.

A short processor lease across Insights tabs prevents duplicate processing. Keep the relevant tabs open while a job is active.

## JSON fallback integration

When automatic browser transfer is unavailable:

1. Copy the complete `RESEARCH_REQUEST` envelope JSON from Listing Analyzer.
2. Paste it into **Listing Analyzer research envelope (JSON)** in Keyword Analyzer.
3. Select **Import research request**.
4. After completion, use **Copy result envelope** or **Download result envelope**.
5. Return the complete `RESEARCH_RESULT` envelope to Listing Analyzer.

**Import research request** authorizes the validated job to be queued and run immediately; there is no second confirmation per seed. Before importing, check the envelope's maximum of three seeds and the Etsy Insights quota/cost impact. Each seed may open a normal Marketplace Insights query.

A general capture export cannot replace this envelope. Wrong schema, nonce, sender, expiry, content hash, extra/missing fields, replay, or a message over 64 KiB fails closed.

## Clear local data

**Clear local data** requires confirmation and removes:

- saved captures;
- seven-day cache;
- research queue;
- valid result envelopes;
- the short processor lease.

Language and interface preferences remain. An active integration job receives a `CANCELLED` result before cleanup.

## Keyboard and menu controls

- There is no global `Ctrl/Alt` shortcut.
- `Escape` closes the panel while focus is inside it.
- The Tampermonkey menu offers panel open, current-result capture, JSON export, request import, result-envelope copy, local-data cleanup, and update check.

## Troubleshooting

- If no result is found, wait for the main keyword, Searches/Search results, and related-term rows to finish loading.
- If metrics cannot be read, the script invents nothing; verify the open page manually.
- If automatic integration is delayed, keep Listing Analyzer open or use the complete JSON fallback.
- Limited pseudonymous usage telemetry is enabled by default with a visible first-use notice. Turning it off in Settings requests deletion of this userscript's server-side record; see [Privacy](../../PRIVACY.en.md).
- Never include seed keywords, metrics, listing data, shop identity, cookies, or session information in an issue or screenshot.

Complete the [Keyword & Market Analyzer dry-run checklist](../../docs/keyword-market-analyzer-dry-run-checklist.en.md) before the first research run.

[Package README](./README.en.md) · [Changelog](./CHANGELOG.md) · [Privacy](../../PRIVACY.en.md) · [Support](../../SUPPORT.en.md)
