import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import { t, L } from '../i18n/index.js';
import { icon, skBlock, ladderGeometry, liveState, monogram, sparkline, toast } from '../ui.js';
import * as B from '../brief.js';
import * as W from '../wallet.js';
import * as store from '../store.js';
import { orderRow, histList, tradeRow, closeConfirm } from './terminal.js';
import { pricePoints } from '../charts.js';
import { withLive } from './results.js';
import { regimeLine, nextLine, disclaimer, emptyState, rTip, errorBlock, signalRow, nextCheck } from './signals.js';
import { paperHero } from './paper.js';
import { card as mojeCard } from './moje.js';
import { pushCta } from './more.js';
import * as Live from '../live.js';
import * as H from '../health.js';
import { offLine, linkLine } from './learn.js';
import { myStats } from './penezenka.js';

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
  /* 1.13.0 ONE hero: balance, today's change in colour, small Volné / Ve hře (= in trades + waiting buys) */
  return `<section class="d-hero" id="acc-card" aria-label="${t('wl.title')}">
    <a class="d-hero-l" href="#/penezenka"><p class="d-k">${icon('wallet', 'icon-xs')}${t('wl.title')}${icon('chev-right', 'icon-xs')}</p>
      <p class="d-hero-v num">${F.money(sm.equity, c, 0)}</p>
      <p class="d-hero-ch num tone-${td.tone}">${td.zero ? t('dh.today0', { v: `±${F.money(0, c, 0)}` }) : t('dh.today', { v: F.esc(td.text), p: (() => { const v = sm.today / Math.max(1, sm.equity - sm.today) * 100; return F.spct(v, Math.abs(v) < 0.1 ? 2 : 1); })() })}</p>
      <p class="d-hero-s num">${t(Math.abs(sm.open) >= 0.5 ? 'dh.split3' : 'dh.split', { f: F.money(Math.max(0, sm.cash), c, 0), u: F.money(sm.used + sm.reserved, c, 0), o: (sm.open > 0 ? '+' : '') + F.money(sm.open, c, 0) })}</p></a>
    <button type="button" class="btn btn-secondary btn-small d-hero-b" data-action="w-load">${icon('plus-square', 'icon-sm')}<span>${t('wl.topupShort')}</span></button>
  </section>`;
}

/* 1.13.0 "Jak chceš obchodovat": one card, three chips – Sám · Signály · Robot za mě (switch + one status line) */
export function profText() {
  const lp = B.levProfile();
  const rp = D.riskProf();
  return `${lp.id === 'own' ? t('mb.own') : t(`mb.p.${lp.id}`)} · ${t(`profile.${rp.id}`)} (${F.num(rp.pct, 0)} %)`;
}
function paths() {
  const on = !!store.get('autoCopy', null)?.on;
  return `<section class="how-card" aria-label="${t('pt.aria')}">
    <p class="d-k">${t('pt.aria')}</p>
    <div class="how-chips">
      <a class="hw-chip" href="#/terminal">${icon('chart', 'icon-sm')}<span>${t('pt.self')}</span></a>
      <a class="hw-chip" href="#/signaly">${icon('signals', 'icon-sm')}<span>${t('pt.sig')}</span></a>
      <button type="button" class="hw-chip hw-auto ${on ? 'is-on' : ''}" id="auto-copy" role="switch" aria-checked="${on}" data-action="auto-toggle">${icon('robot', 'icon-sm')}<span>${t('pt.auto')}</span><span class="auto-sw" aria-hidden="true"><i></i></span></button>
    </div>
    <p class="how-st"><b class="${on ? 'up' : ''}">${t(on ? 'pt.on' : 'pt.off')}</b> · <a class="link" href="#/nastaveni">${F.esc(profText())}</a></p>
  </section>`;
}

/* "Robot obchoduje za mě (nanečisto)" - the answer to "does it invest by itself?" */
export function autoSwitch() {
  const on = !!store.get('autoCopy', null)?.on;
  return `<button type="button" class="auto-tg ${on ? 'is-on' : ''}" id="auto-copy" role="switch" aria-checked="${on}" data-action="auto-toggle">
    <span class="auto-tx"><b>${t('auto.t')}</b><small>${t(on ? 'auto.sOn' : 'auto.sOff')}</small></span><span class="auto-sw" aria-hidden="true"><i></i></span></button>`;
}


/* 2 NOVÝ SIGNÁL: buyable signals (a / b / soon), not dismissed with "Teď ne", max 3.
   1.11.0: strategies switched off by the robot's watchdog are not offered; best first (H.sortByQuality). */
export function newSignals(data, now, withDismissed = false) {
  const nn = new Set(withDismissed ? [] : D.dismissed());
  const list = D.allOpen(data).filter((x) => D.horizonAllowed(data, x.horizon) && !(CONFIG.HIDDEN_HORIZONS || []).includes(x.horizon) && !nn.has(x.id) && H.offerable(x, data))
    .filter((x) => D.sigPhase(x, now) === 'open' && ['buy', 'soon', 'wait'].includes(D.cardState(x, data, now).code));
  return H.sortByQuality(list, data, now);
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
  const rows = sm.rows.map((p) => tradeRow(p, sm.w.ccy, liveLine(p, ctx.data))).join('');
  return bare ? rows : `<div class="mi-list">${rows}</div>`;
}

