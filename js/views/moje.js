// "Moje" (1.7.0): my Obchodní platforma positions + the signals I follow, with one total live result in my currency.
// Reachable from a card on Dnes and from Více (#/moje). 1.8.0: pending limit orders + the latest order events. Status words = the shared vocabulary (domain.liveStatus, terminal.posStatus).
import * as F from '../format.js';
import * as D from '../domain.js';
import * as W from '../wallet.js';
import * as store from '../store.js';
import { t } from '../i18n/index.js';
import { icon, monogram } from '../ui.js';
import { signalRow } from './signals.js';
import * as B from '../brief.js';
import { posStatus, orderRow } from './terminal.js';
import { describe } from './events.js';
import * as Feed from '../feed.js';

const sm = (v, ccy) => (v > 0.5 ? '+' : v < -0.5 ? '' : '±') + F.money(Math.abs(v) < 0.5 ? 0 : v, ccy, 0);
const tone = (v) => (v > 0.5 ? 'up' : v < -0.5 ? 'down' : 'flat');

/* Everything Moje needs, in the user's currency (calculator currency) */
export function mine(ctx) {
  const data = ctx.data;
  const ccy = D.calcState().ccy;
  const hasWallet = !!store.get('wallet', null);
  const smw = hasWallet ? W.summary(data) : null;
  const rows = smw ? smw.rows : [];
  const wccy = smw ? smw.w.ccy : ccy;
  const plat = rows.reduce((a, p) => a + p.pnl, 0);
  const platC = D.convert(plat, wccy, ccy, data);
  const sigs = D.followed().map((id) => D.findSignal(data, id)).filter(Boolean);
  const now = ctx.now();
  const live = sigs.map((s) => ({ s, st: D.liveStatus(s, now) }));
  const openF = live.filter((x) => !x.st.done);
  const fol = openF.reduce((a, x) => a + (x.st.um.now ?? 0), 0);
  return { ccy, wccy, rows, plat: platC, fol, total: platC + fol, sigs: live, openF, smw };
}

/* Card on Dnes */
export function card(ctx) {
  if (!ctx.data?.signals) return '';
  const m = mine(ctx);
  const n = m.rows.length, f = m.sigs.length;
  const empty = !n && !f;
  return `<a class="moje-card ${empty ? 'is-empty' : `tone-${tone(m.total)}`}" href="#/moje">
    <span class="moje-k">${icon('star', 'icon-sm')}${t('moje.title')}<span class="moje-go">${icon('chev-right', 'icon-xs')}</span></span>
    ${empty ? `<span class="moje-e">${t('moje.card.empty')}</span>`
    : `<span class="moje-v num ${tone(m.total)}">${sm(m.total, m.ccy)}</span>
       <span class="moje-s">${t('moje.card.s', { n, pu: F.unit('trade', n), f })}</span>`}
  </a>`;
}

function platRow(p, ccy) {
  const st = posStatus(p);
  const attrs = p.sigId ? `type="button" data-action="open-signal" data-id="${F.esc(p.sigId)}"` : null;
  const inner = `${monogram(p.sym, p.name)}
    <span class="tp-id"><span class="tp-t"><span class="ticker">${F.esc(p.sym)}</span><span class="side-tag ${p.side === 'SELL' ? 'sell' : ''}">${F.SIDE[p.side]}</span>${p.lev > 1 ? `<span class="hz-tag">${t('term.levTag', { v: p.lev })}</span>` : ''}</span>
      <span class="tp-m num">${t('term.posMeta', { a: F.money(p.margin, ccy, 0), e: F.price(p.entry), p: F.price(p.px) })}</span>
      <span class="tp-m tp-open">${F.esc(B.myOpenText(p, ccy))}</span>
      <span class="st-line tone-${st.tone}"><i aria-hidden="true"></i><b>${F.esc(st.text)}</b></span></span>
    <span class="tp-v num ${tone(p.pnl)}">${sm(p.pnl, ccy)}<small>${F.spct(p.pnlPct, 2)}</small></span>`;
  return `<div class="tp-row is-static tone-${tone(p.pnl)}">${attrs ? `<button class="tp-main" ${attrs}>${inner}</button>` : `<a class="tp-main" href="#/terminal">${inner}</a>`}</div>`;
}

