// Chart crosshair tests: the nearest-point binary search (the hot path that
// runs on every pointer move) and the date label formatting.
// Loads chart.js in a vm with stubbed React/styled/d3 — no DOM needed.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

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
const chain = () => {
  const o = new Proxy(function () { return o; }, {
    get: (t, p) => (p === Symbol.toPrimitive ? () => "" : () => o),
    apply: () => o,
  });
  return o;
};

const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number, String,
  Boolean, Symbol, Proxy, RegExp, Error, parseInt, parseFloat, isFinite, isNaN,
  setTimeout, clearTimeout, requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  styled: styledStub,
  keyframes: tagged("keyframes"),
  css: tagged("css"),
  React: {
    Component: class {},
    createElement: () => null,
    Fragment: Symbol("Fragment"),
  },
  PureComponent: class {},
  createRef: () => ({ current: null }),
  withTheme: (c) => c,
  // d3 bits chart.js touches at load time
  select: () => chain(),
  line: () => chain(),
  easeCubicOut: () => 0,
  interpolatePath: () => () => "",
  scaleLinear: () => chain(),
  scaleTime: () => chain(),
  extent: () => [0, 1],
  debounce: (fn) => fn,
  scalePrices: () => [],
  lineFromPrices: () => "",
  formatNumberString: (v) => String(v),
  derivePercentDelta: () => 0,
  deriveValueDelta: () => 0,
  window: { addEventListener: () => {}, removeEventListener: () => {} },
  // theme.js defines this helper in the shared global scope
  _defineProperty: (obj, key, value) => {
    obj[key] = value;
    return obj;
  },
  // api.js provides this at runtime; chart.js only calls it
  candleAt: () => ({
    time: 1000,
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: 1234,
  }),
};
vm.createContext(sandbox);
for (const f of ["config.js", "utils.js", "chart.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), sandbox, {
    filename: f,
  });
}
const run = (code) => vm.runInContext(code, sandbox);
const json = (code) => JSON.parse(JSON.stringify(run(code)));

/* ── nearestIndex ───────────────────────────────────────────────────────── */

// Scaled points carry pixel positions in `time`; list is ascending
sandbox.__pts = [0, 10, 20, 30, 40].map((x) => ({ time: x, price: 0 }));

assert.strictEqual(run("nearestIndex(__pts, 0)"), 0, "exact first point");
assert.strictEqual(run("nearestIndex(__pts, 40)"), 4, "exact last point");
assert.strictEqual(run("nearestIndex(__pts, 21)"), 2, "closest below");
assert.strictEqual(run("nearestIndex(__pts, 29)"), 3, "closest above");
assert.strictEqual(run("nearestIndex(__pts, 25)"), 2, "exact midpoint favours the earlier point");
assert.strictEqual(run("nearestIndex(__pts, -50)"), 0, "left of the chart clamps to first");
assert.strictEqual(run("nearestIndex(__pts, 999)"), 4, "right of the chart clamps to last");
assert.strictEqual(run("nearestIndex(__pts.slice(0, 2), 7)"), 1, "two-point series");

// Irregular spacing (real series aren't evenly spaced)
sandbox.__uneven = [0, 3, 4, 90, 91].map((x) => ({ time: x, price: 0 }));
assert.strictEqual(run("nearestIndex(__uneven, 40)"), 2, "big gap: nearer the left edge");
assert.strictEqual(run("nearestIndex(__uneven, 50)"), 3, "big gap: nearer the right edge");

// The search must agree with a brute-force scan across the whole width
const brute = (pts, x) => {
  let best = 0;
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i].time - x) < Math.abs(pts[best].time - x)) best = i;
  }
  return best;
};
const pts = [];
for (let i = 0; i < 300; i++) pts.push({ time: i * 7.3, price: 0 });
sandbox.__many = pts;
for (let x = -20; x < 2200; x += 3.7) {
  assert.strictEqual(
    run(`nearestIndex(__many, ${x})`),
    brute(pts, x),
    `binary search matches brute force at x=${x}`,
  );
}

/* ── crosshairDate ──────────────────────────────────────────────────────── */

const t = new Date("2024-03-05T14:30:00Z");
sandbox.__t = t;
const hourLabel = run('crosshairDate(__t, "hour")');
const monthLabel = run('crosshairDate(__t, "month")');
const allLabel = run('crosshairDate(__t, "all")');
assert.ok(/\d{1,2}:\d{2}/.test(hourLabel), "intraday label includes a clock time");
assert.ok(!/\d{1,2}:\d{2}/.test(monthLabel), "month label omits the clock");
assert.ok(!/2024/.test(monthLabel), "month label omits the year");
assert.ok(/2024/.test(allLabel), "all-time label includes the year");

