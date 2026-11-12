/*
 * Live prices through our own proxy (Cloudflare Worker, CONFIG.LIVE.PROXY_URL), polled while the app is visible.
 * Patches open signals in place (last_price, P&L, progress, price path, intraday hit) and
 * notifies listeners at most every LIVE.RENDER_MS. The bot's own data stays the source of truth:
 * a live price is applied only when it is newer than the bot's last_price_at.
 */
import { CONFIG } from '../config.js';
import * as F from './format.js';
import { t } from './i18n/index.js';

const L = CONFIG.LIVE || {};
const prices = new Map();          // symbol -> { p, t (ms) }
const listeners = new Set();
let getData = () => null;
let dirty = false, flushTimer = null, lastTickAt = 0;

/* Sources, in order:
 * 1. ./data/quotes.json from our own server (written every 15 s in the US session, same origin, no rate limit) - PRIMARY
 * 2. the Cloudflare Worker (CONFIG.LIVE.PROXY_URL) - only while quotes.json is missing or older than QUOTES_STALE_SEC. */
const proxy = () => (L.PROXY_URL || '').replace(/\/$/, '');
const quotesUrl = () => CONFIG.DATA?.quotes || '';
export const usesProxy = () => !!proxy() || !!quotesUrl();
export const enabled = () => !!proxy() || !!quotesUrl();
let pollTimer = null, polledKey = '';
let source = null;            // 'server' | 'worker' | null
let dataAt = 0;               // ms: how old the newest price data is (server updated_at, or the worker fetch time)
let serverOpen = null;        // market_open flag from quotes.json (null = unknown)
let quotesMissingUntil = 0;   // quotes.json answered 404: try it again only after this time
/* 1.15.0 (B1): true once a price source answered in this session (quotes.json, the worker or the stream). Before that the
   prices are the ones kept on the device from an earlier visit – "today" of a trade is then unknown, never a wrong ±0 */
let answered = false;
export const loaded = () => answered;

/* times come as seconds, ms or ISO – Alpaca writes nanoseconds ("…:35.123456789Z"), trimmed to ms before parsing */
const toMs = (t) => (typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Date.parse(String(t || '').replace(/(\.\d{3})\d+/, '$1')) || 0);

const hist = new Map();          // symbol -> [{t: iso, p}] collected while the app is open (Terminál chart)
const metaMap = new Map();      // symbol -> { src, delayed, open, at } (quotes.json 1.9.0 / stream)
export const meta = (sym) => metaMap.get(sym) || null;
function takeMeta(sym, q, server = false) {
  if (!q || (q.src == null && q.delayed == null && q.open == null && q.prev_close == null)) return;
  const m = metaMap.get(sym) || {};
  /* 1.9.1: the server's previous close and day change (quotes.json) are kept apart from the price stream */
  const pcS = server && +q.prev_close > 0 ? +q.prev_close : m.pcS;
  const chg = server && Number.isFinite(+q.chg_pct) && q.chg_pct != null ? +q.chg_pct : m.chg;
  metaMap.set(sym, { src: q.src ?? m.src, delayed: q.delayed ?? m.delayed, open: typeof q.open === 'boolean' ? q.open : m.open, at: typeof q.open === 'boolean' ? Date.now() : m.at, pcS, chg });
}

/* 1.9.1: today's change in % for a market tile. Previous close from quotes.json wins over any other source
   (a worker / stream price must never be compared with somebody else's close: DAX once showed −8,91 % instead of +1,20 %).
   No usable close -> the server's chg_pct; a change that disagrees with the server's by > 2 points -> the server's. */
