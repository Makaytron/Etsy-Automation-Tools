# Makaytron Etsy Listing Analyzer

<p><strong>Türkçe</strong> · <a href="./README.en.md">English</a></p>

**Sürüm:** 1.0.5 · [Değişiklik günlüğü](./CHANGELOG.md) · [Ana depo](../../README.md)

**Kullanım rehberi:** [Türkçe](./USAGE.md) · [English](./USAGE.en.md)

Etsy Shop Manager listing kartlarındaki görünür performans verilerini ayrı bir API anahtarı veya OAuth bağlantısı istemeden okuyan; Health Engine ile yerel geçmişi değerlendiren ve listing bazında kullanıcı onaylı iyileştirme kuyruğu hazırlayan Tampermonkey userscriptidir.

## Arayüz galerisi

Aşağıdaki her görsel yalnız userscript öğesinden alınmıştır. Etsy sayfası, yerine konmuş başka bir site veya tarayıcı arka planı içermez.

| Genel bakış | Listing analizi |
|---|---|
| ![Sentetik Listing Analyzer genel bakışı](../../assets/screenshots/listing-analyzer-overview-panel.png) | ![Sentetik Listing Analyzer analizi](../../assets/screenshots/listing-analyzer-analysis-panel.png) |

| AI önerileri | İşlem kuyruğu |
|---|---|
| ![Sentetik Listing Analyzer AI önerileri](../../assets/screenshots/listing-analyzer-ai-proposals-panel.png) | ![Sentetik Listing Analyzer işlem kuyruğu](../../assets/screenshots/listing-analyzer-action-queue-panel.png) |

![Sentetik Listing Analyzer analiz eşikleri](../../assets/screenshots/listing-analyzer-threshold-settings-modal.png)

## Neler yapar?

