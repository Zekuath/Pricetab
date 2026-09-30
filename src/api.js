/* API CONSTANTS */
const API_BASE = "https://www.coinbase.com/api/v2/prices/";
const API_HISTORY = "historic?period=";
const API_SPOT = "spot";

/* WIDGET API ENDPOINTS */
const FEAR_GREED_API = "https://api.alternative.me/fng/?limit=1";
// Coinlore global market data — CORS-enabled (sends Access-Control-Allow-Origin: *),
// unlike CoinGecko which rate-limits browser/extension origins and then fails CORS.
const COINLORE_GLOBAL_API = "https://api.coinlore.com/api/global/";
const MEMPOOL_API = "https://mempool.space/api/blocks/tip/height";

/* WIDGET CACHE TTL */
const WIDGET_CACHE_TTL = {
  fearGreed: 3600000, // 1 hour (updates every 12h, so 1h cache is fine)
  marketOverview: 300000, // 5 minutes
  halvingCountdown: 3600000, // 1 hour (block height changes slowly)
  coinloreGlobal: 300000, // 5 minutes — shared by market overview + alt season
  fundingRate: 900000, // 15 min (funding settles 3x/day; the rate barely drifts)
  // The two fastest-moving readings on the panel: a gas price is a per-block
  // auction and Bitcoin's fee market turns over with the mempool. Five
  // minutes would print a number nobody could act on.
  ethGas: 60000, // 1 minute
  btcFees: 60000, // 1 minute
  /* The mempool turns over with the fee market it explains, so it is cached
   * for as long as the fees card beside it. The difficulty retarget moves once
   * every two weeks and its estimate barely drifts inside an hour. */
  mempool: 60000, // 1 minute
  difficulty: 3600000, // 1 hour
  // A daily series: one new row a day, so six hours is fresh enough and a
  // new tab on the derivatives page asks at most four times a day per coin.
  crowdHistory: 21600000, // 6 hours
  // Two more daily series from the same host, for the market-structure
  // readings: funding folded to days and open interest at the day's close.
  fundingHistory: 21600000, // 6 hours
  oiHistory: 21600000, // 6 hours
  // Which coins have a perpetual: a listing changes a few times a month.
  perpCoins: 86400000, // 24 hours
  // The perpetual's own candles for the derivatives page, one TTL per range:
  // about one bar's worth, so a new tab asks only when a bar could have closed.
  perpSeriesHour: 60000, // 1 minute (1m bars)
  perpSeriesDay: 300000, // 5 minutes (5m bars)
  perpSeriesWeek: 1800000, // 30 minutes (1H bars)
  perpSeriesMonth: 7200000, // 2 hours (4H bars)
  perpSeriesYear: 21600000, // 6 hours (1D bars)
  perpSeriesAll: 43200000, // 12 hours (1W bars)
  // openInterest / longShortRatio / liquidations track live positioning and
  // fall through to the default below, matching the widget refresh cycle.
};
const WIDGET_CACHE_DEFAULT_TTL = 300000; // 5 minutes

/* RETRY MECHANISM WITH CANCELLATION SUPPORT */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* CACHE MANAGEMENT */
const CACHE_TTL = 30000; // 30 seconds cache lifetime

/* One TTL for every series was wrong in the same way one TTL for every widget
 * would be, and the file already knows that — `WIDGET_CACHE_TTL` is one screen
 * up, giving Fear & Greed an hour and open interest five minutes.
 *
 * A history series is only out of date once the provider could have published
 * another point, and how long that takes is a property of the range. Measured
 * against the live Coinbase API on 22 Aug 2026, points per window:
 *
 *   hour 359 (~10s apart) · day 300 (~4.8m) · week 306 (~33m)
 *   month 311 (~2.4h) · year 305 (~1.19d) · all 351 (~13.2d)
 *
 * So each TTL below is one point's worth of that series' own time, capped at
 * six hours — a chart that has not visibly moved in six hours is still a chart
 * somebody may be staring at, and "it looks frozen" is worse than one extra
 * request. The 1H range keeps the 30s floor: it is the one a tab opens on and
 * the one people watch tick.
 *
 * What this buys, measured on a cold open with everything default: **10
 * requests, 5 of them re-fetching day/week/month/year/all** — series that
 * cannot have changed — and the same 5 again on every coin switch. The chart
 * already paints instantly from the persisted cache, so what this saves is
 * not time on screen: it is load on an API that is already refusing some
 * people (see the `NETWORK_ERROR_RETRIES` note).
 */
const HISTORY_TTL = {
  hour: 30000, // 30s — the floor, not the point spacing
  day: 300000, // 5 min
  week: 1800000, // 30 min
  month: 7200000, // 2 h
  year: 21600000, // 6 h (cap)
  all: 21600000, // 6 h (cap)
};

// A series goes stale when another point could exist; everything else — a spot
// price above all — keeps the flat 30 seconds.
const cacheTtlFor = (period, type) =>
  (type === "history" && HISTORY_TTL[period]) || CACHE_TTL;
const CACHE_CLEANUP_INTERVAL = 600000; // 10 minutes
const MAX_CACHED_COINS = 10; // Only cache first 10 coins in rotation
const MAX_COINS = 20; // Hard limit on coin list size
const cache = new Map();

// Separate cache for page ticker (all suggested coins, bypasses the 10-coin limit)
const pageTickerCache = new Map(); // key: "COIN-CURRENCY" → { price, timestamp }
const PAGE_TICKER_TTL = 60000; // 60s TTL per coin (still < refresh, so prices update)
/* How many coins the per-coin fallback may fetch in one sweep.
 *
 * The bulk request exists so that one call serves every coin. When it answers,
 * this number is never reached — there is nothing stale left. When it does
 * *not* answer, the fallback used to walk all 81 supported coins, two requests
 * each: measured over three minutes with the bulk provider returning an empty
 * list, **333 requests against 75 distinct coins**, against **21 requests and
 * 1 coin** on the healthy path. Sixteen times the traffic, on a timer, aimed
 * at the provider that had not failed.
 *
 * That is the shape that earns a rate limit, and the provider being hammered
 * is the one drawing the chart — so the cost of reconstructing a scrolling bar
 * would be paid by the product. Twelve is what the screen can use: this
 * person's own coins first (exactly what the watchlist wants), then the
 * largest of the rest so the bar and the movers are not empty. 24 requests
 * instead of 162, and during someone else's outage the ticker shows a dozen
 * coins rather than taking the chart down with it. */
const PAGE_TICKER_FALLBACK_MAX = 12;

const PAGE_TICKER_BATCH_SIZE = 4; // coins per batch (each does 2 reqs) — keeps bursts gentle
const PAGE_TICKER_BATCH_DELAY = 500; // ms between batches — avoids hammering Coinbase
const PAGE_TICKER_REFRESH_MS = 120000; // full refresh every 2 min (background ticker, no need faster)

/* PERSISTENT TICKER CACHE
 * The bulk Coinlore sweep is the single largest request the extension makes
 * (top-100 tickers), and it feeds three things at once: the page ticker, the
 * watchlist widget and top movers. It ran on every new tab, unconditionally —
 * so opening five tabs in a minute paid for the same 60-second-fresh snapshot
 * five times, plus an exchange-rates request each on non-USD.
 *
 * Persisting the cache (and when the sweep last ran, per currency) means a new
 * tab inherits it and paints the ticker with no request at all while it is
 * still inside the TTL. That TTL is unchanged, so nothing shown is any staler
 * than it would have been inside one long-lived tab.
 */
const TICKER_CACHE_STORAGE_KEY = "crypto_chart_ticker_cache";
const TICKER_CACHE_MAX_ENTRIES = 140; // one top-100 sweep plus per-coin fallbacks
const TICKER_CACHE_PERSIST_DELAY = 1000; // debounce: batches land a few at a time

// currency → when the bulk sweep last succeeded for it
const bulkSweepAt = new Map();
// currency → a sweep already running, so concurrent callers share it
const bulkSweepInFlight = new Map();

let tickerCachePersistTimer = null;

/* **What hydration keeps, and what the TTL decides.**
 *
 * These were one number, and it cost the cache most of its value: an entry a
 * minute old was thrown away on the way *in*, so every new tab opened with an
 * empty ticker and the persisting was buying nothing but the sweep guard. The
 * price cache already separates the two for exactly this reason —
 * `PRICE_CACHE_MAX_AGE` keeps a day of series so the chart paints instantly,
 * while `cacheTtlFor` decides only whether to revalidate. The same split here
 * is what lets the toolbar popup print a price the moment it opens, saying how
 * old it is, rather than showing dashes while a request runs.
 *
 * The TTL is untouched: a figure older than a minute is still refreshed on
 * sight, and `bulkRefreshPageTickerCache` still refuses to sweep twice inside
 * one. What changed is that there is something on screen while it does. */
const PAGE_TICKER_MAX_AGE = 86400000;

const persistPageTickerCache = () => {
  clearTimeout(tickerCachePersistTimer);
  tickerCachePersistTimer = setTimeout(() => {
    try {
      const now = Date.now();
      const entries = Array.from(pageTickerCache.entries())
        .filter(([, value]) => now - value.timestamp <= PAGE_TICKER_MAX_AGE)
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, TICKER_CACHE_MAX_ENTRIES);
      localStorage.setItem(
        TICKER_CACHE_STORAGE_KEY,
        JSON.stringify({ entries, sweeps: Array.from(bulkSweepAt.entries()) }),
      );
    } catch (error) {
      // Storage full or unavailable — new tabs just start cold
    }
  }, TICKER_CACHE_PERSIST_DELAY);
};

const hydratePageTickerCache = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(TICKER_CACHE_STORAGE_KEY));
    if (!saved || !Array.isArray(saved.entries)) return;
    const now = Date.now();
    saved.entries.forEach((entry) => {
      if (!Array.isArray(entry)) return;
      const [key, value] = entry;
      if (
        typeof key !== "string" ||
        !value ||
        typeof value.timestamp !== "number" ||
        value.timestamp > now || // clock moved back; treat as unusable
        typeof value.price !== "number" ||
        !isFinite(value.price) ||
        now - value.timestamp > PAGE_TICKER_MAX_AGE
      ) {
        return;
      }
      pageTickerCache.set(key, value);
    });
    if (Array.isArray(saved.sweeps)) {
      saved.sweeps.forEach(([currency, at]) => {
        if (typeof currency !== "string" || typeof at !== "number") return;
        if (at > now || now - at > PAGE_TICKER_TTL) return;
        bulkSweepAt.set(currency, at);
      });
    }
  } catch (error) {
    // Corrupt entry — the next persist overwrites it
  }
};

hydratePageTickerCache();

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
    isStale: age > cacheTtlFor(period, type),
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

  persistPriceCache();
};

/* PERSISTENT PRICE CACHE — hydrates new tabs so the chart paints instantly */
const PRICE_CACHE_STORAGE_KEY = "crypto_chart_price_cache";
const PRICE_CACHE_MAX_AGE = 86400000; // ignore persisted entries older than 24h
const PRICE_CACHE_MAX_ENTRIES = 30; // newest first — bounds localStorage use
const PRICE_CACHE_PERSIST_DELAY = 1000; // debounce: spot + history land together

let priceCachePersistTimer = null;

const persistPriceCache = () => {
  clearTimeout(priceCachePersistTimer);
  priceCachePersistTimer = setTimeout(() => {
    try {
      const entries = Array.from(cache.entries())
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, PRICE_CACHE_MAX_ENTRIES)
        .map(([key, value]) => [
          key,
          { data: value.data, timestamp: value.timestamp },
        ]);
      localStorage.setItem(PRICE_CACHE_STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      // Storage full or unavailable — new tabs just start cold
    }
  }, PRICE_CACHE_PERSIST_DELAY);
};

// History entries hold Date objects in their "time" fields; JSON turns those
// into ISO strings, and stale strings fed to scaleTime() render an invalid
// (NaN) chart path. Revive them — and reject anything that doesn't survive
// the round trip rather than poisoning the chart.
const revivePriceCacheData = (data) => {
  if (!Array.isArray(data)) return data;
  const revived = [];
  for (const item of data) {
    if (item && typeof item === "object" && "time" in item) {
      const time = new Date(item.time);
      if (isNaN(+time) || typeof item.price !== "number") return null;
      revived.push({ ...item, time });
    } else {
      revived.push(item);
    }
  }
  return revived;
};

const hydratePriceCache = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(PRICE_CACHE_STORAGE_KEY));
    if (!Array.isArray(saved)) return;
    const now = Date.now();
    saved.forEach((entry) => {
      if (!Array.isArray(entry)) return;
      const [key, value] = entry;
      if (
        typeof key !== "string" ||
        !value ||
        typeof value.timestamp !== "number" ||
        now - value.timestamp > PRICE_CACHE_MAX_AGE
      ) {
        return;
      }
      const data = revivePriceCacheData(value.data);
      if (data === null) return;
      cache.set(key, {
        data,
        timestamp: value.timestamp,
        lastAccessed: now,
      });
    });
  } catch (error) {
    // Corrupt entry — the next persist overwrites it
  }
};

hydratePriceCache();

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

// How many times a *network-level* failure is worth repeating. See the note
// in the catch below: this is the wall case, not the flaky-server case.
const NETWORK_ERROR_RETRIES = 1;

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

      /* A request that never reached the server is not worth waiting on.
       *
       * `TypeError` here means no response at all — a CORS wall, a region
       * block, something in front of the API, DNS, offline. The ladder below
       * was built for a 500 or a 429, where the server answered and waiting
       * genuinely helps. A wall answers the same way in four seconds as it did
       * in zero, and the caller usually has somewhere else to go: every price
       * request can fail over to Kraken.
       *
       * Measured with Coinbase refusing everything: 4 attempts over **7.0s**
       * per endpoint before the failover was even reached, so the chart took
       * **7,131ms** to draw where a working Coinbase draws it in 54ms — seven
       * seconds of a new tab reading "BTC PRICE" with nothing under it and no
       * error. That is what the reported CORS block looked like from the other
       * side of the screen.
       *
       * One retry is kept, because a real network blip does recover inside a
       * second; a second and third are just the wall again.
       */
      const cap =
        error.name === "TypeError"
          ? Math.min(maxRetries, NETWORK_ERROR_RETRIES)
          : maxRetries;
      if (attempt >= cap) {
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

/* Per-coin widget data (funding, open interest, …) shares this cache with the
 * coin appended to the key, so the TTL is looked up on the name alone. Without
 * a cache these refetch on every coin change, which auto-rotate turns into a
 * request every few seconds — including for coins visited a minute ago. */
const coinWidgetKey = (name, coin) => name + ":" + coin;
const widgetCacheName = (key) => key.split(":")[0];

const widgetTtlFor = (key) =>
  WIDGET_CACHE_TTL[widgetCacheName(key)] || WIDGET_CACHE_DEFAULT_TTL;

const getWidgetCache = (key) => {
  const cached = widgetCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > widgetTtlFor(key)) {
    return null; // Expired
  }
  return cached.data;
};

