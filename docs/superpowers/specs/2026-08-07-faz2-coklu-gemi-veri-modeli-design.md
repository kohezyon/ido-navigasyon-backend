# Faz 2 — Çoklu Gemi/Hat Veri Modeli — Tasarım

**Durum:** Onay bekliyor (brainstorming çıktısı, henüz uygulama planına dönüştürülmedi)

## Amaç ve Kapsam

Bugün sunucu tek bir gemiyi, tek bir hattı (rota) ve tek bir "sefer"i varsayıyor: `gemiKonumu`, `rotaNoktalari`, `rotaAdlari`, `suankiHedefIndex` gibi global değişkenler kod içinde hardcoded. Bu, gerçek bir filoyu (birden fazla feribot, birden fazla hat, aynı anda birden fazla aktif yolculuk) desteklemez.

Bu faz, sunucuyu ve veri modelini **küçük ölçekli bir pilot** (2-5 gemi/hat) için çoklu gemi/hat/sefer destekleyecek şekilde yeniden kurar. Yatay ölçeklenebilirlik (Redis adapter, çoklu sunucu instance) ve sunucu-restart'ında state kaybolmaması kasıtlı olarak kapsam dışıdır — roadmap bunları ayrıca **Faz 4**'e atamış durumda; bu fazda o problemleri çözmeye çalışmak kapsam taşması olur.

**Kapsam içi:**
- DB şeması: `gemiler`, `hatlar`, `rota_noktalari`, `seferler`; `ilgi_noktalari`'na hat ilişkisi.
- Sunucu state'inin global değişkenlerden sefer-bazlı bellek-içi (`Map`) state'e taşınması; her aktif sefer bağımsız simüle edilir.
- Sefer başlatma/bitirme REST uçları (kaptan/admin yetkili).
- Socket.io odaları: yayınlar artık sadece ilgili seferin odasına gider.
- Yolcu ve personel app'lerine, hangi seferi takip edecekleri/yönetecekleri için minimal bir seçim ekranı.
- Mevcut hardcoded rota ve `ilgi_noktalari` verisinin yeni tablolara elle taşınması.

**Kapsam dışı (sonraki fazlara bırakılıyor):**
- Sunucu restart'ında canlı konumun kaybolmaması (Faz 4).
- Çoklu sunucu instance / Redis adapter (Faz 4).
- Gerçek GPS entegrasyonu (Faz 3 — bu faz sahte GPS simülasyonunu sefer-bazlı hale getirir ama hâlâ matematiksel simülasyondur).
- App'lerde tam seçim/harita UX'i, offline davranış (Faz 6).

## Veri Modeli

```sql
CREATE TABLE gemiler (
    id SERIAL PRIMARY KEY,
    ad TEXT NOT NULL UNIQUE,
    olusturulma_zamani TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hatlar (
    id SERIAL PRIMARY KEY,
    ad TEXT NOT NULL UNIQUE,
    olusturulma_zamani TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rota_noktalari (
    id SERIAL PRIMARY KEY,
    hat_id INTEGER NOT NULL REFERENCES hatlar(id),
    sira INTEGER NOT NULL,
    ad TEXT NOT NULL,
    enlem DOUBLE PRECISION NOT NULL,
    boylam DOUBLE PRECISION NOT NULL,
    UNIQUE (hat_id, sira)
);

CREATE TABLE seferler (
    id SERIAL PRIMARY KEY,
    gemi_id INTEGER NOT NULL REFERENCES gemiler(id),
    hat_id INTEGER NOT NULL REFERENCES hatlar(id),
    baslatan_personel_id INTEGER NOT NULL REFERENCES personel_hesaplari(id),
    baslangic_zamani TIMESTAMPTZ NOT NULL DEFAULT now(),
    bitis_zamani TIMESTAMPTZ
);

-- Bir gemi aynı anda yalnızca bir aktif seferde olabilir.
CREATE UNIQUE INDEX seferler_aktif_gemi_tekil
    ON seferler (gemi_id) WHERE bitis_zamani IS NULL;

ALTER TABLE ilgi_noktalari ADD COLUMN hat_id INTEGER REFERENCES hatlar(id);
-- hat_id NULL: tüm hatlarda görünür (genel bilgi noktası).
-- hat_id dolu: sadece o hatta görünür.
```

