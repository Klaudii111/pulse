import { CONFIG } from '../config.js';
import * as F from './format.js';
import * as D from './domain.js';
import * as store from './store.js';
import * as P from './pwa.js';
import { icon, il, closeAllSheets, closeTopSheet, sheetOpen, toast, openSheet, seg, clearToasts, langSwitch, consumePop, unwindSheets } from './ui.js';
import { linkLine } from './views/learn.js';
import { gloss } from './explain.js';
import { sha256Hex } from './sha256.js';
import * as Home from './views/home.js';
import * as Signals from './views/signals.js';
import * as Calc from './views/calc.js';
import * as Results from './views/results.js';
import * as More from './views/more.js';
import * as X from './views/extra.js';
import { openDetail } from './views/detail.js';
import * as Term from './views/terminal.js';
import * as Paper from './views/paper.js';
import * as Pages from './views/pages.js';
import * as W from './wallet.js';
import { t, lang, setLang } from './i18n/index.js';
import * as M from './motion.js';
import * as Live from './live.js';
import * as Feed from './feed.js';
import * as Events from './views/events.js';
import * as Moje from './views/moje.js';
import * as Pf from './views/portfolio.js';
import * as Onb from './onboarding.js';
import * as Mkt from './market.js';
import * as B from './brief.js';
import * as Tour from './tour.js';
import * as Help from './views/help.js';
import * as Learn from './views/learn.js';
import * as Wal from './views/penezenka.js';
import * as Comm from './community.js';
import * as H from './health.js';
import * as Sync from './sync.js';
import * as Den from './den.js';
import * as Sty from './styles.js';

/* ---------- State ---------- */
const state = { loading: true, error: null, fromCache: false, lastFetch: 0 };
const data = { signals: null, history: null, performance: null, calendar: null, league: null, paper: null, health: null };
let route = { name: 'dnes', params: new URLSearchParams(), sub: null };
/* 1.15.0: the screen the user came from (the trade detail's "← Portfolio / Dnes / Obchodovat …" and its back) */
let fromRoute = null;
let currentView = null;

// Clock override (?now=ISO) – used for demos/screenshots of the sample data.
const nowOverride = new URLSearchParams(location.search).get('now');
const now = () => (nowOverride ? new Date(nowOverride) : new Date());
D.setClock(now);

/* ---------- Routes ---------- */
const TABS = [
  { id: 'dnes', icon: 'home' },
  { id: 'signaly', icon: 'signals' },
  { id: 'portfolio', icon: 'wallet' },
  { id: 'terminal', icon: 'chart' },
  { id: 'vice', icon: 'more' },
];
const SECONDARY = new Set(['kalkulacka', 'vice', 'denik', 'kalendar', 'simulator', 'akademie', 'liga', 'urovne', 'predplatne', 'nastaveni', 'info', 'stahnout', 'mt5', 'jak', 'duvera']);
/* screens that belong under another tab */
/* 1.15.0: Portfolio is the tab (old #/zainvestovano and #/moje stay as aliases); a trade detail belongs to it */
const PARENT = { robot: 'vice', vysledky: 'vice', moje: 'portfolio', zainvestovano: 'portfolio', obchod: 'portfolio', udalosti: 'dnes', den: 'dnes', ucet: 'dnes', penezenka: 'dnes', historie: 'portfolio', uceni: 'vice' };

