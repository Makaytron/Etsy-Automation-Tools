# Makaytron Etsy Message Assistant kullanım rehberi

<p><strong>Türkçe</strong> · <a href="./USAGE.en.md">English</a></p>

Message Assistant; bireysel Etsy konuşmalarında çeviri/taslak hazırlama, teslim edilen siparişler için kontrollü mesaj sırası ve mağaza yorumları için cevap taslağı sunar. Bu üç akışın sayfa ve gönderim sınırları farklıdır.

## Desteklenen sayfalar

| İş akışı | Etsy sayfası |
|---|---|
| Bireysel müşteri cevabı | `/messages*` veya `/conversations*` |
| Teslim edilen sipariş mesajları | `/your/orders/sold*` |
| Yorum analizi ve cevap taslağı | Shop Manager dashboard üzerindeki **Reviews** görünümü |

Script doğrulanamayan bir dashboard bağlamında gönderim yapmaz; uygun sayfa hazır olana kadar bekler.

## Kurulum ve ilk ayar

1. [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Message Assistant userscript dosyasını](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js) açıp kurulumu onaylayın.
3. Tampermonkey menüsünden **Makaytron Ayarları**nı açın.
4. Varsayılan çeviri motorunu seçin; kullanacaksanız DeepL veya AI sağlayıcısı, model ve API anahtarını kaydedip test edin.
5. Gerekirse şablonları, imzayı ve cevap tercihlerini düzenleyin.

> **Gizlilik uyarısı:** Google Translate varsayılan sağlayıcıdır ve otomatik Türkçe önizleme varsayılan olarak açıktır. Bir konuşma açıldığında son müşteri mesajı Google Translate'e gönderilebilir. DeepL hatasında, **Ücretsiz fallback** açıkken çeviri Google'a düşebilir. Teslimat sırası da otomatik önizleme kapalı olsa bile hedef dili belirlemek için son mesajı seçili çeviri sağlayıcısına gönderebilir. Bu aktarımları istemiyorsanız mesaj sayfasını veya sırayı açmadan önce **Makaytron Ayarları**ndaki sağlayıcı, otomatik önizleme ve fallback tercihlerini kontrol edin.

AI taslak/düzenleme isteği; müşteri adı, konuşma ve sipariş kimlikleri, ürün başlığı, mağaza adı/imzası, son 10 mesaja kadar konuşma bağlamı ile taslak, şablon veya talimatı seçtiğiniz AI sağlayıcısına gönderebilir. Sağlayıcının gizlilik ve saklama koşullarını inceleyin.

## Bireysel müşteri mesajı

1. Etsy'de doğru müşteri konuşmasını açın.
2. **Müşterinin Mesajı** bölümünü ve gerekiyorsa **Türkçe Göster** sonucunu okuyun.
3. Türkçe cevabınızı yazın veya **Hazır mesaj ekle…** listesinden bir şablon seçin.
4. İhtiyacınıza göre bir işlem kullanın:
   - **Sadece Çevir:** Yazdığınız cevabı müşterinin diline çevirir.
   - **AI ile Düzenle:** Mevcut taslağı seçili AI sağlayıcısıyla iyileştirir.
   - **AI Cevap Önersin:** Konuşma bağlamından yeni bir cevap taslağı üretir.
5. **Gönderilecek Mesaj** metnini okuyun; gerekiyorsa düzenleyin, yeniden hazırlayın veya kopyalayın.
6. **Etsy'ye Aktar** düğmesine basın.
7. Etsy mesaj alanına aktarılan metni son kez kontrol edin ve Etsy'nin kendi **Gönder** düğmesine siz basın.

**Etsy'ye Aktar** normal bireysel akışta mesajı göndermez; yalnız composer alanını doldurur. Konuşma kullanıcı/kimlik bağlamı taslak hazırlandıktan sonra değişirse eski taslak güvenli biçimde reddedilir.

## Teslim edilen siparişler için mesaj sırası