const setWidgetCache = (key, data) => {
  widgetCache.set(key, { data, timestamp: Date.now() });
  persistWidgetCache();
};

/* PERSISTENT WIDGET CACHE
 * The Map above only lives as long as the tab does, and a new-tab extension
 * gets a brand new JS context every time — so the TTLs never actually got
 * spent. Fear & Greed publishes a new number twice a day and is cached for an
 * hour, but ten new tabs in that hour meant ten requests for the same value;
 * the halving countdown (also 1h) and the shared Coinlore figures (5 min) paid
 * the same way, per tab, forever. Nothing here changes how stale the data may
 * be — `getWidgetCache` still applies the same TTL on the way out. It only
 * stops each tab from starting the clock over.
 *
 * Same shape as the price cache above, for the same reason and with the same
 * failure mode: if storage is unavailable, tabs simply start cold as before.
 */
const WIDGET_CACHE_STORAGE_KEY = "crypto_chart_widget_cache";
// Four per-coin widgets across a 20-coin list is 80 possible keys; keeping the
// newest 40 bounds the entry while still covering a normal rotation
const WIDGET_CACHE_MAX_ENTRIES = 40;
const WIDGET_CACHE_PERSIST_DELAY = 1000; // debounce: the widgets land together

let widgetCachePersistTimer = null;

const persistWidgetCache = () => {
  clearTimeout(widgetCachePersistTimer);
  widgetCachePersistTimer = setTimeout(() => {
    try {
      const now = Date.now();
      const entries = Array.from(widgetCache.entries())
        // Expired entries would only be rejected on the way back in
        .filter(([key, value]) => now - value.timestamp <= widgetTtlFor(key))
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, WIDGET_CACHE_MAX_ENTRIES);
      localStorage.setItem(WIDGET_CACHE_STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      // Storage full or unavailable — new tabs just start cold
    }
  }, WIDGET_CACHE_PERSIST_DELAY);
};

const hydrateWidgetCache = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(WIDGET_CACHE_STORAGE_KEY));
    if (!Array.isArray(saved)) return;
    const now = Date.now();
    saved.forEach((entry) => {
      if (!Array.isArray(entry)) return;
      const [key, value] = entry;
      if (
        typeof key !== "string" ||
        !value ||
        typeof value.timestamp !== "number" ||
        value.timestamp > now || // clock moved back; treat as unusable
        value.data == null ||
        now - value.timestamp > widgetTtlFor(key)
      ) {
        return;
      }
      widgetCache.set(key, { data: value.data, timestamp: value.timestamp });
    });
  } catch (error) {
    // Corrupt entry — the next persist overwrites it
  }
};

hydrateWidgetCache();

const fetchFearGreedIndex = async () => {
  const cached = getWidgetCache("fearGreed");
  if (cached) return cached;

  try {
    const response = await politeFetch(FEAR_GREED_API);
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

/* One fetch of Coinlore's global figures, shared by every widget that reads
 * them. Market Overview and Altcoin Season were each requesting this exact
 * URL, so turning both widgets on cost two identical round trips per cycle —
 * and Altcoin Season cached nothing, so it paid again on every refresh.
 *
 * The in-flight promise is shared as well as the result: the widget fetches
 * run in parallel now, so without it two callers would still open two
 * connections before either finished.
 */
let coinloreGlobalInFlight = null;

const fetchCoinloreGlobal = async () => {
  const cached = getWidgetCache("coinloreGlobal");
  if (cached) return cached;
  if (coinloreGlobalInFlight) return coinloreGlobalInFlight;

  coinloreGlobalInFlight = (async () => {
    try {
      const response = await politeFetch(COINLORE_GLOBAL_API);
      if (!response.ok) throw new Error("Coinlore API error");
      const json = await response.json();
      const g = Array.isArray(json) ? json[0] : null;
      if (!g) return null;
      setWidgetCache("coinloreGlobal", g);
      return g;
    } catch (e) {
      return null;
    } finally {
      coinloreGlobalInFlight = null;
    }
  })();
  return coinloreGlobalInFlight;
};

const fetchMarketOverview = async () => {
  const cached = getWidgetCache("marketOverview");
  if (cached) return cached;

  try {
    const g = await fetchCoinloreGlobal();
    if (!g) return null;
    const data = {
      totalMarketCap: g.total_mcap,
      totalVolume: g.total_volume,
      btcDominance: parseFloat(g.btc_d),
      ethDominance: parseFloat(g.eth_d),
      marketCapChange24h: parseFloat(g.mcap_change),
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
    const response = await politeFetch(MEMPOOL_API);
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


/* Blockchair's live news feed used to be fetched here and is not any more —
 * it was dropped as a headline source on 21 Aug 2026 (see `NEWS_SOURCES` in
 * `config.js` for the measurement that decided it). What remains of Blockchair
 * in this file is `fetchNewsAround` below, which asks the same endpoint about
 * a *window in the past* for the "what happened here?" card, and the
 * address-balance lookups, which are not news at all. */

// Blockchair stamps news in UTC as "YYYY-MM-DD HH:MM:SS", which is not a
// format Date parses consistently across engines without the marker
const parseNewsTime = (value) => {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value.replace(" ", "T") + "Z");
  return isFinite(ms) ? ms : null;
};

/* ── Headlines from around one moment ─────────────────────────────────────
 *
 * The same Blockchair feed, asked about a window in the past instead of about
 * now: `time(YYYY-MM-DD..YYYY-MM-DD)`. Nothing new is added to the network
 * profile — same host, same endpoint, one request per window, and only when
 * somebody points at a mark.
 *
 * Cached like the other three (the codebase guide, *Caching System*): a window that
 * has already been asked about is answered from memory, and the cache survives
 * the tab. It has to — a mark on a chart is exactly the thing someone hovers,
 * loses, and hovers again, and every new tab is a fresh JS context. The TTL is
 * a day rather than the feed's ten minutes, because a window in 2021 does not
 * get newer.
 */
const MOVE_NEWS_CACHE_KEY = "crypto_chart_move_news_cache";
/* A day either side of the move. Narrower than a day and a timezone puts the
 * story outside the window; wider and it stops being about this move. */
const MOVE_NEWS_PAD_MS = 86400000;
// These are historical windows, so what came back yesterday is still true
const MOVE_NEWS_TTL = 86400000;
const MOVE_NEWS_CACHE_MAX = 30;
const MOVE_NEWS_PERSIST_DELAY = 1000;

const moveNewsCache = new Map();
let moveNewsPersistTimer = null;
const moveNewsInFlight = new Map();

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const moveNewsKey = (fromMs, toMs) => `${utcDay(fromMs)}..${utcDay(toMs)}`;

const persistMoveNewsCache = () => {
  clearTimeout(moveNewsPersistTimer);
  moveNewsPersistTimer = setTimeout(() => {
    try {
      const now = Date.now();
      const entries = Array.from(moveNewsCache.entries())
        .filter(([, v]) => now - v.t <= MOVE_NEWS_TTL)
        .sort((a, b) => b[1].t - a[1].t)
        .slice(0, MOVE_NEWS_CACHE_MAX);
      localStorage.setItem(MOVE_NEWS_CACHE_KEY, JSON.stringify(entries));
    } catch (error) {
      // Storage full or unavailable — the next hover simply asks again
    }
  }, MOVE_NEWS_PERSIST_DELAY);
};

const hydrateMoveNewsCache = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(MOVE_NEWS_CACHE_KEY));
    if (!Array.isArray(saved)) return;
    const now = Date.now();
    for (const entry of saved) {
      if (!Array.isArray(entry)) continue;
      const [key, value] = entry;
      if (typeof key !== "string" || !value || typeof value.t !== "number") continue;
      if (value.t > now || now - value.t > MOVE_NEWS_TTL) continue;
      // Through the same sanitizer as the live feed: stored is untrusted, and
      // these titles and urls go straight into the DOM
      moveNewsCache.set(key, { t: value.t, items: sanitizeNewsItems(value.items) });
    }
  } catch (error) {
    // Corrupt entry — the next persist overwrites it
  }
};

/* Blockchair's archive. The deepest of the three — it answers for windows in
 * 2021 — and the least current: measured 21 Aug 2026 it had published nothing
 * since the 16th, so on its own it returns **nothing at all** for any mark on
 * a 1H, 1D or 1W chart. That is what "the what-happened-here card is empty"
 * turned out to be, and it is why this is no longer the only source. */
const newsAroundBlockchair = async (from, to) => {
  const url =
    "https://api.blockchair.com/news?q=" +
    encodeURIComponent(`language(en),time(${utcDay(from)}..${utcDay(to)})`) +
    "&limit=10";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Blockchair archive request failed");
  const json = await res.json();
  return (json && Array.isArray(json.data) ? json.data : [])
    /* The query above asks for `language(en)` and does not get it: of ten
     * items sampled on 21 Aug 2026, **seven** came back Turkish, Russian,
     * Dutch or French. The per-article `language` field is accurate even
     * though the server-side filter is not, so the answer is to check it here
     * rather than to trust the request. Absent is allowed through — an
     * unlabelled story is not a foreign one. */
    .filter((a) => !a || !a.language || a.language === "en")
    .map((a) => ({
      source: typeof a.source === "string" ? a.source : "news",
      title: typeof a.title === "string" ? a.title : "",
      time: parseNewsTime(a.time),
      tags: typeof a.tags === "string" ? a.tags : "",
      url: typeof a.link === "string" ? a.link : null,
    }));
};

/* Hacker News, asked about a window instead of about the past week.
 *
 * The important property is that it needs **no permission**: Algolia is
 * keyless and CORS-enabled, so this is the archive a fresh install has. It
 * reaches back to 2007 — asked about 18–21 May 2021 it returns the crash
 * ("Crypto crash deepens, stocks slip", 368 points).
 *
 * One request, not three. The live fetcher asks once per term because Algolia
 * ANDs the words in a query; `optionalWords` turns the same three words into
 * an OR (measured: 1 hit AND-ed, 112 OR-ed, over the same window). Ranked by
 * points rather than by date, because the question is what was being *talked
 * about* in those days, not what happened to be posted last. `CRYPTO_TERMS_RE`
 * then drops what the loose match dragged in.
 */
const newsAroundHackerNews = async (from, to) => {
  const url =
    `${HN_NEWS_API}?tags=story&hitsPerPage=${MOVE_NEWS_HN_POOL}` +
    `&query=${encodeURIComponent(HN_NEWS_TERMS.join(" "))}` +
    `&optionalWords=${encodeURIComponent(HN_NEWS_TERMS.join(","))}` +
    `&numericFilters=${encodeURIComponent(
      `created_at_i>${Math.floor(from / 1000)},created_at_i<${Math.ceil(to / 1000)}`,
    )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Hacker News archive request failed");
  const json = await res.json();
  return (json && Array.isArray(json.hits) ? json.hits : [])
    .filter((hit) => hit && typeof hit.title === "string")
    .filter((hit) => CRYPTO_TERMS_RE.test(hit.title))
    .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0))
    .slice(0, MOVE_NEWS_HN_MAX)
    .map((hit) => ({
      source: "Hacker News",
      title: hit.title,
      time: isFinite(Number(hit.created_at_i))
        ? Number(hit.created_at_i) * 1000
        : null,
      tags: "",
      url:
        typeof hit.url === "string" && /^https:\/\//.test(hit.url)
          ? hit.url
          : `https://news.ycombinator.com/item?id=${hit.objectID}`,
    }));
};

/* CoinJournal, the one granted newsroom with a usable archive.
 *
 * WordPress takes `after`/`before`, so the same endpoint the panel reads
 * answers about any window — verified back to March 2025. Two parameters are
 * not optional here: `categories_exclude` (its press releases, as everywhere
 * else) and **`lang=en`**, because without it the archive returns the same
 * story in Polish, Swedish, Finnish, Norwegian and Danish — six of six items
 * on the window measured. `lang=en` returns only the `/news/` paths.
 *
 * Bitcoin Magazine has the same shape and is deliberately not here: its WAF
 * began answering 403 to everything from one address during this work,
 * including requests that had succeeded minutes earlier, so nothing about its
 * archive could be established rather than guessed at.
 */
