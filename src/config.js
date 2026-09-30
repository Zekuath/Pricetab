const DEFAULT_COIN_OPTIONS = ["BTC", "ETH", "XRP", "LTC"];

// Coins we can actually chart. Most are served by Coinbase at {COIN}-USD;
// a few come from another provider (see COIN_PROVIDERS below) because
// Coinbase doesn't list them. Pairs that 404 everywhere (TRX, OKB, THETA,
// FTM, DYDX, KAS, GMX, XDC, NEO, FXS, RUNE, CELO, AGIX, WOO, CFX, ORDI)
// were removed — they only produced console errors.
const SUGGESTED_COINS = [
  "BTC",
  "ETH",
  "USDT",
  "BNB",
  "SOL",
  "XRP",
  "USDC",
  "DOGE",
  "ADA",
  "AVAX",
  "LINK",
  "DOT",
  "MATIC",
  "TON",
  "SHIB",
  "LTC",
  "BCH",
  "ATOM",
  "XLM",
  "FIL",
  "HBAR",
  "APT",
  "ARB",
  "STX",
  "NEAR",
  "IMX",
  "ICP",
  "VET",
  "MKR",
  "QNT",
  "GRT",
  "ALGO",
  "AAVE",
  "SAND",
  "MANA",
  "XTZ",
  "EGLD",
  "FLOW",
  "AXS",
  "RNDR",
  "RPL",
  "OP",
  "TIA",
  "INJ",
  "ENS",
  "ZEC",
  "XMR",
  "PI",
  "KSM",
  "CHZ",
  "CAKE",
  "CRV",
  "COMP",
  "SNX",
  "1INCH",
  "BAT",
  "KAVA",
  "MINA",
  "LDO",
  "SUI",
  "PEPE",
  "SEI",
  "GALA",
  "ILV",
  "BLUR",
  "PYTH",
  "WETH",
  "WBTC",
  "DAI",
  "UNI",
  "USDE",
  "PYUSD",
  "PAXG",
  "ONDO",
  "XAUT",
  "OKB",
  "MNT",
  "CRO",
  "ENA",
  "ETHFI",
  "FET",
];

// Full names so users can search "Dogecoin" as well as "DOGE"
const COIN_NAMES = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  USDT: "Tether",
  BNB: "BNB",
  SOL: "Solana",
  XRP: "XRP",
  USDC: "USD Coin",
  DOGE: "Dogecoin",
  ADA: "Cardano",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  DOT: "Polkadot",
  MATIC: "Polygon",
  TON: "Toncoin",
  SHIB: "Shiba Inu",
  LTC: "Litecoin",
  BCH: "Bitcoin Cash",
  ATOM: "Cosmos",
  XLM: "Stellar",
  FIL: "Filecoin",
  HBAR: "Hedera",
  APT: "Aptos",
  ARB: "Arbitrum",
  STX: "Stacks",
  NEAR: "NEAR Protocol",
  IMX: "Immutable",
  ICP: "Internet Computer",
  VET: "VeChain",
  MKR: "Maker",
  QNT: "Quant",
  GRT: "The Graph",
  ALGO: "Algorand",
  AAVE: "Aave",
  SAND: "The Sandbox",
  MANA: "Decentraland",
  XTZ: "Tezos",
  EGLD: "MultiversX",
  FLOW: "Flow",
  AXS: "Axie Infinity",
  RNDR: "Render",
  RPL: "Rocket Pool",
  OP: "Optimism",
  TIA: "Celestia",
  INJ: "Injective",
  ENS: "Ethereum Name Service",
  ZEC: "Zcash",
  XMR: "Monero",
  PI: "Pi Network",
  KSM: "Kusama",
  CHZ: "Chiliz",
  CAKE: "PancakeSwap",
  CRV: "Curve DAO",
  COMP: "Compound",
  SNX: "Synthetix",
  "1INCH": "1inch",
  BAT: "Basic Attention Token",
  KAVA: "Kava",
  MINA: "Mina",
  LDO: "Lido DAO",
  SUI: "Sui",
  PEPE: "Pepe",
  SEI: "Sei",
  GALA: "Gala",
  ILV: "Illuvium",
  BLUR: "Blur",
  PYTH: "Pyth Network",
  WETH: "Wrapped Ether",
  WBTC: "Wrapped Bitcoin",
  DAI: "Dai",
  UNI: "Uniswap",
  USDE: "Ethena USDe",
  PYUSD: "PayPal USD",
  PAXG: "PAX Gold",
  ONDO: "Ondo",
  XAUT: "Tether Gold",
  OKB: "OKB",
  MNT: "Mantle",
  CRO: "Cronos",
  ENA: "Ethena",
  ETHFI: "Ether.fi",
  FET: "Artificial Superintelligence Alliance",

  /* Tokens an Ethereum address can hold. They are not in `SUGGESTED_COINS` —
   * no exchange this app talks to quotes a *series* for them, so they are
   * holdable and not chartable — but they are priced by the ticker sweep and
   * they need a name here all the same: `quickSwitchMatches` searches names as
   * well as symbols, so a token with no entry can only be found by typing its
   * ticker exactly. The first four had been in `ERC20_TOKENS` since 20 Aug
   * with no name at all. */
  STETH: "Lido Staked Ether",
  WBETH: "Wrapped Beacon ETH",
  FDUSD: "First Digital USD",
  TUSD: "TrueUSD",
  PENDLE: "Pendle",
  GNO: "Gnosis",
  MORPHO: "Morpho",
  NEXO: "Nexo",
  CBETH: "Coinbase Wrapped Staked ETH",
  WLD: "Worldcoin",
  SPX: "SPX6900",
  RLUSD: "Ripple USD",

  /* The price-only tier — see `PRICED_ONLY_COINS` below. Named here for the
   * same reason the tokens above are: `quickSwitchMatches` searches names, and
   * a coin with no entry can only be found by typing its ticker exactly. */
  TRX: "TRON",
  HYPE: "Hyperliquid",
  TAO: "Bittensor",
  BFUSD: "BFUSD",
  WLFI: "World Liberty Financial",
  BNSOL: "Binance Staked SOL",
  BGB: "Bitget Token",
  ASTER: "Aster",
  ETC: "Ethereum Classic",
  JST: "JUST",
  WBNB: "Wrapped BNB",
  KAS: "Kaspa",
  VVV: "Venice Token",
  RENDER: "Render",
  DASH: "Dash",
  USDG: "Global Dollar",
  STABLE: "Stable",
  KCS: "KuCoin Shares",
  BDX: "Beldex",
  USDD: "USDD",
  AERO: "Aerodrome Finance",
  FLR: "Flare",
  PENGU: "Pudgy Penguins",
  RAY: "Raydium",
  VIRTUAL: "Virtual Protocol",
  TRUMP: "OFFICIAL TRUMP",
  AKE: "AKEDO",
  XDCE: "XinFin Network",
  BCHSV: "Bitcoin SV",
  FRAX: "Frax",
  LUNC: "Terra Classic",
  DCR: "Decred",
};

const PERIOD_OPTIONS = [
  { value: "hour", label: "1H", title: "1 Hour" },
  { value: "day", label: "1D", title: "1 Day" },
  { value: "week", label: "1W", title: "1 Week" },
  { value: "month", label: "1M", title: "1 Month" },
  { value: "year", label: "1Y", title: "1 Year" },
  { value: "all", label: "ALL", title: msg("period_all", "All Time") },
];

/* Backing off a provider that keeps refusing. Doubling from the refresh
 * interval, capped: at the default 30s that is 60s, 2m, 4m, then 5m. Five
 * minutes is short enough that a tab nobody is watching recovers on its own,
 * and the moment somebody *is* watching, the visibility handler refetches
 * without waiting for it. */
const FETCH_BACKOFF_STEPS = 5;
const FETCH_BACKOFF_MAX_MS = 300000; // 5 minutes

const REFRESH_INTERVAL_OPTIONS = [
  { value: 10000, label: msg("secs_10", "10 seconds") },
  { value: 30000, label: msg("secs_30", "30 seconds") },
  { value: 60000, label: msg("mins_1", "1 minute") },
  { value: 300000, label: msg("mins_5", "5 minutes") },
];

const DEFAULT_REFRESH_INTERVAL = 30000; // 30 seconds

const DECIMAL_PLACES_OPTIONS = [
  /* Just the count. Each label carried its own worked example — "2 decimals
   * (e.g. 1,234.56)" — and a closed dropdown 208px wide cut every one of them
   * off mid-number, so the one thing the example was there to show was the
   * part you could not see. The row's own caption is where an example
   * belongs. */
  { value: 2, label: msg("dec_2", "2 decimals") },
  { value: 4, label: msg("dec_4", "4 decimals") },
  { value: 6, label: msg("dec_6", "6 decimals") },
  { value: 8, label: msg("dec_8", "8 decimals") },
];

/* The examples carry no currency symbol, and that is not a style choice.
 *
 * `msg()` and `chrome.i18n.getMessage` both read `$1` as a placeholder, so
 * "e.g. $1,234.56" is a sample that the localisation layer eats — Chrome would
 * substitute or strip the `$1` and print "e.g. ,234.56". `tests/test-i18n.js`
 * caught it by comparing placeholders between English and each translation.
 * A bare number is also the more honest sample here: this setting governs the
 * separators, not the currency, which has a setting of its own. */
const SEPARATOR_FORMAT_OPTIONS = [
  /* Auto is first and is the default, and it means what the theme's Auto
   * means: follow the browser. `localeSeparatorFormat()` asks `Intl` what the
   * active locale actually writes rather than guessing from a country list —
   * a space-grouped locale (French, Russian) is a real third case and one of
   * the three styles offered here. Before this, every install outside the US
   * read `1,234.56` until somebody found this setting. */
  { value: "auto", label: msg("sep_auto", "Auto") },
  { value: "us", label: msg("sep_us", "US Format (1,234.56)") },
  { value: "eu", label: msg("sep_eu", "EU Format (1.234,56)") },
  { value: "space", label: msg("sep_space", "Space Format (1 234.56)") },
];

// Shown first in the currency dropdown for quick access
const POPULAR_CURRENCIES = ["USD", "EUR", "GBP", "TRY", "JPY"];

const CURRENCY_OPTIONS = [
  { value: "AED", label: "UAE Dirham (د.إ)", symbol: "د.إ" },
  { value: "ARS", label: "Argentine Peso ($)", symbol: "$" },
  { value: "AUD", label: "Australian Dollar (A$)", symbol: "A$" },
  { value: "BRL", label: "Brazilian Real (R$)", symbol: "R$" },
  { value: "CAD", label: "Canadian Dollar (C$)", symbol: "C$" },
  { value: "CHF", label: "Swiss Franc (CHF)", symbol: "CHF" },
  { value: "CLP", label: "Chilean Peso ($)", symbol: "$" },
  { value: "CNY", label: "Chinese Yuan (¥)", symbol: "¥" },
  { value: "COP", label: "Colombian Peso ($)", symbol: "$" },
  { value: "CZK", label: "Czech Koruna (Kč)", symbol: "Kč" },
  { value: "DKK", label: "Danish Krone (kr)", symbol: "kr" },
  { value: "EUR", label: "Euro (€)", symbol: "€" },
  { value: "GBP", label: "British Pound (£)", symbol: "£" },
  { value: "HKD", label: "Hong Kong Dollar (HK$)", symbol: "HK$" },
  { value: "HUF", label: "Hungarian Forint (Ft)", symbol: "Ft" },
  { value: "IDR", label: "Indonesian Rupiah (Rp)", symbol: "Rp" },
  { value: "ILS", label: "Israeli Shekel (₪)", symbol: "₪" },
  { value: "INR", label: "Indian Rupee (₹)", symbol: "₹" },
  { value: "JPY", label: "Japanese Yen (¥)", symbol: "¥" },
  { value: "KRW", label: "South Korean Won (₩)", symbol: "₩" },
  { value: "MXN", label: "Mexican Peso (MX$)", symbol: "MX$" },
  { value: "MYR", label: "Malaysian Ringgit (RM)", symbol: "RM" },
  { value: "NOK", label: "Norwegian Krone (kr)", symbol: "kr" },
  { value: "NZD", label: "New Zealand Dollar (NZ$)", symbol: "NZ$" },
  { value: "PEN", label: "Peruvian Sol (S/)", symbol: "S/" },
  { value: "PHP", label: "Philippine Peso (₱)", symbol: "₱" },
  { value: "PLN", label: "Polish Zloty (zł)", symbol: "zł" },
  { value: "RON", label: "Romanian Leu (lei)", symbol: "lei" },
  { value: "RUB", label: "Russian Ruble (₽)", symbol: "₽" },
  { value: "SAR", label: "Saudi Riyal (﷼)", symbol: "﷼" },
  { value: "SEK", label: "Swedish Krona (kr)", symbol: "kr" },
  { value: "SGD", label: "Singapore Dollar (S$)", symbol: "S$" },
  { value: "THB", label: "Thai Baht (฿)", symbol: "฿" },
  { value: "TRY", label: "Turkish Lira (₺)", symbol: "₺" },
  { value: "USD", label: "US Dollar ($)", symbol: "$" },
  { value: "VND", label: "Vietnamese Dong (₫)", symbol: "₫" },
  { value: "ZAR", label: "South African Rand (R)", symbol: "R" },
];

const DEFAULT_DECIMAL_PLACES = 2;
const DEFAULT_SEPARATOR_FORMAT = "auto";
const DEFAULT_CURRENCY = "USD";

// Helper to get currency symbol
const getCurrencySymbol = (currencyCode) => {
  /* The derivatives account's own currency (`PRACTICE_CURRENCY`). A venue
     prints USDT amounts bare and says the unit once, in the label, so there
     is no sign to put in front — and "$" would claim a dollar it is not. */
  if (currencyCode === "USDT") return "";
  const currency = CURRENCY_OPTIONS.find((c) => c.value === currencyCode);
  return currency ? currency.symbol : "$";
};

/* LOCALSTORAGE */
const STORAGE_KEY = "crypto_chart_coin_options";
const THEME_STORAGE_KEY = "crypto_chart_theme";
/* Up and down as green/red ("classic") or blue/orange ("cvd", for colour-
   blind readers) — see DIRECTION_PALETTE_COLORS in theme.js. */
const DIRECTION_PALETTE_KEY = "crypto_chart_direction_palette";
const DIRECTION_PALETTES = ["classic", "cvd"];
/* The language keys live in `src/i18n.js`, not here, and that is a load-order
 * fact rather than a preference: this file builds translated option labels
 * while it runs, so `i18n.js` has to have been read first — and it cannot
 * depend on a constant defined in a file that comes after it. */
const REFRESH_INTERVAL_STORAGE_KEY = "crypto_chart_refresh_interval";
const DECIMAL_PLACES_STORAGE_KEY = "crypto_chart_decimal_places";
const SEPARATOR_FORMAT_STORAGE_KEY = "crypto_chart_separator_format";
const CHART_COLOR_STORAGE_KEY = "crypto_chart_chart_color"; // green/red area fill on/off
const DEFAULT_CHART_COLOR = true;
const CURRENCY_STORAGE_KEY = "crypto_chart_currency";
const TICKER_STORAGE_KEY = "crypto_chart_ticker_enabled";
const TICKER_FORMAT_STORAGE_KEY = "crypto_chart_ticker_format";
const NEWS_TICKER_STORAGE_KEY = "crypto_chart_news_ticker_enabled";
const NEWS_CACHE_KEY = "crypto_chart_news_cache";
const NEWS_REFRESH_MS = 600000; // 10 minutes
/* Whether the news panel's one-time ask for the six newsrooms has been seen
 * and put away. Asked once, in the panel, on the first open; after "Not now"
 * the panel carries one quiet line pointing at Settings → Permissions, where
 * every permission can be granted and taken back with its reasons beside it.
 * A person who has said no should not be asked on every open. */
