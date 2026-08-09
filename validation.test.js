import { describe, it, expect } from 'vitest';
const { sayiGecerliMi } = require('./validation.js');

describe('sayiGecerliMi', () => {
    it('gecerli tam sayilar icin true doner', () => {
        expect(sayiGecerliMi(0)).toBe(true);
        expect(sayiGecerliMi(42)).toBe(true);
    });

    it('negatif sayilar icin false doner', () => {
        expect(sayiGecerliMi(-1)).toBe(false);
    });

    it('tam sayi olmayan degerler icin false doner', () => {
        expect(sayiGecerliMi(1.5)).toBe(false);
        expect(sayiGecerliMi('5')).toBe(false);
        expect(sayiGecerliMi(undefined)).toBe(false);
    });

    it('1000 den buyuk sayilar icin false doner', () => {
        expect(sayiGecerliMi(1001)).toBe(false);
    });
});
