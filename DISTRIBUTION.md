# Distribution and update policy

Version: `1.0.1`

GitHub repository: <https://github.com/Makaytron/Etsy-Automation-Tools>

GitHub is the only source of truth. Every hosted copy must be derived from the exact public file under `main` or from the matching signed release tag. The legacy `https://github.com/Makaytron/EtsyScript` namespace is retained only as an installed-userscript identity; it is not a network endpoint.

## Active channels

| Channel | Role | Update mechanism |
|---|---|---|
| GitHub | Canonical source and signed releases | Maintainer-reviewed version change and release |
| [Greasy Fork](https://greasyfork.org/en/users/1630152-makaytron) | Primary userscript host | Exact nested Raw URL sync plus a GitHub webhook subscribed only to `release` |
| [Userscript.Zone](https://www.userscript.zone/) | Search index | Crawler discovers public GitHub and Greasy Fork listings; there is no upload account or webhook |
| SourceForge | Optional GitHub Release mirror | Native read-only GitHub Release importer; never a userscript update endpoint |
| OpenUserJS | Manual secondary host | Automatic webhook sync is disabled while its official importer remains tied to the `master` branch; this repository uses `main` |

Chocolatey and WinGet/WingetUI are not distribution targets for `.user.js` files. They require Windows installer/package formats and must not receive a fake wrapper package.

## Greasy Fork listings

- [Makaytron Etsy Sale Manager](https://greasyfork.org/en/scripts/589843-makaytron-etsy-sale-manager)
- [Makaytron Etsy Message Assistant](https://greasyfork.org/en/scripts/589844-makaytron-etsy-message-assistant)
- [Makaytron Etsy Ads Keyword Manager](https://greasyfork.org/en/scripts/589845-makaytron-etsy-ads-keyword-manager)
- [Makaytron Etsy Listing Analyzer](https://greasyfork.org/en/scripts/589846-makaytron-etsy-listing-analyzer)
- [Makaytron Etsy Keyword & Market Analyzer](https://greasyfork.org/en/scripts/589847-makaytron-etsy-keyword-market-analyzer)

## Release flow

1. Change `VERSION`, all five metadata/runtime version markers, README version labels, and changelogs together.
2. Run `powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1 -Online` and review `git diff --check`.
3. Create a signed commit and signed `vX.Y.Z` tag from the reviewed commit.
4. Publish the complete GitHub Release once. The release-only webhook asks Greasy Fork to fetch each exact nested path from the release tag.
5. Verify every Greasy Fork listing shows the same version and confirm downstream indexing/mirroring.

## Security invariants

- Greasy Fork has no GitHub OAuth grant, PAT, deploy key, GitHub App, or repository write permission.
- The webhook secret exists only in Greasy Fork and GitHub repository settings. It is never stored in Git, Actions, artifacts, logs, or documentation.
- GitHub sends only public release-event metadata to the HTTPS webhook endpoint. SSL verification stays enabled.
- GitHub Actions is not required for synchronization and remains disabled unless a separately reviewed release workflow is introduced.
- SourceForge integration, when enabled, is read-only and limited to public GitHub Release data.
- No automatic promotional posting is performed to Product Hunt, DEV, Hacker News, AlternativeTo, Chocolatey, or WinGet catalogs.