const NEWS_ASK_SEEN_KEY = "crypto_chart_news_ask_seen";
// News sources — no-auth + CORS-enabled (verified). Most other crypto news
// APIs (CryptoCompare, CoinGecko, Messari, CryptoPanic) require keys, and RSS
// feeds don't send CORS headers, so a page cannot read one without host
// access. What is reachable with no permission at all is Hacker News; the six
// newsrooms in `NEWS_SOURCES` below are opt-in. Blockchair's live news feed
// was the third and has been dropped — the note in `NEWS_SOURCES` says why.

/* What the headline row is allowed to carry.
 *
 * The feed is general crypto news, so on a tab kept open for four coins most
 * of what scrolls past is about something else. The filter narrows it to
 * stories that actually name a coin you are watching — the same test the
 * move-headlines line already applies, so the two cannot disagree about what
 * "about BTC" means.
 *
 * `all` stays the default. The narrower settings can empty the row for hours
 * at a time (a quiet week for your four coins is a quiet week), and a feature
 * that silently shows nothing is a worse first impression than one that shows
 * too much — so choosing to narrow it is yours, and the setting says what it
 * costs.
 */
const NEWS_FILTER_KEY = "crypto_chart_news_filter";
const DEFAULT_NEWS_FILTER = "all";
const NEWS_FILTER_OPTIONS = [
  { value: "all", label: msg("news_scope_all", "Everything") },
  { value: "coins", label: msg("news_scope_mine", "My coins") },
  { value: "portfolio", label: msg("news_scope_held", "What I hold") },
];
const MAX_NEWS_ITEMS = 50;
/* **Headlines kept to read later** (27 Sep 2026) — the news panel's
 * bookmark. A feed is a week long and the archive a month; a story somebody
 * meant to come back to was gone by the time they did. What a person chose to
 * keep, so it is theirs: never in `EPHEMERAL_CACHE_KEYS`, in the settings
 * backup like every other key, and only an https link is kept, because the
 * row opens it. */
const NEWS_SAVED_KEY = "crypto_chart_news_saved";
/* **A contract's notice goes by itself** (27 Sep 2026, *"bu likidasyon
 * uyarıları belli zaman sonra kendiliğinden animasyonla silinsin"*): ten
 * seconds *on screen* — the clock stops on a hidden tab and under the pointer
 * or the focus — then it leaves over TOAST_LEAVE_MS. The event itself is in
 * the account's record and, with the alarm on, in a Chrome notification;
 * the toast is only the moment. */
const POSITION_TOAST_MS = 10000;
const TOAST_LEAVE_MS = 320;
const NEWS_SAVED_MAX = 100;

/* **Drawings on the chart** (the chart plan's Phase 3, chart-tools.js): lines,
 * boxes and notes somebody put there, per coin, anchored in time and price —
 * never in pixels, so each is where it was on every range, zoom and refresh.
 * Typed by a person, so never ephemeral and in the backup like the portfolio.
 * Each carries the currency it was drawn in and is shown only in that one: a
 * line at 80,000 is a dollar price, not a euro one. */
const DRAWINGS_KEY = "crypto_chart_drawings";
const DRAWING_KINDS = ["hline", "trend", "ray", "box", "note"];
const DRAWINGS_MAX_PER_COIN = 40;
const DRAWING_NOTE_MAX = 80;

/* ── "What happened here?" — headlines at the moments the price moved ──────
 *
 * Blockchair's news endpoint takes a time filter and the archive goes back
 * years, which is the whole reason this is affordable: one request answers
 * "what was being written the day this happened", with no paging (`offset` is
 * capped at 10,000, and the time filter makes paging unnecessary).
 * Re-checked against the live endpoint on 20 Aug 2026 for 2021, 2022 and 2024.
 *
 * Off by default, like every other addition — the plain chart is what ships.
 * And nothing is fetched until someone points at a mark: the marks themselves
 * are worked out locally by `findUnusualMoves`, so a chart nobody reads costs
 * no request at all.
 *
 * **The wording is part of the feature, not decoration.** Headlines from the
 * day of a move are what was *being said*, not the cause — post hoc is the
 * whole trap here. Anything this feature renders says "around this move" and
 * never "because of", and the caption under the card says so in as many words.
 */
const MOVE_NEWS_KEY = "crypto_chart_move_news";
const DEFAULT_MOVE_NEWS = false;
/* The window's cache lives in `api.js` beside the other three, because that
 * file loads first and hydrates its caches at load — a key declared here would
 * still be in its temporal dead zone when the hydration runs. */
/* How far out of the ordinary a step has to be before it earns a mark, and how
 * many marks a chart may carry. 2.5σ marks roughly the top 1% of steps, which
 * on a 300-point series is about three of them; six is the cap so a violent
 * window does not turn the chart into a row of triangles. */
const MOVE_NEWS_SIGMA = 2.5;
const MOVE_NEWS_MAX_MARKS = 6;
/* **How wide "around this move" is when the question is put to the feed
 * already in memory rather than to an archive.**
 *
 * The archive is asked day by day and pads a flat ±24h — right for a mark on a
 * year chart, absurd for one on an hour chart, where a story from yesterday
 * teatime is not what happened during a spike at 09:14. The feed carries exact
 * publication times, so it is asked exactly: the move's own duration, floored
 * at three hours because below that a feed of a few dozen stories has no
 * resolution to offer, and capped at a day because past that the archive's own
 * window is the honest one. */
const MOVE_NEWS_LOCAL_MIN_PAD = 3 * 3600 * 1000;
const MOVE_NEWS_LOCAL_MAX_PAD = 24 * 3600 * 1000;
/* How many of each group the card draws: what named this coin, and what was
 * merely published in the same window. Three and two, because the second group
 * is context and a card where the context outnumbers the subject reads as a
 * feed rather than as an answer. */
const MOVE_CARD_ABOUT_MAX = 3;
const MOVE_CARD_OTHER_MAX = 2;
// Hacker News via Algolia — the only other CORS-enabled, no-key news source
// found (X/Twitter, Reddit, Nitter, Stacker News all block extension origins).
// Algolia ANDs multi-word queries, so each term is queried separately.
const HN_NEWS_API = "https://hn.algolia.com/api/v1/search";
const HN_NEWS_TERMS = ["bitcoin", "ethereum", "crypto"];
const HN_NEWS_MIN_POINTS = 30; // well-upvoted stories only
const HN_NEWS_MAX_AGE_S = 7 * 86400; // past week
const HN_NEWS_MAX_ITEMS = 8;
/* The "what happened here?" archive asks Hacker News about a window rather than
 * about the past week. A wide pool because the ranking is done here (by points,
 * after `CRYPTO_TERMS_RE` drops what the loose OR match dragged in), not by
 * Algolia; four survive onto a card that shows four. */
const MOVE_NEWS_HN_POOL = 40;
const MOVE_NEWS_HN_MAX = 6;

/* ── The newsroom sources, and why they need asking for ───────────────────
 *
 * Measured on 21 August 2026, and the measurement is the whole reason this
 * exists. The two keyless feeds this extension had were not enough:
 *
 *   - **Blockchair** carried **7 distinct outlets** across a 580-article
 *     sample, 35% of them from one Turkish aggregator, no wire service among
 *     them — and it had published **nothing for 101 hours**. A news row that
 *     silently shows four-day-old headlines is worse than no news row. It has
 *     since been dropped from this list entirely; see the note in
 *     `NEWS_SOURCES` for what a second measurement found and what it cost.
 *   - **Hacker News** is reliable and is discussion, not reporting. When
 *     Blockchair left it was briefly the whole of what a fresh install showed,
 *     which is what sent us looking for the three CORS-enabled newsrooms below.
 *
 * Everything actually worth reading — Cointelegraph, Decrypt, CryptoSlate,
 * Bitcoin Magazine, CoinJournal, BBC — answers a server happily and sends
 * **no `Access-Control-Allow-Origin` header**, so a page cannot read one.
 * GDELT, the only global index that is both keyless and CORS-enabled, answered
 * **3 of 20** requests at 8-second spacing and **0 of 7** at 100 seconds, with
 * 10–21s latency when it did. It is not a source you can build on. Everything
 * keyed (CryptoCompare, CoinDesk's data API, CoinGecko, Messari, CryptoPanic)
 * is a 401 and a different privacy story.
 *
 * So the only route to real reporting is host access — and it is **optional**,
 * requested from a button in the news panel and never at install. Chrome shows
 * no install-time warning for `optional_host_permissions`, so "asks for
 * nothing" is still true of the extension you install; what changes is only
 * what a person has explicitly turned on. `tests/test-invariants.js` §1
 * enforces both halves of that.
 *
 * `cryptoOnly` marks a general newsroom: BBC Business is here because it is
 * the most credible feed on the list and it does cover this beat, but most of
 * what it publishes is not about crypto at all, so its items have to name the
 * subject before they earn a place in a crypto news panel.
 */
const NEWS_SOURCE_ORIGINS = {
  cointelegraph: "https://cointelegraph.com/*",
  decrypt: "https://decrypt.co/*",
  cryptoslate: "https://cryptoslate.com/*",
  bitcoinmagazine: "https://bitcoinmagazine.com/*",
  coinjournal: "https://coinjournal.net/*",
  bbc: "https://feeds.bbci.co.uk/*",
  coindesk: "https://www.coindesk.com/*",
  theblock: "https://www.theblock.co/*",
};

