// Secondary screens: journal, calendar, simulator, academy, league, levels, plans.
import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import * as store from '../store.js';
import { t, tr, L } from '../i18n/index.js';
import { LESSONS, lessonText } from '../lessons.js';
import { icon, seg, segMove, toast, copyText, skBlock, haptic } from '../ui.js';
import { equityChart } from '../charts.js';

const head = (title, sub = '', back = true) => `<header class="page-head"><div>
  ${back ? `<a class="back" href="#/vice">${icon('chev-left', 'icon-sm')}${t('common.back')}</a>` : ''}
  <h1 class="page-title">${title}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}</div></header>`;
const tone = (v) => (v > 0.005 ? 'up' : v < -0.005 ? 'down' : '');

/* ================= Journal ================= */
export function renderJournal(ctx) {
  if (!ctx.data?.signals) return head(t('title.denik')) + skBlock(200);
  const rows = D.journalRows(ctx.data);
  const ins = rows.filter((r) => r.e.state === 'in');
  const outs = rows.filter((r) => r.e.state === 'out');
  const myR = ins.reduce((a, r) => a + (r.my?.r || 0), 0);
  const botR = ins.reduce((a, r) => a + (r.botR || 0), 0);
  const skippedR = outs.reduce((a, r) => a + (r.botR || 0), 0);
  const money = ins.reduce((a, r) => a + (r.my?.money || 0), 0);
  const ccy = D.calcState().ccy;
  const showR = D.showR(ctx.data);
  const myPct = ins.reduce((a, r) => a + (r.my?.pct || 0), 0) / (ins.length || 1);
  return head(t('title.denik'), t('jr.sub')) + (rows.length ? `
    <div class="stats stats-3">
      ${showR ? `<div class="stat"><p class="stat-l">${t('jr.me')}</p><p class="stat-v num ${tone(myR)}">${F.sr(myR)}</p></div>
      <div class="stat"><p class="stat-l">${t('jr.botSame')}</p><p class="stat-v num ${tone(botR)}">${F.sr(botR)}</p></div>`
      : `<div class="stat"><p class="stat-l">${t('jr.trades')}</p><p class="stat-v num">${ins.length}</p></div>
      <div class="stat"><p class="stat-l">${t('jr.avgPos')}</p><p class="stat-v num ${tone(myPct)}">${F.spct(myPct, 2)}</p></div>`}
      <div class="stat"><p class="stat-l">${t('jr.myResult')}</p><p class="stat-v num ${tone(money)}">${money ? (money > 0 ? '+' : '') + F.money(money, ccy) : '–'}</p></div>
    </div>
    <p class="honest">${t('jr.withEntry', { n: ins.length })} ${showR ? t('jr.skipped', { v: F.sr(skippedR) }) : ''}</p>
    <h2 class="section-title">${t('jr.entries')}<small>${rows.length}</small></h2>
    <div class="hist-list">${rows.map((r) => {
      const v = r.e.state === 'in' ? r.my?.r : null;
      return `<button class="hist-row" type="button" data-action="open-signal" data-id="${F.esc(r.id)}">
        <span class="hist-bar ${r.e.state === 'in' ? tone(v) : ''}"></span>
        <span><span class="hist-sym">${F.esc(r.s.symbol)}<span class="tag">${t(r.e.state === 'in' ? 'jr.tagIn' : 'jr.tagOut')}</span>${r.closed ? '' : `<span class="tag new">${t('jr.tagOpen')}</span>`}</span>
          <span class="hist-meta" style="display:block">${F.HZ_LABEL[r.s.horizon]}${r.e.state === 'in' ? t('jr.myEntry', { v: F.price(r.e.entry) }) : ''}</span></span>
        <span class="hist-res"><span class="hist-r num ${r.e.state === 'in' ? tone(v) : 'flat'}" style="display:block">${r.e.state === 'in' && r.my ? F.spct(r.my.pct, 2) : '–'}</span>
          <span class="hist-p num" style="display:block">${showR ? t('jr.meBot', { me: v != null && r.e.state === 'in' ? F.sr(v) : '–', bot: r.botR != null ? F.sr(r.botR) : '–' }) : t('jr.posChange')}</span></span>
      </button>`;
    }).join('')}</div>` : `<div class="empty"><h3>${t('jr.empty.t')}</h3><p>${t('jr.empty.s')}</p><a class="btn btn-secondary btn-small" style="margin-top:16px" href="#/signaly">${t('jr.empty.btn')}</a></div>`) +
    `<p class="jnote" style="margin-top:16px">${t('jr.foot')}</p>`;
}

