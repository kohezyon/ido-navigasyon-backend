// node_modules/leaflet/dist icindeki kaynagi, Metro'nun .js dosyalarini kod
// olarak parse etmesinden kacinmak icin duz birer JS string modulu olarak
// assets/leaflet/ altina yazar. Leaflet surumu degistiginde (package.json'da
// leaflet bagimliligi guncellendikten sonra) bu betik tekrar calistirilmali:
// node scripts/leaflet-vendorle.js
const fs = require('fs');
const path = require('path');

function vendorleDosya(kaynakGoreliYol, hedefDosyaAdi) {
    const kaynakYol = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist', kaynakGoreliYol);
    const icerik = fs.readFileSync(kaynakYol, 'utf8');
    const hedefYol = path.join(__dirname, '..', 'assets', 'leaflet', hedefDosyaAdi);
    fs.mkdirSync(path.dirname(hedefYol), { recursive: true });
    fs.writeFileSync(hedefYol, `module.exports = ${JSON.stringify(icerik)};\n`);
    console.log(`Yazildi: ${hedefYol} (${icerik.length} karakter)`);
}

vendorleDosya('leaflet.js', 'leafletJs.js');
vendorleDosya('leaflet.css', 'leafletCss.js');
