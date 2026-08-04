# Keyword & Market Analyzer kullanıcı dry-run listesi

Bu liste kullanıcı kontrollü son doğrulamadır. Gerçek hesap HTML'ini, çerezleri, müşteri veya mağaza verilerini repoya ya da bir issue'ya eklemeyin.

## Ön koşullar

- [ ] Kurulan dosyanın adı `Makaytron-Etsy-Keyword-Market-Analyzer.user.js`, ürün adı **Makaytron Etsy Keyword & Market Analyzer**, sürümü `1.0.2`.
- [ ] Kurulum kaynağı canonical `scripts/etsy-keyword-market-analyzer` raw adresi.
- [ ] Etsy Marketplace Insights kotası ve olası sorgu maliyeti kullanıcı tarafından görüldü.
- [ ] Test edilecek keyword kişisel, müşteri veya sipariş verisi içermiyor.

## Tek başına kullanım

- [ ] Yalnız Keyword & Market Analyzer kurulu iken Marketplace Insights rotası dışında panel oluşmuyor.
- [ ] Marketplace Insights'ta sağ kenardaki beyaz Makaytron logolu açıcı, ürün adı, `v1.0.2`, TR/EN ve erişilebilir durum metni görünüyor.
- [ ] Panel ve veri şeritleri siyah/beyaz/nötr gri; birincil eylem siyah; renk yalnız metinle etiketlenmiş küçük fırsat ve trend rozetlerinde kullanılıyor.
- [ ] Kullanıcı eylemi olmadan yeni keyword araması veya Etsy yazma işlemi başlamıyor.
- [ ] Bir sonuç sayfasında ana keyword ve benzer terimler okunuyor; her özgün satırın altında en fazla bir Makaytron detay satırı oluşuyor.
- [ ] Aramalar son 30 gün, Search results Etsy sonucu/rekabet göstergesi, trend varsa 7 günlük değişim olarak doğru etiketleniyor.
- [ ] Fırsat puanı Etsy metriği veya satış garantisi değil, Makaytron türetilmiş sinyali olarak gösteriliyor.
- [ ] DOM alanı eksik veya sayı çözümlenemiyorsa `null`/uygun boş durum görülüyor; veri uydurulmuyor.
- [ ] React yeniden render, sıralama veya sayfalama detay satırlarını çoğaltmıyor.
- [ ] Durdur eylemi sıradaki seed sorgusunu engelliyor; timeout ana işlevi kilitlemiyor.
- [ ] JSON dışa aktarımı ham HTML, cookie, access token, müşteri, sipariş veya mağaza oturumu içermiyor.

## Listing Analyzer ile kullanım

- [ ] Yalnız Listing Analyzer kurulu iken **Pazar araştırmasını başlat** companion kontrolünü yalnız tıklama anında yapıyor.
- [ ] Companion yok modalı nedeni açıklıyor; İptal hiçbir sekme açmıyor.
- [ ] **Yükleme sayfasını aç** canonical `etsy-keyword-market-analyzer` `.user.js` adresini açıyor; son kurulum onayı Tampermonkey'de kalıyor.
- [ ] İki script kurulu iken `PROBE → CAPABILITIES → RESEARCH_REQUEST → RESEARCH_ACK → RESEARCH_RESULT → RESEARCH_RECEIVED` zinciri tamamlanıyor.
- [ ] Yanlış nonce, süresi dolmuş, yinelenen, 64 KiB üstü veya listing içerik hash'i değişmiş sonuç fail-closed reddediliyor.
- [ ] Listing Analyzer'ın kopyaladığı tam `RESEARCH_REQUEST` JSON'u Keyword Analyzer'a içe aktarılabiliyor; üretilen tam `RESEARCH_RESULT` JSON'u kopyalanıp/indirilebiliyor ve Listing Analyzer'a içe aktarılabiliyor.
- [ ] Eksik/fazla alanlı, bozuk veya süresi dolmuş fallback JSON'u iki tarafta da işlem başlatmadan reddediliyor.
- [ ] Insights sekmesinin adresinde nonce, başlık, tag veya request payload'ı bulunmuyor.
- [ ] Analyzer sekmesi kapanırsa araştırma bağımsız kullanım ve JSON kurtarma yolunu koruyor.
- [ ] Listing Analyzer'ın araştırma kanıtından yerelde ürettiği başlık/tag önerisi metrikleri gösteriyor fakat Etsy editörüne otomatik yazmıyor ve Publish'e basmıyor.

## Çoklu sekme ve teslimat dayanıklılığı

- [ ] İki Marketplace Insights sekmesi açıkken aynı request için yalnız lider sekme sorgu/navigasyon ve tek bir sonuç üretiyor.
- [ ] Lider sekme kapanınca lease süresi dolduktan sonra diğer sekme işi tek kez devralıyor; iki sonuç veya iki paralel navigasyon oluşmuyor.
- [ ] `RESEARCH_RECEIVED` kaybolursa sonuç sınırlı süre yeniden gönderilebiliyor; teslimat süresi dolunca kayıt budanıyor ve 30 kayıtlık kuyruk kapasitesi geri kazanılıyor.
- [ ] Listing Analyzer sonucu stale/geçersiz diye reddederse eşleşen request/nonce için Keyword Analyzer terminal duruma geçiyor ve sonsuz yeniden gönderim yapmıyor.

## Güncelleme ve temizleme

- [ ] Otomatik uygulama içi güncelleme denetimi 24 saatten sık çalışmıyor; manuel denetim kullanıcı eylemiyle çalışıyor.
- [ ] Greasy Fork veya başka dağıtım kaynağı simülasyonunda GitHub güncellemesi zorlanmıyor.
- [ ] Yalnız iki metadata URL'si de tam canonical, HTTPS ve parametresiz `.user.js` yoluysa GitHub kanalı kabul ediliyor; fork/farklı yol/port/query/hash/credentials ve karışık URL'ler reddediliyor.
- [ ] Aktif araştırmada güncelleme kurulum sayfası açılmıyor.
- [ ] Cache yedi gün/üst sınır kuralıyla temizleniyor ve paneldeki temizleme eylemi yerel araştırma verisini kaldırıyor.
- [ ] Aynı bağımsız kullanım ve iki-script turu güncel Firefox Tampermonkey ile Microsoft Edge Tampermonkey'de tekrarlanıyor.

Her başarısız madde için tarayıcı, Tampermonkey sürümü, rota ve hassas verileri ayıklanmış kanıt kaydedilir. Canlı listing Publish, deaktivasyon veya delete bu dry-run kapsamına dahil değildir.
