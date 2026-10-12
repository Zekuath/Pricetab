// The chart's counted studies (src/chart-studies.js): volume by price, the
// unusual-volume marks, the regime runs, where price has turned and where it
// sits — on hand-built series whose answers are known. The drawing is driven in
// a real browser by test-polish-render.js §76; what each study may claim was
// measured in docs/internal/research/studies-prereg.md.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const sandbox = { console, Date, Math, msg: (k, t) => t };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// The helpers the studies call: the range stats, the regime states, the pivots
vm.runInContext(`
  const deriveRangeStats = (h) => {
    if (!Array.isArray(h) || h.length < 2) return null;
    let high = -Infinity, low = Infinity;
    for (const p of h) { const v = Number(p.price); if (v > high) high = v; if (v < low) low = v; }
    return { high, low };
  };`, sandbox);
for (const f of ["regime-grid.js", "price-patterns.js", "chart-studies.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src", f), "utf8"), sandbox, { filename: f });
}
const run = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, sandbox)));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg); checks++; };

/* ── Volume by price ── */
{
  // Most of the volume traded between 100 and 101; a little everywhere else
  sandbox.__bars = [
    { low: 100, high: 101, volume: 900 },
    { low: 90, high: 110, volume: 200 },
    { low: 95, high: 96, volume: 50 },
  ];
  const p = run(`volumeProfile(__bars, 20)`);
  eq(p.lo, 90, "the bands start at the lowest low");
  ok(Math.abs(p.step - 1) < 1e-9, "…and are equal slices of the range (20 across 90–110)");
  ok(Math.abs(p.total - 1150) < 1e-6, "every unit of volume is somewhere — spread, not lost");
  eq(p.poc, 10, "the busiest band is the one the heavy bar traded in (100–101)");
  const held = p.vols.slice(p.vaLo, p.vaHi + 1).reduce((s, v) => s + v, 0);
  ok(held >= 0.7 * p.total, "the value area holds at least 70%");
  ok(p.vaLo <= p.poc && p.vaHi >= p.poc, "…around the busiest band");
  eq(run(`volumeProfile([{ low: 1, high: 2, volume: 0 }, { low: 1, high: 2, volume: 0 }])`), null, "no volume, no profile");
  const flat = run(`volumeProfile([{ low: 5, high: 5, volume: 10 }, { low: 6, high: 6, volume: 10 }], 10)`);
  ok(Math.abs(flat.vols.reduce((s, v) => s + v, 0) - 20) < 1e-9, "a bar with no range puts its volume in its one band");
}

/* ── Unusual volume ── */
{
  sandbox.__vol = Array.from({ length: 60 }, (_, i) => ({ volume: i === 40 ? 5000 : 100 + (i % 5) * 10 }));
  const ev = run(`volumeEventsIn(__vol, 2.5)`);
  eq(ev.length, 1, "one bar stands out");
  eq(ev[0].index, 40, "…the one with fifty times the volume");
  ok(ev[0].multiple > 40 && ev[0].multiple < 50, "…said as its multiple of the median bar");
  eq(run(`volumeEventsIn(__vol.slice(0, 20), 2.5)`).length, 0, "under thirty bars, nothing is unusual — too few to say");
  eq(run(`volumeEventsIn(__vol.map(() => ({ volume: 7 })), 2.5)`).length, 0, "all alike, nothing stands out");
}

/* ── The regime runs ── */
{
  // 30 flat days, then 20 days rising 1% a day, then flat again
  let p = 100;
  sandbox.__days = Array.from({ length: 80 }, (_, i) => {
    if (i >= 30 && i < 50) p *= 1.01;
    return { t: 1e9 + i * 86400, close: p };
  });
  const spans = run(`regimeSpans(__days)`);
  ok(spans.every((s, i) => i === 0 || s.state !== spans[i - 1].state), "a run is a run: two neighbours never share a state");
  eq(spans[0].from, (1e9 + 20 * 86400) * 1000, "the first state is on the first day with 20 days behind it");
  ok(spans.some((s) => s.state === 0), "the climb is named rising");
  eq(spans[spans.length - 1].to, (1e9 + 79 * 86400) * 1000, "…and the last run reaches the last day");
}

/* ── Where price has turned ── */
{
  /* A price that falls to 100 and bounces, again and again: pivots at the
     same low make a level at 100, and later visits turn there. Built on
     highs and lows a few percent either side of a smooth path. */
  const days = [];
  for (let i = 0; i < 600; i++) {
    const phase = (i % 40) / 40;
    const close = 100 + 20 * Math.abs(Math.sin(Math.PI * phase)); // 100 … 120 … 100
    // The bottoms dip a little differently each time (99.6, 99.2, 98.8), so
    // the level the first three agree on lies inside some later bottoms
    // rather than exactly on their edge
    const dip = phase === 0 ? (Math.floor(i / 40) % 3) * 0.4 : 0;
    days.push({ t: 1e9 + i * 86400, open: close, high: close * 1.004, low: close * 0.996 - dip, close });
  }
  sandbox.__turns = days;
  const found = run(`turnLevels(__turns)`);
  ok(found && found.levels.length >= 1, "three lows that agree make a level");
  const low = found.levels.find((l) => Math.abs(l.price - 99.2) < 1);
  ok(low, "…at the price they agreed on");
  ok(low.turned + low.crossed >= 3, "…and later visits are counted there");
  ok(low.turned > low.crossed, "…turning here, as this path was built to");
  ok(found.base.turned + found.base.crossed > 0, "the base counts visits to prices anywhere");
  eq(run(`turnLevels(__turns.slice(0, 40))`), null, "a short history makes no levels");
}

/* ── Where the price sits ── */
{
  sandbox.__rows = [
    { key: "1D", prices: [{ price: 100 }, { price: 200 }] },
    { key: "1W", prices: [{ price: 150 }, { price: 250 }] },
    { key: "1M", prices: null },
  ];
  const pos = run(`rangePositions(150, __rows)`);
  eq(pos.length, 2, "only ranges whose series is at hand");
  eq(pos[0].pos, 0.5, "halfway from the day's low to its high");
  eq(pos[1].pos, 0, "at the week's low — and a spot a moment newer than the series is held at the edge");
  eq(run(`rangePositions(300, __rows)[0].pos`), 1, "above the high is at the high");
  eq(run(`rangePositions(0, __rows)`).length, 0, "no price, nothing to place");
}

console.log(`✔ ${checks} study checks`);
console.log("STUDIES TESTS OK");
