// 1.15.0 Portfolio (#/portfolio, old #/moje and #/zainvestovano land here) + the trade detail (#/obchod/<id>).
// Structure like Revolut / Trading 212 / Robinhood: one big account value, today and total result, the account chart with
// Dnes / Týden / Měsíc / Vše, Ve hře vs Volné, then the trades. A trade opens its own page (phone) or the right panel
// next to the list (desktop ≥ 1100 px): live chart with my entry / stop / target, "Kolik mám", "Jak to vypadá dnes",
// actions and the trade's timeline. Closed trades open the same page read-only, waiting buys as an order page.
// Every number comes from W.summary() through js/portfolio.js (P.head, P.facts) – the same as Dnes, Peněženka, Obchodovat.
import * as F from '../format.js';
import * as D from '../domain.js';
import * as W from '../wallet.js';
import * as B from '../brief.js';
import * as P from '../portfolio.js';
import * as M from '../market.js';
import * as Live from '../live.js';
import * as Bars from '../bars.js';
import * as store from '../store.js';
import { t, L, lang } from '../i18n/index.js';
import { icon, il, monogram, sparkline, openSheet, closeTopSheet, toast, copyText, skBlock, haptic, seg } from '../ui.js';
import * as A from '../alloc.js';
import { buyable as buyableList, VISIBLE_HZ } from './signals.js';
import { pxOf, pxC, closeConfirm, mktStamp, openWhen, limitDistance, validText, buyMore, actions as TermActions } from './terminal.js';
import { myStats } from './penezenka.js';
import { ziRobot } from './home.js';

const tone = (v) => (v > 0.5 ? 'up' : v < -0.5 ? 'down' : 'flat');
const sg = (v, c, dec = 0) => (v == null || !Number.isFinite(v) ? '–' : Math.abs(v) < 0.5 && dec === 0 ? `±${F.money(0, c, 0)}` : (v > 0 ? '+' : '') + F.money(v, c, dec));
/* 1.15.0 (B1): "dnes" of a trade is null while its price has not arrived on this device -> a quiet "…", never a wrong ±0 */
const UNK = '…';
const sgT = (v, c) => (v == null ? UNK : sg(v, c));
const toneT = (v) => (v == null ? 'is-unk' : tone(v));
const nm = (p) => B.whatIs(p.sym, p.name).name;
const levTxt = (lev) => B.levTxt(lev || 1);
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return +d; };

/* "včera 16:40" / "dnes 9:12" / "10. 11. 16:40" */
export function whenText(ms, now = Date.now()) {
  if (!ms) return '';
  const d = Math.round((dayStart(ms) - dayStart(now)) / 86400000);
  const day = d === 0 ? t('fmt.today') : d === -1 ? t('po.yesterday') : F.dm(new Date(ms));
  return `${day} ${F.time(new Date(ms))}`;
}
/* "1 den 4 h" / "3 h 20 min" / "12 min" */
function dur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  if (d > 0) return `${d} ${F.unit('day', d)}${h ? ` ${h} h` : ''}`;
  if (h > 0) return `${h} h${mi ? ` ${mi} min` : ''}`;
  return `${mi} min`;
}
const srcText = (s) => (s.kind === 'auto' ? t('po.src.auto') : s.kind === 'signal' ? t('po.src.signal', { hz: s.hz ? t(`c.typeS.${s.hz}`) : '' }).replace(/ · $/, '') : t('po.src.own'));
const sideWord = (p) => t(p.side === 'SELL' ? 'tr.sell' : 'tr.buy');

/* ---------- module state (one Portfolio / one detail on screen at a time) ---------- */
let off = [];
const sparks = new Map();      // sym -> values of the newest session
let hist = null;               // { key, data } of the account chart
let drCache = new Map();       // sym -> { at, v } today's range
let lastPd = null;             // the trade the detail chart was last opened for
let rsAsked = null;            // the trade id the 'Proč zainvestovat' repaint was already asked for (one repaint, no loop)
let pdBars = null;
let curCtx = null;            // the Portfolio's ctx (range chips)
function cleanup() { off.forEach((f) => { try { f(); } catch { /* ignore */ } }); off = []; pdBars && pdBars.destroy(); pdBars = null; }
export function unmount() { cleanup(); }

/* ======================================================================================================
   PORTFOLIO
   ====================================================================================================== */
/* the header's "Dnes": a number only when every open trade has its price (W.summary().todayReady) */
const heroToday = (sm, h, td, c) => (sm.todayReady === false ? t('po.todayWait') : t('po.today', { v: td.zero ? `±${F.money(0, c, 0)}` : F.esc(td.text), p: F.mpct(h.todayPct, h.today) }));
const heroTodayCls = (sm, td) => (sm.todayReady === false ? 'is-unk' : `tone-${td.tone}`);
function heroHtml(sm) {
  const h = P.head(sm);
  const c = h.ccy;
  const td = D.moneyTone(h.today, c, h.todayPct);
  const tt = D.moneyTone(h.total, c, h.totalPct);
  return `<section class="pf-hero" id="pf-hero" aria-label="${F.esc(t('po.value'))}">
    <p class="d-k">${t('po.value')}${B.qh('PFVAL')}<span class="demo-chip">${t('badge.paperShort')}</span></p>
    <p class="pf-eq num" data-pf="eq" data-eq="${h.eq}">${F.money(h.eq, c, 0)}</p>
    <p class="pf-chg num"><span class="${heroTodayCls(sm, td)}" data-pf="today">${heroToday(sm, h, td, c)}</span>
      <span class="pf-dot" aria-hidden="true">·</span><span class="tone-${tt.tone}" data-pf="total">${t('po.total', { v: tt.zero ? `±${F.money(0, c, 0)}` : F.esc(tt.text), p: F.mpct(h.totalPct, h.total) })}</span></p>
    <div class="pf-chart" id="pf-chart" role="img" aria-label="${F.esc(t('po.chartAria'))}"><p class="pchart-empty">${t('common.loading')}</p></div>
    <div class="pf-rrow"><div class="range-chips pf-ranges" role="group" aria-label="${F.esc(t('po.rangeAria'))}">${P.RANGES.map((r) => `<button type="button" class="range-chip" data-pf-range="${r.id}" aria-pressed="${r.id === P.curRange()}">${t(`po.r.${r.id}`)}</button>`).join('')}</div></div>
    <p class="pf-cnote num" id="pf-cnote"></p>
    <div class="pf-split num" data-free="${h.free}" data-inplay="${h.inPlay}">
      <a href="#/penezenka"><small>${t('acc.inPlay')}</small><b data-pf="inplay">${F.money(h.inPlay, c, 0)}</b>${sm.reserved > 0.5 ? `<small class="pf-wait num" data-pf="wait">${t('po.inWait', { v: F.money(Math.round(sm.reserved), c, 0) })}</small>` : ''}</a>
      <a href="#/penezenka"><small>${t('acc.free')}</small><b data-pf="free">${F.money(h.free, c, 0)}</b></a>
      <a href="#pf-open" data-action="pf-jump"><small>${t('po.nOpen')}</small><b data-pf="n">${h.n}</b></a>
    </div>
  </section>`;
}

/* one open trade (Portfolio, Dnes, the detail's side list) */
export function row(p, sm, { compact = false, sel = false } = {}) {
  const c = sm.w.ccy;
  const f = P.facts(p, sm);
  const w = B.whatIs(p.sym, p.name);
  const td = f.today;
  const sp = sparks.get(p.sym);
  return `<a class="pf-row pf-t-${tone(p.pnl)}${compact ? ' is-compact' : ''}${sel ? ' is-sel' : ''}" href="#/obchod/${F.esc(p.id)}" data-pid="${F.esc(p.id)}" ${sel ? 'aria-current="true"' : ''}>
    ${monogram(p.sym, w.name)}
    <span class="pf-id"><span class="pf-n"><b>${F.esc(w.name)}</b>${w.name !== p.sym ? `<span class="ticker">${F.esc(p.sym)}</span>` : ''}${p.side === 'SELL' ? `<span class="side-tag sell">${t('tr.sell')}</span>` : ''}</span>
      <span class="pf-meta num">${F.esc(t('po.rowMeta', { d: whenText(p.openedAt), a: F.money(p.margin, c, 0) }))}${(p.lev || 1) > 1 ? ` · ${F.esc(levTxt(p.lev))}` : ''}</span>
      ${compact ? '' : `<span class="pf-when"><span class="pf-src is-${f.src.kind}">${F.esc(srcText(f.src))}</span></span>`}</span>
    <span class="pf-v num">${compact ? '' : `<span class="pf-spark mi-spark ${tone(td ?? 0)}" data-f="spark" aria-hidden="true">${sp ? sparkline(sp, { w: 56, h: 18 }) : ''}</span>`}<b data-f="value">${F.money(f.value, c, 0)}</b>
      <span class="pf-res ${tone(p.pnl)}" data-f="pnl">${sg(p.pnl, c)} · ${F.mpct(p.pnlPct, p.pnl)}</span>
      ${compact ? '' : `<small class="pf-td ${toneT(td)}" data-f="today">${t('po.rowToday', { v: sgT(td, c) })}</small>`}</span>
  </a>`;
}

/* a waiting buy / sell (opens its order page) */
function ordRow(o, data, c) {
  const q = W.priceOf(o.sym, data);
  const dist = limitDistance(o, q?.p);
  const w = B.whatIs(o.sym, o.name);
  return `<a class="pf-row is-ord" href="#/obchod/${F.esc(o.id)}" data-oid="${F.esc(o.id)}">
    ${monogram(o.sym, w.name)}
    <span class="pf-id"><span class="pf-n"><b>${F.esc(w.name)}</b>${w.name !== o.sym ? `<span class="ticker">${F.esc(o.sym)}</span>` : ''}</span>
      <span class="pf-meta num">${t(o.side === 'SELL' ? 'po.ordSell' : 'po.ordBuy', { v: pxC(o.sym, o.limit), a: F.money(o.amount, c, 0) })}</span>
      <span class="pf-when tone-${dist.tone}">${F.esc(dist.text)}</span></span>
    <span class="pf-v num"><b>${F.money(o.amount, c, 0)}</b><small>${levTxt(o.lev)}</small></span>
  </a>`;
}

/* ---------- 1.15.1 Portfolio in two parts (owner 12. 11.):
   part one "Signály a obchody" – switch Moje obchody | Všechny signály robota + tabs Otevřené / Čekající / Historie;
   part two "Rozložení portfolia" – the donut of what I have put in, by kind of market, + Volné peníze.
   Phone: hero (account chart) · donut · part one. Desktop: part one left, hero + donut right. ---------- */
