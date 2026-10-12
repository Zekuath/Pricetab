/* The second round of widget cards (src/widgets-data.js, 10 Oct 2026): the
 * options readings, the perpetual board's summary and the release calendar.
 * Each is pure, so each case is built with its answer known before it runs.
 * The functions are cut out of the file by their own declarations — the file
 * itself needs half the app's globals to load. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "widgets-data.js"), "utf8");
const cut = (from, to) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`cannot find ${from}`);
  return src.slice(a, b);
};
const sandbox = {
  // The calendar's two readers, stubbed with a known calendar
  macroKinds: () => ["cpi", "nfp", "fomc", "pce"],
  macroReleaseTimes: (k) => ({ cpi: [100, 500], nfp: [200, 600], fomc: [50, 900], pce: [] })[k],
};
vm.createContext(sandbox);
vm.runInContext(
  cut("const OPTION_BASES", "const fetchOptionsSummary") +
    cut("const perpBoardSummary", "/* **The dollar stablecoins**") +
    cut("const etfFlowsSummary", "const fetchEtfFlows") +
    cut("const nextMacroReleases", "const fetchFundingRate") +
    "\nthis.parseOptionSymbol = parseOptionSymbol; this.optionsSummary = optionsSummary;" +
    "\nthis.perpBoardSummary = perpBoardSummary; this.nextMacroReleases = nextMacroReleases; this.etfFlowsSummary = etfFlowsSummary;",
  sandbox,
  { filename: "widgets-data.js (cut)" },
);
const { parseOptionSymbol, optionsSummary, perpBoardSummary, nextMacroReleases, etfFlowsSummary } = sandbox;

let failed = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failed++;
    console.error(`  ✘ ${label}${detail !== undefined ? " — " + detail : ""}`);
  }
};

// The symbol
const p = parseOptionSymbol("BTC-30OCT26-72000-C-USDT");
check(p && p.base === "BTC" && p.strike === 72000 && p.type === "C" && p.expiry === Date.UTC(2026, 9, 30, 8),
  "an option's symbol reads as its base, expiry (08:00 UTC), strike and side", JSON.stringify(p));
check(parseOptionSymbol("BTCUSDT") === null && parseOptionSymbol("BTC-30XYZ26-1-C") === null, "…and anything else reads as nothing");

/* Max pain, worked by hand. One expiry, strikes 90/100/110; calls OI 10 at
   100, puts OI 10 at 100 and 5 at 110. Payout at K: calls 10·max(0,K−100),
   puts 10·max(0,100−K) + 5·max(0,110−K). K=90 → 100+100=200; K=100 → 0+50=50;
   K=110 → 100+0=100. The least is at 100. */
const now = 0;
const e1 = 3 * 86400e3;
const rows = [
  { expiry: e1, strike: 90, type: "C", oi: 0, iv: 0.5, under: 100 },
  { expiry: e1, strike: 100, type: "C", oi: 10, iv: 0.4, under: 100 },
  { expiry: e1, strike: 100, type: "P", oi: 10, iv: 0.6, under: 100 },
  { expiry: e1, strike: 110, type: "P", oi: 5, iv: 0.7, under: 100 },
];
const s = optionsSummary(rows, now);
check(s && s.maxPain === 100 && s.expiry === e1, "max pain is the strike paying holders least at the nearest expiry", JSON.stringify(s));
check(s && Math.abs(s.putCall - 1.5) < 1e-9, "…put/call is puts' open interest over calls'", s && s.putCall);
check(s && Math.abs(s.atmIv - 0.5) < 1e-9, "…and ATM IV the mean of the call and the put at the strike nearest the underlying", s && s.atmIv);
// An expiry closer than twelve hours is not the "nearest" one
const soon = 6 * 3600e3;
const s2 = optionsSummary(rows.concat([{ expiry: soon, strike: 200, type: "C", oi: 99, iv: 0.3, under: 100 }]), now);
check(s2 && s2.expiry === e1 && s2.maxPain === 100, "…an expiry under twelve hours away is passed over for max pain", JSON.stringify(s2 && { e: s2.expiry, m: s2.maxPain }));
check(optionsSummary([], now) === null, "…and no rows is no reading");

// The board
const b = perpBoardSummary({ rows: [
  { coin: "BTC", funding: 0.0001, oi: 500 },
  { coin: "ETH", funding: -0.0002, oi: 300 },
  { coin: "SOL", funding: 0.0003, oi: 100 },
  { coin: "XRP", funding: 0, oi: 50 },
] });
check(b && b.n === 4 && b.positive === 2 && b.negative === 1, "the funding board counts who pays each way, a zero in neither", JSON.stringify(b && [b.n, b.positive, b.negative]));
check(b && Math.abs(b.median - 0.00005) < 1e-12 && b.high.coin === "SOL" && b.low.coin === "ETH", "…its middle and both ends", JSON.stringify(b && [b.median, b.high.coin, b.low.coin]));
check(b && b.totalOi === 950 && b.top.map((r) => r.coin).join(",") === "BTC,ETH,SOL", "the open-interest leaders are the three largest, and the total is all of them", JSON.stringify(b && [b.totalOi, b.top.map((r) => r.coin)]));
check(perpBoardSummary(null) === null && perpBoardSummary({ rows: [] }) === null, "…and an empty board reads as nothing");

// The calendar
const next = nextMacroReleases(150, 3);
check(next.map((r) => `${r.kind}@${r.t}`).join(",") === "nfp@200,cpi@500,fomc@900", "the next releases are each kind's next one, soonest first, three of them", JSON.stringify(next));
check(nextMacroReleases(1000, 3).length === 0, "…and past the calendar's end there are none");

// The ETF flows: the last day, five and twenty trading days, the day's two ends
const days = Array.from({ length: 25 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, netFlowUsd: i < 20 ? 10 : 100, totalNetAssetsUsd: 1000 + i }));
days[24].perEtfUsd = { IBIT: 50, FBTC: -20, ARKB: 0, GBTC: 70 };
const shuffled = days.slice().reverse();
const e = etfFlowsSummary(shuffled);
check(e && e.date === "2026-09-25" && e.net === 100 && e.week === 500 && e.month === 650 && e.aum === 1024,
  "the ETF card reads the last trading day, and five and twenty of them, whatever order the record comes in", JSON.stringify(e));
check(e && e.topIn[0] === "GBTC" && e.topIn[1] === 70 && e.topOut[0] === "FBTC" && e.topOut[1] === -20,
  "…and the day's largest inflow and outflow, a fund with none left out", JSON.stringify(e && [e.topIn, e.topOut]));
check(etfFlowsSummary([]) === null && etfFlowsSummary(null) === null, "…and no record is no reading");

if (failed) {
  console.error(`\n✘ ${failed} WIDGET CHECK(S) FAILED`);
  process.exit(1);
}
console.log("\nWIDGET READINGS OK");
