import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import * as store from '../store.js';
import * as Live from '../live.js';
import { t, L } from '../i18n/index.js';
import { icon, seg, segMove, ladder, pill, skCard, liveState, haptic, monogram, calmArt } from '../ui.js';

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

export function nextLine(data, now) {
  const d = D.nextRun(data, now);
  const mins = Math.max(0, Math.round((d - now) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  const inTxt = h > 0 ? t('next.in', { h, m }) : t('next.inMin', { m });
  const days = F.daysUntil(d, now);
  const day = days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(d);
  return `<section class="next-card" aria-label="${F.esc(t('next.title'))}">
    <div class="next-ico">${icon('clock')}</div>
    <div class="next-body">
      <p class="next-k">${F.esc(t('next.title'))}</p>
      <p class="next-when"><span class="next-day">${F.esc(day)}</span> <span class="num next-time">${F.esc(F.time(d))}</span></p>
      <p class="next-s">${F.esc(t('next.sub'))}</p>
    </div>
    <div class="next-in num">${F.esc(inTxt)}</div>
    <ol class="next-plan">${upcoming(data, now, 5).map((x, i) => `<li class="${i === 0 ? 'is-next' : ''}"><span>${F.esc(x.day)}</span><b class="num">${F.esc(x.time)}</b></li>`).join('')}</ol>
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
        <div class="sig-tl"><span class="ticker">${F.esc(s.symbol)}</span>${pill(s.action)}${flag}</div>
        <p class="sig-sub">${hzTag}${sub}${myTag}</p>
      </div>
      ${right}
    </div>
    ${ladder(s, { animate: fresh })}
    <p class="sig-line num"><span>${t('sig.risk')} <b>${F.pct(risk.risk, risk.risk % 1 ? 1 : 0)}</b></span><span>${t('sig.target')} <b>${F.spct(risk.target)}</b></span><span>${exitPhrase(s, now)}</span></p>
  </button>`;
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

export function render(ctx) {
  const { data, state } = ctx;
  const head = `<header class="page-head"><div><h1 class="page-title">${t('sig.title')}</h1>
    <p class="page-sub">${data?.signals ? t('common.updated', { time: F.dmTime(data.signals.generated_at) }) : t('common.loading')}</p></div></header>`;
  if (!data?.signals) {
    if (state.error) return head + errorBlock();
    return head + `<div class="grid-signals">${skCard()}${skCard()}${skCard()}</div>`;
  }
  const s = data.signals;
  const now = ctx.now();
  const hzs = VISIBLE_HZ().filter((h) => D.horizonAllowed(data, h));
  const all = hzs.flatMap((h) => (s.tracks[h] || []).map((x) => ({ ...x, horizon: x.horizon || h })));
  const fresh = all.filter((x) => D.isNew(x, data) && x.status === 'open' && !x.intraday_hit);
  const events = data.calendar?.events || [];
  let i = 0;
  const freshCards = fresh.map((x) => `<div class="sig-wrap">${buyBanner(x, now)}${signalCard(x, { data, events, now, i: i++, showHz: true })}</div>`).join('');
  return head + `
    <div class="signals-top">${nextLine(ctx.data, now)}${regimeLine(s.regime)}</div>
    ${ctx.state.fromCache ? `<p class="stale">${icon('offline', 'icon-sm')}${t('common.offlineData')}</p>` : ''}
    <section aria-labelledby="sec-today">
      <h2 class="section-title" id="sec-today">${t('sig.todayBuy')}${fresh.length ? `<small>${fresh.length}</small>` : ''}</h2>
      <p class="section-sub">${t('sig.todayBuy.s')}</p>
      ${fresh.length ? `<div class="grid-signals">${freshCards}</div>` : emptyState(ctx, null)}
    </section>
    <section aria-labelledby="sec-dev" class="dev">
      <h2 class="section-title" id="sec-dev">${t('sig.dev')}</h2>
      <p class="section-sub">${t('sig.dev.s')}</p>
      <div class="seg-wrap">${seg({ name: 'dev', small: true, label: t('sig.dev'), items: [{ id: 'ALL', label: t('sig.filter.all') }, ...hzs.map((h) => ({ id: h, hz: h, label: F.HZ_LABEL[h], count: (s.tracks[h] || []).length }))], active: devFilter(hzs) })}</div>
      <div id="sig-list">${devList(ctx, devFilter(hzs))}</div>
    </section>
    ${disclaimer()}`;
}

function devFilter(hzs) {
  const f = store.get('devHz', 'ALL');
  return f === 'ALL' || hzs.includes(f) ? f : 'ALL';
}

/* Every signal the robot issued: open ones first (live), then closed ones with their result */
function devList(ctx, f) {
  const { data } = ctx;
  const hzs = VISIBLE_HZ().filter((h) => D.horizonAllowed(data, h));
  const pick = (h) => f === 'ALL' || h === f;
  const open = hzs.filter(pick).flatMap((h) => (data.signals.tracks[h] || []).map((x) => ({ ...x, horizon: x.horizon || h })))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const closed = (data.history?.signals || []).filter((x) => hzs.includes(x.horizon) && pick(x.horizon))
    .sort((a, b) => String(b.closed_at || b.created_at).localeCompare(String(a.closed_at || a.created_at)));
  if (!open.length && !closed.length) return `<p class="empty-line">${t('sig.dev.empty')}</p>`;
  const events = data.calendar?.events || [];
  let i = 0;
  const rows = (l) => `<div class="dev-list">${l.map((x) => devRow(x, ctx.now(), i++)).join('')}</div>`;
  return (open.length ? `<h3 class="sub-title">${t('sig.dev.open')}<small>${open.length}</small></h3>${rows(open)}` : '')
    + (closed.length ? `<h3 class="sub-title">${t('sig.dev.closed')}<small>${closed.length}</small></h3>${rows(closed)}` : '');
}

/* Compact live row: where the price is between stop and target, P&L, status */
function devRow(s, now, i) {
  let state = liveState(s);
  if (state === 'open' && D.isTimeExit(s, now)) state = 'time_exit';
  const pnl = state === 'open' || s.status === 'open' ? s.pnl_pct_position : (s.result_pct ?? s.pnl_pct_position);
  const up = (pnl ?? 0) >= 0;
  const lo = Math.min(s.stop, s.target ?? s.entry), hi = Math.max(s.stop, s.target ?? s.entry);
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / ((hi - lo) || 1)) * 100));
  const cur = s.last_price ?? D.exitPrice(s) ?? s.entry;
  const mine = D.journal()[s.id];
  const status = state === 'open' ? t('sig.dev.running') : t(RES[state] || 'sig.dev.closed');
  return `<button class="dev-row is-${state}" style="--i:${Math.min(i, 10)}" type="button" data-action="open-signal" data-id="${F.esc(s.id)}" data-live-id="${F.esc(s.id)}" data-pnl="${pnl ?? ''}">
    ${monogram(s.symbol, s.name)}
    <div class="dev-id"><p class="dev-t"><span class="ticker">${F.esc(s.symbol)}</span><span class="hz-tag">${F.esc(F.HZ_LABEL[s.horizon] || '')}</span>${mine?.state === 'closed' ? `<span class="my-tag is-closed">${t('sig.mine.closed', { v: F.spct(D.myResult(s, mine)?.pct ?? 0, 1) })}</span>` : ''}</p>
      <p class="dev-s num">${t('sig.dev.since', { date: F.dm(s.created_at) })}</p></div>
    <div class="dev-bar" aria-hidden="true"><i class="dev-entry" style="left:${pos(s.entry)}%"></i><i class="dev-now ${up ? 'up' : 'down'}" style="left:${pos(cur)}%"></i></div>
    <div class="dev-r"><p class="sig-pnl num ${up ? 'up' : 'down'}">${pnl != null ? F.spct(pnl, 2) : '–'}</p><p class="dev-st is-${state}">${F.esc(status)}</p></div>
  </button>`;
}

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

export const actions = {
  seg(el, ev, ctx) {
    if (el.dataset.segName === 'dev') {
      const f = el.dataset.id;
      haptic();
      store.set('devHz', f);
      const root = document.getElementById('view');
      segMove(root, 'dev', f);
      const l = root.querySelector('#sig-list');
      if (l) {
        l.innerHTML = devList(ctx, f);
        l.classList.remove('is-enter'); void l.offsetWidth; l.classList.add('is-enter');
        ctx.afterRender && ctx.afterRender(l, true);
      }
      return true;
    }
    if (el.dataset.segName !== 'hz') return false;
    const hz = el.dataset.id;
    haptic();
    store.set('hz', hz);
    const root = document.getElementById('view');
    segMove(root, 'hz', hz);
    const hint = root.querySelector('#hz-hint span');
    if (hint) hint.textContent = F.HZ_HINT[hz];
    const l = root.querySelector('#sig-list');
    if (l) {
      l.innerHTML = devList(ctx, "ALL");
      l.classList.remove('is-enter'); void l.offsetWidth; l.classList.add('is-enter');
      ctx.afterRender && ctx.afterRender(l, true);
    }
    return true;
  },
};