const PF_MODES = ['mine', 'sig'];
const PF_TABS = ['open', 'wait', 'hist'];
const pfMode = () => { const m = store.get('pfMode', 'mine'); return PF_MODES.includes(m) ? m : 'mine'; };
const pfTab = () => { const x = store.get('pfTab', 'open'); return PF_TABS.includes(x) ? x : 'open'; };
let pfKind = null;           // the donut's selected kind (filters part one; per session, not stored)
let shownIds = '';           // the open trades on screen (a close / fill meanwhile -> re-render once)
const inKind = (sym) => !pfKind || A.kindOf(sym) === pfKind;

/* a closed trade (History tab) – opens the read-only trade page */
function closedRow(p, c) {
  const w = B.whatIs(p.sym, p.name);
  return `<a class="pf-row is-closed pf-t-${tone(p.pnl)}" href="#/obchod/${F.esc(p.id)}" data-cid="${F.esc(p.id)}">
    ${monogram(p.sym, w.name)}
    <span class="pf-id"><span class="pf-n"><b>${F.esc(w.name)}</b>${w.name !== p.sym ? `<span class="ticker">${F.esc(p.sym)}</span>` : ''}</span>
      <span class="pf-meta num">${F.esc(t('p2.closedMeta', { d: whenText(p.closedAt), a: F.money(p.margin, c, 0) }))}</span></span>
    <span class="pf-v num"><b class="${tone(p.pnl)}">${sg(p.pnl, c)}</b><span class="pf-res ${tone(p.pnl)}">${F.mpct(p.pnlPct, p.pnl)}</span></span>
  </a>`;
}

/* every signal the robot sent (tested horizons only – the experimental daily robot never appears here) */
function robotSignals(data, now) {
  const vis = VISIBLE_HZ();
  const closed = D.closedSignals(data, now);
  const done = new Set(closed.map((x) => x.id));
  const open = D.allOpen(data).filter((s) => vis.includes(s.horizon) && !done.has(s.id));
  const buyable = new Set(buyableList(data, now).map((x) => x.id));
  return {
    open: open.filter((s) => D.sigPhase(s, now) !== 'closed'),
    wait: open.filter((s) => buyable.has(s.id)),
    hist: closed,
  };
}
function sigHeld(s, sm) { return sm.rows.find((p) => p.sigId === s.id) || null; }
function sigTook(s, sm) {
  if (sigHeld(s, sm)) return 'in';
  if ((sm.w.orders || []).some((o) => o.sigId === s.id)) return 'ord';
  if ((sm.w.closed || []).some((p) => p.sigId === s.id)) return 'was';
  return '';
}
function sigRow(s, sm, now) {
  const w = B.whatIs(s.symbol, s.name);
  const held = sigHeld(s, sm);
  const took = sigTook(s, sm);
  const st = D.liveStatus(s, now);
  const mv = st.move;
  const tn = mv == null ? 'flat' : mv > 0.005 ? 'up' : mv < -0.005 ? 'down' : 'flat';
  const sent = s.created_at ? F.time(new Date(Date.parse(s.created_at))) : '';
  const tag = took === 'in' ? `<span class="p2-tag is-in">${t('p2.has')}</span>` : took === 'ord' ? `<span class="p2-tag is-ord">${t('p2.hasOrd')}</span>` : took === 'was' ? `<span class="p2-tag is-was">${t('p2.had')}</span>` : `<span class="p2-tag">${t('p2.hasNot')}</span>`;
  const how = st.done ? t('p2.ended', { v: F.spct(mv ?? 0, 1) }) : mv == null ? t('p2.wait') : t('p2.now', { v: F.spct(mv, 2) });
  const sp = sparks.get(s.symbol);
  const inner = `${monogram(s.symbol, w.name)}
    <span class="pf-id"><span class="pf-n"><b>${F.esc(w.name)}</b><span class="cc-dir ${s.action === 'SELL' ? 'down' : 'up'}">${s.action === 'SELL' ? '↓' : '↑'} ${t(`c.side.${s.action === 'SELL' ? 'SELL' : 'BUY'}`)}</span></span>
      <span class="pf-meta num">${F.esc(sent ? t('p2.sent', { t: sent, hz: t(`c.typeS.${s.horizon}`) }) : t(`c.typeS.${s.horizon}`))}</span><span class="pf-when">${tag}</span></span>
    <span class="pf-v num">${st.done ? '' : `<span class="pf-spark mi-spark ${tn}" data-f="spark" data-sym="${F.esc(s.symbol)}" aria-hidden="true">${sp ? sparkline(sp, { w: 56, h: 18 }) : ''}</span>`}<b class="${tn}" data-s="mv">${F.esc(how)}</b>${held ? `<small class="${tone(held.pnl)}">${F.esc(t('p2.mine', { v: sg(held.pnl, sm.w.ccy) }))}</small>` : ''}</span>`;
  return held
    ? `<a class="pf-row p2-sig tone-${tn}" href="#/obchod/${F.esc(held.id)}" data-sid="${F.esc(s.id)}">${inner}</a>`
    : `<button type="button" class="pf-row p2-sig tone-${tn}" data-action="open-signal" data-id="${F.esc(s.id)}" data-sid="${F.esc(s.id)}">${inner}</button>`;
}
/* grouped by the day it was sent ("Dnes · čtvrtek 12. 11."), newest first */
function byDay(list, render, now) {
  const at = (s) => Date.parse(s.created_at || s.closed_at || s.hit_at || s.exit_date || 0) || 0;
  const key = (s) => { const d = new Date(at(s)); d.setHours(0, 0, 0, 0); return +d; };
  const sorted = list.slice().sort((a, b) => at(b) - at(a));
  const out = []; let last = null;
  sorted.forEach((s) => {
    const k = key(s);
    if (k !== last) {
      const d = Math.round((k - (() => { const x = new Date(+now); x.setHours(0, 0, 0, 0); return +x; })()) / 86400000);
      const lab = d === 0 ? t('fmt.today') : d === -1 ? t('po.yesterday') : '';
      out.push(`<p class="p2-day">${F.esc([lab, `${F.weekday(new Date(k))} ${F.dm(new Date(k))}`].filter(Boolean).join(' · '))}</p>`);
      last = k;
    }
    out.push(render(s));
  });
  return out.join('');
}

function partOne(ctx, sm) {
  const c = sm.w.ccy;
  const now = ctx.now();
  const mode = pfMode(), tab = pfTab();
  const rows = sm.rows.slice().sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
  const ords = sm.w.orders || [];
  const closed = (sm.w.closed || []).slice().sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
  const rs = robotSignals(ctx.data, now);
  const cnt = mode === 'mine'
    ? { open: rows.filter((p) => inKind(p.sym)).length, wait: ords.filter((o) => inKind(o.sym)).length, hist: closed.filter((p) => inKind(p.sym)).length }
    : { open: rs.open.filter((s) => inKind(s.symbol)).length, wait: rs.wait.filter((s) => inKind(s.symbol)).length, hist: rs.hist.filter((s) => inKind(s.symbol)).length };
  const modeSeg = seg({ name: 'pfmode', label: t('p2.p1'), items: PF_MODES.map((id) => ({ id, label: t(`p2.m.${id}`) })), active: mode });
  const tabSeg = seg({ name: 'pftab', small: true, label: t('p2.tabs'), items: PF_TABS.map((id) => ({ id, label: t(`p2.t.${mode}.${id}`), count: cnt[id] })), active: tab });
  const filt = pfKind ? `<p class="p2-filter"><span>${t('p2.filter', { k: t(`al.k.${pfKind}`) })}</span><button type="button" class="link" data-action="al-kind" data-k="">${t('p2.filterOff')}</button></p>` : '';
  let body = '';
  if (mode === 'mine') {
    if (tab === 'open') {
      const l = rows.filter((p) => inKind(p.sym));
      body = `<div id="pf-open">${l.length ? `<div class="pf-list">${l.map((p) => row(p, sm)).join('')}</div>`
        : `<div class="pf-empty${rows.length ? '' : ' has-il'}">${rows.length ? '' : il('04_portfolio', 72)}<p>${t(rows.length ? 'p2.none.kind' : ords.length ? 'po.open0ord' : 'po.open0')}</p>${rows.length ? '' : `<div class="pf-empty-b"><a class="btn btn-primary btn-small" href="#/dnes">${icon('signals', 'icon-sm')}${t('p2.toToday')}</a></div>`}</div>`}</div>`;
    } else if (tab === 'wait') {
      const l = ords.filter((o) => inKind(o.sym));
      body = `<div id="pf-ord">${l.length ? `<div class="pf-list">${l.map((o) => ordRow(o, ctx.data, c)).join('')}</div>` : `<p class="d-empty">${t('p2.none.wait')}</p>`}</div>`;
    } else {
      const l = closed.filter((p) => inKind(p.sym));
      const hs = myStats(sm.w);
      body = `<div id="pf-hist">${hs.n ? `<p class="p2-sum num">${t('zi.histLine', { n: hs.n, u: F.unit('trade', hs.n), r: F.pct(hs.rate, 0), v: (hs.total > 0.5 ? '+' : '') + F.money(hs.total, c, 0) })}</p>` : ''}
        ${l.length ? `<div class="pf-list">${l.map((p) => closedRow(p, c)).join('')}</div>` : `<p class="d-empty">${t('p2.none.hist')}</p>`}
        <a class="hs-row" href="#/historie">${icon('history', 'icon-xs')}<span>${t('p2.histMore')}</span>${icon('chev-right', 'icon-xs')}</a></div>`;
    }
  } else {
    const l = rs[tab].filter((s) => inKind(s.symbol));
    body = `<div id="pf-sigs">${l.length ? `<div class="pf-list">${byDay(l, (s) => sigRow(s, sm, now), now)}</div>` : `<p class="d-empty">${t(`p2.none.sig.${tab}`)}</p>`}</div>`;
  }
  return `<section class="pf-p1" id="pf-p1" aria-labelledby="pf-p1-h"><h2 class="d-h" id="pf-p1-h">${t('p2.p1')}</h2>
    <div class="seg-wrap p2-mode">${modeSeg}</div><div class="seg-wrap p2-tabs">${tabSeg}</div>${filt}
    <div class="p2-body">${body}</div></section>`;
}

