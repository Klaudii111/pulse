import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import { t, L } from '../i18n/index.js';
import { icon, il, skBlock, ladderGeometry, liveState, monogram, sparkline, toast } from '../ui.js';
import * as B from '../brief.js';
import * as W from '../wallet.js';
import * as store from '../store.js';
import { orderRow, histList, tradeRow, closeConfirm, pxC } from './terminal.js';
import { pricePoints } from '../charts.js';
import { withLive } from './results.js';
import { regimeLine, nextLine, disclaimer, emptyState, rTip, errorBlock, signalRow, nextCheck, buyable, VISIBLE_HZ, scanLine, nextUsOpen } from './signals.js';
import { paperHero } from './paper.js';
import { card as mojeCard } from './moje.js';
import { pushCta } from './more.js';
import * as Live from '../live.js';
import * as H from '../health.js';
import { offLine, linkLine } from './learn.js';
import { myStats } from './penezenka.js';
import * as P from '../portfolio.js';
import { dnesBlock, whenText } from './portfolio.js';
import * as Den from '../den.js';

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
  const td = D.moneyTone(sm.today, c, P.head(sm).todayPct);
  /* 1.13.0 ONE hero: balance, today's change in colour, small Volné / Ve hře (= in trades + waiting buys) */
  return `<section class="d-hero" id="acc-card" aria-label="${t('wl.title')}">
    <a class="d-hero-l" href="#/penezenka"><p class="d-k">${icon('wallet', 'icon-xs')}${t('wl.title')}${icon('chev-right', 'icon-xs')}</p>
      <p class="d-hero-v num" data-eq="${W.parts(sm).eq}">${F.money(W.parts(sm).eq, c, 0)}</p>
      <p class="d-hero-ch num tone-${td.tone}">${td.zero ? t('dh.today0', { v: `±${F.money(0, c, 0)}` }) : t('dh.today', { v: F.esc(td.text), p: F.mpct(P.head(sm).todayPct, sm.today) })}${sm.rows.length ? `<small class="d-hero-incl">${t('dh.inclOpen')}</small>` : ''}</p>
      ${(() => { const p = W.parts(sm); return `<p class="d-hero-s num" data-free="${p.free}" data-inplay="${p.inPlay}" data-open="${p.open}">${t(p.open !== 0 ? 'dh.split3' : 'dh.split', { f: F.money(p.free, c, 0), u: F.money(p.inPlay, c, 0), o: (p.open > 0 ? '+' : '') + F.money(p.open, c, 0) })}</p>`; })()}</a>
    <button type="button" class="btn btn-secondary btn-small d-hero-b" data-action="w-load">${icon('plus-square', 'icon-sm')}<span>${t('wl.topupShort')}</span></button>
  </section>`;
}

