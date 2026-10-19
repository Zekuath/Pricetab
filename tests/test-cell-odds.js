// The chance of a square (src/cell-odds.js), on series whose answer is known:
// a Gaussian random walk, where P(band) has a closed form, and a fat-tailed
// one, where a Gaussian model is wrong in a known direction. What the board
// may print was measured on real candles (docs/internal/research/cell-odds-*).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const sandbox = { console, Math };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "cell-odds.js"), "utf8"), sandbox, { filename: "cell-odds.js" });
const O = vm.runInContext(
  "({ oddsGranularity, oddsPhi, oddsRegular, oddsPrepare, oddsColumn, oddsBand, oddsKde, oddsKdeAt, oddsMarkovState, ODDS_MIN_STRETCHES, oddsMrVar, oddsLongRunVar, CELL_ODDS_MODEL })",
  sandbox,
);
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} — ${a} vs ${b}`);

// A seeded generator and its normals
let seed = 7;
const uni = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return (seed + 0.5) / 2147483648;
};
const normal = () => Math.sqrt(-2 * Math.log(uni())) * Math.cos(2 * Math.PI * uni());

/* ── The pieces ── */
near(O.oddsPhi(0), 0.5, 1e-7, "Phi(0) is a half");
near(O.oddsPhi(1.959964), 0.975, 1e-6, "Phi(1.96) is 0.975");
near(O.oddsPhi(-3) + O.oddsPhi(3), 1, 1e-7, "Phi is symmetric");
ok(O.oddsGranularity(3 * 60e3) === 60, "a three-minute square reads one-minute bars");
ok(O.oddsGranularity(2 * 3600e3) === 900, "a two-hour square reads fifteen-minute bars");
ok(O.oddsGranularity(28 * 86400e3) === 86400, "a four-week square reads daily bars");
{
  const reg = O.oddsRegular([
    { time: 0, close: 10, high: 10, low: 10, volume: 1 },
    { time: 180000, close: 12, high: 12, low: 11, volume: 2 },
  ], 60);
  ok(JSON.stringify(Array.from(reg.close)) === "[10,10,10,12]", "a bar with no trade keeps the last close");
  ok(JSON.stringify(Array.from(reg.volume)) === "[1,0,0,2]", "…and no volume");
}
{
  // A kernel over standard normals is close to Phi
  const z = Array.from({ length: 4000 }, normal);
  const k = O.oddsKde(z, null);
  for (const u of [-2, -1, 0, 0.5, 1.5]) near(O.oddsKdeAt(k, u), O.oddsPhi(u), 0.03, `the kernel CDF at ${u} is the normal's`);
  ok(O.oddsKdeAt(k, -50) === 0 && O.oddsKdeAt(k, 50) === 1, "the CDF runs from 0 to 1");
  ok(O.oddsKde(z.slice(0, O.ODDS_MIN_STRETCHES - 1), null) === null, "too few points give no density");
}

/* ── A Gaussian walk: the chance of a band is known ── */
{
  const sd = 0.002; // per bar
  const closes = [100];
  for (let i = 1; i < 3000; i++) closes.push(closes[i - 1] * Math.exp(sd * normal()));
  const prep = O.oddsPrepare(closes, 60);
  ok(prep && prep.n === 3000, "a series of 3,000 bars is read");
  const sNow = closes[closes.length - 1];
  for (const bars of [1, 4, 16]) {
    const col = O.oddsColumn(prep, bars * 60e3);
    ok(col, `a ${bars}-bar horizon is answered`);
    const s = sd * Math.sqrt(bars);
    // The band one sd either side of the price holds about 68%
    const p = O.oddsBand(col, sNow, sNow * Math.exp(-s), sNow * Math.exp(s));
    near(p, 0.6827, 0.07, `±1 sd at ${bars} bars holds about 68%`);
    // A column's squares sum to one when the board is wide enough
    let sum = 0;
    const step = sNow * s * 0.5;
    for (let r = -60; r < 60; r++) sum += O.oddsBand(col, sNow, sNow + r * step, sNow + (r + 1) * step);
    near(sum, 1, 0.005, `a column's squares sum to one at ${bars} bars`);
  }
  // The look-back must hold 30 stretches of the horizon, or nothing is said
  ok(O.oddsColumn(prep, 101 * 60e3) === null, "a horizon of 101 bars in 3,000 is refused");
  ok(O.oddsColumn(prep, 99 * 60e3) !== null, "…and one of 99 is not");
  ok(O.oddsPrepare(closes.slice(0, 299), 60) === null, "under 300 bars is refused");
  // Later is wider: the same band holds less further out
  const near1 = O.oddsBand(O.oddsColumn(prep, 60e3), sNow, sNow * 0.999, sNow * 1.001);
  const near16 = O.oddsBand(O.oddsColumn(prep, 16 * 60e3), sNow, sNow * 0.999, sNow * 1.001);
  ok(near1 > near16, `the band around the price holds more one bar out than sixteen (${near1} > ${near16})`);
}

