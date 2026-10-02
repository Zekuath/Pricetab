/* SQUARE ODDS — the chance of each square on the calls board (30 Sep 2026)
 *
 * A square is a column of real time and a band of price, and a call on it is
 * settled by one number: the price at the column's right edge (`settleCall`,
 * utils.js). So the chance of a square is P(S(T) in [lo, hi]) — a slice of one
 * distribution per column, and a column's squares sum to at most one.
 *
 * The distribution is the coin's own, scaled to how it is moving now
 * (filtered historical simulation, in its direct horizon form):
 *
 *   ln(S_T / S_now) = sigma_now * sqrt(k) * Z
 *
 * where k is the horizon in bars, sigma an EWMA of one-bar log returns, and Z
 * drawn from a Gaussian kernel over the past's standardised k-bar returns —
 * fat tails and skew from history, the scale from now. Every choice here is
 * fixed in `docs/internal/research/cell-odds-prereg.md`, written before the
 * model was run on any data; the study (`scripts/cell-odds-study.js`) runs
 * this file unchanged, and what it found decides what the board may print.
 *
 * Pure: no DOM, no clock, no request. Loads before chart.js. */

const ODDS_GRANULARITIES = [60, 300, 900, 3600, 21600, 86400]; // seconds
const ODDS_LOOKBACK = 3000; // bars
const ODDS_LAMBDA = 0.97; // EWMA, a half-life of about 23 bars
const ODDS_SEED_BARS = 30;
const ODDS_MIN_BARS = 300;
const ODDS_MIN_STRETCHES = 30; // non-overlapping horizons the look-back must hold
const ODDS_KERNEL_REACH = 6; // bandwidths either side of a point
const ODDS_GRID_PER_BW = 4; // grid points per bandwidth
const ODDS_GRID_MAX = 6000;
const ODDS_STATE_WIDTH = 0.5; // conditioning kernel, in the state's own sd

/* The bar the model reads for a square of `spanMs`: the coarsest that still
   puts four bars in a square, so the part-column "now" stands in is not a
   single bar's coin toss. One minute when even that is too coarse. */
const oddsGranularity = (spanMs) => {
  const quarter = spanMs / 4000;
  let g = ODDS_GRANULARITIES[0];
  for (const s of ODDS_GRANULARITIES) if (s <= quarter) g = s;
  return g;
};

// The normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7)
const oddsPhi = (x) => {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
};

/* Candles onto a regular clock: a bar with no trade takes the previous close
   and no volume, so "k bars" is always k·g of time. `rows` are
   { time (ms), close, high, low, volume }, oldest first. */
const oddsRegular = (rows, g) => {
  const step = g * 1000;
  // `filled` marks the hours with no trade, so a reader can tell a gap from a flat hour
  const out = { time: [], close: [], high: [], low: [], volume: [], filled: [] };
  if (!Array.isArray(rows) || !rows.length) return out;
  let t = Math.floor(rows[0].time / step) * step;
  let i = 0;
  let last = null;
  const end = rows[rows.length - 1].time;
  while (t <= end) {
    while (i < rows.length && rows[i].time < t) i += 1;
    const r = i < rows.length && rows[i].time === t ? rows[i] : null;
    if (r && r.close > 0) last = r;
    if (last) {
      out.time.push(t);
      out.close.push(r ? r.close : last.close);
      out.high.push(r ? r.high : last.close);
      out.low.push(r ? r.low : last.close);
      out.volume.push(r ? r.volume || 0 : 0);
      out.filled.push(!r);
    }
    t += step;
  }
  return out;
};

/* sigma_t for every bar, from returns up to and including bar t only. */
const oddsSigmas = (logs) => {
  const n = logs.length;
  const sig = new Float64Array(n);
  if (n < 3) return sig;
  const seed = Math.min(ODDS_SEED_BARS, n - 1);
  let v = 0;
  for (let i = 1; i <= seed; i++) v += (logs[i] - logs[i - 1]) ** 2;
  v /= seed;
  sig[0] = Math.sqrt(v);
  for (let t = 1; t < n; t++) {
    const r = logs[t] - logs[t - 1];
    v = ODDS_LAMBDA * v + (1 - ODDS_LAMBDA) * r * r;
    sig[t] = Math.sqrt(v);
  }
  return sig;
};

/* Once per series: logs and sigmas. Null under ODDS_MIN_BARS. */
const oddsPrepare = (closes, g) => {
  if (!Array.isArray(closes) && !(closes instanceof Float64Array)) return null;
  if (closes.length < ODDS_MIN_BARS || !(g > 0)) return null;
  const logs = new Float64Array(closes.length);
  for (let i = 0; i < closes.length; i++) {
    const c = Number(closes[i]);
    if (!(c > 0)) return null;
    logs[i] = Math.log(c);
  }
  return { g, logs, sig: oddsSigmas(logs), n: logs.length };
};

