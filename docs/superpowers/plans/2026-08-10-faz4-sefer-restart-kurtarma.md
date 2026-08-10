# Faz 4 / Alt-proje 1 — Sefer Restart Kurtarma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend her yeniden başladığında, DB'de `bitis_zamani IS NULL` kalmış (ama bellekteki `aktifSeferler`'den kaybolmuş) seferleri otomatik kapatarak gemilerin kalıcı kilitlenmesini önlemek; crew app'in bu senaryoda gösterdiği sefer listesini de tazeleyerek aynı hatanın tekrar tekrar alınmasını engellemek.

**Architecture:** `seferRepo.js`'e DB'deki tüm yarım-bırakılmış seferleri kapatan tek bir fonksiyon eklenir. `server.js`, `sunucu.listen()`'dan önce bu fonksiyonu çağırıp sonucu loglar; DB erişilemezse fail-fast ile çıkar. `ido-navigasyon-personel/App.js`'te sefer listesi çekme mantığı tek bir fonksiyona çıkarılıp, listenin bayatlayabileceği üç noktada (giriş, sefer-sec başarısızlığı, sefer-bitti) tekrar çağrılır.

**Tech Stack:** Node.js/Express + Socket.io + `pg` (CommonJS) backend; Vitest + `vi.fn()` mock pool testleri; Expo/React Native (SDK 54) crew app (otomatik test altyapısı yok, manuel doğrulama).

## Global Constraints

- Proje Türkçe isimlendirme kullanıyor — yeni fonksiyon/değişken adları mevcut kod tabanıyla (örn. `seferBitir`, `seferlerAktifListele`) tutarlı Türkçe olmalı.
- DB hatalarında fail-fast: Faz 1'deki `JWT_GIZLI_ANAHTARI` fail-fast prensibiyle tutarlı olarak, başlangıç kurtarma sorgusu hata verirse sunucu `process.exit(1)` ile kapanmalı, yarım-doğru durumda ayağa kalkmamalı.
- Test ortamı etkilenmemeli: `require.main === module` koruması sayesinde testler `sunucu.listen()`'ı hiç tetiklemiyor; yeni kurtarma adımı da aynı korumanın içinde kalmalı.
- Mevcut testler (`npm test`) her task sonunda 113/113 (+ yeni eklenenler) yeşil kalmalı.

---

### Task 1: `seferRepo.js` — `yariBirakilmisSeferleriKapat`

**Files:**
- Modify: `seferRepo.js`
- Test: `seferRepo.test.js`