const VIEWS = {
  dnes: { title: 'nav.dnes', render: Home.render, mount: (el, c) => { Pf.dnesMount(el, c); Den.mount(el); }, actions: { ...Home.actions, ...Den.actions } },
  /* 1.15.1 the experimental daily robot (PULSE DEN) – its own page, never mixed with the tested signals */
  den: { title: 'den.h', render: Den.render, mount: Den.mountPage, actions: Den.actions },
  /* 1.15.0 Portfolio (#/portfolio = #/moje = #/zainvestovano) + the trade detail #/obchod/<id> */
  portfolio: { title: 'nav.portfolio', render: Pf.render, mount: Pf.mount, unmount: Pf.unmount, actions: { ...Home.actions, ...Pf.actions } },
  zainvestovano: { title: 'nav.portfolio', render: Pf.render, mount: Pf.mount, unmount: Pf.unmount, actions: { ...Home.actions, ...Pf.actions } },
  obchod: { title: 'pd.title', render: Pf.renderTrade, mount: Pf.mountTrade, unmount: Pf.unmount, actions: { ...Home.actions, ...Pf.actions } },
  /* 1.12.0 Peněženka (old #/ucet keeps working) + Historie */
  penezenka: { title: 'wl.title', render: Wal.renderWallet },
  ucet: { title: 'wl.title', render: Wal.renderWallet },
  historie: { title: 'hi.title', render: Wal.renderHistory, mount: Wal.mountHistory, actions: { ...Home.actions, ...Wal.actions } },
  signaly: { title: 'nav.signaly', render: Signals.render, actions: Signals.actions, mount: () => setTimeout(() => Tour.maybeHint(), 900) },
  kalkulacka: { title: 'nav.kalkulacka', render: Calc.render, mount: Calc.mount, actions: Calc.actions },
  vysledky: { title: 'nav.vysledky', render: Results.render, mount: Results.mount, unmount: Results.unmount, actions: Results.actions },
  terminal: { title: 'nav.terminal', render: Term.render, mount: Term.mount, unmount: Term.unmount, actions: Term.actions },
  /* 1.13.0 ONE "Robot" page with tabs: Výsledky · Účet nanečisto · Jak se učí (old #/vysledky and #/uceni keep working) */
  robot: { title: 'rb.title', render: robotView, mount: (el, c) => { if (rbTab() === 'vysledky') Results.mount(el, c); }, unmount: () => Results.unmount && Results.unmount(),
    actions: { ...Results.actions, seg(el, ev, c) { if (el.dataset.segName !== 'rbtab') return Results.actions?.seg ? Results.actions.seg(el, ev, c) : false; store.set('rbTab', el.dataset.id); Results.unmount && Results.unmount(); rerender(); return true; } } },
  /* 1.12.0: Moje merged into Zainvestováno (open trades + followed signals); old links land there */
  moje: { title: 'nav.portfolio', render: Pf.render, mount: Pf.mount, unmount: Pf.unmount, actions: { ...Home.actions, ...Pf.actions } },
  udalosti: { title: 'ev.title', render: Events.render, mount: Events.mount, enter: Events.beforeRender },
  stahnout: { title: 'title.stahnout', render: Pages.renderInstall },
  mt5: { title: 'title.mt5', render: Pages.renderMt5 },
  jak: { title: 'jak.title', render: Help.renderHow },
  duvera: { title: 'trust.title', render: Help.renderTrust },
  uceni: { title: 'le.title', render: Learn.render },
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

const RB_TABS = ['vysledky', 'ucet', 'uceni'];
const rbTab = () => { const x = store.get('rbTab', 'vysledky'); return RB_TABS.includes(x) ? x : 'vysledky'; };
function robotView(c) {
  const tab = rbTab();
  const inner = tab === 'ucet' ? Paper.render(c) : tab === 'uceni' ? Learn.render(c) : Results.render({ ...c, inRobot: true });
  return `<header class="page-head"><div><a class="back" href="#/vice">${icon('chev-left', 'icon-xs')}${t('nav.vice')}</a><h1 class="page-title">${t('rb.title')}</h1><p class="page-sub">${t('rb.sub')}</p></div>${il('02_robot', 72, { cls: 'head-il', lazy: false })}</header>
  <div class="rb-top">${Home.robotLine1(c)}${linkLine(c.data, c.now(), 'd-robot d-learn')}</div>
  <div class="seg-wrap rb-tabs">${seg({ name: 'rbtab', label: t('rb.title'), items: RB_TABS.map((id) => ({ id, label: t(`rb.tab.${id}`) })), active: tab })}</div>
  <div class="rb-in">${inner}</div>`;
}

function parseRoute() {
  const h = (window.__pulseHash ?? location.hash).replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [name, sub] = (path || 'dnes').split('/');
  return { name: VIEWS[name] ? name : 'dnes', sub: sub || null, params: new URLSearchParams(qs || '') };
}

/* ---------- Context passed to views ---------- */
function ctx(extra = {}) {
  return {
    data, state, route, params: route.params, now, from: fromRoute,
    nudge: nudgeHtml(),
    rerender, applyTheme, onLangChange, afterRender, renderChrome,
    ...extra,
  };
}

/* ---------- Rendering ---------- */
function renderNav() {
  const active = PARENT[route.name] || (SECONDARY.has(route.name) ? 'vice' : route.name);
  const tabbar = document.getElementById('tabbar');
  /* 1.11.2: the background takes a gentle tint per tab (css: html[data-tab]) */
  document.documentElement.dataset.tab = active;
  const prevActive = tabbar.querySelector('[aria-current="page"]')?.getAttribute('href');
  /* tab bar uses the short label where one exists ("Platforma"), the sidebar the full one ("Obchodní platforma") */
  tabbar.innerHTML = TABS.map((x) => `<a class="tab" href="#/${x.id}" ${x.id === active ? 'aria-current="page"' : ''}>${icon(x.icon)}<span>${t(x.id === 'terminal' ? 'nav.terminalShort' : `nav.${x.id}`)}</span></a>`).join('');
  if (prevActive && prevActive !== `#/${active}`) tabbar.querySelector('[aria-current="page"]')?.classList.add('pop');
  tabbar.setAttribute('aria-label', t('nav.main'));
  const side = document.getElementById('side-nav');
  side.innerHTML = TABS.map((x) => `<a class="side-link" href="#/${x.id}" ${x.id === active ? 'aria-current="page"' : ''}>${icon(x.icon)}<span>${t(`nav.${x.id}`)}</span></a>`).join('');
}

function renderChrome() {
  const mode = data.signals?.mode;
  const badge = mode === 'paper' ? `<span class="demo-badge" title="${F.esc(t('badge.paper'))}"><span class="db-long">${t('badge.paper')}</span><span class="db-short">${t('badge.paperShort')}</span></span>`
    : mode === 'live' ? `<span class="demo-badge is-live">${t('badge.live')}</span>` : '';
  /* 1.9.0: my fictional money is always visible (tap = Obchodní platforma); the DEMO word rides inside the pill */
  let pill = badge;
  try {
    const sm = W.summary(data);
    const eq = W.parts(sm).eq;
    pill = `<a class="bal-pill" href="#/penezenka" aria-label="${F.esc(t('u.pill', { v: F.money(eq, sm.w.ccy, 0) }))}">${icon('wallet', 'icon-sm')}<b class="num" data-eq="${eq}">${F.money(eq, sm.w.ccy, 0)}</b><small>${t('badge.paperShort')}</small></a>`;
    /* 1.15.0: "Kapitál" in Nastavení is the same number as the pill, on the same tick (it used to lag by one price update) */
    document.querySelectorAll('[data-mp-cap]').forEach((n) => { const v = F.money(eq, sm.w.ccy, 0); if (n.textContent !== v) n.textContent = v; });
  } catch { /* storage blocked: keep the badge */ }
  document.querySelectorAll('[data-slot="badge"]').forEach((el) => { if (el.innerHTML !== pill) el.innerHTML = pill; });
  const ls = Live.status();
  const lt = Live.dataTime();
  const liveHtml = ls === 'off' ? '' : `<span class="live-badge is-${ls}" title="${F.esc(lt ? Live.stamp(lt).text : '')}"><i aria-hidden="true"></i>${t(`live.${ls}`, { time: lt ? F.time(new Date(lt)) : '' })}</span>`;
  document.querySelectorAll('[data-slot="live"]').forEach((el) => { el.innerHTML = liveHtml; });
  /* "Co se děje": derive new events from the data on this device, bell with the unread count */
  Feed.update(data);
  const n = Feed.unread();
  const bell = `<a class="bell ${n ? 'has-new' : ''}" href="#/udalosti" aria-label="${F.esc(t('ev.bell', { n }))}" ${route.name === 'udalosti' ? 'aria-current="page"' : ''}>${icon('bell')}${n ? `<span class="bell-n num">${n > 99 ? '99+' : n}</span>` : ''}</a>`;
  document.querySelectorAll('[data-slot="bell"]').forEach((el) => { if (el.innerHTML !== bell) el.innerHTML = bell; });
  const meta = document.getElementById('side-meta');
  /* 1.13.0: the freshest moment we have (live prices, signals.json, the last fetch) – never a stale run time */
  const fresh = Math.max(Date.parse(data.signals?.generated_at || 0) || 0, lt || 0, state.lastFetch || 0);
  if (meta) meta.textContent = fresh ? t('chrome.data', { time: F.dmTime(new Date(fresh)) }) : '';
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

let curHash = null;
const navStack = [];
function onRoute(opt = {}) {
  const prev = route.name;
  const prevHash = curHash;
  route = parseRoute();
  curHash = window.__pulseHash ?? location.hash;
  /* 1.15.0 "from" = the screen Back returns to: a stack that follows the history (push / back), so the label of the
     trade page's "← …" and where Back really goes are always the same; a replaced route (desktop side list) keeps it */
  if (opt.pop) navStack.pop();
  else if (!opt.replace && prevHash !== curHash && prevHash != null) navStack.push({ name: prev, hash: prevHash || '#/dnes' });
  if (navStack.length > 60) navStack.shift();
  fromRoute = navStack[navStack.length - 1] || null;
  if (route.name !== prev) { VIEWS[route.name].enter?.(); clearToasts(); }
  closeAllSheets();
  M.withTransition(() => { renderNav(); rerender(); });
  document.title = `${t(VIEWS[route.name].title)} – ${CONFIG.APP_NAME}`;
  if (prev !== route.name || !route.sub) window.scrollTo(0, 0);
  maybeOpenDeepLink();
}

function maybeOpenDeepLink() {
  const id = route.params.get('s');
  if (!id || route.name !== 'signaly' || !data.signals) return;
  /* 1.9.1: push action "Zainvestovat" -> the detail with the investment sheet already open */
  const inv = route.params.get('invest') === '1';
  setTimeout(() => { openDetail(ctx(), id); if (inv) setTimeout(() => investFor(id), 450); }, 80);
}

/* ---------- 1.9.1: invest right from a signal, watch my trades on the server ---------- */
function investFor(id, mode = null) {
  const s = D.findSignal(data, id);
  if (!s) { toast(t('det.notFound')); return; }
  const cs = D.cardState(s, data, now());
  Term.investSheet(ctx(), s, mode || (cs.cta === 'limit' ? 'limit' : 'now'));
}
function myTrades() {
  const w = store.get('wallet', null);
  /* server contract: max 50, unique ids, sl or tp may be null but not both; the list replaces, [] clears */
  return (w?.positions || []).filter((p) => p.sl > 0 || p.tp > 0).slice(0, 50).map((p) => ({ id: String(p.id), key: p.sym, side: p.side === 'SELL' ? 'SELL' : 'BUY', entry: p.entry,
    sl: p.sl > 0 ? p.sl : null, tp: p.tp > 0 ? p.tp : null, lev: p.lev || 1, deposit: Math.round(p.margin * 100) / 100, ccy: w.ccy, name: B.whatIs(p.sym, p.name).name }));
}
const syncTrades = () => { P.syncTrades(myTrades()).catch(() => {}); Comm.sync(); };

/* a new buyable signal since the last visit -> one calm bottom sheet: "Nový signál: KOUPIT XOM" [Zainvestovat] [Teď ne] */
function newSignalOffer() {
  if (!data.signals || sheetOpen() || document.querySelector('.onb')) return;
  const seen = store.get('seenSig', null);
  const fresh = Home.newSignals(data, now());
  store.set('seenSig', [...new Set(D.allOpen(data).map((x) => x.id).concat(seen || []))].slice(-400));
  if (!Array.isArray(seen)) return; // first run: the first-run guide comes first, the signals are on Dnes
  const s = fresh.find((x) => !seen.includes(x.id));
  if (!s) return;
  openSheet({ small: true, label: t('nsig.t'), html: `<div class="sheet-head"><div><p class="sheet-title">${t('nsig.t')}</p><p class="sheet-sub">${t('nsig.s')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
    <div class="sheet-body">${B.firstMoneyIdx([s], data, now()) === 0 ? B.profSwitch() : ''}${B.compact(s, { data, now: now(), notNow: true })}</div>`,
    onMount(el) { el.querySelector('[data-close]').addEventListener('click', () => closeTopSheet()); } });
}

/* ---------- Data ---------- */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return { json: await res.json(), cached: res.headers.get('X-Pulse-From-Cache') === '1' };
}

async function loadAll() {
  state.loading = true;
  const keys = ['signals', 'history', 'performance', 'calendar', 'league', 'paper', 'health'];
  const [results] = await Promise.all([Promise.allSettled(keys.map((k) => (CONFIG.DATA[k] ? fetchJSON(CONFIG.DATA[k]) : Promise.reject(new Error('off'))))), Mkt.ready() ? null : Mkt.load()]);
  let cached = false;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { data[keys[i]] = r.value.json; cached = cached || (keys[i] === 'signals' && r.value.cached); }
  });
  state.error = results[0].status === 'rejected' && !data.signals ? results[0].reason : null;
  state.fromCache = cached || (!navigator.onLine && !!data.signals);
  state.loading = false;
  state.lastFetch = Date.now();
  if (results[5].status === 'rejected') data.paper = null; // missing paper.json -> the section hides
  if (results[6].status === 'rejected') data.health = null; // missing health.json -> no watchdog, behaviour as 1.10
  Comm.load().then((d) => { if (d && route.name === 'historie' && !sheetOpen()) rerender({ soft: true }); });
  D.migratePreviewJournal(data);
  Live.onData();
  walletCheck();
  rerender({ soft: true });
  maybeOpenDeepLink();
  checkAlerts();
  syncTrades();
  if (!route.params.get('s')) setTimeout(newSignalOffer, 1200);
}

