// Settings tests: the search filter, and the promise that every control
// actually goes through it (a setting added without the wrapper would be
// invisible to search — a silent hole rather than a visible bug).
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

const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number, String,
  Boolean, Symbol, Proxy, RegExp, Error, parseInt, parseFloat, isFinite, isNaN,
  setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  styled: styledStub,
  keyframes: tagged("keyframes"),
  css: tagged("css"),
  React: {
    Component: class {},
    createElement: () => null,
    Fragment: Symbol("Fragment"),
    Children: { toArray: (c) => (Array.isArray(c) ? c : [c]) },
  },
  PureComponent: class {},
  createRef: () => ({ current: null }),
  window: { matchMedia: () => ({ matches: false }) },
  debounce: (fn) => fn,
  _defineProperty: (obj, key, value) => {
    obj[key] = value;
    return obj;
  },
};
vm.createContext(sandbox);
const base = path.join(__dirname, "..", "src");
// Same order as index.html — settings.js reads DEFAULT_WIDGET_SIZE and
// WIDGET_SIZE_OPTIONS from widgets-data.js at definition time
for (const f of ["config.js", "storage.js", "widgets-data.js", "shortcuts.js", "settings.js"]) {
  vm.runInContext(fs.readFileSync(`${base}/${f}`, "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);

/* ── search filter ──────────────────────────────────────────────────────── */

const matches = (q, title, keywords) =>
  run(`matchesSetting(${JSON.stringify(q)}, ${JSON.stringify(title)}, ${JSON.stringify(keywords || "")})`);

// An empty search shows everything — the panel's normal state
assert.strictEqual(matches("", "Chart Color"), true, "no query shows every setting");
assert.strictEqual(matches("   ", "Chart Color"), true, "whitespace is not a query");

assert.strictEqual(matches("chart", "Chart Color"), true, "matches the title");
assert.strictEqual(matches("CHART", "Chart Color"), true, "case-insensitive");
assert.strictEqual(matches("color", "Chart Color"), true, "matches a later word");

// Words can be typed in any order and partially — "chart col" should find it
assert.strictEqual(matches("chart col", "Chart Color"), true, "all words must appear, partials count");
assert.strictEqual(matches("col chart", "Chart Color"), true, "order doesn't matter");
assert.strictEqual(matches("chart theme", "Chart Color"), false, "a word that doesn't appear excludes it");

// Keywords catch the words people actually reach for
assert.strictEqual(matches("colour", "Chart Color", "green red fill colour"), true, "British spelling via keywords");
assert.strictEqual(matches("ohlc", "Chart Details", "ohlc volume crosshair"), true, "jargon via keywords");
assert.strictEqual(matches("volume", "Chart Details", "ohlc volume crosshair"), true, "second keyword");
assert.strictEqual(matches("zzz", "Chart Details", "ohlc volume"), false, "nonsense matches nothing");

// Missing pieces must not throw — the panel renders on every keystroke
assert.strictEqual(matches("x", null, null), false, "no title, no keywords");
assert.strictEqual(matches(null, "Chart Color"), true, "null query behaves as empty");

/* ── every control is searchable ─────────────────────────────────────────
 * The preferences tab renders each control through panel.section(), which is
 * what search filters on. One added directly would still work but would
 * never be findable, so the count is asserted rather than trusted.
 */
const prefs = fs.readFileSync(`${base}/settings-preferences.js`, "utf8");
const wrapped = (prefs.match(/panel\.section\(/g) || []).length;
assert.ok(wrapped >= 11, `expected every preference control to be wrapped, found ${wrapped}`);

// Section titles are unique, otherwise a search would surface two identical
// looking rows and the tally would be misleading
const titles = [...prefs.matchAll(/panel\.section\(\s*\n\s*'([^']+)'/g)].map((m) => m[1]);
assert.strictEqual(
  new Set(titles).size,
  titles.length,
  `duplicate setting titles: ${titles.join(", ")}`,
);

/* ── shortcut list matches the handlers ──────────────────────────────────
 * The list is what we advertise; app.js is what actually runs. A shortcut
 * that drifts out of the code would be a lie in the UI, so every key in the
 * list has to appear in the key handler.
 */
const appSrc = fs.readFileSync(`${base}/app.js`, "utf8");
const handler = appSrc.slice(
  appSrc.indexOf('_defineProperty(this, "handleKeyDown"'),
  appSrc.indexOf('_defineProperty(this, "handleThemeChange"'),
);
const advertised = run("SHORTCUT_GROUPS").flatMap((g) => g.items.flatMap((i) => i.keys));
const handled = {
  "←": "ArrowLeft",
  "→": "ArrowRight",
  Esc: "Escape",
  "1": 'e.key >= "1"',
  "6": 'e.key <= "6"',
  // The space bar is a key like any other, but its name is a literal space
  Space: 'e.key === " "',
};
for (const key of advertised) {
  if (key === "–") continue; // a range dash, not a key
  const needle = handled[key] || `"${key}"`;
  assert.ok(
    handler.includes(needle) || handler.includes(`"${key.toLowerCase()}"`),
    `shortcut "${key}" is advertised but not handled in app.js`,
  );
}

/* ── widgets don't fetch what they don't show ────────────────────────────
 * Two easy regressions to reintroduce: fetching a widget the user has
 * hidden, and re-adding a second request for data another widget already
 * pulls. Both are invisible at runtime — the panel looks identical — so
 * they're asserted against the source.
 */
const appWidgets = appSrc.slice(
  appSrc.indexOf('_defineProperty(this, "fetchWidgets"'),
  appSrc.indexOf('_defineProperty(this, "hideWidget"'),
);
assert.ok(
  appWidgets.includes("hiddenWidgets"),
  "widget fetching must skip widgets the user has hidden",
);
assert.ok(
  appWidgets.includes("Promise.all"),
  "widget requests are independent and should run together, not in sequence",
);

const widgetsSrc = fs.readFileSync(`${base}/widgets-data.js`, "utf8");
const altSeason = widgetsSrc.slice(
  widgetsSrc.indexOf("const fetchAltcoinSeason"),
  widgetsSrc.indexOf("const fetchAltcoinSeason") + 900,
);
assert.ok(
  altSeason.includes("fetchCoinloreGlobal"),
  "altcoin season must reuse the shared global fetch",
);
assert.ok(
  !altSeason.includes("COINLORE_GLOBAL_API"),
  "and must not request that endpoint a second time itself",
);

console.log("SETTINGS TESTS OK");