const newsAroundCoinJournal = async (from, to) => {
  const stamp = (ms) => new Date(ms).toISOString().slice(0, 19);
  const url =
    "https://coinjournal.net/wp-json/wp/v2/posts?per_page=6&lang=en" +
    "&categories_exclude=40&_fields=title,link,date_gmt" +
    `&after=${stamp(from)}&before=${stamp(to)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("CoinJournal archive request failed");
  return parseWpFeed(await res.json(), "CoinJournal");
};

const fetchNewsAround = async (fromMs, toMs, granted) => {
  if (!isFinite(fromMs) || !isFinite(toMs)) return [];
  const from = Math.min(fromMs, toMs) - MOVE_NEWS_PAD_MS;
  const to = Math.max(fromMs, toMs) + MOVE_NEWS_PAD_MS;
  const key = moveNewsKey(from, to);

  const hit = moveNewsCache.get(key);
  if (hit && Date.now() - hit.t <= MOVE_NEWS_TTL) return hit.items;
  /* Two marks a day apart round to the same window, and a pointer crossing
   * three of them fires three identical requests before the first answers. */
  if (moveNewsInFlight.has(key)) return moveNewsInFlight.get(key);

  /* Which archives can be asked. Hacker News and Blockchair always; CoinJournal
   * only where its origin is granted — the caller passes what Chrome holds,
   * rather than this file reaching into `news.js`, which loads after it. */
  const archives = [newsAroundBlockchair, newsAroundHackerNews];
  if (Array.isArray(granted) && granted.includes("coinjournal")) {
    archives.push(newsAroundCoinJournal);
  }

  const request = (async () => {
    try {
      /* `allSettled`, not `all`: one archive being down must not lose the
       * others' answers, which is the whole reason there is more than one. */
      const settled = await Promise.allSettled(
        archives.map((ask) => ask(from, to)),
      );
      if (settled.every((r) => r.status === "rejected")) {
        throw new Error("every archive refused");
      }
      const merged = settled
        .filter((r) => r.status === "fulfilled")
        .reduce((all, r) => all.concat(r.value || []), [])
        .sort((a, b) => (b.time || 0) - (a.time || 0));
      /* The same advertising rule the panel uses. It matters more here, not
       * less: the card shows one window's headlines with nothing beside them
       * to compare against, so a press release in it has no context to give
       * it away. */
      const items = mergeNewsItems(sanitizeNewsItems(merged));
      /* An empty answer is cached too. "Nothing was written that week" is a
       * real answer and a common one on a thin range, and not storing it means
       * every hover pays for the same silence. */
      moveNewsCache.set(key, { t: Date.now(), items });
      persistMoveNewsCache();
      return items;
    } catch (error) {
      // Not cached: a failed request must not be remembered as "no news"
      return null;
    } finally {
      moveNewsInFlight.delete(key);
    }
  })();
  moveNewsInFlight.set(key, request);
  return request;
};

/* Hacker News crypto stories (Algolia API — CORS-enabled, no key).
 * One request per term (Algolia ANDs multi-word queries); merged by story id,
 * ranked by points. Only well-upvoted stories from the past week make it. */
const fetchHackerNewsStories = async (options) => {
  const cutoff = Math.floor(Date.now() / 1000) - HN_NEWS_MAX_AGE_S;
  const results = await Promise.allSettled(
    HN_NEWS_TERMS.map(async (term) => {
      const url =
        `${HN_NEWS_API}?query=${encodeURIComponent(term)}&tags=story` +
        `&hitsPerPage=${HN_NEWS_MAX_ITEMS}` +
        `&numericFilters=${encodeURIComponent(
          `points>${HN_NEWS_MIN_POINTS},created_at_i>${cutoff}`,
        )}`;
      const res = await fetch(url, options);
      if (!res.ok) throw new Error("HN news request failed");
      const json = await res.json();
      return json && Array.isArray(json.hits) ? json.hits : [];
    }),
  );
  const seen = new Set();
  const stories = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const hit of r.value) {
      if (!hit || !hit.objectID || seen.has(hit.objectID)) continue;
      seen.add(hit.objectID);
      const title =
        typeof hit.title === "string" ? hit.title.slice(0, 140) : "";
      if (!title) continue;
      stories.push({
        source: "Hacker News",
        title,
        time: isFinite(Number(hit.created_at_i))
          ? Number(hit.created_at_i) * 1000
          : null,
        tags: "",
        // Text posts (Ask/Show HN) have no external URL — link the discussion
        url:
          typeof hit.url === "string" && /^https:\/\//.test(hit.url)
            ? hit.url
            : `https://news.ycombinator.com/item?id=${hit.objectID}`,
        points: Number(hit.points) || 0,
      });
    }
  }
  stories.sort((a, b) => b.points - a.points);
  return stories
    .slice(0, HN_NEWS_MAX_ITEMS)
    .map(({ source, title, url, time, tags, points }) => ({
      source,
      title,
      url,
      time,
      tags,
      // The row prints it: a discussion has no summary, but it has a size
      points,
    }));
};

/* ON-CHAIN ADDRESS BALANCES (optional portfolio watching) ─────────────────
 * The user's address is sent only to the balance provider for that coin:
 * BTC → mempool.space (already a data source), ETH/LTC/DOGE → Blockchair
 * (already a data source). 10-minute cache per address; on failure the last
 * known balance is served so a flaky provider can't zero a holding.
 */
const MEMPOOL_ADDRESS_API = "https://mempool.space/api/address/";
const BLOCKCHAIR_DASHBOARD_API = "https://api.blockchair.com/";

const addressBalanceCache = new Map(); // "COIN:address" → { balance, timestamp }

/* Balances for one Ethereum address — the ether and every token, together.
 *
 * Every token asked for goes into a single JSON-RPC batch, so checking a
 * whole portfolio's worth of tokens costs one request rather than one each.
 * Balances come back as 32-byte hex and are scaled by the token's own
 * decimals — parsed via BigInt, since a raw 18-decimal balance overflows a
 * double long before it reaches the decimal point.
 *
 * **`ETH` itself rides in that batch** (`eth_getBalance` rather than an
 * `eth_call`), and that is not a tidy-up: the ether balance used to come from
 * Blockchair, so watching an Ethereum address meant two requests to two
 * providers, one of which is the one with a tight anonymous rate limit.
 * Blockchair answers a burst with **HTTP 430 — "your IP address is
 * temporarily blacklisted"** for the whole origin, not a per-request 429, and
 * measured on 23 Aug 2026 it took only a handful of quick calls to earn one.
 * Ethereum is also the chain most worth watching, because it is the one with
 * tokens in it. So the chain PriceTab asks about most now costs **one request
 * to one host**, and the rate-limited provider is out of that path entirely —
 * it is left serving LTC, DOGE, BCH and ZEC, which have no token batch to
 * ride along with.
 */
const erc20Cache = new Map(); // "address:COIN" → { amount, timestamp }

const decodeErc20Balance = (hex, decimals) => {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]*$/.test(hex)) return null;
  if (hex === "0x") return 0;
  let raw;
  try {
    raw = BigInt(hex);
  } catch (error) {
    return null;
  }
  if (raw < 0n) return null;
  // Split before dividing so precision survives the 18-decimal tokens
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const rest = raw % scale;
  return Number(whole) + Number(rest) / Number(scale);
};

const fetchErc20Balances = async (address, coins) => {
  const out = {};
  if (!WATCH_ADDRESS_RE.test(address || "")) return out;
  const now = Date.now();
  const wanted = [];
  for (const coin of coins || []) {
    // "ETH" is the ether itself; everything else has to be a known contract
    if (coin !== "ETH" && !ERC20_TOKENS[coin]) continue;
    const hit = erc20Cache.get(`${address}:${coin}`);
    if (hit && now - hit.timestamp < WATCH_BALANCE_TTL) out[coin] = hit.amount;
    else wanted.push(coin);
  }
  if (!wanted.length) return out;

  const padded = address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const batch = wanted.map((coin, i) =>
    coin === "ETH"
      ? {
          jsonrpc: "2.0",
          id: i,
          method: "eth_getBalance",
          params: [address, "latest"],
        }
      : {
          jsonrpc: "2.0",
          id: i,
          method: "eth_call",
          params: [
            {
              to: ERC20_TOKENS[coin].address,
              data: ERC20_BALANCE_SELECTOR + padded,
            },
            "latest",
          ],
        },
  );
  try {
    const res = await fetch(ETH_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error("token balance request failed");
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("unexpected batch response");
    for (const row of rows) {
      const coin = wanted[Number(row && row.id)];
      if (!coin || !row.result) continue;
      const amount = decodeErc20Balance(
        row.result,
        coin === "ETH" ? 18 : ERC20_TOKENS[coin].decimals,
      );
      if (amount === null) continue;
      erc20Cache.set(`${address}:${coin}`, { amount, timestamp: Date.now() });
      out[coin] = amount;
    }
  } catch (error) {
    // Serve whatever was cached; the next sweep tries again
    for (const coin of wanted) {
      const hit = erc20Cache.get(`${address}:${coin}`);
      if (hit) out[coin] = hit.amount;
    }
  }
  return out;
};

const fetchAddressBalance = async (coin, address) => {
  /* Tokens live on someone else's chain — ask their contract. Ether goes the
   * same way (see the note above `fetchErc20Balances`): the node that answers
   * for the tokens answers for the ether too, in the same batch, and keeps
   * the rate-limited provider out of Ethereum entirely. */
  if (coin === "ETH" || ERC20_TOKENS[coin]) {
    const balances = await fetchErc20Balances(address, [coin]);
    return coin in balances ? balances[coin] : null;
  }
  const spec = WATCH_CHAINS[coin];
  if (!spec || typeof address !== "string" || !WATCH_ADDRESS_RE.test(address)) {
    return null;
  }
  const key = `${coin}:${address}`;
  const hit = addressBalanceCache.get(key);
  if (hit && Date.now() - hit.timestamp < WATCH_BALANCE_TTL) {
    return hit.balance;
  }
  try {
    let raw = null;
    if (spec.provider === "mempool") {
      const res = await fetch(MEMPOOL_ADDRESS_API + encodeURIComponent(address));
      if (!res.ok) throw new Error("mempool address request failed");
      const json = await res.json();
      const chain = json && json.chain_stats;
      if (chain) {
        raw = Number(chain.funded_txo_sum) - Number(chain.spent_txo_sum);
      }
    } else {
      const res = await fetch(
        `${BLOCKCHAIR_DASHBOARD_API}${spec.chain}/dashboards/address/` +
          `${encodeURIComponent(address)}?limit=0`,
      );
      if (!res.ok) throw new Error("blockchair address request failed");
      const json = await res.json();
      // Response is keyed by the address (provider may re-case it)
      const entry =
        json && json.data && json.data[Object.keys(json.data)[0] || ""];
      if (entry && entry.address) raw = Number(entry.address.balance);
    }
    if (raw == null || !isFinite(raw) || raw < 0) {
      return hit ? hit.balance : null;
    }
    const balance = raw / Math.pow(10, spec.decimals);
    addressBalanceCache.set(key, { balance, timestamp: Date.now() });
    return balance;
  } catch (error) {
    return hit ? hit.balance : null; // stale beats blank
  }
};

/* KRAKEN (coins Coinbase doesn't list) ─────────────────────────────────────
 * One OHLC request carries the whole chart: the line series, the crosshair
 * candles and the latest close all come out of it. Kraken names the result
 * key itself (XMRUSD comes back as XXMRZUSD), so the first non-"last" key
 * is the series rather than a name we try to predict.
 */
const krakenOhlcCache = new Map(); // "COIN-period" → { rows, timestamp }

const fetchKrakenRows = async (coin, period, signal) => {
  const spec = KRAKEN_PERIODS[period];
  if (!spec) throw new Error(`no Kraken interval for ${period}`);
  const key = `${coin}-${period}`;
  const hit = krakenOhlcCache.get(key);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) return hit.rows;

  const res = await fetchWithRetry(
    `${KRAKEN_API}OHLC?pair=${encodeURIComponent(coin)}USD&interval=${spec.interval}`,
    signal ? { signal } : {},
  ).then((r) => r.json());
  if (res && Array.isArray(res.error) && res.error.length) {
    throw new Error(res.error.join(", "));
  }
  const result = res && res.result;
  const seriesKey =
    result && Object.keys(result).find((k) => k !== "last");
  const rows = seriesKey ? result[seriesKey] : null;
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("invalid Kraken data returned");
  }
  // Only the tail matters — the interval is sized to overshoot the window
  const trimmed = rows.slice(-spec.points);
  krakenOhlcCache.set(key, { rows: trimmed, timestamp: Date.now() });
  return trimmed;
};

// Same shape fetchValueHistory returns: [{ price, time: Date }] ascending
const fetchKrakenHistory = async (coin, period, currency, signal) => {
  const [rows, rate] = await Promise.all([
    fetchKrakenRows(coin, period, signal),
    fetchUsdRate(currency),
  ]);
  if (rate === null) throw new Error("no exchange rate for " + currency);
  return rows.map((r) => ({
    price: Number(r[4]) * rate, // close
    time: new Date(Number(r[0]) * 1000),
  }));
};

// Latest trade price. Kraken's Ticker is one request, like Coinbase's spot.
const fetchKrakenSpot = async (coin, currency, signal) => {
  const [res, rate] = await Promise.all([
    fetchWithRetry(
      `${KRAKEN_API}Ticker?pair=${encodeURIComponent(coin)}USD`,
      signal ? { signal } : {},
    ).then((r) => r.json()),
    fetchUsdRate(currency),
  ]);
  if (res && Array.isArray(res.error) && res.error.length) {
    throw new Error(res.error.join(", "));
  }
  if (rate === null) throw new Error("no exchange rate for " + currency);
  const result = res && res.result;
  const seriesKey = result && Object.keys(result)[0];
  const last =
    seriesKey && result[seriesKey].c ? Number(result[seriesKey].c[0]) : NaN;
  if (!isFinite(last) || last <= 0) throw new Error("invalid Kraken spot");
  return last * rate;
};

// Crosshair candles, straight out of the same OHLC rows
const fetchKrakenCandles = async (coin, period, currency) => {
  try {
    const [rows, rate] = await Promise.all([
      fetchKrakenRows(coin, period),
      fetchUsdRate(currency),
    ]);
    if (rate === null) return null;
    return rows.map((r) => ({
      time: Number(r[0]) * 1000,
      open: Number(r[1]) * rate,
      high: Number(r[2]) * rate,
      low: Number(r[3]) * rate,
      close: Number(r[4]) * rate,
      volume: Number(r[6]), // base-asset volume, not currency-scaled
    }));
  } catch (error) {
    return null; // price-only readout, same as an unsupported Coinbase range
  }
};

/* OHLC CANDLES (crosshair readout) ─────────────────────────────────────────
 * Fetched lazily — only once the user actually hovers a chart — so the
 * common "open a tab, glance, close it" path costs nothing extra.
 * Rows arrive as [time, low, high, open, close, volume], newest first.
 */
const CANDLES_API = "https://api.exchange.coinbase.com/products/";

/* ── DEEP DAILY CLOSES ──────────────────────────────────────────────────────
 * Years of daily closes for one coin, for the base-rate panel.
 *
 * **Why this and not the series already on screen.** `calculateRSI` samples
 * the visible range to about fifty points, so "RSI 14" spans sixteen minutes
 * on a 1H chart and three and a half years on ALL — measured on live BTC at
 * one instant the six ranges read 63.8 / 63.9 / 82.2 / 80.9 / 37.8 / 54.6
 * against 80.5 for RSI 14 on daily closes, a 43-point spread on the same coin
 * at the same moment (the working notes §9.5). A statement about how
 * often something has happened has to be computed on one fixed clock, and the
 * daily close is the clock every published figure uses.
 *
 * **Why the depth matters more than it looks.** Kraken's `interval=1440` caps
 * at 721 rows — about two years — and inside two years RSI crosses 70 three to
 * nine times. A panel whose every answer is "n=4" is a panel that can never
 * say anything. Paging this endpoint reaches 2015: measured 22 Aug 2026, BTC
 * 4,053 closes, ETH 3,748, SOL 1,894, and RSI>70 gives n=92 / 86 / 31. That is
 * the difference between a feature and a placeholder.
 *
 * **The cost, measured, and why it is bounded.** 17 requests, 4.7 seconds and
 * 237 KB for BTC — roughly 97 KB in `localStorage` per coin. Fine for the two
 * or three coins somebody actually studies and absurd for 81, so: fetched only
 * when the panel is opened, one coin at a time, `DAILY_CLOSES_MAX_COINS` kept,
 * newest first. The host is already in `ALLOWED_HOSTS` — it serves the
 * crosshair's candles — so this adds no remote host and no permission.
 *
 * A daily close changes once a day, so the TTL is twelve hours: long enough
 * that reopening the panel is free, short enough that today's bar arrives.
 */
