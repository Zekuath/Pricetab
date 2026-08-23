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
  /* Defined in theme.js, which these sandboxes do not load. Anything
   * interpolated into a styled block by every file has to be stubbed
   * here too, or the file throws before a single assertion runs. */
  themedScrollbar: "",
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
  // A real linear scale, not a chain stub: the comparison tests below assert
  // pixel positions, and a stub that swallows arithmetic would make any
  // scaling bug pass
  scaleLinear: () => {
    let domain = [0, 1];
    let range = [0, 1];
    const fn = (v) =>
      domain[1] === domain[0]
        ? range[0]
        : range[0] +
          ((v - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0]);
    fn.domain = (d) => (d ? ((domain = d), fn) : domain);
    fn.range = (r) => (r ? ((range = r), fn) : range);
    return fn;
  },
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
attach(chart.hoverDotBRef);
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

/* Density cap: a thin market doesn't trade every interval, and an empty
 * candle (open = high = low = close) draws as a dash. XMR's hour was two
 * thirds of those, which read as a broken chart rather than a quiet hour. */
const withVol = (rows) =>
  rows.map(([time, o, h, l, c, v]) => ({ time, open: o, high: h, low: l, close: c, volume: v }));

// Dense data is left alone
sandbox.__dense = withVol(
  Array.from({ length: 30 }, (_, i) => [i, 10, 12, 9, 11, 5]),
);
assert.strictEqual(run("candleDensityCap(__dense)"), Infinity, "every interval traded → untouched");

// Two thirds empty → merge toward roughly two traded intervals per bar
sandbox.__thin = withVol(
  Array.from({ length: 60 }, (_, i) => [i, 10, 12, 9, 11, i % 3 === 0 ? 4 : 0]),
);
assert.strictEqual(run("candleDensityCap(__thin)"), 12, "20 traded of 60 → 10, floored at the minimum");
sandbox.__thin2 = withVol(
  Array.from({ length: 120 }, (_, i) => [i, 10, 12, 9, 11, i % 3 === 0 ? 4 : 0]),
);
assert.strictEqual(run("candleDensityCap(__thin2)"), 20, "40 traded of 120 → 20 bars");

// No volume reported at all: don't guess from flat candles, since a calm
// market is not the same as an untraded one
sandbox.__novol = withVol(
  Array.from({ length: 30 }, (_, i) => [i, 10, 10, 10, 10, 0]),
);
assert.strictEqual(run("candleDensityCap(__novol)"), Infinity, "no volume data → no second-guessing");
assert.strictEqual(run("candleDensityCap([])"), Infinity, "no candles → no cap");
assert.strictEqual(run("candleDensityCap(null)"), Infinity, "missing candles → no cap");

// The cap feeds the same aggregation the width uses, so merged bars gain
// real bodies instead of staying dashes
const thinBars = json("aggregateCandles(__thin2, candleDensityCap(__thin2))");
assert.strictEqual(thinBars.length, 20, "merged to the cap");
assert.ok(
  thinBars.every((b) => b.volume > 0),
  "every merged bar now contains a trade",
);

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

/* ── the crosshair lands on candles, not between them ───────────────────────
 * The line spreads n points across the full width while candles sit in n
 * slots, so reading candle-mode positions off the line's scale put the guide
 * between bars. The guide must sit on the bar's own centre, and the readout
 * must describe the bar on screen (which, after aggregation, is a merge).
 */

const candleChart = run("new LineBase({})");
candleChart.props = {
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
  showCandles: true,
  candles: [
    { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 5 },
    { time: 2000, open: 11, high: 18, low: 10, close: 17, volume: 6 },
    { time: 3000, open: 17, high: 19, low: 7, close: 8, volume: 7 },
    { time: 4000, open: 8, high: 9, low: 6, close: 7, volume: 8 },
  ],
};
candleChart.width = 400;
candleChart.height = 200;

