function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    obj[key] = value;
  }
  return obj;
}

/* IMPORTS */
const { Component, createRef, Fragment, PureComponent } = React;
const {
  css,
  injectGlobal,
  keyframes,
  ThemeProvider,
  withTheme,
  default: styled,
} = window.styled;
const {
  easeCubicOut,
  extent,
  interpolatePath,
  line,
  scaleLinear,
  scaleTime,
  select,
} = d3;

/* THEME */
const PIXEL_SCALE = 4;
const scale = PIXEL_SCALE / 16;

const breakpoint = {
  up: { xl: 1440, lg: 1024, md: 768, sm: 576 },
  down: { lg: 1439, md: 1023, sm: 767, xs: 575 },
};

// Theme colors for light and dark modes
const lightColors = {
  bg: "#ffffff",
  bgSecondary: "#f5f5f5",
  text: "#1a1a1a",
  textSecondary: "#666666",
  border: "rgba(0, 0, 0, 0.12)",
  borderHover: "rgba(0, 0, 0, 0.25)",
  chartLine: "#3b82f6",
  chartLineGreen: "#10b981",
  chartLineRed: "#ef4444",
  shadow: "rgba(0, 0, 0, 0.1)",
};

const darkColors = {
  bg: "#000000",
  bgSecondary: "#1a1a1a",
  text: "#ffffff",
  textSecondary: "#a0a0a0",
  border: "rgba(255, 255, 255, 0.12)",
  borderHover: "rgba(255, 255, 255, 0.25)",
  chartLine: "#60a5fa",
  chartLineGreen: "#34d399",
  chartLineRed: "#f87171",
  shadow: "rgba(0, 0, 0, 0.5)",
};

const color = darkColors; // Default to dark (will be overridden by theme context)

const font = {
  primary: `'Roboto Mono', monospace`,
};

const fontWeight = {
  black: "900",
  bold: "700",
  semibold: "600",
  medium: "500",
  regular: "400",
  light: "300",
  extralight: "200",
};

const spacing = {
  xsmall: scale,
  small: scale * 2,
  medium: scale * 4,
  large: scale * 8,
  xlarge: scale * 16,
};

const theme = {
  breakpoint,
  color,
  font,
  fontWeight,
  scale,
  spacing,
};

/* API CONSTANTS */
const API_BASE = "https://www.coinbase.com/api/v2/prices/";
const API_HISTORY = "historic?period=";
const API_SPOT = "spot";

/* WIDGET API ENDPOINTS */
const FEAR_GREED_API = "https://api.alternative.me/fng/?limit=1";
const COINGECKO_GLOBAL_API = "https://api.coingecko.com/api/v3/global";
const MEMPOOL_API = "https://mempool.space/api/blocks/tip/height";

/* FEAR & GREED GAUGE CONSTANTS */
const GAUGE_ARC = "M 12 50 A 38 38 0 0 1 88 50";
const GAUGE_LEN = Math.PI * 38; // semicircle arc length ≈ 119.38
const GAUGE_SEGS = [
  { color: "#ea3943", len: GAUGE_LEN * 0.25, offset: 0 },
  { color: "#f5a623", len: GAUGE_LEN * 0.2, offset: GAUGE_LEN * 0.25 },
  { color: "#c9c9c9", len: GAUGE_LEN * 0.1, offset: GAUGE_LEN * 0.45 },
  { color: "#93d572", len: GAUGE_LEN * 0.2, offset: GAUGE_LEN * 0.55 },
  { color: "#16c784", len: GAUGE_LEN * 0.25, offset: GAUGE_LEN * 0.75 },
];

/* WIDGET CACHE TTL */
const WIDGET_CACHE_TTL = {
  fearGreed: 3600000, // 1 hour (updates every 12h, so 1h cache is fine)
  marketOverview: 300000, // 5 minutes
  halvingCountdown: 3600000, // 1 hour (block height changes slowly)
};

/* RETRY MECHANISM WITH CANCELLATION SUPPORT */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* CACHE MANAGEMENT */
const CACHE_TTL = 30000; // 30 seconds cache lifetime
const CACHE_CLEANUP_INTERVAL = 600000; // 10 minutes
const MAX_CACHED_COINS = 10; // Only cache first 10 coins in rotation
const MAX_COINS = 20; // Hard limit on coin list size
const cache = new Map();

const getCacheKey = (coin, period, currency) => `${coin}-${period}-${currency}`;

const getCachedData = (coin, period, currency, type) => {
  const key = `${getCacheKey(coin, period, currency)}-${type}`;
  const cached = cache.get(key);

  if (!cached) {
    return null;
  }

  const now = Date.now();
  const age = now - cached.timestamp;

  // Update last accessed time
  cached.lastAccessed = now;

  // Return cached data with age info
  return {
    data: cached.data,
    age: age,
    isStale: age > CACHE_TTL,
  };
};

const setCachedData = (
  coin,
  period,
  currency,
  type,
  data,
  allowedCoins = [],
) => {
  // Only cache if coin is in the first 10 of user's rotation
  const coinIndex = allowedCoins.indexOf(coin);

  if (coinIndex === -1 || coinIndex >= MAX_CACHED_COINS) {
    return; // Don't cache this coin
  }

  const key = `${getCacheKey(coin, period, currency)}-${type}`;
  const now = Date.now();

  cache.set(key, {
    data: data,
    timestamp: now,
    lastAccessed: now,
  });
};

// Cleanup stale cache entries (unused for 10+ minutes)
const cleanupCache = () => {
  const now = Date.now();
  const keysToDelete = [];

  cache.forEach((value, key) => {
    const timeSinceAccess = now - value.lastAccessed;
    if (timeSinceAccess > CACHE_CLEANUP_INTERVAL) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => cache.delete(key));
};

const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on server errors (5xx) but not on client errors (4xx)
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }

      // Retry on 429 (Too Many Requests)
      if (response.status === 429) {
        throw new Error("Rate limited");
      }

      // If response is ok or client error (4xx), return it
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      throw new Error(`HTTP error: ${response.status}`);
    } catch (error) {
      lastError = error;

      // Don't retry if request was aborted
      if (error.name === "AbortError") {
        throw error;
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Only retry on network errors or retryable HTTP errors
      const isRetryable =
        error.name === "TypeError" || // Network error
        error.message.includes("Server error") ||
        error.message.includes("Rate limited");

      if (!isRetryable) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s
      const delayMs = Math.pow(2, attempt) * 1000;
      await sleep(delayMs);
    }
  }

  throw lastError;
};

/* WIDGET DATA FETCHERS */
const widgetCache = new Map();

const getWidgetCache = (key) => {
  const cached = widgetCache.get(key);
  if (!cached) return null;

  const ttl = WIDGET_CACHE_TTL[key] || 300000;
  if (Date.now() - cached.timestamp > ttl) {
    return null; // Expired
  }
  return cached.data;
};

const setWidgetCache = (key, data) => {
  widgetCache.set(key, { data, timestamp: Date.now() });
};

const fetchFearGreedIndex = async () => {
  const cached = getWidgetCache("fearGreed");
  if (cached) return cached;

  try {
    const response = await fetch(FEAR_GREED_API);
    if (!response.ok) throw new Error("Fear & Greed API error");

    const json = await response.json();
    const data = {
      value: parseInt(json.data[0].value, 10),
      classification: json.data[0].value_classification,
      timestamp: json.data[0].timestamp,
    };

    setWidgetCache("fearGreed", data);
    return data;
  } catch (e) {
    return null;
  }
};

const fetchMarketOverview = async () => {
  const cached = getWidgetCache("marketOverview");
  if (cached) return cached;

  try {
    const response = await fetch(COINGECKO_GLOBAL_API);
    if (!response.ok) throw new Error("CoinGecko API error");

    const json = await response.json();
    const data = {
      totalMarketCap: json.data.total_market_cap.usd,
      totalVolume: json.data.total_volume.usd,
      btcDominance: json.data.market_cap_percentage.btc,
      ethDominance: json.data.market_cap_percentage.eth,
      marketCapChange24h: json.data.market_cap_change_percentage_24h_usd,
    };

    setWidgetCache("marketOverview", data);
    return data;
  } catch (e) {
    return null;
  }
};

const fetchHalvingData = async () => {
  const cached = getWidgetCache("halvingCountdown");
  if (cached) return cached;

  try {
    const response = await fetch(MEMPOOL_API);
    if (!response.ok) throw new Error("Mempool API error");

    const blockHeight = await response.json();
    const HALVING_INTERVAL = 210000;
    const nextHalvingBlock =
      Math.ceil((blockHeight + 1) / HALVING_INTERVAL) * HALVING_INTERVAL;
    const blocksLeft = nextHalvingBlock - blockHeight;
    const secondsLeft = blocksLeft * 600; // ~10 minutes/block

    const days = Math.floor(secondsLeft / 86400);
    const hours = Math.floor((secondsLeft % 86400) / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    const years = Math.floor(days / 365);
    const remainingDays = days % 365;

    const etaMs = Date.now() + secondsLeft * 1000;
    const etaDate = new Date(etaMs);
    const MONTHS = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const etaFormatted =
      etaDate.getUTCDate() +
      " " +
      MONTHS[etaDate.getUTCMonth()] +
      " " +
      etaDate.getUTCFullYear() +
      ", " +
      String(etaDate.getUTCHours()).padStart(2, "0") +
      ":" +
      String(etaDate.getUTCMinutes()).padStart(2, "0") +
      " UTC";

    const progressPercent = Math.round(
      ((HALVING_INTERVAL - blocksLeft) / HALVING_INTERVAL) * 100,
    );
    const data = {
      days,
      hours,
      minutes,
      years,
      remainingDays,
      etaFormatted,
      blocksLeft,
      nextHalvingBlock,
      progressPercent,
    };
    setWidgetCache("halvingCountdown", data);
    return data;
  } catch (e) {
    return null;
  }
};

const DEFAULT_COIN_OPTIONS = ["BTC", "ETH", "XRP", "LTC"];

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
  "TRX",
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
  "OKB",
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
  "THETA",
  "AXS",
  "RNDR",
  "FTM",
  "RPL",
  "OP",
  "DYDX",
  "KAS",
  "TIA",
  "INJ",
  "GMX",
  "XDC",
  "ENS",
  "NEO",
  "ZEC",
  "KSM",
  "CHZ",
  "CAKE",
  "CRV",
  "FXS",
  "COMP",
  "SNX",
  "RUNE",
  "1INCH",
  "BAT",
  "KAVA",
  "CELO",
  "MINA",
  "LDO",
  "SUI",
  "AGIX",
  "PEPE",
  "SEI",
  "WOO",
  "GALA",
  "ILV",
  "CFX",
  "BLUR",
  "PYTH",
  "ORDI",
];

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
const CURRENCY_STORAGE_KEY = "crypto_chart_currency";
const TICKER_STORAGE_KEY = "crypto_chart_ticker_enabled";
const TICKER_FORMAT_STORAGE_KEY = "crypto_chart_ticker_format";

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

// Theme helper functions
const loadThemeFromStorage = () => {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme && ["auto", "light", "dark"].includes(savedTheme)) {
      return savedTheme;
    }
    return "auto"; // Default to auto
  } catch (error) {
    return "auto";
  }
};

const saveThemeToStorage = (theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // Silently fail
  }
};

const getSystemTheme = () => {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
};

const getActiveTheme = (themePreference) => {
  if (themePreference === "auto") {
    return getSystemTheme();
  }
  return themePreference;
};

// Refresh interval helper functions
const loadRefreshIntervalFromStorage = () => {
  try {
    const saved = localStorage.getItem(REFRESH_INTERVAL_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      // Validate it's one of our valid options
      const isValid = REFRESH_INTERVAL_OPTIONS.some(
        (opt) => opt.value === parsed,
      );
      if (isValid) {
        return parsed;
      }
    }
    return DEFAULT_REFRESH_INTERVAL;
  } catch (error) {
    return DEFAULT_REFRESH_INTERVAL;
  }
};

const saveRefreshIntervalToStorage = (interval) => {
  try {
    localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, interval.toString());
  } catch (error) {
    // Silently fail
  }
};

// Number format helper functions
const loadDecimalPlacesFromStorage = () => {
  try {
    const saved = localStorage.getItem(DECIMAL_PLACES_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      const isValid = DECIMAL_PLACES_OPTIONS.some(
        (opt) => opt.value === parsed,
      );
      if (isValid) {
        return parsed;
      }
    }
    return DEFAULT_DECIMAL_PLACES;
  } catch (error) {
    return DEFAULT_DECIMAL_PLACES;
  }
};

const saveDecimalPlacesToStorage = (places) => {
  try {
    localStorage.setItem(DECIMAL_PLACES_STORAGE_KEY, places.toString());
  } catch (error) {
    // Silently fail
  }
};

const loadSeparatorFormatFromStorage = () => {
  try {
    const saved = localStorage.getItem(SEPARATOR_FORMAT_STORAGE_KEY);
    if (saved && ["us", "eu", "space"].includes(saved)) {
      return saved;
    }
    return DEFAULT_SEPARATOR_FORMAT;
  } catch (error) {
    return DEFAULT_SEPARATOR_FORMAT;
  }
};

const saveSeparatorFormatToStorage = (format) => {
  try {
    localStorage.setItem(SEPARATOR_FORMAT_STORAGE_KEY, format);
  } catch (error) {
    // Silently fail
  }
};

// Currency helper functions
const loadCurrencyFromStorage = () => {
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved && CURRENCY_OPTIONS.some((opt) => opt.value === saved)) {
      return saved;
    }
    return DEFAULT_CURRENCY;
  } catch (error) {
    return DEFAULT_CURRENCY;
  }
};

const saveCurrencyToStorage = (currency) => {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch (error) {
    // Silently fail
  }
};

// Ticker helper functions
const loadTickerFromStorage = () => {
  try {
    const saved = localStorage.getItem(TICKER_STORAGE_KEY);
    if (saved !== null) {
      return saved === "true";
    }
    return DEFAULT_TICKER_ENABLED;
  } catch (error) {
    return DEFAULT_TICKER_ENABLED;
  }
};

const saveTickerToStorage = (enabled) => {
  try {
    localStorage.setItem(TICKER_STORAGE_KEY, enabled.toString());
  } catch (error) {
    // Silently fail
  }
};

const loadTickerFormatFromStorage = () => {
  try {
    const saved = localStorage.getItem(TICKER_FORMAT_STORAGE_KEY);
    if (saved && TICKER_FORMAT_OPTIONS.some((opt) => opt.value === saved)) {
      return saved;
    }
    return DEFAULT_TICKER_FORMAT;
  } catch (error) {
    return DEFAULT_TICKER_FORMAT;
  }
};

const saveTickerFormatToStorage = (format) => {
  try {
    localStorage.setItem(TICKER_FORMAT_STORAGE_KEY, format);
  } catch (error) {
    // Silently fail
  }
};

/* WIDGET SETTINGS STORAGE */
const WIDGETS_STORAGE_KEY = "crypto_chart_widgets";
const HIDDEN_WIDGETS_KEY = "crypto_chart_hidden_widgets";

