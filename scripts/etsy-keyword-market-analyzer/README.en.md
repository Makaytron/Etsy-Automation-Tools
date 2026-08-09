# Makaytron Etsy Keyword & Market Analyzer

<p><a href="./README.md">Türkçe</a> · <strong>English</strong></p>

**Short name:** Etsy Keyword & Market Analyzer

**Version:** 1.0.3

**Usage guide:** [English](./USAGE.en.md) · [Türkçe](./USAGE.md)

Reads the primary query and up to 25 similar search terms from an Etsy Marketplace Insights result page. Beneath each keyword, it shows Etsy's 30-day searches, search-result indicator, optional 7-day change, capture time, and an opportunity score explicitly identified as derived by Makaytron.

This project is not created, supported, or endorsed by Etsy. The Etsy name only identifies the supported page.

## Standalone use

The script is fully usable on its own; Makaytron Etsy Listing Analyzer is not required.

1. Open the [canonical installation file](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js) and confirm installation in your userscript manager.
2. Visit Marketplace Insights in Etsy Shop Manager.
3. Open the panel from the white Makaytron-logo launcher on the right edge.
4. Search for a keyword in Etsy Insights, or analyze and save the open result page.
5. Export saved structured results as JSON when needed.

A search is opened only after a user action. Every seed navigates to the normal Marketplace Insights search route with `query=<keyword>`. Etsy treats this as a normal Insights search, so it may consume Etsy's research quota or any account-plan cost that applies. Etsy controls quotas, account access, and the values displayed by Marketplace Insights.

## Visual system

The panel, launcher, and inline data strips follow the shared Makaytron userscript standard with black, white, and gray surfaces. High/medium/low opportunity and rising/falling trend colors appear only in small, text-labelled semantic badges. Inline data stays compact so it does not unnecessarily enlarge Etsy table rows.

## Listing Analyzer integration

When Makaytron Etsy Listing Analyzer is also installed, both scripts can communicate on the same Etsy origin through a versioned `BroadcastChannel` contract:

- Channel: `makaytron:etsy-keyword-market-analyzer:v1`
- Flow: `PROBE / CAPABILITIES / RESEARCH_READY / RESEARCH_REQUEST / RESEARCH_ACK / RESEARCH_RESULT / RESEARCH_RECEIVED / ERROR`
- Requests validate `requestId`, one-time `nonce`, expiry, a 64 KiB message limit, and content hash.
- Research defaults to one seed and has an explicit three-seed cap.
- The queue is sequential, cancellable, and each DOM result has a fail-closed timeout.
- Results use a bounded seven-day cache.
- Across multiple Marketplace Insights tabs on the same origin, a GM-storage lease elects exactly one processor leader. A page-instance identity and one bounded startup presence handshake distinguish browser-duplicated tabs even when they inherit the same history identity, without continuous polling. The short TTL is renewed and instance-bound; another tab can safely take over after the leader closes or its lease expires. This prevents duplicate navigation and duplicate results for one job.
- A `RESEARCH_RESULT` remains `awaiting-receipt` until the matching `RESEARCH_RECEIVED { accepted: true }` arrives. If the request deadline expires, the record becomes terminal with `RECEIPT_TIMEOUT`; its result payload is removed and later `PROBE` messages do not resend it. Old terminal queue records are pruned after 24 hours.

### JSON fallback

Both scripts remain independently usable. If `BroadcastChannel` delivery is unavailable, paste the **complete** `RESEARCH_REQUEST` envelope produced by Listing Analyzer into the panel's `Listing Analyzer research envelope (JSON)` field and choose `Import research request`. Import uses the same strict envelope, expiry, sender, schema, size, nonce, and payload validation as automatic delivery.

Move a valid completed **complete** `RESEARCH_RESULT` envelope back to Listing Analyzer with `Copy result envelope` or `Download result envelope`. The general capture export is not a substitute for this integration envelope. This fallback contains no cookies, tokens, session data, or raw HTML.

