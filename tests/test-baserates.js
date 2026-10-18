const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const chain = () => { const f = () => f; f.x = f.y = f.curve = f; return f; };
const sandbox = { console, setTimeout, line: chain, curveMonotoneX: null, PureComponent: class { constructor(props) { this.props = props; } } };
vm.createContext(sandbox);
for (const file of ["i18n.js", "config.js", "utils.js", "candle-patterns.js", "price-patterns.js", "strategy-setups.js", "swing-patterns.js", "companion-readings.js", "baserates-history.js", "baserates.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), sandbox, { filename: file });
}
const run = (code) => vm.runInContext(code, sandbox);
const json = (code) => JSON.parse(JSON.stringify(run(code)));

// Twelve disjoint paths, each gaining exactly d percent by step d.
run(`this.c = Array.from({ length: 12 * 31 }, (_, i) => ({ t: (18000 + i) * 86400, close: 100 + i % 31 }));
this.entries = Array.from({ length: 12 }, (_, i) => i * 31);`);
const paths = json("baseHistoryPaths(c, entries)");
assert.strictEqual(paths.n, 12);
assert.strictEqual(paths.points.length, 31);
assert.ok(paths.points.every((p, d) => [p.mean, p.median, p.lo, p.hi].every((v) => Math.abs(v - d) < 1e-10)));
assert.strictEqual(json("baseHistoryPaths(c, entries.slice(0, 11))").points.length, 0);
assert.strictEqual(json("baseHistoryPaths(c, entries.concat(c.length - 1))").n, 12, "unfinished episodes are omitted");
run("c[4] = { ...c[4], t: c[4].t + 86400 }");
assert.strictEqual(json("baseHistoryPaths(c, entries)").n, 11, "a missing or repeated day is not a 30-day path");
run("c[4] = { ...c[4], t: c[4].t - 86400, close: 0 }");
assert.strictEqual(json("baseHistoryPaths(c, entries)").n, 11, "unusable prices do not enter the band");

const csv = run(`baseHistoryCsv("BTC", [{title: '=SUM(1,2)"', records: [
  { days: 7, result: { n: 10, up: 90, baseUp: 50, baseN: 100 } },
  { days: 30, result: { n: 20, up: 60, baseUp: 50, baseN: 100 } }
]}])`);
assert.ok(csv.includes('"\'=SUM(1,2)"""'));
assert.ok(csv.includes('"7","10","10","9","","100","","",""'), "CSV refuses sparse comparisons");
assert.ok(csv.includes('"30","20","20","12","0.6","100","0.5"'), "…and carries n_eff (n when nothing overlaps)");

/* ── effective n for overlapping windows (18 Oct 2026, TODAY T6 A2) ──── */
assert.strictEqual(run("effectiveN([0, 10, 20, 30], 10)"), 4, "windows that do not overlap are worth their count");
assert.strictEqual(run("effectiveN([5, 5, 5, 5], 10)"), 1, "the same start counted four times is one look");
{
  const consecutive = run("effectiveN(Array.from({ length: 400 }, (_, i) => i), 10)");
  assert.ok(Math.abs(consecutive - 40) < 1.5, `every consecutive day at h = 10 is worth about n / h (${consecutive.toFixed(2)})`);
}
assert.strictEqual(run("effectiveN([0, 1, 2], 1)"), 3, "a one-day horizon shares nothing");
assert.strictEqual(run("effectiveN([], 10)"), 0);
{
  const narrow = json("wilsonShare(0.6, 100)");
  const wide = json("wilsonShare(0.6, 25)");
  assert.ok(wide.hi - wide.lo > narrow.hi - narrow.lo, "fewer effective looks, a wider interval");
  const same = json("wilsonInterval(60, 100)");
  assert.ok(Math.abs(same.lo - narrow.lo) < 1e-12 && Math.abs(same.hi - narrow.hi) < 1e-12, "on a whole n it is the Wilson interval");
  assert.strictEqual(run("wilsonShare(0.5, 0.5)"), null, "under one look, no interval");
}
{
  // A state true every other day for a stretch: its entries are two days apart
  run(`this.cl = Array.from({ length: 300 }, (_, i) => 100 + i);
  this.vals = Array.from({ length: 300 }, (_, i) => i < 120 && i % 2 === 0);`);
  const r = json("baseRateFor(cl, vals, (v) => v, 10)");
  assert.strictEqual(r.n, 60, "sixty entries");
  assert.ok(r.nEff < r.n / 3 && r.nEff > 1, `…worth far fewer than sixty once their shared days are counted once (${r.nEff.toFixed(1)})`);
}

run(`this.panel = new BaseRatesPanel({ coin: "BTC" });
this.deep = Array.from({ length: 900 }, (_, i) => ({t: (18000 + i) * 86400, open: 100 + Math.sin(i / 9) * 10, high: 112, low: 88, close: 100 + Math.sin(i / 9) * 10}));
panel.state.candles = deep;
this.original = panel.readings(); panel.state.horizon = 3; this.short = panel.readings();`);
assert.ok(run("short !== original && short.rows.every((r) => r.byHorizon.length === 1 && r.byHorizon[0].days === 3)"));
assert.ok(run("baseHistoryItems(panel, short).filter((it) => it.key.startsWith('s-')).every((it) => it.records[0].days === 3)"));
assert.ok(run("short.rows.every((r) => Array.isArray(r.entries))"));
// Another coin's count is kept by its candles and the horizon: a redraw of
// the Now tab must not count it again, a new horizon or history must.
run(`this.counted = 0; this.spy = new BaseRatesPanel({ coin: "BTC" }); spy.state.candles = deep;
  const count = spy.countReadings.bind(spy); spy.countReadings = (c) => { counted += 1; return count(c); };
  this.eth = deep.map((c) => ({ ...c })); this.firstItems = baseAcrossItems(spy, "ETH", eth);`);
assert.ok(run("baseAcrossItems(spy, 'ETH', eth) === firstItems && counted === 1"), "a redraw recounts nothing");
assert.ok(run("spy.state.horizon = 7; baseAcrossItems(spy, 'ETH', eth) !== firstItems && counted === 2"), "a new horizon recounts");
assert.ok(run("baseAcrossItems(spy, 'ETH', eth.slice()) && counted === 3"), "a new history recounts");
const weekday = json("weekdayShares(deep)");
assert.strictEqual(weekday.counts.length, 7);
assert.strictEqual(weekday.counts.reduce((a, b) => a + b), weekday.n);
const months = json("monthlyReturns(deep)");
assert.strictEqual(months.byMonth.reduce((n, m) => n + m.n, 0), months.rows.filter((r) => !r.partial).length);
assert.ok(months.rows.some((r) => r.partial), "the fixture includes an unfinished month");
const geometry = run("baseHistoryGeometry([[0, 0, 0]]).line([0, 0, 0])");
assert.ok(!/NaN|Infinity/.test(geometry));
(async () => {
  // Switching coins during a slow daily fetch must never strand loading or
  // show the old coin's candles under the new coin's heading.
  run(`this.slow = new BaseRatesPanel({coin: "BTC"});
    slow.setState = (patch) => { slow.state = { ...slow.state, ...(typeof patch === "function" ? patch(slow.state) : patch) }; };
    slow.loadCpi = () => {};
    this.jobs = new Map(); this.fetchDailyCandles = (coin) => new Promise((resolve) => jobs.set(coin, resolve));
    slow.state.candles = deep;`);
  const first = run("slow.load()");
  assert.strictEqual(run("slow.state.candles"), null);
  const second = run('slow.props = {coin: "ETH"}; slow.load()');
  assert.ok(run('jobs.has("BTC") && jobs.has("ETH")'));
  run('jobs.get("BTC")([{close: 1}])');
  await first;
  assert.strictEqual(run("slow.state.candles"), null, "a late response for the previous coin is ignored");
  run('jobs.get("ETH")(deep)');
  await second;
  assert.ok(run('slow.state.candles === deep && slow.state.coin === "ETH" && !slow.state.loading'));
  // Counted in its own task before the history is drawn; the render reuses it
  assert.ok(run("slow._readings && slow._readings.candles === deep && slow.readings() === slow._readings.out"),
    "the count is kept from load and not repeated by the render");
  console.log("BASE RATES TESTS OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });

/* ── a rate pulled towards an ordinary day (18 Oct 2026, TODAY T6 A3) ── */
{
  assert.strictEqual(run("shrunkRate(0, 0, 0.55, 40)"), 0.55, "with no episodes it is the ordinary day");
  assert.ok(Math.abs(run("shrunkRate(700000, 1000000, 0.55, 40)") - 0.7) < 1e-4, "with a great many it is the count");
  assert.strictEqual(run("shrunkRate(9, 12, 0.5, 0)"), 0.75, "κ = 0 leaves the count alone");
  assert.strictEqual(run("betaBinomialStrength([{ k: 6, n: 12, base: 0.5 }])"), null, "under five items, nothing is fitted");
  // Rates spread no wider than binomial noise: pulled home
  const tight = run("betaBinomialStrength(Array.from({ length: 8 }, () => ({ k: 6, n: 12, base: 0.5 })))");
  assert.strictEqual(tight, run("BETA_SHRINK_MAX"), "rates no further from their bases than noise are pulled all the way");
  // Rates far apart: a weak pull
  const wide = run("betaBinomialStrength([0, 12, 1, 11, 0, 12, 2, 10].map((k) => ({ k, n: 12, base: 0.5 })))");
  assert.ok(wide >= 0 && wide < 2, `rates spread far beyond noise are pulled little (κ ${wide.toFixed(2)})`);
  const s = json(`shrinkStrengths([{ byHorizon: [{ days: 10, result: { n: 4, up: 50, baseUp: 50 } }] }])`);
  assert.deepStrictEqual(s, {}, "a row under the floor does not enter the fit");
}
console.log("  ✔ effective n, Wilson on a share, and rates pulled towards an ordinary day");
