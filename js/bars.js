// 1.10.0 – real price history from the server: GET /api/bars?key=<KEY>&tf=1m|5m|15m|1h|1d&range=1d|5d|1mo|6mo|1y
//   -> { key, tf, src, delayed, stale?, bars: [[t_ms, o, h, l, c, v], ...] }
// Used by the platform chart (Obchodovat) and the signal detail ("Trh"). Candles or a line, timeframe chips
// 1D 5D 1M 6M 1R. The live price (stream / quotes) is appended to the last candle. Until the endpoint answers
// (404 / error) the caller falls back to the old behaviour (ticks collected since the app opened).
import { CONFIG } from '../config.js';
import * as F from './format.js';
import * as Live from './live.js';
import * as store from './store.js';
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
/* 1.11.1: a failure is retried after 25 s (the chart retries every 30 s); 400 = the server has no history for this key */
const TTL_OK = 45000, TTL_FAIL = 25000, TTL_NOKEY = 600000;
let dead = 0; // time of the last 404 – the endpoint does not exist yet
const why = new Map(); // key -> 'nokey' | 'down' (why the last load failed)
export const failReason = (key) => why.get(key) || 'down';

/* 1.11.1: the last good bars of a key stay on the device (max 8 keys × 150 bars) – the fallback chart starts from them */
const LAST = 'barsLast';
function keepLast(d) {
  try {
    const all = store.get(LAST, {}) || {};
    all[d.key] = { at: Date.now(), tf: d.tf, range: d.range, ms: d.ms, src: d.src, delayed: d.delayed, bars: d.bars.slice(-150).map((b) => [b.t, b.o, b.h, b.l, b.c]) };
    const ks = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0)).slice(0, 8);
    store.set(LAST, Object.fromEntries(ks.map((k) => [k, all[k]])));
  } catch { /* storage full or blocked: no saved chart, the fallback uses prices only */ }
}
function lastGood(key) {
  try {
    const x = (store.get(LAST, {}) || {})[key];
    if (!x || !Array.isArray(x.bars) || x.bars.length < 2) return null;
    return { key, tf: x.tf, range: x.range, ms: x.ms || 300000, src: x.src || '', delayed: !!x.delayed, saved: x.at, bars: x.bars.map((b) => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: 0 })) };
  } catch { return null; }
}
/* candles from loose price points [{t, p}] (signal price_path, prices collected on the device):
   the smallest of 1 / 5 / 15 min, 1 h, 1 day that gives at most 90 candles */
export function pointCandles(points) {
  const pts = points.map((x) => ({ t: typeof x.t === 'number' ? x.t : Date.parse(x.t), p: +x.p })).filter((x) => x.t > 0 && x.p > 0).sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const spanMs = pts[pts.length - 1].t - pts[0].t;
  const ms = [60000, 300000, 900000, 3600000, 86400000].find((m) => spanMs / m <= 90) || 86400000;
  const out = [];
  pts.forEach((x) => {
    const b = Math.floor(x.t / ms) * ms;
    const last = out[out.length - 1];
    if (last && last.t === b) { last.h = Math.max(last.h, x.p); last.l = Math.min(last.l, x.p); last.c = x.p; } else out.push({ t: b, o: last ? last.c : x.p, h: Math.max(x.p, last ? last.c : x.p), l: Math.min(x.p, last ? last.c : x.p), c: x.p, v: 0 });
  });
  /* fewer than 5 candles say nothing about the market -> only the last-price block */
  return out.length >= 5 ? { ms, bars: out.slice(-120) } : null;
}

export const curTf = (k = 'barsTf') => { const v = store.get(k, '1D'); return TFS.some((x) => x.id === v) ? v : '1D'; };
export const curType = () => (store.get('barsType', 'candle') === 'line' ? 'line' : 'candle');

