/* The assistant (src/assistant.js): a desk's checks as facts, in three
 * phases. Each fixture is built so the item it should raise is known before
 * the function runs, and each asserts the number the item carries — a list
 * that merely exists proves nothing. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const SRC = path.join(__dirname, "..", "src");
const sandbox = { console, Math, Number, Array, isFinite, JSON, Object, String, Set, Date, BigInt };
vm.createContext(sandbox);
for (const f of ["practice-math.js", "practice-model.js", "assistant.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), "utf8"), sandbox, { filename: f });
}
const run = (code) => vm.runInContext(code, sandbox);
const same = (a, b, label) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), label);
const readings = run("assistantReadings");
const P = (v) => Math.round(v * 10000);
const HOUR = 3600;
const series = (prices) => prices.map((p, i) => ({ price: p, time: 1700000000 + i * HOUR }));
const find = (list, key) => list.find((i) => i.key === key);

/* A calm window: every step is 0.1%. */
const calm = [];
let v = 1000;
for (let i = 0; i < 200; i += 1) {
  v *= i % 2 ? 1.001 : 1 / 1.001;
  calm.push(v);
}

/* 1. Before: a ticket with no stop is a missing item; with a stop inside the
      window's noise it is a watch, with one outside it is a note. */
{
  const base = { now: 1700000000000, coin: "BTC", series: series(calm), accountE2: 1000000, freeE2: 1000000, plan: { lossPerTradePct: 1 } };
  const none = readings({ ...base, ticket: { side: "long", entryE4: P(1000), stopE4: null, takeE4: null, leverage: 5 } });
  assert.strictEqual(find(none.before, "stop").kind, "missing", "no stop on the ticket is a missing item");
  assert.strictEqual(none.missing, 1, "…and it is counted for the badge");
  assert.ok(find(none.before, "take"), "no take-profit is a note");
  /* A stop 0.05% away, when every step is 0.1%: every step reaches it. */
  const tight = readings({ ...base, ticket: { side: "long", entryE4: P(1000), stopE4: P(999.5), takeE4: P(1010), leverage: 5 } });
  const noise = find(tight.before, "stopNoise");
  assert.strictEqual(noise.kind, "watch", "a stop inside the window's ordinary step is a watch");
  assert.ok(noise.data.share > 0.99 && noise.data.steps === 199, `…saying how many steps reached it (${noise.data.share} of ${noise.data.steps})`);
  assert.ok(!find(tight.before, "stop") && !find(tight.before, "take"), "…and the missing items are gone");
  const wide = readings({ ...base, ticket: { side: "long", entryE4: P(1000), stopE4: P(980), takeE4: P(1010), leverage: 5 } });
  assert.strictEqual(find(wide.before, "stopNoise").kind, "note", "a stop 2% away, on 0.1% steps, is a note");
  assert.strictEqual(find(wide.before, "stopNoise").data.share, 0, "…with zero steps that big");
}

/* 2. Risk share against the plan, margin share of the free balance, and the
      liquidation against the window. */
{
  const base = { now: 1700000000000, coin: "BTC", series: series(calm), accountE2: 1000000, freeE2: 1000000, plan: { lossPerTradePct: 1 } };
  const over = readings({ ...base, ticket: { side: "long", entryE4: P(1000), stopE4: P(980), takeE4: null, leverage: 5, stopLossE2: 20000, marginE2: 600000, notionalE2: 3000000, liqE4: P(999.5) } });
  const risk = find(over.before, "riskShare");
  assert.strictEqual(risk.kind, "watch", "a loss at the stop above the plan's share is a watch");
  assert.strictEqual(risk.data.capE2, 10000, "…against the plan's cap in money");
  assert.ok(Math.abs(risk.data.pct - 2) < 1e-9, "…and as a share of the account");
  const share = find(over.before, "marginShare");
  assert.strictEqual(share.kind, "watch", "margin over half the free balance is a watch");
  assert.ok(Math.abs(share.data.share - 0.6) < 1e-9);
  const liq = find(over.before, "liqNoise");
  assert.strictEqual(liq.kind, "watch", "a liquidation inside the window's steps is a watch");
  assert.ok(liq.data.share > 0, "…with the share of steps that big");
  const fine = readings({ ...base, ticket: { side: "long", entryE4: P(1000), stopE4: P(980), takeE4: null, leverage: 2, stopLossE2: 5000, marginE2: 100000, notionalE2: 200000, liqE4: P(600) } });
  assert.strictEqual(find(fine.before, "riskShare").kind, "note");
  assert.strictEqual(find(fine.before, "marginShare").kind, "note");
  assert.strictEqual(find(fine.before, "liqNoise").kind, "note", "a liquidation further than any step is a note");
  assert.strictEqual(find(fine.before, "liqNoise").data.share, 0);
}

