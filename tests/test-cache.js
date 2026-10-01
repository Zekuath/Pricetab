// Persistent price cache tests: hydrate on load, debounced persist, caps.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const vm = require("vm");
const assert = require("assert");

const NOW = Date.now();
const makeSandbox = (store) => {
  const sb = {
    console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number,
    parseInt, parseFloat, isFinite, isNaN, setTimeout, clearTimeout, Error, AbortController,
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "api.js"), "utf8"), sb, { filename: "api.js" });
  return sb;
};

(async () => {
  // --- hydrate: fresh entry restored, 25h-old + corrupt entries skipped ---
  const store1 = {
    crypto_chart_price_cache: JSON.stringify([
      ["BTC-day-USD-history", { data: [{ price: 1, time: 1 }], timestamp: NOW - 60000 }],
      ["ETH-day-USD-history", { data: [], timestamp: NOW - 25 * 3600000 }],
      ["broken", null],
      "not-an-entry",
    ]),
  };
  const sb1 = makeSandbox(store1);
  const run1 = (c) => vm.runInContext(c, sb1);
  assert.strictEqual(run1("cache.size"), 1, "only fresh entry hydrated");
  const got = run1('getCachedData("BTC", "day", "USD", "history")');
  /* A minute-old day series is **not** stale any more, and that is the change
   * rather than a slipped assertion: the TTL is now one point's worth of the
   * series' own time (a day series is quoted about every 4.8 minutes), so a
   * minute-old copy cannot be missing anything. */
  assert.ok(got, "hydrated entry readable");
  assert.strictEqual(got.isStale, false, "a 1-minute-old day series is still current");
  assert.strictEqual(got.data[0].price, 1, "hydrated data intact");

  /* ── the TTL is per range ───────────────────────────────────────────────
   * One 30-second TTL covered every series, so a year chart was re-fetched on
   * every new tab and on every coin switch — data that cannot change more
   * than once a day. Measured on a warm profile, a tab opened two minutes
   * later cost 8 requests; with these it costs 3.
   */
  {
    const ttlStore = {
      crypto_chart_price_cache: JSON.stringify([
        ["BTC-hour-USD-history", { data: [{ price: 1, time: 1 }], timestamp: NOW - 45000 }],
        ["BTC-week-USD-history", { data: [{ price: 1, time: 1 }], timestamp: NOW - 45000 }],
        ["BTC-year-USD-history", { data: [{ price: 1, time: 1 }], timestamp: NOW - 3600000 }],
        ["BTC-current-USD-spot", { data: 42, timestamp: NOW - 45000 }],
      ]),
    };
    const sb = makeSandbox(ttlStore);
    const stale = (coin, period, type) =>
      vm.runInContext(`getCachedData("${coin}", "${period}", "USD", "${type}").isStale`, sb);

    assert.strictEqual(stale("BTC", "hour", "history"), true,
      "45s-old hour series is stale — the 1H range keeps the 30s floor");
    assert.strictEqual(stale("BTC", "week", "history"), false,
      "45s-old week series is not: a week series gains a point every ~33 min");
    assert.strictEqual(stale("BTC", "year", "history"), false,
      "an hour-old year series is not stale — its points are a day apart");
    assert.strictEqual(stale("BTC", "current", "spot"), true,
      "a spot price is still 30 seconds, whatever the range is doing");
    // An unknown period must not silently inherit a long TTL
    vm.runInContext(`cache.set("BTC-bogus-USD-history", { data: 1, timestamp: ${NOW} - 45000, lastAccessed: ${NOW} })`, sb);
    assert.strictEqual(stale("BTC", "bogus", "history"), true,
      "an unrecognised range falls back to the flat 30 seconds");
  }

  // --- corrupt JSON: no crash, empty cache ---
  const sb2 = makeSandbox({ crypto_chart_price_cache: "{{{" });
  assert.strictEqual(vm.runInContext("cache.size", sb2), 0, "corrupt JSON ignored");

  // --- persist: setCachedData debounce-writes, capped at 30 newest ---
  const store3 = {};
  const sb3 = makeSandbox(store3);
  const run3 = (c) => vm.runInContext(c, sb3);
  run3(`
    const coins = ["BTC"];
    for (let i = 0; i < 35; i++) {
      setCachedData("BTC", "p" + i, "USD", "history", [i], coins);
    }
  `);
  assert.ok(!store3.crypto_chart_price_cache, "not written before debounce fires");
  await new Promise((r) => setTimeout(r, 1300));
  const persisted = JSON.parse(store3.crypto_chart_price_cache);
  assert.ok(Array.isArray(persisted), "persisted as array");
  assert.ok(persisted.length <= 30, "capped at 30 entries, got " + persisted.length);
  assert.ok(persisted[0][1].timestamp >= persisted[persisted.length - 1][1].timestamp, "newest first");

  // --- round trip: a second context hydrates what the first persisted ---
  const sb4 = makeSandbox(store3);
  assert.ok(vm.runInContext("cache.size", sb4) > 0, "second tab hydrates persisted cache");
  const firstKey = persisted[0][0];
  const parts = firstKey.split("-"); // COIN-period-CURRENCY-type
  assert.ok(
    vm.runInContext(`getCachedData("${parts[0]}", "${parts[1]}", "${parts[2]}", "${parts[3]}")`, sb4),
    "persisted entry survived the round trip",
  );

  /* ── the logarithmic price axis ──────────────────────────────────────────
 *
 * It exists because of a measurement: on Coinbase's own BTC `period=all`
 * series the first half of the history occupies **15.8% of a linear y-range**
 * — 63 px of a 400 px chart — against 72.2% on a log one. What is asserted
 * here is the property that makes that true, and the two ways it is allowed to
 * refuse.
 */
{
  const box = makeRealSandbox({});
  const geo = (log) =>
    vm.runInContext(`
      scalePricesCore([{ price: 1, time: new Date(0) },
                       { price: 10, time: new Date(1000) },
                       { price: 100, time: new Date(2000) }],
        400, 800, 0, 0, 0, 0, null, null, ${log})
        .map((p) => Math.round(p.price));
    `, box);

  /* Ten is the geometric middle of one and a hundred, so on a log axis it
   * lands halfway up the plot — and on a linear one it sits near the floor,
   * which is the whole complaint about long ranges in one line. */
  const lin = geo(false);
  const log = geo(true);
  assert.strictEqual(log[1], 200, "the geometric middle is the middle of a log plot");
  assert.ok(lin[1] > 350, `…and near the floor on a linear one (${lin[1]})`);
  assert.strictEqual(log[0], 400, "the ends are the ends either way");
  assert.strictEqual(log[2], 0, "…top and bottom");

  /* **A log axis needs every price above zero.** A series that touches zero
   * falls back to linear rather than drawing nothing: a chart that cannot be
   * drawn logarithmically is still a chart. */
  const zeroed = vm.runInContext(`
    scalePricesCore([{ price: 0, time: new Date(0) }, { price: 100, time: new Date(1000) }],
      400, 800, 0, 0, 0, 0, null, null, true)
      .map((p) => Math.round(p.price));
  `, box);
  // Stringified: an array built inside the vm is not `deepStrictEqual` to one
  // built out here, whatever it holds.
  assert.strictEqual(
    JSON.stringify(zeroed), "[400,0]",
    "a range that reaches zero falls back to linear",
  );

  // A reference line has to sit on the axis the series was drawn on, or it
  // marks a level the price never reached
  const ref = vm.runInContext(`
    const pair = [{ price: 1, time: new Date(0) }, { price: 100, time: new Date(1000) }];
    [priceToChartY(pair, 10, 400, 0, 0, false), priceToChartY(pair, 10, 400, 0, 0, true)];
  `, box);
  assert.ok(Math.abs(ref[1] - 200) < 0.5, "a level is placed on the log axis too");
  assert.ok(ref[0] > 350, `…and on the linear one where it belongs (${Math.round(ref[0])})`);
}

console.log("ALL CACHE TESTS PASSED");
})().catch((e) => { console.error(e.message); process.exit(1); });

