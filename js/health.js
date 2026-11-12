// 1.11.0 – the robot's watchdog (health.json, contract: PULSE/VYZKUM/uceni/HEALTH_JSON.md) and signal quality.
// Missing / broken health.json -> every function answers "nothing known" and the app behaves like 1.10.
import { CONFIG } from '../config.js';
import * as D from './domain.js';
import { lang } from './i18n/index.js';

/* the health object of the current data (null when the file is missing or not in the expected shape) */
export function of(data) {
  const h = data?.health;
  return h && Array.isArray(h.strategies) ? h : null;
}
export function strat(data, hz) {
  return of(data)?.strategies.find((x) => (x.horizon || x.id) === hz) || null;
}
export const status = (data, hz) => strat(data, hz)?.status || null;
/* "vypnuto": the robot does not trade nor announce new signals of this strategy -> the app does not offer them */
export const isOff = (data, hz) => status(data, hz) === 'vypnuto';
export const isWatch = (data, hz) => status(data, hz) === 'sleduj';
/* horizons shown in the app whose strategy is switched off right now */
export const offHorizons = (data) => D.HORIZONS.filter((h) => !(CONFIG.HIDDEN_HORIZONS || []).includes(h) && isOff(data, h));

/* a signal the app may OFFER as a new entry: its strategy is not switched off (the user's own trades stay visible) */
export function offerable(s, data) {
  return !isOff(data, s.horizon);
}

/* plain text of a health field in the current language: <key>_en for English when present, else null (caller builds it) */
export function txt(obj, key) {
  if (!obj) return null;
  if (lang() === 'cs') return obj[`${key}_cs`] || null;
  return obj[`${key}_en`] || null;
}

/* ---------- signal strength (Síla signálu) ----------
   reward : risk of entering NOW (live price for "buy now", the signal's entry for a limit order),
   from the signal's own stop and target – no other inputs. 3 dots >= 2.5 · 2 dots >= 1.8 · 1 dot below. */
export function rrNow(s, data, now = D.clock()) {
  const px = D.investBase(s, data, now).px;
  const sell = s.action === 'SELL';
  if (px > 0 && s.stop > 0 && s.target > 0) {
    const reward = sell ? px - s.target : s.target - px;
    const risk = sell ? s.stop - px : px - s.stop;
    if (risk > 0 && reward > 0) return reward / risk;
    if (risk > 0 && reward <= 0) return 0;
  }
  return Number.isFinite(+s.rr) && +s.rr > 0 ? +s.rr : null;
}
export function dots(rr) {
  if (rr == null) return 0;
  return rr >= 2.5 ? 3 : rr >= 1.8 ? 2 : 1;
}
const STATUS_RANK = { ok: 0, sleduj: 1 };
/* 1.12.0: fresher first, then strategy ok before sleduj (the reward:risk dots are gone – they did not hold out-of-sample) */
export function sortByQuality(list, data) {
  const st = (s) => STATUS_RANK[status(data, s.horizon)] ?? 0;
  return list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || (st(a) - st(b)));
}
