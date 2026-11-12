import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import { icon, seg, segMove, pill, openSheet, closeTopSheet, skBlock, haptic } from '../ui.js';
import { disclaimer } from './signals.js';
import { t } from '../i18n/index.js';
import { lossView, allTxt } from '../brief.js';
const CALC_LEV_MAX = 20; // 1.13.9: slider range = the demo cap (M.DEMO_LEV)

/* 1.13.9: only signals that can still be bought (D.entryOpen) – the first one is the default */
function signals(ctx) {
  return D.allOpen(ctx.data).filter((s) => D.entryOpen(s) && D.horizonAllowed(ctx.data, s.horizon) && !(CONFIG.HIDDEN_HORIZONS || []).includes(s.horizon));
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
  const cap = D.calcLevCap(s);
  /* 1.13.5: the page opens on the leverage of MY profile for this market (the slider can still try another one) */
  const lev = Math.min(D.profLevFor(D.prof(), s.symbol), cap);
  if (cs.leverage !== lev) D.saveCalc({ leverage: lev });
  /* 1.13.9: the slider goes to 1:20 (Agresivněji = 1:20 on every market in this demo) */
  const C = { ...CONFIG.CALC, LEVERAGE_MAX: CALC_LEV_MAX };
  const ticks = [1, 5, 10, 15, 20];
  const lockPct = ((C.LEVERAGE_MAX - cap) / (C.LEVERAGE_MAX - C.LEVERAGE_MIN)) * 100;
  const fillPct = ((lev - C.LEVERAGE_MIN) / (C.LEVERAGE_MAX - C.LEVERAGE_MIN)) * 100;
  const capReason = t('calc.capMkt', { v: cap });

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
        <div class="money-input"><input id="acc" class="num" readonly aria-readonly="true" value="${F.num(cs.account, 0)} ${F.esc({ CZK: 'Kč', EUR: '€', USD: '$' }[cs.ccy] || cs.ccy)}" aria-describedby="acc-ccy"></div>
        <p class="field-s" id="acc-ccy">${t('calc.accWallet')} <a class="link" href="#/nastaveni">${t('calc.accChange')}</a></p>
      </section>

      <section class="field">
        <p class="field-l">${t('calc.profile')}</p>
        <div class="profiles" role="radiogroup" aria-label="${t('calc.profile')}">
          ${C.RISK_PROFILES.map((p) => { const pl = Math.min(D.profLevFor(p, s.symbol), cap); const wv = worstView(ctx, s, pl); return `<button type="button" class="profile" role="radio" aria-checked="${p.id === cs.profile}" data-action="profile" data-id="${p.id}">
            <span class="profile-t">${t(`mb.p.${p.id}`)}<span class="radio-dot"></span></span>
            <span class="profile-v num" style="display:block">1:${pl}</span>
            <span class="profile-s num">${F.esc(wv)}</span>
          </button>`; }).join('')}
        </div>
        <p class="field-s">${t('calc.sameDep')}</p>
      </section>

      <section class="field">
        <div class="field-l"><label for="lev">${t('calc.lev')}</label><b class="lev-val num" id="lev-val">1:${lev}</b></div>
        <div class="range-wrap">
          <div class="range-track" aria-hidden="true"><span class="range-fill" id="lev-fill" style="width:${fillPct}%"></span>${lockPct > 0 ? `<span class="range-lock" style="width:${lockPct}%"></span>` : ''}</div>
          <input id="lev" class="range" type="range" min="${C.LEVERAGE_MIN}" max="${C.LEVERAGE_MAX}" step="1" value="${lev}" aria-valuetext="1:${lev}">
        </div>
        <div class="range-ticks num" aria-hidden="true">${ticks.map((t) => `<span class="${t > cap ? 'is-locked' : ''}">1:${t}</span>`).join('')}</div>
        <p class="lev-note">${icon('lock', 'icon-xs')}${F.esc(capReason)}</p>
      </section>
    </div>
    <aside class="calc-out" id="calc-out" aria-live="polite">${output(ctx, s)}</aside>
  </div>${disclaimer()}`;
}

/* "nejhůř 1 % peněženky" / "nejhůř celý vklad ≈ 5 % peněženky" – the card's worst case for this leverage */
function worstView(ctx, s, lev) {
  const n = D.offerNums(s, ctx.data, { lev });
  const lv = lossView(n.maxLoss, n.amount, lev, D.walletCcy(), { capped: n.maxLoss != null && n.maxLoss <= -n.amount + 0.5 });
  if (!lv) return '–';
  if (lv.capped) return t('calc.worstAll', { v: allTxt(lv) });
  return t('calc.worstAcc', { v: `${lv.wTxt ?? lv.pTxt} %` });
}

function output(ctx, s) {
  const cs = D.calcState();
  const lev = Math.min(cs.leverage, D.calcLevCap(s));
  const fx = D.fxRates(ctx.data);
  /* 1.13.5: one deposit for every profile (D.stakeFor) – the leverage only makes the trade bigger */
  const r = D.positionAt(s, { account: cs.account, ccy: cs.ccy, leverage: lev, fx });
  /* 1.13.9: deposit, loss at the stop and the target from D.offerNums – the SAME numbers as Dnes, Signály, the detail
     and the invest sheet (live / limit start price, spread); the size and units follow that deposit */
  const n = D.offerNums(s, ctx.data, { lev });
  const eq = D.sizingBase(null) || cs.account;
  const k = r.notional > 0 ? (n.amount * lev) / r.notional : 1;
  r.units *= k; r.deposit = r.margin = n.amount; r.notional = n.amount * lev; r.marginPct = n.amount / eq * 100;
  r.loss = Math.abs(n.maxLoss ?? 0); r.lossPct = r.loss / eq * 100; r.gain = n.potential ?? 0; r.gainPct = r.gain / eq * 100;
  const lv = lossView(n.maxLoss, n.amount, lev, cs.ccy, { capped: n.maxLoss != null && n.maxLoss <= -n.amount + 0.5 });
  const rate = r.quote === cs.ccy ? '' : t('calc.rate', { q: r.quote, v: F.num((fx[cs.ccy] || 1) / (fx[r.quote] || 1), 2), c: cs.ccy }) + (fx.as_of ? t('calc.rateFrom', { date: F.dm(fx.as_of) }) : t('calc.rateApprox'));
  return `<div class="result-card">
    <p class="result-hero-l">${t('calc.size')}</p>
    <p class="result-hero num">${F.money(r.notional, cs.ccy)}</p>
    <p class="result-units num">${t('calc.units', { n: F.num(r.units, r.units < 10 ? 2 : 1), sym: F.esc(s.symbol) })}</p>
    <div class="result-grid">
      <div><p class="rg-l">${t('calc.margin')}</p><p class="rg-v num">${F.money(r.margin, cs.ccy)}</p><p class="rg-s num">${t('calc.ofAcc', { v: F.pct(r.marginPct) })}</p></div>
      <div><p class="rg-l">${t('calc.rr')}</p><p class="rg-v num">${F.rr(s.rr)}</p><p class="rg-s num">${t('calc.stopDist', { v: F.pct(r.stopDist, 1) })}</p></div>
      <div><p class="rg-l">${t('calc.loss')}</p><p class="rg-v num down">${lv ? lv.txt : F.money(-r.loss, cs.ccy)}</p><p class="rg-s num">${lv && lv.capped ? F.esc(allTxt(lv)) : t('calc.ofAcc', { v: F.spct(-r.lossPct, 2) })}</p></div>
      <div><p class="rg-l">${t('calc.gain')}</p><p class="rg-v num up">+${F.money(r.gain, cs.ccy)}</p><p class="rg-s num">${t('calc.ofAcc', { v: F.spct(r.gainPct, 2) })}</p></div>
    </div>
    <div class="callout">${icon('info')}<div>${t('calc.levNote5', { a: F.money(r.deposit, cs.ccy, 0), n: F.money(r.notional, cs.ccy, 0), lev: lev > 1 ? `1:${lev}` : t('mb.noLev') })}</div></div>
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
  /* 1.13.0: the capital is the wallet (read-only here; Dobít / Vybrat in Nastavení → Můj profil) */
  const lev = el.querySelector('#lev');
  const cap = D.calcLevCap(s);
  lev?.addEventListener('input', () => {
    let v = +lev.value;
    if (v > cap) { v = cap; lev.value = cap; haptic(20); }
    D.saveCalc({ leverage: v });
    el.querySelector('#lev-val').textContent = `1:${v}`;
    lev.setAttribute('aria-valuetext', `1:${v}`);
    const C = { ...CONFIG.CALC, LEVERAGE_MAX: CALC_LEV_MAX };
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
  /* 1.13.2: the same ONE profile as everywhere (risk + leverage); the leverage slider follows it */
  profile(el, ev, ctx) {
    D.setProf(el.dataset.id);
    const s = current(ctx);
    if (s) {
      const v = Math.min(D.profLevFor(D.prof(), s.symbol), D.calcLevCap(s));
      D.saveCalc({ leverage: v });
      const lv = document.getElementById('lev'); if (lv) { lv.value = v; lv.setAttribute('aria-valuetext', `1:${v}`); }
      const lt = document.getElementById('lev-val'); if (lt) lt.textContent = `1:${v}`;
      const C = { ...CONFIG.CALC, LEVERAGE_MAX: CALC_LEV_MAX }; const fl = document.getElementById('lev-fill'); if (fl) fl.style.width = `${((v - C.LEVERAGE_MIN) / (C.LEVERAGE_MAX - C.LEVERAGE_MIN)) * 100}%`;
    }
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
          <span><span class="sig-tl"><span class="hist-sym">${F.esc(s.symbol)}</span>${pill(s.action)}</span><small>${F.esc(`${F.HZ_LABEL[s.horizon]} · ${D.entryUntilText(s)}`)}</small></span>
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
