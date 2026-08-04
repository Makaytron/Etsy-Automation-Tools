# Makaytron Etsy Listing Analyzer Kullanıcı Kontrollü Dry-Run Listesi

Bu kontrol listesi kullanıcı tarafından kendi Etsy mağazasında uygulanır. Kimlik bilgisi, çerez, oturum veya authenticated HTML paylaşmayın. Repo otomasyonu canlı listing düzenlemez veya deaktif etmez.

## Salt okunur başlangıç

- Script ve Tampermonkey izinlerini kontrol edin.
- Listing yönetim sayfasında paneli açın; önce yalnız görünür kartları tara ve snapshot oluştur işlemini kullanın.
- Toplam kart sayısı ile çıkarılan listing kimliklerini Etsy ekranından bağımsız olarak karşılaştırın.
- Trafik, favori, satış, gelir ve yenileme alanlarından okunamayanların `0` yerine “bilinmiyor” olarak gösterildiğini doğrulayın.
- Aynı snapshot yeniden alındığında sahte yükseliş/düşüş üretilmediğini kontrol edin.
- Tarama sırasında geçici hata taklidi yapabiliyorsanız aynı sayfanın sınırlı sayıda yeniden denendiğini; kalıcı hatada ise listing içeriği, çerez veya oturum bilgisi taşımayan ayrıntılı rapor oluştuğunu doğrulayın.
- Filtre presetlerinin, seçenek yanındaki sonuç adetlerinin ve tarihsel grafiklerin tam tarama verisiyle güncellendiğini doğrulayın.

## Tek listing denemesi

- Kritik olmayan tek bir listing seçin.
- Önerilen önce/sonra farkını, listing kimliğini ve işlem türünü okuyun.
- “Değiştirilecek alanlar” seçiminde yalnız gerçekten uygulanacak alanların işaretli olduğunu doğrulayın. Boş etiket/materyal listesinin ancak o alan açıkça seçilmişse temizleme anlamına geldiğini kontrol edin.
- AI iyileştirmesi kullanılıyorsa dışa aktarılan istek JSON'u/prompt'taki alanları anonimleştirin. Scriptin sağlayıcıya kendiliğinden ağ isteği göndermediğini ve yalnız doğrulanan teklif JSON'unu içe aldığını kontrol edin.
- AI teklifindeki “önce”, “öneri” ve ancak yayınlandıktan sonra oluşan “doğrulanan sonuç” alanlarını karşılaştırın; uygulanmamış önerinin sonuç gibi gösterilmediğini doğrulayın.
- İyileştirme deney zaman çizelgesinde planlama, yayın, gözlem ve değerlendirme olaylarının doğru sırada olduğunu kontrol edin.
- Deaktif etme yerine ilk denemede geri alınabilir bir metin iyileştirmesini tercih edin.
- Her listing için açık kullanıcı onayı verilmeden Etsy Publish kontrolünün tıklanmadığını doğrulayın. Deaktif etmede scriptin yalnız seçenek menüsünü açıp ilgili öğeye odaklandığını; Deactivate ve Etsy final onayını kullanıcının tıkladığını ve Delete işleminin otomatikleştirilmediğini kontrol edin.

## İşlem sonrası

- Etsy listing sayfasını yenileyip hedef alanı elle doğrulayın.
- Script işlem kaydındaki önce/sonra değerleri ve doğrulama sonucunu inceleyin.
- Beklenmeyen sonuçta toplu kuyruğu başlatmayın; hatayı hassas verileri ayıklayarak özel destek/güvenlik kanalından bildirin.
- Tampermonkey güncelleme kontrolünün anonim olarak canonical GitHub commit kimliğini okuyup yalnız o değişmez committeki raw metadata’yı doğruladığını ve kurulumu kendiliğinden başlatmadığını kontrol edin.
- Gerekirse Listing Analyzer geçmişini ve dışa aktarılan raporları ayrı ayrı silin.

Güncel Etsy arayüzü zaman içinde değişebilir. İlk toplu yazma her zaman bu tek-listing kontrolünden sonra yapılmalıdır.
