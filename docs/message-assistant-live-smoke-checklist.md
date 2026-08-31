# Message Assistant kontrollü canlı smoke-test kontrol listesi

Bu belge, gerçek bir Etsy hesabındaki doğrulamanın insan kontrolünde yürütülmesi içindir. Yerel veya CI testlerinin geçmesi canlı mesaj gönderme izni vermez. Son gönderme işlemi yalnız hesap sahibi tam alıcıyı, siparişi ve mesajı gördükten sonra yanınızdayken açıkça onay verirse yapılır.

## Durma koşulları

Aşağıdakilerden biri varsa mesaj göndermeden durun:

- Hesap sahibi yanınızda değilse veya bu tek mesaj için açıkça onay vermediyse.
- Sipariş, alıcı, teslim durumu, konuşma ya da mesaj amacı belirsizse.
- Aynı mesaj daha önce gönderilmiş olabilirse, başka bir Message Assistant sekmesi etkinse veya durum `pending`/bilinmiyor ise.
- Gönder düğmesi yoksa, birden fazlaysa, devre dışıysa, yalnız genel bir etikete sahipse ya da beklenen konuşma formunun dışındaysa.
- Compose rotası değişmiş fakat sipariş/alıcı kimliği henüz yüklenmemişse veya tam eşleşmiyorsa.
- Etsy beklenmeyen yönlendirme, uyarı, CAPTCHA, hız sınırı, yeniden giriş ya da politika istemi gösteriyorsa.

Sonucu belirsiz bir gönderimi tekrar denemeyin. Önce konuşmada yeni bir giden mesaj olup olmadığını inceleyin ve durumu elle uzlaştırın.

## Etsy'yi açmadan önce

- [ ] İncelenen commit'i ve userscript sürümünü (`1.2.4`) kaydedin.
- [ ] Aynı commit'te odaklı testlerin, localhost fixture smoke testinin ve dağıtım kapısının geçtiğini doğrulayın.
- [ ] Canlı hesap dışında, izole fixture/test agent'ında belirsiz sonuç → manuel uzlaştırma → aynı job tekrarında sıfır Etsy tıklaması zincirini doğrulayın. Bu prova geçmeden canlı Message Center testi yapmayın.
- [ ] Hesap sahibiyle birlikte tek bir teslim edilmiş sipariş ve meşru, Etsy politikalarına uygun mesaj amacı seçin.
- [ ] Alıcıya aynı iletişimin daha önce gönderilmediğini ve geçmiş/durum kontrollerinin alıcıyı dışlamadığını doğrulayın.
- [ ] Gizli bilgi veya test spam'i içermeyen kısa ve zararsız bir taslak hazırlayın.
- [ ] Tam olarak bir gönderim yolu seçin. İlgisiz campaign/agent akışlarını kapatın; yalnız kontrollü yolun çalışması için yinelenen Etsy mesaj ve sipariş sekmelerini kapatın.
- [ ] Çerez, nonce, alıcı metni, sipariş kimliği, kimliği doğrulanmış HTML veya redakte edilmemiş ekran görüntüsünün log/issue içine kopyalanmayacağını kararlaştırın.

## Kontrollü canlı çalışma

- [ ] Seçilen teslim edilmiş sipariş için tek bir yeni Etsy sekmesi açın; ilgisiz mevcut sekmelere dokunmayın.
- [ ] Mağaza/hesabı, teslim durumunu, tam siparişi, alıcıyı ve hedef konuşmayı gözle doğrulayın.
- [ ] Message Assistant akışını yalnız bu sipariş için başlatın. Batch veya sürekli modu kullanmayın.
- [ ] Asistanın tek bir güvenilir konuşma kapsamı ve açıkça etiketlenmiş tek bir gönder düğmesi bulduğunu doğrulayın.
- [ ] Oluşturulan taslağı önceden onaylanan metinle karşılaştırın. Her yönlendirmeden sonra alıcıyı ve siparişi yeniden doğrulayın.
- [ ] Son Etsy gönderme işleminden hemen önce durun.
- [ ] Hesap sahibi taslağın tamamını okuyup bu tek mesajın şimdi gönderilmesini açıkça söylesin.
- [ ] Bir kez tıklayın. Doğrulama beklerken çift tıklamayın, yenilemeyin, sayfadan ayrılmayın veya başka akış başlatmayın.
- [ ] Rota ve DOM yerleşene kadar bekleyin. Doğru konuşmada tam bir yeni giden balon oluştuğunu doğrulayın.
- [ ] Asistanın konuşma/sipariş durumunu `sent` olarak kaydettiğini ve tek campaign öğesini ikinci öğe oluşturmadan tamamladığını doğrulayın.

## Hata yönetimi

- [ ] Giden balon oluşmadıysa ve gönderimin kesinlikle gerçekleşmediği biliniyorsa yalnız redakte edilmiş tanı bilgilerini kaydedin; inceleme için öğeyi gönderilmemiş bırakın.
- [ ] Gönderim gerçekleşmiş olabilir ise durumu bilinmiyor kabul edin: yeniden göndermeyin, agent'ı çalıştırmayın ve güvenli bir bekleme/yenileme sonrasında konuşmayı inceleyin.
- [ ] Kimlik, kapsam veya düğme seçimi yanlışsa kontrollü sekmeyi kapatıp kod değişikliğinden önce localhost fixture'a dönün.
- [ ] Canlı testi geçirmek için tam kimlik kontrolünü, açık düğme etiketini, sekmeler arası kilidi veya belirsizlikte durma davranışını zayıflatmayın.

## Temizlik ve kanıt

- [ ] Sonuç doğrulandıktan sonra kontrollü çalışma için açılan sekmeyi kapatın.
- [ ] Arka planda campaign/agent kalmadığını ve bekleyen rezervasyon ya da sekmeler arası kilit bulunmadığını doğrulayın.
- [ ] Yalnız bu test için bilerek değiştirilmiş ayarları geri alın.
- [ ] Sonucu, zamanı, sürümü ve redakte edilmiş gözlemleri kaydedin; müşteri içeriği veya kimliği doğrulanmış Etsy verisi saklamayın.
- [ ] Geçen test için şu kanıtı kaydedin: bir onaylı tıklama, bir giden mesaj, doğru kimlik, terminal `sent` durumu ve sıfır tekrar denemesi.

English version: [message-assistant-live-smoke-checklist.en.md](./message-assistant-live-smoke-checklist.en.md)
