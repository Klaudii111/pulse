import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import { icon, seg, segMove, pill, openSheet, closeTopSheet, skBlock, haptic } from '../ui.js';
import { disclaimer } from './signals.js';
import { t } from '../i18n/index.js';

function signals(ctx) {
  return D.allOpen(ctx.data).filter((s) => !s.intraday_hit && D.horizonAllowed(ctx.data, s.horizon));
}

function current(ctx) {
  const list = signals(ctx);
  const cs = D.calcState();
  const want = ctx.params.get('s') || cs.signalId;
  return list.find((s) => s.id === want) || list[0] || null;
}

export function render(ctx) {
  const head = `<header class="page-head"><div><h1 class="page-title">${t('calc.title')}</h1><p class="page-sub">${t('calc.sub')}</p></div></header>`;
  if (!ctx.data?.signals) return head + `<div class="calc-layout"><div class="calc-inputs">${skBlock(86)}${skBlock(150)}${skBlock(120)}</div>${skBlock(300)}</div>`;
  const s = current(ctx);
  if (!s) return head + `<div class="empty"><h3>${t('calc.none.t')}</h3><p>${t('calc.none.s')}</p></div>`;
  const cs = D.calcState();
  const cap = D.leverageCap(ctx.data, s);
  const lev = Math.min(cs.leverage, cap);
  const C = CONFIG.CALC;
  const ticks = [];
  for (let i = C.LEVERAGE_MIN; i <= C.LEVERAGE_MAX; i++) ticks.push(i);
  const lockPct = ((C.LEVERAGE_MAX - cap) / (C.LEVERAGE_MAX - C.LEVERAGE_MIN)) * 100;
  const fillPct = ((lev - C.LEVERAGE_MIN) / (C.LEVERAGE_MAX - C.LEVERAGE_MIN)) * 100;
  const capReason = D.leverageText(ctx.data, s);

  return head + `<div class="calc-layout">
    <div class="calc-inputs">
      <section class="field">
        <p class="field-l">${t('calc.signal')}</p>
        <button class="picker" type="button" data-action="pick-signal" aria-haspopup="dialog">
          <span><span class="sig-tl"><span class="ticker">${F.esc(s.symbol)}</span>${pill(s.action)}</span>
            <span class="picker-meta">${F.HZ_LABEL[s.horizon]}<span class="num">${t('calc.entryStop', { e: F.price(s.entry), s: F.price(s.stop) })}</span></span></span>
          <span class="picker-chev">${icon('chev-down', 'icon-sm')}</span>
        </button>
      </section>

      <section class="field">
        <label class="field-l" for="acc">${t('calc.account')}</label>
        <div class="money-input"><input id="acc" class="num" inputmode="decimal" autocomplete="off" value="${F.num(cs.account, 0)}" aria-describedby="acc-ccy"></div>
        <div class="ccy" id="acc-ccy">${seg({ name: 'ccy', small: true, label: t('calc.ccy'), items: ['CZK', 'EUR', 'USD'].map((c) => ({ id: c, label: c })), active: cs.ccy })}</div>
      </section>

      <section class="field">
        <p class="field-l">${t('calc.profile')}</p>
        <div class="profiles" role="radiogroup" aria-label="${t('calc.profile')}">
          ${C.RISK_PROFILES.map((p) => `<button type="button" class="profile" role="radio" aria-checked="${p.id === cs.profile}" data-action="profile" data-id="${p.id}">
            <span class="profile-t">${t(`profile.${p.id}`)}<span class="radio-dot"></span></span>
            <span class="profile-v num" style="display:block">${F.pct(p.pct, 0)}</span>
            <span class="profile-s">${t('calc.perTrade')}</span>
          </button>`).join('')}
        </div>
      </section>

      <section class="field">
        <div class="field-l"><label for="lev">${t('calc.lev')}</label><b class="lev-val num" id="lev-val">${lev}×</b></div>
        <div class="range-wrap">
          <div class="range-track" aria-hidden="true"><span class="range-fill" id="lev-fill" style="width:${fillPct}%"></span>${lockPct > 0 ? `<span class="range-lock" style="width:${lockPct}%"></span>` : ''}</div>
          <input id="lev" class="range" type="range" min="${C.LEVERAGE_MIN}" max="${C.LEVERAGE_MAX}" step="1" value="${lev}" aria-valuetext="${lev}×">
        </div>
        <div class="range-ticks num" aria-hidden="true">${ticks.map((t) => `<span class="${t > cap ? 'is-locked' : ''}">${t}×</span>`).join('')}</div>
        <p class="lev-note">${icon('lock', 'icon-xs')}${F.esc(capReason)}</p>
      </section>
    </div>
    <aside class="calc-out" id="calc-out" aria-live="polite">${output(ctx, s)}</aside>
  </div>${disclaimer()}`;
}

