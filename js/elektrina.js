// 1.16.0 "Elektřina" – the EXPERIMENTAL quarter-hour robot for Czech electricity (#/elektrina, entry only from Více).
// Data ./data/elektrina.json, written by the robot (ROBOT_ELEKTRINA/el_bot.py, beh() "výstup"). Paper only, never mixed with
// the tested signals, the daily robot or Výsledky. Everything is guarded: the file may be absent (404), old, half-filled or
// broken – the page never breaks because of it.
// Time rules: a signal is offered only while the robot runs, the file is younger than 20 minutes and the DEVICE clock is
// before its plati_do (the file's own "stav" is from the moment it was written, so the clock may only move a signal on).
// Repaints: ONE timer (a 15 s tick) however often the page is painted. It patches the countdown in place, fetches the
// file every 90 s, and asks for a repaint only when something visible changed – through the app's guarded automatic
// repaint (never under a finger, the reading place is kept, the same HTML paints nothing). It removes itself once the
// page is left.
import * as F from './format.js';
import { t, lang, tag } from './i18n/index.js';
import { icon } from './ui.js';

const URL0 = './data/elektrina.json';
const STALE_MS = 20 * 60000;     // older file -> "data are old", no signal offered
const TICK_MS = 15000;           // countdown + "has anything visible changed" check
const FETCH_EVERY = 6;           // fetch the file every 6th tick = 90 s
const QH = 15 * 60000;
const PRG = 'Europe/Prague';

let st = { j: null, txt: null, at: 0, tried: false, code: 0 };
let busy = null;

/* -> true when what the page shows from the file changed (first answer, new content, 404 <-> data) */
export async function load(force = false) {
  if (busy) return busy;
  if (!force && st.tried && Date.now() - st.at < 60000) return false;
  busy = (async () => {
    const before = `${st.tried}|${st.code}|${st.txt}`;
    try {
      const r = await fetch(URL0, { cache: 'no-store' });
      if (r.status === 404) st = { j: null, txt: null, at: Date.now(), tried: true, code: 404 };
      else if (!r.ok) throw new Error(String(r.status));
      else {
        const txt = await r.text();
        if (txt !== st.txt) {
          const j = JSON.parse(txt);
          st = { j: j && typeof j === 'object' && !Array.isArray(j) ? j : null, txt, at: Date.now(), tried: true, code: 200, n: (st.n || 0) + 1 };
        } else st = { ...st, at: Date.now(), tried: true, code: 200 };
      }
    } catch {
      /* network down / broken file: the last good data stay (the age rule says when they are too old) */
      st = st.j ? { ...st, at: Date.now(), tried: true } : { j: null, txt: null, at: Date.now(), tried: true, code: -1 };
    }
    busy = null;
    return `${st.tried}|${st.code}|${st.txt}` !== before;
  })();
  return busy;
}
export const state = () => st;