/* ---------- part two: the donut ---------- */
function donutSvg(al) {
  /* B6: what I hold now (value of the trades) + waiting buys (grey) + free money = the account value */
  const parts = al.kinds.map((k) => ({ id: k.id, v: k.amount })).concat(al.wait.amount > 0 ? [{ id: 'wait', v: al.wait.amount }] : [], al.free > 0 ? [{ id: 'free', v: al.free }] : []);
  const R = 80, C = 2 * Math.PI * R, GAP = parts.length > 1 ? 2.5 : 0;
  const tot = parts.reduce((a, x) => a + x.v, 0) || 1;
  let off = 0;
  const segs = parts.map((x, i) => {
    const len = Math.max(0, (x.v / tot) * C - GAP);
    const s = `<circle class="al-seg al-c-${x.id}${pfKind && pfKind !== x.id ? ' is-dim' : ''}" r="${R}" cx="100" cy="100" style="--len:${len.toFixed(2)};--i:${i}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" data-action="al-kind" data-k="${x.id}"><title>${F.esc(t(`al.k.${x.id}`))}</title></circle>`;
    off += (x.v / tot) * C;
    return s;
  }).join('');
  return `<svg class="al-svg" viewBox="0 0 200 200" width="200" height="200" aria-hidden="true"><g transform="rotate(-90 100 100)"><circle class="al-track" r="${R}" cx="100" cy="100"/>${segs}</g></svg>`;
}
function allocHtml(sm) {
  const c = sm.w.ccy;
  const al = A.allocation(sm);
  /* whole percent that add up to 100; a slice with money that rounds to 0 % says "<1 %" */
  const pc = (v, amt) => (amt > 0 && v < 1 ? `<${F.pct(1, 0)}` : F.pct(v, 0));
  if (!(al.inPlay > 0)) {
    return `<section class="al-card card" id="al" aria-labelledby="al-h"><h2 class="d-h" id="al-h">${t('al.h')}</h2>
      <div class="al-empty">${il('04_portfolio', 72)}<p>${t('al.empty', { v: F.money(al.free, c, 0) })}</p><a class="btn btn-primary btn-small" href="#/dnes">${icon('signals', 'icon-sm')}${t('p2.toToday')}</a></div></section>`;
  }
  const sel = pfKind ? al.kinds.find((k) => k.id === pfKind) : null;
  const legend = al.kinds.map((k) => `<button type="button" class="al-row${pfKind === k.id ? ' is-sel' : ''}" data-action="al-kind" data-k="${k.id}" aria-pressed="${pfKind === k.id}">
      <i class="al-dot al-c-${k.id}" aria-hidden="true"></i><span class="al-n">${t(`al.k.${k.id}`)}</span><b class="num" data-al-amt="${k.id}">${F.money(k.amount, c, 0)}</b><span class="al-p num">${pc(k.pct, k.amount)}</span></button>`).join('')
    + (al.wait.amount > 0 ? `<a class="al-row is-wait" href="#/portfolio" data-action="al-wait"><i class="al-dot al-c-wait" aria-hidden="true"></i><span class="al-n">${t('al.k.wait')}</span><b class="num" data-al-wait>${F.money(al.wait.amount, c, 0)}</b><span class="al-p num">${pc(al.wait.pct, al.wait.amount)}</span></a>` : '')
    + (al.free > 0 ? `<a class="al-row is-free" href="#/penezenka"><i class="al-dot al-c-free" aria-hidden="true"></i><span class="al-n">${t('al.k.free')}</span><b class="num" data-al-free>${F.money(al.free, c, 0)}</b><span class="al-p num">${pc(al.freePct, al.free)}</span></a>` : '');
  const second = sel ? `<div class="al-sub" id="al-sub"><p class="al-sub-h">${t('al.subH', { k: t(`al.k.${sel.id}`), v: F.money(sel.amount, c, 0) })}</p>
      ${sel.items.map((x) => `<p class="al-item"><span>${F.esc(B.whatIs(x.sym, x.name).name)}${x.wait ? ` <small>${t('al.wait')}</small>` : ''}</span><b class="num">${F.money(x.amount, c, 0)}</b><span class="al-p num">${pc(x.share, x.amount)}</span></p>`).join('')}</div>` : '';
  return `<section class="al-card card" id="al" aria-labelledby="al-h"><h2 class="d-h" id="al-h">${t('al.h')}</h2>
    <div class="al-wrap"><div class="al-donut" role="img" aria-label="${F.esc(t('al.aria', { v: F.money(al.total, c, 0) }))}">${donutSvg(al)}
      <div class="al-mid"><small>${t('al.mid')}</small><b class="num${F.money(al.total, c, 0).length > 10 ? ' is-long' : ''}" data-al-total="${al.total}">${F.money(al.total, c, 0)}</b></div></div>
      <div class="al-legend">${legend}</div></div>
    ${second}<p class="al-note al-rule">${t('al.rule')}</p><p class="al-note">${t(pfKind ? 'al.noteSel' : 'al.note')}</p></section>`;
}

/* B6 live: the donut holds the trades' value now – its numbers and slices follow the prices (in place, no re-animation) */
function patchAlloc(root, sm) {
  const box = root.querySelector('#al');
  if (!box || !box.querySelector('.al-svg')) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = allocHtml(sm);
  const nw = tmp.querySelector('#al');
  if (!nw) return;
  const segsN = nw.querySelectorAll('.al-seg'), segsO = box.querySelectorAll('.al-seg');
  if (segsN.length !== segsO.length) { box.replaceWith(nw); return; }
  segsN.forEach((n, i) => { ['stroke-dasharray', 'stroke-dashoffset', 'style'].forEach((k) => { const v = n.getAttribute(k); if (segsO[i].getAttribute(k) !== v) segsO[i].setAttribute(k, v); }); });
  const txt = (el) => [...el.querySelectorAll('.al-legend b, .al-legend .al-p, .al-mid b, .al-sub b, .al-sub .al-p')];
  const a = txt(nw), b = txt(box);
  if (a.length !== b.length) { box.replaceWith(nw); return; }
  a.forEach((n, i) => { if (b[i].textContent !== n.textContent) b[i].textContent = n.textContent; });
}

export function render(ctx) {
  const head = `<header class="page-head"><div><h1 class="page-title">${t('nav.portfolio')}</h1><p class="page-sub">${t('p2.sub')}</p></div></header>`;
  if (!ctx.data?.signals) return head + skBlock(260);
  const sm = W.summary(ctx.data);
  shownIds = sm.rows.map((p) => p.id).sort().join(',');
  return head + `<div class="pf-grid p2-grid"><div class="pf-c1 p2-right">${heroHtml(sm)}${allocHtml(sm)}</div><div class="pf-c2 p2-left">${ziRobot(sm)}${partOne(ctx, sm)}</div></div>
  <p class="disclaimer">${icon('info')}${F.esc(t('term.disc'))}</p>`;
}

/* ---------- the account chart ---------- */
function eqSvg(box, h, c) {
  const pts = h.pts;
  if (!box) return;
  const w = box.clientWidth || 340, H = box.clientHeight || 150;
  if (pts.length < 2) { box.innerHTML = `<p class="pchart-empty">${t('po.chart0')}</p>`; return; }
  const vs = pts.map((p) => p.v);
  const first = h.base != null ? h.base : vs[0], last = vs[vs.length - 1];
  if (h.base != null) vs.push(h.base);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  /* a calm scale: a few crowns never fill the whole height – K1-15: at least ±1 % of the account value around the day's
     start (Dnes) / 0,4 % of the value otherwise, so a 0,3 % move looks small */
  const minSpan = Math.abs(last) * (h.range === 'd' ? 0.02 : 0.004) || 1;
  if (h.range === 'd' && h.base != null) { lo = Math.min(lo, h.base - minSpan / 2); hi = Math.max(hi, h.base + minSpan / 2); }
  if (hi - lo < minSpan) { const m = (hi + lo) / 2; lo = m - minSpan / 2; hi = m + minSpan / 2; }
  const pad = { l: 2, r: 2, t: 10, b: 18 };
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = Math.max(1, t1 - t0);
  const X = (tt) => pad.l + ((tt - t0) / span) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const up = h.change >= -0.5;
  const lab = (ms) => (h.range === 'd' ? F.time(new Date(ms)) : F.dm(new Date(ms)));
  box.innerHTML = `<svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" class="pf-svg ${up ? 'up' : 'down'}" aria-hidden="true">
    <defs><linearGradient id="pfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".26"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(first).toFixed(1)}" y2="${Y(first).toFixed(1)}" class="pf-base"/>
    <path d="${line}L${X(t1).toFixed(1)},${H - pad.b}L${X(t0).toFixed(1)},${H - pad.b}Z" fill="url(#pfg)"/>
    <path d="${line}" class="pf-line"/>
    <circle cx="${X(t1).toFixed(1)}" cy="${Y(last).toFixed(1)}" r="3.4" class="pf-dotc"/><circle cx="${X(t1).toFixed(1)}" cy="${Y(last).toFixed(1)}" r="3.4" class="br-pulse ${up ? 'up' : 'down'}"/>
    <text x="${pad.l}" y="${H - 4}" class="ck-ax">${F.esc(lab(t0))}</text><text x="${w - pad.r}" y="${H - 4}" class="ck-ax" text-anchor="end">${F.esc(t('po.now'))}</text>
    <g class="pf-scrub" hidden><line class="pf-scrub-l" y1="${pad.t}" y2="${H - pad.b}"/><circle r="4" class="pf-scrub-c"/></g>
  </svg>`;
  /* scrub: finger / mouse on the chart shows the value at that moment */
  const svg = box.querySelector('svg');
  const g = svg.querySelector('.pf-scrub');
  const note = document.getElementById('pf-cnote');
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const tt = t0 + Math.max(0, Math.min(1, (x - pad.l) / (w - pad.l - pad.r))) * span;
    let k = 0; pts.forEach((p, i) => { if (Math.abs(p.t - tt) < Math.abs(pts[k].t - tt)) k = i; });
    const p = pts[k];
    g.hidden = false; g.querySelector('line').setAttribute('x1', X(p.t)); g.querySelector('line').setAttribute('x2', X(p.t));
    g.querySelector('circle').setAttribute('cx', X(p.t)); g.querySelector('circle').setAttribute('cy', Y(p.v));
    if (note) note.innerHTML = `<b>${F.esc(F.money(p.v, c, 0))}</b> · ${F.esc(h.range === 'd' ? F.time(new Date(p.t)) : F.dmTime(new Date(p.t)))}`;
  };
  const hide = () => { g.hidden = true; noteHtml(h, c); };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', hide);
}
function noteHtml(h, c) {
  const n = document.getElementById('pf-cnote');
  if (!n) return;
  const tn = D.moneyTone(h.change, c, h.changePct);
  const parts = [h.range === 'd' && h.unk ? `<span class="is-unk">${t('po.todayWait')}</span>` : `<span class="tone-${tn.tone}">${t(`po.ch.${h.range}`, { v: tn.zero ? `±${F.money(0, c, 0)}` : F.esc(tn.text), p: F.mpct(h.changePct, h.change) })}</span>`];
  if (h.short) parts.push(F.esc(t('po.since', { d: F.dm(new Date(h.made)) })));
  if (h.approx) parts.push(`<span class="pf-approx">${F.esc(t('po.approx', { s: h.missing.join(', ') }))}</span>`);
  n.innerHTML = parts.join(' · ');
}
async function loadChart(ctx, force = false) {
  const box = document.getElementById('pf-chart');
  if (!box) return;
  const w = W.get();
  const r = P.curRange();
  /* the curve changes with the trades and money rows – a new trade / close re-builds it; prices refresh every 60 s */
  const key = `${r}|${w.positions.length}|${w.closed.length}|${(w.cash || []).length}|${w.createdAt}`;
  if (!force && hist && hist.key === key && Date.now() - hist.at < 60000) { drawChart(ctx); return; }
  const h = await P.history(ctx.data, r);
  if (P.curRange() !== r) return; // the user picked another period meanwhile
  hist = { key, at: Date.now(), data: h };
  drawChart(ctx);
}
function drawChart(ctx) {
  if (!hist) return;
  const sm = W.summary(ctx.data);
  const h = hist.data;
  const lastI = h.pts.length - 1;
  /* the live point = the header number (one source) */
  if (h.pts[lastI]?.now) { h.pts[lastI] = { t: Date.now(), v: sm.equity, now: true }; }
  const flows = (sm.w.cash || []).filter((x) => (x.k === 'dep' || x.k === 'wd') && x.at > h.pts[0].t).reduce((a, x) => a + x.amount, 0);
  h.change = h.pts[lastI].v - h.pts[0].v - flows; h.changePct = h.change / (h.pts[0].v || 1) * 100;
  /* "Dnes" on the chart = the header's "Dnes" (ONE number: W.summary().today); the dashed line = where the day started */
  if (h.range === 'd') { const hd = P.head(sm); if (sm.todayReady === false) { h.unk = true; } else h.unk = false; h.change = hd.today; h.changePct = hd.todayPct; h.base = sm.equity - sm.today; } else h.base = null;
  eqSvg(document.getElementById('pf-chart'), h, sm.w.ccy);
  noteHtml(h, sm.w.ccy);
}