// ── Regression: Date fields must survive the persist→hydrate round trip ──
// (real pipeline: formatValueHistory → setCachedData → persist → new tab
//  hydrates → scaleTime must NOT produce NaN coordinates)
const makeRealSandbox = (store) => {
  const sb = {
    console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number,
    parseInt, parseFloat, isFinite, isNaN, setTimeout, clearTimeout, Error, AbortController,
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
  };
  sb.window = sb;
  sb.self = sb;
  vm.createContext(sb);
  const base2 = ROOT;
  vm.runInContext(fs.readFileSync(`${base2}/vendor/d3-custom.min.js`, "utf8"), sb, { filename: "d3-custom" });
  // Same list `src/theme.js` destructures, including the log scale the long
  // ranges use — a sandbox missing one of them fails as "not defined" inside
  // a helper rather than where the omission is
  vm.runInContext("const { easeCubicOut, extent, line, scaleLinear, scaleLog, scaleTime, select } = d3;", sb);
  for (const f of ["storage.js", "i18n.js", "config.js", "api.js", "widgets-data.js", "utils.js"]) {
    vm.runInContext(fs.readFileSync(`${base2}/src/${f}`, "utf8"), sb, { filename: f });
  }
  return sb;
};

(async () => {
  const store = {};
  const tab1 = makeRealSandbox(store);
  vm.runInContext(`
    const raw = Array.from({ length: 24 }, (_, i) => ({
      price: String(50000 + i * 10),
      time: Math.floor(Date.now() / 1000) - (24 - i) * 3600,
    }));
    const formatted = formatValueHistory(raw);
    setCachedData("BTC", "hour", "USD", "history", formatted, ["BTC"]);
  `, tab1);
  await new Promise((r) => setTimeout(r, 1300)); // let the debounced persist fire
  assert.ok(store.crypto_chart_price_cache, "history persisted");

  const tab2 = makeRealSandbox(store); // fresh tab hydrates
  const result = vm.runInContext(`
    const cached = getCachedData("BTC", "hour", "USD", "history");
    if (!cached || !cached.data) throw new Error("no hydrated history");
    if (!(cached.data[0].time instanceof Date)) throw new Error("time not revived to Date");
    const scaled = scalePricesCore(cached.data, 400, 800, 24, 24);
    const lineGen = line().x((d) => d.time).y((d) => d.price);
    lineGen(scaled);
  `, tab2);
  assert.strictEqual(typeof result, "string", "path generated");
  assert.ok(!result.includes("NaN"), "no NaN coordinates in hydrated chart path");

  // corrupted legacy entry (ISO strings from the pre-fix persist) also revives
  const store2 = { crypto_chart_price_cache: JSON.stringify([
    ["BTC-hour-USD-history", { data: [{ price: 50000, time: new Date().toISOString() }], timestamp: Date.now() - 60000 }],
    ["ETH-hour-USD-history", { data: [{ price: 1700, time: "total garbage" }], timestamp: Date.now() - 60000 }],
  ]) };
  const tab3 = makeRealSandbox(store2);
  assert.ok(
    vm.runInContext('getCachedData("BTC", "hour", "USD", "history").data[0].time instanceof Date', tab3),
    "legacy ISO-string entry revived to Date",
  );
  assert.strictEqual(
    vm.runInContext('getCachedData("ETH", "hour", "USD", "history")', tab3),
    null,
    "unrevivable entry discarded",
  );

  console.log("ALL DATE-REVIVAL REGRESSION TESTS PASSED");
})().catch((e) => { console.error(e.message); process.exit(1); });