const NEWS_SOURCES = [
  /* Blockchair used to be here, and is not any more.
   *
   * It was the one source that needed no permission, which made it the default
   * and made it hard to remove. Measured on 21 Aug 2026: its newest item was
   * **five days old**, and **7 of its 10 stories were not in English** — four
   * Turkish, one Russian, one Dutch, one French — from outlets (`coin-turk`,
   * `bitcoinsistemi`, `kriptofoni`, `bitcoinhaber`, `coinspot.io`, `newsbit.nl`,
   * `cointribune`) that are aggregators rather than newsrooms. That is exactly
   * the staleness this panel was built to expose, shipping as the default.
   *
   * The cost of removing it is real and was accepted deliberately: a fresh
   * install now shows Hacker News alone until someone grants the newsrooms.
   * A thin panel that is honest beats a full one that is not.
   *
   * It stays in `api.js` for `fetchNewsAround` — the "what happened here?"
   * card's archive — because no RSS feed can be asked about last March, and
   * for ETH/LTC/DOGE/BCH/ZEC address balances, which have nothing to do with
   * news. Both of those apply the same promo filter this list does.
   */
  /* Always available: keyless, and **`Access-Control-Allow-Origin: *`**, which
   * is what makes them readable with no permission at all. Verified 21 Aug
   * 2026 by sending a `chrome-extension://` Origin and reading the header
   * back; all three answered `*`.
   *
   * Finding these mattered more than it looks. Dropping Blockchair left a
   * fresh install on Hacker News alone — discussion, not reporting. These are
   * three financial newsrooms, dated, and they cost nothing to add. Yields on
   * the crypto beat in one poll, measured the same day: Yahoo 11 of 50, CNBC
   * 1 of 30, MarketWatch 1 of 10 — 13 of 90, which is why a crypto desk was
   * still worth looking for afterwards. Bitcoin.com, below, is the one that
   * was found.
   *
   * All three are `cryptoOnly` for the reason BBC Business is: they are
   * finance desks, not crypto desks, and an unfiltered markets feed in a
   * crypto news panel reads as a bug.
   *
   * **Yahoo Finance was removed on 29 Sep 2026.** Its `news/rssindex` stopped
   * being regenerated at the origin on 24 Sep 12:21 UTC — `Last-Modified`
   * said so with a cache-busting query too, so it was not a stale CDN copy —
   * and `rss/topstories` and `news/rss` are the same frozen document. The
   * live feed, `feeds.finance.yahoo.com/rss/2.0/headline?s=BTC-USD`, is
   * rebuilt every few minutes but answers **403** to any request carrying an
   * extension's `Origin` (200 without one) and sends no CORS header, so no
   * permission would reach it; it also carries press-release wire items. */
  { id: "hn", name: "Hacker News", kind: "hn", optional: false },
  /* **An exchange's notices about coins — off until switched on** (29 Sep
   * 2026). Bybit's public announcements (`v5/announcements/index`, on a host
   * this extension already reads, and echoing an extension Origin) are mostly
   * the exchange's own business: of 40 read that day, 16 listings (most of
   * them stock perpetuals and "Token Splash" giveaways), 7 exchange news and
   * 5 reward campaigns. The part that is news about a coin — a delisting, a
   * network upgrade that pauses deposits — is kept (`parseBybitNotices`) and
   * the rest never reaches the panel. `optIn`: not asked for, and not shown,
   * until the chip is pressed; the choice is stored both ways. */
  {
    id: "bybit-notices",
    name: "Bybit notices",
    kind: "bybit",
    url: "https://api.bybit.com/v5/announcements/index?locale=en-US",
    optional: false,
    optIn: true,
  },
  /* **CNBC's crypto section, not its finance one** (29 Sep 2026). The same
   * host and the same `combinedcms` feed, section 106826328 — found on
   * cnbc.com/cryptoworld's own page data, and answering
   * `Access-Control-Allow-Origin: *` like the rest. Measured that day: 30
   * items, 24 matching the beat's words and the other six about
   * tokenization, the Clarity Act and prediction markets, so the section is
   * the beat and `cryptoOnly` is off for the reason Bitcoin.com's is. The
   * finance section it replaces carried 4 crypto stories in 60 over two
   * samples. Section 106985211, which the same page names, is a video
   * archive last updated five days before. */
  {
    id: "cnbc",
    name: "CNBC",
    kind: "rss",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=106826328",
    optional: false,
    cryptoOnly: false,
  },
  {
    id: "marketwatch",
    name: "MarketWatch",
    kind: "rss",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    optional: false,
    cryptoOnly: true,
  },
  /* The fourth always-on source, and the first of them that is a crypto desk.
   *
   * It answers `Access-Control-Allow-Origin: *` — measured 28 Aug 2026 by
   * sending a `chrome-extension://` Origin — which is the whole reason it is
   * here rather than in the opt-in list below. A sweep of sixteen candidates
   * that day found exactly one: The Block, CoinDesk, Protos, BeInCrypto,
   * Cryptonews, U.Today, Coinpedia, The Defiant and Bankless all answer 200
   * and send no CORS header, Blockworks and Kaiko redirect to feeds that send
   * none either, and CryptoBriefing, CoinGape and AmbCrypto answer 403 to an
   * extension Origin outright. Its own `wp-json` is a 403 as well, so this is
   * the RSS for the reason CryptoSlate's is.
   *
   * What it fixes is the fresh install. The three sources above are finance
   * desks filtered down to whatever they happen to say about crypto — 13 of 90
   * items in one poll — so someone who has granted nothing is reading a
   * discussion board and the crypto column of the business pages. This is a
   * newsroom on the beat: 10 of 10 items in one poll, roughly one story every
   * 1.2 hours, and every one of them carries a `<description>`, so the row's
   * summary costs nothing extra.
   *
   * **Not `cryptoOnly`**, unlike the three above it, because the whole feed is
   * already the beat; narrowing it would drop its regulation and security
   * coverage on a keyword test it has no reason to pass.
   *
   * It segregates its advertising and `isPromoNews` had to be taught the word.
   * Measured on the same poll: 1 of the 10 was a paid post, filed three ways
   * at once — a `Branded Spotlight` category, a `/branded-spotlight/` path and
   * `Media` as the byline — and it slipped through **all three** of the
   * existing signals, since none of them knew that word. The path and category
   * patterns above now carry it. This is the check the house rule asks for
   * before a source is added, and this time it came back positive. */
  {
    id: "bitcoincom",
    name: "Bitcoin.com",
    kind: "rss",
    url: "https://news.bitcoin.com/feed/",
    optional: false,
  },
  /* The fifth always-on source and the second crypto desk (21 Sep 2026).
   *
   * Found by sweeping thirty-six candidates the 28 Aug sweep had not tried,
   * with a `chrome-extension://` Origin: only two sent
   * `Access-Control-Allow-Origin: *` — this one, and the New York Times'
   * business feed, which carried 0 crypto stories in 49 and was left. The
   * RSS is 225 KB because it carries every post body; the wp-json with
   * `_fields` is 11 KB for the same twenty posts and sends the header too, so
   * this is the wp-json for the reason Bitcoin Magazine's is. Measured on the
   * day: 36 items in the RSS window, the newest 25 minutes old, a story about
   * every 40 minutes, every one with an excerpt.
   *
   * It segregates its advertising, by category and by byline: `Press
   * Release` (id 220, 3,897 posts) and `Chainwire` as `dc:creator`. The
   * category is excluded server-side, which is the strongest form available
   * — never fetched, never parsed — and 2 of the 36 items that day were it.
   * Not `cryptoOnly`: the whole feed is the beat. Much of it is analysis
   * ("Is $90K next?"), which the tone mark on each row counts as words and
   * never as a claim. */
  {
    id: "cryptopotato",
    name: "CryptoPotato",
    kind: "wp",
    url: "https://cryptopotato.com/wp-json/wp/v2/posts?per_page=20&categories_exclude=220&_fields=title,link,date_gmt,excerpt",
    optional: false,
  },
  // Opt-in: real newsrooms, reachable only with host access
  {
    id: "cointelegraph",
    name: "Cointelegraph",
    kind: "rss",
    url: "https://cointelegraph.com/rss",
    optional: true,
  },
  {
    id: "decrypt",
    name: "Decrypt",
    kind: "rss",
    url: "https://decrypt.co/feed",
    optional: true,
  },
  {
    id: "cryptoslate",
    name: "CryptoSlate",
    kind: "rss",
    // Its RSS rather than its wp-json: the WAF answers 403 to the `_fields`
    // parameter, and without `_fields` one poll is 542 KB of post bodies
    url: "https://cryptoslate.com/feed/",
    optional: true,
  },
  {
    id: "bitcoinmagazine",
    name: "Bitcoin Magazine",
    kind: "wp",
    /* `_fields` is not a nicety: the same twenty posts are 186 KB with the
     * bodies and 4 KB without them, and nothing here renders a body.
     *
     * `excerpt` is asked for and the body still is not: measured 23 Aug 2026,
     * the same twenty posts are 4.5 KB without it and 9.2 KB with — twice the
     * bytes, and still a twentieth of the unfiltered response. It buys the
     * summary line on every row, and a second signal for `isPromoNews`.
     *
     * `categories_exclude=39` is this outlet's own `press-releases` category.
     * Filtering server-side is the strongest form of this available: the
     * advertising is never fetched, never parsed, and never has to be
     * recognised by a rule of ours. It cost nothing — no extra request, no
     * extra bytes. (39 was empty the week this was added; the category exists
     * and will not stay empty.) */
    url: "https://bitcoinmagazine.com/wp-json/wp/v2/posts?per_page=20&categories_exclude=39&_fields=title,link,date_gmt,excerpt",
    optional: true,
  },
  {
    id: "coinjournal",
    name: "CoinJournal",
    kind: "wp",
    /* `categories_exclude=40` is CoinJournal's "Press Releases". This is the
     * source that made the case: 5 of its 20 posts were advertising — three
     * consecutive MEXC press releases, a KuCoin piece and a prop-firm ad.
     * Verified against the live endpoint: with the exclusion, twenty posts
     * still come back and none of the three MEXC items is among them. */
    url: "https://coinjournal.net/wp-json/wp/v2/posts?per_page=20&categories_exclude=40&_fields=title,link,date_gmt,excerpt",
    optional: true,
  },
  {
    id: "bbc",
    name: "BBC Business",
    kind: "rss",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    optional: true,
    cryptoOnly: true,
  },
  /* **CoinDesk and The Block** (29 Sep 2026): the two largest crypto
   * newsrooms, neither sending a CORS header (the 28 Aug and 29 Sep sweeps),
   * so behind the same optional host permission as the six above. Measured
   * that day with an extension Origin: both answer 200 (unlike Yahoo's live
   * feed, which refuses one), CoinDesk 25 items in 29 KB, The Block 20 in
   * 30 KB, both updated within the hour, every item with a summary and a
   * staff byline. Neither feed carried a paid item that day; CoinDesk files
   * its paid posts under `/sponsored-content/` and `/press-release/`, which
   * `NEWS_PROMO_PATH_RE` already refuses, and The Block's feed is its
   * `/news/` path alone. Crypto desks, so not `cryptoOnly`. */
  {
    id: "coindesk",
    name: "CoinDesk",
    kind: "rss",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss",
    optional: true,
  },
  {
    id: "theblock",
    name: "The Block",
    kind: "rss",
    url: "https://www.theblock.co/rss.xml",
    optional: true,
  },
];

/* What counts as "about this beat" for a general newsroom. Deliberately short
 * and deliberately not a coin list: `newsForCoins` already answers "about BTC",
 * and this answers the cruder question of whether a business story is about
 * crypto at all, so that a BBC piece on cruise-ship air conditioning does not
 * arrive in a crypto news panel. */
const CRYPTO_TERMS_RE =
  /\b(crypto\w*|bitcoin|ethereum|blockchain|stablecoin|defi|altcoin|binance|coinbase|ripple|solana|dogecoin|tether|web3|nft|digital asset|token(s|ised|ized)?)\b/i;

// A source that has published nothing for this long is called out as quiet
// rather than left looking live — the failure this whole feature was built for
const NEWS_STALE_MS = 24 * 3600 * 1000;

const NEWS_PANEL_KEY = "crypto_chart_news_sources"; // which sources are shown
const NEWS_PANEL_FILTER_KEY = "crypto_chart_news_panel_filter"; // coin scope
/* ADVERTISING MUST NOT REACH THE PANEL — and a title regex cannot do it alone.
 *
 * Three filters, weakest last, because that is the order of how much each one
 * actually knows:
 *
 *   1. the publisher's own label (`categories_exclude` on the WordPress
 *      sources, above) — it never arrives;
 *   2. the URL path and the byline (here) — the outlet has already sorted its
 *      promo into its own section, so the item says what it is;
 *   3. `NEWS_SPAM_RE` (here) — a guess about wording, and the only one of the
 *      three that can be wrong in both directions.
 *
 * The order is the finding. Measured against the live feeds on 21 Aug 2026,
 * `NEWS_SPAM_RE` caught **0 of the 5** advertisements in one CoinJournal
 * response — three MEXC press releases, a KuCoin puff piece and a prop-firm
 * ad. "MEXC's August 2026 Proof-of-Reserves Confirms User Assets Fully Backed"
 * is a headline; there is no wording rule that separates it from reporting.
 * Widening the regex until it caught them would have started eating real
 * stories, because real stories also say "announces". So the regex stopped
 * being the mechanism and became the net under the net.
 *
 * This is the one place in the codebase where **over-filtering is the
 * acceptable failure**. Everywhere else a false negative is the cheap one; here
 * a single press release on screen is the thing that must not happen, so a
 * borderline pattern goes in rather than staying out.
 */

/* Promo lives in its own path on every outlet that has any. Measured:
 * CryptoSlate serves `cryptoslate.com/press-releases/<slug>` (and `/sponsored/`
 * answers 200) while its editorial sits at the bare `cryptoslate.com/<slug>`;
 * Cointelegraph has `/press-releases`; Decrypt has no such section at all —
 * `/sponsored`, `/partner-content` and `/press-release` are all 404 there.
 * `advertorial` and `paid-content` are not measured on these six; they are the
 * industry's other names for the same thing and cost nothing to refuse.
 * Anchored on both sides by `/` so a slug that merely contains the word — a
 * story about a company that "partners with" someone — is not a match. */
const NEWS_PROMO_PATH_RE =
  /\/(press-releases?|sponsored|sponsored-content|partner-content|advertorial|paid-content|paid-post|branded-spotlight|branded-content)\//i;

/* The byline gives it away too, and earlier than the path does: press releases
 * are distributed by wire services, and the wire signs them. CryptoSlate's
 * promo section is written by `chainwire` and `cs-press-release` — measured,
 * 12 of 12 items on its press-releases page. Compared with the byline stripped
 * to letters, so "Chainwire", "chainwire" and "CS Press Release" are one
 * pattern rather than three. */
const NEWS_WIRE_RE =
  /(chainwire|globenewswire|businesswire|accesswire|prnewswire|pressrelease|sponsored)/i;

/* The outlet's own filing, in two more places it does it.
 *
 * Measured 23 Aug 2026 on CryptoSlate's live feed, where the newest item was
 * `category: Guest Post` with a summary opening "The following is a guest post
 * and opinion from Vincent Maliepaard, VP of Marketing at Sentora." Neither
 * signal existed here: the title ("The next phase of tokenization is utility")
 * is unremarkable, and the byline is a person rather than a wire, so the
 * article was reaching the panel. **Both of these arrived in bytes already
 * being downloaded** — reading the summary onto the row is what exposed them.
 *
 * This is the same principle the path and the byline rules rest on: an outlet
 * marks its own promotional material, and reading that mark beats guessing at
 * the wording. */
const NEWS_PROMO_CATEGORY_RE =
  /^(guest ?post|press ?release|sponsored|advertorial|partner ?content|paid ?(post|content)|branded ?(spotlight|content))/i;

/* The disclosure a guest post opens with. Anchored to the start, because a
 * story *about* press releases is not one. */
const NEWS_PROMO_LEAD_RE =
  /^(the following is|this is) a (guest post|sponsored|paid|press release)|^(sponsored|press release|guest post)[\s:—-]/i;

// Low-signal SEO/promo headlines — the last of the three, and the weakest
const NEWS_SPAM_RE =
  /price (prediction|analysis)|presale|pre-sale|best (coins?|cryptos?) to buy|casino|airdrop|giveaway|sponsored/i;
const AUTO_ROTATE_STORAGE_KEY = "crypto_chart_auto_rotate";
const AUTO_ROTATE_INTERVAL_STORAGE_KEY = "crypto_chart_auto_rotate_interval";
const DEFAULT_AUTO_ROTATE = false;
const DEFAULT_AUTO_ROTATE_INTERVAL = 30000;
const AUTO_ROTATE_OPTIONS = [
  { value: 10000, label: msg("every_10s", "Every 10 seconds") },
  { value: 30000, label: msg("every_30s", "Every 30 seconds") },
  { value: 60000, label: msg("every_1m", "Every minute") },
  { value: 300000, label: msg("every_5m", "Every 5 minutes") },
  { value: 900000, label: msg("every_15m", "Every 15 minutes") },
];
const RATE_PROMPT_DISMISSED_KEY = "crypto_chart_rate_prompt_dismissed";
/* The rating ask: **once**, a day after first use, and never again.
 *
 * A day rather than two because a new-tab extension is used many times a day —
 * by the second day somebody either likes it or has uninstalled it, and asking
 * later mostly means asking the people who already stopped noticing. What has
 * to stay true is the *once*: both surfaces read `RATE_PROMPT_SHOWN_KEY` and
 * both stamp it, so whichever is reached first is the only time this extension
 * asks. `tests/test-polish-render.js` §15 holds that to exactly one ask.
 *
 * Never at install, which is the worst possible moment — the bar in Settings
 * used to appear the first time it was ever opened. And dismissing it does not
 * take the option away: Preferences carries a permanent, quiet "Rate PriceTab"
 * link, because asking less is only honest if the door stays open. */
const FIRST_USE_KEY = "crypto_chart_first_use";
const RATE_PROMPT_SHOWN_KEY = "crypto_chart_rate_prompt_shown";
const RATE_PROMPT_DELAY_MS = 24 * 60 * 60 * 1000;
/* PRICE PROVIDERS
 * Coinbase serves everything by default. Coins it doesn't list are routed
 * to Kraken, whose public OHLC endpoint is keyless and CORS-enabled and
 * covers every period we offer (its 15-day candles even reach further back
 * than Coinbase for the ALL range).
 *
 * Kraken is always queried in USD and converted with the exchange rate the
 * ticker already fetches: it only quotes a couple of fiats directly, and one
 * code path beats juggling per-pair currency support.
 */
const COIN_PROVIDERS = {
  XMR: "kraken", // delisted from Coinbase — all three endpoints 404
  PI: "kraken", // never listed by Coinbase; Kraken quotes PIUSD (17 Aug 2026)
  // Swept 20 Aug 2026: Coinbase 404s on these three and Kraken answers
  USDE: "kraken",
  XAUT: "kraken",
  OKB: "kraken",
  /* MNT is the one that is not a 404, and is worse than one. Coinbase answers
   * MNT-USD with $0.00028 where Mantle trades near a dollar — the ticker is
   * some other asset. A wrong price is not a degraded chart, it is a lie with
   * a number in it, so this is routed away from Coinbase permanently rather
   * than left to the runtime failover, which only ever triggers on a failure
   * and this does not fail. */
  MNT: "kraken",
};
const providerFor = (coin) => COIN_PROVIDERS[coin] || "coinbase";

/* The coins Kraken cannot serve, so there is nowhere to fall back to for
 * them. Re-swept 20 Aug 2026 after fifteen coins were added: Kraken answers
 * for all but WETH, which Coinbase does quote — so the pair below is a real
 * gap only if Coinbase stops. Re-run the sweep before trusting this — a
 * listing is a fact
 * about someone else's exchange and it changes without telling us. */
const KRAKEN_MISSING = ["MATIC", "MKR", "RNDR", "ILV", "WETH"];

/* Coinbase can stop answering for one coin without anything being wrong here.
 * A delisting 404s. A burst of requests gets throttled at the edge. A region
 * is served a block page. The first arrives as an empty payload; the other two
 * arrive in the browser as *a CORS error*, because an error handed back by an
 * edge server carries no `Access-Control-Allow-Origin` — which is why the
 * console says the header is missing when the real answer is "not today".
 *
 * `COIN_PROVIDERS` covers the permanent case. This covers the rest: the first
 * failure sends that coin to Kraken for the rest of the tab, and the tab is
 * the right lifetime — a bad ten minutes must not reroute a coin for good, and
 * every new tab tries Coinbase again. In memory only; nothing is stored.
 */
