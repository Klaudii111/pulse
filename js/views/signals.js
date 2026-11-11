import { CONFIG } from '../../config.js';
import * as F from '../format.js';
import * as D from '../domain.js';
import * as store from '../store.js';
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

export function signalCard(s, { data = null, events = [], now = new Date(), i = 0 } = {}) {
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
        <p class="sig-sub">${sub}</p>
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

export function render(ctx) {
  const { data, state } = ctx;
  const head = `<header class="page-head"><div><h1 class="page-title">${t('sig.title')}</h1>
    <p class="page-sub">${data?.signals ? t('common.updated', { time: F.dmTime(data.signals.generated_at) }) : t('common.loading')}</p></div></header>`;
  if (!data?.signals) {
    if (state.error) return head + errorBlock();
    return head + `<div class="signals-top"><div class="seg-wrap">${seg({ name: 'hz', label: t('sig.horizon'), items: D.HORIZONS.map((h) => ({ id: h, hz: h, label: F.HZ_LABEL[h] })), active: store.get('hz', 'MESIC') })}</div>
      <div class="sk" style="height:20px;border-radius:8px;margin-top:16px;width:60%"></div></div>
      <div class="grid-signals">${skCard()}${skCard()}${skCard()}</div>`;
  }
  const s = data.signals;
  const hz = activeHz(data);
  const items = D.HORIZONS.map((h) => ({ id: h, hz: h, label: F.HZ_LABEL[h], count: (s.tracks[h] || []).length, locked: !D.horizonAllowed(data, h) }));
  return head + `
    <div class="signals-top">
      <div class="seg-wrap">
        ${seg({ name: 'hz', label: t('sig.horizon'), items, active: hz })}
        <p class="horizon-hint" id="hz-hint"><span>${F.HZ_HINT[hz]}</span></p>
      </div>
      ${regimeLine(s.regime)}${nextLine(ctx.data, ctx.now())}
    </div>
    ${ctx.state.fromCache ? `<p class="stale">${icon('offline', 'icon-sm')}${t('common.offlineData')}</p>` : ''}
    <div id="sig-list">${list(ctx, hz)}</div>
    ${disclaimer()}`;
}

function list(ctx, hz) {
  const { data } = ctx;
  if (!D.horizonAllowed(data, hz)) return lockedPanel(data, hz);
  const arr = data.signals.tracks[hz] || [];
  const events = data.calendar?.events || [];
  const fresh = arr.filter((x) => D.isNew(x, data));
  const older = arr.filter((x) => !D.isNew(x, data));
  let i = 0;
  const cards = (l) => `<div class="grid-signals">${l.map((x) => signalCard(x, { data, events, now: ctx.now(), i: i++ })).join('')}</div>`;
  if (!fresh.length) {
    return emptyState(ctx, hz) + (older.length ? `<h2 class="section-title">${t('sig.openPositions')}<small>${older.length}</small></h2>${cards(older)}` : '');
  }
  return cards(fresh) + (older.length ? `<h2 class="section-title">${t('sig.older')}<small>${older.length}</small></h2>${cards(older)}` : '');
}

export function emptyState(ctx, hz) {
  return `<section class="calm" aria-live="polite">
    ${calmArt()}
    <div><h3 class="calm-t">${t('empty.t')}</h3>
    <p class="calm-s">${F.esc(D.emptyReason(ctx.data, hz))}</p>
    <p class="calm-next">${icon('clock', 'icon-xs')}${t('empty.next', { when: F.esc(D.nextRunLabel(ctx.data, ctx.now())) })}</p></div>
  </section>`;
}

export function errorBlock() {
  return `<div class="empty"><h3>${t('common.loadError.t')}</h3><p>${t('common.loadError.s')}</p>
    <button class="btn btn-secondary btn-small" style="margin-top:16px" data-action="reload">${t('common.reload')}</button></div>`;
}

export const actions = {
  seg(el, ev, ctx) {
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
      l.innerHTML = list(ctx, hz);
      l.classList.remove('is-enter'); void l.offsetWidth; l.classList.add('is-enter');
      ctx.afterRender && ctx.afterRender(l, true);
    }
    return true;
  },
};