/* ================= Calendar ================= */
export function renderCalendar(ctx) {
  const ev = ctx.data?.calendar?.events;
  if (!ev) return head(t('more.kalendar')) + skBlock(260);
  const f = store.get('calF', 'all');
  const now = ctx.now();
  const open = D.allOpen(ctx.data);
  const list = ev.filter((e) => F.daysUntil(e.date, now) >= 0 && (f === 'all' || e.type === f));
  const days = new Map();
  list.forEach((e) => { if (!days.has(e.date)) days.set(e.date, []); days.get(e.date).push(e); });
  return head(t('more.kalendar'), t('cal.sub')) +
    seg({ name: 'calF', label: t('cal.filter'), small: true, items: [{ id: 'all', label: t('cal.all') }, { id: 'earnings', label: t('cal.earnings') }, { id: 'macro', label: t('cal.macro') }], active: f }) +
    `<div class="cal">${[...days.entries()].map(([d, arr]) => `<div class="cal-day"><p class="cal-date"><b>${F.dm(d)}</b> ${F.weekday(d)}<span>${F.countdown(d, now)}</span></p>
      <div class="hist-list">${arr.map((e) => {
        const hit = open.filter((s) => D.eventsFor(s, [e]).length);
        return `<div class="cal-row">
          <span class="cal-time num">${e.time || t('cal.allDay')}</span>
          <span><span class="cal-t">${F.esc(L(e.title))}</span>${hit.length ? `<span class="cal-hit">${icon('alert', 'icon-xs')}${t('cal.affects', { list: hit.map((s) => F.esc(s.symbol)).join(', ') })}</span>` : ''}</span>
          <span class="imp" aria-label="${t('cal.imp', { n: e.importance })}">${[1, 2, 3].map((i) => `<i class="${i <= e.importance ? 'on' : ''}"></i>`).join('')}</span>
        </div>`;
      }).join('')}</div></div>`).join('') || `<div class="empty"><h3>${t('cal.empty.t')}</h3><p>${t('cal.empty.s')}</p></div>`}</div>
    <p class="jnote" style="margin-top:16px">${t('cal.foot')}</p>`;
}

