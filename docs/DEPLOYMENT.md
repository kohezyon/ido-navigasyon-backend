# Dağıtım ve Operasyon Runbook'u

Bu doküman, `ido-navigasyon-backend`'i (ve iki Expo uygulamasını) çalıştırmak, dağıtmak ve olay anında müdahale etmek için pratik bir referanstır. Faz 4 (Güvenilirlik & Operasyon Altyapısı) kapsamında yazılmıştır.

## Mimari özet

- **Backend:** Node.js/Express + Socket.io + Postgres (`pg`), tek süreç, `server.js`. `npm start` (`node server.js`) ile çalışır, `PORT` env değişkeninde dinler (varsayılan 3000).
- **Veritabanı:** Postgres. Migration aracı yok — şema `db/*.sql` dosyalarında elle tutulur, elle uygulanır (bkz. aşağıdaki "Şema uygulama" bölümü).
- **İki istemci uygulaması** (Expo/React Native SDK 54):
  - `ido-navigasyon-personel` — mürettebat/kaptan app'i, JWT auth gerektirir.
  - `ido-navigasyon-mobil-v3` — yolcu app'i, anonim/kimliksiz socket bağlantısına izin verir.
- **Şu anki barındırma:** Render (backend); Postgres de büyük olasılıkla Render'ın yönetilen Postgres servisi. Render panel konfigürasyonu (build/start komutları, plan tipi, otomatik deploy ayarları) bu repoda bir `render.yaml` olarak tutulmuyor — panelden yönetiliyor. Bu doküman panel içeriğini bilmiyor; **panel ayarlarını Render dashboard'undan doğrulayın.**

## Ortam değişkenleri

`.env.example`'daki tam liste:

| Değişken | Zorunlu mu | Açıklama |
|---|---|---|
| `DATABASE_URL` | Evet | Postgres bağlantı adresi. `postgres://kullanici:sifre@host:5432/veritabani` formatında. |
| `JWT_GIZLI_ANAHTARI` | Evet (fail-fast) | JWT imzalama anahtarı. Tanımlı değilse sunucu `server.js` yüklenirken hemen hata fırlatıp kapanır (Faz 1'den beri). |
| `PORT` | Hayır (varsayılan 3000) | HTTP/Socket.io sunucusunun dinleyeceği port. |
| `HAVA_DURUMU_API_ANAHTARI` | Hayır | OpenWeatherMap API anahtarı — `/hava-durumu` uç noktası için. Tanımlı değilse o uç nokta muhtemelen hata döner (kritik değil). |
| `ALLOWED_ORIGINS` | Hayır | Virgülle ayrılmış, tarayıcı-tabanlı istemcilerin CORS origin listesi. Mobil app'ler buna bağlı değil (native HTTP/socket istemcileri CORS'tan etkilenmez). |

**Yerel geliştirme için** (bu proje kapsamında bu oturumda kurulan gerçek akış):
1. Repo kökünde `.env` dosyası oluştur (git tarafından izlenmiyor, `.gitignore`'da).
2. Yukarıdaki değişkenleri doldur — `DATABASE_URL` için ya kendi yerel Postgres'in ya da Render panelindeki **"External Database URL"** (Internal değil — Internal yalnızca Render'ın kendi ağı içinden çalışır).
3. `node server.js` ile başlat.

## Şema uygulama

Migration aracı yok. `db/` klasöründeki `.sql` dosyaları sırayla, elle uygulanır:
1. `db/personel_hesaplari.sql`
2. `db/gemiler_hatlar_seferler.sql`
3. `db/gemiler_hatlar_seferler_seed.sql` (örnek veri: "Yalova Feribotu 1" gemisi, "Yalova - Istanbul" hattı ve rota noktaları)