export function dayChange(sym) {
  const q = prices.get(sym);
  const m = metaMap.get(sym) || {};
  const pc = m.pcS > 0 ? m.pcS : q?.pc > 0 ? q.pc : null;
  let ch = q && pc ? (q.p / pc - 1) * 100 : null;
  if (m.chg != null && (ch == null || !Number.isFinite(ch) || Math.abs(ch - m.chg) > 2)) ch = m.chg;
  if (ch == null || !Number.isFinite(ch) || Math.abs(ch) > 40) return null;
  return ch;
}
function take(sym, p, ts, pc) {
  if (!(p > 0) || !ts) return false;
  const cur = prices.get(sym);
  if (cur && ts < cur.t) return false; // never let an older price overwrite a newer one
  if (!cur || ts > cur.t || p !== cur.p) {
    prices.set(sym, { p, t: Math.max(ts, cur?.t || 0), pc: metaMap.get(sym)?.pcS || pc || cur?.pc });
    saveQ();
    const h = hist.get(sym) || []; const last = h[h.length - 1];
    if (!last || Date.parse(last.t) < ts) { h.push({ t: new Date(ts).toISOString(), p }); if (h.length > 1500) h.shift(); hist.set(sym, h); }
    return true;
  }
  return false;
}
export const history = (sym) => hist.get(sym) || [];
/* 1.13.9: a newer price from another server source (the last candle of /api/bars) – the price in the head of a chart then
   matches the chart's own last candle (Alpaca crypto trades can be minutes apart while its bars move every minute) */
export function offer(sym, p, ts) { if (take(sym, +p, +ts)) { dataAt = Math.max(dataAt, +ts); mark(); } }

/* 1.13.9: the last known prices stay on the device (max 60 keys, saved at most every 10 s) – a screen opened before the
   first quotes.json / stream answer shows the last price with its real time ("Data z 22:00"), never "–" or a blank */
const QKEY = 'pulse.lastQ';
let qSaveT = null;
function saveQ() {
  if (qSaveT) return;
  qSaveT = setTimeout(() => {
    qSaveT = null;
    try { localStorage.setItem(QKEY, JSON.stringify([...prices.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 60).map(([k, q]) => [k, q.p, q.t, q.pc || 0]))); } catch { /* storage full / blocked */ }
  }, 10000);
}
try {
  const a = JSON.parse(localStorage.getItem(QKEY) || '[]');
  if (Array.isArray(a)) a.forEach((x) => { if (Array.isArray(x) && x[1] > 0 && x[2] > 0 && Date.now() - x[2] < 14 * 86400000) prices.set(String(x[0]), { p: +x[1], t: +x[2], pc: +x[3] || undefined, cached: true }); });
} catch { /* storage blocked */ }

/* Honest freshness text for a price time (ms): "živě · před 12 s", "Data z 15:32 (zpožděno)", "Burza zavřená · poslední cena 22:00" */
export function stamp(ts, now = Date.now(), open = null) {
  if (!ts) return { code: 'none', text: t('stamp.none') };
  if (!(open ?? marketOpen(new Date(now)))) return { code: 'closed', text: t('stamp.closed', { time: F.time(new Date(ts)) }) };
  const age = Math.max(0, Math.round((now - ts) / 1000));
  if (age < (L.FRESH_SEC || 60)) return { code: 'live', text: t('stamp.live', { s: age }) };
  return { code: 'stale', text: t('stamp.stale', { time: F.time(new Date(ts)) }) };
}

/* true = fresh server quotes were applied (no need for the worker) */
async function pollServer() {
  if (!quotesUrl() || Date.now() < quotesMissingUntil) return false;
  try {
    const r = await fetch(quotesUrl(), { cache: 'no-store' });
    if (!r.ok) { quotesMissingUntil = Date.now() + (r.status === 404 ? 10 * 60000 : 60000); return false; }
    const j = await r.json();
    answered = true;
    const at = toMs(j.updated_at);
    if (!at || Date.now() - at > (L.QUOTES_STALE_SEC || 120) * 1000) { serverOpen = null; if (source !== 'worker') dataAt = Math.max(dataAt, at); return false; }
    if (typeof j.market_open === 'boolean') serverOpen = j.market_open;
    let any = false;
    Object.entries(j.q || {}).forEach(([sym, q]) => { takeMeta(sym, q, true); if (q && take(sym, +q.p, toMs(q.t) || at, q.prev_close)) any = true; });
    source = 'server'; dataAt = Math.max(at, streamAt);
    if (any) mark();
    return true;
  } catch { return false; }
}