Standalone features are unaffected when Listing Analyzer is absent. Integration results never edit an Etsy listing automatically; they return through Listing Analyzer's normal review and user-approval boundary.

## Data and permissions

| Permission / target | Purpose |
| --- | --- |
| `@match https://www.etsy.com/your/shops/*/marketplace-insights*` | Run only on Marketplace Insights landing and result routes. |
| `GM.getValue`, `GM.setValue`, `GM.deleteValue` | Store settings, bounded structured captures, queue, valid result envelopes, short cross-tab processor lease, and seven-day cache; also supports explicitly confirmed local-data cleanup. |
| `GM_registerMenuCommand` | Panel, capture, complete-envelope fallback, export, and manual update-check shortcuts. |
| `GM.xmlHttpRequest` + `@connect api.github.com` / `raw.githubusercontent.com` | Check the public `main` commit identity and canonical userscript metadata only at that immutable commit, no more than once per 24 hours. `GM.xmlHttpRequest` is never used for Etsy; normal Marketplace Insights `query` navigation is documented above. |
| `GM.xmlHttpRequest` + `@connect` | Bounded pseudonymous telemetry, enabled by default with a visible first-use notice, and its one-click opt-out deletion request. |
| `GM.openInTab` | Open the canonical `.user.js` installation page only after user approval. The userscript manager owns final confirmation. |
| `GM.info` | Detect installation source and avoid forcing GitHub updates over another distributor's mechanism. |

The script:

- does not inspect cookies, passwords, access tokens, browser profiles, or Etsy private APIs;
- reads Marketplace Insights only from the open page DOM;
- does not retain raw HTML, customer data, or shop sessions;
- never writes `requestId`, `nonce`, or research payloads into the Etsy search URL, fragment, or history state; only the normal `query` and `search_trigger` appear in the URL;
- does not write, edit, or publish listings;
- does not download and execute remote code or perform silent installation/update;
- exports only structured keyword metrics.

Telemetry is on by default with a visible first-use notice. Only daily open, successful research-completion, and categorized-error counters are sent. Raw error text, seed keywords, search/result/trend metrics, listing data, research envelopes, Etsy identifiers, and URLs are excluded. Turning it off in Settings requests deletion of this userscript's server-side record. See [Privacy](../../PRIVACY.en.md).

### Clearing local data

`Clear local data` is available from both the panel and the Tampermonkey menu. After explicit user confirmation, it deletes and verifies readback only for:

- saved structured research (`captures`),
- the seven-day research cache (`cache`),
- pending and completed research queue entries (`queue`),
- valid complete result envelopes (`results`),
- the short cross-tab processor lease (`lease`).

The TR/EN language and interface preference is preserved. The last update-check time is also preserved because it is not personal research data. If an integration job is active, the other script receives a `CANCELLED` result before deletion.

## Opportunity metric

`searches30d` and `searchResults` come from values displayed by Etsy. `opportunity.score` is not an Etsy metric. It combines demand magnitude with the searches-to-results ratio and is marked `metric: "makaytron-derived"`. Product relevance and keyword accuracy still require user judgment.

## Updates

The userscript manager's `@updateURL` / `@downloadURL` mechanism is primary. The in-app check:

- runs in the background no more than once per 24 hours for canonical GitHub installations;
- never blocks core analysis on a network failure;
- supports a manual `Check for updates now` action;
- blocks opening the installation page while research is active;
- opens only an immutable-commit file whose exact product name, namespace, version, and canonical `@updateURL` / `@downloadURL` metadata were verified;
- opens the SHA-pinned correct `.user.js` file in Tampermonkey's confirmation screen only after user confirmation and never replaces the script itself.

## Limits

- Ambiguous or incomplete Etsy DOM causes analysis to stop rather than invent data.
- `Search results` is Etsy's displayed search-result indicator, not a direct sales count or complete measure of competition.
- Before the first research run, visually verify the primary result and similar-term rows on your own Marketplace Insights page.
