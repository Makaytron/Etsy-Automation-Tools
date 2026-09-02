# Makaytron Etsy Keyword & Market Analyzer

<p><strong>Türkçe</strong> · <a href="./README.en.md">English</a></p>

**Kısa ad:** Etsy Keyword & Market Analyzer

**Sürüm:** 1.0.4

**Kullanım rehberi:** [Türkçe](./USAGE.md) · [English](./USAGE.en.md)

Etsy Marketplace Insights sonuç sayfasındaki ana sorguyu ve en fazla 25 benzer arama terimini okur. Her anahtar kelimenin altında Etsy'nin 30 günlük arama sayısını, arama sonucu göstergesini, varsa 7 günlük değişimi, yakalama zamanını ve açıkça Makaytron tarafından türetilen fırsat puanını gösterir.

Bu proje Etsy tarafından hazırlanmış, desteklenmiş veya onaylanmış değildir. Etsy adı yalnız desteklenen sayfayı tanımlamak için kullanılır.

## Bağımsız kullanım

Script tek başına tam çalışır; Makaytron Etsy Listing Analyzer kurulumu zorunlu değildir.

1. Userscript yöneticinizde [canonical kurulum dosyasını](https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-keyword-market-analyzer/Makaytron-Etsy-Keyword-Market-Analyzer.user.js) açın ve kurulumu yöneticinizde onaylayın.
2. Etsy Shop Manager içindeki Marketplace Insights sayfasına gidin.
3. Sağ kenardaki beyaz Makaytron logolu açıcıdan paneli açın.
4. Bir anahtar kelimeyi Etsy Insights'ta aratın veya açık sonuç sayfasını analiz edip kaydedin.
5. Yapısal sonuç geçmişini JSON olarak dışa aktarabilirsiniz.

Script Etsy aramasını yalnız kullanıcı eylemiyle açar. Her seed, normal Marketplace Insights arama rotasına `query=<anahtar kelime>` değeriyle gider. Bu Etsy tarafında normal bir Insights aramasıdır; Etsy'nin araştırma kotasını veya varsa hesap planına bağlı maliyeti tüketebilir. Kota, hesap erişimi ve gösterilen değerler Etsy tarafından yönetilir.

## Görsel sistem

Panel, açıcı ve satır altı veri şeritleri ortak Makaytron userscript standardına göre siyah, beyaz ve gri tonlarını kullanır. Yüksek/orta/düşük fırsat ile yükselen/düşen trend renkleri yalnız küçük ve metinle etiketlenmiş semantik rozetlerde gösterilir. Satır altı veriler kompakt kalır ve Etsy tablosunun yüksekliğini gereksiz büyütmez.

## Listing Analyzer entegrasyonu

Makaytron Etsy Listing Analyzer da kuruluysa iki script aynı Etsy origin'i üzerinde sürümlü bir `BroadcastChannel` sözleşmesiyle konuşabilir:

- Kanal: `makaytron:etsy-keyword-market-analyzer:v1`
- Akış: `PROBE / CAPABILITIES / RESEARCH_READY / RESEARCH_REQUEST / RESEARCH_ACK / RESEARCH_RESULT / RESEARCH_RECEIVED / ERROR`
- İstekler `requestId`, tek kullanımlık `nonce`, zaman aşımı, 64 KiB mesaj sınırı ve içerik hash'i ile doğrulanır.
- Varsayılan araştırma bir seed, açık üst sınır üç seed'dir.
- Kuyruk sıralı işler; iptal edilebilir ve her DOM sonucu fail-closed zaman aşımına sahiptir.
- Sonuçlar yedi gün süreli ve üst sınırlı cache'de tutulur.
- Aynı origin'deki birden fazla Marketplace Insights sekmesinde GM-storage lease ile yalnız bir işlemci lider olur. Sayfa-instance kimliği ve başlangıçta çalışan sınırlı presence handshake, tarayıcının çoğalttığı sekmeler aynı history kimliğini miras alsa bile bunları ayırır; sürekli polling yapmaz. Kısa TTL yenilenir ve instance'a bağlanır; lider sekme kapanırsa veya lease süresi dolarsa başka sekme güvenli biçimde devralabilir. Böylece aynı iş için çift yönlenme ve çift sonuç önlenir.
- `RESEARCH_RESULT`, eşleşen `RESEARCH_RECEIVED { accepted: true }` gelene kadar `awaiting-receipt` durumunda tutulur. İstek deadline'ı dolarsa kayıt `RECEIPT_TIMEOUT` ile terminal olur; sonuç yükü kaldırılır ve sonraki `PROBE` mesajlarında yeniden gönderilmez. Eski terminal kuyruk kayıtları 24 saat sonra budanır.

### JSON fallback

İki script ayrı ayrı kullanılabilir. `BroadcastChannel` aktarımı kullanılamıyorsa Listing Analyzer'ın ürettiği **tam** `RESEARCH_REQUEST` zarfı paneldeki `Listing Analyzer araştırma zarfı (JSON)` alanına yapıştırılıp `Araştırma talebini içe aktar` ile başlatılabilir. İçe aktarma, otomatik aktarım ile aynı katı zarf, süre, gönderici, şema, boyut, nonce ve payload doğrulamasından geçer.

Tamamlanan geçerli **tam** `RESEARCH_RESULT` zarfı `Sonuç zarfını kopyala` veya `Sonuç zarfını indir` ile Listing Analyzer'a taşınabilir. Genel yakalama JSON'u bu entegrasyon zarfının yerine geçmez. Bu fallback cookie, token, oturum veya ham HTML içermez.

