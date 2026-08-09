const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

let fetchCalls = [];
let chainFail = false; // simulates the balance providers going down
let krakenError = false; // Kraken reports failures in a 200 response body
const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number,
  parseInt, parseFloat, isFinite, isNaN, setTimeout, clearTimeout, Error, AbortController,
  fetch: async (url, options) => {
    fetchCalls.push(url);
    if (url.includes("/spot")) {
      return { ok: true, status: 200, json: async () => ({ data: { amount: "100", currency: "USD" } }) };
    }
    if (url.includes("historic")) {
      return { ok: true, status: 200, json: async () => ({ data: { prices: [
        { price: "80", time: 1 }, { price: "90", time: 2 },
      ] } }) };
    }
    if (url.includes("ethereum-rpc")) {
      // 1 LINK (18 decimals) and 2.5 USDC (6 decimals)
      return { ok: true, status: 200, json: async () => ([
        { jsonrpc: "2.0", id: 0, result: "0x0de0b6b3a7640000" },
        { jsonrpc: "2.0", id: 1, result: "0x2625a0" },
      ]) };
    }
    if (url.includes("exchange-rates")) {
      return { ok: true, status: 200, json: async () => ({ data: { rates: { TRY: "30" } } }) };
    }
    if (url.includes("kraken.com") && krakenError) {
      return { ok: true, status: 200, json: async () => ({ error: ["EQuery:Unknown asset pair"] }) };
    }
    if (url.includes("kraken.com/0/public/OHLC")) {
      // Kraken names the result key itself and returns strings; 4 rows so
      // the tail slice (points: 3) is exercised
      return { ok: true, status: 200, json: async () => ({ error: [], result: {
        XXMRZUSD: [
          [1000, "10", "12", "9", "11", "10.5", "100", 3],
          [2000, "11", "13", "10", "12", "11.5", "110", 4],
          [3000, "12", "14", "11", "13", "12.5", "120", 5],
          [4000, "13", "15", "12", "14", "13.5", "130", 6],
        ],
        last: 4000,
      } }) };
    }
    if (url.includes("kraken.com/0/public/Ticker")) {
      return { ok: true, status: 200, json: async () => ({ error: [], result: {
        XXMRZUSD: { c: ["380.5", "1.0"] },
      } }) };
    }
    if (url.includes("api.exchange.coinbase.com")) {
      // [time, low, high, open, close, volume], newest first + a junk row
      return { ok: true, status: 200, json: async () => ([
        [3000, 1, 2, 3, 4, 5],
        [2000, 1, 2, 3, 4, 5],
        [1, 2, 3],
        [1000, 1, 2, 3, 4, 5],
      ]) };
    }
    if (url.includes("mempool.space") && url.includes("/txs")) {
      if (chainFail) return { ok: false, status: 500, json: async () => ({}) };
      // Newest first, like the real API: a 0.25 spend after a 1 BTC receive
      const A = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
      return { ok: true, status: 200, json: async () => ([
        { status: { block_time: 200 },
          vin: [{ prevout: { scriptpubkey_address: A, value: 25000000 } }],
          vout: [{ scriptpubkey_address: "other", value: 24000000 }] },
        { status: { block_time: 100 },
          vin: [],
          vout: [{ scriptpubkey_address: A, value: 100000000 },
                 { scriptpubkey_address: "other", value: 5 }] },
      ]) };
    }
    if (url.includes("mempool.space/api/address/")) {
      if (chainFail) return { ok: false, status: 500, json: async () => ({}) };
      // 1.5 funded − 0.5 spent = 1 BTC
      return { ok: true, status: 200, json: async () => ({
        chain_stats: { funded_txo_sum: 150000000, spent_txo_sum: 50000000 },
      }) };
    }
    if (url.includes("dashboards/address")) {
      if (chainFail) return { ok: false, status: 430, json: async () => ({}) };
      // 2 ETH in wei, keyed by a re-cased address (provider quirk)
      return { ok: true, status: 200, json: async () => ({
        data: { RECASED: { address: { balance: "2000000000000000000" } } },
      }) };
    }
    if (url.includes("blockchair")) {
      return { ok: true, status: 200, json: async () => ({ data: [
        { source: "www.coindesk.com", title: "T".repeat(200), link: "https://x.com/a" },
        { source: 5, title: "", link: "http://insecure.com" },
        { source: "en.bitcoin.it", title: "Hello", link: "ftp://bad" },
      ] }) };
    }
    if (url.includes("hn.algolia.com")) {
      // Same story returned for two terms (id 1) + a text post without a URL
      return { ok: true, status: 200, json: async () => ({ hits: [
        { objectID: "1", title: "Bitcoin hits a milestone", url: "https://example.com/a", points: 120 },
        { objectID: "2", title: "Ask HN: Crypto custody?", url: null, points: 80 },
        { objectID: "3", title: "", url: "https://example.com/c", points: 300 },
      ] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  },
  NEWS_API_URL: "https://api.blockchair.com/news",
  HN_NEWS_API: "https://hn.algolia.com/api/v1/search",
  HN_NEWS_TERMS: ["bitcoin", "crypto"],
  HN_NEWS_MIN_POINTS: 30,
  HN_NEWS_MAX_AGE_S: 7 * 86400,
  HN_NEWS_MAX_ITEMS: 8,
  MAX_NEWS_ITEMS: 50,
  NEWS_SPAM_RE:
    /price (prediction|analysis)|presale|pre-sale|best (coins?|cryptos?) to buy|casino|airdrop|giveaway|sponsored/i,
  encodeURIComponent,
  WATCH_CHAINS: {
    BTC: { provider: "mempool", decimals: 8 },
    ETH: { provider: "blockchair", chain: "ethereum", decimals: 18 },
  },
  WATCH_ADDRESS_RE: /^[A-Za-z0-9]{20,100}$/,
  WATCH_BALANCE_TTL: 600000,
  ERC20_TOKENS: {
    LINK: { address: "0xLINKCONTRACT", decimals: 18 },
    USDC: { address: "0xUSDCCONTRACT", decimals: 6 },
  },
  ETH_RPC: "https://ethereum-rpc.publicnode.com",
  ERC20_BALANCE_SELECTOR: "0x70a08231",
  BigInt,
  OHLC_GRANULARITY: {
    hour: { granularity: 60, points: 60 },
    day: { granularity: 900, points: 2 }, // small, so the window slice shows
    week: { granularity: 3600, points: 168 },
  },
  OHLC_CURRENCIES: ["USD", "EUR", "GBP"],
  OHLC_CACHE_TTL: 300000,
  providerFor: (coin) => (coin === "XMR" ? "kraken" : "coinbase"),
  KRAKEN_API: "https://api.kraken.com/0/public/",
  KRAKEN_PERIODS: {
    day: { interval: 5, points: 3 }, // small, so the tail slice shows
    week: { interval: 60, points: 168 },
    all: { interval: 21600, points: 720 },
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "api.js"), "utf8"), sandbox, { filename: "api.js" });
const run = (c) => vm.runInContext(c, sandbox);

(async () => {
  // refreshPageTickerCoin: fetches, computes 24h change vs oldest price, caches
  await run('refreshPageTickerCoin("BTC", "USD", Date.now())');
  const entry = run('pageTickerCache.get("BTC-USD")');
  assert.strictEqual(entry.price, 100, "spot price cached");
  assert.strictEqual(entry.change, 25, "24h change = (100-80)/80");
  assert.strictEqual(entry.up, true, "direction up");
  assert.strictEqual(fetchCalls.length, 2, "two requests (spot + history)");

  // fresh cache → no new fetches
  fetchCalls = [];
  await run('refreshPageTickerCoin("BTC", "USD", Date.now())');
  assert.strictEqual(fetchCalls.length, 0, "fresh cache skips network");

  // news: title clamped to 140, junk filtered, http link dropped
  const news = await run("fetchBlockchairNews()");
  assert.strictEqual(news.length, 2, "empty-title article filtered");
  assert.strictEqual(news[0].title.length, 140, "title clamped");
  assert.strictEqual(news[0].source, "coindesk.com", "www. stripped");
  assert.strictEqual(news[0].url, "https://x.com/a", "https kept");
  assert.strictEqual(news[1].source, "bitcoin.it", "en. stripped");
  assert.strictEqual(news[1].url, null, "non-https dropped");

  // Hacker News: one request per term, story-id dedupe across terms,
  // empty titles dropped, text posts link to the HN discussion
  fetchCalls = [];
  const hn = await run("fetchHackerNewsStories()");
  assert.strictEqual(fetchCalls.length, 2, "one request per HN term");
  assert.strictEqual(hn.length, 2, "empty title dropped, ids deduped");
  assert.strictEqual(hn[0].title, "Bitcoin hits a milestone", "sorted by points");
  assert.strictEqual(hn[0].source, "Hacker News", "source label");
  assert.strictEqual(hn[0].points, undefined, "internal points field stripped");
  assert.strictEqual(
    hn[1].url,
    "https://news.ycombinator.com/item?id=2",
    "text post links to the HN discussion",
  );

  // mergeNewsItems: priority order kept, spam filtered, near-duplicate
  // titles collapsed across sources, cap respected
  sandbox.__a = [
    { source: "x", title: "Bitcoin ETF approved!", url: "https://a" },
    { source: "x", title: "XRP Price Prediction: to the moon", url: "https://spam" },
  ];
  sandbox.__b = [
    { source: "y", title: "BITCOIN — ETF Approved", url: "https://dupe" },
    { source: "y", title: "Fresh story", url: "https://b" },
    null,
  ];
  const merged = run("mergeNewsItems(__a, __b)");
  assert.strictEqual(merged.length, 2, "spam + duplicate + junk dropped");
  assert.strictEqual(merged[0].url, "https://a", "first source wins the duplicate");
  assert.strictEqual(merged[1].title, "Fresh story", "second source appended");

  // fetchAddressBalance: provider parsing, unit conversion, caching, guards
  const btcAddr = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
  const ethAddr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  fetchCalls = [];
  assert.strictEqual(
    await run(`fetchAddressBalance("BTC", "${btcAddr}")`),
    1,
    "BTC: (funded − spent) satoshi → coins",
  );
  await run(`fetchAddressBalance("BTC", "${btcAddr}")`);
  assert.strictEqual(fetchCalls.length, 1, "second lookup within TTL is cached");
  assert.strictEqual(
    await run(`fetchAddressBalance("ETH", "${ethAddr}")`),
    2,
    "ETH: wei → coins, re-cased response key handled",
  );
  assert.strictEqual(
    await run(`fetchAddressBalance("SOL", "${ethAddr}")`),
    null,
    "unsupported chain → null (no request)",
  );
  assert.strictEqual(
    await run('fetchAddressBalance("BTC", "not a valid address!")'),
    null,
    "junk address shape → null (no request)",
  );
  assert.strictEqual(fetchCalls.length, 2, "guarded lookups never hit the network");

  // BTC tx history → chronological net deltas (receive +1 at t=100, then
  // the 0.25 spend at t=200); second call served from cache
  fetchCalls = [];
  assert.strictEqual(
    JSON.stringify(await run(`fetchBtcAddressDeltas("${btcAddr}")`)),
    JSON.stringify([{ time: 100, delta: 1 }, { time: 200, delta: -0.25 }]),
    "tx history reduced to chronological deltas",
  );
  await run(`fetchBtcAddressDeltas("${btcAddr}")`);
  assert.strictEqual(fetchCalls.length, 1, "tx history cached within TTL");
  assert.strictEqual(
    await run('fetchBtcAddressDeltas("junk!!")'),
    null,
    "junk address → null without a request",
  );

  // OHLC candles: parsed, unit-converted to ms, sorted oldest-first, cached
  fetchCalls = [];
  const candles = await run('fetchOhlcCandles("BTC", "day", "USD")');
  // The API ignores our window and always returns its own batch, so the
  // fetcher keeps only the newest `points` candles — otherwise a 1H chart
  // draws six hours of one-minute candles
  assert.strictEqual(candles.length, 2, "trimmed to the period's candle count");
  assert.strictEqual(candles[1].time, 3000000, "keeps the newest, not the oldest");
  assert.ok(
    candles[0].time < candles[1].time,
    "candles sorted oldest first (API returns newest first)",
  );
  assert.strictEqual(candles[0].time, 2000000, "seconds converted to ms");
  assert.strictEqual(candles[0].open, 3, "open mapped from column 3");
  assert.strictEqual(candles[0].high, 2, "high mapped from column 2");
  assert.strictEqual(candles[0].low, 1, "low mapped from column 1");
  assert.strictEqual(candles[0].close, 4, "close mapped from column 4");
  assert.strictEqual(candles[0].volume, 5, "volume mapped from column 5");
  await run('fetchOhlcCandles("BTC", "day", "USD")');
  assert.strictEqual(fetchCalls.length, 1, "second call served from cache");

  // Unsupported period/currency never hits the network — those charts keep
  // the price-only readout instead of borrowing wrong candles
  assert.strictEqual(await run('fetchOhlcCandles("BTC", "all", "USD")'), null, "ALL has no granularity");
  assert.strictEqual(await run('fetchOhlcCandles("BTC", "month", "USD")'), null, "period without a spec");
  assert.strictEqual(await run('fetchOhlcCandles("BTC", "day", "TRY")'), null, "unquoted currency");
  assert.strictEqual(fetchCalls.length, 1, "guarded cases make no request");

  // candleAt: nearest candle, but only within one step of the point
  sandbox.__candles = [
    { time: 1000, open: 1, high: 2, low: 0, close: 1.5, volume: 10 },
    { time: 2000, open: 2, high: 3, low: 1, close: 2.5, volume: 20 },
    { time: 3000, open: 3, high: 4, low: 2, close: 3.5, volume: 30 },
  ];
  assert.strictEqual(run("candleAt(__candles, 2000).close"), 2.5, "exact match");
  assert.strictEqual(run("candleAt(__candles, 2400).close"), 2.5, "nearest below");
  assert.strictEqual(run("candleAt(__candles, 2600).close"), 3.5, "nearest above");
  assert.strictEqual(run("candleAt(__candles, 3900).close"), 3.5, "within one step of the last");
  assert.strictEqual(run("candleAt(__candles, 9000)"), null, "far outside the range → null");
  assert.strictEqual(run("candleAt(__candles, -9000)"), null, "far before the range → null");
  assert.strictEqual(run("candleAt([], 1000)"), null, "no candles → null");
  assert.strictEqual(run("candleAt(null, 1000)"), null, "missing candles → null");

  /* ERC-20 balances: one batched request for every token asked about, and
   * balances scaled by each token's own decimals. Tokens are read from their
   * contract rather than matched by symbol — anyone can deploy a contract
   * calling itself USDC, so a name is not an identity. */
  fetchCalls = [];
  const balances = await run(`fetchErc20Balances("${ethAddr}", ["LINK", "USDC"])`);
  assert.strictEqual(fetchCalls.length, 1, "both tokens ride one request");
  assert.strictEqual(balances.LINK, 1, "18-decimal balance scaled");
  assert.strictEqual(balances.USDC, 2.5, "6-decimal balance scaled");

  // Cached per address+token, so the sweep doesn't re-ask
  fetchCalls = [];
  await run(`fetchErc20Balances("${ethAddr}", ["LINK", "USDC"])`);
  assert.strictEqual(fetchCalls.length, 0, "second lookup is cached");

  // A single lookup goes through the same path and cache
  assert.strictEqual(
    await run(`fetchAddressBalance("LINK", "${ethAddr}")`),
    1,
    "token balance via the shared address lookup",
  );

  // Unknown tokens and junk addresses never reach the network
  fetchCalls = [];
  // Objects made inside the vm need stringify comparison (see tests/README)
  assert.strictEqual(
    JSON.stringify(await run(`fetchErc20Balances("${ethAddr}", ["NOTATOKEN"])`)),
    "{}",
    "unsupported token → nothing",
  );
  assert.strictEqual(
    JSON.stringify(await run('fetchErc20Balances("not an address!", ["LINK"])')),
    "{}",
    "junk address → nothing",
  );
  assert.strictEqual(fetchCalls.length, 0, "and no requests for either");

  // Balance decoding must survive what an RPC can actually return
  assert.strictEqual(run('decodeErc20Balance("0x", 18)'), 0, "empty result is a zero balance");
  assert.strictEqual(run('decodeErc20Balance("0x0de0b6b3a7640000", 18)'), 1, "one whole token");
  assert.strictEqual(run('decodeErc20Balance("0x2625a0", 6)'), 2.5, "fractional token");
  assert.strictEqual(run('decodeErc20Balance("junk", 18)'), null, "non-hex → null, never NaN");
  assert.strictEqual(run("decodeErc20Balance(null, 18)"), null, "missing result → null");
  // 18-decimal balances exceed what a double can hold before scaling, so the
  // raw value is parsed as a BigInt and split before the division
  assert.strictEqual(
    run('decodeErc20Balance("0x152d02c7e14af6800000", 18)'),
    100000,
    "large balance keeps its magnitude",
  );

  // provider failure → stale cache wins; no cache → null
  chainFail = true;
  run(`addressBalanceCache.get("ETH:${ethAddr}").timestamp = Date.now() - WATCH_BALANCE_TTL - 1`);
  assert.strictEqual(
    await run(`fetchAddressBalance("ETH", "${ethAddr}")`),
    2,
    "provider failure serves the last known balance",
  );
  assert.strictEqual(
    await run(`fetchAddressBalance("BTC", "${ethAddr.slice(2)}00")`),
    null,
    "failure with no cached balance → null",
  );
  chainFail = false;

  /* ── Kraken adapter (coins Coinbase doesn't list) ────────────────────── */

  fetchCalls = [];
  const kh = await run('fetchKrakenHistory("XMR", "day", "USD")');
  assert.strictEqual(kh.length, 3, "tail sliced to the period's point count");
  assert.strictEqual(kh[0].price, 12, "close column used for the line series");
  assert.ok(kh[0].time instanceof Date || Number(kh[0].time) > 0, "seconds became a Date");
  assert.strictEqual(Number(kh[2].time), 4000 * 1000, "timestamps in ms, ascending");

  // Kraken quotes USD; other currencies convert with the rate the ticker
  // already fetches, so every display currency works
  const khTry = await run('fetchKrakenHistory("XMR", "day", "TRY")');
  assert.strictEqual(khTry[0].price, 12 * 30, "converted with the USD rate");

  // Same rows serve the crosshair — no second request
  fetchCalls = [];
  const kc = await run('fetchKrakenCandles("XMR", "day", "USD")');
  assert.strictEqual(kc.length, 3, "candles come from the cached rows");
  assert.deepStrictEqual(
    { o: kc[0].open, h: kc[0].high, l: kc[0].low, c: kc[0].close, v: kc[0].volume },
    { o: 11, h: 13, l: 10, c: 12, v: 110 },
    "OHLC columns mapped, volume left in base units",
  );
  assert.strictEqual(
    fetchCalls.filter((u) => u.includes("OHLC")).length,
    0,
    "history and candles share one request",
  );

  // Spot comes from the ticker's last trade
  assert.strictEqual(await run('fetchKrakenSpot("XMR", "USD")'), 380.5, "last trade price");

  // An error array is a failure even with HTTP 200 — Kraken reports that way
  krakenError = true;
  await assert.rejects(
    () => run('fetchKrakenSpot("XMR", "USD")'),
    /Unknown asset pair/,
    "Kraken's error array is treated as a failure",
  );
  assert.strictEqual(
    await run('fetchKrakenCandles("XMR", "week", "USD")'),
    null,
    "candle failure degrades to the price-only readout",
  );
  krakenError = false;

  /* The ALL range has no Coinbase candles — its coarsest is a day and it
   * returns ~350 of them, which is under a year. In candlestick mode the
   * range borrows Kraken's 15-day candles instead; in line mode it stays
   * empty, because mixing one exchange's candles with another's line would
   * put two slightly different prices on the same chart. */
  fetchCalls = [];
  assert.strictEqual(
    await run('fetchOhlcCandles("BTC", "all", "USD")'),
    null,
    "ALL stays candle-less without the cross-provider opt-in",
  );
  assert.strictEqual(fetchCalls.length, 0, "and makes no request");

  const allCandles = await run('fetchOhlcCandles("BTC", "all", "USD", true)');
  assert.ok(allCandles && allCandles.length, "ALL gets candles from the other provider");
  assert.ok(
    fetchCalls.some((u) => u.includes("kraken.com")),
    "which is where they come from",
  );

  // A coin the other provider doesn't list falls back to no candles, and is
  // remembered so the miss isn't repeated on every visit to the range
  krakenError = true;
  fetchCalls = [];
  assert.strictEqual(
    await run('fetchOhlcCandles("ADA", "all", "USD", true)'),
    null,
    "unlisted pair → no candles",
  );
  const firstTry = fetchCalls.length;
  assert.ok(firstTry > 0, "it did try once");
  assert.strictEqual(
    await run('fetchOhlcCandles("ADA", "all", "USD", true)'),
    null,
    "still no candles on the second visit",
  );
  assert.strictEqual(fetchCalls.length, firstTry, "and it doesn't ask again");
  krakenError = false;

  // Routing: a Kraken coin never reaches the Coinbase candles endpoint
  fetchCalls = [];
  await run('fetchOhlcCandles("XMR", "day", "USD")');
  assert.ok(
    fetchCalls.every((u) => !u.includes("exchange.coinbase.com")),
    "fetchOhlcCandles routes Kraken coins away from Coinbase",
  );

  console.log("ALL API TESTS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