const cNodes = [];
const cAttach = (ref) => {
  ref.current = fakeNode();
  cNodes.push(ref.current);
  return ref.current;
};
cAttach(candleChart.hoverRef);
const guide = cAttach(candleChart.hoverLineRef);
const dot = cAttach(candleChart.hoverDotRef);
cAttach(candleChart.hoverBoxRef);
cAttach(candleChart.hoverPriceRef);
cAttach(candleChart.hoverDateRef);
candleChart.rowLabelRefs.forEach(cAttach);
candleChart.rowValueRefs.forEach(cAttach);
candleChart.candleLayers.forEach((layer) => {
  cAttach(layer.group);
  cAttach(layer.up);
  cAttach(layer.down);
});

candleChart.updateCandles(false);
assert.strictEqual(candleChart.candleBars.length, 4, "no aggregation needed at this width");

// Hovering anywhere inside a bar's slot selects that bar and centres on it
const barX = (i) => candleChart.candleScale.bars[i].x;
for (const i of [0, 1, 2, 3]) {
  assert.strictEqual(candleChart.candleIndexAt(barX(i)), i, `centre of bar ${i}`);
}
const step = (400 - 24 * 2) / 4;
assert.strictEqual(candleChart.candleIndexAt(barX(1) - step * 0.4), 1, "left edge of a slot still selects it");
assert.strictEqual(candleChart.candleIndexAt(barX(1) + step * 0.4), 1, "right edge too");
assert.strictEqual(candleChart.candleIndexAt(-500), 0, "left of the plot clamps to the first bar");
assert.strictEqual(candleChart.candleIndexAt(99999), 3, "right of the plot clamps to the last");

candleChart.hoverX = barX(2);
candleChart.hoverIndex = -1;
candleChart.drawCrosshair();
assert.strictEqual(
  Number(guide.attrs.x1),
  barX(2),
  "guide sits on the bar's centre, not the line's point",
);
assert.strictEqual(Number(dot.attrs.cy), candleChart.candleScale.bars[2].yClose, "dot marks that bar's close");
assert.strictEqual(
  candleChart.rowValueRefs[3].current.textContent,
  "$8",
  "readout describes the hovered bar (close)",
);
assert.strictEqual(
  candleChart.rowValueRefs[1].current.textContent,
  "$19",
  "and its high",
);

// After aggregation the readout must describe the merged bar, not a source one
candleChart.width = 30; // forces maxBars to the floor of 20 → still 4 here
candleChart.props = { ...candleChart.props, candles: [] };
candleChart.updateCandles(false);
assert.strictEqual(candleChart.candleBars, null, "no candles → no bar geometry");
assert.strictEqual(candleChart.candleIndexAt(10), -1, "and nothing to hover");

/* ── a range change reshapes rather than blinking ──────────────────────────
 * The transition used to fade a single layer out and back in, so opacity
 * passed through zero and the empty chart showed through. Now both layers
 * travel the same geometry while their opacities cross, so the old bars
 * visibly flow into the new ones.
 *
 * The property that makes that work is here: the morph must sit exactly on
 * the source at the start and exactly on the destination at the end, in both
 * directions — otherwise the shape pops at one end of the transition.
 */

const geom = (bars, w) => json(`scaleCandles(${JSON.stringify(bars)}, 200, ${w}, 24)`);
const oldGeom = geom(
  [
    { time: 1000, open: 10, high: 12, low: 9, close: 11 },
    { time: 2000, open: 11, high: 18, low: 10, close: 17 },
  ],
  400,
);
const newGeom = geom(
  [
    { time: 5000, open: 20, high: 25, low: 19, close: 24 },
    { time: 6000, open: 24, high: 26, low: 15, close: 16 },
    { time: 7000, open: 16, high: 17, low: 12, close: 13 },
  ],
  400,
);
sandbox.__old = oldGeom;
sandbox.__new = newGeom;

// End of the journey: exactly the destination, bar for bar
const atEnd = json("interpolateCandleScale(__old, __new, 1)");
assert.deepStrictEqual(atEnd.bars, newGeom.bars, "t=1 lands exactly on the new set");
assert.strictEqual(atEnd.barW, newGeom.barW, "and on its bar width");

