# Tema Modernizasyonu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uygulamanın renk paletini `theme.js` adlı merkezi bir dosyada tanımlayıp App.js ve app.json içindeki tüm hardcoded eski renkleri (lacivert `#0D3B66` ailesi) yeni palete (`#0d1b2a` zemin, `#4FA8D8` mavi, `#F2A65A` turuncu, `#E85C5C` kırmızı, `#8FBF9F` yeşil) taşımak; açık/koyu modun ikisini de korumak ve harita ikonlarını (gemi/ada/batık) yeni renklere göre güncellemek.

**Architecture:** Tek bir `theme.js` dosyası marka renklerini (`marka`), mod bazlı zemin/yüzey/yazı token'larını (`koyuTema`, `acikTema`, `temaSec()`), tip bazlı kart renklerini (`tipRenkleri()`) ve harita SVG/CSS renklerini (`haritaRenkleri`) CommonJS `module.exports` ile dışa verir. `App.js` bunları import eder; mevcut `renkler`/`tipRengi` değişken/fonksiyon isimleri korunarak JSX'in geri kalanında (dokunulmayan onlarca `renkler.xxx` kullanım noktası) diff oluşmaz. `app.json` sadece iki hex değeri günceller.

**Tech Stack:** React Native (Expo v54), tek dosyalık `App.js` (StyleSheet + inline stiller), Leaflet (WebView içine gömülü HTML/SVG string).

## Global Constraints

- Marka renkleri sabit ve tam olarak şu hex değerleridir: mavi `#4FA8D8`, turuncu `#F2A65A`, kırmızı `#E85C5C`, yeşil `#8FBF9F`, koyu lacivert zemin `#0d1b2a`.
- **Ada rengi ayrımı:** genel UI (kartlar, liste noktaları, favoriler bağlamı, butonlar) → **yeşil**. Harita üzerindeki ada marker ikonu → **turuncu**. Bu bilinçli bir ayrımdır, hata değildir.
- **Batık rengi:** hem genel UI hem harita marker'ı → **kırmızı** (tek renk, ayrım yok).
- Projede otomatik test altyapısı (jest vb.) yok. Doğrulama üç şekilde yapılır: (1) `node -e` ile syntax/shape kontrolü, (2) `npx expo export --platform web` ile derleme kontrolü, (3) `npx expo start --web` ile manuel görsel inceleme (açık/koyu mod).
- Mevcut değişken/fonksiyon isimleri (`renkler`, `tipRengi`, `tema`) App.js içinde korunur; sadece tanımları değişir, çağrı yerleri dokunulmadan çalışmaya devam eder.
- Saf destekleyici/tint metin renkleri (örn. `#CDE3F0`, `#C8E6C9`, `#C7D3DD`) marka renk ailesine ait olmadığından kapsam dışıdır, değiştirilmez.
- `app.json` değişikliği native build (EAS) gerektirir; Expo Go/JS-only reload ile görünmez olması beklenen bir durumdur, hata değildir.

---

### Task 1: `theme.js` oluştur

**Files:**
- Create: `theme.js`

