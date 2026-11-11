// Obchodní platforma (1.6.0): a simple trading screen on the user's own fictional demo account (js/wallet.js).
// Fictional money only, nothing is traded for real.
// 1.8.0: order type "Hned" / "Limitní" + validity, pending limit orders in the tab "Příkazy". Logic: js/wallet.js.
// 1.9.0: every main market (indices, currencies, commodities, crypto, shares, ETFs – js/market.js) in a searchable
// picker with favourites; LEVERAGE right in the ticket (1:1 … the instrument's EU cap) with a money explanation;
// realistic costs (spread, overnight fee, conversion fee) shown before confirming; market hours (closed -> only a
// limit order); Nabít / Vybrat fictional money; live line + 1-minute candles + TradingView candles and a verify link.
import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import * as W from '../wallet.js';
import * as M from '../market.js';
import * as B from '../brief.js';
import * as Live from '../live.js';
import * as store from '../store.js';
import { t } from '../i18n/index.js';
import { INSTR } from '../instruments.js';
import { gloss } from '../explain.js';
import { icon, monogram, openSheet, closeTopSheet, toast, seg, segMove, haptic } from '../ui.js';
import { priceChart } from '../charts.js';
import { mountTV, tvSymbol } from './detail.js';
import { autoSwitch } from './home.js';

let chartRef = null, liveOff = null, tvOn = false, autoTicketFor = null, stampTimer = null;
let tab = 'pos', cmode = 'live';

const money = (v, ccy, dec = 0) => F.money(v, ccy, dec);
const smoney = (v, ccy, dec = 0) => (v > 0.5 ? '+' : '') + F.money(v, ccy, dec);
const tone = (v) => (v > 0.5 ? 'up' : v < -0.5 ? 'down' : 'flat');
/* price in the instrument's own decimals (EUR/USD 1,10940; US500 7 633,70) */
export const pxOf = (sym, v) => F.price(v, M.get(sym) ? M.decimals(sym, v) : null);

function openSigs(data) { return D.allOpen(data).filter((s) => s.status === 'open' && !s.intraday_hit); }

function currentSym(ctx) {
  const sid = ctx.params.get('s');
  const sig = sid ? D.findSignal(ctx.data, sid) : null;
  if (sig) { store.set('termSym', sig.symbol); return { sym: sig.symbol, sig }; }
  const k = ctx.params.get('k');
  if (k && /^[A-Z0-9.-]{1,12}$/.test(k)) store.set('termSym', k);
  let sym = store.get('termSym', null);
  const sigs = openSigs(ctx.data);
  /* default without a signal: the S&P 500 (US500) when the server knows it, else the first signal / SPY */
  if (!sym) sym = M.get('US500') ? 'US500' : sigs[0]?.symbol || 'SPY';
  return { sym, sig: sigs.find((x) => x.symbol === sym) || null };
}

function sigName(sym, data) { return D.allOpen(data).find((x) => x.symbol === sym)?.name || ''; }
const whatOf = (sym, data) => B.whatIs(sym, sigName(sym, data));

/* the wallet's display name for a symbol */
const nameOf = (sym, data) => whatOf(sym, data).name;

/* Chart source: the signal's price path (bot 5-min points + live), else the prices collected live in this session */
function chartSeries(sym, sig) {
  if (sig && sig.price_path?.length > 1) return sig;
  return { symbol: sym, price_path: Live.history(sym), action: 'BUY', horizon: 'DEN' };
}

export function walletCard(ctx) {
  const w = store.get('wallet', null);
  if (!w || !w.positions?.length) return '';
  const sm = W.summary(ctx.data);
  return `<a class="wal-card" href="#/terminal">
    <span class="wal-k">${icon('spark', 'icon-sm')}${t('term.myAcc')}<span class="demo-chip">${t('term.demo')}</span></span>
    <span class="wal-v num">${money(sm.equity, sm.w.ccy)}</span>
    <span class="wal-s num ${tone(sm.open)}">${t('term.openPnl', { v: smoney(sm.open, sm.w.ccy), n: sm.rows.length })}</span>
  </a>`;
}

function accBar(sm) {
  const c = sm.w.ccy;
  const lvl = sm.level != null ? `<p class="acc-lvl ${sm.call ? 'is-call' : ''}">${icon(sm.call ? 'alert' : 'shield', 'icon-xs')}<span>${sm.call ? t('term.call', { v: F.num(sm.level, 0) }) : t('term.level', { v: F.num(Math.min(sm.level, 99999), 0) })}</span></p>` : '';
  return `<div class="acc-bar" id="acc-bar">
    <div><p class="acc-l">${t('term.balance')}</p><p class="acc-v num">${money(sm.balance, c)}</p></div>
    <div><p class="acc-l">${t('term.equity')}</p><p class="acc-v num">${money(sm.equity, c)}</p></div>
    <div><p class="acc-l">${t('term.today')}</p><p class="acc-v num ${tone(sm.today)}">${smoney(sm.today, c)}</p></div>
    <div><p class="acc-l">${t('term.free')}${qm('MARZE')}</p><p class="acc-v num">${money(sm.free, c)}</p></div>
  </div>
  <div class="acc-act"><button type="button" class="btn btn-secondary btn-small" data-action="w-load">${icon('plus-square', 'icon-sm')}${t('u.acc.load')}</button><button type="button" class="btn btn-ghost btn-small" data-action="w-withdraw">${t('u.acc.wd')}</button>
    <span class="acc-tot num">${t('u.acc.putIn', { a: money(sm.putIn, c), r: `<b class="${tone(sm.total)}">${smoney(sm.total, c)} (${F.spct(sm.totalPct, 1)})</b>` })}</span></div>
  ${lvl}${sm.reserved > 0 ? `<p class="acc-res">${icon('clock', 'icon-xs')}${t('term.reservedLine', { v: money(sm.reserved, c), n: sm.w.orders.length })}</p>` : ''}`;
}

function posList(sm, data) {
  const c = sm.w.ccy;
  if (!sm.rows.length) return `<p class="quiet">${t('term.noPos')}</p>`;
  return `<div class="tp-list">${sm.rows.map((p) => {
    const st = posStatus(p);
    return `<div class="tp-row tone-${tone(p.pnl)}">
      <button type="button" class="tp-main" ${p.sigId ? `data-action="open-signal" data-id="${F.esc(p.sigId)}"` : 'data-action="t-sym" data-sym="' + F.esc(p.sym) + '"'}>
        ${monogram(p.sym, p.name)}
        <span class="tp-id"><span class="tp-t"><span class="ticker">${F.esc(p.sym)}</span><span class="side-tag ${p.side === 'SELL' ? 'sell' : ''}">${F.SIDE[p.side]}</span><span class="hz-tag lev-tag">${t('term.levTag', { v: p.lev || 1 })}</span></span>
          <span class="tp-m num">${t('term.posMeta', { a: money(p.margin, c), e: pxOf(p.sym, p.entry), p: pxOf(p.sym, p.px) })}</span>
          <span class="tp-m tp-open">${F.esc(B.myOpenText(p, c))}</span>
          <span class="st-line tone-${st.tone}"><i aria-hidden="true"></i><b>${F.esc(st.text)}</b></span>
          ${p.swap > 0 ? `<span class="tp-m">${t('term.swapPaid', { v: money(p.swap, c, 0) })}</span>` : ''}</span>
        <span class="tp-v num ${tone(p.pnl)}">${smoney(p.pnl, c, 0)}<small>${F.spct(p.pnlPct, 2)}</small></span>
      </button>
      <button type="button" class="btn btn-secondary btn-small tp-close" data-action="t-close" data-id="${p.id}">${t('term.close')}</button>
    </div>`;
  }).join('')}</div>`;
}