const failedProviders = new Set();
const effectiveProvider = (coin) =>
  failedProviders.has(coin) ? "kraken" : providerFor(coin);

/* Was this a failure worth failing over for? Not if we cancelled the request
 * ourselves — switching coin or range aborts whatever is in flight, and
 * treating that as "Coinbase is down for BTC" would reroute the whole list
 * within a few keystrokes. */
const noteProviderFailure = (coin, error) => {
  if (error && error.name === "AbortError") return false;
  if (providerFor(coin) === "kraken") return false; // already there
  if (KRAKEN_MISSING.includes(coin)) return false;
  failedProviders.add(coin);
  return true;
};

/* WHICH PURCHASE A SALE CONSUMES
 *
 * Every tax authority lets you pick, and they do not agree on which they
 * allow — so this is a reporting method, not a computed liability, and it is
 * the one part of `TODO.md`'s declined "country-specific tax computation" that
 * can be offered honestly.
 *
 * **It cannot apply backwards, and the code must not pretend otherwise.** A
 * sale already recorded wrote down the lots it consumed and the basis it took
 * (`sale.basis`, `sale.matched`) at the moment it happened; those lots are
 * gone afterwards and cannot be un-consumed. So the method is stamped on each
 * disposal as it is recorded, and the report prints it per line. Changing the
 * setting changes what the *next* sale eats, never what a past one ate.
 *
 * What it does change immediately is which lots are assumed gone when a
 * holding's amount is reduced by hand — `heldLots`. That is a live derivation
 * rather than a record: nobody said which coins left, so it is an assumption
 * either way, and it should be the assumption you have chosen.
 */
const COST_METHODS = [
  {
    value: "fifo",
    label: "FIFO",
    title: msg("method_fifo", "First in, first out"),
    note: msg(
      "method_fifo_note",
      "The oldest purchase is sold first. The default nearly everywhere, and the only method some countries accept.",
    ),
  },
  {
    value: "lifo",
    label: "LIFO",
    title: msg("method_lifo", "Last in, first out"),
    note: msg(
      "method_lifo_note",
      "The newest purchase is sold first. Allowed in some places and not others — check yours.",
    ),
  },
  {
    value: "hifo",
    label: "HIFO",
    title: msg("method_hifo", "Highest in, first out"),
    note: msg(
      "method_hifo_note",
      "The most expensive purchase is sold first, which reports the smallest gain. Not accepted everywhere.",
    ),
  },
];
const DEFAULT_COST_METHOD = "fifo";
const COST_METHOD_KEY = "crypto_chart_cost_method";

const KRAKEN_API = "https://api.kraken.com/0/public/";
// Kraken returns at most 720 candles; the interval per period is chosen so
// one request covers the whole window, and the tail is sliced to size.
const KRAKEN_PERIODS = {
  hour: { interval: 1, points: 60 }, // 60 × 1m = 1h
  day: { interval: 15, points: 96 }, // 96 × 15m = 24h
  week: { interval: 60, points: 168 }, // 168 × 1h = 7d
  month: { interval: 240, points: 180 }, // 180 × 4h = 30d
  year: { interval: 1440, points: 365 }, // 365 × 1d = 1y
  all: { interval: 21600, points: 720 }, // 15d candles, as far back as it goes
};

/* OHLC candles for the crosshair readout and the candlestick chart.
 * Coinbase Exchange serves 350 candles per request regardless of what we
 * ask for, so each period declares both the granularity and how many of
 * those candles actually belong to it — granularity × points is exactly
 * the period's window, and the tail is sliced to size. Without the slice a
 * 1H chart drew ~6 hours of one-minute candles.
 *
 * ALL spans years, so no granularity covers it: those charts keep the
 * price-only readout and the line chart instead.
 */
const OHLC_GRANULARITY = {
  hour: { granularity: 60, points: 60 }, // 60 × 1m = 1h
  day: { granularity: 900, points: 96 }, // 96 × 15m = 24h
  week: { granularity: 3600, points: 168 }, // 168 × 1h = 7d
  month: { granularity: 21600, points: 120 }, // 120 × 6h = 30d
  // A full year needs 365 daily candles but Coinbase caps the response at
  // ~350, so this is as close as the provider goes
  year: { granularity: 86400, points: 350 },
};
// Coinbase Exchange only quotes a handful of fiat currencies; everything
// else degrades to the price-only crosshair rather than guessing.
const OHLC_CURRENCIES = ["USD", "EUR", "GBP"];
const OHLC_CACHE_TTL = 300000; // 5 min — candles are not tick data
// Chart detail toggle: off means the crosshair stays price + date and no
// candle request is ever made from hovering. Price targets still check
// candles when one is armed — that lookback is the feature, not a detail.
const OHLC_ENABLED_KEY = "crypto_chart_ohlc_enabled";
const DEFAULT_OHLC_ENABLED = true;
// Candlestick mode. Where candles exist they are the *only* request the
// chart needs — the line series is derived from their closes — so this is
// cheaper than the line chart, not more expensive. Ranges without candles
// (Coinbase's ALL, currencies it doesn't quote) fall back to the line.
const CHART_TYPE_KEY = "crypto_chart_chart_type";
const DEFAULT_CHART_TYPE = "line";
// Volume band under the chart. Rides the candles that are already fetched,
// so it costs nothing extra — but it is a busier look, hence the switch.
const VOLUME_BARS_KEY = "crypto_chart_volume_bars";
const DEFAULT_VOLUME_BARS = true;
// Stats line under the price (range high/low, market cap, 24h volume).
// Every figure is already fetched for something else.
const MARKET_STATS_KEY = "crypto_chart_market_stats";
const DEFAULT_MARKET_STATS = true;

/* Chart grid — price levels across, time divisions down, drawn from the
 * range actually on screen rather than at a fixed pixel pitch. Off by
 * default like every other addition: the plain chart is what ships. */
// "month" -> "1M", for anywhere a stored range has to be named back to a user
const periodLabel = (value) => {
  const found = PERIOD_OPTIONS.find((p) => p.value === value);
  return found ? found.label : String(value || "").toUpperCase();
};

const CHART_GRID_KEY = "crypto_chart_grid";

/* A logarithmic price axis, off by default.
 *
 * **Measured, because "the old years are squashed" is a feeling until it is a
 * number.** Coinbase's own BTC `period=all` series, 351 points from $171.51 to
 * $126,279.62: the first half of the history occupies **15.8% of the linear
 * y-range — 63 px of a 400 px chart** — against 72.2% on a log axis. Six years
 * in a strip at the foot of the chart is not a scale choice.
 *
 * Off by default because the two axes answer different questions — linear
 * shows what the money did, log shows what the *rate* did — and on anything
 * shorter than a year they are the same picture. It **stands down while the
 * board is up**: see `logAxis` in `chart-board.js`. */
/* **How long a percent target measures over.**
 *
 * It was twenty-four hours and nothing else, written as one constant in
 * `alerts.js`. That is the right default and it is not the only question
 * anybody asks: "5% in an hour" and "5% in a day" are different events, and
 * only one of them was expressible.
 *
 * The set stops at a day for a reason that is not taste. Detection looks back
 * through **a week of hourly candles**, and the comparison is each candle
 * against the one `window / step` earlier — so a window of three days spends
 * 72 of the 168 candles on the lookback and can only report a hit in the
 * remaining stretch. A day costs 24 and leaves six days of coverage.
 *
 * **The window is stored on the target**, not as a setting, for the reason the
 * cost method is stamped on a disposal: a target is a record of what somebody
 * asked for, and re-reading an old one through a new global would answer a
 * question they never asked.
 */
const PERCENT_WINDOW_OPTIONS = [
  { value: 3600000, label: msg("al_window_1h", "1h") },
  { value: 14400000, label: msg("al_window_4h", "4h") },
  { value: 86400000, label: msg("al_window_24h", "24h") },
];
const DEFAULT_PERCENT_WINDOW = 86400000;

/* How long a target stays armed. `null` — until it is hit or removed — is the
 * default and the only way a target used to be; the other three are what
 * TradingView calls an alert's expiration and CoinGecko has no answer to at
 * all. Stamped on the target, like the window: a record of what was asked.
 * Thirty days, not "a month" — a span is a number, and the row prints it. */
const ALERT_KEEP_OPTIONS = [
  { value: null, label: msg("al_keep_forever", "until hit") },
  { value: 86400000, label: msg("al_keep_1d", "1 day") },
  { value: 604800000, label: msg("al_keep_1w", "1 week") },
  { value: 2592000000, label: msg("al_keep_1m", "30 days") },
];
/* A note is a reason, not a document: one line, the width of a row. */
const ALERT_NOTE_MAX = 60;

/* How sure the caller said they were, in three words rather than a number.
 * Nobody types "70%" on a chart; three buckets are what a calibration table
 * can be honest about at this sample size (`RECORD_MIN_FOR_STATS`). */
const CALL_CONFIDENCE_LEVELS = ["hunch", "likely", "sure"];

const percentWindowLabel = (ms) => {
  const found = PERCENT_WINDOW_OPTIONS.find((o) => o.value === ms);
  return found ? found.label : PERCENT_WINDOW_OPTIONS[2].label;
};

/* A moving average over the drawn range. Off by default; the period is a
 * fraction of what is on screen and the line says the time it covers — see
 * `updateAverage` in `chart.js` for why it is not 50 or 200. */
const CHART_AVERAGE_KEY = "crypto_chart_average";
const DEFAULT_CHART_AVERAGE = false;
/* The chart's tools at the range row's right end (app-tools.js): shown by
   default as a single +, which opens to the six tools. Off takes the + away; the drawings
   stay drawn, the list in the drawer stays, and Shift + drag still measures. */
const CHART_TOOLS_KEY = "crypto_chart_tools";
const DEFAULT_CHART_TOOLS = true;
// How long the pointer rests on the + before it opens by itself
const CHART_TOOLS_DWELL_MS = 1000;
// …and how long the open strip lingers after the pointer leaves it
const CHART_TOOLS_LINGER_MS = 700;

/* **US CPI releases, in UTC** (27 Sep 2026). The Consumer Price Index is
 * published at 08:30 New York time — 12:30 UTC in summer, 13:30 in winter —
 * and it is the one scheduled release this app marks: measured on Coinbase's
 * own 1-minute BTC candles, the 30 minutes after it were larger than all of
 * the seven half-hours before it on 28 of the 36 releases of 2022–2024, where
 * chance would give 4.5 (see ref/measurements.md). **Bundled, not looked up**:
 * asking a calendar at run time would be a new host for a list that changes
 * once a year, and bls.gov refuses scripts (403) anyway. Read 27 Sep 2026 in a
 * browser from bls.gov/bls/news-release/cpi.htm (the date in each archived
 * release's address) and bls.gov/schedule/news_release/cpi.htm (the dates to
 * come, "08:30 AM" on every row); converted through the IANA
 * America/New_York zone. October 2025 was never published (the 2025 lapse in
 * appropriations) and September 2025 came out on 24 October. The provenance
 * file is docs/internal/research/bls-cpi-2026-09-27.json. When the last date
 * here has passed, the markers simply stop at it — nothing is guessed. */
const CPI_CALENDAR_READ = "2026-09-27";
const CPI_RELEASES_UTC = [
  "2015-01-16T13:30Z", "2015-02-26T13:30Z", "2015-03-24T12:30Z",
  "2015-04-17T12:30Z", "2015-05-22T12:30Z", "2015-06-18T12:30Z",
  "2015-07-17T12:30Z", "2015-08-19T12:30Z", "2015-09-16T12:30Z",
  "2015-10-15T12:30Z", "2015-11-17T13:30Z", "2015-12-15T13:30Z",
  "2016-01-20T13:30Z", "2016-02-19T13:30Z", "2016-03-16T12:30Z",
  "2016-04-14T12:30Z", "2016-05-17T12:30Z", "2016-06-16T12:30Z",
  "2016-07-15T12:30Z", "2016-08-16T12:30Z", "2016-09-16T12:30Z",
  "2016-10-18T12:30Z", "2016-11-17T13:30Z", "2016-12-15T13:30Z",
  "2017-01-18T13:30Z", "2017-02-15T13:30Z", "2017-03-15T12:30Z",
  "2017-04-14T12:30Z", "2017-05-12T12:30Z", "2017-06-14T12:30Z",
  "2017-07-14T12:30Z", "2017-08-11T12:30Z", "2017-09-14T12:30Z",
  "2017-10-13T12:30Z", "2017-11-15T13:30Z", "2017-12-13T13:30Z",
  "2018-01-12T13:30Z", "2018-02-14T13:30Z", "2018-03-13T12:30Z",
  "2018-04-11T12:30Z", "2018-05-10T12:30Z", "2018-06-12T12:30Z",
  "2018-07-12T12:30Z", "2018-08-10T12:30Z", "2018-09-13T12:30Z",
  "2018-10-11T12:30Z", "2018-11-14T13:30Z", "2018-12-12T13:30Z",
  "2019-01-11T13:30Z", "2019-02-13T13:30Z", "2019-03-12T12:30Z",
  "2019-04-10T12:30Z", "2019-05-10T12:30Z", "2019-06-12T12:30Z",
  "2019-07-11T12:30Z", "2019-08-13T12:30Z", "2019-09-12T12:30Z",
  "2019-10-10T12:30Z", "2019-11-13T13:30Z", "2019-12-11T13:30Z",
  "2020-01-14T13:30Z", "2020-02-13T13:30Z", "2020-03-11T12:30Z",
  "2020-04-10T12:30Z", "2020-05-12T12:30Z", "2020-06-10T12:30Z",
  "2020-07-14T12:30Z", "2020-08-12T12:30Z", "2020-09-11T12:30Z",
  "2020-10-13T12:30Z", "2020-11-12T13:30Z", "2020-12-10T13:30Z",
  "2021-01-13T13:30Z", "2021-02-10T13:30Z", "2021-03-10T13:30Z",
  "2021-04-13T12:30Z", "2021-05-12T12:30Z", "2021-06-10T12:30Z",
  "2021-07-13T12:30Z", "2021-08-11T12:30Z", "2021-09-14T12:30Z",
  "2021-10-13T12:30Z", "2021-11-10T13:30Z", "2021-12-10T13:30Z",
  "2022-01-12T13:30Z", "2022-02-10T13:30Z", "2022-03-10T13:30Z",
  "2022-04-12T12:30Z", "2022-05-11T12:30Z", "2022-06-10T12:30Z",
  "2022-07-13T12:30Z", "2022-08-10T12:30Z", "2022-09-13T12:30Z",
  "2022-10-13T12:30Z", "2022-11-10T13:30Z", "2022-12-13T13:30Z",
  "2023-01-12T13:30Z", "2023-02-14T13:30Z", "2023-03-14T12:30Z",
  "2023-04-12T12:30Z", "2023-05-10T12:30Z", "2023-06-13T12:30Z",
  "2023-07-12T12:30Z", "2023-08-10T12:30Z", "2023-09-13T12:30Z",
  "2023-10-12T12:30Z", "2023-11-14T13:30Z", "2023-12-12T13:30Z",
  "2024-01-11T13:30Z", "2024-02-13T13:30Z", "2024-03-12T12:30Z",
  "2024-04-10T12:30Z", "2024-05-15T12:30Z", "2024-06-12T12:30Z",
  "2024-07-11T12:30Z", "2024-08-14T12:30Z", "2024-09-11T12:30Z",
  "2024-10-10T12:30Z", "2024-11-13T13:30Z", "2024-12-11T13:30Z",
  "2025-01-15T13:30Z", "2025-02-12T13:30Z", "2025-03-12T12:30Z",
  "2025-04-10T12:30Z", "2025-05-13T12:30Z", "2025-06-11T12:30Z",
  "2025-07-15T12:30Z", "2025-08-12T12:30Z", "2025-09-11T12:30Z",
  "2025-10-24T12:30Z", "2025-12-18T13:30Z", "2026-01-13T13:30Z",
  "2026-02-13T13:30Z", "2026-03-11T12:30Z", "2026-04-10T12:30Z",
  "2026-05-12T12:30Z", "2026-06-10T12:30Z", "2026-07-14T12:30Z",
  "2026-08-12T12:30Z", "2026-09-11T12:30Z", "2026-10-14T12:30Z",
  "2026-11-10T13:30Z", "2026-12-10T13:30Z"
];
/* The chart's US-release markers and the line under the price, one switch.
   On by default: it was asked for, and it costs no request. */
