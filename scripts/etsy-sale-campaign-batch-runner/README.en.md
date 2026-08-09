# Makaytron Etsy Sale Manager

<p><a href="./README.md">Türkçe</a> · <strong>English</strong></p>

Version: `1.0.5`

Bulk Sales & Discounts Automation for Etsy Shop Manager. This fail-closed Tampermonkey tool schedules, verifies, and reports percentage-off Etsy sale campaigns in controlled batches.

The script is standalone and does not require another Etsy Automation Tools package.

## Install

1. Install Tampermonkey.
2. Open the [userscript file](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js).
3. Review permissions and confirm installation.

## Safety model

- Ambiguous, loading, filtered, mismatched, or incomplete Etsy evidence stops the flow.
- Shop/tab leases, reservation recovery, duplicate preflight checks, and strict result verification reduce repeated actions.
- Reports protect CSV/XML cells from spreadsheet formula injection.
- **Start Series** is the user's live-write authorization. After it is clicked, the script automatically advances through Etsy and clicks each campaign's final submit button; there is no separate per-campaign manual approval.
- Canonical GitHub installations check the public userscript version no more than once per 24 hours. Installations from another distributor leave updates to that platform.
- The install/update page opens only after a user action and only while no batch is active; Tampermonkey owns final approval.
- The Makaytron logo uses the userscript manager's cached `@resource`, with a canonical fallback.

Before a user-controlled first run, follow the [one-day dry-run checklist](../../docs/campaign-dry-run-checklist.md). Read [Security](../../SECURITY.en.md), [Privacy](../../PRIVACY.en.md), and [Support](../../SUPPORT.en.md).

## Pseudonymous usage telemetry

Telemetry is on by default with a visible first-use notice and a one-click Settings opt-out that requests deletion of this userscript's server-side record. Only daily open, successful-series completion, and categorized-error counters are sent. No raw error text, message, order, shop, listing or campaign content, identifier, or URL is sent. See [Privacy](../../PRIVACY.en.md).

## License

MIT