/* A weighted Gaussian kernel density, as a CDF on a grid.
 *
 * The CDF of a kernel mixture at u is the weighted mean of Phi((u - z_i)/bw).
 * Evaluated directly that is n × boundaries evaluations per column, and the
 * study needs it hundreds of thousands of times; the points are binned onto
 * a grid a quarter-bandwidth fine (linear binning, mass split between the two
 * neighbours) and convolved with the kernel's CDF instead. Error well under
 * 0.1 point of chance. */
const oddsKde = (z, w) => {
  const n = z.length;
  if (n < ODDS_MIN_STRETCHES) return null;
  let sw = 0;
  let sw2 = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1;
    sw += wi;
    sw2 += wi * wi;
    mean += wi * z[i];
  }
  if (!(sw > 0)) return null;
  mean /= sw;
  let v = 0;
  for (let i = 0; i < n; i++) v += (w ? w[i] : 1) * (z[i] - mean) ** 2;
  const sd = Math.sqrt(v / sw);
  const sorted = Array.from(z).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))];
  const iqr = (q(0.75) - q(0.25)) / 1.34;
  const nEff = (sw * sw) / sw2;
  const spread = iqr > 0 ? Math.min(sd, iqr) : sd;
  if (!(spread > 0)) return null;
  const bw = 0.9 * spread * Math.pow(nEff, -0.2);
  // Demeaned: the past's drift is not a forecast
  const lo = sorted[0] - mean - ODDS_KERNEL_REACH * bw;
  const hi = sorted[n - 1] - mean + ODDS_KERNEL_REACH * bw;
  let step = bw / ODDS_GRID_PER_BW;
  if ((hi - lo) / step > ODDS_GRID_MAX) step = (hi - lo) / ODDS_GRID_MAX;
  const m = Math.ceil((hi - lo) / step) + 1;
  const mass = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    const x = (z[i] - mean - lo) / step;
    const j = Math.floor(x);
    const f = x - j;
    const wi = (w ? w[i] : 1) / sw;
    if (j >= 0 && j < m) mass[j] += wi * (1 - f);
    if (j + 1 >= 0 && j + 1 < m) mass[j + 1] += wi * f;
  }
  const reach = Math.ceil((ODDS_KERNEL_REACH * bw) / step);
  const kern = new Float64Array(2 * reach + 1);
  for (let d = -reach; d <= reach; d++) kern[d + reach] = oddsPhi((d * step) / bw);
  const below = new Float64Array(m + 1); // mass strictly more than `reach` below
  for (let j = 0; j < m; j++) below[j + 1] = below[j] + mass[j];
  const cdf = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    let c = j - reach - 1 >= 0 ? below[j - reach] : 0;
    const from = Math.max(0, j - reach);
    const to = Math.min(m - 1, j + reach);
    for (let i = from; i <= to; i++) c += mass[i] * kern[j - i + reach];
    cdf[j] = c;
  }
  return { lo, step, cdf, bw, n, nEff };
};

const oddsKdeAt = (k, u) => {
  if (!k) return NaN;
  const x = (u - k.lo) / k.step;
  if (x <= 0) return 0;
  const m = k.cdf.length - 1;
  if (x >= m) return 1;
  const j = Math.floor(x);
  const f = x - j;
  return Math.min(1, Math.max(0, k.cdf[j] * (1 - f) + k.cdf[j + 1] * f));
};

/* The weights a state gives the past: alike bars count more. `values` is one
   number per bar (NaN where undefined), `now` the value today. */
const oddsStateWeights = (values, ts, now, discrete) => {
  if (!isFinite(now)) return null;
  if (discrete) {
    let same = 0;
    for (const t of ts) if (values[t] === now) same += 1;
    if (same < ODDS_MIN_STRETCHES) return null;
  }
  let s = 0;
  let s2 = 0;
  let c = 0;
  for (const t of ts) {
    const x = values[t];
    if (isFinite(x)) {
      s += x;
      s2 += x * x;
      c += 1;
    }
  }
  if (c < ODDS_MIN_STRETCHES) return null;
  const sd = Math.sqrt(Math.max(0, s2 / c - (s / c) ** 2));
  if (!(sd > 0)) return null;
  // A discrete state (the Markov candidate) weighs the past by match alone
  if (discrete) return ts.map((t) => (values[t] === now ? 1 : 0));
  const width = ODDS_STATE_WIDTH * sd;
  return ts.map((t) => {
    const x = values[t];
    return isFinite(x) ? Math.exp(-0.5 * ((x - now) / width) ** 2) : 0;
  });
};

