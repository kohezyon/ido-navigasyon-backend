# Faz 3 — Gerçek GPS Entegrasyonu — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ido-navigasyon-backend`'in sahte GPS simülasyonunu (`sahteGpsGuncelle`), kaptan/personel telefonundan gelen gerçek konumla değiştirmek; personel app'e bu konumu 5 saniyede bir (sadece ön planda) sunucuya gönderen bir istemci eklemek.

**Architecture:** Mevcut sefer-bazlı `aktifSeferler` Map'i (Faz 2) korunur. Yeni bir `konum-guncelle` socket event'i (mevcut `acil-durum-baslat` auth deseniyle aynı: kimlik + oturum süresi + rol + sefer-seçili kontrolü), gelen `{enlem, boylam, hiz}` payload'ını doğrulayıp `sefer.konum`'u doğrudan günceller — artık adım adım simülasyon yok. `konumKontrolVeYayinla`, tüm `aktifSeferler` üzerinde dönen saniyede-bir bir `setInterval` yerine, her `konum-guncelle` geldiğinde tek bir sefer için çağrılan bir fonksiyona dönüşür. Hedefe metre-bazlı yakınlık (`VARIS_ESIGI_METRE`) ile hedef ilerletme/varış tespiti yapılır (eskiden derece-bazlıydı, sabit adım simülasyonuna özgüydü). ETA hesabı, cihazın bildirdiği gerçek hızı (`coords.speed`, Expo Location) kullanır; hız gelmezse/`<=0` ise sabit bir varsayılan hıza (`VARSAYILAN_HIZ_METRE_SANIYE`) düşer.

**Tech Stack:** Mevcut Express + Socket.io + `pg` + Vitest + Supertest + `socket.io-client` test altyapısı (backend); personel app'e yeni bağımlılık: `expo-location`.

## Global Constraints

- Backend üretim kodu CommonJS (`require`/`module.exports`) kalacak.
- Değişken/fonksiyon isimlendirmesi Türkçe kalacak (`konumGecerliMi`, `hedefIlerlet`, `konumKontrolVeYayinla` gibi).
- Test dosyaları `import { describe, it, expect, vi } from 'vitest'` + `require(...)` karışık deseni izleyecek (mevcut `server.test.js`/`validation.test.js` konvansiyonu).
- `konum-guncelle` event'i mevcut `acil-durum-baslat` ile birebir aynı auth sırasını izler: (1) `soket.data.kullanici` yoksa `{tamam:false, hata:'Yetkisiz'}`, (2) `oturumSuresiDolduMu(soket)` ise `{tamam:false, hata:'Oturum suresi doldu'}`, (3) rol `kaptan`/`admin` değilse `{tamam:false, hata:'Yetkisiz rol'}`, (4) `aktifSeferler.get(soket.data.aktifSeferId)` yoksa `{tamam:false, hata:'Sefer secilmedi'}`.
- Bu faz kapsamında YOK: anomali/hız-sıçraması reddi, "sinyal kesildi" göstergesi, arka plan (background) konum takibi, yolcu app değişikliği. Bunlar plan dışıdır — eklenmeyecek.
- `VARIS_ESIGI_METRE = 50`, `VARSAYILAN_HIZ_METRE_SANIYE = 7` — tasarım dokümanında belirlenen sabit değerler, aynen kullanılacak.
- Personel app'te otomatik test altyapısı yok (proje kararı); Task 4 manuel doğrulama ile tamamlanır.
- Mobil app değişikliklerinde `ido-navigasyon-personel/AGENTS.md` "Expo HAS CHANGED — https://docs.expo.dev/versions/v54.0.0/ adresindeki güncel dokümantasyonu kod yazmadan önce oku" talimatını veriyor; bu dizinde çalışırken geçerlidir.

---

### Task 1: `konumGecerliMi` doğrulama fonksiyonu

**Files:**
- Modify: `validation.js`
- Modify: `validation.test.js`

**Interfaces:**
- Produces: `konumGecerliMi(enlem, boylam) -> boolean` — Task 3 tarafından kullanılacak.

- [ ] **Step 1: Başarısız testleri yaz**

