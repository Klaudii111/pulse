import { CONFIG } from '../config.js';
import * as F from './format.js';
import * as D from './domain.js';
import * as store from './store.js';
import * as P from './pwa.js';
import { icon, closeAllSheets, sheetOpen, toast } from './ui.js';
import { sha256Hex } from './sha256.js';
import * as Home from './views/home.js';
import * as Signals from './views/signals.js';
import * as Calc from './views/calc.js';
import * as Results from './views/results.js';
import * as More from './views/more.js';
import * as X from './views/extra.js';
import { openDetail } from './views/detail.js';
import { t, lang } from './i18n/index.js';
import * as M from './motion.js';
import * as Live from './live.js';

/* ---------- State ---------- */
const state = { loading: true, error: null, fromCache: false, lastFetch: 0 };
const data = { signals: null, history: null, performance: null, calendar: null, league: null };
let route = { name: 'dnes', params: new URLSearchParams(), sub: null };
let currentView = null;

// Clock override (?now=ISO) – used for demos/screenshots of the sample data.
const nowOverride = new URLSearchParams(location.search).get('now');
const now = () => (nowOverride ? new Date(nowOverride) : new Date());
D.setClock(now);

/* ---------- Routes ---------- */
const TABS = [
  { id: 'dnes', icon: 'home' },
  { id: 'signaly', icon: 'signals' },
  { id: 'kalkulacka', icon: 'calc' },
  { id: 'vysledky', icon: 'results' },
  { id: 'vice', icon: 'more' },
];
const SECONDARY = new Set(['vice', 'denik', 'kalendar', 'simulator', 'akademie', 'liga', 'urovne', 'predplatne', 'nastaveni', 'info']);

const VIEWS = {
  dnes: { title: 'nav.dnes', render: Home.render, actions: Home.actions },
  signaly: { title: 'nav.signaly', render: Signals.render, actions: Signals.actions },
  kalkulacka: { title: 'nav.kalkulacka', render: Calc.render, mount: Calc.mount, actions: Calc.actions },
  vysledky: { title: 'nav.vysledky', render: Results.render, mount: Results.mount, unmount: Results.unmount, actions: Results.actions },
  vice: { title: 'nav.vice', render: More.renderMore },
  info: { title: 'title.info', render: More.renderInfo },
  nastaveni: { title: 'title.nastaveni', render: More.renderSettings, mount: More.mountSettings, actions: More.actions },
  denik: { title: 'title.denik', render: X.renderJournal },
  kalendar: { title: 'title.kalendar', render: X.renderCalendar, actions: X.actions },
  simulator: { title: 'title.simulator', render: X.renderSim, mount: X.mountSim, actions: X.actions },
  akademie: { title: 'title.akademie', render: (c) => (route.sub ? X.renderLesson(c, +route.sub) : X.renderAcademy(c)), actions: X.actions },
  liga: { title: 'title.liga', render: X.renderLeague },
  urovne: { title: 'title.urovne', render: X.renderLevels, actions: X.actions },
  predplatne: { title: 'title.predplatne', render: X.renderPlans, actions: X.actions },
};

function parseRoute() {
  const h = (window.__pulseHash ?? location.hash).replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [name, sub] = (path || 'dnes').split('/');
  return { name: VIEWS[name] ? name : 'dnes', sub: sub || null, params: new URLSearchParams(qs || '') };
}

/* ---------- Context passed to views ---------- */
function ctx(extra = {}) {
  return {
    data, state, route, params: route.params, now,
    nudge: nudgeHtml(),
    rerender, applyTheme, onLangChange, afterRender,
    ...extra,
  };
}

/* ---------- Rendering ---------- */
function renderNav() {
  const active = SECONDARY.has(route.name) ? 'vice' : route.name;
  const tabbar = document.getElementById('tabbar');
  const prevActive = tabbar.querySelector('[aria-current="page"]')?.getAttribute('href');
  tabbar.innerHTML = TABS.map((x) => `<a class="tab" href="#/${x.id}" ${x.id === active ? 'aria-current="page"' : ''}>${icon(x.icon)}<span>${t(`nav.${x.id}`)}</span></a>`).join('');
  if (prevActive && prevActive !== `#/${active}`) tabbar.querySelector('[aria-current="page"]')?.classList.add('pop');
  tabbar.setAttribute('aria-label', t('nav.main'));
  const side = document.getElementById('side-nav');
  side.innerHTML = TABS.map((x) => `<a class="side-link" href="#/${x.id}" ${x.id === active ? 'aria-current="page"' : ''}>${icon(x.icon)}<span>${t(`nav.${x.id}`)}</span></a>`).join('');
}

