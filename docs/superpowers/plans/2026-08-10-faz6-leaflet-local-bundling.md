# Faz 6 / Alt-proje 1 — Leaflet Local Bundling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ido-navigasyon-mobil-v3` uygulamasındaki harita, Leaflet kütüphanesini (`leaflet.js`/`leaflet.css`) CDN'den değil, uygulamayla birlikte paketlenmiş yerel bir kaynaktan yüklesin — böylece zayıf/yok bağlantıda harita çerçevesi (döşemeler hariç) hâlâ açılabilsin.

**Architecture:** `leaflet` npm paketi vendor kaynağı olarak eklenir; bir üretim betiği kütüphane dosyalarını JSON-string'e çevrilmiş JS modülleri olarak `assets/leaflet/` altına yazar (Metro'nun `.js` dosyalarını kod olarak parse etme davranışından ve platform-özel dosya yükleme risklerinden kaçınmak için); `App.js`'teki `haritaHtml` şablonu CDN referansları yerine bu modülleri kullanır.

**Tech Stack:** Expo/React Native SDK 54, `leaflet@1.9.4` (yalnızca vendor kaynağı, RN tarafında import edilmiyor — sadece `dist/` dosyaları okunuyor), Node.js (üretim betiği için).

## Global Constraints

- Harita döşemeleri (`basemaps.cartocdn.com` tile'ları) CDN'den gelmeye devam eder — kapsam dışı, değiştirilmiyor.
- Varsayılan Leaflet marker görselleri paketlenmiyor (kod hiç kullanmıyor, sadece özel `L.divIcon`/SVG).
- Otomatik test altyapısı yok — doğrulama dosya boyutu kontrolü + Metro bundler sağlık kontrolü ile yapılır, gerçek cihaz görsel doğrulaması ayrı bir manuel adım.

---

### Task 1: Leaflet'i vendor'la ve `App.js`'e bağla

**Files:**
- Modify: `ido-navigasyon-mobil-v3/package.json` (leaflet bağımlılığı)
- Create: `ido-navigasyon-mobil-v3/scripts/leaflet-vendorle.js`
- Create (üretilen, betik tarafından): `ido-navigasyon-mobil-v3/assets/leaflet/leafletJs.js`, `ido-navigasyon-mobil-v3/assets/leaflet/leafletCss.js`
- Modify: `ido-navigasyon-mobil-v3/App.js:297-361` (`haritaHtml` şablonu)

**Interfaces:**
- Üretilen `assets/leaflet/leafletJs.js` ve `leafletCss.js`: her biri `module.exports = "<kaçışlanmış JS string>";` şeklinde, tek bir string export ediyor. `App.js` bunları `require('./assets/leaflet/leafletJs')` / `require('./assets/leaflet/leafletCss')` ile tüketiyor.

- [ ] **Step 1: Leaflet'i bağımlılık olarak ekle**

`ido-navigasyon-mobil-v3` klasöründe:
```bash
npm install leaflet@1.9.4
```

- [ ] **Step 2: Vendoring betiğini yaz**

`ido-navigasyon-mobil-v3/scripts/leaflet-vendorle.js`:
```js
// node_modules/leaflet/dist icindeki kaynagi, Metro'nun .js dosyalarini kod
// olarak parse etmesinden kacinmak icin duz birer JS string modulu olarak
// assets/leaflet/ altina yazar. Leaflet surumu degistiginde (package.json'da
// leaflet bagimliligi guncellendikten sonra) bu betik tekrar calistirilmali:
// node scripts/leaflet-vendorle.js
const fs = require('fs');
const path = require('path');

function vendorleDosya(kaynakGoreliYol, hedefDosyaAdi) {
    const kaynakYol = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist', kaynakGoreliYol);
    const icerik = fs.readFileSync(kaynakYol, 'utf8');
    const hedefYol = path.join(__dirname, '..', 'assets', 'leaflet', hedefDosyaAdi);
    fs.mkdirSync(path.dirname(hedefYol), { recursive: true });
    fs.writeFileSync(hedefYol, `module.exports = ${JSON.stringify(icerik)};\n`);
    console.log(`Yazildi: ${hedefYol} (${icerik.length} karakter)`);
}

vendorleDosya('leaflet.js', 'leafletJs.js');
vendorleDosya('leaflet.css', 'leafletCss.js');
```

- [ ] **Step 2b: Betiği çalıştır**

```bash
node scripts/leaflet-vendorle.js
```

Expected: iki satır çıktı, ikisi de "Yazildi: ..." ile başlıyor, `leafletJs.js` için karakter sayısı ~140000 civarı, `leafletCss.js` için ~15000 civarı.

- [ ] **Step 3: Üretilen dosyaların boyutunu doğrula**

```bash
node -e "
const js = require('./assets/leaflet/leafletJs.js');
const css = require('./assets/leaflet/leafletCss.js');
console.log('leafletJs.js uzunluk:', js.length);
console.log('leafletCss.js uzunluk:', css.length);
console.log('leafletJs L.map iceriyor mu:', js.includes('L.map'));
console.log('leafletCss .leaflet-container iceriyor mu:', css.includes('.leaflet-container'));
"
```

Expected: her iki `includes` kontrolü de `true` (kütüphanenin gerçekten doğru içerikte olduğunu, boş/bozuk bir dosya olmadığını doğrular), uzunluklar sıfırdan büyük.

- [ ] **Step 4: `App.js`'i güncelle**

`ido-navigasyon-mobil-v3/App.js`'in en üstüne, diğer import'ların yanına ekle:
```js
const leafletJs = require('./assets/leaflet/leafletJs');
const leafletCss = require('./assets/leaflet/leafletCss');
```

`App.js:302` (`<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />`) satırını şununla değiştir:
```html
      <style>${leafletCss}</style>
```

`App.js:313` (`<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>`) satırını şununla değiştir:
```html
      <script>${leafletJs}</script>
```

(Not: `haritaHtml` zaten bir template literal olduğu için `${...}` interpolasyonu doğrudan çalışır — dosyanın geri kalanındaki `${karanlikMod ? ... : ...}` gibi diğer interpolasyonlarla aynı desen.)

- [ ] **Step 5: Metro bundler sağlık kontrolü**

Backend'i arka planda başlat (varsa zaten çalışıyorsa atla, `netstat -ano | grep :3000` ile kontrol et):
```bash
cd "C:\Users\Ömür\Desktop\İDO Uygulama\ido-navigasyon-backend" && node server.js
```

`ido-navigasyon-mobil-v3` klasöründe Expo'yu arka planda başlat:
```bash
npx expo start
```

Birkaç saniye bekleyip bundler log çıktısında hata olmadığını doğrula (beklenen: `Bundled ... index.js (N modules)` gibi bir satır, hata/uyarı yok). Ardından hem backend hem Expo süreçlerini durdur (arkanda çalışan bir şey bırakma, portları boşalt).

- [ ] **Step 6: Commit**

```bash
git add ido-navigasyon-mobil-v3/package.json ido-navigasyon-mobil-v3/package-lock.json ido-navigasyon-mobil-v3/scripts/leaflet-vendorle.js ido-navigasyon-mobil-v3/assets/leaflet/leafletJs.js ido-navigasyon-mobil-v3/assets/leaflet/leafletCss.js ido-navigasyon-mobil-v3/App.js
git commit -m "feat: Leaflet'i CDN yerine local bundle'dan yukle (zayif baglantida harita acilabilsin)"
```

- [ ] **Step 7: Gerçek cihaz doğrulaması için not düş**

Raporda açıkça belirt: harita çerçevesinin gerçek bir telefonda/Expo Go'da görsel olarak doğru render olduğu bu plan kapsamında doğrulanmadı (fiziksel cihaz gerektirir) — kullanıcının uygun olduğunda tek bir bakışla teyit edeceği ayrı bir adım.
