// 1.15.1 "PULSE DEN" – the EXPERIMENTAL one-day robot (markets from robot.trhy), shown apart from the tested signals:
// a card on Dnes under "Dnešní signály" and a page #/den. Data /data/den.json (VYZKUM/denni_robot/SPECIFIKACE_BOTA.md §5).
// Never mixed into Dnešní signály, the Portfolio's "Všechny signály robota" or Výsledky. Everything is guarded: the file may
// be absent, old or half-filled – Dnes never breaks because of it.
// 1.15.0 release round (C): the card offers a trade ONLY when it can really be entered now (robot runs, signal from today,
// state 'plati', not late, before plati_do); every other state is a small grey note in plain words, with the date when the
// signal is not from today. The robot's own texts are Czech only: in English they sit behind one closed <details>.
import * as F from './format.js';
import * as D from './domain.js';
import { t, lang } from './i18n/index.js';
import { icon, openSheet, closeTopSheet } from './ui.js';
import { ownTicket } from './views/terminal.js';
import * as Live from './live.js';
import * as M from './market.js';

const URL0 = './data/den.json';
const STALE_MS = 70 * 60000;      // older than this during the US session -> "data not available"
let st = { j: null, at: 0, ok: false, tried: false };
let busy = null;

export async function load(force = false) {
  if (busy) return busy;
  if (!force && st.tried && Date.now() - st.at < 120000) return st;
  busy = (async () => {
    try {
      const r = await fetch(URL0, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      st = { j: j && typeof j === 'object' ? j : null, at: Date.now(), ok: !!(j && typeof j === 'object'), tried: true };
    } catch { st = { j: null, at: Date.now(), ok: false, tried: true }; }
    busy = null;
    return st;
  })();
  return busy;
}
export const state = () => st;

const arr = (x) => (Array.isArray(x) ? x : []);
const n2 = (v, d = 1) => (v != null && v !== '' && Number.isFinite(+v) ? F.num(+v, d) : '–');
const px = (v) => (Number.isFinite(+v) && +v > 0 ? F.num(+v, 1) : '–');
const side = (s) => (s?.smer === 'PRODEJ' ? 'SELL' : 'BUY');
const cs = () => lang() === 'cs';
const mktName = (k) => (k ? (t(`mkt.k.${k}`) !== `mkt.k.${k}` ? t(`mkt.k.${k}`) : String(k)) : '–');
/* "DAX (DE40)"; a name that already carries its own bracket or the code ("CAC 40 (Francie)", "Ropa WTI") stays as it is */
const mkt = (k) => { if (!k) return '–'; const n = mktName(k); return n === String(k) || n.includes('(') || n.includes(String(k)) ? n : `${n} (${k})`; };
const ms = (iso) => { const v = Date.parse(iso || 0); return v > 0 ? v : null; };
/* the robot's own (Czech) text, with local number / date formats */
const hum = (x) => F.esc(F.human(String(x ?? '')));
/* plural-aware key: base.one / base.few / base.many / base.other (falls back to .other) */
function tp(base, n, p = {}) {
  let cat = 'other';
  try { cat = new Intl.PluralRules(cs() ? 'cs' : 'en').select(+n); } catch { /* keep other */ }
  const k = `${base}.${cat}`;
  return t(t(k) !== k ? k : `${base}.other`, { n, ...p });
}
/* the Prague calendar day of a moment ("2026-11-12") – the robot trades Frankfurt / New York sessions, the app is Czech */
const PRG = (() => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }); } catch { return null; } })();
export function pragueDay(v) {
  const x = typeof v === 'number' ? v : v instanceof Date ? +v : ms(v);
  if (!Number.isFinite(x)) return '';
  return PRG ? PRG.format(new Date(x)) : F.dayKey(new Date(x));
}
/* "čt 12. 11." / "Thu 12 Nov" */
const dayLabel = (x) => `${F.weekdayShort(new Date(x))} ${F.dm(new Date(x))}`;
const period = (p) => { const y = /(\d{4}).*?(\d{4})/.exec(String(p || '')); return y ? `${y[1]}–${y[2]}` : '2023–2026'; };
/* list of market names: "S&P 500, Nasdaq 100 a DAX" */
const join = (l) => (l.length === 1 ? l[0] : `${l.slice(0, -1).join(', ')} ${t('den.and')} ${l[l.length - 1]}`);
/* 1.15.3: more than four markets -> the kinds instead: "indexech (USA, Německo, Francie), zlatě, ropě a kryptoměnách" */
const IDX_CTY = { US500: 'US', US100: 'US', US30: 'US', DE40: 'DE', FR40: 'FR', UK100: 'UK', JP225: 'JP' };
const KIND = { XAUUSD: 'gold', XAGUSD: 'silver', WTI: 'oil', BRENT: 'oil', BTCUSD: 'crypto', ETHUSD: 'crypto', SOLUSD: 'crypto' };
function mktList(trhy) {
  const ks = [...new Set(arr(trhy).filter(Boolean).map(String))];
  if (!ks.length) return t('den.mkt0');
  if (ks.length <= 4) return join(ks.map(mktName));
  const cty = [], kinds = [], other = [];
  ks.forEach((k) => {
    if (IDX_CTY[k]) { if (!cty.includes(IDX_CTY[k])) cty.push(IDX_CTY[k]); }
    else if (KIND[k]) { if (!kinds.includes(KIND[k])) kinds.push(KIND[k]); }
    else if (/^[A-Z]{6}$/.test(k)) { if (!kinds.includes('fx')) kinds.push('fx'); }
    else other.push(mktName(k));
  });
  const parts = [];
  cty.sort((a, b) => 'US DE FR UK JP'.indexOf(a) - 'US DE FR UK JP'.indexOf(b));
  kinds.sort((a, b) => 'gold silver oil crypto fx'.indexOf(a) - 'gold silver oil crypto fx'.indexOf(b));
  if (cty.length) parts.push(t('den.kind.idx', { c: cty.map((c) => t(`den.cty.${c}`)).join(', ') }));
  kinds.forEach((k) => parts.push(t(`den.kind.${k}`)));
  return join(parts.concat(other));
}