const loadHiddenWidgetsFromStorage = () => {
  try {
    const saved = localStorage.getItem(HIDDEN_WIDGETS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    return {};
  }
};

const saveHiddenWidgetsToStorage = (hidden) => {
  try {
    localStorage.setItem(HIDDEN_WIDGETS_KEY, JSON.stringify(hidden));
  } catch (error) {
    // Silently fail
  }
};

const DEFAULT_WIDGETS = {
  fearGreed: false,
  marketOverview: false,
  halvingCountdown: false,
  rsiWidget: false,
  fundingRate: false,
  longShortRatio: false,
  openInterest: false,
  liquidations: false,
  altcoinSeason: false,
};

const loadWidgetsFromStorage = () => {
  try {
    const saved = localStorage.getItem(WIDGETS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_WIDGETS, ...parsed };
    }
    return DEFAULT_WIDGETS;
  } catch (error) {
    return DEFAULT_WIDGETS;
  }
};

const saveWidgetsToStorage = (widgets) => {
  try {
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(widgets));
  } catch (error) {
    // Silently fail
  }
};

/* ── COINGLASS / BINANCE WIDGET FETCHERS ─────────────────────────────── */
const BINANCE_FUTURES = "https://fapi.binance.com";
const COINGLASS_BASE  = "https://open-api.coinglass.com/public/v2";

const formatWidgetUsd = (n) => {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
};

const fetchFundingRate = async (coin) => {
  try {
    const symbol = coin + "USDT";
    const res = await fetch(
      `${BINANCE_FUTURES}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    const rate = parseFloat(data[0].fundingRate);
    return {
      rate,
      percent: (rate * 100).toFixed(4),
      annualized: (rate * 3 * 365 * 100).toFixed(2),
    };
  } catch (e) {
    return null;
  }
};

const fetchLongShortRatio = async (coin) => {
  try {
    const symbol = coin + "USDT";
    const res = await fetch(
      `${BINANCE_FUTURES}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    const longPct = (parseFloat(data[0].longAccount) * 100).toFixed(1);
    const shortPct = (parseFloat(data[0].shortAccount) * 100).toFixed(1);
    return { longPct, shortPct };
  } catch (e) {
    return null;
  }
};

const fetchOpenInterest = async (coin) => {
  try {
    const symbol = coin + "USDT";
    const [oiRes, priceRes] = await Promise.all([
      fetch(`${BINANCE_FUTURES}/fapi/v1/openInterest?symbol=${symbol}`),
      fetch(`${BINANCE_FUTURES}/fapi/v1/ticker/price?symbol=${symbol}`),
    ]);
    if (!oiRes.ok || !priceRes.ok) return null;
    const oiData = await oiRes.json();
    const priceData = await priceRes.json();
    const oi = parseFloat(oiData.openInterest);
    const price = parseFloat(priceData.price);
    const oiUsd = oi * price;
    return { oiUsd, formatted: formatWidgetUsd(oiUsd) };
  } catch (e) {
    return null;
  }
};

const fetchLiquidations = async (coin) => {
  try {
    // OKX public liquidation endpoint — no auth required
    const uly = coin + "-USDT";
    const res = await fetch(
      `https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&state=filled&uly=${uly}&limit=100`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || json.code !== "0" || !Array.isArray(json.data)) return null;
    const cutoff = Date.now() - 86400000; // 24h ago
    let longLiq = 0;
    let shortLiq = 0;
    json.data.forEach((order) => {
      (order.details || []).forEach((det) => {
        if (parseInt(det.ts) < cutoff) return;
        const val = parseFloat(det.sz) * parseFloat(det.bkPx);
        if (det.posSide === "long") longLiq += val;
        else shortLiq += val;
      });
    });
    const total = longLiq + shortLiq;
    if (total === 0) return null;
    return {
      total,
      longLiq,
      shortLiq,
      totalFormatted: formatWidgetUsd(total),
      longFormatted: formatWidgetUsd(longLiq),
      shortFormatted: formatWidgetUsd(shortLiq),
      longPct: Math.round((longLiq / total) * 100),
    };
  } catch (e) {
    return null;
  }
};

const STABLE_SYMBOLS = new Set([
  "USDT","USDC","BUSD","DAI","TUSD","USDP","FRAX","LUSD","GUSD","USDD","USDE","FDUSD",
]);

const fetchAltcoinSeason = async () => {
  try {
    // CoinGecko global endpoint — free, no auth needed
    const res = await fetch("https://api.coingecko.com/api/v3/global");
    if (!res.ok) return null;
    const json = await res.json();
    const dom = json.data.market_cap_percentage.btc;
    // Map BTC dominance to 0-100 alt season index
    // dom ≥ 65% → index ~0 (BTC Season), dom ≤ 40% → index ~100 (Alt Season)
    const index = Math.round(Math.max(0, Math.min(100, ((65 - dom) / 25) * 100)));
    let label;
    if (index >= 75) label = "Altcoin Season";
    else if (index <= 25) label = "BTC Season";
    else label = "Neutral";
    return { index, label, btcDom: dom.toFixed(1) };
  } catch (e) {
    return null;
  }
};

const WIDGET_ORDER_KEY = "crypto_chart_widget_order";
const DEFAULT_WIDGET_ORDER = [
  "fearGreed",
  "marketOverview",
  "halvingCountdown",
  "rsiWidget",
  "fundingRate",
  "longShortRatio",
  "openInterest",
  "liquidations",
  "altcoinSeason",
];

const loadWidgetOrderFromStorage = () => {
  try {
    const saved = localStorage.getItem(WIDGET_ORDER_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const valid = parsed.filter((k) => DEFAULT_WIDGET_ORDER.includes(k));
      const extra = DEFAULT_WIDGET_ORDER.filter((k) => !valid.includes(k));
      return [...valid, ...extra];
    }
    return [...DEFAULT_WIDGET_ORDER];
  } catch (e) {
    return [...DEFAULT_WIDGET_ORDER];
  }
};

const saveWidgetOrderToStorage = (order) => {
  try {
    localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(order));
  } catch (e) {}
};

// Format price for ticker (compact or full)
const formatTickerPrice = (
  price,
  currencySymbol,
  format,
  decimalPlaces,
  separatorFormat,
) => {
  if (typeof price !== "number" || isNaN(price)) {
    return "—";
  }

  if (format === "compact") {
    // Compact format: 43.2K, 1.5M, etc.
    const absPrice = Math.abs(price);
    let formatted;
    if (absPrice >= 1000000) {
      formatted = (price / 1000000).toFixed(2) + "M";
    } else if (absPrice >= 1000) {
      formatted = (price / 1000).toFixed(1) + "K";
    } else if (absPrice >= 1) {
      formatted = price.toFixed(2);
    } else {
      formatted = price.toFixed(4);
    }
    return formatted;
  } else {
    // Full format with currency symbol
    return formatNumberString(
      price,
      currencySymbol,
      true,
      false,
      decimalPlaces,
      separatorFormat,
    );
  }
};

const loadCoinOptionsFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Validate coins against whitelist and limit to 20
        const validCoins = parsed
          .filter(
            (coin) =>
              typeof coin === "string" &&
              SUGGESTED_COINS.includes(coin.toUpperCase()),
          )
          .map((coin) => coin.toUpperCase())
          .slice(0, 20);

        if (validCoins.length > 0) {
          return validCoins;
        }
      }
    }
  } catch (e) {
    // Silently fail
  }
  return DEFAULT_COIN_OPTIONS.slice();
};

const saveCoinOptionsToStorage = (coinOptions) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(coinOptions));
  } catch (e) {
    // Silently fail
  }
};

/* TAB TITLE UPDATE */
const updateTabTitle = (coinOptions, coinIndex, currentValue, valueHistory) => {
  try {
    if (!coinOptions || coinOptions.length === 0) {
      document.title = "New Tab";
      return;
    }

    const activeCoin = coinOptions[coinIndex] || coinOptions[0];

    if (typeof currentValue === "number" && activeCoin) {
      const formattedPrice = formatNumberString(currentValue, "$", true);

      // Calculate percentage change
      const percentDelta = derivePercentDelta(currentValue, valueHistory);
      let percentStr = "";

      if (typeof percentDelta === "number") {
        const sign = percentDelta >= 0 ? "+" : "";
        percentStr = ` (${sign}${percentDelta.toFixed(2)}%)`;
      }

      document.title = `${activeCoin} ${formattedPrice}${percentStr}`;
    } else {
      document.title = activeCoin;
    }
  } catch (e) {
    document.title = "New Tab";
  }
};

/* MEMOIZATION HELPER */
const memoize = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    // Limit cache size to prevent memory leaks
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    return result;
  };
};

/* DEBOUNCE HELPER */
const debounce = (fn, delay) => {
  let timeoutId = null;
  return function (...args) {
    const context = this;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn.apply(context, args);
    }, delay);
  };
};

/* UTILITY FUNCTIONS */
const formatValueHistory = (prices) =>
  prices
    .map((p) => ({
      price: Number(p.price),
      time: new Date(p.time * 1000),
    }))
    .sort((a, b) => a.time - b.time);

const scalePricesCore = (
  data,
  height,
  width,
  paddingTop = 0,
  paddingBottom = 0,
  paddingLeft = 0,
  paddingRight = 0,
) => {
  const priceToY = scaleLinear()
    .range([height - paddingBottom, paddingTop])
    .domain(extent(data, (d) => d.price));

  const timeToX = scaleTime()
    .range([paddingLeft, width - paddingRight])
    .domain(extent(data, (d) => d.time));

  return data.map(({ price, time }) => ({
    price: priceToY(price),
    time: timeToX(time),
  }));
};

// Memoized version for performance
const scalePrices = memoize(scalePricesCore);

const lineFromPrices = line()
  .x((d) => d.time)
  .y((d) => d.price);

const NUMBER_REG = /\B(?=(\d{3})+(?!\d))/g;

const getSign = (price, hidePlus) => {
  if (!hidePlus && price > 0) return "+";
  if (price < 0) return "-";
  return "";
};

const formatNumberStringCore = (
  price,
  symbol = "",
  hidePlus = false,
  symbolAfter = false,
  decimalPlaces = DEFAULT_DECIMAL_PLACES,
  separatorFormat = DEFAULT_SEPARATOR_FORMAT,
) => {
  if (typeof price === "number") {
    const sign = getSign(price, hidePlus);
    const string = Math.abs(price).toFixed(decimalPlaces);
    const parts = string.split(".");

    // Apply separator format
    if (separatorFormat === "us") {
      // US: 1,234.56
      parts[0] = parts[0].replace(NUMBER_REG, ",");
      return `${sign}${symbolAfter ? "" : symbol}${parts.join(".")}${
        symbolAfter ? symbol : ""
      }`;
    } else if (separatorFormat === "eu") {
      // EU: 1.234,56
      parts[0] = parts[0].replace(NUMBER_REG, ".");
      return `${sign}${symbolAfter ? "" : symbol}${parts.join(",")}${
        symbolAfter ? symbol : ""
      }`;
    } else if (separatorFormat === "space") {
      // Space: 1 234.56
      parts[0] = parts[0].replace(NUMBER_REG, " ");
      return `${sign}${symbolAfter ? "" : symbol}${parts.join(".")}${
        symbolAfter ? symbol : ""
      }`;
    }
  }
  return null;
};

// Memoized version for performance
const formatNumberString = memoize(formatNumberStringCore);

const deriveValueDelta = (currentValue, valueHistory) => {
  if (
    typeof currentValue === "number" &&
    Array.isArray(valueHistory) &&
    valueHistory.length > 0 &&
    valueHistory[0].price
  ) {
    return currentValue - valueHistory[0].price;
  }
  return null;
};

const derivePercentDelta = (currentValue, valueHistory) => {
  if (
    Array.isArray(valueHistory) &&
    valueHistory.length > 0 &&
    valueHistory[0].price
  ) {
    return (
      ((currentValue - valueHistory[0].price) /
        Math.abs(valueHistory[0].price)) *
        100 || 0
    );
  }
  return null;
};

const calculateRSI = (valueHistory, period = 14) => {
  if (!Array.isArray(valueHistory) || valueHistory.length < period + 1)
    return null;

  // Sample to ~50 points to avoid noise on short-interval periods (e.g. 1H)
  const maxPoints = 50;
  const step =
    valueHistory.length > maxPoints
      ? Math.floor(valueHistory.length / maxPoints)
      : 1;
  const sampled = valueHistory.filter((_, i) => i % step === 0);

  if (sampled.length < period + 1) return null;

  const prices = sampled.map((d) => d.price);
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
};

/* API FETCHING WITH CACHE & STALE-WHILE-REVALIDATE */
const fetchValueHistory = async (
  coin,
  period,
  currency = "USD",
  signal = null,
  useCache = true,
  allowedCoins = [],
) => {
  // Check cache first
  if (useCache) {
    const cached = getCachedData(coin, period, currency, "history");
    if (cached && !cached.isStale) {
      // Fresh cache, return immediately
      return cached.data;
    }
  }

  // Fetch fresh data
  const options = signal ? { signal } : {};
  const d = await fetchWithRetry(
    `${API_BASE}${coin}-${currency}/${API_HISTORY}${period}`,
    options,
  ).then((r) => r.json());
  const prices = d && d.data && d.data.prices;

  if (Array.isArray(prices) && prices.length > 0) {
    const formattedData = formatValueHistory(prices);
    // Cache the result (only if coin is in first 10)
    setCachedData(
      coin,
      period,
      currency,
      "history",
      formattedData,
      allowedCoins,
    );
    return formattedData;
  }

  throw new Error("invalid price data returned");
};

const fetchCurrentValue = async (
  coin,
  currency = "USD",
  signal = null,
  useCache = true,
  allowedCoins = [],
) => {
  // Check cache first (using "current" as period since spot price doesn't have periods)
  if (useCache) {
    const cached = getCachedData(coin, "current", currency, "spot");
    if (cached && !cached.isStale) {
      // Fresh cache, return immediately
      return cached.data;
    }
  }

  // Fetch fresh data
  const options = signal ? { signal } : {};
  const d = await fetchWithRetry(
    `${API_BASE}${coin}-${currency}/${API_SPOT}`,
    options,
  ).then((r) => r.json());
  const spot = d && d.data && d.data.amount;

  if (typeof spot === "string") {
    const value = Number(spot);
    // Cache the result (only if coin is in first 10)
    setCachedData(coin, "current", currency, "spot", value, allowedCoins);
    return value;
  }

  throw new Error("invalid spot data returned");
};

/* LINE COMPONENT */
const LINE_DUMMY = Array(2)
  .fill()
  .map((_, i) => ({ price: 0, time: new Date(2010 + i) }));

const PADDING = 24;
const TRANSITION_DURATION = 500;

const safePrices = (prices) =>
  Array.isArray(prices) && prices.length > 1 ? prices : LINE_DUMMY;

const Svg = styled.svg`
  height: 100%;
  width: 100%;
  pointer-events: none;
  flex: 1 0 ${({ theme }) => theme.scale * 40}rem;
`;