- Saf siyah, beyaz ve nötr gri Makaytron yüzeylerini kullanan; yalnız anlam taşıyan artış/düşüş, yaşam döngüsü rozeti ve aktivite çizgisinde semantik renk kullanan açılır/kapanır premium kart çalışma alanı, standart toast bildirimleri ve kalıcı TR/EN dil seçimi sunar.
- Listing bağlantısından ID’yi çıkarır ve karttaki başlık, SKU, stok, fiyat, yenileme/bitiş metni, son 30 gün ziyaret/favori, tüm zamanlar satış/gelir/yenileme değerlerini okur; gerçek aktif/taslak/süresi dolmuş/tükenmiş/pasif durumunu Etsy’nin durum filtresinden ayrı doğrular.
- **Tüm sayfaları tara** düğmesi veya `Ctrl + Alt + A` ile Etsy listing sayfalarını 1’den son sayfaya kadar sırayla toplar, ardından yeniden 1. sayfaya döner ve analiz kartlarını yalnız bu dönüş tamamlanınca gösterir. Her sayfada numaralandırma ve kart sayısını doğrular; yalnız listing kartının istatistik satırlarını okur ve aynı eksiksiz içeriği art arda üç kez görmeden kaydetmez. Eksik metrik, yinelenen/örtüşen sayfa veya geçici DOM karışımında analiz açılmaz. Geçici kart/yükleme ve sayfa geçişi hatalarını artan bekleme ile üç kez dener; sonuç alamazsa sayfa, aşama, deneme ve teknik sayaçları içeren güvenli bir ayrıntılı rapor üretir. Aynı düğme taramayı durdurur ve kaldığı yerden devam ettirir.
- Son tamamlanan tüm-sayfa taraması veya taramadaki en eski sayfa 24 saati doldurduğunda **Listing analizleri** eski kartları göstermez ve kendiliğinden tarama başlatmaz. Taramanın seller-nav içindeki doğrulanmış public mağaza kimliği, güncel Etsy kapsamı ve sayfa sayısıyla da eşleşmesi gerekir; mağaza kimliği doğrulanamazsa tarama güvenli biçimde başlamaz. Ortadaki **Analizi başlat** düğmesi veya hemen altında gösterilen `Ctrl + Alt + A` kısayolu yeni tam taramayı kullanıcı kararıyla başlatır; tamamlanınca kartlar açılır.
- Arama; kayıt kapsamı, yaşam döngüsü, sorun/fırsat, öneri, son 30 günlük performans, değişim, stok ve veri güveni filtreleri; her seçenekte bağlama göre sonuç adedi, altı hazır preset, en fazla sekiz özel preset, öncelik/30 günlük erişim-ilgi/ziyaret/tüm-zaman satış-gelir/güven sıralaması ve sonuç sayacı sunar. Büyük mağazalarda kartlar 40’lık gruplarla yüklenir.
- Panel ve modal başlığındaki Makaytron logosu `makaytron.com` adresini güvenli biçimde yeni sekmede açar.
- Aynı günkü snapshotı günceller; yeni okumada eksik kalan metriği önceki değerden taşıyıp güncelmiş gibi göstermez. Listing başına en fazla 120 snapshotı ve en fazla 400 günlük geçmişi yerel Tampermonkey alanında tutar.
- Health Engine değerlendirme bağlamında yaşam döngüsünü, performans hipotezini, güven düzeyini, karar kanıtlarını ve sonraki inceleme zamanını birlikte ele alır.
- İlk eksiksiz taramada güncel ziyaret/favori ile tüm-zaman satış/gelir/yenileme kanıtlarını ayrı zaman ölçeklerinde değerlendirir. İki veya daha fazla yenilemeye rağmen satış, gelir ve favorisi olmayan listingi **Yenileme verimsizliği** olarak iyileştirme önceliğine alır; satış veya gelir kanıtı olan listingi riskli toplu değişikliklerden korur. Bu anlık değerlendirme büyüme, düşüş veya deaktivasyon kararı değildir.
- Yeterli ve karşılaştırılabilir kayıt bulunduğunda yalnız güncel, tamamlanmış taramadaki listinglerden mağaza içi karşılaştırma grubu (cohort) kurar; eski, anomalili veya tarama dışı kayıtları emsal yapmaz. Örneklem zayıfsa sonuç düşük güvenli veya belirsiz kalır.
- Geçmiş ayrıntısında ziyaret, favori, satış, gelir ve yenileme için erişilebilir inline SVG değişim grafikleri gösterir; eksik değerleri sıfıra dönüştürmez.
- İyileştirme önerilerini, başlangıç snapshotını ve doğrulanmış yayınlama sonucunu kaydeder; planlama, yayınlama, gözlem, değerlendirme tarihi ve sonucu ayrı olaylarla gösteren deney zaman çizelgesi oluşturur.
- Seçili listingler için gerçek listing ID’lerini dışarı vermeyen `L001` benzeri geçici referanslarla AI istek JSON’u oluşturur.
- Doğrulanmış AI yanıt JSON’unu başlık, açıklama, etiket ve materyal önerisine dönüştürür; yalnız değişmesi istenen alanlar için **Önce / AI önerisi / Doğrulanan sonuç** karşılaştırması gösterir.
- Tam olarak bir listing seçildiğinde isteğe bağlı **Marketplace Insights ile araştır** akışını başlatır. Ayrı **Etsy Keyword & Market Analyzer** yüklüyse opaque `L001` referansı ve içerik özetiyle araştırmayı teslim eder; doğrulanan 30 günlük arama, arama sonucu/rekabet göstergesi ve Makaytron türetilmiş fırsat puanını başlık/etiket önerisinin yanında gösterir.
- Listing düzenleme sayfasında öneriyi Etsy formuna uygular; kullanıcı inceleyip her listing için ayrıca onay vermeden `Publish changes` düğmesine basmaz.
- Deaktivasyon için yalnız Etsy seçenek menüsünü açıp Deactivate öğesine odaklanır. Deactivate ve Etsy final onayını kullanıcı tıklar; script sonucu görmeden kuyruğu ilerletmez.
- Yerel JSON yedeği indirir; içe aktarmada dosya boyutunu ve şemayı doğrular, listing/özel preset özetini yazmadan önce gösterir ve ancak açık kullanıcı onayından sonra mevcut verilerle birleştirir. Özel filtre presetleri yedekle taşınır; eski işlem kuyruğu güvenlik nedeniyle etkinleştirilmez. Yerel analiz verileri de yalnız açık kullanıcı onayından sonra temizlenebilir.
- Tahmini yerel veri kullanımını gösterir. Depolama sınırına yaklaşma veya kota kaynaklı yazma reddinde toplu akışı tamamlanmış saymadan durdurur; yedek alma ve eski verileri azaltma yönlendirmesi sunar.
- TR/EN görünümlerinde aynı etkileşim yapısını ve anlaşılır erişilebilir adları korur; dil bilgisini uygulama köküne işler. Klavye odağını görünür tutar, modal odağını içeride sınırlar, `Escape` ile kapatır ve odağı açan kontrole geri verir.
- Tam mağaza taramasındaki okunabilir dağılımlardan mağazaya özel analiz eşikleri önerir; yeterli örneklem yoksa öneri üretmez, sonuç etkisini önizler ve hiçbir öneriyi kendiliğinden uygulamaz.
- Devam eden bir iyileştirme deneyiyle yeni değişiklik çakıştığında uyarı ve açık tercih ister; iptal edilen çakışma eski deneyi korur ve yayınlama yapmaz.
- Geçersiz AI JSON’unda hatalı alanın kesin yolunu ve beklenen veri türünü gösterir, örnek JSON sunar ve bütün yanıt doğrulanmadan hiçbir öneriyi yazmaz.
- Kesilmiş veya sonucu doğrulanamamış işlem kuyruğunu ayrı kurtarma ekranında gösterir; güvenli inceleme ya da durdurma seçenekleri sunar ve olası Etsy yazmasını otomatik tekrarlamaz.
- Kullanıcı geri bildirimini önce yerel ve gizlilik güvenli biçimde kaydeder. Listing başlığı/ID’si eklemeden hazırlanmış metni kopyalar; canonical GitHub formunu yalnız kullanıcı düğmeye bastığında açar.
- GitHub kaynaklı kurulumlarda en fazla 24 saatte bir public GitHub `main` commit kimliğini ve yalnız o değişmez committeki userscript metadata’sını anonim isteklerle denetler. Ayarlardaki **Güncellemeyi denetle** ve **Tampermonkey’de güncelle** düğmeleri aynı sürümü yeniden çekmeyi de sağlar; tam doğrulanan commit URL’sinin kurulumu daima Tampermonkey onay ekranında tamamlanır. Greasy Fork veya başka bir dağıtım kaynağı algılanırsa o kaynağın güncelleme mekanizması korunur ve özel GitHub akışı zorlanmaz.