`bitis_zamani IS NULL` olan bir `seferler` satırı = aktif sefer. `rota_noktalari.sira` bir hattın duraklarının sırasını verir (bugünkü `rotaNoktalari`/`rotaAdlari` dizilerinin DB karşılığı). Bir hat tek yönlü sabit bir durak dizisidir; dönüş yolculuğu ayrı bir hat kaydı olarak modellenir (basitlik için, yön tersine çevirme mantığı eklenmez).

## Sunucu Mimarisi

Bugünkü global değişkenler (`gemiKonumu`, `rotaNoktalari`, `suankiHedefIndex`, `varisBildirimiGonderildi`) kaldırılır. Yerine bellek-içi bir kayıt yapısı gelir:

```js
const aktifSeferler = new Map(); // seferId -> {
  //   gemiId, hatId,
  //   konum: { enlem, boylam },
  //   hedefIndex, varisBildirimiGonderildi,
  //   rotaNoktalari, rotaAdlari, legMesafeleri, toplamRotaMesafesi
  // }
```

Bir sefer başladığında hattın `rota_noktalari` satırları DB'den bir kere okunur, mesafe hesaplamaları (`legMesafeleri`, `toplamRotaMesafesi`) o an yapılıp `aktifSeferler` girdisine önbelleklenir — her tick'te tekrar hesaplanmaz.

**Tick döngüsü** (`konumKontrolVeYayinla`, saniyede bir): `aktifSeferler` üzerinde döner, her sefer için bağımsız `sahteGpsGuncelle` çalıştırır, o seferin `hat_id`'sine uyan `ilgi_noktalari` (`WHERE hat_id IS NULL OR hat_id = $1`) ile geofence kontrolü yapar, sonucu yalnızca `io.to('sefer:' + seferId)` odasına yayınlar.

### REST Uçları

- `POST /sefer/baslat` `{ gemi_id, hat_id }` — JWT Bearer + `kaptan`/`admin` rolü gerekir (mevcut `/reset-gemi` deseniyle aynı middleware). Gemi zaten aktif bir seferdeyse 409 döner. Başarılıysa `seferler`'e satır ekler, hattın rota noktalarını yükler, `aktifSeferler`'e ekler, `{ sefer_id }` döner.
- `POST /sefer/bitir` `{ sefer_id }` — aynı yetki. `bitis_zamani`'nı DB'ye yazar, `aktifSeferler`'den çıkarır, o odadaki bağlı client'lara `sefer-bitti` event'i yayınlar (böylece app'ler otomatik seçim ekranına döner).
- `POST /reset-gemi` artık `{ sefer_id }` alır; yalnızca o seferin canlı konumunu rotanın başlangıcına döndürür.
- `GET /seferler/aktif` — **auth gerektirmez** (yolcu app da kullanacak). Aktif seferlerin listesini döner: `[{ sefer_id, gemi_adi, hat_adi, baslangic_zamani }]`.
- `GET /gemiler`, `GET /hatlar` — **auth gerektirmez** (personel app'in "Sefer Başlat" ekranındaki dropdown'ları doldurmak için). Sadece listeler; yeni gemi/hat kaydı oluşturan bir REST ucu bu fazda yok — gemi/hat kayıtları migration script'iyle (bkz. Veri Taşıma) elle oluşturulur, bu fazda bir "yeni gemi/hat ekle" yönetim ekranı yok.

### Socket.io

