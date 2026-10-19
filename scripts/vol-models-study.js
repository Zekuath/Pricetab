#!/usr/bin/env node
/* The next 24 hours: HAR-RV and Yang–Zhang against the current model — the
 * study preregistered in docs/internal/research/vol-models-prereg.md.
 *
 *   node scripts/vol-models-study.js --fetch   # once: 6-hour bars → research/vol-bars/
 *   node scripts/vol-models-study.js           # the run, from the kept bars only
 *
 * Local tooling, never shipped. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const BARS = path.join(ROOT, "docs/internal/research/vol-bars");
const OUT = path.join(ROOT, "docs/internal/research/vol-models-results-2026-10-18.json");
const COINS = ["BTC", "ETH", "SOL", "XRP"];
const G = 21600;
const DAY = 86400e3;
const HISTORY = 2920 * DAY;
const SPLIT = Date.parse("2024-01-01T00:00:00Z");
const MIN_BEFORE = 1000; // bars, as the tomorrow study
const LOOKBACK_DAYS = 750;
const REFIT = 30;
const NW_LAG = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBars(coin) {
  fs.mkdirSync(BARS, { recursive: true });
  const file = path.join(BARS, `${coin}-${G}.json`);
  if (fs.existsSync(file)) return;
  const size = 300 * G * 1000;
  const now = Math.floor(Date.now() / (G * 1000)) * G * 1000;
  const from = now - HISTORY;
  const rows = new Map();
  let empty = 0;
  for (let end = now; end > from; end -= size) {
    const start = Math.max(from, end - size + G * 1000);
    const url = `https://api.exchange.coinbase.com/products/${coin}-USD/candles?granularity=${G}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
    let body = null;
    for (let attempt = 0; attempt < 6 && !body; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "pricetab-vol-models-study" } });
        if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        body = await res.json();
      } catch (e) {
        await sleep(1000 * (attempt + 1));
      }
    }
    if (!Array.isArray(body)) throw new Error(`gave up on ${url}`);
    for (const r of body) {
      const [t, low, high, open, close, volume] = r.map(Number);
      if ([t, low, high, open, close].every((x) => isFinite(x) && x > 0)) rows.set(t * 1000, { time: t * 1000, low, high, open, close, volume });
    }
    empty = body.length ? 0 : empty + 1;
    if (empty >= 3) break;
    await sleep(260);
  }
  const out = [...rows.values()].sort((a, b) => a.time - b.time);
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`fetched ${coin}: ${out.length} bars`);
}

const quantileCdf = (cdf, p) => {
  let lo = -3;
  let hi = 3;
  for (let i = 0; i < 80 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
const quantile = (sorted, p) => {
  const i = (sorted.length - 1) * p;
  const a = Math.floor(i);
  const b = Math.ceil(i);
  return sorted[a] + (sorted[b] - sorted[a]) * (i - a);
};
const intervalScore = (l, u, y, a) => u - l + (2 / a) * (Math.max(0, l - y) + Math.max(0, y - u));

// OLS by normal equations, 4 columns (1, d, w, m)
const ols = (X, y) => {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let r = 0; r < k; r++) {
      b[r] += X[i][r] * y[i];
      for (let c = 0; c < k; c++) A[r][c] += X[i][r] * X[i][c];
    }
  }
  // Gaussian elimination
  for (let i = 0; i < k; i++) {
    let p = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-300) return null;
    for (let r = i + 1; r < k; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < k; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < k; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
};

async function main() {
  if (process.argv.includes("--fetch")) {
    for (const coin of COINS) await fetchBars(coin);
    return;
  }
  const sandbox = { Math, Float64Array, Array, Number, isFinite, Infinity, NaN, Object };
  vm.createContext(sandbox);
  const O = vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "cell-odds.js"), "utf8") + "\n;({ oddsRegular, oddsPrepare, oddsColumn })", sandbox);

  const forecasts = []; // { coin, t, model, q10, q25, q75, q90, y }
  for (const coin of COINS) {
    const rows = JSON.parse(fs.readFileSync(path.join(BARS, `${coin}-${G}.json`), "utf8"));
    const series = O.oddsRegular(rows, G);
    const prep = O.oddsPrepare(series.close, G);
    const opens = new Map(rows.map((r) => [r.time, r]));
    const nBar = series.close.length;
    // Daily blocks of four bars ending at each 00:00 UTC origin
    const dayIdx = []; // bar index o where the 00:00 close is
    for (let o = 4; o < nBar; o++) if ((series.time[o] + G * 1000) % DAY === 0) dayIdx.push(o);
    const dayStats = dayIdx.map((o) => {
      let rv = 0;
      let hi = -Infinity;
      let lo = Infinity;
      for (let k = o - 3; k <= o; k++) {
        const r = Math.log(series.close[k] / series.close[k - 1]);
        rv += r * r;
        const raw = opens.get(series.time[k]);
        hi = Math.max(hi, raw ? raw.high : series.close[k]);
        lo = Math.min(lo, raw ? raw.low : series.close[k]);
      }
      const first = opens.get(series.time[o - 3]);
      return { o, rv, open: first ? first.open : series.close[o - 4], close: series.close[o], prevClose: series.close[o - 4], hi, lo, ret: Math.log(series.close[o] / series.close[o - 4]) };
    });
    // HAR forecasts made at day j for day j+1, refitted every REFIT days on all days before
    const harF = new Array(dayStats.length).fill(NaN);
    let beta = null;
    for (let j = 22; j < dayStats.length - 1; j++) {
      if (!beta || j % REFIT === 0) {
        const X = [];
        const Y = [];
        for (let i = 22; i < j; i++) {
          const w = dayStats.slice(i - 4, i + 1).reduce((s, d) => s + d.rv, 0) / 5;
          const m = dayStats.slice(i - 21, i + 1).reduce((s, d) => s + d.rv, 0) / 22;
          X.push([1, dayStats[i].rv, w, m]);
          Y.push(dayStats[i + 1].rv);
        }
        if (X.length >= 60) beta = ols(X, Y) || beta;
      }
      if (!beta) continue;
      const w = dayStats.slice(j - 4, j + 1).reduce((s, d) => s + d.rv, 0) / 5;
      const m = dayStats.slice(j - 21, j + 1).reduce((s, d) => s + d.rv, 0) / 22;
      const f = beta[0] + beta[1] * dayStats[j].rv + beta[2] * w + beta[3] * m;
      harF[j + 1] = f > 0 ? f : dayStats[j].rv; // the forecast for day j+1
    }
    // Yang–Zhang over the trailing 30 days, as known at day j, for day j+1
    const yzF = new Array(dayStats.length).fill(NaN);
    const N = 30;
    const kYZ = 0.34 / (1.34 + (N + 1) / (N - 1));
    for (let j = N; j < dayStats.length - 1; j++) {
      const win = dayStats.slice(j - N + 1, j + 1);
      const on = win.map((d) => Math.log(d.open / d.prevClose));
      const oc = win.map((d) => Math.log(d.close / d.open));
      const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
      const varS = (xs) => { const mu = mean(xs); return xs.reduce((s, x) => s + (x - mu) ** 2, 0) / (xs.length - 1); };
      const rs = mean(win.map((d) => Math.log(d.hi / d.close) * Math.log(d.hi / d.open) + Math.log(d.lo / d.close) * Math.log(d.lo / d.open)));
      const v = varS(on) + kYZ * varS(oc) + (1 - kYZ) * rs;
      if (v > 0) yzF[j + 1] = v;
    }
    // Origins: day j's close (dayIdx[j]) predicts day j+1
    for (let j = 1; j < dayStats.length - 1; j++) {
      const o = dayStats[j].o;
      const next = dayStats[j + 1];
      if (o < MIN_BEFORE || series.filled[o] || series.filled[next.o]) continue;
      const y = Math.log(series.close[next.o] / series.close[o]);
      const t = series.time[o] + G * 1000;
      const col = O.oddsColumn(prep, DAY, { end: o, model: "mr", lookback: 3000 });
      if (col) forecasts.push({ coin, t, model: "mr", q10: quantileCdf(col.cdf, 0.1), q25: quantileCdf(col.cdf, 0.25), q75: quantileCdf(col.cdf, 0.75), q90: quantileCdf(col.cdf, 0.9), y });
      for (const [model, F] of [["har", harF], ["yz", yzF]]) {
        const f = F[j + 1];
        if (!(f > 0)) continue;
        const z = [];
        for (let i = Math.max(1, j - LOOKBACK_DAYS + 1); i <= j; i++) {
          if (F[i] > 0) z.push(dayStats[i].ret / Math.sqrt(F[i]));
        }
        if (z.length < 200) continue;
        const mu = z.reduce((s, x) => s + x, 0) / z.length;
        const sorted = z.map((x) => x - mu).sort((a, b) => a - b);
        const s = Math.sqrt(f);
        forecasts.push({ coin, t, model, q10: quantile(sorted, 0.1) * s, q25: quantile(sorted, 0.25) * s, q75: quantile(sorted, 0.75) * s, q90: quantile(sorted, 0.9) * s, y });
      }
    }
  }

  const MODELS = ["mr", "har", "yz"];
  const summarise = (list) => {
    const n = list.length;
    if (!n) return null;
    return {
      n,
      cov80: list.filter((f) => f.y >= f.q10 && f.y <= f.q90).length / n,
      cov50: list.filter((f) => f.y >= f.q25 && f.y <= f.q75).length / n,
      is80: list.reduce((s, f) => s + intervalScore(f.q10, f.q90, f.y, 0.2), 0) / n,
    };
  };
  const part = (m, test, coin) => forecasts.filter((f) => f.model === m && (test ? f.t >= SPLIT : f.t < SPLIT) && (!coin || f.coin === coin));
  // Only origins every model has, so the comparison is on the same days
  const key = (f) => `${f.coin}|${f.t}`;
  const common = new Set(MODELS.map((m) => new Set(forecasts.filter((f) => f.model === m).map(key))).reduce((a, b) => [...a].filter((x) => b.has(x))));
  const kept = forecasts.filter((f) => common.has(key(f)));
  forecasts.length = 0;
  forecasts.push(...kept);

  const out = { validation: {}, test: {}, perCoin: {}, dm: {} };
  for (const m of MODELS) {
    out.validation[m] = summarise(part(m, false));
    out.test[m] = summarise(part(m, true));
    out.perCoin[m] = Object.fromEntries(COINS.map((c) => [c, summarise(part(m, true, c))]));
  }
  // DM on the pooled per-day difference (candidate − mr)
  for (const m of ["har", "yz"]) {
    const byDay = new Map();
    for (const f of part(m, true)) byDay.set(key(f), intervalScore(f.q10, f.q90, f.y, 0.2));
    const days = new Map();
    for (const f of part("mr", true)) {
      const k = key(f);
      if (!byDay.has(k)) continue;
      const d = byDay.get(k) - intervalScore(f.q10, f.q90, f.y, 0.2);
      days.set(f.t, (days.get(f.t) || 0) + d);
    }
    const d = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    const n = d.length;
    const mean = d.reduce((s, x) => s + x, 0) / n;
    let v = d.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
    for (let k = 1; k <= NW_LAG; k++) {
      let g = 0;
      for (let i = k; i < n; i++) g += (d[i] - mean) * (d[i - k] - mean);
      v += 2 * (1 - k / (NW_LAG + 1)) * (g / n);
    }
    const tStat = mean / Math.sqrt(v / n);
    const erf = (z) => { const s = Math.sign(z); z = Math.abs(z); const q = 1 / (1 + 0.3275911 * z); return s * (1 - ((((1.061405429 * q - 1.453152027) * q + 1.421413741) * q - 0.284496736) * q + 0.254829592) * q * Math.exp(-z * z)); };
    out.dm[m] = { days: n, meanDiff: mean, t: tStat, p: 2 * (1 - 0.5 * (1 + erf(Math.abs(tStat) / Math.SQRT2))) };
  }
  const passes = (m) => {
    const v = out.validation[m];
    const t = out.test[m];
    const base = out.test.mr;
    const coinsBetter = COINS.filter((c) => out.perCoin[m][c] && out.perCoin.mr[c] && out.perCoin[m][c].is80 < out.perCoin.mr[c].is80).length;
    const coinsCovered = COINS.every((c) => out.perCoin[m][c] && out.perCoin[m][c].cov80 >= 0.74 && out.perCoin[m][c].cov80 <= 0.86);
    return {
      validationCoverage: v.cov80 >= 0.77 && v.cov80 <= 0.83,
      lowerScore: t.is80 < base.is80 && out.dm[m].p < 0.05,
      coinsBetter,
      coinsCovered,
      ok: v.cov80 >= 0.77 && v.cov80 <= 0.83 && t.is80 < base.is80 && out.dm[m].p < 0.05 && coinsBetter >= 3 && coinsCovered,
    };
  };
  out.rule = { har: passes("har"), yz: passes("yz") };
  const winners = ["har", "yz"].filter((m) => out.rule[m].ok).sort((a, b) => out.test[a].is80 - out.test[b].is80);
  out.choice = winners[0] || "mr";
  out.ran = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  for (const m of MODELS) {
    const v = out.validation[m];
    const t = out.test[m];
    console.log(`${m.padEnd(3)} · validation n ${v.n} 80% ${pct(v.cov80)} IS ${v.is80.toFixed(4)} · test n ${t.n} 80% ${pct(t.cov80)} 50% ${pct(t.cov50)} IS ${t.is80.toFixed(4)}`);
    console.log("     " + COINS.map((c) => `${c} ${pct(out.perCoin[m][c].cov80)} ${out.perCoin[m][c].is80.toFixed(4)}`).join(" · "));
  }
  for (const m of ["har", "yz"]) console.log(`${m} vs mr: DM t ${out.dm[m].t.toFixed(2)} p ${out.dm[m].p.toFixed(4)} · rule ${JSON.stringify(out.rule[m])}`);
  console.log(`choice: ${out.choice}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
