#!/usr/bin/env node
/* The square-odds study, round two (docs/internal/research/cell-odds-2-prereg.md).
 *
 *   node scripts/cell-odds-study-2.js
 *   ODDS_CACHE=/path node scripts/cell-odds-study-2.js
 *
 * The product model is `src/cell-odds.js`, run unchanged. The four candidates
 * — MR (variance mean-reverts over the horizon), GK (Garman–Klass bars feed
 * the EWMA), T4 (a Student-t kernel) and POOL (product and unscaled, averaged)
 * — are built here from its own pieces, each changing one thing. Same
 * boards, coins, origins, scores and test as round one. Local tooling, never
 * shipped. Real requests to Coinbase Exchange, paced, cached on disk. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const CACHE = process.env.ODDS_CACHE || path.join(os.tmpdir(), "pricetab-cell-odds");
const OUT = path.join(ROOT, "docs", "internal", "research");
fs.mkdirSync(CACHE, { recursive: true });

const sandbox = { Math, Float64Array, Array, Number, isFinite, Infinity, NaN };
vm.createContext(sandbox);
const O = vm.runInContext(
  fs.readFileSync(path.join(ROOT, "src", "cell-odds.js"), "utf8") +
    "\n;({ oddsGranularity, oddsRegular, oddsPrepare, oddsColumn, oddsBand, oddsKde, oddsKdeAt, oddsPhi, ODDS_LOOKBACK, ODDS_LAMBDA, ODDS_SEED_BARS, ODDS_MIN_BARS, ODDS_MIN_STRETCHES, ODDS_GRID_PER_BW, ODDS_GRID_MAX })",
  sandbox,
);

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const COINS = ["BTC", "ETH", "SOL", "XRP"];
const BOARDS = [
  { range: "1H", span: 3 * MIN, history: 30 * DAY },
  { range: "1D", span: 2 * HOUR, history: 365 * DAY },
  { range: "1W", span: 12 * HOUR, history: 3 * 365 * DAY },
  { range: "1M", span: 2 * DAY, history: 8 * 365 * DAY },
  { range: "1Y", span: 4 * WEEK, history: 12 * 365 * DAY, daily: true },
  { range: "ALL", span: 26 * WEEK, history: 12 * 365 * DAY, daily: true },
];
const COLUMNS = 12;
const ROWS = 6;
const MAX_ORIGINS = 1200;
const BINS = [0, 0.01, 0.025, 0.05, 0.1, 0.2, 0.35, 0.5, 1.0000001];
const MODELS = ["fhs", "MR", "GK", "T4", "POOL"];
const CANDIDATES = ["MR", "GK", "T4", "POOL"];
const PHI = 0.97; // the EWMA's own lambda: MR's reversion per bar
const T4_REACH = 20; // bandwidths either side, for the t kernel's tails
const BOOT = 2000;
const BLOCK = 20;

const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(coin, g, start, end) {
  const url =
    `https://api.exchange.coinbase.com/products/${coin}-USD/candles?granularity=${g}` +
    `&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "pricetab-cell-odds-study" } });
      if (res.status === 429) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    } catch (e) {
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`gave up on ${url}`);
}

async function candles(coin, g, history) {
  const file = path.join(CACHE, `${coin}-${g}-${Math.round(history / DAY)}d.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const size = 300 * g * 1000;
  const now = Math.floor(Date.now() / (g * 1000)) * g * 1000;
  const from = now - history;
  const rows = new Map();
  let empty = 0;
  for (let end = now; end > from; end -= size) {
    const start = Math.max(from, end - size + g * 1000);
    const body = await page(coin, g, start, end);
    for (const r of body) {
      const [t, low, high, open, close, volume] = r.map(Number);
      if ([t, low, high, open, close].every((x) => isFinite(x) && x > 0)) {
        rows.set(t * 1000, { time: t * 1000, low, high, open, close, volume });
      }
    }
    empty = body.length ? 0 : empty + 1;
    if (empty >= 3) break;
    await sleep(260);
  }
  const out = [...rows.values()].sort((a, b) => a.time - b.time);
  fs.writeFileSync(file, JSON.stringify(out));
  process.stdout.write(`  fetched ${coin} g=${g}: ${out.length} bars\n`);
  return out;
}

// The opens on the regular grid oddsRegular builds (a filled bar opens at its close)
const regularOpens = (rows, series) => {
  const at = new Map(rows.map((r) => [r.time, r.open]));
  return series.time.map((t, i) => (at.has(t) ? at.get(t) : series.close[i]));
};

/* ── the candidates' pieces ─────────────────────────────────────────────── */