/* live: patch the numbers in place (no re-render = no flicker, the chart and sparks stay) */
function patchRows(root, sm) {
  const c = sm.w.ccy;
  sm.rows.forEach((p) => {
    root.querySelectorAll(`.pf-row[data-pid="${CSS.escape(p.id)}"]`).forEach((el) => {
      const f = P.facts(p, sm);
      const set = (k, v) => { const n = el.querySelector(`[data-f="${k}"]`); if (n && n.innerHTML !== v) { n.innerHTML = v; return n; } return null; };
      const vEl = set('value', F.money(f.value, c, 0));
      if (vEl && !matchMedia('(prefers-reduced-motion: reduce)').matches) { vEl.classList.remove('flash-up', 'flash-down'); void vEl.offsetWidth; vEl.classList.add(f.value >= +(vEl.dataset.v || f.value) ? 'flash-up' : 'flash-down'); }
      if (vEl) vEl.dataset.v = String(f.value);
      const pn = set('pnl', `${sg(p.pnl, c)} · ${F.mpct(p.pnlPct, p.pnl)}`); if (pn) pn.className = `pf-res ${tone(p.pnl)}`;
      const td = set('today', t('po.rowToday', { v: sgT(f.today, c) })); if (td) td.className = `pf-td ${toneT(f.today)}`;
      el.classList.remove('pf-t-up', 'pf-t-down', 'pf-t-flat'); el.classList.add(`pf-t-${tone(p.pnl)}`);
    });
  });
}
function patchHero(root, sm) {
  const h = P.head(sm);
  const c = h.ccy;
  const set = (k, v) => { const n = root.querySelector(`[data-pf="${k}"]`); if (n && n.innerHTML !== v) n.innerHTML = v; return n; };
  const e = set('eq', F.money(h.eq, c, 0)); if (e) e.dataset.eq = String(h.eq);
  const td = D.moneyTone(h.today, c, h.todayPct), tt = D.moneyTone(h.total, c, h.totalPct);
  const a = set('today', heroToday(sm, h, td, c)); if (a) a.className = heroTodayCls(sm, td);
  const b = set('total', t('po.total', { v: tt.zero ? `±${F.money(0, c, 0)}` : F.esc(tt.text), p: F.mpct(h.totalPct, h.total) })); if (b) b.className = `tone-${tt.tone}`;
  set('inplay', F.money(h.inPlay, c, 0)); set('free', F.money(h.free, c, 0)); set('n', String(h.n));
}
/* 1.15.1: the robot's signal rows (Všechny signály robota): the price move follows the live price */
function patchSigs(root, ctx) {
  const now = ctx.now();
  root.querySelectorAll('.p2-sig[data-sid]').forEach((el) => {
    const s = D.findSignal(ctx.data, el.dataset.sid);
    const b = el.querySelector('[data-s="mv"]');
    if (!s || !b) return;
    const st = D.liveStatus(s, now);
    const mv = st.move;
    const tn = mv == null ? 'flat' : mv > 0.005 ? 'up' : mv < -0.005 ? 'down' : 'flat';
    const v = st.done ? t('p2.ended', { v: F.spct(mv ?? 0, 1) }) : mv == null ? t('p2.wait') : t('p2.now', { v: F.spct(mv, 2) });
    if (b.textContent !== v) { b.textContent = v; b.className = tn; }
  });
}
function loadSparks(root, sm) {
  const syms = new Set(sm.rows.map((p) => p.sym));
  root.querySelectorAll('[data-f="spark"][data-sym]').forEach((x) => syms.add(x.dataset.sym));
  [...syms].forEach((sym) => P.spark(sym).then((v) => {
    if (!v) return;
    sparks.set(sym, v);
    root.querySelectorAll(`[data-f="spark"][data-sym="${CSS.escape(sym)}"]`).forEach((s) => { s.innerHTML = sparkline(v, { w: 56, h: 18 }); });
    root.querySelectorAll('.pf-row[data-pid]').forEach((el) => {
      const p = sm.rows.find((x) => x.id === el.dataset.pid);
      if (!p || p.sym !== sym) return;
      const s = el.querySelector('[data-f="spark"]'); if (s) s.innerHTML = sparkline(v, { w: 56, h: 18 });
    });
  }).catch(() => {}));
}

export function mount(el, ctx) {
  cleanup();
  curCtx = ctx;
  if (!ctx.data?.signals) return;
  Live.onData();
  loadChart(ctx);
  const sm0 = W.summary(ctx.data);
  loadSparks(el, sm0);
  const onLive = () => {
    if (!el.isConnected) return;
    const sm = W.summary(ctx.data);
    /* a trade closed / filled meanwhile -> the lists change: re-render once */
    if (sm.rows.map((p) => p.id).sort().join(',') !== shownIds) { ctx.rerender({ soft: true }); return; }
    patchHero(el, sm); patchRows(el, sm); patchSigs(el, ctx); patchAlloc(el, sm); drawChart(ctx);
  };
  document.addEventListener('pulse:live', onLive);
  off.push(() => document.removeEventListener('pulse:live', onLive));
  const spT = setInterval(() => { if (!el.isConnected) return; loadSparks(el, W.summary(ctx.data)); loadChart(ctx); }, 30000);
  off.push(() => clearInterval(spT));
  const onResize = () => drawChart(ctx);
  window.addEventListener('resize', onResize);
  off.push(() => window.removeEventListener('resize', onResize));
}

/* ======================================================================================================
   TRADE DETAIL  #/obchod/<id>
   ====================================================================================================== */
const BACK = { portfolio: 'nav.portfolio', moje: 'nav.portfolio', zainvestovano: 'nav.portfolio', dnes: 'nav.dnes', terminal: 'nav.terminal', historie: 'hi.title',
  udalosti: 'ev.title', signaly: 'nav.signaly', penezenka: 'wl.title', robot: 'rb.title' };
function backLink(ctx) {
  const from = ctx.from && BACK[ctx.from.name] ? ctx.from : null;
  return `<a class="back" href="${from ? F.esc(from.hash) : '#/portfolio'}" data-action="pd-back">${icon('chev-left', 'icon-xs')}${t(from ? BACK[from.name] : 'nav.portfolio')}</a>`;
}

function kvRow(k, v, { cls = '', hint = '', key = '' } = {}) {
  return `<div class="pd-kv${cls ? ` ${cls}` : ''}"${key ? ` data-k="${key}"` : ''}><span class="pd-k">${k}${hint ? `<small>${hint}</small>` : ''}</span><b class="num">${v}</b></div>`;
}

