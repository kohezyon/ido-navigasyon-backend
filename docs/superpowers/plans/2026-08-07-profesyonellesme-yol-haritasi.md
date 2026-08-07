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
| 2 | Çoklu gemi/hat veri modeli | Yüksek | Orta-Büyük (1-2 hafta) | - |
| 3 | Gerçek GPS entegrasyonu | Yüksek | Orta (1 hafta, donanıma bağlı) | - |
| 4 | Güvenilirlik & operasyon altyapısı | Orta | Orta (1 hafta) | - |
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

Sıradaki: **Faz 2** (çoklu gemi/hat veri modeli). `superpowers:writing-plans` ile adım adım (test-driven, dosya bazlı) bir uygulama planı çıkarılacak.
