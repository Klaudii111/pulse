// 1.14.0 "Můj účet na všech zařízeních" – one fictional account on the phone and the computer, without a login.
// Each install gets a random secret account id (26 chars a-z2-7 = 130 bits) the first time it has something to keep.
// The id is the key (whoever has it opens the account), so it is shown only as a QR code / link / one-time 8-char code
// to pair the user's own devices; it never goes to analytics, the server logs only its first 4 chars.
// Server: /api/account/<id> (account_api.py on the PULSE server, one JSON file per id, max 512 kB).
//   * every change of a synced key -> upload ~2 s later (debounced); on app start, when the app comes back to the
//     screen, when the network returns and every 60 s while visible -> pull;
//   * per key last-write-wins by time, except the wallet (wallet.js merge: same ids never doubled, a trade closed on
//     either device is closed) and the journal (per signal, newer entry wins);
//   * optimistic concurrency: PUT {base: rev}; 409 = another device wrote first -> merge again and retry;
//   * offline: everything stays in localStorage and goes up when the network is back.
// Pairing: #/pair/<id> link (or QR) or an 8-char code (10 min, one use) -> one question -> this device adopts the account
// (a backup of everything stored here goes to pulse.backup_<date> first). "Odpojit toto zařízení" forgets the id here.
import * as store from './store.js';
import * as W from './wallet.js';
import * as F from './format.js';
import { t } from './i18n/index.js';
import { icon, il, openSheet, closeTopSheet, toast, copyText } from './ui.js';

const API = './api/account/';
const META = 'syncMeta';
const ID_RE = /^[a-z2-7]{26}$/;
/* the user's account (not device things such as the access code, theme, push permission, caches); 1.15.1: the language syncs too */
export const SYNC_KEYS = ['wallet', 'journal', 'calc', 'levProfile', 'levOwn', 'autoCopy', 'watch', 'watchN', 'favs', 'follow',
  'onb', 'tourDone', 'lessonsDone', 'sim', 'share', 'cid', 'firstSeen', 'celebrated', 'refCode', 'invitedBy', 'proximityPct',
  'proClient', 'faq3off', 'hint3', 'lang', 'styleOk'];
const SYNCED = new Set(SYNC_KEYS);
const DEBOUNCE = 2000;
const PULL_EVERY = 60000;

let rerenderFn = () => {};
let onbHeld = false;
let timer = null;
let running = null;
let again = false;
let status = { s: 'idle', at: 0 };

/* ---------- meta (device-local bookkeeping, never synced) ---------- */
function meta() {
  const m = store.get(META, null);
  if (m && m.v === 1) { m.t = m.t || {}; m.base = m.base || {}; m.dirty = m.dirty || {}; return m; }
  return null;
}
const saveMeta = (m) => store.setQuiet(META, m);
export const accountId = () => meta()?.id || null;

function newId() {
  const b = new Uint8Array(17);
  crypto.getRandomValues(b);
  const A = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0, val = 0, out = '';
  for (let i = 0; i < b.length && out.length < 26; i++) {
    val = (val << 8) | b[i]; bits += 8;
    while (bits >= 5 && out.length < 26) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5; }
    val &= (1 << bits) - 1;
  }
  return out;
}

/* ---------- merging ---------- */
function mergeJournal(older, newer) {
  const o = older && typeof older === 'object' ? older : {};
  const n = newer && typeof newer === 'object' ? newer : {};
  const out = { ...o };
  Object.entries(n).forEach(([k, e]) => { if (!out[k] || (e?.at || 0) >= (out[k]?.at || 0)) out[k] = e; });
  return out;
}
function mergeKey(k, local, lt, remote, rt) {
  const [older, newer] = lt <= rt ? [local, remote] : [remote, local];
  if (k === 'wallet') return W.merge(older, newer);
  if (k === 'journal') return mergeJournal(older, newer);
  return newer;
}

/* ---------- network ---------- */
async function req(method, path, body) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(API + path, { method, cache: 'no-store', signal: ctl.signal, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let j = null;
    try { j = r.status === 204 || r.status === 304 ? null : await r.json(); } catch { /* empty */ }
    return { code: r.status, j };
  } finally { clearTimeout(to); }
}

function setStatus(s) {
  status = { s, at: s === 'ok' ? Date.now() : status.at };
  const m = meta();
  if (s === 'ok' && m) { m.ok = Date.now(); saveMeta(m); }
  paintStatus();
}

