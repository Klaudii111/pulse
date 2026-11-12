// 1.12.0 – Peněženka (#/penezenka) and Historie (#/historie).
// Peněženka = the play-money wallet: balance, Dobít kredit / Vybrat, where every crown went (top-ups, withdrawals,
// each investment debited and returned with its result), Začít znovu. Same wallet.js data as everywhere else.
// Historie = my closed trades (success %, total, best / worst, by horizon, a curve of the trading result)
// + "Jak se daří lidem" (/data/community.json) + the opt-in anonymous sharing switch.
import * as F from '../format.js';
import * as D from '../domain.js';
import * as W from '../wallet.js';
import * as store from '../store.js';
import * as B from '../brief.js';
import * as Comm from '../community.js';
import { t } from '../i18n/index.js';
import { icon, skBlock, toast } from '../ui.js';
import { journalBody } from './extra.js';

const tone = (v) => (v > 0.5 ? 'up' : v < -0.5 ? 'down' : 'flat');
const sm = (v, c, dec = 0) => (v > 0.5 ? '+' : v < -0.5 ? '−' : '') + F.money(Math.abs(v) < 0.5 ? 0 : Math.abs(v), c, dec);
const nameOf = (p) => B.whatIs(p.sym, p.name).name;
const HZ = ['MESIC', 'TYDEN', 'DNY', 'DEN'];
export const hzOf = (p) => { const h = String(p.sigId || '').split('-')[0]; return HZ.includes(h) ? h : 'own'; };

/* ---------- Peněženka ---------- */
function ledger(w) {
  const rows = [];
  (w.cash || []).forEach((r) => rows.push({ at: r.at, k: r.k, amount: r.amount, sym: r.sym }));
  (w.positions || []).forEach((p) => rows.push({ at: p.openedAt, k: 'inv', amount: -p.margin, p }));
  (w.closed || []).forEach((p) => {
    rows.push({ at: p.openedAt, k: 'inv', amount: -p.margin, p });
    rows.push({ at: p.closedAt, k: 'ret', amount: p.margin + p.pnl, p });
  });
  rows.sort((a, b) => b.at - a.at);
  rows.push({ at: w.createdAt, k: 'start', amount: w.start });
  return rows;
}
function ledgerRow(r, c) {
  const ic = { dep: 'plus-square', wd: 'external', swap: 'clock', inv: 'chart', ret: 'check', start: 'wallet' }[r.k] || 'wallet';
  let title, sub = F.dmTime(r.at);
  if (r.k === 'inv') title = t('wl.l.inv', { n: nameOf(r.p) });
  else if (r.k === 'ret') { title = t('wl.l.ret', { n: nameOf(r.p) }); sub += ` · ${t(r.p.pnl > 0.5 ? 'wl.l.win' : r.p.pnl < -0.5 ? 'wl.l.loss' : 'wl.l.be', { v: sm(r.p.pnl, c) })}`; }
  else if (r.k === 'swap') title = t('term.cash.swap', { sym: r.sym || '' });
  else title = t(`wl.l.${r.k}`);
  const tn = r.k === 'ret' ? tone(r.p.pnl) : r.amount > 0 ? 'up' : 'flat';
  return `<div class="wl-row"><span class="wl-ic tone-${tn}">${icon(ic, 'icon-xs')}</span><span class="wl-m"><b>${F.esc(title)}</b><small class="num">${F.esc(sub)}</small></span>
    <span class="wl-v num ${r.amount > 0.5 ? 'up' : ''}">${sm(r.amount, c, r.k === 'swap' ? 2 : 0)}</span></div>`;
}
export function renderWallet(ctx) {
  const head = `<header class="page-head"><div><a class="back" href="#/dnes">${icon('chev-left', 'icon-xs')}${t('nav.dnes')}</a><h1 class="page-title">${t('wl.title')}</h1><p class="page-sub">${t('wl.sub')}</p></div></header>`;
  if (!ctx.data?.signals) return head + skBlock(220);
  const s = W.summary(ctx.data);
  const c = s.w.ccy;
  const deps = s.w.start + (s.w.cash || []).filter((r) => r.k === 'dep').reduce((a, r) => a + r.amount, 0);
  const wds = Math.abs((s.w.cash || []).filter((r) => r.k === 'wd').reduce((a, r) => a + r.amount, 0));
  const tot = D.moneyTone(s.total, c, s.totalPct);
  const rows = ledger(s.w);
  return head + `
  <section class="big-acc wl-hero" id="wl-hero"><p class="big-acc-k">${icon('wallet', 'icon-xs')}${t('wl.title')}<span class="demo-chip">${t('badge.paperShort')}</span></p>
    <p class="big-acc-v num">${F.money(s.equity, c, 0)}</p>
    <div class="wl-split num">
      <span><small>${t('wl.free')}</small><b>${F.money(Math.max(0, s.free), c, 0)}</b></span>
      <span><small>${t('acc.inPlay')}</small><b>${F.money(s.used + s.reserved, c, 0)}</b>${s.rows.length ? `<em class="${tone(s.open)}">${t('wl.now', { v: sm(s.open, c) })}</em>` : ''}</span>
    </div>
    ${s.reserved > 0 ? `<p class="wl-inplay num">${t('zi.split', { a: F.money(s.used, c, 0), b: F.money(s.reserved, c, 0) })}</p>` : ''}
    <div hidden>
    </div>
    <div class="wl-btns"><button type="button" class="btn btn-primary" data-action="w-load">${icon('plus-square', 'icon-sm')}${t('wl.topup')}</button>
      <button type="button" class="btn btn-secondary" data-action="w-withdraw">${t('wl.wd')}</button></div>
    <p class="wl-soon">${icon('shield', 'icon-xs')}<span>${t('wl.soon')}</span></p>
  </section>
  <section class="wl-how"><p>${icon('spark', 'icon-xs')}<span>${t('wl.how')}</span></p></section>
  <section class="card acc-rows">
    <div class="acc-r"><span>${t('wl.deps')}</span><b class="num">${F.money(deps, c, 0)}</b></div>
    <div class="acc-r"><span>${t('wl.wds')}</span><b class="num">${F.money(wds, c, 0)}</b></div>
    <div class="acc-r"><span>${t('wl.result')}</span><b class="num ${tot.tone}">${F.esc(tot.text)}${tot.zero ? '' : ` (${F.mpct(s.totalPct, s.total)})`}</b></div>
  </section>
  <a class="hs-row wl-hist-link" href="#/historie">${icon('history', 'icon-xs')}<span>${t('wl.toHist')}</span>${icon('chev-right', 'icon-xs')}</a>
  <section class="d-block"><h2 class="d-h">${t('wl.hist')}</h2>
    <div class="wl-list">${rows.slice(0, 60).map((r) => ledgerRow(r, c)).join('')}</div></section>
  <button type="button" class="btn btn-ghost btn-block wl-reset" data-action="w-reset">${t('acc.reset')}</button>
  <p class="honest">${icon('shield', 'icon-xs')} ${t('wl.note')}</p>`;
}

