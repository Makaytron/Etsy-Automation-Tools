# Makaytron Etsy Sale Manager

<p><a href="./README.md">Türkçe</a> · <strong>English</strong></p>

Version: `1.0.11`

**Usage guide:** [English](./USAGE.en.md) · [Türkçe](./USAGE.md)

Bulk Sales & Discounts Automation for Etsy Shop Manager. This fail-closed Tampermonkey tool schedules, verifies, and reports percentage-off Etsy sale campaigns in controlled batches.

The script is standalone and does not require another Etsy Automation Tools package.

## Install

1. Install Tampermonkey.
2. Open the [userscript file](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js).
3. Review permissions and confirm installation.

## Safety model

- The active sale step may wait up to 20 seconds, without editing or clicking, for an exact transient-only `Loading`, `Please wait`, `Saving`, `Submitting`, or `Processing` shell; ambiguous, persistent, filtered, mismatched, or incomplete evidence stops the flow.
- Shop/tab leases, reservation recovery, duplicate preflight checks, and strict result verification reduce repeated actions.
- After each creation, the durable verification queue is saved first; only the submitting tab may acknowledge the structural success action, at most once, and the next date cannot start until the old modal has actually disappeared.
- After all creation steps, the durable queue is batch-verified against **Details & Stats** evidence; Retry never resubmits a campaign during verification.
- Reports protect CSV/XML cells from spreadsheet formula injection.
- **Start Series** is the user's live-write authorization. After it is clicked, the script automatically advances through Etsy and clicks each campaign's final submit button; there is no separate per-campaign manual approval.
- Canonical GitHub installations check the public userscript version no more than once per 24 hours. Installations from another distributor leave updates to that platform.
- The install/update page opens only after a user action and only while no batch is active; Tampermonkey owns final approval.
- The Makaytron logo uses the userscript manager's cached `@resource`, with a canonical fallback.

Before a user-controlled first run, follow the [one-day live-verification checklist](../../docs/campaign-dry-run-checklist.md). Read [Security](../../SECURITY.en.md), [Privacy](../../PRIVACY.en.md), and [Support](../../SUPPORT.en.md).

## Pseudonymous usage telemetry

Telemetry is on by default with a visible first-use notice and a one-click Settings opt-out that requests deletion of this userscript's server-side record. Only daily open, successful-series completion, and categorized-error counters are sent. No raw error text, message, order, shop, listing or campaign content, identifier, or URL is sent. See [Privacy](../../PRIVACY.en.md).

## License

MIT
