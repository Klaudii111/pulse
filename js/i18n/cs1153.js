/* 1.15.0 release round (A): Dnes, Signály, detail signálu, styly, denní robot – opravy po kontrole očima klienta (12. 11. 2026) */
export default {
  /* A1 robot ukončil – ukončit taky? */
  'rx.t1': 'Robot ukončil {n}',
  'rx.tN': 'Robot ukončil {n} {u}, které máš taky',
  'rx.sub': 'Robot z obchodu vystoupil. Chceš taky?',
  'rx.when': 'robot ukončil {d}{r}',
  'rx.when0': 'robot ukončil{r}',
  'rx.me': 'ty teď {v}',
  'rx.close': 'Ukončit taky',
  'rx.keep': 'Nechat',
  'rx.all': 'Zobrazit všechny ({n})',
  'rb.h': 'Robot ukončil',
  'rb.when': 'robot ukončil {d}',
  'rb.myOpen': 'Máš ho taky – otevřít',
  'rb.myDone': 'Tvůj obchod',
  /* A6 Dnes header while today's prices are not on this device yet */
  'dh.todayWait': 'Dnes …',
  /* A2 the main button = the money that leaves my wallet; the price of one unit on the small line above it */
  'tk.goNow': 'Koupit za {a}', 'tk.goNowSell': 'Prodat za {a}', 'tk.goNow0': 'Koupit', 'tk.goNowSell0': 'Prodat',
  'tk.goOpen': 'Koupit při otevření za {a}', 'tk.goOpenSell': 'Prodat při otevření za {a}', 'tk.goOpen0': 'Koupit při otevření', 'tk.goOpenSell0': 'Prodat při otevření',
  'tk.goLim': 'Nastavit nákup za {a}', 'tk.goLimSell': 'Nastavit prodej za {a}', 'tk.goLim0': 'Nastavit nákup', 'tk.goLimSell0': 'Nastavit prodej',
  'tk.pxNow': 'cena teď {v} za kus',
  'tk.pxOpen': 'nejvýš {v} za kus · burza otevře {d}', 'tk.pxOpenSell': 'nejníž {v} za kus · burza otevře {d}',
  'tk.pxLim': 'až cena klesne na {v}', 'tk.pxLimSell': 'až cena stoupne na {v}',
  /* A8 not enough free money */
  'tk.topup': 'Dobít peněženku',
  'tk.freeShort': 'Volné peníze: {v} – nestačí',
  'tk.pxHead': 'cena za kus',
  /* A3 one word for the main action of a BUY signal: „Koupit“ (SELL: „Prodat“) */
  'inv.btn': 'Koupit nanečisto',
  'sc.invest': 'Koupit', 'sc.investSell': 'Prodat', 'sc.investAgain': 'Koupit znovu', 'sc.investAgainSell': 'Prodat znovu',
  'u.box.mine0': 'Zatím nic. Klepni na „Koupit“ u signálu nebo na Obchodovat.',
  'u.empty.mine': 'Tady zatím nic nemáš. Začni u signálu tlačítkem Koupit.',
  'tour.s4.s': '„Koupit“ otevře obchod s fiktivními penězi, předvyplněný podle signálu.',
  'd.mine0': 'Zatím nic. Začni tlačítkem Koupit u signálu.',
  'jak.q3': 'Co když nestihnu koupit?',
  'jak.a3': 'U každého signálu je napsané, co platí teď: 1) cena je skoro stejná jako u signálu – ještě můžeš koupit; 2) cena už trochu utekla – zadáš nákup za původní cenu a koupí se sám, až cena klesne (platí do konce signálu); 3) cena utekla moc – na signál je pozdě, vynech ho, další přijde. Tip: zapni „Robot obchoduje za mě“ (v Obchodovat) a nic nezmeškáš.',
  /* A12 onboarding */
  'onb.back': 'Zpět',
};
