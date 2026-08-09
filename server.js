require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const { geofenceKontrolEt, ikiNoktaArasiMesafe } = require('./geofencing.js');
const { izinliOrijinListesi, corsOrijinKontrolu, corsMiddleware } = require('./cors.js');
const { sayiGecerliMi, konumGecerliMi } = require('./validation.js');
const { sifreDogrula, SAHTE_SIFRE_HASH } = require('./sifreYardimcisi.js');
const { erisimTokeniOlustur, yenilemeTokeniOlustur, tokenDogrula } = require('./jwtYardimcisi.js');
const { kullaniciAdiylaBul, idIleBul } = require('./personelRepo.js');
const { tumGemileriListele, gemiGetir } = require('./gemilerRepo.js');
const { tumHatlariListele, rotaNoktalariGetir } = require('./hatlarRepo.js');
const { seferOlustur, seferBitir, seferlerAktifListele } = require('./seferRepo.js');
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

const VARIS_ESIGI_METRE = 50;
const VARSAYILAN_HIZ_METRE_SANIYE = 7;

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

// Gercek GPS ile ara rota noktalari (orn. deniz ortasindaki batik isareti, bir ada)
// cogu zaman yuzlerce metre - kilometrelerce uzaktan geciliyor; sadece 50m'lik varis
// cemberine bakmak hedefIndex'i sonsuza kadar ayni noktada takili birakirdi. Bu yuzden
// "yetisme" mantigi kullaniyoruz: gemi mevcut hedeften cok, bir SONRAKI hedefe daha
// yakinsa o nokta gecilmis sayilir ve hedefIndex ilerler. Dongu sayesinde tek bir GPS
// guncellemesi (orn. baglanti kopmasindan sonra) birden fazla gecilmis noktayi yakalar.
// 50m'lik cember yalnizca son noktaya varis (varis-bildirimi) tetigi olarak kaliyor.
function hedefIlerlet(sefer, seferId) {
    while (sefer.hedefIndex < sefer.rotaNoktalari.length - 1) {
        const hedefNokta = sefer.rotaNoktalari[sefer.hedefIndex];
        const sonrakiNokta = sefer.rotaNoktalari[sefer.hedefIndex + 1];
        const hedefeMesafe = ikiNoktaArasiMesafe(sefer.konum.enlem, sefer.konum.boylam, hedefNokta.enlem, hedefNokta.boylam);
        const sonrakineMesafe = ikiNoktaArasiMesafe(sefer.konum.enlem, sefer.konum.boylam, sonrakiNokta.enlem, sonrakiNokta.boylam);

        if (hedefeMesafe <= VARIS_ESIGI_METRE || sonrakineMesafe < hedefeMesafe) {
            sefer.hedefIndex++;
            console.log('Sefer ' + seferId + ' yeni hedefe geciyor:', sefer.rotaNoktalari[sefer.hedefIndex]);
        } else {
            break;
        }
    }

    if (sefer.hedefIndex === sefer.rotaNoktalari.length - 1 && !sefer.varisBildirimiGonderildi) {
        const sonNokta = sefer.rotaNoktalari[sefer.hedefIndex];
        const sonaMesafe = ikiNoktaArasiMesafe(sefer.konum.enlem, sefer.konum.boylam, sonNokta.enlem, sonNokta.boylam);
        if (sonaMesafe <= VARIS_ESIGI_METRE) {
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

async function konumKontrolVeYayinla(seferId, sefer, hizMetreSaniye) {
    try {
        hedefIlerlet(sefer, seferId);
        // Tip kontrolu olmadan bir boolean/string gibi sayisal olmayan hiz degeri
        // ">" karsilastirmasinda zorlanip anlamsiz bir ETA uretebilirdi.
        const hiz = typeof hizMetreSaniye === 'number' && hizMetreSaniye > 0 ? hizMetreSaniye : VARSAYILAN_HIZ_METRE_SANIYE;

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
        const toplamKalanDakika = kalanToplamMesafe / hiz / 60;

        const hedefNokta = sefer.rotaNoktalari[sefer.hedefIndex];
        const hedefeMesafe = ikiNoktaArasiMesafe(sefer.konum.enlem, sefer.konum.boylam, hedefNokta.enlem, hedefNokta.boylam);
        const hedefeKalanDakika = hedefeMesafe / hiz / 60;

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
        const sefer = aktifSeferler.get(soket.data.aktifSeferId);
        if (!sefer) {
            console.log('SEFER SECILMEMIS ile acil-durum-baslat denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Sefer secilmedi' });
            return;
        }
        console.log('ACIL DURUM BASLATILDI:', { gemi: sefer.gemiAdi, seferId: soket.data.aktifSeferId });
        io.to('sefer:' + soket.data.aktifSeferId).emit('acil-durum-uyarisi', {
            mesaj: 'ACIL DURUM! Lutfen tahliye talimatlarini takip edin.',
            gemi: sefer.gemiAdi,
            zaman: new Date().toISOString()
        });
        sefer.acilDurumAktif = true;
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
        const sefer = aktifSeferler.get(soket.data.aktifSeferId);
        if (!sefer) {
            console.log('SEFER SECILMEMIS ile acil-durum-bitir denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Sefer secilmedi' });
            return;
        }
        console.log('ACIL DURUM BITIRILDI:', { gemi: sefer.gemiAdi, seferId: soket.data.aktifSeferId });
        io.to('sefer:' + soket.data.aktifSeferId).emit('acil-durum-bitti', {
            mesaj: 'Acil durum sona erdi. Normal yolculuga devam ediliyor.',
            zaman: new Date().toISOString()
        });
        sefer.acilDurumAktif = false;
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });

    soket.on('yolcu-sayisi-guncelle', (bilgi, geriBildir) => {
        if (!soket.data.kullanici) {
            console.log('KIMLIKSIZ baglanti ile yolcu-sayisi-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz' });
            return;
        }
        const sefer = aktifSeferler.get(soket.data.aktifSeferId);
        if (!sefer) {
            console.log('SEFER SECILMEMIS ile yolcu-sayisi-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Sefer secilmedi' });
            return;
        }
        if (!sayiGecerliMi(bilgi?.sayi)) {
            console.log('GECERSIZ veri ile yolcu-sayisi-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz veri' });
            return;
        }
        console.log('YOLCU SAYISI GUNCELLENDI:', { sayi: bilgi.sayi, seferId: soket.data.aktifSeferId });
        io.to('sefer:' + soket.data.aktifSeferId).emit('yolcu-sayisi-yayin', { sayi: bilgi.sayi, gemi_adi: sefer.gemiAdi });
        sefer.yolcuSayisi = bilgi.sayi;
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });

    soket.on('konum-guncelle', (bilgi, geriBildir) => {
        if (!soket.data.kullanici) {
            console.log('KIMLIKSIZ baglanti ile konum-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz' });
            return;
        }
        if (oturumSuresiDolduMu(soket)) {
            console.log('SURESI DOLMUS TOKEN ile konum-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Oturum suresi doldu' });
            return;
        }
        if (!['kaptan', 'admin'].includes(soket.data.kullanici.rol)) {
            console.log('YETKISIZ ROL ile konum-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Yetkisiz rol' });
            return;
        }
        const sefer = aktifSeferler.get(soket.data.aktifSeferId);
        if (!sefer) {
            console.log('SEFER SECILMEMIS ile konum-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Sefer secilmedi' });
            return;
        }
        if (!konumGecerliMi(bilgi?.enlem, bilgi?.boylam)) {
            console.log('GECERSIZ konum ile konum-guncelle denemesi. ID:', soket.id);
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz konum' });
            return;
        }
        sefer.konum = { enlem: bilgi.enlem, boylam: bilgi.boylam };
        konumKontrolVeYayinla(soket.data.aktifSeferId, sefer, bilgi.hiz)
            .catch((hata) => console.log('Konum kontrol hatasi (beklenmedik):', hata.message));
        if (typeof geriBildir === 'function') geriBildir({ tamam: true });
    });

    soket.on('sefer-sec', (bilgi, geriBildir) => {
        const seferId = Number(bilgi?.sefer_id);
        const sefer = aktifSeferler.get(seferId);
        if (!Number.isInteger(seferId) || !sefer) {
            if (typeof geriBildir === 'function') geriBildir({ tamam: false, hata: 'Gecersiz veya aktif olmayan sefer' });
            return;
        }
        if (soket.data.aktifSeferId) {
            soket.leave('sefer:' + soket.data.aktifSeferId);
        }
        soket.data.aktifSeferId = seferId;
        soket.join('sefer:' + seferId);
        if (typeof geriBildir === 'function') {
            geriBildir({
                tamam: true,
                acil_durum_aktif: !!sefer.acilDurumAktif,
                yolcu_sayisi: sefer.yolcuSayisi || 0
            });
        }
    });

    soket.on('disconnect', () => {
        console.log('Bir cihaz ayrildi. ID:', soket.id);
    });
});
app.post('/sefer/baslat', jwtDogrulaMiddleware(tokenDogrula, JWT_GIZLI_ANAHTARI, ['kaptan', 'admin']), async (req, res) => {
    const gemiId = Number(req.body?.gemi_id);
    const hatId = Number(req.body?.hat_id);
    if (!Number.isInteger(gemiId) || !Number.isInteger(hatId)) {
        return res.status(400).json({ hata: 'Gecersiz istek' });
    }

    try {
        const gemi = await gemiGetir(havuz, gemiId);
        if (!gemi) {
            return res.status(400).json({ hata: 'Gecersiz gemi_id' });
        }

        const rotaNoktalariSatirlari = await rotaNoktalariGetir(havuz, hatId);
        if (rotaNoktalariSatirlari.length < 2) {
            // Bir hattin seyredilebilir olmasi icin en az bir baslangic ve bir hedef
            // noktasi gerekir; aksi halde seferStateOlustur'un hedefIndex:1 varsayimi
            // rotaNoktalari[1]'i undefined birakir ve hedefIlerlet patlar.
            return res.status(400).json({ hata: 'Gecersiz hat_id' });
        }

        const sefer = await seferOlustur(havuz, { gemiId, hatId, baslatanPersonelId: req.kullanici.id });
        const seferState = seferStateOlustur(rotaNoktalariSatirlari);
        aktifSeferler.set(sefer.id, { ...seferState, gemiId, hatId, gemiAdi: gemi.ad });

        res.json({ sefer_id: sefer.id });
    } catch (hata) {
        if (hata.code === '23505') {
            return res.status(409).json({ hata: 'Bu gemi zaten aktif bir seferde' });
        }
        sunucuHatasiYanitla(res, hata, 'Sefer baslatilamadi');
    }
});

