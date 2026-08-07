const DEFAULT_COIN_OPTIONS = ["BTC", "ETH", "XRP", "LTC"];

// Only coins Coinbase actually serves at {COIN}-USD via the public price API.
// Pairs that 404 (TRX, OKB, THETA, FTM, DYDX, KAS, GMX, XDC, NEO, FXS, RUNE,
// CELO, AGIX, WOO, CFX, ORDI) were removed — they only produced console errors.
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