async function pollWorker(only = null) {
  if (!proxy()) return;
  const syms = only || symbols();
  if (!only) polledKey = syms.join(',');
  if (!syms.length) return;
  try {
    const r = await fetch(`${proxy()}/q?s=${encodeURIComponent(syms.join(','))}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    let any = false;
    answered = true;
    Object.entries(j.q || {}).forEach(([sym, q]) => { if (q && take(sym, q.p, q.t, q.pc)) any = true; });
    if (!only) { source = 'worker'; dataAt = Date.now(); }
    if (any) mark();
  } catch { /* offline: try again later */ }
}

async function pollProxy() {
  clearTimeout(pollTimer);
  if (document.visibilityState !== 'visible' || !enabled()) return;
  const ok = await pollServer();
  /* market closed and we already have last prices -> no need to call the worker all night */
  if (!ok && (marketOpen() || !prices.size)) await pollWorker();
  else {
    polledKey = symbols().join(',');
    /* symbols the server does not stream (e.g. one picked in the Terminál) still come from the worker */
    const miss = extraFn().filter((x) => { const q = prices.get(x); return !q || Date.now() - q.t > 5 * 60000; });
    if (miss.length && marketOpen()) await pollWorker(miss);
  }
  lastTickAt = dataAt;
  statusFns.forEach((fn) => { try { fn(); } catch { /* ignore */ } }); // refresh the live badge only
  /* 1.9.0: quotes.json is written around the clock (currencies, crypto) -> keep polling it every 15 s also at night */
  const sec = ok ? (L.QUOTES_POLL_SEC || 15) : marketOpen() ? (L.POLL_SEC || 10) : 120;
  pollTimer = setTimeout(pollProxy, sec * 1000);
}
const statusFns = new Set();
export const onStatus = (fn) => { statusFns.add(fn); return () => statusFns.delete(fn); };
export const onLive = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const lastTick = () => lastTickAt;
export const dataTime = () => Math.max(dataAt, streamAt ? Math.min(streamAt, Date.now()) : 0);
export const liveSource = () => source;

/* US regular session in New York time (Mon-Fri 9:30-16:00). Holidays are not modelled;
   the server's market_open flag (quotes.json) wins when it is known. */
export function marketOpen(now = new Date()) {
  if (serverOpen != null && Math.abs(Date.now() - (+now)) < 600000 && source === 'server') return serverOpen;
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const d = ny.getDay(), m = ny.getHours() * 60 + ny.getMinutes();
  return d >= 1 && d <= 5 && m >= 570 && m < 960;
}

/* Truthful badge: "streaming" (green) only when the market is open AND the newest data is < FRESH_SEC old.
   Market open but data older -> "stale" ("Data z HH:MM"); nothing yet -> "waiting"; closed -> "closed". */
export function status(now = Date.now()) {
  if (!enabled()) return 'off';
  if (!marketOpen(new Date(now))) return 'closed';
  if (!dataAt) return 'waiting';
  return now - dataAt < (L.FRESH_SEC || 60) * 1000 ? 'streaming' : 'stale';
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
let extraFn = () => [];
/* Extra symbols someone wants prices for (Obchodní platforma: chosen symbol + open fictional positions) */
export const setExtraSymbols = (fn) => { extraFn = fn; };
const symbols = () => [...new Set(extraFn().concat(openSignals(getData()).map((s) => s.symbol), 'SPY'))].slice(0, 60);
export const quote = (sym) => prices.get(sym) || null;
/* P2-05: the day-change label – "dnes {v}" only when the newest price is from today (same midnight as todayOf in
   wallet.js), else "poslední den {v}" (a weekend / holiday / before the session) */
export function dayChText(sym, ch) {
  const q = prices.get(sym);
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  return t(q && q.t > 0 && q.t < +d0 ? 'term.lastCh' : 'term.dayCh', { v: F.spct(ch, 2) });
}
/* 1.15.0 (B1): the previous close of sym consistent with dayChange() (the server's close wins; a change that disagrees with
   the server's by > 2 points uses the server's change) – null when unknown */
export function prevClose(sym) {
  const q = prices.get(sym);
  const ch = dayChange(sym);
  if (!q || !(q.p > 0) || ch == null) return null;
  return q.p / (1 + ch / 100);
}
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
    apply();
    /* notify on every new price (also symbols without a signal: Obchodní platforma, fictional positions) */
    listeners.forEach((fn) => { try { fn(); } catch { /* view errors must not stop the stream */ } });
  }, L.RENDER_MS || 1500);
}

/* ---------- 1.9.0: real-time stream (Server-Sent Events, GET /api/stream?keys=…) ----------
   ~1 update per second per symbol while it runs; quotes.json polling keeps running underneath (flags, previous close)
   and is the fallback when the stream fails (reconnect with backoff) or on a GitHub Pages copy (no stream there). */
let es = null, esKey = '', esFails = 0, esTimer = null, streamAt = 0, esWaitUntil = 0;
/* 1.15.0 stream hygiene (production allows 40 streams per IP): at most ONE EventSource per tab; closed ~30 s after the
   tab is hidden and reopened on return; a refused stream (429 / any non-200 -> the browser closes it for good) waits
   30–60 s, then longer (max 5 min), and prices meanwhile come from quotes.json polling – never a tight retry loop. */
const HIDE_CLOSE_MS = 30000;
let hideTimer = null;
const backoffMs = (n) => Math.min(300000, (30000 + Math.random() * 30000) * 2 ** Math.min(3, Math.max(0, n - 1)));
const streamUrl = () => (CONFIG.LIVE?.STREAM_URL && !location.hostname.endsWith('github.io') ? CONFIG.LIVE.STREAM_URL : '');
export const streaming = () => !!es && Date.now() - streamAt < 30000;
function closeStream() { if (es) { try { es.close(); } catch { /* ignore */ } } es = null; esKey = ''; }
export function syncStream() {
  if (!streamUrl() || typeof EventSource === 'undefined') { closeStream(); return; }
  if (document.visibilityState !== 'visible') return;   // hidden: never opens; an open one is closed by the ~30 s hide timer
  const keys = symbols().slice(0, 80).join(',');
  if (!keys) { closeStream(); return; }
  if (es && keys === esKey) return;
  if (!es && Date.now() < esWaitUntil) return;   // backing off after a refused stream: the timer reopens it
  closeStream();
  clearTimeout(esTimer); esTimer = null;
  esKey = keys;
  let got = false;
  try { es = new EventSource(`${streamUrl()}?keys=${encodeURIComponent(keys)}`); } catch { es = null; return; }
  es.onmessage = (ev) => {
    let d; try { d = JSON.parse(ev.data); } catch { return; }
    if (!d || !d.k) return;
    got = true; esFails = 0; streamAt = Date.now(); answered = true;
    takeMeta(d.k, d);
    if (take(d.k, +d.p, toMs(d.t) || Date.now())) { dataAt = Math.max(dataAt, toMs(d.t) || Date.now()); mark(); }
  };
  const mine = es;
  es.onerror = () => {
    if (es !== mine) return;
    /* CONNECTING = the browser retries by itself (network blip, server "retry:") – after 3 failures without any data
       we stop it; CLOSED = the server refused (429 / 5xx): the browser never retries -> our own backoff */
    const closed = mine.readyState === 2;
    if (got && !closed) return;
    esFails++;
    if (closed || esFails >= 3) {
      closeStream();
      const wait = backoffMs(esFails);
      esWaitUntil = Date.now() + wait;
      clearTimeout(esTimer);
      esTimer = setTimeout(() => { esTimer = null; esWaitUntil = 0; syncStream(); }, wait);
    }
  };
}
export const streamState = () => ({ open: !!es, readyState: es ? es.readyState : null, fails: esFails, waitMs: Math.max(0, esWaitUntil - Date.now()) });

function stop() {
  clearTimeout(pollTimer); pollTimer = null; polledKey = '';
  closeStream();
}

function start() {
  if (!enabled() || document.visibilityState !== 'visible') return;
  pollProxy();
  syncStream();
}

/* Call once at boot. `dataGetter` returns the app's live data object. */
export function initLive(dataGetter) {
  getData = dataGetter;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { clearTimeout(hideTimer); hideTimer = null; start(); return; }
    /* a quick look at another app keeps the stream; ~30 s hidden closes it (and the polling) */
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { hideTimer = null; if (document.visibilityState !== 'visible') stop(); }, HIDE_CLOSE_MS);
  });
  start();
}

/* Call after new bot data arrived: re-apply live prices and resubscribe to the new symbol set. */
export function onData() {
  if (!enabled()) return;
  apply();
  if (symbols().join(',') !== polledKey) pollProxy();
  syncStream();
}
