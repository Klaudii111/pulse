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
import { icon, il, monogram, openSheet, closeTopSheet, toast, seg, segMove, haptic, groupInput } from '../ui.js';
import { priceChart } from '../charts.js';
import * as Bars from '../bars.js';
import * as P from '../portfolio.js';
import { mountTV, tvSymbol } from './detail.js';

let chartRef = null, liveOff = null, tvOn = false, autoTicketFor = null, stampTimer = null;
let tab = 'pos';
/* 1.13.3: ONE control row under the price – 1D 5D 1M 6M 1R + Svíčky / Čára (Bars.controls); "Živě" is the dot + "před X s"
   in the price block; the old Graf trhu / Živě / TradingView switch (a second "Svíčky" chip) is gone */
const cmode = 'bars';
let barsRef = null, barsDead = false; // 1.10.0: real history from /api/bars; dead = endpoint missing -> old ticks chart

const money = (v, ccy, dec = 0) => F.money(v, ccy, dec);
/* 1.15.0: an amount that rounds to zero is "±0 Kč", never "−0 Kč" (a 1 Kč trade) */
const smoney = (v, ccy, dec = 0) => (dec === 0 && Number.isFinite(v) && Math.abs(v) < 0.5 ? `±${F.money(0, ccy, 0)}` : (v > 0.5 ? '+' : '') + F.money(v, ccy, dec));
const tone = (v) => (v > 0.5 ? 'up' : v < -0.5 ? 'down' : 'flat');
/* price in the instrument's own decimals (EUR/USD 1,10940; US500 7 633,70) */
export const pxOf = (sym, v) => F.price(v, M.get(sym) ? M.decimals(sym, v) : null);
/* 1.13.0: KOUPIT shows the ask, PRODAT the bid (mid ± half of the simulated spread) */
/* 1.15.0: an index is quoted in points, never with a currency sign ("6 812,4", not "6 812,4 $") */
export const pxC = (sym, v) => (M.cls(sym) === 'index' ? pxOf(sym, v) : F.ccyWrap(pxOf(sym, v), M.ccy(sym)));
const sidePx = (sym, mid, side) => mid + (side === 'SELL' ? -1 : 1) * M.spread(sym, mid) / 2;

/* 1.13.9: only signals whose entry window is still open (D.entryOpen) are offered here (chips, quick buy, the ticket) */
function openSigs(data) { return D.allOpen(data).filter((s) => D.entryOpen(s)); }

function currentSym(ctx) {
  const sid = ctx.params.get('s');
  const sig = sid ? D.findSignal(ctx.data, sid) : null;
  if (sig) { store.set('termSym', sig.symbol); return { sym: sig.symbol, sig }; }
  const k = ctx.params.get('k');
  if (k && /^[A-Z0-9.-]{1,12}$/.test(k)) store.set('termSym', k);
  let sym = store.get('termSym', null);
  const sigs = openSigs(ctx.data);
  /* default without a signal: the S&P 500 (US500); 1.13.9: while the US market is closed a market that moves now
     (Bitcoin, 24/7) – the screen never opens on a frozen chart */
  if (!sym) sym = M.isOpen('US500') ? 'US500' : 'BTCUSD';
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
    <span class="wal-v num">${money(W.parts(sm).eq, sm.w.ccy, 0)}</span>
    <span class="wal-s num ${tone(sm.open)}">${t('term.openPnl', { v: smoney(sm.open, sm.w.ccy), n: sm.rows.length })}</span>
  </a>`;
}

/* 1.10.0 "where is my money": one big unmistakable line on top of Obchodovat */
/* 1.13.2 Obchodovat: the wallet as ONE compact line (the chart comes first); the full card lives in Peněženka */
export function bigAcc(sm) {
  const c = sm.w.ccy;
  return `<section class="wl-line" id="big-acc" aria-label="${F.esc(t('acc.big'))}">
    <a class="wl-line-l" href="#/penezenka">${icon('wallet', 'icon-xs')}<span class="wl-line-k">${t('acc.big')}</span><b class="num big-acc-v">${money(W.parts(sm).eq, c, 0)}</b><span class="num big-acc-row">${t('acc.free')} ${money(W.parts(sm).free, c, 0)}</span></a>
    <button type="button" class="btn btn-secondary btn-small" data-action="w-load">${t('wl.topupShort')}</button>
  </section>`;
}

function accBar(sm) {
  const c = sm.w.ccy;
  const lvl = sm.level != null ? `<p class="acc-lvl ${sm.call ? 'is-call' : ''}">${icon(sm.call ? 'alert' : 'shield', 'icon-xs')}<span>${sm.call ? t('term.call', { v: F.num(sm.level, 0) }) : t('term.level', { v: F.num(Math.min(sm.level, 99999), 0) })}</span></p>` : '';
  return `<div class="acc-bar" id="acc-bar">
    <div><p class="acc-l">${t('term.balance')}</p><p class="acc-v num">${money(sm.balance, c)}</p></div>
    <div><p class="acc-l">${t('term.equity')}</p><p class="acc-v num">${money(W.parts(sm).eq, c, 0)}</p></div>
    <div><p class="acc-l">${t('term.today')}</p>${sm.todayReady === false ? `<p class="acc-v dh-wait">${t('dh.todayWait')}</p>` : `<p class="acc-v num ${tone(sm.today)}">${smoney(sm.today, c)}</p>`}</div>
    <div><p class="acc-l">${t('term.free')}${qm('MARZE')}</p><p class="acc-v num">${money(W.parts(sm).free, c, 0)}</p></div>
  </div>
  <div class="acc-act">
    <span class="acc-tot num">${t('u.acc.putIn', { a: money(sm.putIn, c), r: `<b class="${tone(sm.total)}">${smoney(sm.total, c)} (${F.mpct(sm.totalPct, sm.total)})</b>` })}</span></div>
  ${lvl}${sm.reserved > 0 ? `<p class="acc-res">${icon('clock', 'icon-xs')}${t('term.reservedLine', { v: money(sm.reserved, c), n: sm.w.orders.length })}</p>` : ''}`;
}

/* 1.13.0 ONE trade row (Dnes, Zainvestováno, Obchodovat): full name, side + leverage + deposit, one status line
   ("Do cíle" only when there is a target), the result, and [Ukončit] */
export function tradeRow(p, c, extra = '') {
  const st = posStatus(p);
  const w = B.whatIs(p.sym, p.name);
  const toT = p.tp > 0 && p.px > 0 ? Math.abs(p.tp - p.px) / p.px * 100 : null;
  return `<div class="tr-row tone-${tone(p.pnl)}">
    <a class="tr-main" href="#/obchod/${F.esc(p.id)}" data-pid="${F.esc(p.id)}">
      ${monogram(p.sym, w.name)}
      <span class="tr-id"><b class="tr-n">${F.esc(w.name)}</b>
        <span class="tr-meta num">${t('tr.meta', { side: t(p.side === 'SELL' ? 'tr.sell' : 'tr.buy'), lev: p.lev || 1, a: money(p.margin, c) })}</span>
        <span class="tr-st tone-${st.tone}">${F.esc(st.text)}${toT != null && st.near !== 'target' ? ` · ${t('d.toTarget', { v: F.pct(toT, 1) })}` : ''}</span></span>
      <span class="tr-v num ${tone(p.pnl)}">${smoney(p.pnl, c, 0)}<small>${F.mpct(p.pnlPct, p.pnl)}</small></span>
      ${extra}
    </a>
    <button type="button" class="btn btn-secondary btn-small tr-x" data-action="pos-close" data-id="${p.id}">${t('tr.close')}</button>
  </div>`;
}
function posList(sm, data) {
  const c = sm.w.ccy;
  if (!sm.rows.length) return `<p class="quiet">${t('term.noPos')}</p>`;
  return `<div class="tp-list">${sm.rows.map((p) => tradeRow(p, c)).join('')}</div>`;
}

/* Same plain-language vocabulary as signals */
export function posStatus(p) {
  const near = (lvl) => lvl && Math.abs(p.px - lvl) / p.px * 100;
  const toS = near(p.sl), toT = near(p.tp);
  const prog = p.tp ? (p.px - p.entry) / (p.tp - p.entry) : 0;
  const progS = p.sl ? (p.px - p.entry) / (p.sl - p.entry) : 0;
  /* 1.15.0 (A16): with leverage the trade can end before the stop (P.facts endPx) - then the distance is to that end,
     in the trade page's words */
  let f = null; try { f = p.closedAt == null ? P.facts(p, { w: W.get() }) : null; } catch { f = null; }
  if (f && f.endPx != null && f.toEnd != null) {
    const progE = (p.px - p.entry) / (f.endPx - p.entry);
    if (progE >= D.NEAR_PROGRESS || f.toEnd <= D.proximityPct()) return { tone: 'down', text: `${t('st.nearEnd')} · ${t('pd.d.toEnd', { v: F.pct(f.toEnd, 1) })}` };
  } else if (p.sl && (progS >= D.NEAR_PROGRESS || toS <= D.proximityPct())) return { tone: 'down', text: `${t('st.nearStop')} · ${t('st.toStop', { v: F.pct(toS, 1) })}` };
  if (p.tp && (prog >= D.NEAR_PROGRESS || toT <= D.proximityPct())) return { tone: 'up', near: 'target', text: t('st.nearTarget', { v: F.pct(toT, 1) }) };
  /* leverage: how far the price may still go against me before the deposit is gone */
  if (p.lev > 1 && p.margin > 0) {
    const left = (p.margin + Math.min(0, p.pnl)) / p.notional * 100;
    if (p.pnl < 0 && left < 100 / p.lev * 0.4) return { tone: 'down', text: t('term.nearOut', { v: F.pct(left, 1) }) };
  }
  /* 1.13.1: "na nule" only when the money rounds to 0 (the same rounding as Historie) */
  if (Math.abs(p.pnl) < 0.5) return { tone: 'flat', text: t('st.flat') };
  return p.pnl > 0 ? { tone: 'up', text: t('st.win', { v: F.mpct(p.pnlPct, p.pnl) }) } : { tone: 'down', text: t('st.lose', { v: F.mpct(p.pnlPct, p.pnl) }) };
}

/* How far the price still has to go to the limit, in plain words */
export function limitDistance(o, px) {
  if (!(px > 0)) return { tone: 'flat', text: t('term.ord.noPx') };
  /* 1.13.1: an order waiting for the open says when it fills (Prague time of the instrument's next session) */
  if (o.atOpen && o.sym && !M.isOpen(o.sym)) { const op = M.nextOpen(o.sym); return { tone: 'up', text: t(o.side === 'SELL' ? 'term.ord.atOpenSell' : 'term.ord.atOpen', { d: op ? openWhen(op) : '' }) }; }
  const need = o.side === 'SELL' ? (o.limit - px) / px * 100 : (px - o.limit) / px * 100;
  if (need <= 0) return { tone: 'up', text: t('term.ord.at') };
  return { tone: need <= D.proximityPct() ? 'up' : 'gold', text: t(o.side === 'SELL' ? 'term.ord.up' : 'term.ord.down', { v: F.pct(need, need < 1 ? 2 : 1) }) };
}
/* 1.15.0 (A6 / K2-14): ONE statement - "platí do 12. 12. 10:15" (was "platí do zrušení · do 12. 12. 10:15") */
export const validText = (o) => (o.expiresAt ? t('tk.validUntil', { d: F.dmTime(o.expiresAt) }) : t('term.ord.valid', { k: t(`term.valid.${o.valid}`), d: '–' }));

/* "zítra 9:00" / "pondělí 15:30" (Prague time) */
export function openWhen(ms, now = Date.now()) {
  const days = F.daysUntil(new Date(ms), new Date(now));
  return `${days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(new Date(ms))} ${F.time(new Date(ms))}`;
}
const nmTk = (sym, name) => { const w = B.whatIs(sym, name); return `<b class="tp-n">${F.esc(w.name)}</b>${w.name !== sym ? `<span class="ticker tp-tk">${F.esc(sym)}</span>` : ''}`; };
/* One pending limit order (also used by Moje / Dnes) */
export function orderRow(o, data, { buttons = true } = {}) {
  const q = W.priceOf(o.sym, data);
  const dist = limitDistance(o, q?.p);
  const c = W.get().ccy;
  return `<div class="tp-row tp-ord ${buttons ? '' : 'is-static'}">
    <span class="tp-main">${monogram(o.sym, o.name)}
      <span class="tp-id"><span class="tp-t">${nmTk(o.sym, o.name)}<span class="side-tag ${o.side === 'SELL' ? 'sell' : ''}">${F.SIDE[o.side]}</span>${o.lev > 1 ? `<span class="hz-tag">${t('term.levTag', { v: o.lev })}</span>` : ''}</span>
        <span class="tp-m num">${t(o.atOpen ? 'term.ord.metaOpen' : 'term.ord.meta', { v: pxC(o.sym, o.limit), p: q ? pxC(o.sym, q.p) : '–', a: money(o.amount, c) })}</span>
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
    : `<p class="quiet has-il">${il('09_prazdno', 56)}<span>${t('term.ord.none')}</span></p>`;
  const help = `<p class="why-s ord-help">${t('term.ord.help')}</p>`;
  if (!rows.length) return lim + help + `<p class="sheet-label ord-sub">${t('term.ord.slTp')}</p><p class="quiet">${t('term.ord.noSlTp')}</p>`;
  return lim + help + `<p class="sheet-label ord-sub">${t('term.ord.slTp')}</p><div class="tp-list">${rows.map((p) => `<div class="tp-row is-static"><span class="tp-main">${monogram(p.sym, p.name)}
    <span class="tp-id"><span class="tp-t">${nmTk(p.sym, p.name)}<span class="side-tag ${p.side === 'SELL' ? 'sell' : ''}">${F.SIDE[p.side]}</span></span>
    <span class="tp-m num">${p.sl ? `<span class="down">${t('term.slAt', { v: pxOf(p.sym, p.sl) })}</span>` : ''}${p.sl && p.tp ? ' · ' : ''}${p.tp ? `<span class="up">${t('term.tpAt', { v: pxOf(p.sym, p.tp) })}</span>` : ''}</span>
    <span class="tp-m">${t('term.ordWait')}</span></span></span></div>`).join('')}</div>`;
}

