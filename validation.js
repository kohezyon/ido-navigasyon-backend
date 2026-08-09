function sayiGecerliMi(deger) {
    return typeof deger === 'number' && Number.isInteger(deger) && deger >= 0 && deger <= 1000;
}

function konumGecerliMi(enlem, boylam) {
    return typeof enlem === 'number' && !Number.isNaN(enlem) && enlem >= -90 && enlem <= 90
        && typeof boylam === 'number' && !Number.isNaN(boylam) && boylam >= -180 && boylam <= 180;
}

module.exports = { sayiGecerliMi, konumGecerliMi };
