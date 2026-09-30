/* The candlestick patterns (`src/candle-patterns.js`): shapes named from a
 * bar's body and its wicks, then counted like any other state.
 *
 * Every case here is built so the answer is known before the function runs.
 * A pattern found in random data would pass or fail by luck, and the whole
 * point of this file is that a definition means exactly one thing.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "src");
const sandbox = {
  console,
  // The catalogue is built at load, so the panel's own translator has to be
  // there. English back, which is what every assertion below reads.
  msg: (key, english) => english,
};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(SRC, "candle-patterns.js"), "utf8") +
    "\nthis.CANDLE_PATTERNS = CANDLE_PATTERNS;" +
    "\nthis.candlePatternHits = candlePatternHits;" +
    "\nthis.candlePatternsNow = candlePatternsNow;" +
    "\nthis.CANDLE_PATTERN_HORIZON = CANDLE_PATTERN_HORIZON;",
  sandbox,
  { filename: "candle-patterns.js" },
);
const { CANDLE_PATTERNS, candlePatternHits, candlePatternsNow, CANDLE_PATTERN_HORIZON } =
  sandbox;

let failed = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failed++;
    console.error(`  ✘ ${label}${detail !== undefined ? " — " + detail : ""}`);
  }
};

const by = (id) => CANDLE_PATTERNS.find((p) => p.id === id);
const c = (open, high, low, close) => ({ t: 0, open, high, low, close });
// A quiet run to sit in front of a shape, so the lookbacks have something
const calm = (n) => Array.from({ length: n }, () => c(100, 101, 99, 100.2));
// Does this pattern fire on the last candle of `cs`?
const fires = (id, cs) => Boolean(by(id).test(cs, cs.length - 1));

console.log("the catalogue");
check(CANDLE_PATTERNS.length >= 12, "there are patterns to look for", CANDLE_PATTERNS.length);
check(
  new Set(CANDLE_PATTERNS.map((p) => p.id)).size === CANDLE_PATTERNS.length,
  "every pattern has its own id",
);
check(
  CANDLE_PATTERNS.every((p) => p.title && p.claim && typeof p.test === "function"),
  "…and a name, the claim it is tested against, and a test",
);
/* The claim is reported speech, never this panel's own finding. Every one of
   them has to read as somebody else's sentence, or the row stops being a
   test of the folklore and becomes an endorsement of it. */
check(
  CANDLE_PATTERNS.every((p) => /said to/i.test(p.claim)),
  "…and the claim is attributed, never asserted",
  CANDLE_PATTERNS.filter((p) => !/said to/i.test(p.claim)).map((p) => p.id).join(","),
);

console.log("one shape, one meaning");
// Engulfing: a down day, then an up day whose body covers it on both sides
{
  const cs = [...calm(6), c(100, 101, 95, 96), c(95, 106, 94, 105)];
  check(fires("bullish-engulfing", cs), "a body that covers the day before it is bullish engulfing");
  check(!fires("bearish-engulfing", cs), "…and not the bearish one");
  // One pixel short on the open and it is not engulfing any more
  const short = [...calm(6), c(100, 101, 95, 96), c(97, 106, 96, 105)];
  check(!fires("bullish-engulfing", short), "…a body that leaves the open uncovered is not");
  const bear = [...calm(6), c(96, 101, 95, 100), c(101, 102, 94, 95)];
  check(fires("bearish-engulfing", bear), "the mirror case is bearish engulfing");
  check(!fires("bullish-engulfing", bear), "…and not the bullish one");
}
// Momentum: a body twice the average of the five before it
{
  const cs = [...calm(6), c(100, 112, 99, 111)];
  check(fires("momentum-up", cs), "a body twice the recent average is a momentum candle");
  check(!fires("momentum-down", cs), "…in the direction it actually closed");
  const small = [...calm(6), c(100, 101, 99, 100.3)];
  check(!fires("momentum-up", small), "…and an ordinary body is not one");
  // Nothing behind it is not a small average, it is no answer at all
  check(!by("momentum-up").test([c(100, 112, 99, 111)], 0), "with nothing behind it, no momentum call");
}
// The doji family
{
  const doji = [...calm(3), c(100, 104, 96, 100.1)];
  check(fires("doji", doji), "a body inside a twentieth of the range is a doji");
  check(!fires("dragonfly", doji) && !fires("gravestone", doji), "…and a plain one is neither variant");
  const dragon = [...calm(3), c(100, 100.2, 92, 100.1)];
  check(fires("dragonfly", dragon) && fires("doji", dragon), "all the range below the body is a dragonfly");
  check(!fires("gravestone", dragon), "…never both at once");
  const grave = [...calm(3), c(100, 108, 99.9, 100.1)];
  check(fires("gravestone", grave), "all the range above it is a gravestone");
  check(!fires("dragonfly", grave), "…and only that");
  // A flat bar has no range to take a fraction of, and must not divide by it
  check(!fires("doji", [...calm(3), c(100, 100, 100, 100)]), "a bar with no range is not a doji");
}
// Hammer and shooting star are the same rule, one each way up
{
  const hammer = [...calm(3), c(100, 101, 92, 101)];
  check(fires("hammer", hammer), "a long wick under a small body is a hammer");
  check(!fires("shooting-star", hammer), "…and not a shooting star");
  const star = [...calm(3), c(100, 109, 99.5, 101)];
  check(fires("shooting-star", star), "the same shape upside down is a shooting star");
  check(!fires("hammer", star), "…and not a hammer");
}
// Tweezers: two candles that stopped at the same level
{
  const bottom = [...calm(3), c(100, 101, 95, 96), c(96, 102, 95.02, 101)];
  check(fires("tweezer-bottom", bottom), "two lows within a tick of each other is a tweezer bottom");
  const apart = [...calm(3), c(100, 101, 95, 96), c(96, 102, 90, 101)];
  check(!fires("tweezer-bottom", apart), "…and two lows a long way apart is not");
  const top = [...calm(3), c(96, 105, 95, 100), c(100, 105.02, 94, 95)];
  check(fires("tweezer-top", top), "the mirror is a tweezer top");
}
// A run of wicks the same way, and it must be a run
{
  const wicky = c(100, 101, 94, 100.5); // most of the range below the body
  const run = [...calm(3), wicky, wicky, wicky];
  check(fires("lower-wicks", run), "three long lower wicks in a row count");
  const broken = [...calm(3), wicky, c(100, 101, 99.5, 100.5), wicky];
  check(!fires("lower-wicks", broken), "…and a run with an ordinary bar in it does not");
  check(!by("lower-wicks").test([wicky, wicky], 1), "…nor a run too short to be one");
}
// Marubozu: a body and essentially nothing else
{
  const up = [...calm(3), c(100, 110.1, 99.95, 110)];
  check(fires("marubozu-up", up), "a body with no wicks is a marubozu");
  check(!fires("marubozu-down", up), "…in the direction it closed");
  check(!fires("marubozu-up", [...calm(3), c(100, 115, 99.95, 110)]), "…and a real upper wick disqualifies it");
}

