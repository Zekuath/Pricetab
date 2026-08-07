// Price alert tests: storage validation and the trigger logic that decides
// when an alert fires. Runs config.js + storage.js + alerts.js in a vm.
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

const store = {};
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
  React: { Component: class {}, createElement: () => null, Fragment: Symbol("F") },
  PureComponent: class {},
  createRef: () => ({ current: null }),
  window: { matchMedia: () => ({ matches: false }) },
};
vm.createContext(sandbox);
const base = path.join(__dirname, "..", "src");
for (const f of ["config.js", "storage.js", "alerts.js"]) {
  vm.runInContext(fs.readFileSync(`${base}/${f}`, "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);
const json = (code) => JSON.parse(JSON.stringify(run(code)));

/* ── storage validation ─────────────────────────────────────────────────── */

assert.deepStrictEqual(json("loadAlerts()"), [], "no alerts by default");

const ok = {
  id: "a1", coin: "BTC", direction: "above", target: 50000,
  currency: "USD", created: 1700000000000, triggeredAt: null,
};
sandbox.__ok = ok;
run("saveAlerts([__ok])");
assert.deepStrictEqual(json("loadAlerts()"), [ok], "valid alert round-trips");

// Every field is validated; a bad entry is dropped, not repaired into a
// bogus alert that could fire at the wrong price
sandbox.__bad = [
  ok,
  { ...ok, id: "b1", coin: "NOTACOIN" },
  { ...ok, id: "b2", currency: "XYZ" },
  { ...ok, id: "b3", target: 0 },
  { ...ok, id: "b4", target: "abc" },
  { ...ok, id: "b5", direction: "sideways" },
  null,
  "junk",
];
assert.deepStrictEqual(
  json("sanitizeAlerts(__bad).map((a) => a.id)"),
  ["a1"],
  "invalid coin/currency/target/direction dropped",
);

// Lowercase coin/currency normalise rather than getting dropped
assert.deepStrictEqual(
  json('sanitizeAlerts([{ ...__ok, coin: "btc", currency: "usd" }])[0].coin'),
  "BTC",
  "coin uppercased",
);

// The stored list can never exceed the cap
sandbox.__many = Array.from({ length: 30 }, (_, i) => ({ ...ok, id: `m${i}` }));
assert.strictEqual(run("sanitizeAlerts(__many).length"), run("MAX_ALERTS"), "capped at MAX_ALERTS");

store["crypto_chart_alerts"] = "not json{";
assert.deepStrictEqual(json("loadAlerts()"), [], "corrupt JSON falls back to none");

/* ── trigger logic ──────────────────────────────────────────────────────── */

const alerts = [
  { id: "up", coin: "BTC", direction: "above", target: 100, currency: "USD", created: 1, triggeredAt: null },
  { id: "down", coin: "ETH", direction: "below", target: 50, currency: "USD", created: 1, triggeredAt: null },
  { id: "done", coin: "BTC", direction: "above", target: 10, currency: "USD", created: 1, triggeredAt: 123 },
  { id: "eur", coin: "BTC", direction: "above", target: 1, currency: "EUR", created: 1, triggeredAt: null },
];
sandbox.__alerts = alerts;
const fired = (prices, currency) => {
  sandbox.__prices = prices;
  return json(`findTriggeredAlerts(__alerts, __prices, "${currency}")`).map((a) => a.id);
};

assert.deepStrictEqual(fired({ BTC: 99, ETH: 51 }, "USD"), [], "nothing fires below/above target");
assert.deepStrictEqual(fired({ BTC: 100 }, "USD"), ["up"], "above fires at exactly the target");
assert.deepStrictEqual(fired({ BTC: 150 }, "USD"), ["up"], "above fires past the target");
assert.deepStrictEqual(fired({ ETH: 50 }, "USD"), ["down"], "below fires at exactly the target");
assert.deepStrictEqual(fired({ ETH: 10 }, "USD"), ["down"], "below fires under the target");
assert.deepStrictEqual(
  fired({ BTC: 150, ETH: 10 }, "USD").sort(),
  ["down", "up"],
  "several alerts can fire at once",
);

// Already-triggered alerts never re-fire, and alerts set in another currency
// stay paused rather than being compared against the wrong number
assert.ok(!fired({ BTC: 99999 }, "USD").includes("done"), "triggered alert doesn't re-fire");
assert.ok(!fired({ BTC: 99999 }, "USD").includes("eur"), "other-currency alert stays paused");
assert.deepStrictEqual(fired({ BTC: 99999 }, "EUR"), ["eur"], "fires once that currency is active");

// Missing or junk prices are simply skipped
assert.deepStrictEqual(fired({}, "USD"), [], "no price → no fire");
assert.deepStrictEqual(fired({ BTC: 0 }, "USD"), [], "zero price ignored");
assert.deepStrictEqual(fired({ BTC: "abc" }, "USD"), [], "junk price ignored");
assert.deepStrictEqual(fired({ BTC: "150" }, "USD"), ["up"], "numeric string price works");

// The fired alert carries the price that triggered it
sandbox.__prices = { BTC: 150 };
assert.strictEqual(
  json('findTriggeredAlerts(__alerts, __prices, "USD")')[0].price,
  150,
  "fired alert reports the observed price",
);

/* ── which coins need prices ────────────────────────────────────────────── */

assert.deepStrictEqual(
  json('alertCoinsToWatch(__alerts, "USD")').sort(),
  ["BTC", "ETH"],
  "armed alerts in the active currency need prices",
);
assert.deepStrictEqual(
  json('alertCoinsToWatch(__alerts, "EUR")'),
  ["BTC"],
  "only the matching-currency alerts count",
);
assert.deepStrictEqual(json("alertCoinsToWatch([], 'USD')"), [], "no alerts → nothing to fetch");

console.log("ALERT TESTS OK");
