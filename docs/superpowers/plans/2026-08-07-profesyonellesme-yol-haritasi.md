# İDO Navigasyon — Profesyonelleşme Yol Haritası

> Bu bir üst-düzey yol haritasıdır, bite-sized bir uygulama planı değil. Her faz, uygulanmaya başlanmadan önce `superpowers:writing-plans` ile kendi detaylı planına dönüştürülecek (kod adımları, test adımları, dosya bazlı görevler dahil).

**Kapsam:** `ido-navigasyon-backend` (Express + Socket.io + Postgres), `ido-navigasyon-mobil-v3` (yolcu app), `ido-navigasyon-personel` (personel app).

**Mevcut durum özeti:** Çalışan bir prototip/POC. Geofencing mantığı ve gerçek-zamanlı akış fikri sağlam; ancak kimlik doğrulama, veri modeli, GPS entegrasyonu, test/izleme altyapısı ve mobil kod organizasyonu kurumsal kullanım için yetersiz.

---

## Öncelik sırası ve gerekçe

Fazlar bağımlılık ve risk sırasına göre dizildi: önce yolcu/personel güvenliğini etkileyen açık kapatılıyor, sonra tek-gemi kısıtı kaldırılıyor, sonra gerçek GPS entegre ediliyor, en son operasyonel olgunluk (test/izleme/mobil UX) ekleniyor.

| Faz | Konu | Öncelik | Tahmini efor | Durum |
|---|---|---|---|---|
| 0 | Acil güvenlik yaması | Kritik — hemen | Küçük (1-2 gün) | ✅ Tamamlandı |
| 1 | Gerçek kimlik doğrulama & yetkilendirme | Kritik | Orta (1 hafta) | ✅ Tamamlandı |
| 2 | Çoklu gemi/hat veri modeli | Yüksek | Orta-Büyük (1-2 hafta) | ✅ Tamamlandı |
| 3 | Gerçek GPS entegrasyonu | Yüksek | Orta (1 hafta, donanıma bağlı) | ✅ Tamamlandı |
| 4 | Güvenilirlik & operasyon altyapısı | Orta | Orta (1 hafta) | 🟡 Alt-proje 2/4 tamamlandı |
| 5 | Test & CI/CD | Orta | Orta (1 hafta) | - |
| 6 | Mobil uygulama sağlamlaştırma | Orta | Orta-Büyük (1-2 hafta) | - |
| 7 | Prodüksiyon altyapısı & dokümantasyon | Düşük-Orta | Küçük-Orta | - |

---

## Faz 0 — Acil Güvenlik Yaması ✅ Tamamlandı (2026-08-07)

**Neden hemen:** `PERSONEL_ANAHTARI`, personel mobil uygulamasında `EXPO_PUBLIC_` öneki ile tanımlı — yani derlenen APK/IPA içine gömülüyor ve herkes tarafından çıkarılabilir. Bu anahtarla dışarıdan biri sahte "acil durum" / tahliye alarmı yayınlayabilir. Bu bir güvenlik açığından öte, **yolcu güvenliği riski**.

**Kapsam:**
- `PERSONEL_ANAHTARI` mekanizmasını client'tan tamamen kaldır (Faz 1'deki gerçek auth'a kadar geçici olarak, backend'de rate-limit + IP bazlı kısıtlama gibi ek bir katmanla desteklenebilir, ama nihai çözüm Faz 1).
- `/reset-gemi` endpoint'ine auth ekle (şu an tamamen açık).
- `cors: { origin: "*" }` yerine bilinen origin'lerle sınırlı CORS.
- Socket event payload'larına temel doğrulama (`bilgi.gemi_adi` gibi alanlar tip/uzunluk kontrolünden geçmeden yayınlanmasın).
- Hata mesajlarında (`hata.message`) internal detayları client'a sızdırmayı durdur — genel mesaj dön, detayı sunucu log'una yaz.

## Faz 1 — Gerçek Kimlik Doğrulama & Yetkilendirme ✅ Tamamlandı (2026-08-07)

