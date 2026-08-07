# Faz 1 — Gerçek Kimlik Doğrulama & Yetkilendirme Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ido-navigasyon-backend` ve `ido-navigasyon-personel`'de Faz 0'ın geçici paylaşılan-anahtar (`PERSONEL_ANAHTARI`) modelini, veritabanı destekli kullanıcı hesapları + JWT tabanlı gerçek kimlik doğrulama ve rol bazlı yetkilendirme ile değiştirmek.

**Architecture:** Kullanıcı adı/şifre ile giriş yapan personel, kısa ömürlü bir erişim tokeni (15dk) ve uzun ömürlü bir yenileme tokeni (7 gün) alır. REST uçları `Authorization: Bearer` başlığıyla, Socket.io bağlantıları `handshake.auth.token` ile doğrulanır. Acil durum başlatma/bitirme sadece `kaptan`/`admin` rolüne, yolcu sayısı güncelleme herhangi bir kimliği doğrulanmış personele açık.

**Tech Stack:** `bcryptjs` (şifre hashleme, native derleme gerektirmez), `jsonwebtoken` (JWT), mevcut Vitest + Supertest + `socket.io-client` test altyapısı, PostgreSQL (`pg`).

## Global Constraints

- Backend üretim kodu CommonJS (`require`/`module.exports`) kalacak. Mevcut test dosyaları (`cors.test.js`, `server.test.js`) `import { describe, it, expect } from 'vitest'` + `require(...)` karışımı kullanıyor — bu zaten kurulu de facto konvansiyon; yeni test dosyaları da bunu izleyecek.
- Değişken/fonksiyon isimlendirmesi Türkçe kalacak (`sifreHashle`, `erisimTokeniOlustur` gibi).
- JWT gizli anahtarı `JWT_GIZLI_ANAHTARI` ortam değişkeninden okunur, koda asla gömülmez.
- Şifreler düz metin olarak hiçbir zaman DB'ye yazılmaz veya loglanmaz.
- Bu faz `PERSONEL_ANAHTARI` paylaşılan-anahtar modelini (Faz 0'da eklenen geçici sertleştirme) tamamen ortadan kaldırır — son görev bu temizliği yapar.
- `ido-navigasyon-mobil-v3` (yolcu app) bu fazda değişmez.
- Repoda migration aracı yok; DB şema değişiklikleri elle (`psql` veya başka bir PG istemcisiyle) uygulanır — bu konvansiyon korunuyor, yeni bir migration aracı eklenmiyor.

---

### Task 1: Şifre hashleme yardımcı fonksiyonu (`sifreYardimcisi.js`)

**Files:**
- Create: `sifreYardimcisi.js`
- Test: `sifreYardimcisi.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `sifreHashle(duzMetin) -> Promise<string>`, `sifreDogrula(duzMetin, hash) -> Promise<boolean>` — Task 4 ve Task 5 tarafından kullanılacak.

- [ ] **Step 1: `bcryptjs`'i bağımlılık olarak kur**

Çalıştır: `npm install --save bcryptjs` (proje kökünde, `ido-navigasyon-backend` içinde)

- [ ] **Step 2: Başarısız testi yaz**

`sifreYardimcisi.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { sifreHashle, sifreDogrula } = require('./sifreYardimcisi.js');

describe('sifreHashle', () => {
    it('duz metinden farkli bir hash uretir', async () => {
        const hash = await sifreHashle('gizli-sifre-123');
        expect(hash).not.toBe('gizli-sifre-123');
        expect(hash.length).toBeGreaterThan(20);
    });
});

describe('sifreDogrula', () => {
    it('dogru sifre ile hash eslesirse true doner', async () => {
        const hash = await sifreHashle('gizli-sifre-123');
        expect(await sifreDogrula('gizli-sifre-123', hash)).toBe(true);
    });

    it('yanlis sifre ile hash eslesmezse false doner', async () => {
        const hash = await sifreHashle('gizli-sifre-123');
        expect(await sifreDogrula('baska-sifre', hash)).toBe(false);
    });
});
```

- [ ] **Step 3: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run sifreYardimcisi.test.js`
Beklenen: FAIL — `Cannot find module './sifreYardimcisi.js'`

- [ ] **Step 4: `sifreYardimcisi.js`'i yaz**

```js
const bcrypt = require('bcryptjs');

const TUR_SAYISI = 10;

async function sifreHashle(duzMetin) {
    return bcrypt.hash(duzMetin, TUR_SAYISI);
}

async function sifreDogrula(duzMetin, hash) {
    return bcrypt.compare(duzMetin, hash);
}

module.exports = { sifreHashle, sifreDogrula };
```

- [ ] **Step 5: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run sifreYardimcisi.test.js`
Beklenen: PASS (3 test)

- [ ] **Step 6: Commit**

```bash
git add sifreYardimcisi.js sifreYardimcisi.test.js package.json package-lock.json
git commit -m "feat: sifre hashleme yardimci fonksiyonlari ekle (bcryptjs)"
```

---

### Task 2: JWT yardımcı fonksiyonları (`jwtYardimcisi.js`)

**Files:**
- Create: `jwtYardimcisi.js`
- Test: `jwtYardimcisi.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `erisimTokeniOlustur(payload, gizliAnahtar) -> string`, `yenilemeTokeniOlustur(payload, gizliAnahtar) -> string`, `tokenDogrula(token, gizliAnahtar) -> object|null` — Task 5, 6, 7, 8 tarafından kullanılacak.

- [ ] **Step 1: `jsonwebtoken`'i bağımlılık olarak kur**

Çalıştır: `npm install --save jsonwebtoken`

- [ ] **Step 2: Başarısız testi yaz**

`jwtYardimcisi.test.js`:
```js
import { describe, it, expect } from 'vitest';
const { erisimTokeniOlustur, yenilemeTokeniOlustur, tokenDogrula } = require('./jwtYardimcisi.js');

const TEST_ANAHTARI = 'test-jwt-gizli-anahtari';

describe('erisimTokeniOlustur ve tokenDogrula', () => {
    it('olusturulan token dogrulandiginda ayni payload i doner', () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, TEST_ANAHTARI);
        const payload = tokenDogrula(token, TEST_ANAHTARI);
        expect(payload.id).toBe(1);
        expect(payload.kullanici_adi).toBe('kaptan1');
        expect(payload.rol).toBe('kaptan');
    });

    it('yanlis anahtarla dogrulanan token null doner', () => {
        const token = erisimTokeniOlustur({ id: 1 }, TEST_ANAHTARI);
        expect(tokenDogrula(token, 'baska-anahtar')).toBeNull();
    });

    it('bozuk token null doner', () => {
        expect(tokenDogrula('bozuk.token.degeri', TEST_ANAHTARI)).toBeNull();
    });
});

describe('yenilemeTokeniOlustur', () => {
    it('olusturulan yenileme tokeni dogrulanabilir', () => {
        const token = yenilemeTokeniOlustur({ id: 1 }, TEST_ANAHTARI);
        const payload = tokenDogrula(token, TEST_ANAHTARI);
        expect(payload.id).toBe(1);
    });
});
```

- [ ] **Step 3: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run jwtYardimcisi.test.js`
Beklenen: FAIL — `Cannot find module './jwtYardimcisi.js'`

- [ ] **Step 4: `jwtYardimcisi.js`'i yaz**

```js
const jwt = require('jsonwebtoken');

const ERISIM_TOKEN_OMRU = '15m';
const YENILEME_TOKEN_OMRU = '7d';

function erisimTokeniOlustur(payload, gizliAnahtar) {
    return jwt.sign(payload, gizliAnahtar, { expiresIn: ERISIM_TOKEN_OMRU });
}

function yenilemeTokeniOlustur(payload, gizliAnahtar) {
    return jwt.sign(payload, gizliAnahtar, { expiresIn: YENILEME_TOKEN_OMRU });
}

function tokenDogrula(token, gizliAnahtar) {
    try {
        return jwt.verify(token, gizliAnahtar);
    } catch (hata) {
        return null;
    }
}

module.exports = { erisimTokeniOlustur, yenilemeTokeniOlustur, tokenDogrula };
```

- [ ] **Step 5: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run jwtYardimcisi.test.js`
Beklenen: PASS (4 test)

- [ ] **Step 6: Commit**

```bash
git add jwtYardimcisi.js jwtYardimcisi.test.js package.json package-lock.json
git commit -m "feat: JWT erisim/yenileme tokeni yardimci fonksiyonlari ekle"
```

---

### Task 3: Personel hesapları DB şeması ve repo katmanı

**Files:**
- Create: `db/personel_hesaplari.sql`
- Create: `personelRepo.js`
- Test: `personelRepo.test.js`

**Interfaces:**
- Produces: `kullaniciAdiylaBul(havuz, kullaniciAdi) -> Promise<{id, kullanici_adi, sifre_hash, rol}|null>` — Task 5 tarafından kullanılacak.

- [ ] **Step 1: Şema dosyasını yaz**

`db/personel_hesaplari.sql`:
```sql
CREATE TABLE IF NOT EXISTS personel_hesaplari (
    id SERIAL PRIMARY KEY,
    kullanici_adi TEXT NOT NULL UNIQUE,
    sifre_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('personel', 'kaptan', 'admin')),
    olusturulma_zamani TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Şemayı gerçek veritabanına elle uygula**

Çalıştır (proje kökünde `.env`'deki `DATABASE_URL` ile): `psql "$DATABASE_URL" -f db/personel_hesaplari.sql`

Bu adım gerçek bir Postgres bağlantısı gerektirir ve bu plan yazılırken otomatik doğrulanamaz — insan operatör tarafından manuel çalıştırılmalı. `ilgi_noktalari` tablosu da aynı şekilde elle oluşturulmuştu, bu konvansiyon korunuyor.

- [ ] **Step 3: Başarısız testi yaz**

`personelRepo.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
const { kullaniciAdiylaBul } = require('./personelRepo.js');

describe('kullaniciAdiylaBul', () => {
    it('dogru SQL ve parametre ile sorgu calistirir, bulunan satiri doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({
                rows: [{ id: 1, kullanici_adi: 'kaptan1', sifre_hash: 'hash', rol: 'kaptan' }]
            })
        };
        const sonuc = await kullaniciAdiylaBul(sahteHavuz, 'kaptan1');

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'SELECT id, kullanici_adi, sifre_hash, rol FROM personel_hesaplari WHERE kullanici_adi = $1',
            ['kaptan1']
        );
        expect(sonuc).toEqual({ id: 1, kullanici_adi: 'kaptan1', sifre_hash: 'hash', rol: 'kaptan' });
    });

    it('kullanici bulunamazsa null doner', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        const sonuc = await kullaniciAdiylaBul(sahteHavuz, 'olmayan-kullanici');
        expect(sonuc).toBeNull();
    });
});
```

- [ ] **Step 4: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run personelRepo.test.js`
Beklenen: FAIL — `Cannot find module './personelRepo.js'`