function histOrder(o) {
  return `<div class="tp-row is-static tone-flat"><span class="tp-main">
    <span class="hist-bar"></span>
    <span class="tp-id"><span class="tp-t">${nmTk(o.sym, o.name)}<span class="side-tag ${o.side === 'SELL' ? 'sell' : ''}">${F.SIDE[o.side]}</span></span>
    <span class="tp-m num">${t('term.ord.histMeta', { v: pxOf(o.sym, o.limit), a: money(o.amount, W.get().ccy), d: F.dmTime(o.endAt) })}</span>
    <span class="tp-m">${t(o.side === 'SELL' && o.end === 'cancelled' ? 'term.ord.end.cancelledSell' : `term.ord.end.${o.end}`)}</span></span>
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
    <span class="tp-m num">${t('term.histMeta', { e: pxOf(p.sym, p.entry), x: pxOf(p.sym, p.exit), d: F.dmTime(p.closedAt) })}</span><span class="tp-m tp-open">${F.esc(B.myOpenText(p, c))}</span>${p.order ? `<span class="tp-m">${t(p.side === 'SELL' ? 'term.ord.fromLimitSell' : 'term.ord.fromLimit')}</span>` : ''}
    <span class="tp-m">${t(`term.why.${p.why}`, { sl: pxOf(p.sym, p.sl), x: pxOf(p.sym, p.exit) })}${p.fee > 0.5 ? ` · ${t('term.convFee', { v: money(p.fee, c) })}` : ''}</span></span>
    <span class="tp-v num ${tone(p.pnl)}">${smoney(p.pnl, c, 0)}<small>${F.mpct(p.pnlPct, p.pnl)}</small></span></span></div>`)).join('')}</div>`;
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
    ${ch != null ? `<p class="term-ch num ${ch >= 0 ? 'up' : 'down'}">${Live.dayChText(sym, ch)}</p>` : ''}
    <p class="live-stamp is-${st.code}"><i aria-hidden="true"></i>${F.esc(st.text)}</p>
` };
}

/* 1.13.9: markets that move right now (crypto 24/7, currencies + gold Mon–Fri) – offered when the chosen one is closed */
export const OPEN_PICKS = ['BTCUSD', 'ETHUSD', 'XAUUSD', 'EURUSD', 'DE40'];
function closedNote(sym, data) {
  if (M.isOpen(sym)) return '';
  const o = M.nextOpen(sym);
  const alt = OPEN_PICKS.filter((k) => k !== sym && M.isOpen(k)).slice(0, 3);
  return `<div class="mkt-closed" id="t-closed">${icon('clock', 'icon-xs')}<span><b>${t('mk.closedOpens', { d: o ? openWhen(o) : F.esc(M.hours(sym)) })}</b> ${t('mk.closedHow')}</span></div>
    ${alt.length ? `<div class="mk-open"><span class="why-s mk-open-l">${t('mk.openNow')}</span><div class="chips">${alt.map((k) => `<button type="button" class="chip" data-action="t-sym" data-sym="${F.esc(k)}"><i class="mk-dot" aria-hidden="true"></i>${F.esc(whatOf(k, data).name)}</button>`).join('')}</div></div>` : ''}`;
}
/* one honest status line per chart: "● živě · před 3 s" · "zpožděné ceny (~1 min)" · "Burza zavřená · otevře dnes 15:30" */
export function mktStamp(sym, data) {
  const q = W.priceOf(sym, data);
  if (!M.isOpen(sym)) { const o = M.nextOpen(sym); return { code: 'closed', text: t('mk.closedOpens', { d: o ? openWhen(o) : M.hours(sym) }) }; }
  let st = Live.stamp(q?.t || 0, Date.now(), true);
  if (st.code === 'live' && M.delayed(sym)) st = { code: 'stale', text: t('term.delayedLive', { s: Math.max(0, Math.round((Date.now() - q.t) / 1000)) }) };
  return st;
}

/* small "?" next to a trading word (opens one plain sentence + example) */
export const qm = (k) => `<button type="button" class="qm" data-action="term-help" data-k="${k}" aria-label="${t('th.ask')}">?</button>`;

