# Keyword & Market Analyzer user dry-run checklist

This checklist is the final user-controlled validation. Never add authenticated HTML, cookies, customer data, or shop data to the repository or an issue.

## Preconditions

- [ ] Installed file is `Makaytron-Etsy-Keyword-Market-Analyzer.user.js`, product name is **Makaytron Etsy Keyword & Market Analyzer**, and version is `1.0.3`.
- [ ] Installation came from the canonical raw `scripts/etsy-keyword-market-analyzer` URL.
- [ ] The user has reviewed the Etsy Marketplace Insights quota and possible query cost.
- [ ] The test keyword contains no personal, customer, or order data.

## Standalone mode

- [ ] With only Keyword & Market Analyzer installed, no panel appears outside Marketplace Insights routes.
- [ ] Marketplace Insights shows the white Makaytron-logo launcher on the right edge, product name, `v1.0.3`, TR/EN control, and accessible status text.
- [ ] The panel and data strips are black/white/neutral gray, the primary action is black, and color is limited to small text-labelled opportunity and trend badges.
- [ ] No new keyword search or Etsy write starts without a user action.
- [ ] A result page reads the primary keyword and similar terms; each unique row gets at most one Makaytron detail row.
- [ ] Searches are labelled as 30-day searches, Search results as Etsy's result/competition indicator, and trend as the 7-day change when present.
- [ ] Opportunity is labelled as a Makaytron-derived signal, not an Etsy metric or sales guarantee.
- [ ] Missing or unparseable fields remain null/empty; the script invents no values.
- [ ] React re-render, sorting, and pagination do not duplicate detail rows.
- [ ] Stop prevents the next seed query; a timeout does not freeze the core UI.
- [ ] JSON export contains no raw HTML, cookie, access token, customer, order, or shop-session data.

## With Listing Analyzer

- [ ] With only Listing Analyzer installed, **Start market research** probes for the companion only after the click.
- [ ] The missing-companion modal explains why it is needed; Cancel opens no tab.
- [ ] **Open install page** opens the canonical `etsy-keyword-market-analyzer` `.user.js` URL and leaves final approval to Tampermonkey.
- [ ] With both scripts installed, `PROBE → CAPABILITIES → RESEARCH_REQUEST → RESEARCH_ACK → RESEARCH_RESULT → RESEARCH_RECEIVED` completes.
- [ ] Wrong nonce, expired, replayed, over-64-KiB, or stale-content-hash results are rejected fail-closed.
- [ ] A complete `RESEARCH_REQUEST` JSON copied by Listing Analyzer imports into Keyword Analyzer; its complete `RESEARCH_RESULT` JSON can be copied/downloaded and imported into Listing Analyzer.
- [ ] Malformed, expired, missing-key, or extra-key fallback JSON is rejected on both sides without starting work.
- [ ] The Insights tab URL contains no nonce, title, tag, or request payload.
- [ ] If the Analyzer tab closes, standalone research and JSON recovery remain available.
- [ ] The title/tag suggestion that Listing Analyzer derives locally displays its evidence but never writes to Etsy's editor or clicks Publish automatically.

## Multi-tab and delivery resilience

- [ ] With two Marketplace Insights tabs open, only the leader tab performs query/navigation work and produces one result for a request.
- [ ] After the leader tab closes, the other tab takes over once the lease expires without duplicate results or parallel navigation.
- [ ] If `RESEARCH_RECEIVED` is lost, the result can be retried for a bounded interval; expiry prunes it and restores capacity in the 30-record queue.
- [ ] If Listing Analyzer rejects a stale or invalid result, Keyword Analyzer moves the matching request/nonce to a terminal state instead of retrying forever.

## Updates and cleanup

- [ ] Automatic in-app update checks do not run more than once per 24 hours; manual checks require user action.
- [ ] A simulated Greasy Fork or other distribution source does not force the GitHub updater.
- [ ] GitHub is accepted only when both metadata URLs are the exact canonical parameter-free HTTPS `.user.js` URL; forks, wrong paths, ports, query/hash/credentials, and mixed URLs are rejected.
- [ ] An active research job blocks opening the update installation page.
- [ ] The new-version warning's **Update** action opens the exact Keyword Analyzer `.user.js` file pinned to the checked 40-character GitHub commit SHA; Tampermonkey's preview shows product name and version `1.0.3`.
- [ ] Cache pruning applies the seven-day/cap limits and the panel cleanup action removes local research data.
- [ ] Repeat the same standalone and dual-script tour in current Firefox Tampermonkey and Microsoft Edge Tampermonkey.

For each failure, record browser, Tampermonkey version, route, and redacted evidence. Live listing Publish, deactivation, and deletion are outside this dry-run.
