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
  /* Defined in theme.js, which these sandboxes do not load. Anything
   * interpolated into a styled block by every file has to be stubbed
   * here too, or the file throws before a single assertion runs. */
  themedScrollbar: "",
  touchTarget: "",
  touchBox: "",
  besideScreenSpine: "",
  refusedField: "",
  /* The drawer the targets and calls panel is docked in shares its surface
     with the chart's own drawer; both fragments live in theme.js. */
  chartDrawerSurface: "",
  chartDrawerPhone: "",
  /* styles-practice.js (loaded for posType since 21 Sep 2026) extends two
     portfolio components and reads two constants at load; stubbed the same
     way the theme's are. */
  PORTFOLIO_WIDE: 1280,
  PortfolioColumns: styledStub.div,
  PortfolioShell: styledStub.section,
  PortfolioInner: styledStub.div,
  PortfolioEyebrow: styledStub.div,
  /* The terminal's head and its settings sheet (27 Sep 2026) extend the
     portfolio's header and reuse its entrance. */
  PortfolioHeader: styledStub.div,
  portfolioFadeIn: "",
  StatItem: styledStub.div,
  PRACTICE_DEPOSIT_MS: 4000,
  React: { Component: class {}, createElement: () => null, Fragment: Symbol("F") },
  PureComponent: class {},
  createRef: () => ({ current: null }),
  window: { matchMedia: () => ({ matches: false }) },
};
vm.createContext(sandbox);
const base = path.join(__dirname, "..", "src");
// styles-alerts.js comes with it now: the info card is rendered by these tests,
// and its styled-components live there (in load order, before alerts.js)
// alerts-futures.js is the derivatives market, cut out of alerts.js on
// 13 Sep 2026; the panel's constructor calls its factory, so the class cannot
// be built without it
for (const f of [
  "storage.js",
  "i18n.js",
  "config.js",
  /* The alerts styles read the type ladder (posType) from the practice
     styles since 21 Sep 2026, in load order, so the practice styles come
     first here as they do in index.html. */
  "styles-practice.js",
  "styles-alerts.js",
  "alerts-futures.js",
  "practice-page.js",
  "alerts.js",
]) {
  vm.runInContext(fs.readFileSync(`${base}/${f}`, "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);
const json = (code) => JSON.parse(JSON.stringify(run(code)));

/* ── storage validation ─────────────────────────────────────────────────── */

assert.deepStrictEqual(json("loadAlerts()"), [], "no alerts by default");

/* A target written by an older build: no `kind`, `startPrice` or `hitPrice`.
 * Those arrived later, and an entry saved before them is still a valid
 * target — sanitization fills the defaults rather than dropping it. */
const legacy = {
  id: "a1", coin: "BTC", direction: "above", target: 50000,
  currency: "USD", created: 1700000000000, triggeredAt: null,
};
sandbox.__ok = legacy;
run("saveAlerts([__ok])");
assert.deepStrictEqual(
  json("loadAlerts()"),
  [{ ...legacy, kind: "price", startPrice: null, hitPrice: null }],
  "an alert saved before kind/startPrice/hitPrice still loads, with defaults",
);

/* A percent target round-trips as itself — **including the window it was set
 * with**, which is stamped on the target rather than read from a setting: a
 * target is a record of what somebody asked for, and re-reading an old one
 * through a later preference answers a question they never asked. */
const percent = {
  id: "a2", coin: "ETH", kind: "percent", direction: "below", target: 5,
  currency: "USD", created: 1700000000000, startPrice: null,
  triggeredAt: null, hitPrice: null, window: 14400000,
};
sandbox.__pct = percent;
run("saveAlerts([__pct])");
assert.deepStrictEqual(json("loadAlerts()"), [percent], "percent target round-trips");

/* A target written before windows existed is a 24h target, because that is
 * what it was measured against when it was made. */
sandbox.__old = { ...percent, id: "a2b", window: undefined };
run("saveAlerts([__old])");
assert.strictEqual(
  json("loadAlerts()")[0].window,
  86400000,
  "a target from before windows existed defaults to a day",
);
// …and a window nobody offers is the default too, rather than dropping a
// target we can still answer
sandbox.__weird = { ...percent, id: "a2c", window: 999 };
run("saveAlerts([__weird])");
assert.strictEqual(
  json("loadAlerts()")[0].window,
  86400000,
  "an unrecognised window becomes the default rather than losing the target",
);
/* Only the percent kind carries one: a price target with a window would be a
 * field nothing reads, on a record that is kept for years. */
sandbox.__price = { ...legacy, id: "a2d", window: 3600000 };
run("saveAlerts([__price])");
assert.strictEqual(
  "window" in json("loadAlerts()")[0],
  false,
  "a price target has no window at all",
);

// A move nothing makes in a day can never fire, so it is rejected outright
sandbox.__wild = { ...percent, id: "a3", target: 500 };
run("saveAlerts([__wild])");
assert.deepStrictEqual(json("loadAlerts()"), [], "an absurd percent target is dropped");

// Every field is validated; a bad entry is dropped, not repaired into a
// bogus alert that could fire at the wrong price
sandbox.__bad = [
  legacy,
  { ...legacy, id: "b1", coin: "NOTACOIN" },
  { ...legacy, id: "b2", currency: "XYZ" },
  { ...legacy, id: "b3", target: 0 },
  { ...legacy, id: "b4", target: "abc" },
  { ...legacy, id: "b5", direction: "sideways" },
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
sandbox.__many = Array.from({ length: 30 }, (_, i) => ({ ...legacy, id: `m${i}` }));
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
  // Renamed from `price`: it is written down on the target and has to
  // survive long after the moment it describes
  json('findTriggeredAlerts(__alerts, __prices, "USD")')[0].hitPrice,
  150,
  "fired alert reports the price it was hit at",
);

/* ── targets hit while nothing was watching ─────────────────────────────── */

// The whole point: a move that happened and reverted overnight is missed by
// a spot-price check, but the candle high/low still records it.
const armed = {
  id: "over", coin: "BTC", direction: "above", target: 100,
  currency: "USD", created: 5000, triggeredAt: null,
};
const under = {
  id: "under", coin: "BTC", direction: "below", target: 50,
  currency: "USD", created: 5000, triggeredAt: null,
};
const withCandles = (target, candles, price) => {
  sandbox.__t = [target];
  sandbox.__c = candles ? { BTC: candles } : null;
  sandbox.__p = price == null ? {} : { BTC: price };
  return json('findTriggeredAlerts(__t, __p, "USD", __c)');
};

// Spiked to 120 overnight, back to 80 by morning: spot says nothing happened
assert.deepStrictEqual(withCandles(armed, null, 80), [], "spot check alone misses the spike");
const caught = withCandles(
  armed,
  [
    { time: 6000, high: 90, low: 80, close: 85 },
    { time: 7000, high: 120, low: 88, close: 95 },
    { time: 8000, high: 96, low: 79, close: 80 },
  ],
  80,
);
assert.strictEqual(caught.length, 1, "candle high catches the overnight spike");
assert.strictEqual(caught[0].hitAt, 7000, "reports when it was hit, not when noticed");

// Downside targets read the candle low
const caughtLow = withCandles(
  under,
  [
    { time: 6000, high: 90, low: 60, close: 85 },
    { time: 7000, high: 88, low: 45, close: 70 },
  ],
  70,
);
assert.strictEqual(caughtLow[0].hitAt, 7000, "candle low catches the dip");

// Candles from before the target was set must not fire it
assert.deepStrictEqual(
  withCandles(armed, [{ time: 1000, high: 500, low: 400, close: 450 }], 80),
  [],
  "a spike before the target existed does not count",
);

// A live crossing (no candle yet) still fires, flagged as happening now
const live = withCandles(armed, [{ time: 6000, high: 90, low: 80, close: 85 }], 150);
assert.strictEqual(live.length, 1, "spot crossing still fires");
assert.strictEqual(live[0].hitAt, null, "no candle time → reported as current");

// Missing/short candle data degrades to the spot check rather than throwing
assert.deepStrictEqual(withCandles(armed, [], 80), [], "empty candles → spot check");
assert.strictEqual(withCandles(armed, [], 150).length, 1, "empty candles still allow a live fire");

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

/* ── the info card ──────────────────────────────────────────────────────── */
/* The card exists to say three things: what the tab is, where it stands, and
 * which keys reach it. The middle one is the reason it is not a help page — it
 * is read off the same props the list is drawn from — and the reason it needs
 * a test: a state line that goes stale is worse than no state line.
 *
 * `createElement` is swapped for one that keeps its children, so the assertions
 * can read what the panel actually says rather than trusting that it renders.
 */
{
  const realCreate = sandbox.React.createElement;
  sandbox.React.createElement = (type, props, ...children) => ({
    type,
    props,
    children,
  });
  const flatten = (node, out = []) => {
    if (node == null || node === false) return out;
    if (typeof node === "string" || typeof node === "number") {
      out.push(String(node));
      return out;
    }
    if (Array.isArray(node)) {
      node.forEach((n) => flatten(n, out));
      return out;
    }
    if (node.children) flatten(node.children, out);
    return out;
  };
  const said = (props, onCalls, lists) => {
    const Panel = run("AlertsPanel");
    const inst = new Panel(props);
    inst.props = props;
    return flatten(inst.renderInfo(onCalls, lists)).join(" ");
  };

  const ALERTS = [
    { id: "1", coin: "BTC", kind: "price", direction: "above", target: 50000, currency: "USD" },
    { id: "2", coin: "ETH", kind: "percent", direction: "below", target: 5, currency: "USD" },
    { id: "3", coin: "LTC", kind: "price", direction: "above", target: 90, currency: "EUR" },
    { id: "4", coin: "XRP", kind: "price", direction: "above", target: 0.6, currency: "USD", triggeredAt: 1 },
  ];
  const lists = {
    armed: ALERTS.filter((a) => !a.triggeredAt),
    done: ALERTS.filter((a) => a.triggeredAt),
  };

  // Targets: what it is, the counts, and the two conditional lines
  const t = said({ alerts: ALERTS, currency: "USD", activeCoin: "BTC" }, false, lists);
  assert.ok(/tell me when/.test(t), "targets: says what a target is");
  assert.ok(/3 armed · 1 hit · 4 of 10 used/.test(t), `targets: counts — ${t}`);
  assert.ok(/1 paused/.test(t), "targets: names the paused one");
  assert.ok(/never pauses/.test(t), "…and why a move target is not among them");
  assert.ok(/announced in the tab title/.test(t), "targets: announcing is on");
  assert.ok(/\bA\b/.test(t) && /Esc/.test(t) && /Enter/.test(t), "targets: the keys");

  /* Nothing paused when every price target is in the displayed currency — the
   * percent one is there to prove it is not counted either way. */
  const own = [ALERTS[2], ALERTS[1]];
  const eur = said({ alerts: own, currency: "EUR", activeCoin: "BTC" }, false, {
    armed: own,
    done: [],
  });
  assert.ok(/2 armed/.test(eur), "targets: counts follow the lists it is given");
  assert.ok(!/paused/.test(eur), "nothing is paused in its own currency");

  /* …and the other way round: the same list read in a currency none of the
   * price targets were set in pauses every one of them, and only them. */
  const usd = said({ alerts: own, currency: "USD", activeCoin: "BTC" }, false, {
    armed: own,
    done: [],
  });
  assert.ok(/1 paused/.test(usd), `only the price target pauses — ${usd}`);

  // The tab-title line states the setting rather than assuming it
  const quiet = said(
    { alerts: ALERTS, currency: "USD", activeCoin: "BTC", alertTabTitle: false },
    false,
    lists,
  );
  assert.ok(/reported here only/.test(quiet), "targets: says when announcing is off");
  assert.ok(/stops the background checking/.test(quiet), "…and what that costs");

  // Calls, on: the record and the counts
  const on = said(
    {
      alerts: [],
      currency: "USD",
      activeCoin: "BTC",
      predict: true,
      calls: [{ id: "c1" }],
      settledCalls: [{ id: "c2" }, { id: "c3" }],
      callRecord: { hits: 3, total: 7, streak: 1, best: 2 },
    },
    true,
    lists,
  );
  assert.ok(/I say where/.test(on), "calls: says what a call is");
  assert.ok(/On · 1 open · 2 settled/.test(on), `calls: counts — ${on}`);
  assert.ok(/3 of 7 called right/.test(on), "calls: the record");
  assert.ok(/best streak 2/.test(on), "…and the best streak when there is one");
  assert.ok(/worth nothing/.test(on), "calls: says the score is worth nothing");
  /* Not the board's numbers: how far it reaches and what a square is worth are
   * already on screen in the Board strip at the foot of the same tab. */
  assert.ok(!/ahead/.test(on), "calls: does not repeat the board readout");
  /* K reaches the panel, L turns the feature on. K is the newer of the two
   * and the one worth asserting hardest: calls left the targets panel and
   * took their own corner control and their own key with them, so a card that
   * still named only "A" would be pointing at the wrong door. */
  assert.ok(
    /\bK\b/.test(on) && /\bL\b/.test(on) && /\bG\b/.test(on),
    "calls: the keys",
  );

  // Calls, off: the off state has to say the calls are kept, not lost
  const off = said(
    {
      alerts: [],
      currency: "USD",
      activeCoin: "BTC",
      predict: false,
      calls: [{ id: "c1" }, { id: "c2" }],
      settledCalls: [],
      callRecord: { hits: 0, total: 0, streak: 0, best: 0 },
    },
    true,
    lists,
  );
  assert.ok(/^|Off · 2 kept/.test(off) && /2 kept/.test(off), `calls: off — ${off}`);
  /* Off used to pause settling, and the card said so. It no longer does: a
   * call is a claim someone already made, and whether they are still looking
   * at the board does not change whether it came true — a week with calls off
   * used to leave every open one frozen until its evidence scrolled off the
   * range. So the off card has to say the opposite of what it used to, and
   * say what the switch *does* govern. */
  assert.ok(
    /still settling in the background/.test(off),
    `calls: off says settling continues — ${off}`,
  );
  assert.ok(
    /nothing is drawn|not announced/.test(off),
    "…and what being off actually costs",
  );
  assert.ok(!/called right/.test(off), "no record line before anything has settled");

  sandbox.React.createElement = realCreate;
}

/* ── a target on the whole portfolio ────────────────────────────────────────
 *
 * The third kind. It exists because the algorithm research
 * (the working notes §9) says buy and sell signals cannot be built
 * honestly — 0 of 70 permutation tests survive, and on live daily closes
 * "overbought" beat the coin's ordinary month on four of six coins. What a
 * person actually wants when they ask for a sell signal is to be told about
 * *their own money*, and that needs no claim about the market at all.
 */
{
  const arm = (over) => ({
    id: "p1", coin: "", kind: "portfolio", direction: over ? "above" : "below",
    target: 50000, currency: "USD", created: 1, startPrice: 47600,
    triggeredAt: null, hitPrice: null,
  });
  const fire = (alert, total, currency) => {
    sandbox.__a = [alert];
    sandbox.__total = total;
    // `json`, not `run`: a vm-context Array has a different prototype, and
    // `deepStrictEqual` on one fails while printing two identical arrays
    return json(`findTriggeredAlerts(__a, {}, ${JSON.stringify(currency || "USD")}, {}, {}, __total)`);
  };

  assert.strictEqual(fire(arm(true), 47600).length, 0, "below its target, nothing fires");
  const hit = fire(arm(true), 51000);
  assert.strictEqual(hit.length, 1, "the total crossing above fires it");
  assert.strictEqual(hit[0].hitPrice, 51000, "…and the row keeps the total it fired at");
  assert.strictEqual(fire(arm(false), 51000).length, 0, "a 'below' target is not a 'above' one");
  assert.strictEqual(fire(arm(false), 49000).length, 1, "…and fires when the total falls under");

  /* No total is not a total of zero. A held coin without a price makes the sum
   * smaller than the truth, and a "worth less than" target that fired on that
   * would have announced something that did not happen. */
  assert.strictEqual(fire(arm(false), null).length, 0, "no total → nothing fires");
  assert.strictEqual(fire(arm(false), 0).length, 0, "a zero total is treated as no total");

  // Currency-scoped exactly like a price target: a total in USD is not a
  // number you can compare with a target set in EUR
  assert.strictEqual(fire(arm(false), 10, "EUR").length, 0,
    "paused outside the currency it was set in");

  /* Which coins the check has to price. A portfolio target has no coin of its
   * own, so it needs every held one — and must not drag them in when no
   * portfolio target is armed. */
  sandbox.__holdings = [{ coin: "BTC" }, { coin: "ETH" }, { coin: "SOL" }];
  sandbox.__pAlerts = [arm(true)];
  assert.deepStrictEqual(
    json("alertCoinsToWatch(__pAlerts, 'USD', __holdings)").sort(),
    ["BTC", "ETH", "SOL"],
    "an armed portfolio target needs a price for everything held",
  );
  sandbox.__oneCoin = [{ ...arm(true), kind: "price", coin: "BTC" }];
  assert.deepStrictEqual(
    json("alertCoinsToWatch(__oneCoin, 'USD', __holdings)"),
    ["BTC"],
    "…and a plain price target still asks for one coin only",
  );
  sandbox.__doneP = [{ ...arm(true), triggeredAt: 123 }];
  assert.deepStrictEqual(
    json("alertCoinsToWatch(__doneP, 'USD', __holdings)"),
    [],
    "a target that already fired asks for nothing",
  );

  /* A target that cannot fire has to say why.
   *
   * The refusal to sum a partial total is right — a total missing one holding
   * is smaller than the truth, and a "worth less than" target firing on that
   * would announce something that did not happen. What was wrong was that the
   * consequence was silent: the row showed a target, no distance, no meter and
   * no reason. */
  {
    /* Built on the real prototype, not as a plain object. `detail` calls
     * `this.valueOf(a)`, and on a bare `{}` that silently resolves to
     * `Object.prototype.valueOf`, which returns the object itself — so the row
     * rendered "Now $[object Object]" and the test looked like a product bug. */
    sandbox.__props = {
      currency: "USD",
      portfolioTotal: null,
      holdings: [{ coin: "BTC" }, { coin: "STETH" }],
      stats: { BTC: { price: 68000 } },
      formatPrice: (v) => `$${v}`,
    };
    run("__panel = Object.create(AlertsPanel.prototype); __panel.props = __props;");
    sandbox.__row = arm(false);
    const detail = run(
      "AlertsPanel.prototype.detail.call(__panel, __row)",
    );
    assert.ok(
      /Waiting on a price for STETH/.test(detail),
      `it names the holding it is waiting on (${detail})`,
    );
    assert.ok(
      /rather than counted short/.test(detail),
      "…and says the total is refused rather than guessed",
    );
  }

  /* Offered only when there is something to measure — a target on a total that
   * is always zero can never fire. */
  assert.strictEqual(run("hasHoldings([{ coin: 'BTC' }])"), true, "holdings → offer it");
  assert.strictEqual(run("hasHoldings([])"), false, "no holdings → do not");
  assert.strictEqual(run("hasHoldings(null)"), false, "no list at all → do not");

  // It survives a save and reload with no coin, which the whitelist used to
  // drop the record for
  store.crypto_chart_alerts = JSON.stringify([arm(true)]);
  const loaded = json("loadAlerts()");
  assert.strictEqual(loaded.length, 1, "a portfolio target survives a reload");
  assert.strictEqual(loaded[0].kind, "portfolio", "…as a portfolio target");
  assert.strictEqual(loaded[0].coin, "", "…with no coin, which is the point of it");
  delete store.crypto_chart_alerts;
}

/* ── the window a percent target measures over ───────────────────────────
 *
 * It was twenty-four hours and nothing else. "5% in an hour" and "5% in a day"
 * are different events and only one of them was expressible.
 *
 * Detection compares each candle with the one `window / step` earlier, so what
 * has to be true is that the *same* series fires a one-hour target and not a
 * one-day one when the move happened inside an hour — and the other way round
 * for a drift that only adds up over a day.
 */
{
  const HOUR = 3600000;
  const t0 = 1700000000000;
  // 48 hourly candles that climb 0.5% an hour: +12.7% over a day, never more
  // than 0.5% in any one hour
  const drift = [];
  for (let i = 0; i < 48; i++) {
    drift.push({ time: t0 + i * HOUR, close: 100 * Math.pow(1.005, i) });
  }
  sandbox.__drift = drift;
  sandbox.__day = { direction: "above", target: 5, created: 0, window: 86400000 };
  sandbox.__hour = { direction: "above", target: 5, created: 0, window: HOUR };

  assert.ok(
    run("percentHitInCandles(__day, __drift)") > 0,
    "a slow climb reaches 5% over a day",
  );
  assert.strictEqual(
    run("percentHitInCandles(__hour, __drift)"),
    null,
    "…and never moves 5% in any single hour, so the hourly target does not fire",
  );

  // …and a spike: flat, then one candle up 8%, then flat
  const spike = [];
  for (let i = 0; i < 48; i++) {
    spike.push({ time: t0 + i * HOUR, close: i < 24 ? 100 : 108 });
  }
  sandbox.__spike = spike;
  assert.strictEqual(
    run("percentHitInCandles(__hour, __spike)"),
    t0 + 24 * HOUR,
    "a jump inside one hour fires the hourly target, at the candle it happened on",
  );

  /* **A window the series cannot cover answers null rather than guessing.**
   * Four hours of candles cannot say what a day did, and a target that
   * reported on it would be reporting on data it does not have. */
  sandbox.__short = drift.slice(0, 4);
  assert.strictEqual(
    run("percentHitInCandles(__day, __short)"),
    null,
    "a day's window over four candles is refused",
  );

  // The label the row is written from, and the default for anything without one
  assert.strictEqual(run("percentWindowOf({ window: 3600000 })"), 3600000, "the window is read off the target");
  assert.strictEqual(run("percentWindowOf({})"), 86400000, "…and defaults to a day");
  assert.strictEqual(run("percentWindowOf({ window: 999 })"), 86400000, "…as does one nobody offers");
  assert.strictEqual(run("percentWindowLabel(14400000)"), "4h", "the row can name it");
}

/* ── a note, a span, a repeat (21 Sep 2026) ─────────────────────────────
 * Three optional stamps on a target, absent unless set — the window's rule —
 * so a target written before them loads exactly as it did (asserted above). */
{
  const DAY = 86400000;
  sandbox.__stamped = {
    id: "s1", coin: "BTC", kind: "price", direction: "above", target: 50000,
    currency: "USD", created: 1700000000000, triggeredAt: null, hitPrice: null,
    note: "  breakout retest  ", keepFor: 7 * DAY, repeat: true, repeated: 2,
  };
  const s1 = json("sanitizeAlerts([__stamped])")[0];
  assert.strictEqual(s1.note, "breakout retest", "the note is kept, trimmed");
  assert.strictEqual(s1.keepFor, 7 * DAY, "the span is kept");
  assert.strictEqual(s1.repeat, true, "…and the repeat flag");
  assert.strictEqual(s1.repeated, 2, "…and how many times it has spoken");
  assert.ok(!("expiredAt" in s1), "nothing expired carries no expiredAt");

  sandbox.__junk = { ...sandbox.__stamped, id: "s2", note: "x".repeat(200), keepFor: 12345, repeat: "yes" };
  const s2 = json("sanitizeAlerts([__junk])")[0];
  assert.strictEqual(s2.note.length, run("ALERT_NOTE_MAX"), "a note is cut to one line");
  assert.ok(!("keepFor" in s2), "a span nobody offers is dropped, not the target");
  assert.ok(!("repeat" in s2), "repeat is a boolean or nothing");

  sandbox.__pctRepeat = { ...sandbox.__stamped, id: "s3", kind: "percent", target: 5, repeat: true };
  assert.ok(!("repeat" in json("sanitizeAlerts([__pctRepeat])")[0]),
    "a move target cannot repeat — its window passing re-arms it");

  sandbox.__lapsed = { ...sandbox.__stamped, id: "s4", expiredAt: 1700000000000 + 8 * DAY };
  assert.strictEqual(json("sanitizeAlerts([__lapsed])")[0].expiredAt, 1700000000000 + 8 * DAY,
    "an expired target keeps the moment it expired");
  sandbox.__hitAndLapsed = { ...sandbox.__lapsed, id: "s5", triggeredAt: 1700000000000 + DAY };
  assert.ok(!("expiredAt" in json("sanitizeAlerts([__hitAndLapsed])")[0]),
    "a hit target cannot also be expired");

  /* expireAlerts: pure, and returns the same array when nothing changed */
  const T0 = 1700000000000;
  sandbox.__list = [
    { id: "a", coin: "BTC", kind: "price", direction: "above", target: 1, currency: "USD", created: T0, keepFor: DAY },
    { id: "b", coin: "BTC", kind: "price", direction: "above", target: 1, currency: "USD", created: T0 },
    { id: "c", coin: "BTC", kind: "price", direction: "above", target: 1, currency: "USD", created: T0, keepFor: DAY, triggeredAt: T0 + 1 },
  ];
  assert.strictEqual(run("expireAlerts(__list, " + (T0 + DAY - 1) + ") === __list"), true,
    "a span not yet run out changes nothing — same array back");
  const ex = json("expireAlerts(__list, " + (T0 + DAY) + ")");
  assert.strictEqual(ex[0].expiredAt, T0 + DAY, "a span run out marks the target");
  assert.ok(!ex[1].expiredAt, "a target with no span never expires");
  assert.ok(!ex[2].expiredAt, "a hit target is not expired on top");

  /* rearmRepeatingAlerts: only once the price is back on the other side */
  sandbox.__rep = [
    { id: "r", coin: "BTC", kind: "price", direction: "above", target: 50000, currency: "USD",
      created: T0, triggeredAt: T0 + 1, hitPrice: 50100, repeat: true, startPrice: 49000 },
  ];
  assert.strictEqual(run("rearmRepeatingAlerts(__rep, { BTC: 50200 }, " + (T0 + 2) + ") === __rep"), true,
    "still past the line: not re-armed, or one crossing would be reported forever");
  const back = json("rearmRepeatingAlerts(__rep, { BTC: 49800 }, " + (T0 + 3) + ")")[0];
  assert.strictEqual(back.triggeredAt, null, "back across the line: re-armed");
  assert.strictEqual(back.startPrice, 49800, "…from where the price is now");
  assert.strictEqual(back.created, T0 + 3, "…and from now, so the lookback cannot re-report the last crossing");
  assert.strictEqual(back.repeated, 1, "…and counted");
  sandbox.__once = [{ ...sandbox.__rep[0], repeat: false }];
  assert.strictEqual(run("rearmRepeatingAlerts(__once, { BTC: 49800 }, " + (T0 + 3) + ") === __once"), true,
    "a once-only target stays hit");

  /* an expired target neither fires nor costs a price */
  sandbox.__exp = [{ id: "e", coin: "BTC", kind: "price", direction: "above", target: 1, currency: "USD",
    created: T0, keepFor: DAY, expiredAt: T0 + DAY }];
  assert.deepStrictEqual(json("findTriggeredAlerts(__exp, { BTC: 99999 }, 'USD', {}, {}, null)"), [],
    "an expired target does not fire");
  assert.deepStrictEqual(json("alertCoinsToWatch(__exp, 'USD', [])"), [], "…and is not watched");
  assert.deepStrictEqual(json("alertCoinsToWatch(__rep, 'USD', [])"), ["BTC"],
    "a hit repeating target is still watched — it is waiting to re-arm");
}

console.log("ALERT TESTS OK");
