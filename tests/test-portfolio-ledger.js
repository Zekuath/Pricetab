// The portfolio's ledger views (src/portfolio-ledger.js): the records put
// back in date order, and the return with the money moved in and out taken
// out of it — the two places where a plausible-looking answer is easy to
// get wrong. Runs the portfolio's files in a vm context with inert stubs.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const tagged = () => {
  const fn = () => fn;
  fn.attrs = () => tagged();
  fn.withComponent = () => tagged();
  return new Proxy(fn, { get: (t, p) => (p in t ? t[p] : tagged()), apply: () => tagged() });
};
const styledStub = new Proxy(function styled() { return tagged(); }, {
  get: () => tagged(),
  apply: () => tagged(),
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
  keyframes: tagged(),
  css: tagged(),
  themedScrollbar: "",
  touchTarget: "",
  touchBox: "",
  besideScreenSpine: "",
  refusedField: "",
  React: { Component: class {}, createElement: () => null, Fragment: Symbol("Fragment") },
  PureComponent: class {},
  Component: class {},
  Fragment: Symbol("Fragment"),
  createRef: () => ({ current: null }),
  window: { matchMedia: () => ({ matches: false }) },
};
vm.createContext(sandbox);
const base = path.join(__dirname, "..", "src");
for (const f of ["storage.js", "i18n.js", "config.js", "sanctions.js", "styles-portfolio.js", "tax-world.js", "tax-report.js", "portfolio-ledger.js", "tax-guide.js", "portfolio.js"]) {
  vm.runInContext(fs.readFileSync(`${base}/${f}`, "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);
const json = (code) => JSON.parse(JSON.stringify(run(code)));
const sec = (iso) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 1000);
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} ≠ ${b}`);

/* ── records, in date order ─────────────────────────────────────────────── */
{
  /* One purchase of 0.5 at 30,000 a coin, 0.3 of it sold since: stored as a
     0.2 lot and a 0.3 slice on the sale. The timeline must show the purchase
     that happened — one line, 0.5 for 15,000 — not two half-purchases. */
  sandbox.__h = [{
    coin: "BTC", amount: 0.2, watches: [],
    lots: [{ amount: 0.2, paid: 6000, time: sec("2024-03-01"), source: "manual", currency: "USD" }],
    sales: [{ amount: 0.3, received: 28000, basis: 9000, basisAmount: 0.3, time: sec("2025-02-10"), currency: "USD",
      matched: [{ amount: 0.3, cost: 9000, acquired: sec("2024-03-01"), source: "manual" }] }],
  }];
  const { events, undated } = json("ledgerEvents(__h)");
  assert.strictEqual(undated, 0);
  assert.deepStrictEqual(events.map((e) => [e.kind, e.amount, e.money]), [["sell", 0.3, 28000], ["buy", 0.5, 15000]],
    "newest first; the sold slice and the held part are one purchase again");
  close(events[0].gain, 19000, "a sale carries what it realized");

  /* Two purchases on one day at different prices are two purchases. */
  sandbox.__two = [{ coin: "ETH", amount: 2, watches: [], sales: [],
    lots: [{ amount: 1, paid: 2000, time: sec("2025-01-15") }, { amount: 1, paid: 2100, time: sec("2025-01-15") }] }];
  assert.strictEqual(json("ledgerEvents(__two)").events.length, 2, "a different unit price is a different purchase");

  /* An undated lot partly sold is still one undated record, counted once. */
  sandbox.__undated = [{ coin: "SOL", amount: 1, watches: [],
    lots: [{ amount: 1, paid: 100, time: 0 }],
    sales: [{ amount: 1, received: 150, basis: 100, basisAmount: 1, time: sec("2025-05-01"), matched: [{ amount: 1, cost: 100, acquired: 0 }] }] }];
  const u = json("ledgerEvents(__undated)");
  assert.strictEqual(u.undated, 1, "the held part and the slice of one undated purchase count as one");
  assert.deepStrictEqual(u.events.map((e) => e.kind), ["sell"], "…and only the dated sale is placed on the timeline");

  /* Income and chain lots keep what they are. */
  sandbox.__kinds = [{ coin: "ETH", amount: 0.1, sales: [],
    lots: [{ amount: 0.05, paid: 150, time: sec("2025-08-01"), kind: "income" }],
    watches: [{ address: "x", amount: 0.05, lots: [{ amount: 0.05, paid: 140, time: sec("2025-07-01"), source: "chain" }] }] }];
  assert.deepStrictEqual(json("ledgerEvents(__kinds)").events.map((e) => e.kind), ["income", "chain"]);
}

/* ── the return: a purchase is not a gain, a receipt is ─────────────────── */
{
  const t = [sec("2025-06-01"), sec("2025-06-02"), sec("2025-06-03")];
  sandbox.__hist = { BTC: [100, 100, 110].map((price, i) => ({ price, time: new Date(t[i] * 1000) })) };
  /* One coin held throughout (undated), a second arriving between the first
     two points; the price is flat, then up 10%. The value goes 100 → 200 →
     220; what the coins did is 0% then +10%. */
  const holding = (kind) => [{
    coin: "BTC", amount: 2, watches: [], sales: [],
    lots: [{ amount: 1, paid: 90, time: 0 }, { amount: 1, paid: 100, time: t[0] + 3600, ...(kind ? { kind } : {}) }],
  }];
  sandbox.__bought = holding();
  const run1 = json("ledgerSteps(__hist, __bought, 'fifo')");
  assert.deepStrictEqual(run1.steps.map((s) => Math.round(s.r * 1e9) / 1e9), [0, 0.1],
    "the step the purchase lands in returns nothing: the coins arrived, the price did not move");
  close(json("ledgerMonths(ledgerSteps(__hist, __bought, 'fifo'), Date.UTC(2025, 6, 1))").whole, 0.1, "the whole range is +10%, not the +120% the value moved");

  sandbox.__received = holding("income");
  const run2 = json("ledgerSteps(__hist, __received, 'fifo')");
  close(run2.steps[0].r, 1, "a coin received as income doubled the holding with nothing paid in: that is return");

  /* A sale takes money out the same way. Sold 1 of 2 on day two, at 100:
     the value halves, and the return is still 0% then +10%. */
  sandbox.__sold = [{
    coin: "BTC", amount: 1, watches: [],
    lots: [{ amount: 1, paid: 90, time: 0 }],
    sales: [{ amount: 1, received: 100, basis: 90, basisAmount: 1, time: t[0] + 3600, matched: [{ amount: 1, cost: 90, acquired: 0 }] }],
  }];
  assert.deepStrictEqual(json("ledgerSteps(__hist, __sold, 'fifo')").steps.map((s) => Math.round(s.r * 1e9) / 1e9), [0, 0.1],
    "money taken out is not a loss");
}

/* ── months: chained, and a month the range starts inside is partial ────── */
{
  const day = 86400000;
  const from = Date.UTC(2025, 0, 20);
  const steps = [];
  for (let i = 1; i <= 40; i++) steps.push({ time: from + i * day, r: 0.01 });
  sandbox.__run = { steps, from, to: from + 40 * day };
  const m = json("ledgerMonths(__run, Date.UTC(2025, 5, 1))");
  assert.deepStrictEqual(m.months.map((x) => [x.month, x.steps, x.partial]), [[0, 11, true], [1, 28, false], [2, 1, false]],
    "January begins mid-month and is partial; February is whole");
  close(m.months[1].r, Math.pow(1.01, 28) - 1, "a month is its steps chained, not summed");
  assert.strictEqual(m.best.month, 1, "best and worst come from whole months only");
  assert.strictEqual(m.full, 2);
}

/* ── one holding's facts ────────────────────────────────────────────────── */
{
  const now = sec("2026-09-28");
  sandbox.__row = {
    coin: "ETH", price: 3000, amount: 2,
    lots: [
      { amount: 1, paid: 2000, time: sec("2025-01-15"), currency: "USD" },
      { amount: 0.5, paid: 1500, time: sec("2026-06-01"), currency: "USD", kind: "income" },
      { amount: 0.5, paid: 900, time: 0, currency: "EUR" },
    ],
    priced: [
      { amount: 1, paid: 2000, time: sec("2025-01-15"), currency: "USD" },
      { amount: 0.5, paid: 1500, time: sec("2026-06-01"), currency: "USD", kind: "income" },
    ],
    sales: [{ amount: 0.2, received: 500, currency: "USD", matched: [{ amount: 0.2, cost: 250, acquired: sec("2024-12-01"), kind: "income" }] }],
  };
  const f = json(`ledgerAssetFacts(__row, "USD", ${now})`);
  close(f.average, 3500 / 1.5, "average cost over the lots in the currency on screen");
  close(f.unrealized, 3000 * 1.5 - 3500, "unrealized over the same lots");
  close(f.income, 1750, "income: the held receipt and the one sold since");
  assert.strictEqual(f.receipts, 2);
  close(f.longShare, 1 / 1.5, "held over a year, as a share of what has a date");
  assert.strictEqual(f.first, sec("2024-12-01"), "first bought reads the sold slices too");
}

console.log("PORTFOLIO LEDGER TESTS OK");
