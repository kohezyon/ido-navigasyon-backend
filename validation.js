function sayiGecerliMi(deger) {
    return typeof deger === 'number' && Number.isInteger(deger) && deger >= 0 && deger <= 1000;
}

module.exports = { sayiGecerliMi };
