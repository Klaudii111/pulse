// 1.13.4 – jeden příběh v Historii (starý deník jen sbalený), % ztráty vkladu pro zvolený profil, definice profilu zvlášť od
// skutečného dopadu obchodu, Robot: co drží a co čeká, „bez páky“ všude u 1:1, skutečné stropy páky u Agresivněji.
const lv = (v) => (+v > 1 ? `páka 1:${v}` : 'bez páky');
export default {
  /* Historie: starý ruční deník jen jako malý sbalený blok dole */
  'hi.legacy': 'Starý deník (ruční záznamy)',

  /* profil: % ztráty vkladu pro ZVOLENÝ profil */
  'mb.levNote4': '{pf}: nejhůř můžeš ztratit až {p} % vkladu. Odvážnější profil = větší páka a riziko; vklad může být i menší.',
  'mb.ownShort': 'Vlastní páka',
  /* obchod bez signálu: definice profilu + skutečný dopad tohoto obchodu zvlášť */
  'mb.real': 'Tento obchod: nejhůř {v} = {p} % peněženky.',

  /* Agresivněji: skutečné stropy podle trhu */
  'pf.short.aggr': 'riziko 4 % · páka 1:{s} u akcií, 1:{i} u indexů',
  'pf.long.aggr': 'Při stopu nejvýš 4 % peněženky, páka až do zákonného stropu trhu (akcie 1:5, indexy a zlato 1:20, krypto 1:2). Největší zisky i ztráty.',

  /* „bez páky“, kde je páka 1:1 */
  'tr.meta': (p) => `${p.side} · ${lv(p.lev)} · vklad ${p.a}`,
  'u.open.mine': (p) => (+p.lev > 1 ? `Vklad ${p.a} · páka 1:${p.lev} · obchoduješ za ${p.n}` : `Vklad ${p.a} · bez páky`),
  'term.levTag': (p) => lv(p.v),
  'term.confirmLev': (p) => `${p.side} za ${p.a} · ${lv(p.lev)}`,
  'term.openedLev': (p) => `${p.side} ${p.sym}: vklad ${p.a}, ${lv(p.lev)} (fiktivní)`,

  /* Robot: co drží, co čeká, co můžeš koupit ty */
  'rb.holds': { one: 'Robot drží {n} pozici', few: 'Robot drží {n} pozice', many: 'Robot drží {n} pozice', other: 'Robot drží {n} pozic' },
  'rb.holds0': 'Robot teď nic nedrží',
  'rb.wait': 'čeká na nákup {n}',
  'pa.ordN': 'čeká na nákup {n}',
  'rb.canBuy': 'Signály, které můžeš koupit: {n}',
  'rb.openSig': { one: '{n} signál', few: '{n} signály', many: '{n} signálu', other: '{n} signálů' },

  /* Obchodovat: jeden řádek MetaTrader 5 */
  'mt5.row': 'MetaTrader 5 (demo)',
  'mt5.rowS': 'Návod a stažení',

  /* Dnes: Sám / Signály jsou odkazy, jen Robot za mě je přepínač */
  /* Dnes: změna dne včetně otevřených obchodů (stejné číslo jako Obchodovat → Dnes) */
  'dh.inclOpen': 'včetně otevřených obchodů',
  /* Sledované grafy: rozložení (čtečka obrazovky) */
  'watch.layAria': { one: 'Zobrazit {n} graf', few: 'Zobrazit {n} grafy vedle sebe', many: 'Zobrazit {n} grafu vedle sebe', other: 'Zobrazit {n} grafů vedle sebe' },
  'pt.selfS': 'Obchodovat', 'pt.sigS': 'Signály',
  'pt.linkAria': 'Otevřít {p}',
};