/* Same plain-language vocabulary as signals */
export function posStatus(p) {
  const near = (lvl) => lvl && Math.abs(p.px - lvl) / p.px * 100;
  const toS = near(p.sl), toT = near(p.tp);
  const prog = p.tp ? (p.px - p.entry) / (p.tp - p.entry) : 0;
  const progS = p.sl ? (p.px - p.entry) / (p.sl - p.entry) : 0;
  if (p.sl && (progS >= D.NEAR_PROGRESS || toS <= D.proximityPct())) return { tone: 'down', text: `${t('st.nearStop')} · ${t('st.toStop', { v: F.pct(toS, 1) })}` };
  if (p.tp && (prog >= D.NEAR_PROGRESS || toT <= D.proximityPct())) return { tone: 'up', text: t('st.nearTarget', { v: F.pct(toT, 1) }) };
  /* leverage: how far the price may still go against me before the deposit is gone */
  if (p.lev > 1 && p.margin > 0) {
    const left = (p.margin + Math.min(0, p.pnl)) / p.notional * 100;
    if (p.pnl < 0 && left < 100 / p.lev * 0.4) return { tone: 'down', text: t('term.nearOut', { v: F.pct(left, 1) }) };
  }
  if (Math.abs(p.pnlPct) < 0.05) return { tone: 'flat', text: t('st.flat') };
  return p.pnl > 0 ? { tone: 'up', text: t('st.win', { v: F.spct(p.pnlPct, 1) }) } : { tone: 'down', text: t('st.lose', { v: F.spct(p.pnlPct, 1) }) };
}

/* How far the price still has to go to the limit, in plain words */
export function limitDistance(o, px) {
  if (!(px > 0)) return { tone: 'flat', text: t('term.ord.noPx') };
  const need = o.side === 'SELL' ? (o.limit - px) / px * 100 : (px - o.limit) / px * 100;
  if (need <= 0) return { tone: 'up', text: t('term.ord.at') };
  return { tone: need <= D.proximityPct() ? 'up' : 'gold', text: t(o.side === 'SELL' ? 'term.ord.up' : 'term.ord.down', { v: F.pct(need, need < 1 ? 2 : 1) }) };
}
export const validText = (o) => t('term.ord.valid', { k: t(`term.valid.${o.valid}`), d: F.dmTime(o.expiresAt) });

/* One pending limit order (also used by Moje / Dnes) */
export function orderRow(o, data, { buttons = true } = {}) {
  const q = W.priceOf(o.sym, data);
  const dist = limitDistance(o, q?.p);
  const c = W.get().ccy;
  return `<div class="tp-row tp-ord ${buttons ? '' : 'is-static'}">
    <span class="tp-main">${monogram(o.sym, o.name)}
      <span class="tp-id"><span class="tp-t"><span class="ticker">${F.esc(o.sym)}</span><span class="side-tag ${o.side === 'SELL' ? 'sell' : ''}">${F.SIDE[o.side]}</span><span class="hz-tag is-preview">${t('term.ord.tag')}</span>${o.lev > 1 ? `<span class="hz-tag">${t('term.levTag', { v: o.lev })}</span>` : ''}</span>
        <span class="tp-m num">${t('term.ord.meta', { v: pxOf(o.sym, o.limit), p: q ? pxOf(o.sym, q.p) : '–', a: money(o.amount, c) })}</span>
        <span class="st-line tone-${dist.tone}"><i aria-hidden="true"></i><b>${F.esc(dist.text)}</b></span>
        <span class="tp-m">${F.esc(validText(o))}</span></span>
    </span>
    ${buttons ? `<span class="tp-btns"><button type="button" class="btn btn-secondary btn-small" data-action="t-oedit" data-id="${o.id}">${t('term.ord.edit')}</button><button type="button" class="btn btn-ghost btn-small" data-action="t-ocancel" data-id="${o.id}">${t('term.ord.cancel')}</button></span>` : ''}
  </div>`;
}

function ordList(sm, data) {
  const pend = sm.w.orders;
  const rows = sm.rows.filter((p) => p.sl || p.tp);
  const lim = pend.length
    ? `<div class="tp-list">${pend.map((o) => orderRow(o, data)).join('')}</div>`
    : `<p class="quiet">${t('term.ord.none')}</p>`;
  const help = `<p class="why-s ord-help">${t('term.ord.help')}</p>`;
  if (!rows.length) return lim + help + `<p class="sheet-label ord-sub">${t('term.ord.slTp')}</p><p class="quiet">${t('term.ord.noSlTp')}</p>`;
  return lim + help + `<p class="sheet-label ord-sub">${t('term.ord.slTp')}</p><div class="tp-list">${rows.map((p) => `<div class="tp-row is-static"><span class="tp-main">${monogram(p.sym, p.name)}
    <span class="tp-id"><span class="tp-t"><span class="ticker">${F.esc(p.sym)}</span><span class="side-tag ${p.side === 'SELL' ? 'sell' : ''}">${F.SIDE[p.side]}</span></span>
    <span class="tp-m num">${p.sl ? `<span class="down">${t('term.slAt', { v: pxOf(p.sym, p.sl) })}</span>` : ''}${p.sl && p.tp ? ' · ' : ''}${p.tp ? `<span class="up">${t('term.tpAt', { v: pxOf(p.sym, p.tp) })}</span>` : ''}</span>
    <span class="tp-m">${t('term.ordWait')}</span></span></span></div>`).join('')}</div>`;
}

function histOrder(o) {
  return `<div class="tp-row is-static tone-flat"><span class="tp-main">
    <span class="hist-bar"></span>
    <span class="tp-id"><span class="tp-t"><span class="ticker">${F.esc(o.sym)}</span><span class="side-tag ${o.side === 'SELL' ? 'sell' : ''}">${F.SIDE[o.side]}</span><span class="hz-tag is-preview">${t('term.ord.tag')}</span></span>
    <span class="tp-m num">${t('term.ord.histMeta', { v: pxOf(o.sym, o.limit), a: money(o.amount, W.get().ccy), d: F.dmTime(o.endAt) })}</span>
    <span class="tp-m">${t(`term.ord.end.${o.end}`)}</span></span>
    <span class="tp-v num">${t(`term.ord.endShort.${o.end}`)}</span></span></div>`;
}

/* money moves: loads, withdrawals, overnight fees */
function histCash(r, c) {
  const tn = r.amount > 0 ? 'up' : 'flat';
  return `<div class="tp-row is-static tone-${tn} hist-cash"><span class="tp-main">
    <span class="hist-bar ${tn === 'up' ? 'up' : ''}"></span>
    <span class="tp-id"><span class="tp-t"><b>${t(`term.cash.${r.k}`, { sym: r.sym || '', n: r.n || 1 })}</b></span>
    <span class="tp-m num">${F.dmTime(r.at)}</span></span>
    <span class="tp-v num ${tn}">${smoney(r.amount, c, r.k === 'swap' ? 2 : 0)}</span></span></div>`;
}

