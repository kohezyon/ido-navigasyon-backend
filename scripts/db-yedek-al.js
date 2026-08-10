require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
    const havuz = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

    try {
        const tabloSonucu = await havuz.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
        );

        const yedek = {};
        for (const { table_name } of tabloSonucu.rows) {
            const veri = await havuz.query('SELECT * FROM ' + table_name);
            yedek[table_name] = veri.rows;
        }

        const yedekKlasoru = path.join(__dirname, '..', 'db', 'backups');
        fs.mkdirSync(yedekKlasoru, { recursive: true });

        const zamanDamgasi = new Date().toISOString().replace(/[:.]/g, '-');
        const dosyaYolu = path.join(yedekKlasoru, `yedek-${zamanDamgasi}.json`);
        fs.writeFileSync(dosyaYolu, JSON.stringify(yedek, null, 2));

        console.log('Yedek alindi:', dosyaYolu);

        eskiYedekleriTemizle(yedekKlasoru);
    } finally {
        await havuz.end();
    }
}

function eskiYedekleriTemizle(yedekKlasoru) {
    const SAKLAMA_SURESI_MS = 90 * 24 * 60 * 60 * 1000;
    const simdi = Date.now();
    for (const dosyaAdi of fs.readdirSync(yedekKlasoru)) {
        if (!dosyaAdi.startsWith('yedek-') || !dosyaAdi.endsWith('.json')) continue;
        const tamYol = path.join(yedekKlasoru, dosyaAdi);
        const olusturmaZamani = fs.statSync(tamYol).mtimeMs;
        if (simdi - olusturmaZamani > SAKLAMA_SURESI_MS) {
            fs.unlinkSync(tamYol);
            console.log('Eski yedek silindi (90 gunden eski):', dosyaAdi);
        }
    }
}

if (require.main === module) {
    main().catch((hata) => {
        console.error('Yedek alinamadi:', hata.message);
        process.exitCode = 1;
    });
}

module.exports = { main };
