// Quick switch tests: the match/ranking function behind the "/" coin jumper.
// Loads config.js + quickswitch.js in a vm with stubbed React/styled.
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
  React: { Component: class {}, createElement: () => null, Fragment: Symbol("F") },
  PureComponent: class {},
  createRef: () => ({ current: null }),
  window: { matchMedia: () => ({ matches: false }) },
};
vm.createContext(sandbox);
const base = path.join(__dirname, "..", "src");
for (const f of ["config.js", "quickswitch.js"]) {
  vm.runInContext(fs.readFileSync(`${base}/${f}`, "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);
const match = (q, owned) => {
  sandbox.__q = q;
  sandbox.__owned = owned;
  return JSON.parse(
    JSON.stringify(run("quickSwitchMatches(__q, __owned)")),
  ).map((r) => r.coin);
};

const OWNED = ["ETH", "LTC"];

// An empty query lists the user's own coins — the common "jump" case
assert.deepStrictEqual(match("", OWNED), ["ETH", "LTC"], "empty query lists owned coins");

// Exact symbol wins, and owned coins outrank unowned ones
assert.strictEqual(match("ETH", OWNED)[0], "ETH", "exact symbol first");
assert.strictEqual(match("BTC", OWNED)[0], "BTC", "unowned exact match still found");

// Prefix beats substring
const solResults = match("SOL", OWNED);
assert.strictEqual(solResults[0], "SOL", "symbol prefix ranks first");

// Name search works (BTC's full name is Bitcoin)
assert.ok(match("bitcoin", OWNED).includes("BTC"), "matches on full name");
assert.ok(match("bit", OWNED).includes("BTC"), "matches on name prefix");

// Case and whitespace don't matter
assert.deepStrictEqual(match("  eth ", OWNED), match("ETH", OWNED), "trimmed + case-insensitive");

// Owned coins sort ahead even when an unowned coin scores better textually
const ethFirst = match("t", ["ETH"]);
assert.strictEqual(ethFirst[0], "ETH", "owned coin leads the list");

// Result list stays bounded
assert.ok(match("", []).length === 0, "no owned coins, empty query → nothing");
assert.ok(match("a", OWNED).length <= 8, "results capped");

// Junk finds nothing
assert.deepStrictEqual(match("zzzzzz", OWNED), [], "no matches → empty");

// The owned flag tells the caller whether picking adds the coin
sandbox.__q = "BTC";
sandbox.__owned = OWNED;
const btc = JSON.parse(JSON.stringify(run("quickSwitchMatches(__q, __owned)")))[0];
assert.strictEqual(btc.owned, false, "unowned coin flagged for adding");
sandbox.__q = "ETH";
const eth = JSON.parse(JSON.stringify(run("quickSwitchMatches(__q, __owned)")))[0];
assert.strictEqual(eth.owned, true, "owned coin flagged as a plain switch");

console.log("QUICK SWITCH TESTS OK");
