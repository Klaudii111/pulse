// 1.9.0 – every signal answers four questions, from the USER's point of view, in this order:
//   1 CO TO JE (plain name + one phrase), 2 CO MÁM UDĚLAT JÁ (one sentence, one colour),
//   3 CO UDĚLAL ROBOT (quiet line from paper.json), 4 JAK SE DAŘÍ (the shared status line).
// Plus ONE state chip from the user's side: Můžeš koupit / Máš koupeno / Čeká tvůj limitní příkaz /
// Robot drží – ty už nekupuj / Ukončeno. Everything else (levels, bar, risk, dates) sits behind "Podrobnosti".
import { CONFIG } from '../config.js';
import * as F from './format.js';
import * as D from './domain.js';
import * as store from './store.js';
import * as Live from './live.js';
import { t, lang, L } from './i18n/index.js';
import { INSTR } from './instruments.js';
import { icon, monogram, track } from './ui.js';
import { nextUsOpen } from './views/signals.js';
import { pricePoints } from './charts.js';
import * as W from './wallet.js';
import { nyCloseAfter as nyCloseAfterMs } from './wallet.js';
import * as H from './health.js';
import * as M from './market.js';

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
    const pct = cs.my.pct != null && !mt.zero ? ` · ${F.mpct(cs.my.pct, cs.my.money)}` : '';
    /* 1.13.2: a trade I already closed shows the wallet's closed result – the same number as Historie */
    if (cs.my.closed) return `<p class="bc-my is-closed tone-${mt.tone}"><b class="num">${F.esc(t('my.closed', { v: mt.text }))}${pct}</b></p>`;
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
  if (cs.cta === 'limit') return `<a class="invest-btn is-limit${sm}" href="#/terminal?s=${encodeURIComponent(s.id)}">${icon('clock', 'icon-sm')}<span>${t('inv.btnLim', { v: D.spx(s, D.maxEntry(s)) })}</span><small>${t('inv.btnLimS')}</small></a>`;
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

/* ---------- 1.10.0 "Proč:" – 2–3 plain bullets from the signal's own explanation (no unexplained abbreviations) ---------- */
export function whyBullets(s, max = 3) {
  const ex = s.explanation;
  let txt = ex ? L(ex.summary || ex) : '';
  if (typeof txt !== 'string') txt = '';
  txt = txt.replace(/^\s*(Proč|Why)\s*:\s*/i, '').split(/\s+(?:Neplatí|Invalidated)[\s,]/)[0].replace(/\.\s*$/, '');
  const cs = lang() === 'cs';
  const plain = (x) => x
    .replace(/\s*\(RSI\(\d+\)\s*[<>]\s*\d+\)/g, '')
    .replace(/\s*\(ATR\)/g, '')
    .replace(/\(VIX (nad|above) (\d+)\)/g, (m, w, n) => (cs ? `(„index strachu“ VIX nad ${n})` : `(the “fear index” VIX above ${n})`))
    .replace(/\bVIX (nad|above) (\d+)\b(?!\))/g, (m, w, n) => (cs ? `„index strachu“ VIX nad ${n}` : `the “fear index” VIX above ${n}`))
    .replace(/\bbot\b/g, cs ? 'robot' : 'the robot')
    .trim();
  /* 1.13.1: no raw data formats in the text ("2026-12-11" -> "11. 12. 2026", "315.34" -> "315,34") */
  let out = txt.split(/\s*;\s*/).map(plain).map(F.human).filter((x) => x.length > 3);
  if (!out.length) out = (s.reasons || []).map((r) => F.human(L(r))).filter(Boolean);
  return out.slice(0, max).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
}
export function whyBlock(s) {
  const b = whyBullets(s);
  if (!b.length) return '';
  return `<div class="sc-why"><p class="sc-why-k">${t('c.why')}</p><ul>${b.map((x) => `<li>${F.esc(x)}</li>`).join('')}</ul>
    <button type="button" class="link sc-why-more" data-action="open-signal" data-id="${F.esc(s.id)}" data-focus="why">${t('c.whyMore')}${icon('chev-right', 'icon-xs')}</button></div>`;
}

/* ---------- 1.10.0 THE signal card: a clearly named "campaign" ----------
   Exxon Mobil nahoru #11 / 2–3denní signál · ropná firma z USA
   Předmět · Směr · Stav · Délka, then fixed numbers upfront for the example deposit:
   "Maximální možná ztráta −790 Kč" and "Odhadovaný potenciál +1 373 Kč (+13,7 %)" (D.offerNums – the SAME function
   as the investment sheet), one plain sentence (D.cardState), one button. Max 4 accents: state chip, loss, potential, button.
   Closed signals: Zisk (example deposit) · Zhodnocení · Uzavřeno. */
export const qh = (k) => `<span class="qm" role="button" tabindex="0" data-action="term-help" data-k="${k}" aria-label="${F.esc(t('th.ask'))}">?</span>`;
const sMoney = (v, c) => (v > 0 ? '+' : v < 0 ? '−' : '') + F.money(Math.abs(v), c, 0);
export function sigTitle(s) {
  const w = whatIs(s.symbol, s.name);
  return `${F.esc(t('c.title', { n: w.name, d: t(`c.dir.${s.action === 'SELL' ? 'SELL' : 'BUY'}`) }))} <span class="sc-no num">#${D.sigNo(s)}</span>`;
}
export const sigTitleText = (s) => `${t('c.title', { n: whatIs(s.symbol, s.name).name, d: t(`c.dir.${s.action === 'SELL' ? 'SELL' : 'BUY'}`) })} #${D.sigNo(s)}`;
export function lenText(s, now = D.clock()) {
  const n = D.sigDays(s, now);
  if (n == null) return '–';
  if (D.isDoneSig(s, now)) return t('c.lenDays', { n, u: F.unit('day', n) });
  return n === 0 ? t('c.lenToday', { d: F.dm(s.exit_date) }) : t('c.lenOpen', { d: F.dm(s.exit_date), n, u: F.unit('day', n) });
}
export function phaseChip(ph) {
  return `<span class="ph-chip is-${ph}">${t(`c.ph.${ph}`)}</span>`;
}
/* ---------- 1.11.1 THE money block (card, detail, invest sheet – one function) ----------
   main line = what the strategy's signals made ON AVERAGE in the 2023–2026 test, for this deposit:
   risk at the stop (without the deposit cap) × avg_r of the strategy (health.json backtest) × leverage;
   then how many signals made money (win_rate), the maximum possible loss, the best case (target) in grey,
   and a small comparison of three leverage profiles (Konzervativně 1:1 · Vyváženě 1:2 · Agresivněji 1:5, capped at the
   instrument's legal max). No health.json -> the 1.11.0 lines (loss + potential at the target). */