- [ ] **Step 5: `personelRepo.js`'i yaz**

```js
async function kullaniciAdiylaBul(havuz, kullaniciAdi) {
    const sonuc = await havuz.query(
        'SELECT id, kullanici_adi, sifre_hash, rol FROM personel_hesaplari WHERE kullanici_adi = $1',
        [kullaniciAdi]
    );
    return sonuc.rows[0] || null;
}

module.exports = { kullaniciAdiylaBul };
```

- [ ] **Step 6: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run personelRepo.test.js`
Beklenen: PASS (2 test)

- [ ] **Step 7: Commit**

```bash
git add db/personel_hesaplari.sql personelRepo.js personelRepo.test.js
git commit -m "feat: personel_hesaplari DB semasi ve repo katmani ekle"
```

---

### Task 4: İlk kullanıcı ekleme CLI script'i

**Files:**
- Create: `scripts/personel-ekle.js`
- Test: `scripts/personel-ekle.test.js`

**Interfaces:**
- Consumes: `sifreHashle` (Task 1).
- Produces: `kullaniciEkle(havuz, kullaniciAdi, sifre, rol) -> Promise<void>` — script'in kendi CLI giriş noktası tarafından ve testler tarafından kullanılır.

- [ ] **Step 1: Başarısız testi yaz**

`scripts/personel-ekle.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
const { kullaniciEkle } = require('./personel-ekle.js');