/* ================= Simulator ================= */
let simChart = null;
function simState(ctx) {
  const s = store.get('sim', {}) || {};
  const cs = D.calcState();
  const first = ctx.data.performance.equity[0].date;
  return {
    start: s.start && s.start >= first ? s.start : first,
    capital: s.capital > 0 ? s.capital : cs.account,
    leverage: s.leverage || 2,
    profile: D.PROFILES.some((p) => p.id === s.profile) ? s.profile : 'cons',
    ccy: cs.ccy,
  };
}
function simStarts(perf) {
  const out = [{ id: perf.equity[0].date, label: t('sim.fromStart', { date: F.dm(perf.equity[0].date) }) }];
  const seen = new Set();
  perf.equity.forEach((p) => { const m = p.date.slice(0, 7); if (!seen.has(m)) { seen.add(m); if (p.date !== perf.equity[0].date) out.push({ id: p.date, label: t('sim.from', { date: F.dm(p.date) }) }); } });
  return out;
}
function simOutput(ctx) {
  const st = simState(ctx);
  const prof = CONFIG.CALC.RISK_PROFILES.find((p) => p.id === st.profile);
  const r = D.simulate(ctx.data.history.signals, ctx.data.performance, { start: st.start, capital: st.capital, leverage: st.leverage, riskPct: prof.pct });
  return { st, r };
}
export function renderSim(ctx) {
  if (!ctx.data?.performance || !ctx.data?.history) return head(t('more.simulator')) + skBlock(300);
  const { st, r } = simOutput(ctx);
  return head(t('more.simulator'), t('sim.sub')) + `
  <p class="callout warn sim-warn">${icon('alert')}<span>${t('sim.warn')}</span></p>
  <div class="calc-layout" style="margin-top:14px">
    <div class="calc-inputs">
      <section class="field"><label class="field-l" for="sim-start">${t('sim.start')}</label>
        <div class="select-wrap"><select id="sim-start" class="select">${simStarts(ctx.data.performance).map((o) => `<option value="${o.id}" ${o.id === st.start ? 'selected' : ''}>${o.label}</option>`).join('')}</select>${icon('chev-down', 'icon-sm')}</div></section>
      <section class="field"><label class="field-l" for="sim-cap">${t('sim.capital', { ccy: st.ccy })}</label>
        <div class="money-input"><input id="sim-cap" class="num" inputmode="decimal" value="${F.num(st.capital, 0)}"></div></section>
      <section class="field"><p class="field-l">${t('calc.lev')}</p>${seg({ name: 'simLev', small: true, label: t('calc.lev'), items: [1, 2, 3, 4, 5].map((v) => ({ id: String(v), label: `${v}×` })), active: String(st.leverage) })}</section>
      <section class="field"><p class="field-l">${t('calc.profile')}</p>
        <div class="profiles" role="radiogroup">${CONFIG.CALC.RISK_PROFILES.map((p) => `<button type="button" class="profile" role="radio" aria-checked="${p.id === st.profile}" data-action="sim-profile" data-id="${p.id}"><span class="profile-t">${t(`profile.${p.id}`)}<span class="radio-dot"></span></span><span class="profile-v num" style="display:block">${F.pct(p.pct, 0)}</span><span class="profile-s">${t('calc.perTrade')}</span></button>`).join('')}</div></section>
    </div>
    <aside class="calc-out" id="sim-out">${simResult(ctx, st, r)}</aside>
  </div>`;
}
function simResult(ctx, st, r) {
  return `<div class="result-card">
    <p class="result-hero-l">${t('sim.final')}</p>
    <p class="result-hero num">${F.money(r.final, st.ccy)}</p>
    <p class="result-units num" style="color:var(--${r.ret >= 0 ? 'up' : 'down'})">${t('sim.over', { v: F.spct(r.ret), n: r.trades, u: F.unit('trade', r.trades) })}</p>
    <div class="chart-box sim-chart" id="sim-chart"></div>
    <p class="perf-legend" style="margin-top:6px"><i class="bot"></i>${t('sim.legend')}<i class="spy" style="margin-left:12px"></i>S&amp;P 500</p>
    <div class="result-grid">
      <div><p class="rg-l">${t('res.dd')}</p><p class="rg-v num down">${F.spct(r.maxDD)}</p></div>
      <div><p class="rg-l">${t('res.winrate')}</p><p class="rg-v num">${r.trades ? F.pct((r.wins / r.trades) * 100, 0) : '–'}</p></div>
    </div>
    ${r.capped ? `<div class="callout">${icon('info')}<div>${t('sim.capped', { n: r.capped, lev: st.leverage })}</div></div>` : ''}
  </div>`;
}
function simRefresh(ctx) {
  const { st, r } = simOutput(ctx);
  const out = document.getElementById('sim-out');
  if (!out) return;
  out.innerHTML = simResult(ctx, st, r);
  simMountChart(ctx, r);
}
function simMountChart(ctx, r) {
  simChart && simChart.destroy();
  const box = document.getElementById('sim-chart');
  if (box && r.series.length > 1) simChart = equityChart(box, r.series, {});
}
export function mountSim(el, ctx) {
  if (!ctx.data?.performance) return;
  simMountChart(ctx, simOutput(ctx).r);
  el.querySelector('#sim-start')?.addEventListener('change', (e) => { store.update('sim', (s) => ({ ...(s || {}), start: e.target.value }), {}); simRefresh(ctx); });
  const cap = el.querySelector('#sim-cap');
  cap?.addEventListener('input', () => { const v = F.parseNum(cap.value); if (v > 0) { store.update('sim', (s) => ({ ...(s || {}), capital: v }), {}); simRefresh(ctx); } });
  cap?.addEventListener('blur', () => { cap.value = F.num(simState(ctx).capital, 0); });
}