function renderChrome() {
  const mode = data.signals?.mode;
  const badge = mode === 'paper' ? `<span class="demo-badge">${t('badge.paper')}</span>`
    : mode === 'live' ? `<span class="demo-badge is-live">${t('badge.live')}</span>` : '';
  document.querySelectorAll('[data-slot="badge"]').forEach((el) => { el.innerHTML = badge; });
  const ls = Live.status();
  const liveHtml = ls === 'off' ? '' : `<span class="live-badge is-${ls}"><i aria-hidden="true"></i>${t(`live.${ls}`)}</span>`;
  document.querySelectorAll('[data-slot="live"]').forEach((el) => { el.innerHTML = liveHtml; });
  const meta = document.getElementById('side-meta');
  if (meta) meta.textContent = data.signals ? t('chrome.data', { time: F.dmTime(data.signals.generated_at) }) : '';
}

function rerender(opts = {}) {
  const v = VIEWS[route.name];
  const el = document.getElementById('view');
  if (currentView && currentView !== v && currentView.unmount) currentView.unmount();
  const scrollY = window.scrollY;
  const firstData = !!data.signals && !el.dataset.hadData;
  const c = ctx({ softRender: !!opts.soft && !firstData });
  el.innerHTML = v.render(c);
  if (data.signals) el.dataset.hadData = '1';
  if (!opts.soft || firstData) {
    el.classList.remove('is-enter'); void el.offsetWidth; el.classList.add('is-enter');
  }
  if (opts.soft) window.scrollTo(0, scrollY);
  v.mount && v.mount(el, c);
  currentView = v;
  renderChrome();
  afterRender(el, !opts.soft || firstData);
}

/* Motion hooks after every render (all no-ops under reduced motion) */
function afterRender(root, entering) {
  M.countUps(root);
  M.liveTicks(root);
  M.celebrate(root);
  M.glare(root);
  M.entrances(root, entering);
}

function onLangChange() {
  renderNav();
  rerender();
  document.title = `${t(VIEWS[route.name].title)} – ${CONFIG.APP_NAME}`;
}

function onRoute() {
  const prev = route.name;
  route = parseRoute();
  closeAllSheets();
  M.withTransition(() => { renderNav(); rerender(); });
  document.title = `${t(VIEWS[route.name].title)} – ${CONFIG.APP_NAME}`;
  if (prev !== route.name || !route.sub) window.scrollTo(0, 0);
  maybeOpenDeepLink();
}

function maybeOpenDeepLink() {
  const id = route.params.get('s');
  if (id && route.name === 'signaly' && data.signals) setTimeout(() => openDetail(ctx(), id), 80);
}

/* ---------- Data ---------- */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return { json: await res.json(), cached: res.headers.get('X-Pulse-From-Cache') === '1' };
}

async function loadAll() {
  state.loading = true;
  const keys = ['signals', 'history', 'performance', 'calendar', 'league'];
  const results = await Promise.allSettled(keys.map((k) => fetchJSON(CONFIG.DATA[k])));
  let cached = false;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { data[keys[i]] = r.value.json; cached = cached || (keys[i] === 'signals' && r.value.cached); }
  });
  state.error = results[0].status === 'rejected' && !data.signals ? results[0].reason : null;
  state.fromCache = cached || (!navigator.onLine && !!data.signals);
  state.loading = false;
  state.lastFetch = Date.now();
  Live.onData();
  rerender({ soft: true });
  maybeOpenDeepLink();
  checkAlerts();
}

async function poll() {
  if (document.visibilityState !== 'visible') return;
  try {
    const { json, cached } = await fetchJSON(CONFIG.DATA.signals);
    state.lastFetch = Date.now();
    const changed = !data.signals || json.generated_at !== data.signals.generated_at;
    data.signals = json;
    state.fromCache = cached;
    Live.onData();
    if (changed) {
      checkAlerts();
      const resDue = route.name === 'vysledky' && Date.now() - (window.__pulseResAt || 0) > 20000;
    if (!sheetOpen() && (['dnes', 'signaly'].includes(route.name) || resDue)) { if (resDue) window.__pulseResAt = Date.now(); rerender({ soft: true }); }
    }
  } catch { /* offline – keep showing what we have */ }
}

