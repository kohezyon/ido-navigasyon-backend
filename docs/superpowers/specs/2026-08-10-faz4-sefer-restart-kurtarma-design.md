# Faz 4 / Alt-proje 1 — `aktifSeferler` Restart Kurtarma — Tasarım

**Tarih:** 2026-08-10
**Durum:** Onaylandı, plana geçiliyor

## Problem

`server.js`'teki `aktifSeferler`, sefer durumunu (konum, hedef nokta, ilerleme vb.) tutan bellek-içi bir `Map`. Backend her yeniden başladığında (Render'da her deploy'da, ya da crash sonrası) bu `Map` boşalıyor. Ancak DB'deki `seferler` tablosunda, o an bitmemiş seferlerin `bitis_zamani` sütunu hâlâ `NULL` — yani DB'nin gözünde sefer hâlâ "aktif".

Bunun sonucu: `seferler_aktif_gemi_tekil` partial unique index'i (`ON seferler(gemi_id) WHERE bitis_zamani IS NULL`) o gemi için yeni bir sefer başlatılmasını engelliyor (`/sefer/baslat` 409 `Bu gemi zaten aktif bir seferde` döner), ama uygulama tarafında (`aktifSeferler` boş olduğu için) o sefer hiçbir yerde görünmüyor. Gemi, kimse fark etmeden kalıcı olarak kilitleniyor.

## Yaklaşım

Bellek-içi konum/ilerleme durumunu DB'ye periyodik yazıp restart sonrası kaldığı yerden devam ettirmek (tam kurtarma) YAGNI: ekstra şema + her konum güncellemesinde ekstra DB yazımı gerektirir, karmaşıklığı bu aşamada gerekçelendirmiyor. Bunun yerine:

**Sunucu her başladığında, `bitis_zamani IS NULL` olan tüm seferleri otomatik kapat.** Kaptan restart sonrası seferi yeniden başlatır. Veri kaybı riski yok (konum zaten kalıcı değildi, sadece canlı takip amaçlıydı) — bu, Faz 3'te de benimsenen "sade başla, sağlamlık özelliklerini sonraya bırak" prensibiyle tutarlı.

## Sunucu tarafı

`seferRepo.js`'e yeni fonksiyon:

```js
async function yariBirakilmisSeferleriKapat(havuz) {
    const sonuc = await havuz.query(
        'UPDATE seferler SET bitis_zamani = now() WHERE bitis_zamani IS NULL RETURNING id, gemi_id'
    );
    return sonuc.rows;
}
```

`server.js`'te, `if (require.main === module)` bloğu içinde, `sunucu.listen()` çağrılmadan **önce** bu fonksiyon `await`'lenir — hiçbir istemci bağlanamadan önce kilitli gemiler serbest bırakılmış olmalı. Kapatılan sefer varsa, hangi sefer/gemi olduğunu belirten bir log satırı yazılır (operasyonel görünürlük için — Render loglarında "az önce bir gemi kilitliydi, açıldı" bilgisi net görünsün). Kapatılan sefer yoksa sessiz geçilir.

DB sorgusu hata verirse (bağlantı sorunu vb.), sunucu başlamadan `process.exit(1)` ile kapanır — Faz 1'deki `JWT_GIZLI_ANAHTARI` fail-fast prensibiyle tutarlı: yarım-doğru bir durumda sessizce ayağa kalkmaktansa hiç kalkmamak tercih edilir.

Test ortamı etkilenmez: mevcut testler `app`/`havuz`'u doğrudan import ediyor, `require.main === module` koruması sayesinde bu kurtarma adımı ve `sunucu.listen()` test sırasında hiç çalışmıyor.

## Crew app tarafı (`ido-navigasyon-personel/App.js`)

Mevcut davranış zaten doğru: restart sonrası eski `seciliSeferId` geçersizleşince, socket yeniden bağlanışta `sefer-sec` ack'i `tamam:false` döner, uygulama "Sefer secilemedi" uyarısı verip `sefer-sec` ekranına döner (satır ~120-129) — sessiz takılma yok, ek bir düzeltme gerekmiyor.

Küçük bir eksik: `sefer-sec` ekranındaki `aktifSeferler` listesi sadece girişte bir kere çekiliyor (satır ~89-110), bu bounce-back senaryosunda yenilenmiyor. Kullanıcı artık kapanmış eski seferi hâlâ listede görüp tekrar seçmeye çalışabilir (aynı hatayı tekrar alır — takılma değil ama gereksiz tekrar). Çözüm: `/seferler/aktif` + `/gemiler` çekme mantığını ayrı bir fonksiyona çıkar, hem giriş anında hem "Sefer secilemedi" (satır ~122) ve "sefer-bitti" (satır ~147) durumlarında çağır.

## Test

- `seferRepo.test.js`: `yariBirakilmisSeferleriKapat` için birim test — `bitis_zamani` NULL bir sefer oluştur, fonksiyonu çağır, satırın artık `bitis_zamani` dolu döndüğünü ve `id`/`gemi_id` içerdiğini doğrula; ayrıca zaten bitmiş bir seferin etkilenmediğini doğrula.
- Crew app tarafında yeni bir birim/entegrasyon testi eklenmiyor (mevcut `App.js` test altyapısı yok); davranış değişikliği küçük ve mevcut manuel doğrulama sürecine dahil edilecek.

## Kapsam dışı

Render cold-start/barındırma kararı, DB yedekleme stratejisi, deployment/runbook dokümantasyonu — roadmap'te Faz 4'ün ayrı, bağımsız alt-konuları olarak kalıyor; bu spec sadece restart-kurtarma sorununu kapsıyor.

Bu tasarım tek-instance varsayımına dayanıyor: `yariBirakilmisSeferleriKapat` yalnızca tek bir backend instance'ının, yalnızca boot anında çalıştığı varsayımı altında güvenli (bkz. `seferRepo.js` içindeki fonksiyon yorumu). Çoklu-instance / yatay ölçekleme senaryosu (birden fazla backend instance'ı, zero-downtime deploy) bu spec'in kapsamı dışında; o senaryoya geçilirse sorgunun instance-scoped hale getirilmesi ayrı bir iş olarak ele alınmalı.
