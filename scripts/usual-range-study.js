#!/usr/bin/env node
/* The usual range, held to its 80% — the study preregistered in
 * docs/internal/research/usual-range-conformal-prereg.md. Run once, after it
 * was written:
 *
 *   node scripts/usual-range-study.js
 *
 * Reads the pattern study's daily closes, asks nothing, and writes
 * docs/internal/research/usual-range-results-2026-10-18.json. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "docs/internal/research/patterns");
const OUT = path.join(ROOT, "docs/internal/research/usual-range-results-2026-10-18.json");
const COINS = ["BTC", "ETH", "SOL", "LTC"];
const HS = [1, 5, 20];
const FROM = Date.UTC(2022, 0, 1) / 1000;
const MIN_HISTORY = 365;
const ALPHA = 0.2;
const LAMBDA = 0.97;
const GAMMA = 0.005;

const quantile = (sorted, p) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const a = Math.floor(i);
  const b = Math.ceil(i);
  return sorted[a] + (sorted[b] - sorted[a]) * (i - a);
};
const median = (xs) => quantile(xs.slice().sort((a, b) => a - b), 0.5);
const intervalScore = (l, u, y) => u - l + (2 / ALPHA) * Math.max(0, l - y) + (2 / ALPHA) * Math.max(0, y - u);

const results = {};
for (const coin of COINS) {
  const c = JSON.parse(fs.readFileSync(path.join(DATA, `${coin}.json`), "utf8")).filter((d) => d.close > 0);
  const lr = c.map((d, i) => (i ? Math.log(d.close / c[i - 1].close) : 0));
  // EWMA variance known at each close (uses returns up to and including it)
  const v = new Array(c.length).fill(0);
  const seed = lr.slice(1, 31).reduce((s, x) => s + x * x, 0) / 30;
  v[0] = seed;
  for (let i = 1; i < c.length; i += 1) v[i] = LAMBDA * v[i - 1] + (1 - LAMBDA) * lr[i] * lr[i];
  results[coin] = {};
  for (const h of HS) {
    const R = (s) => Math.log(c[s + h].close / c[s].close);
    const sig = (s) => Math.sqrt(h * v[s]);
    const cell = { A: { n: 0, in: 0, score: 0, width: 0 }, B: { n: 0, in: 0, score: 0, width: 0 }, C: { n: 0, in: 0, score: 0, width: 0 } };
    let alpha = ALPHA;
    const pendingMiss = []; // ACI: [settleIndex, miss] for C's daily origins
    let k = 0; // counts evaluation origins, to take every h-th as non-overlapping
    for (let o = MIN_HISTORY; o + h < c.length; o += 1) {
      // ACI: apply the stretches that have settled by o
      for (let j = pendingMiss.length - 1; j >= 0; j -= 1) {
        if (pendingMiss[j][0] <= o) {
          alpha = Math.min(0.6, Math.max(0.01, alpha + GAMMA * (ALPHA - pendingMiss[j][1])));
          pendingMiss.splice(j, 1);
        }
      }
      if (c[o].t < FROM) continue;
      // Windows settled before o
      const raw = [];
      const z = [];
      for (let s = 0; s + h <= o; s += 1) {
        const r = R(s);
        raw.push(r);
        const sg = sig(s);
        if (sg > 0) z.push(r / sg);
      }
      const y = R(o);
      // A
      const medA = median(raw);
      const devA = raw.map((r) => r - medA).sort((a, b) => a - b);
      const lA = medA + quantile(devA, ALPHA / 2);
      const uA = medA + quantile(devA, 1 - ALPHA / 2);
      // B and C share the scores
      const medZ = median(z);
      const devZ = z.map((x) => x - medZ).sort((a, b) => a - b);
      const s0 = sig(o);
      const lB = (medZ + quantile(devZ, ALPHA / 2)) * s0;
      const uB = (medZ + quantile(devZ, 1 - ALPHA / 2)) * s0;
      const lC = (medZ + quantile(devZ, alpha / 2)) * s0;
      const uC = (medZ + quantile(devZ, 1 - alpha / 2)) * s0;
      // C learns from every daily origin once it settles
      pendingMiss.push([o + h, y < lC || y > uC ? 1 : 0]);
      // Scored on non-overlapping stretches
      if (k % h === 0) {
        for (const [m, l, u] of [["A", lA, uA], ["B", lB, uB], ["C", lC, uC]]) {
          const x = cell[m];
          x.n += 1;
          if (y >= l && y <= u) x.in += 1;
          x.score += intervalScore(l, u, y);
          x.width += u - l;
        }
      }
      k += 1;
    }
    results[coin][h] = {};
    for (const m of ["A", "B", "C"]) {
      const x = cell[m];
      results[coin][h][m] = { n: x.n, coverage: x.in / x.n, score: x.score / x.n, width: x.width / x.n };
    }
  }
}

// The preregistered rule
const summary = {};
for (const m of ["A", "B", "C"]) {
  let within = 0;
  let score = 0;
  let cells = 0;
  for (const coin of COINS) for (const h of HS) {
    const r = results[coin][h][m];
    if (Math.abs(r.coverage - 0.8) <= 0.05) within += 1;
    score += r.score;
    cells += 1;
  }
  summary[m] = { within, cells, meanScore: score / cells, qualifies: within >= 10 };
}
const qualifying = Object.entries(summary).filter(([, s]) => s.qualifies).sort((a, b) => a[1].meanScore - b[1].meanScore);
const choice = qualifying.length ? qualifying[0][0] : null;
fs.writeFileSync(OUT, JSON.stringify({ ran: new Date().toISOString(), summary, choice, results }, null, 2) + "\n");
const pct = (x) => `${(x * 100).toFixed(1)}%`;
for (const coin of COINS) for (const h of HS) {
  const r = results[coin][h];
  console.log(`${coin} h${String(h).padEnd(2)} · A ${pct(r.A.coverage)} ${r.A.score.toFixed(4)} · B ${pct(r.B.coverage)} ${r.B.score.toFixed(4)} · C ${pct(r.C.coverage)} ${r.C.score.toFixed(4)} · n ${r.A.n}`);
}
for (const [m, s] of Object.entries(summary)) console.log(`${m}: within 5 pts in ${s.within}/12 · mean interval score ${s.meanScore.toFixed(4)} · qualifies ${s.qualifies}`);
console.log(`choice: ${choice || "none — the cone stays"}`);
