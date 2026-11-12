// Domain logic: levels, proximity, calendar impact, journal, simulator.
import { CONFIG } from '../config.js';
import * as store from './store.js';
import * as F from './format.js';
import { LESSONS } from './lessons.js';
import { t, L } from './i18n/index.js';
import * as Live from './live.js';
import { nextUsOpen } from './views/signals.js';
import { priceOf, pnlAt, outcome, costs, nyCloseAfter, equityNow } from './wallet.js';
import * as M from './market.js';

export const HORIZONS = ['DEN', 'DNY', 'TYDEN', 'MESIC'];
/* 1.13.0: a signal's price with its currency, 2 decimals ("164,47 $") */
export const spx = (s, v) => F.pxc(v, M.ccy(s?.symbol) || 'USD');

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
    /* 1.13.0: the capital IS the wallet (Peněženka) once it exists – Kalkulačka, cards and the robot read one number */
    account: walletEquity() || (Number.isFinite(s.account) && s.account > 0 ? s.account : c.DEFAULT_ACCOUNT[ccy]),
    leverage: Number.isFinite(s.leverage) ? s.leverage : 2,
    profile: profId(),
    signalId: s.signalId || null,
  };
}
/* the stored values only (calcState().account is the wallet once it exists – never write that back as "typed") */
export const saveCalc = (patch) => { const c = calcState(); store.set('calc', { ...c, account: +(store.get('calc', {}) || {}).account || c.account, ...patch }); };
function walletBalance() { const w = store.get('wallet', null); return w && w.v === 1 && w.balance > 0 ? Math.round(w.balance) : 0; }
/* 1.13.1: Peněženka = volné + ve hře + otevřený zisk/ztráta (W.summary equity), the same number everywhere */
export function walletEquity() { if (!walletBalance()) return 0; try { const e = equityNow(); return e > 0 ? e : walletBalance(); } catch { return walletBalance(); } }
/* 1.13.2 ONE profile (CONFIG.CALC.RISK_PROFILES): Konzervativně 1 % bez páky · Vyváženě 2 % do 1:2 · Agresivněji 4 % do stropu trhu.
   Stored as 'levProfile' (the key the leverage profile used since 1.11.1). Older devices: the leverage profile wins;
   without one, the old risk "Odvážně 3 %" becomes Agresivněji, anything else Konzervativně. */
export const PROFILES = CONFIG.CALC.RISK_PROFILES;
const PROF_IDS = PROFILES.map((p) => p.id);
export function profId() {
  const id = store.get('levProfile', null);
  if (PROF_IDS.includes(id)) return id;
  const old = (store.get('calc', null) || {}).profile;
  const own = +store.get('levOwn', 0);
  const v = id === 'own' ? (own > 2 ? 'aggr' : 'bal') : old === 'aggressive' ? 'aggr' : PROF_IDS[0];
  try { store.set('levProfile', v); } catch { /* storage off */ }
  return v;
}
export const prof = (id = null) => PROFILES.find((p) => p.id === (id || profId())) || PROFILES[0];
export const setProf = (id) => { if (PROF_IDS.includes(id)) store.set('levProfile', id); };
/* the leverage of a profile for one instrument: 1 · up to 2 · the instrument's legal cap (shares 1:5, gold 1:20, crypto 1:2) */
export function profLevFor(p, sym) {
  const mx = (sym && M.maxLev(sym)) || 1;
  return p.lev === 'max' ? mx : Math.max(1, Math.min(p.lev, mx));
}
export function riskProf() { return prof(); }
/* 4 870 -> 4 800, 12 345 -> 12 000, 523 -> 500: a calm round number (never above v) */
export function niceRound(v) {
  if (!(v > 0)) return 0;
  const step = 10 ** Math.floor(Math.log10(v)) / 5;
  return Math.max(step, Math.floor(v / step + 1e-9) * step);
}
/* 1.13.0 THE default deposit (signal cards, detail, invest sheet, the robot-for-me):
   lose at most risk % of the wallet at the stop, and put at most cap (10 / 20 / 25 %) of the wallet into one trade. */
/* 1.13.1: ONE sizing for every screen. lev = the user's leverage profile for the instrument (setLevOf, app.js),
   px = the price the trade really starts at (live ask / bid, or the limit) - so the loss at the stop is exactly risk %
   of the wallet (Peněženka = equity) unless the 10 / 20 % cap is smaller. */