export async function fetchBars(key, tfId) {
  const T = TFS.find((x) => x.id === tfId) || TFS[0];
  const k = `${key}|${T.tf}|${T.range}`;
  const c = cache.get(k);
  if (c && Date.now() - c.at < (c.data ? TTL_OK : c.nokey ? TTL_NOKEY : TTL_FAIL)) return c.data;
  if (dead && Date.now() - dead < TTL_FAIL) { why.set(key, 'down'); return null; }
  let nokey = false;
  let data = null;
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
    const r = await fetch(`${URL0()}?key=${encodeURIComponent(key)}&tf=${T.tf}&range=${T.range}`, { cache: 'no-store', signal: ctl?.signal });
    if (tm) clearTimeout(tm);
    if (r.status === 404) dead = Date.now();
    if (r.status === 400) nokey = true;
    /* 400 = the server does not know this key (e.g. single stocks) -> fallback; 503 / other = try again later */
    if (!r.ok && r.status !== 404 && r.status !== 400) data = { retry: true };
    if (r.ok) {
      const j = await r.json();
      const bars = (Array.isArray(j?.bars) ? j.bars : []).filter((b) => Array.isArray(b) && b[0] > 0 && b[4] > 0)
        .map((b) => ({ t: +b[0], o: +b[1] || +b[4], h: +b[2] || +b[4], l: +b[3] || +b[4], c: +b[4], v: +b[5] || 0 }));
      if (bars.length >= 2) data = { key, tf: T.tf, range: T.range, ms: T.ms, src: j.src || '', delayed: !!j.delayed, stale: !!j.stale, bars };
    }
  } catch { data = { retry: true }; }
  if (!data?.retry) cache.set(k, { at: Date.now(), data, nokey });
  if (data && !data.retry) { why.delete(key); keepLast(data); } else why.set(key, nokey ? 'nokey' : 'down');
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
  /* 1.13.6: never one candle spanning a gap (night, weekend, a stale server) – after a gap the live candle starts at
     the live price itself, not at the last close hours ago */
  const gap = q.t >= end + 2 * d.ms;
  const o = gap ? q.p : last.c;
  bars.push({ t: Math.max(end, Math.floor(q.t / d.ms) * d.ms), o, h: Math.max(o, q.p), l: Math.min(o, q.p), c: q.p, v: 0, live: true });
  return bars;
}

const tLabel = (ms, d) => (d.ms >= 86400000 ? F.dm(new Date(ms)) : d.range === '1d' ? F.time(new Date(ms)) : `${F.dm(new Date(ms))} ${F.time(new Date(ms))}`);

