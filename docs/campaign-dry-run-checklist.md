# Makaytron Etsy Sale Manager — Tek Günlük Dry-Run Kontrol Listesi

Bu kontrol listesi kullanıcı tarafından kendi mağazasında uygulanır. Kimlik bilgisi, çerez veya oturum paylaşmayın. **Seriyi Başlat** düğmesi canlı yazma yetkisidir: düğmeye basıldıktan sonra script, uygun Etsy adımlarını ve her kampanyanın final gönderim düğmesini otomatik tıklar. Ayrı bir kampanya başına manuel son onay yoktur.

## Önce

- Script sürümünü ve Tampermonkey izinlerini kontrol edin.
- Aynı mağaza için açık başka Etsy Sale Manager sekmesi olmadığını doğrulayın.
- Tek bir gün, düşük indirim oranı ve kolay tanınan benzersiz kampanya adı seçin.
- Dahil edilecek listing kapsamını Etsy ekranında elle doğrulayın.
- Çakışan veya aynı adlı mevcut kampanya olmadığını kontrol edin.

## Önizleme

- Başlangıç/bitiş tarihini, bölgeyi, indirim oranını ve listing kapsamını tek tek okuyun.
- Panelde belirsiz, yükleniyor veya doğrulanamadı uyarısı varsa devam etmeyin.
- **Seriyi Başlat** düğmesine basmadan önce panel planını hassas alanları kapatarak saklayın.

## Başlatma yetkisi

- Yalnız bir test kampanyasının planlandığını doğrulayın.
- Etsy'nin kendi özet ekranını panelden bağımsız olarak okuyun.
- Otomatik final gönderimlerini kabul ediyorsanız **Seriyi Başlat** düğmesine bir kez basın; kabul etmiyorsanız seriyi başlatmayın.

## Sonra

- Kampanyayı Etsy kampanya listesinde ad, oran, tarih, bölge ve kapsamla doğrulayın.
- Script raporunu dışa aktarın ve formül enjeksiyonu uyarısı olmadığını kontrol edin.
- Beklenmeyen sonuçta yeni kampanya başlatmayın; raporla birlikte public olmayan güvenlik/destek kanalını kullanın.

Bu kullanıcı kontrollü doğrulama canlı Etsy işlemlerinden önce mutlaka tamamlanmalıdır.
