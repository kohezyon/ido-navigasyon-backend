# Faz 5 / Alt-proje 1 — GitHub Actions CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ido-navigasyon-backend` reposuna, her `main`'e push'ta ve `main`'e açılan her pull request'te otomatik `npm test` çalıştıran bir GitHub Actions workflow'u eklemek.

**Architecture:** Tek bir workflow dosyası (`.github/workflows/test.yml`), tek job, `ubuntu-latest` üzerinde: kod checkout → Node 24 kurulumu → `npm ci` → `npm test`. Test paketi hiçbir gerçek DB bağlantısı kurmadığı için (tüm `havuz.query` çağrıları `vi.spyOn` ile mock'lanmış) ekstra servis/secret gerekmiyor.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`), Node.js 24, npm, Vitest (mevcut `npm test` script'i üzerinden).

## Global Constraints

- Sadece backend (`ido-navigasyon-backend` kökü) CI kapsamında — mobil app'lerin (`ido-navigasyon-personel`, `ido-navigasyon-mobil-v3`) otomatik test altyapısı yok, CI'a dahil edilmiyor.
- Ortam değişkeni/secret eklenmiyor — mevcut test paketi bunlara ihtiyaç duymuyor.
- Lint bu işin kapsamında değil (kullanıcı kararıyla ayrı tutuldu).

---

### Task 1: GitHub Actions test workflow'u

**Files:**
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Yok (tek dosyalık, bağımsız bir konfigürasyon değişikliği; başka bir task'ın tükettiği bir arayüz üretmiyor).

- [ ] **Step 1: Workflow dosyasını oluştur**

`.github/workflows/test.yml`:

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: YAML sözdizimini doğrula**

Run: `node -e "const yaml = require('yaml'); yaml.parse(require('fs').readFileSync('.github/workflows/test.yml', 'utf8')); console.log('YAML gecerli')"`

Eğer `yaml` paketi kurulu değilse (muhtemel, bu proje bir bağımlılık olarak eklemiyor), bunun yerine Python ile doğrula: `python -c "import yaml, sys; yaml.safe_load(open('.github/workflows/test.yml')); print('YAML gecerli')"` — o da yoksa, dosyayı dikkatlice gözden geçir (girinti, `:` sonrası boşluk, liste öğeleri) ve bir sonraki adımda GitHub'ın kendisinin doğrulamasına güven.

Expected: "YAML gecerli" yazısı (ya da eşdeğer bir hatasız çıktı).

- [ ] **Step 3: Commit ve push**

```bash
git add .github/workflows/test.yml
git commit -m "ci: GitHub Actions ile push/PR'da otomatik test calistir"
git push origin main
```

- [ ] **Step 4: GitHub Actions'ta gerçek çalıştırmayı doğrula**

Push'tan sonra GitHub'daki repo sayfasında **Actions** sekmesine git (`https://github.com/kohezyon/ido-navigasyon-backend/actions`), en son "Test" workflow çalıştırmasının başladığını ve **yeşil (başarılı)** sonuçlandığını doğrula. `gh` CLI kuruluysa şu komutla da kontrol edilebilir:

```bash
gh run list --workflow=test.yml --limit=1
```

Expected: en son çalıştırmanın `status` alanı `completed`, `conclusion` alanı `success`.

Eğer başarısız olursa (örn. Node sürümü uyumsuzluğu, `npm ci` hatası — repoda `package-lock.json` olmadan `npm ci` başarısız olur, önce bunun var olduğunu kontrol et), hatayı logdan oku ve düzelt, tekrar push et.
