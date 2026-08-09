process.env.JWT_GIZLI_ANAHTARI = 'test-jwt-gizli-anahtari';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.ALLOWED_ORIGINS = 'https://izinli-site.com';

import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { app, havuz, sunucu } = require('./server.js');
const { aktifSeferler, seferStateOlustur, konumKontrolVeYayinla } = require('./server.js');

const { ikiNoktaArasiMesafe } = require('./geofencing.js');
const { sifreHashle } = require('./sifreYardimcisi.js');
const { yenilemeTokeniOlustur } = require('./jwtYardimcisi.js');
const { erisimTokeniOlustur } = require('./jwtYardimcisi.js');
const { tokenDogrula } = require('./jwtYardimcisi.js');

// Gercek socket.io-client baglantisi kuran describe bloklari (asagida) paylasilan
// `sunucu` (http.Server + tek Socket.io `io` ornegi) uzerinde calisir. Eskiden her
// blok kendi beforeAll/afterAll'inda sunucu.listen(0)/sunucu.close() cagiriyordu;
// bunu tum dosya icin TEK bir listen/close yasam dongusune indirgiyoruz (gereksiz
// yeniden baglanti/kapanma dongulerini azaltir).
//
// Flake onlemleri: (1) test istemcilerini `transports: ['websocket']` ile sabitleyip
// polling/yukseltme asamasini atliyoruz (bkz. asagidaki yeniSoketBaglantisi()), (2) en
// cok ag gidis-donusu iceren testlere makul bir zaman asimi payi taniyoruz, (3) asil
// kok neden olan 'connect' olayi kacirma yarisini baglantiyiBekle() ile kaldiriyoruz
// (bkz. asagidaki aciklama), (4) soket acan bloklar acilan soketleri afterEach'te
// kapatir, boylece zaman asimina ugrayan bir test dosya sonundaki sunucu.close()'u
// kilitleyemez. Olcum sonuclari icin bkz. final-review-fix-report.md.
let sunucuPortu;

beforeAll(async () => {
    await new Promise((resolve) => sunucu.listen(0, resolve));
    sunucuPortu = sunucu.address().port;
});

function yeniSoketBaglantisi(secenekler) {
    return ioClient(`http://localhost:${sunucuPortu}`, { transports: ['websocket'], ...secenekler });
}

// Asil flake kaynagi olcumle bulundu: bir testte iki soket birlikte aciliyor ama
// 'connect' dinleyicileri SIRAYLA (ilki await edildikten sonra) takiliyordu. Ikinci
// soket, birincinin await'i beklenirken baglanirsa 'connect' olayi kaciriliyor ve
// `new Promise((r) => soket.on('connect', r))` sonsuza kadar asili kaliyordu -> test
// 10sn zaman asimina ugruyor, disconnect'leri hic calismiyor ve dosya sonundaki
// afterAll'daki sunucu.close() de kilitleniyordu. Bu yardimci, soket zaten bagliysa
// hemen doner; boylece olayi kacirma yarisi tamamen ortadan kalkar.
function baglantiyiBekle(soket) {
    if (soket.connected) return Promise.resolve();
    return new Promise((resolve) => soket.once('connect', resolve));
}

