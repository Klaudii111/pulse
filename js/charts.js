// Hand-drawn responsive SVG charts (no library).
import * as F from './format.js';
import { t } from './i18n/index.js';

const NS = 'http://www.w3.org/2000/svg';

function niceStep(range, count) {
  const raw = range / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}

let gid = 0;

/**
 * Equity curve – bot vs S&P 500, both rebased to 0 % at range start.
 * series: [{date, bot, spy}] ; opts.onScrub(i|null, point)
 */
export function equityChart(box, series, opts = {}) {
  const draw = () => {
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h || series.length < 2) return;
    const id = ++gid;
    const b0 = series[0].bot, s0 = series[0].spy;
    const pts = series.map((p) => ({ date: p.date, bot: (p.bot / b0 - 1) * 100, spy: (p.spy / s0 - 1) * 100 }));
    const pad = { l: 16, r: 52, t: 16, b: 28 };
    const vals = pts.flatMap((p) => [p.bot, p.spy]).concat(0);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const span = hi - lo || 1;
    lo -= span * 0.1; hi += span * 0.12;
    const step = niceStep(hi - lo, h > 300 ? 5 : 3);
    const X = (i) => pad.l + (i / (pts.length - 1)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
    const line = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[k]).toFixed(1)}`).join('');
    const area = `${line('bot')}L${X(pts.length - 1).toFixed(1)},${Y(lo).toFixed(1)}L${X(0).toFixed(1)},${Y(lo).toFixed(1)}Z`;

    let grid = '';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = Y(v).toFixed(1);
      const zero = Math.abs(v) < step / 1000;
      grid += `<line x1="${pad.l}" x2="${w - pad.r + 6}" y1="${y}" y2="${y}" stroke="var(--line${zero ? '-3' : ''})" ${zero ? 'stroke-dasharray="3 4"' : ''}/>`;
      grid += `<text x="${w - pad.r + 12}" y="${y}" dy="0.35em" class="ax num">${F.spct(v, step < 1 ? 1 : 0)}</text>`;
    }
    let xl = '', lastM = -1, lastX = -100;
    pts.forEach((p, i) => {
      const m = +p.date.slice(5, 7);
      if (m !== lastM) {
        lastM = m;
        const x = X(i);
        if (x - lastX > 44 && x < w - pad.r - 10) { xl += `<text x="${x.toFixed(1)}" y="${h - 8}" class="ax">${F.monShort(p.date)}</text>`; lastX = x; }
      }
    });
    const last = pts[pts.length - 1];
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${F.esc(t('res.chart'))}">
      <defs><linearGradient id="eqg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity="0.22"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
      <g>${grid}</g><g>${xl}</g>
      <path d="${area}" fill="url(#eqg${id})" class="eq-area"/>
      <path d="${line('spy')}" fill="none" stroke="var(--neutral)" stroke-width="1.6" stroke-linejoin="round" class="eq-spy"/>
      <path d="${line('bot')}" fill="none" stroke="var(--gold)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" class="eq-bot"/>
      <circle class="eq-end" style="transform-box:fill-box;transform-origin:center" cx="${X(pts.length - 1)}" cy="${Y(last.bot)}" r="4" fill="var(--gold)" stroke="var(--raise)" stroke-width="2"/>
      <circle class="eq-end" style="transform-box:fill-box;transform-origin:center" cx="${X(pts.length - 1)}" cy="${Y(last.spy)}" r="3.5" fill="var(--neutral)" stroke="var(--raise)" stroke-width="2"/>
      <g class="xh" style="display:none">
        <line class="xh-l" y1="${pad.t}" y2="${h - pad.b}" stroke="var(--line-3)"/>
        <circle class="xh-b" r="5" fill="var(--gold)" stroke="var(--raise)" stroke-width="2"/>
        <circle class="xh-s" r="4.5" fill="var(--neutral)" stroke="var(--raise)" stroke-width="2"/>
      </g>
    </svg><div class="chart-tip" aria-hidden="true"></div>`;
    if (opts.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const draw = (p, dur, delay) => {
        try {
          const L = p.getTotalLength();
          p.animate([{ strokeDasharray: `${L} ${L}`, strokeDashoffset: L }, { strokeDasharray: `${L} ${L}`, strokeDashoffset: 0 }],
            { duration: dur, delay, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'backwards' });
        } catch { /* ignore */ }
      };
      draw(box.querySelector('.eq-bot'), 1300, 120);
      draw(box.querySelector('.eq-spy'), 1300, 0);
      box.querySelector('.eq-area')?.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 700, easing: 'ease-out', fill: 'backwards' });
      box.querySelectorAll('.eq-end').forEach((c) => c.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 1350, fill: 'backwards' }));
      opts.animate = false;
    }
    const svg = box.querySelector('svg');
    const xh = svg.querySelector('.xh');
    const tip = box.querySelector('.chart-tip');
    const scrub = (ev) => {
      const r = svg.getBoundingClientRect();
      const x = ev.clientX - r.left;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(((x - pad.l) / (w - pad.l - pad.r)) * (pts.length - 1))));
      const p = pts[i];
      xh.style.display = '';
      xh.querySelector('.xh-l').setAttribute('x1', X(i)); xh.querySelector('.xh-l').setAttribute('x2', X(i));
      xh.querySelector('.xh-b').setAttribute('cx', X(i)); xh.querySelector('.xh-b').setAttribute('cy', Y(p.bot));
      xh.querySelector('.xh-s').setAttribute('cx', X(i)); xh.querySelector('.xh-s').setAttribute('cy', Y(p.spy));
      tip.innerHTML = `<p class="d">${F.dmy(p.date)}</p><div><i style="background:var(--gold)"></i><span class="num">${F.spct(p.bot)}</span>&nbsp;${F.esc(t('robot'))}</div><div><i style="background:var(--neutral)"></i><span class="num">${F.spct(p.spy)}</span>&nbsp;S&amp;P 500</div>`;
      const tw = tip.offsetWidth || 120;
      let left = X(i) + 12;
      if (left + tw > w - 4) left = X(i) - tw - 12;
      tip.style.left = `${Math.max(4, left)}px`;
      tip.style.top = `${Math.max(0, Math.min(Y(p.bot), Y(p.spy)) - 70)}px`;
      tip.classList.add('is-on');
      opts.onScrub && opts.onScrub(i, p);
    };
    const leave = () => { xh.style.display = 'none'; tip.classList.remove('is-on'); opts.onScrub && opts.onScrub(null, last); };
    svg.addEventListener('pointermove', scrub);
    svg.addEventListener('pointerdown', scrub);
    svg.addEventListener('pointerleave', leave);
    svg.addEventListener('pointercancel', leave);
    svg.addEventListener('pointerup', (ev) => { if (ev.pointerType !== 'mouse') leave(); });
  };
  let size = '';
  const redraw = () => { const k = `${box.clientWidth}x${box.clientHeight}`; if (k !== size) { size = k; draw(); } };
  redraw();
  const ro = new ResizeObserver(redraw);
  ro.observe(box);
  return { destroy: () => ro.disconnect(), last: () => series[series.length - 1] };
}

const nyDayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/* Price points for a chart mode: 'today' = the newest trading day (5-min points, opened by the previous close),
   'all' = one point per day (close of each day, the newest day's latest price). */
export function pricePoints(s, mode) {
  const raw = s.price_path || [];
  if (!raw.length) return [];
  if (mode === 'today') {
    const day = nyDayOf(raw[raw.length - 1].t);
    const i = raw.findIndex((p) => nyDayOf(p.t) === day);
    return i > 0 ? raw.slice(i - 1) : raw.slice(i);
  }
  if (mode === '5d') {
    /* the last 5 trading days, every point (5-min path where the bot/live layer has it) */
    const days = [...new Set(raw.map((p) => nyDayOf(p.t)))].slice(-5);
    const i = raw.findIndex((p) => nyDayOf(p.t) === days[0]);
    return raw.slice(Math.max(0, i));
  }
  const out = [];
  raw.forEach((p) => {
    const last = out[out.length - 1];
    if (last && nyDayOf(last.t) === nyDayOf(p.t)) out[out.length - 1] = p; else out.push(p);
  });
  return out.length >= 2 ? out : raw; // a signal from today: its intraday points are the whole story
}

/* more than one trading day in the path -> the 5D tab makes sense */
export function hasDays(s) {
  return new Set((s.price_path || []).map((p) => nyDayOf(p.t))).size >= 2;
}