const DAILY_CLOSES_CACHE_KEY = "crypto_chart_daily_closes";
const DAILY_CLOSES_TTL = 43200000; // 12h
const DAILY_CLOSES_MAX_COINS = 3;
const DAILY_CLOSES_PAGE_DAYS = 290; // the endpoint returns at most 300 rows
const DAILY_CLOSES_MAX_PAGES = 20; // ~15 years, and a hard stop on the loop
const DAILY_CLOSES_PAGE_GAP = 120; // ms between pages — be kind to the host
const DAILY_CLOSES_PERSIST_DELAY = 1000;

/* COIN → { t, candles: [{ t, open, high, low, close }] }.
 *
 * It held closes alone until 22 Sep 2026, when the candlestick patterns
 * needed the other three numbers — a pattern is a statement about a bar's
 * body and its wicks, so a series of closes cannot see one. The request was
 * already returning OHLC and throwing it away; nothing about the network
 * cost changed. What did change is the stored size, and it is smaller than
 * it looks: written as `[t, o, h, l, c]` rows rather than objects, BTC's
 * whole decade is about 190 KB against 97 KB for the closes. The key is in
 * `EPHEMERAL_CACHE_KEYS` now, so a full disk spends this before it spends
 * anything a person typed. */
const dailyClosesCache = new Map();
let dailyClosesPersistTimer = null;
const dailyClosesInFlight = new Map();

const persistDailyCloses = () => {
  clearTimeout(dailyClosesPersistTimer);
  dailyClosesPersistTimer = setTimeout(() => {
    try {
      const now = Date.now();
      const entries = Array.from(dailyClosesCache.entries())
        .filter(([, v]) => now - v.t <= DAILY_CLOSES_TTL)
        .sort((a, b) => b[1].t - a[1].t)
        .slice(0, DAILY_CLOSES_MAX_COINS)
        /* Rows, not objects: four repeated keys per day over four thousand
           days is most of the file. Revived by `hydrateDailyCloses`. */
        .map(([coin, v]) => [
          coin,
          { t: v.t, rows: v.candles.map((c) => [c.t, c.open, c.high, c.low, c.close]) },
        ]);
      localStorage.setItem(DAILY_CLOSES_CACHE_KEY, JSON.stringify(entries));
    } catch (error) {
      // Storage full or unavailable — the next open simply fetches again
    }
  }, DAILY_CLOSES_PERSIST_DELAY);
};

const hydrateDailyCloses = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_CLOSES_CACHE_KEY));
    if (!Array.isArray(saved)) return;
    const now = Date.now();
    for (const entry of saved) {
      if (!Array.isArray(entry)) continue;
      const [coin, value] = entry;
      if (typeof coin !== "string" || !value || typeof value.t !== "number") continue;
      if (value.t > now || now - value.t > DAILY_CLOSES_TTL) continue;
      /* Stored is untrusted: a hand-edited file must not be able to put a
         string or a NaN into a median. An entry written before the shape
         carried OHLC has no `rows` and is simply dropped — it would have to
         be refetched to answer a pattern anyway, and half a candle is worse
         than none. */
      const candles = Array.isArray(value.rows)
        ? value.rows
            .map((r) => {
              if (!Array.isArray(r) || r.length < 5) return null;
              const [t, open, high, low, close] = r.map(Number);
              return [t, open, high, low, close].every((n) => isFinite(n) && n > 0)
                ? { t, open, high, low, close }
                : null;
            })
            .filter(Boolean)
        : [];
      if (candles.length > 50) dailyClosesCache.set(coin, { t: value.t, candles });
    }
  } catch (error) {
    // Corrupt entry — the next persist overwrites it
  }
};

hydrateDailyCloses();

/* Pages backwards until the endpoint stops answering or the cap is reached.
 *
 * Always in USD. A base rate is a count of how often something happened, and
 * that count is a property of the market, not of the currency somebody is
 * reading it in — converting every close through today's exchange rate would
 * change the numbers without changing what happened.
 */
const fetchDailyCandles = async (coin) => {
  const hit = dailyClosesCache.get(coin);
  if (hit && Date.now() - hit.t < DAILY_CLOSES_TTL) return hit.candles;
  const running = dailyClosesInFlight.get(coin);
  if (running) return running;

  const run = (async () => {
    const byTime = new Map();
    let end = new Date();
    for (let page = 0; page < DAILY_CLOSES_MAX_PAGES; page++) {
      const start = new Date(
        end.getTime() - DAILY_CLOSES_PAGE_DAYS * 86400000,
      );
      const url =
        `${CANDLES_API}${encodeURIComponent(coin)}-USD/candles` +
        `?granularity=86400&start=${start.toISOString()}&end=${end.toISOString()}`;
      let rows;
      try {
        rows = await fetchWithRetry(url, {}, 1).then((r) => r.json());
      } catch (error) {
        break; // whatever was collected is still worth using
      }
      if (!Array.isArray(rows) || !rows.length) break;
      // The endpoint answers [time, low, high, open, close, volume]
      for (const row of rows) {
        const time = Number(row[0]);
        const low = Number(row[1]);
        const high = Number(row[2]);
        const open = Number(row[3]);
        const close = Number(row[4]);
        if ([time, low, high, open, close].every((n) => isFinite(n) && n > 0)) {
          byTime.set(time, { t: time, open, high, low, close });
        }
      }
      end = start;
      if (page + 1 < DAILY_CLOSES_MAX_PAGES) await sleep(DAILY_CLOSES_PAGE_GAP);
    }
    const candles = Array.from(byTime.keys())
      .sort((a, b) => a - b)
      .map((t) => byTime.get(t));
    // Under a year of history cannot carry a base rate worth printing
    if (candles.length < 200) return null;
    dailyClosesCache.set(coin, { t: Date.now(), candles });
    persistDailyCloses();
    return candles;
  })().finally(() => dailyClosesInFlight.delete(coin));

  dailyClosesInFlight.set(coin, run);
  return run;
};

/* The same series as closes alone, for the two readers that want a price per
 * day and nothing else — the derivatives page's edge strip and anything
 * counting a state off the close. One request and one cache behind both. */
const fetchDailyCloses = async (coin) => {
  const candles = await fetchDailyCandles(coin);
  return candles ? candles.map((c) => c.close) : null;
};
/* ── What followed the last US CPI releases ─────────────────────────────
 *
 * For the base-rate screen: each of the last `CPI_MOVES_RELEASES` releases,
 * read off one request of Coinbase 1-minute candles (the 210 minutes before
 * and 30 after — 240 rows, one page) and reduced to eight numbers by
 * `cpiMoveFromCandles`. **Kept for good**: a window in the past never
 * changes, so an entry is only ever written once — including an answer of
 * "incomplete", which is a fact about that window and not worth asking for
 * again. Keyed `COIN:ms`; the oldest go first past `CPI_MOVES_MAX_ENTRIES`.
 * Nothing is asked until the screen is opened, and the six coins Coinbase
 * does not list (see `COIN_PROVIDERS`) are not asked at all. */
/* Here and not in config.js: the cache is hydrated as this file loads, and
   config.js loads after it. */
const CPI_MOVES_KEY = "crypto_chart_cpi_moves";
const CPI_MOVES_RELEASES = 12;
const CPI_MOVES_MAX_ENTRIES = 60;
const cpiMovesCache = new Map();
const cpiMovesInFlight = new Map();

const persistCpiMoves = () => {
  try {
    const entries = Array.from(cpiMovesCache.entries())
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, CPI_MOVES_MAX_ENTRIES);
    localStorage.setItem(CPI_MOVES_KEY, JSON.stringify(entries));
  } catch (error) {
    // Storage full or unavailable — the next open asks again
  }
};

const hydrateCpiMoves = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(CPI_MOVES_KEY));
    if (!Array.isArray(saved)) return;
    for (const entry of saved) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
      const v = entry[1];
      if (!v || !Number.isFinite(v.at)) continue;
      /* Untrusted like every stored thing: eight finite, non-negative
         numbers, or the marker that the window was incomplete. */
      if (v.incomplete === true) {
        cpiMovesCache.set(entry[0], { at: v.at, incomplete: true });
        continue;
      }
      const nums = [v.after].concat(Array.isArray(v.before) ? v.before : []);
      if (nums.length !== 8 || !nums.every((n) => Number.isFinite(n) && n >= 0)) continue;
      cpiMovesCache.set(entry[0], { at: v.at, after: v.after, before: v.before.slice() });
    }
  } catch (error) {
    // Corrupt entry — the next persist overwrites it
  }
};

hydrateCpiMoves();

const fetchCpiMoves = async (coin, now) => {
  if (!coin || providerFor(coin) !== "coinbase") return { unavailable: true };
  const clock = Number.isFinite(now) ? now : Date.now();
  /* Only releases whose half hour after has finished. */
  const times = cpiReleaseTimes().filter((t) => t + 30 * 60000 <= clock).slice(-CPI_MOVES_RELEASES);
  const key = `${coin}:${times.join(",")}`;
  if (cpiMovesInFlight.has(key)) return cpiMovesInFlight.get(key);
  const run = (async () => {
    const moves = [];
    let asked = false;
    for (const at of times) {
      const id = `${coin}:${at}`;
      const hit = cpiMovesCache.get(id);
      if (hit) {
        moves.push(hit);
        continue;
      }
      if (asked) await sleep(DAILY_CLOSES_PAGE_GAP);
      asked = true;
      const start = new Date(at - 211 * 60000).toISOString();
      const end = new Date(at + 30 * 60000).toISOString();
      let rows;
      try {
        rows = await fetchWithRetry(
          `${CANDLES_API}${encodeURIComponent(coin)}-USD/candles?granularity=60&start=${start}&end=${end}`,
          {},
          1,
        ).then((r) => r.json());
      } catch (error) {
        /* Not stored: a failed request says nothing about the window. */
        continue;
      }
      const m = cpiMoveFromCandles(rows, at);
      const entry = m || { at, incomplete: true };
      cpiMovesCache.set(id, entry);
      moves.push(entry);
    }
    if (asked) persistCpiMoves();
    return { moves, asked: times.length };
  })().finally(() => cpiMovesInFlight.delete(key));
  cpiMovesInFlight.set(key, run);
  return run;
};

const ohlcCache = new Map(); // "COIN-period-currency" → { data, timestamp }
// Requests in flight per key, so concurrent readers of a cold key share one
const ohlcInFlight = new Map();

// Coins Kraken turned out not to list. Populated on the first miss so an
// unlisted pair isn't re-requested every time the range is selected.
const krakenUnsupported = new Set();

const fetchOhlcCandles = async (coin, period, currency, crossProvider) => {
  // Kraken coins already have candles from their history request — including
  // ones that started the tab on Coinbase and were failed over
  if (effectiveProvider(coin) === "kraken") {
    return fetchKrakenCandles(coin, period, currency);
  }

  /* Coinbase's coarsest candle is a day and it returns ~350 of them, so no
   * request covers the ALL range — that is why it had no candles. Kraken's
   * 15-day candles reach back a decade or more, so the whole ALL chart is
   * sourced from there instead. Only in candlestick mode, where the line is
   * derived from these same candles: overlaying one exchange's candles on
   * another's line would put two slightly different prices on one chart. */
  if (period === "all" && crossProvider && !krakenUnsupported.has(coin)) {
    const candles = await fetchKrakenCandles(coin, "all", currency);
    if (candles && candles.length) return candles;
    krakenUnsupported.add(coin);
    return null;
  }

  const spec = OHLC_GRANULARITY[period];
  if (!spec || !OHLC_CURRENCIES.includes(currency)) return null;
  const key = `${coin}-${period}-${currency}`;
  const hit = ohlcCache.get(key);
  if (hit && Date.now() - hit.timestamp < OHLC_CACHE_TTL) return hit.data;
  /* One request per cold key, however many callers want it.
   *
   * The cache only holds an answer *after* the response lands, so two readers
   * arriving on the same cold key — the crosshair and a target check, say —
   * each saw a miss and each sent a request. `fetchCoinloreGlobal` already
   * shared its in-flight promise; this is the same pattern for a keyed cache.
   * The entry is deleted in `finally`, so a failure is never remembered as
   * one: the next caller tries again rather than inheriting a rejection.
   *
   * Deliberately not applied to the chart's own history requests, which carry
   * a caller's `AbortSignal` — sharing one of those would let whoever switched
   * coin first cancel everybody else's work. */
  const shared = ohlcInFlight.get(key);
  if (shared) return shared;
  const run = (async () => {
  try {
    const res = await fetch(
      `${CANDLES_API}${encodeURIComponent(`${coin}-${currency}`)}` +
        `/candles?granularity=${spec.granularity}`,
    );
    if (!res.ok) throw new Error("candles request failed");
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) throw new Error("no candles");
    const data = [];
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 6) continue;
      const [time, low, high, open, close, volume] = r.map(Number);
      if (!isFinite(time) || !isFinite(close)) continue;
      data.push({ time: time * 1000, low, high, open, close, volume });
    }
    if (!data.length) throw new Error("no usable candles");
    data.sort((a, b) => a.time - b.time); // API returns newest first
    // The response ignores our window, so keep only the newest candles that
    // belong to this period — otherwise a 1H chart shows ~6 hours
    const windowed = data.slice(-spec.points);
    ohlcCache.set(key, { data: windowed, timestamp: Date.now() });
    return windowed;
  } catch (error) {
    return hit ? hit.data : null; // stale beats nothing; null = price-only
  }
  })();
  ohlcInFlight.set(key, run);
  try {
    return await run;
  } finally {
    ohlcInFlight.delete(key);
  }
};

/* **Candles for a window the chart chose** (the chart plan's Phase 2).
 *
 * A zoomed chart asks for finer bars than its range carries: Coinbase
 * Exchange candles at the granularity `viewGranularity` picks, for the window
 * and half a window either side (`loadChartDetail`, app-view.js). The
 * endpoint answers at most 300 bars, so the request is cut into **pages**
 * aligned to 300 bars of the granularity — a pan inside a page asks nothing,
 * and the same window reached from two directions is the same page.
 *
 * A page that ended over a minute ago never changes and is kept for good
 * (in memory `VIEW_CANDLE_MEMORY`, on disk the newest `VIEW_CANDLE_STORED`);
 * the page that holds "now" is asked again after one bar. Only the coins and
 * currencies Coinbase Exchange quotes — anything else is null, and the chart
 * draws its range's own points. No new host: `api.exchange.coinbase.com` is
 * already the candles provider. Persisted because the rule for every cache
 * here is that a new tab should not pay again for what the last one fetched;
 * the key is in `EPHEMERAL_CACHE_KEYS`. */
const VIEW_CANDLES_KEY = "crypto_chart_view_candles";
const VIEW_CANDLE_PAGE = 300; // bars per request — the endpoint's own cap
const VIEW_CANDLE_PAGES_MAX = 3; // a window and half a window each side
const VIEW_CANDLE_MEMORY = 40;
const VIEW_CANDLE_STORED = 6;
const VIEW_CANDLE_MAX_AGE = 7 * 86400000; // a stored page older than this is dropped
const viewCandleCache = new Map(); // "COIN-CUR-g-k" → { at, rows, complete }
const viewCandleInFlight = new Map();
let viewCandlePersistTimer = null;

