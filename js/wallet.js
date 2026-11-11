// Obchodní platforma – the user's own fictional demo account (1.6.0).
// Fictional money only, stored on this device (store.js = localStorage with in-memory fallback).
// Nothing is sent anywhere and nothing is traded for real.
// Positions are tracked with the live prices of live.js and closed automatically on stop-loss / take-profit,
// or when the signal they were opened from closes. Each trade opened from a signal is also written to
// "Můj deník" (D.setJournal) so the journal and the terminal tell the same story.
// 1.8.0: pending LIMIT orders (w.orders). The money is reserved while an order waits (Volná marže goes down).
// A buy limit fills when the price is at or below the limit, a sell limit at or above; it fills AT the limit price.
// The price path since the order was placed is checked too (5-min price_path of the signal, ticks seen in this
// session, the current quote), so an order can fill while the app was closed (flag `reopen` on the fill).
// Every order step is logged in w.olog (placed / filled / cancelled / expired) - the "Co se děje" feed reads it.
import { CONFIG } from '../config.js';
import * as store from './store.js';
import * as D from './domain.js';
import * as Live from './live.js';

const KEY = 'wallet';
export const START = { CZK: 100000, EUR: 4000, USD: 4500 };

function fresh(ccy) {
  const c = ['CZK', 'EUR', 'USD'].includes(ccy) ? ccy : 'CZK';
  return { v: 1, ccy: c, start: START[c], balance: START[c], positions: [], closed: [], orders: [], ordEnded: [], olog: [], createdAt: Date.now(), day: null, dayEquity: null, seq: 1 };
}

function norm(w) {
  if (!Array.isArray(w.orders)) w.orders = [];      // wallets from 1.6/1.7 have no orders yet
  if (!Array.isArray(w.ordEnded)) w.ordEnded = [];
  if (!Array.isArray(w.olog)) w.olog = [];
  return w;
}

export function get() {
  let w = store.get(KEY, null);
  if (!w || w.v !== 1) { w = fresh(D.calcState().ccy); store.set(KEY, w); }
  return norm(w);
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
  const reserved = w.orders.reduce((a, o) => a + o.amount, 0); // money waiting in pending limit orders
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
  return { w, rows, balance: w.balance, equity, open, used, reserved, free: equity - used - reserved, today: equity - (w.dayEquity ?? equity), total: equity - w.start };
}

/* SL / TP must be on the right side of the price the trade starts at (null = fine, else the error code) */
function levelsBad(side, px, sl, tp) {
  const dir = dirOf(side);
  if (sl > 0 && dir * (px - sl) <= 0) return 'sl';
  if (tp > 0 && dir * (tp - px) <= 0) return 'tp';
  return null;
}
const clampLev = (lev) => Math.max(CONFIG.CALC.LEVERAGE_MIN, Math.min(CONFIG.CALC.LEVERAGE_MAX, Math.round(lev)));

/* The position itself (shared by "Hned" and a filled limit order) */
function addPos(w, { sym, name, side, entry, entryT, lev, amount, sl, tp, sigId, order = null }) {
  const pos = { id: `w${w.seq++}`, sym, name, side, entry, entryT, lev, margin: amount, notional: amount * lev, sl: sl > 0 ? sl : null, tp: tp > 0 ? tp : null, openedAt: Date.now(), sigId };
  if (order) pos.order = order;
  w.positions.push(pos);
  /* journal: never overwrite the user's own entry (only a fresh one, or one this wallet wrote) */
  const j = sigId ? D.journal()[sigId] : null;
  if (sigId && (!j || j.wallet)) D.setJournal(sigId, { state: 'in', entry, size: pos.notional, ccy: w.ccy, wallet: pos.id });
  return pos;
}

export function open(data, { sym, name = '', side, amount, lev = 1, sl = null, tp = null, sigId = null }) {
  const w = get();
  const q = priceOf(sym, data);
  if (!q || !(q.p > 0)) return { ok: false, reason: 'noPrice' };
  const s = summary(data);
  if (!(amount > 0)) return { ok: false, reason: 'amount' };
  if (amount > s.free + 0.01) return { ok: false, reason: 'free' };
  /* a stop on the wrong side would close the trade at once -> refuse */
  const bad = levelsBad(side, q.p, sl, tp);
  if (bad) return { ok: false, reason: bad };
  const pos = addPos(w, { sym, name, side, entry: q.p, entryT: q.t || Date.now(), lev: clampLev(lev), amount, sl, tp, sigId });
  save(w);
  return { ok: true, pos };
}

