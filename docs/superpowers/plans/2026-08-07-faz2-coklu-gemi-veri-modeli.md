# Faz 2 — Çoklu Gemi/Hat Veri Modeli Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ido-navigasyon-backend`'i tek-gemi/tek-hat varsayımından kurtarıp küçük ölçekli bir pilot (2-5 gemi/hat) için çoklu gemi, çoklu hat ve aynı anda birden fazla aktif "sefer" destekleyecek şekilde yeniden kurmak; personel ve yolcu app'lerine bu modele uygun minimal seçim ekranları eklemek.

**Architecture:** Kalıcı veri (gemiler, hatlar, rota noktaları, sefer kayıtları) Postgres'te; her aktif seferin canlı simülasyon state'i (konum, hedef index) sunucu belleğinde `Map<seferId, state>` olarak tutulur (sunucu restart'ında kaybolması kabul edilebilir — kalıcılık Faz 4'ün kapsamı). Socket.io bağlantıları `sefer:<id>` odalarına katılır; tüm canlı yayınlar (`gemi-konum-guncelleme`, `acil-durum-uyarisi`, `acil-durum-bitti`, `yolcu-sayisi-yayin`, `varis-bildirimi`) artık `io.emit` yerine `io.to(oda).emit` ile sadece ilgili seferin odasına gider. `sefer-sec` event'i (oda katılımı) kimlik doğrulaması gerektirmez — yolcu app anonim bağlanır (bkz. commit `b5b8ab1`); yazma event'leri (`acil-durum-baslat/bitir`, `yolcu-sayisi-guncelle`) hâlâ kimlik doğrulaması ister ve artık hangi seferi etkileyeceklerini `soket.data.aktifSeferId`'den (önceden yapılmış `sefer-sec` çağrısından) türetir — client artık `gemi_adi` göndermez.

**Tech Stack:** Mevcut Express + Socket.io + `pg` + Vitest + Supertest + `socket.io-client` test altyapısı; yeni bağımlılık yok.

## Global Constraints

- Backend üretim kodu CommonJS (`require`/`module.exports`) kalacak.
- Değişken/fonksiyon isimlendirmesi Türkçe kalacak (`seferOlustur`, `aktifSeferler`, `rotaNoktalariGetir` gibi).
- Test dosyaları `import { describe, it, expect, vi } from 'vitest'` + `require(...)` karışık deseni izleyecek (mevcut `server.test.js`/`personelRepo.test.js` konvansiyonu).
- Repoda migration aracı yok; DB şema değişiklikleri ve başlangıç verisi elle (`psql` ile) uygulanan, checked-in SQL dosyalarıyla yapılır — bu konvansiyon korunur, yeni bir migration aracı eklenmez.
- Bu faz küçük ölçekli bir pilot (2-5 gemi/hat) hedefler: Redis/çoklu-sunucu-instance, sunucu restart'ında canlı konumun kalıcılığı bu fazın **kapsamı dışıdır** (Faz 4). Gerçek GPS entegrasyonu da kapsam dışıdır (Faz 3) — sahte GPS simülasyonu sefer-bazlı hale gelir ama matematiksel simülasyon olmaya devam eder.
- Bir gemi aynı anda yalnızca bir aktif seferde olabilir (DB'de partial unique index ile zorlanır).
- Bir hat tek yönlü, sabit sıralı bir durak dizisidir (`rota_noktalari.sira`, index 0 = kalkış noktası). Dönüş yolculuğu ayrı bir hat kaydı olarak modellenir — yön tersine çevirme mantığı eklenmez.
- `ilgi_noktalari.hat_id` NULL ise nokta tüm hatlarda görünür (genel bilgi noktası); dolu ise sadece o hatta.
- Acil durum ve yolcu sayısı güncellemesi dahil, tüm canlı yayınlar artık sadece ilgili seferin odasına gider — filo geneline giden bir yayın kalmaz.
- Mobil app değişikliklerinde `ido-navigasyon-personel` ve `ido-navigasyon-mobil-v3` dizinlerindeki `AGENTS.md` dosyaları "Expo HAS CHANGED — https://docs.expo.dev/versions/v54.0.0/ adresindeki güncel dokümantasyonu kod yazmadan önce oku" talimatını veriyor; bu dizinlerde çalışırken bu talimat geçerlidir.
- Mobil app'lerde otomatik test altyapısı yok (Faz 1'de belirlenmiş proje kararı); mobil app görevleri manuel doğrulama ile tamamlanır.

---

### Task 1: DB şeması ve başlangıç verisi

**Files:**
- Create: `db/gemiler_hatlar_seferler.sql`
- Create: `db/gemiler_hatlar_seferler_seed.sql`

**Interfaces:**
- Produces: `gemiler`, `hatlar`, `rota_noktalari`, `seferler` tabloları; `ilgi_noktalari.hat_id` kolonu — Task 2, 3, 4, 5, 6 tarafından kullanılacak.

- [ ] **Step 1: Şema dosyasını yaz**

`db/gemiler_hatlar_seferler.sql`:
```sql
CREATE TABLE IF NOT EXISTS gemiler (
    id SERIAL PRIMARY KEY,
    ad TEXT NOT NULL UNIQUE,
    olusturulma_zamani TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hatlar (
    id SERIAL PRIMARY KEY,
    ad TEXT NOT NULL UNIQUE,
    olusturulma_zamani TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rota_noktalari (
    id SERIAL PRIMARY KEY,
    hat_id INTEGER NOT NULL REFERENCES hatlar(id),
    sira INTEGER NOT NULL,
    ad TEXT NOT NULL,
    enlem DOUBLE PRECISION NOT NULL,
    boylam DOUBLE PRECISION NOT NULL,
    UNIQUE (hat_id, sira)
);

CREATE TABLE IF NOT EXISTS seferler (
    id SERIAL PRIMARY KEY,
    gemi_id INTEGER NOT NULL REFERENCES gemiler(id),
    hat_id INTEGER NOT NULL REFERENCES hatlar(id),
    baslatan_personel_id INTEGER NOT NULL REFERENCES personel_hesaplari(id),
    baslangic_zamani TIMESTAMPTZ NOT NULL DEFAULT now(),
    bitis_zamani TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS seferler_aktif_gemi_tekil
    ON seferler (gemi_id) WHERE bitis_zamani IS NULL;

ALTER TABLE ilgi_noktalari ADD COLUMN IF NOT EXISTS hat_id INTEGER REFERENCES hatlar(id);
```

- [ ] **Step 2: Başlangıç verisi (seed) dosyasını yaz**

`db/gemiler_hatlar_seferler_seed.sql`:
```sql
INSERT INTO gemiler (ad) VALUES ('Yalova Feribotu 1');

INSERT INTO hatlar (ad) VALUES ('Yalova - Istanbul');

INSERT INTO rota_noktalari (hat_id, sira, ad, enlem, boylam)
SELECT id, 0, 'Yalova', 40.6500, 29.2600 FROM hatlar WHERE ad = 'Yalova - Istanbul';
INSERT INTO rota_noktalari (hat_id, sira, ad, enlem, boylam)
SELECT id, 1, 'Bozuk Gemi Batigi', 40.7200, 29.1600 FROM hatlar WHERE ad = 'Yalova - Istanbul';
INSERT INTO rota_noktalari (hat_id, sira, ad, enlem, boylam)
SELECT id, 2, 'Heybeliada', 40.8756, 29.0917 FROM hatlar WHERE ad = 'Yalova - Istanbul';
INSERT INTO rota_noktalari (hat_id, sira, ad, enlem, boylam)
SELECT id, 3, 'Istanbul', 41.0100, 29.0200 FROM hatlar WHERE ad = 'Yalova - Istanbul';

UPDATE ilgi_noktalari SET hat_id = (SELECT id FROM hatlar WHERE ad = 'Yalova - Istanbul')
WHERE hat_id IS NULL;
```

