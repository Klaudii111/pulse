import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import * as store from '../store.js';
import * as P from '../pwa.js';
import { LESSONS } from '../lessons.js';
import { icon, seg, segMove, toast, openSheet, closeTopSheet, langSwitch } from '../ui.js';
import { t, L, lang, setLang, LOCALES } from '../i18n/index.js';
import * as Live from '../live.js';
import * as Mkt from '../market.js';
import * as B from '../brief.js';
import * as W from '../wallet.js';
import * as Sync from '../sync.js';

/* 1.15.0: Kalendář (sample data) and Předplatné ("Platby spustíme…") are out of the navigation; the routes stay for old links.
   1.13.0: Nastavení on top, ONE Robot page (tabs), ONE "Jak to funguje" (with the tour button), Liga / Úrovně hidden until data */
/* 1.13.3: Více in three groups – the main five on top (Peněženka, Historie, Robot, Jak to funguje, Nastavení),
   then Pro pokročilé (Kalkulačka, Simulátor, MetaTrader 5, Předplatné), then the rest. Můj deník lives in Historie
   (its own section there when it has entries); the #/denik page stays for old links. */
export const MORE_ITEMS = [
  { group: 'more.g.main', items: [
    { id: 'penezenka', icon: 'wallet', sub: () => { const w = store.get('wallet', null); return w ? `${F.money(W.equityNow(), w.ccy, 0)} · ${t('d.fict')}` : t('d.fict'); } },
    { id: 'historie', icon: 'history', sub: () => { const w = store.get('wallet', null); const n = w?.closed?.length || 0; return n ? t('more.historie.s', { n }) : t('more.historie.s0'); } },
    /* 1.13.6: "Robot obchoduje za mě" merged in here (the switch itself lives on Dnes and the Robot page) */
    { id: 'robot', icon: 'shield', sub: () => `${t('more.robot.s2')} · ${t('pt.auto')}: ${t(store.get('autoCopy', null)?.on ? 'pt.on' : 'pt.off').toLowerCase()}` },
    { id: 'jak', icon: 'help', sub: () => t('more.jak.s2') },
    { id: 'nastaveni', icon: 'settings', sub: () => t('more.nastaveni.s') },
  ] },
  { group: 'more.g.adv', items: [
    { id: 'kalkulacka', icon: 'calc', sub: () => t('more.kalkulacka.s') },
    { id: 'simulator', icon: 'sim', sub: () => t('more.simulator.s') },
    { id: 'mt5', icon: 'external', sub: () => t('more.mt5.s') },
  ] },
  { group: 'more.g.other', items: [
    { id: 'akademie', icon: 'book', sub: () => t('more.akademie.s', { d: D.lessonsDone().size, n: LESSONS.length }) },
    { id: 'duvera', icon: 'check', sub: () => t('more.duvera.s') },
    { id: 'stahnout', icon: 'share', sub: () => t('more.stahnout.s') },
  ] },
];

/* "Zapnout upozornění" call-to-action (Dnes after the install banner, and Více) */
export function pushCta() {
  const st = P.pushCtaState();
  if (!st) return '';
  const btn = st === 'ok' ? `<button class="btn btn-primary btn-small" type="button" data-action="push-cta">${t('pcta.btn')}</button>`
    : st === 'ios' ? `<a class="btn btn-secondary btn-small" href="#/stahnout">${t('pcta.iosBtn')}</a>`
    : `<a class="btn btn-secondary btn-small" href="${CONFIG.APP_URL}">${t('pcta.elseBtn')}</a>`;
  return `<div class="pcta" role="region" aria-label="${t('pcta.t')}">
    <span class="pcta-ic">${icon('bell')}</span>
    <div><p class="nudge-t">${t('pcta.t')}</p><p class="nudge-s">${t(`pcta.s.${st}`)}</p></div>
    <div class="nudge-actions">${btn}<button class="icon-btn" type="button" data-action="dismiss-pcta" aria-label="${t('nudge.later')}">${icon('close', 'icon-sm')}</button></div>
  </div>`;
}

export function renderMore(ctx) {
  return `<header class="page-head"><div><h1 class="page-title">${t('more.title')}</h1><p class="page-sub">${t('more.sub')}</p></div></header>
  <div class="more-lang"><span>${t('lang.k')}</span>${langSwitch()}</div>
  ${pushCta()}
  ${Sync.card({ compact: true })}
  ${MORE_ITEMS.map((g) => `<h2 class="group-l">${t(g.group)}</h2><nav class="tile-grid" aria-label="${t(g.group)}">${g.items.map((it, i) => `<${it.action ? `button type="button" data-action="${it.id}"` : `a href="#/${it.id}"`} class="gtile" style="--i:${i}">
    <span class="gtile-ic">${icon(it.icon)}</span>
    <span class="gtile-t">${t(`more.${it.id}`)}</span>
    <span class="gtile-s">${F.esc(it.sub(ctx))}</span>
  </${it.action ? 'button' : 'a'}>`).join('')}</nav>`).join('')}`;
}

