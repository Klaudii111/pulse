import * as F from '../format.js';
import * as store from '../store.js';
import { icon, seg, segMove, skBlock, ring, hzIcon } from '../ui.js';
import { equityChart } from '../charts.js';
import * as D from '../domain.js';
import { rTip } from './signals.js';
import { t } from '../i18n/index.js';

let chart = null;
const RANGES = [{ id: '1M', days: 31, label: '1M' }, { id: '3M', days: 92, label: '3M' }, { id: 'ALL', days: 9999, label: null }];

function rangeSeries(perf, id) {
  const r = RANGES.find((x) => x.id === id) || RANGES[2];
  const eq = perf.equity;
  const end = F.toDate(eq[eq.length - 1].date);
  const from = new Date(end - r.days * 86400000);
  const out = eq.filter((p) => F.toDate(p.date) >= from);
  return out.length > 1 ? out : eq;
}

function heroVals(series, p) {
  const b0 = series[0].bot, s0 = series[0].spy;
  const cur = p || series[series.length - 1];
  return { bot: (cur.bot / b0 - 1) * 100, spy: (cur.spy / s0 - 1) * 100, date: cur.date };
}

const tone = (v) => (v > 0.005 ? 'up' : v < -0.005 ? 'down' : '');
const byHz = (hist, hz) => hist.filter((x) => hz === 'ALL' || x.horizon === hz);
let histAll = false;
let histMonth = 'ALL';

function tiles(perf, hz, hist, showR) {
  const s = perf.by_horizon[hz] || perf.by_horizon.ALL;
  const arr = byHz(hist, hz);
  const w = arr.filter((x) => x.result_r > 0).length;
  const wr = arr.length ? w / arr.length : 0;
  const avgPct = arr.length ? arr.reduce((a, x) => a + (x.result_pct || 0), 0) / arr.length : 0;
  return `<div class="tiles">
    <div class="tile tile-ring">${ring(wr, `<b class="num" data-count="${(wr * 100).toFixed(2)}" data-dec="0" data-signed="0" data-count-key="wr-${hz}">${F.pct(wr * 100, 0)}</b>`, { size: 76, stroke: 6, cls: 'gold' })}
      <div><p class="tile-l">${t('res.winrate')}</p><p class="tile-s num">${t('res.winS', { w, n: arr.length })}</p></div></div>
    <div class="tile"><p class="tile-l">${t('res.avg')}</p><p class="tile-v num ${tone(avgPct)}">${F.spct(avgPct, 2)}</p><p class="tile-s">${showR ? `${t('res.ofAcc')}, ${rTip(s.expectancy_r)}` : t('res.ofAcc')}</p></div>
    <div class="tile"><p class="tile-l">${t('res.dd')}</p><p class="tile-v num down">${F.spct(s.max_dd_pct)}</p><p class="tile-s">${t('res.ddS')}</p></div>
  </div>`;
}

function monthly(hist, hz) {
  const m = new Map();
  byHz(hist, hz).forEach((x) => { const k = x.closed_at.slice(0, 7); m.set(k, (m.get(k) || 0) + (x.result_pct || 0)); });
  const keys = [...m.keys()].sort();
  if (!keys.length) return '';
  const max = Math.max(0.5, ...keys.map((k) => Math.abs(m.get(k))));
  return `<section class="card mcard" aria-label="${t('res.monthlyAria')}">
    <p class="card-t">${t('res.monthly')}<span class="card-tsub">${t('res.monthlyS')}</span></p>
    <div class="mbars" role="list">${keys.map((k) => {
      const v = m.get(k), hPct = (Math.abs(v) / max) * 100;
      return `<div class="mbar ${v >= 0 ? 'up' : 'down'}" role="listitem" aria-label="${F.monthYear(k + '-15')}: ${F.spct(v, 1)}">
        <span class="mbar-v num">${F.spct(v, 1)}</span>
        <span class="mbar-pos">${v >= 0 ? `<i style="height:${hPct}%"></i>` : ''}</span>
        <span class="mbar-neg">${v < 0 ? `<i style="height:${hPct}%"></i>` : ''}</span>
        <span class="mbar-m">${F.monShort(k + '-15')}</span>
      </div>`;
    }).join('')}</div>
  </section>`;
}

