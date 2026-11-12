// 1.13.6 – ONE "at most" price (D.maxEntry) in every state, New trade with "Details ▾", Robot: older holdings,
// Trade without a second DEMO. Keys must also be in cs120.js.
export default {
  'term.sub': 'Pick a market and buy or sell',
  'term.fromSig': 'Robot signal: {side} · entry at most {e} · stop {s} · target {t}',
  'term.fromSigSell': 'Robot signal: {side} · entry at least {e} · stop {s} · target {t}',
  'en.wait': 'Entry: at a price up to {v} – set the buy and it fills by itself when the price drops (valid until {d})',
  'en.waitSell': 'Entry: at a price from {v} – set the sell and it fills by itself when the price rises (valid until {d})',
  'es.wait': 'Entry at a price up to {v} – the buy waits for the price (until {d})',
  'es.waitSell': 'Entry at a price from {v} – the sell waits for the price (until {d})',
  'u.do.wait': 'The price has moved {d} away. You can place a buy at {v} at most – it fills by itself when the price comes back (valid until the signal ends).',
  'u.do.waitSell': 'The price has moved {d} away. You can place a sell at {v} at least – it fills by itself when the price comes back up (valid until the signal ends).',
  'entry.note.limit': 'The price has drifted from the entry. Set a buy at the highest entry price rather than buying at market.',
  'tk.details': 'Details',
  'rb.old': 'older signal – the robot is closing it',
  'rb.none': 'No closed trade yet – results appear after the first target, stop or signal end.',
};
