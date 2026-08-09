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
};
const ETH_RPC = "https://ethereum-rpc.publicnode.com";
const ERC20_BALANCE_SELECTOR = "0x70a08231"; // balanceOf(address)
// Watchable when the coin is its own chain, or a token on a watched one
const isWatchableCoin = (coin) =>
  Boolean(WATCH_CHAINS[coin] || ERC20_TOKENS[coin]);

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

