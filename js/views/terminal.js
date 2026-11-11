// Obchodní platforma (1.6.0): a simple trading screen on the user's own fictional demo account (js/wallet.js).
// Fictional money only, nothing is traded for real. Default view = chart + two big buttons + positions;
// leverage / stop-loss / take-profit live behind "Více možností" in the order ticket.
import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import * as W from '../wallet.js';
import * as Live from '../live.js';
import * as store from '../store.js';
import { t } from '../i18n/index.js';
import { INSTR } from '../instruments.js';
import { instrumentText } from '../explain.js';
import { icon, monogram, openSheet, closeTopSheet, toast, seg, segMove, haptic } from '../ui.js';
import { priceChart } from '../charts.js';
import { mountTV, tvSymbol } from './detail.js';

let chartRef = null, liveOff = null, tvOn = false, autoTicketFor = null, stampTimer = null;
let tab = 'pos', cmode = 'live';

const money = (v, ccy, dec = 0) => F.money(v, ccy, dec);
const smoney = (v, ccy, dec = 0) => (v > 0.5 ? '+' : '') + F.money(v, ccy, dec);
const tone = (v) => (v > 0.5 ? 'up' : v < -0.5 ? 'down' : 'flat');

function openSigs(data) { return D.allOpen(data).filter((s) => s.status === 'open' && !s.intraday_hit); }

function currentSym(ctx) {
  const sid = ctx.params.get('s');
  const sig = sid ? D.findSignal(ctx.data, sid) : null;
  if (sig) { store.set('termSym', sig.symbol); return { sym: sig.symbol, sig }; }
  let sym = store.get('termSym', null);
  const sigs = openSigs(ctx.data);
  if (!sym) sym = sigs[0]?.symbol || 'SPY';
  return { sym, sig: sigs.find((x) => x.symbol === sym) || null };
}

function nameOf(sym, data) {
  const s = D.allOpen(data).find((x) => x.symbol === sym);
  return s?.name || '';
}

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
  return `<div class="acc-bar">
    <div><p class="acc-l">${t('term.balance')}</p><p class="acc-v num">${money(sm.balance, c)}</p></div>
    <div><p class="acc-l">${t('term.equity')}</p><p class="acc-v num">${money(sm.equity, c)}</p></div>
    <div><p class="acc-l">${t('term.today')}</p><p class="acc-v num ${tone(sm.today)}">${smoney(sm.today, c)}</p></div>
    <div><p class="acc-l">${t('term.free')}</p><p class="acc-v num">${money(sm.free, c)}</p></div>
  </div>`;
}

function posList(sm, data) {
  const c = sm.w.ccy;
  if (!sm.rows.length) return `<p class="quiet">${t('term.noPos')}</p>`;
  return `<div class="tp-list">${sm.rows.map((p) => {
    const st = posStatus(p);
    return `<div class="tp-row tone-${tone(p.pnl)}">
      <button type="button" class="tp-main" ${p.sigId ? `data-action="open-signal" data-id="${F.esc(p.sigId)}"` : 'data-action="t-sym" data-sym="' + F.esc(p.sym) + '"'}>
        ${monogram(p.sym, p.name)}
        <span class="tp-id"><span class="tp-t"><span class="ticker">${F.esc(p.sym)}</span><span class="side-tag ${p.side === 'SELL' ? 'sell' : ''}">${F.SIDE[p.side]}</span>${p.lev > 1 ? `<span class="hz-tag">${t('term.levTag', { v: p.lev })}</span>` : ''}</span>
          <span class="tp-m num">${t('term.posMeta', { a: money(p.margin, c), e: F.price(p.entry), p: F.price(p.px) })}</span>
          <span class="st-line tone-${st.tone}"><i aria-hidden="true"></i><b>${F.esc(st.text)}</b></span></span>
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
  if (Math.abs(p.pnlPct) < 0.05) return { tone: 'flat', text: t('st.flat') };
  return p.pnl > 0 ? { tone: 'up', text: t('st.win', { v: F.spct(p.pnlPct, 1) }) } : { tone: 'down', text: t('st.lose', { v: F.spct(p.pnlPct, 1) }) };
}

