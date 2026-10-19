#!/usr/bin/env node
/* How often a price reaches a target — the study preregistered in
 * docs/internal/research/target-touch-prereg.md. Run once, after it was
 * written:
 *
 *   node scripts/target-touch-study.js
 *
 * Reads the pattern study's daily OHLC (research/patterns/*.json), asks
 * nothing, and writes docs/internal/research/target-touch-results-2026-10-18.json. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "docs/internal/research/patterns");
const OUT = path.join(ROOT, "docs/internal/research/target-touch-results-2026-10-18.json");
const COINS = ["BTC", "ETH", "SOL", "LTC"];
const XS = [0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2];
const DIRS = ["up", "down"];
const HS = [1, 7];
const FROM = Date.UTC(2024, 0, 1) / 1000;
const MIN_DAYS = 120; // DAILY_MOVE_MIN_DAYS
const LAG = 7;

const cells = [];
for (const h of HS) for (const x of XS) for (const dir of DIRS) cells.push({ h, x, dir });

// What one window starting at close i says, for every cell
const windowFacts = (c, i) =>
  cells.map(({ h, x, dir }) => {
    const base = c[i].close;
    const end = c[i + h].close;
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = i + 1; k <= i + h; k += 1) {
      hi = Math.max(hi, c[k].high);
      lo = Math.min(lo, c[k].low);
    }
    const a = Math.abs(Math.log(end / base)) >= Math.log(1 + x) - 1e-12;
    const touch = dir === "up" ? hi >= base * (1 + x) : lo <= base * (1 - x);
    const beyond = dir === "up" ? end >= base * (1 + x) : end <= base * (1 - x);
    return { a, touch, beyond };
  });

const brierBins = () => Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
const perCoin = {};
const pooledLoss = { A: [], B: [], C: [] };
const calib = { A: brierBins(), B: brierBins(), C: brierBins() };

for (const coin of COINS) {
  const c = JSON.parse(fs.readFileSync(path.join(DATA, `${coin}.json`), "utf8")).filter((d) => d.close > 0 && d.high > 0 && d.low > 0);
  const facts = c.map((_, i) => (i + 7 < c.length ? windowFacts(c, i) : null));
  // Running counts of windows whose outcome is known before close d
  const count = cells.map(() => ({ n: 0, a: 0, touch: 0, beyond: 0 }));
  const sums = { A: 0, B: 0, C: 0, n: 0 };
  const series = { A: [], B: [], C: [] };
  for (let d = 0; d + 7 < c.length; d += 1) {
    // Windows complete by d: start i with i + h <= d
    cells.forEach((cell, j) => {
      const i = d - cell.h;
      if (i >= 0 && facts[i]) {
        const f = facts[i][j];
        count[j].n += 1;
        if (f.a) count[j].a += 1;
        if (f.touch) count[j].touch += 1;
        if (f.beyond) count[j].beyond += 1;
      }
    });
    if (c[d].t < FROM || count[0].n < MIN_DAYS) continue;
    let lA = 0;
    let lB = 0;
    let lC = 0;
    cells.forEach((cell, j) => {
      const k = count[j];
      if (!k.n) return;
      const y = facts[d][j].touch ? 1 : 0;
      const pA = k.a / k.n;
      const pB = k.touch / k.n;
      const pC = Math.min(1, (2 * k.beyond) / k.n);
      lA += (pA - y) ** 2;
      lB += (pB - y) ** 2;
      lC += (pC - y) ** 2;
      for (const [m, p] of [["A", pA], ["B", pB], ["C", pC]]) {
        const bin = calib[m][Math.min(9, Math.floor(p * 10))];
        bin.n += 1;
        bin.p += p;
        bin.y += y;
      }
    });
    series.A.push(lA);
    series.B.push(lB);
    series.C.push(lC);
    sums.A += lA;
    sums.B += lB;
    sums.C += lC;
    sums.n += cells.length;
  }
  perCoin[coin] = { closes: series.A.length, brier: { A: sums.A / sums.n, B: sums.B / sums.n, C: sums.C / sums.n } };
  for (const m of ["A", "B", "C"]) pooledLoss[m].push(...series[m]);
}

// Diebold–Mariano on B − A per close, Newey–West at lag 7
const dm = (a, b) => {
  const d = b.map((v, i) => v - a[i]);
  const n = d.length;
  const mean = d.reduce((s, v) => s + v, 0) / n;
  let v = d.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  for (let k = 1; k <= LAG; k += 1) {
    let g = 0;
    for (let i = k; i < n; i += 1) g += (d[i] - mean) * (d[i - k] - mean);
    v += 2 * (1 - k / (LAG + 1)) * (g / n);
  }
  const t = mean / Math.sqrt(v / n);
  // Two-sided normal p
  const erf = (z) => {
    const s = Math.sign(z);
    z = Math.abs(z);
    const q = 1 / (1 + 0.3275911 * z);
    const y = 1 - ((((1.061405429 * q - 1.453152027) * q + 1.421413741) * q - 0.284496736) * q + 0.254829592) * q * Math.exp(-z * z);
    return s * y;
  };
  const p = 2 * (1 - 0.5 * (1 + erf(Math.abs(t) / Math.SQRT2)));
  return { n, meanDiff: mean / cells.length, t, p };
};

const pooled = {
  A: pooledLoss.A.reduce((s, v) => s + v, 0) / (pooledLoss.A.length * cells.length),
  B: pooledLoss.B.reduce((s, v) => s + v, 0) / (pooledLoss.B.length * cells.length),
  C: pooledLoss.C.reduce((s, v) => s + v, 0) / (pooledLoss.C.length * cells.length),
};
const test = dm(pooledLoss.A, pooledLoss.B);
const coinsBetter = COINS.filter((k) => perCoin[k].brier.B < perCoin[k].brier.A).length;
const adopt = pooled.B < pooled.A && test.p < 0.05 && coinsBetter >= 3;
const calibration = {};
for (const m of ["A", "B", "C"]) calibration[m] = calib[m].map((b) => (b.n ? { n: b.n, said: b.p / b.n, happened: b.y / b.n } : { n: 0 }));
const result = { ran: new Date().toISOString(), cells: cells.length, pooled, test, coinsBetter, adopt, perCoin, calibration };
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
const f = (v) => v.toFixed(4);
console.log(`Brier pooled · A ${f(pooled.A)} · B ${f(pooled.B)} · C ${f(pooled.C)}`);
for (const k of COINS) console.log(`${k} closes ${perCoin[k].closes} · A ${f(perCoin[k].brier.A)} B ${f(perCoin[k].brier.B)} C ${f(perCoin[k].brier.C)}`);
console.log(`DM B−A: t ${test.t.toFixed(2)} p ${test.p.toExponential(2)} · B better on ${coinsBetter} of 4 · adopt ${adopt}`);
for (const m of ["A", "B", "C"]) console.log(m, calibration[m].filter((b) => b.n).map((b) => `${(b.said * 100).toFixed(0)}→${(b.happened * 100).toFixed(0)}(${b.n})`).join(" "));
