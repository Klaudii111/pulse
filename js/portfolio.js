// 1.15.0 Portfolio – the numbers (no HTML). ONE place for everything Portfolio, the trade detail, Dnes, Peněženka and
// Obchodovat show about my trades, so the screens can never disagree:
//   head(sm)            account value, today, total since the first top-up, free / in play / open  (from W.summary)
//   facts(row, sm)      one trade: value now, result, today, fees, what happens at the stop / target, distances, source
//   history(data, r)    the account-value curve for Dnes / Týden / Měsíc / Vše, rebuilt from REAL prices (/api/bars)
//                       + the wallet's own rows (money rows, closed trades) + the daily snapshots (w.eqd) – never invented
//   reasons(id)         /data/duvody.json ("Proč zainvestovat", shadow) – optional, guarded
import * as W from './wallet.js';
import * as D from './domain.js';
import * as Bars from './bars.js';
import * as Live from './live.js';
import * as M from './market.js';
import * as store from './store.js';

const dirOf = (side) => (side === 'SELL' ? -1 : 1);
const HZ = ['MESIC', 'TYDEN', 'DNY', 'DEN'];
const twin = (id) => String(id || '').replace(/-\d+$/, '');

/* ---------- the header (Portfolio, Dnes) ---------- */
export function head(sm) {
  const p = W.parts(sm);
  /* today in % of the value the day started with (the same formula Dnes used since 1.13) */
  const todayPct = sm.today / Math.max(1, sm.equity - sm.today) * 100;
  return { eq: p.eq, free: p.free, inPlay: p.inPlay, open: p.open, today: sm.today, todayPct, total: sm.total, totalPct: sm.totalPct, putIn: sm.putIn,
    n: sm.rows.length, nOrd: (sm.w.orders || []).length, ccy: sm.w.ccy };
}

/* where a trade came from: a robot signal (horizon), the robot-for-me switch, or my own trade */
export function sourceOf(p, w = null) {
  const h = String(p.sigId || '').split('-')[0];
  const hz = HZ.includes(h) ? h : null;
  /* the robot-for-me: an instant copy carries `auto`; a copy that waited as an order is known by its log row (autoLim) */
  if (p.auto || (p.order && (w?.olog || []).some((x) => x.k === 'autoLim' && x.oid === p.order))) return { kind: 'auto', hz };
  if (p.sigId) return { kind: 'signal', hz };
  return { kind: 'own', hz: null };
}

/* result if the trade ended at price px (mid): the wallet's own rules (spread, conversion fee, never below -deposit) */
function resultAt(p, px, w, exact = false) {
  if (!(px > 0)) return null;
  const raw = exact ? p.notional * dirOf(p.side) * (px - p.entry) / p.entry : W.pnlAt(p, px);
  const fee = p.ccy && w && p.ccy !== w.ccy ? Math.abs(raw) * M.CONV_FEE : 0;
  return Math.max(-p.margin, raw - fee);
}

