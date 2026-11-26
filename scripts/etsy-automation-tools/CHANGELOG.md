# Changelog

Bu projedeki kayda değer tüm değişiklikler bu dosyada belgelenir.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) temel alınarak hazırlanır ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.

## [2.1.3] - 2026-11-26

### Fixed

- Listing Analyzer: when the review queue could not be built (for example a plan saved before the latest scan), the workspace switched to an empty queue tab without saying why. It now stays on the listings tab and shows the reason; the queue tab shows it too.
- Listing Analyzer: a stopped queue no longer looks active in the workspace. Its remaining items are marked stopped and the stop and open-next buttons are gone.
- The edge button on the right edge no longer sits under the page's scroll bar.

## [2.1.2] - 2026-11-26

### Fixed

- Sale Manager (engine 1.1.2): the plan no longer lists days that have already passed as planned campaigns, and a series no longer starts from a past date. The date fields start at today.
- Listing Analyzer: queue items now show the listing photo, like the overview and the listing table.
- On the left edge, the closed edge button now leaves only a small handle and comes out on hover or keyboard focus, so it no longer covers Etsy's own left-side icons.

## [2.1.1] - 2026-11-21

### Fixed

Found in a live test on a real shop.

- The edge button could not be dragged when it was grabbed by its logo: the browser started dragging the image instead.
- Ads Keyword Manager: with a long word list the "Add a new word" form was squeezed to nothing. Cards on every workspace page now keep their height next to a long table.
- Listing Analyzer: listing photos now show in the overview, the listing table and the queue (only from Etsy's own image host).
- Message Assistant: "Show in …" in the drawer now shows the translation right there instead of only in the workspace.
- Message Assistant (engine 1.3.1): Etsy's "Drafted for you › Delivery issues" folder no longer appears as a conversation, and quick replies and drafts use the listing's real title: not a link the buyer pasted, and without the prices shown next to it.

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