/* ---------- Historie ---------- */
export function myStats(w) {
  const cl = (w?.closed || []).slice();
  const n = cl.length;
  const wins = cl.filter((p) => p.pnl > 0.5).length;
  const total = cl.reduce((a, p) => a + p.pnl, 0);
  const best = n ? cl.reduce((a, p) => (p.pnl > a.pnl ? p : a)) : null;
  const worst = n ? cl.reduce((a, p) => (p.pnl < a.pnl ? p : a)) : null;
  const by = {};
  cl.forEach((p) => { const h = hzOf(p); by[h] = by[h] || { n: 0, wins: 0, pnl: 0 }; by[h].n++; by[h].pnl += p.pnl; if (p.pnl > 0.5) by[h].wins++; });
  return { n, wins, rate: n ? (wins / n) * 100 : null, total, best, worst, by };
}
/* the trading result over time (closed trades + overnight fees; top-ups and withdrawals left out on purpose) */
function curve(w, openNow) {
  const ev = (w.closed || []).map((p) => ({ at: p.closedAt, v: p.pnl })).concat((w.cash || []).filter((r) => r.k === 'swap').map((r) => ({ at: r.at, v: r.amount })))
    .sort((a, b) => a.at - b.at);
  let acc = 0;
  const pts = [{ at: w.createdAt, v: 0 }].concat(ev.map((e) => ({ at: e.at, v: (acc += e.v) })));
  if (Math.abs(openNow) > 0.5) pts.push({ at: Date.now(), v: acc + openNow, open: true });
  return pts;
}
function curveSvg(pts, c, minSpan = 0) {
  if (pts.length < 3) return '';
  const W0 = 320, H0 = 120, pad = 6;
  const vs = pts.map((p) => p.v);
  /* a calm scale: never zoom a few crowns up to the full height (at least ±minSpan around zero) */
  const lo = Math.min(-minSpan / 2, ...vs), hi = Math.max(minSpan / 2, ...vs), span = hi - lo || 1;
  const x = (i) => pad + (i / (pts.length - 1)) * (W0 - pad * 2);
  const y = (v) => pad + (1 - (v - lo) / span) * (H0 - pad * 2);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const up = last.v >= 0;
  return `<figure class="eq-fig ${up ? 'up' : 'down'}"><svg class="eq-svg" viewBox="0 0 ${W0} ${H0}" preserveAspectRatio="none" role="img" aria-label="${F.esc(t('hi.curveAria', { v: sm(last.v, c) }))}">
    <defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".32"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <line x1="${pad}" x2="${W0 - pad}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="eq-zero"/>
    <polygon points="${x(0).toFixed(1)},${y(0).toFixed(1)} ${line} ${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)}" fill="url(#eqg)"/>
    <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
  </svg><figcaption class="num"><span>${F.dm(pts[0].at)}</span><b class="${tone(last.v)}">${sm(last.v, c)}</b><span>${last.open ? t('hi.nowOpen') : F.dm(last.at)}</span></figcaption></figure>`;
}
function closedRow(p, c) {
  const h = hzOf(p);
  return `<div class="hi-row">${p.sigId ? `<button type="button" class="hi-main" data-action="open-signal" data-id="${F.esc(p.sigId)}">` : '<div class="hi-main">'}
    <span class="hi-bar ${tone(p.pnl)}"></span><span class="hi-m"><b>${F.esc(nameOf(p))}</b><small>${F.esc(h === 'own' ? t('hi.own') : t(`c.typeS.${h}`))} · ${F.dm(p.closedAt)}${p.lev > 1 ? ` · 1:${p.lev}` : ''} · ${F.esc(t(`hi.why.${['tp', 'sl', 'slgap', 'out', 'stopout', 'manual'].includes(p.why) ? p.why : 'signal'}`))}</small></span>
    <span class="hi-v num ${tone(p.pnl)}">${sm(p.pnl, c)}<small>${F.mpct(p.pnlPct, p.pnl)}</small></span>${p.sigId ? '</button>' : '</div>'}</div>`;
}
function mine(ctx) {
  const s = W.summary(ctx.data);
  const c = s.w.ccy;
  const m = myStats(s.w);
  if (!m.n) {
    return `<section class="hi-card"><p class="d-empty">${t(s.rows.length ? 'hi.none.open' : 'hi.none')}</p>
      ${s.rows.length ? '' : `<a class="btn btn-primary btn-small" href="#/signaly">${t('hi.none.go')}</a>`}</section>`;
  }
  const by = ['MESIC', 'TYDEN', 'DNY', 'DEN', 'own'].filter((h) => m.by[h]).map((h) => {
    const b = m.by[h];
    return `<tr><th scope="row">${F.esc(h === 'own' ? t('hi.own') : t(`c.typeS.${h}`))}</th><td class="num">${b.n}</td><td class="num">${F.pct((b.wins / b.n) * 100, 0)}</td><td class="num ${tone(b.pnl)}">${sm(b.pnl, c)}</td></tr>`;
  }).join('');
  return `<section class="hi-card" id="hi-mine">
    <div class="hi-top">
      <div class="hi-rate"><p class="hi-l">${t('hi.rate')}</p><p class="hi-big num" id="hi-rate">${F.pct(m.rate, 0)}</p><p class="hi-s">${t('hi.rateS', { w: m.wins, n: m.n })}</p></div>
      <div class="hi-rate"><p class="hi-l">${t('hi.total')}</p><p class="hi-big num ${tone(m.total)}">${sm(m.total, c)}</p><p class="hi-s">${t('hi.totalS', { n: m.n, u: F.unit('trade', m.n) })}</p></div>
    </div>
    ${m.n < 3 ? '' : curveSvg(curve(s.w, s.open), c, (s.w.start || 100000) * 0.02)}
    ${m.n < 3 ? '' : `<div class="hi-bw">
      <p><small>${t('hi.best')}</small><b class="num ${tone(m.best.pnl)}">${sm(m.best.pnl, c)}</b><span>${F.esc(nameOf(m.best))}</span></p>
      <p><small>${t('hi.worst')}</small><b class="num ${tone(m.worst.pnl)}">${sm(m.worst.pnl, c)}</b><span>${F.esc(nameOf(m.worst))}</span></p>
    </div>`}
    <table class="hi-tab"><thead><tr><th scope="col">${t('hi.c.type')}</th><th scope="col">${t('hi.c.n')}</th><th scope="col">${t('hi.c.rate')}</th><th scope="col">${t('hi.c.res')}</th></tr></thead><tbody>${by}</tbody></table>
  </section>
  <section class="d-block"><h2 class="d-h">${t('hi.list')}<span class="num"> · ${m.n}</span></h2><div class="hi-list">${s.w.closed.slice(0, 50).map((p) => closedRow(p, c)).join('')}</div></section>`;
}