class LineBase extends PureComponent {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "pathRef", createRef());
    _defineProperty(this, "svgRef", createRef());

    // Debounced resize handler (150ms delay)
    _defineProperty(
      this,
      "handleResize",
      debounce(() => {
        if (this.svgRef && this.svgRef.current) {
          const { height, width } = this.svgRef.current.getBoundingClientRect();
          this.height = height;
          this.width = width;
          this.updatePath();
        }
      }, 150),
    );

    _defineProperty(this, "updatePath", () => {
      const { prices } = this.props;

      const d = lineFromPrices(
        scalePrices(
          safePrices(prices),
          this.height,
          this.width,
          PADDING,
          PADDING,
        ),
      );

      this.path
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(easeCubicOut)
        .attrTween("d", interpolatePath.bind(null, this.d, d));

      this.d = d;
    });
  }

  componentDidMount() {
    if (
      this.pathRef &&
      this.pathRef.current &&
      this.svgRef &&
      this.svgRef.current
    ) {
      const { height, width } = this.svgRef.current.getBoundingClientRect();
      const { prices } = this.props;

      this.path = select(this.pathRef.current);
      this.height = height;
      this.width = width;

      const d = lineFromPrices(
        scalePrices(safePrices(prices), height, width, PADDING, PADDING),
      );
      this.path.attr("d", d);
      this.d = d;

      window.addEventListener("resize", this.handleResize);
    }
  }

  componentDidUpdate(prevProps) {
    // Only update path if prices actually changed
    if (prevProps.prices !== this.props.prices) {
      this.updatePath();
    }
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.handleResize);
  }

  render() {
    return React.createElement(
      Svg,
      { innerRef: this.svgRef },
      React.createElement("path", {
        fill: "none",
        ref: this.pathRef,
        stroke: this.props.theme.color.text,
        strokeWidth: "1.5",
      }),
    );
  }
}

const Line = withTheme(LineBase);

/* PERIOD SWITCHER */
const PeriodButton = styled.button`
  isolation: isolate;
  perspective: 1px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 1 auto;
  height: ${({ theme }) => theme.spacing.large * 1.5}rem;
  min-width: 3.5rem;
  padding: 0 ${({ theme }) => theme.spacing.small}rem;
  margin: 0;
  border: none;
  background: transparent;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.875rem;
  text-align: center;
  text-decoration: none;
  letter-spacing: 0.125em;
  cursor: pointer;
  appearance: none;
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  transition:
    background 0.2s ease,
    color 0.2s ease;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    height: 2px;
    width: ${({ active }) => (active ? "60%" : "0%")};
    background-color: ${({ theme }) => theme.color.text};
    transition: width 0.3s ease;
    border-radius: 2px;
  }

  &:focus {
    outline: none;
  }

  &:hover:not(:focus-visible) {
    background: ${({ theme, active }) =>
      active
        ? "transparent"
        : theme.color.bg === "#ffffff"
          ? "rgba(0, 0, 0, 0.05)"
          : "rgba(255, 255, 255, 0.08)"};
  }

  &:focus-visible {
    background: ${({ theme }) =>
      theme.color.bg === "#ffffff"
        ? "rgba(0, 0, 0, 0.05)"
        : "rgba(255, 255, 255, 0.08)"};
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    flex: 0 0 auto;
    min-width: 3rem;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
  }
`;

const PeriodText = styled.span`
  color: ${({ theme, active }) =>
    active ? theme.color.text : theme.color.textSecondary};
  user-select: none;
  font-weight: ${({ active, theme }) =>
    active ? theme.fontWeight.medium : theme.fontWeight.regular};
  transition:
    color 0.2s ease,
    font-weight 0.2s ease;
  position: relative;
  z-index: 1;
`;

class PeriodItem extends PureComponent {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "handleClick", (e) => {
      const { onClick, value } = this.props;
      if (typeof onClick === "function") {
        onClick(e, value);
      }
    });
  }

  render() {
    const { active, children, title } = this.props;

    return React.createElement(
      PeriodButton,
      { active: active, onClick: this.handleClick, title: title },
      React.createElement(PeriodText, { active: active }, children),
    );
  }
}

_defineProperty(PeriodItem, "defaultProps", {
  active: false,
  children: null,
  onClick: null,
  value: null,
  title: null,
});

const PeriodSwitcherWrapper = styled.div`
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  flex: 0 0 auto;
  width: 100%;
  max-width: ${({ theme }) => theme.scale * 148}rem;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.medium}rem
    ${({ theme }) => theme.spacing.medium}rem
    ${({ theme }) => theme.spacing.large}rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    justify-content: center;
    gap: ${({ theme }) => theme.spacing.xsmall}rem;
    padding-bottom: ${({ theme }) => theme.spacing.medium}rem;
  }
`;

class PeriodSwitcher extends PureComponent {
  render() {
    const { onChange, options, value } = this.props;

    return React.createElement(
      PeriodSwitcherWrapper,
      null,
      Array.isArray(options) &&
        options.map((o) =>
          React.createElement(
            PeriodItem,
            {
              active: value === o.value,
              key: o.value,
              onClick: onChange,
              value: o.value,
              title: o.title,
            },
            o.label,
          ),
        ),
    );
  }
}

_defineProperty(PeriodSwitcher, "defaultProps", {
  onChange: null,
  options: [],
  value: null,
});

/* OVERVIEW */
const OverviewItemButton = styled.button`
  padding: ${({ theme }) =>
    `${theme.spacing.small}rem ${theme.spacing.medium}rem`};
  flex: 1 1 calc(50% - ${({ theme }) => theme.spacing.medium}rem);
  min-width: 0;
  border: none;
  text-align: center;
  background: transparent;
  font-family: ${({ theme }) => theme.font.primary};
  text-decoration: none;
  cursor: pointer;
  color: ${({ theme }) => theme.color.text};
  appearance: none;
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  transition: background 0.2s ease;

  &:hover {
    background: ${({ theme }) =>
      theme.color.bg === "#ffffff"
        ? "rgba(0, 0, 0, 0.05)"
        : "rgba(255, 255, 255, 0.08)"};
  }

  &:focus {
    outline: none;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    min-width: 10rem;
  }
`;

const Value = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.text};
`;

const Label = styled.div`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  line-height: 1.3333;
  letter-spacing: 0.125em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const OverviewItem = ({ children, label, onClick, title }) =>
  React.createElement(
    OverviewItemButton,
    { onClick, title: title },
    React.createElement(
      Value,
      null,
      children || React.createElement(Fragment, null, "\u00A0"),
    ),
    React.createElement(Label, null, label),
  );

OverviewItem.defaultProps = {
  children: null,
  label: "",
  onClick: null,
  title: null,
};

const OverviewWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: stretch;
  flex-wrap: nowrap;
  gap: ${({ theme }) => theme.spacing.medium}rem;
  flex: 0 0 auto;
  width: 100%;
  max-width: ${({ theme }) => theme.scale * 148}rem;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.large}rem
    ${({ theme }) => theme.spacing.medium}rem;
  color: ${({ theme }) => theme.color.text};
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    justify-content: flex-start;
    padding: ${({ theme }) => theme.spacing.medium}rem
      ${({ theme }) => theme.spacing.small}rem;
  }
`;

class Overview extends PureComponent {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "state", {
      calcPercentage: false,
    });

    _defineProperty(this, "togglePercentage", () => {
      this.setState((prevState) => ({
        calcPercentage: !prevState.calcPercentage,
      }));
    });
  }

  render() {
    const {
      coin,
      currentValue,
      cycleCoinIndex,
      valueHistory,
      decimalPlaces,
      separatorFormat,
      currency,
    } = this.props;
    const { calcPercentage } = this.state;
    const currencySymbol = getCurrencySymbol(currency || DEFAULT_CURRENCY);

    const delta = calcPercentage
      ? formatNumberString(
          derivePercentDelta(currentValue, valueHistory),
          "%",
          false,
          true,
          decimalPlaces,
          separatorFormat,
        )
      : formatNumberString(
          deriveValueDelta(currentValue, valueHistory),
          currencySymbol,
          false,
          false,
          decimalPlaces,
          separatorFormat,
        );

    return React.createElement(
      OverviewWrapper,
      null,
      React.createElement(
        OverviewItem,
        {
          onClick: this.props.cycleCoinIndex,
          label: `${coin} Price`,
          title: "Next coin",
        },
        formatNumberString(
          currentValue,
          currencySymbol,
          true,
          false,
          decimalPlaces,
          separatorFormat,
        ),
      ),
      React.createElement(
        OverviewItem,
        {
          onClick: this.togglePercentage,
          label: `${calcPercentage ? "Percent" : "Price"} Change`,
          title: calcPercentage ? "Switch to price change" : "Switch to percent change",
        },
        delta,
      ),
    );
  }
}

/* LAYOUT */
const AppShell = styled.main`
  width: 100%;
  max-width: 100%;
  height: 100vh;
  max-height: 100vh;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: ${({ theme }) =>
    `${theme.spacing.medium}rem ${theme.spacing.large * 2}rem`};
  position: relative;
  overflow: hidden;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.md}px) {
    padding: ${({ theme }) =>
      `${theme.spacing.large}rem ${theme.spacing.medium}rem`};
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding: ${({ theme }) =>
      `${theme.spacing.medium}rem ${theme.spacing.small}rem`};
  }
`;

const ChartWrapper = styled.section`
  width: 100%;
  display: flex;
  flex: 1 1 auto;
  min-height: calc(100vh - 18rem);
  height: calc(100vh - 18rem);
  padding: 0;
  margin: 0;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    min-height: calc(100vh - 20rem);
    height: calc(100vh - 20rem);
  }
`;

const FullBleed = styled.div`
  width: 100vw;
  margin-left: calc(-1 * ${({ theme }) => theme.spacing.large * 2}rem);
  margin-right: calc(-1 * ${({ theme }) => theme.spacing.large * 2}rem);
  display: block;
  overflow: hidden;
  padding: 1px 0;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.md}px) {
    margin-left: calc(-1 * ${({ theme }) => theme.spacing.medium}rem);
    margin-right: calc(-1 * ${({ theme }) => theme.spacing.medium}rem);
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    margin-left: calc(-1 * ${({ theme }) => theme.spacing.small}rem);
    margin-right: calc(-1 * ${({ theme }) => theme.spacing.small}rem);
  }
`;

const OfflineMessage = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.spacing.medium}rem;
  left: 50%;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme }) => theme.color.textSecondary};
  box-shadow: 0 ${({ theme }) => theme.scale * 2}rem
    ${({ theme }) => theme.scale * 4}rem ${({ theme }) => theme.color.shadow};
  z-index: 10000;
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.small}rem;
  white-space: nowrap;
  animation: slideDown 0.3s ease-out;

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  &::before {
    content: "⚠️";
    font-size: 0.75rem;
    line-height: 1;
  }
`;

const ApiErrorMessage = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.spacing.medium}rem;
  left: 50%;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme }) => theme.color.textSecondary};
  box-shadow: 0 ${({ theme }) => theme.scale * 2}rem
    ${({ theme }) => theme.scale * 4}rem ${({ theme }) => theme.color.shadow};
  z-index: 10000;
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.small}rem;
  white-space: nowrap;
  animation: slideDown 0.3s ease-out;

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  &::before {
    content: "🔴";
    font-size: 0.75rem;
    line-height: 1;
  }
`;

const InvalidCoinWarning = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.spacing.medium}rem;
  left: 50%;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid #ef4444;
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme }) => theme.color.text};
  box-shadow: 0 ${({ theme }) => theme.scale * 2}rem
    ${({ theme }) => theme.scale * 4}rem ${({ theme }) => theme.color.shadow};
  z-index: 10001;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  animation: slideDown 0.3s ease-out;

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
`;

const InvalidCoinMessage = styled.span`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.small * 0.5}rem;

  &::before {
    content: "❌";
    font-size: 0.75rem;
    line-height: 1;
  }
`;

const InvalidCoinButton = styled.button`
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale}rem;
  padding: ${({ theme }) => theme.spacing.small * 0.5}rem
    ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.7rem;
  font-family: ${({ theme }) => theme.font.primary};
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.color.border};
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:active {
    transform: scale(0.95);
  }
`;

/* SKELETON UI */
const skeletonPulse = keyframes`
  0% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.7;
  }
  100% {
    opacity: 0.4;
  }
`;

const skeletonShimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

const SkeletonBox = styled.div`
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.color.bgSecondary} 0%,
    ${({ theme }) => theme.color.border} 50%,
    ${({ theme }) => theme.color.bgSecondary} 100%
  );
  background-size: 200% 100%;
  border-radius: ${({ theme }) => theme.scale}rem;
  animation: ${skeletonShimmer} 2s ease-in-out infinite;
  width: ${({ width }) => width || "100%"};
  height: ${({ height }) => height || "1rem"};
`;

const SkeletonOverview = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  padding: ${({ theme }) => theme.spacing.medium}rem 0;
`;

const SkeletonPeriodSwitcher = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.small * 0.75}rem;
  justify-content: center;
  flex-wrap: wrap;
  padding: ${({ theme }) => theme.spacing.small}rem 0;
`;

const SkeletonChart = styled.div`
  width: 100%;
  height: 100%;
  min-height: 20rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.color.bgSecondary} 0%,
    ${({ theme }) => theme.color.border} 50%,
    ${({ theme }) => theme.color.bgSecondary} 100%
  );
  background-size: 200% 100%;
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  animation: ${skeletonShimmer} 2s ease-in-out infinite;
  opacity: 0.5;
  position: relative;
  overflow: hidden;

  /* Subtle wave pattern to simulate chart line */
  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 10%;
    width: 80%;
    height: 2px;
    background: ${({ theme }) => theme.color.border};
    opacity: 0.4;
    border-radius: 2px;
    transform: translateY(-50%);
    box-shadow:
      0 -3rem 0 ${({ theme }) => theme.color.border}40,
      0 3rem 0 ${({ theme }) => theme.color.border}40;
  }
`;

const ControlsStack = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.small * 0.75}rem;
  align-items: center;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    gap: ${({ theme }) => theme.spacing.small * 0.5}rem;
  }
`;

const settingsPulse = keyframes`
  from { transform: scale(1); }
  50% { transform: scale(1.05); }
  to { transform: scale(1); }
`;

const SettingsToggleButton = styled.button`
  position: absolute;
  top: ${({ theme }) => theme.spacing.large}rem;
  right: ${({ theme }) => theme.spacing.large}rem;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-size: 1.35rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s ease;
  z-index: 120;

  &:hover {
    transform: scale(1.1);
  }

  &:focus {
    outline: none;
    animation: ${settingsPulse} 1s ease;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    right: ${({ theme }) => theme.spacing.small}rem;
    top: ${({ theme }) => theme.spacing.small}rem;
  }
`;

const overlayBlur = keyframes`
  from { backdrop-filter: blur(0px); }
  to { backdrop-filter: blur(10px); }
`;

const SettingsOverlay = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.85)"
      : "rgba(0, 0, 0, 0.9)"};
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.35s ease;
  animation: ${overlayBlur} 0.45s ease forwards;
  z-index: 50;
  padding: ${({ theme }) => theme.spacing.medium}rem;
`;

/* WIDGET PANEL STYLES */
const WidgetRestoreButton = styled.button`
  position: absolute;
  top: ${({ theme }) => theme.spacing.large}rem;
  left: ${({ theme }) => theme.spacing.large}rem;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-size: 1.35rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s ease;
  z-index: 120;
  opacity: 0.75;

  &:hover {
    transform: scale(1.1);
    opacity: 1;
  }

  &:focus {
    outline: none;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    left: ${({ theme }) => theme.spacing.small}rem;
    top: ${({ theme }) => theme.spacing.small}rem;
  }
`;

const WidgetHideButton = styled.button`
  position: absolute;
  top: 0.2rem;
  right: 0.2rem;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-size: 0.6rem;
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease;
  border-radius: 50%;

  &:hover {
    background: ${({ theme }) => theme.color.border}44;
  }
`;

