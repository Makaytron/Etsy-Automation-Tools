# Makaytron Etsy Keyword & Market Analyzer kullanım rehberi

<p><strong>Türkçe</strong> · <a href="./USAGE.en.md">English</a></p>

Keyword & Market Analyzer, Etsy Marketplace Insights sonuç sayfasındaki görünür keyword metriklerini okur, açıklar ve yerel olarak kaydeder. Script bağımsız çalışır; Listing Analyzer entegrasyonu isteğe bağlıdır.

## Desteklenen sayfalar

- `/your/shops/<shop>/marketplace-insights`
- `/your/shops/<shop>/marketplace-insights/search`

Marketplace Insights giriş sayfasında paneli açıp yeni arama başlatabilirsiniz. Açık bir sonucu analiz etmek veya kaydetmek için ana sorgu, **Searches**, **Search results** ve varsa benzer terimler tablosu görünür olmalıdır. Script Etsy listing, Ads veya Publish alanlarına yazmaz.

## Kurulum

1. [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Keyword & Market Analyzer userscript dosyasını](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js) açıp kurulumu onaylayın.
3. Etsy Shop Manager **Marketplace Insights** sayfasını açın.
4. Sağ kenardaki beyaz Makaytron logosundan paneli açın.

## Bağımsız keyword araştırması

1. Panelde araştırmak istediğiniz keyword'ü girin.
2. **Etsy Insights'ta ara** düğmesine basın.
3. Script normal Etsy Marketplace Insights rotasına yalnız `query` ve `search_trigger` değerlerini ekleyerek gider.
4. Sonuçların tamamen yüklenmesini bekleyin.
5. Script ana keyword ve en fazla 25 benzer terimin altına salt-okunur metrik şeritleri ekleyebilir.
6. Kalıcı yerel kayıt için ayrıca **Bu sayfayı analiz et ve kaydet** düğmesine basın.
7. Kaydedilmiş yapılandırılmış sonuçları **JSON dışa aktar** ile indirin.

> **Kota uyarısı:** **Etsy Insights'ta ara**, Etsy tarafında normal bir Marketplace Insights sorgusudur. Etsy'nin sağladığı sorgu kotasını tüketebilir ve hesap planınıza göre maliyet doğurabilir. **Bu sayfayı analiz et ve kaydet** ise yalnız açık sonucu yerel depoya kaydeder; yeni Etsy sorgusu başlatmaz.

## Gösterilen metrikler

| Alan | Kaynak ve yorum |
|---|---|
| 30 günlük arama | Etsy'nin görünür `Searches` değeri. |
| Arama sonucu / rekabet göstergesi | Etsy'nin görünür `Search results` değeri; doğrudan satış veya kesin rekabet skoru değildir. |
| 7 günlük değişim | Etsy gösteriyorsa yakalanan trend yüzdesi. |
| Yakalama zamanı | Sonucun ne zaman okunduğu. |
| Makaytron fırsat puanı | Arama ve sonuç göstergesinden türetilen karşılaştırma yardımcısı; Etsy metriği veya satış garantisi değildir. |

Inline metriklerin sayfada görünmesi, sonucun yerel olarak kaydedildiği anlamına gelmez. Kalıcı kayıt için **Bu sayfayı analiz et ve kaydet** kullanın.

## JSON dışa aktarma

**JSON dışa aktar**, kaydedilmiş genel Marketplace Insights yakalamalarını indirir. Bu dosya:

- yapılandırılmış keyword ve metrik verilerini içerir;
- cookie, oturum, ham HTML veya Etsy access tokenı içermez;
- Listing Analyzer entegrasyonundaki tam `RESEARCH_RESULT` zarfının yerine geçmez.

## Listing Analyzer ile otomatik entegrasyon