/* 1.11.2: the 3rd profile uses the instrument's current cap (retail: shares 1:5, pro: 1:20); "own" = any broker chip */
/* 1.13.2 ONE profile = risk at the stop + leverage (D.PROFILES): Konzervativně 1 % bez páky · Vyváženě 2 % do 1:2 ·
   Agresivněji 4 % až do stropu trhu (akcie 1:5, zlato 1:20, krypto 1:2). The leverage per instrument: D.profLevFor. */
export const LEV_PROFILES = CONFIG.CALC.RISK_PROFILES; // = D.PROFILES (read from CONFIG: domain ↔ brief import each other)
export const levProfile = () => D.prof();
export function profCols(sym) {
  return D.PROFILES.map((p) => ({ ...p, lev: D.profLevFor(p, sym) }));
}
/* which column is "on" for a leverage (the invest sheet): my profile's column when it has that leverage, else the first with it */
export function onColId(cols, sel) {
  const lp = levProfile();
  const mine = cols.find((c) => c.id === lp.id && c.lev === sel);
  return (mine || cols.find((c) => c.lev === sel) || {}).id || null;
}
/* the leverage of the user's profile for this instrument (capped at the cap that applies now) */
export const selLev = (sym) => D.profLevFor(D.prof(), sym);
/* "páka 1:2 · nejhůř ~2 %" – the one-line meaning of a profile for one instrument */
export const profMeta = (c) => `${c.lev === 1 ? t('mb.noLev') : t('mb.lev', { v: c.lev })} · ${t('pf.worst', { v: F.num(D.BASE_PROF.pct * c.lev, 0) })}`;
/* 1.13.4 "bez páky" wherever the leverage is 1:1 (chips, positions, tables, history) */
export const levTxt = (lev) => (+lev > 1 ? t('mb.lev', { v: +lev }) : t('mb.noLev'));
/* 1.13.4 the profile's fixed meaning; Agresivněji names the real caps ("páka 1:5 u akcií, 1:20 u indexů") */
export const profShort = (id) => t(`pf.short.${id}`, { s: M.maxLev('AAPL') || 5, i: M.maxLev('US500') || 20, w: F.num(D.profWorstPct(D.prof(id), 'AAPL'), 0) });
/* "1 ze 2" / "3 z 5" / "6 z 10": the simplest fraction within 3 points of the test's win rate */
export function winFrac(w) {
  if (!(w > 0 && w < 1)) return null;
  for (const n of [2, 3, 4, 5, 10]) { const k = Math.round(w * n); if (k > 0 && k < n && Math.abs(k / n - w) <= 0.03) return { k, n }; }
  return { k: Math.round(w * 10), n: 10 };
}
/* growth of a whole account in the test: start × (1 + cagr)^years of the test period */
export function testGrowth(bt, ccy) {
  if (!bt || !(bt.cagr > -1)) return null;
  const m = String(bt.period || '').match(/(\d{4}-\d{2}-\d{2})\D+(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const yrs = (Date.parse(m[2]) - Date.parse(m[1])) / (365.25 * 86400000);
  if (!(yrs > 0.5)) return null;
  const start = (D.EXAMPLE_DEP[ccy] || 10000) * 10;
  const end = start * (1 + bt.cagr) ** yrs;
  const step = start >= 50000 ? 1000 : 100;
  return { start, end: Math.round(end / step) * step, y0: m[1].slice(0, 4), y1: m[2].slice(0, 4) };
}
export function levNums({ side, entry, amount, sl, tp, lev, bt }) {
  const o = W.outcome({ side, entry, amount, lev, sl, tp });
  /* 1.13.3: no stop-loss = nothing limits the loss but the deposit itself -> "Nejhůř" = the whole deposit */
  if (!(sl > 0) && amount > 0) o.atStop = -amount;
  const risk = sl > 0 && entry > 0 ? Math.abs(amount * lev * (sl - entry) / entry) : null;
  const capped = o.atStop != null && o.atStop <= -amount + 0.5;
  /* stop-out before the stop: the test average (made with the full stop) does not apply -> no average */
  return { lev, worst: o.atStop, best: o.atTarget, capped, notional: amount * lev, wipe: o.wipe,
    avg: bt && risk != null && Number.isFinite(+bt.avg_r) && !capped ? risk * bt.avg_r : null };
}
/* 1.11.2 "S pákou 1:20 stačí, aby cena klesla o 5 %, a přijdeš o celý vklad." (stop-out at the deposit) */
export function wipeLine(lev, side) {
  const sell = side === 'SELL';
  if (!(lev > 1)) return t(sell ? 'lv.wipe1Sell' : 'lv.wipe1');
  const m = 100 / lev;
  return t(sell ? 'lv.wipeSell' : 'lv.wipe', { lev, m: F.num(m, m % 1 ? 1 : 0) });
}
/* why a chip is disabled: the EU retail cap of this market (+ the pro cap / where to switch it on) */
export function levWhy(sym, v) {
  let kind = M.levKind(sym);
  if (kind === 'fxMajor' || kind === 'fx') kind = M.retailLev(sym) >= 30 ? 'fxMajor' : 'fx';
  if (!['stock', 'index', 'gold', 'fxMajor', 'fx', 'commodity', 'crypto'].includes(kind)) kind = 'stock';
  let x = `${t(`lv.why.${kind}`, { v: M.retailLev(sym) })} ${t('lv.whyMt')}`;
  if (M.isPro()) x += ` ${t('lv.whyProMax', { v: M.proLev(sym) })}`;
  else if (v <= M.proLev(sym)) x += ` ${t('lv.whyPro', { v: M.proLev(sym) })}`;
  return x;
}
/* the broker chips 1:1 … 1:100 (like MetaTrader brokers); above the cap disabled (tap = the reason) */
export function levChips(sym, sel) {
  const mx = M.maxLev(sym) || 1;
  const list = M.LEV_CHIPS.concat(M.LEV_CHIPS.includes(mx) ? [] : [mx]).sort((a, b) => a - b);
  return `<div class="lev-chips" role="radiogroup" aria-label="${F.esc(t('lv.chipsAria'))}">${list.map((v) => (v <= mx
    ? `<button type="button" class="lev-chip" role="radio" data-action="lev-own" data-sym="${F.esc(sym)}" data-lev="${v}" aria-checked="${v === sel}">1:${v}</button>`
    : `<button type="button" class="lev-chip is-off" aria-disabled="true" data-action="lev-why" data-sym="${F.esc(sym)}" data-v="${v}">1:${v}</button>`)).join('')}</div>
    <p class="lev-why" hidden></p>`;
}
/* 1.12.0 the worst period of the whole account in the test 2023–26 – 1.13.2: one muted line for the chosen profile,
   only on robot signals in shares (the test was made on shares: Vyváženě −26 %, Agresivněji 1:5 −58 %) */
export function ddLine(id, sym, on = true) {
  if (!['bal', 'aggr'].includes(id) || M.levKind(sym) !== 'stock') return '';
  /* 1.13.5: the whole account in the test, apart from "Tento obchod" (two different losses never side by side) */
  return `<p class="mb-dd" data-p="${id}"${on ? '' : ' hidden'}>${t(`dd2.${id}`)}</p>`;
}
/* m = { s, data, sym, side, ccy, base, sl, tp, amountFor(col) | amount, depLine, ticket }
   1.13.2: card / detail = one main block per PROFILE (the chosen one shown) + the 3-profile comparison;
   ticket = { amount, lev, prof, open }: one main block for exactly what the sheet will buy, the columns compare the profiles */
export function moneyBlock(m) {
  const bt = m.s ? H.strat(m.data, m.s.horizon)?.backtest || null : null;
  const ok = !!(bt && Number.isFinite(+bt.avg_r) && bt.win_rate > 0);
  const arg = { side: m.side, entry: m.base, sl: m.sl, tp: m.tp, bt: ok ? bt : null };
  const mx = M.maxLev(m.sym) || 1;
  const cols = profCols(m.sym).map((c) => { const a = m.amountFor ? m.amountFor(c) : m.amount; return { ...c, a, n: levNums({ ...arg, amount: a, lev: c.lev }) }; });
  const tk = m.ticket || null;
  const onId = tk ? (cols.find((c) => c.id === tk.prof && c.lev === tk.lev) || {}).id || null : levProfile().id;
  const sm = (v) => sMoney(v, m.ccy);
  const wf = ok ? winFrac(bt.win_rate) : null;
  const worstTxt = (n) => (n.worst == null ? '–' : n.capped ? `${sm(n.worst)} <small class="mb-allw">${t('mb.all')}</small>` : sm(n.worst));
  const main = (key, a, lev, on, pid) => {
    const n = levNums({ ...arg, amount: a, lev });
    const nums = F.esc(JSON.stringify({ a, lev, l: Math.round(n.worst ?? 0), p: Math.round(n.best ?? 0), v: n.avg == null ? null : Math.round(n.avg) }));
    const dep = m.depLine ? `<p class="sc-dep">${t('c.dep', { a: F.money(a, m.ccy, 0) })}</p>` : '';
    if (!ok) {
      const pp = n.best != null && a > 0 ? (n.best / a) * 100 : null;
      return `<div class="mb-main${on ? ' is-on' : ''}" data-p="${key}" data-l="${lev}" data-nums="${nums}">${dep}
        <p class="sc-m"><span>${t('c.maxLoss')}${qh('MAXLOSS')}</span><b class="num down">${worstTxt(n)}</b></p>
        <p class="sc-m"><span>${t('c.potOld')}${qh('POTOLD')}</span><b class="num up">${n.best != null ? `${sm(n.best)} <small>(${F.spct(pp, 1)})</small>` : '–'}</b></p></div>`;
    }
    return `<div class="mb-main${on ? ' is-on' : ''}" data-p="${key}" data-l="${lev}" data-nums="${nums}">${dep}
      <p class="sc-m mb-avg"><span>${t('c.pot')}${qh('POT')}</span><b class="num up">${n.avg != null ? `≈ ${sm(n.avg)}<small>${t(`mb.dur.${m.s.horizon}`)}</small>` : `<span class="mb-na">–</span><small>${t('mb.naS')}</small>`}</b></p>
      ${wf ? `<p class="mb-win">${t('mb.win', { k: wf.k, z: t(wf.n <= 4 ? 'mb.ze' : 'mb.z'), n: wf.n })}</p>` : ''}
      <p class="sc-m"><span>${t('c.maxLoss')}${qh('MAXLOSS')}</span><b class="num down">${worstTxt(n)}</b></p></div>`;
  };
  const mains = tk ? main('cur', tk.amount, tk.lev, true, onId) : cols.map((c) => main(c.id, c.a, c.lev, c.id === onId, c.id)).join('');
  /* 1.13.3: a trade without a signal is sized by the deposit cap, not by the risk % -> its columns show the REAL share of
     the wallet lost at worst (computed), never the profile's nominal "riziko 1 %" */
  /* 1.13.4: the column = the profile's FIXED definition (riziko 1 % · bez páky); the real effect of THIS trade on the
     wallet is one separate line under the main block ("Tento obchod: nejhůř −300 Kč = 0,3 % peněženky") */
  const eq = D.sizingBase(null);
  const pctTxt = (v) => { const r = Math.round(v * 10) / 10; return F.num(r, r < 1 ? 1 : 0); };
  const cell = (c) => `<button type="button" class="mb-col${c.id === onId ? ' is-on' : ''}" role="radio" aria-checked="${c.id === onId}" data-action="lev-prof" data-prof="${c.id}" data-lev="${c.lev}">
      <span class="mb-ph"><span class="mb-pn">${t(`mb.p.${c.id}`)}</span><span class="mb-pl mb-pdep" data-dep="${Math.round(c.a)}">${t('mb.depCol', { a: `<span class="nw">${F.money(c.a, m.ccy, 0)}</span>` })}</span><span class="mb-pl">${levTxt(c.lev)}</span></span>
      <span class="mb-pv num">${ok ? (c.n.avg != null ? `≈ ${sm(c.n.avg)}` : '–') : (c.n.best != null ? sm(c.n.best) : '–')}</span>
      <span class="mb-pw num${c.n.capped ? ' is-all' : ''}">${c.n.worst != null ? sm(c.n.worst) : '–'}${c.n.capped ? `<small>${t('mb.all')}</small>` : ''}</span></button>`;
  const own = tk ? `<div class="mb-ownw${tk.open ? ' is-open' : ''}"><button type="button" class="mb-own-b${onId ? '' : ' is-on'}" data-action="lev-own-open" aria-expanded="${!!tk.open}">
      <span>${t('mb.own')}</span><b class="num mb-own-v">${onId ? '' : `1:${tk.lev}`}</b>${icon('chev-down', 'icon-xs')}</button>
    <div class="mb-own"${tk.open ? '' : ' hidden'}>${levChips(m.sym, tk.lev)}${M.isPro() ? `<p class="mb-pro">${t('lv.proOn')}</p>` : ''}</div></div>` : '';
  /* 1.13.4: the worst share of the deposit for the SELECTED profile (one note per column, the chosen one shown;
     the invest sheet: exactly what it will buy) – never the maximum over all profiles under "Konzervativně" */
  /* 1.13.5 ONE line per profile: "Tento obchod: nejhůř −1 000 Kč (13 % vkladu, 1 % peněženky)" – the chosen one shown;
     the invest sheet: exactly what it will buy. The whole account in the test is a separate muted line (ddLine). */
  const dPct = (a, worst) => (a > 0 && worst != null ? Math.round(Math.abs(worst) / a * 100) : null);
  const note = (key, a, n, on) => {
    const p = dPct(a, n.worst);
    if (p == null) return '';
    const w = eq > 0 ? Math.abs(n.worst) / eq * 100 : null;
    return `<p class="mb-note" data-p="${key}" data-maxpct="${p}"${w != null ? ` data-realpct="${w.toFixed(2)}"` : ''}${on ? '' : ' hidden'}>${t(w != null ? 'mb.trade' : 'mb.trade0', { v: `<span class="nw">${sm(n.worst)}</span>`, p, w: w != null ? pctTxt(w) : '' })}</p>`;
  };
  let notes;
  if (tk) {
    const n = levNums({ ...arg, amount: tk.amount, lev: tk.lev });
    notes = note('cur', tk.amount, n, true) + (m.s ? ddLine(onId, m.sym) : '');
  } else {
    notes = cols.map((c) => note(c.id, c.a, c.n, c.id === onId)).join('') + (m.s ? cols.map((c) => ddLine(c.id, m.sym, c.id === onId)).join('') : '');
  }
  const table = `<div class="mb-lev" style="--n:${cols.length}" role="radiogroup" aria-label="${F.esc(t('mb.levAria'))}">
      <div class="mb-rl" aria-hidden="true"><span class="mb-rl-h">${t('mb.rHead')}</span><span>${t(ok ? 'mb.rAvg' : 'mb.rBest')}</span><span>${t('mb.rWorst')}</span></div>
      ${cols.map(cell).join('')}</div>${own}${notes}<p class="mb-same">${t('mb.same')}</p>`;
  return `<div class="mb" data-max="${mx}" data-sym="${F.esc(m.sym)}">${mains}${table}
    <p class="sc-note">${t(ok ? 'c.potNote' : 'c.potNoteOld')}</p></div>`;
}
/* 1.11.2 "Příklady pák" (invest sheet): this signal / instrument and this deposit at 1:1 … 1:30 – the same numbers (levNums) */
export function levExamples(m) {
  const bt = m.s ? H.strat(m.data, m.s.horizon)?.backtest || null : null;
  const ok = !!(bt && Number.isFinite(+bt.avg_r) && bt.win_rate > 0);
  const arg = { side: m.side, entry: m.base, amount: m.amount, sl: m.sl, tp: m.tp, bt: ok ? bt : null };
  const mx = M.maxLev(m.sym) || 1, pro = M.proLev(m.sym);
  const rows = [1, 2, 5, 10, 20, 30].concat([50, 100].filter((v) => v <= mx));
  const sm = (v) => sMoney(v, m.ccy);
  const tr = rows.map((lev) => {
    const n = levNums({ ...arg, lev });
    const off = lev > mx;
    const tag = off ? `<small class="lx-off">${t(lev <= pro && !M.isPro() ? 'lx.onlyPro' : 'lx.never')}</small>` : '';
    const w = 100 / lev;
    const act = off ? `data-action="lev-why" data-sym="${F.esc(m.sym)}" data-v="${lev}"` : m.readonly ? '' : `data-action="lev-own" data-sym="${F.esc(m.sym)}" data-lev="${lev}"`;
    return `<tr class="${off ? 'is-off' : ''}${lev === m.sel ? ' is-on' : ''}" ${act} tabindex="0">
      <th scope="row" class="num">1:${lev}${tag}</th>
      <td class="num">${F.money(n.notional, m.ccy, 0)}</td>
      <td class="num up">${n.avg != null ? `≈ ${sm(n.avg)}` : '–'}</td>
      <td class="num up">${n.best != null ? sm(n.best) : '–'}</td>
      <td class="num down">${n.worst != null ? (n.capped ? `${sm(n.worst)}<small class="lx-all">${t('mb.all')}</small>` : sm(n.worst)) : '–'}</td>
      <td class="num">${F.num(w, w % 1 ? 1 : 0)} %</td></tr>`;
  }).join('');
  /* 1.11.3: phones get one 2-line card per leverage instead of the wide table (same levNums numbers, no sideways scroll) */
  const sn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + F.num(Math.abs(v), 0);
  const kv = (k, v, cls = '') => `<span class="lx-kv"><span class="lx-k">${k}</span> <b class="num ${cls}">${v}</b></span>`;
  const cards = rows.map((lev) => {
    const n = levNums({ ...arg, lev });
    const off = lev > mx, on = lev === m.sel;
    const w = 100 / lev;
    const act = off ? `data-action="lev-why" data-sym="${F.esc(m.sym)}" data-v="${lev}" aria-disabled="true"` : m.readonly ? `aria-current="${on}"` : `data-action="lev-own" data-sym="${F.esc(m.sym)}" data-lev="${lev}" role="radio" aria-checked="${on}"`;
    const worst = n.worst != null ? `${sn(n.worst)}${n.capped ? ` <small class="lx-allc">(${t('mb.all')})</small>` : ''}` : '–';
    return `<button type="button" class="lx-row${off ? ' is-off' : ''}${on ? ' is-on' : ''}" ${act}>
      <span class="lx-r1"><b class="num">1:${lev}</b> · ${t('lx.r.n', { v: `<span class="num">${F.money(n.notional, m.ccy, 0)}</span>` })}${off ? `<small class="lx-offc">${t(lev <= pro && !M.isPro() ? 'lx.onlyPro' : 'lx.never')}</small>` : ''}</span>
      <span class="lx-r2">${ok ? kv(t('lx.k.avg'), n.avg != null ? `≈ ${sn(n.avg)}` : '–', 'up') : ''}${kv(t('lx.k.tp'), n.best != null ? sn(n.best) : '–', 'up')}${kv(t('lx.k.sl'), worst, 'down')}${kv(t(m.side === 'SELL' ? 'lx.k.wipeSell' : 'lx.k.wipe'), `${m.side === 'SELL' ? '+' : '−'}${F.num(w, w % 1 ? 1 : 0)} %`)}</span></button>`;
  }).join('');
  return `<details class="lx"${m.exOpen ? ' open' : ''}><summary data-lx>${t('lx.title')}${icon('chev-down', 'icon-xs')}</summary>
    <p class="lx-sub">${t('lx.sub', { a: F.money(m.amount, m.ccy, 0) })}</p>
    <div class="lx-wrap"><table class="lx-tab"><thead><tr><th scope="col">${t('lx.c.lev')}</th><th scope="col">${t('lx.c.n')}</th><th scope="col">${t('lx.c.avg')}</th><th scope="col">${t('lx.c.tp')}</th><th scope="col">${t('lx.c.sl')}</th><th scope="col">${t(m.side === 'SELL' ? 'lx.c.wipeSell' : 'lx.c.wipe')}</th></tr></thead>
    <tbody>${tr}</tbody></table></div><div class="lx-cards"${m.readonly ? '' : ' role="radiogroup"'} aria-label="${F.esc(t('lx.title'))}">${cards}</div><p class="lev-why" hidden></p><p class="lx-note">${t(ok ? 'lx.note' : 'lx.noteOld')}</p></details>`;
}
/* 1.13.6 invest sheet: ONE money line above "Podrobnosti ▾" (same levNums as the card line) + a profile switch for this
   sheet only (data-lev: the ticket handler takes it, the global profile stays) */
export function tkMoneyLine(m) {
  const bt = m.s ? H.strat(m.data, m.s.horizon)?.backtest || null : null;
  const ok = !!(bt && Number.isFinite(+bt.avg_r) && bt.win_rate > 0);
  const x = levNums({ side: m.side, entry: m.base, amount: m.amount, sl: m.sl, tp: m.tp, lev: m.lev, bt: ok ? bt : null });
  const sm = (v) => sMoney(v, m.ccy);
  const nw = (v) => `<span class="nw">${v}</span>`;
  const gain = ok ? (x.avg != null ? t('cc.avg', { v: nw(`≈ ${sm(x.avg)}`) }) : t('cc.avgNa')) : t('cc.tp', { v: nw(x.best != null ? sm(x.best) : '–') });
  const loss = x.worst != null ? t(x.capped ? 'cc.maxAll' : 'cc.max', { v: sm(x.worst) }) : '';
  return `<p class="cc-ml tk-ml num" data-a="${Math.round(m.amount)}" data-l="${m.lev}" data-loss="${Math.round(x.worst ?? 0)}"><b class="nw">${F.money(m.amount, m.ccy, 0)}</b> → <span class="up">${gain}</span>${loss ? ` · <span class="down nw">${loss}</span>` : ''}</p>`;
}
export function tkProfSwitch(sym, prof, lev) {
  const cols = profCols(sym);
  return `<div class="pf-sw tk-pf" role="radiogroup" aria-label="${F.esc(t('mb.levAria'))}"><span class="pf-sw-l">${t('pf.sw')}</span><div class="pf-sw-g">${cols.map((c) => `<button type="button" class="pf-sw-b tk-pf-b" role="radio" aria-checked="${c.id === prof && c.lev === lev}" data-prof="${c.id}" data-lev="${c.lev}">${t(`mb.p.${c.id}`)}</button>`).join('')}</div></div>`;
}
/* card / detail: the block for the deposit of a signal (D.offerNums = same deposit and base price as the sheet) */
export function moneyFor(s, data, now = D.clock()) {
  const n = D.offerNums(s, data, { now });
  /* 1.13.5: ONE deposit for all profile columns (D.stakeFor = the Konzervativně stake); the profile changes the leverage */
  return { n, html: moneyBlock({ s, data, sym: s.symbol, side: s.action === 'SELL' ? 'SELL' : 'BUY', amount: n.amount, depLine: true, ccy: n.ccy, base: n.base, sl: s.stop, tp: s.target }) };
}
/* the motivating but true line, once per strategy: the whole robot account in the test */
export function testLine(s, data) {
  const c = D.walletCcy();
  const g = testGrowth(H.strat(data, s.horizon)?.backtest, c);
  if (!g) return '';
  return `<p class="mb-test">${icon('spark', 'icon-xs')}<span>${t('mb.test', { y0: g.y0, y1: g.y1, a: F.money(g.start, c, 0), b: F.money(g.end, c, 0) })}</span>${qh('TESTACC')}</p>`;
}
/* tap on a profile (card chip, detail column, Nastavení, onboarding): ONE choice for every money number in the app */
export function setLevProfile(id) {
  if (!LEV_PROFILES.some((p) => p.id === id)) return;
  D.setProf(id);
  syncLev();
  document.dispatchEvent(new CustomEvent('pulse:prof', { detail: id }));
}
/* a broker chip outside the invest sheet: only a chip equal to a profile column changes anything */
export function setLevOwn(v, sym) {
  const cols = sym ? profCols(sym) : [];
  const c = cols.find((x) => x.lev === v && x.id === levProfile().id) || cols.find((x) => x.lev === v);
  if (c) setLevProfile(c.id);
}
export function syncLev() {
  const pid = levProfile().id;
  /* compact cards: one money line per profile, the chosen one is shown */
  document.querySelectorAll('.cc-money [data-p]').forEach((x) => { x.hidden = x.dataset.p !== pid; });
  document.querySelectorAll('.cc-chip, .pf-sw-b:not(.tk-pf-b)').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.prof === pid)));
  document.querySelectorAll('.mb').forEach((mb) => {
    if (mb.closest('.tk-out')) return; /* the invest sheet re-renders itself from its own state */
    mb.querySelectorAll('.mb-main').forEach((x) => x.classList.toggle('is-on', x.dataset.p === pid));
    mb.querySelectorAll('.mb-note[data-p], .mb-dd[data-p]').forEach((x) => { x.hidden = x.dataset.p !== pid; });
    mb.querySelectorAll('.mb-col').forEach((x) => { const on = x.dataset.prof === pid; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); });
  });
}
/* 1.13.5 ONE profile switch above a list of signal cards (Dnes "Můžeš koupit", Signály, the new-signal sheet) */
export function profSwitch() {
  const pid = levProfile().id;
  return `<div class="pf-sw" role="radiogroup" aria-label="${F.esc(t('mb.levAria'))}"><span class="pf-sw-l">${t('pf.sw')}</span><div class="pf-sw-g">${D.PROFILES.map((p) => `<button type="button" class="pf-sw-b" role="radio" aria-checked="${p.id === pid}" data-action="lev-prof" data-prof="${p.id}">${t(`mb.p.${p.id}`)}</button>`).join('')}</div></div>`;
}
/* "Vlastní páka ▾" opens / closes the chip list of its block */
export function toggleOwn(el) {
  const w = el.closest('.mb-ownw'); if (!w) return;
  const box = w.querySelector('.mb-own');
  const open = box.hidden;
  box.hidden = !open; w.classList.toggle('is-open', open); el.setAttribute('aria-expanded', String(open));
}
/* tap on a disabled chip / row: the plain reason right under it */
export function showWhy(el) {
  const host = el.closest('.mb-own, .lx');
  const p = host?.querySelector('.lev-why');
  if (!p) return false;
  p.textContent = levWhy(el.dataset.sym, +el.dataset.v);
  p.hidden = false;
  return true;
}
export function facts(s, ph, now = D.clock()) {
  const w = whatIs(s.symbol, s.name);
  return `<dl class="sc-facts">
    <div><dt>${t('c.subj')}</dt><dd class="sc-subj">${monogram(s.symbol, s.name)}<span>${F.esc(w.name)}${w.name !== s.symbol ? ` <span class="ticker">${F.esc(s.symbol)}</span>` : ''}</span></dd></div>
    <div><dt>${t('c.side')}</dt><dd>${t(`c.side.${s.action === 'SELL' ? 'SELL' : 'BUY'}`)}</dd></div>
    <div><dt>${t('c.state')}</dt><dd>${phaseChip(ph)}</dd></div>
    <div><dt>${t('c.len')}${qh('DELKA')}</dt><dd class="num">${F.esc(lenText(s, now))}</dd></div>
  </dl>`;
}
/* closed: what the example deposit made */
export function closedLines(s, now = D.clock()) {
  const r = D.closedNums(s);
  const mt = D.moneyTone(r.money, r.ccy, r.pct);
  const at = D.closeDate(s);
  return `<div class="sc-res">
    <div><p class="sc-rl">${t('c.profit')}</p><p class="sc-rv num ${mt.tone}">${F.esc(mt.zero ? F.money(0, r.ccy, 0) : mt.text)}</p><p class="sc-rs">${t('c.profitS', { a: F.money(r.amount, r.ccy, 0) })}</p></div>
    <div><p class="sc-rl">${t('c.ret')}${qh('ZHOD')}</p><p class="sc-rv num ${mt.tone}">${r.pct != null ? F.spct(r.pct, 1) : '–'}</p></div>
    <div><p class="sc-rl">${t('c.closedAt')}</p><p class="sc-rv num">${at ? F.dm(at) : '–'}</p></div>
  </div>`;
}
/* 1.11.0 "Síla signálu" 1–3 dots from reward:risk of entering now (H.rrNow) – only on signals you can still enter */
/* 1.12.0: "Síla signálu" removed – a per-signal quality score did not hold out-of-sample (research 12. 11.).
   The honest per-horizon line (vydělá 1 ze 2 in the test) lives in the money block. */