/* "Kolik mám" – one open or closed trade, in the wallet currency */
function kolikHtml(p, sm) {
  const c = sm.w.ccy;
  const f = P.facts(p, sm);
  const rows = [
    kvRow(t('pd.k.dep'), F.money(p.margin, c, 0), { hint: t('pd.k.depS'), key: 'dep' }),
    kvRow(t('pd.k.lev'), F.esc(levTxt(p.lev)), { hint: p.lev > 1 ? t('pd.k.levS', { v: p.lev }) : t('pd.k.lev1S'), key: 'lev' }),
    kvRow(t('pd.k.size'), `${F.money(p.notional, c, 0)}${f.qty != null && f.qty > 0 ? `<small class="pd-q" data-d="units">${t('pd.k.units', { q: F.num(f.qty, f.qty >= 100 ? 0 : f.qty >= 1 ? 2 : 4) })}</small>${f.fx !== 1 ? `<small class="pd-q pd-fx" data-d="fx">${t('pd.k.fx', { a: F.ccyWrap('1', f.fxFrom), b: F.ccyWrap(F.num(f.fx, f.fx >= 10 ? 1 : f.fx >= 0.1 ? 3 : 4), c) })}</small>` : ''}` : ''}`, { key: 'size' }),
    kvRow(t(p.side === 'SELL' ? 'pd.k.sellPx' : 'pd.k.buyPx'), pxC(p.sym, p.entry), { key: 'entry' }),
    f.closed ? kvRow(t(p.side === 'SELL' ? 'pd.k.buyBack' : 'pd.k.exitPx'), pxC(p.sym, p.exit), { key: 'exit' }) : kvRow(t('pd.k.px'), pxC(p.sym, f.px), { key: 'px' }),
    kvRow(t(f.closed ? 'pd.k.valEnd' : 'pd.k.val'), F.money(f.value, c, 0), { key: 'value', cls: 'is-strong' }),
    kvRow(t(f.closed ? 'pd.k.resEnd' : 'pd.k.res'), `<span class="${tone(p.pnl)}">${sg(p.pnl, c)} (${F.mpct(p.pnlPct, p.pnl)})</span>`, { key: 'pnl', cls: 'is-strong' }),
    f.closed ? '' : kvRow(t('pd.k.today'), `<span class="${toneT(f.today)}">${sgT(f.today, c)}</span>`, { hint: t('pd.k.todayS'), key: 'today' }),
    kvRow(t('pd.k.fees'), `${t('pd.k.feesV', { s: F.money(f.spread, c, f.spread < 10 && c === 'CZK' ? 0 : f.spread < 10 ? 2 : 0), n: F.money(f.swap, c, f.swap > 0 && f.swap < 10 ? 2 : 0) })}${f.closed && p.fee > 0.5 ? `<small class="pd-q">${t('term.convFee', { v: F.money(p.fee, c, 0) })}</small>` : ''}`, { hint: t(p.lev > 1 ? 'pd.k.feesS' : 'pd.k.feesS1'), key: 'fees' }),
  ];
  if (!f.closed) {
    if (f.endPx != null) {
      /* B3: leverage ends the trade before the stop – this row replaces "Při stopu"; the stop stays as a quiet line */
      rows.push(kvRow(`${t('pd.k.atEnd', { v: pxOf(p.sym, f.endPx) })}${B.qh('LEVEND')}`, `<span class="down">${sg(f.atEnd, c)}</span>`, { hint: t('pd.k.atEndS', { m: F.num(100 / p.lev, 100 / p.lev >= 10 ? 0 : 1) }), key: 'atEnd', cls: 'is-end' }));
      if (p.sl > 0) rows.push(`<p class="pd-stop2 num" data-k="stop2">${t('pd.k.stop2', { v: pxOf(p.sym, p.sl) })}</p>`);
    } else rows.push(kvRow(t('pd.k.atStop', { v: p.sl > 0 ? pxOf(p.sym, p.sl) : '–' }), p.sl > 0 ? `<span class="${tone(f.atStop)}">${sg(f.atStop, c)}</span>` : `<span class="pd-none">${t('pd.k.noStop')}</span>`, { key: 'atStop' }));
    rows.push(kvRow(t('pd.k.atTarget', { v: p.tp > 0 ? pxOf(p.sym, p.tp) : '–' }), p.tp > 0 ? `<span class="${tone(f.atTarget)}">${sg(f.atTarget, c)}</span>` : `<span class="pd-none">${t('pd.k.noTarget')}</span>`, { key: 'atTarget' }));
  } else {
    rows.push(kvRow(t('pd.k.why'), F.esc(t(`hi.why.${['tp', 'sl', 'slgap', 'out', 'stopout', 'manual'].includes(p.why) ? p.why : 'signal'}`)), { key: 'why' }));
    rows.push(kvRow(t('pd.k.held'), F.esc(dur(f.held)), { key: 'held' }));
  }
  return `<div class="pd-kvs">${rows.join('')}</div>`;
}

/* the signal's plain state for me (open trade) */
function sigSentence(ctx, p, s) {
  const f = P.sourceOf(p, W.get());
  if (f.kind === 'own') return t('pd.st.own');
  const rb = P.robotState(ctx.data, p);
  /* B5: the robot already left -> never "nemusíš nic dělat" (the block at the top says what to decide) */
  if (rb?.k === 'closed') return t('pd.st.robotOut');
  if (!s) return t(rb?.k === 'holds' ? 'pd.st.holds0' : 'pd.st.noSig');
  const ended = s.status !== 'open' || (s.intraday_hit && !s.live_hit);
  if (ended) return t('pd.st.ended', { why: t(`pd.end.${['target', 'stop'].includes(s.status) ? s.status : s.intraday_hit === 'target' || s.intraday_hit === 'stop' ? s.intraday_hit : 'time'}`) });
  if (rb?.k === 'closed') return t('pd.st.robotOut');
  if (rb?.k === 'holds') return t('pd.st.holds', { d: s.exit_date ? `${F.weekday(s.exit_date)} ${F.dm(s.exit_date)}` : '' });
  return t('pd.st.open', { d: s.exit_date ? `${F.weekday(s.exit_date)} ${F.dm(s.exit_date)}` : '' });
}

function bar(lo, hi, v, { entry = null, cls = '' } = {}) {
  const pos = (x) => (hi !== lo ? Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100)) : 50);
  return `<span class="pd-bar ${cls}"><i class="pd-bar-f" style="width:${pos(v).toFixed(1)}%"></i>${entry != null ? `<i class="pd-bar-e" style="left:${pos(entry).toFixed(1)}%" title="${F.esc(t('pd.entryMark'))}"></i>` : ''}<i class="pd-bar-m" style="left:${pos(v).toFixed(1)}%"></i></span>`;
}

/* "Jak to vypadá dnes" */
function dnesHtml(ctx, p, sm) {
  const c = sm.w.ccy;
  const f = P.facts(p, sm);
  const s = P.signalOf(ctx.data, p);
  const name = nm(p);
  const ch = Live.dayChange(p.sym);
  const open = M.isOpen(p.sym);
  const out = [];
  if (!open) {
    const o = M.nextOpen(p.sym);
    out.push(`<p class="pd-line">${icon('clock', 'icon-xs')}<span>${t('pd.d.closed', { d: o ? openWhen(o) : F.esc(M.hours(p.sym)) })}${ch != null ? ` ${t('pd.d.lastMove', { v: F.spct(ch, 2) })}` : ''}</span></p>`);
  } else if (ch != null) {
    out.push(`<p class="pd-line"><b class="num ${ch >= 0 ? 'up' : 'down'}">${F.spct(ch, 2)}</b><span>${t('pd.d.move', { n: F.esc(name) })}</span></p>`);
  }
  const dr = drCache.get(p.sym)?.v;
  if (dr && dr.hi > dr.lo) {
    out.push(`<div class="pd-range"><p class="pd-sub">${t(dr.today ? 'pd.d.range' : 'pd.d.rangeLast', { d: F.dm(new Date(dr.day)) })}</p>
      <div class="pd-rrow num"><span>${pxOf(p.sym, dr.lo)}</span>${bar(dr.lo, dr.hi, Math.max(dr.lo, Math.min(dr.hi, f.px)), { cls: 'is-range' })}<span>${pxOf(p.sym, dr.hi)}</span></div></div>`);
  }
  /* B3 / B4: the lower end is the leverage end when it comes first; only distances in % from the price now here – the money
     sits once in "Kolik mám" (Při cíli / Při stopu = the whole result since I bought) */
  if (f.low > 0 || p.tp > 0) {
    const end = f.endPx != null;
    const way = f.low > 0 && p.tp > 0;
    out.push(`<div class="pd-way"><p class="pd-sub">${t(end ? 'pd.d.wayEnd' : 'pd.d.way')}</p>
      ${way ? `<div class="pd-rrow num"><span class="down">${t(end ? 'pd.lv.end' : 'lad.stop')}</span>${bar(f.low, p.tp, f.px, { entry: p.entry, cls: 'is-way' })}<span class="up">${t('lad.target')}</span></div>` : ''}
      <p class="pd-dist num">${p.tp > 0 ? `<span class="up">${t('pd.d.toTarget', { v: F.pct(f.toTarget, 1) })}</span>` : ''}${end ? `<span class="down">${t('pd.d.toEnd', { v: F.pct(f.toEnd, 1) })}</span>` : p.sl > 0 ? `<span class="down">${t('pd.d.toStop', { v: F.pct(f.toStop, 1) })}</span>` : ''}</p></div>`);
  }
  out.push(kvRow(t('pd.d.held'), F.esc(dur(f.held)), { key: 'held' }));
  if (s?.exit_date && f.src.kind !== 'own') out.push(kvRow(t('pd.d.exit'), F.esc(`${F.weekday(s.exit_date)} ${F.dm(s.exit_date)}`), { hint: t('pd.d.exitS'), key: 'exit' }));
  out.push(`<p class="pd-state">${icon(f.src.kind === 'own' ? 'chart' : 'robot', 'icon-xs')}<span>${F.esc(sigSentence(ctx, p, s))}</span></p>`);
  return out.join('');
}

/* "Proč" – the robot's reason + the optional "Proč zainvestovat" list (duvody.json, never a count / score) */
function whyHtml(ctx, p) {
  const s = P.signalOf(ctx.data, p);
  if (!s) return '';
  const ex = s.explanation;
  const x = ex ? L(ex.summary || ex) : '';
  const why = typeof x === 'string' ? F.human(x.replace(/^\s*(Proč|Why)\s*:\s*/i, '')).trim() : '';
  const bullets = why ? [] : B.whyBullets(s, 3);
  const rs = P.reasonsFor(s.id, lang());
  if (!why && !bullets.length && !rs) return '';
  return `<section class="pd-sec card" id="pd-why"><h2 class="d-h">${t('pd.why')}</h2>
    ${why ? `<p class="pd-why">${F.esc(why.charAt(0).toUpperCase() + why.slice(1))}</p>` : ''}
    ${bullets.length ? `<ul class="reasons">${bullets.map((b) => `<li>${icon('check')}${F.esc(b)}</li>`).join('')}</ul>` : ''}
    ${rs ? `<h3 class="pd-sub pd-rs-h">${t('pd.rs')}</h3><ul class="reasons pd-rs">${rs.map((r) => `<li>${icon('check')}<span><b>${F.esc(r.name)}</b>${r.why ? ` <small>${F.esc(r.why)}</small>` : ''}</span></li>`).join('')}</ul><p class="pd-rs-note">${t('pd.rsNote')}</p>` : ''}
  </section>`;
}

