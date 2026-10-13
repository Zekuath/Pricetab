// The monitor (src/monitor.js) and the quick switch's command line
// (src/quickswitch.js): a coin's row worked out from its 30 days, the
// correlation matrix's shape, and what a typed line asks for. Pure functions;
// the screen and the box are driven in a real browser by
// test-polish-render.js §95.
process.env.TZ = "UTC";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const tagged = () => () => null;
tagged.attrs = () => tagged;
const styledStub = new Proxy(function styled() { return tagged; }, { get: () => tagged });
const sandbox = {
  console, Date, Math, Intl, setTimeout, clearTimeout,
  styled: styledStub,
  keyframes: () => "",
  css: () => "",
  themedScrollbar: "",
  touchTarget: "",
  TOUCH_TARGET_PX: 44,
  touchRow: "",
  touchField: "",
  touchSquare: "",
  PureComponent: class {},
  Fragment: "f",
  createRef: () => ({ current: null }),
  React: { createElement: () => null },
  // The language's own command words, as a Turkish install has them
  msg: (key, text) => (key === "qs_word_compare" ? "karşılaştır" : key === "qs_word_target" ? "hedef" : text),
  signedFixed: (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d),
  describeSpan: () => "1h",
  // The pairing is what is tested here; the coefficient itself is the compare
  // strip's, tested with it
  compareCorrelation: (a, b) => ({ r: a.length === b.length ? 0.5 : -0.5, n: Math.min(a.length, b.length) - 1 }),
  // The same-direction count beside it (12 Oct 2026), the compare strip's too
  compareSameDirection: (a, b) => ({ same: 1, n: Math.min(a.length, b.length) - 1 }),
  // The content's entrance (styles-baserates.js), a css fragment at load
  screenPaneIn: "",
  SUGGESTED_COINS: ["BTC", "ETH", "SOL", "XRP", "BCH"],
  COIN_NAMES: { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", XRP: "XRP", BCH: "Bitcoin Cash" },
  PERIOD_OPTIONS: [
    { value: "hour", label: "1H" }, { value: "day", label: "1D" }, { value: "week", label: "1W" },
    { value: "month", label: "1M" }, { value: "year", label: "1Y" }, { value: "all", label: "ALL" },
  ],
  COMPARE_MARKETS: [{ id: "SPYx", name: "S&P 500" }, { id: "QQQx", name: "Nasdaq 100" }, { id: "PAXG", name: "Gold" }],
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["quickswitch.js", "monitor.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src", f), "utf8"), sandbox, { filename: f });
}
const run = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, sandbox)));
let checks = 0;
const ok = (cond, msg, detail) => { assert.ok(cond, detail === undefined ? msg : `${msg} — ${detail}`); checks++; };
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg); checks++; };

const HOUR = 3600000;
const T = Date.UTC(2026, 9, 1);

/* ── A coin's row from its 30 days ── */
{
  // 31 days hourly, from 100 rising to 131 in a straight line
  sandbox.__up = Array.from({ length: 31 * 24 + 1 }, (_, i) => ({ time: new Date(T - (31 * 24 - i) * HOUR), price: 100 + i / 24 }));
  const r = run(`monitorRow(__up)`);
  ok(Math.abs(r.change30d - ((131 / 101) - 1) * 100) < 0.05, "30d is the change from 30 days back", r.change30d);
  ok(Math.abs(r.change7d - ((131 / 124) - 1) * 100) < 0.05, "7d is the change from a week back", r.change7d);
  ok(Math.abs(r.change1d - ((131 / 130) - 1) * 100) < 0.05, "…and the day, for a coin the ticker has not swept", r.change1d);
  eq(r.last, 131, "the last price is the series' own");
  eq(r.range, 1, "at the month's high, the range bar is at its end");
  eq(r.fromHigh, 0, "…and it is 0% from the high");
  eq(r.step, HOUR, "the step is the series' own spacing");
  ok(r.dailyMove >= 0 && r.dailyMove < 0.5, "a straight line barely moves in a day", r.dailyMove);

  // A week of data has no month
  sandbox.__week = sandbox.__up.slice(-7 * 24 - 1);
  const w = run(`monitorRow(__week)`);
  eq(w.change30d, null, "a series shorter than a month has no 30d, rather than a 7d labelled 30d");
  ok(w.change7d != null, "…and still has its week");

  // A zig-zag: the typical day is a size, the same whichever way it starts
  sandbox.__zig = Array.from({ length: 30 * 24 + 1 }, (_, i) => ({ time: new Date(T - (30 * 24 - i) * HOUR), price: i % 2 ? 101 : 100 }));
  sandbox.__zag = sandbox.__zig.map((p, i) => ({ time: p.time, price: i % 2 ? 100 : 101 }));
  const zig = run(`monitorRow(__zig)`);
  const zag = run(`monitorRow(__zag)`);
  ok(zig.dailyMove > 1 && Math.abs(zig.dailyMove - zag.dailyMove) < 1e-6, "the typical day has no direction", JSON.stringify([zig.dailyMove, zag.dailyMove]));
  ok(zig.range >= 0 && zig.range <= 1, "the range position stays inside its track");
  eq(run(`monitorRow([])`), null, "no series, no row");
  eq(run(`monitorRow([{ time: 1, price: 0 }, { time: 2, price: -1 }, { time: 3, price: NaN }])`), null, "prices that are not prices are not a row");
}