/* ================= Academy ================= */
export function renderAcademy(ctx) {
  const done = D.lessonsDone();
  const pct = (done.size / LESSONS.length) * 100;
  return head(t('more.akademie'), t('ac.sub')) + `
  <div class="card acad-prog"><div class="card-row"><div><p class="card-t num">${t('ac.done', { d: done.size, n: LESSONS.length })}</p><p class="card-s">${t('ac.unlock')}</p></div><a class="btn btn-secondary btn-small" href="#/urovne">${t('ac.levels')}</a></div>
    <div class="progress"><span style="width:${pct}%"></span></div></div>
  <ol class="lessons">${LESSONS.map((l) => `<li><a class="lesson-row ${done.has(l.id) ? 'is-done' : ''}" href="#/akademie/${l.id}">
    <span class="lesson-n num">${done.has(l.id) ? icon('check', 'icon-sm') : l.id}</span>
    <span class="menu-main"><span class="menu-t">${F.esc(lessonText(l.id).title)}</span><span class="menu-s">${t('ac.read', { n: l.min })}</span></span>
    ${icon('chev-right', 'icon-sm menu-chev')}</a></li>`).join('')}</ol>`;
}

const nb = (p) => F.esc(p).replace(/(\d) (%|Kč|CZK|R)\b/g, '$1 $2').replace(/(\d) %/g, '$1 %');
export function renderLesson(ctx, id) {
  const l = LESSONS.find((x) => x.id === id) || LESSONS[0];
  const tx = lessonText(l.id);
  const done = D.lessonsDone().has(l.id);
  const next = LESSONS.find((x) => x.id === l.id + 1);
  const prev = LESSONS.find((x) => x.id === l.id - 1);
  return `<header class="page-head"><div><a class="back" href="#/akademie">${icon('chev-left', 'icon-sm')}${t('more.akademie')}</a>
    <p class="lesson-k num">${t('ac.k', { i: l.id, n: LESSONS.length })}</p><h1 class="page-title">${F.esc(tx.title)}</h1></div></header>
    <article class="lesson">${tx.body.map((p) => `<p>${nb(p)}</p>`).join('')}
      <div class="lesson-key">${icon('check')}<p>${F.esc(tx.key)}</p></div></article>
    <div class="lesson-nav">
      ${prev ? `<a class="btn btn-ghost" href="#/akademie/${prev.id}">${icon('chev-left', 'icon-sm')}${t('ac.prev')}</a>` : '<span></span>'}
      <button class="btn ${done ? 'btn-secondary' : 'btn-primary'}" type="button" data-action="lesson-done" data-id="${l.id}" data-next="${next ? next.id : ''}">${t(done ? (next ? 'ac.next' : 'ac.backTo') : (next ? 'ac.doneNext' : 'ac.finish'))}</button>
    </div>`;
}

/* ================= League ================= */
export function renderLeague(ctx) {
  const lg = ctx.data?.league;
  if (!lg) return head(t('more.liga')) + skBlock(300);
  const s = lg.season;
  const B = lg.badges || {};
  const showR = D.showR(ctx.data);
  return head(t('more.liga'), t('lg.sub', { season: F.esc(L(s.name)) })) + `
    <div class="card"><div class="card-row"><div><p class="card-t">${t('lg.week', { w: s.week, n: s.weeks })}</p><p class="card-s">${t('lg.end', { date: F.dmy(s.end) })}</p></div><span class="phase-now">${t('lg.now')}</span></div>
      <div class="progress"><span style="width:${(s.week / s.weeks) * 100}%"></span></div>
      <p class="card-s" style="margin-top:12px">${F.esc(L(lg.score_note))}</p></div>
    <h2 class="section-title">${t('lg.rank')}<small>${t('lg.score')}</small></h2>
    <ol class="board">${lg.players.map((p) => `<li class="board-row ${p.is_me ? 'is-me' : ''}">
      <span class="board-rank num ${p.rank <= 3 ? 'top' : ''}">${p.rank}</span>
      <span class="board-main"><span class="board-name">${F.esc(p.is_me ? t('lg.you') : p.name)}</span>
        <span class="board-meta num">${t('lg.meta', { n: p.trades })}${showR ? t('lg.metaDD', { v: F.num(p.max_dd_r, 1) }) : ''}</span></span>
      <span class="board-badges">${(p.badges || []).map((b) => `<span class="badge-ic" title="${F.esc(L(B[b]?.name) || b)}">${icon(badgeIcon(b), 'icon-xs')}</span>`).join('')}</span>
      <span class="board-score num ${tone(p.score)}">${F.signed(p.score, 2)}</span>
    </li>`).join('')}</ol>
    <h2 class="section-title">${t('lg.badges')}</h2>
    <div class="badge-list">${Object.entries(B).map(([k, b]) => `<div class="badge-row"><span class="badge-ic lg">${icon(badgeIcon(k), 'icon-sm')}</span><div><p class="card-t">${F.esc(L(b.name))}</p><p class="card-s">${F.esc(L(b.desc))}</p></div></div>`).join('')}</div>
    <p class="jnote" style="margin-top:16px">${t('lg.foot')}</p>`;
}
const badgeIcon = (k) => ({ disciplina: 'shield', serie5: 'spark', bezpaky: 'feather', akademie: 'book' }[k] || 'star');

