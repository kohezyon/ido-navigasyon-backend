# Faz 3 — Gerçek GPS Entegrasyonu — Tasarım

**Durum:** Onay bekliyor (brainstorming çıktısı, henüz uygulama planına dönüştürülmedi)

## Amaç ve Kapsam

Faz 2'de sunucu artık sefer-bazlı çoklu gemi/hat destekliyor, ama her aktif seferin konumu hâlâ `sahteGpsGuncelle` ile matematiksel olarak simüle ediliyor (`ADIM_BUYUKLUGU` kadar sabit adımlarla hedefe yaklaşma). Gerçek bir gemi gerçek bir yerde değil.

Bu faz, simülasyonu kaptan/personel telefonunun gerçek GPS'inden gelen konumla değiştirir (roadmap'in "Seçenek A — düşük maliyet" yolu). Geminin kendi AIS/GPS donanımından veri çekme ("Seçenek B") kapsam dışıdır.

**Kapsam içi:**
- Personel app: sefer paneli açıkken, sadece **ön planda** (foreground), 5 saniyede bir cihaz konumunu okuyup sunucuya gönderme.
- Sunucu: yeni bir sefer-scoped socket event'iyle gelen gerçek konumu işleme — mevcut ilerleme/ETA/geofence hesaplamalarını ve oda-bazlı yayını (Faz 2'den) olduğu gibi bu gerçek konum üzerinde çalıştırma.
- `sahteGpsGuncelle` simülasyonunun ve saniyede-bir çalışan `setInterval` tick döngüsünün tamamen kaldırılması.

**Kapsam dışı (sonraki, ayrı bir adıma bırakılıyor):**
- Anomali kontrolü (aşırı hız/konum sıçraması gösteren güncellemelerin reddi).
- "Sinyal kesildi" / bayat konum göstergesi (kaptan telefonundan bir süredir konum gelmiyorsa).
- Arka plan (background) konum takibi — kaptan uygulamayı önde tutmalı; bu, iOS'ta ayrı bir "Always" izni ve App Store gerekçelendirmesi gerektirdiği için bilinçli olarak ertelendi.
- Yolcu app'te harita/UX cilası (Faz 6).

## Sunucu Mimarisi

**Kaldırılanlar:** `sahteGpsGuncelle`, `ADIM_BUYUKLUGU`/`HIZ_METRE_SANIYE` sabitleri, `setInterval(konumKontrolVeYayinla, 1000)` kurulumu (`server.js`'in üst kısmında, `sunucu.listen`'e yakın).

**Yeni akış — event-driven (zamanlayıcı yok):**

```js
soket.on('konum-guncelle', (bilgi, geriBildir) => {
    // 1. auth: soket.data.kullanici var mı, rol kaptan/admin mi (acil-durum-baslat ile ayni desen)
    // 2. sefer secili mi: aktifSeferler.get(soket.data.aktifSeferId)
    // 3. payload gecerli mi: konumGecerliMi(bilgi?.enlem, bilgi?.boylam) (validation.js'e yeni fonksiyon)
    // 4. sefer.konum = { enlem: bilgi.enlem, boylam: bilgi.boylam }
    // 5. hedefe metre-bazli yakinlik kontrolu -> hedefIndex ilerlet / varis tespiti
    //    (VARIS_ESIGI_METRE = 50 sabiti; ikiNoktaArasiMesafe ile, ADIM_BUYUKLUGU'nun
    //    derece-bazli esdegerinin metre karsiligi)
    // 6. konumKontrolVeYayinla'nin geofence/ilerleme/ETA/yayin gövdesini bu sefer icin calistir
    //    (fonksiyon aktifSeferler'in tamami yerine tek bir sefer parametresi alacak sekilde
    //    yeniden sekillendirilir; Map uzerinde dongu artik yok)
});
```

`konumKontrolVeYayinla`'nın bugünkü gövdesi (geofence sorgusu, `ilerleme_yuzdesi`/`toplam_kalan_dakika`/`hedefe_kalan_dakika` hesaplama, `gemi-konum-guncelleme` yayını) aynen kalır — sadece "tüm aktif seferler üzerinde dön" dış döngüsü kalkar, tek bir `sefer`/`seferId` parametresi alan bir fonksiyona indirgenir ve `konum-guncelle` handler'ından çağrılır.

