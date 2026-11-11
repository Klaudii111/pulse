// 1.11.0 – #/uceni "Jak se robot učí": the watchdog (health.json) in plain words.
// One card per strategy: traffic light, plain name, one reason, test 2023–2026 vs practice, last check.
// Numbers come only from health.json; when a value is missing the line says so (no estimates).
import * as F from '../format.js';
import * as H from '../health.js';
import { t } from '../i18n/index.js';
import { icon, skBlock } from '../ui.js';

const ORDER = ['MESIC', 'DNY', 'TYDEN', 'DEN'];
const LIGHT = { green: 'ok', orange: 'watch', red: 'off', grey: 'grey' };
const lightOf = (s) => LIGHT[s.light] || (s.status === 'vypnuto' ? 'off' : s.status === 'sleduj' ? 'watch' : 'ok');
const pf = (v) => (v != null && Number.isFinite(+v) ? F.num(+v, 2) : '–');
const pct0 = (v) => (v != null && Number.isFinite(+v) ? F.pct(+v * 100, 0) : '–');

/* reason sentence: health.json reason (cs, or reason_en), otherwise built from the status (English has no reason yet) */
function reason(s) {
  const r = H.txt(s, 'reason');
  if (r) return r;
  if (s.in_app === false || s.hidden) return t('le.r.hidden');
  const n = s.forward?.trades ?? 0;
  if (s.status === 'vypnuto') return t('le.r.off');
  if (s.status === 'sleduj') return t('le.r.watch');
  return s.forward?.enough_data ? t('le.r.ok') : t('le.r.few', { n });
}

function bar(cls, v, label) {
  const w = v == null ? 0 : Math.max(0, Math.min(100, v * 100));
  return `<div class="le-bar ${cls}"><span class="le-bar-l">${label}</span><span class="le-track"><i style="width:${w.toFixed(1)}%"></i></span></div>`;
}

function card(s, h, now) {
  const lt = lightOf(s);
  const bt = s.backtest || {};
  const fw = s.forward || null;
  const hidden = s.in_app === false || s.hidden;
  const label = t(`le.name.${s.horizon || s.id}`);
  const n = fw?.trades ?? 0;
  const enough = !!fw?.enough_data;
  let cmp = '';
  if (hidden) {
    cmp = `<p class="le-row"><span>${t('le.test')}</span><b class="num">${bt.pf != null ? t('le.pfOnly', { pf: pf(bt.pf) }) : '–'}</b></p>`;
  } else {
    const testTxt = t('le.testV', { w: pct0(bt.win_rate), pf: pf(bt.pf_r ?? bt.pf) });
    const pracTxt = n === 0 ? t('le.prac0') : t('le.pracV', { n, u: F.unit('trade', n), w: pct0(fw.win_rate), pf: pf(fw.pf_r) });
    const prog = enough ? bar('is-prac', fw.win_rate, t('le.barPrac'))
      : `<div class="le-bar is-count"><span class="le-bar-l">${t('le.barCount', { n, m: 10 })}</span><span class="le-track"><i style="width:${Math.min(100, n * 10)}%"></i></span></div>`;
    cmp = `<p class="le-row"><span>${t('le.test')}</span><b class="num">${F.esc(testTxt)}</b></p>
      ${bar('is-test', bt.win_rate, t('le.barTest'))}
      <p class="le-row"><span>${t('le.prac')}</span><b class="num">${F.esc(pracTxt)}</b></p>
      ${prog}
      ${fw?.open ? `<p class="le-open">${t('le.open', { n: fw.open, u: F.unit('signal', fw.open) })}</p>` : ''}`;
  }
  const paper = !hidden && s.paper?.trades ? `<p class="le-paper">${t('le.paper', { n: s.paper.trades, u: F.unit('trade', s.paper.trades), v: F.money(+s.paper.pnl_usd || 0, 'USD', 0) })}</p>` : '';
  const checked = h.updated_at ? t('le.checked', { ago: F.ago(h.updated_at, now) }) : (h.checked_at_cs ? t('le.checkedAt', { at: h.checked_at_cs }) : '');
  return `<article class="le-card is-${lt}" id="le-${F.esc(s.horizon || s.id)}">
    <div class="le-head">
      <span class="le-light is-${lt}" aria-hidden="true"><i></i></span>
      <div class="le-id"><p class="le-name">${F.esc(label)}</p><p class="le-st is-${lt}">${t(`le.st.${lt}`)}</p></div>
    </div>
    <p class="le-why">${F.esc(reason(s))}</p>
    <div class="le-cmp">${cmp}</div>
    ${paper}
    ${checked ? `<p class="le-checked">${icon('clock', 'icon-xs')}<span>${F.esc(checked)}</span></p>` : ''}
  </article>`;
}

