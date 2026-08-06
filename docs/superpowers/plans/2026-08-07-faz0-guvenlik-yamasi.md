# Faz 0 — Acil Güvenlik Yaması Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ido-navigasyon-backend` ve `ido-navigasyon-personel` uygulamalarındaki acil güvenlik açıklarını (client'a gömülü paylaşılan anahtar, korumasız reset endpoint'i, açık CORS, doğrulanmamış socket payload'ları, sızdırılan hata mesajları) kapatmak.

**Architecture:** Mevcut paylaşılan-anahtar (shared secret) modeli korunuyor — tam kimlik doğrulama/rol sistemi Faz 1'in kapsamında. Bu fazda amaç: (1) anahtarı derlenmiş client koduna gömmek yerine cihazda güvenli depoda (SecureStore) çalışma zamanında saklamak, (2) sunucu tarafında anahtar karşılaştırmasını sabit-zamanlı yapmak, (3) tüm yetki gerektiren endpoint/event'leri fiilen korumak, (4) CORS'u daraltmak, (5) client'a sızan hata detaylarını kesmek.

**Tech Stack:** Node.js/Express 5, Socket.io 4, PostgreSQL (`pg`), Vitest (yeni test altyapısı), Supertest (HTTP entegrasyon testleri), Expo/React Native + `expo-secure-store` (personel app).

## Global Constraints

- Mevcut kod tabanı CommonJS (`require`/`module.exports`) kullanıyor — yeni dosyalar da CommonJS olacak, ESM'e geçilmeyecek.
- Mevcut değişken/fonksiyon isimlendirme dili Türkçe (`gemiKonumu`, `anahtarDogrula` gibi) — yeni kod bu konvansiyona uyacak.
- Bu faz, Faz 1'deki tam kimlik doğrulama sistemine kadar **geçici bir sertleştirme**dir; paylaşılan-anahtar modelini kaldırmıyor, sadece anahtarın client koduna gömülmesini ve korumasız uç noktaları kapatıyor.
- Mobil istemciler (React Native, native transport) genellikle `Origin` header'ı göndermez — CORS kısıtlaması bunu kırmayacak şekilde tasarlanmalı (header yoksa izin ver, header varsa allowlist'te olmalı).
- `ido-navigasyon-mobil-v3` (yolcu app) bu fazda değişmiyor — sadece `ido-navigasyon-personel` (yetkili anahtar taşıyan app) değişiyor.

---

### Task 1: Sabit-zamanlı anahtar doğrulama (`auth.js`) + Vitest kurulumu

**Files:**
- Create: `auth.js`
- Test: `auth.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `anahtarDogrula(saglanan, beklenen) -> boolean` — Task 2 ve Task 3 tarafından kullanılacak.

- [ ] **Step 1: Vitest'i dev dependency olarak kur**

Çalıştır: `npm install --save-dev vitest` (proje kökünde, `ido-navigasyon-backend` içinde)

- [ ] **Step 2: `package.json`'daki test script'ini güncelle**

`package.json` içinde:
```json
"scripts": {
    "start": "node server.js",
    "test": "vitest run"
},
```

- [ ] **Step 3: Başarısız testi yaz**

`auth.test.js`:
```js
const { describe, it, expect } = require('vitest');
const { anahtarDogrula } = require('./auth.js');

describe('anahtarDogrula', () => {
    it('saglanan ve beklenen ayni oldugunda true doner', () => {
        expect(anahtarDogrula('gizli-anahtar-123', 'gizli-anahtar-123')).toBe(true);
    });

    it('saglanan ve beklenen farkli oldugunda false doner', () => {
        expect(anahtarDogrula('yanlis-anahtar', 'gizli-anahtar-123')).toBe(false);
    });

    it('saglanan tanimsiz oldugunda hata firlatmadan false doner', () => {
        expect(anahtarDogrula(undefined, 'gizli-anahtar-123')).toBe(false);
    });

    it('beklenen bos string oldugunda false doner', () => {
        expect(anahtarDogrula('herhangi-bir-deger', '')).toBe(false);
    });

    it('uzunluklari farkli oldugunda hata firlatmadan false doner', () => {
        expect(anahtarDogrula('kisa', 'cok-cok-daha-uzun-bir-anahtar-degeri')).toBe(false);
    });
});
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run auth.test.js`
Beklenen: FAIL — `Cannot find module './auth.js'`

- [ ] **Step 4: `auth.js`'i yaz**

```js
const crypto = require('crypto');

