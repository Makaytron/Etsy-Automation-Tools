# Makaytron Etsy Sale Manager usage guide

<p><a href="./USAGE.md">Türkçe</a> · <strong>English</strong></p>

This guide explains how to create a dated series of percentage-off campaigns in Etsy Shop Manager. Sale Manager works as a standalone userscript.

> **Live-action warning:** **Seriyi Başlat (Start Series)** authorizes the script to fill Etsy's sale flow and click each campaign's final submit action automatically. There is no second per-campaign approval prompt.

## Supported page

Open **Marketing → Sales and discounts** in Etsy Shop Manager:

`https://www.etsy.com/your/shops/me/sales-discounts`

The script also operates on Etsy's related **Run a sale**, review, and **Details & Stats** steps. If the panel is absent, open the supported route and refresh the page.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in a current Chrome, Edge, or Brave browser.
2. Open the [Sale Manager userscript](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js).
3. Review the permissions and select **Install** in Tampermonkey.
4. Refresh Etsy's **Sales and discounts** page.

## Configure the series

Open **Ayarlar (Settings)** and verify these fields:

| Setting | Meaning |
|---|---|
| **Başlangıç tarihi (Start date)** | The first campaign's start date. |
| **Son başlangıç tarihi (Last start date)** | The last start date included in the series. |
| **Promosyon süresi (Promotion duration)** | Length of each campaign, from 1 to 30 days. New starts use the same interval. |
| **İndirim yüzdesi (Discount percentage)** | Percentage off, from 1 to 90. A verified custom percentage field is used when Etsy has no matching preset. |
| **Promosyon kod prefix (Promotion-code prefix)** | Optional, up to 12 letters/digits. Codes use `YYMMDD + PREFIX + discount`. |
| **Everywhere (Region)** | The supported safe scope is **Everywhere**. |

Select **Kaydet (Save)**. For the first live run, use the same day for the first and last start dates so only one campaign is created.

## Run the live series

1. Check the shop, date range, code, and discount summary in the panel.
2. Close or resolve any unrelated Etsy modal, CAPTCHA, or unfinished sale form.
3. Select **Seriyi Başlat (Start Series)**.
4. The script checks the shop identity and duplicate code for each date.
5. It fills percentage off, dates, campaign name, and `Everywhere` in **Run a sale**.
6. It verifies **All listings**, then advances the **Continue**, review, and final-submit stages.
7. It verifies the Etsy server result in **Details & Stats** using code, percentage, dates, status, type, region, and scope evidence.
8. It moves to the next date only after a verified result.

While a batch is active, Settings, manual **Run Sale**, and update installation are disabled. Keep the owning tab open and do not start the same series in another tab.

## If the series pauses

The script stays on the current date and never blindly clicks the final action twice.

| Control | Use it when… |
|---|---|
| **Yeniden Dene / Devam Et (Retry / Continue)** | You inspected Etsy and removed the blocker, and want to resume from the fenced step. |
| **Bu Günü Atla (Skip This Day)** | You intentionally want no campaign for the current date. |
| **Durdur (Stop)** | You want to end the entire series. |

CAPTCHA, rate limiting, a foreign modal, shop mismatch, duplicate code, ambiguous submission, or unverifiable server evidence is never skipped automatically. If Etsy may already have accepted a submission, search for that campaign before retrying the same date.

## Report and final verification

1. Open **Rapor (Report)**.
2. Review successful, failed, and skipped rows with their code, date, and verification status.
3. Download CSV or Excel-compatible XML when needed.
4. Manually verify the code, percentage, dates, and `All listings` scope in Etsy **Details & Stats**.

## Keyboard shortcuts

- `Alt + Shift + E`: Settings
- `Alt + Shift + R`: Report
- `Alt + Shift + U`: Update check

There is no start-series shortcut. Live authority is granted only through **Seriyi Başlat (Start Series)** in the panel.

## Safety and data boundaries

- Only percentage off, `Everywhere`, and `All listings` are supported.
- Shop/tab ownership and one-submit reservation prevent duplicate execution.
- Raw campaign content, shop identity, and Etsy session data are excluded from telemetry.
- Limited pseudonymous usage telemetry is enabled by default with a visible first-use notice. Turning it off in Settings requests deletion of this userscript's server-side record; see [Privacy](../../PRIVACY.en.md).
- Complete the [one-day live-verification checklist](../../docs/campaign-dry-run-checklist.md) before the first live batch. It submits a real campaign; it is not a simulation.

[Package README](./README.en.md) · [Changelog](./CHANGELOG.md) · [Support](../../SUPPORT.en.md) · [Security](../../SECURITY.en.md)
