/* 1.15.0 release round (B): Portfolio, stránka obchodu, Obchodovat, Peněženka, Historie, Více – opravy po kontrole očima klienta (12. 11. 2026) */
export default {
  /* B1: „dnes“ = změna od včerejšího zavření; dokud nedorazí ceny, „…“ */
  'po.todayWait': 'Dnes …',
  'pd.k.todayS': 'změna od včerejšího zavření burzy',
  /* B2: skutečné kusy s kurzem */
  'pd.k.fx': 'kurz {a} ≈ {b} · výsledek počítáme bez vlivu kurzu',
  /* B3: kde obchod s pákou opravdu skončí */
  'pd.k.atEnd': 'Konec kvůli páce při ≈ {v}',
  'pd.k.atEndS': 'celý vklad – stačí pohyb o {m} % proti tobě',
  'pd.k.stop2': 'stop signálu {v} – sem obchod nedojde, skončí dřív kvůli páce',
  'pd.lv.end': 'konec kvůli páce',
  'pd.d.wayEnd': 'Cesta od konce kvůli páce k cíli (│ = můj nákup, ● = teď)',
  'pd.d.toEnd': 'ke konci kvůli páce {v}',
  'th.LEVEND.t': 'Konec kvůli páce',
  'th.LEVEND.s': 'S pákou se výsledek násobí. Když cena jde proti tobě o tolik, že ztráta dosáhne celého vkladu, obchod se sám ukončí – víc než vklad ztratit nemůžeš. S pákou 1:20 na to stačí pohyb o 5 %, s 1:5 o 20 %. Když je tahle hranice blíž než stop signálu, obchod skončí tady, ne u stopu.',
  /* B4: v „Cestě“ jen vzdálenost v % od ceny teď (peníze jsou jednou v „Kolik mám“) */
  'pd.d.toTarget': 'do cíle {v}', 'pd.d.toStop': 'ke stopu {v}',
  /* B5: robot svůj obchod ukončil, můj běží */
  'pd.rb.head': 'Robot tento obchod ukončil {d}{how}.',
  'pd.rb.at': 'za {v}',
  'pd.rb.mine': 'Tvůj běží dál: {v}.',
  'pd.rb.close': 'Ukončit taky',
  'pd.rb.keep': 'Nechat běžet',
  'pd.rb.kept': '{h} Ten tvůj necháváš běžet.',
  'pd.st.robotOut': 'Robot svůj obchod už ukončil. Ten tvůj běží, dokud ho neukončíš ty nebo nedojde na stop či cíl.',
  'pd.st.noSig': 'Obchod podle signálu robota. Signál už v dnešních datech není – stop a cíl tvého obchodu hlídáme dál.',
  /* K3: věta bez dohadů */
  'pd.gone': 'Tenhle obchod už v peněžence není.',
  /* B6: koláč = co mám teď */
  'al.mid': 'Hodnota účtu',
  'al.k.wait': 'Čeká na nákup',
  'al.aria': 'Koláč: hodnota účtu {v}, co v ní máš podle druhu trhu',
  'al.rule': 'Obchody v hodnotě teď (vklad + výsledek), čekající nákupy a volné peníze dávají dohromady hodnotu účtu.',
  'po.inWait': 'z toho {v} čeká na nákup',
  /* K1-13: Historie = moje obchody, srovnání s ostatními zavřené dole */
  'hi.cmMore': 'Porovnat s ostatními (nepovinné)',
  'hi.sub': 'Moje uzavřené obchody',
  'pd.moreOpts': 'Další možnosti',
};
