<p align="center">
  <img src="../../assets/makaytron-logo.png" width="96" alt="Makaytron logosu">
</p>

# Makaytron Etsy Message Assistant

<p><strong>Türkçe</strong> · <a href="./README.en.md">English</a></p>

Etsy mesajlarını Türkçe önizlemek, Türkçe cevabı müşterinin diline çevirmek, AI destekli taslak hazırlamak ve teslim edilmiş siparişlerde kontrollü mesaj akışı yürütmek için Tampermonkey userscripti.

Script standalone çalışır; diğer Etsy Automation Tools paketlerinin kurulması gerekmez.

**Sürüm:** 1.0.2 · [Değişiklik günlüğü](./CHANGELOG.md) · [Ana depo](../../README.md)

## Kurulum

1. Güncel Chrome, Edge veya Brave ile [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Userscript dosyasını açın](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js).
3. Tampermonkey kurulum ekranında izinleri inceleyip **Yükle** düğmesine basın.
4. Etsy Mesajlar veya desteklenen Shop Manager sayfasını açıp yenileyin.
5. Makaytron panelindeki **Ayarlar** bölümünden kullanacağınız çeviri veya AI sağlayıcısını yapılandırın.

## Özellikler

- Etsy müşteri mesajını Türkçe önizler.
- Türkçe cevabı müşterinin diline çevirir.
- OpenAI, Anthropic Claude, Google Gemini, DeepSeek ve OpenRouter için kullanıcıya ait API profillerini destekler.
- Şablonlar, değişkenler, geçmiş ve teslim edilmiş siparişler için kontrollü mesaj sırası sunar.
- Mesaj Etsy alanına aktarıldıktan sonra gönderimi varsayılan olarak kullanıcıya bırakır.
- Ayarları ve sağlayıcı profillerini script güncellemesinde korur.
- Canonical GitHub kurulumunda yeni sürümü `@version` satırından en fazla 24 saatte bir kontrol eder; farklı dağıtım kaynağının güncelleme mekanizmasını zorlamaz.
- Güncelleme ekranını yalnız kullanıcı eylemiyle ve aktif mesaj kampanyası yokken açar; son onay Tampermonkey'dedir.

## Hızlı kullanım

1. Etsy'de bir müşteri konuşmasını açın.
2. Panelde Türkçe cevabınızı yazın.
3. **Sadece Çevir**, **AI ile Düzenle** veya **AI Cevap Önersin** seçeneklerinden birini kullanın.
4. Oluşan metni okuyup gerekiyorsa düzenleyin.
5. **Etsy'ye Aktar** düğmesinden sonra Etsy'nin kendi **Gönder** düğmesiyle son onayı verin.

Google Translate varsayılan sağlayıcıdır; otomatik Türkçe önizleme de varsayılan olarak açıktır. Bu nedenle mesaj sayfası açıldığında son müşteri mesajı Google Translate'e otomatik gönderilebilir. İstemiyorsanız mesaj sayfasına gitmeden önce Tampermonkey menüsündeki Makaytron ayarlarından bu seçeneği kapatın. Diğer AI ve çeviri özellikleri kullanıldığında ilgili metin seçilen üçüncü taraf sağlayıcıya gönderilir. API anahtarları Tampermonkey depolamasında tutulur; ayrı anahtar ve sağlayıcı tarafında harcama limiti kullanılması önerilir.

## Psödonimleştirilmiş kullanım telemetrisi

Telemetri ilk kullanımda görünür bildirimle varsayılan açıktır ve Ayarlar'dan tek tıkla kapatılabilir; kapatma sunucudaki bu userscripte ait kaydın silinmesini ister. Yalnız günlük açılma, başarılı taslak/çeviri üretimi ve kategorize hata sayaçları gönderilir. Ham hata metni, müşteri mesajı, taslak/çeviri metni, ad, sipariş/konuşma kimliği, URL veya API anahtarı gönderilmez. Ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.

## Destek ve güvenlik

API anahtarı, müşteri mesajı, sipariş bilgisi veya oturum verisi paylaşmayın. Bildirim kuralları için depo kökündeki [SUPPORT.md](../../SUPPORT.md) ve [SECURITY.md](../../SECURITY.md) belgelerini okuyun.