const persistViewCandles = () => {
  clearTimeout(viewCandlePersistTimer);
  viewCandlePersistTimer = setTimeout(() => {
    try {
      const entries = Array.from(viewCandleCache.entries())
        .filter(([, v]) => v.complete)
        .sort((a, b) => b[1].at - a[1].at)
        .slice(0, VIEW_CANDLE_STORED)
        .map(([key, v]) => [key, { at: v.at, rows: v.rows }]);
      localStorage.setItem(VIEW_CANDLES_KEY, JSON.stringify(entries));
    } catch (error) {
      // Storage full or unavailable — the next zoom simply asks again
    }
  }, PRICE_CACHE_PERSIST_DELAY);
};

const hydrateViewCandles = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_CANDLES_KEY));
    if (!Array.isArray(saved)) return;
    const now = Date.now();
    for (const entry of saved) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
      const v = entry[1];
      if (!v || typeof v.at !== "number" || v.at > now || now - v.at > VIEW_CANDLE_MAX_AGE) continue;
      if (!Array.isArray(v.rows)) continue;
      // Untrusted: six finite numbers a row, prices above zero
      const rows = v.rows.filter(
        (r) => Array.isArray(r) && r.length === 6 && r.every((n) => Number.isFinite(n)) && r[1] > 0 && r[4] > 0,
      );
      if (rows.length) viewCandleCache.set(entry[0], { at: v.at, rows, complete: true });
    }
  } catch (error) {
    // Corrupt entry — the next persist overwrites it
  }
};

hydrateViewCandles();

// One page: 300 bars of `g` seconds, the k-th since the epoch
const fetchViewCandlePage = (coin, currency, g, k) => {
  const key = `${coin}-${currency}-${g}-${k}`;
  const size = VIEW_CANDLE_PAGE * g * 1000;
  const start = k * size;
  const end = start + size - g * 1000;
  const now = Date.now();
  const hit = viewCandleCache.get(key);
  if (hit && (hit.complete || now - hit.at < Math.max(30000, g * 1000))) {
    // Most recently used last, so the trim below drops the oldest
    viewCandleCache.delete(key);
    viewCandleCache.set(key, hit);
    return Promise.resolve(hit.rows);
  }
  const shared = viewCandleInFlight.get(key);
  if (shared) return shared;
  const run = (async () => {
    try {
      const res = await fetchWithRetry(
        `${CANDLES_API}${encodeURIComponent(`${coin}-${currency}`)}/candles` +
          `?granularity=${g}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`,
        {},
        1,
      );
      if (!res.ok) throw new Error("candles request failed");
      const body = await res.json();
      if (!Array.isArray(body)) throw new Error("no candles");
      // [time, low, high, open, close, volume], newest first — kept as rows
      const rows = body
        .map((r) => (Array.isArray(r) ? r.slice(0, 6).map(Number) : null))
        .filter((r) => r && r.length === 6 && r.every((n) => Number.isFinite(n)) && r[1] > 0 && r[4] > 0)
        .map((r) => [r[0] * 1000, r[1], r[2], r[3], r[4], r[5]])
        .sort((a, b) => a[0] - b[0]);
      const complete = end + g * 1000 <= Date.now() - 60000;
      viewCandleCache.delete(key);
      viewCandleCache.set(key, { at: Date.now(), rows, complete });
      while (viewCandleCache.size > VIEW_CANDLE_MEMORY) {
        viewCandleCache.delete(viewCandleCache.keys().next().value);
      }
      if (complete) persistViewCandles();
      return rows;
    } catch (error) {
      // A stale page beats none; a failure is not remembered as an answer
      return hit ? hit.rows : null;
    }
  })().finally(() => viewCandleInFlight.delete(key));
  viewCandleInFlight.set(key, run);
  return run;
};

/* Every candle of `g` seconds between `from` and `to` (ms), oldest first, as
   `{ time, low, high, open, close, volume }` — or null where Coinbase
   Exchange does not quote the pair, or nothing came back. */
const fetchViewCandles = async (coin, currency, g, from, to) => {
  if (!coin || effectiveProvider(coin) !== "coinbase" || !OHLC_CURRENCIES.includes(currency)) return null;
  if (!(g > 0) || !(to > from)) return null;
  const size = VIEW_CANDLE_PAGE * g * 1000;
  const last = Math.floor(Math.min(to, Date.now()) / size);
  const first = Math.max(Math.floor(from / size), last - VIEW_CANDLE_PAGES_MAX + 1);
  const rows = [];
  for (let k = first; k <= last; k++) {
    const cached = viewCandleCache.get(`${coin}-${currency}-${g}-${k}`);
    if (k > first && !(cached && cached.complete)) await sleep(DAILY_CLOSES_PAGE_GAP);
    const page = await fetchViewCandlePage(coin, currency, g, k);
    if (page) rows.push(...page);
  }
  const out = [];
  let seen = -Infinity;
  for (const r of rows.sort((a, b) => a[0] - b[0])) {
    if (r[0] <= seen || r[0] < from - g * 1000 || r[0] > to) continue;
    seen = r[0];
    out.push({ time: r[0], low: r[1], high: r[2], open: r[3], close: r[4], volume: r[5] });
  }
  return out.length >= 2 ? out : null;
};

/* Candles for target checking. Hourly granularity covers ~14 days in one
 * request, which is the window we can look back over to catch a target that
 * was hit while no tab was open. Shares the cache with the crosshair's 1W
 * candles, so a user on the weekly chart pays for this twice over. */
const fetchTargetCandles = (coin, currency) =>
  fetchOhlcCandles(coin, "week", currency);

// Nearest candle to a timestamp, but only when it's actually close: a
// point outside the candle range must not borrow a far-away candle's
// numbers. Tolerance is half a step, derived from the series itself.
const candleAt = (candles, timeMs) => {
  if (!Array.isArray(candles) || !candles.length) return null;
  let lo = 0;
  let hi = candles.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < timeMs) lo = mid;
    else hi = mid;
  }
  const best =
    Math.abs(candles[lo].time - timeMs) <= Math.abs(candles[hi].time - timeMs)
      ? candles[lo]
      : candles[hi];
  const step =
    candles.length > 1 ? candles[1].time - candles[0].time : Infinity;
  return Math.abs(best.time - timeMs) <= step ? best : null;
};

/* BTC address history (for chain-inferred purchase lots): one request gives
 * the ~50 most recent transactions with full in/out detail. Reduced here to
 * chronological net deltas per tx — positive = received, negative = spent —
 * which the lot builder turns into dated purchases. Same TTL as balances. */
const addressTxCache = new Map(); // address → { deltas, timestamp }

const fetchBtcAddressDeltas = async (address) => {
  if (typeof address !== "string" || !WATCH_ADDRESS_RE.test(address)) {
    return null;
  }
  const hit = addressTxCache.get(address);
  if (hit && Date.now() - hit.timestamp < WATCH_BALANCE_TTL) {
    return hit.deltas;
  }
  try {
    const res = await fetch(
      `${MEMPOOL_ADDRESS_API}${encodeURIComponent(address)}/txs`,
    );
    if (!res.ok) throw new Error("mempool txs request failed");
    const txs = await res.json();
    if (!Array.isArray(txs)) throw new Error("unexpected txs shape");
    const deltas = [];
    for (const tx of txs) {
      let sats = 0;
      for (const out of tx.vout || []) {
        if (out && out.scriptpubkey_address === address) {
          sats += Number(out.value) || 0;
        }
      }
      for (const inp of tx.vin || []) {
        const prev = inp && inp.prevout;
        if (prev && prev.scriptpubkey_address === address) {
          sats -= Number(prev.value) || 0;
        }
      }
      if (!sats) continue;
      // Unconfirmed txs have no block_time yet — treat as "now"
      const time =
        tx.status && tx.status.block_time
          ? Number(tx.status.block_time)
          : Math.floor(Date.now() / 1000);
      deltas.push({ time, delta: sats / 1e8 });
    }
    deltas.reverse(); // newest-first from the API → chronological
    addressTxCache.set(address, { deltas, timestamp: Date.now() });
    return deltas;
  } catch (error) {
    return hit ? hit.deltas : null; // stale beats blank
  }
};

/* Headlines that actually mention a coin, from inside a time window.
 *
 * Deliberately narrow. A general crypto feed next to a falling BTC chart
 * would mostly show stories about other coins, and proximity alone reads as
 * explanation — so a headline has to name the coin, and if none do, nothing
 * is shown rather than filler.
 *
 * Symbols are matched case-sensitively because crypto headlines write
 * tickers in caps: lowercase matching would make OP, BAT, TON and SAND fire
 * on ordinary English. The full name is matched case-insensitively, and the
 * feed's own coin tags count too.
 */
/* Does one story name one coin? Lifted out of `headlinesForCoin` when the
 * news row grew a filter of its own: two places deciding what "about BTC"
 * means is two places that can come to disagree, and the answer here is
 * fiddly enough (case-sensitive symbols, case-insensitive names) that the
 * copy would have been the one that drifted. */
const newsMentionsCoin = (item, coin, symbolRe, name) => {
  if (!item || typeof item.title !== "string") return false;
  const raw = `${item.title} ${item.tags || ""}`;
  return (
    symbolRe.test(raw) || (name.length > 2 && raw.toLowerCase().includes(name))
  );
};

const coinNameLower = (coin) =>
  String((typeof COIN_NAMES !== "undefined" && COIN_NAMES[coin]) || "").toLowerCase();

const headlinesForCoin = (items, coin, sinceMs, limit = 2) => {
  if (!Array.isArray(items) || !coin) return [];
  const name = coinNameLower(coin);
  const symbolRe = new RegExp(`\\b${coin}\\b`);
  const out = [];
  for (const item of items) {
    if (!item || typeof item.title !== "string") continue;
    if (sinceMs && !(item.time >= sinceMs)) continue;
    if (!newsMentionsCoin(item, coin, symbolRe, name)) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
};

/* **The window's headlines, split by whether they name the coin that moved.**
 *
 * The "what happened here?" card asked three archives and showed the first
 * four things they returned, about any coin at all. Measured 10 Sep 2026 on a
 * fresh install: a mark on a 1H, 1D, 1W or 1M chart gets **nothing** from
 * Blockchair (it answers only for windows a few months old) and four to six
 * stories from Hacker News, of which **one** named Bitcoin and **none** named
 * XRP or SOL. So a card headed "XRP fell 7.2%" was followed by four headlines
 * about something else, under a line saying that is what was being written at
 * the time — true, and useless.
 *
 * Two rules, and the second is the one that matters:
 *
 *   · **Ranked, never filtered.** Narrowing to the coin empties the card for
 *     every coin but Bitcoin. What is about this coin goes first and is said
 *     to be about it; the rest follow under their own heading, so the reader
 *     is never told a general story is about their move.
 *   · **The same definition of "about BTC" as everywhere else** —
 *     `newsMentionsCoin`, which the ticker's filter and the panel's unusual
 *     section already share. Three implementations of that question would
 *     disagree on the first ambiguous headline.
 *
 * Sources the reader has switched off are gone before either list is built:
 * the panel's own rule, for the panel's own reason.
 */
const newsAboutCoin = (items, coin, fromMs, toMs, enabled) => {
  const empty = { about: [], other: [] };
  if (!Array.isArray(items) || !coin) return empty;
  /* `Number.isFinite`, not the global: `isFinite(null)` coerces to zero and
     answers **true**, so a call asking "which of these is about this coin"
     with no window at all was silently given the window [0, 0] and matched
     nothing. It cost one green test run to find. */
  const bounded = Number.isFinite(fromMs) && Number.isFinite(toMs);
  const from = bounded ? Math.min(fromMs, toMs) : null;
  const to = bounded ? Math.max(fromMs, toMs) : null;
  const off = enabled && typeof enabled === "object" ? enabled : null;
  const name = coinNameLower(coin);
  const symbolRe = new RegExp(`\\b${coin}\\b`);
  const about = [];
  const other = [];
  for (const item of items) {
    if (!item || typeof item.title !== "string") continue;
    if (off && off[item.source] === false) continue;
    /* An undated story cannot be placed in a window. It rides along in the
       panel, where the list is what it is; here the window *is* the claim. */
    if (from !== null && !(item.time >= from && item.time <= to)) continue;
    (newsMentionsCoin(item, coin, symbolRe, name) ? about : other).push(item);
  }
  return { about, other };
};

/* The headline row, narrowed to a set of coins.
 *
 * The whole list back when the set is empty rather than nothing: an empty set
 * means "you are not tracking anything", and a row that goes blank because a
 * portfolio has not been filled in yet looks like a broken feature rather
 * than an honoured setting. The caller decides whether to narrow at all; this
 * only ever answers "which of these name one of those".
 */
const newsForCoins = (items, coins) => {
  if (!Array.isArray(items)) return [];
  const list = Array.isArray(coins) ? coins.filter(Boolean) : [];
  if (!list.length) return items;
  // Built once per call, not once per story: 40 headlines × 66 coins is 2,640
  // regex constructions a redraw does not need
  const tests = list.map((coin) => ({
    re: new RegExp(`\\b${coin}\\b`),
    name: coinNameLower(coin),
    coin,
  }));
  return items.filter((item) =>
    tests.some((t) => newsMentionsCoin(item, t.coin, t.re, t.name)),
  );
};

/* Merge news lists in priority order: spam filtered everywhere, duplicate
 * stories collapsed across sources by normalized title (aggregators often
 * carry the same story from several outlets), capped at MAX_NEWS_ITEMS. */
/* Headlines read back out of localStorage, put through the same rules the
 * fetchers apply on the way in.
 *
 * Every other stored shape here has a sanitizer — `sanitizeCalls`,
 * `sanitizeSales`, `sanitizeLots` — because localStorage survives upgrades and
 * anyone can edit it from DevTools. The news cache was the exception: it was
 * trusted whenever `items` was a non-empty array, and its `url` went straight
 * into an `href`. Measured with a hand-edited cache: a `javascript:` URL and a
 * plain `http://` one both reached the DOM. The `javascript:` one does not run
 * when clicked — the link carries `target="_blank"` and MV3's CSP refuses the
 * navigation — but the HTTPS-only rule the fetchers enforce was gone, and a
 * non-string title would have been handed to React as a child.
 *
 * Same limits as `fetchBlockchairNews`, deliberately: two places deciding what
 * a headline may contain is two places that can disagree, and the one that
 * drifts is the one nobody is looking at. */
const sanitizeNewsItems = (list, limit = MAX_NEWS_ITEMS) =>
  (Array.isArray(list) ? list : [])
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const title = typeof item.title === "string" ? item.title.slice(0, 140) : "";
      if (!title) return null;
      return {
        source:
          typeof item.source === "string"
            ? item.source.replace(/^(www|en)\./, "").slice(0, 30)
            : "news",
        title,
        time: typeof item.time === "number" && isFinite(item.time) ? item.time : null,
        tags: typeof item.tags === "string" ? item.tags.slice(0, 200) : "",
        /* The feed's own summary, kept and length-capped like everything else
         * here. `author` and `categories` are deliberately **not** kept: they
         * are read by `isPromoNews` on the way in and nothing renders them, so
         * carrying them into storage would be storing what we do not use. */
        summary:
          typeof item.summary === "string"
            ? item.summary.slice(0, NEWS_SUMMARY_MAX)
            : "",
        /* A discussion's points (Hacker News), which its row prints in
         * place of the summary a discussion does not have. A whole number or
         * nothing — this is read back from storage like the rest. */
        points:
          Number.isFinite(item.points) && item.points > 0 ? Math.min(Math.round(item.points), 1e6) : 0,
        // https only, and nothing else — the same test the fetchers apply
        url:
          typeof item.url === "string" && /^https:\/\//.test(item.url)
            ? item.url
            : null,
      };
    })
    .filter(Boolean)
    .slice(0, limit);

