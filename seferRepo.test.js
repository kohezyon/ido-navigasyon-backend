import { describe, it, expect, vi } from 'vitest';
const { seferOlustur, seferBitir, seferlerAktifListele, yariBirakilmisSeferleriKapat } = require('./seferRepo.js');

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
    it('dogru SQL ve parametre ile bitis_zamanini gunceller, halihazirda bitmemis seferlerle sinirlar', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
        const sonuc = await seferBitir(sahteHavuz, 42);

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'UPDATE seferler SET bitis_zamani = now() WHERE id = $1 AND bitis_zamani IS NULL',
            [42]
        );
        expect(sonuc).toBe(1);
    });

    it('sefer zaten bitmisse (veya yoksa) rowCount 0 doner, bitis_zamani tekrar guncellenmez', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) };
        const sonuc = await seferBitir(sahteHavuz, 42);

        expect(sonuc).toBe(0);
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

describe('yariBirakilmisSeferleriKapat', () => {
    it('bitis_zamani NULL olan seferleri kapatir, kapatilan id ve gemi_id listesini doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({
                rows: [
                    { id: 5, gemi_id: 2 },
                    { id: 7, gemi_id: 3 }
                ]
            })
        };
        const sonuc = await yariBirakilmisSeferleriKapat(sahteHavuz);

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'UPDATE seferler SET bitis_zamani = now() WHERE bitis_zamani IS NULL RETURNING id, gemi_id'
        );
        expect(sonuc).toEqual([
            { id: 5, gemi_id: 2 },
            { id: 7, gemi_id: 3 }
        ]);
    });

    it('kapatilacak sefer yoksa bos dizi doner', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        const sonuc = await yariBirakilmisSeferleriKapat(sahteHavuz);

        expect(sonuc).toEqual([]);
    });
});