app.post('/sefer/bitir', jwtDogrulaMiddleware(tokenDogrula, JWT_GIZLI_ANAHTARI, ['kaptan', 'admin']), async (req, res) => {
    const seferId = Number(req.body?.sefer_id);
    if (!Number.isInteger(seferId)) {
        return res.status(404).json({ hata: 'Aktif sefer bulunamadi' });
    }

    try {
        // aktifSeferler bellek-ici bir onbellektir (sunucu yeniden baslarsa bosalir);
        // DB guncellemesi sadece bellekte kayitli seferlere gore degil, DB'nin kendi
        // durumuna gore yapilmali. UPDATE'in etkiledigi satir sayisi, seferin DB'de
        // gercekten var olup olmadigini (dogru "404" kaynagini) belirler.
        const etkilenenSatir = await seferBitir(havuz, seferId);
        if (etkilenenSatir === 0) {
            return res.status(404).json({ hata: 'Aktif sefer bulunamadi' });
        }
        if (aktifSeferler.has(seferId)) {
            aktifSeferler.delete(seferId);
            io.to('sefer:' + seferId).emit('sefer-bitti', {});
        }
        res.json({ tamam: true });
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Sefer bitirilemedi');
    }
});

app.get('/seferler/aktif', async (req, res) => {
    try {
        const seferler = await seferlerAktifListele(havuz);
        res.json(seferler);
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Aktif seferler alinamadi');
    }
});

