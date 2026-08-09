require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const { geofenceKontrolEt, ikiNoktaArasiMesafe } = require('./geofencing.js');
const { izinliOrijinListesi, corsOrijinKontrolu, corsMiddleware } = require('./cors.js');
const { gemiAdiGecerliMi, sayiGecerliMi } = require('./validation.js');
const { sifreDogrula, SAHTE_SIFRE_HASH } = require('./sifreYardimcisi.js');
const { erisimTokeniOlustur, yenilemeTokeniOlustur, tokenDogrula } = require('./jwtYardimcisi.js');
const { kullaniciAdiylaBul, idIleBul } = require('./personelRepo.js');
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
const JWT_GIZLI_ANAHTARI = process.env.JWT_GIZLI_ANAHTARI;
if (!JWT_GIZLI_ANAHTARI) {
    throw new Error('JWT_GIZLI_ANAHTARI tanimli olmali');
}

const aktifSeferler = new Map();

const ADIM_BUYUKLUGU = 0.002;
const HIZ_METRE_SANIYE = ADIM_BUYUKLUGU * 111320;

function seferStateOlustur(rotaNoktalariSatirlari) {
    const ilkNokta = rotaNoktalariSatirlari[0];
    const legMesafeleri = [];
    let oncekiNokta = ilkNokta;
    for (const nokta of rotaNoktalariSatirlari) {
        legMesafeleri.push(ikiNoktaArasiMesafe(oncekiNokta.enlem, oncekiNokta.boylam, nokta.enlem, nokta.boylam));
        oncekiNokta = nokta;
    }
    const toplamRotaMesafesi = legMesafeleri.reduce((a, b) => a + b, 0);

    return {
        konum: { enlem: ilkNokta.enlem, boylam: ilkNokta.boylam },
        hedefIndex: 1,
        varisBildirimiGonderildi: false,
        rotaNoktalari: rotaNoktalariSatirlari.map((n) => ({ enlem: n.enlem, boylam: n.boylam })),
        rotaAdlari: rotaNoktalariSatirlari.map((n) => n.ad),
        legMesafeleri,
        toplamRotaMesafesi
    };
}

function sahteGpsGuncelle(sefer, seferId) {
    const hedefNokta = sefer.rotaNoktalari[sefer.hedefIndex];

    const enlemFark = hedefNokta.enlem - sefer.konum.enlem;
    const boylamFark = hedefNokta.boylam - sefer.konum.boylam;
    const kalanMesafeDerece = Math.sqrt(enlemFark * enlemFark + boylamFark * boylamFark);

    if (kalanMesafeDerece > ADIM_BUYUKLUGU) {
        sefer.konum.enlem += (enlemFark / kalanMesafeDerece) * ADIM_BUYUKLUGU;
        sefer.konum.boylam += (boylamFark / kalanMesafeDerece) * ADIM_BUYUKLUGU;
    } else {
        if (sefer.hedefIndex < sefer.rotaNoktalari.length - 1) {
            sefer.hedefIndex++;
            console.log('Sefer ' + seferId + ' yeni hedefe geciyor:', sefer.rotaNoktalari[sefer.hedefIndex]);
        } else if (!sefer.varisBildirimiGonderildi) {
            sefer.varisBildirimiGonderildi = true;
            io.to('sefer:' + seferId).emit('varis-bildirimi', {
                mesaj: sefer.rotaAdlari[sefer.rotaAdlari.length - 1] + '\'a hos geldiniz! Yolculugunuz tamamlandi.'
            });
            console.log('VARIS BILDIRIMI GONDERILDI. Sefer:', seferId);
        }
    }
}

function kalanToplamMesafeHesapla(sefer) {
    const hedefNokta = sefer.rotaNoktalari[sefer.hedefIndex];
    let kalan = ikiNoktaArasiMesafe(sefer.konum.enlem, sefer.konum.boylam, hedefNokta.enlem, hedefNokta.boylam);

    for (let i = sefer.hedefIndex + 1; i < sefer.rotaNoktalari.length; i++) {
        kalan += sefer.legMesafeleri[i];
    }
    return kalan;
}

function sunucuHatasiYanitla(res, hata, genelMesaj) {
    console.error(genelMesaj + ':', hata.message);
    res.status(500).json({ hata: genelMesaj });
}

