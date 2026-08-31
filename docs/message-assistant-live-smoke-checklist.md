# Message Assistant kontrollü canlı smoke-test kontrol listesi

Bu belge, açık opt-in Otopilotun gerçek bir Etsy hesabında yalnız kontrollü tek alıcıyla doğrulanması içindir. Yerel veya CI testlerinin geçmesi canlı mesaj gönderme izni vermez. Canlı Otopilot ancak hesap sahibi tam alıcıyı, siparişi, mesajı ve tek öğelik seçimi gördükten sonra yanınızdayken **Otopilotu Başlat** diyerek bu kampanyayı açıkça onaylarsa başlatılır.

## Durma koşulları

Aşağıdakilerden biri varsa mesaj göndermeden durun:

- Hesap sahibi yanınızda değilse veya bu tek alıcılı Otopilot kampanyasını açıkça onaylamadıysa.
- Birden fazla alıcı seçiliyse, seçim özeti net değilse ya da ana işlem açıkça **Otopilotu Başlat** olarak görünmüyorsa.
- Sipariş, alıcı, teslim durumu, konuşma ya da mesaj amacı belirsizse.
- Sipariş satırında aynı-origin `/shop/<shop>/reviews/<numeric>` adresine giden ve tam **Review** veya **Yorum** etiketli bağlantı varsa ya da asistan siparişi `review_exists` olarak gösteriyorsa.
- Review/Yorum bağlantısının görünmemesi dışında alıcının yorum bırakmadığına dair güncel manuel doğrulama yoksa; bağlantı yokluğunu otomatik uygunluk saymayın.
- Aynı mesaj daha önce gönderilmiş olabilirse, başka bir Message Assistant sekmesi etkinse veya durum `pending`/bilinmiyor ise.
- Gönder düğmesi yoksa, birden fazlaysa, devre dışıysa, yalnız genel bir etikete sahipse ya da beklenen konuşma formunun dışındaysa.
- Compose rotası değişmiş fakat sipariş/alıcı kimliği henüz yüklenmemişse veya tam eşleşmiyorsa.
- Etsy beklenmeyen yönlendirme, uyarı, CAPTCHA, hız sınırı, yeniden giriş ya da politika istemi gösteriyorsa.

Sonucu belirsiz bir gönderimi tekrar denemeyin. Önce konuşmada yeni bir giden mesaj olup olmadığını inceleyin ve durumu elle uzlaştırın.

## Etsy'yi açmadan önce

- [ ] İncelenen commit'i ve userscript sürümünü (`1.2.5`) kaydedin.
- [ ] Aynı commit'te odaklı testlerin, localhost fixture smoke testinin ve dağıtım kapısının geçtiğini doğrulayın.
- [ ] Canlı hesap dışında, izole fixture/test agent'ında belirsiz sonuç → manuel uzlaştırma → aynı job tekrarında sıfır Etsy tıklaması zincirini doğrulayın. Bu prova geçmeden canlı Message Center testi yapmayın.
- [ ] Hesap sahibiyle birlikte tek bir teslim edilmiş sipariş ve meşru, Etsy politikalarına uygun mesaj amacı seçin.
- [ ] Alıcıya aynı iletişimin daha önce gönderilmediğini ve geçmiş/durum kontrollerinin alıcıyı dışlamadığını doğrulayın.
- [ ] Fixture'da Completed Orders UI yenilemesinin strict aynı-origin, sayı kimlikli ve tam **Review/Yorum** etiketli satır bağlantısını kalıcı `review_exists` blokuna çevirdiğini; yanlış origin/yol/etiketin kabul edilmediğini doğrulayın.
- [ ] İsim, ürün başlığı, dashboard yorum kartı veya public mağaza HTML'i ile eşleştirme yapılmadığını ve bağlantı yokluğunun otomatik **Yorum yok** üretmediğini doğrulayın. Kontrollü sipariş için güncel manuel **Yorum yok** onayını verin; iki saatlik süreyi aşmayın.
- [ ] Gizli bilgi veya test spam'i içermeyen kısa ve zararsız bir taslak hazırlayın.
- [ ] Eski/global **Otomatik Gönderim** ayarının bu kampanya veya yorum talebi için yetki sayılmadığını; yeni kampanyanın ayrı **Otopilotu Başlat** opt-in'i istediğini doğrulayın.
- [ ] **Duraklat**, **Devam Et** ve **Otomasyonu Bitir / Durdur** kontrollerinin görünür ve anlaşılır olduğunu doğrulayın.
- [ ] Tam olarak bir gönderim yolu seçin. İlgisiz campaign/agent akışlarını kapatın; yalnız kontrollü yolun çalışması için yinelenen Etsy mesaj ve sipariş sekmelerini kapatın.
- [ ] Çerez, nonce, alıcı metni, sipariş kimliği, kimliği doğrulanmış HTML veya redakte edilmemiş ekran görüntüsünün log/issue içine kopyalanmayacağını kararlaştırın.

## Kontrollü canlı çalışma