/* paper.json (robot's Alpaca paper account) is polled with the other data */
async function pollPaper() {
  if (!CONFIG.DATA.paper) return false;
  try {
    const { json } = await fetchJSON(CONFIG.DATA.paper);
    const changed = !data.paper || json.updated_at !== data.paper.updated_at;
    data.paper = json;
    return changed;
  } catch { const had = !!data.paper; data.paper = null; return had; }
}

/* 1.11.0: health.json (the robot's watchdog, written hourly) is refreshed with signals.json */
async function pollHealth() {
  if (!CONFIG.DATA.health) return false;
  const before = data.health?.updated_at || null;
  try { data.health = (await fetchJSON(CONFIG.DATA.health)).json; } catch { data.health = null; }
  return (data.health?.updated_at || null) !== before;
}

/* fictional positions of the Obchodní platforma: auto close on stop-loss / take-profit / signal close */
/* 1.9.0 "Robot obchoduje za mě": every buyable signal is copied once into my fictional account */
const twinBase = (id) => String(id || '').replace(/-\d+$/, '');
/* signals the robot-for-me could take right now (buyable, allowed, not copied yet). all=false: only those published after
   the switch was turned on ("Jen nové signály", the default) */
function autoCandidates(ac = store.get('autoCopy', null) || {}) {
  const now = D.clock();
  const copied = new Set(store.get('wallet', null)?.copied || []);
  const skip = new Set(ac.skip || []);
  return D.allOpen(data).filter((s) => D.horizonAllowed(data, s.horizon) && (CONFIG.HIDDEN_HORIZONS || []).indexOf(s.horizon) < 0 && H.offerable(s, data)
    && !copied.has(s.id) && B.userState(s, now).code === 'buy'
    && (ac.all || !(skip.has(twinBase(s.id)) || Date.parse(s.created_at || 0) < (ac.at || 0))));
}
function autoCopy() {
  if (!store.get('autoCopy', null)?.on || !data.signals) return false;
  const now = D.clock();
  let any = false;
  autoCandidates().forEach((s) => {
    const us = B.userState(s, now);
    if (us.code !== 'buy') return;
    const td = B.todo(s, us, now);
    const r = W.autoOpen(data, s, td.code === 'now' ? 'now' : 'lim', store.get('autoCopy', null)?.at || 0);
    if (!r.ok) return;
    any = true;
    const pid = (r.pos || r.order)?.id;
    toast(t(r.pos ? (r.reopen ? 'auto.boughtReopen' : 'auto.bought') : 'auto.waiting', { sym: s.symbol, v: F.price(r.pos ? r.pos.entry : D.maxEntry(s)), a: F.money(r.amount, W.get().ccy, 0) }), { timeout: 7000, action: pid ? { label: t('po.see'), fn: () => window.__pulseGo(`#/obchod/${pid}`) } : null });
  });
  return any;
}