`validation.test.js`'in sonuna (`describe('sayiGecerliMi', ...)` bloğundan sonra) ekle:
```js
describe('konumGecerliMi', () => {
    it('gecerli enlem/boylam degerleri icin true doner', () => {
        expect(konumGecerliMi(40.65, 29.26)).toBe(true);
        expect(konumGecerliMi(0, 0)).toBe(true);
        expect(konumGecerliMi(-90, -180)).toBe(true);
        expect(konumGecerliMi(90, 180)).toBe(true);
    });

    it('enlem araligin (-90, 90) disindaysa false doner', () => {
        expect(konumGecerliMi(90.1, 29.26)).toBe(false);
        expect(konumGecerliMi(-90.1, 29.26)).toBe(false);
    });

    it('boylam araligin (-180, 180) disindaysa false doner', () => {
        expect(konumGecerliMi(40.65, 180.1)).toBe(false);
        expect(konumGecerliMi(40.65, -180.1)).toBe(false);
    });

    it('sayi olmayan degerler icin false doner', () => {
        expect(konumGecerliMi('40.65', 29.26)).toBe(false);
        expect(konumGecerliMi(40.65, '29.26')).toBe(false);
        expect(konumGecerliMi(undefined, 29.26)).toBe(false);
        expect(konumGecerliMi(40.65, undefined)).toBe(false);
        expect(konumGecerliMi(NaN, 29.26)).toBe(false);
    });
});
```

`validation.test.js`'in üstündeki require satırını:
```js
const { sayiGecerliMi } = require('./validation.js');
```
şununla değiştir:
```js
const { sayiGecerliMi, konumGecerliMi } = require('./validation.js');
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run validation.test.js`
Beklenen: FAIL — `konumGecerliMi is not defined` (henüz export edilmiyor)

- [ ] **Step 3: `konumGecerliMi`'yi `validation.js`'e ekle**

`validation.js`'deki:
```js
function sayiGecerliMi(deger) {
    return typeof deger === 'number' && Number.isInteger(deger) && deger >= 0 && deger <= 1000;
}

module.exports = { sayiGecerliMi };
```

şununla değiştir:
```js
function sayiGecerliMi(deger) {
    return typeof deger === 'number' && Number.isInteger(deger) && deger >= 0 && deger <= 1000;
}

function konumGecerliMi(enlem, boylam) {
    return typeof enlem === 'number' && !Number.isNaN(enlem) && enlem >= -90 && enlem <= 90
        && typeof boylam === 'number' && !Number.isNaN(boylam) && boylam >= -180 && boylam <= 180;
}

module.exports = { sayiGecerliMi, konumGecerliMi };
```