**Hedef ilerletme mantığı değişikliği:** Bugün `sahteGpsGuncelle`, `kalanMesafeDerece > ADIM_BUYUKLUGU` karşılaştırmasını enlem/boylam derece farkı üzerinden yapıyor (çünkü simülasyon sabit derece adımlarıyla ilerliyordu). Gerçek GPS ile bu artık anlamsız — yerine `ikiNoktaArasiMesafe(sefer.konum, hedefNokta) < VARIS_ESIGI_METRE` (`VARIS_ESIGI_METRE = 50`, metre cinsinden, Haversine) kullanılır. Varış tespiti (rotanın son noktasına ulaşma) aynı mantıkla, sadece metre eşiğiyle çalışır.

**Yeni doğrulama (`validation.js`):**
```js
function konumGecerliMi(enlem, boylam) {
    return typeof enlem === 'number' && enlem >= -90 && enlem <= 90
        && typeof boylam === 'number' && boylam >= -180 && boylam <= 180;
}
```

**Hata yönetimi:** Geçersiz payload veya yetkisiz/sefer-seçilmemiş durumlarda `{tamam:false, hata:'...'}` ack — `yolcu-sayisi-guncelle` ile aynı desen. Sunucu tarafında ek bir hata durumu yok; konum kabul edilip edilmediği sadece ack ile bildirilir, ayrı bir uyarı yayını yapılmaz.

## Personel App Değişiklikleri

`expo-location` paketi eklenir (şu an bağımlılıklarda yok). Sefer paneli (`ekran === 'panel'`) açıkken ve rol `kaptan`/`admin` ise:
1. Foreground konum izni istenir (`Location.requestForegroundPermissionsAsync`).
2. İzin verilirse `Location.watchPositionAsync({ accuracy: Balanced, timeInterval: 5000 }, callback)` başlatılır; her callback'te `soketRef.current.emit('konum-guncelle', { enlem, boylam })`.
3. Panelden çıkılınca (sefer bitirilince veya çıkış yapılınca) `watchPositionAsync`'in döndürdüğü subscription `remove()` ile durdurulur.
4. İzin reddedilirse: panel yine açılır (acil durum/yolcu sayısı butonları konum olmadan da çalışmalı), ekranda "Konum izni verilmedi — gemi konumu paylaşılamıyor" gibi görünür bir uyarı gösterilir. Uygulama çökmemeli, akış kesilmemeli.

Yolcu app'te değişiklik yok (konum tüketimi zaten `gemi-konum-guncelleme` event'i üzerinden, Faz 2'de kuruldu).

## Test Planı

**Backend (tam TDD):**
- `konumGecerliMi` için birim testleri (`validation.test.js`) — sınır değerler (enlem ±90, boylam ±180, tip hataları).
- `konum-guncelle` socket handler'ı için: auth/rol/sefer-seçili kontrolü (mevcut `acil-durum-baslat` testleriyle aynı desen), geçersiz payload reddi, başarılı güncellemenin `sefer.konum`'u değiştirdiği ve doğru odaya `gemi-konum-guncelleme` yayınladığı.
- Hedef ilerletme/varış tespiti için birim testi: metre-eşiği sınırında (`VARIS_ESIGI_METRE`'nin altında/üstünde) doğru davranış.
- `konumKontrolVeYayinla`'nın tek-sefer-parametreli hale gelmesi sonrası, mevcut geofence/ilerleme/ETA testlerinin (Faz 2'den kalan) yeni imzaya uyacak şekilde güncellenmesi.

**Personel app:** Otomatik test altyapısı yok (proje kararı, Faz 1'den beri) — manuel doğrulama: gerçek cihazda izin akışı, izin reddi durumunda panelin çökmemesi, konum gönderiminin sunucu loglarında görünmesi.

## Açık Sorular / Sonraki Adım

Yok — tasarım onaylandıktan sonra `superpowers:writing-plans` ile adım adım (test-driven, dosya bazlı) bir uygulama planına dönüştürülecek.
