# Faz 6 / Alt-proje 2 — Offline/Zayıf Bağlantı Davranışı — Tasarım

**Tarih:** 2026-08-10
**Durum:** Onaylandı, plana geçiliyor

## Bağlam

Faz 6'nın üçüncü maddesi (Alt-proje 1: Leaflet local bundling, tamamlandı — bkz. `2026-08-10-faz6-leaflet-local-bundling-design.md`). Bu spec, roadmap'in "offline/zayıf bağlantı davranışı: son bilinen veriyi cache'le, bağlantı koptuğunda kullanıcıyı bilgilendir (sessizce donmasın)" maddesini kapsıyor.

## Mevcut durum tespiti

- **Zaten var:** `ido-navigasyon-mobil-v3/App.js`'te `baglantiDurumu` state'i (`'Bagli'` / `'Baglanti kesildi'` / `'Baglaniyor...'`), socket `connect`/`disconnect` event'leriyle güncelleniyor, ekranda görsel gösterge var (renkli nokta + yazı + erişilebilirlik etiketi, satır ~458-490). Roadmap'in "kullanıcıyı bilgilendir" kısmı bu haliyle yeterli — değiştirilmiyor.
- **Gerçek eksik:** `AsyncStorage` şu an yalnızca kullanıcı tercihleri (favoriler, tanıtım-görüldü bayrağı) için kullanılıyor. Sunucudan gelen hiçbir veri cache'lenmiyor:
  1. `/seferler/aktif` isteği başarısız olursa (satır ~90) liste `[]` olur, ekranda "Şu an aktif bir sefer yok" yazısı çıkar — bu, sunucuya erişilemediği durumla gerçekten sefer olmadığı durumunu ayırt etmiyor, kullanıcıyı yanıltıyor.
  2. Sefer takibi sırasında uygulama kapatılıp yeniden açılırsa (socket bağlantısı ve component state'i sıfırlanır), önceki konum/ilerleme bilgisine dair hiçbir iz kalmıyor — harita/ilerleme sıfırdan başlıyor, ilk canlı veri gelene kadar boş görünüyor.

## Yaklaşım

**1. Aktif sefer listesi cache'leme.** `/seferler/aktif` başarıyla çekildiğinde sonuç `AsyncStorage` anahtarı `son_aktif_seferler` altında (JSON) saklanır. Fetch başarısız olursa:
   - Cache'te veri varsa: o veriyi göster, ekranda "Bağlantı kurulamadı, en son bilinen liste gösteriliyor" uyarısı.
   - Cache'te veri yoksa: liste boş kalır ama metin "Şu an aktif bir sefer yok" yerine "Bağlantıya ulaşılamadı, lütfen tekrar deneyin" olur — iki farklı durum artık ayırt ediliyor.

**2. Son bilinen konum cache'leme.** Her `gemi-konum-guncelleme` socket event'i geldiğinde, payload `AsyncStorage` anahtarı `son_konum_<sefer_id>` altında saklanır. Bir sefer seçildiğinde (socket bağlanıp ilk canlı veri gelmeden önce), varsa bu cache'teki son bilinen konum hemen state'e yüklenir (harita/ilerleme boş başlamaz) — üstünde küçük bir "son bilinen konum" notu gösterilir, canlı veri gelince not kalkar.

**Kapsam dışı (bilinçli sınır):** Seçili sefer ID'sinin kendisinin (`seciliSeferId`) uygulama kapanıp açıldığında otomatik hatırlanması/yeniden seçilmesi — bu ayrı bir UX kararı (kullanıcı her açılışta sefer seçmeye devam ediyor, sadece o seçim ekranındaki liste ve seçtikten sonraki ilk görünüm artık boş/yanıltıcı değil).

## Test

Otomatik test altyapısı yok. Doğrulama: Metro bundler sağlık kontrolü (Faz 6/Alt-proje 1'de kullanılan yöntem). Gerçek cihazda uçak modu açıp/kapatarak davranışın görsel doğrulanması ayrı bir manuel adım (bu oturumda yapılamaz).

## Kapsam dışı

- `seciliSeferId`'nin kalıcı hatırlanması (yukarıda belirtildi).
- Genel bir "offline-first" mimarisi (ör. tüm API çağrılarını saran bir cache katmanı) — YAGNI, sadece bu iki somut nokta ele alınıyor.