/* ── Calibration on a walk whose volatility changes: the EWMA follows it ── */
{
  const closes = [100];
  const truth = [];
  for (let i = 1; i < 6000; i++) {
    const sd = i < 3000 ? 0.001 : 0.004; // quiet, then four times louder
    truth.push(sd);
    closes.push(closes[i - 1] * Math.exp(sd * normal()));
  }
  const prep = O.oddsPrepare(closes, 60);
  let given = 0;
  let happened = 0;
  let n = 0;
  for (let o = 3200; o < 5980; o += 7) {
    const col = O.oddsColumn(prep, 4 * 60e3, { end: o });
    const sNow = closes[o];
    const sT = closes[o + 4];
    const step = sNow * 0.004;
    const row = Math.floor(sNow / step);
    for (let r = row - 3; r <= row + 3; r++) {
      const p = O.oddsBand(col, sNow, r * step, (r + 1) * step);
      if (p > 0.15 && p < 0.5) {
        given += p;
        happened += sT >= r * step && sT < (r + 1) * step ? 1 : 0;
        n += 1;
      }
    }
  }
  near(happened / n, given / n, 0.05, `squares given 15–50% came true about as often after the volatility changed (n=${n})`);
}

/* ── Fat tails: the kernel keeps them, the Gaussian baseline does not ── */
{
  const closes = [100];
  for (let i = 1; i < 3000; i++) {
    const z = uni() < 0.05 ? 6 * normal() : normal(); // 5% of bars six times larger
    closes.push(closes[i - 1] * Math.exp(0.001 * z));
  }
  const prep = O.oddsPrepare(closes, 60);
  const sNow = closes[closes.length - 1];
  const fhs = O.oddsColumn(prep, 60e3);
  const gauss = O.oddsColumn(prep, 60e3, { model: "gauss" });
  const far = (col) => 1 - O.oddsBand(col, sNow, sNow * Math.exp(-0.006), sNow * Math.exp(0.006));
  ok(far(fhs) > far(gauss), `a move past 6 sd is likelier under the coin's own tails (${far(fhs)} > ${far(gauss)})`);
}

/* ── The Markov candidate: the last square's direction, and its row ── */
{
  const closes = [100];
  for (let i = 1; i < 3000; i++) closes.push(closes[i - 1] * Math.exp(0.002 * normal()));
  const prep = O.oddsPrepare(closes, 60);
  const st = O.oddsMarkovState(prep, 5);
  const counts = { "-1": 0, "0": 0, "1": 0 };
  for (let t = 5; t < prep.n; t++) counts[String(st[t])] += 1;
  const total = counts["-1"] + counts["0"] + counts["1"];
  for (const k of ["-1", "0", "1"]) near(counts[k] / total, 1 / 3, 0.06, `the state ${k} holds about a third of the bars`);
  ok(Number.isNaN(st[4]) && Number.isFinite(st[5]), "a state is read only once a span of bars exists");
  const row = O.oddsColumn(prep, 5 * 60e3, { state: { values: st, now: st[prep.n - 1], discrete: true } });
  ok(row && row.n < O.oddsColumn(prep, 5 * 60e3).n, "the chain's row reads only the bars in the same state");
  // A state nobody has been in is refused, not guessed
  ok(O.oddsColumn(prep, 5 * 60e3, { state: { values: st, now: 7, discrete: true } }) === null, "an unseen state is refused");
}

