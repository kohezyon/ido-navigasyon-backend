require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const { geofenceKontrolEt, ikiNoktaArasiMesafe } = require('./geofencing.js');
const { anahtarDogrula } = require('./auth.js');
const { izinliOrijinListesi, corsOrijinKontrolu, corsMiddleware } = require('./cors.js');
const { gemiAdiGecerliMi, sayiGecerliMi } = require('./validation.js');
const { sifreDogrula } = require('./sifreYardimcisi.js');
const { erisimTokeniOlustur, yenilemeTokeniOlustur, tokenDogrula } = require('./jwtYardimcisi.js');
const { kullaniciAdiylaBul } = require('./personelRepo.js');
const { jwtDogrulaMiddleware } = require('./restAuth.js');

const app = express();
const izinVerilenOrijinler = izinliOrijinListesi(process.env.ALLOWED_ORIGINS);
app.use(corsMiddleware(izinVerilenOrijinler));
app.use(express.json());
const sunucu = http.createServer(app);

const io = new Server(sunucu, {
    cors: { origin: corsOrijinKontrolu(izinVerilenOrijinler) }
});

const havuz = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true }
});
const HAVA_DURUMU_API_ANAHTARI = process.env.HAVA_DURUMU_API_ANAHTARI;
const PERSONEL_ANAHTARI = process.env.PERSONEL_ANAHTARI;
const JWT_GIZLI_ANAHTARI = process.env.JWT_GIZLI_ANAHTARI;
const SAHTE_SIFRE_HASH = require('bcryptjs').hashSync('sahte-sifre-zamanlama-korumasi', 10);

let gemiKonumu = {
    enlem: 40.6500,
    boylam: 29.2600
};

const baslangicKonumu = { enlem: gemiKonumu.enlem, boylam: gemiKonumu.boylam };

const rotaNoktalari = [
    { enlem: 40.7200, boylam: 29.1600 },
    { enlem: 40.8756, boylam: 29.0917 },
    { enlem: 41.0100, boylam: 29.0200 }
];

const rotaAdlari = ['Bozuk Gemi Batigi', 'Heybeliada', 'Istanbul'];

const legMesafeleri = [];
let oncekiNoktaGecici = baslangicKonumu;
for (const nokta of rotaNoktalari) {
    legMesafeleri.push(ikiNoktaArasiMesafe(oncekiNoktaGecici.enlem, oncekiNoktaGecici.boylam, nokta.enlem, nokta.boylam));
    oncekiNoktaGecici = nokta;
}
const toplamRotaMesafesi = legMesafeleri.reduce((a, b) => a + b, 0);

const ADIM_BUYUKLUGU = 0.002;
const HIZ_METRE_SANIYE = ADIM_BUYUKLUGU * 111320;

let suankiHedefIndex = 0;
let varisBildirimiGonderildi = false;

function sahteGpsGuncelle() {
    const hedefNokta = rotaNoktalari[suankiHedefIndex];

    const enlemFark = hedefNokta.enlem - gemiKonumu.enlem;
    const boylamFark = hedefNokta.boylam - gemiKonumu.boylam;
    const kalanMesafeDerece = Math.sqrt(enlemFark * enlemFark + boylamFark * boylamFark);

    if (kalanMesafeDerece > ADIM_BUYUKLUGU) {
        gemiKonumu.enlem += (enlemFark / kalanMesafeDerece) * ADIM_BUYUKLUGU;
        gemiKonumu.boylam += (boylamFark / kalanMesafeDerece) * ADIM_BUYUKLUGU;
    } else {
        if (suankiHedefIndex < rotaNoktalari.length - 1) {
            suankiHedefIndex++;
            console.log('Yeni hedefe geciliyor:', rotaNoktalari[suankiHedefIndex]);
        } else if (!varisBildirimiGonderildi) {
            varisBildirimiGonderildi = true;
            io.emit('varis-bildirimi', {
                mesaj: 'Istanbul\'a hos geldiniz! Yolculugunuz tamamlandi.'
            });
            console.log('VARIS BILDIRIMI GONDERILDI');
        }
    }
}

function kalanToplamMesafeHesapla() {
    const hedefNokta = rotaNoktalari[suankiHedefIndex];
    let kalan = ikiNoktaArasiMesafe(gemiKonumu.enlem, gemiKonumu.boylam, hedefNokta.enlem, hedefNokta.boylam);

    for (let i = suankiHedefIndex + 1; i < rotaNoktalari.length; i++) {
        kalan += legMesafeleri[i];
    }
    return kalan;
}

