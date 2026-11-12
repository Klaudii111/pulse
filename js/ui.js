import * as F from './format.js';
import { t } from './i18n/index.js';
import * as D from './domain.js';
import { cls as mktCls } from './market.js';

export const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* ---------- Segmented control ---------- */
export function seg({ name, items, active, small = false, label = '' }) {
  const i = Math.max(0, items.findIndex((x) => x.id === active));
  return `<div class="seg ${small ? 'seg-sm' : ''}" role="tablist" aria-label="${F.esc(label)}" style="--n:${items.length};--i:${i}" data-seg="${name}">
    <span class="seg-ind" aria-hidden="true"></span>
    ${items.map((x) => `<button class="seg-btn${x.locked ? ' is-locked' : ''}" role="tab" type="button" data-action="seg" data-seg-name="${name}" data-id="${x.id}" aria-selected="${x.id === active}">
      ${x.locked ? icon('lock', 'icon-xs') : x.hz ? hzIcon(x.hz) : ''}<span class="seg-l">${F.esc(x.label)}</span>${x.count != null && !x.locked ? `<span class="seg-count num">${x.count}</span>` : ''}
    </button>`).join('')}
  </div>`;
}

/* Move indicator without re-render (smooth) */
export function segMove(root, name, id) {
  const el = root.querySelector(`[data-seg="${name}"]`);
  if (!el) return;
  const btns = [...el.querySelectorAll('.seg-btn')];
  const i = btns.findIndex((b) => b.dataset.id === id);
  el.style.setProperty('--i', Math.max(0, i));
  btns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id)));
}

/* ---------- Price ladder (signature element) ---------- */
export function ladderGeometry(s) {
  const buy = s.action === 'BUY';
  const left = buy ? s.stop : s.target;
  const right = buy ? s.target : s.stop;
  const span = right - left || 1;
  const pos = (p) => Math.max(0, Math.min(100, ((p - left) / span) * 100));
  return { buy, left, right, pos, e: pos(s.entry) };
}

export function liveState(s) {
  if (s.status && s.status !== 'open') return s.status;
  if (s.intraday_hit) return s.intraday_hit;
  return 'open';
}

