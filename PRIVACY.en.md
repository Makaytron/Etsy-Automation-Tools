<p><a href="./PRIVACY.md">Türkçe</a> · <strong>English</strong></p>

# Privacy and Data Processing

Last updated: 2026-08-04

Etsy Automation Tools consists of Tampermonkey userscripts that run in the browser. All five scripts enable limited, pseudonymous product-usage telemetry by default, show a visible first-use notice, and provide a one-click off switch in Settings. Telemetry does not collect Etsy content or account data. Message Assistant also opens on message pages by default and ships with **Automatic Turkish Preview** enabled. The latest customer message can therefore be sent automatically to Google Translate when a message page opens. To prevent this transfer, open Makaytron settings from the Tampermonkey menu and disable automatic Turkish preview before visiting a message page.

## Data processed locally

| Data | Purpose | Default retention |
|---|---|---|
| Settings and templates | Preserve user preferences | Until the user clears script storage |
| API keys and provider profiles | Connect directly to the user's selected translation or AI API | In local Tampermonkey storage until deleted |
| Customer name, conversation/order IDs, drafts, and action history | Drafting, duplicate prevention, and send verification | 90 days by default; configurable from 1–365 days, up to 500 records |
| Active campaign state | Pause, recovery, verification, and duplicate prevention | Until the flow completes or the user resets script storage |
| Campaign reports | Result review and export | The current report and up to 20 historical reports, until the user resets Tampermonkey script storage |
| Ads keyword rules, language/panel preference, and latest list backup | Matching, interface preference, and list restoration | Until the user resets Tampermonkey script storage |
| Visible Ads keyword text and click/order counts | Page summaries, matching, and choosing targets for user-triggered enable/disable actions | Processed only in the open page's memory; not intentionally persisted |
| Listing ID, visible card fields, traffic/favorite/sale/revenue/renewal metrics, and snapshot time | Compare listing performance with earlier observations | A repeated same-day scan updates that sample; up to 120 snapshots per listing and up to 400 days in local Tampermonkey storage |
| Separate listing record, analysis decision, user note, proposed before/after fields, and action result | Track improvements, prevent duplicates, and provide a user-visible audit record | Listing records are separate; improvement/action audit history is capped and retained until the user clears it or resets script storage |
| Listing Analyzer language/panel preference, user-adjusted thresholds, and filter presets | Preserve interface and decision-support preferences | Until the user changes them or resets script storage; in-script data clearing preserves settings and presets |
| AI request ID and temporary reference-to-listing-ID map | Hide real listing IDs in the exported AI package and bind a validated response to the correct local record | At most the latest 10 request maps; removed after a successful import or when the user clears local data |
| Active Listing Analyzer queue, collection error reports, and tab ownership | Controlled cross-page resume, technical diagnosis, stopping, and duplicate-action prevention | Until the job completes/stops or the user resets script storage; at most 20 technical error reports |
| Marketplace Insights keyword text, 30-day searches, Search results indicator, optional 7-day trend, capture time, and derived opportunity signal | Explain the open result page, render inline details, and export structured JSON | Up to 100 structured captures until the user clears them or resets script storage |
| Listing research request, anonymous local listing reference, title, tags, seed keyword, content hash, and structured result | Optional research between two independent analyzers with stale/replay validation | Up to 30 queue/result records; cache is capped at 80 records and seven days; delivery/terminal records are pruned after expiry |

The userscripts do not request direct access to browser profiles, cookies, or Etsy passwords. Review Tampermonkey permissions during every installation.

## Pseudonymous usage telemetry

Telemetry requires no membership or Makaytron/Etsy account and does not link identities across users. On first run, each userscript creates its own random UUID installation identifier. The identifier travels over HTTPS only to the telemetry collector, is transformed before application storage, and is not retained in raw form in the application database.

Makaytron telemetry storage retains only this limited information:

- a pseudonymous value derived from the installation identifier;
- the script name and version;
- daily open, successful-use, and categorized-error counters;
- server-generated UTC day and time;
- short-lived data derived from the IP address for abuse-rate limiting.

The raw IP address is never written to the application database. Derived network-abuse-prevention data is retained briefly and deleted automatically. Daily event and error aggregates are retained for 180 days, and an installation summary with no later activity is retained for 400 days. Each allowed signal is measured at most once per UTC day for each script.

The hosting provider may also create managed request and network operational logs. Those logs can include request/response metadata, permitted request fields, network metadata, and the caller IP address; under the current service plan they are retained for one day. The in-script opt-out deletes application records, but it cannot selectively erase provider logs that were already created; they expire under the provider's retention period.

Telemetry rejects raw error messages and stacks, caught Error objects, DOM/selector content, Etsy messages, draft/translation text, customer or order data, shop/listing identifiers, keywords, search results/metrics, URLs, cookies, sessions, API keys, and browser fingerprints. Errors are counted only in general categories. A telemetry network failure never blocks the userscript's primary operation.

Telemetry is not started when browser Do Not Track (`navigator.doNotTrack === "1"`), Global Privacy Control (`navigator.globalPrivacyControl === true`), or an automated WebDriver session is detected.

