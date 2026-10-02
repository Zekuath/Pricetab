/* ---- the outlook — what the market's own history says about the next
 *      stretch, counted, before there is a contract ----------------------
 *
 * Every reading here is a **count with its denominator and its window**, and
 * none of them says which way. That is the rule of `baserates.js` and of the
 * derivatives page, and it is the only honest form a "forecast" can take on a
 * public price feed: the future is a distribution, the distribution is
 * estimated from the past that is on the screen, and the screen says how much
 * past that was.
 *
 * Pure. No React, no `this`, no `Date.now`, no `Math.random` — the cone is
 * seeded (`outlookRng`) so a test can replay it. Series rows are the app's
 * own: `{ price, time, vol? }` (`vol` only on the perpetual's candles).
 *
 * The research behind each function is
 * `docs/product/derivatives-simulator/PRE_TRADE_OUTLOOK.md`; the reasoning
 * that survived is in `docs/internal/ref/practice.md`.
 */

const OUTLOOK_MIN_BARS = 30;
const OUTLOOK_PATHS = 2000;
const OUTLOOK_BLOCK = 8;
/* A location state is read against the value area of the bars *before* it —
   never against the whole window, or every early bar would know where the
   later ones traded. 96 bars is four hours of the minute chart and four days
   of the hourly one; the window is named on screen with the reading. */
const OUTLOOK_LOCATION_WINDOW = 96;
/* PageRank's random jump, so a row the window never visited is not a trap
   and no transition is exactly zero. */
const OUTLOOK_DAMPING = 0.15;
const OUTLOOK_STATES = ["below", "inside", "above"];
/* Realised-volatility windows: the last 24 bars against the 96 before them. */
const OUTLOOK_VOL_SHORT = 24;
const OUTLOOK_VOL_LONG = 96;

/* mulberry32 — the same generator the practice model uses, restated so this
   file has no dependency on it. */
const outlookRng = (seed) => {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const outlookReturns = (series) => {
  const out = [];
  if (!Array.isArray(series)) return out;
  for (let i = 1; i < series.length; i += 1) {
    const a = Number(series[i - 1] && series[i - 1].price);
    const b = Number(series[i] && series[i].price);
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
};

const outlookQuantile = (sorted, f) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(f * sorted.length)))] : null;

const outlookSd = (list) => {
  if (list.length < 2) return null;
  const mean = list.reduce((a, b) => a + b, 0) / list.length;
  let s = 0;
  for (const v of list) s += (v - mean) * (v - mean);
  return Math.sqrt(s / (list.length - 1));
};

/* **The value area of a set of bars** — forty price bins, the fullest is the
   point of control, and the area grows from it towards the fuller neighbour
   until it holds 70% of the volume. Without volume every bar weighs one, and
   the area is where the price *spent its time*, which is the same idea with
   a different weight and is said so on screen. */
const outlookValueArea = (rows, share = 0.7) => {
  if (!Array.isArray(rows) || rows.length < 10) return null;
  const ok = rows.filter((p) => p && isFinite(p.price) && p.price > 0);
  if (ok.length < 10) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of ok) {
    if (p.price < lo) lo = p.price;
    if (p.price > hi) hi = p.price;
  }
  if (!(hi > lo)) return null;
  const bins = 40;
  const step = (hi - lo) / bins;
  const vol = new Array(bins).fill(0);
  let total = 0;
  let weighted = false;
  for (const p of ok) {
    const w = isFinite(p.vol) && p.vol > 0 ? p.vol : 1;
    if (w !== 1) weighted = true;
    const i = Math.min(bins - 1, Math.floor((p.price - lo) / step));
    vol[i] += w;
    total += w;
  }
  let poc = 0;
  for (let i = 1; i < bins; i += 1) if (vol[i] > vol[poc]) poc = i;
  let a = poc;
  let b = poc;
  let held = vol[poc];
  while (held < total * share && (a > 0 || b < bins - 1)) {
    const up = b < bins - 1 ? vol[b + 1] : -1;
    const down = a > 0 ? vol[a - 1] : -1;
    if (up >= down) {
      b += 1;
      held += vol[b];
    } else {
      a -= 1;
      held += vol[a];
    }
  }
  const mid = (i) => lo + (i + 0.5) * step;
  return { poc: mid(poc), vah: lo + (b + 1) * step, val: lo + a * step, share: held / total, bins, total, weighted };
};

