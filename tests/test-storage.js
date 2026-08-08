// Smoke test for the centralized storage helpers.
// Runs config.js + storage.js + widgets-data.js + utils.js in a vm context
// with a stubbed localStorage, then asserts load/save semantics.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const store = {};
const sandbox = {
  console,
  Date,
  JSON,
  Math,
  Array,
  Object,
  Set,
  Promise,
  parseInt,
  parseFloat,
  isFinite,
  setTimeout,
  fetch: () => Promise.reject(new Error("no network in test")),
  window: { matchMedia: () => ({ matches: false }) },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  },
  // d3 line() stub — chainable, only referenced at top level of utils.js
  line: () => {
    const o = {};
    o.x = () => o;
    o.y = () => o;
    return o;
  },
};
vm.createContext(sandbox);

const base = path.join(__dirname, "..", "src");
for (const f of ["config.js", "storage.js", "widgets-data.js", "utils.js"]) {
  vm.runInContext(fs.readFileSync(`${base}/${f}`, "utf8"), sandbox, {
    filename: f,
  });
}

const run = (code) => vm.runInContext(code, sandbox);

// --- theme ---
assert.strictEqual(run("loadThemeFromStorage()"), "auto", "theme default");
run('saveThemeToStorage("dark")');
assert.strictEqual(run("loadThemeFromStorage()"), "dark", "theme roundtrip");
store["crypto_chart_theme"] = "purple";
assert.strictEqual(run("loadThemeFromStorage()"), "auto", "theme whitelist");

// --- bools ---
assert.strictEqual(run("loadNewsTickerFromStorage()"), false, "news default");
run("saveNewsTickerToStorage(true)");
assert.strictEqual(run("loadNewsTickerFromStorage()"), true, "news roundtrip");
assert.strictEqual(run("loadChartColorFromStorage()"), true, "chartColor default true");
run("saveChartColorToStorage(false)");
assert.strictEqual(run("loadChartColorFromStorage()"), false, "chartColor roundtrip");
assert.strictEqual(run("loadAutoRotateFromStorage()"), false, "autoRotate default");
assert.strictEqual(run("loadTickerFromStorage()"), false, "ticker default");
assert.strictEqual(run("loadPageTickerFromStorage()"), false, "pageTicker default");
assert.strictEqual(run("loadPageTickerCollapsedFromStorage()"), false, "collapsed default");

// --- numbers with whitelist ---
assert.strictEqual(run("loadRefreshIntervalFromStorage()"), run("DEFAULT_REFRESH_INTERVAL"), "refresh default");
const validRefresh = run("REFRESH_INTERVAL_OPTIONS[1].value");
run(`saveRefreshIntervalToStorage(${validRefresh})`);
assert.strictEqual(run("loadRefreshIntervalFromStorage()"), validRefresh, "refresh roundtrip");
store["crypto_chart_refresh_interval"] = "123456";
assert.strictEqual(run("loadRefreshIntervalFromStorage()"), run("DEFAULT_REFRESH_INTERVAL"), "refresh whitelist");

assert.strictEqual(run("loadDecimalPlacesFromStorage()"), run("DEFAULT_DECIMAL_PLACES"), "decimals default");
const validDp = run("DECIMAL_PLACES_OPTIONS[0].value");
run(`saveDecimalPlacesToStorage(${validDp})`);
assert.strictEqual(run("loadDecimalPlacesFromStorage()"), validDp, "decimals roundtrip");

assert.strictEqual(run("loadAutoRotateIntervalFromStorage()"), run("DEFAULT_AUTO_ROTATE_INTERVAL"), "rotate interval default");
const validRot = run("AUTO_ROTATE_OPTIONS[2].value");
run(`saveAutoRotateIntervalToStorage(${validRot})`);
assert.strictEqual(run("loadAutoRotateIntervalFromStorage()"), validRot, "rotate interval roundtrip");

// --- enums ---
assert.strictEqual(run("loadSeparatorFormatFromStorage()"), run("DEFAULT_SEPARATOR_FORMAT"), "separator default");
run('saveSeparatorFormatToStorage("eu")');
assert.strictEqual(run("loadSeparatorFormatFromStorage()"), "eu", "separator roundtrip");
store["crypto_chart_separator_format"] = "weird";
assert.strictEqual(run("loadSeparatorFormatFromStorage()"), run("DEFAULT_SEPARATOR_FORMAT"), "separator whitelist");