export function histList(sm) {
  const c = sm.w.ccy;
  const ended = (sm.w.ordEnded || []).filter((o) => o.end !== 'filled'); // a filled order lives on as the trade itself
  const cash = sm.w.cash || [];
  if (!sm.w.closed.length && !ended.length && !cash.length) return `<p class="quiet">${t('term.noHist')}</p>`;
  const all = sm.w.closed.map((p) => ({ at: p.closedAt, p })).concat(ended.map((o) => ({ at: o.endAt, o })), cash.map((r) => ({ at: r.at, r }))).sort((a, b) => b.at - a.at).slice(0, 80);
  return `<div class="tp-list">${all.map(({ p, o, r }) => (r ? histCash(r, c) : o ? histOrder(o) : `<div class="tp-row is-static tone-${tone(p.pnl)}"><span class="tp-main">
    <span class="hist-bar ${tone(p.pnl) === 'flat' ? '' : tone(p.pnl)}"></span>
    <span class="tp-id"><span class="tp-t"><span class="ticker">${F.esc(p.sym)}</span><span class="side-tag ${p.side === 'SELL' ? 'sell' : ''}">${F.SIDE[p.side]}</span><span class="hz-tag lev-tag">${t('term.levTag', { v: p.lev || 1 })}</span></span>
    <span class="tp-m num">${t('term.histMeta', { e: pxOf(p.sym, p.entry), x: pxOf(p.sym, p.exit), d: F.dmTime(p.closedAt) })}</span><span class="tp-m tp-open">${F.esc(B.myOpenText(p, c))}</span>${p.order ? `<span class="tp-m">${t('term.ord.fromLimit')}</span>` : ''}
    <span class="tp-m">${t(`term.why.${p.why}`, { sl: pxOf(p.sym, p.sl), x: pxOf(p.sym, p.exit) })}${p.fee > 0.5 ? ` · ${t('term.convFee', { v: money(p.fee, c) })}` : ''}</span></span>
    <span class="tp-v num ${tone(p.pnl)}">${smoney(p.pnl, c, 0)}<small>${F.spct(p.pnlPct, 2)}</small></span></span></div>`)).join('')}</div>`;
}

const histCount = (sm) => sm.w.closed.length + (sm.w.ordEnded || []).filter((o) => o.end !== 'filled').length + (sm.w.cash || []).length;
function tabBody(sm, data) { return tab === 'ord' ? ordList(sm, data) : tab === 'hist' ? histList(sm) : posList(sm, data); }

/* price + honest freshness + delayed / closed tags */
function priceBlock(sym, data) {
  const q = W.priceOf(sym, data);
  const open = M.isOpen(sym);
  let st = Live.stamp(q?.t || 0, Date.now(), open);
  /* a delayed source (Yahoo) is never called "živě" */
  if (st.code === 'live' && M.delayed(sym)) st = { code: 'stale', text: t('term.delayedLive', { s: Math.max(0, Math.round((Date.now() - q.t) / 1000)) }) };
  const ch = q ? Live.dayChange(sym) : null;
  return { q, open, html: `<p class="term-px num" data-px>${q ? pxOf(sym, q.p) : '–'}</p>
    ${ch != null ? `<p class="term-ch num ${ch >= 0 ? 'up' : 'down'}">${t('term.dayCh', { v: F.spct(ch, 2) })}</p>` : ''}
    <p class="live-stamp is-${st.code}"><i aria-hidden="true"></i>${F.esc(st.text)}</p>
` };
}

function closedNote(sym) {
  if (M.isOpen(sym)) return '';
  return `<p class="mkt-closed" id="t-closed">${icon('clock', 'icon-xs')}<span>${t('term.closedNow', { h: F.esc(M.hours(sym)) })}</span></p>`;
}

/* small "?" next to a trading word (opens one plain sentence + example) */
export const qm = (k) => `<button type="button" class="qm" data-action="term-help" data-k="${k}" aria-label="${t('th.ask')}">?</button>`;

