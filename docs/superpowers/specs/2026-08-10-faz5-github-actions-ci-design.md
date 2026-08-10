# Faz 5 / Alt-proje 1 — GitHub Actions CI — Tasarım

**Tarih:** 2026-08-10
**Durum:** Onaylandı, plana geçiliyor

## Bağlam

Roadmap'teki Faz 5 (Test & CI/CD) kapsamının çoğu — test framework kurulumu (Vitest + Supertest), `geofencing.js` birim testleri, socket/REST entegrasyon testleri — önceki fazlarda zaten tamamlandı (115 test yeşil). Roadmap dokümanı bu konuda güncel değildi.

Gerçekte kalan iş üç bağımsız parçaya ayrılıyor:
1. **GitHub Actions CI** (bu spec'in kapsamı) — bağımsız, ödeme/hesap kararı gerektirmiyor.
2. **Lint (ESLint)** — kullanıcı kararıyla bu işin kapsamı dışında bırakıldı (yeni araç/config + mevcut kod tabanında olası düzeltmeler gerektirdiği için ayrı bir karar).
3. **Staging ortamı** — Faz 4'teki cold-start kararı gibi, kullanıcının Render hesabı/ödeme kararı gerektiren, bu oturumda ilerletilemeyecek bağımsız bir konu.

## Önemli bulgu

`server.test.js`'teki tüm `havuz.query` çağrıları `vi.spyOn(havuz, 'query').mockResolvedValue(...)` ile mock'lanmış. `havuz` gerçek bir `pg.Pool` nesnesi olsa da (`server.js`'te `DATABASE_URL` ile oluşturuluyor), `pg.Pool` bağlantıyı tembel (lazy) kurar — yalnızca gerçek bir `.query()`/`.connect()` çağrısında. Mock'lanmış `.query`, gerçek metodun yerini aldığı için **test paketi hiçbir zaman gerçek bir Postgres'e bağlanmaya çalışmıyor**. Sonuç: CI runner'ında ne bir Postgres servis container'ı ne de gerçek bir `DATABASE_URL` secret'ı gerekiyor.

## Tasarım

**Dosya:** `.github/workflows/test.yml`

**Tetikleyici:**
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

**İş akışı:** Tek job (`test`), `ubuntu-latest` üzerinde:
1. `actions/checkout@v4`
2. `actions/setup-node@v4`, `node-version: 24` (yerel geliştirme ortamıyla — Node 24.18.0 — uyumlu)
3. `npm ci` (repo kökünde, `ido-navigasyon-backend` — mobil app'lerin ayrı `node_modules`'ları CI kapsamına girmiyor, onların otomatik test altyapısı yok)
4. `npm test`

**Ortam değişkenleri:** Gerekmiyor. `server.test.js` kendi `JWT_GIZLI_ANAHTARI` test değerini dosya başında set ediyor; `DATABASE_URL`'e (yukarıdaki bulgu nedeniyle) gerçek bağlantı hiç kurulmuyor.

**Başarısızlık davranışı:** Test başarısız olursa GitHub PR/commit üzerinde kırmızı ✗ durumu görünür. Branch protection (merge'i zorunlu kılma) bu spec'in kapsamında değil — ayrı bir karar olarak roadmap'te kalıyor.

## Test

Bu iş "test altyapısı eklemek" değil, mevcut test altyapısını CI'a bağlamak — dolayısıyla ayrı bir birim testi yok. Doğrulama: workflow dosyasını push ettikten sonra GitHub Actions sekmesinde çalışıp yeşil sonuç verdiğini gözlemlemek (manuel doğrulama adımı, plana dahil edilecek).

## Kapsam dışı

- ESLint/lint (kullanıcı kararıyla ayrı tutuldu).
- Staging ortamı (kullanıcının Render hesabı/ödeme kararı gerektiriyor).
- Branch protection / merge zorunluluğu kuralları.
- Mobil app'ler (`ido-navigasyon-personel`, `ido-navigasyon-mobil-v3`) için CI — otomatik test altyapıları yok.
