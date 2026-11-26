<p><strong>Türkçe</strong> · <a href="./README.en.md">English</a></p>

# Makaytron Etsy Automation Tools

**Sürüm:** 2.1.4 · [Değişiklik günlüğü](./CHANGELOG.md) · [Ana depo](../../README.md)

Etsy satıcıları için beş Makaytron aracı tek scriptte: Sale Manager, Message Assistant, Ads Keyword Manager, Listing Analyzer ve Keyword & Market Analyzer. Etsy sayfasının kenarındaki Makaytron düğmesi bir çekmece açar; çekmecede o sayfada çalışan araç ve diğer araçlara kısayollar bulunur. Ayrıntılar için çalışma alanı tam pencere açılır.

## Kurulum

1. Tarayıcınıza [Tampermonkey](https://www.tampermonkey.net/) kurun.
2. [Makaytron-Etsy-Automation-Tools.user.js](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-automation-tools/Makaytron-Etsy-Automation-Tools.user.js) bağlantısını açıp **Yükle**'ye basın.
3. Etsy satıcı panelinde ilk açılışta dilinizi ve kullanmak istediğiniz araçları seçin.

Güncellemeler Tampermonkey üzerinden bu dosyadan gelir.

## Araçlar ve çalıştıkları sayfalar

| Araç | Sayfa | Ne yapar |
|---|---|---|
| Sale Manager | Sales & Discounts | Kampanyaları sırayla oluşturur, her birini Etsy listesinde doğrular, doğrulanamayan adımda durur. |
| Message Assistant | Mesajlar, Satılan siparişler, mağaza panosu | Mesajları çevirir, kendi AI sağlayıcınız ve API anahtarınızla cevap hazırlar. Ayrıntılı iş kendi panelinde açılır. |
| Ads Keyword Manager | Etsy Ads listing sayfası | Kelime listenizle eşleşen reklam kelimelerini kapatır veya açar. |
| Listing Analyzer | Listings ve listing düzenleyici | Listinglerinizi zaman içinde izler, onayladığınız değişiklikleri tek tek hazırlar. Ayrıntılı iş kendi panelinde açılır. |
| Keyword & Market Analyzer | Marketplace Insights | Anahtar kelimeleri okur, puanlar ve araştırmanızı saklar. |

Her araç yalnız kendi sayfasında çalışır ve Ayarlar'dan kapatılabilir.

## Diller

Scriptin içinde yalnızca İngilizce tam olarak bulunur. Türkçe dahil 42 dil daha, seçildiğinde bu depodaki `languages/` klasöründen bir kez indirilir, doğrulanır ve saklanır. İlk ekran (dil seçimi) ve sorun bildirme penceresi her dilde scriptin içindedir; bu yüzden ilk açılış tarayıcının dilinde olur.

## Ayrı scriptlerden geçiş

Ayrı Makaytron scriptlerini kullanıyorsanız verilerinizi taşıyabilirsiniz:

1. Ayrı scriptin Etsy sayfasını açın; bildirimdeki **Aktar**'a basın.
2. Aynı sekmede iki dakika içinde Etsy Automation Tools'ta **Ayarlar › Gizlilik ve veri › Aktarımı başlat**'a basın.
3. İki tarafta aynı 4 haneli kontrol kodunu görmelisiniz.

API anahtarları taşınmaz; burada yeniden girersiniz. Ayrı scriptler altı ay daha çalışır, sonra güncelleme almaz.

## Gizlilik

Ayarlar, raporlar ve araç verileri bu tarayıcıda kalır. API anahtarları yedeklere ve aktarıma hiç girmez. Ayrıntılar: [PRIVACY.md](../../PRIVACY.md).

Sorun bildirmek için: çalışma alanındaki **Sorun bildir** penceresi, raporu (sürüm, tarayıcı, işletim sistemi, dil, ülke, sayfa türü ve notunuz) doldurulmuş hâlde herkese açık bir [GitHub Issues](https://github.com/Makaytron/Etsy-Automation-Tools/issues) kaydı olarak açar. Script kendisi hiçbir şey göndermez; raporu GitHub'da kontrol edip siz gönderirsiniz.
