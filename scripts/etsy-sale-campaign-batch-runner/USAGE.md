# Makaytron Etsy Sale Manager kullanım rehberi

<p><strong>Türkçe</strong> · <a href="./USAGE.en.md">English</a></p>

Bu rehber, Etsy Shop Manager'da birden fazla yüzde indirimli kampanyayı tarih sırasıyla oluşturmak için Sale Manager'ın canlı kullanımını anlatır. Script bağımsız çalışır.

> **Canlı işlem uyarısı:** **Seriyi Başlat**, planlanan kampanyaların Etsy formunu doldurma ve her kampanyanın final gönderim düğmesini otomatik tıklama yetkisidir. Kampanya başına ikinci bir manuel onay gösterilmez.

## Desteklenen sayfa

Etsy Shop Manager'da **Marketing → Sales and discounts** sayfasını açın:

`https://www.etsy.com/your/shops/me/sales-discounts`

Script bu sayfa ile Etsy'nin ilgili **Run a sale**, inceleme ve **Details & Stats** alt adımlarında çalışır. Başka bir Etsy sekmesinde panel görünmezse önce doğru rotayı açıp sayfayı yenileyin.

## Kurulum

1. Güncel Chrome, Edge veya Brave'e [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Sale Manager userscript dosyasını](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js) açın.
3. Tampermonkey izinlerini inceleyip **Yükle** düğmesine basın.
4. Etsy **Sales and discounts** sayfasını yenileyin.

## Seri ayarlarını hazırlama

Panelde **Ayarlar** düğmesine basın ve şu alanları kontrol edin:

| Ayar | Anlamı |
|---|---|
| Başlangıç tarihi | İlk kampanyanın başlayacağı gün. |
| Son başlangıç tarihi | Seride oluşturulacak son kampanyanın başlangıç günü. |
| Promosyon süresi | Her kampanyanın süresi; 1–30 gün. Yeni başlangıçlar da bu aralıkla ilerler. |
| İndirim yüzdesi | Yüzde indirim; 1–90. Etsy preset sunmazsa doğrulanmış custom yüzde alanı kullanılır. |
| Promosyon kod prefix'i | İsteğe bağlı, en fazla 12 harf/rakam. Kod `YYMMDD + PREFIX + indirim` biçiminde üretilir. |
| Bölge | Desteklenen güvenli kapsam **Everywhere** değeridir. |

**Kaydet** ile planı saklayın. İlk canlı kullanımda başlangıç ve son başlangıç tarihini aynı gün seçerek yalnız bir kampanya oluşturun.

## Canlı seriyi çalıştırma

1. Panelde görünen mağaza, tarih aralığı, kod ve indirim özetini kontrol edin.
2. Etsy'de açık başka bir modal, CAPTCHA veya yarım kalmış satış formu varsa önce onu kapatın ya da sonuçlandırın.
3. **Seriyi Başlat** düğmesine basın.
4. Script her gün için benzersiz kod ve mağaza kimliğini kontrol eder.
5. **Run a sale** formunda yüzde indirimi, tarihler, kampanya adı ve `Everywhere` alanlarını doldurur.
6. Kapsamı **All listings** olarak doğrular; **Continue**, inceleme ve final gönderim adımlarını kontrollü biçimde ilerletir.
7. Sonucu Etsy **Details & Stats** verisinden kod, yüzde, tarih, durum, tür, bölge ve kapsam kanıtlarıyla doğrular.
8. Yalnız doğrulanan kampanyadan sonra sıradaki tarihe geçer.

Seri çalışırken **Ayarlar**, **Run Sale** ve güncelleme kurulumu devre dışıdır. İşin açık olduğu sekmeyi kapatmayın ve aynı seriyi başka bir sekmede başlatmayın.

## Seri durursa

Script hata gördüğünde aynı tarihte durur; final düğmesini körlemesine ikinci kez tıklamaz.

| Kontrol | Ne zaman kullanılır? |
|---|---|
| **Yeniden Dene / Devam Et** | Etsy ekranını kontrol edip engeli giderdiğinizde aynı güvenli adımdan devam etmek için. |
| **Bu Günü Atla** | O tarihte kampanya oluşturmayıp sonraki plan gününe geçmek için. |
| **Durdur** | Seriyi tamamen sonlandırmak için. |

CAPTCHA, rate limit, yabancı modal, mağaza uyuşmazlığı, yinelenen kod, belirsiz gönderim veya doğrulanamayan sunucu sonucu otomatik geçilmez. Gönderimin gerçekleşmiş olabileceğinden şüpheleniyorsanız önce Etsy'de kampanyayı arayın; aynı günü hemen yeniden denemeyin.

## Rapor ve son kontrol

1. Panelde **Rapor** düğmesini açın.
2. Başarılı, hatalı ve atlanan satırları; kod, tarih ve doğrulama durumuyla inceleyin.
3. Gerekiyorsa CSV veya Excel uyumlu XML çıktısını indirin.
4. Etsy **Details & Stats** ekranında kampanya kodunu, indirimi, tarihleri ve `All listings` kapsamını elle doğrulayın.

## Klavye kısayolları

- `Alt + Shift + E`: Ayarlar
- `Alt + Shift + R`: Rapor
- `Alt + Shift + U`: Güncelleme kontrolü

Seriyi başlatan bir klavye kısayolu yoktur; canlı yetki yalnız paneldeki **Seriyi Başlat** düğmesiyle verilir.

## Güvenlik ve veri sınırları

- Script yalnız yüzde indirimi, `Everywhere` ve `All listings` akışını destekler.
- Mağaza/sekme sahipliği ve tek-gönderim rezervasyonu aynı işin iki kez yürütülmesini engeller.
- Ham kampanya içeriği, mağaza kimliği veya Etsy oturumu telemetriye gönderilmez.
- Sınırlı psödonimleştirilmiş kullanım telemetrisi görünür ilk kullanım bildirimiyle varsayılan açıktır. Ayarlar'dan kapatmak bu userscripte ait sunucu kaydının silinmesini ister; ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.
- İlk canlı çalıştırmadan önce [tek günlük canlı doğrulama kontrol listesini](../../docs/campaign-dry-run-checklist.md) uygulayın. Bu kontrol gerçek bir kampanya gönderir; simülasyon değildir.

[Paket README'si](./README.md) · [Değişiklik günlüğü](./CHANGELOG.md) · [Destek](../../SUPPORT.md) · [Güvenlik](../../SECURITY.md)
