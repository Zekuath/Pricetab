/* The outlook (src/outlook.js): what the window's own history says about the
 * next stretch, before there is a contract. Every fixture is built so its
 * answer is known before the function runs — a reading found in noise would
 * pass or fail by luck. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const SRC = path.join(__dirname, "..", "src");
const sandbox = { console, Math, Number, Array, isFinite, JSON, Object, String, Set, Date };
vm.createContext(sandbox);
/* utils.js needs a few globals from earlier files; the outlook only reads
   `baseRateFor` off it, so the rest is stubbed to nothing. */
sandbox.msg = (k, d) => d;
sandbox.SUGGESTED_COINS = [];
sandbox.CURRENCY_OPTIONS = [];
sandbox.PERIOD_OPTIONS = [];
sandbox.COIN_NAMES = {};
sandbox.window = sandbox;
sandbox.document = { addEventListener() {}, createElement: () => ({ style: {} }) };
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
/* d3's line() runs at the top level of utils.js; nothing here draws. */
sandbox.line = () => {
  const o = {};
  o.x = () => o;
  o.y = () => o;
  return o;
};
for (const f of ["config.js", "storage.js", "utils.js", "outlook.js"]) {
  try {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), "utf8"), sandbox, { filename: f });
  } catch (e) {
    if (f === "outlook.js") throw e;
    /* A file before the outlook throwing on a missing global is fine as long
       as `baseRateFor` landed; asserted below. */
  }
}
const run = (code) => vm.runInContext(code, sandbox);
/* Arrays made inside the sandbox carry its Array prototype, which
   deepStrictEqual compares; the shape is what is being asserted. */
const same = (a, b, label) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), label);
assert.strictEqual(run("typeof baseRateFor"), "function", "utils.js loaded far enough for baseRateFor");
assert.strictEqual(run("typeof outlookCone"), "function", "outlook.js loaded");

const HOUR = 3600;
const series = (prices, vols) =>
  prices.map((p, i) => ({ price: p, time: 1700000000 + i * HOUR, ...(vols ? { vol: vols[i] } : {}) }));

/* 1. Returns and the value area. */
{
  const r = run("outlookReturns")(series([100, 110, 99]));
  assert.strictEqual(r.length, 2);
  assert.ok(Math.abs(r[0] - Math.log(1.1)) < 1e-12, "a log return");
  /* Forty bars: thirty at 100 with big volume, ten spread from 50 to 150 with
     none — the point of control is 100 and the area is tight around it. */
  const rows = [];
  for (let i = 0; i < 30; i += 1) rows.push({ price: 100 + (i % 3) * 0.1, vol: 100 });
  for (let i = 0; i < 10; i += 1) rows.push({ price: 50 + i * 11, vol: 1 });
  const va = run("outlookValueArea")(rows);
  assert.ok(va && Math.abs(va.poc - 100) < 3, `POC near 100: ${va && va.poc}`);
  assert.ok(va.val <= 100 && va.vah >= 100 && va.vah - va.val < 20, `a tight area: ${va.val}–${va.vah}`);
  assert.ok(va.weighted, "…weighted by the volume it was given");
  const flat = run("outlookValueArea")(rows.map((p) => ({ price: p.price })));
  assert.ok(flat && !flat.weighted, "without volume every bar weighs one, and it says so");
}

/* 2. Location states are read against the bars before, never the whole window. */
{
  const prices = [];
  for (let i = 0; i < 200; i += 1) prices.push(100 + Math.sin(i / 5) * 2);
  /* Then a jump: the last bar is far above anything the previous 96 traded. */
  prices.push(140);
  const states = run("outlookLocationStates")(series(prices), 96);
  assert.strictEqual(states.length, prices.length);
  assert.strictEqual(states[95], null, "no state until there is a window behind the bar");
  assert.strictEqual(states[states.length - 1], "above", "a jump above the trailing area reads above");
  const mid = states.slice(96, 200).filter((s) => s === "inside").length;
  assert.ok(mid > 80, `an oscillating market mostly sits inside its own area (${mid} of 104)`);
}

