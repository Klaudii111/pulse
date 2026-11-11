// 1.9.0 – every signal answers four questions, from the USER's point of view, in this order:
//   1 CO TO JE (plain name + one phrase), 2 CO MÁM UDĚLAT JÁ (one sentence, one colour),
//   3 CO UDĚLAL ROBOT (quiet line from paper.json), 4 JAK SE DAŘÍ (the shared status line).
// Plus ONE state chip from the user's side: Můžeš koupit / Máš koupeno / Čeká tvůj limitní příkaz /
// Robot drží – ty už nekupuj / Ukončeno. Everything else (levels, bar, risk, dates) sits behind "Podrobnosti".
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
  let out = txt.split(/\s*;\s*/).map(plain).filter((x) => x.length > 3);
  if (!out.length) out = (s.reasons || []).map((r) => L(r)).filter(Boolean);
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
/* the two fixed numbers (card, detail) – same words as the investment sheet */
export function moneyLines(n) {
  return `<p class="sc-m"><span>${t('c.maxLoss')}${qh('MAXLOSS')}</span><b class="num down">${n.maxLoss != null ? sMoney(n.maxLoss, n.ccy) : '–'}</b></p>
    <p class="sc-m"><span>${t('c.pot')}${qh('POT')}</span><b class="num up">${n.potential != null ? `${sMoney(n.potential, n.ccy)} <small>(${F.spct(n.potentialPct, 1)})</small>` : '–'}</b></p>
    <p class="sc-note">${t('c.potNote')}</p>`;
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
export function offer(s, { data, now = D.clock(), notNow = false, i = 0 } = {}) {
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
    foot = `<div class="sc-btns"><button type="button" class="btn btn-primary sc-go" data-action="invest" data-id="${F.esc(s.id)}" data-mode="${lim ? 'limit' : 'now'}">${lim ? t('inv.btnLim', { v: F.price(s.entry) }) : t('sc.invest')}</button>${notNow ? `<button type="button" class="btn btn-ghost sc-no" data-action="not-now" data-id="${F.esc(s.id)}">${t('sc.notNow')}</button>` : ''}</div>`;
  }
  let money = '';
  if (ph === 'closed') money = closedLines(s, now);
  else if (ph === 'open' && !['mine', 'order'].includes(cs.code)) {
    const n = D.offerNums(s, data, { now });
    money = `<div class="sc-money" data-nums="${F.esc(JSON.stringify({ a: n.amount, l: Math.round(n.maxLoss ?? 0), p: Math.round(n.potential ?? 0) }))}"><p class="sc-dep">${t('c.dep', { a: F.money(n.amount, n.ccy, 0) })}</p>${moneyLines(n)}</div>`;
  } else if (ph === 'running') {
    const mv = D.priceMove(s);
    if (mv != null) money = `<p class="sc-mv"><span>${t('c.move')}</span><b class="num">${F.spct(mv, 1)}</b></p>`;
  }
  const when = cs.code === 'mine' || ph === 'closed' ? '' : `<p class="sc-when is-${cs.code}">${F.esc(cs.text)}</p>`;
  /* 1.10.0: the whole card is one tappable tile -> the detail (inner buttons keep their own action) */
  return `<article class="sc is-${cs.code} ph-${ph} is-tile" style="--i:${Math.min(i, 8)}" data-live-id="${F.esc(s.id)}" data-sig="${F.esc(s.id)}" data-action="open-signal" data-id="${F.esc(s.id)}">
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

/* ---------- 1.10.0 headline numbers (Dnes: one compact row; Výsledky: big) – only real closed signals ---------- */
export function statsRow(data, now = D.clock()) {
  const h = D.headStats(data, now);
  const txt = h.n ? t('hs.row', { n: h.n, w: F.pct(h.winRate, 0), a: F.spct(h.avg, 1) }) : t('hs.row0');
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