/* ── The month as a line, the list at once, the market as a map (9 Oct 2026) ── */
{
  const sp = run(`monitorSpark(__up, 48)`);
  ok(sp.length <= 2 * 48 + 2 && sp.length >= 40, "the month is thinned to about two points a bucket", sp.length);
  ok(sp[0][0] === 0 && sp[sp.length - 1][0] === 1 && sp[sp.length - 1][1] === 1, "…from its first moment to its last, ending at the month's high for a steady rise", JSON.stringify([sp[0], sp[sp.length - 1]]));
  ok(sp.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1), "…inside its box both ways");
  // A one-hour spike in a flat month survives the thinning
  sandbox.__spike = Array.from({ length: 30 * 24 + 1 }, (_, i) => ({ time: new Date(T - (30 * 24 - i) * HOUR), price: i === 400 ? 150 : 100 }));
  ok(run(`monitorSpark(__spike, 48)`).some(([, y]) => y === 1), "a spike between the kept points is kept");
  eq(run(`monitorSpark([])`), null, "no series, no line");

  const rows = [
    { coin: "BTC", change24h: 1.2, change30d: 4, dailyMove: 2.1 },
    { coin: "ETH", change24h: -0.4, change30d: -12, dailyMove: 3.4 },
    { coin: "SOL", change24h: 2.5, change30d: 9, dailyMove: 4.6 },
    { coin: "XRP", change24h: null, change30d: null, dailyMove: null },
  ];
  sandbox.__rows = rows;
  const f = run(`monitorSummary(__rows)`);
  ok(f.up === 2 && f.of === 3, "up today counts the coins with a day, and says of how many", JSON.stringify(f));
  eq(f.median30, 4, "the middle coin's 30 days is the median, never the mean");
  ok(f.widest.coin === "SOL" && f.mover.coin === "ETH" && f.mover.v === -12, "the widest day and the largest move either way name their coin", JSON.stringify(f));
  eq(run(`monitorSummary([])`).median30, null, "an empty list has no median, not zero");

  sandbox.__caps = [{ key: "A", value: 60 }, { key: "B", value: 25 }, { key: "C", value: 10 }, { key: "D", value: 5 }, { key: "Z", value: 0 }];
  const rects = run(`squarify(__caps, 200, 100)`);
  eq(rects.length, 4, "every tile with a value is laid out, and nothing without one");
  const area = (k) => { const q = rects.find((x) => x.key === k); return q.w * q.h; };
  ok(Math.abs(area("A") - 12000) < 1e-6 && Math.abs(area("D") - 1000) < 1e-6, "each tile's area is its share of the box", JSON.stringify(rects));
  ok(rects.every((q) => q.x >= -1e-9 && q.y >= -1e-9 && q.x + q.w <= 200 + 1e-6 && q.y + q.h <= 100 + 1e-6), "…all inside it");
  let overlap = 0;
  for (const a of rects) for (const b of rects) if (a !== b && a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6) overlap++;
  eq(overlap, 0, "…and none on another");
  const worst = Math.max(...rects.map((q) => Math.max(q.w / q.h, q.h / q.w)));
  ok(worst < 3, "the tiles stay near square — the point of squarifying", worst.toFixed(2));
  eq(run(`squarify([], 10, 10)`).length, 0, "nothing to lay out, no tiles");
}

/* ── The correlation matrix ── */
{
  sandbox.__s = { BTC: [1, 2, 3], ETH: [1, 2, 3], SOL: [1, 2] };
  const m = run(`correlationMatrix(["BTC", "ETH", "SOL"], __s)`);
  eq(Object.keys(m).length, 6, "every ordered pair of three coins, and no diagonal");
  eq(JSON.stringify(m["BTC|ETH"]), JSON.stringify(m["ETH|BTC"]), "the matrix is symmetric — each pair worked out once");
  eq(m["BTC|BTC"], undefined, "a coin against itself is no measurement");
  const half = run(`correlationMatrix(["BTC", "XRP"], __s)`);
  eq(half["BTC|XRP"], null, "a coin with no series yet has no cell, not a zero");
}