/* "15:55 New York" / "17:25 Frankfurt" -> the same moment in the user's clock, on the day of `ref` (an ISO time with its offset) */
/* 1.15.3: v3 writes cas_signalu in UTC ("…+00:00"), so the city in the text decides the zone, not the offset of `ref` */
const CITY_TZ = [[/new\s*york/i, 'America/New_York'], [/frankfurt|paříž|paris|xetra/i, 'Europe/Berlin'], [/londýn|london/i, 'Europe/London'], [/praha|prague|našeho času/i, 'Europe/Prague']];
function tzWall(tz, y, mo, d, h, mi) {
  /* the UTC moment whose wall clock in tz is y-mo-d h:mi (two passes cover the DST edge) */
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const want = Date.UTC(y, mo - 1, d, h, mi);
    let g = want;
    for (let i = 0; i < 2; i++) {
      const p = Object.fromEntries(f.formatToParts(new Date(g)).map((x) => [x.type, x.value]));
      const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
      g += want - seen;
    }
    return g;
  } catch { return null; }
}
export function nyClock(txt, ref) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(txt || ''));
  const r = /^(\d{4}-\d{2}-\d{2})T.*([+-]\d{2}:\d{2}|Z)$/.exec(String(ref || ''));
  if (!m || !r) return null;
  const tz = (CITY_TZ.find(([re]) => re.test(String(txt))) || [])[1];
  if (tz) {
    /* the calendar day of the signal in that city */
    let day = r[1];
    try { day = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.parse(ref))); } catch { /* keep */ }
    const [y, mo, d] = day.split('-').map(Number);
    const g = tzWall(tz, y, mo, d, +m[1], +m[2]);
    if (Number.isFinite(g)) return new Date(g);
  }
  const d = Date.parse(`${r[1]}T${m[1].padStart(2, '0')}:${m[2]}:00${r[2] === 'Z' ? 'Z' : r[2]}`);
  return Number.isFinite(d) ? new Date(d) : null;
}

/* fresh enough to show signals? (missing / bez_dat / older than 70 min while the US session runs -> no) */
export function fresh(j, now = D.clock()) {
  if (!j) return false;
  if (j.robot?.stav === 'bez_dat') return false;
  const made = Date.parse(j.vytvoreno || 0);
  if (!(made > 0)) return false;
  if (D.usOpenAt(+now) && +now - made > STALE_MS) return false;
  return true;
}

/* the robot's real running result (P.5): trades, wins, profit against loss + "N signals came late, not counted" */
export function resultLine(j) {
  const v = j?.vysledek;
  if (!v || typeof v !== 'object') return t('den.resNA');
  const n = +v.obchodu || 0;
  let s;
  if (!(n > 0)) s = t('den.res0');
  else {
    const w = v.vyher != null && Number.isFinite(+v.vyher) ? +v.vyher : (v.vyhry_pct != null ? Math.round((+v.vyhry_pct / 100) * n) : null);
    const pf = v.pf != null && Number.isFinite(+v.pf) ? t('den.resPf', { v: n2(v.pf, 2) }) : (w === n ? t('den.pfNoLoss') : t('den.resPf', { v: '–' }));
    s = t('den.res', { n, w: w != null ? w : '–', pf });
  }
  const late = +v.vynechano_pozde || 0;
  return late > 0 ? `${s} ${tp('den.lateN', late)}` : s;
}

/* ---------- one signal -> what the client can do now ---------- */
/* 1.15.3 den.json v3: European indices come as 'over_u_brokera' (their data are 15 min late) – actionable like 'plati',
   shown with a sentence "check the price at the broker" */
