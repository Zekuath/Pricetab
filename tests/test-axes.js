// The chart's axes: the tick generators, the time labels and the lane
// allocator (src/chart-axes.js). Pure functions, run against the real d3
// bundle — a stubbed scale would pass any tick bug.
process.env.TZ = "UTC";
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
// The label format is the question here, not the locale: English, UTC.
sandbox.localeDate = (d, o) => new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "UTC" }, o)).format(d);
vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "chart-axes.js"), "utf8"), sandbox, { filename: "chart-axes.js" });
const run = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, sandbox)));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg); checks++; };

/* ── Price ticks ── */
{
  const t = run("axisPriceTicks(81234, 88321, 440, false)");
  ok(t.length >= 3 && t.length <= 10, `a 440px scale carries a handful of levels (${t.length})`);
  ok(t.every((v) => v >= 81234 && v <= 88321), "every level is inside the range");
  const step = t[1] - t[0];
  ok(t.every((v, i) => i === 0 || Math.abs(t[i] - t[i - 1] - step) < 1e-6), "the levels are evenly spaced");
  ok([1, 2, 2.5, 5].some((m) => Math.abs(step / 10 ** Math.floor(Math.log10(step)) - m) < 1e-9), `the step is 1, 2 or 5 × 10ⁿ (${step})`);
  ok(t.every((v) => Math.abs(v / step - Math.round(v / step)) < 1e-9), "every level is a multiple of the step");

  const narrow = run("axisPriceTicks(0.000412, 0.000431, 400, false)");
  ok(narrow.length >= 3, "a price in the ten-thousandths still gets levels");

  const logWide = run("axisPriceTicks(120, 98000, 400, true)");
  ok(logWide.length >= 2 && logWide.every((v) => v > 0), "a log axis over three decades has levels, all positive");
  ok(logWide.includes(1000) && logWide.includes(10000), "and they include the decades");

  const logNarrow = run("axisPriceTicks(81000, 88000, 400, true)");
  ok(logNarrow.length >= 2, "a log axis inside one step falls back to round linear levels, never none");

  eq(run("axisPriceTicks(5, 5, 400, false)").length, 0, "a flat range has no scale");
  eq(run("axisPriceTicks(NaN, 5, 400, false)").length, 0, "a missing end has no scale");
  eq(run("axisPriceTicks(1, 5, 0, false)").length, 0, "no height, no scale");
  ok(run("axisPriceTicks(1, 5, 60, false)").length >= 2, "a short scale still names two levels");
}

/* ── Time ticks ── */
{
  const t0 = Date.UTC(2026, 8, 1, 7, 13);
  const t1 = Date.UTC(2026, 8, 29, 18, 40);
  const { ticks, step } = run(`axisTimeTicks(${t0}, ${t1}, 1180)`);
  ok(ticks.length >= 4 && ticks.length <= 16, `a month across 1180px carries a readable number of dates (${ticks.length})`);
  ok(ticks.every((t) => t >= t0 && t <= t1), "every tick is inside the window");
  ok(ticks.every((t, i) => i === 0 || t > ticks[i - 1]), "ticks run forward");
  eq(step, ticks[1] - ticks[0], "the step is the interval the ticks were cut at");

  const hour = run(`axisTimeTicks(${Date.UTC(2026, 8, 29, 11, 2)}, ${Date.UTC(2026, 8, 29, 12, 2)}, 400)`);
  ok(hour.step <= 30 * 60000, "an hour is cut in minutes");
  eq(run("axisTimeTicks(5, 5, 400)").ticks.length, 0, "an empty window has no ticks");
}

/* ── Time labels: the finest unit that fits, the coarser one at a boundary ── */
{
  const H = 3600000;
  const D = 86400000;
  eq(run(`axisTimeLabel(${Date.UTC(2026, 8, 29, 14, 0)}, ${3 * H})`), "14:00", "an hourly tick prints the clock");
  eq(run(`axisTimeLabel(${Date.UTC(2026, 8, 29, 0, 0)}, ${3 * H})`), "Sep 29", "a midnight among hours prints the date");
  eq(run(`axisTimeLabel(${Date.UTC(2026, 8, 29)}, ${2 * D})`), "Sep 29", "a daily tick prints the date");
  eq(run(`axisTimeLabel(${Date.UTC(2027, 0, 1)}, ${2 * D})`), "2027", "a new year among days prints the year");
  eq(run(`axisTimeLabel(${Date.UTC(2026, 9, 1)}, ${30 * D})`), "Oct", "a monthly tick prints the month");
  eq(run(`axisTimeLabel(${Date.UTC(2027, 0, 1)}, ${30 * D})`), "2027", "January among months prints the year");
  eq(run(`axisTimeLabel(${Date.UTC(2024, 0, 1)}, ${365 * D})`), "2024", "a yearly tick prints the year");
}