/* ---------- one trade (row = a W.summary() row, or a closed record) ---------- */
export function facts(row, sm, now = Date.now()) {
  const w = sm.w;
  const closed = row.closedAt != null;
  const px = closed ? row.mid ?? row.exit : row.px;
  const pnl = row.pnl;
  const value = row.margin + pnl;
  /* 1.15.0 (B2): real units = size (wallet currency) / (entry price x rate of the instrument currency to the wallet currency);
     no trustworthy rate -> no units (null) */
  const fx = W.unitRate(row.ccy || M.ccy(row.sym), w.ccy);
  const qty = row.entry > 0 && fx > 0 ? row.notional / (row.entry * fx) : null;
  const spread = row.entry > 0 ? row.notional * 2 * (row.half || 0) / row.entry : 0; // paid in (ask) + out (bid)
  const swap = row.swap || 0;
  const conv = row.ccy && row.ccy !== w.ccy;
  /* at the stop the wallet closes exactly at the stop price; at the target at the target price (minus half a spread) */
  const atStop = row.sl > 0 ? resultAt(row, row.sl, w, true) : null;
  const atTarget = row.tp > 0 ? resultAt(row, row.tp, w) : null;
  const dist = (lvl) => (lvl > 0 && px > 0 ? Math.abs(lvl - px) / px * 100 : null);
  /* 1.15.0 (B3): with leverage the trade ends where the whole deposit is gone (W.endLevel = the wallet's own close rule) –
     when that level comes before the stop (or there is no stop), it is the real lower end: distances and the way use it */
  const lvEnd = closed ? null : W.endLevel(row);
  const endFirst = lvEnd != null && lvEnd > 0 && (!(row.sl > 0) || dirOf(row.side) * (lvEnd - row.sl) > 0);
  const endPx = endFirst ? lvEnd : null;
  const low = endPx ?? (row.sl > 0 ? row.sl : null);
  /* the way from the stop (or the leverage end) to the target, where the price is now (0 = stop, 1 = target) */
  const way = low > 0 && row.tp > 0 && px > 0 ? Math.max(0, Math.min(1, (px - low) / (row.tp - low))) : null;
  const entryWay = low > 0 && row.tp > 0 ? Math.max(0, Math.min(1, (row.entry - low) / (row.tp - low))) : null;
  const held = (closed ? row.closedAt : now) - (row.openedAt || now);
  return { closed, px, pnl, pnlPct: row.pnlPct, today: closed ? null : row.today ?? null, value, qty, fx, fxFrom: row.ccy || M.ccy(row.sym), spread, swap, conv,
    atStop, atTarget, toStop: dist(row.sl), toTarget: dist(row.tp), way, entryWay, endPx, atEnd: endPx != null ? -row.margin : null, toEnd: dist(endPx), low, held, src: sourceOf(row, w) };
}

/* the trade by id: open (with the live numbers of W.summary) or closed (read-only); null when it is gone */
export function find(data, id) {
  const sm = W.summary(data);
  const row = sm.rows.find((x) => x.id === id);
  if (row) return { sm, row, open: true };
  const c = (sm.w.closed || []).find((x) => x.id === id);
  if (c) return { sm, row: c, open: false };
  const o = (sm.w.orders || []).find((x) => x.id === id);
  if (o) return { sm, row: o, order: true };
  /* an order that has filled meanwhile -> its trade */
  const f = (sm.w.ordEnded || []).find((x) => x.id === id && x.end === 'filled' && x.pos);
  if (f) return find(data, f.pos);
  return null;
}

/* ---------- the account-value curve ---------- */
export const RANGES = [
  { id: 'd', tf: '1D', step: 5 * 60000 },
  { id: 'w', tf: '5D', step: 15 * 60000 },
  { id: 'm', tf: '1M', step: 3600000 },
  { id: 'a', tf: '1R', step: 86400000 },
];
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return +d; };
export function rangeFrom(id, w, now = Date.now()) {
  const made = w.createdAt || now;
  const nominal = id === 'd' ? dayStart(now) : id === 'w' ? now - 7 * 86400000 : id === 'm' ? now - 30 * 86400000 : made;
  return { from: Math.max(nominal, made), short: made > nominal, made };
}

/* price of sym at time t from its bars (the last candle that started at or before t) */
function priceAt(bars, t) {
  let lo = 0, hi = bars.length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].t <= t) { best = m; lo = m + 1; } else hi = m - 1; }
  return best >= 0 ? bars[best].c : null;
}

/* equity at t = start + money rows + closed results (all up to t) + the open result of trades open at t */
function equityAt(t, w, trades, bars, miss) {
  let v = w.start;
  (w.cash || []).forEach((c) => { if ((c.at || 0) <= t) v += c.amount; });
  trades.forEach((p) => {
    if (p.closedAt != null && p.closedAt <= t) { v += p.pnl; return; }
    if ((p.openedAt || 0) > t) return;
    const b = bars[p.sym];
    let px = b ? priceAt(b, t) : null;
    if (!(px > 0)) { px = p.mid || p.entry; miss.add(p.sym); }
    v += Math.max(-p.margin, W.pnlAt(p, px));
  });
  return v;
}

