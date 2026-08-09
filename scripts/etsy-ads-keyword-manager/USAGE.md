# Makaytron Etsy Ads Keyword Manager kullanım rehberi

<p><strong>Türkçe</strong> · <a href="./USAGE.en.md">English</a></p>

Ads Keyword Manager, bir Etsy Ads listinginin anahtar kelime satırlarını yerel kurallarla bulur, vurgular ve kullanıcı işlemiyle açıp kapatır. Script bağımsızdır ve API anahtarı istemez.

## Desteklenen sayfa

Reklamı açık bir listingin Etsy Ads anahtar kelime sayfasını açın:

`https://www.etsy.com/your/shops/me/advertising/listings/<listing>`

Anahtar kelime tablosu ve satırlar tamamen yüklenmiş olmalıdır. Script okunabilir keyword satırı bulamazsa işlem üretmez.

## Kurulum ve eski sürüm kontrolü

1. [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Ads Keyword Manager userscript dosyasını](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js) açıp kurulumu onaylayın.
3. Eski **Etsy Ad Wordlist** veya yerel `2.x` deneme kopyası kuruluysa aynı sayfada iki script çalışmaması için onu devre dışı bırakın.
4. Etsy Ads keyword sayfasını yenileyin.

Eski özel kelime listesi otomatik taşınmaz; gerekli kuralları yeni panelden yeniden ekleyin.

## Kelime kuralları oluşturma

Panelde **Kelime listesini düzenle** bölümünü açın. Her kural için bir eşleşme türü seçin:

| Tür | Ne yapar? | Örnek |
|---|---|---|
| **İfadeyi içeriyorsa** | Girilen metni keyword içinde arar; önerilen varsayılan yöntemdir. | `bts` → `bts shirt`, `cute bts gift` |
| **Yalnızca birebir aynıysa** | Yalnız tamamen aynı keyword ile eşleşir. | `bts shirt` |
| **Özel arama kuralı** | İleri kullanıcı için özel desen uygular. | `bts|army` |

Kuralları kaydedin. Panel eşleşen satır sayısını ve tıklama/sipariş oranı yüksek görünen satırları vurgulayabilir; bu görsel özet tek başına Etsy durumunu değiştirmez.

## Yalnız açık sayfayı işleme

1. Eşleşme sayısını ve vurgulanan satırları kontrol edin.
2. **Bu sayfadaki eşleşmeleri kapat** veya **Bu sayfadaki eşleşmeleri aç** düğmesine basın.
3. Bu düğme tıklaması, görünür eşleşen Etsy checkbox'larını doğrudan değiştirme yetkisidir; ayrıca ikinci bir onay modalı gösterilmez.
4. İşlem bitince checkbox durumlarını Etsy ekranında elle doğrulayın.

`Ctrl + Space`, açık onaydan sonra mevcut sayfadaki eşleşmeleri kapatır.

## Tüm sayfalardaki eşleşmeleri kapatma

> **Önemli:** Önce Etsy keyword pagination'ında **1. sayfaya geçin**. Çok sayfalı işlem açık sayfadan başlar ve yalnız **Next** yönünde ilerler; önceki sayfalara geri dönmez.

1. İlk sayfada eşleşme özetini kontrol edin.
2. **Tüm sayfalardaki eşleşmeleri kapat** düğmesine basın veya `Ctrl + Alt + K` kullanın.
3. Açık onay mesajındaki kapsamı okuyup onaylayın.
4. Script sayfaları sırayla işler ve en fazla 100 sayfada durur.
5. Tamamlanınca birkaç farklı sayfayı Etsy'de elle kontrol edin.

Tüm sayfalar için toplu **açma** işlemi yoktur; toplu akış yalnız eşleşmeleri kapatır.

## Eylem ve onay sınırları

| Eylem | Etsy'ye etkisi | Onay |
|---|---|---|
| Sayfayı açma, eşleşme/ratio vurgulama | Yok | Yok |
| Panelden açık sayfayı kapatma/açma | Görünür eşleşen keyword checkbox'larını değiştirir | Düğme tıklaması yetkidir |
| `Ctrl + Space` | Açık sayfadaki eşleşmeleri kapatır | Açık onay ister |
| Tüm sayfaları kapatma / `Ctrl + Alt + K` | Açık sayfadan sona kadar eşleşmeleri kapatır | Açık onay ister |
| Kelime listesini düzenleme | Yalnız yerel kuralları değiştirir | Kaydet |
| **Listeyi güncelle** | Yerel listeyi canonical dosyayla değiştirir | Onay + otomatik yerel yedek |
| Yedeği geri yükleme | Son yerel listeyi geri getirir | Onay |

Script sayfa açılışında kendiliğinden hiçbir Ads keyword durumunu değiştirmez.

## Kelime listesini güncelleme ve geri alma

1. Özel kurallarınızı kaydedin veya dışarıda not edin.
2. **Listeyi güncelle** yalnız canonical [keyword-rules.txt](./keyword-rules.txt) dosyasını almak için kullanılır.
3. Onay verirseniz mevcut liste önce `adWordlistBackup` yerel anahtarına yedeklenir, sonra değiştirilir.
4. Gerekirse Tampermonkey menüsündeki **Makaytron · Yedek kelime listesini geri yükle** komutunu kullanın.

Liste editörü açıkken güncelleme, geri yükleme ve canlı keyword işlemleri engellenir.

## Klavye ve menü kontrolleri

- `Ctrl + Alt + K`: Onaylı çok-sayfa kapatma
- `Ctrl + Space`: Onaylı açık-sayfa kapatma
- Kelime listesi modalında `Ctrl/Cmd + S`: Kaydet
- Modalda `Escape`: Kapat; kaydedilmemiş değişiklikte bırakma onayı gösterilir

Panel açma/gizleme, liste düzenleme/güncelleme/geri yükleme, açık sayfayı açma/kapatma ve sürüm kontrolü Tampermonkey menüsünde de bulunur.

## Sorun giderme

- Eşleşme sıfırsa doğru reklam listinginin keyword sayfasında olduğunuzu ve satırların yüklendiğini kontrol edin.
- Çok sayfalı işlem önceki sayfaları atladıysa 1. sayfaya dönüp yeniden başlatın.
- Etsy DOM'u veya checkbox durumu belirsizse script fail-closed durur; sayfayı yenileyip sonucu elle kontrol edin.
- Sınırlı psödonimleştirilmiş kullanım telemetrisi görünür ilk kullanım bildirimiyle varsayılan açıktır. Ayarlar'dan kapatmak bu userscripte ait sunucu kaydının silinmesini ister; ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.
- Issue veya ekran görüntüsünde keyword, Ads metriği, mağaza/listing kimliği, çerez ya da oturum verisi paylaşmayın.

[Paket README'si](./README.md) · [Değişiklik günlüğü](./CHANGELOG.md) · [Gizlilik](../../PRIVACY.md) · [Destek](../../SUPPORT.md)
