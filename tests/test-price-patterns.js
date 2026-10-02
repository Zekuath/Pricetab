/* The chart patterns (`src/price-patterns.js`): head and shoulders, its
 * inverse, double tops and bottoms, found by rule on swing points and
 * followed to their measured target or their invalidation.
 *
 * Every case is a drawn price path whose answer was worked out by hand
 * before the function ran — the same four paths the preregistered study was
 * checked on (`docs/internal/research/patterns-prereg.md`).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "src");
const sandbox = { console, msg: (key, english) => english };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(SRC, "price-patterns.js"), "utf8") +
    "\nthis.detectPricePatterns = detectPricePatterns;" +
    "\nthis.pricePatternRecord = pricePatternRecord;" +
    "\nthis.PRICE_PATTERNS = PRICE_PATTERNS;",
  sandbox,
  { filename: "price-patterns.js" },
);
const { detectPricePatterns, pricePatternRecord, PRICE_PATTERNS } = sandbox;
const plain = (v) => JSON.parse(JSON.stringify(v));

let failed = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failed++;
    console.error(`  ✘ ${label}${detail !== undefined ? " — " + detail : ""}`);
  }
};

/* A price path through straight-line knots, one bar a day, each bar's high
   and low half a unit either side of its close. */
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
const HS = [[0, 95], [20, 100], [30, 90], [40, 110], [50, 90], [60, 101], [80, 70], [120, 60]];
const DT = [[0, 90], [20, 100], [30, 94], [40, 100.3], [60, 80], [100, 75]];
const r2 = (v) => Math.round(v * 100) / 100;

console.log("\nChart patterns");

check(PRICE_PATTERNS.map((p) => p.id).join(",") === "hs,ihs,dtop,dbot",
  "four patterns, each with the claim it is said to support",
  PRICE_PATTERNS.map((p) => `${p.id}:${p.claim}`).join(" | "));

{
  const e = plain(detectPricePatterns(path2(HS)));
  const hs = e.find((x) => x.kind === "hs");
  /* Shoulders 100.5 and 101.5 (within 3% of the 110.5 head), neckline
     through the two 89.5 troughs. P3 at bar 60 is known at bar 65; the first
     close below the neckline from there is bar 68, at 88.6. The head stands
     21 above the neckline, so the target is 67.6; the invalidation is the
     right shoulder, 101.5. */
  check(hs && hs.at === 1600000000 + 68 * 86400 && r2(hs.breakout) === 88.6,
    "a drawn head and shoulders breaks at the first close below the neckline once the right shoulder is known",
    JSON.stringify(hs && { at: (hs.at - 1600000000) / 86400, breakout: hs.breakout }));
  check(hs && r2(hs.target) === 67.6 && hs.stop === 101.5,
    "…its target is the head's height below the neckline, measured from the breakout, and its invalidation the right shoulder",
    JSON.stringify(hs && { target: hs.target, stop: hs.stop }));
  check(hs && hs.out === "target" && hs.points.length === 5 && hs.bear === true,
    "…and the path that follows reaches the target first", JSON.stringify(hs && { out: hs.out, n: hs.points.length }));
  check(!e.some((x) => x.kind === "ihs" || x.kind === "dbot"),
    "…with no bullish pattern read into a falling path", e.map((x) => x.kind).join(","));
}

{
  const e = plain(detectPricePatterns(path2(HS, true)));
  const ihs = e.find((x) => x.kind === "ihs");
  check(ihs && ihs.at === 1600000000 + 68 * 86400 && r2(ihs.target) === 132.4 && ihs.stop === 98.5 && ihs.out === "target",
    "the mirror image is an inverse head and shoulders, with the mirrored target and invalidation",
    JSON.stringify(ihs && { at: (ihs.at - 1600000000) / 86400, target: ihs.target, stop: ihs.stop, out: ihs.out }));
}

{
  const e = plain(detectPricePatterns(path2(DT)));
  const dt = e.find((x) => x.kind === "dtop");
  /* Peaks 100.5 and 100.8 (within 0.5%), trough 93.5 (7% below): the first
     close under 93.5 once the second peak is known is bar 47, at
     100.3 − 20.3 × 7/20 = 93.195, and the target 7.3 below that. */
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  check(dt && dt.at === 1600000000 + 47 * 86400 && near(dt.breakout, 93.195) && near(dt.target, 85.895) && dt.stop === 100.8,
    "a drawn double top breaks under the trough between its peaks, target the peak-to-trough depth below",
    JSON.stringify(dt && { at: (dt.at - 1600000000) / 86400, breakout: dt.breakout, target: dt.target, stop: dt.stop }));
  const db = plain(detectPricePatterns(path2(DT, true))).find((x) => x.kind === "dbot");
  check(db && near(db.target, 114.105) && db.stop === 99.2, "…and its mirror a double bottom", JSON.stringify(db && { target: db.target, stop: db.stop }));
}

{
  /* The same head and shoulders cut off the bar after its breakout: the
     pattern is there, and its outcome is not known yet. */
  const cut = path2(HS).slice(0, 69);
  const hs = plain(detectPricePatterns(cut)).find((x) => x.kind === "hs");
  check(hs && hs.out === "pending" && hs.resolvedAt === null,
    "a pattern whose walk the data has not finished is pending, not a loss", JSON.stringify(hs && hs.out));
  /* Causal: the same path cut at bar 64, before the right shoulder is known,
     shows nothing — even though the close is already under the neckline. */
  const early = path2(HS).slice(0, 65);
  check(!plain(detectPricePatterns(early)).some((x) => x.kind === "hs"),
    "a swing point is not used before it is known — no pattern before bar 65");
}

{
  /* Shoulders 6% apart are not shoulders. */
  const lop = [[0, 95], [20, 94], [30, 90], [40, 110], [50, 90], [60, 101], [80, 70], [120, 60]];
  check(!plain(detectPricePatterns(path2(lop))).some((x) => x.kind === "hs"),
    "shoulders further apart than 3% of the head make no head and shoulders");
  /* A second peak 2% above the first is not a double top. */
  const apart = [[0, 90], [20, 100], [30, 94], [40, 102], [60, 80], [100, 75]];
  check(!plain(detectPricePatterns(path2(apart))).some((x) => x.kind === "dtop"),
    "peaks further apart than 0.5% make no double top");
}

{
  const rec = plain(pricePatternRecord([
    { kind: "hs", out: "target" }, { kind: "hs", out: "stop" }, { kind: "hs", out: "open" },
    { kind: "hs", out: "pending" }, { kind: "dtop", out: "target" },
  ], "hs"));
  check(rec.found === 4 && rec.resolved === 2 && rec.targetFirst === 1,
    "the record counts what completed, what resolved, and what reached the target first", JSON.stringify(rec));
  check(plain(detectPricePatterns([])).length === 0 && plain(detectPricePatterns(null)).length === 0,
    "no candles, no patterns — and no throw");
}

if (failed) {
  console.error(`\n✘ ${failed} PRICE PATTERN CHECK(S) FAILED`);
  process.exit(1);
}
console.log("PRICE PATTERN TESTS OK");