/* async: { pts: [{t, v}], from, short, approx, missing: [sym], change, changePct } – the last point is the header's number */
export async function history(data, rangeId) {
  const sm = W.summary(data);
  const w = sm.w;
  const R = RANGES.find((x) => x.id === rangeId) || RANGES[0];
  const now = Date.now();
  const { from, short, made } = rangeFrom(R.id, w, now);
  const trades = (w.positions || []).concat(w.closed || []).filter((p) => (p.openedAt || 0) < now && (p.closedAt == null || p.closedAt > from));
  const syms = [...new Set(trades.filter((p) => p.closedAt == null || p.closedAt > from).map((p) => p.sym))];
  const bars = {};
  await Promise.all(syms.map(async (k) => {
    try {
      let d = await Bars.fetchBars(k, R.tf);
      let b = d && !d.retry && d.bars?.length ? d.bars : null;
      /* the 1-day bars of a market that opened after midnight (or a closed one) do not reach back to the range start:
         the 5-day bars fill the beginning (real prices, never a guess) */
      if (R.id === 'd' && (!b || b[0].t > from)) {
        const d5 = await Bars.fetchBars(k, '5D');
        const b5 = d5 && !d5.retry && d5.bars?.length ? d5.bars : null;
        if (b5) b = b ? b5.filter((x) => x.t < b[0].t).concat(b) : b5;
      }
      if (b) bars[k] = b;
      /* a held market without any price on this device yet (not streamed, closed market): its last real close becomes the
         price, with that candle's time (the stamp says how old it is) – never the entry price posing as "now" */
      if (b && !Live.quote(k)) { const lb = b[b.length - 1]; Live.offer(k, lb.c, lb.t); }
    } catch { /* missing -> flat at the entry, flagged */ }
  }));
  const miss = new Set();
  const n = Math.min(400, Math.max(2, Math.ceil((now - from) / R.step)));
  const step = Math.max(R.step, (now - from) / n);
  const pts = [];
  if (R.id === 'a') {
    /* Vše: one point per day – the stored snapshot of that day when there is one (real value seen in the app), else rebuilt */
    const eqd = w.eqd && typeof w.eqd === 'object' ? w.eqd : {};
    /* calendar days (a daylight-saving day has 23 / 25 h) */
    for (let d = dayStart(from); d < dayStart(now); d = (() => { const x = new Date(d); x.setDate(x.getDate() + 1); return +x; })()) {
      const nx = new Date(d); nx.setDate(nx.getDate() + 1);
      const end = Math.max(from, Math.min(now, +nx - 1));
      const k = W.dayKey(d);
      pts.push({ t: end, v: eqd[k] && Number.isFinite(+eqd[k].eq) ? +eqd[k].eq : equityAt(end, w, trades, bars, miss), snap: !!eqd[k] });
    }
    if (!pts.length || pts[0].t > from) pts.unshift({ t: from, v: equityAt(from, w, trades, bars, miss) });
  } else {
    for (let t = from; t < now - step / 2; t += step) pts.push({ t, v: equityAt(t, w, trades, bars, miss) });
  }
  pts.push({ t: now, v: sm.equity, now: true });
  /* money loaded / withdrawn inside the range is not a gain: the change is measured without it */
  const flows = (w.cash || []).filter((c) => (c.k === 'dep' || c.k === 'wd') && c.at > pts[0].t && c.at <= now).reduce((a, c) => a + c.amount, 0);
  const change = pts[pts.length - 1].v - pts[0].v - flows;
  const base = pts[0].v || 1;
  /* trades bought from 'from' on were open without bars only when a symbol has none at all */
  return { pts, from, short, made, approx: miss.size > 0, missing: [...miss], change, changePct: change / base * 100, range: R.id };
}

/* today's high / low of an instrument (the newest session in the 1D bars) – async */
export async function dayRange(sym) {
  const d = await Bars.fetchBars(sym, '1D').catch(() => null);
  if (!d || d.retry || !d.bars?.length) return null;
  const last = d.bars[d.bars.length - 1];
  const day = dayStart(last.t);
  const bs = d.bars.filter((b) => b.t >= day);
  const q = Live.quote(sym);
  let lo = Math.min(...bs.map((b) => b.l)), hi = Math.max(...bs.map((b) => b.h));
  if (q && q.p > 0 && q.t >= day) { lo = Math.min(lo, q.p); hi = Math.max(hi, q.p); }
  return { lo, hi, day, today: day === dayStart(Date.now()), open: bs[0]?.o ?? null };
}

