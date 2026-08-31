<p><strong>Türkçe</strong> · <a href="./PRIVACY.en.md">English</a></p>

# Gizlilik ve Veri İşleme

Son güncelleme: 2026-08-27

Etsy Automation Tools, tarayıcı içinde çalışan Tampermonkey userscriptlerinden oluşur. Beş script de yalnız ürün kullanımını ölçen sınırlı, psödonimleştirilmiş telemetriyi varsayılan olarak açık getirir; ilk kullanımda görünür bir bildirim gösterir ve Ayarlar'dan tek tıkla kapatma olanağı verir. Telemetri Etsy içeriğini veya hesap verisini toplamaz. Message Assistant paneli varsayılan olarak kapalıdır ve **Otomatik Çeviri Önizlemesi** açık gelir. Kullanıcı paneli konuşma listesinde açarsa görünür mesaj önizlemeleri, tekil konuşmada açarsa son müşteri mesajı seçili çeviri sağlayıcısına gönderilebilir. Bu aktarımı istemiyorsanız paneli açmadan önce Tampermonkey menüsünden Makaytron ayarlarını açıp otomatik çeviri önizlemesini kapatın.

## Yerel olarak işlenen veriler

| Veri | Amaç | Varsayılan saklama |
|---|---|---|
| Script ayarları ve şablonlar | Kullanıcı tercihlerini korumak | Kullanıcı silene veya script verisini sıfırlayana kadar |
| API anahtarları ve sağlayıcı profilleri | Kullanıcının seçtiği AI/çeviri API'sine doğrudan bağlanmak | Tampermonkey yerel depolamasında, kullanıcı silene kadar |
| Müşteri adı, konuşma ve sipariş kimliği, taslak/işlem geçmişi | Mesaj hazırlama, tekrar önleme ve gönderim doğrulama | Varsayılan 90 gün; ayarlanabilir 1–365 gün, en fazla 500 kayıt |
| Aktif kampanya çalışma durumu | Duraklatma, kurtarma, doğrulama ve tekrar önleme | Akış tamamlanana veya kullanıcı script depolamasını sıfırlayana kadar |
| Kampanya raporları | Sonuç denetimi ve dışa aktarma | Son rapor ve en fazla 20 geçmiş rapor, kullanıcı Tampermonkey script depolamasını sıfırlayana kadar |
| Ads anahtar kelime kuralları, dil/panel tercihi ve son liste yedeği | Eşleştirme, arayüz tercihi ve liste geri yükleme | Kullanıcı Tampermonkey script depolamasını sıfırlayana kadar |
| Görünür Ads anahtar kelime metni ile tıklama/sipariş sayıları | Sayfa özeti, eşleştirme ve kullanıcı tarafından başlatılan açma/kapatma hedefini belirleme | Yalnız açık sayfanın belleğinde işlenir; kalıcı olarak kaydedilmez |
| Listing kimliği, görünür kart alanları, trafik/favori/satış/gelir/yenileme ölçümleri ve snapshot zamanı | Listing performansını önceki gözlemlerle karşılaştırmak | Aynı gün yeniden taramada örnek güncellenir; listing başına en fazla 120 snapshot ve en fazla 400 gün, Tampermonkey yerel depolamasında |
| Ayrı listing kaydı, analiz kararı, kullanıcı notu, önerilen önce/sonra alanları ve işlem sonucu | İyileştirmeleri izlemek, tekrarları önlemek ve kullanıcıya denetim kaydı sunmak | Listing kayıtları ayrı tutulur; iyileştirme/işlem denetim geçmişi sınırlıdır ve kullanıcı temizleyene veya script depolamasını sıfırlayana kadar saklanır |
| Listing Analyzer dil/panel tercihi, kullanıcı ayarlı analiz eşikleri ve filtre presetleri | Arayüz tercihini ve karar desteği kurallarını korumak | Kullanıcı değiştirene veya script depolamasını sıfırlayana kadar; uygulama içi veri temizleme ayarları ve presetleri korur |
| AI istek kimliği ile geçici referans→listing kimliği eşlemesi | Dışa aktarılan AI paketinde gerçek listing kimliğini gizlemek ve doğrulanan yanıtı doğru yerel kayda bağlamak | En fazla son 10 istek eşlemesi; başarılı içe aktarmada veya kullanıcı verileri temizlendiğinde kaldırılır |
| Aktif Listing Analyzer kuyruğu, tarama hata raporu ve sekme sahipliği | Sayfalar arasında kontrollü devam, durdurma, teknik hata tanısı ve çift işlem önleme | İş tamamlanana/durdurulana veya kullanıcı script depolamasını sıfırlayana kadar; en fazla 20 teknik hata raporu |
| Marketplace Insights keyword metni, son 30 gün araması, Search results göstergesi, varsa 7 günlük trend, yakalama zamanı ve türetilmiş fırsat sinyali | Açık sonuç sayfasını açıklamak, satır altı görünüm ve JSON dışa aktarımı | En fazla 100 yapılandırılmış yakalama; kullanıcı temizleyene veya script depolamasını sıfırlayana kadar |
| Listing araştırma isteği, anonim yerel listing referansı, başlık, tag, seed keyword, içerik hash'i ve yapılandırılmış sonuç | İki bağımsız analyzer arasında isteğe bağlı araştırma ve stale/replay doğrulaması | En fazla 30 kuyruk/sonuç kaydı; cache en fazla 80 kayıt ve 7 gün; teslimat/terminal kayıtları süreleri dolunca budanır |

