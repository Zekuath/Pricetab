// Portfolio regression tests: holdings persistence/validation, the chart
// period setting, the total-value series builder and the history cache.
// Runs config.js + storage.js + portfolio.js in a vm context with stubbed
// localStorage / styled / React — no network, no browser.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

/* ── sandbox ────────────────────────────────────────────────────────────── */

// Chainable tagged-template stub for styled-components (same idea as
// test-load.js): styled.div`...`, keyframes`...` etc. all become inert values.
const tagged = (name) => {
  const fn = (...args) => fn;
  fn.attrs = () => tagged(name);
  return new Proxy(fn, {
    get: (t, p) => (p in t ? t[p] : tagged(name)),
    apply: () => tagged(name),
  });
};
const styledStub = new Proxy(function styled() { return tagged("styled"); }, {
  get: (t, p) => (p === "default" ? styledStub : tagged(p.toString())),
  apply: () => tagged("styled"),
});

const store = {};
let fetchCalls = []; // [coin-period-currency] per fetchValueHistory call
let fetchImpl = async () => {
  throw new Error("fetchValueHistory stub not configured");
};

const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number, String,
  Boolean, Symbol, Proxy, RegExp, Error, parseInt, parseFloat, isFinite, isNaN,
  setTimeout, clearTimeout,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  styled: styledStub,
  keyframes: tagged("keyframes"),
  css: tagged("css"),
  React: { Component: class { constructor(p) { this.props = p; } }, createElement: () => null, Fragment: Symbol("Fragment") },
  PureComponent: class { constructor(p) { this.props = p; } },
  Component: class { constructor(p) { this.props = p; } },
  Fragment: Symbol("Fragment"),
  createRef: () => ({ current: null }),
  window: { matchMedia: () => ({ matches: false }) },
  // portfolio.js calls this inside getPortfolioHistory — count + delegate
  fetchValueHistory: (coin, period, currency) => {
    fetchCalls.push(`${coin}-${period}-${currency}`);
    return fetchImpl(coin, period, currency);
  },
};
vm.createContext(sandbox);

