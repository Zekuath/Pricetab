// Bulk sweep tests: Coinlore fill, currency conversion, dedupe, fallback.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const coinloreBody = { data: [
  { symbol: "BTC", price_usd: "60000", percent_change_24h: "1.5", market_cap_usd: "1200000000000", volume24: "35000000000" },
  { symbol: "ETH", price_usd: "1700", percent_change_24h: "-2.25" },
  { symbol: "ETH", price_usd: "999", percent_change_24h: "50" },   // dup, lower rank → ignored
  { symbol: "DOGE", price_usd: "junk", percent_change_24h: "1" },  // bad price → skipped
  { symbol: "SOL", price_usd: "150", percent_change_24h: "nope" }, // bad change → price only
  { symbol: "ZZZ", price_usd: "5", percent_change_24h: "1" },      // not wanted → skipped
]};
const ratesBody = { data: { currency: "USD", rates: { TRY: "30", EUR: "0.9" } } };

const makeSandbox = (opts = {}) => {
  const calls = [];
  const sb = {
    console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number,
    parseInt, parseFloat, isFinite, isNaN, setTimeout, clearTimeout, Error, AbortController,
    localStorage: { getItem: () => null, setItem: () => {} },
    // config.js supplies this at runtime; the sweep only cares that most
    // coins are Coinbase-served
    providerFor: (coin) => (opts.krakenCoins || []).includes(coin) ? "kraken" : "coinbase",
    // The runtime half of the same policy (a coin can be failed over mid-tab);
    // the real one lives in config.js, exercised in tests/test-provider.js
    effectiveProvider: (coin) =>
      (opts.krakenCoins || []).includes(coin) ? "kraken" : "coinbase",
    KRAKEN_API: "https://api.kraken.com/0/public/",
    KRAKEN_PERIODS: { day: { interval: 5, points: 288 } },
    fetch: async (url) => {
      calls.push(url);
      if (url.includes("coinlore")) {
        if (opts.coinloreDown) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, json: async () => coinloreBody };
      }
      if (url.includes("exchange-rates")) return { ok: true, json: async () => ratesBody };
      if (url.includes("kraken.com")) {
        // [time, o, h, l, c, vwap, volume, count]
        return { ok: true, json: async () => ({ error: [], result: {
          XXMRZUSD: [
            [1000, "300", "310", "295", "300", "302", "10", 5],
            [2000, "300", "340", "299", "330", "320", "12", 7],
          ],
          last: 2000,
        } }) };
      }
      if (url.includes("/spot")) return { ok: true, status: 200, json: async () => ({ data: { amount: "60500", currency: "USD" } }) };
      if (url.includes("historic")) return { ok: true, status: 200, json: async () => ({ data: { prices: [{ price: "60000", time: 1 }] } }) };
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "api.js"), "utf8"), sb, { filename: "api.js" });
  return { sb, calls, run: (c) => vm.runInContext(c, sb) };
};

