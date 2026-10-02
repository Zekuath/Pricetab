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
  /* A fuller stub than a getItem/setItem pair: `buildSettingsBackup` walks the
   * store by index, the way a browser lets you, precisely so that a new
   * setting cannot be left out of a backup by being forgotten in a list. */
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    key: (i) => {
      const keys = Object.keys(store);
      return i >= 0 && i < keys.length ? keys[i] : null;
    },
    get length() {
      return Object.keys(store).length;
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
for (const f of ["storage.js", "i18n.js", "config.js", "widgets-data.js", "utils.js"]) {
  vm.runInContext(fs.readFileSync(`${base}/${f}`, "utf8"), sandbox, {
    filename: f,
  });
}

const run = (code) => vm.runInContext(code, sandbox);
// Objects created inside a vm have different prototypes; compare their JSON.
const json = (code) => JSON.parse(JSON.stringify(run(code)));

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

/* Adding a widget means touching four lists in two files, and a card wired
 * into three of them is invisible with nothing to say why. Each of these was
 * a real step while the network-fee and worst-fall cards were built. */
{
  const keys = Object.keys(run("DEFAULT_WIDGETS"));
  const order = run("DEFAULT_WIDGET_ORDER").slice();
  const listed = run("WIDGET_GROUPS").flatMap((g) => g.items.map((i) => i.key));
  const described = Object.keys(run("WIDGET_DESCRIPTIONS"));
  for (const k of keys) {
    assert.ok(order.includes(k), `${k}: missing from DEFAULT_WIDGET_ORDER — it would never draw`);
    assert.ok(listed.includes(k), `${k}: missing from WIDGET_GROUPS — no way to switch it on`);
    assert.ok(described.includes(k), `${k}: no description, so the card has no tooltip`);
  }
  for (const k of order) {
    assert.ok(keys.includes(k), `${k}: in the order but not in DEFAULT_WIDGETS`);
  }
  for (const k of listed) {
    assert.ok(keys.includes(k), `${k}: offered in Settings but not a real widget`);
  }
  assert.strictEqual(order.length, keys.length, "the order lists every widget exactly once");
  assert.strictEqual(new Set(order).size, order.length, "no widget appears twice in the order");
}

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

// --- chart detail (OHLC) toggle ---
assert.strictEqual(run("loadOhlcEnabled()"), true, "chart details on by default");
run("saveOhlcEnabled(false)");
assert.strictEqual(run("loadOhlcEnabled()"), false, "chart details toggle roundtrip");
delete store["crypto_chart_ohlc_enabled"];
assert.strictEqual(run("loadOhlcEnabled()"), true, "missing key falls back to the default");

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

/* ── The quota, and who is allowed to lose data to it ──────────────────
 *
 * The caches are capped by entry count and never against a byte budget, so a
 * tab that has met a lot of coins can fill the origin with data that exists
 * only to save a request — and then the portfolio somebody just typed fails to
 * save, silently. A failed write now spends the caches, cheapest first, and
 * retries. Nothing a person authored is ever evicted to make room.
 */
{
  // A store that refuses anything once it is holding too much
  const LIMIT = 400;
  const tight = {};
  const bytes = () =>
    Object.keys(tight).reduce((n, k) => n + k.length + tight[k].length, 0);
  sandbox.localStorage = {
    getItem: (k) => (k in tight ? tight[k] : null),
    setItem: (k, v) => {
      const value = String(v);
      const after = bytes() - (k in tight ? k.length + tight[k].length : 0) + k.length + value.length;
      if (after > LIMIT) {
        const e = new Error("QuotaExceededError");
        e.name = "QuotaExceededError";
        throw e;
      }
      tight[k] = value;
    },
    removeItem: (k) => { delete tight[k]; },
  };

  // Fill the space with rebuildable cache data
  tight["crypto_chart_price_cache"] = "p".repeat(150);
  tight["crypto_chart_ticker_cache"] = "t".repeat(150);

  const held = [{ coin: "BTC", amount: 1, lots: [], watches: [] }];
  sandbox.__held = held;
  run("savePortfolioToStorage(__held)");
  assert.notStrictEqual(
    sandbox.localStorage.getItem("crypto_chart_portfolio"),
    null,
    "a portfolio write survives a full quota",
  );
  assert.strictEqual(
    sandbox.localStorage.getItem("crypto_chart_price_cache"),
    null,
    "…by spending the cheapest cache first",
  );
  assert.notStrictEqual(
    sandbox.localStorage.getItem("crypto_chart_ticker_cache"),
    null,
    "…and no more of them than it had to",
  );

  /* A cache that cannot save is not worth evicting another cache for: it
   * simply starts cold next time, which is what a cache is for. */
  const before = sandbox.localStorage.getItem("crypto_chart_ticker_cache");
  sandbox.__big = "w".repeat(500);
  const ok = run('saveJsonSetting("crypto_chart_widget_cache", __big)');
  assert.strictEqual(ok, false, "a cache write that does not fit simply fails");
  assert.strictEqual(
    sandbox.localStorage.getItem("crypto_chart_ticker_cache"),
    before,
    "…and takes nothing else down with it",
  );

  // The caller is told, so an import can say so rather than losing data quietly
  assert.strictEqual(
    run('saveSetting("crypto_chart_theme", "dark")'),
    true,
    "a write that fits reports success",
  );
}

/* ── the price-only tier ─────────────────────────────────────────────────
 *
 * Thirty-two coins in Coinlore's top hundred that this app could not track and
 * whose prices it was already downloading. They are holdable and not
 * chartable — the shape stETH and friends have had since August — so what is
 * asserted here is that the two lists agree: what the search offers is what
 * storage keeps, and neither is a second copy of the other.
 */
{
  assert.ok(
    run('PRICED_ONLY_COINS.includes("TRX")'),
    "the tier holds the coins it was built from",
  );
  /* **Upper-case, because that is what the cache is keyed by.** The sweep
   * calls `.toUpperCase()` on Coinlore's own symbol, so `USDe` is `USDE`
   * there — a list holding a mixed-case spelling would look up a key that
   * never exists, and the row would sit at `—` for ever. */
  assert.ok(
    run("PRICED_ONLY_COINS.every((c) => c === c.toUpperCase())"),
    "every symbol in the tier is upper-cased, like the cache keys",
  );
  /* …and nothing in it is already a chart coin: a coin in both lists would be
   * marked "no chart" on a row that has one. */
  assert.strictEqual(
    run("PRICED_ONLY_COINS.filter((c) => SUGGESTED_COINS.includes(c)).length"),
    0,
    "the tier and the chart coins do not overlap",
  );

  /* Kept by storage — the half of the agreement this file can see. That the
   * search *offers* it is asserted in `tests/test-quickswitch.js`, which is
   * where `quickSwitchMatches` is loaded. The two used to be separate tests of
   * separate lists; the sanitizer reads `HOLDABLE_COINS` now, so they are two
   * views of one. */
  assert.deepStrictEqual(
    json('sanitizePortfolio([{ coin: "TRX", amount: 100 }]).map((h) => h.coin)'),
    ["TRX"],
    "…and survives a save and a reload",
  );
  assert.deepStrictEqual(
    json('sanitizePortfolio([{ coin: "NOTACOIN", amount: 1 }])'),
    [],
    "…while the whitelist is still a whitelist",
  );
  assert.ok(
    run('isPricedOnlyCoin("TRX")') && !run('isPricedOnlyCoin("BTC")'),
    "and the search can tell which rows have no chart",
  );
}

/* ── backing up everything ───────────────────────────────────────────────
 *
 * There are sixty-four `crypto_chart_*` keys and, before this, one export path
 * — the portfolio's. What is asserted here is the boundary: which keys go into
 * a file, which keys a file is allowed to put back, and that undoing a restore
 * is the state before rather than an approximation of it.
 */
{
  /* Its own store, because the quota block above replaced `sandbox.localStorage`
   * with a tight stub that has no `key`/`length` — and walking the store by
   * index is exactly what this feature does. */
  const store = {};
  sandbox.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => {
      const keys = Object.keys(store);
      return i >= 0 && i < keys.length ? keys[i] : null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
  store["crypto_chart_currency"] = "EUR";
  store["crypto_chart_portfolio"] = '[{"coin":"BTC"}]';
  store["crypto_chart_theme"] = "dark";
  // Caches are rebuildable from the network and are not part of anybody's
  // settings: a backup of a price cache is dead weight, stale before it lands
  store["crypto_chart_price_cache"] = "{}";
  store["crypto_chart_news_archive"] = "[]";
  // Not ours, and never touched either way
  store["some_other_extension"] = "x";

  const backup = json("buildSettingsBackup()");
  assert.deepStrictEqual(
    Object.keys(backup.keys).sort(),
    ["crypto_chart_currency", "crypto_chart_portfolio", "crypto_chart_theme"],
    "a backup is everything a person typed or chose, and none of the caches",
  );
  assert.strictEqual(backup.app, "pricetab", "…stamped, so a stray file is refused");

  /* Read is not write. The count is what the panel shows before anybody
   * commits, and the only step of a restore that cannot be undone is the
   * reading of it. */
  sandbox.__file = {
    app: "pricetab",
    at: 1700000000000,
    keys: {
      crypto_chart_currency: "JPY",
      crypto_chart_refresh_interval: "60000",
      crypto_chart_price_cache: "{}", // a cache: refused
      not_ours_at_all: "x", // not our prefix: refused
      "crypto_chart_BAD KEY": "x", // not a key shape we write: refused
      crypto_chart_huge: "x".repeat(600000), // past the per-value bound
    },
  };
  const found = json("readSettingsBackup(__file)");
  assert.deepStrictEqual(
    Object.keys(found.keys).sort(),
    ["crypto_chart_currency", "crypto_chart_refresh_interval"],
    "a file can only put back keys that look like ours and are not caches",
  );
  assert.strictEqual(found.count, 2, "…and says how many, before writing any");
  assert.strictEqual(
    run('readSettingsBackup({ app: "somethingelse", keys: { crypto_chart_theme: "x" } })'),
    null,
    "a file that is not ours is refused outright",
  );
  assert.strictEqual(run("readSettingsBackup(null)"), null, "…and so is nothing at all");

  // Nothing was written by the reading
  assert.strictEqual(store["crypto_chart_currency"], "EUR", "reading a file writes nothing");

  sandbox.__found = found;
  const result = json("restoreSettingsBackup(__found)");
  assert.strictEqual(result.written, 2, "restoring writes what it said it would");
  assert.strictEqual(store["crypto_chart_currency"], "JPY", "…replacing what was there");
  assert.strictEqual(
    store["crypto_chart_refresh_interval"], "60000",
    "…and adding what was not",
  );
  /* **A restore adds and replaces; it does not clear.** A key the file has no
   * opinion about is a setting the backup predates, and dropping it would make
   * "restore my settings" mean "and forget everything since". */
  assert.strictEqual(
    store["crypto_chart_portfolio"], '[{"coin":"BTC"}]',
    "a holding the backup knew nothing about is left alone",
  );

  const pending = json("pendingBackupUndo()");
  assert.strictEqual(pending.count, 2, "the way back covers both kinds of change");

  assert.strictEqual(run("undoBackupRestore()"), true, "undo runs");
  assert.strictEqual(store["crypto_chart_currency"], "EUR", "…putting back what was overwritten");
  /* The key the restore *added* has to go, or undo leaves behind a setting
   * that was never there — which is the half of this that is easy to miss. */
  assert.strictEqual(
    "crypto_chart_refresh_interval" in store, false,
    "…and removing what it added",
  );
  assert.strictEqual(run("pendingBackupUndo()"), null, "…and the offer is spent");

  // A stale offer is no offer: an undo a month later undoes something the
  // person has since built on
  store["crypto_chart_backup_undo"] = JSON.stringify({
    at: Date.now() - 2 * 86400000,
    keys: { crypto_chart_theme: "light" },
  });
  assert.strictEqual(run("pendingBackupUndo()"), null, "an undo older than a day is not offered");
}

// --- indicator lines: a set now, and the single choice before it ---
// Through the sandbox's own localStorage: a block above swaps in a stub of
// its own, so the outer `store` is no longer the one being read.
{
  sandbox.localStorage.removeItem("crypto_chart_indicator_overlays");
  sandbox.localStorage.removeItem("crypto_chart_indicator_overlay");
  assert.strictEqual(JSON.stringify(json("loadIndicatorOverlays()")), "[]", "no overlay by default");
  sandbox.localStorage.setItem("crypto_chart_indicator_overlay", "donchian");
  assert.strictEqual(JSON.stringify(json("loadIndicatorOverlays()")), '["donchian"]',
    "the single choice stored before the set existed is read as its first member");
  sandbox.localStorage.setItem("crypto_chart_indicator_overlay", "none");
  assert.strictEqual(JSON.stringify(json("loadIndicatorOverlays()")), "[]", "…and a stored none is an empty set");
  run('saveIndicatorOverlays(["supertrend", "bollinger"])');
  assert.strictEqual(JSON.stringify(json("loadIndicatorOverlays()")), '["bollinger","supertrend"]',
    "once the set is written it wins over the old key, read back in the settings' own order");
  sandbox.localStorage.setItem("crypto_chart_indicator_overlays", '["bollinger","nonsense","none",7]');
  assert.strictEqual(JSON.stringify(json("loadIndicatorOverlays()")), '["bollinger"]',
    "an unknown kind, none and a non-string are dropped");
  sandbox.localStorage.setItem("crypto_chart_indicator_overlays", "{broken");
  assert.strictEqual(JSON.stringify(json("loadIndicatorOverlays()")), "[]",
    "an unreadable set falls back to the old key, here none");
}

// --- the companion's metrics switched off ---
{
  sandbox.localStorage.removeItem("crypto_chart_companion_hidden");
  assert.strictEqual(JSON.stringify(json("loadCompanionHidden()")), "[]", "every metric shown by default");
  run('saveCompanionHidden(["breakout-high", "hs"])');
  assert.strictEqual(JSON.stringify(json("loadCompanionHidden()")), '["breakout-high","hs"]', "hidden metrics roundtrip");
  sandbox.localStorage.setItem("crypto_chart_companion_hidden", '{"hs":true}');
  assert.strictEqual(JSON.stringify(json("loadCompanionHidden()")), "[]", "a stored shape that is not a list hides nothing");
  sandbox.localStorage.setItem("crypto_chart_companion_hidden", JSON.stringify(["hs", 3, null, "x".repeat(80)]));
  assert.strictEqual(JSON.stringify(json("loadCompanionHidden()")), '["hs"]', "only short strings are kept");
}

// --- headlines saved to read later ---
{
  const clean = json(`sanitizeNewsSaved([
    { url: "https://a.example/1", title: "One", source: "A", time: 5, savedAt: 9 },
    { url: "https://a.example/1", title: "One again" },
    { url: "http://a.example/2", title: "Not https" },
    { url: "javascript:alert(1)", title: "Script" },
    { url: "https://a.example/3", title: "   " },
    { url: "https://a.example/4", title: "Four", time: "x", savedAt: -1 },
    null, 7, "text",
  ])`);
  assert.strictEqual(clean.map((x) => x.title).join("|"), "One|Four",
    "only an https link with a title is kept, and each link once");
  assert.strictEqual(clean[1].time, 0, "a time that is not a number is no time");
  assert.strictEqual(clean[1].savedAt, 0, "…and a negative save time is none");
  const many = Array.from({ length: 150 }, (_, i) => ({ url: `https://a.example/${i}`, title: `T${i}` }));
  assert.strictEqual(run(`sanitizeNewsSaved(${JSON.stringify(many)}).length`), run("NEWS_SAVED_MAX"),
    "the list stops at its cap");
  sandbox.localStorage.setItem("crypto_chart_news_saved", "{not json");
  assert.strictEqual(JSON.stringify(json("loadNewsSaved()")), "[]", "an unreadable list is an empty one");
}

/* The widgets drawer's width (27 Sep 2026): absent until the edge moves,
 * clamped on the way in and out, and null — "the default" — when unreadable. */
{
  sandbox.localStorage.removeItem("crypto_chart_widgets_width");
  assert.strictEqual(run("loadWidgetsWidthFromStorage()"), null, "nothing stored is the default width");
  run("saveWidgetsWidthToStorage(640.4)");
  assert.strictEqual(sandbox.localStorage.getItem("crypto_chart_widgets_width"), "640", "a width is stored whole");
  assert.strictEqual(run("loadWidgetsWidthFromStorage()"), 640, "…and read back");
  run("saveWidgetsWidthToStorage(20)");
  assert.strictEqual(run("loadWidgetsWidthFromStorage()"), run("WIDGETS_WIDTH_MIN"), "below the floor is the floor");
  sandbox.localStorage.setItem("crypto_chart_widgets_width", "99999");
  assert.strictEqual(run("loadWidgetsWidthFromStorage()"), run("WIDGETS_WIDTH_MAX"), "a hand-edited giant is the ceiling");
  sandbox.localStorage.setItem("crypto_chart_widgets_width", '"wide"');
  assert.strictEqual(run("loadWidgetsWidthFromStorage()"), null, "a width that is not a number is the default");
  run("saveWidgetsWidthToStorage(null)");
  assert.strictEqual(run("loadWidgetsWidthFromStorage()"), null, "the double-click's null is the default again");
  assert.strictEqual(run("clampWidgetsWidth(900, 700)"), 700, "the window's ceiling wins over the width asked for");
  assert.strictEqual(run("clampWidgetsWidth(900, 100)"), run("WIDGETS_WIDTH_MIN"),
    "…but never takes it under the floor, however narrow the window");
  assert.strictEqual(run("clampWidgetsWidth(NaN)"), null, "no number, no width");
}

// The chart's drawings: rebuilt field by field, so a stored shape keeps only
// what the sanitizer names — and a hand-edited file cannot put a NaN into a
// line, a note longer than the cap, or a coin the app cannot draw
{
  const good = { id: "d-1", kind: "hline", currency: "USD", a: { t: 1.7e12, p: 80000 }, at: 1 };
  const clean = json(`sanitizeDrawings(${JSON.stringify({
    BTC: [
      good,
      { id: "d-2", kind: "trend", currency: "USD", a: { t: 1.7e12, p: 80000 }, b: { t: 1.7e12 + 6e6, p: 81000 }, note: "  up  ", at: 2 },
      { id: "d-3", kind: "trend", currency: "USD", a: { t: 1.7e12, p: 80000 }, at: 3 },
      { id: "d-4", kind: "circle", currency: "USD", a: { t: 1.7e12, p: 80000 }, at: 4 },
      { id: "d-5", kind: "hline", currency: "USD", a: { t: 1.7e12, p: "NaN" }, at: 5 },
      { id: "d-6", kind: "hline", currency: "XXX", a: { t: 1.7e12, p: 1 }, at: 6 },
      { id: "d-1", kind: "hline", currency: "USD", a: { t: 1.7e12, p: 2 }, at: 7 },
      { id: "<script>", kind: "hline", currency: "USD", a: { t: 1.7e12, p: 2 }, at: 8 },
      { id: "d-9", kind: "note", currency: "EUR", a: { t: 1.7e12, p: 2 }, note: "x".repeat(500), at: 9, extra: "dropped" },
    ],
    NOTACOIN: [good],
    ETH: "not a list",
  })})`);
  assert.deepStrictEqual(Object.keys(clean), ["BTC"], "a coin the app cannot draw, or a list that is not one, is gone");
  assert.deepStrictEqual(clean.BTC.map((d) => d.id), ["d-1", "d-2", "d-9"],
    "a kind nobody draws, a missing second anchor, a price that is not a number, a currency not offered, a repeated id and an id that is not one are all dropped");
  assert.strictEqual(clean.BTC[1].note, "up", "a note is trimmed");
  assert.strictEqual(clean.BTC[2].note.length, run("DRAWING_NOTE_MAX"), "…and cut to its length");
  assert.ok(!("extra" in clean.BTC[2]), "a field the sanitizer does not name is not kept");
  assert.ok(!("b" in clean.BTC[0]), "a one-anchor kind carries no second anchor");
  const many = Array.from({ length: 70 }, (_, i) => Object.assign({}, good, { id: `d-${i}`, at: i }));
  const capped = json(`sanitizeDrawings(${JSON.stringify({ BTC: many })})`);
  assert.strictEqual(capped.BTC.length, run("DRAWINGS_MAX_PER_COIN"), "at most the cap a coin");
  assert.strictEqual(capped.BTC[capped.BTC.length - 1].id, "d-69", "…the newest kept");
  assert.deepStrictEqual(json("sanitizeDrawings(null)"), {}, "nothing stored is no drawings");
  console.log("  ✔ drawings sanitized: kinds, anchors, currency, ids, notes, the cap");
}

console.log("ALL STORAGE TESTS PASSED");
