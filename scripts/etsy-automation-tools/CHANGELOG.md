# Changelog

Bu projedeki kayda değer tüm değişiklikler bu dosyada belgelenir.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) temel alınarak hazırlanır ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.

## [2.1.0] - 2026-11-22

### Added

- A new look for every screen, drawn from the Makaytron design canvas, the same in light and dark: the edge button and drawer, the workspace, settings, setup, the problem report and every tool page. Inter and JetBrains Mono are built into the script.
- Message Assistant: Conversations (the conversation list, the open conversation with its translation, and a reply draft you check, edit, copy or add to Etsy's message box), Quick replies (edit, variable check, preview in the buyer's language) and Autopilot and reviews (pause or continue the autopilot, review reply drafts). Nothing presses Etsy's Send.
- Listing Analyzer: Overview (health distribution, listings to look at first, scan progress), Listings (search, filter, selection, the review queue), AI suggestions (copy the request, paste and check the answer), Queue (open, apply, verify) and Thresholds.
- Settings: AI providers, notifications (panel and desktop, quiet hours), keyboard shortcuts, updates (version check, stable or beta channel, what is new) and help (guides, your reports and their GitHub state).
- Notifications in the workspace for finished jobs, steps that wait for you and new versions; desktop notifications only after you allow them.
- The Makaytron Pro page.
- A "What's new" window once after an update (it can be turned off), toasts for notifications that arrive while the page is open, and a loading skeleton while a tool starts.

### Changed

- Every language pack carries the new screens' texts; the setup's first screen is built in for every language.

### Fixed

- Settings tabs that hold several cards (tools, AI providers and others) were empty.
- Keyword & Market Analyzer listed a just-saved search twice.
- Saving the Ads word list from the workspace broke on a line break.

## [2.0.0] - 2026-11-20

### Added

- One script for all five Makaytron tools: Sale Manager, Message Assistant, Ads Keyword Manager, Listing Analyzer and Keyword & Market Analyzer. Each runs the standalone script's own engine, so their safety checks are unchanged.
- The edge button and drawer on Etsy seller pages, the full-window workspace, shared settings (theme, density, language, drawer position, tools, Makaytron Pro suggestions), backup download and restore, and deleting local data.
- First-run setup: language, then tools.
- New screens for every tool; Message Assistant and Listing Analyzer keep their own panel for detailed work.
- Languages: English built in; 42 more languages, Turkish included, as downloadable packs. The language screen and the problem report dialog are built in for every language.
- The transfer from the standalone scripts: encrypted on the page, with a check code on both sides; API keys never move.
- Report a problem: shows every field of the report, then opens a prefilled public GitHub issue. The script sends nothing itself.

### Security

- API keys and tokens are kept apart from the tools' data and never go into backups or the transfer.
- The standalone packages' usage metrics and update checks do not run inside this script; the tools make no request of their own beyond what each one needs (for example the Ads word list or a chosen language pack).
