import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert } from 'react-native';
import { io } from 'socket.io-client';

const SUNUCU_ADRESI = 'http://192.168.1.115:3000';

export default function App() {
  const [baglantiDurumu, setBaglantiDurumu] = useState('Baglaniyor...');
  const [acilDurumAktif, setAcilDurumAktif] = useState(false);
  const [yolcuSayisi, setYolcuSayisi] = useState(0);
  const soketRef = useRef(null);

  useEffect(() => {
    const soket = io(SUNUCU_ADRESI);
    soketRef.current = soket;

    soket.on('connect', () => {
      setBaglantiDurumu('Bagli');
    });

    soket.on('disconnect', () => {
      setBaglantiDurumu('Baglanti kesildi');
    });

    return () => {
      soket.disconnect();
    };
  }, []);

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
            soketRef.current.emit('acil-durum-baslat', { gemi_adi: 'Yalova Feribotu 1' });
            setAcilDurumAktif(true);
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
            soketRef.current.emit('acil-durum-bitir', { gemi_adi: 'Yalova Feribotu 1' });
            setAcilDurumAktif(false);
          },
        },
      ]
    );
  }

  function yolcuSayisiDegistir(fark) {
    const yeniSayi = Math.max(0, yolcuSayisi + fark);
    setYolcuSayisi(yeniSayi);
    if (soketRef.current) {
      soketRef.current.emit('yolcu-sayisi-guncelle', { sayi: yeniSayi, gemi_adi: 'Yalova Feribotu 1' });
    }
  }

  return (
    <View style={styles.disKapsayici}>
      <StatusBar barStyle="light-content" backgroundColor="#0D3B66" />

      <View style={styles.ustCubuk}>
        <Text style={styles.ustCubukBaslik}>Personel Paneli</Text>
        <Text style={styles.ustCubukAltBaslik}>IDO Engelsiz Navigasyon</Text>
      </View>

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
      </View>
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
});