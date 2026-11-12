// Safe localStorage wrapper – storage can be unavailable (private mode,
// blocked site data). Everything falls back to in-memory values.
// 1.14.0: change listeners (sync.js uploads "Můj účet" to the server a moment after a change);
// writes that come FROM the server use setQuiet / delQuiet so they are not sent back.
const mem = new Map();
const PREFIX = 'pulse.';
const subs = [];

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return mem.has(key) ? mem.get(key) : fallback;
    return JSON.parse(raw);
  } catch {
    return mem.has(key) ? mem.get(key) : fallback;
  }
}

function write(key, value) {
  mem.set(key, value);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
}
function remove(key) {
  mem.delete(key);
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}
function notify(key) { subs.forEach((fn) => { try { fn(key); } catch { /* a listener never breaks a write */ } }); }

export function set(key, value) { write(key, value); notify(key); }
export function del(key) { remove(key); notify(key); }
/* no listeners (data that just came from the server, sync bookkeeping) */
export const setQuiet = write;
export const delQuiet = remove;
export const onChange = (fn) => { subs.push(fn); };
/* true when the key exists on this device */
export function has(key) {
  try { if (localStorage.getItem(PREFIX + key) != null) return true; } catch { /* ignore */ }
  return mem.has(key);
}

export function update(key, fn, fallback) {
  const next = fn(get(key, fallback));
  set(key, next);
  return next;
}

/* First launch timestamp – used for level unlocking */
export function firstSeen() {
  let t = get('firstSeen');
  if (!t) { t = Date.now(); set('firstSeen', t); }
  return t;
}

/* 1.14.0: a short random tag of this install, so ids made on two devices of one account never collide (wallet.js) */
export function devTag() {
  let d = get('devTag');
  if (typeof d !== 'string' || !/^[a-z2-9]{3}$/.test(d)) {
    d = Array.from({ length: 3 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
    write('devTag', d);
  }
  return d;
}
