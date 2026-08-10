const jwt = require('jsonwebtoken');

const ERISIM_TOKEN_OMRU = '15m';
const YENILEME_TOKEN_OMRU = '7d';

function erisimTokeniOlustur(payload, gizliAnahtar) {
    return jwt.sign({ ...payload, tur: 'erisim' }, gizliAnahtar, { expiresIn: ERISIM_TOKEN_OMRU });
}

function yenilemeTokeniOlustur(payload, gizliAnahtar) {
    return jwt.sign({ ...payload, tur: 'yenileme' }, gizliAnahtar, { expiresIn: YENILEME_TOKEN_OMRU });
}

function tokenDogrula(token, gizliAnahtar) {
    try {
        return jwt.verify(token, gizliAnahtar);
    } catch {
        return null;
    }
}

module.exports = { erisimTokeniOlustur, yenilemeTokeniOlustur, tokenDogrula };