const MACRO_EVENTS_KEY = "crypto_chart_macro_events";
const DEFAULT_MACRO_EVENTS = true;
/* Past this many releases in the drawn range (ALL holds over a hundred) the
   markers would be a fence, so none are drawn. */
const MACRO_EVENTS_MAX_MARKS = 24;
/* The line under the price speaks from two days before a release until two
   hours after it — nearer than that it is news, further it is a calendar. */
const CPI_SOON_MS = 48 * 3600 * 1000;
const CPI_JUST_MS = 2 * 3600 * 1000;
/* **The chart companion** (27 Sep 2026): the chart names the setups it
 * finds where they are — "a head and shoulders completed here" — with the
 * coin's own record for that setup beside it, and nothing else: no score, no
 * entry, no arrow the counts do not carry. Off by default because it reads a
 * coin's whole daily history (about fifteen requests the first time, then
 * twelve hours cached and shared with the base-rate screen). */
const COMPANION_KEY = "crypto_chart_companion";
const DEFAULT_COMPANION = false;
/* At most this many named setups on one chart; the newest are kept. */
const COMPANION_MAX = 6;
/* How near a companion mark the pointer has to be, in pixels either way, to
   open its card. Under the move marks' 12: rings and swing points sit
   closer together than move marks do, and a reach that wide took the
   neighbour. */
const COMPANION_HIT = 8;
/* A strategy setup is named on the chart by its latest entry, when that was
   in the last `COMPANION_RECENT_DAYS` days — "here, now" — and the rare ones
   (a handful a decade) wherever they fall in the range. A year of every MACD
   cross is a fence of labels, not a companion: measured on BTC's year, four
   MACD crosses and five squeezes in one month crowded the two setups that
   were actually current off the plot. */
const COMPANION_RECENT_DAYS = 30;
const COMPANION_RARE_SETUPS = ["golden-cross", "death-cross"];
/* The corner list holds at most this many setups; the newest are kept. */
const COMPANION_MAX_SETUPS = 7;
/* **Indicator lines** (27 Sep 2026): one classic overlay at a time, drawn
 * from the daily candles the companion reads — Bollinger (20, 2σ), the
 * Donchian channel (20), the 50- and 200-day averages, or Supertrend
 * (10, 3). Daily, and labelled as daily: a "20-day" band means twenty days
 * whatever range is on screen, which is why it is not drawn on a range too
 * short to hold five of them (see "Period names lie on a ranged chart"). */
const INDICATOR_OVERLAY_KEY = "crypto_chart_indicator_overlay";
const INDICATOR_OVERLAYS = ["none", "bollinger", "donchian", "averages", "supertrend"];
const DEFAULT_INDICATOR_OVERLAY = "none";
/* **Several at once** (27 Sep 2026, *"bu metrikler grafik ayarlarında da
   olsun"*): the overlays became a set — Bollinger with the 50/200 averages
   is a common pair — under a new key; the single choice above is read once,
   as the set's starting value, and never written again. */
const INDICATOR_OVERLAYS_KEY = "crypto_chart_indicator_overlays";
/* The companion's metrics, one by one: the patterns and setups switched off
   in the chart's settings. Stored as what is *off*, so a metric added later
   is shown until somebody hides it — the rule the news sources follow. */
const COMPANION_HIDDEN_KEY = "crypto_chart_companion_hidden";
const INDICATOR_MIN_POINTS = 5;

/* **Counted studies on the chart** (the chart plan's Phase 4,
 * chart-studies.js): each its own switch, all off by default, kept as the set
 * that is on. Each says what it counts; the four that could be read as a claim
 * were preregistered and measured first, and their wording follows the result
 * (research/studies-prereg.md). */
const CHART_STUDIES_KEY = "crypto_chart_studies";
const CHART_STUDIES = ["where", "profile", "volumeEvents", "regimes", "usualRange", "turnLevels"];
// The studies that read the coin's daily candles (fetchDailyCandles, shared
// with the base-rate screen and the companion)
const CHART_STUDIES_DAILY = ["regimes", "turnLevels"];

/* The horizons the setups are read at — see setups-prereg.md. */
const SETUP_HORIZON = 10;
const SETUP_MOVE_HORIZON = 30;

const LOG_SCALE_KEY = "crypto_chart_log_scale";
const DEFAULT_LOG_SCALE = false;
const DEFAULT_CHART_GRID = false;

/* How far the board reaches in price, as a multiple of the fair square.
 *
 * One square size cannot serve both calls. A square sized to what the price
 * usually does in that time is the right size for a *tight* call and puts the
 * board's whole reach at about three squares either side of the price — so the
 * one call an hour chart most invites, "it falls off a cliff", has no square to
 * point at. Zooming out makes each square worth more and the reach grow with
 * it; zooming in tightens the band you are naming.
 *
 * Doubling per notch, because the square lands on a round number either way and
 * doubling is the step people can hold in their head. At ×16 an hour board
 * reaches past any hour BTC has ever had; at ×0.5 the band is half a typical
 * move, which is as tight as a call can be and still be winnable.
 */
const BOARD_ZOOM_KEY = "crypto_chart_board_zoom";
const DEFAULT_BOARD_ZOOM = 1;
// Discrete rungs, not a continuous scale: the price step lands on a round
// number either way, and a zoom you can count is a zoom you can undo.
const BOARD_ZOOM_STEPS = [0.5, 1, 2, 4, 8, 16, 32, 64];
const BOARD_ZOOM_MIN = BOARD_ZOOM_STEPS[0];
const BOARD_ZOOM_MAX = BOARD_ZOOM_STEPS[BOARD_ZOOM_STEPS.length - 1];
/* How long the scale takes to travel when it changes. Long enough to see which
 * way it went and what happened to the boxes; short enough not to be a wait.
 *
 * 340, up from 260. Two frames of a 260ms ease-out is most of the movement,
 * so with the ladder still snapping under it the whole thing read as a jump;
 * with the step now interpolated (`boardStep`) there is something continuous
 * to watch, and it needs long enough to be watched. A press-and-press-again
 * still feels immediate because a second press restarts from where the eye
 * is rather than from where the last one was aiming. */
const BOARD_ZOOM_MS = 340;
/* How long the board takes to walk one square when an arrow is pressed, and
 * how far it may walk from the price. Shorter than the zoom, because a pan is
 * a smaller claim about what changed — the scale is the same, only the window
 * moved — and because the arrows repeat while they are held, so the travel
 * has to finish inside one repeat or the board falls behind the hand. */
const BOARD_PAN_MS = 190;
/* Twenty squares each way. Far enough to reach the band a real fall ends at,
 * near enough that the way back is a few presses rather than a search. */
const BOARD_PAN_MAX = 20;
/* Press-and-hold: the wait before it starts repeating, and the gap between
 * repeats after that. The first is long enough that a single press is a
 * single square; the second is one pan's travel, so the board arrives before
 * it is asked to leave again. */
const BOARD_PAN_HOLD_MS = 320;
const BOARD_PAN_REPEAT_MS = 190;
/* **How long the pointer has to rest on an arrow before it starts walking.**
 *
 * Hovering is the fastest way to use these — the pointer is already on the
 * chart and the arrows are at its edges — but an arrow that fires the instant
 * it is touched fires while you are on your way somewhere else, and a board
 * that walks off on its own is worse than one you have to click. The dwell is
 * what separates "I am pointing at this" from "I passed over it": long enough
 * that no crossing gesture reaches it, short enough that the control does not
 * read as broken while you wait. Two seconds was suggested and is the safe
 * end of that; it is also long enough to look like nothing is happening, so
 * this sits below it and the arrow lights up the moment the dwell starts, to
 * say the wait is doing something. */
const BOARD_PAN_DWELL_MS = 700;

/* Quiet controls: the corner buttons rest almost invisible and come up under
 * the pointer. Nothing is hidden and nothing becomes unclickable — a control
 * you cannot see but can still press is a trap, so they fade to a ghost rather
 * than to nothing, and each one lights up on hover and on keyboard focus. */
const QUIET_CHROME_KEY = "crypto_chart_quiet_chrome";

/* **Which of the app's features are switched on.**
 *
 * PriceTab has grown eight things you can open, and nobody wants all eight.
 * Quiet Controls fades their buttons; this turns the features off. They are
 * two different asks and the second one had no answer: somebody who never
 * compares two coins had a compare button in the corner for ever, and the
 * only way to be rid of it was to stop looking at that corner.
 *
 * **Off is a real off** — the button is gone, the shortcut does nothing, and
 * the panel cannot be reached. A switch labelled "off" that leaves a working
 * keyboard shortcut behind is not a switch, it is a preference about
 * decoration, and this used to be exactly that.
 *
 * **Absent means on**, and only `false` is ever stored — the rule
 * `newsSources` already follows, and for the same reason: an allow-list would
 * silently switch off every feature added after it was written.
 *
 * **Settings is not in the list and must never be.** It is the way back to
 * this screen, so a switch that could turn it off is one press away from
 * locking somebody out of their own preferences.
 *
 * **Futures is in the list but keeps its own key.** It had a section of its
 * own and does not need one now that every feature is on one screen; what it
 * cannot share is the storage, because its terms are remembered separately
 * (`PRACTICE_CONSENT_KEY`) and turning it off must not forget that they were
 * read. `store: "practice"` is how the row says so. */
/* **The page ticker's collapse, as one movement.**
 *
 * Two things move when the bar is hidden: the bar slides off its own edge,
 * and the page's padding gives the space back. They were animated separately
 * — 0.42s on the bar against 0.4s on the shell — and over different
 * distances, since the padding was a hard-coded 3rem while the bar's height
 * comes from its contents, and therefore from the text-size setting.
 * Measured: the bar is 49px at the default text size and 55px at the large
 * one, against a padding of 48px and 54px. So the chart's edge and the bar's
 * edge were a pixel apart at rest and twenty milliseconds apart in motion.
 * One duration, one easing, and a padding measured from the bar.
 *
 * The fallback is the old 48px, for the frame before the bar has been
 * measured — never for longer, and never as the answer. */
const PAGE_TICKER_SLIDE_MS = 420;
const PAGE_TICKER_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const PAGE_TICKER_FALLBACK_H = 48;

/* **The chart's tabs rest in a drawer of their own** (26 Sep 2026,
 * *"normalde bu kısım saklı kalsın, çekmece gibi olsun; ona tıklanınca veya
 * uzun bir süre hoverlayınca bu sol yan bar çıksın"*). A handle at the left
 * edge brings the column out on a press, or after the pointer has rested on
 * it for SPINE_DWELL_MS — it was the board's arrows' dwell, this app's
 * answer to "pointing at this" against "passing over it", until the pulls
 * were given a margin and a shorter wait of their own — and it goes back
 * SPINE_LINGER_MS after the pointer leaves it. The linger is what lets the
 * pointer cross the few pixels between the handle and a tab without the
 * column shutting under it. The screens' column on the right edge is pulled
 * the same way, on the same numbers.
 *
 * It replaced a proximity band (CHROME_NEAR_Y / CHROME_NEAR_X, 23–25 Sep):
 * the corner and a strip came back whenever the pointer was near an edge.
 * With a pull there is one thing to reach for on each side instead of a band
 * to discover. */
/* **450ms since 26 Sep 2026** (*"bu tırnakların açılma süresini 450 ms'ye
 * düşürsek"*), its own number rather than the board's 700: with the margin
 * below, the pointer is counted as reaching for the pull sooner, and 700ms
 * on top of that read as a pull that answered late. Still well over a pass —
 * a pointer crossing the margin spends a fraction of it there. */
const SPINE_DWELL_MS = 450;
const SPINE_LINGER_MS = 400;

/* **Near the pull counts as on it** (26 Sep 2026, *"sadece üstlerine gelince
 * yavaşça açılmayı birazcık daha uzatalım, sağa ve sola doğru… hafiften
 * yakınlaşması bile orasının açılmasını sağlasın"*). The pull keeps its
 * size; what grew is where the pointer counts as on it — SPINE_NEAR_X px
 * further into the window than its inner edge and SPINE_NEAR_Y above and
 * below — and the pull slides out as the pointer arrives there, on the
 * same dwell. A distance measured by one pointermove listener, not a
 * bigger box: a box would take the presses meant for what is under it.
 * SPINE_NEAR_BAND is how far from an edge anything is read at all; the
 * column and the margin together are well inside it. */
const SPINE_NEAR_X = 60;
const SPINE_NEAR_Y = 30;
const SPINE_NEAR_BAND = 160;


/* How long a panel swap takes end to end, in ms, and where in it the panels
 * actually change (`PANEL_SWAP_AT`, the point the veil is fully up). Two
 * numbers in one place because a veil that lifts before the swap shows the
 * cut it exists to hide. See `PanelVeil` in styles-app.js. */
const PANEL_SWAP_MS = 320;
const PANEL_SWAP_AT = 130;

const FEATURES_KEY = "crypto_chart_features";
const FEATURE_CONTROLS = [
  { key: "targets", label: "Price targets", shortcut: "A" },
  { key: "calls", label: "Calls", shortcut: "K" },
  { key: "futures", label: "Derivatives market", shortcut: "F", store: "practice" },
  { key: "news", label: "News", shortcut: "N" },
  { key: "baseRates", label: "Base rates", shortcut: "B" },
  { key: "portfolio", label: "Portfolio", shortcut: "P" },
  { key: "compare", label: "Compare", shortcut: "C" },
  { key: "widgets", label: "Widgets", shortcut: "" },
];

const DEFAULT_QUIET_CHROME = false;

/* MODES
 *
 * A mode is one click that sets a dozen settings at once — the same idea as the
 * widget bundles, one level up. It is not a new kind of state: every value here
 * goes through the setting's own handler, so a mode leaves the app in a state
 * you could have reached by hand, and every switch still says what it says.
 * That is why there is no "current mode" stored anywhere — the mode is
 * *recognised* from the settings (`activeAppMode`), and the moment you change
 * one of them by hand you are simply back to your own arrangement.
 *
 * `settings` names the values the mode cares about. Anything not named is left
 * alone on purpose: a mode should not silently take your currency, your number
 * format or your theme, which are yours whatever you use the tab for. Calls are
 * left alone for the same reason and one more — turning them off would hide a
 * record you made.
 */
