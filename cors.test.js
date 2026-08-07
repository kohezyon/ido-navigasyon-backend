import { describe, it, expect, vi } from 'vitest';
const { izinliOrijinListesi, corsOrijinKontrolu, corsMiddleware } = require('./cors.js');

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

function sahteReqResOlustur(origin, method = 'GET') {
    const req = { headers: { origin }, method };
    const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        end: vi.fn()
    };
    const next = vi.fn();
    return { req, res, next };
}

describe('corsMiddleware', () => {
    it('orijin header i yoksa (mobil istemci) dogrudan sonraki middleware e gecer', () => {
        const middleware = corsMiddleware(['https://a.com']);
        const { req, res, next } = sahteReqResOlustur(undefined);

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.anything());
    });

    it('izin verilen orijin icin Access-Control-Allow-Origin header i ayarlar ve devam eder', () => {
        const middleware = corsMiddleware(['https://a.com']);
        const { req, res, next } = sahteReqResOlustur('https://a.com');

        middleware(req, res, next);

        expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://a.com');
        expect(next).toHaveBeenCalled();
    });

    it('izin verilmeyen orijin icin 403 doner ve sonraki middleware e gecmez', () => {
        const middleware = corsMiddleware(['https://a.com']);
        const { req, res, next } = sahteReqResOlustur('https://kotu-site.com');

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ hata: 'CORS: izin verilmeyen orijin' });
        expect(next).not.toHaveBeenCalled();
    });

    it('izin verilen orijinden OPTIONS on-ucus (preflight) istegine 204 ile yanit verir', () => {
        const middleware = corsMiddleware(['https://a.com']);
        const { req, res, next } = sahteReqResOlustur('https://a.com', 'OPTIONS');

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(204);
        expect(res.end).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
});
