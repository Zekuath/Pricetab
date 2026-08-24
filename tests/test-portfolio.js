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
  /* Defined in theme.js, which these sandboxes do not load. Anything
   * interpolated into a styled block by every file has to be stubbed
   * here too, or the file throws before a single assertion runs. */
  themedScrollbar: "",
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
/* `styles-portfolio.js` is loaded for the same reason `index.html` loads it
 * first: the donut constants and `bandInk` live there now, and `portfolio.js`
 * reads them at render. The styled blocks themselves are inert here. */
for (const f of ["config.js", "storage.js", "styles-portfolio.js", "portfolio.js"]) {
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

/* Reading a token and charting one are different questions, and the whitelist
 * used to answer only the second. stETH, wBETH, FDUSD and TUSD sit at plenty
 * of Ethereum addresses and are priced by the sweep the price bar already
 * makes, but neither Coinbase nor Kraken quotes a series for any of them — so
 * they are tokens you can hold and not coins you can chart. On
 * `SUGGESTED_COINS` alone they were found at the address, added, saved, and
 * dropped on the next tab open with nothing said, which is the worst shape a
 * data-loss bug can take: it happens while the tab is closed.
 *
 * Asserted through the sanitizer because that is the gate a reload goes
 * through — it is what runs on the way back out of localStorage. */
for (const coin of ["STETH", "WBETH", "FDUSD", "TUSD"]) {
  assert.ok(
    !run("SUGGESTED_COINS").includes(coin),
    `${coin} is deliberately not chartable — if it has become so, this case has stopped testing anything`,
  );
  assert.ok(run(`isWatchableCoin("${coin}")`), `${coin} is watchable`);
  assert.deepStrictEqual(
    json(`sanitizePortfolio([{ coin: "${coin}", amount: 2.5 }])`),
    [{ coin, amount: 2.5, lots: [], watches: [], sales: [] }],
    `a holding in ${coin} survives a save and reload`,
  );
}

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

const lotsBasisOf = (lots) => lots.reduce((sum, l) => sum + l.paid, 0);

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

// different lengths: the window is the overlap, so a young coin cannot
// fabricate a portfolio value from before it existed
assert.deepStrictEqual(
  series(
    {
      BTC: [{ price: 1, time: 1 }, { price: 2, time: 2 }, { price: 3, time: 3 }],
      ETH: [{ price: 10, time: 2 }, { price: 20, time: 3 }],
    },
    [{ coin: "BTC", amount: 1 }, { coin: "ETH", amount: 1 }],
  ),
  [{ price: 12, time: 2 }, { price: 23, time: 3 }],
  "window is the overlap",
);

/* ── series are aligned on time, never on position ──────────────────────────
 *
 * The defect this replaced: `period=all` spaces its points across each coin's
 * own lifetime, so two coins have different *rates*, and summing them by
 * index adds one coin's 2014 to another's 2023. Measured on the live API,
 * BTC's all-range points are 13.19 days apart and SUI's 3.64.
 *
 * Here BTC is quoted every 10 units from t=0 and ETH every 5 from t=20.
 * Aligned by position (trim to 3, tail of each) that produced
 * [102, 203, 304] at times 10/20/30 — a total at t=10 including an ETH that
 * had no price until t=20, dated from whichever holding came first in the
 * array. On time it can only be the overlap, 20–30, at the finest resolution
 * anything was actually quoted at.
 */
{
  const built = series(
    {
      BTC: [
        { price: 1, time: 0 },
        { price: 2, time: 10 },
        { price: 3, time: 20 },
        { price: 4, time: 30 },
      ],
      ETH: [
        { price: 100, time: 20 },
        { price: 200, time: 25 },
        { price: 300, time: 30 },
      ],
    },
    [{ coin: "BTC", amount: 1 }, { coin: "ETH", amount: 1 }],
  );
  assert.deepStrictEqual(
    built.map((p) => p.time),
    [20, 25, 30],
    "grid is the overlap at the densest series' own timestamps",
  );
  assert.deepStrictEqual(
    built.map((p) => p.price),
    [103, 203, 304],
    "each coin read at the moment, not at the position",
  );
  // t=25 is BTC's held price (3), not an interpolation toward 4: a price
  // between two quotes is a price nobody traded at
  assert.strictEqual(built[1].price - 200, 3, "sparse series holds its last quote");
}

/* The same failure from the other direction: identical point counts, so
 * position alignment looked right, but different windows. */
{
  const built = series(
    {
      BTC: [{ price: 1, time: 0 }, { price: 2, time: 100 }],
      ETH: [{ price: 10, time: 90 }, { price: 20, time: 100 }],
    },
    [{ coin: "BTC", amount: 1 }, { coin: "ETH", amount: 1 }],
  );
  assert.deepStrictEqual(
    built.map((p) => p.time),
    [90, 100],
    "equal lengths still align on time",
  );
  assert.deepStrictEqual(
    built.map((p) => p.price),
    [11, 22],
    "BTC held at 1 through t=90, not read as its t=0 self against ETH's t=90",
  );
}

// No overlap at all is not a chart — two holdings whose histories never share
// a moment cannot be summed, and inventing a window would be worse
assert.strictEqual(
  series(
    {
      BTC: [{ price: 1, time: 0 }, { price: 2, time: 10 }],
      ETH: [{ price: 10, time: 50 }, { price: 20, time: 60 }],
    },
    [{ coin: "BTC", amount: 1 }, { coin: "ETH", amount: 1 }],
  ),
  null,
  "disjoint histories → null",
);

/* ── the benchmark reads the same window ────────────────────────────────────
 * `benchmarkPct` is a component method, but the honesty lives in the helper
 * it now calls: the price at or before a moment, and null before the series
 * begins rather than a first price that is not the window's.
 */
{
  const bench = [
    { price: 10, time: 0 },
    { price: 20, time: 10 },
    { price: 40, time: 20 },
  ];
  sandbox.__bench = bench;
  assert.strictEqual(run("priceAtOrBefore(__bench, 10)"), 20, "exact moment");
  assert.strictEqual(run("priceAtOrBefore(__bench, 15)"), 20, "held between quotes");
  assert.strictEqual(run("priceAtOrBefore(__bench, 99)"), 40, "past the end holds");
  assert.strictEqual(
    run("priceAtOrBefore(__bench, -1)"),
    null,
    "before the series starts there is no honest price",
  );
}

/* ── which purchase a sale consumes ─────────────────────────────────────────
 *
 * A reporting method, not a computed liability — the part of "country-specific
 * tax computation" that can be offered honestly. The rule that matters is that
 * it **cannot apply backwards**: a recorded sale wrote down the lots it ate,
 * and those lots are gone.
 */
{
  // Three lots, deliberately in an order where all three methods differ:
  // oldest is cheapest, newest is middling, the dearest sits in between
  const lots = [
    { amount: 1, paid: 100, time: 1, source: "manual" }, // unit 100 · oldest
    { amount: 1, paid: 300, time: 2, source: "manual" }, // unit 300 · dearest
    { amount: 1, paid: 200, time: 3, source: "manual" }, // unit 200 · newest
  ];
  const eat = (method) => {
    sandbox.__lots = lots;
    return json(`consumeLots(__lots, 1, ${JSON.stringify(method)})`);
  };
  assert.strictEqual(eat("fifo").basis, 100, "FIFO eats the first one stored");
  assert.strictEqual(eat("lifo").basis, 200, "LIFO eats the last one stored");
  assert.strictEqual(eat("hifo").basis, 300, "HIFO eats the dearest");
  assert.strictEqual(
    eat(undefined).basis,
    100,
    "an unknown method is FIFO, not a crash and not a silent LIFO",
  );

  /* What is left comes back in **storage order**, whatever order it was eaten
   * in. The lot list on screen is a record of what was entered; re-ordering it
   * when the method changes would make the setting look like it had rewritten
   * history, which is the one thing it must never appear to do. */
  sandbox.__lots = lots;
  const left = json('reduceLots(__lots, 1, "hifo")');
  assert.deepStrictEqual(
    left.map((l) => l.paid),
    [100, 200],
    "HIFO removed the 300 and left the rest in the order they were stored",
  );

  // A partial bite shrinks one lot proportionally and keeps its place
  sandbox.__lots = [{ amount: 2, paid: 200, time: 1, source: "manual" }, ...lots.slice(1)];
  const part = json('reduceLots(__lots, 0.5, "fifo")');
  assert.strictEqual(part.length, 3, "a partial bite removes nothing");
  assert.strictEqual(Number(part[0].amount.toFixed(6)), 1.5, "…it shrinks the amount");
  assert.strictEqual(Number(part[0].paid.toFixed(6)), 150, "…and the cost with it");

  /* `heldLots` follows the chosen method, because nobody said which coins left
   * when an amount was reduced by hand — it is an assumption either way. */
  sandbox.__lots = lots;
  assert.strictEqual(
    lotsBasisOf(json("heldLots(__lots, 2, 'hifo')")),
    300,
    "under HIFO the dearest is the one assumed gone",
  );
  assert.strictEqual(
    lotsBasisOf(json("heldLots(__lots, 2, 'fifo')")),
    500,
    "under FIFO the oldest is",
  );
}

/* ── the worst fall ─────────────────────────────────────────────────────────
 * The one thing the algorithm research left standing: 59 of 64 rule × coin
 * pairs cut the drawdown, 28 of 64 beat holding. So this is the risk statement
 * that goes beside a portfolio, and there are no buy or sell points.
 */
{
  const dd = (prices) => {
    sandbox.__dd = prices.map((price, i) => ({ price, time: i }));
    return json("maxDrawdown(__dd)");
  };

  assert.strictEqual(
    dd([100, 110, 120]),
    null,
    "a series that only rose has no fall to report — not a 0% one",
  );
  const one = dd([100, 200, 100]);
  assert.strictEqual(Number(one.pct.toFixed(4)), -50, "half given back is −50%");
  assert.strictEqual(one.from, 1, "measured from the peak");
  assert.strictEqual(one.to, 2, "…to the low that followed it");

  /* Peak-to-trough, not first-to-last: a portfolio that recovers has still
   * had its fall, and that is the number worth knowing. */
  const back = dd([100, 200, 120, 260]);
  assert.strictEqual(Number(back.pct.toFixed(4)), -40, "a recovered fall still counts");

  // The deeper of two falls wins, even when the shallower one comes later
  const two = dd([100, 200, 100, 150, 120]);
  assert.strictEqual(Number(two.pct.toFixed(4)), -50, "the deepest fall, not the latest");

  // A later peak resets what the fall is measured against
  const rising = dd([100, 90, 300, 150]);
  assert.strictEqual(Number(rising.pct.toFixed(4)), -50, "measured from the highest peak before it");

  assert.strictEqual(dd([100]), null, "one point is not a window");
  assert.strictEqual(json("maxDrawdown(null)"), null, "no series → null");
}

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
  // The window applies to the parts as well, or a young coin's band would be
  // drawn against days it did not exist for
  const built = parts(
    {
      BTC: [{ price: 1, time: 1 }, { price: 2, time: 2 }, { price: 3, time: 3 }],
      ETH: [{ price: 10, time: 2 }, { price: 20, time: 3 }],
    },
    [{ coin: "BTC", amount: 1 }, { coin: "ETH", amount: 1 }],
  );
  assert.strictEqual(built.series.length, 2, "clipped to the overlap");
  built.parts.forEach((p) =>
    assert.strictEqual(p.values.length, 2, `${p.coin} clipped with it`),
  );
}

