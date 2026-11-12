// "Co se děje" (1.7.0): an event feed derived on this device by diffing data snapshots.
// Snapshots + events live in store.js (localStorage with in-memory fallback). The very first time a source is seen
// it is only recorded (no flood of old events). Sources: signals.json + history.json, paper.json (robot), the wallet
// of the Obchodní platforma, and (1.8.0) its limit orders. Texts are built at display time (language switch works), events keep only data.
import { CONFIG } from '../config.js';
import * as store from './store.js';
import { HORIZONS } from './domain.js';

const SNAP = 'feedSnap', EV = 'feed', SEEN = 'feedSeen', MAX = 100;
const pfx = (id) => String(id).replace(/-\d+$/, '');

function sigCode(s) {
  if (s.status && s.status !== 'open') return s.status === 'target' || s.status === 'stop' ? s.status : 'ended';
  if (s.intraday_hit === 'target' || s.intraday_hit === 'stop') return s.intraday_hit;
  return 'open';
}

export const events = () => { const e = store.get(EV, []); return Array.isArray(e) ? e : []; };
export const seenAt = () => store.get(SEEN, 0) || 0;
/* 1.15.0 (A10 / K3-03): what the screen shows - duplicates dropped (same id, or same kind + trade / order / signal + minute),
   newest first by the time the thing HAPPENED (e.t), so the day groups never come as Dnes … Včera … Dnes */
export const evTime = (e) => { const x = typeof e.t === 'number' ? e.t : Date.parse(e.t || ''); return Number.isFinite(x) && x > 0 ? x : e.at; };
export function display() {
  const seen = new Set(), out = [];
  events().forEach((e) => {
    if (!e || !e.k) return;
    const ts = evTime(e);
    const k1 = e.id ? `id|${e.id}` : null;
    const k2 = `${e.k}|${e.pid || e.sid || e.sym || ''}|${e.lim ?? ''}|${Math.floor(ts / 60000)}`;
    if ((k1 && seen.has(k1)) || seen.has(k2)) return;
    if (k1) seen.add(k1); seen.add(k2);
    out.push({ ...e, ts });
  });
  return out.sort((a, b) => b.ts - a.ts);
}
export const unread = () => { const s = seenAt(); return display().filter((e) => e.at > s).length; };
export function markSeen() { store.set(SEEN, Date.now()); }

