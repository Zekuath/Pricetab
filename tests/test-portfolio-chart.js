// Portfolio chart: the parts of it that can be decided without a browser —
// which sample a moment lands on, how events are grouped into markers, which
// coins get a band, and the geometry the whole drawing is scaled to.
//
// The pixels themselves are checked in tests/test-portfolio-chart-render.js,
// which loads the real page in Chromium; this file is the arithmetic.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

/* ── sandbox ────────────────────────────────────────────────────────────── */

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

// Only what portfolio-chart.js touches while it is being loaded, plus the
// handful of shared helpers its methods call.
const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Number, String, Boolean,
  Proxy, RegExp, Error, isFinite, isNaN, parseFloat, parseInt,
  setTimeout, clearTimeout,
  styled: styledStub,
  keyframes: tagged("keyframes"),
  css: tagged("css"),
  /* Defined in theme.js, which these sandboxes do not load. Anything
   * interpolated into a styled block by every file has to be stubbed
   * here too, or the file throws before a single assertion runs. */
  themedScrollbar: "",
  withTheme: (c) => c,
  React: { createElement: (...args) => ({ args }), Fragment: Symbol("Fragment") },
  Component: class { constructor(p) { this.props = p; } setState() {} },
  createRef: () => ({ current: null }),
  Fragment: Symbol("Fragment"),
  debounce: (fn) => Object.assign((...a) => fn(...a), { cancel() {} }),
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  window: { addEventListener() {}, removeEventListener() {} },
  // d3-selection sniffs `document.documentElement` for a mouseenter quirk as
  // it loads, so the stub needs one even though nothing here selects anything
  document: {
    addEventListener() {},
    removeEventListener() {},
    documentElement: {},
  },
  lightColors: { bg: "#ffffff" },
  getCurrencySymbol: () => "$",
  crosshairDate: (t) => new Date(+t).toISOString().slice(0, 10),
  formatAxisPrice: (v) => `$${v}`,
};
vm.createContext(sandbox);

/* The real d3, not a stub. Everything asserted below is arithmetic done by
 * the scales — a chain stub that swallowed it would make any scaling bug
 * pass. The bundle is a UMD and finds no `module` here, so it attaches itself
 * to `d3` on the context the way it does on a page. */
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "vendor", "d3-custom.min.js"), "utf8"),
  sandbox,
  { filename: "d3-custom.min.js" },
);
for (const name of ["scaleLinear", "scaleTime", "extent", "select", "line"]) {
  sandbox[name] = sandbox.d3[name];
}

const src = path.join(__dirname, "..", "src", "portfolio-chart.js");
vm.runInContext(fs.readFileSync(src, "utf8"), sandbox, { filename: "portfolio-chart.js" });
const run = (code) => vm.runInContext(code, sandbox);

const DARK = {
  color: {
    bg: "#000000",
    text: "#ffffff",
    textSecondary: "#a0a0a0",
    border: "rgba(255,255,255,0.12)",
    chartLineGreen: "#34d399",
    chartLineRed: "#f87171",
    shadow: "rgba(0,0,0,0.5)",
  },
  font: { primary: "mono" },
};

const make = (props) => {
  const Chart = run("PortfolioChartBase");
  const c = new Chart(Object.assign({ theme: DARK }, props));
  // The real constructor runs under React; here it is called directly, so the
  // fields it sets are already in place. Only the measured box is missing.
  c.state = Object.assign({}, c.state, { w: 600, h: 300 });
  return c;
};

/* ── which sample a moment lands on ─────────────────────────────────────── */
// The nearest one, never an interpolation: the series is what was fetched.

{
  const at = run("seriesIndexAt");
  const s = [
    { price: 1, time: 1000 },
    { price: 2, time: 2000 },
    { price: 3, time: 3000 },
  ];
  assert.strictEqual(at(s, 0), 0, "before the start clamps to the first");
  assert.strictEqual(at(s, 1000), 0, "exactly on a sample");
  assert.strictEqual(at(s, 1400), 0, "rounds down when nearer the earlier one");
  assert.strictEqual(at(s, 1600), 1, "…and up when nearer the later one");
  assert.strictEqual(at(s, 99999), 2, "past the end clamps to the last");
  assert.strictEqual(at([], 1), -1, "no series, no index");
}

/* ── markers ────────────────────────────────────────────────────────────── */
// Four purchases in one week on a year range are four triangles inside eight
// pixels. Grouping keeps every one of them — a chart must never quietly edit
// your history — and says how many are in the pile.

{
  const cluster = run("clusterEvents");
  const x = (d) => +d / 1000; // 1px per second, so the maths is readable
  const ev = (time, kind) => ({ time, kind, coin: "BTC", amount: 1, cash: 10 });

  const spread = cluster([ev(0, "buy"), ev(100000, "buy")], x, 16);
  assert.strictEqual(spread.length, 2, "100px apart is two markers");

  const tight = cluster([ev(0, "buy"), ev(5000, "buy"), ev(9000, "buy")], x, 16);
  assert.strictEqual(tight.length, 1, "9px apart is one marker");
  assert.strictEqual(tight[0].items.length, 3, "and it still holds all three");
  assert.strictEqual(tight[0].x, 9, "sitting at the latest of them");

  const mixed = cluster([ev(0, "buy"), ev(4000, "sell")], x, 16);
  assert.strictEqual(mixed[0].kind, "both", "a buy and a sale together is both");

  // Nothing is dropped, whatever the grouping does
  const many = [0, 1000, 2000, 3000, 80000, 81000].map((t) => ev(t, "buy"));
  const grouped = cluster(many, x, 16);
  assert.strictEqual(
    grouped.reduce((n, c) => n + c.items.length, 0),
    many.length,
    "every event survives grouping",
  );
}

