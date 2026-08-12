const { withMainActivity, withMainApplication } = require('@expo/config-plugins');

function paketSatiriniDuzelt(icerik, dogruPaket) {
  return icerik.replace(/^package .+$/m, `package ${dogruPaket}`);
}

// "name" alaninda Turkce "I" (U+0130) gecince expo prebuild, MainActivity.kt/
// MainApplication.kt icine android.package yerine isimden turetilmis yanlis bir
// paket adi yaziyor; bu da derlemede "Unresolved reference 'BuildConfig'" hatasina
// yol aciyor. Bu plugin, dosya olusturulduktan sonra paket satirini zorla duzeltir.
module.exports = function withDogruAndroidPaketi(config) {
  const dogruPaket = config.android?.package;
  if (!dogruPaket) return config;

  config = withMainActivity(config, (c) => {
    c.modResults.contents = paketSatiriniDuzelt(c.modResults.contents, dogruPaket);
    return c;
  });
  config = withMainApplication(config, (c) => {
    c.modResults.contents = paketSatiriniDuzelt(c.modResults.contents, dogruPaket);
    return c;
  });
  return config;
};