const ENTRY_OPEN = ['plati', 'over_u_brokera'];
/* 1.15.3 groups (styly[]): V4 / V1EU / V1US / PB; PB = "yellow band" (expectation around zero in the test) */
const isPB = (s) => s?.strategie === 'PB';
const pbTag = () => `<button type="button" class="den-pb" data-action="den-pb" aria-label="${F.esc(t('den.pb.aria'))}">${t('den.pb.tag')}</button>`;
const gName = (k) => (t(`den.g.${k}`) !== `den.g.${k}` ? t(`den.g.${k}`) : String(k || '–'));
/* codes of the paused groups: robot.pozastavene_skupiny (codes or {kod}) + styly[].stav === 'pozastaveno' */
export function pausedGroups(j) {
  const l = arr(j?.robot?.pozastavene_skupiny).map((x) => (x && typeof x === 'object' ? x.kod : x)).filter(Boolean).map(String);
  arr(j?.styly).forEach((y) => { if (y?.stav === 'pozastaveno' && y.kod && !l.includes(String(y.kod))) l.push(String(y.kod)); });
  return l;
}
export function canTrade(j, s, now = D.clock()) {
  if (j?.robot?.stav !== 'bezi' || !ENTRY_OPEN.includes(s?.stav)) return false;
  if (s.strategie && pausedGroups(j).includes(String(s.strategie))) return false;
  if (s.vstup_stav === 'pozde' || s.pozde_pri_zapisu === true) return false;
  const until = ms(s.vstup?.plati_do);
  if (until && +now > until) return false;
  const at = ms(s.cas_signalu);
  return !!at && pragueDay(at) === pragueDay(+now);
}
const isLate = (s) => s?.vstup_stav === 'pozde' || s?.pozde_pri_zapisu === true || s?.stav === 'pozde';
/* outcome of an ended trade, from R (the robot's result in multiples of its risk) */
function outcome(r) {
  if (!Number.isFinite(r)) return 'none';
  return r > 0.05 ? 'win' : r < -0.05 ? 'loss' : 'flat';
}
/* {code, today, at, m, until, out} – code: go | late | held | over | win | loss | flat | nodata | other */
export function sigState(j, s, now = D.clock()) {
  const at = ms(s?.cas_signalu) || ms(j?.vytvoreno);
  const today = !!at && pragueDay(at) === pragueDay(+now);
  const untilMs = ms(s?.vstup?.plati_do);
  const outD = nyClock(s?.vystup, s?.cas_signalu || j?.vytvoreno);
  const base = { today, at, m: mktName(s?.trh), until: untilMs ? F.time(new Date(untilMs)) : '–', out: outD ? F.time(outD) : '–', outMs: outD ? +outD : null };
  if (canTrade(j, s, now)) return { ...base, code: 'go' };
  if (isLate(s)) return { ...base, code: 'late' };
  const k = s?.stav;
  if (k === 'uzavreno') { const o = outcome(+s.vysledek_R); return { ...base, code: o === 'none' ? 'other' : o }; }
  if (k === 'otevreno') return { ...base, code: base.outMs && +now >= base.outMs ? 'other' : 'held' };
  if (ENTRY_OPEN.includes(k)) return { ...base, code: 'over' };
  if (k === 'neuzavreno_chybi_data') return { ...base, code: 'nodata' };
  return { ...base, code: 'other' };
}
/* one plain sentence about a signal of TODAY */
const todayText = (x) => t(`den.t.${x.code}`, { m: x.m, until: x.until, out: x.out });
const TODAY_CAP = 4;
/* a market name in a today line (escaped HTML) */
const nameHtml = (o) => `${F.esc(o.x.m)}${isPB(o.s) ? ` ${pbTag().replace('class="den-pb"', 'class="den-pb den-pb-s"')}` : ''}`;
/* today's non-actionable signals as short grey lines: one signal -> the usual sentence; more -> one line per state,
   identical states grouped ("3 signály přišly pozdě: Nasdaq 100, Ropa WTI, DAX – nepočítají se.") */
