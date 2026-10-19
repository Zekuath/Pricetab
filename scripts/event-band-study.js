#!/usr/bin/env node
/* The next 24 hours, aware of the US release calendar — the study
 * preregistered in docs/internal/research/event-band-prereg.md. Run once:
 *
 *   node scripts/event-band-study.js
 *
 * Reads the kept 6-hour bars (research/vol-bars/), asks nothing, writes
 * docs/internal/research/event-band-results-2026-10-19.json. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const BARS = path.join(ROOT, "docs/internal/research/vol-bars");
const OUT = path.join(ROOT, "docs/internal/research/event-band-results-2026-10-19.json");
const COINS = ["BTC", "ETH", "SOL", "XRP"];
const G = 21600;
const DAY = 86400e3;
const SPLIT = Date.parse("2024-01-01T00:00:00Z");
const MIN_BEFORE = 1000;
const MIN_CAL = 30;
const NW_LAG = 5;
const KINDS = ["CPI", "FOMC", "NFP"];

const cfg = fs.readFileSync(path.join(ROOT, "src/config.js"), "utf8");
const grab = (name) => {
  const m = cfg.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  return [...m[1].matchAll(/"([0-9T:Z-]+)"/g)].map((x) => Date.parse(x[1]));
};
const releases = { CPI: grab("CPI_RELEASES_UTC"), FOMC: grab("FOMC_RELEASES_UTC"), NFP: grab("NFP_RELEASES_UTC") };
const groupOf = (t0) => KINDS.find((k) => releases[k].some((t) => t > t0 && t <= t0 + DAY)) || "other";

const sandbox = { Math, Float64Array, Array, Number, isFinite, Infinity, NaN, Object };
vm.createContext(sandbox);
const O = vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "cell-odds.js"), "utf8") + "\n;({ oddsRegular, oddsPrepare, oddsColumn })", sandbox);
const inv = (cdf, p) => {
  let lo = -3;
  let hi = 3;
  for (let i = 0; i < 80 && hi - lo > 1e-7; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
const iscore = (l, u, y) => u - l + 10 * (Math.max(0, l - y) + Math.max(0, y - u));

// Every origin with mr's distribution, oldest first
const rows = [];
for (const coin of COINS) {
  const bars = JSON.parse(fs.readFileSync(path.join(BARS, `${coin}-${G}.json`), "utf8"));
  const s = O.oddsRegular(bars, G);
  const prep = O.oddsPrepare(s.close, G);
  for (let o = MIN_BEFORE; o + 4 < s.close.length; o++) {
    if ((s.time[o] + G * 1000) % DAY !== 0) continue;
    if (s.filled[o] || s.filled[o + 4]) continue;
    const col = O.oddsColumn(prep, DAY, { end: o, model: "mr", lookback: 3000 });
    if (!col) continue;
    const t = s.time[o] + G * 1000;
    const y = Math.log(s.close[o + 4] / s.close[o]);
    const q10 = inv(col.cdf, 0.1);
    const q50 = inv(col.cdf, 0.5);
    const q90 = inv(col.cdf, 0.9);
    rows.push({ coin, t, y, cdf: col.cdf, q10, q50, q90, pit: col.cdf(y), sig: (q90 - q10) / 2.5631, group: groupOf(t) });
  }
}
rows.sort((a, b) => a.t - b.t);

// Sequential: calibration from origins settled before this one (t' + DAY <= t)
const settled = { CPI: [], FOMC: [], NFP: [], other: [] }; // { score, z2 }
let next = 0;
const quant = (xs, p) => {
  const s = xs.slice().sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const a = Math.floor(i);
  const b = Math.ceil(i);
  return s[a] + (s[b] - s[a]) * (i - a);
};
const out = [];
for (const r of rows) {
  while (next < rows.length && rows[next].t + DAY <= r.t) {
    const x = rows[next];
    settled[x.group].push({ score: Math.abs(x.pit - 0.5), z2: x.sig > 0 ? (x.y / x.sig) ** 2 : NaN });
    next += 1;
  }
  // M1
  const cal = settled[r.group];
  let q = 0.4;
  if (cal.length >= MIN_CAL) q = Math.min(0.495, Math.max(0.3, quant(cal.map((c) => c.score), 0.8)));
  const l1 = inv(r.cdf, 0.5 - q);
  const u1 = inv(r.cdf, 0.5 + q);
  // M2
  let k = 1;
  if (r.group !== "other" && cal.length >= MIN_CAL && settled.other.length >= MIN_CAL) {
    const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
    const g = mean(cal.map((c) => c.z2).filter(Number.isFinite));
    const base = mean(settled.other.map((c) => c.z2).filter(Number.isFinite));
    if (g > 0 && base > 0) k = Math.max(1, Math.sqrt(g / base));
  }
  const l2 = r.q50 + k * (r.q10 - r.q50);
  const u2 = r.q50 + k * (r.q90 - r.q50);
  out.push({
    coin: r.coin, t: r.t, group: r.group, test: r.t >= SPLIT,
    M0: { in: r.y >= r.q10 && r.y <= r.q90, is: iscore(r.q10, r.q90, r.y) },
    M1: { in: r.y >= l1 && r.y <= u1, is: iscore(l1, u1, r.y), q },
    M2: { in: r.y >= l2 && r.y <= u2, is: iscore(l2, u2, r.y), k },
  });
}

const summ = (list, m) => ({ n: list.length, cov: list.filter((x) => x[m].in).length / list.length, is: list.reduce((s, x) => s + x[m].is, 0) / list.length });
const dm = (list, m) => {
  const byDay = new Map();
  for (const x of list) byDay.set(x.t, (byDay.get(x.t) || 0) + (x[m].is - x.M0.is));
  const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  const n = d.length;
  const mean = d.reduce((s, x) => s + x, 0) / n;
  let v = d.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  for (let k = 1; k <= NW_LAG; k++) {
    let g = 0;
    for (let i = k; i < n; i++) g += (d[i] - mean) * (d[i - k] - mean);
    v += 2 * (1 - k / (NW_LAG + 1)) * (g / n);
  }
  const t = mean / Math.sqrt(v / n);
  const erf = (z) => { const s = Math.sign(z); z = Math.abs(z); const q = 1 / (1 + 0.3275911 * z); return s * (1 - ((((1.061405429 * q - 1.453152027) * q + 1.421413741) * q - 0.284496736) * q + 0.254829592) * q * Math.exp(-z * z)); };
  return { days: n, t, p: 2 * (1 - 0.5 * (1 + erf(Math.abs(t) / Math.SQRT2))) };
};

const result = { ran: new Date().toISOString(), validation: {}, test: {}, rule: {} };
for (const part of ["validation", "test"]) {
  const list = out.filter((x) => x.test === (part === "test"));
  result[part] = {};
  for (const m of ["M0", "M1", "M2"]) {
    result[part][m] = {
      all: summ(list, m),
      release: summ(list.filter((x) => x.group !== "other"), m),
      other: summ(list.filter((x) => x.group === "other"), m),
      byGroup: Object.fromEntries([...KINDS, "other"].map((g) => [g, summ(list.filter((x) => x.group === g), m)])),
    };
  }
}
const test = out.filter((x) => x.test);
const rel = test.filter((x) => x.group !== "other");
for (const m of ["M1", "M2"]) {
  const r = result.test[m];
  const c1 = r.release.cov >= 0.77 && r.release.cov <= 0.83 && KINDS.every((g) => r.byGroup[g].cov >= 0.74);
  const c2 = r.other.cov >= 0.77 && r.other.cov <= 0.83;
  const d = dm(rel, m);
  const c3 = r.release.is < result.test.M0.release.is && d.p < 0.05;
  const c4 = r.all.is <= result.test.M0.all.is;
  result.rule[m] = { releaseCoverage: c1, otherCoverage: c2, releaseScore: c3, dm: d, overallScore: c4, ok: c1 && c2 && c3 && c4 };
}
const pass = ["M1", "M2"].filter((m) => result.rule[m].ok).sort((a, b) => result.test[a].all.is - result.test[b].all.is);
result.choice = pass[0] || "M0";
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
const pct = (x) => `${(x * 100).toFixed(1)}%`;
for (const part of ["validation", "test"]) {
  console.log(`— ${part}`);
  for (const m of ["M0", "M1", "M2"]) {
    const r = result[part][m];
    console.log(`${m} all ${pct(r.all.cov)} ${r.all.is.toFixed(4)} · release ${pct(r.release.cov)} ${r.release.is.toFixed(4)} (n ${r.release.n}) · other ${pct(r.other.cov)} ${r.other.is.toFixed(4)} · ` + KINDS.map((g) => `${g} ${pct(r.byGroup[g].cov)}`).join(" "));
  }
}
for (const m of ["M1", "M2"]) console.log(m, JSON.stringify(result.rule[m]));
console.log("choice:", result.choice);
