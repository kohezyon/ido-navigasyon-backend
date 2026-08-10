# Yolcu App'i Tema Yenileme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ido-navigasyon-mobil-v3/App.js`'in görsel temasını, onaylanan v1 tasarımına (derin lacivert + pirinç sarısı, Fraunces/Public Sans fontları, gradyanlı üst bar/ilerleme çubuğu/hero kart, gölgeli ikincil kartlar) göre güncellemek.

**Architecture:** Yeni renk/gradyan tokenleri App.js'in üstünde tanımlanır; `expo-linear-gradient` üst bar, ilerleme çubuğu ve hero kart (`ozetKart`) için düz renk yerine gradyan sağlar; `@expo-google-fonts/fraunces` ve `@expo-google-fonts/public-sans` başlık/gövde fontlarını yükler; `StyleSheet.create` içindeki paylaşılan stil tanımları (JSX'te tek tek değil, merkezi olarak) güncellenir — böylece değişiklik tutarlı ve düşük riskli kalır.

**Tech Stack:** Expo/React Native SDK 54, `expo-linear-gradient`, `expo-font`, `@expo-google-fonts/fraunces`, `@expo-google-fonts/public-sans`.

## Global Constraints

- Sadece `ido-navigasyon-mobil-v3/App.js` değişiyor — crew app'e (`ido-navigasyon-personel`) veya harita/Leaflet HTML içeriğine dokunulmuyor.
- Hiçbir davranış/mantık (fetch, socket, state akışı) değişmiyor — sadece görsel stil.
- Renk tokenleri (spec'ten birebir): `navyDeep #0A2540`, `navyMid #123A5E`, `gold #C9962B`, `goldSoft #E4C173`, `teal #2B7A78`, `warmWhite #F6F4EF`, `ink #142433`, `inkSoft #4A5A68`.
- Karanlık mod için mevcut koyu değerler (`#0B1520`, `#12324D`) korunur ve yeni gradyanlarda kullanılır — spec'in "karanlık modda mevcut değerlere yakın" notuyla tutarlı.
- Otomatik test altyapısı yok — doğrulama Metro bundler sağlık kontrolü + gerçek cihazda görsel doğrulama (ayrı manuel adım).

---

### Task 1: Font + gradyan bağımlılıklarını ekle, tema tokenlerini tanımla, üst bar/ilerleme çubuğu/hero kart/ikincil kartları güncelle

**Files:**
- Modify: `ido-navigasyon-mobil-v3/package.json` (yeni bağımlılıklar)
- Modify: `ido-navigasyon-mobil-v3/App.js` (import'lar, font yükleme, tema tokenleri, JSX + StyleSheet güncellemeleri)

**Interfaces:** Yok (tek dosyalık görsel değişiklik, başka bir task'ın tükettiği bir arayüz üretmiyor).

- [ ] **Step 1: Bağımlılıkları ekle**

`ido-navigasyon-mobil-v3` klasöründe:
```bash
npx expo install expo-font expo-linear-gradient
npm install @expo-google-fonts/fraunces @expo-google-fonts/public-sans
```

- [ ] **Step 2: Font yüklemeyi ve tema tokenlerini ekle**

`App.js`'in en üstündeki import'lardan hemen sonra (mevcut `const leafletJs = require(...)` satırlarından sonra) ekle:
```js
import { useFonts, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { PublicSans_400Regular, PublicSans_600SemiBold, PublicSans_700Bold } from '@expo-google-fonts/public-sans';

const TEMA = {
  navyDeep: '#0A2540',
  navyMid: '#123A5E',
  gold: '#C9962B',
  goldSoft: '#E4C173',
  teal: '#2B7A78',
};
```

`import { WebView } from 'react-native-webview';` satırının hemen altına ekle:
```js
import { LinearGradient } from 'expo-linear-gradient';
```

Component fonksiyonunun içinde (`export default function App() {` satırından hemen sonra, ilk `useState` çağrılarından önce), font yükleme durumunu tut:
```js
  const [fontlarYuklendi] = useFonts({
    Fraunces_600SemiBold,
    PublicSans_400Regular,
    PublicSans_600SemiBold,
    PublicSans_700Bold,
  });
```

`if (seferlerYukleniyor) { ... }` bloğunun hemen üstüne (satır ~396 civarı), fontlar yüklenene kadar sistem fontuyla aynı "Yukleniyor..." ekranını göstermek için ekle:
```js
  if (!fontlarYuklendi) {
    return (
      <View style={[styles.disKapsayici, { alignItems: 'center', justifyContent: 'center', backgroundColor: TEMA.navyDeep }]}>
        <StatusBar barStyle="light-content" backgroundColor={TEMA.navyDeep} />
        <Text style={{ color: 'white', fontSize: 16 }}>Yukleniyor...</Text>
      </View>
    );
  }
```

- [ ] **Step 3: Üst bar'ı gradyana çevir**

`App.js:434-435` (dış `View`/`StatusBar`):
```jsx
    <View style={[styles.disKapsayici, { backgroundColor: karanlikMod ? '#0B1520' : '#0D3B66' }]}>
      <StatusBar barStyle="light-content" backgroundColor={karanlikMod ? '#0B1520' : '#0D3B66'} />
```
şu şekilde değiştir (StatusBar rengi, gradyanın koyu ucuyla eşleşsin):
```jsx
    <View style={styles.disKapsayici}>
      <StatusBar barStyle="light-content" backgroundColor={karanlikMod ? '#0B1520' : TEMA.navyDeep} />
```

`App.js:437` (`ustCubuk` View'ı) ve onu saran yapı:
```jsx
      <View style={[styles.ustCubuk, acilDurum && styles.ustCubukAcil, karanlikMod && !acilDurum && { backgroundColor: '#0B1520', borderBottomColor: '#1B2733' }]}>
```
şu şekilde değiştir — `View`'ı `LinearGradient`'e çevir, düz `backgroundColor`'ları kaldır:
```jsx
      <LinearGradient
        colors={acilDurum ? ['#B71C1C', '#7F0000'] : (karanlikMod ? ['#0B1520', '#12324D'] : [TEMA.navyDeep, TEMA.navyMid])}
        style={styles.ustCubuk}
      >
```
Bu değişikliğin kapanış etiketini de güncellemek gerekiyor: `App.js:468` civarındaki `</View>` (üst barı kapatan) `</LinearGradient>` olmalı — bu View'ın İÇİNDEKİ diğer `<View>` etiketlerine dokunma, sadece en dıştaki (ustCubuk'u temsil eden) açılış/kapanış etiketini değiştir.

`styles.ustCubuk` tanımından (satır 799) `backgroundColor: '#0D3B66',` kısmını kaldır (gradyan artık bunu sağlıyor), geri kalan padding/border özellikleri kalsın:
```js
  ustCubuk: { paddingTop: 55, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 3, borderBottomColor: '#1E6091' },
```
`styles.ustCubukAcil` tanımı (satır 800) artık `LinearGradient`'in `colors` prop'u üzerinden yönetildiği için tamamen kaldırılabilir (kullanılmayan stil bırakma) — ama JSX'teki `acilDurum && styles.ustCubukAcil` referansı da kaldırılmalı (Step 3'ün üstündeki `LinearGradient` bloğunda zaten `acilDurum` renkleri `colors` prop'una taşındı).

`ustCubukBaslik` (satır 801) ve `ustCubukAltBaslik` (satır 802) tanımlarına font ekle:
```js
  ustCubukBaslik: { color: '#FFFFFF', fontWeight: 'bold', fontFamily: 'Fraunces_600SemiBold' },
  ustCubukAltBaslik: { color: '#CDE3F0', marginTop: 4, fontFamily: 'PublicSans_400Regular' },
```

- [ ] **Step 4: İlerleme çubuğunu gradyana çevir**

`App.js:458-459`:
```jsx
        <View style={styles.ilerlemeDisKutu}>
          <View style={[styles.ilerlemeIcKutu, { width: ilerlemeYuzdesi + '%' }]} />
        </View>
```
şu şekilde değiştir:
```jsx
        <View style={styles.ilerlemeDisKutu}>
          <LinearGradient
            colors={[TEMA.goldSoft, TEMA.gold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.ilerlemeIcKutu, { width: ilerlemeYuzdesi + '%' }]}
          />
        </View>
```
`styles.ilerlemeIcKutu` tanımından (satır 806) `backgroundColor: '#4FA3D9',` kısmını kaldır (gradyan sağlıyor):
```js
  ilerlemeIcKutu: { height: 8, borderRadius: 4 },
```
`styles.ilerlemeYazi` tanımına (satır 807) font ekle:
```js
  ilerlemeYazi: { color: '#CDE3F0', fontSize: 11, marginTop: 6, fontFamily: 'PublicSans_400Regular' },
```

- [ ] **Step 5: Hero kartı (ozetKart) gradyana çevir**

`App.js:490-491`:
```jsx
        <View
          style={[styles.ozetKart, { backgroundColor: acilDurum ? '#B71C1C' : (karanlikMod ? '#12324D' : '#0D3B66') }]}
          accessible={true}
```
şu şekilde değiştir:
```jsx
        <LinearGradient
          colors={acilDurum ? ['#B71C1C', '#7F0000'] : (karanlikMod ? ['#0B1520', '#12324D'] : [TEMA.navyDeep, TEMA.navyMid])}
          style={styles.ozetKart}
          accessible={true}
```
Bu bloğun kapanışı olan `App.js:520` civarındaki `</View>`'ı `</LinearGradient>` yap (yalnızca bu en dıştaki etiketi — içindeki `ozetSatir`/`ozetNokta` gibi iç View'lara dokunma).

`styles.ozetKart` tanımından (satır 817) değişecek bir şey yok (zaten `backgroundColor` içermiyor, sadece `borderRadius`/`padding`/`marginBottom`).

`styles.ozetKartYaziKucuk` (satır 820) rengini `goldSoft` yap (eyebrow etiketi hissi için):
```js
  ozetKartYaziKucuk: { color: '#E4C173', fontSize: 12, fontWeight: 'bold', fontFamily: 'PublicSans_700Bold' },
```
`styles.ozetKartBuyukYazi` (satır 821) Fraunces alsın:
```js
  ozetKartBuyukYazi: { color: 'white', fontSize: 22, fontWeight: 'bold', fontFamily: 'Fraunces_600SemiBold' },
```
`styles.ozetKartAltYazi` (satır 822) Public Sans alsın:
```js
  ozetKartAltYazi: { color: '#CDE3F0', fontSize: 14, marginTop: 6, fontFamily: 'PublicSans_400Regular' },
```

- [ ] **Step 6: İkincil kartları (`.kutu`) gölgeli hale getir, sol çizgiyi kaldır, eyebrow rengini teal yap**

`styles.kutu` tanımı (satır 823):
```js
  kutu: { padding: 16, borderRadius: 10, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#1E6091' },
```
şu şekilde değiştir (sol çizgi kaldırılıyor, yumuşak gölge ekleniyor — iOS için `shadow*`, Android için `elevation`):
```js
  kutu: {
    padding: 16, borderRadius: 14, marginBottom: 14,
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
    elevation: 2
  },
```

`styles.etiket` tanımı (satır 824):
```js
  etiket: { fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 6 },
```
şu şekilde değiştir (renk artık sabit `teal`, `renkler.etiket` referansı JSX'te kaldırılacak — bkz. aşağıda):
```js
  etiket: { fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 6, color: '#2B7A78', fontFamily: 'PublicSans_700Bold', fontSize: 11 },
```
`styles.degerYazi` tanımı (satır 825):
```js
  degerYazi: { fontWeight: '500' },
```
şu şekilde değiştir:
```js
  degerYazi: { fontWeight: '500', fontFamily: 'PublicSans_600SemiBold' },
```

Şimdi JSX'te `.etiket` kullanılan HER yerde `{ color: renkler.etiket, ... }` inline override'ını kaldır (yeni `styles.etiket` zaten sabit `teal` rengi içeriyor, `renkler.etiket` artık gereksiz override). Bu satırlar `App.js` içinde şu formatta görünüyor (birkaç örnek, hepsini bul-değiştir ile bu deseni takip ederek güncelle):
```jsx
<Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>BAGLANTI DURUMU</Text>
```
şu şekilde değiştir (sadece `color: renkler.etiket,` kısmı kaldırılıyor, `fontSize` override'ı kalıyor):
```jsx
<Text style={[styles.etiket, { fontSize: 12 * boyutCarpani }]}>BAGLANTI DURUMU</Text>
```
Bu değişikliği `App.js` içinde `color: renkler.etiket` geçen TÜM `styles.etiket` kullanımlarında (satır ~523, ~532, ~538, ~543, ~551, ~581, ~590 civarları — dosyada ara, hepsi aynı JSX desenini kullanıyor) uygula. `renkler.yazi` kullanan satırlara (örn. `degerYazi` için) dokunma — o override kalıyor (karanlık/aydınlık moda göre metin rengini ayarlamaya devam ediyor, sadece font ailesi `styles.degerYazi`'den geliyor).

- [ ] **Step 7: Metro bundler sağlık kontrolü**

`ido-navigasyon-backend` kökünde backend'i arka planda başlat (zaten çalışıyorsa atla, `netstat -ano | grep :3000` ile kontrol et):
```bash
node server.js
```
`ido-navigasyon-mobil-v3` klasöründe Expo'yu arka planda başlat:
```bash
npx expo start
```
Metro'nun `http://localhost:8081`'de dinlemeye başladığını doğrula, sonra bundle'ı zorla:
```bash
curl -s -o /dev/null -w "HTTP durum: %{http_code}\n" "http://localhost:8081/index.bundle?platform=android&dev=true" --max-time 90
```
Expected: `HTTP durum: 200`, arka plan log dosyasında `Bundled ... index.js (N modules)` satırı, hata/uyarı yok (özellikle font paketlerinin çözümlenip çözümlenmediğine dikkat et — `Unable to resolve '@expo-google-fonts/...'` gibi bir hata çıkarsa Step 1'deki kurulum eksik kalmış demektir).

Ardından hem backend hem Expo süreçlerini durdur (arkanda çalışan bir şey bırakma; `netstat -ano | grep :8081` ile port gerçekten boşaldığını doğrula, gerekirse `taskkill //F //PID <pid>`).

- [ ] **Step 8: Commit**

```bash
git add ido-navigasyon-mobil-v3/package.json ido-navigasyon-mobil-v3/package-lock.json ido-navigasyon-mobil-v3/App.js
git commit -m "feat: yolcu app temasini yenile (lacivert+pirinc sarisi, Fraunces/Public Sans)"
```

- [ ] **Step 9: Gerçek cihaz doğrulaması için not düş**

Raporda açıkça belirt: yeni temanın gerçek bir telefonda/Expo Go'da görsel olarak onaylanan mockup'a (v1) yakın göründüğü bu plan kapsamında doğrulanmadı (fiziksel cihaz gerektirir) — kullanıcının ekran görüntüsü paylaşarak teyit edeceği ayrı bir adım.
