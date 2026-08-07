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

    it('tur claim i "erisim" olarak isaretlenir', () => {
        const token = erisimTokeniOlustur({ id: 1 }, TEST_ANAHTARI);
        const payload = tokenDogrula(token, TEST_ANAHTARI);
        expect(payload.tur).toBe('erisim');
    });
});

describe('yenilemeTokeniOlustur', () => {
    it('olusturulan yenileme tokeni dogrulanabilir', () => {
        const token = yenilemeTokeniOlustur({ id: 1 }, TEST_ANAHTARI);
        const payload = tokenDogrula(token, TEST_ANAHTARI);
        expect(payload.id).toBe(1);
    });

    it('tur claim i "yenileme" olarak isaretlenir', () => {
        const token = yenilemeTokeniOlustur({ id: 1 }, TEST_ANAHTARI);
        const payload = tokenDogrula(token, TEST_ANAHTARI);
        expect(payload.tur).toBe('yenileme');
    });

    it('erisim ve yenileme tokenlari ayni payload ile bile farkli tur claim ine sahiptir', () => {
        const erisim = erisimTokeniOlustur({ id: 1 }, TEST_ANAHTARI);
        const yenileme = yenilemeTokeniOlustur({ id: 1 }, TEST_ANAHTARI);
        expect(tokenDogrula(erisim, TEST_ANAHTARI).tur).not.toBe(tokenDogrula(yenileme, TEST_ANAHTARI).tur);
    });
});