function horizons(perf) {
  const hs = ['DEN', 'DNY', 'TYDEN', 'MESIC'];
  const max = Math.max(1, ...hs.map((h) => Math.abs(perf.by_horizon[h]?.return_pct || 0)));
  return `<section class="card hcard" aria-label="${t('res.hzAria')}">
    <p class="card-t">${t('res.hz')}<span class="card-tsub">${t('res.hzS')}</span></p>
    <div class="hrows">${hs.map((h) => {
      const b = perf.by_horizon[h]; if (!b) return '';
      const w = (Math.abs(b.return_pct) / max) * 50;
      return `<button type="button" class="hrow" data-action="hz-pick" data-id="${h}">
        <span class="hrow-l">${hzIcon(h)}${F.HZ_LABEL[h]}</span>
        <span class="hbar"><span class="hbar-zero"></span><i class="${b.return_pct >= 0 ? 'up' : 'down'}" style="${b.return_pct >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`}"></i></span>
        <span class="hrow-v num ${tone(b.return_pct)}">${F.spct(b.return_pct)}</span>
        <span class="hrow-w num">${F.pct(b.win_rate, 0)}</span>
      </button>`;
    }).join('')}</div>
  </section>`;
}

function histRow(s, showR) {
  const tn = s.result_r > 0.05 ? 'up' : s.result_r < -0.05 ? 'down' : 'flat';
  return `<button class="hist-row" type="button" data-action="open-signal" data-id="${F.esc(s.id)}">
    <span class="hist-bar ${tn === 'flat' ? '' : tn}"></span>
    <span><span class="hist-sym">${F.esc(s.symbol)}<span class="tag ${s.action === 'SELL' ? 'sell' : ''}">${F.SIDE[s.action]}</span></span>
      <span class="hist-meta" style="display:block">${F.HZ_LABEL[s.horizon]}, ${F.STATUS_LABEL[s.status].toLowerCase()}, ${F.dm(s.closed_at)}</span></span>
    <span class="hist-res"><span class="hist-r num ${tn}" style="display:block">${F.spct(s.result_pct, 2)}</span>${showR ? `<span class="hist-p num" style="display:block">${F.sr(s.result_r)}</span>` : ''}</span>
  </button>`;
}

function historyBlock(hist, hz, showR = true) {
  const arr = byHz(hist, hz);
  if (!arr.length) return `<div class="empty"><h3>${t('res.empty.t')}</h3><p>${t('res.empty.s')}</p></div>`;
  if (!histAll) {
    return `<div class="hist-list">${arr.slice(0, 10).map((x) => histRow(x, showR)).join('')}
      ${arr.length > 10 ? `<button type="button" class="alert-more" data-action="hist-all">${t('res.showHistory', { n: arr.length })}</button>` : ''}</div>`;
  }
  const months = [...new Set(arr.map((x) => x.closed_at.slice(0, 7)))];
  if (histMonth !== 'ALL' && !months.includes(histMonth)) histMonth = 'ALL';
  const list = arr.filter((x) => histMonth === 'ALL' || x.closed_at.startsWith(histMonth));
  return `<div class="month-chips" role="group" aria-label="${t('res.month')}">
      <button type="button" class="range-chip" data-action="hist-month" data-id="ALL" aria-pressed="${histMonth === 'ALL'}">${t('res.rangeAll')}</button>
      ${months.map((k) => `<button type="button" class="range-chip" data-action="hist-month" data-id="${k}" aria-pressed="${histMonth === k}">${F.monthName(k + '-15')}</button>`).join('')}
    </div>
    <div class="hist-list">${list.map((x) => histRow(x, showR)).join('')}
      <button type="button" class="alert-more" data-action="hist-all">${t('res.collapse')}</button></div>`;
}

function lower(perf, hist, hz, showR) {
  return `<div class="res-lower">${monthly(hist, hz)}${horizons(perf)}</div>
  <h2 class="section-title">${t(histAll ? 'res.all' : 'res.last')}<small id="hist-count">${t('res.closed', { n: byHz(hist, hz).length })}</small></h2>
  <div class="hist" id="hist">${historyBlock(hist, hz, showR)}</div>`;
}