console.log("counting");
{
  /* A pattern that holds for three days running is one occurrence, not
     three — the episode rule every count in this app follows. Checked on the
     hits array, which is what `baseRateFor` walks. */
  const shape = c(100, 101, 92, 101); // a hammer
  const cs = [...calm(5), shape, shape, shape, ...calm(3), shape];
  const hits = candlePatternHits(cs, by("hammer").test);
  check(hits.length === cs.length, "one answer per candle", `${hits.length} of ${cs.length}`);
  const runs = hits.reduce((n, v, i) => n + (v && !hits[i - 1] ? 1 : 0), 0);
  check(runs === 2, "a run of the same shape is one episode", `${runs} episodes from ${hits.filter(Boolean).length} days`);
}
{
  // Bad input is answered, never thrown on: the series comes off the network
  check(candlePatternHits(null, by("doji").test).length === 0, "no candles, no answers");
  check(candlePatternHits([c(1, 2, 0.5, 1.5)], null).length === 0, "no test, no answers");
  const broken = [c(100, 101, 99, 100), { open: "x", high: null, low: 1, close: 2 }];
  const out = candlePatternHits(broken, by("doji").test);
  check(out.length === 2 && out.every((v) => v === false), "a half-written candle makes every answer false, not a throw", JSON.stringify(out));
  const thrower = () => {
    throw new Error("boom");
  };
  check(
    candlePatternHits([c(1, 2, 0.5, 1.5)], thrower).every((v) => v === false),
    "a test that throws is a false, not a broken panel",
  );
}
{
  // What the newest candle carries is what the panel leads with
  const cs = [...calm(6), c(100, 101, 95, 96), c(95, 106, 94, 105)];
  const now = candlePatternsNow(cs);
  check(now.length === CANDLE_PATTERNS.length, "every pattern is reported on", now.length);
  const liveIds = now.filter((r) => r.live).map((r) => r.pattern.id);
  check(liveIds.includes("bullish-engulfing"), "…and today's shape is marked live", liveIds.join(","));
  check(!liveIds.includes("gravestone"), "…while a shape it is not stays quiet");
  check(now.every((r) => r.hits.length === cs.length), "…each with a full history beside it");
  check(candlePatternsNow([]).length === 0 && candlePatternsNow(null).length === 0, "nothing to read, nothing reported");
}
check(
  Number.isInteger(CANDLE_PATTERN_HORIZON) && CANDLE_PATTERN_HORIZON > 0,
  "the horizon is a whole number of days",
  CANDLE_PATTERN_HORIZON,
);

if (failed) {
  console.error(`\n✘ ${failed} CANDLE PATTERN CHECK(S) FAILED`);
  process.exit(1);
}
console.log("CANDLE PATTERN TESTS OK");
