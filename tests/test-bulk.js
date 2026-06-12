// Bulk sweep tests: Coinlore fill, currency conversion, dedupe, fallback.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const coinloreBody = { data: [
  { symbol: "BTC", price_usd: "60000", percent_change_24h: "1.5" },
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
    fetch: async (url) => {
      calls.push(url);
      if (url.includes("coinlore")) {
        if (opts.coinloreDown) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, json: async () => coinloreBody };
      }
      if (url.includes("exchange-rates")) return { ok: true, json: async () => ratesBody };
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
  assert.strictEqual(t1.run('pageTickerCache.get("ZZZ-USD")'), undefined, "unwanted symbol skipped");
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

  console.log("ALL BULK SWEEP TESTS PASSED");
})().catch((e) => { console.error(e.message); process.exit(1); });
