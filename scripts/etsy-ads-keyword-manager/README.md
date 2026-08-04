<p align="center">
  <img src="../../assets/makaytron-logo.png" width="96" alt="Makaytron logosu">
</p>

# Makaytron Etsy Ads Keyword Manager

<p><strong>Türkçe</strong> · <a href="./README.en.md">English</a></p>

Etsy Ads anahtar kelime satırlarını anlaşılır filtrelerle bulmak, vurgulamak ve kullanıcı onayıyla açıp kapatmak için Tampermonkey userscripti.

Script standalone çalışır; başka bir Etsy Automation Tools paketinin kurulması gerekmez.

**Sürüm:** 1.0.1 · [Değişiklik günlüğü](./CHANGELOG.md) · [Ana depo](../../README.md)

> Bu araç Etsy tarafından geliştirilmiş, desteklenmiş veya onaylanmış değildir.

## Kurulum

1. Güncel Chrome, Edge, Brave veya Firefox ile [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Canonical userscript dosyasını açın](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-ads-keyword-manager/Makaytron-Etsy-Ads-Keyword-Manager.user.js).
3. Tampermonkey izinlerini inceleyip **Yükle** düğmesine basın.
4. Etsy Shop Manager'da bir reklam listinginin anahtar kelime sayfasını açıp yenileyin.

Eski **Etsy Ad Wordlist** veya yerel `2.x` deneme sürümü kuruluysa iki scriptin aynı sayfada çalışmasını önlemek için önce onu devre dışı bırakın veya kaldırın. Yeni Makaytron paketi canonical namespace kullandığı için eski scriptin özel listesi otomatik taşınmaz; gerekli özel filtreleri yeni formdan yeniden ekleyin.

## Özellikler

- Makaytron temalı, küçültülebilir Etsy Ads kontrol paneli.
- Türkçe ve İngilizce arayüz; dil ve panel tercihi Tampermonkey depolamasında korunur.
- Teknik satır düzenleyici yerine ekleme, düzenleme, arama ve silme destekli filtre formu.
- Mevcut sayfadaki satır, eşleşme ve yüksek tıklama/sipariş oranı özeti.
- Mevcut sayfada eşleşen anahtar kelimeleri açma veya kapatma.
- Açık onaydan sonra tüm sayfalarda eşleşen anahtar kelimeleri kapatma.
- Canonical GitHub listesini onayla güncelleme ve önceki listeyi yerel yedek anahtarında koruma.
- Paneldeki sürüm rozetinden veya Tampermonkey menüsünden elle çalıştırılabilen, en fazla 24 saatte bir otomatik yinelenen script sürüm denetimi.

## Filtre seçenekleri

| Seçenek | Örnek | Sonuç |
|---|---|---|
| **İfadeyi içeriyorsa (önerilen)** | `bts` | `bts shirt` ve `cute bts gift` bulunur. |
| **Yalnızca birebir aynıysa** | `bts shirt` | Yalnızca tamamen aynı anahtar kelime bulunur. |
| **Özel arama kuralı (ileri seviye)** | `bts|army` | Deseni bilen ileri kullanıcılar için özel eşleşme uygulanır. |

Form teknik işaretleri kullanıcıdan gizler; kaydederken eski satır biçimiyle geriye uyumlu veri üretir.

## Güvenli kullanım

- **Bu sayfadaki eşleşmeleri kapat/aç** yalnız görünür sayfadaki eşleşen Etsy kontrollerini tıklar.
- **Tüm sayfalardaki eşleşmeleri kapat** ve `Ctrl + Alt + K`, işlem başlamadan önce açık onay ister ve sayfaları sırayla işler.
- `Ctrl + Space`, onaydan sonra yalnız mevcut sayfadaki eşleşen anahtar kelimeleri kapatır.
- Script açıldığında kendiliğinden hiçbir anahtar kelimeyi değiştirmez.
- İşlem bittikten sonra sonucu Etsy Ads ekranında elle doğrulayın; Etsy arayüzü zaman içinde değişebilir.

## Kelime listesini güncelleme

İlk kurulumda gömülü liste ile [paketteki canonical kurallar](./keyword-rules.txt) aynıdır. **Listeyi güncelle**, bu dosyanın güncel hâlini `raw.githubusercontent.com` üzerinden alır. İşlemden önce onay sorulur ve mevcut liste `adWordlistBackup` anahtarına yazılır. Özel listenizi değiştirmek istemiyorsanız bu işlemi onaylamayın. Son yedeği geri almak için Tampermonkey menüsündeki **Makaytron · Yedek kelime listesini geri yükle** komutunu kullanın. Liste formu açıkken güncelleme, geri yükleme ve canlı anahtar kelime işlemleri engellenir.

## Script sürümünü denetleme

Canonical GitHub dosyasından kurulan script, panel yüklendikten sonra sürüm bilgisini en fazla 24 saatte bir denetler. Paneldeki `v1.0.1` rozeti veya Tampermonkey menüsündeki **Makaytron · Script sürümünü denetle** komutu elle denetim başlatır. Denetim uzak `.user.js` metninden yalnız `@version` değerini okur; uzak kodu çalıştırmaz. Ağ hatası ana anahtar kelime aracını engellemez.

Yeni sürüm varsa panelde **Kurulum sayfasını aç** düğmesi görünür. Düğme ve ardından açık onay verilmedikçe sekme açılmaz; Tampermonkey son kurulum onayını ayrıca ister. Sessiz kurulum yapılmaz. Canlı anahtar kelime işlemi, liste güncellemesi veya liste editörü açıkken sürüm denetimi ve kurulum sayfası güvenli biçimde engellenir. Script Greasy Fork gibi başka bir kaynaktan kurulmuşsa veya kaynak GitHub olarak doğrulanamıyorsa özel GitHub denetimi zorlanmaz; doğrulanmış harici kurulumda güncellemeyi o kaynak yönetir.

Kurallar, dil, panel tercihi ve son sürüm denetimi zamanı yalnız Tampermonkey yerel depolamasında tutulur. Görünür panel logosu script içine gömülüdür. Anahtar kelime, Ads metriği ve kural içeriği telemetriye gönderilmez.

## Psödonimleştirilmiş kullanım telemetrisi

Telemetri ilk kullanımda görünür bildirimle varsayılan açıktır ve Ayarlar'dan tek tıkla kapatılabilir; kapatma sunucudaki bu userscripte ait kaydın silinmesini ister. Yalnız günlük açılma, başarılı anahtar kelime değişikliği ve kategorize hata sayaçları gönderilir. Ham hata metni, anahtar kelime, Ads metriği, kural içeriği, Etsy kimliği veya URL gönderilmez. Ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.

## Destek, gizlilik ve lisans

API anahtarı gerekmez. Sorun bildiriminde mağaza, listing, reklam metriği, çerez veya oturum bilgisi paylaşmayın. [Gizlilik](../../PRIVACY.md), [Güvenlik](../../SECURITY.md) ve [Destek](../../SUPPORT.md) belgelerini okuyun.

[MIT](../../LICENSE)
