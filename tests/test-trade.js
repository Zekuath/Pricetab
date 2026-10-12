// The futures chart's trade layer (src/chart-trade.js): where its pills go,
// the fan's outlines, and a guide number kept off the pills. Pure functions;
// the layer itself is driven with a real mouse by test-polish-render.js §114.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const sandbox = { console, Date, Math, Intl, setTimeout, clearTimeout };
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "vendor", "d3-custom.min.js"), "utf8"), sandbox);
vm.runInContext("var { scaleLinear, scaleLog, scaleTime } = d3;", sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "chart-axes.js"), "utf8"), sandbox, { filename: "chart-axes.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "chart-trade.js"), "utf8"), sandbox, { filename: "chart-trade.js" });
const run = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, sandbox)));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg); checks++; };

/* ── The pills along the right edge ── */
{
  const h = run("TRADE_PILL_H");
  const gap = run("TRADE_PILL_GAP");
  // An entry and a stop four pixels apart: the entry keeps its height
  const two = run(`tradeLane([{ key: "e", y: 200, rank: 8 }, { key: "s", y: 204, rank: 7 }], 0, 400)`);
  eq(two.e, 200, "the more urgent pill keeps the height of its own line");
  ok(Math.abs(two.s - two.e) >= h + gap - 0.01, `…and the other moves just clear of it (${two.s})`);
  ok(Math.abs(two.s - 204) <= h + gap, "…by no more than a pill's height and the gap");
  // A level above the window is pinned to the top, one below to the bottom
  const off = run(`tradeLane([{ key: "up", y: -80, rank: 5 }, { key: "down", y: 900, rank: 5 }], 0, 400)`);
  eq(off.up, h / 2, "a level above the window is pinned inside its top edge");
  eq(off.down, 400 - h / 2, "…and one below it inside its bottom edge");
  // Many pills never overlap
  const many = run(`tradeLane(Array.from({ length: 9 }, (_, i) => ({ key: "k" + i, y: 100 + i * 3, rank: 9 - i })), 0, 400)`);
  const ys = Object.values(many).sort((a, b) => a - b);
  ok(ys.every((y, i) => i === 0 || y - ys[i - 1] >= h + gap - 0.01), "nine pills near one price are laid out without one touching another");
  ok(ys.every((y) => y - h / 2 >= -0.01 && y + h / 2 <= 400.01), "…and all inside the plot");
}

/* ── A pill's width ── */
{
  eq(run(`tradePillWidth("SL 82,574.00")`), Math.ceil(12 * 6.6) + 12, "a pill is its text at the monospace advance and its padding");
  eq(run(`tradePillWidth("")`), 12, "an empty pill is its padding");
}

/* ── The fan's outlines ── */
{
  sandbox.__fan = {
    from: 1000,
    stepMs: 10,
    start: 100,
    steps: [
      { step: 1, p5: 98, p25: 99, p50: 100, p75: 101, p95: 102 },
      { step: 2, p5: 96, p25: 98, p50: 100, p75: 102, p95: 104 },
    ],
  };
  const f = run(`tradeFanPaths(__fan, (t) => t - 1000, (v) => 200 - v, 0)`);
  eq(f.outer, "M0.0,100.0L10.0,98.0L20.0,96.0L20.0,104.0L10.0,102.0Z", "the outer band runs out along the 95th and back along the 5th, from now");
  eq(f.inner, "M0.0,100.0L10.0,99.0L20.0,98.0L20.0,102.0L10.0,101.0Z", "the inner band is the 75th and the 25th");
  eq(f.mid, "M0.0,100.0L10.0,100.0L20.0,100.0", "the middle is the median from the price now");
  eq(JSON.stringify([f.end, f.low]), JSON.stringify([{ x: 20, y: 96 }, { x: 20, y: 104 }]), "…and its last mark's two edges are where the words may go");
  eq(run(`tradeFanPaths(null, (t) => t, (v) => v, 0)`), null, "no fan, no outline");
  eq(run(`tradeFanPaths({ from: 0, stepMs: 1, start: 0, steps: [{ step: 1, p5: 1, p25: 1, p50: 1, p75: 1, p95: 1 }] }, (t) => t, (v) => v, 0)`), null, "…nor one that starts at no price");
}

/* ── A guide number kept off the pills ── */
{
  const r = 11;
  eq(run(`tradeClear(500, 100, ${r}, [])`), 500, "with nothing in the way it stays where it was asked to be");
  const moved = run(`tradeClear(500, 100, ${r}, [{ x: 480, y: 90, w: 60, h: 18 }])`);
  eq(moved, 480 - r - 1, "a pill under it moves it to the pill's left");
  const twice = run(`tradeClear(500, 100, ${r}, [{ x: 480, y: 90, w: 60, h: 18 }, { x: 440, y: 92, w: 36, h: 18 }])`);
  eq(twice, 440 - r - 1, "…and past the next one too, when that is in the way");
  eq(run(`tradeClear(500, 100, ${r}, [{ x: 480, y: 140, w: 60, h: 18 }])`), 500, "a pill at another height is not in the way");
}

console.log(`✔ ${checks} trade layer checks`);
console.log("TRADE LAYER TESTS OK");
