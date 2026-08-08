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
};

const PERIOD_OPTIONS = [
  { value: "hour", label: "1H", title: "1 Hour" },
  { value: "day", label: "1D", title: "1 Day" },
  { value: "week", label: "1W", title: "1 Week" },
  { value: "month", label: "1M", title: "1 Month" },
  { value: "year", label: "1Y", title: "1 Year" },
  { value: "all", label: "ALL", title: "All Time" },
];

const REFRESH_INTERVAL_OPTIONS = [
  { value: 10000, label: "10 seconds" },
  { value: 30000, label: "30 seconds" },
  { value: 60000, label: "1 minute" },
  { value: 300000, label: "5 minutes" },
];

const DEFAULT_REFRESH_INTERVAL = 30000; // 30 seconds

const DECIMAL_PLACES_OPTIONS = [
  { value: 2, label: "2 decimals (e.g. $1,234.56)" },
  { value: 4, label: "4 decimals (e.g. $1,234.5678)" },
  { value: 6, label: "6 decimals (e.g. $0.001234)" },
  { value: 8, label: "8 decimals (e.g. $0.00001234)" },
];

const SEPARATOR_FORMAT_OPTIONS = [
  { value: "us", label: "US Format (1,234.56)" },
  { value: "eu", label: "EU Format (1.234,56)" },
  { value: "space", label: "Space Format (1 234.56)" },
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
const DEFAULT_SEPARATOR_FORMAT = "us";
const DEFAULT_CURRENCY = "USD";

// Helper to get currency symbol
const getCurrencySymbol = (currencyCode) => {
  const currency = CURRENCY_OPTIONS.find((c) => c.value === currencyCode);
  return currency ? currency.symbol : "$";
};

/* LOCALSTORAGE */
const STORAGE_KEY = "crypto_chart_coin_options";
const THEME_STORAGE_KEY = "crypto_chart_theme";
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
// News sources — no-auth + CORS-enabled (verified). Most other crypto news
// APIs (CryptoCompare, CoinGecko, Messari, CryptoPanic) require keys, and RSS
// feeds (CoinDesk, Decrypt, Cointelegraph, ...) don't send CORS headers, so
// the browser blocks them — Blockchair + Hacker News (below) are the only
// viable in-extension feeds.
const NEWS_API_URL = "https://api.blockchair.com/news?q=language(en)&limit=40";
const MAX_NEWS_ITEMS = 50;
// Hacker News via Algolia — the only other CORS-enabled, no-key news source
// found (X/Twitter, Reddit, Nitter, Stacker News all block extension origins).
// Algolia ANDs multi-word queries, so each term is queried separately.
const HN_NEWS_API = "https://hn.algolia.com/api/v1/search";
const HN_NEWS_TERMS = ["bitcoin", "ethereum", "crypto"];
const HN_NEWS_MIN_POINTS = 30; // well-upvoted stories only
const HN_NEWS_MAX_AGE_S = 7 * 86400; // past week
const HN_NEWS_MAX_ITEMS = 8;
// Low-signal SEO/promo headlines dropped from the ticker regardless of source
const NEWS_SPAM_RE =
  /price (prediction|analysis)|presale|pre-sale|best (coins?|cryptos?) to buy|casino|airdrop|giveaway|sponsored/i;
const AUTO_ROTATE_STORAGE_KEY = "crypto_chart_auto_rotate";
const AUTO_ROTATE_INTERVAL_STORAGE_KEY = "crypto_chart_auto_rotate_interval";
const DEFAULT_AUTO_ROTATE = false;
const DEFAULT_AUTO_ROTATE_INTERVAL = 30000;
const AUTO_ROTATE_OPTIONS = [
  { value: 10000, label: "Every 10 seconds" },
  { value: 30000, label: "Every 30 seconds" },
  { value: 60000, label: "Every minute" },
  { value: 300000, label: "Every 5 minutes" },
  { value: 900000, label: "Every 15 minutes" },
];
const RATE_PROMPT_DISMISSED_KEY = "crypto_chart_rate_prompt_dismissed";
// Main-screen rating ask: shown once after ~2 days of use, then never again
const FIRST_USE_KEY = "crypto_chart_first_use";
const RATE_PROMPT_SHOWN_KEY = "crypto_chart_rate_prompt_shown";
const RATE_PROMPT_DELAY_MS = 2 * 24 * 60 * 60 * 1000;
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
};
const providerFor = (coin) => COIN_PROVIDERS[coin] || "coinbase";