assert.strictEqual(run("loadCurrencyFromStorage()"), "USD", "currency default");
run('saveCurrencyToStorage("EUR")');
assert.strictEqual(run("loadCurrencyFromStorage()"), "EUR", "currency roundtrip");
store["crypto_chart_currency"] = "ZZZ";
assert.strictEqual(run("loadCurrencyFromStorage()"), "USD", "currency whitelist");

assert.strictEqual(run("loadTickerFormatFromStorage()"), run("DEFAULT_TICKER_FORMAT"), "ticker format default");
assert.strictEqual(run("loadPageTickerPositionFromStorage()"), "bottom", "position default");
run('savePageTickerPositionToStorage("top")');
assert.strictEqual(run("loadPageTickerPositionFromStorage()"), "top", "position roundtrip");

// --- rate prompt (custom: null→false, error→true) ---
assert.strictEqual(run("loadRatePromptDismissed()"), false, "rate prompt default");
run("saveRatePromptDismissed()");
assert.strictEqual(run("loadRatePromptDismissed()"), true, "rate prompt roundtrip");

// --- JSON: widgets ---
assert.strictEqual(
  JSON.stringify(run("loadWidgetsFromStorage()")),
  JSON.stringify(run("({ ...DEFAULT_WIDGETS, ...STARTER_WIDGETS })")),
  "widgets: new install seeds starter set",
);
run("saveWidgetsToStorage({ ...DEFAULT_WIDGETS, rsiWidget: true })");
assert.strictEqual(run("loadWidgetsFromStorage().rsiWidget"), true, "widgets roundtrip");
assert.strictEqual(run("loadWidgetsFromStorage().watchlist"), false, "widgets: saved choices win over starter");

// --- JSON: hidden widgets ---
assert.strictEqual(JSON.stringify(run("loadHiddenWidgetsFromStorage()")), "{}", "hidden default");
run('saveHiddenWidgetsToStorage({ fearGreed: true })');
assert.strictEqual(JSON.stringify(run("loadHiddenWidgetsFromStorage()")), JSON.stringify({ fearGreed: true }), "hidden roundtrip");

// --- JSON: widget order ---
assert.strictEqual(JSON.stringify(run("loadWidgetOrderFromStorage()")), JSON.stringify(run("DEFAULT_WIDGET_ORDER")), "order default");
run('saveWidgetOrderToStorage(["fearGreed", "watchlist", "bogusKey"])');
const order = run("loadWidgetOrderFromStorage()");
assert.strictEqual(order[0], "fearGreed", "order: saved order respected");
assert.strictEqual(order[1], "watchlist", "order: saved order respected");
assert.ok(!order.includes("bogusKey"), "order: unknown keys dropped");
assert.strictEqual(order.length, run("DEFAULT_WIDGET_ORDER.length"), "order: missing keys appended");

// --- JSON: coin options ---
assert.strictEqual(JSON.stringify(run("loadCoinOptionsFromStorage()")), JSON.stringify(["BTC", "ETH", "XRP", "LTC"]), "coins default");
run('saveCoinOptionsToStorage(["SOL", "BTC"])');
assert.strictEqual(JSON.stringify(run("loadCoinOptionsFromStorage()")), JSON.stringify(["SOL", "BTC"]), "coins roundtrip");
store["crypto_chart_coin_options"] = JSON.stringify(["sol", "FAKECOIN", 42]);
assert.strictEqual(JSON.stringify(run("loadCoinOptionsFromStorage()")), JSON.stringify(["SOL"]), "coins: whitelist + uppercase, junk dropped");
store["crypto_chart_coin_options"] = "not json{";
assert.strictEqual(JSON.stringify(run("loadCoinOptionsFromStorage()")), JSON.stringify(["BTC", "ETH", "XRP", "LTC"]), "coins: corrupt JSON falls back");

// --- rating ask: first-use clock + one-time shown flag ---
assert.strictEqual(run("loadRatePromptShown()"), false, "rate shown default");
const t1 = run("getOrInitFirstUse()");
assert.ok(typeof t1 === "number" && t1 <= Date.now(), "first use initialized");
assert.strictEqual(run("getOrInitFirstUse()"), t1, "first use is stable across loads");
store["crypto_chart_first_use"] = String(Date.now() + 86400000); // future → reset
assert.ok(run("getOrInitFirstUse()") <= Date.now(), "future timestamp reset");
store["crypto_chart_first_use"] = "garbage";
assert.ok(run("getOrInitFirstUse()") <= Date.now(), "corrupt timestamp reset");
run("saveRatePromptShown()");
assert.strictEqual(run("loadRatePromptShown()"), true, "rate shown roundtrip");