const APP_MODES = [
  {
    value: "minimal",
    label: "Minimal",
    // Everything off, and the controls stop asking to be looked at
    desc: "The price and the chart, nothing else. The corner controls fade to a ghost until you point at them; the keys still work.",
    widgets: "none",
    settings: {
      quietChrome: true,
      chartType: "line",
      chartGrid: false,
      volumeBars: false,
      ohlcEnabled: false,
      marketStats: false,
      lastSeen: false,
      moveHeadlines: false,
      tickerEnabled: false,
      pageTicker: false,
      newsTicker: false,
      autoRotate: false,
      refreshInterval: 60000,
    },
  },
  {
    value: "fast",
    label: "Fast",
    /* Fast is about the price being current, not about the app feeling quick —
     * so it polls hard and drops the things that cost a request each. */
    desc: "The freshest price. Polls every ten seconds and drops everything that costs its own request — widgets, the news row, the scrolling bar.",
    widgets: "none",
    settings: {
      quietChrome: false,
      /* The chart settings are named here too, and they have to be: a mode is
       * recognised by the values it names, so one that left the chart out was
       * indistinguishable from Trader with the widgets switched off — the row
       * would light up "Fast" on a candlestick chart with a volume band. They
       * belong in this mode anyway: candles and the crosshair's open/high/low/
       * close are a second request per range. */
      chartType: "line",
      chartGrid: false,
      volumeBars: false,
      ohlcEnabled: false,
      refreshInterval: 10000,
      tickerEnabled: true,
      pageTicker: false,
      newsTicker: false,
      moveHeadlines: false,
      marketStats: true,
      lastSeen: true,
      autoRotate: false,
    },
  },
  {
    value: "trader",
    label: "Trader",
    desc: "Everything to read a move with: candles, volume, the grid, the crosshair’s open/high/low/close, and the derivatives widgets.",
    widgets: "trader",
    settings: {
      quietChrome: false,
      chartType: "candles",
      volumeBars: true,
      ohlcEnabled: true,
      chartGrid: true,
      marketStats: true,
      lastSeen: true,
      moveHeadlines: false,
      refreshInterval: 10000,
      tickerEnabled: true,
      pageTicker: false,
      newsTicker: false,
      autoRotate: false,
    },
  },
  {
    value: "holder",
    label: "Holder",
    desc: "For checking in, not watching: a calm chart, the market around it, and headlines. Polls every five minutes.",
    widgets: "holder",
    settings: {
      quietChrome: false,
      chartType: "line",
      chartGrid: false,
      volumeBars: false,
      ohlcEnabled: true,
      marketStats: true,
      lastSeen: true,
      moveHeadlines: true,
      refreshInterval: 300000,
      tickerEnabled: false,
      pageTicker: true,
      /* The only mode that turns the headline row on, so the only one that can
       * name what the row carries — in the other three `newsFilter` would be a
       * value with nothing to filter. Holder is for checking in on what you
       * hold, so the headlines are narrowed to that; an empty portfolio gives
       * the whole feed back rather than an empty row (see `NEWS_FILTER_OPTIONS`),
       * so this cannot leave someone with a bar and nothing in it. */
      newsTicker: true,
      newsFilter: "portfolio",
      autoRotate: false,
    },
  },
];

/* Which mode the settings currently amount to, or null for "your own".
 *
 * Recognised rather than remembered: a stored "current mode" would go on
 * claiming to be Minimal after you switched the page ticker back on, and the
 * one thing a mode row must not do is describe a screen that isn't there.
 * `widgets` counts too — a mode that turns them all off is not in force while
 * six of them are on screen.
 */
/* **Custom — the arrangement you made, kept.**
 *
 * The four modes above are recipes: press one and it writes a dozen settings.
 * What they could not do is give back what you had, and that was a real loss
 * rather than a missing luxury — pressing Trader to see what it looks like
 * threw away an arrangement built by hand over weeks, with nothing to undo it.
 * The row said "Your own arrangement" while offering no way to keep one.
 *
 * So Custom is a **slot, not a recipe**: it holds whatever you saved into it
 * and hands it back. That is also why it is the only mode whose contents are
 * not in this file — there is nothing to write down here, because its contents
 * are yours.
 *
 * `MODE_SETTING_KEYS` is exactly what a mode governs, taken from the modes
 * themselves rather than listed a second time: save and restore have to cover
 * the same ground a mode covers, and a hand-written list would drift the first
 * time a mode learned a new setting. Currency, number format and theme stay
 * out, as they do for every mode — they are yours whatever you use the tab
 * for, so a saved arrangement must not carry them either. */
const CUSTOM_MODE_KEY = "crypto_chart_custom_mode";
const MODE_SETTING_KEYS = [
  ...new Set(APP_MODES.reduce((all, m) => all.concat(Object.keys(m.settings)), [])),
];

/* Is what is on screen now the arrangement that was saved?
 *
 * Compared over `MODE_SETTING_KEYS` and the widget list, which is the same
 * ground `activeAppMode` compares a recipe over — so the Custom chip lights
 * under exactly the conditions the other four do, and one hand-made change
 * puts it out the way it puts them out. A missing or empty slot matches
 * nothing: an unsaved Custom must never light. */
const matchesCustomMode = (settings, widgets, saved) => {
  if (!saved || !saved.settings) return false;
  const keys = Object.keys(saved.settings);
  if (!keys.length) return false;
  if (!keys.every((k) => settings[k] === saved.settings[k])) return false;
  const now = widgets || {};
  const then = saved.widgets || {};
  const names = [...new Set(Object.keys(now).concat(Object.keys(then)))];
  return names.every((w) => Boolean(now[w]) === Boolean(then[w]));
};

const activeAppMode = (settings, widgets) => {
  const on = (w) => Boolean(widgets && widgets[w]);
  const anyWidget = widgets ? Object.keys(widgets).some(on) : false;
  for (const mode of APP_MODES) {
    const settingsMatch = Object.keys(mode.settings).every(
      (key) => settings[key] === mode.settings[key],
    );
    if (!settingsMatch) continue;
    if (mode.widgets === "none") {
      if (anyWidget) continue;
    } else if (mode.widgets) {
      if (!isPresetActive(widgets, mode.widgets)) continue;
    }
    return mode.value;
  }
  return null;
};

/* Call the cell — read the chart, name where the price will be.
 *
 * Deliberately not an economy. Nothing here is worth anything, can be spent,
 * or leaves the device: the score is a number about you, kept next to your
 * settings. A point that could become something a person would pay for turns
 * a price chart into a wager on an asset, which the Chrome Web Store bans
 * outright (Grey Copper, critical) — and a score kept in localStorage could
 * never be trusted with value anyway, since it is editable in a devtools
 * panel in five seconds. See the private notes for the full reasoning.
 */
const PREDICT_KEY = "crypto_chart_predict";
const DEFAULT_PREDICT = false;
/* How much of the chart's width the board takes, as a fraction.
 *
 * It used to be a count of squares, one to ten, with a stepper in the calls
 * panel — and the geometry bent itself into knots to honour it: the strip got
 * a budget that rose with the count, the cell size was chosen to fit that
 * many inside it, and asking for more squares made every square smaller. Once
 * the "now" line could be dragged, all of that was a second way to say the
 * same thing, in a unit nobody thinks in. What you actually want is *this much
 * board*, and you say it by pulling the line to where you want it.
 *
 * So the width is the setting and the squares are simply however many fit at
 * a comfortable size. The bounds are geometric rather than fractions of the
 * width — two whole squares of history at one end and two of board at the
 * other — so they are enforced where the square size is known (`futureWidth`);
 * these are only the outer sanity limits a stored value is read through. */
const FUTURE_SHARE_KEY = "crypto_chart_future_share";
const DEFAULT_FUTURE_SHARE = 0.18;
const MIN_FUTURE_SHARE = 0.05;
const MAX_FUTURE_SHARE = 0.95;
/* Two switches for what a settled call does afterwards. Both default on:
 * seeing the box you drew and being told you got it right is the whole
 * feedback loop. Both can be turned off, because a chart someone reads for
 * prices should not be permanently decorated by a game they have stopped
 * playing. */
/* The travel band on the board — how far this coin has moved over each
 * square's worth of clock, drawn as a cone and making no claim about
 * direction. Off by default like every other addition: the plain board is
 * what ships. See `updateTravelBand` in chart.js for why it is a description
 * rather than a forecast, and `travelBand` in utils.js for the arithmetic. */
const TRAVEL_BAND_KEY = "crypto_chart_travel_band";
const DEFAULT_TRAVEL_BAND = false;

const CALLS_SHOW_SETTLED_KEY = "crypto_chart_calls_show_settled";
const DEFAULT_CALLS_SHOW_SETTLED = true;
const CALLS_CELEBRATE_KEY = "crypto_chart_calls_celebrate";
const DEFAULT_CALLS_CELEBRATE = true;

/* When the calls panel was last opened, as a timestamp.
 *
 * The dot on the calls button means "something settled since you last
 * looked", and "last looked" has to survive the tab being closed or the mark
 * comes back on every new tab for a result you have already seen — which is
 * the fastest way to teach someone to ignore it. */
const CALLS_SEEN_KEY = "crypto_chart_calls_seen";
/* When the news panel was last opened, for the same reason and read the same
 * way. It has to outlive the tab or "new since you last looked" would mean
 * "new since this tab opened", which on a new-tab page is every headline
 * there is. */
const NEWS_SEEN_KEY = "crypto_chart_news_seen";

/* How wide the Settings card is.
 *
 * A **preference, set in Preferences**, alongside the other things you choose
 * about how the app looks — not a control bolted into the panel's head. It
 * changes the panel you are standing in, so it shows you its own effect as
 * you pick it, which is the argument for it being a row like any other.
 *
 * **Three sizes, and full screen earned its place the second time.** Measured
 * first against the old centred single column it was the worst of the three:
 * the content stayed a 490px column stranded in a 1440px screen, so it covered
 * the chart and gained nothing for it. What changed is the rows — with the
 * one-row grid and two columns, full screen puts **all nineteen settings on
 * one screen with nothing to scroll** (measured 1.00 screens against 2.8
 * compact), which is a different thing to be for: going through everything
 * once, rather than flipping one switch and watching what it did.
 *
 * That trade is why it is not the default and never will be. Seven of the
 * nineteen settings change what is drawn on the chart behind the panel, and
 * compact leaves 71% of the screen showing it. Compact stays the default
 * because it is what the panel has always been, and someone who has never
 * opened this setting should not find their layout changed. */
/* **Text size, as a root font size.** Everything in this app is sized in rem
 * off the browser's own root, so one number moves the whole interface
 * together — the chart's furniture, the panels, the widgets' em-scaled
 * insides — instead of a font-size override that would move the words and
 * leave every box they sit in the size it was.
 *
 * `Default` is 16px, which is what the browser gives and what every measured
 * decision in this file was taken against, so choosing it changes nothing.
 * The two larger steps are what a 1.15 and a 1.3 modular jump come to; the
 * smaller one stops at 15 because the widget subtext is already ~9px and
 * below that its symbols stop being legible.
 *
 * Applied in `theme-init.js` before React for the same reason the theme is:
 * the alternative is a page that lays out at one size and jumps to another. */
const TEXT_SIZE_KEY = "crypto_chart_text_size";
const TEXT_SIZE_OPTIONS = [
  { value: "small", label: "Small", px: 15 },
  { value: "default", label: "Default", px: 16 },
  { value: "large", label: "Large", px: 18 },
  { value: "xlarge", label: "Larger", px: 20 },
];
const DEFAULT_TEXT_SIZE = "default";

/* **The order the panels sit in**, which one stored list decides for three
 * surfaces: the corner controls, the folder tabs over an open panel, and the
 * phone's menu. Dragged into place on the tabs (23 Sep 2026) — the row is
 * where they are visible as a row, so it is where reordering reads as moving
 * them rather than as editing a list somewhere else.
 *
 * Settings is first and stays first: it is the one control that is never
 * hidden and the one the tour points at. The rest are the person's to order.
 * The stored value is sanitised against this list on the way in, so a key
 * this version no longer has is dropped and a key it has gained is appended
 * rather than silently missing. */
const PANEL_ORDER_KEY = "crypto_chart_panel_order";
const DEFAULT_PANEL_ORDER = [
  "settings",
  "portfolio",
  "targets",
  "calls",
  "futures",
  "news",
  "baserates",
];

/* How many tracked coins the Settings list carries in one column before it
 * starts flowing into two. Measured in the card, with the add box, the sort
 * row and the suggestions under it: six rows fit, the seventh pushes the tab
 * 25px past the bottom and the eighth 57px, so the switch happens at seven. Two columns then hold about fourteen; past that the card scrolls
 * again and the wide one is the answer, since a third column in a 472px card
 * would be 146px and cut every coin's name. */
const COIN_LIST_COLUMN_AT = 6;

/* **The notional stake behind "what would this have paid".**
 *
 * A flat 100 per call, not a number anyone chooses. Letting each call carry
 * its own stake would turn placing one — a two-click gesture on the chart —
 * into a sizing decision, and would let a good record be built by betting big
 * on the near-certain squares, which is the exact thing fair odds exist to
 * price out. Flat, every call, so the only thing that moves the total is how
 * hard the squares were and how often they came in.
 *
 * It is points and it is never drawn with a currency symbol. `callPayout`
 * owns the odds; the no-value boundary must stay true in the shipped wording
 * itself rather than depend on local working notes. */
const CALL_STAKE = 100;

/* Practice Lab. A separate key from the Paper prototype's on purpose: a saved
 * real-coin paper position must never be read back as a fictional LAB-PERP
 * one, so the two shapes never share a slot. */
/* How long a refused-character warning stays on screen. Long enough to read
 * a short sentence, short enough that it is gone before the next keystroke
 * needs the note back. */
const NUMBER_WARN_MS = 2600;

const PRACTICE_STATE_KEY = "crypto_chart_practice";
/* Read once, before anything in the futures section is drawn. Separate from
 * the state so resetting the balance never re-asks, and so turning the
 * section off and on again does not either. */
const PRACTICE_CONSENT_KEY = "crypto_chart_practice_consent";

/* **Which unit a contract's size is read in.**
 *
 * OKX calls this "Futures trading units" and offers Crypto or Contract;
 * Binance switches the same figure between the coin and the quote currency.
 * The two answer different questions and neither is wrong: `coin` is what you
 * are exposed to (0.008 BTC), `cash` is what it is worth (900.00). Somebody
 * thinking in the asset wants the first and somebody thinking in money wants
 * the second, and the account is the same either way.
 *
 * A **display preference, not part of the account** — so it is stored on its
 * own key rather than in `plan`, and changing it does not start a fresh
 * account the way every rule on that tab does. Nothing in the model reads it. */
