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

/* CANDLESTICKS ─────────────────────────────────────────────────────────────
 * Two pure steps so the drawing code stays dumb and both are testable:
 * aggregate to a bar count the width can actually show, then scale to pixels.
 */

// Merge candles into `maxBars` buckets: first open, last close, extreme
// high/low, summed volume — the standard reduction, so a bucket is still a
// truthful candle rather than a sample. Drawing 700 slivers on a 1400px
// chart costs the same as drawing 200 and reads worse.
const aggregateCandles = (candles, maxBars) => {
  if (!Array.isArray(candles) || !candles.length) return [];
  if (!(maxBars > 0) || candles.length <= maxBars) return candles;
  const size = Math.ceil(candles.length / maxBars);
  const out = [];
  for (let i = 0; i < candles.length; i += size) {
    const chunk = candles.slice(i, i + size);
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const c of chunk) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += Number(c.volume) || 0;
    }
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      close: chunk[chunk.length - 1].close,
      high,
      low,
      volume,
    });
  }
  return out;
};

// Pixel geometry for each bar. The y scale spans highs and lows (not just
// closes) so wicks can't run off the top or bottom of the plot.
const scaleCandles = (candles, height, width, padding = 0) => {
  if (!Array.isArray(candles) || candles.length < 1) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const c of candles) {
    if (c.low < min) min = c.low;
    if (c.high > max) max = c.high;
  }
  if (!isFinite(min) || !isFinite(max)) return null;
  if (min === max) {
    // A flat range would divide by zero; give it a nominal band
    min -= 1;
    max += 1;
  }
  const plotH = Math.max(1, height - padding * 2);
  const plotW = Math.max(1, width - padding * 2);
  const y = (v) => padding + (1 - (v - min) / (max - min)) * plotH;
  const step = plotW / candles.length;
  // Leave a hairline gap between bars; never thinner than a visible line
  const barW = Math.max(1, Math.min(step * 0.7, 18));
  return {
    barW,
    bars: candles.map((c, i) => ({
      x: padding + step * (i + 0.5),
      yOpen: y(c.open),
      yClose: y(c.close),
      yHigh: y(c.high),
      yLow: y(c.low),
      up: c.close >= c.open,
    })),
  };
};

/* Path data for one direction's bars: a wick line plus a body rectangle per
 * candle, concatenated. Two paths draw the whole chart no matter how many
 * candles there are — 700 separate nodes would cost far more to build and
 * to reconcile than the pixels are worth. */
const candlePathData = (scaled, up) => {
  if (!scaled) return "";
  const half = scaled.barW / 2;
  let d = "";
  for (const b of scaled.bars) {
    if (b.up !== up) continue;
    const top = Math.min(b.yOpen, b.yClose);
    const bottom = Math.max(b.yOpen, b.yClose);
    // A doji would be a zero-height rect and vanish — floor it to a line
    const bodyH = Math.max(bottom - top, 1);
    d += `M${b.x.toFixed(2)} ${b.yHigh.toFixed(2)}V${b.yLow.toFixed(2)}`;
    d +=
      `M${(b.x - half).toFixed(2)} ${top.toFixed(2)}` +
      `h${scaled.barW.toFixed(2)}v${bodyH.toFixed(2)}` +
      `h${(-scaled.barW).toFixed(2)}Z`;
  }
  return d;
};

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

/* Prices for the widget list rows. The panel is narrow, so the decimals
 * adapt to the magnitude instead of using the display setting: a $65,014.68
 * would crowd out the change column, while a $0.0000 would say nothing.
 * The separator format is still respected. */
const formatWidgetPrice = (value, symbol, separatorFormat) => {
  const v = Number(value);
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  const decimals = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return formatNumberString(v, symbol, true, false, decimals, separatorFormat);
};

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

  // Coins Coinbase doesn't list come from their own provider, in the same
  // shape, and go through the same cache
  if (providerFor(coin) === "kraken") {
    const data = await fetchKrakenHistory(coin, period, currency, signal);
    setCachedData(coin, period, currency, "history", data, allowedCoins);
    return data;
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

  if (providerFor(coin) === "kraken") {
    const value = await fetchKrakenSpot(coin, currency, signal);
    setCachedData(coin, "current", currency, "spot", value, allowedCoins);
    return value;
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

