# Changelog

Bu projedeki kayda değer tüm değişiklikler bu dosyada belgelenir.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) temel alınarak
hazırlanır ve proje [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.

## [1.2.5] - 2026-08-30

### Added

- Her yeni teslimat kampanyası için seçili alıcılar ve şablon görünürken ayrı **Otopilotu Başlat** opt-in'i eklendi. Otopilot alıcıları kesinlikle tek tek işler; her öğede kalıcı durum ve Etsy outgoing balon doğrulaması tamamlanmadan sıradakine geçmez.
- Otopilot için **Duraklat / Devam Et**, **Bu Alıcıyı Atla** ve **Otomasyonu Bitir / Durdur** kontrolleri eklendi. Duraklatma başlamış doğrulamayı güvenle tamamlayıp sonraki alıcıyı engeller; çözülmemiş gönderim sonucu terminalleştirilmeden durdurma ilerlemez.

### Changed

- Panel premium sade bir çalışma kabuğuna geçirildi: **Mesajlar / Otomasyon / Yorumlar** ana çalışma grubu araçlardan ayrıldı; Otomasyon görünümü tek ana aksiyon, durum/ilerleme hero'su ve yatay tablo yerine responsive alıcı kartları kullanır.
- Alıcı seçimi veya eski/global otomatik gönderim ayarı artık yeni kampanya yetkisi sayılmaz. `review_request` için sipariş bazında güncel uygunluk kararı ile kampanyaya özel Otopilot opt-in'i birlikte gerekir.
- Completed Orders yenilemesi, yalnız sipariş satırının kendi içindeki strict aynı-origin `/shop/<shop>/reviews/<numeric>` bağlantısını ve tam **Review/Yorum** etiketini kesin pozitif kanıt sayarak kalıcı `review_exists` blokuna dönüştürüyor. İsim, ürün, dashboard yorum kartı veya public mağaza HTML'i eşleştirilmez; bağlantı yokluğu otomatik uygunluk değildir ve manuel **Yorum yok** onayı iki saat geçerli kalır.

### Security

- Otopilotun aynı anda yalnız bir alıcıyı sahiplenmesi, gönderim öncesi alıcı/sipariş/konuşma/metin bağlarını yeniden doğrulaması ve terminal kalıcı `sent` + outgoing kanıtından önce yeni alıcı başlatmaması zorunlu tutuldu.
- `pending`, şüpheli, zaman aşımı, bozuk kalıcı aşama veya kimlik/metin/kapsam uyuşmazlığı Otopilotu fail-closed durdurur. Belirsiz öğe otomatik tekrar gönderilmez; yalnız doğru konuşmada gözle inceleme ve açık **Gönderildi / Gönderilmedi** uzlaştırmasıyla çözülebilir.
- Eski/global `autoSendCampaign` tercihi yeni Otopilot veya yorum talebi yetkisi vermez; yeni kampanya opt-in'i kalıcı bir genel otomatik gönderim onayına dönüşmez.
- **Otopilotu Başlat** öncesindeki UI yenilemesi kesin pozitif siparişlerin kuyruğa girmesini engeller. Daha önce kuyruğa alınmış veya hazırlanmış bir öğede kanıt belirirse gönderim anındaki uygunluk koruması Etsy gönderiminden önce fail-closed engeller.

### Fixed

- Etsy gönderimden sonra teslim edilmiş sipariş çekmecesine `/conversations/<sayısal-kimlik>` kalıcı bağlantısını eklediğinde genel kompozitör kapsamı fail-closed kalırken, doğrulayıcı gönderim öncesinde yakalanmış aynı receipt kapsamındaki tam `Message history` + tek kanonik sayısal konuşma bağlantısı + yeni giden balon kanıtıyla gönderimi tamamlar.
- Kanıt istisnası yanlış sipariş/rota, kopmuş DOM kapsamı, eksik gönderim zamanı, ek/tekrarlı/alakasız konuşma bağlantısı veya giden mesaj artışı olmadığında reddedilir; ikinci bir Etsy gönderim tıklaması yapılmaz.
- Kullanıcının `Gönderildi` olarak uzlaştırdığı kampanya gönderimi artık konuşma ledger'ını `sent` yapar ve tekil `send_verified` geçmiş kaydı üretir; `Gönderilmedi` çözümü doğrulama geçmişi oluşturmaz.

### Tests

- Birim regresyonları yalnız tam iki bağlantılı gönderim sonrası Etsy yapısını, yakalanmış kapsamın receipt/rota/DOM bağlarını ve manuel uzlaştırma ledger/geçmiş tutarlılığını kapsar.
- Birim regresyonları ayrıca strict aynı-origin, sorgusuz/hash'siz sayı kimlikli review permalink'ini ve tam **Review/Yorum** etiketini kabul eder; yanlış origin, bozuk yol/etiket, isim veya ürün temelli sezgileri reddeder; kalıcı `review_exists` durumunun seçim, kampanya oluşturma ve gönderim anı uygunluk korumalarını doğrular.
- İzole Chrome fixture'ı gönderim anında sayı kimlikli konuşma kalıcı bağlantısını ekler; genel kompozitör seçicisinin kapalı kaldığını, tek açık Otopilot opt-in'inin kontrollü bir alıcı için bir native submit ve bir giden balon ürettiğini, kampanya ile ledger'ların kalıcı `sent` tamamlandığını ve tekrar gönderim yapılmadığını doğrular.

## [1.2.4] - 2026-08-30

### Fixed

- Etsy'nin teslim edilmiş sipariş çekmecesinde kompozitörle aynı panelde gösterdiği tek `Message history` bilgi bağlantısı artık başka bir aktif konuşma sanılmıyor; siparişe bağlı, sıfır konuşmalı akış seçilen alıcı için taslağı hazırlayabiliyor.
- İstisna yalnız tam Etsy `conversations/with/... ?ref=order_details` bağlantısına ve yalnız bir eşleşmeyen bağlantıya uygulanır; ikinci, bozuk veya gerçekten ilgisiz konuşma bağlantıları kompozitörü fail-closed biçimde engellemeyi sürdürür.
- Gerçek tarayıcı fixture'ı canlı Etsy panel yapısını içerir ve aynı sipariş ön-dolgusunun tek taslakla değiştiğini, otomatik gönderim yapılmadığını ve açık kullanıcı eylemi olmadan giden mesaj oluşmadığını doğrular.

## [1.2.3] - 2026-08-29

### Fixed

- Sıfır konuşmalı sipariş çekmecesinde composer önce, sipariş ve alıcı bağlamı daha sonra yüklenirse kampanya artık bağlamı sınırlı süre bekler. Her bekleme adımında rota, rezervasyon ve composer yeniden doğrulanır; açık sipariş veya müşteri uyuşmazlığı ilk okumada güvenli biçimde durur.

### Tests

- Gerçek Chrome regresyonu, sipariş ve alıcı DOM'u 1,6 saniye geciktiğinde Etsy'nin purchases prefill'inin korunmasını, taslağın tam bir kez hazırlanmasını ve hiçbir Gönder tıklaması, form submit'i veya outgoing mesaj oluşmamasını doğrular.
- Gerçek Chrome geometri regresyonları, 620 px varsayılan mesaj paneli ile 360 px dar panelde uzun dil seçeneklerinin ve uzun konuşma metinlerinin panel dışına taşmadığını; teslim edilmiş sipariş tablosunun yatay kaydırmayı yalnız kendi sarmalayıcısında tuttuğunu doğrular.

## [1.2.2] - 2026-08-29

### Added

- Salt-okunur GitHub Actions kapısı; userscript davranış testlerini, izole Chrome fixture senaryolarını, dağıtım doğrulamasını ve deterministik iki dosyalı standalone paketlemeyi her push/PR üzerinde çalıştırır. Workflow tag veya release oluşturmaz ve yayın yapmaz.
- Tek sipariş, tek onay ve tek tıklama sınırlarını zorunlu tutan Türkçe/İngilizce kontrollü canlı smoke-test listeleri ile doğrulanmış userscript ve `SHA256SUMS.txt` üreten standalone paketleyici eklendi.

### Fixed

- Teslim edilmiş siparişlerdeki yeni mesaj adresleri artık tüm alıcıları `new` adlı tek konuşma gibi görmez; `with_id`, `recipient_id` ve varsa receipt kimliği tekil ve birbiriyle uyumlu doğrulanarak alıcıya özel hedef oluşturulur.
- Etsy mesaj kutusu bir formun içindeyken Gönder düğmesinin aynı konuşma panelinde formun kardeşi olması ve Türkçe `Mesaj gönder` / `Yanıt gönder` etiketleri desteklenir; gizli veya birden fazla aday yine güvenli biçimde reddedilir.
- `clg-icon-button` ve erişilebilir link kontrollerindeki güvenli Etsy mesaj adresleri sipariş kartından okunur; receipt kimliği başka bir siparişi gösteren compose adresleri reddedilir.
- Semantic outgoing işaretli yeni mesaj balonları doğrulanır. Yeni mesaj gönderildikten sonra Etsy compose adresini gerçek konuşma adresine çevirdiğinde doğrulama geç yüklenen DOM'u bekler, yalnız aynı sipariş ve müşteri bağlamında devam eder ve yeni konuşmadaki eski aynı metni bu gönderim sanmaz.
- Merkezi Mesaj Agent'ı compose hedeflerini reddeder; gönderim sonrası rota değişiminde aynı işin ikinci kez çalıştırılması engellenir. Doğrulanan gönderim gerçek thread kimliğiyle kaydedilir ve gerektiğinde doğru thread üzerinde manuel uzlaşma kontrolleri gösterilir.
- Message Center aynı iş kimliğini farklı konuşma veya metinle yeniden kullanırsa DOM'a dokunmadan non-retryable çatışma kaydı üretir; URL ile bildirilen konuşma kimliği birebir uyuşmadığında da gönderim başlamaz.
- Message Center sonucu kesinleşmeyen gönderimi kalıcı `ambiguous` fence ile durdurur. Aynı iş yeniden kiralansa bile ikinci kez tıklamaz; yalnız aynı URL ve hydrate edilmiş konuşma bağlamında Ayarlar'daki açık **Gönderildi / Gönderilmedi** uzlaştırması fence'i kaldırabilir.
- Message Center artık gönderim öncesi, tıklama sonrası ve sonuç-bildirimi aşamalarını ayrı kalıcı outbox/tombstone kayıtlarıyla korur. Bilinmeyen veya bozuk gelecek aşamalar otomatik temizlenmez; Etsy alanına dokunmadan global manuel inceleme kilidine alınır.
- Gönderilmiş iş ledger'ı sunucu + mağaza otoritesine bağlanır, token yenilemelerinde korunur ve terminal sonuç zarfı sunucuya bildirilmeden önce birebir kalıcılaştırılır. Sonuç yanıtı kaybolursa yalnız aynı zarf yeniden bildirilir; Etsy DOM'u ve Gönder düğmesi tekrar kullanılmaz.
- Kullanıcının mevcut composer taslağı — Message Center metniyle aynı olsa bile — korunur ve agent gönderimi durur. Agent'ın kendisinin eklediği metin yalnız aynı textarea, rota ve ham değer hâlâ birebir eşleşiyorsa güvenle temizlenebilir.
- Doğrulanmış native Etsy gönderimleri, yerel son işlemler bitene kadar `postprocessing` tombstone'u olarak bütün sekmeleri kilitler. Aynı otoritedeki Message Center işi exact SHA-256 receipt'i sahiplenerek sonucu `sent` sayar; ikinci Etsy tıklaması yapmaz ve **Gönderilmedi** seçimi kalıcı gönderim kanıtını geri alamaz.
- Message Center gönderimi kampanya koordinatörüyle aynı sekmeler-arası kilidi kullanır ve aynı konuşmanın aktif kampanya tarafından sahiplenildiğini görürse composer'a dokunmadan ertelenebilir hata döndürür.
- Aktif kampanya taslağında Etsy'nin kendi Gönder düğmesine basmak da atomik rehberli gönderim yoluna yönlendirilir. Kampanya dışı hazırlanmış taslakta ilk doğrulama sürerken hızlı ikinci native tıklama aynı mesajın tekrar gönderilmesini engeller.
- Etsy'nin form submit'i ile Ctrl/Command+Enter kısayolları aynı doğrulanmış gönderim yoluna alınır. Formdaki farklı bir submit kontrolü (ör. taslak kaydetme) hiçbir zaman Gönder'e çevrilmez; hızlı tekrarlanan kısayol tek tıklamada kalır.
- Kampanya oluşturma önce fail-closed `initializing` kaydıyla sahiplik kurar; kısmi durum yazımı, bilinmeyen campaign/item/order aşaması veya receipt'i uyuşmayan compose rotası composer'a ya da Gönder'e erişemez.
- Gönderim hataları; hiçbir tıklama yapılmayan bağlam/düğme sorunlarını, başka sekme sahipliğini ve sonucu belirsiz gönderimleri ayrı, eyleme dönük Türkçe yönlendirmelerle açıklar.

### Tests

- Gerçek DOM olayları kullanan, dış ağı kapalı localhost fixture'ı izole Chrome bağlamında teslim edilmiş sipariş → yorum uygunluğu → taslak → gönderim → outgoing balon → kalıcı `sent` zincirini ve compose → thread rota geçişini doğrular.
- İzole Chrome regresyonları Türkçe/İngilizce düğmeleri, çift tıklama, devre dışı düğme, yanlış sipariş/müşteri, route-before-DOM hydration, trusted Ctrl/Command+Enter, `requestSubmit`, farklı submitter engeli ve Message Center job → tek gönderim → ledger → duplicate-prevention zincirini kapsar; her target, geçici profil ve localhost sunucusu test sonunda kapatılır.

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
- Added the then-current, per-recipient **Gönder ve Sonrakine Geç** guided action. This historical flow is superseded in 1.2.5 by an explicit, per-campaign Otopilot opt-in that still processes and verifies recipients one at a time.

### Changed

- Made the review-request preset the default delivered-order template while retaining the original delivery-check template.
- Migrated existing saved template collections idempotently so the new preset appears without overwriting custom edits or archive state.
- Specialized the AI campaign instruction so only the dedicated preset may request an honest review; other delivery templates continue to prohibit review requests.
- Added an in-panel warning and replaced unrestricted bulk Select All with **Onaylıları Seç** because Etsy order cards cannot be reliably joined to dashboard review cards; recipients must be verified individually. This historical limitation still applies to name/item/dashboard/public-HTML matching; v1.2.5 adds only the exact row-local review permalink as definitive positive evidence, while absence still requires manual confirmation.
- Review-request confirmations now expire after two hours and fail closed until reconfirmed.
- At that release, review requests remained per-recipient user-triggered even when the global automatic-send setting was enabled. Since 1.2.5, the fresh campaign-specific **Otopilotu Başlat** opt-in is the authority; the legacy/global setting still grants no review-request authority.
- The next conversation opens only after the current outgoing message is verified; an uncertain result remains blocked for manual reconciliation.
- Bumped the operational status envelope to schema 2 and the configuration schema to 5. Exact legacy review-send evidence is backfilled as sent; an older generic sent record with unknown purpose remains blocked until the seller explicitly confirms it was not a review request.
- Bound that release's final guided send to the originally claimed conversation, current template tuple, enabled Etsy Send control, and user-edited composer hash immediately before dispatch. The 1.2.5 Otopilot retains the same fail-closed binding and verification barrier for every recipient.
- Suppressed a concurrent native Etsy Send click while the guided action is claiming the draft, while allowing the single programmatic click initiated by that explicit panel action.
- Made campaign queue binding and order/review-outreach send transitions atomic within the shared status envelope, and made cancel/skip restore the exact prior non-review order state before terminalizing the campaign.
- Made early claim release and `Not Sent` recovery resumable without overwriting newer cross-tab eligibility or terminal send decisions.
- Documented that the userscript is unofficial and that neither the then-current manual action nor the 1.2.5 Otopilot opt-in replaces any written authorization required by Etsy's API Terms for browser-extension access.

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