hydrateMoveNewsCache();

/* ── THE HEADLINES THIS BROWSER HAS ALREADY BEEN SHOWN ────────────────────
 *
 * **There is a hole between the feed and the archive, and it is exactly where
 * people click.** Measured 12 Sep 2026, asking Blockchair's news archive about
 * a three-day window at five ages: 15 days old → **0 items**, 21 days → **0**,
 * 30 days → 20, 38 → 20, 45 → 20. It lags somewhere between three and four
 * weeks. The live feed holds about a week. So a mark on a 1W or 1M chart —
 * the ranges anybody actually reads — falls in between, and "what happened
 * here?" answers it with two or three Hacker News threads or with nothing.
 *
 * **No new source closes that; the app was throwing away the answer.**
 * `NEWS_CACHE_KEY` holds *the latest fetch only* and replaces it wholesale
 * every ten minutes, so a headline the reader was shown a fortnight ago —
 * downloaded, promo-filtered, from the newsrooms they granted — is gone. This
 * keeps them instead: every fetch is merged into one rolling store, newest
 * first, capped by count and by age.
 *
 * **Summaries are deliberately not kept.** The move card prints titles, and a
 * headline with its summary measured **528 bytes** against roughly 180
 * without (ten items of `news.bitcoin.com/feed/` = 5,278 bytes), so the whole
 * archive is about 70 KB rather than 206 KB. The panel keeps its own cache and
 * its own summaries; this store answers one question and carries what that
 * question needs.
 *
 * It is a cache in the one sense that matters here — losing it costs a nicety
 * and never a record somebody typed — so it is in `EPHEMERAL_CACHE_KEYS` and
 * is dropped before the portfolio when the quota refuses a write. What it is
 * *not* is rebuildable: these stories cannot be fetched again, which is the
 * whole reason for keeping them in the first place.
 */
const NEWS_ARCHIVE_KEY = "crypto_chart_news_archive";
const NEWS_ARCHIVE_MAX = 400;
// A month. Past that the network archive has caught up and can be asked.
const NEWS_ARCHIVE_MAX_AGE = 2592000000;
const NEWS_ARCHIVE_PERSIST_DELAY = 1000;

let newsArchive = []; // newest first
let newsArchivePersistTimer = null;

const persistNewsArchive = () => {
  clearTimeout(newsArchivePersistTimer);
  newsArchivePersistTimer = setTimeout(() => {
    try {
      localStorage.setItem(NEWS_ARCHIVE_KEY, JSON.stringify(newsArchive));
    } catch (error) {
      // Storage full or unavailable — the archive simply stays in memory
    }
  }, NEWS_ARCHIVE_PERSIST_DELAY);
};

/* Merge a fetch into the store.
 *
 * Undated and long-past items are dropped **before** the merge, not after, and
 * that is the load-bearing part: `mergeNewsItems` fills up to its cap and
 * returns, so a batch of items that will be discarded a line later would take
 * four hundred slots and push the existing archive out on the way. An item
 * with no time cannot be placed in any window anyway, which is the only
 * question this store is ever asked. */
const archiveNewsItems = (items) => {
  if (!Array.isArray(items) || !items.length) return;
  const cutoff = Date.now() - NEWS_ARCHIVE_MAX_AGE;
  const dated = items.filter(
    (i) => i && typeof i.time === "number" && isFinite(i.time) && i.time >= cutoff,
  );
  if (!dated.length) return;
  const merged = mergeNewsItems(
    NEWS_ARCHIVE_MAX,
    dated.map(({ summary, ...rest }) => rest),
    newsArchive,
  );
  merged.sort((a, b) => (b.time || 0) - (a.time || 0));
  newsArchive = merged.filter((i) => i.time >= cutoff);
  persistNewsArchive();
};

/* What the store holds for one window. The caller merges this with whatever
 * the live feed has; `mergeNewsItems` drops what both carried. */
const newsArchiveAround = (fromMs, toMs) => {
  const from = Math.min(fromMs, toMs);
  const to = Math.max(fromMs, toMs);
  if (!isFinite(from) || !isFinite(to)) return [];
  return newsArchive.filter((i) => i.time >= from && i.time <= to);
};

const hydrateNewsArchive = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(NEWS_ARCHIVE_KEY));
    if (!Array.isArray(saved)) return;
    const cutoff = Date.now() - NEWS_ARCHIVE_MAX_AGE;
    // Through the sanitizer, like every other stored shape: this is untrusted
    // input and each `url` becomes an `href`
    newsArchive = sanitizeNewsItems(saved, NEWS_ARCHIVE_MAX)
      .filter((i) => typeof i.time === "number" && i.time >= cutoff)
      .sort((a, b) => (b.time || 0) - (a.time || 0));
  } catch (error) {
    newsArchive = [];
  }
};

hydrateNewsArchive();

/* ── The opt-in newsrooms ─────────────────────────────────────────────────
 *
 * Two wire formats and no third: RSS/Atom, and WordPress's REST posts. Both
 * are read into the same `{ source, title, time, url }` shape every other
 * feed in this file produces, so nothing downstream — the ticker, the panel,
 * `newsForCoins`, the move card — has to know where a story came from.
 *
 * **Parsed with `DOMParser` as XML, never assigned to `innerHTML`.**
 * `parseFromString(text, "application/xml")` builds a detached document that
 * executes nothing, and `textContent` unwraps CDATA for free — which matters,
 * because Cointelegraph wraps its links in it and BBC wraps its titles.
 */
const feedText = (node, tag) => {
  const el = node.querySelector(tag);
  return el ? (el.textContent || "").trim() : "";
};

/* The byline. `getElementsByTagName` rather than `querySelector`, because the
 * name is `dc:creator` — a CSS type selector cannot address a prefixed name in
 * an XML document, and `querySelector("dc\\:creator")` is not the escape it
 * looks like. Atom's `<author><name>` gives the name through `textContent`. */
const feedAuthor = (node) => {
  const dc = node.getElementsByTagName("dc:creator")[0];
  if (dc) return (dc.textContent || "").trim();
  const author = node.getElementsByTagName("author")[0];
  return author ? (author.textContent || "").trim() : "";
};

/* The summary a feed already carries, cleaned up.
 *
 * Free detail: `description` in RSS and `excerpt.rendered` in WordPress arrive
 * in bytes the panel was downloading and throwing away. Tags are stripped with
 * a regex over the text rather than by assigning to `innerHTML` — the
 * invariants forbid that, and this is untrusted text from someone else's
 * server. Entities go through `decodeEntities` for the same reason the titles
 * do.
 *
 * Clamped at 220 characters: two lines on the row, which is a summary. More is
 * an article, and the panel is a list. */
const NEWS_SUMMARY_MAX = 220;

const cleanFeedSummary = (raw) => {
  if (typeof raw !== "string" || !raw) return "";
  const text = decodeEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= NEWS_SUMMARY_MAX) return text;
  // Cut on a word so the ellipsis does not land mid-word
  const cut = text.slice(0, NEWS_SUMMARY_MAX);
  const space = cut.lastIndexOf(" ");
  return (space > NEWS_SUMMARY_MAX * 0.6 ? cut.slice(0, space) : cut) + "…";
};

/* Every `<category>` on an item, lower-cased. Read by `isPromoNews` only.
 * `getElementsByTagName` rather than `querySelectorAll` for the same reason
 * `feedAuthor` uses it: consistency with the one prefixed name in this file,
 * and it returns every match rather than the first. */
const feedCategories = (node) =>
  Array.from(node.getElementsByTagName("category"))
    .map((el) => (el.textContent || "").trim())
    .filter(Boolean);

/* Is this an advertisement rather than a story?
 *
 * One predicate, asked by every path that can put a headline on screen — the
 * panel, the ticker and the move card's archive — so the three cannot disagree
 * about what counts as an ad. `newsMentionsCoin` is shared for exactly the
 * same reason.
 *
 * Dropped, never labelled. A "sponsored" badge is still the advertisement on
 * screen, and the requirement is that it does not reach the panel.
 *
 * The three signals and the order they are asked in are explained where they
 * are defined, on `NEWS_PROMO_PATH_RE` in `config.js`. Short version: the
 * outlet's own filing is worth more than our reading of its wording, so the
 * wording rule goes last and is the only one that can be wrong.
 */
const isPromoNews = (item) => {
  if (!item || typeof item.title !== "string") return true;
  if (NEWS_SPAM_RE.test(item.title)) return true;
  if (typeof item.url === "string" && NEWS_PROMO_PATH_RE.test(item.url)) {
    return true;
  }
  /* Stripped to letters before comparing, so "Chainwire", "chainwire" and
   * "CS Press Release" are one pattern rather than three. */
  const by =
    typeof item.author === "string" ? item.author.replace(/[^a-z]/gi, "") : "";
  if (by && NEWS_WIRE_RE.test(by)) return true;
  /* The outlet's own category, and the disclosure the piece opens with. Both
   * are stronger than the wording rule below them and neither existed until
   * the summary was read onto the row — see `NEWS_PROMO_CATEGORY_RE`. */
  if (
    Array.isArray(item.categories) &&
    item.categories.some((c) => NEWS_PROMO_CATEGORY_RE.test(String(c).trim()))
  ) {
    return true;
  }
  return (
    typeof item.summary === "string" && NEWS_PROMO_LEAD_RE.test(item.summary)
  );
};

const parseRssFeed = (text, source) => {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  // A parse failure is a document containing <parsererror>, not an exception
  if (doc.querySelector("parsererror")) return [];
  const nodes = doc.querySelectorAll("item, entry");
  const out = [];
  for (const node of nodes) {
    const title = feedText(node, "title");
    if (!title) continue;
    // Atom keeps the url in an attribute; RSS in the element's text
    let url = feedText(node, "link");
    if (!url) {
      const link = node.querySelector("link[href]");
      url = link ? link.getAttribute("href") : "";
    }
    const when =
      feedText(node, "pubDate") ||
      feedText(node, "published") ||
      feedText(node, "updated");
    const ms = when ? Date.parse(when) : NaN;
    out.push({
      source,
      title: title.slice(0, 140),
      time: isFinite(ms) ? ms : null,
      tags: "",
      url: /^https:\/\//.test(url) ? url : null,
      summary: cleanFeedSummary(
        feedText(node, "description") ||
          feedText(node, "summary") ||
          feedText(node, "content"),
      ),
      // Read for `isPromoNews` only, and dropped by `sanitizeNewsItems`
      // before anything stores or renders the item
      author: feedAuthor(node),
      categories: feedCategories(node),
    });
  }
  return out;
};

const parseWpFeed = (json, source) =>
  (Array.isArray(json) ? json : []).map((post) => {
    const title =
      post && post.title && typeof post.title.rendered === "string"
        ? decodeEntities(post.title.rendered)
        : "";
    // `date_gmt` has no zone marker, so it needs one or engines disagree
    const ms = post && post.date_gmt ? Date.parse(post.date_gmt + "Z") : NaN;
    return {
      source,
      title: title.slice(0, 140),
      time: isFinite(ms) ? ms : null,
      tags: "",
      summary: cleanFeedSummary(
        post && post.excerpt && typeof post.excerpt.rendered === "string"
          ? post.excerpt.rendered
          : "",
      ),
      url:
        post && typeof post.link === "string" && /^https:\/\//.test(post.link)
          ? post.link
          : null,
    };
  });

/* One source, fetched and normalised. Never throws: a newsroom being down is
 * an ordinary Tuesday, and the panel's job is to say which ones answered. */
/* THE TONE OF A HEADLINE — words counted, never an event judged.
 *
 * Asked for as "iyi haber / kötü haber, AI kullanmadan, algoritmik". What is
 * honest at that budget is a lexicon: a list of words the beat uses for
 * things going up and things going wrong, counted in the headline and the
 * summary, with the three-word negation rule Loughran and McDonald use for
 * financial text (a negator within three tokens before a word flips it —
 * VADER's window is the same three). Lexicon methods plateau around 65–70%
 * agreement with people on financial headlines, so the row says **worded
 * up** or **worded down** — the words are the fact — and lists the words it
 * counted in the tooltip, so the reader can disagree with a count rather
 * than with a verdict. It never says good news, bad news, or what a price
 * will do; "Miners' revenue falls" is worded down whether or not that is
 * good for anyone.
 *
 * Two-word phrases are matched before single words, because "record low"
 * and "all-time high" carry the opposite of their second word. The lists
 * are the beat's own vocabulary — hacks, exploits, lawsuits, delistings and
 * liquidations on one side; inflows, approvals, listings, rallies and
 * all-time highs on the other — rather than a general-English list, for the
 * reason the Loughran–McDonald lexicon exists at all: "liability" is not
 * bad news in a filing and "record" is not good news in "record outflows". */