// Round two (cell-odds-2-prereg.md): the models each board uses, and the
// mean-reverting variance's arithmetic
{
  ok(JSON.stringify(O.CELL_ODDS_MODEL) === JSON.stringify({ day: "pool", week: "pool", month: "mr" }), "1D and 1W pool, 1M reverts, the rest keep round one's model");
  const s2 = 4e-4;
  const lr = 1e-4;
  ok(Math.abs(O.oddsMrVar(s2, lr, 1) - s2) < 1e-15, "over one bar the variance is today's");
  ok(Math.abs(O.oddsMrVar(lr, lr, 37) - 37 * lr) < 1e-15, "at the long-run level it is the square-root-of-time rule");
  ok(O.oddsMrVar(s2, lr, 50) < 50 * s2 && O.oddsMrVar(s2, lr, 50) > 50 * lr, "a high variance now is between today's and the long run's over a horizon");
  ok(Math.abs(O.oddsMrVar(s2, lr, 50000) / 50000 - lr) < 1e-6, "…and far out, per bar, it is the long run's (the gap closes as 1/k)");
  const lrs = O.oddsLongRunVar(new Float64Array([0, 0.1, 0.1, 0.3]), 3000);
  ok(Math.abs(lrs[3] - (0.01 + 0 + 0.04) / 3) < 1e-12, "the long-run variance is the mean squared step so far");
  const closes = [100];
  for (let i = 1; i < 3000; i++) closes.push(closes[i - 1] * Math.exp(0.002 * normal()));
  const prep = O.oddsPrepare(closes, 60);
  const h = 30 * 60e3;
  const f = O.oddsColumn(prep, h);
  const raw = O.oddsColumn(prep, h, { model: "raw" });
  const pool = O.oddsColumn(prep, h, { model: "pool" });
  ok(Math.abs(pool.cdf(0.001) - 0.5 * (f.cdf(0.001) + raw.cdf(0.001))) < 1e-12, "pool is the two models averaged");
  const mr = O.oddsColumn(prep, h, { model: "mr" });
  ok(mr && mr.cdf(-1) < 0.001 && mr.cdf(1) > 0.999 && mr.cdf(0.002) > mr.cdf(-0.002), "mr is a distribution");
  ok(O.oddsColumn(prep, 1e9, { model: "mr" }) === null && O.oddsColumn(prep, 1e9, { model: "pool" }) === null, "both refuse what round one refuses");
}

/* ── The next 24 hours (tomorrow-prereg.md) ── */
{
  const T = vm.runInContext("({ tomorrowRange, oddsQuantile, TOMORROW_G, TOMORROW_MODEL, TOMORROW_MIN_BARS })", sandbox);
  ok(T.TOMORROW_G === 21600 && T.TOMORROW_MODEL === "mr" && T.TOMORROW_MIN_BARS === 1000, "the preregistered bar, model and floor");
  // A price walking with known steps: 6-hour normals of 1.2%, so a day is 2.4%
  const walk = (n) => {
    const out = [100];
    for (let i = 1; i < n; i++) out.push(out[i - 1] * Math.exp(0.012 * normal()));
    return out;
  };
  ok(T.tomorrowRange(walk(999)) === null, "below the study's thousand bars it says nothing");
  const closes = walk(3000);
  const r = T.tomorrowRange(closes);
  ok(r && r.q10 < r.q25 && r.q25 < r.q75 && r.q75 < r.q90 && r.bars === 3000, "four quantiles in order");
  // And it is the board's mr column, read at four points
  const col = O.oddsColumn(O.oddsPrepare(closes, 21600), 24 * 3600e3, { model: "mr" });
  near(r.q10, T.oddsQuantile(col.cdf, 0.1), 1e-9, "the range is the mr column's own quantile");
  near(col.cdf(r.q90), 0.9, 1e-4, "…and the CDF reads 0.9 at q90");
  /* Calibration is not asserted here: it is a claim about real prices,
     and the study made it on them (80.1% on 3,945 days). On this thin-tailed
     walk the kernel over-covers — measured 8 Oct 2026, wider than a normal
     day's by about a fifth — which is the safe side and is written down
     here so nobody "fixes" it against a Gaussian. */
}