describe('JWT_GIZLI_ANAHTARI dogrulamasi', () => {
    it('JWT_GIZLI_ANAHTARI tanimli degilse sunucu modulu yuklenirken hata firlatir', () => {
        const { spawnSync } = require('child_process');
        const sonuc = spawnSync(
            process.execPath,
            ['-e', "require('./server.js')"],
            {
                cwd: __dirname,
                env: { ...process.env, JWT_GIZLI_ANAHTARI: '' },
                encoding: 'utf-8'
            }
        );
        expect(sonuc.status).not.toBe(0);
        expect(sonuc.stderr).toMatch(/JWT_GIZLI_ANAHTARI tanimli olmali/);
    });
});

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

    it('araci nokta uzaktan gecilirse (VARIS_ESIGI_METRE disinda ama sonraki noktaya daha yakin) hedefIndex atlar', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValue({ rows: [] });

        const sefer = { ...seferStateOlustur([
            { ad: 'Baslangic', enlem: 40.65, boylam: 29.26 },
            { ad: 'Ara-Nokta', enlem: 40.72, boylam: 29.16 },
            { ad: 'Son', enlem: 40.8756, boylam: 29.0917 }
        ]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' };
        // Gercek bir feribotun ara noktayi genis bir yayla gectigi durum:
        // Ara-Nokta'ya (40.72,29.16) ~15.3 km (50m esiginin cok disinda), ama
        // Son'a (40.8756,29.0917) ~2.9 km, yani sonraki noktaya belirgin sekilde daha yakin.
        sefer.konum = { enlem: 40.85, boylam: 29.10 };
        aktifSeferler.set(1, sefer);

        await konumKontrolVeYayinla(1, sefer, 7);

        expect(sefer.hedefIndex).toBe(2);
        // Son noktaya ~2.9 km kaldigi icin varis bildirimi henuz gonderilmemeli.
        expect(sefer.varisBildirimiGonderildi).toBe(false);
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
});

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

    it('kullanici bulunamasa bile sifreDogrula cagrilir (zamanlama kanali korumasi)', async () => {
        // Not: server.js sifreDogrula'yi `const { sifreDogrula } = require('./sifreYardimcisi.js')`
        // ile modul yuklenirken destructure edip yerel bir sabite baglar. Bu yuzden
        // vi.spyOn(sifreYardimcisiModulu, 'sifreDogrula') server.js'in cagirdigi
        // referansi degistirmez ve casus hic tetiklenmez (yanlis-pozitif/negatif verir).
        // Bunun yerine sifreYardimcisi.js'in cagirdigi bcryptjs.compare'i casuslariz;
        // bcrypt.compare her seferinde modul nesnesi uzerinden (property access ile)
        // cagrildigi icin gercek zincir server.js -> sifreDogrula -> bcrypt.compare
        // buradan gercekten yakalanir.
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rows: [] });
        const bcrypt = require('bcryptjs');
        const casusBcryptCompare = vi.spyOn(bcrypt, 'compare');

        await request(app).post('/login').send({ kullanici_adi: 'yok', sifre: 'her-hangi-bir-sey' });

        expect(casusBcryptCompare).toHaveBeenCalled();
    });
});

