/* THE MODEL OUTLOOK — the next hour of BTC-USD, as a model estimates it
 * (1 Oct 2026)
 *
 * A *model estimate*, kept apart from everything counted elsewhere in the app
 * (outlook.js replays, cell-odds.js, the base rates): a conditional
 * distribution of the next completed hour's log return,
 *
 *   ln(S(T1) / S0) = sigma * Z,   sigma² from the package's variance rule,
 *
 * Z Normal or standardized (unit-variance) Student-t. The rule and its
 * parameters were fitted and evaluated offline (scripts/outlook/, the
 * preregistration docs/internal/research/model-outlook-prereg.md) and arrive
 * as the bundled package `OUTLOOK_MODEL` (outlook-model.js, generated). This
 * file only replays completed bars through that rule — deterministic, no
 * fitting, no clock: `now` is always passed in.
 *
 * Definitions held here, because the UI must not drift from them:
 *  - a bar is the UTC hour starting at its time; its price is the close;
 *  - the origin T0 is the end of the last *completed* bar, S0 its close, the
 *    target T1 = T0 + 1h; a forecast keeps its T0 and S0 when read later;
 *  - probabilities are **terminal** (the close at T1 above K), never touch;
 *  - the median is the median, not an expected price.
 *
 * Pure: no DOM, no request, no storage. Loads before chart.js. */

const MODEL_OUTLOOK_HOUR = 3600e3;
const MODEL_OUTLOOK_RECORDS_MAX = 720; // a month of hourly forecasts
const MODEL_OUTLOOK_P = [0.1, 0.5, 0.9];

/* ── the standardized Student-t, and the Normal ── */
const moLgamma = (x) => {
  // Lanczos (g = 7, n = 9); |error| < 1e-13 on x > 0.5
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - moLgamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
};

const moBetacf = (a, b, x) => {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  d = 1 / (Math.abs(d) > tiny ? d : tiny);
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    d = 1 / (Math.abs(d) > tiny ? d : tiny);
    c = 1 + aa / c;
    c = Math.abs(c) > tiny ? c : tiny;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    d = 1 / (Math.abs(d) > tiny ? d : tiny);
    c = 1 + aa / c;
    c = Math.abs(c) > tiny ? c : tiny;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) return h;
  }
  return NaN;
};

const moBetainc = (a, b, x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(moLgamma(a + b) - moLgamma(a) - moLgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * moBetacf(a, b, x)) / a : 1 - (front * moBetacf(b, a, 1 - x)) / b;
};

// Ordinary t CDF; the centre from I(1/2, nu/2) where the tail form loses digits
const moTCdf = (x, nu) => {
  const x2 = x * x;
  if (x2 < nu) {
    const half = 0.5 * moBetainc(0.5, nu / 2, x2 / (nu + x2));
    return x > 0 ? 0.5 + half : 0.5 - half;
  }
  const tail = 0.5 * moBetainc(nu / 2, 0.5, nu / (nu + x2));
  return x > 0 ? 1 - tail : tail;
};

// The ordinary-t scale that gives unit variance — kept apart from the t itself
const moStdTScale = (nu) => Math.sqrt((nu - 2) / nu);
const moStdTCdf = (z, nu) => moTCdf(z / moStdTScale(nu), nu);

// erf by Abramowitz & Stegun 7.1.26 is 1.5e-7; the Normal here uses the
// complementary error function's continued fraction through the gamma
// function instead: Φ(z) = ½·erfc(−z/√2), erfc via the incomplete gamma.
const moNormCdf = (z) => {
  const x = Math.abs(z) / Math.SQRT2;
  // erfc(x) = Γ(½, x²)/√π; series/continued fraction of the incomplete gamma
  let erfc;
  if (x < 2) {
    // erf series: 2/√π Σ (−1)^n x^(2n+1) / (n! (2n+1))
    let sum = 0;
    let term = x;
    for (let n = 0; n < 200; n++) {
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17) break;
      term *= (-x * x) / (n + 1);
    }
    erfc = 1 - (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    // Γ(½, x²) by Lentz's continued fraction
    const a = 0.5;
    const s = x * x;
    let b = s + 1 - a;
    let c = 1 / 1e-300;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 300; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      d = 1 / (Math.abs(d) > 1e-300 ? d : 1e-300);
      c = b + an / c;
      c = Math.abs(c) > 1e-300 ? c : 1e-300;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    erfc = (Math.exp(-s + a * Math.log(s)) * h) / Math.sqrt(Math.PI);
  }
  return z >= 0 ? 1 - erfc / 2 : erfc / 2;
};

