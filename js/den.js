// 1.15.1 "PULSE DEN" – the EXPERIMENTAL one-day robot (US500 / US100), shown apart from the tested signals:
// a card on Dnes under "Dnešní signály" and a simple page #/den. Data /data/den.json (VYZKUM/denni_robot/SPECIFIKACE_BOTA.md §5).
// Never mixed into Dnešní signály, the Portfolio's "Všechny signály robota" or Výsledky. Everything is guarded: the file may
// be absent, old or half-filled – Dnes never breaks because of it. The robot's texts are Czech only for now.
import * as F from './format.js';
import * as D from './domain.js';
import { t, lang } from './i18n/index.js';
import { icon, openSheet, closeTopSheet } from './ui.js';
import { ownTicket } from './views/terminal.js';

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
const n2 = (v, d = 1) => (Number.isFinite(+v) ? F.num(+v, d) : '–');
const px = (v) => (Number.isFinite(+v) && +v > 0 ? F.num(+v, 1) : '–');
const side = (s) => (s?.smer === 'PRODEJ' ? 'SELL' : 'BUY');
const mkt = (k) => (k ? t(`mkt.k.${k}`) !== `mkt.k.${k}` ? `${t(`mkt.k.${k}`)} (${k})` : k : '–');

/* "15:55 New York" -> the same moment in the user's clock, on the day of `ref` (an ISO time with its NY offset) */
export function nyClock(txt, ref) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(txt || ''));
  const r = /^(\d{4}-\d{2}-\d{2})T.*([+-]\d{2}:\d{2})$/.exec(String(ref || ''));
  if (!m || !r) return null;
  const d = Date.parse(`${r[1]}T${m[1].padStart(2, '0')}:${m[2]}:00${r[2]}`);
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
export function resultLine(j) {
  const v = j?.vysledek || {};
  if (!(+v.obchodu > 0)) return t('den.res0');
  return t('den.res', { n: v.obchodu, w: v.vyhry_pct != null ? F.pct(+v.vyhry_pct, 0) : '–', pf: v.pf != null ? n2(v.pf, 2) : '–' });
}
function stText(s) {
  const k = s?.stav;
  if (k === 'plati') return { tone: 'up', text: t('den.st.plati') };
  if (k === 'otevreno') return { tone: 'gold', text: t('den.st.otevreno') };
  if (k === 'uzavreno') return { tone: +s.vysledek_R > 0 ? 'up' : +s.vysledek_R < 0 ? 'down' : 'flat', text: s.vysledek_R != null ? t('den.st.uzavrenoR', { v: `${+s.vysledek_R > 0 ? '+' : ''}${n2(s.vysledek_R, 2)}` }) : t('den.st.uzavreno') };
  if (k === 'pozde') return { tone: 'flat', text: t('den.st.pozde') };
  if (k === 'neuzavreno_chybi_data') return { tone: 'flat', text: t('den.st.chybi') };
  return { tone: 'flat', text: String(k || '–') };
}
const canTrade = (j, s, now) => j?.robot?.stav === 'bezi' && s?.stav === 'plati' && !(Date.parse(s?.vstup?.plati_do || 0) > 0 && +now > Date.parse(s.vstup.plati_do));

function sigBlock(j, s, now) {
  const sell = side(s) === 'SELL';
  const v = s.vstup || {};
  const until = Date.parse(v.plati_do || 0) > 0 ? F.time(new Date(Date.parse(v.plati_do))) : '–';
  const out = nyClock(s.vystup, s.cas_signalu || j.vytvoreno);
  const stt = stText(s);
  const entry = sell ? t('den.e.min', { v: px(v.nejniz) }) : t('den.e.max', { v: px(v.nejvys) });
  const btn = canTrade(j, s, now) ? `<button type="button" class="btn btn-primary btn-block" data-action="den-trade" data-sym="${F.esc(s.trh || '')}" data-side="${sell ? 'SELL' : 'BUY'}" data-sl="${+s.stop || ''}">${icon('spark', 'icon-sm')}<span>${t(sell ? 'den.b.sell' : 'den.b.buy')}</span></button><p class="den-st">${t('den.own')}</p>` : '';
  return `<div class="den-sig" data-den-sig="${F.esc(s.id || '')}"><p class="den-sig-t"><span class="${sell ? 'down' : 'up'}">${sell ? '↓' : '↑'} ${t(sell ? 'den.sell' : 'den.buy')}</span><span>${F.esc(s.nazev || mkt(s.trh))}</span></p>
    <dl class="den-kv num"><dt>${t('den.k.entry')}</dt><dd>${F.esc(entry)}</dd>
      <dt>${t('den.k.until')}</dt><dd>${F.esc(until)}</dd>
      <dt>${t('den.k.stop')}</dt><dd>${px(s.stop)}</dd>
      <dt>${t('den.k.exit')}</dt><dd>${F.esc(out ? t('den.exitAt', { v: F.time(out) }) : String(s.vystup || '–'))}</dd>
      ${s.cas_signalu ? `<dt>${t('den.k.sent')}</dt><dd>${F.esc(F.time(new Date(Date.parse(s.cas_signalu))))}</dd>` : ''}</dl>
    <p class="den-st tone-${stt.tone}">${F.esc(stt.text)}</p>${btn}</div>`;
}
function headHtml(j, link = true) {
  const name = `<span>${t('den.h')}</span><span class="den-badge">${t('den.badge')}</span>`;
  return `<p class="den-h">${link ? `<a href="#/den">${name}${icon('chev-right', 'icon-xs')}</a>` : name}<button type="button" class="den-q" data-action="den-help" aria-label="${F.esc(t('den.helpAria'))}">?</button></p>
    <p class="den-warn">${icon('alert', 'icon-xs')}<span>${t('den.label')}</span></p>${lang() !== 'cs' ? `<p class="den-st">${t('den.enNote')}</p>` : ''}`;
}