function sunucuHatasiYanitla(res, hata, genelMesaj) {
    console.error(genelMesaj + ':', hata.message);
    res.status(500).json({ hata: genelMesaj });
}

async function konumKontrolVeYayinla() {
    sahteGpsGuncelle();

    try {
        const sonuc = await havuz.query(
            'SELECT ad, tip, enlem, boylam, tetikleme_mesafesi_metre, aciklama, video_url, sesli_anlatim_url, videolu_anlatim_url FROM ilgi_noktalari'
        );

        const tetiklenenler = [];

        for (const nokta of sonuc.rows) {
            const kontrol = geofenceKontrolEt(gemiKonumu.enlem, gemiKonumu.boylam, nokta);
            if (kontrol.tetiklendi) {
                tetiklenenler.push(kontrol);
            }
        }

        const kalanToplamMesafe = kalanToplamMesafeHesapla();
        const ilerlemeYuzdesi = Math.min(100, Math.max(0, ((toplamRotaMesafesi - kalanToplamMesafe) / toplamRotaMesafesi) * 100));
        const toplamKalanDakika = kalanToplamMesafe / HIZ_METRE_SANIYE / 60;

        const hedefNokta = rotaNoktalari[suankiHedefIndex];
        const hedefeMesafe = ikiNoktaArasiMesafe(gemiKonumu.enlem, gemiKonumu.boylam, hedefNokta.enlem, hedefNokta.boylam);
        const hedefeKalanDakika = hedefeMesafe / HIZ_METRE_SANIYE / 60;

        io.emit('gemi-konum-guncelleme', {
            enlem: gemiKonumu.enlem,
            boylam: gemiKonumu.boylam,
            tetiklenen_noktalar: tetiklenenler,
            suanki_hedef: rotaAdlari[suankiHedefIndex],
            sonraki_duraklar: rotaAdlari.slice(suankiHedefIndex + 1),
            ilerleme_yuzdesi: ilerlemeYuzdesi,
            toplam_kalan_dakika: toplamKalanDakika,
            hedefe_kalan_dakika: hedefeKalanDakika
        });

        console.log(`Konum: ${gemiKonumu.enlem.toFixed(4)}, ${gemiKonumu.boylam.toFixed(4)} | Ilerleme: %${ilerlemeYuzdesi.toFixed(0)} | Kalan: ${toplamKalanDakika.toFixed(1)} dk`);

    } catch (hata) {
        console.log('Konum kontrol hatasi:', hata.message);
    }
}

io.use((soket, next) => {
    const token = soket.handshake.auth?.token;
    const payload = typeof token === 'string' ? tokenDogrula(token, JWT_GIZLI_ANAHTARI) : null;
    if (!payload) {
        return next(new Error('Yetkisiz'));
    }
    soket.data.kullanici = payload;
    next();
});

io.on('connection', (soket) => {
    console.log('Yeni bir cihaz baglandi. ID:', soket.id);

    soket.on('acil-durum-baslat', (bilgi, geriBildir) => {
        if (!['kaptan', 'admin'].includes(soket.data.kullanici.rol)) {
            console.log('YETKISIZ ROL ile acil-durum-baslat denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz rol' });
            return;
        }
        if (!gemiAdiGecerliMi(bilgi?.gemi_adi)) {
            console.log('GECERSIZ gemi_adi ile istek. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz veri' });
            return;
        }
        console.log('ACIL DURUM BASLATILDI:', { gemi: bilgi.gemi_adi });
        io.emit('acil-durum-uyarisi', {
            mesaj: 'ACIL DURUM! Lutfen tahliye talimatlarini takip edin.',
            gemi: bilgi.gemi_adi,
            zaman: new Date().toISOString()
        });
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });

    soket.on('acil-durum-bitir', (bilgi, geriBildir) => {
        if (!['kaptan', 'admin'].includes(soket.data.kullanici.rol)) {
            console.log('YETKISIZ ROL ile acil-durum-bitir denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz rol' });
            return;
        }
        if (!gemiAdiGecerliMi(bilgi?.gemi_adi)) {
            console.log('GECERSIZ gemi_adi ile istek. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz veri' });
            return;
        }
        console.log('ACIL DURUM BITIRILDI:', { gemi: bilgi.gemi_adi });
        io.emit('acil-durum-bitti', {
            mesaj: 'Acil durum sona erdi. Normal yolculuga devam ediliyor.',
            zaman: new Date().toISOString()
        });
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });

    soket.on('yolcu-sayisi-guncelle', (bilgi, geriBildir) => {
        if (!sayiGecerliMi(bilgi?.sayi) || !gemiAdiGecerliMi(bilgi?.gemi_adi)) {
            console.log('GECERSIZ veri ile yolcu-sayisi-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz veri' });
            return;
        }
        console.log('YOLCU SAYISI GUNCELLENDI:', { sayi: bilgi.sayi, gemi_adi: bilgi.gemi_adi });
        io.emit('yolcu-sayisi-yayin', { sayi: bilgi.sayi, gemi_adi: bilgi.gemi_adi });
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });

    soket.on('disconnect', () => {
        console.log('Bir cihaz ayrildi. ID:', soket.id);
    });
});
app.post('/reset-gemi', jwtDogrulaMiddleware(tokenDogrula, JWT_GIZLI_ANAHTARI, ['kaptan', 'admin']), (req, res) => {
    gemiKonumu.enlem = baslangicKonumu.enlem;
    gemiKonumu.boylam = baslangicKonumu.boylam;
    suankiHedefIndex = 0;
    varisBildirimiGonderildi = false;
    console.log('GEMI SIFIRLANDI. Kullanici:', req.kullanici.kullanici_adi);
    res.json({ tamam: true });
});
app.get('/tum-noktalar', async (req, res) => {
    try {
        const sonuc = await havuz.query(
            'SELECT ad, tip, aciklama, video_url, sesli_anlatim_url, videolu_anlatim_url FROM ilgi_noktalari ORDER BY ad'
        );
        res.json(sonuc.rows);
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Ilgi noktalari alinamadi');
    }
});

