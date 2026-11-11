// Domain logic: levels, proximity, calendar impact, journal, simulator.
import { CONFIG } from '../config.js';
import * as store from './store.js';
import * as F from './format.js';
import { LESSONS } from './lessons.js';
import { t, L } from './i18n/index.js';

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
  if (f && f.USDCZK > 0 && f.EURCZK > 0) {
    return { USD: 1, CZK: f.USDCZK, EUR: f.USDCZK / f.EURCZK, as_of: f.as_of || null, source: 'data' };
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
export const showR = (data) => levelInfo(data).idx > 0;

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
