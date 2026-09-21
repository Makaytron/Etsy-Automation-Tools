# Changelog

Bu projedeki kayda değer tüm değişiklikler bu dosyada belgelenir.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) temel alınarak hazırlanır ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.

## [1.0.5] - 2026-09-02

### Changed

- Ads paneli, `Tamplate-Back-White-01`, uygulanmış ShadcnStore dashboard ve kayıtlı `Application Interface 2` / `Data Table 2` kaynakları kullanılarak gerçek production DOM üzerinde responsive bir komut merkezine dönüştürüldü.
- Mevcut sayfa, bütün sayfalar ve kelime listesi işlemleri ayrı komut kartlarına ayrıldı; uzun Türkçe eylem adları kesilmeden gösteriliyor ve kritik tüm-sayfalar işlemi belirgin uyarı sınırında kalıyor.
- Kelime listesi editörü 960 px responsive iki sütunlu çalışma alanına geçirildi; dar ekranlarda tek sütuna düşüyor.

### Safety

- `close-page`, `open-page`, `close-all`, `edit` ve `update` eylem hookları; Etsy selectorları, storage anahtarları, açık onaylar, pagination, doğrulama, retry ve fail-closed davranışları korunmuştur.
- Toast sistemi bu sürümde değiştirilmedi; mevcut geçici bildirim davranışı ayrı Toast-01 migration kapsamına bırakıldı.

### Validation

- Production userscriptten oluşturulan sentetik panel ve editör fixtureları, davranış testleri, source-lock kontrolleri, MKUI drift/coexistence denetimleri ve tam dağıtım kapısı çalıştırıldı.
- Son production commit’inde userscript/önizleme SHA bağı, trailing-whitespace denetimi ve doğrulanmış commit/push zinciri de başarıyla tamamlandı.

## [1.0.4] - 2026-09-02

### Changed

- `Tamplate-Back-White-01` referans alınarak MKUI v1'in ilk production pilotu uygulandı; panelin nötr renk tokenları, radius/spacing ölçüleri, focus ring'i, durum/özet kartları, launcher, toast ve modal yüzeyleri aynı Makaytron tasarım diline yaklaştırıldı.
- Migration yalnız presentation katmanında tutuldu; Etsy selector'ları, anahtar kelime iş mantığı, storage/telemetry sözleşmeleri, userscript grant/connect izinleri ve update/download URL'leri değiştirilmedi.

### Validation

- Ads davranış testleri, JavaScript syntax kontrolü, korunan DOM hook/metadata invariantları ve patch hygiene gate'i geçildi.

## [1.0.3] - 2026-08-08

### Fixed

- Etsy'nin anahtar kelime metnini ek `div` katmanları içine taşıdığı yeni Ads tablo yapısında satır metni artık güvenli biçimde okunur; responsive kolon başlığı, gizli ve yardımcı erişilebilirlik metinleri eşleşme dışında bırakılır.
- Anahtar kelime satırları yalnız DOM'a eklenmiş olmakla kalmayıp okunabilir metinle hydrate edilene kadar beklenir; erken `Anahtar kelime satırları yüklenemedi` hatası önlenir.
- Clicks/Orders metrikleri aynı görünür-içerik okuyucusunu kullanarak iç içe hücre yapılarında doğru ayrıştırılır.
- Panel düğmeleri dar alanda taşmadan sarılır, kısa ekranlarda panel içi kaydırma çalışır ve kapalı panel açma sekmesi diğer Makaytron araçlarındaki logo görünümüne uyarlanır.

## [1.0.2] - 2026-08-04

### Changed

- Finalized the public distribution release after the immutable tag-only `v1.0.1` checkpoint.
- Corrected Greasy Fork documentation to describe automatic Raw `main` synchronization plus the release-only immediate-refresh webhook.
- Added post-push Raw source-parity validation; no Etsy or keyword-management behavior changed.

## [1.0.1] - 2026-08-04

### Changed

- Canonical repository, Raw update, support, logo, privacy, and keyword-rule URLs were verified against `Makaytron/Etsy-Automation-Tools`.
- Greasy Fork distribution follows the exact public Raw source with automatic synchronization and a release-only immediate-refresh webhook.
- The legacy `@namespace` remains unchanged to preserve existing userscript identity; it is not used as a network endpoint.

### Added

- Panel sürüm rozeti ve Tampermonkey menüsü üzerinden elle çalıştırılabilen script sürüm denetimi eklendi.
- GitHub kurulumlarında en fazla 24 saatte bir çalışan, yalnız uzak `@version` metadata değerini ayrıştıran otomatik denetim eklendi.
- Yeni sürüm için kullanıcı onaylı canonical `.user.js` kurulum sayfası akışı ve erişilebilir panel durumu eklendi.
- Gömülü ilk kurulum listesi canonical kural dosyasıyla eşitlendi ve görünür logo ağ isteğini önlemek için script içine gömüldü.
- Form açıkken liste değişikliği/canlı işlem yarışı engellendi; `Ctrl + Space` için onay eklendi ve başarısız satırda toplu işlem durduruldu.

### Security

- Verified and retained the existing `@antifeature tracking` disclosure for the documented privacy-preserving telemetry.
- Uzak script kodu çalıştırılmadan yalnız SemVer karşılaştırması yapılır; sessiz kurulum yoktur.
- Greasy Fork gibi harici kurulum kaynaklarında özel GitHub denetimi zorlanmaz.
- Canlı anahtar kelime işlemi, liste güncellemesi veya açık editör sırasında sürüm/kurulum eylemleri fail-closed engellenir.

## 1.0.0 - 2026-08-02

Bu sürüm `main` üzerindeki canonical raw pakettir.

### Added

- Makaytron Etsy Ads Keyword Manager ilk canonical monorepo paketi olarak eklendi.
- Ham satır düzenleyici yerine kullanıcı dostu ekleme, düzenleme, arama ve silme formu eklendi.
- İçerme, birebir aynı ve ileri düzey özel kural seçenekleri örnekli açıklamalarla sunuldu.
- Türkçe/İngilizce arayüz, kalıcı dil seçimi ve Makaytron panel tasarımı eklendi.
- Mevcut sayfa ve onaylı tüm-sayfalar anahtar kelime işlemleri eklendi.
- Eski otomatik `?mod=1` başlangıcı ve işlem sonu sekme kapatma davranışı kaldırıldı.
- Canonical GitHub kural listesi, güncelleme onayı, yerel liste yedeği ve yedeği geri yükleme menüsü eklendi.
- Gömülü ilk kurulum listesi canonical kural dosyasıyla eşitlendi ve görünür logo ağ isteğini önlemek için script içine gömüldü.
- Form açıkken liste değişikliği/canlı işlem yarışı engellendi; `Ctrl + Space` için onay eklendi ve başarısız satırda toplu işlem durduruldu.
