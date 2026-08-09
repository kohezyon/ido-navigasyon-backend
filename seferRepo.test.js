import { describe, it, expect, vi } from 'vitest';
const { seferOlustur, seferBitir, seferlerAktifListele } = require('./seferRepo.js');

describe('seferOlustur', () => {
    it('dogru SQL ve parametrelerle INSERT calistirir, olusan satiri doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({
                rows: [{ id: 42, gemi_id: 1, hat_id: 2, baslangic_zamani: '2026-08-07T10:00:00.000Z' }]
            })
        };
        const sonuc = await seferOlustur(sahteHavuz, { gemiId: 1, hatId: 2, baslatanPersonelId: 3 });

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'INSERT INTO seferler (gemi_id, hat_id, baslatan_personel_id) VALUES ($1, $2, $3) RETURNING id, gemi_id, hat_id, baslangic_zamani',
            [1, 2, 3]
        );
        expect(sonuc).toEqual({ id: 42, gemi_id: 1, hat_id: 2, baslangic_zamani: '2026-08-07T10:00:00.000Z' });
    });

    it('gemi zaten aktif seferdeyse havuzun firlattigi hatayi oldugu gibi yukari firlatir', async () => {
        const benzersizlikHatasi = Object.assign(new Error('duplicate key value'), { code: '23505' });
        const sahteHavuz = { query: vi.fn().mockRejectedValue(benzersizlikHatasi) };

        await expect(seferOlustur(sahteHavuz, { gemiId: 1, hatId: 2, baslatanPersonelId: 3 })).rejects.toThrow('duplicate key value');
    });
});

describe('seferBitir', () => {
    it('dogru SQL ve parametre ile bitis_zamanini gunceller', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
        await seferBitir(sahteHavuz, 42);

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'UPDATE seferler SET bitis_zamani = now() WHERE id = $1',
            [42]
        );
    });
});

describe('seferlerAktifListele', () => {
    it('aktif seferleri gemi ve hat adlariyla birlikte doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({
                rows: [{ sefer_id: 42, gemi_adi: 'Yalova Feribotu 1', hat_adi: 'Yalova - Istanbul', baslangic_zamani: '2026-08-07T10:00:00.000Z' }]
            })
        };
        const sonuc = await seferlerAktifListele(sahteHavuz);

        expect(sahteHavuz.query).toHaveBeenCalledTimes(1);
        expect(sahteHavuz.query.mock.calls[0][0]).toMatch(/WHERE s\.bitis_zamani IS NULL/);
        expect(sonuc).toEqual([{ sefer_id: 42, gemi_adi: 'Yalova Feribotu 1', hat_adi: 'Yalova - Istanbul', baslangic_zamani: '2026-08-07T10:00:00.000Z' }]);
    });
});