function anahtarDogrula(saglanan, beklenen) {
    if (typeof saglanan !== 'string' || saglanan.length === 0) return false;
    if (typeof beklenen !== 'string' || beklenen.length === 0) return false;

    const saglananOzet = crypto.createHash('sha256').update(saglanan).digest();
    const beklenenOzet = crypto.createHash('sha256').update(beklenen).digest();

    return crypto.timingSafeEqual(saglananOzet, beklenenOzet);
}

module.exports = { anahtarDogrula };
```

Not: Doğrudan `timingSafeEqual(Buffer.from(saglanan), Buffer.from(beklenen))` kullanılmıyor çünkü bu fonksiyon farklı uzunluktaki buffer'larda hata fırlatır (uzunluk farkı zaten bir bilgi sızıntısıdır). Önce SHA-256 ile sabit uzunluğa (32 byte) indirgeyip öyle karşılaştırıyoruz.

- [ ] **Step 5: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run auth.test.js`
Beklenen: PASS (5/5)

- [ ] **Step 6: Commit**

```bash
git add auth.js auth.test.js package.json package-lock.json
git commit -m "feat: sabit-zamanli anahtar dogrulama fonksiyonu ekle"
```

---

### Task 2: `server.js`'i test edilebilir hale getir + `/reset-gemi`'yi koru

**Files:**
- Modify: `server.js`
- Test: `server.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `anahtarDogrula(saglanan, beklenen)` (Task 1)
- Produces: `module.exports = { app, sunucu, havuz }` — Task 6 bu export'u genişletecek.

**Bağlam:** Şu an `server.js` `require` edildiği an `sunucu.listen(...)` ve `setInterval(konumKontrolVeYayinla, 1000)` çalışıyor — bu, dosyayı test için import etmeyi imkansız kılıyor (gerçek portu dinlemeye çalışır, her saniye gerçek DB'ye sorgu atar, process test bittikten sonra da açık kalır). Bu adım bunu `require.main === module` koruması ile düzeltiyor. Ayrıca `app.use(express.json())` şu an `/reset-gemi` route'undan SONRA tanımlı olduğu için `/reset-gemi` isteklerinde `req.body` hiç parse edilmiyor (var olan bir bug) — bunu da düzeltiyoruz çünkü anahtar kontrolü `req.body.anahtar`'a ihtiyaç duyacak.

- [ ] **Step 1: Supertest'i dev dependency olarak kur**

Çalıştır: `npm install --save-dev supertest`

- [ ] **Step 2: Başarısız testleri yaz**

`server.test.js`:
```js
process.env.PERSONEL_ANAHTARI = 'test-ortami-anahtari';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

const { describe, it, expect, afterAll } = require('vitest');
const request = require('supertest');
const { app, havuz } = require('./server.js');

describe('POST /reset-gemi', () => {
    it('anahtar gonderilmezse 401 doner', async () => {
        const yanit = await request(app).post('/reset-gemi').send({});
        expect(yanit.status).toBe(401);
    });

    it('yanlis anahtarla 401 doner', async () => {
        const yanit = await request(app).post('/reset-gemi').send({ anahtar: 'yanlis-anahtar' });
        expect(yanit.status).toBe(401);
    });

    it('dogru anahtarla 200 doner ve gemiyi sifirlar', async () => {
        const yanit = await request(app).post('/reset-gemi').send({ anahtar: 'test-ortami-anahtari' });
        expect(yanit.status).toBe(200);
        expect(yanit.body).toEqual({ tamam: true });
    });
});

afterAll(async () => {
    await havuz.end();
});
```

- [ ] **Step 3: Testleri çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run server.test.js`
Beklenen: FAIL (ya `app` export edilmediği için, ya da mevcut `/reset-gemi` anahtar kontrolü yapmadığı için ilk iki test başarısız — auth eklenmemiş halde her istek 200 döner)

