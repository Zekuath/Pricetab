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

/* RETRY MECHANISM WITH CANCELLATION SUPPORT */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* CACHE MANAGEMENT */
const CACHE_TTL = 30000; // 30 seconds cache lifetime
const CACHE_CLEANUP_INTERVAL = 600000; // 10 minutes
const MAX_CACHED_COINS = 10; // Only cache first 10 coins in rotation
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
  allowedCoins = []
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
  { value: "hour", label: "1H" },
  { value: "day", label: "1D" },
  { value: "week", label: "1W" },
  { value: "month", label: "1M" },
  { value: "year", label: "1Y" },
  { value: "all", label: "ALL" },
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

// Theme helper functions
const loadThemeFromStorage = () => {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme && ["auto", "light", "dark"].includes(savedTheme)) {
      return savedTheme;
    }
    return "auto"; // Default to auto
  } catch (error) {
    console.error("Failed to load theme from localStorage:", error);
    return "auto";
  }
};

const saveThemeToStorage = (theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.error("Failed to save theme to localStorage:", error);
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
        (opt) => opt.value === parsed
      );
      if (isValid) {
        return parsed;
      }
    }
    return DEFAULT_REFRESH_INTERVAL;
  } catch (error) {
    console.error("Failed to load refresh interval from localStorage:", error);
    return DEFAULT_REFRESH_INTERVAL;
  }
};

const saveRefreshIntervalToStorage = (interval) => {
  try {
    localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, interval.toString());
  } catch (error) {
    console.error("Failed to save refresh interval to localStorage:", error);
  }
};

// Number format helper functions
const loadDecimalPlacesFromStorage = () => {
  try {
    const saved = localStorage.getItem(DECIMAL_PLACES_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      const isValid = DECIMAL_PLACES_OPTIONS.some(
        (opt) => opt.value === parsed
      );
      if (isValid) {
        return parsed;
      }
    }
    return DEFAULT_DECIMAL_PLACES;
  } catch (error) {
    console.error("Failed to load decimal places from localStorage:", error);
    return DEFAULT_DECIMAL_PLACES;
  }
};

const saveDecimalPlacesToStorage = (places) => {
  try {
    localStorage.setItem(DECIMAL_PLACES_STORAGE_KEY, places.toString());
  } catch (error) {
    console.error("Failed to save decimal places to localStorage:", error);
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
    console.error("Failed to load separator format from localStorage:", error);
    return DEFAULT_SEPARATOR_FORMAT;
  }
};

const saveSeparatorFormatToStorage = (format) => {
  try {
    localStorage.setItem(SEPARATOR_FORMAT_STORAGE_KEY, format);
  } catch (error) {
    console.error("Failed to save separator format to localStorage:", error);
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
    console.error("Failed to load currency from localStorage:", error);
    return DEFAULT_CURRENCY;
  }
};

const saveCurrencyToStorage = (currency) => {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch (error) {
    console.error("Failed to save currency to localStorage:", error);
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
          .filter(coin => typeof coin === 'string' && SUGGESTED_COINS.includes(coin.toUpperCase()))
          .map(coin => coin.toUpperCase())
          .slice(0, 20);

        if (validCoins.length > 0) {
          return validCoins;
        }
      }
    }
  } catch (e) {
    console.warn("Failed to load coin options from localStorage:", e);
  }
  return DEFAULT_COIN_OPTIONS.slice();
};

