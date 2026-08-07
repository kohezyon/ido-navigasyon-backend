import { describe, it, expect, vi } from 'vitest';
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
