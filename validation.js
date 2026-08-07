function gemiAdiGecerliMi(deger) {
    return typeof deger === 'string' && deger.trim().length > 0 && deger.length <= 100;
}

function sayiGecerliMi(deger) {
    return typeof deger === 'number' && Number.isInteger(deger) && deger >= 0 && deger <= 1000;
}

module.exports = { gemiAdiGecerliMi, sayiGecerliMi };