The first-use notice explains that telemetry is on by default and can be disabled in Settings. When the user disables telemetry, the script asks the server to delete that userscript's installation summary and linked daily event/error aggregates, then removes the local telemetry identifier after a verified deletion response. No secret key appears in a public userscript or documentation.

## Third-party recipients

- Google Translate is the default translation provider. Automatic Turkish preview is enabled by default and may send the latest customer message to `translate.googleapis.com` when a message page opens; manual free translation sends selected text to the same recipient.
- DeepL sends text and the user's API key to the DeepL API.
- AI features send relevant message context and instructions to the user-selected OpenAI, Anthropic, Google Gemini, DeepSeek, or OpenRouter API.
- Listing Analyzer `v1.0.4` makes no network request to an AI provider and stores no AI API key. The user can export or copy an anonymizable request JSON/prompt, then import proposal JSON from an external tool after validation. The user controls what is sent to that external tool.
- Listing Analyzer checks the canonical `main` commit identity through `api.github.com`, then reads userscript metadata only from that immutable commit on `raw.githubusercontent.com`, at most once every 24 hours with anonymous, cookie-free requests. Installation is never automatic; only the verified commit URL is opened in Tampermonkey's confirmation screen.
- Keyword & Market Analyzer also verifies the canonical `main` commit identity through `api.github.com` and reads metadata only from that immutable commit's userscript on `raw.githubusercontent.com`. Etsy Sale Manager, Message Assistant, and Ads Keyword Manager may read their own canonical public Raw userscript sources at most once every 24 hours. A non-GitHub installation source does not have the private GitHub flow forced over its distributor.
- While telemetry is enabled, all five scripts may send limited daily open, successful-use, and categorized-error signals to the Makaytron telemetry collector. None of the raw errors, content, or account data excluded above is sent to that recipient.
- Ads Keyword Manager downloads the canonical `keyword-rules.txt` from `raw.githubusercontent.com` only after the user confirms **Update list**. The current local list is backed up in Tampermonkey storage first.
- Apart from the limited telemetry described above, Keyword & Market Analyzer sends no request to an Etsy API or Makaytron content server; it reads only the open Marketplace Insights DOM. Optional request/result messages between both analyzers stay in the same browser Etsy origin through `BroadcastChannel`. Title/tag content is transferred only after the user starts research.
- When the user starts standalone or integrated research, each seed keyword goes to Etsy as the URL `query` during normal Marketplace Insights search navigation. This may consume Etsy's research quota or displayed query cost; the script does not send it to Makaytron or bypass the quota.

Custom Ads rules, visible keywords, and advertising metrics are not uploaded to Makaytron or GitHub; telemetry counts only successful use of the Ads tool and general error categories. The panel logo is embedded in the userscript and does not create a separate branding-asset request when an Etsy page opens.

Listing Analyzer snapshots, analysis history, and action records are not automatically uploaded to Makaytron or GitHub; telemetry counts only completed full scans and general error categories. If the user exports this data, protecting and deleting the downloaded file is the user's responsibility.

Listing Analyzer does not use Etsy API/OAuth or request a shared secret. It reads only visible DOM fields on the open Etsy listing/listing-editor page. User-saved authenticated HTML or personal data must not be used as a repository fixture.

Keyword & Market Analyzer labels `Search results` as Etsy's visible result/competition indicator. The Makaytron opportunity score is derived decision support, not an Etsy-provided competition, sales, or performance forecast.

Each provider's own privacy and retention terms apply. Remove unnecessary customer and order details before sending text to a provider.

## Exports and secrets

Configuration exports exclude API keys by default. If **Include API keys** is deliberately enabled, keys are written in plain text to the downloaded JSON file. Do not share that file or place it in unprotected cloud storage.

Listing Analyzer AI request/prompt exports can contain listing titles, descriptions, tags, or user notes. Remove unnecessary shop/listing identifiers and personal data before providing them to an external AI tool. Imported proposal JSON is not itself a live write; supported fields are validated and every listing waits for user confirmation before Etsy Publish.

## Automatic sending

Automatic sending in Message Assistant is off by default. When enabled, the script may click Etsy's send button. Review every draft and enable the setting only after understanding its effect.

## Delete data

- Turn off usage telemetry in each script's Settings before uninstalling the script or resetting Tampermonkey storage. This requests deletion of the server-side installation summary and linked daily event and error aggregates, then removes the local telemetry identifier after a verified response. If the UUID is lost first, targeted server deletion is no longer possible and the record expires under the normal retention policy.
- Use **History → Clear History** inside Message Assistant.
- Use the history-clearing action inside Listing Analyzer or reset that Tampermonkey script's storage.
- Use Keyword & Market Analyzer's local-data cleanup action or reset its `ekma:v1` Tampermonkey script storage.
- Reset the relevant Tampermonkey script storage, or delete related data when removing a script, to clear settings, provider profiles, Ads rules, and the Ads list backup.
- Separately delete exported configuration, reports, and screenshots from your filesystem.

Update this document whenever code or data flows change. Privately report a security-sensitive disclosure through [SECURITY.en.md](./SECURITY.en.md).
