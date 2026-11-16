/* 1.16.4 Denní robot: signál, do kterého jde právě vstoupit, je na Dnes úplně nahoře a je vidět i na Signálech;
   po skončení vstupu zůstane tři hodiny nahoře jedna věta. */
export default {
  'den.left.one': 'Zbývá {n} minuta', 'den.left.few': 'Zbývají {n} minuty', 'den.left.many': 'Zbývá {n} minuty', 'den.left.other': 'Zbývá {n} minut',
  'den.left0': 'Zbývá méně než minuta',
  'den.now.ok': 'Cena v demu teď: {p} – je pod hranicí {v}, vstoupit jde.',
  'den.now.no': 'Cena v demu teď: {p} – je už za hranicí {v}, teď nevstupuj.',
  /* nejdřív do kdy a za kolik, čas vzniku signálu až na konci (upozornění chodí o čtvrt hodiny později než signál) */
  'den.brk.buy': 'Vstoupit jde do {until} a jen když je cena nejvýš {v}.',
  'den.brk.sell': 'Vstoupit jde do {until} a jen když je cena nejníž {v}.',
  'den.brk0.buy': 'Vstoupit jde do {until} a jen když je cena nejvýš {v}.',
  'den.brk0.sell': 'Vstoupit jde do {until} a jen když je cena nejníž {v}.',
  'den.why': 'Signál je z {at}. Data tohoto trhu chodí o {n} {w} později, proto je na vstup jen pár minut.',
  'den.why0': 'Signál je z {at}.',
  'den.goneToast': 'Vstup u tohoto signálu právě skončil.',
  'den.goneH': 'Denní robot:',
  'den.gone1': 'signál {m} – vstup skončil v {until}. Teď nic nedělej. Denní signál platí jen pár minut, příště klepni na upozornění hned.',
  'den.goneN': 'vstup už skončil – {list}. Teď nic nedělej. Denní signál platí jen pár minut, příště klepni na upozornění hned.',
  'den.goneLi': '{m} v {until}',
  'scan.den': 'Jednodenní signály testem neprošly, mezi otestovanými nejsou. Zkušební denní robot je na Dnes; v den, kdy pošle signál, ho najdeš i tady nahoře.',
};