/* "Měsíční učení" line – only when health.json carries it (field learning / monthly); otherwise hidden */
function monthly(h) {
  const m = h.learning || h.monthly || null;
  if (!m || typeof m !== 'object') return '';
  const next = H.txt(m, 'next') || (m.next_at ? F.dmy(m.next_at) : null);
  const last = H.txt(m, 'last_result') || H.txt(m, 'last');
  if (!next && !last) return '';
  return `<section class="card le-month"><p class="le-month-t">${icon('calendar', 'icon-xs')}${t('le.month')}${next ? ` <b class="num">${F.esc(next)}</b>` : ''}</p>
    ${last ? `<p class="le-month-s">${t('le.monthLast')} ${F.esc(last)}</p>` : ''}</section>`;
}

function summary(h) {
  const s = H.txt(h, 'summary');
  if (s) return s;
  const vis = h.strategies.filter((x) => x.in_app !== false && !x.hidden);
  const off = vis.filter((x) => x.status === 'vypnuto').length, watch = vis.filter((x) => x.status === 'sleduj').length;
  return off ? t('le.sum.off', { n: off }) : watch ? t('le.sum.watch', { n: watch }) : t('le.sum.ok');
}

export function render(ctx) {
  const head = `<header class="page-head"><div><a class="back" href="#/vice">${icon('chev-left', 'icon-xs')}${t('nav.vice')}</a>
    <h1 class="page-title">${t('le.title')}</h1></div></header>
  <p class="le-hero">${t('le.hero')}</p>`;
  const steps = [1, 2, 3, 4].map((n) => `<li class="how-step"><span class="how-n num">${n}</span><div><p class="how-t">${t(`le.d${n}.t`)}</p><p class="how-s">${t(`le.d${n}.s`)}</p></div></li>`).join('');
  const daily = `<h2 class="section-title">${t('le.daily')}</h2><ol class="how-flow le-daily">${steps}</ol>`;
  const gl = ['pf', 'win', 'test', 'prac'].map((k) => `<div class="le-gl-r"><dt>${t(`le.g.${k}.t`)}</dt><dd>${t(`le.g.${k}.s`)}</dd></div>`).join('');
  const gloss = `<h2 class="section-title">${t('le.gloss')}</h2><dl class="card le-gl">${gl}</dl>`;
  if (!ctx.data?.signals && !ctx.data?.health) return head + skBlock(260);
  const h = H.of(ctx.data);
  if (!h) return head + `<p class="d-empty">${t('le.none')}</p>` + daily + gloss;
  const now = ctx.now();
  const list = ORDER.map((id) => h.strategies.find((x) => (x.horizon || x.id) === id)).filter(Boolean)
    .concat(h.strategies.filter((x) => !ORDER.includes(x.horizon || x.id)));
  const shown = list.filter((x) => x.in_app !== false && !x.hidden);
  const hid = list.filter((x) => x.in_app === false || x.hidden);
  return head + `
  <p class="le-sum">${icon('shield', 'icon-xs')}<span>${F.esc(summary(h))}</span></p>
  <div class="le-list">${shown.map((s) => card(s, h, now)).join('')}</div>
  ${hid.length ? `<h2 class="section-title">${t('le.tried')}</h2><div class="le-list">${hid.map((s) => card(s, h, now)).join('')}</div>` : ''}
  ${daily}
  ${monthly(h)}
  ${gloss}
  <p class="honest">${icon('info', 'icon-xs')} ${t('le.honest')}</p>`;
}

/* one calm line "Signály na týden jsou dočasně vypnuté – robot je hlídá ›" (Dnes, Signály) */
export function offLine(data, only = null) {
  const off = H.offHorizons(data).filter((h) => !only || only === h);
  if (!off.length) return '';
  const names = off.map((h) => t(`le.off.hz.${h}`));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t('le.and')} ${names[names.length - 1]}` : names[0];
  return `<a class="le-offline" href="#/uceni">${icon('shield', 'icon-xs')}<span>${F.esc(t(off.length > 1 ? 'le.offN' : 'le.off1', { hz: list }))}</span>${icon('chev-right', 'icon-xs')}</a>`;
}

/* Dnes / Výsledky: one line to the page */
export function linkLine(data, now, cls = 'd-robot d-learn') {
  const h = H.of(data);
  if (!h) return '';
  const vis = h.strategies.filter((x) => x.in_app !== false && !x.hidden);
  const off = vis.filter((x) => x.status === 'vypnuto').length, watch = vis.filter((x) => x.status === 'sleduj').length;
  const txt = off ? t('le.line.off', { n: off }) : watch ? t('le.line.watch', { n: watch }) : t('le.line.ok', { n: vis.length });
  const lt = off ? 'off' : watch ? 'watch' : 'ok';
  return `<a class="${cls}" href="#/uceni"><span class="le-light is-${lt} is-sm" aria-hidden="true"><i></i></span><span>${F.esc(txt)}${h.updated_at ? ` · ${F.esc(F.ago(h.updated_at, now))}` : ''}</span>${icon('chev-right', 'icon-xs')}</a>`;
}
