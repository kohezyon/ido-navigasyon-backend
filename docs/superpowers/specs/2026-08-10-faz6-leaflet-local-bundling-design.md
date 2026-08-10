# Faz 6 / Alt-proje 1 — Leaflet'i Local Bundle'lama — Tasarım

**Tarih:** 2026-08-10
**Durum:** Onaylandı, plana geçiliyor

## Bağlam ve sıralama kararı

Roadmap'teki Faz 6 (Mobil Uygulama Sağlamlaştırma) dört madde içeriyordu: `App.js`'i component'lere bölmek, Leaflet'i local paketlemek, offline/zayıf bağlantı davranışı, ve personel app'te token'ı güvenli saklamak. Sonuncusu **zaten yapılmış** (personel app `expo-secure-store` kullanıyor, `AsyncStorage`'dan daha güvenli) — roadmap bu konuda güncel değildi.

Kalan üç işten `App.js`'in (824 satır, 35 `useState`) yapısal refactor'ü kullanıcıya görünür bir fayda sağlamıyor ve test altyapısı olmayan, gerçek yolcuların kullandığı bir uygulamada en yüksek regresyon riskini taşıyor. Diğer iki iş (Leaflet bundling, offline davranış) bu refactor'e bağımlı değil. Bu yüzden sıralama değiştirildi: önce somut, düşük riskli, kullanıcıya doğrudan fayda sağlayan işler; büyük refactor yalnızca ihtiyaç doğarsa (spekülatif değil) ele alınacak.

Bu spec, sıralamadaki ilk iş olan **Leaflet'i local bundle'lama**'yı kapsıyor.

## Problem

`ido-navigasyon-mobil-v3/App.js`'teki harita, bir `WebView`'e enjekte edilen `haritaHtml` template string'i (satır ~297-361) içinde Leaflet kütüphanesini CDN'den çekiyor:
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
...
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
```
Bağlantı yoksa/zayıfsa, kütüphanenin kendisi bile yüklenemediği için harita **hiç açılmıyor** — denizde zayıf bağlantı senaryosunda uygulamanın en kritik özelliği tamamen kullanılamaz hale geliyor.

## Yaklaşım

Leaflet'in `.js`/`.css` kaynağını RN/Metro'nun asset-yükleme tuzaklarından (Metro `.js` uzantılı dosyaları kod olarak parse etmeye çalışır; `expo-file-system`/`file://` URI yüklemesi platformlar arası farklı davranır ve gerçek cihazda doğrulanamadan risklidir) kaçınacak en basit yöntemle gömüyoruz: kütüphane kaynağını düz bir **JS string sabiti** olarak paketlemek. Bu, ekstra bağımlılık (`expo-asset`, `expo-file-system`) veya platform-özel dosya yükleme mantığı gerektirmiyor — içerik doğrudan JS bundle'ının içinde, normal bir `import` ile geliyor.

**Kapsam dışı (bilinçli sınır):** Harita döşemeleri (`basemaps.cartocdn.com`'dan gelen raster tile görüntüleri) CDN'den gelmeye devam edecek — bunlar canlı, dünya çapında içerik, önceden paketlenemez. Zayıf bağlantıda döşemeler gri/boş görünebilir ama harita çerçevesi, gemi ikonu, rota çizgisi ve popup'lar (Leaflet kütüphanesinin kendisi) çalışmaya devam eder. Varsayılan Leaflet marker görselleri de paketlenmiyor — kod tamamen özel `L.divIcon`/inline SVG kullanıyor, `L.icon()` ile harici görsel referansı hiç yok.

## Uygulama

1. **Bağımlılık ekle:** `leaflet@1.9.4` (mevcut CDN sürümüyle aynı), `ido-navigasyon-mobil-v3/package.json`'a normal `dependencies` olarak.
2. **Vendoring betiği:** `ido-navigasyon-mobil-v3/scripts/leaflet-vendorle.js` — `node_modules/leaflet/dist/leaflet.js` ve `leaflet.css`'i okur, her birini `module.exports = <JSON.stringify edilmis icerik>;` formatında `assets/leaflet/leafletJs.js` ve `assets/leaflet/leafletCss.js` dosyalarına yazar. `JSON.stringify`, kaynak içindeki ters tırnak/`${}`/özel karakterlerin güvenli kaçışını garanti eder (ham template literal ile enjekte edilirse bunlar template string'i bozabilirdi).
3. **Üretilen dosyalar commit'lenir** (vendored, `node_modules`'a bağımlı değil çalışma zamanında) — `assets/leaflet/leafletJs.js`, `assets/leaflet/leafletCss.js`. Leaflet güncellenmek istenirse: `npm install leaflet@<yeni-surum>` + `node scripts/leaflet-vendorle.js` tekrar çalıştırılır.
4. **`App.js` değişikliği:** İki modülü import et (`const leafletJs = require('./assets/leaflet/leafletJs');` / `leafletCss` benzer), `haritaHtml` şablonunda CDN `<link>`/`<script src>` etiketlerini `<style>${leafletCss}</style>` / `<script>${leafletJs}</script>` ile değiştir.

## Test

Otomatik test altyapısı yok (bu app'te hiç `.test.js` dosyası yok, mevcut durum). Doğrulama:
- Vendoring betiğinin ürettiği dosyaların boş olmadığını ve beklenen büyüklükte olduğunu kontrol et (`leaflet.js` sıkıştırılmamış ~140KB civarı, `leaflet.css` ~15KB civarı).
- Metro bundler'ın `App.js`'i hatasız derlediğini doğrula (`npx expo start` başlatıp bundle log'unda hata olmadığını kontrol etmek — Faz 4'te crew app için kullanılan aynı yöntem, fiziksel cihaz gerektirmez).
- **Gerçek cihazda haritanın görsel olarak doğru render olduğu bu oturumda doğrulanamaz** (fiziksel cihaz/Expo Go gerektirir) — bu, kullanıcının uygun olduğunda tek bir hızlı bakışla teyit edeceği ayrı bir manuel adım olarak plana yazılacak.

## Kapsam dışı

- Harita döşemelerinin (tile) önceden paketlenmesi (canlı içerik, imkansız/anlamsız).
- Offline/zayıf bağlantı genel davranışı (son bilinen veriyi cache'leme, bağlantı durumu göstergesi) — Faz 6'nın ayrı, sıradaki alt-projesi.
- `App.js`'in yapısal refactor'ü (component'lere bölme) — ihtiyaç doğmadıkça ele alınmayacak.
