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
  APP_VERSION: '1.5.0',
  THEME_COLOR: '#08090C',

  /* Data files (relative, so the app works from any sub-folder) */
  DATA: (() => {
    /* On a GitHub Pages copy (fork) read live data straight from the bot's branch, so the copy never goes stale. */
    const remote = typeof location !== 'undefined' && location.hostname.endsWith('github.io') && !location.hostname.startsWith('omylatomasz-bit');
    const b = remote ? 'https://raw.githubusercontent.com/omylatomasz-bit/ballistic/pulse-data/data/' : './data/';
    return { signals: b + 'signals.json', history: b + 'history.json', performance: b + 'performance.json', calendar: b + 'calendar.json', league: b + 'league.json' };
  })(),
  /*
   * Live prices: the app polls our Cloudflare Worker (PROXY_URL), which holds the data-provider key server-side.
   */
  LIVE: { PROXY_URL: 'https://pulse-live.y2tbnvrwtj.workers.dev', POLL_SEC: 10, RENDER_MS: 1500 },

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
  PUSH: {
    VAPID_PUBLIC_KEY: 'REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY',
    SUBSCRIBE_URL: '', // e.g. '/api/push/subscribe' (POST JSON PushSubscription)
    UNSUBSCRIBE_URL: '', // e.g. '/api/push/unsubscribe'
  },

  /* Calculator */
  CALC: {
    DEFAULT_ACCOUNT: { CZK: 100000, EUR: 4000, USD: 4500 },
    RISK_PROFILES: [
      { id: 'conservative', pct: 1 }, // label: i18n "profile.conservative"
      { id: 'aggressive', pct: 3 },
    ],
    LEVERAGE_MIN: 1,
    LEVERAGE_MAX: 5,
    /* Indicative FX used only to convert account currency to the instrument's
       USD/EUR price for a share count. Update as needed. Units per 1 USD. */
    FX_PER_USD: { USD: 1, EUR: 0.864, CZK: 21.0 },
    /* Quote currency per symbol (default USD) */
    QUOTE_CCY: { DE40: 'EUR' },
  },

  /*
   * "Otevřít obchod" – hand-off to the user's own broker.
   * The app never places orders, never asks for credentials or API keys.
   * It either opens the broker (optionally on the instrument page via
   * `instrument_url` template with {symbol}) or copies an order summary
   * for the user to enter and confirm in the broker themselves.
   * Keep disabled until legal review is done.
   */
  BROKER_HANDOFF_ENABLED: false,
  BROKERS: [
    // instrument_url: null = no verified deep link yet → copy summary + open_url
    { id: 'xtb', name: 'XTB', open_url: 'https://xstation5.xtb.com/', instrument_url: null },
    { id: 't212', name: 'Trading 212', open_url: 'https://app.trading212.com/', instrument_url: null },
    { id: 'ibkr', name: 'Interactive Brokers', open_url: 'https://portal.interactivebrokers.com/', instrument_url: null },
    { id: 'alpaca', name: 'Alpaca', open_url: 'https://app.alpaca.markets/', instrument_url: null },
  ],

  /* All user-facing texts (incl. the legal disclaimer) live in js/i18n/<lang>.js.
     Language: auto-detected from the browser (cs/sk -> cs, otherwise en), switchable in Nastavení. */
};