/* 1.13.0 "Jak chceš obchodovat": one card, three chips – Sám · Signály · Robot za mě (switch + one status line) */
export function profText() {
  const p = D.prof();
  return `${t(`mb.p.${p.id}`)} · ${B.profShort(p.id)}`;
}
function paths() {
  const on = !!store.get('autoCopy', null)?.on;
  return `<section class="how-card" aria-label="${t('pt.aria')}">
    <p class="d-k">${t('pt.aria')}</p>
    <div class="how-chips has-il">
      <a class="hw-chip hw-link" href="#/terminal" aria-label="${F.esc(t('pt.linkAria', { p: t('nav.terminal') }))}">${il('05_svickovy_graf', 56, { cls: 'hw-il', lazy: false })}<span>${t('pt.self')}</span>${icon('chev-right', 'icon-xs hw-arr')}</a>
      <a class="hw-chip hw-link" href="#/signaly" aria-label="${F.esc(t('pt.linkAria', { p: t('nav.signaly') }))}">${il('13_puls_sipka', 56, { cls: 'hw-il', lazy: false })}<span>${t('pt.sig')}</span>${icon('chev-right', 'icon-xs hw-arr')}</a>
      <button type="button" class="hw-chip hw-auto ${on ? 'is-on' : ''}" id="auto-copy" role="switch" aria-checked="${on}" data-action="auto-toggle">${il('02_robot', 56, { cls: 'hw-il', lazy: false })}<span>${t('pt.auto')}</span><span class="auto-sw" aria-hidden="true"><i></i></span></button>
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
  /* 1.13.2: the same list as Signály → Můžeš koupit (one function, so the counts can never disagree) */
  return H.sortByQuality(buyable(data, now).filter((x) => !nn.has(x.id)), data, now);
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
  const ords = sm.w.orders.map((o) => `<a class="mi-row is-ord" href="#/obchod/${F.esc(o.id)}"><span class="mi-id"><b class="mi-n">${F.esc(B.whatIs(o.sym, o.name).name)}</b>
      <span class="mi-s num">${t(o.side === 'SELL' ? 'd.orderSell' : 'd.order', { v: `<span class="nw">${pxC(o.sym, o.limit)}</span>`, a: `<span class="nw">${F.money(o.amount, c, 0)}</span>` })}</span></span></a>`).join('');
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
    ${(() => {
      /* 1.13.3: the split only when a purchase is waiting (else "Ve hře" = "v obchodech", said twice); "Teď −1 Kč" never wraps */
      const res = sm.rows.length ? `<span class="nw ${open.tone}">${t('zi.result', { v: open.text })}</span>` : '';
      const split = sm.reserved > 0 ? t('zi.split', { a: F.money(sm.used, c, 0), b: F.money(sm.reserved, c, 0) }) : '';
      return split || res ? `<p class="d-acc-s num">${split}${split && res ? ' · ' : ''}${res}</p>` : '';
    })()}</div>
    <a class="btn btn-secondary d-trade" href="#/penezenka">${icon('wallet', 'icon-sm')}<span>${t('wl.title')}</span></a></section>
  ${ziRobot(sm)}
  <section class="d-block"><h2 class="d-h">${t('zi.open')}<span class="num"> · ${sm.rows.length}</span></h2>${sm.rows.length ? myInvestRows(ctx, sm) : `<p class="d-empty">${t('d.mine0')}</p>`}</section>
  <section class="d-block"><h2 class="d-h">${t('zi.orders')}<span class="num"> · ${sm.w.orders.length}</span></h2>${ords ? `<div class="tp-list">${ords}</div>` : `<p class="d-empty">${t('zi.orders0')}</p>`}</section>
  <a class="hs-row zi-hrow" href="#/historie">${icon('history', 'icon-xs')}<span>${hs.n ? t('zi.histLine', { n: hs.n, u: F.unit('trade', hs.n), r: F.pct(hs.rate, 0), v: (hs.total > 0.5 ? '+' : '') + F.money(hs.total, c, 0) }) : t('zi.histLine0')}</span>${icon('chev-right', 'icon-xs')}</a>
  ${fol.length ? `<section class="d-block"><h2 class="d-h">${t('moje.fol')}<span class="num"> · ${fol.length}</span></h2><div class="sc-list">${fol.map((x, i) => B.compact(x, { data: ctx.data, now, i })).join('')}</div></section>` : ''}`;
}


