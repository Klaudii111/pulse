// Robot's paper account (Alpaca Paper, fictional $100,000): ./data/paper.json written by the server (1.6.0).
// Missing file -> everything here renders '' (section hidden).
import * as F from '../format.js';
import * as B from '../brief.js';
import * as D from '../domain.js';
import { t } from '../i18n/index.js';
import { icon, monogram, sparkline } from '../ui.js';

const ok = (p) => p && p.account && Number.isFinite(+p.account.equity);
const usd = (v, dec) => F.money(v, 'USD', dec ?? (Math.abs(v) >= 1000 ? 0 : 2));
const tone = (v) => (v > 0.0001 ? 'up' : v < -0.0001 ? 'down' : 'flat');
const sideTxt = (s) => t(s === 'short' || s === 'sell' ? 'pa.short' : 'pa.long');

/* The paper account's equity: live P&L of positions is already in equity from the server */
function eq(p) { return +p.account.equity; }

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
    <span class="pa-top"><span class="pa-k">${icon('shield', 'icon-sm')}${t('pa.heroK')}</span>${modeBadge(p)}</span>
    <span class="pa-v num" data-count="${eq(p)}" data-dec="0" data-ccy="USD" data-count-key="pa-hero">${usd(eq(p), 0)}</span>
    <span class="pa-s"><b class="num ${tone(pnl)}">${F.spct(pct, 2)} · ${pnl >= 0 ? '+' : ''}${usd(pnl, 0)}</b> ${t('pa.heroS', { start: usd(+a.start_equity || 100000, 0) })}</span>
    <span class="pa-foot"><span>${t('pa.posN', { n: pos.length })}</span><span>${t('pa.ordN', { n: (p.orders || []).length })}</span><span class="pa-more">${t('pa.more')}${icon('chev-right', 'icon-xs')}</span></span>
  </a>`;
}

function posRow(x, data) {
  const sig = x.signal_id ? D.findSignal(data, x.signal_id) : null;
  const tn = tone(+x.pnl_usd);
  const attrs = sig ? `type="button" data-action="open-signal" data-id="${F.esc(sig.id)}"` : 'type="button" disabled';
  return `<button class="pa-row" ${attrs}>
    ${monogram(x.symbol, '')}
    <span class="pa-id"><span class="pa-sym">${F.esc(x.symbol)} <span class="side-tag ${x.side === 'short' ? 'sell' : ''}">${sideTxt(x.side)}</span></span>
      <span class="pa-meta num">${t('pa.qty', { q: F.num(+x.qty, 0), e: F.price(+x.avg_entry), p: F.price(+x.price) })}</span>
      <span class="pa-meta">${F.esc(B.robotOpenText(x, data, sig?.stop))}</span></span>
    <span class="pa-r num ${tn}">${+x.pnl_usd >= 0 ? '+' : ''}${usd(+x.pnl_usd, 2)}<small>${F.spct(+x.pnl_pct, 2)}</small></span>
  </button>`;
}

function orderRow(o) {
  const st = t(`pa.st.${o.status}`) === `pa.st.${o.status}` ? o.status : t(`pa.st.${o.status}`);
  const lv = [o.limit != null ? t('pa.limit', { v: F.price(+o.limit) }) : '', o.stop != null ? t('pa.stop', { v: F.price(+o.stop) }) : '', o.take != null ? t('pa.take', { v: F.price(+o.take) }) : ''].filter(Boolean).join(' · ');
  return `<div class="pa-row is-static">
    ${monogram(o.symbol, '')}
    <span class="pa-id"><span class="pa-sym">${F.esc(o.symbol)} <span class="side-tag ${o.side === 'sell' || o.side === 'short' ? 'sell' : ''}">${sideTxt(o.side === 'sell' ? 'short' : o.side === 'buy' ? 'long' : o.side)}</span></span>
      <span class="pa-meta num">${F.esc(lv)}</span></span>
    <span class="pa-r"><span class="pa-st">${F.esc(st)}</span><small>${o.submitted_at ? F.dmTime(o.submitted_at) : ''}</small></span>
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
    <span class="pa-r num ${tn}">${+c.pnl_usd >= 0 ? '+' : ''}${usd(+c.pnl_usd, 2)}<small>${F.spct(+c.pnl_pct, 2)}</small></span>
  </button>`;
}

/* Full view: route #/robot */
export function render(ctx) {
  const p = ctx.data?.paper;
  const head = `<header class="page-head"><div><a class="back" href="#/vysledky">${icon('chev-left', 'icon-xs')}${t('nav.vysledky')}</a><h1 class="page-title">${t('pa.title')}</h1><p class="page-sub">${t('pa.sub')}</p></div></header>`;
  if (!ok(p)) return head + `<div class="empty"><h3>${t('pa.none.t')}</h3><p>${t('pa.none.s')}</p></div>`;
  const a = p.account;
  const start = +a.start_equity || 100000;
  const pnl = +a.pnl_usd || (eq(p) - start);
  const pct = a.pnl_pct != null && Number.isFinite(+a.pnl_pct) ? +a.pnl_pct : (pnl / start) * 100;
  const pos = p.positions || [], ord = p.orders || [], cl = p.closed || [], log = p.log || [];
  const wins = cl.filter((c) => +c.pnl_usd > 0).length;
  const spark = cl.length > 1 ? sparkline([...cl].reverse().reduce((acc, c) => { acc.push((acc[acc.length - 1] ?? start) + (+c.pnl_usd || 0)); return acc; }, [start]), { w: 110, h: 34, cls: 'hero-spark' }) : '';
  return head + `
  <p class="headline">${pos.length ? t('pa.headline', { n: pos.length }) : t('pa.headline0')}</p>
  <section class="pa-big tone-${tone(pnl)}">
    <span class="aurora" aria-hidden="true"><i></i><i></i></span>
    <div class="pa-top"><span class="pa-k">${F.esc(p.broker || 'Alpaca Paper')}</span>${modeBadge(p)}</div>
    <div class="hero-top"><p class="pa-v num" data-count="${eq(p)}" data-dec="0" data-ccy="USD" data-count-key="pa-big">${usd(eq(p), 0)}</p>${spark}</div>
    <p class="pa-s"><b class="num ${tone(pnl)}">${F.spct(pct, 2)} · ${pnl >= 0 ? '+' : ''}${usd(pnl, 0)}</b> ${t('pa.heroS', { start: usd(start, 0) })}</p>
    <div class="pa-stats">
      <div><p class="tile-l">${t('pa.cash')}</p><p class="num">${usd(+a.cash, 0)}</p></div>
      <div><p class="tile-l">${t('pa.bp')}</p><p class="num">${usd(+a.buying_power, 0)}</p></div>
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
  ${log.length ? `<ol class="pa-log">${log.slice(0, 40).map((l) => `<li>${F.esc(l)}</li>`).join('')}</ol>` : `<p class="quiet">${t('pa.noLog')}</p>`}
  <p class="disclaimer">${icon('info')}${F.esc(t('pa.disc'))}</p>`;
}

/* Small link card for Results */
export function paperLink(ctx) {
  const p = ctx.data?.paper;
  if (!ok(p)) return '';
  return paperHero(ctx);
}
