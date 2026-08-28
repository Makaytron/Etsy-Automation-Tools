# Changelog

Bu projedeki kayda değer tüm değişiklikler bu dosyada belgelenir.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) temel alınarak
hazırlanır ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.

## [1.2.2] - 2026-08-28

### Fixed

- Teslim edilmiş siparişlerdeki yeni mesaj adresleri artık tüm alıcıları `new` adlı tek konuşma gibi görmez; `with_id`, `recipient_id` ve varsa receipt kimliği tekil ve birbiriyle uyumlu doğrulanarak alıcıya özel hedef oluşturulur.
- Etsy mesaj kutusu bir formun içindeyken Gönder düğmesinin aynı konuşma panelinde formun kardeşi olması ve Türkçe `Mesaj gönder` / `Yanıt gönder` etiketleri desteklenir; gizli veya birden fazla aday yine güvenli biçimde reddedilir.
- `clg-icon-button` ve erişilebilir link kontrollerindeki güvenli Etsy mesaj adresleri sipariş kartından okunur; receipt kimliği başka bir siparişi gösteren compose adresleri reddedilir.
- Semantic outgoing işaretli yeni mesaj balonları doğrulanır. Yeni mesaj gönderildikten sonra Etsy compose adresini gerçek konuşma adresine çevirdiğinde doğrulama geç yüklenen DOM'u bekler, yalnız aynı sipariş ve müşteri bağlamında devam eder ve yeni konuşmadaki eski aynı metni bu gönderim sanmaz.
- Merkezi Mesaj Agent'ı compose hedeflerini reddeder; gönderim sonrası rota değişiminde aynı işin ikinci kez çalıştırılması engellenir. Doğrulanan gönderim gerçek thread kimliğiyle kaydedilir ve gerektiğinde doğru thread üzerinde manuel uzlaşma kontrolleri gösterilir.

### Tests

- Gerçek DOM olayları kullanan, dış ağı kapalı localhost fixture'ı izole Chrome bağlamında teslim edilmiş sipariş → yorum uygunluğu → taslak → gönderim → outgoing balon → kalıcı `sent` zincirini ve compose → thread rota geçişini doğrular.

## [1.2.1] - 2026-08-28

### Fixed

- İngilizcedeki “a ton” ifadesinin renk değişikliği sayılması giderildi; `tonu`, `tonları` ve “şu ton” gibi Türkçe renk tonu ifadeleri Unicode sınırlarıyla doğru algılanır.
- Query biçimindeki Etsy konuşma bağlantıları (`/messages?conversation_id=...`) liste ve Message Center taramasına dahil edildi.
- Farklı metinlerin aynı FNV özetiyle çakışıp çeviri cache'i veya batch sonucu paylaşması engellendi; DeepL `NB` dil kodu güvenli biçimde Google `no` hedefine çevrilir.
- Konuşma listesi çevirisi sürerken rota değiştiğinde eski işin paneli meşgul bırakması ve düşük ayrıntılı Message Center eşitlemesinin daha güçlü eşitlemeyi yutması giderildi.
- Konuşma listesi fallback taramasında tarih/saatlerin önizleme, ürün başlıklarının müşteri adı sanılması engellendi; Türkçe göreli zamanlar da filtrelenir.
- Türkçe “Teslim edildi” siparişleri algılanır; gizli veya birden fazla eşleşen Etsy Gönder düğümü artık güvenli biçimde reddedilir.
- Başarılı çeviri, taslak, aktarım veya doğrulanmış gönderimin reddedilen ya da askıda kalan geçmiş depolaması yüzünden başarısız sayılması engellendi; geçmiş dışa aktarımındaki object URL gecikmeli kapatılır.
- Ayar/depolama yazma hatalarında çalışma zamanı durumunun kayıttan ayrışması, config içe aktarımının yarım uygulanması, şablon arşivleme hatasında belleğin değişmesi ve ayar kaydı sürerken yeni taslağın silinmesi giderildi. Config yazıları sekmeler arası kilit altında taze snapshot ile uygulanır; başarısız rollback başka sekmenin başarılı kaydını ezmez.
- Geçerli şemadaki ayarların her sayfa açılışında yeniden yazılması ve config değişiklik zamanının yanlış güncellenmesi engellendi.
- Canonical GitHub kurulumundaki panel içi güncelleme kanalı yeniden etkinleştirildi; sağlayıcı fallback JSON çıktıları kullanılmadan önce bildirilen şemaya göre doğrulanır.