const base = path.join(__dirname, "..", "src");
for (const f of ["config.js", "storage.js", "portfolio.js"]) {
  vm.runInContext(fs.readFileSync(`${base}/${f}`, "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);
const json = (code) => JSON.parse(JSON.stringify(run(code)));

/* ── holdings persistence + validation ──────────────────────────────────── */

assert.deepStrictEqual(json("loadPortfolioFromStorage()"), [], "empty default");

run('savePortfolioToStorage([{ coin: "BTC", amount: 0.5, paid: 15000, address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" }, { coin: "ETH", amount: 2 }])');
assert.deepStrictEqual(
  json("loadPortfolioFromStorage()"),
  [
    { coin: "BTC", amount: 0.5, paid: 15000, address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" },
    { coin: "ETH", amount: 2, paid: 0, address: "" },
  ],
  "roundtrip (paid + watched address kept, missing fields default)",
);

store["crypto_chart_portfolio"] = "{not json";
assert.deepStrictEqual(json("loadPortfolioFromStorage()"), [], "corrupt JSON → []");

store["crypto_chart_portfolio"] = JSON.stringify({ coin: "BTC", amount: 1 });
assert.deepStrictEqual(json("loadPortfolioFromStorage()"), [], "non-array → []");

// malformed entries are dropped, valid ones survive
store["crypto_chart_portfolio"] = JSON.stringify([
  { coin: "eth", amount: "2", paid: "1500" }, // lowercase + string numbers → normalized
  { coin: "BTC", amount: 1, paid: -50 },      // negative paid → cleared to 0
  { coin: "BTC", amount: 3 },                 // duplicate → dropped
  { coin: "NOTACOIN", amount: 1 },            // not in SUGGESTED_COINS → dropped
  { coin: "LTC", amount: -5 },                // negative amount → dropped
  { coin: "XRP", amount: "abc" },             // NaN → dropped
  { coin: "SOL" },                            // missing amount → dropped
  null,                                       // junk → dropped
  "BTC",                                      // junk → dropped
  { coin: "ADA", amount: 0, paid: "junk" },   // zero amount ok; junk paid → 0
]);
assert.deepStrictEqual(
  json("loadPortfolioFromStorage()"),
  [
    { coin: "ETH", amount: 2, paid: 1500, address: "" },
    { coin: "BTC", amount: 1, paid: 0, address: "" },
    { coin: "ADA", amount: 0, paid: 0, address: "" },
  ],
  "malformed entries dropped, coins normalized/deduped, paid coerced",
);

// sanitizePortfolio is what JSON import runs through — same rules apply
assert.deepStrictEqual(
  json('sanitizePortfolio([{ coin: "sol", amount: "3", paid: 100 }, { coin: "SCAM", amount: 1 }])'),
  [{ coin: "SOL", amount: 3, paid: 100, address: "" }],
  "import sanitizer: whitelist + coercion",
);
assert.deepStrictEqual(json('sanitizePortfolio("junk")'), [], "import sanitizer: non-array → []");

// watched addresses: kept only for supported chains with a sane shape
assert.deepStrictEqual(
  json(
    'sanitizePortfolio([' +
      '{ coin: "ETH", amount: 1, address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },' + // kept
      '{ coin: "SOL", amount: 1, address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },' + // unsupported chain → cleared
      '{ coin: "BTC", amount: 1, address: "not a real address!!" },' + // junk shape → cleared
      "])",
  ),
  [
    { coin: "ETH", amount: 1, paid: 0, address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
    { coin: "SOL", amount: 1, paid: 0, address: "" },
    { coin: "BTC", amount: 1, paid: 0, address: "" },
  ],
  "addresses whitelisted per chain, junk cleared",
);

run("savePortfolioToStorage('garbage')");
assert.deepStrictEqual(json("loadPortfolioFromStorage()"), [], "non-array save writes []");

/* ── chart period setting ───────────────────────────────────────────────── */

assert.strictEqual(run("loadPortfolioPeriodFromStorage()"), "week", "period default");
run('savePortfolioPeriodToStorage("month")');
assert.strictEqual(run("loadPortfolioPeriodFromStorage()"), "month", "period roundtrip");
store["crypto_chart_portfolio_period"] = "hour"; // excluded for the portfolio chart
assert.strictEqual(run("loadPortfolioPeriodFromStorage()"), "week", "hour rejected");

assert.ok(
  json("PORTFOLIO_CHART_PERIODS").every((o) => o.value !== "hour"),
  "PORTFOLIO_CHART_PERIODS excludes hour",
);

/* ── buildPortfolioSeries ───────────────────────────────────────────────── */

const series = (histories, holdings) => {
  sandbox.__histories = histories;
  sandbox.__holdings = holdings;
  return json("buildPortfolioSeries(__histories, __holdings)");
};

// sums amount × price per point, times come from the first holding's history
assert.deepStrictEqual(
  series(
    {
      BTC: [{ price: 100, time: 1 }, { price: 110, time: 2 }],
      ETH: [{ price: 10, time: 1 }, { price: 20, time: 2 }],
    },
    [{ coin: "BTC", amount: 2 }, { coin: "ETH", amount: 3 }],
  ),
  [{ price: 230, time: 1 }, { price: 280, time: 2 }],
  "sums amount × price",
);

// different lengths: aligned from the end, trimmed to the shortest history
assert.deepStrictEqual(
  series(
    {
      BTC: [{ price: 1, time: 1 }, { price: 2, time: 2 }, { price: 3, time: 3 }],
      ETH: [{ price: 10, time: 2 }, { price: 20, time: 3 }],
    },
    [{ coin: "BTC", amount: 1 }, { coin: "ETH", amount: 1 }],
  ),
  [{ price: 12, time: 2 }, { price: 23, time: 3 }],
  "aligned from the end, trimmed to shortest",
);

// zero-amount and history-less holdings are skipped
assert.deepStrictEqual(
  series(
    { BTC: [{ price: 5, time: 1 }, { price: 6, time: 2 }] },
    [{ coin: "BTC", amount: 1 }, { coin: "ETH", amount: 0 }, { coin: "SOL", amount: 4 }],
  ),
  [{ price: 5, time: 1 }, { price: 6, time: 2 }],
  "zero-amount / missing-history holdings skipped",
);

assert.strictEqual(series({}, [{ coin: "BTC", amount: 1 }]), null, "no histories → null");
assert.strictEqual(series({ BTC: [] }, [{ coin: "BTC", amount: 1 }]), null, "empty history → null");
assert.strictEqual(
  series({ BTC: [{ price: 1, time: 1 }] }, [{ coin: "BTC", amount: 1 }]),
  null,
  "single point → null (nothing to draw)",
);
assert.strictEqual(series({ BTC: [[1, 2]] }, []), null, "no holdings → null");

/* ── buildPortfolioCsv (tax report) ─────────────────────────────────────── */

sandbox.__csvRows = [
  { coin: "BTC", amount: 0.5, paid: 15000, price: 40000, value: 20000 },
  { coin: "ETH", amount: 2, paid: 0, price: 1500, value: 3000 }, // no paid → no P/L cells
  { coin: "SOL", amount: 1, paid: 50, price: null, value: null }, // unpriced → skipped in totals
];
const csv = run('buildPortfolioCsv(__csvRows, "USD")');
const csvLines = csv.split("\n");
assert.ok(csvLines[0].includes("prices in USD"), "csv: currency in header comment");
assert.strictEqual(
  csvLines[1],
  "Coin,Name,Amount,Total paid,Avg cost,Current price,Current value,Unrealized P/L,P/L %",
  "csv: column header",
);
assert.strictEqual(
  csvLines[2],
  "BTC,Bitcoin,0.5,15000,30000,40000,20000,5000,33.33",
  "csv: full row with derived avg cost and P/L",
);
assert.strictEqual(
  csvLines[3],
  "ETH,Ethereum,2,,,1500,3000,,",
  "csv: paid-less row leaves P/L cells empty",
);
assert.strictEqual(
  csvLines[5],
  "Total,,,15000,,,20000,5000,33.33",
  "csv: totals only over rows with paid + price",
);
assert.ok(csvLines[6].includes("not tax advice"), "csv: disclaimer present");

// commas/quotes in names can't break the format
sandbox.__csvEsc = [{ coin: "BTC", amount: 1, paid: 0, price: 1, value: 1 }];
run('COIN_NAMES.BTC = \'Bit"coin, the first\'');
assert.ok(
  run('buildPortfolioCsv(__csvEsc, "USD")').includes('"Bit""coin, the first"'),
  "csv: names with commas/quotes escaped",
);
run('COIN_NAMES.BTC = "Bitcoin"');

/* ── getPortfolioHistory cache ──────────────────────────────────────────── */

(async () => {
  const data1 = [{ price: 1, time: 1 }, { price: 2, time: 2 }];
  fetchImpl = async () => data1;
  fetchCalls = [];

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(await run('getPortfolioHistory("BTC", "week", "USD")'))),
    data1,
    "first call fetches",
  );
  await run('getPortfolioHistory("BTC", "week", "USD")');
  assert.deepStrictEqual(fetchCalls, ["BTC-week-USD"], "second call within TTL is cached");

  await run('getPortfolioHistory("BTC", "month", "USD")');
  assert.strictEqual(fetchCalls.length, 2, "different period fetches again");

  // expire the week entry, make the network fail → stale data still served
  run('portfolioHistoryCache.get("BTC-week-USD").timestamp = Date.now() - PORTFOLIO_HISTORY_TTL - 1');
  fetchImpl = async () => { throw new Error("network down"); };
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(await run('getPortfolioHistory("BTC", "week", "USD")'))),
    data1,
    "fetch failure falls back to stale cache",
  );

  // no cache at all + failure → null (holding is skipped, not fatal)
  assert.strictEqual(
    await run('getPortfolioHistory("SOL", "week", "USD")'),
    null,
    "failure with no cache → null",
  );

  console.log("PORTFOLIO TESTS OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