const PRACTICE_UNITS_KEY = "crypto_chart_practice_units";
const PRACTICE_UNITS_COIN = "coin";
const PRACTICE_UNITS_CASH = "cash";
const PRACTICE_UNIT_OPTIONS = [PRACTICE_UNITS_COIN, PRACTICE_UNITS_CASH];
/* **What the ticket was last set to.**
 *
 * Leverage is held **per coin**, the way every venue holds it, and the size
 * share globally. It was component state — so on a *new-tab page*, where
 * every tab is a fresh JavaScript context, "forgotten between sessions" meant
 * forgotten every single time: somebody who trades at 20x set 2x → 20x on
 * every tab they ever opened.
 *
 * Not part of the account, so it lives on its own key: changing it moves no
 * money, and it must not be one of the things that starts a fresh account.
 * Clamped on load against the account's own ceiling, since the plan can be
 * tightened after a leverage was remembered. */
const PRACTICE_TICKET_KEY = "crypto_chart_practice_ticket";
const PRACTICE_TICKET_COINS = 24;
const PRACTICE_SIZE_SHARES = [25, 50, 75, 100];
const DEFAULT_PRACTICE_SHARE = 25;
/* Whether the section is offered at all. Off is a real off: the terms are not
 * shown, nothing is marked, and the row is not in the panel. */
const PRACTICE_ENABLED_KEY = "crypto_chart_practice_enabled";

const CALLS_KEY = "crypto_chart_calls";
const MAX_OPEN_CALLS = 40;              // ten squares across a few coins
const MAX_DONE_CALLS = 24;              // settled ones kept for the record

/* Headlines shown when the active coin has made an unusual move for the
 * period on screen. A 2% hour is remarkable; a 2% year is nothing, so the
 * threshold scales with the window. ALL is left out — every coin's all-time
 * chart is a big move, so it would always be "notable" and mean nothing.
 *
 * Off by default: it reads the news feed, which the ticker also uses but
 * which isn't fetched unless something asks for it.
 */
const NOTABLE_MOVE_PCT = {
  hour: 2,
  day: 5,
  week: 10,
  month: 20,
  year: 50,
};
const MOVE_HEADLINES_KEY = "crypto_chart_move_headlines";
const DEFAULT_MOVE_HEADLINES = false;

// Price alerts (in-tab only — no `notifications` permission, so PriceTab
// stays a zero-permission extension). [{ id, coin, direction, target,
// currency, created, triggeredAt }]
const ALERTS_STORAGE_KEY = "crypto_chart_alerts";
const MAX_ALERTS = 10;

/* Announcing a hit in the tab title.
 *
 * The banner only exists on the tab you are looking at, so a target that goes
 * off while you are on another tab waits, silently, until you happen to come
 * back. The tab strip is the one surface a background tab still owns, and
 * writing to it needs no permission — which is the whole reason this feature
 * is in-tab rather than a notification.
 *
 * It also turns the polling back on for a tab that is hidden, which the app
 * otherwise deliberately stops: a target nobody is checking can't be reported.
 * That is why the switch governs both, and why it is the only thing in the
 * extension that fetches while you are looking elsewhere — it does so only
 * when you have an armed target, only for that target's coins, and slowly.
 */
const ALERT_TAB_TITLE_KEY = "crypto_chart_alert_tab_title";
const DEFAULT_ALERT_TAB_TITLE = true;

/* **The real alarm: a Chrome notification, a sound, or both.**
 *
 * The tab title was the whole of the announcement, and it has a hole in it
 * that no amount of flashing closes — a title says nothing to somebody who is
 * looking at another tab, which is the only situation in which being told
 * matters. These two are what a person means by "alert me".
 *
 * Both off by default and stored separately, because they fail differently
 * and are wanted separately: the notification needs a permission Chrome will
 * ask about, and the sound needs nothing but a tab that has been interacted
 * with. Neither is a fallback for the other — a banner with no noise is what
 * somebody in an office wants, and a noise with no banner is what somebody who
 * has turned system notifications off wants.
 *
 * The permission itself is **not** stored: `chrome.permissions.contains` is
 * the only honest source, because it can be revoked from `chrome://extensions`
 * without this page ever hearing about it. A stored "granted" would go stale
 * into a lie. Same rule as `newsGranted`. */
/* **How many settled contracts a mean is worth printing over.**
 *
 * Five, and the rule behind it is the base-rate panel's: an average win over
 * three contracts is not a fact about how you trade, it is a fact about three
 * contracts. Below it the record shows what it always showed — the score, the
 * net and the fees, which are counts rather than inferences — and simply does
 * not draw the block. The curve needs one fewer, because a shape is a shape
 * and claims nothing about the next contract. */
const RECORD_MIN_FOR_STATS = 5;
const RECORD_MIN_FOR_CURVE = 4;

/* **Two things about how futures behaves, rather than about what the account
 * is.** That is the line: the Account tab holds what this account is and what
 * it will refuse — its balance, its settlement, its costs, its rules — and
 * Preferences holds how the exercise behaves around it.
 *
 * The dock is the compact strip over the chart while a contract is running.
 * On by default, because the whole reason the position is drawn on the chart
 * is that you are looking at the chart — but it is somebody else's chart too,
 * and a strip over it is a real thing to want gone.
 *
 * Asking before opening is off by default and deliberately so: a simulator
 * with an imaginary balance is a place to press the button and find out, and
 * a confirm on every order would make the cheap experiment expensive. It is
 * here for somebody practising the *discipline* rather than the arithmetic. */
const PRACTICE_DOCK_KEY = "crypto_chart_practice_dock";
const PRACTICE_CONFIRM_KEY = "crypto_chart_practice_confirm";

/* **The terminal's seams, where they were let go** (27 Sep 2026): the book's
 * width, the ticket's width and the positions panel's height, in px. Each is
 * absent until its seam is first moved, and a double-click on the seam takes
 * it out again — absent means the size the window chooses. A display
 * preference like the two above; it touches no account. The floors are
 * measured, not chosen: 224px is the book's three tabs on one line, 416px
 * (26rem) the ticket's leverage row with its field — at 400px the field was
 * cut off at the desk's edge — and 120px the panel's tabs and one row. The
 * ceilings stop a stored width swallowing a narrower window (the page
 * applies the window's own limit when it measures). */
/* **The tax report helper's choices** (28 Sep 2026): which country's rules,
 * and the rates a person enters for each — the one input the helper cannot
 * know (tax-report.js). Rebuilt field by field by `sanitizeTaxSettings`. */
const TAX_SETTINGS_KEY = "crypto_chart_tax_settings";

const PRACTICE_LAYOUT_KEY = "crypto_chart_practice_layout";
const PRACTICE_LAYOUT_LIMITS = {
  book: [224, 640],
  desk: [416, 760],
  bottom: [120, 900],
};
/* How the page's chart draws the perpetual: candles (a venue's default) or
   the close as a line. */
const PRACTICE_CHART_STYLE_KEY = "crypto_chart_practice_chart_style";
const PRACTICE_CHART_STYLES = ["candles", "line"];

const ALARM_NOTIFY_KEY = "crypto_chart_alarm_notify";
const ALARM_SOUND_KEY = "crypto_chart_alarm_sound";
const DEFAULT_ALARM = false;
// Slow on purpose: a hidden tab is a background job, and Chrome throttles its
// timers to about a minute anyway once the tab has been away for a while.
const ALERT_BACKGROUND_POLL_MS = 120000;
// How fast the title alternates between the alert and the marker. Fast enough
// to catch the eye in a tab strip, slow enough not to read as a glitch.
const ALERT_TITLE_FLASH_MS = 1400;

// "Since your last visit": per-coin snapshot of the price when this tab
// series was last opened. { COIN: { price, time } }
const LAST_SEEN_KEY = "crypto_chart_last_seen";
// Whether the comparison line is shown under the price (the snapshots are
// kept either way, so turning it back on still has history to compare to)
const LAST_SEEN_ENABLED_KEY = "crypto_chart_last_seen_enabled";
const DEFAULT_LAST_SEEN_ENABLED = true;
// A break this long ends a "visit": the price you last saw before it becomes
// the thing the next visit compares against. Without a gap the anchor stays
// put, so a burst of tabs keeps measuring from the same moment instead of
// resetting to "just now" (which always looked like nothing had happened).
const LAST_SEEN_GAP_MS = 20 * 60 * 1000; // 20 minutes
// Older than this and the comparison stops being interesting
const LAST_SEEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Below this the line would just be noise
const LAST_SEEN_MIN_PCT = 0.05;

// First-run onboarding tour (shown once, then dismissed)
const ONBOARDING_SEEN_KEY = "crypto_chart_onboarding_seen";
// Tracking-only portfolio: [{ coin, amount, paid, address }] manually
// entered, all local (paid = optional total spent on the position, 0 = not
// set; address = optional watched on-chain address, "" = none)
const PORTFOLIO_STORAGE_KEY = "crypto_chart_portfolio";
// On-chain balance watching (optional): the address is only ever sent to the
// balance provider below, and only for coins listed here. mempool.space and
// Blockchair are both already-trusted PriceTab data sources (CORS, no key).
const WATCH_CHAINS = {
  BTC: { provider: "mempool", decimals: 8 },
  // The ether rides in the same JSON-RPC batch as this address's tokens, so
  // watching an Ethereum address is one request to one host — and never to
  // the provider whose anonymous limit answers a burst by blacklisting the
  // whole IP. See the note above `fetchErc20Balances` in api.js.
  ETH: { provider: "eth-rpc", decimals: 18 },
  LTC: { provider: "blockchair", chain: "litecoin", decimals: 8 },
  DOGE: { provider: "blockchair", chain: "dogecoin", decimals: 8 },
  BCH: { provider: "blockchair", chain: "bitcoin-cash", decimals: 8 },
  ZEC: { provider: "blockchair", chain: "zcash", decimals: 8 },
};

/* ERC-20 tokens held by an Ethereum address.
 *
 * Balances are read straight from each token's contract (balanceOf) over a
 * public keyless RPC, not from an indexer's token list. Two reasons: an
 * indexer's ERC-20 dump for a single address ran to 2 MB and reported
 * negative balances for a sixth of the entries, and — more importantly —
 * matching tokens by symbol is unsafe, because anyone can deploy a contract
 * calling itself USDC. Asking a specific contract removes both problems.
 *
 * Every address below was verified against the chain: symbol() and
 * decimals() were called and had to match the entry, so a mistyped address
 * can't ship.
 */