/* ---------- small helpers ---------- */
const arr = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const fin = (v) => v != null && v !== '' && Number.isFinite(+v);
const cs = () => lang() === 'cs';
const ms = (iso) => { if (!iso) return null; const v = Date.parse(iso); return v > 0 ? v : null; };
const fmtCache = new Map();
const pf = (k, o) => { const key = `${tag()}|${k}`; if (!fmtCache.has(key)) { try { fmtCache.set(key, new Intl.DateTimeFormat(k === 'day' ? 'en-CA' : tag(), { timeZone: PRG, ...o })); } catch { fmtCache.set(key, null); } } return fmtCache.get(key); };
/* "15:00" – the robot's market runs on Prague time, so its times are shown in Prague time */
const hm = (x) => { const f = pf('hm', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return f ? f.format(new Date(x)) : F.time(new Date(x)); };
/* "2026-11-14" – the Prague calendar day of a moment */
const pday = (x) => { const f = pf('day', { year: 'numeric', month: '2-digit', day: '2-digit' }); return f ? f.format(new Date(x)) : F.dayKey(new Date(x)); };
/* "14:45" today, "27. 10. 14:45" on another day */
const when = (x, now) => (pday(x) === pday(now) ? hm(x) : `${F.dm(pday(x))} ${hm(x)}`);
/* "so 14. 11." / "Sat 14 Nov" from a day string */
const dayLbl = (d) => `${F.weekdayShort(d)} ${F.dm(d)}`;
const esc = F.esc;
/* the robot's own (Czech) text: local formats; "−6 788" never breaks after its thousands space */
const hum = (x) => esc(F.human(String(x ?? '')).replace(/(\d) (\d{3})(?!\d)/g, '$1\u00a0$2'));
/* a time span ("15:45–16:00") never breaks across two lines */
const nw = (html) => String(html).replace(/(\d{1,2}:\d{2})\s*–\s*(\d{1,2}:\d{2})/g, '<span class="el-nw">$1–$2</span>');
/* numbers: Czech decimal comma and a real minus (F.num); up to `d` decimals, none when whole */
const nm = (v, d = 1) => F.num(+v, d, 0);
const sgn = (v, d = 1) => (+v > 0 && Math.abs(+v) >= 0.5 * 10 ** -d ? '+' : '') + nm(v, d);
/* "−6 €" / "−€6"; with the plus for results */
const eur = (v, d = 1, plus = true) => {
  if (!fin(v)) return '–';
  const n = nm(Math.abs(+v), d);
  const neg = +v < 0 && n !== nm(0, d);
  const s = neg ? '−' : plus && +v > 0 && n !== nm(0, d) ? '+' : '';
  return cs() ? `${s}${n} €` : `${s}€${n}`;
};
/* "119 €/MWh" / "€119/MWh" */
const eurMwh = (v, d = 1, plus = false) => (fin(v) ? `${eur(v, d, plus)}/MWh` : '–');
const pct = (v) => (fin(v) ? F.pct(+v, 0) : '–');
const tone = (v) => (!fin(v) ? '' : +v > 0 ? 'up' : +v < 0 ? 'down' : '');
function tp(base, n, p = {}) {
  let cat = 'other';
  try { cat = new Intl.PluralRules(cs() ? 'cs' : 'en').select(+n); } catch { /* other */ }
  const k = `${base}.${cat}`;
  return t(t(k) !== k ? k : `${base}.other`, { n, ...p });
}
/* "ještě 12 min" / "ještě 1 h 05 min" / "méně než minuta"; after the end (until the next tick repaints) "vstup skončil" –
   never "ještě 0 min" */
function left(until, now) {
  const d = until - now;
  if (!(d > 0)) return t('el.leftEnd');
  if (d < 60000) return t('el.leftLt1');
  const m = Math.floor(d / 60000);
  if (m < 60) return t('el.leftM', { m });
  return t('el.leftH', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
}

/* ---------- the robot's state at this moment ---------- */
export function isStale(j, now) {
  const g = ms(j?.generated_at);
  return !g || now - g > STALE_MS;
}
const RANK = { plati: 0, dobiha: 1, pozde: 2, bezi_dodavka: 3, ceka_na_cenu_ote: 4, vyhodnoceno: 5 };
const BY_RANK = Object.keys(RANK);
/* the state of one signal now: the later of the file's own state and what the device clock says */
export function sigState(s, now) {
  if (s?.vysledek && typeof s.vysledek === 'object') return 'vyhodnoceno';
  const file = RANK[s?.stav] ?? -1;
  const start = ms(s?.start);
  if (!start) return file >= 0 ? s.stav : 'neznamy';
  const pd = ms(s.plati_do) || start - 45 * 60000;
  const pz = ms(s.pozde_od) || start - 30 * 60000;
  const clock = now >= start + QH ? 4 : now >= start ? 3 : now >= pz ? 2 : now >= pd ? 1 : 0;
  return BY_RANK[Math.max(file, clock)];
}
const robotRuns = (j) => obj(j?.robot).stav === 'bezi';
/* the signals that can be entered NOW: robot runs, fresh file, sent (not a shadow), before plati_do by the device clock */
export function validNow(j, now) {
  if (!j || !robotRuns(j) || isStale(j, now)) return [];
  const seen = new Set();
  return arr(j.signaly_ted).concat(arr(j.signaly)).filter((s) => {
    if (!s || typeof s !== 'object' || s.stin === true || seen.has(s.id)) return false;
    seen.add(s.id);
    const pd = ms(s.plati_do);
    return !!pd && now < pd && sigState(s, now) === 'plati';
  }).sort((a, b) => (ms(a.start) || 0) - (ms(b.start) || 0));
}
const yellow = (j) => obj(j?.robot).pasmo === 'zlute' || obj(obj(j?.vysledek_na_papire).S4).pasmo === 'zlute';
const sell = (s) => s?.smer !== 'long';

/* ---------- a) Co teď ---------- */
/* "(13:30–14:30)" from the robot's sentence – the four known quarter-hours behind the signal */
const knownSpan = (s) => { const m = /\((\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})\)/.exec(String(s?.veta || '')); return m ? { a: m[1], b: m[2] } : null; };
function whyLine(s) {
  const mw = arr(s.zname_ctvrthodiny_mw).filter(fin).slice().reverse().map((v) => `${sgn(v, 0)}`).join(', ');
  const sp = knownSpan(s);
  const k = `el.why.${sell(s) ? 'sell' : 'buy'}${sp ? '' : '0'}`;
  return t(k, { a: sp?.a, b: sp?.b, mw: mw ? `${mw} MW` : '–' });
}
/* v4: the price from the live order book (kniha nabídek) – what 1 MW could be sold (bought) for now / when the signal came.
   The approximate limit is NOT advice any more: it only sits in the closed "Odkud je ta cena" as "for orientation". */
const bookTime = (c) => { if (!c) return ''; const m = /^(\d{1,2}:\d{2})/.exec(String(c)); if (m) return m[1]; const x = ms(c); return x ? hm(x) : ''; };
function priceLine(j, s) {
  const kt = obj(s.kniha_ted), kp = obj(s.kniha_pri_signalu);
  const runs = obj(j.data).ziva_kniha_bezi;
  const side = sell(s) ? 'sell' : 'buy';
  if (fin(kt.cena_1mw)) {
    const c = bookTime(kt.cas);
    return { has: true, txt: t(`el.px.now.${side}`, { v: eurMwh(kt.cena_1mw, 1) }), small: c ? t('el.px.at', { t: c }) : '' };
  }
  if (fin(kp.cena_1mw)) {
    const c = bookTime(kp.cas);
    return { has: true, txt: t(`el.px.sig.${side}`, { v: eurMwh(kp.cena_1mw, 1) }), small: c ? t('el.px.at', { t: c }) : '' };
  }
  if (runs === true) return { has: false, txt: t(`el.px.none.${side}`), small: '' };
  return { has: false, txt: t('el.px.noBook'), small: '' };
}
/* the robot's orientation sentence, closed, titled "for orientation (not tested)" (Czech only – in English it is in the robot's notes) */
function priceInfo(s) {
  if (!cs() || !s.cena_orientacne) return '';
  return `<details class="el-more" data-el-k="price"${isOpen('price', false) ? ' open' : ''}><summary>${t('el.priceFrom')}</summary><p class="el-k2">${t('el.priceOrient')}</p><p class="el-small">${hum(s.cena_orientacne)}</p></details>`;
}
function sigHead(s, now) {
  const st0 = ms(s.start);
  const other = st0 && pday(st0) !== pday(now) ? ` (${dayLbl(s.den || pday(st0))})` : '';
  return t(sell(s) ? 'el.do.sell' : 'el.do.buy', { q: `${s.ctvrthodina || '–'}${other}` });
}
function nowCard(j, now) {
  const stale = isStale(j, now);
  const r = obj(j.robot);
  const pc = String(j.pro_cloveka || '').trim();
  const g = ms(j.generated_at);
  const sub = (txt) => (txt ? `<p class="el-sub">${txt}</p>` : '');
  const robotSays = (fallbackKey) => (cs() && pc ? sub(hum(pc)) : sub(esc(t(fallbackKey))));
  let big, body = '', cls = 'is-quiet';
  if (stale) {
    big = esc(t('el.now.stale', { t: g ? hm(g) : '–' }));
    body = sub(esc(g ? t('el.now.staleS', { d: dayLbl(pday(g)), t: hm(g) }) : t('el.now.staleS0')));
  } else if (r.stav === 'bez_dat') {
    big = esc(t('el.now.nothing')); body = robotSays('el.now.noDataS');
  } else if (r.stav === 'pozastaveno') {
    /* after the review: a plain sentence in the big card; the robot's own raw sentence (profit against loss …) closed */
    big = esc(t('el.now.paused')); body = sub(esc(t('el.now.pausedS')));
    if (cs() && pc) body += `<details class="el-more" data-el-k="paused"${isOpen('paused', false) ? ' open' : ''}><summary>${t('el.res.more')}</summary><p class="el-small">${hum(pc)}</p></details>`;
  } else if (r.stav === 'vypnuto') {
    big = esc(t('el.now.off')); body = cs() && pc && pc !== 'Robot je ručně vypnutý.' ? sub(hum(pc)) : '';
  } else if (r.stav !== 'bezi') {
    big = esc(t('el.now.nothing')); body = cs() && pc ? sub(hum(pc)) : '';
  } else {
    const v = validNow(j, now);
    if (v.length) {
      const s = v[0];
      const pd = ms(s.plati_do);
      cls = 'is-go';
      big = `<span class="${sell(s) ? 'down' : 'up'}">${nw(esc(sigHead(s, now)))}</span>`;
      const px = priceLine(j, s);
      body = `<p class="el-lim num">${esc(px.txt)}</p>${px.small ? `<p class="el-small el-book">${esc(px.small)}</p>` : ''}
        <p class="el-until"><b class="num">${esc(t('el.until', { t: hm(pd) }))}</b> · <span class="num" data-el-until="${pd}">${esc(left(pd, now))}</span></p>
        <p class="el-why">${nw(esc(whyLine(s)))}</p>
        <p class="el-small el-units">${esc(t('el.units'))}</p>
        <p class="el-tagline">${icon('alert', 'icon-xs')}<span>${esc(cs() && s.stitek ? s.stitek : t('el.sigTag'))}</span></p>
        ${priceInfo(s)}
        ${v.slice(1).map((x) => { const p2 = priceLine(j, x); return `<p class="el-also num">${nw(esc(t(p2.has ? 'el.also' : 'el.also0', { what: sigHead(x, now), lim: p2.txt, t: hm(ms(x.plati_do)) })))}</p>`; }).join('')}`;
    } else {
      big = esc(t('el.now.nothing'));
      body = sub(esc(t('el.now.wait')));
      /* a signal whose entry just ended: say so, so nobody enters late – about the NEWEST one (the one seen last) */
      const late = arr(j.signaly).filter((s) => s && !s.stin && ['dobiha', 'pozde'].includes(sigState(s, now))).sort((a, b) => (ms(b.start) || 0) - (ms(a.start) || 0))[0];
      if (late) body += `<p class="el-late">${nw(esc(t('el.now.late', { q: late.ctvrthodina || '–', t: ms(late.plati_do) ? hm(ms(late.plati_do)) : '–' })))}</p>`;
    }
  }
  const warnY = !stale && r.stav === 'bezi' && yellow(j) ? `<p class="el-yellow" role="note">${icon('alert', 'icon-xs')}<span><b>${esc(t('el.yellowH'))}</b> ${esc(t('el.yellow'))}</span></p>` : '';
  /* v4: the safety stop can hold while the robot has no data (stav bez_dat, pasmo pozastaveno) – say it once */
  const pausedToo = !stale && r.stav !== 'pozastaveno' && (r.pasmo === 'pozastaveno' || obj(obj(j.vysledek_na_papire).S4).pasmo === 'pozastaveno') ? `<p class="el-late">${esc(t('el.pausedToo'))}</p>` : '';
  return `<section class="card el-card el-now ${cls}" id="el-now" aria-labelledby="el-now-h">
    <h2 class="el-h" id="el-now-h">${t('el.q.now')}</h2>
    <p class="el-big">${big}</p>${body}${pausedToo}${warnY}</section>`;
}

/* ---------- b) Jak je na tom soustava ---------- */
function gridCard(j, now) {
  const so = obj(j.soustava);
  const q = arr(so.posledni_ctvrthodiny_mw).filter((x) => x && fin(x.mw)).slice(-8);
  const lm = ms(so.posledni_minuta);
  let chart;
  if (!q.length) chart = `<p class="el-sub">${t('el.grid.none')}</p>`;
  else {
    const max = Math.max(1, ...q.map((x) => Math.abs(+x.mw)));
    const H = 56;
    const col = (x) => {
      const v = +x.mw;
      const h = Math.max(2, Math.round((Math.abs(v) / max) * H));
      const lab = `<span class="el-bv num">${esc(sgn(v, 0))}</span>`;
      const bar = `<i class="el-bi ${v >= 0 ? 'is-plus' : 'is-minus'}" style="height:${h}px"></i>`;
      return `<div class="el-col" role="listitem" aria-label="${esc(t('el.grid.aria', { t: x.od || '–', v: sgn(v, 0) }))}">
        <div class="el-half el-top">${v >= 0 ? lab + bar : ''}</div><div class="el-half el-bot">${v < 0 ? bar + lab : ''}</div>
        <span class="el-bt num">${esc(x.od || '–')}</span></div>`;
    };
    /* a side with no bar shrinks to the height of a label (all-shortage hours do not leave an empty half) */
    const up = q.some((x) => +x.mw >= 0), dn = q.some((x) => +x.mw < 0);
    chart = `<div class="el-bars${up ? '' : ' no-up'}${dn ? '' : ' no-dn'}" role="list">${q.map(col).join('')}</div>
      <p class="el-legend"><span><i class="el-dot is-plus"></i>${t('el.grid.plus')}</span><span><i class="el-dot is-minus"></i>${t('el.grid.minus')}</span></p>`;
  }
  /* "today" is the robot's day: an old file says which day it was */
  const g = ms(j.generated_at);
  const sameDay = !!g && pday(g) === pday(now);
  const pB = `<b class="num">${esc(pct(so.dnes_v_nedostatku_pct))}</b>`;
  const pctN = fin(so.dnes_v_nedostatku_pct) ? `<p class="el-p">${sameDay ? t('el.grid.today', { p: pB }) : t('el.grid.day', { d: esc(g ? dayLbl(pday(g)) : '–'), p: pB })}</p>` : '';
  return `<section class="card el-card" id="el-grid" aria-labelledby="el-grid-h">
    <h2 class="el-h" id="el-grid-h">${t('el.q.grid')}</h2>
    <p class="el-small">${t('el.grid.read')}${lm ? ` ${esc(t('el.grid.at', { t: when(lm, now) }))}` : ''}</p>
    ${chart}${pctN}</section>`;
}

/* ---------- c) Jak se robotovi daří ---------- */
function statLine(x) {
  const n = +x.obchodu || 0;
  /* no win (or no loss) yet: say it in words, never a lone dash that reads like a minus */
  const w = fin(x.prum_vyhra_eur_mwh) ? t('el.res.aw', { v: eurMwh(x.prum_vyhra_eur_mwh, 1, true) }) : t('el.res.aw0');
  const l = fin(x.prum_ztrata_eur_mwh) ? t('el.res.al', { v: eurMwh(x.prum_ztrata_eur_mwh, 1, true) }) : t('el.res.al0');
  return t('el.res.line', { n: tp('el.trades', n), w: pct(x.vyher_pct), aw: w, al: l });
}
function resCard(j, now) {
  const R = obj(obj(j.vysledek_na_papire).S4);
  const p = obj(R.prisne), o = obj(R.optimisticky);
  const od = obj(j.robot).od;
  const since = od ? `<p class="el-small">${esc(t('el.res.since', { d: F.dmy(od) }))}</p>` : '';
  const dir = R.predbezne_smer_trefen ? (() => { const m = /(\d+)\s*z\s*(\d+)/.exec(String(R.predbezne_smer_trefen)); return m ? t('el.res.dir', { a: m[1], b: m[2] }) : ''; })() : '';
  const today = obj(R.dnes);
  const g = ms(j.generated_at);
  const todayL = +today.signalu > 0 && g && pday(g) === pday(now) ? `<p class="el-small">${esc(t('el.res.today', { n: tp('el.sigs', +today.signalu), u: +today.uz_probehlo || 0, h: +today.smer_trefen || 0 }))}</p>` : '';
  /* v4: the main number is the result at REAL prices (S4.hlavni: the order book, else the trade tape); the rough
     estimates (prisne / optimisticky) and "could not enter" go into a closed "Podrobnosti". An older file without
     "hlavni" shows its rough strict estimate, labelled as such. */
  const v4 = R.hlavni && typeof R.hlavni === 'object';
  const H = v4 ? obj(R.hlavni) : p;
  const sh = obj(obj(R.vcetne_stinu_po_pozastaveni)[v4 ? 'hlavni' : 'prisne']);
  const shL = +sh.obchodu > 0 ? `<p class="el-small">${esc(t('el.res.shadow', { v: eur(sh.soucet_eur_na_1mw, 0), n: tp('el.trades', +sh.obchodu) }))}</p>` : '';
  const dirL = dir ? `<p class="el-small">${esc(dir)}</p>` : '';
  let main;
  /* "no result yet – the price comes in 1–3 days" only when a signal was ever given; before the first one: "no signal yet" */
  const given = fin(R.signalu_celkem) ? +R.signalu_celkem > 0 : arr(j.signaly).length > 0;
  if (!(+H.obchodu > 0)) {
    main = `<p class="el-p el-wait">${t(given ? 'el.res.none' : 'el.res.noSig')}</p>${dirL}`;
  } else {
    const pfx = fin(H.zisk_proti_ztrate) ? `<p class="el-small">${esc(t('el.res.pf', { v: F.num(+H.zisk_proti_ztrate, 2) }))}</p>` : '';
    const src = v4 && (fin(R.hlavni_z_knihy) || fin(R.hlavni_z_pasky)) ? `<p class="el-small">${esc(t('el.res.src', { k: +R.hlavni_z_knihy || 0, p: +R.hlavni_z_pasky || 0 }))}</p>` : '';
    main = `<p class="el-k">${t(v4 ? 'el.res.real' : 'el.res.strict')}</p>
      <p class="el-num num ${tone(H.soucet_eur_na_1mw)}">${esc(eur(H.soucet_eur_na_1mw, 0))}<small>${t('el.res.per1')}</small></p>${src}
      <p class="el-p num">${esc(statLine(H))}</p><p class="el-small el-unit">${t('el.res.unitS')}</p>${pfx}${dirL}${shL}`;
  }
  /* "Pro srovnání": the two simple rules, priced the same way as the signals (by the tape) – only with trades */
  const L = obj(j.latky_od_startu);
  const ls = obj(obj(L.setrvacnost).podle_pasky), ll = obj(obj(L.vzdy_long).podle_pasky);
  const cmp = [+ls.obchodu > 0 && fin(ls.soucet_eur_na_1mw) ? t('el.cmp.same', { v: eur(ls.soucet_eur_na_1mw, 0) }) : '', +ll.obchodu > 0 && fin(ll.soucet_eur_na_1mw) ? t('el.cmp.long', { v: eur(ll.soucet_eur_na_1mw, 0) }) : ''].filter(Boolean);
  const cmpL = cmp.length ? `<p class="el-small el-cmp"><b>${t('el.cmp.h')}</b> ${esc(cmp.join(' · '))}</p>` : '';
  /* Podrobnosti: rough estimates, could-not-enter, units */
  const rough = (x, k) => (+obj(x).obchodu > 0 ? `<p class="el-small num"><b>${t(k)}:</b> <b class="${tone(x.soucet_eur_na_1mw)}">${esc(eur(x.soucet_eur_na_1mw, 0))}</b> ${esc(t('el.res.per1s'))} · ${esc(statLine(x))}</p>` : '');
  const det = v4 ? `${rough(p, 'el.res.roughS')}${rough(o, 'el.res.roughB')}${fin(R.neslo_vstoupit) ? `<p class="el-small">${esc(t('el.res.noEntry', { n: +R.neslo_vstoupit }))}</p>` : ''}`
    : rough(o, 'el.res.better');
  const more = `<details class="el-more" data-el-k="resmore"${isOpen('resmore', false) ? ' open' : ''}><summary>${t('el.res.more')}</summary>${det}<p class="el-small el-unit">${t('el.res.unit')}</p></details>`;
  const test = cs() && R.z_testu ? `<details class="el-more" data-el-k="test"${isOpen('test', false) ? ' open' : ''}><summary>${t('el.res.test')}</summary><p class="el-small">${hum(R.z_testu)}</p></details>` : '';
  return `<section class="card el-card" id="el-res" aria-labelledby="el-res-h">
    <h2 class="el-h" id="el-res-h">${t('el.q.res')}</h2>${since}${main}${todayL}${cmpL}${more}${test}</section>`;
}

/* ---------- d) Signály (last 7 days, by day) ---------- */
function rowState(s, now, offered) {
  const k = sigState(s, now);
  const v = obj(s.vysledek);
  /* v4: no trade in the entry window and no order-book price -> it could not be entered (never a result) */
  const noEntry = obj(s.okno_vstupu).obchodu === 0 && !fin(obj(s.kniha_pri_signalu).cena_1mw);
  if (k === 'vyhodnoceno') {
    if (fin(v.eur_na_1mw_hlavni)) {
      const src = v.hlavni_zdroj === 'kniha' || v.hlavni_zdroj === 'paska' ? t(`el.src.${v.hlavni_zdroj}`) : '';
      return { k, txt: t('el.st.res', { v: eur(v.eur_na_1mw_hlavni, 1) }), tone: tone(v.eur_na_1mw_hlavni), src };
    }
    if (noEntry) return { k: 'neslo', txt: t('el.st.noEntry'), tone: '' };
    const rough = fin(v.eur_na_1mw_prisne) ? t('el.st.rough', { v: eur(v.eur_na_1mw_prisne, 1) }) : '';
    /* v4 file: the real price is still missing; an older file never had one - its rough estimate is all there is */
    if ('eur_na_1mw_hlavni' in v) return { k, txt: t('el.st.waitReal'), tone: '', src: rough };
    return rough ? { k, txt: rough, tone: '' } : { k, txt: t('el.st.done'), tone: '' };
  }
  if (noEntry && RANK[k] >= RANK.bezi_dodavka) return { k: 'neslo', txt: t('el.st.noEntry'), tone: '' };
  /* "valid" in green only when the page really offers it (robot runs, fresh data, sent); otherwise a plain note */
  if (k === 'plati') return offered.has(s.id) ? { k, txt: t('el.st.plati', { t: ms(s.plati_do) ? hm(ms(s.plati_do)) : '–' }), tone: 'go' }
    : { k, txt: t('el.st.platiNo', { t: ms(s.plati_do) ? hm(ms(s.plati_do)) : '–' }), tone: '' };
  if (k === 'dobiha') return { k, txt: t('el.st.dobiha', { t: ms(s.plati_do) ? hm(ms(s.plati_do)) : '–' }), tone: '' };
  if (k === 'pozde') return { k, txt: t('el.st.pozde'), tone: '' };
  if (k === 'bezi_dodavka') return { k, txt: t('el.st.bezi'), tone: '' };
  if (k === 'ceka_na_cenu_ote') {
    const h = obj(s.predbezne).smer_trefen;
    return { k, txt: t(h === true ? 'el.st.cekaHit' : h === false ? 'el.st.cekaMiss' : 'el.st.ceka'), tone: '' };
  }
  return { k, txt: '–', tone: '' };
}
function sigList(j, now) {
  const today = pday(now);
  const offered = new Set(validNow(j, now).map((s) => s.id));
  const days = new Map();
  arr(j.signaly).filter((s) => s && typeof s === 'object').forEach((s) => {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(s.den || '')) ? s.den : (ms(s.start) ? pday(ms(s.start)) : '');
    if (!d) return;
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(s);
  });
  const keys = [...days.keys()].sort().reverse();
  if (!keys.length) {
    return `<section class="card el-card" id="el-sig" aria-labelledby="el-sig-h"><h2 class="el-h" id="el-sig-h">${t('el.q.sig')}</h2><p class="el-sub">${t('el.sig.none')}</p></section>`;
  }
  const block = (d) => {
    const l = days.get(d).slice().sort((a, b) => (ms(b.start) || 0) - (ms(a.start) || 0));
    const sent = l.filter((s) => !s.stin);
    /* v4: the day's sum from the main number (real prices); an older file without it: its rough strict estimate */
    const old = !sent.some((s) => 'eur_na_1mw_hlavni' in obj(s.vysledek));
    const fld = old ? 'eur_na_1mw_prisne' : 'eur_na_1mw_hlavni';
    const done = sent.filter((s) => fin(obj(s.vysledek)[fld]));
    const sum = done.reduce((a, s) => a + +s.vysledek[fld], 0);
    const shadows = l.length - sent.length;
    const parts = [tp('el.sigs', l.length)];
    if (done.length) parts.push(t(old ? 'el.sig.sumRough' : 'el.sig.sum', { v: eur(Math.round(sum * 10) / 10, 1), n: done.length }));
    else if (sent.length) parts.push(t('el.sig.noSum'));
    if (shadows) parts.push(tp('el.sig.shadowN', shadows));
    const rows = l.map((s) => {
      const x = rowState(s, now, offered);
      return `<li class="el-row${s.stin ? ' is-shadow' : ''}" data-el-st="${esc(x.k)}"><span class="el-rq num">${esc(s.ctvrthodina || '–')}<small>${t(sell(s) ? 'el.sell' : 'el.buy')}</small></span>
        <span class="el-rs ${x.tone ? `is-${x.tone}` : ''}">${esc(x.txt)}${x.src ? `<small class="el-src">${esc(x.src)}</small>` : ''}${s.stin ? `<em class="el-shadow">${t('el.sig.shadow')}</em>` : ''}</span></li>`;
    }).join('');
    const key = `d${d}`;
    const open = isOpen(key, d === today);
    return `<details class="el-day" id="el-day-${esc(d)}" data-el-k="${esc(key)}"${open ? ' open' : ''}><summary><span class="el-dl">${esc(d === today ? t('el.today', { d: dayLbl(d) }) : dayLbl(d))}</span><span class="el-ds num">${esc(parts.join(' · '))}</span></summary>
      <ul class="el-rows">${rows}</ul></details>`;
  };
  return `<section class="card el-card" id="el-sig" aria-labelledby="el-sig-h"><h2 class="el-h" id="el-sig-h">${t('el.q.sig')}</h2>
    <p class="el-small">${t('el.sig.read')}</p>${keys.map(block).join('')}</section>`;
}