/* SVG chart. levels = [{ v, label, cls }] (signal detail: entry / stop / target) */
export function draw(box, d, { type = curType(), levels = [], fmt = (v) => F.price(v) } = {}) {
  if (!box) return;
  const w = box.clientWidth || 340, h = box.clientHeight || 220;
  /* 1.13.6: a flat zero-volume bar (a filler for a closed hour) is no candle – dropped (the newest bar stays) */
  const all = withLive(d).filter((b, i, a) => i === a.length - 1 || b.live || !(b.v === 0 && b.o === b.h && b.h === b.l && b.l === b.c && d.bars.length > 2 && !d.saved));
  /* 1.11.2: small charts (Sledované grafy) get fewer, wider candles */
  const ks = all.slice(-(type === 'candle' ? (w < 280 ? Math.max(16, Math.floor((w - 70) / 6)) : Math.max(30, Math.min(120, Math.floor(w / 4)))) : 400));
  const lv = levels.filter((x) => x.v > 0);
  let lo = Math.min(...ks.map((k) => k.l), ...lv.map((x) => x.v)), hi = Math.max(...ks.map((k) => k.h), ...lv.map((x) => x.v));
  const span = (hi - lo) || hi * 0.001 || 1; lo -= span * 0.06; hi += span * 0.06;
  const pad = { l: 4, r: 70, t: 10, b: 20 };
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  /* 1.13.6: a few bars (the first minutes of a session) are NOT stretched into a few giant candles – a candle chart
     keeps at least 40 slots (16 on a small chart) and the bars sit at the right edge */
  /* 1.13.7: the x-axis fits the data there is (a session that started mid-window is not squeezed into the right third) –
     only a handful of bars keep a small minimum so they never turn into giant candles */
  const slots = type === 'candle' ? Math.max(ks.length, w < 280 ? 8 : 12) : ks.length;
  const cw = (w - pad.l - pad.r) / slots;
  const X = (i) => pad.l + (slots - ks.length + i) * cw + cw / 2;
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
  /* 1.13.6 label collision: the live price pill stays on its line; the level labels (Vstup / Cíl / Stop) move off it and
     off each other (min 13 px, inside the plot); the hi / lo axis labels are left out where they would touch any label */
  const nowY = Y(last.c);
  const top = pad.t + 6, bot = h - pad.b - 6, GAP = 13, PILL = 16;
  const ll = lv.map((x) => ({ x, y0: Y(x.v), y: Y(x.v) })).sort((a, b) => a.y0 - b.y0);
  for (let pass = 0; pass < 4; pass++) {
    ll.forEach((l) => { if (Math.abs(l.y - nowY) < PILL) l.y = l.y0 <= nowY ? nowY - PILL : nowY + PILL; });
    ll.forEach((l, i) => { if (i && l.y < ll[i - 1].y + GAP) l.y = ll[i - 1].y + GAP; });
    for (let i = ll.length - 1; i >= 0; i--) { const lim = i === ll.length - 1 ? bot : ll[i + 1].y - GAP; if (ll[i].y > lim) ll[i].y = lim; }
    ll.forEach((l) => { if (l.y < top) l.y = top; });
  }
  const lab = ll.map(({ x, y }) => `<line x1="${pad.l}" x2="${w - pad.r + 4}" y1="${Y(x.v).toFixed(1)}" y2="${Y(x.v).toFixed(1)}" class="br-lv ${x.cls || ''}"/><text x="${w - pad.r + 8}" y="${(y + 4).toFixed(1)}" class="ck-ax br-lvt ${x.cls || ''}" data-lvl="1">${F.esc(x.label)}</text>`).join('');
  const taken = ll.map((l) => l.y).concat(nowY);
  const free = (yc) => taken.every((y) => Math.abs(y - yc) >= GAP + 1);
  const hiY = pad.t + 4, loY = h - pad.b - 6;
  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${(pad.t + f * (h - pad.t - pad.b)).toFixed(1)}" y2="${(pad.t + f * (h - pad.t - pad.b)).toFixed(1)}" class="br-grid"/>`).join('');
  box.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${F.esc(t('bars.aria', { k: d.key }))}">
    ${grid}${lab}${body}
    <line x1="${pad.l}" x2="${w - pad.r + 4}" y1="${Y(last.c).toFixed(1)}" y2="${Y(last.c).toFixed(1)}" class="ck-last"/>
    <rect x="${w - pad.r + 4}" y="${(Y(last.c) - 9).toFixed(1)}" width="${pad.r - 6}" height="18" rx="5" class="br-now ${up ? 'up' : 'down'}"/>
    <text x="${w - pad.r + 9}" y="${(Y(last.c) + 4).toFixed(1)}" class="ck-lab br-nowt">${F.esc(fmt(last.c))}</text>
    <circle cx="${X(ks.length - 1).toFixed(1)}" cy="${Y(last.c).toFixed(1)}" r="3.2" class="br-dot ${up ? 'up' : 'down'}"/><circle cx="${X(ks.length - 1).toFixed(1)}" cy="${Y(last.c).toFixed(1)}" r="3.2" class="br-pulse ${up ? 'up' : 'down'}"/>
    ${free(hiY) ? `<text x="${w - pad.r + 8}" y="${(pad.t + 8).toFixed(1)}" class="ck-ax" data-axl="hi">${F.esc(fmt(hi))}</text>` : ''}
    ${free(loY) ? `<text x="${w - pad.r + 8}" y="${(h - pad.b - 2).toFixed(1)}" class="ck-ax" data-axl="lo">${F.esc(fmt(lo))}</text>` : ''}
    <text x="${pad.l}" y="${h - 5}" class="ck-ax">${F.esc(tLabel(first.t, d))}</text><text x="${w - pad.r}" y="${h - 5}" class="ck-ax" text-anchor="end">${F.esc(tLabel(last.t, d))}</text>
  </svg>`;
}

/* chips (timeframe + candles / line) + the box + the honest source line */
export function controls(prefix, { tfKey = 'barsTf', compact = false } = {}) {
  const tf = curTf(tfKey), ty = curType();
  return `<div class="br-ctl"><div class="range-chips br-tfs" role="group" aria-label="${F.esc(t('bars.tf'))}">${TFS.map((x) => `<button type="button" class="range-chip" data-bars-tf="${x.id}" aria-pressed="${x.id === tf}">${t(`bars.tf.${x.id}`)}</button>`).join('')}</div>
    ${compact ? '' : `<div class="br-type" role="group" aria-label="${F.esc(t('bars.type'))}"><button type="button" class="range-chip" data-bars-type="candle" aria-pressed="${ty === 'candle'}">${t('bars.candle')}</button><button type="button" class="range-chip" data-bars-type="line" aria-pressed="${ty === 'line'}">${t('bars.line')}</button></div>`}</div>
    <div class="pchart-box br-box" id="${prefix}-box"><p class="pchart-empty">${t('common.loading')}</p></div>
    <div class="br-fb${compact ? ' is-compact' : ''}" id="${prefix}-fb" hidden></div>
    <p class="br-src" id="${prefix}-src"></p>`;
}

const SRC = { alpaca: 'Alpaca', yahoo: 'Yahoo Finance', finnhub: 'Finnhub', stooq: 'Stooq' };
function srcLine(d) {
  const k = String(d.src || '').toLowerCase();
  const s = SRC[k] || SRC[Object.keys(SRC).find((x) => k.startsWith(x)) || ''] || d.src || '';
  return `${s ? t('bars.src', { s }) : ''}${d.delayed ? ` · <b class="br-delay">${t('bars.delayed')}</b>` : ''}${d.stale ? ` · <b class="br-delay">${t('bars.stale')}</b>` : ''}`;
}

/* 1.11.1: the last-price block shown whenever the chart cannot load: big last price + today's change +
   "poslední cena z HH:MM (zdroj)" + one calm sentence. Never an empty or broken box. */
function lastPx(key, d, fmt) {
  const q = Live.quote(key);
  const lb = d?.bars?.[d.bars.length - 1];
  const p = q?.p > 0 ? q.p : lb?.c, at = q?.t > 0 ? q.t : lb?.t;
  if (!(p > 0)) return null;
  const m = Live.meta(key) || {};
  const raw = m.src || (q ? '' : d?.src) || '';
  const k = String(raw).toLowerCase();
  const src = SRC[k] || SRC[Object.keys(SRC).find((x) => k.startsWith(x)) || ''] || raw;
  const ch = Live.dayChange(key);
  const when = at ? (new Date(at).toDateString() === new Date().toDateString() ? F.time(new Date(at)) : F.dmTime(new Date(at))) : '';
  return { p: fmt(p), ch, when, src, delayed: !!m.delayed };
}
function fbHtml(key, d, fmt, reason, compact) {
  const x = lastPx(key, d, fmt);
  /* 1.11.2 small charts (Sledované grafy): the short note + when the last price is from (price itself is in the card head) */
  if (compact) {
    const s = x?.src ? x.src + (x.delayed ? `, ${t('bars.delayed')}` : '') : '';
    const at = x?.when ? t(s ? 'bars.fb.atSrc' : 'bars.fb.at', { t: x.when, s }) : '';
    return `<p class="br-fb-note">${F.esc(t('bars.fb.short'))}</p>${at ? `<p class="br-fb-at">${F.esc(at.charAt(0).toUpperCase() + at.slice(1))}</p>` : ''}`;
  }
  const note = t(reason === 'nokey' ? 'bars.fb.nokey' : 'bars.fb.note');
  if (!x) return `<p class="br-fb-note">${F.esc(t('bars.fb.none'))}</p>`;
  const s = x.src ? x.src + (x.delayed ? `, ${t('bars.delayed')}` : '') : '';
  const at = x.when ? t(s ? 'bars.fb.atSrc' : 'bars.fb.at', { t: x.when, s }) : '';
  return `<p class="br-fb-px"><b class="num">${F.esc(x.p)}</b>${x.ch != null ? `<span class="num ${x.ch > 0 ? 'up' : x.ch < 0 ? 'down' : ''}">${F.spct(x.ch, 2)} ${t('bars.fb.today')}</span>` : ''}</p>
    ${at ? `<p class="br-fb-at">${F.esc(at)}</p>` : ''}<p class="br-fb-note">${F.esc(note)}</p>`;
}

/* Mount: loads the bars for the current timeframe (candles by default). When /api/bars fails (404, 400, 5xx, network)
   the chart never goes blank: candles from the last bars saved on this device, else built from the signal's price_path
   and the prices collected since the app opened, plus the last-price block; a new try every 30 s.
   Returns { refresh() – live tick, reload(), destroy(), ok() }. onFail() is called once on the first failure. */
export function mount(root, prefix, key, { levels = [], fmt = (v) => F.price(v), onFail, tfKey = 'barsTf', type = null, path = null } = {}) {
  let d = null, gone = false, seq = 0, fb = false, retryT = null, failed = false;
  const box = () => root.querySelector(`#${prefix}-box`);
  const fbEl = () => root.querySelector(`#${prefix}-fb`);
  const srcEl = () => root.querySelector(`#${prefix}-src`);
  const compact = () => !!fbEl()?.classList.contains('is-compact');
  const fbData = () => {
    const saved = lastGood(key);
    if (saved) return saved;
    const pts = (typeof path === 'function' ? path() || [] : []).concat(Live.history(key));
    const c = pointCandles(pts);
    return c ? { key, tf: 'pts', range: 'pts', ms: c.ms, src: '', delayed: false, bars: c.bars, built: true } : null;
  };
  const paint = () => {
    if (gone || !box()) return;
    if (fb) {
      const fd = fbData();
      if (fd) { box().hidden = false; draw(box(), fd, { type: type || curType(), levels, fmt }); } else box().hidden = true;
      const f = fbEl(); if (f) { f.hidden = false; f.innerHTML = fbHtml(key, fd, fmt, failReason(key), compact()); }
      const s = srcEl(); if (s) s.textContent = fd ? (fd.built ? t('bars.fb.built') : t('bars.fb.saved', { t: F.dmTime(new Date(fd.saved)) })) : '';
      return;
    }
    if (d) draw(box(), d, { type: type || curType(), levels, fmt });
  };
  const load = async () => {
    const my = ++seq;
    clearTimeout(retryT);
    const r = await fetchBars(key, curTf(tfKey));
    if (gone || my !== seq) return;
    if (!r || r.retry) {
      fb = true; paint();
      if (!failed) { failed = true; onFail && onFail(); }
      retryT = setTimeout(() => { if (!root.isConnected) { stop(); return; } if (!gone && my === seq) load(); }, 30000);
      return;
    }
    d = r; fb = false;
    if (box()) box().hidden = false;
    const f = fbEl(); if (f) { f.hidden = true; f.innerHTML = ''; }
    paint();
    const s = srcEl(); if (s) s.innerHTML = srcLine(d);
  };
  const click = (ev) => {
    const a = ev.target.closest('[data-bars-tf]'); const b = ev.target.closest('[data-bars-type]');
    if (a) { store.set(tfKey, a.dataset.barsTf); root.querySelectorAll('[data-bars-tf]').forEach((x) => x.setAttribute('aria-pressed', String(x === a))); load(); }
    if (b) { store.set('barsType', b.dataset.barsType); root.querySelectorAll('[data-bars-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); paint(); }
  };
  root.addEventListener('click', click);
  load();
  /* the server's bars move on (new candles); live ticks fill the gap in between (refresh) */
  /* a chart whose element left the page (closed detail, re-rendered view) stops by itself */
  const timer = setInterval(() => { if (!root.isConnected) { stop(); return; } if (!gone && !fb && document.visibilityState === 'visible') load(); }, 60000);
  function stop() { gone = true; clearInterval(timer); clearTimeout(retryT); root.removeEventListener('click', click); }
  return { refresh: paint, reload: load, destroy: stop, ok: () => !!d && !fb };
}