/* ---------- Limit orders (1.8.0) ---------- */
export const ORDER_MAX_DAYS = 30;

/* 16:00 New York time on the NY day of `ms`, or the next weekday when that close has passed / it is a weekend.
   US holidays are not modelled (same as Live.marketOpen). */
export function nyCloseAfter(ms) {
  const parts = (x) => {
    const o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false })
      .formatToParts(new Date(x)).forEach((p) => { o[p.type] = p.value; });
    return o;
  };
  const at16 = (y, m, d) => { // NY 16:00 of y-m-d in UTC ms, via the NY offset at that moment
    const guess = Date.UTC(y, m - 1, d, 16, 0);
    const p = parts(guess);
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    return guess - (wall - guess);
  };
  const p = parts(ms);
  let y = +p.year, m = +p.month, d = +p.day;
  for (let i = 0; i < 8; i++) {
    const c = at16(y, m, d);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd >= 1 && wd <= 5 && c > ms) return c;
    const n = new Date(Date.UTC(y, m - 1, d + 1)); y = n.getUTCFullYear(); m = n.getUTCMonth() + 1; d = n.getUTCDate();
  }
  return ms + 86400000;
}

/* When an order with this validity runs out (ms): day = today's US close, gtc = 30 days, sig = the signal's last day */
export function expiryFor(valid, sig, now = Date.now()) {
  const max = now + ORDER_MAX_DAYS * 86400000;
  if (valid === 'day') return nyCloseAfter(now);
  if (valid === 'sig' && sig?.exit_date) {
    const [y, m, d] = sig.exit_date.split('-').map(Number);
    return Math.min(max, nyCloseAfter(Date.UTC(y, m - 1, d, 12)));
  }
  return max;
}

/* true = an order at this limit fills at this price (buy limit: price at/below the limit, sell limit: at/above) */
export const marketable = (side, limit, px) => (side === 'SELL' ? px >= limit : px <= limit);

function logOrder(w, k, o, extra = {}) {
  w.olog.unshift({ id: `${o.id}:${k}:${Date.now()}`, k, oid: o.id, sym: o.sym, side: o.side, limit: o.limit, amount: o.amount, sigId: o.sigId || null, at: Date.now(), ...extra });
  w.olog = w.olog.slice(0, 200);
}

export function placeOrder(data, { sym, name = '', side, limit, amount, lev = 1, sl = null, tp = null, sigId = null, valid = 'gtc', sig = null }) {
  const w = get();
  const q = priceOf(sym, data);
  if (!q || !(q.p > 0)) return { ok: false, reason: 'noPrice' };
  if (!(limit > 0)) return { ok: false, reason: 'limit' };
  /* a limit the price already passed would fill at once -> "Hned" is the right order type */
  if (marketable(side, limit, q.p)) return { ok: false, reason: side === 'SELL' ? 'limitNowSell' : 'limitNowBuy' };
  if (!(amount > 0)) return { ok: false, reason: 'amount' };
  const s = summary(data);
  if (amount > s.free + 0.01) return { ok: false, reason: 'free' };
  const bad = levelsBad(side, limit, sl, tp);
  if (bad) return { ok: false, reason: bad };
  const now = Date.now();
  const v = valid === 'sig' && !sigId ? 'gtc' : valid;
  const o = { id: `o${w.seq++}`, sym, name, side, limit: +limit, amount, lev: clampLev(lev), sl: sl > 0 ? sl : null, tp: tp > 0 ? tp : null, sigId, valid: v, placedAt: now, pxAt: q.p, expiresAt: expiryFor(v, sig, now) };
  w.orders.push(o);
  logOrder(w, 'placed', o);
  save(w);
  return { ok: true, order: o };
}