Eksik veya okunamayan bir metrik hiçbir zaman `0` kabul edilmez. Böyle bir listing için deaktivasyon ya da iyileştirme kararı üretilmez.

## Health Engine

Health Engine yalnız Etsy Shop Manager listing kartında görünür olan başlık, SKU, stok, fiyat, durum, son 30 gün ziyaret/favori ve tüm zamanlar satış/gelir/yenileme değerleriyle çalışır. Etsy API'sine, mağaza dışı benchmark verisine veya harici bir toplama servisine bağlanmaz. Snapshotlar yalnız kullanıcı **Bu sayfayı tara**, **Tüm sayfaları tara** veya tam taramayı başlatan **Analizi başlat** işlemini kullandığında yerel Tampermonkey alanında oluşur.

Ziyaret ve favori değerleri kayan son 30 günlük pencere; satış, gelir ve yenileme değerleri ise tüm zamanlar toplamıdır. Bu nedenle motor, iki tarama arasındaki bütün metrikleri aynı tür fark gibi yorumlamaz. Kısa aralıklı değişimler erken sinyal sayılır; daha uzun ve yeterli örneklem içeren pencereler daha yüksek güvenle değerlendirilir.

Karttaki **30 günlük erişim/ilgi** puanı yalnız son 30 günlük ziyaret ile favori oranını ölçer; aynı anlamı ilk ve sonraki taramalarda korur. Tüm-zaman satış/gelir kanıtı listingi riskli değişikliklerden koruyabilir, yenilemeler ise verimsizlik önceliği oluşturabilir; bu tarihsel sayaçlar güncel erişim/ilgi puanını yapay olarak yükseltmez. **Geçmiş güveni** karşılaştırmalı zaman serisinin ne kadar hazır olduğunu ayrıca gösterir. İlk taramada geçmiş güveninin düşük olması, eksiksiz okunan sıfır değerlerin “veri yetersiz” sayılması değildir; büyüme/düşüş için 30 günlük, deaktivasyon incelemesi için en az 58 günlük tam geçmiş ve diğer güvenlik kanıtları yine zorunludur.

