# Güvenlik Politikası

<p><strong>Türkçe</strong> · <a href="./SECURITY.en.md">English</a></p>

## Desteklenen sürümler

Güvenlik düzeltmeleri yalnızca bu depodaki en güncel userscript kaynaklarına uygulanır. Bildirim yaparken etkilenen scripti, kurulum adresini ve tam sürümü belirtin.

## Güvenlik açığı bildirme

Güvenlik açığını, API anahtarını, oturum çerezini veya müşteri verisini herkese açık bir issue içine koymayın.

1. Depodaki **Security → Report a vulnerability** akışını kullanın.
2. Etkilenen scripti ve sürümü belirtin.
3. Yeniden üretme adımlarını, beklenen etkiyi ve mümkünse hassas bilgileri ayıklanmış kanıtı ekleyin.
4. Canlı Etsy hesabında zararlı veya geri döndürülemez bir deneme yapmayın.

Özel güvenlik bildirimi kullanılamıyorsa, [SUPPORT.md](./SUPPORT.md) içindeki destek yolundan yalnızca hassas bilgi içermeyen bir iletişim talebi açın.

## Veri ve sır yönetimi

- Mesaj asistanındaki API anahtarları Tampermonkey depolamasında tutulur ve seçilen sağlayıcının resmî API adresine yapılan isteklerde kullanılır.
- AI veya çeviri çağrısına eklenen metin üçüncü taraf sağlayıcıya iletilebilir. Göndermeden önce müşteri verisini en aza indirin.
- Config dışa aktarımında anahtarları eklemeyin; gerekiyorsa yalnızca şifreli ve güvenilir bir kanalla aktarın.
- Kampanya scripti doğrulama belirsiz olduğunda final işlemini durduracak şekilde tasarlanmıştır. Bu davranışı atlatan değişiklikler güvenlik etkili kabul edilir.
- Ads Keyword Manager yalnız kullanıcı işlemiyle görünür Etsy anahtar kelime kontrollerini değiştirir; tüm-sayfalar işlemi ve uzak kural listesi değişimi açık onay gerektirir. Bu onayları, liste yedeğini veya sayfa açılışında işlem yapmama garantisini atlatan değişiklikler güvenlik etkili kabul edilir.
- Listing Analyzer performans sınıflandırmaları karar desteğidir ve tek başına canlı yazma yetkisi değildir. Listing alanı değiştirme, deaktif etme veya diğer toplu işlemler açık kullanıcı seçimi/onayı, doğru listing kimliği ve önce/sonra doğrulaması gerektirir. Bu sınırları, aktif iş/sekme kilidini ya da belirsizlikte durma davranışını atlatmak güvenlik etkili kabul edilir.
- Listing Analyzer `v1.1.0` yalnız onaylanmış başlık, açıklama, etiket ve materyal alanlarını editöre aktarır; her listing için Etsy Publish öncesinde kullanıcı onayı bekler. Deaktivasyonda ayrı listing onayından sonra yalnız tek, görünür ve etkin tam eşleşen **Deactivate** menü öğesi ile doğru başlıklı modalın özel final **Deactivate** düğmesini tıklar. **Delete** semantiği, yanlış/çift modal, disabled veya değişmiş kontrol sıfır tıklamayla reddedilir. Gönderim niyeti final tıklamadan önce kalıcılaştırılır; belirsiz sonuç otomatik tekrarlanmaz ve kuyruk yalnız `Active → Inactive` doğrulamasıyla ilerler. AI değişimi ağsız JSON/prompt dışa aktarımı ve doğrulanmış teklif içe aktarımıdır; script Etsy veya AI API anahtarı istemez.
- Listing Analyzer geçici sayfa okuma/geçiş hatalarını en fazla üç kez dener; depolama, şema, sahiplik ve Etsy yazma hatalarını yeniden denemez. Teknik hata raporları oturum verisi veya sayfa içeriği toplamaz. Listing Analyzer ve Keyword & Market Analyzer güncelleme denetimleri GitHub `main` commit kimliğini doğrular, içeriği yalnız değişmez commit Raw yolundan okur ve aynı doğrulanmış URL’yi Tampermonkey onay ekranında açar.
- Keyword & Market Analyzer yalnız render edilmiş Marketplace Insights DOM'unu okur; cookie, token veya Etsy özel API kullanmaz. Kullanıcı araştırmayı başlattığında seed keyword normal Etsy arama navigasyonunda `query` olarak Etsy'ye gider ve kota tüketebilir; bu aktarımı gizlemek veya kotayı atlatmak güvenlik/doğruluk sınırını ihlal eder. `Search results` Etsy sonucu/rekabet göstergesi, fırsat puanı ise Makaytron türetilmiş sinyali olarak kalmalıdır. Eksik metrik uydurmak veya bu ayrımı kaldırmak güvenlik ve doğruluk etkili kabul edilir.
- İki analyzer entegrasyonu schema/type, `requestId`, tek kullanımlık nonce, son kullanma zamanı, 64 KiB boyut sınırı ve içerik hash'i doğrular. Companion yokken sessiz kurulum, uzaktan kod çalıştırma, stale/replay sonucu kabul etme veya araştırma sonucunu otomatik Publish'e dönüştürme güvenlik sınırını ihlal eder.
- Uygulama içi otomatik güncelleme kontrolleri 24 saatten sık çalışmaz; kullanıcı tıklaması olmadan kurulum sayfası açılmaz ve başka dağıtım kaynağı üzerine GitHub güncellemesi zorlanmaz.

## Kapsam

Kimlik doğrulama bilgisi sızıntısı, istem dışı Etsy gönderimi, yanlış kampanya oluşturma, istem dışı reklam veya listing değişikliği/deaktivasyonu, listing/keyword araştırma geçmişinin ifşası, entegrasyon replay/stale sonucu, kural veya güncelleme zinciri manipülasyonu ve güven sınırlarını aşan üçüncü taraf istekleri güvenlik bildirimi kapsamındadır.

İşlenen veri türleri, yerel saklama ve üçüncü taraf alıcıları için [PRIVACY.md](./PRIVACY.md) dosyasını okuyun.
