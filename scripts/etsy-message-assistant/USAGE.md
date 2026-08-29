# Makaytron Etsy Message Assistant kullanım rehberi

<p><strong>Türkçe</strong> · <a href="./USAGE.en.md">English</a></p>

Message Assistant; bireysel Etsy konuşmalarında çeviri/taslak hazırlama, teslim edilen siparişler için kontrollü mesaj sırası ve mağaza yorumları için cevap taslağı sunar. Bu üç akışın sayfa ve gönderim sınırları farklıdır.

## Sayfa, sekme ve işlem haritası

| Etsy bağlamı | Panel sekmesi | Kullanılabilen işlem |
|---|---|---|
| `/messages` veya `/messages/all` konuşma listesi | **Mesajlar** | Etsy DOM'undaki güvenli konuşma listesi, ad/önizleme/okunmadı bilgisi, görüntüleme dili ve doğrulanmış **Aç** işlemi; taslak ve aktarım kontrolleri gizlidir. |
| `/messages/<conversation-id>` ve doğrulanmış tek composer | **Mesajlar** | Mesaj önizleme/çeviri, Türkçe taslak, AI, şablon, kopyalama ve yalnız composer'a **Etsy'ye Aktar**. |
| `/your/orders/sold/completed` | **Teslim Edilenler** | Delivered kartlarını tara, yorum uygunluğunu işaretle, alıcı seç ve kontrollü sıra oluştur. |
| New, open veya başka bir `/your/orders/sold*` görünümü | **Teslim Edilenler** | Üretim kontrolü yok; **Completed Orders** sayfasına yönlendirme. |
| `/your/shops/<shop>/dashboard/activity` üzerindeki **Reviews** filtresi | **Yorumlar** | Metinli yeni/güncellenmiş yorumları tara, çevir/analiz et ve public cevap alanına taslak aktar. |
| `/dashboard/activity` üzerinde başka bir aktivite filtresi | **Yorumlar** | Üretim kontrolü yok; **Reviews** filtresini seçme yönlendirmesi. |
| Başka veya desteklenmeyen bir Shop Manager sayfası | **Doğrudan işlem yok** | Mesajlar, Completed Orders ve Recent activity sayfalarına güvenli geçiş bağlantıları. |
| Desteklenen tüm Etsy sayfaları | **Şablonlar / Geçmiş / Ayarlar** | Bağlamdan bağımsız yerel yönetim; sayfa değişiminde açık utility sekmesi ve kaydedilmemiş taslak korunur. |

Script tek ve görünür bir konuşma composer'ı, tamamlanmış sipariş görünümü veya yorum kartı doğrulayamazsa güvenli biçimde işlem göstermeyi bırakır. Panel varsayılan olarak kapalıdır; yalnız kullanıcı açar. **Mesaj Sayfasında Otomatik Aç** ayrıca etkinleştirilirse, bu tercih de yalnız doğrulanmış tek konuşma composer'ında uygulanır.

Konuşma listesi yalnız Etsy sayfasında o anda görünür olan güvenli bağlantıları okur ve en fazla 50 satır gösterir. **Görüntüleme dili** seçimi kalıcıdır. Çevrilmiş metin panelde gösterilir; Etsy DOM'u değiştirilmez ve özgün önizleme **Orijinal mesajı göster** altında korunur. DeepL seçili dil için destek sunmuyorsa panel bunu açıkça bildirir; yalnız **Ücretsiz fallback** etkinse Google yedeğine geçer.

## Kurulum ve ilk ayar

1. [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Message Assistant userscript dosyasını](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-message-assistant/Makaytron-Etsy-Message-Assistant.user.js) açıp kurulumu onaylayın.
3. Tampermonkey menüsünden **Makaytron Ayarları**nı açın.
4. Varsayılan çeviri motorunu seçin; kullanacaksanız DeepL veya AI sağlayıcısı, model ve API anahtarını kaydedip test edin.
5. Gerekirse şablonları, imzayı ve cevap tercihlerini düzenleyin.

> **Gizlilik uyarısı:** Panel mesaj sayfasında varsayılan olarak kapalıdır. Google Translate varsayılan sağlayıcıdır ve otomatik Türkçe önizleme ayarı varsayılan olarak açıktır. Panel konuşma listesinde açıldığında, görünür önizlemelerden en fazla 50'sini seçili çeviri sağlayıcısına en fazla üç eşzamanlı istekle gönderebilir; önbellekteki sonuçlar önce kullanılır. Otomatik önizleme kapalıysa liste açılışı çeviri isteği yapmaz. **Görüntüleme dili**ni değiştirmek veya **Önizlemeleri çevir / Yeniden dene** işlemini kullanmak görünür önizlemelerin çevirisini açıkça başlatır. Tek konuşmadaki önizleme de paneli **Asistan · Aç** ile açtığınızda veya **Mesaj Sayfasında Otomatik Aç** tercihini ayrıca etkinleştirdiğinizde son müşteri mesajını sağlayıcıya gönderebilir. DeepL hatasında, **Ücretsiz fallback** açıkken çeviri Google'a düşebilir. Yorum talebi dışındaki teslimat şablonları da otomatik önizleme kapalı olsa bile hedef dili belirlemek için son mesajı seçili çeviri sağlayıcısına gönderebilir. Özel yorum-talebi şablonu bu dil algılama aktarımını atlar; AI yöntemi ayrıca seçilirse aşağıda açıklanan bağlam yine AI sağlayıcısına gidebilir. Bu aktarımları istemiyorsanız paneli veya sırayı açmadan önce **Makaytron Ayarları**ndaki sağlayıcı, otomatik önizleme ve fallback tercihlerini kontrol edin.