const WidgetPanel = styled.div`
  position: fixed;
  z-index: 40;
  display: flex;
  gap: 0.5rem;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.3s ease;

  /* Desktop: sol üst, dikey */
  top: 4rem;
  left: 1rem;
  flex-direction: column;

  /* Tablet: alt orta, yatay */
  @media (max-width: 1024px) {
    top: auto;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    flex-direction: row;
  }

  /* Mobil: daha kompakt */
  @media (max-width: 600px) {
    bottom: 0.5rem;
    gap: 0.3rem;
  }
`;

/* ── New widget styled components ─────────────────────────── */
const FundingValue = styled.div`
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ positive }) =>
    positive ? "#f87171" : "#34d399"}; /* red = positive (long pays), green = negative (shorts pay) */
  letter-spacing: 0.02em;
`;

const FundingAnnual = styled.div`
  font-size: 0.6rem;
  opacity: 0.6;
  margin-top: 2px;
`;

const LSBarWrap = styled.div`
  display: flex;
  width: 100%;
  height: 5px;
  border-radius: 3px;
  overflow: hidden;
  margin: 4px 0 2px;
`;

const LSBarLong = styled.div`
  height: 100%;
  background: #34d399;
  width: ${({ pct }) => pct}%;
  transition: width 0.4s ease;
`;

const LSBarShort = styled.div`
  flex: 1;
  height: 100%;
  background: #f87171;
`;

const LSRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  opacity: 0.75;
`;

const OIValue = styled.div`
  font-size: 0.95rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.02em;
`;

const LiqBarWrap = styled.div`
  display: flex;
  width: 100%;
  height: 5px;
  border-radius: 3px;
  overflow: hidden;
  margin: 4px 0 2px;
`;

const LiqBarLong = styled.div`
  height: 100%;
  background: #f87171;
  width: ${({ pct }) => pct}%;
  transition: width 0.4s ease;
`;

const LiqBarShort = styled.div`
  flex: 1;
  height: 100%;
  background: #34d399;
`;

const LiqRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  opacity: 0.75;
`;

const AltSeasonBar = styled.div`
  width: 100%;
  height: 5px;
  border-radius: 3px;
  background: linear-gradient(to right, #f97316, #facc15, #34d399);
  position: relative;
  margin: 4px 0 2px;
`;

const AltSeasonMarker = styled.div`
  position: absolute;
  top: -2px;
  left: ${({ pct }) => Math.min(Math.max(pct, 2), 96)}%;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.text};
  transform: translateX(-50%);
  transition: left 0.4s ease;
`;

const WidgetCard = styled.div`
  position: relative;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.95)"
      : "rgba(15, 15, 15, 0.9)"};
  backdrop-filter: blur(8px);
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  text-align: center;
  box-shadow: 0 2px 8px ${({ theme }) => theme.color.shadow};
  cursor: grab;
  user-select: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
  opacity: ${({ dragging }) => (dragging ? 0.4 : 1)};
  transform: ${({ dragging }) => (dragging ? "scale(0.97)" : "scale(1)")};

  &:hover ${WidgetHideButton} {
    opacity: 0.5;
  }

  &:hover ${WidgetHideButton}:hover {
    opacity: 1;
  }

  /* Tablet */
  @media (max-width: 1024px) {
    padding: 0.4rem 0.6rem;
  }

  /* Mobil */
  @media (max-width: 600px) {
    padding: 0.3rem 0.5rem;
    border-radius: 0.4rem;
  }
`;

const WidgetLabel = styled.div`
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.6;
  margin-bottom: 0.2rem;

  @media (max-width: 600px) {
    font-size: 0.5rem;
    margin-bottom: 0.1rem;
  }
`;

const WidgetValue = styled.div`
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.02em;

  @media (max-width: 600px) {
    font-size: 0.85rem;
  }
`;

const WidgetSubtext = styled.div`
  font-size: 0.65rem;
  opacity: 0.7;
  margin-top: 2px;
  text-transform: capitalize;

  @media (max-width: 600px) {
    font-size: 0.55rem;
  }
`;

const FearGreedGauge = styled.div`
  display: flex;
  justify-content: center;
  gap: 2px;
  margin-top: 3px;

  @media (max-width: 600px) {
    gap: 1px;
    margin-top: 2px;
  }
`;

const GaugeDot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: ${({ active, value, theme }) => {
    if (!active) return theme.color.border;
    if (value <= 25) return "#ea3943";
    if (value <= 45) return "#f5a623";
    if (value <= 55) return "#c9c9c9";
    if (value <= 75) return "#93d572";
    return "#16c784";
  }};

  @media (max-width: 600px) {
    width: 4px;
    height: 4px;
  }
`;

const GaugeTrackPath = styled.path`
  fill: none;
  stroke: ${({ theme }) => theme.color.border};
  stroke-width: 7;
  stroke-linecap: round;
`;

const GaugeNeedle = styled.line`
  stroke: ${({ theme }) => theme.color.text};
  stroke-width: 1.5;
  stroke-linecap: round;
`;

const GaugeCenterDot = styled.circle`
  fill: ${({ theme }) => theme.color.text};
`;

const MarketStatLabel = styled.span`
  opacity: 0.5;
  margin-right: 2px;
  font-size: 0.6rem;

  @media (max-width: 600px) {
    font-size: 0.5rem;
  }
`;

const HalvingProgressBar = styled.div`
  width: 100%;
  height: 4px;
  background: ${({ theme }) => theme.color.border};
  border-radius: 2px;
  margin-top: 5px;
  overflow: hidden;

  @media (max-width: 600px) {
    height: 3px;
    margin-top: 4px;
  }
`;

const HalvingProgressFill = styled.div`
  height: 100%;
  width: ${({ percent }) => percent}%;
  background: ${({ theme }) => theme.color.text};
  border-radius: 2px;
  transition: width 0.4s ease;
`;

const HalvingTimeGrid = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
`;

const HalvingTimeUnit = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 2rem;
`;

const HalvingTimeNumber = styled.span`
  font-size: 1.15rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.02em;
  line-height: 1;

  @media (max-width: 600px) {
    font-size: 0.95rem;
  }
`;

const HalvingTimeLabel = styled.span`
  font-size: 0.45rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.5;
  margin-top: 2px;
`;

const HalvingTimeSep = styled.span`
  font-size: 1rem;
  opacity: 0.3;
  align-self: flex-start;
  padding-top: 1px;
`;

const HalvingEta = styled.div`
  font-size: 0.55rem;
  opacity: 0.55;
  margin-top: 4px;
  letter-spacing: 0.03em;

  @media (max-width: 600px) {
    font-size: 0.5rem;
  }
`;

const RsiBar = styled.div`
  width: 100%;
  height: 4px;
  background: linear-gradient(90deg, #16c784 0%, #f5a623 50%, #ea3943 100%);
  border-radius: 2px;
  margin: 5px 0 3px;
  position: relative;
`;

const RsiMarker = styled.div`
  position: absolute;
  top: 50%;
  left: ${({ value }) => value}%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.bg};
  border: 1.5px solid ${({ theme }) => theme.color.text};

  @media (max-width: 600px) {
    width: 6px;
    height: 6px;
  }
`;

const RsiLabels = styled.div`
  display: flex;
  justify-content: space-between;
`;

const panelLift = keyframes`
  from { transform: translateY(24px) scale(0.95); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
`;

const SettingsCard = styled.div`
  width: min(90vw, 28rem);
  max-height: 90vh;
  border-radius: ${({ theme }) => theme.scale * 8}rem;
  padding: ${({ theme }) => theme.spacing.large * 1.5}rem;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.98)"
      : "rgba(5, 5, 5, 0.92)"};
  border: 1px solid ${({ theme }) => theme.color.border};
  box-shadow: 0 25px 60px ${({ theme }) => theme.color.shadow};
  text-align: center;
  animation: ${panelLift} 0.4s ease;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;

  /* Custom scrollbar - Firefox */
  scrollbar-width: thin;
  scrollbar-color: ${({ theme }) => theme.color.border} transparent;

  /* Custom scrollbar - Webkit (Chrome, Edge, Safari) */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    margin: ${({ theme }) => theme.scale * 4}rem 0;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.color.border};
    border-radius: 3px;
    transition: background 0.2s ease;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${({ theme }) => theme.color.borderHover};
  }
`;

const SettingsTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  font-size: 1.25rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const TabContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  margin-bottom: ${({ theme }) => theme.spacing.medium}rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  padding-bottom: ${({ theme }) => theme.spacing.small}rem;
`;

const TabButton = styled.button.attrs(() => ({ type: "button" }))`
  background: transparent;
  border: none;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.875rem;
  font-weight: ${({ active, theme }) =>
    active ? theme.fontWeight.medium : theme.fontWeight.normal};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${({ active, theme }) =>
    active ? theme.color.text : theme.color.textSecondary};
  cursor: pointer;
  transition: all 0.2s ease;
  border-bottom: 2px solid
    ${({ active, theme }) => (active ? theme.color.text : "transparent")};
  margin-bottom: -${({ theme }) => theme.spacing.small}rem;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }

  &:focus {
    outline: none;
  }
`;

const tabFadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const TabContent = styled.div`
  animation: ${tabFadeIn} 0.25s ease-out;
`;

const SettingsDescription = styled.p`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  max-width: 20rem;
  font-size: 0.875rem;
  opacity: 0.8;
  line-height: 1.5;
`;

const CoinList = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  margin-bottom: ${({ theme }) => theme.spacing.medium}rem;
  position: relative;
`;

const CoinChip = styled.button.attrs(() => ({ type: "button" }))`
  border-radius: 999px;
  border: 1px solid
    ${({ selected, theme }) =>
      selected ? theme.color.text : theme.color.border};
  padding: ${({ selected }) =>
    selected ? "0.45rem 1.8rem 0.45rem 0.85rem" : "0.35rem 0.75rem"};
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  background: ${({ selected, theme }) =>
    selected ? theme.color.text : "transparent"};
  color: ${({ selected, theme }) =>
    selected ? theme.color.bg : theme.color.text};
  text-transform: uppercase;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease,
    opacity 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
  min-width: 3.5rem;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: ${({ selected, theme }) =>
      selected ? theme.color.text : theme.color.borderHover};
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
    transform: none;
  }

  &[draggable="true"] {
    cursor: grab;
  }

  &[draggable="true"]:active {
    cursor: grabbing;
  }
`;

const CoinChipRemove = styled.span`
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1rem;
  height: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 300;
  opacity: 0.5;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  border-radius: 50%;

  &:hover {
    opacity: 1;
    transform: translateY(-50%) scale(1.2);
  }
`;

const CoinSectionTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.875rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

const CoinSectionHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
`;

const CoinCounter = styled.span`
  font-size: 0.65rem;
  opacity: 0.4;
  letter-spacing: 0.05em;
`;

const CoinDragHint = styled.p`
  font-size: 0.65rem;
  opacity: 0.4;
  margin: 0.2rem 0 0.75rem;
  letter-spacing: 0.04em;
`;

const ResetButton = styled.button.attrs(() => ({ type: "button" }))`
  background: none;
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.text};
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.7rem;
  font-family: inherit;
  letter-spacing: 0.06em;
  cursor: pointer;
  opacity: 0.5;
  margin-top: 0.75rem;
  width: 100%;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
  }
`;

const SuggestionHint = styled.p`
  margin: ${({ theme }) => theme.spacing.xsmall}rem 0 0;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  opacity: 0.7;
`;

const SettingsForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.small}rem;
  width: 100%;
  position: relative;
`;

const SearchInputWrapper = styled.div`
  position: relative;
  width: 100%;
`;

const SettingsInput = styled.input`
  padding: 0.75rem 5.5rem 0.75rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  text-transform: uppercase;
  letter-spacing: 0.15em;
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
    background: ${({ theme }) => theme.color.bgSecondary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

const SuggestionTray = styled.div`
  position: absolute;
  top: 0;
  right: 0.75rem;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 60%;
  overflow: hidden;
  cursor: pointer;
  transition: max-width 0.6s ease-in-out;

  & > * {
    flex-shrink: 0;
  }

  &:hover {
    max-width: 75%;
  }
`;

const SettingsActionButton = styled.button`
  padding: 0.75rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: none;
  cursor: pointer;
  background: ${({ theme }) => theme.color.text};
  color: ${({ theme }) => theme.color.bg};
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 24px ${({ theme }) => theme.color.shadow};
  }

  &:active {
    transform: scale(0.98);
  }
`;

const SettingsFeedback = styled.p`
  margin: ${({ theme }) => theme.spacing.small}rem 0 0;
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  color: ${({ error }) => (error ? "#ff8a8a" : "#8affc1")};
`;

const ThemeSection = styled.div`
  margin: ${({ theme }) => theme.spacing.medium}rem auto;
  padding: ${({ theme }) => theme.spacing.medium}rem 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  width: 100%;
  max-width: 20rem;
`;

const ThemeSectionTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const ThemeButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xsmall}rem;
  justify-content: center;
`;

const ThemeButton = styled.button.attrs(() => ({ type: "button" }))`
  flex: 1;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid
    ${({ active, theme }) => (active ? theme.color.text : theme.color.border)};
  background: ${({ active, theme }) =>
    active ? theme.color.text : "transparent"};
  color: ${({ active, theme }) => (active ? theme.color.bg : theme.color.text)};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 4rem;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.borderHover};
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const ThemeDescription = styled.p`
  margin: ${({ theme }) => theme.spacing.small}rem 0 0;
  font-size: 0.7rem;
  opacity: 0.6;
  text-align: center;
  line-height: 1.4;
`;

// Toggle Switch Components
const ToggleSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  width: 100%;
  max-width: 20rem;
`;

const ToggleSectionTitle = styled.div`
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
  margin-bottom: 0.25rem;
`;

const ToggleSectionDesc = styled.div`
  font-size: 0.65rem;
  opacity: 0.5;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.medium}rem;
  padding: 0.4rem 0;

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.color.border}22;
  }
`;

const ToggleLabel = styled.label`
  font-size: 0.7rem;
  opacity: 0.6;
`;

const ToggleSwitch = styled.button`
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  background-color: ${({ active, theme }) =>
    active ? theme.color.text : theme.color.border};
  transition: background-color 0.2s ease;
  flex-shrink: 0;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.text}40;
  }

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ active }) => (active ? "22px" : "2px")};
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: ${({ active, theme }) =>
      active ? theme.color.bg : theme.color.text};
    transition: left 0.2s ease;
  }
`;

const RefreshIntervalSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  width: 100%;
  max-width: 20rem;
`;

const RefreshIntervalLabel = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const RefreshIntervalSelect = styled.select`
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image:
    linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position:
    calc(100% - 15px) center,
    calc(100% - 10px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 2rem;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.text};
  }

  option {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.text};
  }
`;

const NumberFormatSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  width: 100%;
  max-width: 20rem;
`;

const NumberFormatLabel = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const NumberFormatSelect = styled.select`
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image:
    linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position:
    calc(100% - 15px) center,
    calc(100% - 10px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 2rem;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.text};
  }

  option {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.text};
  }
`;

const CurrencySection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  width: 100%;
  max-width: 20rem;
`;

const CurrencyLabel = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const CurrencySelect = styled.select`
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image:
    linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position:
    calc(100% - 15px) center,
    calc(100% - 10px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 2rem;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.text};
  }

  option {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.text};
  }
`;