Bu, bugünkü hardcoded rotanın (`Bozuk Gemi Batigi` → `Heybeliada` → `Istanbul`, kalkış `Yalova`'dan) DB karşılığıdır; mevcut tüm `ilgi_noktalari` satırları bu tek hatta bağlanır (backfill).

- [ ] **Step 3: Şemayı ve seed'i gerçek veritabanına elle uygula**

Çalıştır (proje kökünde `.env`'deki `DATABASE_URL` ile):
```bash
psql "$DATABASE_URL" -f db/gemiler_hatlar_seferler.sql
psql "$DATABASE_URL" -f db/gemiler_hatlar_seferler_seed.sql
```

Bu adım gerçek bir Postgres bağlantısı gerektirir ve otomatik doğrulanamaz — insan operatör tarafından manuel çalıştırılmalı. `personel_hesaplari` tablosu da aynı şekilde elle oluşturulmuştu, bu konvansiyon korunuyor.

- [ ] **Step 4: Commit**

```bash
git add db/gemiler_hatlar_seferler.sql db/gemiler_hatlar_seferler_seed.sql
git commit -m "feat: gemiler/hatlar/rota_noktalari/seferler DB semasi ve baslangic verisi ekle"
```

---

### Task 2: Gemi ve hat repo katmanları

**Files:**
- Create: `gemilerRepo.js`
- Test: `gemilerRepo.test.js`
- Create: `hatlarRepo.js`
- Test: `hatlarRepo.test.js`

**Interfaces:**
- Produces: `tumGemileriListele(havuz) -> Promise<[{id, ad}]>`, `gemiGetir(havuz, id) -> Promise<{id, ad}|null>` — Task 5 tarafından kullanılacak.
- Produces: `tumHatlariListele(havuz) -> Promise<[{id, ad}]>`, `rotaNoktalariGetir(havuz, hatId) -> Promise<[{ad, enlem, boylam}]>` (sira'ya göre sıralı) — Task 5 tarafından kullanılacak.

- [ ] **Step 1: Başarısız testleri yaz — gemilerRepo**

`gemilerRepo.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
const { tumGemileriListele, gemiGetir } = require('./gemilerRepo.js');

describe('tumGemileriListele', () => {
    it('dogru SQL ile sorgu calistirir, gemi listesini doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({ rows: [{ id: 1, ad: 'Yalova Feribotu 1' }] })
        };
        const sonuc = await tumGemileriListele(sahteHavuz);

        expect(sahteHavuz.query).toHaveBeenCalledWith('SELECT id, ad FROM gemiler ORDER BY ad');
        expect(sonuc).toEqual([{ id: 1, ad: 'Yalova Feribotu 1' }]);
    });
});

describe('gemiGetir', () => {
    it('dogru SQL ve parametre ile sorgu calistirir, bulunan satiri doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({ rows: [{ id: 1, ad: 'Yalova Feribotu 1' }] })
        };
        const sonuc = await gemiGetir(sahteHavuz, 1);

        expect(sahteHavuz.query).toHaveBeenCalledWith('SELECT id, ad FROM gemiler WHERE id = $1', [1]);
        expect(sonuc).toEqual({ id: 1, ad: 'Yalova Feribotu 1' });
    });

    it('gemi bulunamazsa null doner', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        const sonuc = await gemiGetir(sahteHavuz, 999);
        expect(sonuc).toBeNull();
    });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run gemilerRepo.test.js`
Beklenen: FAIL — `Cannot find module './gemilerRepo.js'`

- [ ] **Step 3: `gemilerRepo.js`'i yaz**

```js
async function tumGemileriListele(havuz) {
    const sonuc = await havuz.query('SELECT id, ad FROM gemiler ORDER BY ad');
    return sonuc.rows;
}

async function gemiGetir(havuz, id) {
    const sonuc = await havuz.query('SELECT id, ad FROM gemiler WHERE id = $1', [id]);
    return sonuc.rows[0] || null;
}

module.exports = { tumGemileriListele, gemiGetir };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run gemilerRepo.test.js`
Beklenen: PASS (3 test)

- [ ] **Step 5: Başarısız testleri yaz — hatlarRepo**

`hatlarRepo.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
const { tumHatlariListele, rotaNoktalariGetir } = require('./hatlarRepo.js');

describe('tumHatlariListele', () => {
    it('dogru SQL ile sorgu calistirir, hat listesini doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({ rows: [{ id: 1, ad: 'Yalova - Istanbul' }] })
        };
        const sonuc = await tumHatlariListele(sahteHavuz);

        expect(sahteHavuz.query).toHaveBeenCalledWith('SELECT id, ad FROM hatlar ORDER BY ad');
        expect(sonuc).toEqual([{ id: 1, ad: 'Yalova - Istanbul' }]);
    });
});

describe('rotaNoktalariGetir', () => {
    it('dogru SQL ve parametre ile hattin rota noktalarini sira ile doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({
                rows: [
                    { ad: 'Yalova', enlem: 40.65, boylam: 29.26 },
                    { ad: 'Istanbul', enlem: 41.01, boylam: 29.02 }
                ]
            })
        };
        const sonuc = await rotaNoktalariGetir(sahteHavuz, 1);

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'SELECT ad, enlem, boylam FROM rota_noktalari WHERE hat_id = $1 ORDER BY sira',
            [1]
        );
        expect(sonuc).toEqual([
            { ad: 'Yalova', enlem: 40.65, boylam: 29.26 },
            { ad: 'Istanbul', enlem: 41.01, boylam: 29.02 }
        ]);
    });

    it('hattin rota noktasi yoksa bos dizi doner', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        const sonuc = await rotaNoktalariGetir(sahteHavuz, 999);
        expect(sonuc).toEqual([]);
    });
});
```

- [ ] **Step 6: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run hatlarRepo.test.js`
Beklenen: FAIL — `Cannot find module './hatlarRepo.js'`

- [ ] **Step 7: `hatlarRepo.js`'i yaz**

```js
async function tumHatlariListele(havuz) {
    const sonuc = await havuz.query('SELECT id, ad FROM hatlar ORDER BY ad');
    return sonuc.rows;
}

async function rotaNoktalariGetir(havuz, hatId) {
    const sonuc = await havuz.query(
        'SELECT ad, enlem, boylam FROM rota_noktalari WHERE hat_id = $1 ORDER BY sira',
        [hatId]
    );
    return sonuc.rows;
}

module.exports = { tumHatlariListele, rotaNoktalariGetir };
```

- [ ] **Step 8: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run hatlarRepo.test.js`
Beklenen: PASS (3 test)

- [ ] **Step 9: Commit**

```bash
git add gemilerRepo.js gemilerRepo.test.js hatlarRepo.js hatlarRepo.test.js
git commit -m "feat: gemiler ve hatlar icin repo katmani ekle"
```

---

### Task 3: Sefer repo katmanı

**Files:**
- Create: `seferRepo.js`
- Test: `seferRepo.test.js`

**Interfaces:**
- Consumes: Yok (bağımsız katman).
- Produces: `seferOlustur(havuz, {gemiId, hatId, baslatanPersonelId}) -> Promise<{id, gemi_id, hat_id, baslangic_zamani}>`, `seferBitir(havuz, seferId) -> Promise<void>`, `seferlerAktifListele(havuz) -> Promise<[{sefer_id, gemi_adi, hat_adi, baslangic_zamani}]>` — Task 5 tarafından kullanılacak.

- [ ] **Step 1: Başarısız testleri yaz**

`seferRepo.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
const { seferOlustur, seferBitir, seferlerAktifListele } = require('./seferRepo.js');

describe('seferOlustur', () => {
    it('dogru SQL ve parametrelerle INSERT calistirir, olusan satiri doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({
                rows: [{ id: 42, gemi_id: 1, hat_id: 2, baslangic_zamani: '2026-08-07T10:00:00.000Z' }]
            })
        };
        const sonuc = await seferOlustur(sahteHavuz, { gemiId: 1, hatId: 2, baslatanPersonelId: 3 });

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'INSERT INTO seferler (gemi_id, hat_id, baslatan_personel_id) VALUES ($1, $2, $3) RETURNING id, gemi_id, hat_id, baslangic_zamani',
            [1, 2, 3]
        );
        expect(sonuc).toEqual({ id: 42, gemi_id: 1, hat_id: 2, baslangic_zamani: '2026-08-07T10:00:00.000Z' });
    });

    it('gemi zaten aktif seferdeyse havuzun firlattigi hatayi oldugu gibi yukari firlatir', async () => {
        const benzersizlikHatasi = Object.assign(new Error('duplicate key value'), { code: '23505' });
        const sahteHavuz = { query: vi.fn().mockRejectedValue(benzersizlikHatasi) };

        await expect(seferOlustur(sahteHavuz, { gemiId: 1, hatId: 2, baslatanPersonelId: 3 })).rejects.toThrow('duplicate key value');
    });
});

describe('seferBitir', () => {
    it('dogru SQL ve parametre ile bitis_zamanini gunceller', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
        await seferBitir(sahteHavuz, 42);

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'UPDATE seferler SET bitis_zamani = now() WHERE id = $1',
            [42]
        );
    });
});

describe('seferlerAktifListele', () => {
    it('aktif seferleri gemi ve hat adlariyla birlikte doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({
                rows: [{ sefer_id: 42, gemi_adi: 'Yalova Feribotu 1', hat_adi: 'Yalova - Istanbul', baslangic_zamani: '2026-08-07T10:00:00.000Z' }]
            })
        };
        const sonuc = await seferlerAktifListele(sahteHavuz);

        expect(sahteHavuz.query).toHaveBeenCalledTimes(1);
        expect(sahteHavuz.query.mock.calls[0][0]).toMatch(/WHERE s\.bitis_zamani IS NULL/);
        expect(sonuc).toEqual([{ sefer_id: 42, gemi_adi: 'Yalova Feribotu 1', hat_adi: 'Yalova - Istanbul', baslangic_zamani: '2026-08-07T10:00:00.000Z' }]);
    });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run seferRepo.test.js`
Beklenen: FAIL — `Cannot find module './seferRepo.js'`

- [ ] **Step 3: `seferRepo.js`'i yaz**

```js
async function seferOlustur(havuz, { gemiId, hatId, baslatanPersonelId }) {
    const sonuc = await havuz.query(
        'INSERT INTO seferler (gemi_id, hat_id, baslatan_personel_id) VALUES ($1, $2, $3) RETURNING id, gemi_id, hat_id, baslangic_zamani',
        [gemiId, hatId, baslatanPersonelId]
    );
    return sonuc.rows[0];
}

async function seferBitir(havuz, seferId) {
    await havuz.query('UPDATE seferler SET bitis_zamani = now() WHERE id = $1', [seferId]);
}

async function seferlerAktifListele(havuz) {
    const sonuc = await havuz.query(
        `SELECT s.id AS sefer_id, g.ad AS gemi_adi, h.ad AS hat_adi, s.baslangic_zamani
         FROM seferler s
         JOIN gemiler g ON g.id = s.gemi_id
         JOIN hatlar h ON h.id = s.hat_id
         WHERE s.bitis_zamani IS NULL
         ORDER BY s.baslangic_zamani`
    );
    return sonuc.rows;
}

module.exports = { seferOlustur, seferBitir, seferlerAktifListele };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run seferRepo.test.js`
Beklenen: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add seferRepo.js seferRepo.test.js
git commit -m "feat: sefer repo katmani ekle (olustur/bitir/aktif listele)"
```

---

### Task 4: Sunucu state mimarisi — sefer-bazlı bellek-içi state

**Files:**
- Modify: `server.js`
- Modify: `server.test.js`

**Interfaces:**
- Consumes: `ikiNoktaArasiMesafe`, `geofenceKontrolEt` (mevcut `geofencing.js`).
- Produces: `aktifSeferler` (module-level `Map<number, SeferState>`), `seferStateOlustur(rotaNoktalariSatirlari) -> SeferState`, `konumKontrolVeYayinla() -> Promise<void>` (artık çoklu sefer üzerinde döner) — Task 5, 6, 7 tarafından kullanılacak. `SeferState` şekli: `{ konum: {enlem, boylam}, hedefIndex, varisBildirimiGonderildi, rotaNoktalari: [{enlem, boylam}], rotaAdlari: [string], legMesafeleri: [number], toplamRotaMesafesi: number }` (Task 5, 6, 7 bu nesneye `gemiId`, `hatId`, `gemiAdi` alanlarını ekleyerek genişletir).

- [ ] **Step 1: `server.test.js`'in üst kısmına yeni import'ları ekle**

`server.test.js`'in en üstündeki require bloğuna ekle:
```js
const { aktifSeferler, seferStateOlustur, konumKontrolVeYayinla } = require('./server.js');
```

- [ ] **Step 2: Başarısız testi yaz**

`server.test.js`'e, `describe('JWT_GIZLI_ANAHTARI dogrulamasi', ...)` bloğundan sonra, `describe('POST /login', ...)` bloğundan önce ekle:
```js
describe('seferStateOlustur ve konumKontrolVeYayinla - coklu sefer bagimsizligi', () => {
    afterEach(() => {
        aktifSeferler.clear();
        vi.restoreAllMocks();
    });

    it('seferStateOlustur ilk rota noktasini baslangic konumu, hedefIndex i 1 olarak ayarlar', () => {
        const state = seferStateOlustur([
            { ad: 'Baslangic', enlem: 40.0, boylam: 29.0 },
            { ad: 'Hedef', enlem: 41.0, boylam: 30.0 }
        ]);

        expect(state.konum).toEqual({ enlem: 40.0, boylam: 29.0 });
        expect(state.hedefIndex).toBe(1);
        expect(state.varisBildirimiGonderildi).toBe(false);
        expect(state.rotaAdlari).toEqual(['Baslangic', 'Hedef']);
        expect(state.legMesafeleri.length).toBe(2);
        expect(state.legMesafeleri[0]).toBe(0);
    });

    it('iki aktif sefer birbirinden bagimsiz ilerler', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValue({ rows: [] });

        const seferA = seferStateOlustur([
            { ad: 'A-Baslangic', enlem: 0, boylam: 0 },
            { ad: 'A-Hedef', enlem: 1, boylam: 0 }
        ]);
        const seferB = seferStateOlustur([
            { ad: 'B-Baslangic', enlem: 10, boylam: 10 },
            { ad: 'B-Hedef', enlem: 10, boylam: 11 }
        ]);
        aktifSeferler.set(1, { ...seferA, gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        aktifSeferler.set(2, { ...seferB, gemiId: 2, hatId: 2, gemiAdi: 'Gemi B' });

        const baslangicA = { ...aktifSeferler.get(1).konum };
        const baslangicB = { ...aktifSeferler.get(2).konum };

        await konumKontrolVeYayinla();

        expect(aktifSeferler.get(1).konum).not.toEqual(baslangicA);
        expect(aktifSeferler.get(2).konum).not.toEqual(baslangicB);
        // A sadece enlem ekseninde, B sadece boylam ekseninde ilerliyor olmali (birbirinden bagimsiz).
        expect(aktifSeferler.get(1).konum.boylam).toBeCloseTo(baslangicA.boylam, 5);
        expect(aktifSeferler.get(2).konum.enlem).toBeCloseTo(baslangicB.enlem, 5);
    });
});
```

- [ ] **Step 3: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run server.test.js -t "coklu sefer bagimsizligi"`
Beklenen: FAIL — `aktifSeferler`/`seferStateOlustur`/`konumKontrolVeYayinla` `server.js`'den export edilmiyor (`undefined is not a function` veya benzeri)

- [ ] **Step 4: `server.js`'de global state'i `aktifSeferler` Map'iyle değiştir**

`server.js`'deki şu bloğu (satır 35-62 civarı, `let gemiKonumu = {...}`'dan `let varisBildirimiGonderildi = false;`'e kadar):
```js
let gemiKonumu = {
    enlem: 40.6500,
    boylam: 29.2600
};

const baslangicKonumu = { enlem: gemiKonumu.enlem, boylam: gemiKonumu.boylam };

const rotaNoktalari = [
    { enlem: 40.7200, boylam: 29.1600 },
    { enlem: 40.8756, boylam: 29.0917 },
    { enlem: 41.0100, boylam: 29.0200 }
];

const rotaAdlari = ['Bozuk Gemi Batigi', 'Heybeliada', 'Istanbul'];

const legMesafeleri = [];
let oncekiNoktaGecici = baslangicKonumu;
for (const nokta of rotaNoktalari) {
    legMesafeleri.push(ikiNoktaArasiMesafe(oncekiNoktaGecici.enlem, oncekiNoktaGecici.boylam, nokta.enlem, nokta.boylam));
    oncekiNoktaGecici = nokta;
}
const toplamRotaMesafesi = legMesafeleri.reduce((a, b) => a + b, 0);

const ADIM_BUYUKLUGU = 0.002;
const HIZ_METRE_SANIYE = ADIM_BUYUKLUGU * 111320;

let suankiHedefIndex = 0;
let varisBildirimiGonderildi = false;
```

şununla değiştir:
```js
const aktifSeferler = new Map();

const ADIM_BUYUKLUGU = 0.002;
const HIZ_METRE_SANIYE = ADIM_BUYUKLUGU * 111320;

function seferStateOlustur(rotaNoktalariSatirlari) {
    const ilkNokta = rotaNoktalariSatirlari[0];
    const legMesafeleri = [];
    let oncekiNokta = ilkNokta;
    for (const nokta of rotaNoktalariSatirlari) {
        legMesafeleri.push(ikiNoktaArasiMesafe(oncekiNokta.enlem, oncekiNokta.boylam, nokta.enlem, nokta.boylam));
        oncekiNokta = nokta;
    }
    const toplamRotaMesafesi = legMesafeleri.reduce((a, b) => a + b, 0);

    return {
        konum: { enlem: ilkNokta.enlem, boylam: ilkNokta.boylam },
        hedefIndex: 1,
        varisBildirimiGonderildi: false,
        rotaNoktalari: rotaNoktalariSatirlari.map((n) => ({ enlem: n.enlem, boylam: n.boylam })),
        rotaAdlari: rotaNoktalariSatirlari.map((n) => n.ad),
        legMesafeleri,
        toplamRotaMesafesi
    };
}
```

Not: `rotaNoktalari.length === 1` (tek noktalı hat) bu fazda ele alınmıyor — seed verisi ve Task 5'in `rotaNoktalariGetir` sonucu her zaman en az 2 nokta içerir, bu YAGNI kapsamında bırakılmıştır.

- [ ] **Step 5: `sahteGpsGuncelle` ve `kalanToplamMesafeHesapla`'yı sefer parametreli hale getir**

`server.js`'deki `sahteGpsGuncelle` fonksiyonunu:
```js
function sahteGpsGuncelle() {
    const hedefNokta = rotaNoktalari[suankiHedefIndex];

    const enlemFark = hedefNokta.enlem - gemiKonumu.enlem;
    const boylamFark = hedefNokta.boylam - gemiKonumu.boylam;
    const kalanMesafeDerece = Math.sqrt(enlemFark * enlemFark + boylamFark * boylamFark);

    if (kalanMesafeDerece > ADIM_BUYUKLUGU) {
        gemiKonumu.enlem += (enlemFark / kalanMesafeDerece) * ADIM_BUYUKLUGU;
        gemiKonumu.boylam += (boylamFark / kalanMesafeDerece) * ADIM_BUYUKLUGU;
    } else {
        if (suankiHedefIndex < rotaNoktalari.length - 1) {
            suankiHedefIndex++;
            console.log('Yeni hedefe geciliyor:', rotaNoktalari[suankiHedefIndex]);
        } else if (!varisBildirimiGonderildi) {
            varisBildirimiGonderildi = true;
            io.emit('varis-bildirimi', {
                mesaj: 'Istanbul\'a hos geldiniz! Yolculugunuz tamamlandi.'
            });
            console.log('VARIS BILDIRIMI GONDERILDI');
        }
    }
}
```

şununla değiştir:
```js
function sahteGpsGuncelle(sefer, seferId) {
    const hedefNokta = sefer.rotaNoktalari[sefer.hedefIndex];

    const enlemFark = hedefNokta.enlem - sefer.konum.enlem;
    const boylamFark = hedefNokta.boylam - sefer.konum.boylam;
    const kalanMesafeDerece = Math.sqrt(enlemFark * enlemFark + boylamFark * boylamFark);

    if (kalanMesafeDerece > ADIM_BUYUKLUGU) {
        sefer.konum.enlem += (enlemFark / kalanMesafeDerece) * ADIM_BUYUKLUGU;
        sefer.konum.boylam += (boylamFark / kalanMesafeDerece) * ADIM_BUYUKLUGU;
    } else {
        if (sefer.hedefIndex < sefer.rotaNoktalari.length - 1) {
            sefer.hedefIndex++;
            console.log('Sefer ' + seferId + ' yeni hedefe geciyor:', sefer.rotaNoktalari[sefer.hedefIndex]);
        } else if (!sefer.varisBildirimiGonderildi) {
            sefer.varisBildirimiGonderildi = true;
            io.to('sefer:' + seferId).emit('varis-bildirimi', {
                mesaj: sefer.rotaAdlari[sefer.rotaAdlari.length - 1] + '\'a hos geldiniz! Yolculugunuz tamamlandi.'
            });
            console.log('VARIS BILDIRIMI GONDERILDI. Sefer:', seferId);
        }
    }
}
```

`kalanToplamMesafeHesapla` fonksiyonunu:
```js
function kalanToplamMesafeHesapla() {
    const hedefNokta = rotaNoktalari[suankiHedefIndex];
    let kalan = ikiNoktaArasiMesafe(gemiKonumu.enlem, gemiKonumu.boylam, hedefNokta.enlem, hedefNokta.boylam);

    for (let i = suankiHedefIndex + 1; i < rotaNoktalari.length; i++) {
        kalan += legMesafeleri[i];
    }
    return kalan;
}
```

şununla değiştir:
```js
function kalanToplamMesafeHesapla(sefer) {
    const hedefNokta = sefer.rotaNoktalari[sefer.hedefIndex];
    let kalan = ikiNoktaArasiMesafe(sefer.konum.enlem, sefer.konum.boylam, hedefNokta.enlem, hedefNokta.boylam);

    for (let i = sefer.hedefIndex + 1; i < sefer.rotaNoktalari.length; i++) {
        kalan += sefer.legMesafeleri[i];
    }
    return kalan;
}
```

- [ ] **Step 6: `konumKontrolVeYayinla`'yı çoklu sefer üzerinde dönecek hale getir**

Tüm `konumKontrolVeYayinla` fonksiyonunu:
```js
async function konumKontrolVeYayinla() {
    sahteGpsGuncelle();

    try {
        const sonuc = await havuz.query(
            'SELECT ad, tip, enlem, boylam, tetikleme_mesafesi_metre, aciklama, video_url, sesli_anlatim_url, videolu_anlatim_url FROM ilgi_noktalari'
        );

        const tetiklenenler = [];

        for (const nokta of sonuc.rows) {
            const kontrol = geofenceKontrolEt(gemiKonumu.enlem, gemiKonumu.boylam, nokta);
            if (kontrol.tetiklendi) {
                tetiklenenler.push(kontrol);
            }
        }

        const kalanToplamMesafe = kalanToplamMesafeHesapla();
        const ilerlemeYuzdesi = Math.min(100, Math.max(0, ((toplamRotaMesafesi - kalanToplamMesafe) / toplamRotaMesafesi) * 100));
        const toplamKalanDakika = kalanToplamMesafe / HIZ_METRE_SANIYE / 60;

        const hedefNokta = rotaNoktalari[suankiHedefIndex];
        const hedefeMesafe = ikiNoktaArasiMesafe(gemiKonumu.enlem, gemiKonumu.boylam, hedefNokta.enlem, hedefNokta.boylam);
        const hedefeKalanDakika = hedefeMesafe / HIZ_METRE_SANIYE / 60;

        io.emit('gemi-konum-guncelleme', {
            enlem: gemiKonumu.enlem,
            boylam: gemiKonumu.boylam,
            tetiklenen_noktalar: tetiklenenler,
            suanki_hedef: rotaAdlari[suankiHedefIndex],
            sonraki_duraklar: rotaAdlari.slice(suankiHedefIndex + 1),
            ilerleme_yuzdesi: ilerlemeYuzdesi,
            toplam_kalan_dakika: toplamKalanDakika,
            hedefe_kalan_dakika: hedefeKalanDakika
        });

        console.log(`Konum: ${gemiKonumu.enlem.toFixed(4)}, ${gemiKonumu.boylam.toFixed(4)} | Ilerleme: %${ilerlemeYuzdesi.toFixed(0)} | Kalan: ${toplamKalanDakika.toFixed(1)} dk`);

    } catch (hata) {
        console.log('Konum kontrol hatasi:', hata.message);
    }
}
```

şununla değiştir:
```js
async function konumKontrolVeYayinla() {
    for (const [seferId, sefer] of aktifSeferler) {
        sahteGpsGuncelle(sefer, seferId);

        try {
            const sonuc = await havuz.query(
                'SELECT ad, tip, enlem, boylam, tetikleme_mesafesi_metre, aciklama, video_url, sesli_anlatim_url, videolu_anlatim_url FROM ilgi_noktalari WHERE hat_id IS NULL OR hat_id = $1',
                [sefer.hatId]
            );

            const tetiklenenler = [];

            for (const nokta of sonuc.rows) {
                const kontrol = geofenceKontrolEt(sefer.konum.enlem, sefer.konum.boylam, nokta);
                if (kontrol.tetiklendi) {
                    tetiklenenler.push(kontrol);
                }
            }

            const kalanToplamMesafe = kalanToplamMesafeHesapla(sefer);
            const ilerlemeYuzdesi = Math.min(100, Math.max(0, ((sefer.toplamRotaMesafesi - kalanToplamMesafe) / sefer.toplamRotaMesafesi) * 100));
            const toplamKalanDakika = kalanToplamMesafe / HIZ_METRE_SANIYE / 60;

            const hedefNokta = sefer.rotaNoktalari[sefer.hedefIndex];
            const hedefeMesafe = ikiNoktaArasiMesafe(sefer.konum.enlem, sefer.konum.boylam, hedefNokta.enlem, hedefNokta.boylam);
            const hedefeKalanDakika = hedefeMesafe / HIZ_METRE_SANIYE / 60;

            io.to('sefer:' + seferId).emit('gemi-konum-guncelleme', {
                enlem: sefer.konum.enlem,
                boylam: sefer.konum.boylam,
                tetiklenen_noktalar: tetiklenenler,
                suanki_hedef: sefer.rotaAdlari[sefer.hedefIndex],
                sonraki_duraklar: sefer.rotaAdlari.slice(sefer.hedefIndex + 1),
                ilerleme_yuzdesi: ilerlemeYuzdesi,
                toplam_kalan_dakika: toplamKalanDakika,
                hedefe_kalan_dakika: hedefeKalanDakika
            });

            console.log(`Sefer ${seferId} konum: ${sefer.konum.enlem.toFixed(4)}, ${sefer.konum.boylam.toFixed(4)} | Ilerleme: %${ilerlemeYuzdesi.toFixed(0)} | Kalan: ${toplamKalanDakika.toFixed(1)} dk`);

        } catch (hata) {
            console.log('Konum kontrol hatasi (sefer ' + seferId + '):', hata.message);
        }
    }
}
```

- [ ] **Step 7: `module.exports`'u güncelle**

`server.js`'in en altındaki:
```js
module.exports = { app, sunucu, havuz, sunucuHatasiYanitla };
```

şununla değiştir:
```js
module.exports = { app, sunucu, havuz, sunucuHatasiYanitla, aktifSeferler, seferStateOlustur, konumKontrolVeYayinla };
```

- [ ] **Step 8: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run server.test.js -t "coklu sefer bagimsizligi"`
Beklenen: PASS (2 test)

- [ ] **Step 9: Tüm test paketini çalıştır**

Çalıştır: `npm test`
Beklenen: `/reset-gemi` testleri bu noktada FAIL olacak (Task 6'da düzeltilecek — `gemiKonumu`/`suankiHedefIndex` artık yok). Diğer tüm testler PASS olmalı. Bu beklenen, geçici bir kırılma; Task 6'ya kadar commit edilmemeli.

- [ ] **Step 10: `/reset-gemi` handler'ını geçici olarak derlenir/çalışır durumda tut**

`server.js`'deki `/reset-gemi` handler'ı hâlâ eski `gemiKonumu`/`suankiHedefIndex`/`varisBildirimiGonderildi` değişkenlerine referans veriyor (artık tanımsızlar). Bu satırları geçici olarak sil (gövdeyi boşalt, sadece `res.json({ tamam: true });` bıraksın) — Task 6 bu handler'ı tam olarak yeniden yazacak:
```js
app.post('/reset-gemi', jwtDogrulaMiddleware(tokenDogrula, JWT_GIZLI_ANAHTARI, ['kaptan', 'admin']), (req, res) => {
    res.json({ tamam: true });
});
```

- [ ] **Step 11: Tüm test paketini çalıştır**

Çalıştır: `npm test`
Beklenen: Tüm testler PASS (Task 6'ya kadar `/reset-gemi`'nin sefer_id doğrulaması yok, ama mevcut testler zaten sadece auth/rol kontrolü yapıyor, hepsi geçer).

- [ ] **Step 12: Commit**

```bash
git add server.js server.test.js
git commit -m "feat: sunucu state ini sefer-bazli bellek-ici Map e tasi (aktifSeferler)"
```

---

### Task 5: Sefer yaşam döngüsü REST uçları

**Files:**
- Modify: `server.js`
- Modify: `server.test.js`

**Interfaces:**
- Consumes: `gemiGetir`, `tumGemileriListele` (Task 2), `rotaNoktalariGetir`, `tumHatlariListele` (Task 2), `seferOlustur`, `seferBitir`, `seferlerAktifListele` (Task 3), `aktifSeferler`, `seferStateOlustur` (Task 4).
- Produces: `POST /sefer/baslat`, `POST /sefer/bitir`, `GET /seferler/aktif`, `GET /gemiler`, `GET /hatlar` — Task 6, 7, 8, 9 tarafından kullanılacak.

- [ ] **Step 1: `server.js`'in require bloğuna yeni repo fonksiyonlarını ekle**

`const { kullaniciAdiylaBul, idIleBul } = require('./personelRepo.js');` satırının altına ekle:
```js
const { tumGemileriListele, gemiGetir } = require('./gemilerRepo.js');
const { tumHatlariListele, rotaNoktalariGetir } = require('./hatlarRepo.js');
const { seferOlustur, seferBitir, seferlerAktifListele } = require('./seferRepo.js');
```

- [ ] **Step 2: Başarısız testleri yaz — `POST /sefer/baslat`**

`server.test.js`'e, `describe('POST /reset-gemi', ...)` bloğundan önce ekle:
```js
describe('POST /sefer/baslat', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        aktifSeferler.clear();
    });

    it('personel rolundeki gecerli token ile 403 doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'personel1', rol: 'personel' }, process.env.JWT_GIZLI_ANAHTARI);
        const yanit = await request(app)
            .post('/sefer/baslat')
            .set('Authorization', `Bearer ${token}`)
            .send({ gemi_id: 1, hat_id: 1 });
        expect(yanit.status).toBe(403);
    });

    it('gecersiz gemi_id ile 400 doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rows: [] }); // gemiGetir bos
        const yanit = await request(app)
            .post('/sefer/baslat')
            .set('Authorization', `Bearer ${token}`)
            .send({ gemi_id: 999, hat_id: 1 });
        expect(yanit.status).toBe(400);
    });

    it('gecersiz hat_id ile 400 doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        vi.spyOn(havuz, 'query')
            .mockResolvedValueOnce({ rows: [{ id: 1, ad: 'Yalova Feribotu 1' }] }) // gemiGetir
            .mockResolvedValueOnce({ rows: [] }); // rotaNoktalariGetir bos
        const yanit = await request(app)
            .post('/sefer/baslat')
            .set('Authorization', `Bearer ${token}`)
            .send({ gemi_id: 1, hat_id: 999 });
        expect(yanit.status).toBe(400);
    });

    it('gemi zaten aktif seferdeyse 409 doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        vi.spyOn(havuz, 'query')
            .mockResolvedValueOnce({ rows: [{ id: 1, ad: 'Yalova Feribotu 1' }] }) // gemiGetir
            .mockResolvedValueOnce({ rows: [{ ad: 'Yalova', enlem: 40.65, boylam: 29.26 }, { ad: 'Istanbul', enlem: 41.01, boylam: 29.02 }] }) // rotaNoktalariGetir
            .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' })); // seferOlustur
        const yanit = await request(app)
            .post('/sefer/baslat')
            .set('Authorization', `Bearer ${token}`)
            .send({ gemi_id: 1, hat_id: 1 });
        expect(yanit.status).toBe(409);
    });

    it('gecerli istekle sefer baslar, sefer_id doner ve aktifSeferler e eklenir', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        vi.spyOn(havuz, 'query')
            .mockResolvedValueOnce({ rows: [{ id: 1, ad: 'Yalova Feribotu 1' }] }) // gemiGetir
            .mockResolvedValueOnce({ rows: [{ ad: 'Yalova', enlem: 40.65, boylam: 29.26 }, { ad: 'Istanbul', enlem: 41.01, boylam: 29.02 }] }) // rotaNoktalariGetir
            .mockResolvedValueOnce({ rows: [{ id: 42, gemi_id: 1, hat_id: 1, baslangic_zamani: '2026-08-07T10:00:00.000Z' }] }); // seferOlustur

        const yanit = await request(app)
            .post('/sefer/baslat')
            .set('Authorization', `Bearer ${token}`)
            .send({ gemi_id: 1, hat_id: 1 });

        expect(yanit.status).toBe(200);
        expect(yanit.body).toEqual({ sefer_id: 42 });
        expect(aktifSeferler.has(42)).toBe(true);
        expect(aktifSeferler.get(42).gemiAdi).toBe('Yalova Feribotu 1');
    });
});
```

- [ ] **Step 3: Başarısız testleri yaz — `POST /sefer/bitir`, `GET /seferler/aktif`, `GET /gemiler`, `GET /hatlar`**

Aynı yere (Step 2'nin hemen altına) ekle:
```js
describe('POST /sefer/bitir', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        aktifSeferler.clear();
    });

    it('aktif olmayan sefer_id ile 404 doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const yanit = await request(app)
            .post('/sefer/bitir')
            .set('Authorization', `Bearer ${token}`)
            .send({ sefer_id: 999 });
        expect(yanit.status).toBe(404);
    });

    it('aktif sefer basariyla bitirilir ve aktifSeferler den silinir', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        aktifSeferler.set(7, { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rowCount: 1 });

        const yanit = await request(app)
            .post('/sefer/bitir')
            .set('Authorization', `Bearer ${token}`)
            .send({ sefer_id: 7 });

        expect(yanit.status).toBe(200);
        expect(yanit.body).toEqual({ tamam: true });
        expect(aktifSeferler.has(7)).toBe(false);
    });
});