function walletCheck() {
  const r = walletCheck0();
  if (r) syncTrades();
  return r;
}
function walletCheck0() {
  const copied = autoCopy();
  /* 1.8.0: pending limit orders first (a fill becomes a position that the stop / target check below watches) */
  const ord = W.checkOrders(data);
  ord.filled.forEach((p) => toast(t(p.reopen ? 'term.auto.fillReopen' : 'term.auto.fill', { sym: p.sym, side: F.SIDE[p.side], v: F.price(p.entry) }), { timeout: 7000 }));
  ord.expired.forEach((o) => toast(t('term.auto.expired', { sym: o.sym, v: F.price(o.limit) }), { timeout: 6000 }));
  const done = W.check(data);
  if (store.get('wallet', null)?.positions?.length) W.summary(data); // takes today's starting point as early as possible
  /* 1.12.0: a trade that reached its target -> a small celebration (skipped under reduced motion) */
  if (done.some((r) => r.why === 'tp' && r.pnl > 0)) M.confetti();
  done.forEach((r) => toast(t(`term.auto.${['tp', 'sl', 'out', 'slgap', 'stopout'].includes(r.why) ? r.why : 'sig'}`, { sym: r.sym, v: (r.pnl > 0 ? '+' : '') + F.money(r.pnl, W.get().ccy, 0), x: F.price(r.exit), sl: F.price(r.sl) }), { timeout: 7000 }));
  return copied || done.length > 0 || ord.filled.length > 0 || ord.expired.length > 0;
}