{
  // The bands are sampled on the same grid as the line, so they still sum to
  // it when the two coins are quoted at different rates
  const built = parts(
    {
      BTC: [
        { price: 1, time: 0 },
        { price: 2, time: 10 },
        { price: 3, time: 20 },
        { price: 4, time: 30 },
      ],
      ETH: [
        { price: 100, time: 20 },
        { price: 200, time: 25 },
        { price: 300, time: 30 },
      ],
    },
    [{ coin: "BTC", amount: 1 }, { coin: "ETH", amount: 1 }],
  );
  built.series.forEach((pt, i) =>
    assert.strictEqual(
      built.parts.reduce((sum, p) => sum + p.values[i], 0),
      pt.price,
      "bands sum to the total at a mixed sampling rate",
    ),
  );
  built.parts.forEach((p) =>
    assert.strictEqual(
      p.values.length,
      built.series.length,
      `${p.coin} has one value per point`,
    ),
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
/* Was `All amounts in USD`, and that was a false claim rather than a wording
 * choice: `paid` carried no currency, so a purchase entered in dollars was
 * summed as euros under a header saying they were all euros. */
assert.ok(csvHas("Totals are in USD"), "csv: currency of the totals stated");
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
assert.ok(btcLot.endsWith(",long,manual,"), "csv: an old lot is long term");
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

/* ── money entered in another currency ──────────────────────────────────────
 *
 * `paid` and `received` used to be bare numbers. Switching the display
 * currency re-read every one of them in the new one — a lot entered as 15,000
 * USD became 15,000 EUR — and the row P/L, the headline Unrealized, the
 * chart's COST line and this file's own header all repeated it. They carry
 * the currency they were entered in now, and anything wearing a different one
 * is reported rather than summed.
 */
{
  const rows = [
    {
      coin: "BTC",
      amount: 1,
      price: 40000,
      value: 40000,
      lots: [
        { amount: 0.5, paid: 10000, time: 1709596800, source: "manual", currency: "USD" },
        { amount: 0.5, paid: 9000, time: 1709596800, source: "manual", currency: "EUR" },
      ],
      sales: [],
    },
  ];
  sandbox.__mixRows = rows;
  const mix = run('buildPortfolioCsv(__mixRows, "USD")');
  const line = (p) => mix.split("\n").find((l) => l.startsWith(p));

  assert.strictEqual(
    line("Cost basis (logged"),
    "Cost basis (logged purchases),10000",
    "csv: only the lots in the file's own currency are summed",
  );
  assert.ok(
    mix.includes("were entered in a different currency"),
    "csv: the header says what it left out",
  );
  assert.ok(
    mix.includes("NOT in the totals"),
    "csv: and says plainly that they are not in the totals",
  );

  // Both lots are still listed — dropping a purchase from a tax record
  // because a display setting changed would be far worse
  const lotRows = mix.split("\n").filter((l) => /^BTC,20/.test(l));
  assert.strictEqual(lotRows.length, 2, "csv: every lot is listed whatever its currency");
  const eur = lotRows.find((l) => l.includes(",EUR,"));
  const usd = lotRows.find((l) => l.includes(",USD,"));
  assert.ok(eur && usd, "csv: each lot names the currency it was paid in");
  assert.ok(
    eur.endsWith(",not in totals"),
    "csv: the foreign lot is marked as excluded",
  );
  // A gain is a price minus a cost. Across two currencies there is no gain to
  // state, so the columns are empty rather than a subtraction that isn't one.
  assert.strictEqual(
    eur.split(",")[8],
    "",
    "csv: no gain is computed across two currencies",
  );
  assert.ok(usd.split(",")[8] !== "", "csv: the matching lot still has its gain");
}

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

  /* ADDRESSES — telling the four failures apart is the feature.
   *
   * Every one of these used to arrive as the same sentence: "check it, or it
   * may hold no balance we can read". For a good Solana address that is wrong
   * twice — nothing to check, and the balance is not the problem. */
  {
    const ours = (a) => run(`detectAddressChain(normalizeWatchAddress(${JSON.stringify(a)}))`);
    const foreign = (a) => run(`detectForeignChain(${JSON.stringify(a)})`);

    // Chains PriceTab reads claim their own addresses first
    assert.strictEqual(ours("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"), "BTC");
    assert.strictEqual(ours("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"), "BTC");
    assert.strictEqual(ours("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"), "ETH");
    assert.strictEqual(ours("LQ3NBFhsLoBs9pyN9KX8Cf1kzTFuoWQ6r7"), "LTC");
    assert.strictEqual(ours("DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L"), "DOGE");
    assert.strictEqual(ours("t1KjSaAyGqmDMbxdcYUSbYCUCJUDvKGnGCP"), "ZEC");

    /* A `bitcoincash:` prefix is what most Bitcoin Cash wallets put on the
     * clipboard. It matched the chain pattern and was then thrown out by
     * `WATCH_ADDRESS_RE`, which is alphanumeric-only — so a correct address
     * was refused as if it were nonsense. */
    const cash = "bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a";
    assert.strictEqual(ours(cash), "BCH", "a prefixed cashaddr finds its chain");
    assert.strictEqual(
      run(`WATCH_ADDRESS_RE.test(normalizeWatchAddress(${JSON.stringify(cash)}))`),
      true,
      "…and survives the shape check once the prefix is off",
    );

    // Chains it cannot read are named rather than blamed
    for (const [addr, name] of [
      ["5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", "Solana"],
      ["TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "TRON"],
      ["rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH", "XRP"],
      ["GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "Stellar"],
      ["XdAUmwtig27HBG6WfYyHAzP8n6XCbBmiav", "Dash"],
      [
        "44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A",
        "Monero",
      ],
    ]) {
      assert.strictEqual(foreign(addr), name, `${name} is named, not rejected`);
      assert.strictEqual(ours(addr), null, `…and is not mistaken for one of ours`);
    }

    /* The dangerous direction: a chain we DO read must never be claimed by the
     * foreign list, or a working address would start reporting the wrong chain
     * back at the person holding it. */
    for (const addr of [
      "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "LQ3NBFhsLoBs9pyN9KX8Cf1kzTFuoWQ6r7",
      "DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L",
      "t1KjSaAyGqmDMbxdcYUSbYCUCJUDvKGnGCP",
      cash,
    ]) {
      assert.strictEqual(foreign(addr), null, `${addr.slice(0, 10)}… stays ours`);
    }

    // Nonsense is nonsense, and says so rather than naming a chain
    assert.strictEqual(foreign("hello there friend"), null);
    assert.strictEqual(ours("hello there friend"), null);

    /* Every token is holdable and every one has a name — the search matches on
     * names as well as symbols, so a token without one can only be found by
     * typing its ticker exactly. Four had been in the table for three days
     * with no name at all. */
    const tokens = Object.keys(json("ERC20_TOKENS"));
    const names = json("COIN_NAMES");
    const holdable = new Set(json("HOLDABLE_COINS"));
    for (const t of tokens) {
      assert.ok(holdable.has(t), `${t} is offered as a holding`);
      assert.ok(names[t], `${t} has a name to search by`);
    }
  }

  console.log("PORTFOLIO TESTS OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