/* 1.9.1 tab "Zainvestováno": everything I put money into – open trades, waiting buys, history (former Moje + platform lists) */
export function renderInvested(ctx) {
  const head = `<header class="page-head"><div><h1 class="page-title">${t('nav.zainvestovano')}</h1><p class="page-sub">${t('zi.sub')}</p></div>
    <a class="btn btn-secondary btn-small zi-hist" href="#/historie">${icon('history', 'icon-sm')}<span>${t('hi.title')}</span></a></header>`;
  if (!ctx.data?.signals) return head + skBlock(220);
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  const now = ctx.now();
  const open = D.moneyTone(sm.open, c, sm.used > 0 ? (sm.open / sm.used) * 100 : null);
  const ords = sm.w.orders.map((o) => orderRow(o, ctx.data)).join('');
  const hs = myStats(sm.w);
  /* followed signals (former Moje): only when there are some */
  const fol = D.followed().map((id) => D.findSignal(ctx.data, id)).filter(Boolean);
  return head + `
  <section class="d-acc"><div class="d-acc-l"><p class="d-k">${t('acc.inPlay')}${B.qh('VEHRE')}</p>
    <p class="d-acc-v"><b class="num">${F.money(sm.used + sm.reserved, c, 0)}</b><span>${t('d.fict')}</span></p>
    <p class="d-acc-s num">${t(sm.reserved > 0 ? 'zi.split' : 'zi.split0', { a: F.money(sm.used, c, 0), b: F.money(sm.reserved, c, 0) })}${sm.rows.length ? ` · <span class="${open.tone}">${t('zi.result', { v: open.text })}</span>` : ''}</p></div>
    <a class="btn btn-secondary d-trade" href="#/penezenka">${icon('wallet', 'icon-sm')}<span>${t('wl.title')}</span></a></section>
  <section class="d-block"><h2 class="d-h">${t('zi.open')}<span class="num"> · ${sm.rows.length}</span></h2>${sm.rows.length ? myInvestRows(ctx, sm) : `<p class="d-empty">${t('d.mine0')}</p>`}</section>
  <section class="d-block"><h2 class="d-h">${t('zi.orders')}<span class="num"> · ${sm.w.orders.length}</span></h2>${ords ? `<div class="tp-list">${ords}</div>` : `<p class="d-empty">${t('zi.orders0')}</p>`}</section>
  <a class="hs-row zi-hrow" href="#/historie">${icon('history', 'icon-xs')}<span>${hs.n ? t('zi.histLine', { n: hs.n, u: F.unit('trade', hs.n), r: F.pct(hs.rate, 0), v: (hs.total > 0.5 ? '+' : '') + F.money(hs.total, c, 0) }) : t('zi.histLine0')}</span>${icon('chev-right', 'icon-xs')}</a>
  ${fol.length ? `<section class="d-block"><h2 class="d-h">${t('moje.fol')}<span class="num"> · ${fol.length}</span></h2><div class="sc-list">${fol.map((x, i) => B.compact(x, { data: ctx.data, now, i })).join('')}</div></section>` : ''}`;
}


/* 4 ROBOT: one line -> the robot page */
export function robotLine1(ctx) {
  const p = ctx.data?.paper;
  if (!p || !Array.isArray(p.positions)) return '';
  const n = p.positions.length;
  /* 1.13.1: the robot's account since its start (the same figure as the Účet tab and the chart's last point) – not "dnes" */
  const a = p.account || {};
  const start = +a.start_equity || 100000;
  const sum = Number.isFinite(+a.pnl_usd) ? +a.pnl_usd : p.positions.reduce((x, y) => x + (+y.pnl_usd || 0), 0);
  const pct = Number.isFinite(+a.pnl_pct) ? +a.pnl_pct : (sum / start) * 100;
  const c = D.walletCcy();
  const v = (sum > 0.5 ? '+' : sum < -0.5 ? '−' : '') + F.money(Math.abs(D.convert(sum, 'USD', c, ctx.data)), c, 0);
  const since = ctx.data?.performance?.equity?.[0]?.date;
  return `<p class="d-robot">${icon('shield', 'icon-sm')}<span>${t('d.robot2', { n, u: F.unit('trade', n), p: F.spct(pct, 2), v, d: since ? F.dm(since) : '–' })}</span></p>`;
}

export const actions = {
  'h-close'(el, ev, ctx) { closeConfirm(ctx, el.dataset.id); },
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
  const all = newSignals(ctx.data, now, true).length; // the same count as Signály → Otevřené ("Můžeš koupit N")
  const sigs = fresh.slice(0, 3);
  const more = all > sigs.length ? `<a class="d-more" href="#/signaly">${t('d.moreSigs', { n: all })}${icon('chev-right', 'icon-xs')}</a>` : '';
  /* 1.13.0: phone = one column (hero · how · signals · mine); desktop = left hero + how + mine, right the signals */
  return head + `<div class="d-grid">
  <div class="d-c1">${accountCard(ctx)}
  ${paths()}
  ${B.statsRow(ctx.data, now)}</div>
  <section class="d-block d-c2" aria-labelledby="d-new"><h2 class="d-h" id="d-new"><a href="#/signaly">${t('d.new')}${all ? `<span class="num"> · ${all}</span>` : ''}${icon('chev-right', 'icon-xs')}</a></h2>
    ${offLine(ctx.data)}
    ${sigs.length ? `<div class="sc-list">${sigs.map((x, i) => B.compact(x, { data: ctx.data, now, notNow: true, i, isNew: true, chips: i === B.firstMoneyIdx(sigs, ctx.data, now) })).join('')}</div>${more}` : `<p class="d-empty">${t('sig.none', { when: F.esc(nextCheck(ctx.data, now)) })}</p>`}
  </section>
  <section class="d-block d-c3" aria-labelledby="d-mine"><h2 class="d-h" id="d-mine"><a href="#/zainvestovano">${t('nav.zainvestovano')}${icon('chev-right', 'icon-xs')}</a></h2>${myInvest(ctx)}</section>
  </div>
  ${ctx.state.fromCache ? `<p class="stale">${icon('offline', 'icon-sm')}${t('common.offlineData')}</p>` : ''}`;
}
