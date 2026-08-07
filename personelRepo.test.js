import { describe, it, expect, vi } from 'vitest';
const { kullaniciAdiylaBul } = require('./personelRepo.js');

describe('kullaniciAdiylaBul', () => {
    it('dogru SQL ve parametre ile sorgu calistirir, bulunan satiri doner', async () => {
        const sahteHavuz = {
            query: vi.fn().mockResolvedValue({
                rows: [{ id: 1, kullanici_adi: 'kaptan1', sifre_hash: 'hash', rol: 'kaptan' }]
            })
        };
        const sonuc = await kullaniciAdiylaBul(sahteHavuz, 'kaptan1');

        expect(sahteHavuz.query).toHaveBeenCalledWith(
            'SELECT id, kullanici_adi, sifre_hash, rol FROM personel_hesaplari WHERE kullanici_adi = $1',
            ['kaptan1']
        );
        expect(sonuc).toEqual({ id: 1, kullanici_adi: 'kaptan1', sifre_hash: 'hash', rol: 'kaptan' });
    });

    it('kullanici bulunamazsa null doner', async () => {
        const sahteHavuz = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        const sonuc = await kullaniciAdiylaBul(sahteHavuz, 'olmayan-kullanici');
        expect(sonuc).toBeNull();
    });
});
