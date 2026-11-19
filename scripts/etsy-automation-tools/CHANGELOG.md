# Changelog

Bu projedeki kayda değer tüm değişiklikler bu dosyada belgelenir.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) temel alınarak hazırlanır ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.

## [2.0.0] - Unreleased

### Added

- One script for all five Makaytron tools: Sale Manager, Message Assistant, Ads Keyword Manager, Listing Analyzer and Keyword & Market Analyzer. Each runs the standalone script's own engine, so their safety checks are unchanged.
- The edge button and drawer on Etsy seller pages, the full-window workspace, shared settings (theme, density, language, drawer position, tools, Makaytron Pro suggestions), backup download and restore, and deleting local data.
- First-run setup: language, then tools.
- New screens for every tool; Message Assistant and Listing Analyzer keep their own panel for detailed work.
- Languages: English built in; 42 more languages, Turkish included, as downloadable packs. The language screen and the problem report dialog are built in for every language.
- The transfer from the standalone scripts: encrypted on the page, with a check code on both sides; API keys never move.

### Security

- API keys and tokens are kept apart from the tools' data and never go into backups or the transfer.
- The standalone packages' usage metrics and update checks do not run inside this script; the tools make no request of their own beyond what each one needs (for example the Ads word list or a chosen language pack).