/* 1.13.3 Zainvestováno: robot-for-me ON -> one line what it is doing (waiting for a new signal / how many it opened) */
export function ziRobot(sm) {
  const ac = store.get('autoCopy', null);
  if (!ac?.on) return '';
  const copied = new Set(Array.isArray(sm.w.copied) ? sm.w.copied : []);
  const mine = (x) => x.auto || (x.sigId && copied.has(x.sigId));
  const n = (sm.w.positions || []).filter(mine).length;
  const k = (sm.w.orders || []).filter(mine).length;
  const txt = n ? t('zi.robotOn', { n }) : t('zi.robotOn0');
  return `<a class="zi-robot" href="#/robot">${icon('robot', 'icon-sm')}<span>${txt}${k ? ` · ${t('zi.robotWait', { n: k })}` : ''}</span>${icon('chev-right', 'icon-xs')}</a>`;
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
  /* 1.13.3: open and closed counted apart ("8 otevřených · 0 uzavřených"), the closed ones = Výsledky (visible horizons) */
  const closed = (ctx.data?.history?.signals || []).filter((x) => VISIBLE_HZ().includes(x.horizon)).length;
  return `<p class="d-robot">${icon('shield', 'icon-sm')}<span>${t('d.robot3', { o: n, c: closed, p: F.spct(pct, 2), v, d: since ? F.dm(since) : '–' })}</span></p>`;
}

export const actions = {
  'h-close'(el, ev, ctx) { closeConfirm(ctx, el.dataset.id); },
  'h-term'(el) { store.set('termSym', el.dataset.sym); window.__pulseGo('#/terminal'); },
  'ts-go'(el) { window.__pulseGo(el.dataset.href); },
  'rx-keep'(el, ev, ctx) {
    P.followOff(el.dataset.id);
    const row = el.closest('.rx-row');
    if (row) row.remove();
    ctx.rerender({ soft: true });
  },
  'rx-all'(el) { const c = el.closest('.rx-card'); if (c) c.classList.add('is-all'); el.remove(); },
};

/* ---------- 1.15.1 Dnes = three questions, in this order (owner 12. 11.: "přijdeš do appky a aby bylo jasné, jaké
   signály kdy byly vyslány na dnes"): (a) Kolik mám · (b) Dnešní signály · (c) Jak se daří tomu, co mám.
   Everything else (how I trade, the robot's record, the status of the scans) sits below. ---------- */
const dayOf = (ms) => new Date(ms).toDateString();
/* every signal valid for today: buyable now / at the open / with a limit, or mine / my waiting buy while its entry is open;
   + "Dnes dříve" = sent today but no longer buyable (the day's timeline stays visible) */
