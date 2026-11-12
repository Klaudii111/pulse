// 1.13.4 texts (English) – one story in History (old journal collapsed), loss % of the deposit for the chosen profile,
// profile definition apart from the trade's real effect, Robot holdings and waiting buys, "no leverage" at 1:1, real caps.
const lv = (v) => (+v > 1 ? `leverage 1:${v}` : 'no leverage');
export default {
  'hi.legacy': 'Old journal (manual entries)',

  'mb.levNote4': '{pf}: at worst you can lose up to {p} % of the deposit. A bolder profile = more leverage and risk; the deposit can even be smaller.',
  'mb.ownShort': 'Own leverage',
  'mb.real': 'This trade: at worst {v} = {p} % of the wallet.',

  'pf.short.aggr': 'risk 4 % · leverage 1:{s} on shares, 1:{i} on indices',
  'pf.long.aggr': 'At the stop at most 4 % of the wallet, leverage up to the market’s legal cap (shares 1:5, indices and gold 1:20, crypto 1:2). The biggest gains and losses.',

  'tr.meta': (p) => `${p.side} · ${lv(p.lev)} · deposit ${p.a}`,
  'u.open.mine': (p) => (+p.lev > 1 ? `Deposit ${p.a} · leverage 1:${p.lev} · you trade ${p.n}` : `Deposit ${p.a} · no leverage`),
  'term.levTag': (p) => lv(p.v),
  'term.confirmLev': (p) => `${p.side} for ${p.a} · ${lv(p.lev)}`,
  'term.openedLev': (p) => `${p.side} ${p.sym}: deposit ${p.a}, ${lv(p.lev)} (fictional)`,

  'rb.holds': { one: 'The robot holds {n} position', other: 'The robot holds {n} positions' },
  'rb.holds0': 'The robot holds nothing right now',
  'rb.wait': 'waiting to buy {n}',
  'pa.ordN': 'waiting to buy {n}',
  'rb.canBuy': 'Signals you can buy: {n}',
  'rb.openSig': { one: '{n} signal', other: '{n} signals' },

  'mt5.row': 'MetaTrader 5 (demo)',
  'mt5.rowS': 'Guide and download',

  'dh.inclOpen': 'including open trades',
  'watch.layAria': { one: 'Show {n} chart', other: 'Show {n} charts side by side' },
  'pt.selfS': 'Trade', 'pt.sigS': 'Signals',
  'pt.linkAria': 'Open {p}',
};
