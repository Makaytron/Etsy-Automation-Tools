# Distribution and update policy

Suite version: `1.0.3`

GitHub repository: <https://github.com/Makaytron/Etsy-Automation-Tools>

GitHub is the only source of truth. Every hosted copy must be derived from the exact public file under `main` or from the matching signed release tag. The legacy `https://github.com/Makaytron/EtsyScript` namespace is retained only as an installed-userscript identity; it is not a network endpoint.

## Active channels

| Channel | Role | Update mechanism |
|---|---|---|
| GitHub | Canonical source and signed releases | Maintainer-reviewed version change and release |
| [Greasy Fork](https://greasyfork.org/en/users/1630152-makaytron) | Primary userscript host | Automatic sync from exact nested Raw `main` URLs, plus an immediate refresh request from a GitHub webhook subscribed only to `release` |
| [Userscript.Zone](https://www.userscript.zone/) | Search index | Crawler discovers public GitHub and Greasy Fork listings; there is no upload account or webhook |
| [SourceForge](https://sourceforge.net/projects/etsy-automation-tools/) | Active GitHub Release mirror | Official release-only integration mirrors public GitHub Release files; never a userscript update endpoint |

Chocolatey and WinGet/WingetUI are not distribution targets for `.user.js` files. They require Windows installer/package formats and must not receive a fake wrapper package.

OpenUserJS is not an active distribution target. Its production publisher currently rejects documented modern `GM.*` grants, and its GitHub importer returns `503`; both failures were reported to the official project in [issue #2102](https://github.com/OpenUserJS/OpenUserJS.org/issues/2102) and [issue #1705](https://github.com/OpenUserJS/OpenUserJS.org/issues/1705#issuecomment-5179490002). Do not create a host-specific modified script, share a PAT, or grant repository write access to work around those failures. Reconsider the channel only after an official fix is verified.

## Greasy Fork listings

- [Makaytron Etsy Sale Manager](https://greasyfork.org/en/scripts/589843-makaytron-etsy-sale-manager)
- [Makaytron Etsy Message Assistant](https://greasyfork.org/en/scripts/589844-makaytron-etsy-message-assistant)
- [Makaytron Etsy Ads Keyword Manager](https://greasyfork.org/en/scripts/589845-makaytron-etsy-ads-keyword-manager)
- [Makaytron Etsy Listing Analyzer](https://greasyfork.org/en/scripts/589846-makaytron-etsy-listing-analyzer)
- [Makaytron Etsy Keyword & Market Analyzer](https://greasyfork.org/en/scripts/589847-makaytron-etsy-keyword-market-analyzer)

## Release flow

1. Version each standalone package independently. For a changed script, update only its metadata/runtime marker, package README files, latest changelog heading, and root README row. Change the suite `VERSION` and bundle release note only for an actual suite release.
2. Run `powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1 -Online` for local version, syntax, updater behavior, secret-pattern, and URL-reachability checks; then review `git diff --check`.
3. Create a signed commit and a scope-matching signed tag from the reviewed commit: `vX.Y.Z` for a suite release or `<package-slug>-vX.Y.Z` for one standalone package.
4. After pushing canonical `main`, run `powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1 -Online -RemoteParity` to prove that every public Raw file is byte-equivalent to its local source.
5. Publish the complete GitHub Release once. The release-only webhook requests an immediate Greasy Fork refresh from the configured exact Raw `main` paths; Greasy Fork's own automatic synchronization may also poll those paths.
6. Verify the affected Greasy Fork listing shows its new package version, confirm unchanged listings kept their versions, and then confirm downstream indexing/mirroring.

## Security invariants

- Greasy Fork has no GitHub OAuth grant, PAT, deploy key, GitHub App, or repository write permission.
- The webhook secret exists only in Greasy Fork and GitHub repository settings. It is never stored in Git, Actions, artifacts, logs, or documentation.
- GitHub sends only public release-event metadata to the HTTPS webhook endpoint. SSL verification stays enabled.
- GitHub Actions is not required for synchronization and remains disabled unless a separately reviewed release workflow is introduced.
- SourceForge integration is active, release-only, and limited to public GitHub Release data; it has no PAT, deploy key, GitHub App, or repository write permission.
- No automatic promotional posting is performed to Product Hunt, DEV, Hacker News, AlternativeTo, Chocolatey, or WinGet catalogs.
