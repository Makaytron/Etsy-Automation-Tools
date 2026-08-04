# Changelog

Bu projedeki kayda değer tüm değişiklikler bu dosyada belgelenir.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) temel alınarak
hazırlanır ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.

## [1.0.2] - 2026-08-04

### Changed

- Finalized the public distribution release after the immutable tag-only `v1.0.1` checkpoint.
- Corrected Greasy Fork documentation to describe automatic Raw `main` synchronization plus the release-only immediate-refresh webhook.
- Added post-push Raw source-parity validation; no Etsy message, translation, reply, storage, or provider behavior changed.

## [1.0.1] - 2026-08-04

### Security

- Canonical repository, Raw update, support, release, logo, and privacy URLs were verified against `Makaytron/Etsy-Automation-Tools`.
- Greasy Fork distribution follows the exact public Raw source with automatic synchronization and a release-only immediate-refresh webhook.
- Verified and retained the existing `@antifeature tracking` disclosure for the documented privacy-preserving telemetry.
- Güncelleme indirme adresi tam HTTPS origin ve userscript yolu eşitliğiyle sınırlandırıldı; benzer host/yol önekleri, credentials, query ve bozuk adresler canonical adrese düşürülür.
- Aktif veya bilinmeyen durumdaki mesaj kampanyası sürerken Tampermonkey güncelleme ekranının açılması fail-closed engellendi.
- GitHub dışındaki kurulum kaynaklarında özel GitHub update akışı zorlanmaz; dağıtım platformunun mekanizması korunur.

### Changed

- Otomatik kontrolün alt sınırı 24 saate çıkarıldı; eski 1–23 saat ayarları yükleme ve kaydetme sırasında güvenli biçimde 24 saate taşınır.
- Localized ad/açıklama, ortak yazar ve `@license MIT` metadata sözleşmesi tamamlandı; legacy namespace kurulu script kimliğini korumak için değişmedi.

## [1.0.0] - 2026-08-01

### Added

- Makaytron Etsy Message Assistant, `Makaytron/EtsyScript` monoreposuna taşındı.
- OpenAI, Anthropic, Gemini, DeepSeek ve OpenRouter için kullanıcıya ait API profilleri eklendi.
- Config içe/dışa aktarma ve güncellemede ayar koruma eklendi.
- Tampermonkey metadata ve uygulama içi GitHub güncelleme uyarısı eklendi.
- Monorepo içindeki userscript dosyasından doğrudan sürüm denetimi eklendi.
- Panel ve Tampermonkey listesi için resmî Makaytron logosu kullanıldı.
- Mesajlar, teslim edilen siparişler, yorumlar, şablonlar, geçmiş ve ayarlar ekranları bir araya getirildi.
