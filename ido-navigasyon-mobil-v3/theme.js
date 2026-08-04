const marka = {
  mavi: { taban: '#4FA8D8', metinAcikMod: '#1C6E99' },
  turuncu: { taban: '#F2A65A', metinAcikMod: '#A85D14' },
  kirmizi: { taban: '#E85C5C', metinAcikMod: '#B23A3A' },
  yesil: { taban: '#8FBF9F', metinAcikMod: '#2F6B47' },
};

const koyuTema = {
  zemin: '#0d1b2a',
  yuzey: '#152436',
  ozetKartArkaplan: '#1B3A52',
  kenarlik: '#22384F',
  yaziBirincil: '#E8EEF3',
  yaziIkincil: '#7F97AB',
};

const acikTema = {
  zemin: '#F4F8FB',
  yuzey: '#FFFFFF',
  ozetKartArkaplan: '#0d1b2a',
  kenarlik: '#DCE6ED',
  yaziBirincil: '#0d1b2a',
  yaziIkincil: '#5B7A8F',
};

function temaSec(karanlikMod) {
  return karanlikMod ? koyuTema : acikTema;
}

function tipRenkleri(tip, karanlikMod) {
  if (tip === 'ada') {
    return karanlikMod
      ? { arkaplan: '#1E3A2A', kenar: marka.yesil.taban, yazi: marka.yesil.taban, butonArkaplan: marka.yesil.metinAcikMod }
      : { arkaplan: '#EAF5EE', kenar: marka.yesil.metinAcikMod, yazi: marka.yesil.metinAcikMod, butonArkaplan: marka.yesil.metinAcikMod };
  }
  if (tip === 'batik') {
    return karanlikMod
      ? { arkaplan: '#341B1B', kenar: marka.kirmizi.taban, yazi: marka.kirmizi.taban, butonArkaplan: marka.kirmizi.metinAcikMod }
      : { arkaplan: '#FBEAEA', kenar: marka.kirmizi.metinAcikMod, yazi: marka.kirmizi.metinAcikMod, butonArkaplan: marka.kirmizi.metinAcikMod };
  }
  return karanlikMod
    ? { arkaplan: koyuTema.yuzey, kenar: marka.mavi.taban, yazi: marka.mavi.taban, butonArkaplan: marka.mavi.metinAcikMod }
    : { arkaplan: '#EAF3FA', kenar: marka.mavi.metinAcikMod, yazi: marka.mavi.metinAcikMod, butonArkaplan: marka.mavi.metinAcikMod };
}

const haritaRenkleri = {
  gemiGovde: '#FFFFFF',
  gemiCerceve: koyuTema.zemin,
  gemiKabin: koyuTema.zemin,
  gemiPencere: marka.mavi.taban,
  gemiBaca: marka.turuncu.taban,
  ada: marka.turuncu.taban,
  batik: marka.kirmizi.taban,
  haritaZeminKoyu: koyuTema.zemin,
  haritaZeminAcik: '#E5F0F8',
  adaPopupArkaplan: '#FFF3E4',
  batikPopupArkaplan: '#FBEAEA',
};

module.exports = { marka, koyuTema, acikTema, temaSec, tipRenkleri, haritaRenkleri };