function output(ctx, s) {
  const cs = D.calcState();
  const prof = CONFIG.CALC.RISK_PROFILES.find((p) => p.id === cs.profile);
  const lev = Math.min(cs.leverage, D.leverageCap(ctx.data, s));
  const fx = D.fxRates(ctx.data);
  const r = D.computePosition(s, { account: cs.account, ccy: cs.ccy, leverage: lev, riskPct: prof.pct, fx });
  const rate = r.quote === cs.ccy ? '' : t('calc.rate', { q: r.quote, v: F.num((fx[cs.ccy] || 1) / (fx[r.quote] || 1), 2), c: cs.ccy }) + (fx.as_of ? t('calc.rateFrom', { date: F.dm(fx.as_of) }) : t('calc.rateApprox'));
  return `<div class="result-card">
    <p class="result-hero-l">${t('calc.size')}</p>
    <p class="result-hero num">${F.money(r.notional, cs.ccy)}</p>
    <p class="result-units num">${t('calc.units', { n: F.num(r.units, r.units < 10 ? 2 : 1), sym: F.esc(s.symbol) })}</p>
    <div class="result-grid">
      <div><p class="rg-l">${t('calc.margin')}</p><p class="rg-v num">${F.money(r.margin, cs.ccy)}</p><p class="rg-s num">${t('calc.ofAcc', { v: F.pct(r.marginPct) })}</p></div>
      <div><p class="rg-l">${t('calc.rr')}</p><p class="rg-v num">${F.rr(s.rr)}</p><p class="rg-s num">${t('calc.stopDist', { v: F.pct(r.stopDist, 1) })}</p></div>
      <div><p class="rg-l">${t('calc.loss')}</p><p class="rg-v num down">${F.money(-r.loss, cs.ccy)}</p><p class="rg-s num">${t('calc.ofAcc', { v: F.spct(-r.lossPct, 2) })}</p></div>
      <div><p class="rg-l">${t('calc.gain')}</p><p class="rg-v num up">+${F.money(r.gain, cs.ccy)}</p><p class="rg-s num">${t('calc.ofAcc', { v: F.spct(r.gainPct, 2) })}</p></div>
    </div>
    ${r.limited ? `<div class="callout warn">${icon('alert')}<div>${t('calc.limited', { lev, risk: F.pct(prof.pct, 0), need: F.num(r.needLev, 1), real: F.pct(r.lossPct, 2) })}</div></div>`
      : `<div class="callout">${icon('info')}<div>${t('calc.levNote')}</div></div>`}
    <p class="jnote" style="margin-top:12px">${F.esc(t('calc.foot', { rate }))}</p>
  </div>`;
}

function refresh(ctx) {
  const s = current(ctx);
  const out = document.getElementById('calc-out');
  if (s && out) out.innerHTML = output(ctx, s);
}

export function mount(el, ctx) {
  const s = current(ctx);
  if (!s) return;
  if (ctx.params.get('s')) D.saveCalc({ signalId: s.id });
  const acc = el.querySelector('#acc');
  acc?.addEventListener('input', () => {
    const v = F.parseNum(acc.value);
    if (v > 0) { D.saveCalc({ account: v }); refresh(ctx); }
  });
  acc?.addEventListener('blur', () => { acc.value = F.num(D.calcState().account, 0); });
  acc?.addEventListener('focus', () => { acc.value = String(D.calcState().account); acc.select(); });
  const lev = el.querySelector('#lev');
  const cap = D.leverageCap(ctx.data, s);
  lev?.addEventListener('input', () => {
    let v = +lev.value;
    if (v > cap) { v = cap; lev.value = cap; haptic(20); }
    D.saveCalc({ leverage: v });
    el.querySelector('#lev-val').textContent = `${v}×`;
    lev.setAttribute('aria-valuetext', `${v}×`);
    const C = CONFIG.CALC;
    el.querySelector('#lev-fill').style.width = `${((v - C.LEVERAGE_MIN) / (C.LEVERAGE_MAX - C.LEVERAGE_MIN)) * 100}%`;
    refresh(ctx);
  });
}

export const actions = {
  seg(el, ev, ctx) {
    if (el.dataset.segName !== 'ccy') return false;
    const ccy = el.dataset.id;
    const old = D.calcState();
    if (old.ccy === ccy) return true;
    // convert the account value so the size stays comparable
    const fx = D.fxRates(ctx.data);
    const account = Math.round((old.account / fx[old.ccy]) * fx[ccy]);
    D.saveCalc({ ccy, account });
    segMove(document.getElementById('view'), 'ccy', ccy);
    const acc = document.getElementById('acc');
    if (acc) acc.value = F.num(account, 0);
    refresh(ctx);
    return true;
  },
  profile(el, ev, ctx) {
    D.saveCalc({ profile: el.dataset.id });
    document.querySelectorAll('.profile').forEach((p) => p.setAttribute('aria-checked', String(p === el)));
    haptic();
    refresh(ctx);
  },
  'pick-signal'(el, ev, ctx) {
    const list = signals(ctx);
    const cur = current(ctx);
    openSheet({
      small: true, label: t('calc.pick'),
      html: `<div class="sheet-head"><p class="sheet-title">${t('calc.pick')}</p><button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
        <div class="sheet-body"><div class="broker-list">${list.map((s) => `<button type="button" class="broker" data-id="${F.esc(s.id)}" aria-pressed="${s.id === cur?.id}">
          <span><span class="sig-tl"><span class="hist-sym">${F.esc(s.symbol)}</span>${pill(s.action)}</span><small>${t('calc.pickMeta', { hz: F.HZ_LABEL[s.horizon], lev: s.max_leverage })}</small></span>
          <span class="num" style="font-weight:450;color:var(--ink-2)">${F.price(s.entry)}</span></button>`).join('')}</div></div>`,
      onMount(sh) {
        sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
        sh.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
          D.saveCalc({ signalId: b.dataset.id });
          closeTopSheet();
          setTimeout(() => { if (location.hash.includes('?')) (window.__pulseGo ? window.__pulseGo('#/kalkulacka') : (location.hash = '#/kalkulacka')); else ctx.rerender(); }, 360);
        }));
      },
    });
  },
};
