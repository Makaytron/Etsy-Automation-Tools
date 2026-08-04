<p align="center">
  <img src="../../assets/makaytron-logo.png" width="96" alt="Makaytron logosu">
</p>

# Makaytron Etsy Sale Manager

<p><strong>Türkçe</strong> · <a href="./README.en.md">English</a></p>

Etsy Shop Manager için Bulk Sales & Discounts Automation aracı. **Sales and discounts → Run a sale** akışında yüzde indirimli kampanyaları kontrollü seriler hâlinde planlar, doğrular ve raporlar; belirsiz kanıt gördüğünde fail-closed biçimde durur.

Script standalone çalışır; başka bir Etsy Automation Tools paketinin kurulması gerekmez.

**Sürüm:** 1.0.0 · [Değişiklik günlüğü](./CHANGELOG.md) · [Ana depo](../../README.md)

## Kurulum

1. Güncel Chrome, Edge veya Brave ile [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Userscript dosyasını açın](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-sale-campaign-batch-runner/Etsy-Sale-Campaign-Batch-Runner.user.js).
3. Tampermonkey kurulum ekranında izinleri inceleyip **Yükle** düğmesine basın.
4. Etsy Shop Manager'da **Marketing → Sales and discounts** sayfasını açıp yenileyin.

## Öne çıkanlar

- Başlangıç tarihi, son başlangıç tarihi, kampanya süresi, indirim yüzdesi ve isteğe bağlı kod önekiyle seri plan oluşturur.
- Kampanya kodlarını `YYMMDD + önek + indirim` biçiminde üretir.
- Yalnızca yüzde indirimi, Everywhere ve All listings değerleri doğrulanırsa ilerler.
- Aynı kodu, mağaza kimliğini, sekme sahipliğini ve tek-gönderim durumunu kontrol eder.
- CAPTCHA, rate limit, Etsy hatası, belirsiz sonuç veya açık yabancı modal durumunda fail-closed durur.
- CSV ve Excel uyumlu XML raporu oluşturur.
- Canonical GitHub kurulumunda yeni `@version` değerini en fazla 24 saatte bir kontrol eder; farklı dağıtım kaynağında o platformun güncelleme mekanizmasına bırakır.
- Güncelleme sayfasını yalnız kullanıcı eylemiyle ve aktif seri yokken açar; son onay Tampermonkey'dedir.
- Makaytron logosunu userscript yöneticisinin cache'lediği `@resource` üzerinden kullanır; güvenli fallback dışında sayfa açılışında ayrı marka isteği yapmaz.

## Kullanım

1. Panelde **Ayarlar** düğmesine basın.
2. Tarih aralığını, kampanya süresini, indirim yüzdesini ve isteğe bağlı kod önekini girin.
3. Planı kaydedin. **Seriyi Başlat** canlı yazma yetkisidir; basıldığında script Etsy adımlarını ve her kampanyanın final gönderim düğmesini otomatik tıklar.
4. İlk canlı kullanımda tek günlük seri çalıştırın.
5. Sonucu Etsy **Details & Stats** ekranında elle kontrol edin.

Script hata gördüğünde sessizce sonraki güne geçmez. Aynı tarihte durur ve yeniden deneme, günü atlama veya tamamen durdurma seçeneklerini gösterir.

## Psödonimleştirilmiş kullanım telemetrisi

Telemetri ilk kullanımda görünür bildirimle varsayılan açıktır ve Ayarlar'dan tek tıkla kapatılabilir; kapatma sunucudaki bu userscripte ait kaydın silinmesini ister. Yalnız günlük açılma, başarılı seri tamamlanması ve kategorize hata sayaçları gönderilir. Ham hata metni, mesaj, sipariş, mağaza, listing veya kampanya içeriği, kimlik ya da URL gönderilmez. Ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.

## Destek ve güvenlik

Sorun bildirmeden önce depo kökündeki [SUPPORT.md](../../SUPPORT.md) ve [SECURITY.md](../../SECURITY.md) belgelerini okuyun. Bu araç Etsy ile bağlantılı veya Etsy tarafından onaylanmış değildir.
