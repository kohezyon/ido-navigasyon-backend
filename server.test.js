process.env.PERSONEL_ANAHTARI = 'test-ortami-anahtari';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

import { describe, it, expect, afterAll } from 'vitest';
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
