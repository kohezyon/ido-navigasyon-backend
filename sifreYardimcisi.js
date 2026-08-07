const bcrypt = require('bcryptjs');

const TUR_SAYISI = 10;

const SAHTE_SIFRE_HASH = bcrypt.hashSync('sahte-sifre-zamanlama-korumasi', TUR_SAYISI);

async function sifreHashle(duzMetin) {
    return bcrypt.hash(duzMetin, TUR_SAYISI);
}

async function sifreDogrula(duzMetin, hash) {
    return bcrypt.compare(duzMetin, hash);
}

module.exports = { sifreHashle, sifreDogrula, SAHTE_SIFRE_HASH };
