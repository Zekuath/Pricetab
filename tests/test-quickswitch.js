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
  /* Defined in theme.js, which these sandboxes do not load. Anything
   * interpolated into a styled block by every file has to be stubbed
   * here too, or the file throws before a single assertion runs. */
  themedScrollbar: "",
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
// Cross-realm: a vm-context Array has a different prototype, so anything
// compared with deepStrictEqual (or iterated with host helpers) comes back
// through JSON first
const json = (code) => JSON.parse(JSON.stringify(run(code)));
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

/* ── compare mode ────────────────────────────────────────────────────────
 * The same picker chooses the coin to compare against, with the coin already
 * on the chart taken out: plotted against itself it is a flat line at zero,
 * so offering it is offering an empty chart.
 */
const matchExcluding = (q, owned, exclude) => {
  sandbox.__q = q;
  sandbox.__owned = owned;
  sandbox.__ex = exclude;
  return JSON.parse(
    JSON.stringify(run("quickSwitchMatches(__q, __owned, __ex)")),
  ).map((r) => r.coin);
};

assert.ok(match("BTC", OWNED).includes("BTC"), "normally BTC is offered");
assert.ok(
  !matchExcluding("BTC", OWNED, "BTC").includes("BTC"),
  "the coin already on the chart is not offered to compare against itself",
);
// Excluding one coin must not disturb the rest of the list
assert.deepStrictEqual(
  matchExcluding("", OWNED, "ETH"),
  match("", OWNED).filter((c) => c !== "ETH"),
  "only the excluded coin is removed, ordering is untouched",
);
assert.deepStrictEqual(
  matchExcluding("", OWNED, null),
  match("", OWNED),
  "no exclusion behaves exactly like the plain jumper",
);

/* ── the one matcher, and the two things folding the portfolio in needed ────
 *
 * There were three coin searches: this one, the targets panel's (folded in on
 * 21 Aug) and the portfolio's own substring filter (22 Aug). The portfolio
 * needed two things this did not do, and both are now part of it rather than
 * a fourth copy.
 */
{
  // 1. `exclude` takes a list, not only one symbol. The compare picker means
  //    "not the coin already on the chart"; the portfolio means "none of the
  //    coins I already hold", and they are the same idea.
  const many = json('quickSwitchMatches("", ["BTC", "ETH", "LTC"], ["ETH"])');
  assert.ok(
    many.every((m) => m.coin !== "ETH"),
    "a list of exclusions is honoured, not just a single symbol",
  );
  assert.ok(many.some((m) => m.coin === "BTC"), "…and the rest still come back");
  const one = json('quickSwitchMatches("", ["BTC", "ETH"], "ETH")');
  assert.ok(one.every((m) => m.coin !== "ETH"), "a single symbol still works");

  /* 2. The pool is what may be offered at all. `sanitizePortfolio` accepts
   *    anything `isWatchableCoin` knows, so searching only `SUGGESTED_COINS`
   *    offered **less than the storage layer would keep** — stETH and friends
   *    could be acquired by watching an address and never typed in. */
  const narrow = json('quickSwitchMatches("steth", [])');
  assert.strictEqual(narrow.length, 0, "stETH is not a coin this app can chart");
  const wide = json('quickSwitchMatches("steth", [], null, HOLDABLE_COINS)');
  assert.ok(
    wide.some((m) => m.coin === "STETH"),
    `…and is a coin it can hold (${JSON.stringify(wide.map((m) => m.coin))})`,
  );
  // The wider pool must not lose anything the narrow one had
  assert.ok(
    json('quickSwitchMatches("bit", [], null, HOLDABLE_COINS)').some((m) => m.coin === "BTC"),
    "the wider pool still finds an ordinary coin by name",
  );

  // 3. Ranking is the point of folding it in: the portfolio's old filter was
  //    a substring test that ranked nothing
  const ranked = json('quickSwitchMatches("ET", [], null, HOLDABLE_COINS)').map((m) => m.coin);
  assert.strictEqual(ranked[0], "ETH", `an exact-prefix symbol leads (${ranked.join(",")})`);
}

console.log("QUICK SWITCH TESTS OK");
