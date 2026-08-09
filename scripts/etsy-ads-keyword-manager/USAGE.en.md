# Makaytron Etsy Ads Keyword Manager usage guide

<p><a href="./USAGE.md">Türkçe</a> · <strong>English</strong></p>

Ads Keyword Manager finds and highlights keyword rows for one Etsy Ads listing, then enables or disables matching rows only after a user action. It is standalone and requires no API key.

## Supported page

Open the keyword page for an advertised Etsy listing:

`https://www.etsy.com/your/shops/me/advertising/listings/<listing>`

The keyword table and rows must be fully loaded. If readable keyword rows are unavailable, the script fails closed and performs no action.

## Install and remove legacy copies

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Ads Keyword Manager userscript](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js) and approve installation.
3. Disable any old **Etsy Ad Wordlist** or local `2.x` test copy so two scripts do not run on the same page.
4. Refresh the Etsy Ads keyword page.

Legacy custom rules are not migrated automatically; recreate the rules you still need in the new panel.

## Create keyword rules

Open **Edit keyword list** and choose a match type for each rule:

| Type | Behavior | Example |
|---|---|---|
| **Contains entered text** | Finds the text anywhere in the keyword; recommended default. | `bts` → `bts shirt`, `cute bts gift` |
| **Exact same wording** | Matches only the complete keyword. | `bts shirt` |
| **Custom search rule** | Applies an advanced custom pattern. | `bts|army` |

Save the rules. Match counts and high click/order-ratio highlighting are visual analysis only and do not change Etsy by themselves.

## Process the open page only

1. Review the match count and highlighted rows.
2. Select **Disable matches on this page** or **Enable matches on this page**.
3. That button click directly authorizes changing the visible matching Etsy checkboxes; there is no second confirmation modal.
4. Verify the resulting checkbox states in Etsy.

`Ctrl + Space` disables current-page matches after an explicit confirmation.

## Disable matches across pages

> **Important:** Move Etsy's keyword pagination to **page 1 first**. The multi-page job starts on the open page and moves only through **Next**; it never returns to earlier pages.

1. Review the match summary on page 1.
2. Select **Disable matches on all pages** or press `Ctrl + Alt + K`.
3. Read and approve the scope confirmation.
4. The script processes pages sequentially and stops at the 100-page safety limit.
5. Manually inspect several pages in Etsy after completion.

There is no all-page enable action; the multi-page workflow only disables matches.

## Action and approval boundaries

| Action | Etsy effect | Approval |
|---|---|---|
| Load page, highlight matches/ratios | None | None |
| Panel current-page enable/disable | Changes visible matching keyword checkboxes | The button click is authority |
| `Ctrl + Space` | Disables current-page matches | Explicit confirmation |
| All-page disable / `Ctrl + Alt + K` | Disables matches from the open page through the last page | Explicit confirmation |
| Edit keyword list | Changes local rules only | Save |
| **Update list** | Replaces the local list with the canonical file | Confirmation + automatic local backup |
| Restore backup | Restores the last local list | Confirmation |

The script never changes an Ads keyword automatically on page load.

## Update or restore the rule list

1. Save or separately note any custom rules.
2. Use **Update list** only when you want the canonical [keyword-rules.txt](./keyword-rules.txt).
3. On approval, the current list is first stored under the local `adWordlistBackup` key and then replaced.
4. Use **Makaytron · Restore backed-up keyword list** in the Tampermonkey menu when needed.

Live keyword actions, update, and restore are blocked while the rule editor is open.

## Keyboard and menu controls

- `Ctrl + Alt + K`: Confirmed multi-page disable
- `Ctrl + Space`: Confirmed current-page disable
- `Ctrl/Cmd + S` in the rule editor: Save
- `Escape` in the modal: Close; unsaved changes trigger a leave confirmation

Panel visibility, list edit/update/restore, current-page enable/disable, and version check are also available in the Tampermonkey menu.

## Troubleshooting

- If the match count is zero, verify that you opened an advertised listing's keyword page and that its rows finished loading.
- If earlier pages were skipped, return to page 1 and restart the multi-page action.
- If Etsy's DOM or checkbox state is ambiguous, the script stops fail-closed. Refresh and verify the result manually.
- Limited pseudonymous usage telemetry is enabled by default with a visible first-use notice. Turning it off in Settings requests deletion of this userscript's server-side record; see [Privacy](../../PRIVACY.en.md).
- Never include keywords, Ads metrics, shop/listing identity, cookies, or session data in an issue or screenshot.

[Package README](./README.en.md) · [Changelog](./CHANGELOG.md) · [Privacy](../../PRIVACY.en.md) · [Support](../../SUPPORT.en.md)
