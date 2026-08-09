<p align="center">
  <img src="./assets/makaytron-logo.png" width="96" alt="Makaytron logo">
</p>

<p align="center"><a href="./README.tr.md">Türkçe</a> · <strong>English</strong></p>

# Etsy Automation Tools for Sellers

Open-source Etsy automation tools and Tampermonkey userscripts for sellers. The suite streamlines repetitive Etsy Shop Manager workflows and provides focused tools for Etsy sales and discounts, customer messages, Etsy Ads keywords, listing analysis, and Etsy SEO keyword research.

> This project is not developed, supported, or endorsed by Etsy.

## Scripts

| Script | Version | Purpose |
|---|---:|---|
| [Makaytron Etsy Sale Manager](./scripts/etsy-sale-campaign-batch-runner/README.en.md) | 1.0.12 | Bulk Sales & Discounts Automation that schedules, verifies, and reports Etsy sale campaigns in controlled, fail-closed batches. |
| [Makaytron Etsy Message Assistant](./scripts/etsy-message-assistant/README.en.md) | 1.0.3 | Provides translation, reply drafts, templates, and user-selected AI provider profiles. |
| [Makaytron Etsy Ads Keyword Manager](./scripts/etsy-ads-keyword-manager/README.en.md) | 1.0.3 | Enables or disables current-page matches and, after explicit confirmation, disables matches across all pages. |
| [Makaytron Etsy Listing Analyzer](./scripts/etsy-listing-analyzer/README.en.md) | 1.0.5 | Collects every page in order, returns to page 1, and adds retries, error reports, presets, charts, AI comparison, and Health Engine workflows. |
| [Makaytron Etsy Keyword & Market Analyzer](./scripts/etsy-keyword-market-analyzer/README.en.md) | 1.0.3 | Reads visible Marketplace Insights metrics, explains them beneath keyword rows, and can return evidence to Listing Analyzer, which derives the title/tag suggestion locally. |

Listing Analyzer and Keyword & Market Analyzer are independently installable and fully usable on their own. When the user starts the optional market-research action in Listing Analyzer and the companion is missing, the script explains why it is needed and opens the canonical install URL only after the user approves **Open install page**. Tampermonkey and the user always retain final installation control.

## Synthetic panel galleries

These images capture only **standalone panel/modal elements** rendered by the real userscript source in a network-blocked synthetic fixture. They contain no Etsy or other site background, browser frame, or real account, shop, customer, or order data.

### Makaytron Etsy Sale Manager

| Overview | Settings |
|---|---|
| ![Makaytron Etsy Sale Manager overview panel](./assets/screenshots/etsy-sale-manager-overview-panel.png) | ![Makaytron Etsy Sale Manager settings modal](./assets/screenshots/etsy-sale-manager-settings-modal.png) |

| Safe pause | Batch report |
|---|---|
| ![Makaytron Etsy Sale Manager paused-job panel](./assets/screenshots/etsy-sale-manager-paused-panel.png) | ![Makaytron Etsy Sale Manager batch-report modal](./assets/screenshots/etsy-sale-manager-report-modal.png) |

### Makaytron Etsy Message Assistant

| Message workspace | Reply review |
|---|---|
| ![Message Assistant message workspace panel](./assets/screenshots/message-assistant-workspace-panel.png) | ![Message Assistant generated-reply review panel](./assets/screenshots/message-assistant-reply-review-panel.png) |

| Templates | Settings |
|---|---|
| ![Message Assistant template manager panel](./assets/screenshots/message-assistant-templates-panel.png) | ![Message Assistant settings panel](./assets/screenshots/message-assistant-settings-panel.png) |

### Makaytron Etsy Ads Keyword Manager

| Main panel | Keyword rule editor |
|---|---|
| ![Ads Keyword Manager main panel](./assets/screenshots/ads-keywords-panel-ready.png) | ![Ads Keyword Manager rule-editor modal](./assets/screenshots/ads-keywords-rule-editor.png) |

### Makaytron Etsy Listing Analyzer

| Overview | Listing analysis |
|---|---|
| ![Listing Analyzer overview panel](./assets/screenshots/listing-analyzer-overview-panel.png) | ![Listing Analyzer analysis panel](./assets/screenshots/listing-analyzer-analysis-panel.png) |

| AI proposals | Action queue |
|---|---|
| ![Listing Analyzer AI proposals panel](./assets/screenshots/listing-analyzer-ai-proposals-panel.png) | ![Listing Analyzer action-queue panel](./assets/screenshots/listing-analyzer-action-queue-panel.png) |

