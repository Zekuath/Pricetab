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
  assert.ok(got && got.isStale, "hydrated entry readable and marked stale");
  assert.strictEqual(got.data[0].price, 1, "hydrated data intact");

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
  vm.runInContext("const { easeCubicOut, extent, line, scaleLinear, scaleTime, select } = d3;", sb);
  for (const f of ["config.js", "api.js", "storage.js", "widgets-data.js", "utils.js"]) {
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