describe('GET /seferler/aktif', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('auth gerektirmez, aktif seferleri doner', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({
            rows: [{ sefer_id: 1, gemi_adi: 'Gemi A', hat_adi: 'Hat 1', baslangic_zamani: '2026-08-07T10:00:00.000Z' }]
        });
        const yanit = await request(app).get('/seferler/aktif');
        expect(yanit.status).toBe(200);
        expect(yanit.body).toEqual([{ sefer_id: 1, gemi_adi: 'Gemi A', hat_adi: 'Hat 1', baslangic_zamani: '2026-08-07T10:00:00.000Z' }]);
    });
});

describe('GET /gemiler', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('auth gerektirmez, gemi listesini doner', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rows: [{ id: 1, ad: 'Yalova Feribotu 1' }] });
        const yanit = await request(app).get('/gemiler');
        expect(yanit.status).toBe(200);
        expect(yanit.body).toEqual([{ id: 1, ad: 'Yalova Feribotu 1' }]);
    });
});

describe('GET /hatlar', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('auth gerektirmez, hat listesini doner', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rows: [{ id: 1, ad: 'Yalova - Istanbul' }] });
        const yanit = await request(app).get('/hatlar');
        expect(yanit.status).toBe(200);
        expect(yanit.body).toEqual([{ id: 1, ad: 'Yalova - Istanbul' }]);
    });
});
```

- [ ] **Step 4: Testleri çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run server.test.js -t "sefer/baslat|sefer/bitir|seferler/aktif|GET /gemiler|GET /hatlar"`
Beklenen: FAIL — 404 (uçlar henüz yok)