/* apply the server copy to this device; returns true when something visible changed */
function pullMerge(m, doc) {
  const rk = doc?.keys || {};
  let changed = false;
  SYNC_KEYS.forEach((k) => {
    const r = rk[k];
    const lt = m.t[k] || 0;
    const dirty = !!m.dirty[k];
    if (!r) { if (store.has(k) && !m.base[k]) { m.dirty[k] = 1; if (!lt) m.t[k] = Date.now(); } return; }
    if (r.t === (m.base[k] || 0)) return;               // the server has what we agreed last time
    if (!dirty) {                                        // only the other device changed it -> take it
      if (r.v === null || r.v === undefined) store.delQuiet(k); else store.setQuiet(k, r.v);
      m.t[k] = r.t; m.base[k] = r.t; changed = true;
      return;
    }
    /* both changed: wallet / journal are merged, the rest = the newer write wins */
    const local = store.get(k, null);
    if (k === 'wallet' || k === 'journal') {
      const v = mergeKey(k, local, lt, r.v, r.t);
      store.setQuiet(k, v);
      m.t[k] = Math.max(lt, r.t) + 1; m.base[k] = r.t; changed = true;  // stays dirty -> the merged copy goes up
    } else if (r.t > lt) {
      if (r.v === null || r.v === undefined) store.delQuiet(k); else store.setQuiet(k, r.v);
      m.t[k] = r.t; m.base[k] = r.t; delete m.dirty[k]; changed = true;
    } else m.base[k] = r.t;                              // ours is newer: stays dirty
  });
  m.rev = doc?.rev || 0;
  return changed;
}

/* 1.15.0: a server account is made only when there is something worth keeping (a top-up, a trade or order, a journal
   entry, a changed profile) or when the user opens the pairing sheet (m.want). Before 1.15.0 the very first launch made
   one, because firstSeen / onb / calc are synced keys written on every first run. Existing accounts are not affected. */
export function worthKeeping() {
  if (!W.untouched()) return true;
  const j = store.get('journal', null);
  if (j && typeof j === 'object' && Object.keys(j).length) return true;
  const pr = store.get('levProfile', null);
  if (pr && pr !== 'cons') return true;
  if (+store.get('levOwn', 0) > 0 || store.get('proClient', false) === true) return true;
  return false;
}

async function run() {
  let m = meta();
  if (!m) return;
  const anyDirty = () => Object.keys(m.dirty).length > 0;
  if (!m.id) {
    if (!anyDirty()) return;   // nothing to keep yet -> no account yet
    if (!m.want && !worthKeeping()) return;   // only first-run bookkeeping (firstSeen, onb, calc …) -> still no account
    m.id = newId(); m.rev = 0; m.base = {}; m.newAcc = 1; saveMeta(m);
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus('off'); return; }
  setStatus('busy');
  let changed = false;
  try {
    let doc = null;
    /* 1.13.9: an account created on this device and never uploaded does not exist on the server yet -> no GET (it would
       only answer 404 and print a red network error in the console on every first run); the PUT (base 0) creates it */
    const g = m.newAcc && !m.rev ? { code: 404 } : await req('GET', `${m.id}${m.rev ? `?rev=${m.rev}` : ''}`);
    m = meta(); if (!m?.id) return;
    if (g.code === 200) { changed = pullMerge(m, g.j) || changed; saveMeta(m); }
    else if (g.code === 404) { m.rev = 0; m.base = {}; SYNC_KEYS.forEach((k) => { if (store.has(k)) { m.dirty[k] = 1; if (!m.t[k]) m.t[k] = Date.now(); } }); saveMeta(m); }
    else if (g.code !== 304) throw new Error(`get ${g.code}`);
    for (let i = 0; i < 4 && anyDirty(); i++) {
      const keys = {};
      const sent = {};
      SYNC_KEYS.forEach((k) => {
        const has = store.has(k);
        if (!has && !m.t[k]) return;
        keys[k] = { t: m.t[k] || Date.now(), v: has ? store.get(k, null) : null };
        if (!m.t[k]) m.t[k] = keys[k].t;
        sent[k] = keys[k].t;
      });
      const p = await req('PUT', m.id, { base: m.rev || 0, keys });
      m = meta(); if (!m?.id) return;
      if (p.code === 200) {
        m.rev = p.j.rev;
        delete m.newAcc;
        Object.entries(sent).forEach(([k, tt]) => { m.base[k] = tt; if ((m.t[k] || 0) === tt) delete m.dirty[k]; });
        saveMeta(m);
        break;
      }
      if (p.code === 409) { doc = p.j; changed = pullMerge(m, doc) || changed; saveMeta(m); continue; }
      throw new Error(`put ${p.code}`);
    }
    setStatus(anyDirty() ? 'err' : 'ok');
  } catch (e) {
    setStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'off' : 'err');
    if (timer == null) timer = setTimeout(() => { timer = null; sync(); }, 30000);
  }
  if (changed) {
    document.dispatchEvent(new CustomEvent('pulse:wallet'));
    try { rerenderFn(); } catch { /* ignore */ }
  }
}

