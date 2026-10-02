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
  "({ oddsGranularity, oddsPhi, oddsRegular, oddsPrepare, oddsColumn, oddsBand, oddsKde, oddsKdeAt, oddsMarkovState, ODDS_MIN_STRETCHES })",
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

console.log(`✔ ${checks} square-odds checks`);
console.log("CELL ODDS TESTS OK");