let levOf = () => 1;
export const setLevOf = (fn) => { levOf = fn; };
export const profileLev = (sym) => profLevFor(prof(), sym);
/* the wallet figure the sizing starts from: equity floored to 100 Kč / 10 € $ (stable while prices tick) */
export function sizingBase(equity = null) {
  const ccy = walletCcy();
  const eq = equity ?? (walletEquity() || calcState().account);
  const step = ccy === 'CZK' ? 100 : 10;
  return Math.max(0, Math.floor(eq / step) * step);
}
/* the cap per trade ("Výchozí vklad až …" in Nastavení) */
/* 1.13.5: ONE deposit for every profile = the Konzervativně stake (risk 1 % at the stop, no leverage, max 10 % of the wallet).
   The profile changes only the LEVERAGE (Konzervativně bez páky · Vyváženě 1:2 · Agresivněji up to the market cap),
   so the worst case grows with it: ~1 % · ~2 % · ~5 % of the wallet on a share (capped at the deposit). */
export const BASE_PROF = PROFILES[0];
export function stakeCap(equity = null) { return niceRound(sizingBase(equity) * (BASE_PROF.cap ?? 0.1)); }
/* 1.13.9: the worst case of ONE trade never goes above ~5 % of the wallet (the Agresivněji risk), whatever the leverage:
   up to 1:5 the deposit is the Konzervativně stake (1 % × leverage), above it the deposit shrinks by 5 / leverage
   (1:10 -> half, 1:20 -> a quarter), so 1:20 = the same trade size as 1:5 on the full deposit, just less money tied up */
export const WORST_MAX = PROFILES[PROFILES.length - 1].pct;
export const AGGR_LEV = +PROFILES[PROFILES.length - 1].lev || 20;
/* at this leverage the trade ends after a move of 100 / lev % against it (1:20 -> 5 %) */
export const wipePct = (lev) => 100 / Math.max(1, +lev || 1);
export const levFactor = (lev) => Math.min(1, WORST_MAX / (BASE_PROF.pct * Math.max(1, +lev || 1)));
export const levWorstPct = (lev) => Math.min(BASE_PROF.pct * Math.max(1, +lev || 1), WORST_MAX);
/* the worst share of the wallet a profile risks on one instrument (1 % × its leverage, max 5 %; the deposit caps it) */
export const profWorstPct = (p, sym = 'AAPL') => levWorstPct(profLevFor(p, sym));
/* opt.prof = another profile than mine (the comparison columns); its leverage unless opt.lev says otherwise */
export function stakeFor(s = null, opt = {}) {
  if (typeof opt === 'number' || opt == null) opt = { equity: opt }; // old call shape stakeFor(s, equity)
  const ccy = walletCcy();
  const eq = sizingBase(opt.equity ?? null);
  /* 1.13.5: the profile does not change the base deposit; 1.13.9: a leverage above 1:5 shrinks it (levFactor) so the
     worst case stays ~5 % of the wallet. lev = opt.lev, else the leverage of opt.prof / my profile for this symbol */
  const p = BASE_PROF;
  const st = STAKE_STEP[ccy] || 10;
  const lev = opt.lev > 0 ? opt.lev : profLevFor(opt.prof ? prof(opt.prof) : prof(), s?.symbol);
  const f = levFactor(lev);
  const cap = stakeCap(eq);
  let a = cap;
  const px = opt.px > 0 ? opt.px : s?.entry;
  if (s && px > 0 && s.stop > 0 && px !== s.stop) {
    const want = (eq * p.pct / 100) / (Math.abs(px - s.stop) / px);
    /* 1.13.7: a calm deposit – whole 100 Kč / 10 € / 10 $ (7 507 -> 7 500), never above the risk % */
    if (want < cap) a = Math.floor(want / st + 1e-9) * st;
  }
  if (f < 1) a = Math.floor(a * f / st + 1e-9) * st;
  /* 1.13.9 (lead 12. 11.): Agresivněji 1:20 = a deposit of 5 % of the wallet (exposure = the whole wallet); the worst
     case is the whole deposit = ~5 % of the wallet, the same on every screen, whatever the stop distance */
  if (lev >= AGGR_LEV) a = Math.floor(eq * WORST_MAX / 100 / st + 1e-9) * st;
  return a >= (DEP_MIN[ccy] || 0) ? a : (DEP_MIN[ccy] || EXAMPLE_DEP[ccy] || 10000);
}
/* 1.13.7 the rounding step of the default deposit (D.stakeFor) */
export const STAKE_STEP = { CZK: 100, EUR: 10, USD: 10 };
/* 1.13.7 the stake of this signal hit the cap (10 % of the wallet) -> its worst case is below the profile's risk % */
export function stakeLimited(s, amount, opt = {}) {
  const eq = sizingBase(opt.equity ?? null);
  if (!(eq > 0) || !(amount > 0)) return false;
  const st = STAKE_STEP[walletCcy()] || 10;
  const f = levFactor(opt.lev || 1);
  if ((opt.lev || 1) >= AGGR_LEV) return false; // 1:20: the 5 % deposit is the rule itself, not a cap
  return Math.abs(amount - stakeCap(eq)) < 0.5 || (f < 1 && Math.abs(amount - Math.floor(stakeCap(eq) * f / st + 1e-9) * st) < 0.5);
}

