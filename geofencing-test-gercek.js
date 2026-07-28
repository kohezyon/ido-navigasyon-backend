const { Pool } = require('pg');
const { geofenceKontrolEt } = require('./geofencing.js');

const havuz = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ido_navigasyon',
    password: '0000',
    port: 5432,
});

// Sahte bir gemi konumu (Heybeliada'ya yakın bir yer seçtim)
const gemiKonumu = {
    enlem: 40.8760,
    boylam: 29.0920
};

async function kontrolEt() {
    try {
        // Veritabanindaki tum ilgi noktalarini cek
        const sonuc = await havuz.query(
            'SELECT ad, enlem, boylam, tetikleme_mesafesi_metre FROM ilgi_noktalari'
        );

        const tumNoktalar = sonuc.rows;

        console.log(`Gemi konumu: ${gemiKonumu.enlem}, ${gemiKonumu.boylam}`);
        console.log(`Veritabaninda ${tumNoktalar.length} ilgi noktasi bulundu.`);
        console.log('---');

        // Her nokta icin geofencing kontrolu yap
        for (const nokta of tumNoktalar) {
            const kontrolSonucu = geofenceKontrolEt(
                gemiKonumu.enlem,
                gemiKonumu.boylam,
                nokta
            );

            if (kontrolSonucu.tetiklendi) {
                console.log(`TETIKLENDI -> ${kontrolSonucu.nokta_adi} (${kontrolSonucu.mesafe_metre} metre)`);
            } else {
                console.log(`uzak -> ${kontrolSonucu.nokta_adi} (${kontrolSonucu.mesafe_metre} metre)`);
            }
        }

    } catch (hata) {
        console.log('Hata:', hata.message);
    } finally {
        await havuz.end();
    }
}

kontrolEt();