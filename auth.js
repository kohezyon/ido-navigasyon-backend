const crypto = require('crypto');

function anahtarDogrula(saglanan, beklenen) {
    if (typeof saglanan !== 'string' || saglanan.length === 0) return false;
    if (typeof beklenen !== 'string' || beklenen.length === 0) return false;

    const saglananOzet = crypto.createHash('sha256').update(saglanan).digest();
    const beklenenOzet = crypto.createHash('sha256').update(beklenen).digest();

    return crypto.timingSafeEqual(saglananOzet, beklenenOzet);
}

module.exports = { anahtarDogrula };