/* 3. Funding: soon is a watch, and the cost is this contract's. */
{
  const now = 1700000000000;
  const base = { now, coin: "BTC", series: series(calm), accountE2: 1000000, freeE2: 1000000, plan: {} };
  const soon = readings({ ...base, funding: { rate: 0.0001, at: now + 20 * 60000 }, ticket: { side: "long", entryE4: P(1000), stopE4: P(980), takeE4: P(1020), leverage: 5, notionalE2: 1000000 } });
  const f = find(soon.before, "funding");
  assert.strictEqual(f.kind, "watch", "a settlement twenty minutes out is a watch");
  assert.strictEqual(f.data.minutes, 20);
  assert.strictEqual(f.data.costE2, 100, "…costing notional × rate on this contract");
  assert.strictEqual(f.data.pays, true, "…which a long pays when the rate is positive");
  const later = readings({ ...base, funding: { rate: -0.0002, at: now + 5 * 3600000 }, ticket: { side: "long", entryE4: P(1000), stopE4: P(980), takeE4: P(1020), leverage: 5, notionalE2: 1000000 } });
  const g = find(later.before, "funding");
  assert.strictEqual(g.kind, "note", "five hours out is a note");
  assert.strictEqual(g.data.pays, false, "…and a long receives when the rate is negative");
  assert.strictEqual(g.data.perDayE2, 600, "…three settlements a day");
}

/* 4. The crowd only when it is at an extreme, the regime, the location, the
      streak, and the news count. */
{
  const base = { now: 1700000000000, coin: "BTC", series: series(calm), accountE2: 1000000, freeE2: 1000000, plan: { streakPause: 3 } };
  const r = readings({ ...base, crowd: { state: "long", rank: 0.95, share: 0.7, n: 20, up: 8, baseRate: 0.55, lean: "short" }, vol: { ratio: 1.6, regime: "expanding", pct: 0.9, ac1: -0.2, short: 24, long: 96 }, location: "below", locationWindow: 96, streak: 2, news: { count: 3, newestMin: 12 } });
  const c = find(r.before, "crowd");
  assert.ok(c && c.data.rank === 0.95 && c.data.n === 20 && Math.abs(c.data.up - 0.4) < 1e-9, "an extreme crowd carries its record");
  assert.ok(find(r.before, "regime").data.regime === "expanding", "the regime is a note");
  assert.strictEqual(find(r.before, "location").data.state, "below");
  const st = find(r.before, "streak");
  assert.strictEqual(st.kind, "watch", "two losses in a row is a watch");
  assert.strictEqual(st.data.pause, 3, "…beside the account's own pause rule");
  assert.strictEqual(find(r.before, "news").data.count, 3);
  const mid = readings({ ...base, crowd: { state: "middle", rank: 0.5, n: 20, up: 10 } });
  assert.ok(!find(mid.before, "crowd"), "an ordinary crowd is not raised");
}

/* 5. Same-side exposure across open contracts, and the during list per
      contract: no stop, liquidation in the window, give-back, R now, held. */
{
  const now = 1700000000000;
  const state = run(`(() => {
    let s = { ...practiceEmptySession(), plan: { ...practiceEmptySession().plan } };
    const a = practiceOpen(s, { coin: "BTC", side: "long", qty: 1000, leverage: 5, at: ${now - 90 * 60000} }, ${P(1000)});
    s = a.state;
    const b = practiceOpen(s, { coin: "ETH", side: "long", qty: 10000, leverage: 5, at: ${now - 10 * 60000} }, ${P(100)});
    s = b.state;
    s = practiceSetTriggers(s, b.id, ${P(90)}, null, 1000000, undefined).state;
    /* BTC ran up to 1050 and came back to 1010: the peak is stamped by a step. */
    s = practiceStep(s, s.step + 1, { BTC: ${P(1050)}, ETH: ${P(100)} }, { last: { BTC: ${P(1050)}, ETH: ${P(100)} } }).state;
    return { s, a: a.id, b: b.id };
  })()`);
  const held = run("practiceList")(state.s).map((id) => run("practiceAt")(state.s, id));
  const r = readings({ now, coin: "BTC", series: series(calm), positions: held, marks: { BTC: P(1010), ETH: P(100) }, plan: {}, accountE2: 1000000, freeE2: 500000 });
  const same_ = find(r.before, "sameSide");
  assert.ok(same_ && same_.kind === "watch" && same_.data.count === 2 && same_.data.side === "long", "two contracts both long is a watch");
  same(same_.data.coins, ["BTC", "ETH"], "…naming the markets");
  const btc = r.during.find((c) => c.coin === "BTC");
  const eth = r.during.find((c) => c.coin === "ETH");
  assert.ok(find(btc.items, "posStop") && find(btc.items, "posStop").kind === "missing", "the BTC contract has no stop — missing");
  assert.ok(!find(eth.items, "posStop"), "the ETH contract has one");
  const gave = find(btc.items, "posGiveBack");
  assert.ok(gave && gave.kind === "watch" && gave.data.gave > 0.7, `BTC gave back most of its peak (${gave && gave.data.gave})`);
  assert.ok(gave.data.bestE2 > gave.data.nowE2 && gave.data.nowE2 > 0, "…with both figures");
  const r_ = find(eth.items, "posR");
  assert.ok(r_ && Math.abs(r_.data.r) < 0.2, "R now against the first stop's risk");
  const heldItem = find(btc.items, "posHeld");
  assert.strictEqual(heldItem.data.minutes, 90, "held for ninety minutes");
  assert.ok(find(btc.items, "posLiq") && find(btc.items, "posLiq").data.share === 0, "a 5x liquidation is further than any 0.1% step");
  assert.strictEqual(r.missing, 1);
}