/* 1.13.5 Kalkulačka: the same leverage as the profiles = the market cap of the instrument (slider max LEVERAGE_MAX) */
export const calcLevCap = (sig) => Math.max(1, profLevFor(PROFILES[PROFILES.length - 1], sig?.symbol));
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

/* 1.13.5 Kalkulačka + broker hand-off: the SAME deposit as the cards (stakeFor), the profile's leverage makes the trade bigger */
export function positionAt(sig, { account, ccy, leverage, fx: fxIn = null }) {
  const stopDist = Math.abs(sig.entry - sig.stop) / sig.entry;
  const targetDist = Math.abs(sig.target - sig.entry) / sig.entry;
  const lev = Math.max(1, leverage || 1);
  const deposit = stakeFor(sig, { equity: account, px: sig.entry, lev });
  const notional = deposit * lev;
  const loss = Math.min(deposit, notional * stopDist);
  const gain = notional * targetDist;
  const quote = CONFIG.CALC.QUOTE_CCY[sig.symbol] || 'USD';
  const fx = fxIn || CONFIG.CALC.FX_PER_USD;
  const units = (notional * ((fx[quote] || 1) / (fx[ccy] || 1))) / sig.entry;
  return { deposit, notional, margin: deposit, loss, gain, lossPct: loss / account * 100, gainPct: gain / account * 100,
    marginPct: deposit / account * 100, units, quote, stopDist: stopDist * 100, lev };
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

/* ---------- 1.13.9 US session calendar + the robot's check plan (ONE place) ----------
   NYSE regular session 9:30–16:00 New York, Mon–Fri, without the NYSE holidays below (early closes 13:00 not modelled). */
export const US_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);
/* The server's plan – keep in sync with the systemd timers on the server (/etc/systemd/system):
   pulse-scan.timer    OnCalendar=Mon..Fri *-*-* 14..22:05/20:00 Europe/Prague (14:05, 14:25 … 22:45; scan.py works only
                       while NYSE is open -> the real checks are 15:45 … 21:45 Prague in a normal week)
   pulse-nightly.timer Mon–Fri 22:45 Prague = the main (official) batch of the day */
