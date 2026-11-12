// Robot's paper account (Alpaca Paper, fictional $100,000): ./data/paper.json written by the server (1.6.0).
// Missing file -> everything here renders '' (section hidden).
import * as F from '../format.js';
import * as B from '../brief.js';
import * as D from '../domain.js';
import { t, tag } from '../i18n/index.js';
import * as W from '../wallet.js';
import { icon, monogram, sparkline } from '../ui.js';

const ok = (p) => p && p.account && Number.isFinite(+p.account.equity);
const usd = (v, dec) => F.money(v, 'USD', dec ?? (Math.abs(v) >= 1000 ? 0 : 2));
const tone = (v) => (v > 0.0001 ? 'up' : v < -0.0001 ? 'down' : 'flat');
const sideTxt = (s) => t(s === 'short' || s === 'sell' ? 'pa.short' : 'pa.long');

/* 1.13.0: the robot's money in the user's currency first, dollars small next to it ("2 104 000 Kč · 100 338 $") */
const mineCcy = () => { const c = D.walletCcy(); return c === 'USD' ? null : c; };
function kc(v, data, sign = false) {
  const c = mineCcy();
  const x = c ? D.convert(v, 'USD', c, data) : v;
  const txt = F.money(Math.abs(x), c || 'USD', 0);
  return sign ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${txt}` : txt;
}
const dual = (v, data, sign = false) => (mineCcy() ? `${kc(v, data, sign)} <small class="pa-usd">${sign && v > 0 ? '+' : ''}${usd(v, 0)}</small>` : `${sign && v > 0 ? '+' : ''}${usd(v, 0)}`);

/* The paper account's equity: live P&L of positions is already in equity from the server */
function eq(p) { return +p.account.equity; }

/* 1.9.1: "100 338 $ ≈ 2,2 mil. Kč" – the robot's dollars also in the user's currency (live FX, else config) */
function inMine(v, data) {
  const ccy = D.walletCcy();
  if (ccy === 'USD' || !(v > 0)) return '';
  const x = D.convert(v, 'USD', ccy, data);
  let txt;
  try { txt = new Intl.NumberFormat(tag(), { style: 'currency', currency: ccy, notation: 'compact', maximumFractionDigits: 1 }).format(x); } catch { txt = F.money(x, ccy, 0); }
  return `<span class="pa-mine num">≈ ${F.esc(txt)}</span>`;
}

/* the robot's exit legs (bracket order: take-profit limit + stop) belong to their position, not to "orders" */
const isLeg = (o, pos) => !o.signal_id && pos.some((x) => x.symbol === o.symbol && ((x.side === 'long' && o.side === 'sell') || (x.side === 'short' && o.side === 'buy')));
function legsOf(x, p, sig) {
  const legs = (p.orders || []).filter((o) => o.symbol === x.symbol && isLeg(o, [x]));
  const tp = legs.find((o) => o.limit != null && o.stop == null)?.limit ?? sig?.target ?? null;
  const sl = legs.find((o) => o.stop != null)?.stop ?? sig?.stop ?? null;
  return { tp: tp != null ? +tp : null, sl: sl != null ? +sl : null };
}

function modeBadge(p) {
  return p.mode === 'dry'
    ? `<span class="pa-mode is-dry">${icon('clock', 'icon-xs')}${t('pa.dry')}</span>`
    : `<span class="pa-mode is-on"><i aria-hidden="true"></i>${t('pa.on')}</span>`;
}

/* Hero card on Dnes */
export function paperHero(ctx) {
  const p = ctx.data?.paper;
  if (!ok(p)) return '';
  const a = p.account;
  const pnl = +a.pnl_usd || (eq(p) - (+a.start_equity || 100000));
  const pct = a.pnl_pct != null && Number.isFinite(+a.pnl_pct) ? +a.pnl_pct : (pnl / (+a.start_equity || 100000)) * 100;
  const pos = p.positions || [];
  return `<a class="pa-hero tone-${tone(pnl)}" href="#/robot">
    <span class="pa-glow" aria-hidden="true"></span>
    <span class="pa-top"><span class="pa-k">${icon('shield', 'icon-sm')}${t('pa.acc')}</span>${modeBadge(p)}</span>
    <span class="pa-vrow"><span class="pa-v num">${usd(eq(p), 0)}</span>${inMine(eq(p), ctx.data)}</span>
    <span class="pa-s"><b class="num ${tone(pnl)}">${F.spct(pct, 2)} · ${pnl >= 0 ? '+' : ''}${usd(pnl, 0)}</b> ${t('pa.heroS', { start: usd(+a.start_equity || 100000, 0) })}</span>
    <span class="pa-bigger">${icon('info', 'icon-xs')}${t('pa.bigger')}</span>
    <span class="pa-foot"><span>${t('pa.posN', { n: pos.length })}</span><span>${t('pa.ordN', { n: (p.orders || []).filter((o) => !isLeg(o, pos)).length })}</span><span class="pa-more">${t('pa.more')}${icon('chev-right', 'icon-xs')}</span></span>
  </a>`;
}

function posRow(x, data) {
  const sig = x.signal_id ? D.findSignal(data, x.signal_id) : null;
  const mt = D.moneyTone(+x.pnl_usd, 'USD', +x.pnl_pct);
  const attrs = sig ? `type="button" data-action="open-signal" data-id="${F.esc(sig.id)}"` : 'type="button" disabled';
  const w = B.whatIs(x.symbol, sig?.name || '');
  const lg = legsOf(x, data.paper, sig);
  const q = Math.abs(+x.qty), e = +x.avg_entry;
  const usdTxt = mt.zero ? mt.text.replace(/[\d\s ,.]+\s*(Kč|CZK|€|EUR)?/, ' 0 $') : `${+x.pnl_usd >= 0 ? '+' : ''}${usd(+x.pnl_usd, 0)}`;
  return `<button class="pa-row" ${attrs}>
    ${monogram(x.symbol, B.whatIs(x.symbol).name)}
    <span class="pa-id"><span class="pa-sym">${F.esc(w.name)}${w.name !== x.symbol ? ` <span class="ticker">${F.esc(x.symbol)}</span>` : ''}</span>
      <span class="pa-meta num">${t('pa.qty2', { q: F.num(q, 0), e: F.price(e), v: usd(q * e, 0) })}</span>
      ${lg.tp != null ? `<span class="pa-leg num up">${t(x.side === 'short' ? 'pa.legTpS' : 'pa.legTp', { v: F.price(lg.tp) })}</span>` : ''}
      ${lg.sl != null ? `<span class="pa-leg num down">${t(x.side === 'short' ? 'pa.legSlS' : 'pa.legSl', { v: F.price(lg.sl) })}</span>` : ''}</span>
    <span class="pa-r num ${mt.tone}">${mt.zero ? t('pa.zero') : kc(+x.pnl_usd, data, true)}<small>${mt.zero ? '' : `${usdTxt} · ${F.spct(+x.pnl_pct, 2)}`}</small></span>
  </button>`;
}

function orderRow(o) {
  const w = B.whatIs(o.symbol, '');
  const buy = o.side === 'buy';
  return `<div class="pa-row is-static">
    ${monogram(o.symbol, B.whatIs(o.symbol).name)}
    <span class="pa-id"><span class="pa-sym">${F.esc(w.name)}${w.name !== o.symbol ? ` <span class="ticker">${F.esc(o.symbol)}</span>` : ''}</span>
      <span class="pa-meta num">${t(buy ? 'pa.ordBuy' : 'pa.ordSell', { v: F.price(+o.limit) })}</span>
      ${o.take != null || o.stop != null ? `<span class="pa-meta num">${t('pa.ordThen', { t: o.take != null ? F.price(+o.take) : '–', s: o.stop != null ? F.price(+o.stop) : '–' })}</span>` : ''}</span>
    <span class="pa-r"><small>${o.submitted_at ? F.dmTime(o.submitted_at) : ''}</small></span>
  </div>`;
}

function closedRow(c, data) {
  const sig = c.signal_id ? D.findSignal(data, c.signal_id) : null;
  const tn = tone(+c.pnl_usd);
  const attrs = sig ? `type="button" data-action="open-signal" data-id="${F.esc(sig.id)}"` : 'type="button" disabled';
  return `<button class="pa-row" ${attrs}>
    <span class="hist-bar ${tn === 'flat' ? '' : tn}"></span>
    <span class="pa-id"><span class="pa-sym">${F.esc(c.symbol)} <span class="side-tag ${c.side === 'short' ? 'sell' : ''}">${sideTxt(c.side)}</span></span>
      <span class="pa-meta num">${t('pa.closedMeta', { e: F.price(+c.entry), x: F.price(+c.exit), d: c.closed_at ? F.dm(c.closed_at) : '' })}</span></span>
    <span class="pa-r num ${tn}">${kc(+c.pnl_usd, data, true)}<small>${+c.pnl_usd >= 0 ? '+' : ''}${usd(+c.pnl_usd, 2)} · ${F.spct(+c.pnl_pct, 2)}</small></span>
  </button>`;
}

/* Full view: route #/robot */
export function render(ctx) {
  const p = ctx.data?.paper;
  const head = `<header class="page-head"><div><a class="back" href="#/vice">${icon('chev-left', 'icon-xs')}${t('nav.vice')}</a><h1 class="page-title">${t('pa.title')}</h1><p class="page-sub">${t('pa.sub')}</p></div></header>`;
  if (!ok(p)) return head + `<div class="empty"><h3>${t('pa.none.t')}</h3><p>${t('pa.none.s')}</p></div>`;
  const a = p.account;
  const start = +a.start_equity || 100000;
  const pnl = +a.pnl_usd || (eq(p) - start);
  const pct = a.pnl_pct != null && Number.isFinite(+a.pnl_pct) ? +a.pnl_pct : (pnl / start) * 100;
  const pos = p.positions || [], cl = p.closed || [], log = p.log || [];
  const ord = (p.orders || []).filter((o) => !isLeg(o, pos)); // exit legs are shown under their position
  const wins = cl.filter((c) => +c.pnl_usd > 0).length;
  const spark = cl.length > 1 ? sparkline([...cl].reverse().reduce((acc, c) => { acc.push((acc[acc.length - 1] ?? start) + (+c.pnl_usd || 0)); return acc; }, [start]), { w: 110, h: 34, cls: 'hero-spark' }) : '';
  return head + `
  <p class="headline">${pos.length ? t('pa.headline', { n: pos.length }) : t('pa.headline0')}</p>
  <section class="pa-big tone-${tone(pnl)}">
    <span class="aurora" aria-hidden="true"><i></i><i></i></span>
    <div class="pa-top"><span class="pa-k">${t('pa.acc')}</span>${modeBadge(p)}</div>
    <div class="hero-top"><p class="pa-v num">${dual(eq(p), ctx.data)}</p>${spark}</div>
    <p class="pa-broker">${t('pa.broker')}</p>
    <p class="pa-bigger">${icon('info', 'icon-xs')}${t('pa.bigger')}</p>
    <p class="pa-s"><b class="num ${tone(pnl)}">${F.spct(pct, 2)} · ${kc(pnl, ctx.data, true)}</b> ${t('pa.heroS', { start: kc(start, ctx.data) })}</p>
    <div class="pa-stats">
      <div><p class="tile-l">${t('pa.cash')}</p><p class="num">${kc(+a.cash, ctx.data)}</p></div>
      <div><p class="tile-l">${t('pa.bp')}</p><p class="num">${kc(+a.buying_power, ctx.data)}</p></div>
      <div><p class="tile-l">${t('pa.wins')}</p><p class="num">${cl.length ? `${wins} / ${cl.length}` : '–'}</p></div>
    </div>
    ${p.mode === 'dry' ? `<p class="pa-note">${icon('info', 'icon-xs')}${t('pa.dryS')}</p>` : ''}
  </section>
  <p class="honest">${icon('info', 'icon-xs')} ${t('pa.what')}</p>
  <h2 class="section-title">${t('pa.positions')}<small>${pos.length}</small></h2>
  ${pos.length ? `<div class="pa-list">${pos.map((x) => posRow(x, ctx.data)).join('')}</div>` : `<p class="quiet">${t('pa.noPos')}</p>`}
  <h2 class="section-title">${t('pa.orders')}<small>${ord.length}</small></h2>
  ${ord.length ? `<div class="pa-list">${ord.map(orderRow).join('')}</div>` : `<p class="quiet">${t('pa.noOrd')}</p>`}
  <h2 class="section-title">${t('pa.closed')}<small>${cl.length}</small></h2>
  ${cl.length ? `<div class="pa-list">${cl.slice(0, 30).map((c) => closedRow(c, ctx.data)).join('')}</div>` : `<p class="quiet">${t('pa.noClosed')}</p>`}
  <h2 class="section-title">${t('pa.log')}<small>${p.updated_at ? t('common.updated', { time: F.dmTime(p.updated_at) }) : ''}</small></h2>
  ${log.length ? `<ol class="pa-log">${log.slice(0, 40).map((l) => `<li>${F.esc(B.robotLogText(l))}</li>`).join('')}</ol>` : `<p class="quiet">${t('pa.noLog')}</p>`}
  <p class="disclaimer">${icon('info')}${F.esc(t('pa.disc'))}</p>`;
}

/* Small link card for Results */
export function paperLink(ctx) {
  const p = ctx.data?.paper;
  if (!ok(p)) return '';
  return paperHero(ctx);
}
