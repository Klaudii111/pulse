// First-run onboarding (1.7.0): 3 swipe screens, skippable, re-openable from Více.
// (a) what PULSE does, (b) capital + currency + risk -> the SAME calculator settings (domain.calcState / saveCalc)
// that drive "U vás (kapitál …, riziko …)" and the calculator, (c) notifications + install (pwa.js).
// Shown only after the access gate; never again once finished or skipped (store 'onb').
import { CONFIG } from '../config.js';
import * as F from './format.js';
import * as D from './domain.js';
import * as P from './pwa.js';
import * as W from './wallet.js';
import * as store from './store.js';
import { t, lang } from './i18n/index.js';
import { icon, ladder, toast } from './ui.js';
import { howStrip } from './views/help.js';

let root = null;

/* Boot: fresh users only. Someone who already set the calculator (older version) is not interrupted. */
export function maybeShow(onDone) {
  if (store.get('onb', null)) return;
  if (store.get('calc', null)) { store.set('onb', 'legacy'); return; }
  open(onDone);
}

const DEMO = { action: 'BUY', entry: 100, stop: 95, target: 110, last_price: 104.2, pnl_r: 0.84, status: 'open' };

function slideA() {
  return `<section class="onb-slide" aria-roledescription="slide" aria-label="1 / 3">
    <div class="onb-art" aria-hidden="true">
      <span class="onb-orb o1"></span><span class="onb-orb o2"></span>
      <div class="onb-card">
        <div class="onb-card-h"><span class="onb-tk">${t('onb.a.demoSym')}</span><span class="pill pill-buy">${icon('up')}${F.SIDE.BUY}</span><span class="onb-ex">${t('onb.a.example')}</span></div>
        <p class="st-line is-big tone-up"><i></i><b>${t('st.win', { v: F.spct(4.2, 1) })}</b><span>${t('st.toTarget', { v: F.pct(5.6, 1) })}</span></p>
        ${ladder(DEMO, { animate: true })}
      </div>
    </div>
    <p class="onb-k">${t('onb.step', { n: 1 })}</p>
    <h2 class="onb-t">${t('onb.a.t')}</h2>
    <p class="onb-s">${t('onb.a.s')}</p>
    <p class="onb-l onb-how">${t('onb.how')}</p>
    ${howStrip()}
    <ul class="onb-pts">
      <li>${icon('clock', 'icon-sm')}<span>${t('onb.a.p1')}</span></li>
      <li>${icon('shield', 'icon-sm')}<span>${t('onb.a.p2')}</span></li>
      <li>${icon('spark', 'icon-sm')}<span>${t('onb.a.p3')}</span></li>
    </ul>
  </section>`;
}

function riskLine(cs) {
  const p = CONFIG.CALC.RISK_PROFILES.find((x) => x.id === cs.profile) || CONFIG.CALC.RISK_PROFILES[0];
  const loss = cs.account * p.pct / 100;
  return t('onb.b.line', { m: F.money(loss, cs.ccy, 0), g: F.money(loss * 2, cs.ccy, 0) });
}

const ccyLabel = (c) => (c === 'CZK' && lang() === 'cs' ? 'Kč' : c);

function slideB() {
  const cs = D.calcState();
  return `<section class="onb-slide" aria-roledescription="slide" aria-label="2 / 3">
    <p class="onb-k">${t('onb.step', { n: 2 })}</p>
    <h2 class="onb-t">${t('onb.b.t')}</h2>
    <p class="onb-s">${t('onb.b.s')}</p>
    <label class="onb-l" for="onb-acc">${t('onb.b.cap')}</label>
    <div class="onb-money"><input id="onb-acc" class="num" inputmode="numeric" autocomplete="off" value="${F.num(cs.account, 0)}"><span class="onb-ccy-l" id="onb-ccy-l">${ccyLabel(cs.ccy)}</span></div>
    <div class="onb-ccy" role="radiogroup" aria-label="${t('calc.ccy')}">${['CZK', 'EUR', 'USD'].map((c) => `<button type="button" role="radio" class="chip" data-ccy="${c}" aria-checked="${c === cs.ccy}">${c}</button>`).join('')}</div>
    <p class="onb-l">${t('onb.b.risk')}</p>
    <div class="onb-risk" role="radiogroup" aria-label="${t('onb.b.risk')}">
      ${CONFIG.CALC.RISK_PROFILES.map((p) => `<button type="button" role="radio" class="onb-r" data-prof="${p.id}" aria-checked="${p.id === cs.profile}">
        <span class="onb-r-v num">${F.pct(p.pct, 0)}</span><span class="onb-r-t">${t(`onb.b.${p.id}`)}</span><span class="onb-r-s">${t(`onb.b.${p.id}.s`)}</span></button>`).join('')}
    </div>
    <p class="onb-line" id="onb-line">${riskLine(cs)}</p>
    <p class="onb-note onb-wal">${icon('wallet', 'icon-sm')}<span>${t('onb.b.wallet')}</span></p>
  </section>`;
}

