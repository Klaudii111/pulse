// Domain logic: levels, proximity, calendar impact, journal, simulator.
import { CONFIG } from '../config.js';
import * as store from './store.js';
import * as F from './format.js';
import { LESSONS } from './lessons.js';
import { t, L } from './i18n/index.js';
import * as Live from './live.js';
import { nextUsOpen } from './views/signals.js';
import { priceOf, pnlAt, outcome, costs } from './wallet.js';

export const HORIZONS = ['DEN', 'DNY', 'TYDEN', 'MESIC'];

/* App clock (overridable for demos via ?now=ISO) */
let clockFn = () => new Date();
export const setClock = (fn) => { clockFn = fn; };
export const clock = () => clockFn();

export function allOpen(data) {
  const t = data?.signals?.tracks || {};
  return HORIZONS.flatMap((h) => t[h] || []);
}

export function findSignal(data, id) {
  return allOpen(data).find((s) => s.id === id) || (data?.history?.signals || []).find((s) => s.id === id) || null;
}

/* ---------- Academy progress ---------- */
export const lessonsDone = () => new Set(store.get('lessonsDone', []));
export function markLesson(id, done = true) {
  const s = lessonsDone();
  done ? s.add(id) : s.delete(id);
  store.set('lessonsDone', [...s]);
}

/* ---------- Levels ---------- */
export function testerMode(data) {
  return CONFIG.LEVELS_TESTER_BYPASS && data?.signals?.mode === 'paper' && store.get('tester', true);
}

export const levelName = (lv) => t(`level.${lv.id}`);

export function levelInfo(data, now = +clock()) {
  const done = lessonsDone();
  const weeks = (now - store.firstSeen()) / (7 * 86400000);
  const L = CONFIG.LEVELS;
  const firstN = (n) => LESSONS.slice(0, n).every((l) => done.has(l.id));
  const qualifies = (lv) => firstN(lv.lessons) && weeks >= lv.weeks;
  let idx = 0;
  L.forEach((lv, i) => { if (qualifies(lv)) idx = i; });
  const tester = testerMode(data);
  if (!CONFIG.LEVELS_ENABLED || tester) idx = L.length - 1;
  const level = L[idx];
  const next = L[idx + 1] || null;
  return {
    level, next, idx, tester, weeks,
    lessonsDone: done.size,
    progress: next ? {
      lessons: Math.min(next.lessons, LESSONS.slice(0, next.lessons).filter((l) => done.has(l.id)).length),
      lessonsNeed: next.lessons,
      weeks: Math.min(next.weeks, weeks),
      weeksNeed: next.weeks,
    } : null,
  };
}

export const horizonAllowed = (data, hz) => levelInfo(data).level.horizons.includes(hz);
export const levelMaxLeverage = (data) => levelInfo(data).level.max_leverage;

/* ---------- Proximity & hits ---------- */
export const proximityPct = () => store.get('proximityPct', CONFIG.PROXIMITY_PCT_DEFAULT);

export function proximity(s, th = proximityPct()) {
  if (s.last_price == null || s.intraday_hit || (s.status && s.status !== 'open')) return null;
  const toStop = Math.abs(s.last_price - s.stop) / s.last_price * 100;
  const toTarget = Math.abs(s.target - s.last_price) / s.last_price * 100;
  if (toTarget <= th && toTarget <= toStop) return { side: 'target', dist: toTarget };
  if (toStop <= th) return { side: 'stop', dist: toStop };
  return null;
}

/* Bot rule: DEN past exit date or any open signal whose exit date passed = time exit */
export function isTimeExit(s, now = clock()) {
  return (!s.intraday_hit) && (s.status === 'time_exit' || (s.status === 'open' && F.daysUntil(s.exit_date, now) < 0));
}

/* ---------- Calendar impact ---------- */
export function eventsFor(s, events = []) {
  const from = F.dayKey(clock());
  const to = s.exit_date;
  return events.filter((e) => e.date >= from && e.date <= to && (
    (e.type === 'earnings' && e.symbol === s.symbol) ||
    (e.type === 'macro' && e.importance >= 3 && s.asset_class !== 'stock')
  ));
}

export function eventShort(e) {
  const title = L(e.title).replace(/\s*\(.*\)$/, '').replace(/ – .*$/, '');
  const last = title.split(' ').slice(-1)[0];
  const label = e.type === 'earnings' ? t('cal.earningsShort') : last.length <= 4 ? last : title;
  return `${label} ${F.dm(e.date)}`;
}