/* ── What a typed line asks for ── */
{
  sandbox.__cmds = [{ key: "N", label: "News — every source" }, { key: "M", label: "Monitor — your coins" }, { key: "G", label: "Price / time grid on the chart" }];
  const q = (line, current = "BTC") => run(`quickCommandMatches(${JSON.stringify(line)}, ["BTC", "ETH"], __cmds, ${JSON.stringify(current)})`);
  const cr = q("eth 1y").lead[0];
  ok(cr && cr.kind === "coinRange" && cr.coin === "ETH" && cr.period === "year" && cr.owned === true, "\"eth 1y\" is Ethereum on the year", JSON.stringify(cr));
  const add = q("sol all").lead[0];
  ok(add && add.coin === "SOL" && add.owned === false && add.period === "all", "…a coin not on the list is offered too, as an add", JSON.stringify(add));
  const range = q("1w").lead[0];
  ok(range && range.kind === "range" && range.period === "week", "\"1w\" alone is the range", JSON.stringify(range));
  const cmp = q("compare eth").lead[0];
  ok(cmp && cmp.kind === "compare" && cmp.coin === "ETH", "\"compare eth\" compares with Ethereum", JSON.stringify(cmp));
  const spx = q("vs spx").lead[0];
  ok(spx && spx.coin === "SPYx", "\"vs spx\" finds the S&P 500 market", JSON.stringify(spx));
  eq(q("compare btc").lead.length, 0, "a coin is never compared with itself");
  const tgt = q("target 90,000").lead[0];
  ok(tgt && tgt.kind === "target" && tgt.price === 90000, "\"target 90,000\" is a price target at 90000", JSON.stringify(tgt));
  eq(q("target abc").lead.length, 0, "…and a target needs a number");
  const news = q("news");
  ok(news.lead.length === 1 && news.lead[0].key === "N", "a shortcut's own word, typed out, leads", JSON.stringify(news));
  const grid = q("gri");
  ok(grid.tail.some((c) => c.key === "G"), "a word inside a name is found too, after the coins", JSON.stringify(grid));
  const one = q("g");
  ok(one.lead.length === 0 && one.tail.length === 1 && one.tail[0].key === "G", "a single letter is the key, and never ahead of the coins", JSON.stringify(one));
  eq(q("").lead.length + q("").tail.length, 0, "nothing typed, no command");

  /* Half-typed lines suggest how they go on (3 Oct 2026) */
  const qp = (line) => run(`quickCommandMatches(${JSON.stringify(line)}, ["BTC", "ETH", "SOL"], __cmds, "BTC", 83000)`);
  const cmpAll = qp("compare");
  ok(cmpAll.lead.length >= 4 && cmpAll.lead.every((i) => i.kind === "compare" && i.coin !== "BTC") && cmpAll.hint, "\"compare\" alone lists what can be compared, never the coin on screen, and says the shape", JSON.stringify(cmpAll));
  ok(cmpAll.lead.some((i) => i.coin === "SPYx"), "…markets among them");
  const tgt0 = qp("target");
  ok(tgt0.lead.length === 4 && tgt0.lead[0].price === 87200 && tgt0.lead[0].move === 5, "\"target\" alone offers levels around the price, rounded to three figures", JSON.stringify(tgt0.lead));
  const tgtPct = qp("target -10%");
  ok(tgtPct.lead.length === 1 && tgtPct.lead[0].price === 74700, "\"target -10%\" is a level 10% under the price", JSON.stringify(tgtPct.lead));
  const space = qp("eth ");
  ok(space.lead.length === 6 && space.lead.every((i) => i.kind === "coinRange" && i.coin === "ETH"), "a coin and a space offers its six ranges", JSON.stringify(space.lead.map((i) => i.period)));
  eq(qp("eth 1").lead.length, 5, "…and \"eth 1\" the five that start with 1");
  const verb = qp("comp").lead.find((i) => i.kind === "verb");
  ok(verb && verb.word === "compare", "the start of a command word offers the word", JSON.stringify(verb));
  ok(qp("karşılaştır").lead.length >= 4 && qp("hedef").lead.length === 4, "the language's own command words work as the English ones do");
  ok(qp("compare").lead.length >= 4, "…and the English ones still work in that language");
  const tab = (item) => run(`quickCompletion(${JSON.stringify(item)})`);
  eq(tab({ kind: "coinRange", coin: "ETH", period: "year" }), "eth 1y", "Tab writes a coin on a range as its line");
  eq(tab({ kind: "verb", word: "compare" }), "compare ", "…a command word with the space after it");
  eq(tab({ kind: "coin", coin: "SOL" }), "sol ", "…and a coin ready for its range");
}

console.log(`✔ ${checks} monitor checks`);
console.log("MONITOR TESTS OK");