**Kapsam:**
- Personel hesap modeli (DB tablosu): kullanıcı adı, hash'lenmiş şifre (bcrypt/argon2), rol (kaptan/personel/admin).
- Login endpoint → JWT (kısa ömürlü access token + refresh).
- Socket bağlantısında JWT doğrulama (`io.use()` middleware), rol bazlı yetki kontrolü (acil durum başlatma sadece kaptan/yetkili personel).
- Personel app'e gerçek login ekranı.

## Faz 2 — Çoklu Gemi/Hat Veri Modeli

**Neden gerekli:** Şu an `gemiKonumu`, `suankiHedefIndex` gibi global değişkenler tek gemiyi varsayıyor; rota (`rotaNoktalari`, `rotaAdlari`) kod içinde hardcoded. Gerçek bir filoyu (birden fazla feribot, birden fazla hat) desteklemez.

**Kapsam:**
- DB şeması: `gemiler`, `hatlar`, `rota_noktalari`, `seferler` (aktif sefer = gemi + hat + başlangıç zamanı).
- Sunucu state'i global değişkenlerden, sefer bazlı (DB veya Redis'te tutulan) state'e taşı.
- Socket odaları (`socket.io` rooms) ile client'lar sadece takip ettikleri seferin yayınını alsın.
- `ilgi_noktalari` tablosu zaten var — rota noktalarını da aynı DB-driven modele taşı.

## Faz 3 — Gerçek GPS Entegrasyonu

**Neden gerekli:** `sahteGpsGuncelle()` matematiksel simülasyon; gerçek konum verisi yok.

