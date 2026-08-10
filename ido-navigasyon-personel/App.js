import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, TextInput, ScrollView } from 'react-native';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';

const SUNUCU_ADRESI = process.env.EXPO_PUBLIC_SUNUCU_ADRESI || 'https://ido-navigasyon-backend.onrender.com';
const ERISIM_TOKEN_DEPO_ADI = 'personel_erisim_tokeni';
const YENILEME_TOKEN_DEPO_ADI = 'personel_yenileme_tokeni';

export default function App() {
  const [tokenYukleniyor, setTokenYukleniyor] = useState(true);
  const [erisimTokeni, setErisimTokeni] = useState(null);
  const [yenilemeTokeni, setYenilemeTokeni] = useState(null);
  const [kullaniciAdiGirisi, setKullaniciAdiGirisi] = useState('');
  const [sifreGirisi, setSifreGirisi] = useState('');
  const [girisYapiliyor, setGirisYapiliyor] = useState(false);
  const [girisHatasi, setGirisHatasi] = useState(null);
  const [baglantiDurumu, setBaglantiDurumu] = useState('Baglaniyor...');
  const [acilDurumAktif, setAcilDurumAktif] = useState(false);
  const [yolcuSayisi, setYolcuSayisi] = useState(0);

  const [ekran, setEkran] = useState('yukleniyor'); // yukleniyor | sefer-sec | sefer-baslat | panel
  const [aktifSeferler, setAktifSeferler] = useState([]);
  const [gemiler, setGemiler] = useState([]);
  const [hatlar, setHatlar] = useState([]);
  const [seciliSeferId, setSeciliSeferId] = useState(null);
  const [seciliGemiId, setSeciliGemiId] = useState(null);
  const [seciliHatId, setSeciliHatId] = useState(null);
  const [seferIslemiSuruyor, setSeferIslemiSuruyor] = useState(false);
  const [seferHatasi, setSeferHatasi] = useState(null);

  const soketRef = useRef(null);
  const konumAboneligiRef = useRef(null);
  const [konumIzniHatasi, setKonumIzniHatasi] = useState(null);
  const yenilemeTokeniRef = useRef(null);

  useEffect(() => {
    yenilemeTokeniRef.current = yenilemeTokeni;
  }, [yenilemeTokeni]);

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync(ERISIM_TOKEN_DEPO_ADI),
      SecureStore.getItemAsync(YENILEME_TOKEN_DEPO_ADI),
    ])
      .then(([kayitliErisim, kayitliYenileme]) => {
        setErisimTokeni(kayitliErisim);
        setYenilemeTokeni(kayitliYenileme);
      })
      .catch(() => {
        setErisimTokeni(null);
        setYenilemeTokeni(null);
      })
      .finally(() => {
        setTokenYukleniyor(false);
      });
  }, []);

  async function oturumuKapat() {
    await SecureStore.deleteItemAsync(ERISIM_TOKEN_DEPO_ADI);
    await SecureStore.deleteItemAsync(YENILEME_TOKEN_DEPO_ADI);
    setErisimTokeni(null);
    setYenilemeTokeni(null);
    setSeciliSeferId(null);
    // 'yukleniyor' render kontrolde '!erisimTokeni' kontrolunden ONCE geldigi icin,
    // ekran burada 'yukleniyor' birakilirsa giris ekrani hic gosterilmez (kalici kilitlenme).
    setEkran('sefer-sec');
  }

  async function erisimTokeniniYenile() {
    if (!yenilemeTokeniRef.current) return null;
    try {
      const yanit = await fetch(SUNUCU_ADRESI + '/token/yenile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yenilemeTokeni: yenilemeTokeniRef.current }),
      });
      if (!yanit.ok) return null;
      const veri = await yanit.json();
      await SecureStore.setItemAsync(ERISIM_TOKEN_DEPO_ADI, veri.erisimTokeni);
      setErisimTokeni(veri.erisimTokeni);
      return veri.erisimTokeni;
    } catch {
      return null;
    }
  }

  function aktifSeferListesiniYenile() {
    return Promise.all([
      fetch(SUNUCU_ADRESI + '/seferler/aktif').then((r) => r.json()),
      fetch(SUNUCU_ADRESI + '/gemiler').then((r) => r.json()),
      fetch(SUNUCU_ADRESI + '/hatlar').then((r) => r.json()),
    ])
      .then(([seferler, gemiListesi, hatListesi]) => {
        setAktifSeferler(seferler);
        setGemiler(gemiListesi);
        setHatlar(hatListesi);
      })
      .catch(() => {
        // Ilk yuklemede state zaten bos, bu yuzden burada sifirlamaya gerek yok.
        // Bu fonksiyon artik "sefer-sec" basarisizligi ve "sefer-bitti" durumlarinda
        // da cagriliyor; gecici bir ag hatasinda o ana kadar dolu olan listeyi silmek
        // yerine sessizce basarisiz olup mevcut listeyi ekranda birakiyoruz.
      });
  }

  useEffect(() => {
    if (!erisimTokeni) return;

    setEkran('yukleniyor');
    aktifSeferListesiniYenile().then(() => setEkran('sefer-sec'));
  }, [erisimTokeni]);

  useEffect(() => {
    if (!erisimTokeni || !seciliSeferId) return;

    const soket = io(SUNUCU_ADRESI, { auth: { token: erisimTokeni } });
    soketRef.current = soket;

    soket.on('connect', () => {
      setBaglantiDurumu('Bagli');
      soket.emit('sefer-sec', { sefer_id: seciliSeferId }, (yanit) => {
        if (!yanit || !yanit.tamam) {
          Alert.alert('Hata', 'Sefer secilemedi. Lutfen tekrar deneyin.');
          setSeciliSeferId(null);
          setEkran('sefer-sec');
          aktifSeferListesiniYenile();
          return;
        }
        setAcilDurumAktif(!!yanit.acil_durum_aktif);
        setYolcuSayisi(yanit.yolcu_sayisi || 0);
      });
    });

    soket.on('disconnect', () => {
      setBaglantiDurumu('Baglanti kesildi');
    });

    soket.on('connect_error', async (hata) => {
      setBaglantiDurumu('Baglanti kesildi');
      if (hata && hata.message === 'Yetkisiz') {
        const yeniToken = await erisimTokeniniYenile();
        if (!yeniToken) {
          await oturumuKapat();
        }
      }
    });

    soket.on('sefer-bitti', () => {
      Alert.alert('Sefer Sona Erdi', 'Bu sefer baska bir kullanici tarafindan bitirildi.');
      setSeciliSeferId(null);
      setEkran('sefer-sec');
      aktifSeferListesiniYenile();
    });

    let konumIzlemeIptalEdildi = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (konumIzlemeIptalEdildi) return;
        if (status !== 'granted') {
          setKonumIzniHatasi('Konum izni verilmedi - gemi konumu paylasilamiyor.');
          return;
        }
        setKonumIzniHatasi(null);
        // timeInterval sadece Android'de gecerli; iOS distanceInterval kullanir ve
        // varsayilani (Balanced dogrulukta ~100m) hareketsiz/agir manevra yapan bir
        // gemide hic guncelleme gelmemesine yol acar. distanceInterval: 0 ile mesafe
        // filtresini kaldiriyoruz; buna karsilik iOS cok sik tetikledigi icin sunucuya
        // gonderimi asagidaki 5sn'lik istemci tarafi kisitla dengeliyoruz.
        // sonEmitZamani, useRef degil: yeniden render'a gerek yok, sadece bu
        // watchPositionAsync aboneliginin omru boyunca closure'da yasamasi yeterli.
        const sonEmitZamani = { current: 0 };
        const abonelik = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 0 },
          (konum) => {
            const simdi = Date.now();
            if (simdi - sonEmitZamani.current < 5000) return;
            sonEmitZamani.current = simdi;
            if (soketRef.current) {
              soketRef.current.emit('konum-guncelle', {
                enlem: konum.coords.latitude,
                boylam: konum.coords.longitude,
                hiz: konum.coords.speed,
              });
            }
          }
        );
        if (konumIzlemeIptalEdildi) {
          abonelik.remove();
          return;
        }
        konumAboneligiRef.current = abonelik;
      } catch {
        if (!konumIzlemeIptalEdildi) {
          setKonumIzniHatasi('Konum alinamadi - gemi konumu paylasilamiyor.');
        }
      }
    })();

    return () => {
      konumIzlemeIptalEdildi = true;
      soket.disconnect();
      if (konumAboneligiRef.current) {
        konumAboneligiRef.current.remove();
        konumAboneligiRef.current = null;
      }
      // Baska bir sefere gecildiginde onceki seferin "Konum izni verilmedi"
      // uyarisi, yeni seferin izin kontrolu surerken ekranda asili kalmasin.
      setKonumIzniHatasi(null);
    };
  }, [erisimTokeni, seciliSeferId]);

  async function girisYap() {
    const kullaniciAdi = kullaniciAdiGirisi.trim();
    const sifre = sifreGirisi;
    if (!kullaniciAdi || !sifre) {
      setGirisHatasi('Kullanici adi ve sifre zorunlu.');
      return;
    }

    setGirisYapiliyor(true);
    setGirisHatasi(null);
    try {
      const yanit = await fetch(SUNUCU_ADRESI + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kullanici_adi: kullaniciAdi, sifre }),
      });
      const veri = await yanit.json();
      if (!yanit.ok) {
        setGirisHatasi(veri.hata || 'Giris basarisiz.');
        return;
      }
      await SecureStore.setItemAsync(ERISIM_TOKEN_DEPO_ADI, veri.erisimTokeni);
      await SecureStore.setItemAsync(YENILEME_TOKEN_DEPO_ADI, veri.yenilemeTokeni);
      setErisimTokeni(veri.erisimTokeni);
      setYenilemeTokeni(veri.yenilemeTokeni);
      setSifreGirisi('');
    } catch {
      setGirisHatasi('Sunucuya ulasilamadi.');
    } finally {
      setGirisYapiliyor(false);
    }
  }

  async function seferBaslat() {
    if (!seciliGemiId || !seciliHatId) {
      setSeferHatasi('Gemi ve hat secmelisiniz.');
      return;
    }
    setSeferIslemiSuruyor(true);
    setSeferHatasi(null);
    try {
      const yanit = await fetch(SUNUCU_ADRESI + '/sefer/baslat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + erisimTokeni },
        body: JSON.stringify({ gemi_id: seciliGemiId, hat_id: seciliHatId }),
      });
      const veri = await yanit.json();
      if (!yanit.ok) {
        setSeferHatasi(veri.hata || 'Sefer baslatilamadi.');
        return;
      }
      setSeciliSeferId(veri.sefer_id);
      setEkran('panel');
    } catch {
      setSeferHatasi('Sunucuya ulasilamadi.');
    } finally {
      setSeferIslemiSuruyor(false);
    }
  }

  function seferSec(seferId) {
    setSeciliSeferId(seferId);
    setEkran('panel');
  }

  function seferiBitir() {
    Alert.alert('Seferi Bitir', 'Bu seferi bitirmek istediginizden emin misiniz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Evet, Bitir',
        onPress: async () => {
          try {
            const yanit = await fetch(SUNUCU_ADRESI + '/sefer/bitir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + erisimTokeni },
              body: JSON.stringify({ sefer_id: seciliSeferId }),
            });
            if (!yanit.ok) {
              const veri = await yanit.json();
              Alert.alert('Hata', veri.hata || 'Sefer bitirilemedi.');
              return;
            }
            setSeciliSeferId(null);
            setEkran('sefer-sec');
            aktifSeferListesiniYenile();
          } catch {
            Alert.alert('Hata', 'Sunucuya ulasilamadi.');
          }
        },
      },
    ]);
  }

  function acilDurumBaslat() {
    Alert.alert(
      'Acil Durum Baslat',
      'ACIL DURUM baslatmak istediginizden emin misiniz?',
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Evet, Baslat',
          style: 'destructive',
          onPress: () => {
            if (!soketRef.current) return;
            soketRef.current.emit('acil-durum-baslat', {}, (yanit) => {
              if (yanit && yanit.tamam) {
                setAcilDurumAktif(true);
              } else {
                Alert.alert('Hata', (yanit && yanit.hata) || 'Acil durum baslatilamadi.');
              }
            });
          },
        },
      ]
    );
  }

  function acilDurumBitir() {
    Alert.alert(
      'Acil Durumu Bitir',
      'Acil durumu bitirmek istediginizden emin misiniz?',
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Evet, Bitir',
          onPress: () => {
            if (!soketRef.current) return;
            soketRef.current.emit('acil-durum-bitir', {}, (yanit) => {
              if (yanit && yanit.tamam) {
                setAcilDurumAktif(false);
              } else {
                Alert.alert('Hata', (yanit && yanit.hata) || 'Acil durum bitirilemedi.');
              }
            });
          },
        },
      ]
    );
  }

  function yolcuSayisiDegistir(fark) {
    const oncekiSayi = yolcuSayisi;
    const yeniSayi = Math.max(0, yolcuSayisi + fark);
    setYolcuSayisi(yeniSayi);
    if (soketRef.current) {
      soketRef.current.emit('yolcu-sayisi-guncelle', { sayi: yeniSayi }, (yanit) => {
        if (!yanit || !yanit.tamam) {
          setYolcuSayisi(oncekiSayi);
          Alert.alert('Hata', (yanit && yanit.hata) || 'Yolcu sayisi guncellenemedi.');
        }
      });
    }
  }

  let icerik;

  if (tokenYukleniyor || (erisimTokeni && ekran === 'yukleniyor')) {
    icerik = (
      <View style={styles.govde}>
        <Text style={styles.etiket}>Yukleniyor...</Text>
      </View>
    );
  } else if (!erisimTokeni) {
    icerik = (
      <View style={styles.govde}>
        <View style={styles.durumKutusu}>
          <Text style={styles.etiket}>KULLANICI ADI</Text>
          <TextInput
            style={styles.anahtarGirisAlani}
            value={kullaniciAdiGirisi}
            onChangeText={setKullaniciAdiGirisi}
            placeholder="Kullanici adinizi girin"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.durumKutusu}>
          <Text style={styles.etiket}>SIFRE</Text>
          <TextInput
            style={styles.anahtarGirisAlani}
            value={sifreGirisi}
            onChangeText={setSifreGirisi}
            placeholder="Sifrenizi girin"
            secureTextEntry
            autoCapitalize="none"
          />
        </View>
        {girisHatasi ? <Text style={styles.hataYazisi}>{girisHatasi}</Text> : null}
        <TouchableOpacity
          style={[styles.buyukButon, styles.bitirButon, girisYapiliyor && styles.pasifButon]}
          onPress={girisYap}
          disabled={girisYapiliyor}
        >
          <Text style={styles.buyukButonYazi}>{girisYapiliyor ? 'GIRIS YAPILIYOR...' : 'GIRIS YAP'}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (ekran === 'sefer-sec') {
    icerik = (
      <ScrollView style={styles.govde}>
        <Text style={styles.etiket}>AKTIF SEFERLER</Text>
        {aktifSeferler.length === 0 ? (
          <Text style={styles.degerYazi}>Su an aktif bir sefer yok.</Text>
        ) : (
          aktifSeferler.map((sefer) => (
            <TouchableOpacity key={sefer.sefer_id} style={styles.durumKutusu} onPress={() => seferSec(sefer.sefer_id)}>
              <Text style={styles.degerYazi}>{sefer.gemi_adi}</Text>
              <Text style={styles.etiket}>{sefer.hat_adi}</Text>
            </TouchableOpacity>
          ))
        )}
        <TouchableOpacity style={[styles.buyukButon, styles.baslatButon]} onPress={() => setEkran('sefer-baslat')}>
          <Text style={styles.buyukButonYazi}>YENI SEFER BASLAT</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.anahtarDegistirButon} onPress={oturumuKapat}>
          <Text style={styles.anahtarDegistirYazi}>Cikis Yap</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  } else if (ekran === 'sefer-baslat') {
    icerik = (
      <ScrollView style={styles.govde}>
        <Text style={styles.etiket}>GEMI SECIN</Text>
        {gemiler.map((gemi) => (
          <TouchableOpacity
            key={gemi.id}
            style={[styles.durumKutusu, seciliGemiId === gemi.id && styles.seciliKutu]}
            onPress={() => setSeciliGemiId(gemi.id)}
          >
            <Text style={styles.degerYazi}>{gemi.ad}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.etiket}>HAT SECIN</Text>
        {hatlar.map((hat) => (
          <TouchableOpacity
            key={hat.id}
            style={[styles.durumKutusu, seciliHatId === hat.id && styles.seciliKutu]}
            onPress={() => setSeciliHatId(hat.id)}
          >
            <Text style={styles.degerYazi}>{hat.ad}</Text>
          </TouchableOpacity>
        ))}
        {seferHatasi ? <Text style={styles.hataYazisi}>{seferHatasi}</Text> : null}
        <TouchableOpacity
          style={[styles.buyukButon, styles.baslatButon, seferIslemiSuruyor && styles.pasifButon]}
          onPress={seferBaslat}
          disabled={seferIslemiSuruyor}
        >
          <Text style={styles.buyukButonYazi}>{seferIslemiSuruyor ? 'BASLATILIYOR...' : 'SEFERI BASLAT'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.anahtarDegistirButon} onPress={() => setEkran('sefer-sec')}>
          <Text style={styles.anahtarDegistirYazi}>Geri</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  } else {
    icerik = (
      <View style={styles.govde}>
        <View style={styles.durumKutusu}>
          <Text style={styles.etiket}>BAGLANTI DURUMU</Text>
          <View style={styles.satirIci}>
            <View
              style={[
                styles.durumNoktasi,
                { backgroundColor: baglantiDurumu === 'Bagli' ? '#2E7D32' : '#C62828' },
              ]}
            />
            <Text style={styles.degerYazi}>{baglantiDurumu}</Text>
          </View>
        </View>

        {konumIzniHatasi ? (
          <View style={styles.durumKutusu}>
            <Text style={styles.hataYazisi}>{konumIzniHatasi}</Text>
          </View>
        ) : null}

        <View style={styles.durumKutusu}>
          <Text style={styles.etiket}>ACIL DURUM STATUSU</Text>
          <Text
            style={[
              styles.acilDurumYazisi,
              { color: acilDurumAktif ? '#C62828' : '#2E7D32' },
            ]}
          >
            {acilDurumAktif ? 'AKTIF ACIL DURUM VAR' : 'NORMAL'}
          </Text>
        </View>

        <View style={styles.durumKutusu}>
          <Text style={styles.etiket}>ENGELLI YOLCU SAYISI</Text>
          <View style={styles.sayacSatiri}>
            <TouchableOpacity style={styles.sayacButon} onPress={() => yolcuSayisiDegistir(-1)}>
              <Text style={styles.sayacButonYazi}>-</Text>
            </TouchableOpacity>
            <Text style={styles.sayacDeger}>{yolcuSayisi}</Text>
            <TouchableOpacity style={styles.sayacButon} onPress={() => yolcuSayisiDegistir(1)}>
              <Text style={styles.sayacButonYazi}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.buyukButon, styles.baslatButon, acilDurumAktif && styles.pasifButon]}
          onPress={acilDurumBaslat}
          disabled={acilDurumAktif}
        >
          <Text style={styles.buyukButonYazi}>ACIL DURUM BASLAT</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.buyukButon, styles.bitirButon, !acilDurumAktif && styles.pasifButon]}
          onPress={acilDurumBitir}
          disabled={!acilDurumAktif}
        >
          <Text style={styles.buyukButonYazi}>ACIL DURUMU BITIR</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.buyukButon, styles.bitirButon]} onPress={seferiBitir}>
          <Text style={styles.buyukButonYazi}>SEFERI BITIR</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.anahtarDegistirButon} onPress={oturumuKapat}>
          <Text style={styles.anahtarDegistirYazi}>Cikis Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.disKapsayici}>
      <StatusBar barStyle="light-content" backgroundColor="#0D3B66" />
      {ekran === 'panel' && erisimTokeni ? (
        <View style={styles.ustCubuk}>
          <Text style={styles.ustCubukBaslik}>Personel Paneli</Text>
          <Text style={styles.ustCubukAltBaslik}>IDO Engelsiz Navigasyon</Text>
        </View>
      ) : null}
      {icerik}
    </View>
  );
}

