import { describe, it, expect } from 'vitest';
const { sifreHashle, sifreDogrula } = require('./sifreYardimcisi.js');

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