describe('POST /token/yenile', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('gecersiz token ile 401 doner', async () => {
        const yanit = await request(app).post('/token/yenile').send({ yenilemeTokeni: 'bozuk.token.degeri' });
        expect(yanit.status).toBe(401);
    });

    it('yenilemeTokeni eksikse 401 doner', async () => {
        const yanit = await request(app).post('/token/yenile').send({});
        expect(yanit.status).toBe(401);
    });

    it('erisim tokeni ile denenirse (tur uyusmazligi) 401 doner', async () => {
        const erisim = erisimTokeniOlustur(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const yanit = await request(app).post('/token/yenile').send({ yenilemeTokeni: erisim });
        expect(yanit.status).toBe(401);
    });

    it('gecerli yenileme tokeni ile yeni erisim tokeni doner ve DB den guncel rolu kullanir', async () => {
        const yenileme = yenilemeTokeniOlustur(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({
            rows: [{ id: 1, kullanici_adi: 'kaptan1', sifre_hash: 'hash', rol: 'admin' }]
        });
        const yanit = await request(app).post('/token/yenile').send({ yenilemeTokeni: yenileme });
        expect(yanit.status).toBe(200);
        expect(typeof yanit.body.erisimTokeni).toBe('string');

        const yeniPayload = tokenDogrula(yanit.body.erisimTokeni, process.env.JWT_GIZLI_ANAHTARI);
        expect(yeniPayload.rol).toBe('admin');
        expect(yeniPayload.tur).toBe('erisim');
    });

    it('kullanici artik DB de bulunamiyorsa (silinmis/pasif hesap) 401 doner', async () => {
        const yenileme = yenilemeTokeniOlustur(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rows: [] });
        const yanit = await request(app).post('/token/yenile').send({ yenilemeTokeni: yenileme });
        expect(yanit.status).toBe(401);
    });
});

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

    it('tek rota noktali hat ile 400 doner (en az baslangic ve hedef gerekir)', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        vi.spyOn(havuz, 'query')
            .mockResolvedValueOnce({ rows: [{ id: 1, ad: 'Yalova Feribotu 1' }] }) // gemiGetir
            .mockResolvedValueOnce({ rows: [{ ad: 'Yalova', enlem: 40.65, boylam: 29.26 }] }); // rotaNoktalariGetir tek nokta
        const yanit = await request(app)
            .post('/sefer/baslat')
            .set('Authorization', `Bearer ${token}`)
            .send({ gemi_id: 1, hat_id: 1 });
        expect(yanit.status).toBe(400);
        expect(yanit.body).toEqual({ hata: 'Gecersiz hat_id' });
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

describe('POST /sefer/bitir', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        aktifSeferler.clear();
    });

    it('gecersiz sefer_id (sayi degil) ile 404 doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const yanit = await request(app)
            .post('/sefer/bitir')
            .set('Authorization', `Bearer ${token}`)
            .send({ sefer_id: 'sayi-degil' });
        expect(yanit.status).toBe(404);
    });

    it('DB de hic var olmayan sefer_id ile 404 doner (UPDATE 0 satir etkiler)', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rowCount: 0 });

        const yanit = await request(app)
            .post('/sefer/bitir')
            .set('Authorization', `Bearer ${token}`)
            .send({ sefer_id: 999 });

        expect(yanit.status).toBe(404);
        expect(yanit.body).toEqual({ hata: 'Aktif sefer bulunamadi' });
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

    it('DB de aktif ama aktifSeferler de olmayan sefer basariyla bitirilir (sunucu yeniden baslatma senaryosu)', async () => {
        // aktifSeferler bos: sunucu yeniden baslamis gibi. DB'de bitis_zamani IS NULL
        // olan bir sefer hala mevcut. /sefer/bitir bellek durumuna degil DB durumuna
        // gore calismali; bu senaryoda 404 degil basari donmeli.
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        expect(aktifSeferler.has(13)).toBe(false);
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rowCount: 1 });

        const yanit = await request(app)
            .post('/sefer/bitir')
            .set('Authorization', `Bearer ${token}`)
            .send({ sefer_id: 13 });

        expect(yanit.status).toBe(200);
        expect(yanit.body).toEqual({ tamam: true });
        expect(havuz.query).toHaveBeenCalledWith(
            'UPDATE seferler SET bitis_zamani = now() WHERE id = $1 AND bitis_zamani IS NULL',
            [13]
        );
    });

    it('zaten bitmis bir seferi tekrar bitirmeye calisinca 404 doner, bitis_zamani tekrar guncellenmez', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        vi.spyOn(havuz, 'query').mockResolvedValueOnce({ rowCount: 0 });

        const yanit = await request(app)
            .post('/sefer/bitir')
            .set('Authorization', `Bearer ${token}`)
            .send({ sefer_id: 21 });

        expect(yanit.status).toBe(404);
        expect(yanit.body).toEqual({ hata: 'Aktif sefer bulunamadi' });
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

const { sunucuHatasiYanitla } = require('./server.js');

describe('sunucuHatasiYanitla', () => {
    it('client a genel mesaji doner, hata detayini sizdirmaz', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const sahteRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const hata = new Error('SELECT basarisiz: baglanti dizesi hatali kullanici adi icerir');

        sunucuHatasiYanitla(sahteRes, hata, 'Ilgi noktalari alinamadi');

        expect(sahteRes.status).toHaveBeenCalledWith(500);
        expect(sahteRes.json).toHaveBeenCalledWith({ hata: 'Ilgi noktalari alinamadi' });
        expect(consoleSpy).toHaveBeenCalledWith('Ilgi noktalari alinamadi:', hata.message);
        consoleSpy.mockRestore();
    });
});

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

describe('bozuk JSON govdesi', () => {
    it('gecersiz JSON gonderildiginde yigin izi sizdirmadan 400 doner', async () => {
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Content-Type', 'application/json')
            .send('{bozuk');
        expect(yanit.status).toBe(400);
        expect(yanit.body).toEqual({ hata: 'Istek islenemedi' });
        expect(JSON.stringify(yanit.body)).not.toMatch(/at .*\.js:\d+/);
    });
});

