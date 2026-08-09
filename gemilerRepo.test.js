import { describe, it, expect, vi } from 'vitest';
const { tumGemileriListele, gemiGetir } = require('./gemilerRepo.js');

describe('tumGemileriListele', () => {
    it('dogru SQL ile sorgu calistirir, gemi listesini doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({ rows: [{ id: 1, ad: 'Yalova Feribotu 1' }] })
        };
        const sonuc = await tumGemileriListele(sahteHavuz);

        expect(sahteHavuz.query).toHaveBeenCalledWith('SELECT id, ad FROM gemiler ORDER BY ad');
        expect(sonuc).toEqual([{ id: 1, ad: 'Yalova Feribotu 1' }]);
    });
});

describe('gemiGetir', () => {
    it('dogru SQL ve parametre ile sorgu calistirir, bulunan satiri doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({ rows: [{ id: 1, ad: 'Yalova Feribotu 1' }] })
        };
        const sonuc = await gemiGetir(sahteHavuz, 1);

        expect(sahteHavuz.query).toHaveBeenCalledWith('SELECT id, ad FROM gemiler WHERE id = $1', [1]);
        expect(sonuc).toEqual({ id: 1, ad: 'Yalova Feribotu 1' });
    });

    it('gemi bulunamazsa null doner', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        const sonuc = await gemiGetir(sahteHavuz, 999);
        expect(sonuc).toBeNull();
    });
});