AI taslak/düzenleme isteği; müşteri adı, konuşma ve sipariş kimlikleri, ürün başlığı, mağaza adı/imzası, son 10 mesaja kadar konuşma bağlamı ile taslak, şablon veya talimatı seçtiğiniz AI sağlayıcısına gönderebilir. Sağlayıcının gizlilik ve saklama koşullarını inceleyin.

## Bireysel müşteri mesajı

1. Etsy'de doğru müşteri konuşmasını açın.
2. Sağ üstteki **Asistan · Aç** kontrolüyle paneli açın. Bu kontrol sayfada kalır; panel kendiliğinden ekranın ortasına gelmez.
3. **Müşterinin Mesajı** bölümünü ve gerekiyorsa **Türkçe Göster** sonucunu okuyun.
4. Türkçe cevabınızı yazın veya **Hazır mesaj ekle…** listesinden bir şablon seçin.
5. İhtiyacınıza göre bir işlem kullanın:
   - **Sadece Çevir:** Yazdığınız cevabı müşterinin diline çevirir.
   - **AI ile Düzenle:** Mevcut taslağı seçili AI sağlayıcısıyla iyileştirir.
   - **AI Cevap Önersin:** Konuşma bağlamından yeni bir cevap taslağı üretir.
6. **Gönderilecek Mesaj** metnini okuyun; gerekiyorsa düzenleyin, yeniden hazırlayın veya kopyalayın.
7. **Etsy'ye Aktar** düğmesine basın.
8. Etsy mesaj alanına aktarılan metni son kez kontrol edin ve Etsy'nin kendi **Gönder** düğmesine siz basın.

**Etsy'ye Aktar** normal bireysel akışta mesajı göndermez; yalnız composer alanını doldurur. Konuşma kullanıcı/kimlik bağlamı taslak hazırlandıktan sonra değişirse eski taslak güvenli biçimde reddedilir.

## Teslim edilen siparişler için mesaj sırası

1. Etsy **Completed Orders** sayfasında **Teslim Edilenler** görünümünü açın.
2. Her siparişin **Yorum Kontrolü** alanında durumu seçin. **Yorum yok — kuyruğa uygun** seçimi siparişi uygun olarak işaretleyip seçer; bu manuel doğrulama iki saat geçerlidir. Gerçek kalıcı sıra 4. adımda oluşturulur. **Yorum var**, **Ertele** veya **İletişim istemiyor / sorun var** seçenekleri yorum talebini engeller.
3. Yorum istemek için varsayılan **Yorum rica — küçük işletme (EN)** şablonunu seçip önizlemeyi inceleyin. Müşteriye İngilizce giden metin dürüst bir yorum rica eder; belirli bir puan, olumlu yorum veya teşvik istemez. Daha önce doğruladığınız uygun siparişleri **Onaylıları Seç** ile birlikte seçebilirsiniz.
4. **Seçilenlere Mesaj Hazırla** ile kontrollü sırayı oluşturun. Aynı sipariş için kuyrukta, hazırlanmış, doğrulama bekleyen veya gönderilmiş bir `review_request` kaydı varsa ikinci talep oluşturulmaz.
5. Script sıradaki konuşmayı açar ve mesajı Etsy alanına eksiksiz yerleştirir. Metni kontrol edin veya Etsy kutusunda düzenleyin; ardından paneldeki **Gönder ve Sonrakine Geç** düğmesine bir kez basın.
6. Script bu kullanıcı tıklamasından sonra Etsy **Gönder** düğmesini tetikler. Yeni outgoing mesaj balonu doğrulanırsa kayıt `gönderildi` olur ve sıradaki konuşma açılır. Doğrulama başarısız veya belirsizse ilerlemez; **Gönderildi / Gönderilmedi** uzlaştırması ister. **Gönderilmedi**, daha yeni uygunluk kararlarını koruyarak taslağı güvenli bir yeniden deneme için hazırlar. Gerektiğinde **Atla ve Sonraki** ya da **Durdur** kullanın.

