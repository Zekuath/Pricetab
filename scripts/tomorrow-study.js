#!/usr/bin/env node
/* Tomorrow's range — the study (docs/internal/research/tomorrow-prereg.md).
 *
 *   node scripts/tomorrow-study.js
 *   ODDS_CACHE=/path node scripts/tomorrow-study.js
 *
 * Runs `src/cell-odds.js` unchanged on the 6-hour candles the round-two
 * square-odds study cached (3 Oct 2026), one origin a day at 00:00 UTC, and
 * writes the result beside the preregistration. Local tooling, never shipped.
 * Asks nothing of the network: it reads the cache or stops. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const CACHE = process.env.ODDS_CACHE || path.join(os.tmpdir(), "pricetab-cell-odds");
const OUT = path.join(ROOT, "docs", "internal", "research");

const sandbox = { Math, Float64Array, Array, Number, isFinite, Infinity, NaN, Object };
vm.createContext(sandbox);
const O = vm.runInContext(
  fs.readFileSync(path.join(ROOT, "src", "cell-odds.js"), "utf8") +
    "\n;({ oddsRegular, oddsPrepare, oddsColumn })",
  sandbox,
);

const G = 21600;
const H = 24 * 3600e3;
const COINS = ["BTC", "ETH", "SOL", "XRP"];
const MODELS = ["fhs", "pool", "mr"];
const SPLIT = Date.parse("2024-01-01T00:00:00Z");
const MIN_BEFORE = 1000;
const LOOKBACK = 3000;
const BOOT = 2000;
const BLOCK = 20;
const SEED = 20261008;

const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// The x at which the CDF reaches p, by bisection in log-return space
const quantile = (cdf, p) => {
  let lo = -3;
  let hi = 3;
  for (let i = 0; i < 80 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

// Gneiting–Raftery interval score for a central (1 - a) interval
const intervalScore = (l, u, y, a) => u - l + (2 / a) * (Math.max(0, l - y) + Math.max(0, y - u));

const rows = {};
for (const coin of COINS) {
  const file = path.join(CACHE, `${coin}-${G}-2920d.json`);
  if (!fs.existsSync(file)) {
    console.error(`missing ${file} — run scripts/cell-odds-study-2.js first`);
    process.exit(1);
  }
  rows[coin] = JSON.parse(fs.readFileSync(file, "utf8"));
}

const forecasts = []; // { coin, t, model, q10, q25, q75, q90, pUp, y }
for (const coin of COINS) {
  const series = O.oddsRegular(rows[coin], G);
  const prep = O.oddsPrepare(series.close, G);
  for (let o = MIN_BEFORE; o + 4 < series.close.length; o++) {
    // A bar starting 18:00 UTC closes at 00:00 — one origin a day
    if ((series.time[o] + G * 1000) % H !== 0) continue;
    // A filled (no-trade) bar at either end is not a price anybody saw
    if (series.filled[o] || series.filled[o + 4]) continue;
    const y = Math.log(series.close[o + 4] / series.close[o]);
    for (const model of MODELS) {
      const col = O.oddsColumn(prep, H, { end: o, model, lookback: LOOKBACK });
      if (!col) continue;
      forecasts.push({
        coin,
        t: series.time[o] + G * 1000,
        model,
        q10: quantile(col.cdf, 0.1),
        q25: quantile(col.cdf, 0.25),
        q75: quantile(col.cdf, 0.75),
        q90: quantile(col.cdf, 0.9),
        pUp: 1 - col.cdf(0),
        y,
      });
    }
  }
}

const summarise = (list) => {
  const n = list.length;
  if (!n) return null;
  const in80 = list.filter((f) => f.y >= f.q10 && f.y <= f.q90).length;
  const in50 = list.filter((f) => f.y >= f.q25 && f.y <= f.q75).length;
  const is80 = list.reduce((s, f) => s + intervalScore(f.q10, f.q90, f.y, 0.2), 0) / n;
  const brier = list.reduce((s, f) => s + (f.pUp - (f.y > 0 ? 1 : 0)) ** 2, 0) / n;
  const brier0 = list.reduce((s, f) => s + (0.5 - (f.y > 0 ? 1 : 0)) ** 2, 0) / n;
  const width80 = list.reduce((s, f) => s + (Math.exp(f.q90) - Math.exp(f.q10)), 0) / n;
  return { n, cov80: in80 / n, cov50: in50 / n, is80, brier, brier0, skill: brier0 - brier, width80, upShare: list.filter((f) => f.y > 0).length / n };
};

const part = (model, test, coin) =>
  forecasts.filter((f) => f.model === model && (test ? f.t >= SPLIT : f.t < SPLIT) && (!coin || f.coin === coin));

// Model choice, on validation only
const validation = {};
for (const m of MODELS) validation[m] = summarise(part(m, false));
const eligible = MODELS.filter((m) => validation[m] && validation[m].cov80 >= 0.77 && validation[m].cov80 <= 0.83);
const chosen = eligible.sort((a, b) => validation[a].is80 - validation[b].is80)[0] || null;

let test = null;
let perCoin = {};
let reliability = [];
let skillCi = null;
let rangeShips = false;
let directionShips = false;
if (chosen) {
  const list = part(chosen, true).sort((a, b) => a.t - b.t || a.coin.localeCompare(b.coin));
  test = summarise(list);
  for (const c of COINS) perCoin[c] = summarise(part(chosen, true, c));
  // Reliability of P(up)
  const edges = [0, 0.4, 0.45, 0.5, 0.55, 0.6, 1.0000001];
  reliability = edges.slice(1).map((hi, i) => {
    const inBin = list.filter((f) => f.pUp >= edges[i] && f.pUp < hi);
    return {
      bin: `${(edges[i] * 100).toFixed(0)}–${Math.min(100, hi * 100).toFixed(0)}%`,
      n: inBin.length,
      given: inBin.length ? inBin.reduce((s, f) => s + f.pUp, 0) / inBin.length : null,
      happened: inBin.length ? inBin.filter((f) => f.y > 0).length / inBin.length : null,
    };
  });
  // Block bootstrap of the Brier skill, blocks of BLOCK days across the pooled, time-ordered list
  const days = [...new Set(list.map((f) => f.t))].sort((a, b) => a - b);
  const byDay = new Map(days.map((d) => [d, list.filter((f) => f.t === d)]));
  const random = rng(SEED);
  const skills = [];
  for (let b = 0; b < BOOT; b++) {
    const draw = [];
    while (draw.length < days.length) {
      const s = Math.floor(random() * Math.max(1, days.length - BLOCK));
      for (let k = 0; k < BLOCK && draw.length < days.length; k++) draw.push(days[s + k]);
    }
    let d = 0;
    let d0 = 0;
    for (const day of draw) for (const f of byDay.get(day)) {
      d += (f.pUp - (f.y > 0 ? 1 : 0)) ** 2;
      d0 += (0.5 - (f.y > 0 ? 1 : 0)) ** 2;
    }
    skills.push((d0 - d) / list.length);
  }
  skills.sort((a, b) => a - b);
  skillCi = [skills[Math.floor(0.025 * BOOT)], skills[Math.floor(0.975 * BOOT)]];
  rangeShips =
    test.cov80 >= 0.77 && test.cov80 <= 0.83 && test.cov50 >= 0.46 && test.cov50 <= 0.54 &&
    COINS.every((c) => perCoin[c] && perCoin[c].cov80 >= 0.74 && perCoin[c].cov80 <= 0.86);
  directionShips = test.skill > 0 && skillCi[0] > 0;
}

const pct = (x, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const date = new Date().toISOString().slice(0, 10);
const md = [
  `# Tomorrow's range — results (${date})`,
  "",
  "Run of `scripts/tomorrow-study.js` against `tomorrow-prereg.md`. 6-hour Coinbase Exchange bars, one origin a day at 00:00 UTC, 24h ahead.",
  "",
  "## Validation (before 2024) — model choice",
  "",
  "| model | n | 80% held | 50% held | interval score 80% |",
  "|---|---|---|---|---|",
  ...MODELS.map((m) => { const v = validation[m]; return `| ${m} | ${v ? v.n : 0} | ${v ? pct(v.cov80) : "—"} | ${v ? pct(v.cov50) : "—"} | ${v ? v.is80.toFixed(4) : "—"} |`; }),
  "",
  `Chosen: **${chosen || "none qualified"}**.`,
  "",
  "## Test (2024-01-01 →), run once",
  "",
  test ? `Pooled: n ${test.n} · 80% held ${pct(test.cov80)} · 50% held ${pct(test.cov50)} · mean 80% width ${pct(test.width80)} of the price · up on ${pct(test.upShare)} of days` : "—",
  "",
  "| coin | n | 80% held | 50% held | width 80% |",
  "|---|---|---|---|---|",
  ...COINS.map((c) => { const v = perCoin[c]; return `| ${c} | ${v ? v.n : 0} | ${v ? pct(v.cov80) : "—"} | ${v ? pct(v.cov50) : "—"} | ${v ? pct(v.width80) : "—"} |`; }),
  "",
  `**Range ships: ${rangeShips ? "yes" : "no"}.**`,
  "",
  "### Direction",
  "",
  test ? `Brier ${test.brier.toFixed(5)} against the constant 0.5's ${test.brier0.toFixed(5)}: skill ${test.skill.toFixed(5)}, 95% block-bootstrap interval [${skillCi[0].toFixed(5)}, ${skillCi[1].toFixed(5)}].` : "—",
  "",
  "| P(up) given | n | mean given | came true |",
  "|---|---|---|---|",
  ...reliability.map((r) => `| ${r.bin} | ${r.n} | ${pct(r.given)} | ${pct(r.happened)} |`),
  "",
  `**Direction ships as a number: ${directionShips ? "yes" : "no"}.**`,
  "",
];
fs.writeFileSync(path.join(OUT, `tomorrow-results-${date}.md`), md.join("\n"));
fs.writeFileSync(path.join(OUT, `tomorrow-results-${date}.json`), JSON.stringify({ validation, chosen, test, perCoin, reliability, skillCi, rangeShips, directionShips }, null, 2));
console.log(md.join("\n"));
