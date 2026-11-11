// 1.10.0 – real price history from the server: GET /api/bars?key=<KEY>&tf=1m|5m|15m|1h|1d&range=1d|5d|1mo|6mo|1y
//   -> { key, tf, src, delayed, stale?, bars: [[t_ms, o, h, l, c, v], ...] }
// Used by the platform chart (Obchodovat) and the signal detail ("Trh"). Candles or a line, timeframe chips
// 1D 5D 1M 6M 1R. The live price (stream / quotes) is appended to the last candle. Until the endpoint answers
// (404 / error) the caller falls back to the old behaviour (ticks collected since the app opened).
import { CONFIG } from '../config.js';
import * as F from './format.js';
import * as Live from './live.js';
import * as store from './store.js';
import * as M from './market.js';
import { t } from './i18n/index.js';

export const TFS = [
  { id: '1D', tf: '5m', range: '1d', ms: 5 * 60000 },
  { id: '5D', tf: '15m', range: '5d', ms: 15 * 60000 },
  { id: '1M', tf: '1h', range: '1mo', ms: 3600000 },
  { id: '6M', tf: '1d', range: '6mo', ms: 86400000 },
  { id: '1R', tf: '1d', range: '1y', ms: 86400000 },
];
const URL0 = () => CONFIG.LIVE?.BARS_URL || '/api/bars';
const cache = new Map(); // key|tf|range -> { at, data | null }
const TTL_OK = 45000, TTL_FAIL = 120000;
let dead = 0; // time of the last 404 – the endpoint does not exist yet

export const curTf = (k = 'barsTf') => { const v = store.get(k, '1D'); return TFS.some((x) => x.id === v) ? v : '1D'; };
export const curType = () => (store.get('barsType', 'candle') === 'line' ? 'line' : 'candle');

export async function fetchBars(key, tfId) {
  const T = TFS.find((x) => x.id === tfId) || TFS[0];
  const k = `${key}|${T.tf}|${T.range}`;
  const c = cache.get(k);
  /* the server only has history for the keys of instruments.json (not every single stock or sector ETF) */
  if (M.ready() && !M.get(key)) return null;
  if (c && Date.now() - c.at < (c.data ? TTL_OK : TTL_FAIL)) return c.data;
  if (dead && Date.now() - dead < TTL_FAIL) return null;
  let data = null;
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
    const r = await fetch(`${URL0()}?key=${encodeURIComponent(key)}&tf=${T.tf}&range=${T.range}`, { cache: 'no-store', signal: ctl?.signal });
    if (tm) clearTimeout(tm);
    if (r.status === 404) dead = Date.now();
    /* 400 = the server does not know this key (e.g. single stocks) -> fallback; 503 / other = try again later */
    if (!r.ok && r.status !== 404 && r.status !== 400) data = { retry: true };
    if (r.ok) {
      const j = await r.json();
      const bars = (Array.isArray(j?.bars) ? j.bars : []).filter((b) => Array.isArray(b) && b[0] > 0 && b[4] > 0)
        .map((b) => ({ t: +b[0], o: +b[1] || +b[4], h: +b[2] || +b[4], l: +b[3] || +b[4], c: +b[4], v: +b[5] || 0 }));
      if (bars.length >= 2) data = { key, tf: T.tf, range: T.range, ms: T.ms, src: j.src || '', delayed: !!j.delayed, stale: !!j.stale, bars };
    }
  } catch { data = { retry: true }; }
  if (!data?.retry) cache.set(k, { at: Date.now(), data });
  return data;
}

/* the bars + the live price moved into the last candle (or a new candle when its time has passed) */
function withLive(d) {
  const bars = d.bars.map((b) => ({ ...b }));
  const q = Live.quote(d.key);
  if (!q || !(q.p > 0) || !(q.t > 0)) return bars;
  const last = bars[bars.length - 1];
  if (q.t < last.t) return bars;
  const end = Math.floor(last.t / d.ms) * d.ms + d.ms; // a partial last bar may carry an unaligned time
  if (q.t < end) { last.c = q.p; last.h = Math.max(last.h, q.p); last.l = Math.min(last.l, q.p); return bars; }
  if (d.ms >= 86400000 && new Date(q.t).toDateString() === new Date(last.t).toDateString()) { last.c = q.p; last.h = Math.max(last.h, q.p); last.l = Math.min(last.l, q.p); return bars; }
  bars.push({ t: Math.max(end, Math.floor(q.t / d.ms) * d.ms), o: last.c, h: Math.max(last.c, q.p), l: Math.min(last.c, q.p), c: q.p, v: 0, live: true });
  return bars;
}

