function izinliOrijinListesi(cevreDegiskeni) {
    return (cevreDegiskeni || '')
        .split(',')
        .map((deger) => deger.trim())
        .filter(Boolean);
}

function corsOrijinKontrolu(izinVerilenOrijinler) {
    return function (orijin, geriCagirma) {
        if (!orijin || izinVerilenOrijinler.includes(orijin)) {
            geriCagirma(null, true);
        } else {
            geriCagirma(new Error('CORS: izin verilmeyen orijin'));
        }
    };
}

module.exports = { izinliOrijinListesi, corsOrijinKontrolu };