/* one sync at a time; a request while running runs once more afterwards */
export function sync() {
  if (running) { again = true; return running; }
  running = run().finally(() => { running = null; if (again) { again = false; sync(); } });
  return running;
}
function schedule(ms = DEBOUNCE) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; sync(); }, ms);
}

function onLocalChange(key) {
  if (!SYNCED.has(key)) return;
  const m = meta() || { v: 1, t: {}, base: {}, dirty: {} };
  m.t[key] = Math.max(Date.now(), (m.t[key] || 0) + 1);
  m.dirty[key] = 1;
  saveMeta(m);
  schedule();
}

/* ---------- adopting another device's account ---------- */
function backupLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const name = `backup_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const all = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('pulse.') && !k.startsWith('pulse.backup_')) all[k.slice(6)] = localStorage.getItem(k);
    }
  } catch { /* storage blocked: nothing to back up */ }
  store.setQuiet(name, { at: Date.now(), id: accountId(), keys: all });
  return name;
}

async function adopt(id) {
  const g = await req('GET', id);
  if (g.code === 404) return { ok: false, reason: 'notFound' };
  if (g.code !== 200 || !g.j) return { ok: false, reason: 'net' };
  backupLocal();
  const keys = g.j.keys || {};
  const m = { v: 1, id, rev: g.j.rev || 0, t: {}, base: {}, dirty: {}, ok: Date.now() };
  SYNC_KEYS.forEach((k) => {
    const r = keys[k];
    if (r && r.v !== null && r.v !== undefined) { store.setQuiet(k, r.v); m.t[k] = r.t; m.base[k] = r.t; } else store.delQuiet(k);
  });
  saveMeta(m);
  return { ok: true };
}

function askAdopt(id) {
  id = String(id || '').toLowerCase();
  if (!ID_RE.test(id)) { toast(t('sync.notFound')); return; }
  if (id === accountId()) { toast(t('sync.same'), { timeout: 5000 }); return; }
  const w = store.get('wallet', null);
  const here = w ? (w.positions?.length || 0) + (w.orders?.length || 0) : 0;
  let adopting = false;
  openSheet({
    small: true, label: t('sync.askT'),
    onClose() { if (!adopting && onbHeld && store.get('onb', null) === 'pair') { store.delQuiet('onb'); onbHeld = false; } },
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('sync.askT')}</p><p class="sheet-sub">${t('sync.askS')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body">${here ? `<p class="honest">${icon('info', 'icon-xs')} ${t('sync.askHere', { n: here })}</p>` : ''}
      <div class="btn-stack"><button type="button" class="btn btn-primary btn-block" data-yes>${t('sync.askYes')}</button><button type="button" class="btn btn-ghost" data-no>${t('sync.askNo')}</button></div></div>`,
    onMount(sh) {
      sh.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      sh.querySelector('[data-no]').addEventListener('click', () => closeTopSheet());
      const yes = sh.querySelector('[data-yes]');
      yes.addEventListener('click', async () => {
        yes.disabled = true; yes.textContent = t('sync.loading'); adopting = true;
        let r;
        try { r = await adopt(id); } catch { r = { ok: false, reason: 'net' }; }
        if (!r.ok) { adopting = false; yes.disabled = false; yes.textContent = t('sync.askYes'); toast(t(r.reason === 'notFound' ? 'sync.notFound' : 'sync.netFail'), { timeout: 6000 }); return; }
        try { sessionStorage.setItem('pulse.syncAdopted', '1'); } catch { /* ignore */ }
        try { history.replaceState(null, '', `${location.pathname}${location.search}#/portfolio`); } catch { /* ignore */ }
        location.reload();
      });
    },
  });
}

