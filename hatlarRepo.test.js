import { describe, it, expect, vi } from 'vitest';
const { tumHatlariListele, rotaNoktalariGetir } = require('./hatlarRepo.js');

describe('tumHatlariListele', () => {
    it('dogru SQL ile sorgu calistirir, hat listesini doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({ rows: [{ id: 1, ad: 'Yalova - Istanbul' }] })
        };
        const sonuc = await tumHatlariListele(sahteHavuz);

        expect(sahteHavuz.query).toHaveBeenCalledWith('SELECT id, ad FROM hatlar ORDER BY ad');
        expect(sonuc).toEqual([{ id: 1, ad: 'Yalova - Istanbul' }]);
    });
});

describe('rotaNoktalariGetir', () => {
    it('dogru SQL ve parametre ile hattin rota noktalarini sira ile doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({
                rows: [
                    { ad: 'Yalova', enlem: 40.65, boylam: 29.26 },
                    { ad: 'Istanbul', enlem: 41.01, boylam: 29.02 }
                ]
            })
        };
        const sonuc = await rotaNoktalariGetir(sahteHavuz, 1);

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'SELECT ad, enlem, boylam FROM rota_noktalari WHERE hat_id = $1 ORDER BY sira',
            [1]
        );
        expect(sonuc).toEqual([
            { ad: 'Yalova', enlem: 40.65, boylam: 29.26 },
            { ad: 'Istanbul', enlem: 41.01, boylam: 29.02 }
        ]);
    });

    it('hattin rota noktasi yoksa bos dizi doner', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        const sonuc = await rotaNoktalariGetir(sahteHavuz, 999);
        expect(sonuc).toEqual([]);
    });
});
