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
  // A window in the blank time past the latest price keeps the instant under the pointer
  const roomy = run(`zoomView({ t0: 800, t1: 1080 }, 0.5, 1000, ${lo}, ${hi}, 10, 0.4)`);
  ok(Math.abs((1000 - roomy.t0) / (roomy.t1 - roomy.t0) - 200 / 280) < 1e-9 && roomy.t1 > 1000, "a zoom with room past the end keeps its anchor where it was on screen");
  const noRoom = run(`zoomView({ t0: 800, t1: 1080 }, 0.5, 1000, ${lo}, ${hi}, 10)`);
  ok(noRoom.t1 === 1000, "…which, without the room, was pushed back onto the data");

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

  /* Room past the latest price (2 Oct 2026, the TradingView drag): a pan may
     run on into blank time, up to VIEW_FUTURE_ROOM of its span; a window that
     ends there keeps the room as the range grows. Zooms never take any. */
  const room = run(`VIEW_FUTURE_ROOM`);
  const into = run(`panView({ t0: 800, t1: 1000 }, 500, ${lo}, ${hi}, VIEW_FUTURE_ROOM)`);
  eq(JSON.stringify(into), JSON.stringify({ t0: 800 + 200 * room, t1: 1000 + 200 * room }), "a pan with room runs past the end, as far as the room");
  eq(JSON.stringify(run(`panView({ t0: 800, t1: 1000 }, 500, ${lo}, ${hi})`)), JSON.stringify({ t0: 800, t1: 1000 }), "…and without it stops at the end as before");
  const whole = run(`panView({ t0: 0, t1: 1000 }, -300, ${lo}, ${hi}, VIEW_FUTURE_ROOM)`);
  eq(JSON.stringify(whole), JSON.stringify({ t0: 0, t1: 1000 }), "the whole range pulled towards the past has nowhere to go");
  const ahead = run(`panView({ t0: 0, t1: 1000 }, 300, ${lo}, ${hi}, VIEW_FUTURE_ROOM)`);
  ok(!run(`viewIsFull(${JSON.stringify(ahead)}, 0, 1000)`), "the whole range with room past it is a window");
  const held = run(`resolveView({ t0: 850, t1: 1050, atNow: true, ahead: 0.25 }, 0, 1000, 10)`);
  ok(held && held.t1 === 1050 && held.t0 === 850 && held.atNow && held.ahead === 0.25, "a stored window keeps its room past the price", JSON.stringify(held));
  const grown = run(`resolveView({ t0: 850, t1: 1050, atNow: true, ahead: 0.25 }, 0, 1300, 10)`);
  ok(grown.t1 === 1350 && grown.t0 === 1150, "…and carries it along as new prices arrive", JSON.stringify(grown));
  // A window further past the end than any room allows (ahead 1.25)
  const capped = run(`resolveView({ t0: 1050, t1: 1250 }, 0, 1000, 10)`);
  ok(Math.abs(capped.t1 - (1000 + 200 * room)) < 1e-9, "a window in the hand is held to the room", JSON.stringify(capped));
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

/* ── M4: thinned on the clock (12 Oct 2026) ──
   What the window draws when it holds more points than pixels. Two things
   held: every pixel column keeps its extremes (a line from them is the line
   from all of them), and a window moved sideways keeps every column it
   shares exactly as it was — LTTB's buckets began at the window's first
   point, so a drag re-chose the line's points at every step. */
{
  const n = 4000;
  sandbox.__dense = Array.from({ length: n }, (_, i) => ({
    price: 100 + Math.sin(i / 37) * 5 + Math.sin(i * 1.7) * 2 + (i === 1777 ? 60 : 0),
    time: new Date(i * 1000),
  }));
  const span = 3000 * 1000;
  const cut = (t0) => `__dense.filter((p) => +p.time >= ${t0} && +p.time <= ${t0 + span})`;
  const a = run(`m4(${cut(200000)}, 200000, ${200000 + span}, 500)`);
  const b = run(`m4(${cut(260000)}, 260000, ${260000 + span}, 500)`);
  ok(a.length <= 4 * 501 && a.length < 3001, "thinned to at most four points a column", a.length);
  ok(a.some((p) => p.price > 150), "the spike survives");
  const ms = (p) => Date.parse(p.time);
  const key = (p) => Math.floor(ms(p) / (span / 500));
  const cols = (pts) => { const m = new Map(); for (const p of pts) { const k = key(p); m.set(k, (m.get(k) || []).concat([ms(p)])); } return m; };
  const ca = cols(a), cb = cols(b);
  const shared = [...ca.keys()].filter((k) => cb.has(k)).sort((x, y) => x - y).slice(1, -1);
  ok(shared.length > 300 && shared.every((k) => ca.get(k).join() === cb.get(k).join()),
    "a window moved sideways keeps every column it shares, point for point", shared.length);
  // And LTTB, for the record, does not
  const la = run(`lttb(${cut(200000)}, 2000)`).map(ms);
  const lb = new Set(run(`lttb(${cut(260000)}, 2000)`).map(ms));
  const overlap = la.filter((t) => t >= 260000 && t <= 200000 + span);
  ok(overlap.some((t) => !lb.has(t)), "(LTTB re-chose points over the same stretch — why it was replaced)");
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
