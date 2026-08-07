process.env.PERSONEL_ANAHTARI = 'test-ortami-anahtari';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

import { describe, it, expect, afterAll, vi } from 'vitest';
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

afterAll(async () => {
    await havuz.end();
});
