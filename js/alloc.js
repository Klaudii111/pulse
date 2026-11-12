// 1.15.1 "Rozložení portfolia" – the numbers of the donut (no HTML).
// What the client has put in (the deposits of open trades + the money waiting in buy orders = the wallet's "Ve hře",
// W.parts().inPlay) split by kind of market, plus "Volné peníze". Whole crowns that add up EXACTLY to "Ve hře"
// (largest remainder), so the donut, its centre and the Portfolio header can never disagree by a koruna.
import * as W from './wallet.js';
import * as M from './market.js';

/* Akcie · Fondy (ETF) · Indexy · Komodity · Měny · Krypto – the order of the legend and of the slices */
export const KINDS = ['stock', 'etf', 'index', 'commodity', 'fx', 'crypto'];
export function kindOf(sym) {
  const c = M.cls(sym);
  return KINDS.includes(c) ? c : 'stock';
}

/* split the integer `total` over `vals` (non-negative numbers) in proportion, the parts add up to total exactly */
export function apportion(vals, total) {
  const sum = vals.reduce((a, v) => a + v, 0);
  if (!(sum > 0) || !(total > 0)) return vals.map(() => 0);
  const raw = vals.map((v) => (v / sum) * total);
  const out = raw.map((v) => Math.floor(v));
  let rest = total - out.reduce((a, v) => a + v, 0);
  raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f).forEach((x) => { if (rest > 0 && vals[x.i] > 0) { out[x.i]++; rest--; } });
  return out;
}

/* { inPlay, free, total, kinds: [{ id, amount, pct, items: [{ sym, name, amount, share, n, wait }] }] } – kinds with money only */
export function allocation(sm) {
  const p = W.parts(sm);
  const bySym = new Map();
  const add = (sym, name, v, wait) => {
    const x = bySym.get(sym) || { sym, name: name || '', raw: 0, n: 0, wait: 0 };
    x.raw += v; if (wait) x.wait += v; else x.n++;
    if (!x.name && name) x.name = name;
    bySym.set(sym, x);
  };
  (sm.rows || []).forEach((r) => add(r.sym, r.name, +r.margin || 0, false));
  (sm.w.orders || []).forEach((o) => add(o.sym, o.name, +o.amount || 0, true));
  const syms = [...bySym.values()];
  const kinds = KINDS.map((id) => ({ id, list: syms.filter((x) => kindOf(x.sym) === id) })).filter((k) => k.list.length);
  const kAmt = apportion(kinds.map((k) => k.list.reduce((a, x) => a + x.raw, 0)), p.inPlay);
  const total = p.inPlay + p.free;
  const out = kinds.map((k, i) => {
    const amount = kAmt[i];
    const iAmt = apportion(k.list.map((x) => x.raw), amount);
    const items = k.list.map((x, j) => ({ sym: x.sym, name: x.name, amount: iAmt[j], share: amount > 0 ? (iAmt[j] / amount) * 100 : 0, n: x.n, wait: x.wait > 0 && x.n === 0 }))
      .sort((a, b) => b.amount - a.amount);
    return { id: k.id, amount, pct: total > 0 ? (amount / total) * 100 : 0, items };
  }).filter((k) => k.amount > 0).sort((a, b) => b.amount - a.amount);
  return { inPlay: p.inPlay, free: p.free, total, freePct: total > 0 ? (p.free / total) * 100 : 0, kinds: out };
}
