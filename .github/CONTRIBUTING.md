# Contributing / Katkıda Bulunma

Thank you for helping improve Makaytron Etsy Automation Tools. This guide is
bilingual; the English instructions are followed by Turkish instructions.

## English

### Choose the correct channel

- Use the repository's [issue forms](https://github.com/Makaytron/Etsy-Automation-Tools/issues/new/choose) for reproducible bugs and focused feature requests.
- Read [Support](../SUPPORT.en.md), then use [Q&A Discussions](https://github.com/Makaytron/Etsy-Automation-Tools/discussions/categories/q-a) for general usage questions.
- Report vulnerabilities and exposed credentials only through the private process in [Security](../SECURITY.en.md).
- Follow the [Code of Conduct](./CODE_OF_CONDUCT.md) in issues, discussions, reviews, and pull requests.

Never publish API keys, cookies, access tokens, nonces, buyer messages, order
information, shop or listing identifiers, Etsy metrics, or authenticated Etsy
HTML. Screenshots and logs must be redacted.

### Prepare a change

1. Fork the repository or create a focused branch from the current `main`.
2. Keep each pull request limited to one clear concern and identify every affected userscript.
3. Prefer synthetic fixtures and read-only checks. Do not perform destructive, irreversible, or repeated experiments on a live Etsy account.
4. Preserve explicit user confirmation, exact identity checks, cross-tab locks, and fail-closed behavior for every Etsy write path.
5. Update both Turkish and English user documentation when visible behavior changes.
6. Do not change suite or userscript versions, release headings, tags, hosted URLs, or release assets unless a maintainer explicitly requests a release.

### Validate locally

Run the focused behavior test for the component you changed, then run the full
distribution gate before requesting review:

```powershell
node --test tools/Test-Message-Assistant.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1
git diff --check
```

Replace the focused test with the matching `tools/Test-*.mjs` file when working
on another userscript. Include the exact commands and results in the pull
request. Network, hosted-channel, or live Etsy checks are not substitutes for
the local behavior tests. For documentation- or community-only changes with no
behavior impact, explain `N/A` for the focused behavior test; the full
distribution gate and `git diff --check` still apply.

### Open the pull request

Complete the pull request template with:

- A concise summary and the affected script or repository area
- Safety, privacy, and live Etsy-write impact
- Tests run and their results
- Documentation or changelog changes, or a clear `N/A` explanation

Contributions are licensed under the repository's [MIT License](../LICENSE).

## Türkçe

### Doğru kanalı seçin

- Tekrarlanabilir hatalar ve somut özellik önerileri için deponun [issue formlarını](https://github.com/Makaytron/Etsy-Automation-Tools/issues/new/choose) kullanın.
- Genel kullanım soruları için [Destek](../SUPPORT.md) belgesini okuyup [Soru-Cevap Discussions](https://github.com/Makaytron/Etsy-Automation-Tools/discussions/categories/q-a) alanını kullanın.
- Güvenlik açıklarını ve açığa çıkmış kimlik bilgilerini yalnız [Güvenlik](../SECURITY.md) belgesindeki özel akıştan bildirin.
- Issue, discussion, inceleme ve pull requestlerde [Davranış Kuralları](./CODE_OF_CONDUCT.md) geçerlidir.

API anahtarı, çerez, erişim belirteci, nonce, müşteri mesajı, sipariş bilgisi,
mağaza veya listing kimliği, Etsy metriği ya da kimliği doğrulanmış Etsy HTML'i
yayımlamayın. Ekran görüntülerini ve logları redakte edin.

### Değişikliği hazırlayın

1. Depoyu forklayın veya güncel `main` üzerinden odaklı bir dal oluşturun.
2. Her pull requesti tek bir net konuyla sınırlayın ve etkilenen userscriptleri belirtin.
3. Sentetik fixture ve salt-okunur kontrolleri tercih edin. Canlı Etsy hesabında yıkıcı, geri döndürülemez veya tekrarlı deneyler yapmayın.
4. Etsy yazma akışlarında açık kullanıcı onayını, kesin kimlik kontrollerini, sekmeler arası kilitleri ve belirsizlikte durma davranışını koruyun.
5. Görünür davranış değiştiğinde Türkçe ve İngilizce kullanıcı belgelerini birlikte güncelleyin.
6. Maintainer açıkça bir yayın istemedikçe suite/userscript sürümlerini, release başlıklarını, tagleri, hosted URL'leri veya release varlıklarını değiştirmeyin.

### Yerelde doğrulayın

Önce değiştirdiğiniz bileşenin davranış testini, ardından tam dağıtım kapısını
çalıştırın:

```powershell
node --test tools/Test-Message-Assistant.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1
git diff --check
```

Başka bir userscript üzerinde çalışıyorsanız odaklı komutta ilgili
`tools/Test-*.mjs` dosyasını kullanın. Tam komutları ve sonuçları pull requestte
belirtin. Ağ, hosted kanal veya canlı Etsy kontrolü yerel davranış testlerinin
yerine geçmez. Yalnız dokümantasyon veya topluluk dosyalarını değiştiren ve
davranış etkisi olmayan katkılarda odaklı davranış testi için `N/A` gerekçesi
yazın; tam dağıtım kapısı ile `git diff --check` yine geçmelidir.

### Pull request açın

Pull request şablonunda şunları doldurun:

- Kısa özet ve etkilenen script/depo alanı
- Güvenlik, gizlilik ve canlı Etsy yazma etkisi
- Çalıştırılan testler ve sonuçları
- Dokümantasyon/changelog değişiklikleri veya açık bir `N/A` gerekçesi

Katkılar deponun [MIT Lisansı](../LICENSE) kapsamında yayımlanır.