- [ ] **Step 4: `server.js`'i güncelle**

`const app = express();` satırından hemen sonra (mevcut `const sunucu = http.createServer(app);` satırından önce) ekle:
```js
app.use(express.json());
```

Dosyanın sonundaki (mevcut satır 209'daki) `app.use(express.json());` satırını **sil** (yukarı taşındı, tekrar olmasın).

`const { geofenceKontrolEt, ikiNoktaArasiMesafe } = require('./geofencing.js');` satırının altına ekle:
```js
const { anahtarDogrula } = require('./auth.js');
```

`app.post('/reset-gemi', ...)` handler'ını güncelle:
```js
app.post('/reset-gemi', (req, res) => {
    if (!anahtarDogrula(req.body?.anahtar, PERSONEL_ANAHTARI)) {
        return res.status(401).json({ hata: 'Yetkisiz istek' });
    }
    gemiKonumu.enlem = baslangicKonumu.enlem;
    gemiKonumu.boylam = baslangicKonumu.boylam;
    suankiHedefIndex = 0;
    varisBildirimiGonderildi = false;
    console.log('GEMI SIFIRLANDI');
    res.json({ tamam: true });
});
```

Dosyanın en altındaki şu bloğu:
```js
setInterval(konumKontrolVeYayinla, 1000);

const PORT = process.env.PORT || 3000;
sunucu.listen(PORT, () => {
    console.log(`Sunucu calisiyor: http://localhost:${PORT}`);
});
```
şununla değiştir:
```js
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    setInterval(konumKontrolVeYayinla, 1000);
    sunucu.listen(PORT, () => {
        console.log(`Sunucu calisiyor: http://localhost:${PORT}`);
    });
}

module.exports = { app, sunucu, havuz };
```

- [ ] **Step 5: Testleri çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run server.test.js`
Beklenen: PASS (3/3)

- [ ] **Step 6: Commit**

```bash
git add server.js server.test.js package.json package-lock.json
git commit -m "fix: reset-gemi ucuna anahtar korumasi ekle, sunucuyu test edilebilir hale getir"
```

---

### Task 3: Socket event handler'larında `anahtarDogrula` kullan

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `anahtarDogrula(saglanan, beklenen)` (Task 1)

**Bağlam:** `acil-durum-baslat`, `acil-durum-bitir`, `yolcu-sayisi-guncelle` event handler'ları şu an `!PERSONEL_ANAHTARI || bilgi.anahtar !== PERSONEL_ANAHTARI` ile karşılaştırma yapıyor (zamanlama saldırısına açık, `!==` sabit-zamanlı değil). Bunu `anahtarDogrula` ile değiştiriyoruz. Bu üç handler için otomatik entegrasyon testi yazmıyoruz (Socket.io için gerçek bir client-server el sıkışması gerektirir, bu ağırlıktaki bir test altyapısı Faz 5'in kapsamında) — bunun yerine aşağıda elle doğrulama adımları var.

- [ ] **Step 1: Üç handler'ı güncelle**

`soket.on('acil-durum-baslat', ...)`:
```js
soket.on('acil-durum-baslat', (bilgi) => {
    if (!anahtarDogrula(bilgi?.anahtar, PERSONEL_ANAHTARI)) {
        console.log('YETKISIZ acil-durum-baslat denemesi. ID:', soket.id);
        return;
    }
    console.log('ACIL DURUM BASLATILDI:', bilgi);
    io.emit('acil-durum-uyarisi', {
        mesaj: 'ACIL DURUM! Lutfen tahliye talimatlarini takip edin.',
        gemi: bilgi.gemi_adi,
        zaman: new Date().toISOString()
    });
});
```

`soket.on('acil-durum-bitir', ...)`:
```js
soket.on('acil-durum-bitir', (bilgi) => {
    if (!anahtarDogrula(bilgi?.anahtar, PERSONEL_ANAHTARI)) {
        console.log('YETKISIZ acil-durum-bitir denemesi. ID:', soket.id);
        return;
    }
    console.log('ACIL DURUM BITIRILDI:', bilgi);
    io.emit('acil-durum-bitti', {
        mesaj: 'Acil durum sona erdi. Normal yolculuga devam ediliyor.',
        zaman: new Date().toISOString()
    });
});
```