Health Engine değerlendirmesi tek bir renkli öneriye dayanmaz; aşağıdaki açıklanabilir bağlamları birlikte ele alır:

- **Yaşam döngüsü:** başlangıç verisi toplama, öğrenme, dengeli/yükselen/düşen dönem, deney, pasiflik veya kapatmayı inceleme gibi aşamalar. Kullanılabilir aşama, yerel geçmişin kapsamına bağlıdır.
- **Performans hipotezi:** görünürlük, ziyaret sonrası ilgi veya satın alma aşamasındaki olası zayıflığı işaretler. Bu, görünür metriklerden türetilen bir inceleme hipotezidir; nedensellik iddiası değildir.
- **Güven:** veri kalitesi, geçmiş derinliği, trafik örneklemi, karşılaştırma grubu, güncellik ve tutarlılık dikkate alınır. Eksik veri veya kısa geçmiş kesin bir karar için yeterli sayılmaz.
- **Kanıt ve sonraki inceleme:** mevcut değerler, uygun yerel karşılaştırmalar ve yeni değerlendirme için gereken zaman kararın yanında gösterilmelidir; yeterli kanıt yoksa sonuç belirsiz bırakılır.

Karşılaştırma grubu yalnız aynı mağazada, bu tarayıcıda birikmiş ve anlamlı biçimde karşılaştırılabilen yerel kayıtlardan oluşturulabilir. Yeni değiştirilmiş, deneydeki, pasif, stoksuz veya eksik verili listingler kıyası zayıflatır. Yeterli emsal bulunmadığında cohort sonucu güvenilir bir sinyal gibi sunulmaz. Bu kıyas Etsy geneli pazar verisi değildir.

Kaydedilmiş bir iyileştirme, başlangıç snapshotı ve değiştirilen alanlarla birlikte deney bağlamında karşılaştırılabilir. Başlık/etiket deneyleri ziyaret değişimini, materyal deneyleri favori/ziyaret oranını, açıklama deneyleri ise satış/ziyaret oranını ölçer. Motor 30. gün sonrasındaki ilk snapshotı yalnız yedi günlük tolerans içinde kullanır; daha geç veri kesin sonuç yerine `Belirsiz` kalır. Son 30 gün metrikleri kayan pencere olduğu için değişiklikten sonraki erken kontroller yalnız ön sinyaldir. Aynı listingde üst üste yapılan değişiklikler yorumu zayıflatacağından kontrollü, tek hipotezli ilerleme önerilir.

`Kapatmayı incele` otomatik kapatma emri değildir. Eksik veri, düşük güven, yeni değişiklik veya devam eden deney güvenlik kapısıdır. Adaylık oluşsa bile script yalnız Etsy seçenek menüsünü açıp Deactivate öğesine odaklanır; Deactivate ve Etsy'nin final onayını kullanıcı tıklar.

## Kullanım

