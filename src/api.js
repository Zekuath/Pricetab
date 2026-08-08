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

// Separate cache for page ticker (all suggested coins, bypasses the 10-coin limit)
const pageTickerCache = new Map(); // key: "COIN-CURRENCY" → { price, timestamp }
const PAGE_TICKER_TTL = 60000; // 60s TTL per coin (still < refresh, so prices update)
const PAGE_TICKER_BATCH_SIZE = 4; // coins per batch (each does 2 reqs) — keeps bursts gentle
const PAGE_TICKER_BATCH_DELAY = 500; // ms between batches — avoids hammering Coinbase
const PAGE_TICKER_REFRESH_MS = 120000; // full refresh every 2 min (background ticker, no need faster)

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
    const response = await fetch(COINLORE_GLOBAL_API);
    if (!response.ok) throw new Error("Coinlore API error");

    const json = await response.json();
    const g = Array.isArray(json) ? json[0] : null;
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


/* NEWS FEED FETCHER (Blockchair JSON — only CORS-enabled crypto feed) */
const fetchBlockchairNews = async () => {
  const res = await fetch(NEWS_API_URL);
  if (!res.ok) {
    throw new Error("Blockchair news request failed");
  }
  const json = await res.json();
  return (json && Array.isArray(json.data) ? json.data : [])
    .map((article) => ({
      source:
        typeof article.source === "string"
          ? article.source.replace(/^(www|en)\./, "").slice(0, 30)
          : "news",
      title:
        typeof article.title === "string"
          ? article.title.slice(0, 140)
          : "",
      url:
        typeof article.link === "string" &&
        /^https:\/\//.test(article.link)
          ? article.link
          : null,
    }))
    .filter((item) => item.title);
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
    .map(({ source, title, url }) => ({ source, title, url }));
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

const fetchAddressBalance = async (coin, address) => {
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

/* OHLC CANDLES (crosshair readout) ─────────────────────────────────────────
 * Fetched lazily — only once the user actually hovers a chart — so the
 * common "open a tab, glance, close it" path costs nothing extra.
 * Rows arrive as [time, low, high, open, close, volume], newest first.
 */
const CANDLES_API = "https://api.exchange.coinbase.com/products/";
const ohlcCache = new Map(); // "COIN-period-currency" → { data, timestamp }

const fetchOhlcCandles = async (coin, period, currency) => {
  const granularity = OHLC_GRANULARITY[period];
  if (!granularity || !OHLC_CURRENCIES.includes(currency)) return null;
  const key = `${coin}-${period}-${currency}`;
  const hit = ohlcCache.get(key);
  if (hit && Date.now() - hit.timestamp < OHLC_CACHE_TTL) return hit.data;
  try {
    const res = await fetch(
      `${CANDLES_API}${encodeURIComponent(`${coin}-${currency}`)}` +
        `/candles?granularity=${granularity}`,
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
    ohlcCache.set(key, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    return hit ? hit.data : null; // stale beats nothing; null = price-only
  }
};

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

/* Merge news lists in priority order: spam filtered everywhere, duplicate
 * stories collapsed across sources by normalized title (aggregators often
 * carry the same story from several outlets), capped at MAX_NEWS_ITEMS. */
const mergeNewsItems = (...lists) => {
  const seen = new Set();
  const items = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || !item.title || NEWS_SPAM_RE.test(item.title)) continue;
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
// Returns true when at least one coin was filled (callers can re-render).
const bulkRefreshPageTickerCache = async (coins, currency) => {
  try {
    const [tickersRes, rate] = await Promise.all([
      fetch(COINLORE_TICKERS_API),
      fetchUsdRate(currency),
    ]);
    if (!tickersRes.ok || rate === null) return false;
    const json = await tickersRes.json();
    const list = json && Array.isArray(json.data) ? json.data : null;
    if (!list) return false;

    const wanted = new Set(coins);
    const seen = new Set();
    const now = Date.now();
    let filled = 0;
    for (const ticker of list) {
      const symbol =
        typeof ticker.symbol === "string" ? ticker.symbol.toUpperCase() : null;
      // List is rank-ordered → on duplicate symbols the biggest market cap wins
      if (!symbol || !wanted.has(symbol) || seen.has(symbol)) continue;
      seen.add(symbol);

      const usd = parseFloat(ticker.price_usd);
      if (!isFinite(usd) || usd <= 0) continue;

      const change = parseFloat(ticker.percent_change_24h);
      const hasChange = isFinite(change);
      pageTickerCache.set(`${symbol}-${currency}`, {
        price: usd * rate,
        change: hasChange ? change : null,
        up: hasChange ? change >= 0 : null,
        timestamp: now,
      });
      filled++;
    }
    return filled > 0;
  } catch (e) {
    return false;
  }
};

/* PAGE TICKER COIN SNAPSHOT */
// Fetch one coin's spot price + 24h change and store it in pageTickerCache.
// Skips the network entirely while the cached entry is still fresh.
const refreshPageTickerCoin = async (coin, currency, now) => {
  const key = `${coin}-${currency}`;
  const cached = pageTickerCache.get(key);
  if (cached && now - cached.timestamp < PAGE_TICKER_TTL) return;

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
  } catch (e) {
    // silently skip unavailable coins
  }
};