function tlHtml(ctx, p, sm) {
  const c = sm.w.ccy;
  const ev = P.timeline(ctx.data, p, sm.w);
  if (!ev.length) return '';
  const txt = (e) => {
    switch (e.k) {
      case 'placed': return t(p.side === 'SELL' ? 'pd.tl.placedSell' : 'pd.tl.placed', { v: pxC(p.sym, e.v) });
      case 'filled': return t(p.side === 'SELL' ? 'pd.tl.filledSell' : 'pd.tl.filled', { v: pxC(p.sym, e.v) });
      case 'bought': return t(p.side === 'SELL' ? 'pd.tl.sold' : 'pd.tl.bought', { v: pxC(p.sym, e.v), a: F.money(p.margin, c, 0) });
      case 'edit': return t('pd.tl.edit', { s: e.sl > 0 ? pxOf(p.sym, e.sl) : '–', t: e.tp > 0 ? pxOf(p.sym, e.tp) : '–' });
      case 'swap': return t('pd.tl.swap', { v: F.money(Math.abs(e.v), c, 2) });
      case 'sig': return t('pd.tl.sig');
      case 'robotIn': return t('pd.tl.robotIn');
      case 'robotOut': return t('pd.tl.robotOut');
      case 'closed': return t('pd.tl.closed', { v: sg(e.v, c), why: t(`hi.why.${['tp', 'sl', 'slgap', 'out', 'stopout', 'manual'].includes(e.why) ? e.why : 'signal'}`) });
      default: return e.k.startsWith('sigHit-') || e.k.startsWith('sigEnd-') ? t(`pd.tl.${e.k.split('-')[1] === 'target' ? 'sigTarget' : e.k.split('-')[1] === 'stop' ? 'sigStop' : 'sigEnd'}`) : '';
    }
  };
  const ic = { placed: 'clock', filled: 'check', bought: 'plus-square', edit: 'settings', swap: 'clock', sig: 'signals', robotIn: 'robot', robotOut: 'robot', closed: 'check' };
  return `<section class="pd-sec card" id="pd-tl"><h2 class="d-h">${t('pd.tl')}</h2><ol class="pd-tl">${ev.map((e) => { const x = txt(e); return x ? `<li><span class="pd-tl-ic">${icon(ic[e.k] || 'spark', 'icon-xs')}</span><span class="pd-tl-t">${x}</span><small class="num">${F.esc(whenText(e.at))}</small></li>` : ''; }).join('')}</ol></section>`;
}

function actionsHtml(ctx, p, sm, closed) {
  const s = P.signalOf(ctx.data, p);
  const c = sm.w.ccy;
  const items = [];
  if (!closed) {
    items.push(`<button type="button" class="btn btn-secondary" data-action="pd-levels" data-id="${F.esc(p.id)}">${icon('settings', 'icon-sm')}<span>${t('pd.a.levels')}</span></button>`);
    items.push(`<button type="button" class="btn btn-secondary" data-action="pd-more" data-id="${F.esc(p.id)}">${icon('plus-square', 'icon-sm')}<span>${t(p.side === 'SELL' ? 'pd.a.moreSell' : 'pd.a.more')}</span></button>`);
  }
  items.push(`<button type="button" class="btn btn-secondary" data-action="pd-term" data-sym="${F.esc(p.sym)}">${icon('chart', 'icon-sm')}<span>${t('pd.a.term')}</span></button>`);
  if (s) items.push(`<button type="button" class="btn btn-secondary" data-action="open-signal" data-id="${F.esc(s.id)}">${icon('signals', 'icon-sm')}<span>${t('pd.a.sig')}</span></button>`);
  items.push(`<button type="button" class="btn btn-secondary" data-action="pd-share" data-id="${F.esc(p.id)}">${icon('share', 'icon-sm')}<span>${t('pd.a.share')}</span></button>`);
  if (closed) items.push(`<a class="btn btn-secondary" href="#/historie">${icon('history', 'icon-sm')}<span>${t('hi.title')}</span></a>`);
  const bar0 = closed ? '' : `<div class="pd-cta" id="pd-cta"><button type="button" class="btn btn-primary btn-block pd-close" data-action="pos-close" data-id="${F.esc(p.id)}"><span>${t('pd.a.close')}</span><b class="num" data-d="ctaV">${sg(p.pnl, c)}</b></button></div>`;
  if (closed) return `${bar0}<section class="pd-acts" aria-label="${F.esc(t('pd.acts'))}">${items.join('')}</section>`;
  /* K1-20: one primary (Ukončit obchod, the bar), one secondary (Upravit stop / cíl), the rest under a closed "Další možnosti" */
  const [lv, ...rest] = items;
  return `${bar0}<section class="pd-acts2" aria-label="${F.esc(t('pd.acts'))}">${lv.replace('class="btn btn-secondary"', 'class="btn btn-secondary btn-block"')}
    <details class="pd-more"><summary>${t('pd.moreOpts')}${icon('chev-down', 'icon-xs')}</summary><div class="pd-acts">${rest.join('')}</div></details></section>`;
}

/* the side list on desktop (same rows as Portfolio, compact) */
function sideList(sm, id) {
  const rows = sm.rows.slice().sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
  return `<aside class="pd-side" aria-label="${F.esc(t('zi.open'))}"><p class="d-h">${t('zi.open')}<span class="num"> · ${rows.length}</span></p>
    <div class="pf-list">${rows.map((p) => row(p, sm, { compact: true, sel: p.id === id })).join('')}</div>
    <a class="hs-row" href="#/portfolio">${icon('wallet', 'icon-xs')}<span>${t('pd.toPortfolio')}</span>${icon('chev-right', 'icon-xs')}</a></aside>`;
}

/* B5: the robot ended its own trade of this signal and mine still runs -> say it at the top, with "Ukončit taky" /
   "Nechat běžet" (the choice is remembered per trade: then one small grey line). Never "nemusíš nic dělat" for such a trade. */
function robotLeftHtml(ctx, p, sm) {
  const x = P.robotExits(ctx.data, sm.w).find((e) => e.pos.id === p.id);
  if (!x) return '';
  const c = sm.w.ccy;
  const when = x.at ? whenText(x.at) : '';
  const how = [x.exit ? t('pd.rb.at', { v: pxC(p.sym, x.exit) }) : '', x.pnlPct != null ? `(${F.spct(x.pnlPct, 1)})` : ''].filter(Boolean).join(' ');
  const head = t('pd.rb.head', { d: when, how: how ? ` ${how}` : '' });
  if (P.isFollowOff(p.id)) return `<p class="pd-rb-line" id="pd-rb">${icon('robot', 'icon-xs')}<span>${F.esc(t('pd.rb.kept', { h: head }))}</span></p>`;
  return `<section class="pd-rb card" id="pd-rb" aria-live="polite"><p class="pd-rb-t">${icon('robot', 'icon-sm')}<span>${F.esc(head)} <b class="num ${tone(p.pnl)}" data-d="rbMine">${F.esc(t('pd.rb.mine', { v: sg(p.pnl, c) }))}</b></span></p>
    <div class="pd-rb-b"><button type="button" class="btn btn-primary" data-action="pos-close" data-id="${F.esc(p.id)}">${t('pd.rb.close')}</button><button type="button" class="btn btn-ghost" data-action="pd-follow-off" data-id="${F.esc(p.id)}">${t('pd.rb.keep')}</button></div></section>`;
}

function topHtml(p, sm, closed) {
  const c = sm.w.ccy;
  const f = P.facts(p, sm);
  if (closed) {
    return `<section class="pd-top card pf-t-${tone(p.pnl)}"><p class="d-k">${t('pd.closedK', { d: whenText(p.closedAt) })}</p>
      <p class="pd-val num ${tone(p.pnl)}">${sg(p.pnl, c)} <small>(${F.mpct(p.pnlPct, p.pnl)})</small></p>
      <p class="pd-res num">${t('pd.closedS', { a: F.money(p.margin, c, 0), b: F.money(f.value, c, 0) })}</p></section>`;
  }
  return `<section class="pd-top card pf-t-${tone(p.pnl)}"><p class="d-k">${t('pd.valK')}</p>
    <p class="pd-val num" data-d="value">${F.money(f.value, c, 0)}</p>
    <p class="pd-res num"><span class="${tone(p.pnl)}" data-d="pnl">${sg(p.pnl, c)} (${F.mpct(p.pnlPct, p.pnl)})</span><span class="pd-res-l">${t('pd.resK')}</span></p>
    <p class="pd-res num"><span class="${toneT(f.today)}" data-d="today">${sgT(f.today, c)}</span><span class="pd-res-l">${t('pd.todayK')}</span></p></section>`;
}

function chartHtml(p, closed, data) {
  const q = W.priceOf(p.sym, data);
  const st = closed ? null : mktStamp(p.sym, data);
  const ch = Live.dayChange(p.sym);
  return `<section class="pd-chartc card"><div class="pd-pxrow"><p class="pd-px num" data-d="px">${q ? pxC(p.sym, q.p) : '–'}</p>
      ${ch != null ? `<span class="term-ch num ${ch >= 0 ? 'up' : 'down'}" data-d="chg">${t('term.dayCh', { v: F.spct(ch, 2) })}</span>` : '<span data-d="chg"></span>'}
      ${st ? `<p class="live-stamp is-${st.code}" data-d="stamp"><i aria-hidden="true"></i>${F.esc(st.text)}</p>` : ''}</div>
    <div class="t-bars pd-bars" id="pd-bars">${Bars.controls('pdb', { tfKey: 'barsTf.pd' })}</div>
    <p class="pd-legend"><span class="lg-ent">${t('pd.lg.entry')}</span>${p.sl > 0 ? `<span class="lg-sl">${t('lad.stop')}</span>` : ''}${p.tp > 0 ? `<span class="lg-tp">${t('lad.target')}</span>` : ''}<span class="lg-mk">${t(closed ? 'pd.lg.marks2' : 'pd.lg.mark')}</span></p>
  </section>`;
}

