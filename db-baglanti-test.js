const { Pool } = require('pg');

// Veritabanı bağlantı bilgilerimiz
const havuz = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ido_navigasyon',
    password: '0000',
    port: 5432,
});

async function test() {
    try {
        const sonuc = await havuz.query('SELECT ad, enlem, boylam FROM ilgi_noktalari');
        console.log('Baglanti basarili! Bulunan kayitlar:');
        console.log(sonuc.rows);
    } catch (hata) {
        console.log('Baglanti hatasi:', hata.message);
    } finally {
        await havuz.end();
    }
}

test();