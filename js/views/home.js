import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import { t, L } from '../i18n/index.js';
import { icon, skBlock, ladderGeometry, liveState, monogram, sparkline, toast } from '../ui.js';
import * as B from '../brief.js';
import * as W from '../wallet.js';
import * as store from '../store.js';
import { orderRow, histList } from './terminal.js';
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
    const ch = Live.dayChange(k);
    if (!q || ch == null) return '';
    return `<a class="mk ${ch >= 0 ? 'up' : 'down'}" href="#/terminal?k=${k}"><span class="mk-n">${F.esc(t(`mkt.k.${k}`))}</span><b class="num">${F.spct(ch, 2)}</b></a>`;
  }).filter(Boolean);
  if (items.length < 3) {
    items = STRIP_OLD.map(([sym, name]) => {
      const q = Live.quote(sym);
      const ch = Live.dayChange(sym);
      if (!q || ch == null) return '';
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


/* ---------- 1.9.1 Dnes – exactly four calm blocks (owner 11. 11.):
   1 MŮJ ÚČET · 2 NOVÝ SIGNÁL (max 3, the same card as Signály) · 3 MOJE INVESTICE (only my own trades) · 4 ROBOT (one line).
   Everything else lives in Signály / Výsledky / Více. */
const tone = (v) => (v > 0.5 ? 'up' : v < -0.5 ? 'down' : 'flat');
const smoney = (v, c) => (v > 0.5 ? '+' : '') + F.money(v, c, 0);

export function accountCard(ctx) {
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  const td = D.moneyTone(sm.today, c, sm.equity > 0 ? (sm.today / sm.equity) * 100 : null);
  return `<section class="d-acc" id="acc-card" aria-label="${t('d.acc')}">
    <div class="d-acc-l"><p class="d-k">${t('d.acc')}</p>
      <p class="d-acc-v"><b class="num">${F.money(sm.equity, c, 0)}</b><span>${t('d.fict')}</span></p>
      <p class="d-acc-s num ${td.tone}">${t('d.today', { v: td.text })}</p></div>
    <a class="btn btn-primary d-trade" href="#/terminal">${t('u.acc.trade')}</a>
  </section>`;
}

/* "Robot obchoduje za mě (nanečisto)" - the answer to "does it invest by itself?" */
export function autoSwitch() {
  const on = !!store.get('autoCopy', null)?.on;
  return `<button type="button" class="auto-tg ${on ? 'is-on' : ''}" id="auto-copy" role="switch" aria-checked="${on}" data-action="auto-toggle">
    <span class="auto-tx"><b>${t('auto.t')}</b><small>${t(on ? 'auto.sOn' : 'auto.sOff')}</small></span><span class="auto-sw" aria-hidden="true"><i></i></span></button>`;
}


/* 2 NOVÝ SIGNÁL: newest buyable signals (a / b / soon), not dismissed with "Teď ne", max 3 */
export function newSignals(data, now) {
  const nn = new Set(D.dismissed());
  return D.allOpen(data).filter((x) => D.horizonAllowed(data, x.horizon) && !(CONFIG.HIDDEN_HORIZONS || []).includes(x.horizon) && !nn.has(x.id))
    .filter((x) => ['buy', 'soon', 'wait'].includes(D.cardState(x, data, now).code))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

/* real prices only: the signal's price path (bot 5-min points + live ticks) and the ticks seen in this session,
   from the moment the trade was opened */
function liveLine(p, data) {
  const sig = p.sigId ? D.findSignal(data, p.sigId) : null;
  const from = p.entryT || p.openedAt || 0; // only since I invested
  const pts = (sig?.price_path || []).concat(Live.history(p.sym)).map((x) => ({ t: Date.parse(x.t), p: +x.p }))
    .filter((x) => x.p > 0 && x.t >= from).sort((a, b) => a.t - b.t);
  const vals = pts.map((x) => x.p);
  return vals.length >= 3 ? `<span class="mi-spark ${D.moneyTone(p.pnl, 'CZK', p.pnlPct).tone}">${sparkline(vals, { w: 72, h: 26 })}</span>` : '';
}

/* 3 MOJE INVESTICE: my own play-money trades + my waiting buy orders */
function myInvest(ctx) {
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  const ords = sm.w.orders.map((o) => `<a class="mi-row is-ord" href="#/zainvestovano"><span class="mi-id"><b class="mi-n">${F.esc(B.whatIs(o.sym, o.name).name)}</b>
      <span class="mi-s num">${t('d.order', { v: F.price(o.limit), a: F.money(o.amount, c, 0) })}</span></span></a>`).join('');
  const rows = myInvestRows(ctx, sm, true);
  return rows + ords ? `<div class="mi-list">${rows}${ords}</div>` : `<p class="d-empty">${t('d.mine0')}</p>`;
}
function myInvestRows(ctx, sm, bare = false) {
  const c = sm.w.ccy;
  const rows = sm.rows.map((p) => {
    const mt = D.moneyTone(p.pnl, c, p.pnlPct);
    const word = mt.zero ? '' : t(p.pnl > 0 ? 'd.win' : 'd.lose');
    const toT = p.tp > 0 && p.px > 0 ? Math.abs(p.tp - p.px) / p.px * 100 : null;
    const w = B.whatIs(p.sym, p.name);
    return `<div class="mi-row">
      <button type="button" class="mi-main" ${p.sigId ? `data-action="open-signal" data-id="${F.esc(p.sigId)}"` : `data-action="h-term" data-sym="${F.esc(p.sym)}"`}>
        <span class="mi-id"><b class="mi-n">${F.esc(w.name)}</b><span class="mi-v num ${mt.tone}">${word ? `${word} ` : ''}${F.esc(mt.text)}${mt.zero ? '' : ` (${F.spct(p.pnlPct, 1)})`}</span>
          ${toT != null ? `<span class="mi-s num">${t('d.toTarget', { v: F.pct(toT, 1) })}</span>` : ''}</span>
        ${liveLine(p, ctx.data)}
      </button>
      <button type="button" class="btn btn-secondary btn-small mi-x" data-action="h-close" data-id="${p.id}">${t('d.close')}</button>
    </div>`;
  }).join('');
  return bare ? rows : `<div class="mi-list">${rows}</div>`;
}

/* 1.9.1 tab "Zainvestováno": everything I put money into – open trades, waiting buys, history (former Moje + platform lists) */
export function renderInvested(ctx) {
  const head = `<header class="page-head"><div><h1 class="page-title">${t('nav.zainvestovano')}</h1><p class="page-sub">${t('zi.sub')}</p></div></header>`;
  if (!ctx.data?.signals) return head + skBlock(220);
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  const open = D.moneyTone(sm.open, c, sm.used > 0 ? (sm.open / sm.used) * 100 : null);
  const ords = sm.w.orders.map((o) => orderRow(o, ctx.data)).join('');
  return head + `
  <section class="d-acc"><div class="d-acc-l"><p class="d-k">${t('zi.inTrades')}</p>
    <p class="d-acc-v"><b class="num">${F.money(sm.used, c, 0)}</b><span>${t('d.fict')}</span></p>
    <p class="d-acc-s num ${open.tone}">${t('zi.result', { v: open.text })}</p></div>
    <a class="btn btn-secondary d-trade" href="#/terminal">${t('u.acc.trade')}</a></section>
  <section class="d-block"><h2 class="d-h">${t('zi.open')}<span class="num"> · ${sm.rows.length}</span></h2>${sm.rows.length ? myInvestRows(ctx, sm) : `<p class="d-empty">${t('d.mine0')}</p>`}</section>
  <section class="d-block"><h2 class="d-h">${t('zi.orders')}<span class="num"> · ${sm.w.orders.length}</span></h2>${ords ? `<div class="tp-list">${ords}</div>` : `<p class="d-empty">${t('zi.orders0')}</p>`}</section>
  <section class="d-block"><h2 class="d-h">${t('zi.hist')}</h2>${histList(sm)}</section>`;
}

/* 1.10.0 Více -> Můj účet: where my (fictional) money is + Nabít / Vybrat / Začít znovu */
export function renderAccount(ctx) {
  const head = `<header class="page-head"><div><a class="back" href="#/vice">${icon('chev-left', 'icon-xs')}${t('nav.vice')}</a><h1 class="page-title">${t('acc.title')}</h1><p class="page-sub">${t('acc.sub')}</p></div></header>`;
  if (!ctx.data?.signals) return head + skBlock(220);
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  const tot = D.moneyTone(sm.total, c, sm.totalPct);
  const row = (k, v, cls = '') => `<div class="acc-r"><span>${k}</span><b class="num ${cls}">${v}</b></div>`;
  return head + `
  <section class="big-acc is-page"><p class="big-acc-k">${icon('wallet', 'icon-xs')}${t('acc.big')}</p>
    <p class="big-acc-v num">${F.money(sm.equity, c, 0)}</p>
    <div class="big-acc-row num"><span>${t('acc.free')} <b>${F.money(Math.max(0, sm.free), c, 0)}</b></span><span>${t('acc.inPlay')} <b>${F.money(sm.used + sm.reserved, c, 0)}</b></span></div></section>
  <section class="card acc-rows">
    ${row(t('acc.putIn'), F.money(sm.putIn, c, 0))}
    ${row(t('acc.result'), `${F.esc(tot.text)}${tot.zero ? '' : ` (${F.spct(sm.totalPct, 1)})`}`, tot.tone)}
    ${row(t('acc.open'), String(sm.rows.length))}
    ${row(t('acc.orders'), String(sm.w.orders.length))}
  </section>
  <div class="acc-page-btns">
    <button type="button" class="btn btn-primary btn-block" data-action="w-load">${icon('plus-square', 'icon-sm')}${t('acc.load')}</button>
    <button type="button" class="btn btn-secondary btn-block" data-action="w-withdraw">${t('acc.wd')}</button>
    <button type="button" class="btn btn-ghost btn-block" data-action="w-reset">${t('acc.reset')}</button>
  </div>
  <p class="honest">${icon('shield', 'icon-xs')} ${t('acc.note')}</p>`;
}

/* 4 ROBOT: one line -> the robot page */
function robotLine1(ctx) {
  const p = ctx.data?.paper;
  if (!p || !Array.isArray(p.positions)) return '';
  const n = p.positions.length;
  const sum = p.positions.reduce((a, x) => a + (+x.pnl_usd || 0), 0);
  const v = (sum > 0.5 ? '+' : sum < -0.5 ? '−' : '') + F.money(Math.abs(sum), 'USD', 0);
  return `<a class="d-robot" href="#/robot">${icon('shield', 'icon-sm')}<span>${t('d.robot', { n, u: F.unit('trade', n), v })}</span>${icon('chev-right', 'icon-xs')}</a>`;
}

export const actions = {
  'h-close'(el, ev, ctx) {
    const rec = W.close(ctx.data, el.dataset.id);
    if (rec) toast(t('term.closed', { sym: rec.sym, v: smoney(rec.pnl, W.get().ccy) }));
    document.dispatchEvent(new CustomEvent('pulse:wallet'));
    ctx.rerender({ soft: true });
  },
  'h-term'(el) { store.set('termSym', el.dataset.sym); window.__pulseGo('#/terminal'); },
};

export function render(ctx) {
  const now = ctx.now();
  const dateLine = `${F.weekday(now)} ${F.dm(now)}`;
  const head = `<header class="page-head"><div><h1 class="page-title">${t('home.title')}</h1><p class="page-sub">${dateLine.charAt(0).toUpperCase() + dateLine.slice(1)}</p></div>
    <button type="button" class="icon-btn help-btn" data-action="tour" aria-label="${t('tour.open')}" title="${t('tour.open')}">${icon('help', 'icon-sm')}</button></header>`;
  if (!ctx.data?.signals) {
    if (ctx.state.error) return head + errorBlock();
    return head + `${skBlock(120, 22)}<div style="height:12px"></div>${skBlock(220)}`;
  }
  const fresh = newSignals(ctx.data, now);
  const sigs = fresh.slice(0, 3);
  const more = fresh.length > 3 ? `<a class="d-more" href="#/signaly">${t('d.moreSigs', { n: fresh.length })}${icon('chev-right', 'icon-xs')}</a>` : '';
  return head + `
  ${accountCard(ctx)}
  ${B.statsRow(ctx.data, now)}
  <section class="d-block" aria-labelledby="d-new"><h2 class="d-h" id="d-new"><a href="#/signaly">${t('d.new')}${icon('chev-right', 'icon-xs')}</a></h2>
    ${sigs.length ? `<div class="sc-list">${sigs.map((x, i) => B.offer(x, { data: ctx.data, now, notNow: true, i })).join('')}</div>${more}` : `<p class="d-empty">${t('d.new0')}</p>`}
  </section>
  <section class="d-block" aria-labelledby="d-mine"><h2 class="d-h" id="d-mine"><a href="#/zainvestovano">${t('nav.zainvestovano')}${icon('chev-right', 'icon-xs')}</a></h2>${myInvest(ctx)}</section>
  ${robotLine1(ctx)}
  ${D.headStats(ctx.data, now).n ? `<section class="d-block" aria-labelledby="d-fresh"><h2 class="d-h" id="d-fresh"><a href="#/vysledky">${t('fr.title')}${icon('chev-right', 'icon-xs')}</a></h2>${B.freshTable(ctx.data, { n: 3, now, more: true })}</section>` : ''}
  ${ctx.state.fromCache ? `<p class="stale">${icon('offline', 'icon-sm')}${t('common.offlineData')}</p>` : ''}`;
}