> **Canlı gönderim uyarısı:** Global **Otomatik Gönderim** seçeneği başka teslimat şablonlarında canlı gönderim yetkisidir. `review_request` akışında bu ayar uygulanmaz; her alıcının gönderimi yalnız sizin **Gönder ve Sonrakine Geç** tıklamanızla başlar.

> **Resmî olmayan entegrasyon uyarısı:** Bu userscript Etsy tarafından onaylanmış değildir. Etsy [API Koşulları](https://www.etsy.com/legal/api/), Etsy verisine erişen, veriyi analiz eden veya tarayan otomatik sistemler ve tarayıcı uzantıları için açık yazılı yetki arar. Her alıcı için kullanıcı tıklaması bir güvenlik sınırıdır; Etsy yetkisinin kanıtı değildir.

> **Yorum durumu sınırı:** Etsy Completed Orders kartı, scriptin sipariş ile yorumu güvenilir biçimde eşleştirebileceği bir kimlik sunmuyor. Bu nedenle **Yorum yok** kararını siz verirsiniz; **Onaylıları Seç** yalnız bu yerel, süresi dolmamış kararları seçer. Script isim veya ürün başlığıyla tahmin yürütmez.

> **Güncelleme koruması:** Eski bir `gönderildi` kaydı önceki mesajın yorum talebi olup olmadığını kanıtlayamıyorsa alan belirsiz görünür ve sipariş kilitli kalır. Etsy konuşmasını inceleyin; yalnız gerçekten doğruysa **Önceki mesaj yorum talebi değildi — onayla** seçeneğini seçin. Doğrulayamıyorsanız siparişi kilitli bırakın.

## Merkezi Mesaj Paneli Agent güvenliği

- Agent yalnız URL'si ile bildirilen konuşma kimliği birebir eşleşen işleri kabul eder. Aynı iş kimliği farklı konuşma veya metinle yeniden kullanılırsa Etsy composer'ına dokunmadan durur.
- Aynı konuşma aktif teslimat kampanyası tarafından sahiplenilmişse Message Center gönderimi ertelenir; iki akış aynı Gönder düğmesi için yarışmaz.
- Composer'da size ait herhangi bir taslak varsa — agent mesajıyla birebir aynı olsa bile — Message Center taslağa dokunmaz ve göndermez.
- Agent işi, exact SHA-256 gönderim ledger'ı ve terminal sonuç zarfı kalıcılaşmadan güvenli aşamayı ilerletmez. Sunucu cevabı kaybolursa Etsy'ye yeniden tıklamak yerine yalnız aynı sonuç zarfını yeniden bildirir.
- Native Etsy gönderimi doğrulandıktan sonra yerel durum/günlük işlemleri tamamlanana kadar sekmeler arası kalıcı kilit korunur. Aynı mesaj için güvenilir native receipt bulunursa Message Center bunu sahiplenir ve ikinci kez göndermez.
- Bilinmeyen, bozuk veya gelecekte eklenmiş gönderim aşamaları otomatik olarak silinmez; bütün gönderim yollarını durduran manuel inceleme kaydına çevrilir.
- Etsy'nin Gönder tıklaması, form submit'i ve Ctrl/Command+Enter kısayolu aynı güvenli doğrulama yolundan geçer. Aynı formdaki başka bir submit düğmesi mesaj göndermeye yönlendirilmez.
- Giden mesaj balonu kesin doğrulanamazsa iş `ambiguous` olarak kilitlenir ve otomatik olarak tekrar tıklanmaz. İlgili konuşmayı bu sekmede açın, Etsy'deki son balonu gözle kontrol edin ve **Ayarlar → Merkezi Mesaj Paneli Agent** altında yalnız gerçek sonucu **Gönderildi** veya **Gönderilmedi** olarak seçin.
- Belirsiz sonucu çözmeden aynı mesajı yeniden göndermeyin. URL doğru görünse bile panel butonları hydrate edilmiş DOM konuşma kimliği de eşleşmeden etkinleşmez.

## Yorum cevabı taslağı

1. Shop Manager dashboard'da **Reviews** filtresini ve yorum kartlarını açın.
2. İlgili kartta **TR Gör** ile çeviriyi inceleyin.
3. **AI Analiz ve Taslak Hazırla** ile özel not ve public cevap taslağı oluşturun.
4. Özel notu kopyalayabilir; public taslağı **Etsy Alanına Aktar** ile Etsy cevap alanına doldurabilirsiniz.
5. Public cevabı okuyup Etsy'nin kendi yayınlama kontrolünü kendiniz kullanın.

Yorum cevabı otomatik yayımlanmaz.

## Şablonlar, API anahtarları ve yedek

- Şablonları paneldeki **Şablonlar** bölümünden ekleyin/düzenleyin; hazır metinleri **Hazır mesaj ekle…** listesinden kullanın.
- `/tesekkur`, `/teslim` veya `/yorumrica` benzeri değerler şablon metadata'sıdır; mesaj alanına yazılan slash komutlarını otomatik çalıştırmaz.
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
