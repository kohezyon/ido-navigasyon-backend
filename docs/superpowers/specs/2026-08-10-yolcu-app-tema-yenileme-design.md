# Yolcu App'i Tema Yenileme — Tasarım

**Tarih:** 2026-08-10
**Durum:** Onaylandı, plana geçiliyor

## Bağlam

Kullanıcı, gerçek cihazda test edilen yolcu app'inin (`ido-navigasyon-mobil-v3`) mevcut görsel temasının ("düz lacivert üst bar + beyaz içerik, dağınık inline renkler") yeterince profesyonel/premium olmadığını belirtti. Dört farklı yön mockup olarak sunuldu (Artifact üzerinden, `docs/superpowers/specs/` dışında tutulan bir onay aracı olarak — bu spec sadece onaylanan sonucu belgeliyor):

1. **v1 — Derin lacivert + pirinç sarısı (brass gold)**, editoryal serif başlık (Fraunces) + Public Sans gövde, hero kart + gölgeli kartlar.
2. v2 — Kobalt mavisi + mercan turuncusu, tabela tarzı kalın büyük harf tipografi. Reddedildi ("çok kötü").
3. v3 — Minimal/native (Google Maps/Uber tarzı), tek sakin vurgu rengi, bottom-sheet. Reddedildi.
4. v4 — Trendyol turuncusu + Instagram'ın "canlı yayın halkası" sentezi. Sunuldu ama kullanıcı bu noktada v1'e dönmeyi tercih etti.

**Karar: v1 (derin lacivert + pirinç sarısı) onaylandı.**

## Tasarım

### Renk paleti

| Token | Hex | Kullanım |
|---|---|---|
| `navyDeep` | `#0A2540` | Üst bar / hero kart zemini (koyu uç) |
| `navyMid` | `#123A5E` | Üst bar / hero kart zemini (açık uç, gradyan) |
| `gold` | `#C9962B` | Birincil vurgu — ilerleme çubuğu dolgusu, favoriler, aktif durumlar |
| `goldSoft` | `#E4C173` | Gradyan/parlama tonu (ilerleme çubuğu, hero kart eyebrow yazısı) |
| `teal` | `#2B7A78` | İkincil vurgu — bilgi kartlarındaki eyebrow etiketleri, ikincil işaretçiler |
| `warmWhite` | `#F6F4EF` | Aydınlık mod zemin |
| `ink` | `#142433` | Aydınlık mod birincil metin |
| `inkSoft` | `#4A5A68` | Aydınlık mod ikincil metin/etiket |

**Karanlık mod:** mevcut `karanlikMod` anahtarı korunur; zemin `#0B1520`/kart `#1B2733` (mevcut değerlere yakın, `navyDeep`/`navyMid` ailesiyle tutarlı), metin `#E8EEF3`, ikincil metin `#7F97AB`. Gold/teal vurgu renkleri her iki modda da aynı kalır (yeterli kontrast, mockup'ta doğrulandı).

### Tipografi

- **Başlık (display):** Fraunces — uygulama adı, hedef/durak isimleri gibi öne çıkan metinler. `expo-google-fonts/fraunces` paketiyle yüklenir (Expo'nun resmi Google Fonts entegrasyonu).
- **Gövde/veri (body):** Public Sans — tüm diğer metin, sayılar, etiketler. `expo-google-fonts/public-sans` paketiyle yüklenir. Erişilebilirlik odaklı tasarlanmış olması, uygulamanın "Engelsiz" kimliğiyle doğrudan örtüşüyor.
- Font dosyaları yüklenene kadar (Expo'da `useFonts` hook'u ile) sistem fontuyla kısa bir an gösterim yapılabilir — `expo-splash-screen` ile yükleme bitene kadar splash ekranın tutulması önerilir (mevcut app'te zaten bir "tanıtım" akışı var, bu akışla birleştirilebilir).

### Bileşen değişiklikleri

- **Üst bar:** Düz `karanlikMod ? '#0B1520' : '#0D3B66'` yerine `navyDeep`→`navyMid` yönünde hafif bir gradyan (React Native'de `expo-linear-gradient` ile). Uygulama adı Fraunces ile.
- **İlerleme çubuğu:** Düz mavi dolgu yerine `goldSoft`→`gold` gradyan dolgu.
- **Hero/durum kartı** (şu an "Heybeliada, Tahmini 1 dakika" gibi bilgiyi gösteren en öne çıkan alan): `navyDeep`→`navyMid` gradyan zemin, beyaz metin, `goldSoft` renkli küçük harf eyebrow etiketi (örn. "BAĞLI").
- **İkincil bilgi kartları** (Bağlantı Durumu, Yakınlık Durumu, vb.): Düz beyaz/koyu zemin + yumuşak gölge (`shadowColor`/`shadowOpacity`/`shadowRadius` + Android `elevation`), sol-kenar renkli çizgi yerine üstte küçük harf `teal` renkli eyebrow etiketi.
- **Genel:** Tutarlı `borderRadius: 14` (kartlarda), tutarlı gölge değerleri bir kere tanımlanıp paylaşılır.

## Kapsam

- Sadece `ido-navigasyon-mobil-v3` (yolcu app) — crew app (`ido-navigasyon-personel`) bu spec'in kapsamında değil (ayrı bir karar, istenirse sonra ele alınır).
- Sadece görsel/stil değişiklikleri — hiçbir davranış/mantık (fetch, socket, state akışı) değişmiyor.
- Harita (Leaflet/WebView) içeriği bu spec'in kapsamında değil — zaten Faz 6'da ele alındı, dokunulmuyor.

## Test

Otomatik test altyapısı yok. Doğrulama: Metro bundler sağlık kontrolü (Faz 6'da kullanılan yöntem) + gerçek cihazda görsel doğrulama (kullanıcı tarafından, ayrı bir manuel adım — bu spec'in "kimsenin hayır diyemeyeceği" hedefi ancak gerçek cihazda görülünce teyit edilebilir).
