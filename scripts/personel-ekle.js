require('dotenv').config();
const { Pool } = require('pg');
const { sifreHashle } = require('../sifreYardimcisi.js');

const GECERLI_ROLLER = ['personel', 'kaptan', 'admin'];

async function kullaniciEkle(havuz, kullaniciAdi, sifre, rol) {
    if (!GECERLI_ROLLER.includes(rol)) {
        throw new Error(`Rol ${GECERLI_ROLLER.join(', ')} degerlerinden biri olmali.`);
    }
    const hash = await sifreHashle(sifre);
    await havuz.query(
        'INSERT INTO personel_hesaplari (kullanici_adi, sifre_hash, rol) VALUES ($1, $2, $3)',
        [kullaniciAdi, hash, rol]
    );
}

async function main() {
    const [kullaniciAdi, sifre, rol] = process.argv.slice(2);
    if (!kullaniciAdi || !sifre || !rol) {
        console.error('Kullanim: node scripts/personel-ekle.js <kullanici_adi> <sifre> <rol>');
        process.exitCode = 1;
        return;
    }

    const havuz = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true }
    });

    try {
        await kullaniciEkle(havuz, kullaniciAdi, sifre, rol);
        console.log(`Kullanici olusturuldu: ${kullaniciAdi} (${rol})`);
    } catch (hata) {
        console.error('Kullanici olusturulamadi:', hata.message);
        process.exitCode = 1;
    } finally {
        await havuz.end();
    }
}

if (require.main === module) {
    main();
}

module.exports = { kullaniciEkle, GECERLI_ROLLER };
