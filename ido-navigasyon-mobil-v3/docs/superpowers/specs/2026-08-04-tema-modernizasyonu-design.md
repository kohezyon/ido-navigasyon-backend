# Tema Modernizasyonu — Tasarım Spesifikasyonu

**Tarih:** 2026-08-04
**Durum:** Onaylandı

## Amaç

IDO Engelsiz Navigasyon uygulamasının mevcut lacivert/deniz mavisi kimliğini koruyarak
görsel temasını modernleştirmek: yeni bir renk paleti tanımlamak, bunu tüm uygulamaya
(UI bileşenleri + harita ikonları + splash/adaptive icon) tutarlı şekilde uygulamak,
açık ve koyu modun her ikisini de korumak.

## Bağlam

`App.js` tek dosyalık (760 satır) bir React Native/Expo uygulaması. Şu an tüm renkler
component içine onlarca yerde hardcoded hex kod olarak serpiştirilmiş: `renkler` objesi,
`tipRengi()` fonksiyonu, `StyleSheet.create()`, `StatusBar`, ve Leaflet harita HTML/SVG
string'i içinde. Merkezi bir tema dosyası yok. Uygulama gerçek/aktif kullanılıyor; canlı
gemi takibi (socket.io), erişilebilirlik özellikleri (işaret dili/sesli anlatım videoları,
`accessibilityLabel`, `AccessibilityInfo.announceForAccessibility`, titreşim) ve acil durum
uyarı sistemi içeriyor — bunların davranışı değişmeyecek, sadece renkler.

## Marka Renk Paleti (her iki modda sabit)

| Token | Hex | Kullanım |
|---|---|---|
| `mavi` (primary) | `#4FA8D8` | gemi ikonu detayları, ilerleme çubuğu, seçili/aktif butonlar, rota çizgisi, birincil vurgular |
| `turuncu` (secondary) | `#F2A65A` | harita **ada noktası** ikonu, ikincil vurgular (örn. gemi bacası) |
| `kirmizi` (danger) | `#E85C5C` | acil durum banner'ı, **batık** noktası (hem harita hem genel UI), bağlantı kesildi göstergesi |
| `yesil` (islands/success) | `#8FBF9F` | **ada** tipi genel UI (kartlar, rozetler, tip noktaları, favoriler bağlamı), bağlantı var / varış özeti başarı rengi |

### Ada/Batık renk ayrımı (kritik karar)

- **Ada (island):** genel UI'da (kart arkaplanı/kenarlığı, `tipNoktasi`, favoriler ikon rengi,
  "İşaret Dili/Sesli Anlatım/Videolu Anlatım" butonları) → **yeşil**. Haritadaki ada
  **marker ikonu** → **turuncu**. Aynı kavram için iki bağlamda iki farklı renk — bilinçli
  bir tasarım kararı, çelişki değil.
- **Batık (wreck):** hem genel UI hem harita marker'ı → **kırmızı** (tutarlı, tek renk).

## Zemin/Nötr Tonlar (mod başına ayrı)

**Koyu mod:**
- Zemin: `#0d1b2a`
- Kart/yüzey: `#152436` (zeminden bir ton açık lacivert)
- Birincil yazı: kırık beyaz (`#E8EEF3` civarı, mevcutla tutarlı)
- İkincil yazı/etiket: soluk mavi-gri (`#7F97AB` civarı, mevcutla tutarlı)