const KRAKEN_API = "https://api.kraken.com/0/public/";
// Kraken returns at most 720 candles; the interval per period is chosen so
// one request covers the whole window, and the tail is sliced to size.
const KRAKEN_PERIODS = {
  hour: { interval: 1, points: 60 },
  day: { interval: 5, points: 288 },
  week: { interval: 60, points: 168 },
  month: { interval: 240, points: 180 },
  year: { interval: 1440, points: 365 },
  all: { interval: 21600, points: 720 },
};

/* OHLC candles for the chart crosshair (open/high/low/close/volume).
 * Coinbase Exchange serves 350 candles per request, CORS-enabled and
 * keyless. Granularity is picked so one request covers the period:
 *   1H → 1m (60), 1D → 5m (288), 1W → 1h (168), 1M → 6h (120),
 *   1Y → 1d (350 of 365 days — the first ~2 weeks fall outside)
 * ALL spans years, so no granularity covers it: those charts keep the
 * price-only readout instead of showing candles for a fraction of the range.
 */
const OHLC_GRANULARITY = {
  hour: 60,
  day: 300,
  week: 3600,
  month: 21600,
  year: 86400,
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

// Price alerts (in-tab only — no `notifications` permission, so PriceTab
// stays a zero-permission extension). [{ id, coin, direction, target,
// currency, created, triggeredAt }]
const ALERTS_STORAGE_KEY = "crypto_chart_alerts";
const MAX_ALERTS = 10;

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
  ETH: { provider: "blockchair", chain: "ethereum", decimals: 18 },
  LTC: { provider: "blockchair", chain: "litecoin", decimals: 8 },
  DOGE: { provider: "blockchair", chain: "dogecoin", decimals: 8 },
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
// A holding can track several addresses side by side (plus its manual part)
const MAX_WATCHES_PER_HOLDING = 10;
// Selected time range for the portfolio background value chart
const PORTFOLIO_PERIOD_KEY = "crypto_chart_portfolio_period";
const STORE_LISTING_URL =
  "https://chromewebstore.google.com/detail/pricetab/dobkidjmhpnniiipliollbaefpppalaf";

// Ticker constants
const DEFAULT_TICKER_ENABLED = false;
const DEFAULT_TICKER_FORMAT = "compact"; // 'compact' (43.2K) or 'full' ($43,250)
const TICKER_SCROLL_INTERVAL = 250; // 250ms for smooth scrolling effect
const TICKER_SCROLL_CHARS = 1; // Characters to scroll each interval

// Ticker format options
const TICKER_FORMAT_OPTIONS = [
  { value: "compact", label: "Compact (43.2K)" },
  { value: "full", label: "Full ($43,250)" },
];

// Page ticker constants
const PAGE_TICKER_STORAGE_KEY = "crypto_chart_page_ticker_enabled";
const PAGE_TICKER_POSITION_STORAGE_KEY = "crypto_chart_page_ticker_position";
const PAGE_TICKER_COLLAPSED_STORAGE_KEY = "crypto_chart_page_ticker_collapsed";
const DEFAULT_PAGE_TICKER_ENABLED = false;
const DEFAULT_PAGE_TICKER_POSITION = "bottom"; // 'top' or 'bottom'
const DEFAULT_PAGE_TICKER_COLLAPSED = false;

