// 1.9.0 – what can be traded on the Obchodní platforma, from ./data/instruments.json (written by our server):
// groups indexy / měny / komodity / krypto / akcie / ETF with plain names, currency, EU leverage cap, decimals, hours.
// Missing file or key -> the platform falls back to the 1.8 behaviour (signal symbols + US shares/ETFs, max 1:5).
// Also: market hours per instrument class, typical spreads, overnight fee and the TradingView symbol for the candles.
import { CONFIG } from '../config.js';
import * as Live from './live.js';
import { INSTR } from './instruments.js';
import { t, lang } from './i18n/index.js';

let REG = null; // { updated_at, groups, byKey }
export async function load() {
  const url = CONFIG.DATA.instruments;
  if (!url) return null;
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    if (!Array.isArray(j.groups)) return null;
    const byKey = {};
    j.groups.forEach((g) => (g.items || []).forEach((it) => { if (it && it.key) byKey[it.key] = { ...it, group: g.id }; }));
    REG = { ...j, byKey };
    return REG;
  } catch { return null; }
}
export const ready = () => !!REG;
export const get = (k) => REG?.byKey[k] || null;
export const groups = () => REG?.groups || [];
export const name = (k) => { const it = get(k); return it ? (lang() === 'cs' ? it.name_cs : it.name_en) || k : null; };

/* class: index | fx | commodity | crypto | stock | etf */
export function cls(k) {
  const it = get(k);
  if (it?.class) return it.class;
  const x = INSTR[k];
  return x?.k === 'etf' ? 'etf' : x?.k === 'index' ? 'index' : 'stock';
}
export function ccy(k) {
  return get(k)?.ccy || CONFIG.CALC.QUOTE_CCY?.[k] || 'USD';
}
const FX_MAJOR = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD'];
/* EU retail caps (ESMA): fx majors 30, other fx / major indices / gold 20, other commodities 10, shares & ETFs 5, crypto 2 */
export function maxLev(k) {
  const it = get(k);
  if (it?.max_leverage > 0) return Math.round(it.max_leverage);
  const C = CONFIG.CALC.LEVERAGE_CAPS || {};
  const c = cls(k);
  if (c === 'fx') return FX_MAJOR.includes(k) ? C.fx_major || 30 : C.fx || 20;
  if (c === 'commodity') return k === 'XAUUSD' ? C.gold || 20 : C.commodity || 10;
  return C[c] || CONFIG.CALC.LEVERAGE_MAX;
}
/* leverage steps for the chips: 1:1 ... max */
export function levSteps(max) {
  return [1, 2, 3, 5, 10, 20, 30].filter((x) => x <= max).concat([1, 2, 3, 5, 10, 20, 30].includes(max) ? [] : [max]).sort((a, b) => a - b);
}

/* ---------- market hours ---------- */
const zoned = (now, tz) => { const d = new Date(now.toLocaleString('en-US', { timeZone: tz })); return { wd: d.getDay(), m: d.getHours() * 60 + d.getMinutes() }; };
const SESS = {
  DE40: ['Europe/Berlin', 540, 1050], UK100: ['Europe/London', 480, 990], JP225: ['Asia/Tokyo', 540, 900],
};
function bySchedule(k, now) {
  const c = cls(k);
  if (c === 'crypto') return true;
  if (c === 'fx' || c === 'commodity') {
    /* around the clock Mon-Fri: Sunday 23:00 – Friday 23:00 Prague, commodities with a daily break 23:00–00:00 */
    const z = zoned(now, 'Europe/Prague');
    if (z.wd === 6) return false;
    if (z.wd === 0) return z.m >= 23 * 60;
    if (z.wd === 5 && z.m >= 23 * 60) return false;
    if (c === 'commodity' && z.m >= 23 * 60) return false;
    return true;
  }
  const s = SESS[k];
  if (s) { const z = zoned(now, s[0]); return z.wd >= 1 && z.wd <= 5 && z.m >= s[1] && z.m < s[2]; }
  const z = zoned(now, 'America/New_York');
  return z.wd >= 1 && z.wd <= 5 && z.m >= 570 && z.m < 960;
}
/* open now? the server's flag (quotes.json "open") wins while it is fresh */
export function isOpen(k, now = new Date()) {
  const m = Live.meta(k);
  if (m && typeof m.open === 'boolean' && Date.now() - (m.at || 0) < 10 * 60000) return m.open;
  return bySchedule(k, now);
}
export function hours(k) {
  const it = get(k);
  if (it?.hours_cs && lang() === 'cs') return it.hours_cs;
  if (it?.hours_en) return it.hours_en;
  /* no English hours from the server: translate the Czech ones (Prague time) */
  if (it?.hours_cs) return `${it.hours_cs.replace(/Po/g, 'Mon').replace(/Pá/g, 'Fri').replace(/Ne/g, 'Sun').replace(/nonstop/g, '24/7').replace(/pauza/g, 'break')} CET`;
  return t(`hours.${cls(k) === 'stock' || cls(k) === 'etf' ? 'us' : cls(k)}`);
}
/* schedule only (no server flag) - used by the tests */
export const schedOpen = (k, now = new Date()) => bySchedule(k, now);
export const delayed = (k) => !!Live.meta(k)?.delayed;