function todayLines(list, afterGo = false) {
  if (!list.length) return '';
  if (list.length === 1) {
    const o = list[0];
    return `<p class="den-note" data-den-state="${o.x.code}">${F.esc(todayText(o.x)).replace(F.esc(o.x.m), nameHtml(o))}</p>`;
  }
  const groups = [];
  list.forEach((o) => { const g = groups.find((y) => y.code === o.x.code); if (g) g.l.push(o); else groups.push({ code: o.x.code, l: [o] }); });
  const lines = groups.map((g) => {
    const one = (o) => (g.code === 'held' && o.x.out !== '–' ? t('den.li.held', { m: nameHtml(o), out: F.esc(o.x.out) }) : nameHtml(o));
    const txt = g.l.length === 1
      ? t(`den.l1.${g.code}`, { m: nameHtml(g.l[0]), until: F.esc(g.l[0].x.until), out: F.esc(g.l[0].x.out) })
      : tp(`den.lg.${g.code}`, g.l.length, { list: g.l.map(one).join(', ') });
    return `<p class="den-note den-line" data-den-state="${g.code}">${txt}</p>`;
  }).join('');
  return `<p class="den-note den-lead">${t(afterGo ? 'den.todayLead2' : 'den.todayLead')}</p>${lines}`;
}
/* "Poslední: čt 12. 11. · DAX · přišel pozdě" */
const lastText = (x) => t('den.last', { d: dayLabel(x.at), m: x.m, o: t(`den.o.${x.code}`) });
/* the newest signal that is NOT from today (signaly first, else the history) */
function lastOld(j, now) {
  const today = pragueDay(+now);
  const old = arr(j?.signaly).map((s) => sigState(j, s, now)).filter((x) => x.at && !x.today).sort((a, b) => b.at - a.at);
  if (old.length) return old[0];
  const h = arr(j?.historie_poslednich_20).map((h) => {
    const mm = /(\d{4})(\d{2})(\d{2})/.exec(h?.id || '');
    if (!mm) return null;
    const at = Date.parse(`${mm[1]}-${mm[2]}-${mm[3]}T12:00:00+01:00`);
    if (!(at > 0) || pragueDay(at) === today) return null;
    const o = outcome(+h.R);
    return { at, m: mktName(h.trh), code: o === 'none' ? 'other' : o };
  }).filter(Boolean).sort((a, b) => b.at - a.at);
  return h[0] || null;
}

/* can the demo trade this market now? (the ticket needs a price: W.priceOf -> Live.quote; before the first price answer
   the instrument list decides). FR40 has no price today -> no button, only a grey line */