describe('acil-durum-baslat socket yetkilendirmesi', () => {
    afterEach(() => {
        aktifSeferler.clear();
    });

    it('token gonderilmezse baglanti kurulur (yolcu app icin anonim/dinleyici erisim)', async () => {
        const gonderen = yeniSoketBaglantisi();
        await baglantiyiBekle(gonderen);
        expect(gonderen.connected).toBe(true);
        gonderen.disconnect();
    });

    it('yenileme tokeni ile baglanti reddedilir (tur uyusmazligi)', async () => {
        const yenileme = yenilemeTokeniOlustur(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const gonderen = yeniSoketBaglantisi({ auth: { token: yenileme } });
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

        const gonderen = yeniSoketBaglantisi({ auth: { token: kisaOmurluToken } });
        await baglantiyiBekle(gonderen);
        await new Promise((resolve) => gonderen.emit('sefer-sec', { sefer_id: 1 }, resolve));

        await new Promise((resolve) => setTimeout(resolve, 1200));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', {}, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Oturum suresi doldu' });
        gonderen.disconnect();
    }, 10000);

    it('gecersiz/aktif olmayan sefer_id ile sefer-sec basarisiz doner', async () => {
        const gonderen = yeniSoketBaglantisi();
        await baglantiyiBekle(gonderen);

        const yanit = await new Promise((resolve) => {
            gonderen.emit('sefer-sec', { sefer_id: 999 }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Gecersiz veya aktif olmayan sefer' });
        gonderen.disconnect();
    });

    it('sefer secilmeden acil-durum-baslat gonderilirse "Sefer secilmedi" doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const gonderen = yeniSoketBaglantisi({ auth: { token } });
        await baglantiyiBekle(gonderen);

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', {}, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Sefer secilmedi' });
        gonderen.disconnect();
    });

    it('personel rolundeki token ile sefer secilir ama acil-durum-baslat Yetkisiz rol doner', async () => {
        aktifSeferler.set(1, { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'personel1', rol: 'personel' }, process.env.JWT_GIZLI_ANAHTARI);
        const gonderen = yeniSoketBaglantisi({ auth: { token } });
        await baglantiyiBekle(gonderen);
        await new Promise((resolve) => gonderen.emit('sefer-sec', { sefer_id: 1 }, resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', {}, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz rol' });
        gonderen.disconnect();
    });

    it('sefer-sec basarili oldugunda mevcut acil durum, yolcu sayisi ve konum durumunu doner', async () => {
        const sefer = { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' };
        aktifSeferler.set(1, sefer);

        const gonderen = yeniSoketBaglantisi();
        await baglantiyiBekle(gonderen);

        const ilkYanit = await new Promise((resolve) => gonderen.emit('sefer-sec', { sefer_id: 1 }, resolve));
        // konum, kaptanin ilk GPS verisi gelmeden de dolu olmali (rotanin ilk noktasi).
        expect(ilkYanit).toEqual({ tamam: true, acil_durum_aktif: false, yolcu_sayisi: 0, konum: { enlem: 0, boylam: 0 } });
        expect(ilkYanit.konum).toEqual(sefer.konum);

        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const kaptan = yeniSoketBaglantisi({ auth: { token } });
        await baglantiyiBekle(kaptan);
        await new Promise((resolve) => kaptan.emit('sefer-sec', { sefer_id: 1 }, resolve));
        await new Promise((resolve) => kaptan.emit('acil-durum-baslat', {}, resolve));
        await new Promise((resolve) => kaptan.emit('yolcu-sayisi-guncelle', { sayi: 4 }, resolve));
        sefer.konum = { enlem: 0.5, boylam: 0.5 };

        const gonderenIki = yeniSoketBaglantisi();
        await baglantiyiBekle(gonderenIki);
        const ikinciYanit = await new Promise((resolve) => gonderenIki.emit('sefer-sec', { sefer_id: 1 }, resolve));
        expect(ikinciYanit).toEqual({ tamam: true, acil_durum_aktif: true, yolcu_sayisi: 4, konum: { enlem: 0.5, boylam: 0.5 } });
        expect(ikinciYanit.konum).toEqual(sefer.konum);

        gonderen.disconnect();
        kaptan.disconnect();
        gonderenIki.disconnect();
    });

});