class SettingsPanel extends PureComponent {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "state", {
      feedback: "",
      status: "idle",
      pendingCoin: "",
      suggestions: [],
      activeTab: "coins", // 'coins' or 'preferences'
    });

    this.draggingSymbol = null;
    this.draggingChipNode = null;
    this.lastEnteredSymbol = null;

    _defineProperty(this, "handleTabChange", (tab) => {
      this.setState({ activeTab: tab });
    });

    _defineProperty(this, "handleChipClick", (symbol) => {
      const { coins, onAddCoin, onRemoveCoin } = this.props;
      if (this.draggingSymbol) {
        return;
      }
      if (!symbol || typeof onAddCoin !== "function") {
        return;
      }

      const normalized = symbol.trim().toUpperCase();
      if (!normalized) {
        return;
      }

      const activeCoins = Array.isArray(coins) ? coins : [];
      if (activeCoins.includes(normalized)) {
        if (typeof onRemoveCoin === "function") {
          onRemoveCoin(normalized);
          this.setState({
            feedback: `${normalized} removed from the rotation`,
            status: "info",
          });
        }
        return;
      }

      if (!SUGGESTED_COINS.includes(normalized)) {
        this.setState({
          feedback: `${normalized || "Symbol"} not recognized`,
          status: "error",
        });
        return;
      }

      const result = onAddCoin(normalized);

      if (result && result.success) {
        this.setState({
          feedback: `${normalized} added to the rotation`,
          status: "success",
        });
      } else {
        let feedback = "Could not add coin";
        if (result && result.reason === "duplicate") {
          feedback = "This symbol is already listed";
        } else if (result && result.reason === "format") {
          feedback = "Use 2-10 letters/numbers only";
        } else if (result && result.reason === "empty") {
          feedback = "Enter a symbol first";
        } else if (result && result.reason === "limit") {
          feedback = "Max " + MAX_COINS + " coins reached";
        }

        this.setState({ feedback, status: "error" });
      }
    });

    _defineProperty(this, "handleSuggestionClick", (symbol) => {
      const { coins, onAddCoin } = this.props;
      if (this.draggingSymbol || !symbol || typeof onAddCoin !== "function") {
        return;
      }

      const normalized = symbol.trim().toUpperCase();
      if (!normalized) {
        return;
      }

      const activeCoins = Array.isArray(coins) ? coins : [];
      if (activeCoins.includes(normalized)) {
        this.setState({
          feedback: `${normalized} is already in the rotation`,
          status: "info",
        });
        return;
      }

      if (!SUGGESTED_COINS.includes(normalized)) {
        this.setState({
          feedback: `${normalized || "Symbol"} not recognized`,
          status: "error",
        });
        return;
      }

      const result = onAddCoin(normalized);

      if (result && result.success) {
        this.setState({
          feedback: `${normalized} added to the rotation`,
          status: "success",
          pendingCoin: "",
          suggestions: [],
        });
      } else {
        let feedback = "Could not add coin";
        if (result && result.reason === "duplicate") {
          feedback = "This symbol is already listed";
        } else if (result && result.reason === "format") {
          feedback = "Use 2-10 letters/numbers only";
        } else if (result && result.reason === "empty") {
          feedback = "Enter a symbol first";
        } else if (result && result.reason === "limit") {
          feedback = "Max " + MAX_COINS + " coins reached";
        }
        this.setState({ feedback, status: "error" });
      }
    });

    // Debounced suggestion filtering for better performance
    _defineProperty(
      this,
      "updateSuggestions",
      debounce((pendingCoin) => {
        const activeCoins = Array.isArray(this.props.coins)
          ? this.props.coins
          : [];

        const suggestions = pendingCoin
          ? SUGGESTED_COINS.filter(
              (coin) =>
                coin.startsWith(pendingCoin) && !activeCoins.includes(coin),
            ).slice(0, 4)
          : [];

        this.setState({ suggestions });
      }, 200),
    );

    _defineProperty(this, "handleInputChange", (e) => {
      const pendingCoin = e.target.value.toUpperCase();

      // Update input value immediately for better UX
      this.setState({ pendingCoin, status: "idle", feedback: "" });

      // Filter suggestions with debounce
      this.updateSuggestions(pendingCoin);
    });

    _defineProperty(this, "handleSubmit", (e) => {
      e.preventDefault();
      const { pendingCoin } = this.state;
      this.handleSuggestionClick(pendingCoin);
    });

    _defineProperty(this, "handleDragStart", (symbol, event) => {
      if (event && event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", symbol);
      }

      this.draggingSymbol = symbol;
      this.lastEnteredSymbol = null;

      if (event && event.currentTarget) {
        this.draggingChipNode = event.currentTarget;
        this.draggingChipNode.style.opacity = "0.4";
        this.draggingChipNode.style.cursor = "grabbing";
      }
    });

    _defineProperty(this, "handleDragEnd", () => {
      if (this.draggingChipNode) {
        this.draggingChipNode.style.opacity = "";
        this.draggingChipNode.style.cursor = "";
        this.draggingChipNode = null;
      }

      this.draggingSymbol = null;
      this.lastEnteredSymbol = null;
    });

    _defineProperty(this, "handleDrop", (targetSymbol, event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      const { onReorderCoin } = this.props;

      if (
        this.draggingSymbol &&
        targetSymbol &&
        typeof onReorderCoin === "function" &&
        this.draggingSymbol !== targetSymbol
      ) {
        onReorderCoin(this.draggingSymbol, targetSymbol);
      }
    });

    _defineProperty(this, "handleDragOver", (targetSymbol, event) => {
      if (event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }

      const { onReorderCoin } = this.props;

      if (
        this.draggingSymbol &&
        targetSymbol &&
        this.draggingSymbol !== targetSymbol &&
        this.lastEnteredSymbol !== targetSymbol &&
        typeof onReorderCoin === "function"
      ) {
        this.lastEnteredSymbol = targetSymbol;
        onReorderCoin(this.draggingSymbol, targetSymbol);
      }
    });
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.visible && this.props.visible) {
      this.setState({
        feedback: "",
        status: "idle",
        pendingCoin: "",
        suggestions: [],
      });
      this.draggingSymbol = null;
      this.lastEnteredSymbol = null;
    }
  }

  render() {
    const {
      coins,
      onClose,
      visible,
      themePreference,
      activeTheme,
      onThemeChange,
      refreshInterval,
      onRefreshIntervalChange,
      decimalPlaces,
      separatorFormat,
      onDecimalPlacesChange,
      onSeparatorFormatChange,
      currency,
      onCurrencyChange,
      tickerEnabled,
      onTickerChange,
      tickerFormat,
      onTickerFormatChange,
      widgets,
      onWidgetToggle,
      onResetCoins,
    } = this.props;
    const { feedback, status, pendingCoin, suggestions, activeTab } =
      this.state;
    const activeCoins = Array.isArray(coins) ? coins : [];

    return React.createElement(
      SettingsOverlay,
      { visible: visible, onClick: onClose },
      React.createElement(
        SettingsCard,
        {
          visible: visible,
          onClick: (e) => e.stopPropagation(),
        },
        React.createElement(SettingsTitle, null, "Settings"),

        // Tab Buttons
        React.createElement(
          TabContainer,
          null,
          React.createElement(
            TabButton,
            {
              active: activeTab === "coins",
              onClick: () => this.handleTabChange("coins"),
            },
            "Coins",
          ),
          React.createElement(
            TabButton,
            {
              active: activeTab === "preferences",
              onClick: () => this.handleTabChange("preferences"),
            },
            "Preferences",
          ),
          React.createElement(
            TabButton,
            {
              active: activeTab === "widgets",
              onClick: () => this.handleTabChange("widgets"),
            },
            "Widgets",
          ),
        ),

        // Coins Tab Content
        activeTab === "coins" &&
          React.createElement(
            TabContent,
            { key: "coins-tab" },
            React.createElement(
              SettingsDescription,
              null,
              "Tap any ticker below to add it to the rotation. Selected coins stay highlighted white.",
            ),

            React.createElement(
              CoinSectionHeader,
              null,
              React.createElement(
                CoinSectionTitle,
                { style: { margin: 0 } },
                "Selected",
              ),
              React.createElement(
                CoinCounter,
                null,
                activeCoins.length + " / " + MAX_COINS,
              ),
            ),
            React.createElement(
              CoinList,
              null,
              activeCoins.length
                ? activeCoins.map((coin) =>
                    React.createElement(
                      CoinChip,
                      {
                        key: coin,
                        selected: true,
                        "data-symbol": coin,
                        draggable: true,
                        onDragStart: (e) => this.handleDragStart(coin, e),
                        onDragEnd: this.handleDragEnd,
                        onDragOver: (e) => this.handleDragOver(coin, e),
                        onDrop: (e) => this.handleDrop(coin, e),
                      },
                      coin,
                      React.createElement(
                        CoinChipRemove,
                        {
                          onClick: (e) => {
                            e.stopPropagation();
                            this.handleChipClick(coin);
                          },
                          title: "Remove " + coin,
                        },
                        "×",
                      ),
                    ),
                  )
                : React.createElement(CoinChip, {
                    disabled: true,
                    children: "No coins yet",
                  }),
            ),
            activeCoins.length > 1 &&
              React.createElement(CoinDragHint, null, "Drag to reorder"),
            React.createElement(CoinSectionTitle, null, "Quick add"),
            React.createElement(
              SettingsForm,
              { onSubmit: this.handleSubmit },
              React.createElement(
                SearchInputWrapper,
                null,
                React.createElement(SettingsInput, {
                  maxLength: 10,
                  onChange: this.handleInputChange,
                  placeholder: "Search symbol",
                  autoComplete: "off",
                  value: pendingCoin,
                }),
                React.createElement(
                  SuggestionTray,
                  null,
                  suggestions.length
                    ? suggestions.map((coin) =>
                        React.createElement(CoinChip, {
                          key: coin,
                          "data-symbol": coin,
                          onClick: () => this.handleSuggestionClick(coin),
                          children: coin,
                        }),
                      )
                    : pendingCoin
                      ? React.createElement(
                          SuggestionHint,
                          null,
                          "Try BTC, ETH, SOL...",
                        )
                      : null,
                ),
              ),
              React.createElement(
                SettingsActionButton,
                { type: "submit" },
                "Add coin",
              ),
            ),
            feedback
              ? React.createElement(
                  SettingsFeedback,
                  { error: status === "error" },
                  feedback,
                )
              : null,
            React.createElement(
              ResetButton,
              { onClick: () => onResetCoins && onResetCoins() },
              "Reset to defaults",
            ),
          ),

        // Preferences Tab Content
        activeTab === "preferences" &&
          React.createElement(
            TabContent,
            { key: "preferences-tab" },

            // Theme Section
            React.createElement(
              ThemeSection,
              null,
              React.createElement(ThemeSectionTitle, null, "Appearance"),
              React.createElement(
                ThemeButtonGroup,
                null,
                React.createElement(
                  ThemeButton,
                  {
                    active: themePreference === "auto",
                    onClick: () => onThemeChange && onThemeChange("auto"),
                  },
                  "Auto",
                ),
                React.createElement(
                  ThemeButton,
                  {
                    active: themePreference === "light",
                    onClick: () => onThemeChange && onThemeChange("light"),
                  },
                  "Light",
                ),
                React.createElement(
                  ThemeButton,
                  {
                    active: themePreference === "dark",
                    onClick: () => onThemeChange && onThemeChange("dark"),
                  },
                  "Dark",
                ),
              ),
              React.createElement(
                ThemeDescription,
                null,
                themePreference === "auto"
                  ? `Using ${activeTheme} mode (system preference)`
                  : `Using ${themePreference} mode`,
              ),
            ),

            // Refresh Interval Section
            React.createElement(
              RefreshIntervalSection,
              null,
              React.createElement(
                RefreshIntervalLabel,
                null,
                "Refresh Interval",
              ),
              React.createElement(
                RefreshIntervalSelect,
                {
                  value: refreshInterval || DEFAULT_REFRESH_INTERVAL,
                  onChange: (e) => {
                    const newInterval = parseInt(e.target.value, 10);
                    if (onRefreshIntervalChange) {
                      onRefreshIntervalChange(newInterval);
                    }
                  },
                },
                REFRESH_INTERVAL_OPTIONS.map((option) =>
                  React.createElement(
                    "option",
                    { key: option.value, value: option.value },
                    option.label,
                  ),
                ),
              ),
            ),

            // Number Format Section
            React.createElement(
              NumberFormatSection,
              null,
              React.createElement(NumberFormatLabel, null, "Decimal Places"),
              React.createElement(
                NumberFormatSelect,
                {
                  value: decimalPlaces || DEFAULT_DECIMAL_PLACES,
                  onChange: (e) => {
                    const newPlaces = parseInt(e.target.value, 10);
                    if (onDecimalPlacesChange) {
                      onDecimalPlacesChange(newPlaces);
                    }
                  },
                },
                DECIMAL_PLACES_OPTIONS.map((option) =>
                  React.createElement(
                    "option",
                    { key: option.value, value: option.value },
                    option.label,
                  ),
                ),
              ),
              React.createElement(NumberFormatLabel, null, "Number Format"),
              React.createElement(
                NumberFormatSelect,
                {
                  value: separatorFormat || DEFAULT_SEPARATOR_FORMAT,
                  onChange: (e) => {
                    const newFormat = e.target.value;
                    if (onSeparatorFormatChange) {
                      onSeparatorFormatChange(newFormat);
                    }
                  },
                },
                SEPARATOR_FORMAT_OPTIONS.map((option) =>
                  React.createElement(
                    "option",
                    { key: option.value, value: option.value },
                    option.label,
                  ),
                ),
              ),
            ),

            // Currency Section
            React.createElement(
              CurrencySection,
              null,
              React.createElement(CurrencyLabel, null, "Currency"),
              React.createElement(
                CurrencySelect,
                {
                  value: currency || DEFAULT_CURRENCY,
                  onChange: (e) => {
                    const newCurrency = e.target.value;
                    if (onCurrencyChange) {
                      onCurrencyChange(newCurrency);
                    }
                  },
                },
                CURRENCY_OPTIONS.map((option) =>
                  React.createElement(
                    "option",
                    { key: option.value, value: option.value },
                    option.label,
                  ),
                ),
              ),
            ),

            // Tab Ticker Section
            React.createElement(
              ToggleSection,
              null,
              React.createElement(ToggleSectionTitle, null, "Tab Ticker"),
              React.createElement(
                ToggleSectionDesc,
                null,
                "Scroll prices in browser tab",
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(
                  ToggleLabel,
                  null,
                  tickerEnabled ? "On" : "Off",
                ),
                React.createElement(ToggleSwitch, {
                  active: tickerEnabled,
                  onClick: () =>
                    onTickerChange && onTickerChange(!tickerEnabled),
                  "aria-label": "Toggle tab ticker",
                }),
              ),
            ),

            // Ticker Format Section (only show when ticker is enabled)
            tickerEnabled &&
              React.createElement(
                RefreshIntervalSection,
                null,
                React.createElement(
                  RefreshIntervalLabel,
                  null,
                  "Ticker Format",
                ),
                React.createElement(
                  RefreshIntervalSelect,
                  {
                    value: tickerFormat || DEFAULT_TICKER_FORMAT,
                    onChange: (e) => {
                      if (onTickerFormatChange) {
                        onTickerFormatChange(e.target.value);
                      }
                    },
                  },
                  TICKER_FORMAT_OPTIONS.map((option) =>
                    React.createElement(
                      "option",
                      { key: option.value, value: option.value },
                      option.label,
                    ),
                  ),
                ),
              ),
          ),

        // Widgets Tab Content
        activeTab === "widgets" &&
          React.createElement(
            TabContent,
            { key: "widgets-tab" },
            React.createElement(
              ToggleSection,
              null,
              React.createElement(
                ToggleSectionDesc,
                null,
                "Show data widgets below chart",
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(ToggleLabel, null, "Fear & Greed"),
                React.createElement(ToggleSwitch, {
                  active: widgets.fearGreed,
                  onClick: () => onWidgetToggle && onWidgetToggle("fearGreed"),
                  "aria-label": "Toggle Fear & Greed widget",
                }),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(ToggleLabel, null, "Market Overview"),
                React.createElement(ToggleSwitch, {
                  active: widgets.marketOverview,
                  onClick: () =>
                    onWidgetToggle && onWidgetToggle("marketOverview"),
                  "aria-label": "Toggle Market Overview widget",
                }),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(ToggleLabel, null, "BTC Halving Countdown"),
                React.createElement(ToggleSwitch, {
                  active: widgets.halvingCountdown,
                  onClick: () =>
                    onWidgetToggle && onWidgetToggle("halvingCountdown"),
                  "aria-label": "Toggle BTC Halving Countdown widget",
                }),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(ToggleLabel, null, "RSI"),
                React.createElement(ToggleSwitch, {
                  active: widgets.rsiWidget,
                  onClick: () => onWidgetToggle && onWidgetToggle("rsiWidget"),
                  "aria-label": "Toggle RSI widget",
                }),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(ToggleLabel, null, "Funding Rate"),
                React.createElement(ToggleSwitch, {
                  active: widgets.fundingRate,
                  onClick: () => onWidgetToggle && onWidgetToggle("fundingRate"),
                  "aria-label": "Toggle Funding Rate widget",
                }),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(ToggleLabel, null, "Long / Short Ratio"),
                React.createElement(ToggleSwitch, {
                  active: widgets.longShortRatio,
                  onClick: () => onWidgetToggle && onWidgetToggle("longShortRatio"),
                  "aria-label": "Toggle Long/Short Ratio widget",
                }),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(ToggleLabel, null, "Open Interest"),
                React.createElement(ToggleSwitch, {
                  active: widgets.openInterest,
                  onClick: () => onWidgetToggle && onWidgetToggle("openInterest"),
                  "aria-label": "Toggle Open Interest widget",
                }),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(ToggleLabel, null, "Liquidations 24h"),
                React.createElement(ToggleSwitch, {
                  active: widgets.liquidations,
                  onClick: () => onWidgetToggle && onWidgetToggle("liquidations"),
                  "aria-label": "Toggle Liquidations widget",
                }),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(ToggleLabel, null, "Altcoin Season"),
                React.createElement(ToggleSwitch, {
                  active: widgets.altcoinSeason,
                  onClick: () => onWidgetToggle && onWidgetToggle("altcoinSeason"),
                  "aria-label": "Toggle Altcoin Season widget",
                }),
              ),
            ),
          ),
      ),
    );
  }
}