export function ladder(s, { large = false, animate = false, exitPrice = null } = {}) {
  const g = ladderGeometry(s);
  const e = g.e;
  const hasLive = s.last_price != null && (!s.status || s.status === 'open');
  const state = liveState(s);
  const cur = hasLive ? g.pos(state === 'target' ? s.target : state === 'stop' ? s.stop : s.last_price) : null;
  const up = hasLive ? (s.pnl_r ?? 0) >= 0 : false;
  const riskSeg = g.buy ? `left:0;width:${e}%` : `left:${e}%;width:${100 - e}%`;
  const rewSeg = g.buy ? `left:${e}%;width:${100 - e}%` : `left:0;width:${e}%`;
  const dist = (p) => `(${F.spct(((p - s.entry) / s.entry) * 100, 1)})`;
  const leftIsStop = g.buy;
  /* large (detail): "Cena cíle 235,08 (+24,5 %)" = the PRICE move, never confused with the account gain */
  const k = (x) => t(large ? `lad.${x}P` : `lad.${x}`);
  const L = leftIsStop
    ? { lab: k('stop'), dot: 'down', p: s.stop }
    : { lab: k('target'), dot: 'up', p: s.target };
  const R = leftIsStop
    ? { lab: k('target'), dot: 'up', p: s.target }
    : { lab: k('stop'), dot: 'down', p: s.stop };
  let fill = '';
  if (cur != null) {
    const a = Math.min(e, cur), w = Math.abs(cur - e);
    fill = `<span class="ladder-fill ${up ? 'up' : 'down'}" style="left:${a}%;width:${w}%"></span>`;
  }
  let marker = '';
  if (cur != null) {
    marker = `<span class="ladder-now ${up ? 'up' : 'down'} ${state !== 'open' ? 'is-hit' : ''}" style="left:${cur}%">${state === 'target' ? icon('check', 'icon-xs') : state === 'stop' ? icon('close', 'icon-xs') : ''}</span>`;
  } else if (exitPrice != null) {
    marker = `<span class="ladder-exit" style="left:${g.pos(exitPrice)}%" title="${t('lad.exit')}"></span>`;
  }
  return `<div class="ladder ${g.buy ? '' : 'is-sell'} ${animate ? 'is-anim' : ''} ${cur != null ? 'is-live' : ''}" style="--e:${e.toFixed(2)}%" aria-hidden="true">
    <div class="ladder-track">
      <span class="ladder-seg risk ${g.buy ? 'grow-l' : 'grow-r rev'}" style="${riskSeg}"></span>
      <span class="ladder-seg reward ${g.buy ? 'grow-r' : 'grow-l rev'}" style="${rewSeg}"></span>
      ${fill}
      <span class="ladder-cap" style="left:0;background:var(--${L.dot})"></span>
      <span class="ladder-cap" style="left:calc(100% - 2px);background:var(--${R.dot})"></span>
      <span class="ladder-entry" style="left:${e}%"></span>
      ${marker}
    </div>
    <div class="ladder-labels">
      <div><div class="lab"><i class="${L.dot}"></i>${L.lab}</div><div class="price num">${F.price(L.p)}${large ? `<small>${dist(L.p)}</small>` : ''}</div></div>
      <div><div class="lab"><i class="ink"></i>${k('entry')}</div><div class="price num">${F.price(s.entry)}${large ? `<small>${t(s.action === 'BUY' ? 'lad.buy' : 'lad.sell')}</small>` : ''}</div></div>
      <div><div class="lab">${R.lab}<i class="${R.dot}"></i></div><div class="price num">${F.price(R.p)}${large ? `<small>${dist(R.p)}</small>` : ''}</div></div>
    </div>
  </div>`;
}

export const pill = (action) => `<span class="pill ${action === 'BUY' ? 'pill-buy' : 'pill-sell'}">${icon(action === 'BUY' ? 'up' : 'down')}${F.SIDE[action] || action}</span>`;

/* ---------- Sheets (bottom sheet on mobile, drawer on desktop) ---------- */
const stack = [];
let closingViaHistory = false;

