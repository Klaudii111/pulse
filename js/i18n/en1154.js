/* 1.15.0 release round (B): Portfolio, trade page, Trade, Wallet, History, More – fixes after the client's-eyes review (12 Nov 2026) */
export default {
  /* B1: "today" = change since yesterday's close; "…" until the prices are in */
  'po.todayWait': 'Today …',
  'pd.k.todayS': 'change since yesterday’s close',
  /* B2: real units with the exchange rate */
  'pd.k.fx': 'rate {a} ≈ {b} · the result is counted without the exchange-rate effect',
  /* B3: where a leveraged trade really ends */
  'pd.k.atEnd': 'Leverage ends the trade at ≈ {v}',
  'pd.k.atEndS': 'the whole deposit – a move of {m}% against you is enough',
  'pd.k.stop2': 'signal stop {v} – the trade never gets there, leverage ends it first',
  'pd.lv.end': 'leverage end',
  'pd.d.wayEnd': 'From the leverage end to the target (│ = my buy, ● = now)',
  'pd.d.toEnd': 'to the leverage end {v}',
  'th.LEVEND.t': 'Leverage ends the trade',
  'th.LEVEND.s': 'Leverage multiplies the result. When the price moves against you so far that the loss reaches your whole deposit, the trade closes by itself – you can never lose more than the deposit. With 1:20 a 5% move is enough, with 1:5 a 20% move. When this level is closer than the signal’s stop, the trade ends here, not at the stop.',
  /* B4: the way shows only the distance in % from the price now (the money is once in "How much I have") */
  'pd.d.toTarget': 'to target {v}', 'pd.d.toStop': 'to stop {v}',
  /* B5: the robot ended its trade, mine runs on */
  'pd.rb.head': 'The robot closed this trade {d}{how}.',
  'pd.rb.at': 'at {v}',
  'pd.rb.mine': 'Yours is still running: {v}.',
  'pd.rb.close': 'Close mine too',
  'pd.rb.keep': 'Keep it running',
  'pd.rb.kept': '{h} You keep yours running.',
  'pd.st.robotOut': 'The robot has already closed its trade. Yours runs until you close it or it reaches the stop or the target.',
  'pd.st.noSig': 'A trade from a robot signal. The signal is no longer in today’s data – we keep watching your stop and target.',
  /* K3: a sentence without guessing */
  'pd.gone': 'This trade is no longer in the wallet.',
  /* B6: the donut = what I hold now */
  'al.mid': 'Account value',
  'al.k.wait': 'Waiting to buy',
  'al.aria': 'Donut: account value {v}, what is in it by kind of market',
  'al.rule': 'Trades at their value now (deposit + result), waiting buys and free money add up to the account value.',
  'po.inWait': 'of which {v} waits to buy',
  /* K2-17: one word for one thing in English */
  'wl.deps': 'Total deposited',
  'acc.inPlay': 'In trades',
  'dh.split': 'Free {f} · In trades {u}',
  'dh.split3': 'Free {f} · In trades {u} · Open trades profit/loss {o}',
  'ts.split': 'Free {f} · In trades {u}',
  'th.VEHRE.t': 'In trades',
  'th.VEHRE.s': 'In trades = money in open trades + money set aside for waiting buys. Free = the rest you can invest right now.',
  'tour.n6.s': 'Free = you can invest. In trades = money in trades and waiting buys.',
  /* K1-13: History = my trades, comparing with others closed at the bottom */
  'hi.cmMore': 'Compare with others (optional)',
  'hi.sub': 'My closed trades',
  'pd.moreOpts': 'More options',
  /* lead, after the fix round: one word for the main action (Buy) also in the Portfolio texts; 'a Equifax' fixed */
  'po.open0': 'No trade yet. Start with Buy on a signal, or pick a market yourself.',
  'pd.rs': 'Why buy',
  'ev.myOpen': 'You opened a trade: {sym} ({side})',
  /* fixer D */
  'cf.fee': 'after the currency conversion fee {v} (0.5% of the result)',
  'tk.clamp': 'Your style would put in {w}, you have {f} free – putting in {v}.',
  'tk.clampOwn': 'You entered {w}, you have {f} free – putting in {v}.',
  'rx.meWait': 'you now …',
  /* P1-07: one trade -> singular */
  'rx.sub1': 'The robot has left this trade. Leave too?',
  'term.lastCh': 'last session {v}',
};