SettingsPanel.defaultProps = {
  coins: [],
  onAddCoin: null,
  onRemoveCoin: null,
  onReorderCoin: null,
  onResetCoins: null,
  onClose: null,
  visible: false,
  widgets: {
    fearGreed: false,
    marketOverview: false,
    halvingCountdown: false,
    rsiWidget: false,
    fundingRate: false,
    longShortRatio: false,
    openInterest: false,
    liquidations: false,
    altcoinSeason: false,
  },
  onWidgetToggle: null,
};

/* CRYPTO CHART */
class CryptoChart extends PureComponent {
  constructor(...args) {
    super(...args);

    // AbortController for canceling ongoing requests
    this.abortController = null;

    _defineProperty(this, "state", {
      coinIndex: 0,
      currentValue: null,
      period: PERIOD_OPTIONS[0].value,
      valueHistory: [],
      coinOptions: loadCoinOptionsFromStorage(),
      showSettings: false,
      themePreference: loadThemeFromStorage(), // 'auto', 'light', or 'dark'
      activeTheme: getActiveTheme(loadThemeFromStorage()), // 'light' or 'dark'
      refreshInterval: loadRefreshIntervalFromStorage(), // milliseconds
      decimalPlaces: loadDecimalPlacesFromStorage(), // number of decimal places
      separatorFormat: loadSeparatorFormatFromStorage(), // 'us', 'eu', 'space'
      currency: loadCurrencyFromStorage(), // 'USD', 'EUR', 'GBP', 'TRY'
      isOffline: !navigator.onLine, // Network status
      isLoading: true, // Initial loading state
      showSkeleton: false, // Delayed skeleton (shows after 300ms)
      invalidCoin: null, // Invalid coin warning
      apiError: false, // API failure state
      tickerEnabled: loadTickerFromStorage(), // Tab ticker mode
      tickerFormat: loadTickerFormatFromStorage(), // 'compact' or 'full'
      tickerText: "", // Full ticker string
      // Widget states
      widgets: loadWidgetsFromStorage(), // { fearGreed, marketOverview, halvingCountdown, rsiWidget }
      hiddenWidgets: loadHiddenWidgetsFromStorage(), // Per-widget hide state from main screen
      widgetOrder: loadWidgetOrderFromStorage(), // Drag-reorder
      dragWidget: null, // Currently dragged widget key
      fearGreedData: null, // { value, classification, timestamp }
      marketOverviewData: null, // { totalMarketCap, totalVolume, btcDominance, ... }
      halvingData: null, // { days, hours, minutes, blocksLeft, nextHalvingBlock }
      rsiValue: null, // RSI calculated from current valueHistory (0-100)
      fundingRateData: null, // { rate, percent, annualized }
      longShortData: null, // { longPct, shortPct }
      openInterestData: null, // { oiUsd, formatted }
      liquidationsData: null, // { total, longLiq, shortLiq, longPct, ... }
      altcoinSeasonData: null, // { index, label, outperformers, total }
    });

    // Ticker scroll position (class property to avoid re-renders)
    this.tickerScrollPos = 0;

    // Widget refresh interval
    this.widgetRefreshInterval = null;

    _defineProperty(this, "cycleCoinIndex", () => {
      this.tickerScrollPos = 0; // Reset ticker scroll on coin change
      this.setState(
        (prevState) => {
          const { coinOptions } = prevState;
          if (!coinOptions.length) {
            return null;
          }

          return {
            coinIndex: (prevState.coinIndex + 1) % coinOptions.length,
            isLoading: true, // Show loading when switching coins
            showSkeleton: false, // Reset skeleton
            invalidCoin: null, // Clear invalid coin warning
            apiError: false, // Clear API error when switching coins
          };
        },
        () => {
          this.startSkeletonTimer();
          this.fetchData();
          this.fetchWidgets();
        },
      );
    });

    _defineProperty(this, "setPeriod", (_e, period) => {
      this.setState(
        {
          period,
          apiError: false, // Clear API error when changing period
        },
        this.fetchData,
      );
    });

    _defineProperty(this, "startSkeletonTimer", () => {
      // Clear any existing timer
      if (this.skeletonTimer) {
        clearTimeout(this.skeletonTimer);
      }

      // Show skeleton after 300ms if still loading
      this.skeletonTimer = setTimeout(() => {
        if (this.state.isLoading) {
          this.setState({ showSkeleton: true });
        }
      }, 300);
    });

    _defineProperty(this, "fetchWidgets", async () => {
      const { widgets, coinOptions, coinIndex } = this.state;
      const coin = coinOptions[coinIndex] || "BTC";

      // Market-wide widgets
      if (widgets.fearGreed) {
        try {
          const data = await fetchFearGreedIndex();
          if (data) this.setState({ fearGreedData: data });
        } catch (e) { /* silent fail – widget shows stale data */ }
      }
      if (widgets.marketOverview) {
        try {
          const data = await fetchMarketOverview();
          if (data) this.setState({ marketOverviewData: data });
        } catch (e) { /* silent fail */ }
      }
      if (widgets.halvingCountdown) {
        try {
          const data = await fetchHalvingData();
          if (data) this.setState({ halvingData: data });
        } catch (e) { /* silent fail */ }
      }
      if (widgets.altcoinSeason) {
        try {
          const data = await fetchAltcoinSeason();
          if (data) this.setState({ altcoinSeasonData: data });
        } catch (e) { /* silent fail */ }
      }

      // Coin-specific widgets
      if (widgets.fundingRate) {
        try {
          const data = await fetchFundingRate(coin);
          this.setState({ fundingRateData: data });
        } catch (e) { /* silent fail */ }
      }
      if (widgets.longShortRatio) {
        try {
          const data = await fetchLongShortRatio(coin);
          this.setState({ longShortData: data });
        } catch (e) { /* silent fail */ }
      }
      if (widgets.openInterest) {
        try {
          const data = await fetchOpenInterest(coin);
          this.setState({ openInterestData: data });
        } catch (e) { /* silent fail */ }
      }
      if (widgets.liquidations) {
        try {
          const data = await fetchLiquidations(coin);
          this.setState({ liquidationsData: data });
        } catch (e) { /* silent fail */ }
      }
    });

    _defineProperty(this, "hideWidget", (widgetName) => {
      this.setState((prevState) => {
        const newHidden = { ...prevState.hiddenWidgets, [widgetName]: true };
        saveHiddenWidgetsToStorage(newHidden);
        return { hiddenWidgets: newHidden };
      });
    });

    _defineProperty(this, "restoreAllWidgets", () => {
      saveHiddenWidgetsToStorage({});
      this.setState({ hiddenWidgets: {} }, () => {
        this.fetchWidgets();
      });
    });

    _defineProperty(this, "onWidgetDragStart", (key) => {
      this.setState({ dragWidget: key });
    });

    _defineProperty(this, "onWidgetDragOver", (key) => {
      const { dragWidget, widgetOrder } = this.state;
      if (!dragWidget || dragWidget === key) return;
      const from = widgetOrder.indexOf(dragWidget);
      const to = widgetOrder.indexOf(key);
      if (from === -1 || to === -1) return;
      const newOrder = [...widgetOrder];
      newOrder.splice(from, 1);
      newOrder.splice(to, 0, dragWidget);
      saveWidgetOrderToStorage(newOrder);
      this.setState({ widgetOrder: newOrder });
    });

    _defineProperty(this, "onWidgetDragEnd", () => {
      this.setState({ dragWidget: null });
    });

    _defineProperty(this, "hideAllWidgets", () => {
      const { widgets } = this.state;
      const newHidden = {};
      Object.keys(widgets).forEach((key) => {
        if (widgets[key]) newHidden[key] = true;
      });
      saveHiddenWidgetsToStorage(newHidden);
      this.setState({ hiddenWidgets: newHidden });
    });

    _defineProperty(this, "handleWidgetToggle", (widgetName) => {
      this.setState(
        (prevState) => {
          const newWidgets = {
            ...prevState.widgets,
            [widgetName]: !prevState.widgets[widgetName],
          };
          saveWidgetsToStorage(newWidgets);
          return { widgets: newWidgets };
        },
        () => {
          // Fetch widget data if it was just enabled
          if (this.state.widgets[widgetName]) {
            this.fetchWidgets();
          }
        },
      );
    });

    _defineProperty(this, "fetchData", async () => {
      clearTimeout(this.fetchTimeout);

      // Cancel any ongoing requests
      if (this.abortController) {
        this.abortController.abort();
      }

      // Create new AbortController for this request
      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      const { coinIndex, period, refreshInterval, currency, isOffline } =
        this.state;
      const { coinOptions } = this.state;
      const activeCoin = coinOptions[coinIndex] || coinOptions[0];

      if (!activeCoin) {
        return;
      }

      // FIX: Sync state with actual network status
      if (isOffline !== !navigator.onLine) {
        this.setState({ isOffline: !navigator.onLine });
        // Re-run fetchData with correct state
        setTimeout(() => this.fetchData(), 0);
        return;
      }

      // If offline, use cache or clear data
      if (isOffline) {
        const cachedHistory = getCachedData(
          activeCoin,
          period,
          currency,
          "history",
        );
        const cachedSpot = getCachedData(
          activeCoin,
          "current",
          currency,
          "spot",
        );
        const cachedOHLC = getCachedData(activeCoin, period, currency, "ohlc");

        // Clear skeleton timer
        if (this.skeletonTimer) {
          clearTimeout(this.skeletonTimer);
        }

        // If we have cache for this coin, show it
        if (
          (cachedHistory && cachedHistory.data) ||
          (cachedSpot && cachedSpot.data) ||
          (cachedOHLC && cachedOHLC.data)
        ) {
          const newState = { isLoading: false, showSkeleton: false };
          if (cachedHistory && cachedHistory.data) {
            newState.valueHistory = cachedHistory.data;
            newState.rsiValue = calculateRSI(cachedHistory.data);
          }
          if (cachedSpot && cachedSpot.data) {
            newState.currentValue = cachedSpot.data;
          }
          if (cachedOHLC && cachedOHLC.data) {
            newState.ohlcData = cachedOHLC.data;
          }
          this.setState(newState, () => {
            updateTabTitle(
              this.state.coinOptions,
              this.state.coinIndex,
              this.state.currentValue,
              this.state.valueHistory,
            );
          });
        } else {
          // No cache available for this coin - clear old data
          this.setState({
            currentValue: null,
            valueHistory: [],
            ohlcData: [],
            isLoading: false,
            showSkeleton: false,
          });
        }

        this.fetchTimeout = setTimeout(this.fetchData, refreshInterval);
        return;
      }

      // STALE-WHILE-REVALIDATE: Check for stale cache data
      const cachedHistory = getCachedData(
        activeCoin,
        period,
        currency,
        "history",
      );
      const cachedSpot = getCachedData(activeCoin, "current", currency, "spot");
      const cachedOHLCStale = getCachedData(
        activeCoin,
        period,
        currency,
        "ohlc",
      );

      // If we have stale data, show it immediately while fetching fresh data
      if (cachedHistory && cachedHistory.isStale && cachedHistory.data) {
        this.setState({
          valueHistory: cachedHistory.data,
          rsiValue: calculateRSI(cachedHistory.data),
        });
      }

      if (cachedSpot && cachedSpot.isStale && cachedSpot.data) {
        this.setState({ currentValue: cachedSpot.data }, () => {
          updateTabTitle(
            this.state.coinOptions,
            this.state.coinIndex,
            this.state.currentValue,
            this.state.valueHistory,
          );
        });
      }

      if (cachedOHLCStale && cachedOHLCStale.isStale && cachedOHLCStale.data) {
        this.setState({ ohlcData: cachedOHLCStale.data });
      }

      // Fetch fresh data (will use cache if fresh, or make API call if stale/missing)
      try {
        const currentValue = await fetchCurrentValue(
          activeCoin,
          currency,
          signal,
          true,
          coinOptions,
        );
        const valueHistory = await fetchValueHistory(
          activeCoin,
          period,
          currency,
          signal,
          true,
          coinOptions,
        );

        // Clear skeleton timer
        if (this.skeletonTimer) {
          clearTimeout(this.skeletonTimer);
        }

        // Clear any previous warnings
        this.setState(
          {
            currentValue,
            valueHistory,
            rsiValue: calculateRSI(valueHistory),
            isLoading: false,
            showSkeleton: false,
            invalidCoin: null,
            apiError: false,
          },
          () => {
            // Update tab title after state is set
            // Always update normal title first (ticker will override when it starts)
            updateTabTitle(
              this.state.coinOptions,
              this.state.coinIndex,
              this.state.currentValue,
              this.state.valueHistory,
            );
            // Also update ticker text if ticker is running
            if (this.state.tickerEnabled && this.tickerInterval) {
              this.buildTickerText();
            }
          },
        );
      } catch (e) {
        // Don't log errors if request was aborted (expected behavior)
        if (e.name === "AbortError") {
          return;
        }

        // Clear skeleton timer
        if (this.skeletonTimer) {
          clearTimeout(this.skeletonTimer);
        }

        // Check if error is due to invalid coin data
        if (
          e.message &&
          (e.message.includes("invalid price data") ||
            e.message.includes("invalid spot data"))
        ) {
          this.setState({
            invalidCoin: activeCoin,
            isLoading: false,
            showSkeleton: false,
            apiError: false, // Invalid coin has its own warning, don't show API error
          });
          return;
        }

        // For other API errors, show error banner but keep cached data if available
        // Reuse cachedHistory / cachedSpot already fetched above for stale-while-revalidate
        const newState = {
          isLoading: false,
          showSkeleton: false,
          apiError: true, // Show API error banner
        };

        // If we have cached data, use it
        if (cachedHistory && cachedHistory.data) {
          newState.valueHistory = cachedHistory.data;
          newState.rsiValue = calculateRSI(cachedHistory.data);
        }
        if (cachedSpot && cachedSpot.data) {
          newState.currentValue = cachedSpot.data;
        }

        this.setState(newState, () => {
          // Update tab title with cached data if available
          if (newState.currentValue || newState.valueHistory) {
            updateTabTitle(
              this.state.coinOptions,
              this.state.coinIndex,
              this.state.currentValue,
              this.state.valueHistory,
            );
          }
        });
      }

      this.fetchTimeout = setTimeout(this.fetchData, refreshInterval);
    });

    _defineProperty(this, "toggleSettings", () => {
      this.setState((prevState) => ({ showSettings: !prevState.showSettings }));
    });

    _defineProperty(this, "handleThemeChange", (newTheme) => {
      saveThemeToStorage(newTheme);
      const activeTheme = getActiveTheme(newTheme);
      this.setState({
        themePreference: newTheme,
        activeTheme: activeTheme,
      });
    });

    _defineProperty(this, "handleRefreshIntervalChange", (newInterval) => {
      saveRefreshIntervalToStorage(newInterval);
      this.setState({ refreshInterval: newInterval }, () => {
        // Restart the fetch interval with new timing
        clearTimeout(this.fetchTimeout);
        this.fetchTimeout = setTimeout(
          this.fetchData,
          this.state.refreshInterval,
        );
      });
    });

    _defineProperty(this, "handleDecimalPlacesChange", (newPlaces) => {
      saveDecimalPlacesToStorage(newPlaces);
      this.setState({ decimalPlaces: newPlaces });
    });

    _defineProperty(this, "handleSeparatorFormatChange", (newFormat) => {
      saveSeparatorFormatToStorage(newFormat);
      this.setState({ separatorFormat: newFormat });
    });

    _defineProperty(this, "handleCurrencyChange", (newCurrency) => {
      saveCurrencyToStorage(newCurrency);
      this.setState({ currency: newCurrency }, () => {
        // Refetch data with new currency
        this.fetchData();
      });
    });

    _defineProperty(this, "handleTickerChange", (enabled) => {
      saveTickerToStorage(enabled);
      this.tickerScrollPos = 0;
      this.setState({ tickerEnabled: enabled }, () => {
        if (enabled) {
          this.buildTickerText();
          this.startTickerInterval();
        } else {
          this.stopTickerInterval();
          // Reset to current coin title
          updateTabTitle(
            this.state.coinOptions,
            this.state.coinIndex,
            this.state.currentValue,
            this.state.valueHistory,
          );
        }
      });
    });

    _defineProperty(this, "handleTickerFormatChange", (format) => {
      saveTickerFormatToStorage(format);
      this.setState({ tickerFormat: format }, () => {
        if (this.state.tickerEnabled) {
          this.buildTickerText();
        }
      });
    });

    _defineProperty(this, "handleOnline", () => {
      this.setState({ isOffline: false });
      // Refetch data when coming back online
      this.fetchData();
    });

    _defineProperty(this, "handleOffline", () => {
      this.setState({ isOffline: true });
    });

    _defineProperty(this, "handleRemoveInvalidCoin", () => {
      const { invalidCoin } = this.state;
      if (invalidCoin) {
        this.handleRemoveCoinOption(invalidCoin);
        this.setState({ invalidCoin: null });
      }
    });

    _defineProperty(this, "handleDismissInvalidCoin", () => {
      this.setState({ invalidCoin: null });
      // Cycle to next coin
      this.cycleCoinIndex();
    });

    _defineProperty(this, "prefetchTopCoins", async () => {
      const { coinOptions, period, currency, coinIndex } = this.state;
      const topCoins = coinOptions.slice(0, MAX_CACHED_COINS);

      // Skip the first coin (already loaded)
      for (let i = 1; i < topCoins.length; i++) {
        const coin = topCoins[i];

        // Skip if it's the currently displayed coin
        if (i === coinIndex) continue;

        try {
          // Wait 500ms between requests to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Fetch and cache this coin's data
          await fetchCurrentValue(coin, currency, null, true, coinOptions);
          await fetchValueHistory(
            coin,
            period,
            currency,
            null,
            true,
            coinOptions,
          );

          // Throttled ticker update (max once per 2 seconds during prefetch)
          if (this.state.tickerEnabled && !this.tickerUpdatePending) {
            this.tickerUpdatePending = true;
            setTimeout(() => {
              this.buildTickerText();
              this.tickerUpdatePending = false;
            }, 2000);
          }
        } catch (error) {
          // Continue with next coin even if this one fails
        }
      }

      // Final ticker update after prefetch completes
      if (this.state.tickerEnabled) {
        this.buildTickerText();
      }
    });

    _defineProperty(this, "handleAddCoinOption", (symbol) => {
      const normalized = (symbol || "").trim().toUpperCase();

      if (!normalized) {
        return { success: false, reason: "empty" };
      }

      if (!/^[A-Z0-9]{2,10}$/.test(normalized)) {
        return { success: false, reason: "format" };
      }

      if (!SUGGESTED_COINS.includes(normalized)) {
        return { success: false, reason: "unsupported" };
      }

      if (this.state.coinOptions.includes(normalized)) {
        return { success: false, reason: "duplicate" };
      }

      if (this.state.coinOptions.length >= MAX_COINS) {
        return { success: false, reason: "limit" };
      }

      this.setState((prevState) => {
        const newCoinOptions = [...prevState.coinOptions, normalized];
        saveCoinOptionsToStorage(newCoinOptions);
        return { coinOptions: newCoinOptions };
      });

      return { success: true };
    });

    _defineProperty(this, "handleRemoveCoinOption", (symbol) => {
      const normalized = (symbol || "").trim().toUpperCase();

      this.setState((prevState) => {
        const filtered = prevState.coinOptions.filter((c) => c !== normalized);
        const nextIndex = Math.min(prevState.coinIndex, filtered.length - 1);
        saveCoinOptionsToStorage(filtered);
        return {
          coinOptions: filtered,
          coinIndex: Math.max(0, nextIndex),
        };
      }, this.fetchData);
    });

    _defineProperty(this, "handleResetCoins", () => {
      const defaults = [...DEFAULT_COIN_OPTIONS];
      saveCoinOptionsToStorage(defaults);
      this.setState({ coinOptions: defaults, coinIndex: 0 }, this.fetchData);
    });

    _defineProperty(this, "handleReorderCoinOption", (source, target) => {
      if (!source || !target || source === target) {
        return;
      }

      this.setState((prevState) => {
        const list = [...prevState.coinOptions];
        const fromIndex = list.indexOf(source);
        const toIndex = list.indexOf(target);

        if (fromIndex === -1 || toIndex === -1) {
          return null;
        }

        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);

        const activeCoin = prevState.coinOptions[prevState.coinIndex];
        const nextActiveIndex = Math.max(0, list.indexOf(activeCoin));

        saveCoinOptionsToStorage(list);
        return {
          coinOptions: list,
          coinIndex: nextActiveIndex,
        };
      });
    });