/* ---------- Info ---------- */
export function renderInfo(ctx) {
  const mode = ctx.data?.signals?.mode || 'paper';
  const now = mode === 'paper' ? 0 : 1;
  return `<header class="page-head"><div><h1 class="page-title">${t('title.info')}</h1></div></header>
  <div class="info-layout">
    <div>
      <p class="info-intro">${F.esc(t('info.intro', { app: CONFIG.APP_NAME }))}</p>
      <h2 class="section-title">${t('info.plan')}</h2>
      <ol class="phases">${[1, 2, 3].map((n, i) => `<li class="phase ${i === now ? 'is-now' : ''}"><span class="phase-n num">${n}</span><div><p class="phase-t">${t(`info.p${n}.t`)}${i === now ? `<span class="phase-now">${t('info.now')}</span>` : ''}</p><p class="phase-d">${t(`info.p${n}.d`)}</p></div></li>`).join('')}</ol>
      <h2 class="section-title">${t('info.read')}</h2>
      <div class="card"><ul class="legend-list">
        <li><span class="legend-dot" style="background:var(--ink)"></span><span>${t('info.l.entry')}</span></li>
        <li><span class="legend-dot" style="background:var(--down)"></span><span>${t('info.l.stop')}</span></li>
        <li><span class="legend-dot" style="background:var(--up)"></span><span>${t('info.l.target')}</span></li>
        <li><span class="legend-dot" style="background:var(--gold)"></span><span>${t('info.l.exit')}</span></li>
      </ul></div>
    </div>
    <div>
      <h2 class="section-title">${t('info.risks')}</h2>
      <div class="card risk-text">
        <p>${F.esc(t('disclaimer'))}</p>
        <p>${t('info.r1')}</p>
        <p>${t('info.r2')}</p>
        <p>${t('info.r3')}</p>
      </div>
      <p class="meta-foot"><span>${F.esc(CONFIG.APP_NAME)} ${CONFIG.APP_VERSION}</span><span>${ctx.data?.signals ? t('chrome.data', { time: F.dmTime(ctx.data.signals.generated_at) }) : ''}</span></p>
    </div>
  </div>`;
}

/* ---------- Settings ---------- */
export function renderSettings(ctx) {
  const prox = D.proximityPct();
  const inst = P.installState();
  const sup = P.pushSupport();
  const pushMsg = { elsewhere: 'push.elsewhere', 'no-key': 'push.nokey', 'ios-install': 'push.ios', unsupported: 'push.unsupported', denied: 'push.denied' }[sup.reason] || 'push.ok';
  const instMsg = inst === 'installed' ? 'set.installed' : inst === 'ios' ? 'set.installIos' : inst === 'prompt' ? 'set.installPrompt' : 'set.installOther';
  return `<header class="page-head"><div><a class="back" href="#/vice">${icon('chev-left', 'icon-xs')}${t('nav.vice')}</a><h1 class="page-title">${t('set.title')}</h1></div></header>
  ${myProfile()}
  <div class="info-layout"><div>
    ${'' /* 1.13.6: the info-only "Živé ceny" card removed (nothing to set there) */}
    <h2 class="section-title">${t('set.lang')}</h2>
    <div class="card more-lang"><span>${t('lang.k')}</span>${langSwitch()}</div>
    <h2 class="section-title">${t('set.notif')}</h2>
    <div class="card"><div class="card-row"><div><p class="card-t">${t('set.local')}</p><p class="card-s">${t('set.localS')}</p></div>
      <button class="switch" role="switch" type="button" aria-checked="${P.localNotifyEnabled()}" data-action="local-notify" aria-label="${t('set.local')}"></button></div></div>
    <div class="card"><div class="card-row"><div><p class="card-t">${t('set.push')}</p><p class="card-s" id="push-s">${t(pushMsg)}</p></div>
      <button class="switch" role="switch" type="button" id="push-sw" aria-checked="false" data-action="push" aria-label="${t('set.push')}" ${sup.ok ? '' : 'disabled'}></button></div></div>
    <div class="card"><p class="card-t">${t('set.prox')}</p>
      <div style="margin-top:12px">${seg({ name: 'prox', small: true, label: t('set.proxAria'), items: CONFIG.PROXIMITY_OPTIONS.map((v) => ({ id: String(v), label: F.pct(v, v % 1 ? 1 : 0) })), active: String(prox) })}</div></div>
  </div><div>
    <h2 class="section-title">${t('set.trade')}</h2>
    <div class="card"><div class="card-row"><div><p class="card-t">${t('set.pro')}</p><p class="card-s">${t('set.proS')}</p></div>
      <button class="switch" role="switch" type="button" aria-checked="${Mkt.isPro()}" data-action="pro-toggle" aria-label="${t('set.pro')}"></button></div></div>
    <h2 class="section-title">${t('set.app')}</h2>
    <div class="card"><div class="card-row"><div><p class="card-t">${t('set.install')}</p><p class="card-s">${t(instMsg)}</p></div>
      ${inst === 'installed' ? '' : `<button class="btn btn-secondary btn-small" type="button" data-action="install">${t(inst === 'ios' ? 'nudge.how' : 'nudge.install')}</button>`}</div></div>
    ${CONFIG.ACCESS_GATE_ENABLED ? `<div class="card"><div class="card-row"><div><p class="card-t">${t('set.code')}</p><p class="card-s">${t('set.codeS')}</p></div><button class="btn btn-secondary btn-small" type="button" data-action="lock">${t('set.lock')}</button></div></div>` : ''}
    <p class="meta-foot"><span>${F.esc(CONFIG.APP_NAME)} ${CONFIG.APP_VERSION}</span></p>
  </div></div>`;
}