// GK: the EWMA fed by each bar's Garman–Klass variance plus the gap from the last close
const gkSigmas = (series, opens) => {
  const n = series.close.length;
  const sig = new Float64Array(n);
  if (n < 3) return sig;
  const c2 = 2 * Math.log(2) - 1;
  const bar = (t) => {
    const h = Math.log(series.high[t] / series.low[t]);
    const co = Math.log(series.close[t] / opens[t]);
    const gap = t > 0 ? Math.log(opens[t] / series.close[t - 1]) : 0;
    return Math.max(0, 0.5 * h * h - c2 * co * co + gap * gap);
  };
  const seed = Math.min(O.ODDS_SEED_BARS, n - 1);
  let v = 0;
  for (let i = 1; i <= seed; i++) v += bar(i);
  v /= seed;
  sig[0] = Math.sqrt(v);
  for (let t = 1; t < n; t++) {
    v = O.ODDS_LAMBDA * v + (1 - O.ODDS_LAMBDA) * bar(t);
    sig[t] = Math.sqrt(v);
  }
  return sig;
};

// MR: the long-run variance at every bar, the mean squared one-bar return over the look-back
const longRunVar = (logs, lookback) => {
  const n = logs.length;
  const pre = new Float64Array(n);
  for (let t = 1; t < n; t++) pre[t] = pre[t - 1] + (logs[t] - logs[t - 1]) ** 2;
  const out = new Float64Array(n);
  for (let t = 1; t < n; t++) {
    const from = Math.max(0, t - (isFinite(lookback) ? lookback : t));
    out[t] = (pre[t] - pre[from]) / Math.max(1, t - from);
  }
  return out;
};
const mrVar = (s2, lr, k) => k * lr + (s2 - lr) * (1 - Math.pow(PHI, k)) / (1 - PHI);

// T4: Student-t (nu 4) CDF, and the kernel density built with it
const t4Cdf = (t) => {
  const q = t * t / (1 + (t * t) / 4);
  const x = t / Math.sqrt(1 + (t * t) / 4);
  return 0.5 + (3 / 8) * x * (1 - q / 12);
};
const t4Kde = (z) => {
  const base = O.oddsKde(z, null);
  if (!base) return null;
  const n = z.length;
  const bw = base.bw;
  const mean = z.reduce((s, v) => s + v, 0) / n;
  const sorted = Array.from(z).sort((a, b) => a - b);
  const lo = sorted[0] - mean - T4_REACH * bw;
  const hi = sorted[n - 1] - mean + T4_REACH * bw;
  let step = bw / O.ODDS_GRID_PER_BW;
  if ((hi - lo) / step > O.ODDS_GRID_MAX) step = (hi - lo) / O.ODDS_GRID_MAX;
  const m = Math.ceil((hi - lo) / step) + 1;
  const mass = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    const x = (z[i] - mean - lo) / step;
    const j = Math.floor(x);
    const f = x - j;
    if (j >= 0 && j < m) mass[j] += (1 - f) / n;
    if (j + 1 >= 0 && j + 1 < m) mass[j + 1] += f / n;
  }
  // Scaled to the Gaussian kernel's variance: t4 has variance 2. Reaching
  // T4_REACH bandwidths; everything further below counts whole, as in oddsKde
  const reach = Math.ceil((T4_REACH * bw) / step);
  const kern = new Float64Array(2 * reach + 1);
  for (let d = -reach; d <= reach; d++) kern[d + reach] = t4Cdf(((d * step) / bw) * Math.SQRT2);
  const below = new Float64Array(m + 1);
  for (let j = 0; j < m; j++) below[j + 1] = below[j] + mass[j];
  const cdf = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    let c = j - reach - 1 >= 0 ? below[j - reach] : 0;
    const a = Math.max(0, j - reach);
    const b = Math.min(m - 1, j + reach);
    for (let i = a; i <= b; i++) c += mass[i] * kern[j - i + reach];
    cdf[j] = c;
  }
  return { lo, step, cdf, bw, n, nEff: n };
};

