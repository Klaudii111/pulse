// Obchodní platforma – the user's own fictional demo account (1.6.0).
// Fictional money only, stored on this device (store.js = localStorage with in-memory fallback).
// Nothing is sent anywhere and nothing is traded for real.
// Positions are tracked with the live prices of live.js and closed automatically on stop-loss / take-profit,
// or when the signal they were opened from closes. Each trade opened from a signal is also written to
// "Můj deník" (D.setJournal) so the journal and the terminal tell the same story.
import { CONFIG } from '../config.js';
import * as store from './store.js';
import * as D from './domain.js';
import * as Live from './live.js';

const KEY = 'wallet';
export const START = { CZK: 100000, EUR: 4000, USD: 4500 };

function fresh(ccy) {
  const c = ['CZK', 'EUR', 'USD'].includes(ccy) ? ccy : 'CZK';
  return { v: 1, ccy: c, start: START[c], balance: START[c], positions: [], closed: [], createdAt: Date.now(), day: null, dayEquity: null, seq: 1 };
}

export function get() {
  let w = store.get(KEY, null);
  if (!w || w.v !== 1) { w = fresh(D.calcState().ccy); store.set(KEY, w); }
  return w;
}
const save = (w) => store.set(KEY, w);

export function reset(ccy = D.calcState().ccy) {
  const w = fresh(ccy);
  save(w);
  return w;
}

const dirOf = (side) => (side === 'SELL' ? -1 : 1);

/* Current price of a symbol: live quote, else the signal's last price */
export function priceOf(sym, data) {
  const q = Live.quote(sym);
  const s = D.allOpen(data).find((x) => x.symbol === sym && x.last_price != null);
  if (q && (!s || !s.last_price_at || q.t >= Date.parse(s.last_price_at))) return { p: q.p, t: q.t };
  if (s) return { p: s.last_price, t: Date.parse(s.last_price_at || 0) || null };
  return q ? { p: q.p, t: q.t } : null;
}

/* Money result of a position at price px, in the wallet currency */
export const pnlAt = (pos, px) => pos.notional * dirOf(pos.side) * (px - pos.entry) / pos.entry;
/* What happens at the stop-loss / take-profit (shown before the user confirms) */
export function outcome({ side, entry, amount, lev, sl, tp }) {
  const notional = amount * lev;
  const at = (px) => (px > 0 && entry > 0 ? notional * dirOf(side) * (px - entry) / entry : null);
  return { notional, atStop: sl > 0 ? Math.max(-amount, at(sl)) : null, atTarget: tp > 0 ? at(tp) : null };
}

/* Amount for a risk profile: lose `riskPct` of the balance when the stop is hit */
export function amountForRisk(w, { entry, sl, lev, riskPct }) {
  if (!(entry > 0 && sl > 0) || entry === sl) return null;
  const stopDist = Math.abs(entry - sl) / entry;
  return Math.round((w.balance * riskPct / 100) / (stopDist * lev));
}

export function summary(data) {
  const w = get();
  let used = 0, open = 0;
  const rows = w.positions.map((pos) => {
    const q = priceOf(pos.sym, data);
    const px = q ? q.p : pos.entry;
    const pnl = Math.max(-pos.margin, pnlAt(pos, px)); // never lose more than the money put in
    used += pos.margin; open += pnl;
    /* % = result on the money put in (includes leverage), same as the money figure */
    return { ...pos, px, pnl, pnlPct: (pnl / pos.margin) * 100, live: !!q };
  });
  const equity = w.balance + open;
  const today = new Date().toDateString();
  if (w.day !== today) { w.day = today; w.dayEquity = equity; save(w); }
  return { w, rows, balance: w.balance, equity, open, used, free: equity - used, today: equity - (w.dayEquity ?? equity), total: equity - w.start };
}

export function open(data, { sym, name = '', side, amount, lev = 1, sl = null, tp = null, sigId = null }) {
  const w = get();
  const q = priceOf(sym, data);
  if (!q || !(q.p > 0)) return { ok: false, reason: 'noPrice' };
  const L = Math.max(CONFIG.CALC.LEVERAGE_MIN, Math.min(CONFIG.CALC.LEVERAGE_MAX, Math.round(lev)));
  const s = summary(data);
  if (!(amount > 0)) return { ok: false, reason: 'amount' };
  if (amount > s.free + 0.01) return { ok: false, reason: 'free' };
  const dir = dirOf(side);
  /* a stop on the wrong side would close the trade at once -> refuse */
  if (sl > 0 && dir * (q.p - sl) <= 0) return { ok: false, reason: 'sl' };
  if (tp > 0 && dir * (tp - q.p) <= 0) return { ok: false, reason: 'tp' };
  const pos = { id: `w${w.seq++}`, sym, name, side, entry: q.p, entryT: q.t || Date.now(), lev: L, margin: amount, notional: amount * L, sl: sl > 0 ? sl : null, tp: tp > 0 ? tp : null, openedAt: Date.now(), sigId };
  w.positions.push(pos);
  save(w);
  /* journal: never overwrite the user's own entry (only a fresh one, or one this wallet wrote) */
  const j = sigId ? D.journal()[sigId] : null;
  if (sigId && (!j || j.wallet)) D.setJournal(sigId, { state: 'in', entry: q.p, size: pos.notional, ccy: w.ccy, wallet: pos.id });
  return { ok: true, pos };
}