const verifyUrl = (sym) => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(M.tvSym(sym) || tvSymbol(sym))}`;

/* ---------- 1.10.0 "Sledované grafy": several live charts at once (stored on this device) ----------
   Layout 1 / 2 / 4 (phone: a vertical list, desktop: 2 x 2). Each chart has its own timeframe. One SSE stream for all
   watched keys (live.js unions W.watched()). Tap a chart -> the full chart with KOUPIT / PRODAT. */
export const WATCH_DEFAULT = ['US500', 'XAUUSD', 'EURUSD', 'BTCUSD'];
export const watchList = () => { const w = store.get('watch', null); return Array.isArray(w) ? w.filter((x) => /^[A-Z0-9.-]{1,12}$/.test(x)).slice(0, 12) : WATCH_DEFAULT.slice(); };
const watchN = () => { const n = +store.get('watchN', 4); return [1, 2, 4].includes(n) ? n : 4; };
const termView = () => (store.get('termView', 'one') === 'watch' ? 'watch' : 'one');
function toggleWatch(sym) {
  const l = watchList();
  const on = !l.includes(sym);
  store.set('watch', on ? l.concat(sym).slice(0, 12) : l.filter((x) => x !== sym));
  Live.onData();
  return on;
}
const watchStar = (sym) => { const on = watchList().includes(sym); return `<button type="button" class="btn btn-ghost btn-small w-star ${on ? 'is-on' : ''}" data-action="w-watch" data-sym="${F.esc(sym)}" aria-pressed="${on}">${icon('star', 'icon-sm')}${t(on ? 'watch.on' : 'watch.add')}</button>`; };
function watchCard(sym, data, i) {
  const w = whatOf(sym, data);
  const q = W.priceOf(sym, data);
  const ch = q ? Live.dayChange(sym) : null;
  return `<article class="wc" data-wsym="${F.esc(sym)}">
    <div class="wc-head"><button type="button" class="wc-open" data-action="w-open" data-sym="${F.esc(sym)}">${monogram(sym, w.name)}<span class="wc-id"><b>${F.esc(w.name)}</b><span class="ticker">${F.esc(sym)}</span></span></button>
      <span class="wc-px"><b class="num" data-wpx>${q ? pxOf(sym, q.p) : '–'}</b><small class="num ${ch == null ? '' : ch >= 0 ? 'up' : 'down'}" data-wch>${ch == null ? '' : F.spct(ch, 2)}</small></span>
      <button type="button" class="icon-btn wc-x" data-action="w-watch" data-sym="${F.esc(sym)}" aria-label="${F.esc(t('watch.remove'))}">${icon('close', 'icon-xs')}</button></div>
    ${(() => { const st = mktStamp(sym, data); return `<p class="live-stamp wc-st is-${st.code}" data-wst><i aria-hidden="true"></i>${F.esc(st.text)}</p>`; })()}
    <div class="wc-chart" id="wc${i}">${Bars.controls(`wcb${i}`, { tfKey: `barsTf.w.${sym}`, compact: true })}</div>
  </article>`;
}
function watchView(ctx) {
  const l = watchList();
  /* 1.13.3: a phone (< 600 px) shows the charts as one vertical list – the 1 / 2 / 4 layout chips are desktop only.
     1.13.9: EVERY watched chart is on the screen at once (no "klepni = dát nahoru"); the chips only set how many side by side */
  const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 599px)').matches;
  const n = phone ? 4 : watchN();
  const shown = l, rest = [];
  return `<section class="watch">
    <div class="watch-top">${phone ? '' : `<div class="range-chips w-lays" role="group" aria-label="${F.esc(t('watch.layout'))}">${[1, 2, 4].map((k) => `<button type="button" class="range-chip w-lay${k > 1 ? ' w-lay-multi' : ''}" data-action="w-n" data-id="${k}" data-lay="${k}" aria-label="${F.esc(t('watch.layAria', { n: k }))}" aria-pressed="${k === n}">${icon(`lay${k}`, 'icon-xs')}<span aria-hidden="true">${t('watch.n', { n: k })}</span></button>`).join('')}</div>`}
      <button type="button" class="btn btn-secondary btn-small" data-action="w-add">${icon('plus-square', 'icon-sm')}${t('watch.addBtn')}</button></div>
    ${shown.length ? `<div class="watch-grid n${n}">${shown.map((s, i) => watchCard(s, ctx.data, i)).join('')}</div>` : `<p class="d-empty">${t('watch.empty')}</p>`}
    ${rest.length ? `<p class="watch-rest-l">${t('watch.rest')}</p><div class="chips">${rest.map((s) => `<button type="button" class="chip" data-action="w-front" data-sym="${F.esc(s)}">${F.esc(whatOf(s, ctx.data).name)}</button>`).join('')}</div>` : ''}
  </section>`;
}
let watchRefs = [];
function mountWatch(el, ctx) {
  watchRefs.forEach((r) => r.destroy()); watchRefs = [];
  el.querySelectorAll('.wc').forEach((card, i) => {
    const sym = card.dataset.wsym;
    const box = card.querySelector('.wc-chart');
    /* 1.11.2: candles like the big chart, same fallback (saved bars / the signal's prices / prices collected here) */
    watchRefs.push(Bars.mount(box, `wcb${i}`, sym, { fmt: (v) => pxOf(sym, v), tfKey: `barsTf.w.${sym}`, type: 'candle', path: () => (D.allOpen(ctx.data).find((x) => x.symbol === sym)?.price_path || []) }));
  });
}
function refreshWatch(el, ctx) {
  el.querySelectorAll('.wc').forEach((card) => {
    const sym = card.dataset.wsym;
    const q = W.priceOf(sym, ctx.data);
    const ch = q ? Live.dayChange(sym) : null;
    const p = card.querySelector('[data-wpx]'); if (p && q) p.textContent = pxOf(sym, q.p);
    const c = card.querySelector('[data-wch]'); if (c) { c.textContent = ch == null ? '' : F.spct(ch, 2); c.className = `num ${ch == null ? '' : ch >= 0 ? 'up' : 'down'}`; }
    if (p && q && p.dataset.last && p.dataset.last !== String(q.p) && !matchMedia('(prefers-reduced-motion: reduce)').matches) { p.classList.remove('flash-up', 'flash-down'); void p.offsetWidth; p.classList.add(q.p > +p.dataset.last ? 'flash-up' : 'flash-down'); }
    if (p && q) p.dataset.last = String(q.p);
  });
  stampWatch(el, ctx);
  watchRefs.forEach((r) => r.refresh());
}

function stampWatch(el, ctx) {
  el.querySelectorAll('.wc').forEach((card) => {
    const s = card.querySelector('[data-wst]'); if (!s) return;
    const st = mktStamp(card.dataset.wsym, ctx.data);
    s.className = `live-stamp wc-st is-${st.code}`; s.innerHTML = `<i aria-hidden="true"></i>${F.esc(st.text)}`;
  });
}

export function render(ctx) {
  const head = `<header class="page-head"><div><h1 class="page-title">${t('term.title')}</h1><p class="page-sub">${t('term.sub')}</p></div></header>`;
  /* 1.13.9: NO waiting for signals.json – the chart, the price (saved on the device) and the wallet paint at once;
     the signal parts appear when the data arrives (the screen used to stay empty until every data file had loaded) */
  const { sym, sig } = currentSym(ctx);
  const sm = W.summary(ctx.data);
  const pb = priceBlock(sym, ctx.data);
  const w = whatOf(sym, ctx.data);
  const sigs = openSigs(ctx.data);
  return head + `
  <div class="seg-wrap term-view">${seg({ name: 'tview', label: t('watch.view'), items: [{ id: 'one', label: t('watch.one') }, { id: 'watch', label: t('watch.title'), count: watchList().length }], active: termView() })}</div>
  ${termView() === 'watch' ? watchView(ctx) : ''}
  <div class="term-grid" ${termView() === 'watch' ? 'hidden' : ''}>
    <section class="term-main card">
      <div class="term-sym">
        <button type="button" class="term-pick" data-action="t-pick" aria-label="${t('term.pick')}">${monogram(sym, w.name)}<span><span class="term-nm">${F.esc(w.name)}</span><span class="term-name"><span class="ticker">${F.esc(sym)}</span>${w.phrase ? ` · ${F.esc(w.phrase)}` : ''}</span></span>${icon('chev-down', 'icon-sm')}</button>
        <div class="term-pxbox" id="t-px">${pb.html}</div>
      </div>
      <div class="term-btnrow"><button type="button" class="btn btn-secondary btn-small term-change" data-action="t-pick">${icon('search', 'icon-sm')}${t('term.change')}</button>${watchStar(sym)}</div>
      ${sig && D.entryOpen(sig) ? `<button type="button" class="term-sig" data-action="open-signal" data-id="${F.esc(sig.id)}">${icon('signals', 'icon-xs')}${t(sig.action === 'SELL' ? 'term.fromSigSell' : 'term.fromSig', { side: F.SIDE[sig.action], e: F.price(D.maxEntry(sig)), s: F.price(sig.stop), t: F.price(sig.target) })}</button>` : ''}
      <div id="t-mine">${mineChips(sym, sm)}</div>
      <div class="t-bars" id="t-bars" ${cmode === 'bars' ? '' : 'hidden'}>${Bars.controls('tb')}</div>
      <div class="pchart-box term-chart" id="t-chart" ${cmode === 'live' ? '' : 'hidden'}></div>
      <div class="pchart-box term-chart cndl-box" id="t-c1" ${cmode === 'c1' ? '' : 'hidden'}></div>
      <div class="tv-box" id="t-tv" ${cmode === 'tv' ? '' : 'hidden'}></div>
      <a class="link verify-link" href="${verifyUrl(sym)}" target="_blank" rel="noopener">${t('u.verify')}${icon('external', 'icon-xs')}</a>
      <div class="trade-btns" id="t-btns">
        <button type="button" class="trade-btn buy" data-action="t-ticket" data-side="BUY"><span>${t('term.buy')}</span><small class="tpx-l">${t('px.buyAt')}</small><b class="num" data-tpx="BUY">${pb.q ? pxOf(sym, sidePx(sym, pb.q.p, 'BUY')) : '–'}</b></button>
        <button type="button" class="trade-btn sell" data-action="t-ticket" data-side="SELL"><span>${t('term.sell')}</span><small class="tpx-l">${t('px.sellAt')}</small><b class="num" data-tpx="SELL">${pb.q ? pxOf(sym, sidePx(sym, pb.q.p, 'SELL')) : '–'}</b></button>
      </div>
      ${closedNote(sym, ctx.data)}
      <p class="trade-hint">${t('term.hint2', { lev: M.maxLev(sym) })}</p>
    </section>
    <section class="term-side">
      ${bigAcc(sm)}
      <details class="acc-more"><summary>${t('acc.more')}${icon('chev-down', 'icon-xs')}</summary><div id="t-acc">${accBar(sm)}</div></details>
      <div class="seg-wrap">${seg({ name: 'ttab', small: true, label: t('term.tabs'), items: [{ id: 'pos', label: t('term.tab.pos'), count: sm.rows.length }, { id: 'ord', label: t('term.tab.ord'), count: sm.w.orders.length }, { id: 'hist', label: t('term.tab.hist'), count: histCount(sm) }], active: tab })}</div>
      <div id="t-tab">${tabBody(sm, ctx.data)}</div>
      ${sigs.length ? `<h2 class="section-title">${t('term.sigs')}</h2><div class="chips term-chips">${sigs.slice(0, 12).map((x) => `<button type="button" class="chip ${x.symbol === sym ? 'chip-gold' : ''}" data-action="t-sym" data-sym="${F.esc(x.symbol)}">${F.esc(x.symbol)}</button>`).join('')}</div>` : ''}
      <details class="gloss term-gloss"><summary>${t('term.words')}</summary><ul>${['PAKA', 'PAKAMT', 'MARZE', 'OBJEM', 'STOPOUT', 'SHORT', 'SPREAD', 'SWAP', 'MCALL', 'DELAY'].map((k) => `<li>${F.esc(gloss(k))}</li>`).join('')}</ul></details>
      <!-- 1.13.4: ONE compact MetaTrader 5 row (the help page has the download); "Začít znovu" lives in Peněženka -->
      <a class="mt5-row" href="#/mt5" id="mt5-row">${icon('external', 'icon-xs')}<span class="mt5-t">${t('mt5.row')}</span><small>${t('mt5.rowS')}</small>${icon('chev-right', 'icon-xs')}</a>
    </section>
  </div>
  <p class="disclaimer">${icon('info')}${F.esc(t('term.disc'))}</p>`;
}

/* 1.15.0 my trades / waiting buys on this market: a chip that opens the trade detail (Portfolio), the line on the chart */
function mineChips(sym, sm) {
  const c = sm.w.ccy;
  const rows = sm.rows.filter((p) => p.sym === sym);
  const ords = (sm.w.orders || []).filter((o) => o.sym === sym);
  if (!rows.length && !ords.length) return '';
  return `<div class="pd-chips">${rows.map((p) => `<a class="pd-chip tone-${tone(p.pnl)}" href="#/obchod/${F.esc(p.id)}" data-pid="${F.esc(p.id)}">${icon('wallet', 'icon-xs')}<span>${t('pd.chip', { side: t(p.side === 'SELL' ? 'tr.sell' : 'tr.buy'), a: money(p.margin, c) })}</span><b class="num ${tone(p.pnl)}">${smoney(p.pnl, c)}</b>${icon('chev-right', 'icon-xs')}</a>`).join('')}${ords.map((o) => `<a class="pd-chip is-ord" href="#/obchod/${F.esc(o.id)}">${icon('clock', 'icon-xs')}<span>${t('pd.chipOrd', { v: pxC(o.sym, o.limit) })}</span>${icon('chev-right', 'icon-xs')}</a>`).join('')}</div>`;
}
function mineLevels(sym, data) {
  const sm = W.summary(data);
  const lv = [];
  /* every trade I hold on this market (two buys = two entry lines, each with its own stop / target) */
  sm.rows.filter((x) => x.sym === sym).forEach((p) => {
    if (p.tp > 0) lv.push({ v: p.tp, label: t('pd.lv.myTp'), cls: 'up' });
    lv.push({ v: p.entry, label: t('pd.lv.mine'), cls: 'ent' });
    if (p.sl > 0) lv.push({ v: p.sl, label: t('pd.lv.mySl'), cls: 'down' });
  });
  (sm.w.orders || []).filter((o) => o.sym === sym).slice(0, 1).forEach((o) => lv.push({ v: o.limit, label: t('pd.lv.limit'), cls: 'ent' }));
  return lv;
}
/* 1.15.0 Přikoupit (trade detail): the order ticket of the same market and direction, prefilled */
export function buyMore(ctx, p) {
  const sig = p.sigId ? D.findSignal(ctx.data, p.sigId) : null;
  ticket(ctx, p.side === 'SELL' ? 'SELL' : 'BUY', p.sym, sig && D.entryOpen(sig) ? sig : null);
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
  el.querySelectorAll('[data-tpx]').forEach((b) => { b.textContent = pb.q ? pxOf(sym, sidePx(sym, pb.q.p, b.dataset.tpx)) : '–'; });
  const tb = el.querySelector('#t-tab'); if (tb) tb.innerHTML = tabBody(sm, ctx.data);
  const segEl = el.querySelector('[data-seg="ttab"]');
  if (segEl) {
    const n = { pos: sm.rows.length, ord: sm.w.orders.length, hist: histCount(sm) };
    segEl.querySelectorAll('.seg-btn').forEach((b) => { const k = b.querySelector('.seg-count'); if (k && n[b.dataset.id] != null) k.textContent = String(n[b.dataset.id]); });
  }
  chartRef && chartRef.refresh && chartRef.refresh();
  if (cmode === 'c1') drawCandles(el.querySelector('#t-c1'), sym);
  if (cmode === 'bars') barsRef && barsRef.refresh();
  if (termView() === 'watch') refreshWatch(el, ctx);
  const mi = el.querySelector('#t-mine'); if (mi) { const h = mineChips(sym, sm); if (mi.innerHTML !== h) mi.innerHTML = h; }
  const ba = el.querySelector('#big-acc');
  if (ba) { const tmp = document.createElement('div'); tmp.innerHTML = bigAcc(sm); ['.big-acc-v', '.big-acc-row'].forEach((q) => { const a = ba.querySelector(q), b = tmp.querySelector(q); if (a && b && a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML; }); }
}

export function mount(el, ctx) {
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
  barsRef && barsRef.destroy(); barsRef = null;
  if (termView() === 'watch') mountWatch(el, ctx); else { watchRefs.forEach((r) => r.destroy()); watchRefs = []; }
  const tbars = el.querySelector('#t-bars');
  if (tbars && !barsDead) {
    /* 1.11.1: candles stay the chart even when /api/bars fails – Bars.mount falls back to saved bars / the signal's
       price_path / prices collected on the device, shows the last price and retries every 30 s */
    barsRef = Bars.mount(tbars, 'tb', sym, { fmt: (v) => pxOf(sym, v), levels: () => mineLevels(sym, ctx.data), marks: () => W.summary(ctx.data).rows.filter((p) => p.sym === sym).map((p) => ({ t: p.entryT || p.openedAt, v: p.entry, cls: 'me', label: t(p.side === 'SELL' ? 'pd.mk.sold' : 'pd.mk.bought') })), path: () => (D.allOpen(ctx.data).find((x) => x.symbol === sym)?.price_path || []) });
  }
  liveOff && liveOff();
  const fn = () => refresh(el, ctx);
  document.addEventListener('pulse:live', fn);
  clearInterval(stampTimer);
  stampTimer = setInterval(() => {
    if (!el.isConnected) { clearInterval(stampTimer); return; }
    const q = W.priceOf(sym, ctx.data); let st = Live.stamp(q?.t || 0, Date.now(), M.isOpen(sym));
    if (st.code === 'live' && M.delayed(sym)) st = { code: 'stale', text: t('term.delayedLive', { s: Math.max(0, Math.round((Date.now() - q.t) / 1000)) }) };
    const s = el.querySelector('#t-px .live-stamp'); if (s) { s.className = `live-stamp is-${st.code}`; s.innerHTML = `<i aria-hidden="true"></i>${F.esc(st.text)}`; }
    if (termView() === 'watch') stampWatch(el, ctx);
  }, 1000);
  liveOff = () => document.removeEventListener('pulse:live', fn);
  /* opened from a signal ("Zainvestovat nanečisto") -> the order ticket opens prefilled, once */
  const sid = ctx.params.get('s');
  if (sig && sid && autoTicketFor !== sid && D.entryOpen(sig)) { autoTicketFor = sid; setTimeout(() => ticket(ctx, sig.action, sym, sig), 250); }
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
    ${Math.abs(Y(hi) - Y(last.c)) >= 14 ? `<text x="${w - pad.r + 8}" y="${(Y(hi) + 4).toFixed(1)}" class="ck-ax">${F.esc(pxOf(sym, hi))}</text>` : ''}
    ${Math.abs(Y(lo) - Y(last.c)) >= 14 ? `<text x="${w - pad.r + 8}" y="${(Y(lo) + 4).toFixed(1)}" class="ck-ax">${F.esc(pxOf(sym, lo))}</text>` : ''}
    <text x="${pad.l}" y="${h - 4}" class="ck-ax">${F.esc(F.time(t0))}</text><text x="${w - pad.r}" y="${h - 4}" class="ck-ax" text-anchor="end">${F.esc(F.time(t1))}</text>
  </svg>`;
}