export function strength() { return ''; }
/* 1.11.0: the watchdog's word on this signal's strategy (sleduj = neutral note, vypnuto = no new entries) */
export function healthNote(s, data) {
  const st = H.status(data, s.horizon);
  if (st !== 'sleduj' && st !== 'vypnuto') return '';
  return `<a class="le-note is-${st === 'vypnuto' ? 'off' : 'watch'}" href="#/uceni">${icon('shield', 'icon-xs')}<span>${t(st === 'vypnuto' ? 'le.det.off' : 'le.det.watch')}</span>${icon('chev-right', 'icon-xs')}</a>`;
}

/* 1.12.0 "Vstup: teď (burza otevřená do 22:00), nejvýš za 164,47" */
export function entryHtml(en, big = false) {
  return `<p class="sc-when sc-entry is-${en.code}${big ? ' is-big' : ''}">${icon(en.code === 'now' ? 'spark' : en.code === 'late' ? 'close' : 'clock', 'icon-xs')}<span>${F.esc(en.text)}</span></p>`;
}

export function offer(s, { data, now = D.clock(), notNow = false, i = 0, seen = null, isNew = false } = {}) {
  const cs = D.cardState(s, data, now);
  const ph = D.sigPhase(s, now);
  const w = whatIs(s.symbol, s.name);
  const sub = [t(`c.type.${s.horizon}`), w.phrase].filter(Boolean).join(' · ');
  let foot = '';
  if (cs.code === 'mine' || (cs.code === 'done' && cs.my)) {
    const mt = cs.my ? D.moneyTone(cs.my.money, cs.my.ccy, cs.my.pct) : null;
    foot = `<button type="button" class="sc-mine" data-action="open-signal" data-id="${F.esc(s.id)}"><span>${t(cs.code === 'done' ? 'sc.mineDone' : 'sc.mine')}</span>${mt ? `<b class="num ${mt.tone}">${F.esc(mt.text)}</b>` : ''}${icon('chev-right', 'icon-xs')}</button>`;
  } else if (cs.cta) {
    const lim = cs.cta === 'limit';
    foot = `<div class="sc-btns"><button type="button" class="btn btn-primary sc-go" data-action="invest" data-id="${F.esc(s.id)}" data-mode="${lim ? 'limit' : 'now'}">${icon(lim ? 'clock' : 'spark', 'icon-sm')}<span>${lim ? t('inv.btnLim', { v: D.spx(s, D.maxEntry(s)) }) : t('sc.invest')}</span></button>${notNow ? `<button type="button" class="btn btn-ghost sc-no" data-action="not-now" data-id="${F.esc(s.id)}">${t('sc.notNow')}</button>` : ''}</div>`;
  }
  let money = '';
  if (ph === 'closed') money = closedLines(s, now);
  else if (ph === 'open' && !['mine', 'order'].includes(cs.code)) {
    const { n, html } = moneyFor(s, data, now);
    /* the robot's whole-account test result: once per strategy in a list (seen), always on a single card */
    const tl = !seen || !seen.has(s.horizon) ? testLine(s, data) : '';
    if (seen) seen.add(s.horizon);
    money = `<div class="sc-money">${html}</div>${tl}`;
  } else if (ph === 'running') {
    const mv = D.priceMove(s);
    if (mv != null) money = `<p class="sc-mv"><span>${t('c.move')}</span><b class="num">${F.spct(mv, 1)}</b></p>`;
  }
  /* 1.12.0: the exact entry line (when + at what price) instead of the general sentence; same cardState */
  const en = cs.code === 'mine' || ph === 'closed' ? null : D.entryLine(s, data, now, cs);
  const when = cs.code === 'mine' || ph === 'closed' ? '' : en ? entryHtml(en) : `<p class="sc-when is-${cs.code}">${F.esc(cs.text)}</p>`;
  /* 1.10.0: the whole card is one tappable tile -> the detail (inner buttons keep their own action) */
  return `<article class="sc is-${cs.code} ph-${ph} hz-${F.esc(s.horizon || '')}${isNew ? ' is-new' : ''} is-tile" style="--i:${Math.min(i, 8)}" data-live-id="${F.esc(s.id)}" data-sig="${F.esc(s.id)}" data-action="open-signal" data-id="${F.esc(s.id)}">
    <div class="sc-head" role="button" tabindex="0" data-action="open-signal" data-id="${F.esc(s.id)}" aria-label="${F.esc(sigTitleText(s))}">
      <span class="sc-id"><span class="sc-title">${sigTitle(s)}</span>
        <span class="sc-s">${F.esc(sub)}${s.preview ? ` <span class="hz-tag is-preview" title="${F.esc(t('sig.preview.t'))}">${t('sig.preview')}</span>` : ''}</span></span>
      ${icon('chev-right', 'icon-xs sc-chev')}
    </div>
    ${facts(s, ph, now)}
    ${ph === 'closed' ? '' : whyBlock(s)}
    ${money}
    ${when}
    ${foot}
  </article>`;
}