/* 3. The chain: counts are exact, damping keeps every cell off zero, rows under
      the floor refuse their probabilities, and the walk converges. */
{
  const chain = run("outlookChain");
  /* A deterministic cycle below → inside → above → below … 30 times. */
  const cyc = [];
  for (let i = 0; i < 90; i += 1) cyc.push(["below", "inside", "above"][i % 3]);
  const c = chain(cyc, { minRow: 12, damping: 0.15, ahead: 3 });
  assert.strictEqual(c.n, 89, "89 transitions in 90 bars");
  assert.strictEqual(c.current, "above");
  assert.strictEqual(c.rows.below.to.inside, 30, "below always went to inside");
  assert.strictEqual(c.rows.below.to.above, 0, "…and never to above, as a count");
  assert.ok(c.rows.below.p.above > 0 && c.rows.below.p.above < 0.1, "…but the damped probability is small, not zero");
  assert.ok(c.rows.below.p.inside > 0.85, "…and the seen transition keeps most of the mass");
  assert.ok(c.ahead && c.ahead.above > c.ahead.below && c.ahead.above > c.ahead.inside, "three steps on from above the cycle is back at above");
  const thin = chain(["below", "inside", "below", "inside", "below"], { minRow: 12 });
  assert.strictEqual(thin.rows.below.n, 2, "a thin row keeps its count");
  assert.strictEqual(thin.rows.below.p, null, "…and refuses its probabilities");
  assert.strictEqual(thin.next.p, null, "…so the reading from it has none either");
  const none = chain([null, null], {});
  assert.strictEqual(none.rows, null, "no transitions, no chain");
}

/* 4. Episodes: what followed the last times the market entered this state. */
{
  /* Every entry into "below" is followed by a rise of 5 over 3 bars; other
     bars drift down. Built so the state of a bar is given, not derived. */
  const prices = [100];
  const states = [null];
  for (let i = 1; i < 300; i += 1) {
    const entering = i % 20 === 0;
    states.push(entering ? "below" : "inside");
    prices.push(prices[i - 1] + (states[i - 3] === "below" ? 5 : -0.1));
  }
  states[states.length - 1] = "below";
  const ep = run("outlookEpisodes")(series(prices), states, 3);
  assert.ok(ep && ep.state === "below" && ep.n >= 12, `enough episodes counted (${ep && ep.n})`);
  assert.ok(ep.up > 90 && ep.baseUp < 50, `after entering below the price rose (${ep.up}% vs ${ep.baseUp}% of all bars)`);
  assert.ok(ep.edge != null && ep.edge > 0, "…and the edge is printed only because n is enough");
}

/* 5. Horizons from the series' own spacing. */
{
  const h = run("outlookHorizonBars")(series(new Array(200).fill(100)), [
    { label: "1h", seconds: HOUR },
    { label: "4h", seconds: 4 * HOUR },
    { label: "1d", seconds: 24 * HOUR },
    { label: "1w", seconds: 168 * HOUR },
  ]);
  same(h.map((x) => x.bars), [1, 4, 24], "hourly bars: 1, 4, 24 — a week is more than half the window and is refused");
  same(run("outlookHorizonBars")(series([100, 100]), [{ label: "1h", seconds: HOUR }]), [], "too short to space");
}

/* 6. The cone: replayable, refuses a short window, rises on a rising window,
      is near-symmetric on a symmetric one, and conditions on the state when
      it can. */
{
  const cone = run("outlookCone");
  const rising = [];
  for (let i = 0; i < 120; i += 1) rising.push(100 * Math.pow(1.01, i));
  const up = cone(series(rising), { horizons: [5, 20], paths: 500, seed: 1 });
  assert.strictEqual(up.n, 500);
  assert.strictEqual(up.horizons.length, 2);
  assert.ok(up.horizons[1].p5 > up.from, "every path of a window that only rises lands above the start");
  assert.strictEqual(up.horizons[1].up, 500, "…all 500 of them");
  assert.ok(up.horizons[1].p50 > up.horizons[0].p50, "further out is further up");
  const again = cone(series(rising), { horizons: [5, 20], paths: 500, seed: 1 });
  same(again.horizons, up.horizons, "the same seed replays the same cone");
  const flip = [];
  let p = 1000;
  for (let i = 0; i < 400; i += 1) {
    p = i % 2 ? p * 1.02 : p / 1.02;
    flip.push(p);
  }
  /* An odd horizon: with equal up and down steps an even count of them can
     land exactly on the start, and a tie is neither above nor below. */
  const sym = cone(series(flip), { horizons: [21], paths: 2000, seed: 7, block: 1 });
  const h = sym.horizons[0];
  assert.ok(Math.abs(h.up / 2000 - 0.5) < 0.08, `a symmetric window lands above the start about half the time (${h.up} of 2000)`);
  assert.ok(h.p5 < sym.from && h.p95 > sym.from && h.p25 <= h.p50 && h.p50 <= h.p75, "quantiles are ordered around the start");
  assert.strictEqual(cone(series(rising.slice(0, 20)), { horizons: [5] }).n, 0, "a window under 30 bars is refused");
  /* Conditioning: bars in state "below" are followed by a rise, bars "inside"
     by a fall. Conditioned on "below", the cone must lean up; unconditioned
     it must not. */
  const cp = [100];
  const st = [null];
  for (let i = 1; i < 300; i += 1) {
    const s = i % 2 ? "below" : "inside";
    st.push(s);
    cp.push(cp[i - 1] * (st[i - 1] === "below" ? 1.03 : 1 / 1.03));
  }
  st[st.length - 1] = "below";
  const cond = cone(series(cp), { horizons: [1], paths: 1000, seed: 3, block: 1, states: st });
  assert.ok(cond.conditioned && cond.state === "below", "conditioned on the current state when there are enough such bars");
  assert.ok(cond.horizons[0].up > 900, `…and the next bar after a below bar rose (${cond.horizons[0].up} of 1000)`);
  const uncond = cone(series(cp), { horizons: [1], paths: 1000, seed: 3, block: 1 });
  assert.ok(!uncond.conditioned && Math.abs(uncond.horizons[0].up - 500) < 80, `…while the whole window is a coin flip (${uncond.horizons[0].up})`);
  const few = cone(series(cp), { horizons: [1], paths: 200, seed: 3, block: 1, states: st.map((s, i) => (i > 280 ? s : null)) });
  assert.ok(!few.conditioned, "…and falls back to the whole window, saying so, when the state is rare");
}

