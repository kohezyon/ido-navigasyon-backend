import { describe, it, expect } from 'vitest';
const { anahtarDogrula } = require('./auth.js');

describe('anahtarDogrula', () => {
    it('saglanan ve beklenen ayni oldugunda true doner', () => {
        expect(anahtarDogrula('gizli-anahtar-123', 'gizli-anahtar-123')).toBe(true);
    });

    it('saglanan ve beklenen farkli oldugunda false doner', () => {
        expect(anahtarDogrula('yanlis-anahtar', 'gizli-anahtar-123')).toBe(false);
    });

    it('saglanan tanimsiz oldugunda hata firlatmadan false doner', () => {
        expect(anahtarDogrula(undefined, 'gizli-anahtar-123')).toBe(false);
    });

    it('beklenen bos string oldugunda false doner', () => {
        expect(anahtarDogrula('herhangi-bir-deger', '')).toBe(false);
    });

    it('uzunluklari farkli oldugunda hata firlatmadan false doner', () => {
        expect(anahtarDogrula('kisa', 'cok-cok-daha-uzun-bir-anahtar-degeri')).toBe(false);
    });
});