`soket.on('yolcu-sayisi-guncelle', ...)`:
```js
soket.on('yolcu-sayisi-guncelle', (bilgi) => {
    if (!anahtarDogrula(bilgi?.anahtar, PERSONEL_ANAHTARI)) {
        console.log('YETKISIZ yolcu-sayisi-guncelle denemesi. ID:', soket.id);
        return;
    }
    console.log('YOLCU SAYISI GUNCELLENDI:', bilgi);
    io.emit('yolcu-sayisi-yayin', bilgi);
});
```

- [ ] **Step 2: Elle doğrula — sunucuyu başlat**

Çalıştır: `PERSONEL_ANAHTARI=test-anahtari node server.js` (ayrı bir terminalde, `.env`'de gerçek `DATABASE_URL` tanımlı olmalı ya da DB hatası loglanır ama sunucu ayakta kalır)

- [ ] **Step 3: Elle doğrula — yanlış anahtarla reddedildiğini gör**

Çalıştır:
```bash
node -e "
const { io } = require('socket.io-client');
const soket = io('http://localhost:3000');
soket.on('connect', () => {
  soket.emit('acil-durum-baslat', { gemi_adi: 'Test Gemisi', anahtar: 'yanlis-anahtar' });
  setTimeout(() => process.exit(0), 500);
});
"
```
Beklenen: sunucu konsolunda `YETKISIZ acil-durum-baslat denemesi` logu görünür, hiçbir `acil-durum-uyarisi` yayını yapılmaz.

- [ ] **Step 4: Elle doğrula — doğru anahtarla kabul edildiğini gör**

Aynı komutu `anahtar: 'test-anahtari'` ile çalıştır.
Beklenen: sunucu konsolunda `ACIL DURUM BASLATILDI` logu görünür.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "fix: socket event handlerlarinda sabit-zamanli anahtar dogrulama kullan"
```

---

### Task 4: Socket.io CORS allowlist (`cors.js`)

**Files:**
- Create: `cors.js`
- Test: `cors.test.js`
- Modify: `server.js`
- Modify: `.env.example`

**Interfaces:**
- Produces: `izinliOrijinListesi(cevreDegiskeni) -> string[]`, `corsOrijinKontrolu(izinVerilenOrijinler) -> (orijin, geriCagirma) => void` — Task içinde `server.js`'e bağlanacak.

**Bağlam:** Şu an `cors: { origin: "*" }` — herhangi bir web sayfası bu Socket.io sunucusuna bağlanabilir. React Native istemciler (native transport) genelde `Origin` header'ı göndermez, bu yüzden allowlist mantığı header yokken izin vermeli (mobil bağlantıları kırmamak için), header varsa (tarayıcı tabanlı bağlantı) allowlist'te olmalı.

- [ ] **Step 1: Başarısız testleri yaz**

`cors.test.js`:
```js
const { describe, it, expect, vi } = require('vitest');
const { izinliOrijinListesi, corsOrijinKontrolu } = require('./cors.js');

describe('izinliOrijinListesi', () => {
    it('virgulle ayrilmis degerleri diziye cevirir ve bosluklari temizler', () => {
        expect(izinliOrijinListesi('https://a.com, https://b.com')).toEqual(['https://a.com', 'https://b.com']);
    });

    it('bos veya tanimsiz girdi icin bos dizi doner', () => {
        expect(izinliOrijinListesi('')).toEqual([]);
        expect(izinliOrijinListesi(undefined)).toEqual([]);
    });
});

describe('corsOrijinKontrolu', () => {
    it('orijin header i gonderilmedigi zaman izin verir (mobil istemciler icin)', () => {
        const kontrol = corsOrijinKontrolu(['https://a.com']);
        const geriCagirma = vi.fn();
        kontrol(undefined, geriCagirma);
        expect(geriCagirma).toHaveBeenCalledWith(null, true);
    });

    it('listede olan orijine izin verir', () => {
        const kontrol = corsOrijinKontrolu(['https://a.com']);
        const geriCagirma = vi.fn();
        kontrol('https://a.com', geriCagirma);
        expect(geriCagirma).toHaveBeenCalledWith(null, true);
    });

    it('listede olmayan orijini reddeder', () => {
        const kontrol = corsOrijinKontrolu(['https://a.com']);
        const geriCagirma = vi.fn();
        kontrol('https://kotu-site.com', geriCagirma);
        expect(geriCagirma).toHaveBeenCalledWith(expect.any(Error));
    });
});
```

- [ ] **Step 2: Testleri çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run cors.test.js`
Beklenen: FAIL — `Cannot find module './cors.js'`

- [ ] **Step 3: `cors.js`'i yaz**

```js
function izinliOrijinListesi(cevreDegiskeni) {
    return (cevreDegiskeni || '')
        .split(',')
        .map((deger) => deger.trim())
        .filter(Boolean);
}

function corsOrijinKontrolu(izinVerilenOrijinler) {
    return function (orijin, geriCagirma) {
        if (!orijin || izinVerilenOrijinler.includes(orijin)) {
            geriCagirma(null, true);
        } else {
            geriCagirma(new Error('CORS: izin verilmeyen orijin'));
        }
    };
}

module.exports = { izinliOrijinListesi, corsOrijinKontrolu };
```

- [ ] **Step 4: Testleri çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run cors.test.js`
Beklenen: PASS (5/5)

- [ ] **Step 5: `server.js`'e bağla**

`const { anahtarDogrula } = require('./auth.js');` satırının altına ekle:
```js
const { izinliOrijinListesi, corsOrijinKontrolu } = require('./cors.js');
```

```js
const io = new Server(sunucu, {
    cors: { origin: "*" }
});
```
şununla değiştir:
```js
const izinVerilenOrijinler = izinliOrijinListesi(process.env.ALLOWED_ORIGINS);
const io = new Server(sunucu, {
    cors: { origin: corsOrijinKontrolu(izinVerilenOrijinler) }
});
```

- [ ] **Step 6: `.env.example`'a ekle**

`.env.example`'a şu satırı ekle:
```
# Virgulle ayrilmis, tarayici tabanli istemcilerin adresleri (mobil apple bagli degil).
# Ornek: ALLOWED_ORIGINS=https://admin.ido-navigasyon.com,http://localhost:8081
ALLOWED_ORIGINS=
```

- [ ] **Step 7: Commit**

```bash
git add cors.js cors.test.js server.js .env.example
git commit -m "fix: socket.io cors ayarini acik listeden (allowlist) origin kontrolune tasi"
```

---

### Task 5: Socket payload doğrulama (`validation.js`)

**Files:**
- Create: `validation.js`
- Test: `validation.test.js`
- Modify: `server.js`

**Interfaces:**
- Produces: `gemiAdiGecerliMi(deger) -> boolean`, `sayiGecerliMi(deger) -> boolean`

- [ ] **Step 1: Başarısız testleri yaz**

`validation.test.js`:
```js
const { describe, it, expect } = require('vitest');
const { gemiAdiGecerliMi, sayiGecerliMi } = require('./validation.js');

describe('gemiAdiGecerliMi', () => {
    it('normal bir metin icin true doner', () => {
        expect(gemiAdiGecerliMi('Yalova Feribotu 1')).toBe(true);
    });

    it('bos string icin false doner', () => {
        expect(gemiAdiGecerliMi('')).toBe(false);
        expect(gemiAdiGecerliMi('   ')).toBe(false);
    });

    it('string olmayan degerler icin false doner', () => {
        expect(gemiAdiGecerliMi(123)).toBe(false);
        expect(gemiAdiGecerliMi(undefined)).toBe(false);
        expect(gemiAdiGecerliMi(null)).toBe(false);
    });

    it('100 karakterden uzun metinler icin false doner', () => {
        expect(gemiAdiGecerliMi('a'.repeat(101))).toBe(false);
    });
});

describe('sayiGecerliMi', () => {
    it('gecerli tam sayilar icin true doner', () => {
        expect(sayiGecerliMi(0)).toBe(true);
        expect(sayiGecerliMi(42)).toBe(true);
    });

    it('negatif sayilar icin false doner', () => {
        expect(sayiGecerliMi(-1)).toBe(false);
    });

    it('tam sayi olmayan degerler icin false doner', () => {
        expect(sayiGecerliMi(1.5)).toBe(false);
        expect(sayiGecerliMi('5')).toBe(false);
        expect(sayiGecerliMi(undefined)).toBe(false);
    });

    it('1000 den buyuk sayilar icin false doner', () => {
        expect(sayiGecerliMi(1001)).toBe(false);
    });
});
```

- [ ] **Step 2: Testleri çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run validation.test.js`
Beklenen: FAIL — `Cannot find module './validation.js'`

- [ ] **Step 3: `validation.js`'i yaz**

```js
function gemiAdiGecerliMi(deger) {
    return typeof deger === 'string' && deger.trim().length > 0 && deger.length <= 100;
}

function sayiGecerliMi(deger) {
    return typeof deger === 'number' && Number.isInteger(deger) && deger >= 0 && deger <= 1000;
}

module.exports = { gemiAdiGecerliMi, sayiGecerliMi };
```

- [ ] **Step 4: Testleri çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run validation.test.js`
Beklenen: PASS (9/9)

- [ ] **Step 5: `server.js`'e bağla**

`const { izinliOrijinListesi, corsOrijinKontrolu } = require('./cors.js');` satırının altına ekle:
```js
const { gemiAdiGecerliMi, sayiGecerliMi } = require('./validation.js');
```

`acil-durum-baslat` ve `acil-durum-bitir` handler'larındaki anahtar kontrolünün hemen altına ekle:
```js
    if (!gemiAdiGecerliMi(bilgi?.gemi_adi)) {
        console.log('GECERSIZ gemi_adi ile istek. ID:', soket.id);
        return;
    }
```

`yolcu-sayisi-guncelle` handler'ının anahtar kontrolünün altına ekle:
```js
    if (!sayiGecerliMi(bilgi?.sayi) || !gemiAdiGecerliMi(bilgi?.gemi_adi)) {
        console.log('GECERSIZ veri ile yolcu-sayisi-guncelle denemesi. ID:', soket.id);
        return;
    }
```

- [ ] **Step 6: Elle doğrula**

Task 3'teki manuel doğrulama script'ini `gemi_adi` alanı olmadan veya boş göndererek tekrarla, sunucu konsolunda `GECERSIZ` logunu ve yayın yapılmadığını gör.

- [ ] **Step 7: Commit**

```bash
git add validation.js validation.test.js server.js
git commit -m "feat: socket event payloadlarina temel dogrulama ekle"
```

---

### Task 6: Client'a sızan hata detaylarını kes

**Files:**
- Modify: `server.js`
- Modify: `server.test.js`

**Interfaces:**
- Produces: `sunucuHatasiYanitla(res, hata, genelMesaj) -> void` (export edilmez, `server.js` içinde kullanılır; test için `module.exports`'a eklenir)

- [ ] **Step 1: Başarısız testi yaz**

`server.test.js`'e ekle (mevcut `describe('POST /reset-gemi', ...)` bloğunun altına):
```js
const { sunucuHatasiYanitla } = require('./server.js');

describe('sunucuHatasiYanitla', () => {
    it('client a genel mesaji doner, hata detayini sizdirmaz', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const sahteRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const hata = new Error('SELECT basarisiz: baglanti dizesi hatali kullanici adi icerir');

        sunucuHatasiYanitla(sahteRes, hata, 'Ilgi noktalari alinamadi');

        expect(sahteRes.status).toHaveBeenCalledWith(500);
        expect(sahteRes.json).toHaveBeenCalledWith({ hata: 'Ilgi noktalari alinamadi' });
        consoleSpy.mockRestore();
    });
});
```

Dosyanın en üstüne `vi` import'unu ekle (mevcut import satırını güncelle):
```js
const { describe, it, expect, afterAll, vi } = require('vitest');
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run server.test.js`
Beklenen: FAIL — `sunucuHatasiYanitla is not a function` (henüz export edilmiyor)

- [ ] **Step 3: `server.js`'e fonksiyonu ekle ve kullan**

`konumKontrolVeYayinla` fonksiyonunun üstüne ekle:
```js
function sunucuHatasiYanitla(res, hata, genelMesaj) {
    console.error(genelMesaj + ':', hata.message);
    res.status(500).json({ hata: genelMesaj });
}
```

`/tum-noktalar` handler'ındaki catch bloğunu güncelle:
```js
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Ilgi noktalari alinamadi');
    }