export function openSheet({ html, label = 'Detail', small = false, onMount, onClose, className = '', instant = false }) {
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  const el = document.createElement('div');
  el.className = `sheet ${small ? 'is-small' : ''} ${className}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label);
  el.tabIndex = -1;
  el.innerHTML = `<div class="sheet-grab"><div class="sheet-handle" aria-hidden="true"></div></div>${html}`;
  const root = document.getElementById('sheet-root');
  root.append(scrim, el);
  const prevFocus = document.activeElement;
  const entry = { el, scrim, onClose, prevFocus };
  stack.push(entry);
  document.documentElement.classList.add('has-sheet');
  if (instant) {
    el.style.transition = 'none'; scrim.style.transition = 'none';
    el.classList.add('is-open'); scrim.classList.add('is-open');
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = ''; scrim.style.transition = ''; }));
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('is-open'); scrim.classList.add('is-open'); }));
  }
  try { history.pushState({ pulseSheet: stack.length }, ''); } catch { /* ignore */ }
  scrim.addEventListener('click', () => closeTopSheet());
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); closeTopSheet(); }
    if (ev.key === 'Tab') trapFocus(el, ev);
  });
  enableDrag(el);
  setTimeout(() => el.focus({ preventScroll: true }), 60);
  onMount && onMount(el);
  return el;
}

function trapFocus(el, ev) {
  const f = [...el.querySelectorAll('button:not([disabled]), a[href], input, select, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
}

function enableDrag(el) {
  const grab = el.querySelector('.sheet-grab');
  const head = el.querySelector('.sheet-head');
  let y0 = null, dy = 0;
  const start = (ev) => {
    if (window.matchMedia('(min-width: 1100px)').matches) return;
    if (ev.target.closest('button')) return;
    y0 = ev.clientY; dy = 0; el.style.transition = 'none';
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };
  const move = (ev) => {
    if (y0 == null) return;
    dy = Math.max(0, ev.clientY - y0);
    el.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (y0 == null) return;
    y0 = null; el.style.transition = ''; el.style.transform = '';
    if (dy > 110) closeTopSheet();
  };
  [grab, head].filter(Boolean).forEach((h) => {
    h.style.touchAction = 'none';
    h.addEventListener('pointerdown', start);
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  });
}

function closeInternal(entry) {
  const i = stack.indexOf(entry);
  if (i >= 0) stack.splice(i, 1);
  entry.el.classList.remove('is-open');
  entry.scrim.classList.remove('is-open');
  const done = () => { entry.el.remove(); entry.scrim.remove(); };
  setTimeout(done, 520);
  if (!stack.length) document.documentElement.classList.remove('has-sheet');
  entry.onClose && entry.onClose();
  if (entry.prevFocus && document.contains(entry.prevFocus)) entry.prevFocus.focus({ preventScroll: true });
}

export function closeTopSheet() {
  if (!stack.length) return;
  /* 1.13.3: a sheet on its way out no longer counts as open for toasts (they used to sit above a sheet that was leaving) */
  stack[stack.length - 1].el.classList.add('is-closing');
  // Pop the history entry we pushed; popstate handler then closes the sheet.
  closingViaHistory = true;
  history.back();
  setTimeout(() => { if (closingViaHistory) { closingViaHistory = false; const t = stack[stack.length - 1]; t && closeInternal(t); } }, 350);
}

export function closeAllSheets() {
  while (stack.length) closeInternal(stack[stack.length - 1]);
}

export const sheetOpen = () => stack.length > 0;

window.addEventListener('popstate', () => {
  closingViaHistory = false;
  if (stack.length) closeInternal(stack[stack.length - 1]);
});

/* ---------- Toast ---------- */
/* 1.13.2: every toast stays 3 s (5 s with a button) and never covers an open sheet's buttons:
   it sits above the sheet when there is room, otherwise just under the sheet's head (taps go through it) */
/* 1.13.3: an amount field shown with spaces while typing ("7 507", "10 000") like the first-run amount;
   the caret stays after the same digit. Returns the whole number typed (0 when empty). */
export function groupInput(inp) {
  const pos = inp.selectionStart ?? inp.value.length;
  const before = inp.value.slice(0, pos).replace(/\D/g, '').length;
  const digits = inp.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 10);
  const v = digits ? +digits : 0;
  inp.value = digits ? F.num(v, 0) : '';
  let k = 0, c = 0;
  while (c < inp.value.length && k < before) { if (/\d/.test(inp.value[c])) k++; c++; }
  try { inp.setSelectionRange(c, c); } catch { /* not focused */ }
  return v;
}

/* 1.13.3: a toast never covers the button the user is about to press: when it would overlap a visible primary
   action (card Zainvestovat, Koupit / Prodat …) it moves under the top bar */
const CTA_SEL = '.btn-primary, .cc-go, .btn-invest, .trade-btn, .d-cta .btn';
function dodgeCta(root, el) {
  const r = el.getBoundingClientRect();
  if (!r.height) return;
  const hit = [...document.querySelectorAll(`#view ${CTA_SEL.split(', ').join(', #view ')}`)].some((b) => {
    const q = b.getBoundingClientRect();
    return q.height > 0 && q.bottom > r.top - 4 && q.top < r.bottom + 4 && q.right > r.left && q.left < r.right;
  });
  if (!hit) return;
  const tb = document.querySelector('.topbar');
  const top = tb && tb.getBoundingClientRect().height ? tb.getBoundingClientRect().bottom : 12;
  root.style.top = `${Math.round(top + 8)}px`; root.style.bottom = 'auto';
  root.classList.add('is-top');
}