- [ ] Seçilen teslim edilmiş sipariş için tek bir yeni Etsy sekmesi açın; ilgisiz mevcut sekmelere dokunmayın.
- [ ] Mağaza/hesabı, teslim durumunu, tam siparişi, alıcıyı ve hedef konuşmayı gözle doğrulayın.
- [ ] **Otomasyon** görünümünde yalnız bu siparişi seçin. Bu smoke testte çok alıcılı kampanya oluşturmayın; doğrulanan sözleşme tek kontrollü alıcıyla çalışan gerçek Otopilottur.
- [ ] **Otopilotu Başlat** öncesindeki UI yenilemesinin yorum kanıtını yeniden uyguladığını doğrulayın. Kesin pozitif görünürse sipariş seçili veya kuyrukta kalmamalı ve canlı testi göndermeden bitirmelisiniz.
- [ ] Fixture'da, seçilmiş/kuyrukta/hazırlanmış öğede kesin pozitif kanıt sonradan belirdiğinde gönderim anı uygunluk korumasının composer veya Etsy Send etkinliğinden önce durduğunu doğrulayın; bu davranışı canlı gönderimle kışkırtmayın.
- [ ] Asistanın tek bir güvenilir konuşma kapsamı ve açıkça etiketlenmiş tek bir gönder düğmesi bulduğunu doğrulayın.
- [ ] Oluşturulan taslağı önceden onaylanan metinle karşılaştırın. Her yönlendirmeden sonra alıcıyı ve siparişi yeniden doğrulayın.
- [ ] **Otopilotu Başlat** işleminden hemen önce durun; seçili sayının `1`, şablonun ve yöntemin beklenen değer olduğunu yeniden okuyun.
- [ ] Hesap sahibi taslağın tamamını okuyup bu tek alıcılı kampanyanın şimdi Otopilotla çalışmasını açıkça söylesin.
- [ ] **Otopilotu Başlat** düğmesine bir kez basın. Etsy'nin native Gönder düğmesine ayrıca basmayın; doğrulama beklerken çift tıklamayın, yenilemeyin, sayfadan ayrılmayın, **Devam Et** kullanmayın veya başka akış başlatmayın.
- [ ] Otopilotun yalnız bu alıcının kalıcı rezervasyon/taslak durumunu oluşturduğunu ve ikinci bir alıcıyı sahiplenmediğini doğrulayın.
- [ ] Rota ve DOM yerleşene kadar bekleyin. Doğru konuşmada tam bir yeni giden balon oluştuğunu doğrulayın.
- [ ] Asistanın outgoing balon doğrulamasından sonra konuşma/sipariş/kampanya öğesini kalıcı `sent` olarak kaydettiğini ve ikinci öğe veya tekrar gönderim oluşturmadan tamamlandığını doğrulayın.

## Hata yönetimi

- [ ] Giden balon oluşmadıysa ve gönderimin kesinlikle gerçekleşmediği biliniyorsa yalnız redakte edilmiş tanı bilgilerini kaydedin; Otopilotun durduğunu doğrulayın ve öğeyi inceleme için gönderilmemiş bırakın.
- [ ] Gönderim gerçekleşmiş olabilir ise durumu `pending`/şüpheli kabul edin: **Devam Et** veya **Otopilotu Başlat** kullanmayın, yeniden göndermeyin, agent'ı çalıştırmayın ve güvenli bir bekleme/yenileme sonrasında doğru konuşmayı inceleyin.
- [ ] Kimlik, metin, kapsam veya outgoing kanıtı uyuşmazsa Otopilotun otomatik tekrar göndermeden durduğunu; sıradaki alıcının başlamadığını doğrulayın.
- [ ] Kimlik, kapsam veya düğme seçimi yanlışsa kontrollü sekmeyi kapatıp kod değişikliğinden önce localhost fixture'a dönün.
- [ ] Canlı testi geçirmek için tam kimlik kontrolünü, açık düğme etiketini, sekmeler arası kilidi veya belirsizlikte durma davranışını zayıflatmayın.

## Temizlik ve kanıt

- [ ] Sonuç doğrulandıktan sonra kontrollü çalışma için açılan sekmeyi kapatın.
- [ ] Kampanya terminal değilse önce güvenli durumda **Duraklat** veya **Otomasyonu Bitir / Durdur** kullanın; çözülmemiş bir gönderimi sırf temizlik için `Gönderilmedi` saymayın.
- [ ] Arka planda çalışan Otopilot/campaign/agent kalmadığını ve bekleyen rezervasyon ya da sekmeler arası kilit bulunmadığını doğrulayın.
- [ ] Yalnız bu test için bilerek değiştirilmiş ayarları geri alın.
- [ ] Sonucu, zamanı, sürümü ve redakte edilmiş gözlemleri kaydedin; müşteri içeriği veya kimliği doğrulanmış Etsy verisi saklamayın.
- [ ] Geçen test için şu kanıtı kaydedin: bir açık Otopilot opt-in'i, bir kontrollü alıcı, bir giden mesaj, doğru kimlik, outgoing doğrulaması, terminal kalıcı `sent` durumu ve sıfır tekrar denemesi.

English version: [message-assistant-live-smoke-checklist.en.md](./message-assistant-live-smoke-checklist.en.md)
