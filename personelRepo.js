async function kullaniciAdiylaBul(havuz, kullaniciAdi) {
    const sonuc = await havuz.query(
        'SELECT id, kullanici_adi, sifre_hash, rol FROM personel_hesaplari WHERE kullanici_adi = $1',
        [kullaniciAdi]
    );
    return sonuc.rows[0] || null;
}

module.exports = { kullaniciAdiylaBul };
