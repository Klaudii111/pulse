import * as F from '../format.js';
import * as D from '../domain.js';
import { t, L } from '../i18n/index.js';
import { icon, skBlock, ladderGeometry, liveState, monogram, sparkline, toast } from '../ui.js';
import * as B from '../brief.js';
import * as W from '../wallet.js';
import * as store from '../store.js';
import { orderRow } from './terminal.js';
import { pricePoints } from '../charts.js';
import { withLive } from './results.js';
import { regimeLine, nextLine, disclaimer, emptyState, rTip, errorBlock, signalRow, nextCheck } from './signals.js';
import { paperHero } from './paper.js';
import { card as mojeCard } from './moje.js';
import { pushCta } from './more.js';
import * as Live from '../live.js';

/* 1.9.0: live market strip with the main markets (instruments.json keys, plain names); tap = trade it on the platform.
   Before the server knows the keys, the old ETF proxies are shown (labelled honestly). */
const STRIP = ['US500', 'US100', 'US30', 'DE40', 'XAUUSD', 'EURUSD', 'BTCUSD'];
const STRIP_OLD = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['DIA', 'Dow'], ['GLD', 'mkt.gold']];
function marketStrip() {
  let items = STRIP.map((k) => {
    const q = Live.quote(k);
    if (!q || !(q.pc > 0)) return '';
    const ch = (q.p / q.pc - 1) * 100;
    return `<a class="mk ${ch >= 0 ? 'up' : 'down'}" href="#/terminal?k=${k}"><span class="mk-n">${F.esc(t(`mkt.k.${k}`))}</span><b class="num">${F.spct(ch, 2)}</b></a>`;
  }).filter(Boolean);
  if (items.length < 3) {
    items = STRIP_OLD.map(([sym, name]) => {
      const q = Live.quote(sym);
      if (!q || !(q.pc > 0)) return '';
      const ch = (q.p / q.pc - 1) * 100;
      return `<a class="mk ${ch >= 0 ? 'up' : 'down'}" href="#/terminal?k=${sym}"><span class="mk-n">${F.esc(name.startsWith('mkt.') ? t(name) : name)} <small>(${sym})</small></span><b class="num">${F.spct(ch, 2)}</b></a>`;
    }).filter(Boolean);
  }
  return items.length ? `<div class="mk-strip" aria-label="${t('mkt.aria')}">${items.join('')}</div>` : '';
}

export function miniBar(s) {
  const g = ladderGeometry(s);
  const st = liveState(s);
  const p = st === 'target' ? s.target : st === 'stop' ? s.stop : s.last_price;
  const cur = p != null ? g.pos(p) : g.e;
  const up = (s.pnl_r ?? 0) >= 0;
  const a = Math.min(g.e, cur), w = Math.abs(cur - g.e);
  return `<span class="mini" aria-hidden="true">
    <span class="mini-zone risk" style="${g.buy ? `left:0;width:${g.e}%` : `left:${g.e}%;right:0`}"></span>
    <span class="mini-zone reward" style="${g.buy ? `left:${g.e}%;right:0` : `left:0;width:${g.e}%`}"></span>
    <span class="mini-fill ${up ? 'up' : 'down'}" style="left:${a}%;width:${w}%"></span>
    <span class="mini-entry" style="left:${g.e}%"></span>
    <span class="mini-now ${up ? 'up' : 'down'}" style="left:${cur}%"></span>
  </span>`;
}