Az önce ayrı bir hotfix'te (`b5b8ab1`) `io.use` JWT middleware'i, token göndermeyen bağlantıların artık reddedilmeyip salt-okunur/dinleyici olarak kabul edilmesi için değiştirildi (yolcu app hiç login olmuyor). Bu fazın oda modeli bu davranışın üzerine kurulur: `sefer-sec` event'i **kimlik doğrulaması gerektirmez** — hem anonim (yolcu) hem kimliği doğrulanmış (personel) soketler kullanabilir. Client, bağlanırken veya bağlandıktan sonra `sefer-sec` ile hangi seferi takip etmek istediğini bildirir; sunucu o `soket`'i `sefer:<id>` odasına `join` eder. Önceki oda varsa `leave` edilir (yolcu app'te sefer değiştirme senaryosu için). `gemi-konum-guncelleme`, `acil-durum-uyarisi`, `acil-durum-bitti`, `yolcu-sayisi-yayin`, `varis-bildirimi` — hepsi artık `io.emit(...)` yerine `io.to(oda).emit(...)` ile yayınlanır. Acil durum dahil hiçbiri artık filo geneline gitmez; sadece ilgili seferin odasına. Yazma işlemleri (`acil-durum-baslat/bitir`, `yolcu-sayisi-guncelle`) hâlâ kimlik doğrulaması ister — bu, mevcut hotfix'te zaten uygulanan davranış, bu faz sadece oda hedeflemesini ekliyor.

## Mobil App Değişiklikleri

**Yolcu app (`ido-navigasyon-mobil-v3`):** Açılışta `GET /seferler/aktif` çağrılır, sonuç basit bir liste/seçim ekranında gösterilir ("Hangi gemiyi takip ediyorsun?"). Seçim yapılınca soket bağlanır ve `sefer-sec` ile o seferin odasına katılır. `sefer-bitti` event'i alınırsa seçim ekranına geri döner. Tam harita/UX cilası bu fazın kapsamı dışında (Faz 6).

**Personel app (`ido-navigasyon-personel`):** Login sonrası aktif bir sefer yönetmiyorsa "Sefer Başlat" ekranı çıkar (gemi + hat seçimi, `GET` uçlarıyla dolan iki dropdown — bu uçlar için ayrıca `GET /gemiler` ve `GET /hatlar` eklenir). Sefer başlatıldıktan sonra mevcut ana panel (acil durum, yolcu sayısı) o sefer bağlamında çalışır. "Seferi Bitir" butonu eklenir.

## Hata Yönetimi

Mevcut desen korunur: istemciye genel mesaj (`{ hata: '...' }`), detay sunucu logunda. Yeni durumlar:
- Aynı gemi zaten aktif seferdeyken `/sefer/baslat` çağrılırsa 409 + `{ hata: 'Bu gemi zaten aktif bir seferde' }`.
- Var olmayan/zaten bitmiş bir `sefer_id` ile `/sefer/bitir` veya `/reset-gemi` çağrılırsa 404.
- Geçersiz `gemi_id`/`hat_id` (DB'de yok) ile `/sefer/baslat` çağrılırsa 400.

## Veri Taşıma (Migration)

Repoda migration aracı yok (mevcut konvansiyon korunuyor); yeni tablolar ve mevcut verinin taşınması elle çalıştırılan SQL/script ile yapılır (`db/` klasöründe, `personel_hesaplari.sql` deseniyle):
1. `db/gemiler_hatlar_seferler.sql` — yukarıdaki şemayı oluşturur, `ilgi_noktalari.hat_id` kolonunu ekler.
2. Bugünkü hardcoded rota (`Bozuk Gemi Batığı` → `Heybeliada` → `İstanbul`) tek bir `hatlar` satırı ve üç `rota_noktalari` satırı olarak elle eklenir; en az bir `gemiler` satırı eklenir.
3. Mevcut `ilgi_noktalari` satırlarının `hat_id`'si bu yeni hatta backfill edilir (`UPDATE ilgi_noktalari SET hat_id = <yeni_hat_id>`).

## Test Planı

- Yeni repo katmanları (`gemilerRepo.js`, `hatlarRepo.js`, `seferRepo.js` benzeri) mevcut desende (mock pool, `personelRepo.test.js` stili) test edilir.
- `POST /sefer/baslat` / `/sefer/bitir` için REST testleri: yetki kontrolü, "zaten aktif sefer" 409'u, başarı yolu.
- **En kritik test:** iki farklı sefer/oda açıkken birine yapılan yayının diğerinin client'ına sızmadığını doğrulayan soket testi (mevcut `server.test.js`'teki `ioClient` deseniyle).
- `sahteGpsGuncelle`'nin sefer-bazlı hale gelmesi sonrası, iki aktif seferin birbirinden bağımsız ilerlediğini doğrulayan birim testi.

## Açık Sorular / Sonraki Adım

Yok — tasarım onaylandıktan sonra `superpowers:writing-plans` ile adım adım (test-driven, dosya bazlı) bir uygulama planına dönüştürülecek.