app.get('/hava-durumu', async (req, res) => {
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${gemiKonumu.enlem}&lon=${gemiKonumu.boylam}&appid=${HAVA_DURUMU_API_ANAHTARI}&units=metric&lang=tr`;
        const yanit = await fetch(url);
        const veri = await yanit.json();

        if (veri.cod && veri.cod !== 200) {
            return sunucuHatasiYanitla(res, new Error(veri.message || 'Hava durumu alinamadi'), 'Hava durumu alinamadi');
        }

        res.json({
            sicaklik: Math.round(veri.main.temp),
            aciklama: veri.weather[0].description,
            ruzgarHizi: Math.round(veri.wind.speed * 3.6) // m/s -> km/s
        });
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Hava durumu alinamadi');
    }
});

app.post('/login', async (req, res) => {
    const { kullanici_adi, sifre } = req.body || {};
    if (typeof kullanici_adi !== 'string' || typeof sifre !== 'string') {
        return res.status(400).json({ hata: 'Gecersiz istek' });
    }

    try {
        const kullanici = await kullaniciAdiylaBul(havuz, kullanici_adi);
        const hashKarsilastir = kullanici ? kullanici.sifre_hash : SAHTE_SIFRE_HASH;
        const sifreGecerli = await sifreDogrula(sifre, hashKarsilastir);
        if (!kullanici || !sifreGecerli) {
            return res.status(401).json({ hata: 'Gecersiz kullanici adi veya sifre' });
        }

        const payload = { id: kullanici.id, kullanici_adi: kullanici.kullanici_adi, rol: kullanici.rol };
        res.json({
            erisimTokeni: erisimTokeniOlustur(payload, JWT_GIZLI_ANAHTARI),
            yenilemeTokeni: yenilemeTokeniOlustur(payload, JWT_GIZLI_ANAHTARI),
            rol: kullanici.rol
        });
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Giris yapilamadi');
    }
});

app.post('/token/yenile', (req, res) => {
    const { yenilemeTokeni } = req.body || {};
    const payload = typeof yenilemeTokeni === 'string' ? tokenDogrula(yenilemeTokeni, JWT_GIZLI_ANAHTARI) : null;
    if (!payload) {
        return res.status(401).json({ hata: 'Gecersiz veya suresi dolmus token' });
    }
    const yeniPayload = { id: payload.id, kullanici_adi: payload.kullanici_adi, rol: payload.rol };
    res.json({ erisimTokeni: erisimTokeniOlustur(yeniPayload, JWT_GIZLI_ANAHTARI) });
});

app.post('/geri-bildirim', (req, res) => {
    console.log('GERI BILDIRIM ALINDI:', req.body);
    res.json({ tamam: true });
});

app.use((hata, req, res, next) => {
    console.error('Istek hatasi:', hata.message);
    res.status(hata.status || 500).json({ hata: 'Istek islenemedi' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    setInterval(konumKontrolVeYayinla, 1000);
    sunucu.listen(PORT, () => {
        console.log(`Sunucu calisiyor: http://localhost:${PORT}`);
    });
}

module.exports = { app, sunucu, havuz, sunucuHatasiYanitla };