/* Compare the current data with the last snapshot, add new events. Returns the number of new events. */
export function update(data) {
  try {
    const snap = store.get(SNAP, {}) || {};
    let dirty = false;
    const ev = [];
    const now = Date.now();
    const hidden = new Set(CONFIG.HIDDEN_HORIZONS || []);

    /* ---- signals ---- */
    if (data?.signals?.tracks) {
      const cur = {}, meta = {}, open = new Set();
      HORIZONS.forEach((h) => (data.signals.tracks[h] || []).forEach((s) => {
        const hz = s.horizon || h;
        if (hidden.has(hz)) return;
        cur[s.id] = sigCode(s); meta[s.id] = s; open.add(s.id);
      }));
      (data.history?.signals || []).forEach((s) => {
        if (hidden.has(s.horizon)) return;
        const c = sigCode(s);
        if (c !== 'open' || !cur[s.id]) { cur[s.id] = c; meta[s.id] = s; }
      });
      if (snap.sig) {
        const known = new Set(Object.keys(snap.sig).map(pfx));
        Object.entries(cur).forEach(([id, c]) => {
          const prev = snap.sig[id];
          const s = meta[id];
          if (prev === undefined) {
            /* an official signal replacing its intraday preview (same horizon, day, symbol) is not "new" */
            if (c === 'open' && open.has(id) && !known.has(pfx(id))) ev.push({ k: 'new', sid: id, sym: s.symbol, side: s.action, t: s.created_at || null });
          } else if (prev !== c && c !== 'open') {
            ev.push({ k: c, sid: id, sym: s.symbol, side: s.action, t: (c === 'ended' ? s.closed_at : s.hit_at || s.closed_at) || null, v: s.pnl_pct_position ?? s.result_pct ?? null });
          }
        });
      }
      /* keep old ids for a while (a file that failed to load must not make a status change look new) */
      const next = { ...(snap.sig || {}) };
      Object.assign(next, cur);
      const keys = Object.keys(next);
      if (keys.length > 800) keys.slice(0, keys.length - 800).forEach((k) => { if (!(k in cur)) delete next[k]; });
      if (JSON.stringify(next) !== JSON.stringify(snap.sig || null)) { snap.sig = next; dirty = true; }
    }

    /* ---- robot (paper.json) ---- */
    const p = data?.paper;
    if (p && p.account) {
      const pos = (p.positions || []).map((x) => `${x.symbol}|${x.side}`);
      const cl = (p.closed || []).map((c) => `${c.symbol}|${c.closed_at || ''}|${c.entry ?? ''}`);
      const log = (p.log || []).slice(0, 80).map(String);
      if (snap.pa) {
        const pp = new Set(snap.pa.pos), pc = new Set(snap.pa.cl), pl = new Set(snap.pa.log);
        /* log first: it is newest-first, show the order before the fill */
        log.filter((l) => !pl.has(l) && /zad[aá]n|submitted|placed/i.test(l) && !/p[řr]esko[čc]|skipp/i.test(l)).reverse()
          .forEach((l) => ev.push({ k: 'robot-order', sym: (l.split(':')[0] || '').trim().slice(0, 12), side: /prodej|sell|short/i.test(l) ? 'SELL' : 'BUY' }));
        (p.positions || []).forEach((x, i) => { if (!pp.has(pos[i])) ev.push({ k: 'robot-open', sym: x.symbol, side: x.side === 'short' ? 'SELL' : 'BUY', sid: x.signal_id || null }); });
        (p.closed || []).forEach((c, i) => { if (!pc.has(cl[i])) ev.push({ k: 'robot-close', sym: c.symbol, v: +c.pnl_usd, pct: +c.pnl_pct, ccy: 'USD', sid: c.signal_id || null, t: c.closed_at || null }); });
      }
      const next = { pos, cl: cl.slice(0, 200), log };
      if (JSON.stringify(next) !== JSON.stringify(snap.pa || null)) { snap.pa = next; dirty = true; }
    }

    /* ---- my Obchodní platforma (wallet.js) ---- */
    const w = store.get('wallet', null);
    const wpos = (w?.positions || []);
    const wcl = (w?.closed || []);
    const wp = wpos.map((x) => `${x.id}@${x.openedAt}`);
    const wc = wcl.map((x) => `${x.id}@${x.closedAt}`);
    if (snap.wal) {
      const pp = new Set(snap.wal.pos), pc = new Set(snap.wal.cl);
      /* a position from a filled limit order is told by the order's own "vyplněn" event below */
      wpos.forEach((x, i) => { if (!pp.has(wp[i]) && !x.order && !x.auto) ev.push({ k: 'my-open', sym: x.sym, side: x.side, v: x.margin, ccy: w.ccy, sid: x.sigId || null, t: x.openedAt, pid: x.id }); });
      wcl.forEach((x, i) => { if (!pc.has(wc[i])) ev.push({ k: 'my-close', sym: x.sym, side: x.side, v: x.pnl, ccy: w.ccy, why: x.why, sid: x.sigId || null, t: x.closedAt, pid: x.id }); });
    }
    const nw = { pos: wp, cl: wc.slice(0, 200) };
    if (JSON.stringify(nw) !== JSON.stringify(snap.wal || null)) { snap.wal = nw; dirty = true; }

    /* ---- my limit orders (1.8.0, wallet.olog: placed / filled / cancelled / expired) ---- */
    const olog = Array.isArray(w?.olog) ? w.olog : [];
    const oids = olog.map((x) => x.id);
    /* the order log is new in 1.8.0: everything in it is new for a device that already had a wallet snapshot */
    if (snap.ol || snap.wal) {
      const seen = new Set(snap.ol || []);
      olog.filter((x) => !seen.has(x.id)).reverse().forEach((x) => ev.push({ k: `ord-${x.k}`, sym: x.sym, side: x.side, lim: x.limit, v: x.amount, ccy: w.ccy, sid: x.sigId || null, reopen: !!x.reopen, why: x.why || null, t: x.k === 'filled' ? x.fillT || x.at : x.at, pid: x.pos || x.oid || null }));
    }
    if (JSON.stringify(oids) !== JSON.stringify(snap.ol || null)) { snap.ol = oids; dirty = true; }

    if (dirty) store.set(SNAP, snap);
    if (ev.length) {
      const list = events();
      ev.forEach((e, i) => list.unshift({ ...e, id: `${now}-${i}-${Math.random().toString(36).slice(2, 6)}`, at: now + i }));
      store.set(EV, list.slice(0, MAX));
    }
    return ev.length;
  } catch (e) {
    return 0;
  }
}