export function todaySignals(data, now) {
  const vis = VISIBLE_HZ();
  const today = dayOf(+now);
  const main = [], earlier = [];
  D.allOpen(data).filter((s) => vis.includes(s.horizon) && D.horizonAllowed(data, s.horizon)).forEach((s) => {
    const cs = D.cardState(s, data, now);
    const buy = ['buy', 'soon', 'wait'].includes(cs.code) && D.sigPhase(s, now) === 'open' && H.offerable(s, data);
    const held = (cs.code === 'mine' || cs.code === 'order') && D.entryOpen(s, now);
    if (buy || held) main.push({ s, cs, buy });
    else if (s.created_at && dayOf(Date.parse(s.created_at)) === today) earlier.push({ s, cs, buy: false });
  });
  const q = H.sortByQuality(main.filter((x) => x.buy).map((x) => x.s), data, now).map((s) => main.find((x) => x.s === s));
  const rank = { order: 1, mine: 2 };
  const rest = main.filter((x) => !x.buy).sort((a, b) => (rank[a.cs.code] || 3) - (rank[b.cs.code] || 3));
  earlier.sort((a, b) => Date.parse(b.s.created_at) - Date.parse(a.s.created_at));
  return { main: q.concat(rest), earlier };
}
/* "dnes 16:05" / "včera 22:46" – when the robot sent the signal */
export function sentText(s, now) {
  return s?.created_at ? whenText(Date.parse(s.created_at), +now) : '';
}
function tsState(x, now) {
  const { s, cs } = x;
  const sell = s.action === 'SELL';
  if (cs.code === 'mine') {
    const mt = cs.my ? D.moneyTone(cs.my.money, cs.my.ccy, cs.my.pct) : null;
    const p = (cs.pos || [])[0];
    return { tone: mt ? mt.tone : 'flat', text: mt ? t('ts.st.mine', { v: mt.zero ? `±${F.money(0, cs.my.ccy, 0)}` : mt.text }) : t('ts.st.mine0'),
      btn: p ? { href: `#/obchod/${p.id}`, label: t('ts.b.mine') } : { sig: true, label: t('ts.b.detail') } };
  }
  if (cs.code === 'order') return { tone: 'gold', text: t(sell ? 'ts.st.orderSell' : 'ts.st.order', { v: D.spx(s, cs.ord.limit) }), btn: { href: `#/obchod/${cs.ord.id}`, label: t('ts.b.order') } };
  if (x.buy) {
    const btn = { invest: true, mode: cs.cta === 'limit' ? 'limit' : 'now', label: t(sell ? 'ts.b.sell' : 'ts.b.buy') };
    if (cs.code === 'buy') return { tone: 'up', text: t(sell ? 'ts.st.buySell' : 'ts.st.buy'), btn };
    if (cs.code === 'soon') { const o = nextUsOpen(now); return { tone: 'up', text: t(sell ? 'ts.st.soonSell' : 'ts.st.soon', { d: o ? D.whenLabel(o, now) : '' }), btn }; }
    return { tone: 'gold', text: t(sell ? 'ts.st.waitSell' : 'ts.st.wait', { v: D.spx(s, D.maxEntry(s)) }), btn };
  }
  return { tone: 'flat', text: t('ts.st.ended'), btn: { sig: true, label: t('ts.b.detail') } };
}
function tsCard(x, now, i, poor = false) {
  const { s } = x;
  const w = B.whatIs(s.symbol, s.name);
  const sell = s.action === 'SELL';
  const end = D.entryWindowEnd(s);
  const st = tsState(x, now);
  const b = st.btn;
  const btn = b.invest ? `<button type="button" class="btn btn-primary btn-block ts-btn" data-action="invest" data-id="${F.esc(s.id)}" data-mode="${b.mode}">${icon('spark', 'icon-sm')}<span>${F.esc(b.label)}</span></button>`
    : b.href ? `<button type="button" class="btn btn-primary btn-block ts-btn" data-action="ts-go" data-href="${F.esc(b.href)}"><span>${F.esc(b.label)}</span>${icon('chev-right', 'icon-sm')}</button>`
    : `<button type="button" class="btn btn-secondary btn-block ts-btn" data-action="open-signal" data-id="${F.esc(s.id)}"><span>${F.esc(b.label)}</span>${icon('chev-right', 'icon-sm')}</button>`;
  return `<article class="ts-card is-${F.esc(x.cs.code)}" style="--i:${Math.min(i, 6)}" data-live-id="${F.esc(s.id)}" data-sig="${F.esc(s.id)}">
    <button type="button" class="ts-top" data-action="open-signal" data-id="${F.esc(s.id)}" aria-label="${F.esc(t('ts.open', { n: w.name }))}">
      ${monogram(s.symbol, w.name)}<span class="ts-id"><b class="ts-name">${F.esc(w.name)}</b><span class="ts-do ${sell ? 'down' : 'up'}">${sell ? '↓' : '↑'} ${t(`c.side.${sell ? 'SELL' : 'BUY'}`)}</span></span>${icon('chev-right', 'icon-xs ts-chev')}</button>
    <p class="ts-when num">${icon('clock', 'icon-xs')}<span><span class="ts-sent">${F.esc(t('ts.sent', { d: sentText(s, now) }))}</span>${end ? `<span class="ts-until">${F.esc(t('ts.until', { d: D.whenLabel(new Date(end), now) }))}</span>` : ''}</span></p>
    <p class="ts-st tone-${st.tone}"><i aria-hidden="true"></i><span>${F.esc(st.text)}</span></p>
    ${btn}${b.invest && poor ? `<p class="ts-nofree">${t('ts.noFree')} <button type="button" class="link" data-action="w-load">${t('ts.noFreeGo')}</button></p>` : ''}
  </article>`;
}
function tsEarlier(list) {
  if (!list.length) return '';
  return `<div class="ts-early"><p class="ts-early-h">${t('ts.earlier')}</p>${list.map((x) => {
    const w = B.whatIs(x.s.symbol, x.s.name);
    const mine = x.cs.code === 'mine' || (x.cs.code === 'done' && x.cs.my);
    return `<button type="button" class="ts-erow" data-action="open-signal" data-id="${F.esc(x.s.id)}"><span class="ts-et num">${F.esc(F.time(new Date(Date.parse(x.s.created_at))))}</span><span class="ts-en">${F.esc(w.name)}</span><span class="ts-es">${F.esc(t(mine ? 'ts.e.mine' : 'ts.e.ended'))}</span>${icon('chev-right', 'icon-xs')}</button>`;
  }).join('')}</div>`;
}
export function todayBlock(ctx) {
  const now = ctx.now();
  const { main, earlier } = todaySignals(ctx.data, now);
  const when = nextCheck(ctx.data, now);
  /* A8 / K3-06: no free money for the smallest deposit -> say it under the buy button (with "Dobít") */
  const sm0 = W.summary(ctx.data);
  const poor = sm0.free < (D.DEP_MIN[sm0.w.ccy] || 0) + 0.5;
  const body = main.length ? `<div class="ts-list">${main.map((x, i) => tsCard(x, now, i, poor)).join('')}</div>`
    : `<p class="ts-empty">${il('08_cekani', 56, { lazy: false })}<span>${F.esc(t(earlier.length ? 'ts.none2' : 'ts.none', { when }))}</span></p>`;
  return `<section class="d-block d2-sig" id="d-today" aria-labelledby="d-new"><h2 class="d-h" id="d-new"><a href="#/signaly">${t('ts.h')}${main.length ? `<span class="num"> · ${main.length}</span>` : ''}${icon('chev-right', 'icon-xs')}</a></h2>
    ${body}${tsEarlier(earlier)}${main.length ? `<p class="ts-next">${icon('clock', 'icon-xs')}<span>${F.esc(t('ts.next', { when }))}</span></p>` : ''}${offLine(ctx.data)}</section>`;
}