describe('kullaniciEkle', () => {
    it('gecerli rol icin havuz.query yi hashlenmis sifreyle cagirir', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({}) };
        await kullaniciEkle(sahteHavuz, 'kaptan1', 'gizli-sifre-123', 'kaptan');

        expect(sahteHavuz.query).toHaveBeenCalledTimes(1);
        const [sql, parametreler] = sahteHavuz.query.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO personel_hesaplari/);
        expect(parametreler[0]).toBe('kaptan1');
        expect(parametreler[1]).not.toBe('gizli-sifre-123');
        expect(parametreler[2]).toBe('kaptan');
    });

    it('gecersiz rol icin hata firlatir ve havuz.query cagrilmaz', async () => {
        const sahteHavuz = { query: vi.fn() };
        await expect(kullaniciEkle(sahteHavuz, 'x', 'y', 'patron')).rejects.toThrow();
        expect(sahteHavuz.query).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run scripts/personel-ekle.test.js`
Beklenen: FAIL — `Cannot find module './personel-ekle.js'`

- [ ] **Step 3: `scripts/personel-ekle.js`'i yaz**

```js
require('dotenv').config();
const { Pool } = require('pg');
const { sifreHashle } = require('../sifreYardimcisi.js');

const GECERLI_ROLLER = ['personel', 'kaptan', 'admin'];

async function kullaniciEkle(havuz, kullaniciAdi, sifre, rol) {
    if (!GECERLI_ROLLER.includes(rol)) {
        throw new Error(`Rol ${GECERLI_ROLLER.join(', ')} degerlerinden biri olmali.`);
    }
    const hash = await sifreHashle(sifre);
    await havuz.query(
        'INSERT INTO personel_hesaplari (kullanici_adi, sifre_hash, rol) VALUES ($1, $2, $3)',
        [kullaniciAdi, hash, rol]
    );
}

async function main() {
    const [kullaniciAdi, sifre, rol] = process.argv.slice(2);
    if (!kullaniciAdi || !sifre || !rol) {
        console.error('Kullanim: node scripts/personel-ekle.js <kullanici_adi> <sifre> <rol>');
        process.exitCode = 1;
        return;
    }

    const havuz = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true }
    });

    try {
        await kullaniciEkle(havuz, kullaniciAdi, sifre, rol);
        console.log(`Kullanici olusturuldu: ${kullaniciAdi} (${rol})`);
    } catch (hata) {
        console.error('Kullanici olusturulamadi:', hata.message);
        process.exitCode = 1;
    } finally {
        await havuz.end();
    }
}

if (require.main === module) {
    main();
}

module.exports = { kullaniciEkle, GECERLI_ROLLER };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run scripts/personel-ekle.test.js`
Beklenen: PASS (2 test)

- [ ] **Step 5: Commit**

```bash
git add scripts/personel-ekle.js scripts/personel-ekle.test.js
git commit -m "feat: ilk personel hesabini olusturmak icin CLI script ekle"
```

---

### Task 5: Login endpoint (`POST /login`)

**Files:**
- Modify: `server.js`
- Modify: `server.test.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `sifreDogrula` (Task 1), `erisimTokeniOlustur`/`yenilemeTokeniOlustur` (Task 2), `kullaniciAdiylaBul` (Task 3).
- Produces: `POST /login` — `{ kullanici_adi, sifre } -> { erisimTokeni, yenilemeTokeni, rol }` (200) veya `{ hata }` (400/401). Task 10 (client) tarafından kullanılacak.

- [ ] **Step 1: `.env.example`'a `JWT_GIZLI_ANAHTARI` ekle**

`.env.example`'a şu satırı `PERSONEL_ANAHTARI` satırının altına ekle:
```
JWT_GIZLI_ANAHTARI=jwt-imzalama-icin-uzun-rastgele-bir-deger
```