/* **Where each bar sat against the bars before it.** `null` until there is
   a window behind the bar. The last entry is where the market is now. */
const outlookLocationStates = (series, window = OUTLOOK_LOCATION_WINDOW) => {
  const out = [];
  if (!Array.isArray(series)) return out;
  for (let i = 0; i < series.length; i += 1) {
    if (i < window) {
      out.push(null);
      continue;
    }
    const area = outlookValueArea(series.slice(i - window, i));
    const p = Number(series[i] && series[i].price);
    if (!area || !(p > 0)) {
      out.push(null);
      continue;
    }
    out.push(p < area.val ? "below" : p > area.vah ? "above" : "inside");
  }
  return out;
};

/* **The chain.** Transitions counted bar to bar, one row per state, then
   damped the way PageRank damps: each row mixed with the marginal so no cell
   is zero. A row seen fewer than `minRow` times keeps its counts and refuses
   its probabilities — the base-rate panel's rule. `ahead` is the damped
   matrix raised to that many steps, which is what Markov's convergence gives
   a trader: from here, where does the walk tend to be after k bars. */
const outlookChain = (states, options) => {
  const o = options || {};
  const minRow = o.minRow > 0 ? o.minRow : 12;
  const damping = o.damping >= 0 && o.damping < 1 ? o.damping : OUTLOOK_DAMPING;
  const ahead = o.ahead > 0 ? o.ahead : 6;
  const S = OUTLOOK_STATES;
  const idx = (s) => S.indexOf(s);
  const counts = S.map(() => S.map(() => 0));
  const seen = S.map(() => 0);
  let n = 0;
  for (let i = 1; i < states.length; i += 1) {
    const a = idx(states[i - 1]);
    const b = idx(states[i]);
    if (a < 0 || b < 0) continue;
    counts[a][b] += 1;
    seen[b] += 1;
    n += 1;
  }
  const current = states.length ? states[states.length - 1] : null;
  if (!n || idx(current) < 0) return { n, current, rows: null, next: null, ahead: null, steps: ahead };
  const marginal = S.map((s, j) => seen[j] / n);
  const rowN = counts.map((r) => r.reduce((a, b) => a + b, 0));
  const P = counts.map((r, i) =>
    S.map((s, j) => {
      const raw = rowN[i] ? r[j] / rowN[i] : marginal[j];
      return (1 - damping) * raw + damping * marginal[j];
    }),
  );
  const rows = {};
  S.forEach((s, i) => {
    rows[s] = { n: rowN[i], to: {}, p: rowN[i] >= minRow ? {} : null };
    S.forEach((t, j) => {
      rows[s].to[t] = counts[i][j];
      if (rows[s].p) rows[s].p[t] = P[i][j];
    });
  });
  /* k steps ahead from the current state: one row vector through the matrix. */
  let v = S.map((s) => (s === current ? 1 : 0));
  for (let k = 0; k < ahead; k += 1) {
    v = S.map((t, j) => S.reduce((sum, s, i) => sum + v[i] * P[i][j], 0));
  }
  const cur = rows[current];
  return {
    n,
    current,
    rows,
    next: cur && cur.p ? { n: cur.n, p: cur.p, to: cur.to } : { n: cur ? cur.n : 0, p: null, to: cur ? cur.to : null },
    ahead: cur && cur.p ? S.reduce((acc, s, i) => ({ ...acc, [s]: v[i] }), {}) : null,
    steps: ahead,
    damping,
    minRow,
  };
};

/* **What followed the last times the market entered this state.** Episodes,
   never bars — the same `baseRateFor` the base-rate panel runs on, with the
   window's own bars as the closes. `edge` is null below
   `BASE_RATE_MIN_EPISODES`, and the caller prints the count instead. */
const outlookEpisodes = (series, states, horizon) => {
  if (typeof baseRateFor !== "function" || !Array.isArray(series) || !states.length) return null;
  const current = states[states.length - 1];
  if (!current) return null;
  const closes = series.map((p) => Number(p && p.price));
  const result = baseRateFor(closes, states, (s) => s === current, horizon);
  return result ? { ...result, state: current, horizon } : null;
};

/* **Horizons in bars**, from the spacing of the series' own timestamps: the
   targets are seconds, the answer is how many bars that is, and a horizon
   longer than half the window is refused — it would be resampled from fewer
   blocks than it has bars. */