export function toast(msg, { action = null, timeout = 3000 } = {}) {
  const root = document.getElementById('toast-root');
  root.querySelectorAll('.toast').forEach((n) => n.remove());
  timeout = action ? 5000 : 3000;
  root.style.top = ''; root.style.bottom = ''; root.classList.remove('is-over', 'is-top');
  const sh = [...document.querySelectorAll('.sheet.is-open:not(.is-closing)')].pop();
  if (sh) {
    const r = sh.getBoundingClientRect();
    if (r.top >= 72) root.style.bottom = `${Math.round(window.innerHeight - r.top + 8)}px`;
    else {
      const hd = sh.querySelector('.sheet-head');
      root.style.top = `${Math.round((hd ? hd.getBoundingClientRect().bottom : r.top + 56) + 6)}px`;
      root.style.bottom = 'auto';
      root.classList.add('is-over');
    }
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${msg}</span>${action ? `<button class="btn btn-primary" type="button">${F.esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').addEventListener('click', () => { action.fn(); hide(); });
  root.append(el);
  if (!sh) dodgeCta(root, el);
  let timer = setTimeout(hide, timeout);
  function hide() { clearTimeout(timer); el.classList.add('is-out'); setTimeout(() => { el.remove(); if (!root.querySelector('.toast')) { root.style.top = ''; root.style.bottom = ''; root.classList.remove('is-over', 'is-top'); } }, 260); }
  return hide;
}

/* ---------- Skeletons ---------- */
export function skCard() {
  return `<div class="sk-card" aria-hidden="true">
    <div class="sk-row"><div><div class="sk" style="width:84px;height:22px"></div><div class="sk" style="width:120px;height:12px;margin-top:8px"></div></div><div class="sk" style="width:64px;height:26px;border-radius:99px"></div></div>
    <div class="sk" style="height:4px;margin-top:26px"></div>
    <div class="sk-row" style="margin-top:14px"><div class="sk" style="width:64px;height:30px"></div><div class="sk" style="width:64px;height:30px"></div><div class="sk" style="width:64px;height:30px"></div></div>
    <div class="sk" style="height:1px;margin-top:16px"></div>
    <div class="sk-row" style="margin-top:14px"><div class="sk" style="width:70px;height:28px"></div><div class="sk" style="width:70px;height:28px"></div><div class="sk" style="width:70px;height:28px"></div></div>
  </div>`;
}
export const skBlock = (h = 120, r = 22) => `<div class="sk" style="height:${h}px;border-radius:${r}px" aria-hidden="true"></div>`;

export function haptic(ms = 8) { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* ignore */ } }

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

/* ---------- Monogram avatar (no real logos) ---------- */
export function monogram(symbol, name = '') {
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) % 360;
  /* index CFDs (US500, DE40 …): the first letter of the plain name (S&P, DAX) reads better than U / D */
  /* 1.13.1: the first letter of the plain name (XOM -> E, VLO -> V); ETFs the first + last letter of the ticker
     so XLE / XLV / XLP never look the same (the same on every screen); the colour stays per symbol */
  const words = String(name || '').replace(/\([^)]*\)/g, ' ').split(/[^\p{L}\p{N}&]+/u).filter((x) => /\p{L}/u.test(x));
  let k = 'stock';
  try { k = mktCls(symbol); } catch { /* registry not ready */ }
  const tk = symbol.replace(/[^A-Z]/g, '');
  let letters = '';
  if (k === 'etf' && tk.length >= 2) letters = tk[0] + tk[tk.length - 1]; // XLE -> XE, XLV -> XV, XLP -> XP, SPY -> SY
  else if (words.length && name !== symbol) letters = words[0][0].toUpperCase();
  letters = letters || symbol.replace(/[^A-Z]/g, '').slice(0, 1) || symbol.slice(0, 1);
  return `<span class="mono${letters.length > 1 ? ' is-2' : ''}" style="--h:${h}" title="${F.esc(name)}" aria-hidden="true">${F.esc(letters)}</span>`;
}

/* ---------- Horizon icon: a ring filled by holding length ---------- */
const HZ_FRAC = { DEN: 0.25, DNY: 0.5, TYDEN: 0.75, MESIC: 1 };
export function hzIcon(h) {
  const f = HZ_FRAC[h] ?? 1;
  const r = 5.5, c = 7, a = f * 2 * Math.PI - Math.PI / 2;
  const x = c + r * Math.cos(a), y = c + r * Math.sin(a);
  const path = f >= 1 ? `<circle cx="7" cy="7" r="${r}" fill="currentColor"/>`
    : `<path d="M7 7 L7 ${c - r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z" fill="currentColor"/>`;
  return `<svg class="hz-ic" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.2"/>${path}</svg>`;
}

/* ---------- Progress ring ---------- */
export function ring(frac, center, { size = 64, stroke = 5, cls = '' } = {}) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, frac));
  return `<span class="ring ${cls}" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="${stroke}"/>
      <circle class="ring-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${(C * f).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg><span class="ring-c">${center}</span></span>`;
}

