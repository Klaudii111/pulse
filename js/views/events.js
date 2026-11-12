// "Co se děje" (1.7.0): the event feed screen (#/udalosti). Data: js/feed.js.
import * as F from '../format.js';
import * as Feed from '../feed.js';
import { t } from '../i18n/index.js';
import { icon } from '../ui.js';
import * as store from '../store.js';

let seenBefore = 0; // read marker before this visit: items newer than it are highlighted

const sm = (v, ccy) => (v > 0.005 ? '+' : '') + F.money(v, ccy, ccy === 'CZK' ? 0 : Math.abs(v) >= 1000 ? 0 : 2);
const tone = (v) => (v > 0.005 ? 'up' : v < -0.005 ? 'down' : 'gold');
const side = (s) => t(s === 'SELL' ? 'ev.sell' : 'ev.buy');

/* 1.15.0: an event about my trade / order opens THAT trade (#/obchod/<id>); events stored before 1.15 (no id) are matched
   by market + time; nothing found -> Portfolio (never the whole Obchodovat) */
export function tradeHref(e) {
  const w = store.get('wallet', null) || {};
  /* a page exists for an open / closed trade and a waiting order; an ended order only through the trade it became */
  const all = (w.positions || []).concat(w.closed || [], w.orders || []);
  const has = (id) => id && all.some((x) => x.id === id);
  const viaFill = (id) => { const f = (w.ordEnded || []).find((o) => o.id === id && o.end === 'filled' && o.pos); return f && has(f.pos) ? f.pos : null; };
  let id = e.pid;
  if (id && !has(id)) id = viaFill(id);
  if (!id && e.sym) {
    const near = (a, b) => a && b && Math.abs(a - b) < 3 * 60000;
    const tt = Date.parse(e.t || 0) || e.t || e.at;
    const x = (w.positions || []).concat(w.closed || []).find((p) => p.sym === e.sym && (near(p.openedAt, tt) || near(p.closedAt, tt) || near(p.entryT, tt)))
      || (w.orders || []).concat(w.ordEnded || []).find((o) => o.sym === e.sym && (near(o.placedAt, tt) || near(o.endAt, tt)) && (e.lim == null || o.limit === e.lim));
    if (x) id = x.end ? viaFill(x.id) : x.id;
  }
  return id ? `#/obchod/${encodeURIComponent(id)}` : '#/portfolio';
}

/* What one event says: icon, tone, title, detail, value, and where it leads */
export function describe(e) {
  const sym = F.esc(e.sym || '');
  const sig = e.sid ? { action: 'open-signal', id: e.sid } : null;
  const mine = { href: tradeHref(e) };
  switch (e.k) {
    case 'new': return { ic: 'signals', tn: 'gold', title: t('ev.new', { sym, side: side(e.side) }), sub: t('ev.new.s'), go: sig };
    case 'target': return { ic: 'check', tn: 'up', title: t('ev.target', { sym }), sub: t('ev.target.s'), val: e.v != null ? F.spct(e.v, 1) : '', go: sig };
    case 'stop': return { ic: 'close', tn: 'down', title: t('ev.stop', { sym }), sub: t('ev.stop.s'), val: e.v != null ? F.spct(e.v, 1) : '', go: sig };
    case 'ended': return { ic: 'clock', tn: e.v != null ? tone(e.v) : 'gold', title: t('ev.ended', { sym }), sub: t('ev.ended.s'), val: e.v != null ? F.spct(e.v, 1) : '', go: sig };
    case 'robot-order': return { ic: 'shield', tn: 'gold', title: t('ev.rOrder', { sym, side: side(e.side) }), sub: t('ev.robot.s'), go: { href: '#/robot' } };
    case 'robot-open': return { ic: 'shield', tn: 'up', title: t('ev.rOpen', { sym, side: side(e.side) }), sub: t('ev.robot.s'), go: { href: '#/robot' } };
    case 'robot-close': return { ic: 'shield', tn: tone(e.v), title: t('ev.rClose', { sym }), sub: t('ev.robot.s'), val: Number.isFinite(e.v) ? sm(e.v, 'USD') : '', go: { href: '#/robot' } };
    case 'my-open': return { ic: 'spark', tn: 'gold', title: t('ev.myOpen', { sym, side: side(e.side) }), sub: t('ev.myOpen.s', { a: F.money(e.v, e.ccy, 0) }), go: mine };
    case 'my-close': return { ic: 'spark', tn: tone(e.v), title: t('ev.myClose', { sym }), sub: t(`term.why.${['tp', 'sl', 'out', 'signal', 'manual'].includes(e.why) ? e.why : 'manual'}`), val: Number.isFinite(e.v) ? sm(e.v, e.ccy) : '', go: mine };
    /* 1.8.0: my limit orders */
    case 'ord-auto': return { ic: 'spark', tn: 'up', title: t('ev.auto', { sym, side: side(e.side), v: F.price(e.lim), a: F.money(e.v, e.ccy, 0) }), sub: t(e.reopen ? 'ev.auto.reopen' : 'ev.auto.s'), go: mine };
    case 'ord-autoLim': return { ic: 'clock', tn: 'gold', title: t('ev.autoLim', { sym, v: F.price(e.lim), a: F.money(e.v, e.ccy, 0) }), sub: t('ev.auto.s'), go: mine };
    case 'ord-placed': return { ic: 'clock', tn: 'gold', title: t(e.side === 'SELL' ? 'ev.ordPlacedSell' : 'ev.ordPlaced', { sym, side: side(e.side), v: F.price(e.lim) }), sub: t('ev.ordPlaced.s', { side: side(e.side), a: F.money(e.v, e.ccy, 0) }), go: mine };
    case 'ord-filled': return { ic: 'check', tn: 'up', title: t(e.side === 'SELL' ? 'ev.ordFilledSell' : 'ev.ordFilled', { sym, side: side(e.side), v: F.price(e.lim) }), sub: t(e.reopen ? 'ev.ordFilled.reopen' : 'ev.ordFilled.s', { side: side(e.side).charAt(0).toUpperCase() + side(e.side).slice(1) }), go: mine };
    case 'ord-cancelled': return { ic: 'close', tn: 'gold', title: t(e.side === 'SELL' ? 'ev.ordCancelledSell' : 'ev.ordCancelled', { sym, v: F.price(e.lim) }), sub: t('ev.ordCancelled.s'), go: { href: '#/portfolio' } };
    case 'ord-expired': return { ic: 'clock', tn: 'gold', title: t(e.side === 'SELL' ? 'ev.ordExpiredSell' : 'ev.ordExpired', { sym, v: F.price(e.lim) }), sub: t(`ev.ordExpired.${['day', 'sig'].includes(e.why) ? e.why : 'gtc'}`), go: { href: '#/portfolio' } };
    default: return null;
  }
}

