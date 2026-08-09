process.env.JWT_GIZLI_ANAHTARI = 'test-jwt-gizli-anahtari';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.ALLOWED_ORIGINS = 'https://izinli-site.com';

import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { app, havuz, sunucu } = require('./server.js');
const { aktifSeferler, seferStateOlustur, konumKontrolVeYayinla } = require('./server.js');

const { sifreHashle } = require('./sifreYardimcisi.js');
const { yenilemeTokeniOlustur } = require('./jwtYardimcisi.js');
const { erisimTokeniOlustur } = require('./jwtYardimcisi.js');
const { tokenDogrula } = require('./jwtYardimcisi.js');

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
    let sunucuPortu;

    beforeAll(async () => {
        await new Promise((resolve) => sunucu.listen(0, resolve));
        sunucuPortu = sunucu.address().port;
    });

    afterAll(async () => {
        await new Promise((resolve) => sunucu.close(resolve));
    });

    it('token gonderilmezse baglanti kurulur (yolcu app icin anonim/dinleyici erisim)', async () => {
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => gonderen.on('connect', resolve));
        expect(gonderen.connected).toBe(true);
        gonderen.disconnect();
    });

    it('anonim (tokensiz) baglanti kaptan tarafindan baslatilan acil-durum-uyarisini alir', async () => {
        const token = erisimTokeniOlustur(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const kaptan = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token } });
        const yolcu = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => kaptan.on('connect', resolve));
        await new Promise((resolve) => yolcu.on('connect', resolve));

        const uyariPromise = new Promise((resolve) => yolcu.on('acil-durum-uyarisi', resolve));
        kaptan.emit('acil-durum-baslat', { gemi_adi: 'Test Gemisi' }, () => {});
        const uyari = await uyariPromise;

        expect(uyari.gemi).toBe('Test Gemisi');
        kaptan.disconnect();
        yolcu.disconnect();
    });

    it('anonim (tokensiz) baglanti acil-durum-baslat gonderirse Yetkisiz doner', async () => {
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => gonderen.on('connect', resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', { gemi_adi: 'Test Gemisi' }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz' });
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
        // Handshake anda gecerli (henuz suresi dolmamis), ama cok kisa omurlu bir token
        // uretiyoruz; baglanti kurulduktan sonra bekleyip suresinin dolmasini sagliyoruz.
        // Boylece soket baglantisi acikken token suresinin dolmasi senaryosunu test ediyoruz
        // (io.use sadece connect aninda calisir, sonraki eventlerde tekrar dogrulama yapmaz).
        const jwt = require('jsonwebtoken');
        const kisaOmurluToken = jwt.sign(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan', tur: 'erisim' },
            process.env.JWT_GIZLI_ANAHTARI,
            { expiresIn: '1s' }
        );

        const gonderen = ioClient(`http://localhost:${sunucuPortu}`, { auth: { token: kisaOmurluToken } });
        await new Promise((resolve) => gonderen.on('connect', resolve));

        await new Promise((resolve) => setTimeout(resolve, 1200));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', { gemi_adi: 'Test Gemisi' }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Oturum suresi doldu' });
        gonderen.disconnect();
    }, 10000);

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

    it('anonim (tokensiz) baglanti yolcu-sayisi-guncelle gonderirse Yetkisiz doner', async () => {
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => gonderen.on('connect', resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('yolcu-sayisi-guncelle', { sayi: 3, gemi_adi: 'Test Gemisi' }, resolve);
        });

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz' });
        gonderen.disconnect();
    });
});

afterAll(async () => {
    await havuz.end();
});
