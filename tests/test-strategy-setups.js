/* The strategy setups (`src/strategy-setups.js`): the indicators on series
 * whose values are known by hand, and each setup's state on a drawn path
 * built to contain exactly one of it. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "src");
const sandbox = { console, msg: (key, english) => english };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(SRC, "strategy-setups.js"), "utf8") +
    "\nObject.assign(this, { STRATEGY_SETUPS, ssSma, ssEma, ssStd, ssWilder, ssAdx, ssSupertrend, strategySetupStates, strategySetupEntries, moveRateFor });",
  sandbox,
  { filename: "strategy-setups.js" },
);
const S = sandbox;
const plain = (v) => JSON.parse(JSON.stringify(v));
let failed = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failed++;
    console.error(`  ✘ ${label}${detail !== undefined ? " — " + detail : ""}`);
  }
};
const near = (a, b) => a != null && Math.abs(a - b) < 1e-9;
const candles = (closes, spread) =>
  closes.map((c, i) => ({ t: 1600000000 + i * 86400, open: c, high: c + (spread || 0), low: c - (spread || 0), close: c }));
const entries = (arr) => plain(S.strategySetupEntries(arr));

console.log("\nStrategy setups");

check(plain(S.ssSma([1, 2, 3, 4, 5], 3)).join(",") === ",,2,3,4", "a simple average waits for its whole window", plain(S.ssSma([1, 2, 3, 4, 5], 3)).join(","));
{
  const e = plain(S.ssEma([1, 2, 3, 4, 5, 6], 3));
  check(e[1] === null && e[2] === 2 && e[3] === 3 && e[4] === 4 && e[5] === 5,
    "an exponential average is seeded with the simple average of its first n, then k = 2/(n+1)", e.join(","));
}
check(near(plain(S.ssStd([2, 4, 4, 4, 5, 5, 7, 9], 8))[7], 2), "the band's σ is the population standard deviation");
{
  const w = plain(S.ssWilder([1, 2, 3, 4, 5], 3));
  check(w[2] === 2 && near(w[3], 8 / 3) && near(w[4], 31 / 9), "Wilder's average: the mean of the first n, then prev + (x − prev)/n", w.join(","));
}
check(S.STRATEGY_SETUPS.length === 12 && S.STRATEGY_SETUPS.every((s) => s.claim && s.what && ["up", "down", "move"].includes(s.kind)),
  "twelve setups, each with what it is, what it is said to mean, and the kind of claim");

{
  /* Flat at 100 for 30 days, then 101, 102, 103: one breakout, entered on
     day 30, and a run of new highs after it is the same episode. */
  const s = S.strategySetupStates(candles([...Array(30).fill(100), 101, 102, 103]));
  check(entries(s["breakout-high"]).join(",") === "30", "a close above the 20 days before is a breakout, and a run of them is one", entries(s["breakout-high"]).join(","));
  check(entries(s["breakout-low"]).length === 0, "…with no breakdown in a rising path");
}
{
  /* Flat at 100, then one close at 90: below the lower band on that day. */
  const s = S.strategySetupStates(candles([...Array(25).fill(100), 90]));
  check(entries(s["boll-lower"]).join(",") === "25" && entries(s["boll-upper"]).length === 0,
    "a close far under a flat range is below the lower band", entries(s["boll-lower"]).join(","));
}
{
  /* 200 days falling from 160 to 60, then rising 2 a day: the 50-day
     average passes the 200-day once, from below. */
  const down = Array.from({ length: 200 }, (_, i) => 160 - i * 0.5);
  const up = Array.from({ length: 150 }, (_, i) => 60.5 + (i + 1) * 2);
  const s = S.strategySetupStates(candles([...down, ...up], 1));
  const g = entries(s["golden-cross"]);
  check(g.length === 1 && g[0] > 200 && entries(s["death-cross"]).length === 0,
    "a long fall then a steady rise makes exactly one golden cross, after the turn", g.join(","));
}
{
  /* 40 days rising one a day, then five falling ten a day: Supertrend turns
     down once and not back. A steady rise is also a strong trend. */
  const path2 = [...Array.from({ length: 40 }, (_, i) => 100 + i), ...Array.from({ length: 5 }, (_, i) => 139 - (i + 1) * 10)];
  const s = S.strategySetupStates(candles(path2, 1));
  check(entries(s["supertrend-down"]).length === 1 && entries(s["supertrend-down"])[0] >= 40 && entries(s["supertrend-up"]).length === 0,
    "a steady rise then a crash flips Supertrend down once, in the crash", entries(s["supertrend-down"]).join(","));
  const adx = plain(S.ssAdx(candles(path2, 1), 14));
  check(adx[27] > 25 && entries(s["adx-strong"]).length === 1,
    "…and ADX reads the steady rise as a strong trend", `${adx[27]}`);
}
{
  /* Closes that double after every entry: every episode moved more than
     an ordinary stretch. */
  const closes = Array.from({ length: 60 }, (_, i) => (i === 10 || i === 30 ? 100 : 100 + (i % 3)));
  closes[15] = 200;
  closes[35] = 200;
  const states = closes.map((_, i) => i === 10 || i === 30);
  const r = plain(S.moveRateFor(closes, states, 5));
  check(r.n === 2 && r.bigger === 2 && r.share === 100,
    "the move rate counts how often the move after an entry beat an ordinary stretch's median", JSON.stringify(r));
}
check(Object.keys(plain(S.strategySetupStates([]))).length === 12, "no candles: every state empty, nothing thrown");

{
  /* The overlay lines for the chart: aligned with the candles, empty until
     their window exists, and Supertrend drawn on one side at a time. */
  const wave = candles(Array.from({ length: 120 }, (_, i) => 100 + 10 * Math.sin(i / 8)), 1);
  vm.runInContext("this.indicatorOverlaySeries = indicatorOverlaySeries;", sandbox);
  const b = plain(S.indicatorOverlaySeries(wave, "bollinger"));
  check(b.lines.map((l) => l.id).join(",") === "upper,mid,lower" && b.lines.every((l) => l.points.length === 120)
    && b.lines[0].points[18].v === null && b.lines[0].points[19].v !== null
    && b.lines[0].points.every((p, i) => p.v === null || p.v >= b.lines[2].points[i].v),
    "Bollinger: three lines on the candles' own days, nothing before the 20th, the upper never under the lower");
  const st = plain(S.indicatorOverlaySeries(wave, "supertrend"));
  const both = st.lines[0].points.filter((p, i) => p.v !== null && st.lines[1].points[i].v !== null).length;
  check(both === 0 && st.lines.some((l) => l.points.some((p) => p.v !== null)),
    "Supertrend: the band under the price or the band over it, never both on one day", `both on ${both} days`);
  check(S.indicatorOverlaySeries(wave, "nonsense") === null && S.indicatorOverlaySeries(wave.slice(0, 10), "bollinger") === null,
    "an unknown kind, or too few candles, draws nothing");
}

if (failed) {
  console.error(`\n✘ ${failed} STRATEGY SETUP CHECK(S) FAILED`);
  process.exit(1);
}
console.log("STRATEGY SETUP TESTS OK");