function alerts(ctx, open) {
  const now = ctx.now();
  const out = [];
  const events = ctx.data.calendar?.events || [];
  open.forEach((s) => {
    const at = s.hit_at ? t('home.a.at', { time: F.time(s.hit_at) }) : '';
    if (s.intraday_hit === 'target') out.push({ g: 'hit', t: 'up', ic: 'check', id: s.id, title: t('home.a.target', { sym: s.symbol }), val: F.spct(s.pnl_pct_position, 2), sub: at });
    else if (s.intraday_hit === 'stop') out.push({ g: 'hit', t: 'down', ic: 'close', id: s.id, title: t('home.a.stop', { sym: s.symbol }), val: F.spct(s.pnl_pct_position, 2), sub: at });
    else {
      const p = D.proximity(s);
      if (p) out.push({ g: 'near', t: p.side === 'stop' ? 'down' : 'up', ic: 'alert', id: s.id, title: t('home.a.near', { sym: s.symbol, v: F.pct(p.dist, 1), side: t(`det.prox.${p.side}`) }), val: F.spct(s.pnl_pct_position, 2), sub: F.HZ_LABEL[s.horizon] });
    }
  });
  events.filter((e) => e.importance >= 3 && F.daysUntil(e.date, now) >= 0 && F.daysUntil(e.date, now) <= 3)
    .forEach((e) => out.push({ g: 'event', t: 'gold', ic: 'calendar', href: '#/kalendar', title: L(e.title), val: '', sub: `${F.countdown(e.date, now)}${e.time ? `, ${e.time}` : ''}` }));
  return out;
}

const GROUPS = ['hit', 'near', 'event'];
const CAP = 5;
function alertList(al) {
  let n = 0;
  const rows = GROUPS.map((g) => {
    const items = al.filter((a) => a.g === g);
    if (!items.length) return '';
    const head = `<p class="alert-group ${n >= CAP ? 'is-extra' : ''}">${t(`home.g.${g}`)}</p>`;
    return head + items.map((a) => {
      const extra = n++ >= CAP ? ' is-extra' : '';
      return `<${a.href ? `a href="${a.href}"` : `button type="button" data-action="open-signal" data-id="${F.esc(a.id)}"`} class="alert-row${extra}">
        <span class="alert-ic ${a.t}">${icon(a.ic, 'icon-sm')}</span>
        <span class="alert-main"><span class="alert-t">${F.esc(a.title)}</span><span class="alert-s">${F.esc(a.sub)}</span></span>
        <span class="alert-v num ${a.t}">${a.val}</span>
      </${a.href ? 'a' : 'button'}>`;
    }).join('');
  }).join('');
  const more = al.length > CAP ? `<button type="button" class="alert-more" data-action="alerts-all" data-n="${al.length}">${t('common.showAll', { n: al.length })}</button>` : '';
  return `<div class="alert-list" id="alert-list">${rows}${more}</div>`;
}

export const actions = {
  'h-close'(el, ev, ctx) {
    const rec = W.close(ctx.data, el.dataset.id);
    if (rec) toast(t('term.closed', { sym: rec.sym, v: smoney(rec.pnl, W.get().ccy) }));
    ctx.rerender({ soft: true });
  },
  'h-term'(el) { store.set('termSym', el.dataset.sym); window.__pulseGo('#/terminal'); },
  'pos-all'(el) {
    const on = document.getElementById('pos-list').classList.toggle('show-all');
    el.textContent = on ? t('common.showLess') : t('common.showAllN', { n: el.dataset.n });
  },
  'alerts-all'(el) {
    const on = document.getElementById('alert-list').classList.toggle('show-all');
    el.textContent = on ? t('common.showLess') : t('common.showAll', { n: el.dataset.n });
  },
};

/* "Můj účet (fiktivní)" - the first thing on Dnes: my money, today's result, Obchodovat / Nabít */
export function accountCard(ctx) {
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  return `<section class="acc-card" id="acc-card" aria-label="${t('u.acc.k')}">
    <p class="acc-k">${icon('wallet', 'icon-sm')}${t('u.acc.k')}<span class="demo-chip">${t('u.fict')}</span></p>
    <p class="acc-big num">${F.money(sm.equity, c, 0)}</p>
    <p class="acc-sub num"><span class="${tone(sm.today)}">${t('u.acc.today', { v: smoney(sm.today, c) })}</span> · <span class="${tone(sm.total)}">${t('u.acc.total', { v: smoney(sm.total, c) })}</span></p>
    <div class="acc-btns"><a class="btn btn-primary" href="#/terminal">${icon('chart', 'icon-sm')}${t('u.acc.trade')}</a><button type="button" class="btn btn-secondary" data-action="w-load">${icon('plus-square', 'icon-sm')}${t('u.acc.load')}</button></div>
    ${autoSwitch()}
  </section>`;
}

