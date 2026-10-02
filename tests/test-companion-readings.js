/* The second round of chart companions: the swing patterns
 * (`src/swing-patterns.js`) and the daily readings
 * (`src/companion-readings.js`).
 *
 * Every case is a drawn price path whose answer was worked out by hand
 * before the function ran, the way the first four patterns were checked —
 * and the same paths the preregistered study was checked on
 * (`docs/internal/research/companions-prereg.md`).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "src");
const sandbox = { console, msg: (key, english) => english };
vm.createContext(sandbox);
const utils = fs.readFileSync(path.join(SRC, "utils.js"), "utf8");
const grab = (name) => {
  const i = utils.indexOf(`const ${name} = `);
  let d = 0;
  const j = utils.indexOf("{", utils.indexOf("=>", i));
  for (let k = j; k < utils.length; k++) {
    if (utils[k] === "{") d++;
    else if (utils[k] === "}" && !--d) return utils.slice(i, k + 1) + ";";
  }
  throw new Error(name);
};
vm.runInContext(
  [
    grab("dailyRsi"),
    fs.readFileSync(path.join(SRC, "price-patterns.js"), "utf8"),
    fs.readFileSync(path.join(SRC, "strategy-setups.js"), "utf8"),
    fs.readFileSync(path.join(SRC, "swing-patterns.js"), "utf8"),
    fs.readFileSync(path.join(SRC, "companion-readings.js"), "utf8"),
    "Object.assign(this, { SWING_PATTERNS, detectSwingPatterns, COMPANION_READINGS, companionReadingStates, crDivergence, READING_HORIZON });",
  ].join("\n"),
  sandbox,
  { filename: "companions.js" },
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
const r2 = (v) => Math.round(v * 100) / 100;

// A path through straight-line knots, a bar a day, high and low ±0.5
const path2 = (knots, flip) => {
  const out = [];
  for (let k = 0; k < knots.length - 1; k++) {
    const [a, pa] = knots[k];
    const [b, pb] = knots[k + 1];
    for (let i = a; i < b; i++) out.push(pa + ((pb - pa) * (i - a)) / (b - a));
  }
  return out.map((p0, i) => {
    const p = flip ? 200 - p0 : p0;
    return { t: 1600000000 + i * 86400, open: p, high: p + 0.5, low: p - 0.5, close: p };
  });
};
const find = (episodes, kind) => plain(episodes).find((e) => e.kind === kind);
const day = (c, t) => c.findIndex((x) => x.t === t);

console.log("\nSwing patterns");

check(S.SWING_PATTERNS.length === 12 && S.SWING_PATTERNS.every((p) => p.title && p.claim && typeof p.bear === "boolean"),
  "twelve patterns, each with the claim it is said to support");

{
  /* Ascending triangle: highs 100.5 and 100.9 (flat), lows 89.5 then 93.5
     (rising). The second low is known at bar 50, where the close is 103 —
     above 100.9. Target 103 + (100.9 − 89.5) = 114.4; invalidation 93.5. */
  const c = path2([[0, 80], [15, 100], [25, 90], [35, 100.4], [45, 94], [55, 112], [90, 130]]);
  const e = find(S.detectSwingPatterns(c), "asc-triangle");
  check(e && day(c, e.at) === 50 && r2(e.breakout) === 103 && r2(e.target) === 114.4 && e.stop === 93.5 && e.out === "target",
    "an ascending triangle breaks out where its last swing point is known, and reaches its target", e && JSON.stringify([day(c, e.at), e.breakout, e.target, e.stop, e.out]));
  check(e && e.lines.length === 1 && e.lines[0].from.price === 89.5 && e.lines[0].to.price === 93.5,
    "…and carries its rising line to draw");
}
{
  // The same path upside down is a descending triangle
  const c = path2([[0, 80], [15, 100], [25, 90], [35, 100.4], [45, 94], [55, 112], [90, 130]], true);
  const e = find(S.detectSwingPatterns(c), "desc-triangle");
  check(e && day(c, e.at) === 50 && r2(e.breakout) === 97 && r2(e.target) === 85.6 && e.stop === 106.5,
    "mirrored, it is a descending triangle with the mirrored levels", e && JSON.stringify([day(c, e.at), e.breakout, e.target, e.stop]));
}
{
  /* Symmetrical: highs 110.5 → 104.5, lows 89.5 → 94.5. Upper line at bar
     50 is 110.5 − 0.3 × 35 = 100; the close there is 105. Target 105 + 21. */
  const c = path2([[0, 80], [15, 110], [25, 90], [35, 104], [45, 95], [55, 115], [90, 140]]);
  const all = plain(S.detectSwingPatterns(c));
  const e = all.find((x) => x.kind === "sym-triangle-up");
  check(e && day(c, e.at) === 50 && r2(e.breakout) === 105 && r2(e.target) === 126 && e.stop === 94.5 && e.out === "target",
    "a triangle broken upwards measures its first height from the breakout", e && JSON.stringify([day(c, e.at), e.breakout, e.target, e.stop, e.out]));
  check(!all.some((x) => x.kind === "sym-triangle-down"), "…and one set of swing points fires one way only");
}
{
  /* Triple top: highs 100.5, 101.3, 100.9 (within 0.8%), lows 91.5 and
     92.5. Last high known at 60; the first close under 91.5 is bar 61. */
  const c = path2([[0, 80], [15, 100], [25, 92], [35, 100.8], [45, 93], [55, 100.4], [65, 85], [100, 60]]);
  const e = find(S.detectSwingPatterns(c), "triple-top");
  check(e && day(c, e.at) === 61 && r2(e.breakout) === 91.16 && r2(e.target) === 81.36 && e.stop === 101.3,
    "a triple top breaks under its lower low and measures the top's height", e && JSON.stringify([day(c, e.at), r2(e.breakout), r2(e.target), e.stop]));
}
{
  /* Bull flag: a pole from 97.5 to 120.5 in ten bars (23.6%), the flag's
     low 111.5 keeps more than half of it, the second high 117.5 is lower.
     The line through the two highs is 116.43 at bar 39, where the close is
     116.9. Target 116.9 + 23 = 139.9; invalidation the flag's low. */
  const c = path2([[0, 100], [10, 98], [20, 120], [27, 112], [34, 117], [37, 114], [39, 116.9], [60, 145]]);
  const e = find(S.detectSwingPatterns(c), "bull-flag");
  check(e && day(c, e.at) === 39 && r2(e.breakout) === 116.9 && r2(e.target) === 139.9 && e.stop === 111.5 && e.out === "target",
    "a bull flag breaks out of its flag and measures the pole", e && JSON.stringify([day(c, e.at), e.breakout, e.target, e.stop, e.out]));
}
{
  // A pole too slow (twenty bars) is not a flag
  const c = path2([[0, 100], [10, 98], [30, 120], [37, 112], [44, 117], [47, 114], [49, 116.9], [70, 145]]);
  check(!plain(S.detectSwingPatterns(c)).some((x) => x.kind === "bull-flag"), "a pole of twenty bars is not a flag's pole");
}
{
  // Causal: cut the path at the bar before the breakout and nothing has fired
  const c = path2([[0, 80], [15, 100], [25, 90], [35, 100.4], [45, 94], [55, 112], [90, 130]]).slice(0, 50);
  check(!plain(S.detectSwingPatterns(c)).some((x) => x.kind === "asc-triangle"),
    "nothing is found before the bar that completes it — the last swing point is not known yet");
}
check(plain(S.detectSwingPatterns([])).length === 0 && plain(S.detectSwingPatterns(null)).length === 0, "no candles, no patterns");