**Kapsam (donanım erişimine göre iki seçenek):**
- **Seçenek A (düşük maliyet):** Kaptan/personel app'i, cihazın GPS'ini periyodik olarak backend'e POST eder (auth'lu endpoint), backend bunu sefer state'ine yazar.
- **Seçenek B (kurumsal):** Geminin AIS/GPS donanımından veri çeken bir entegrasyon servisi (NMEA feed, seri port veya üretici API'si).
- Anomali kontrolü: aşırı hız/sıçrama gösteren konum güncellemelerini reddet (GPS hatası/sahte veri koruması).

## Faz 4 — Güvenilirlik & Operasyon Altyapısı

**Kapsam:**
- State persistence: sefer durumu DB/Redis'te, sunucu yeniden başlasa da kaybolmasın.
- Yatay ölçeklenebilirlik: birden fazla sunucu instance'ı arasında Socket.io adapter (Redis adapter).
- `helmet`, rate limiting (`express-rate-limit`), input validation (`zod`/`joi`).
- Yapılandırılmış loglama (`pino`/`winston`), hata izleme (Sentry).
- `/health` endpoint, graceful shutdown (SIGTERM handling).

## Faz 5 — Test & CI/CD

**Kapsam:**
- Test framework kurulumu (Vitest veya Jest + Supertest).
- `geofencing.js` için birim testleri (mesafe hesaplama, tetikleme sınırı).
- Socket event'leri ve REST endpoint'leri için entegrasyon testleri.
- GitHub Actions: PR'da otomatik test + lint.
- Staging ortamı (prod'a çıkmadan önce test edilecek ayrı deployment).

## Faz 6 — Mobil Uygulama Sağlamlaştırma

**Kapsam:**
- `ido-navigasyon-mobil-v3/App.js` (760 satır, 24 `useState`) — ekranlara/component'lere böl, gerekiyorsa `useReducer` ya da hafif bir state yönetimine geç.
- Harita: Leaflet'i CDN'den (`unpkg`, `cartocdn`) her açılışta çekmek yerine local asset olarak paketle — denizde zayıf bağlantıda uygulama açılabilsin.
- Offline/zayıf bağlantı davranışı: son bilinen veriyi cache'le, bağlantı koptuğunda kullanıcıyı bilgilendir (sessizce donmasın).
- Personel app'te login sonrası token'ı `AsyncStorage`'da güvenli şekilde sakla.

## Faz 7 — Prodüksiyon Altyapısı & Dokümantasyon

**Kapsam:**
- Render free-tier yerine SLA'lı, kurumsal ihtiyaca uygun hosting (cold-start olmayan bir plan/servis).
- DB yedekleme stratejisi.
- Deployment dokümantasyonu, ortam değişkenleri referansı, incident/runbook dokümanı.

---

## Sonraki adım

**Faz 0 tamamlandı** (bkz. `2026-08-07-faz0-guvenlik-yamasi.md`, `main`'e merge edildi, 26/26 test yeşil).

**Faz 1 tamamlandı** (bkz. `2026-08-07-faz1-kimlik-dogrulama.md`, `main`'e merge edildi — commit `1783cb1`, 67/67 test yeşil). `PERSONEL_ANAHTARI` paylaşılan-anahtar modeli tamamen kaldırıldı; bcrypt şifre hash'leme, `personel_hesaplari` tablosu, JWT access/refresh token çifti (tür ayrımı ile), REST + Socket.io JWT auth, rol bazlı yetkilendirme ve personel app'te gerçek login ekranı devreye alındı. Final whole-branch review'da bulunan 1 Critical + 4 Important güvenlik bulgusu (token türü karışıklığı, eksik `JWT_GIZLI_ANAHTARI` fail-fast, refresh'te DB'nin tekrar okunmaması, socket oturumlarının süre kontrolü yapmaması, sahte-şifre-hash senkronizasyonu) düzeltildi ve doğrulandı.

**Bekleyen manuel adım:** Personel app'in gerçek Expo/cihaz ortamında login akışı ve rol bazlı yetkilendirme UX'i (planın Task 10, Step 2-3) bu ortamda otomatik doğrulanamadı — bir insan operatör tarafından Expo ile manuel test edilmeli.

**Faz 2 kod tarafı tamamlandı, "tamamlandı" olarak işaretlenmedi** (bkz. `2026-08-07-faz2-coklu-gemi-veri-modeli.md`, `main`'e merge edildi, 98/98 test yeşil). DB şeması (`gemiler`/`hatlar`/`rota_noktalari`/`seferler`), repo katmanları, sefer yaşam döngüsü REST uçları, socket.io sefer-odaları ve her iki app'in sefer seçim/başlatma/bitirme ekranları eklendi. Final whole-branch review'da bulunan 2 Critical bulgu (personel app çıkış sonrası kalıcı yükleniyor ekranı; sunucu yeniden başlarsa bir geminin kalıcı olarak kilitlenmesi) ve birkaç Important bulgu düzeltildi; ayrıca web'de manuel gösterim sırasında bulunan üçüncü bir "kalıcı yükleniyor" varyantı (token hiç yoksa) da ayrıca düzeltildi.

**Güncelleme (2026-08-10):** `db/gemiler_hatlar_seferler.sql` ve seed dosyası artık gerçek (Render) production veritabanına uygulandı. Sefer başlat/seç/bitir akışı, bu veritabanına bağlı yerel backend'e karşı otomatik bir uçtan uca test scripti ile doğrulandı (login → `/sefer/baslat` → `sefer-sec` → çoklu `konum-guncelle` → `/sefer/bitir` → tekrar `/sefer/bitir` ile double-bitir guard'ının 404 döndüğü doğrulandı; 19/19 kontrol geçti).

**Faz 2 tamamlandı (2026-08-10):** Gerçek bir telefonda Expo Go üzerinden `kaptan1` hesabıyla giriş yapıldı, sefer başlatıldı/seçildi, yolcu sayısı güncellendi ve acil durum başlat/bitir denendi — hepsi backend loglarında doğru şekilde görüldü (gerçek production DB'ye karşı).

**Faz 3 kod tarafı tamamlandı, "tamamlandı" olarak işaretlenmedi** (bkz. `2026-08-09-faz3-gercek-gps-entegrasyonu-design.md` / `2026-08-09-faz3-gercek-gps-entegrasyonu.md`, `main`'e merge edildi, 113/113 test yeşil, 20/20 çalıştırmada flaky değil). Seçenek A (kaptan telefonundan periyodik GPS) uygulandı: `konum-guncelle` socket event'i, sahte GPS simülasyonunun kaldırılması, gerçek hıza göre ETA hesaplaması, personel app'te `expo-location` ile 5sn'de bir (sadece ön planda) konum gönderimi. Final whole-branch review'da bulunan 1 Critical bulgu (varış-eşiği algoritması gerçek rotada sonsuza kadar takılabiliyordu — "yetişme" mantığıyla düzeltildi) ve 3 Important bulgu (test flakiness'inin gerçek kök nedeni — connect event race — bulunup düzeltildi; sefer-sec artık mevcut konumu da dönüyor; iOS'ta 5sn aralığın çalışmaması) düzeltildi ve doğrulandı.

**Güncelleme (2026-08-10):** `konum-guncelle` event'inin gerçek (Render) production veritabanına bağlı yerel backend'e karşı uçtan uca çalıştığı otomatik bir test scriptiyle doğrulandı: rota boyunca ilerleyen konum güncellemeleri doğru şekilde yayınlandı (`gemi-konum-guncelleme`), hedef geçişleri ve ilerleme yüzdesi/ETA hesaplaması doğru çalıştı, son noktaya varışta `varis-bildirimi` tetiklendi, geçersiz konum ve yetkisiz (token'sız) `konum-guncelle` denemeleri doğru şekilde reddedildi.

**Faz 3 tamamlandı (2026-08-10):** Gerçek bir telefonda Expo Go üzerinden GPS izni verildi, `konum-guncelle` event'i gerçek koordinatlarla (Ankara, `39.9392, 32.8557`) backend'e ulaştı ve gerçek production DB'ye bağlı sunucu bunu doğru işleyip yayınladı. Fiziksel cihaz + gerçek DB uçtan uca doğrulanmış oldu.

Faz 2 ve Faz 3, hem otomatik uçtan uca testle hem gerçek cihazda manuel doğrulamayla tamamlandı.

**Faz 4 / Alt-proje 1 (sefer restart-kurtarma) tamamlandı (2026-08-10)** (bkz. `2026-08-10-faz4-sefer-restart-kurtarma-design.md` / `2026-08-10-faz4-sefer-restart-kurtarma.md`, `main`'e merge edildi, 115/115 test yeşil). Backend her başladığında, DB'de `bitis_zamani IS NULL` kalmış (bellek-içi `aktifSeferler`'den kaybolmuş) seferleri otomatik kapatarak gemilerin kalıcı kilitlenmesini önlüyor (`yariBirakilmisSeferleriKapat`, `sunucu.listen()`'dan önce çalışır, DB hatasında fail-fast). Hem crew app (`ido-navigasyon-personel`) hem yolcu app (`ido-navigasyon-mobil-v3`), bu senaryoda sefer listesini tazeleyip kullanıcıyı düzgün bir mesajla sefer-seçim ekranına döndürüyor. Final whole-branch review'da bulunan 2 Important bulgu (yolcu app'in aynı senaryoda tazelenmeyen listesi; `yariBirakilmisSeferleriKapat`'ın yazılı olmayan tek-instance varsayımı — artık kod yorumu ve tasarım dokümanında belgelendi) ve 4 Minor bulgu düzeltildi/değerlendirildi.

**Faz 4 / Alt-proje 2 (deployment/runbook dokümantasyonu) tamamlandı (2026-08-10)** (bkz. `docs/DEPLOYMENT.md`) — ortam değişkenleri referansı, şema uygulama adımları, personel hesabı oluşturma, başlangıç kurtarma davranışının operasyonel görünürlüğü (hangi log satırının izleneceği, tek-instance varsayımının sınırı) ve sık karşılaşılan durumlar belgelendi.

Sıradaki: **Faz 4'ün kalan alt-projeleri** — Render cold-start/barındırma kararı (ücretli plan gerektirir, kullanıcı kararı) ve DB yedekleme stratejisi (Render panel ayarı, kullanıcı erişimi gerektirir) — ikisi de bu oturumda tek başına ilerletilemeyecek, kullanıcı katılımı gereken konular.