**Interfaces:**
- Consumes: yok (bağımsız, ilk task)
- Produces (sonraki tüm task'lar bunları kullanır):
  - `marka.mavi.taban` (`'#4FA8D8'`), `marka.mavi.metinAcikMod` (`'#1C6E99'`)
  - `marka.turuncu.taban` (`'#F2A65A'`), `marka.turuncu.metinAcikMod` (`'#A85D14'`)
  - `marka.kirmizi.taban` (`'#E85C5C'`), `marka.kirmizi.metinAcikMod` (`'#B23A3A'`)
  - `marka.yesil.taban` (`'#8FBF9F'`), `marka.yesil.metinAcikMod` (`'#2F6B47'`)
  - `koyuTema` = `{ zemin, yuzey, ozetKartArkaplan, kenarlik, yaziBirincil, yaziIkincil }`
  - `acikTema` = aynı şekil, açık mod değerleri
  - `temaSec(karanlikMod: boolean) => koyuTema | acikTema`
  - `tipRenkleri(tip: 'ada'|'batik'|diğer, karanlikMod: boolean) => { arkaplan, kenar, yazi }`
  - `haritaRenkleri` = `{ gemiGovde, gemiCerceve, gemiKabin, gemiPencere, gemiBaca, ada, batik, haritaZeminKoyu, haritaZeminAcik, adaPopupArkaplan, batikPopupArkaplan }`

- [ ] **Step 1: `theme.js` dosyasını oluştur**

```js
const marka = {
  mavi: { taban: '#4FA8D8', metinAcikMod: '#1C6E99' },
  turuncu: { taban: '#F2A65A', metinAcikMod: '#A85D14' },
  kirmizi: { taban: '#E85C5C', metinAcikMod: '#B23A3A' },
  yesil: { taban: '#8FBF9F', metinAcikMod: '#2F6B47' },
};

const koyuTema = {
  zemin: '#0d1b2a',
  yuzey: '#152436',
  ozetKartArkaplan: '#1B3A52',
  kenarlik: '#22384F',
  yaziBirincil: '#E8EEF3',
  yaziIkincil: '#7F97AB',
};

const acikTema = {
  zemin: '#F4F8FB',
  yuzey: '#FFFFFF',
  ozetKartArkaplan: '#0d1b2a',
  kenarlik: '#DCE6ED',
  yaziBirincil: '#0d1b2a',
  yaziIkincil: '#5B7A8F',
};

function temaSec(karanlikMod) {
  return karanlikMod ? koyuTema : acikTema;
}

function tipRenkleri(tip, karanlikMod) {
  if (tip === 'ada') {
    return karanlikMod
      ? { arkaplan: '#1E3A2A', kenar: marka.yesil.taban, yazi: marka.yesil.taban }
      : { arkaplan: '#EAF5EE', kenar: marka.yesil.metinAcikMod, yazi: marka.yesil.metinAcikMod };
  }
  if (tip === 'batik') {
    return karanlikMod
      ? { arkaplan: '#3A1E1E', kenar: marka.kirmizi.taban, yazi: marka.kirmizi.taban }
      : { arkaplan: '#FBEAEA', kenar: marka.kirmizi.metinAcikMod, yazi: marka.kirmizi.metinAcikMod };
  }
  return karanlikMod
    ? { arkaplan: koyuTema.yuzey, kenar: marka.mavi.taban, yazi: marka.mavi.taban }
    : { arkaplan: '#EAF3FA', kenar: marka.mavi.metinAcikMod, yazi: marka.mavi.metinAcikMod };
}

const haritaRenkleri = {
  gemiGovde: '#FFFFFF',
  gemiCerceve: marka.mavi.taban,
  gemiKabin: marka.mavi.taban,
  gemiPencere: '#FFFFFF',
  gemiBaca: marka.turuncu.taban,
  ada: marka.turuncu.taban,
  batik: marka.kirmizi.taban,
  haritaZeminKoyu: koyuTema.zemin,
  haritaZeminAcik: '#E5F0F8',
  adaPopupArkaplan: '#FFF3E4',
  batikPopupArkaplan: '#FBEAEA',
};

module.exports = { marka, koyuTema, acikTema, temaSec, tipRenkleri, haritaRenkleri };
```

- [ ] **Step 2: Şekil (shape) kontrolü çalıştır**

Run:
```bash
node -e "const t = require('./theme.js'); const need = ['marka','koyuTema','acikTema','temaSec','tipRenkleri','haritaRenkleri']; const missing = need.filter(k => !(k in t)); if (missing.length) { console.error('EKSIK:', missing); process.exit(1); } const tp = t.tipRenkleri('ada', false); if (!tp.arkaplan || !tp.kenar || !tp.yazi) { console.error('tipRenkleri sekli bozuk'); process.exit(1); } console.log('OK', Object.keys(t));"
```
Expected: `OK [ 'marka', 'koyuTema', 'acikTema', 'temaSec', 'tipRenkleri', 'haritaRenkleri' ]`, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add theme.js
git commit -m "feat: merkezi tema/renk paleti dosyasi ekle"
```

---

### Task 2: `app.json` splash ve adaptive icon rengini güncelle

**Files:**
- Modify: `app.json:13`, `app.json:21`

**Interfaces:**
- Consumes: yok (sabit hex, theme.js'e bağımlı değil)
- Produces: yok

- [ ] **Step 1: `expo.splash.backgroundColor` değerini güncelle**

`app.json:13` içinde:
```json
      "backgroundColor": "#0D3B66"
```
satırını (splash bloğu içindeki, satır 13) şuna çevir:
```json
      "backgroundColor": "#0d1b2a"
```

- [ ] **Step 2: `expo.android.adaptiveIcon.backgroundColor` değerini güncelle**

`app.json:21` içinde:
```json
        "backgroundColor": "#0D3B66"
```
satırını şuna çevir:
```json
        "backgroundColor": "#0d1b2a"
```

- [ ] **Step 3: JSON geçerliliğini ve değerleri doğrula**

Run:
```bash
node -e "const j = require('./app.json'); const ok = j.expo.splash.backgroundColor === '#0d1b2a' && j.expo.android.adaptiveIcon.backgroundColor === '#0d1b2a'; if (!ok) { console.error('FAIL', j.expo.splash.backgroundColor, j.expo.android.adaptiveIcon.backgroundColor); process.exit(1); } console.log('OK');"
```
Expected: `OK`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add app.json
git commit -m "feat: splash ve adaptive icon rengini yeni lacivert ile guncelle"
```

**Not:** Bu değişiklik yalnızca native build'de (EAS) görünür; `expo start` ile JS reload sırasında splash rengi değişmez. Bu beklenen bir durumdur.

---

### Task 3: Üst çubuk, ilerleme çubuğu, özet kartı, bağlantı göstergeleri (App.js)

**Files:**
- Modify: `App.js:1-7` (import ekle), `App.js:250-263`, `App.js:334-337`, `App.js:388`, `App.js:398`, `App.js:422`, `App.js:696-704`, `App.js:717-719`

**Interfaces:**
- Consumes: `marka`, `koyuTema`, `acikTema`, `temaSec`, `tipRenkleri` (theme.js, Task 1)
- Produces: `tema` (yerel değişken, component içinde `temaSec(karanlikMod)` sonucu) — Task 4 ve 5 bu değişkeni kullanacak, aynı component fonksiyonu içinde tanımlı olduğu için ek import gerekmez.

- [ ] **Step 1: Import ekle**

`App.js:7` (`import AsyncStorage from '@react-native-async-storage/async-storage';` satırından hemen sonra) şunu ekle:

```js
import { marka, koyuTema, acikTema, temaSec, tipRenkleri, haritaRenkleri } from './theme';
```

- [ ] **Step 2: `tipRengi`/`renkler` tanımını theme.js'e yönlendir**

`App.js:250-263` bloğunu:
```js
  function tipRengi(tip) {
    if (karanlikMod) {
      if (tip === 'ada') return { arkaplan: '#4A3300', kenar: '#E0A030', yazi: '#E0A030' };
      if (tip === 'batik') return { arkaplan: '#0F2E45', kenar: '#4FA3D9', yazi: '#4FA3D9' };
      return { arkaplan: '#1B2733', kenar: '#4FA3D9', yazi: '#4FA3D9' };
    }
    if (tip === 'ada') return { arkaplan: '#FFF4E5', kenar: '#C67A00', yazi: '#C67A00' };
    if (tip === 'batik') return { arkaplan: '#E5F0F8', kenar: '#1E6091', yazi: '#1E6091' };
    return { arkaplan: '#F4F8FB', kenar: '#0D3B66', yazi: '#0D3B66' };
  }

  const renkler = karanlikMod
    ? { govdeArkaplan: '#0B1520', kutuArkaplan: '#1B2733', yazi: '#E8EEF3', etiket: '#7F97AB' }
    : { govdeArkaplan: '#F4F8FB', kutuArkaplan: '#FFFFFF', yazi: '#0D3B66', etiket: '#5B7A8F' };
```
şununla değiştir:
```js
  function tipRengi(tip) {
    return tipRenkleri(tip, karanlikMod);
  }

  const tema = temaSec(karanlikMod);
  const renkler = {
    govdeArkaplan: tema.zemin,
    kutuArkaplan: tema.yuzey,
    yazi: tema.yaziBirincil,
    etiket: tema.yaziIkincil,
  };
```

- [ ] **Step 3: Dış kapsayıcı, StatusBar ve üst çubuk mode-branch'lerini sadeleştir**

`App.js:334-337`:
```jsx
    <View style={[styles.disKapsayici, { backgroundColor: karanlikMod ? '#0B1520' : '#0D3B66' }]}>
      <StatusBar barStyle="light-content" backgroundColor={karanlikMod ? '#0B1520' : '#0D3B66'} />

      <View style={[styles.ustCubuk, acilDurum && styles.ustCubukAcil, karanlikMod && !acilDurum && { backgroundColor: '#0B1520', borderBottomColor: '#1B2733' }]}>
```
şununla değiştir:
```jsx
    <View style={[styles.disKapsayici, { backgroundColor: koyuTema.zemin }]}>
      <StatusBar barStyle="light-content" backgroundColor={koyuTema.zemin} />

      <View style={[styles.ustCubuk, acilDurum && styles.ustCubukAcil]}>
```
(Üst çubuk artık her iki modda da aynı lacivert zemini kullanıyor, StyleSheet'teki `ustCubuk` tanımı Step 6'da güncellenecek — bu yüzden ayrı bir karanlık mod override'ına gerek kalmıyor.)

- [ ] **Step 4: Özet kartı arkaplanını güncelle**

`App.js:388`:
```jsx
          style={[styles.ozetKart, { backgroundColor: acilDurum ? '#B71C1C' : (karanlikMod ? '#12324D' : '#0D3B66') }]}
```
şununla değiştir:
```jsx
          style={[styles.ozetKart, { backgroundColor: acilDurum ? marka.kirmizi.taban : tema.ozetKartArkaplan }]}
```

- [ ] **Step 5: Bağlantı durumu noktalarını güncelle**

`App.js:398`:
```jsx
            <View style={[styles.ozetNokta, { backgroundColor: baglantiDurumu === 'Bagli' ? '#4CAF50' : '#EF5350' }]} />
```
şununla değiştir:
```jsx
            <View style={[styles.ozetNokta, { backgroundColor: baglantiDurumu === 'Bagli' ? marka.yesil.taban : marka.kirmizi.taban }]} />
```

`App.js:422`:
```jsx
            <View style={[styles.durumNoktasi, { backgroundColor: baglantiDurumu === 'Bagli' ? '#2E7D32' : '#C62828' }]} />
```
şununla değiştir:
```jsx
            <View style={[styles.durumNoktasi, { backgroundColor: baglantiDurumu === 'Bagli' ? marka.yesil.taban : marka.kirmizi.taban }]} />
```

- [ ] **Step 6: StyleSheet — üst çubuk ve ilerleme çubuğu renklerini güncelle**

`App.js:696-704` bloğunda:
```js
  ustCubuk: { backgroundColor: '#0D3B66', paddingTop: 55, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 3, borderBottomColor: '#1E6091' },
  ustCubukAcil: { backgroundColor: '#B71C1C', borderBottomColor: '#7F0000' },
```
şununla değiştir:
```js
  ustCubuk: { backgroundColor: koyuTema.zemin, paddingTop: 55, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 3, borderBottomColor: marka.mavi.taban },
  ustCubukAcil: { backgroundColor: marka.kirmizi.taban, borderBottomColor: marka.kirmizi.metinAcikMod },
```

`App.js:703`:
```js
  ilerlemeIcKutu: { height: 8, backgroundColor: '#4FA3D9', borderRadius: 4 },
```
şununla değiştir:
```js
  ilerlemeIcKutu: { height: 8, backgroundColor: marka.mavi.taban, borderRadius: 4 },
```

- [ ] **Step 7: Derleme kontrolü**

Run:
```bash
npx expo export --platform web
```
Expected: Komut hatasız (exit 0) tamamlanır, `dist/` klasörü oluşur. Herhangi bir "Unable to resolve module" veya syntax hatası olmamalı.

- [ ] **Step 8: Görsel doğrulama**

Run (arka planda başlat, tarayıcıda kontrol et, sonra durdur):
```bash
npx expo start --web
```
Tarayıcıda: üst çubuğun koyu lacivert (`#0d1b2a`) olduğunu, ilerleme çubuğunun mavi (`#4FA8D8`) dolduğunu, özet kartının koyu lacivert olduğunu, bağlantı durumu noktasının yeşil/kırmızı olduğunu, sağ üstteki ay/güneş ikonuyla açık/koyu modu değiştirerek her iki modda da tutarlı göründüğünü doğrula. Sunucuyu durdur (Ctrl+C).

- [ ] **Step 9: Commit**

```bash
git add App.js
git commit -m "feat: ust cubuk, ilerleme cubugu ve ozet kartini yeni temaya tasi"
```

---

### Task 4: Ada/batık tip renkleri — bilgi kartı ve tüm duraklar listesi (App.js)

**Files:**
- Modify: `App.js:462-473`, `App.js:502`, `App.js:519-527`, `App.js:720`, `App.js:726`

**Interfaces:**
- Consumes: `tipRengi(tip)` (Task 3'te theme.js'e yönlendirilmiş yerel wrapper), `marka` (Task 1)
- Produces: yok

**Not:** `bilgiKarti` bloğu (462-473) zaten `tipRengi(gosterilecekKart.tip)` çağırıyor — Task 3'te bu fonksiyon theme.js'e yönlendirildiği için bu blok **otomatik olarak** yeni renkleri (ada=yeşil, batık=kırmızı) alır, kod değişikliği gerekmez. Bu task'ta asıl iş, `tumNoktalar` listesindeki (502-527) **inline tekrarlanan** eski hardcoded ternary'leri aynı `tipRengi()` fonksiyonuna yönlendirmek.

- [ ] **Step 1: Tüm duraklar listesindeki tip noktası rengini `tipRengi()` üzerinden al**

`App.js:502`:
```jsx
                  <View style={[styles.tipNoktasi, { backgroundColor: nokta.tip === 'ada' ? '#C67A00' : '#1E6091' }]} />
```
şununla değiştir:
```jsx
                  <View style={[styles.tipNoktasi, { backgroundColor: tipRengi(nokta.tip).kenar }]} />
```

- [ ] **Step 2: Tüm duraklar listesindeki 3 buton rengini `tipRengi()` üzerinden al**

`App.js:519-527` bloğunda üç ayrı yerde tekrarlanan:
```jsx
                  <TouchableOpacity style={[styles.kucukButon, { backgroundColor: nokta.tip === 'ada' ? '#C67A00' : '#1E6091' }]} onPress={() => videoAc(nokta.video_url)}>
```
```jsx
                  <TouchableOpacity style={[styles.kucukButon, { backgroundColor: nokta.tip === 'ada' ? '#C67A00' : '#1E6091' }]} onPress={() => videoAc(nokta.sesli_anlatim_url)}>
```
```jsx
                  <TouchableOpacity style={[styles.kucukButon, { backgroundColor: nokta.tip === 'ada' ? '#C67A00' : '#1E6091' }]} onPress={() => videoAc(nokta.videolu_anlatim_url)}>
```
her üçünde de `nokta.tip === 'ada' ? '#C67A00' : '#1E6091'` ifadesini `tipRengi(nokta.tip).kenar` ile değiştir (satırların geri kalanı aynı kalır).

- [ ] **Step 3: StyleSheet'teki statik mavi vurguları güncelle**

`App.js:720`:
```js
  kutu: { padding: 16, borderRadius: 10, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#1E6091' },
```
şununla değiştir:
```js
  kutu: { padding: 16, borderRadius: 10, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: marka.mavi.taban },
```

`App.js:726`:
```js
  durakNumarasi: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#1E6091', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
```
şununla değiştir:
```js
  durakNumarasi: { width: 22, height: 22, borderRadius: 11, backgroundColor: marka.mavi.taban, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
```

- [ ] **Step 4: Derleme kontrolü**

Run:
```bash
npx expo export --platform web
```
Expected: exit 0, hata yok.

- [ ] **Step 5: Görsel doğrulama**

`npx expo start --web` ile başlat, "TÜM DURAKLAR" listesinde bir ada durağını (örn. Heybeliada) açıp tip noktasının ve butonların yeşil, varsa bir batık durağının kırmızı göründüğünü doğrula. Sunucuyu durdur.

- [ ] **Step 6: Commit**

```bash
git add App.js
git commit -m "feat: ada/batik genel UI renklerini yesil/kirmiziye tasi"
```

---

### Task 5: Acil durum/varış banner'ları, butonlar, tanıtım ekranı (App.js)

**Files:**
- Modify: `App.js:593`, `App.js:601`, `App.js:659`, `App.js:672`, `App.js:709`, `App.js:711`, `App.js:745`, `App.js:759`

**Interfaces:**
- Consumes: `marka`, `koyuTema`, `renkler` (Task 1 ve Task 3'te tanımlı)
- Produces: yok

- [ ] **Step 1: Yazı boyutu seçili buton rengini güncelle**

`App.js:593`:
```jsx
                <TouchableOpacity key={boyut} onPress={() => setYaziBoyutu(boyut)} style={[styles.boyutButon, { backgroundColor: yaziBoyutu === boyut ? '#0D3B66' : '#E0E0E0' }]}>
```
şununla değiştir:
```jsx
                <TouchableOpacity key={boyut} onPress={() => setYaziBoyutu(boyut)} style={[styles.boyutButon, { backgroundColor: yaziBoyutu === boyut ? marka.mavi.taban : '#E0E0E0' }]}>
```

- [ ] **Step 2: "Tanıtımı Tekrar Göster" butonunu moda duyarlı hale getir**

`App.js:600-601`:
```jsx
              style={[styles.kapatButon, { backgroundColor: '#5B7A8F', marginTop: 10 }]}
```
şununla değiştir:
```jsx
              style={[styles.kapatButon, { backgroundColor: renkler.etiket, marginTop: 10 }]}
```
(Not: eski kod bu butonda koyu modda da sabit açık-mod rengini kullanıyordu — bu düzeltme aynı zamanda o tutarsızlığı giderir.)

- [ ] **Step 3: Tanıtım ekranı zemin ve aktif nokta rengini güncelle**

`App.js:659`:
```jsx
        <View style={[styles.tanitimEkrani, { backgroundColor: '#0D3B66' }]}>
```
şununla değiştir:
```jsx
        <View style={[styles.tanitimEkrani, { backgroundColor: koyuTema.zemin }]}>
```

`App.js:672`:
```jsx
                  { backgroundColor: index === tanitimIndex ? '#4FA3D9' : 'rgba(255,255,255,0.3)' },
```
şununla değiştir:
```jsx
                  { backgroundColor: index === tanitimIndex ? marka.mavi.taban : 'rgba(255,255,255,0.3)' },
```

- [ ] **Step 4: StyleSheet — acil durum/varış kutuları ve kapat butonlarını güncelle**

`App.js:709`:
```js
  acilKutu: { backgroundColor: '#B71C1C', padding: 16, borderRadius: 10, marginBottom: 16 },
```
şununla değiştir:
```js
  acilKutu: { backgroundColor: marka.kirmizi.taban, padding: 16, borderRadius: 10, marginBottom: 16 },
```

`App.js:711`:
```js
  varisKutu: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 10, marginBottom: 16, alignItems: 'center' },
```
şununla değiştir:
```js
  varisKutu: { backgroundColor: marka.yesil.metinAcikMod, padding: 16, borderRadius: 10, marginBottom: 16, alignItems: 'center' },
```
(Not: `marka.yesil.taban` açık pastel bir yeşil olduğu için beyaz yazıyla dolu banner arkaplanında yeterli kontrast sağlamaz; bu nedenle koyultulmuş `metinAcikMod` varyantı kullanılıyor.)

`App.js:745`:
```js
  kapatButon: { backgroundColor: '#0D3B66', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 24 },
```
şununla değiştir:
```js
  kapatButon: { backgroundColor: marka.mavi.taban, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 24 },
```

`App.js:759`:
```js
  tanitimIleriButon: { backgroundColor: '#4FA3D9', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 10 },
```
şununla değiştir:
```js
  tanitimIleriButon: { backgroundColor: marka.mavi.taban, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 10 },
```

- [ ] **Step 5: Derleme kontrolü**

Run:
```bash
npx expo export --platform web
```
Expected: exit 0, hata yok.

- [ ] **Step 6: Görsel doğrulama**

`npx expo start --web` ile başlat: Ayarlar modalını açıp yazı boyutu seçili butonunun mavi olduğunu, "Tanıtımı Tekrar Göster" ve "Kapat" butonlarının doğru renkte olduğunu, tanıtım ekranının (ilk açılış / Ayarlar > Tanıtımı Tekrar Göster) koyu lacivert zeminde mavi aktif nokta ve mavi "İleri" butonuyla göründüğünü doğrula. Sunucuyu durdur.

- [ ] **Step 7: Commit**

```bash
git add App.js
git commit -m "feat: acil durum/varis banner ve butonlari yeni temaya tasi"
```

---

### Task 6: Harita ikonları — gemi, ada, batık (App.js `haritaHtml`)

**Files:**
- Modify: `App.js:275`, `App.js:277-278`, `App.js:296`, `App.js:301-308`, `App.js:319`

**Interfaces:**
- Consumes: `haritaRenkleri`, `marka`, `koyuTema` (Task 1)
- Produces: yok

**Not:** `haritaHtml` bir template literal (JS string) olduğu için değişkenler `${...}` ile enjekte edilir; bu kod WebView içinde çalışan HTML/JS'e dönüşür, React bileşeni değildir.

- [ ] **Step 1: Harita zemin rengini güncelle**

`App.js:275`:
```js
        #harita { width: 100vw; height: 100vh; background: ${karanlikMod ? '#0B1520' : '#E5F0F8'}; }
```
şununla değiştir:
```js
        #harita { width: 100vw; height: 100vh; background: ${karanlikMod ? haritaRenkleri.haritaZeminKoyu : haritaRenkleri.haritaZeminAcik}; }
```

- [ ] **Step 2: Popup renklerini güncelle**

`App.js:277-278`:
```js
        .ada-popup .leaflet-popup-content-wrapper { background: #FFF4E5; color: #C67A00; font-weight: bold; }
        .batik-popup .leaflet-popup-content-wrapper { background: #E5F0F8; color: #1E6091; font-weight: bold; }
```
şununla değiştir:
```js
        .ada-popup .leaflet-popup-content-wrapper { background: ${haritaRenkleri.adaPopupArkaplan}; color: ${marka.turuncu.metinAcikMod}; font-weight: bold; }
        .batik-popup .leaflet-popup-content-wrapper { background: ${haritaRenkleri.batikPopupArkaplan}; color: ${marka.kirmizi.metinAcikMod}; font-weight: bold; }
```

- [ ] **Step 3: Gemi ikonunu güncelle**

`App.js:296`:
```js
          html: '<svg width="46" height="30" viewBox="0 0 46 30" xmlns="http://www.w3.org/2000/svg"><ellipse cx="23" cy="27" rx="21" ry="2" fill="rgba(0,0,0,0.25)"/><path d="M6 20 L40 20 L35 27 L11 27 Z" fill="#FFFFFF" stroke="#0D3B66" stroke-width="1.5"/><rect x="14" y="10" width="18" height="10" fill="#0D3B66" rx="1"/><rect x="16" y="12" width="4" height="4" fill="#4FA3D9"/><rect x="22" y="12" width="4" height="4" fill="#4FA3D9"/><text x="23" y="18" font-size="6" font-weight="bold" fill="white" text-anchor="middle">IDO</text><rect x="21" y="3" width="4" height="8" fill="#C67A00" rx="1"/></svg>',
```
şununla değiştir (bu satır `haritaHtml` template literal'inin İÇİNDE tek tırnaklı bir alt-string olsa da, tamamı zaten dıştaki backtick'in kapsamında olduğu için `${}` interpolasyonu burada da çalışır — kod tabanındaki diğer harita renkleri, örn. satır 275/287-289, zaten bu deseni kullanıyor):
```js
          html: '<svg width="46" height="30" viewBox="0 0 46 30" xmlns="http://www.w3.org/2000/svg"><ellipse cx="23" cy="27" rx="21" ry="2" fill="rgba(0,0,0,0.25)"/><path d="M6 20 L40 20 L35 27 L11 27 Z" fill="${haritaRenkleri.gemiGovde}" stroke="${haritaRenkleri.gemiCerceve}" stroke-width="1.5"/><rect x="14" y="10" width="18" height="10" fill="${haritaRenkleri.gemiKabin}" rx="1"/><rect x="16" y="12" width="4" height="4" fill="${haritaRenkleri.gemiPencere}"/><rect x="22" y="12" width="4" height="4" fill="${haritaRenkleri.gemiPencere}"/><text x="23" y="18" font-size="6" font-weight="bold" fill="white" text-anchor="middle">IDO</text><rect x="21" y="3" width="4" height="8" fill="${haritaRenkleri.gemiBaca}" rx="1"/></svg>',
```

- [ ] **Step 4: Ada ve batık marker ikonlarını güncelle**

`App.js:301-308`:
```js
        const adaIkonu = L.divIcon({
          html: '<div style="background:#C67A00;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
          className: '', iconSize: [16, 16]
        });
        const batikIkonu = L.divIcon({
          html: '<div style="background:#1E6091;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
          className: '', iconSize: [16, 16]
        });
```
şununla değiştir:
```js
        const adaIkonu = L.divIcon({
          html: '<div style="background:${haritaRenkleri.ada};width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
          className: '', iconSize: [16, 16]
        });
        const batikIkonu = L.divIcon({
          html: '<div style="background:${haritaRenkleri.batik};width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
          className: '', iconSize: [16, 16]
        });
```

- [ ] **Step 5: Rota çizgisi rengini güncelle**

`App.js:319`:
```js
        let rotaCizgisi = L.polyline([], { color: '#0D3B66', weight: 3, opacity: 0.6 }).addTo(map);
```
şununla değiştir:
```js
        let rotaCizgisi = L.polyline([], { color: '${marka.mavi.taban}', weight: 3, opacity: 0.6 }).addTo(map);
```

- [ ] **Step 6: Derleme kontrolü**

Run:
```bash
npx expo export --platform web
```
Expected: exit 0, hata yok.

- [ ] **Step 7: Görsel doğrulama**

`npx expo start --web` ile başlat: haritada gemi ikonunun beyaz gövde + mavi çerçeve/kabin + turuncu baca ile göründüğünü, Heybeliada/Büyükada/Kınalıada noktalarının turuncu, "Bozuk Gemi Batığı" noktasının kırmızı olduğunu, bu noktalara tıklayınca açılan popup'ların doğru renkte metin gösterdiğini doğrula. Sunucuyu durdur.

- [ ] **Step 8: Commit**

```bash
git add App.js
git commit -m "feat: harita gemi/ada/batik ikonlarini yeni temaya tasi"
```

---

### Task 7: Final tarama ve tam doğrulama

**Files:**
- Modify: `App.js` (varsa kalan eski hex kodları), gerekirse `theme.js`

**Interfaces:**
- Consumes: Task 1-6'nın tüm çıktıları
- Produces: yok (kapanış task'ı)

- [ ] **Step 1: Eski renklerin kalıp kalmadığını tara**

Run:
```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('App.js', 'utf8');
const eskiRenkler = ['#0D3B66', '#1E6091', '#4FA3D9', '#C67A00', '#B71C1C', '#0B1520', '#1B2733', '#12324D', '#4A3300', '#E0A030', '#0F2E45', '#FFF4E5', '#E5F0F8'];
const bulunanlar = eskiRenkler.filter(r => src.includes(r));
if (bulunanlar.length) { console.error('KALAN ESKI RENKLER:', bulunanlar); process.exit(1); }
console.log('OK: eski renk kalmadi');
"
```
Expected: `OK: eski renk kalmadi`, exit 0. Eğer bulunanlar listesi doluysa, o satırları bulup (Grep ile) ilgili yeni token'a taşı ve komutu tekrar çalıştır.

- [ ] **Step 2: Tam derleme kontrolü**

Run:
```bash
npx expo export --platform web
```
Expected: exit 0, hata yok.

- [ ] **Step 3: Uçtan uca görsel doğrulama**

`npx expo start --web` ile başlat, sırasıyla kontrol et:
- Açık mod: üst çubuk lacivert, ilerleme çubuğu mavi, kartlar beyaz zemin üzerinde koyu lacivert yazı, ada noktaları yeşil/turuncu ayrımına uygun, harita ikonları doğru.
- Ay ikonuna dokunup koyu moda geç: zemin `#0d1b2a`, kartlar bir ton açık lacivert, yazılar açık renk, tüm vurgu renkleri okunur durumda.
- Ayarlar, Yardım, Yolculuk Özeti modallarını aç, her ikisinde de renklerin moda uygun göründüğünü doğrula.
- Backend çalışıyorsa acil durum simülasyonunu tetikleyip üst çubuğun/kartın kırmızıya döndüğünü doğrula (backend yoksa bu adımı atla ve not düş).

Sunucuyu durdur.

- [ ] **Step 4: Commit (yalnızca Step 1'de düzeltme yapıldıysa)**

```bash
git add App.js theme.js
git commit -m "fix: final tarama sonrasi kalan eski renkleri temizle"
```