/* 6. After: the scorecard is pointed at, bad losses make it a watch, and the
      code with the widest with/without gap is named with both counts. */
{
  const r = readings({ now: 1700000000000, coin: "BTC", plan: {}, scorecard: { n: 8, grades: { A: 5, B: 1, C: 2 }, bad: 2, win: { p: 0.5, lo: 0.2, hi: 0.8, n: 8 }, profitFactor: 1.2, avgR: 0.3 }, bySetup: { n: 12, codes: { "tape:buyers": { with: { n: 6, wins: 5 }, without: { n: 6, wins: 1 } }, "mgmt:stop": { with: { n: 12, wins: 6 }, without: { n: 0, wins: 0 } } } } });
  const g = find(r.after, "grades");
  assert.ok(g && g.kind === "watch" && g.data.bad === 2 && g.data.C === 2, "bad losses are a watch on the record");
  const b = find(r.after, "bySetup");
  assert.ok(b && b.data.code === "tape:buyers" && b.data.with.n === 6 && b.data.without.n === 6, "the widest gap with enough on both sides");
  const thin = readings({ now: 1700000000000, coin: "BTC", plan: {}, scorecard: { n: 2, grades: { A: 2, B: 0, C: 0 }, bad: 0 } });
  assert.strictEqual(find(thin.after, "grades").kind, "note");
  assert.ok(!find(thin.after, "bySetup"), "no by-setup line under five contracts");
}

/* 6b. Chart hints: an item about a price carries the level it names and the
       band of ordinary steps (the 80th percentile) around the price it is
       measured from; items about nothing on the chart carry none. */
{
  const base = { now: 1700000000000, coin: "BTC", series: series(calm), accountE2: 1000000, freeE2: 1000000, plan: {}, area: { val: 990, vah: 1010, poc: 1000 } };
  const r = readings({ ...base, location: "inside", ticket: { side: "long", entryE4: P(1000), stopE4: P(990), takeE4: null, leverage: 5, liqE4: P(800) } });
  const noise = find(r.before, "stopNoise");
  assert.ok(noise.chart && Math.abs(noise.chart.level - 990) < 1e-9, "the stop item names the stop as its level");
  const step = run("assistantOrdinaryStep")(series(calm));
  assert.ok(step > 0.00099 && step < 0.00101, `the ordinary step of a 0.1% window is 0.1% (${step})`);
  assert.ok(Math.abs(noise.chart.band[0] - 1000 * Math.exp(-step)) < 1e-6 && Math.abs(noise.chart.band[1] - 1000 * Math.exp(step)) < 1e-6, "…with the band one ordinary step either side of the entry");
  assert.ok(find(r.before, "liqNoise").chart.level === 800, "the liquidation item names the liquidation");
  same(find(r.before, "location").chart.band, [990, 1010], "the location item carries the value area");
  assert.strictEqual(find(r.before, "take").chart, null, "an item about nothing on the chart carries no hint");
  const none = readings({ ...base, ticket: { side: "long", entryE4: P(1000), stopE4: null, takeE4: null, leverage: 5 } });
  assert.ok(find(none.before, "stop").chart && find(none.before, "stop").chart.level === 1000, "a missing stop shows the band around the entry, so the noise it would sit in is visible");
}

/* 7. Order: missing before watch before note, everywhere. */
{
  const r = readings({ now: 1700000000000, coin: "BTC", series: series(calm), accountE2: 1000000, freeE2: 1000000, plan: { lossPerTradePct: 1 }, ticket: { side: "long", entryE4: P(1000), stopE4: null, takeE4: null, leverage: 5, marginE2: 800000 }, streak: 3 });
  const kinds = r.before.map((i) => i.kind);
  assert.strictEqual(kinds[0], "missing");
  assert.ok(kinds.indexOf("note") > kinds.lastIndexOf("watch"), `notes come last: ${kinds.join(",")}`);
  assert.strictEqual(r.total, r.before.length);
  assert.deepStrictEqual(readings({}).total, 0, "nothing to read is an empty reading, not a throw");
}

console.log("ASSISTANT TESTS OK");
