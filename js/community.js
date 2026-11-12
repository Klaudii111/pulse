// 1.12.0 "Jak se daří lidem": anonymous, opt-in sharing of my play-money trades + the community numbers.
// Default OFF. When ON: POST /api/community/trades {cid, nick, profile, ccy, trades[]} whenever my trades change
// (debounced, max 300, only when the list really changed). Switching OFF: DELETE /api/community/me {cid}.
// cid = a random uuid v4 made on this device; nothing personal (no name, e-mail, IP stored by the server, no amounts in money).
import { CONFIG } from '../config.js';
import * as store from './store.js';
import * as B from './brief.js';

const KEY = 'share';
const SENT = 'shareSent';
/* 1.15.0: the server knows three labels; the two new leveraged styles (Odvážně, Naplno = 1:5) count as agresivneji */
const PROF = { cons: 'konzervativne', bal: 'vyvazene', bold: 'agresivneji', full: 'agresivneji', aggr: 'agresivneji', own: 'agresivneji' };
const KEY_RE = /^[A-Za-z0-9._^=-]{1,20}$/;
const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
export const NICK_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_ .-]{0,19}$/u;

export const enabled = () => !!CONFIG.COMMUNITY?.ENABLED;
export const settings = () => { const s = store.get(KEY, null); return { on: !!s?.on, nick: typeof s?.nick === 'string' ? s.nick : '' }; };

function uuid4() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* old browser */ }
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function cid() {
  let c = store.get('cid', null);
  if (typeof c !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(c)) { c = uuid4(); store.set('cid', c); }
  return c;
}
export const profile = () => PROF[B.levProfile().id] || 'konzervativne';

const iso = (ms) => (ms > 0 ? new Date(ms).toISOString() : null);
const r6 = (v) => Math.round(v * 1e6) / 1e6;
/* my trades in the server contract (closed first = newest, then the open ones), max 300 */
export function trades() {
  const w = store.get('wallet', null);
  if (!w) return [];
  const res = (p) => (p.pnl > 0.5 ? 'win' : p.pnl < -0.5 ? 'loss' : 'be');
  const ok = (p) => p && KEY_RE.test(p.sym || '') && p.entry > 0 && ID_RE.test(String(p.id)) && p.openedAt > 0;
  const sid = (p) => (p.sigId && ID_RE.test(p.sigId) ? p.sigId : null);
  const open = (w.positions || []).filter(ok).map((p) => ({ id: String(p.id), signal_id: sid(p), key: p.sym, side: p.side === 'SELL' ? 'SELL' : 'BUY', lev: Math.min(100, Math.max(1, p.lev || 1)),
    opened_at: iso(p.openedAt), closed_at: null, entry: r6(p.entry), exit: null, pnl_pct_deposit: null, result: 'open' }));
  const closed = (w.closed || []).filter((p) => ok(p) && p.exit > 0 && p.closedAt > 0).map((p) => ({ id: String(p.id), signal_id: sid(p), key: p.sym, side: p.side === 'SELL' ? 'SELL' : 'BUY',
    lev: Math.min(100, Math.max(1, p.lev || 1)), opened_at: iso(p.openedAt), closed_at: iso(p.closedAt), entry: r6(p.entry), exit: r6(p.exit),
    pnl_pct_deposit: Math.round(Math.max(-1000, Math.min(1000, p.pnlPct || 0)) * 100) / 100, result: res(p) }));
  return open.concat(closed).slice(0, 300);
}
export function payload() {
  const s = settings();
  const w = store.get('wallet', null);
  return { cid: cid(), nick: s.nick || null, profile: profile(), ccy: ['CZK', 'EUR', 'USD'].includes(w?.ccy) ? w.ccy : 'CZK', trades: trades() };
}

let timer = null;
let lastErr = null;
export const lastError = () => lastErr;
async function send(force = false) {
  timer = null;
  if (!enabled() || !settings().on) return { ok: false, reason: 'off' };
  const p = payload();
  const sig = JSON.stringify(p);
  if (!force && store.get(SENT, null) === sig) return { ok: true, same: true };
  try {
    const r = await fetch(CONFIG.COMMUNITY.TRADES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sig });
    if (r.ok) { store.set(SENT, sig); lastErr = null; return { ok: true }; }
    let e = `http${r.status}`;
    try { e = (await r.json()).error || e; } catch { /* no body */ }
    lastErr = e;
    return { ok: false, reason: e };
  } catch { lastErr = 'net'; return { ok: false, reason: 'net' }; }
}
/* called after every wallet change; cheap when nothing changed */
export function sync(delay = 1500) {
  if (!enabled() || !settings().on) return;
  clearTimeout(timer);
  timer = setTimeout(() => { send(); }, delay);
}
export const sendNow = () => { clearTimeout(timer); return send(true); };

export async function setOn(on, nick = settings().nick) {
  store.set(KEY, { on: !!on, nick });
  if (on) return sendNow();
  clearTimeout(timer);
  store.del(SENT);
  if (!enabled()) return { ok: true };
  try {
    const r = await fetch(CONFIG.COMMUNITY.ME_URL, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid: cid() }) });
    return { ok: r.ok };
  } catch { return { ok: false, reason: 'net' }; }
}
export function setNick(nick) {
  const n = String(nick || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (n && !NICK_RE.test(n)) return { ok: false, reason: 'bad_nick' };
  store.set(KEY, { ...settings(), nick: n });
  return { ok: true, nick: n };
}

/* ---------- community.json ---------- */
let doc = null, loadedAt = 0, loading = null, tried = false;
export const data = () => doc;
export const tried0 = () => tried;
export async function load(force = false) {
  if (!CONFIG.DATA.community) return null;
  if (!force && doc && Date.now() - loadedAt < 10 * 60000) return doc;
  if (loading) return loading;
  loading = fetch(CONFIG.DATA.community, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && typeof j === 'object') { doc = j; loadedAt = Date.now(); } return doc; })
    .catch(() => doc).finally(() => { loading = null; tried = true; });
  return loading;
}
/* "Vzalo ho 12 lidí, 8 vydělalo" for a signal, or null */
export function forSignal(id) {
  const p = doc?.per_signal?.[id];
  if (!p || !(p.takers > 0)) return null;
  const wins = p.closed > 0 && p.win_rate != null ? Math.round((p.closed * p.win_rate) / 100) : null;
  return { takers: p.takers, closed: p.closed, wins, avg: p.avg_pnl_pct };
}
