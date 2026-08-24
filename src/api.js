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

const persistPageTickerCache = () => {
  clearTimeout(tickerCachePersistTimer);
  tickerCachePersistTimer = setTimeout(() => {
    try {
      const now = Date.now();
      const entries = Array.from(pageTickerCache.entries())
        .filter(([, value]) => now - value.timestamp <= PAGE_TICKER_TTL)
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
        now - value.timestamp > PAGE_TICKER_TTL
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
      const response = await fetch(COINLORE_GLOBAL_API);
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
 * Cached like the other three (`CLAUDE.md`, *Caching System*): a window that
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
const fetchHackerNewsStories = async () => {
  const cutoff = Math.floor(Date.now() / 1000) - HN_NEWS_MAX_AGE_S;
  const results = await Promise.allSettled(
    HN_NEWS_TERMS.map(async (term) => {
      const url =
        `${HN_NEWS_API}?query=${encodeURIComponent(term)}&tags=story` +
        `&hitsPerPage=${HN_NEWS_MAX_ITEMS}` +
        `&numericFilters=${encodeURIComponent(
          `points>${HN_NEWS_MIN_POINTS},created_at_i>${cutoff}`,
        )}`;
      const res = await fetch(url);
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
    .map(({ source, title, url, time, tags }) => ({
      source,
      title,
      url,
      time,
      tags,
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
 * at the same moment (`docs/product/TODAY.md` §9.5). A statement about how
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

const dailyClosesCache = new Map(); // COIN → { t, closes: number[] }
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
        .slice(0, DAILY_CLOSES_MAX_COINS);
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
      // Stored is untrusted: a hand-edited file must not be able to put a
      // string or a NaN into a median
      const closes = Array.isArray(value.closes)
        ? value.closes.map(Number).filter((n) => isFinite(n) && n > 0)
        : [];
      if (closes.length > 50) dailyClosesCache.set(coin, { t: value.t, closes });
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
const fetchDailyCloses = async (coin) => {
  const hit = dailyClosesCache.get(coin);
  if (hit && Date.now() - hit.t < DAILY_CLOSES_TTL) return hit.closes;
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
      for (const row of rows) {
        const time = Number(row[0]);
        const close = Number(row[4]);
        if (isFinite(time) && isFinite(close) && close > 0) byTime.set(time, close);
      }
      end = start;
      if (page + 1 < DAILY_CLOSES_MAX_PAGES) await sleep(DAILY_CLOSES_PAGE_GAP);
    }
    const closes = Array.from(byTime.keys())
      .sort((a, b) => a - b)
      .map((t) => byTime.get(t));
    // Under a year of history cannot carry a base rate worth printing
    if (closes.length < 200) return null;
    dailyClosesCache.set(coin, { t: Date.now(), closes });
    persistDailyCloses();
    return closes;
  })().finally(() => dailyClosesInFlight.delete(coin));

  dailyClosesInFlight.set(coin, run);
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
const sanitizeNewsItems = (list) =>
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
        // https only, and nothing else — the same test the fetchers apply
        url:
          typeof item.url === "string" && /^https:\/\//.test(item.url)
            ? item.url
            : null,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_NEWS_ITEMS);

hydrateMoveNewsCache();

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
  return Boolean(by) && NEWS_WIRE_RE.test(by);
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
      // Read for `isPromoNews` only, and dropped by `sanitizeNewsItems`
      // before anything stores or renders the item
      author: feedAuthor(node),
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
      url:
        post && typeof post.link === "string" && /^https:\/\//.test(post.link)
          ? post.link
          : null,
    };
  });

/* One source, fetched and normalised. Never throws: a newsroom being down is
 * an ordinary Tuesday, and the panel's job is to say which ones answered. */
const fetchNewsSource = async (source) => {
  try {
    if (source.kind === "hn") return await fetchHackerNewsStories();
    const res = await fetch(source.url);
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
  }
};

const mergeNewsItems = (...lists) => {
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
      if (items.length >= MAX_NEWS_ITEMS) return items;
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
