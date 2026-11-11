// 1.10.0 – signál jako pojmenovaná „kampaň“, pevná čísla předem, karty Otevřené / Běžící / Uzavřené,
// hlavní čísla robota, čerstvě uzavřené signály, „Jak to funguje“ ve 4 krocích, nápovědy „?“.
// Slučuje se v js/i18n/index.js (vyhrává nad cs.js a cs19.js). Klíče musí existovat i v en110.js.
export default {
  /* karta signálu */
  'c.title': '{n} {d}',
  'c.why': 'Proč:', 'c.whyMore': 'Celé zdůvodnění',
  'c.dir.BUY': 'nahoru', 'c.dir.SELL': 'dolů',
  'c.type.DEN': 'Denní signál', 'c.type.DNY': '2–3denní signál', 'c.type.TYDEN': 'Týdenní signál', 'c.type.MESIC': 'Měsíční signál',
  'c.typeS.DEN': 'Denní', 'c.typeS.DNY': '2–3denní', 'c.typeS.TYDEN': 'Týdenní', 'c.typeS.MESIC': 'Měsíční',
  'c.subj': 'Předmět', 'c.side': 'Směr', 'c.side.BUY': 'Koupit', 'c.side.SELL': 'Prodat',
  'c.state': 'Stav', 'c.ph.open': 'Otevřený pro vstup', 'c.ph.running': 'Běží', 'c.ph.closed': 'Uzavřený',
  'c.len': 'Délka', 'c.lenOpen': 'do {d} ({n} {u})', 'c.lenToday': 'do {d} (končí dnes)', 'c.lenDays': '{n} {u}',
  'c.dep': 'Když vložíš {a} (fiktivní peníze):',
  'c.maxLoss': 'Maximální možná ztráta', 'c.pot': 'Odhadovaný potenciál', 'c.potNote': 'Potenciál je odhad z cíle robota, není to záruka.',
  'c.move': 'Cena od vstupu', 'c.profit': 'Zisk', 'c.profitS': 'při vkladu {a}', 'c.ret': 'Zhodnocení', 'c.closedAt': 'Uzavřeno',

  /* Signály: Otevřené · Běžící · Uzavřené + délka jako filtr */
  'sg.tabs': 'Stav signálů', 'sg.ph.open': 'Otevřené', 'sg.ph.running': 'Běžící', 'sg.ph.closed': 'Uzavřené',
  'sg.hz': 'Délka signálu', 'sg.hzAll': 'Vše',
  'sg.empty.running': 'Teď neběží žádný signál, na který by bylo pozdě.',
  'sg.empty.closed': 'Zatím žádný uzavřený signál – první výsledky uvidíš po uzavření signálu.',

  /* hlavní čísla */
  'hs.closed': 'Uzavřených signálů', 'hs.win': 'Úspěšnost', 'hs.avg': 'Průměrné zhodnocení na signál',
  'hs.since': 'Robot obchoduje od {d}', 'hs.sinceL': 'Robot obchoduje od', 'hs.asOf': 'Data k {d}',
  'hs.zero': 'zatím 0 – první výsledky po uzavření signálu',
  'hs.winS': '{w} z {n} se ziskem',
  'hs.row': 'Uzavřeno {n} · úspěšnost {w} · Ø {a} na signál',
  'hs.row0': 'Uzavřených signálů: zatím 0 – první výsledky po uzavření signálu',

  /* čerstvě uzavřené */
  'fr.title': 'Výsledky čerstvě uzavřených signálů',
  'fr.c.sig': 'Signál', 'fr.c.type': 'Typ', 'fr.c.ret': 'Zhodnocení', 'fr.c.len': 'Délka', 'fr.c.date': 'Datum',
  'fr.note': 'Zhodnocení = pohyb ceny od vstupu do konce signálu, bez páky. Ukazujeme i ztráty.',
  'fr.more': 'Všechny výsledky',
  'fr.none': 'Zatím žádný uzavřený signál – první výsledky po uzavření signálu.',

  /* Jak to funguje – 4 kroky */
  'jak.sub': 'Ve čtyřech krocích',
  'jak.n1.t': 'Vyber signál', 'jak.n1.s': 'Každý signál má jméno, směr, délku a předem spočítanou maximální možnou ztrátu i odhadovaný potenciál.',
  'jak.n2.t': 'Vlož fiktivní částku', 'jak.n2.s': 'Od 100 Kč. Jsou to fiktivní peníze – nic neplatíš, nic nevybíráš.',
  'jak.n3.t': 'Robot hlídá cenu a dá vědět', 'jak.n3.s': 'Když se cena blíží k cíli nebo ke stopu a když signál skončí.',
  'jak.n4.t': 'Výsledek uvidíš v Zainvestováno', 'jak.n4.s': 'Zisk i ztrátu v penězích a v procentech, každý obchod zvlášť.',
  'jak.q4': 'Můžu ztratit víc, než vložím?',
  'jak.a4': 'Ne. Nejvíc můžeš přijít o částku, kterou do obchodu vložíš. Obvykle je to mnohem méně: obchod se zavře u stopu – to je „Maximální možná ztráta“ u signálu. Jen když cena přes noc skočí přes stop, může být ztráta o něco větší než u stopu, nikdy ale větší než vklad.',
  'jak.q5': 'Je potenciál zaručený?',
  'jak.a5': 'Ne. Odhadovaný potenciál je výsledek, kdyby cena došla k cíli robota. Signál může skončit i ztrátou nebo na konci své délky s menším ziskem.',
  'jak.q6': 'Jsou to skutečné peníze?',
  'jak.a6': 'Ne. V aplikaci obchoduješ jen fiktivními penězi a robot zatím obchoduje na zkušebním účtu. Nic nevkládáš, nic nevybíráš, nikomu nic neposíláš.',
  'onb.how': 'Jak to funguje',

  /* investice */
  'inv.min': 'Nejmenší částka je {a}.',

  /* nápovědy „?“ */
  'th.MAXLOSS.t': 'Maximální možná ztráta',
  'th.MAXLOSS.s': 'Kolik ztratíš, když cena dojde ke stopu – v tu chvíli se obchod sám zavře. Víc než vloženou částku ztratit nemůžeš. Jen když cena přes noc skočí přes stop, může být ztráta o něco větší než u stopu.',
  'th.POT.t': 'Odhadovaný potenciál',
  'th.POT.s': 'Kolik bys vydělal, kdyby cena došla k cíli robota. Je to odhad, ne záruka – signál může skončit i ztrátou.',
  'th.DELKA.t': 'Délka signálu',
  'th.DELKA.s': 'Nejpozději do tohoto dne signál skončí. Když cena do té doby nedojde k cíli ani ke stopu, obchod se zavře za cenu, která v ten den bude.',
  'th.ZHOD.t': 'Zhodnocení',
  'th.ZHOD.s': 'O kolik procent se změnila vložená částka (bez páky) od vstupu do konce signálu. Mínus = ztráta.',
  'th.USPECH.t': 'Úspěšnost',
  'th.USPECH.s': 'Kolik uzavřených signálů skončilo se ziskem. Počítáme všechny uzavřené signály, i ztrátové.',
  'th.AVG.t': 'Průměrné zhodnocení na signál',
  'th.AVG.s': 'Průměr zhodnocení všech uzavřených signálů (bez páky), ztráty se počítají se znaménkem mínus.',
  /* grafy z historie (/api/bars) */
  'bars.mode': 'Graf trhu', 'bars.aria': 'Graf ceny {k}', 'bars.tf': 'Období grafu', 'bars.type': 'Typ grafu',
  'bars.tf.1D': '1D', 'bars.tf.5D': '5D', 'bars.tf.1M': '1M', 'bars.tf.6M': '6M', 'bars.tf.1R': '1R',
  'bars.candle': 'Svíčky', 'bars.line': 'Čára',
  'bars.src': 'Zdroj: {s}', 'bars.delayed': 'zpožděno ~1 min', 'bars.stale': 'poslední data jsou starší',
  'bars.retry': 'Graf se nepodařilo načíst, zkusíme znovu.',
  'bars.ticksWait': 'Pro tento trh historii zatím nemáme – graf se skládá z živých cen, za chvíli tu bude.',
  'bars.ticksSrc': 'Graf z živých cen od otevření aplikace',

  /* sledované grafy */
  'watch.view': 'Zobrazení', 'watch.one': 'Jeden graf', 'watch.title': 'Sledované grafy',
  'watch.layout': 'Kolik grafů', 'watch.n': '{n}', 'watch.addBtn': 'Přidat graf',
  'watch.add': 'Sledovat', 'watch.on': 'Sleduji', 'watch.remove': 'Přestat sledovat',
  'watch.added': 'Přidáno do Sledovaných grafů.', 'watch.removed': 'Odebráno ze Sledovaných grafů.',
  'watch.empty': 'Zatím nic nesleduješ. Klepni na „Přidat graf“.', 'watch.rest': 'Další sledované (klepni = dát nahoru):',
  'watch.delayed': 'Cena zpožděná ~1 min (veřejný zdroj).',

  /* můj fiktivní účet */
  'acc.title': 'Můj účet', 'acc.sub': 'Fiktivní peníze na zkoušení – jen v tomto zařízení',
  'acc.big': 'Můj fiktivní účet', 'acc.free': 'Volné', 'acc.inPlay': 'Ve hře',
  'acc.putIn': 'Vloženo (fiktivně)', 'acc.result': 'Výsledek obchodů', 'acc.open': 'Otevřené obchody', 'acc.orders': 'Čekající nákupy',
  'acc.load': 'Nabít fiktivní peníze', 'acc.wd': 'Vybrat fiktivní peníze', 'acc.reset': 'Začít znovu',
  'acc.note': 'Jsou to jen fiktivní peníze. Nic neplatíš, nic doopravdy nevybíráš a nikam nic neposíláme.',
  'more.ucet': 'Můj účet',
  'sg.todayN': { one: 'Dnes {n} nová příležitost', few: 'Dnes {n} nové příležitosti', other: 'Dnes {n} nových příležitostí' },
  'sg.todayNone': 'Dnes zatím žádná nová příležitost.', 'sg.rules': '(Robot posílá jen to, co projde jeho přísnými pravidly – někdy 2 denně, někdy 10, někdy nic.)',
  'sg.older': { one: 'Z dřívějška je otevřený ještě {n} signál.', few: 'Z dřívějška jsou otevřené ještě {n} signály.', other: 'Z dřívějška je otevřených ještě {n} signálů.' },
  'sg.today0': 'Dnes zatím žádná příležitost neprošla pravidly robota.',
  'bars.noHist': 'Pro tento trh zatím nemáme historii cen – ukazujeme graf signálu.',
  'more.jak.s': 'Celé ve čtyřech krocích',
  'acc.more': 'Podrobnosti účtu (zůstatek, marže, výsledek)',
  'res.openNow': 'Signály, které ještě běží',
  'res.openNowS': 'Všechny neuzavřené: Otevřené (můžeš vstoupit) i Běžící (na vstup pozdě). Jak se jim daří teď.',
  'res.none.s': 'První výsledky se tu objeví po uzavření prvního signálu (cíl, stop nebo konec délky). Signály, které ještě běží, najdeš níže.',
  'sg.phS.open': 'Otevřené = do signálu ještě můžeš vstoupit.',
  'sg.phS.running': 'Běžící = na vstup je už pozdě, ale signál ještě běží. Sleduj, jak dopadne.',
  'sg.phS.closed': 'Uzavřené = hotové signály s výsledkem, i ztrátové. Částky platí pro vklad {a} bez páky.',
  'tour.n1.t': 'Můj účet (fiktivní peníze)', 'tour.n1.s': 'Tady vidíš, kolik máš fiktivních peněz. Nic neplatíš a nic doopravdy nevybíráš.',
  'tour.n2.t': 'Signál = jedna nabídka', 'tour.n2.s': 'Název, směr, typ a délka. Klepni kamkoli na kartu a otevře se detail s celým zdůvodněním.',
  'tour.n3.t': 'Předem spočítaná čísla', 'tour.n3.s': 'Maximální možná ztráta a odhadovaný potenciál pro vklad z příkladu. Stejná čísla uvidíš i v detailu a při investici.',
  'tour.n4.t': 'Zainvestovat', 'tour.n4.s': 'Tlačítko Zainvestovat (při zavřené burze Nastavit nákup) otevře investici fiktivními penězi, předvyplněnou podle signálu. Částku zvolíš od 100 Kč.',
  'tour.n5.t': 'Zainvestováno', 'tour.n5.s': 'Tady najdeš svoje obchody, čekající nákupy a historii – zisk i ztrátu v korunách.',
  'tour.n6.t': 'Kde jsou tvoje peníze', 'tour.n6.s': 'Volné = můžeš investovat, Ve hře = peníze v obchodech a čekajících nákupech.',
  'tour.n7.t': 'Sledované grafy', 'tour.n7.s': 'Až 4 živé grafy najednou, každý se obnovuje každou sekundu. Hvězdičkou přidáš další trh.',
  'hint.n2.t': 'Proč tenhle signál', 'hint.n2.s': 'Dva až tři důvody obyčejnými slovy. Celé zdůvodnění je v detailu.',
};