export function render(ctx) {
  const head = `<header class="page-head"><div><h1 class="page-title">${t('res.title')}</h1>
    <p class="page-sub">${ctx.data?.performance ? t('res.since', { date: F.dmy(ctx.data.performance.equity[0].date) }) : t('common.loading')}</p></div></header>`;
  const perf = ctx.data?.performance, hist = ctx.data?.history?.signals;
  if (!perf || !hist) return head + `${skBlock(320)}<div style="height:14px"></div>${skBlock(150)}`;
  const range = store.get('range', 'ALL');
  const hz = store.get('resHz', 'ALL');
  const showR = D.showR(ctx.data);
  const series = rangeSeries(perf, range);
  const h = heroVals(series);
  return head + `<div class="results-layout">
    <section class="chart-card" aria-label="${t('res.chart')}">
      <div class="chart-top">
        <div class="perf-hero glow">
          <div><p class="perf-legend"><i class="bot"></i>${t('res.robot')}</p><p class="perf-big num" id="h-bot" data-count="${h.bot.toFixed(4)}" data-dec="1" data-count-key="res-bot-${range}">${F.spct(h.bot)}</p></div>
          <div><p class="perf-legend"><i class="spy"></i>S&amp;P 500</p><p class="perf-mid num" id="h-spy">${F.spct(h.spy)}</p></div>
        </div>
      </div>
      <p class="perf-date" id="h-date" style="padding:0 16px">${t('fmt.range', { a: F.dmy(series[0].date), b: F.dmy(h.date) })}</p>
      <div class="chart-box" id="eq-chart"></div>
      <div class="range-chips" role="group" aria-label="${t('res.period')}">${RANGES.map((r) => `<button type="button" class="range-chip" data-action="range" data-id="${r.id}" aria-pressed="${r.id === range}">${r.label || t('res.rangeAll')}</button>`).join('')}</div>
      <table class="sr-only"><caption>${t('res.table')}</caption><thead><tr><th>${t('res.date')}</th><th>${t('robot')}</th><th>S&amp;P 500</th></tr></thead>
        <tbody>${series.filter((_, i) => i % 5 === 0).map((p) => { const v = heroVals(series, p); return `<tr><td>${F.dm(p.date)}</td><td>${F.spct(v.bot)}</td><td>${F.spct(v.spy)}</td></tr>`; }).join('')}</tbody></table>
    </section>
    <div class="results-side">
      ${seg({ name: 'resHz', small: true, label: t('res.hzStats'), items: [{ id: 'ALL', label: t('hz.ALL') }, ...['DEN', 'DNY', 'TYDEN', 'MESIC'].map((x) => ({ id: x, label: F.HZ_LABEL[x] }))], active: hz })}
      <div id="stats">${tiles(perf, hz, hist, showR)}</div>
      <p class="honest">${icon('info', 'icon-xs')} ${t('res.honest')}</p>
    </div>
  </div>
  <div id="res-lower">${lower(perf, hist, hz, showR)}</div>`;
}

export function mount(el, ctx) {
  const perf = ctx.data?.performance;
  if (!perf) return;
  chart && chart.destroy();
  const series = rangeSeries(perf, store.get('range', 'ALL'));
  const box = el.querySelector('#eq-chart');
  const first = !ctx.softRender;
  chart = equityChart(box, series, {
    animate: first,
    onScrub(i, p) {
      const h = heroVals(series, i == null ? null : p && { date: p.date, bot: series[i].bot, spy: series[i].spy });
      el.querySelector('#h-bot').textContent = F.spct(h.bot);
      el.querySelector('#h-spy').textContent = F.spct(h.spy);
      el.querySelector('#h-date').textContent = i == null ? t('fmt.range', { a: F.dmy(series[0].date), b: F.dmy(h.date) }) : F.dmy(h.date);
    },
  });
}

export function unmount() { chart && chart.destroy(); chart = null; }

function refreshLower(ctx) {
  const root = document.getElementById('view');
  const hz = store.get('resHz', 'ALL');
  root.querySelector('#stats').innerHTML = tiles(ctx.data.performance, hz, ctx.data.history.signals, D.showR(ctx.data));
  root.querySelector('#res-lower').innerHTML = lower(ctx.data.performance, ctx.data.history.signals, hz, D.showR(ctx.data));
}

export const actions = {
  range(el, ev, ctx) { store.set('range', el.dataset.id); ctx.rerender({ soft: true }); },
  'hist-all'(el, ev, ctx) {
    histAll = !histAll;
    refreshLower(ctx);
    if (!histAll) document.getElementById('hist')?.scrollIntoView({ block: 'nearest' });
  },
  'hist-month'(el, ev, ctx) { histMonth = el.dataset.id; refreshLower(ctx); },
  'hz-pick'(el, ev, ctx) {
    store.set('resHz', el.dataset.id);
    segMove(document.getElementById('view'), 'resHz', el.dataset.id);
    refreshLower(ctx);
  },
  seg(el, ev, ctx) {
    if (el.dataset.segName !== 'resHz') return false;
    store.set('resHz', el.dataset.id);
    segMove(document.getElementById('view'), 'resHz', el.dataset.id);
    refreshLower(ctx);
    return true;
  },
};