/* ---------- Journal (Můj deník) ---------- */
export const journal = () => store.get('journal', {});
export function setJournal(id, entry) {
  store.update('journal', (j) => {
    const n = { ...(j || {}) };
    if (entry == null) delete n[id]; else n[id] = { ...entry, at: Date.now() };
    return n;
  }, {});
}

/* An intraday preview signal (id number >= 900000) is replaced by the official signal of the same horizon,
   day and symbol after the 22:45 run: move the user's journal entry to it so "I am in" is not lost. */
export function migratePreviewJournal(data) {
  const j = journal();
  const ids = new Set(allOpen(data).map((s) => s.id).concat((data?.history?.signals || []).map((s) => s.id)));
  const all = allOpen(data).concat(data?.history?.signals || []);
  let moved = 0;
  Object.keys(j).forEach((id) => {
    const m = /^(.+)-(\d+)$/.exec(id);
    if (!m || +m[2] < 900000 || ids.has(id)) return;
    const twin = all.find((s) => s.id.startsWith(m[1] + '-') && +s.id.split('-').pop() < 900000);
    if (twin && !j[twin.id]) { setJournal(twin.id, j[id]); setJournal(id, null); moved++; }
  });
  return moved;
}

/* Exit price implied by bot result (history has result_r but no exit price) */
export function exitPrice(s) {
  if (s.status === 'target') return s.target;
  if (s.status === 'stop') return s.result_r != null ? s.entry + s.result_r * Math.abs(s.entry - s.stop) * (s.action === 'BUY' ? 1 : -1) : s.stop;
  if (s.result_r != null) return s.entry + s.result_r * Math.abs(s.entry - s.stop) * (s.action === 'BUY' ? 1 : -1);
  if (s.intraday_hit === 'target') return s.target;
  if (s.intraday_hit === 'stop') return s.stop;
  return s.last_price ?? null;
}

/* The user's own result for a journal entry: closed early (own exit price) or still running (live price) */
export function myResult(s, e) {
  if (!e || !(e.entry > 0)) return null;
  const ex = e.state === 'closed' ? e.exit : exitPrice(s);
  if (ex == null) return null;
  const dir = s.action === 'BUY' ? 1 : -1;
  const pct = ((ex - e.entry) / e.entry) * 100 * dir;
  const risk = Math.abs(s.entry - s.stop);
  return { pct, r: risk > 0 ? ((ex - e.entry) * dir) / risk : null, money: e.size ? (e.size * pct) / 100 : null, exit: ex };
}

export function journalRows(data) {
  const j = journal();
  return Object.entries(j).map(([id, e]) => {
    const s = findSignal(data, id);
    if (!s) return null;
    const ex = exitPrice(s);
    const dir = s.action === 'BUY' ? 1 : -1;
    const closed = s.status !== 'open' || !!s.intraday_hit || e.state === 'closed';
    let my = null;
    if (e.state === 'closed') {
      my = myResult(s, e);
    } else if (e.state === 'in' && ex != null && e.entry > 0) {
      const pct = ((ex - e.entry) / e.entry) * 100 * dir;
      const r = ((ex - e.entry) * dir) / Math.abs(s.entry - s.stop);
      my = { pct, r, money: e.size ? (e.size * pct) / 100 : null };
    }
    const botR = s.result_r ?? s.pnl_r ?? null;
    return { id, s, e, my, botR, closed };
  }).filter(Boolean).sort((a, b) => b.e.at - a.e.at);
}