Listing Analyzer yoksa bağımsız özellikler etkilenmez. Entegrasyon sonucu hiçbir Etsy listing'ini otomatik değiştirmez; Listing Analyzer'ın normal inceleme ve kullanıcı onayı sınırına döner.

## Veriler ve izinler

| İzin / hedef | Neden gerekli |
| --- | --- |
| `@match https://www.etsy.com/your/shops/*/marketplace-insights*` | Yalnız Marketplace Insights açılış ve sonuç rotalarında çalışmak için. |
| `GM.getValue`, `GM.setValue`, `GM.deleteValue` | Ayar, üst sınırlı yapılandırılmış yakalama, kuyruk, geçerli sonuç zarfları, sekmeler arası kısa süreli işlemci lease'i ve 7 günlük cache; ayrıca açık onaylı yerel veri temizliği için. |
| `GM_registerMenuCommand` | Panel, yakalama, tam araştırma zarfı fallback'i, dışa aktarma ve manuel güncelleme denetimi kısayolları için. |
| `GM.xmlHttpRequest` + `@connect api.github.com` / `raw.githubusercontent.com` | En fazla 24 saatte bir public `main` commit kimliğini ve yalnız o değişmez committeki canonical userscript metadata'sını denetlemek için. `GM.xmlHttpRequest` Etsy için kullanılmaz; normal Marketplace Insights `query` navigasyonu yukarıda açıklanmıştır. |
| `GM.xmlHttpRequest` + `@connect` | Görünür ilk kullanım bildirimiyle varsayılan açık sınırlı psödonimleştirilmiş telemetri ve tek tık opt-out silme isteği için. |
| `GM.openInTab` | Yalnız kullanıcı onayından sonra canonical `.user.js` kurulum sayfasını açmak için. Son onay userscript yöneticisindedir. |
| `GM.info` | Kurulum kaynağını ayırt edip başka dağıtım platformlarının güncelleme mekanizmasını zorlamamak için. |

Script:

- cookie, parola, access token, tarayıcı profili veya Etsy özel API'si okumaz;
- Marketplace Insights verisini yalnız açık sayfanın DOM'undan okur;
- ham HTML, müşteri verisi veya mağaza oturumu saklamaz;
- `requestId`, `nonce` veya araştırma payload'ını Etsy arama URL'sine, fragment'e ya da history state'e yazmaz; URL'de yalnız normal `query` ve `search_trigger` bulunur;
- listing yazmaz, düzenlemez veya yayınlamaz;
- uzaktan kod indirip çalıştırmaz ve sessiz kurulum/güncelleme yapmaz;
- dışa aktarmaya yalnız yapılandırılmış anahtar kelime metriklerini dahil eder.

Telemetri ilk kullanımda görünür bildirimle varsayılan açıktır. Yalnız günlük açılma, başarılı araştırma tamamlanması ve kategorize hata sayaçları gönderilir. Ham hata metni, seed keyword, arama/sonuç/trend metriği, listing verisi, araştırma zarfı, Etsy kimliği veya URL gönderilmez. Ayarlar'dan kapatıldığında sunucudaki bu userscripte ait kaydın silinmesini ister. Ayrıntılar [Gizlilik](../../PRIVACY.md) belgesindedir.

### Yerel verileri temizleme

Panelde veya Tampermonkey menüsünde `Yerel verileri temizle` eylemi bulunur. Açık kullanıcı onayından sonra yalnız şu kayıtlar readback ile doğrulanarak silinir:

- kaydedilmiş yapılandırılmış araştırmalar (`captures`),
- yedi günlük araştırma cache'i (`cache`),
- bekleyen/tamamlanan araştırma kuyruğu (`queue`),
- geçerli tam sonuç zarfları (`results`),
- kısa süreli sekmeler arası işlemci lease'i (`lease`).

TR/EN dil ve arayüz tercihi korunur. Son güncelleme-denetimi zamanı da kişisel araştırma verisi olmadığı için korunur. Aktif bir entegrasyon işi varsa silmeden önce karşı tarafa `CANCELLED` sonucu bildirilir.

## Fırsat metriği

`searches30d` ve `searchResults` Etsy'nin sayfada gösterdiği verilerdir. `opportunity.score` Etsy metriği değildir. Talep büyüklüğü ile arama/sonuç oranını birleştiren, `metric: "makaytron-derived"` olarak işaretlenmiş karşılaştırma yardımcısıdır. Ürün ilgisi ve anahtar kelime doğruluğu ayrıca kullanıcı tarafından değerlendirilmelidir.

## Güncellemeler

Birincil güncelleme yolu userscript yöneticisinin `@updateURL` / `@downloadURL` mekanizmasıdır. Uygulama içi kontrol:

- canonical GitHub kurulumunda en fazla 24 saatte bir arka planda çalışır;
- ağ hatasında ana analiz özelliğini engellemez;
- manuel `Şimdi güncelleme denetle` eylemini destekler;
- aktif araştırma varken kurulum sayfasını açmaz;
- yalnız tam ürün adı, namespace, sürüm ve canonical `@updateURL` / `@downloadURL` metadata'sı doğrulanan değişmez commit dosyasını açar;
- ancak kullanıcı onayından sonra SHA'ya sabitlenmiş doğru `.user.js` dosyasını Tampermonkey onay ekranında açar; script kendini değiştirmez.

## Sınırlar

- Etsy DOM'u belirsiz veya eksikse analiz durur ve veri uydurmaz.
- `Search results` doğrudan satış veya tam rekabet sayısı değil, Etsy'nin gösterdiği arama sonucu göstergesidir.
- İlk araştırmadan önce ana sonuç ve benzer terim satırlarını kendi Marketplace Insights sayfanızda görsel olarak doğrulayın.
