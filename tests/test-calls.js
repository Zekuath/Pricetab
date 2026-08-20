// "Call the cell" storage rules.
//
// These lock in the fix for the defect that made calls unusable over time:
// identity used to be the column index counted back from "now". Because "now"
// moves, column 2 names a different stretch of time every minute, so a fresh
// call could delete an unrelated locked one, and two calls in different
// columns could still cover the same minutes and prices and be drawn on top
// of each other. Identity is absolute geometry now, and this is the guard.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const store = {};
const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Number, String, Boolean,
  parseInt, parseFloat, isFinite, isNaN,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  window: { matchMedia: () => ({ matches: false }) },
};
vm.createContext(sandbox);
const base = path.join(__dirname, "..", "src");
for (const f of ["config.js", "storage.js"]) {
  vm.runInContext(fs.readFileSync(path.join(base, f), "utf8"), sandbox, { filename: f });
}

const HOUR = 3600e3;
const T = Date.now();
// target/span/lo/hi is the rectangle: (target-span, target] × [lo, hi]
const call = (id, targetH, spanH, lo, hi, placed, col = 1) => ({
  id,
  coin: "BTC",
  currency: "USD",
  period: "hour",
  target: T + targetH * HOUR,
  span: spanH * HOUR,
  lo,
  hi,
  col,
  placed: T + placed,
  placedPrice: 43000,
});
const load = (open) => {
  store["crypto_chart_calls"] = JSON.stringify({
    record: { hits: 1, total: 2, streak: 1, best: 1 },
    open,
    done: [],
  });
  return vm.runInContext("loadCalls()", sandbox);
};
// Spread into a host array: values that come back from the vm context carry
// that realm's Array prototype, and deepStrictEqual compares prototypes.
const ids = (r) => [...r.open].map((c) => c.id).sort();

// --- calls that do not touch are all kept -------------------------------
let r = load([
  call("a", 1, 1, 100, 110, 0),
  call("b", 3, 1, 100, 110, 1),
  call("c", 1, 1, 200, 210, 2),
]);
assert.deepStrictEqual(ids(r), ["a", "b", "c"], "disjoint calls all survive");

// --- overlapping in both axes: the earliest one wins ---------------------
r = load([
  call("late", 2, 2, 105, 115, 5000),
  call("early", 2.5, 2, 100, 110, 0),
]);
assert.deepStrictEqual(ids(r), ["early"], "the call that was locked first is kept");

// --- overlapping only in time is not an overlap --------------------------
r = load([
  call("a", 2, 2, 100, 110, 0),
  call("b", 2, 2, 200, 210, 1),
]);
assert.deepStrictEqual(ids(r), ["a", "b"], "same minutes, different prices — both stand");

// --- overlapping only in price is not an overlap -------------------------
r = load([
  call("a", 2, 1, 100, 110, 0),
  call("b", 9, 1, 100, 110, 1),
]);
assert.deepStrictEqual(ids(r), ["a", "b"], "same band, different minutes — both stand");

// --- edges that merely touch are neighbours, not collisions --------------
r = load([
  call("a", 2, 2, 100, 110, 0),   // covers up to T+2h
  call("b", 4, 2, 100, 110, 1),   // starts exactly at T+2h
]);
assert.deepStrictEqual(ids(r), ["a", "b"], "touching edges tile instead of colliding");

// --- the same column index no longer means the same call -----------------
// Both have col 1; they are hours apart, so they are different questions.
r = load([
  call("yesterday", 1, 1, 100, 110, 0, 1),
  call("today", 6, 1, 300, 310, 1, 1),
]);
assert.deepStrictEqual(
  ids(r),
  ["today", "yesterday"],
  "a later call on the same column does not delete an unrelated locked one",
);

// --- whatever survives never overlaps ------------------------------------
r = load([
  call("a", 2, 3, 100, 120, 0),
  call("b", 3, 3, 105, 125, 1),
  call("c", 4, 3, 110, 130, 2),
  call("d", 20, 3, 100, 120, 3),
]);
const hit = (a, b) =>
  a.target - a.span < b.target &&
  b.target - b.span < a.target &&
  a.lo < b.hi &&
  b.lo < a.hi;
for (let i = 0; i < r.open.length; i++) {
  for (let j = i + 1; j < r.open.length; j++) {
    assert.ok(!hit(r.open[i], r.open[j]), "no two surviving calls overlap");
  }
}
assert.ok(r.open.length >= 2, "the disjoint pair is not thrown away with the pile");

// --- nothing is ever dropped over the column number ----------------------
// The board is as wide as it was dragged, so a call can legitimately come back
// from the chart as column 12 — and the store used to require 1 ≤ col ≤ 10 and
// silently keep nothing. `col` is not read from a
// stored call at all now, so neither a missing one nor an absurd one may cost
// the row: what the user locked is what comes back.
r = load([
  { ...call("far", 2, 1, 100, 110, 0), col: 12 },
  { ...call("absent", 5, 1, 100, 110, 1), col: undefined },
  { ...call("nonsense", 8, 1, 100, 110, 2), col: "third" },
]);
assert.deepStrictEqual(
  ids(r),
  ["absent", "far", "nonsense"],
  "a call survives whatever its column number says",
);
assert.ok(
  [...r.open].every((c) => !("col" in c)),
  "and the column number is not written back out",
);

