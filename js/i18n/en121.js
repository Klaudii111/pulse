// 1.13.7 – calm amounts: default deposit in whole 10 € / 100 Kč, the loss rounded ("≈ −€100"), exact with the reason
// when the deposit is capped; Wallet "Open trades profit/loss"; Signals 2 control rows; Closed follow the profile.
// Keys must also be in cs121.js.
export default {
  'mb.limW': '≈ {w} % of the wallet, the deposit is capped',
  'cc.maxLim': 'max {v} (under {p} %, the deposit is capped)',
  'mb.limS': 'under {p} %, the deposit is capped',
  'acc.open': 'Open trades profit/loss',
  'dh.split3': 'Free {f} · In play {u} · Open trades profit/loss {o}',
  'sg.ph.running': 'Too late',
  'sg.ph.closed': 'Closed',
  'sg.phT.open': 'You can buy = you can still enter the signal. The robot sends only what passes its rules – some days 2, some days none.',
  'sg.phT.running': 'Too late = the price has moved away from the entry, but the signal has not ended yet.',
  'sg.phT.closed': 'Closed = finished signals with their result, losses too. Amounts are for your deposit and chosen profile.',
  'sg.hzSel': 'Length: {v}',
  'sg.profSel': 'Profile: {v}',
  'cc.closed': 'A deposit of {a} made',
  'cc.closedLev': 'A deposit of {a} at 1:{l} made',
  'c.profitS': 'on {a}',
  'c.profitSLev': 'on {a}, leverage 1:{l}',
};