export const SCAN_PLAN = { hours: [14, 22], minutes: [5, 25, 45], official: '22:45' };
const NYF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
const PRF = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function zp(fmt, ms) {
  const o = {}; fmt.formatToParts(new Date(ms)).forEach((x) => { o[x.type] = x.value; });
  return { ymd: `${o.year}-${o.month}-${o.day}`, y: +o.year, m: +o.month, d: +o.day, wd: WD.indexOf(o.weekday), min: (+o.hour % 24) * 60 + +o.minute };
}
/* New York wall time (y-m-d, minutes) -> UTC ms */
function nyAt(y, m, d, mins) {
  const guess = Date.UTC(y, m - 1, d, Math.floor(mins / 60), mins % 60);
  const p = zp(NYF, guess);
  return guess - (Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.min / 60), p.min % 60) - guess);
}
export const usTradingDay = (ymd, wd) => wd >= 1 && wd <= 5 && !US_HOLIDAYS.has(ymd);
/* the US session open at ms or the next one ({ open, close } in ms); startAfter = the first session that OPENS at / after ms */
export function usSession(ms = +clock(), startAfter = false) {
  let p = zp(NYF, ms);
  for (let i = 0; i < 14; i++) {
    if (usTradingDay(p.ymd, p.wd)) {
      const open = nyAt(p.y, p.m, p.d, 570), close = nyAt(p.y, p.m, p.d, 960);
      if (startAfter ? open >= ms : close > ms) return { open, close };
    }
    p = zp(NYF, Date.UTC(p.y, p.m - 1, p.d + 1, 17, 0));
  }
  return null;
}
export function usOpenAt(ms = +clock()) { const x = usSession(ms); return !!x && ms >= x.open && ms < x.close; }
/* the next check of the server scan that really runs (a timer slot inside the US session), as a Date */
export function nextScanAt(now = clock()) {
  let x = Math.floor(+now / 60000) * 60000 + 60000;
  const m0 = new Date(x).getUTCMinutes(); // Prague is a whole-hour offset from UTC -> the same minute
  x += ((((5 - (m0 % 20)) % 20) + 20) % 20) * 60000;
  for (let i = 0; i < 8 * 72; i++, x += 20 * 60000) {
    const p = zp(PRF, x);
    if (p.wd < 1 || p.wd > 5) continue;
    const h = Math.floor(p.min / 60);
    if (h < SCAN_PLAN.hours[0] || h > SCAN_PLAN.hours[1] || !SCAN_PLAN.minutes.includes(p.min % 60)) continue;
    if (usOpenAt(x)) return new Date(x);
  }
  return null;
}
/* ONE "další kontrola" -> { at: Date, kind }.
   1.15.0 (owner 12. 11.: "neřešíme čas, řešíme, kdy je správný vstup"): only the real checks during the US session
   are shown to the user; the evening batch is no longer advertised (fallback only when no session is known). */
export function nextCheck(data, now = clock()) {
  const sc = nextScanAt(now);
  return sc ? { at: sc, kind: 'scan' } : { at: nextRun(data, now), kind: 'official' };
}
/* "dnes 15:45" / "zítra 15:45" / "pondělí 15:45" */
export function whenLabel(d, now = clock()) {
  const days = F.daysUntil(d, now);
  return `${days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(d)} ${F.time(d)}`;
}
/* the robot's working state for the status line on Dnes and Signály:
   before (a US session later today) · open · after (closed today, the evening batch still to come) · closed (weekend / holiday / night) */
export function scanStatus(data, now = clock()) {
  const ms = +now;
  const sess = usSession(ms);
  const today = zp(PRF, ms).ymd;
  const sameDay = (a) => !!a && zp(PRF, a).ymd === today;
  const off = nextRun(data, now);
  const prev = usSession(ms - 12 * 3600000);
  let phase;
  if (sess && ms >= sess.open) phase = 'open';
  else if (sess && sameDay(sess.open)) phase = 'before';
  else if (prev && prev.close <= ms && sameDay(prev.close) && sameDay(+off)) phase = 'after';
  else phase = 'closed';
  const vis = HORIZONS.filter((h) => !(CONFIG.HIDDEN_HORIZONS || []).includes(h));
  const nToday = allOpen(data).filter((x) => vis.includes(x.horizon) && x.created_at && zp(PRF, Date.parse(x.created_at)).ymd === today).length;
  const nx = nextCheck(data, now);
  return { phase, open: sess ? new Date(sess.open) : null, close: sess ? new Date(sess.close) : null, next: nx.at, kind: nx.kind, official: off, nToday };
}

/* ---------- 1.13.9 entry window of a signal (ONE rule for cards, lists, the invest sheet, the robot-for-me, Obchodovat) ----------
   The strategies work on daily bars: a signal is computed after a close and entered at the next session. So it can be
   bought from its publication until the END of the first US session that opens after it was published (an intraday
   preview from 17:05 -> until the close of the next day). The price rule stays D.maxEntry (buy at / under it, a limit
   order AT it above it). After the window the signal leaves the offer lists (it keeps running for those who hold it). */
