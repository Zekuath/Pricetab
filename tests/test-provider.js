/* Which exchange a coin's prices come from, and what happens when the first
 * one stops answering.
 *
 * Reported from a real install: the console said the historic request for SNX
 * had "been blocked by CORS policy: No 'Access-Control-Allow-Origin' header".
 * Coinbase's own API sends that header on everything, successes and 404s
 * alike — which is the tell. A response with no CORS header did not come from
 * the API: it came from something in front of it (a throttle, a region block),
 * and to the page it is indistinguishable from the network being down.
 *
 * Whatever the cause, the answer is the same: the series exists at Kraken for
 * 61 of the 65 coins on offer, so a chart should never be blank because one
 * exchange is having a moment.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");

let calls = [];
let coinbaseDown = false;

const KRAKEN_ROWS = [
  [1000, "11", "13", "10", "12", "12", "110", 5],
  [2000, "12", "14", "11", "13", "13", "120", 6],
  [3000, "13", "15", "12", "14", "14", "130", 7],
];

const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number, String,
  Boolean, parseInt, parseFloat, isFinite, isNaN, setTimeout, clearTimeout,
  Error, TypeError, AbortController, BigInt,
  window: { matchMedia: () => ({ matches: false }) },
  // d3's line() is called at the top level of utils.js; nothing here draws
  line: () => {
    const o = {};
    o.x = () => o;
    o.y = () => o;
    return o;
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  fetch: async (url) => {
    calls.push(url);
    /* What a blocked or throttled edge looks like from inside the page: no
     * `Access-Control-Allow-Origin`, so the browser never hands the response
     * over and `fetch` rejects. Nothing tells it apart from being offline. */
    if (coinbaseDown && url.includes("coinbase.com/api")) {
      throw new TypeError("Failed to fetch");
    }
    if (url.includes("historic")) {
      return { ok: true, status: 200, json: async () => ({ data: { prices: [
        { price: "80", time: 1 }, { price: "90", time: 2 },
      ] } }) };
    }
    if (url.includes("/spot")) {
      return { ok: true, status: 200, json: async () => ({ data: { amount: "100" } }) };
    }
    if (url.includes("exchange-rates")) {
      return { ok: true, status: 200, json: async () => ({ data: { rates: { USD: "1" } } }) };
    }
    if (url.includes("kraken.com/0/public/Ticker")) {
      return { ok: true, status: 200, json: async () => ({
        error: [], result: { XLINKZUSD: { c: ["17.25", "1.0"] } },
      }) };
    }
    if (url.includes("kraken.com")) {
      return { ok: true, status: 200, json: async () => ({
        error: [], result: { XSNXZUSD: KRAKEN_ROWS, last: 3000 },
      }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  },
};
vm.createContext(sandbox);
for (const f of ["config.js", "api.js", "storage.js", "widgets-data.js", "utils.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), "utf8"), sandbox, { filename: f });
}
const run = (c) => vm.runInContext(c, sandbox);

(async () => {
  // --- the policy on its own -------------------------------------------
  assert.strictEqual(run('providerFor("SNX")'), "coinbase", "SNX starts at Coinbase");
  assert.strictEqual(run('providerFor("XMR")'), "kraken", "delisted coins are routed for good");

  // A request we cancelled ourselves says nothing about the exchange, and
  // switching coin or range aborts whatever is in flight
  sandbox.__abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  assert.strictEqual(run("noteProviderFailure('ADA', __abort)"), false,
    "an abort never reroutes a coin");
  assert.strictEqual(run('effectiveProvider("ADA")'), "coinbase",
    "so it stays where it was");

  // The four coins Kraken does not list have nowhere to go: they keep
  // reporting the failure rather than pretending it can be served
  for (const coin of run("KRAKEN_MISSING")) {
    assert.strictEqual(run(`noteProviderFailure("${coin}", new Error("x"))`), false,
      `${coin} is not failed over — Kraken has no pair for it`);
  }

  // --- end to end: the chart still gets its series ----------------------
  coinbaseDown = true;
  calls = [];
  const series = await run('fetchValueHistory("SNX", "day", "USD", null, false)');
  assert.ok(Array.isArray(series) && series.length > 0,
    "a chart still gets a series when Coinbase will not answer");
  assert.ok(calls.some((u) => u.includes("kraken.com")), "and it came from Kraken");

  // …and the coin stays there for the rest of the tab rather than paying for
  // the same failure, and its retries, on every refresh
  calls = [];
  await run('fetchValueHistory("SNX", "day", "USD", null, false)');
  assert.ok(!calls.some((u) => u.includes("coinbase.com/api/v2/prices/SNX")),
    "the failed provider is not asked again this session");
  assert.strictEqual(run('effectiveProvider("SNX")'), "kraken",
    "the coin is on Kraken now");

  // The spot price follows the same rule — a chart with no current price is
  // as broken as one with no line
  calls = [];
  const spot = await run('fetchCurrentValue("LINK", "USD", null, false)');
  assert.ok(typeof spot === "number" && spot > 0, "a live price still arrives");
  assert.ok(calls.some((u) => u.includes("kraken.com")), "from Kraken as well");

  // A coin that never failed is untouched by any of this
  coinbaseDown = false;
  calls = [];
  await run('fetchValueHistory("BTC", "day", "USD", null, false)');
  assert.ok(calls.some((u) => u.includes("coinbase.com")),
    "coins that never failed still come from Coinbase");

  console.log("ALL PROVIDER TESTS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