app.get('/gemiler', async (req, res) => {
    try {
        const gemiler = await tumGemileriListele(havuz);
        res.json(gemiler);
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Gemiler alinamadi');
    }
});

app.get('/hatlar', async (req, res) => {
    try {
        const hatlar = await tumHatlariListele(havuz);
        res.json(hatlar);
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Hatlar alinamadi');
    }
});

app.post('/reset-gemi', jwtDogrulaMiddleware(tokenDogrula, JWT_GIZLI_ANAHTARI, ['kaptan', 'admin']), (req, res) => {
    const seferId = Number(req.body?.sefer_id);
    const sefer = aktifSeferler.get(seferId);
    if (!sefer) {
        return res.status(404).json({ hata: 'Aktif sefer bulunamadi' });
    }
    sefer.konum = { ...sefer.rotaNoktalari[0] };
    sefer.hedefIndex = 1;
    sefer.varisBildirimiGonderildi = false;
    console.log('SEFER SIFIRLANDI. Sefer ID:', seferId, 'Kullanici:', req.kullanici.kullanici_adi);
    res.json({ tamam: true });
});
app.get('/tum-noktalar', async (req, res) => {
    const seferId = Number(req.query.sefer_id);
    const sefer = aktifSeferler.get(seferId);
    if (!sefer) {
        return res.status(400).json({ hata: 'Gecersiz veya aktif olmayan sefer_id' });
    }
    try {
        const sonuc = await havuz.query(
            'SELECT ad, tip, aciklama, video_url, sesli_anlatim_url, videolu_anlatim_url FROM ilgi_noktalari WHERE hat_id IS NULL OR hat_id = $1 ORDER BY ad',
            [sefer.hatId]
        );
        res.json(sonuc.rows);
    } catch (hata) {
        sunucuHatasiYanitla(res, hata, 'Ilgi noktalari alinamadi');
    }
});

app.get('/hava-durumu', async (req, res) => {
    const seferId = Number(req.query.sefer_id);
    const sefer = aktifSeferler.get(seferId);
    if (!sefer) {
        return res.status(400).json({ hata: 'Gecersiz veya aktif olmayan sefer_id' });
    }
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${sefer.konum.enlem}&lon=${sefer.konum.boylam}&appid=${HAVA_DURUMU_API_ANAHTARI}&units=metric&lang=tr`;
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
    sunucu.listen(PORT, () => {
        console.log(`Sunucu calisiyor: http://localhost:${PORT}`);
    });
}

module.exports = { app, sunucu, havuz, sunucuHatasiYanitla, aktifSeferler, seferStateOlustur, konumKontrolVeYayinla };