/* ---------- e) Jak to číst · Na co si dát pozor · data ---------- */
function infoCard(j, now) {
  const D0 = obj(j.data), so = obj(j.soustava), r = obj(j.robot);
  const zt = String(obj(obj(j.vysledek_na_papire).S4).z_testu || '').trim();
  /* the test sentence is in its own closed block "Z testu na starších datech" – not a second time here */
  const ups = arr(j.upozorneni).filter((x) => x != null && String(x).trim() && String(x).trim() !== zt);
  const own = `<ul class="den-ul">${['q', 'sign', 'unit', 'book', 'two', 'shadow', 'src'].map((k) => `<li>${t(`el.read.${k}`)}</li>`).join('')}</ul>`;
  const read = `<details class="el-more" data-el-k="read"${isOpen('read', false) ? ' open' : ''}><summary>${t('el.s.read')}</summary>${own}${cs() && j.jak_cist ? `<p class="el-small">${hum(j.jak_cist)}</p>` : ''}</details>`;
  const warn = `<details class="el-more" data-el-k="warn"${isOpen('warn', false) ? ' open' : ''}><summary>${t('el.s.warn')}</summary>
    ${cs() ? `${ups.length ? `<ul class="den-ul">${ups.map((x) => `<li>${hum(x)}</li>`).join('')}</ul>` : ''}${r.pojistka ? `<p class="el-small">${hum(r.pojistka)}</p>` : ''}` : `<ul class="den-ul">${['paper', 'price', 'risk', 'legal'].map((k) => `<li>${t(`el.warn.${k}`)}</li>`).join('')}</ul>`}</details>`;
  /* English: every sentence the robot wrote (Czech only) behind ONE closed block */
  /* pro_cloveka already carries the sentences of the valid signals: only their orientation price is added; every
     sentence once */
  const czLines = [...new Set([j.pro_cloveka, ...validNowCache.map((s) => s.cena_orientacne), zt, j.jak_cist, ...ups, r.pojistka]
    .filter((x) => x != null && String(x).trim()).map((x) => String(x).trim()))];
  const cz = !cs() && czLines.length ? `<details class="den-cz el-more" data-el-k="cz"${isOpen('cz', false) ? ' open' : ''}><summary>${t('el.czShow')}</summary><div lang="cs">${czLines.map((x) => `<p class="el-small">${hum(x)}</p>`).join('')}</div></details>` : '';
  const lm = ms(so.posledni_minuta), g = ms(j.generated_at);
  const book = typeof D0.ziva_kniha_bezi === 'boolean' ? t('el.data.book', { v: t(D0.ziva_kniha_bezi ? 'el.yes' : 'el.no') }) : '';
  const dl = [lm ? t('el.data.ceps', { t: when(lm, now) }) : '', D0.ote_ceny_do ? t('el.data.ote', { d: F.dm(D0.ote_ceny_do) }) : '', book].filter(Boolean).join(' · ');
  const made = g ? t('el.data.made', { t: `${F.dm(pday(g))} ${hm(g)}` }) : '';
  return `<section class="card el-card el-info" id="el-info">${read}${warn}${cz}${dl ? `<p class="el-data num">${esc(dl)}</p>` : ''}${made ? `<p class="el-data num">${esc(made)}</p>` : ''}</section>`;
}

