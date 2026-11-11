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
  const [a, b] = nm.split(' – ');
  const ip = t(`ip.${sym}`);
  return { name: a, phrase: ip !== `ip.${sym}` ? ip : b || t(`cls.${it.class}`) };
}

/* ---------- user's state ---------- */
function walletOf(s) {
  const w = store.get('wallet', null);
  return { pos: (w?.positions || []).find((p) => p.sigId === s.id) || null, ord: (w?.orders || []).find((o) => o.sigId === s.id) || null };
}
export function isDone(s, now) {
  return (s.status && s.status !== 'open') || !!s.intraday_hit || D.isTimeExit(s, now);
}
/* code: buy | mine | order | robot | done */
export function userState(s, now = D.clock()) {
  const { pos, ord } = walletOf(s);
  const j = D.journal()[s.id];
  const mineIn = !!pos || j?.state === 'in';
  if (isDone(s, now)) return { code: 'done', mine: mineIn || j?.state === 'closed' };
  if (mineIn) return { code: 'mine', pos };
  if (ord) return { code: 'order', ord };
  const est = D.entryState(s, now);
  if (!est || est.code === 'late' || est.code === 'expired') return { code: 'robot' };
  return { code: 'buy', est };
}

const CHIP_TONE = { buy: 'up', mine: 'gold', order: 'gold', robot: 'flat', done: 'flat' };
export function stateChip(s, us) {
  const k = us.code === 'buy' && s.action === 'SELL' ? 'buySell' : us.code === 'mine' && s.action === 'SELL' ? 'mineSell' : us.code;
  return `<span class="u-chip tone-${CHIP_TONE[us.code]}">${t(`u.chip.${k}`)}</span>`;
}