/* ---------- Simulator ---------- */
export function simulate(history, perf, { start, capital, leverage, riskPct }) {
  const trades = [...history].filter((t) => t.closed_at && t.closed_at.slice(0, 10) >= start).sort((a, b) => a.closed_at.localeCompare(b.closed_at));
  const eq = (perf?.equity || []).filter((p) => p.date >= start);
  let v = capital, peak = capital, maxDD = 0, capped = 0, wins = 0;
  const byDay = new Map();
  trades.forEach((t) => {
    const stopDist = Math.abs(t.entry - t.stop) / t.entry;
    const wantNotional = (v * riskPct / 100) / stopDist;
    const maxNotional = v * leverage;
    const scale = wantNotional > maxNotional ? maxNotional / wantNotional : 1;
    if (scale < 1) capped++;
    const pnl = v * (riskPct / 100) * t.result_r * scale;
    v += pnl;
    if (t.result_r > 0) wins++;
    peak = Math.max(peak, v);
    maxDD = Math.min(maxDD, v / peak - 1);
    byDay.set(t.closed_at.slice(0, 10), v);
  });
  let cur = capital;
  const spy0 = eq[0]?.spy || 100;
  const series = eq.map((p) => {
    if (byDay.has(p.date)) cur = byDay.get(p.date);
    return { date: p.date, bot: (cur / capital) * 100, spy: (p.spy / spy0) * 100 };
  });
  return { trades: trades.length, wins, final: v, ret: (v / capital - 1) * 100, maxDD: maxDD * 100, capped, series };
}

/* ---------- Position sizing (Kalkulačka, broker hand-off) ---------- */
export function calcState() {
  const c = CONFIG.CALC;
  const s = store.get('calc', {}) || {};
  const ccy = ['CZK', 'EUR', 'USD'].includes(s.ccy) ? s.ccy : 'CZK';
  return {
    ccy,
    account: Number.isFinite(s.account) && s.account > 0 ? s.account : c.DEFAULT_ACCOUNT[ccy],
    leverage: Number.isFinite(s.leverage) ? s.leverage : 2,
    profile: c.RISK_PROFILES.some((p) => p.id === s.profile) ? s.profile : c.RISK_PROFILES[0].id,
    signalId: s.signalId || null,
  };
}
export const saveCalc = (patch) => store.set('calc', { ...calcState(), ...patch });

export function leverageCap(data, sig) {
  const c = CONFIG.CALC;
  return Math.max(c.LEVERAGE_MIN, Math.min(c.LEVERAGE_MAX, sig?.max_leverage ?? c.LEVERAGE_MAX, levelMaxLeverage(data)));
}

export function computePosition(sig, { account, ccy, leverage, riskPct, fx: fxIn = null }) {
  const stopDist = Math.abs(sig.entry - sig.stop) / sig.entry;
  const targetDist = Math.abs(sig.target - sig.entry) / sig.entry;
  const riskAmt = account * riskPct / 100;
  const want = riskAmt / stopDist; // notional in account ccy
  const maxNotional = account * leverage;
  const notional = Math.min(want, maxNotional);
  const limited = want > maxNotional + 1e-9;
  const needLev = want / account;
  const quote = CONFIG.CALC.QUOTE_CCY[sig.symbol] || 'USD';
  const fx = fxIn || CONFIG.CALC.FX_PER_USD;
  // account ccy -> quote ccy
  const toQuote = (fx[quote] || 1) / (fx[ccy] || 1);
  const units = (notional * toQuote) / sig.entry;
  return {
    notional, margin: notional / leverage, loss: notional * stopDist, gain: notional * targetDist,
    lossPct: (notional * stopDist / account) * 100, gainPct: (notional * targetDist / account) * 100,
    marginPct: (notional / leverage / account) * 100,
    units, quote, limited, needLev, stopDist: stopDist * 100,
  };
}

/* ---------- Bot runs / empty states ---------- */
export function lastRun(data) {
  const s = data?.signals;
  if (!s) return null;
  if (s.last_run_at) return s.last_run_at;
  const all = allOpen(data).map((x) => x.created_at).sort();
  return all[all.length - 1] || s.generated_at;
}
export const isNew = (s, data) => { const lr = lastRun(data); return !!lr && new Date(s.created_at) >= new Date(lr); };

export function nextRun(data, now = clock()) {
  const n = data?.signals?.next_run_at;
  if (n && new Date(n) > now) return new Date(n);
  const [hh, mm] = (CONFIG.BOT_RUN_TIME || '22:30').split(':').map(Number);
  const d = new Date(now);
  d.setHours(hh, mm, 0, 0);
  while (d <= now || d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() + 1); d.setHours(hh, mm, 0, 0); }
  return d;
}

export function nextRunLabel(data, now = clock()) {
  const d = nextRun(data, now);
  const days = F.daysUntil(d, now);
  const day = days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(d);
  return t('fmt.at', { day, time: F.time(d) });
}

export function emptyReason(data, hz) {
  const r = data?.signals?.empty_reasons?.[hz] || data?.signals?.empty_reasons?.ALL;
  return r ? L(r) : t('empty.reason');
}