/* ---------- 1.13.0 THE compact signal card (Dnes, Signály, Zainvestováno, "Nový signál" sheet) ----------
   ~150 px: logo + "ExxonMobil ↑ Koupit" + horizon pill + "do 17. 11." pill · one "Proč" line · the exact entry (short)
   · ONE money line for the chosen leverage profile · 3 profile chips · [Zainvestovat] + small "Teď ne".
   Everything else (profile table, Příklady pák, warnings, test line, full reasoning) lives in the detail. */
export function ccMoneyLines(s, data, now = D.clock(), { chips: withChips = true } = {}) {
  const n = D.offerNums(s, data, { now });
  const bt = H.strat(data, s.horizon)?.backtest || null;
  const ok = !!(bt && Number.isFinite(+bt.avg_r) && bt.win_rate > 0);
  const pid = levProfile().id;
  const cols = profCols(s.symbol);
  const side = s.action === 'SELL' ? 'SELL' : 'BUY';
  const sm = (v) => sMoney(v, n.ccy);
  /* 1.13.5: each line = the ONE deposit (D.stakeFor) with that profile's leverage – the same deposit as the detail, the sheet and the robot */
  const line = (c) => {
    const a = n.amount;
    const x = levNums({ side, entry: n.base, amount: a, sl: s.stop, tp: s.target, lev: c.lev, bt: ok ? bt : null });
    const nw = (v) => `<span class="nw">${v}</span>`;
    const gain = ok ? (x.avg != null ? t('cc.avg', { v: nw(`≈ ${sm(x.avg)}`) }) : t('cc.avgNa')) : t('cc.tp', { v: nw(x.best != null ? sm(x.best) : '–') });
    const loss = x.worst != null ? t(x.capped ? 'cc.maxAll' : 'cc.max', { v: nw(sm(x.worst)) }) : '';
    return `<p class="cc-ml num" data-p="${c.id}" data-l="${c.lev}" data-a="${a}" data-avg="${x.avg == null ? '' : Math.round(x.avg)}" data-loss="${Math.round(x.worst ?? 0)}"${c.id === pid ? '' : ' hidden'}><b class="nw">${F.money(a, n.ccy, 0)}</b> → <span class="up">${gain}</span>${loss ? ` · <span class="down nw">${loss}</span>` : ''}</p>`;
  };
  /* the three profile chips only on the first card of a list (and in the detail / sheet) */
  const chips = withChips ? `<div class="cc-chips" role="radiogroup" aria-label="${F.esc(t('mb.levAria'))}">${cols.map((c) => `<button type="button" class="cc-chip" role="radio" aria-checked="${c.id === pid}" data-action="lev-prof" data-prof="${c.id}" data-lev="${c.lev}">${t(`mb.p.${c.id}`)}<small class="num">${F.num(c.pct, 0)} % · ${c.lev > 1 ? `1:${c.lev}` : t('mb.noLev')}</small></button>`).join('')}</div>` : '';
  return { html: `<div class="cc-money" data-sym="${F.esc(s.symbol)}">${cols.map(line).join('')}</div>`, chips, n };
}
function enShort(s, en, now) {
  if (en.code === 'now') return t('cp.now', { c: F.time(new Date(nyCloseAfterMs(+now))) });
  if (en.code === 'soon') { const o = nextUsOpen(now); const days = o ? F.daysUntil(o, now) : 1; return t('cp.soon', { day: days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(o), time: o ? F.time(o) : '15:30' }); }
  if (en.code === 'wait') return t(s.action === 'SELL' ? 'cp.waitSell' : 'cp.wait', { v: D.spx(s, D.maxEntry(s)) });
  if (en.code === 'order') return t('cp.order');
  return '';
}
/* the first card of a list that shows money lines (it carries the three profile chips) */
export function firstMoneyIdx(list, data, now = D.clock()) {
  return list.findIndex((x) => D.sigPhase(x, now) === 'open' && !['mine', 'order', 'done'].includes(D.cardState(x, data, now).code));
}
export function compact(s, { data, now = D.clock(), notNow = false, i = 0, isNew = false, chips = null } = {}) {
  const cs = D.cardState(s, data, now);
  const ph = D.sigPhase(s, now);
  const w = whatIs(s.symbol, s.name);
  const sell = s.action === 'SELL';
  const why = ph === 'closed' ? '' : whyBullets(s, 1)[0] || '';
  const en = cs.code === 'mine' || ph === 'closed' ? null : D.entryLine(s, data, now, cs, true);
  /* the exact entry rides in one small pill ("Vstup teď do 22:00" / "Vstup zítra od 15:30") – the long line is in the detail */
  const enPill = en && en.code !== 'late' && !(en.code === 'order' && cs.code === 'order') ? `<span class="cc-pill is-${en.code} num">${F.esc(enShort(s, en, now))}</span>` : '';
  const pills = `<span class="cc-pill">${t(`c.typeS.${s.horizon}`)}</span>${s.exit_date && ph !== 'closed' ? `<span class="cc-pill num">${t('cc.until', { d: F.dm(s.exit_date) })}</span>` : ''}${enPill}${['order', 'late', 'done'].includes(cs.code) && !cs.my ? `<span class="cc-pill tone-${cs.tone}">${F.esc(cs.badge)}</span>` : ''}${s.preview ? `<span class="cc-pill is-preview">${t('sig.preview')}</span>` : ''}`;
  let mid = '', foot = '';
  if (ph === 'closed') {
    const r = D.closedNums(s);
    const mt = D.moneyTone(r.money, r.ccy, r.pct);
    mid = `<p class="cc-ml num">${t('cc.closed', { a: F.money(r.amount, r.ccy, 0) })} <b class="${mt.tone}">${F.esc(mt.zero ? F.money(0, r.ccy, 0) : mt.text)}</b>${r.pct != null ? ` <small class="${mt.tone}">(${F.spct(r.pct, 1)})</small>` : ''}</p>`;
  } else if (cs.code === 'mine' || (cs.code === 'done' && cs.my)) {
    const mt = cs.my ? D.moneyTone(cs.my.money, cs.my.ccy, cs.my.pct) : null;
    foot = `<button type="button" class="sc-mine" data-action="open-signal" data-id="${F.esc(s.id)}"><span>${t(cs.code === 'done' ? 'sc.mineDone' : 'sc.mine')}</span>${mt ? `<b class="num ${mt.tone}">${F.esc(mt.text)}</b>` : ''}${icon('chev-right', 'icon-xs')}</button>`;
  } else if (ph === 'open' && cs.code !== 'order') {
    /* 1.13.5: no profile chips on cards – ONE switch above the list (B.profSwitch) changes every card */
    mid = ccMoneyLines(s, data, now, { chips: false }).html;
  } else if (ph === 'running') {
    const mv = D.priceMove(s);
    mid = `<p class="cc-ml">${t('u.do.late')}${mv != null ? ` · <span class="num">${t('cc.move', { v: F.spct(mv, 1) })}</span>` : ''}</p>`;
  }
  if (!foot && cs.cta) {
    const lim = cs.cta === 'limit';
    foot = `<div class="cc-act"><button type="button" class="btn btn-primary cc-go sc-go" data-action="invest" data-id="${F.esc(s.id)}" data-mode="${lim ? 'limit' : 'now'}">${icon(lim ? 'clock' : 'spark', 'icon-sm')}<span>${t('sc.invest')}</span></button>${notNow ? `<button type="button" class="link cc-no" data-action="not-now" data-id="${F.esc(s.id)}">${t('sc.notNow')}</button>` : ''}</div>`;
  }
  return `<article class="cc sc is-${cs.code} ph-${ph}${isNew ? ' is-new' : ''}" style="--i:${Math.min(i, 8)}" data-live-id="${F.esc(s.id)}" data-sig="${F.esc(s.id)}" data-action="open-signal" data-id="${F.esc(s.id)}">
    <div class="cc-head sc-head" role="button" tabindex="0" data-action="open-signal" data-id="${F.esc(s.id)}" aria-label="${F.esc(sigTitleText(s))}">
      ${monogram(s.symbol, s.name)}
      <span class="cc-id"><span class="cc-t"><b class="cc-name">${F.esc(w.name)}</b><span class="cc-dir ${sell ? 'down' : 'up'}">${sell ? '↓' : '↑'} ${t(`c.side.${sell ? 'SELL' : 'BUY'}`)}</span></span>
        <span class="cc-pills">${pills}</span></span>
      ${icon('chev-right', 'icon-xs cc-chev')}
    </div>
    ${why ? `<p class="cc-why"><b>${t('c.why')}</b> ${F.esc(why)}</p>` : ''}
    ${mid}
    ${foot}
  </article>`;
}

