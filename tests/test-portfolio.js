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

const BTC_ADDR = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const BTC_ADDR2 = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";

// A holding is the manual part plus one entry per watched address
run(
  `savePortfolioToStorage([{ coin: "BTC", amount: 0.5, lots: [{ amount: 0.5, paid: 7000 }], watches: [` +
    `{ address: "${BTC_ADDR}", amount: 1.25, lots: [{ amount: 1.25, paid: 9000, time: 1700000000, source: "chain" }] },` +
    `{ address: "${BTC_ADDR2}", amount: 0.1, lots: [] }` +
    `] }, { coin: "ETH", amount: 2 }])`,
);
assert.deepStrictEqual(
  json("loadPortfolioFromStorage()"),
  [
    {
      coin: "BTC",
      amount: 0.5,
      lots: [{ amount: 0.5, paid: 7000, time: 0, source: "manual" }],
      watches: [
        {
          address: BTC_ADDR,
          amount: 1.25,
          lots: [{ amount: 1.25, paid: 9000, time: 1700000000, source: "chain" }],
        },
        { address: BTC_ADDR2, amount: 0.1, lots: [] },
      ],
      // Added when disposals became recordable; a holding saved before that
      // still loads, with an empty list rather than being dropped
      sales: [],
    },
    { coin: "ETH", amount: 2, lots: [], watches: [], sales: [] },
  ],
  "roundtrip (manual part + several watched addresses)",
);

/* ── recorded sales ─────────────────────────────────────────────────────── */

// A sale keeps the basis it consumed *and* which lots it came from: the lots
// are gone afterwards, so neither can be recomputed later.
run(
  `savePortfolioToStorage([{ coin: "BTC", amount: 0.5, lots: [], watches: [], sales: [` +
    `{ amount: 0.5, received: 45000, basis: 15000, basisAmount: 0.5, time: 1700000000,` +
    ` matched: [{ amount: 0.5, cost: 15000, acquired: 1600000000, source: "manual" }] }` +
    `] }])`,
);
const sale = json("loadPortfolioFromStorage()")[0].sales[0];
assert.deepStrictEqual(
  sale,
  {
    amount: 0.5, received: 45000, basis: 15000, basisAmount: 0.5,
    matched: [{ amount: 0.5, cost: 15000, acquired: 1600000000, source: "manual" }],
    time: 1700000000,
  },
  "a sale round-trips with the lots it consumed",
);

// basisAmount can never exceed what was sold, whatever the stored value claims
run(
  `savePortfolioToStorage([{ coin: "BTC", amount: 0, lots: [], watches: [], sales: [` +
    `{ amount: 1, received: 100, basis: 50, basisAmount: 99 }] }])`,
);
assert.strictEqual(
  json("loadPortfolioFromStorage()")[0].sales[0].basisAmount,
  1,
  "basisAmount is capped at the amount sold",
);

// Junk sales are dropped rather than repaired into a bogus disposal
run(
  `savePortfolioToStorage([{ coin: "BTC", amount: 0, lots: [], watches: [], sales: [` +
    `null, {}, { amount: -1, received: 5 }, { amount: 1, received: -5 }] }])`,
);
assert.deepStrictEqual(
  json("loadPortfolioFromStorage()")[0].sales,
  [],
  "invalid sales are dropped",
);

// Legacy single-address holding migrates into one watch entry
store["crypto_chart_portfolio"] = JSON.stringify([
  { coin: "BTC", amount: 0.5, address: BTC_ADDR, lots: [{ amount: 0.5, paid: 9000, time: 5, source: "chain" }] },
]);
assert.deepStrictEqual(
  json("loadPortfolioFromStorage()"),
  [
    {
      coin: "BTC",
      amount: 0,
      lots: [],
      watches: [
        {
          address: BTC_ADDR,
          amount: 0.5,
          lots: [{ amount: 0.5, paid: 9000, time: 5, source: "chain" }],
        },
      ],
      sales: [],
    },
  ],
  "legacy address holding migrates to a watch entry",
);