Tarayıcı profiline, çerezlere veya Etsy parolasına userscript tarafından doğrudan erişim talep edilmez. Tampermonkey izinlerini her kurulumda ayrıca inceleyin.

## Psödonimleştirilmiş kullanım telemetrisi

Telemetri üyelik veya Makaytron/Etsy hesabı istemez ve kullanıcılar arasında kimlik eşleştirmesi yapmaz. Her userscript ilk çalıştırmada kendi rastgele UUID kurulum kimliğini üretir. Bu kimlik HTTPS üzerinden yalnız telemetri toplayıcısına gider, uygulama depolamasından önce dönüştürülür ve ham kurulum kimliği uygulama veritabanında tutulmaz.

Makaytron telemetri depolamasında yalnız şu sınırlı bilgiler saklanır:

- kurulum kimliğinden türetilmiş psödonim değer;
- script adı ve sürümü;
- günlük açılma, başarılı kullanım ve kategorize hata sayaçları;
- sunucunun UTC gün ve saat bilgisi;
- kötüye kullanım sınırlaması için kısa ömürlü, IP adresinden türetilmiş değer.

IP adresinin kendisi uygulama veritabanına yazılmaz. Kötüye kullanım sınırlaması için türetilmiş ağ verisi kısa süreli tutulup otomatik silinir. Günlük olay ve hata toplamları 180 gün, son etkinliği kalmayan kurulum özeti 400 gün tutulur. Her izinli sinyal script başına UTC gününde en fazla bir kez ölçülür.

Barındırma sağlayıcısı ayrıca yönetilen istek ve ağ operasyon logları oluşturabilir. Bu loglar istek/yanıt metadatasını, izin verilen istek alanlarını, ağ metadatasını ve çağıran IP adresini içerebilir; mevcut hizmet planında bir gün tutulur. Script içindeki kapatma işlemi uygulama kayıtlarını siler ancak daha önce oluşmuş sağlayıcı loglarını tekil olarak silemez; bunlar sağlayıcının saklama süresiyle sona erer.

Telemetri; ham hata mesajı veya stack, yakalanmış Error nesnesi, DOM/selector içeriği, Etsy mesajı, taslak/çeviri metni, müşteri veya sipariş bilgisi, mağaza/listing kimliği, anahtar kelime, arama sonucu/metriği, URL, çerez, oturum, API anahtarı ya da tarayıcı parmak izi kabul etmez. Hatalar yalnız genel kategoriler halinde sayılır. Telemetri ağ hatası ana script işlemini engellemez.

Tarayıcı Do Not Track (`navigator.doNotTrack === "1"`) veya Global Privacy Control (`navigator.globalPrivacyControl === true`) bildiriyorsa ya da otomatik WebDriver oturumu algılanırsa telemetri başlatılmaz.

