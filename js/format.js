// Locale-aware formatting (Intl). True minus sign (U+2212) for negatives.
import { t, tag, lang } from './i18n/index.js';

const MINUS = '\u2212';
const cache = new Map();
function nf(min, max) {
  const k = `${tag()}:${min}:${max}`;
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(tag(), { minimumFractionDigits: min, maximumFractionDigits: max }));
  return cache.get(k);
}
function dtf(name, opts) {
  const k = `${tag()}:${name}`;
  if (!cache.has(k)) cache.set(k, new Intl.DateTimeFormat(tag(), opts));
  return cache.get(k);
}

export function num(v, dec = 2, minDec = dec) {
  if (v == null || Number.isNaN(v)) return '–';
  const s = nf(minDec, dec).format(Math.abs(v));
  return (v < 0 && Math.abs(v) >= 0.5 * 10 ** -dec ? MINUS : '') + s;
}

export function signed(v, dec = 2, minDec = dec) {
  if (v == null || Number.isNaN(v)) return '–';
  const s = nf(minDec, dec).format(Math.abs(v));
  if (Math.abs(v) < 0.5 * 10 ** -dec) return s;
  return (v < 0 ? MINUS : '+') + s;
}

const pctSep = () => t('fmt.pctSep');
export const pct = (v, dec = 1) => num(v, dec) + pctSep() + '%';
export const spct = (v, dec = 1) => signed(v, dec) + pctSep() + '%';
/* 1.13.2 ONE rule for the % of my money: 1 decimal; when the money is not 0 but the % rounds to 0, show ±0,1 % (never "0,00 %") */
export function mpct(v, money = null) {
  if (v == null || !Number.isFinite(v)) return '–';
  const x = Math.round(v * 10) / 10;
  /* 1.15.0 (K2-11): money that is not 0 but under 0,05 % is "<0,1 %" – never a rounded-up −0,1 % (−2 Kč on 100 000 Kč) */
  if (x === 0 && money != null && Math.abs(money) >= 0.5) return `<${num(0.1, 1)}${pctSep()}%`;
  return spct(x, 1);
}
export const sr = (v, dec = 2) => signed(v, dec) + '\u00a0R';

/* dec (1.9.0): the instrument's own decimals (currencies 4–5, indices 2) when known */
export function price(v, dec = null) {
  if (v == null) return '–';
  if (dec != null) return num(v, dec);
  const a = Math.abs(v);
  return a >= 5000 ? num(v, 0) : a >= 1000 ? num(v, 1, 1) : a >= 10 ? num(v, 2) : a >= 2 ? num(v, 3) : num(v, 5);
}

/* 1.13.0: a price with its currency, always 2 decimals (4 under 2): "164,47 $" */
const SIGN = { USD: '$', EUR: '€', GBP: '£', CZK: 'Kč', JPY: '¥', CHF: 'CHF' };
export const ccySign = (c) => SIGN[c] || c || '$';
export function pxc(v, ccy = 'USD') {
  if (v == null || !Number.isFinite(+v)) return '–';
  return ccyWrap(num(+v, Math.abs(v) < 2 ? 4 : 2), ccy);
}
/* 1.13.1: English puts $ € £ in front ("$164.47"), Czech after ("164,47 $") */
export function ccyWrap(n, ccy) {
  if (!isCs() && ['USD', 'EUR', 'GBP'].includes(ccy)) return n.startsWith(MINUS) ? `${MINUS}${ccySign(ccy)}${n.slice(1)}` : `${ccySign(ccy)}${n}`;
  return `${n} ${ccySign(ccy)}`;
}
/* 1.13.1: robot text with raw data values -> plain local formats ("2026-12-11" -> "11. 12. 2026", "315.34" -> "315,34") */
export function human(txt) {
  if (typeof txt !== 'string' || !txt) return txt || '';
  return txt
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => dmy(`${y}-${mo}-${d}`))
    .replace(/(^|[^\d.,])(\d+)\.(\d+)(?!\d|\.\d)/g, (m, pre, a, b) => `${pre}${num(+`${a}.${b}`, b.length, b.length)}`);
}

export function money(v, ccy = 'CZK', dec) {
  if (v == null || !Number.isFinite(v)) return '–';
  const d = dec ?? (ccy === 'CZK' ? 0 : Math.abs(v) >= 1000 ? 0 : 2);
  const k = `${tag()}:cur:${ccy}:${d}`;
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(tag(), { style: 'currency', currency: ccy, minimumFractionDigits: d, maximumFractionDigits: d }));
  return cache.get(k).format(v).replace('-', MINUS);
}