export function entryWindowEnd(s) {
  if (s?.entry_valid_until) return Date.parse(s.entry_valid_until) || null;
  const c = Date.parse(s?.created_at || 0);
  if (!(c > 0)) return null;
  const x = usSession(c, true);
  return x ? x.close : null;
}
export function entryOpen(s, now = clock()) {
  if (!s || (s.status && s.status !== 'open') || s.intraday_hit) return false;
  const end = entryWindowEnd(s);
  return !(end && +now >= end);
}
/* the signal as an order sees it: exit_date = the New York day the entry window ends (W.expiryFor 'sig' -> that close) */
export function entrySig(s) {
  const end = entryWindowEnd(s);
  if (!s || !end) return s;
  const ymd = zp(NYF, end).ymd;
  return !s.exit_date || ymd < s.exit_date ? { ...s, exit_date: ymd } : s;
}
/* "Vstup platí do dnes 22:00" */
export function entryUntilText(s, now = clock()) {
  const end = entryWindowEnd(s);
  return end ? t('ew.until', { d: whenLabel(new Date(end), now) }) : '';
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
  /* 1.15.0: the other quote currencies follow their live pair too (per 1 USD); config numbers only as the fallback */
  const lv = () => { const o = {}; const q = (k) => Live.quote(k)?.p;
    if (q('USDJPY') > 0) o.JPY = q('USDJPY'); if (q('USDCHF') > 0) o.CHF = q('USDCHF'); if (q('USDCAD') > 0) o.CAD = q('USDCAD');
    if (q('USDZAR') > 0) o.ZAR = q('USDZAR'); if (q('GBPUSD') > 0) o.GBP = 1 / q('GBPUSD'); if (q('AUDUSD') > 0) o.AUD = 1 / q('AUDUSD');
    if (q('EURTRY') > 0 && eu > 0) o.TRY = q('EURTRY') / eu;
    return o; };
  if (uc > 0 && eu > 0) return { ...CONFIG.CALC.FX_PER_USD, ...lv(), USD: 1, CZK: uc, EUR: 1 / eu, as_of: null, source: 'live' };
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
  const p = prof();
  return { pct: p.pct, label: t(`mb.p.${p.id}`) };
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
  /* 1.13.9: the entry window (D.entryOpen) – after it the signal is no longer offered */
  const end = entryWindowEnd(s);
  if (end && +now >= end) {
    return { code: 'expired', label: t('entry.expired'), note: t('entry.note.expired', { time: F.dmTime(new Date(end)) }) };
  }
  const r = s.pnl_r ?? 0;
  const prog = s.progress ?? (s.rr ? r / s.rr : 0);
  if (r > E.LATE_R || prog > E.LATE_PROGRESS) return { code: 'late', label: t('entry.late'), note: t('entry.note.late') };
  if (r > E.VALID_R) return { code: 'limit', label: t('entry.limit', { price: spx(s, maxEntry(s)) }), note: t('entry.note.limit') };
  return { code: 'ok', label: t('entry.ok'), note: end ? t('entry.note.ok', { time: F.dmTime(new Date(end)) }) : t('entry.note.okNear') };
}

/* 1.13.6 ONE "nejvýš za" price for a signal in EVERY state (market open / closed, card, detail, sheet, toast, robot-for-me):
   the entry moved by 0,3 of the stop distance (CONFIG.ENTRY.VALID_R) in the trade's direction. Live price at / better
   than it -> buy now (open) or at the open (closed); past it -> a limit order AT this price. Extra args are ignored
   (old callers passed data / now / cardState – the value never depends on them any more). */