// --- the record cannot claim more than it played -------------------------
const record = (rec) => {
  store["crypto_chart_calls"] = JSON.stringify({ record: rec, open: [], done: [] });
  const out = vm.runInContext("loadCalls()", sandbox).record;
  return { hits: out.hits, total: out.total, streak: out.streak, best: out.best };
};
assert.deepStrictEqual(
  record({ hits: 0, total: 5, streak: 4, best: 5 }),
  { hits: 0, total: 5, streak: 0, best: 0 },
  "a best streak with no hits behind it is not a streak",
);
assert.deepStrictEqual(
  record({ hits: 9, total: 3, streak: 9, best: 9 }),
  { hits: 3, total: 3, streak: 3, best: 3 },
  "more hits than games played is capped at the games played",
);
assert.deepStrictEqual(
  record({ hits: 6, total: 8, streak: 5, best: 2 }),
  { hits: 6, total: 8, streak: 2, best: 2 },
  "a current streak longer than the best one cannot have happened",
);
assert.deepStrictEqual(
  record({ hits: -3, total: 4.7, streak: "5", best: null }),
  { hits: 0, total: 4, streak: 0, best: 0 },
  "junk in the tally reads as zero, not as NaN on the screen",
);

// --- the empty shape is the same shape -----------------------------------
// A fresh install used to come back without `done` at all, so the first call
// ever placed went through a code path no other call ever takes.
store["crypto_chart_calls"] = "not json at all";
const fresh = vm.runInContext("loadCalls()", sandbox);
assert.ok(Array.isArray(fresh.open), "empty store still has an open list");
assert.ok(Array.isArray(fresh.done), "empty store still has a settled list");

// --- over the cap, the newest survive ------------------------------------
// `handlePlaceCall` keeps the newest when it writes; keeping the oldest here
// would mean a reload resurrected calls the session had already dropped.
const cap = vm.runInContext("MAX_OPEN_CALLS", sandbox);
const many = [];
for (let i = 0; i < cap + 6; i++) {
  // Disjoint in price, so nothing is dropped for overlapping
  many.push(call(`c${i}`, 2, 1, 100 + i * 20, 110 + i * 20, i));
}
r = load(many);
assert.strictEqual(r.open.length, cap, "the cap is applied on load");
assert.ok(
  [...r.open].every((c) => Number(c.id.slice(1)) >= 6),
  "and it is the oldest calls that go, not the newest",
);

/* ── Who owns a column, and who gets the big celebration ────────────────
 *
 * `callColumns` / `isLeadingCall` are what the chart's `CALLED · 1ST` tag and
 * the firework both read. The rule was inline in the chart's draw loop until
 * the app needed the same answer at settling time; two copies of it is two
 * things that can disagree about which call was the claim, so it lives in
 * utils.js and this is the guard on it.
 */
// d3's `line()` runs at the top level of utils.js; nothing here draws.
sandbox.line = () => {
  const o = {};
  o.x = () => o;
  o.y = () => o;
  return o;
};
vm.runInContext(
  fs.readFileSync(path.join(base, "utils.js"), "utf8"),
  sandbox,
  { filename: "utils.js" },
);
/* `const` at the top level of a vm script is lexical, so it never lands on
 * the sandbox object — reach the two helpers by evaluating their names. */
const callColumns = vm.runInContext("callColumns", sandbox);
const isLeadingCall = vm.runInContext("isLeadingCall", sandbox);

{
  const at = (h) => T + h * HOUR;
  const c = (id, targetH, placed) => ({ id, target: at(targetH), placed });
  const early = c("early", 2, 1000);
  const late = c("late", 2, 5000);
  const alone = c("alone", 9, 2000);
  const cols = callColumns([early, late, alone]);

  assert.strictEqual(cols.get(at(2)).count, 2, "two calls share the column");
  assert.strictEqual(cols.get(at(2)).first, 1000, "the earliest placed claims it");

  assert.ok(isLeadingCall(early, cols), "first into a contested column leads");
  assert.ok(!isLeadingCall(late, cols), "the one that followed does not");
  /* Both halves of the rule, and this is the half that is easy to lose: a
   * mark every lone call carries says nothing about being first, so a column
   * of one has no leader at all. */
  assert.ok(!isLeadingCall(alone, cols), "a call alone in its column is not leading");

  // A call from another lattice entirely: nothing to be first of
  assert.ok(!isLeadingCall(c("elsewhere", 30, 1), cols), "an unknown column has no leader");
  assert.ok(!isLeadingCall(null, cols), "and nothing is not a leader");
}

console.log("ALL CALLS TESTS PASSED");
