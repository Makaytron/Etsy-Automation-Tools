# Makaytron Etsy Listing Analyzer kullanım rehberi

<p><strong>Türkçe</strong> · <a href="./USAGE.en.md">English</a></p>

Listing Analyzer, Etsy Shop Manager'da görünür listing istatistiklerini kontrollü biçimde toplar, yerel geçmişle değerlendirir ve kullanıcı onaylı iyileştirme kuyruğu hazırlar. Etsy API/OAuth anahtarı istemez.

> Health Engine karar desteğidir; nedensellik, Etsy geneli benchmark veya garantili satış iddiası değildir. Sayfayı açmak tek başına tarama, snapshot, öneri veya Etsy yazma işlemi başlatmaz.

## Desteklenen sayfalar

- Listing listesi: `https://www.etsy.com/your/shops/<shop>/tools/listings*`
- Listing editörü: `https://www.etsy.com/your/shops/<shop>/listing-editor/edit/<id>*`

Analiz için Etsy listing sayfasında **Stats** görünümünü ve incelemek istediğiniz gerçek durum filtresini açın. Aktif listing analizinde `active` kapsamını kullanın.

## Kurulum

1. [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Listing Analyzer userscript dosyasını](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-listing-analyzer/Makaytron-Etsy-Listing-Analyzer.user.js) açıp kurulumu onaylayın.
3. Etsy Shop Manager **Listings** sayfasını yenileyin.
4. Sağdaki Makaytron panelini açın.

## İlk güvenli tam tarama

1. Listing sayfasında istatistik satırlarının göründüğünü kontrol edin.
2. Panelde **Tüm sayfaları tara** düğmesine basın veya `Ctrl + Alt + A` kullanın.
3. Script `1 → 2 → … → son sayfa → 1` akışını tamamlar.
4. Her sayfada kimlik, numaralandırma, kart sayısı, listing ID'leri ve beş metriğin tamamı doğrulanır.
5. Analiz kartları ancak son sayfadan 1. sayfaya güvenli dönüş ve tam koleksiyon doğrulaması tamamlanınca açılır.

Aynı kontrol taramayı durdurur ve kaldığı yerden devam ettirir. **Bu sayfayı tara** yalnız açık sayfanın yerel kaydını yeniler; tam mağaza analizi veya işlem kuyruğu için tamamlanmış tüm-sayfa taramasının yerine geçmez.

Eksik metrik, tekrarlanan/örtüşen sayfa, geçici DOM karışımı, mağaza kimliği veya sayfa sayısı uyuşmazlığında analiz kilitli kalır. Eksik değer hiçbir zaman `0` kabul edilmez.

## Analizi doğru yorumlama

| Gösterge | Zaman kapsamı / anlamı |
|---|---|
| Ziyaret ve favori | Etsy'nin kayan son 30 günlük görünür değerleri. |
| Satış, gelir ve yenileme | Etsy kartındaki tüm-zaman sayaçları. |
| **30 günlük erişim/ilgi** | Yalnız güncel ziyaret ve favori oranından oluşan karşılaştırılabilir performans puanı. |
| **Geçmiş güveni** | Yerel zaman serisinin trend/deaktivasyon kararı için ne kadar hazır olduğu; listing kalite puanı değildir. |

İlk tam taramada geçmiş güveni `39` veya düşük görünebilir. Bu, listing performansının `%39` olduğu anlamına gelmez. Güncel erişim/ilgi puanı ve ilk-tarama sinyalleri ayrı değerlendirilir; büyüme/düşüş için karşılaştırılabilir 30 günlük geçmiş, deaktivasyon incelemesi için en az 58 günlük tam geçmiş ve diğer güvenlik kapıları gerekir.

Tam ve taze sayaçlar sıfırsa bu **veri eksik** değildir; **Güncel hareket yok** kanıtıdır. Okunamayan, eski veya tutarsız veri ise fail-closed **Eksik / tutarsız veri** olarak kalır.

Arama, hazır/özel presetler, yaşam döngüsü, sorun/fırsat, öneri, performans, stok ve veri güveni filtreleriyle kapsamı daraltın. Satış/gelir/yenileme değerlerinin tüm-zaman; ziyaret/favorinin 30 günlük olduğunu sıralama ve karşılaştırmada unutmayın.

## Manuel iyileştirme önerisi

1. İlgili listing kartında **İyileştirme planı**nı açın.
2. Uygulanacak işlemi seçin.
3. **Seçili alanları güncelle** için değişecek başlık, açıklama, etiket veya materyal alanlarını açıkça işaretleyin ve yeni değerleri girin.
4. Gerekirse gerekçe/not ekleyin.
5. **Öneriyi kaydet** düğmesine basın.

Kartın seçim kutusu öneri kaydetmez; yalnız araştırma, AI dışa aktarımı ve kuyruk kapsamını belirler. **İşlem yapma** (`SKIP`) olarak kaydedilen plan kuyruğa girmez.

## AI önerisi

Listing Analyzer bir AI servisine ağ isteği göndermez ve API anahtarı saklamaz.