```

`/hava-durumu` handler'ını güncelle:
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

`module.exports` satırını güncelle:
```js
module.exports = { app, sunucu, havuz, sunucuHatasiYanitla };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run server.test.js`
Beklenen: PASS (4/4)

- [ ] **Step 5: Tüm test paketini çalıştır**

Çalıştır: `npm test`
Beklenen: tüm dosyalardaki tüm testler PASS (auth, cors, validation, server)

- [ ] **Step 6: Commit**

```bash
git add server.js server.test.js
git commit -m "fix: hata mesajlarinin client a sizmasini engelle, sadece sunucu logunda tut"
```

---

### Task 7: Personel app — anahtarı build-time env'den kaldır, çalışma zamanında SecureStore'a al

**Files:**
- Modify: `ido-navigasyon-personel/App.js`
- Modify: `ido-navigasyon-personel/package.json`
- Modify: `ido-navigasyon-personel/.env.example`

**Bağlam:** `EXPO_PUBLIC_PERSONEL_ANAHTARI` önekiyle tanımlı değişkenler Expo tarafından derleme zamanında JS bundle'ına gömülür — yani uygulamayı yükleyen/decompile eden herkes anahtarı çıkarabilir. Bunun yerine anahtar, uygulama ilk açıldığında personel tarafından girilecek ve cihazın güvenli deposunda (`expo-secure-store`, iOS Keychain / Android Keystore) saklanacak. Bu dosyada mevcut test altyapısı yok (React Native UI testi bu fazın kapsamı dışında, Faz 6'da ele alınacak) — bu görev elle doğrulama ile kapanıyor.

- [ ] **Step 1: `expo-secure-store`'u kur**

Çalıştır (`ido-navigasyon-personel` dizininde): `npx expo install expo-secure-store`

- [ ] **Step 2: `App.js`'i güncelle**

Dosyanın başındaki import ve sabitleri güncelle:
```js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, TextInput } from 'react-native';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const SUNUCU_ADRESI = process.env.EXPO_PUBLIC_SUNUCU_ADRESI || 'https://ido-navigasyon-backend.onrender.com';
const ANAHTAR_DEPO_ADI = 'personel_anahtari';
```

`export default function App() {` içindeki state tanımlarının başına ekle:
```js
  const [personelAnahtari, setPersonelAnahtari] = useState(null);
  const [anahtarYukleniyor, setAnahtarYukleniyor] = useState(true);
  const [anahtarGirisi, setAnahtarGirisi] = useState('');
```

Mevcut `useEffect(() => { const soket = io(...` bloğunun ÜSTÜNE yeni bir `useEffect` ekle (kayıtlı anahtarı cihazdan yükler):
```js
  useEffect(() => {
    SecureStore.getItemAsync(ANAHTAR_DEPO_ADI).then((deger) => {
      setPersonelAnahtari(deger);
      setAnahtarYukleniyor(false);
    });
  }, []);
```

`acilDurumBaslat`, `acilDurumBitir`, `yolcuSayisiDegistir` fonksiyonlarındaki `anahtar: PERSONEL_ANAHTARI` referanslarının hepsini `anahtar: personelAnahtari` olarak değiştir (3 yer).

Anahtar kaydetme fonksiyonunu `yolcuSayisiDegistir` fonksiyonunun altına ekle:
```js
  async function anahtariKaydet() {
    const temizlenmis = anahtarGirisi.trim();
    if (!temizlenmis) {
      Alert.alert('Hata', 'Lutfen gecerli bir anahtar girin.');
      return;
    }
    await SecureStore.setItemAsync(ANAHTAR_DEPO_ADI, temizlenmis);
    setPersonelAnahtari(temizlenmis);
  }
```

`return (` bloğunun en başına, `<View style={styles.disKapsayici}>`'den hemen sonra, mevcut içeriği aşağıdaki koşulla sarmala:
```js
  return (
    <View style={styles.disKapsayici}>
      <StatusBar barStyle="light-content" backgroundColor="#0D3B66" />

      {anahtarYukleniyor ? (
        <View style={styles.govde}>
          <Text style={styles.etiket}>Yukleniyor...</Text>
        </View>
      ) : !personelAnahtari ? (
        <View style={styles.govde}>
          <View style={styles.durumKutusu}>
            <Text style={styles.etiket}>PERSONEL ANAHTARI</Text>
            <TextInput
              style={styles.anahtarGirisAlani}
              value={anahtarGirisi}
              onChangeText={setAnahtarGirisi}
              placeholder="Anahtari girin"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <TouchableOpacity style={[styles.buyukButon, styles.bitirButon]} onPress={anahtariKaydet}>
            <Text style={styles.buyukButonYazi}>KAYDET</Text>
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
          </View>
        </>
      )}
    </View>
  );
}
```

`styles` tanımına ekle (`durumKutusu` tanımının altına):
```js
  anahtarGirisAlani: {
    borderWidth: 1,
    borderColor: '#5B7A8F',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#0D3B66',
  },
```

- [ ] **Step 3: `.env.example`'ı güncelle**

`ido-navigasyon-personel/.env.example` içeriğini şuna indir (anahtar satırını kaldır):
```
EXPO_PUBLIC_SUNUCU_ADRESI=https://ido-navigasyon-backend.onrender.com
```

- [ ] **Step 4: Elle doğrula**

1. Çalıştır: `npx expo start` (`ido-navigasyon-personel` dizininde)
2. Uygulamayı simülatörde/cihazda aç — ilk açılışta "PERSONEL ANAHTARI" giriş ekranı görünmeli (ana panel değil).
3. Herhangi bir test anahtarı gir, KAYDET'e bas — ana panel (Personel Paneli, bağlantı durumu vb.) görünmeli.
4. Uygulamayı tamamen kapatıp yeniden aç — anahtar giriş ekranı **tekrar görünmemeli**, direkt ana panel açılmalı (SecureStore'dan yüklendi).
5. Backend'i `PERSONEL_ANAHTARI=dogru-anahtar node server.js` ile başlat, personel app'te girilen anahtarı `dogru-anahtar` yap, "ACIL DURUM BASLAT"a bas — backend konsolunda `ACIL DURUM BASLATILDI` logu görünmeli.
6. Uygulamayı kapatıp anahtar deposunu temizle (uygulamayı cihazdan kaldır/yeniden yükle) ve bu sefer yanlış bir anahtar gir — backend konsolunda `YETKISIZ acil-durum-baslat denemesi` görünmeli, yolcu app'e hiçbir alarm yayınlanmamalı.

- [ ] **Step 5: Commit**

```bash
git add ido-navigasyon-personel/App.js ido-navigasyon-personel/package.json ido-navigasyon-personel/package-lock.json ido-navigasyon-personel/.env.example
git commit -m "fix: personel anahtarini build-time env yerine calisma zamaninda SecureStore'a tasi"
```

---

## Faz 0 Tamamlandığında

- [ ] `npm test` (backend) tüm testleri yeşil geçiyor.
- [ ] `/reset-gemi` anahtarsız/yanlış anahtarla 401 dönüyor.
- [ ] Socket event'leri (acil durum, yolcu sayısı) sabit-zamanlı doğrulama kullanıyor.
- [ ] Socket.io CORS'u `*` değil, allowlist.
- [ ] Socket payload'ları (`gemi_adi`, `sayi`) doğrulanıyor.
- [ ] `/tum-noktalar` ve `/hava-durumu` client'a ham hata mesajı döndürmüyor.
- [ ] Personel app'te anahtar build'e gömülü değil, SecureStore'da.
- [ ] Roadmap dosyasında (`2026-08-07-profesyonellesme-yol-haritasi.md`) Faz 0 tamamlandı olarak işaretlendi.