/* ---------- Alerts: intraday hits + proximity ---------- */
function checkAlerts() {
  if (!data.signals) return;
  const tNow = now();
  const done = new Set(store.get('notified', []));
  const add = [];
  const pfx = CONFIG.APP_SHORT_NAME;
  D.allOpen(data).forEach((s) => {
    if (!D.horizonAllowed(data, s.horizon)) return;
    if (s.preview && s.intraday_hit) return; // the robot did not hold an unconfirmed intraday signal
    if (s.intraday_hit && s.hit_at && (tNow - new Date(s.hit_at)) / 3600000 <= CONFIG.HIT_NOTIFY_MAX_AGE_H) {
      const k = `${s.id}:hit`;
      if (!done.has(k)) {
        add.push(k);
        P.notify(t(`n.hit.${s.intraday_hit}`, { app: pfx, sym: s.symbol }), F.spct(s.pnl_pct_position, 1), { tag: k, url: `./#/signaly?s=${encodeURIComponent(s.id)}` });
      }
      return;
    }
    const p = D.proximity(s);
    if (p) {
      const k = `${s.id}:near-${p.side}`;
      if (!done.has(k)) {
        add.push(k);
        P.notify(t(`n.near.${p.side}`, { app: pfx, sym: s.symbol }), t(`n.near.body.${p.side}`, { v: F.pct(p.dist, 1) }), { tag: k, url: `./#/signaly?s=${encodeURIComponent(s.id)}` });
      }
    }
  });
  if (add.length) store.set('notified', [...done, ...add].slice(-300));
}

/* ---------- Install nudge ---------- */
function nudgeHtml() {
  const st = P.installState();
  if (!['prompt', 'ios'].includes(st) || P.nudgeDismissed()) return '';
  return `<div class="nudge" role="region" aria-label="${t('nudge.aria')}">
    <img src="./icons/icon-192.png" alt="" width="36" height="36">
    <div><p class="nudge-t">${t('nudge.t', { app: F.esc(CONFIG.APP_SHORT_NAME) })}</p><p class="nudge-s">${t('nudge.s')}</p></div>
    <div class="nudge-actions"><button class="btn btn-primary btn-small" type="button" data-action="install">${t(st === 'ios' ? 'nudge.how' : 'nudge.install')}</button>
    <button class="icon-btn" type="button" data-action="dismiss-nudge" aria-label="${t('nudge.later')}">${icon('close', 'icon-sm')}</button></div>
  </div>`;
}

/* ---------- Theme ---------- */
function applyTheme() {
  const th = store.get('theme', 'dark');
  document.documentElement.dataset.theme = th;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', th === 'light' ? '#f4f2ee' : CONFIG.THEME_COLOR);
}

/* ---------- Global actions (event delegation) ---------- */
const GLOBAL = {
  'open-signal'(el) { openDetail(ctx(), el.dataset.id, el.classList.contains('sig') ? el : null); },
  rtip() { toast(t('rtip')); },
  reload() { loadAll(); },
  install() { More.doInstall(); },
  'dismiss-nudge'() { P.dismissNudge(); document.querySelectorAll('.nudge').forEach((n) => n.remove()); },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const name = el.dataset.action;
  if (GLOBAL[name]) { ev.preventDefault(); GLOBAL[name](el, ev); return; }
  const c = ctx();
  const v = VIEWS[route.name];
  if (v.actions && v.actions[name]) {
    ev.preventDefault();
    const r = v.actions[name](el, ev, c);
    if (r !== false) return;
  }
});