/* One column's distribution: `hMs` ahead of bar `end`, from the `lookback`
 * bars before it. Returns { cdf(x): P(ln(S_T/S_now) <= x), k, stretches, n }
 * or null where the look-back cannot carry the horizon.
 *
 * `opts.model`: "fhs" (the product), "gauss" and "raw" (the study's baselines).
 * `opts.state`: { values, now } — a conditioning state, the study's family. */
const oddsColumn = (prep, hMs, opts = {}) => {
  if (!prep || !(hMs > 0)) return null;
  const end = Number.isInteger(opts.end) ? opts.end : prep.n - 1;
  const lookback = opts.lookback > 0 ? opts.lookback : ODDS_LOOKBACK;
  const start = Math.max(1, end - lookback + 1);
  const bars = end - start + 1;
  const k = hMs / (prep.g * 1000);
  const kInt = Math.max(1, Math.round(k));
  const stretches = Math.floor(bars / kInt);
  if (bars < ODDS_MIN_BARS || stretches < ODDS_MIN_STRETCHES) return null;
  const sNow = prep.sig[end];
  if (!(sNow > 0)) return null;
  const scale = sNow * Math.sqrt(k);
  const model = opts.model || "fhs";
  if (model === "gauss") {
    return { cdf: (x) => oddsPhi(x / scale), k, stretches, n: bars };
  }
  const ts = [];
  const z = [];
  const root = Math.sqrt(kInt);
  for (let t = start; t + kInt <= end; t++) {
    const r = prep.logs[t + kInt] - prep.logs[t];
    if (model === "raw") {
      z.push(r);
      ts.push(t);
    } else if (prep.sig[t] > 0) {
      z.push(r / (prep.sig[t] * root));
      ts.push(t);
    }
  }
  let w = null;
  if (opts.state) {
    w = oddsStateWeights(opts.state.values, ts, opts.state.now, opts.state.discrete);
    if (!w) return null;
  }
  const kde = oddsKde(z, w);
  if (!kde) return null;
  if (model === "raw") {
    // The raw k*-bar returns, stretched to the fractional horizon by sqrt time
    const stretch = Math.sqrt(k / kInt);
    return { cdf: (x) => oddsKdeAt(kde, x / stretch), k, stretches, n: z.length };
  }
  // With a state's weights the sample is only as large as the bars it keeps
  return { cdf: (x) => oddsKdeAt(kde, x / scale), k, stretches, n: w ? Math.round(kde.nEff) : z.length };
};

// The chance a column gives the band [lo, hi] from the price now
const oddsBand = (column, sNow, lo, hi) => {
  if (!column || !(sNow > 0) || !(hi > lo)) return NaN;
  const a = lo > 0 ? column.cdf(Math.log(lo / sNow)) : 0;
  const b = column.cdf(Math.log(hi / sNow));
  return Math.max(0, b - a);
};

/* The study's conditioning states, one number per bar, each from bars up to
   and including that one. */
const oddsTrendState = (prep, bars = 20) => {
  const out = new Float64Array(prep.n).fill(NaN);
  for (let t = bars; t < prep.n; t++) {
    const s = prep.sig[t];
    if (s > 0) out[t] = (prep.logs[t] - prep.logs[t - bars]) / (s * Math.sqrt(bars));
  }
  return out;
};

const oddsPositionState = (high, low, close, bars = 100) => {
  const n = close.length;
  const out = new Float64Array(n).fill(NaN);
  for (let t = bars - 1; t < n; t++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = t - bars + 1; i <= t; i++) {
      if (high[i] > hi) hi = high[i];
      if (low[i] < lo) lo = low[i];
    }
    if (hi > lo) out[t] = (close[t] - lo) / (hi - lo);
  }
  return out;
};

const oddsVolumeState = (volume, bars = 20) => {
  const n = volume.length;
  const out = new Float64Array(n).fill(NaN);
  for (let t = bars; t < n; t++) {
    const past = Array.prototype.slice.call(volume, t - bars, t).sort((a, b) => a - b);
    const med = past[Math.floor(bars / 2)];
    if (med > 0 && volume[t] > 0) out[t] = Math.log(volume[t] / med);
  }
  return out;
};

/* The Markov candidate (addendum to the preregistration): the state the last
   square's worth of time left the price in — rising, flat or falling by its
   move over one span in its own volatility, split at the normal's terciles
   (±0.43) so the three states are equally common under no dependence. The
   regime grid's question (regimes-prereg.md), asked on the board's clock. */