(async () => {
  // --- USD fill ---
  const t1 = makeSandbox();
  const ok = await t1.run('bulkRefreshPageTickerCache(["BTC","ETH","DOGE","SOL","XRP"], "USD")');
  assert.strictEqual(ok, true, "bulk reports success");
  assert.strictEqual(t1.calls.length, 1, "USD needs only the Coinlore request");
  const btc = t1.run('pageTickerCache.get("BTC-USD")');
  assert.strictEqual(btc.price, 60000, "BTC price");
  assert.strictEqual(btc.change, 1.5, "BTC 24h change");
  assert.strictEqual(btc.up, true, "BTC up");
  const eth = t1.run('pageTickerCache.get("ETH-USD")');
  assert.strictEqual(eth.price, 1700, "duplicate symbol → first (highest rank) wins");
  assert.strictEqual(eth.up, false, "negative change → down");
  assert.strictEqual(t1.run('pageTickerCache.get("DOGE-USD")'), undefined, "junk price skipped");
  const sol = t1.run('pageTickerCache.get("SOL-USD")');
  assert.strictEqual(sol.change, null, "unparseable change → null");
  /* Every symbol in the response is cached, including ones this caller did
   * not ask for. Deliberate, and load-bearing: the sweep is skipped while a
   * previous one for the same currency is inside its TTL, so if the cache
   * held only the first caller's coins, a three-coin alert sweep would
   * satisfy the page ticker's request for sixty-five and push the rest onto
   * the per-coin path — about 130 requests instead of one.
   *
   * Do not "fix" this back to skipping unwanted symbols without removing the
   * TTL guard in bulkRefreshPageTickerCache first. */
  const extra = t1.run('pageTickerCache.get("ZZZ-USD")');
  assert.ok(extra, "a symbol outside the requested list is still cached");
  assert.strictEqual(extra.price, 5, "…with its real price");
  assert.strictEqual(t1.run('pageTickerCache.get("XRP-USD")'), undefined, "missing coin left for fallback");

  // --- fallback loop integration: fresh bulk entries are TTL-skipped ---
  t1.calls.length = 0;
  await t1.run('refreshPageTickerCoin("BTC", "USD", Date.now())');
  assert.strictEqual(t1.calls.length, 0, "fresh bulk entry skips per-coin fetch");
  await t1.run('refreshPageTickerCoin("XRP", "USD", Date.now())');
  assert.strictEqual(t1.calls.length, 2, "missing coin still fetched via Coinbase (spot+history)");
  assert.strictEqual(t1.run('pageTickerCache.get("XRP-USD")').price, 60500, "fallback fills the gap");

  // --- TRY conversion ---
  const t2 = makeSandbox();
  await t2.run('bulkRefreshPageTickerCache(["BTC"], "TRY")');
  assert.strictEqual(t2.calls.length, 2, "non-USD adds one exchange-rates request");
  assert.strictEqual(t2.run('pageTickerCache.get("BTC-TRY")').price, 1800000, "60000 × 30 TRY");

  // --- Coinlore down → false, nothing cached ---
  const t3 = makeSandbox({ coinloreDown: true });
  const down = await t3.run('bulkRefreshPageTickerCache(["BTC"], "USD")');
  assert.strictEqual(down, false, "failure reported so caller falls back");
  assert.strictEqual(t3.run("pageTickerCache.size"), 0, "nothing cached on failure");

  // --- non-Coinbase coin never hits Coinbase in the fallback ---
  // XMR 404s on every Coinbase endpoint, so the per-coin fallback has to
  // route to its own provider instead of hammering a dead pair
  const t4 = makeSandbox({ krakenCoins: ["XMR"] });
  await t4.run('refreshPageTickerCoin("XMR", "USD", Date.now())');
  assert.ok(
    t4.calls.every((u) => !u.includes("coinbase.com")),
    "Kraken-served coin makes no Coinbase request",
  );
  assert.ok(
    t4.calls.some((u) => u.includes("kraken.com")),
    "it asks its own provider instead",
  );

  // Market cap and volume come free in the same response — the stats row
  // reads them from here rather than making its own request
  const t5 = makeSandbox();
  await t5.run('bulkRefreshPageTickerCache(["BTC"], "USD")');
  const btcStats = t5.run('pageTickerCache.get("BTC-USD")');
  assert.strictEqual(btcStats.marketCap, 1200000000000, "market cap kept");
  assert.strictEqual(btcStats.volume24, 35000000000, "24h volume kept");
  assert.strictEqual(t5.calls.length, 1, "and still only one request");

  // They convert with the price, so a non-USD row isn't quoting dollars
  const t6 = makeSandbox();
  await t6.run('bulkRefreshPageTickerCache(["BTC"], "TRY")');
  assert.strictEqual(
    t6.run('pageTickerCache.get("BTC-TRY")').marketCap,
    1200000000000 * 30,
    "market cap converted with the same rate as the price",
  );

  // A ticker without those fields must not produce zeroes or NaN
  const t7 = makeSandbox();
  await t7.run('bulkRefreshPageTickerCache(["ETH"], "USD")');
  const ethStats = t7.run('pageTickerCache.get("ETH-USD")');
  assert.strictEqual(ethStats.marketCap, null, "missing market cap → null, not 0");
  assert.strictEqual(ethStats.volume24, null, "missing volume → null");

  console.log("ALL BULK SWEEP TESTS PASSED");
})().catch((e) => { console.error(e.message); process.exit(1); });
