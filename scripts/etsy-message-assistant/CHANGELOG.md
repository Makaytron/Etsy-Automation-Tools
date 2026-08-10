# Changelog

Bu projedeki kayda değer tüm değişiklikler bu dosyada belgelenir.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) temel alınarak
hazırlanır ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.

## [1.0.4] - 2026-08-10

### Added

- Added an English-language, pressure-free honest-review request preset for delivered orders, using a new/small-business voice without rating requests or incentives.
- Added dedicated Message Assistant behavior tests for preset safety, rendering, migration, persistence, AI instructions, guided sending, recovery, and cross-tab safety.
- Added a persistent per-order review eligibility decision: unchecked, confirmed no review, review exists, deferred, or blocked because contact is unwanted/an order issue remains.
- Added a purpose-based `review_request` outreach ledger with template/message hashes and queued, prepared, pending-verification, and verified-sent states.
- Added a user-triggered **Gönder ve Sonrakine Geç** action that reuses the coordinated send-attempt and outgoing-bubble verification path.

### Changed

- Made the review-request preset the default delivered-order template while retaining the original delivery-check template.
- Migrated existing saved template collections idempotently so the new preset appears without overwriting custom edits or archive state.
- Specialized the AI campaign instruction so only the dedicated preset may request an honest review; other delivery templates continue to prohibit review requests.
- Added an in-panel warning and replaced unrestricted bulk Select All with **Onaylıları Seç** because Etsy order cards cannot be reliably joined to dashboard review cards; recipients must be verified individually.
- Review-request confirmations now expire after two hours and fail closed until reconfirmed.
- Review requests always remain user-triggered even when the global automatic-send setting is enabled.
- The next conversation opens only after the current outgoing message is verified; an uncertain result remains blocked for manual reconciliation.
- Bumped the operational status envelope to schema 2 and the configuration schema to 5. Exact legacy review-send evidence is backfilled as sent; an older generic sent record with unknown purpose remains blocked until the seller explicitly confirms it was not a review request.
- Bound the final user-triggered send to the originally claimed conversation, current template tuple, enabled Etsy Send control, and user-edited composer hash immediately before dispatch.
- Suppressed a concurrent native Etsy Send click while the guided action is claiming the draft, while allowing the single programmatic click initiated by that explicit panel action.
- Made campaign queue binding and order/review-outreach send transitions atomic within the shared status envelope, and made cancel/skip restore the exact prior non-review order state before terminalizing the campaign.
- Made early claim release and `Not Sent` recovery resumable without overwriting newer cross-tab eligibility or terminal send decisions.
- Documented that the userscript is unofficial and that manual sending does not replace any written authorization required by Etsy's API Terms for browser-extension access.

## [1.0.3] - 2026-08-04

### Changed

- Synchronized the standalone package version with the reviewed analyzer updater release; no Etsy message, translation, reply, storage, or provider behavior changed.

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