function ordList(sm) {
  const rows = sm.rows.filter((p) => p.sl || p.tp);
  if (!rows.length) return `<p class="quiet">${t('term.noOrd')}</p>`;
  return `<div class="tp-list">${rows.map((p) => `<div class="tp-row is-static"><span class="tp-main">${monogram(p.sym, p.name)}
    <span class="tp-id"><span class="tp-t"><span class="ticker">${F.esc(p.sym)}</span><span class="side-tag ${p.side === 'SELL' ? 'sell' : ''}">${F.SIDE[p.side]}</span></span>
    <span class="tp-m num">${p.sl ? `<span class="down">${t('term.slAt', { v: F.price(p.sl) })}</span>` : ''}${p.sl && p.tp ? ' · ' : ''}${p.tp ? `<span class="up">${t('term.tpAt', { v: F.price(p.tp) })}</span>` : ''}</span>
    <span class="tp-m">${t('term.ordWait')}</span></span></span></div>`).join('')}</div>`;
}

function histList(sm) {
  const c = sm.w.ccy;
  if (!sm.w.closed.length) return `<p class="quiet">${t('term.noHist')}</p>`;
  return `<div class="tp-list">${sm.w.closed.slice(0, 50).map((p) => `<div class="tp-row is-static tone-${tone(p.pnl)}"><span class="tp-main">
    <span class="hist-bar ${tone(p.pnl) === 'flat' ? '' : tone(p.pnl)}"></span>
    <span class="tp-id"><span class="tp-t"><span class="ticker">${F.esc(p.sym)}</span><span class="side-tag ${p.side === 'SELL' ? 'sell' : ''}">${F.SIDE[p.side]}</span></span>
    <span class="tp-m num">${t('term.histMeta', { e: F.price(p.entry), x: F.price(p.exit), d: F.dmTime(p.closedAt) })}</span>
    <span class="tp-m">${t(`term.why.${p.why}`)}</span></span>
    <span class="tp-v num ${tone(p.pnl)}">${smoney(p.pnl, c, 0)}<small>${F.spct(p.pnlPct, 2)}</small></span></span></div>`).join('')}</div>`;
}

function tabBody(sm, data) { return tab === 'ord' ? ordList(sm) : tab === 'hist' ? histList(sm) : posList(sm, data); }

function priceBlock(sym, data) {
  const q = W.priceOf(sym, data);
  const st = Live.stamp(q?.t || 0);
  return { q, html: `<p class="term-px num">${q ? F.price(q.p) : '–'}</p><p class="live-stamp is-${st.code}"><i aria-hidden="true"></i>${F.esc(st.text)}</p>` };
}