/* One column for a model at origin `end`. `prep` holds logs and the product's
   sigmas; `gkSig` and `lr` the candidates' extra arrays. */
const columnFor = (model, prep, ctx, hMs, end, lookback) => {
  if (model === "fhs") return O.oddsColumn(prep, hMs, { end, lookback });
  if (model === "POOL") {
    const a = O.oddsColumn(prep, hMs, { end, lookback });
    const b = O.oddsColumn(prep, hMs, { end, lookback, model: "raw" });
    if (!a || !b) return a || null;
    return { cdf: (x) => 0.5 * (a.cdf(x) + b.cdf(x)), n: a.n, stretches: a.stretches };
  }
  const start = Math.max(1, end - (isFinite(lookback) ? lookback : end) + 1);
  const bars = end - start + 1;
  const k = hMs / (prep.g * 1000);
  const kInt = Math.max(1, Math.round(k));
  if (bars < O.ODDS_MIN_BARS || Math.floor(bars / kInt) < O.ODDS_MIN_STRETCHES) return null;
  const sig = model === "GK" ? ctx.gkSig : prep.sig;
  const scaleAt = (t, kk) => (model === "MR" ? Math.sqrt(Math.max(1e-300, mrVar(sig[t] * sig[t], ctx.lr[t], kk))) : sig[t] * Math.sqrt(kk));
  const sNow = scaleAt(end, k);
  if (!(sNow > 0)) return null;
  const z = [];
  for (let t = start; t + kInt <= end; t++) {
    const s = scaleAt(t, kInt);
    if (s > 0) z.push((prep.logs[t + kInt] - prep.logs[t]) / s);
  }
  const kde = model === "T4" ? t4Kde(z) : O.oddsKde(z, null);
  if (!kde) return null;
  return { cdf: (x) => O.oddsKdeAt(kde, x / sNow), n: z.length, stretches: Math.floor(bars / kInt) };
};

/* ── the walk ───────────────────────────────────────────────────────────── */

const rung = (want) => {
  const power = Math.pow(10, Math.floor(Math.log10(want)));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((v) => v >= want) || power * 10;
};
const binOf = (p) => {
  for (let i = 0; i < BINS.length - 1; i++) if (p >= BINS[i] && p < BINS[i + 1]) return i;
  return BINS.length - 2;
};
const newCal = () => BINS.slice(1).map(() => ({ n: 0, given: 0, happened: 0 }));