/* "Robot obchoduje za mě (nanečisto)" - the answer to "does it invest by itself?" */
export function autoSwitch() {
  const on = !!store.get('autoCopy', null)?.on;
  return `<button type="button" class="auto-tg ${on ? 'is-on' : ''}" id="auto-copy" role="switch" aria-checked="${on}" data-action="auto-toggle">
    <span class="auto-tx"><b>${t('auto.t')}</b><small>${t(on ? 'auto.sOn' : 'auto.sOff')}</small></span><span class="auto-sw" aria-hidden="true"><i></i></span></button>`;
}

/* the three questions every beginner asks, answered on Dnes (can be closed, "?" brings it back) */
function faq3() {
  if (store.get('faq3off', 0)) return '';
  return `<section class="faq3" id="faq3" aria-label="${t('faq3.aria')}">
    <button type="button" class="icon-btn faq3-x" data-action="faq3-close" aria-label="${t('common.close')}">${icon('close', 'icon-xs')}</button>
    ${[1, 2, 3].map((n) => `<p class="faq3-q"><b>${t(`faq3.q${n}`)}</b> ${t(`faq3.a${n}`)}</p>`).join('')}
  </section>`;
}

const tone = (v) => (v > 0.5 ? 'up' : v < -0.5 ? 'down' : 'flat');
const smoney = (v, c) => (v > 0.5 ? '+' : '') + F.money(v, c, 0);

/* MÁM KOUPENO: my play-money trades + waiting limit orders + trades I marked as bought at my broker */
function mineBox(ctx, mineSigs, now) {
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  const rows = sm.rows.map((p) => `<div class="tp-row tone-${tone(p.pnl)}">
      <button type="button" class="tp-main" ${p.sigId ? `data-action="open-signal" data-id="${F.esc(p.sigId)}"` : `data-action="h-term" data-sym="${F.esc(p.sym)}"`}>
        ${monogram(p.sym, p.name)}
        <span class="tp-id"><span class="tp-t"><span class="ticker">${F.esc(B.whatIs(p.sym, p.name).name)}</span><span class="side-tag ${p.side === 'SELL' ? 'sell' : ''}">${F.SIDE[p.side]}</span>${p.lev > 1 ? `<span class="hz-tag">${t('term.levTag', { v: p.lev })}</span>` : ''}</span>
          <span class="tp-m num">${t('term.posMeta', { a: F.money(p.margin, c, 0), e: F.price(p.entry), p: F.price(p.px) })}</span>
          <span class="tp-m tp-open">${F.esc(B.myOpenText(p, c))}</span></span>
        <span class="tp-v num ${tone(p.pnl)}">${smoney(p.pnl, c)}<small>${F.spct(p.pnlPct, 1)}</small></span>
      </button>
      <button type="button" class="btn btn-secondary btn-small tp-close" data-action="h-close" data-id="${p.id}">${t('u.closeNow')}</button>
    </div>`).join('');
  const ords = sm.w.orders.map((o) => `<a class="moje-ord" href="#/terminal">${orderRow(o, ctx.data, { buttons: false })}</a>`).join('');
  const broker = mineSigs.filter((s) => !sm.rows.some((p) => p.sigId === s.id) && !sm.w.orders.some((o) => o.sigId === s.id));
  const n = sm.rows.length + sm.w.orders.length + broker.length;
  const body = n ? `<div class="tp-list">${rows}${ords}</div>${broker.length ? `<div class="bc-list">${broker.map((x, i) => B.card(x, { data: ctx.data, now, compact: true, i })).join('')}</div>` : ''}`
    : `<p class="box-empty">${t('u.box.mine0')}</p>`;
  const load = W.untouched() ? `<button type="button" class="btn btn-secondary btn-small box-load" data-action="w-load">${icon('plus-square', 'icon-sm')}${t('u.acc.loadHow')}</button>` : '';
  return { n, html: body + load };
}

