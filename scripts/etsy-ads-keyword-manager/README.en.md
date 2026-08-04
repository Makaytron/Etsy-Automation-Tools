# Makaytron Etsy Ads Keyword Manager

<p><a href="./README.md">Türkçe</a> · <strong>English</strong></p>

Version: `1.0.2`

A Tampermonkey control panel for finding, highlighting, and user-authorized enabling or disabling of Etsy Ads keyword rows.

The script is standalone and does not require another Etsy Automation Tools package.

> This tool is not developed, supported, or endorsed by Etsy.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in a current Chrome, Edge, Brave, or Firefox browser.
2. Open the [canonical userscript](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js).
3. Review its permissions and confirm installation.
4. Open an advertised listing's keyword page in Etsy Shop Manager and reload it.

Disable or remove any legacy **Etsy Ad Wordlist** or local `2.x` test build first so two scripts do not control the same page. The canonical Makaytron namespace creates a new userscript identity, so custom filters from the legacy script are not migrated automatically; add any required custom filters again through the new form.

## Features

- A collapsible Makaytron-themed Etsy Ads panel.
- Persistent Turkish and English interfaces.
- A form for adding, editing, searching, and removing filters without exposing storage syntax.
- Current-page row, match, and high click-to-order ratio summaries.
- User-triggered enabling or disabling of matching keywords on the current page.
- Explicit confirmation before disabling matches across every page.
- Confirmed updates from the canonical GitHub rule list, with the previous local list backed up first.
- A manual script-version check from the panel or Tampermonkey menu, plus an automatic check capped at once per 24 hours.

## Matching choices

| Choice | Example | Result |
|---|---|---|
| **Contains entered text (recommended)** | `bts` | Finds `bts shirt` and `cute bts gift`. |
| **Exact same wording only** | `bts shirt` | Finds only the identical keyword. |
| **Custom search rule (advanced)** | `bts|army` | Applies a custom pattern for advanced users. |

The form serializes rules in the legacy line format so existing matching behavior remains compatible.

## Safety model

- **Disable/Enable matches on this page** clicks only matching Etsy controls on the visible page.
- **Disable matches on all pages** and `Ctrl + Alt + K` require confirmation before sequential pagination begins.
- `Ctrl + Space` disables matching keywords only on the current page after confirmation.
- Merely loading the script does not change any keyword state.
- Manually verify the final state in Etsy Ads because Etsy's interface can change over time.

## Rule-list update and local data

The embedded first-run list is identical to the [canonical package rules](./keyword-rules.txt). **Update list** reads the latest version from `raw.githubusercontent.com` after confirmation. The current list is stored under `adWordlistBackup` before replacement. Decline the confirmation if you do not want to replace custom rules. Use **Makaytron · Restore backed-up keyword list** from the Tampermonkey menu to restore the latest backup. List update, restore, and live keyword actions are blocked while the list form is open.

## Script version checks

When installed from the canonical GitHub file, the script checks version metadata at most once per 24 hours after the panel loads. Click the `v1.0.2` badge or use **Makaytron · Check script version** in the Tampermonkey menu for a manual check. The check reads only the remote `.user.js` `@version` value and never executes remote code. A network failure does not block the keyword tool.

If a newer version exists, the panel shows **Open install page**. No tab opens until the user clicks that button and accepts the explicit confirmation; Tampermonkey still owns the final installation approval. There is no silent installation. Version checks and install-page opening fail closed while a live keyword operation, rule-list update, or list editor is active. If the script was installed from another source such as Greasy Fork, or its source cannot be verified as GitHub, the private GitHub check is not forced; a verified external installation source remains responsible for updates.

Rules, language, panel preferences, and the last version-check time remain in Tampermonkey local storage. The visible panel logo is embedded in the userscript. Keywords, Ads metrics, and rule content are never included in telemetry.

## Pseudonymous usage telemetry

Telemetry is on by default with a visible first-use notice and a one-click Settings opt-out that requests deletion of this userscript's server-side record. Only daily open, successful keyword-change, and categorized-error counters are sent. Raw error text, keywords, Ads metrics, rule content, Etsy identifiers, and URLs are excluded. See [Privacy](../../PRIVACY.en.md).

Read the repository [Privacy](../../PRIVACY.en.md), [Security](../../SECURITY.en.md), and [Support](../../SUPPORT.en.md). Do not include shop, listing, advertising metric, cookie, or session data in reports.

License: [MIT](../../LICENSE)
