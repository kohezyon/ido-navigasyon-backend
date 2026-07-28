const { geofenceKontrolEt } = require('./geofencing.js');

// Sahte bir gemi konumu (İstanbul Boğazı yakınları, örnek koordinat)
const gemiKonumu = {
    enlem: 40.6329,
    boylam: 29.2494
};

// Sahte bir "ilgi noktası" (örnek bir batık, gemiye çok yakın bir yerde)
const ornekBatik = {
    ad: "Örnek Batık",
    enlem: 40.6335,
    boylam: 29.2500,
    tetikleme_mesafesi_metre: 500
};

const sonuc = geofenceKontrolEt(gemiKonumu.enlem, gemiKonumu.boylam, ornekBatik);

console.log("Test sonucu:");
console.log(sonuc);