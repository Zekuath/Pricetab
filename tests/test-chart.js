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
};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "src", "chart.js"), "utf8"),
  sandbox,
  { filename: "chart.js" },
);
const run = (code) => vm.runInContext(code, sandbox);

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

console.log("CHART TESTS OK");