1. Userscripti Tampermonkey’e kurun.
2. Etsy Shop Manager’da **Listings** sayfasını ve **Stats** görünümünü açın.
3. Panelde **Tüm sayfaları tara** düğmesine basın veya `Ctrl + Alt + A` kullanın. Script ilk sayfadan son sayfaya kadar ilerler, sonra ilk sayfaya dönüp analiz kartlarını açar; aynı düğmeyle durdurup kaldığınız yerden devam edebilirsiniz. Yalnız açık sayfayı yenilemek için **Bu sayfayı tara** kullanılabilir.
4. Son tamamlanan tarama 24 saati doldurduysa **Listing analizleri** kartları gizler. Ekranın ortasındaki **Analizi başlat** düğmesine basın veya `Ctrl + Alt + A` kullanın; tam tarama tamamlanınca arama ve filtrelerle ilgilendiğiniz ürün grubunu daraltın. Yaşam döngüsü, performans hipotezi, güven, kanıt ve inceleme zamanı bağlamını kontrol edin; yeterli veri yoksa karar vermek yerine yeni snapshot bekleyin.
5. İsteğe bağlı pazar araştırması için tam bir listing seçip **Marketplace Insights ile araştır** düğmesine basın. Insights sekmesi açıldıktan sonra sınırlı capability/READY el sıkışması yapılır; companion bulunursa araştırma teslim edilir ve sonucu Listing Analyzer’da inceleyebilirsiniz. Companion yoksa yalnız bu özellik için İptal/Yükleme sayfasını aç modalı görünür; Listing Analyzer’ın geri kalanı çalışmaya devam eder.
6. Öneriyi iki yoldan hazırlayabilirsiniz. Manuel yolda listing kartındaki **İyileştirme planı**nı açın ve işlemi seçin; **Seçili alanları güncelle** işlemi için değişecek alanları işaretleyip yeni değerleri girin, ardından **Öneriyi kaydet** düğmesine basın. AI yolunda kartları seçin, **AI önerileri** ekranından istek paketini kopyalayın ve doğrulanmış yanıt JSON’unu içe aktarın; geçerli AI önerileri yerelde kaydedilir. Kuyruğa almadan önce öneriyi inceleyip gerekirse düzenleyin.
7. Kartın seçim kutusu önerinin kendisi değildir; yalnız araştırma, AI dışa aktarımı ve kuyruk kapsamını belirler. Kaydedilmiş önerisi bulunan listing kartlarını seçip **Seçilenlerden kuyruk hazırla** düğmesine basın. Önerisi olmayan veya **İşlem yapma** (`SKIP`) olarak kaydedilen kartlar kuyruğa girmez; güncel tam tarama kimliği, öneri temeli ve değişecek alan listesi kuyruk oluşturulurken yeniden doğrulanır.
8. Kuyruk listingleri sırayla açar. **Öneriyi forma uygula** yalnız seçili alanları doldurur ve henüz yayınlama yapmaz. Etsy alanlarını inceleyip her listing için **İnceledim, Etsy’de yayımla** onayını ayrıca verin.
9. Yayın sonucu doğrulanamazsa kuyruk durur ve yazmayı otomatik tekrarlamaz. Deaktivasyonda script yalnız Etsy seçenek menüsünü açar; **Deactivate** ve Etsy final onayı kullanıcıya aittir.

> **“Kuyruk için kaydedilmiş önerisi bulunan en az bir listing seçin” ne demek?** Yalnız kartı işaretlediniz, fakat o listing için uygulanabilir bir öneri kaydetmediniz veya öneriyi **İşlem yapma** olarak kaydettiniz. Önce **İyileştirme planı → Öneriyi kaydet** adımını tamamlayın ya da geçerli AI öneri JSON’unu içe aktarın; sonra önerisi bulunan kartı seçerek kuyruğu yeniden hazırlayın.

Paneli aç/kapat: `Ctrl + Alt + L`. Tüm sayfaları tara/durdur/devam et: `Ctrl + Alt + A`.