/* ── The shadow record of the next 24 hours (event-band-prereg.md) ── */
{
  const S = vm.runInContext("({ eventBandRecord, eventBandSettle, oddsColumn, oddsPrepare, oddsQuantile })", sandbox);
  const G = 21600e3;
  const DAY = 86400e3;
  const closes = [100];
  for (let i = 1; i < 1600; i++) closes.push(closes[i - 1] * Math.exp(0.012 * normal()));
  // Bars start on a day boundary, so bar i closes at t0 + (i + 1) × 6h
  const t0 = Date.UTC(2026, 0, 1);
  const series = { coin: "BTC", currency: "USD", g: 21600, t0, closes, missing: [] };
  const lastClose = t0 + closes.length * G;
  // "Now" is 3 hours into the day whose 00:00 bar closes inside the series
  const origin = Math.floor((lastClose - 2 * G) / DAY) * DAY;
  const now = origin + 3 * 3600e3;
  const rec = S.eventBandRecord(series, now, (t) => (t === origin ? "CPI" : "other"));
  ok(rec && rec.t === origin && rec.group === "CPI" && rec.y === null, "today's row is written while its 24 hours run, with its group");
  const o = Math.round((origin - t0) / G) - 1;
  const col = S.oddsColumn(S.oddsPrepare(closes.slice(0, o + 1), 21600), DAY, { model: "mr" });
  near(rec.q10, S.oddsQuantile(col.cdf, 0.1), 1e-12, "…from the bars up to the origin only, as the study read them");
  ok(S.eventBandRecord(series, origin + DAY + 1, () => "other") === null || S.eventBandRecord(series, origin + DAY + 1, () => "other").t !== origin,
    "…and never written for a day whose 24 hours are over");
  ok(S.eventBandRecord({ ...series, missing: [o] }, now, () => "other") === null, "an untraded origin bar writes nothing");
  // Settled once the bar 24 hours on is in the series
  const longer = { ...series, closes: closes.concat([closes[closes.length - 1] * 1.01, closes[closes.length - 1] * 1.02, closes[closes.length - 1] * 1.03, closes[closes.length - 1] * 1.04, closes[closes.length - 1] * 1.05]) };
  const unsettled = [rec];
  const settled = S.eventBandSettle(unsettled, longer);
  ok(settled !== unsettled && Number.isFinite(settled[0].y), "its outcome arrives with the bar 24 hours on");
  near(settled[0].y, Math.log(longer.closes[o + 4] / longer.closes[o]), 1e-12, "…the log return over the next four bars");
  ok(S.eventBandSettle(settled, longer) === settled, "a settled row is not touched again");
  const gap = S.eventBandSettle([rec], { ...longer, missing: [o + 4] });
  ok(gap[0].skipped === true && S.eventBandSettle(gap, { ...longer, missing: [o + 4] }) === gap, "an untraded end bar is skipped once, not retried");
}

/* ── A column that holds a US release (board-release-prereg.md) ── */
{
  const E = vm.runInContext("({ oddsEventColumn, oddsQuantile, CELL_ODDS_EVENT, oddsColumn, oddsPrepare })", sandbox);
  const closes = [100];
  for (let i = 1; i < 3000; i++) closes.push(closes[i - 1] * Math.exp(0.004 * normal()));
  const col = E.oddsColumn(E.oddsPrepare(closes, 60), 3 * 60e3);
  ok(E.oddsEventColumn(col, "hour", null) === col && E.oddsEventColumn(col, "week", "CPI") === col, "no release, or a range it was not measured on: the same column");
  ok(E.oddsEventColumn(col, "day", "NFP") === col, "a factor of 1 (NFP on 1D) changes nothing");
  const w = E.oddsEventColumn(col, "hour", "CPI");
  const f = E.CELL_ODDS_EVENT.hour.CPI;
  const m = E.oddsQuantile(col.cdf, 0.5);
  // oddsQuantile bisects to about 1e-6, and the factor multiplies that
  near(E.oddsQuantile(w.cdf, 0.5), m, 1e-5, "the median stays where it was");
  near(E.oddsQuantile(w.cdf, 0.9) - m, f * (E.oddsQuantile(col.cdf, 0.9) - m), 2e-5, "the spread widens by the measured factor");
  ok(w.event && w.event.kind === "CPI" && w.event.held === E.CELL_ODDS_EVENT.hour.held, "and it carries what was measured, for the readout");
}

console.log(`✔ ${checks} square-odds checks`);
console.log("CELL ODDS TESTS OK");