const ERC20_TOKENS = {
  USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  LINK: { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
  SHIB: { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", decimals: 18 },
  MKR: { address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", decimals: 18 },
  GRT: { address: "0xc944E90C64B2c07662A292be6244BDf05Cda44a7", decimals: 18 },
  AAVE: { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", decimals: 18 },
  SAND: { address: "0x3845badAde8e6dFF049820680d1F14bD3903a5d0", decimals: 18 },
  MANA: { address: "0x0F5D2fB29fb7d3CFeE444a200298f468908cC942", decimals: 18 },
  ENS: { address: "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72", decimals: 18 },
  CRV: { address: "0xD533a949740bb3306d119CC777fa900bA034cd52", decimals: 18 },
  COMP: { address: "0xc00e94Cb662C3520282E6f5717214004A7f26888", decimals: 18 },
  SNX: { address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F", decimals: 18 },
  "1INCH": { address: "0x111111111117dC0aa78b770fA6A738034120C302", decimals: 18 },
  BAT: { address: "0x0D8775F648430679A709E98d2b0Cb6250d2887EF", decimals: 18 },
  LDO: { address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", decimals: 18 },
  PEPE: { address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", decimals: 18 },
  GALA: { address: "0xd1d2Eb1B1e90B638588728b4130137D262C87cae", decimals: 8 },
  ILV: { address: "0x767FE9EDC9E0dF98E07454847909b5E959D7ca0E", decimals: 18 },
  BLUR: { address: "0x5283D291DBCF85356A21bA090E6db59121208b44", decimals: 18 },
  IMX: { address: "0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF", decimals: 18 },
  RPL: { address: "0xD33526068D116cE69F19A9ee46F0bd304F21A51f", decimals: 18 },
  QNT: { address: "0x4a220E6096B25EADb88358cb44068A3248254675", decimals: 18 },
  MATIC: { address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", decimals: 18 },
  RNDR: { address: "0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24", decimals: 18 },
  AXS: { address: "0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b", decimals: 18 },
  INJ: { address: "0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30", decimals: 18 },
  ARB: { address: "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1", decimals: 18 },
  CHZ: { address: "0x3506424F91fD33084466F402d5D97f05F8e3b4AF", decimals: 18 },

  /* Added 20 Aug 2026, so that watching an Ethereum address finds more of
   * what is actually in it. Every one was asked what it is before it went in
   * — one batched call of symbol() and decimals() against each contract, 80
   * calls in 125ms — and one candidate was thrown out by that check: the
   * token quoted as TON calls itself TONCOIN, which is the mismatch the rule
   * exists to catch. Chosen from Coinlore's top 100 because that is the sweep
   * the page ticker already makes, so every one of these is priced without a
   * single extra request. */
  WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  STETH: { address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", decimals: 18 },
  DAI: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  UNI: { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  USDE: { address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", decimals: 18 },
  PYUSD: { address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", decimals: 6 },
  PAXG: { address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78", decimals: 18 },
  ONDO: { address: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", decimals: 18 },
  XAUT: { address: "0x68749665FF8D2d112Fa859AA293F07A622782F38", decimals: 6 },
  WBETH: { address: "0xa2E3356610840701BDf5611a53974510Ae27E2e1", decimals: 18 },
  FDUSD: { address: "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409", decimals: 18 },
  TUSD: { address: "0x0000000000085d4780B73119b644AE5ecd22b376", decimals: 18 },
  OKB: { address: "0x75231F58b43240C9718Dd58B4967c5114342a86c", decimals: 18 },
  MNT: { address: "0x3c3a81e81dc49A522A592e7622A7E711c06bf354", decimals: 18 },
  CRO: { address: "0xA0b73E1Ff0B80914AB6fe0444E65848C4C34450b", decimals: 8 },
  ENA: { address: "0x57e114B691Db790C35207b2e685D4A43181e6061", decimals: 18 },
  ETHFI: { address: "0xFe0c30065B384F05761f15d0CC899D4F9F9Cc0eB", decimals: 18 },
  FET: { address: "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85", decimals: 18 },

  /* Added 23 Aug 2026. Same rule as the batch above and the same check —
   * symbol() and decimals() asked of each contract, 16 calls in 133ms, all
   * eight agreeing with the entry. **SPX answers 8 decimals, not 18**, which
   * is the whole reason the check exists: assumed, its balances would have
   * come out ten billion times too large.
   *
   * Chosen the same way too: Ethereum-native tokens inside Coinlore's top 100,
   * so the ticker sweep already prices every one of them and none costs a
   * request. Deliberately **not** bridged or wrapped versions of the L1s this
   * app charts — a bridged SOL on Ethereum is a different asset wearing the
   * same three letters, which is the exact confusion this table exists to
   * prevent. */
  PENDLE: { address: "0x808507121B80c02388fAd14726482e061B8da827", decimals: 18 },
  GNO: { address: "0x6810e776880C02933D47DB1b9fc05908e5386b96", decimals: 18 },
  MORPHO: { address: "0x58D97B57BB95320F9a05dC918Aef65434969c2B2", decimals: 18 },
  NEXO: { address: "0xB62132e35a6c13ee1EE0f84dC5d40bad8d815206", decimals: 18 },
  CBETH: { address: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704", decimals: 18 },
  WLD: { address: "0x163f8C2467924be0ae7B5347228CABF260318753", decimals: 18 },
  SPX: { address: "0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C", decimals: 8 },
  RLUSD: { address: "0x8292Bb45bf1Ee4d140127049757C2E0fF06317eD", decimals: 18 },
};
const ETH_RPC = "https://ethereum-rpc.publicnode.com";
const ERC20_BALANCE_SELECTOR = "0x70a08231"; // balanceOf(address)
// Watchable when the coin is its own chain, or a token on a watched one
const isWatchableCoin = (coin) =>
  Boolean(WATCH_CHAINS[coin] || ERC20_TOKENS[coin]);

/* THE PRICE-ONLY TIER.
 *
 * **Thirty-two coins in Coinlore's top hundred that this app could not
 * track, whose prices it was already downloading and throwing away.**
 * `bulkRefreshPageTickerCache` caches *every* symbol in that one response —
 * it says so where it does it — so a holding in any of them costs no new
 * request, no new host and no permission. Measured 12 Sep 2026: 93 symbols
 * known, **32** of the top 100 unknown. (The first count of that gap said 45,
 * because it compared against `SUGGESTED_COINS` alone and missed the twelve
 * already held as ERC-20 tokens — and then 33, because Coinlore writes `USDe`
 * in mixed case and a case-sensitive comparison made a coin this app already
 * supports look missing. Both are the same mistake in two directions, which is
 * why the list below is upper-cased and the number was re-counted.)
 *
 * **They are holdable and not chartable, which is an existing shape here**,
 * not a new one: stETH, wBETH, FDUSD and TUSD have been exactly that since
 * August, because no exchange this app talks to publishes a *series* for
 * them. That is why these are **not** in `SUGGESTED_COINS`: putting them
 * there would offer thirty-three chart coins that cannot draw a chart, which
 * is the defect `sanitizePortfolio`'s own comment describes. They go into
 * `HOLDABLE_COINS`, so the portfolio's search offers them and its storage
 * keeps them, and nowhere else.
 *
 * **What this tier honestly promises is narrower than a listing**: a price
 * while the coin is in that top-100 sweep. Drop out of it and the row says
 * `—`, which is the same thing the portfolio already says for a holding
 * nothing quotes — and is why the search marks these rows rather than letting
 * somebody discover it later.
 *
 * Symbols are upper-cased here because that is what the cache is keyed by:
 * the sweep calls `.toUpperCase()` on Coinlore's own symbol, so `USDe` is
 * `USDE` in the cache, and a list holding the mixed-case spelling would look
 * up a key that never exists. `tests/test-storage.js` pins that.
 */
const PRICED_ONLY_COINS = [
  "TRX", "HYPE", "TAO", "BFUSD", "WLFI", "BNSOL", "BGB", "ASTER",
  "ETC", "JST", "WBNB", "KAS", "VVV", "RENDER", "DASH", "USDG", "STABLE",
  "KCS", "BDX", "USDD", "AERO", "FLR", "PENGU", "RAY", "VIRTUAL", "TRUMP",
  "AKE", "XDCE", "BCHSV", "FRAX", "LUNC", "DCR",
];

/* Everything the portfolio will accept, which is wider than what can be
 * charted. `sanitizePortfolio` takes `SUGGESTED_COINS` **or** anything
 * `isWatchableCoin` knows, so a search that offered only the first was
 * offering less than the storage layer would keep: stETH, wBETH, FDUSD and
 * TUSD are held at plenty of Ethereum addresses and quoted by the ticker
 * sweep, and neither Coinbase nor Kraken publishes a series for any of them.
 * They arrived by watching an address and could not be typed in. */
const HOLDABLE_COINS = [
  ...SUGGESTED_COINS,
  ...Object.keys(WATCH_CHAINS).filter((c) => !SUGGESTED_COINS.includes(c)),
  ...Object.keys(ERC20_TOKENS).filter((c) => !SUGGESTED_COINS.includes(c)),
  ...PRICED_ONLY_COINS.filter((c) => !SUGGESTED_COINS.includes(c)),
];

/* **One list decides what the portfolio accepts, and the sanitizer reads it.**
 * It used to test `SUGGESTED_COINS.includes(coin) || isWatchableCoin(coin)`,
 * which is this list's definition written a second time — and a second
 * definition is one that goes out of date the moment the first one grows. It
 * did: the price-only tier would have been offered by the search and dropped
 * on the next tab open, silently, which is the exact failure the comment
 * above this list was written about. */
const isHoldableCoin = (coin) => HOLDABLE_COINS.includes(coin);

/* A coin this app can price but not draw. The portfolio's search says so on
 * the row, because finding out afterwards — by adding it and meeting an empty
 * chart note — is finding out too late. */
const isPricedOnlyCoin = (coin) =>
  PRICED_ONLY_COINS.includes(coin) && !SUGGESTED_COINS.includes(coin);

/* Which chain an address belongs to, from its own shape — so pasting one is
 * all it takes; there is nothing for the user to tell us that the address
 * doesn't already say.
 *
 * Order matters where prefixes overlap. Bitcoin Cash's modern cashaddr form
 * is checked before base58, and "3…" is read as Bitcoin: it is valid P2SH on
 * both Bitcoin and Litecoin, but Litecoin has long since moved to "M…", so
 * Bitcoin is the safe reading. A legacy Bitcoin Cash address is genuinely
 * indistinguishable from a Bitcoin one — same format, same checksum — and is
 * treated as Bitcoin for the same reason.
 */
const ADDRESS_PATTERNS = [
  { coin: "ETH", re: /^0[xX][0-9a-fA-F]{40}$/ },
  { coin: "BTC", re: /^bc1[02-9ac-hj-np-z]{11,71}$/i },
  { coin: "LTC", re: /^ltc1[02-9ac-hj-np-z]{11,71}$/i },
  { coin: "BCH", re: /^(bitcoincash:)?[qp][02-9ac-hj-np-z]{41}$/i },
  { coin: "ZEC", re: /^t[13][1-9A-HJ-NP-Za-km-z]{33}$/ },
  { coin: "DOGE", re: /^[DA9][1-9A-HJ-NP-Za-km-z]{25,34}$/ },
  { coin: "LTC", re: /^[LM][1-9A-HJ-NP-Za-km-z]{25,34}$/ },
  { coin: "BTC", re: /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/ },
];

/* Addresses PriceTab can recognise but cannot read.
 *
 * These exist so the panel can tell the truth. Every failure used to arrive as
 * one sentence — "Nothing found for that address — check it, or it may hold no
 * balance we can read" — and for much the most likely case, a perfectly good
 * Solana or TRON address, that sentence is simply wrong: there is nothing to
 * check, and the person is being told to look for a mistake they did not make.
 * Naming the chain costs one regex each and turns a dead end into an answer.
 *
 * Only shapes distinct enough to name. Solana is held at 43-44 base58
 * characters rather than the full 32-44 the encoding allows, because the short
 * end of that range collides with Bitcoin's legacy form; a chain guessed wrong
 * would be worse than no guess at all. Sui and Aptos share one shape — 32
 * bytes of hex — so the message names both rather than picking.
 */
const FOREIGN_ADDRESS_CHAINS = [
  { name: "Solana", re: /^[1-9A-HJ-NP-Za-km-z]{43,44}$/ },
  { name: "TRON", re: /^T[1-9A-HJ-NP-Za-km-z]{33}$/ },
  { name: "XRP", re: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/ },
  { name: "Cardano", re: /^addr1[02-9ac-hj-np-z]{50,}$/i },
  { name: "Cosmos", re: /^cosmos1[02-9ac-hj-np-z]{38}$/i },
  { name: "Monero", re: /^4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}$/ },
  { name: "Stellar", re: /^G[A-Z2-7]{55}$/ },
  { name: "Algorand", re: /^[A-Z2-7]{58}$/ },
  { name: "Polkadot", re: /^1[1-9A-HJ-NP-Za-km-z]{46,47}$/ },
  { name: "Sui or Aptos", re: /^0[xX][0-9a-fA-F]{64}$/ },
  { name: "TON", re: /^[EU]Q[A-Za-z0-9_-]{46}$/ },
  { name: "NEAR", re: /^[a-z0-9._-]{2,62}\.near$/ },
  { name: "Dash", re: /^X[1-9A-HJ-NP-Za-km-z]{33}$/ },
];

const detectForeignChain = (address) => {
  const value = String(address || "").trim();
  for (const { name, re } of FOREIGN_ADDRESS_CHAINS) {
    if (re.test(value)) return name;
  }
  return null;
};

/* Bitcoin Cash writes its address with an optional `bitcoincash:` prefix, and
 * everything downstream of the pattern match wants it gone: `WATCH_ADDRESS_RE`
 * is alphanumeric-only, so a prefixed address matched its chain pattern and
 * was then thrown out by the shape check as if it were nonsense. Copying an
 * address out of most Bitcoin Cash wallets gives you the prefixed form. */
const normalizeWatchAddress = (address) =>
  String(address || "")
    .trim()
    .replace(/^bitcoincash:/i, "");

const detectAddressChain = (address) => {
  const value = String(address || "").trim();
  for (const { coin, re } of ADDRESS_PATTERNS) {
    if (re.test(value)) return coin;
  }
  return null;
};
// Loose shape check only (base58 / bech32 / 0x-hex are all alphanumeric);
// the provider is the real validator — bad addresses just return no balance
const WATCH_ADDRESS_RE = /^[A-Za-z0-9]{20,100}$/;
const WATCH_BALANCE_TTL = 600000; // 10 min per address — be kind to providers
// Purchase lots per holding: [{ amount, paid, time, source }] where paid is
// the total spent on that lot, time is unix seconds (0 = unknown) and source
// is "manual" (typed in) or "chain" (inferred from a watched address, with
// prices estimated from the historical series at each transfer's date)
const MAX_LOTS_PER_HOLDING = 100;
const MAX_SALES_PER_HOLDING = 100;
// A holding can track several addresses side by side (plus its manual part)
const MAX_WATCHES_PER_HOLDING = 10;
// Selected time range for the portfolio value chart
const PORTFOLIO_PERIOD_KEY = "crypto_chart_portfolio_period";

/* Whether the expanded chart draws the total as one line or as the coins it is
 * made of. Persisted because it is a way of reading rather than a one-off
 * question — someone who thinks in composition thinks in it every time. The
 * chart being *open* is not persisted: that is where you are, not how you
 * read, and a portfolio opens on its holdings. */
const PORTFOLIO_STACKED_KEY = "crypto_chart_portfolio_stacked";

/* Which of the three the value chart is showing.
 *
 * It was a boolean — stacked or not — until the P/L view was added on 26 Aug
 * 2026, and the old key is still read so nobody's choice is thrown away:
 * `true` was the by-coin view and `false` was the total.
 *
 * **P/L exists because the value chart cannot show a loss.** The cost level is
 * drawn as a horizontal line, and a line off the top of the scale is not drawn
 * at all: a portfolio worth $4,372 against $12,200 paid renders as a cheerful
 * green wave with nothing on it saying you are down 64%. Re-based so that zero
 * *is* what you paid, the same series answers the question people actually
 * open a portfolio to ask, and the answer is above or below one line. */
const PORTFOLIO_CHART_MODE_KEY = "crypto_chart_portfolio_chart_mode";
/* Four views of one basket, and each answers what the other three cannot:
 * what is it worth (`total`), what is it made of (`bycoin`), am I up
 * (`pnl`), **which holding moved it** (`moved`) and **how far below its own
 * peak it has been** (`drawdown`).
 *
 * `moved` is a ranked bar chart rather than a time series, so it is a separate
 * component. `drawdown` is still a time series — it is the same line measured
 * against its running high — so it is a transform of the data on the way in,
 * exactly as `pnl` is, and the chart itself grows no new branch. */
/* "held" and "mix" since 27 Sep 2026: what was actually held on each day
   against what it had cost by then, and each coin's share of the total
   through the range — see buildHeldParts and mixParts in portfolio.js. */
const PORTFOLIO_CHART_MODES = ["total", "held", "bycoin", "mix", "pnl", "moved", "drawdown", "vsbtc"];
const DEFAULT_PORTFOLIO_CHART_MODE = "total";

/* Holdings order. The list used to render in the order coins were added,
 * which meant the biggest position could sit at the bottom — while the chart
 * behind it was already ranking the same holdings by value to decide which
 * twelve to draw. Value-first is the default because "what is most of my
 * money in" is the question the list is read for. */
const PORTFOLIO_SORT_KEY = "crypto_chart_portfolio_sort";
const DEFAULT_PORTFOLIO_SORT = "value";
const PORTFOLIO_SORT_OPTIONS = [
  { value: "value", label: msg("po_value", "Value") },
  { value: "pl", label: "P/L" },
  { value: "change", label: "24h" },
  { value: "name", label: msg("sort_az", "A–Z") },
];
/* Amounts hidden.
 *
 * Every other portfolio tracker is an app you open on purpose. This one is
 * **the new tab page** — it is what is on the screen when a colleague leans
 * over, when a call starts sharing, when a screenshot of something else is
 * taken. The one thing there is nothing to be done about afterwards is a
 * number that says how much money somebody has.
 *
 * What is hidden is what is *yours*: totals, values, cost, P/L and the
 * quantities held. **Percentages, the shape of the chart and the market price
 * of a coin stay** — none of them is a balance, they are what makes the screen
 * still worth looking at while it is hidden, and a screen that hides
 * everything is one nobody leaves hidden.
 *
 * Persisted, because "never show this by default" is a position about privacy
 * and not a per-visit question. The export files are **never** masked: a CSV
 * of dots is not a backup, and a file is not a screen somebody is standing
 * behind. */
const PORTFOLIO_HIDDEN_KEY = "crypto_chart_portfolio_hidden";
const DEFAULT_PORTFOLIO_HIDDEN = false;

const STORE_LISTING_URL =
  "https://chromewebstore.google.com/detail/pricetab/dobkidjmhpnniiipliollbaefpppalaf";

// Ticker constants
const DEFAULT_TICKER_ENABLED = false;
const DEFAULT_TICKER_FORMAT = "compact"; // 'compact' (43.2K) or 'full' ($43,250)
const TICKER_SCROLL_INTERVAL = 250; // 250ms for smooth scrolling effect
const TICKER_SCROLL_CHARS = 1; // Characters to scroll each interval

// Ticker format options
const TICKER_FORMAT_OPTIONS = [
  { value: "compact", label: msg("ticker_compact", "Compact (43.2K)") },
  { value: "full", label: msg("ticker_full", "Full (43,250)") },
];

// Page ticker constants
const PAGE_TICKER_STORAGE_KEY = "crypto_chart_page_ticker_enabled";
const PAGE_TICKER_POSITION_STORAGE_KEY = "crypto_chart_page_ticker_position";
const PAGE_TICKER_COLLAPSED_STORAGE_KEY = "crypto_chart_page_ticker_collapsed";
const DEFAULT_PAGE_TICKER_ENABLED = false;
const DEFAULT_PAGE_TICKER_POSITION = "bottom"; // 'top' or 'bottom'
const DEFAULT_PAGE_TICKER_COLLAPSED = false;