## Etsy Keyword & Market Analyzer entegrasyonu

İki script birbirinden bağımsızdır. Listing Analyzer; tarama, Health Engine, AI JSON, öneri ve kullanıcı onaylı kuyruk özellikleri için Keyword & Market Analyzer kurulumu istemez. Companion kontrolü yalnız kullanıcı **Marketplace Insights ile araştır** düğmesine bastığında aynı-origin `BroadcastChannel` üzerinden yapılır.

Companion algılanmazsa script hiçbir kurulum başlatmaz. Modalda **İptal**, tam request envelope’unu veren **İsteği kopyala** ve açık kullanıcı hareketi gerektiren **Yükleme sayfasını aç** seçenekleri bulunur. Son seçenek canonical `main` raw `.user.js` adresini yeni sekmede açar; userscript yöneticisindeki son kurulum onayı yine kullanıcıya aittir. Sessiz veya gözetimsiz kurulum yoktur.

Algılanırsa yalnız seçili tek listing için şu güvenli teslimat uygulanır:

1. Analyzer, gerçek listing ID’si yerine `L001`, varsayılan olarak tek seed keyword ve başlık/etiket SHA-256 özetini kendi sınırlandırılmış GM deposunda 10 dakika saklar.
2. Insights sekmesi canonical Marketplace Insights adresinde, query veya fragment içine nonce, seed ya da payload yazılmadan açılır. Sekmenin userscript dinleyicisine yüklenme payı veren sınırlı tekrarlarla `PROBE → CAPABILITIES + RESEARCH_READY` el sıkışması tamamlanır; ardından tüm teslimat yalnız `BroadcastChannel` üzerinden `RESEARCH_REQUEST → RESEARCH_ACK → RESEARCH_RESULT → RESEARCH_RECEIVED` akışıyla yapılır.
   Keyword & Market Analyzer, seed'i işlerken Etsy'nin normal Marketplace Insights aramasını `query` değeriyle açar. Bu gerçek bir Etsy Insights sorgusudur; hesabınızın Etsy tarafından sağlanan sorgu kotasını kullanabilir ve planınıza göre sorgu maliyeti doğurabilir. Scriptler arası nonce, istek kimliği ve payload bu URL'ye eklenmez.
3. Her envelope sürümlü şema, tam anahtar kümesi, alan tipi, kaynak, zaman aşımı, tek kullanımlık nonce ve 64 KiB sınırıyla doğrulanır; sayısal metrikler yalnız sayı veya `null` olabilir. Değişmiş içerik, süresi dolmuş mesaj, bilinmeyen/ek alan ve çakışan replay reddedilir. Eşleşen fakat geçersiz bir sonuç için Listing Analyzer terminal `RESULT_REJECTED` gönderir; companion ilgili bekleyen sonucu ve seed verisini kuyruğundan temizler.
4. Sonuç `researchEvidence` olarak saklanır. `Search results` kesin rekabet skoru değil, **arama sonucu / rekabet göstergesi** adıyla gösterilir; fırsat puanı Makaytron türetilmiş metriği olarak etiketlenir.
5. Araştırma sonucu Etsy formunu değiştirmez, öneriyi yayımlamaz ve mevcut kullanıcı önerisini ezmez. Kullanıcı öneriyi ayrıca açıp kaydeder; düzenleyici içeriği yakalanmamışsa güvenli alan karşılaştırması tamamlanana kadar kuyruk oluşturulmaz. On üç etiket doluysa, ölçülebilir araştırma kanıtına sahip en güçlü aday yalnız inceleme taslağında tek bir düşük kanıtlı etiketin yerine önerilebilir; otomatik kaydetme veya yayınlama yapılmaz.

Analyzer açık kalmalıdır. Otomatik aktarım gecikir veya sekme kapanırsa modal, tam request envelope’unu kopyalama ve companion’dan alınan tam `RESEARCH_RESULT` envelope JSON’unu içe aktarma kurtarma araçlarını sunar.

