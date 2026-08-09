async function tumGemileriListele(havuz) {
    const sonuc = await havuz.query('SELECT id, ad FROM gemiler ORDER BY ad');
    return sonuc.rows;
}

async function gemiGetir(havuz, id) {
    const sonuc = await havuz.query('SELECT id, ad FROM gemiler WHERE id = $1', [id]);
    return sonuc.rows[0] || null;
}

module.exports = { tumGemileriListele, gemiGetir };