const styles = StyleSheet.create({
  disKapsayici: { flex: 1, backgroundColor: '#0D3B66' },
  ustCubuk: {
    backgroundColor: '#0D3B66',
    paddingTop: 55,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 3,
    borderBottomColor: '#1E6091',
  },
  ustCubukBaslik: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold' },
  ustCubukAltBaslik: { color: '#CDE3F0', fontSize: 13, marginTop: 4 },
  govde: { flex: 1, backgroundColor: '#F4F8FB', padding: 20 },
  durumKutusu: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 10,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#1E6091',
  },
  seciliKutu: { borderLeftColor: '#2E7D32', borderLeftWidth: 6 },
  anahtarGirisAlani: {
    borderWidth: 1,
    borderColor: '#5B7A8F',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#0D3B66',
  },
  hataYazisi: { color: '#C62828', marginBottom: 12, fontSize: 13 },
  etiket: { fontSize: 12, fontWeight: 'bold', color: '#5B7A8F', letterSpacing: 0.5, marginBottom: 6 },
  degerYazi: { fontSize: 16, color: '#0D3B66', fontWeight: '500' },
  satirIci: { flexDirection: 'row', alignItems: 'center' },
  durumNoktasi: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  acilDurumYazisi: { fontSize: 17, fontWeight: 'bold' },
  sayacSatiri: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  sayacButon: { backgroundColor: '#0D3B66', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sayacButonYazi: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  sayacDeger: { fontSize: 28, fontWeight: 'bold', color: '#0D3B66', marginHorizontal: 30 },
  buyukButon: {
    padding: 22,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  baslatButon: { backgroundColor: '#B71C1C' },
  bitirButon: { backgroundColor: '#2E7D32' },
  pasifButon: { backgroundColor: '#B0BEC5' },
  buyukButonYazi: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  anahtarDegistirButon: { marginTop: 20, alignItems: 'center', padding: 8 },
  anahtarDegistirYazi: { color: '#5B7A8F', fontSize: 13, textDecorationLine: 'underline' },
});