const ODDS_MARKOV_CUT = 0.43;
const oddsMarkovState = (prep, spanBars) => {
  const out = new Float64Array(prep.n).fill(NaN);
  const k = Math.max(1, Math.round(spanBars));
  for (let t = k; t < prep.n; t++) {
    const s = prep.sig[t];
    if (!(s > 0)) continue;
    const z = (prep.logs[t] - prep.logs[t - k]) / (s * Math.sqrt(k));
    out[t] = z > ODDS_MARKOV_CUT ? 1 : z < -ODDS_MARKOV_CUT ? -1 : 0;
  }
  return out;
};

/* What the study found, per board range (docs/internal/research/
   cell-odds-results-*.md): whether the chances were calibrated out of sample
   (the preregistered rule: ECE ≤ 2 points, no bin of 300+ squares off by more
   than 5), and the calibration bins the readout quotes — [from, to, given,
   happened, n], pooled over BTC, ETH, SOL and XRP — from the run of
   30 Sep 2026 (cell-odds-results-2026-09-30.md). ALL failed the rule
   (ECE 2.5 points on 115 origins) and draws no chance; none of the metrics
   weighed — trend, position, volume, the Markov state — improved the score,
   so none is used. */
const CELL_ODDS_MEASURED = {
  hour: { pass: true, ece: 0.0019, origins: 4732, bins: [[0, 0.01, 0.0035, 0.0043, 113206],[0.01, 0.025, 0.0174, 0.0187, 88068],[0.025, 0.05, 0.0375, 0.0385, 162460],[0.05, 0.1, 0.0718, 0.0747, 202236],[0.1, 0.2, 0.1366, 0.1340, 133713],[0.2, 0.35, 0.2501, 0.2511, 31310],[0.35, 0.5, 0.4072, 0.3984, 5035],[0.5, 1, 0.6084, 0.6104, 1735]] },
  day: { pass: true, ece: 0.0037, origins: 4748, bins: [[0, 0.01, 0.0039, 0.0069, 91584],[0.01, 0.025, 0.0177, 0.0220, 102871],[0.025, 0.05, 0.0370, 0.0409, 185006],[0.05, 0.1, 0.0714, 0.0736, 207635],[0.1, 0.2, 0.1357, 0.1333, 117782],[0.2, 0.35, 0.2521, 0.2390, 27490],[0.35, 0.5, 0.4089, 0.3900, 5080],[0.5, 1, 0.6298, 0.6035, 2252]] },
  week: { pass: true, ece: 0.0041, origins: 4656, bins: [[0, 0.01, 0.0034, 0.0061, 93750],[0.01, 0.025, 0.0173, 0.0190, 75933],[0.025, 0.05, 0.0367, 0.0393, 104265],[0.05, 0.1, 0.0718, 0.0775, 111851],[0.1, 0.2, 0.1394, 0.1401, 83782],[0.2, 0.35, 0.2531, 0.2346, 26919],[0.35, 0.5, 0.4081, 0.3827, 5168],[0.5, 1, 0.6432, 0.6153, 2498]] },
  month: { pass: true, ece: 0.0038, origins: 2973, bins: [[0, 0.01, 0.0037, 0.0095, 65173],[0.01, 0.025, 0.0177, 0.0219, 89147],[0.025, 0.05, 0.0363, 0.0375, 137091],[0.05, 0.1, 0.0697, 0.0667, 99990],[0.1, 0.2, 0.1366, 0.1296, 49365],[0.2, 0.35, 0.2541, 0.2480, 14695],[0.35, 0.5, 0.4089, 0.3823, 3081],[0.5, 1, 0.6535, 0.6510, 1814]] },
  year: { pass: true, ece: 0.0097, origins: 344, bins: [[0, 0.01, 0.0011, 0.0162, 2411],[0.01, 0.025, 0.0187, 0.0230, 1525],[0.025, 0.05, 0.0365, 0.0444, 2880],[0.05, 0.1, 0.0689, 0.0716, 2011],[0.1, 0.2, 0.1357, 0.1168, 856],[0.2, 0.35, 0.2519, 0.2266, 203],[0.35, 0.5, 0.4169, 0.3784, 74],[0.5, 1, 0.7956, 0.8182, 77]] },
  all: { pass: false, ece: 0.0252, origins: 115, bins: [[0, 0.01, 0.0012, 0.0190, 686],[0.01, 0.025, 0.0167, 0.0336, 119],[0.025, 0.05, 0.0352, 0.0397, 151],[0.05, 0.1, 0.0702, 0.1119, 143],[0.1, 0.2, 0.1414, 0.1382, 123],[0.2, 0.35, 0.2651, 0.1867, 75],[0.35, 0.5, 0.4068, 0.5172, 29],[0.5, 1, 0.7891, 0.6842, 38]] },
};
