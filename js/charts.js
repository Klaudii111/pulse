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

/** Price path with stop / entry / target levels. */
export function priceChart(box, s) {
  const draw = () => {
    const w = box.clientWidth, h = box.clientHeight;
    const path = s.price_path || [];
    if (!w || !h || path.length < 2) { box.innerHTML = ''; return; }
    const pad = { l: 4, r: 74, t: 12, b: 22 };
    const ps = path.map((p) => p.p);
    let lo = Math.min(...ps, s.stop, s.target), hi = Math.max(...ps, s.stop, s.target);
    const span = hi - lo; lo -= span * 0.08; hi += span * 0.08;
    const X = (i) => pad.l + (i / (path.length - 1)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
    const ci = Math.max(0, path.findIndex((p) => new Date(p.t) >= new Date(s.created_at)));
    const d = path.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.p).toFixed(1)}`).join('');
    const up = (s.pnl_r ?? 0) >= 0;
    const col = up ? 'var(--up)' : 'var(--down)';
    const lvl = (v, c, label, dash) => `<line x1="${pad.l}" x2="${w - pad.r + 4}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${c}" stroke-width="1" ${dash ? `stroke-dasharray="${dash}"` : ''} opacity="0.85"/>
      <text x="${w - pad.r + 10}" y="${Y(v).toFixed(1)}" dy="0.35em" class="ax lvl num" fill="${c}">${label} ${F.price(v)}</text>`;
    const first = path[0].t, lastT = path[path.length - 1].t;
    const lastP = path[path.length - 1].p;
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${F.esc(s.symbol)}">
      <rect x="${X(ci)}" y="${pad.t}" width="${Math.max(0, X(path.length - 1) - X(ci))}" height="${h - pad.t - pad.b}" fill="var(--raise-2)" opacity="0.6" rx="4"/>
      ${lvl(s.target, 'var(--up)', t('lad.target'), '4 4')}
      ${lvl(s.stop, 'var(--down)', t('lad.stop'), '4 4')}
      ${lvl(s.entry, 'var(--ink-2)', t('lad.entry'), '1 3')}
      <path d="${d}" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${X(path.length - 1)}" cy="${Y(lastP)}" r="4.5" fill="${col}" stroke="var(--raise)" stroke-width="2"/>
      <text x="${pad.l}" y="${h - 5}" class="ax">${s.horizon === 'DEN' ? F.time(first) : F.dm(first)}</text>
      <text x="${X(path.length - 1)}" y="${h - 5}" class="ax" text-anchor="end">${s.horizon === 'DEN' ? F.time(lastT) : F.dm(lastT)}</text>
    </svg>`;
  };
  let size = '';
  const redraw = () => { const k = `${box.clientWidth}x${box.clientHeight}`; if (k !== size) { size = k; draw(); } };
  redraw();
  const ro = new ResizeObserver(redraw);
  ro.observe(box);
  return { destroy: () => ro.disconnect() };
}
