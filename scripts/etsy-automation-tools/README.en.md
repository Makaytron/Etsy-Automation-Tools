<p><a href="./README.md">Türkçe</a> · <strong>English</strong></p>

# Makaytron Etsy Automation Tools

Version: `2.1.0` · [Changelog](./CHANGELOG.md) · [Repository](../../README.md)

Five Makaytron tools for Etsy sellers in one script: Sale Manager, Message Assistant, Ads Keyword Manager, Listing Analyzer and Keyword & Market Analyzer. The Makaytron button on the edge of the Etsy page opens a drawer with the tool that works on that page and shortcuts to the others. The workspace opens full-window for the details.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Open [Makaytron-Etsy-Automation-Tools.user.js](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-automation-tools/Makaytron-Etsy-Automation-Tools.user.js) and press **Install**.
3. On the first Etsy seller page, choose your language and the tools you want.

Updates come through Tampermonkey from this file.

## Tools and their pages

| Tool | Page | What it does |
|---|---|---|
| Sale Manager | Sales & Discounts | Creates campaigns one after another, checks each one in the Etsy list and stops at a step it cannot verify. |
| Message Assistant | Messages, Sold orders, shop dashboard | Translates messages and prepares replies with your own AI provider and API key. Detailed work opens in its own panel. |
| Ads Keyword Manager | An Etsy Ads listing page | Turns off or on the ad keywords that match your word list. |
| Listing Analyzer | Listings and the listing editor | Tracks your listings over time and prepares changes you approve one by one. Detailed work opens in its own panel. |
| Keyword & Market Analyzer | Marketplace Insights | Reads keywords, scores them and keeps your research. |

Each tool works only on its own page and can be turned off in Settings.

## Languages

Only English is built in in full. 42 more languages, Turkish included, are downloaded once from this repository's `languages/` folder when chosen, validated and kept. The first screen (language choice) and the problem report dialog are built in for every language, so the first start opens in the browser's language.

## Moving from the standalone scripts

If you use the standalone Makaytron scripts, you can bring your data over:

1. Open the standalone script's Etsy page and press **Aktar** (Transfer) in its notice.
2. Within two minutes, on the same tab, press **Settings › Privacy and data › Start the transfer** in Etsy Automation Tools.
3. Both sides should show the same 4-digit check code.

API keys do not move; enter them again here. The standalone scripts keep working for six months, then get no more updates.

## Privacy

Settings, reports and tool data stay in this browser. API keys never go into backups or the transfer. Details: [PRIVACY.en.md](../../PRIVACY.en.md).

Report a problem: the workspace's **Report a problem** dialog opens a public [GitHub Issues](https://github.com/Makaytron/Etsy-Automation-Tools/issues) entry with the report filled in (version, browser, operating system, language, country, page type and your note). The script sends nothing itself; you check the report on GitHub and submit it.