// ISO strings (what the API returns) work as well as Date objects
assert.strictEqual(
  run('crosshairDate("2024-03-05T14:30:00Z", "month")'),
  monthLabel,
  "ISO string handled like a Date",
);
assert.strictEqual(run('crosshairDate("not a date", "day")'), "", "junk date → empty label");

/* ── volume formatting ──────────────────────────────────────────────────── */

assert.strictEqual(run("formatVolume(1570.6)"), "1.57K", "thousands");
assert.strictEqual(run("formatVolume(42444631703)"), "42.44B", "billions");
assert.strictEqual(run("formatVolume(2500000)"), "2.50M", "millions");
assert.strictEqual(run("formatVolume(12.5)"), "12.50", "small values keep 2 decimals");
assert.strictEqual(run("formatVolume(0.0123)"), "0.0123", "sub-1 values keep 4 decimals");
assert.strictEqual(run("formatVolume(-2500)"), "-2.50K", "negatives keep their sign");
assert.strictEqual(run("formatVolume('abc')"), "—", "junk shows a dash, not NaN");
assert.strictEqual(run("formatVolume()"), "—", "missing volume shows a dash");

/* ── the readout must fully disappear on leave ──────────────────────────────
 * Regression: the OHLC rows were marked visibility="visible". Because
 * visibility is an inherited property, a visible child stays on screen even
 * when its parent group is hidden — so the table lingered on the chart after
 * the cursor left. Nothing may be left visible after a leave.
 */

const fakeNode = () => ({
  attrs: {},
  textContent: "",
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  },
  getComputedTextLength() {
    return String(this.textContent).length * 6;
  },
});

const chart = run("new LineBase({})");
chart.props = {
  prices: [
    { price: 10, time: new Date(1000) },
    { price: 20, time: new Date(2000) },
  ],
  theme: {
    color: { text: "#fff", textSecondary: "#aaa", bg: "#000", bgSecondary: "#111", border: "#333" },
    font: { primary: "mono" },
  },
  period: "day",
  coin: "BTC",
  formatPrice: (v) => `$${v}`,
  ohlc: [{ time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 1234 }],
};
chart.scaled = [
  { time: 0, price: 10 },
  { time: 100, price: 20 },
];
chart.width = 200;
chart.height = 100;
chart.hoverX = 100;

const nodes = [];
const attach = (ref) => {
  ref.current = fakeNode();
  nodes.push(ref.current);
  return ref.current;
};
const g = attach(chart.hoverRef);
attach(chart.hoverLineRef);
attach(chart.hoverDotRef);
attach(chart.hoverBoxRef);
attach(chart.hoverPriceRef);
attach(chart.hoverDateRef);
chart.rowLabelRefs.forEach(attach);
chart.rowValueRefs.forEach(attach);

chart.drawCrosshair();
assert.strictEqual(g.attrs.visibility, "visible", "hovering shows the readout");
assert.strictEqual(
  chart.rowValueRefs[0].current.textContent,
  "$10",
  "open row filled from the candle",
);
assert.strictEqual(
  chart.rowValueRefs[4].current.textContent,
  "1.23K BTC",
  "volume row is compact and labelled with the coin",
);
// No descendant may claim visibility:visible — that is what defeated hiding
// (the group itself, nodes[0], is the thing being shown)
for (const n of nodes.slice(1)) {
  assert.notStrictEqual(
    n.attrs.visibility,
    "visible",
    "no row overrides the group's visibility while shown",
  );
}

chart.handlePointerLeave();
assert.strictEqual(g.attrs.visibility, "hidden", "leaving hides the group");
for (const n of nodes.slice(1)) {
  assert.ok(
    n.attrs.visibility === undefined ||
      n.attrs.visibility === "hidden" ||
      n.attrs.visibility === "inherit",
    "nothing is left explicitly visible after the pointer leaves",
  );
}

/* ── candlestick geometry ───────────────────────────────────────────────── */

const mkCandles = (rows) =>
  rows.map(([time, open, high, low, close, volume]) => ({
    time, open, high, low, close, volume,
  }));

