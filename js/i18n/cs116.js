// 1.13.2 – jeden profil (riziko + páka), jedno slovo pro každý stav, Pro pokročilé v detailu, Dobít / Dobito, Ukončit.
export default {
  /* jeden profil: riziko při stopu + páka */
  'mb.risk': 'riziko {v} %',
  'profile.cons': 'Konzervativně', 'profile.bal': 'Vyváženě', 'profile.aggr': 'Agresivněji',
  'pf.short.cons': 'riziko 1 % · bez páky', 'pf.short.bal': 'riziko 2 % · páka až 1:2', 'pf.short.aggr': 'riziko 4 % · nejvyšší povolená páka',
  'pf.long.cons': 'Při stopu ztratíš nejvýš 1 % peněženky, bez páky. Doporučeno pro začátek.',
  'pf.long.bal': 'Při stopu nejvýš 2 % peněženky, páka nejvýš 1:2. Dvakrát větší zisky i ztráty.',
  'pf.long.aggr': 'Při stopu nejvýš 4 % peněženky, páka až do zákonného stropu (akcie 1:5, zlato 1:20, krypto 1:2). Největší zisky i ztráty.',
  'mp.prof': 'Profil – riziko i páka v jedné volbě',
  'mp.profDone': 'Profil: {p} ({s})',
  'mb.levAria': 'Profil: riziko a páka',
  'mb.levNote2': 'Odvážnější profil = větší vklad, páka i riziko: větší průměrný zisk i větší ztráta. Víc než vklad neztratíš – obchod se sám zavře.',
  'mb.own': 'Jiná páka jen pro tento obchod',

  /* jedno slovo pro každý stav */
  'sg.ph.open': 'Můžeš koupit', 'sg.ph.running': 'Pozdě na vstup', 'c.ph.running': 'Pozdě na vstup',
  'sg.phS.running': 'Pozdě na vstup = cena už utekla od vstupu, signál ale ještě neskončil. Sleduj, jak dopadne.',
  'sg.empty.running': 'Teď není žádný signál, na který by bylo pozdě.',
  'u.chip.late': 'Pozdě na vstup',
  'sg.mineH': 'Už v nich jsi',
  'res.openNow': 'Neuzavřené signály',
  'res.openNowS': 'Všechny neuzavřené: ty, které můžeš koupit, i ty, kde je pozdě na vstup. Jak se jim daří teď.',
  'res.counts': 'Neuzavřených signálů: {n} · Robot drží {r}',
  'res.none.s': 'První výsledky se tu objeví po uzavření prvního signálu (cíl, stop nebo konec délky). Neuzavřené signály najdeš níže.',
  'res.headline0': { one: 'Zatím nic uzavřeno – Robot drží {n} obchod', few: 'Zatím nic uzavřeno – Robot drží {n} obchody', many: 'Zatím nic uzavřeno – Robot drží {n} obchodu', other: 'Zatím nic uzavřeno – Robot drží {n} obchodů' },
  'auto.ask': { one: 'Robot teď může vzít i {n} signál, který můžeš koupit, za {a}. Vzít i ten, nebo jen nové?', few: 'Robot teď může vzít i {n} signály, které můžeš koupit, za {a}. Vzít i tyto, nebo jen nové?', other: 'Robot teď může vzít i {n} signálů, které můžeš koupit, za {a}. Vzít i tyto, nebo jen nové?' },
  'auto.takeAll': 'Vzít i tyto',
  'auto.onAll': 'Zapnuto: robot vezme i signály, které teď můžeš koupit – otevřené obchody uvidíš v Zainvestováno.',
  'le.open': 'Neuzavřené signály této strategie: {n}.',
  'le.sum.ok': 'Všechny strategie se drží v pásmu testu.',
  'le.sum.watch': 'Robot zblízka hlídá strategie: {n}. Ostatní se drží v pásmu testu.',
  'le.sum.off': 'Robot dočasně vypnul strategie: {n}. Ostatní pracují dál.',

  /* Dobít (tlačítko) / Dobito (historie) */
  'wl.topup': 'Dobít', 'acc.load': 'Dobít', 'ld.title': 'Dobít / vybrat',
  'ld.done': 'Dobito: +{v} (fiktivní)', 'wl.l.dep': 'Dobito',

  /* Ukončit všude */
  'term.why.manual': 'ukončil jsi', 'hi.why.manual': 'ukončil jsi',
  'term.closed': 'Ukončeno: {sym} {v}',
  'st.stopNow': 'Ukončit', 'st.stopNowMine': 'Ukončí se za aktuální cenu (fiktivní peníze).', 'st.stopNowDone': 'Ukončeno, výsledek {m} (fiktivní)',
  'sig.mine.closed': 'Ukončeno {v}',
  'my.closed': 'Uzavřeno: {v}',

  /* detail */
  'det.adv': 'Pro pokročilé',
  'det.advS': 'Příklady pák, jak zadat u brokera, podrobnosti signálu, slovníček, kalkulačka',

  /* robot */
  'pa.bigger': 'Účet robota je zvlášť a větší než tvůj – porovnávej procenta, ne koruny.',

  /* první spuštění */
  'onb.b.t': 'S kolika chceš zkoušet?',
  'onb.b.s': 'Tolik fiktivních peněz dostaneš do Peněženky. Nic neplatíš. Později dobiješ tlačítkem Dobít.',
  'onb.b.cap': 'Částka',
  'onb.p.t': 'Jak odvážně?',
  'onb.p.s': 'Jedna volba pro riziko i páku. Kdykoli ji změníš ve Více → Nastavení.',
  'onb.p.ex': 'Z {c}: průměrně ≈ {a} na obchod, nejhůř {l}',
  'onb.p.ex0': 'Z {c}: nejhůř {l} na obchod',
  'onb.step': 'Krok {n} ze 4',
};