export function unmount() { liveOff && liveOff(); liveOff = null; chartRef && chartRef.destroy(); chartRef = null; barsRef && barsRef.destroy(); barsRef = null; watchRefs.forEach((r) => r.destroy()); watchRefs = []; clearInterval(stampTimer); }

/* ---------- Order ticket ---------- */
/* 1.9.1: the investment sheet opened right from a signal card (Dnes, Signály, detail, push "Zainvestovat") */
/* 1.15.1: an OWN demo trade with a prefilled direction / stop (the daily robot's "Koupit v demo") – never linked to a signal */
export function ownTicket(ctx, side, sym, opt = {}) { ticket(ctx, side === 'SELL' ? 'SELL' : 'BUY', sym, null, opt); }
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
  /* 1.10.0: four deposits from the minimum (100 Kč); the default = the example on the signal card (D.offerNums) */
  const minAmt = D.DEP_MIN[c] || 0;
  const BASE = { CZK: [1000, 5000, 10000], EUR: [40, 200, 400], USD: [50, 250, 500] }[c] || [minAmt * 10, minAmt * 50, minAmt * 100];
  const useSig = sig && sig.action === side && D.entryOpen(sig);
  const dir = side === 'SELL' ? -1 : 1;
  const maxLev = M.maxLev(sym);
  const levs = M.levSteps(maxLev);
  const dec = M.get(sym) ? M.decimals(sym, q.p) : (q.p < 10 ? 4 : 2);
  const round = (v) => +(+v).toFixed(dec);
  /* the robot's signals are LIMIT entries: price already past the entry (above it for a buy) -> wait for the entry price */
  /* 1.13.6 ONE rule with the card and the detail (D.maxEntry): price at / better than the max entry -> buy now (market
     open) or at the open (closed); only a price past it -> a limit order AT the max entry */
  const sigMx = useSig ? D.maxEntry(sig) : null;
  const sigLim = useSig && sigMx > 0 && dir * (q.p - sigMx) > 0;
  const sigOpen = useSig;
  /* 1.13.9: "do konce signálu" for a waiting buy = until the entry window closes (D.entryWindowEnd), not the exit date */
  const sigW = useSig ? D.entrySig(sig) : null;
  /* 1.13.1: closed market without a signal -> the default is "Koupit při otevření" (a market order at the next open);
     a limit price only under Pokročilé */
  const st = { side, amount: 0, auto: true, prof: D.profId(), lev: levs.includes(B.selLev(sym)) ? B.selLev(sym) : 1, sl: useSig ? sig.stop : round(q.p * (1 - 0.03 * dir)), tp: useSig ? sig.target : round(q.p * (1 + 0.06 * dir)), risk: null,
    type: useSig ? (sigLim || !open ? 'lim' : 'mkt') : 'mkt', limit: useSig ? sigMx : round(q.p * (1 - 0.01 * dir)), valid: sigOpen ? 'sig' : 'day', ownOpen: false, exOpen: false, detOpen: false };
  /* 1.13.0 BLOCKER fix: the live price is already at / better than the signal's entry -> the default is a plain
     "Koupit hned za X" (market open) or "koupí se při otevření, nejvýš za X" (closed). Never an error on the default path. */
  /* 1.15.1: an own trade prefilled from outside (the experimental daily robot): its stop, no target (it exits at the close) */
  if (!useSig && opt.sl > 0) st.sl = round(opt.sl);
  if (!useSig && 'tp' in opt) st.tp = opt.tp > 0 ? round(opt.tp) : null;
  if (st.type === 'lim' && useSig && st.limit > 0 && W.marketable(side, st.limit, q.p) && open) st.type = 'mkt';
  const isLim = () => st.type === 'lim';
  const atOpen = () => isLim() && !open && st.limit > 0 && W.marketable(side, st.limit, q.p);
  /* market order while the market is closed = buy / sell at the next open (protected: at most 3 % worse than now) */
  const mktOpen = () => !isLim() && !open;
  const capPx = () => round(q.p * (1 + 0.03 * dir));
  const half = M.spread(sym, q.p) / 2;
  const fillPx = () => q.p + dir * half; // a buy pays the ask, a sell gets the bid
  /* 1.13.1: the price the deposit is sized from = the price the trade starts at (the ask / bid, or the limit) */
  const basePx = () => (isLim() && st.limit > 0 ? st.limit : fillPx());
  /* 1.13.1 ONE sizing: D.stakeFor with the leverage of this ticket and its start price – the same number as the card */
  const sizeSig = () => (useSig ? sig : { symbol: sym, action: side, entry: basePx(), stop: st.sl });
  /* 1.13.2: the profile of this ticket (risk + leverage) – starts at mine, a tap on a column changes it only here */
  const stakeAt = (lev) => D.stakeFor(sizeSig(), { prof: st.prof, lev, px: basePx() });
  /* P2-02: when the style's deposit is cut to the free money, remember both, so the ticket says it (pxLine) */
  const resize = () => {
    if (!st.auto) return;
    st.amount = stakeAt(st.lev); st.clamp = null;
    const fr = Math.max(0, Math.floor(W.summary(ctx.data).free));
    if (fr >= minAmt && st.amount > fr) { st.clamp = { want: st.amount, to: fr, own: false }; st.amount = fr; }
  };
  resize();
  const stake = st.amount;
  const presets = [...new Set([stake, ...BASE.filter((v) => Math.abs(v - stake) / stake > 0.2)])].sort((a, b) => a - b).slice(0, 4);
  const sess = () => { const o = M.nextOpen(sym); return { o, e: M.sessionEnd(sym) }; };
  /* 1.13.8: Stop / Cíl / limit in the instrument's price format like everywhere else ("7 390,80"), parsed back by F.parsePx */
  const fmtIn = (v) => (v == null || !(v > 0) ? '' : pxOf(sym, v));
  /* 1.13.3: the deposit is shown with spaces like the first-run amount ("7 507", "10 000") – also while typing */
  const amtIn = (v) => (v > 0 ? F.num(Math.round(v), 0) : '');
  const validItems = () => [{ id: 'day', label: t('term.valid.day') }, { id: 'gtc', label: t('term.valid.gtc') }].concat(sigOpen ? [{ id: 'sig', label: t('term.valid.sig') }] : []);
  /* plain-language line about the limit: when it fills, how far, until when */
  const limLine = () => {
    if (!isLim()) return '';
    if (!(st.limit > 0)) return `<p class="tk-lim is-bad">${t('term.err.limit')}</p>`;
    if (atOpen()) return `<p class="tk-lim">${icon('clock', 'icon-xs')}<span>${t(side === 'SELL' ? 'tk.atOpenSell' : 'tk.atOpen', { h: F.esc(M.hours(sym)), v: pxC(sym, st.limit) })}</span></p>`;
    if (W.marketable(side, st.limit, q.p)) return `<p class="tk-lim is-bad">${t(side === 'SELL' ? 'term.err.limitNowSell' : 'term.err.limitNowBuy')}</p>`;
    const d = limitDistance({ side, limit: st.limit }, q.p);
    const exp = W.expiryFor(st.valid, sigW);
    return `<p class="tk-lim">${icon('clock', 'icon-xs')}<span>${t(side === 'SELL' ? 'term.tkLimSell' : 'term.tkLimBuy', { v: pxOf(sym, st.limit), sym })} ${F.esc(d.text.charAt(0).toUpperCase() + d.text.slice(1))}. ${t('term.tkLimUntil', { d: F.dmTime(exp) })}</span></p>`;
  };
  /* 1.15.0 (A2): the main button carries the money that leaves my wallet ("Koupit za 6 000 Kč"); the price of one unit
     goes on the small line above it (pxLine). (A8): not enough free money -> the button becomes "Dobít peněženku". */
  const freeNow = () => Math.max(0, Math.floor(W.summary(ctx.data).free));
  const short = () => st.amount > 0 && st.amount > freeNow();
  const S = side === 'SELL' ? 'Sell' : '';
  const goText = () => {
    if (short()) return t('tk.topup');
    const a = st.amount > 0 ? money(st.amount, c) : '';
    const k = mktOpen() || atOpen() ? 'tk.goOpen' : isLim() ? 'tk.goLim' : 'tk.goNow';
    return a ? t(k + S, { a }) : t(k + S + '0');
  };
  const pxLine = () => {
    const when = sess().o ? openWhen(sess().o) : '';
    const v = mktOpen() ? t('tk.pxOpen' + S, { v: pxC(sym, capPx()), d: when })
      : atOpen() ? t('tk.pxOpen' + S, { v: pxC(sym, st.limit || 0), d: when })
      : isLim() ? t('tk.pxLim' + S, { v: pxC(sym, st.limit || 0) })
      : t('tk.pxNow', { v: pxC(sym, fillPx()) });
    const fr = short() ? `<span class="tk-short-m">${t('tk.freeShort', { v: money(freeNow(), c) })}</span>` : '';
    /* P2-02 / P1-02: the deposit was cut to the free money -> one small line (gone as soon as the amount changes) */
    const cl = !short() && st.clamp && st.clamp.to === st.amount && st.clamp.want > st.amount
      ? `<span class="tk-clamp-m">${t(st.clamp.own ? 'tk.clampOwn' : 'tk.clamp', { w: money(st.clamp.want, c), f: money(freeNow(), c), v: money(st.amount, c) })}</span>` : '';
    return `${fr}${cl}<span>${v}</span>`;
  };
  const blocked = () => false;
  /* the at-open line: when it buys, the protection and until when the order waits (the instrument's own session) */
  const openLine = () => {
    if (!mktOpen()) return '';
    const x = sess();
    return `<p class="tk-lim">${icon('clock', 'icon-xs')}<span>${t(side === 'SELL' ? 'tk.mktOpenSell' : 'tk.mktOpen', { d: x.o ? openWhen(x.o) : '–', v: pxC(sym, capPx()), e: F.dmTime(new Date(x.e)), h: F.esc(M.hours(sym)) })}</span></p>`;
  };
  const costLine = () => {
    const k = W.costs({ sym, side, amount: st.amount, lev: st.lev, px: q.p, ccy: c });
    return `<p class="tk-cost">${qm('SPREAD')}<span>${t('tk.costs', { s: money(k.spread, c, k.spread < 10 && c !== 'CZK' ? 2 : 0) })}${k.swap > 0 ? ` · ${t('tk.swap', { v: money(k.swap, c, k.swap < 10 ? 2 : 0) })}` : ''}${k.conv ? ` · ${t('tk.conv', { ic: M.ccy(sym) })}` : ''}. ${t('tk.costsS')}</span></p>`;
  };
  const preview = () => {
    const k = W.costs({ sym, side, amount: st.amount, lev: st.lev, px: q.p, ccy: c });
    /* 1.13.6: on top ONE money line + the profile switch (this sheet only); the profile table, "Příklady pák", the notes and
       the fee fold into "Podrobnosti ▾" (B.moneyBlock = the same numbers as the card and the detail) */
    const mm = { s: useSig ? sig : null, data: ctx.data, sym, side: st.side, amount: st.amount, ccy: c, base: basePx(), sl: st.sl, tp: st.tp,
      /* 1.13.9: the profile columns compare each profile with ITS deposit (1:20 = a quarter); a typed amount stays the same */
      amountFor: (col) => (st.auto ? D.stakeFor(sizeSig(), { prof: col.id, lev: col.lev, px: basePx() }) : st.amount) };
    return `<div class="tk-out">
      ${B.tkProfSwitch(sym, st.prof, st.lev, useSig ? sig.id : null)}
      ${B.tkMoneyLine({ ...mm, lev: st.lev, prof: st.prof })}
      ${st.amount > 0 && st.amount < minAmt ? `<p class="tk-small is-bad">${t('inv.min', { a: money(minAmt, c) })}</p>` : ''}
      <details class="tk-det"${st.detOpen ? ' open' : ''}><summary data-tkdet>${t('tk.details')}${icon('chev-down', 'icon-xs')}</summary>
      ${B.moneyBlock({ ...mm, depLine: true, ticket: { amount: st.amount, lev: st.lev, prof: st.prof, open: st.ownOpen, ro: !!useSig } })}
      ${B.levExamples({ ...mm, sel: st.lev, exOpen: st.exOpen, readonly: true })}
      <p class="tk-fee"><span>${t('inv.fee')}</span><b class="num">~${money(k.spread, c, k.spread < 10 && c !== 'CZK' ? 2 : 0)}</b></p>
      ${isLim() || mktOpen() ? `<p class="tk-small">${t('term.tkReserve', { a: money(st.amount, c) })}</p>` : ''}
      </details>
    </div>${limLine()}${openLine()}`;
  };
  const body = () => `
    <div class="tk-side ${side === 'SELL' ? 'sell' : 'buy'}"><span>${t(side === 'SELL' ? 'term.tkSell' : 'term.tkBuy', { sym: F.esc(nameOf(sym, ctx.data)) })}</span><b class="num" data-tkpx><small>${t('tk.pxHead')}</small> ${pxC(sym, fillPx())}</b></div>
    ${side === 'SELL' ? `<p class="tk-short">${t('tk.short')}</p>` : ''}
    ${useSig ? `<p class="tk-sig">${icon('signals', 'icon-xs')}${t('term.tkFromSig')}</p>` : ''}
    <p class="sheet-label">${t('inv.howMuch')}</p>
    <div class="chips tk-chips tk-pre${presets.map((v) => money(v, c)).join('').replace(/<[^>]+>/g, '').length > 34 ? ' is-2x2' : ''}">${presets.map((v) => `<button type="button" class="chip${v > freeNow() ? ' is-off' : ''}" data-amt="${v}" aria-disabled="${v > freeNow()}" aria-pressed="${st.risk == null && st.amount === v}">${money(v, c)}</button>`).join('')}</div>
    <label class="tk-in"><span>${t('inv.own', { c })}</span><input class="jin num" inputmode="numeric" autocomplete="off" data-in="amount" value="${amtIn(st.amount)}"></label>
    <div id="tk-out">${preview()}</div>
    <details class="tk-adv"><summary>${t('inv.adv')}${icon('chev-down', 'icon-xs')}</summary>
    <p class="sheet-label">${t('inv.riskL')}</p>
    <div class="chips tk-chips">${[1, 2, 5].map((v) => `<button type="button" class="chip" data-risk="${v}" aria-pressed="${st.risk === v}">${t('term.riskChip', { v })}</button>`).join('')}</div>
    <p class="sheet-label">${t('term.otype')}${qm('LIMIT')}</p>
    <div class="tk-type" role="radiogroup" aria-label="${t('term.otype')}">${['mkt', 'lim'].map((id) => `<button type="button" class="tk-type-b" role="radio" data-otype="${id}" aria-checked="${st.type === id}"><b>${t(id === 'mkt' && !open ? 'term.otype.mktOpen' : `term.otype.${id}`)}</b><small>${id === 'mkt' && !open ? t('term.otype.mktOpenS') : t(`term.otype.${id}S`)}</small></button>`).join('')}</div>
    <div id="tk-limf" ${isLim() ? '' : 'hidden'}>
      <label class="tk-in"><span>${t('term.limitPx', { now: pxOf(sym, q.p) })}</span><input class="jin num" inputmode="decimal" data-in="limit" value="${fmtIn(st.limit)}"></label>
      <p class="sheet-label">${t('term.validity')}</p>
      ${seg({ name: 'tvalid', small: true, label: t('term.validity'), items: validItems(), active: st.valid })}
    </div>
    <div class="tk-2"><label class="tk-in"><span>${t('term.sl')}${qm('STOP')}</span><input class="jin num" inputmode="decimal" data-in="sl" value="${fmtIn(st.sl)}"></label>
      <label class="tk-in"><span>${t('term.tp')}${qm('CIL')}</span><input class="jin num" inputmode="decimal" data-in="tp" value="${fmtIn(st.tp)}"></label></div>
    <p class="why-s">${t('term.slS')}</p>
    ${costLine()}
    <details class="gloss tk-gloss"><summary>${t('term.whatLimit')}</summary><ul>${['LIMIT', 'PLATNOST', 'PAKA', 'PAKAMT', 'MARZE', 'STOPOUT', 'SPREAD', 'SWAP'].map((k) => `<li>${F.esc(gloss(k))}</li>`).join('')}</ul></details>
    </details>
    <p class="risk-line">${t('risk.line')}</p>
    <div class="sheet-cta tk-cta">
    <p class="tk-block" id="tk-block" ${blocked() ? '' : 'hidden'}>${icon('clock', 'icon-xs')}<span>${t('term.closedWhy', { h: F.esc(M.hours(sym)) })}</span></p>
    <p class="tk-pxl num" data-pxl>${pxLine()}</p>
    <button type="button" class="btn btn-primary btn-block tk-go" data-go ${blocked() ? 'disabled' : ''}>${goText()}</button></div>`;
  openSheet({
    small: true, label: t('term.ticket'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('term.ticket')}</p><p class="sheet-sub">${t('term.demo')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body" id="tk">${body()}</div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      const root = sh.querySelector('#tk');
      /* 1.15.0 STYLES: a style chosen in "Vyber styl" (opened from this ticket's style row) = this ticket's deposit and leverage */
      const onStyle = () => {
        if (!root.isConnected) { document.removeEventListener('pulse:prof', onStyle); return; }
        st.prof = D.profId();
        const L = B.selLev(sym);
        st.lev = levs.includes(L) ? L : levs.filter((v) => v <= L).pop() || 1;
        st.auto = true; st.risk = null; resize(); upd();
      };
      document.addEventListener('pulse:prof', onStyle);
      /* A8: after "Dobít peněženku" the ticket below refreshes (button back to "Koupit za …") */
      const onWal = () => {
        if (!root.isConnected) { document.removeEventListener('pulse:wallet', onWal); return; }
        /* P1-02: after a top-up made from this ticket an amount above the free money becomes the free money (whole units) */
        if (st.topup && short()) {
          const fr = freeNow();
          if (fr >= minAmt) {
            if (st.auto) resize();
            else { st.clamp = { want: st.amount, to: fr, own: true }; st.amount = fr; }
            st.topup = false;
          }
        }
        upd();
      };
      document.addEventListener('pulse:wallet', onWal);
      const upd = () => {
        root.querySelector('#tk-out').innerHTML = preview();
        const go = root.querySelector('[data-go]');
        go.textContent = goText();
        const pl = root.querySelector('[data-pxl]'); if (pl) pl.innerHTML = pxLine();
        root.querySelectorAll('[data-amt]').forEach((b) => { const off = +b.dataset.amt > freeNow(); b.classList.toggle('is-off', off); b.setAttribute('aria-disabled', String(off)); });
        go.disabled = blocked();
        root.querySelector('#tk-block').hidden = !blocked();
        root.querySelectorAll('[data-amt]').forEach((b) => b.setAttribute('aria-pressed', String(st.risk == null && +b.dataset.amt === st.amount)));
        const ai = root.querySelector('[data-in="amount"]'); if (ai && document.activeElement !== ai) ai.value = amtIn(st.amount);
        root.querySelectorAll('[data-risk]').forEach((b) => b.setAttribute('aria-pressed', String(st.risk === +b.dataset.risk)));
      };
      const applyRisk = () => {
        if (st.risk == null) { resize(); return; }
        const a = W.amountForRisk(W.get(), { entry: basePx(), sl: st.sl, lev: st.lev, riskPct: st.risk });
        if (a) { st.amount = Math.min(a, Math.floor(sm.free)); root.querySelector('[data-in="amount"]').value = amtIn(st.amount); }
      };
      root.addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-amt]'); const r = ev.target.closest('[data-risk]');
        const lv = ev.target.closest('[data-lev]');
        const ty = ev.target.closest('[data-otype]');
        const va = ev.target.closest('[data-seg-name="tvalid"]');
        if (ty) { st.type = ty.dataset.otype; root.querySelectorAll('[data-otype]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.otype === st.type))); root.querySelector('#tk-limf').hidden = !isLim(); applyRisk(); haptic(); upd(); }
        if (va) { ev.preventDefault(); ev.stopPropagation(); st.valid = va.dataset.id; segMove(root, 'tvalid', st.valid); haptic(); upd(); }
        if (a && +a.dataset.amt > freeNow()) { haptic(); return; }
        if (a) { st.risk = null; st.auto = false; st.amount = +a.dataset.amt; root.querySelector('[data-in="amount"]').value = amtIn(st.amount); haptic(); upd(); }
        if (r) { st.risk = +r.dataset.risk; st.auto = false; applyRisk(); haptic(); upd(); }
        /* a one-off leverage for THIS ticket: never reaches the global profile handler */
        if (lv) {
          ev.stopPropagation();
          /* a profile column = that profile's risk and leverage (deposit re-sized); a broker chip = only the leverage */
          /* 1.13.5: the deposit stays (the typed one, or the one stake for all profiles) – the profile changes the leverage */
          if (lv.dataset.prof) st.prof = lv.dataset.prof;
          st.lev = +lv.dataset.lev; applyRisk(); haptic(); upd();
        }
        /* 1.11.2: the chip list and "Příklady pák" stay as the user left them when the sheet re-renders */
        if (ev.target.closest('[data-action="lev-own-open"]')) st.ownOpen = !st.ownOpen;
        const lx = ev.target.closest('[data-lx]'); if (lx) st.exOpen = !lx.parentElement.open;
        const dt = ev.target.closest('[data-tkdet]'); if (dt) st.detOpen = !dt.parentElement.open;
        const goB = ev.target.closest('[data-go]');
        if (!goB || goB.disabled) return;
        if (short()) { st.topup = true; loadSheet(ctx, 'dep'); return; }
        if (st.amount < minAmt) { toast(t('inv.min', { a: money(minAmt, c) })); return; }
        if (mktOpen()) {
          const res = W.placeOrder(ctx.data, { sym, name: nameOf(sym, ctx.data), side, limit: capPx(), amount: st.amount, lev: st.lev, sl: st.sl, tp: st.tp, sigId: sigOpen && useSig ? sig.id : null, valid: 'sess', sig: sigW, atOpen: true });
          if (!res.ok) { toast(t(`term.err.${res.reason}`)); return; }
          haptic(20);
          closeTopSheet();
          toast(t(side === 'SELL' ? 'inv.placedAtOpenSell' : 'inv.placedAtOpen', { d: sess().o ? openWhen(sess().o) : '' }), { timeout: 7000, action: { label: t('po.see'), fn: () => window.__pulseGo(`#/obchod/${res.order.id}`) } });
          document.dispatchEvent(new CustomEvent('pulse:wallet'));
          tab = 'ord';
          setTimeout(() => ctx.rerender({ soft: true }), 380);
          return;
        }
        if (isLim()) {
          const res = W.placeOrder(ctx.data, { sym, name: nameOf(sym, ctx.data), side, limit: st.limit, amount: st.amount, lev: st.lev, sl: st.sl, tp: st.tp, sigId: sigOpen ? sig.id : null, valid: st.valid, sig: sigW, atOpen: true });
          if (!res.ok) { toast(t(`term.err.${res.reason}`)); return; }
          haptic(20);
          closeTopSheet();
          toast(t((atOpen() ? 'inv.placedOpen' : 'inv.placedOk') + (side === 'SELL' ? 'Sell' : ''), { v: pxC(sym, st.limit) }), { timeout: 7000, action: { label: t('po.see'), fn: () => window.__pulseGo(`#/obchod/${res.order.id}`) } });
          document.dispatchEvent(new CustomEvent('pulse:wallet'));
          tab = 'ord';
          setTimeout(() => ctx.rerender({ soft: true }), 380);
          return;
        }
        /* 1.13.1: the promise holds at the moment of buying – an untouched deposit is re-sized from the newest price */
        const q2 = W.priceOf(sym, ctx.data);
        if (st.auto && q2 && q2.p > 0 && q2.p !== q.p) { q.p = q2.p; q.t = q2.t; resize(); }
        const res = W.open(ctx.data, { sym, name: nameOf(sym, ctx.data), side, amount: st.amount, lev: st.lev, sl: st.sl, tp: st.tp, sigId: useSig ? sig.id : null });
        if (!res.ok) { toast(t(`term.err.${res.reason}`, { h: M.hours(sym) })); return; }
        haptic(20);
        closeTopSheet();
        toast(t('inv.done'), { timeout: 7000, action: { label: t('po.see'), fn: () => window.__pulseGo(`#/obchod/${res.pos.id}`) } });
        document.dispatchEvent(new CustomEvent('pulse:wallet'));
        tab = 'pos';
        setTimeout(() => ctx.rerender({ soft: true }), 380);
      });
      root.addEventListener('input', (ev) => {
        const k = ev.target.dataset.in; if (!k) return;
        const v = k === 'amount' ? groupInput(ev.target) : F.parsePx(ev.target.value);
        if (k === 'amount') { st.risk = null; st.auto = false; st.amount = v > 0 ? v : 0; }
        if (k === 'sl') { st.sl = v > 0 ? v : null; applyRisk(); }
        if (k === 'tp') st.tp = v > 0 ? v : null;
        if (k === 'limit') { st.limit = v > 0 ? v : null; applyRisk(); }
        upd();
      });
      /* 1.13.8: leaving a price field shows it formatted ("7390.8" -> "7 390,80"); an unreadable text returns to the last valid price */
      root.addEventListener('change', (ev) => {
        const k = ev.target.dataset.in; if (!['sl', 'tp', 'limit'].includes(k)) return;
        ev.target.value = fmtIn(st[k]);
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
function picker(ctx, onPick = null) {
  const sigs = [...new Set(openSigs(ctx.data).map((s) => s.symbol))];
  const tabs = PTABS.filter((id) => ['fav', 'sig', 'akcie', 'etf'].includes(id) || M.groups().some((g) => g.id === id));
  if (!ptab || !tabs.includes(ptab)) ptab = M.groups().length ? 'indexy' : 'sig';
  const all = () => [...new Set(Object.keys(M.groups().length ? Object.fromEntries(M.groups().flatMap((g) => g.items.map((x) => [x.key, 1]))) : {}).concat(Object.keys(INSTR)))];
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
        if (onPick) { onPick(b.dataset.sym); closeTopSheet(); return; }
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
  /* 1.13.7 Vybrat: only what is free – the presets above it are off, the default is the biggest preset that fits (or all free) */
  const fits = (v) => m !== 'wd' || v <= free();
  const fitAmt = () => { if (m !== 'wd' || amt <= free()) return; const ok = chips.filter((v) => v <= free()); amt = ok.length ? ok[ok.length - 1] : free(); };
  if (m === 'wd') fitAmt();
  const body = () => `
    ${seg({ name: 'wmode', small: true, label: t('u.acc.k'), items: [{ id: 'dep', label: t('u.acc.load') }, { id: 'wd', label: t('u.acc.wd') }], active: m })}
    <p class="ld-s">${m === 'dep' ? t('ld.depS') : t('ld.wdS', { v: money(free(), c) })}</p>
    <div class="chips tk-chips">${m === 'wd'
    /* 1.15.0 (A14): Vybrat offers only what fits + "Vše" (all free money) - no disabled chips */
    ? chips.filter((v) => v <= free()).map((v) => `<button type="button" class="chip" data-ld="${v}" aria-pressed="${v === amt}">${money(v, c)}</button>`).join('')
      + (free() > 0 ? `<button type="button" class="chip" data-ld="${free()}" aria-pressed="${amt === free()}">${t('ld.all', { v: money(free(), c) })}</button>` : '')
    : chips.map((v) => `<button type="button" class="chip" data-ld="${v}" aria-pressed="${v === amt}">${money(v, c)}</button>`).join('')}</div>
    <label class="tk-in"><span>${t('ld.own', { c })}</span><input class="jin num" inputmode="numeric" autocomplete="off" data-ldin value="${amt > 0 ? F.num(amt, 0) : ''}"></label>
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
        if (sg) { ev.preventDefault(); ev.stopPropagation(); m = sg.dataset.id; fitAmt(); draw(); return; }
        const ch = ev.target.closest('[data-ld]');
        if (ch) { amt = +ch.dataset.ld; draw(); return; }
        if (ev.target.closest('[data-ldgo]')) {
          const r = m === 'dep' ? W.deposit(amt) : W.withdraw(ctx.data, amt);
          if (!r.ok) { toast(t(`ld.err.${r.reason}`, { v: money(free(), c) })); return; }
          haptic(20); closeTopSheet();
          toast(t(m === 'dep' ? 'ld.done' : 'ld.doneWd', { v: money(amt, c) }));
          document.dispatchEvent(new CustomEvent('pulse:wallet'));
          setTimeout(() => ctx.rerender({ soft: true }), 380);
        }
      });
      root.addEventListener('input', (ev) => {
        if (!ev.target.matches('[data-ldin]')) return;
        /* 1.13.7: grouped like the first-run amount and Dobít ("50 000") */
        const v = groupInput(ev.target); amt = v > 0 ? Math.round(v) : 0;
        root.querySelector('[data-ldgo]').textContent = t(m === 'dep' ? 'ld.go' : 'ld.goWd', { v: money(amt || 0, c) });
        root.querySelectorAll('[data-ld]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ld === amt)));
      });
    },
  });
}

export function resetSheet(ctx) {
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

/* 1.13.1: the opposite button with an open trade: close it (one tap, result in money) or open a new trade the other way */
function exitOrNew(ctx, side, sym, sig, mine) {
  const c = W.get().ccy;
  const nm = nameOf(sym, ctx.data);
  const sell = side === 'SELL';
  const rows = mine.map((p) => `<button type="button" class="btn btn-primary btn-block tk-exit" data-exit="${p.id}"><span>${t(sell ? 'ex.sellMine' : 'ex.buyMine', { n: F.esc(nm) })}</span><b class="num">${smoney(p.pnl, c)}</b></button>
    <p class="ex-meta num">${t('tr.meta', { side: t(p.side === 'SELL' ? 'tr.sell' : 'tr.buy'), lev: p.lev || 1, a: money(p.margin, c) })}</p>`).join('');
  openSheet({
    small: true, label: t(sell ? 'ex.titleSell' : 'ex.titleBuy', { n: nm }),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t(sell ? 'ex.titleSell' : 'ex.titleBuy', { n: F.esc(nm) })}</p><p class="sheet-sub">${t('term.demo')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><p class="ex-s">${t(sell ? 'ex.sSell' : 'ex.sBuy', { n: F.esc(nm) })}</p>${rows}
      <button type="button" class="btn btn-secondary btn-block tk-new" data-new>${icon(sell ? 'down' : 'up', 'icon-sm')}${t(sell ? 'ex.short' : 'ex.long')}</button>
      <p class="ex-s2">${t(sell ? 'ex.shortS' : 'ex.longS')}</p></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-new]').addEventListener('click', () => { closeTopSheet(); setTimeout(() => ticket(ctx, side, sym, sig), 380); });
      sh.querySelectorAll('[data-exit]').forEach((b) => b.addEventListener('click', () => {
        const rec = W.close(ctx.data, b.dataset.exit);
        closeTopSheet();
        if (rec) toast(t('term.closed', { sym: B.whatIs(rec.sym, rec.name).name, v: smoney(rec.pnl, c) }));
        document.dispatchEvent(new CustomEvent('pulse:wallet'));
        setTimeout(() => ctx.rerender({ soft: true }), 380);
      }));
    },
  });
}

/* 1.13.1 [Ukončit]: one confirm step with the result in money (Dnes, Zainvestováno, Obchodovat) */
export function closeConfirm(ctx, id) {
  const sm = W.summary(ctx.data);
  const p = sm.rows.find((x) => x.id === id);
  if (!p) return;
  const c = sm.w.ccy;
  const nm = B.whatIs(p.sym, p.name).name;
  /* P2-03: the numbers the wallet will really book (after the 0.5 % conversion fee), the same math as closeIn */
  const cr = W.closeResult(sm.w, p, p.px);
  const net = cr.net;
  const tn = net > 0.5 ? 'up' : net < -0.5 ? 'down' : '';
  openSheet({
    small: true, label: t('cf.title', { n: nm }),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('cf.title', { n: F.esc(nm) })}</p><p class="sheet-sub">${t('tr.meta', { side: t(p.side === 'SELL' ? 'tr.sell' : 'tr.buy'), lev: p.lev || 1, a: money(p.margin, c) })}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><p class="cf-res">${t('cf.now')} <b class="num ${tn}">${smoney(net, c)}</b> <small class="num ${tn}">(${F.mpct((net / p.margin) * 100, net)})</small></p>
      ${cr.fee >= 0.5 ? `<p class="ex-s cf-fee">${t('cf.fee', { v: money(cr.fee, c) })}</p>` : ''}
      <p class="ex-s">${t('cf.s', { a: money(Math.max(0, p.margin + net), c) })}</p>
      <div class="btn-stack"><button type="button" class="btn btn-primary btn-block" data-yes>${t('cf.yes', { v: smoney(net, c) })}</button><button type="button" class="btn btn-ghost" data-no>${t('cf.no')}</button></div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-no]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-yes]').addEventListener('click', () => {
        const rec = W.close(ctx.data, id);
        closeTopSheet();
        if (rec) toast(t('term.closed', { sym: B.whatIs(rec.sym, rec.name).name, v: smoney(rec.pnl, c) }));
        document.dispatchEvent(new CustomEvent('pulse:wallet'));
        setTimeout(() => ctx.rerender({ soft: true }), 380);
      });
    },
  });
}

/* Zrušit: in-app confirmation (no window.confirm) */
function cancelSheet(ctx, id) {
  const o = W.get().orders.find((x) => x.id === id);
  if (!o) return;
  openSheet({
    small: true, label: t(o.side === 'SELL' ? 'term.ord.cancelTSell' : 'term.ord.cancelT'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t(o.side === 'SELL' ? 'term.ord.cancelTSell' : 'term.ord.cancelT')}</p><p class="sheet-sub">${t('term.ord.cancelS', { side: F.SIDE[o.side], sym: F.esc(o.sym), v: pxOf(o.sym, o.limit), a: money(o.amount, W.get().ccy) })}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><div class="btn-stack"><button type="button" class="btn btn-primary btn-block" data-yes>${t('term.ord.cancelYes')}</button><button type="button" class="btn btn-ghost" data-no>${t('term.ord.cancelNo')}</button></div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-no]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-yes]').addEventListener('click', () => {
        const done = W.cancelOrder(id);
        closeTopSheet();
        /* 1.15.0 (A9 / K3-04): cancelled from the order's own page -> Portfolio, tab "Čekající" (the page itself no longer exists) */
        if (location.hash.startsWith(`#/obchod/${id}`)) {
          store.set('pfMode', 'mine'); store.set('pfTab', 'wait');
          setTimeout(() => { window.__pulseGo('#/portfolio', { replace: true }); if (done) toast(t('term.ord.cancelled', { sym: B.whatIs(done.sym, done.name).name, a: money(done.amount, W.get().ccy) })); }, 400);
          return;
        }
        if (done) toast(t('term.ord.cancelled', { sym: B.whatIs(done.sym, done.name).name, a: money(done.amount, W.get().ccy) }));
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
    small: true, label: t(o.side === 'SELL' ? 'term.ord.editTSell' : 'term.ord.editT'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t(o.side === 'SELL' ? 'term.ord.editTSell' : 'term.ord.editT')}</p><p class="sheet-sub">${F.SIDE[o.side]} ${F.esc(o.sym)} · ${t('term.ord.now', { p: q ? pxOf(o.sym, q.p) : '–' })}</p></div>
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
  't-ticket'(el, ev, ctx) {
    const { sym, sig } = currentSym(ctx);
    const side = el.dataset.side;
    /* 1.13.1: I hold Bitcoin and press PRODAT -> first "Prodat můj Bitcoin (ukončit obchod)"; a short is the second choice */
    const mine = W.summary(ctx.data).rows.filter((p) => p.sym === sym && p.side !== side);
    if (mine.length) { exitOrNew(ctx, side, sym, sig, mine); return; }
    ticket(ctx, side, sym, sig);
  },
  't-pick'(el, ev, ctx) { picker(ctx); },
  'w-watch'(el, ev, ctx) { const on = toggleWatch(el.dataset.sym); toast(t(on ? 'watch.added' : 'watch.removed')); ctx.rerender({ soft: true }); },
  'w-add'(el, ev, ctx) { picker(ctx, (sym) => { if (!watchList().includes(sym)) toggleWatch(sym); store.set('watch', [sym].concat(watchList().filter((x) => x !== sym))); setTimeout(() => ctx.rerender({ soft: true }), 380); }); },
  'w-n'(el, ev, ctx) { store.set('watchN', +el.dataset.id); ctx.rerender({ soft: true }); },
  'w-front'(el, ev, ctx) { store.set('watch', [el.dataset.sym].concat(watchList().filter((x) => x !== el.dataset.sym))); ctx.rerender({ soft: true }); },
  'w-open'(el, ev, ctx) { store.set('termView', 'one'); choose(ctx, el.dataset.sym); },
  't-sym'(el, ev, ctx) { choose(ctx, el.dataset.sym); },
  't-close'(el, ev, ctx) { closeConfirm(ctx, el.dataset.id); },
  't-reset'(el, ev, ctx) { resetSheet(ctx); },
  seg(el, ev, ctx) {
    if (el.dataset.segName === 'tview') { store.set('termView', el.dataset.id); ctx.rerender({ soft: true }); return true; }
    if (el.dataset.segName !== 'ttab') return false;
    tab = el.dataset.id;
    const root = document.getElementById('view');
    segMove(root, 'ttab', tab);
    root.querySelector('#t-tab').innerHTML = tabBody(W.summary(ctx.data), ctx.data);
    return true;
  },
};