/* details the user opened or closed stay so across automatic repaints */
const opened = new Map();
const isOpen = (k, def) => (opened.has(k) ? opened.get(k) : def);
let validNowCache = [];

/* ---------- the page ---------- */
/* the test sentence under the label only with a fresh file of a robot that runs or is paused – never next to "not running",
   old data or no data, and worded as a test result (not as today's result) */
const badge = (j, now) => {
  const zero = j && !isStale(j, now) && ['bezi', 'pozastaveno'].includes(obj(j.robot).stav) ? `<p class="el-zero">${t('el.zero')}</p>` : '';
  return `<p class="el-badge"><span class="den-badge">${t('el.badge')}</span><span class="el-badge-s">${t('el.badgeS')}</span></p>${zero}`;
};
export function render(ctx) {
  const now = +ctx.now();
  const head = `<header class="page-head"><div><a class="back" href="#/vice">${icon('chev-left', 'icon-xs')}${t('nav.vice')}</a><h1 class="page-title">${t('el.title')}</h1><p class="page-sub">${t('el.sub')}</p></div></header>`;
  const wrap = (inner, j = null) => `${head}<div class="el-page" id="el-page">${badge(j, now)}${inner}<p class="disclaimer">${icon('info')}${t('el.disc')}</p></div>`;
  lastKey = keyOf(now);
  if (!st.tried) return wrap(`<section class="card el-card is-quiet" id="el-now"><p class="el-sub" id="el-loading">${t('common.loading')}</p></section>`);
  const j = st.j;
  if (!j) {
    const k = st.code === 404 ? 'el.none404' : 'el.noneErr';
    return wrap(`<section class="card el-card el-now is-quiet" id="el-now"><h2 class="el-h">${t('el.q.now')}</h2><p class="el-big">${t(k)}</p><p class="el-sub">${t(`${k}S`)}</p></section>`);
  }
  try {
    validNowCache = validNow(j, now);
    return wrap(nowCard(j, now) + gridCard(j, now) + resCard(j, now) + sigList(j, now) + infoCard(j, now), j);
  } catch {
    return wrap(`<section class="card el-card el-now is-quiet" id="el-now"><h2 class="el-h">${t('el.q.now')}</h2><p class="el-big">${t('el.noneErr')}</p><p class="el-sub">${t('el.noneErrS')}</p></section>`);
  }
}

