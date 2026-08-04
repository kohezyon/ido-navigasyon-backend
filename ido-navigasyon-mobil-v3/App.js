import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity, StatusBar, Vibration, AccessibilityInfo, Switch, Modal, Alert, TextInput } from 'react-native';
import { io } from 'socket.io-client';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { marka, koyuTema, temaSec, tipRenkleri, haritaRenkleri } from './theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const SUNUCU_ADRESI = process.env.EXPO_PUBLIC_SUNUCU_ADRESI || 'https://ido-navigasyon-backend.onrender.com';

const TANITIM_EKRANLARI = [
  { baslik: 'Hos Geldiniz', metin: 'IDO Engelsiz Navigasyon, Yalova-Istanbul feribot yolculugunuzu erisilebilir kilar.', ikon: '🚢' },
  { baslik: 'Canli Harita', metin: 'Geminin konumunu haritada canli takip edin, adalara ve batiklara yaklastikca bilgi alin.', ikon: '🗺️' },
  { baslik: 'Erisilebilir Icerik', metin: 'Her durak icin isaret dili, sesli anlatim ve videolu anlatim secenekleri sunulur.', ikon: '🤟' },
  { baslik: 'Acil Durum Uyarilari', metin: 'Acil bir durumda ekran kirmiziya doner ve telefon titrer, guvenliginiz icin talimatlari takip edin.', ikon: '🚨' },
];