const saveCoinOptionsToStorage = (coinOptions) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(coinOptions));
  } catch (e) {
    console.warn("Failed to save coin options to localStorage:", e);
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
    console.warn("Failed to update tab title:", e);
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
  paddingRight = 0
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
  separatorFormat = DEFAULT_SEPARATOR_FORMAT
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

/* API FETCHING WITH CACHE & STALE-WHILE-REVALIDATE */
const fetchValueHistory = async (
  coin,
  period,
  currency = "USD",
  signal = null,
  useCache = true,
  allowedCoins = []
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
    options
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
      allowedCoins
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
  allowedCoins = []
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
    options
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
      }, 150)
    );

    _defineProperty(this, "updatePath", () => {
      const { prices } = this.props;

      const d = lineFromPrices(
        scalePrices(
          safePrices(prices),
          this.height,
          this.width,
          PADDING,
          PADDING
        )
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
        scalePrices(safePrices(prices), height, width, PADDING, PADDING)
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
      })
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
  transition: background 0.2s ease, color 0.2s ease;
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
  transition: color 0.2s ease, font-weight 0.2s ease;
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
    const { active, children } = this.props;

    return React.createElement(
      PeriodButton,
      { active: active, onClick: this.handleClick },
      React.createElement(PeriodText, { active: active }, children)
    );
  }
}

_defineProperty(PeriodItem, "defaultProps", {
  active: false,
  children: null,
  onClick: null,
  value: null,
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
            },
            o.label
          )
        )
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

const OverviewItem = ({ children, label, onClick }) =>
  React.createElement(
    OverviewItemButton,
    { onClick },
    React.createElement(
      Value,
      null,
      children || React.createElement(Fragment, null, "\u00A0")
    ),
    React.createElement(Label, null, label)
  );

OverviewItem.defaultProps = {
  children: null,
  label: "",
  onClick: null,
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
          separatorFormat
        )
      : formatNumberString(
          deriveValueDelta(currentValue, valueHistory),
          currencySymbol,
          false,
          false,
          decimalPlaces,
          separatorFormat
        );

    return React.createElement(
      OverviewWrapper,
      null,
      React.createElement(
        OverviewItem,
        {
          onClick: this.props.cycleCoinIndex,
          label: `${coin} Price`,
        },
        formatNumberString(
          currentValue,
          currencySymbol,
          true,
          false,
          decimalPlaces,
          separatorFormat
        )
      ),
      React.createElement(
        OverviewItem,
        {
          onClick: this.togglePercentage,
          label: `${calcPercentage ? "Percent" : "Price"} Change`,
        },
        delta
      )
    );
  }
}

/* LAYOUT */
const AppShell = styled.main`
  width: 100%;
  max-width: 100%;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: ${({ theme }) =>
    `${theme.spacing.medium}rem ${theme.spacing.large * 2}rem`};
  position: relative;

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
  padding-top: 1px;
  padding-bottom: ${({ theme }) => theme.spacing.small}rem;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    min-height: calc(100vh - 20rem);
    height: calc(100vh - 20rem);
  }
`;

const FullBleed = styled.div`
  width: 100vw;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  display: block;
  overflow: hidden;
  padding: 1px 0;
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
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  background: ${({ selected, theme }) =>
    selected ? theme.color.text : "transparent"};
  color: ${({ selected, theme }) =>
    selected ? theme.color.bg : theme.color.text};
  text-transform: uppercase;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease,
    opacity 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
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

const CoinSectionTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.875rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
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
`;