### Security

- Sipariş ve kampanya akışları yalnız doğrulanmış `https://www.etsy.com` konuşma adreslerine yönlenir; dış origin ve credential içeren adresler reddedilir.
- Etsy DOM'undan gelen sipariş kimlikleri ile ayarlardaki model metni HTML/attribute bağlamında kaçırılır.
- AI, DeepL ve Message Center anahtarları panel HTML'ine yazılmaz; panel kapalı shadow root kullanır ve kayıtlı anahtarların silinmesi açık bir taslak eylemidir.

## [1.2.0] - 2026-08-27

### Added

- `/messages` ve `/messages/all` ekranlarında Etsy DOM'undaki güvenli konuşmaları panel içinde gösteren, taslak veya gönderim kontrolü açmayan konuşma listesi eklendi.
- Google GTX sağlayıcısının güncel 249 hedefini Türkçe adlarla sunan, varsayılanı Türkçe ve seçimi kalıcı hızlı görüntüleme dili eklendi; çevrilmiş önizlemenin özgün metni korunur.

### Changed

- Otomatik liste önizlemesi en fazla 50 görünür konuşma ve üç eşzamanlı sağlayıcı isteğiyle sınırlandı; aynı metinler tek istekte birleştirilir ve her batch yalnız bir geçmiş özeti üretir.
- Geniş dil kataloğunun güvenli config içe/dışa aktarımı için yapılandırma şeması 7'ye yükseltildi; eski dil kodları uyumluluk aliaslarıyla korunur.

### Fixed

- Uzun dil seçeneklerinin paneli yatayda 1600 pikselin üzerine büyütmesi, yalnız konuşma listesine kapsamlı `minmax(0, 1fr)` ve genişlik sınırlarıyla giderildi.
- Dil/rota değişiminde geç kalan çeviri sonuçlarının veya eski bir tıklama cleanup'ının daha yeni liste çalışmasının durumunu bozması engellendi.
- CSS ile gizlenmiş Etsy satırlarının liste taramasına ve otomatik çeviriye dahil olması engellendi.

### Security

- Etsy konuşma URL'lerinde path ile `conversation_id` çakışması, yinelenen query kimliği, reserved klasör, encoded ayırıcı, dış origin ve credential içeren adresler fail-closed reddedilir.

## [1.1.1] - 2026-08-27

### Changed

- Panel artık mesaj sayfasında varsayılan olarak kapalı kalır; sağ üstteki kompakt **Mesaj Asistanı · Aç** kontrolü ve panel başlığındaki belirgin **Kapat** kontrolü açık/kapalı durumunu gösterir.
- Otomatik Türkçe önizleme, yalnız kullanıcı paneli açtığında veya **Mesaj Sayfasında Otomatik Aç** seçeneğini açıkça etkinleştirdiğinde devreye girer.

### Fixed

- Eski ayar şemalarının içe aktarılması veya yükseltilmesi sırasında panelin istemeden yeniden otomatik açılması engellendi.
- Gizli bilgiler dahil edilmeden dışa aktarılan yapılandırmalardan DeepL, AI sağlayıcısı ve merkezi mesaj paneli kimlik bilgilerinin sızması engellendi; bu yedekler içe aktarılırken mevcut yerel anahtarlar korunur.
- Şablon kimlikleri ve ayrılmış yorum-talebi şablonu güvenli biçimde doğrulanarak HTML öznitelik enjeksiyonu ile yanlış amaç metadata'sının korumaları aşması engellendi.
- Müşteri dilinde yanıt tercihi uygulanır ve çeviri isteklerinde paragraf/satır sonları korunur.
- Geçmiş kayıtlarının eş zamanlı sekme yazımlarında kaybolması önlendi.
- Mesaj bağlamı ve yorum cevap alanı etkin konuşma/kart kapsamına bağlandı; belirsiz DOM eşleşmeleri artık güvenli biçimde reddedilir.

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