**Açık mod:**
- Zemin: çok açık soğuk lacivert-gri (mevcut `#F4F8FB`'ye yakın)
- Kart/yüzey: beyaz (`#FFFFFF`)
- Birincil yazı: koyu lacivert `#0d1b2a`
- İkincil yazı/etiket: soluk lacivert-gri (mevcut `#5B7A8F` civarı)

## Kontrast/Erişilebilirlik Kuralı

Ham marka renkleri (özellikle mavi ve yeşil) açık zemin üzerinde küçük metin için WCAG AA
kontrastını karşılamayabilir. Bu uygulama erişilebilirlik odaklı olduğundan, her marka rengi
için **açık moda özel koyultulmuş "metin-güvenli" bir varyant** tanımlanacak (mevcut kodun
`#1E6091`/`#C67A00` yaklaşımına benzer şekilde). Koyu modda ham renkler yeterli kontrasta
sahip olduğu için ayrı varyant gerekmez.

`theme.js` içinde her renk ailesi için şu şekle sahip olacak:
```js
mavi: { taban: '#4FA8D8', metinAcikMod: '#1E6091benzeri' /* koyultulmuş */, ... }
```

(Kesin koyultulmuş hex değerleri implementasyon sırasında kontrast oranı hesaplanarak
belirlenecek, hedef: normal metin için ≥4.5:1, büyük metin/ikon için ≥3:1.)

## Dosya Değişiklikleri

### 1. Yeni dosya: `theme.js`
İki mod için tam token seti (marka renkleri + zemin/yüzey/yazı/kenarlık nötr tonları +
açık mod metin-güvenli varyantlar). `App.js` bunu import eder.

### 2. `App.js`
- Tüm hardcoded hex'ler `theme.js` token'larıyla değiştirilir: `renkler` objesi,
  `tipRengi()`, `StyleSheet.create()`, `StatusBar` renkleri, harita HTML/SVG string'i.
- `tipRengi('ada')` → yeşil aile, `tipRengi('batik')` → kırmızı aile (şu an mavi).
- Bağlantı durumu noktası: bağlı=yeşil, kesildi=kırmızı.
- Varış (arrival) başarı banner'ı → yeşil aileye çekilir (şu an ayrı `#2E7D32`).
- İlerleme çubuğu, seçili yazı boyutu butonu, kapat butonları, tanıtım "İleri" butonu →
  mavi (primary) vurguya çekilir.
- Acil durum banner'ı/üst çubuk → kırmızı (şu an `#B71C1C`).

### 3. Harita İkonları (Leaflet SVG, `haritaHtml` template string'i içinde)
- **Gemi ikonu:** gövde beyaz kalır; çerçeve/kabin/pencere detayları → mavi; baca → turuncu
  (ikincil vurgu olarak korunur).
- **Ada noktası ikonu:** turuncu dolgu (şu an `#C67A00`).
- **Batık noktası ikonu:** kırmızı dolgu (şu an mavi `#1E6091`).
- Popup CSS sınıfları (`.ada-popup`, `.batik-popup`) aynı renk mantığıyla güncellenir.
- `#harita` div arkaplanı yükleme sırasında yeni zemin tonlarına çekilir.
- Leaflet tile layer URL'leri (CartoDB voyager/dark) değişmez.

### 4. `app.json`
- `expo.splash.backgroundColor`: `#0D3B66` → `#0d1b2a`
- `expo.android.adaptiveIcon.backgroundColor`: `#0D3B66` → `#0d1b2a`
- Not: Bu değişiklik native build (EAS) gerektirir, Expo Go/JS-only reload ile görünmez.

## Kapsam Dışı

- Yeni bileşen/ekran eklenmesi, mevcut davranışın değiştirilmesi.
- Köşe yuvarlaklığı, gölge, spacing gibi diğer görsel detaylar (kullanıcı onayladı, ek
  değişiklik istenmedi).
- `assets/` altındaki PNG ikon dosyalarının (icon.png, adaptive-icon.png, splash.png,
  favicon.png) yeniden tasarlanması — sadece arkaplan rengi kodu güncellenir, görsel
  varlıklar değişmez.

## Test Planı

- Hem açık hem koyu modda uygulamayı manuel gözden geçirme: üst çubuk, ilerleme çubuğu,
  özet kartı, harita (gemi/ada/batık ikonları + popup'lar), acil durum banner'ı, varış
  banner'ı, ayarlar/yardım/özet modal'ları, tanıtım ekranları.
- Acil durum simülasyonu (varsa backend endpoint'i ile) → kırmızı temanın doğru
  uygulandığını doğrulama.
- Erişilebilirlik: `accessibilityLabel`'ların ve `AccessibilityInfo.announceForAccessibility`
  çağrılarının değişmediğini, sadece renklerin değiştiğini doğrulama.