- [ ] **Step 5: `server.js`'e yeni uçları ekle**

`app.post('/reset-gemi', ...)` bloğundan hemen önce ekle:
```js
app.post('/sefer/baslat', jwtDogrulaMiddleware(tokenDogrula, JWT_GIZLI_ANAHTARI, ['kaptan', 'admin']), async (req, res) => {
    const gemiId = Number(req.body?.gemi_id);
    const hatId = Number(req.body?.hat_id);
    if (!Number.isInteger(gemiId) || !Number.isInteger(hatId)) {
        return res.status(400).json({ hata: 'Gecersiz istek' });
    }

    try {
        const gemi = await gemiGetir(havuz, gemiId);
        if (!gemi) {
            return res.status(400).json({ hata: 'Gecersiz gemi_id' });
        }

        const rotaNoktalariSatirlari = await rotaNoktalariGetir(havuz, hatId);
        if (rotaNoktalariSatirlari.length === 0) {
            return res.status(400).json({ hata: 'Gecersiz hat_id' });
        }

        const sefer = await seferOlustur(havuz, { gemiId, hatId, baslatanPersonelId: req.kullanici.id });
        const seferState = seferStateOlustur(rotaNoktalariSatirlari);
        aktifSeferler.set(sefer.id, { ...seferState, gemiId, hatId, gemiAdi: gemi.ad });

        res.json({ sefer_id: sefer.id });
    } catch (hata) {
        if (hata.code === '23505') {
            return res.status(409).json({ hata: 'Bu gemi zaten aktif bir seferde' });
        }
        sunucuHatasiYanitla(res, hata, 'Sefer baslatilamadi');
    }
});

app.post('/sefer/bitir', jwtDogrulaMiddleware(tokenDogrula, JWT_GIZLI_ANAHTARI, ['kaptan', 'admin']), async (req, res) => {
    const seferId = Number(req.body?.sefer_id);
    if (!Number.isInteger(seferId) || !aktifSeferler.has(seferId)) {
        return res.status(404).json({ hata: 'Aktif sefer bulunamadi' });
    }

    try {
        await seferBitir(havuz, seferId);
        aktifSeferler.delete(seferId);
        io.to('sefer:' + seferId).emit('sefer-bitti', {});
        res.json({ tamam: true });
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Sefer bitirilemedi');
    }
});

app.get('/seferler/aktif', async (req, res) => {
    try {
        const seferler = await seferlerAktifListele(havuz);
        res.json(seferler);
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Aktif seferler alinamadi');
    }
});

app.get('/gemiler', async (req, res) => {
    try {
        const gemiler = await tumGemileriListele(havuz);
        res.json(gemiler);
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Gemiler alinamadi');
    }
});

app.get('/hatlar', async (req, res) => {
    try {
        const hatlar = await tumHatlariListele(havuz);
        res.json(hatlar);
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Hatlar alinamadi');
    }
});
```

- [ ] **Step 6: Testleri çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run server.test.js -t "sefer/baslat|sefer/bitir|seferler/aktif|GET /gemiler|GET /hatlar"`
Beklenen: PASS (10 test)

- [ ] **Step 7: Tüm test paketini çalıştır**

Çalıştır: `npm test`
Beklenen: Tüm testler PASS

- [ ] **Step 8: Commit**

```bash
git add server.js server.test.js
git commit -m "feat: sefer baslatma/bitirme ve gemi/hat/sefer listeleme REST uclarini ekle"
```

---

### Task 6: Mevcut uçları (`/reset-gemi`, `/tum-noktalar`, `/hava-durumu`) sefer-bazlı hale getir

**Files:**
- Modify: `server.js`
- Modify: `server.test.js`

**Interfaces:**
- Consumes: `aktifSeferler` (Task 4).
- Produces: `POST /reset-gemi` artık `{sefer_id}` alır; `GET /tum-noktalar`, `GET /hava-durumu` artık `?sefer_id=` gerektirir.

- [ ] **Step 1: `/reset-gemi` handler'ını tamamla**

Task 4 Step 10'da geçici olarak boşaltılan `/reset-gemi` handler'ını şununla değiştir:
```js
app.post('/reset-gemi', jwtDogrulaMiddleware(tokenDogrula, JWT_GIZLI_ANAHTARI, ['kaptan', 'admin']), (req, res) => {
    const seferId = Number(req.body?.sefer_id);
    const sefer = aktifSeferler.get(seferId);
    if (!sefer) {
        return res.status(404).json({ hata: 'Aktif sefer bulunamadi' });
    }
    sefer.konum = { ...sefer.rotaNoktalari[0] };
    sefer.hedefIndex = 1;
    sefer.varisBildirimiGonderildi = false;
    console.log('SEFER SIFIRLANDI. Sefer ID:', seferId, 'Kullanici:', req.kullanici.kullanici_adi);
    res.json({ tamam: true });
});
```

- [ ] **Step 2: `/tum-noktalar` ve `/hava-durumu` uçlarını sefer_id gerektirecek şekilde güncelle**

`app.get('/tum-noktalar', ...)`'ı:
```js
app.get('/tum-noktalar', async (req, res) => {
    try {
        const sonuc = await havuz.query(
            'SELECT ad, tip, aciklama, video_url, sesli_anlatim_url, videolu_anlatim_url FROM ilgi_noktalari ORDER BY ad'
        );
        res.json(sonuc.rows);
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Ilgi noktalari alinamadi');
    }
});
```

şununla değiştir:
```js
app.get('/tum-noktalar', async (req, res) => {
    const seferId = Number(req.query.sefer_id);
    const sefer = aktifSeferler.get(seferId);
    if (!sefer) {
        return res.status(400).json({ hata: 'Gecersiz veya aktif olmayan sefer_id' });
    }
    try {
        const sonuc = await havuz.query(
            'SELECT ad, tip, aciklama, video_url, sesli_anlatim_url, videolu_anlatim_url FROM ilgi_noktalari WHERE hat_id IS NULL OR hat_id = $1 ORDER BY ad',
            [sefer.hatId]
        );
        res.json(sonuc.rows);
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Ilgi noktalari alinamadi');
    }
});
```

`app.get('/hava-durumu', ...)`'ı:
```js
app.get('/hava-durumu', async (req, res) => {
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${gemiKonumu.enlem}&lon=${gemiKonumu.boylam}&appid=${HAVA_DURUMU_API_ANAHTARI}&units=metric&lang=tr`;
        const yanit = await fetch(url);
        const veri = await yanit.json();

        if (veri.cod && veri.cod !== 200) {
            return sunucuHatasiYanitla(res, new Error(veri.message || 'Hava durumu alinamadi'), 'Hava durumu alinamadi');
        }

        res.json({
            sicaklik: Math.round(veri.main.temp),
            aciklama: veri.weather[0].description,
            ruzgarHizi: Math.round(veri.wind.speed * 3.6) // m/s -> km/s
        });
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Hava durumu alinamadi');
    }
});
```

şununla değiştir:
```js
app.get('/hava-durumu', async (req, res) => {
    const seferId = Number(req.query.sefer_id);
    const sefer = aktifSeferler.get(seferId);
    if (!sefer) {
        return res.status(400).json({ hata: 'Gecersiz veya aktif olmayan sefer_id' });
    }
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${sefer.konum.enlem}&lon=${sefer.konum.boylam}&appid=${HAVA_DURUMU_API_ANAHTARI}&units=metric&lang=tr`;
        const yanit = await fetch(url);
        const veri = await yanit.json();

        if (veri.cod && veri.cod !== 200) {
            return sunucuHatasiYanitla(res, new Error(veri.message || 'Hava durumu alinamadi'), 'Hava durumu alinamadi');
        }

        res.json({
            sicaklik: Math.round(veri.main.temp),
            aciklama: veri.weather[0].description,
            ruzgarHizi: Math.round(veri.wind.speed * 3.6) // m/s -> km/s
        });
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Hava durumu alinamadi');
    }
});
```

- [ ] **Step 3: Başarısız testleri yaz — `/reset-gemi`'yi güncelle, `/tum-noktalar` ve `/hava-durumu` için yeni testler ekle**

`describe('POST /reset-gemi', ...)` bloğunun tamamını şununla değiştir:
```js
describe('POST /reset-gemi', () => {
    afterEach(() => {
        aktifSeferler.clear();
    });

    it('Authorization basligi yoksa 401 doner', async () => {
        const yanit = await request(app).post('/reset-gemi').send({});
        expect(yanit.status).toBe(401);
    });

    it('gecersiz token ile 401 doner', async () => {
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Authorization', 'Bearer bozuk.token.degeri')
            .send({});
        expect(yanit.status).toBe(401);
    });

    it('personel rolundeki gecerli token ile 403 doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'personel1', rol: 'personel' }, process.env.JWT_GIZLI_ANAHTARI);
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Authorization', `Bearer ${token}`)
            .send({ sefer_id: 1 });
        expect(yanit.status).toBe(403);
    });

    it('aktif olmayan sefer_id ile 404 doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Authorization', `Bearer ${token}`)
            .send({ sefer_id: 999 });
        expect(yanit.status).toBe(404);
    });

    it('kaptan rolundeki gecerli token ile aktif seferi baslangic noktasina sifirlar', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        aktifSeferler.set(9, { ...seferStateOlustur([
            { ad: 'Baslangic', enlem: 40.5, boylam: 29.5 },
            { ad: 'Hedef', enlem: 41.0, boylam: 29.0 }
        ]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        aktifSeferler.get(9).konum.enlem = 40.9;

        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Authorization', `Bearer ${token}`)
            .send({ sefer_id: 9 });

        expect(yanit.status).toBe(200);
        expect(yanit.body).toEqual({ tamam: true });
        expect(aktifSeferler.get(9).konum).toEqual({ enlem: 40.5, boylam: 29.5 });
        expect(aktifSeferler.get(9).hedefIndex).toBe(1);
    });
});

