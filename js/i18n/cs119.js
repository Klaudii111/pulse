// 1.13.5 – vklad je u všech tří profilů STEJNÝ (vklad Konzervativně), profil mění jen páku: Konzervativně bez páky ·
// Vyváženě 1:2 · Agresivněji až do stropu trhu. Nejhorší ztráta se počítá u každého signálu. Klíče musí být i v en119.js.
export default {
  /* profil = jen páka */
  'pf.sw': 'Profil:',
  'pf.worst': 'nejhůř ~{v} %',
  'pf.short.cons': 'bez páky · nejhůř ~1 % peněženky',
  'pf.short.bal': 'páka 1:2 · nejhůř ~2 %',
  'pf.short.aggr': 'páka až 1:{s} u akcií · nejhůř ~{w} %',
  'pf.long.cons': 'Bez páky: při stopu ztratíš nejvýš ~1 % peněženky. Doporučeno pro začátek.',
  'pf.long.bal': 'Stejný vklad s pákou 1:2: dvakrát větší zisky i ztráty, při stopu nejvýš ~2 % peněženky.',
  'pf.long.aggr': 'Stejný vklad s pákou až do zákonného stropu trhu (akcie 1:5, indexy a zlato 1:20, krypto 1:2): u akcie při stopu nejvýš ~5 % peněženky. Největší zisky i ztráty, víc než vklad neztratíš.',
  'mp.prof': 'Profil – jak velkou páku chceš',
  'mp.sum': 'Výchozí vklad do jednoho obchodu až {a} – u všech profilů stejný. Tvůj profil: u akcie při stopu nejvýš ~{p} % peněženky.',
  'onb.p.t': 'Jak odvážně?',
  'onb.p.s': 'Vklad je u všech profilů stejný, profil mění jen páku. Kdykoli ho změníš ve Více → Nastavení.',
  'onb.p.ex': 'Z {c}: průměrně ≈ {a} na obchod, nejhůř {l}',
  'onb.p.note': 'Příklad pro akcii. U každého signálu uvidíš jeho vlastní čísla.',
  'mb.levAria': 'Profil: jak velká páka',

  /* sloupce a řádky peněz */
  'mb.depCol': 'vklad {a}',
  'mb.trade': 'Tento obchod: nejhůř {v} ({p} % vkladu, {w} % peněženky).',
  'mb.trade0': 'Tento obchod: nejhůř {v} ({p} % vkladu).',
  'mb.same': 'Vklad je u všech profilů stejný – profil mění jen páku, a tím zisk i ztrátu.',
  'dd2.bal': 'Celý účet robota v testu s pákou 1:2, nejhorší období: −26 %.',
  'dd2.aggr': 'Celý účet robota v testu s pákou 1:5, nejhorší období: −58 % – jen pro ty, kdo unesou velké výkyvy.',

  /* cena nákupu / prodeje (stejná na tlačítku i v okně obchodu) */
  'px.buyAt': 'nákup za', 'px.sellAt': 'prodej za',

  /* Kalkulačka */
  'calc.profile': 'Profil (páka)',
  'calc.worstAcc': 'nejhůř {v} peněženky',
  'calc.sameDep': 'Vklad je u všech profilů stejný, profil mění jen páku.',
  'calc.capMkt': 'Nejvyšší páka u tohoto trhu: 1:{v} (Agresivněji). Bez páky = 1×.',
  'calc.levNote5': 'Vklad {a} · {lev} → obchoduješ za {n}. Víc než vklad neztratíš.',

  /* detail: můj obchod je zavřený, signál ještě platí */
  'det.reentry': 'Tvůj obchod je uzavřený. Signál ještě platí – můžeš vstoupit znovu.',
  'sc.investAgain': 'Zainvestovat znovu',
  'det.sigEnded': 'Signál skončil',
};