const pctOr = (v, d = 0) => (v == null ? '–' : F.pct(v, d));
function people() {
  const d = Comm.data();
  if (!d) return `<section class="hi-card cm-card"><p class="d-empty">${t(!Comm.enabled() ? 'cm.off' : Comm.tried0() ? 'cm.fail' : 'cm.loading')}</p></section>`;
  const few = d.win_rate == null || d.pct_users_in_profit == null;
  const lab = { konzervativne: 'mb.p.cons', vyvazene: 'mb.p.bal', agresivneji: 'mb.p.aggr' };
  const grp = (obj, key) => Object.entries(obj || {}).filter(([, v]) => v && v.win_rate != null).map(([k, v]) => `<tr><th scope="row">${t(key(k))}</th><td class="num">${v.users_with_closed ?? v.users ?? '–'}</td><td class="num">${pctOr(v.win_rate)}</td><td class="num ${v.avg_pnl_pct_deposit > 0 ? 'up' : v.avg_pnl_pct_deposit < 0 ? 'down' : ''}">${v.avg_pnl_pct_deposit == null ? '–' : F.spct(v.avg_pnl_pct_deposit, 1)}</td></tr>`).join('');
  const rowsP = grp(d.by_profile, (k) => lab[k] || k);
  const rowsH = grp(d.by_horizon, (k) => `c.typeS.${k}`);
  const lb = Array.isArray(d.leaderboard) && d.leaderboard.length ? `<h3 class="cm-h">${icon('trophy', 'icon-xs')}${t('cm.lb')}</h3>
    <ol class="cm-lb">${d.leaderboard.slice(0, 10).map((r, i) => `<li><span class="cm-pos num">${i + 1}</span><span class="cm-nick">${F.esc(r.nick)}<small>${F.esc(t(lab[r.profile] || 'mb.p.cons'))} · ${r.trades} ${F.unit('trade', r.trades)}</small></span><span class="num">${pctOr(r.win_rate)}</span></li>`).join('')}</ol>
    <p class="cm-note">${t('cm.lbNote')}</p>` : '';
  return `<section class="hi-card cm-card" id="cm">
    ${few ? `<p class="cm-few">${icon('users', 'icon-sm')}<span>${t('cm.few')}${d.users ? ` ${t('cm.fewN', { n: d.users })}` : ''}</span></p>` : `
    <div class="cm-grid">
      <div><p class="hi-l">${t('cm.users')}</p><p class="cm-v num">${d.users}</p></div>
      <div><p class="hi-l">${t('cm.inProfit')}</p><p class="cm-v num up">${pctOr(d.pct_users_in_profit)}</p></div>
      <div><p class="hi-l">${t('cm.win')}</p><p class="cm-v num">${pctOr(d.win_rate)}</p><p class="hi-s">${t('cm.trades', { n: d.trades_closed ?? 0 })}</p></div>
      <div><p class="hi-l">${t('cm.avg')}</p><p class="cm-v num ${d.avg_pnl_pct_deposit > 0 ? 'up' : d.avg_pnl_pct_deposit < 0 ? 'down' : ''}">${d.avg_pnl_pct_deposit == null ? '–' : F.spct(d.avg_pnl_pct_deposit, 1)}</p></div>
    </div>
    ${rowsP || rowsH ? `<table class="hi-tab"><thead><tr><th scope="col"></th><th scope="col">${t('cm.c.users')}</th><th scope="col">${t('hi.c.rate')}</th><th scope="col">${t('cm.c.avg')}</th></tr></thead><tbody>${rowsP ? `<tr class="hi-grp"><th colspan="4">${t('cm.byProf')}</th></tr>${rowsP}` : ''}${rowsH ? `<tr class="hi-grp"><th colspan="4">${t('cm.byHz')}</th></tr>${rowsH}` : ''}</tbody></table>` : ''}`}
    ${lb}
    <p class="cm-note">${t('cm.foot')}${d.updated_at ? ` · ${t('cm.upd', { d: F.dmTime(d.updated_at) })}` : ''}</p>
  </section>`;
}
function shareBox() {
  if (!Comm.enabled()) return '';
  const s = Comm.settings();
  return `<section class="share-box" id="share-box">
    <button type="button" class="auto-tg ${s.on ? 'is-on' : ''}" id="share-tg" role="switch" aria-checked="${s.on}" data-action="share-toggle">
      <span class="auto-tx"><b>${t('sh.t')}</b><small>${t(s.on ? 'sh.sOn' : 'sh.sOff')}</small></span><span class="auto-sw" aria-hidden="true"><i></i></span></button>
    <details class="sh-what"${s.on ? '' : ' open'}><summary>${t('sh.what')}${icon('chev-down', 'icon-xs')}</summary>
      <ul><li>${t('sh.yes')}</li><li>${t('sh.no')}</li><li>${t('sh.del')}</li></ul></details>
    <label class="sh-nick"><span>${t('sh.nick')}</span><span class="sh-nrow"><input id="sh-nick" class="jin" maxlength="20" autocomplete="off" spellcheck="false" placeholder="${t('sh.nickPh')}" value="${F.esc(s.nick)}">
      <button type="button" class="btn btn-secondary btn-small" data-action="nick-save">${t('sh.nickSave')}</button></span><small>${t('sh.nickS')}</small></label>
  </section>`;
}
export function renderHistory(ctx) {
  const head = `<header class="page-head"><div><a class="back" href="#/zainvestovano">${icon('chev-left', 'icon-xs')}${t('nav.zainvestovano')}</a><h1 class="page-title">${t('hi.title')}</h1><p class="page-sub">${t('hi.sub')}</p></div></header>`;
  if (!ctx.data?.signals) return head + skBlock(220);
  return head + `
  <h2 class="d-h hi-h">${t('hi.mine')}</h2>
  ${mine(ctx)}
  ${(() => { const jb = journalBody(ctx); return jb ? `<section class="d-block hi-journal"><h2 class="d-h">${t('hi.journal')}</h2>${jb}</section>` : ''; })()}
  <section class="d-block"><h2 class="d-h">${t('cm.title')}</h2>${people()}${shareBox()}</section>
  <p class="disclaimer">${icon('info')}${F.esc(t('disclaimer'))}</p>`;
}
export function mountHistory(el, ctx) {
  if (Comm.data() || !Comm.enabled() || Comm.tried0()) return;
  Comm.load().then(() => { if (document.getElementById('cm')) ctx.rerender({ soft: true }); });
}