export function render(ctx) {
  const now = ctx.now();
  const dateLine = `${F.weekday(now)} ${F.dm(now)}`;
  const head = `<header class="page-head"><div><h1 class="page-title">${t('home.title')}</h1><p class="page-sub">${dateLine.charAt(0).toUpperCase() + dateLine.slice(1)}</p></div>
    <button type="button" class="icon-btn help-btn" data-action="tour" aria-label="${t('tour.open')}" title="${t('tour.open')}">${icon('help', 'icon-sm')}</button></header>`;
  if (!ctx.data?.signals) {
    if (ctx.state.error) return head + errorBlock();
    return head + `${skBlock(196, 22)}<div style="height:12px"></div>${skBlock(18, 8)}<div style="height:24px"></div>${skBlock(220)}`;
  }
  const s = ctx.data.signals;
  const open = D.allOpen(ctx.data).filter((x) => D.horizonAllowed(ctx.data, x.horizon));
  const bk = B.buckets(open, now);
  const al = alerts(ctx, open).filter((a) => a.g === 'event');
  const card = (x, i) => B.card(x, { data: ctx.data, now, compact: true, i });
  const mine = mineBox(ctx, bk.mine, now);
  /* ROBOT DRŽÍ: what the robot holds on its paper account + signals it is too late to buy + ended today */
  const robotList = open.filter((x) => B.robotHolds(x, ctx.data) && !bk.robot.includes(x) && !bk.done.includes(x)).concat(bk.robot, bk.done);
  const CAPB = 4;
  const buyList = bk.buy.slice(0, CAPB);
  const buyMore = bk.buy.length > CAPB ? `<a class="alert-more box-more" href="#/signaly" data-uf="buy">${t('u.box.buyAll', { n: bk.buy.length })}</a>` : '';
  const box = (id, k, n, inner, extra = '') => `<section class="ubox ubox-${id}" id="box-${id}" aria-labelledby="bx-${id}">
      <h2 class="ubox-t" id="bx-${id}">${t(k)}<span class="ubox-n num">${n}</span></h2>${extra}${inner}</section>`;
  return head + `
  ${accountCard(ctx)}
  ${faq3()}
  ${box('buy', 'u.box.buy', bk.buy.length, bk.buy.length ? `<div class="bc-list">${B.byHorizon(buyList, card)}</div>${buyMore}` : `<p class="box-empty">${t('u.box.buy0', { when: F.esc(nextCheck(ctx.data, now)) })}</p>`, `<p class="ubox-s">${t('u.box.buyS')}</p>`)}
  ${box('mine', 'u.box.mine', mine.n, mine.html, `<p class="ubox-s">${t('u.box.mineS')}</p>`)}
  <details class="ubox ubox-robot" id="box-robot">
    <summary><h2 class="ubox-t">${t('u.box.robot')}<span class="ubox-n num">${robotList.length}</span></h2>${icon('chev-down', 'icon-sm')}</summary>
    <p class="u-robot-note">${icon('info', 'icon-xs')}<span>${t('u.robotNote')}</span></p>
    ${paperHero(ctx)}
    ${robotList.length ? `<div class="bc-list">${B.byHorizon(robotList, card)}</div>` : `<p class="box-empty">${t('u.box.robot0')}</p>`}
  </details>
  ${marketStrip()}
  ${nextLine(ctx.data, now)}
  ${regimeLine(s.regime)}
  ${ctx.state.fromCache ? `<p class="stale">${icon('offline', 'icon-sm')}${t('common.offlineData')}</p>` : ''}
  ${ctx.nudge || ''}
  ${pushCta()}
  ${al.length ? `<h2 class="section-title">${t('home.attention')}</h2>${alertList(al)}` : ''}
  ${disclaimer()}`;
}
