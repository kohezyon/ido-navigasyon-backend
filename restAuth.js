function bearerTokenAl(req) {
    const baslik = req.headers.authorization || '';
    const [tur, token] = baslik.split(' ');
    return tur === 'Bearer' && token ? token : null;
}

function jwtDogrulaMiddleware(tokenDogrula, gizliAnahtar, izinliRoller) {
    return function (req, res, next) {
        const token = bearerTokenAl(req);
        const payload = token ? tokenDogrula(token, gizliAnahtar) : null;

        if (!payload) {
            return res.status(401).json({ hata: 'Yetkisiz istek' });
        }
        if (izinliRoller && !izinliRoller.includes(payload.rol)) {
            return res.status(403).json({ hata: 'Bu islem icin yetkiniz yok' });
        }

        req.kullanici = payload;
        next();
    };
}

module.exports = { bearerTokenAl, jwtDogrulaMiddleware };