/* ---------- 1.10.0 headline numbers (Dnes: one compact row; Výsledky: big) – only real closed signals ---------- */
export function statsRow(data, now = D.clock()) {
  const h = D.headStats(data, now);
  if (!h.n) return ''; // 1.13.0: shown only once a first result exists
  const txt = t('hs.row', { n: h.n, w: F.pct(h.winRate, 0), a: F.spct(h.avg, 1) });
  return `<a class="hs-row" href="#/vysledky">${icon('results', 'icon-xs')}<span>${F.esc(txt)}${h.since ? ` · ${F.esc(t('hs.since', { d: F.dmy(h.since) }))}` : ''}</span>${icon('chev-right', 'icon-xs')}</a>`;
}
export function statsBig(data, now = D.clock()) {
  const h = D.headStats(data, now);
  const v = (x) => (h.n ? x : '–');
  return `<section class="hs-big" aria-label="${F.esc(t('hs.closed'))}">
    <div class="hs-grid">
      <div class="hs-c"><p class="hs-l">${t('hs.closed')}</p><p class="hs-v num">${h.n}</p></div>
      <div class="hs-c"><p class="hs-l">${t('hs.win')}${qh('USPECH')}</p><p class="hs-v num">${v(F.pct(h.winRate, 0))}</p>${h.n ? `<p class="hs-s">${t('hs.winS', { w: h.wins, n: h.n })}</p>` : ''}</div>
      <div class="hs-c"><p class="hs-l">${t('hs.avg')}${qh('AVG')}</p><p class="hs-v num ${h.avg > 0 ? 'up' : h.avg < 0 ? 'down' : ''}">${v(F.spct(h.avg, 1))}</p></div>
      <div class="hs-c"><p class="hs-l">${t('hs.sinceL')}</p><p class="hs-v num">${h.since ? F.dmy(h.since) : '–'}</p></div>
    </div>
    ${h.n ? '' : `<p class="hs-zero">${t('hs.zero')}</p>`}
    <p class="hs-foot"><span>${t('hs.asOf', { d: F.dmy(now) })}</span><a class="link" href="#/duvera">${t('trust.title')}</a></p>
  </section>`;
}
/* "Výsledky čerstvě uzavřených signálů" – the last N closed (losses too) */
export function freshTable(data, { n = 10, now = D.clock(), more = false } = {}) {
  const list = D.closedSignals(data, now).slice(0, n);
  if (!list.length) return `<p class="d-empty">${t('fr.none')}</p>`;
  const rows = list.map((s) => {
    const r = D.closedNums(s);
    const tone = r.pct == null ? '' : r.pct > D.FLAT_PCT ? 'up' : r.pct < -D.FLAT_PCT ? 'down' : '';
    const d = D.sigDays(s, now);
    const at = D.closeDate(s);
    return `<tr data-action="open-signal" data-id="${F.esc(s.id)}" tabindex="0"><th scope="row">${sigTitle(s)}</th><td>${t(`c.typeS.${s.horizon}`)}</td>
      <td class="num ${tone}">${r.pct != null ? F.spct(r.pct, 1) : '–'}</td><td class="num">${d != null ? `${d} ${F.unit('day', d)}` : '–'}</td><td class="num">${at ? F.dm(at) : '–'}</td></tr>`;
  }).join('');
  return `<div class="fr-wrap"><table class="fr-tab"><thead><tr><th scope="col">${t('fr.c.sig')}</th><th scope="col">${t('fr.c.type')}</th><th scope="col">${t('fr.c.ret')}</th><th scope="col">${t('fr.c.len')}</th><th scope="col">${t('fr.c.date')}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>${more ? `<a class="d-more" href="#/vysledky">${t('fr.more')}${icon('chev-right', 'icon-xs')}</a>` : `<p class="fr-note">${t('fr.note')}</p>`}`;
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
