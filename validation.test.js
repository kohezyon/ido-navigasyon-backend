import { describe, it, expect } from 'vitest';
const { gemiAdiGecerliMi, sayiGecerliMi } = require('./validation.js');

describe('gemiAdiGecerliMi', () => {
    it('normal bir metin icin true doner', () => {
        expect(gemiAdiGecerliMi('Yalova Feribotu 1')).toBe(true);
    });

    it('bos string icin false doner', () => {
        expect(gemiAdiGecerliMi('')).toBe(false);
        expect(gemiAdiGecerliMi('   ')).toBe(false);
    });

    it('string olmayan degerler icin false doner', () => {
        expect(gemiAdiGecerliMi(123)).toBe(false);
        expect(gemiAdiGecerliMi(undefined)).toBe(false);
        expect(gemiAdiGecerliMi(null)).toBe(false);
    });

    it('100 karakterden uzun metinler icin false doner', () => {
        expect(gemiAdiGecerliMi('a'.repeat(101))).toBe(false);
    });
});

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