export const rr = (v) => '1\u202f:\u202f' + num(v, 1, 1);

/* Dates */
export const toDate = (s) => (s instanceof Date ? new Date(s.getTime()) : s && s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s));
const isCs = () => lang() === 'cs';
export const dm = (s) => dtf('dm', isCs() ? { day: 'numeric', month: 'numeric' } : { day: 'numeric', month: 'short' }).format(toDate(s)).replace(/\s/g, '\u00a0');
export const dmy = (s) => dtf('dmy', isCs() ? { day: 'numeric', month: 'numeric', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(s)).replace(/\s/g, '\u00a0');
export const time = (s) => dtf('time', { hour: '2-digit', minute: '2-digit', hour12: false }).format(toDate(s));
export const weekday = (s) => dtf('wd', { weekday: 'long' }).format(toDate(s));
/* 1.15.0: short weekday for narrow chips (EN "Wednesday" was cut at 390 px) */
export const weekdayShort = (s) => dtf('wds', { weekday: 'short' }).format(toDate(s)).replace('.', '');
export const monthYear = (s) => { const m = dtf('my', { month: 'long', year: 'numeric' }).format(toDate(s)); return m.charAt(0).toUpperCase() + m.slice(1); };
export const monthName = (s) => { const m = dtf('mn', { month: 'long' }).format(toDate(s)); return m.charAt(0).toUpperCase() + m.slice(1); };
export const monShort = (s) => dtf('ms', { month: 'short' }).format(toDate(s)).replace('.', '');
export const dmTime = (s) => `${dm(s)} ${time(s)}`;

export function dayKey(d) {
  const x = toDate(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Plural unit word via Intl.PluralRules, e.g. unit('day', 3) */
export const unit = (u, n) => t(`unit.${u}`, { n });

export function daysUntil(dateStr, now = new Date()) {
  const a = toDate(dateStr); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400000);
}

export function countdown(dateStr, now = new Date()) {
  const d = daysUntil(dateStr, now);
  if (d < 0) return t('fmt.overdue');
  if (d === 0) return t('fmt.today');
  if (d === 1) return t('fmt.tomorrow');
  return t('fmt.inDays', { n: d, unit: unit('day', d) });
}

export function ago(iso, now = new Date()) {
  const m = Math.round((now - toDate(iso)) / 60000);
  if (m < 1) return t('fmt.justNow');
  if (m < 60) return t('fmt.minAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('fmt.hAgo', { n: h });
  const d = Math.floor(h / 24);
  return t('fmt.dAgo', { n: d });
}

const proxy = (prefix) => new Proxy({}, { get: (_, k) => (typeof k === 'string' ? t(prefix + k) : undefined) });
export const HZ_LABEL = proxy('hz.');
export const HZ_HINT = proxy('hzHint.');
export const CLASS_LABEL = proxy('class.');
export const STATUS_LABEL = proxy('status.');
export const SIDE = proxy('side.');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Parse user number input in Czech or English notation */
/* 1.13.8 a typed PRICE (Stop / Cíl / limit): "7 390,80", "7390.80", "7,390.80", "7.390,80" -> 7390.8 – comma or dot as the
   decimal mark in both languages; with both marks the last one is the decimal; a lone comma in English with exactly
   3-digit groups ("7,390") is a thousands separator */
export function parsePx(s) {
  if (typeof s === 'number') return s;
  let x = String(s ?? '').replace(/[\s  ']/g, '').replace(/[−–]/g, '-');
  const c = x.lastIndexOf(','), d = x.lastIndexOf('.');
  if (c >= 0 && d >= 0) x = c > d ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (c >= 0) x = lang() === 'en' && /^-?\d{1,3}(,\d{3})+$/.test(x) ? x.replace(/,/g, '') : (x.split(',').length === 2 ? x.replace(',', '.') : x.replace(/,/g, ''));
  else if (d >= 0 && x.split('.').length > 2) x = x.replace(/\./g, '');
  const v = parseFloat(x);
  return Number.isFinite(v) && /^-?\d*\.?\d+$/.test(x) ? v : NaN;
}
export function parseNum(s) {
  if (typeof s === 'number') return s;
  let x = String(s ?? '').replace(/[\s\u00a0\u202f]/g, '');
  if (lang() === 'en') x = x.replace(/,/g, ''); else x = x.replace(',', '.');
  const v = parseFloat(x);
  return Number.isFinite(v) ? v : NaN;
}