/* (a) Kolik mám: the account value + today's result; one tap -> Portfolio */
function heroKolik(ctx) {
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  const p = W.parts(sm);
  const hd = P.head(sm);
  const td = D.moneyTone(sm.today, c, hd.todayPct);
  return `<a class="d-hero d2-hero" id="acc-card" href="#/portfolio">
    <span class="d-hero-l"><span class="d-k">${t('ts.kolik')}${icon('chev-right', 'icon-xs')}</span>
      <span class="d-hero-v num" data-eq="${p.eq}">${F.money(p.eq, c, 0)}</span>
      ${sm.todayReady === false ? `<span class="d-hero-ch dh-wait">${t('dh.todayWait')}</span>` /* 1.15.0 (A6): prices of my trades not on this device yet */
        : `<span class="d-hero-ch num tone-${td.tone}">${td.zero ? t('dh.today0', { v: `±${F.money(0, c, 0)}` }) : t('dh.today', { v: F.esc(td.text), p: F.mpct(hd.todayPct, sm.today) })}</span>`}
      <span class="d-hero-s num" data-free="${p.free}" data-inplay="${p.inPlay}">${t('ts.split', { f: F.money(p.free, c, 0), u: F.money(p.inPlay, c, 0) })}</span></span>
  </a>`;
}

/* 1.15.0 (A1) "Robot ukončil – ukončit taky?": my open trades whose robot trade has ended (P.robotExits), minus the ones
   I chose to keep ("Nechat"). The money figure is the same summary row as in "Jak se daří" below (never a second calculation). */