İlk kullanım bildirimi telemetrinin varsayılan açık olduğunu ve Ayarlar'dan kapatılabileceğini açıklar. Kullanıcı telemetriyi kapattığında script sunucudan o userscripte ait kurulum özetini ve bağlı günlük olay/hata toplamlarını silmesini ister; doğrulanmış silme yanıtından sonra yerel telemetri kimliğini kaldırır. Public userscriptte veya belgelerde gizli anahtar bulunmaz.

## Üçüncü taraf alıcıları

- Google Translate varsayılan çeviri sağlayıcısıdır. Varsayılan açık otomatik çeviri önizlemesi, kullanıcı paneli konuşma listesinde açtığında en fazla 50 görünür mesaj önizlemesini; tekil konuşmada açtığında son müşteri mesajını `translate.googleapis.com` adresine gönderebilir. Hızlı görüntüleme dilini değiştirmek görünür liste önizlemelerini yeni hedef için yeniden gönderir; manuel ücretsiz çeviri de seçilen metni aynı alıcıya gönderir.
- DeepL seçildiğinde metin ve kullanıcıya ait API anahtarı DeepL API'sine gönderilir.
- AI özelliği seçildiğinde ilgili mesaj bağlamı ve talimatlar kullanıcı tarafından seçilen OpenAI, Anthropic, Google Gemini, DeepSeek veya OpenRouter API'sine gönderilir.
- Listing Analyzer `v1.2.1` bir AI sağlayıcısına ağ isteği göndermez ve AI API anahtarı saklamaz. Kullanıcı anonimleştirilebilir istek JSON'u/prompt'u dışa aktarabilir veya kopyalayabilir; harici araçtan aldığı teklif JSON'unu doğrulamadan sonra içe aktarabilir. Harici araca ne gönderileceğini kullanıcı kontrol eder.
- Listing Analyzer güncelleme denetimi en fazla 24 saatte bir, çerez göndermeyen anonim isteklerle `api.github.com` üzerinden canonical `main` commit kimliğini ve ardından yalnız o değişmez commit altındaki `raw.githubusercontent.com` userscript metadata’sını okur. Kurulum otomatik yapılmaz; yalnız doğrulanan commit URL’si Tampermonkey onay ekranında açılır.
- Keyword & Market Analyzer da canonical `main` commit kimliğini `api.github.com` üzerinden doğrular ve metadata'yı yalnız o değişmez commit altındaki `raw.githubusercontent.com` userscriptinden okur. Etsy Sale Manager, Message Assistant ve Ads Keyword Manager uygulama içi güncelleme denetimleri en fazla 24 saatte bir kendi canonical public Raw userscript kaynaklarını okuyabilir. Başka dağıtım kaynağından kurulumda özel GitHub akışı zorlanmaz.
- Beş script, telemetri açıkken sınırlı günlük açılma, başarılı kullanım ve kategorize hata sinyallerini Makaytron telemetri toplayıcısına gönderebilir. Yukarıda sayılan ham hatalar, içerik ve hesap verileri bu alıcıya gönderilmez.
- Ads Keyword Manager yalnız kullanıcı **Listeyi güncelle** işlemini onayladığında canonical `keyword-rules.txt` dosyasını `raw.githubusercontent.com` üzerinden indirir. Mevcut yerel liste önce Tampermonkey depolamasında yedeklenir.
- Keyword & Market Analyzer, yukarıdaki sınırlı telemetri dışında Etsy API'sine veya Makaytron içerik sunucusuna istek göndermez; yalnız açık Marketplace Insights DOM'unu okur. İki analyzer arasındaki istek/sonuç `BroadcastChannel` ile aynı tarayıcıdaki Etsy origin'i içinde kalır. Listing başlığı/tag içeriği yalnız kullanıcı araştırmayı başlattığında aktarılır.
- Kullanıcı bağımsız veya entegre araştırmayı başlattığında seed keyword, normal Marketplace Insights arama sayfasına geçişte Etsy'ye URL `query` değeri olarak gider. Bu Etsy araştırma kotasını veya Etsy'nin gösterdiği sorgu maliyetini tüketebilir; script bunu Makaytron'a göndermez ve kotayı atlatmaz.

Özel Ads kuralları, görünür anahtar kelimeler ve reklam metrikleri Makaytron'a veya GitHub'a yüklenmez; telemetri yalnız Ads aracının başarılı kullanımını ve genel hata kategorilerini sayar. Paneldeki logo userscript içine gömülüdür ve Etsy sayfası açıldığında ayrı bir marka-varlığı isteği oluşturmaz.