export function demoOk(sym) {
  if (!sym) return false;
  if (Live.quote(sym)) return true;
  return !Live.loaded() && !!M.get(sym);
}
/* plural-aware "minut" */
const minW = (n) => tp('den.minW', n);
/* the full block of an actionable signal: direction, entry table (or the broker sentence) and the button "Koupit v demo" */
function sigBlock(j, s) {
  const sell = side(s) === 'SELL';
  const v = s.vstup || {};
  const until = ms(v.plati_do) ? F.time(new Date(ms(v.plati_do))) : '–';
  const out = nyClock(s.vystup, s.cas_signalu || j.vytvoreno);
  const entry = sell ? t('den.e.min', { v: px(v.nejniz) }) : t('den.e.max', { v: px(v.nejvys) });
  const btn = demoOk(s.trh)
    ? `<button type="button" class="btn btn-primary btn-block" data-action="den-trade" data-sym="${F.esc(s.trh || '')}" data-side="${sell ? 'SELL' : 'BUY'}" data-sl="${+s.stop || ''}">${icon('spark', 'icon-sm')}<span>${t(sell ? 'den.b.sell' : 'den.b.buy')}</span></button><p class="den-st">${t('den.own')}</p>`
    : `<p class="den-note den-nodemo" data-den-nodemo="1">${t('den.noDemo')}</p>`;
  const title = `<p class="den-sig-t"><span class="${sell ? 'down' : 'up'}">${sell ? '↓' : '↑'} ${t(sell ? 'den.sell' : 'den.buy')}</span><span>${F.esc(mkt(s.trh) !== '–' ? mkt(s.trh) : s.nazev || '–')}</span>${isPB(s) ? pbTag() : ''}</p>${isPB(s) ? `<p class="den-st den-pb-l">${t('den.pb.line')}</p>` : ''}`;
  if (s.stav === 'over_u_brokera') {
    const at = ms(s.cas_signalu);
    const n = Number.isFinite(+s.data_zpozdena_min) ? Math.round(+s.data_zpozdena_min) : 0;
    const p = { at: at ? F.time(new Date(at)) : '–', n, w: minW(n), v: px(sell ? v.nejniz : v.nejvys), until };
    const txt = t(`den.brk${n > 0 ? '' : '0'}.${sell ? 'sell' : 'buy'}`, p);
    return `<div class="den-sig" data-den-sig="${F.esc(s.id || '')}" data-den-state="go" data-den-variant="broker">${title}
    <p class="den-brk">${F.esc(txt)}</p>
    <dl class="den-kv num"><dt>${t('den.k.stop')}</dt><dd>${px(s.stop)}</dd>
      <dt>${t('den.k.exit')}</dt><dd>${F.esc(out ? t('den.exitAt', { v: F.time(out) }) : '–')}</dd></dl>${btn}</div>`;
  }
  return `<div class="den-sig" data-den-sig="${F.esc(s.id || '')}" data-den-state="go">${title}
    <dl class="den-kv num"><dt>${t('den.k.entry')}</dt><dd>${F.esc(entry)}</dd>
      <dt>${t('den.k.until')}</dt><dd>${F.esc(until)}</dd>
      <dt>${t('den.k.stop')}</dt><dd>${px(s.stop)}</dd>
      <dt>${t('den.k.exit')}</dt><dd>${F.esc(out ? t('den.exitAt', { v: F.time(out) }) : '–')}</dd>
      ${ms(s.cas_signalu) ? `<dt>${t('den.k.sent')}</dt><dd>${F.esc(F.time(new Date(ms(s.cas_signalu))))}</dd>` : ''}</dl>
    <p class="den-st tone-up">${t('den.st.plati')}</p>${btn}</div>`;
}
/* "Dnes" body shared by the card and the page: actionable blocks, else at most two grey lines */
function todayBody(j, now) {
  if (!j || !fresh(j, now)) {
    const last = j ? lastOld(j, now) : null;
    return `<p class="den-note" data-den-state="nodata">${t('den.noData')}</p>${last ? `<p class="den-note den-note-2">${F.esc(lastText(last))}</p>` : ''}`;
  }
  if (j.robot?.stav === 'pozastaveno') {
    const why = cs() && j.robot?.duvod_stavu ? t('den.paused', { why: F.human(j.robot.duvod_stavu) }) : t('den.paused0');
    return `<p class="den-note" data-den-state="paused">${F.esc(why)}</p>`;
  }
  const pg = pausedGroups(j);
  const pgHtml = pg.length ? `<p class="den-note den-pg" data-den-paused="${F.esc(pg.join(','))}">${F.esc(t('den.pausedG', { list: pg.map((k) => { const y = arr(j.styly).find((z) => z?.kod === k); return y && arr(y.trhy).length ? `${gName(k)} (${mktList(y.trhy)})` : gName(k); }).join('; ') }))}</p>` : '';
  const xs = arr(j.signaly).map((s) => ({ s, x: sigState(j, s, now) }));
  const go = xs.filter((o) => o.x.code === 'go');
  const rest = xs.filter((o) => o.x.code !== 'go' && o.x.today).sort((a, b) => (b.x.at || 0) - (a.x.at || 0));
  /* 1.15.3: up to four of today's signals (the playbook can give four a day), the rest behind "a další N" -> #/den */
  const goShown = go.slice(0, TODAY_CAP);
  const restShown = rest.slice(0, Math.max(0, TODAY_CAP - goShown.length));
  const more = go.length + rest.length - goShown.length - restShown.length;
  let html = goShown.map((o) => sigBlock(j, o.s)).join('');
  html += todayLines(restShown, goShown.length > 0);
  if (more > 0) html += `<p class="den-note den-more-n"><a href="#/den">${F.esc(tp('den.moreN', more))}${icon('chev-right', 'icon-xs')}</a></p>`;
  if (!go.length && !rest.length) {
    const last = lastOld(j, now);
    html = `<p class="den-note" data-den-state="none">${t('den.none')}</p>${last ? `<p class="den-note den-note-2">${F.esc(lastText(last))}</p>` : ''}`;
  }
  return pgHtml + html;
}
function headHtml(link = true) {
  const name = `<span>${t('den.h')}</span><span class="den-badge">${t('den.badge')}</span>`;
  return `<p class="den-h">${link ? `<a href="#/den">${name}${icon('chev-right', 'icon-xs')}</a>` : name}<button type="button" class="den-q" data-action="den-help" aria-label="${F.esc(t('den.helpAria'))}">?</button></p>
    <p class="den-warn">${icon('alert', 'icon-xs')}<span>${t('den.label')}</span></p>`;
}

/* the Dnes card (always below the tested signals) */
export function cardHtml(now = D.clock()) {
  const j = st.j;
  if (!st.tried) return `<section class="den-card is-quiet" id="den-card" aria-label="${F.esc(t('den.h'))}">${headHtml()}<p class="den-off">${t('common.loading')}</p></section>`;
  try {
    const body = todayBody(j, now);
    const live = body.includes('data-den-state="go"');
    return `<section class="den-card${live ? '' : ' is-quiet'}" id="den-card" aria-label="${F.esc(t('den.h'))}">${headHtml()}${j ? `<p class="den-res">${F.esc(resultLine(j))}</p>` : ''}${body}</section>`;
  } catch {
    return `<section class="den-card is-quiet" id="den-card">${headHtml()}<p class="den-off">${t('den.noData')}</p></section>`;
  }
}

/* Dnes mount: load once, then patch the card in place (no re-render of Dnes) */
export function mount(el) {
  const paint = () => { const c = el.querySelector('#den-card'); if (c && el.isConnected) c.outerHTML = cardHtml(D.clock()); };
  load().then(paint).catch(() => {});
  if (!Live.loaded()) { const off = Live.onLive(() => { if (!Live.loaded()) return; off(); if (el.isConnected && st.tried) paint(); }); setTimeout(off, 120000); }
  const iv = setInterval(() => { if (!el.isConnected) { clearInterval(iv); return; } load(true).then(paint).catch(() => {}); }, 5 * 60000);
}