/* ================= Levels ================= */
export function renderLevels(ctx) {
  const Lv = D.levelInfo(ctx.data);
  const paper = (ctx.data?.signals?.mode || 'paper') === 'paper';
  const pr = Lv.progress;
  const hzList = (hs) => hs.map((h) => F.HZ_LABEL[h]).join(', ');
  return head(t('more.urovne'), t('lv.sub')) + `
  <div class="level-now">
    <p class="kv-l">${t('lv.yours')}</p>
    <p class="level-name">${F.esc(D.levelName(Lv.level))}</p>
    <p class="card-s">${hzList(Lv.level.horizons)}. ${t('lv.levMax', { v: Lv.level.max_leverage })}</p>
    ${pr ? `<div class="level-req">
      <div><div class="req-row"><span>${t('lv.lessons')}</span><b class="num">${t('lv.of', { a: pr.lessons, b: pr.lessonsNeed })}</b></div><div class="progress"><span style="width:${(pr.lessons / pr.lessonsNeed) * 100}%"></span></div></div>
      <div><div class="req-row"><span>${t('lv.usage')}</span><b class="num">${t('lv.weeksOf', { a: F.num(Math.floor(pr.weeks * 10) / 10, 1, 0), b: pr.weeksNeed })}</b></div><div class="progress"><span style="width:${(pr.weeks / pr.weeksNeed) * 100}%"></span></div></div>
      <p class="card-s">${t('lv.next', { name: F.esc(D.levelName(Lv.next)), hz: hzList(Lv.next.horizons.filter((h) => !Lv.level.horizons.includes(h))), lev: Lv.next.max_leverage })}</p>
      <a class="btn btn-primary btn-block" href="#/akademie">${t('lv.continue')}</a>
    </div>` : `<p class="card-s" style="margin-top:10px">${t('lv.all')}</p>`}
  </div>
  <h2 class="section-title">${t('lv.list')}</h2>
  <ol class="phases">${CONFIG.LEVELS.map((lv, i) => `<li class="phase ${i === Lv.idx ? 'is-now' : ''} ${i < Lv.idx ? 'is-done' : ''}"><span class="phase-n num">${i < Lv.idx ? icon('check', 'icon-sm') : i + 1}</span><div>
    <p class="phase-t">${F.esc(D.levelName(lv))}${i === Lv.idx ? `<span class="phase-now">${t('lv.now')}</span>` : ''}</p>
    <p class="phase-d">${hzList(lv.horizons)}. ${t('lv.levMax', { v: lv.max_leverage })}${lv.lessons ? t('lv.cond', { lessons: lv.lessons === LESSONS.length ? t('lv.condAll') : t('lv.condN', { n: lv.lessons }), weeks: lv.weeks, wu: F.unit('week', lv.weeks) }) : t('lv.start')}</p></div></li>`).join('')}</ol>
  ${paper && CONFIG.LEVELS_TESTER_BYPASS ? `<div class="card" style="margin-top:22px"><div class="card-row"><div><p class="card-t">${t('lv.tester')}</p><p class="card-s">${t('lv.testerS')}</p></div>
    <button class="switch" role="switch" type="button" aria-checked="${Lv.tester}" data-action="tester" aria-label="${t('lv.tester')}"></button></div></div>` : ''}`;
}

