/* 1.15.0 release round (A): Today, Signals, signal detail, styles, daily robot – fixes after the client's-eyes review (12 Nov 2026) */
export default {
  /* A1 the robot left – leave too? */
  'rx.t1': 'The robot closed {n}',
  'rx.tN': 'The robot closed {n} {u} you also hold',
  'rx.sub': 'The robot has left these trades. Leave too?',
  'rx.when': 'robot closed {d}{r}',
  'rx.when0': 'robot closed{r}',
  'rx.me': 'you now {v}',
  'rx.close': 'Close too',
  'rx.keep': 'Keep',
  'rx.all': 'Show all ({n})',
  'rb.h': 'Closed by the robot',
  'rb.when': 'robot closed {d}',
  'rb.myOpen': 'You hold it – open',
  'rb.myDone': 'Your trade',
  /* A6 Dnes header while today's prices are not on this device yet */
  'dh.todayWait': 'Today …',
  /* A2 the main button = the money that leaves my wallet; the price of one unit on the small line above it */
  'tk.goNow': 'Buy for {a}', 'tk.goNowSell': 'Sell for {a}', 'tk.goNow0': 'Buy', 'tk.goNowSell0': 'Sell',
  'tk.goOpen': 'Buy at the open for {a}', 'tk.goOpenSell': 'Sell at the open for {a}', 'tk.goOpen0': 'Buy at the open', 'tk.goOpenSell0': 'Sell at the open',
  'tk.goLim': 'Set a buy for {a}', 'tk.goLimSell': 'Set a sell for {a}', 'tk.goLim0': 'Set a buy', 'tk.goLimSell0': 'Set a sell',
  'tk.pxNow': 'price now {v} per unit',
  'tk.pxOpen': 'at most {v} per unit · market opens {d}', 'tk.pxOpenSell': 'at least {v} per unit · market opens {d}',
  'tk.pxLim': 'when the price drops to {v}', 'tk.pxLimSell': 'when the price rises to {v}',
  /* A8 not enough free money */
  'tk.topup': 'Top up the wallet',
  'tk.freeShort': 'Free money: {v} – not enough',
  'tk.pxHead': 'price per unit',
  /* A3 one word for the main action of a BUY signal: "Buy" (SELL: "Sell") */
  'inv.btn': 'Buy with play money',
  'sc.invest': 'Buy', 'sc.investSell': 'Sell', 'sc.investAgain': 'Buy again', 'sc.investAgainSell': 'Sell again',
  'u.box.mine0': 'Nothing yet. Tap “Buy” on a signal or Trade.',
  'u.empty.mine': 'Nothing here yet. Start with the Buy button on a signal.',
  'tour.s4.s': '“Buy” opens a fictional-money trade, prefilled from the signal.',
  'd.mine0': 'Nothing yet. Start with the Buy button on a signal.',
  'jak.q3': 'What if I don’t buy in time?',
  'jak.a3': 'Each signal says what applies now: 1) the price is almost the same as at the signal – you can still buy; 2) the price has moved a bit – place a buy at the original price and it buys by itself when the price comes back (valid until the signal ends); 3) the price moved too far – too late, skip it, another one will come. Tip: switch on “The robot trades for me” (in Trade) and you will not miss anything.',
};