export function render(ctx) {
  const head = `<header class="page-head"><div><h1 class="page-title">${t('term.title')}</h1><p class="page-sub">${t('term.sub')} <span class="demo-chip is-big">${t('term.demo')}</span></p></div></header>`;
  if (!ctx.data?.signals) return head;
  const { sym, sig } = currentSym(ctx);
  const sm = W.summary(ctx.data);
  const pb = priceBlock(sym, ctx.data);
  const what = instrumentText(sym);
  const sigs = openSigs(ctx.data);
  return head + `
  <p class="fict-line">${icon('shield', 'icon-xs')}${t('term.fict')}</p>
  <div id="t-acc">${accBar(sm)}</div>
  <div class="term-grid">
    <section class="term-main card">
      <div class="term-sym">
        <button type="button" class="term-pick" data-action="t-pick">${monogram(sym, nameOf(sym, ctx.data))}<span><span class="ticker">${F.esc(sym)}</span><span class="term-name">${F.esc(nameOf(sym, ctx.data) || (what ? what.split(' – ')[0] : ''))}</span></span>${icon('chev-down', 'icon-sm')}</button>
        <div class="term-pxbox" id="t-px">${pb.html}</div>
      </div>
      ${sig ? `<button type="button" class="term-sig" data-action="open-signal" data-id="${F.esc(sig.id)}">${icon('signals', 'icon-xs')}${t('term.fromSig', { side: F.SIDE[sig.action], e: F.price(sig.entry), s: F.price(sig.stop), t: F.price(sig.target) })}</button>` : ''}
      <div class="range-chips pchart-modes" role="group" aria-label="${t('det.chartMode')}">
        <button type="button" class="range-chip" data-action="t-cmode" data-id="live" aria-pressed="${cmode === 'live'}">${t('term.chartLive')}</button>
        <button type="button" class="range-chip" data-action="t-cmode" data-id="tv" aria-pressed="${cmode === 'tv'}">${t('det.chartTV')}</button>
      </div>
      <div class="pchart-box term-chart" id="t-chart" ${cmode === 'tv' ? 'hidden' : ''}></div>
      <div class="tv-box" id="t-tv" ${cmode === 'tv' ? '' : 'hidden'}></div>
      <div class="trade-btns">
        <button type="button" class="trade-btn buy" data-action="t-ticket" data-side="BUY"><span>${t('term.buy')}</span><b class="num" data-tpx>${pb.q ? F.price(pb.q.p) : '–'}</b></button>
        <button type="button" class="trade-btn sell" data-action="t-ticket" data-side="SELL"><span>${t('term.sell')}</span><b class="num" data-tpx>${pb.q ? F.price(pb.q.p) : '–'}</b></button>
      </div>
      <p class="trade-hint">${t('term.hint')}</p>
    </section>
    <section class="term-side">
      <div class="seg-wrap">${seg({ name: 'ttab', small: true, label: t('term.tabs'), items: [{ id: 'pos', label: t('term.tab.pos'), count: sm.rows.length }, { id: 'ord', label: t('term.tab.ord') }, { id: 'hist', label: t('term.tab.hist'), count: sm.w.closed.length }], active: tab })}</div>
      <div id="t-tab">${tabBody(sm, ctx.data)}</div>
      ${sigs.length ? `<h2 class="section-title">${t('term.sigs')}</h2><div class="chips term-chips">${sigs.slice(0, 12).map((x) => `<button type="button" class="chip ${x.symbol === sym ? 'chip-gold' : ''}" data-action="t-sym" data-sym="${F.esc(x.symbol)}">${F.esc(x.symbol)}</button>`).join('')}</div>` : ''}
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
  const pb = priceBlock(sym, ctx.data);
  const px = el.querySelector('#t-px'); if (px) px.innerHTML = pb.html;
  el.querySelectorAll('[data-tpx]').forEach((b) => { b.textContent = pb.q ? F.price(pb.q.p) : '–'; });
  const tb = el.querySelector('#t-tab'); if (tb) tb.innerHTML = tabBody(sm, ctx.data);
  chartRef && chartRef.refresh && chartRef.refresh();
}

export function mount(el, ctx) {
  if (!ctx.data?.signals) return;
  const { sym, sig } = currentSym(ctx);
  Live.onData(); // subscribe the chosen symbol
  tvOn = false;
  const box = el.querySelector('#t-chart');
  const series = () => chartSeries(sym, D.allOpen(ctx.data).find((x) => x.symbol === sym && x.status === 'open'));
  const isLive = () => { const q = W.priceOf(sym, ctx.data); return Live.stamp(q?.t || 0).code === 'live'; };
  chartRef && chartRef.destroy();
  if (box) chartRef = proxyChart(box, series, isLive);
  if (cmode === 'tv') { tvOn = true; mountTV(el.querySelector('#t-tv'), tvSymbol(sym)); }
  liveOff && liveOff();
  const fn = () => refresh(el, ctx);
  document.addEventListener('pulse:live', fn);
  clearInterval(stampTimer);
  stampTimer = setInterval(() => {
    if (!el.isConnected) { clearInterval(stampTimer); return; }
    const q = W.priceOf(sym, ctx.data); const st = Live.stamp(q?.t || 0);
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

export function unmount() { liveOff && liveOff(); liveOff = null; chartRef && chartRef.destroy(); chartRef = null; clearInterval(stampTimer); }

/* ---------- Order ticket ---------- */
function ticket(ctx, side, sym, sig) {
  const sm = W.summary(ctx.data);
  const c = sm.w.ccy;
  const q = W.priceOf(sym, ctx.data);
  if (!q) { toast(t('term.noPrice')); return; }
  const presets = c === 'CZK' ? [1000, 5000, 10000] : [100, 250, 500];
  const useSig = sig && sig.action === side;
  const st = { side, amount: presets[2], lev: 1, sl: useSig ? sig.stop : +(q.p * (1 - 0.03 * (side === 'SELL' ? -1 : 1))).toFixed(2), tp: useSig ? sig.target : +(q.p * (1 + 0.06 * (side === 'SELL' ? -1 : 1))).toFixed(2), risk: null };
  const fmtIn = (v) => (v == null ? '' : String(v));
  const preview = () => {
    const o = W.outcome({ side: st.side, entry: q.p, amount: st.amount, lev: st.lev, sl: st.sl, tp: st.tp });
    return `<div class="tk-out">
      <p><span>${t('term.ifStop')}</span><b class="num down">${o.atStop != null ? smoney(o.atStop, c) : '–'}</b></p>
      <p><span>${t('term.ifTarget')}</span><b class="num up">${o.atTarget != null ? smoney(o.atTarget, c) : '–'}</b></p>
      <p class="tk-small">${t('term.tkSize', { a: money(st.amount, c), lev: st.lev, n: money(o.notional, c) })}</p>
    </div>`;
  };
  const body = () => `
    <div class="tk-side ${side === 'SELL' ? 'sell' : 'buy'}"><span>${t(side === 'SELL' ? 'term.tkSell' : 'term.tkBuy', { sym })}</span><b class="num">${F.price(q.p)}</b></div>
    ${useSig ? `<p class="tk-sig">${icon('signals', 'icon-xs')}${t('term.tkFromSig')}</p>` : ''}
    <p class="sheet-label">${t('term.amount')}</p>
    <div class="chips tk-chips">${presets.map((v) => `<button type="button" class="chip" data-amt="${v}" aria-pressed="${st.risk == null && st.amount === v}">${money(v, c)}</button>`).join('')}
      ${CONFIG.CALC.RISK_PROFILES.map((p) => `<button type="button" class="chip" data-risk="${p.pct}" aria-pressed="${st.risk === p.pct}">${t('term.riskChip', { v: p.pct })}</button>`).join('')}</div>
    <label class="tk-in"><span>${t('term.amountOwn', { c })}</span><input class="jin num" inputmode="decimal" data-in="amount" value="${fmtIn(st.amount)}"></label>
    <details class="tk-more"><summary>${t('term.more')}</summary>
      <p class="sheet-label">${t('term.lev')}</p>
      ${seg({ name: 'tlev', small: true, label: t('term.lev'), items: Array.from({ length: CONFIG.CALC.LEVERAGE_MAX - CONFIG.CALC.LEVERAGE_MIN + 1 }, (_, i) => ({ id: String(i + CONFIG.CALC.LEVERAGE_MIN), label: `${i + CONFIG.CALC.LEVERAGE_MIN}×` })), active: String(st.lev) })}
      <p class="why-s">${t('term.levS')}</p>
      <div class="tk-2"><label class="tk-in"><span>${t('term.sl')}</span><input class="jin num" inputmode="decimal" data-in="sl" value="${fmtIn(st.sl)}"></label>
      <label class="tk-in"><span>${t('term.tp')}</span><input class="jin num" inputmode="decimal" data-in="tp" value="${fmtIn(st.tp)}"></label></div>
      <p class="why-s">${t('term.slS')}</p>
    </details>
    <div id="tk-out">${preview()}</div>
    <button type="button" class="btn btn-primary btn-block tk-go" data-go>${t('term.confirm', { side: F.SIDE[side], a: money(st.amount, c) })}</button>
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
        root.querySelector('[data-go]').textContent = t('term.confirm', { side: F.SIDE[side], a: money(st.amount, c) });
        root.querySelectorAll('[data-amt]').forEach((b) => b.setAttribute('aria-pressed', String(st.risk == null && +b.dataset.amt === st.amount)));
        root.querySelectorAll('[data-risk]').forEach((b) => b.setAttribute('aria-pressed', String(st.risk === +b.dataset.risk)));
      };
      const applyRisk = () => {
        if (st.risk == null) return;
        const a = W.amountForRisk(W.get(), { entry: q.p, sl: st.sl, lev: st.lev, riskPct: st.risk });
        if (a) { st.amount = Math.min(a, Math.floor(sm.free)); root.querySelector('[data-in="amount"]').value = String(st.amount); }
      };
      root.addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-amt]'); const r = ev.target.closest('[data-risk]');
        const lv = ev.target.closest('[data-seg-name="tlev"]');
        if (a) { st.risk = null; st.amount = +a.dataset.amt; root.querySelector('[data-in="amount"]').value = String(st.amount); haptic(); upd(); }
        if (r) { st.risk = +r.dataset.risk; applyRisk(); haptic(); upd(); }
        if (lv) { ev.preventDefault(); ev.stopPropagation(); st.lev = +lv.dataset.id; segMove(root, 'tlev', lv.dataset.id); applyRisk(); upd(); }
        if (ev.target.closest('[data-go]')) {
          const res = W.open(ctx.data, { sym, name: nameOf(sym, ctx.data), side, amount: st.amount, lev: st.lev, sl: st.sl, tp: st.tp, sigId: sig && sig.action === side && sig.status === 'open' && !sig.intraday_hit ? sig.id : null });
          if (!res.ok) { toast(t(`term.err.${res.reason}`)); return; }
          haptic(20);
          closeTopSheet();
          toast(t('term.opened', { side: F.SIDE[side], sym, a: money(st.amount, c) }));
          tab = 'pos';
          setTimeout(() => ctx.rerender({ soft: true }), 380);
        }
      });
      root.addEventListener('input', (ev) => {
        const k = ev.target.dataset.in; if (!k) return;
        const v = F.parseNum(ev.target.value);
        if (k === 'amount') { st.risk = null; st.amount = v > 0 ? v : 0; }
        if (k === 'sl') { st.sl = v > 0 ? v : null; applyRisk(); }
        if (k === 'tp') st.tp = v > 0 ? v : null;
        upd();
      });
    },
  });
}