/* ---------- FX (from signals.json "fx", fallback config) ---------- */
export function fxRates(data) {
  const f = data?.signals?.fx;
  /* 1.9.0: live USD/CZK and EUR/USD quotes (quotes.json) win; other currencies (GBP, JPY …) from the config */
  const uc = Live.quote('USDCZK')?.p, eu = Live.quote('EURUSD')?.p;
  if (uc > 0 && eu > 0) return { ...CONFIG.CALC.FX_PER_USD, USD: 1, CZK: uc, EUR: 1 / eu, as_of: null, source: 'live' };
  if (f && f.USDCZK > 0 && f.EURCZK > 0) {
    return { ...CONFIG.CALC.FX_PER_USD, USD: 1, CZK: f.USDCZK, EUR: f.USDCZK / f.EURCZK, as_of: f.as_of || null, source: 'data' };
  }
  return { ...CONFIG.CALC.FX_PER_USD, as_of: null, source: 'config' };
}

/* ---------- Leverage caps ---------- */
export function leverageInfo(data, sig) {
  const legal = sig?.max_leverage ?? null;
  const level = Math.min(levelMaxLeverage(data), CONFIG.CALC.LEVERAGE_MAX);
  return { legal, level, effective: leverageCap(data, sig) };
}
export function leverageText(data, sig) {
  const i = leverageInfo(data, sig);
  return t('lev.text', { legal: i.legal, level: i.level });
}

/* ---------- Risk according to the user's profile ---------- */
export function profilePct() {
  const cs = calcState();
  const p = CONFIG.CALC.RISK_PROFILES.find((x) => x.id === cs.profile);
  return p ? { pct: p.pct, label: t(`profile.${p.id}`) } : null;
}
export function riskFor(s) {
  const p = profilePct();
  const risk = p ? p.pct : s.risk_pct_account;
  return { risk, target: risk * (s.rr || (s.target_pct_account / s.risk_pct_account)), profile: p?.label || null };
}

/* ---------- R units: hidden for the first level ---------- */
/* 1.6.0: R units are hidden everywhere for beginners (owner: no abbreviations) - results are shown in % and money. */
export const showR = () => false;

/* ---------- Is the entry still valid for a latecomer? ---------- */
export function entryState(s, now = clock()) {
  if (s.status && s.status !== 'open') return null;
  if (s.intraday_hit) return null;
  if (isTimeExit(s, now)) return null;
  const E = CONFIG.ENTRY;
  if (s.entry_valid_until && new Date(s.entry_valid_until) < now) {
    return { code: 'expired', label: t('entry.expired'), note: t('entry.note.expired', { time: F.dmTime(s.entry_valid_until) }) };
  }
  const r = s.pnl_r ?? 0;
  const prog = s.progress ?? (s.rr ? r / s.rr : 0);
  if (r > E.LATE_R || prog > E.LATE_PROGRESS) return { code: 'late', label: t('entry.late'), note: t('entry.note.late') };
  if (r > E.VALID_R) return { code: 'limit', label: t('entry.limit', { price: F.price(s.entry) }), note: t('entry.note.limit') };
  return { code: 'ok', label: t('entry.ok'), note: s.entry_valid_until ? t('entry.note.ok', { time: F.dmTime(s.entry_valid_until) }) : t('entry.note.okNear') };
}

/* Order text for "Jak zadat" */
export function orderLines(s) {
  const until = s.entry_valid_until || `${s.exit_date}T22:00:00`;
  return [
    t(s.action === 'BUY' ? 'order.limitBuy' : 'order.limitSell', { price: F.price(s.entry), time: F.dmTime(until) }),
    t('order.stop', { price: F.price(s.stop) }),
    t('order.target', { price: F.price(s.target) }),
  ];
}

/* ---------- One status vocabulary for the whole app (1.6.0) ----------
 * How a signal is doing right now, in plain words, with one colour (tone: up / down / gold / flat).
 * move = price move of the trade in % (what money put into the trade did), dir-aware.
 * Used by signal cards, the "all signals" list, Dnes positions, Results (open + closed) and the detail. */