/* ---------- #/den ---------- */
const ul = (a) => { const l = arr(a).filter((x) => x != null && String(x).trim()); return l.length ? `<ul class="den-ul">${l.map((x) => `<li>${hum(x)}</li>`).join('')}</ul>` : '<p>–</p>'; };
/* "Proč nahoru: a; b; c" -> sub-heading + bullets; the internal score line ("Převaha: W = …") is hidden */
function whyBlocks(lines) {
  return arr(lines).map((ln) => {
    const s = String(ln || '').trim();
    if (!s || /^Převaha\s*:/i.test(s) || /\bW\s*=\s*[-−]?\d/.test(s)) return '';
    const m = /^([^:;]{3,40}):\s*(.+)$/.exec(s);
    if (m && /^Proč(\s|$)/i.test(m[1])) {
      const items = m[2].split(/;\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ0-9])/).filter(Boolean);
      return `<p class="den-sub">${hum(m[1])}</p>${ul(items)}`;
    }
    return `<p>${hum(s)}</p>`;
  }).join('');
}
function whyHtml(j, s0) {
  const a = s0?.pro_cloveka?.a_fundament_trhu;
  if (a && typeof a === 'object') {
    const part = (k, lbl) => (a[k] == null ? '' : `<p class="den-sub2">${t(lbl)}</p>${Array.isArray(a[k]) ? whyBlocks(a[k]) : `<p>${hum(a[k])}</p>`}`);
    return part('dnes', 'den.w.dnes') + part('tydny', 'den.w.tydny') + part('mesice', 'den.w.mesice') + (a.souhrn ? `<p><b>${t('den.w.souhrn')}</b> ${hum(a.souhrn)}</p>` : '');
  }
  const r = j.rezim_trhu || {};
  return `<p class="den-sub">${t('den.w.up')}</p>${ul(arr(r.nahoru?.dnes).slice(0, 6))}<p class="den-sub">${t('den.w.down')}</p>${ul(arr(r.dolu?.dnes).slice(0, 6))}`;
}
/* the robot's own Czech commentary: why the market, technique, entry, the robot's note */
function commentary(j, s0) {
  const pc = s0?.pro_cloveka || null;
  const tech = pc && arr(pc.b_technika).length ? ul(pc.b_technika) : ul(arr(j.hlidam).map((h) => h?.text));
  return `<h3>${t('den.s.why')}</h3>${whyHtml(j, s0)}
    <h3>${t('den.s.tech')}</h3>${tech}
    ${pc?.c_vstup ? `<h3>${t('den.s.entry')}</h3><p>${hum(pc.c_vstup)}</p>` : ''}
    ${j.robot?.upozorneni ? `<h3>${t('den.s.note')}</h3><p>${hum(j.robot.upozorneni)}</p>` : ''}`;
}
/* structured facts of one signal (translated keys only) */
function factsHtml(j, s, now) {
  const x = sigState(j, s, now);
  const v = s.vstup || {};
  const sell = side(s) === 'SELL';
  const r = +s.vysledek_R;
  const row = (k, val) => `<dt>${k}</dt><dd>${F.esc(val)}</dd>`;
  const at = ms(s.cas_signalu);
  return `<p class="den-sub">${F.esc(`${at ? `${dayLabel(at)} · ` : ''}${mkt(s.trh)} · ${t(sell ? 'den.sell' : 'den.buy')}`)}${isPB(s) ? ` ${pbTag()}` : ''}</p>
    <dl class="den-kv num">${row(t('den.k.sent'), at ? F.time(new Date(at)) : '–')}
      ${row(t('den.k.entry'), sell ? t('den.e.min', { v: px(v.nejniz) }) : t('den.e.max', { v: px(v.nejvys) }))}
      ${row(t('den.k.until'), x.until)}${row(t('den.k.stop'), px(s.stop))}
      ${row(t('den.k.exit'), x.out !== '–' ? t('den.exitAt', { v: x.out }) : '–')}
      ${row(t('den.k.state'), t(`den.o.${x.code}`))}
      ${Number.isFinite(r) && s.vysledek_R != null ? row(t('den.k.R'), `${r > 0 ? '+' : r < 0 ? '−' : ''}${n2(Math.abs(r), 2)} R`) : ''}</dl>
    ${Number.isFinite(r) && s.vysledek_R != null ? `<p class="den-st">${t('den.Rexpl')}</p>` : ''}
    ${isLate(s) ? `<p class="den-st">${t('den.lateExpl')}</p>` : ''}`;
}
/* jistota_pct: 94 -> "94 %", "88–98" -> "88–98 %", a Czech word ("nízká – …") only in Czech */
function certainty(v) {
  if (v == null || v === '') return '–';
  if (Number.isFinite(+v)) return F.pct(+v, 0);
  const r = /^(\d+)\s*[–-]\s*(\d+)$/.exec(String(v).trim());
  if (r) return F.pct(+r[2], 0).replace(/^[^\d]*\d+/, `${r[1]}–${r[2]}`);
  return cs() ? F.human(String(v)) : '–';
}
/* the robot's style groups: order of the markets as the user reads them (USA first) */
const styleLines = (j) => arr(j?.styly).filter((y) => y && y.test).map((y) => `<li>${F.esc(t('den.style', { m: mktList(y.trhy), p: period(y.test.obdobi), pf: n2(y.test.pf, 2), n: y.test.obchodu ?? '–', w: y.test.vyhry_pct != null ? F.pct(+y.test.vyhry_pct, 0) : '–', j: certainty(y.test.jistota_pct) }))}</li>`).join('');