async function konumKontrolVeYayinla() {
    for (const [seferId, sefer] of aktifSeferler) {
        sahteGpsGuncelle(sefer, seferId);

        try {
            const sonuc = await havuz.query(
                'SELECT ad, tip, enlem, boylam, tetikleme_mesafesi_metre, aciklama, video_url, sesli_anlatim_url, videolu_anlatim_url FROM ilgi_noktalari WHERE hat_id IS NULL OR hat_id = $1',
                [sefer.hatId]
            );

            const tetiklenenler = [];

            for (const nokta of sonuc.rows) {
                const kontrol = geofenceKontrolEt(sefer.konum.enlem, sefer.konum.boylam, nokta);
                if (kontrol.tetiklendi) {
                    tetiklenenler.push(kontrol);
                }
            }

            const kalanToplamMesafe = kalanToplamMesafeHesapla(sefer);
            const ilerlemeYuzdesi = Math.min(100, Math.max(0, ((sefer.toplamRotaMesafesi - kalanToplamMesafe) / sefer.toplamRotaMesafesi) * 100));
            const toplamKalanDakika = kalanToplamMesafe / HIZ_METRE_SANIYE / 60;

            const hedefNokta = sefer.rotaNoktalari[sefer.hedefIndex];
            const hedefeMesafe = ikiNoktaArasiMesafe(sefer.konum.enlem, sefer.konum.boylam, hedefNokta.enlem, hedefNokta.boylam);
            const hedefeKalanDakika = hedefeMesafe / HIZ_METRE_SANIYE / 60;

            io.to('sefer:' + seferId).emit('gemi-konum-guncelleme', {
                enlem: sefer.konum.enlem,
                boylam: sefer.konum.boylam,
                tetiklenen_noktalar: tetiklenenler,
                suanki_hedef: sefer.rotaAdlari[sefer.hedefIndex],
                sonraki_duraklar: sefer.rotaAdlari.slice(sefer.hedefIndex + 1),
                ilerleme_yuzdesi: ilerlemeYuzdesi,
                toplam_kalan_dakika: toplamKalanDakika,
                hedefe_kalan_dakika: hedefeKalanDakika
            });

            console.log(`Sefer ${seferId} konum: ${sefer.konum.enlem.toFixed(4)}, ${sefer.konum.boylam.toFixed(4)} | Ilerleme: %${ilerlemeYuzdesi.toFixed(0)} | Kalan: ${toplamKalanDakika.toFixed(1)} dk`);

        } catch (hata) {
            console.log('Konum kontrol hatasi (sefer ' + seferId + '):', hata.message);
        }
    }
}

io.use((soket, next) => {
    const token = soket.handshake.auth?.token;
    if (typeof token !== 'string') {
        // Token yok: yolcu app gibi kimliksiz istemciler icin salt-okunur/dinleyici
        // baglantiya izin verilir. Yetki gerektiren event'ler (acil-durum-*,
        // yolcu-sayisi-guncelle) kendi handler'larinda soket.data.kullanici'yi kontrol eder.
        return next();
    }
    const payload = tokenDogrula(token, JWT_GIZLI_ANAHTARI);
    if (!payload || payload.tur !== 'erisim') {
        return next(new Error('Yetkisiz'));
    }
    soket.data.kullanici = payload;
    soket.data.tokenSuresi = payload.exp;
    next();
});

function oturumSuresiDolduMu(soket) {
    return Math.floor(Date.now() / 1000) >= soket.data.tokenSuresi;
}

io.on('connection', (soket) => {
    console.log('Yeni bir cihaz baglandi. ID:', soket.id);

    soket.on('acil-durum-baslat', (bilgi, geriBildir) => {
        if (!soket.data.kullanici) {
            console.log('KIMLIKSIZ baglanti ile acil-durum-baslat denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz' });
            return;
        }
        if (oturumSuresiDolduMu(soket)) {
            console.log('SURESI DOLMUS TOKEN ile acil-durum-baslat denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Oturum suresi doldu' });
            return;
        }
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
        if (!soket.data.kullanici) {
            console.log('KIMLIKSIZ baglanti ile acil-durum-bitir denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz' });
            return;
        }
        if (oturumSuresiDolduMu(soket)) {
            console.log('SURESI DOLMUS TOKEN ile acil-durum-bitir denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Oturum suresi doldu' });
            return;
        }
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
        if (!soket.data.kullanici) {
            console.log('KIMLIKSIZ baglanti ile yolcu-sayisi-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz' });
            return;
        }
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

app.post('/token/yenile', async (req, res) => {
    const { yenilemeTokeni } = req.body || {};
    const payload = typeof yenilemeTokeni === 'string' ? tokenDogrula(yenilemeTokeni, JWT_GIZLI_ANAHTARI) : null;
    if (!payload || payload.tur !== 'yenileme') {
        return res.status(401).json({ hata: 'Gecersiz veya suresi dolmus token' });
    }

    try {
        const kullanici = await idIleBul(havuz, payload.id);
        if (!kullanici) {
            return res.status(401).json({ hata: 'Gecersiz veya suresi dolmus token' });
        }
        const yeniPayload = { id: kullanici.id, kullanici_adi: kullanici.kullanici_adi, rol: kullanici.rol };
        res.json({ erisimTokeni: erisimTokeniOlustur(yeniPayload, JWT_GIZLI_ANAHTARI) });
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Token yenilenemedi');
    }
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

module.exports = { app, sunucu, havuz, sunucuHatasiYanitla, aktifSeferler, seferStateOlustur, konumKontrolVeYayinla };