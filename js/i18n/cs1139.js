// 1.13.9 – Obchodovat hned (žádné čekání na data), všechny sledované grafy naráz se stavem trhu, stavová řádka robota
// (plán kontrol = časovače na serveru), jednodenní signály vysvětlené, okno vstupu signálu, Agresivněji = páka 1:20.
// Klíče musí být i v en1139.js.
export default {
  /* trh zavřený / otevřený */
  'mk.closedOpens': 'Burza zavřená · otevře {d}',
  'mk.closedHow': 'Teď se tu cena nehýbe. Koupit můžeš s nákupem, který počká na otevření.',
  'mk.openNow': 'Teď se obchoduje:',

  /* stavová řádka robota (Dnes, Signály) */
  'scan.n0': 'dnes zatím žádný nový',
  'scan.n': { one: 'dnes zatím {n} nový', few: 'dnes zatím {n} nové', other: 'dnes zatím {n} nových' },
  'scan.open': 'Robot teď hledá nové příležitosti (burza v USA otevřená do {close}) · {n} · další kontrola v {nextT}.',
  'scan.before': 'Robot hledá nové příležitosti během burzy v USA {open}–{close}, každých 20 minut · první kontrola dnes v {nextT}, hlavní výběr večer ve {off}.',
  'scan.after': 'Burza v USA už zavřela · {n} · hlavní výběr dnes ve {off}.',
  'scan.closed': 'Burza v USA má teď zavřeno · další kontrola {next}.',
  'scan.den': 'Jednodenní signály zatím nedáváme – v testu nevydělávaly. Měříme dál.',
  'sig.none': 'Teď není žádný signál ke koupi – robot dává jen to, co projde jeho pravidly, některé dny nic. Další kontrola {when}, hlavní výběr večer ve 22:45.',
  'next.sub': 'Během obchodování v USA robot kontroluje trh každých 20 minut, hlavní výběr je večer ve 22:45 (český čas). Přijde ti upozornění.',

  /* okno vstupu */
  'ew.until': 'Vstup platí do {d}',
  'ew.chip': 'Vstup skončil',
  'ew.do': 'Vstup už skončil – robot ho drží dál, nový nákup ne.',
  'sg.ph.running': 'Běží',
  'sg.phT.running': 'Běží = robot je drží, nový vstup už ne (cena utekla, nebo skončila doba vstupu).',
  'sg.empty.running': 'Teď neběží žádný signál, do kterého by se už nedalo vstoupit.',
  'cp.nowTo': 'Vstup teď do {e}', 'cp.soonTo': 'Vstup {day} {time}–{e}', 'cp.until': 'platí do {d}',
  'term.valid.sig': 'dokud platí vstup',

  /* páka – Agresivněji 1:20 */
  'pf.eu': 'U skutečného brokera v EU je 1:20 u akcií jen pro profesionální klienty (běžně 1:5).',
  'pf.euCrypto': 'U skutečného brokera v EU je u kryptoměn páka nejvýš 1:2 – 1:20 jen v této ukázce.',
  'lv.demo': 'V této ukázce jde páka u každého trhu až 1:{v}.',
  'onb.p.s': 'Profil mění páku: Konzervativně bez páky, Vyváženě 1:2, Agresivněji 1:20 s vkladem 5 % peněženky. Kdykoli ho změníš ve Více → Nastavení.',
  'calc.sameDep': 'Konzervativně a Vyváženě mají stejný vklad, Agresivněji vloží 5 % peněženky s pákou 1:20 – nejhůř celý vklad ≈ 5 % peněženky.',
  'pf.short.aggr': 'páka 1:20 · nejhůř ~{w} %',
  'pf.long.aggr': 'Vklad 5 % peněženky s pákou 1:20 – obchoduješ za celou peněženku. Nejhůř přijdeš o celý vklad ≈ 5 % peněženky. Největší zisky i ztráty.',
  'mp.lev.aggr': 'Páka 1:20 · vklad 5 % peněženky',
  'onb.levAggr': 'páka 1:20 · vklad 5 %',
  'mp.sum': 'Výchozí vklad do jednoho obchodu až {a} (Agresivněji: 5 % peněženky s pákou 1:20). Tvůj profil: při stopu nejvýš ~{p} % peněženky.',
  'mb.same': 'Konzervativně a Vyváženě mají stejný vklad, Agresivněji vloží 5 % peněženky s pákou 1:20 – nejhůř celý vklad ≈ 5 % peněženky.',
  'dd2.aggr': 'Celý účet s pákou 1:20 jsme v testu nezkoušeli – propad může být velmi vysoký. Jen pro ty, kdo unesou velké výkyvy.',
  'dd.aggr': 'Pozor: celý účet s pákou 1:20 jsme v testu nezkoušeli – propad může být velmi vysoký. Jen pro ty, kdo unesou velké výkyvy.',
  'set.proS': 'Vypnuto = v ukázce páka až 1:20 u všech trhů (skutečný broker v EU dá drobnému investorovi u akcií 1:5). Zapnuto = vyšší páky jako u brokera pro profesionály. Jen fiktivní peníze.',
  'pro.caps': 'Nejvyšší páky po zapnutí: akcie a ETF 1:20, indexy 1:100, měny 1:100, zlato 1:100, ostatní komodity 1:50, krypto 1:20.',
  /* 1.13.9: účet se synchronizuje mezi zařízeními (sync.js) – žádné „jen v tomto zařízení“ */
  'ld.depS': 'Kolik fiktivního kreditu chceš přidat? Nic neplatíš.',
  'j.local': 'Uloží se do tvého účtu – uvidíš ho i na propojených zařízeních.',
  'j.closedNote': 'Tvůj výsledek je uložený v tvém účtu. Robot pozici dál sleduje podle svého plánu.',
  'jr.foot': 'Deník je součástí tvého účtu – na mobilu i počítači stejný po propojení (Peněženka → Můj účet na všech zařízeních).',
  'term.fict': 'Fiktivní peníze – nic se neobchoduje doopravdy.',
  'acc.sub': 'Fiktivní peníze na zkoušení',
  'cc.avgNa': 'u páky 1:{l} netestováno',
  'mb.allW': 'celý vklad ≈ {w} % peněženky',
  'pf.wipe20': 'Při páce 1:20 obchod skončí už při pohybu ceny o {v} % proti tobě (dřív než stop signálu).',
  'calc.capMkt': 'Nejvyšší páka v této ukázce: 1:{v} (Agresivněji). 1:1 = bez páky.',
  'calc.worstAll': 'nejhůř {v}',
  'calc.foot': 'Stejná čísla jako na kartě signálu (se spreadem, bez dalších poplatků){rate}.',
  'c.held': 'Drží robot',
  'stamp.stale': 'poslední cena z {time}',
  'bars.delayed': 'veřejný zdroj se zpožděním',
  'term.delayedLive': 'zpožděný zdroj · před {s} s',
};