function evaluate(board, series, opens, g, random) {
  const prep = O.oddsPrepare(series.close, g);
  if (!prep) return null;
  const lookbackAll = board.daily ? Infinity : O.ODDS_LOOKBACK;
  const ctx = { gkSig: gkSigmas(series, opens), lr: longRunVar(prep.logs, lookbackAll) };
  const spanBars = board.span / (g * 1000);
  const warm = board.daily ? 300 : O.ODDS_LOOKBACK;
  const last = prep.n - 1;
  if (last - 1 <= warm) return null;
  const stride = Math.max(board.daily ? 30 : Math.round(spanBars), Math.ceil((last - 1 - warm) / MAX_ORIGINS));
  const res = { origins: 0, cal: Object.fromEntries(MODELS.map((m) => [m, newCal()])), perOrigin: [] };
  for (let o = warm; o <= last - 1; o += stride) {
    const sNow = series.close[o];
    const lb = board.daily ? o + 1 : O.ODDS_LOOKBACK;
    const moves = [];
    const from = Math.max(0, o - (board.daily ? o : O.ODDS_LOOKBACK) + 1);
    const kSpan = Math.max(1, Math.round(spanBars));
    for (let t = from; t + kSpan <= o; t += Math.max(1, Math.floor(kSpan / 4))) moves.push(Math.abs(series.close[t + kSpan] - series.close[t]));
    moves.sort((a, b) => a - b);
    const fair = moves[Math.floor(moves.length / 2)];
    if (!(fair > 0)) continue;
    const step = rung(fair);
    const rowNow = Math.floor(sNow / step);
    const phase = Math.max(1, Math.ceil(random() * spanBars));
    const scores = Object.fromEntries(MODELS.map((m) => [m, []]));
    let any = false;
    for (let c = 0; c < COLUMNS; c++) {
      const aheadBars = phase + c * spanBars;
      const at = o + Math.round(aheadBars);
      if (at > last) break;
      const hMs = aheadBars * g * 1000;
      const cols = Object.fromEntries(MODELS.map((m) => [m, columnFor(m, prep, ctx, hMs, o, lb)]));
      if (!cols.fhs) continue; // the product's refusal is everybody's: same columns scored
      any = true;
      const rowT = Math.floor(series.close[at] / step);
      const band = (col, r) => O.oddsBand(col, sNow, r * step, (r + 1) * step);
      for (const m of MODELS) {
        const col = cols[m] || cols.fhs;
        scores[m].push(-Math.log(Math.max(1e-6, band(col, rowT))));
        for (let r = rowNow - ROWS; r <= rowNow + ROWS; r++) {
          const p = band(col, r);
          if (!isFinite(p)) continue;
          const b = res.cal[m][binOf(p)];
          b.n += 1;
          b.given += p;
          b.happened += r === rowT ? 1 : 0;
        }
      }
    }
    if (!any) continue;
    res.origins += 1;
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    res.perOrigin.push(Object.fromEntries(MODELS.map((m) => [m, mean(scores[m])])));
  }
  return res;
}

const ece = (cal) => {
  const n = cal.reduce((s, b) => s + b.n, 0);
  return n ? cal.reduce((s, b) => s + (b.n ? Math.abs(b.given - b.happened) : 0), 0) / n : NaN;
};
const worstBin = (cal, min = 300) => cal.reduce((w, b) => (b.n >= min ? Math.max(w, Math.abs(b.given / b.n - b.happened / b.n)) : w), 0);
const tailGap = (cal) => (cal[0].n ? Math.abs(cal[0].given / cal[0].n - cal[0].happened / cal[0].n) : NaN);
const mergeCal = (cals) => cals[0].map((_, i) => cals.reduce((m, c) => ({ n: m.n + c[i].n, given: m.given + c[i].given, happened: m.happened + c[i].happened }), { n: 0, given: 0, happened: 0 }));
const blockP = (diffs, random) => {
  const n = diffs.length;
  if (n < BLOCK * 2) return { mean: NaN, p: 1 };
  const mean = diffs.reduce((s, v) => s + v, 0) / n;
  const centred = diffs.map((d) => d - mean);
  let atLeast = 0;
  const blocks = Math.ceil(n / BLOCK);
  for (let b = 0; b < BOOT; b++) {
    let s = 0;
    let c = 0;
    for (let k = 0; k < blocks; k++) {
      const at = Math.floor(random() * (n - BLOCK + 1));
      for (let j = 0; j < BLOCK && c < n; j++, c++) s += centred[at + j];
    }
    if (s / n >= mean) atLeast += 1;
  }
  return { mean, p: (atLeast + 1) / (BOOT + 1) };
};