function tickBars(key) {
  const out = [];
  Live.history(key).forEach((p) => {
    const ts = typeof p.t === 'number' ? p.t : Date.parse(p.t);
    if (!(ts > 0) || !(p.p > 0)) return;
    const b = Math.floor(ts / 60000) * 60000;
    const last = out[out.length - 1];
    if (last && last.t === b) { last.h = Math.max(last.h, p.p); last.l = Math.min(last.l, p.p); last.c = p.p; } else out.push({ t: b, o: last ? last.c : p.p, h: p.p, l: p.p, c: p.p, v: 0 });
  });
  return out.slice(-120);
}

const tLabel = (ms, d) => (d.ms >= 86400000 ? F.dm(new Date(ms)) : d.range === '1d' ? F.time(new Date(ms)) : `${F.dm(new Date(ms))} ${F.time(new Date(ms))}`);

/* SVG chart. levels = [{ v, label, cls }] (signal detail: entry / stop / target) */
export function draw(box, d, { type = curType(), levels = [], fmt = (v) => F.price(v) } = {}) {
  if (!box) return;
  const w = box.clientWidth || 340, h = box.clientHeight || 220;
  const all = withLive(d);
  const ks = all.slice(-(type === 'candle' ? Math.max(30, Math.min(120, Math.floor(w / 4))) : 400));
  const lv = levels.filter((x) => x.v > 0);
  let lo = Math.min(...ks.map((k) => k.l), ...lv.map((x) => x.v)), hi = Math.max(...ks.map((k) => k.h), ...lv.map((x) => x.v));
  const span = (hi - lo) || hi * 0.001 || 1; lo -= span * 0.06; hi += span * 0.06;
  const pad = { l: 4, r: 70, t: 10, b: 20 };
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  const cw = (w - pad.l - pad.r) / ks.length;
  const X = (i) => pad.l + i * cw + cw / 2;
  const last = ks[ks.length - 1], first = ks[0];
  const up = last.c >= first.o;
  let body;
  if (type === 'line') {
    const p = ks.map((k, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(k.c).toFixed(1)}`).join('');
    body = `<path d="${p}L${X(ks.length - 1).toFixed(1)},${h - pad.b}L${X(0).toFixed(1)},${h - pad.b}Z" class="br-area ${up ? 'up' : 'down'}"/><path d="${p}" class="br-line ${up ? 'up' : 'down'}"/>`;
  } else {
    body = ks.map((k, i) => {
      const x = X(i), u = k.c >= k.o;
      const y1 = Y(Math.max(k.o, k.c)), y2 = Y(Math.min(k.o, k.c));
      return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(k.h).toFixed(1)}" y2="${Y(k.l).toFixed(1)}" class="ck-w ${u ? 'up' : 'down'}"/><rect x="${(x - cw * 0.36).toFixed(1)}" y="${y1.toFixed(1)}" width="${Math.max(1.2, cw * 0.72).toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" rx="0.6" class="ck-b ${u ? 'up' : 'down'}"/>`;
    }).join('');
  }
  const lab = lv.map((x) => `<line x1="${pad.l}" x2="${w - pad.r + 4}" y1="${Y(x.v).toFixed(1)}" y2="${Y(x.v).toFixed(1)}" class="br-lv ${x.cls || ''}"/><text x="${w - pad.r + 8}" y="${(Y(x.v) + 4).toFixed(1)}" class="ck-ax br-lvt ${x.cls || ''}">${F.esc(x.label)}</text>`).join('');
  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${(pad.t + f * (h - pad.t - pad.b)).toFixed(1)}" y2="${(pad.t + f * (h - pad.t - pad.b)).toFixed(1)}" class="br-grid"/>`).join('');
  box.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${F.esc(t('bars.aria', { k: d.key }))}">
    ${grid}${lab}${body}
    <line x1="${pad.l}" x2="${w - pad.r + 4}" y1="${Y(last.c).toFixed(1)}" y2="${Y(last.c).toFixed(1)}" class="ck-last"/>
    <rect x="${w - pad.r + 4}" y="${(Y(last.c) - 9).toFixed(1)}" width="${pad.r - 6}" height="18" rx="5" class="br-now ${up ? 'up' : 'down'}"/>
    <text x="${w - pad.r + 9}" y="${(Y(last.c) + 4).toFixed(1)}" class="ck-lab br-nowt">${F.esc(fmt(last.c))}</text>
    <circle cx="${X(ks.length - 1).toFixed(1)}" cy="${Y(last.c).toFixed(1)}" r="3.2" class="br-dot ${up ? 'up' : 'down'}"/><circle cx="${X(ks.length - 1).toFixed(1)}" cy="${Y(last.c).toFixed(1)}" r="3.2" class="br-pulse ${up ? 'up' : 'down'}"/>
    <text x="${w - pad.r + 8}" y="${(pad.t + 8).toFixed(1)}" class="ck-ax">${F.esc(fmt(hi))}</text>
    <text x="${w - pad.r + 8}" y="${(h - pad.b - 2).toFixed(1)}" class="ck-ax">${F.esc(fmt(lo))}</text>
    <text x="${pad.l}" y="${h - 5}" class="ck-ax">${F.esc(tLabel(first.t, d))}</text><text x="${w - pad.r}" y="${h - 5}" class="ck-ax" text-anchor="end">${F.esc(tLabel(last.t, d))}</text>
  </svg>`;
}

/* chips (timeframe + candles / line) + the box + the honest source line */
export function controls(prefix, { tfKey = 'barsTf', compact = false } = {}) {
  const tf = curTf(tfKey), ty = curType();
  return `<div class="br-ctl"><div class="range-chips br-tfs" role="group" aria-label="${F.esc(t('bars.tf'))}">${TFS.map((x) => `<button type="button" class="range-chip" data-bars-tf="${x.id}" aria-pressed="${x.id === tf}">${t(`bars.tf.${x.id}`)}</button>`).join('')}</div>
    ${compact ? '' : `<div class="br-type" role="group" aria-label="${F.esc(t('bars.type'))}"><button type="button" class="range-chip" data-bars-type="candle" aria-pressed="${ty === 'candle'}">${t('bars.candle')}</button><button type="button" class="range-chip" data-bars-type="line" aria-pressed="${ty === 'line'}">${t('bars.line')}</button></div>`}</div>
    <div class="pchart-box br-box" id="${prefix}-box"><p class="pchart-empty">${t('common.loading')}</p></div>
    <p class="br-src" id="${prefix}-src"></p>`;
}

const SRC = { alpaca: 'Alpaca', yahoo: 'Yahoo Finance', finnhub: 'Finnhub', stooq: 'Stooq' };
function srcLine(d) {
  const k = String(d.src || '').toLowerCase();
  const s = SRC[k] || SRC[Object.keys(SRC).find((x) => k.startsWith(x)) || ''] || d.src || '';
  return `${s ? t('bars.src', { s }) : ''}${d.delayed ? ` · <b class="br-delay">${t('bars.delayed')}</b>` : ''}${d.stale ? ` · <b class="br-delay">${t('bars.stale')}</b>` : ''}`;
}

/* Mount: loads the bars for the current timeframe; onFail() when the endpoint is not there (caller falls back).
   Returns { refresh() – live tick, destroy() }. */
export function mount(root, prefix, key, { levels = [], fmt, onFail, tfKey = 'barsTf', type = null, ticks = false } = {}) {
  let d = null, gone = false, seq = 0, tickMode = false;
  const box = () => root.querySelector(`#${prefix}-box`);
  const paint = () => {
    if (gone || !box()) return;
    if (tickMode) {
      /* endpoint missing: 1-minute candles from the prices that arrived since the app opened */
      const bars = tickBars(key);
      if (bars.length < 2) { box().innerHTML = `<p class="pchart-empty">${t('bars.ticksWait')}</p>`; return; }
      d = { key, tf: '1m', range: 'live', ms: 60000, src: '', delayed: false, bars };
    }
    if (d) draw(box(), d, { type: type || curType(), levels, fmt });
  };
  const load = async () => {
    const my = ++seq;
    const r = await fetchBars(key, curTf(tfKey));
    if (gone || my !== seq) return;
    if (r && r.retry) {
      if (box()) box().innerHTML = `<p class="pchart-empty">${t('bars.retry')}</p>`;
      setTimeout(() => { if (!gone && my === seq) load(); }, 30000);
      return;
    }
    if (!r) {
      if (ticks) { tickMode = true; root.querySelectorAll('.br-tfs').forEach((x) => { x.style.display = 'none'; }); const s = root.querySelector(`#${prefix}-src`); if (s) s.textContent = t('bars.ticksSrc'); paint(); }
      onFail && onFail();
      return;
    }
    d = r; paint();
    const s = root.querySelector(`#${prefix}-src`); if (s) s.innerHTML = srcLine(d);
  };
  const click = (ev) => {
    const a = ev.target.closest('[data-bars-tf]'); const b = ev.target.closest('[data-bars-type]');
    if (a) { store.set(tfKey, a.dataset.barsTf); root.querySelectorAll('[data-bars-tf]').forEach((x) => x.setAttribute('aria-pressed', String(x === a))); load(); }
    if (b) { store.set('barsType', b.dataset.barsType); root.querySelectorAll('[data-bars-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); paint(); }
  };
  root.addEventListener('click', click);
  load();
  /* the server's bars move on (new candles); live ticks fill the gap in between (refresh) */
  const timer = setInterval(() => { if (!gone && !tickMode && document.visibilityState === 'visible') load(); }, 60000);
  return { refresh: paint, reload: load, destroy() { gone = true; clearInterval(timer); root.removeEventListener('click', click); }, ok: () => !!d };
}