describe('GET /tum-noktalar', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        aktifSeferler.clear();
    });

    it('sefer_id eksik veya aktif degilse 400 doner', async () => {
        const yanit = await request(app).get('/tum-noktalar?sefer_id=999');
        expect(yanit.status).toBe(400);
    });

    it('aktif seferin hat_id sine gore filtrelenmis noktalari doner', async () => {
        aktifSeferler.set(3, { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 7, gemiAdi: 'Gemi A' });
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rows: [{ ad: 'Heybeliada', tip: 'ada' }] });

        const yanit = await request(app).get('/tum-noktalar?sefer_id=3');

        expect(yanit.status).toBe(200);
        expect(havuz.query.mock.calls[0][1]).toEqual([7]);
        expect(yanit.body).toEqual([{ ad: 'Heybeliada', tip: 'ada' }]);
    });
});

describe('GET /hava-durumu', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        aktifSeferler.clear();
    });

    it('sefer_id eksik veya aktif degilse 400 doner', async () => {
        const yanit = await request(app).get('/hava-durumu?sefer_id=999');
        expect(yanit.status).toBe(400);
    });

    it('aktif seferin canli konumu icin hava durumu doner', async () => {
        aktifSeferler.set(5, { ...seferStateOlustur([{ ad: 'A', enlem: 40.5, boylam: 29.5 }, { ad: 'B', enlem: 40.6, boylam: 29.6 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
            json: async () => ({
                main: { temp: 18.4 },
                weather: [{ description: 'acik' }],
                wind: { speed: 5 }
            })
        });

        const yanit = await request(app).get('/hava-durumu?sefer_id=5');

        expect(yanit.status).toBe(200);
        expect(yanit.body.sicaklik).toBe(18);
        expect(yanit.body.aciklama).toBe('acik');
    });
});
```

`describe('REST uclarinda CORS', ...)` bloğunun tamamını şununla değiştir (`.send({})` yerine geçerli bir aktif sefer + `sefer_id` gönderecek şekilde güncellendi):
```js
describe('REST uclarinda CORS', () => {
    const gecerliToken = () =>
        erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);

    afterEach(() => {
        aktifSeferler.clear();
    });

    function aktifSeferOlustur() {
        aktifSeferler.set(1, { ...seferStateOlustur([
            { ad: 'Baslangic', enlem: 40.5, boylam: 29.5 },
            { ad: 'Hedef', enlem: 41.0, boylam: 29.0 }
        ]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        return 1;
    }

    it('izin verilmeyen origin ile POST /reset-gemi 403 doner', async () => {
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Origin', 'https://kotu-site.com')
            .set('Authorization', `Bearer ${gecerliToken()}`)
            .send({});
        expect(yanit.status).toBe(403);
    });

    it('izin verilen origin ile POST /reset-gemi gecer ve Access-Control-Allow-Origin doner', async () => {
        const seferId = aktifSeferOlustur();
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Origin', 'https://izinli-site.com')
            .set('Authorization', `Bearer ${gecerliToken()}`)
            .send({ sefer_id: seferId });
        expect(yanit.status).toBe(200);
        expect(yanit.headers['access-control-allow-origin']).toBe('https://izinli-site.com');
    });

    it('origin header i olmadan (mobil istemci) istek normal calisir', async () => {
        const seferId = aktifSeferOlustur();
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Authorization', `Bearer ${gecerliToken()}`)
            .send({ sefer_id: seferId });
        expect(yanit.status).toBe(200);
        expect(yanit.headers['access-control-allow-origin']).toBeUndefined();
    });
});
```

- [ ] **Step 4: Testleri çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run server.test.js -t "reset-gemi|tum-noktalar|hava-durumu|CORS"`
Beklenen: PASS

- [ ] **Step 5: Tüm test paketini çalıştır**

Çalıştır: `npm test`
Beklenen: Tüm testler PASS

- [ ] **Step 6: Commit**

```bash
git add server.js server.test.js
git commit -m "fix: reset-gemi, tum-noktalar ve hava-durumu uclarini sefer-bazli hale getir"
```

---

### Task 7: Socket.io oda modeli — `sefer-sec` ve sefer-bazlı yayınlar

**Files:**
- Modify: `server.js`
- Modify: `server.test.js`
- Modify: `validation.js`
- Modify: `validation.test.js`

**Interfaces:**
- Consumes: `aktifSeferler` (Task 4).
- Produces: `sefer-sec` socket event'i (`soket.data.aktifSeferId`'i doldurur); `acil-durum-baslat/bitir` ve `yolcu-sayisi-guncelle` artık `gemi_adi` almaz, `soket.data.aktifSeferId`'den hedef sefer/oda türetilir.

**Dikkat — soket testi kararlılığı:** Bu görevdeki gibi aynı `describe` bloğu içinde art arda çok sayıda gerçek `socket.io-client` bağlantısı açıp kapatmak (aynı paylaşılan `sunucu` örneği üzerinde), bu ortamda gözlemlenmiş şekilde ara sıra flaky davranışa (bağlantı/olay zaman aşımı) yol açabiliyor — kod hatası değil, ortamsal bir durum. Adımları uyguladıktan sonra `npm test`'i art arda birkaç kez çalıştırıp kararlılığı doğrula. Flaky çıkarsa: (a) önce başarısız olan testi tek başına (`-t` ile) tekrar çalıştırıp gerçekten flaky mi yoksa gerçek bir hata mı olduğunu ayır, (b) gerçekten flaky ise ve iki büyük describe bloğu (`acil-durum-baslat socket yetkilendirmesi`, `yolcu-sayisi-guncelle yetkilendirmesi`) toplamda çok fazla soket açıyor gibi görünüyorsa, sızıntı testini (`sefer odasi disindaki dinleyiciye...`) kendi küçük `describe` bloğuna (kendi `beforeAll`/`afterAll` sunucu yaşam döngüsüyle) ayırmayı dene — bunu yaparken hiçbir testi silme, sadece grupla.

- [ ] **Step 1: Başarısız testleri yaz — `describe('acil-durum-baslat socket yetkilendirmesi', ...)` bloğunu değiştir**

Bu describe bloğunun tamamını (mevcut hâli `server.test.js`'de `'token gonderilmezse baglanti kurulur...'` testinden `'kaptan rolundeki token ile acil-durum-uyarisi yayinlanir'` testine kadar) şununla değiştir:
```js
describe('acil-durum-baslat socket yetkilendirmesi', () => {
    let sunucuPortu;

    beforeAll(async () => {
        await new Promise((resolve) => sunucu.listen(0, resolve));
        sunucuPortu = sunucu.address().port;
    });

    afterAll(async () => {
        await new Promise((resolve) => sunucu.close(resolve));
    });

    afterEach(() => {
        aktifSeferler.clear();
    });

    it('token gonderilmezse baglanti kurulur (yolcu app icin anonim/dinleyici erisim)', async () => {
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => gonderen.on('connect', resolve));
        expect(gonderen.connected).toBe(true);
        gonderen.disconnect();
    });

    it('yenileme tokeni ile baglanti reddedilir (tur uyusmazligi)', async () => {
        const yenileme = yenilemeTokeniOlustur(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token: yenileme } });
        const hata = await new Promise((resolve) => gonderen.on('connect_error', resolve));
        expect(hata.message).toBe('Yetkisiz');
        gonderen.disconnect();
    });

    it('baglanti sirasinda gecerli ama sonradan suresi dolan token ile acil-durum-baslat "Oturum suresi doldu" doner', async () => {
        // Handshake aninda gecerli (henuz suresi dolmamis), ama cok kisa omurlu bir token
        // uretiyoruz; baglanti kurulduktan sonra bekleyip suresinin dolmasini sagliyoruz.
        // sefer-sec kimlik dogrulamasi gerektirmedigi icin (bkz. Task 7 tasarimi), suresi
        // dolmus tokenla da basarili olur; asil kontrol acil-durum-baslat'ta yapilir.
        aktifSeferler.set(1, { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        const jwt = require('jsonwebtoken');
        const kisaOmurluToken = jwt.sign(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan', tur: 'erisim' },
            process.env.JWT_GIZLI_ANAHTARI,
            { expiresIn: '1s' }
        );

        const gonderen = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token: kisaOmurluToken } });
        await new Promise((resolve) => gonderen.on('connect', resolve));
        await new Promise((resolve) => gonderen.emit('sefer-sec', { sefer_id: 1 }, resolve));

        await new Promise((resolve) => setTimeout(resolve, 1200));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', {}, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Oturum suresi doldu' });
        gonderen.disconnect();
    }, 10000);

    it('gecersiz/aktif olmayan sefer_id ile sefer-sec basarisiz doner', async () => {
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => gonderen.on('connect', resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('sefer-sec', { sefer_id: 999 }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Gecersiz veya aktif olmayan sefer' });
        gonderen.disconnect();
    });

    it('sefer secilmeden acil-durum-baslat gonderilirse "Sefer secilmedi" doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token } });
        await new Promise((resolve) => gonderen.on('connect', resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', {}, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Sefer secilmedi' });
        gonderen.disconnect();
    });

    it('personel rolundeki token ile sefer secilir ama acil-durum-baslat Yetkisiz rol doner', async () => {
        aktifSeferler.set(1, { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'personel1', rol: 'personel' }, process.env.JWT_GIZLI_ANAHTARI);
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token } });
        await new Promise((resolve) => gonderen.on('connect', resolve));
        await new Promise((resolve) => gonderen.emit('sefer-sec', { sefer_id: 1 }, resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', {}, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz rol' });
        gonderen.disconnect();
    });

    it('sefer odasi disindaki dinleyiciye acil-durum-uyarisi sizmaz, oda icindekine ulasir', async () => {
        aktifSeferler.set(1, { ...seferStateOlustur([{ ad: 'A1', enlem: 0, boylam: 0 }, { ad: 'A2', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        aktifSeferler.set(2, { ...seferStateOlustur([{ ad: 'B1', enlem: 10, boylam: 10 }, { ad: 'B2', enlem: 11, boylam: 11 }]), gemiId: 2, hatId: 2, gemiAdi: 'Gemi B' });

        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const kaptanA = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token } });
        const dinleyiciA = ioClient(`http://localhost:${sunucuPortu}`);
        const dinleyiciB = ioClient(`http://localhost:${sunucuPortu}`);

        await Promise.all([kaptanA, dinleyiciA, dinleyiciB].map((s) => new Promise((r) => s.on('connect', r))));
        await Promise.all([
            new Promise((r) => kaptanA.emit('sefer-sec', { sefer_id: 1 }, r)),
            new Promise((r) => dinleyiciA.emit('sefer-sec', { sefer_id: 1 }, r)),
            new Promise((r) => dinleyiciB.emit('sefer-sec', { sefer_id: 2 }, r))
        ]);

        const aAldiPromise = new Promise((resolve) => dinleyiciA.on('acil-durum-uyarisi', resolve));
        let bAldiMi = false;
        dinleyiciB.on('acil-durum-uyarisi', () => { bAldiMi = true; });

        const yanit = await new Promise((resolve) => kaptanA.emit('acil-durum-baslat', {}, resolve));
        const aAldi = await aAldiPromise;

        expect(yanit).toEqual({ tamam: true });
        expect(aAldi.gemi).toBe('Gemi A');

        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(bAldiMi).toBe(false);

        kaptanA.disconnect();
        dinleyiciA.disconnect();
        dinleyiciB.disconnect();
    });
});
```

- [ ] **Step 2: Başarısız testleri yaz — `describe('yolcu-sayisi-guncelle yetkilendirmesi', ...)` bloğunu değiştir**

Bu describe bloğunun tamamını şununla değiştir:
```js
describe('yolcu-sayisi-guncelle yetkilendirmesi', () => {
    let sunucuPortu;

    beforeAll(async () => {
        await new Promise((resolve) => sunucu.listen(0, resolve));
        sunucuPortu = sunucu.address().port;
    });

    afterAll(async () => {
        await new Promise((resolve) => sunucu.close(resolve));
    });

    afterEach(() => {
        aktifSeferler.clear();
    });

    it('anonim (tokensiz) baglanti yolcu-sayisi-guncelle gonderirse Yetkisiz doner', async () => {
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => gonderen.on('connect', resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('yolcu-sayisi-guncelle', { sayi: 3 }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz' });
        gonderen.disconnect();
    });

    it('gecerli token ile sefer secilmis herhangi bir rol yolcu-sayisi-yayin yapabilir, sadece o sefer odasina', async () => {
        aktifSeferler.set(1, { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'personel1', rol: 'personel' }, process.env.JWT_GIZLI_ANAHTARI);

        const gonderen = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token } });
        const dinleyici = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => gonderen.on('connect', resolve));
        await new Promise((resolve) => dinleyici.on('connect', resolve));
        await new Promise((resolve) => gonderen.emit('sefer-sec', { sefer_id: 1 }, resolve));
        await new Promise((resolve) => dinleyici.emit('sefer-sec', { sefer_id: 1 }, resolve));

        const yayinPromise = new Promise((resolve) => dinleyici.on('yolcu-sayisi-yayin', resolve));
        gonderen.emit('yolcu-sayisi-guncelle', { sayi: 3 }, () => {});
        const yayin = await yayinPromise;

        expect(yayin).toEqual({ sayi: 3, gemi_adi: 'Gemi A' });
        gonderen.disconnect();
        dinleyici.disconnect();
    });
});
```

- [ ] **Step 3: Testleri çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run server.test.js -t "yetkilendirmesi"`
Beklenen: FAIL (`sefer-sec` event'i henüz yok, `acil-durum-*`/`yolcu-sayisi-guncelle` hâlâ `gemi_adi` bekliyor)

- [ ] **Step 4: `server.js`'e `sefer-sec` handler'ını ekle, mevcut handler'ları güncelle**

`soket.on('disconnect', ...)` bloğunun hemen üstüne ekle:
```js
    soket.on('sefer-sec', (bilgi, geriBildir) => {
        const seferId = Number(bilgi?.sefer_id);
        if (!Number.isInteger(seferId) || !aktifSeferler.has(seferId)) {
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz veya aktif olmayan sefer' });
            return;
        }
        if (soket.data.aktifSeferId) {
            soket.leave('sefer:' + soket.data.aktifSeferId);
        }
        soket.data.aktifSeferId = seferId;
        soket.join('sefer:' + seferId);
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });
```

`soket.on('acil-durum-baslat', ...)` handler'ının tamamını:
```js
    soket.on('acil-durum-baslat', (bilgi, geriBildir) => {
        if (!soket.data.kullanici) {
            console.log('KIMLIKSIZ baglanti ile acil-durum-baslat denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz' });
            return;
        }
        if (oturumSuresiDolduMu(soket)) {
            console.log('SURESI DOLMUS TOKEN ile acil-durum-baslat denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Oturum suresi doldu' });
            return;
        }
        if (!['kaptan', 'admin'].includes(soket.data.kullanici.rol)) {
            console.log('YETKISIZ ROL ile acil-durum-baslat denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz rol' });
            return;
        }
        const sefer = aktifSeferler.get(soket.data.aktifSeferId);
        if (!sefer) {
            console.log('SEFER SECILMEMIS ile acil-durum-baslat denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Sefer secilmedi' });
            return;
        }
        console.log('ACIL DURUM BASLATILDI:', { gemi: sefer.gemiAdi, seferId: soket.data.aktifSeferId });
        io.to('sefer:' + soket.data.aktifSeferId).emit('acil-durum-uyarisi', {
            mesaj: 'ACIL DURUM! Lutfen tahliye talimatlarini takip edin.',
            gemi: sefer.gemiAdi,
            zaman: new Date().toISOString()
        });
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });
```

şununla değiştir. `soket.on('acil-durum-bitir', ...)` handler'ının tamamını aynı desenle değiştir:
```js
    soket.on('acil-durum-bitir', (bilgi, geriBildir) => {
        if (!soket.data.kullanici) {
            console.log('KIMLIKSIZ baglanti ile acil-durum-bitir denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz' });
            return;
        }
        if (oturumSuresiDolduMu(soket)) {
            console.log('SURESI DOLMUS TOKEN ile acil-durum-bitir denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Oturum suresi doldu' });
            return;
        }
        if (!['kaptan', 'admin'].includes(soket.data.kullanici.rol)) {
            console.log('YETKISIZ ROL ile acil-durum-bitir denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz rol' });
            return;
        }
        const sefer = aktifSeferler.get(soket.data.aktifSeferId);
        if (!sefer) {
            console.log('SEFER SECILMEMIS ile acil-durum-bitir denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Sefer secilmedi' });
            return;
        }
        console.log('ACIL DURUM BITIRILDI:', { gemi: sefer.gemiAdi, seferId: soket.data.aktifSeferId });
        io.to('sefer:' + soket.data.aktifSeferId).emit('acil-durum-bitti', {
            mesaj: 'Acil durum sona erdi. Normal yolculuga devam ediliyor.',
            zaman: new Date().toISOString()
        });
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });
```

`soket.on('yolcu-sayisi-guncelle', ...)` handler'ının tamamını:
```js
    soket.on('yolcu-sayisi-guncelle', (bilgi, geriBildir) => {
        if (!soket.data.kullanici) {
            console.log('KIMLIKSIZ baglanti ile yolcu-sayisi-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz' });
            return;
        }
        const sefer = aktifSeferler.get(soket.data.aktifSeferId);
        if (!sefer) {
            console.log('SEFER SECILMEMIS ile yolcu-sayisi-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Sefer secilmedi' });
            return;
        }
        if (!sayiGecerliMi(bilgi?.sayi)) {
            console.log('GECERSIZ veri ile yolcu-sayisi-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz veri' });
            return;
        }
        console.log('YOLCU SAYISI GUNCELLENDI:', { sayi: bilgi.sayi, seferId: soket.data.aktifSeferId });
        io.to('sefer:' + soket.data.aktifSeferId).emit('yolcu-sayisi-yayin', { sayi: bilgi.sayi, gemi_adi: sefer.gemiAdi });
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });
```

- [ ] **Step 5: `gemiAdiGecerliMi` artık kullanılmıyor — ölü kodu temizle**

`server.js`'in require bloğundaki:
```js
const { gemiAdiGecerliMi, sayiGecerliMi } = require('./validation.js');
```
satırını:
```js
const { sayiGecerliMi } = require('./validation.js');
```
ile değiştir.

Doğrula: `grep -rn "gemiAdiGecerliMi" --include="*.js" . | grep -v node_modules` çıktısında sadece `validation.js` ve `validation.test.js` kalmalı.

`validation.js`'den `gemiAdiGecerliMi` fonksiyonunu ve export'unu kaldır:
```js
function gemiAdiGecerliMi(deger) {
    return typeof deger === 'string' && deger.trim().length > 0 && deger.length <= 100;
}

function sayiGecerliMi(deger) {
```
şununla değiştir:
```js
function sayiGecerliMi(deger) {
```

`module.exports = { gemiAdiGecerliMi, sayiGecerliMi };` satırını:
```js
module.exports = { sayiGecerliMi };
```
ile değiştir.

`validation.test.js`'den `describe('gemiAdiGecerliMi', ...)` bloğunun tamamını sil, `require` satırını güncelle:
```js
const { gemiAdiGecerliMi, sayiGecerliMi } = require('./validation.js');
```
şununla değiştir:
```js
const { sayiGecerliMi } = require('./validation.js');
```

- [ ] **Step 6: Testleri çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run server.test.js -t "yetkilendirmesi"`
Beklenen: PASS

Çalıştır: `npx vitest run validation.test.js`
Beklenen: PASS (4 test — sadece `sayiGecerliMi` grubu)

- [ ] **Step 7: Tüm test paketini çalıştır**

Çalıştır: `npm test`
Beklenen: Tüm testler PASS

- [ ] **Step 8: Commit**

```bash
git add server.js server.test.js validation.js validation.test.js
git commit -m "feat: socket.io sefer odalarini (sefer-sec) ve sefer-bazli yayinlari ekle"
```

---

### Task 8: Personel app — Sefer Başlat/Bitir ekranı

**Files:**
- Modify: `ido-navigasyon-personel/App.js`

**Interfaces:**
- Consumes: `GET /seferler/aktif`, `GET /gemiler`, `GET /hatlar`, `POST /sefer/baslat`, `POST /sefer/bitir` (Task 5), `sefer-sec` socket event'i (Task 7).
- Test altyapısı yok (Faz 1'de belirlenmiş proje kararı): bu görev manuel doğrulama ile tamamlanır.

Bu görevi uygulamadan önce `ido-navigasyon-personel/AGENTS.md`'de belirtilen https://docs.expo.dev/versions/v54.0.0/ dokümantasyonunu kontrol et (proje konvansiyonu).

- [ ] **Step 1: `App.js`'in tamamını aşağıdaki içerikle değiştir**

```js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, TextInput, ScrollView } from 'react-native';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const SUNUCU_ADRESI = process.env.EXPO_PUBLIC_SUNUCU_ADRESI || 'https://ido-navigasyon-backend.onrender.com';
const ERISIM_TOKEN_DEPO_ADI = 'personel_erisim_tokeni';
const YENILEME_TOKEN_DEPO_ADI = 'personel_yenileme_tokeni';

