<p align="center">
  <img src="../../assets/makaytron-logo.png" width="96" alt="Makaytron logosu">
</p>

# Makaytron Etsy Message Assistant

<p><strong>Türkçe</strong> · <a href="./README.en.md">English</a></p>

Etsy mesajlarını Türkçe önizlemek, Türkçe cevabı müşterinin diline çevirmek, AI destekli taslak hazırlamak ve teslim edilmiş siparişlerde açıkça yetkilendirilen, doğrulamalı Otopilot akışı yürütmek için Tampermonkey userscripti.

Script standalone çalışır; diğer Etsy Automation Tools paketlerinin kurulması gerekmez.

**Sürüm:** 1.2.5 · [Değişiklik günlüğü](./CHANGELOG.md) · [Ana depo](../../README.md)

**Kullanım rehberi:** [Türkçe](./USAGE.md) · [English](./USAGE.en.md)

## Kurulum

1. Güncel Chrome, Edge veya Brave ile [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Userscript dosyasını açın](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js).
3. Tampermonkey kurulum ekranında izinleri inceleyip **Yükle** düğmesine basın.
4. Etsy Mesajlar veya desteklenen Shop Manager sayfasını açıp yenileyin.
5. Sağ üstteki **Asistan · Aç** kontrolüyle paneli açın.
6. Makaytron panelindeki **Ayarlar** bölümünden kullanacağınız çeviri veya AI sağlayıcısını yapılandırın.

## Özellikler

