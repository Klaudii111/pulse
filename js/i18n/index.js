// Tiny i18n layer. Add a language: create js/i18n/<id>.js with the same keys as cs.js,
// import it below and add it to LOCALES. Missing keys fall back to Czech.
import * as store from '../store.js';
import cs from './cs.js';
import en from './en.js';
import cs19 from './cs19.js';
import en19 from './en19.js';
import cs110 from './cs110.js';
import en110 from './en110.js';
import cs111 from './cs111.js';
import en111 from './en111.js';
import cs112 from './cs112.js';
import en112 from './en112.js';
import cs113 from './cs113.js';
import en113 from './en113.js';
import cs114 from './cs114.js';
import en114 from './en114.js';
import cs115 from './cs115.js';
import en115 from './en115.js';
import cs116 from './cs116.js';
import en116 from './en116.js';
import cs117 from './cs117.js';
import en117 from './en117.js';
import cs118 from './cs118.js';
import en118 from './en118.js';
import cs119 from './cs119.js';
import en119 from './en119.js';

export const LOCALES = [
  { id: 'cs', label: 'Čeština', tag: 'cs-CZ' },
  { id: 'en', label: 'English', tag: 'en-GB' },
];
/* 1.9.0 texts live in cs19.js / en19.js and win over older keys of the same name (e.g. nav.terminalShort) */
const DICTS = { cs: { ...cs, ...cs19, ...cs110, ...cs111, ...cs112, ...cs113, ...cs114, ...cs115, ...cs116, ...cs117, ...cs118, ...cs119 }, en: { ...en, ...en19, ...en110, ...en111, ...en112, ...en113, ...en114, ...en115, ...en116, ...en117, ...en118, ...en119 } };
const FALLBACK = 'cs';

function detect() {
  const saved = store.get('lang');
  if (saved && DICTS[saved]) return saved;
  const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'cs']).map((l) => String(l).toLowerCase());
  for (const l of langs) {
    const base = l.split('-')[0];
    if (base === 'sk') return 'cs'; // Slovak readers default to Czech until sk.js exists
    if (DICTS[base]) return base;
  }
  return 'en';
}

let cur = detect();
const plurals = new Map();

export const lang = () => cur;
export const tag = () => (LOCALES.find((l) => l.id === cur) || LOCALES[0]).tag;

export function setLang(id) {
  if (!DICTS[id]) return;
  cur = id;
  store.set('lang', id);
  document.documentElement.lang = id;
}
document.documentElement.lang = cur;

function lookup(dict, key) {
  if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  return undefined;
}

function pluralForm(n) {
  if (!plurals.has(cur)) plurals.set(cur, new Intl.PluralRules(tag()));
  return plurals.get(cur).select(n);
}

/** Translate. Values may be strings with {param}, plural objects {one, few, many, other} keyed by params.n, or functions. */
export function t(key, params = {}) {
  let v = lookup(DICTS[cur], key);
  if (v === undefined) v = lookup(DICTS[FALLBACK], key);
  if (v === undefined) return key;
  if (typeof v === 'function') return v(params);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const n = Math.abs(Number(params.n ?? 0));
    v = v[pluralForm(n)] ?? v.other ?? v.many ?? Object.values(v)[0];
  }
  if (typeof v !== 'string') return v;
  return v.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}

/** Raw value (arrays/objects such as lessons). */
export function tr(key) {
  const v = lookup(DICTS[cur], key);
  return v === undefined ? lookup(DICTS[FALLBACK], key) : v;
}

/** Localize a value coming from the bot: plain string or {cs: "...", en: "..."}. */
export function L(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v[cur] ?? v[FALLBACK] ?? v.en ?? Object.values(v)[0] ?? '';
  return String(v);
}