## AI JSON sözleşmesi

Script AI servisine ağ isteği göndermez ve API anahtarı saklamaz. Dışa aktarılan paket gerçek listing ID’si yerine geçici referans içerir:

```json
{
  "schema": "makaytron-listing-ai-request/v1",
  "requestId": "air-...",
  "listings": [{ "reference": "L001", "title": "..." }]
}
```

İçe aktarılan yanıt aynı `requestId` ve `reference` değerlerini taşımalıdır:

```json
{
  "schema": "makaytron-listing-ai-proposals/v1",
  "requestId": "air-...",
  "proposals": [
    {
      "reference": "L001",
      "action": "UPDATE",
      "fields": ["title", "description", "tags", "materials"],
      "title": "Yeni başlık",
      "description": "Yeni açıklama",
      "tags": ["etiket 1", "etiket 2"],
      "materials": ["cotton"],
      "reason": "Önerinin gerekçesi"
    }
  ]
}
```

`fields`, Etsy formunda gerçekten değiştirilecek alanların açık listesidir. Listede olmayan alanlar korunur; örneğin yalnız başlığı değiştirmek için `fields: ["title"]` kullanılır. Bütün etiketleri temizlemek ancak `fields` içinde `tags` bulunur ve `tags: []` açıkça verilirse mümkündür.

Desteklenen işlemler: `UPDATE`, `DEACTIVATE_REVIEW`, `SKIP`. Bilinmeyen/tekrarlanan referanslar, açık alan listesi bulunmayan güncellemeler, 140 karakteri aşan başlıklar, 13’ten fazla etiketler ve 20 karakteri aşan etiketler reddedilir.

## Güvenlik sınırları

- Ayrı Etsy kullanıcı doğrulaması, OAuth, API key veya shared secret istemez.
- Etsy çerezlerini, oturum depolarını veya gizli API uçlarını okumaz.
- Sayfa açılışında Etsy’ye yazma işlemi yapmaz.
- Fiyat, miktar ve varyasyonları otomatik değiştirmez.
- Listing silme otomasyonu içermez.
- Kuyrukta sekme kilidi kullanır; doğrulanamayan yayınlamada güvenli biçimde durur.
- Tüm-sayfa veri toplamada ayrı sekme kilidi, sayfa imzası, tekrar döngüsü sınırı ve en fazla 250 sayfalık güvenlik tavanı kullanır. Bu işlem yalnız görünür listing verisini okur; listinglere yazmaz.
- Geçici sayfa hataları yalnız okuma/geçiş aşamasında sınırlı sayıda yeniden denenir; depolama, şema, sekme sahipliği, tekrar eden sayfa ve Etsy yazma hataları körlemesine yeniden denenmez. Hata raporu çerez, oturum, DOM HTML’i veya başlık metni toplamaz.
- Analiz ekranını açmak tüm-sayfa taramasını otomatik başlatmaz; 24 saatlik tazelik kapısı eski kartları yeni tarama tamamlanana kadar gizler.
- Etsy listing sayfasını açmak snapshot yazmaz. Yerel kayıt yalnız kullanıcının **Bu sayfayı tara**, **Tüm sayfaları tara**, **Analizi başlat** veya ilgili kısayolu kullanmasıyla oluşur.
- Native Web Locks depolama güncellemelerini sekmeler arasında sıraya alır; kayıt birleştirme ve yazma doğrulaması eşzamanlı snapshot/öneri değişikliklerini korur. AI içe aktarma ve kuyruk oluşturma, onay anında aynı güncel ve eksiksiz tam-tarama kimliğini yeniden doğrular.
- Açık analiz ekranı tam 24 saat dolduğunda zamanlayıcıyla kilitlenir; başka sekmede başlayan, tamamlanan veya geçersizleşen tarama durumu da açık panelde senkronize edilir.
- Kayıt yazma hatası veya aktif başka-sekme tarama kilidi, eksik veriyi tamamlanmış/güncel saymak yerine işlemi güvenli biçimde durdurur; aktif tarama varken yerel veriler temizlenemez.
- Bütün öneriler karar desteğidir; deaktivasyon kullanıcı onayı olmadan çalışmaz.
- Keyword & Market Analyzer bağlantısı isteğe bağlıdır; 64 KiB mesaj sınırı, 10 dakikalık istek TTL’si, 30 dakikalık mutlak TTL tavanı, SHA-256 içerik özeti ve tek kullanımlık sonuç kontrolü uygular. Keyword Analyzer yalnız araştırma kanıtı döndürür; Listing Analyzer başlık/etiket önerisini bu kanıttan yerelde üretir ve hiçbir Etsy alanını otomatik yayımlamaz.
- Companion araştırmasının her seed'i, normal Marketplace Insights `query` araması çalıştırabilir. Bu nedenle Etsy sorgu kotası ve hesabın planına bağlı olası sorgu maliyeti kullanıcı onaylı araştırma başlatılmadan önce dikkate alınmalıdır.
- Health Engine sonuçları yalnız görünür Etsy metrikleri ve bu tarayıcıdaki yerel geçmişe dayanır; nedensellik, Etsy geneli pazar benchmarkı veya kesin gelecek performansı iddia etmez.
- GitHub kaynağından kurulumda güncelleme denetimi yalnız tam `https://api.github.com/repos/Makaytron/Etsy-Automation-Tools/commits/main` ref adresine ve bu ref’ten doğrulanan 40 karakterli commit SHA’sının `raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/<commit>/scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js` yoluna izin verir. Final URL, namespace, ürün adı ve SemVer metadata’sı doğrulanır; kurulum aynı değişmez raw URL’yi açar. Başka dağıtım kaynağı algılanırsa onun güncelleme mekanizmasına bırakılır. Script kendisini sessizce değiştirmez.