- [ ] **Step 4: Testi çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run validation.test.js`
Beklenen: PASS (8 test — 4 eski `sayiGecerliMi` + 4 yeni `konumGecerliMi`)

- [ ] **Step 5: Commit**

```bash
git add validation.js validation.test.js
git commit -m "feat: konumGecerliMi dogrulama fonksiyonu ekle"
```

---

### Task 2: `konumKontrolVeYayinla`'yı sefer-parametreli hale getir, sahte GPS simülasyonunu kaldır

**Files:**
- Modify: `server.js`
- Modify: `server.test.js`

**Interfaces:**
- Consumes: `ikiNoktaArasiMesafe`, `geofenceKontrolEt` (mevcut `geofencing.js`), `havuz` (mevcut `pg.Pool`).
- Produces: `konumKontrolVeYayinla(seferId, sefer, hizMetreSaniye) -> Promise<void>` (imza değişti — artık `aktifSeferler` üzerinde dönmüyor, tek bir sefer alıyor) — Task 3 tarafından `konum-guncelle` handler'ından çağrılacak. `VARIS_ESIGI_METRE`, `VARSAYILAN_HIZ_METRE_SANIYE` sabitleri — Task 3'ün auth/davranış beklentilerini şekillendirir ama doğrudan export edilmez.

Bu görev, `sahteGpsGuncelle`'ı ve saniyede-bir çalışan `setInterval`'i tamamen kaldırıp yerine gerçek konumla çalışacak, tek-sefer-parametreli bir `konumKontrolVeYayinla` koyar. Bu görevin testleri, konumun `konum-guncelle` event'i yerine doğrudan (elle) `sefer.konum`'a yazıldığı varsayımıyla çalışır — event handler'ın kendisi Task 3'te eklenecek.

- [ ] **Step 1: Başarısız testleri yaz — mevcut "coklu sefer bagimsizligi" testini değiştir**

`server.test.js`'deki `describe('seferStateOlustur ve konumKontrolVeYayinla - coklu sefer bagimsizligi', ...)` bloğu içindeki **ikinci testi** (`'iki aktif sefer birbirinden bagimsiz ilerler'`, satır ~81-105) tamamen şununla değiştir (ilk test, `seferStateOlustur ilk rota noktasini...`, aynen kalır):

```js
    it('konumKontrolVeYayinla sadece verilen seferi etkiler, digerine dokunmaz', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValue({ rows: [] });

        const seferA = { ...seferStateOlustur([
            { ad: 'A-Baslangic', enlem: 0, boylam: 0 },
            { ad: 'A-Hedef', enlem: 1, boylam: 0 }
        ]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' };
        const seferB = { ...seferStateOlustur([
            { ad: 'B-Baslangic', enlem: 10, boylam: 10 },
            { ad: 'B-Hedef', enlem: 10, boylam: 11 }
        ]), gemiId: 2, hatId: 2, gemiAdi: 'Gemi B' };
        aktifSeferler.set(1, seferA);
        aktifSeferler.set(2, seferB);

        const baslangicB = { ...seferB.konum };
        const bHedefIndexOncesi = seferB.hedefIndex;

        await konumKontrolVeYayinla(1, seferA, 7);

        expect(seferB.konum).toEqual(baslangicB);
        expect(seferB.hedefIndex).toBe(bHedefIndexOncesi);
    });

    it('hedefe VARIS_ESIGI_METRE icinde ise hedefIndex ilerler', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValue({ rows: [] });

        const sefer = { ...seferStateOlustur([
            { ad: 'Baslangic', enlem: 0, boylam: 0 },
            { ad: 'Hedef', enlem: 0.0001, boylam: 0 },
            { ad: 'Son', enlem: 1, boylam: 0 }
        ]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' };
        sefer.konum = { enlem: 0.0001, boylam: 0 }; // Hedef noktasinin ustunde (~0m), esigin (50m) altinda.
        aktifSeferler.set(1, sefer);

        await konumKontrolVeYayinla(1, sefer, 7);

        expect(sefer.hedefIndex).toBe(2);
    });

    it('hedefe VARIS_ESIGI_METRE disindaysa hedefIndex ilerlemez', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValue({ rows: [] });

        const sefer = { ...seferStateOlustur([
            { ad: 'Baslangic', enlem: 0, boylam: 0 },
            { ad: 'Hedef', enlem: 1, boylam: 0 }
        ]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' };
        sefer.konum = { enlem: 0.01, boylam: 0 }; // Hedefe (1,0) hala ~110km, esigin (50m) cok disinda.
        aktifSeferler.set(1, sefer);

        await konumKontrolVeYayinla(1, sefer, 7);

        expect(sefer.hedefIndex).toBe(1);
    });

    it('son hedefe ulasinca varis bildirimi gonderilir, tekrar cagrilinca tekrar gonderilmez', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValue({ rows: [] });

        const sefer = { ...seferStateOlustur([
            { ad: 'Baslangic', enlem: 0, boylam: 0 },
            { ad: 'Son', enlem: 0.0001, boylam: 0 }
        ]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' };
        sefer.konum = { enlem: 0.0001, boylam: 0 };
        aktifSeferler.set(1, sefer);

        await konumKontrolVeYayinla(1, sefer, 7);
        expect(sefer.varisBildirimiGonderildi).toBe(true);

        await konumKontrolVeYayinla(1, sefer, 7);
        expect(sefer.varisBildirimiGonderildi).toBe(true);
    });
```

- [ ] **Step 2: Testi çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run server.test.js -t "coklu sefer bagimsizligi|VARIS_ESIGI_METRE|varis bildirimi gonderilir"`
Beklenen: FAIL — `konumKontrolVeYayinla` hâlâ eski (parametresiz) imzayı bekliyor, `TypeError` veya davranış uyuşmazlığı.

- [ ] **Step 3: `server.js`'de sahte GPS'i kaldır, `konumKontrolVeYayinla`'yı yeniden yaz**

`server.js`'deki şu bloğu (satır ~40-41 civarı):
```js
const ADIM_BUYUKLUGU = 0.002;
const HIZ_METRE_SANIYE = ADIM_BUYUKLUGU * 111320;
```

şununla değiştir:
```js
const VARIS_ESIGI_METRE = 50;
const VARSAYILAN_HIZ_METRE_SANIYE = 7;
```

`sahteGpsGuncelle` fonksiyonunun tamamını (satır ~64-86 civarı):
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

şununla değiştir:
```js
function hedefIlerlet(sefer, seferId) {
    const hedefNokta = sefer.rotaNoktalari[sefer.hedefIndex];
    const hedefeMesafe = ikiNoktaArasiMesafe(sefer.konum.enlem, sefer.konum.boylam, hedefNokta.enlem, hedefNokta.boylam);

    if (hedefeMesafe <= VARIS_ESIGI_METRE) {
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

`konumKontrolVeYayinla` fonksiyonunun tamamını (satır ~103-147 civarı):
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

şununla değiştir:
```js
async function konumKontrolVeYayinla(seferId, sefer, hizMetreSaniye) {
    hedefIlerlet(sefer, seferId);
    const hiz = hizMetreSaniye > 0 ? hizMetreSaniye : VARSAYILAN_HIZ_METRE_SANIYE;

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
        const toplamKalanDakika = kalanToplamMesafe / hiz / 60;

        const hedefNokta = sefer.rotaNoktalari[sefer.hedefIndex];
        const hedefeMesafe = ikiNoktaArasiMesafe(sefer.konum.enlem, sefer.konum.boylam, hedefNokta.enlem, hedefNokta.boylam);
        const hedefeKalanDakika = hedefeMesafe / hiz / 60;

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
```

- [ ] **Step 4: `setInterval` kurulumunu kaldır**

`server.js`'in en altındaki:
```js
if (require.main === module) {
    setInterval(konumKontrolVeYayinla, 1000);
    sunucu.listen(PORT, () => {
        console.log(`Sunucu calisiyor: http://localhost:${PORT}`);
    });
}
```

şununla değiştir:
```js
if (require.main === module) {
    sunucu.listen(PORT, () => {
        console.log(`Sunucu calisiyor: http://localhost:${PORT}`);
    });
}
```

- [ ] **Step 5: Testleri çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run server.test.js -t "coklu sefer bagimsizligi|VARIS_ESIGI_METRE|varis bildirimi gonderilir"`
Beklenen: PASS (5 test — 1 eski `seferStateOlustur` testi + 4 yeni)

- [ ] **Step 6: Tüm test paketini çalıştır**

Çalıştır: `npm test`
Beklenen: Tüm testler PASS (bu görev sadece `konumKontrolVeYayinla`'yı kullanan tek testi değiştirdi; `sahteGpsGuncelle`/`ADIM_BUYUKLUGU`/`HIZ_METRE_SANIYE`'a başka hiçbir yerde referans yoktu — `grep -rn "sahteGpsGuncelle\|ADIM_BUYUKLUGU\|HIZ_METRE_SANIYE" --include="*.js" . | grep -v node_modules` çıktısı boş olmalı).

- [ ] **Step 7: Commit**

```bash
git add server.js server.test.js
git commit -m "feat: konumKontrolVeYayinla'yi sefer-parametreli hale getir, sahte GPS simulasyonunu kaldir"
```

---

### Task 3: `konum-guncelle` socket event'i — gerçek konumu kabul et ve yayınla

**Files:**
- Modify: `server.js`
- Modify: `server.test.js`

**Interfaces:**
- Consumes: `konumGecerliMi` (Task 1), `konumKontrolVeYayinla(seferId, sefer, hizMetreSaniye)` (Task 2), `oturumSuresiDolduMu`, `aktifSeferler` (mevcut).
- Produces: `konum-guncelle` socket event'i — Task 4'te personel app bu event'i `emit` edecek.

- [ ] **Step 1: `server.js`'in require bloğuna `konumGecerliMi`'yi ekle**

`const { sayiGecerliMi } = require('./validation.js');` satırını:
```js
const { sayiGecerliMi, konumGecerliMi } = require('./validation.js');
```
ile değiştir.

- [ ] **Step 2: Başarısız testleri yaz**

`server.test.js`'deki `describe('yolcu-sayisi-guncelle yetkilendirmesi', ...)` bloğunun kapanışından (`});`) hemen sonra, dosyanın en sonundaki `afterAll(...)` bloğundan önce ekle:

```js
describe('konum-guncelle yetkilendirmesi', () => {
    afterEach(() => {
        aktifSeferler.clear();
    });

    it('anonim (tokensiz) baglanti konum-guncelle gonderirse Yetkisiz doner', async () => {
        const gonderen = yeniSoketBaglantisi();
        await new Promise((resolve) => gonderen.on('connect', resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('konum-guncelle', { enlem: 40.65, boylam: 29.26 }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz' });
        gonderen.disconnect();
    });

    it('personel rolundeki token ile sefer secilmis olsa da konum-guncelle Yetkisiz rol doner', async () => {
        aktifSeferler.set(1, { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'personel1', rol: 'personel' }, process.env.JWT_GIZLI_ANAHTARI);
        const gonderen = yeniSoketBaglantisi({ auth: { token } });
        await new Promise((resolve) => gonderen.on('connect', resolve));
        await new Promise((resolve) => gonderen.emit('sefer-sec', { sefer_id: 1 }, resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('konum-guncelle', { enlem: 0.5, boylam: 0 }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz rol' });
        gonderen.disconnect();
    });

    it('kaptan rolunde ama sefer secilmeden konum-guncelle gonderilirse Sefer secilmedi doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const gonderen = yeniSoketBaglantisi({ auth: { token } });
        await new Promise((resolve) => gonderen.on('connect', resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('konum-guncelle', { enlem: 0.5, boylam: 0 }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Sefer secilmedi' });
        gonderen.disconnect();
    });

    it('gecersiz konum (araligin disinda) ile Gecersiz konum doner, sefer.konum degismez', async () => {
        const sefer = { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' };
        aktifSeferler.set(1, sefer);
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const gonderen = yeniSoketBaglantisi({ auth: { token } });
        await new Promise((resolve) => gonderen.on('connect', resolve));
        await new Promise((resolve) => gonderen.emit('sefer-sec', { sefer_id: 1 }, resolve));

        const oncekiKonum = { ...sefer.konum };
        const yanit = await new Promise((resolve) => {
            gonderen.emit('konum-guncelle', { enlem: 999, boylam: 0 }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Gecersiz konum' });
        expect(sefer.konum).toEqual(oncekiKonum);
        gonderen.disconnect();
    });

    it('gecerli konum kabul edilir, sefer.konum guncellenir ve odaya gemi-konum-guncelleme yayinlanir', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValue({ rows: [] });
        const sefer = { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 0 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' };
        aktifSeferler.set(1, sefer);
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const kaptan = yeniSoketBaglantisi({ auth: { token } });
        const dinleyici = yeniSoketBaglantisi();
        await new Promise((resolve) => kaptan.on('connect', resolve));
        await new Promise((resolve) => dinleyici.on('connect', resolve));
        await new Promise((resolve) => kaptan.emit('sefer-sec', { sefer_id: 1 }, resolve));
        await new Promise((resolve) => dinleyici.emit('sefer-sec', { sefer_id: 1 }, resolve));

        const yayinPromise = new Promise((resolve) => dinleyici.on('gemi-konum-guncelleme', resolve));
        const yanit = await new Promise((resolve) => {
            kaptan.emit('konum-guncelle', { enlem: 0.5, boylam: 0, hiz: 5 }, resolve);
        });
        const yayin = await yayinPromise;

        expect(yanit).toEqual({ tamam: true });
        expect(sefer.konum).toEqual({ enlem: 0.5, boylam: 0 });
        expect(yayin.enlem).toBe(0.5);
        expect(yayin.boylam).toBe(0);
        // hedefe (1,0) kalan mesafe ~55.5km; hiz=5 m/s ile hedefe_kalan_dakika = mesafe/5/60.
        expect(yayin.hedefe_kalan_dakika).toBeGreaterThan(0);

        kaptan.disconnect();
        dinleyici.disconnect();
    }, 10000);

    it('hiz gonderilmezse VARSAYILAN_HIZ_METRE_SANIYE ile hesaplanir (hiz gonderilenden daha yuksek ETA)', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValue({ rows: [] });
        const seferHizli = { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 0 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' };
        const seferYavas = { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 0 }]), gemiId: 2, hatId: 2, gemiAdi: 'Gemi B' };
        aktifSeferler.set(1, seferHizli);
        aktifSeferler.set(2, seferYavas);
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);

        const kaptanHizli = yeniSoketBaglantisi({ auth: { token } });
        const dinleyiciHizli = yeniSoketBaglantisi();
        await new Promise((resolve) => kaptanHizli.on('connect', resolve));
        await new Promise((resolve) => dinleyiciHizli.on('connect', resolve));
        await new Promise((resolve) => kaptanHizli.emit('sefer-sec', { sefer_id: 1 }, resolve));
        await new Promise((resolve) => dinleyiciHizli.emit('sefer-sec', { sefer_id: 1 }, resolve));
        const yayinHizliPromise = new Promise((resolve) => dinleyiciHizli.on('gemi-konum-guncelleme', resolve));
        await new Promise((resolve) => kaptanHizli.emit('konum-guncelle', { enlem: 0.5, boylam: 0, hiz: 20 }, resolve));
        const yayinHizli = await yayinHizliPromise;

        const kaptanYavas = yeniSoketBaglantisi({ auth: { token } });
        const dinleyiciYavas = yeniSoketBaglantisi();
        await new Promise((resolve) => kaptanYavas.on('connect', resolve));
        await new Promise((resolve) => dinleyiciYavas.on('connect', resolve));
        await new Promise((resolve) => kaptanYavas.emit('sefer-sec', { sefer_id: 2 }, resolve));
        await new Promise((resolve) => dinleyiciYavas.emit('sefer-sec', { sefer_id: 2 }, resolve));
        const yayinYavasPromise = new Promise((resolve) => dinleyiciYavas.on('gemi-konum-guncelleme', resolve));
        await new Promise((resolve) => kaptanYavas.emit('konum-guncelle', { enlem: 0.5, boylam: 0 }, resolve)); // hiz yok -> VARSAYILAN_HIZ_METRE_SANIYE=7
        const yayinYavas = await yayinYavasPromise;

        // Ayni mesafe, farkli hiz: hiz=20 olan daha kisa ETA, varsayilan hiz=7 olan daha uzun ETA vermeli.
        expect(yayinHizli.hedefe_kalan_dakika).toBeLessThan(yayinYavas.hedefe_kalan_dakika);

        kaptanHizli.disconnect();
        dinleyiciHizli.disconnect();
        kaptanYavas.disconnect();
        dinleyiciYavas.disconnect();
    }, 10000);
});
```

- [ ] **Step 3: Testleri çalıştırıp başarısız olduğunu doğrula**

Çalıştır: `npx vitest run server.test.js -t "konum-guncelle yetkilendirmesi"`
Beklenen: FAIL — `konum-guncelle` event'i için henüz bir handler yok (event timeout veya `undefined` yanıt).

- [ ] **Step 4: `konum-guncelle` handler'ını `server.js`'e ekle**

`soket.on('sefer-sec', ...)` bloğunun hemen üstüne (yani `yolcu-sayisi-guncelle` handler'ından sonra, `sefer-sec`'ten önce) ekle:

```js
    soket.on('konum-guncelle', (bilgi, geriBildir) => {
        if (!soket.data.kullanici) {
            console.log('KIMLIKSIZ baglanti ile konum-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz' });
            return;
        }
        if (oturumSuresiDolduMu(soket)) {
            console.log('SURESI DOLMUS TOKEN ile konum-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Oturum suresi doldu' });
            return;
        }
        if (!['kaptan', 'admin'].includes(soket.data.kullanici.rol)) {
            console.log('YETKISIZ ROL ile konum-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz rol' });
            return;
        }
        const sefer = aktifSeferler.get(soket.data.aktifSeferId);
        if (!sefer) {
            console.log('SEFER SECILMEMIS ile konum-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Sefer secilmedi' });
            return;
        }
        if (!konumGecerliMi(bilgi?.enlem, bilgi?.boylam)) {
            console.log('GECERSIZ konum ile konum-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz konum' });
            return;
        }
        sefer.konum = { enlem: bilgi.enlem, boylam: bilgi.boylam };
        konumKontrolVeYayinla(soket.data.aktifSeferId, sefer, bilgi.hiz);
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });

```

- [ ] **Step 5: Testleri çalıştırıp geçtiğini doğrula**

Çalıştır: `npx vitest run server.test.js -t "konum-guncelle yetkilendirmesi"`
Beklenen: PASS (6 test)

- [ ] **Step 6: Tüm test paketini birkaç kez çalıştır**

Çalıştır: `npm test` (art arda en az 3 kez — bu dosyadaki gerçek socket testleri bilinen ortamsal flakiness riski taşıyor, bkz. dosyanın üstündeki yorum).
Beklenen: Tüm çalıştırmalarda tüm testler PASS. Flaky bir başarısızlık görürsen: (a) tek başına `-t` ile tekrar çalıştırıp gerçek mi ortamsal mı ayır, (b) gerçekten ortamsal ise mevcut yorumdaki azaltma stratejisini (tek listen/close, `transports:['websocket']`) zaten kullanıyorsun — hiçbir testi silme/zayıflatma, sadece en ağır teste (`hiz gonderilmezse VARSAYILAN_HIZ_METRE_SANIYE...`, 4 soket bağlantısı içeriyor) zaman aşımı payını arttırmayı düşün.

- [ ] **Step 7: Commit**

```bash
git add server.js server.test.js
git commit -m "feat: konum-guncelle socket event'i ekle (gercek GPS konumunu kabul et ve yayinla)"
```

---

### Task 4: Personel app — gerçek GPS konumunu sunucuya gönder

**Files:**
- Modify: `ido-navigasyon-personel/App.js`
- Modify: `ido-navigasyon-personel/package.json` (bağımlılık)

**Interfaces:**
- Consumes: `konum-guncelle` socket event'i (Task 3).
- Test altyapısı yok (proje kararı): bu görev manuel doğrulama ile tamamlanır.

Bu görevi uygulamadan önce `ido-navigasyon-personel/AGENTS.md`'de belirtilen https://docs.expo.dev/versions/v54.0.0/ dokümantasyonunu (özellikle `expo-location` sayfası) kontrol et (proje konvansiyonu).

- [ ] **Step 1: `expo-location` bağımlılığını ekle**

Çalıştır (`ido-navigasyon-personel` dizininde):
```bash
npx expo install expo-location
```

Bu, `package.json`'a SDK 54 ile uyumlu bir `expo-location` sürümü ekler.

- [ ] **Step 2: `app.json`'a konum izni açıklamalarını ekle**

`ido-navigasyon-personel/app.json`'daki `"ios"` bloğuna (`"supportsTablet": true`'nun yanına) ekle:
```json
"infoPlist": {
  "NSLocationWhenInUseUsageDescription": "Gemi konumunu yolculara canli olarak gostermek icin konumunuza ihtiyacimiz var."
}
```

`"android"` bloğuna ekle:
```json
"permissions": ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]
```

- [ ] **Step 3: `App.js`'e konum izleme mantığını ekle**

`App.js`'in en üstündeki import'lara ekle:
```js
import * as Location from 'expo-location';
```

`useRef` tanımlarının yanına (`const soketRef = useRef(null);` satırının hemen altına) ekle:
```js
  const konumAboneligiRef = useRef(null);
  const [konumIzniHatasi, setKonumIzniHatasi] = useState(null);
```

`useEffect(() => { if (!erisimTokeni || !seciliSeferId) return; ... }, [erisimTokeni, seciliSeferId]);` bloğunun (soket bağlantısını kuran effect) `soket.on('connect', ...)` handler'ının hemen altına, `soket.on('disconnect', ...)`'ten önce, konum izlemeyi başlatan bir mantık ekle. Mevcut effect'in tamamı:

```js
  useEffect(() => {
    if (!erisimTokeni || !seciliSeferId) return;

    const soket = io(SUNUCU_ADRESI, { auth: { token: erisimTokeni } });
    soketRef.current = soket;

    soket.on('connect', () => {
      setBaglantiDurumu('Bagli');
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
```

şununla değiştir:

```js
  useEffect(() => {
    if (!erisimTokeni || !seciliSeferId) return;

    const soket = io(SUNUCU_ADRESI, { auth: { token: erisimTokeni } });
    soketRef.current = soket;

    soket.on('connect', () => {
      setBaglantiDurumu('Bagli');
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

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setKonumIzniHatasi('Konum izni verilmedi - gemi konumu paylasilamiyor.');
        return;
      }
      setKonumIzniHatasi(null);
      konumAboneligiRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000 },
        (konum) => {
          if (soketRef.current) {
            soketRef.current.emit('konum-guncelle', {
              enlem: konum.coords.latitude,
              boylam: konum.coords.longitude,
              hiz: konum.coords.speed,
            });
          }
        }
      );
    })();

    return () => {
      soket.disconnect();
      if (konumAboneligiRef.current) {
        konumAboneligiRef.current.remove();
        konumAboneligiRef.current = null;
      }
    };
  }, [erisimTokeni, seciliSeferId]);
```

- [ ] **Step 4: İzin reddedilirse görünür bir uyarı göster**

Panel render bloğunda (`else { icerik = ( <View style={styles.govde}> ... <View style={styles.durumKutusu}> <Text style={styles.etiket}>BAGLANTI DURUMU</Text> ... </View>` — "BAGLANTI DURUMU" kutusunun hemen altına, "ACIL DURUM STATUSU" kutusundan önce) ekle:

```jsx
        {konumIzniHatasi ? (
          <View style={styles.durumKutusu}>
            <Text style={styles.hataYazisi}>{konumIzniHatasi}</Text>
          </View>
        ) : null}
```

- [ ] **Step 5: Babel parse kontrolü**

Çalıştır (`ido-navigasyon-personel` dizininde):
```bash
node -e "require('@babel/core').transformFileSync('App.js', { presets: ['babel-preset-expo'] }); console.log('OK');"
```
Beklenen: `OK` (sözdizimi hatası yok). Bu ortamda gerçek bir Expo cihazı/emülatörü olmadığı için Step 6-7'deki manuel doğrulama bir insan operatör tarafından yapılmalı.

- [ ] **Step 6: Manuel doğrulama — izin verildiğinde konum gönderimi**

Gerçek bir cihazda/emülatörde: `db/gemiler_hatlar_seferler_seed.sql` uygulanmış olmalı, backend çalışıyor olmalı (`npm start`), personel app'te giriş yapıp bir sefer başlat/seç. Konum izni istendiğinde izin ver. Backend loglarında `Sefer <id> konum: ...` satırlarının ~5 saniyede bir göründüğünü doğrula.

- [ ] **Step 7: Manuel doğrulama — izin reddedilirse panel çökmemeli**

Aynı akışı izin reddederek dene: panelin yine açıldığını, "Konum izni verilmedi..." uyarısının göründüğünü, ACİL DURUM/yolcu sayısı butonlarının hâlâ çalıştığını doğrula.

- [ ] **Step 8: Commit**

```bash
git add ido-navigasyon-personel/App.js ido-navigasyon-personel/app.json ido-navigasyon-personel/package.json ido-navigasyon-personel/package-lock.json
git commit -m "feat: personel app gercek GPS konumunu 5 saniyede bir sunucuya gondersin"
```

---

## Faz 3 Tamamlandığında

- [ ] `npm test` (backend) tüm testleri yeşil geçiyor (art arda birkaç kez, flakiness kontrolü).
- [ ] `sahteGpsGuncelle`, `ADIM_BUYUKLUGU`, `HIZ_METRE_SANIYE`, `setInterval(konumKontrolVeYayinla, ...)` kod tabanında hiçbir yerde kalmadı.
- [ ] `konum-guncelle` event'i auth/rol/sefer-seçili/payload-doğrulama kontrollerinin hepsinden geçiyor, geçerli konumda `sefer.konum`'u günceleyip doğru odaya `gemi-konum-guncelleme` yayınlıyor.
- [ ] Personel app'te konum izni akışı gerçek cihazda manuel doğrulandı (izin verildi/reddedildi, her iki durumda da panel çökmedi).
- [ ] Roadmap dosyasında (`2026-08-07-profesyonellesme-yol-haritasi.md`) Faz 3 tamamlandı olarak işaretlendi.