function orderPage(ctx, o, sm) {
  const c = sm.w.ccy;
  const q = W.priceOf(o.sym, ctx.data);
  const dist = limitDistance(o, q?.p);
  const out = W.outcome({ side: o.side, entry: o.limit, amount: o.amount, lev: o.lev || 1, sl: o.sl, tp: o.tp });
  const s = o.sigId ? D.findSignal(ctx.data, o.sigId) : null;
  const w = B.whatIs(o.sym, o.name);
  const kv = [
    kvRow(t('pd.k.dep'), F.money(o.amount, c, 0), { hint: t('pd.o.depS') }),
    kvRow(t('pd.k.lev'), F.esc(levTxt(o.lev))),
    kvRow(t(o.side === 'SELL' ? 'pd.o.limSell' : 'pd.o.limBuy'), pxC(o.sym, o.limit)),
    kvRow(t('pd.k.px'), q ? pxC(o.sym, q.p) : '–', { key: 'px' }),
    kvRow(t('pd.o.valid'), F.esc(validText(o))),
    kvRow(t('pd.k.atStop', { v: o.sl > 0 ? pxOf(o.sym, o.sl) : '–' }), o.sl > 0 ? `<span class="down">${sg(out.atStop, c)}</span>` : `<span class="pd-none">${t('pd.k.noStop')}</span>`),
    kvRow(t('pd.k.atTarget', { v: o.tp > 0 ? pxOf(o.sym, o.tp) : '–' }), o.tp > 0 ? `<span class="up">${sg(out.atTarget, c)}</span>` : `<span class="pd-none">${t('pd.k.noTarget')}</span>`),
  ].join('');
  return `<header class="page-head pd-head"><div>${backLink(ctx)}<div class="pd-title">${monogram(o.sym, w.name)}<div><h1 class="page-title pd-name">${F.esc(w.name)}</h1>
    <p class="page-sub">${F.esc(o.sym)} · ${t(o.side === 'SELL' ? 'po.ordSellT' : 'po.ordBuyT')}</p></div></div></div></header>
  <div class="pd-grid"><div class="pd-main">
    <section class="pd-top card"><p class="d-k">${t(o.side === 'SELL' ? 'po.ordSellT' : 'po.ordBuyT')}</p><p class="pd-val num">${F.money(o.amount, c, 0)}</p>
      <p class="pd-state tone-${dist.tone}">${icon('clock', 'icon-xs')}<span>${F.esc(dist.text)}</span></p></section>
    ${chartHtml({ ...o, entry: o.limit }, true, ctx.data).replace(t('pd.lg.entry'), t(o.side === 'SELL' ? 'pd.lg.limitSell' : 'pd.lg.limit')).replace(`<span class="lg-mk">${t('pd.lg.marks2')}</span>`, '')}
    <section class="pd-sec card"><h2 class="d-h">${t('pd.o.kolik')}</h2><div class="pd-kvs">${kv}</div></section>
    <section class="pd-acts">
      <button type="button" class="btn btn-secondary" data-action="t-oedit" data-id="${F.esc(o.id)}">${icon('settings', 'icon-sm')}<span>${t('term.ord.edit')}</span></button>
      <button type="button" class="btn btn-secondary" data-action="t-ocancel" data-id="${F.esc(o.id)}">${icon('close', 'icon-sm')}<span>${t('term.ord.cancel')}</span></button>
      <button type="button" class="btn btn-secondary" data-action="pd-term" data-sym="${F.esc(o.sym)}">${icon('chart', 'icon-sm')}<span>${t('pd.a.term')}</span></button>
      ${s ? `<button type="button" class="btn btn-secondary" data-action="open-signal" data-id="${F.esc(s.id)}">${icon('signals', 'icon-sm')}<span>${t('pd.a.sig')}</span></button>` : ''}
    </section>
  </div></div>`;
}

/* K2-13: the period is chosen BEFORE the chips are drawn (render path, once per trade id), so chip, store and axis agree on the first paint */
function pickPd(id, p0, closed) {
  if (lastPd === id) return;
  lastPd = id;
  const age = Date.now() - (p0.openedAt || p0.placedAt || Date.now());
  store.set('barsTf.pd', closed ? ((p0.closedAt - p0.openedAt) < 3 * 86400000 && Date.now() - p0.closedAt < 4 * 86400000 ? '5D' : '1M') : age < 20 * 3600000 ? '1D' : '5D');
}

export function renderTrade(ctx) {
  const id = ctx.route.sub;
  const head0 = `<header class="page-head"><div>${backLink(ctx)}<h1 class="page-title">${t('pd.title')}</h1></div></header>`;
  if (!ctx.data?.signals) return head0 + skBlock(260);
  const f = id ? P.find(ctx.data, id) : null;
  if (!f) {
    return head0 + `<section class="pf-empty"><p>${t('pd.gone')}</p><div class="pf-empty-b"><a class="btn btn-primary btn-small" href="#/portfolio">${t('pd.toPortfolio')}</a><a class="btn btn-secondary btn-small" href="#/historie">${t('hi.title')}</a></div></section>`;
  }
  pickPd(id, f.order ? { ...f.row, entry: f.row.limit } : f.row, !f.open && !f.order);
  if (f.order) return orderPage(ctx, f.row, f.sm);
  const p = f.row, sm = f.sm, closed = !f.open;
  const w = B.whatIs(p.sym, p.name);
  const src = P.sourceOf(p, sm.w);
  const sub = [p.sym !== w.name ? p.sym : '', sideWord(p), levTxt(p.lev), srcText(src)].filter(Boolean).join(' · ');
  return `<header class="page-head pd-head"><div>${backLink(ctx)}<div class="pd-title">${monogram(p.sym, w.name)}<div><h1 class="page-title pd-name">${F.esc(w.name)}</h1>
    <p class="page-sub">${F.esc(sub)}</p><p class="pd-when">${F.esc(t(p.side === 'SELL' ? 'po.soldAt' : 'po.boughtAt', { d: whenText(p.openedAt) }))}${closed ? ` · ${F.esc(t('pd.endedAt', { d: whenText(p.closedAt) }))}` : ''}</p></div></div></div></header>
  <div class="pd-grid">${closed ? '' : sideList(sm, p.id)}<div class="pd-main" data-pd="${F.esc(p.id)}">
    ${closed ? '' : robotLeftHtml(ctx, p, sm)}
    ${topHtml(p, sm, closed)}
    ${chartHtml(p, closed, ctx.data)}
    <section class="pd-sec card" id="pd-kolik"><h2 class="d-h">${t(closed ? 'pd.kolikEnd' : 'pd.kolik')}</h2><div data-d="kolik">${kolikHtml(p, sm)}</div></section>
    ${closed ? '' : `<section class="pd-sec card" id="pd-dnes"><h2 class="d-h">${t('pd.dnes')}</h2><div data-d="dnes">${dnesHtml(ctx, p, sm)}</div></section>`}
    ${whyHtml(ctx, p)}
    ${actionsHtml(ctx, p, sm, closed)}
    ${tlHtml(ctx, p, sm)}
  </div></div>
  <p class="disclaimer">${icon('info')}${F.esc(t('term.disc'))}</p>`;
}

export function mountTrade(el, ctx) {
  cleanup();
  if (!ctx.data?.signals) return;
  const id = ctx.route.sub;
  const f = id ? P.find(ctx.data, id) : null;
  if (!f) return;
  const p0 = f.order ? { ...f.row, entry: f.row.limit } : f.row;
  const closed = !f.open && !f.order;
  Live.onData();
  /* the chart opens on a period that shows my buy: 1D when it happened in the last 20 h, else 5D (closed: 1M) */
  pickPd(id, p0, closed);
  const levels = () => {
    const g = id ? P.find(ctx.data, id) : null;
    const x = g ? (g.order ? { ...g.row, entry: g.row.limit } : g.row) : p0;
    const lv = [];
    if (x.tp > 0) lv.push({ v: x.tp, label: t('lad.target'), cls: 'up' });
    lv.push({ v: x.entry, label: t(f.order ? 'pd.lv.limit' : 'pd.lv.entry'), cls: 'ent' });
    if (x.sl > 0) lv.push({ v: x.sl, label: t('lad.stop'), cls: 'down' });
    /* B3: where leverage ends the trade (before the stop) – the same level as in "Kolik mám" */
    if (!closed && !f.order) { const e = W.endLevel(x); if (e > 0 && (!(x.sl > 0) || (x.side === 'SELL' ? -1 : 1) * (e - x.sl) > 0)) lv.push({ v: e, label: t('pd.lv.end'), cls: 'down' }); }
    if (closed && x.exit > 0) lv.push({ v: x.exit, label: t('pd.lv.exit'), cls: 'ext' });
    return lv;
  };
  const marks = () => (f.order ? [] : [{ t: p0.entryT || p0.openedAt, v: p0.entry, cls: 'me', label: t(p0.side === 'SELL' ? 'pd.mk.sold' : 'pd.mk.bought') }]
    .concat(closed ? [{ t: p0.closedAt, v: p0.exit, cls: 'out', label: t('pd.mk.out') }] : []));
  const box = el.querySelector('#pd-bars');
  if (box) pdBars = Bars.mount(box, 'pdb', p0.sym, { fmt: (v) => pxOf(p0.sym, v), tfKey: 'barsTf.pd', levels, marks, fit: 'bars', path: () => (D.allOpen(ctx.data).find((x) => x.symbol === p0.sym)?.price_path || []) });
  if (!closed && !f.order) {
    /* today's range + the reasons file load once, then the sections repaint */
    const dr = drCache.get(p0.sym);
    if (!dr || Date.now() - dr.at > 60000) P.dayRange(p0.sym).then((v) => { drCache.set(p0.sym, { at: Date.now(), v }); paint(); }).catch(() => {});
  }
  /* "Proč zainvestovat" arrives later (duvody.json): ONE repaint per trade id at most, never on an order page (it has no
     #pd-why) and only when the page can show the list (its signal is known) – else every repaint asked again = endless loop */
  if (p0.sigId && !f.order && rsAsked !== id) {
    rsAsked = id;
    P.loadReasons().then((r) => {
      const sig = P.signalOf(ctx.data, p0);
      if (r && sig && el.isConnected && ctx.route.sub === id && !el.querySelector('#pd-why .pd-rs') && P.reasonsFor(sig.id || p0.sigId, lang())) ctx.rerender({ soft: true });
    });
  }
  function paint() {
    if (!el.isConnected) return;
    const g = P.find(ctx.data, id);
    if (!g) return;
    if (g.order) {
      const q = W.priceOf(g.row.sym, ctx.data);
      const n = el.querySelector('[data-k="px"] b'); if (n && q) n.innerHTML = pxC(g.row.sym, q.p);
      const px = el.querySelector('[data-d="px"]'); if (px && q) px.innerHTML = pxC(g.row.sym, q.p);
      pdBars && pdBars.refresh();
      return;
    }
    /* the trade closed meanwhile (stop / target / signal) -> the read-only page */
    if (g.open === false && !closed) { ctx.rerender({ soft: true }); return; }
    const p = g.row, sm = g.sm, c = sm.w.ccy;
    const fx = P.facts(p, sm);
    const set = (k, v) => { const n = el.querySelector(`[data-d="${k}"]`); if (n && n.innerHTML !== v) { n.innerHTML = v; return n; } return null; };
    if (!closed) {
      const vEl = set('value', F.money(fx.value, c, 0));
      if (vEl && !matchMedia('(prefers-reduced-motion: reduce)').matches) { vEl.classList.remove('flash-up', 'flash-down'); void vEl.offsetWidth; vEl.classList.add(fx.value >= +(vEl.dataset.v || fx.value) ? 'flash-up' : 'flash-down'); }
      if (vEl) vEl.dataset.v = String(fx.value);
      const a = set('pnl', `${sg(p.pnl, c)} (${F.mpct(p.pnlPct, p.pnl)})`); if (a) a.className = tone(p.pnl);
      const b = set('today', sgT(fx.today, c)); if (b) b.className = toneT(fx.today);
      set('ctaV', sg(p.pnl, c));
      const q = W.priceOf(p.sym, ctx.data);
      const pxEl = el.querySelector('[data-d="px"]');
      if (pxEl && q) { const nv = pxC(p.sym, q.p); if (pxEl.innerHTML !== nv) { pxEl.innerHTML = nv; } }
      const ch = Live.dayChange(p.sym);
      const chEl = el.querySelector('[data-d="chg"]'); if (chEl && ch != null) { chEl.className = `term-ch num ${ch >= 0 ? 'up' : 'down'}`; chEl.textContent = t('term.dayCh', { v: F.spct(ch, 2) }); }
      const k = el.querySelector('[data-d="kolik"]'); if (k) { const h = kolikHtml(p, sm); if (k.innerHTML !== h) k.innerHTML = h; }
      const d = el.querySelector('[data-d="dnes"]'); if (d) { const h = dnesHtml(ctx, p, sm); if (d.innerHTML !== h) d.innerHTML = h; }
      patchRows(el, sm);
    }
    pdBars && pdBars.refresh();
  }
  const onLive = () => paint();
  document.addEventListener('pulse:live', onLive);
  off.push(() => document.removeEventListener('pulse:live', onLive));
  const stT = setInterval(() => {
    if (!el.isConnected) return;
    const s = el.querySelector('[data-d="stamp"]'); if (!s) return;
    const st = mktStamp(p0.sym, ctx.data);
    s.className = `live-stamp is-${st.code}`; s.innerHTML = `<i aria-hidden="true"></i>${F.esc(st.text)}`;
  }, 1000);
  off.push(() => clearInterval(stT));
}