/* sparkline values of the instrument's newest session (1D bars + the live price) – async, cached by bars.js */
export async function spark(sym) {
  const d = await Bars.fetchBars(sym, '1D').catch(() => null);
  if (!d || d.retry || !d.bars?.length) return null;
  const last = d.bars[d.bars.length - 1];
  const day = dayStart(last.t);
  const vals = d.bars.filter((b) => b.t >= day).map((b) => b.c);
  if (!Live.quote(sym)) Live.offer(sym, last.c, last.t);
  const q = Live.quote(sym);
  if (q && q.p > 0 && q.t > last.t) vals.push(q.p);
  return vals.length >= 3 ? vals : null;
}

/* ---------- "Proč zainvestovat" (/data/duvody.json, shadow) – optional; a missing file = no section ---------- */
let rs = null, rsAt = 0, rsLoading = null;
export function loadReasons() {
  if (rs !== null && Date.now() - rsAt < 10 * 60000) return Promise.resolve(rs);
  if (rsLoading) return rsLoading;
  rsLoading = fetch('./data/duvody.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((j) => { rs = j && typeof j === 'object' && j.signals && typeof j.signals === 'object' ? j : false; rsAt = Date.now(); rsLoading = null; return rs; });
  return rsLoading;
}
/* 1.15.1: company reasons (results / earnings E_*, profits F_*) only for shares – a fund, an index or a currency has no
   earnings ("Žádné výsledky v příštích 5 dnech" on XLE was misleading) */
const symOfId = (id) => { const p = String(id || '').split('-'); return p.length >= 3 ? p[p.length - 2] : ''; };
function fits(id) { const sym = symOfId(id); const c = sym ? M.cls(sym) : 'stock'; return (x) => c === 'stock' || !/^(E|F)_/.test(String(x?.klic || '')); }
/* the fulfilled reasons of one signal: [{ name, why }] (cs / en), or null */
export function reasonsFor(id, lang = 'cs') {
  if (!rs || !id) return null;
  const sig = rs.signals[id] || Object.entries(rs.signals).find(([k]) => twin(k) === twin(id))?.[1];
  if (!sig || !Array.isArray(sig.duvody)) return null;
  const en = lang === 'en';
  const ok = sig.duvody.filter(fits(id)).filter((x) => x && x.splneno === true).map((x) => ({ name: (en ? x.nazev_en : x.nazev_cs) || x.nazev_cs || x.klic || '', why: (en ? x.vysvetleni_en : x.vysvetleni_cs) || '' })).filter((x) => x.name);
  return ok.length ? ok : null;
}

/* 1.15.0 signal detail: the fulfilled AND the not-yet-fulfilled reasons ({ ok, no } each [{ name, why }]), or null.
   Never a count or a score (the owner: the number of reasons does not predict the result). */
export function reasonsSplit(id, lang = 'cs') {
  if (!rs || !id) return null;
  const sig = rs.signals[id] || Object.entries(rs.signals).find(([k]) => twin(k) === twin(id))?.[1];
  if (!sig || !Array.isArray(sig.duvody)) return null;
  const en = lang === 'en';
  const one = (x) => ({ name: (en ? x.nazev_en : x.nazev_cs) || x.nazev_cs || x.klic || '', why: (en ? x.vysvetleni_en : x.vysvetleni_cs) || '' });
  const f = fits(id);
  const ok = sig.duvody.filter(f).filter((x) => x && x.splneno === true).map(one).filter((x) => x.name);
  const no = sig.duvody.filter(f).filter((x) => x && x.splneno === false).map(one).filter((x) => x.name);
  return ok.length ? { ok, no } : null;
}

/* the signal behind a trade (an intraday preview id is matched to its official twin) */
export function signalOf(data, p) {
  if (!p?.sigId) return null;
  const s = D.findSignal(data, p.sigId);
  if (s) return s;
  const all = D.allOpen(data).concat(data?.history?.signals || []);
  return all.find((x) => twin(x.id) === twin(p.sigId)) || null;
}

/* the robot's own trade of that signal (paper.json): 'holds' | 'closed' | null */
export function robotState(data, p) {
  if (!p?.sigId) return null;
  const pa = data?.paper;
  if (!pa) return null;
  const hit = (x) => x && x.signal_id && (x.signal_id === p.sigId || twin(x.signal_id) === twin(p.sigId));
  const pos = (pa.positions || []).find(hit);
  if (pos) return { k: 'holds', x: pos };
  const cl = (pa.closed || []).find(hit);
  if (cl) return { k: 'closed', x: cl };
  return null;
}

/* 1.15.0 "the robot left - leave too?": my open trades whose robot trade (paper.json closed[]) has already ended, newest first.
   Used by Dnes (a to-do card) and the trade page (a block with "Ukončit taky"). { pos, at (ms), exit (price | null), pnlPct (robot's result in % | null) } */
export function robotExits(data, w = W.get()) {
  const out = [];
  ((w && w.positions) || []).forEach((pos) => {
    const rb = robotState(data, pos);
    if (!rb || rb.k !== 'closed') return;
    const at = Date.parse(rb.x.closed_at || 0);
    out.push({ pos, at: Number.isFinite(at) ? at : 0, exit: +rb.x.exit > 0 ? +rb.x.exit : null, pnlPct: rb.x.pnl_pct != null && Number.isFinite(+rb.x.pnl_pct) ? +rb.x.pnl_pct : null });
  });
  return out.sort((a, b) => b.at - a.at);
}
/* "Nechat běžet": the client decided to keep such a trade - remembered per trade id (synced with the account) */
export const isFollowOff = (id) => (store.get('followOff', []) || []).includes(id);
export function followOff(id) { const a = (store.get('followOff', []) || []).filter((x) => x !== id); a.push(id); store.set('followOff', a.slice(-200)); }

/* the timeline of one trade: bought (order placed / filled), fees, my stop / target changes, robot + signal events, the end */
export function timeline(data, p, w) {
  const ev = [];
  const ordId = p.order;
  const o = ordId ? (w.ordEnded || []).find((x) => x.id === ordId) : null;
  if (o) ev.push({ at: o.placedAt, k: 'placed', v: o.limit });
  ev.push({ at: p.openedAt, k: o ? 'filled' : 'bought', v: p.entry });
  (Array.isArray(p.log) ? p.log : []).forEach((x) => { if (x && x.k === 'edit') ev.push({ at: x.at, k: 'edit', sl: x.sl, tp: x.tp }); });
  (w.cash || []).filter((c) => c.k === 'swap' && c.pos === p.id).forEach((c) => ev.push({ at: c.at, k: 'swap', v: c.amount, n: c.n || 1 }));
  const s = signalOf(data, p);
  if (s) {
    if (s.created_at) ev.push({ at: Date.parse(s.created_at), k: 'sig', s });
    if (s.intraday_hit && s.hit_at) ev.push({ at: Date.parse(s.hit_at), k: `sigHit-${s.intraday_hit}` });
    else if (s.status && s.status !== 'open' && s.closed_at) ev.push({ at: Date.parse(s.closed_at), k: `sigEnd-${s.status}` });
  }
  const rb = robotState(data, p);
  if (rb) {
    const a = Date.parse(rb.x.filled_at || rb.x.opened_at || 0);
    if (a) ev.push({ at: a, k: 'robotIn' });
    if (rb.k === 'closed') { const b = Date.parse(rb.x.closed_at || 0); if (b) ev.push({ at: b, k: 'robotOut' }); }
  }
  if (p.closedAt != null) ev.push({ at: p.closedAt, k: 'closed', why: p.why, v: p.pnl });
  /* a time the data could not give (missing / unparsable) is left out, never shown as 1. 1. */
  const lo = Math.min(p.openedAt || Date.now(), w.createdAt || Date.now()) - 60 * 86400000;
  return ev.filter((e) => Number.isFinite(e.at) && e.at > lo).sort((a, b) => a.at - b.at);
}

/* store key for the chosen range of the account chart */
export const curRange = () => { const v = store.get('pfRange', 'd'); return RANGES.some((x) => x.id === v) ? v : 'd'; };