describe('sefer odasi izolasyonu', () => {
    afterEach(() => {
        aktifSeferler.clear();
    });

    it('sefer odasi disindaki dinleyiciye acil-durum-uyarisi sizmaz, oda icindekine ulasir', async () => {
        aktifSeferler.set(1, { ...seferStateOlustur([{ ad: 'A1', enlem: 0, boylam: 0 }, { ad: 'A2', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        aktifSeferler.set(2, { ...seferStateOlustur([{ ad: 'B1', enlem: 10, boylam: 10 }, { ad: 'B2', enlem: 11, boylam: 11 }]), gemiId: 2, hatId: 2, gemiAdi: 'Gemi B' });

        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const kaptanA = yeniSoketBaglantisi({ auth: { token } });
        const dinleyiciA = yeniSoketBaglantisi();
        const dinleyiciB = yeniSoketBaglantisi();

        await Promise.all([kaptanA, dinleyiciA, dinleyiciB].map(baglantiyiBekle));
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

describe('yolcu-sayisi-guncelle yetkilendirmesi', () => {
    afterEach(() => {
        aktifSeferler.clear();
    });

    it('anonim (tokensiz) baglanti yolcu-sayisi-guncelle gonderirse Yetkisiz doner', async () => {
        const gonderen = yeniSoketBaglantisi();
        await baglantiyiBekle(gonderen);

        const yanit = await new Promise((resolve) => {
            gonderen.emit('yolcu-sayisi-guncelle', { sayi: 3 }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz' });
        gonderen.disconnect();
    });

    // Bu test 2 gercek soket baglantisi + 4 ack + 1 yayin (5 ag gidis-donusu) icerir.
    // Varsayilan 5000ms vitest zaman asimi, tum test dosyalari paralel calisirken
    // ara sira olusan CPU cekismesi altinda bu kadar gidis-donus icin dar kaliyordu;
    // paylasilan yeniSoketBaglantisi() zaten transports:['websocket'] ile polling
    // yukseltme asamasini atlıyor, burada ayrica makul bir pay birakiyoruz.
    it('gecerli token ile sefer secilmis herhangi bir rol yolcu-sayisi-yayin yapabilir, sadece o sefer odasina', async () => {
        aktifSeferler.set(1, { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'personel1', rol: 'personel' }, process.env.JWT_GIZLI_ANAHTARI);

        const gonderen = yeniSoketBaglantisi({ auth: { token } });
        const dinleyici = yeniSoketBaglantisi();
        await baglantiyiBekle(gonderen);
        await baglantiyiBekle(dinleyici);
        await new Promise((resolve) => gonderen.emit('sefer-sec', { sefer_id: 1 }, resolve));
        await new Promise((resolve) => dinleyici.emit('sefer-sec', { sefer_id: 1 }, resolve));

        const yayinPromise = new Promise((resolve) => dinleyici.on('yolcu-sayisi-yayin', resolve));
        gonderen.emit('yolcu-sayisi-guncelle', { sayi: 3 }, () => {});
        const yayin = await yayinPromise;

        expect(yayin).toEqual({ sayi: 3, gemi_adi: 'Gemi A' });
        gonderen.disconnect();
        dinleyici.disconnect();
    }, 10000);
});

describe('konum-guncelle yetkilendirmesi', () => {
    // Bu bloktaki testler gercek soket baglantilari acar. Bir test zaman asimina
    // ugrarsa sonundaki .disconnect() cagrilari hic calismaz; acik kalan soketler
    // dosya sonundaki afterAll'daki sunucu.close()'u bloklayip tek bir flake testi
    // tum dosyanin basarisizligina cevirirdi. Acilan her soketi burada takip edip
    // afterEach'te kapatiyoruz (mutlu yoldaki disconnect'ler yerine gecmez, guvenlik agi).
    let acikSoketler = [];

    function izlenenSoket(secenekler) {
        const soket = yeniSoketBaglantisi(secenekler);
        acikSoketler.push(soket);
        return soket;
    }

    afterEach(() => {
        acikSoketler.forEach((s) => s.disconnect());
        acikSoketler = [];
        aktifSeferler.clear();
    });

    it('anonim (tokensiz) baglanti konum-guncelle gonderirse Yetkisiz doner', async () => {
        const gonderen = izlenenSoket();
        await baglantiyiBekle(gonderen);

        const yanit = await new Promise((resolve) => {
            gonderen.emit('konum-guncelle', { enlem: 40.65, boylam: 29.26 }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz' });
        gonderen.disconnect();
    });

    it('personel rolundeki token ile sefer secilmis olsa da konum-guncelle Yetkisiz rol doner', async () => {
        aktifSeferler.set(1, { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 1 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' });
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'personel1', rol: 'personel' }, process.env.JWT_GIZLI_ANAHTARI);
        const gonderen = izlenenSoket({ auth: { token } });
        await baglantiyiBekle(gonderen);
        await new Promise((resolve) => gonderen.emit('sefer-sec', { sefer_id: 1 }, resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('konum-guncelle', { enlem: 0.5, boylam: 0 }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz rol' });
        gonderen.disconnect();
    });

    it('kaptan rolunde ama sefer secilmeden konum-guncelle gonderilirse Sefer secilmedi doner', async () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);
        const gonderen = izlenenSoket({ auth: { token } });
        await baglantiyiBekle(gonderen);

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
        const gonderen = izlenenSoket({ auth: { token } });
        await baglantiyiBekle(gonderen);
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
        const kaptan = izlenenSoket({ auth: { token } });
        const dinleyici = izlenenSoket();
        await baglantiyiBekle(kaptan);
        await baglantiyiBekle(dinleyici);
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

    // Onceden bu iki senaryo (acik hiz / hiz yok) tek testte 4 soket ve ~10 gidis-donus
    // ile kosuluyordu ve tam suite calistirmalarinin ~%27'sinde zaman asimina ugruyordu.
    // Iki bagimsiz teste bolup her birini 2 sokete indirdik; karsilastirma yerine her test
    // kendi bilinen beklenen degerini dogruluyor (mesafe/hiz/60).
    it('gonderilen hiz ile hedefe_kalan_dakika mesafe/hiz/60 olarak hesaplanir', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValue({ rows: [] });
        const sefer = { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 0 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi A' };
        aktifSeferler.set(1, sefer);
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);

        const kaptan = izlenenSoket({ auth: { token } });
        const dinleyici = izlenenSoket();
        await baglantiyiBekle(kaptan);
        await baglantiyiBekle(dinleyici);
        await new Promise((resolve) => kaptan.emit('sefer-sec', { sefer_id: 1 }, resolve));
        await new Promise((resolve) => dinleyici.emit('sefer-sec', { sefer_id: 1 }, resolve));

        const yayinPromise = new Promise((resolve) => dinleyici.on('gemi-konum-guncelleme', resolve));
        await new Promise((resolve) => kaptan.emit('konum-guncelle', { enlem: 0.5, boylam: 0, hiz: 20 }, resolve));
        const yayin = await yayinPromise;

        // (0.5,0) -> (1,0) arasi ~55597 m; hiz=20 m/s ile ~46.3 dakika.
        const mesafe = ikiNoktaArasiMesafe(0.5, 0, 1, 0);
        expect(yayin.hedefe_kalan_dakika).toBeCloseTo(mesafe / 20 / 60, 5);

        kaptan.disconnect();
        dinleyici.disconnect();
    }, 10000);

    it('hiz gonderilmezse hedefe_kalan_dakika VARSAYILAN_HIZ_METRE_SANIYE (7 m/s) ile hesaplanir', async () => {
        vi.spyOn(havuz, 'query').mockResolvedValue({ rows: [] });
        const sefer = { ...seferStateOlustur([{ ad: 'A', enlem: 0, boylam: 0 }, { ad: 'B', enlem: 1, boylam: 0 }]), gemiId: 1, hatId: 1, gemiAdi: 'Gemi B' };
        aktifSeferler.set(1, sefer);
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, process.env.JWT_GIZLI_ANAHTARI);

        const kaptan = izlenenSoket({ auth: { token } });
        const dinleyici = izlenenSoket();
        await baglantiyiBekle(kaptan);
        await baglantiyiBekle(dinleyici);
        await new Promise((resolve) => kaptan.emit('sefer-sec', { sefer_id: 1 }, resolve));
        await new Promise((resolve) => dinleyici.emit('sefer-sec', { sefer_id: 1 }, resolve));

        const yayinPromise = new Promise((resolve) => dinleyici.on('gemi-konum-guncelleme', resolve));
        await new Promise((resolve) => kaptan.emit('konum-guncelle', { enlem: 0.5, boylam: 0 }, resolve)); // hiz yok -> VARSAYILAN_HIZ_METRE_SANIYE=7
        const yayin = await yayinPromise;

        // Ayni mesafe (~55597 m), varsayilan hiz=7 m/s ile ~132.4 dakika.
        const mesafe = ikiNoktaArasiMesafe(0.5, 0, 1, 0);
        expect(yayin.hedefe_kalan_dakika).toBeCloseTo(mesafe / 7 / 60, 5);

        kaptan.disconnect();
        dinleyici.disconnect();
    }, 10000);
});

afterAll(async () => {
    await new Promise((resolve) => sunucu.close(resolve));
    await havuz.end();
});
