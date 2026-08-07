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

function corsMiddleware(izinVerilenOrijinler) {
    const orijinKontrolEt = corsOrijinKontrolu(izinVerilenOrijinler);

    return function (req, res, next) {
        const orijin = req.headers.origin;

        orijinKontrolEt(orijin, (hata, izinVerildi) => {
            if (!izinVerildi) {
                res.status(403).json({ hata: 'CORS: izin verilmeyen orijin' });
                return;
            }

            if (orijin) {
                res.setHeader('Access-Control-Allow-Origin', orijin);
                res.setHeader('Vary', 'Origin');
            }

            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                res.status(204).end();
                return;
            }

            next();
        });
    };
}

module.exports = { izinliOrijinListesi, corsOrijinKontrolu, corsMiddleware };