/* ---------- Upravit stop / cíl ---------- */
function levelsSheet(ctx, id) {
  const g = P.find(ctx.data, id);
  if (!g || !g.open) return;
  const p = g.row, c = g.sm.w.ccy;
  const st = { sl: p.sl || null, tp: p.tp || null };
  const fmt = (v) => (v > 0 ? pxOf(p.sym, v) : '');
  const prev = () => {
    const f = P.facts({ ...p, sl: st.sl, tp: st.tp }, g.sm);
    return `${kvRow(t('pd.k.atStop', { v: st.sl > 0 ? pxOf(p.sym, st.sl) : '–' }), st.sl > 0 ? `<span class="${tone(f.atStop)}">${sg(f.atStop, c)}</span>` : `<span class="pd-none">${t('pd.k.noStop')}</span>`)}
      ${kvRow(t('pd.k.atTarget', { v: st.tp > 0 ? pxOf(p.sym, st.tp) : '–' }), st.tp > 0 ? `<span class="${tone(f.atTarget)}">${sg(f.atTarget, c)}</span>` : `<span class="pd-none">${t('pd.k.noTarget')}</span>`)}`;
  };
  openSheet({
    small: true, label: t('pd.lv.t'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('pd.lv.t')}</p><p class="sheet-sub">${F.esc(nm(p))} · ${t('pd.k.px')} ${pxC(p.sym, p.px)}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body" id="pd-lvs">
        <label class="tk-in"><span>${t('pd.lv.sl')}</span><input class="jin num" inputmode="decimal" data-in="sl" value="${fmt(st.sl)}" placeholder="${t('pd.lv.none')}"></label>
        <label class="tk-in"><span>${t('pd.lv.tp')}</span><input class="jin num" inputmode="decimal" data-in="tp" value="${fmt(st.tp)}" placeholder="${t('pd.lv.none')}"></label>
        <div class="pd-kvs" id="pd-lv-out">${prev()}</div>
        <p class="why-s">${t(p.side === 'SELL' ? 'pd.lv.helpSell' : 'pd.lv.help')}</p>
        <div class="btn-stack" style="margin-top:12px"><button type="button" class="btn btn-primary btn-block" data-yes>${t('common.save')}</button><button type="button" class="btn btn-ghost" data-no>${t('term.resetNo')}</button></div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-no]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('#pd-lvs').addEventListener('input', (ev) => {
        const k = ev.target.dataset.in; if (!k) return;
        const v = F.parsePx(ev.target.value);
        st[k] = v > 0 ? v : null;
        sh.querySelector('#pd-lv-out').innerHTML = prev();
      });
      sh.querySelector('[data-yes]').addEventListener('click', () => {
        const r = W.editLevels(ctx.data, id, st);
        if (!r.ok) { toast(t(`term.err.${r.reason}`)); return; }
        haptic(12);
        closeTopSheet();
        toast(t(r.same ? 'pd.lv.same' : 'pd.lv.saved'));
        document.dispatchEvent(new CustomEvent('pulse:wallet'));
        setTimeout(() => ctx.rerender({ soft: true }), 380);
      });
    },
  });
}

async function share(ctx, id) {
  const g = P.find(ctx.data, id);
  if (!g || g.order) return;
  const p = g.row;
  const txt = t(g.open ? 'pd.share' : 'pd.shareEnd', { n: nm(p), s: p.sym, p: F.mpct(p.pnlPct, p.pnl), d: F.dm(new Date(p.openedAt)) });
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) { await navigator.share({ title: 'PULSE', text: txt, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const ok = await copyText(`${txt} ${url}`);
  toast(t(ok ? 'pd.shared' : 'common.copyFailed'));
}

export const actions = {
  'pd-back'(el, ev, ctx) {
    /* back = where I came from (history), else Portfolio */
    const from = ctx.from && BACK[ctx.from.name] ? ctx.from : null;
    if (from && window.__pulsePushed) { window.history.back(); return; }
    window.__pulseGo(from ? from.hash : '#/portfolio');
  },
  'pd-levels'(el, ev, ctx) { levelsSheet(ctx, el.dataset.id); },
  'pd-more'(el, ev, ctx) { const g = P.find(ctx.data, el.dataset.id); if (g?.open) buyMore(ctx, g.row); },
  'pd-term'(el) { store.set('termSym', el.dataset.sym); store.set('termView', 'one'); window.__pulseGo(`#/terminal?k=${encodeURIComponent(el.dataset.sym)}`); },
  'pd-share'(el, ev, ctx) { share(ctx, el.dataset.id); },
  'al-wait'(el, ev, ctx) { ev && ev.preventDefault && ev.preventDefault(); store.set('pfMode', 'mine'); store.set('pfTab', 'wait'); pfKind = null; haptic(); ctx.rerender({ soft: true }); setTimeout(() => { const n = document.getElementById('pf-p1'); if (n) n.scrollIntoView({ block: 'start' }); }, 60); },
  'pd-follow-off'(el, ev, ctx) { P.followOff(el.dataset.id); haptic(); ctx.rerender({ soft: true }); },
  'pf-jump'(el, ev, ctx) {
    /* "Otevřené obchody" tile: show my open trades (switch / tab / filter reset when needed), then scroll to them */
    const go = () => { const n = document.getElementById('pf-open'); if (n) n.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    if (pfMode() !== 'mine' || pfTab() !== 'open' || pfKind) { store.set('pfMode', 'mine'); store.set('pfTab', 'open'); pfKind = null; ctx.rerender({ soft: true }); setTimeout(go, 60); } else go();
  },
  /* the donut: a slice / legend row = that kind (second level + filter of part one); the same again or "Zrušit" = all */
  'al-kind'(el, ev, ctx) {
    const k = el.dataset.k || null;
    if (k === 'free') { window.__pulseGo('#/penezenka'); return; }
    pfKind = !k || pfKind === k ? null : k;
    haptic();
    ctx.rerender({ soft: true });
  },
  seg(el, ev, ctx) {
    const n = el.dataset.segName;
    if (n !== 'pfmode' && n !== 'pftab') return false;
    haptic();
    store.set(n === 'pfmode' ? 'pfMode' : 'pfTab', el.dataset.id);
    ctx.rerender({ soft: true });
    return true;
  },
  /* the order page reuses the platform's Upravit cenu / Zrušit sheets */
  't-oedit'(el, ev, ctx) { TermActions['t-oedit'](el, ev, ctx); },
  't-ocancel'(el, ev, ctx) { TermActions['t-ocancel'](el, ev, ctx); },
};

/* the range chips of the account chart (delegated; the view's actions only see data-action) */
document.addEventListener('click', (ev) => {
  const b = ev.target.closest && ev.target.closest('[data-pf-range]');
  if (!b) return;
  store.set('pfRange', b.dataset.pfRange);
  document.querySelectorAll('[data-pf-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  const box = document.getElementById('pf-chart'); if (box) box.innerHTML = `<p class="pchart-empty">${t('common.loading')}</p>`;
  hist = null;
  if (curCtx) loadChart(curCtx, true);
});

/* Dnes mount: the sparklines of the rows (cached by bars.js) */
export function dnesMount(el, ctx) {
  if (!ctx.data?.signals) return;
  const sm = W.summary(ctx.data);
  if (sm.rows.length) loadSparks(el, sm);
}

/* ---------- Dnes: the portfolio summary card + the rows that open the detail ---------- */
export function dnesBlock(ctx) {
  const sm = W.summary(ctx.data);
  const h = P.head(sm);
  const c = h.ccy;
  const rows = sm.rows.slice().sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
  const open = D.moneyTone(sm.open, c, sm.used > 0 ? sm.open / sm.used * 100 : null);
  const td = D.moneyTone(sm.todayOpen, c, null);
  const ords = (sm.w.orders || []).map((o) => ordRow(o, ctx.data, c)).join('');
  const head = `<a class="pf-sum" href="#/portfolio" id="d-pf"><span class="pf-sum-l"><b>${t('po.sumK', { n: h.n })}</b><small class="num">${t('po.sumS', { a: F.money(sm.used, c, 0) })}</small></span>
    <span class="pf-sum-v num"><b class="tone-${open.tone}">${open.zero ? `±${F.money(0, c, 0)}` : F.esc(open.text)}</b><small class="${sm.todayReady === false ? 'is-unk' : `tone-${td.tone}`}">${t('po.rowToday', { v: sm.todayReady === false ? UNK : sg(sm.todayOpen, c) })}</small></span>${icon('chev-right', 'icon-xs')}</a>`;
  const max = 4;
  const more = rows.length > max ? `<a class="d-more" href="#/portfolio">${t('po.allN', { n: rows.length })}${icon('chev-right', 'icon-xs')}</a>` : '';
  return `${head}${rows.length || ords ? `<div class="pf-list">${rows.slice(0, max).map((p) => row(p, sm)).join('')}${ords}</div>${more}` : `<p class="d-empty">${t('d.mine0')}</p>`}`;
}