export function render(ctx) {
  const head = `<header class="page-head"><div><a class="back" href="#/dnes">${icon('chev-left', 'icon-xs')}${t('nav.dnes')}</a><h1 class="page-title">${t('moje.title')}</h1><p class="page-sub">${t('moje.sub')}</p></div></header>`;
  if (!ctx.data?.signals) return head;
  const m = mine(ctx);
  const now = ctx.now();
  const empty = !m.rows.length && !m.sigs.length;
  const hero = `<section class="hero moje-hero ${tone(m.total) === 'down' ? 'down' : 'up'}">
    <span class="aurora" aria-hidden="true"><i></i><i></i></span>
    <div class="hero-top"><p class="hero-l">${t('moje.total')}</p></div>
    <p class="hero-v num ${tone(m.total)}">${sm(m.total, m.ccy)}</p>
    <p class="hero-s">${empty ? t('moje.total.empty') : t('moje.total.s')}</p>
    <div class="hero-stats">
      <span><b class="num ${tone(m.plat)}">${sm(m.plat, m.ccy)}</b> ${t('moje.part.plat')}</span>
      <span><b class="num ${tone(m.fol)}">${sm(m.fol, m.ccy)}</b> ${t('moje.part.fol')}</span>
    </div>
  </section>`;
  const plat = m.rows.length
    ? `<div class="tp-list">${m.rows.map((p) => platRow(p, m.wccy)).join('')}</div>`
    : `<p class="quiet">${t('moje.plat.none')}</p>`;
  const fol = m.sigs.length
    ? `<div class="bc-list">${B.byHorizon(m.sigs.map((x) => x.s), (x, i) => B.card(x, { data: ctx.data, now, compact: true, i }))}</div>`
    : `<div class="moje-hint">${icon('star')}<p>${t('moje.fol.none')}</p><a class="btn btn-secondary btn-small" href="#/signaly">${t('moje.fol.go')}</a></div>`;
  /* 1.8.0: my limit orders - waiting ones, then what happened to them lately (same texts as "Co se děje") */
  const pend = m.smw ? m.smw.w.orders : [];
  const oev = Feed.events().filter((e) => String(e.k).startsWith('ord-')).slice(0, 5);
  const ords = (pend.length ? `<h3 class="moje-h3">${t('moje.ord')}<small class="num">${pend.length}</small></h3><div class="tp-list">${pend.map((o) => `<a class="moje-ord" href="#/terminal">${orderRow(o, ctx.data, { buttons: false })}</a>`).join('')}</div>` : '')
    + (oev.length ? `<h3 class="moje-h3">${t('moje.ordEv')}</h3><div class="alert-list moje-oev">${oev.map((e) => { const d = describe(e); return d ? `<a class="alert-row ev-row" href="#/terminal"><span class="alert-ic ${d.tn}">${icon(d.ic, 'icon-sm')}</span><span class="alert-main"><span class="alert-t">${d.title}</span><span class="alert-s">${F.esc(d.sub)} · ${F.esc(F.ago(e.t || e.at))}</span></span></a>` : ''; }).join('')}</div>` : '');
  return head + hero + `
  <p class="honest">${icon('info', 'icon-xs')} ${t('moje.note', { a: F.money(D.calcState().account, m.ccy, 0), r: F.num(D.profilePct()?.pct ?? 1, 0) })}</p>
  <h2 class="section-title">${t('moje.plat')}<small>${m.rows.length}</small></h2>
  ${plat}
  ${ords}
  <a class="link moje-link" href="#/terminal">${icon('chart', 'icon-xs')}${t('moje.plat.open')}</a>
  <h2 class="section-title">${t('moje.fol')}<small>${m.sigs.length}</small></h2>
  ${fol}
  <p class="disclaimer">${icon('info')}${F.esc(t('disclaimer'))}</p>`;
}
