// The chart's tools (src/chart-tools.js): the ruler's count, the distance a
// press is from a line, and a drawing moved by a drag. Pure functions; the
// tools themselves are driven with a real mouse by test-polish-render.js §75.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const sandbox = { console, Date, Math };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "chart-tools.js"), "utf8"), sandbox, { filename: "chart-tools.js" });
const run = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, sandbox)));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg); checks++; };

/* ── The ruler's count ── */
{
  // One point a minute; every tenth minute the price jumps 2% and falls back
  sandbox.__series = Array.from({ length: 101 }, (_, i) => ({
    time: new Date(i * 60000),
    price: i % 10 === 5 ? 102 : 100,
  }));
  const one = run(`measureCount(__series, 60000, Math.log(1.02))`);
  eq(one.windows, 100, "every one-minute stretch that ends inside the series is one stretch");
  eq(one.hits, 20, "…and it moved 2% whenever it touched a jump, up or down — twice per jump");
  const small = run(`measureCount(__series, 60000, Math.log(1.001))`);
  eq(small.hits, 20, "a smaller move is met exactly as often here — the steps are all or nothing");
  const big = run(`measureCount(__series, 60000, Math.log(1.05))`);
  eq(big.hits, 0, "a move nothing made is met by no stretch");
  const long = run(`measureCount(__series, 50 * 60000, Math.log(1.02))`);
  eq(long.windows, 51, "a 50-minute stretch fits 51 times in 100 minutes");
  const down = run(`measureCount(__series, 60000, -Math.log(1.02))`);
  eq(down.hits, one.hits, "the ruler measures a distance: a fall of the same size is counted the same");
  eq(run(`measureCount(__series, 200 * 60000, 0.01)`), null, "a stretch longer than the series has no count");
  eq(run(`measureCount(__series.slice(0, 2), 60000, 0.01)`), null, "two points are not a record");
  eq(run(`measureCount(__series, 0, 0.01)`), null, "no time, no stretch");
  // Uneven spacing: the end of a stretch is the first point at or after its instant
  sandbox.__gappy = [0, 1, 2, 10, 11, 12].map((m, i) => ({ time: m * 60000, price: [100, 100, 100, 110, 110, 110][i] }));
  const gap = run(`measureCount(__gappy, 3 * 60000, Math.log(1.05))`);
  eq(gap.windows, 3, "only a stretch that ends inside the series counts (starts at 0, 1 and 2 minutes)");
  eq(gap.hits, 3, "…and one that ends between points ends at the next one, across the gap and the jump");
}

/* ── Which line a press is on ── */
{
  eq(run(`segmentDistance(5, 3, 0, 0, 10, 0, false)`), 3, "above the middle of a segment: straight down to it");
  eq(run(`segmentDistance(15, 0, 0, 0, 10, 0, false)`), 5, "past its end: to the end");
  eq(run(`segmentDistance(15, 0, 0, 0, 10, 0, true)`), 0, "a ray runs on past its second point");
  eq(run(`segmentDistance(-4, 3, 0, 0, 10, 0, true)`), 5, "…but not back past its first");
  eq(run(`segmentDistance(3, 4, 0, 0, 0, 0, false)`), 5, "a segment of no length is its point");
}

/* ── A drawing moved by a drag ── */
{
  const moved = run(`shiftDrawing({ id: "x", kind: "trend", a: { t: 1000, p: 100 }, b: { t: 2000, p: 110 } }, 500, 5, 0)`);
  eq(JSON.stringify([moved.a, moved.b]), JSON.stringify([{ t: 1500, p: 105 }, { t: 2500, p: 115 }]), "both ends move by the same time and the same price");
  const log = run(`shiftDrawing({ id: "x", kind: "trend", a: { t: 1000, p: 100 }, b: { t: 2000, p: 200 } }, 0, 0, 1.1)`);
  ok(Math.abs(log.a.p - 110) < 1e-9 && Math.abs(log.b.p - 220) < 1e-9, "on a log axis by the same ratio, so the slope is kept");
  const one = run(`shiftDrawing({ id: "x", kind: "hline", a: { t: 1000, p: 100 } }, 0, -10, 0)`);
  ok(one.a.p === 90 && !("b" in one), "a one-anchor drawing gains no second anchor");
  eq(run(`drawAnchorCount("box")`), 2, "a box takes two presses");
  eq(run(`drawAnchorCount("hline")`), 1, "a line across takes one");
  eq(run(`drawAnchorCount("note")`), 1, "…and so does a note");
}

console.log(`✔ ${checks} tool checks`);
console.log("TOOLS TESTS OK");
