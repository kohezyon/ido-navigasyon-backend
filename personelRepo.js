async function kullaniciAdiylaBul(havuz, kullaniciAdi) {
    const sonuc = await havuz.query(
        'SELECT id, kullanici_adi, sifre_hash, rol FROM personel_hesaplari WHERE kullanici_adi = $1',
        [kullaniciAdi]
    );
    return sonuc.rows[0] || null;
}

async function idIleBul(havuz, id) {
    const sonuc = await havuz.query(
        'SELECT id, kullanici_adi, sifre_hash, rol FROM personel_hesaplari WHERE id = $1',
        [id]
    );
    return sonuc.rows[0] || null;
}

module.exports = { kullaniciAdiylaBul, idIleBul };