const NEWS_TONE_PHRASES_UP = [
  "all-time high", "all time high", "record high", "record inflow", "record inflows",
  "breaks above", "broke above", "break above", "new high", "green light",
];
const NEWS_TONE_PHRASES_DOWN = [
  "all-time low", "all time low", "record low", "record outflow", "record outflows",
  "falls below", "fell below", "drops below", "sell-off", "rug pull", "shuts down",
  "shut down", "goes offline", "cease and desist",
];
const NEWS_TONE_UP = [
  "surge", "surges", "surged", "surging", "soar", "soars", "soared", "soaring",
  "rally", "rallies", "rallied", "rallying", "ath", "inflow", "inflows",
  "approval", "approves", "approved", "adoption", "adopts", "adopted",
  "launch", "launches", "launched", "partnership", "partners", "gain", "gains",
  "gained", "jump", "jumps", "jumped", "climb", "climbs", "climbed", "breakout",
  "bullish", "upgrade", "upgrades", "upgraded", "recover", "recovers",
  "recovered", "recovery", "rebound", "rebounds", "rebounded", "buys", "bought",
  "accumulates", "accumulated", "milestone", "profit", "profits", "profitable",
  "growth", "grows", "expands", "expansion", "listing", "listed", "lists",
  "wins", "won", "victory", "integrates", "integration", "raises", "raised",
  "backed", "backs", "outperforms", "outperformed", "surpasses", "surpassed",
  "tops", "topped", "peak", "peaks", "boom", "booms", "optimism", "optimistic",
];
const NEWS_TONE_DOWN = [
  "hack", "hacks", "hacked", "hacker", "hackers", "exploit", "exploits",
  "exploited", "drain", "drains", "drained", "stolen", "steals", "theft",
  "scam", "scams", "scammer", "lawsuit", "lawsuits", "sues", "sued", "charges",
  "charged", "fraud", "fraudulent", "ban", "bans", "banned", "outage",
  "outages", "halt", "halts", "halted", "plunge", "plunges", "plunged",
  "crash", "crashes", "crashed", "fall", "falls", "fell", "falling", "drop",
  "drops", "dropped", "slump", "slumps", "slumped", "tumble", "tumbles",
  "tumbled", "liquidation", "liquidations", "liquidated", "bearish",
  "delist", "delists", "delisted", "delisting", "sanction", "sanctions",
  "sanctioned", "fine", "fined", "fines", "warning", "warns", "warned",
  "bankrupt", "bankruptcy", "insolvent", "insolvency", "collapse",
  "collapses", "collapsed", "loss", "losses", "decline", "declines",
  "declined", "dump", "dumps", "dumped", "downgrade", "downgrades",
  "downgraded", "breach", "breached", "vulnerability", "arrest", "arrested",
  "indicted", "indictment", "layoffs", "shutdown", "freeze", "freezes",
  "frozen", "probe", "investigation", "penalty", "delay", "delays",
  "delayed", "rejects", "rejected", "denies", "denied", "fears", "fear",
  "panic", "slides", "slid", "sinks", "sank", "wipes", "wiped", "risk",
  "risks", "risky", "attack", "attacks", "attacked",
];
const NEWS_TONE_NEGATORS = ["not", "no", "never", "without", "isn't", "aren't", "wasn't", "won't", "cannot", "can't", "didn't", "doesn't", "hasn't", "haven't", "nor"];

const newsTone = (item) => {
  const text = `${(item && item.title) || ""} ${(item && item.summary) || ""}`
    .toLowerCase()
    .replace(/[’‘]/g, "'");
  const up = [];
  const down = [];
  /* Phrases first, then blanked out so their words are not counted again —
     "record low" must not also score "record". */
  let rest = text;
  const takePhrases = (list, into) => {
    for (const phrase of list) {
      let at = rest.indexOf(phrase);
      while (at !== -1) {
        into.push(phrase);
        rest = rest.slice(0, at) + " ".repeat(phrase.length) + rest.slice(at + phrase.length);
        at = rest.indexOf(phrase);
      }
    }
  };
  takePhrases(NEWS_TONE_PHRASES_DOWN, down);
  takePhrases(NEWS_TONE_PHRASES_UP, up);
  const tokens = rest.split(/[^a-z0-9'-]+/).filter(Boolean);
  const upSet = new Set(NEWS_TONE_UP);
  const downSet = new Set(NEWS_TONE_DOWN);
  const negated = (i) => {
    for (let k = Math.max(0, i - 3); k < i; k += 1) {
      if (NEWS_TONE_NEGATORS.includes(tokens[k])) return true;
    }
    return false;
  };
  tokens.forEach((token, i) => {
    const bare = token.replace(/'s$/, "");
    if (upSet.has(bare)) (negated(i) ? down : up).push(negated(i) ? `not ${bare}` : bare);
    else if (downSet.has(bare)) (negated(i) ? up : down).push(negated(i) ? `not ${bare}` : bare);
  });
  const score = up.length - down.length;
  return {
    score,
    up,
    down,
    /* "up" / "down" / "mixed" / null — mixed is both sides counted and level,
       which is a real reading ("rally halts") and not the absence of one. */
    tone: score > 0 ? "up" : score < 0 ? "down" : up.length && down.length ? "mixed" : null,
  };
};

/* POLITENESS TO A HOST THAT SAID NO.
 *
 * Every request this extension makes leaves the reader's own browser with the
 * reader's own IP — there is no proxy and no server of ours, on purpose: a
 * proxy would route every user through one address (the one address that
 * *would* get blocked) and break the promise that nothing leaves the device
 * but the request itself. So a rate limit is the reader's alone, and the
 * right answer to a 429 (or a 403 from a WAF that has decided a page is a
 * bot) is to stop asking for a while rather than to keep knocking: public
 * endpoints at Coinbase, OKX and the newsrooms all throttle by IP, and the
 * documented cure is exponential backoff.
 *
 * Per host, in memory: fifteen minutes on the first refusal, doubling to two
 * hours, cleared by the first answer. `fetchNewsSource` reads it before
 * asking and answers null — "did not ask" — so the panel's chip can say the
 * host asked to be left alone rather than "none". Scoped to the news feeds,
 * which are the requests with no cache TTL of their own to pace them; the
 * price providers already fail over and back off (`noteProviderFailure`). */
const HOST_COOLDOWN_BASE_MS = 15 * 60 * 1000;
const HOST_COOLDOWN_MAX_MS = 2 * 60 * 60 * 1000;
const hostCooldowns = new Map();
// A regex rather than `new URL`: the unit suites run this file in a bare vm
// context that has no URL constructor, and a host is the part before the path
const hostOf = (url) => {
  const m = /^https?:\/\/([^/?#]+)/i.exec(String(url || ""));
  return m ? m[1].toLowerCase() : "";
};
const hostCooling = (url, now = Date.now()) => {
  const c = hostCooldowns.get(hostOf(url));
  return c && c.until > now ? c.until - now : 0;
};
const noteHostRefused = (url, status, now = Date.now()) => {
  if (status !== 429 && status !== 403) return 0;
  const host = hostOf(url);
  if (!host) return 0;
  const prior = hostCooldowns.get(host);
  const strikes = (prior ? prior.strikes : 0) + 1;
  const wait = Math.min(HOST_COOLDOWN_MAX_MS, HOST_COOLDOWN_BASE_MS * 2 ** (strikes - 1));
  hostCooldowns.set(host, { until: now + wait, strikes });
  return wait;
};
const noteHostAnswered = (url) => hostCooldowns.delete(hostOf(url));
// { host: msUntil } for whoever wants to say so on screen
const hostCooldownsNow = (now = Date.now()) => {
  const out = {};
  for (const [host, c] of hostCooldowns) if (c.until > now) out[host] = c.until - now;
  return out;
};

/* The one door a widget's request goes through.
 *
 * `fetch`, with the cool-down read before and written after: a host that is
 * cooling is not asked at all (the call rejects with `cooling` set, which the
 * widget's own catch turns into its "could not load" state, and the card can
 * say *paused* instead), a 429 or 403 starts or doubles the host's wait, and
 * any other answer clears it. Every widget card and the news feeds use it;
 * the price providers keep `fetchWithRetry` — they fail over between two
 * exchanges and back off on their own — and the derivatives page's five-second
 * quote keeps its own path, because a fill refused for a stale quote is
 * already the honest answer there and a fifteen-minute silence would not be. */
const politeFetch = async (url, options) => {
  const wait = hostCooling(url);
  if (wait) {
    const err = new Error(`${hostOf(url)} is cooling for ${Math.ceil(wait / 60000)} min`);
    err.cooling = wait;
    throw err;
  }
  const res = await fetch(url, options);
  if (res.status === 429 || res.status === 403) noteHostRefused(url, res.status);
  else noteHostAnswered(url);
  return res;
};

/* An exchange notice is news about a coin only when it is one of these:
   a delisting, or a network event that changes what a holder can do. */
const BYBIT_NOTICE_RE = /network upgrade|hard fork|mainnet|migration|token swap|rebrand|redenomination|deposit|withdrawal|suspen|delist|discontinu/i;
const BYBIT_NOTICE_SKIP_RE = /risk limit|loan|lending|collateral|leverage|margin|copy trading|tradfi|stock|mt5|reward|prize|campaign|airdrop|splash|earn|bonus|coupon/i;

/* Bybit's announcements, reduced to what `BYBIT_NOTICE_RE` calls news:
   every delisting, and the maintenance notices about a network event. The
   listings, campaigns and exchange news are never kept — see NEWS_SOURCES. */
const parseBybitNotices = (json, name) =>
  (json && json.result && Array.isArray(json.result.list) ? json.result.list : [])
    .filter((a) => {
      if (!a || !a.type || typeof a.title !== "string") return false;
      if (BYBIT_NOTICE_SKIP_RE.test(a.title)) return false;
      if (a.type.key === "delistings") return true;
      return a.type.key === "maintenance_updates" && BYBIT_NOTICE_RE.test(a.title);
    })
    .map((a) => ({
      source: name,
      title: a.title.trim(),
      url: typeof a.url === "string" ? a.url : "",
      time: Number(a.publishTime) || Number(a.dateTimestamp) || null,
      summary: typeof a.description === "string" && a.description.trim() !== a.title.trim() ? a.description : "",
    }));

/* **How long one source may take** (30 Sep 2026). There was no limit, and
 * the feed is `Promise.all` over every source behind a one-at-a-time latch
 * (`_newsFetching`, app-news.js): one host that accepted the connection and
 * never answered held the whole fetch open, the latch with it, and every
 * later poll only noted that it should run again — so the tab's news froze
 * where it was and the panel said "Fetching headlines…" for as long as the
 * tab lived. Aborted at this, a slow source is a source that did not answer
 * (null), which the panel already knows how to say. */
const NEWS_SOURCE_TIMEOUT_MS = 15000;

const fetchNewsSource = async (source) => {
  const abort = typeof AbortController === "function" ? new AbortController() : null;
  const timer = abort ? setTimeout(() => abort.abort(), NEWS_SOURCE_TIMEOUT_MS) : null;
  const options = abort ? { signal: abort.signal } : undefined;
  try {
    if (source.kind === "hn") return await fetchHackerNewsStories(options);
    /* Two asks: delistings come about weekly, so a mixed page of the latest
       notices usually carries none. */
    if (source.kind === "bybit") {
      const ask = async (type, limit) => {
        const res = await politeFetch(`${source.url}&type=${type}&limit=${limit}`, options);
        if (!res.ok) throw new Error(`${source.id} answered ${res.status}`);
        return parseBybitNotices(await res.json(), source.name);
      };
      const lists = await Promise.all([ask("delistings", 15), ask("maintenance_updates", 30)]);
      return sanitizeNewsItems(lists.flat().filter((item) => !isPromoNews(item)));
    }
    // A host that asked to be left alone is left alone — see politeFetch
    const res = await politeFetch(source.url, options);
    if (!res.ok) throw new Error(`${source.id} answered ${res.status}`);
    const items =
      source.kind === "wp"
        ? parseWpFeed(await res.json(), source.name)
        : parseRssFeed(await res.text(), source.name);
    /* A general newsroom has to name the subject to be here at all — most of
     * what BBC Business publishes is not about this beat, and an unfiltered
     * business feed in a crypto news panel reads as a bug. */
    const onBeat = source.cryptoOnly
      ? items.filter((i) => CRYPTO_TERMS_RE.test(i.title))
      : items;
    /* Advertising is refused here, before the sanitizer, because this is the
     * last point at which the byline still exists — `sanitizeNewsItems`
     * rebuilds each item field by field and does not carry `author` through. */
    const kept = onBeat.filter((item) => !isPromoNews(item));
    return sanitizeNewsItems(kept);
  } catch (error) {
    return null; // null is "did not answer", which is not the same as "empty"
  } finally {
    clearTimeout(timer);
  }
};

/* THE SAME STORY, TOLD BY FOUR NEWSROOMS, IS ONE ROW.
 *
 * `mergeNewsItems` already drops exact repeats — it keys on the first 60
 * characters of the normalised title, which catches syndication, where one
 * outlet runs another's headline verbatim. What it cannot catch is the same
 * event *written up separately*, and that is the common case. Measured on six
 * realistic headlines from one afternoon: six in, five out, and four of those
 * five were one ETF story. On a panel you scan fifteen rows of, a single event
 * takes a quarter of the screen and the variety collapses.
 *
 * **How two headlines are judged the same story**, and every part of it was
 * arrived at by measuring a first version that failed:
 *
 *   1. Content words only, singularised, with a number and its unit glued
 *      together — "$1.2 billion" is one fact, and leaving it as two tokens was
 *      why the clearest duplicate in the sample scored lowest of all.
 *   2. Each shared word weighted by how **rare** it is in this feed. "bitcoin"
 *      is in half the rows and separates nothing; "$1.2b" separates a lot.
 *      Unweighted, "Bitcoin ETF inflows" and "Bitcoin miners sell" looked as
 *      similar as two write-ups of one story.
 *   3. At least two shared words, which is what stops short headlines pairing
 *      off on a single one — "Fed holds rates steady" and "Fed signals rate
 *      cut" are not the same story.
 *   4. Published within `NEWS_CLUSTER_WINDOW_MS` of each other. The same words
 *      months apart are a different event.
 *
 *   5. Two shared words are not enough when the shorter headline only has
 *      four. `Fed holds rates steady` and `Fed signals rate cut in December`
 *      share "fed" and "rate" — half of one of them — and are opposite
 *      stories. Under six content words the floor rises to
 *      `NEWS_CLUSTER_SHORT_SHARED`.
 *   6. The shorter headline's weight is not allowed below a fraction of the
 *      feed's own median. Dividing by the *smaller* of the two is what lets a
 *      short write-up of a long story still count as the same story, and it
 *      also means a headline with almost no content in it scores high against
 *      anything it happens to touch. Measured over 116 live headlines, the
 *      worst false pair in the whole feed was `Here's what happened in crypto
 *      today` — a daily round-up, and the lowest-weight headline present at
 *      16.5 against a median of 33 — scoring 0.405 against a story about
 *      options expiry it has nothing to do with. **A fraction of the median,
 *      not a fixed number**: the weights are `log(1 + n/df)`, so their scale
 *      moves with the size of the feed, and an absolute floor that is right
 *      for a hundred headlines silently disables clustering in a feed of ten.
 *
 * **Where the numbers come from.** 116 real headlines from five newsrooms in
 * one poll (28 Aug 2026) give 22 candidate pairs, labelled by hand: 11 the
 * same event told twice, 11 not. The two groups **overlap** — the hardest true
 * pair (two write-ups of one Ledger advisory, sharing almost no wording)
 * scores 0.291, below four of the false ones — so nothing separates them
 * cleanly, and a rule that claimed to would be fitted to one afternoon's news.
 * What is used merges **8 of the 11 true pairs and none of the 11 false ones**
 * there, and on the small hand-built fixture in `tests/test-api.js` it folds
 * the four write-ups of one story and leaves the two Fed stories apart.
 *
 * **Both samples had to be clean, and that is the point.** Every rule here was
 * checked against both, because each one caught something the other could not:
 * the live feed found the round-up that a fixed threshold could not survive,
 * and the seven-item fixture found that an *absolute* weight floor stops
 * working entirely in a small feed — it merged nothing at all — and then that
 * two shared words out of four is not evidence. Tuning against either alone
 * produced a rule that failed on the other.
 *
 * **The threshold is not the best-scoring one.** 0.36 merges 10 of the 11 with
 * nothing false, and sits 0.028 above the worst false pair — close enough that
 * a different day's news is likely to put something across it, and what lands
 * across it is a story taken off the panel. 0.38 keeps 0.048 of daylight and
 * still catches nearly three times what a first version at 0.55 was catching.
 * The failures are not equal: merging two different stories hides one of them,
 * while failing to merge two versions of one leaves exactly what was on screen
 * before any of this existed. It errs the way the advertising filter errs, for
 * the same reason.
 *
 * Nothing is discarded. The others ride along on `also`, so the row can say
 * how many newsrooms ran it — which is a fact worth having, since four outlets
 * covering something is the story being big.
 */
const NEWS_CLUSTER_MIN_SCORE = 0.38;
const NEWS_CLUSTER_MIN_SHARED = 2;
const NEWS_CLUSTER_SHORT_WORDS = 6;
const NEWS_CLUSTER_SHORT_SHARED = 3;
const NEWS_CLUSTER_MIN_MASS_RATIO = 0.7;
const NEWS_CLUSTER_WINDOW_MS = 36 * 60 * 60 * 1000;

const NEWS_STOP_WORDS = new Set(
  ("a an the of to in on for at by with from as is are was were be been and or " +
    "but not no its it this that these those after amid over under into out up " +
    "down new say said report could would will may might than more most about " +
    "hit hits").split(" "),
);

const newsWords = (title) => {
  const words = String(title || "")
    .toLowerCase()
    .replace(/([0-9.]+)\s*(billion|bn)\b/g, "$1b")
    .replace(/([0-9.]+)\s*million\b/g, "$1m")
    .replace(/[^a-z0-9$%. ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NEWS_STOP_WORDS.has(w))
    .map((w) => {
      const t = w.replace(/\.$/, "");
      // Crude singular, and crude is enough: it only has to make "inflow" and
      // "inflows" the same token, not to be a stemmer.
      return t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
    });
  return new Set(words);
};

const clusterNewsItems = (items) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length < 2) return list;

  const words = list.map((i) => newsWords(i && i.title));
  /* How many rows each word appears in — the whole feed is the corpus, which
   * is the right one: a word is uninformative here if it is common *here*. */
  const df = new Map();
  for (const set of words) for (const w of set) df.set(w, (df.get(w) || 0) + 1);
  const n = list.length;
  const weight = (w) => Math.log(1 + n / (1 + (df.get(w) || 0)));
  const mass = (set) => {
    let sum = 0;
    for (const w of set) sum += weight(w);
    return sum;
  };
  const masses = words.map(mass);
  /* The feed's own middle, so the floor below travels with the corpus instead
   * of being a number that only suits a feed of a hundred — see rule 6. */
  const ranked = masses.slice().sort((a, b) => a - b);
  const floorMass =
    NEWS_CLUSTER_MIN_MASS_RATIO * (ranked[Math.floor(ranked.length / 2)] || 0);

  const taken = new Array(list.length).fill(false);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (taken[i]) continue;
    taken[i] = true;
    const head = list[i];
    const also = [];
    for (let j = i + 1; j < list.length; j++) {
      if (taken[j]) continue;
      if (
        head.time &&
        list[j].time &&
        Math.abs(head.time - list[j].time) > NEWS_CLUSTER_WINDOW_MS
      ) {
        continue;
      }
      let shared = 0;
      let sum = 0;
      for (const w of words[i]) {
        if (words[j].has(w)) {
          shared++;
          sum += weight(w);
        }
      }
      /* How much agreement this pair has to show, which depends on how much
       * there was to agree about — see rule 5. */
      const shortest = Math.min(words[i].size, words[j].size);
      const need =
        shortest < NEWS_CLUSTER_SHORT_WORDS
          ? NEWS_CLUSTER_SHORT_SHARED
          : NEWS_CLUSTER_MIN_SHARED;
      if (shared < need) continue;
      /* The smaller of the two, but never below the feed's floor — rule 6. */
      const floor = Math.max(Math.min(masses[i], masses[j]), floorMass);
      if (!(floor > 0) || sum / floor < NEWS_CLUSTER_MIN_SCORE) continue;
      taken[j] = true;
      also.push({ source: list[j].source, title: list[j].title, url: list[j].url });
    }
    out.push(also.length ? { ...head, also } : head);
  }
  return out;
};

/* **The feed the panel is given: a hundred and fifty, and every source in
 * it** (30 Sep 2026). It was the newest fifty across every source — at eight
 * to thirteen sources of twenty-odd items each, about a day — so a desk that
 * publishes a few crypto stories a day fell off the end, and the panel then
 * said it had "none" when it had answered with a feed full. Each source keeps
 * its newest `NEWS_PER_SOURCE_MIN` whatever their age, and the rest are the
 * newest overall up to the cap. The headline row still takes the newest
 * `MAX_NEWS_ITEMS` (`filteredNews`, app-news.js): it draws every item twice
 * for its loop, and a longer loop is not a better one. Here rather than in
 * config.js because the cache it bounds is read back in this file. */
const NEWS_FEED_MAX = 150;
const NEWS_PER_SOURCE_MIN = 5;

const balanceNewsItems = (items, max = NEWS_FEED_MAX, perSource = NEWS_PER_SOURCE_MIN) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= max) return list;
  const keep = new Set();
  const counts = new Map();
  // Newest first on the way in, so the first of each source are its newest
  for (const item of list) {
    const n = counts.get(item.source) || 0;
    if (n < perSource) {
      keep.add(item);
      counts.set(item.source, n + 1);
    }
  }
  for (const item of list) {
    if (keep.size >= max) break;
    keep.add(item);
  }
  return list.filter((item) => keep.has(item)).slice(0, Math.max(max, counts.size * perSource));
};

const mergeNewsItems = (...lists) => {
  /* **An optional cap, as a leading number.** Every caller but one wants the
   * feed's own `MAX_NEWS_ITEMS`; the rolling archive wants four hundred, and
   * giving it a second function would be two copies of the de-duplication
   * rule. Read off the first argument's *type* rather than a trailing
   * parameter, so nothing already written changes meaning. */
  const limit = typeof lists[0] === "number" ? lists.shift() : MAX_NEWS_ITEMS;
  const seen = new Set();
  const items = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      /* Asked again here even though `fetchNewsSource` already refused it.
       * This is the path a cache written by an older build comes back through,
       * and localStorage is untrusted input like every other stored shape. */
      if (!item || !item.title || isPromoNews(item)) continue;
      const key = item.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .slice(0, 60);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
      if (items.length >= limit) return items;
    }
  }
  return items;
};