/* the Dnes card (always below the tested signals) */
export function cardHtml(now = D.clock()) {
  const j = st.j;
  if (!st.tried) return `<section class="den-card" id="den-card" aria-label="${F.esc(t('den.h'))}">${headHtml(null)}<p class="den-off">${t('common.loading')}</p></section>`;
  try {
    let body;
    if (!j || !fresh(j, now)) body = `<p class="den-off">${t('den.noData')}</p>`;
    else if (j.robot?.stav === 'pozastaveno') body = `<p class="den-off">${F.esc(t('den.paused', { why: j.robot?.duvod_stavu || '–' }))}</p>`;
    else {
      const sigs = arr(j.signaly);
      body = sigs.length ? sigs.map((s) => sigBlock(j, s, now)).join('')
        : `<p class="den-st">${t('den.watchH')}</p><ul class="den-watch">${arr(j.hlidam).slice(0, 2).map((h) => `<li>${F.esc(h.text || '')}</li>`).join('') || `<li>${t('den.watch0')}</li>`}</ul>`;
    }
    return `<section class="den-card" id="den-card" aria-label="${F.esc(t('den.h'))}">${headHtml(j)}${j ? `<p class="den-res">${F.esc(resultLine(j))}</p>` : ''}${body}</section>`;
  } catch {
    return `<section class="den-card" id="den-card">${headHtml(null)}<p class="den-off">${t('den.noData')}</p></section>`;
  }
}

/* Dnes mount: load once, then patch the card in place (no re-render of Dnes) */
export function mount(el) {
  const paint = () => { const c = el.querySelector('#den-card'); if (c && el.isConnected) c.outerHTML = cardHtml(D.clock()); };
  load().then(paint).catch(() => {});
  const iv = setInterval(() => { if (!el.isConnected) { clearInterval(iv); return; } load(true).then(paint).catch(() => {}); }, 5 * 60000);
}