function picker(ctx) {
  const sigs = openSigs(ctx.data).map((s) => s.symbol);
  const all = Object.keys(INSTR);
  const list = (qq) => {
    const q = qq.trim().toUpperCase();
    const top = [...new Set(sigs)];
    const hits = q ? all.filter((s) => s.includes(q) || (INSTR[s].cs || '').toUpperCase().includes(q) || (INSTR[s].en || '').toUpperCase().includes(q)).slice(0, 40) : top.concat(['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA'].filter((x) => !top.includes(x)));
    return hits.map((s) => `<button type="button" class="pick-row" data-sym="${F.esc(s)}">${monogram(s, '')}<span><b>${F.esc(s)}</b>${sigs.includes(s) ? `<span class="hz-tag is-preview">${t('term.hasSig')}</span>` : ''}<small>${F.esc((instrumentText(s) || '').slice(0, 90))}</small></span></button>`).join('') || `<p class="quiet">${t('term.noFound')}</p>`;
  };
  openSheet({
    label: t('term.pick'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('term.pick')}</p><p class="sheet-sub">${t('term.pickS')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><input class="jin pick-in" type="search" placeholder="${t('term.search')}" aria-label="${t('term.search')}"><div class="pick-list" id="pick-list">${list('')}</div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      const inp = sh.querySelector('.pick-in');
      inp.addEventListener('input', () => { sh.querySelector('#pick-list').innerHTML = list(inp.value); });
      sh.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-sym]'); if (!b) return;
        choose(ctx, b.dataset.sym); closeTopSheet();
      });
    },
  });
}

function choose(ctx, sym) {
  store.set('termSym', sym);
  autoTicketFor = ctx.params.get('s') || autoTicketFor;
  if (ctx.params.get('s')) { (window.__pulseGo ? window.__pulseGo('#/terminal') : (location.hash = '#/terminal')); return; }
  ctx.rerender({ soft: true });
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

export const actions = {
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
    root.querySelector('#t-chart').hidden = cmode === 'tv';
    const tv = root.querySelector('#t-tv'); tv.hidden = cmode !== 'tv';
    if (cmode === 'tv' && !tvOn) { tvOn = true; mountTV(tv, tvSymbol(currentSym(ctx).sym)); }
    if (cmode !== 'tv') chartRef && chartRef.refresh();
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
