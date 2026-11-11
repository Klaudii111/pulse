// Plain-language help: what the instrument is + the trading words a signal uses (Fable 11. 11. 2026).
import { INSTR } from './instruments.js';
import { lang } from './i18n/index.js';

const G = {
  RSI: { re: /\bRSI/, cs: 'RSI – ukazatel, jak rychle cena v posledních dnech klesala nebo rostla (0–100). RSI(2) pod 10 = cena za 2 dny prudce spadla, často se pak odrazí.', en: 'RSI – how fast the price fell or rose lately (0–100). RSI(2) below 10 = a sharp 2-day drop, often followed by a bounce.' },
  ATR: { re: /\bATR/, cs: 'ATR – průměrný denní rozkmit ceny. Říká, jak moc se cena běžně hýbe; podle něj se nastavuje stop.', en: 'ATR – the average daily price range. It shows how much the price normally moves; the stop is set from it.' },
  SMA: { re: /SMA|průměr|average/i, cs: 'Průměr ceny (SMA) – průměrná cena za posledních N dní. Nad 200denním průměrem = dlouhodobě rostoucí trend.', en: 'Moving average (SMA) – the average price of the last N days. Above the 200-day average = long-term uptrend.' },
  VIX: { re: /\bVIX/, cs: 'VIX – „index strachu“ amerického trhu. Nad 18 jsou lidé nervózní a ceny víc kolísají.', en: 'VIX – the US market “fear index”. Above 18 investors are nervous and prices swing more.' },
  ETF: { re: /\bETF|fond|fund/i, cs: 'ETF – fond, který se kupuje jako jedna akcie, ale drží v sobě mnoho firem najednou.', en: 'ETF – a fund you buy like one share that holds many companies at once.' },
  R: { re: /./, cs: 'R – jednotka rizika: 1 R = kolik ztratíte, když cena dojde na stop. +2 R = vyděláte dvojnásobek toho, co riskujete.', en: 'R – a unit of risk: 1 R = what you lose if the price hits the stop. +2 R = you earn twice what you risk.' },
  STOP: { re: /./, cs: 'Stop (stop-loss) – cena, kde se obchod automaticky zavře se ztrátou, aby nebyla větší.', en: 'Stop (stop-loss) – the price where the trade closes automatically at a loss, so it cannot grow.' },
  CIL: { re: /./, cs: 'Cíl (take-profit) – cena, kde se obchod zavře se ziskem.', en: 'Target (take-profit) – the price where the trade closes in profit.' },
  LIMIT: { re: /./, cs: 'Limitní příkaz – koupíte jen za uvedenou cenu nebo levněji, nikdy dráž.', en: 'Limit order – you buy only at the given price or cheaper, never higher.' },
  PAKA: { re: /./, cs: 'Páka – obchodujete s větší částkou, než máte na účtu. Zisk i ztráta se násobí.', en: 'Leverage – you trade a bigger amount than your account. Profit and loss are multiplied.' },
};

/* What the instrument is, in the current language (null when unknown). */
export function instrumentText(sym) {
  const x = INSTR[sym];
  if (!x) return null;
  return lang() === 'cs' ? x.cs : x.en;
}

/* Glossary entries relevant to a signal: always the basics, plus the indicators its text mentions. */
export function glossaryFor(s, texts = []) {
  const blob = texts.join(' ');
  const keys = ['RSI', 'ATR', 'SMA', 'VIX', 'ETF'].filter((k) => G[k].re.test(blob) || (k === 'ETF' && INSTR[s.symbol]?.k === 'etf'));
  const cs = lang() === 'cs';
  return keys.concat(['STOP', 'CIL', 'R', 'LIMIT', 'PAKA']).map((k) => cs ? G[k].cs : G[k].en);
}