export const NEAR_PROGRESS = 0.6;
export const FLAT_PCT = 0.1; // 1.9.1: within ±0,1 % a result is "≈ 0 · zatím na nule" (grey), never red / green // 60 % of the way to target / stop = "getting close"
export function exampleStake() {
  const ccy = calcState().ccy;
  return { amount: 10000, ccy };
}
export function priceMove(s) {
  const dir = s.action === 'SELL' ? -1 : 1;
  const closed = s.status && s.status !== 'open';
  if (!closed && s.pnl_pct_position != null && !s.intraday_hit) return s.pnl_pct_position;
  const px = exitPrice(s);
  if (px == null || !(s.entry > 0)) return s.pnl_pct_position ?? null;
  return ((px - s.entry) / s.entry) * 100 * dir;
}
/* distance (in % of the current price) from the price to target / stop */
export function distances(s, px = s.last_price) {
  if (px == null || !(px > 0)) return { toTarget: null, toStop: null };
  return {
    toTarget: s.target != null ? Math.abs(s.target - px) / px * 100 : null,
    toStop: s.stop != null ? Math.abs(px - s.stop) / px * 100 : null,
  };
}
/* The money result for THIS user: calculator account size x risk profile (default 100 000 Kč, 1 %).
   1 R = what the user loses at the stop = account x risk %. Result = R multiple x that. */
export function userMoney(s) {
  const c = calcState();
  const p = CONFIG.CALC.RISK_PROFILES.find((x) => x.id === c.profile) || CONFIG.CALC.RISK_PROFILES[0];
  const oneR = c.account * p.pct / 100;
  const stopDist = s.entry > 0 && s.stop != null ? Math.abs(s.entry - s.stop) / s.entry * 100 : null;
  const mv = priceMove(s);
  const closed = s.status && s.status !== 'open';
  let r = closed ? s.result_r : (s.intraday_hit ? null : s.pnl_r);
  if (r == null && mv != null && stopDist) r = mv / stopDist;
  const rr = s.rr || (s.target != null && stopDist ? Math.abs(s.target - s.entry) / s.entry * 100 / stopDist : null);
  return { account: c.account, ccy: c.ccy, risk: p.pct, now: r == null ? null : r * oneR, atTarget: rr ? rr * oneR : null, atStop: -oneR };
}

export function liveStatus(s, now = clock()) {
  const r = liveStatus0(s, now);
  r.um = userMoney(s);
  return r;
}
function liveStatus0(s, now) {
  const st = s.status && s.status !== 'open' ? s.status : (s.intraday_hit || (isTimeExit(s, now) ? 'time_exit' : 'open'));
  const mv = priceMove(s);
  const um = userMoney(s);
  /* text = line 1 (price move, plain words), hint = how far to target / stop; sub = the hint for rows.
     1.9.1: no money "for you" here – real money only on the user's own trades (cardState), hypothetical money is grey. */
  const mk = (o) => ({ ...o, sub: o.hint || '' });
  if (st === 'target') return mk({ code: 'target', tone: 'up', text: t('st.target'), hint: t('st.closedWin', { v: F.spct(mv, 1) }), move: mv, done: true });
  if (st === 'stop') return mk({ code: 'stop', tone: 'down', text: t('st.stop'), hint: t('st.closedLoss', { v: F.spct(mv, 1) }), move: mv, done: true });
  if (st === 'time_exit') return mk({ code: 'time', tone: (mv ?? 0) >= 0 ? 'up' : 'down', text: t('st.time'), hint: t('st.closedRes', { v: F.spct(mv ?? 0, 1) }), move: mv, done: true });
  if (s.last_price == null || mv == null) return { code: 'wait', tone: 'flat', text: t('st.wait'), hint: t('st.waitS'), sub: t('st.waitS'), move: null };
  const d = distances(s);
  const prog = s.progress ?? 0;
  /* way to the stop measured against the stop distance (not the target distance) */
  const progS = s.stop != null && s.stop !== s.entry ? (s.last_price - s.entry) / (s.stop - s.entry) : 0;
  const prox = proximity(s);
  const moveTxt = mv >= 0 ? t('st.win', { v: F.spct(mv, 1) }) : t('st.lose', { v: F.spct(mv, 1) });
  if ((prox && prox.side === 'stop') || progS >= NEAR_PROGRESS) return mk({ code: 'near-stop', tone: 'down', text: `${t('st.nearStop')} · ${moveTxt}`, hint: t('st.toStop', { v: F.pct(d.toStop, 1) }), move: mv });
  if ((prox && prox.side === 'target') || prog >= NEAR_PROGRESS) return mk({ code: 'near-target', tone: 'up', text: t('st.nearTarget', { v: F.pct(d.toTarget, 1) }), hint: moveTxt, move: mv });
  if (Math.abs(mv) < FLAT_PCT) return mk({ code: 'flat', tone: 'flat', text: t('st.flat'), hint: t('st.both', { t: F.pct(d.toTarget, 1), s: F.pct(d.toStop, 1) }), move: mv });
  if (mv > 0) return mk({ code: 'win', tone: 'up', text: moveTxt, hint: t('st.toTarget', { v: F.pct(d.toTarget, 1) }), move: mv });
  return mk({ code: 'lose', tone: 'down', text: moveTxt, hint: t('st.toStop', { v: F.pct(d.toStop, 1) }), move: mv });
}