    // Ticker interval methods
    // Build the full ticker text from all coins
    _defineProperty(this, "buildTickerText", () => {
      const {
        coinOptions,
        currency,
        period,
        tickerFormat,
        decimalPlaces,
        separatorFormat,
      } = this.state;
      if (!coinOptions || coinOptions.length === 0) {
        this.setState({ tickerText: "" });
        return;
      }

      const curr = currency || DEFAULT_CURRENCY;
      const currencySymbol = getCurrencySymbol(curr);
      const parts = [];

      for (const coin of coinOptions) {
        const cachedSpot = getCachedData(coin, "current", curr, "spot");
        const cachedHistory = getCachedData(coin, period, curr, "history");

        let priceStr = "—";
        let percentStr = "";

        if (cachedSpot && cachedSpot.data) {
          const price = cachedSpot.data;
          priceStr = formatTickerPrice(
            price,
            currencySymbol,
            tickerFormat,
            decimalPlaces,
            separatorFormat,
          );

          if (
            cachedHistory &&
            cachedHistory.data &&
            cachedHistory.data.length > 0
          ) {
            const percentDelta = derivePercentDelta(price, cachedHistory.data);
            if (typeof percentDelta === "number") {
              const sign = percentDelta >= 0 ? "+" : "";
              percentStr = ` ${sign}${percentDelta.toFixed(1)}%`;
            }
          }
        }

        parts.push(`${coin} ${priceStr}${percentStr}`);
      }

      // Join with separator and add padding for smooth loop
      const tickerText = parts.join("  ●  ") + "  ●  ";
      this.tickerScrollPos = 0;
      this.setState({ tickerText });
    });

    _defineProperty(this, "startTickerInterval", () => {
      this.stopTickerInterval();
      // Build initial ticker text
      this.buildTickerText();
      // Start scrolling interval
      this.tickerInterval = setInterval(() => {
        this.scrollTickerTitle();
      }, TICKER_SCROLL_INTERVAL);
      // Refresh ticker text every 30 seconds to update prices
      this.tickerRefreshInterval = setInterval(() => {
        this.buildTickerText();
      }, 30000);
    });

    _defineProperty(this, "stopTickerInterval", () => {
      if (this.tickerInterval) {
        clearInterval(this.tickerInterval);
        this.tickerInterval = null;
      }
      if (this.tickerRefreshInterval) {
        clearInterval(this.tickerRefreshInterval);
        this.tickerRefreshInterval = null;
      }
    });