/* ---------- costs like a real CFD broker (approximate, explained in the ticket) ---------- */
const SPREAD_PT = { EURUSD: 0.00008, GBPUSD: 0.00012, USDJPY: 0.009, USDCHF: 0.00012, AUDUSD: 0.0001, EURCZK: 0.03, USDCZK: 0.03,
  US500: 0.5, US100: 1.5, US30: 2.5, DE40: 1.5, UK100: 1.0, JP225: 10, XAUUSD: 0.3, XAGUSD: 0.03, WTI: 0.03, BRENT: 0.03, NATGAS: 0.005 };
const SPREAD_PCT = { stock: 0.05, etf: 0.05, crypto: 0.15, index: 0.02, fx: 0.01, commodity: 0.05 };
/* full spread in price units at price px */
export function spread(k, px) {
  if (SPREAD_PT[k] != null) return SPREAD_PT[k];
  return (px || 0) * (SPREAD_PCT[cls(k)] ?? 0.05) / 100;
}
/* overnight fee per night as a share of the traded amount (benchmark rate of the instrument currency + 2.5 % a year / 360) */
const BENCH = { USD: 4.0, EUR: 2.0, CZK: 3.5, GBP: 4.0, JPY: 0.5, CHF: 0.5, AUD: 3.6 };
export function swapRate(k, side) {
  const b = BENCH[ccy(k)] ?? 3;
  const yearly = side === 'SELL' ? 2.5 : b + 2.5;
  return yearly / 100 / 360;
}
export const CONV_FEE = 0.005; // 0.5 % of the result when the instrument currency differs from the account currency

/* decimals for prices */
export function decimals(k, px) {
  const it = get(k);
  if (it?.decimals != null) return it.decimals;
  return px >= 1000 ? 2 : px >= 1 ? 2 : 4;
}

/* ---------- TradingView symbol for the candlestick chart ---------- */
const TV = { US500: 'SP:SPX', US100: 'NASDAQ:NDX', US30: 'DJ:DJI', DE40: 'XETR:DAX', UK100: 'FTSE:UKX', JP225: 'TVC:NI225',
  EURUSD: 'FX:EURUSD', GBPUSD: 'FX:GBPUSD', USDJPY: 'FX:USDJPY', USDCHF: 'FX:USDCHF', AUDUSD: 'FX:AUDUSD', EURCZK: 'FX_IDC:EURCZK', USDCZK: 'FX_IDC:USDCZK',
  XAUUSD: 'OANDA:XAUUSD', XAGUSD: 'OANDA:XAGUSD', WTI: 'TVC:USOIL', BRENT: 'TVC:UKOIL', NATGAS: 'TVC:NATURALGAS',
  BTCUSD: 'COINBASE:BTCUSD', ETHUSD: 'COINBASE:ETHUSD', SOLUSD: 'COINBASE:SOLUSD',
  JPM: 'NYSE:JPM', V: 'NYSE:V', KO: 'NYSE:KO', PLTR: 'NASDAQ:PLTR', SPY: 'AMEX:SPY', DIA: 'AMEX:DIA', GLD: 'AMEX:GLD', QQQ: 'NASDAQ:QQQ' };
export const tvSym = (k) => TV[k] || null;

/* plain search text for the picker */
export function searchText(k) {
  const it = get(k);
  const x = INSTR[k];
  return [k, it?.name_cs, it?.name_en, x?.cs, x?.en].filter(Boolean).join(' ').toUpperCase();
}