/* ---------- Signals I follow ("Sledovat", 1.7.0) – ids stored on this device ---------- */
export const followed = () => { const f = store.get('follow', []); return Array.isArray(f) ? f : []; };
export const isFollowed = (id) => followed().includes(id);
export function toggleFollow(id) {
  const f = followed();
  const on = !f.includes(id);
  store.set('follow', on ? [id, ...f].slice(0, 200) : f.filter((x) => x !== id));
  return on;
}

/* Convert money between the app currencies with the FX of the data (units per 1 USD) */
export function convert(v, from, to, data) {
  if (from === to || v == null) return v;
  const fx = fxRates(data);
  return (v / (fx[from] || 1)) * (fx[to] || 1);
}

/* ---------- 1.9.1: money near zero ----------
   Within ±0,1 % (pct) the result is "≈ 0 Kč · zatím na nule" in grey; otherwise signed money. Returns {text, tone}. */
export function moneyTone(v, ccy, pct = null) {
  if (v == null || !Number.isFinite(v)) return { text: '–', tone: 'flat', zero: false };
  const zero = pct != null ? Math.abs(pct) < FLAT_PCT : Math.abs(v) < 0.5;
  if (zero) return { text: t('st.zero', { m: F.money(0, ccy, 0) }), tone: 'flat', zero: true };
  return { text: (v > 0 ? '+' : '') + F.money(v, ccy, 0), tone: v > 0 ? 'up' : 'down', zero: false };
}

/* ---------- 1.9.1: ONE user-facing state per signal (cards on Dnes / Signály / Výsledky / Moje, the detail) ----------
 * Everything the user reads about "what do I do" comes from here: the badge, the sentence, the colour and the button.
 * The robot is NOT part of it (its line is a separate, neutral fact – brief.robotLine).
 *   code: buy (kup teď) | soon (kup při otevření burzy) | wait (počkej na cenu, limit) | order (čeká tvůj limitní příkaz)
 *         | mine (máš koupeno) | late (na nákup pozdě) | done (ukončeno)
 *   tone: up | gold | flat   (red never: a beginner reads red as "something is wrong with me")
 *   cta:  'invest' | 'limit' | null
 *   my:   the user's REAL result on this signal (play-money trade or a trade marked in Můj deník) or null
 *   ifBought: what the user's calculator stake would show now – only for signals the user does not hold (grey) */
