// Plain-language help: what the instrument is + the trading words a signal uses (Fable 11. 11. 2026).
import { INSTR } from './instruments.js';
import { lang } from './i18n/index.js';

const G = {
  RSI: { re: /\bRSI/, cs: 'RSI – ukazatel, jak rychle cena v posledních dnech klesala nebo rostla (0–100). RSI(2) pod 10 = cena za 2 dny prudce spadla, často se pak odrazí.', en: 'RSI – how fast the price fell or rose lately (0–100). RSI(2) below 10 = a sharp 2-day drop, often followed by a bounce.' },
  ATR: { re: /\bATR/, cs: 'ATR – průměrný denní rozkmit ceny. Říká, jak moc se cena běžně hýbe; podle něj se nastavuje stop.', en: 'ATR – the average daily price range. It shows how much the price normally moves; the stop is set from it.' },
  SMA: { re: /SMA|průměr|average/i, cs: 'Průměr ceny (SMA) – průměrná cena za posledních N dní. Nad 200denním průměrem = dlouhodobě rostoucí trend.', en: 'Moving average (SMA) – the average price of the last N days. Above the 200-day average = long-term uptrend.' },
  VIX: { re: /\bVIX/, cs: 'VIX – „index strachu“ amerického trhu. Nad 18 jsou lidé nervózní a ceny víc kolísají.', en: 'VIX – the US market “fear index”. Above 18 investors are nervous and prices swing more.' },
  ETF: { re: /\bETF|fond|fund/i, cs: 'ETF – fond, který se kupuje jako jedna akcie, ale drží v sobě mnoho firem najednou.', en: 'ETF – a fund you buy like one share that holds many companies at once.' },
  ACCT: { re: /./, cs: 'Zisk / ztráta účtu vs. pohyb ceny – „Zisk účtu při cíli +2 %“ = o kolik % vzroste CELÝ váš účet, když cena dojde k cíli (robot riskuje 1 % účtu). „Cena cíle 235,08 (+24,5 %)“ = o kolik se musí pohnout CENA akcie. Do obchodu jde jen část účtu, proto jsou čísla různá.', en: 'Account gain vs. price move – “Account gain at target +2%” = how much your WHOLE account grows when the price reaches the target (the robot risks 1% of the account). “Target price 235.08 (+24.5%)” = how far the share PRICE must move. Only part of the account goes into a trade, so the numbers differ.' },
  STAV: { re: /./, cs: 'Stav obchodu – „Vydělává / Prodělává“ = jak se pohnula cena od vstupu; „+80 Kč na 10 000 Kč v obchodu“ = příklad v penězích; „Blížíme se k cíli“ = cena ušla aspoň 60 % cesty k cíli; „Pozor, blízko stopu“ = totéž směrem ke stopu.', en: 'Trade status – “Making / Losing money” = how far the price moved from entry; “+80 CZK per 10,000 CZK in the trade” = an example in money; “Close to target” = the price covered at least 60% of the way to the target; “Careful, close to stop” = the same towards the stop.' },
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
  return ['ACCT', 'STAV'].concat(keys, ['STOP', 'CIL', 'LIMIT', 'PAKA']).map((k) => cs ? G[k].cs : G[k].en);
}