- Etsy müşteri mesajını Türkçe önizler.
- Mesaj sayfasında varsayılan olarak kapalı kalır; panel yalnız sağ üstteki kompakt **Asistan · Aç** kontrolüyle veya kullanıcının ayrıca etkinleştirdiği otomatik-açma tercihiyle görünür.
- Konuşma listesi, tekil konuşma, Completed Orders ve Recent activity/Reviews bağlamlarını ayrı doğrular; yanlış sayfada taslak, sıra veya aktarım kontrolü göstermez.
- Konuşma listesinde Etsy'de görünür konuşmaları panel içinde gösterir; Türkçe varsayılan hızlı görüntüleme dili, geniş dil seçimi, çevrilmiş önizleme/orijinal metin ve güvenli konuşma açma akışı sunar.
- Türkçe cevabı müşterinin diline çevirir.
- OpenAI, Anthropic Claude, Google Gemini, DeepSeek ve OpenRouter için kullanıcıya ait API profillerini destekler.
- Şablonlar, değişkenler, geçmiş ve teslim edilmiş siparişler için kontrollü mesaj sırası sunar.
- Çalışma ve araç bölümlerini ayıran premium sade panel, tek ana aksiyonlu **Otomasyon** görünümü, ilerleme özeti ve dar ekranda yatay tablo gerektirmeyen alıcı kartları sunar.
- Satıcının, alıcının henüz yorum bırakmadığını doğruladığı teslim edilmiş siparişler için yeni/küçük işletme tonunda, İngilizce, baskısız ve teşviksiz dürüst yorum talebi şablonu sunar.
- Completed Orders satırının kendi içindeki, Etsy ile aynı origin'de bulunan tam `/shop/<shop>/reviews/<numeric>` bağlantısını yalnız görünür etiketi tam **Review** veya **Yorum** olduğunda kesin pozitif kanıt sayar ve siparişi kalıcı `review_exists` olarak engeller. İsim, ürün başlığı, dashboard yorum kartı veya public mağaza HTML'i ile çapraz eşleştirme yapmaz.
- Kesin permalink bulunmaması **yorum yok** veya otomatik uygunluk anlamına gelmez. Kalan siparişlerin durumu `Kontrol edilmedi / Yorum yok / Yorum var / Ertele / İletişim istemiyor veya sorun var` kararlarıyla sipariş bazında yerel olarak saklanır; manuel **Yorum yok** uygunluk onayı iki saat sonra sona erer ve aynı siparişe ikinci yorum talebi engellenir.
- Eski bir `gönderildi` kaydının önceki mesaj amacını kanıtlayamadığı siparişi belirsiz olarak kilitler; yalnız Etsy konuşmasını kontrol edip **Önceki mesaj yorum talebi değildi — onayla** seçeneğini seçtikten sonra serbest bırakır. Doğrulayamıyorsanız siparişi kilitli bırakın.
- Her yeni teslimat kampanyasını yalnız kullanıcının seçili alıcılar ve şablon görünürken bastığı **Otopilotu Başlat** düğmesiyle yetkilendirir. Alıcı seçmek, kuyruk hazırlamak veya eski/global otomatik gönderim ayarı tek başına canlı gönderim izni değildir.
- **Otopilotu Başlat** öncesindeki Otomasyon yenilemesi kesin pozitifleri kuyruğun dışında tutar. Kanıt, bir sipariş kuyruğa alındıktan veya hazırlandıktan sonra görünürse gönderim anındaki uygunluk koruması o öğeyi Etsy'ye gönderilmeden engeller.
- Otopilot alıcıları kesinlikle tek tek işler; bir alıcının mesajı için kalıcı kampanya/gönderim durumu yazılmadan ve Etsy'deki yeni outgoing balon doğrulanmadan sıradaki konuşmayı başlatmaz.
- Etsy teslim edilmiş sipariş çekmecesine gönderimden sonra sayı kimlikli konuşma bağlantısı eklediğinde genel kompozitör kapsamı güvenlik için kapalı kalır; doğrulayıcı yalnız gönderimden önce yakalanmış aynı sipariş kapsamındaki tek bilgi bağlantısı, tek kanonik konuşma bağlantısı ve yeni giden balon birlikte eşleşirse işlemi tamamlar.
- Sonucu `pending`, şüpheli veya kapsam/metin/alıcı uyuşmaz olan gönderimde Otopilotu durdurur ve otomatik yeniden gönderim yapmaz. Kullanıcının **Gönderildi** olarak uzlaştırdığı sonuç konuşma durumunu ve tekil doğrulama geçmişini tamamlar; **Gönderilmedi** seçimi doğrulama geçmişi üretmez ve kendiliğinden yeniden tıklama başlatmaz.
- **Duraklat**, mevcut doğrulama güvenle tamamlandıktan sonra sıradaki alıcının başlamasını engeller; **Otomasyonu Bitir / Durdur** kalan gönderilmemiş sırayı sonlandırır. Doğrulaması bekleyen sonuç önce çözülmelidir.
- Yorum taleplerinde eski/global otomatik gönderim ayarını yetki olarak kullanmaz. Her sipariş için güncel uygunluk kararı ve her yeni kampanya için ayrı **Otopilotu Başlat** onayı gerekir.
- Bu, Etsy tarafından onaylanmış bir entegrasyon değil, resmî olmayan bir userscripttir. Etsy [API Koşulları](https://www.etsy.com/legal/api/), Etsy verisine erişen, veriyi analiz eden veya tarayan otomatik sistemler ve tarayıcı uzantıları için Etsy'nin açık yazılı yetkisini arar; açık Otopilot onayı tek başına bu yetkiyi sağlamaz.
- Ayarları ve sağlayıcı profillerini script güncellemesinde korur.
- Ayar ve API alanları **Kaydet** düğmesine kadar yalnız taslakta kalır; config dışa aktarma veya bağlantı testi görünmeden çalışma ayarını değiştirmez.
- Kayıtlı API ve agent anahtarları panel HTML'ine yazılmaz; yeni değer girilene veya açık silme eylemi seçilip kaydedilene kadar yerel depoda korunur.
- Canonical GitHub kurulumunda yeni sürümü `@version` satırından en fazla 24 saatte bir kontrol eder; farklı dağıtım kaynağının güncelleme mekanizmasını zorlamaz.
- Güncelleme ekranını yalnız kullanıcı eylemiyle ve aktif mesaj kampanyası yokken açar; son onay Tampermonkey'dedir.

## Hızlı kullanım

1. Etsy'de bir müşteri konuşmasını açın.
2. Panelde Türkçe cevabınızı yazın.
3. **Sadece Çevir**, **AI ile Düzenle** veya **AI Cevap Önersin** seçeneklerinden birini kullanın.
4. Oluşan metni okuyup gerekiyorsa düzenleyin.
5. **Etsy'ye Aktar** düğmesinden sonra Etsy'nin kendi **Gönder** düğmesiyle son onayı verin.

Panel mesaj sayfasında varsayılan olarak kapalıdır. Google Translate varsayılan sağlayıcıdır ve otomatik çeviri önizlemesi açıktır; panel konuşma listesinde açıldığında görünür mesaj önizlemelerini, tekil konuşmada açıldığında son müşteri mesajını seçili çeviri sağlayıcısına gönderebilir. Hızlı görüntüleme dili seçimi görünür liste önizlemelerini yeni hedef dil için yeniden çevirir. Bu aktarımı istemiyorsanız paneli kapalı tutun ya da açmadan önce Tampermonkey menüsündeki Makaytron ayarlarından otomatik önizlemeyi kapatın. Diğer AI ve çeviri özellikleri kullanıldığında ilgili metin seçilen üçüncü taraf sağlayıcıya gönderilir. API anahtarları Tampermonkey depolamasında tutulur; ayrı anahtar ve sağlayıcı tarafında harcama limiti kullanılması önerilir.

## Psödonimleştirilmiş kullanım telemetrisi

Telemetri ilk kullanımda görünür bildirimle varsayılan açıktır ve Ayarlar'dan tek tıkla kapatılabilir; kapatma sunucudaki bu userscripte ait kaydın silinmesini ister. Yalnız günlük açılma, başarılı taslak/çeviri üretimi ve kategorize hata sayaçları gönderilir. Ham hata metni, müşteri mesajı, taslak/çeviri metni, ad, sipariş/konuşma kimliği, URL veya API anahtarı gönderilmez. Ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.

## Destek ve güvenlik

API anahtarı, müşteri mesajı, sipariş bilgisi veya oturum verisi paylaşmayın. Bildirim kuralları için depo kökündeki [SUPPORT.md](../../SUPPORT.md) ve [SECURITY.md](../../SECURITY.md) belgelerini okuyun.
