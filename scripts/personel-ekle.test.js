import { describe, it, expect, vi } from 'vitest';
const { kullaniciEkle } = require('./personel-ekle.js');

describe('kullaniciEkle', () => {
    it('gecerli rol icin havuz.query yi hashlenmis sifreyle cagirir', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({}) };
        await kullaniciEkle(sahteHavuz, 'kaptan1', 'gizli-sifre-123', 'kaptan');

        expect(sahteHavuz.query).toHaveBeenCalledTimes(1);
        const [sql, parametreler] = sahteHavuz.query.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO personel_hesaplari/);
        expect(parametreler[0]).toBe('kaptan1');
        expect(parametreler[1]).not.toBe('gizli-sifre-123');
        expect(parametreler[2]).toBe('kaptan');
    });

    it('gecersiz rol icin hata firlatir ve havuz.query cagrilmaz', async () => {
        const sahteHavuz = { query: vi.fn() };
        await expect(kullaniciEkle(sahteHavuz, 'x', 'y', 'patron')).rejects.toThrow();
        expect(sahteHavuz.query).not.toHaveBeenCalled();
    });
});
