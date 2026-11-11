import * as F from '../format.js';
import * as D from '../domain.js';
import { t, L } from '../i18n/index.js';
import { icon, skBlock, ladderGeometry, liveState, monogram, sparkline } from '../ui.js';
import { pricePoints } from '../charts.js';
import { withLive } from './results.js';
import { regimeLine, nextLine, disclaimer, emptyState, rTip, errorBlock, signalRow } from './signals.js';
import { paperHero } from './paper.js';
import { walletCard } from './terminal.js';
import { pushCta } from './more.js';
import * as Live from '../live.js';

/* Live market strip (ETF proxies, labelled honestly); a symbol missing in the live data is hidden */
const STRIP = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['DIA', 'Dow'], ['GLD', 'mkt.gold']];
function marketStrip() {
  const items = STRIP.map(([sym, name]) => {
    const q = Live.quote(sym);
    if (!q || !(q.pc > 0)) return '';
    const ch = (q.p / q.pc - 1) * 100;
    return `<span class="mk ${ch >= 0 ? 'up' : 'down'}"><span class="mk-n">${F.esc(name.startsWith('mkt.') ? t(name) : name)} <small>(${sym})</small></span><b class="num">${F.spct(ch, 2)}</b></span>`;
  }).filter(Boolean);
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
  'pos-all'(el) {
    const on = document.getElementById('pos-list').classList.toggle('show-all');
    el.textContent = on ? t('common.showLess') : t('common.showAllN', { n: el.dataset.n });
  },
  'alerts-all'(el) {
    const on = document.getElementById('alert-list').classList.toggle('show-all');
    el.textContent = on ? t('common.showLess') : t('common.showAll', { n: el.dataset.n });
  },
};

export function render(ctx) {
  const now = ctx.now();
  const dateLine = `${F.weekday(now)} ${F.dm(now)}`;
  const head = `<header class="page-head"><div><h1 class="page-title">${t('home.title')}</h1><p class="page-sub">${dateLine.charAt(0).toUpperCase() + dateLine.slice(1)}</p></div></header>`;
  if (!ctx.data?.signals) {
    if (ctx.state.error) return head + errorBlock();
    return head + `${skBlock(196, 22)}<div style="height:12px"></div>${skBlock(18, 8)}<div style="height:24px"></div>${skBlock(220)}`;
  }
  const s = ctx.data.signals;
  const showR = D.showR(ctx.data);
  const open = D.allOpen(ctx.data).filter((x) => D.horizonAllowed(ctx.data, x.horizon));
  const live = open.filter((x) => !x.intraday_hit);
  const fresh = open.filter((x) => D.isNew(x, ctx.data));
  const sumPct = open.reduce((a, x) => a + (x.pnl_r || 0) * (x.risk_pct_account || 0), 0);
  const al = alerts(ctx, open);
  const spark = withLive(ctx.data.performance?.equity || [], ctx.data).slice(-30).map((p) => p.bot);
  /* today's price line of a position (5-min points), shown once there are at least 3 of them */
  const daySpark = (x) => { const pp = pricePoints(x, 'today'); return pp.length >= 4 ? `<span class="pos-spark">${sparkline(pp.map((p) => p.p), { w: 56, h: 18 })}</span>` : ''; };
  const urgency = (x) => {
    const p = D.proximity(x);
    if (p) return p.dist;
    if (x.intraday_hit) return 10;
    return 20 - Math.abs(x.progress || 0);
  };
  const sorted = [...open].sort((a, b) => urgency(a) - urgency(b));
  const CAPP = 5;

  const headline = fresh.length ? t('home.headline', { n: fresh.length }) : live.length ? t('home.headlineHold', { n: live.length }) : t('home.headline0');
  return head + `
  <p class="headline">${headline}</p>
  ${marketStrip()}
  <div class="home-grid">
    <div class="home-main">
      ${nextLine(ctx.data, ctx.now())}
      ${paperHero(ctx)}
      <section class="hero ${sumPct >= 0 ? 'up' : 'down'}">
        <span class="aurora" aria-hidden="true"><i></i><i></i></span>
        <div class="hero-top"><p class="hero-l">${t('home.hero')}</p>${sparkline(spark, { w: 96, h: 32, cls: 'hero-spark' })}</div>
        <p class="hero-v num" data-count="${sumPct.toFixed(4)}" data-dec="2" data-count-key="home-hero">${F.spct(sumPct, 2)}</p>
        <p class="hero-s">${t('home.heroS', { ago: F.ago(s.generated_at, now) })}</p>
        <div class="hero-stats">
          <span><b class="num">${live.length}</b> ${t('home.open')}</span>
          ${open.length - live.length ? `<span><b class="num">${open.length - live.length}</b> ${t('home.closedToday')}</span>` : ''}
          <span><b class="num">${fresh.length}</b> ${t('home.new')}</span>
        </div>
      </section>
      ${regimeLine(s.regime)}
      ${walletCard(ctx)}
      ${fresh.length ? '' : emptyState(ctx, 'ALL')}
      ${ctx.state.fromCache ? `<p class="stale">${icon('offline', 'icon-sm')}${t('common.offlineData')}</p>` : ''}
      ${ctx.nudge || ''}
      ${pushCta()}
      <h2 class="section-title">${t('home.attention')}<small>${al.length ? `${al.length} ${F.unit('item', al.length)}` : ''}</small></h2>
      ${al.length ? alertList(al) : `<p class="quiet">${t('home.nothing')}</p>`}
    </div>
    <div class="home-side">
      <h2 class="section-title">${t('home.positions')}<small>${t('home.positionsS')}</small></h2>
      ${open.length ? `<div class="srow-list" id="pos-list">${sorted.map((x, i) => signalRow(x, now, i, { extra: i >= CAPP })).join('')}${open.length > CAPP ? `<button type="button" class="alert-more" data-action="pos-all" data-n="${open.length}">${t('common.showAllN', { n: open.length })}</button>` : ''}</div>` : `<p class="quiet">${t('home.noPositions')}</p>`}
    </div>
  </div>
  ${disclaimer()}`;
}