(`PERSONEL_ANAHTARI` satırı Task 9'da kaldırılacak — o zamana kadar hem eski hem yeni mekanizma bir arada çalışıyor.)

- [ ] **Step 2: `server.test.js`'in başına test ortamı değişkenini ekle**

`server.test.js`'in en üstündeki `process.env` atamalarına ekle:
```js
process.env.JWT_GIZLI_ANAHTARI = 'test-jwt-gizli-anahtari';
```

- [ ] **Step 3: Başarısız testi yaz**

`server.test.js`'e, `describe('POST /reset-gemi', ...)` bloğundan önce ekle:
```js
const { sifreHashle } = require('./sifreYardimcisi.js');

describe('POST /login', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('kullanici bulunamazsa 401 doner ve genel mesaj verir', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rows: [] });
        const yanit = await request(app).post('/login').send({ kullanici_adi: 'yok', sifre: 'x' });
        expect(yanit.status).toBe(401);
        expect(yanit.body).toEqual({ hata: 'Gecersiz kullanici adi veya sifre' });
    });

    it('yanlis sifre ile 401 doner', async () => {
        const hash = await sifreHashle('dogru-sifre');
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({
            rows: [{ id: 1, kullanici_adi: 'kaptan1', sifre_hash: hash, rol: 'kaptan' }]
        });
        const yanit = await request(app).post('/login').send({ kullanici_adi: 'kaptan1', sifre: 'yanlis-sifre' });
        expect(yanit.status).toBe(401);
    });

    it('dogru bilgilerle token ciftini ve rolu doner', async () => {
        const hash = await sifreHashle('dogru-sifre');
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({
            rows: [{ id: 1, kullanici_adi: 'kaptan1', sifre_hash: hash, rol: 'kaptan' }]
        });
        const yanit = await request(app).post('/login').send({ kullanici_adi: 'kaptan1', sifre: 'dogru-sifre' });
        expect(yanit.status).toBe(200);
        expect(typeof yanit.body.erisimTokeni).toBe('string');
        expect(typeof yanit.body.yenilemeTokeni).toBe('string');
        expect(yanit.body.rol).toBe('kaptan');
    });
});
```

Not: `afterEach(() => vi.restoreAllMocks())` mevcutsa tekrar ekleme; dosyada başka bir yerde zaten tanımlıysa bu bloktakini kaldır.

- [ ] **Step 4: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run server.test.js -t "POST /login"`
Beklenen: FAIL — 404 (route yok) veya `sifreDogrula`/`kullaniciAdiylaBul` tanımsız

- [ ] **Step 5: `server.js`'e login endpoint'ini ekle**

`server.js`'in üst kısmındaki `require` bloğuna ekle:
```js
const { sifreDogrula } = require('./sifreYardimcisi.js');
const { erisimTokeniOlustur, yenilemeTokeniOlustur, tokenDogrula } = require('./jwtYardimcisi.js');
const { kullaniciAdiylaBul } = require('./personelRepo.js');
```

`const PERSONEL_ANAHTARI = process.env.PERSONEL_ANAHTARI;` satırının altına ekle:
```js
const JWT_GIZLI_ANAHTARI = process.env.JWT_GIZLI_ANAHTARI;
```

`app.post('/geri-bildirim', ...)` bloğundan önce ekle:
```js
app.post('/login', async (req, res) => {
    const { kullanici_adi, sifre } = req.body || {};
    if (typeof kullanici_adi !== 'string' || typeof sifre !== 'string') {
        return res.status(400).json({ hata: 'Gecersiz istek' });
    }

    try {
        const kullanici = await kullaniciAdiylaBul(havuz, kullanici_adi);
        if (!kullanici || !(await sifreDogrula(sifre, kullanici.sifre_hash))) {
            return res.status(401).json({ hata: 'Gecersiz kullanici adi veya sifre' });
        }

        const payload = { id: kullanici.id, kullanici_adi: kullanici.kullanici_adi, rol: kullanici.rol };
        res.json({
            erisimTokeni: erisimTokeniOlustur(payload, JWT_GIZLI_ANAHTARI),
            yenilemeTokeni: yenilemeTokeniOlustur(payload, JWT_GIZLI_ANAHTARI),
            rol: kullanici.rol
        });
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Giris yapilamadi');
    }
});
```

- [ ] **Step 6: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run server.test.js -t "POST /login"`
Beklenen: PASS (3 test)

- [ ] **Step 7: Tüm test paketini çalıştır, regresyon olmadığını doğrula**

Çalıştır: `npm test`
Beklenen: Tüm testler PASS

- [ ] **Step 8: Commit**

```bash
git add server.js server.test.js .env.example
git commit -m "feat: POST /login ile JWT tabanli giris ekle"
```

---

### Task 6: Token yenileme endpoint'i (`POST /token/yenile`)

**Files:**
- Modify: `server.js`
- Modify: `server.test.js`

**Interfaces:**
- Consumes: `tokenDogrula`, `erisimTokeniOlustur`, `yenilemeTokeniOlustur` (Task 2).
- Produces: `POST /token/yenile` — `{ yenilemeTokeni } -> { erisimTokeni }` (200) veya `{ hata }` (401). Task 10 (client) tarafından kullanılacak.

- [ ] **Step 1: Başarısız testi yaz**

`server.test.js`'e, `describe('POST /login', ...)` bloğunun hemen altına ekle:
```js
describe('POST /token/yenile', () => {
    it('gecersiz token ile 401 doner', async () => {
        const yanit = await request(app).post('/token/yenile').send({ yenilemeTokeni: 'bozuk.token.degeri' });
        expect(yanit.status).toBe(401);
    });

    it('yenilemeTokeni eksikse 401 doner', async () => {
        const yanit = await request(app).post('/token/yenile').send({});
        expect(yanit.status).toBe(401);
    });

    it('gecerli yenileme tokeni ile yeni erisim tokeni doner', async () => {
        const yenileme = yenilemeTokeniOlustur(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const yanit = await request(app).post('/token/yenile').send({ yenilemeTokeni: yenileme });
        expect(yanit.status).toBe(200);
        expect(typeof yanit.body.erisimTokeni).toBe('string');
    });
});
```

Dosyanın üst kısmındaki require'lara ekle:
```js
const { yenilemeTokeniOlustur } = require('./jwtYardimcisi.js');
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run server.test.js -t "POST /token/yenile"`
Beklenen: FAIL — 404 (route yok)

- [ ] **Step 3: `server.js`'e refresh endpoint'ini ekle**

`app.post('/login', ...)` bloğunun hemen altına ekle:
```js
app.post('/token/yenile', (req, res) => {
    const { yenilemeTokeni } = req.body || {};
    const payload = typeof yenilemeTokeni === 'string' ? tokenDogrula(yenilemeTokeni, JWT_GIZLI_ANAHTARI) : null;
    if (!payload) {
        return res.status(401).json({ hata: 'Gecersiz veya suresi dolmus token' });
    }
    const yeniPayload = { id: payload.id, kullanici_adi: payload.kullanici_adi, rol: payload.rol };
    res.json({ erisimTokeni: erisimTokeniOlustur(yeniPayload, JWT_GIZLI_ANAHTARI) });
});
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run server.test.js -t "POST /token/yenile"`
Beklenen: PASS (3 test)

- [ ] **Step 5: Tüm test paketini çalıştır**

Çalıştır: `npm test`
Beklenen: Tüm testler PASS

- [ ] **Step 6: Commit**

```bash
git add server.js server.test.js
git commit -m "feat: POST /token/yenile ile erisim tokeni yenileme ekle"
```

---

### Task 7: `/reset-gemi`'yi JWT Bearer auth'a taşı

**Files:**
- Create: `restAuth.js`
- Test: `restAuth.test.js`
- Modify: `server.js`
- Modify: `server.test.js`

**Interfaces:**
- Consumes: `tokenDogrula` (Task 2).
- Produces: `jwtDogrulaMiddleware(tokenDogrula, gizliAnahtar, izinliRoller) -> (req,res,next) => void` — Express middleware, `req.kullanici` alanını doldurur.

- [ ] **Step 1: Başarısız testi yaz**

`restAuth.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
const { bearerTokenAl, jwtDogrulaMiddleware } = require('./restAuth.js');

function sahteReqResOlustur(authorization) {
    return {
        req: { headers: authorization ? { authorization } : {} },
        res: { status: vi.fn().mockReturnThis(), json: vi.fn() },
        next: vi.fn()
    };
}

describe('bearerTokenAl', () => {
    it('Bearer basligindan tokeni cikarir', () => {
        expect(bearerTokenAl({ headers: { authorization: 'Bearer abc.def.ghi' } })).toBe('abc.def.ghi');
    });

    it('Bearer disi baslik veya baslik yoksa null doner', () => {
        expect(bearerTokenAl({ headers: {} })).toBeNull();
        expect(bearerTokenAl({ headers: { authorization: 'Basic xyz' } })).toBeNull();
    });
});

describe('jwtDogrulaMiddleware', () => {
    it('gecerli token ve izinli rol ile next cagirir, req.kullanici i doldurur', () => {
        const tokenDogrula = vi.fn().mockReturnValue({ id: 1, rol: 'kaptan' });
        const middleware = jwtDogrulaMiddleware(tokenDogrula, 'gizli', ['kaptan', 'admin']);
        const { req, res, next } = sahteReqResOlustur('Bearer gecerli-token');

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.kullanici).toEqual({ id: 1, rol: 'kaptan' });
    });

    it('token yoksa veya gecersizse 401 doner', () => {
        const tokenDogrula = vi.fn().mockReturnValue(null);
        const middleware = jwtDogrulaMiddleware(tokenDogrula, 'gizli', ['kaptan']);
        const { req, res, next } = sahteReqResOlustur(undefined);

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rol izinli roller listesinde degilse 403 doner', () => {
        const tokenDogrula = vi.fn().mockReturnValue({ id: 1, rol: 'personel' });
        const middleware = jwtDogrulaMiddleware(tokenDogrula, 'gizli', ['kaptan', 'admin']);
        const { req, res, next } = sahteReqResOlustur('Bearer gecerli-token');

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run restAuth.test.js`
Beklenen: FAIL — `Cannot find module './restAuth.js'`

- [ ] **Step 3: `restAuth.js`'i yaz**

```js
function bearerTokenAl(req) {
    const baslik = req.headers.authorization || '';
    const [tur, token] = baslik.split(' ');
    return tur === 'Bearer' && token ? token : null;
}

function jwtDogrulaMiddleware(tokenDogrula, gizliAnahtar, izinliRoller) {
    return function (req, res, next) {
        const token = bearerTokenAl(req);
        const payload = token ? tokenDogrula(token, gizliAnahtar) : null;

        if (!payload) {
            return res.status(401).json({ hata: 'Yetkisiz istek' });
        }
        if (izinliRoller && !izinliRoller.includes(payload.rol)) {
            return res.status(403).json({ hata: 'Bu islem icin yetkiniz yok' });
        }

        req.kullanici = payload;
        next();
    };
}

module.exports = { bearerTokenAl, jwtDogrulaMiddleware };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run restAuth.test.js`
Beklenen: PASS (5 test)

- [ ] **Step 5: `/reset-gemi`'yi middleware'i kullanacak şekilde güncelle**

`server.js`'deki require bloğuna ekle:
```js
const { jwtDogrulaMiddleware } = require('./restAuth.js');
```

Mevcut `/reset-gemi` handler'ını (şu an `anahtarDogrula(req.body?.anahtar, PERSONEL_ANAHTARI)` kontrolü yapan) şununla değiştir:
```js
app.post('/reset-gemi', jwtDogrulaMiddleware(tokenDogrula, JWT_GIZLI_ANAHTARI, ['kaptan', 'admin']), (req, res) => {
    gemiKonumu.enlem = baslangicKonumu.enlem;
    gemiKonumu.boylam = baslangicKonumu.boylam;
    suankiHedefIndex = 0;
    varisBildirimiGonderildi = false;
    console.log('GEMI SIFIRLANDI. Kullanici:', req.kullanici.kullanici_adi);
    res.json({ tamam: true });
});
```

- [ ] **Step 6: Mevcut `/reset-gemi` testlerini JWT'ye göre güncelle**

`server.test.js`'deki `describe('POST /reset-gemi', ...)` bloğunun tamamını şununla değiştir:
```js
describe('POST /reset-gemi', () => {
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
        const token = erisimTokeniOlustur(
            { id: 1, kullanici_adi: 'personel1', rol: 'personel' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(yanit.status).toBe(403);
    });

    it('kaptan rolundeki gecerli token ile 200 doner ve gemiyi sifirlar', async () => {
        const token = erisimTokeniOlustur(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(yanit.status).toBe(200);
        expect(yanit.body).toEqual({ tamam: true });
    });
});
```

Dosyanın üst kısmındaki require'lara ekle (yoksa):
```js
const { erisimTokeniOlustur } = require('./jwtYardimcisi.js');
```

- [ ] **Step 7: `REST uclarinda CORS` bloğundaki `/reset-gemi` testlerini JWT'ye göre güncelle**

`describe('REST uclarinda CORS', ...)` bloğundaki üç testin gövdesini, `.send({ anahtar: 'test-ortami-anahtari' })` yerine geçerli bir kaptan tokeni ile `Authorization` başlığı gönderecek şekilde güncelle:
```js
describe('REST uclarinda CORS', () => {
    const gecerliToken = () =>
        erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);

    it('izin verilmeyen origin ile POST /reset-gemi 403 doner', async () => {
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Origin', 'https://kotu-site.com')
            .set('Authorization', `Bearer ${gecerliToken()}`)
            .send({});
        expect(yanit.status).toBe(403);
    });

    it('izin verilen origin ile POST /reset-gemi gecer ve Access-Control-Allow-Origin doner', async () => {
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Origin', 'https://izinli-site.com')
            .set('Authorization', `Bearer ${gecerliToken()}`)
            .send({});
        expect(yanit.status).toBe(200);
        expect(yanit.headers['access-control-allow-origin']).toBe('https://izinli-site.com');
    });

    it('origin header i olmadan (mobil istemci) istek normal calisir', async () => {
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Authorization', `Bearer ${gecerliToken()}`)
            .send({});
        expect(yanit.status).toBe(200);
        expect(yanit.headers['access-control-allow-origin']).toBeUndefined();
    });
});
```

- [ ] **Step 8: Testleri çalıştırıp geçtiğini doğrula**

Çalıştır: `npm test`
Beklenen: Tüm testler PASS

- [ ] **Step 9: Commit**

```bash
git add restAuth.js restAuth.test.js server.js server.test.js
git commit -m "fix: /reset-gemi ucunu JWT Bearer auth ve rol kontrolune tasi"
```

---

### Task 8: Socket.io JWT middleware + rol bazlı yetkilendirme

**Files:**
- Modify: `server.js`
- Modify: `server.test.js`

**Interfaces:**
- Consumes: `tokenDogrula` (Task 2).
- Produces: Her socket bağlantısında `soket.data.kullanici = { id, kullanici_adi, rol }` doldurulmuş olur (kimliği doğrulanmamış bağlantılar `connect_error` alır). Task 10 (client) `handshake.auth.token` göndermek zorunda.

- [ ] **Step 1: Mevcut socket testlerinin yerini alacak başarısız testleri yaz**

`server.test.js`'deki `describe('acil-durum-baslat socket yetkilendirmesi', ...)` bloğunun tamamını şununla değiştir:
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

    it('token gonderilmezse baglanti reddedilir', async () => {
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`);
        const hata = await new Promise((resolve) => gonderen.on('connect_error', resolve));
        expect(hata.message).toBe('Yetkisiz');
        gonderen.disconnect();
    });

    it('personel rolundeki token ile baglanir ama acil-durum-baslat Yetkisiz rol doner', async () => {
        const token = erisimTokeniOlustur(
            { id: 1, kullanici_adi: 'personel1', rol: 'personel' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token } });
        await new Promise((resolve) => gonderen.on('connect', resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', { gemi_adi: 'Test Gemisi' }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz rol' });
        gonderen.disconnect();
    });

    it('kaptan rolundeki token ile acil-durum-uyarisi yayinlanir', async () => {
        const token = erisimTokeniOlustur(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token } });
        const dinleyici = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token } });
        await new Promise((resolve) => gonderen.on('connect', resolve));
        await new Promise((resolve) => dinleyici.on('connect', resolve));

        const uyariPromise = new Promise((resolve) => dinleyici.on('acil-durum-uyarisi', resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', { gemi_adi: 'Test Gemisi' }, resolve);
        });
        const uyari = await uyariPromise;

        expect(yanit).toEqual({ tamam: true });
        expect(uyari.gemi).toBe('Test Gemisi');
        gonderen.disconnect();
        dinleyici.disconnect();
    });
});
```

`describe('yolcu-sayisi-guncelle anahtar sizintisi korumasi', ...)` bloğunun tamamını şununla değiştir (ad da güncellendi):
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

    it('gecerli token ile herhangi bir rol yolcu-sayisi-yayin yapabilir', async () => {
        const token = erisimTokeniOlustur(
            { id: 1, kullanici_adi: 'personel1', rol: 'personel' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token } });
        const dinleyici = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token } });
        await new Promise((resolve) => gonderen.on('connect', resolve));
        await new Promise((resolve) => dinleyici.on('connect', resolve));

        const yayinPromise = new Promise((resolve) => dinleyici.on('yolcu-sayisi-yayin', resolve));

        gonderen.emit('yolcu-sayisi-guncelle', { sayi: 3, gemi_adi: 'Test Gemisi' }, () => {});
        const yayin = await yayinPromise;

        expect(yayin).toEqual({ sayi: 3, gemi_adi: 'Test Gemisi' });
        gonderen.disconnect();
        dinleyici.disconnect();
    });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run server.test.js -t "yetkilendirme"`
Beklenen: FAIL (henüz `io.use` middleware'i yok, eski `anahtar` bazlı davranış çalışıyor)

- [ ] **Step 3: `server.js`'e socket JWT middleware'i ve rol kontrolünü ekle**

`io.on('connection', (soket) => {` satırının hemen üstüne ekle:
```js
io.use((soket, next) => {
    const token = soket.handshake.auth?.token;
    const payload = typeof token === 'string' ? tokenDogrula(token, JWT_GIZLI_ANAHTARI) : null;
    if (!payload) {
        return next(new Error('Yetkisiz'));
    }
    soket.data.kullanici = payload;
    next();
});
```

`soket.on('acil-durum-baslat', ...)` içindeki `anahtarDogrula` kontrolünü rol kontrolüyle değiştir:
```js
    soket.on('acil-durum-baslat', (bilgi, geriBildir) => {
        if (!['kaptan', 'admin'].includes(soket.data.kullanici.rol)) {
            console.log('YETKISIZ ROL ile acil-durum-baslat denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz rol' });
            return;
        }
        if (!gemiAdiGecerliMi(bilgi?.gemi_adi)) {
            console.log('GECERSIZ gemi_adi ile istek. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz veri' });
            return;
        }
        console.log('ACIL DURUM BASLATILDI:', { gemi: bilgi.gemi_adi });
        io.emit('acil-durum-uyarisi', {
            mesaj: 'ACIL DURUM! Lutfen tahliye talimatlarini takip edin.',
            gemi: bilgi.gemi_adi,
            zaman: new Date().toISOString()
        });
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });
```

`soket.on('acil-durum-bitir', ...)` içindeki `anahtarDogrula` kontrolünü aynı şekilde değiştir:
```js
    soket.on('acil-durum-bitir', (bilgi, geriBildir) => {
        if (!['kaptan', 'admin'].includes(soket.data.kullanici.rol)) {
            console.log('YETKISIZ ROL ile acil-durum-bitir denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz rol' });
            return;
        }
        if (!gemiAdiGecerliMi(bilgi?.gemi_adi)) {
            console.log('GECERSIZ gemi_adi ile istek. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz veri' });
            return;
        }
        console.log('ACIL DURUM BITIRILDI:', { gemi: bilgi.gemi_adi });
        io.emit('acil-durum-bitti', {
            mesaj: 'Acil durum sona erdi. Normal yolculuga devam ediliyor.',
            zaman: new Date().toISOString()
        });
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });
```

`soket.on('yolcu-sayisi-guncelle', ...)` içindeki `anahtarDogrula` kontrol bloğunu tamamen kaldır (bağlantı zaten `io.use` ile kimlik doğrulamasından geçti), sadece veri doğrulaması kalsın:
```js
    soket.on('yolcu-sayisi-guncelle', (bilgi, geriBildir) => {
        if (!sayiGecerliMi(bilgi?.sayi) || !gemiAdiGecerliMi(bilgi?.gemi_adi)) {
            console.log('GECERSIZ veri ile yolcu-sayisi-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz veri' });
            return;
        }
        console.log('YOLCU SAYISI GUNCELLENDI:', { sayi: bilgi.sayi, gemi_adi: bilgi.gemi_adi });
        io.emit('yolcu-sayisi-yayin', { sayi: bilgi.sayi, gemi_adi: bilgi.gemi_adi });
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });
```

- [ ] **Step 4: Testleri çalıştırıp geçtiğini doğrula**

Çalıştır: `npm test`
Beklenen: Tüm testler PASS

- [ ] **Step 5: Commit**

```bash
git add server.js server.test.js
git commit -m "feat: socket.io baglantilarina JWT dogrulama ve rol bazli yetkilendirme ekle"
```

---

### Task 9: `PERSONEL_ANAHTARI` mekanizmasını tamamen kaldır

**Files:**
- Delete: `auth.js`
- Delete: `auth.test.js`
- Modify: `server.js`
- Modify: `server.test.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Yok (temizlik görevi). Task 7 ve Task 8 tamamlandıktan sonra `anahtarDogrula`/`PERSONEL_ANAHTARI` hiçbir yerde kullanılmıyor olmalı.