## Veri ve izinler

- `GM.getValue`, `GM.setValue`, `GM.deleteValue`: sınırlı snapshot, ayar, kuyruk, AI eşlemesi ve araştırma teslimat durumunu scriptin kendi yerel alanında tutar.
- `GM.xmlHttpRequest` + `@connect`: commit-pinned güncelleme doğrulaması ve sınırlı psödonimleştirilmiş telemetri için kullanılır; Etsy veya AI API çağrısı yapmaz.
- `GM.openInTab`: yalnız kullanıcının araştırma veya companion kurulum düğmesine basmasıyla Insights/kurulum sayfasını açar.
- `GM_info`: kurulum kaynağının GitHub, Greasy Fork veya başka bir dağıtım olup olmadığını ayırt etmek için kullanılır.
- `GM_registerMenuCommand`, `GM_unregisterMenuCommand`: panel, tarama, analiz ve ayar menü komutlarını yönetir.
- `BroadcastChannel`: iki Etsy sekmesi arasında yalnız sürümlü ve boyutu sınırlandırılmış araştırma envelope’larını taşır; harici sunucuya veri göndermez.

Psödonimleştirilmiş telemetri ilk kullanımda görünür bildirimle varsayılan açıktır ve Ayarlar'dan tek tıkla kapatılabilir; kapatma sunucudaki bu userscripte ait kaydın silinmesini ister. Yalnız günlük açılma, başarılı tam tarama ve kategorize hata sayaçları gönderilir. Ham hata metni, listing kimliği, başlığı, metrikleri, snapshot, analiz veya URL gönderilmez. Ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.

Bu script Etsy API'sini kullanmaz ve API entegrasyonu değildir. Bununla birlikte [Etsy'nin genel Kullanım Koşulları](https://www.etsy.com/legal/terms-of-use), Etsy sayfalarının açık izin olmadan crawl, scrape veya spider edilmesini kısıtlar. Script görünür sayfa DOM'unu otomatik okuduğu için kullanım ve dağıtım kararında bu genel hükmü ayrıca değerlendirin.