export default function App() {
  const [tokenYukleniyor, setTokenYukleniyor] = useState(true);
  const [erisimTokeni, setErisimTokeni] = useState(null);
  const [yenilemeTokeni, setYenilemeTokeni] = useState(null);
  const [kullaniciAdiGirisi, setKullaniciAdiGirisi] = useState('');
  const [sifreGirisi, setSifreGirisi] = useState('');
  const [girisYapiliyor, setGirisYapiliyor] = useState(false);
  const [girisHatasi, setGirisHatasi] = useState(null);
  const [baglantiDurumu, setBaglantiDurumu] = useState('Baglaniyor...');
  const [acilDurumAktif, setAcilDurumAktif] = useState(false);
  const [yolcuSayisi, setYolcuSayisi] = useState(0);

  const [ekran, setEkran] = useState('yukleniyor'); // yukleniyor | sefer-sec | sefer-baslat | panel
  const [aktifSeferler, setAktifSeferler] = useState([]);
  const [gemiler, setGemiler] = useState([]);
  const [hatlar, setHatlar] = useState([]);
  const [seciliSeferId, setSeciliSeferId] = useState(null);
  const [seciliGemiId, setSeciliGemiId] = useState(null);
  const [seciliHatId, setSeciliHatId] = useState(null);
  const [seferIslemiSuruyor, setSeferIslemiSuruyor] = useState(false);
  const [seferHatasi, setSeferHatasi] = useState(null);

  const soketRef = useRef(null);
  const yenilemeTokeniRef = useRef(null);

  useEffect(() => {
    yenilemeTokeniRef.current = yenilemeTokeni;
  }, [yenilemeTokeni]);

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync(ERISIM_TOKEN_DEPO_ADI),
      SecureStore.getItemAsync(YENILEME_TOKEN_DEPO_ADI),
    ])
      .then(([kayitliErisim, kayitliYenileme]) => {
        setErisimTokeni(kayitliErisim);
        setYenilemeTokeni(kayitliYenileme);
      })
      .catch(() => {
        setErisimTokeni(null);
        setYenilemeTokeni(null);
      })
      .finally(() => {
        setTokenYukleniyor(false);
      });
  }, []);

  async function oturumuKapat() {
    await SecureStore.deleteItemAsync(ERISIM_TOKEN_DEPO_ADI);
    await SecureStore.deleteItemAsync(YENILEME_TOKEN_DEPO_ADI);
    setErisimTokeni(null);
    setYenilemeTokeni(null);
    setSeciliSeferId(null);
    setEkran('yukleniyor');
  }

  async function erisimTokeniniYenile() {
    if (!yenilemeTokeniRef.current) return null;
    try {
      const yanit = await fetch(SUNUCU_ADRESI + '/token/yenile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yenilemeTokeni: yenilemeTokeniRef.current }),
      });
      if (!yanit.ok) return null;
      const veri = await yanit.json();
      await SecureStore.setItemAsync(ERISIM_TOKEN_DEPO_ADI, veri.erisimTokeni);
      setErisimTokeni(veri.erisimTokeni);
      return veri.erisimTokeni;
    } catch {
      return null;
    }
  }

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

  useEffect(() => {
    if (!erisimTokeni || !seciliSeferId) return;

    const soket = io(SUNUCU_ADRESI, { auth: { token: erisimTokeni } });
    soketRef.current = soket;

    soket.on('connect', () => {
      setBaglantiDurumu('Bagli');
      soket.emit('sefer-sec', { sefer_id: seciliSeferId }, (yanit) => {
        if (!yanit || !yanit.tamam) {
          Alert.alert('Hata', 'Sefer secilemedi. Lutfen tekrar deneyin.');
        }
      });
    });

    soket.on('disconnect', () => {
      setBaglantiDurumu('Baglanti kesildi');
    });

    soket.on('connect_error', async (hata) => {
      setBaglantiDurumu('Baglanti kesildi');
      if (hata && hata.message === 'Yetkisiz') {
        const yeniToken = await erisimTokeniniYenile();
        if (!yeniToken) {
          await oturumuKapat();
        }
      }
    });

    soket.on('sefer-bitti', () => {
      Alert.alert('Sefer Sona Erdi', 'Bu sefer baska bir kullanici tarafindan bitirildi.');
      setSeciliSeferId(null);
      setEkran('sefer-sec');
    });

    return () => {
      soket.disconnect();
    };
  }, [erisimTokeni, seciliSeferId]);

  async function girisYap() {
    const kullaniciAdi = kullaniciAdiGirisi.trim();
    const sifre = sifreGirisi;
    if (!kullaniciAdi || !sifre) {
      setGirisHatasi('Kullanici adi ve sifre zorunlu.');
      return;
    }

    setGirisYapiliyor(true);
    setGirisHatasi(null);
    try {
      const yanit = await fetch(SUNUCU_ADRESI + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kullanici_adi: kullaniciAdi, sifre }),
      });
      const veri = await yanit.json();
      if (!yanit.ok) {
        setGirisHatasi(veri.hata || 'Giris basarisiz.');
        return;
      }
      await SecureStore.setItemAsync(ERISIM_TOKEN_DEPO_ADI, veri.erisimTokeni);
      await SecureStore.setItemAsync(YENILEME_TOKEN_DEPO_ADI, veri.yenilemeTokeni);
      setErisimTokeni(veri.erisimTokeni);
      setYenilemeTokeni(veri.yenilemeTokeni);
      setSifreGirisi('');
    } catch {
      setGirisHatasi('Sunucuya ulasilamadi.');
    } finally {
      setGirisYapiliyor(false);
    }
  }

  async function seferBaslat() {
    if (!seciliGemiId || !seciliHatId) {
      setSeferHatasi('Gemi ve hat secmelisiniz.');
      return;
    }
    setSeferIslemiSuruyor(true);
    setSeferHatasi(null);
    try {
      const yanit = await fetch(SUNUCU_ADRESI + '/sefer/baslat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + erisimTokeni },
        body: JSON.stringify({ gemi_id: seciliGemiId, hat_id: seciliHatId }),
      });
      const veri = await yanit.json();
      if (!yanit.ok) {
        setSeferHatasi(veri.hata || 'Sefer baslatilamadi.');
        return;
      }
      setSeciliSeferId(veri.sefer_id);
      setEkran('panel');
    } catch {
      setSeferHatasi('Sunucuya ulasilamadi.');
    } finally {
      setSeferIslemiSuruyor(false);
    }
  }

  function seferSec(seferId) {
    setSeciliSeferId(seferId);
    setEkran('panel');
  }

  function seferiBitir() {
    Alert.alert('Seferi Bitir', 'Bu seferi bitirmek istediginizden emin misiniz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Evet, Bitir',
        onPress: async () => {
          try {
            const yanit = await fetch(SUNUCU_ADRESI + '/sefer/bitir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + erisimTokeni },
              body: JSON.stringify({ sefer_id: seciliSeferId }),
            });
            if (!yanit.ok) {
              const veri = await yanit.json();
              Alert.alert('Hata', veri.hata || 'Sefer bitirilemedi.');
              return;
            }
            setSeciliSeferId(null);
            setEkran('sefer-sec');
          } catch {
            Alert.alert('Hata', 'Sunucuya ulasilamadi.');
          }
        },
      },
    ]);
  }

  function acilDurumBaslat() {
    Alert.alert(
      'Acil Durum Baslat',
      'ACIL DURUM baslatmak istediginizden emin misiniz?',
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Evet, Baslat',
          style: 'destructive',
          onPress: () => {
            if (!soketRef.current) return;
            soketRef.current.emit('acil-durum-baslat', {}, (yanit) => {
              if (yanit && yanit.tamam) {
                setAcilDurumAktif(true);
              } else {
                Alert.alert('Hata', (yanit && yanit.hata) || 'Acil durum baslatilamadi.');
              }
            });
          },
        },
      ]
    );
  }

  function acilDurumBitir() {
    Alert.alert(
      'Acil Durumu Bitir',
      'Acil durumu bitirmek istediginizden emin misiniz?',
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Evet, Bitir',
          onPress: () => {
            if (!soketRef.current) return;
            soketRef.current.emit('acil-durum-bitir', {}, (yanit) => {
              if (yanit && yanit.tamam) {
                setAcilDurumAktif(false);
              } else {
                Alert.alert('Hata', (yanit && yanit.hata) || 'Acil durum bitirilemedi.');
              }
            });
          },
        },
      ]
    );
  }

  function yolcuSayisiDegistir(fark) {
    const oncekiSayi = yolcuSayisi;
    const yeniSayi = Math.max(0, yolcuSayisi + fark);
    setYolcuSayisi(yeniSayi);
    if (soketRef.current) {
      soketRef.current.emit('yolcu-sayisi-guncelle', { sayi: yeniSayi }, (yanit) => {
        if (!yanit || !yanit.tamam) {
          setYolcuSayisi(oncekiSayi);
          Alert.alert('Hata', (yanit && yanit.hata) || 'Yolcu sayisi guncellenemedi.');
        }
      });
    }
  }

  let icerik;

  if (tokenYukleniyor || ekran === 'yukleniyor') {
    icerik = (
      <View style={styles.govde}>
        <Text style={styles.etiket}>Yukleniyor...</Text>
      </View>
    );
  } else if (!erisimTokeni) {
    icerik = (
      <View style={styles.govde}>
        <View style={styles.durumKutusu}>
          <Text style={styles.etiket}>KULLANICI ADI</Text>
          <TextInput
            style={styles.anahtarGirisAlani}
            value={kullaniciAdiGirisi}
            onChangeText={setKullaniciAdiGirisi}
            placeholder="Kullanici adinizi girin"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.durumKutusu}>
          <Text style={styles.etiket}>SIFRE</Text>
          <TextInput
            style={styles.anahtarGirisAlani}
            value={sifreGirisi}
            onChangeText={setSifreGirisi}
            placeholder="Sifrenizi girin"
            secureTextEntry
            autoCapitalize="none"
          />
        </View>
        {girisHatasi ? <Text style={styles.hataYazisi}>{girisHatasi}</Text> : null}
        <TouchableOpacity
          style={[styles.buyukButon, styles.bitirButon, girisYapiliyor && styles.pasifButon]}
          onPress={girisYap}
          disabled={girisYapiliyor}
        >
          <Text style={styles.buyukButonYazi}>{girisYapiliyor ? 'GIRIS YAPILIYOR...' : 'GIRIS YAP'}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (ekran === 'sefer-sec') {
    icerik = (
      <ScrollView style={styles.govde}>
        <Text style={styles.etiket}>AKTIF SEFERLER</Text>
        {aktifSeferler.length === 0 ? (
          <Text style={styles.degerYazi}>Su an aktif bir sefer yok.</Text>
        ) : (
          aktifSeferler.map((sefer) => (
            <TouchableOpacity key={sefer.sefer_id} style={styles.durumKutusu} onPress={() => seferSec(sefer.sefer_id)}>
              <Text style={styles.degerYazi}>{sefer.gemi_adi}</Text>
              <Text style={styles.etiket}>{sefer.hat_adi}</Text>
            </TouchableOpacity>
          ))
        )}
        <TouchableOpacity style={[styles.buyukButon, styles.baslatButon]} onPress={() => setEkran('sefer-baslat')}>
          <Text style={styles.buyukButonYazi}>YENI SEFER BASLAT</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.anahtarDegistirButon} onPress={oturumuKapat}>
          <Text style={styles.anahtarDegistirYazi}>Cikis Yap</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  } else if (ekran === 'sefer-baslat') {
    icerik = (
      <ScrollView style={styles.govde}>
        <Text style={styles.etiket}>GEMI SECIN</Text>
        {gemiler.map((gemi) => (
          <TouchableOpacity
            key={gemi.id}
            style={[styles.durumKutusu, seciliGemiId === gemi.id && styles.seciliKutu]}
            onPress={() => setSeciliGemiId(gemi.id)}
          >
            <Text style={styles.degerYazi}>{gemi.ad}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.etiket}>HAT SECIN</Text>
        {hatlar.map((hat) => (
          <TouchableOpacity
            key={hat.id}
            style={[styles.durumKutusu, seciliHatId === hat.id && styles.seciliKutu]}
            onPress={() => setSeciliHatId(hat.id)}
          >
            <Text style={styles.degerYazi}>{hat.ad}</Text>
          </TouchableOpacity>
        ))}
        {seferHatasi ? <Text style={styles.hataYazisi}>{seferHatasi}</Text> : null}
        <TouchableOpacity
          style={[styles.buyukButon, styles.baslatButon, seferIslemiSuruyor && styles.pasifButon]}
          onPress={seferBaslat}
          disabled={seferIslemiSuruyor}
        >
          <Text style={styles.buyukButonYazi}>{seferIslemiSuruyor ? 'BASLATILIYOR...' : 'SEFERI BASLAT'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.anahtarDegistirButon} onPress={() => setEkran('sefer-sec')}>
          <Text style={styles.anahtarDegistirYazi}>Geri</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  } else {
    icerik = (
      <View style={styles.govde}>
        <View style={styles.durumKutusu}>
          <Text style={styles.etiket}>BAGLANTI DURUMU</Text>
          <View style={styles.satirIci}>
            <View
              style={[
                styles.durumNoktasi,
                { backgroundColor: baglantiDurumu === 'Bagli' ? '#2E7D32' : '#C62828' },
              ]}
            />
            <Text style={styles.degerYazi}>{baglantiDurumu}</Text>
          </View>
        </View>

        <View style={styles.durumKutusu}>
          <Text style={styles.etiket}>ACIL DURUM STATUSU</Text>
          <Text
            style={[
              styles.acilDurumYazisi,
              { color: acilDurumAktif ? '#C62828' : '#2E7D32' },
            ]}
          >
            {acilDurumAktif ? 'AKTIF ACIL DURUM VAR' : 'NORMAL'}
          </Text>
        </View>

        <View style={styles.durumKutusu}>
          <Text style={styles.etiket}>ENGELLI YOLCU SAYISI</Text>
          <View style={styles.sayacSatiri}>
            <TouchableOpacity style={styles.sayacButon} onPress={() => yolcuSayisiDegistir(-1)}>
              <Text style={styles.sayacButonYazi}>-</Text>
            </TouchableOpacity>
            <Text style={styles.sayacDeger}>{yolcuSayisi}</Text>
            <TouchableOpacity style={styles.sayacButon} onPress={() => yolcuSayisiDegistir(1)}>
              <Text style={styles.sayacButonYazi}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.buyukButon, styles.baslatButon, acilDurumAktif && styles.pasifButon]}
          onPress={acilDurumBaslat}
          disabled={acilDurumAktif}
        >
          <Text style={styles.buyukButonYazi}>ACIL DURUM BASLAT</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.buyukButon, styles.bitirButon, !acilDurumAktif && styles.pasifButon]}
          onPress={acilDurumBitir}
          disabled={!acilDurumAktif}
        >
          <Text style={styles.buyukButonYazi}>ACIL DURUMU BITIR</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.buyukButon, styles.bitirButon]} onPress={seferiBitir}>
          <Text style={styles.buyukButonYazi}>SEFERI BITIR</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.anahtarDegistirButon} onPress={oturumuKapat}>
          <Text style={styles.anahtarDegistirYazi}>Cikis Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.disKapsayici}>
      <StatusBar barStyle="light-content" backgroundColor="#0D3B66" />
      {ekran === 'panel' && erisimTokeni ? (
        <View style={styles.ustCubuk}>
          <Text style={styles.ustCubukBaslik}>Personel Paneli</Text>
          <Text style={styles.ustCubukAltBaslik}>IDO Engelsiz Navigasyon</Text>
        </View>
      ) : null}
      {icerik}
    </View>
  );
}