function row(e, i) {
  const d = describe(e);
  if (!d) return '';
  const fresh = e.at > seenBefore;
  const when = F.ago(e.t || e.at);
  const inner = `<span class="alert-ic ${d.tn}">${icon(d.ic, 'icon-sm')}</span>
    <span class="alert-main"><span class="alert-t">${fresh ? '<i class="ev-dot" aria-hidden="true"></i>' : ''}${d.title}</span><span class="alert-s">${F.esc(d.sub)} · ${F.esc(when)}</span></span>
    <span class="alert-v num ${d.tn === 'gold' ? '' : d.tn}">${d.val || ''}${icon('chev-right', 'icon-xs ev-chev')}</span>`;
  const cls = `alert-row ev-row${fresh ? ' is-new' : ''}`;
  if (d.go?.action) return `<button type="button" class="${cls}" style="--i:${Math.min(i, 10)}" data-action="open-signal" data-id="${F.esc(d.go.id)}">${inner}</button>`;
  return `<a class="${cls}" style="--i:${Math.min(i, 10)}" href="${d.go.href}">${inner}</a>`;
}

function dayLabel(ts, now) {
  const n = F.daysUntil(new Date(ts), now);
  if (n === 0) return t('ev.today');
  if (n === -1) return t('ev.yesterday');
  return `${F.weekday(new Date(ts))} ${F.dm(new Date(ts))}`;
}

export function render(ctx) {
  const now = ctx.now();
  const list = Feed.events();
  const head = `<header class="page-head"><div><a class="back" href="#/dnes">${icon('chev-left', 'icon-xs')}${t('nav.dnes')}</a><h1 class="page-title">${t('ev.title')}</h1><p class="page-sub">${t('ev.sub')}</p></div></header>`;
  if (!list.length) {
    return head + `<section class="calm ev-empty"><span class="ev-empty-ic">${icon('bell')}</span><div><h3 class="calm-t">${t('ev.empty.t')}</h3><p class="calm-s">${t('ev.empty.s')}</p></div></section>`;
  }
  let lastDay = '', i = 0;
  const groups = [];
  list.forEach((e) => {
    const d = dayLabel(e.at, now);
    if (d !== lastDay) { groups.push(`<p class="alert-group">${F.esc(d.charAt(0).toUpperCase() + d.slice(1))}</p>`); lastDay = d; }
    groups.push(row(e, i++));
  });
  return head + `<div class="alert-list ev-list">${groups.join('')}</div><p class="jnote ev-foot">${t('ev.foot')}</p>`;
}

export function mount(el, ctx) {
  /* everything on screen now counts as read; the dots stay until the next visit */
  Feed.markSeen();
  ctx.renderChrome && ctx.renderChrome();
}

/* called by the router just before render */
export function beforeRender() { seenBefore = Feed.seenAt(); }