/* ---------- Sparkline ---------- */
export function sparkline(values, { w = 120, h = 36, cls = '' } = {}) {
  if (!values || values.length < 2) return '';
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v - lo) / span) * (h - 6)).toFixed(1)}`);
  const last = pts[pts.length - 1].split(',');
  return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="currentColor"/></svg>`;
}

/* ---------- Empty-state illustration (original line art) ---------- */
export function calmArt() {
  return `<svg class="calm-art" viewBox="0 0 120 84" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 62h104" stroke="var(--line-3)" stroke-width="1.5"/>
    <path d="M14 70h92M26 77h68" stroke="var(--line-2)" stroke-width="1.5"/>
    <path d="M40 62a20 20 0 0 1 40 0" stroke="var(--gold)" stroke-width="1.8"/>
    <path d="M60 30v-8M37 39l-5-5M83 39l5-5M28 54h-7M92 54h7" stroke="var(--gold)" stroke-width="1.5" opacity=".7"/>
    <path d="M18 50l9-6 8 4 9-9" stroke="var(--ink-3)" stroke-width="1.4" stroke-dasharray="2 3"/>
    <path d="M78 41l9 5 8-6 9 3" stroke="var(--ink-3)" stroke-width="1.4" stroke-dasharray="2 3"/>
  </svg>`;
}

/* ---------- Live status (1.6.0): one sentence + one bar, same everywhere ----------
 * statusLine: "Vydělává +0,8 %" + "+80 Kč na 10 000 Kč v obchodu · do cíle zbývá 3,1 %"
 * track: stop <- entry -> target bar with the price dot (closed: the exit point), labels under it. */
