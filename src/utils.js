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
  const parsed = loadJsonSetting(STORAGE_KEY);
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
  return DEFAULT_COIN_OPTIONS.slice();
};

const saveCoinOptionsToStorage = (coinOptions) =>
  saveJsonSetting(STORAGE_KEY, coinOptions);

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
  const debounced = function (...args) {
    const context = this;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn.apply(context, args);
    }, delay);
  };
  debounced.cancel = () => {
    clearTimeout(timeoutId);
    timeoutId = null;
  };
  return debounced;
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

// Coarse "how long ago" for the since-last-visit line. Deliberately vague —
// the point is orientation ("this morning"), not a stopwatch.
const describeElapsed = (ms) => {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return "a month ago";
};

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

