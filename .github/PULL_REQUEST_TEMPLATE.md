## Summary / Özet

<!-- Explain what changed and why. Değişikliği ve nedenini açıklayın. -->

## Scope / Kapsam

- Affected script or repository area / Etkilenen script veya depo alanı:
- Related issue / İlgili issue:

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