1. Etsy **Completed Orders** sayfasında **Teslim Edilenler** görünümünü açın.
2. Yalnız gerçekten `Delivered` olarak işaretlenen uygun siparişleri seçin.
3. Kullanılacak şablonu ve yöntemi seçip önizlemeyi inceleyin.
4. **Seçilenlere Mesaj Hazırla** ile kontrollü sırayı oluşturun.
5. Varsayılan **Otomatik Gönderim** kapalıyken script sıradaki konuşmayı açar ve mesajı Etsy alanına yerleştirir; gönderimden önce siz inceler ve Etsy **Gönder** düğmesine basarsınız.
6. Gönderim balonu doğrulanırsa varsayılan açık **Doğrulama Sonrası Sıradaki** ayarı sıradaki kayda otomatik geçer. Bu ayarı kapattıysanız siparişler sayfasında **Sırayı Devam Ettir** kullanın. Gerektiğinde **Atla ve Sonraki** ya da **Durdur** kullanın.

> **Canlı gönderim uyarısı:** **Otomatik Gönderim** seçeneğini açıkça açarsanız script Etsy **Gönder** düğmesini otomatik tıklayabilir. Bu ayar canlı gönderim yetkisidir. Sonuç doğrulanamazsa kayıt beklemede kalır; script körlemesine tekrar göndermez ve **Gönderildi / Gönderilmedi** uzlaştırması ister.

## Yorum cevabı taslağı

1. Shop Manager dashboard'da **Reviews** filtresini ve yorum kartlarını açın.
2. İlgili kartta **TR Gör** ile çeviriyi inceleyin.
3. **AI Analiz ve Taslak Hazırla** ile özel not ve public cevap taslağı oluşturun.
4. Özel notu kopyalayabilir; public taslağı **Etsy Alanına Aktar** ile Etsy cevap alanına doldurabilirsiniz.
5. Public cevabı okuyup Etsy'nin kendi yayınlama kontrolünü kendiniz kullanın.

Yorum cevabı otomatik yayımlanmaz.

## Şablonlar, API anahtarları ve yedek

- Şablonları paneldeki **Şablonlar** bölümünden ekleyin/düzenleyin; hazır metinleri **Hazır mesaj ekle…** listesinden kullanın.
- `/tesekkur` veya `/teslim` benzeri değerler şablon metadata'sıdır; mesaj alanına yazılan slash komutlarını otomatik çalıştırmaz.
- API anahtarları Tampermonkey yerel depolamasında tutulur. Ayrı bir sağlayıcı anahtarı ve harcama limiti kullanın.
- Config yedeklerini hassas veri kabul edin ve paylaşmadan önce içeriğini denetleyin. Sağlayıcı ayarlarına ve script sürümüne bağlı olarak yedek, DeepL anahtarı dahil API anahtarları içerebilir; paylaşmadan önce bunları çıkarın.
- Message Assistant'ın global klavye kısayolu yoktur. Panel, ayarlar, config yedeği ve güncelleme kontrolü Tampermonkey menüsündedir.
- Sınırlı psödonimleştirilmiş kullanım telemetrisi görünür ilk kullanım bildirimiyle varsayılan açıktır. Ayarlar'dan kapatmak bu userscripte ait sunucu kaydının silinmesini ister; ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.

## Sorun durumunda

- Yanlış konuşma veya müşteri algılanırsa taslağı aktarmayın; doğru konuşmayı açıp yeniden hazırlayın.
- Aktarım sonrası Etsy alanını ve alıcıyı her zaman kontrol edin.
- Doğrulanamayan toplu gönderimi yeniden başlatmadan önce konuşmada mesaj balonunu arayın.
- Aktif mesaj sırası varken güncelleme kurulumu engellenir.
- Issue veya ekran görüntüsünde müşteri mesajı, ad, sipariş kimliği, API anahtarı, çerez ya da oturum verisi paylaşmayın.

[Paket README'si](./README.md) · [Değişiklik günlüğü](./CHANGELOG.md) · [Gizlilik](../../PRIVACY.md) · [Destek](../../SUPPORT.md)
