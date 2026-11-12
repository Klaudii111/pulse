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

/* 1.15.0 (B6) what I HOLD now: { total (= Hodnota účtu, W.parts().eq), inPlay (trades + waiting), held, free,
   kinds: [{ id, amount, pct, items }] (current value of the open trades = the list rows' "value": deposit + result),
   wait: { amount, pct, items } (money reserved in waiting buy orders – its own grey slice "Čeká na nákup"), freePct }.
   Whole crowns that add up EXACTLY to the account value (largest remainder) and whole percent that add up to 100. */
export function allocation(sm) {
  const p = W.parts(sm);
  const bySym = new Map();
  (sm.rows || []).forEach((r) => {
    const x = bySym.get(r.sym) || { sym: r.sym, name: r.name || '', raw: 0, n: 0 };
    x.raw += Math.max(0, (+r.margin || 0) + (+r.pnl || 0)); x.n++;
    bySym.set(r.sym, x);
  });
  const ords = (sm.w.orders || []);
  const waitAmt = Math.round(sm.reserved || 0);
  const held = Math.max(0, p.eq - p.free - waitAmt); // = deposits + open result of the trades (the rounding crown lands here)
  const syms = [...bySym.values()];
  const kinds = KINDS.map((id) => ({ id, list: syms.filter((x) => kindOf(x.sym) === id) })).filter((k) => k.list.length);
  const kAmt = apportion(kinds.map((k) => k.list.reduce((a, x) => a + x.raw, 0)), held);
  const total = p.eq;
  const out = kinds.map((k, i) => {
    const amount = kAmt[i];
    const iAmt = apportion(k.list.map((x) => x.raw), amount);
    const items = k.list.map((x, j) => ({ sym: x.sym, name: x.name, amount: iAmt[j], share: amount > 0 ? (iAmt[j] / amount) * 100 : 0, n: x.n, wait: false }))
      .sort((a, b) => b.amount - a.amount);
    return { id: k.id, amount, items };
  }).filter((k) => k.amount > 0).sort((a, b) => b.amount - a.amount);
  /* the waiting orders by instrument (second level of the grey slice) */
  const wMap = new Map();
  ords.forEach((o) => { const x = wMap.get(o.sym) || { sym: o.sym, name: o.name || '', raw: 0 }; x.raw += +o.amount || 0; wMap.set(o.sym, x); });
  const wl = [...wMap.values()];
  const wAmt = apportion(wl.map((x) => x.raw), waitAmt);
  const wait = { amount: waitAmt, items: wl.map((x, j) => ({ sym: x.sym, name: x.name, amount: wAmt[j], share: waitAmt > 0 ? (wAmt[j] / waitAmt) * 100 : 0, wait: true })).sort((a, b) => b.amount - a.amount) };
  /* whole percent of the account value, adding up to 100 */
  const pcts = apportion(out.map((k) => k.amount).concat([wait.amount, p.free]), total > 0 ? 100 : 0);
  out.forEach((k, i) => { k.pct = pcts[i]; k.pctRaw = total > 0 ? k.amount / total * 100 : 0; });
  wait.pct = pcts[out.length]; wait.pctRaw = total > 0 ? wait.amount / total * 100 : 0;
  return { inPlay: held + waitAmt, held, free: p.free, total, freePct: pcts[out.length + 1], freePctRaw: total > 0 ? p.free / total * 100 : 0, kinds: out, wait };
}
