// 1.9.0 – every signal answers four questions, from the USER's point of view, in this order:
//   1 CO TO JE (plain name + one phrase), 2 CO MÁM UDĚLAT JÁ (one sentence, one colour),
//   3 CO UDĚLAL ROBOT (quiet line from paper.json), 4 JAK SE DAŘÍ (the shared status line).
// Plus ONE state chip from the user's side: Můžeš koupit / Máš koupeno / Čeká tvůj limitní příkaz /
// Robot drží – ty už nekupuj / Ukončeno. Everything else (levels, bar, risk, dates) sits behind "Podrobnosti".
import * as F from './format.js';
import * as D from './domain.js';
import * as store from './store.js';
import * as Live from './live.js';
import { t, lang } from './i18n/index.js';
import { INSTR } from './instruments.js';
import { icon, monogram, track } from './ui.js';
import { nextUsOpen } from './views/signals.js';
import { pricePoints } from './charts.js';
import * as W from './wallet.js';

/* ---------- 1 CO TO JE ---------- */
const SECTOR = [
  [/energy|energetika \(ropa/i, 'oil'], [/utilities|vodárensk/i, 'util'], [/technolog/i, 'tech'], [/financ/i, 'fin'],
  [/health|zdravot/i, 'health'], [/industr|průmysl/i, 'ind'], [/staples|základní spotřeba/i, 'staples'],
  [/consumer|spotřební zboží/i, 'cons'], [/communication|komunikace/i, 'media'], [/real estate|nemovitost/i, 're'], [/materials|suroviny/i, 'mat'],
];
export function whatIs(sym, name = '') {
  const x = INSTR[sym];
  const cs = lang() === 'cs';
  const ext = extInstr(sym);
  if (ext) return { name: ext.name, phrase: ext.phrase };
  if (!x) return { name: name || sym, phrase: '' };
  const txt = cs ? x.cs : x.en;
  if (x.k === 'stock') {
    const m = /firmy (.+?) – /.exec(x.cs) || /company (.+?) – /.exec(x.en);
    const sec = (SECTOR.find(([re]) => re.test(x.en)) || [null, 'other'])[1];
    return { name: name || (m ? m[1] : sym), phrase: t(`what.stock.${sec}`) };
  }
  if (x.k === 'etf') {
    /* 1.9.1: a short plain name ("Spotřební zboží USA"), the ticker is shown next to it */
    const sh = t(`etf.${sym}`);
    if (sh !== `etf.${sym}`) return { name: sh, phrase: t('etf.phrase') };
    const p = txt.replace(/^ETF:\s*/, '').split(/ \(| – /)[0];
    return { name: sym, phrase: `${p} (ETF)` };
  }
  const p = txt.split(' – ');
  return { name: p[0].replace(/\s*\(CFD\)/, ''), phrase: p[1] || '' };
}
/* instruments.json (1.9.0) knows indices, currencies, commodities, crypto – plain names from there */
let extFn = () => null;
export const setInstrLookup = (fn) => { extFn = fn; };
function extInstr(sym) {
  const it = extFn(sym);
  if (!it || INSTR[sym]?.k === 'stock') return null;
  const cs = lang() === 'cs';
  const nm = (cs ? it.name_cs : it.name_en) || sym;
  let [a, b] = nm.split(' – ');
  /* 1.9.1: "EUR/USD (euro / americký dolar)" -> name "EUR/USD", phrase "euro / americký dolar" (no 4-line names) */
  const m = /^(.+?)\s*\((.+)\)$/.exec(a);
  if (m) { a = m[1]; b = b || m[2]; }
  const ip = t(`ip.${sym}`);
  return { name: a, phrase: ip !== `ip.${sym}` ? ip : b || t(`cls.${it.class}`) };
}

/* ---------- user's state: ONE function in domain.js (D.cardState), these are thin wrappers ---------- */
export const isDone = (s, now) => D.isDoneSig(s, now);
/* legacy shape: code buy | mine | order | robot | done (buckets, auto-copy) */
const LEGACY = { buy: 'buy', soon: 'buy', wait: 'buy', order: 'order', mine: 'mine', late: 'robot', done: 'done' };
export function userState(s, now = D.clock(), data = null) {
  const cs = D.cardState(s, data, now);
  return { code: LEGACY[cs.code], cs, pos: cs.pos[0] || null, ord: cs.ord, mine: cs.mine };
}
export function stateChip(s, us) {
  const cs = us.cs || D.cardState(s, null);
  return `<span class="u-chip tone-${cs.tone}">${F.esc(cs.badge)}</span>`;
}
/* ---------- 2 CO MÁM UDĚLAT JÁ ---------- */
export function todo(s, us) {
  const cs = us.cs || D.cardState(s, null);
  return { tone: cs.tone, code: cs.code === 'buy' ? 'now' : cs.code, text: cs.text };
}

/* ---------- 3 CO UDĚLAL ROBOT (robot's Alpaca paper account) ---------- */
const twin = (id) => String(id || '').replace(/-\d+$/, '');
const usd = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + F.money(Math.abs(v), 'USD', 0);
export function robotLine(s, data) {
  const p = data?.paper;
  if (!p || !Array.isArray(p.positions)) return '';
  const hit = (x) => x && x.signal_id && (x.signal_id === s.id || twin(x.signal_id) === twin(s.id));
  const pos = p.positions.find(hit);
  /* broker evidence: who, when (fill time when paper.json has it), how many, at what price */
  const when = (x) => { const at = x.filled_at || x.opened_at || x.closed_at || x.submitted_at; return at ? ` ${t('u.bot.at', { d: F.dm(at), time: F.time(at) })}` : ''; };
  /* 1.9.1: "Robot: koupil 29 ks za 186,89" – a fact about the robot's own account, never a hint for the user */
  if (pos) return `${t(pos.side === 'short' ? 'u.bot.sold' : 'u.bot.bought', { q: F.num(Math.abs(+pos.qty || 0), 0), v: F.price(+pos.avg_entry) })}${when(pos)}`;
  const cl = (p.closed || []).find(hit);
  if (cl) return `${t('u.bot.closed', { v: usd(+cl.pnl_usd || 0) })}${when(cl)}`;
  const ord = (p.orders || []).find((o) => hit(o) && (o.status === 'new' || o.status === 'accepted' || o.status === 'pending_new'));
  if (ord) return `${t(ord.side === 'sell' ? 'u.bot.waitSell' : 'u.bot.wait', { v: F.price(+ord.limit) })}, ${t('u.bot.placed', { time: F.time(ord.submitted_at) })}`;
  const sk = (p.skipped || []).find(hit) || skippedInLog(s, p);
  if (sk) return t('u.bot.skip', { why: sk.reason_cs && lang() === 'cs' ? sk.reason_cs : sk.reason || t('u.bot.skipWhy') });
  return '';
}

/* the robot skipped a signal when its log says "XLP: přeskočeno, …" (paper.json has no skipped list yet) */
const reEsc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function skippedInLog(s, p) {
  const l = (p?.log || []).find((x) => new RegExp(`^${reEsc(s.symbol)}: přeskočeno`).test(String(x)));
  return l ? { reason: robotLogText(l).replace(/^.*? – /, '') } : null;
}

/* 1.9.1: the robot's log in plain words ("XLP vynechán – obchod by zabral víc než pětinu účtu").
   The server writes Czech lines; known patterns are rewritten (cs + en), anything else is shown as it is. */
export function robotLogText(line) {
  const x = String(line || '');
  const nm = (sym) => { const w = whatIs(sym); return w.name !== sym ? `${w.name} (${sym})` : sym; };
  let m = /^([A-Z0-9.\-]+): přeskočeno, .*víc než (\d+) % účtu/.exec(x);
  if (m) return t(+m[2] === 20 ? 'pa.log.skipFifth' : 'pa.log.skipBig', { n: nm(m[1]), p: m[2] });
  m = /^([A-Z0-9.\-]+): přeskočeno,? ?(.*)$/.exec(x);
  if (m) return t('pa.log.skip', { n: nm(m[1]), why: m[2] || '' });
  m = /^([A-Z0-9.\-]+): zadán (nákup|prodej) ([\d\s ]+) ks, limit ([\d\s ,.]+), stop ([\d\s ,.]+), cíl ([\d\s ,.]+)$/.exec(x);
  if (m) return t(m[2] === 'nákup' ? 'pa.log.buy' : 'pa.log.sell', { n: nm(m[1]), q: m[3].trim(), l: m[4].trim(), s: m[5].trim(), c: m[6].trim() });
  return x;
}

/* "Otevřeno: 64 ks × 164,47 = 10 526 $ · páka 1:1 · marže 10 526 $ = 10,5 % účtu · riziko při stopu 990 $ = 1 % účtu"
   The robot's Alpaca paper account trades without leverage per trade (1:1). x = a paper.json position / closed trade. */
export function robotOpenText(x, data, stop = null) {
  if (!x || !(+x.qty > 0) || !(+x.avg_entry > 0)) return '';
  const q = Math.abs(+x.qty), e = +x.avg_entry;
  const val = q * e;
  const eq = +data?.paper?.account?.equity || +data?.paper?.account?.start_equity || 0;
  const pctOf = (v) => (eq > 0 ? F.pct(v / eq * 100, 1) : '–');
  const base = t('u.open.robot', { q: F.num(q, 0), e: F.price(e), v: F.money(val, 'USD', 0), m: F.money(val, 'USD', 0), p: pctOf(val) });
  if (!(stop > 0)) return base;
  const risk = q * Math.abs(e - stop);
  return `${base} · ${t('u.open.risk', { v: F.money(risk, 'USD', 0), p: pctOf(risk) })}`;
}
export function robotPosOf(s, data) {
  const hit = (x) => x && x.signal_id && (x.signal_id === s.id || twin(x.signal_id) === twin(s.id));
  return (data?.paper?.positions || []).find(hit) || (data?.paper?.closed || []).find(hit) || null;
}
/* my play-money trade: "Vklad 10 000 Kč · páka 1:10 · obchoduješ za 100 000 Kč · marže 10 000 Kč" */
export function myOpenText(p, ccy) {
  return t('u.open.mine', { a: F.money(p.margin, ccy, 0), lev: p.lev || 1, n: F.money(p.notional, ccy, 0) });
}

/* true = the robot holds this signal on its paper account right now */
export function robotHolds(s, data) {
  const hit = (x) => x && x.signal_id && (x.signal_id === s.id || twin(x.signal_id) === twin(s.id));
  return (data?.paper?.positions || []).some(hit);
}

/* ---------- mini chart: today's price line (5-min path + live ticks) with the entry line ---------- */
export function miniChart(s) {
  let pp = pricePoints(s, 'today');
  if (pp.length < 3) pp = pricePoints(s, 'all');
  if (pp.length < 2) return '';
  const W = 320, H = 64;
  const vals = pp.map((p) => +p.p);
  const lo0 = Math.min(...vals, s.entry), hi0 = Math.max(...vals, s.entry);
  const pad = (hi0 - lo0) * 0.12 || hi0 * 0.002;
  const lo = lo0 - pad, hi = hi0 + pad;
  const y = (v) => (H - ((v - lo) / (hi - lo)) * H).toFixed(1);
  const x = (i) => ((i / (vals.length - 1)) * (W - 6) + 1).toFixed(1);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = vals[vals.length - 1];
  const up = (s.action === 'SELL' ? -1 : 1) * (last - s.entry) >= 0;
  return `<span class="bc-chart ${up ? 'up' : 'down'}" data-action="open-signal" data-id="${F.esc(s.id)}" data-focus="chart" role="button" tabindex="0" aria-label="${F.esc(t('u.chartOpen', { sym: s.symbol }))}">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="${W}" y1="${y(s.entry)}" y2="${y(s.entry)}" class="bc-ent"/>
      <polygon points="1,${H} ${pts} ${x(vals.length - 1)},${H}" class="bc-area"/>
      <polyline points="${pts}" class="bc-line"/>
      <circle cx="${x(vals.length - 1)}" cy="${y(last)}" r="3" class="bc-dot"/>
    </svg><span class="bc-ent-l num">${t('u.entryAt', { v: F.price(s.entry) })}</span></span>`;
}

/* exact publish time - shown before any result (trust) */
export function published(s) {
  const at = s.created_at || s.issued_at;
  if (!at) return '';
  return t('u.pub', { d: F.dmy(at), time: F.time(at) });
}

/* ---------- the card (Signály: full; Dnes / Moje: compact) ----------
   1.9.1: max 4 accents – name, ONE state badge, ONE sentence, ONE button. Everything else (price move, chart,
   robot line, horizon, publish time) is quiet grey. Money: "U vás" only on the user's own trade,
   otherwise grey "Kdybyste koupili: …". All of it comes from D.cardState (one function for the whole app). */
export function myLine(cs) {
  if (cs.my) {
    const mt = D.moneyTone(cs.my.money, cs.my.ccy, cs.my.pct);
    const pct = cs.my.pct != null && !mt.zero ? ` · ${F.spct(cs.my.pct, 1)}` : '';
    return `<p class="bc-my tone-${mt.tone}"><span>${t('st.youReal')}</span><b class="num">${F.esc(mt.text)}${pct}</b></p>`;
  }
  if (cs.ifBought && cs.code !== 'done') {
    const mt = D.moneyTone(cs.ifBought.now, cs.ifBought.ccy, cs.move);
    return `<p class="bc-if">${F.esc(t('st.ifBought', { m: mt.text }))}</p>`;
  }
  return '';
}
export function ctaBtn(s, cs, { small = false } = {}) {
  const sm = small ? ' is-small' : '';
  if (cs.cta === 'invest') return `<a class="invest-btn${sm}" href="#/terminal?s=${encodeURIComponent(s.id)}">${icon('spark', 'icon-sm')}<span>${t('inv.btn')}</span><small>${t('inv.btnS')}</small></a>`;
  if (cs.cta === 'limit') return `<a class="invest-btn is-limit${sm}" href="#/terminal?s=${encodeURIComponent(s.id)}">${icon('clock', 'icon-sm')}<span>${t('inv.btnLim', { v: F.price(s.entry) })}</span><small>${t('inv.btnLimS')}</small></a>`;
  return '';
}
/* quiet line about the signal itself (not about the user): "Cena od vstupu +1,0 % · do cíle zbývá 3 %" */
export function sigLine(s, st) {
  if (st.done) return `${F.esc(st.text)}${st.hint ? ` · ${F.esc(st.hint)}` : ''}`;
  if (st.move == null) return F.esc(st.text);
  const zero = Math.abs(st.move) < D.FLAT_PCT;
  return `${F.esc(zero ? t('st.sigZero') : t('st.sig', { v: F.spct(st.move, 1) }))}${st.hint && !zero ? ` · ${F.esc(st.hint)}` : ''}`;
}
export function card(s, { data, now = D.clock(), compact = false, invest = true, i = 0 } = {}) {
  const cs = D.cardState(s, data, now);
  const w = whatIs(s.symbol, s.name);
  const bot = robotLine(s, data);
  const st = D.liveStatus(s, now);
  const tags = `<span class="hz-tag">${F.esc(F.HZ_LABEL[s.horizon] || '')}</span>${s.preview ? `<span class="hz-tag is-preview" title="${F.esc(t('sig.preview.t'))}">${t('sig.preview')}</span>` : ''}`;
  const mv = st.move;
  return `<article class="bc tone-${cs.tone} is-${cs.code} ${compact ? 'is-compact' : ''}" style="--i:${Math.min(i, 8)}" data-live-id="${F.esc(s.id)}" data-pnl="${mv ?? ''}">
    <div class="bc-head" role="button" tabindex="0" data-action="open-signal" data-id="${F.esc(s.id)}" aria-label="${F.esc(`${w.name} ${s.symbol}`)}">
      ${monogram(s.symbol, s.name)}
      <span class="bc-id b-what"><span class="bc-name">${F.esc(w.name)}${w.name !== s.symbol ? ` <span class="ticker">${F.esc(s.symbol)}</span>` : ''}</span>
        <span class="bc-phrase">${F.esc(w.phrase)}</span></span>
      ${mv != null ? `<span class="bc-pct num is-quiet">${F.spct(mv, 2)}</span>` : ''}
    </div>
    <p class="bc-tags"><span class="u-chip tone-${cs.tone}">${F.esc(cs.badge)}</span>${tags}</p>
    <p class="bc-todo b-todo tone-${cs.tone}">${F.esc(cs.text)}</p>
    ${myLine(cs)}
    ${invest ? ctaBtn(s, cs) : ''}
    <div class="bc-quiet">
      <p class="st-line b-how is-quiet"><i aria-hidden="true"></i><span>${sigLine(s, st)}</span></p>
      ${bot ? `<p class="bc-bot b-bot">${icon('shield', 'icon-xs')}<span>${F.esc(bot)}</span></p>` : ''}
      ${miniChart(s)}
      <p class="bc-pub">${icon('clock', 'icon-xs')}<span>${F.esc(published(s))}</span></p>
    </div>
    ${compact ? '' : `<details class="bc-more"><summary>${t('u.more')}${icon('chev-down', 'icon-xs')}</summary>
      ${track(s, { now, prices: true, status: false })}
      <p class="bc-lv num">${t('u.lv', { e: F.price(s.entry), s: F.price(s.stop), t: s.target != null ? F.price(s.target) : '–' })}</p>
      <p class="bc-lv">${F.esc(st.hint || '')}${s.exit_date ? ` · ${t('u.until', { d: F.dm(s.exit_date) })}` : ''}</p>
      ${robotPosOf(s, data) ? `<p class="bc-lv bc-open-l">${icon('shield', 'icon-xs')} ${F.esc(robotOpenText(robotPosOf(s, data), data, s.stop))}</p>` : ''}
      <button type="button" class="link bc-open" data-action="open-signal" data-id="${F.esc(s.id)}">${t('u.detail')}${icon('chev-right', 'icon-xs')}</button>
    </details>`}
  </article>`;
}

/* 1.9.1 compact row for Dnes ("what do I buy now" in the first screen): name + badge, one sentence, one button */
export function row(s, { data, now = D.clock(), i = 0 } = {}) {
  const cs = D.cardState(s, data, now);
  const w = whatIs(s.symbol, s.name);
  return `<article class="brow tone-${cs.tone} is-${cs.code}" style="--i:${Math.min(i, 8)}" data-live-id="${F.esc(s.id)}">
    <div class="brow-head" role="button" tabindex="0" data-action="open-signal" data-id="${F.esc(s.id)}" aria-label="${F.esc(`${w.name} ${s.symbol}`)}">
      ${monogram(s.symbol, s.name)}
      <span class="brow-id"><span class="brow-n"><span class="bc-name">${F.esc(w.name)}${w.name !== s.symbol ? ` <span class="ticker">${F.esc(s.symbol)}</span>` : ''}</span><span class="u-chip tone-${cs.tone}">${F.esc(cs.badge)}</span></span>
        <span class="brow-t tone-${cs.tone}">${F.esc(cs.text)}</span></span>
    </div>
    ${ctaBtn(s, cs, { small: true })}
  </article>`;
}

/* ---------- 1.9.1 THE signal card (Dnes "Nový signál" and Signály – the same card) ----------
   KOUPIT · Exxon Mobil / ropná firma z USA · na 2–3 dny / Vlož např. 10 000 Kč → při cíli +1 880 Kč, při stopu −940 Kč /
   one plain answer "can I still invest?" (D.cardState: a / b / c) / [Zainvestovat] [Teď ne].
   Already invested -> "Máš investováno · +128 Kč" instead of the buttons. No robot info here (only in the detail). */
export function offer(s, { data, now = D.clock(), notNow = false, i = 0 } = {}) {
  const cs = D.cardState(s, data, now);
  const w = whatIs(s.symbol, s.name);
  const sell = s.action === 'SELL';
  const ex = D.example(s);
  const sm = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + F.money(Math.abs(v), ex.ccy, 0);
  const hz = t(`u.hzShort.${s.horizon}`);
  let foot = '';
  if (cs.code === 'mine' || (cs.code === 'done' && cs.my)) {
    const mt = cs.my ? D.moneyTone(cs.my.money, cs.my.ccy, cs.my.pct) : null;
    foot = `<button type="button" class="sc-mine" data-action="open-signal" data-id="${F.esc(s.id)}"><span>${t(cs.code === 'done' ? 'sc.mineDone' : 'sc.mine')}</span>${mt ? `<b class="num ${mt.tone}">${F.esc(mt.text)}</b>` : ''}${icon('chev-right', 'icon-xs')}</button>`;
  } else if (cs.cta) {
    const lim = cs.cta === 'limit';
    foot = `<div class="sc-btns"><button type="button" class="btn btn-primary sc-go" data-action="invest" data-id="${F.esc(s.id)}" data-mode="${lim ? 'limit' : 'now'}">${lim ? t('inv.btnLim', { v: F.price(s.entry) }) : t('sc.invest')}</button>${notNow ? `<button type="button" class="btn btn-ghost sc-no" data-action="not-now" data-id="${F.esc(s.id)}">${t('sc.notNow')}</button>` : ''}</div>`;
  }
  const exLine = cs.code === 'done' ? '' : `<p class="sc-ex num">${t('sc.example', { a: F.money(ex.amount, ex.ccy, 0), t: `<b class="up">${ex.atTarget != null ? sm(ex.atTarget) : '–'}</b>`, s: `<b class="down">${ex.atStop != null ? sm(ex.atStop) : '–'}</b>` })}</p>`;
  return `<article class="sc is-${cs.code}" style="--i:${Math.min(i, 8)}" data-live-id="${F.esc(s.id)}">
    <div class="sc-head" role="button" tabindex="0" data-action="open-signal" data-id="${F.esc(s.id)}" aria-label="${F.esc(`${w.name} ${s.symbol}`)}">
      ${monogram(s.symbol, s.name)}
      <span class="sc-id"><span class="sc-k"><b class="sc-act ${sell ? 'is-sell' : ''}">${t(sell ? 'sc.sell' : 'sc.buy')}</b><span class="sc-dot">·</span><span class="sc-name">${F.esc(w.name)}</span>${w.name !== s.symbol ? `<span class="ticker">${F.esc(s.symbol)}</span>` : ''}</span>
        <span class="sc-s">${F.esc([w.phrase, hz].filter(Boolean).join(' · '))}</span></span>
      ${icon('chev-right', 'icon-xs sc-chev')}
    </div>
    ${exLine}
    ${cs.code === 'mine' ? '' : `<p class="sc-when is-${cs.code}">${F.esc(cs.text)}</p>`}
    ${foot}
  </article>`;
}

/* ---------- the three boxes (Dnes) / quick filters (Signály) ---------- */
export function buckets(list, now = D.clock()) {
  const out = { buy: [], mine: [], robot: [], done: [] };
  list.forEach((s) => {
    const us = userState(s, now);
    if (us.code === 'buy') out.buy.push(s);
    else if (us.code === 'mine' || us.code === 'order') out.mine.push(s);
    else if (us.code === 'robot') out.robot.push(s);
    else out.done.push(s);
  });
  return out;
}

/* horizon group headers (Dnes, Moje) */
export function byHorizon(list, render) {
  return D.HORIZONS.map((h) => {
    const l = list.filter((s) => s.horizon === h);
    if (!l.length) return '';
    return `<p class="hz-group">${t(`u.hz.${h}`)}<small class="num">${l.length}</small></p>${l.map(render).join('')}`;
  }).join('');
}