Tüm `CREATE TABLE` ifadeleri `IF NOT EXISTS` kullanıyor, `ALTER TABLE ... ADD COLUMN` ifadeleri `IF NOT EXISTS` kullanıyor — yani bu dosyaları tekrar tekrar çalıştırmak güvenli (idempotent), **seed dosyası hariç** (o `INSERT`'ler `ON CONFLICT` içermiyor, ikinci kez çalıştırılırsa yinelenen "Yalova Feribotu 1" gemisi/hattı oluşturur).

`psql` yoksa, `pg` paketiyle küçük bir Node betiğiyle de uygulanabilir:
```bash
node -e "
require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  for (const dosya of ['db/personel_hesaplari.sql', 'db/gemiler_hatlar_seferler.sql', 'db/gemiler_hatlar_seferler_seed.sql']) {
    await p.query(fs.readFileSync(dosya, 'utf8'));
    console.log('uygulandi:', dosya);
  }
  await p.end();
})();
"
```

## Personel/kaptan hesabı oluşturma

```bash
node scripts/personel-ekle.js <kullanici_adi> <sifre> <rol>
```
`<rol>`: `personel`, `kaptan`, veya `admin`.

## Başlangıç kurtarma davranışı (Faz 4)

Sunucu her başladığında (`server.js`, `require.main === module` bloğu), `sunucu.listen()`'dan önce şunu yapar:
- DB'de `bitis_zamani IS NULL` olan (yani "yarım bırakılmış") tüm seferleri otomatik kapatır.
- Kapatılan sefer varsa konsola şu formatta bir satır yazar: `Baslangicta yari birakilmis sefer(ler) kapatildi: sefer <id> (gemi <gemi_id>), ...`
- DB'ye hiç erişilemezse (bağlantı hatası vb.), sunucu `process.exit(1)` ile **hiç ayağa kalkmadan** kapanır.

**Bu logu her deploy sonrası kontrol edin.** Bu satırın çıkması normaldir (önceki deploy sırasında ya da crash anında aktif bir sefer varsa beklenen davranıştır) — ama sık sık, beklenmedik zamanlarda çıkıyorsa (örn. deploy yapmadığınız halde), sunucunun beklenmedik şekilde restart olduğunu (crash, OOM, Render'ın kendiliğinden yeniden başlatması) gösterir, araştırılmalı.

**Bilinen sınır (tek-instance varsayımı):** Bu kurtarma mantığı, backend'in **tek bir instance** olarak çalıştığı ve bu sorgunun yalnızca **boot anında** çalıştığı varsayımına dayanır (bkz. `seferRepo.js`'teki `yariBirakilmisSeferleriKapat` üzerindeki kod yorumu). Servis yatay olarak ölçeklenirse (birden fazla instance, zero-downtime deploy), yeni bir instance'ın boot'u, eski instance'ın hâlâ canlı yönettiği aktif bir seferi DB'de yanlışlıkla kapatabilir. Şu an tek instance ile çalışıldığı için bu bir risk değil; ölçekleme kararı verilirse bu sorgunun instance-scoped hale getirilmesi gerekir.

## Sık karşılaşılabilecek durumlar

**"Bu gemi zaten aktif bir seferde" (409) hatası, ama uygulamada hiçbir aktif sefer görünmüyor:**
- Faz 4 öncesi bilinen bir sorundu (bkz. yukarıdaki "Başlangıç kurtarma" bölümü) — artık her restart'ta otomatik düzeliyor. Hâlâ oluyorsa, sunucunun restart olmadığını (yani düzeltmenin hiç çalışmadığını) ya da farklı bir kök nedeni araştırın.

**Crew/yolcu app "Sefer secilemedi" uyarısı veriyor:**
- Normal — sefer artık aktif değil demektir (bitmiş ya da restart'ta kapatılmış). Uygulama otomatik olarak güncel listeyi çeker, kullanıcı yeni bir sefer seçebilir/başlatabilir.

**DB bağlantısı kurulamıyor, sunucu açılmıyor:**
- `DATABASE_URL`'i kontrol edin (Render panelinden **External** adresi kopyaladığınızdan emin olun, Internal değil — yerelden/Render dışından Internal adrese erişilemez).
- `Pool` 5 saniye (`connectionTimeoutMillis`) sonra bağlantı denemesinden vazgeçip `process.exit(1)` ile kapanır — sunucu loglarında bağlantı hatası mesajını arayın.

## Kapsam dışı (Faz 4'ün henüz ele alınmamış alt-konuları)

- **Render cold-start:** Free-tier planlar belirli bir süre trafik almazsa uykuya dalar, ilk istek gecikmeli yanıtlanır. Ücretli bir plana geçiş kararı gerektirir — bu doküman kapsamında değil.
- **DB yedekleme stratejisi:** Şu an otomatik bir yedekleme süreci belgelenmemiş. Render'ın yönetilen Postgres'i kullanılıyorsa Render'ın kendi otomatik yedekleme özelliklerinin (plana göre değişir) etkin olup olmadığı panelden doğrulanmalı.
