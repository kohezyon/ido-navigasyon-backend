async function tumHatlariListele(havuz) {
    const sonuc = await havuz.query('SELECT id, ad FROM hatlar ORDER BY ad');
    return sonuc.rows;
}

async function rotaNoktalariGetir(havuz, hatId) {
    const sonuc = await havuz.query(
        'SELECT ad, enlem, boylam FROM rota_noktalari WHERE hat_id = $1 ORDER BY sira',
        [hatId]
    );
    return sonuc.rows;
}

module.exports = { tumHatlariListele, rotaNoktalariGetir };
