// Safe localStorage wrapper – storage can be unavailable (private mode,
// blocked site data). Everything falls back to in-memory values.
const mem = new Map();
const PREFIX = 'pulse.';

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return mem.has(key) ? mem.get(key) : fallback;
    return JSON.parse(raw);
  } catch {
    return mem.has(key) ? mem.get(key) : fallback;
  }
}

export function set(key, value) {
  mem.set(key, value);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function del(key) {
  mem.delete(key);
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
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