/* ---------- #/den ---------- */
function listOrDash(a) { const l = arr(a).filter(Boolean); return l.length ? `<ul>${l.map((x) => `<li>${F.esc(String(x))}</li>`).join('')}</ul>` : '<p>–</p>'; }
export function render(ctx) {
  const now = ctx.now();
  const head = `<header class="page-head"><div><a class="back" href="#/dnes">${icon('chev-left', 'icon-xs')}${t('nav.dnes')}</a><h1 class="page-title">${t('den.h')}</h1><p class="page-sub">${t('den.sub')}</p></div></header>`;
  const j = st.j;
  if (!st.tried) return head + `<p class="den-off">${t('common.loading')}</p>`;
  if (!j) return head + `<section class="den-card den-page">${headHtml(null, false)}<p class="den-off">${t('den.noData')}</p></section>`;
  try {
    const ok = fresh(j, now);
    const sigs = ok && j.robot?.stav !== 'pozastaveno' ? arr(j.signaly) : [];
    const s0 = sigs[0];
    const pc = s0?.pro_cloveka || null;
    const a = pc?.a_fundament_trhu || null;
    const why = a ? `<p><b>${t('den.w.dnes')}</b> ${F.esc(a.dnes || '–')}</p><p><b>${t('den.w.tydny')}</b> ${F.esc(a.tydny || '–')}</p><p><b>${t('den.w.mesice')}</b> ${F.esc(a.mesice || '–')}</p>${a.souhrn ? `<p><b>${t('den.w.souhrn')}</b> ${F.esc(a.souhrn)}</p>` : ''}`
      : `<p><b>${t('den.w.up')}</b></p>${listOrDash(arr(j.rezim_trhu?.nahoru?.dnes).slice(0, 4))}<p><b>${t('den.w.down')}</b></p>${listOrDash(arr(j.rezim_trhu?.dolu?.dnes).slice(0, 4))}`;
    const tech = pc ? listOrDash(pc.b_technika) : `<ul>${arr(j.hlidam).map((h) => `<li>${F.esc(h.text || '')}</li>`).join('') || `<li>${t('den.watch0')}</li>`}</ul>`;
    const entry = pc?.c_vstup ? `<p>${F.esc(pc.c_vstup)}</p>` : `<p>${t('den.noEntry')}</p>`;
    const v = j.vysledek || {}, ts = v.test || {}, pj = v.pojistka || {};
    const row = (k, a1, b1) => `<tr><th>${k}</th><td class="num">${a1}</td><td class="num">${b1}</td></tr>`;
    const res = `<table class="den-tbl"><thead><tr><th></th><th class="num">${t('den.r.now', { d: v.od ? F.dm(v.od) : '–' })}</th><th class="num">${t('den.r.test', { p: F.esc(String(ts.obdobi || '2023–2026').replace('..', '–')) })}</th></tr></thead><tbody>
      ${row(t('den.r.n'), +v.obchodu || 0, ts.obchodu ?? '–')}
      ${row(t('den.r.w'), v.vyhry_pct != null ? F.pct(+v.vyhry_pct, 0) : '–', ts.vyhry_pct != null ? F.pct(+ts.vyhry_pct, 1) : '–')}
      ${row(t('den.r.pf'), v.pf != null ? n2(v.pf, 2) : '–', ts.pf != null ? n2(ts.pf, 2) : '–')}
      ${row(t('den.r.dd'), v.propad_pct != null ? F.pct(-Math.abs(+v.propad_pct), 1) : '–', ts.propad_pct != null ? F.pct(-Math.abs(+ts.propad_pct), 1) : '–')}</tbody></table>`;
    const hist = arr(j.historie_poslednich_20);
    const histHtml = hist.length ? `<table class="den-tbl"><tbody>${hist.map((h) => { const r = +h.R; return `<tr><td>${F.esc((/(\d{4})(\d{2})(\d{2})/.exec(h.id || '') || []).slice(1).reverse().join('. ') || '–')}</td><td>${F.esc(h.trh || '')}</td><td>${t(h.smer === 'PRODEJ' ? 'den.sell' : 'den.buy')}</td><td class="num ${r > 0 ? 'up' : r < 0 ? 'down' : ''}">${Number.isFinite(r) ? `${r > 0 ? '+' : ''}${n2(r, 2)}×` : '–'}</td><td>${F.esc(h.konec || '')}</td></tr>`; }).join('')}</tbody></table><p class="den-st">${t('den.histNote')}</p>` : `<p>${t('den.hist0')}</p>`;
    return head + `<div class="den-page">
      <section class="den-card">${headHtml(j, false)}
        ${j.robot?.stav === 'pozastaveno' ? `<p class="den-off">${F.esc(t('den.paused', { why: j.robot?.duvod_stavu || '–' }))}</p>` : ''}
        ${!ok ? `<p class="den-off">${t('den.noData')}</p>` : ''}
        ${sigs.map((s) => sigBlock(j, s, now)).join('')}
        ${ok && !sigs.length && j.robot?.stav !== 'pozastaveno' ? `<p class="den-st">${t('den.none')}</p>` : ''}</section>
      <section class="den-sec card"><h2>${t('den.s.why')}</h2>${why}</section>
      <section class="den-sec card"><h2>${t('den.s.tech')}</h2>${tech}</section>
      <section class="den-sec card"><h2>${t('den.s.entry')}</h2>${entry}</section>
      <section class="den-sec card"><h2>${t('den.s.res')}</h2>${res}<p class="den-st">${t('den.r.pfS')}</p></section>
      <section class="den-sec card"><h2>${t('den.s.safe')}</h2><p>${t('den.safe', { n: pj.po_obchodech ?? 30, pf: n2(pj.pf_min ?? 1, 1), dd: n2(pj.propad_max_pct ?? 10, 0), z: pj.zbyva_do_kontroly ?? '–' })}</p></section>
      <section class="den-sec card"><h2>${t('den.s.hist')}</h2>${histHtml}</section>
      <p class="disclaimer">${icon('info')}${F.esc(j.robot?.upozorneni || t('den.label'))}</p></div>`;
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
    const txt = st.j?.robot?.upozorneni || t('den.label');
    openSheet({
      small: true, label: t('den.h'),
      html: `<div class="sheet-head"><div><p class="sheet-title">${t('den.h')} · ${t('den.badge')}</p></div><button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
        <div class="sheet-body"><p class="th-text">${F.esc(txt)}</p><p class="th-text">${t('den.helpMore')}</p></div>`,
      onMount(sh) { sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet()); },
    });
  },
  'den-trade'(el, ev, ctx) { ownTicket(ctx, el.dataset.side, el.dataset.sym, { sl: +el.dataset.sl || null, tp: null }); },
};
