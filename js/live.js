/*
 * Live prices through our own proxy (Cloudflare Worker, CONFIG.LIVE.PROXY_URL), polled while the app is visible.
 * Patches open signals in place (last_price, P&L, progress, price path, intraday hit) and
 * notifies listeners at most every LIVE.RENDER_MS. The bot's own data stays the source of truth:
 * a live price is applied only when it is newer than the bot's last_price_at.
 */
import { CONFIG } from '../config.js';

const L = CONFIG.LIVE || {};
const prices = new Map();          // symbol -> { p, t (ms) }
const listeners = new Set();
let getData = () => null;
let dirty = false, flushTimer = null, lastTickAt = 0;

/* Proxy mode: our Cloudflare Worker holds the API key; every user gets live prices with no setup. */
const proxy = () => (L.PROXY_URL || '').replace(/\/$/, '');
export const usesProxy = () => !!proxy();
export const enabled = () => !!proxy();
let pollTimer = null, polledKey = '';

async function pollProxy() {
  clearTimeout(pollTimer);
  if (document.visibilityState !== 'visible' || !proxy()) return;
  const syms = symbols();
  polledKey = syms.join(',');
  if (syms.length) {
    try {
      const r = await fetch(`${proxy()}/q?s=${encodeURIComponent(syms.join(','))}`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        let any = false;
        Object.entries(j.q || {}).forEach(([sym, q]) => {
          if (!q || !(q.p > 0) || !q.t) return;
          const cur = prices.get(sym);
          if (!cur || q.t > cur.t || q.p !== cur.p) { prices.set(sym, { p: q.p, t: Math.max(q.t, cur?.t || 0), pc: q.pc }); any = true; }
        });
        if (marketOpen()) lastTickAt = Date.now();
        if (any) mark();
      }
    } catch { /* offline: try again later */ }
  }
  pollTimer = setTimeout(pollProxy, (marketOpen() ? (L.POLL_SEC || 10) : 120) * 1000);
}
export const onLive = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const lastTick = () => lastTickAt;

/* US regular session in New York time (Mon-Fri 9:30-16:00). Holidays are not modelled. */
export function marketOpen(now = new Date()) {
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const d = ny.getDay(), m = ny.getHours() * 60 + ny.getMinutes();
  return d >= 1 && d <= 5 && m >= 570 && m < 960;
}

/* "streaming" = market open and a tick arrived in the last 2 minutes */
export function status(now = Date.now()) {
  if (!enabled()) return 'off';
  if (!marketOpen(new Date(now))) return 'closed';
  return now - lastTickAt < 120000 ? 'streaming' : 'waiting';
}

function openSignals(data) {
  const out = [];
  const tr = data?.signals?.tracks || {};
  Object.values(tr).forEach((list) => (list || []).forEach((s) => {
    if (s.status === 'open' && !s.intraday_hit && s.symbol) out.push(s);
  }));
  return out;
}

/* SPY rides along: the Results chart draws today's live point of the S&P 500 next to the robot. */
const symbols = () => [...new Set(openSignals(getData()).map((s) => s.symbol).concat('SPY'))].slice(0, 50);
export const quote = (sym) => prices.get(sym) || null;
const nyDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/* Apply known live prices to the current data object. Returns true when anything changed. */
export function apply(data = getData()) {
  let changed = false;
  openSignals(data).forEach((s) => {
    const q = prices.get(s.symbol);
    if (!q) return;
    const prevT = s.last_price_at ? Date.parse(s.last_price_at) : 0;
    if (q.t < prevT || (q.t === prevT && q.p === s.last_price)) return;
    const dir = s.action === 'SELL' ? -1 : 1;
    const iso = new Date(q.t).toISOString();
    s.last_price = q.p;
    s.last_price_at = iso;
    s.live = true;
    if (s.entry > 0) s.pnl_pct_position = Math.round(((q.p - s.entry) / s.entry) * 100 * dir * 1000) / 1000;
    const risk = Math.abs(s.entry - s.stop);
    if (risk > 0) s.pnl_r = Math.round(((q.p - s.entry) * dir / risk) * 1000) / 1000;
    if (s.target != null && s.target !== s.entry) {
      const pr = (q.p - s.entry) / (s.target - s.entry);
      s.progress = Math.round(Math.max(-1, Math.min(1, pr)) * 1000) / 1000;
    }
    /* Live points build the intraday line: a new point every 5 minutes, the newest one follows the price. */
    const path = s.price_path || (s.price_path = []);
    const last = path[path.length - 1];
    if (last && last.live && nyDay(Date.parse(last.t)) === nyDay(q.t) && q.t - Date.parse(last.t0 || last.t) < 300000) { last.p = q.p; last.t = iso; }
    else if (!last || Date.parse(last.t) < q.t) { path.push({ t: iso, t0: iso, p: q.p, live: true }); if (path.length > 600) path.splice(0, path.length - 600); }
    if (s.created_at && Date.parse(s.created_at) < q.t) {
      const hitStop = dir > 0 ? q.p <= s.stop : q.p >= s.stop;
      const hitTarget = s.target != null && (dir > 0 ? q.p >= s.target : q.p <= s.target);
      if (hitStop || hitTarget) { s.intraday_hit = hitStop ? 'stop' : 'target'; s.hit_at = iso; s.live_hit = true; }
    }
    changed = true;
  });
  return changed;
}

function mark() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!dirty) return;
    dirty = false;
    if (apply()) listeners.forEach((fn) => { try { fn(); } catch { /* view errors must not stop the stream */ } });
  }, L.RENDER_MS || 1500);
}

function stop() {
  clearTimeout(pollTimer); pollTimer = null; polledKey = '';
}

function start() {
  if (!enabled() || document.visibilityState !== 'visible') return;
  pollProxy();
}

/* Call once at boot. `dataGetter` returns the app's live data object. */
export function initLive(dataGetter) {
  getData = dataGetter;
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? start() : stop()));
  start();
}

/* Call after new bot data arrived: re-apply live prices and resubscribe to the new symbol set. */
export function onData() {
  if (!enabled()) return;
  apply();
  if (symbols().join(',') !== polledKey) pollProxy();
}