async function poll() {
  if (document.visibilityState !== 'visible') return;
  try {
    const { json, cached } = await fetchJSON(CONFIG.DATA.signals);
    state.lastFetch = Date.now();
    const changed = !data.signals || json.generated_at !== data.signals.generated_at;
    data.signals = json;
    const paperChanged = await pollPaper();
    const healthChanged = await pollHealth();
    if (paperChanged && !sheetOpen() && ['dnes', 'robot', 'vysledky'].includes(route.name) && !changed) rerender({ soft: true });
    else if (healthChanged && !sheetOpen() && ['dnes', 'signaly', 'uceni'].includes(route.name) && !changed) rerender({ soft: true });
    state.fromCache = cached;
    D.migratePreviewJournal(data);
    Live.onData();
    const walletClosed = walletCheck();
    renderChrome();
    if (walletClosed && route.name === 'terminal' && !sheetOpen()) rerender({ soft: true });
    if (changed) {
      checkAlerts();
      setTimeout(newSignalOffer, 600);
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
  /* 1.15.0 skin "Noční tyrkys" is dark only: a stored 'light' from older versions is ignored */
  document.documentElement.dataset.theme = 'dark';
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', CONFIG.THEME_COLOR);
}

/* ---------- Global actions (event delegation) ---------- */
const GLOBAL = {
  'open-signal'(el) { openDetail(ctx(), el.dataset.id, el.classList.contains('sig') ? el : null, { focus: el.dataset.focus || null }); },
  /* Nabít / Vybrat fictional money (Dnes, Obchodní platforma, header) */
  'w-load'() { const go = () => Term.loadSheet(ctx(), 'dep'); if (sheetOpen()) { closeTopSheet(); setTimeout(go, 380); } else go(); },
  'w-withdraw'() { Term.loadSheet(ctx(), 'wd'); },
  'w-reset'() { Term.resetSheet(ctx()); },
  /* guided tour on the real screens (Dnes "?", Více, after the first-run guide) */
  tour() { unwindSheets(() => { store.set('faq3off', 0); Tour.start(); }); },
  /* "Robot obchoduje za mě (nanečisto)" switch (Dnes account card, platform) */
  'auto-toggle'(el, ev, gated = false) {
    const on = !store.get('autoCopy', null)?.on;
    if (!on) { setAuto({ on: false, at: Date.now() }); return; }
    /* 1.15.0: a leveraged style warns first (several trades at once, losses add up) */
    if (!gated) { Sty.robotGate(() => GLOBAL['auto-toggle'](el, ev, true)); return; }
    /* 1.13.0: never take the running signals silently – ask once; default = only new signals */
    const run = data.signals ? autoCandidates({ all: true }) : [];
    if (!run.length) { setAuto({ on: true, at: Date.now(), skip: [] }); return; }
    const sm = W.summary(data);
    let free = Math.max(0, sm.free), sum = 0;
    run.forEach((s) => { const a = Math.min(W.autoAmount(data, s, { ...sm, free }), free); free -= a; sum += a; });
    autoAsk(run.length, sum, sm.w.ccy, run.map((s) => twinBase(s.id)));
  },
  auto() { GLOBAL['auto-toggle'](); },
  /* 1.13.0 [Ukončit] on the shared trade row (Dnes, Zainvestováno, Obchodovat) */
  /* 1.13.1: one confirm step that shows the result in money */
  'pos-close'(el) { Term.closeConfirm(ctx(), el.dataset.id); },
  /* Můj profil (Nastavení) + the 3 profile chips on a compact signal card */
  /* 1.13.2: risk and leverage are ONE profile (older links / buttons with data-id land here too) */
  'risk-prof'(el) { Sty.choose(el.dataset.id); },
  /* 1.15.0 STYLES: the style row opens "Vyber styl"; "Porovnat styly" = the same sheet with this signal's numbers */
  'style-open'(el) { Sty.openPicker({ sigId: el.dataset.id || null }); },
  'style-compare'(el) { Sty.openPicker({ sigId: el.dataset.id || null }); },
  'faq3-close'() { store.set('faq3off', 1); document.querySelectorAll('#faq3').forEach((n) => n.remove()); },
  /* "?" next to a trading word: one sentence + an example */
  'term-help'(el) { termHelp(el.dataset.k); },
  /* 1.11.1: leverage profile column on a money block (card, detail; the invest sheet also sets its own leverage) */
  /* 1.13.0: inside the invest sheet a leverage tap is a one-off for that ticket – the global profile stays */
  'lev-prof'(el) {
    if (!el.isConnected || el.closest('#tk')) return;
    /* 1.15.0: through the style gate (the first switch to a risky style asks once) */
    Sty.choose(el.dataset.prof);
    if (el.tagName === 'SELECT') el.value = D.profId();
  },
  /* 1.11.2 broker chips 1:1 … 1:100 ("Vlastní páka ▾", Příklady pák), a disabled chip explains the cap, Profesionální klient */
  'lev-own'(el) { if (!el.isConnected || el.closest('#tk')) return; B.setLevOwn(+el.dataset.lev, el.dataset.sym || null); },
  'lev-own-open'(el) { B.toggleOwn(el); },
  'lev-why'(el) { if (!B.showWhy(el)) toast(B.levWhy(el.dataset.sym, +el.dataset.v), { timeout: 9000 }); },
  'pro-toggle'(el) {
    if (Mkt.isPro()) { store.set('proClient', false); el.setAttribute('aria-checked', 'false'); toast(t('pro.offDone')); return; }
    proSheet(el);
  },
  rtip() { toast(t('rtip')); },
  /* 1.9.1 signal card buttons: [Zainvestovat] / [Nastavit nákup za …] and [Teď ne] */
  invest(el) {
    /* from the "new signal" sheet: close it first; from the detail: the sheet opens on top of it */
    const go = () => investFor(el.dataset.id, el.dataset.mode === 'limit' ? 'limit' : 'now');
    if (el.closest('.sheet') && !el.closest('.sheet #cta')) { closeTopSheet(); setTimeout(go, 380); } else go();
  },
  'not-now'(el) {
    D.dismiss(el.dataset.id);
    if (el.closest('.sheet')) closeTopSheet();
    toast(t('sc.notNowDone'));
    rerender({ soft: true });
  },
  /* "Změnit kapitál": the calculator holds the user's account size, currency and risk profile */
  'go-calc'() {
    const go = () => (window.__pulseGo ? window.__pulseGo('#/kalkulacka') : (location.hash = '#/kalkulacka'));
    if (sheetOpen()) { closeTopSheet(); setTimeout(go, 380); } else go();
  },
  reload() { loadAll(); },
  install() { More.doInstall(); },
  'dismiss-nudge'() { P.dismissNudge(); document.querySelectorAll('.nudge').forEach((n) => n.remove()); },
  async 'push-cta'() {
    const r = await P.subscribePush().catch(() => ({ ok: false }));
    toast(t(r.ok ? 'push.on' : r.reason === 'server' ? 'push.server' : r.reason === 'denied' ? 'push.denied' : 'push.fail'));
    if (r.ok) document.querySelectorAll('.pcta').forEach((n) => n.remove());
  },
  'dismiss-pcta'() { P.dismissPushCta(); document.querySelectorAll('.pcta').forEach((n) => n.remove()); },
  /* re-open the first-run guide (Více) */
  onboarding() { Onb.open(() => rerender({ soft: true }), () => data); },
  /* "Sledovat" star on signal cards (Moje) */
  follow(el) {
    const on = D.toggleFollow(el.dataset.id);
    document.querySelectorAll(`[data-action="follow"][data-id="${CSS.escape(el.dataset.id)}"]`).forEach((b) => { b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', t(on ? 'fol.off' : 'fol.on')); });
    toast(t(on ? 'fol.added' : 'fol.removed', { sym: F.esc(el.dataset.sym || '') }), on ? { action: { label: t('fol.see'), fn: () => window.__pulseGo('#/portfolio') } } : {});
  },
};

function setAuto(v) {
  store.set('autoCopy', v);
  toast(t(v.on ? (v.all ? 'auto.onAll' : 'auto.on') : 'auto.off'), { timeout: 6000 });
  walletCheck();
  rerender({ soft: true });
}
/* "Robot teď může vzít i 5 běžících signálů za 35 000 Kč. Vzít i tyto, nebo jen nové?" */
function autoAsk(n, sum, ccy, bases) {
  openSheet({
    small: true, label: t('auto.askT'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('auto.askT')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><p class="ask-q">${t('auto.ask', { n, u: F.unit('signal', n), a: F.money(sum, ccy, 0) })}</p>
      <div class="btn-stack"><button type="button" class="btn btn-primary btn-block" data-new>${t('auto.onlyNew')}</button>
      <button type="button" class="btn btn-secondary btn-block" data-all>${t('auto.takeAll', { n })}</button></div>
      <p class="risk-line">${t('risk.line')}</p></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-new]').addEventListener('click', () => { closeTopSheet(); setAuto({ on: true, at: Date.now(), skip: bases }); });
      sh.querySelector('[data-all]').addEventListener('click', () => { closeTopSheet(); setAuto({ on: true, at: Date.now(), all: true }); });
    },
  });
}

/* a span with role="button" inside a card (star) reacts to Enter / Space like a button */
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const el = ev.target.closest && ev.target.closest('[role="button"][data-action]:not(button)');
  if (!el) return;
  ev.preventDefault(); ev.stopPropagation(); el.click();
});

/* 1.13.7 compact selects (Signály: Délka ▾ / Profil ▾): a change runs the same action as the chip it replaces */
document.addEventListener('change', (ev) => {
  const el = ev.target.closest && ev.target.closest('select[data-chg]');
  if (!el) return;
  const name = el.dataset.chg;
  el.dataset.id = el.value; el.dataset.prof = el.value;
  if (GLOBAL[name]) { GLOBAL[name](el, ev); return; }
  const v = VIEWS[route.name];
  if (v.actions && v.actions[name]) v.actions[name](el, ev, ctx());
});

document.addEventListener('click', (ev) => {
  const lb = ev.target.closest && ev.target.closest('[data-lang-set]');
  if (lb && !lb.closest('#gate') && !lb.closest('.onb')) {
    if (lb.dataset.langSet !== lang()) { setLang(lb.dataset.langSet); onLangChange(); }
    return;
  }
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

/* ---------- 1.9.0: "?" next to every trading word -> small sheet with one plain sentence and an example ---------- */
/* 1.11.2 "Profesionální klient (vyšší páky)": a clear warning first, fictional money only */
function proSheet(sw) {
  openSheet({
    small: true, label: t('pro.title'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('pro.title')}</p><p class="sheet-sub">${t('pro.sub')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body pro-warn"><p class="pro-alert">${icon('alert', 'icon-sm')}<span>${t('pro.alert')}</span></p>
      <ul class="pro-list"><li>${t('pro.l1')}</li><li>${t('pro.l2')}</li><li>${t('pro.l3')}</li><li>${t('pro.l4')}</li></ul>
      <p class="pro-caps">${t('pro.caps')}</p>
      <button type="button" class="btn btn-danger btn-block" data-pro-on>${t('pro.on')}</button>
      <button type="button" class="btn btn-ghost btn-block" data-close2 style="margin-top:8px">${t('pro.cancel')}</button></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-close2]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-pro-on]').addEventListener('click', () => {
        store.set('proClient', true);
        if (sw) sw.setAttribute('aria-checked', 'true');
        closeTopSheet();
        toast(t('pro.onDone'), { timeout: 7000 });
      });
    },
  });
}