/* the four groups with their state (běží / pozastaveno) – "Pro pokročilé" on #/den */
function groupsHtml(j) {
  const ys = arr(j?.styly).filter((y) => y && y.kod);
  if (!ys.length) return '';
  const pg = pausedGroups(j);
  const li = ys.map((y) => {
    const k = String(y.kod);
    const stv = pg.includes(k) ? 'pozastaveno' : y.stav === 'bezi' || !y.stav ? 'bezi' : String(y.stav);
    const lbl = t(`den.gs.${stv}`) !== `den.gs.${stv}` ? t(`den.gs.${stv}`) : '–';
    return `<li data-den-group="${F.esc(k)}">${F.esc(`${gName(k)} – ${mktList(y.trhy)}: `)}<b class="${stv === 'bezi' ? 'up' : 'down'}">${F.esc(lbl)}</b>${k === 'PB' ? ` ${pbTag()}` : ''}</li>`;
  }).join('');
  return `<h3>${t('den.s.groups')}</h3><ul class="den-ul den-groups">${li}</ul>`;
}
export function render(ctx) {
  const now = ctx.now();
  const j = st.j;
  const sub = arr(j?.robot?.trhy).length ? t('den.sub2', { m: mktList(j.robot.trhy) }) : t('den.sub0');
  const head = `<header class="page-head"><div><a class="back" href="#/dnes">${icon('chev-left', 'icon-xs')}${t('nav.dnes')}</a><h1 class="page-title">${t('den.h')}</h1><p class="page-sub">${F.esc(sub)}</p></div></header>`;
  if (!st.tried) return head + `<p class="den-off">${t('common.loading')}</p>`;
  if (!j) return head + `<section class="den-card den-page is-quiet">${headHtml(false)}<p class="den-note" data-den-state="nodata">${t('den.noData')}</p></section>`;
  try {
    const sigs = arr(j.signaly);
    const s0 = sigs.slice().sort((a, b) => (ms(b?.cas_signalu) || 0) - (ms(a?.cas_signalu) || 0))[0];
    const v = j.vysledek || {}, ts = v.test || {}, pj = v.pojistka || {};
    const row = (k, a1, b1) => `<tr><th>${k}</th><td class="num">${a1}</td><td class="num">${b1}</td></tr>`;
    const resTbl = `<table class="den-tbl"><thead><tr><th></th><th class="num">${t('den.r.now', { d: v.od ? F.dm(v.od) : '–' })}</th><th class="num">${t('den.r.test', { p: period(ts.obdobi) })}</th></tr></thead><tbody>
      ${row(t('den.r.n'), +v.obchodu || 0, ts.obchodu ?? '–')}
      ${row(t('den.r.w'), v.vyhry_pct != null ? F.pct(+v.vyhry_pct, 0) : '–', ts.vyhry_pct != null ? F.pct(+ts.vyhry_pct, 1) : '–')}
      ${row(t('den.r.pf'), v.pf != null ? n2(v.pf, 2) : '–', ts.pf != null ? n2(ts.pf, 2) : '–')}
      ${row(t('den.r.dd'), v.propad_pct != null ? F.pct(-Math.abs(+v.propad_pct), 1) : '–', ts.propad_pct != null ? F.pct(-Math.abs(+ts.propad_pct), 1) : '–')}</tbody></table><p class="den-st">${t('den.r.pfS')}</p>`;
    const styles = styleLines(j);
    const hist = arr(j.historie_poslednich_20);
    const histHtml = hist.length ? `<table class="den-tbl"><tbody>${hist.map((h) => { const r = +h.R; const mm = /(\d{4})(\d{2})(\d{2})/.exec(h?.id || ''); return `<tr><td>${mm ? F.esc(F.dm(`${mm[1]}-${mm[2]}-${mm[3]}`)) : '–'}</td><td>${F.esc(mktName(h.trh))}</td><td>${t(h.smer === 'PRODEJ' ? 'den.sell' : 'den.buy')}</td><td class="num ${r > 0 ? 'up' : r < 0 ? 'down' : ''}">${Number.isFinite(r) && h.R != null ? `${r > 0 ? '+' : r < 0 ? '−' : ''}${n2(Math.abs(r), 2)} R` : '–'}</td></tr>`; }).join('')}</tbody></table><p class="den-st">${t('den.Rexpl')}</p>` : `<p>${t('den.hist0')}</p>`;
    const safe = t('den.safe1', { n: pj.po_obchodech ?? 30, z: pj.zbyva_do_kontroly ?? '–' });
    const comm = commentary(j, s0);
    const body = todayBody(j, now);
    return head + `<div class="den-page">
      <section class="den-card${body.includes('data-den-state="go"') ? '' : ' is-quiet'}">${headHtml(false)}
        <h2 class="den-h2">${t('den.s.what')}</h2><p class="den-p">${F.esc(t('den.what', { m: mktList(j.robot?.trhy) }))}</p>
        <h2 class="den-h2">${t('den.s.today')}</h2>${body}
        <h2 class="den-h2">${t('den.s.res')}</h2><p class="den-p">${F.esc(resultLine(j))}</p><p class="den-st">${F.esc(safe)}</p>
      </section>
      <details class="den-adv card"><summary>${t('den.adv')}</summary>
        ${s0 ? `<h3>${t('den.s.sig')}</h3>${factsHtml(j, s0, now)}` : ''}
        <h3>${t('den.s.resT')}</h3>${resTbl}
        ${groupsHtml(j)}
        ${styles ? `<h3>${t('den.s.styles')}</h3><ul class="den-ul">${styles}</ul>` : ''}
        <h3>${t('den.s.safe')}</h3><p>${F.esc(t('den.safe', { n: pj.po_obchodech ?? 30, pf: n2(pj.pf_min ?? 1, 1), dd: n2(pj.propad_max_pct ?? 10, 0), z: pj.zbyva_do_kontroly ?? '–' }))}</p>
        <h3>${t('den.s.hist')}</h3>${histHtml}
        ${cs() ? comm : `<p class="den-st">${t('den.czNote')}</p><details class="den-cz"><summary>${t('den.czShow')}</summary><div lang="cs">${comm}</div></details>`}
      </details>
      <p class="disclaimer">${icon('info')}${t('den.disc')}</p></div>`;
  } catch {
    return head + `<p class="den-off">${t('den.noData')}</p>`;
  }
}
export function mountPage(el, ctx) {
  if (st.tried && Date.now() - st.at < 120000) return;
  load(true).then(() => { if (el.isConnected) ctx.rerender({ soft: true }); }).catch(() => {});
}

