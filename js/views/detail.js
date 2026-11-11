import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import { t, L, lang } from '../i18n/index.js';
import { icon, ladder, pill, openSheet, closeTopSheet, toast, copyText, liveState, ring, monogram, statusLine } from '../ui.js';
import * as Live from '../live.js';
import * as W from '../wallet.js';
import { priceChart, defaultPriceMode, hasToday, hasDays } from '../charts.js';
import { instrumentText, glossaryFor } from '../explain.js';
import { rTip, entryChip, nextUsOpen } from './signals.js';
import { vtSupported } from '../motion.js';
import { shareSignal } from '../share.js';
import * as B from '../brief.js';
import * as M from '../market.js';
import * as store from '../store.js';

/* 1.9.0 chart markers: ▲ robot bought (paper.json fill time), ▲ I bought (play money), ▼ exits */
function chartMarks(ctx, s) {
  const out = [];
  const dir = s.action === 'SELL' ? -1 : 1;
  const p = ctx.data?.paper;
  const twin = (id) => String(id || '').replace(/-\d+$/, '');
  const hit = (x) => x && x.signal_id && (x.signal_id === s.id || twin(x.signal_id) === twin(s.id));
  const rp = (p?.positions || []).find(hit);
  const rAt = rp && Date.parse(rp.filled_at || rp.opened_at || 0);
  if (rp && rAt) out.push({ t: rAt, p: +rp.avg_entry, dir, kind: 'robot', label: t('mark.robot') });
  (p?.closed || []).filter(hit).forEach((c) => {
    const a = Date.parse(c.filled_at || c.opened_at || 0); if (a && c.avg_entry) out.push({ t: a, p: +c.avg_entry, dir, kind: 'robot', label: t('mark.robot') });
    const b = Date.parse(c.closed_at || 0); if (b && c.exit) out.push({ t: b, p: +c.exit, dir: -dir, kind: 'exit', label: t('mark.robotOut') });
  });
  const w = store.get('wallet', null);
  (w?.positions || []).filter((x) => x.sigId === s.id).forEach((x) => out.push({ t: x.entryT || x.openedAt, p: x.entry, dir: x.side === 'SELL' ? -1 : 1, kind: 'me', label: t('mark.me') }));
  (w?.closed || []).filter((x) => x.sigId === s.id).forEach((x) => {
    out.push({ t: x.entryT || x.openedAt, p: x.entry, dir: x.side === 'SELL' ? -1 : 1, kind: 'me', label: t('mark.me') });
    out.push({ t: x.closedAt, p: x.exit, dir: x.side === 'SELL' ? 1 : -1, kind: 'exit', label: t('mark.meOut') });
  });
  const ex = s.status !== 'open' || s.intraday_hit ? D.exitPrice(s) : null;
  const exAt = Date.parse(s.closed_at || s.hit_at || 0);
  if (ex && exAt) out.push({ t: exAt, p: ex, dir: -dir, kind: 'exit', label: t('mark.end') });
  return out;
}
export const verifyUrl = (sym) => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(M.tvSym(sym) || tvSymbol(sym))}`;

let chartRef = null;
let liveOff = null;

/* TradingView symbol for the live candlestick chart (free official widget). */
const TV = { US500: 'FOREXCOM:SPXUSD', US100: 'FOREXCOM:NSXUSD', US30: 'FOREXCOM:DJI', DE40: 'XETR:DAX', UK100: 'FOREXCOM:UKXGBP',
  JP225: 'FOREXCOM:JP225', EURUSD: 'FX:EURUSD', GBPUSD: 'FX:GBPUSD', USDJPY: 'FX:USDJPY', XAUUSD: 'OANDA:XAUUSD' };
export const tvSymbol = (sym) => TV[sym] || sym.replace('-', '.');
export function mountTV(box, sym) {
  box.hidden = false;
  box.innerHTML = '<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div></div>';
  const sc = document.createElement('script');
  sc.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  sc.async = true;
  sc.text = JSON.stringify({ autosize: true, symbol: sym, interval: '5', timezone: 'Europe/Prague', theme: 'dark', style: '1',
    locale: lang() === 'cs' ? 'cs' : 'en', allow_symbol_change: false, hide_side_toolbar: true, withdateranges: true, calendar: false,
    support_host: 'https://www.tradingview.com' });
  box.firstChild.appendChild(sc);
}

/* What the deposited money does at different leverage: price move to target / stop times the leverage. */
const LEVS = [1, 2, 5, 10, 20, 30];
function levTable(s, lev) {
  if (!(s.entry > 0) || s.stop == null) return '';
  const up = s.target != null ? Math.abs(s.target - s.entry) / s.entry * 100 : null;
  const dn = Math.abs(s.entry - s.stop) / s.entry * 100;
  /* ESMA retail caps (EU): shares and ETFs 1:5, major indices and gold 1:20, major currency pairs 1:30 */
  const IDX = ['US500', 'US100', 'US30', 'DE40', 'UK100', 'JP225', 'XAUUSD'];
  const FX = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'];
  const legal = FX.includes(s.symbol) ? 30 : IDX.includes(s.symbol) ? 20 : 5;
  /* example deposit (margin) the user puts into the trade, in money */
  const cs = lang() === 'cs';
  const dep = cs ? 10000 : 500, ccy = cs ? 'CZK' : 'USD';
  const rows = LEVS.map((L) => {
    const loss = Math.min(100, dn * L);
    const gainM = up == null ? null : dep * up * L / 100, lossM = dep * loss / 100;
    const over = legal && L > legal;
    return `<tr class="${over ? 'is-over' : ''}"><td class="num">1:${L}</td>
      <td class="num up">${up == null ? '–' : `+${F.money(gainM, ccy, 0)}<small>${F.spct(up * L, 1)}</small>`}</td>
      <td class="num down">−${F.money(lossM, ccy, 0)}<small>${loss >= 100 ? t('lev.all') : F.spct(-loss, 1)}</small></td>
      <td>${over ? t('lev.overLegal') : ''}</td></tr>`;
  }).join('');
  return `<section class="levtab" aria-label="${t('lev.title')}"><h3 class="sheet-label">${t('lev.title')}</h3>
    <p class="why-s">${t('lev.sub', { up: up == null ? '–' : F.pct(up, 1), dn: F.pct(dn, 1), dep: F.money(dep, ccy, 0) })}</p>
    <table><thead><tr><th>${t('lev.col')}</th><th>${t('lev.colTarget')}</th><th>${t('lev.colStop')}</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p class="why-s">${t('lev.note')}</p></section>`;
}

/* Live price ticks update the open detail sheet in place (price, P&L, chart, ladder). */
function onLiveDetail(el, ctx, s) {
  const KEYS = ['last_price', 'last_price_at', 'pnl_pct_position', 'pnl_r', 'progress', 'price_path', 'intraday_hit', 'hit_at'];
  const fn = () => {
    const f = D.findSignal(ctx.data, s.id);
    if (!f || !el.isConnected) return;
    KEYS.forEach((k) => { s[k] = f[k]; });
    const lp = el.querySelector('.live-price');
    if (lp && s.last_price != null) {
      const old = parseFloat(lp.dataset.v);
      lp.textContent = F.price(s.last_price); lp.dataset.v = s.last_price;
      if (Number.isFinite(old) && old !== s.last_price) {
        lp.classList.remove('tick-up', 'tick-down'); void lp.offsetWidth;
        lp.classList.add(s.last_price > old ? 'tick-up' : 'tick-down');
      }
    }
    const ago = el.querySelector('.live-ago'); if (ago) ago.textContent = F.ago(s.last_price_at, ctx.now());
    const pnl = el.querySelector('.live-row .pnl');
    if (pnl) {
      pnl.classList.toggle('up', (s.pnl_r ?? 0) >= 0); pnl.classList.toggle('down', (s.pnl_r ?? 0) < 0);
      const pp = pnl.querySelector('.pnl-pct'); if (pp) pp.textContent = F.spct(s.pnl_pct_position, 2);
      const pr = pnl.querySelector('.pnl-r'); if (pr && D.showR(ctx.data)) pr.innerHTML = rTip(s.pnl_r);
    }
    const lad = el.querySelector('[data-vt="ladder"]'); if (lad) lad.innerHTML = ladder(s, { large: true });
    const sl = el.querySelector('[data-status]'); if (sl) sl.innerHTML = statusLine(s, { now: ctx.now(), big: true });
    const cta = el.querySelector('#cta'); if (cta) cta.innerHTML = ctaHtml(ctx, s);
    const cb = el.querySelector('[data-j="close"]'); if (cb && s.last_price != null) cb.textContent = t('j.closeAt', { price: F.price(s.last_price) });
    chartRef && chartRef.refresh && chartRef.refresh();
  };
  document.addEventListener('pulse:live', fn);
  return () => document.removeEventListener('pulse:live', fn);
}

export function openDetail(ctx, id, sourceEl = null, { focus = null } = {}) {
  const s = D.findSignal(ctx.data, id);
  if (!s) { toast(t('det.notFound')); return; }
  /* 1.9.0: the chart opens on today's live line ("Živě") whenever there is one */
  let pmode = hasToday(s) && s.status === 'open' && !s.intraday_hit ? 'today' : defaultPriceMode(s);
  const now = ctx.now();
  const isOpen = s.status === 'open';
  let state = liveState(s);
  if (state === 'open' && D.isTimeExit(s, now)) state = 'time_exit';
  const events = D.eventsFor(s, ctx.data.calendar?.events || []);
  const ex = s.explanation;
  const left = F.daysUntil(s.exit_date, now);
  const created = F.toDate(s.created_at), exit = F.toDate(s.exit_date + 'T22:00:00');
  const elapsed = Math.max(0, Math.min(100, ((now - created) / (exit - created)) * 100));
  const up = (s.pnl_r ?? s.result_r ?? 0) >= 0;
  const showR = D.showR(ctx.data);
  const R = (v) => (showR ? rTip(v) : '');
  const est = D.entryState(s, now);
  const risk = D.riskFor(s);
  const lev = D.leverageInfo(ctx.data, s);
  const lines = D.orderLines(s);
  const prox = D.proximity(s);
  const hitKey = { target: 'sig.hit.target', stop: 'sig.hit.stop', time_exit: 'det.timeExit' };

  let status = '';
  if (isOpen && state === 'open' && s.last_price != null) {
    status = `<div class="live-row">
      <div><p class="kv-l">${t('det.price')}</p><p class="live-price num" data-v="${s.last_price}">${F.price(s.last_price)}</p><p class="kv-l live-ago">${F.ago(s.last_price_at, now)}</p></div>
      <div class="pnl ${up ? 'up' : 'down'}"><p class="kv-l">${t('det.robotFromEntry')}</p><div class="pnl-pct num">${F.spct(s.pnl_pct_position, 2)}</div>${showR ? `<div class="pnl-r num">${R(s.pnl_r)}</div>` : ''}</div>
    </div>`;
  } else if (isOpen) {
    status = `<div class="result-banner ${state === 'target' ? 'up' : state === 'stop' ? 'down' : ''}">
      <div><p class="kv-l">${t(hitKey[state])}${s.hit_at ? t('sig.hit.at', { time: F.time(s.hit_at) }) : ''}</p><p class="big num">${F.spct(s.pnl_pct_position, 2)}</p></div>
      ${showR ? `<div style="text-align:right"><p class="kv-l">${t('det.inR')}</p><p class="mid num">${R(s.pnl_r)}</p></div>` : ''}</div>`;
  } else {
    status = `<div class="result-banner ${s.result_r > 0 ? 'up' : s.result_r < 0 ? 'down' : ''}">
      <div><p class="kv-l">${t('det.robotAcc', { status: F.STATUS_LABEL[s.status], date: s.closed_at ? F.dm(s.closed_at) : '' })}</p><p class="big num">${F.spct(s.result_pct, 2)}</p></div>
      ${showR ? `<div style="text-align:right"><p class="kv-l">${t('det.inR')}</p><p class="mid num">${R(s.result_r)}</p></div>` : ''}</div>`;
  }

  /* 1.9.0: the four answers first – co to je (head), co mám udělat já, co udělal robot, jak se daří – then the chart */
  const us = B.userState(s, now);
  const td = B.todo(s, us, now);
  const bot = B.robotLine(s, ctx.data);
  const brief = `<div class="d-brief">
      <p class="bc-tags">${B.stateChip(s, us)}<span class="hz-tag">${F.esc(F.HZ_LABEL[s.horizon] || '')}</span>${s.preview ? `<span class="hz-tag is-preview">${t('sig.preview')}</span>` : ''}</p>
      <p class="bc-pub">${icon('clock', 'icon-xs')}<span>${F.esc(B.published(s))}</span></p>
      <p class="bc-todo is-big b-todo tone-${td.tone}">${F.esc(td.text)}</p>${td.sub ? `<p class="bc-sub">${F.esc(td.sub)}</p>` : ''}
      ${bot ? `<p class="bc-bot b-bot">${icon('shield', 'icon-xs')}<span>${F.esc(bot)}</span></p>` : ''}
      ${B.robotPosOf(s, ctx.data) ? `<p class="bc-lv d-open">${F.esc(B.robotOpenText(B.robotPosOf(s, ctx.data), ctx.data, s.stop))}</p>` : ''}
      ${(store.get('wallet', null)?.positions || []).filter((p) => p.sigId === s.id).map((p) => `<p class="bc-lv d-open is-mine">${F.esc(B.myOpenText(p, store.get('wallet', null).ccy))}</p>`).join('')}
    </div>`;
  const mk = new Set(chartMarks(ctx, s).map((m) => m.kind));
  const legend = mk.size ? `<p class="pc-legend">${mk.has('robot') ? `<span class="lg-robot">▲ ${t('mark.robot')}</span>` : ''}${mk.has('me') ? `<span class="lg-me">▲ ${t('mark.me')}</span>` : ''}${mk.has('exit') ? `<span class="lg-exit">▼ ${t('mark.exit')}</span>` : ''}</p>` : '';
  const chartHtml = s.price_path?.length > 1 ? `<div class="pchart">
        <div class="pchart-headrow"><div class="range-chips pchart-modes" role="group" aria-label="${t('det.chartMode')}">
          ${hasToday(s) ? `<button type="button" class="range-chip" data-pmode="today" aria-pressed="${pmode === 'today'}">${t('det.chart1D')}</button>` : ''}
          ${hasDays(s) ? `<button type="button" class="range-chip" data-pmode="5d" aria-pressed="${pmode === '5d'}">${t('det.chart5D')}</button>` : ''}
          <button type="button" class="range-chip" data-pmode="all" aria-pressed="${pmode === 'all'}">${t('det.chartAll')}</button>
          <button type="button" class="range-chip" data-pmode="tv" aria-pressed="false">${t('det.chartTV')}</button></div>
          <span class="live-stamp" data-stamp></span></div>
        ${legend}
        <div class="pchart-box" id="pchart"></div>
        <div class="tv-box" id="tvbox" hidden></div>
        <a class="link verify-link" href="${verifyUrl(s.symbol)}" target="_blank" rel="noopener">${t('u.verify')}${icon('external', 'icon-xs')}</a>
        ${isOpen && state === 'open' ? `<p class="pchart-note">${left > 0 ? t('det.left', { n: left }) : left === 0 ? t('det.exitToday') : t('det.exitPassed')}</p>` : ''}</div>` : '';
  status = brief + `<div data-status>${statusLine(s, { now, big: true })}</div>` + chartHtml + status;
  const j = D.journal()[s.id];
  const html = `
    <div class="sheet-head">
      <div class="sheet-id">${monogram(s.symbol, s.name)}<div><div class="sig-tl"><span class="d-name b-what">${F.esc(B.whatIs(s.symbol, s.name).name)}</span><span class="ticker" data-vt="ticker">${F.esc(s.symbol)}</span></div>
        <p class="sheet-sub">${F.esc(B.whatIs(s.symbol, s.name).phrase)}</p></div></div>
      <div class="sheet-head-r">
        <button class="icon-btn fav-btn" type="button" data-action="follow" data-id="${F.esc(s.id)}" data-sym="${F.esc(s.symbol)}" aria-pressed="${D.isFollowed(s.id)}" aria-label="${t(D.isFollowed(s.id) ? 'fol.off' : 'fol.on')}" title="${t('fol.t')}">${icon('star', 'icon-sm')}</button>
        <button class="icon-btn" type="button" data-share aria-label="${t('share.btn')}" title="${t('share.btn')}">${icon('share', 'icon-sm')}</button>
        <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button>
      </div>
    </div>
    <div class="sheet-body">
      ${status}
      ${prox ? `<p class="prox-line ${prox.side === 'stop' ? 'down' : 'up'}">${icon('alert', 'icon-xs')}${t('det.prox', { v: F.pct(prox.dist, 1), side: t(`det.prox.${prox.side}`) })}</p>` : ''}
      <div data-vt="ladder">${ladder(s, { large: true, exitPrice: isOpen ? null : D.exitPrice(s) })}</div>
      ${isOpen && state === 'open' ? `<section class="howto" aria-label="${t('det.howto.aria')}">
        <div class="howto-head"><h3 class="howto-t">${t('det.howto')}</h3><button class="btn btn-secondary btn-small" type="button" data-copy-order>${icon('copy', 'icon-sm')}${t('common.copy')}</button></div>
        <ol class="howto-l num">${lines.map((l) => `<li>${F.esc(l)}</li>`).join('')}</ol>
        ${est && (est.code === 'late' || est.code === 'expired') ? `<p class="howto-warn">${t('det.howto.warn')}</p>` : ''}
      </section>` : ''}
      ${isOpen && state === 'open' ? `<div class="sheet-cta" id="cta">${ctaHtml(ctx, s)}</div>` : ''}
      <div class="kv">
        <div class="kv-item"><p class="kv-l">${t('det.yourRisk')}</p><p class="kv-v num down">${F.spct(-risk.risk)}</p><p class="kv-s">${risk.profile ? t('det.byProfile', { p: F.esc(risk.profile.toLowerCase()) }) : t('det.botSuggest')}</p></div>
        <div class="kv-item"><p class="kv-l">${t('det.yourTarget')}</p><p class="kv-v num up">${F.spct(risk.target)}</p><p class="kv-s">${t('det.targetHit')}</p></div>
        <div class="kv-item"><p class="kv-l">${t('det.rr')}</p><p class="kv-v num">${F.rr(s.rr)}</p><p class="kv-s">${t('det.rrS', { v: F.num(s.rr, 1) })}</p></div>
        <div class="kv-item"><p class="kv-l">${t('det.lev')}</p><p class="kv-v num">${t('det.levMax', { v: lev.effective })}</p><p class="kv-s">${t('lev.text', { legal: lev.legal, level: lev.level })}</p></div>
      </div>
      <p class="acct-note">${icon('info', 'icon-xs')}<span>${t('det.acctNote', { r: F.pct(risk.risk, risk.risk % 1 ? 1 : 0), t: F.spct(risk.target, 1), p: s.target ? F.pct(Math.abs(s.target - s.entry) / s.entry * 100, 1) : '–' })}</span></p>
      ${levTable(s, lev)}
      ${isOpen && state === 'open' ? `<div class="exit-ring">
        ${ring(elapsed / 100, left > 0 ? `<b class="num">${left}</b><small>${F.unit('day', left)}</small>` : `<b>${t('det.todayShort')}</b>`, { size: 72, stroke: 5, cls: 'gold' })}
        <div class="timeline-row"><div>${t('det.exitLatest')}<b class="num">${F.dm(s.exit_date)} ${F.weekday(s.exit_date)}</b></div><div>${t('det.created')}<b class="num">${F.dmTime(s.created_at)}</b></div></div>
      </div>` : `<div class="timeline"><div class="timeline-row"><div>${t('det.created')}<b class="num">${F.dmTime(s.created_at)}</b></div><div>${t('det.exitLatest')}<b class="num">${F.dm(s.exit_date)} ${F.weekday(s.exit_date)}</b></div></div></div>`}
      ${events.length ? `<div class="callout warn">${icon('calendar')}<div>${t('det.events', { list: events.map((e) => `${F.esc(L(e.title))} (${F.dm(e.date)}${e.time ? ` ${e.time}` : ''})`).join(', ') })}</div></div>` : ''}

      ${instrumentText(s.symbol) ? `<h3 class="sheet-label">${t('det.what')}</h3><p class="why">${F.esc(instrumentText(s.symbol))}</p>` : ''}
      <h3 class="sheet-label">${t('det.why')}</h3>
      ${ex?.summary ? `<p class="why">${F.esc(L(ex.summary))}</p>` : (ex && (ex.cs || ex.en) ? `<p class="why">${F.esc(L(ex))}</p>` : '')}
      ${ex?.strategies?.length ? `<p class="why-l">${t('det.strategies')}</p><div class="chips" style="margin-top:8px">${ex.strategies.map((x) => `<span class="chip chip-gold">${F.esc(L(x))}</span>`).join('')}</div>` : ''}
      <ul class="reasons">${(s.reasons || []).map((r) => `<li>${icon('check')}${F.esc(L(r))}</li>`).join('')}</ul>
      ${ex?.expect || ex?.invalidation ? `<div class="why-grid">
        ${ex.expect ? `<div><p class="why-l">${t('det.expect')}</p><p>${F.esc(L(ex.expect))}</p></div>` : ''}
        ${ex.invalidation ? `<div><p class="why-l">${t('det.invalid')}</p><p>${F.esc(L(ex.invalidation))}</p></div>` : ''}
      </div>` : ''}

      <details class="gloss"><summary>${t('det.gloss')}</summary><ul>${glossaryFor(s, [L(ex?.summary || ''), ...(s.reasons || []).map((r) => L(r)), L(ex?.expect || ''), L(ex?.invalidation || ''), typeof ex === 'object' && !ex?.summary ? L(ex) : ''])
        .map((g) => `<li>${F.esc(g)}</li>`).join('')}</ul></details>

      <h3 class="sheet-label">${t('det.journal')}</h3>
      <div class="journal-box" id="jbox">${journalForm(s, j)}</div>

      <div class="sheet-actions btn-stack">
        <button class="btn btn-secondary btn-block" type="button" data-share>${icon('share', 'icon-sm')}${t('share.btn')}</button>
        ${isOpen && state === 'open' ? `<a class="btn btn-secondary btn-block" href="#/kalkulacka?s=${encodeURIComponent(s.id)}" data-close-nav>${t('det.calcBtn')}</a>` : ''}
        ${isOpen && state === 'open' ? brokerButton() : ''}
        ${isOpen && state === 'open' ? `<div class="mt5-links"><a class="link" href="${CONFIG.MT5.DOWNLOAD_URL}" target="_blank" rel="noopener">${icon('external', 'icon-xs')}${t('mt5.open')}</a><a class="link" href="#/mt5" data-close-nav>${t('mt5.help')}</a></div>` : ''}
      </div>
    </div>`;

  const mount = (el) => {
    el.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
    const box = el.querySelector('#pchart');
    const isLive = () => s.status === 'open' && !s.intraday_hit && Live.stamp(Date.parse(s.last_price_at || 0)).code === 'live';
    if (box) setTimeout(() => { chartRef = priceChart(box, s, { mode: () => pmode, isLive, marks: () => chartMarks(ctx, s) }); }, 30);
    if (focus === 'chart') setTimeout(() => { const c = el.querySelector('.pchart'); if (c) c.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, 420);
    let tvOn = false;
    el.querySelectorAll('[data-pmode]').forEach((b) => b.addEventListener('click', () => {
      const m = b.dataset.pmode;
      el.querySelectorAll('[data-pmode]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.pmode === m)));
      const tvb = el.querySelector('#tvbox');
      if (m === 'tv') {
        box.hidden = true; tvb.hidden = false;
        if (!tvOn) { tvOn = true; mountTV(tvb, M.tvSym(s.symbol) || tvSymbol(s.symbol)); }
        return;
      }
      box.hidden = false; if (tvb) tvb.hidden = true;
      pmode = m;
      chartRef && chartRef.refresh && chartRef.refresh();
    }));
    const stampEl = el.querySelector('[data-stamp]');
    const tickStamp = () => {
      if (!stampEl || !el.isConnected) return;
      if (s.status !== 'open') { stampEl.textContent = ''; return; }
      const st = Live.stamp(Date.parse(s.last_price_at || 0));
      stampEl.className = `live-stamp is-${st.code}`; stampEl.innerHTML = `<i aria-hidden="true"></i>${F.esc(st.text)}`;
    };
    tickStamp();
    const stampTimer = setInterval(() => { if (!el.isConnected) clearInterval(stampTimer); else tickStamp(); }, 1000);
    liveOff = onLiveDetail(el, ctx, s);
    el.querySelectorAll('[data-close-nav]').forEach((a) => a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const href = ev.currentTarget.getAttribute('href');
      closeTopSheet();
      setTimeout(() => { (window.__pulseGo ? window.__pulseGo(href) : (location.hash = href)); }, 380);
    }));
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-j]');
      if (b) onJournal(el, s, b.dataset.j);
      if (ev.target.closest('[data-broker]')) openBroker(ctx, s);
      const sh = ev.target.closest('[data-share]');
      if (sh && !sh.disabled) {
        sh.disabled = true;
        shareSignal(s).then((r) => {
          sh.disabled = false;
          if (r === 'downloaded') toast(t('share.saved'));
          else if (r === 'failed') toast(t('share.failed'));
        });
      }
      if (ev.target.closest('[data-stopnow]')) {
        const ids = (W.get().positions || []).filter((p) => p.sigId === s.id).map((p) => p.id);
        let tot = 0; ids.forEach((id) => { const r = W.close(ctx.data, id); if (r) tot += r.pnl; });
        toast(t('st.stopNowDone', { m: (tot > 0.5 ? '+' : '') + F.money(tot, W.get().ccy, 0) }), { timeout: 6000 });
        const c = el.querySelector('#cta'); if (c) { c.innerHTML = ctaHtml(ctx, s); c.classList.add('pop'); }
        const jb = el.querySelector('#jbox'); if (jb) jb.innerHTML = journalForm(s, D.journal()[s.id]);
      }
      if (ev.target.closest('[data-copy-order]')) {
        copyText(`${s.symbol} ${F.SIDE[s.action]}\n${lines.join('\n')}`).then((ok) => toast(ok ? t('det.howto.copied') : t('common.copyFailed')));
      }
    });
  };
  const opts = { html, label: t('det.aria', { sym: s.symbol }), onMount: mount, onClose() { liveOff && liveOff(); liveOff = null; chartRef && chartRef.destroy(); chartRef = null; ctx.rerender({ soft: true }); } };

  // Shared-element morph: card ticker + ladder -> sheet (View Transitions API)
  const srcTicker = sourceEl?.querySelector?.('.ticker');
  const srcLadder = sourceEl?.querySelector?.('.ladder');
  if (vtSupported() && srcTicker && srcLadder) {
    srcTicker.style.viewTransitionName = 'vt-ticker';
    srcLadder.style.viewTransitionName = 'vt-ladder';
    const vt = document.startViewTransition(() => {
      srcTicker.style.viewTransitionName = '';
      srcLadder.style.viewTransitionName = '';
      const el = openSheet({ ...opts, instant: true });
      el.querySelector('[data-vt="ticker"]').style.viewTransitionName = 'vt-ticker';
      el.querySelector('[data-vt="ladder"] .ladder').style.viewTransitionName = 'vt-ladder';
    });
    vt.ready?.catch(() => {}); vt.updateCallbackDone?.catch(() => {});
    vt.finished.catch(() => {}).finally(() => {
      document.querySelectorAll('.sheet [data-vt="ticker"], .sheet [data-vt="ladder"] .ladder').forEach((n) => { n.style.viewTransitionName = ''; });
    });
    return;
  }
  openSheet(opts);
}

/* Sticky action bar: my fictional position on this signal -> "Ukončit teď"; otherwise invest + how to stop at a broker */
function ctaHtml(ctx, s) {
  const mine = (W.get().positions || []).filter((p) => p.sigId === s.id);
  const um = D.userMoney(s);
  const sm = (v, c) => (v > 0.5 ? '+' : '') + F.money(v, c, 0);
  if (mine.length) {
    const sum = W.summary(ctx.data).rows.filter((p) => p.sigId === s.id).reduce((a, p) => a + p.pnl, 0);
    return `<button type="button" class="btn btn-block btn-stopnow ${sum >= 0 ? 'up' : 'down'}" data-stopnow>${icon('close', 'icon-sm')}${t('st.stopNow')}<b class="num">${sm(sum, W.get().ccy)}</b></button>
      <p class="inv-note">${t('st.stopNowMine')}</p>`;
  }
  return `<a class="btn btn-primary btn-block btn-invest" href="#/terminal?s=${encodeURIComponent(s.id)}" data-close-nav>${icon('spark', 'icon-sm')}${t('inv.btn')}</a>
    <p class="inv-note">${um.now != null ? t('st.stopNowS', { m: sm(um.now, um.ccy) }) : t('inv.fict')}</p>`;
}

function journalForm(s, j) {
  const st = j?.state || null;
  if (st === 'closed') {
    const r = D.myResult(s, j);
    const up = (r?.pct ?? 0) >= 0;
    return `<div class="jclosed ${up ? 'up' : 'down'}">
        <div><p class="kv-l">${t('j.closedAt', { date: F.dmTime(j.closedAt), price: F.price(j.exit) })}</p>
        <p class="big num">${F.spct(r?.pct ?? 0, 2)}${r?.money != null ? ` <small>${F.money(r.money, j.ccy)}</small>` : ''}</p></div>
        <button type="button" class="btn btn-secondary btn-small" data-j="reopen">${t('j.reopen')}</button>
      </div>
      <p class="jnote">${t('j.closedNote')}</p>`;
  }
  return `<div class="jchoice" role="radiogroup" aria-label="${t('det.journal')}">
      <button type="button" class="jbtn" role="radio" aria-checked="${st === 'in'}" data-j="in">${icon('check', 'icon-sm')}${t('j.in')}</button>
      <button type="button" class="jbtn" role="radio" aria-checked="${st === 'out'}" data-j="out">${icon('close', 'icon-sm')}${t('j.out')}</button>
    </div>
    ${st === 'in' ? `<div class="jform">
      <label><span>${t('j.myEntry')}</span><input class="jin num" inputmode="decimal" id="j-entry" value="${F.esc(F.num(j.entry || s.entry, 2).replace(/−/, '-'))}"></label>
      <label><span>${t('j.size', { ccy: D.calcState().ccy })}</span><input class="jin num" inputmode="decimal" id="j-size" value="${F.esc(j.size ? String(Math.round(j.size)) : '')}" placeholder="${t('j.sizePh')}"></label>
      <button type="button" class="btn btn-secondary btn-small" data-j="save">${t('common.save')}</button>
    </div>` : ''}
    ${st !== 'out' && s.status === 'open' && !s.intraday_hit && s.last_price != null && new Date() >= (nextUsOpen(s.created_at) || 0) ? `<div class="jclose">
      <div><p class="card-t">${t('j.closeEarly')}</p><p class="card-s">${t('j.closeEarly.s')}</p></div>
      <button type="button" class="btn btn-primary btn-small" data-j="close">${t('j.closeAt', { price: F.price(s.last_price) })}</button>
    </div>` : ''}
    <p class="jnote">${t('j.local')}</p>`;
}

function onJournal(el, s, what) {
  const box = el.querySelector('#jbox');
  const cur = D.journal()[s.id];
  if (what === 'in') {
    D.setJournal(s.id, { state: 'in', entry: cur?.entry || s.entry, size: cur?.size || null, ccy: D.calcState().ccy });
  } else if (what === 'out') {
    if (cur?.state === 'out') D.setJournal(s.id, null); else D.setJournal(s.id, { state: 'out' });
  } else if (what === 'close') {
    if (!(s.last_price > 0)) return;
    D.setJournal(s.id, { ...(cur || {}), state: 'closed', entry: cur?.entry || s.entry, exit: s.last_price, closedAt: Date.now(), ccy: cur?.ccy || D.calcState().ccy });
    const r = D.myResult(s, D.journal()[s.id]);
    toast(t('j.closedToast', { v: F.spct(r?.pct ?? 0, 2) }));
  } else if (what === 'reopen') {
    const e = { ...(cur || {}) }; delete e.exit; delete e.closedAt;
    D.setJournal(s.id, { ...e, state: 'in' });
  } else if (what === 'save') {
    const entry = F.parseNum(el.querySelector('#j-entry').value);
    const size = F.parseNum(el.querySelector('#j-size').value);
    if (!(entry > 0)) { toast(t('j.badEntry')); return; }
    D.setJournal(s.id, { state: 'in', entry, size: size > 0 ? size : null, ccy: D.calcState().ccy });
    toast(t('j.saved'));
  }
  box.innerHTML = journalForm(s, D.journal()[s.id]);
}

const brokerMode = () => (CONFIG.BROKER_MODE === 'live' ? 'live' : 'demo');
const brokerList = () => CONFIG.BROKERS.filter((b) => (brokerMode() === 'live' ? b.live_url : b.demo_url));
function brokerButton() {
  if (!CONFIG.BROKER_HANDOFF_ENABLED) {
    return `<button class="btn btn-secondary btn-block btn-two-line" type="button" disabled aria-disabled="true"><span class="btn-line">${icon('external', 'icon-sm')}${t('broker.btn')}</span><span class="btn-note">${t('broker.soon')}</span></button>`;
  }
  return `<button class="btn btn-secondary btn-block btn-two-line" type="button" data-broker><span class="btn-line">${icon('external', 'icon-sm')}${t(`broker.btn.${brokerMode()}`)}</span><span class="btn-note">${t(`broker.note.${brokerMode()}`)}</span></button>`;
}

function openBroker(ctx, s) {
  const cs = D.calcState();
  const prof = CONFIG.CALC.RISK_PROFILES.find((p) => p.id === cs.profile);
  const lev = Math.min(cs.leverage, D.leverageCap(ctx.data, s));
  const pos = D.computePosition(s, { account: cs.account, ccy: cs.ccy, leverage: lev, riskPct: prof.pct, fx: D.fxRates(ctx.data) });
  const summary = [
    `${s.symbol} (${s.name})`,
    t('sum.side', { v: t(`side.${s.action}.long`) }),
    t('sum.entry', { v: F.price(s.entry) }),
    t('sum.size', { units: F.num(pos.units, 2), money: F.money(pos.notional, cs.ccy) }),
    t('sum.stop', { v: F.price(s.stop) }),
    t('sum.target', { v: F.price(s.target) }),
    t('sum.exit', { v: F.dm(s.exit_date) }),
  ].join('\n');
  let pick = null;
  openSheet({
    small: true, label: t('broker.title'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t(`broker.title.${brokerMode()}`)}</p><p class="sheet-sub">${t('broker.sub')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body">
        ${brokerMode() === 'demo' ? `<p class="callout-demo">${icon('shield', 'icon-sm')}<span>${t('broker.demoBox')}</span></p>` : `<p class="callout-demo is-live">${icon('alert', 'icon-sm')}<span>${t('broker.liveBox')}</span></p>`}
        <div class="broker-list">${brokerList().map((b) => `<button type="button" class="broker" data-b="${b.id}" aria-pressed="false"><span>${F.esc(b.name)}${brokerMode() === 'demo' ? ' (demo)' : ''}<small>${t(b.id === 'mt5' ? 'broker.mt5' : `broker.copyOpen.${brokerMode()}`)}</small></span>${icon('chev-right', 'icon-sm')}</button>`).join('')}</div>
        <pre class="order-summary num">${F.esc(summary)}</pre>
        <div class="btn-stack" style="margin-top:16px">
          <button class="btn btn-primary btn-block" type="button" data-go disabled>${t('broker.pick')}</button>
          <button class="btn btn-ghost" type="button" data-copy>${icon('copy', 'icon-sm')}${t('broker.copyOnly')}</button>
        </div>
        <p class="jnote" style="margin-top:12px">${t('broker.safe')}</p>
        <p class="jnote" style="margin-top:8px">${F.esc(t('disclaimer'))}</p>
      </div>`,
    onMount(el) {
      el.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      const go = el.querySelector('[data-go]');
      el.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => {
        pick = brokerList().find((x) => x.id === b.dataset.b);
        el.querySelectorAll('[data-b]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        go.disabled = false; go.textContent = t('broker.go', { name: pick.name });
      }));
      el.querySelector('[data-copy]').addEventListener('click', async () => {
        const ok = await copyText(summary);
        toast(ok ? t('broker.copied') : t('common.copyFailed'));
      });
      go.addEventListener('click', async () => {
        if (!pick) return;
        const ok = await copyText(summary);
        toast(ok ? t('broker.opening', { name: pick.name }) : t('broker.openingNo', { name: pick.name }));
        const url = brokerMode() === 'live' ? pick.live_url : pick.demo_url;
        window.open(url, '_blank', 'noopener');
      });
    },
  });
}