// Start of the journey: the destination's bar count, but sitting on the
// source's shape — so the first frame matches what was already on screen
const atStart = json("interpolateCandleScale(__old, __new, 0)");
assert.strictEqual(atStart.bars.length, newGeom.bars.length, "count comes from the destination");
assert.strictEqual(atStart.barW, oldGeom.barW, "width starts at the source's");
assert.strictEqual(atStart.bars[0].x, oldGeom.bars[0].x, "first bar starts on the source");
assert.strictEqual(
  atStart.bars[atStart.bars.length - 1].x,
  oldGeom.bars[oldGeom.bars.length - 1].x,
  "last bar starts on the source's last",
);

// The outgoing layer runs the same call mirrored, so it starts on its own
// bars — neither end of the transition jumps
const outgoingStart = json("interpolateCandleScale(__new, __old, 1)");
assert.deepStrictEqual(outgoingStart.bars, oldGeom.bars, "outgoing starts exactly on the old set");

// Halfway is between the two, not at either end
const mid = json("interpolateCandleScale(__old, __new, 0.5)");
const between = (v, a, b) => v > Math.min(a, b) && v < Math.max(a, b);
assert.ok(
  between(mid.bars[0].yClose, oldGeom.bars[0].yClose, newGeom.bars[0].yClose),
  "midpoint is genuinely in transit",
);

// Colour follows the set being drawn, so each layer keeps its own directions
assert.strictEqual(mid.bars[1].up, newGeom.bars[1].up, "direction comes from the destination");

// Degenerate inputs can't break the tween
assert.strictEqual(run("interpolateCandleScale(null, __new, 0.5)"), sandbox.__new, "no source → destination");
assert.strictEqual(run("interpolateCandleScale(__old, null, 0.5)"), null, "no destination → nothing");
const single = json("interpolateCandleScale(__old, { barW: 4, bars: [__new.bars[0]] }, 0.5)");
assert.strictEqual(single.bars.length, 1, "a single destination bar still interpolates");

// Both layers stay mounted so the crossfade has something to fade between
assert.strictEqual(candleChart.candleLayers.length, 2, "two candle layers exist");

/* ── volume band ────────────────────────────────────────────────────────────
 * Volume and price share no units, so the band gets its own scale in its own
 * strip along the bottom. It is scaled against the 95th percentile rather
 * than the maximum: one spike would otherwise flatten every other bar into
 * the baseline, and comparing ordinary days is the whole point.
 */

const volCandles = (vols) =>
  vols.map((v, i) => ({
    time: i,
    open: 10,
    high: 12,
    low: 9,
    close: i % 2 ? 11 : 9.5, // alternating direction
    volume: v,
  }));

sandbox.__vb = volCandles([10, 20, 30, 40]);
sandbox.__vs = json("scaleCandles(__vb, 200, 400, 20)");
const volUpD = run("volumeBarsData(__vs, __vb, 200, true)");
const volDownD = run("volumeBarsData(__vs, __vb, 200, false)");

// Every bar goes to one path or the other, none to both
assert.strictEqual(
  (volUpD.match(/M/g) || []).length + (volDownD.match(/M/g) || []).length,
  4,
  "one bar per candle",
);
assert.ok(volUpD && volDownD, "both directions drawn");

