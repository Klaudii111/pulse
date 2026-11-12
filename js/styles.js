/* 1.15.0 STYLES ("Styl: Odvážně ▾"): the ONE style control of the app and its sheet "Vyber styl".
   Five money styles ordered by risk (CONFIG.CALC.RISK_PROFILES): Konzervativně · Vyváženě · Odvážně · Naplno · Agresivněji.
   - styleRow(): the compact row used everywhere the three-segment profile switch was (Dnes, Signály, new-signal sheet,
     Zainvestovat / Obchodovat ticket, Kalkulačka, Nastavení → Můj profil, onboarding)
   - openPicker({ sigId }): five cards; with a signal its own numbers (D.styleNums = the card / detail / sheet numbers),
     without one the typical figures of the test (styles_data.js) for this wallet
   - choose(id): the first switch to Odvážně / Naplno / Agresivněji asks once (warning from the test); the choice is
     stored as 'levProfile' (synced), the confirmations as 'styleOk' (synced)
   - robotGate(): Robot za mě with a leveraged style warns before it is switched on (and when the style changes while on).
   All money is fictional. */
import { CONFIG } from '../config.js';
import * as F from './format.js';
import * as D from './domain.js';
import * as store from './store.js';
import * as B from './brief.js';
import { t } from './i18n/index.js';
import { icon, openSheet, closeTopSheet, haptic } from './ui.js';
import { styleTest } from './styles_data.js';

let getData = () => null;
/* a style sheet opened over another sheet (detail, Zainvestovat) closes ONLY itself: app.js skips its route handling for
   the Back step of a style sheet (otherwise every popstate closes all sheets) */
let lastClose = 0;
const markClose = () => { lastClose = Date.now(); };
export const justClosed = () => Date.now() - lastClose < 700;
export const init = ({ data }) => { if (data) getData = data; };

