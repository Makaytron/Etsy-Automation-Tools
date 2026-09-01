# Distribution and update policy

Suite version: `1.1.0`

GitHub repository: <https://github.com/Makaytron/Etsy-Automation-Tools>

GitHub is the only source of truth. Every hosted copy must be derived from the exact public file under `main` or from the matching signed release tag. The legacy `https://github.com/Makaytron/EtsyScript` namespace is retained only as an installed-userscript identity; it is not a network endpoint.

## Active channels

| Channel | Role | Update mechanism | Hosted validation |
|---|---|---|---|
| GitHub | Canonical source and signed releases | Maintainer-reviewed version change and release | Hard gate: verified tag/commit, complete assets, checksums, and local source parity |
| [Greasy Fork](https://greasyfork.org/en/users/1630152-makaytron) | Primary userscript host | Automatic sync from exact nested Raw `main` URLs, plus an immediate refresh request from a GitHub webhook subscribed only to `release` | Hard gate: all five versions and normalized source parity |
| [Userscript.Zone](https://www.userscript.zone/) | Search index | Crawler discovers public GitHub and Greasy Fork listings; there is no upload account or webhook | Advisory warning because crawl timing is outside maintainer control |
| [SourceForge](https://sourceforge.net/projects/etsy-automation-tools/) | Active GitHub Release mirror | Official release-only integration mirrors public GitHub Release files; never a userscript update endpoint | Hard gate: all release assets, byte sizes, MD5 inventory parity, and suite default-download parity |

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
2. For Message Assistant changes, let its read-only CI workflow complete. Then run `powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1 -Online` for local version, syntax, updater behavior, secret-pattern, and URL-reachability checks; review `git diff --check` as well. Message Assistant CI packages a release candidate for manual or standalone-tag runs but never creates a tag or publishes a release.
3. Create a signed commit and a scope-matching signed tag from the reviewed commit: `vX.Y.Z` for a suite release or `<package-slug>-vX.Y.Z` for one standalone package.
4. After pushing canonical `main`, run `powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1 -Online -RemoteParity` to prove that every public Raw file is byte-equivalent to its local source.
5. Publish the complete GitHub Release once. The release-only webhook requests an immediate Greasy Fork refresh from the configured exact Raw `main` paths; Greasy Fork's own automatic synchronization may also poll those paths.
6. Run `powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1 -HostedChannels` for a suite release, or add `-PackageSlug <package-slug>` for a standalone package release. If an explicitly approved standalone release is also GitHub `Latest`, add `-StandaloneLatest`. This read-only command includes the online and Raw-parity checks, hard-fails incomplete GitHub, Greasy Fork, or SourceForge publication, requires the suite release to remain GitHub `Latest`, verifies the SourceForge suite default download, and reports Userscript.Zone crawler lag as a warning.
7. For a suite release, explicitly mark the suite bundle as SourceForge's default download for every platform if the mirror's automatic selection chooses a generated source archive or a standalone package. A standalone package release leaves the suite GitHub `Latest` selection unchanged by default; promote it only after an explicit release decision and validate that state with `-StandaloneLatest`. If synchronization or default-download cache propagation is still incomplete, wait and rerun the validator instead of duplicating the release.

## Hosted validation semantics

`-HostedChannels` never publishes, edits, retries, or authenticates to a distribution service. It validates the public release artifacts and signatures, the five Greasy Fork copies after excluding only host-managed `@updateURL` and `@downloadURL` lines, SourceForge's RSS file inventory, and SourceForge's public `latest/download` redirect for Windows, macOS, Linux, and generic clients. With `-PackageSlug`, GitHub Release and SourceForge asset checks are scoped to that standalone package while Raw parity and all Greasy Fork listings remain comprehensive. `-StandaloneLatest` changes only the expected GitHub `Latest` tag from the suite release to the selected standalone release; it performs no write. Userscript.Zone is passive and therefore advisory. The two official OpenUserJS blocker issues are also checked as an advisory signal so that the inactive-channel decision can be revisited after an upstream fix.

## Security invariants

- Greasy Fork has no GitHub OAuth grant, PAT, deploy key, GitHub App, or repository write permission.
- The webhook secret exists only in Greasy Fork and GitHub repository settings. It is never stored in Git, Actions, artifacts, logs, or documentation.
- GitHub sends only public release-event metadata to the HTTPS webhook endpoint. SSL verification stays enabled.
- GitHub Actions has read-only repository permission and runs local tests, fixture smoke validation, distribution checks, and deterministic release-candidate packaging. It never synchronizes a host, creates a tag, or publishes a release.
- SourceForge integration is active, release-only, and limited to public GitHub Release data; it has no PAT, deploy key, GitHub App, or repository write permission.
- No automatic promotional posting is performed to Product Hunt, DEV, Hacker News, AlternativeTo, Chocolatey, or WinGet catalogs.
