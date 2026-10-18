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
assert.ok(csv.includes('"7","10","9","","100","","",""'), "CSV refuses sparse comparisons");
assert.ok(csv.includes('"30","20","12","0.6","100","0.5"'));

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