    _defineProperty(this, "scrollTickerTitle", () => {
      const { tickerText } = this.state;
      if (!tickerText) {
        document.title = "New Tab";
        return;
      }

      const displayLength = 50;
      const textLength = tickerText.length;

      // Use slice for better performance (no loop, no string concatenation)
      // Double the text for seamless wrap-around
      const doubledText = tickerText + tickerText;
      const visibleText = doubledText.slice(
        this.tickerScrollPos,
        this.tickerScrollPos + displayLength,
      );

      document.title = visibleText;

      // Update scroll position without setState (avoids re-render every 250ms)
      this.tickerScrollPos =
        (this.tickerScrollPos + TICKER_SCROLL_CHARS) % textLength;
    });
  }

  componentDidMount() {
    this.fetchData();
    // Set initial tab title
    updateTabTitle(
      this.state.coinOptions,
      this.state.coinIndex,
      this.state.currentValue,
      this.state.valueHistory,
    );

    // Set initial body theme
    const colors =
      this.state.activeTheme === "light" ? lightColors : darkColors;
    document.body.style.backgroundColor = colors.bg;
    document.body.style.color = colors.text;

    // Listen for system theme changes
    this.mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    this.handleSystemThemeChange = (e) => {
      // Only update if user has 'auto' theme preference
      if (this.state.themePreference === "auto") {
        this.setState({ activeTheme: e.matches ? "light" : "dark" });
      }
    };

    // Listen for system theme changes (for auto mode)
    this.mediaQuery.addEventListener("change", this.handleSystemThemeChange);

    // Listen for online/offline events
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);

    // Start cache cleanup interval (every 2 minutes, check for entries unused for 10+ minutes)
    this.cacheCleanupInterval = setInterval(cleanupCache, 120000); // 2 minutes

    // Prefetch top 10 coins in background (after initial load)
    this.prefetchTimer = setTimeout(() => this.prefetchTopCoins(), 2000);

    // Start ticker interval if enabled (delay 3s for prices to load)
    if (this.state.tickerEnabled) {
      this.tickerStartTimer = setTimeout(() => {
        this.startTickerInterval();
      }, 3000);
    }

    // Fetch widget data if any widgets are enabled
    this.fetchWidgets();
    // Refresh widgets every 5 minutes
    this.widgetRefreshInterval = setInterval(() => this.fetchWidgets(), 300000);
  }

  componentWillUnmount() {
    clearTimeout(this.fetchTimeout);
    clearTimeout(this.prefetchTimer);
    clearTimeout(this.tickerStartTimer);
    clearInterval(this.cacheCleanupInterval);
    clearInterval(this.widgetRefreshInterval);
    this.stopTickerInterval();

    // Cancel any ongoing requests
    if (this.abortController) {
      this.abortController.abort();
    }

    document.body.style.overflow = "";
    // Reset tab title on unmount
    document.title = "New Tab";

    // Clean up theme listener
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener(
        "change",
        this.handleSystemThemeChange,
      );
    }

    // Clean up online/offline listeners
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
  }

  componentDidUpdate(_prevProps, prevState) {
    if (prevState.showSettings !== this.state.showSettings) {
      document.body.style.overflow = this.state.showSettings ? "hidden" : "";
    }

    // Update body background and text color when theme changes
    if (prevState.activeTheme !== this.state.activeTheme) {
      const colors =
        this.state.activeTheme === "light" ? lightColors : darkColors;
      document.body.style.backgroundColor = colors.bg;
      document.body.style.color = colors.text;
    }
  }

  render() {
    const {
      coinIndex,
      coinOptions,
      currentValue,
      period,
      valueHistory,
      showSettings,
      themePreference,
      activeTheme,
      refreshInterval,
      decimalPlaces,
      separatorFormat,
      currency,
      isOffline,
      isLoading,
      showSkeleton,
      invalidCoin,
      apiError,
      widgets,
      fearGreedData,
      marketOverviewData,
      halvingData,
      rsiValue,
      fundingRateData,
      longShortData,
      openInterestData,
      liquidationsData,
      altcoinSeasonData,
      widgetOrder,
      dragWidget,
    } = this.state;
    const fgAngle = fearGreedData
      ? (180 - fearGreedData.value * 1.8) * (Math.PI / 180)
      : Math.PI / 2;
    const fgNeedleX = (50 + 30 * Math.cos(fgAngle)).toFixed(1);
    const fgNeedleY = (50 - 30 * Math.sin(fgAngle)).toFixed(1);
    const activeCoin = coinOptions[coinIndex] || coinOptions[0] || "BTC";

    // Select color palette based on active theme
    const colors = activeTheme === "light" ? lightColors : darkColors;
    const currentTheme = {
      ...theme,
      color: colors,
    };

    return React.createElement(
      ThemeProvider,
      { theme: currentTheme },
      React.createElement(
        Fragment,
        null,
        // Offline notification
        isOffline &&
          React.createElement(
            OfflineMessage,
            null,
            "You are offline. Data will update when connection is restored.",
          ),
        // API error notification (only show if not offline)
        !isOffline &&
          apiError &&
          React.createElement(
            ApiErrorMessage,
            null,
            "Unable to fetch latest data. Showing cached prices.",
          ),
        // Invalid coin warning
        invalidCoin &&
          React.createElement(
            InvalidCoinWarning,
            null,
            React.createElement(
              InvalidCoinMessage,
              null,
              `${invalidCoin} is not available or invalid`,
            ),
            React.createElement(
              InvalidCoinButton,
              { onClick: this.handleRemoveInvalidCoin },
              "Remove",
            ),
            React.createElement(
              InvalidCoinButton,
              { onClick: this.handleDismissInvalidCoin },
              "Skip",
            ),
          ),
        React.createElement(
          AppShell,
          null,
          React.createElement(
            SettingsToggleButton,
            {
              onClick: this.toggleSettings,
              open: showSettings,
              type: "button",
              "aria-label": showSettings ? "Close settings" : "Open settings",
              title: showSettings ? "Close settings" : "Settings",
            },
            showSettings ? "×" : "⚙",
          ),

          React.createElement(
            ControlsStack,
            null,

            // Show skeleton or actual overview
            showSkeleton
              ? React.createElement(
                  SkeletonOverview,
                  null,
                  React.createElement(SkeletonBox, {
                    width: "8rem",
                    height: "2.5rem",
                  }),
                  React.createElement(SkeletonBox, {
                    width: "6rem",
                    height: "1rem",
                  }),
                )
              : React.createElement(Overview, {
                  coin: activeCoin,
                  cycleCoinIndex: this.cycleCoinIndex,
                  currentValue,
                  valueHistory,
                  decimalPlaces,
                  separatorFormat,
                  currency,
                }),

            // Show skeleton or actual period switcher
            showSkeleton
              ? React.createElement(
                  SkeletonPeriodSwitcher,
                  null,
                  Array(6)
                    .fill()
                    .map((_, i) =>
                      React.createElement(SkeletonBox, {
                        key: i,
                        width: "3rem",
                        height: "2rem",
                      }),
                    ),
                )
              : React.createElement(PeriodSwitcher, {
                  onChange: this.setPeriod,
                  options: PERIOD_OPTIONS,
                  value: period,
                }),
          ),

          React.createElement(
            FullBleed,
            null,
            React.createElement(
              ChartWrapper,
              null,
              // Show skeleton or actual chart
              showSkeleton
                ? React.createElement(SkeletonChart, null)
                : React.createElement(Line, { prices: valueHistory }),
            ),
          ),
        ),
        // Widget toggle button (eye icon): hide-all when visible, restore when all hidden
        (() => {
          if (showSettings) return null;
          const hidden = this.state.hiddenWidgets;
          const anyEnabled = Object.keys(widgets).some((k) => widgets[k]);
          if (!anyEnabled) return null;
          const anyVisible = Object.keys(widgets).some(
            (k) => widgets[k] && !hidden[k],
          );
          if (anyVisible) {
            // × — hide all widgets
            return React.createElement(
              WidgetRestoreButton,
              {
                onClick: this.hideAllWidgets,
                type: "button",
                "aria-label": "Hide all widgets",
                title: "Hide all widgets",
              },
              "\u00d7",
            );
          }
          // Open eye — restore all widgets
          return React.createElement(
            WidgetRestoreButton,
            {
              onClick: this.restoreAllWidgets,
              type: "button",
              "aria-label": "Show hidden widgets",
              title: "Show hidden widgets",
            },
            "\uD83D\uDC41",
          );
        })(),
        // Widget Panel (drag-reorderable, show enabled widgets that are not individually hidden)
        (() => {
          const hidden = this.state.hiddenWidgets;
          const widgetDefs = {
            fearGreed: {
              label: "Fear & Greed",
              visible: widgets.fearGreed && !hidden.fearGreed,
              content: fearGreedData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      "svg",
                      {
                        viewBox: "0 8 100 44",
                        style: {
                          display: "block",
                          margin: "0 auto",
                          width: "92px",
                          height: "40px",
                          overflow: "visible",
                        },
                      },
                      React.createElement(GaugeTrackPath, { d: GAUGE_ARC }),
                      GAUGE_SEGS.map((seg, i) =>
                        React.createElement("path", {
                          key: "seg-" + i,
                          d: GAUGE_ARC,
                          fill: "none",
                          stroke: seg.color,
                          strokeWidth: "7",
                          strokeLinecap:
                            i === 0 || i === 4 ? "round" : "butt",
                          strokeDasharray: seg.len + " " + GAUGE_LEN,
                          strokeDashoffset: -seg.offset,
                        }),
                      ),
                      React.createElement(GaugeNeedle, {
                        x1: "50",
                        y1: "50",
                        x2: fgNeedleX,
                        y2: fgNeedleY,
                      }),
                      React.createElement(GaugeCenterDot, {
                        cx: "50",
                        cy: "50",
                        r: "3",
                      }),
                    ),
                    React.createElement(
                      WidgetValue,
                      { style: { marginTop: "3px" } },
                      fearGreedData.value,
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      fearGreedData.classification,
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            marketOverview: {
              label: "Market",
              visible: widgets.marketOverview && !hidden.marketOverview,
              content: marketOverviewData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      WidgetValue,
                      { style: { fontSize: "0.85rem" } },
                      React.createElement(MarketStatLabel, null, "Cap"),
                      "$" +
                        (marketOverviewData.totalMarketCap / 1e12).toFixed(
                          2,
                        ) +
                        "T",
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      React.createElement(MarketStatLabel, null, "BTC"),
                      marketOverviewData.btcDominance.toFixed(1) + "%",
                      " ",
                      React.createElement(MarketStatLabel, null, "ETH"),
                      marketOverviewData.ethDominance.toFixed(1) + "%",
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            halvingCountdown: {
              label: "BTC Halving",
              visible: widgets.halvingCountdown && !hidden.halvingCountdown,
              content: halvingData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      HalvingTimeGrid,
                      null,
                      React.createElement(
                        HalvingTimeUnit,
                        null,
                        React.createElement(
                          HalvingTimeNumber,
                          null,
                          String(halvingData.years).padStart(2, "0"),
                        ),
                        React.createElement(HalvingTimeLabel, null, "Yrs"),
                      ),
                      React.createElement(HalvingTimeSep, null, ":"),
                      React.createElement(
                        HalvingTimeUnit,
                        null,
                        React.createElement(
                          HalvingTimeNumber,
                          null,
                          String(halvingData.remainingDays).padStart(3, "0"),
                        ),
                        React.createElement(HalvingTimeLabel, null, "Days"),
                      ),
                      React.createElement(HalvingTimeSep, null, ":"),
                      React.createElement(
                        HalvingTimeUnit,
                        null,
                        React.createElement(
                          HalvingTimeNumber,
                          null,
                          String(halvingData.hours).padStart(2, "0"),
                        ),
                        React.createElement(HalvingTimeLabel, null, "Hrs"),
                      ),
                      React.createElement(HalvingTimeSep, null, ":"),
                      React.createElement(
                        HalvingTimeUnit,
                        null,
                        React.createElement(
                          HalvingTimeNumber,
                          null,
                          String(halvingData.minutes).padStart(2, "0"),
                        ),
                        React.createElement(HalvingTimeLabel, null, "Min"),
                      ),
                    ),
                    React.createElement(
                      "div",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          marginTop: "5px",
                        },
                      },
                      React.createElement(
                        HalvingProgressBar,
                        { style: { flex: 1, marginTop: 0 } },
                        React.createElement(HalvingProgressFill, {
                          percent: halvingData.progressPercent,
                        }),
                      ),
                      React.createElement(
                        HalvingTimeLabel,
                        null,
                        halvingData.progressPercent + "%",
                      ),
                    ),
                    React.createElement(
                      HalvingEta,
                      null,
                      "ETA: " + halvingData.etaFormatted,
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            rsiWidget: {
              label: "RSI",
              visible: widgets.rsiWidget && !hidden.rsiWidget,
              content:
                rsiValue !== null
                  ? React.createElement(
                      Fragment,
                      null,
                      React.createElement(WidgetValue, null, rsiValue),
                      React.createElement(
                        RsiBar,
                        null,
                        React.createElement(RsiMarker, {
                          value: Math.min(Math.max(rsiValue, 2), 98),
                        }),
                      ),
                      React.createElement(
                        RsiLabels,
                        null,
                        React.createElement(
                          HalvingTimeLabel,
                          null,
                          "Oversold",
                        ),
                        React.createElement(
                          HalvingTimeLabel,
                          null,
                          "Overbought",
                        ),
                      ),
                    )
                  : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            fundingRate: {
              label: activeCoin + " Funding",
              visible: widgets.fundingRate && !hidden.fundingRate,
              content: fundingRateData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      FundingValue,
                      { positive: fundingRateData.rate > 0 },
                      (fundingRateData.rate >= 0 ? "+" : "") +
                        fundingRateData.percent +
                        "%",
                    ),
                    React.createElement(
                      FundingAnnual,
                      null,
                      "Ann. " +
                        (fundingRateData.annualized >= 0 ? "+" : "") +
                        fundingRateData.annualized +
                        "%",
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            longShortRatio: {
              label: activeCoin + " L/S Ratio",
              visible: widgets.longShortRatio && !hidden.longShortRatio,
              content: longShortData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      LSBarWrap,
                      null,
                      React.createElement(LSBarLong, {
                        pct: parseFloat(longShortData.longPct),
                      }),
                      React.createElement(LSBarShort, null),
                    ),
                    React.createElement(
                      LSRow,
                      null,
                      React.createElement(
                        "span",
                        { style: { color: "#34d399" } },
                        "L " + longShortData.longPct + "%",
                      ),
                      React.createElement(
                        "span",
                        { style: { color: "#f87171" } },
                        "S " + longShortData.shortPct + "%",
                      ),
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            openInterest: {
              label: activeCoin + " Open Int.",
              visible: widgets.openInterest && !hidden.openInterest,
              content: openInterestData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      OIValue,
                      null,
                      openInterestData.formatted,
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      "Open Interest",
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            liquidations: {
              label: activeCoin + " Liqs 24h",
              visible: widgets.liquidations && !hidden.liquidations,
              content: liquidationsData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      OIValue,
                      null,
                      liquidationsData.totalFormatted,
                    ),
                    React.createElement(
                      LiqBarWrap,
                      null,
                      React.createElement(LiqBarLong, {
                        pct: liquidationsData.longPct,
                      }),
                      React.createElement(LiqBarShort, null),
                    ),
                    React.createElement(
                      LiqRow,
                      null,
                      React.createElement(
                        "span",
                        { style: { color: "#f87171" } },
                        "L " + liquidationsData.longFormatted,
                      ),
                      React.createElement(
                        "span",
                        { style: { color: "#34d399" } },
                        "S " + liquidationsData.shortFormatted,
                      ),
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            altcoinSeason: {
              label: "Alt Season",
              visible: widgets.altcoinSeason && !hidden.altcoinSeason,
              content: altcoinSeasonData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      OIValue,
                      null,
                      altcoinSeasonData.index + " / 100",
                    ),
                    React.createElement(
                      AltSeasonBar,
                      null,
                      React.createElement(AltSeasonMarker, {
                        pct: altcoinSeasonData.index,
                      }),
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      altcoinSeasonData.label,
                    ),
                    React.createElement(
                      FundingAnnual,
                      null,
                      "BTC Dom " + altcoinSeasonData.btcDom + "%",
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
          };

          const visibleOrder = widgetOrder.filter(
            (key) => widgetDefs[key] && widgetDefs[key].visible,
          );
          if (!visibleOrder.length) return null;

          return React.createElement(
            WidgetPanel,
            { visible: true },
            ...visibleOrder.map((key) => {
              const def = widgetDefs[key];
              return React.createElement(
                WidgetCard,
                {
                  key: key,
                  dragging: dragWidget === key,
                  draggable: true,
                  onDragStart: () => this.onWidgetDragStart(key),
                  onDragOver: (e) => {
                    e.preventDefault();
                    this.onWidgetDragOver(key);
                  },
                  onDragEnd: this.onWidgetDragEnd,
                },
                React.createElement(
                  WidgetHideButton,
                  { onClick: () => this.hideWidget(key), title: "Hide" },
                  "\u00d7",
                ),
                React.createElement(WidgetLabel, null, def.label),
                def.content,
              );
            }),
          );
        })(),
        // LAZY LOADING: Only render SettingsPanel when user opens it
        showSettings &&
          React.createElement(SettingsPanel, {
            coins: coinOptions,
            visible: showSettings,
            onAddCoin: this.handleAddCoinOption,
            onRemoveCoin: this.handleRemoveCoinOption,
            onReorderCoin: this.handleReorderCoinOption,
            onResetCoins: this.handleResetCoins,
            onClose: this.toggleSettings,
            themePreference: themePreference,
            activeTheme: activeTheme,
            onThemeChange: this.handleThemeChange,
            refreshInterval: refreshInterval,
            onRefreshIntervalChange: this.handleRefreshIntervalChange,
            decimalPlaces: decimalPlaces,
            separatorFormat: separatorFormat,
            onDecimalPlacesChange: this.handleDecimalPlacesChange,
            onSeparatorFormatChange: this.handleSeparatorFormatChange,
            currency: currency,
            onCurrencyChange: this.handleCurrencyChange,
            tickerEnabled: this.state.tickerEnabled,
            onTickerChange: this.handleTickerChange,
            tickerFormat: this.state.tickerFormat,
            onTickerFormatChange: this.handleTickerFormatChange,
            widgets: widgets,
            onWidgetToggle: this.handleWidgetToggle,
          }),
      ),
    );
  }
}

/* APP */
const App = () =>
  React.createElement(
    ThemeProvider,
    { theme: theme },
    React.createElement(CryptoChart, null),
  );

/* GLOBAL STYLES */
injectGlobal`
  html {
    box-sizing: border-box;
  }

  *,
  *:before,
  *:after {
    box-sizing: inherit;
  }

  html,
  body {
    min-height: 100vh;
    max-height: 100vh;
    overflow: hidden;
  }

  body {
    display: flex;
    margin: 0;
    padding: 0;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    background-color: ${theme.color.bg};
    color: ${theme.color.text};
    font-family: 'Roboto Mono', monospace;
    font-weight: 400;
    font-size: 14px;
    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  @media (max-width: ${theme.breakpoint.down.sm}px) {
    body {
      padding: 0;
    }
  }

  #root {
    width: 100%;
    height: 100vh;
    max-height: 100vh;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    overflow: hidden;
  }
`;

/* RENDER */
const app = document.createElement("div");
app.setAttribute("id", "root");
document.body.appendChild(app);

ReactDOM.render(React.createElement(App, null), app);
