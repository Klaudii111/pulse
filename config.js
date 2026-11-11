/*
 * PULSE Signals – central configuration.
 * Everything a deployer may want to change lives here.
 * After changing APP_NAME / APP_SHORT_NAME / THEME_COLOR run:
 *   python3 tools/apply_config.py
 * which syncs manifest.webmanifest and index.html with these values.
 */
export const CONFIG = {
  APP_NAME: 'PULSE Signals',
  APP_SHORT_NAME: 'PULSE',
  APP_VERSION: '1.9.0',
  THEME_COLOR: '#08090C',

  /* Data files (relative, so the app works from any sub-folder) */
  DATA: (() => {
    /* On a GitHub Pages copy (fork) read live data straight from the bot's branch, so the copy never goes stale. */
    const remote = typeof location !== 'undefined' && location.hostname.endsWith('github.io') && !location.hostname.startsWith('omylatomasz-bit');
    const b = remote ? 'https://raw.githubusercontent.com/omylatomasz-bit/ballistic/pulse-data/data/' : './data/';
    /* paper.json (robot's Alpaca paper account) and quotes.json (live prices every 15 s) exist only on our server;
       on a GitHub Pages copy they are not requested (paper: null -> section hidden, quotes -> Cloudflare worker). */
    return { signals: b + 'signals.json', history: b + 'history.json', performance: b + 'performance.json', calendar: b + 'calendar.json', league: b + 'league.json',
      paper: remote ? null : './data/paper.json', quotes: remote ? null : './data/quotes.json',
      /* 1.9.0: what the Obchodní platforma can trade (indices, currencies, commodities, crypto, shares, ETFs) */
      instruments: remote ? null : './data/instruments.json' };
  })(),
  /* Public address of the main app (install page QR code, push on GitHub Pages copies points users here) */
  APP_URL: 'https://pulse.178-105-154-81.sslip.io/',
  /*
   * Live prices: the app polls our Cloudflare Worker (PROXY_URL), which holds the data-provider key server-side.
   */
  /* Primary: ./data/quotes.json written by our server every 15 s (same origin, no rate limit).
     Fallback: the Worker, only when quotes.json is missing or older than QUOTES_STALE_SEC. */
  /* STREAM_URL (1.9.0): real-time prices from our server (Server-Sent Events); not used on GitHub Pages copies */
  LIVE: { PROXY_URL: 'https://pulse-live.y2tbnvrwtj.workers.dev', STREAM_URL: '/api/stream', POLL_SEC: 10, QUOTES_POLL_SEC: 15, QUOTES_STALE_SEC: 120, FRESH_SEC: 60, RENDER_MS: 1500 },
  /* Intraday scan of the server (Prague time, Mon-Fri): every 20 min at :05/:25/:45 while the US market is open */
  SCAN: { MINUTES: [5, 25, 45] },

  /* Horizons hidden in the app until their strategy passes the out-of-sample test (1-day: no edge yet) */
  HIDDEN_HORIZONS: ['DEN'],

  /* Poll signals.json every N minutes while the app is visible */
  POLL_MIN: 5,
  /* Bot publishes new signals at this time (CET) on trading days, used when signals.json has no next_run_at */
  BOT_RUN_TIME: '22:45',

  /* Alert when price is within this % of stop or target (user can change in Nastavení) */
  PROXIMITY_PCT_DEFAULT: 1,
  PROXIMITY_OPTIONS: [0.5, 1, 2],
  /*
   * Entry validity for latecomers (in R units from entry, in the profitable direction).
   * <= VALID_R: entry still fine; up to LATE_R: only with a limit order at entry;
   * beyond LATE_R or past LATE_PROGRESS of the way to target: do not enter.
   */
  ENTRY: { VALID_R: 0.3, LATE_R: 0.5, LATE_PROGRESS: 0.5 },
  /* Only notify about intraday hits newer than this many hours */
  HIT_NOTIFY_MAX_AGE_H: 12,

  /*
   * Levels (Odemykání úrovní). Weeks count from the first app launch on the device.
   * TESTER_BYPASS: in paper mode a "Režim testera" switch unlocks everything.
   */
  LEVELS_ENABLED: true,
  LEVELS_TESTER_BYPASS: true,
  LEVELS: [
    { id: 1, horizons: ['MESIC'], max_leverage: 1, lessons: 0, weeks: 0 },
    { id: 2, horizons: ['MESIC', 'TYDEN'], max_leverage: 2, lessons: 5, weeks: 2 },
    { id: 3, horizons: ['MESIC', 'TYDEN', 'DNY'], max_leverage: 3, lessons: 10, weeks: 4 },
    { id: 4, horizons: ['MESIC', 'TYDEN', 'DNY', 'DEN'], max_leverage: 5, lessons: 10, weeks: 6 },
  ],


  /* Subscription UI (payments TODO; buttons stay disabled until mode = "live").
     Names and feature lists are translated in js/i18n/<lang>.js ("plan.*"). */
  PLANS: [
    { id: 'free', price: 0, currency: 'CZK' },
    { id: 'pro', price: 490, currency: 'CZK', period: 'month' },
  ],

  /*
   * Invite gate (soft protection only – the code hash is visible to anyone
   * who reads this file; real authentication comes with the server).
   * Hash = SHA-256 hex of the access code. Demo code: PULSE2026
   *   echo -n "YOURCODE" | sha256sum
   */
  ACCESS_GATE_ENABLED: true,
  ACCESS_CODE_SHA256: '04b0cb2d7fe5ab0cd4473b97209be6251da9934eeeb7a4e97c9297842622cdf4',

  /*
   * Web push. Replace with your real VAPID public key (base64url) and
   * set SUBSCRIBE_URL to the endpoint that stores subscriptions (TODO server).
   */
  /* Push lives on our server only. On a GitHub Pages copy (hostname *.github.io) the relative endpoints do not exist,
     so push is switched off there and the app points the user to APP_URL instead (no cross-origin subscribe, no CORS). */
  PUSH: {
    VAPID_PUBLIC_KEY: 'BD0oeaaYjhr7mhGIt8u2gExJKV7lX2XKlKeZ8LG_I-HHxS2WZyTjw-jWlzoy8ePWTV0zqU4sBpRy_mGbKYPTInQ',
    SUBSCRIBE_URL: '/api/push/subscribe', // POST JSON {subscription, lang}
    UNSUBSCRIBE_URL: '/api/push/unsubscribe', // POST JSON {endpoint}
    ENABLED: typeof location === 'undefined' || !location.hostname.endsWith('github.io'),
  },

  /* Calculator */
  CALC: {
    DEFAULT_ACCOUNT: { CZK: 100000, EUR: 4000, USD: 4500 },
    RISK_PROFILES: [
      { id: 'conservative', pct: 1 }, // label: i18n "profile.conservative"
      { id: 'aggressive', pct: 3 },
    ],
    LEVERAGE_MIN: 1,
    /* fallback max leverage when an instrument has no max_leverage (instruments.json) */
    LEVERAGE_MAX: 5,
    /* EU retail caps (ESMA) by instrument class, used when instruments.json does not say */
    LEVERAGE_CAPS: { fx_major: 30, fx: 20, index: 20, gold: 20, commodity: 10, stock: 5, etf: 5, crypto: 2 },
    /* fictional money the user can load on the demo account (account currency CZK; EUR / USD get /25 and /22) */
    TOPUP: { CZK: [10000, 50000, 100000, 500000], EUR: [500, 2000, 4000, 20000], USD: [500, 2000, 4500, 20000] },
    /* Indicative FX used only to convert account currency to the instrument's
       USD/EUR price for a share count. Update as needed. Units per 1 USD. */
    FX_PER_USD: { USD: 1, EUR: 0.864, CZK: 21.0, GBP: 0.76, JPY: 155, CHF: 0.82, AUD: 1.48 },
    /* Quote currency per symbol (default USD) */
    QUOTE_CCY: { DE40: 'EUR' },
  },

  /*
   * Broker hand-off ("Vyzkoušet u brokera").
   * The app never places orders, never asks for credentials or API keys and uses NO affiliate links.
   * It copies an order summary (entry / stop / target) and opens the broker's page; the user enters and confirms the
   * order there. BROKER_MODE switches the whole flow:
   *   'demo' (now) – button "Vyzkoušet u brokera na DEMO účtu", opens each broker's demo / practice page (demo_url)
   *   'live'       – button "Otevřít obchod u brokera", opens the real platform (live_url) + stronger risk wording.
   *                  Switch to 'live' only after the legal review (CFD risk warnings, no investment advice).
   * Brokers without a demo_url are hidden in demo mode, without a live_url hidden in live mode.
   * URLs are public entry pages (no tracking parameters); deep links per instrument are not verified yet.
   */
  BROKER_HANDOFF_ENABLED: true,
  BROKER_MODE: 'demo',
  BROKERS: [
    { id: 'mt5', name: 'MetaTrader 5', demo_url: 'https://www.metatrader5.com/en/download', live_url: 'https://www.metatrader5.com/en/download' },
    { id: 'xtb', name: 'XTB', demo_url: 'https://www.xtb.com/', live_url: 'https://xstation5.xtb.com/' },
    { id: 't212', name: 'Trading 212', demo_url: 'https://www.trading212.com/', live_url: 'https://app.trading212.com/' },
    { id: 'ibkr', name: 'Interactive Brokers', demo_url: 'https://www.interactivebrokers.com/', live_url: 'https://portal.interactivebrokers.com/' },
    { id: 'alpaca', name: 'Alpaca', demo_url: 'https://app.alpaca.markets/signup', live_url: 'https://app.alpaca.markets/' },
  ],
  /* MetaTrader 5: official MetaQuotes download (the terminal offers a free demo account on first start).
     The PULSE Expert Advisor (draws / executes PULSE signals on an MT5 DEMO account) is "coming soon": set EA_URL when ready. */
  MT5: { DOWNLOAD_URL: 'https://www.metatrader5.com/en/download', EA_URL: '' },

  /* All user-facing texts (incl. the legal disclaimer) live in js/i18n/<lang>.js.
     Language: auto-detected from the browser (cs/sk -> cs, otherwise en), switchable in Nastavení. */
};