/* 7. The volatility regime and participation. */
{
  const calm = [];
  let v = 100;
  for (let i = 0; i < 120; i += 1) {
    v *= i % 2 ? 1.001 : 1 / 1.001;
    calm.push(v);
  }
  /* …then 24 wild bars. */
  for (let i = 0; i < 24; i += 1) {
    v *= i % 2 ? 1.03 : 1 / 1.03;
    calm.push(v);
  }
  const reg = run("outlookVolRegime")(series(calm));
  assert.ok(reg && reg.regime === "expanding" && reg.ratio > 5, `the last day is wild against the four before (${reg && reg.ratio})`);
  assert.ok(reg.pct > 0.95, "…and ranks at the top of every 24-bar window in the range");
  assert.ok(reg.ac1 < -0.5, "an alternating series is strongly mean-reverting at lag 1");
  const flat = run("outlookVolRegime")(series(calm.slice(0, 120)));
  assert.ok(flat.regime === "steady", "the calm stretch alone is steady");
  assert.strictEqual(run("outlookVolRegime")(series([1, 2, 3])), null, "too short, null");
  const part = run("outlookParticipation")(series(new Array(50).fill(100), new Array(50).fill(10).map((x, i) => (i === 49 ? 100 : x))));
  assert.ok(part && part.pct > 0.97 && part.n === 50, "a bar ten times its peers is the top percentile");
  assert.strictEqual(run("outlookParticipation")(series(new Array(50).fill(100))), null, "no volume, no participation");
}

/* 8. Setup codes and the record by setup. */
{
  const codes = run("outlookSetupCodes")({
    vol: { regime: "expanding", ac1: -0.2 },
    location: "below",
    tape: { buyers: 0.7 },
    book: { bidShare: 0.5 },
    stop: true,
    withinPlan: false,
  });
  same(codes, ["env:expanding", "env:damped", "loc:below", "tape:buyers", "book:even", "mgmt:stop", "mgmt:overplan"]);
  same(run("outlookSetupCodes")({}), [], "absent facts leave no code");
  const rows = [];
  for (let i = 0; i < 12; i += 1) {
    const withTape = i < 6;
    rows.push({ setup: withTape ? ["tape:buyers", "mgmt:stop"] : ["mgmt:stop"], realised: withTape ? 100 : -50, risk: 50 });
  }
  const by = run("outlookBySetup")(rows, 5);
  assert.strictEqual(by.n, 12);
  assert.strictEqual(by.codes["tape:buyers"].with.n, 6);
  assert.strictEqual(by.codes["tape:buyers"].with.wins, 6);
  assert.strictEqual(by.codes["tape:buyers"].without.wins, 0);
  assert.ok(Math.abs(by.codes["tape:buyers"].with.avgR - 2) < 1e-9 && Math.abs(by.codes["tape:buyers"].without.avgR + 1) < 1e-9, "mean R on each side");
  assert.strictEqual(by.codes["mgmt:stop"].without.n, 0, "every row had a stop");
  const thin = run("outlookBySetup")(rows.slice(0, 3), 5);
  assert.strictEqual(thin.codes["mgmt:stop"].with.avgR, null, "under the floor the mean is refused and the count stays");
  assert.strictEqual(thin.codes["mgmt:stop"].with.n, 3);
}

console.log("OUTLOOK TESTS OK");