**Interfaces:**
- Produces: `yariBirakilmisSeferleriKapat(havuz)` — `async`, `havuz.query(sql)` çağırır (parametresiz), `Promise<Array<{ id: number, gemi_id: number }>>` döner (kapatılan seferlerin id ve gemi_id'leri; hiç yoksa boş dizi).

- [ ] **Step 1: Başarısız testi yaz**

`seferRepo.test.js` dosyasının sonuna (`describe('seferlerAktifListele', ...)` bloğundan sonra) ekle:

```js
describe('yariBirakilmisSeferleriKapat', () => {
    it('bitis_zamani NULL olan seferleri kapatir, kapatilan id ve gemi_id listesini doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({
                rows: [
                    { id: 5, gemi_id: 2 },
                    { id: 7, gemi_id: 3 }
                ]
            })
        };
        const sonuc = await yariBirakilmisSeferleriKapat(sahteHavuz);

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'UPDATE seferler SET bitis_zamani = now() WHERE bitis_zamani IS NULL RETURNING id, gemi_id'
        );
        expect(sonuc).toEqual([
            { id: 5, gemi_id: 2 },
            { id: 7, gemi_id: 3 }
        ]);
    });

    it('kapatilacak sefer yoksa bos dizi doner', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        const sonuc = await yariBirakilmisSeferleriKapat(sahteHavuz);

        expect(sonuc).toEqual([]);
    });
});
```

Dosyanın en üstündeki import satırını güncelle:

```js
const { seferOlustur, seferBitir, seferlerAktifListele, yariBirakilmisSeferleriKapat } = require('./seferRepo.js');
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Run: `npx vitest run seferRepo.test.js`
Expected: FAIL — `yariBirakilmisSeferleriKapat is not a function` (veya `undefined`).

- [ ] **Step 3: Minimal implementasyonu yaz**

`seferRepo.js`'e, `seferlerAktifListele` fonksiyonundan sonra, `module.exports` satırından önce ekle:

```js
async function yariBirakilmisSeferleriKapat(havuz) {
    const sonuc = await havuz.query(
        'UPDATE seferler SET bitis_zamani = now() WHERE bitis_zamani IS NULL RETURNING id, gemi_id'
    );
    return sonuc.rows;
}
```

`module.exports` satırını güncelle:

```js
module.exports = { seferOlustur, seferBitir, seferlerAktifListele, yariBirakilmisSeferleriKapat };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Run: `npx vitest run seferRepo.test.js`
Expected: PASS — tüm testler (yeni 2 dahil) yeşil.

- [ ] **Step 5: Commit**

```bash
git add seferRepo.js seferRepo.test.js
git commit -m "feat: yari birakilmis seferleri kapatan repo fonksiyonu ekle"
```

---

### Task 2: `server.js` — Başlangıçta otomatik kurtarma

**Files:**
- Modify: `server.js:15` (import satırı), `server.js:529-535` (başlangıç bloğu)

**Interfaces:**
- Consumes: `yariBirakilmisSeferleriKapat(havuz)` (Task 1'den) — `Promise<Array<{ id: number, gemi_id: number }>>` döner.

- [ ] **Step 1: Import satırını güncelle**

`server.js:15`:

```js
const { seferOlustur, seferBitir, seferlerAktifListele } = require('./seferRepo.js');
```

şu şekilde değiştir:

```js
const { seferOlustur, seferBitir, seferlerAktifListele, yariBirakilmisSeferleriKapat } = require('./seferRepo.js');
```

- [ ] **Step 2: Başlangıç bloğunu güncelle**

`server.js:529-535`:

```js
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    sunucu.listen(PORT, () => {
        console.log(`Sunucu calisiyor: http://localhost:${PORT}`);
    });
}
```

şu şekilde değiştir:

```js
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    (async () => {
        // Sunucu yeniden baslarsa aktifSeferler (bellek-ici) bosalir ama DB'deki
        // bitis_zamani IS NULL kayitlar oyle kalir; bu da o geminin partial unique
        // index yuzunden yeni sefer baslatamamasina (sessiz kilitlenme) yol acar.
        // Hicbir istemci baglanamadan once bu kayitlari kapatip gemiyi serbest birakiyoruz.
        const kapatilanSeferler = await yariBirakilmisSeferleriKapat(havuz);
        if (kapatilanSeferler.length > 0) {
            console.log(
                'Baslangicta yari birakilmis sefer(ler) kapatildi:',
                kapatilanSeferler.map((s) => `sefer ${s.id} (gemi ${s.gemi_id})`).join(', ')
            );
        }
        sunucu.listen(PORT, () => {
            console.log(`Sunucu calisiyor: http://localhost:${PORT}`);
        });
    })().catch((hata) => {
        console.error('Baslangic kurtarma hatasi, sunucu baslatilamadi:', hata.message);
        process.exit(1);
    });
}
```

- [ ] **Step 3: Mevcut test paketinin bozulmadığını doğrula**

Run: `npm test`
Expected: PASS — 113/113 (+ Task 1'in yeni 2 testi) yeşil. (`require.main === module` koruması sayesinde bu blok testlerde hiç çalışmaz, dolayısıyla mevcut testler etkilenmemeli.)

- [ ] **Step 4: Gerçek veritabanına karşı manuel doğrulama**

Bu adım gerçek bir Postgres bağlantısı (`.env`'deki `DATABASE_URL`) gerektirir. Önce kasıtlı olarak "yarım bırakılmış" bir sefer oluştur:

```bash
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const gemi = await p.query(\"SELECT id FROM gemiler WHERE ad = 'Yalova Feribotu 1'\");
  const hat = await p.query(\"SELECT id FROM hatlar WHERE ad = 'Yalova - Istanbul'\");
  const personel = await p.query('SELECT id FROM personel_hesaplari LIMIT 1');
  const sefer = await p.query(
    'INSERT INTO seferler (gemi_id, hat_id, baslatan_personel_id) VALUES (\$1, \$2, \$3) RETURNING id',
    [gemi.rows[0].id, hat.rows[0].id, personel.rows[0].id]
  );
  console.log('Test seferi olusturuldu, id:', sefer.rows[0].id, '(bitis_zamani NULL)');
  await p.end();
})();
"
```

Sonra sunucuyu başlat:

```bash
node server.js
```

Beklenen: konsolda `Baslangicta yari birakilmis sefer(ler) kapatildi: sefer <id> (gemi <gemi_id>)` satırı, ardından `Sunucu calisiyor: http://localhost:3000`.