/* ---------- Gate ---------- */
async function gate() {
  if (!CONFIG.ACCESS_GATE_ENABLED || store.get('unlocked') === CONFIG.ACCESS_CODE_SHA256) return;
  const g = document.getElementById('gate');
  g.hidden = false;
  g.className = 'gate';
  g.innerHTML = `<div class="gate-inner">
    <img class="gate-mark" src="./icons/icon-192.png" alt="" width="72" height="72">
    <h1>${F.esc(CONFIG.APP_NAME)}</h1>
    <p>${t('gate.s')}</p>
    <form novalidate>
      <label class="sr-only" for="code">${t('gate.ph')}</label>
      <input id="code" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="${t('gate.ph')}" required>
      <button class="btn btn-primary btn-block" type="button" id="gate-go">${t('gate.btn')}</button>
      <p class="err" role="alert" id="gate-err"></p>
    </form>
    <p class="gate-foot">${t('gate.foot')} ${F.esc(t('disclaimer'))}</p>
  </div>`;
  document.getElementById('app').setAttribute('aria-hidden', 'true');
  setTimeout(() => g.querySelector('input').focus(), 100);
  await new Promise((resolve) => {
    const form = g.querySelector('form');
    // Sandboxed previews block form submission, so handle the button and Enter directly.
    g.querySelector('#gate-go').addEventListener('click', () => form.dispatchEvent(new Event('submit', { cancelable: true })));
    g.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); form.dispatchEvent(new Event('submit', { cancelable: true })); } });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = g.querySelector('input').value.trim().toUpperCase();
      const err = g.querySelector('#gate-err');
      if (!v) { err.textContent = t('gate.empty'); return; }
      const h = await sha256Hex(v);
      if (h === CONFIG.ACCESS_CODE_SHA256) {
        store.set('unlocked', h);
        g.classList.add('is-out');
        setTimeout(() => { g.hidden = true; g.innerHTML = ''; }, 300);
        document.getElementById('app').removeAttribute('aria-hidden');
        resolve();
      } else {
        err.textContent = t('gate.wrong');
        g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
      }
    });
  });
}

/* ---------- Boot ---------- */
async function boot() {
  applyTheme();
  store.firstSeen();
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref && /^[A-Z0-9-]{4,20}$/i.test(ref) && ref !== store.get('refCode')) store.set('invitedBy', ref.toUpperCase());
  document.querySelectorAll('[data-slot="appname"]').forEach((el) => { el.textContent = CONFIG.APP_NAME; });
  P.initInstall();
  P.onInstallChange(() => { if (['dnes', 'signaly', 'nastaveni'].includes(route.name)) rerender({ soft: true }); });
  route = parseRoute();
  renderNav();
  rerender();
  document.title = `${t(VIEWS[route.name].title)} – ${CONFIG.APP_NAME}`;
  P.initSW();
  try { if (sessionStorage.getItem('pulse.updated')) { sessionStorage.removeItem('pulse.updated'); setTimeout(() => toast(t('update.done')), 900); } } catch { /* ignore */ }
  await gate();
  window.addEventListener('hashchange', () => { window.__pulseHash = null; onRoute(); });
  // In-app navigation that also works inside sandboxed previews (iframes that block hash links).
  window.__pulseGo = (href) => {
    window.__pulseHash = href;
    try { if (location.hash !== href) history.pushState(null, '', href); } catch (e) { /* sandboxed: keep virtual route */ }
    onRoute();
  };
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href^="#/"], a[href="#"]');
    if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey) return;
    const href = a.getAttribute('href'); if (href === '#') return;
    ev.preventDefault(); window.__pulseGo(href);
  });
  window.addEventListener('popstate', () => { window.__pulseHash = null; onRoute(); });
  Live.initLive(() => data);
  Live.onLive(() => {
    checkAlerts();
    if (!sheetOpen() && ['dnes', 'signaly'].includes(route.name)) rerender({ soft: true });
    else renderChrome();
    document.dispatchEvent(new CustomEvent('pulse:live'));
  });
  setInterval(() => renderChrome(), 30000);
  loadAll();
  setInterval(poll, CONFIG.POLL_MIN * 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - state.lastFetch > CONFIG.POLL_MIN * 60000) poll();
  });
  window.addEventListener('online', () => { state.fromCache = false; poll(); });
  window.addEventListener('offline', () => toast(t('common.youAreOffline')));
  try { navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'NAVIGATE') location.href = e.data.url; }); } catch (e) { /* sandboxed preview */ }
  window.addEventListener('scroll', () => {
    document.querySelector('.topbar')?.classList.toggle('is-scrolled', window.scrollY > 4);
  }, { passive: true });
}

boot();