export const actions = {
  async 'share-toggle'(el, ev, ctx) {
    const on = !Comm.settings().on;
    if (on) { const nk = document.getElementById('sh-nick')?.value || ''; const r0 = Comm.setNick(nk); if (!r0.ok) { toast(t('sh.badNick')); return; } }
    el.setAttribute('aria-checked', String(on)); el.classList.toggle('is-on', on);
    const r = await Comm.setOn(on);
    if (on && !r.ok) toast(t(r.reason === 'bad_nick' ? 'sh.badNick' : 'sh.fail'), { timeout: 7000 });
    else toast(t(on ? 'sh.onDone' : 'sh.offDone'), { timeout: 6000 });
    if (on && !r.ok && r.reason === 'bad_nick') { Comm.setOn(false); }
    ctx.rerender({ soft: true });
  },
  async 'nick-save'(el, ev, ctx) {
    const r = Comm.setNick(document.getElementById('sh-nick')?.value || '');
    if (!r.ok) { toast(t('sh.badNick')); return; }
    if (Comm.settings().on) {
      const s = await Comm.sendNow();
      toast(t(s.ok ? 'sh.nickDone' : s.reason === 'bad_nick' ? 'sh.badNick' : 'sh.fail'));
    } else toast(t('sh.nickLater'));
    ctx.rerender({ soft: true });
  },
};