const moZCdf = (dist, z, nu) => (dist === "t" ? moStdTCdf(z, nu) : moNormCdf(z));

// Quantile by bisection on the CDF: slow-ish, exact to 1e-12, called a few times an hour
const moZPpf = (dist, p, nu) => {
  if (!(p > 0 && p < 1)) return NaN;
  let lo = -60;
  let hi = 60;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (moZCdf(dist, mid, nu) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/* ── the variance rule ── */
/* The conditional variance of the return *after* the last one in `r`, from a
   start `v0`. One function for the three rules the package may name. */
const moNextVariance = (pkg, r, v0) => {
  const p = pkg.params;
  if (pkg.method === "rolling") {
    const w = p.window;
    if (r.length < w) return NaN;
    let s = 0;
    for (let i = r.length - w; i < r.length; i++) s += r[i] * r[i];
    return s / w;
  }
  let v = v0;
  if (pkg.method === "ewma") {
    for (const x of r) v = p.lambda * v + (1 - p.lambda) * x * x;
    return v;
  }
  for (const x of r) v = p.omega + p.alpha * x * x + p.beta * v;
  return v;
};

/* The package is data from the repository; it is still checked before use,
   because a hand-edited or half-generated file must not produce numbers. */
const moPackageValid = (pkg) => {
  if (!pkg || pkg.schema !== "pricetab.outlook.model/1") return false;
  const p = pkg.params || {};
  if (pkg.dist === "t" && !(p.nu > 2.05 && p.nu <= 500)) return false;
  if (pkg.method === "garch") return p.omega > 0 && p.alpha >= 0 && p.beta >= 0 && p.alpha + p.beta < 1;
  if (pkg.method === "ewma") return p.lambda > 0 && p.lambda < 1;
  if (pkg.method === "rolling") return Number.isInteger(p.window) && p.window > 1;
  return false;
};

/* Completed bars → `{ times, closes, filled }`, one per whole hour, the
   newest at most `now − 1h` old. `bars` are `{ time (ms), close }` in any
   order, duplicated or gappy; the hour still forming is dropped. */
const moCompletedBars = (bars, now) => {
  const byT = new Map();
  for (const b of Array.isArray(bars) ? bars : []) {
    const t = Number(b && b.time);
    const c = Number(b && b.close);
    if (!(t % MODEL_OUTLOOK_HOUR === 0) || !(c > 0) || t + MODEL_OUTLOOK_HOUR > now) continue;
    byT.set(t, c);
  }
  const ts = [...byT.keys()].sort((a, b) => a - b);
  const times = [];
  const closes = [];
  const filled = [];
  let longest = 0;
  let run = 0;
  for (let t = ts[0], prev = null; ts.length && t <= ts[ts.length - 1]; t += MODEL_OUTLOOK_HOUR) {
    if (byT.has(t)) {
      prev = byT.get(t);
      run = 0;
      filled.push(false);
    } else {
      run += 1;
      longest = Math.max(longest, run);
      filled.push(true);
    }
    times.push(t);
    closes.push(prev);
  }
  return { times, closes, filled, longest };
};

/* **The forecast for the next completed hour**, or a reason there is none:
   `{ state, ... }` with state "estimate" | "insufficient" | "stale" |
   "unavailable" | "invalid". `targetPrice` is optional. */
const modelOutlookForecast = (pkg, bars, now, targetPrice) => {
  if (!moPackageValid(pkg)) return { state: "invalid" };
  const rules = pkg.validity || {};
  const { times, closes, filled } = moCompletedBars(bars, now);
  if (times.length < (rules.minBars || 500)) return { state: "insufficient", have: times.length };
  const last = times[times.length - 1];
  const origin = last + MODEL_OUTLOOK_HOUR;
  if (now - origin > (rules.maxAgeMs || 2 * MODEL_OUTLOOK_HOUR)) return { state: "stale", origin };
  // A long hole recently: the variance would be read off filled hours
  const recent = filled.slice(-(rules.gapRecoveryBars || 48));
  let run = 0;
  for (const f of recent) {
    run = f ? run + 1 : 0;
    if (run > (rules.maxGapBars || 6)) return { state: "insufficient", origin, gap: true };
  }
  const r = [];
  for (let i = 1; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  // The variance's start: the checkpoint when it lies inside the bars,
  // otherwise the unconditional variance and a burn-in over everything here
  let v0;
  let from = 0;
  const cp = pkg.checkpoint;
  // r[k] is the return of bar k+1, so from the checkpoint bar i the replay
  // starts at r[i] — the first bar after it
  const at = cp && cp.v > 0 ? times.indexOf(cp.time) : -1;
  if (pkg.method !== "rolling" && at >= 0) {
    v0 = cp.v;
    from = at;
  } else if (pkg.method === "garch") {
    v0 = pkg.params.omega / (1 - pkg.params.alpha - pkg.params.beta);
  } else if (pkg.method === "ewma") {
    // No checkpoint in reach: the head's own variance, burnt in over the rest
    const head = r.slice(0, Math.min(500, r.length));
    v0 = head.reduce((s, x) => s + x * x, 0) / head.length;
  }
  const v = moNextVariance(pkg, from ? r.slice(from) : r, v0);
  if (!(v > 0) || !Number.isFinite(v)) return { state: "invalid" };
  const sigma = Math.sqrt(v);
  const s0 = closes[closes.length - 1];
  const nu = pkg.params.nu;
  const q = {};
  for (const p of MODEL_OUTLOOK_P) q[p] = s0 * Math.exp(sigma * moZPpf(pkg.dist, p, nu));
  const out = {
    state: "estimate",
    origin,
    target: origin + MODEL_OUTLOOK_HOUR,
    s0,
    sigma,
    median: q[0.5],
    lo: q[0.1],
    hi: q[0.9],
    model: pkg.id,
  };
  if (targetPrice > 0) {
    out.targetPrice = targetPrice;
    out.pAbove = modelOutlookPAbove(pkg, sigma, s0, targetPrice);
  }
  return out;
};

// P(S(T1) > K) = 1 − F(ln(K / S0)) — terminal, not touch
const modelOutlookPAbove = (pkg, sigma, s0, k) => {
  if (!(sigma > 0) || !(s0 > 0) || !(k > 0)) return NaN;
  const p = 1 - moZCdf(pkg.dist, Math.log(k / s0) / sigma, pkg.params.nu);
  return Math.min(1, Math.max(0, p));
};

/* ── the record: forecasts written before their outcome ── */
/* One record per origin hour, so several tabs write the same one; a record is
   never edited after it is written. */
const modelOutlookRecord = (f, source) =>
  f && f.state === "estimate"
    ? {
        id: `${f.model}|${f.origin}`,
        model: f.model,
        source,
        origin: f.origin,
        target: f.target,
        s0: f.s0,
        lo: f.lo,
        median: f.median,
        hi: f.hi,
        ...(f.targetPrice > 0 ? { targetPrice: f.targetPrice, pAbove: f.pAbove } : {}),
      }
    : null;

const modelOutlookAppend = (records, rec) => {
  const list = Array.isArray(records) ? records : [];
  if (!rec || list.some((r) => r.id === rec.id)) return list;
  return [...list, rec].slice(-MODEL_OUTLOOK_RECORDS_MAX);
};

/* Outcomes for records whose target bar has completed, from the same bars:
   `{ [id]: { close, inside, above? } }`, only for ids not already settled.
   Kept in their own map so the forecast itself is never rewritten. */
const modelOutlookSettle = (records, outcomes, bars, now) => {
  const settled = { ...(outcomes || {}) };
  const { times, closes, filled } = moCompletedBars(bars, now);
  const at = new Map(times.map((t, i) => [t, i]));
  let changed = false;
  for (const rec of Array.isArray(records) ? records : []) {
    if (settled[rec.id]) continue;
    const i = at.get(rec.target - MODEL_OUTLOOK_HOUR); // the bar ending at the target
    if (i === undefined) continue;
    if (filled[i]) {
      settled[rec.id] = { none: true }; // no trade in the target hour: not scored
    } else {
      const close = closes[i];
      settled[rec.id] = {
        close,
        inside: close >= rec.lo && close <= rec.hi,
        ...(rec.targetPrice > 0 ? { above: close > rec.targetPrice } : {}),
      };
    }
    changed = true;
  }
  return changed ? settled : outcomes || {};
};

// How the local record has done: scored forecasts and how many fell inside
const modelOutlookTally = (records, outcomes) => {
  let n = 0;
  let inside = 0;
  for (const rec of Array.isArray(records) ? records : []) {
    const o = outcomes && outcomes[rec.id];
    if (!o || o.none) continue;
    n += 1;
    if (o.inside) inside += 1;
  }
  return { n, inside };
};
