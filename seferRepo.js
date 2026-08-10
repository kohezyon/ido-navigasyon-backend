async function seferOlustur(havuz, { gemiId, hatId, baslatanPersonelId }) {
    const sonuc = await havuz.query(
        'INSERT INTO seferler (gemi_id, hat_id, baslatan_personel_id) VALUES ($1, $2, $3) RETURNING id, gemi_id, hat_id, baslangic_zamani',
        [gemiId, hatId, baslatanPersonelId]
    );
    return sonuc.rows[0];
}

async function seferBitir(havuz, seferId) {
    const sonuc = await havuz.query(
        'UPDATE seferler SET bitis_zamani = now() WHERE id = $1 AND bitis_zamani IS NULL',
        [seferId]
    );
    return sonuc.rowCount;
}

async function seferlerAktifListele(havuz) {
    const sonuc = await havuz.query(
        `SELECT s.id AS sefer_id, g.ad AS gemi_adi, h.ad AS hat_adi, s.baslangic_zamani
         FROM seferler s
         JOIN gemiler g ON g.id = s.gemi_id
         JOIN hatlar h ON h.id = s.hat_id
         WHERE s.bitis_zamani IS NULL
         ORDER BY s.baslangic_zamani`
    );
    return sonuc.rows;
}

// Bu sorgu DB'deki TUM acik seferleri kapatir (belirli bir instance'a veya sefere
// ozel bir filtre yok). Bu, tek-instance + yalnizca-boot-aninda-cagrilir varsayimi
// altinda dogrudur (bkz. server.js: sunucu.listen()'dan once, tek seferlik). Servis
// yatay olceklenirse (birden fazla backend instance'i, zero-downtime deploy), yeni
// instance'in boot'u eski instance'in hala canli yonettigi aktif seferleri de DB'de
// kapatabilir. Yatay olceklemeye gecilirse bu sorgu instance-scoped hale getirilmeli
// (ornegin sefer basina "sahip instance" bilgisi tutup yalnizca kendi kayitlarini
// kapatmali).
async function yariBirakilmisSeferleriKapat(havuz) {
    const sonuc = await havuz.query(
        'UPDATE seferler SET bitis_zamani = now() WHERE bitis_zamani IS NULL RETURNING id, gemi_id'
    );
    return sonuc.rows;
}

module.exports = { seferOlustur, seferBitir, seferlerAktifListele, yariBirakilmisSeferleriKapat };