/* 'today' has something to show only with at least 2 points of the newest trading day */
export function hasToday(s) {
  const raw = s.price_path || [];
  if (raw.length < 2) return false;
  const day = nyDayOf(raw[raw.length - 1].t);
  return raw.filter((p) => nyDayOf(p.t) === day).length >= 2;
}

/* Default chart mode: 'today' once the newest day has at least 3 intraday points. */
export function defaultPriceMode(s) {
  const raw = s.price_path || [];
  const oneDay = raw.length >= 2 && nyDayOf(raw[0].t) === nyDayOf(raw[raw.length - 1].t);
  return hasToday(s) && (oneDay || pricePoints(s, 'today').length >= 4) ? 'today' : 'all';
}

/** Live price chart with entry / stop / target lines (1.6.0).
 * opts.mode = 'today' | '5d' | 'all' (getter or value); opts.isLive() -> true only while prices are fresh
 * (market open and data < 60 s): only then the last dot pulses. A stale chart never pretends to be live.
 * Levels are optional (Obchodní platforma without a stop/target). */
export function priceChart(box, s, opts = {}) {
  const modeOf = () => (typeof opts.mode === 'function' ? opts.mode() : opts.mode) || 'all';
  const uid = `pc${Math.random().toString(36).slice(2, 7)}`;
  let geo = null;
  const draw = () => {
    geo = null;
    const w = box.clientWidth, h = box.clientHeight;
    const mode = modeOf();
    const path = pricePoints(s, mode);
    if (!w || !h || path.length < 2) { box.innerHTML = `<p class="pchart-empty">${t('chart.empty')}</p>`; return; }
    const pad = { l: 4, r: 78, t: 12, b: 22 };
    const ps = path.map((p) => p.p);
    const lv = [s.stop, s.target, s.entry].filter((v) => v > 0);
    let lo = Math.min(...ps, ...lv), hi = Math.max(...ps, ...lv);
    const span = (hi - lo) || hi * 0.01 || 1; lo -= span * 0.08; hi += span * 0.08;
    const X = (i) => pad.l + (i / (path.length - 1)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
    const ci = s.created_at ? Math.max(0, path.findIndex((p) => new Date(p.t) >= new Date(s.created_at))) : 0;
    const d = path.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.p).toFixed(1)}`).join('');
    const lastP = path[path.length - 1].p;
    const dir = s.action === 'SELL' ? -1 : 1;
    const up = s.entry > 0 ? dir * (lastP - s.entry) >= 0 : lastP >= ps[0];
    const col = up ? 'var(--up)' : 'var(--down)';
    const xe = X(path.length - 1), ye = Y(lastP);
    /* label positions: keep the right-hand labels from overlapping */
    const labels = [];
    const lvl = (v, c, label, dash) => {
      if (!(v > 0)) return '';
      labels.push({ y: Y(v), c, txt: `${label} ${F.price(v)}` });
      return `<line x1="${pad.l}" x2="${w - pad.r + 4}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${c}" stroke-width="1" ${dash ? `stroke-dasharray="${dash}"` : ''} opacity="0.85"/>`;
    };
    const lines = lvl(s.target, 'var(--up)', t('lad.target'), '4 4') + lvl(s.stop, 'var(--down)', t('lad.stop'), '4 4') + lvl(s.entry, 'var(--ink-2)', t('lad.entry'), '1 3');
    labels.push({ y: ye, c: col, txt: F.price(lastP), now: true });
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
    const zone = s.entry > 0 ? `<rect x="${X(ci).toFixed(1)}" y="${Math.min(Y(s.entry), ye).toFixed(1)}" width="${Math.max(0, xe - X(ci)).toFixed(1)}" height="${Math.abs(Y(s.entry) - ye).toFixed(1)}" fill="${col}" opacity="0.13"/>` : '';
    const area = `${d}L${xe.toFixed(1)},${(h - pad.b).toFixed(1)}L${X(0).toFixed(1)},${(h - pad.b).toFixed(1)}Z`;
    const live = !!(opts.isLive && opts.isLive());
    const first = path[0].t, lastT = path[path.length - 1].t;
    /* 1.9.0 markers: where the robot bought, where I bought, exits (▲ in, ▼ out) - placed at the nearest point in time */
    const t0 = Date.parse(first), t1 = Date.parse(lastT);
    const marks = (opts.marks ? opts.marks() : []).filter((m) => m && m.p > 0 && m.t >= t0 - 60000 && m.t <= t1 + 300000).map((m) => {
      let best = 0, bd = Infinity;
      path.forEach((pt, i) => { const d = Math.abs(Date.parse(pt.t) - m.t); if (d < bd) { bd = d; best = i; } });
      const x = X(best), y = Y(m.p);
      const upTri = m.dir > 0;
      const tri = upTri ? `M${x - 6},${y + 11}L${x + 6},${y + 11}L${x},${y + 2}Z` : `M${x - 6},${y - 11}L${x + 6},${y - 11}L${x},${y - 2}Z`;
      return `<g class="pc-mark is-${m.kind}"><path d="${tri}"/><text x="${x}" y="${upTri ? y + 23 : y - 15}" text-anchor="middle" class="ax pc-mark-l">${F.esc(m.label)}</text></g>`;
    }).join('');
    const intraday = mode === 'today' || mode === '5d' || s.horizon === 'DEN';
    geo = { path, X, Y, pad, w, intraday };
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${F.esc(s.symbol)}">
      <defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".16"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
      ${zone}
      <path d="${area}" fill="url(#${uid})"/>
      ${lines}
      <path class="pc-line" d="${d}" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      ${live ? `<circle class="pc-ping" cx="${xe}" cy="${ye}" r="5" fill="${col}"/>` : ''}
      <circle cx="${xe}" cy="${ye}" r="4.5" fill="${live ? col : 'var(--ink-3)'}" stroke="var(--raise)" stroke-width="2"/>
      ${marks}
      ${labels.map((l) => `<text x="${w - pad.r + 10}" y="${l.y.toFixed(1)}" dy="0.35em" class="ax lvl num ${l.now ? 'is-now' : ''}" fill="${l.c}">${F.esc(l.txt)}</text>`).join('')}
      <text x="${pad.l}" y="${h - 5}" class="ax">${intraday ? (nyDayOf(first) === nyDayOf(lastT) ? F.time(first) : F.dmTime(first)) : F.dm(first)}</text>
      <text x="${xe}" y="${h - 5}" class="ax" text-anchor="end">${intraday ? F.time(lastT) : F.dm(lastT)}</text>
    </svg>`;
  };
  let size = '';
  const redraw = () => { const k = `${box.clientWidth}x${box.clientHeight}`; if (k !== size) { size = k; draw(); } };
  redraw();
  const ro = new ResizeObserver(redraw);
  ro.observe(box);
  /* scrub: touch / hover shows the price and time under the finger */
  const scrub = (ev) => {
    if (!geo) return;
    const r = box.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const n = geo.path.length - 1;
    const i = Math.max(0, Math.min(n, Math.round(((x - geo.pad.l) / (geo.w - geo.pad.l - geo.pad.r)) * n)));
    const pt = geo.path[i];
    let tip = box.querySelector('.pc-tip'), cr = box.querySelector('.pc-cross');
    if (!tip) { tip = document.createElement('div'); tip.className = 'pc-tip num'; cr = document.createElement('div'); cr.className = 'pc-cross'; box.append(cr, tip); }
    const px = geo.X(i);
    cr.style.left = `${px}px`;
    tip.style.left = `${Math.max(50, Math.min(geo.w - 50, px))}px`;
    tip.innerHTML = `<b>${F.price(pt.p)}</b>${geo.intraday ? F.dmTime(pt.t) : F.dm(pt.t)}`;
  };
  const leave = () => { box.querySelectorAll('.pc-tip, .pc-cross').forEach((n) => n.remove()); };
  box.addEventListener('pointermove', scrub);
  box.addEventListener('pointerdown', scrub);
  box.addEventListener('pointerleave', leave);
  box.addEventListener('pointercancel', leave);
  const destroy = () => {
    ro.disconnect();
    box.removeEventListener('pointermove', scrub); box.removeEventListener('pointerdown', scrub);
    box.removeEventListener('pointerleave', leave); box.removeEventListener('pointercancel', leave);
  };
  return { destroy, refresh: () => { size = ''; redraw(); } };
}