const outlookHorizonBars = (series, targets) => {
  if (!Array.isArray(series) || series.length < 3) return [];
  const t = (p) => {
    const v = p && p.time;
    return v instanceof Date ? v.getTime() / 1000 : Number(v) > 1e11 ? Number(v) / 1000 : Number(v);
  };
  const a = t(series[0]);
  const b = t(series[series.length - 1]);
  if (!(b > a)) return [];
  const step = (b - a) / (series.length - 1);
  return (targets || [])
    .map((tg) => ({ label: tg.label, seconds: tg.seconds, bars: Math.round(tg.seconds / step) }))
    .filter((h) => h.bars >= 1 && h.bars <= Math.floor((series.length - 1) / 2));
};

/* **The cone before a contract.** Block bootstrap of the window's own
   log-returns from the last price, `paths` times, and at each horizon the
   quantiles of where the price landed and the share of paths that landed
   above the start. With `states` given, blocks are drawn only from bars that
   were in the current location state — the Markov conditioning — when at
   least `OUTLOOK_MIN_BARS` of them exist; otherwise from the whole window,
   and `conditioned` says which. Prices are in the series' own units. */
const outlookCone = (series, options) => {
  const o = options || {};
  const returns = outlookReturns(series);
  const start = Number(o.from) > 0 ? Number(o.from) : Number(series && series.length ? series[series.length - 1].price : 0);
  const horizons = (o.horizons || []).filter((h) => h > 0).map((h) => Math.round(h));
  const paths = o.paths > 0 ? Math.min(o.paths, 20000) : OUTLOOK_PATHS;
  const block = o.block > 0 ? o.block : OUTLOOK_BLOCK;
  if (returns.length < OUTLOOK_MIN_BARS || !(start > 0) || !horizons.length) {
    return { n: 0, paths: 0, bars: returns.length, conditioned: false, horizons: [] };
  }
  /* Starts a block may begin at. Conditioned: the bar *after* each bar in
     the current state, so the block is what followed being here. */
  let starts = null;
  const states = Array.isArray(o.states) ? o.states : null;
  const current = states && states.length ? states[states.length - 1] : null;
  if (states && current) {
    starts = [];
    for (let i = 0; i < returns.length; i += 1) if (states[i] === current) starts.push(i);
    if (starts.length < OUTLOOK_MIN_BARS) starts = null;
  }
  const conditioned = Boolean(starts);
  const rng = outlookRng(o.seed == null ? 20260921 : o.seed);
  const longest = Math.max(...horizons);
  const landed = horizons.map(() => []);
  for (let p = 0; p < paths; p += 1) {
    let price = start;
    let i = 0;
    while (i < longest) {
      const at = starts ? starts[Math.floor(rng() * starts.length)] : Math.floor(rng() * returns.length);
      for (let k = 0; k < block && i < longest; k += 1, i += 1) {
        price *= Math.exp(returns[(at + k) % returns.length]);
        const hi = horizons.indexOf(i + 1);
        if (hi >= 0) landed[hi].push(price);
      }
    }
  }
  return {
    n: paths,
    paths,
    bars: returns.length,
    block,
    conditioned,
    state: conditioned ? current : null,
    starts: starts ? starts.length : returns.length,
    from: start,
    horizons: horizons.map((h, hi) => {
      const s = landed[hi].slice().sort((a, b) => a - b);
      const up = s.filter((v) => v > start).length;
      return {
        bars: h,
        p5: outlookQuantile(s, 0.05),
        p25: outlookQuantile(s, 0.25),
        p50: outlookQuantile(s, 0.5),
        p75: outlookQuantile(s, 0.75),
        p95: outlookQuantile(s, 0.95),
        up,
        n: s.length,
      };
    }),
  };
};

/* **The volatility regime, without options.** The last `short` bars'
   realised volatility against the `long` before them (a ratio — expanding
   above 1.3, contracting under 0.7, and the thresholds are printed, not
   hidden), where that short-window figure ranks among every short window in
   the range (a percentile with its n), and the lag-1 autocorrelation of the
   window's returns — negative is the damped regime the champion reads off
   GEX, where breakouts fail; positive is the amplified one. */