/* 1.13.0 "Můj profil" – what every money number in the app starts from: kapitál (= Peněženka) and
   1.13.2 ONE profile (risk + leverage): Konzervativně 1 % bez páky · Vyváženě 2 % do 1:2 · Agresivněji 4 % do stropu trhu */
function myProfile() {
  const w = store.get('wallet', null);
  const c = w?.ccy || D.calcState().ccy;
  const rp = D.prof();
  /* the cap per trade = the largest deposit any card / sheet / robot uses (D.stakeCap); the loss at the stop is at most risk % */
  const stake = D.stakeCap();
  const radio = (items, act, key, cur) => `<div class="mp-seg" role="radiogroup">${items.map((x) => `<button type="button" class="mp-opt" role="radio" aria-checked="${x.id === cur}" data-action="${act}" ${key}="${x.id}"><b>${x.t}</b><small>${x.s}</small></button>`).join('')}</div>`;
  return `<section class="mp card" aria-labelledby="mp-h"><h2 class="mp-h" id="mp-h">${t('mp.title')}</h2>
    <div class="mp-row"><div><p class="mp-l">${t('mp.cap')}</p><p class="mp-v num" data-mp-cap>${F.money(w ? W.equityNow() : D.calcState().account, c, 0)}</p><p class="mp-s">${t('mp.capS')}</p></div>
      <div class="mp-btns"><button type="button" class="btn btn-primary btn-small" data-action="w-load">${t('wl.topupShort')}</button><button type="button" class="btn btn-ghost btn-small" data-action="w-withdraw">${t('wl.wd')}</button></div></div>
    <p class="mp-l">${t('mp.prof')}</p>
    ${radio(D.PROFILES.map((p) => ({ id: p.id, t: `${t(`mb.p.${p.id}`)} · ${B.profShort(p.id)}`, s: t(`pf.long.${p.id}`) })), 'lev-prof', 'data-prof', rp.id)}
    <p class="mp-sum" data-mp-stake="${stake}">${icon('info', 'icon-xs')}<span>${t('mp.sum', { a: F.money(stake, c, 0), p: F.num(D.profWorstPct(rp, 'AAPL'), 0) })}</span></p>
  </section>`;
}

export async function mountSettings(el) {
  const sw = el.querySelector('#push-sw');
  if (sw && !sw.disabled) {
    const sub = await P.pushSubscription();
    sw.setAttribute('aria-checked', String(!!sub));
  }
}

export function iosSheet() {
  openSheet({
    small: true, label: t('ios.t'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('ios.t')}</p><p class="ios-path">${t('ios.path')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body">
        <ol class="steps">
          <li><span>${t('ios.1')}</span>${icon('share')}</li>
          <li><span>${t('ios.2')}</span>${icon('plus-square')}</li>
          <li><span>${t('ios.3')}</span>${icon('check')}</li>
        </ol>
        <p class="jnote" style="margin-top:14px">${t('ios.foot')}</p>
      </div>`,
    onMount(sh) { sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet()); },
  });
}

export async function doInstall() {
  const st = P.installState();
  if (st === 'prompt') { await P.promptInstall(); return; }
  if (st === 'ios') { iosSheet(); return; }
  toast(t('install.other'));
}

export const actions = {
  async 'local-notify'(el) {
    const on = el.getAttribute('aria-checked') !== 'true';
    const res = await P.setLocalNotify(on);
    el.setAttribute('aria-checked', String(res));
    if (on && !res) toast(t('local.denied'));
  },
  async push(el) {
    const on = el.getAttribute('aria-checked') !== 'true';
    if (on) {
      const r = await P.subscribePush().catch(() => ({ ok: false }));
      el.setAttribute('aria-checked', String(!!r.ok));
      toast(t(r.ok ? 'push.on' : r.reason === 'server' ? 'push.server' : 'push.fail'));
    } else {
      await P.unsubscribePush();
      el.setAttribute('aria-checked', 'false');
      toast(t('push.off'));
    }
  },
  install() { doInstall(); },

  lock(el, ev, ctx) { store.del('unlocked'); location.reload(); },
  seg(el, ev, ctx) {
    const n = el.dataset.segName;
    if (n === 'prox') { store.set('proximityPct', +el.dataset.id); segMove(document.getElementById('view'), n, el.dataset.id); return true; }
    if (n === 'lang') { setLang(el.dataset.id); ctx.onLangChange(); return true; }
    if (n === 'theme') { store.set('theme', el.dataset.id); ctx.applyTheme(); segMove(document.getElementById('view'), n, el.dataset.id); return true; }
    return false;
  },
};