const okLine = (k) => `<p class="onb-ok">${icon('check', 'icon-sm')}${t(k)}</p>`;
function pushBlock() {
  const st = P.pushSupport();
  if (store.get('pushOn', false) && 'Notification' in window && Notification.permission === 'granted') return okLine('onb.c.pushOn');
  if (st.ok) return `<button type="button" class="btn btn-primary btn-block" data-onb="push">${icon('bell', 'icon-sm')}${t('onb.c.push')}</button>`;
  if (st.reason === 'ios-install') return `<p class="onb-note">${t('pcta.s.ios')}</p>`;
  if (st.reason === 'denied') return `<p class="onb-note">${t('push.denied')}</p>`;
  if (st.reason === 'elsewhere') return `<p class="onb-note">${t('pcta.s.elsewhere')}</p>`;
  return `<p class="onb-note">${t('push.unsupported')}</p>`;
}
function installBlock() {
  const st = P.installState();
  if (st === 'installed') return okLine('onb.c.installed');
  if (st === 'prompt') return `<button type="button" class="btn btn-secondary btn-block" data-onb="install">${icon('plus-square', 'icon-sm')}${t('onb.c.install')}</button>`;
  if (st === 'ios') return `<p class="onb-note">${t('onb.c.ios')}</p>`;
  return `<p class="onb-note">${t('onb.c.other')}</p>`;
}

function slideC() {
  return `<section class="onb-slide" aria-roledescription="slide" aria-label="3 / 3">
    <p class="onb-k">${t('onb.step', { n: 3 })}</p>
    <h2 class="onb-t">${t('onb.c.t')}</h2>
    <p class="onb-s">${t('onb.c.s')}</p>
    <div class="onb-box"><div class="onb-box-h"><span class="onb-ic">${icon('bell')}</span><div><p class="onb-bt">${t('onb.c.pushT')}</p><p class="onb-bs">${t('onb.c.pushS')}</p></div></div><div id="onb-push">${pushBlock()}</div></div>
    <div class="onb-box"><div class="onb-box-h"><span class="onb-ic">${icon('plus-square')}</span><div><p class="onb-bt">${t('onb.c.installT')}</p><p class="onb-bs">${t('onb.c.installS')}</p></div></div><div id="onb-inst">${installBlock()}</div></div>
    <div class="onb-box onb-auto"><div class="onb-box-h"><span class="onb-ic">${icon('spark')}</span><div><p class="onb-bt">${t('onb.c.autoT')}</p><p class="onb-bs">${t('onb.c.autoS')}</p></div></div>
      <div class="onb-yn" role="radiogroup" aria-label="${t('onb.c.autoT')}"><button type="button" class="chip" role="radio" data-onb="auto-yes" aria-checked="${!!store.get('autoCopy', null)?.on}">${t('onb.c.autoYes')}</button><button type="button" class="chip" role="radio" data-onb="auto-no" aria-checked="${store.get('autoCopy', null)?.on === false}">${t('onb.c.autoNo')}</button></div></div>
    <button type="button" class="btn btn-ghost btn-block onb-how" data-onb="how">${icon('help', 'icon-sm')}${t('onb.c.how')}</button>
    <p class="onb-fine">${F.esc(t('disclaimer'))}</p>
  </section>`;
}

export const isOpen = () => !!root;