const outlookVolRegime = (series, options) => {
  const o = options || {};
  const short = o.short > 0 ? o.short : OUTLOOK_VOL_SHORT;
  const long = o.long > 0 ? o.long : OUTLOOK_VOL_LONG;
  const r = outlookReturns(series);
  if (r.length < short + 2) return null;
  const recent = outlookSd(r.slice(-short));
  const before = r.length >= short + long ? outlookSd(r.slice(-short - long, -short)) : outlookSd(r.slice(0, -short));
  const rolling = [];
  for (let i = short; i <= r.length; i += 1) rolling.push(outlookSd(r.slice(i - short, i)));
  const below = rolling.filter((v) => v < recent).length;
  let num = 0;
  let den = 0;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  for (let i = 0; i < r.length; i += 1) {
    den += (r[i] - mean) * (r[i] - mean);
    if (i > 0) num += (r[i] - mean) * (r[i - 1] - mean);
  }
  const ac1 = den > 0 ? num / den : null;
  const ratio = before > 0 ? recent / before : null;
  return {
    short,
    long,
    recent,
    before,
    ratio,
    regime: ratio == null ? null : ratio > 1.3 ? "expanding" : ratio < 0.7 ? "contracting" : "steady",
    pct: rolling.length ? below / rolling.length : null,
    windows: rolling.length,
    ac1,
    n: r.length,
  };
};

/* **Participation** — this bar's volume against every bar in the window, as
   a percentile with its n. Null without volume. */
const outlookParticipation = (series) => {
  if (!Array.isArray(series) || series.length < 10) return null;
  const vols = series.map((p) => (p && isFinite(p.vol) && p.vol > 0 ? p.vol : null)).filter((v) => v != null);
  if (vols.length < 10 || vols.length !== series.length) return null;
  const last = vols[vols.length - 1];
  const below = vols.filter((v) => v < last).length;
  const sorted = vols.slice().sort((a, b) => a - b);
  return { last, pct: below / vols.length, median: outlookQuantile(sorted, 0.5), n: vols.length };
};

/* **The setup, as codes.** The champion's four gates — environment,
   location, confirmation, management — each read off the facts on hand and
   written as a short code that can be stamped on a contract and counted
   later. Nothing here is a verdict: `loc:below` is where the price is, not
   whether that is good. Absent facts leave no code. */
const outlookSetupCodes = (facts) => {
  const f = facts || {};
  const codes = [];
  if (f.vol && f.vol.regime) codes.push(`env:${f.vol.regime}`);
  if (f.vol && f.vol.ac1 != null) codes.push(f.vol.ac1 < -0.05 ? "env:damped" : f.vol.ac1 > 0.05 ? "env:amplified" : "env:neutral");
  if (f.location) codes.push(`loc:${f.location}`);
  if (f.tape && isFinite(f.tape.buyers)) codes.push(f.tape.buyers > 0.6 ? "tape:buyers" : f.tape.buyers < 0.4 ? "tape:sellers" : "tape:even");
  if (f.book && isFinite(f.book.bidShare)) codes.push(f.book.bidShare > 0.6 ? "book:bids" : f.book.bidShare < 0.4 ? "book:asks" : "book:even");
  if (f.stop != null) codes.push(f.stop ? "mgmt:stop" : "mgmt:nostop");
  if (f.withinPlan != null) codes.push(f.withinPlan ? "mgmt:inplan" : "mgmt:overplan");
  return codes;
};

/* **Your own record, by setup.** For every code, the closed contracts that
   carried it against the ones that did not: count, wins, mean R. That is
   the trader's *personal* base rate — "how do my contracts do when the tape
   was buying" — and it is the one thing no shared statistic can give. Rows
   under `min` keep their counts and refuse the mean. */
const outlookBySetup = (rows, min = 5) => {
  const out = {};
  const list = Array.isArray(rows) ? rows.filter((e) => e && Array.isArray(e.setup)) : [];
  const codes = new Set();
  for (const e of list) for (const c of e.setup) codes.add(c);
  const tally = (subset) => {
    const wins = subset.filter((e) => e.realised > 0).length;
    const rs = subset.map((e) => (e.risk > 0 ? e.realised / e.risk : null)).filter((r) => r != null);
    return {
      n: subset.length,
      wins,
      avgR: subset.length >= min && rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      rN: rs.length,
    };
  };
  for (const c of codes) {
    out[c] = { with: tally(list.filter((e) => e.setup.includes(c))), without: tally(list.filter((e) => !e.setup.includes(c))) };
  }
  return { n: list.length, codes: out };
};
