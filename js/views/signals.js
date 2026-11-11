import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import * as store from '../store.js';
import * as Live from '../live.js';
import { t, L } from '../i18n/index.js';
import { pricePoints } from '../charts.js';
import { sparkline } from '../ui.js';
import { icon, seg, segMove, ladder, pill, skCard, liveState, haptic, monogram, calmArt, statusLine, track } from '../ui.js';
import * as B from '../brief.js';
import * as H from '../health.js';
import { offLine } from './learn.js';

const seen = new Set(); // ladders animate only the first time a card appears

export function regimeLine(r) {
  if (!r) return '';
  const off = r.state === 'risk_off';
  return `<p class="regime-line ${off ? 'is-off' : ''}" title="${F.esc(L(r.note))}"><i aria-hidden="true"></i>${t(off ? 'regime.off' : 'regime.on')}<span class="num">${t('regime.vs', { v: F.spct(r.spy_vs_sma200_pct ?? 0) })}</span></p>`;
}

function upcoming(data, now, n) {
  const out = []; let from = new Date(now);
  for (let i = 0; i < n; i++) {
    const d = D.nextRun(i === 0 ? data : null, from);
    const days = F.daysUntil(d, now);
    out.push({ day: days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(d), time: F.time(d) });
    from = new Date(d.getTime() + 60000);
  }
  return out;
}

/* Next intraday scan slot (Prague minutes :05/:25/:45) after `now`, while the US market is open; null otherwise */
export function nextScan(now) {
  if (!Live.marketOpen(now)) return null;
  const mins = (CONFIG.SCAN?.MINUTES || [5, 25, 45]);
  const d = new Date(now); d.setSeconds(0, 0);
  for (let k = 1; k <= 61; k++) {
    const x = new Date(d.getTime() + k * 60000);
    if (mins.includes(x.getMinutes())) return Live.marketOpen(x) ? x : null;
  }
  return null;
}