1. Analiz kartlarında istediğiniz listingleri seçin.
2. **AI önerileri** ekranını açıp istek paketini kopyalayın.
3. Paketi kullanacağınız harici AI aracına kendiniz verin; paylaşmadan önce içerik ve gizlilik kapsamını kontrol edin.
4. Aracın ürettiği tam cevap JSON'unu Listing Analyzer'a yapıştırıp içe aktarın.
5. Şema bütünü doğrulanırsa öneriler yerel olarak kaydedilir; geçersiz veya kısmi JSON hiçbir öneriyi yazmaz.
6. **Önce / AI önerisi / Doğrulanan sonuç** karşılaştırmasını inceleyip gerekirse manuel düzeltin.

## İşlem kuyruğu ve yayınlama

1. Kaydedilmiş, uygulanabilir önerisi bulunan listing kartlarını seçin.
2. **Seçilenlerden kuyruk hazırla** düğmesine basın.
3. Script güncel tam tarama kimliğini, listing kapsamını, öneri temelini ve değişecek alan listesini yeniden doğrular. Önerisiz veya `SKIP` kartları dışarıda bırakır.
4. **İlk listingi aç** ile kuyruğu başlatın.
5. Listing editöründe **Öneriyi forma uygula** düğmesine basın. Bu adım yalnız seçili alanları doldurur; henüz yayınlama yapmaz.
6. Etsy formunu, listing ID'sini ve tüm değişen alanları inceleyin.
7. Her listing için ayrıca **İnceledim, Etsy'de yayımla** onayını verin. Bu canlı yayınlama yetkisidir.
8. Script görünür sonucu doğrularsa sıradaki listinge geçer.

Yayın sonucu doğrulanamazsa kuyruk durur ve aynı yazmayı körlemesine tekrarlamaz. Öneri kaydedildikten sonra listing içeriği, analiz ayarları veya tarama temeli değişirse öneri stale kabul edilir; planı yeniden açıp kaydedin.

### “Kaydedilmiş önerisi bulunan listing” uyarısı

Bu uyarı, kartı seçtiğiniz hâlde o listing için uygulanabilir bir öneri kaydetmediğiniz veya planı **İşlem yapma** olarak kaydettiğiniz anlamına gelir. Önce **İyileştirme planı → Öneriyi kaydet** adımını tamamlayın ya da geçerli AI öneri JSON'unu içe aktarın; sonra kartı yeniden seçin.

## Deaktivasyon incelemesi

**Kapatmayı incele** otomatik deaktivasyon emri değildir. Script yalnız Etsy seçenek menüsünü açar ve **Deactivate** öğesine odaklanır. **Deactivate** ile Etsy'nin final onayını kullanıcı tıklar. Etsy'deki sonucu kontrol ettikten sonra panelde **Deaktivasyonu doğrula ve devam et** düğmesine basın; script ancak bu adımda görünür sonucu doğrular ve kuyruğu ilerletir. Listing silme otomasyonu yoktur.

## Marketplace Insights araştırması

Bu özellik isteğe bağlıdır ve ayrı Keyword & Market Analyzer olmadan diğer Listing Analyzer özellikleri çalışmaya devam eder.

1. Tam olarak bir listing kartı seçin.
2. **Marketplace Insights ile araştır** düğmesine basın.
3. Companion hazırsa sürümlü istek aktarılır; her seed Etsy'nin normal Marketplace Insights `query` aramasını açabilir ve kota/plan maliyeti tüketebilir.
4. Doğrulanan arama, sonuç/rekabet göstergesi ve Makaytron türetilmiş fırsat kanıtını inceleyin.
5. Araştırma yalnız inceleme önerisi üretir; mevcut öneriyi ezmez, Etsy alanını değiştirmez ve yayınlamaz.

Companion yoksa kurulum sayfası yalnız açık kullanıcı eylemiyle açılır ve son onay Tampermonkey'dedir. Otomatik aktarım olmazsa tam `RESEARCH_REQUEST` / `RESEARCH_RESULT` JSON kurtarma araçlarını kullanabilirsiniz.

## Yerel veri, yedek ve güncellik

- Snapshotlar, analiz, öneriler, kuyruk, deney ve filtre presetleri Tampermonkey yerel depolamasında tutulur.
- Son tamamlanan tüm-sayfa taraması veya en eski sayfa 24 saati doldurursa analiz kartları kilitlenir; yeni tam tarama başlatın.
- **Yedek indir** ile JSON yedeği alın. İçe aktarma şema ve boyutu doğrular; eski işlem kuyruğunu etkinleştirmez.
- **Yerel analiz verilerini temizle** açık onay ister ve aktif tarama/kuyruk sırasında çalışmaz.

## Klavye kısayolları

- `Ctrl + Alt + L`: Paneli aç/kapat
- `Ctrl + Alt + A`: Tüm sayfaları tara / durdur / devam et

## İlk kullanım ve destek

Sınırlı psödonimleştirilmiş kullanım telemetrisi görünür ilk kullanım bildirimiyle varsayılan açıktır. Ayarlar'dan kapatmak bu userscripte ait sunucu kaydının silinmesini ister; ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.

İlk canlı listing yazmasından önce [Listing Analyzer dry-run kontrol listesini](../../docs/listing-analyzer-dry-run-checklist.md) tamamlayın. Hata raporunu paylaşmadan önce mağaza/listing kimliği, başlık, metrik, çerez, oturum ve sayfa içeriğini ayıklayın.

[Paket README'si](./README.md) · [Değişiklik günlüğü](./CHANGELOG.md) · [Gizlilik](../../PRIVACY.md) · [Güvenlik](../../SECURITY.md) · [Destek](../../SUPPORT.md)