Selecting a listing does not save a proposal; it only scopes research, AI export, and queue creation. First save a manual proposal from **Improvement plan** or import validated AI JSON, then select the cards with saved proposals to build the queue. Applying a form and approving Etsy Publish remain per-listing actions; an unverified write is never retried automatically. [Read the complete workflow.](./scripts/etsy-listing-analyzer/README.en.md#workflow)

| Analysis thresholds |
|---|
| ![Listing Analyzer analysis-threshold settings modal](./assets/screenshots/listing-analyzer-threshold-settings-modal.png) |

### Makaytron Etsy Keyword & Market Analyzer

| Ready panel | Research request |
|---|---|
| ![Keyword and Market Analyzer ready panel](./assets/screenshots/keyword-market-analyzer-ready-panel.png) | ![Keyword and Market Analyzer research-request panel](./assets/screenshots/keyword-market-analyzer-research-request-panel.png) |

| Result envelope |
|---|
| ![Keyword and Market Analyzer result-envelope panel](./assets/screenshots/keyword-market-analyzer-result-envelope-panel.png) |

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the script you need:
   - [Install Makaytron Etsy Sale Manager](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js)
   - [Install Makaytron Etsy Message Assistant](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js)
   - [Install Makaytron Etsy Ads Keyword Manager](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js)
   - [Install Makaytron Etsy Listing Analyzer](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js)
   - [Install Makaytron Etsy Keyword & Market Analyzer](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js)
3. Review the requested permissions and confirm installation in Tampermonkey.

## Separate usage guides

| Script | Step-by-step usage |
|---|---|
| Makaytron Etsy Sale Manager | [English](./scripts/etsy-sale-campaign-batch-runner/USAGE.en.md) · [Türkçe](./scripts/etsy-sale-campaign-batch-runner/USAGE.md) |
| Makaytron Etsy Message Assistant | [English](./scripts/etsy-message-assistant/USAGE.en.md) · [Türkçe](./scripts/etsy-message-assistant/USAGE.md) |
| Makaytron Etsy Ads Keyword Manager | [English](./scripts/etsy-ads-keyword-manager/USAGE.en.md) · [Türkçe](./scripts/etsy-ads-keyword-manager/USAGE.md) |
| Makaytron Etsy Listing Analyzer | [English](./scripts/etsy-listing-analyzer/USAGE.en.md) · [Türkçe](./scripts/etsy-listing-analyzer/USAGE.md) |
| Makaytron Etsy Keyword & Market Analyzer | [English](./scripts/etsy-keyword-market-analyzer/USAGE.en.md) · [Türkçe](./scripts/etsy-keyword-market-analyzer/USAGE.md) |

## Distribution and updates

GitHub is the canonical source. The five Greasy Fork listings use automatic synchronization from the exact public Raw paths; a release-only GitHub webhook also requests an immediate refresh when a GitHub Release is published. Greasy Fork receives no GitHub token or repository write permission. See [DISTRIBUTION.md](./DISTRIBUTION.md) for the channel map and security model.

## Safe use

- Start Etsy Sale Manager with the [one-day user-controlled dry-run checklist](./docs/campaign-dry-run-checklist.md), and use the [Listing Analyzer dry-run checklist](./docs/listing-analyzer-dry-run-checklist.en.md) before a listing write.
- In Etsy Sale Manager, **Start Series** authorizes live writes; the script then clicks each campaign's final Etsy submit button automatically.
- Read every generated message before sending it. Automatic sending is off by default.
- Ads Keyword Manager's **Disable/Enable matches on this page** actions change visible Etsy controls. **Disable matches on all pages** requires explicit confirmation; manually verify the result in Etsy Ads.
- Listing Analyzer Health Engine analysis is decision support based only on visible Etsy metrics and local history in the browser. Lifecycle, cohort, confidence, evidence, and experiment results do not claim causation or an Etsy-wide benchmark; listing improvements, deactivation, and other bulk writes must start only after explicit user selection and confirmation.
- Listing Analyzer `v1.0.5` has no AI network integration: it exports an anonymizable request JSON/prompt and imports validated proposal JSON. Every listing waits for user confirmation before Etsy Publish. For deactivation, the script only opens Etsy's options and focuses the relevant item; the user clicks Deactivate and Etsy's final confirmation. Delete is never automated.
- Keyword & Market Analyzer reads only rendered keyword, search, search-result, and trend data on the open Marketplace Insights page. After the user starts research, each seed keyword is sent to Etsy as the `query` in normal Marketplace Insights search navigation and may consume Etsy research quota/query cost. Its “opportunity” value is a Makaytron-derived signal, not an Etsy competition or sales guarantee. Research never changes a listing automatically.
- When both analyzers are installed, title, tags, an anonymous local reference, and a content hash travel in a versioned, expiring browser message. Expired, replayed, or stale results are rejected; Listing Analyzer derives its suggestion locally from the evidence and still requires user review.
- Do not put API keys, cookies, customer/order data, shop/listing identifiers, or advertising metrics in issues or screenshots.
- Automatic Turkish preview is enabled by default; opening a message page may send the latest customer message to Google Translate. Disable it from Makaytron settings in the Tampermonkey menu before visiting messages if you do not want that transfer.
- Message Assistant AI or translation features send relevant text to the third-party provider selected by the user.
- Privacy-preserving, pseudonymous usage telemetry is on by default with a visible first-use notice and a one-click Settings opt-out that requests server-side deletion. It records only limited daily open, successful-use, and categorized error signals—never raw errors, Etsy content, or account data.

Read [Privacy](./PRIVACY.en.md), [Security](./SECURITY.en.md), and [Support](./SUPPORT.en.md) before use.

## License

[MIT](./LICENSE)
