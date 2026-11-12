// 1.9.0 – guided tour with coach-marks on the REAL screens (spotlight + bubble + Další / Přeskočit).
// Started after the first-run guide, from the "?" on Dnes and from Více → "Jak PULSE funguje".
// A step whose element is missing (no signal today, desktop layout …) is skipped. Respects reduced motion.
// Signály also show a one-time 3-step hint (1 co to je · 2 co máš udělat ty · 3 co udělal robot).
import * as store from './store.js';
import { t } from './i18n/index.js';
import * as F from './format.js';

let env = { go: (h) => { location.hash = h; }, route: () => '' };
export const init = (e) => { env = { ...env, ...e }; };

/* 1.10.1: retargeted to the 1.10 screens (Můj účet card, signal tile, Zainvestovat, tabs, Sledované grafy, bell) */
const TAB = (id) => `#tabbar a[href="#/${id}"], #side-nav a[href="#/${id}"]`;
/* 1.13.0: max 4 steps, all on Dnes + the tab bar: Peněženka · a signal (money line + profiles) · Zainvestovat · Zainvestováno */
const TOUR = [
  { route: 'dnes', sel: '#acc-card', k: 'tour.n1' },
  { route: 'dnes', sel: '.cc .cc-money', k: 'tour.n3' },
  { route: 'dnes', sel: '.cc .cc-go', k: 'tour.n4' },
  { route: 'dnes', sel: TAB('zainvestovano'), k: 'tour.n5' },
];
const HINT = [
  { route: 'signaly', sel: '.cc .cc-head', k: 'tour.n2' },
  { route: 'signaly', sel: '.cc .cc-money', k: 'tour.n3' },
];

let root = null, steps = [], i = 0, onEnd = null;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
function find(sel) { return [...document.querySelectorAll(sel)].find(visible) || null; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(sel, ms = 2200) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const el = find(sel); if (el) return el; await wait(120); }
  return null;
}

export const running = () => !!root;

function close(done = true) {
  if (!root) return;
  const el = root; root = null;
  document.querySelectorAll('.tour-badge').forEach((b) => b.remove());
  el.classList.add('is-out');
  setTimeout(() => el.remove(), reduced() ? 0 : 200);
  document.documentElement.classList.remove('has-tour');
  onEnd && onEnd(done);
}

function place(target, step, n, total) {
  const r = target.getBoundingClientRect();
  const pad = 6;
  const spot = root.querySelector('.tour-spot');
  spot.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
  const bub = root.querySelector('.tour-bub');
  bub.querySelector('.tour-n').textContent = t('tour.n', { n, total });
  bub.querySelector('.tour-t').textContent = t(`${step.k}.t`);
  bub.querySelector('.tour-s').textContent = t(`${step.k}.s`);
  bub.querySelector('[data-tour="next"]').textContent = n === total ? t('tour.done') : t('tour.next');
  const vh = window.innerHeight, vw = document.documentElement.clientWidth;
  const bw = Math.min(340, vw - 32);
  bub.style.width = `${bw}px`;
  bub.style.left = `${Math.max(16, Math.min(vw - bw - 16, r.left + r.width / 2 - bw / 2))}px`;
  const below = r.bottom + 14;
  const bh = bub.offsetHeight || 150;
  if (below + bh < vh - 90) { bub.style.top = `${below}px`; bub.dataset.pos = 'below'; }
  else if (r.top - bh - 14 > 60) { bub.style.top = `${r.top - bh - 14}px`; bub.dataset.pos = 'above'; }
  else { bub.style.top = `${Math.max(16, vh - bh - 96)}px`; bub.dataset.pos = 'over'; }
}

function badges(card) {
  document.querySelectorAll('.tour-badge').forEach((b) => b.remove());
  [['.b-what', 1], ['.b-todo', 2], ['.b-bot', 3], ['.b-how', 4]].forEach(([s, n]) => {
    const el = card.querySelector(s); if (!el) return;
    const b = document.createElement('span'); b.className = 'tour-badge num'; b.textContent = String(n);
    el.classList.add('has-tour-badge'); el.prepend(b);
  });
}

async function show(k) {
  if (!root) return;
  const total = steps.length;
  for (; k < total; k++) {
    const st = steps[k];
    if (env.route() !== st.route) { env.go(`#/${st.route}`); await wait(450); }
    const el = await waitFor(st.sel);
    if (!root) return;
    if (!el) continue; // missing element -> skip this step
    el.scrollIntoView({ block: 'center', behavior: 'auto' }); // instant, so the spotlight lands exactly
    await wait(120);
    if (!root) return;
    if (st.badges) badges(el); else document.querySelectorAll('.tour-badge').forEach((b) => b.remove());
    i = k;
    place(el, st, k + 1, total);
    root.querySelector('.tour-bub').focus({ preventScroll: true });
    return;
  }
  close(true);
}

function open(list, end) {
  if (root) close(false);
  steps = list; i = 0; onEnd = end;
  root = document.createElement('div');
  root.className = `tour ${reduced() ? 'is-still' : ''}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t('tour.aria'));
  root.innerHTML = `<div class="tour-spot" aria-hidden="true"></div>
    <div class="tour-bub" tabindex="-1"><p class="tour-n num"></p><p class="tour-t"></p><p class="tour-s"></p>
      <div class="tour-btns"><button type="button" class="btn btn-ghost btn-small" data-tour="skip">${F.esc(t('tour.skip'))}</button><button type="button" class="btn btn-primary btn-small" data-tour="next">${F.esc(t('tour.next'))}</button></div></div>`;
  document.body.appendChild(root);
  document.documentElement.classList.add('has-tour');
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tour]');
    if (!b) return;
    if (b.dataset.tour === 'skip') close(false);
    else show(i + 1);
  });
  root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(false); if (ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); show(i + 1); } });
  const re = () => { if (!root) { window.removeEventListener('resize', re); return; } const el = find(steps[i].sel); if (el) place(el, steps[i], i + 1, steps.length); };
  window.addEventListener('resize', re);
  show(0);
}

export function start() {
  store.set('hint3', 1); // the tour covers the Signály hint
  open(TOUR, () => store.set('tourDone', 1));
}

/* one-time hint on Signály (called after Signály rendered) */
export function maybeHint() {
  if (root || store.get('hint3', 0) || document.querySelector('.onb')) return;
  if (!find('.cc .cc-money')) return;
  store.set('hint3', 1);
  open(HINT, null);
}