const verifyUrl = (sym) => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(M.tvSym(sym) || tvSymbol(sym))}`;

export function render(ctx) {
  const head = `<header class="page-head"><div><h1 class="page-title">${t('term.title')}</h1><p class="page-sub">${t('term.sub')} <span class="demo-chip is-big">${t('term.demo')}</span></p></div></header>`;
  if (!ctx.data?.signals) return head;
  const { sym, sig } = currentSym(ctx);
  const sm = W.summary(ctx.data);
  const pb = priceBlock(sym, ctx.data);
  const w = whatOf(sym, ctx.data);
  const sigs = openSigs(ctx.data);
  return head + `
  <p class="fict-line">${icon('shield', 'icon-xs')}${t('term.fict')}</p>
  <div id="t-acc">${accBar(sm)}</div>
  ${autoSwitch()}
  <div class="term-grid">
    <section class="term-main card">
      <div class="term-sym">
        <button type="button" class="term-pick" data-action="t-pick" aria-label="${t('term.pick')}">${monogram(sym, w.name)}<span><span class="term-nm">${F.esc(w.name)}</span><span class="term-name"><span class="ticker">${F.esc(sym)}</span>${w.phrase ? ` · ${F.esc(w.phrase)}` : ''}</span></span>${icon('chev-down', 'icon-sm')}</button>
        <div class="term-pxbox" id="t-px">${pb.html}</div>
      </div>
      <button type="button" class="btn btn-secondary btn-small term-change" data-action="t-pick">${icon('search', 'icon-sm')}${t('term.change')}</button>
      ${sig ? `<button type="button" class="term-sig" data-action="open-signal" data-id="${F.esc(sig.id)}">${icon('signals', 'icon-xs')}${t('term.fromSig', { side: F.SIDE[sig.action], e: F.price(sig.entry), s: F.price(sig.stop), t: F.price(sig.target) })}</button>` : ''}
      <div class="range-chips pchart-modes" role="group" aria-label="${t('det.chartMode')}">
        <button type="button" class="range-chip" data-action="t-cmode" data-id="live" aria-pressed="${cmode === 'live'}">${t('term.chartLive')}</button>
        <button type="button" class="range-chip" data-action="t-cmode" data-id="c1" aria-pressed="${cmode === 'c1'}">${t('term.chartC1')}</button>
        <button type="button" class="range-chip" data-action="t-cmode" data-id="tv" aria-pressed="${cmode === 'tv'}">${t('det.chartTV')}</button>
      </div>
      <div class="pchart-box term-chart" id="t-chart" ${cmode === 'live' ? '' : 'hidden'}></div>
      <div class="pchart-box term-chart cndl-box" id="t-c1" ${cmode === 'c1' ? '' : 'hidden'}></div>
      <div class="tv-box" id="t-tv" ${cmode === 'tv' ? '' : 'hidden'}></div>
      <a class="link verify-link" href="${verifyUrl(sym)}" target="_blank" rel="noopener">${t('u.verify')}${icon('external', 'icon-xs')}</a>
      <div class="trade-btns" id="t-btns">
        <button type="button" class="trade-btn buy" data-action="t-ticket" data-side="BUY"><span>${t('term.buy')}</span><b class="num" data-tpx>${pb.q ? pxOf(sym, pb.q.p) : '–'}</b></button>
        <button type="button" class="trade-btn sell" data-action="t-ticket" data-side="SELL"><span>${t('term.sell')}</span><b class="num" data-tpx>${pb.q ? pxOf(sym, pb.q.p) : '–'}</b></button>
      </div>
      ${closedNote(sym)}
      <p class="trade-hint">${t('term.hint2', { lev: M.maxLev(sym) })}</p>
    </section>
    <section class="term-side">
      <div class="seg-wrap">${seg({ name: 'ttab', small: true, label: t('term.tabs'), items: [{ id: 'pos', label: t('term.tab.pos'), count: sm.rows.length }, { id: 'ord', label: t('term.tab.ord'), count: sm.w.orders.length }, { id: 'hist', label: t('term.tab.hist'), count: histCount(sm) }], active: tab })}</div>
      <div id="t-tab">${tabBody(sm, ctx.data)}</div>
      ${sigs.length ? `<h2 class="section-title">${t('term.sigs')}</h2><div class="chips term-chips">${sigs.slice(0, 12).map((x) => `<button type="button" class="chip ${x.symbol === sym ? 'chip-gold' : ''}" data-action="t-sym" data-sym="${F.esc(x.symbol)}">${F.esc(x.symbol)}</button>`).join('')}</div>` : ''}
      <details class="gloss term-gloss"><summary>${t('term.words')}</summary><ul>${['PAKA', 'MARZE', 'OBJEM', 'STOPOUT', 'SHORT', 'SPREAD', 'SWAP', 'MCALL', 'DELAY'].map((k) => `<li>${F.esc(gloss(k))}</li>`).join('')}</ul></details>
      <div class="mt5-links"><a class="link" href="${CONFIG.MT5.DOWNLOAD_URL}" target="_blank" rel="noopener">${icon('external', 'icon-xs')}${t('mt5.open')}</a><a class="link" href="#/mt5">${t('mt5.help')}</a></div>
      <button type="button" class="btn btn-ghost btn-small term-reset" data-action="t-reset">${t('term.reset')}</button>
    </section>
  </div>
  <p class="disclaimer">${icon('info')}${F.esc(t('term.disc'))}</p>`;
}

function refresh(el, ctx) {
  if (!el.isConnected) return;
  const { sym } = currentSym(ctx);
  const sm = W.summary(ctx.data);
  const acc = el.querySelector('#t-acc'); if (acc) acc.innerHTML = accBar(sm);
  const pxEl = el.querySelector('#t-px [data-px]');
  const old = pxEl ? F.parseNum(pxEl.textContent) : null;
  const pb = priceBlock(sym, ctx.data);
  const px = el.querySelector('#t-px'); if (px) px.innerHTML = pb.html;
  /* tick flash: green up, red down */
  if (pb.q && old != null && Number.isFinite(old) && Math.abs(old - pb.q.p) > 1e-9 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const n = el.querySelector('#t-px [data-px]'); if (n) n.classList.add(pb.q.p > old ? 'flash-up' : 'flash-down');
  }
  el.querySelectorAll('[data-tpx]').forEach((b) => { b.textContent = pb.q ? pxOf(sym, pb.q.p) : '–'; });
  const tb = el.querySelector('#t-tab'); if (tb) tb.innerHTML = tabBody(sm, ctx.data);
  const segEl = el.querySelector('[data-seg="ttab"]');
  if (segEl) {
    const n = { pos: sm.rows.length, ord: sm.w.orders.length, hist: histCount(sm) };
    segEl.querySelectorAll('.seg-btn').forEach((b) => { const k = b.querySelector('.seg-count'); if (k && n[b.dataset.id] != null) k.textContent = String(n[b.dataset.id]); });
  }
  chartRef && chartRef.refresh && chartRef.refresh();
  if (cmode === 'c1') drawCandles(el.querySelector('#t-c1'), sym);
}

export function mount(el, ctx) {
  if (!ctx.data?.signals) return;
  const { sym, sig } = currentSym(ctx);
  Live.onData(); // subscribe the chosen symbol (polling + stream)
  tvOn = false;
  const box = el.querySelector('#t-chart');
  const series = () => chartSeries(sym, D.allOpen(ctx.data).find((x) => x.symbol === sym && x.status === 'open'));
  const isLive = () => { const q = W.priceOf(sym, ctx.data); return Live.stamp(q?.t || 0, Date.now(), M.isOpen(sym)).code === 'live'; };
  chartRef && chartRef.destroy();
  if (box) chartRef = proxyChart(box, series, isLive);
  if (cmode === 'tv') { tvOn = true; mountTV(el.querySelector('#t-tv'), M.tvSym(sym) || tvSymbol(sym)); }
  if (cmode === 'c1') drawCandles(el.querySelector('#t-c1'), sym);
  liveOff && liveOff();
  const fn = () => refresh(el, ctx);
  document.addEventListener('pulse:live', fn);
  clearInterval(stampTimer);
  stampTimer = setInterval(() => {
    if (!el.isConnected) { clearInterval(stampTimer); return; }
    const q = W.priceOf(sym, ctx.data); let st = Live.stamp(q?.t || 0, Date.now(), M.isOpen(sym));
    if (st.code === 'live' && M.delayed(sym)) st = { code: 'stale', text: t('term.delayedLive', { s: Math.max(0, Math.round((Date.now() - q.t) / 1000)) }) };
    const s = el.querySelector('#t-px .live-stamp'); if (s) { s.className = `live-stamp is-${st.code}`; s.innerHTML = `<i aria-hidden="true"></i>${F.esc(st.text)}`; }
  }, 1000);
  liveOff = () => document.removeEventListener('pulse:live', fn);
  /* opened from a signal ("Zainvestovat nanečisto") -> the order ticket opens prefilled, once */
  const sid = ctx.params.get('s');
  if (sig && sid && autoTicketFor !== sid && sig.status === 'open' && !sig.intraday_hit) { autoTicketFor = sid; setTimeout(() => ticket(ctx, sig.action, sym, sig), 250); }
}

/* the chart object is rebuilt from a fresh series on every refresh (the symbol's live history grows) */
function proxyChart(box, series, isLive) {
  let c = priceChart(box, series(), { mode: 'today', isLive });
  return {
    refresh() { c.destroy(); c = priceChart(box, series(), { mode: 'today', isLive }); },
    destroy() { c.destroy(); },
  };
}

/* 1-minute candles built in the browser from the prices that arrived (stream / quotes.json) */
export function candles(points, minutes = 1) {
  const out = [];
  points.forEach((p) => {
    const ts = typeof p.t === 'number' ? p.t : Date.parse(p.t);
    if (!(ts > 0) || !(p.p > 0)) return;
    const b = Math.floor(ts / (minutes * 60000));
    const last = out[out.length - 1];
    if (last && last.b === b) { last.h = Math.max(last.h, p.p); last.l = Math.min(last.l, p.p); last.c = p.p; } else out.push({ b, o: last ? last.c : p.p, h: p.p, l: p.p, c: p.p });
  });
  out.forEach((k) => { k.h = Math.max(k.h, k.o); k.l = Math.min(k.l, k.o); });
  return out;
}
function drawCandles(box, sym) {
  if (!box) return;
  const ks = candles(Live.history(sym)).slice(-60);
  const w = box.clientWidth || 340, h = box.clientHeight || 220;
  if (ks.length < 2) { box.innerHTML = `<p class="pchart-empty">${t('term.c1Empty')}</p>`; return; }
  const lo = Math.min(...ks.map((k) => k.l)), hi = Math.max(...ks.map((k) => k.h));
  const span = (hi - lo) || hi * 0.001 || 1;
  const pad = { l: 4, r: 64, t: 10, b: 18 };
  const Y = (v) => pad.t + (1 - (v - (lo - span * 0.06)) / (span * 1.12)) * (h - pad.t - pad.b);
  const cw = (w - pad.l - pad.r) / 60;
  const x0 = w - pad.r - ks.length * cw;
  const bars = ks.map((k, i) => {
    const x = x0 + i * cw + cw / 2;
    const up = k.c >= k.o;
    const y1 = Y(Math.max(k.o, k.c)), y2 = Y(Math.min(k.o, k.c));
    return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(k.h).toFixed(1)}" y2="${Y(k.l).toFixed(1)}" class="ck-w ${up ? 'up' : 'down'}"/><rect x="${(x - cw * 0.35).toFixed(1)}" y="${y1.toFixed(1)}" width="${Math.max(1.5, cw * 0.7).toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" class="ck-b ${up ? 'up' : 'down'}"/>`;
  }).join('');
  const last = ks[ks.length - 1];
  const t0 = new Date(ks[0].b * 60000), t1 = new Date(last.b * 60000);
  box.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${F.esc(t('term.chartC1'))}">
    <line x1="${pad.l}" x2="${w - pad.r + 4}" y1="${Y(last.c).toFixed(1)}" y2="${Y(last.c).toFixed(1)}" class="ck-last"/>
    ${bars}
    <text x="${w - pad.r + 8}" y="${(Y(last.c) + 4).toFixed(1)}" class="ck-lab">${F.esc(pxOf(sym, last.c))}</text>
    <text x="${w - pad.r + 8}" y="${(Y(hi) + 4).toFixed(1)}" class="ck-ax">${F.esc(pxOf(sym, hi))}</text>
    <text x="${w - pad.r + 8}" y="${(Y(lo) + 4).toFixed(1)}" class="ck-ax">${F.esc(pxOf(sym, lo))}</text>
    <text x="${pad.l}" y="${h - 4}" class="ck-ax">${F.esc(F.time(t0))}</text><text x="${w - pad.r}" y="${h - 4}" class="ck-ax" text-anchor="end">${F.esc(F.time(t1))}</text>
  </svg>`;
}

export function unmount() { liveOff && liveOff(); liveOff = null; chartRef && chartRef.destroy(); chartRef = null; clearInterval(stampTimer); }

/* ---------- Order ticket ---------- */
/* 1.9.1: the investment sheet opened right from a signal card (Dnes, Signály, detail, push "Zainvestovat") */
export function investSheet(ctx, sig, mode = null) {
  if (!sig) return;
  ticket(ctx, sig.action === 'SELL' ? 'SELL' : 'BUY', sig.symbol, sig, { mode });
}

function ticket(ctx, side, sym, sig, opt = {}) {
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  const q = W.priceOf(sym, ctx.data);
  if (!q) { toast(t('term.noPrice')); return; }
  const open = M.isOpen(sym);
  /* 1.9.1: the same three deposits everywhere; the default = the example on the signal card (D.example) */
  const presets = D.DEP_CHIPS[c] || [5000, 10000, 25000];
  const useSig = sig && sig.action === side;
  const dir = side === 'SELL' ? -1 : 1;
  const maxLev = M.maxLev(sym);
  const levs = M.levSteps(maxLev);
  const dec = M.get(sym) ? M.decimals(sym, q.p) : (q.p < 10 ? 4 : 2);
  const round = (v) => +(+v).toFixed(dec);
  /* the robot's signals are LIMIT entries: price already past the entry (above it for a buy) -> wait for the entry price */
  const sigLim = useSig && sig.entry > 0 && dir * (q.p - sig.entry) > 0;
  const sigOpen = useSig && sig.status === 'open' && !sig.intraday_hit;
  const st = { side, amount: D.EXAMPLE_DEP[c] || presets[1], lev: 1, sl: useSig ? sig.stop : round(q.p * (1 - 0.03 * dir)), tp: useSig ? sig.target : round(q.p * (1 + 0.06 * dir)), risk: null,
    type: (opt.mode ? opt.mode === 'limit' : sigLim) || !open ? 'lim' : 'mkt', limit: useSig ? sig.entry : round(q.p * (1 - 0.01 * dir)), valid: sigOpen ? 'sig' : 'day' };
  const isLim = () => st.type === 'lim';
  const basePx = () => (isLim() && st.limit > 0 ? st.limit : q.p);
  const fmtIn = (v) => (v == null ? '' : String(v));
  const validItems = () => [{ id: 'day', label: t('term.valid.day') }, { id: 'gtc', label: t('term.valid.gtc') }].concat(sigOpen ? [{ id: 'sig', label: t('term.valid.sig') }] : []);
  /* plain-language line about the limit: when it fills, how far, until when */
  const limLine = () => {
    if (!isLim()) return '';
    if (!(st.limit > 0)) return `<p class="tk-lim is-bad">${t('term.err.limit')}</p>`;
    if (W.marketable(side, st.limit, q.p)) return `<p class="tk-lim is-bad">${t(side === 'SELL' ? 'term.err.limitNowSell' : 'term.err.limitNowBuy')}</p>`;
    const d = limitDistance({ side, limit: st.limit }, q.p);
    const exp = W.expiryFor(st.valid, useSig ? sig : null);
    return `<p class="tk-lim">${icon('clock', 'icon-xs')}<span>${t(side === 'SELL' ? 'term.tkLimSell' : 'term.tkLimBuy', { v: pxOf(sym, st.limit), sym })} ${F.esc(d.text.charAt(0).toUpperCase() + d.text.slice(1))}. ${t('term.tkLimUntil', { d: F.dmTime(exp) })}</span></p>`;
  };
  const goText = () => (isLim() ? t('inv.confirmLim', { v: pxOf(sym, st.limit || 0) }) : t('inv.confirm'));
  const blocked = () => !isLim() && !open;
  /* leverage in money, live: what the deposit controls, what 1 % does, which move wipes the deposit */
  const levText = () => {
    const n = st.amount * st.lev;
    const ic = M.ccy(sym);
    const nx = ic !== c ? ` (≈ ${money(D.convert(n, c, ic, ctx.data), ic, 0)})` : '';
    const wipe = 100 / st.lev;
    return `<p class="lev-ex">${t('lev.ex', { a: money(st.amount, c), lev: st.lev, n: money(n, c) + nx, one: money(n / 100, c), m: `${side === 'SELL' ? '+' : '−'}${F.num(wipe, wipe % 1 ? 1 : 0)}` })}</p>
      ${st.lev >= 10 ? `<p class="lev-warn">${icon('alert', 'icon-xs')}<span>${t('lev.warn', { m: F.num(wipe, wipe % 1 ? 1 : 0) })}</span></p>` : ''}`;
  };
  const levSum = () => (st.lev === 1 ? t('lev.none') : t('lev.sumOn', { lev: st.lev, x: st.lev }));
  const costLine = () => {
    const k = W.costs({ sym, side, amount: st.amount, lev: st.lev, px: q.p, ccy: c });
    return `<p class="tk-cost">${qm('SPREAD')}<span>${t('tk.costs', { s: money(k.spread, c, k.spread < 10 && c !== 'CZK' ? 2 : 0) })}${k.swap > 0 ? ` · ${t('tk.swap', { v: money(k.swap, c, k.swap < 10 ? 2 : 0) })}` : ''}${k.conv ? ` · ${t('tk.conv', { ic: M.ccy(sym) })}` : ''}. ${t('tk.costsS')}</span></p>`;
  };
  const preview = () => {
    const o = W.outcome({ side: st.side, entry: basePx(), amount: st.amount, lev: st.lev, sl: st.sl, tp: st.tp });
    const k = W.costs({ sym, side, amount: st.amount, lev: st.lev, px: q.p, ccy: c });
    return `<div class="tk-out">
      <p><span>${t('inv.ifTarget')}</span><b class="num up">${o.atTarget != null ? smoney(o.atTarget, c) : '–'}</b></p>
      <p><span>${t('inv.ifStop')}</span><b class="num down">${o.atStop != null ? smoney(o.atStop, c) : '–'}</b></p>
      <p><span>${t('inv.fee')}</span><b class="num">~${money(k.spread, c, k.spread < 10 && c !== 'CZK' ? 2 : 0)}</b></p>
      ${isLim() ? `<p class="tk-small">${t('term.tkReserve', { a: money(st.amount, c) })}</p>` : ''}
    </div>${limLine()}`;
  };
  const body = () => `
    <div class="tk-side ${side === 'SELL' ? 'sell' : 'buy'}"><span>${t(side === 'SELL' ? 'term.tkSell' : 'term.tkBuy', { sym: F.esc(nameOf(sym, ctx.data)) })}</span><b class="num">${pxOf(sym, q.p)}</b></div>
    ${side === 'SELL' ? `<p class="tk-short">${t('tk.short')}</p>` : ''}
    ${useSig ? `<p class="tk-sig">${icon('signals', 'icon-xs')}${t('term.tkFromSig')}</p>` : ''}
    <p class="sheet-label">${t('inv.howMuch')}</p>
    <div class="chips tk-chips">${presets.map((v) => `<button type="button" class="chip" data-amt="${v}" aria-pressed="${st.risk == null && st.amount === v}">${money(v, c)}</button>`).join('')}</div>
    <label class="tk-in"><span>${t('inv.own', { c })}</span><input class="jin num" inputmode="decimal" data-in="amount" value="${fmtIn(st.amount)}"></label>
    <div id="tk-out">${preview()}</div>
    <details class="tk-adv"><summary>${t('inv.adv')}${icon('chev-down', 'icon-xs')}</summary>
    <p class="sheet-label">${t('inv.riskL')}</p>
    <div class="chips tk-chips">${CONFIG.CALC.RISK_PROFILES.map((p) => `<button type="button" class="chip" data-risk="${p.pct}" aria-pressed="${st.risk === p.pct}">${t('term.riskChip', { v: p.pct })}</button>`).join('')}</div>
    <details class="tk-lev" id="tk-lev">
      <summary class="lev-sum"><span id="tk-levsum">${levSum()}</span><span class="lev-ch">${t('lev.change')}${icon('chev-down', 'icon-xs')}</span></summary>
      <p class="sheet-label">${t('lev.title')}${qm('PAKA')}<small>${t('lev.max', { v: maxLev })}</small></p>
      <div class="lev-chips" role="radiogroup" aria-label="${t('lev.title')}">${levs.map((v) => `<button type="button" class="lev-chip" role="radio" data-lev="${v}" aria-checked="${st.lev === v}">1:${v}</button>`).join('')}</div>
      <div id="tk-levx">${levText()}</div>
      <p class="lev-eu">${t('lev.eu')}</p>
    </details>
    <p class="sheet-label">${t('term.otype')}${qm('LIMIT')}</p>
    <div class="tk-type" role="radiogroup" aria-label="${t('term.otype')}">${['mkt', 'lim'].map((id) => `<button type="button" class="tk-type-b" role="radio" data-otype="${id}" aria-checked="${st.type === id}"><b>${t(`term.otype.${id}`)}</b><small>${id === 'mkt' && !open ? t('term.otype.mktClosed') : t(`term.otype.${id}S`)}</small></button>`).join('')}</div>
    <div id="tk-limf" ${isLim() ? '' : 'hidden'}>
      <label class="tk-in"><span>${t('term.limitPx', { now: pxOf(sym, q.p) })}</span><input class="jin num" inputmode="decimal" data-in="limit" value="${fmtIn(st.limit)}"></label>
      <p class="sheet-label">${t('term.validity')}</p>
      ${seg({ name: 'tvalid', small: true, label: t('term.validity'), items: validItems(), active: st.valid })}
    </div>
    <div class="tk-2"><label class="tk-in"><span>${t('term.sl')}${qm('STOP')}</span><input class="jin num" inputmode="decimal" data-in="sl" value="${fmtIn(st.sl)}"></label>
      <label class="tk-in"><span>${t('term.tp')}${qm('CIL')}</span><input class="jin num" inputmode="decimal" data-in="tp" value="${fmtIn(st.tp)}"></label></div>
    <p class="why-s">${t('term.slS')}</p>
    ${costLine()}
    <details class="gloss tk-gloss"><summary>${t('term.whatLimit')}</summary><ul>${['LIMIT', 'PLATNOST', 'PAKA', 'MARZE', 'STOPOUT', 'SPREAD', 'SWAP'].map((k) => `<li>${F.esc(gloss(k))}</li>`).join('')}</ul></details>
    </details>
    <p class="tk-block" id="tk-block" ${blocked() ? '' : 'hidden'}>${icon('clock', 'icon-xs')}<span>${t('term.closedWhy', { h: F.esc(M.hours(sym)) })}</span></p>
    <button type="button" class="btn btn-primary btn-block tk-go" data-go ${blocked() ? 'disabled' : ''}>${goText()}</button>
    <p class="jnote" style="margin-top:10px">${t('term.fict')}</p>`;
  openSheet({
    small: true, label: t('term.ticket'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('term.ticket')}</p><p class="sheet-sub">${t('term.demo')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body" id="tk">${body()}</div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      const root = sh.querySelector('#tk');
      const upd = () => {
        root.querySelector('#tk-out').innerHTML = preview();
        root.querySelector('#tk-levx').innerHTML = levText();
        root.querySelector('#tk-levsum').textContent = levSum();
        const go = root.querySelector('[data-go]');
        go.textContent = goText();
        go.disabled = blocked();
        root.querySelector('#tk-block').hidden = !blocked();
        root.querySelectorAll('[data-amt]').forEach((b) => b.setAttribute('aria-pressed', String(st.risk == null && +b.dataset.amt === st.amount)));
        root.querySelectorAll('[data-risk]').forEach((b) => b.setAttribute('aria-pressed', String(st.risk === +b.dataset.risk)));
        root.querySelectorAll('[data-lev]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.lev === st.lev)));
      };
      const applyRisk = () => {
        if (st.risk == null) return;
        const a = W.amountForRisk(W.get(), { entry: basePx(), sl: st.sl, lev: st.lev, riskPct: st.risk });
        if (a) { st.amount = Math.min(a, Math.floor(sm.free)); root.querySelector('[data-in="amount"]').value = String(st.amount); }
      };
      root.addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-amt]'); const r = ev.target.closest('[data-risk]');
        const lv = ev.target.closest('[data-lev]');
        const ty = ev.target.closest('[data-otype]');
        const va = ev.target.closest('[data-seg-name="tvalid"]');
        if (ty) { st.type = ty.dataset.otype; root.querySelectorAll('[data-otype]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.otype === st.type))); root.querySelector('#tk-limf').hidden = !isLim(); applyRisk(); haptic(); upd(); }
        if (va) { ev.preventDefault(); ev.stopPropagation(); st.valid = va.dataset.id; segMove(root, 'tvalid', st.valid); haptic(); upd(); }
        if (a) { st.risk = null; st.amount = +a.dataset.amt; root.querySelector('[data-in="amount"]').value = String(st.amount); haptic(); upd(); }
        if (r) { st.risk = +r.dataset.risk; applyRisk(); haptic(); upd(); }
        if (lv) { st.lev = +lv.dataset.lev; applyRisk(); haptic(); upd(); }
        const goB = ev.target.closest('[data-go]');
        if (!goB || goB.disabled) return;
        if (isLim()) {
          const res = W.placeOrder(ctx.data, { sym, name: nameOf(sym, ctx.data), side, limit: st.limit, amount: st.amount, lev: st.lev, sl: st.sl, tp: st.tp, sigId: sigOpen ? sig.id : null, valid: st.valid, sig: useSig ? sig : null });
          if (!res.ok) { toast(t(`term.err.${res.reason}`)); return; }
          haptic(20);
          closeTopSheet();
          toast(t('inv.placedOk', { v: pxOf(sym, st.limit) }), { timeout: 7000 });
          document.dispatchEvent(new CustomEvent('pulse:wallet'));
          tab = 'ord';
          setTimeout(() => ctx.rerender({ soft: true }), 380);
          return;
        }
        const res = W.open(ctx.data, { sym, name: nameOf(sym, ctx.data), side, amount: st.amount, lev: st.lev, sl: st.sl, tp: st.tp, sigId: sig && sig.action === side && sig.status === 'open' && !sig.intraday_hit ? sig.id : null });
        if (!res.ok) { toast(t(`term.err.${res.reason}`, { h: M.hours(sym) })); return; }
        haptic(20);
        closeTopSheet();
        toast(t('inv.done'), { timeout: 7000 });
        document.dispatchEvent(new CustomEvent('pulse:wallet'));
        tab = 'pos';
        setTimeout(() => ctx.rerender({ soft: true }), 380);
      });
      root.addEventListener('input', (ev) => {
        const k = ev.target.dataset.in; if (!k) return;
        const v = F.parseNum(ev.target.value);
        if (k === 'amount') { st.risk = null; st.amount = v > 0 ? v : 0; }
        if (k === 'sl') { st.sl = v > 0 ? v : null; applyRisk(); }
        if (k === 'tp') st.tp = v > 0 ? v : null;
        if (k === 'limit') { st.limit = v > 0 ? v : null; applyRisk(); }
        upd();
      });
    },
  });
}

/* ---------- Instrument picker: tabs, search, live price, day change, delayed / closed, favourites ---------- */
const PTABS = ['fav', 'sig', 'indexy', 'meny', 'komodity', 'krypto', 'akcie', 'etf'];
let ptab = null;
const favs = () => { const f = store.get('favs', null); return Array.isArray(f) ? f : ['US500', 'XAUUSD', 'EURUSD', 'BTCUSD', 'AAPL']; };
function pickRow(sym, data, sigs) {
  const w = whatOf(sym, data);
  const q = W.priceOf(sym, data);
  const ch = q ? Live.dayChange(sym) : null;
  const open = M.isOpen(sym);
  const fav = favs().includes(sym);
  return `<div class="pick-row2" data-sym="${F.esc(sym)}" role="button" tabindex="0">
    ${monogram(sym, w.name)}
    <span class="pk-id"><b>${F.esc(w.name)}</b><small>${F.esc(sym)}${w.phrase ? ` · ${F.esc(w.phrase)}` : ''}</small>
      <span class="pk-tags">${sigs.includes(sym) ? `<span class="hz-tag is-preview">${t('term.hasSig')}</span>` : ''}${M.delayed(sym) ? `<span class="pk-tag">${t('term.delayedShort')}</span>` : ''}${open ? '' : `<span class="pk-tag is-closed" title="${F.esc(M.hours(sym))}">${t('term.closedShort', { h: F.esc(M.hours(sym)) })}</span>`}</span></span>
    <span class="pk-px num">${q ? pxOf(sym, q.p) : '–'}${ch != null ? `<small class="${ch >= 0 ? 'up' : 'down'}">${F.spct(ch, 2)}</small>` : ''}</span>
    <button type="button" class="pk-fav" data-fav="${F.esc(sym)}" aria-pressed="${fav}" aria-label="${t(fav ? 'term.favOff' : 'term.favOn')}">${icon('star', 'icon-sm')}</button>
  </div>`;
}
function pickKeys(tabId, data, sigs) {
  if (tabId === 'fav') return favs();
  if (tabId === 'sig') return sigs;
  const g = M.groups().find((x) => x.id === tabId);
  if (g) return g.items.map((x) => x.key);
  /* no instruments.json: shares and ETFs the app already knows */
  if (tabId === 'akcie') return ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'NFLX', 'AMD', 'JPM', 'V', 'KO', 'PLTR', 'COIN'];
  if (tabId === 'etf') return ['SPY', 'QQQ', 'DIA', 'GLD'];
  return [];
}
function picker(ctx) {
  const sigs = [...new Set(openSigs(ctx.data).map((s) => s.symbol))];
  const tabs = PTABS.filter((id) => ['fav', 'sig', 'akcie', 'etf'].includes(id) || M.groups().some((g) => g.id === id));
  if (!ptab || !tabs.includes(ptab)) ptab = M.ready() ? 'indexy' : 'sig';
  const all = () => [...new Set(Object.keys(M.ready() ? Object.fromEntries(M.groups().flatMap((g) => g.items.map((x) => [x.key, 1]))) : {}).concat(Object.keys(INSTR)))];
  const list = (qq) => {
    const q = qq.trim().toUpperCase();
    const keys = q ? all().filter((k) => M.searchText(k).includes(q)).sort((a, b) => (b === q) - (a === q) || (!!M.get(b)) - (!!M.get(a))).slice(0, 40) : pickKeys(ptab, ctx.data, sigs);
    return keys.map((k) => pickRow(k, ctx.data, sigs)).join('') || `<p class="quiet">${t(q ? 'term.noFound' : ptab === 'fav' ? 'term.noFav' : 'term.noFound')}</p>`;
  };
  openSheet({
    label: t('term.pick'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('term.pick')}</p><p class="sheet-sub">${t('term.pickS2')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><label class="pick-search">${icon('search', 'icon-sm')}<input class="jin pick-in" type="search" placeholder="${t('term.search2')}" aria-label="${t('term.search2')}"></label>
      <div class="pick-tabs" role="tablist">${tabs.map((id) => `<button type="button" class="pick-tab" role="tab" data-ptab="${id}" aria-selected="${id === ptab}">${t(`pick.${id}`)}</button>`).join('')}</div>
      <div class="pick-list" id="pick-list">${list('')}</div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      const inp = sh.querySelector('.pick-in');
      const redraw = () => { sh.querySelector('#pick-list').innerHTML = list(inp.value); };
      inp.addEventListener('input', redraw);
      sh.addEventListener('click', (ev) => {
        const fb = ev.target.closest('[data-fav]');
        if (fb) {
          ev.stopPropagation();
          const k = fb.dataset.fav; const f = favs();
          const on = !f.includes(k);
          store.set('favs', on ? [k, ...f] : f.filter((x) => x !== k));
          haptic(); toast(t(on ? 'term.favAdded' : 'term.favRemoved', { sym: k }));
          redraw(); return;
        }
        const tb = ev.target.closest('[data-ptab]');
        if (tb) { ptab = tb.dataset.ptab; inp.value = ''; sh.querySelectorAll('[data-ptab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ptab === ptab))); redraw(); return; }
        const b = ev.target.closest('[data-sym]'); if (!b) return;
        choose(ctx, b.dataset.sym); closeTopSheet();
      });
      sh.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('.pick-row2')) { ev.preventDefault(); ev.target.click(); } });
    },
  });
}

function choose(ctx, sym) {
  store.set('termSym', sym);
  autoTicketFor = ctx.params.get('s') || autoTicketFor;
  Live.onData();
  if (ctx.params.get('s') || ctx.params.get('k')) { (window.__pulseGo ? window.__pulseGo('#/terminal') : (location.hash = '#/terminal')); return; }
  ctx.rerender({ soft: true });
}

/* ---------- Nabít / Vybrat fictional money ---------- */
export function loadSheet(ctx, mode = 'dep') {
  const w = W.get();
  const c = w.ccy;
  const chips = (CONFIG.CALC.TOPUP || {})[c] || [10000, 50000, 100000, 500000];
  let m = mode, amt = chips[1];
  const free = () => Math.max(0, Math.floor(W.summary(ctx.data).free));
  const body = () => `
    ${seg({ name: 'wmode', small: true, label: t('u.acc.k'), items: [{ id: 'dep', label: t('u.acc.load') }, { id: 'wd', label: t('u.acc.wd') }], active: m })}
    <p class="ld-s">${m === 'dep' ? t('ld.depS') : t('ld.wdS', { v: money(free(), c) })}</p>
    <div class="chips tk-chips">${chips.map((v) => `<button type="button" class="chip" data-ld="${v}" aria-pressed="${v === amt}">${money(v, c)}</button>`).join('')}</div>
    <label class="tk-in"><span>${t('ld.own', { c })}</span><input class="jin num" inputmode="decimal" data-ldin value="${amt}"></label>
    <button type="button" class="btn btn-primary btn-block" data-ldgo style="margin-top:14px">${t(m === 'dep' ? 'ld.go' : 'ld.goWd', { v: money(amt || 0, c) })}</button>
    <p class="jnote" style="margin-top:10px">${t('ld.note')}</p>`;
  openSheet({
    small: true, label: t('ld.title'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('ld.title')}</p><p class="sheet-sub">${t('u.fict')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body" id="ld">${body()}</div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      const root = sh.querySelector('#ld');
      const draw = () => { root.innerHTML = body(); };
      root.addEventListener('click', (ev) => {
        const sg = ev.target.closest('[data-seg-name="wmode"]');
        if (sg) { ev.preventDefault(); ev.stopPropagation(); m = sg.dataset.id; draw(); return; }
        const ch = ev.target.closest('[data-ld]');
        if (ch) { amt = +ch.dataset.ld; draw(); return; }
        if (ev.target.closest('[data-ldgo]')) {
          const r = m === 'dep' ? W.deposit(amt) : W.withdraw(ctx.data, amt);
          if (!r.ok) { toast(t(`ld.err.${r.reason}`, { v: money(free(), c) })); return; }
          haptic(20); closeTopSheet();
          toast(t(m === 'dep' ? 'ld.done' : 'ld.doneWd', { v: money(amt, c) }));
          setTimeout(() => ctx.rerender({ soft: true }), 380);
        }
      });
      root.addEventListener('input', (ev) => {
        if (!ev.target.matches('[data-ldin]')) return;
        const v = F.parseNum(ev.target.value); amt = v > 0 ? Math.round(v) : 0;
        root.querySelector('[data-ldgo]').textContent = t(m === 'dep' ? 'ld.go' : 'ld.goWd', { v: money(amt || 0, c) });
        root.querySelectorAll('[data-ld]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ld === amt)));
      });
    },
  });
}

function resetSheet(ctx) {
  openSheet({
    small: true, label: t('term.reset'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('term.resetT')}</p><p class="sheet-sub">${t('term.resetS', { v: money(W.START[D.calcState().ccy], D.calcState().ccy) })}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><div class="btn-stack"><button type="button" class="btn btn-primary btn-block" data-yes>${t('term.resetYes')}</button><button type="button" class="btn btn-ghost" data-no>${t('term.resetNo')}</button></div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-no]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-yes]').addEventListener('click', () => { W.reset(); closeTopSheet(); toast(t('term.resetDone')); setTimeout(() => ctx.rerender({ soft: true }), 380); });
    },
  });
}

/* Zrušit: in-app confirmation (no window.confirm) */
function cancelSheet(ctx, id) {
  const o = W.get().orders.find((x) => x.id === id);
  if (!o) return;
  openSheet({
    small: true, label: t('term.ord.cancelT'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('term.ord.cancelT')}</p><p class="sheet-sub">${t('term.ord.cancelS', { side: F.SIDE[o.side], sym: F.esc(o.sym), v: pxOf(o.sym, o.limit), a: money(o.amount, W.get().ccy) })}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><div class="btn-stack"><button type="button" class="btn btn-primary btn-block" data-yes>${t('term.ord.cancelYes')}</button><button type="button" class="btn btn-ghost" data-no>${t('term.ord.cancelNo')}</button></div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-no]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-yes]').addEventListener('click', () => {
        const done = W.cancelOrder(id);
        closeTopSheet();
        if (done) toast(t('term.ord.cancelled', { sym: done.sym, a: money(done.amount, W.get().ccy) }));
        setTimeout(() => ctx.rerender({ soft: true }), 380);
      });
    },
  });
}

/* Upravit limit */
function editSheet(ctx, id) {
  const o = W.get().orders.find((x) => x.id === id);
  if (!o) return;
  const q = W.priceOf(o.sym, ctx.data);
  let v = o.limit;
  const line = () => {
    if (!(v > 0)) return `<p class="tk-lim is-bad">${t('term.err.limit')}</p>`;
    if (q && W.marketable(o.side, v, q.p)) return `<p class="tk-lim is-bad">${t(o.side === 'SELL' ? 'term.err.limitNowSell' : 'term.err.limitNowBuy')}</p>`;
    return `<p class="tk-lim">${icon('clock', 'icon-xs')}<span>${F.esc(limitDistance({ side: o.side, limit: v }, q?.p).text)}</span></p>`;
  };
  openSheet({
    small: true, label: t('term.ord.editT'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('term.ord.editT')}</p><p class="sheet-sub">${F.SIDE[o.side]} ${F.esc(o.sym)} · ${t('term.ord.now', { p: q ? pxOf(o.sym, q.p) : '–' })}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><label class="tk-in"><span>${t('term.limitPx', { now: q ? pxOf(o.sym, q.p) : '–' })}</span><input class="jin num" inputmode="decimal" data-lim value="${o.limit}"></label>
      <div id="ed-line">${line()}</div>
      <div class="btn-stack" style="margin-top:14px"><button type="button" class="btn btn-primary btn-block" data-yes>${t('term.ord.save')}</button><button type="button" class="btn btn-ghost" data-no>${t('term.resetNo')}</button></div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-no]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-lim]').addEventListener('input', (ev) => { v = F.parseNum(ev.target.value); sh.querySelector('#ed-line').innerHTML = line(); });
      sh.querySelector('[data-yes]').addEventListener('click', () => {
        const res = W.editOrder(ctx.data, id, v);
        if (!res.ok) { toast(t(`term.err.${res.reason}`)); return; }
        closeTopSheet();
        toast(t('term.ord.saved', { sym: o.sym, v: pxOf(o.sym, v) }));
        setTimeout(() => ctx.rerender({ soft: true }), 380);
      });
    },
  });
}

export const actions = {
  't-ocancel'(el, ev, ctx) { cancelSheet(ctx, el.dataset.id); },
  't-oedit'(el, ev, ctx) { editSheet(ctx, el.dataset.id); },
  't-ticket'(el, ev, ctx) { const { sym, sig } = currentSym(ctx); ticket(ctx, el.dataset.side, sym, sig); },
  't-pick'(el, ev, ctx) { picker(ctx); },
  't-sym'(el, ev, ctx) { choose(ctx, el.dataset.sym); },
  't-close'(el, ev, ctx) {
    const rec = W.close(ctx.data, el.dataset.id);
    if (rec) toast(t('term.closed', { sym: rec.sym, v: smoney(rec.pnl, W.get().ccy) }));
    ctx.rerender({ soft: true });
  },
  't-reset'(el, ev, ctx) { resetSheet(ctx); },
  't-cmode'(el, ev, ctx) {
    cmode = el.dataset.id;
    const root = document.getElementById('view');
    root.querySelectorAll('[data-action="t-cmode"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === cmode)));
    root.querySelector('#t-chart').hidden = cmode !== 'live';
    root.querySelector('#t-c1').hidden = cmode !== 'c1';
    const tv = root.querySelector('#t-tv'); tv.hidden = cmode !== 'tv';
    const sym = currentSym(ctx).sym;
    if (cmode === 'tv' && !tvOn) { tvOn = true; mountTV(tv, M.tvSym(sym) || tvSymbol(sym)); }
    if (cmode === 'live') chartRef && chartRef.refresh();
    if (cmode === 'c1') drawCandles(root.querySelector('#t-c1'), sym);
  },
  seg(el, ev, ctx) {
    if (el.dataset.segName !== 'ttab') return false;
    tab = el.dataset.id;
    const root = document.getElementById('view');
    segMove(root, 'ttab', tab);
    root.querySelector('#t-tab').innerHTML = tabBody(W.summary(ctx.data), ctx.data);
    return true;
  },
};