export function open(onDone) {
  if (root) return;
  root = document.createElement('div');
  root.className = 'onb';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t('onb.aria'));
  root.innerHTML = `<div class="onb-in">
    <div class="onb-top"><img src="./icons/icon-192.png" alt="" width="30" height="30"><span class="onb-brand">${F.esc(CONFIG.APP_NAME)}</span><button type="button" class="onb-skip" data-onb="skip">${t('onb.skip')}</button></div>
    <div class="onb-track" id="onb-track">${slideA()}${slideB()}${slideC()}</div>
    <div class="onb-foot"><div class="onb-dots" aria-hidden="true"><i class="on"></i><i></i><i></i></div>
      <button type="button" class="btn btn-primary onb-next" data-onb="next">${t('onb.next')}</button></div>
  </div>`;
  document.body.append(root);
  document.getElementById('app').setAttribute('aria-hidden', 'true');
  document.documentElement.classList.add('has-onb');
  requestAnimationFrame(() => requestAnimationFrame(() => root && root.classList.add('is-in')));
  const el = root;
  const track = el.querySelector('#onb-track');
  const next = el.querySelector('[data-onb="next"]');
  const dots = [...el.querySelectorAll('.onb-dots i')];
  const idx = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = (i) => track.scrollTo({ left: i * track.clientWidth, behavior: reduce() ? 'auto' : 'smooth' });
  const sync = () => {
    const i = idx();
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    next.textContent = t(i >= 2 ? 'onb.done' : 'onb.next');
  };
  track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });

  /* step (b): every change goes straight into the calculator settings */
  const acc = el.querySelector('#onb-acc');
  let typed = false;
  const save = (patch) => {
    D.saveCalc(patch);
    const cs = D.calcState();
    el.querySelector('#onb-line').textContent = riskLine(cs);
    /* the play-money platform account follows the currency while it is still unused */
    /* 1.9.0: the same amount is loaded as fictional money on the platform (while the account is still unused) */
    if (W.untouched()) W.resetWith(cs.ccy, cs.account);
  };
  acc.addEventListener('input', () => {
    typed = true;
    const v = F.parseNum(acc.value);
    if (v > 0) save({ account: Math.round(v) });
  });
  acc.addEventListener('blur', () => { acc.value = F.num(D.calcState().account, 0); });
  acc.addEventListener('focus', () => acc.select());
  acc.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); acc.blur(); } });

  const finish = (how) => {
    if (root !== el) return;
    store.set('onb', how);
    /* the calculator settings exist from now on (also after "Přeskočit"), so they are not re-asked */
    if (!store.get('calc', null)) D.saveCalc({});
    el.classList.remove('is-in');
    el.classList.add('is-out');
    document.getElementById('app').removeAttribute('aria-hidden');
    document.documentElement.classList.remove('has-onb');
    root = null;
    setTimeout(() => el.remove(), 320);
    onDone && onDone(how);
  };

  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-onb], [data-ccy], [data-prof]');
    if (!b) return;
    if (b.dataset.ccy) {
      const c = b.dataset.ccy;
      el.querySelectorAll('[data-ccy]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      const patch = { ccy: c };
      if (!typed) patch.account = CONFIG.CALC.DEFAULT_ACCOUNT[c];
      save(patch);
      acc.value = F.num(D.calcState().account, 0);
      el.querySelector('#onb-ccy-l').textContent = ccyLabel(c);
      return;
    }
    if (b.dataset.prof) {
      el.querySelectorAll('[data-prof]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      save({ profile: b.dataset.prof });
      return;
    }
    const a = b.dataset.onb;
    if (a === 'skip') finish('skipped');
    else if (a === 'next') { const i = idx(); if (i >= 2) finish('done'); else go(i + 1); }
    else if (a === 'auto-yes' || a === 'auto-no') {
      store.set('autoCopy', { on: a === 'auto-yes', at: Date.now() });
      el.querySelectorAll('[data-onb^="auto-"]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    }
    else if (a === 'how') { finish('how'); setTimeout(() => window.__pulseGo && window.__pulseGo('#/jak'), 350); }
    else if (a === 'push') {
      b.disabled = true;
      const r = await P.subscribePush().catch(() => ({ ok: false }));
      toast(t(r.ok ? 'push.on' : r.reason === 'server' ? 'push.server' : r.reason === 'denied' ? 'push.denied' : 'push.fail'));
      el.querySelector('#onb-push').innerHTML = r.ok ? okLine('onb.c.pushOn') : pushBlock();
    } else if (a === 'install') {
      await P.promptInstall();
      el.querySelector('#onb-inst').innerHTML = installBlock();
    }
  });
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') finish('skipped');
    if (ev.target === acc) return;
    if (ev.key === 'ArrowRight') go(Math.min(2, idx() + 1));
    if (ev.key === 'ArrowLeft') go(Math.max(0, idx() - 1));
  });
  setTimeout(() => next.focus({ preventScroll: true, focusVisible: false }), 120);
}