/* ---------- QR code (byte mode, ECC M, versions 1-10) – no library ---------- */
const ECC_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLK_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
function rawModules(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; }
  return r;
}
const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 255; };
function rsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  data.forEach((b) => { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); });
  return r;
}
export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let v = 1;
  for (; v <= 10; v++) {
    const cap = Math.floor(rawModules(v) / 8) - ECC_M[v] * BLK_M[v];
    if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap * 8) break;
  }
  if (v > 10) return null;
  const nData = Math.floor(rawModules(v) / 8) - ECC_M[v] * BLK_M[v];
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, nData * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < nData * 8; p ^= 0xec ^ 0x11) put(p, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  /* blocks + error correction, interleaved */
  const nb = BLK_M[v], ecl = ECC_M[v], raw = Math.floor(rawModules(v) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = rsDivisor(ecl);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const cw = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= nShort) cw.push(b[i]); });
  /* modules */
  const size = v * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setF = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); const x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (v >= 2) {
    const na = Math.floor(v / 7) + 2;
    const step = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
    pos.forEach((a, i) => pos.forEach((b, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
  }
  const format = (mask) => {
    const d = (0 << 3) | mask;   // ECC M = 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) setF(8, i, bit(i));
    setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
    setF(8, size - 8, true);
  };
  format(0);
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const d = ((b >>> i) & 1) === 1; const a = size - 11 + (i % 3), c = Math.floor(i / 3); setF(a, c, d); setF(c, a, d); }
  }
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && i < cw.length * 8) { mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
  /* penalty: runs (rule 1), 2x2 blocks (rule 2), balance (rule 4) */
  const penalty = () => {
    let p = 0, dark = 0;
    for (let a = 0; a < size; a++) {
      let rr = 1, rc = 1;
      for (let b = 1; b < size; b++) {
        if (mod[a][b] === mod[a][b - 1]) { rr++; if (rr === 5) p += 3; else if (rr > 5) p++; } else rr = 1;
        if (mod[b][a] === mod[b - 1][a]) { rc++; if (rc === 5) p += 3; else if (rc > 5) p++; } else rc = 1;
      }
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (mod[y][x]) dark++;
      if (x < size - 1 && y < size - 1 && mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3;
    }
    const tot = size * size;
    p += (Math.ceil(Math.abs(dark * 20 - tot * 10) / tot) - 1) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) { applyMask(m); format(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
  applyMask(best); format(best);
  return mod;
}
export function qrSvg(text) {
  const m = qrMatrix(text);
  if (!m) return '';
  const n = m.length, q = 4;
  let d = '';
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg class="qr" viewBox="0 0 ${n + q * 2} ${n + q * 2}" shape-rendering="crispEdges" role="img" aria-label="${F.esc(t('sync.qrAria'))}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/* ---------- UI ---------- */
const pairLink = (id) => `${location.origin}${location.pathname}#/pair/${id}`;
function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return t('sync.ago.now');
  if (s < 3600) return t('sync.ago.min', { n: Math.round(s / 60) });
  if (s < 86400 * 2) return t('sync.ago.h', { n: Math.round(s / 3600) });
  return t('sync.ago.d', { n: Math.round(s / 86400) });
}
export function statusText() {
  const m = meta();
  if (!m?.id) return t('sync.st.none');
  if (status.s === 'busy') return t('sync.st.busy');
  if (status.s === 'off' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return t('sync.st.off');
  if (status.s === 'err') return t('sync.st.err');
  if (Object.keys(m.dirty).length) return t('sync.st.wait');
  return m.ok ? t('sync.st.ok', { ago: ago(m.ok) }) : t('sync.st.busy');
}
function paintStatus() {
  document.querySelectorAll('[data-sync-status]').forEach((el) => { el.textContent = statusText(); el.dataset.syncState = status.s; });
}

/* the card (Peněženka full, Více compact) */
export function card({ compact = false } = {}) {
  const linked = !!accountId();
  return `<section class="card sync-card has-il" id="sync-card" aria-label="${F.esc(t('sync.title'))}">${il('10_propojeni', compact ? 56 : 64, { cls: 'sync-il' })}
    <p class="big-acc-k">${icon('share', 'icon-xs')}${t('sync.title')}</p>
    <h2 class="sheet-title">${t('sync.cardT')}</h2>
    ${compact ? '' : `<p class="sheet-sub">${t('sync.cardS')}</p>`}
    <p class="wl-inplay num" data-sync-status>${F.esc(statusText())}</p>
    <div class="wl-btns"><button type="button" class="btn btn-primary btn-small" data-sync="show">${icon('share', 'icon-sm')}${t('sync.show')}</button>
      <button type="button" class="btn btn-secondary btn-small" data-sync="enter">${t('sync.have')}</button></div>
    ${linked && !compact ? `<button type="button" class="btn btn-ghost btn-small" data-sync="unlink">${t('sync.unlink')}</button>` : ''}
  </section>`;
}

async function showPair() {
  let m = meta();
  if (!m?.id || Object.keys(m.dirty || {}).length) {
    if (!m) { m = { v: 1, t: {}, base: {}, dirty: {} }; saveMeta(m); }
    SYNC_KEYS.forEach((k) => { if (store.has(k) && !m.base[k]) { m.dirty[k] = 1; if (!m.t[k]) m.t[k] = Date.now(); } });
    if (!Object.keys(m.dirty).length) { m.dirty.firstSeen = 1; m.t.firstSeen = Date.now(); store.firstSeen(); }
    m.want = 1; /* the user asked to pair -> make the account now even with nothing else to keep */
    saveMeta(m);
    await sync();
  }
  m = meta();
  if (!m?.id || m.rev < 1) { toast(t('sync.netFail'), { timeout: 6000 }); return; }
  const link = pairLink(m.id);
  const sh = openSheet({
    label: t('sync.cardT'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('sync.cardT')}</p><p class="sheet-sub">${t('sync.qrT')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body">
        <div class="inst-qr" style="margin:0 auto 12px;width:208px">${qrSvg(link)}</div>
        <p class="inst-k">${t('sync.or')}</p>
        <p class="inst-url" data-sync-link>${F.esc(link)}</p>
        <div class="wl-btns"><button type="button" class="btn btn-secondary btn-small" data-copy>${t('sync.copy')}</button></div>
        <p class="inst-k" style="margin-top:16px">${t('sync.codeK')}</p>
        <p class="big-acc-v num" data-sync-code aria-live="polite">…</p>
        <p class="inst-s" data-sync-code-s>${t('sync.codeS')}</p>
        <p class="honest">${icon('shield', 'icon-xs')} ${t('sync.secret')}</p>
      </div>`,
    onMount(el) {
      el.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      el.querySelector('[data-copy]').addEventListener('click', () => copyText(link).then((ok) => toast(t(ok ? 'sync.copied' : 'sync.copyFail'))));
    },
  });
  const codeEl = sh.querySelector('[data-sync-code]');
  const sEl = sh.querySelector('[data-sync-code-s]');
  const make = async () => {
    codeEl.textContent = '…';
    let r;
    try { r = await req('POST', 'pair', { id: m.id }); } catch { r = { code: 0 }; }
    if (r.code !== 200 || !r.j?.code) { codeEl.textContent = '–'; sEl.textContent = t('sync.codeFail'); return; }
    codeEl.textContent = `${r.j.code.slice(0, 4)} ${r.j.code.slice(4)}`;
    codeEl.dataset.code = r.j.code;
    const until = Date.now() + (r.j.expiresIn || 600) * 1000;
    const tick = setInterval(() => {
      if (!document.body.contains(codeEl)) { clearInterval(tick); return; }
      const left = Math.max(0, Math.round((until - Date.now()) / 1000));
      if (!left) {
        clearInterval(tick);
        codeEl.textContent = t('sync.codeExp');
        sEl.innerHTML = `<button type="button" class="btn btn-secondary btn-small" data-new>${t('sync.codeNew')}</button>`;
        sEl.querySelector('[data-new]').addEventListener('click', () => { sEl.textContent = t('sync.codeS'); make(); });
        return;
      }
      sEl.textContent = `${t('sync.codeS')} ${t('sync.left', { m: Math.floor(left / 60), s: String(left % 60).padStart(2, '0') })}`;
    }, 1000);
  };
  make();
}

function enterCode() {
  openSheet({
    small: true, label: t('sync.enterT'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('sync.enterT')}</p><p class="sheet-sub">${t('sync.enterS')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><label class="sh-nick"><span class="sr-only">${t('sync.enterT')}</span>
        <input class="jin num" data-code maxlength="12" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="${t('sync.enterPh')}"></label>
        <p class="err" role="alert" data-err></p>
        <div class="btn-stack" style="margin-top:12px"><button type="button" class="btn btn-primary btn-block" data-go>${t('sync.enterGo')}</button></div></div>`,
    onMount(el) {
      el.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      const inp = el.querySelector('[data-code]');
      const err = el.querySelector('[data-err]');
      const go = el.querySelector('[data-go]');
      const submit = async () => {
        const c = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (c.length !== 8) { err.textContent = t('sync.enterBad'); return; }
        go.disabled = true; err.textContent = '';
        let r;
        try { r = await req('GET', `pair/${c}`); } catch { r = { code: 0 }; }
        go.disabled = false;
        if (r.code === 200 && r.j?.id) { closeTopSheet(); setTimeout(() => askAdopt(r.j.id), 350); return; }
        err.textContent = t(r.code === 404 || r.code === 400 ? 'sync.enterNone' : r.code === 429 ? 'sync.enterSlow' : 'sync.netFail');
      };
      go.addEventListener('click', submit);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      setTimeout(() => inp.focus(), 120);
    },
  });
}

function unlink() {
  openSheet({
    small: true, label: t('sync.unlinkT'),
    html: `<div class="sheet-head"><div><p class="sheet-title">${t('sync.unlinkT')}</p><p class="sheet-sub">${t('sync.unlinkS')}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('common.close')}">${icon('close', 'icon-sm')}</button></div>
      <div class="sheet-body"><div class="btn-stack"><button type="button" class="btn btn-primary btn-block" data-yes>${t('sync.unlinkYes')}</button><button type="button" class="btn btn-ghost" data-no>${t('sync.askNo')}</button></div></div>`,
    onMount(el) {
      el.querySelector('[data-close]').addEventListener('click', () => closeTopSheet());
      el.querySelector('[data-no]').addEventListener('click', () => closeTopSheet());
      el.querySelector('[data-yes]').addEventListener('click', () => {
        /* the data stay here; the next change makes a new account of its own */
        saveMeta({ v: 1, t: {}, base: {}, dirty: {} });
        closeTopSheet(); toast(t('sync.unlinked'), { timeout: 5000 });
        setTimeout(() => { try { rerenderFn(); } catch { /* ignore */ } }, 380);
      });
    },
  });
}

/* ---------- start ---------- */
function pairFromHash() {
  const m = /^#\/pair\/([A-Za-z2-7]{26})\/?$/.exec(location.hash || '');
  if (!m) return false;
  try { history.replaceState(null, '', `${location.pathname}${location.search}#/penezenka`); } catch { /* ignore */ }
  /* a fresh device opened from the link: the first-run guide must not cover the question
     (after "Načíst" the account brings its own state; after "Zrušit" the guide comes back next start) */
  if (!store.get('onb', null)) { store.setQuiet('onb', 'pair'); onbHeld = true; }
  setTimeout(() => { if (window.__pulseGo) window.__pulseGo('#/penezenka'); askAdopt(m[1]); }, 400);
  return true;
}

/* first start with sync: everything already stored here goes up as it is (nothing is lost).
   Runs when the module loads (before any screen writes), then every later write is noticed. */
(function first() {
  try {
    if (!meta()) {
      const m = { v: 1, t: {}, base: {}, dirty: {} };
      SYNC_KEYS.forEach((k) => { if (store.has(k)) { m.t[k] = Date.now(); m.dirty[k] = 1; } });
      saveMeta(m);
    }
  } catch { /* storage blocked: sync stays off */ }
  store.onChange(onLocalChange);
}());

let started = false;
export function init(rerender) {
  if (started) return;
  started = true;
  if (typeof rerender === 'function') rerenderFn = rerender;
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-sync]');
    if (!b) return;
    ev.preventDefault();
    const a = b.dataset.sync;
    if (a === 'show') showPair(); else if (a === 'enter') enterCode(); else if (a === 'unlink') unlink();
  });
  window.addEventListener('hashchange', () => pairFromHash());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
    else if (Object.keys(meta()?.dirty || {}).length) sync();   // leaving the app: push what is waiting
  });
  window.addEventListener('online', () => sync());
  window.addEventListener('offline', () => setStatus('off'));
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, PULL_EVERY);
  setInterval(paintStatus, 30000);
  try { if (sessionStorage.getItem('pulse.syncAdopted')) { sessionStorage.removeItem('pulse.syncAdopted'); setTimeout(() => toast(t('sync.adopted'), { timeout: 6000 }), 900); } } catch { /* ignore */ }
  pairFromHash();
  sync();
}