/* what decides the painted page besides the clock text: the file, its age, the offered signals and every row's state */
let lastKey = '';
function keyOf(now) {
  const j = st.j;
  if (!st.tried || !j) return `${st.tried}|${st.code}`;
  let rows = '';
  try { rows = arr(j.signaly).map((s) => sigState(s, now)).join(','); } catch { rows = 'x'; }
  return `${st.code}|${st.n}|${j.generated_at}|${isStale(j, now)}|${validNow(j, now).map((s) => s.id).join(',')}|${rows}`;
}

let timer = null;
let ticks = 0;
export function mount(el, ctx, repaint) {
  /* details opened / closed by the user are remembered (their elements are new after every paint) */
  el.querySelectorAll('details[data-el-k]').forEach((d) => d.addEventListener('toggle', () => { opened.set(d.dataset.elK, d.open); }));
  const changedPaint = () => { if (document.getElementById('el-page')) repaint(); };
  /* the first answer replaces only "Načítám…" – painted at once (nothing to protect under a finger); later news waits */
  const firstPaint = () => { if (document.getElementById('el-loading')) ctx.rerender({ soft: true }); else changedPaint(); };
  if (!st.tried || Date.now() - st.at > 60000) load(true).then((ch) => { if (ch) firstPaint(); }).catch(() => {});
  if (!timer) {
    ticks = 0;
    timer = setInterval(() => {
      const page = document.getElementById('el-page');
      if (!page) { clearInterval(timer); timer = null; return; }   // the page was left
      const now = +ctx.now();
      /* the countdown, patched in place (nothing is replaced, also not under a finger) */
      page.querySelectorAll('[data-el-until]').forEach((n) => { const v = left(+n.dataset.elUntil, now); if (n.textContent !== v) n.textContent = v; });
      ticks++;
      const check = () => { if (keyOf(+ctx.now()) !== lastKey) changedPaint(); };
      if (ticks % FETCH_EVERY === 0) load(true).then(check).catch(() => {});
      else check();
    }, TICK_MS);
  }
}