function endOrder(w, o, end, extra = {}) {
  w.orders = w.orders.filter((x) => x.id !== o.id);
  w.ordEnded.unshift({ ...o, end, endAt: Date.now(), ...extra });
  w.ordEnded = w.ordEnded.slice(0, 100);
  logOrder(w, end, o, extra);
}

export function cancelOrder(id) {
  const w = get();
  const o = w.orders.find((x) => x.id === id);
  if (!o) return null;
  endOrder(w, o, 'cancelled');
  save(w);
  return o;
}

/* New limit for a pending order (same rules as when placing it) */
export function editOrder(data, id, limit) {
  const w = get();
  const o = w.orders.find((x) => x.id === id);
  if (!o) return { ok: false, reason: 'gone' };
  if (!(limit > 0)) return { ok: false, reason: 'limit' };
  const q = priceOf(o.sym, data);
  if (q && marketable(o.side, limit, q.p)) return { ok: false, reason: o.side === 'SELL' ? 'limitNowSell' : 'limitNowBuy' };
  const bad = levelsBad(o.side, limit, o.sl, o.tp);
  if (bad) return { ok: false, reason: bad };
  o.limit = +limit;
  o.editedAt = Date.now(); // only prices after the change may fill it
  save(w);
  return { ok: true, order: o };
}

/* Prices seen since `from`: the signal's 5-min path + live ticks of this session + the current quote */
function pricesSince(data, sym, from) {
  const pts = [];
  D.allOpen(data).concat(data?.history?.signals || []).filter((x) => x.symbol === sym).forEach((s) => (s.price_path || []).forEach((p) => {
    const ts = Date.parse(p.t); if (ts > from && p.p > 0) pts.push({ t: ts, p: +p.p, src: p.live ? 'live' : 'path' });
  }));
  Live.history(sym).forEach((p) => { const ts = Date.parse(p.t); if (ts > from && p.p > 0) pts.push({ t: ts, p: +p.p, src: 'live' }); });
  const q = priceOf(sym, data);
  if (q && q.t > from) pts.push({ t: q.t, p: q.p, src: 'live' });
  return pts.sort((a, b) => a.t - b.t);
}

const SESSION_START = Date.now(); // a fill at a price older than this happened while the app was closed

/* Called with every wallet check: fills first, then expiry. Returns { filled: [position + reopen], expired: [order] } */
export function checkOrders(data) {
  if (!store.get(KEY, null)?.orders?.length) return { filled: [], expired: [] };
  const w = get();
  const filled = [], expired = [];
  const now = Date.now();
  [...w.orders].forEach((o) => {
    const from = Math.max(o.placedAt, o.editedAt || 0);
    const sig = o.sigId ? D.findSignal(data, o.sigId) : null;
    /* "do konce signálu": the signal ended (target, stop, time) -> the order ends with it */
    const sigEnd = o.valid === 'sig' && sig && (sig.status !== 'open' || sig.intraday_hit) ? (Date.parse(sig.closed_at || sig.hit_at || 0) || now) : null;
    const until = Math.min(o.expiresAt, sigEnd ?? Infinity);
    const hit = pricesSince(data, o.sym, from).find((p) => p.t <= until && marketable(o.side, o.limit, p.p));
    if (hit) {
      const reopen = hit.t < SESSION_START;
      const pos = addPos(w, { sym: o.sym, name: o.name, side: o.side, entry: o.limit, entryT: hit.t, lev: o.lev, amount: o.amount, sl: o.sl, tp: o.tp, sigId: o.sigId, order: o.id });
      endOrder(w, o, 'filled', { fillT: hit.t, fillPx: hit.p, src: hit.src, reopen, pos: pos.id });
      filled.push({ ...pos, reopen, fillT: hit.t });
      return;
    }
    if (now >= until) { endOrder(w, o, 'expired', { why: sigEnd != null && sigEnd < o.expiresAt ? 'sig' : o.valid }); expired.push(o); }
  });
  if (filled.length || expired.length) save(w);
  return { filled, expired };
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
  const syms = new Set((w?.positions || []).concat(w?.orders || []).map((p) => p.sym));
  const cur = store.get('termSym', null);
  if (cur) syms.add(cur);
  return [...syms];
}
