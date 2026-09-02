## Summary / Özet

<!-- Explain what changed and why. Değişikliği ve nedenini açıklayın. -->

## Scope / Kapsam

- Affected script or repository area / Etkilenen script veya depo alanı:
- Related issue / İlgili issue:

## Design-source compliance / Tasarım kaynağı uyumu

<!-- Complete this section for every visible UI change. Görünür UI değişikliklerinde bu bölümü doldurun. -->

- UI changed / UI değişti: `Yes / No`
- Shell/template source and exact path / Shell-template kaynağı ve kesin yolu:
- ShadcnStore block URL, family, name and number / ShadcnStore blok URL'si, ailesi, adı ve numarası:
- Toast-01 mapping, or `N/A` when no transient feedback exists / Toast-01 eşlemesi veya geçici bildirim yoksa `N/A`:
- Makaytron adaptation summary / Makaytron uyarlama özeti:

- [ ] I used [Tamplate-Back-White-01](https://github.com/Makaytron/Tamplate-Back-White-01) as the primary application template. / Ana uygulama template'i olarak Tamplate-Back-White-01 kullandım.
- [ ] I selected component anatomy from the [applied dashboard](https://shadcnstore.com/templates/dashboard/shadcn-dashboard-landing-template/dashboard) or a named [ShadcnStore block](https://shadcnstore.com/blocks). / Bileşen anatomisini uygulanmış dashboard veya adı belirtilmiş ShadcnStore bloğundan seçtim.
- [ ] Every new or modified toast/snackbar/notification follows [Toast-01](https://github.com/Makaytron/Toast-01), or this is `N/A`. / Yeni veya değiştirilen her toast/snackbar/bildirim Toast-01'i izliyor veya bu değişiklik için `N/A`.
- [ ] I did not invent an unapproved card, menu, sidebar, modal, table, filter, empty state, toolbar, loader, alert or toast. / Onaysız kart, menü, sidebar, modal, tablo, filtre, boş durum, toolbar, loader, uyarı veya toast üretmedim.
- [ ] Existing behavior hooks and safety contracts remain intact. / Mevcut davranış hookları ve güvenlik sözleşmeleri korunuyor.

## Safety and privacy / Güvenlik ve gizlilik

- [ ] I did not include secrets, Etsy session data, buyer messages, order information, real or non-public shop/listing identifiers, private metrics, or authenticated Etsy HTML. / Secret, Etsy oturum verisi, müşteri mesajı, sipariş bilgisi, gerçek veya herkese açık olmayan mağaza/listing kimliği, özel metrik ya da kimliği doğrulanmış Etsy HTML'i eklemedim.
- [ ] Screenshots, fixtures, and logs are synthetic or fully redacted. / Ekran görüntüleri, fixturelar ve loglar sentetik ya da tamamen redakte edildi.
- [ ] Explicit user confirmation and fail-closed behavior remain intact for Etsy write paths, or the impact is explained below. / Etsy yazma yollarında açık kullanıcı onayı ve belirsizlikte durma davranışı korunuyor ya da etkisi aşağıda açıklanıyor.

Live Etsy-write impact / Canlı Etsy yazma etkisi:

<!-- Write N/A when there is no live-write impact. Etki yoksa N/A yazın. -->

## Validation / Doğrulama

Commands and results / Komutlar ve sonuçlar:

```text

```

- [ ] Relevant focused behavior tests pass, or `N/A`/the limitation is explained. / İlgili odaklı davranış testleri geçti veya `N/A`/sınırlama açıklandı.
- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-Distribution.ps1` passes, or the limitation is explained. / Tam dağıtım testi geçti veya sınırlama açıklandı.
- [ ] `git diff --check` passes. / `git diff --check` geçti.

## Documentation and release / Dokümantasyon ve yayın

- [ ] Turkish and English documentation were updated together, or this is `N/A`. / Türkçe ve İngilizce belgeler birlikte güncellendi veya bu değişiklik için `N/A`.
- [ ] I did not change versions, tags, hosted URLs, or release assets without an explicit maintainer release request. / Açık maintainer yayın talebi olmadan sürüm, tag, hosted URL veya release varlığı değiştirmedim.