function closeIn(w, pos, px, why) {
  const pnl = pnlAt(pos, px);
  const loss = Math.max(-pos.margin, pnl); // never lose more than the money put in
  w.balance += loss;
  w.positions = w.positions.filter((x) => x.id !== pos.id);
  const rec = { ...pos, exit: px, pnl: loss, pnlPct: (loss / pos.margin) * 100, closedAt: Date.now(), why };
  w.closed.unshift(rec);
  w.closed = w.closed.slice(0, 200);
  const j = pos.sigId ? D.journal()[pos.sigId] : null;
  if (j && j.wallet === pos.id) {
    D.setJournal(pos.sigId, { ...(j || {}), state: 'closed', entry: pos.entry, exit: px, closedAt: Date.now(), size: pos.notional, ccy: w.ccy, wallet: pos.id });
  }
  return rec;
}

export function close(data, id) {
  const w = get();
  const pos = w.positions.find((x) => x.id === id);
  if (!pos) return null;
  const q = priceOf(pos.sym, data);
  const rec = closeIn(w, pos, q ? q.p : pos.entry, 'manual');
  save(w);
  return rec;
}

/* The signal behind a position; an intraday preview (id >= 900000) is replaced by its official twin after 22:45 */
function signalOf(data, pos) {
  const s = D.findSignal(data, pos.sigId);
  if (s) return s;
  const m = /^(.+)-(\d+)$/.exec(pos.sigId || '');
  if (!m || +m[2] < 900000) return null;
  const all = D.allOpen(data).concat(data?.history?.signals || []);
  const twin = all.find((x) => x.id.startsWith(m[1] + '-') && +x.id.split('-').pop() < 900000);
  if (twin) pos.sigId = twin.id;
  return twin || null;
}

/* Called on every live tick and every data refresh. Returns the positions closed automatically. */
export function check(data) {
  const w = store.get(KEY, null);
  if (!w || !w.positions?.length) return [];
  const done = [];
  [...w.positions].forEach((pos) => {
    const dir = dirOf(pos.side);
    const sig = pos.sigId ? signalOf(data, pos) : null;
    const q = priceOf(pos.sym, data);
    /* only a price newer than the one the position was opened at may close it */
    if (q && q.t && q.t > (pos.entryT || pos.openedAt)) {
      /* gap through the stop: exit at the (worse) market price, not at the stop level */
      if (pos.sl && dir * (q.p - pos.sl) <= 0) { done.push(closeIn(w, pos, dir > 0 ? Math.min(q.p, pos.sl) : Math.max(q.p, pos.sl), 'sl')); return; }
      if (pnlAt(pos, q.p) <= -pos.margin) { done.push(closeIn(w, pos, q.p, 'out')); return; }
      if (pos.tp && dir * (pos.tp - q.p) <= 0) { done.push(closeIn(w, pos, pos.tp, 'tp')); return; }
    }
    /* the signal behind it closed (target, stop or time) -> close at the signal's exit price */
    /* only a close confirmed by the robot's data (not a single live tick seen in this app) */
    if (sig && (sig.status !== 'open' || (sig.intraday_hit && !sig.live_hit)) && (sig.closed_at ? Date.parse(sig.closed_at) : Date.parse(sig.hit_at || 0)) >= pos.openedAt - 60000) {
      const px = D.exitPrice(sig);
      if (px > 0) done.push(closeIn(w, pos, px, sig.status === 'target' || sig.intraday_hit === 'target' ? 'tp' : sig.status === 'stop' || sig.intraday_hit === 'stop' ? 'sl' : 'signal'));
    }
  });
  if (done.length) save(w);
  return done;
}

/* Symbols the terminal wants live prices for (positions + the chosen symbol) */
export function watched() {
  const w = store.get(KEY, null);
  const syms = new Set((w?.positions || []).map((p) => p.sym));
  const cur = store.get('termSym', null);
  if (cur) syms.add(cur);
  return [...syms];
}