Doğrula (sunucuyu Ctrl+C ile durdurup):

```bash
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
p.query('SELECT id, bitis_zamani FROM seferler ORDER BY id DESC LIMIT 1')
  .then(r => { console.log(r.rows[0]); return p.end(); });
"
```

Beklenen: `bitis_zamani` artık `null` değil, bir zaman damgası.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "fix: baslangicta yari birakilmis seferleri otomatik kapat, gemi kilidini onle"
```

---

### Task 3: `ido-navigasyon-personel/App.js` — Sefer listesini tazeleme

**Files:**
- Modify: `ido-navigasyon-personel/App.js:89-110` (useEffect), `ido-navigasyon-personel/App.js:120-129` (sefer-sec ack), `ido-navigasyon-personel/App.js:146-150` (sefer-bitti)

**Interfaces:**
- Produces: `aktifSeferListesiniYenile()` — parametresiz, component içinde tanımlı, `/seferler/aktif` + `/gemiler` + `/hatlar`'ı çekip `setAktifSeferler`/`setGemiler`/`setHatlar` state'lerini günceller, bir `Promise<void>` döner (başarı/hata fark etmeksizin resolve olur).

- [ ] **Step 1: Fetch mantığını ayrı fonksiyona çıkar**

`App.js:89-110`:

```js
  useEffect(() => {
    if (!erisimTokeni) return;

    setEkran('yukleniyor');
    Promise.all([
      fetch(SUNUCU_ADRESI + '/seferler/aktif').then((r) => r.json()),
      fetch(SUNUCU_ADRESI + '/gemiler').then((r) => r.json()),
      fetch(SUNUCU_ADRESI + '/hatlar').then((r) => r.json()),
    ])
      .then(([seferler, gemiListesi, hatListesi]) => {
        setAktifSeferler(seferler);
        setGemiler(gemiListesi);
        setHatlar(hatListesi);
        setEkran('sefer-sec');
      })
      .catch(() => {
        setAktifSeferler([]);
        setGemiler([]);
        setHatlar([]);
        setEkran('sefer-sec');
      });
  }, [erisimTokeni]);
```

şu şekilde değiştir:

```js
  function aktifSeferListesiniYenile() {
    return Promise.all([
      fetch(SUNUCU_ADRESI + '/seferler/aktif').then((r) => r.json()),
      fetch(SUNUCU_ADRESI + '/gemiler').then((r) => r.json()),
      fetch(SUNUCU_ADRESI + '/hatlar').then((r) => r.json()),
    ])
      .then(([seferler, gemiListesi, hatListesi]) => {
        setAktifSeferler(seferler);
        setGemiler(gemiListesi);
        setHatlar(hatListesi);
      })
      .catch(() => {
        setAktifSeferler([]);
        setGemiler([]);
        setHatlar([]);
      });
  }

  useEffect(() => {
    if (!erisimTokeni) return;

    setEkran('yukleniyor');
    aktifSeferListesiniYenile().then(() => setEkran('sefer-sec'));
  }, [erisimTokeni]);
