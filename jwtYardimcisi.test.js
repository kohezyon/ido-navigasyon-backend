import { describe, it, expect } from 'vitest';
const { erisimTokeniOlustur, yenilemeTokeniOlustur, tokenDogrula } = require('./jwtYardimcisi.js');

const TEST_ANAHTARI = 'test-jwt-gizli-anahtari';

describe('erisimTokeniOlustur ve tokenDogrula', () => {
    it('olusturulan token dogrulandiginda ayni payload i doner', () => {
        const token = erisimTokeniOlustur({ id: 1, kullanici_adi: 'kaptan1', rol: 'kaptan' }, TEST_ANAHTARI);
        const payload = tokenDogrula(token, TEST_ANAHTARI);
        expect(payload.id).toBe(1);
        expect(payload.kullanici_adi).toBe('kaptan1');
        expect(payload.rol).toBe('kaptan');
    });

    it('yanlis anahtarla dogrulananan token null doner', () => {
        const token = erisimTokeniOlustur({ id: 1 }, TEST_ANAHTARI);
        expect(tokenDogrula(token, 'baska-anahtar')).toBeNull();
    });

    it('bozuk token null doner', () => {
        expect(tokenDogrula('bozuk.token.degeri', TEST_ANAHTARI)).toBeNull();
    });
});

describe('yenilemeTokeniOlustur', () => {
    it('olusturulan yenileme tokeni dogrulanabilir', () => {
        const token = yenilemeTokeniOlustur({ id: 1 }, TEST_ANAHTARI);
        const payload = tokenDogrula(token, TEST_ANAHTARI);
        expect(payload.id).toBe(1);
    });
});