const styles = StyleSheet.create({
  disKapsayici: { flex: 1, backgroundColor: '#0D3B66' },
  ustCubuk: {
    backgroundColor: '#0D3B66',
    paddingTop: 55,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 3,
    borderBottomColor: '#1E6091',
  },
  ustCubukBaslik: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold' },
  ustCubukAltBaslik: { color: '#CDE3F0', fontSize: 13, marginTop: 4 },
  govde: { flex: 1, backgroundColor: '#F4F8FB', padding: 20 },
  durumKutusu: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 10,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#1E6091',
  },
  seciliKutu: { borderLeftColor: '#2E7D32', borderLeftWidth: 6 },
  anahtarGirisAlani: {
    borderWidth: 1,
    borderColor: '#5B7A8F',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#0D3B66',
  },
  hataYazisi: { color: '#C62828', marginBottom: 12, fontSize: 13 },
  etiket: { fontSize: 12, fontWeight: 'bold', color: '#5B7A8F', letterSpacing: 0.5, marginBottom: 6 },
  degerYazi: { fontSize: 16, color: '#0D3B66', fontWeight: '500' },
  satirIci: { flexDirection: 'row', alignItems: 'center' },
  durumNoktasi: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  acilDurumYazisi: { fontSize: 17, fontWeight: 'bold' },
  sayacSatiri: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  sayacButon: { backgroundColor: '#0D3B66', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sayacButonYazi: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  sayacDeger: { fontSize: 28, fontWeight: 'bold', color: '#0D3B66', marginHorizontal: 30 },
  buyukButon: {
    padding: 22,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  baslatButon: { backgroundColor: '#B71C1C' },
  bitirButon: { backgroundColor: '#2E7D32' },
  pasifButon: { backgroundColor: '#B0BEC5' },
  buyukButonYazi: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  anahtarDegistirButon: { marginTop: 20, alignItems: 'center', padding: 8 },
  anahtarDegistirYazi: { color: '#5B7A8F', fontSize: 13, textDecorationLine: 'underline' },
});
```

- [ ] **Step 2: Manuel doğrulama — sefer başlatma ve seçme akışı**

`db/gemiler_hatlar_seferler_seed.sql` uygulanmış olmalı (Task 1). Backend'i çalıştır (`npm start`), Expo'da personel app'i başlat (`npm start` — `ido-navigasyon-personel` içinde), giriş yap. "Aktif Seferler" ekranında sefer yoksa "Yeni Sefer Baslat" ile gemi+hat seçip başlat; ana panelin açıldığını doğrula. Uygulamayı kapat-aç, giriş yap, artık başlattığın seferin "Aktif Seferler" listesinde göründüğünü ve seçilince doğrudan panele gittiğini doğrula.

- [ ] **Step 3: Manuel doğrulama — sefer bitirme**

Ana panelde "SEFERI BITIR"e bas, onaylayınca "Aktif Seferler" ekranına döndüğünü ve backend loglarında `SEFER SIFIRLANDI`/sefer bitirme mesajının göründüğünü doğrula.

- [ ] **Step 4: Manuel doğrulama — rol bazlı yetkilendirme (Faz 1'den değişmedi, regresyon kontrolü)**

`personel` rolüyle oluşturulmuş bir kullanıcıyla giriş yapıp bir sefer seçtikten sonra "ACIL DURUM BASLAT"a basıldığında sunucudan "Yetkisiz rol" hatası döndüğünü doğrula. `kaptan` rolüyle aynı işlemin başarılı olduğunu doğrula.

- [ ] **Step 5: Commit**

```bash
git add ido-navigasyon-personel/App.js
git commit -m "feat: personel app'e sefer baslatma/secme/bitirme ekranlari ekle"
```

---

### Task 9: Yolcu app — sefer seçim ekranı

**Files:**
- Modify: `ido-navigasyon-mobil-v3/App.js`

**Interfaces:**
- Consumes: `GET /seferler/aktif` (Task 5), `sefer-sec` socket event'i, `sefer-bitti` socket event'i (Task 7), `GET /tum-noktalar?sefer_id=`, `GET /hava-durumu?sefer_id=` (Task 6).
- Test altyapısı yok (Faz 1'de belirlenmiş proje kararı): bu görev manuel doğrulama ile tamamlanır.

Bu görevi uygulamadan önce `ido-navigasyon-mobil-v3/AGENTS.md`'de belirtilen https://docs.expo.dev/versions/v54.0.0/ dokümantasyonunu kontrol et (proje konvansiyonu). Bu dosya büyük (759 satır, 24 `useState`) — Faz 6'nın kapsamı olan genel bir yeniden yapılanma **yapılmaz**; sadece aşağıdaki hedefli değişiklikler uygulanır.

- [ ] **Step 1: Yeni state'leri ekle**

`App.js`'deki:
```js
  const [tanitimGoster, setTanitimGoster] = useState(false);
  const [tanitimIndex, setTanitimIndex] = useState(0);
  const [tanitimYuklendi, setTanitimYuklendi] = useState(false);

  const webViewRef = useRef(null);
```

şununla değiştir:
```js
  const [tanitimGoster, setTanitimGoster] = useState(false);
  const [tanitimIndex, setTanitimIndex] = useState(0);
  const [tanitimYuklendi, setTanitimYuklendi] = useState(false);
  const [aktifSeferler, setAktifSeferler] = useState([]);
  const [seciliSeferId, setSeciliSeferId] = useState(null);
  const [seferlerYukleniyor, setSeferlerYukleniyor] = useState(true);

  const webViewRef = useRef(null);
```

- [ ] **Step 2: Aktif seferleri açılışta çek**

`App.js`'deki (AsyncStorage'dan favoriler/tanitimGorundu okuyan effect'in hemen altına, `function tanitimiKapat()`'tan önce) ekle:
```js
  useEffect(() => {
    fetch(SUNUCU_ADRESI + '/seferler/aktif')
      .then((yanit) => yanit.json())
      .then((veri) => setAktifSeferler(veri))
      .catch(() => setAktifSeferler([]))
      .finally(() => setSeferlerYukleniyor(false));
  }, []);

```

- [ ] **Step 3: Ana socket effect'ini sefer seçimine bağla**

`App.js`'deki büyük `useEffect(() => { Notifications.requestPermissionsAsync(); ... }, []);` bloğunun başındaki:
```js
  useEffect(() => {
    Notifications.requestPermissionsAsync();

    fetch(SUNUCU_ADRESI + '/tum-noktalar')
```

şununla değiştir:
```js
  useEffect(() => {
    if (!seciliSeferId) return;

    Notifications.requestPermissionsAsync();

    fetch(SUNUCU_ADRESI + '/tum-noktalar?sefer_id=' + seciliSeferId)
```

Aynı effect içindeki `havaDurumuCek` fonksiyonunu:
```js
    function havaDurumuCek() {
      fetch(SUNUCU_ADRESI + '/hava-durumu')
```

şununla değiştir:
```js
    function havaDurumuCek() {
      fetch(SUNUCU_ADRESI + '/hava-durumu?sefer_id=' + seciliSeferId)
```

Aynı effect içinde `const soket = io(SUNUCU_ADRESI);` satırının hemen altına, `soket.on('connect', ...)` bloğundan önce, `connect` handler'ı içine sefer-sec ekle — `soket.on('connect', () => { setBaglantiDurumu('Bagli'); });` satırını:
```js
    soket.on('connect', () => {
      setBaglantiDurumu('Bagli');
    });
```

şununla değiştir:
```js
    soket.on('connect', () => {
      setBaglantiDurumu('Bagli');
      soket.emit('sefer-sec', { sefer_id: seciliSeferId }, (yanit) => {
        if (!yanit || !yanit.tamam) {
          setSeciliSeferId(null);
        }
      });
    });
```

`soket.on('varis-bildirimi', ...)` bloğunun hemen altına, `return () => { soket.disconnect(); ...}` bloğundan önce ekle:
```js
    soket.on('sefer-bitti', () => {
      gecmiseEkle('Sefer sona erdi.');
      setSeciliSeferId(null);
    });

```

Effect'in en sonundaki bağımlılık dizisini:
```js
  }, []);
```
(bu, `return () => { soket.disconnect(); Vibration.cancel(); clearInterval(havaDurumuAralik); };`'dan hemen sonraki satırdır)

şununla değiştir:
```js
  }, [seciliSeferId]);
```

- [ ] **Step 4: Sefer seçim ekranını render'a ekle**

`App.js`'deki ana `return (` satırının hemen üstüne (bu satırdan önce, component fonksiyonunun içinde) ekle:
```js
  if (seferlerYukleniyor) {
    return (
      <View style={[styles.disKapsayici, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor={karanlikMod ? '#0B1520' : '#0D3B66'} />
        <Text style={{ color: 'white', fontSize: 16 }}>Yukleniyor...</Text>
      </View>
    );
  }

  if (!seciliSeferId) {
    return (
      <View style={styles.disKapsayici}>
        <StatusBar barStyle="light-content" backgroundColor={karanlikMod ? '#0B1520' : '#0D3B66'} />
        <View style={{ flex: 1, padding: 24, paddingTop: 80 }}>
          <Text style={{ color: 'white', fontSize: 22, fontWeight: 'bold', marginBottom: 20 }}>Hangi gemiyi takip ediyorsun?</Text>
          {aktifSeferler.length === 0 ? (
            <Text style={{ color: '#CDE3F0', fontSize: 15 }}>Su an aktif bir sefer yok.</Text>
          ) : (
            aktifSeferler.map((sefer) => (
              <TouchableOpacity
                key={sefer.sefer_id}
                style={{ backgroundColor: '#FFFFFF', padding: 18, borderRadius: 10, marginBottom: 12 }}
                onPress={() => setSeciliSeferId(sefer.sefer_id)}
              >
                <Text style={{ color: '#0D3B66', fontSize: 17, fontWeight: 'bold' }}>{sefer.gemi_adi}</Text>
                <Text style={{ color: '#5B7A8F', fontSize: 13, marginTop: 4 }}>{sefer.hat_adi}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    );
  }

```

- [ ] **Step 5: Manuel doğrulama — sefer seçim akışı**

`db/gemiler_hatlar_seferler_seed.sql` uygulanmış ve personel app'ten (Task 8) bir sefer başlatılmış olmalı. Backend'i çalıştır, Expo'da yolcu app'i başlat. "Hangi gemiyi takip ediyorsun?" ekranında aktif seferin listelendiğini doğrula. Seçince harita/durum ekranının açıldığını, gemi konumunun güncellenmeye başladığını doğrula.

- [ ] **Step 6: Manuel doğrulama — sefer bitince otomatik geri dönüş**

Personel app'ten (veya `POST /sefer/bitir` ile doğrudan) seferi bitir; yolcu app'in otomatik olarak seçim ekranına döndüğünü doğrula.

- [ ] **Step 7: Commit**

```bash
git add ido-navigasyon-mobil-v3/App.js
git commit -m "feat: yolcu app'e sefer secim ekrani ekle"
```

---

## Faz 2 Tamamlandığında

- [ ] `npm test` (backend) tüm testleri yeşil geçiyor.
- [ ] `gemiler`, `hatlar`, `rota_noktalari`, `seferler` tabloları DB'de mevcut; en az bir gemi/hat/rota noktası seed edilmiş.
- [ ] `POST /sefer/baslat` ve `POST /sefer/bitir` çalışıyor, aynı gemi için ikinci bir aktif sefer 409 dönüyor.
- [ ] `GET /seferler/aktif`, `GET /gemiler`, `GET /hatlar` auth'suz çalışıyor.
- [ ] Socket.io yayınları (`gemi-konum-guncelleme`, `acil-durum-uyarisi`, `acil-durum-bitti`, `yolcu-sayisi-yayin`, `varis-bildirimi`) sadece ilgili seferin odasına gidiyor; farklı seferler birbirinin yayınını görmüyor.
- [ ] Personel app'te "Sefer Başlat/Seç/Bitir" akışı çalışıyor.
- [ ] Yolcu app'te sefer seçim ekranı çalışıyor, sefer bitince otomatik seçim ekranına dönüyor.
- [ ] Roadmap dosyasında (`2026-08-07-profesyonellesme-yol-haritasi.md`) Faz 2 tamamlandı olarak işaretlendi.
