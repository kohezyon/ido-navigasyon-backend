// İki nokta arasındaki mesafeyi metre cinsinden hesaplayan fonksiyon
// (Dünyanın yuvarlak olduğunu hesaba katan "Haversine" formülü)
function ikiNoktaArasiMesafe(enlem1, boylam1, enlem2, boylam2) {
    const R = 6371000; // Dünyanın yarıçapı (metre)

    const radyan = (derece) => derece * (Math.PI / 180);

    const dEnlem = radyan(enlem2 - enlem1);
    const dBoylam = radyan(boylam2 - boylam1);

    const a =
        Math.sin(dEnlem / 2) * Math.sin(dEnlem / 2) +
        Math.cos(radyan(enlem1)) * Math.cos(radyan(enlem2)) *
        Math.sin(dBoylam / 2) * Math.sin(dBoylam / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const mesafeMetre = R * c;
    return mesafeMetre;
}

// Gemi konumu ile bir ilgi noktasını karşılaştırıp
// "tetiklendi mi tetiklenmedi mi" cevabını veren fonksiyon
function geofenceKontrolEt(gemiEnlem, gemiBoylam, ilgiNoktasi) {
    const mesafe = ikiNoktaArasiMesafe(
        gemiEnlem,
        gemiBoylam,
        ilgiNoktasi.enlem,
        ilgiNoktasi.boylam
    );

    const tetiklendi = mesafe <= ilgiNoktasi.tetikleme_mesafesi_metre;

return {
        nokta_adi: ilgiNoktasi.ad,
        tip: ilgiNoktasi.tip,
        aciklama: ilgiNoktasi.aciklama,
        video_url: ilgiNoktasi.video_url,
        sesli_anlatim_url: ilgiNoktasi.sesli_anlatim_url,
        videolu_anlatim_url: ilgiNoktasi.videolu_anlatim_url,
        mesafe_metre: Math.round(mesafe),
        tetiklendi: tetiklendi
    };
}
module.exports = { ikiNoktaArasiMesafe, geofenceKontrolEt };