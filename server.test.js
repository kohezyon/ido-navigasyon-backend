process.env.PERSONEL_ANAHTARI = 'test-ortami-anahtari';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.ALLOWED_ORIGINS = 'https://izinli-site.com';

import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { app, havuz, sunucu } = require('./server.js');

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
    it('izin verilmeyen origin ile POST /reset-gemi 403 doner', async () => {
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Origin', 'https://kotu-site.com')
            .send({ anahtar: 'test-ortami-anahtari' });
        expect(yanit.status).toBe(403);
    });

    it('izin verilen origin ile POST /reset-gemi gecer ve Access-Control-Allow-Origin doner', async () => {
        const yanit = await request(app)
            .post('/reset-gemi')
            .set('Origin', 'https://izinli-site.com')
            .send({ anahtar: 'test-ortami-anahtari' });
        expect(yanit.status).toBe(200);
        expect(yanit.headers['access-control-allow-origin']).toBe('https://izinli-site.com');
    });

    it('origin header i olmadan (mobil istemci) istek normal calisir', async () => {
        const yanit = await request(app)
            .post('/reset-gemi')
            .send({ anahtar: 'test-ortami-anahtari' });
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

    it('yanlis anahtarla acil-durum-uyarisi yayinlanmaz', async () => {
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`);
        const dinleyici = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => dinleyici.on('connect', resolve));

        let uyariAlindi = false;
        dinleyici.on('acil-durum-uyarisi', () => { uyariAlindi = true; });

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', { gemi_adi: 'Test Gemisi', anahtar: 'yanlis-anahtar' }, resolve);
        });
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(yanit).toEqual({ tamam: false, hata: 'Yetkisiz' });
        expect(uyariAlindi).toBe(false);
        gonderen.disconnect();
        dinleyici.disconnect();
    });

    it('dogru anahtarla acil-durum-uyarisi yayinlanir', async () => {
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`);
        const dinleyici = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => dinleyici.on('connect', resolve));

        const uyariPromise = new Promise((resolve) => dinleyici.on('acil-durum-uyarisi', resolve));

        const yanit = await new Promise((resolve) => {
            gonderen.emit('acil-durum-baslat', { gemi_adi: 'Test Gemisi', anahtar: 'test-ortami-anahtari' }, resolve);
        });
        const uyari = await uyariPromise;

        expect(yanit).toEqual({ tamam: true });
        expect(uyari.gemi).toBe('Test Gemisi');
        gonderen.disconnect();
        dinleyici.disconnect();
    });
});

describe('yolcu-sayisi-guncelle anahtar sizintisi korumasi', () => {
    let sunucuPortu;

    beforeAll(async () => {
        await new Promise((resolve) => sunucu.listen(0, resolve));
        sunucuPortu = sunucu.address().port;
    });

    afterAll(async () => {
        await new Promise((resolve) => sunucu.close(resolve));
    });

    it('yolcu-sayisi-yayin yayininda anahtar alani bulunmaz', async () => {
        const gonderen = ioClient(`http://localhost:${sunucuPortu}`);
        const dinleyici = ioClient(`http://localhost:${sunucuPortu}`);
        await new Promise((resolve) => dinleyici.on('connect', resolve));

        const yayinPromise = new Promise((resolve) => dinleyici.on('yolcu-sayisi-yayin', resolve));

        gonderen.emit(
            'yolcu-sayisi-guncelle',
            { sayi: 3, gemi_adi: 'Test Gemisi', anahtar: 'test-ortami-anahtari' },
            () => {}
        );
        const yayin = await yayinPromise;

        expect(yayin).toEqual({ sayi: 3, gemi_adi: 'Test Gemisi' });
        expect(yayin.anahtar).toBeUndefined();
        gonderen.disconnect();
        dinleyici.disconnect();
    });
});

afterAll(async () => {
    await havuz.end();
});