- [ ] **Step 1: Kullanılmadığını doğrula**

Çalıştır: `grep -rn "anahtarDogrula\|PERSONEL_ANAHTARI" --include="*.js" .` (node_modules hariç)
Beklenen: Sadece `auth.js` ve `auth.test.js` içinde eşleşme kalmış olmalı (server.js/server.test.js'de artık yok).

- [ ] **Step 2: `auth.js` ve `auth.test.js`'i sil**

```bash
git rm auth.js auth.test.js
```

- [ ] **Step 3: `server.js`'den ölü kodu temizle**

`const { anahtarDogrula } = require('./auth.js');` satırını sil.
`const PERSONEL_ANAHTARI = process.env.PERSONEL_ANAHTARI;` satırını sil.

- [ ] **Step 4: `server.test.js`'den ölü satırı temizle**

Dosyanın en üstündeki `process.env.PERSONEL_ANAHTARI = 'test-ortami-anahtari';` satırını sil.

- [ ] **Step 5: `.env.example`'dan `PERSONEL_ANAHTARI` satırını kaldır**

`PERSONEL_ANAHTARI=personel-uygulamasiyla-paylasilan-gizli-anahtar` satırını sil.

- [ ] **Step 6: Tüm test paketini çalıştır**

Çalıştır: `npm test`
Beklenen: Tüm testler PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: PERSONEL_ANAHTARI paylasilan-anahtar mekanizmasini tamamen kaldir"
```

---

### Task 10: Personel app — gerçek login ekranı ve token tabanlı bağlantı

**Files:**
- Modify: `ido-navigasyon-personel/App.js`

**Interfaces:**
- Consumes: `POST /login` (Task 5), `POST /token/yenile` (Task 6), socket `handshake.auth.token` doğrulaması (Task 8).
- Test altyapısı yok (bkz. Global Constraints ve proje kararı): bu görev manuel doğrulama ile tamamlanır, otomatik test Faz 5 kapsamına bırakılır.

- [ ] **Step 1: `App.js`'in tamamını aşağıdaki içerikle değiştir**

```js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, TextInput } from 'react-native';
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

    const soket = io(SUNUCU_ADRESI, { auth: { token: erisimTokeni } });
    soketRef.current = soket;

    soket.on('connect', () => {
      setBaglantiDurumu('Bagli');
    });

    soket.on('disconnect', () => {
      setBaglantiDurumu('Baglanti kesildi');
    });

    soket.on('connect_error', async () => {
      setBaglantiDurumu('Baglanti kesildi');
      const yeniToken = await erisimTokeniniYenile();
      if (!yeniToken) {
        await oturumuKapat();
      }
    });

    return () => {
      soket.disconnect();
    };
  }, [erisimTokeni]);

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
            soketRef.current.emit(
              'acil-durum-baslat',
              { gemi_adi: 'Yalova Feribotu 1' },
              (yanit) => {
                if (yanit && yanit.tamam) {
                  setAcilDurumAktif(true);
                } else {
                  Alert.alert('Hata', (yanit && yanit.hata) || 'Acil durum baslatilamadi.');
                }
              }
            );
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
            soketRef.current.emit(
              'acil-durum-bitir',
              { gemi_adi: 'Yalova Feribotu 1' },
              (yanit) => {
                if (yanit && yanit.tamam) {
                  setAcilDurumAktif(false);
                } else {
                  Alert.alert('Hata', (yanit && yanit.hata) || 'Acil durum bitirilemedi.');
                }
              }
            );
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
      soketRef.current.emit(
        'yolcu-sayisi-guncelle',
        { sayi: yeniSayi, gemi_adi: 'Yalova Feribotu 1' },
        (yanit) => {
          if (!yanit || !yanit.tamam) {
            setYolcuSayisi(oncekiSayi);
            Alert.alert('Hata', (yanit && yanit.hata) || 'Yolcu sayisi guncellenemedi.');
          }
        }
      );
    }
  }

  return (
    <View style={styles.disKapsayici}>
      <StatusBar barStyle="light-content" backgroundColor="#0D3B66" />

      {tokenYukleniyor ? (
        <View style={styles.govde}>
          <Text style={styles.etiket}>Yukleniyor...</Text>
        </View>
      ) : !erisimTokeni ? (
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
      ) : (
        <>
          <View style={styles.ustCubuk}>
            <Text style={styles.ustCubukBaslik}>Personel Paneli</Text>
            <Text style={styles.ustCubukAltBaslik}>IDO Engelsiz Navigasyon</Text>
          </View>

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

            <TouchableOpacity style={styles.anahtarDegistirButon} onPress={oturumuKapat}>
              <Text style={styles.anahtarDegistirYazi}>Cikis Yap</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
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

- [ ] **Step 2: Manuel doğrulama — giriş akışı**

`scripts/personel-ekle.js` ile bir test kullanıcısı oluştur (`node scripts/personel-ekle.js test-kaptan sifre123 kaptan`), backend'i çalıştır (`npm start`), Expo'da personel app'i başlat (`npm start` — `ido-navigasyon-personel` içinde), doğru/yanlış kullanıcı adı-şifre ile giriş dene, doğru girişte ana panelin açıldığını, "Cikis Yap"ın oturumu kapatıp giriş ekranına döndürdüğünü doğrula.

- [ ] **Step 3: Manuel doğrulama — rol bazlı yetkilendirme**

`personel` rolüyle oluşturulmuş bir kullanıcıyla giriş yapıp "ACIL DURUM BASLAT"a basıldığında sunucudan "Yetkisiz rol" hatası döndüğünü ve `Alert` ile gösterildiğini doğrula. `kaptan` rolüyle aynı işlemin başarılı olduğunu doğrula.

- [ ] **Step 4: Commit**

```bash
git add ido-navigasyon-personel/App.js
git commit -m "feat: personel app'e gercek kullanici adi/sifre girisi ve token tabanli oturum ekle"
```

---

## Faz 1 Tamamlandığında

- [ ] `npm test` (backend) tüm testleri yeşil geçiyor.
- [ ] `personel_hesaplari` tablosu DB'de mevcut, en az bir `kaptan`/`admin` hesabı oluşturuldu.
- [ ] `POST /login` doğru bilgilerle token çifti, yanlış bilgilerle 401 dönüyor.
- [ ] `POST /token/yenile` geçerli yenileme tokeniyle yeni erişim tokeni dönüyor.
- [ ] `/reset-gemi` JWT Bearer + rol kontrolü (`kaptan`/`admin`) gerektiriyor.
- [ ] Socket.io bağlantıları `handshake.auth.token` olmadan reddediliyor; acil durum olayları sadece `kaptan`/`admin` rolüne açık.
- [ ] `PERSONEL_ANAHTARI`, `auth.js`, `auth.test.js` repodan tamamen kaldırıldı.
- [ ] Personel app'te gerçek kullanıcı adı/şifre girişi çalışıyor, token'lar SecureStore'da.
- [ ] Roadmap dosyasında (`2026-08-07-profesyonellesme-yol-haritasi.md`) Faz 1 tamamlandı olarak işaretlendi.