(async () => {
  const random = rng(20261003);
  const results = {};
  for (const board of BOARDS) {
    results[board.range] = {};
    for (const coin of COINS) {
      const g = board.daily ? 86400 : O.oddsGranularity(board.span);
      const rows = await candles(coin, g, board.history);
      const series = O.oddsRegular(rows, g);
      const opens = regularOpens(rows, series);
      const t0 = Date.now();
      const r = evaluate(board, series, opens, g, random);
      results[board.range][coin] = r;
      process.stdout.write(`${board.range} ${coin}: bars=${series.close.length} origins=${r ? r.origins : 0} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
    }
  }
  const summary = [];
  const tests = [];
  for (const board of BOARDS) {
    const per = COINS.map((c) => results[board.range][c]).filter((r) => r && r.origins);
    if (!per.length) continue;
    const all = per.flatMap((r) => r.perOrigin);
    const row = { range: board.range, origins: all.length, models: {} };
    for (const m of MODELS) {
      const cal = mergeCal(per.map((r) => r.cal[m]));
      row.models[m] = {
        logScore: all.reduce((s, o) => s + o[m], 0) / all.length,
        ece: ece(cal),
        worst: worstBin(cal),
        tail: cal[0].n ? { n: cal[0].n, given: cal[0].given / cal[0].n, happened: cal[0].happened / cal[0].n } : null,
        tailGap: tailGap(cal),
        pass: ece(cal) <= 0.02 && worstBin(cal) <= 0.05,
        // The bins as CELL_ODDS_MEASURED bundles them: [from, to, given, happened, n]
        bins: cal.map((b, i) => [BINS[i], Math.min(1, BINS[i + 1]), b.n ? +(b.given / b.n).toFixed(4) : null, b.n ? +(b.happened / b.n).toFixed(4) : null, b.n]),
      };
    }
    for (const m of CANDIDATES) {
      const { mean, p } = blockP(all.map((o) => o.fhs - o[m]), random);
      const everyCoin = per.every((r) => r.perOrigin.reduce((s, o) => s + (o.fhs - o[m]), 0) > 0);
      tests.push({ range: board.range, name: m, gain: mean, p, everyCoin });
    }
    summary.push(row);
  }
  const sorted = tests.map((t, i) => ({ ...t, i })).sort((a, b) => a.p - b.p);
  const mT = sorted.length;
  let cut = -1;
  sorted.forEach((t, rank) => {
    if (t.p <= ((rank + 1) / mT) * 0.05) cut = rank;
  });
  for (let rank = mT - 1, qMin = 1; rank >= 0; rank--) {
    qMin = Math.min(qMin, (sorted[rank].p * mT) / (rank + 1));
    const t = tests[sorted[rank].i];
    t.q = qMin;
    t.bh = rank <= cut;
  }
  // The entry rule, all four parts
  for (const t of tests) {
    const row = summary.find((r) => r.range === t.range);
    const c = row.models[t.name];
    const f = row.models.fhs;
    t.calibrated = c.pass;
    t.tailNoWorse = !(c.tailGap > f.tailGap);
    t.enters = Boolean(t.bh && t.everyCoin && t.gain > 0 && t.calibrated && t.tailNoWorse);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(OUT, `cell-odds-2-results-${stamp}.json`), JSON.stringify({ summary, tests }, null, 1));
  const pct = (x) => (x == null || !isFinite(x) ? "–" : (100 * x).toFixed(2));
  const L = [`# Square odds, round two — results (${stamp})`, "", "Run of `scripts/cell-odds-study-2.js` against `cell-odds-2-prereg.md`. Pooled over BTC, ETH, SOL, XRP; zoom 1.", ""];
  L.push("| Board | origins | model | log score | ECE | worst bin | tail bin given → happened (n) | prints |", "|---|---|---|---|---|---|---|---|");
  for (const r of summary) {
    for (const m of MODELS) {
      const v = r.models[m];
      L.push(`| ${r.range} | ${r.origins} | ${m} | ${v.logScore.toFixed(4)} | ${pct(v.ece)} | ${pct(v.worst)} | ${v.tail ? `${pct(v.tail.given)} → ${pct(v.tail.happened)} (${v.tail.n})` : "–"} | ${v.pass ? "yes" : "no"} |`);
    }
  }
  L.push("", "## The test (24, Benjamini–Hochberg q = 0.05) and the entry rule", "", "| Board | candidate | log-score gain | p | q | every coin | calibrated | tail no worse | enters |", "|---|---|---|---|---|---|---|---|---|");
  for (const t of tests) L.push(`| ${t.range} | ${t.name} | ${isFinite(t.gain) ? t.gain.toFixed(5) : "–"} | ${t.p.toFixed(4)} | ${t.q.toFixed(4)} | ${t.everyCoin ? "yes" : "no"} | ${t.calibrated ? "yes" : "no"} | ${t.tailNoWorse ? "yes" : "no"} | ${t.enters ? "**yes**" : "no"} |`);
  fs.writeFileSync(path.join(OUT, `cell-odds-2-results-${stamp}.md`), L.join("\n") + "\n");
  process.stdout.write(L.join("\n") + "\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
