import { describe, it, expect } from 'vitest';
const { sayiGecerliMi, konumGecerliMi } = require('./validation.js');

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

describe('konumGecerliMi', () => {
    it('gecerli enlem/boylam degerleri icin true doner', () => {
        expect(konumGecerliMi(40.65, 29.26)).toBe(true);
        expect(konumGecerliMi(0, 0)).toBe(true);
        expect(konumGecerliMi(-90, -180)).toBe(true);
        expect(konumGecerliMi(90, 180)).toBe(true);
    });

    it('enlem araligin (-90, 90) disindaysa false doner', () => {
        expect(konumGecerliMi(90.1, 29.26)).toBe(false);
        expect(konumGecerliMi(-90.1, 29.26)).toBe(false);
    });

    it('boylam araligin (-180, 180) disindaysa false doner', () => {
        expect(konumGecerliMi(40.65, 180.1)).toBe(false);
        expect(konumGecerliMi(40.65, -180.1)).toBe(false);
    });

    it('sayi olmayan degerler icin false doner', () => {
        expect(konumGecerliMi('40.65', 29.26)).toBe(false);
        expect(konumGecerliMi(40.65, '29.26')).toBe(false);
        expect(konumGecerliMi(undefined, 29.26)).toBe(false);
        expect(konumGecerliMi(40.65, undefined)).toBe(false);
        expect(konumGecerliMi(NaN, 29.26)).toBe(false);
    });
});
