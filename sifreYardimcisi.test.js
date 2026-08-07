import { describe, it, expect } from 'vitest';
const { sifreHashle, sifreDogrula, SAHTE_SIFRE_HASH } = require('./sifreYardimcisi.js');

describe('sifreHashle', () => {
    it('duz metinden farkli bir hash uretir', async () => {
        const hash = await sifreHashle('gizli-sifre-123');
        expect(hash).not.toBe('gizli-sifre-123');
        expect(hash.length).toBeGreaterThan(20);
    });
});

describe('sifreDogrula', () => {
    it('dogru sifre ile hash eslesirse true doner', async () => {
        const hash = await sifreHashle('gizli-sifre-123');
        expect(await sifreDogrula('gizli-sifre-123', hash)).toBe(true);
    });

    it('yanlis sifre ile hash eslesmezse false doner', async () => {
        const hash = await sifreHashle('gizli-sifre-123');
        expect(await sifreDogrula('baska-sifre', hash)).toBe(false);
    });
});

describe('SAHTE_SIFRE_HASH', () => {
    it('gecerli bir bcrypt hash i olarak disari verilir', () => {
        expect(typeof SAHTE_SIFRE_HASH).toBe('string');
        expect(SAHTE_SIFRE_HASH.length).toBeGreaterThan(20);
    });

    it('hicbir duz metinle eslesmez (zamanlama korumasi icin kullanilir)', async () => {
        expect(await sifreDogrula('rastgele-bir-sifre', SAHTE_SIFRE_HASH)).toBe(false);
    });
});
