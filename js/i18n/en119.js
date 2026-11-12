// 1.13.5 texts (English) – the deposit is the SAME for all three profiles, the profile only changes the leverage.
export default {
  'pf.sw': 'Profile:',
  'pf.worst': 'worst ~{v} %',
  'pf.short.cons': 'no leverage · worst ~1 % of the wallet',
  'pf.short.bal': 'leverage 1:2 · worst ~2 %',
  'pf.short.aggr': 'leverage up to 1:{s} on shares · worst ~{w} %',
  'pf.long.cons': 'No leverage: at the stop you lose at most ~1 % of the wallet. Recommended to start.',
  'pf.long.bal': 'The same deposit with leverage 1:2: twice the gains and losses, at the stop at most ~2 % of the wallet.',
  'pf.long.aggr': 'The same deposit with leverage up to the market’s legal cap (shares 1:5, indices and gold 1:20, crypto 1:2): on a share at most ~5 % of the wallet at the stop. The biggest gains and losses, never more than the deposit.',
  'mp.prof': 'Profile – how much leverage you want',
  'mp.sum': 'Default deposit per trade up to {a} – the same for every profile. Your profile: on a share at most ~{p} % of the wallet at the stop.',
  'onb.p.t': 'How bold?',
  'onb.p.s': 'The deposit is the same for every profile, the profile only changes the leverage. Change it any time in More → Settings.',
  'onb.p.ex': 'From {c}: on average ≈ {a} per trade, at worst {l}',
  'onb.p.note': 'Example for a share. Every signal shows its own numbers.',
  'mb.levAria': 'Profile: how much leverage',

  'mb.depCol': 'deposit {a}',
  'mb.trade': 'This trade: at worst {v} ({p} % of the deposit, {w} % of the wallet).',
  'mb.trade0': 'This trade: at worst {v} ({p} % of the deposit).',
  'mb.same': 'The deposit is the same for every profile – the profile only changes the leverage, and with it the gain and the loss.',
  'dd2.bal': 'The robot’s whole account in the test with leverage 1:2, worst period: −26 %.',
  'dd2.aggr': 'The robot’s whole account in the test with leverage 1:5, worst period: −58 % – only for those who can take big swings.',

  'px.buyAt': 'buy at', 'px.sellAt': 'sell at',

  'calc.profile': 'Profile (leverage)',
  'calc.worstAcc': 'worst {v} of the wallet',
  'calc.sameDep': 'The deposit is the same for every profile, the profile only changes the leverage.',
  'calc.capMkt': 'Highest leverage on this market: 1:{v} (Aggressive). No leverage = 1×.',
  'calc.levNote5': 'Deposit {a} · {lev} → you trade {n}. You never lose more than the deposit.',

  'det.reentry': 'Your trade is closed. The signal is still valid – you can enter again.',
  'sc.investAgain': 'Invest again',
  'det.sigEnded': 'Signal ended',

  /* Dnes switch: shorter so it never wraps */
  'pt.auto': 'Auto-robot',
};