/* ================= Plans and invites ================= */
function myCode() {
  let c = store.get('refCode');
  if (!c) {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    c = 'PULSE-' + Array.from({ length: 5 }, () => a[Math.floor(Math.random() * a.length)]).join('');
    store.set('refCode', c);
  }
  return c;
}
export function renderPlans(ctx) {
  const live = ctx.data?.signals?.mode === 'live';
  const code = myCode();
  const link = `${location.origin}${location.pathname}?ref=${code}`;
  const by = store.get('invitedBy');
  return head(t('pl.title')) + `
  <div class="plans">${CONFIG.PLANS.map((p) => `<section class="plan ${p.id === 'pro' ? 'is-pro' : ''}">
    <div class="plan-head"><p class="plan-name">${t(`plan.${p.id}`)}</p>${p.id === 'pro' ? `<span class="phase-now">${t('pl.recommended')}</span>` : ''}</div>
    <p class="plan-price num">${F.money(p.price, p.currency, 0)}<small>${p.period ? ` ${t('pl.month')}` : ''}</small></p>
    <ul class="plan-f">${(tr(`plan.${p.id}.f`) || []).map((f) => `<li>${icon('check', 'icon-xs')}${F.esc(f)}</li>`).join('')}</ul>
    ${p.id === 'pro' ? `<button class="btn btn-primary btn-block btn-two-line" type="button" ${live ? '' : 'disabled aria-disabled="true"'}><span>${t('pl.activate')}</span>${live ? '' : `<span class="btn-note" style="color:inherit;opacity:.75">${t('pl.soon')}</span>`}</button>` : `<p class="plan-cur">${t(live ? 'pl.current' : 'pl.testing')}</p>`}
  </section>`).join('')}</div>
  <h2 class="section-title">${t('pl.invite')}</h2>
  <div class="card invite">
    <p class="card-s">${t('pl.bonus')}</p>
    <div class="code-box"><span class="num">${code}</span><button class="btn btn-secondary btn-small" type="button" data-action="copy-code" data-v="${code}">${icon('copy', 'icon-sm')}${t('common.copy')}</button></div>
    <button class="btn btn-primary btn-block" type="button" data-action="share-invite" data-link="${F.esc(link)}">${icon('share', 'icon-sm')}${t('pl.share')}</button>
    ${by ? `<p class="card-s" style="margin-top:12px">${t('pl.by', { code: F.esc(by) })}</p>` : ''}
  </div>
  <p class="jnote" style="margin-top:16px">${t('pl.foot')}</p>`;
}

export const actions = {
  'lesson-done'(el) {
    const id = +el.dataset.id;
    const was = D.lessonsDone().has(id);
    D.markLesson(id, true);
    if (!was) { haptic(12); toast(t('ac.toast')); }
    (window.__pulseGo ? window.__pulseGo(el.dataset.next ? `#/akademie/${el.dataset.next}` : '#/akademie') : (location.hash = el.dataset.next ? `#/akademie/${el.dataset.next}` : '#/akademie'));
  },
  tester(el, ev, ctx) {
    store.set('tester', el.getAttribute('aria-checked') !== 'true');
    ctx.rerender();
  },
  'sim-profile'(el, ev, ctx) {
    store.update('sim', (s) => ({ ...(s || {}), profile: el.dataset.id }), {});
    document.querySelectorAll('[data-action="sim-profile"]').forEach((p) => p.setAttribute('aria-checked', String(p === el)));
    simRefresh(ctx);
  },
  async 'copy-code'(el) { const ok = await copyText(el.dataset.v); toast(t(ok ? 'pl.codeCopied' : 'pl.copyFail')); },
  async 'share-invite'(el) {
    const url = el.dataset.link;
    const text = t('pl.shareText', { app: CONFIG.APP_NAME });
    if (navigator.share) { try { await navigator.share({ title: CONFIG.APP_NAME, text, url }); return; } catch { /* cancelled */ } }
    const ok = await copyText(`${text} ${url}`);
    toast(t(ok ? 'pl.linkCopied' : 'pl.copyFail'));
  },
  seg(el, ev, ctx) {
    const n = el.dataset.segName;
    if (n === 'calF') { store.set('calF', el.dataset.id); ctx.rerender({ soft: true }); return true; }
    if (n === 'simLev') { store.update('sim', (s) => ({ ...(s || {}), leverage: +el.dataset.id }), {}); segMove(document.getElementById('view'), n, el.dataset.id); simRefresh(ctx); return true; }
    return false;
  },
};