```

- [ ] **Step 2: `sefer-sec` başarısız ack'inde listeyi tazele**

`App.js:120-129`:

```js
      soket.emit('sefer-sec', { sefer_id: seciliSeferId }, (yanit) => {
        if (!yanit || !yanit.tamam) {
          Alert.alert('Hata', 'Sefer secilemedi. Lutfen tekrar deneyin.');
          setSeciliSeferId(null);
          setEkran('sefer-sec');
          return;
        }
        setAcilDurumAktif(!!yanit.acil_durum_aktif);
        setYolcuSayisi(yanit.yolcu_sayisi || 0);
      });
```

şu şekilde değiştir:

```js
      soket.emit('sefer-sec', { sefer_id: seciliSeferId }, (yanit) => {
        if (!yanit || !yanit.tamam) {
          Alert.alert('Hata', 'Sefer secilemedi. Lutfen tekrar deneyin.');
          setSeciliSeferId(null);
          setEkran('sefer-sec');
          aktifSeferListesiniYenile();
          return;
        }
        setAcilDurumAktif(!!yanit.acil_durum_aktif);
        setYolcuSayisi(yanit.yolcu_sayisi || 0);
      });
```

- [ ] **Step 3: `sefer-bitti` event'inde listeyi tazele**

`App.js:146-150`:

```js
    soket.on('sefer-bitti', () => {
      Alert.alert('Sefer Sona Erdi', 'Bu sefer baska bir kullanici tarafindan bitirildi.');
      setSeciliSeferId(null);
      setEkran('sefer-sec');
    });
```

şu şekilde değiştir:

```js
    soket.on('sefer-bitti', () => {
      Alert.alert('Sefer Sona Erdi', 'Bu sefer baska bir kullanici tarafindan bitirildi.');
      setSeciliSeferId(null);
      setEkran('sefer-sec');
      aktifSeferListesiniYenile();
    });
```

- [ ] **Step 4: Manuel doğrulama (gerçek backend + gerçek cihaz/Expo Go)**

Bu app'in otomatik test altyapısı yok (`ido-navigasyon-personel` içinde `.test.js` dosyası bulunmuyor); doğrulama manuel yapılır.

1. Backend'i çalıştır (`node server.js`), Expo'yu başlat (`npx expo start`), Expo Go ile telefondan bağlan, giriş yap.
2. Bir sefer başlat/seç, `panel` ekranına geç.
3. Başka bir terminalde, aynı seferi backend üzerinden REST ile bitir (kaptanın kendisi değil, "başka biri bitirdi" senaryosunu simüle eder):
   ```bash
   node -e "
   require('dotenv').config();
   (async () => {
     const girisRes = await fetch('http://localhost:3000/login', {
       method: 'POST', headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ kullanici_adi: 'kaptan1', sifre: 'sifre123' })
     });
     const { erisimTokeni } = await girisRes.json();
     const aktifRes = await fetch('http://localhost:3000/seferler/aktif');
     const [sefer] = await aktifRes.json();
     const bitirRes = await fetch('http://localhost:3000/sefer/bitir', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + erisimTokeni },
       body: JSON.stringify({ sefer_id: sefer.sefer_id })
     });
     console.log(await bitirRes.json());
   })();
   "
   ```
4. Telefonda: "Sefer Sona Erdi" uyarısının çıktığını, `sefer-sec` ekranına dönüldüğünü ve **artık bitmiş seferin listede görünmediğini** doğrula (eskiden bu son kısım için ekstra bir "yenile" işlemi ya da uygulamayı yeniden açmak gerekirdi).

- [ ] **Step 5: Commit**

```bash
git add ido-navigasyon-personel/App.js
git commit -m "fix: sefer listesini sefer-sec basarisizliginda ve sefer-bittide tazele"
```

---

## Final Review

Task 3 tamamlandıktan sonra: `npm test` ile tam paket çalıştırılır (113 + Task 1'in 2 yeni testi = 115 yeşil beklenir), ardından üç task'ın birlikte tutarlı çalıştığı (özellikle Task 2 + Task 3'ün aynı senaryoyu — restart sonrası kilitlenme — sunucu ve istemci tarafından tamamladığı) whole-branch review ile teyit edilir.