Listing Analyzer snapshotları, analiz geçmişi ve işlem kayıtları Makaytron'a veya GitHub'a otomatik yüklenmez; telemetri yalnız tamamlanan tam taramaları ve genel hata kategorilerini sayar. Kullanıcı bu verileri dışa aktarırsa indirilen dosyanın korunması ve silinmesi kullanıcıya aittir.

Listing Analyzer Etsy API/OAuth kullanmaz, shared secret istemez ve yalnız açık Etsy listing/listing-editor sayfasının görünür DOM alanlarını okur. Kullanıcı tarafından kaydedilmiş authenticated HTML veya kişisel veri repo fixture'ı olarak kullanılmaz.

Kullanıcı bir listing için deaktivasyonu ayrıca onayladığında Listing Analyzer, açık Etsy editöründe yalnız tam eşleşen **Deactivate** menü öğesine ve final **Deactivate** düğmesine tıklar. **Delete** kontrolü kullanılmaz. İşlem kimliği ve `Active → Inactive` doğrulama durumu yerel işlem kuyruğunda tutulur; sonuç belirsizse script otomatik yeniden gönderim yapmaz.

Keyword & Market Analyzer `Search results` değerini Etsy'nin görünür sonuç/rekabet göstergesi olarak etiketler. Makaytron fırsat puanı türetilmiş karar desteğidir; Etsy tarafından sağlanan kesin rekabet, satış veya performans tahmini değildir.

Bu sağlayıcıların kendi gizlilik, saklama ve kullanım koşulları geçerlidir. Göndermeden önce gereksiz müşteri ve sipariş verisini kaldırın.

## Dışa aktarma ve sırlar

Config dışa aktarımı varsayılan olarak API anahtarlarını içermez. **API anahtarlarını dahil et** seçeneği bilinçli olarak açılırsa anahtarlar indirilen JSON dosyasına düz metin olarak yazılır. Bu dosyayı paylaşmayın veya korumasız bulut depolamasına yüklemeyin.

Listing Analyzer AI istek/prompt dışa aktarımı listing başlığı, açıklaması, etiketleri veya kullanıcı notu içerebilir. Harici bir AI aracına vermeden önce gereksiz mağaza/listing kimliklerini ve kişisel verileri kaldırın. İçe aktarılan teklif JSON'u canlı yazma değildir; desteklenen alanlar ayrıca doğrulanır ve her listing Etsy Publish öncesinde kullanıcı onayı bekler.

## Otomatik gönderim

Message Assistant içindeki otomatik gönderim varsayılan olarak kapalıdır. Açıldığında script Etsy'nin gönder düğmesine basabilir. Her taslağı kontrol edin; ayarı yalnız etkisini anladığınızda açın.

## Veriyi silme

- Her scriptin Ayarlar bölümündeki kullanım telemetrisi anahtarını scripti kaldırmadan veya Tampermonkey deposunu sıfırlamadan önce kapatın. Bu işlem sunucudaki kurulum özeti ile bağlı günlük olay ve hata toplamlarının silinmesini ister ve doğrulanan yanıttan sonra yerel telemetri kimliğini kaldırır. UUID önce kaybolursa hedefli sunucu silmesi yapılamaz; kayıt normal saklama süresiyle sona erer.
- Message Assistant içindeki **Geçmiş → Geçmişi Temizle** işlemini kullanın.
- Listing Analyzer içindeki geçmiş temizleme işlemini kullanın veya ilgili Tampermonkey script depolamasını sıfırlayın.
- Keyword & Market Analyzer panelindeki yerel veri temizleme işlemini kullanın veya `ekma:v1` Tampermonkey script depolamasını sıfırlayın.
- Ayarlar, API profilleri, Ads kuralları ve Ads liste yedeği için ilgili Tampermonkey script depolamasını sıfırlayın veya scripti kaldırırken ilişkili verileri silin.
- Dışa aktarılan config, rapor ve ekran görüntülerini dosya sisteminizden ayrıca silin.

Kod veya veri akışında değişiklik yapıldığında bu belge de güncellenmelidir. Güvenlik etkili bir veri sızıntısını [SECURITY.md](./SECURITY.md) üzerinden özel bildirin.