export default function App() {
  const [baglantiDurumu, setBaglantiDurumu] = useState('Baglaniyor...');
  const [konum, setKonum] = useState(null);
  const [yakinlik, setYakinlik] = useState('Herhangi bir noktaya yakin degil');
  const [acilDurum, setAcilDurum] = useState(false);
  const [acilMesaj, setAcilMesaj] = useState('');
  const [gosterilecekKart, setGosterilecekKart] = useState(null);
  const [suankiHedef, setSuankiHedef] = useState('');
  const [sonrakiDuraklar, setSonrakiDuraklar] = useState([]);
  const [varisMesaji, setVarisMesaji] = useState('');
  const [karanlikMod, setKaranlikMod] = useState(false);
  const [ayarlarAcik, setAyarlarAcik] = useState(false);
  const [yardimAcik, setYardimAcik] = useState(false);
  const [ozetAcik, setOzetAcik] = useState(false);
  const [titresimAcik, setTitresimAcik] = useState(true);
  const [yaziBoyutu, setYaziBoyutu] = useState('orta');
  const [tumNoktalar, setTumNoktalar] = useState([]);
  const [acikDurakIndex, setAcikDurakIndex] = useState(null);
  const [ilerlemeYuzdesi, setIlerlemeYuzdesi] = useState(0);
  const [toplamKalanDakika, setToplamKalanDakika] = useState(null);
  const [hedefeKalanDakika, setHedefeKalanDakika] = useState(null);
  const [favoriler, setFavoriler] = useState([]);
  const [gecmisBildirimler, setGecmisBildirimler] = useState([]);
  const [geriBildirimVerildi, setGeriBildirimVerildi] = useState(false);
  const [geriBildirimNotu, setGeriBildirimNotu] = useState('');
  const [durakSayaci, setDurakSayaci] = useState(0);
  const [videoSayaci, setVideoSayaci] = useState(0);
  const [yolcuSayisi, setYolcuSayisi] = useState(null);
  const [havaDurumu, setHavaDurumu] = useState(null);
  const [tanitimGoster, setTanitimGoster] = useState(false);
  const [tanitimIndex, setTanitimIndex] = useState(0);
  const [tanitimYuklendi, setTanitimYuklendi] = useState(false);

  const webViewRef = useRef(null);
  const rotaGecmisiRef = useRef([]);
  const gosterilecekKartRef = useRef(null);
  const titresimAcikRef = useRef(true);
  const durakSayaciRef = useRef(0);
  const videoSayaciRef = useRef(0);

  useEffect(() => {
    titresimAcikRef.current = titresimAcik;
  }, [titresimAcik]);

  useEffect(() => {
    AsyncStorage.getItem('favoriler').then((veri) => {
      if (veri) setFavoriler(JSON.parse(veri));
    });

    AsyncStorage.getItem('tanitimGorundu').then((veri) => {
      if (!veri) {
        setTanitimGoster(true);
      }
      setTanitimYuklendi(true);
    });
  }, []);

  function tanitimiKapat() {
    setTanitimGoster(false);
    AsyncStorage.setItem('tanitimGorundu', 'evet');
  }

  function tanitimIleri() {
    if (tanitimIndex < TANITIM_EKRANLARI.length - 1) {
      setTanitimIndex(tanitimIndex + 1);
    } else {
      tanitimiKapat();
    }
  }

  function favoriDegistir(ad) {
    let yeniListe;
    if (favoriler.includes(ad)) {
      yeniListe = favoriler.filter((f) => f !== ad);
    } else {
      yeniListe = [...favoriler, ad];
    }
    setFavoriler(yeniListe);
    AsyncStorage.setItem('favoriler', JSON.stringify(yeniListe));
  }

  function gecmiseEkle(mesaj) {
    const zaman = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    setGecmisBildirimler((onceki) => [{ mesaj, zaman }, ...onceki].slice(0, 10));
  }

  function geriBildirimGonder(begendi) {
    setGeriBildirimVerildi(true);
    fetch(SUNUCU_ADRESI + '/geri-bildirim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ begendi, not: geriBildirimNotu, zaman: new Date().toISOString() }),
    }).catch(() => {});
    Alert.alert('Tesekkurler!', 'Geri bildiriminiz icin tesekkur ederiz.');
  }

  function videoAc(url) {
    videoSayaciRef.current += 1;
    setVideoSayaci(videoSayaciRef.current);
    Linking.openURL(url);
  }

  useEffect(() => {
    Notifications.requestPermissionsAsync();
    fetch(SUNUCU_ADRESI + '/reset-gemi', { method: 'POST' }).catch(() => {});

    fetch(SUNUCU_ADRESI + '/tum-noktalar')
      .then((yanit) => yanit.json())
      .then((veri) => setTumNoktalar(veri))
      .catch((hata) => console.log('Tum noktalar cekilemedi:', hata.message));

    function havaDurumuCek() {
      fetch(SUNUCU_ADRESI + '/hava-durumu')
        .then((yanit) => yanit.json())
        .then((veri) => {
          if (!veri.hata) setHavaDurumu(veri);
        })
        .catch(() => {});
    }
    havaDurumuCek();
    const havaDurumuAralik = setInterval(havaDurumuCek, 10 * 60 * 1000);

    const soket = io(SUNUCU_ADRESI);

    soket.on('connect', () => {
      setBaglantiDurumu('Bagli');
    });

    soket.on('disconnect', () => {
      setBaglantiDurumu('Baglanti kesildi');
    });

    soket.on('yolcu-sayisi-yayin', (veri) => {
      setYolcuSayisi(veri.sayi);
    });

    soket.on('gemi-konum-guncelleme', (veri) => {
      setKonum(veri);
      setSuankiHedef(veri.suanki_hedef || '');
      setSonrakiDuraklar(veri.sonraki_duraklar || []);
      setIlerlemeYuzdesi(veri.ilerleme_yuzdesi || 0);
      setToplamKalanDakika(veri.toplam_kalan_dakika);
      setHedefeKalanDakika(veri.hedefe_kalan_dakika);

      if (veri.tetiklenen_noktalar.length > 0) {
        const isimler = veri.tetiklenen_noktalar
          .map((n) => n.nokta_adi + ' (' + n.mesafe_metre + 'm)')
          .join(', ');
        setYakinlik('Yaklasildi: ' + isimler);

        const gosterilecek = veri.tetiklenen_noktalar.find(
          (n) => n.tip === 'ada' || n.tip === 'batik'
        );

        if (gosterilecek && !gosterilecekKartRef.current) {
          if (titresimAcikRef.current) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          durakSayaciRef.current += 1;
          setDurakSayaci(durakSayaciRef.current);
        }
        gosterilecekKartRef.current = gosterilecek || null;

        setGosterilecekKart(gosterilecek || null);
      } else {
        setYakinlik('Herhangi bir noktaya yakin degil');
        setGosterilecekKart(null);
        gosterilecekKartRef.current = null;
      }

      rotaGecmisiRef.current.push([veri.enlem, veri.boylam]);
      if (rotaGecmisiRef.current.length > 50) {
        rotaGecmisiRef.current.shift();
      }

      if (webViewRef.current) {
        const rotaJson = JSON.stringify(rotaGecmisiRef.current);
        const komut = `guncelleGemi(${veri.enlem}, ${veri.boylam}, ${rotaJson}); true;`;
        webViewRef.current.injectJavaScript(komut);
      }
    });

    soket.on('acil-durum-uyarisi', (veri) => {
      setAcilDurum(true);
      setAcilMesaj(veri.mesaj + ' (Gemi: ' + veri.gemi + ')');
      gecmiseEkle('Acil durum baslatildi: ' + veri.mesaj);
      if (titresimAcikRef.current) {
        Vibration.vibrate([0, 1500, 300], true);
      }
      AccessibilityInfo.announceForAccessibility('Acil durum! ' + veri.mesaj);
      Notifications.scheduleNotificationAsync({
        content: { title: 'ACIL DURUM', body: veri.mesaj, sound: true },
        trigger: null,
      });
    });

    soket.on('acil-durum-bitti', (veri) => {
      setAcilDurum(false);
      setAcilMesaj('');
      gecmiseEkle('Acil durum sona erdi');
      Vibration.cancel();
    });

    soket.on('varis-bildirimi', (veri) => {
      setVarisMesaji(veri.mesaj);
      gecmiseEkle(veri.mesaj);
      setOzetAcik(true);
      if (titresimAcikRef.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      AccessibilityInfo.announceForAccessibility(veri.mesaj);
      Notifications.scheduleNotificationAsync({
        content: { title: 'IDO Engelsiz Navigasyon', body: veri.mesaj, sound: true },
        trigger: null,
      });
    });

    return () => {
      soket.disconnect();
      Vibration.cancel();
      clearInterval(havaDurumuAralik);
    };
  }, []);

  function tipRengi(tip) {
    return tipRenkleri(tip, karanlikMod);
  }

  const tema = temaSec(karanlikMod);
  const renkler = {
    govdeArkaplan: tema.zemin,
    kutuArkaplan: tema.yuzey,
    yazi: tema.yaziBirincil,
    etiket: tema.yaziIkincil,
  };

  const boyutCarpani = yaziBoyutu === 'kucuk' ? 0.85 : yaziBoyutu === 'buyuk' ? 1.3 : 1;

  const haritaHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>
        body { margin: 0; padding: 0; }
        #harita { width: 100vw; height: 100vh; background: ${karanlikMod ? haritaRenkleri.haritaZeminKoyu : haritaRenkleri.haritaZeminAcik}; }
        .leaflet-popup-content-wrapper { border-radius: 10px; }
        .ada-popup .leaflet-popup-content-wrapper { background: ${haritaRenkleri.adaPopupArkaplan}; color: ${marka.turuncu.metinAcikMod}; font-weight: bold; }
        .batik-popup .leaflet-popup-content-wrapper { background: ${haritaRenkleri.batikPopupArkaplan}; color: ${marka.kirmizi.metinAcikMod}; font-weight: bold; }
      </style>
    </head>
    <body>
      <div id="harita"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        const map = L.map('harita', { zoomControl: false, attributionControl: false }).setView([40.75, 29.15], 10);

        L.tileLayer('${karanlikMod
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'}', {
          maxZoom: 19
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        const gemiIkonu = L.divIcon({
          html: '<svg width="46" height="30" viewBox="0 0 46 30" xmlns="http://www.w3.org/2000/svg"><ellipse cx="23" cy="27" rx="21" ry="2" fill="rgba(0,0,0,0.25)"/><path d="M6 20 L40 20 L35 27 L11 27 Z" fill="${haritaRenkleri.gemiGovde}" stroke="${haritaRenkleri.gemiCerceve}" stroke-width="1.5"/><rect x="14" y="10" width="18" height="10" fill="${haritaRenkleri.gemiKabin}" rx="1"/><rect x="16" y="12" width="4" height="4" fill="${haritaRenkleri.gemiPencere}"/><rect x="22" y="12" width="4" height="4" fill="${haritaRenkleri.gemiPencere}"/><text x="23" y="18" font-size="6" font-weight="bold" fill="white" text-anchor="middle">IDO</text><rect x="21" y="3" width="4" height="8" fill="${haritaRenkleri.gemiBaca}" rx="1"/></svg>',
          className: '', iconSize: [46, 30], iconAnchor: [23, 27]
        });
        let gemiMarker = L.marker([40.65, 29.26], { icon: gemiIkonu }).addTo(map);

        const adaIkonu = L.divIcon({
          html: '<div style="background:${haritaRenkleri.ada};width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
          className: '', iconSize: [16, 16]
        });
        const batikIkonu = L.divIcon({
          html: '<div style="background:${haritaRenkleri.batik};width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
          className: '', iconSize: [16, 16]
        });

        L.marker([40.8756, 29.0917], { icon: adaIkonu }).addTo(map)
          .bindPopup('<b>Heybeliada</b>', { className: 'ada-popup' });
        L.marker([40.8664, 29.1219], { icon: adaIkonu }).addTo(map)
          .bindPopup('<b>Buyukada</b>', { className: 'ada-popup' });
        L.marker([40.9138, 29.0508], { icon: adaIkonu }).addTo(map)
          .bindPopup('<b>Kinaliada</b>', { className: 'ada-popup' });
        L.marker([40.7200, 29.1600], { icon: batikIkonu }).addTo(map)
          .bindPopup('<b>Bozuk Gemi Batigi</b>', { className: 'batik-popup' });

        let rotaCizgisi = L.polyline([], { color: '${marka.mavi.taban}', weight: 3, opacity: 0.6 }).addTo(map);

        function guncelleGemi(enlem, boylam, rotaNoktalari) {
          gemiMarker.setLatLng([enlem, boylam]);
          map.panTo([enlem, boylam]);
          if (rotaNoktalari) {
            rotaCizgisi.setLatLngs(rotaNoktalari);
          }
        }
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.disKapsayici, { backgroundColor: koyuTema.zemin }]}>
      <StatusBar barStyle="light-content" backgroundColor={koyuTema.zemin} />

      <View style={[styles.ustCubuk, acilDurum && styles.ustCubukAcil]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[styles.ustCubukBaslik, { fontSize: 20 * boyutCarpani }]}>IDO Engelsiz Navigasyon</Text>
            <Text style={[styles.ustCubukAltBaslik, { fontSize: 13 * boyutCarpani, color: acilDurum ? '#FFFFFF' : undefined }]}>
              {acilDurum ? 'ACIL DURUM' : 'Yalova - Istanbul Hatti'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={() => setYardimAcik(true)} accessibilityRole="button" accessibilityLabel="Yardim" style={styles.temaButon}>
              <Text style={styles.temaButonYazi}>❓</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAyarlarAcik(true)} accessibilityRole="button" accessibilityLabel="Ayarlar" style={styles.temaButon}>
              <Text style={styles.temaButonYazi}>⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setKaranlikMod(!karanlikMod)} accessibilityRole="button" accessibilityLabel={karanlikMod ? 'Aydinlik moda gec' : 'Karanlik moda gec'} style={styles.temaButon}>
              <Text style={styles.temaButonYazi}>{karanlikMod ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.ilerlemeDisKutu}>
          <View style={[styles.ilerlemeIcKutu, { width: ilerlemeYuzdesi + '%' }]} />
        </View>
        <Text style={styles.ilerlemeYazi}>
          Yalova %{ilerlemeYuzdesi.toFixed(0)} Istanbul
          {toplamKalanDakika !== null ? ' • Tahmini varis: ' + Math.ceil(toplamKalanDakika) + ' dk' : ''}
        </Text>
      </View>

      <View style={styles.haritaKapsayici}>
        <WebView ref={webViewRef} originWhitelist={['*']} source={{ html: haritaHtml }} style={styles.harita} />
      </View>

      <ScrollView style={[styles.govde, { backgroundColor: renkler.govdeArkaplan }]} contentContainerStyle={styles.icerik}>
        {acilDurum && (
          <View style={styles.acilKutu}>
            <Text style={[styles.acilYazi, { fontSize: 15 * boyutCarpani }]}>{acilMesaj}</Text>
          </View>
        )}

        {varisMesaji !== '' && (
          <View style={styles.varisKutu}>
            <Text style={[styles.varisYazi, { fontSize: 16 * boyutCarpani }]}>{varisMesaji}</Text>
            <TouchableOpacity onPress={() => setVarisMesaji('')}>
              <Text style={styles.varisKapatYazi}>Kapat</Text>
            </TouchableOpacity>
          </View>
        )}

        <View
          style={[styles.ozetKart, { backgroundColor: acilDurum ? marka.kirmizi.metinAcikMod : tema.ozetKartArkaplan }]}
          accessible={true}
          accessibilityLabel={
            'Ozet: Baglanti ' + baglantiDurumu +
            '. Hedef: ' + (suankiHedef || 'bekleniyor') +
            (hedefeKalanDakika !== null ? ', tahmini ' + Math.ceil(hedefeKalanDakika) + ' dakika' : '') +
            '. Acil durum: ' + (acilDurum ? 'var' : 'yok')
          }
        >
          <View style={styles.ozetSatir}>
            <View style={[styles.ozetNokta, { backgroundColor: baglantiDurumu === 'Bagli' ? marka.yesil.taban : marka.kirmizi.taban }]} />
            <Text style={styles.ozetKartYaziKucuk}>{baglantiDurumu === 'Bagli' ? 'Bagli' : 'Baglanti Yok'}</Text>
          </View>

          <Text style={styles.ozetKartBuyukYazi}>
            {acilDurum ? '🚨 ACIL DURUM' : (suankiHedef || 'Bekleniyor...')}
          </Text>

          {!acilDurum && hedefeKalanDakika !== null && (
            <Text style={styles.ozetKartAltYazi}>Tahmini {Math.ceil(hedefeKalanDakika)} dakika</Text>
          )}

          {!acilDurum && yolcuSayisi !== null && (
            <Text style={styles.ozetKartAltYazi}>👥 {yolcuSayisi} engelli yolcu gemide</Text>
          )}

          {!acilDurum && havaDurumu && (
            <Text style={styles.ozetKartAltYazi}>🌤️ {havaDurumu.sicaklik}°C, {havaDurumu.aciklama}, ruzgar {havaDurumu.ruzgarHizi} km/s</Text>
          )}
        </View>

        <View style={[styles.kutu, { backgroundColor: renkler.kutuArkaplan }]} accessible={true} accessibilityLabel={'Baglanti durumu: ' + baglantiDurumu}>
          <Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>BAGLANTI DURUMU</Text>
          <View style={styles.satirIci}>
            <View style={[styles.durumNoktasi, { backgroundColor: baglantiDurumu === 'Bagli'
              ? (karanlikMod ? marka.yesil.taban : marka.yesil.metinAcikMod)
              : (karanlikMod ? marka.kirmizi.taban : marka.kirmizi.metinAcikMod) }]} />
            <Text style={[styles.degerYazi, { color: renkler.yazi, fontSize: 16 * boyutCarpani }]}>{baglantiDurumu}</Text>
          </View>
        </View>

        {yolcuSayisi !== null && (
          <View style={[styles.kutu, { backgroundColor: renkler.kutuArkaplan }]}>
            <Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>GEMIDEKI ENGELLI YOLCU SAYISI</Text>
            <Text style={[styles.degerYazi, { color: renkler.yazi, fontSize: 16 * boyutCarpani }]}>{yolcuSayisi} kisi</Text>
          </View>
        )}

        <View style={[styles.kutu, { backgroundColor: renkler.kutuArkaplan }]}>
          <Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>YAKINLIK DURUMU</Text>
          <Text style={[styles.degerYazi, { color: renkler.yazi, fontSize: 16 * boyutCarpani }]}>{yakinlik}</Text>
        </View>

        <View style={[styles.kutu, { backgroundColor: renkler.kutuArkaplan }]}>
          <Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>SIMDIKI HEDEF</Text>
          <Text style={[styles.degerYazi, { color: renkler.yazi, fontSize: 16 * boyutCarpani }]}>
            {suankiHedef || 'Bekleniyor...'}
            {hedefeKalanDakika !== null ? '  (~' + Math.ceil(hedefeKalanDakika) + ' dk)' : ''}
          </Text>

          {sonrakiDuraklar.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>SONRAKI DURAKLAR</Text>
              {sonrakiDuraklar.map((durak, index) => (
                <View key={index} style={styles.durakSatiri}>
                  <View style={styles.durakNumarasi}>
                    <Text style={styles.durakNumarasiYazi}>{index + 1}</Text>
                  </View>
                  <Text style={[styles.durakYazi, { color: renkler.yazi, fontSize: 15 * boyutCarpani }]}>{durak}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {gosterilecekKart && (
          <View style={[styles.bilgiKarti, { backgroundColor: tipRengi(gosterilecekKart.tip).arkaplan, borderColor: tipRengi(gosterilecekKart.tip).kenar }]}>
            <Text style={[styles.kartBaslik, { color: tipRengi(gosterilecekKart.tip).yazi, fontSize: 19 * boyutCarpani }]}>{gosterilecekKart.nokta_adi}</Text>
            <Text style={[styles.kartAciklama, { color: karanlikMod ? '#C7D3DD' : '#333', fontSize: 15 * boyutCarpani }]}>{gosterilecekKart.aciklama}</Text>
            <TouchableOpacity style={[styles.kucukButon, { backgroundColor: tipRengi(gosterilecekKart.tip).butonArkaplan }]} onPress={() => videoAc(gosterilecekKart.video_url)} accessibilityRole="button" accessibilityLabel={gosterilecekKart.nokta_adi + ' icin isaret dili videosunu ac'}>
              <Text style={[styles.kucukButonYazi, { fontSize: 14 * boyutCarpani }]}>Isaret Dili</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.kucukButon, { backgroundColor: tipRengi(gosterilecekKart.tip).butonArkaplan }]} onPress={() => videoAc(gosterilecekKart.sesli_anlatim_url)} accessibilityRole="button" accessibilityLabel={gosterilecekKart.nokta_adi + ' icin sesli anlatimi ac'}>
              <Text style={[styles.kucukButonYazi, { fontSize: 14 * boyutCarpani }]}>Sesli Anlatim</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.kucukButon, { backgroundColor: tipRengi(gosterilecekKart.tip).butonArkaplan }]} onPress={() => videoAc(gosterilecekKart.videolu_anlatim_url)} accessibilityRole="button" accessibilityLabel={gosterilecekKart.nokta_adi + ' icin videolu anlatimi ac'}>
              <Text style={[styles.kucukButonYazi, { fontSize: 14 * boyutCarpani }]}>Videolu Anlatim</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.kutu, { backgroundColor: renkler.kutuArkaplan }]}>
          <Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>BU HAT HAKKINDA</Text>
          <Text style={[styles.degerYazi, { color: renkler.yazi, fontSize: 14 * boyutCarpani, lineHeight: 20 }]}>
            Yalova - Istanbul feribot hatti, Marmara Denizi uzerinden yaklasik 65 km surer.
            Ortalama yolculuk suresi 1 saat 15 dakikadir. Feribotlar bisiklet ve arac tasima
            imkani sunar, tum yolcu katlari engelli erisimine uygundur.
          </Text>
        </View>

        <View style={[styles.kutu, { backgroundColor: renkler.kutuArkaplan, marginTop: 6 }]}>
          <Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>TUM DURAKLAR</Text>

          {tumNoktalar.length === 0 && (
            <Text style={[styles.degerYazi, { color: renkler.yazi, fontSize: 15 * boyutCarpani }]}>Yukleniyor...</Text>
          )}

          {tumNoktalar.map((nokta, index) => (
            <View key={index} style={{ marginTop: 12 }}>
              <View style={styles.durakBaslikSatiri}>
                <TouchableOpacity
                  onPress={() => setAcikDurakIndex(acikDurakIndex === index ? null : index)}
                  accessibilityRole="button"
                  accessibilityLabel={nokta.ad + (acikDurakIndex === index ? ' kapat' : ' detaylarini ac')}
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                >
                  <View style={[styles.tipNoktasi, { backgroundColor: tipRengi(nokta.tip).kenar }]} />
                  <Text style={[styles.durakBaslikYazi, { color: renkler.yazi, fontSize: 16 * boyutCarpani }]}>{nokta.ad}</Text>
                  <Text style={{ color: renkler.etiket, fontSize: 16 * boyutCarpani }}>{acikDurakIndex === index ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => favoriDegistir(nokta.ad)}
                  accessibilityRole="button"
                  accessibilityLabel={favoriler.includes(nokta.ad) ? nokta.ad + ' favorilerden cikar' : nokta.ad + ' favorilere ekle'}
                  style={{ paddingLeft: 12 }}
                >
                  <Text style={{ fontSize: 20 * boyutCarpani }}>{favoriler.includes(nokta.ad) ? '❤️' : '🤍'}</Text>
                </TouchableOpacity>
              </View>

              {acikDurakIndex === index && (
                <View style={{ marginTop: 8, paddingLeft: 4 }}>
                  <Text style={[styles.kartAciklama, { color: karanlikMod ? '#C7D3DD' : '#333', fontSize: 14 * boyutCarpani }]}>{nokta.aciklama}</Text>
                  <TouchableOpacity style={[styles.kucukButon, { backgroundColor: tipRengi(nokta.tip).butonArkaplan }]} onPress={() => videoAc(nokta.video_url)}>
                    <Text style={[styles.kucukButonYazi, { fontSize: 14 * boyutCarpani }]}>Isaret Dili</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.kucukButon, { backgroundColor: tipRengi(nokta.tip).butonArkaplan }]} onPress={() => videoAc(nokta.sesli_anlatim_url)}>
                    <Text style={[styles.kucukButonYazi, { fontSize: 14 * boyutCarpani }]}>Sesli Anlatim</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.kucukButon, { backgroundColor: tipRengi(nokta.tip).butonArkaplan }]} onPress={() => videoAc(nokta.videolu_anlatim_url)}>
                    <Text style={[styles.kucukButonYazi, { fontSize: 14 * boyutCarpani }]}>Videolu Anlatim</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </View>

        {favoriler.length > 0 && (
          <View style={[styles.kutu, { backgroundColor: renkler.kutuArkaplan }]}>
            <Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>FAVORILERIM</Text>
            {favoriler.map((ad, index) => (
              <Text key={index} style={[styles.degerYazi, { color: renkler.yazi, fontSize: 15 * boyutCarpani, marginTop: 4 }]}>❤️ {ad}</Text>
            ))}
          </View>
        )}

        {gecmisBildirimler.length > 0 && (
          <View style={[styles.kutu, { backgroundColor: renkler.kutuArkaplan }]}>
            <Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>GECMIS BILDIRIMLER</Text>
            {gecmisBildirimler.map((b, index) => (
              <View key={index} style={{ marginTop: 8 }}>
                <Text style={[styles.degerYazi, { color: renkler.yazi, fontSize: 14 * boyutCarpani }]}>{b.zaman} - {b.mesaj}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.kutu, { backgroundColor: renkler.kutuArkaplan }]}>
          <Text style={[styles.etiket, { color: renkler.etiket, fontSize: 12 * boyutCarpani }]}>UYGULAMAYI BEGENDINIZ MI?</Text>
          {geriBildirimVerildi ? (
            <Text style={[styles.degerYazi, { color: renkler.yazi, fontSize: 15 * boyutCarpani }]}>Gorusunuz icin tesekkurler!</Text>
          ) : (
            <View>
              <TextInput
                style={[styles.notAlani, { color: renkler.yazi, borderColor: tema.kenarlik }]}
                placeholder="Eklemek istediginiz bir not var mi? (istege bagli)"
                placeholderTextColor={renkler.etiket}
                value={geriBildirimNotu}
                onChangeText={setGeriBildirimNotu}
                multiline={true}
                accessibilityLabel="Geri bildirim notu, istege bagli"
              />
              <View style={{ flexDirection: 'row', marginTop: 10 }}>
                <TouchableOpacity style={styles.geriBildirimButon} onPress={() => geriBildirimGonder(true)}>
                  <Text style={{ fontSize: 28 }}>👍</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.geriBildirimButon} onPress={() => geriBildirimGonder(false)}>
                  <Text style={{ fontSize: 28 }}>👎</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={ayarlarAcik} animationType="slide" transparent={true}>
        <View style={styles.modalArkaplan}>
          <View style={[styles.modalKutu, { backgroundColor: renkler.kutuArkaplan }]}>
            <Text style={[styles.modalBaslik, { color: renkler.yazi }]}>Ayarlar</Text>
            <View style={styles.ayarSatiri}>
              <Text style={[styles.ayarYazi, { color: renkler.yazi }]}>Titresim</Text>
              <Switch value={titresimAcik} onValueChange={setTitresimAcik} />
            </View>
            <Text style={[styles.ayarYazi, { color: renkler.yazi, marginTop: 20 }]}>Yazi Boyutu</Text>
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              {['kucuk', 'orta', 'buyuk'].map((boyut) => (
                <TouchableOpacity key={boyut} onPress={() => setYaziBoyutu(boyut)} style={[styles.boyutButon, { backgroundColor: yaziBoyutu === boyut ? marka.mavi.metinAcikMod : '#E0E0E0' }]}>
                  <Text style={{ color: yaziBoyutu === boyut ? 'white' : '#333', fontWeight: 'bold' }}>
                    {boyut === 'kucuk' ? 'Kucuk' : boyut === 'orta' ? 'Orta' : 'Buyuk'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.kapatButon, { backgroundColor: renkler.etiket, marginTop: 10 }]}
              onPress={() => {
                setAyarlarAcik(false);
                setTanitimIndex(0);
                setTanitimGoster(true);
              }}
            >
              <Text style={styles.kapatButonYazi}>Tanitimi Tekrar Goster</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.kapatButon} onPress={() => setAyarlarAcik(false)}>
              <Text style={styles.kapatButonYazi}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={yardimAcik} animationType="slide" transparent={true}>
        <View style={styles.modalArkaplan}>
          <View style={[styles.modalKutu, { backgroundColor: renkler.kutuArkaplan, maxHeight: '80%' }]}>
            <ScrollView>
              <Text style={[styles.modalBaslik, { color: renkler.yazi }]}>Yardim / SSS</Text>

              <Text style={[styles.sssSoru, { color: renkler.yazi }]}>Uygulama neyi gosterir?</Text>
              <Text style={[styles.sssCevap, { color: renkler.yazi }]}>Geminin canli konumunu, yaklasilan adalari/batiklari ve acil durum uyarilarini gosterir.</Text>

              <Text style={[styles.sssSoru, { color: renkler.yazi }]}>Videolar neden acilmiyor?</Text>
              <Text style={[styles.sssCevap, { color: renkler.yazi }]}>Videolar YouTube uzerinden acilir, internet baglantinizin oldugundan emin olun.</Text>

              <Text style={[styles.sssSoru, { color: renkler.yazi }]}>Acil durumda ne yapmaliyim?</Text>
              <Text style={[styles.sssCevap, { color: renkler.yazi }]}>Ekran kirmiziya donup telefon titredigin de, ekrandaki talimatlari takip edin ve personelin yonergelerini bekleyin.</Text>

              <Text style={[styles.sssSoru, { color: renkler.yazi }]}>Favorilerimi nasil goruntulerim?</Text>
              <Text style={[styles.sssCevap, { color: renkler.yazi }]}>Tum Duraklar listesindeki kalp ikonuna dokunarak favori ekleyebilir, ana sayfada Favorilerim bolumunden goruntuleyebilirsiniz.</Text>

              <TouchableOpacity style={styles.kapatButon} onPress={() => setYardimAcik(false)}>
                <Text style={styles.kapatButonYazi}>Kapat</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={ozetAcik} animationType="fade" transparent={true}>
        <View style={styles.modalArkaplan}>
          <View style={[styles.modalKutu, { backgroundColor: renkler.kutuArkaplan }]}>
            <Text style={[styles.modalBaslik, { color: renkler.yazi }]}>Yolculuk Ozeti</Text>
            <Text style={[styles.ozetSatiri, { color: renkler.yazi }]}>🚢 Istanbul'a hos geldiniz!</Text>
            <Text style={[styles.ozetSatiri, { color: renkler.yazi }]}>📍 {durakSayaci} durak yakinindan gectiniz</Text>
            <Text style={[styles.ozetSatiri, { color: renkler.yazi }]}>🎬 {videoSayaci} video izlediniz</Text>
            <Text style={[styles.ozetSatiri, { color: renkler.yazi }]}>❤️ {favoriler.length} durak favorilediniz</Text>
            <TouchableOpacity style={styles.kapatButon} onPress={() => setOzetAcik(false)}>
              <Text style={styles.kapatButonYazi}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={tanitimYuklendi && tanitimGoster} animationType="fade" transparent={false}>
        <View style={[styles.tanitimEkrani, { backgroundColor: koyuTema.zemin }]}>
          <View style={styles.tanitimIcerik}>
            <Text style={styles.tanitimIkon}>{TANITIM_EKRANLARI[tanitimIndex].ikon}</Text>
            <Text style={styles.tanitimBaslik}>{TANITIM_EKRANLARI[tanitimIndex].baslik}</Text>
            <Text style={styles.tanitimMetin}>{TANITIM_EKRANLARI[tanitimIndex].metin}</Text>
          </View>

          <View style={styles.tanitimNoktalarSatiri}>
            {TANITIM_EKRANLARI.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.tanitimNokta,
                  { backgroundColor: index === tanitimIndex ? marka.mavi.taban : 'rgba(255,255,255,0.3)' },
                ]}
              />
            ))}
          </View>

          <View style={styles.tanitimAltButonlar}>
            <TouchableOpacity onPress={tanitimiKapat}>
              <Text style={styles.tanitimGecYazi}>Gec</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tanitimIleriButon} onPress={tanitimIleri}>
              <Text style={styles.tanitimIleriYazi}>
                {tanitimIndex === TANITIM_EKRANLARI.length - 1 ? 'Basla' : 'Ileri'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  disKapsayici: { flex: 1 },
  ustCubuk: { backgroundColor: koyuTema.zemin, paddingTop: 55, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 3, borderBottomColor: marka.mavi.taban },
  ustCubukAcil: { backgroundColor: marka.kirmizi.metinAcikMod, borderBottomColor: marka.kirmizi.metinAcikMod },
  ustCubukBaslik: { color: '#FFFFFF', fontWeight: 'bold' },
  ustCubukAltBaslik: { color: '#CDE3F0', marginTop: 4 },
  temaButon: { padding: 8 },
  temaButonYazi: { fontSize: 20 },
  ilerlemeDisKutu: { height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, marginTop: 14, overflow: 'hidden' },
  ilerlemeIcKutu: { height: 8, backgroundColor: marka.mavi.taban, borderRadius: 4 },
  ilerlemeYazi: { color: '#CDE3F0', fontSize: 11, marginTop: 6 },
  haritaKapsayici: { height: 260, width: '100%' },
  harita: { height: 260, width: '100%' },
  govde: { flex: 1 },
  icerik: { padding: 20, paddingBottom: 60 },
  acilKutu: { backgroundColor: marka.kirmizi.metinAcikMod, padding: 16, borderRadius: 10, marginBottom: 16 },
  acilYazi: { color: '#FFFFFF', fontWeight: 'bold' },
  varisKutu: { backgroundColor: marka.yesil.metinAcikMod, padding: 16, borderRadius: 10, marginBottom: 16, alignItems: 'center' },
  varisYazi: { color: 'white', fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  varisKapatYazi: { color: '#C8E6C9', fontWeight: 'bold', textDecorationLine: 'underline' },
  ozetKart: { borderRadius: 14, padding: 20, marginBottom: 16 },
  ozetSatir: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  ozetNokta: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  ozetKartYaziKucuk: { color: '#CDE3F0', fontSize: 12, fontWeight: 'bold' },
  ozetKartBuyukYazi: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  ozetKartAltYazi: { color: '#CDE3F0', fontSize: 14, marginTop: 6 },
  kutu: { padding: 16, borderRadius: 10, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: marka.mavi.taban },
  etiket: { fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 6 },
  degerYazi: { fontWeight: '500' },
  satirIci: { flexDirection: 'row', alignItems: 'center' },
  durumNoktasi: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  durakSatiri: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  durakNumarasi: { width: 22, height: 22, borderRadius: 11, backgroundColor: marka.mavi.metinAcikMod, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  durakNumarasiYazi: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  durakYazi: {},
  bilgiKarti: { marginTop: 6, padding: 20, borderRadius: 12, borderWidth: 2 },
  kartBaslik: { fontWeight: 'bold', marginBottom: 10 },
  kartAciklama: { marginBottom: 16, lineHeight: 21 },
  kucukButon: { padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  kucukButonYazi: { color: 'white', fontWeight: 'bold' },
  durakBaslikSatiri: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tipNoktasi: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  durakBaslikYazi: { fontWeight: 'bold', flex: 1 },
  geriBildirimButon: { padding: 10, marginRight: 16 },
  notAlani: { borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 10, minHeight: 60, textAlignVertical: 'top' },
  modalArkaplan: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalKutu: { padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalBaslik: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  ayarSatiri: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ayarYazi: { fontSize: 16, fontWeight: '500' },
  boyutButon: { padding: 12, borderRadius: 8, marginRight: 10 },
  kapatButon: { backgroundColor: marka.mavi.metinAcikMod, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 24 },
  kapatButonYazi: { color: 'white', fontWeight: 'bold' },
  sssSoru: { fontWeight: 'bold', fontSize: 15, marginTop: 16 },
  sssCevap: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  ozetSatiri: { fontSize: 16, marginTop: 12 },
  tanitimEkrani: { flex: 1, justifyContent: 'space-between', paddingTop: 100, paddingBottom: 50, paddingHorizontal: 30 },
  tanitimIcerik: { alignItems: 'center' },
  tanitimIkon: { fontSize: 80, marginBottom: 30 },
  tanitimBaslik: { color: 'white', fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  tanitimMetin: { color: '#CDE3F0', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  tanitimNoktalarSatiri: { flexDirection: 'row', justifyContent: 'center' },
  tanitimNokta: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4 },
  tanitimAltButonlar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tanitimGecYazi: { color: '#CDE3F0', fontSize: 16 },
  tanitimIleriButon: { backgroundColor: marka.mavi.metinAcikMod, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 10 },
  tanitimIleriYazi: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});