// --- since-last-visit baselines ---
assert.strictEqual(JSON.stringify(run("loadLastSeen()")), "{}", "last seen default");
run('saveLastSeen({ BTC: { price: 100, time: Date.now() - 1000 } })');
assert.strictEqual(run("loadLastSeen().BTC.price"), 100, "last seen roundtrip");
// junk, impossible and expired entries are dropped on read
store["crypto_chart_last_seen"] = JSON.stringify({
  BTC: { price: 100, time: Date.now() - 1000 },
  ETH: { price: 0, time: Date.now() },
  XRP: { price: 5, time: Date.now() + 60000 },
  LTC: { price: 5, time: Date.now() - 40 * 24 * 60 * 60 * 1000 },
  SOL: "junk",
});
assert.strictEqual(
  JSON.stringify(Object.keys(run("loadLastSeen()"))),
  JSON.stringify(["BTC"]),
  "last seen: zero price, future and expired entries dropped",
);
store["crypto_chart_last_seen"] = "not json{";
assert.strictEqual(JSON.stringify(run("loadLastSeen()")), "{}", "last seen: corrupt JSON falls back");

// --- since-last-visit anchor rule ---
// The anchor is what the line measures from. It must stay still during a
// browsing session, otherwise the comparison is always "vs. a minute ago"
// and the delta never clears the noise threshold (the line never showed).
const T0 = 1700000000000;
const MIN = 60000;
const step = (prev, price, at) => {
  sandbox.__prev = prev;
  return JSON.parse(JSON.stringify(run(`nextLastSeen(__prev, ${price}, ${at})`)));
};

const first = step(null, 100, T0);
assert.deepStrictEqual(
  first,
  { price: 100, time: T0, lastPrice: 100, lastTime: T0 },
  "first ever visit records itself (delta 0 → nothing to show)",
);

// Tabs opened minutes apart are one visit: the anchor must not move
const soon = step(first, 101, T0 + 5 * MIN);
assert.strictEqual(soon.price, 100, "anchor held during the same visit");
assert.strictEqual(soon.time, T0, "anchor timestamp held");
assert.strictEqual(soon.lastPrice, 101, "running view follows the price");
const later = step(soon, 102, T0 + 10 * MIN);
assert.strictEqual(later.price, 100, "anchor still held after another tab");
assert.strictEqual(later.lastPrice, 102, "running view keeps up");

// After a break, the price last seen before the break becomes the anchor
const back = step(later, 130, T0 + 90 * MIN);
assert.strictEqual(back.price, 102, "anchor = the last price seen before the gap");
assert.strictEqual(back.time, T0 + 10 * MIN, "anchor time = when that was");
assert.strictEqual(back.lastPrice, 130, "running view is the current price");

// ...and it holds again for the whole new visit
const back2 = step(back, 131, T0 + 95 * MIN);
assert.strictEqual(back2.price, 102, "new anchor held through the new visit");

// A gap exactly at the threshold is still the same visit (strictly greater)
const edge = step(first, 105, T0 + 20 * MIN);
assert.strictEqual(edge.price, 100, "20 min exactly does not start a new visit");

// --- since-last-visit toggle ---
assert.strictEqual(run("loadLastSeenEnabled()"), true, "since-last-visit on by default");
run("saveLastSeenEnabled(false)");
assert.strictEqual(run("loadLastSeenEnabled()"), false, "toggle roundtrip");
// Project-wide bool convention: only the literal "true" is on; anything
// else stored is off. The default applies when the key is absent.
store["crypto_chart_last_seen_enabled"] = "maybe";
assert.strictEqual(run("loadLastSeenEnabled()"), false, "non-'true' value reads as off");
delete store["crypto_chart_last_seen_enabled"];
assert.strictEqual(run("loadLastSeenEnabled()"), true, "missing key falls back to the default");

// --- elapsed wording ---
assert.strictEqual(run("describeElapsed(5 * 60000)"), "5 min ago", "minutes");
assert.strictEqual(run("describeElapsed(3 * 3600000)"), "3h ago", "hours");
assert.strictEqual(run("describeElapsed(24 * 3600000)"), "yesterday", "one day");
assert.strictEqual(run("describeElapsed(5 * 24 * 3600000)"), "5 days ago", "days");
assert.strictEqual(run("describeElapsed(60 * 24 * 3600000)"), "a month ago", "long ago");

console.log("ALL STORAGE TESTS PASSED");
