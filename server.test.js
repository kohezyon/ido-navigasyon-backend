process.env.JWT_GIZLI_ANAHTARI = 'test-jwt-gizli-anahtari';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.ALLOWED_ORIGINS = 'https://izinli-site.com';

import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { app, havuz, sunucu } = require('./server.js');

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

    it('yenileme tokeni Bearer olarak gonderilirse (tur uyusmazligi) 401 doner', async () => {
        const yenileme = yenilemeTokeniOlustur(
            { id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' },
            process.env.JWT_GIZLI_ANAHTARI
        );
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Authorization', `Bearer ${yenileme}`)
            .send({});
        expect(yanit.status).toBe(401);
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