// Bad watch entries are dropped without harming the holding
assert.deepStrictEqual(
  json(
    'sanitizePortfolio([{ coin: "BTC", amount: 1, watches: [' +
      `{ address: "${BTC_ADDR}", amount: 2 },` +
      `{ address: "${BTC_ADDR}", amount: 3 },` + // duplicate address → dropped
      '{ address: "junk!!", amount: 1 },' + // bad shape → dropped
      `{ address: "${BTC_ADDR2}", amount: -1 },` + // negative → dropped
      "] }," +
      `{ coin: "SOL", amount: 1, watches: [{ address: "${BTC_ADDR}", amount: 1 }] }` + // unsupported chain → no watches
      "])",
  ),
  [
    {
      coin: "BTC",
      amount: 1,
      lots: [],
      watches: [{ address: BTC_ADDR, amount: 2, lots: [] }],
      sales: [],
    },
    { coin: "SOL", amount: 1, lots: [], watches: [], sales: [] },
  ],
  "watch entries validated per chain, duplicates and junk dropped",
);

// Totals combine every source
sandbox.__multi = {
  coin: "BTC",
  amount: 0.5,
  lots: [{ amount: 0.5, paid: 7000, time: 0, source: "manual" }],
  watches: [
    { address: BTC_ADDR, amount: 1.25, lots: [{ amount: 1.25, paid: 9000, time: 1, source: "chain" }] },
  ],
};
assert.strictEqual(run("holdingAmount(__multi)"), 1.75, "holding amount = manual + watches");
assert.strictEqual(run("holdingLots(__multi).length"), 2, "holding lots = manual + watch lots");
assert.strictEqual(run("lotsBasis(holdingLots(__multi))"), 16000, "combined basis");

store["crypto_chart_portfolio"] = "{not json";
assert.deepStrictEqual(json("loadPortfolioFromStorage()"), [], "corrupt JSON → []");

store["crypto_chart_portfolio"] = JSON.stringify({ coin: "BTC", amount: 1 });
assert.deepStrictEqual(json("loadPortfolioFromStorage()"), [], "non-array → []");

// malformed entries are dropped, valid ones survive; a legacy `paid` total
// converts into a single manual lot
store["crypto_chart_portfolio"] = JSON.stringify([
  { coin: "eth", amount: "2", paid: "1500" }, // legacy paid → one lot
  { coin: "BTC", amount: 1, paid: -50 },      // negative paid → no lots
  { coin: "BTC", amount: 3 },                 // duplicate → dropped
  { coin: "NOTACOIN", amount: 1 },            // not in SUGGESTED_COINS → dropped
  { coin: "LTC", amount: -5 },                // negative amount → dropped
  { coin: "XRP", amount: "abc" },             // NaN → dropped
  { coin: "SOL" },                            // missing amount → dropped
  null,                                       // junk → dropped
  "BTC",                                      // junk → dropped
  { coin: "ADA", amount: 0, paid: "junk" },   // zero amount ok; junk paid → no lots
]);
assert.deepStrictEqual(
  json("loadPortfolioFromStorage()"),
  [
    { coin: "ETH", amount: 2, lots: [{ amount: 2, paid: 1500, time: 0, source: "manual" }], watches: [], sales: [] },
    { coin: "BTC", amount: 1, lots: [], watches: [], sales: [] },
    { coin: "ADA", amount: 0, lots: [], watches: [], sales: [] },
  ],
  "malformed entries dropped, coins normalized/deduped, legacy paid migrated",
);

// lot-level junk is dropped without killing the holding
assert.deepStrictEqual(
  json(
    'sanitizePortfolio([{ coin: "SOL", amount: 3, lots: [' +
      '{ amount: 1, paid: 50, time: 1700000000 },' +
      '{ amount: 0, paid: 50 },' + // zero amount → dropped
      '{ amount: 1, paid: -5 },' + // negative paid → dropped
      '{ amount: "x", paid: 5 },' + // NaN → dropped
      "null" +
      "] }])",
  ),
  [
    {
      coin: "SOL",
      amount: 3,
      lots: [{ amount: 1, paid: 50, time: 1700000000, source: "manual" }],
      watches: [],
      sales: [],
    },
  ],
  "import sanitizer: bad lots dropped, holding kept",
);
assert.deepStrictEqual(json('sanitizePortfolio("junk")'), [], "import sanitizer: non-array → []");