/* BULK COIN SNAPSHOTS (Coinlore) ─────────────────────────────────────────
 * One request covers the whole sweep: Coinlore's tickers endpoint returns
 * price + 24h change for the top 100 coins by market cap, so the page
 * ticker / watchlist / top movers don't need 2 Coinbase requests per coin.
 * Non-USD display currencies convert via one Coinbase exchange-rates
 * request. Coins missing from the top 100 (and everything when Coinlore is
 * down) fall back to the per-coin Coinbase path in refreshPageTickerCoin().
 */
const COINLORE_TICKERS_API =
  "https://api.coinlore.com/api/tickers/?start=0&limit=100";
const EXCHANGE_RATES_API =
  "https://www.coinbase.com/api/v2/exchange-rates?currency=USD";

const fetchUsdRate = async (currency) => {
  if (currency === "USD") return 1;
  const res = await fetch(EXCHANGE_RATES_API);
  if (!res.ok) return null;
  const json = await res.json();
  const rate =
    json && json.data && json.data.rates
      ? parseFloat(json.data.rates[currency])
      : NaN;
  return isFinite(rate) && rate > 0 ? rate : null;
};

// Fills pageTickerCache for every wanted coin Coinlore knows about.
// Returns true when the cache is usable afterwards, so callers re-render —
// which includes the case where it was already fresh and nothing was fetched.
const bulkRefreshPageTickerCache = async (coins, currency) => {
  // A sweep inside the TTL is still the answer; re-running it would buy a
  // snapshot the cache already holds. This is what makes persisting the
  // cache worth anything: without it every tab swept again regardless.
  const lastSweep = bulkSweepAt.get(currency);
  if (lastSweep && Date.now() - lastSweep < PAGE_TICKER_TTL) return true;

  /* The TTL guard above is only set once the response has landed, so two
   * consumers starting together — the page ticker's own refresh and opening
   * the portfolio, say — both saw no sweep and both sent the largest request
   * the extension makes. They share one now, per currency. */
  const shared = bulkSweepInFlight.get(currency);
  if (shared) return shared;
  const run = (async () => {
  try {
    /* Worth one retry, unlike most background calls. This request is the
     * cheap path — one snapshot covers every coin — and its fallback is the
     * per-coin one, which is about 130 requests for the same information. A
     * free endpoint dropping a connection (ERR_CONNECTION_CLOSED) is exactly
     * the transient `fetchWithRetry` exists for, and waiting a second
     * beats paying two orders of magnitude more requests. Capped at one retry
     * so a sweep can't stall behind a long backoff.
     */
    const [tickersRes, rate] = await Promise.all([
      fetchWithRetry(COINLORE_TICKERS_API, {}, 1),
      fetchUsdRate(currency),
    ]);
    if (!tickersRes.ok || rate === null) return false;
    const json = await tickersRes.json();
    const list = json && Array.isArray(json.data) ? json.data : null;
    if (!list) return false;

    /* Every symbol in the response is cached, not just the ones this caller
     * asked for. The response is the same top-100 snapshot whoever asks, so
     * filtering it by the caller's list would make the cache's contents
     * depend on who happened to sweep first — and the TTL guard above would
     * then let a sweep for three alert coins satisfy the page ticker's
     * request for sixty-five, sending the rest down the per-coin path. The
     * extra entries cost nothing: nobody reads a key they didn't ask for. */
    const wanted = new Set(coins);
    const seen = new Set();
    const now = Date.now();
    let filled = 0;
    for (const ticker of list) {
      const symbol =
        typeof ticker.symbol === "string" ? ticker.symbol.toUpperCase() : null;
      // List is rank-ordered → on duplicate symbols the biggest market cap wins
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);

      const usd = parseFloat(ticker.price_usd);
      if (!isFinite(usd) || usd <= 0) continue;

      const change = parseFloat(ticker.percent_change_24h);
      const hasChange = isFinite(change);
      // Market cap and volume ride along in the same response — keeping
      // them costs nothing and saves the stats row its own request
      const cap = parseFloat(ticker.market_cap_usd);
      const vol = parseFloat(ticker.volume24);
      pageTickerCache.set(`${symbol}-${currency}`, {
        price: usd * rate,
        change: hasChange ? change : null,
        up: hasChange ? change >= 0 : null,
        marketCap: isFinite(cap) && cap > 0 ? cap * rate : null,
        volume24: isFinite(vol) && vol > 0 ? vol * rate : null,
        timestamp: now,
      });
      if (wanted.has(symbol)) filled++; // the caller only cares about its own
    }
    if (seen.size > 0) {
      bulkSweepAt.set(currency, now);
      persistPageTickerCache();
    }
    return filled > 0;
  } catch (e) {
    return false;
  }
  })();
  bulkSweepInFlight.set(currency, run);
  try {
    return await run;
  } finally {
    bulkSweepInFlight.delete(currency);
  }
};

/* PAGE TICKER COIN SNAPSHOT */
// Fetch one coin's spot price + 24h change and store it in pageTickerCache.
// Skips the network entirely while the cached entry is still fresh.
const refreshPageTickerCoin = async (coin, currency, now) => {
  const key = `${coin}-${currency}`;
  const cached = pageTickerCache.get(key);
  if (cached && now - cached.timestamp < PAGE_TICKER_TTL) return;

  // Non-Coinbase coins would 404 here. The bulk Coinlore sweep normally
  // covers them; this fallback derives the same numbers from their own
  // provider's daily candles rather than leaving a hole in the ticker.
  if (effectiveProvider(coin) === "kraken") {
    try {
      const candles = await fetchKrakenCandles(coin, "day", currency);
      if (!candles || candles.length < 2) return;
      const last = candles[candles.length - 1];
      const first = candles[0];
      const change =
        first.close > 0 ? ((last.close - first.close) / first.close) * 100 : null;
      pageTickerCache.set(key, {
        price: last.close,
        change,
        up: change === null ? null : change >= 0,
        timestamp: Date.now(),
      });
      persistPageTickerCache();
    } catch (error) {
      // Leave the cache alone — the next sweep tries again
    }
    return;
  }

  try {
    // maxRetries = 0: this is the bulk background ticker, so a rate
    // limit (429) should fail quietly and retry on the next sweep —
    // retrying here would only pile more load onto Coinbase.
    const [spotRes, histRes] = await Promise.all([
      fetchWithRetry(`${API_BASE}${coin}-${currency}/${API_SPOT}`, {}, 0).then((r) => r.json()),
      fetchWithRetry(`${API_BASE}${coin}-${currency}/${API_HISTORY}day`, {}, 0).then((r) => r.json()),
    ]);

    const spotStr = spotRes && spotRes.data && spotRes.data.amount;
    if (typeof spotStr !== "string") return;

    const spotPrice = Number(spotStr);
    let change = null;
    let up = null;

    const prices = histRes && histRes.data && histRes.data.prices;
    if (Array.isArray(prices) && prices.length > 0) {
      // Sort ascending by time → [0] is 24h ago
      const sorted = prices.slice().sort((a, b) => a.time - b.time);
      const oldest = Number(sorted[0].price);
      if (oldest !== 0 && !isNaN(oldest)) {
        change = ((spotPrice - oldest) / Math.abs(oldest)) * 100;
        up = change >= 0;
      }
    }

    pageTickerCache.set(key, {
      price: spotPrice,
      change,
      up,
      timestamp: Date.now(),
    });
    persistPageTickerCache();
  } catch (e) {
    // silently skip unavailable coins
  }
};