1. Listing Analyzer'da tam olarak bir listing seçin.
2. **Marketplace Insights ile araştır** işlemini kullanıcı olarak başlatın.
3. Keyword Analyzer hazırsa sürümlü handshake tamamlanır ve araştırma isteği sıraya alınır.
4. Varsayılan bir seed, açık üst sınır üç seed'dir. Her seed normal Etsy Insights sorgusu açabileceği için kota/maliyet etkisi vardır.
5. Keyword Analyzer sorguları sırayla işler, görünür sonuçları doğrular ve tam sonucu Listing Analyzer'a gönderir.
6. Sonuç, Listing Analyzer kabul makbuzu verene kadar bekletilir.
7. Listing Analyzer kanıttan yerel bir inceleme önerisi üretir; hiçbir Etsy listingi otomatik düzenlenmez veya yayımlanmaz.

Birden fazla Insights sekmesinde kısa süreli liderlik lease'i aynı isteğin iki kez işlenmesini önler. İş devam ederken ilgili sekmeleri kapatmayın.

## JSON fallback entegrasyonu

Otomatik tarayıcı aktarımı kullanılamıyorsa:

1. Listing Analyzer'dan alınan **tam** `RESEARCH_REQUEST` envelope JSON'unu kopyalayın.
2. Keyword Analyzer'daki **Listing Analyzer araştırma zarfı (JSON)** alanına yapıştırın.
3. **Araştırma talebini içe aktar** düğmesine basın.
4. Araştırma tamamlanınca **Sonuç zarfını kopyala** veya **Sonuç zarfını indir** kullanın.
5. Tam `RESEARCH_RESULT` zarfını Listing Analyzer'a geri aktarın.

**Araştırma talebini içe aktar**, doğrulanan işi hemen kuyruğa alma ve çalıştırma yetkisidir; seed başına ikinci onay sorulmaz. İçe aktarmadan önce zarfın en fazla üç seed sınırını ve Etsy Insights kota/maliyet etkisini kontrol edin. Her seed normal bir Marketplace Insights sorgusu açabilir.

Genel capture export'u bu zarfın yerine geçmez. Yanlış şema, nonce, gönderici, süre, içerik hash'i, ek/eksik alan, replay veya 64 KiB sınırı ihlali fail-closed reddedilir.

## Yerel verileri temizleme

**Yerel verileri temizle** açık kullanıcı onayından sonra şunları siler:

- kaydedilmiş araştırmalar;
- yedi günlük cache;
- araştırma kuyruğu;
- geçerli sonuç zarfları;
- kısa süreli işlemci lease'i.

Dil ve arayüz tercihi korunur. Aktif entegrasyon işi varsa karşı tarafa `CANCELLED` sonucu bildirilir.

## Klavye ve menü kontrolleri

- Global `Ctrl/Alt` kısayolu yoktur.
- Panel açık ve odak içindeyken `Escape` paneli kapatır.
- Tampermonkey menüsünde panel açma, mevcut sonucu kaydetme, JSON export, request import, result envelope kopyalama, yerel veri temizleme ve güncelleme kontrolü bulunur.

## Sorun giderme

- Sonuç bulunamadıysa ana keyword, Searches/Search results ve benzer terim satırlarının yüklenmesini bekleyin.
- Metrik okunamıyorsa script veri uydurmaz; açık sayfadaki değerleri elle doğrulayın.
- Otomatik entegrasyon gecikirse Listing Analyzer'ı açık bırakın veya tam JSON fallback'i kullanın.
- Sınırlı psödonimleştirilmiş kullanım telemetrisi görünür ilk kullanım bildirimiyle varsayılan açıktır. Ayarlar'dan kapatmak bu userscripte ait sunucu kaydının silinmesini ister; ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.
- Issue veya ekran görüntüsünde seed keyword, metrik, listing verisi, mağaza kimliği, çerez veya oturum bilgisi paylaşmayın.

İlk araştırmadan önce [Keyword & Market Analyzer dry-run kontrol listesini](../../docs/keyword-market-analyzer-dry-run-checklist.md) tamamlayın.

[Paket README'si](./README.md) · [Değişiklik günlüğü](./CHANGELOG.md) · [Gizlilik](../../PRIVACY.md) · [Destek](../../SUPPORT.md)