// Tokens are watchable too — the address is an Ethereum one, and the
// balance comes from the token's own contract
assert.deepStrictEqual(
  json(
    'sanitizePortfolio([{ coin: "LINK", amount: 0, watches: [{ address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", amount: 12 }] }])',
  ),
  [
    {
      coin: "LINK",
      amount: 0,
      lots: [],
      watches: [
        { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", amount: 12, lots: [] },
      ],
      sales: [],
    },
  ],
  "an ERC-20 token can be watched on an Ethereum address",
);

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
    { coin: "ETH", amount: 0, lots: [], watches: [{ address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", amount: 1, lots: [] }], sales: [] },
    { coin: "SOL", amount: 1, lots: [], watches: [], sales: [] },
    { coin: "BTC", amount: 1, lots: [], watches: [], sales: [] },
  ],
  "legacy addresses migrate per chain; junk cleared",
);

/* ── an address says which chain it is on ───────────────────────────────────
 * The watch flow takes an address and nothing else, so this is what decides
 * where to look. Real addresses from each chain, including the shapes that
 * overlap between them.
 */
const detects = (addr) => run(`detectAddressChain(${JSON.stringify(addr)})`);

assert.strictEqual(detects("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"), "ETH", "ethereum");
assert.strictEqual(detects("0XD8DA6BF26964AF9D7EED9E03E53415D37AA96045"), "ETH", "case-insensitive hex");
assert.strictEqual(detects(BTC_ADDR), "BTC", "bitcoin legacy");
assert.strictEqual(detects(BTC_ADDR2), "BTC", "bitcoin bech32");
assert.strictEqual(detects("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"), "BTC", "P2SH reads as bitcoin");
assert.strictEqual(detects("LQTpS3VaYTjCr4s9Y1t5zbeY26zevf7Fb3"), "LTC", "litecoin legacy");
assert.strictEqual(detects("MQMcJhpWHYVeQArcZR3sBgyPZxxRtnH441"), "LTC", "litecoin P2SH");
assert.strictEqual(detects("ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"), "LTC", "litecoin bech32");
assert.strictEqual(detects("DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L"), "DOGE", "dogecoin");
assert.strictEqual(
  detects("qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy"),
  "BCH",
  "bitcoin cash cashaddr",
);
assert.strictEqual(
  detects("bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy"),
  "BCH",
  "cashaddr with its prefix",
);
assert.strictEqual(detects("t1RwbKsv8dcVZTiKt5AzdWzWpqBJ9MRSJVt"), "ZEC", "zcash transparent");

// Whitespace is a paste artefact, not an error
assert.strictEqual(detects("  " + BTC_ADDR + "  "), "BTC", "surrounding whitespace ignored");

// Anything we can't place is refused rather than guessed at
assert.strictEqual(detects("0xnothex"), null, "malformed hex");
assert.strictEqual(detects("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA960"), null, "short ethereum address");
assert.strictEqual(detects("not an address"), null, "prose");
assert.strictEqual(detects(""), null, "empty");
assert.strictEqual(detects(null), null, "missing");
// A Monero address is watchable nowhere — its balances aren't public
assert.strictEqual(
  detects("48jewbtxe4jU2owyGLtsgr1Jbn6xGnPTFPtYPS8bpDdiVJMqgKQPHtNAsUnGqbGnQhrDDMhqLpDCC1QMTUYWG1VXTMEyGKF"),
  null,
  "monero address not claimed by any watchable chain",
);

/* ── lot math: FIFO reduction + chain-delta replay ──────────────────────── */

sandbox.__lots = [
  { amount: 1, paid: 100, time: 1, source: "chain" },
  { amount: 2, paid: 400, time: 2, source: "chain" },
];
assert.deepStrictEqual(
  json("reduceLotsFifo(__lots, 1.5)"),
  [{ amount: 1.5, paid: 300, time: 2, source: "chain" }],
  "FIFO: oldest lot consumed, next shrunk proportionally",
);
assert.deepStrictEqual(json("reduceLotsFifo(__lots, 5)"), [], "FIFO: over-consumption empties");
assert.strictEqual(run("lotsBasis(__lots)"), 500, "basis = Σ paid");
assert.strictEqual(run("lotsAmount(__lots)"), 3, "lot amount = Σ amount");

// replay: two buys at their dates' prices, then a spend consuming the oldest
sandbox.__deltas = [
  { time: 100, delta: 1 },
  { time: 200, delta: 1 },
  { time: 300, delta: -0.5 },
];
sandbox.__priceAt = (t) => (t === 100 ? 10 : t === 200 ? 20 : 999);
assert.deepStrictEqual(
  json("buildLotsFromDeltas(__deltas, __priceAt)"),
  [
    { amount: 0.5, paid: 5, time: 100, source: "chain" },
    { amount: 1, paid: 20, time: 200, source: "chain" },
  ],
  "chain replay: buys priced at their dates, spend consumes oldest first",
);
sandbox.__noPrices = (t) => null;
assert.deepStrictEqual(
  json("buildLotsFromDeltas([{ time: 5, delta: 2 }], __noPrices)"),
  [{ amount: 2, paid: 0, time: 5, source: "chain" }],
  "chain replay: unknown price → 0-paid lot, amount still tracked",
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

/* ── buildPortfolioParts ────────────────────────────────────────────────── */
// The per-coin values used to be summed and thrown away. They are what the
// expanded chart stacks, so they have to line up with the total index for
// index — a band that is off by one is a band drawn on the wrong day.

const parts = (histories, holdings) => {
  sandbox.__histories = histories;
  sandbox.__holdings = holdings;
  return json("buildPortfolioParts(__histories, __holdings)");
};

{
  const built = parts(
    {
      BTC: [{ price: 100, time: 1 }, { price: 110, time: 2 }],
      ETH: [{ price: 10, time: 1 }, { price: 20, time: 2 }],
    },
    [{ coin: "BTC", amount: 2 }, { coin: "ETH", amount: 3 }],
  );
  assert.deepStrictEqual(
    built.series,
    [{ price: 230, time: 1 }, { price: 280, time: 2 }],
    "parts still produce the same total",
  );
  assert.deepStrictEqual(
    built.parts,
    [
      { coin: "BTC", values: [200, 220] },
      { coin: "ETH", values: [30, 60] },
    ],
    "one value series per coin, index-aligned with the total",
  );
  built.parts.forEach((p) =>
    assert.strictEqual(
      p.values.length,
      built.series.length,
      `${p.coin} has one value per point`,
    ),
  );
  // Every point: the bands add up to the line drawn over them
  built.series.forEach((pt, i) =>
    assert.strictEqual(
      built.parts.reduce((sum, p) => sum + p.values[i], 0),
      pt.price,
      "bands sum to the total",
    ),
  );
}

{
  // Biggest last-value first — the order the stack and the legend both want,
  // and the reason a coin's colour doesn't change when two of them swap
  const built = parts(
    {
      BTC: [{ price: 1, time: 1 }, { price: 1, time: 2 }],
      ETH: [{ price: 1, time: 1 }, { price: 9, time: 2 }],
    },
    [{ coin: "BTC", amount: 1 }, { coin: "ETH", amount: 1 }],
  );
  assert.deepStrictEqual(
    built.parts.map((p) => p.coin),
    ["ETH", "BTC"],
    "sorted by what each is worth now, biggest first",
  );
}

{
  // Trimming applies to the parts as well, or a young coin's band would be
  // drawn against days it did not exist for
  const built = parts(
    {
      BTC: [{ price: 1, time: 1 }, { price: 2, time: 2 }, { price: 3, time: 3 }],
      ETH: [{ price: 10, time: 2 }, { price: 20, time: 3 }],
    },
    [{ coin: "BTC", amount: 1 }, { coin: "ETH", amount: 1 }],
  );
  assert.strictEqual(built.series.length, 2, "trimmed to the shortest");
  built.parts.forEach((p) =>
    assert.strictEqual(p.values.length, 2, `${p.coin} trimmed with it`),
  );
}

assert.strictEqual(parts({}, []), null, "nothing held → nothing to stack");

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
  {
    coin: "BTC",
    amount: 0.5,
    lots: [
      { amount: 0.25, paid: 7000, time: 1709596800, source: "manual" }, // 2024-03-05
      { amount: 0.25, paid: 8000, time: 0, source: "chain" },
    ],
    price: 40000,
    value: 20000,
  },
  { coin: "ETH", amount: 2, lots: [], price: 1500, value: 3000 }, // no lots → no P/L cells
  { coin: "SOL", amount: 1, lots: [{ amount: 1, paid: 50, time: 0, source: "manual" }], price: null, value: null }, // unpriced → skipped in totals
];
const csv = run('buildPortfolioCsv(__csvRows, "USD")');
const csvLines = csv.split("\n");

/* Asserted on content, not line numbers. The old version pinned rows to
 * indices (`csvLines[7] === "Purchase lots"`), which broke the moment the
 * header grew a summary block — a brittle failure that says nothing about
 * what actually regressed. */
const csvLine = (prefix) => csvLines.find((l) => l.startsWith(prefix));
const csvLineOf = (text, prefix) =>
  text.split("\n").find((l) => l.startsWith(prefix));
const csvHas = (needle) => csv.includes(needle);

// The file says what it is, and what it is not
assert.ok(csvHas("cost basis report"), "csv: named a cost basis report");
assert.ok(
  csvHas("not the return itself"),
  "csv: says it is the record a return is worked out from, not a return",
);
assert.ok(csvHas("no exchange history"), "csv: states what it cannot know");
assert.ok(csvHas("Nothing here is tax advice"), "csv: disclaimer present");
assert.ok(csvHas("All amounts in USD"), "csv: currency stated");
assert.ok(csvHas("FIFO"), "csv: cost-basis method stated");

// Summary block
assert.strictEqual(csvLine("Portfolio value,"), "Portfolio value,23000", "csv: portfolio value");
assert.strictEqual(csvLine("Cost basis (logged"), "Cost basis (logged purchases),15000", "csv: total basis");
assert.strictEqual(csvLine("Unrealized P/L,"), "Unrealized P/L,5000", "csv: unrealized total");

// Per-coin table
assert.ok(
  csvLine("Coin,Name,Amount held,").includes("Amount without cost"),
  "csv: per-coin header names the uncovered amount",
);
assert.strictEqual(
  csvLine("BTC,Bitcoin,"),
  "BTC,Bitcoin,0.5,0.5,,15000,30000,40000,20000,5000,33.33",
  "csv: per-coin row (basis, avg cost, P/L)",
);
assert.strictEqual(
  csvLine("ETH,Ethereum,"),
  "ETH,Ethereum,2,,2,,,1500,3000,,",
  "csv: a holding with no logged purchase reports its uncovered amount",
);
assert.strictEqual(csvLine("Total,"), "Total,,,,,15000,,,20000,5000,33.33", "csv: totals");

// Purchase lots, now carrying holding period and term
assert.ok(csvHas("Purchase lots"), "csv: lots section present");
assert.ok(
  csvLine("Coin,Date acquired,Amount,Paid,").includes("Days held,Term,Source"),
  "csv: lot header carries the holding period and term",
);
const btcLot = csvLines.find((l) => l.startsWith("BTC,2024-03-05,"));
assert.ok(btcLot, "csv: dated manual lot line");
assert.ok(btcLot.endsWith(",long,manual"), "csv: an old lot is long term");
const chainLot = csvLines.find((l) => l.includes("chain (estimated)"));
assert.ok(chainLot.startsWith("BTC,,"), "csv: an undated lot leaves the date empty");
assert.ok(chainLot.includes(",unknown,"), "csv: no date means no holding period");

// commas/quotes in names can't break the format
sandbox.__csvEsc = [{ coin: "BTC", amount: 1, lots: [], price: 1, value: 1 }];
run('COIN_NAMES.BTC = \'Bit"coin, the first\'');
assert.ok(
  run('buildPortfolioCsv(__csvEsc, "USD")').includes('"Bit""coin, the first"'),
  "csv: names with commas/quotes escaped",
);
run('COIN_NAMES.BTC = "Bitcoin"');

/* ── disposals ──────────────────────────────────────────────────────────── */

// A sale becomes one line per purchase it consumed — the shape a tax form
// asks for — and the proceeds still add up to what was received.
sandbox.__saleRows = [{
  coin: "BTC", amount: 0, price: 40000, value: 0, lots: [],
  sales: [{
    amount: 1, received: 40000, basis: 15000, basisAmount: 1, time: 1709596800,
    matched: [
      { amount: 0.4, cost: 5000, acquired: 1609459200, source: "manual" },
      { amount: 0.6, cost: 10000, acquired: 1704067200, source: "manual" },
    ],
  }],
}];
const saleCsv = run('buildPortfolioCsv(__saleRows, "USD")');
const saleLines = saleCsv.split("\n").filter((l) => l.startsWith("BTC,2"));
assert.strictEqual(saleLines.length, 2, "csv: one line per purchase consumed");
assert.ok(
  saleCsv.includes("Coin,Date acquired,Date sold,Amount,Proceeds,Cost basis,Gain"),
  "csv: disposals header pairs acquisition with disposal",
);
const proceeds = saleLines.reduce((a, l) => a + Number(l.split(",")[4]), 0);
assert.strictEqual(proceeds, 40000, "csv: split proceeds add up to what was received");
assert.strictEqual(
  csvLineOf(saleCsv, "Realized P/L (recorded"),
  "Realized P/L (recorded sales),25000",
  "csv: realized total in the summary",
);

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