/* ---------- 2 CO MÁM UDĚLAT JÁ ---------- */
export function todo(s, us, now = D.clock()) {
  const sell = s.action === 'SELL';
  const e = F.price(s.entry);
  if (us.code === 'done') return { tone: 'flat', text: t(us.mine ? 'u.do.endMine' : 'u.do.end') };
  if (us.code === 'mine') return { tone: 'gold', text: t(sell ? 'u.do.holdSell' : 'u.do.hold') };
  if (us.code === 'order') return { tone: 'gold', text: t('u.do.order', { v: F.price(us.ord.limit) }) };
  if (us.code === 'robot') return { tone: 'flat', text: t('u.do.late'), sub: t('u.do.lateS') };
  /* buy: market closed -> at the next open; price beyond the entry -> wait with a limit; else now */
  if (!Live.marketOpen(now)) {
    const o = nextUsOpen(now);
    const days = o ? F.daysUntil(o, now) : 1;
    const day = days === 0 ? t('fmt.today') : days === 1 ? t('fmt.tomorrow') : F.weekday(o);
    return { tone: 'up', code: 'soon', text: t(sell ? 'u.do.soonSell' : 'u.do.soon', { day, time: o ? F.time(o) : '15:30', v: e }) };
  }
  const px = s.last_price;
  const beyond = px != null && (sell ? px < s.entry : px > s.entry);
  const until = F.time(W.nyCloseAfter(now.getTime ? now.getTime() : now));
  if (beyond) return { tone: 'gold', code: 'wait', text: t(sell ? 'u.do.waitSell' : 'u.do.wait', { v: e, c: until }) };
  return { tone: 'up', code: 'now', text: t(sell ? 'u.do.nowSell' : 'u.do.now', { v: e, c: until }) };
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
  const br = p.broker || 'Alpaca Paper';
  if (pos) return `${t(pos.side === 'short' ? 'u.bot.sold' : 'u.bot.bought', { q: F.num(Math.abs(+pos.qty || 0), 0), v: F.price(+pos.avg_entry) })}${when(pos)} · ${br}`;
  const cl = (p.closed || []).find(hit);
  if (cl) return `${t('u.bot.closed', { v: usd(+cl.pnl_usd || 0) })}${when(cl)} · ${br}`;
  const ord = (p.orders || []).find((o) => hit(o) && (o.status === 'new' || o.status === 'accepted' || o.status === 'pending_new'));
  if (ord) return `${t(ord.side === 'sell' ? 'u.bot.waitSell' : 'u.bot.wait', { v: F.price(+ord.limit) })} · ${br}, ${t('u.bot.placed', { time: F.time(ord.submitted_at) })}`;
  const sk = (p.skipped || []).find(hit);
  if (sk) return t('u.bot.skip', { why: sk.reason_cs && lang() === 'cs' ? sk.reason_cs : sk.reason || t('u.bot.skipWhy') });
  return '';
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

/* ---------- the card (Signály: full; Dnes / Moje: compact) ---------- */
export function card(s, { data, now = D.clock(), compact = false, invest = true, i = 0 } = {}) {
  const us = userState(s, now);
  const w = whatIs(s.symbol, s.name);
  const td = todo(s, us, now);
  const bot = robotLine(s, data);
  const st = D.liveStatus(s, now);
  const tags = `<span class="hz-tag">${F.esc(F.HZ_LABEL[s.horizon] || '')}</span>${s.preview ? `<span class="hz-tag is-preview" title="${F.esc(t('sig.preview.t'))}">${t('sig.preview')}</span>` : ''}`;
  const mv = st.move;
  const showInvest = invest && (us.code === 'buy');
  return `<article class="bc tone-${td.tone} is-${us.code} ${compact ? 'is-compact' : ''}" style="--i:${Math.min(i, 8)}" data-live-id="${F.esc(s.id)}" data-pnl="${mv ?? ''}">
    <div class="bc-head" role="button" tabindex="0" data-action="open-signal" data-id="${F.esc(s.id)}" aria-label="${F.esc(`${w.name} ${s.symbol}`)}">
      ${monogram(s.symbol, s.name)}
      <span class="bc-id b-what"><span class="bc-name">${F.esc(w.name)}${w.name !== s.symbol ? ` <span class="ticker">${F.esc(s.symbol)}</span>` : ''}</span>
        <span class="bc-phrase">${F.esc(w.phrase)}</span></span>
      ${mv != null ? `<span class="bc-pct num sig-pnl ${mv >= 0 ? 'up' : 'down'}">${F.spct(mv, 2)}</span>` : ''}
    </div>
    <p class="bc-tags">${stateChip(s, us)}${tags}</p>
    <p class="bc-pub">${icon('clock', 'icon-xs')}<span>${F.esc(published(s))}</span></p>
    <p class="bc-todo b-todo tone-${td.tone}">${F.esc(td.text)}</p>
    ${td.sub ? `<p class="bc-sub">${F.esc(td.sub)}</p>` : ''}
    ${bot ? `<p class="bc-bot b-bot">${icon('shield', 'icon-xs')}<span>${F.esc(bot)}</span></p>` : ''}
    ${miniChart(s)}
    <p class="st-line b-how tone-${st.tone} is-${st.code}"><i aria-hidden="true"></i><b>${F.esc(st.text)}</b>${st.um?.now != null ? `<span>${F.esc(t('st.you', { m: (st.um.now > 0.5 ? '+' : '') + F.money(st.um.now, st.um.ccy, 0) }))}</span>` : ''}</p>
    ${showInvest ? `<a class="invest-btn" href="#/terminal?s=${encodeURIComponent(s.id)}">${icon('spark', 'icon-sm')}<span>${t('inv.btn')}</span><small>${t('inv.btnS')}</small></a>` : ''}
    ${compact ? '' : `<details class="bc-more"><summary>${t('u.more')}${icon('chev-down', 'icon-xs')}</summary>
      ${track(s, { now, prices: true, status: false })}
      <p class="bc-lv num">${t('u.lv', { e: F.price(s.entry), s: F.price(s.stop), t: s.target != null ? F.price(s.target) : '–' })}</p>
      <p class="bc-lv">${F.esc(st.hint || '')}${s.exit_date ? ` · ${t('u.until', { d: F.dm(s.exit_date) })}` : ''}</p>
      ${robotPosOf(s, data) ? `<p class="bc-lv bc-open-l">${icon('shield', 'icon-xs')} ${F.esc(robotOpenText(robotPosOf(s, data), data, s.stop))}</p>` : ''}
      <button type="button" class="link bc-open" data-action="open-signal" data-id="${F.esc(s.id)}">${t('u.detail')}${icon('chev-right', 'icon-xs')}</button>
    </details>`}
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
