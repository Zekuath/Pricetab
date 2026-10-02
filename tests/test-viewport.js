// The chart's window in time (src/chart-viewport.js): the granularity it
// asks for, the window arithmetic, the series cut to a window with its edges
// interpolated, the candles that overlap it, the move marks pointed again,
// and Largest-Triangle-Three-Buckets. Pure functions; the component is
// driven in a real browser by test-polish-render.js §74.
process.env.TZ = "UTC";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
// styled.x`…` and styled.x.attrs({…})`…` both hand back a component
const tagged = () => () => null;
tagged.attrs = () => tagged;
const styledStub = new Proxy(function styled() { return tagged; }, { get: () => tagged });
const sandbox = {
  console, Date, Math, Intl, setTimeout, clearTimeout,
  styled: styledStub,
  Component: class {},
  createRef: () => ({ current: null }),
  React: { createElement: () => null },
  msg: (key, text) => text,
  touchTarget: "", // interpolated into a style at load
  localeDate: (d, o) => new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "UTC" }, o)).format(d),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "chart-viewport.js"), "utf8"), sandbox, { filename: "chart-viewport.js" });
const run = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, sandbox)));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg); checks++; };

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

/* ── Which candles a window asks for ── */
{
  eq(run(`viewGranularity(${2 * HOUR})`), 60, "two hours: 1-minute bars (120 of them)");
  eq(run(`viewGranularity(${5 * HOUR})`), 60, "five hours: still 1-minute (300, the cap)");
  eq(run(`viewGranularity(${6 * HOUR})`), 300, "six hours: 5-minute bars (72)");
  eq(run(`viewGranularity(${3 * DAY})`), 900, "three days: 15-minute bars (288)");
  eq(run(`viewGranularity(${10 * DAY})`), 3600, "ten days: hourly");
  eq(run(`viewGranularity(${60 * DAY})`), 21600, "two months: 6-hour bars");
  eq(run(`viewGranularity(${300 * DAY})`), 86400, "most of a year: daily");
  eq(run(`viewGranularity(${5000 * DAY})`), 86400, "beyond: the coarsest there is");
  for (const span of [MIN * 30, HOUR * 3, DAY, DAY * 9, DAY * 200]) {
    const g = run(`viewGranularity(${span})`);
    ok(span / (g * 1000) <= 300, `no window is given more than 300 bars (${span} ms at ${g}s)`);
  }
}

/* ── The window arithmetic ── */
{
  const lo = 0;
  const hi = 1000;
  const z = run(`zoomView({ t0: 0, t1: 1000 }, 0.5, 250, ${lo}, ${hi}, 10)`);
  eq(z.t1 - z.t0, 500, "zooming by a half halves the window");
  ok(Math.abs((250 - z.t0) / (z.t1 - z.t0) - 0.25) < 1e-9, "the anchor keeps its place on screen");
  const inner = run(`zoomView({ t0: 100, t1: 200 }, 0.01, 150, ${lo}, ${hi}, 40)`);
  eq(inner.t1 - inner.t0, 40, "a zoom stops at the narrowest window");
  ok(inner.t0 <= 150 && inner.t1 >= 150, "…around the anchor");
  const out = run(`zoomView({ t0: 800, t1: 900 }, 100, 850, ${lo}, ${hi}, 10)`);
  eq(JSON.stringify(out), JSON.stringify({ t0: 0, t1: 1000 }), "and at the whole range going out");
  const edge = run(`zoomView({ t0: 900, t1: 1000 }, 3, 990, ${lo}, ${hi}, 10)`);
  ok(edge.t1 === 1000 && edge.t1 - edge.t0 === 300, "a zoom out at the end stays inside the range");

  eq(JSON.stringify(run(`panView({ t0: 100, t1: 300 }, 50, ${lo}, ${hi})`)), JSON.stringify({ t0: 150, t1: 350 }), "a pan moves both ends");
  eq(JSON.stringify(run(`panView({ t0: 100, t1: 300 }, -500, ${lo}, ${hi})`)), JSON.stringify({ t0: 0, t1: 200 }), "…and stops at the start");
  eq(JSON.stringify(run(`panView({ t0: 700, t1: 900 }, 500, ${lo}, ${hi})`)), JSON.stringify({ t0: 800, t1: 1000 }), "…and at the end");
  ok(run(`viewIsFull({ t0: 0, t1: 1000 }, 0, 1000)`), "the whole range is no window");
  ok(!run(`viewIsFull({ t0: 0, t1: 900 }, 0, 1000)`), "a part of it is");

  const still = run(`resolveView({ t0: 200, t1: 400, atNow: false }, 0, 1000, 10)`);
  ok(still.t0 === 200 && still.t1 === 400 && !still.atNow, "a window set in the past stays where it was put");
  const follow = run(`resolveView({ t0: 700, t1: 900, atNow: true }, 0, 1200, 10)`);
  ok(follow.t0 === 1000 && follow.t1 === 1200 && follow.atNow, "a window at the end follows the price as the range grows");
  eq(run(`resolveView({ t0: 0, t1: 1000 }, 0, 1000, 10)`), null, "the whole range resolves to no window");
}