// Bars live in the bottom band and never reach into the price area
const ys = [...`${volUpD} ${volDownD}`.matchAll(/M[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
const bandTop = 200 * (1 - 0.18);
assert.ok(Math.min(...ys) >= bandTop - 0.01, "bars stay inside their band");
assert.ok(Math.max(...ys) <= 200, "and inside the chart");

// A single outlier must not flatten the rest — that is what the percentile
// cutoff is for. With a 100x spike the ordinary bars keep real height.
sandbox.__spike = volCandles([10, 12, 11, 1000]);
sandbox.__spikeScale = json("scaleCandles(__spike, 200, 400, 20)");
const spikeD = run("volumeBarsData(__spikeScale, __spike, 200, true)") +
  run("volumeBarsData(__spikeScale, __spike, 200, false)");
const heights = [...spikeD.matchAll(/v([\d.]+)h/g)].map((m) => Number(m[1]));
assert.ok(
  Math.min(...heights) > 1,
  "ordinary bars keep visible height beside a spike",
);
assert.ok(Math.max(...heights) <= 200 * 0.18 + 0.01, "the spike clips to the band");

// Candles that recorded no trade draw nothing rather than a baseline smear
sandbox.__partial = volCandles([0, 5, 0, 7]);
sandbox.__partialScale = json("scaleCandles(__partial, 200, 400, 20)");
const partial =
  run("volumeBarsData(__partialScale, __partial, 200, true)") +
  run("volumeBarsData(__partialScale, __partial, 200, false)");
assert.strictEqual((partial.match(/M/g) || []).length, 2, "only traded candles get a bar");

// No volume data at all, and mismatched inputs, produce nothing
sandbox.__novolume = volCandles([0, 0, 0, 0]);
assert.strictEqual(
  run("volumeBarsData(__vs, __novolume, 200, true)"),
  "",
  "nothing traded → no band",
);
assert.strictEqual(run("volumeBarsData(null, __vb, 200, true)"), "", "no geometry → nothing");
assert.strictEqual(
  run("volumeBarsData(__vs, __vb.slice(0, 2), 200, true)"),
  "",
  "bars and geometry must line up, or the band would mislabel volumes",
);

/* ── stats row helpers ──────────────────────────────────────────────────── */

// Range high/low is read off the series the chart is drawing, so it always
// describes what is actually on screen
sandbox.__series = [
  { price: 100, time: 1 },
  { price: 140, time: 2 },
  { price: 90, time: 3 },
  { price: 120, time: 4 },
];
assert.deepStrictEqual(
  json("deriveRangeStats(__series)"),
  { high: 140, low: 90 },
  "extremes of the displayed range",
);

// Junk points are skipped rather than poisoning the result with NaN
sandbox.__messy = [
  { price: 100, time: 1 },
  { price: "abc", time: 2 },
  { price: 150, time: 3 },
];
assert.deepStrictEqual(
  json("deriveRangeStats(__messy)"),
  { high: 150, low: 100 },
  "unusable points ignored",
);
assert.strictEqual(run("deriveRangeStats([{ price: 1, time: 1 }])"), null, "one point is not a range");
assert.strictEqual(run("deriveRangeStats([])"), null, "no series → no range");
assert.strictEqual(run("deriveRangeStats(null)"), null, "missing series → no range");

// Market caps run to twelve digits; the row compacts them
assert.strictEqual(run('formatCompactAmount(1.3e12, "$")'), "$1.30T", "trillions");
assert.strictEqual(run('formatCompactAmount(4.5e9, "$")'), "$4.50B", "billions");
assert.strictEqual(run('formatCompactAmount(2.5e6, "€")'), "€2.50M", "millions keep the currency");
assert.strictEqual(run('formatCompactAmount(1500, "$")'), "$1.50K", "thousands");
assert.strictEqual(run('formatCompactAmount(12.5, "$")'), "$12.50", "small values stay plain");
// A missing figure must not render as "$0" or "$NaN" — the row hides instead
assert.strictEqual(run('formatCompactAmount(0, "$")'), null, "zero is treated as missing");
assert.strictEqual(run('formatCompactAmount(null, "$")'), null, "missing → null");
assert.strictEqual(run('formatCompactAmount("junk", "$")'), null, "junk → null");

/* ── grid axis labels ────────────────────────────────────────────────────
 * The one rule that matters: two adjacent gridlines must never carry the
 * same text. Formatting by magnitude broke that on the cheap coins, which is
 * exactly where a grid is most useful — a label that reads $0.07 twice tells
 * you nothing about where a level is.
 */

// Decimals follow the step, not the size of the number
assert.strictEqual(run('formatAxisPrice(64500, 500, "$")'), "$64.5K", "thousands keep the half");
assert.strictEqual(run('formatAxisPrice(65000, 1000, "$")'), "$65K", "a round step needs no decimal");
assert.strictEqual(run('formatAxisPrice(1.25, 0.25, "$")'), "$1.3", "sub-dollar steps get one place");

// The regression this function exists for
assert.notStrictEqual(
  run('formatAxisPrice(0.070, 0.002, "$")'),
  run('formatAxisPrice(0.072, 0.002, "$")'),
  "adjacent Dogecoin levels must not format identically",
);
assert.strictEqual(run('formatAxisPrice(0.072, 0.002, "$")'), "$0.072", "three places at a 0.002 step");

// Whole ladders stay distinct, which is the property the chart depends on
for (const [lo, step] of [[0.0001, 0.00002], [3.2, 0.4], [58000, 2000], [1.1e12, 1e11]]) {
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    seen.add(run(`formatAxisPrice(${lo + step * i}, ${step}, "$")`));
  }
  assert.strictEqual(seen.size, 6, `six levels at step ${step} produce six labels`);
}

assert.strictEqual(run('formatAxisPrice("junk", 1, "$")'), "", "junk → empty, never NaN");

/* ── settling a call ─────────────────────────────────────────────────────
 * The record's only job is to be true, so these assert the awkward cases
 * rather than the happy one: a target the series has not reached, a target
 * that has scrolled off the start, and a nearby-but-not-near-enough point.
 */

const HOUR = 3600e3;
const series = (from, n, stepMs, price) =>
  Array.from({ length: n }, (_, i) => ({ time: from + i * stepMs, price: price(i) }));

// A flat series at 100, hourly, ten hours long
sandbox.__flat = series(1000 * HOUR, 11, HOUR, () => 100);
// Called the band 95-105 at hour 1005 — the price was 100, so that is a hit
sandbox.__call = { target: 1005 * HOUR, span: HOUR, lo: 95, hi: 105 };
assert.strictEqual(
  run("settleCall(__call, __flat, 1010 * 3600e3).status"), "hit", "price inside the band");

sandbox.__miss = { target: 1005 * HOUR, span: HOUR, lo: 120, hi: 130 };
assert.strictEqual(
  run("settleCall(__miss, __flat, 1010 * 3600e3).status"), "miss", "price outside the band");

// Time has not reached the target yet
assert.strictEqual(
  run("settleCall(__call, __flat, 1002 * 3600e3).status"), "pending", "not due yet");

// Due, but the series has not caught up — must wait, not guess
sandbox.__short = series(1000 * HOUR, 3, HOUR, () => 100);
assert.strictEqual(
  run("settleCall(__call, __short, 1010 * 3600e3).status"),
  "pending",
  "series stops short of the target → ask again later",
);

// The target fell off the start of the range: the evidence is gone
sandbox.__late = series(1100 * HOUR, 5, HOUR, () => 100);
assert.strictEqual(
  run("settleCall(__call, __late, 1200 * 3600e3).status"),
  "expired",
  "target predates the series → expired, never scored",
);

// A point exists near the target but not near enough to be about that moment
sandbox.__coarse = [
  { time: 1000 * HOUR, price: 100 },
  { time: 1010 * HOUR, price: 100 },
];
assert.strictEqual(
  run("settleCall(__call, __coarse, 1020 * 3600e3).status"),
  "pending",
  "nearest point is over half a cell away → not an answer about that moment",
);

/* The tally */
assert.deepStrictEqual(
  json('applyCallResult({ hits: 2, total: 3, streak: 2, best: 2 }, "hit")'),
  { hits: 3, total: 4, streak: 3, best: 3 },
  "a hit extends the streak and the best",
);
assert.deepStrictEqual(
  json('applyCallResult({ hits: 3, total: 4, streak: 3, best: 5 }, "miss")'),
  { hits: 3, total: 5, streak: 0, best: 5 },
  "a miss breaks the streak but leaves the best",
);
assert.deepStrictEqual(
  json('applyCallResult({ hits: 1, total: 1, streak: 1, best: 1 }, "expired")'),
  { hits: 1, total: 1, streak: 1, best: 1 },
  "an expired call changes nothing at all",
);
assert.deepStrictEqual(
  json('applyCallResult(null, "hit")'),
  { hits: 1, total: 1, streak: 1, best: 1 },
  "a missing record starts from zero rather than NaN",
);

/* ── comparison mode ─────────────────────────────────────────────────────
 * The mode's whole claim is that two coins share one honest axis. These
 * assert that claim directly rather than checking that a function ran.
 */

// Same shape, wildly different price levels: BTC-sized numbers and XRP-sized
// numbers that both double
const bigCoin = [
  { price: 60000, time: new Date(1000) },
  { price: 90000, time: new Date(2000) },
  { price: 120000, time: new Date(3000) },
];
const smallCoin = [
  { price: 0.5, time: new Date(1000) },
  { price: 0.75, time: new Date(2000) },
  { price: 1.0, time: new Date(3000) },
];
sandbox.__big = bigCoin;
sandbox.__small = smallCoin;

const pct = json("toPercentChange(__big)");
assert.strictEqual(pct[0].percent, 0, "the range starts at zero percent");
assert.strictEqual(pct[1].percent, 50, "halfway up is +50%");
assert.strictEqual(pct[2].percent, 100, "doubling is +100%");

// The point of the mode: a coin at 60,000 and a coin at 0.50 that moved
// identically must land on exactly the same pixels. Any implementation that
// kept prices — a second y-axis included — fails this.
const same = json("scaleComparison(__big, __small, 200, 400, 20)");
assert.strictEqual(
  JSON.stringify(same.a.map((p) => p.price)),
  JSON.stringify(same.b.map((p) => p.price)),
  "identical percent moves draw at identical heights regardless of price",
);

// One shared domain, spanning both series — not one scale each
sandbox.__laggard = [
  { price: 100, time: new Date(1000) },
  { price: 90, time: new Date(2000) },
  { price: 80, time: new Date(3000) },
];
const mixed = json("scaleComparison(__big, __laggard, 200, 400, 20)");
assert.strictEqual(mixed.low, -20, "the domain reaches the worse performer");
assert.strictEqual(mixed.high, 100, "and the better one");

// Higher percent → smaller y (SVG grows downward). The winner is drawn above.
assert.ok(
  mixed.a[2].price < mixed.b[2].price,
  "the coin that gained is plotted above the one that lost",
);
assert.strictEqual(mixed.lastA, 100, "the label reads the final percent");
assert.strictEqual(mixed.lastB, -20, "for both coins");

// Both coins flat: without a floor the scale would magnify rounding drift
// into a dramatic crossing
sandbox.__flatA = [
  { price: 100, time: new Date(1000) },
  { price: 100.01, time: new Date(2000) },
];
sandbox.__flatB = [
  { price: 5, time: new Date(1000) },
  { price: 5.0002, time: new Date(2000) },
];
const flatPair = json("scaleComparison(__flatA, __flatB, 200, 400, 20)");
assert.ok(
  flatPair.high - flatPair.low >= 1,
  `flat pair keeps a minimum span, got ${flatPair.high - flatPair.low}`,
);

/* The 0% baseline is what both lines are read against, so it must always be
 * drawable. Both series start at 0% by construction, so the domain can never
 * sit wholly above or below it — asserted here rather than assumed, since the
 * chart draws that line unconditionally. */
sandbox.__up = [
  { price: 100, time: new Date(1000) },
  { price: 120, time: new Date(2000) },
];
sandbox.__up2 = [
  { price: 50, time: new Date(1000) },
  { price: 65, time: new Date(2000) },
];
for (const [name, expr] of [
  ["both rising", "scaleComparison(__up, __up2, 200, 400, 20)"],
  ["both falling", "scaleComparison(__laggard, __laggard, 200, 400, 20)"],
  ["one each way", "scaleComparison(__big, __laggard, 200, 400, 20)"],
  ["both flat", "scaleComparison(__flatA, __flatB, 200, 400, 20)"],
]) {
  const s = json(expr);
  assert.ok(s.low <= 0 && s.high >= 0, `zero stays inside the domain (${name})`);
  assert.ok(
    s.zeroY >= 20 && s.zeroY <= 180,
    `the baseline lands inside the plot area (${name}), got ${s.zeroY}`,
  );
}

// Bad input must return null, not a half-drawn overlay
assert.strictEqual(run("scaleComparison([], __big, 200, 400, 20)"), null, "empty series");
assert.strictEqual(run("scaleComparison(null, __big, 200, 400, 20)"), null, "missing series");
assert.strictEqual(
  run("scaleComparison([{price: 1, time: new Date(1)}], __big, 200, 400, 20)"),
  null,
  "a single point is not a series",
);
// Zero and negative prices can't be a percentage base
assert.strictEqual(
  run("scaleComparison([{price: 0, time: new Date(1)}, {price: 0, time: new Date(2)}], __big, 200, 400, 20)"),
  null,
  "zero-priced series is dropped rather than dividing by zero",
);

assert.strictEqual(run("formatSignedPercent(4.2)"), "+4.20%", "gains carry a sign");
assert.strictEqual(run("formatSignedPercent(-1.5)"), "-1.50%", "so do losses");
assert.strictEqual(run("formatSignedPercent(0)"), "+0.00%", "flat reads as zero, not blank");
assert.strictEqual(run("formatSignedPercent(NaN)"), "", "junk prints nothing");

/* ── comparison readout and labels ───────────────────────────────────────
 * The crosshair has to describe both coins, and the labels have to stay on
 * the chart and off each other. Both are geometry, so both are measured.
 */
const cmp = run("new LineBase({})");
cmp.props = {
  prices: bigCoin,
  comparePrices: smallCoin,
  theme: chart.props.theme,
  period: "day",
  coin: "BTC",
  compareCoin: "XRP",
  formatPrice: (v) => `$${v}`,
};
cmp.width = 400;
cmp.height = 200;
cmp.hoverX = 200;
const cmpNodes = [];
const attachTo = (ref) => {
  ref.current = fakeNode();
  cmpNodes.push(ref.current);
  return ref.current;
};
const cmpGroup = attachTo(cmp.hoverRef);
attachTo(cmp.hoverLineRef);
attachTo(cmp.hoverDotRef);
const dotB = attachTo(cmp.hoverDotBRef);
attachTo(cmp.hoverBoxRef);
attachTo(cmp.hoverPriceRef);
attachTo(cmp.hoverDateRef);
cmp.rowLabelRefs.forEach(attachTo);
cmp.rowValueRefs.forEach(attachTo);
cmp.compareScaled = run(
  "scaleComparison(__big, __small, 200, 400, 20)",
);

cmp.drawCrosshair();
assert.strictEqual(cmpGroup.attrs.visibility, "visible", "the readout shows");
assert.strictEqual(
  cmp.rowLabelRefs[0].current.textContent,
  "BTC",
  "the first row names the coin you are on",
);
assert.strictEqual(
  cmp.rowLabelRefs[1].current.textContent,
  "XRP",
  "the second names the one you compared it with",
);
assert.ok(
  /%$/.test(cmp.rowValueRefs[1].current.textContent),
  "values are percentages, not prices",
);
// Five rows exist for OHLC; comparison uses two and the rest must be hidden,
// not left showing the last coin's high and low
for (const r of [2, 3, 4]) {
  assert.strictEqual(
    cmp.rowLabelRefs[r].current.attrs.visibility,
    "hidden",
    `unused row ${r} is hidden in comparison mode`,
  );
}
assert.strictEqual(
  dotB.attrs.visibility,
  "inherit",
  "the compared line gets its own marker, inheriting so it hides with the group",
);
assert.strictEqual(
  cmp.hoverPriceRef.current.textContent,
  "",
  "no single price line — there are two coins and neither owns it",
);

// Labels: on the chart, and clear of each other even when the coins finish
// level (identical percent moves put both line ends on the same pixel)
const labelA = attachTo(cmp.compareLabelARef);
const labelB = attachTo(cmp.compareLabelBRef);
cmp.placeCompareLabels(cmp.compareScaled);
assert.ok(/^BTC [+-]/.test(labelA.textContent), `label A names its coin, got ${labelA.textContent}`);
assert.ok(/^XRP [+-]/.test(labelB.textContent), `label B names its coin, got ${labelB.textContent}`);
const yA = Number(labelA.attrs.y);
const yB = Number(labelB.attrs.y);
assert.ok(
  Math.abs(yA - yB) >= 14,
  `labels for two coins that finished level must not overlap, got ${yA} and ${yB}`,
);
for (const [name, node] of [["A", labelA], ["B", labelB]]) {
  const y = Number(node.attrs.y);
  const x = Number(node.attrs.x);
  assert.ok(y >= 0 && y <= 200, `label ${name} stays inside the chart height, got ${y}`);
  assert.ok(x >= 0 && x <= 400, `label ${name} stays inside the chart width, got ${x}`);
}

/* ── base rates: the arithmetic behind the panel that replaced buy signals ──
 *
 * `docs/product/TODAY.md` §9 is why there are no buy or sell points here: 0 of
 * 70 permutation tests survive correction, and on live daily closes the
 * "overbought" line was followed by a better-than-ordinary month on four coins
 * of six. What got built instead is a count, and these are the two rules that
 * make a count honest.
 */
{
  /* `dailyRsi` is Wilder's RSI on daily closes, and it is deliberately not
   * `calculateRSI` — that one samples whatever range is on screen down to ~50
   * points, which makes its period sixteen minutes on 1H and three and a half
   * years on ALL. Checked here against a series with a known answer: a run of
   * unbroken gains has no losses to divide by, which is RSI 100. */
  const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
  const rsiUp = run(`dailyRsi(${JSON.stringify(rising)})`);
  assert.strictEqual(rsiUp[13], null, "no value before the period is full");
  assert.strictEqual(rsiUp[14], 100, "unbroken gains → 100, not a divide by zero");
  const falling = Array.from({ length: 40 }, (_, i) => 140 - i);
  const rsiDown = run(`dailyRsi(${JSON.stringify(falling)})`);
  assert.strictEqual(rsiDown[rsiDown.length - 1], 0, "unbroken losses → 0");
  assert.strictEqual(
    run("dailyRsi([1, 2, 3]).filter((v) => v !== null).length"),
    0,
    "a series shorter than the period has no RSI at all",
  );

  /* Episodes, not days. A run of five days inside a state is **one** thing
   * that happened; counting each day would inflate n fivefold and correlate
   * every observation with its neighbour — which is exactly how a sample of
   * four gets dressed up as a sample of twenty. */
  const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
  // true on indices 10..14 and 30..34: two episodes, ten days
  sandbox.__closes = closes;
  sandbox.__flags = closes.map((_, i) => (i >= 10 && i <= 14) || (i >= 30 && i <= 34));
  const r = json("baseRateFor(__closes, __flags, (v) => v === true, 5)");
  assert.strictEqual(r.n, 2, "ten days inside two runs count as two episodes");
  assert.strictEqual(
    r.edge,
    null,
    "and two episodes is far too few to print a comparison",
  );
  assert.ok(r.baseN > 50, "the baseline is every ordinary window in the series");

  /* The threshold is the feature, not a detail: below it the panel says so
   * rather than printing a difference. Proved on a series with enough runs to
   * cross it. */
  const long = Array.from({ length: 400 }, (_, i) => 100 + i);
  sandbox.__long = long;
  sandbox.__many = long.map((_, i) => i % 20 === 0);
  const many = json("baseRateFor(__long, __many, (v) => v === true, 5)");
  assert.ok(many.n >= run("BASE_RATE_MIN_EPISODES"),
    `enough episodes to compare (${many.n})`);
  assert.ok(many.edge !== null, "…so the comparison is printed");
}

console.log("CHART TESTS OK");
