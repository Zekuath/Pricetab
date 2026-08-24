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
};

const PERIOD_OPTIONS = [
  { value: "hour", label: "1H", title: "1 Hour" },
  { value: "day", label: "1D", title: "1 Day" },
  { value: "week", label: "1W", title: "1 Week" },
  { value: "month", label: "1M", title: "1 Month" },
  { value: "year", label: "1Y", title: "1 Year" },
  { value: "all", label: "ALL", title: "All Time" },
];

/* Backing off a provider that keeps refusing. Doubling from the refresh
 * interval, capped: at the default 30s that is 60s, 2m, 4m, then 5m. Five
 * minutes is short enough that a tab nobody is watching recovers on its own,
 * and the moment somebody *is* watching, the visibility handler refetches
 * without waiting for it. */
const FETCH_BACKOFF_STEPS = 5;
const FETCH_BACKOFF_MAX_MS = 300000; // 5 minutes

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
  { value: "all", label: "Everything" },
  { value: "coins", label: "My coins" },
  { value: "portfolio", label: "What I hold" },
];
const MAX_NEWS_ITEMS = 50;

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
   * 1 of 30, MarketWatch 1 of 10.
   *
   * All three are `cryptoOnly` for the reason BBC Business is: they are
   * finance desks, not crypto desks, and an unfiltered markets feed in a
   * crypto news panel reads as a bug. */
  { id: "hn", name: "Hacker News", kind: "hn", optional: false },
  {
    id: "yahoo",
    name: "Yahoo Finance",
    kind: "rss",
    url: "https://finance.yahoo.com/news/rssindex",
    optional: false,
    cryptoOnly: true,
  },
  {
    id: "cnbc",
    name: "CNBC",
    kind: "rss",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664",
    optional: false,
    cryptoOnly: true,
  },
  {
    id: "marketwatch",
    name: "MarketWatch",
    kind: "rss",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    optional: false,
    cryptoOnly: true,
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
     * `categories_exclude=39` is this outlet's own `press-releases` category.
     * Filtering server-side is the strongest form of this available: the
     * advertising is never fetched, never parsed, and never has to be
     * recognised by a rule of ours. It cost nothing — no extra request, no
     * extra bytes. (39 was empty the week this was added; the category exists
     * and will not stay empty.) */
    url: "https://bitcoinmagazine.com/wp-json/wp/v2/posts?per_page=20&categories_exclude=39&_fields=title,link,date_gmt",
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
    url: "https://coinjournal.net/wp-json/wp/v2/posts?per_page=20&categories_exclude=40&_fields=title,link,date_gmt",
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
  /\/(press-releases?|sponsored|sponsored-content|partner-content|advertorial|paid-content|paid-post)\//i;

/* The byline gives it away too, and earlier than the path does: press releases
 * are distributed by wire services, and the wire signs them. CryptoSlate's
 * promo section is written by `chainwire` and `cs-press-release` — measured,
 * 12 of 12 items on its press-releases page. Compared with the byline stripped
 * to letters, so "Chainwire", "chainwire" and "CS Press Release" are one
 * pattern rather than three. */
const NEWS_WIRE_RE =
  /(chainwire|globenewswire|businesswire|accesswire|prnewswire|pressrelease|sponsored)/i;

// Low-signal SEO/promo headlines — the last of the three, and the weakest
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
    title: "First in, first out",
    note: "The oldest purchase is sold first. The default nearly everywhere, and the only method some countries accept.",
  },
  {
    value: "lifo",
    label: "LIFO",
    title: "Last in, first out",
    note: "The newest purchase is sold first. Allowed in some places and not others — check yours.",
  },
  {
    value: "hifo",
    label: "HIFO",
    title: "Highest in, first out",
    note: "The most expensive purchase is sold first, which reports the smallest gain. Not accepted everywhere.",
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
// How long the scale takes to travel when it changes. Long enough to see which
// way it went and what happened to the boxes; short enough not to be a wait.
const BOARD_ZOOM_MS = 260;

/* Quiet controls: the corner buttons rest almost invisible and come up under
 * the pointer. Nothing is hidden and nothing becomes unclickable — a control
 * you cannot see but can still press is a trap, so they fade to a ghost rather
 * than to nothing, and each one lights up on hover and on keyboard focus. */
const QUIET_CHROME_KEY = "crypto_chart_quiet_chrome";
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
];

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

/* Holdings order. The list used to render in the order coins were added,
 * which meant the biggest position could sit at the bottom — while the chart
 * behind it was already ranking the same holdings by value to decide which
 * twelve to draw. Value-first is the default because "what is most of my
 * money in" is the question the list is read for. */
const PORTFOLIO_SORT_KEY = "crypto_chart_portfolio_sort";
const DEFAULT_PORTFOLIO_SORT = "value";
const PORTFOLIO_SORT_OPTIONS = [
  { value: "value", label: "Value" },
  { value: "pl", label: "P/L" },
  { value: "change", label: "24h" },
  { value: "name", label: "A–Z" },
];
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