const SettingsActionButton = styled.button`
  padding: 0.75rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: none;
  cursor: pointer;
  background: ${({ theme }) => theme.color.text};
  color: ${({ theme }) => theme.color.bg};
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  transition: transform 0.2s ease, box-shadow 0.2s ease;

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
  background-image: linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position: calc(100% - 15px) center, calc(100% - 10px) center;
  background-size: 5px 5px, 5px 5px;
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
  background-image: linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position: calc(100% - 15px) center, calc(100% - 10px) center;
  background-size: 5px 5px, 5px 5px;
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
  background-image: linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position: calc(100% - 15px) center, calc(100% - 10px) center;
  background-size: 5px 5px, 5px 5px;
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
                coin.startsWith(pendingCoin) && !activeCoins.includes(coin)
            ).slice(0, 6)
          : [];

        this.setState({ suggestions });
      }, 200)
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
            "Coins"
          ),
          React.createElement(
            TabButton,
            {
              active: activeTab === "preferences",
              onClick: () => this.handleTabChange("preferences"),
            },
            "Preferences"
          )
        ),

        // Coins Tab Content
        activeTab === "coins" &&
          React.createElement(
            TabContent,
            { key: "coins-tab" },
            React.createElement(
              SettingsDescription,
              null,
              "Tap any ticker below to add it to the rotation. Selected coins stay highlighted white."
            ),

            React.createElement(CoinSectionTitle, null, "Selected"),
            React.createElement(
              CoinList,
              null,
              activeCoins.length
                ? activeCoins.map((coin) =>
                    React.createElement(CoinChip, {
                      key: coin,
                      selected: true,
                      "data-symbol": coin,
                      draggable: true,
                      onDragStart: (e) => this.handleDragStart(coin, e),
                      onDragEnd: this.handleDragEnd,
                      onDragOver: (e) => this.handleDragOver(coin, e),
                      onDrop: (e) => this.handleDrop(coin, e),
                      onClick: () => this.handleChipClick(coin),
                      children: coin,
                    })
                  )
                : React.createElement(CoinChip, {
                    disabled: true,
                    children: "No coins yet",
                  })
            ),
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
                        })
                      )
                    : pendingCoin
                    ? React.createElement(
                        SuggestionHint,
                        null,
                        "Try BTC, ETH, SOL..."
                      )
                    : null
                )
              ),
              React.createElement(
                SettingsActionButton,
                { type: "submit" },
                "Add coin"
              )
            ),
            feedback
              ? React.createElement(
                  SettingsFeedback,
                  { error: status === "error" },
                  feedback
                )
              : null
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
                  "Auto"
                ),
                React.createElement(
                  ThemeButton,
                  {
                    active: themePreference === "light",
                    onClick: () => onThemeChange && onThemeChange("light"),
                  },
                  "Light"
                ),
                React.createElement(
                  ThemeButton,
                  {
                    active: themePreference === "dark",
                    onClick: () => onThemeChange && onThemeChange("dark"),
                  },
                  "Dark"
                )
              ),
              React.createElement(
                ThemeDescription,
                null,
                themePreference === "auto"
                  ? `Using ${activeTheme} mode (system preference)`
                  : `Using ${themePreference} mode`
              )
            ),

            // Refresh Interval Section
            React.createElement(
              RefreshIntervalSection,
              null,
              React.createElement(
                RefreshIntervalLabel,
                null,
                "Refresh Interval"
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
                    option.label
                  )
                )
              )
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
                    option.label
                  )
                )
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
                    option.label
                  )
                )
              )
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
                    option.label
                  )
                )
              )
            )
          )
      )
    );
  }
}

SettingsPanel.defaultProps = {
  coins: [],
  onAddCoin: null,
  onRemoveCoin: null,
  onReorderCoin: null,
  onClose: null,
  visible: false,
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
    });

    _defineProperty(this, "cycleCoinIndex", () => {
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
          // Start skeleton timer (show after 300ms if still loading)
          this.startSkeletonTimer();
          // Fetch new data - updateTabTitle will be called after data is loaded
          this.fetchData();
        }
      );
    });

    _defineProperty(this, "setPeriod", (_e, period) => {
      this.setState(
        {
          period,
          apiError: false, // Clear API error when changing period
        },
        this.fetchData
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
          "history"
        );
        const cachedSpot = getCachedData(
          activeCoin,
          "current",
          currency,
          "spot"
        );
        const cachedOHLC = getCachedData(
          activeCoin,
          period,
          currency,
          "ohlc"
        );

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
              this.state.valueHistory
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
        "history"
      );
      const cachedSpot = getCachedData(activeCoin, "current", currency, "spot");
      const cachedOHLCStale = getCachedData(
        activeCoin,
        period,
        currency,
        "ohlc"
      );

      // If we have stale data, show it immediately while fetching fresh data
      if (cachedHistory && cachedHistory.isStale && cachedHistory.data) {
        this.setState({ valueHistory: cachedHistory.data });
      }

      if (cachedSpot && cachedSpot.isStale && cachedSpot.data) {
        this.setState({ currentValue: cachedSpot.data }, () => {
          updateTabTitle(
            this.state.coinOptions,
            this.state.coinIndex,
            this.state.currentValue,
            this.state.valueHistory
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
          coinOptions
        );
        const valueHistory = await fetchValueHistory(
          activeCoin,
          period,
          currency,
          signal,
          true,
          coinOptions
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
            isLoading: false,
            showSkeleton: false,
            invalidCoin: null,
            apiError: false, // Clear API error on success
          },
          () => {
            // Update tab title after state is set
            updateTabTitle(
              this.state.coinOptions,
              this.state.coinIndex,
              this.state.currentValue,
              this.state.valueHistory
            );
          }
        );
      } catch (e) {
        // Don't log errors if request was aborted (expected behavior)
        if (e.name === "AbortError") {
          return;
        }

        console.warn(e);

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
        // Check if we have cached data to show
        const cachedHistory = getCachedData(
          activeCoin,
          period,
          currency,
          "history"
        );
        const cachedSpot = getCachedData(
          activeCoin,
          "current",
          currency,
          "spot"
        );

        const newState = {
          isLoading: false,
          showSkeleton: false,
          apiError: true, // Show API error banner
        };

        // If we have cached data, use it
        if (cachedHistory && cachedHistory.data) {
          newState.valueHistory = cachedHistory.data;
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
              this.state.valueHistory
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
          this.state.refreshInterval
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
            coinOptions
          );
        } catch (error) {
          // Continue with next coin even if this one fails
        }
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

      if (this.state.coinOptions.includes(normalized)) {
        return { success: false, reason: "duplicate" };
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
  }

  componentDidMount() {
    this.fetchData();
    // Set initial tab title
    updateTabTitle(
      this.state.coinOptions,
      this.state.coinIndex,
      this.state.currentValue,
      this.state.valueHistory
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
    setTimeout(() => this.prefetchTopCoins(), 2000); // Wait 2 seconds after initial load
  }

  componentWillUnmount() {
    clearTimeout(this.fetchTimeout);
    clearInterval(this.cacheCleanupInterval);

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
        this.handleSystemThemeChange
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
    } = this.state;
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
            "You are offline. Data will update when connection is restored."
          ),
        // API error notification (only show if not offline)
        !isOffline &&
          apiError &&
          React.createElement(
            ApiErrorMessage,
            null,
            "Unable to fetch latest data. Showing cached prices."
          ),
        // Invalid coin warning
        invalidCoin &&
          React.createElement(
            InvalidCoinWarning,
            null,
            React.createElement(
              InvalidCoinMessage,
              null,
              `${invalidCoin} is not available or invalid`
            ),
            React.createElement(
              InvalidCoinButton,
              { onClick: this.handleRemoveInvalidCoin },
              "Remove"
            ),
            React.createElement(
              InvalidCoinButton,
              { onClick: this.handleDismissInvalidCoin },
              "Skip"
            )
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
            },
            showSettings ? "×" : "⚙"
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
                  })
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
                      })
                    )
                )
              : React.createElement(PeriodSwitcher, {
                  onChange: this.setPeriod,
                  options: PERIOD_OPTIONS,
                  value: period,
                })
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
                : React.createElement(Line, { prices: valueHistory })
            )
          )
        ),
        // LAZY LOADING: Only render SettingsPanel when user opens it
        showSettings &&
          React.createElement(SettingsPanel, {
            coins: coinOptions,
            visible: showSettings,
            onAddCoin: this.handleAddCoinOption,
            onRemoveCoin: this.handleRemoveCoinOption,
            onReorderCoin: this.handleReorderCoinOption,
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
          })
      )
    );
  }
}

/* APP */
const App = () =>
  React.createElement(
    ThemeProvider,
    { theme: theme },
    React.createElement(CryptoChart, null)
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
  }

  @media (max-width: ${theme.breakpoint.down.sm}px) {
    body {
      padding: 0;
    }
  }

  #root {
    width: 100%;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
  }
`;

/* RENDER */
const app = document.createElement("div");
app.setAttribute("id", "root");
document.body.appendChild(app);

ReactDOM.render(React.createElement(App, null), app);