const nm = (id) => t(`mb.p.${id}`);
const sp = (v) => `<span class="nw">${v}</span>`;
const pctS = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${F.num(Math.abs(v) * 100, 0)} %`;

/* the 1–5 risk meter */
export const meter = (risk) => `<span class="sty-meter" role="img" aria-label="${F.esc(t('sty.riskAria', { n: risk }))}" data-r="${risk}">${[1, 2, 3, 4, 5].map((i) => `<i${i <= risk ? ' class="on"' : ''}></i>`).join('')}</span>`;

/* "páka 1:5 · vklad 10 % peněženky (10 000 Kč)" – the fixed meaning of a style with this wallet's money */
export function defLine(p, amount, ccy, lev = p.lev, max = false) {
  const lv = lev > 1 ? t('mb.lev', { v: lev }) : t('mb.noLev');
  const a = sp(F.money(amount, ccy, 0));
  return p.dep > 0 ? t('sty.defDep', { l: lv, p: F.num(p.dep * 100, 0), a }) : t(max ? 'sty.defRiskMax' : 'sty.defRisk', { l: lv, r: F.num(p.pct, 0), a });
}

/* ONE honest line from the test (styles_data.js), money per the default wallet of the currency (100 000 Kč / 4 000 €) */
export function honest(id, ccy = D.walletCcy()) {
  const x = styleTest(id);
  const ref = CONFIG.CALC.DEFAULT_ACCOUNT[ccy] || 100000;
  const st = ref >= 50000 ? 100 : 10;
  return t(`sty.h.${id}`, { m: `+${F.money(Math.round(x.month * ref / st) * st, ccy, 0)}`, w: F.money(ref, ccy, 0), dd: pctS(x.dd), p: F.num(x.wipe * 100, 0), y: pctS(x.y2022) });
}

/* the row: "Styl: Odvážně ●●●○○ ▾" (data-styrow -> brief.syncLev refreshes it in place) */
export function rowInner(id = D.profId()) {
  const p = D.prof(id);
  return `<span class="sty-row-l">${t('sty.row')}</span><b class="sty-row-n">${nm(p.id)}</b>${meter(p.risk || 1)}${icon('chev-down', 'icon-xs sty-row-i')}`;
}
export function styleRow({ sigId = null, rec = false, cls = '' } = {}) {
  const p = D.prof();
  return `<div class="sty-wrap${cls ? ` ${cls}` : ''}"><button type="button" class="sty-row" data-styrow data-action="style-open"${sigId ? ` data-id="${F.esc(sigId)}"` : ''} aria-haspopup="dialog">${rowInner()}</button>${rec ? `<span class="sty-rec" data-styrec${p.id === 'cons' ? '' : ' hidden'}>${t('sty.rec')}</span>` : ''}</div>`;
}
/* refresh every row on screen (a choice made elsewhere, another device) */
export function syncRows() {
  const id = D.profId();
  document.querySelectorAll('[data-styrow]').forEach((b) => { b.innerHTML = rowInner(id); });
  document.querySelectorAll('[data-styrec]').forEach((x) => { x.hidden = id !== 'cons'; });
  document.querySelectorAll('[data-stydef]').forEach((x) => { x.innerHTML = defText(id); });
}
/* "páka 1:5 · vklad 10 % peněženky (10 000 Kč). V testu 2023–26 …" – the chosen style in two short lines */
export function defText(id = D.profId(), ccy = D.walletCcy()) {
  const p = D.prof(id);
  return `<span class="sty-d1">${defLine(p, D.stakeFor(null, { prof: p.id }), ccy, p.lev, true)}</span><span class="sty-d2">${honest(p.id, ccy)}</span>`;
}

/* the numbers of one card: this signal (D.styleNums) or the typical trade of the test scaled to my wallet */
function cardNums(p, s, data) {
  const ccy = D.walletCcy();
  if (s) {
    const n = D.styleNums(s, data, { prof: p.id });
    const x = B.styleTxt(n, ccy);
    return { amount: n.amount, lev: n.lev, capped: n.capped, win: x.win, loss: x.loss, note: x.note, est: n.est, n };
  }
  const eq = D.sizingBase(null) || D.calcState().account;
  const k = eq / 100000;
  const x = styleTest(p.id).typ;
  const amount = D.stakeFor(null, { prof: p.id });
  const sm = (v) => `${v > 0 ? '+' : '−'}${F.money(Math.abs(B.roundLoss(v * k)), ccy, 0)}`;
  return { amount, lev: p.lev, capped: false, win: `≈ ${sm(x.win)}`, loss: `≈ ${sm(x.loss)}`, note: '', typ: true };
}

export function openPicker({ sigId = null } = {}) {
  const data = getData();
  const s = sigId && data ? D.findSignal(data, sigId) : null;
  const ccy = D.walletCcy();
  const cur = D.profId();
  const card = (p) => {
    const c = cardNums(p, s, data);
    const on = p.id === cur;
    return `<button type="button" class="sty-card is-${p.id}${on ? ' is-on' : ''}" data-sty="${p.id}" role="radio" aria-checked="${on}">
      <span class="sty-c1"><b class="sty-cn">${nm(p.id)}</b>${meter(p.risk || 1)}${on ? `<span class="sty-on">${icon('check', 'icon-xs')}${t('sty.on')}</span>` : ''}</span>
      <span class="sty-c2">${defLine(p, c.amount, ccy, c.lev, !!c.typ)}</span>
      ${c.capped ? `<span class="sty-c2 sty-cap">${t('sty.cap', { v: c.lev, s: p.lev })}</span>` : ''}
      <span class="sty-c3 num"><span class="up">${t('sty.cWin', { v: sp(c.win) })}</span><span class="down">${t('sty.cLoss', { v: sp(c.loss) })}${c.note ? ` <small>(${c.note})</small>` : ''}</span></span>
      <span class="sty-c4${p.risk >= 3 ? ' is-warn' : ''}">${honest(p.id, ccy)}</span>
    </button>`;
  };
  const sub = s ? t('sty.subSig', { n: F.esc(B.whatIs(s.symbol, s.name).name) }) : t('sty.subTyp');
  openSheet({
    small: true, label: t('sty.title'), className: 'sty-sheet', onClose: markClose,
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('sty.title')}</p><p class="sheet-sub">${sub}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><div class="sty-list" role="radiogroup" aria-label="${F.esc(t('sty.title'))}">${D.PROFILES.map(card).join('')}</div>
      <p class="sty-foot">${t('sty.foot', { a: STYLE_Y0, b: STYLE_Y1 })}</p></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelectorAll('[data-sty]').forEach((b) => b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = b.dataset.sty;
        haptic();
        closeTopSheet();
        if (id === D.profId()) return;
        setTimeout(() => choose(id), 360);
      }));
    },
  });
}
const STYLE_Y0 = '2023', STYLE_Y1 = '26';

const okList = () => { const v = store.get('styleOk', null); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; };
const autoOn = () => !!store.get('autoCopy', null)?.on;

/* the one place a style is chosen (row sheet, Kalkulačka, Nastavení, onboarding, older chips with data-action="lev-prof") */
export function choose(id, after = null) {
  const p = D.PROFILES.find((x) => x.id === id);
  if (!p) return;
  const go = () => {
    B.setLevProfile(id);
    syncRows();
    after && after(id);
    /* Robot za mě is on and the new style has leverage: the warning that losses add up */
    if (autoOn() && p.lev > 1 && !p.confirm) setTimeout(() => robotSheet({ info: true }), 380);
  };
  if (p.confirm && !okList().includes(id)) { confirmSheet(p, () => { store.set('styleOk', [...new Set([...okList(), id])]); go(); }); return; }
  go();
  if (p.confirm && autoOn()) setTimeout(() => robotSheet({ info: true }), 380);
}

function confirmSheet(p, onOk) {
  openSheet({
    small: true, label: t('sty.cfT', { n: nm(p.id) }), className: 'sty-sheet', onClose: markClose,
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('sty.cfT', { n: nm(p.id) })}</p><p class="sheet-sub">${meter(p.risk || 1)}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><p class="sty-warn">${icon('alert', 'icon-sm')}<span>${t(`sty.w.${p.id}`)}</span></p>
      ${autoOn() ? `<p class="sty-warn is-robot">${icon('alert', 'icon-sm')}<span>${robotText(p)}</span></p>` : ''}
      <p class="sty-foot">${t('sty.upper')}</p>
      <div class="btn-stack"><button type="button" class="btn btn-primary btn-block" data-ok>${t('sty.cfOk', { n: nm(p.id) })}</button>
      <button type="button" class="btn btn-ghost btn-block" data-no>${t('sty.cfNo')}</button></div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-no]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-ok]').addEventListener('click', () => { closeTopSheet(); haptic(20); onOk(); });
    },
  });
}

/* "Robot může otevřít víc obchodů naráz …" with the style's own deposit, leverage and typical loss */
function robotText(p = D.prof()) {
  const ccy = D.walletCcy();
  const a = D.stakeFor(null, { prof: p.id });
  const eq = D.sizingBase(null) || D.calcState().account;
  const loss = B.roundLoss(styleTest(p.id).typ.loss * eq / 100000);
  return t(p.dep > 0 ? 'sty.robot' : 'sty.robotRisk', { n: nm(p.id), a: sp(F.money(a, ccy, 0)), l: p.lev > 1 ? t('mb.lev', { v: p.lev }) : t('mb.noLev'), v: sp(`−${F.money(loss, ccy, 0)}`) });
}
function robotSheet({ info = false, onOk = null } = {}) {
  const p = D.prof();
  openSheet({
    small: true, label: t('sty.robotT'), className: 'sty-sheet', onClose: markClose,
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('sty.robotT')}</p><p class="sheet-sub">${nm(p.id)} ${meter(p.risk || 1)}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><p class="sty-warn is-robot">${icon('alert', 'icon-sm')}<span>${robotText(p)}</span></p>
      <div class="btn-stack">${info ? `<button type="button" class="btn btn-primary btn-block" data-no>${t('sty.robotOk')}</button>`
        : `<button type="button" class="btn btn-primary btn-block" data-ok>${t('sty.robotOn')}</button><button type="button" class="btn btn-ghost btn-block" data-no>${t('sty.cfNo')}</button>`}</div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-no]').addEventListener('click', () => closeTopSheet());
      const ok = sh.querySelector('[data-ok]');
      if (ok) ok.addEventListener('click', () => { closeTopSheet(); haptic(20); setTimeout(() => onOk && onOk(), 380); });
    },
  });
}
/* before Robot za mě is switched ON: a leveraged style shows the warning first; without leverage it goes straight on */
export function robotGate(onOk) {
  if (D.prof().lev > 1) robotSheet({ onOk });
  else onOk();
}
