// Motion layer: count-ups, live ticks, marker glide, celebrations, glare, view transitions.
// Everything here animates transform / opacity (SVG stroke offsets for chart draw-in)
// and is skipped entirely under prefers-reduced-motion.
import * as store from './store.js';
import * as F from './format.js';

const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => mq.matches;
export const vtSupported = () => typeof document.startViewTransition === 'function' && !reduced();

const ease = (t) => 1 - Math.pow(1 - t, 3);

/* ---------- Count-up for hero numbers (once per session per key) ---------- */
const counted = new Set();
export function countUps(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const key = el.dataset.countKey || el.id || el.dataset.count;
    const to = parseFloat(el.dataset.count);
    const dec = +(el.dataset.dec ?? 1);
    const ccy = el.dataset.ccy;
    const fmt = ccy ? (v) => F.money(v, ccy, dec) : (v) => (el.dataset.signed === '0' ? F.pct(v, dec) : F.spct(v, dec));
    if (reduced() || counted.has(key) || !Number.isFinite(to)) { el.textContent = fmt(to); return; }
    counted.add(key);
    animateNumber(el, 0, to, fmt, 900);
  });
}

export function animateNumber(el, from, to, fmt, dur = 700) {
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    el.textContent = fmt(from + (to - from) * ease(t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Live updates: P&L tick + flash, ladder marker glide (FLIP) ---------- */
const prev = new Map(); // id -> { pnl, x }
export function liveTicks(root) {
  root.querySelectorAll('[data-live-id]').forEach((card) => {
    const id = card.dataset.liveId;
    const pnl = parseFloat(card.dataset.pnl);
    const marker = card.querySelector('.ladder-now');
    const x = marker ? marker.getBoundingClientRect().left : null;
    const p = prev.get(id);
    if (p && !reduced()) {
      if (Number.isFinite(pnl) && Math.abs(pnl - p.pnl) >= 0.005) {
        const el = card.querySelector('.sig-pnl');
        if (el) {
          animateNumber(el, p.pnl, pnl, (v) => F.spct(v, 2), 600);
          el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth;
          el.classList.add(pnl > p.pnl ? 'flash-up' : 'flash-down');
        }
      }
      if (marker && p.x != null && x != null && Math.abs(p.x - x) > 0.5) {
        marker.animate([{ transform: `translateX(${p.x - x}px)` }, { transform: 'translateX(0)' }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    prev.set(id, { pnl, x });
  });
}

/* ---------- Celebration (target) / calm pulse (stop), once per signal ---------- */
export function celebrate(root) {
  const done = new Set(store.get('celebrated', []));
  let changed = false;
  root.querySelectorAll('.sig.is-target, .sig.is-stop').forEach((card) => {
    const id = card.dataset.id;
    if (!id || done.has(id)) return;
    done.add(id); changed = true;
    if (reduced()) return;
    const isTarget = card.classList.contains('is-target');
    card.classList.add(isTarget ? 'celebrate' : 'calm-pulse');
    setTimeout(() => card.classList.remove('celebrate', 'calm-pulse'), 2200);
    if (isTarget) burst(card);
  });
  if (changed) store.set('celebrated', [...done].slice(-200));
}

function burst(card) {
  const m = card.querySelector('.ladder-now') || card;
  const r = m.getBoundingClientRect(), c = card.getBoundingClientRect();
  const cx = r.left - c.left + r.width / 2, cy = r.top - c.top + r.height / 2;
  const layer = document.createElement('span');
  layer.className = 'burst';
  card.append(layer);
  const N = 22;
  for (let i = 0; i < N; i++) {
    const p = document.createElement('i');
    const a = (i / N) * Math.PI * 2 + Math.random() * 0.3;
    const d = 26 + Math.random() * 46;
    const s = 3 + Math.random() * 3.5;
    p.style.cssText = `left:${cx}px;top:${cy}px;width:${s}px;height:${s}px`;
    layer.append(p);
    p.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 400, delay: 120 + Math.random() * 80, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'both' });
  }
  setTimeout(() => layer.remove(), 1700);
}

/* ---------- Pointer-follow glare on hero (desktop, fine pointer only) ---------- */
export function glare(root) {
  if (reduced() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  root.querySelectorAll('.hero, .chart-card').forEach((el) => {
    if (el.querySelector('.glare')) return;
    const g = document.createElement('span');
    g.className = 'glare';
    el.prepend(g);
    let raf = 0;
    el.addEventListener('pointermove', (ev) => {
      const r = el.getBoundingClientRect();
      const x = ev.clientX - r.left - 160, y = ev.clientY - r.top - 160;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { g.style.transform = `translate3d(${x}px, ${y}px, 0)`; g.style.opacity = '1'; });
    });
    el.addEventListener('pointerleave', () => { g.style.opacity = '0'; });
  });
}

/* ---------- Ring + bar entrance ---------- */
export function entrances(root, first) {
  if (reduced() || !first) return;
  root.querySelectorAll('.ring .ring-arc').forEach((c) => {
    const full = c.getAttribute('stroke-dasharray');
    const C = parseFloat(full.split(' ')[1]);
    c.animate([{ strokeDasharray: `0 ${C}` }, { strokeDasharray: full }], { duration: 1100, delay: 150, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  });
  root.querySelectorAll('.mbar i').forEach((b, i) => {
    const neg = b.parentElement.classList.contains('mbar-neg');
    b.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 700, delay: 200 + i * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards', composite: 'replace' });
    b.style.transformOrigin = neg ? 'top' : 'bottom';
  });
  /* 1.6.0: sparklines draw in, status bars fill from the entry */
  root.querySelectorAll('.spark polyline').forEach((pl, i) => {
    let len = 0; try { len = pl.getTotalLength(); } catch { /* not rendered */ }
    if (!len) return;
    pl.style.strokeDasharray = `${len} ${len}`;
    pl.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1000, delay: 120 + Math.min(i, 8) * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  });
  root.querySelectorAll('.trk-fill').forEach((b, i) => {
    b.animate([{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], { duration: 800, delay: 150 + Math.min(i, 10) * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  });
  root.querySelectorAll('.hbar i').forEach((b, i) => {
    b.style.transformOrigin = b.classList.contains('down') ? 'right' : 'left';
    b.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 700, delay: 250 + i * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  });
}

/* ---------- Aurora pause when hidden ---------- */
document.addEventListener('visibilitychange', () => {
  document.documentElement.classList.toggle('is-hidden', document.hidden);
});

/* ---------- View transitions ---------- */
export function withTransition(update) {
  if (!vtSupported()) { update(); return null; }
  try {
    const vt = document.startViewTransition(update);
    // A newer navigation may skip this transition; that is expected, not an error.
    vt.ready?.catch(() => {}); vt.finished?.catch(() => {}); vt.updateCallbackDone?.catch(() => {});
    return vt;
  } catch { update(); return null; }
}

/* ---------- 1.12.0 confetti-lite: a trade reached its target (once, ~1.4 s, gold + green; nothing under reduced motion) ---------- */
export function confetti() {
  if (reduced() || typeof document === 'undefined' || document.querySelector('.confetti')) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const W0 = window.innerWidth, cols = ['#eed6a7', '#d9b779', '#52c58b', '#a78bfa', '#f5f1e8'];
  for (let i = 0; i < 34; i++) {
    const p = document.createElement('i');
    const x = W0 * (0.2 + Math.random() * 0.6);
    const w = 5 + Math.random() * 5;
    p.style.cssText = `left:${x}px;top:-12px;width:${w}px;height:${w * (0.4 + Math.random() * 0.5)}px;background:${cols[i % cols.length]}`;
    layer.append(p);
    const dx = (Math.random() - 0.5) * 220, dy = window.innerHeight * (0.45 + Math.random() * 0.4), rot = (Math.random() - 0.5) * 720;
    p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 0 }],
      { duration: 1100 + Math.random() * 600, delay: Math.random() * 180, easing: 'cubic-bezier(.2,.6,.35,1)', fill: 'both' });
  }
  setTimeout(() => layer.remove(), 2100);
}