console.log("\nReadings");

const candles = (closes, spread) =>
  closes.map((c, i) => ({ t: 1600000000 + i * 86400, open: c, high: c + (spread || 0.5), low: c - (spread || 0.5), close: c }));
const on = (arr) => plain(arr).map((v, i) => (v ? i : -1)).filter((i) => i >= 0);

check(S.COMPANION_READINGS.length === 21 && S.COMPANION_READINGS.every((r) => r.what && r.claim && ["up", "down", "move"].includes(r.kind)),
  "twenty-one readings, each with what it is, what it is said to mean, and its kind");
{
  const st = plain(S.companionReadingStates([]));
  check(S.COMPANION_READINGS.every((r) => Array.isArray(st[r.id]) && st[r.id].length === 0), "no candles: every reading empty, nothing thrown");
}
{
  const st = S.companionReadingStates(candles([100, 100, 100, 100, 100, 101, 102, 103, 104, 105, 106]));
  check(on(st["streak-up"]).join(",") === "9,10", "five higher closes in a row: true from the fifth", on(st["streak-up"]).join(","));
}
{
  const c = candles([...Array(400).fill(100), 101, 100.5]);
  check(on(S.companionReadingStates(c).ath).join(",") === "400", "an all-time high is a close above every close before it, after a year");
}
{
  const c = candles([...Array(200).fill(100), 250]);
  check(on(S.companionReadingStates(c)["mayer-high"]).join(",") === "200",
    "the Mayer multiple: 250 over a 200-day average of 100.75 is 2.48");
}
{
  const c = [10, 9, 8, 7, 6, 5, 1, 4].map((r, i) => ({ t: 1600000000 + i * 86400, open: 100, high: 100 + r, low: 100 - r, close: 100 }));
  check(on(S.companionReadingStates(c).nr7).join(",") === "6", "the narrowest range of seven days", on(S.companionReadingStates(c).nr7).join(","));
  check(on(S.companionReadingStates(c)["inside-day"]).join(",") === "1,2,3,4,5,6", "an inside day sits within the day before");
}
{
  /* Last week's H 110, L 90, C 100: P 100, R1 110, S1 90. The week starts
     on a Monday (UTC); the second week's closes cross 110 on its third day. */
  const monday = Math.ceil(1600000000 / 86400 / 7) * 7 * 86400 - 3 * 86400;
  const wk1 = [100, 105, 110, 90, 95, 100, 100].map((c, i) => ({ t: monday + i * 86400, open: c, high: c, low: c, close: c }));
  wk1[2].high = 110;
  wk1[3].low = 90;
  const wk2 = [100, 108, 111, 112].map((c, i) => ({ t: monday + (7 + i) * 86400, open: c, high: c, low: c, close: c }));
  const st = S.companionReadingStates([...wk1, ...wk2]);
  check(on(st["pivot-r1"]).join(",") === "9", "a close crossing last week's R1 (2P − L)", on(st["pivot-r1"]).join(","));
}
{
  /* A swing from 89.5 to 120.5 (34.6%): its 61.8% retracement is 101.34
     and its 78.6% is 96.13. Falling a point a day from 120, the first low
     at or under 101.34 is bar 44 (close 101). */
  const c = path2([[0, 100], [10, 90], [25, 120], [45, 100], [60, 110]]);
  check(on(S.companionReadingStates(c)["fib-hold-up"]).join(",") === "44", "the first day a 15% swing's 61.8% retracement is reached, closing above its 78.6%",
    on(S.companionReadingStates(c)["fib-hold-up"]).join(","));
}
{
  /* A divergence is told by the swing points and the indicator alone: lows
     at bars 20 (89.5) and 40 (84.5), the indicator 30 then 40 — known at 45. */
  const c = path2([[0, 100], [20, 90], [30, 100], [40, 85], [50, 100]]);
  const ind = c.map((_, i) => (i === 20 ? 30 : i === 40 ? 40 : 45));
  check(on(S.crDivergence(c, ind, "L", 50)).join(",") === "45", "a lower low with a higher indicator, known five bars after it");
  const flat = c.map((_, i) => (i === 20 ? 40 : i === 40 ? 30 : 45));
  check(on(S.crDivergence(c, flat, "L", 50)).length === 0, "…and none when the indicator agrees with the price");
}

if (failed) {
  console.error(`\n${failed} companion check(s) failed`);
  process.exit(1);
}
console.log("\nAll companion checks passed");