export function statusLine(s, { now, big = false, money = true } = {}) {
  const st = D.liveStatus(s, now);
  if (!big) return `<p class="st-line tone-${st.tone} is-${st.code}"><i aria-hidden="true"></i><b>${F.esc(st.text)}</b>${st.sub ? `<span>${F.esc(st.sub)}</span>` : ''}</p>`;
  /* big (cards + detail): 1) price move in plain words, 2) the money result for THIS user, 3) money at target / stop */
  const um = st.um;
  const sm = (v) => (v > 0.5 ? '+' : '') + F.money(v, um.ccy, 0);
  /* 1.9.1: colour only when it is the user's own trade; otherwise a quiet fact about the signal's price */
  const own = !!D.cardState(s, null, now).my;
  const tn = own || st.done ? st.tone : 'flat';
  const txt = own || st.done || st.move == null ? st.text : Math.abs(st.move) < D.FLAT_PCT ? t('st.sigZero') : t('st.sig', { v: F.spct(st.move, 1) });
  return `<div class="st-big tone-${tn} is-${st.code} ${own ? '' : 'is-quiet'}">
    <p class="st-line is-big tone-${tn} is-${st.code}"><i aria-hidden="true"></i><b>${F.esc(txt)}</b>${st.hint ? `<span>${F.esc(st.hint)}</span>` : ''}</p>
    ${(() => {
      /* 1.9.1: real money only on the user's own trade; otherwise grey "Kdybyste koupili" */
      const cs = D.cardState(s, null, now);
      if (cs.my) { const mt = D.moneyTone(cs.my.money, cs.my.ccy, cs.my.pct); return `<p class="st-you"><span>${F.esc(t('st.youReal'))}</span><b class="num ${mt.tone}">${F.esc(mt.text)}</b></p>`; }
      if (um.now == null || st.done || !money) return ''; // 1.10.0: the detail shows the card's own money lines (D.offerNums)
      const mt = D.moneyTone(um.now, um.ccy, st.move);
      return `<p class="st-you is-if"><span>${F.esc(t('st.ifBoughtBig', { a: F.money(um.account, um.ccy, 0), r: F.num(um.risk, 0) }))}</span><b class="num">${F.esc(mt.text)}</b></p>`;
    })()}
    ${money ? `<p class="st-lv num">${t('st.levels', { t: `<b class="up">${um.atTarget != null ? sm(um.atTarget) : '–'}</b>`, s: `<b class="down">${sm(um.atStop)}</b>` })}<span class="st-chg" role="link" tabindex="0" data-action="go-calc">${t('st.change')}</span></p>` : ''}
  </div>`;
}

export function track(s, { now, prices = false, status = true } = {}) {
  if (s.stop == null || s.target == null || !(s.entry > 0)) return status ? statusLine(s, { now }) : '';
  const st = D.liveStatus(s, now);
  const g = ladderGeometry(s);
  const px = st.done ? D.exitPrice(s) : s.last_price;
  const cur = px != null ? g.pos(px) : null;
  const a = cur == null ? g.e : Math.min(g.e, cur), w = cur == null ? 0 : Math.abs(cur - g.e);
  const tone = st.tone === 'flat' ? 'flat' : st.tone;
  const lab = (k, p) => `<span>${t(k)}${prices ? ` <b class="num">${F.price(p)}</b>` : ''}</span>`;
  const leftL = g.buy ? lab('trk.stop', s.stop) : lab('trk.target', s.target);
  const rightL = g.buy ? lab('trk.target', s.target) : lab('trk.stop', s.stop);
  const eL = Math.max(18, Math.min(82, g.e));
  return `<div class="trk tone-${tone} ${g.buy ? '' : 'is-sell'}">
    ${status ? statusLine(s, { now }) : ''}
    <div class="trk-bar" aria-hidden="true">
      <span class="trk-z risk" style="${g.buy ? `left:0;width:${g.e}%` : `left:${g.e}%;right:0`}"></span>
      <span class="trk-z reward" style="${g.buy ? `left:${g.e}%;right:0` : `left:0;width:${g.e}%`}"></span>
      <span class="trk-fill ${cur != null && cur < g.e ? 'from-r' : ''}" style="left:${a}%;width:${w}%"></span>
      <span class="trk-e" style="left:${g.e}%"></span>
      ${cur != null ? `<span class="trk-dot ${st.done ? 'is-done' : ''}" style="left:${cur}%"></span>` : ''}
    </div>
    <div class="trk-lab">${leftL}<span class="trk-le" style="left:${eL}%">${t('trk.entry')}${prices ? ` <b class="num">${F.price(s.entry)}</b>` : ''}</span>${rightL}</div>
  </div>`;
}