/* ── Thinning ── */
{
  const out = run(`thinAxisLabels([{ y: 50 }, { y: 10 }, { y: 30 }, { y: 20 }, { y: 90 }], 25, "y")`);
  eq(JSON.stringify(out.map((o) => o.y)), "[10,50,90]", "the first label wins and the rest keep their distance");
  eq(run(`thinAxisLabels([], 25, "y")`).length, 0, "nothing in, nothing out");
}

/* ── The lane allocator ── */
{
  // The most important label sits exactly where it belongs
  const a = run(`placeLabels([
    { id: "tick", y: 100, h: 16, priority: 1 },
    { id: "last", y: 104, h: 16, priority: 3 },
  ], 0, 400)`);
  eq(a.last, 104, "the highest priority keeps its own height");
  ok(Math.abs(a.tick - a.last) >= 16 + 2 - 0.01, "the other moves clear of it");
  ok(Math.abs(a.tick - 100) <= 20, "and no further than it has to");

  // A fixed label is dropped, never moved: a moved tick names the wrong price
  const b = run(`placeLabels([
    { id: "last", y: 100, h: 16, priority: 3 },
    { id: "tick", y: 105, h: 16, priority: 1, fixed: true },
  ], 0, 400)`);
  eq(b.tick, null, "a fixed label that collides is left out");

  // The edges hold
  const c = run(`placeLabels([{ id: "top", y: -30, h: 16, priority: 1 }, { id: "foot", y: 420, h: 16, priority: 1 }], 0, 400)`);
  eq(c.top, 8, "a label past the top is pulled inside");
  eq(c.foot, 392, "a label past the foot is pulled inside");

  // No room at all is null, not an overlap
  const d = run(`placeLabels([
    { id: "a", y: 10, h: 16, priority: 3 },
    { id: "b", y: 10, h: 16, priority: 2 },
  ], 0, 20)`);
  eq(d.a, 10, "the first fits");
  eq(d.b, null, "the second has nowhere to go and says so");

  // At random: whatever is placed is inside the lane and overlaps nothing
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let trial = 0; trial < 300; trial++) {
    const n = 1 + Math.floor(rnd() * 12);
    const items = Array.from({ length: n }, (_, i) => ({
      id: `l${i}`,
      y: rnd() * 440 - 20,
      h: 12 + Math.floor(rnd() * 8),
      priority: Math.floor(rnd() * 5),
      fixed: rnd() < 0.3,
    }));
    sandbox.__items = items;
    const out = run("placeLabels(__items, 0, 400)");
    const placed = items.filter((it) => out[it.id] != null).map((it) => ({ y: out[it.id], h: it.h, it }));
    for (const p of placed) {
      assert.ok(p.y - p.h / 2 >= -0.01 && p.y + p.h / 2 <= 400.01, `trial ${trial}: ${p.it.id} inside the lane`);
      if (p.it.fixed) assert.strictEqual(p.y, p.it.y, `trial ${trial}: a fixed label is never moved`);
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const gap = Math.abs(placed[i].y - placed[j].y) - (placed[i].h + placed[j].h) / 2;
        assert.ok(gap >= 2 - 0.02, `trial ${trial}: ${placed[i].it.id} and ${placed[j].it.id} overlap (${gap.toFixed(2)})`);
      }
    }
    // The best-placed label of the highest priority is never displaced by a lower one
    const top = Math.max(...items.map((it) => it.priority));
    const first = items.filter((it) => it.priority === top)[0];
    if (!first.fixed && first.y >= first.h / 2 && first.y <= 400 - first.h / 2) {
      assert.strictEqual(out[first.id], first.y, `trial ${trial}: the first of the highest priority keeps its height`);
    }
  }
  checks += 300;
}

console.log(`✔ ${checks} axis checks`);
console.log("AXES TESTS OK");