export function maxEntry(s) {
  if (!s || !(s.entry > 0)) return s ? s.entry : null;
  const risk = Math.abs(s.entry - (s.stop || 0));
  if (!(risk > 0) || !(s.stop > 0)) return s.entry;
  const v = s.entry + (s.action === 'SELL' ? -1 : 1) * CONFIG.ENTRY.VALID_R * risk;
  const k = v >= 10 ? 100 : 10000;
  return Math.round(v * k) / k;
}
/* the live price is past the max entry (a buy above it, a sell below it) */
export function pastMaxEntry(s, px) {
  const mx = maxEntry(s);
  if (!(px > 0) || !(mx > 0)) return false;
  return s.action === 'SELL' ? px < mx : px > mx;
}
/* Order text for "Jak zadat" */
export function orderLines(s, data = null, now = clock()) {
  const until = entryWindowEnd(s) ? new Date(entryWindowEnd(s)) : `${s.exit_date}T22:00:00`;
  return [
    t(s.action === 'BUY' ? 'order.limitBuy' : 'order.limitSell', { price: spx(s, maxEntry(s)), time: F.dmTime(until) }),
    t('order.stop', { price: spx(s, s.stop) }),
    t('order.target', { price: spx(s, s.target) }),
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
  /* 1.13.1: "≈ 0 · na nule" only when the money rounds to 0 (the same rounding as Historie); a tiny % stays grey */
  if (Math.abs(v) < 0.5) return { text: t('st.zero', { m: F.money(0, ccy, 0) }), tone: 'flat', zero: true };
  const flat = pct != null && Math.abs(pct) < FLAT_PCT;
  return { text: (v > 0 ? '+' : '') + F.money(v, ccy, 0), tone: flat ? 'flat' : v > 0 ? 'up' : 'down', zero: false };
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
  return { w, pos: (w?.positions || []).filter((p) => p.sigId === s.id), ord: (w?.orders || []).find((o) => o.sigId === s.id) || null,
    done: (w?.closed || []).filter((c) => c.sigId === s.id) };
}
export function isDoneSig(s, now = clock()) {
  return (s.status && s.status !== 'open') || !!s.intraday_hit || isTimeExit(s, now);
}
function myRealResult(s, data, pos, j, done = []) {
  /* 1.13.2: a trade I already closed = the wallet's own closed result (fees and spread included, the same as Historie) */
  if (!pos.length && done.length) {
    const ccy = store.get('wallet', null)?.ccy || calcState().ccy;
    const pnl = done.reduce((a, c) => a + (+c.pnl || 0), 0), margin = done.reduce((a, c) => a + (+c.margin || 0), 0);
    return { money: pnl, ccy, pct: margin > 0 ? (pnl / margin) * 100 : null, src: 'wallet', closed: true };
  }
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
  const { pos, ord, done } = walletFor(s);
  const j = journal()[s.id];
  const sell = s.action === 'SELL';
  const e = spx(s, s.entry);
  const mineIn = pos.length > 0 || j?.state === 'in';
  const my = (mineIn || j?.state === 'closed' || done.length) ? myRealResult(s, data, pos, j, done) : null;
  const um = userMoney(s);
  const ifBought = !my && um.now != null ? um : null;
  const base = { mine: !!my, my, ifBought, move: priceMove(s), pos, ord };
  if (isDoneSig(s, now)) {
    return { ...base, code: 'done', tone: 'flat', badge: t('u.chip.done'), text: t(my ? 'u.do.endMine' : 'u.do.end'), cta: null };
  }
  if (mineIn) return { ...base, code: 'mine', tone: 'gold', badge: t(sell ? 'u.chip.mineSell' : 'u.chip.mine'), text: t(sell ? 'u.do.holdSell' : 'u.do.hold'), cta: null };
  if (ord) return { ...base, code: 'order', tone: 'gold', badge: t('u.chip.order'), text: t('u.do.order', { v: spx(s, ord.limit) }), cta: null };
  /* 1.9.1 "what if I did not invest right away?" – exactly three answers (CONFIG.ENTRY via entryState):
     (a) ok: price still near the entry -> invest now; (b) limit: the price ran a bit -> a limit order at the original
     entry, valid until the signal ends; (c) late / expired -> skip it. Market closed + (a) -> a limit for the open. */
  const est = entryState(s, now);
  if (!est || est.code === 'late' || est.code === 'expired') {
    /* 1.13.9: the entry window is over -> "robot ho drží, nový vstup už ne" (not "cena utekla") */
    const ew = est?.code === 'expired';
    return { ...base, code: 'late', tone: 'flat', badge: t(ew ? 'ew.chip' : 'u.chip.late'), text: t(ew ? 'ew.do' : 'u.do.late'), cta: null, est };
  }
  const mv = base.move ?? 0;
  /* 1.13.6 ONE rule (= the sheet, the detail, the robot-for-me): the live price at / better than maxEntry -> buy
     (now or at the open), past it -> wait with a limit AT maxEntry. Without a live price the server's pnl_r decides. */
  const lq = Live.quote(s.symbol)?.p;
  const mx = spx(s, maxEntry(s));
  const past = lq > 0 ? pastMaxEntry(s, lq) : est.code === 'limit';
  if (past) {
    return { ...base, code: 'wait', tone: 'gold', est, badge: t('u.chip.wait'), text: t(sell ? 'u.do.waitSell' : 'u.do.wait', { d: F.pct(Math.abs(mv), 1), v: mx }), cta: 'limit' };
  }
  if (!Live.marketOpen(now)) {
    const o = nextUsOpen(now);
    const days = o ? F.daysUntil(o, now) : 1;
    const day = days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(o);
    return { ...base, code: 'soon', tone: 'up', est, badge: t(sell ? 'u.chip.buySell' : 'u.chip.buy'),
      text: t(sell ? 'u.do.soonSell' : 'u.do.soon', { day, time: o ? F.time(o) : '15:30', v: mx }), cta: 'limit' };
  }
  return { ...base, code: 'buy', tone: 'up', est, badge: t(sell ? 'u.chip.buySell' : 'u.chip.buy'), text: t(sell ? 'u.do.nowSell' : 'u.do.now', { d: F.spct(mv, 1), v: mx }), cta: 'invest' };
}

/* 1.12.0 "Vstup: …" – one plain line WHEN and AT WHAT PRICE to enter, built from the same cardState (so the line,
   the badge and the button can never disagree). null for my own / ended signals. */
export function entryLine(s, data = null, now = clock(), cs = null, short = false) {
  const k = (x) => (short ? 'es.' : 'en.') + x;
  const c = cs || cardState(s, data, now);
  const sell = s.action === 'SELL';
  const e = spx(s, s.entry);
  const mxe = spx(s, maxEntry(s));
  if (c.code === 'buy') {
    return { code: 'now', text: t(sell ? k('nowSell') : k('now'), { c: F.time(new Date(nyCloseAfter(+now))), v: mxe }) };
  }
  if (c.code === 'soon') {
    const o = nextUsOpen(now);
    const days = o ? F.daysUntil(o, now) : 1;
    const day = days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(o);
    return { code: 'soon', text: t(sell ? k('soonSell') : k('soon'), { day, time: o ? F.time(o) : '15:30', v: mxe }) };
  }
  if (c.code === 'wait') return { code: 'wait', text: t(sell ? k('waitSell') : k('wait'), { v: mxe, d: s.exit_date ? F.dm(s.exit_date) : '–' }) };
  if (c.code === 'late') return { code: 'late', text: t(k('late')) };
  if (c.code === 'order' && c.ord) return { code: 'order', text: t(sell ? k('orderSell') : k('order'), { v: spx(s, c.ord.limit) }) };
  return null;
}

/* 1.9.1: the example on every signal card – "Vlož např. 10 000 Kč → při cíli +1 880 Kč, při stopu −940 Kč".
   Same function as the investment sheet preview (wallet.outcome, leverage 1:1), so the numbers match everywhere. */
export const EXAMPLE_DEP = { CZK: 10000, EUR: 400, USD: 500 };
/* 1.10.0: four amount chips from the minimum up (owner: "od 100 Kč") */
export const DEP_CHIPS = { CZK: [100, 1000, 5000, 10000], EUR: [4, 40, 200, 400], USD: [5, 50, 250, 500] };
export const DEP_MIN = { CZK: 100, EUR: 4, USD: 5 };
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


/* ---------- 1.10.0: a signal as a clearly named "campaign" ----------
   "Exxon Mobil nahoru #11" – plain name + direction + a short stable number.
   Official signals carry a running counter at the end of the id (DNY-2026-11-10-XOM-11 -> #11);
   intraday previews (counter >= 900000) get a stable 4-digit number hashed from the id. */
export function sigNo(s) {
  const m = /-(\d+)$/.exec(String(s?.id || ''));
  if (m && +m[1] < 900000) return +m[1];
  let h = 2166136261;
  for (const c of String(s?.id || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return 1000 + (h % 9000);
}
/* phase of the SIGNAL itself (not of the user): open = can still enter · running = too late to enter · closed */
export function sigPhase(s, now = clock()) {
  if (isDoneSig(s, now)) return 'closed';
  const est = entryState(s, now);
  return est && (est.code === 'ok' || est.code === 'limit') ? 'open' : 'running';
}
/* days a signal lasts: open -> until the exit date (from today), closed -> from publish to close */
export function sigDays(s, now = clock()) {
  if (isDoneSig(s, now)) {
    const a = F.toDate(s.created_at), b = F.toDate(s.closed_at || s.hit_at || s.exit_date);
    if (!a || !b || Number.isNaN(+a) || Number.isNaN(+b)) return null;
    const a0 = new Date(a); a0.setHours(0, 0, 0, 0);
    const b0 = new Date(b); b0.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((b0 - a0) / 86400000));
  }
  return s.exit_date ? Math.max(0, F.daysUntil(s.exit_date, now)) : null;
}
export const closeDate = (s) => s.closed_at || s.hit_at || null;

/* The price the investment sheet starts from (the SAME rule as views/terminal.js ticket):
   a limit order (button "Nastavit nákup za …", or the market of the instrument is closed) -> the signal's entry,
   otherwise "buy now" -> the current price (wallet.priceOf). */
export function investBase(s, data, now = clock()) {
  const cs = cardState(s, data, now);
  const q = data ? priceOf(s.symbol, data) : null;
  const lim = cs.cta === 'limit' || !M.isOpen(s.symbol);
  /* 1.13.6: a limit / at-open order starts at maxEntry (= the sheet's limit price) */
  if (lim || !q || !(q.p > 0)) return { px: maxEntry(s), lim: true, mode: cs.cta === 'invest' ? 'now' : 'limit' };
  /* 1.13.1: "buy now" starts at the ask (a sell at the bid) - the same price the sheet's button and the position use */
  return { px: q.p + (s.action === 'SELL' ? -1 : 1) * M.spread(s.symbol, q.p) / 2, lim: false, mode: 'now' };
}

/* THE money numbers of a signal for a deposit (card, detail, invest sheet – one function):
   maxLoss = the result at the stop (the trade is closed there; capped at the deposit), potential = at the robot's target.
   1.13.1: lev defaults to the user's profile and the deposit is sized from the same base price -> one number everywhere. */
export function offerNums(s, data, { amount = null, lev = null, base = null, sl = null, tp = null, now = clock() } = {}) {
  const ccy = walletCcy();
  const L = lev ?? profileLev(s.symbol);
  const px = base ?? investBase(s, data, now).px;
  const a = amount ?? stakeFor(s, { lev: L, px });
  const side = s.action === 'SELL' ? 'SELL' : 'BUY';
  const o = outcome({ side, entry: px, amount: a, lev: L, sl: sl ?? s.stop, tp: tp ?? s.target });
  return { amount: a, lev: L, ccy, base: px, maxLoss: o.atStop, potential: o.atTarget, potentialPct: o.atTarget != null && a > 0 ? (o.atTarget / a) * 100 : null };
}
/* result of a CLOSED signal for the example deposit (leverage 1:1): money + % (= zhodnocení of the deposit) */
/* 1.13.7: the SAME deposit (stakeFor) and the leverage of the chosen profile as an open signal's card -> Ukončené follow the profile */
export function closedNums(s) {
  const ccy = walletCcy();
  const lev = profileLev(s?.symbol);
  const a = stakeFor(s && s.entry > 0 && s.stop > 0 ? s : null, { lev });
  const pct = priceMove(s);
  /* the trade ends at the stop at worst: the money is capped at the deposit (as outcome() does) */
  const money = pct == null ? null : Math.max(-a, (a * lev * pct) / 100);
  return { amount: a, ccy, lev, pct, money, ret: money == null || !(a > 0) ? null : (money / a) * 100 };
}

/* ---------- 1.10.0: headline numbers – ONLY real closed signals from history.json (+ open signals that ended) ---------- */
export function closedSignals(data, now = clock()) {
  const vis = HORIZONS.filter((h) => !(CONFIG.HIDDEN_HORIZONS || []).includes(h));
  const hist = (data?.history?.signals || []).filter((x) => vis.includes(x.horizon));
  const ids = new Set(hist.map((x) => x.id));
  const ended = allOpen(data).filter((x) => vis.includes(x.horizon) && !x.preview && isDoneSig(x, now) && !ids.has(x.id) && (x.status !== 'open' || x.intraday_hit));
  return hist.concat(ended).sort((a, b) => String(closeDate(b) || b.exit_date || '').localeCompare(String(closeDate(a) || a.exit_date || '')));
}
export function headStats(data, now = clock()) {
  const list = closedSignals(data, now);
  const moves = list.map((x) => priceMove(x)).filter((v) => v != null && Number.isFinite(v));
  const wins = list.filter((x) => (x.result_r != null ? x.result_r > 0 : (priceMove(x) ?? 0) > 0)).length;
  const since = data?.performance?.equity?.[0]?.date || null;
  return { n: list.length, wins, winRate: list.length ? (wins / list.length) * 100 : null,
    avg: moves.length ? moves.reduce((a, v) => a + v, 0) / moves.length : null, since, list };
}