const dayWord = (d, now) => { const n = F.daysUntil(d, now); return n === 0 ? t('fmt.today') : n === 1 ? t('fmt.tomorrow') : F.weekday(d); };
const inWords = (d, now) => {
  const mins = Math.max(0, Math.round((d - now) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? t('next.in', { h, m }) : t('next.inMin', { m });
};

/* Truthful "when do new signals come" card:
   market open  -> the robot is watching now, new signals any time, next check in X min (:05/:25/:45);
   market closed -> whichever comes first: the official 22:45 run, or the next session start (scans every 20 min). */
export function nextLine(data, now) {
  const scan = nextScan(now);
  const official = D.nextRun(data, now);
  if (scan || Live.marketOpen(now)) {
    /* market open: next scan slot, or (last ~15 min of the session) the last check is done */
    const mins = scan ? Math.max(1, Math.round((scan - now) / 60000)) : 0;
    const plan = scan ? [scan] : [];
    for (let k = 0; k < 2 && plan.length; k++) { const x = nextScan(new Date(plan[plan.length - 1].getTime() + 30000)); if (!x) break; plan.push(x); }
    return `<section class="next-card is-live" aria-label="${F.esc(t('next.open.k'))}">
      <div class="next-ico"><span class="radar" aria-hidden="true"><i></i><i></i></span>${icon('signals')}</div>
      <div class="next-body">
        <p class="next-k"><span class="live-dot" aria-hidden="true"></span>${F.esc(t('next.open.k'))}</p>
        <p class="next-when">${F.esc(t('next.open.when'))}</p>
        <p class="next-s">${F.esc(t('next.open.s', { time: F.time(official) }))}</p>
      </div>
      <div class="next-in num">${F.esc(scan ? t('next.open.in', { m: mins }) : t('next.open.last'))}</div>
      <ol class="next-plan">${plan.map((x, i) => `<li class="${i === 0 ? 'is-next' : ''}"><span>${F.esc(t('next.scan'))}</span><b class="num">${F.esc(F.time(x))}</b></li>`).join('')}<li><span>${F.esc(t('next.official'))}</span><b class="num">${F.esc(F.time(official))}</b></li></ol>
    </section>`;
  }
  const open = nextUsOpen(now);
  const firstScan = open ? new Date(open.getTime() + 15 * 60000) : null;
  const sessionFirst = open && open < official;
  const target = sessionFirst ? open : official;
  return `<section class="next-card" aria-label="${F.esc(t('next.title'))}">
    <div class="next-ico">${icon('clock')}</div>
    <div class="next-body">
      <p class="next-k">${F.esc(t(sessionFirst ? 'next.session.k' : 'next.title'))}</p>
      <p class="next-when"><span class="next-day">${F.esc(dayWord(target, now))}</span> <span class="num next-time">${F.esc(F.time(target))}</span></p>
      <p class="next-s">${F.esc(sessionFirst ? t('next.session.s', { scan: firstScan ? F.time(firstScan) : '', time: F.time(official) }) : t('next.sub'))}</p>
    </div>
    <div class="next-in num">${F.esc(inWords(target, now))}</div>
    <ol class="next-plan">${upcoming(data, now, 5).map((x, i) => `<li class="${i === 0 && !sessionFirst ? 'is-next' : ''}"><span>${F.esc(x.day)}</span><b class="num">${F.esc(x.time)}</b></li>`).join('')}</ol>
  </section>`;
}

export function disclaimer() {
  return `<p class="disclaimer">${icon('info')}${F.esc(t('disclaimer'))}</p>`;
}

export function entryChip(st) {
  if (!st) return '';
  return `<span class="entry-st is-${st.code}"><i aria-hidden="true"></i>${F.esc(st.label)}</span>`;
}

function exitPhrase(s, now) {
  const d = F.daysUntil(s.exit_date, now);
  if (d < 0) return t('sig.exit.over');
  if (d === 0) return t('sig.exit.today');
  if (d === 1) return t('sig.exit.tomorrow');
  return t('sig.exit.until', { date: F.dm(s.exit_date) });
}

const RES = { target: 'sig.res.target', stop: 'sig.res.stop', time_exit: 'sig.res.time' };
const HIT = { target: 'sig.hit.target', stop: 'sig.hit.stop', time_exit: 'sig.hit.time' };

export function signalCard(s, { data = null, events = [], now = new Date(), i = 0, showHz = false } = {}) {
  const fresh = !seen.has(s.id);
  seen.add(s.id);
  let state = liveState(s);
  if (state === 'open' && D.isTimeExit(s, now)) state = 'time_exit';
  const hasLive = s.last_price != null;
  const up = (s.pnl_r ?? 0) >= 0;
  const est = D.entryState(s, now);
  const late = est && (est.code === 'late' || est.code === 'expired');
  const risk = D.riskFor(s);
  const prox = state === 'open' ? D.proximity(s) : null;
  const ev = D.eventsFor(s, events);

  let sub = '';
  const hzTag = (showHz ? `<span class="hz-tag">${F.esc(F.HZ_LABEL[s.horizon] || '')}</span>` : '')
    + (s.preview ? `<span class="hz-tag is-preview" title="${F.esc(t('sig.preview.t'))}">${t('sig.preview')}</span>` : '');
  const mine = D.journal()[s.id];
  const myTag = mine?.state === 'closed' ? `<span class="my-tag is-closed">${t('sig.mine.closed', { v: F.spct(D.myResult(s, mine)?.pct ?? 0, 2) })}</span>`
    : mine?.state === 'in' ? `<span class="my-tag">${t('sig.mine.in')}</span>` : '';
  if (state === 'open' && est) sub = `<span class="dotw is-${est.code}"><i></i>${t(`entry.short.${est.code}`)}</span>`;
  else if (state !== 'open') sub = `<span class="dotw is-${state}"><i></i>${t(HIT[state])}${s.hit_at ? t('sig.hit.at', { time: F.time(s.hit_at) }) : ''}</span>`;
  const flag = prox ? `<span class="flag ${prox.side === 'stop' ? 'down' : 'up'}" title="${F.esc(t(`sig.near.${prox.side}`, { v: F.pct(prox.dist, 1) }))}">${icon('alert', 'icon-xs')}</span>`
    : ev.length ? `<span class="flag gold" title="${F.esc(L(ev[0].title))}">${icon('calendar', 'icon-xs')}</span>` : '';

  const right = state === 'open'
    ? (hasLive ? `<p class="sig-pnl num ${up ? 'up' : 'down'}">${F.spct(s.pnl_pct_position, 2)}</p>` : '')
    : `<p class="sig-result ${state === 'target' ? 'up' : state === 'stop' ? 'down' : 'flat'}"><span class="hit-label">${t(RES[state])}</span><span class="sig-pnl num">${F.spct(s.pnl_pct_position, 2)}</span></p>`;

  return `<button class="sig is-${state} ${late ? 'is-late' : ''}" style="--i:${Math.min(i, 8)}" type="button" data-action="open-signal" data-id="${F.esc(s.id)}" data-live-id="${F.esc(s.id)}" data-pnl="${s.pnl_pct_position ?? ''}" aria-label="${F.esc(t('sig.aria', { sym: s.symbol, side: F.SIDE[s.action], name: s.name }))}">
    <div class="sig-head">
      ${monogram(s.symbol, s.name)}
      <div class="sig-id">
        <div class="sig-tl"><span class="ticker">${F.esc(s.symbol)}</span>${pill(s.action)}${flag}${followStar(s)}</div>
        <p class="sig-sub">${hzTag}${sub}${myTag}</p>
      </div>
      ${right}
    </div>
    ${statusLine(s, { now, big: true })}
    ${ladder(s, { animate: fresh })}
    <p class="sig-line num"><span>${t('sig.risk')} <b class="down">${F.spct(-risk.risk, risk.risk % 1 ? 1 : 0)}</b></span><span>${t('sig.target')} <b class="up">${F.spct(risk.target)}</b></span><span>${exitPhrase(s, now)}</span></p>
  </button>`;
}

/* "Sledovat" star (Moje). A span with role=button: the card itself is a button. */
export function followStar(s) {
  const on = D.isFollowed(s.id);
  return `<span class="fav" role="button" tabindex="0" data-action="follow" data-id="${F.esc(s.id)}" data-sym="${F.esc(s.symbol)}" aria-pressed="${on}" aria-label="${t(on ? 'fol.off' : 'fol.on')}" title="${t('fol.t')}">${icon('star', 'icon-sm')}</span>`;
}

export function rTip(v) {
  return `<span class="rv num" data-action="rtip" title="${F.esc(t('rtip'))}">${F.sr(v)}</span>`;
}

export function lockedPanel(data, hz) {
  const Lv = D.levelInfo(data);
  const need = CONFIG.LEVELS.find((l) => l.horizons.includes(hz));
  return `<div class="locked">
    <div class="locked-ic">${icon('lock')}</div>
    <h3>${t('locked.t', { hz: F.HZ_LABEL[hz], level: D.levelName(need) })}</h3>
    <p>${t('locked.s', { lessons: need.lessons, lu: F.unit('lesson', need.lessons), weeks: need.weeks, wu: F.unit('week', need.weeks), done: Lv.lessonsDone })}</p>
    <a class="btn btn-secondary btn-small" href="#/urovne">${t('locked.btn')}</a>
  </div>`;
}

function activeHz(data) {
  let hz = store.get('hz', 'MESIC');
  if (!D.horizonAllowed(data, hz)) hz = D.levelInfo(data).level.horizons[0];
  return hz;
}

/* Horizons shown in the app: a horizon is hidden until its strategy passes the out-of-sample test */
export const VISIBLE_HZ = () => D.HORIZONS.filter((h) => !(CONFIG.HIDDEN_HORIZONS || []).includes(h));

function nyOffsetMin(d) {
  const ny = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((ny - utc) / 60000);
}

/* First US regular-session open (9:30 New York) after `from`. Exchange holidays are not modelled. */
export function nextUsOpen(from) {
  let d = new Date(from);
  for (let k = 0; k < 9; k++) {
    const ny = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const wd = ny.getDay(), mins = ny.getHours() * 60 + ny.getMinutes();
    if (wd >= 1 && wd <= 5 && (k > 0 || mins < 570)) {
      const guess = new Date(Date.UTC(ny.getFullYear(), ny.getMonth(), ny.getDate(), 9, 30));
      return new Date(guess.getTime() - nyOffsetMin(guess) * 60000);
    }
    d = new Date(Date.UTC(ny.getFullYear(), ny.getMonth(), ny.getDate() + 1, 12, 0));
  }
  return null;
}

/* "When to buy" line for a fresh signal */
export function buyWhen(s, now) {
  const est = D.entryState(s, now);
  if (!est || est.code === 'late' || est.code === 'expired') return null;
  /* Intraday preview signal: found while the market is open -> buy now at the limit, while the session runs. */
  if (s.preview) return Live.marketOpen(now) ? { code: 'now', text: t('buy.preview', { price: F.price(s.entry) }) } : null;
  const open = nextUsOpen(s.created_at);
  if (!open) return null;
  const closeAt = new Date(open.getTime() + 390 * 60000);
  if (now < open) {
    const days = F.daysUntil(open, now);
    const day = days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(open);
    return { code: 'soon', text: t('buy.at', { day, time: F.time(open), price: F.price(s.entry) }) };
  }
  if (now < closeAt) return { code: 'now', text: t('buy.now', { price: F.price(s.entry) }) };
  return null;
}

function buyBanner(s, now) {
  const b = buyWhen(s, now);
  if (!b) return '';
  return `<p class="buy-when is-${b.code}">${icon(b.code === 'now' ? 'spark' : 'clock', 'icon-xs')}<span>${F.esc(b.text)}</span></p>`;
}

/* 1.10.0: Signály = three tabs by the SIGNAL's phase (Otevřené = can still enter · Běžící · Uzavřené)
   with the horizon chips (1 den · 2–3 dny · Týden · Měsíc · Vše) as a filter inside. One card everywhere (B.offer). */
const HZ_TABS = ['ALL', 'DEN', 'DNY', 'TYDEN', 'MESIC'];
const PH = ['open', 'running', 'closed'];
const curHz = () => { const h = store.get('sigHz', 'ALL'); return HZ_TABS.includes(h) ? h : 'ALL'; };
const curPh = () => { const f = store.get('sigPh', 'open'); return PH.includes(f) ? f : 'open'; };
const hidden = (h) => (CONFIG.HIDDEN_HORIZONS || []).includes(h);

function openIn(data, hz) {
  const hzs = VISIBLE_HZ().filter((h) => D.horizonAllowed(data, h) && (hz === 'ALL' || h === hz));
  return hzs.flatMap((h) => (data.signals.tracks[h] || []).map((x) => ({ ...x, horizon: x.horizon || h })));
}
function phaseList(data, hz, ph, now) {
  if (ph === 'closed') return D.closedSignals(data, now).filter((x) => hz === 'ALL' || x.horizon === hz);
  /* 1.11.0: Otevřené = what the app offers -> a strategy switched off by the watchdog is not offered (my own trades stay) */
  if (ph === 'open') return openIn(data, hz).filter((x) => D.sigPhase(x, now) === 'open' && (H.offerable(x, data) || ['mine', 'order'].includes(D.cardState(x, data, now).code)));
  return openIn(data, hz).filter((x) => D.sigPhase(x, now) === ph);
}

function sigBody(ctx) {
  const { data } = ctx;
  const now = ctx.now();
  const hz = curHz(), ph = curPh();
  if (hz !== 'ALL' && hidden(hz)) return `<section class="calm u-empty">${calmArt()}<div><h3 class="calm-t">${t('u.den.t')}</h3><p class="calm-s">${t('u.den.s')}</p></div></section>`;
  if (hz !== 'ALL' && !D.horizonAllowed(data, hz)) return lockedPanel(data, hz);
  const list = phaseList(data, hz, ph, now);
  /* 1.11.0: my own trades first, then the best signals (strength from reward:risk -> fresher -> strategy ok before sleduj) */
  if (ph === 'open') {
    const rank = { mine: 0, order: 1 };
    const r = new Map(list.map((x) => [x.id, rank[D.cardState(x, data, now).code] ?? 2]));
    const pos = new Map(H.sortByQuality(list.slice(), data, now).map((x, i) => [x.id, i]));
    list.sort((a, b) => (r.get(a.id) - r.get(b.id)) || (pos.get(a.id) - pos.get(b.id)));
  } else if (ph === 'running') list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const off = ph === 'open' ? offLine(data, hz === 'ALL' ? null : hz) : '';
  if (!list.length) {
    if (ph === 'open') return off || `<p class="empty-line">${t('sg.today0')} ${t('u.empty.buy', { when: F.esc(nextCheck(data, now)) })}</p>`;
    return `<p class="empty-line">${t(`sg.empty.${ph}`)}</p>`;
  }
  return `${off}<div class="sc-list">${list.slice(0, 60).map((x, i) => B.offer(x, { data, now, i })).join('')}</div>`;
}

function phDesc(ph, data = null, now = D.clock()) {
  const c = D.walletCcy();
  if (ph === 'open' && data?.signals) {
    /* honest count: the robot sends only what passes its rules – some days 2, some days 10, some days none */
    const day = (x) => new Date(x).toDateString();
    const list = phaseList(data, 'ALL', 'open', now);
    const today = list.filter((x) => x.created_at && day(x.created_at) === day(now)).length;
    if (!list.length) return t('sg.today0');
    return `${today ? t('sg.todayN', { n: today }) : t('sg.todayNone')} ${t('sg.rules')}${list.length > today ? ` ${t('sg.older', { n: list.length - today })}` : ''}`;
  }
  return t(`sg.phS.${ph}`, { a: F.money(D.EXAMPLE_DEP[c] || 10000, c, 0) });
}
function hzChips(hz) {
  return `<div class="range-chips sg-hz" role="group" aria-label="${F.esc(t('sg.hz'))}">${HZ_TABS.map((h) => `<button type="button" class="range-chip" data-action="sig-hz" data-id="${h}" aria-pressed="${h === hz}">${h === 'ALL' ? t('sg.hzAll') : t(`u.tab.${h}`)}</button>`).join('')}</div>`;
}

/* "Další kontrola za X min" (market open) or the next official run */
export function nextCheck(data, now) {
  const scan = nextScan(now);
  if (scan) return t('u.nextIn', { m: Math.max(1, Math.round((scan - now) / 60000)) });
  return D.nextRunLabel(data, now);
}

export function render(ctx) {
  const { data, state } = ctx;
  const head = `<header class="page-head"><div><h1 class="page-title">${t('sig.title')}</h1>
    <p class="page-sub">${t('sig.sub')}</p></div></header>`;
  if (!data?.signals) {
    if (state.error) return head + errorBlock();
    return head + `<div class="grid-signals">${skCard()}${skCard()}${skCard()}</div>`;
  }
  const now = ctx.now();
  const ph = curPh(), hz = curHz();
  const items = PH.map((p) => ({ id: p, label: t(`sg.ph.${p}`), count: phaseList(data, 'ALL', p, now).length }));
  return head + `
    <div class="seg-wrap ph-tabs">${seg({ name: 'sph', label: t('sg.tabs'), items, active: ph })}</div>
    <p class="hz-desc" id="hz-desc">${phDesc(ph, data, now)}</p>
    ${hzChips(hz)}
    ${ctx.state.fromCache ? `<p class="stale">${icon('offline', 'icon-sm')}${t('common.offlineData')}</p>` : ''}
    <div id="sig-body">${sigBody(ctx)}</div>
    <div class="signals-top u-below">${nextLine(ctx.data, now)}${regimeLine(data.signals.regime)}</div>
    ${disclaimer()}`;
}

/* Fictional trade in the Obchodní platforma, prefilled from the signal */
export function investBtn(s) {
  if (s.status !== 'open' || s.intraday_hit) return '';
  return `<a class="invest-btn" href="#/terminal?s=${encodeURIComponent(s.id)}">${icon('spark', 'icon-sm')}<span>${t('inv.btn')}</span><small>${t('inv.btnS')}</small></a>`;
}

/* One row for any signal (open or closed): ticker, live % and the status bar with a plain sentence.
   Used in Signály, Dnes and Výsledky - tapping it always opens the same signal detail. */
export function signalRow(s, now, i = 0, { extra = false } = {}) {
  const st = D.liveStatus(s, now);
  const mine = D.journal()[s.id];
  const mv = st.move;
  return `<button class="srow tone-${st.tone} is-${st.code} ${extra ? 'is-extra' : ''}" style="--i:${Math.min(i, 10)}" type="button" data-action="open-signal" data-id="${F.esc(s.id)}" data-live-id="${F.esc(s.id)}" data-pnl="${mv ?? ''}">
    <span class="srow-top">
      ${monogram(s.symbol, s.name)}
      <span class="srow-id"><span class="srow-t"><span class="ticker">${F.esc(s.symbol)}</span><span class="side-tag ${s.action === 'SELL' ? 'sell' : ''}">${F.SIDE[s.action]}</span><span class="hz-tag">${F.esc(F.HZ_LABEL[s.horizon] || '')}</span>${s.preview ? `<span class="hz-tag is-preview">${t('sig.preview')}</span>` : ''}${mine?.state === 'in' ? `<span class="my-tag">${t('sig.mine.in')}</span>` : mine?.state === 'closed' ? `<span class="my-tag is-closed">${t('sig.mine.closed', { v: F.spct(D.myResult(s, mine)?.pct ?? 0, 1) })}</span>` : ''}</span>
        <span class="srow-n">${F.esc(B.whatIs(s.symbol, s.name).name)}</span></span>
      <span class="srow-r">${daySpark(s, st)}<span class="srow-v sig-pnl num">${mv != null ? F.spct(mv, 2) : '–'}</span></span>
    </span>
    ${track(s, { now })}
  </button>`;
}

function daySpark(s, st) {
  if (st.done) return '';
  const pp = pricePoints(s, 'today');
  return pp.length >= 4 ? `<span class="pos-spark">${sparkline(pp.map((p) => p.p), { w: 56, h: 18 })}</span>` : '';
}

function devRow(s, now, i) { return signalRow(s, now, i); }

export function emptyState(ctx, hz) {
  return `<section class="calm" aria-live="polite">
    ${calmArt()}
    <div><h3 class="calm-t">${t('empty.t')}</h3>
    <p class="calm-s">${F.esc(hz ? D.emptyReason(ctx.data, hz) : t('sig.noneToday.s'))}</p>
    <p class="calm-next">${icon('clock', 'icon-xs')}${t('empty.next', { when: F.esc(D.nextRunLabel(ctx.data, ctx.now())) })}</p></div>
  </section>`;
}

export function errorBlock() {
  return `<div class="empty"><h3>${t('common.loadError.t')}</h3><p>${t('common.loadError.s')}</p>
    <button class="btn btn-secondary btn-small" style="margin-top:16px" data-action="reload">${t('common.reload')}</button></div>`;
}

function rebody(ctx) {
  const root = document.getElementById('view');
  const b = root.querySelector('#sig-body');
  if (b) { b.innerHTML = sigBody(ctx); b.classList.remove('is-enter'); void b.offsetWidth; b.classList.add('is-enter'); ctx.afterRender && ctx.afterRender(b, true); }
  const d = root.querySelector('#hz-desc'); if (d) d.innerHTML = phDesc(curPh(), ctx.data, ctx.now());
  root.querySelectorAll('[data-action="sig-hz"]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.id === curHz())));
}

export const actions = {
  'sig-hz'(el, ev, ctx) { haptic(); store.set('sigHz', el.dataset.id); rebody(ctx); },
  seg(el, ev, ctx) {
    if (el.dataset.segName !== 'sph') return false;
    haptic();
    store.set('sigPh', el.dataset.id);
    segMove(document.getElementById('view'), 'sph', el.dataset.id);
    rebody(ctx);
    return true;
  },
};
