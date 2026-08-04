# Changelog

Bu projedeki kayda değer tüm değişiklikler bu dosyada belgelenir.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) temel alınarak hazırlanır ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.

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
