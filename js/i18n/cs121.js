// 1.13.7 – klidné částky: výchozí vklad po 100 Kč / 10 €, ztráta zaokrouhleně („≈ −1 000 Kč“), u omezeného vkladu
// přesně s důvodem; Peněženka „Zisk/ztráta otevřených obchodů“; Signály 2 řádky ovládání; Ukončené podle profilu.
// Klíče musí být i v en121.js.
export default {
  'mb.limW': '≈ {w} % peněženky, vklad je omezený',
  'cc.maxLim': 'max {v} (méně než {p} %, vklad je omezený)',
  'mb.limS': 'méně než {p} %, vklad je omezený',
  'acc.open': 'Zisk/ztráta otevřených obchodů',
  'dh.split3': 'Volné {f} · Ve hře {u} · Zisk/ztráta otevřených obchodů {o}',
  'sg.ph.running': 'Pozdě',
  'sg.ph.closed': 'Ukončené',
  'sg.phT.open': 'Můžeš koupit = do signálu ještě můžeš vstoupit. Robot posílá jen to, co projde jeho pravidly – někdy 2 denně, někdy nic.',
  'sg.phT.running': 'Pozdě = cena už utekla od vstupu, signál ale ještě neskončil.',
  'sg.phT.closed': 'Ukončené = hotové signály s výsledkem, i ztrátové. Částky platí pro tvůj vklad a zvolený profil.',
  'sg.hzSel': 'Délka: {v}',
  'sg.profSel': 'Profil: {v}',
  'cc.closed': 'Kdo vložil {a}, má',
  'cc.closedLev': 'Kdo vložil {a} s pákou 1:{l}, má',
  'c.profitS': 'při vkladu {a}',
  'sg.empty.closed': 'Zatím žádný ukončený signál – první výsledky uvidíš, až nějaký signál skončí.',
  'c.profitSLev': 'při vkladu {a}, páka 1:{l}',
};