/* ── The series cut to a window ── */
{
  sandbox.__line = Array.from({ length: 11 }, (_, i) => ({ price: i * 10, time: new Date(i * 1000) }));
  const cut = run(`sliceSeries(__line, 2500, 6500)`);
  eq(cut[0].edge, true, "the window starts on an edge point");
  eq(Date.parse(cut[0].time), 2500, "…at exactly its start");
  eq(cut[0].price, 25, "…priced between the two points either side");
  eq(cut[cut.length - 1].edge, true, "and ends on one");
  eq(cut[cut.length - 1].price, 65, "…priced the same way");
  eq(cut.filter((p) => !p.edge).length, 4, "with the real points between them (3, 4, 5, 6 s)");
  const exact = run(`sliceSeries(__line, 2000, 6000)`);
  ok(!exact[0].edge && !exact[exact.length - 1].edge, "a window on two real points adds none");
  const tiny = run(`sliceSeries(__line, 2200, 2400)`);
  eq(tiny.length, 2, "a window inside one step is its two edges");
  eq(tiny[1].price, 24, "…on the line between them");
  eq(run(`sliceSeries(__line, 5, 5)`).length, 11, "an empty window leaves the series alone");
}

/* ── The candles that overlap a window ── */
{
  sandbox.__bars = Array.from({ length: 10 }, (_, i) => ({ time: i * 60000, open: 1, high: 2, low: 0.5, close: 1.5 }));
  const cut = run(`sliceCandles(__bars, 90000, 250000)`);
  eq(cut.map((c) => c.time / 60000).join(","), "1,2,3,4", "a bar still open at the window's start counts; one opening after its end does not");
  eq(run(`sliceCandles(__bars, 120000, 240000)`).length, 3, "a bar opening exactly on the end is kept");
}

/* ── Largest-Triangle-Three-Buckets ── */
{
  const n = 2000;
  sandbox.__noisy = Array.from({ length: n }, (_, i) => ({
    price: 100 + Math.sin(i / 50) * 5 + (i === 777 ? 60 : 0) + (i === 1500 ? -45 : 0),
    time: new Date(i * 1000),
  }));
  const out = run(`lttb(__noisy, 300)`);
  eq(out.length, 300, "thinned to the budget exactly");
  eq(Date.parse(out[0].time), 0, "the first point survives");
  eq(Date.parse(out[out.length - 1].time), (n - 1) * 1000, "…and the last");
  ok(out.some((p) => p.price > 150), "the spike survives");
  ok(out.some((p) => p.price < 60), "…and the drop");
  ok(out.every((p, i) => i === 0 || Date.parse(p.time) > Date.parse(out[i - 1].time)), "in time order");
  eq(run(`lttb(__noisy.slice(0, 50), 300)`).length, 50, "a short series is left alone");
}

/* ── The move marks, pointed again by time ── */
{
  sandbox.__cut = run(`sliceSeries(__line, 2500, 6500)`).map((p) => Object.assign(p, { time: new Date(p.time) }));
  sandbox.__moves = [{ index: 4, time: 4000 }, { index: 9, time: 9000 }, { index: 3, time: 3100 }];
  const m = run(`remapMoves(__moves, __cut)`);
  eq(m.length, 2, "a mark outside the window is not drawn");
  eq(m[0].index, 2, "a mark is pointed at its own time in the cut series");
  eq(m[1].index, 1, "…the nearest point to it");
  ok(m.every((x) => !sandbox.__cut[x.index].edge), "…never an edge point");
}

/* ── Whether the finer candles cover the window ── */
{
  sandbox.__detail = { coin: "BTC", currency: "USD", g: 60, candles: Array.from({ length: 200 }, (_, i) => ({ time: 1e9 + i * MIN, close: 1 })) };
  ok(run(`detailCovers(__detail, "BTC", "USD", 1e9 + 10 * ${MIN}, 1e9 + 100 * ${MIN}, 15 * ${MIN})`), "detail inside its span, finer than 15-minute points, is used");
  ok(!run(`detailCovers(__detail, "ETH", "USD", 1e9 + 10 * ${MIN}, 1e9 + 100 * ${MIN}, 15 * ${MIN})`), "…never for another coin");
  ok(!run(`detailCovers(__detail, "BTC", "EUR", 1e9 + 10 * ${MIN}, 1e9 + 100 * ${MIN}, 15 * ${MIN})`), "…or another currency");
  ok(!run(`detailCovers(__detail, "BTC", "USD", 1e9 - 30 * ${MIN}, 1e9 + 100 * ${MIN}, 15 * ${MIN})`), "…or a window it does not reach");
  ok(!run(`detailCovers(__detail, "BTC", "USD", 1e9 + 10 * ${MIN}, 1e9 + 100 * ${MIN}, 10000)`), "…or points it is not finer than");
}

/* ── The median step, and the chip's words ── */
{
  sandbox.__gappy = [0, 1, 2, 3, 50, 51, 52].map((s) => ({ time: new Date(s * 1000) }));
  eq(run(`viewStep(__gappy)`), 1000, "one gap in a feed does not decide the step");
  eq(run(`viewWindowText(Date.UTC(2026, 8, 29, 9, 5), Date.UTC(2026, 8, 29, 15, 30))`), "Sep 29, 09:05 – 15:30", "a window inside a day says the date once");
  eq(run(`viewWindowText(Date.UTC(2026, 8, 28, 22, 0), Date.UTC(2026, 8, 29, 4, 0))`), "Sep 28, 22:00 – Sep 29, 04:00", "…and both dates across midnight");
  eq(run(`viewWindowText(Date.UTC(2026, 7, 1), Date.UTC(2026, 8, 20))`), "Aug 1 – Sep 20", "a long window is two dates");
}

console.log(`✔ ${checks} viewport checks`);
console.log("VIEWPORT TESTS OK");