function termHelp(k) {
  openSheet({
    small: true, label: t(`th.${k}.t`),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t(`th.${k}.t`)}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><p class="th-text">${F.esc(gloss(k) || t(`th.${k}.s`))}</p></div>`,
    onMount(sh) { sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet()); },
  });
}

/* ---------- Gate ---------- */
async function gate() {
  if (!CONFIG.ACCESS_GATE_ENABLED || store.get('unlocked') === CONFIG.ACCESS_CODE_SHA256) return;
  const g = document.getElementById('gate');
  g.hidden = false;
  g.className = 'gate';
  const html = () => `<div class="gate-inner">
    <div class="gate-lang">${langSwitch()}</div>
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
  g.innerHTML = html();
  document.getElementById('app').setAttribute('aria-hidden', 'true');
  setTimeout(() => g.querySelector('input').focus(), 100);
  let off = () => {};
  await new Promise((resolve) => {
    // Sandboxed previews block form submission, so handle the button and Enter directly (delegated: the gate re-renders on CS | EN).
    const submit = async () => {
      const v = g.querySelector('input').value.trim().toUpperCase();
      const err = g.querySelector('#gate-err');
      if (!v) { err.textContent = t('gate.empty'); return; }
      const h = await sha256Hex(v);
      if (h === CONFIG.ACCESS_CODE_SHA256) {
        store.set('unlocked', h);
        g.classList.add('is-out');
        setTimeout(() => { g.hidden = true; g.innerHTML = ''; }, 300);
        document.getElementById('app').removeAttribute('aria-hidden');
        off();
        resolve();
      } else {
        err.textContent = t('gate.wrong');
        g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
      }
    };
    const onClick = (ev) => {
      const lb = ev.target.closest('[data-lang-set]');
      if (lb) { const v = g.querySelector('input')?.value || ''; setLang(lb.dataset.langSet); g.innerHTML = html(); g.querySelector('input').value = v; onLangChange(); return; }
      if (ev.target.closest('#gate-go')) submit();
    };
    const onSubmit = (ev) => { ev.preventDefault(); submit(); };
    const onKey = (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); submit(); } };
    g.addEventListener('click', onClick); g.addEventListener('submit', onSubmit); g.addEventListener('keydown', onKey);
    off = () => { g.removeEventListener('click', onClick); g.removeEventListener('submit', onSubmit); g.removeEventListener('keydown', onKey); };
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
  /* 1.13.1: one leverage profile for every money number (cards, detail, sheet, robot-for-me) – set before the first render */
  D.setLevOf((sym) => B.selLev(sym));
  W.setAutoLev((sym) => B.selLev(sym));
  Sty.init({ data: () => data });
  /* 1.15.0: a style chosen in a sheet re-renders the screen below once the sheets are closed */
  document.addEventListener('pulse:prof', () => { if (!sheetOpen()) rerender({ soft: true }); else setTimeout(() => { if (!sheetOpen()) rerender({ soft: true }); }, 450); });
  route = parseRoute();
  curHash = window.__pulseHash ?? location.hash;
  VIEWS[route.name].enter?.();
  renderNav();
  rerender();
  document.title = `${t(VIEWS[route.name].title)} – ${CONFIG.APP_NAME}`;
  P.initSW();
  try { if (sessionStorage.getItem('pulse.updated')) { sessionStorage.removeItem('pulse.updated'); setTimeout(() => toast(t('update.done')), 900); } } catch { /* ignore */ }
  await gate();
  /* 1.15.1: the language is synced like the other settings – a change from another device re-renders in place */
  Sync.init(() => { const l = store.get('lang', null); if (l && l !== lang()) { setLang(l); onLangChange(); return; } if (!sheetOpen()) rerender({ soft: true }); }); /* 1.14.0 Můj účet na všech zařízeních + #/pair/<id> */
  /* first-run guide: only after the access gate, only once */
  B.setInstrLookup(Mkt.get);
  W.setAutoLev((sym) => B.selLev(sym));
  Onb.onLang(() => onLangChange());
  Onb.maybeShow((fresh) => { rerender({ soft: true }); if (fresh === 'done') setTimeout(() => Tour.start({ auto: true }), 600); }, () => data);
  Tour.init({ go: (h) => window.__pulseGo(h), route: () => route.name });
  window.addEventListener('hashchange', () => { window.__pulseHash = null; onRoute(); });
  // In-app navigation that also works inside sandboxed previews (iframes that block hash links).
  window.__pulseGo = (href, opt = {}) => {
    /* A7: open sheets give their history entries back first (no dead Back press later) */
    if (sheetOpen()) { unwindSheets(() => window.__pulseGo(href, opt)); return; }
    window.__pulseHash = href;
    try { if (location.hash !== href) { history[opt.replace ? 'replaceState' : 'pushState'](null, '', href); window.__pulsePushed = true; } } catch (e) { window.__pulsePushed = false; /* sandboxed: keep virtual route */ }
    onRoute(opt);
  };
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href^="#/"], a[href="#"]');
    if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey) return;
    const href = a.getAttribute('href'); if (href === '#') return;
    /* 1.15.0: picking another trade in the desktop side list replaces the detail (Back still returns to where I came from) */
    ev.preventDefault(); window.__pulseGo(href, { replace: !!a.closest('.pd-side') && route.name === 'obchod' });
  });
  /* 1.15.0: Back that only closed a style sheet over another sheet (Vyber styl / its confirmation) keeps the sheet below */
  /* A7: a Back that closed one sheet layer (ui.js consumePop) is never a route change */
  window.addEventListener('popstate', () => { if (consumePop()) return; if (Sty.justClosed() && sheetOpen()) return; window.__pulseHash = null; onRoute({ pop: true }); });
  Live.setExtraSymbols(W.watched);
  Live.initLive(() => data);
  Live.onStatus(() => renderChrome());
  Live.onLive(() => {
    const closed = walletCheck();
    if (closed && route.name === 'terminal' && !sheetOpen()) rerender({ soft: true });
    checkAlerts();
    if (!sheetOpen() && ['dnes', 'signaly'].includes(route.name)) rerender({ soft: true });
    else renderChrome();
    /* 1.15.0: Peněženka's numbers follow the header on the same tick (one summary, one rounding) – they used to differ
       by 1 Kč; patched in place, so a button being tapped is never replaced */
    if (route.name === 'penezenka') Wal.paintHero(data);
    document.dispatchEvent(new CustomEvent('pulse:live'));
  });
  setInterval(() => renderChrome(), 30000);
  document.addEventListener('pulse:wallet', () => { syncTrades(); renderChrome(); if (!sheetOpen() && ['dnes', 'zainvestovano', 'portfolio', 'moje', 'obchod', 'signaly', 'penezenka', 'historie'].includes(route.name)) rerender({ soft: true }); });
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
