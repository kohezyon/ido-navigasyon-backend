# Faz 6 / Alt-proje 2 — Offline/Zayıf Bağlantı Davranışı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ido-navigasyon-mobil-v3` uygulamasında, sunucuya erişilemediği durumlarda kullanıcıya yanıltıcı ("sefer yok" gibi) mesajlar göstermek yerine son bilinen veriyi (aktif sefer listesi, gemi konumu) `AsyncStorage`'dan göstermek ve durumu açıkça belirtmek.

**Architecture:** `AsyncStorage`'a iki yeni anahtar eklenir: `son_aktif_seferler` (son başarılı `/seferler/aktif` yanıtı) ve `son_konum_<sefer_id>` (o sefer için en son alınan `gemi-konum-guncelleme` payload'ı). Fetch/socket başarılı olduğunda cache güncellenir; başarısız olduğunda veya sefer yeni seçildiğinde cache'ten okunur.

**Tech Stack:** React Native `useState`, `@react-native-async-storage/async-storage` (zaten bağımlılık olarak mevcut, yeni paket eklenmiyor).

## Global Constraints

- Otomatik test altyapısı yok — doğrulama Metro bundler sağlık kontrolüyle yapılır (Faz 6/Alt-proje 1'de kullanılan yöntem).
- `seciliSeferId`'nin kalıcı hatırlanması kapsam dışı (tasarımda belirtildi).
- Proje Türkçe isimlendirme kullanıyor.

---

### Task 1: Aktif sefer listesi ve son konum cache'leme

**Files:**
- Modify: `ido-navigasyon-mobil-v3/App.js`

**Interfaces:**
- Yok (tek dosyalık, dışarıdan tüketilen yeni bir arayüz üretmiyor).

- [ ] **Step 1: Uyarı/son-bilinen-konum state'lerini ekle**

`App.js:63` (`const [seferlerYukleniyor, setSeferlerYukleniyor] = useState(true);` satırının hemen altına) ekle:
```js
  const [listeUyarisi, setListeUyarisi] = useState(null);
  const [sonBilinenKonumMu, setSonBilinenKonumMu] = useState(false);
```

- [ ] **Step 2: `aktifSeferListesiniYenile`'i cache'li hale getir**

`App.js:89-94`:
```js
  function aktifSeferListesiniYenile() {
    return fetch(SUNUCU_ADRESI + '/seferler/aktif')
      .then((yanit) => yanit.json())
      .then((veri) => setAktifSeferler(veri))
      .catch(() => setAktifSeferler([]));
  }
```
şu şekilde değiştir:
```js
  function aktifSeferListesiniYenile() {
    return fetch(SUNUCU_ADRESI + '/seferler/aktif')
      .then((yanit) => yanit.json())
      .then((veri) => {
        setAktifSeferler(veri);
        setListeUyarisi(null);
        AsyncStorage.setItem('son_aktif_seferler', JSON.stringify(veri));
      })
      .catch(() => {
        return AsyncStorage.getItem('son_aktif_seferler').then((kayitli) => {
          if (kayitli) {
            setAktifSeferler(JSON.parse(kayitli));
            setListeUyarisi('Baglanti kurulamadi, en son bilinen liste gosteriliyor.');
          } else {
            setAktifSeferler([]);
            setListeUyarisi('Baglantiya ulasilamadi, lutfen tekrar deneyin.');
          }
        });
      });
  }
```

- [ ] **Step 3: Sefer seçildiğinde son bilinen konumu önceden yükle**

`App.js:145-146`:
```js
  useEffect(() => {
    if (!seciliSeferId) return;
```
şu şekilde değiştir (aradaki satırı ekleyerek):
```js
  useEffect(() => {
    if (!seciliSeferId) return;

    AsyncStorage.getItem('son_konum_' + seciliSeferId).then((kayitli) => {
      if (!kayitli) return;
      const veri = JSON.parse(kayitli);
      setKonum(veri);
      setSuankiHedef(veri.suanki_hedef || '');
      setSonrakiDuraklar(veri.sonraki_duraklar || []);
      setIlerlemeYuzdesi(veri.ilerleme_yuzdesi || 0);
      setToplamKalanDakika(veri.toplam_kalan_dakika);
      setHedefeKalanDakika(veri.hedefe_kalan_dakika);
      setSonBilinenKonumMu(true);
    });
```

- [ ] **Step 4: Canlı konum geldiğinde cache'e yaz ve "son bilinen" bayrağını kaldır**

`App.js:190-196` (`gemi-konum-guncelleme` handler'ının başı):
```js
    soket.on('gemi-konum-guncelleme', (veri) => {
      setKonum(veri);
      setSuankiHedef(veri.suanki_hedef || '');
      setSonrakiDuraklar(veri.sonraki_duraklar || []);
      setIlerlemeYuzdesi(veri.ilerleme_yuzdesi || 0);
      setToplamKalanDakika(veri.toplam_kalan_dakika);
      setHedefeKalanDakika(veri.hedefe_kalan_dakika);
```
şu şekilde değiştir (iki satır eklenerek):
```js
    soket.on('gemi-konum-guncelleme', (veri) => {
      setKonum(veri);
      setSuankiHedef(veri.suanki_hedef || '');
      setSonrakiDuraklar(veri.sonraki_duraklar || []);
      setIlerlemeYuzdesi(veri.ilerleme_yuzdesi || 0);
      setToplamKalanDakika(veri.toplam_kalan_dakika);
      setHedefeKalanDakika(veri.hedefe_kalan_dakika);
      setSonBilinenKonumMu(false);
      AsyncStorage.setItem('son_konum_' + seciliSeferId, JSON.stringify(veri));
```

- [ ] **Step 5: Sefer-seçim ekranında uyarıyı göster**

`App.js:381-382` (satır numaraları Step 1-4'teki eklerden dolayı ~4 satır kaymış olabilir, `Hangi gemiyi takip ediyorsun?` başlığından hemen sonraki blok):
```jsx
          {aktifSeferler.length === 0 ? (
            <Text style={{ color: '#CDE3F0', fontSize: 15 }}>Su an aktif bir sefer yok.</Text>
          ) : (
```
şu şekilde değiştir:
```jsx
          {listeUyarisi && (
            <Text style={{ color: '#F2B705', fontSize: 13, marginBottom: 12 }}>{listeUyarisi}</Text>
          )}
          {aktifSeferler.length === 0 ? (
            <Text style={{ color: '#CDE3F0', fontSize: 15 }}>Su an aktif bir sefer yok.</Text>
          ) : (
```

- [ ] **Step 6: Harita/ilerleme alanında "son bilinen konum" notu göster**

`App.js:428-430` (`ilerlemeYazi` `Text` bloğunun hemen sonrası, `</Text>` kapanışından sonra) — sefer takip ekranındaki ilerleme çubuğunun bulunduğu `View` içine ekle:
```jsx
        <Text style={styles.ilerlemeYazi}>
          Yalova %{ilerlemeYuzdesi.toFixed(0)} Istanbul
          {toplamKalanDakika !== null ? ' • Tahmini varis: ' + Math.ceil(toplamKalanDakika) + ' dk' : ''}
        </Text>
```
şu şekilde değiştir (yeni bir `Text` ekleyerek):
```jsx
        <Text style={styles.ilerlemeYazi}>
          Yalova %{ilerlemeYuzdesi.toFixed(0)} Istanbul
          {toplamKalanDakika !== null ? ' • Tahmini varis: ' + Math.ceil(toplamKalanDakika) + ' dk' : ''}
        </Text>
        {sonBilinenKonumMu && (
          <Text style={{ color: '#F2B705', fontSize: 11, marginTop: 2 }}>Son bilinen konum gosteriliyor</Text>
        )}
```

- [ ] **Step 7: Metro bundler sağlık kontrolü**

`ido-navigasyon-backend` kökünde backend'i arka planda başlat (zaten çalışıyorsa atla, `netstat -ano | grep :3000` ile kontrol et):
```bash
node server.js
```

`ido-navigasyon-mobil-v3` klasöründe Expo'yu arka planda başlat:
```bash
npx expo start
```

Metro'nun `http://localhost:8081` üzerinde dinlemeye başladığını `netstat -ano | grep :8081` ile doğrula, sonra bundle'ı zorla:
```bash
curl -s -o /dev/null -w "HTTP durum: %{http_code}\n" "http://localhost:8081/index.bundle?platform=android&dev=true" --max-time 90
```

Expected: `HTTP durum: 200`, arka plan log dosyasında `Bundled ... index.js (N modules)` satırı, hata/uyarı yok.

Ardından hem backend hem Expo süreçlerini durdur (arkanda çalışan bir şey bırakma; `TaskStop` ile durdurduktan sonra `netstat -ano | grep :8081` ile portun gerçekten boşaldığını doğrula — bazen `npx` alt süreci `taskkill //F //PID <pid>` ile ayrıca sonlandırmak gerekebilir, Faz 6/Alt-proje 1'de bu yaşandı).

- [ ] **Step 8: Commit**

```bash
git add ido-navigasyon-mobil-v3/App.js
git commit -m "feat: aktif sefer listesi ve son bilinen konumu offline icin cache'le"
```

- [ ] **Step 9: Gerçek cihaz doğrulaması için not düş**

Raporda açıkça belirt: uçak modu açıp/kapatarak davranışın (liste uyarısı, son bilinen konum notu) gerçek bir cihazda görsel doğrulaması bu plan kapsamında yapılmadı — kullanıcının uygun olduğunda teyit edeceği ayrı bir adım.