/* ── bands ──────────────────────────────────────────────────────────────── */
// Six named hues and one "Other": past about seven classes adjacent bands stop
// being tellable apart, so a seventh coin folds in rather than taking a hue
// back off the third.

{
  const part = (coin, v) => ({ coin, values: [v, v] });
  const nine = make({
    parts: [
      part("BTC", 9), part("ETH", 8), part("SOL", 7), part("XRP", 6),
      part("LTC", 5), part("ADA", 4), part("DOGE", 3), part("LINK", 2),
      part("DOT", 1),
    ],
  });
  const bands = nine.bands();
  assert.strictEqual(bands.length, 7, "six named bands plus Other");
  assert.deepStrictEqual(
    bands.map((b) => b.coin),
    ["BTC", "ETH", "SOL", "XRP", "LTC", "ADA", "Other"],
    "the six biggest keep their names",
  );
  assert.strictEqual(bands[6].count, 3, "Other says how many it covers");
  assert.deepStrictEqual(bands[6].values, [6, 6], "…and is worth their sum");
  const hues = new Set(bands.slice(0, 6).map((b) => b.color));
  assert.strictEqual(hues.size, 6, "no hue is used twice");

  // A seventh coin on its own is not "Other (1)" — it has a name, so it uses
  // it; only a pile needs a collective noun
  const seven = make({
    parts: [
      part("BTC", 9), part("ETH", 8), part("SOL", 7), part("XRP", 6),
      part("LTC", 5), part("ADA", 4), part("DOGE", 3),
    ],
  });
  assert.strictEqual(
    seven.bands()[6].coin,
    "DOGE",
    "a single leftover keeps its name",
  );
  assert.strictEqual(make({ parts: [] }).bands().length, 0, "nothing to band");
}

/* ── geometry ───────────────────────────────────────────────────────────── */

const series = (n, from, to) =>
  Array.from({ length: n }, (_, i) => ({
    price: from + ((to - from) * i) / (n - 1),
    time: new Date(1700000000000 + i * 86400000),
  }));

{
  // A line is read for its shape, so it gets the range it moved in…
  const line = make({ series: series(10, 1000, 2000), stacked: false });
  const geo = line.geometry();
  assert.ok(geo, "a line has geometry");
  assert.ok(geo.y.domain()[0] > 0, "the line's scale does not start at zero");
  assert.ok(geo.y.domain()[0] < 1000, "…but does clear the lowest point");
  assert.ok(geo.y.domain()[1] > 2000, "…and the highest");
  assert.strictEqual(geo.points.length, 10, "one point per sample");

  // …and a stack is read for its proportions, which are only true from zero
  const stack = make({ series: series(10, 1000, 2000), stacked: true });
  assert.strictEqual(stack.geometry().y.domain()[0], 0, "a stack starts at zero");
}

{
  // The cost level joins the scale when it is anywhere near, because where you
  // crossed into profit is the reason it is drawn at all
  const near = make({ series: series(10, 1000, 2000), costBasis: 900 });
  const g1 = near.geometry();
  assert.ok(g1.costY != null, "a nearby cost is drawn");
  assert.ok(g1.y.domain()[0] <= 900, "and the scale makes room for it");

  /* Far below a quiet range, it is not drawn at all rather than clamped to the
   * floor: a line pinned to the edge claims a crossing the window does not
   * contain, and making honest room for it would squash a hundred-dollar
   * window into a few pixels. */
  const far = make({ series: series(10, 10000, 10100), costBasis: 2000 });
  assert.strictEqual(far.geometry().costY, null, "an out-of-reach cost is not drawn");
  assert.strictEqual(far.geometry().cost, null, "…and reports no level");

  // …but a wide range can afford it: the test is what it costs the chart, not
  // how far away the number is
  const wide = make({ series: series(10, 1000, 2000), costBasis: 400 });
  assert.ok(wide.geometry().costY != null, "a wide window can make room");

  const none = make({ series: series(10, 1000, 2000), costBasis: 0 });
  assert.strictEqual(none.geometry().costY, null, "no basis, no line");
}

{
  // No box, no drawing — every caller has to survive the frame not being
  // measured yet, which is the state of the world on the first render
  const c = make({ series: series(10, 1, 2) });
  c.state = { w: 0, h: 0 };
  assert.strictEqual(c.geometry(), null, "unmeasured is not drawable");
  const short = make({ series: [{ price: 1, time: new Date(1) }] });
  assert.strictEqual(short.geometry(), null, "one point is not a chart");
  assert.strictEqual(make({}).geometry(), null, "no series at all");
}

{
  // The bands are stacked bottom-up, so the last one's top has to be the total
  const s = series(4, 100, 100);
  const c = make({
    series: s,
    stacked: true,
    parts: [
      { coin: "BTC", values: [60, 60, 60, 60] },
      { coin: "ETH", values: [40, 40, 40, 40] },
    ],
  });
  const geo = c.geometry();
  const total = geo.y(100);
  const btcTop = geo.y(60);
  assert.ok(btcTop > total, "the first band's top is below the roof");
  assert.ok(
    Math.abs(geo.y(60 + 40) - total) < 1e-9,
    "the two bands stack up to exactly the total",
  );
}

console.log("PORTFOLIO CHART TESTS OK");