export const actions = {
  'den-help'() {
    const j = st.j;
    const styles = styleLines(j);
    const note = j?.robot?.upozorneni ? (cs() ? `<p class="th-text">${hum(j.robot.upozorneni)}</p>` : `<details class="den-cz"><summary>${t('den.czShow')}</summary><p class="th-text" lang="cs">${hum(j.robot.upozorneni)}</p></details>`) : '';
    openSheet({
      small: true, label: t('den.h'),
      html: `<div class="sheet-head"><div><p class="sheet-title">${t('den.h')} · ${t('den.badge')}</p></div><button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
        <div class="sheet-body"><p class="th-text">${t('den.help1')}</p><p class="th-text">${t('den.help2')}</p>
          <details class="den-more"><summary>${t('den.more')}</summary><p class="th-text">${t('den.r.pfS')}</p>${styles ? `<ul class="den-ul">${styles}</ul>` : ''}${note}</details></div>`,
      onMount(sh) { sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet()); },
    });
  },
  'den-pb'() {
    const y = arr(st.j?.styly).find((z) => z?.kod === 'PB');
    /* the robot's own sentence about the expectation ("… očekávání je kolem nuly …"), else its first sentence */
    const sents = y?.co_cekat ? String(y.co_cekat).split(/(?<=[.!?:])\s+|\s*⚠\s*/).map((x) => x.trim()).filter(Boolean) : [];
    const first = sents.find((x) => /očekáván/i.test(x)) || sents[0] || '';
    const robot = first ? (cs() ? `<p class="th-text den-st">${t('den.pb.robot')} ${hum(first)}</p>` : `<details class="den-cz"><summary>${t('den.czShow')}</summary><p class="th-text" lang="cs">${hum(y.co_cekat)}</p></details>`) : '';
    openSheet({
      small: true, label: t('den.pb.tag'),
      html: `<div class="sheet-head"><div><p class="sheet-title">${t('den.pb.title')}</p></div><button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
        <div class="sheet-body"><p class="th-text">${t('den.pb.line')}</p><p class="th-text">${t('den.pb.more')}</p>${robot}</div>`,
      onMount(sh) { sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet()); },
    });
  },
  'den-trade'(el, ev, ctx) { ownTicket(ctx, el.dataset.side, el.dataset.sym, { sl: +el.dataset.sl || null, tp: null }); },
};
