/* 1.15.0 STYLES – the numbers of the test the five money styles are based on (Desktop\PULSE\VYZKUM\styly\styly.json,
   made 2026-11-12 14:07; rules written before the computation in PREREG.md; the robot's signals unchanged, only the
   deposit and the leverage differ; one wallet of 100 000 Kč takes every signal it has free money for).
   ALL NUMBERS ARE AN UPPER ESTIMATE: today's index members (survivorship), daily candles (stop before target when both
   are hit on one day), the costs are the app's model (spread 0,05 %, overnight 6,5 % a year, FX fee 0,5 %).
   Fields (all signals in one wallet, "VSE"):
     month = the usual (median) month in the test 2023–26, share of the wallet
     year = the test 2023–26 per year · dd = the largest drop 2015–26 · worstMonth = the worst month 2015–26
     y2022 = a new wallet on 1. 1. 2022 by the end of 2022 · wipe = share of trades that lost the WHOLE deposit (2015–26)
     half12 = the wallet under half within 12 months (bootstrap by weeks, 2015–26) · dead = the test wallet died that day
     typ = the average trade that ended in profit / in loss at 100 000 Kč (2015–26): deposit, win, loss
     hz = per horizon: the average winning / losing trade as a share of the DEPOSIT (2015–26) – used for "když vyjde"
          when a signal has no target */
export const STYLE_TEST = {
  period: ['2023-01-01', '2026-11-10'],
  full: ['2015-11-23', '2026-11-10'],
  wallet: 100000,
  upper: true,
  styles: {
    cons: { month: 0.0333, year: 0.3156, dd: -0.2288, worstMonth: -0.1299, y2022: 0.0477, wipe: 0, half12: 0, dead: null,
      typ: { dep: 8785, win: 470, loss: -408 },
      hz: { DNY: { win: 0.0336, loss: -0.0427 }, TYDEN: { win: 0.0353, loss: -0.0315 }, MESIC: { win: 0.1, loss: -0.0541 } } },
    bal: { month: 0.056, year: 0.4766, dd: -0.4124, worstMonth: -0.2429, y2022: -0.0676, wipe: 0, half12: 0.001, dead: null,
      typ: { dep: 8785, win: 925, loss: -828 },
      hz: { DNY: { win: 0.0668, loss: -0.0853 }, TYDEN: { win: 0.0698, loss: -0.0633 }, MESIC: { win: 0.197, loss: -0.1109 } } },
    bold: { month: 0.127, year: 1.1682, dd: -0.8914, worstMonth: -0.689, y2022: -0.3587, wipe: 0.006, half12: 0.163, dead: null,
      typ: { dep: 10000, win: 2827, loss: -2484 },
      hz: { DNY: { win: 0.1756, loss: -0.2266 }, TYDEN: { win: 0.186, loss: -0.1674 }, MESIC: { win: 0.5457, loss: -0.2965 } } },
    full: { month: 0.0729, year: 0.2758, dd: -0.963, worstMonth: -0.862, y2022: -0.6565, wipe: 0.006, half12: 0.35, dead: null,
      typ: { dep: 20000, win: 5655, loss: -4968 },
      hz: { DNY: { win: 0.1756, loss: -0.2266 }, TYDEN: { win: 0.186, loss: -0.1674 }, MESIC: { win: 0.5457, loss: -0.2965 } } },
    aggr: { month: 0.3059, year: -1, dd: -1, worstMonth: -0.8889, y2022: -0.9857, wipe: 0.297, half12: 0.55, dead: '2026-03-09',
      typ: { dep: 5000, win: 5290, loss: -3850 },
      hz: { DNY: { win: 0.7126, loss: -0.771 }, TYDEN: { win: 0.7538, loss: -0.6372 }, MESIC: { win: 1.988, loss: -0.8206 } } },
  },
};
export const styleTest = (id) => STYLE_TEST.styles[id] || STYLE_TEST.styles.cons;