// Aggregation: first open, last close, extreme high/low, summed volume
sandbox.__agg = mkCandles([
  [1, 10, 15, 8, 12, 100],
  [2, 12, 20, 11, 18, 200],
  [3, 18, 19, 5, 7, 300],
  [4, 7, 9, 6, 8, 400],
]);
assert.strictEqual(run("aggregateCandles(__agg, 10).length"), 4, "under the cap: untouched");
const agg = json("aggregateCandles(__agg, 2)");
assert.strictEqual(agg.length, 2, "reduced to the cap");
assert.deepStrictEqual(
  agg[0],
  { time: 1, open: 10, close: 18, high: 20, low: 8, volume: 300 },
  "bucket keeps first open, last close, extremes and summed volume",
);
assert.deepStrictEqual(json("aggregateCandles([], 5)"), [], "no candles → none");
assert.deepStrictEqual(json("aggregateCandles(null, 5)"), [], "missing candles → none");

// Scaling: y spans highs and lows so wicks stay inside the plot
sandbox.__sc = mkCandles([
  [1, 10, 20, 0, 15, 1],
  [2, 15, 30, 10, 12, 1],
]);
const sc = json("scaleCandles(__sc, 100, 200, 10)");
assert.strictEqual(sc.bars.length, 2, "one bar per candle");
assert.strictEqual(sc.bars[0].yLow, 90, "series low sits at the bottom of the plot");
assert.strictEqual(sc.bars[1].yHigh, 10, "series high sits at the top");
assert.ok(sc.bars[0].yHigh > 10 && sc.bars[0].yLow <= 90, "wicks stay within the plot");
assert.strictEqual(sc.bars[0].up, true, "close above open is an up bar");
assert.strictEqual(sc.bars[1].up, false, "close below open is a down bar");
assert.ok(sc.barW >= 1, "bars never thinner than a visible line");
assert.strictEqual(run("scaleCandles([], 100, 200, 10)"), null, "no candles → no geometry");

// A flat series must not divide by zero
const flat = json("scaleCandles([{ time: 1, open: 5, high: 5, low: 5, close: 5 }], 100, 200, 10)");
assert.ok(isFinite(flat.bars[0].yOpen), "flat range still produces finite geometry");

// Path data: one moveto pair per bar, and only that direction's bars
sandbox.__pd = json("scaleCandles(__sc, 100, 200, 10)");
const upD = run("candlePathData(__pd, true)");
const downD = run("candlePathData(__pd, false)");
assert.strictEqual((upD.match(/M/g) || []).length, 2, "up path: wick + body for its one bar");
assert.strictEqual((downD.match(/M/g) || []).length, 2, "down path: wick + body for its one bar");
assert.ok(!upD.includes("NaN") && !downD.includes("NaN"), "no NaN leaks into the path");
assert.strictEqual(run("candlePathData(null, true)"), "", "no geometry → empty path");

/* ── candle windows line up with their periods ──────────────────────────────
 * Each period must be divided into even candles that cover exactly that
 * window. The regression this locks in: Coinbase returns a fixed batch
 * regardless of what we ask, so a 1H chart drew ~6 hours of one-minute
 * candles until the fetcher started trimming to `points`.
 */

const WINDOW_SECONDS = {
  hour: 3600,
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
  year: 365 * 86400,
};

const coinbaseSpecs = json("OHLC_GRANULARITY");
for (const period of Object.keys(coinbaseSpecs)) {
  const { granularity, points } = coinbaseSpecs[period];
  const covered = granularity * points;
  const target = WINDOW_SECONDS[period];
  assert.ok(target, `${period} is a real period`);
  // Coinbase caps its response at ~350 candles, so a full year is as close
  // as the provider goes; everything else must land on the window
  const tolerance = period === "year" ? 0.05 : 0.005;
  assert.ok(
    Math.abs(covered - target) / target <= tolerance,
    `coinbase ${period}: ${points} × ${granularity}s = ${covered}s, expected ~${target}s`,
  );
}

const krakenSpecs = json("KRAKEN_PERIODS");
for (const period of Object.keys(WINDOW_SECONDS)) {
  const spec = krakenSpecs[period];
  assert.ok(spec, `kraken covers ${period}`);
  const covered = spec.interval * 60 * spec.points;
  assert.ok(
    Math.abs(covered - WINDOW_SECONDS[period]) / WINDOW_SECONDS[period] <= 0.005,
    `kraken ${period}: ${spec.points} × ${spec.interval}m = ${covered}s, expected ${WINDOW_SECONDS[period]}s`,
  );
}

// The hour is the one the eye checks: exactly 60 one-minute candles
assert.strictEqual(coinbaseSpecs.hour.points, 60, "1H is 60 candles");
assert.strictEqual(coinbaseSpecs.hour.granularity, 60, "each 1H candle is a minute");
assert.strictEqual(krakenSpecs.hour.points, 60, "1H is 60 candles on Kraken too");

console.log("CHART TESTS OK");