export function robotExitCard(ctx) {
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  const now = +ctx.now();
  const list = P.robotExits(ctx.data, sm.w).filter((x) => !P.isFollowOff(x.pos.id))
    .map((x) => ({ ...x, row: sm.rows.find((r) => r.id === x.pos.id) })).filter((x) => x.row);
  if (!list.length) return '';
  const n = list.length;
  const nm = (x) => B.whatIs(x.pos.sym, x.pos.name).name;
  const title = n === 1 ? t('rx.t1', { n: nm(list[0]) }) : t('rx.tN', { n, u: F.unit('trade', n) });
  const rows = list.map((x, i) => {
    const r = x.row;
    const when = x.at ? whenText(x.at, now) : '';
    const res = x.pnlPct != null ? ` (${F.spct(x.pnlPct, 1)})` : '';
    const mt = D.moneyTone(r.pnl, c, r.pnlPct);
    const mine = mt.zero ? `±${F.money(0, c, 0)}` : mt.text;
    return `<div class="rx-row${i >= 3 ? ' is-extra' : ''}" data-rx="${F.esc(r.id)}">
      <a class="rx-main" href="#/obchod/${F.esc(r.id)}">${monogram(r.sym, nm(x))}<span class="rx-id"><b class="rx-n">${F.esc(nm(x))}</b>
        <span class="rx-s num">${F.esc(when ? t('rx.when', { d: when, r: res }) : t('rx.when0', { r: res }))}</span>
        <span class="rx-me num tone-${mt.tone}">${F.esc(t('rx.me', { v: mine }))}</span></span></a>
      <span class="rx-b"><button type="button" class="btn btn-primary btn-small" data-action="h-close" data-id="${F.esc(r.id)}">${t('rx.close')}</button>
        <button type="button" class="btn btn-ghost btn-small rx-keep" data-action="rx-keep" data-id="${F.esc(r.id)}">${t('rx.keep')}</button></span>
    </div>`;
  }).join('');
  const more = n > 3 ? `<button type="button" class="alert-more rx-more" data-action="rx-all">${t('rx.all', { n })}</button>` : '';
  return `<section class="d-block rx-card" id="rx-card" aria-labelledby="rx-h"><h2 class="d-h rx-h" id="rx-h">${icon('robot', 'icon-sm')}<span>${F.esc(title)}</span></h2>
    <p class="rx-sub">${t('rx.sub')}</p><div class="rx-list">${rows}</div>${more}</section>`;
}

export function render(ctx) {
  const now = ctx.now();
  const dateLine = `${F.weekday(now)} ${F.dm(now)}`;
  const head = `<header class="page-head"><div><h1 class="page-title">${t('home.title')}</h1><p class="page-sub">${dateLine.charAt(0).toUpperCase() + dateLine.slice(1)}</p></div>
    <button type="button" class="icon-btn help-btn" data-action="tour" aria-label="${t('tour.open')}" title="${t('tour.open')}">${icon('help', 'icon-sm')}</button></header>`;
  if (!ctx.data?.signals) {
    if (ctx.state.error) return head + errorBlock();
    return head + `${skBlock(120, 22)}<div style="height:12px"></div>${skBlock(220)}`;
  }
  /* (c) Jak se daří tomu, co mám: the Portfolio summary + the trade rows (each opens its trade page) */
  const mine = `<section class="d-block d-mine-top d2-mine" aria-labelledby="d-mine"><h2 class="d-h" id="d-mine"><a href="#/portfolio">${t('ts.mineH')}${icon('chev-right', 'icon-xs')}</a></h2>${dnesBlock(ctx)}</section>`;
  return head + `<div class="d2-grid">
  ${heroKolik(ctx)}
  <div class="d2-sigcol">${robotExitCard(ctx)}${todayBlock(ctx)}${Den.cardHtml(now)}</div>
  ${mine}
  <div class="d2-more">${paths()}${B.statsRow(ctx.data, now)}</div>
  </div>
  ${ctx.state.fromCache ? `<p class="stale">${icon('offline', 'icon-sm')}${t('common.offlineData')}</p>` : ''}`;
}