function walletFor(s) {
  const w = store.get('wallet', null);
  return { w, pos: (w?.positions || []).filter((p) => p.sigId === s.id), ord: (w?.orders || []).find((o) => o.sigId === s.id) || null };
}
export function isDoneSig(s, now = clock()) {
  return (s.status && s.status !== 'open') || !!s.intraday_hit || isTimeExit(s, now);
}
function myRealResult(s, data, pos, j) {
  if (pos.length) {
    const ccy = store.get('wallet', null)?.ccy || calcState().ccy;
    let pnl = 0, margin = 0;
    pos.forEach((p) => { const q = data ? priceOf(p.sym, data) : null; const px = q ? q.p : p.entry; pnl += Math.max(-p.margin, pnlAt(p, px)); margin += p.margin || 0; });
    return { money: pnl, ccy, pct: margin > 0 ? (pnl / margin) * 100 : null, src: 'wallet' };
  }
  if (j && (j.state === 'in' || j.state === 'closed')) {
    const r = myResult(s, j);
    if (!r) return null;
    return { money: r.money, ccy: j.ccy || calcState().ccy, pct: r.pct, src: 'journal' };
  }
  return null;
}
export function cardState(s, data = null, now = clock()) {
  const { pos, ord } = walletFor(s);
  const j = journal()[s.id];
  const sell = s.action === 'SELL';
  const e = F.price(s.entry);
  const mineIn = pos.length > 0 || j?.state === 'in';
  const my = (mineIn || j?.state === 'closed') ? myRealResult(s, data, pos, j) : null;
  const um = userMoney(s);
  const ifBought = !my && um.now != null ? um : null;
  const base = { mine: !!my, my, ifBought, move: priceMove(s), pos, ord };
  if (isDoneSig(s, now)) {
    return { ...base, code: 'done', tone: 'flat', badge: t('u.chip.done'), text: t(my ? 'u.do.endMine' : 'u.do.end'), cta: null };
  }
  if (mineIn) return { ...base, code: 'mine', tone: 'gold', badge: t(sell ? 'u.chip.mineSell' : 'u.chip.mine'), text: t(sell ? 'u.do.holdSell' : 'u.do.hold'), cta: null };
  if (ord) return { ...base, code: 'order', tone: 'gold', badge: t('u.chip.order'), text: t('u.do.order', { v: F.price(ord.limit) }), cta: null };
  /* 1.9.1 "what if I did not invest right away?" – exactly three answers (CONFIG.ENTRY via entryState):
     (a) ok: price still near the entry -> invest now; (b) limit: the price ran a bit -> a limit order at the original
     entry, valid until the signal ends; (c) late / expired -> skip it. Market closed + (a) -> a limit for the open. */
  const est = entryState(s, now);
  if (!est || est.code === 'late' || est.code === 'expired') {
    return { ...base, code: 'late', tone: 'flat', badge: t('u.chip.late'), text: t('u.do.late'), cta: null, est };
  }
  const mv = base.move ?? 0;
  if (est.code === 'limit') {
    return { ...base, code: 'wait', tone: 'gold', est, badge: t('u.chip.wait'), text: t(sell ? 'u.do.waitSell' : 'u.do.wait', { d: F.pct(Math.abs(mv), 1), v: e }), cta: 'limit' };
  }
  if (!Live.marketOpen(now)) {
    const o = nextUsOpen(now);
    const days = o ? F.daysUntil(o, now) : 1;
    const day = days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(o);
    return { ...base, code: 'soon', tone: 'up', est, badge: t(sell ? 'u.chip.buySell' : 'u.chip.buy'),
      text: t(sell ? 'u.do.soonSell' : 'u.do.soon', { day, time: o ? F.time(o) : '15:30', v: e }), cta: 'limit' };
  }
  return { ...base, code: 'buy', tone: 'up', est, badge: t(sell ? 'u.chip.buySell' : 'u.chip.buy'), text: t(sell ? 'u.do.nowSell' : 'u.do.now', { d: F.spct(mv, 1), v: e }), cta: 'invest' };
}

/* 1.9.1: the example on every signal card – "Vlož např. 10 000 Kč → při cíli +1 880 Kč, při stopu −940 Kč".
   Same function as the investment sheet preview (wallet.outcome, leverage 1:1), so the numbers match everywhere. */
export const EXAMPLE_DEP = { CZK: 10000, EUR: 400, USD: 500 };
export const DEP_CHIPS = { CZK: [5000, 10000, 25000], EUR: [200, 400, 1000], USD: [250, 500, 1000] };
export function walletCcy() { return store.get('wallet', null)?.ccy || calcState().ccy; }
export function example(s, amount = null, lev = 1) {
  const ccy = walletCcy();
  const a = amount ?? EXAMPLE_DEP[ccy] ?? 10000;
  const side = s.action === 'SELL' ? 'SELL' : 'BUY';
  /* same base price as the investment sheet (buy now = live price), so card and sheet show identical numbers */
  const px = Live.quote(s.symbol)?.p || s.last_price || s.entry;
  const o = outcome({ side, entry: px, amount: a, lev, sl: s.stop, tp: s.target });
  return { amount: a, ccy, atTarget: o.atTarget, atStop: o.atStop };
}
/* signals the user tapped "Teď ne" on (hidden from Dnes, still in Signály) */
export const dismissed = () => { const d = store.get('notNow', []); return Array.isArray(d) ? d : []; };
export function dismiss(id) { store.set('notNow', [id, ...dismissed().filter((x) => x !== id)].slice(0, 300)); }
