/* MORE READINGS — divergences, Ichimoku, stochastic, Fibonacci, pivots,
 * all-time highs, streaks, the Mayer multiple, quiet days.
 *
 * Asked for on 1 Oct 2026 with the swing patterns beside it: every reading a
 * charting tool offers to say "what happens next" that this app did not yet
 * count. Each is a boolean per day, entered on a close, exactly the shape of
 * `strategySetupStates` — so the chart companion names it where it happened
 * and the base-rate screen lists it with the same two numbers. The rules and
 * their parameters are the textbook defaults, written down before a single
 * one was computed on real candles (`docs/internal/research/
 * companions-prereg.md`, group 2); the result of counting them decides what
 * the screen may say about them, not the other way round.
 *
 * Pure: daily candles in (`{ t, open, high, low, close }`, oldest first).
 * Loads after strategy-setups.js and price-patterns.js, whose helpers it
 * reads (`ssSma`, `ssMacd`, `pricePivotAt`).
 */

// Ten days ahead, for every reading here — the setups' own primary horizon
const READING_HORIZON = 10;

const COMPANION_READINGS = [
  { id: "rsi-bull-div", family: "divergence", kind: "up",
    title: msg("cr_rsi_bull", "RSI divergence, up"),
    what: msg("cr_rsi_bull_what", "a lower low while RSI (14) made a higher one, under 50"),
    claim: msg("cr_rsi_bull_claim", "said to mean the selling is running out") },
  { id: "rsi-bear-div", family: "divergence", kind: "down",
    title: msg("cr_rsi_bear", "RSI divergence, down"),
    what: msg("cr_rsi_bear_what", "a higher high while RSI (14) made a lower one, over 50"),
    claim: msg("cr_rsi_bear_claim", "said to mean the buying is running out") },
  { id: "macd-bull-div", family: "divergence", kind: "up",
    title: msg("cr_macd_bull", "MACD divergence, up"),
    what: msg("cr_macd_bull_what", "a lower low while the MACD line made a higher one, under zero"),
    claim: msg("cr_macd_bull_claim", "said to mark momentum turning up") },
  { id: "macd-bear-div", family: "divergence", kind: "down",
    title: msg("cr_macd_bear", "MACD divergence, down"),
    what: msg("cr_macd_bear_what", "a higher high while the MACD line made a lower one, over zero"),
    claim: msg("cr_macd_bear_claim", "said to mark momentum turning down") },
  { id: "ichi-above", family: "ichimoku", kind: "up",
    title: msg("cr_ichi_above", "Above the cloud"),
    what: msg("cr_ichi_above_what", "closed above the Ichimoku cloud (9, 26, 52)"),
    claim: msg("cr_ichi_above_claim", "said to start an uptrend") },
  { id: "ichi-below", family: "ichimoku", kind: "down",
    title: msg("cr_ichi_below", "Below the cloud"),
    what: msg("cr_ichi_below_what", "closed below the Ichimoku cloud (9, 26, 52)"),
    claim: msg("cr_ichi_below_claim", "said to start a downtrend") },
  { id: "tk-up", family: "ichimoku", kind: "up",
    title: msg("cr_tk_up", "Tenkan over kijun"),
    what: msg("cr_tk_up_what", "Ichimoku's 9-day line crossed above its 26-day line"),
    claim: msg("cr_tk_up_claim", "said to mark momentum turning up") },
  { id: "tk-down", family: "ichimoku", kind: "down",
    title: msg("cr_tk_down", "Tenkan under kijun"),
    what: msg("cr_tk_down_what", "Ichimoku's 9-day line crossed below its 26-day line"),
    claim: msg("cr_tk_down_claim", "said to mark momentum turning down") },
  { id: "stoch-up", family: "oscillator", kind: "up",
    title: msg("cr_stoch_up", "Stochastic up from under 20"),
    what: msg("cr_stoch_up_what", "slow stochastic (14, 3, 3) crossed up with both lines under 20"),
    claim: msg("cr_stoch_up_claim", "said to turn up from oversold") },
  { id: "stoch-down", family: "oscillator", kind: "down",
    title: msg("cr_stoch_down", "Stochastic down from over 80"),
    what: msg("cr_stoch_down_what", "slow stochastic (14, 3, 3) crossed down with both lines over 80"),
    claim: msg("cr_stoch_down_claim", "said to turn down from overbought") },
  { id: "fib-hold-up", family: "levels", kind: "up",
    title: msg("cr_fib_up", "Held the 61.8% retracement"),
    what: msg("cr_fib_up_what", "after a rise of 15% or more, reached its 61.8% retracement and closed above the 78.6%"),
    claim: msg("cr_fib_up_claim", "said to hold and turn back up") },
  { id: "fib-hold-down", family: "levels", kind: "down",
    title: msg("cr_fib_down", "Capped at the 61.8% retracement"),
    what: msg("cr_fib_down_what", "after a fall of 15% or more, reached its 61.8% retracement and closed under the 78.6%"),
    claim: msg("cr_fib_down_claim", "said to cap the bounce") },
  { id: "pivot-r1", family: "levels", kind: "up",
    title: msg("cr_pivot_r1", "Over last week's R1"),
    what: msg("cr_pivot_r1_what", "closed above last week's classic pivot R1"),
    claim: msg("cr_pivot_r1_claim", "said to break out of the week's range") },
  { id: "pivot-s1", family: "levels", kind: "down",
    title: msg("cr_pivot_s1", "Under last week's S1"),
    what: msg("cr_pivot_s1_what", "closed below last week's classic pivot S1"),
    claim: msg("cr_pivot_s1_claim", "said to break down out of the week's range") },
  { id: "ath", family: "levels", kind: "up",
    title: msg("cr_ath", "A new all-time high"),
    what: msg("cr_ath_what", "the highest close of the whole history"),
    claim: msg("cr_ath_claim", "said to be strength that runs on") },
  { id: "streak-up", family: "stretch", kind: "down",
    title: msg("cr_streak_up", "Five higher closes"),
    what: msg("cr_streak_up_what", "the fifth close in a row above the one before"),
    claim: msg("cr_streak_up_claim", "said to be stretched and due to turn down") },
  { id: "streak-down", family: "stretch", kind: "up",
    title: msg("cr_streak_down", "Five lower closes"),
    what: msg("cr_streak_down_what", "the fifth close in a row under the one before"),
    claim: msg("cr_streak_down_claim", "said to be stretched and due to bounce") },
  { id: "mayer-high", family: "stretch", kind: "down",
    title: msg("cr_mayer_high", "Mayer multiple over 2.4"),
    what: msg("cr_mayer_high_what", "the close 2.4 times its 200-day average or more"),
    claim: msg("cr_mayer_high_claim", "said to be overheated") },
  { id: "mayer-low", family: "stretch", kind: "up",
    title: msg("cr_mayer_low", "Mayer multiple under 0.8"),
    what: msg("cr_mayer_low_what", "the close 0.8 times its 200-day average or less"),
    claim: msg("cr_mayer_low_claim", "said to be undervalued") },
  { id: "nr7", family: "volatility", kind: "move",
    title: msg("cr_nr7", "Narrowest day of seven"),
    what: msg("cr_nr7_what", "the day's range the narrowest of the last seven"),
    claim: msg("cr_nr7_claim", "said to come before a bigger move, either way") },
  { id: "inside-day", family: "volatility", kind: "move",
    title: msg("cr_inside", "Inside day"),
    what: msg("cr_inside_what", "the day's high and low both inside the day before"),
    claim: msg("cr_inside_claim", "said to come before a bigger move, either way") },
];

/* Readings that fire every few days are named only when they are this
   recent — on the latest day or the one before. Kept to the usual
   thirty days, an inside day or a weekly pivot would always be the newest
   mark and push every rarer one off the companion's list. */
const READING_FREQUENT = ["nr7", "inside-day", "pivot-r1", "pivot-s1"];
const READING_FREQUENT_DAYS = 2;
for (const def of COMPANION_READINGS) {
  def.horizon = READING_HORIZON;
  if (READING_FREQUENT.includes(def.id)) def.recentDays = READING_FREQUENT_DAYS;
}

/* **What the count said** (companions-prereg.md, group 2, run 1 Oct 2026):
 * 21 readings on four coins, 88 tests (SOL lacks the history for the
 * all-time high), none distinguishable from an ordinary day after the
 * correction — the smallest q was 0.63. Said once wherever they are listed. */
const COMPANION_READINGS_TESTED = { tests: 88, survived: 0, minQ: 0.63 };

/* **The weekday** (group 3): the next day's direction by the weekday of the
 * close differed on ETH and LTC (q 0.013 and < 0.001) and not on BTC or SOL.
 * Printed only for a coin in this table. */
const WEEKDAY_TESTED = { BTC: 0.114, ETH: 0.013, SOL: 0.64, LTC: 0.0001 };

/* **The similar past** (group 4): the twenty past 30-day stretches most
 * like the last thirty, and the ten days after each. Scored against an
 * ordinary day from 2021 on, they did **worse** on all four coins (CRPS,
 * Diebold–Mariano z 4.1–6.0) — and, with a small ensemble's own penalty taken
 * out (exploratory), no better (|z| ≤ 1.75). Their majority called the
 * direction 47.5–51.6% of the time. So they are listed, never drawn. */
const ANALOG_WINDOW = 30;
const ANALOG_AHEAD = 10;
const ANALOG_COUNT = 20;
const ANALOG_APART = 10;

/* The stretches most like the last `ANALOG_WINDOW` days, and what each was
   followed by: the shape of the path (log returns summed, over their own
   size), never its level. Only stretches whose ten days after are known. */
const similarStretches = (candles) => {
  const c = Array.isArray(candles) ? candles.filter((x) => x && x.close > 0) : [];
  const W = ANALOG_WINDOW;
  const n = c.length;
  if (n < W * 4 + ANALOG_AHEAD) return null;
  const lr = c.map((x, i) => (i ? Math.log(x.close / c[i - 1].close) : 0));
  const shape = (t) => {
    const r = lr.slice(t - W + 1, t + 1);
    const mu = r.reduce((a, x) => a + x, 0) / W;
    const sd = Math.sqrt(r.reduce((a, x) => a + (x - mu) ** 2, 0) / W);
    if (!(sd > 0)) return null;
    let cum = 0;
    return { sd, v: r.map((x) => (cum += x) / (sd * Math.sqrt(W))) };
  };
  const now = shape(n - 1);
  if (!now) return null;
  const lib = [];
  // The tested library, exactly: every stretch whose ten days after are known today
  for (let u = W; u + ANALOG_AHEAD <= n - 1; u += 1) {
    const s = shape(u);
    if (!s) continue;
    let d = 0;
    for (let k = 0; k < W; k += 1) d += (now.v[k] - s.v[k]) ** 2;
    lib.push({ u, d, sd: s.sd });
  }
  lib.sort((a, b) => a.d - b.d);
  const picked = [];
  for (const x of lib) {
    if (picked.every((p) => Math.abs(p.u - x.u) >= ANALOG_APART)) picked.push(x);
    if (picked.length === ANALOG_COUNT) break;
  }
  const out = picked.map((p) => ({
    t: c[p.u].t,
    after: (c[p.u + ANALOG_AHEAD].close / c[p.u].close - 1) * 100,
  }));
  const up = out.filter((x) => x.after > 0).length;
  const sorted = out.map((x) => x.after).sort((a, b) => a - b);
  return { stretches: out, up, n: out.length, median: sorted[Math.floor(sorted.length / 2)] };
};

// A simple average that waits for a full window of real values
const crSma = (xs, n) =>
  xs.map((_, i) => {
    if (i < n - 1) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j += 1) {
      if (xs[j] == null) return null;
      s += xs[j];
    }
    return s / n;
  });

// The highest high and lowest low of the n bars ending at i
const crRange = (c, i, n) => {
  if (i < n - 1) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = i - n + 1; j <= i; j += 1) {
    hi = Math.max(hi, c[j].high);
    lo = Math.min(lo, c[j].low);
  }
  return { hi, lo };
};

/* A divergence: a swing point that becomes known on this bar (L bars after
   it), beyond the previous swing point of its kind 5–60 bars earlier, while
   the indicator at it is not — and on the side of `pivotSide` the claim
   needs (RSI under 50, MACD under zero, for a low). */
const crDivergence = (c, ind, kind, side) => {
  const L = PRICE_PATTERN_PIVOT;
  const out = new Array(c.length).fill(false);
  let prev = null;
  for (let b = 0; b < c.length; b += 1) {
    const p = b - L;
    if (p < L || !pricePivotAt(c, p, kind)) continue;
    const price = (i) => (kind === "L" ? c[i].low : c[i].high);
    if (prev != null && p - prev >= 5 && p - prev <= 60 && ind[p] != null && ind[prev] != null) {
      const further = kind === "L" ? price(p) < price(prev) : price(p) > price(prev);
      const against = kind === "L" ? ind[p] > ind[prev] : ind[p] < ind[prev];
      const onSide = kind === "L" ? ind[p] < side : ind[p] > side;
      if (further && against && onSide) out[b] = true;
    }
    prev = p;
  }
  return out;
};

const companionReadingStates = (candles) => {
  const c = Array.isArray(candles) ? candles.filter((x) => x && x.close > 0 && x.high > 0 && x.low > 0) : [];
  const n = c.length;
  const closes = c.map((x) => x.close);
  const none = () => new Array(n).fill(false);
  const cross = (a, b, up) =>
    c.map((_, i) => {
      if (i === 0 || a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) return false;
      return up ? a[i - 1] <= b[i - 1] && a[i] > b[i] : a[i - 1] >= b[i - 1] && a[i] < b[i];
    });

  const rsi = dailyRsi(closes, 14);
  const macd = ssMacd(closes).line;

  // Ichimoku (9, 26, 52): the cloud at i is what the spans said 26 bars before
  const mid = (len) => c.map((_, i) => {
    const r = crRange(c, i, len);
    return r ? (r.hi + r.lo) / 2 : null;
  });
  const tenkan = mid(9);
  const kijun = mid(26);
  const spanB = mid(52);
  const spanA = c.map((_, i) => (tenkan[i] == null || kijun[i] == null ? null : (tenkan[i] + kijun[i]) / 2));
  const cloud = (i) => {
    const j = i - 26;
    if (j < 0 || spanA[j] == null || spanB[j] == null) return null;
    return { top: Math.max(spanA[j], spanB[j]), bottom: Math.min(spanA[j], spanB[j]) };
  };

  // Slow stochastic (14, 3, 3)
  const rawK = c.map((x, i) => {
    const r = crRange(c, i, 14);
    if (!r) return null;
    return r.hi > r.lo ? ((x.close - r.lo) / (r.hi - r.lo)) * 100 : 50;
  });
  const slowK = crSma(rawK, 3);
  const slowD = crSma(slowK, 3);
  const stoch = (up) =>
    c.map((_, i) => {
      if (i === 0 || [slowK[i], slowD[i], slowK[i - 1], slowD[i - 1]].some((v) => v == null)) return false;
      const crossed = up ? slowK[i - 1] <= slowD[i - 1] && slowK[i] > slowD[i] : slowK[i - 1] >= slowD[i - 1] && slowK[i] < slowD[i];
      return crossed && (up ? slowK[i] < 20 && slowD[i] < 20 : slowK[i] > 80 && slowD[i] > 80);
    });

  /* The 61.8% retracement of the last known swing of 15% or more — read off
     the zigzag as it stood that day, the first day the price reached it
     within 60 bars and nothing after. */
  const fibUp = none();
  const fibDown = none();
  {
    const L = PRICE_PATTERN_PIVOT;
    const zz = [];
    const add = (p) => {
      const last = zz[zz.length - 1];
      if (last && last.kind === p.kind) {
        if (p.kind === "H" ? p.price > last.price : p.price < last.price) zz[zz.length - 1] = p;
        return;
      }
      zz.push(p);
    };
    const done = new Set();
    for (let b = 0; b < n; b += 1) {
      const j = b - L;
      if (j >= L) {
        const hi = pricePivotAt(c, j, "H") ? { i: j, kind: "H", price: c[j].high } : null;
        const lo = pricePivotAt(c, j, "L") ? { i: j, kind: "L", price: c[j].low } : null;
        const order = zz.length && zz[zz.length - 1].kind === "H" ? [lo, hi] : [hi, lo];
        for (const p of order) if (p) add(p);
      }
      if (zz.length < 2) continue;
      const a = zz[zz.length - 2];
      const z = zz[zz.length - 1];
      const key = `${a.i}:${z.i}`;
      if (done.has(key) || b < z.i + L || b > z.i + 60) continue;
      const span = Math.abs(z.price - a.price);
      if (z.kind === "H" && z.price / a.price - 1 >= 0.15) {
        if (c[b].low <= z.price - 0.618 * span) {
          done.add(key);
          if (c[b].close >= z.price - 0.786 * span) fibUp[b] = true;
        }
      } else if (z.kind === "L" && (a.price - z.price) / a.price >= 0.15) {
        if (c[b].high >= z.price + 0.618 * span) {
          done.add(key);
          if (c[b].close <= z.price + 0.786 * span) fibDown[b] = true;
        }
      }
    }
  }

  // Last week's classic pivots — weeks start on Monday, UTC
  const week = (t) => Math.floor((Math.floor(t / 86400) + 3) / 7);
  const weeks = new Map();
  for (const x of c) {
    const w = week(x.t);
    const s = weeks.get(w) || { hi: -Infinity, lo: Infinity, close: null, days: 0 };
    s.hi = Math.max(s.hi, x.high);
    s.lo = Math.min(s.lo, x.low);
    s.close = x.close;
    s.days += 1;
    weeks.set(w, s);
  }
  const pivots = (t) => {
    const s = weeks.get(week(t) - 1);
    if (!s || s.days < 5) return null;
    const p = (s.hi + s.lo + s.close) / 3;
    return { r1: 2 * p - s.lo, s1: 2 * p - s.hi };
  };

  const sma200 = ssSma(closes, 200);
  const range = c.map((x) => x.high - x.low);
  let best = -Infinity;
  const ath = c.map((x, i) => {
    const hit = i >= 365 && x.close > best;
    best = Math.max(best, x.close);
    return hit;
  });
  const streak = (up) =>
    c.map((_, i) => {
      if (i < 5) return false;
      for (let k = i - 4; k <= i; k += 1) if (up ? !(closes[k] > closes[k - 1]) : !(closes[k] < closes[k - 1])) return false;
      return true;
    });

  return {
    "rsi-bull-div": crDivergence(c, rsi, "L", 50),
    "rsi-bear-div": crDivergence(c, rsi, "H", 50),
    "macd-bull-div": crDivergence(c, macd, "L", 0),
    "macd-bear-div": crDivergence(c, macd, "H", 0),
    "ichi-above": c.map((x, i) => {
      const now = cloud(i);
      const before = i > 0 ? cloud(i - 1) : null;
      return Boolean(now && before) && x.close > now.top && closes[i - 1] <= before.top;
    }),
    "ichi-below": c.map((x, i) => {
      const now = cloud(i);
      const before = i > 0 ? cloud(i - 1) : null;
      return Boolean(now && before) && x.close < now.bottom && closes[i - 1] >= before.bottom;
    }),
    "tk-up": cross(tenkan, kijun, true),
    "tk-down": cross(tenkan, kijun, false),
    "stoch-up": stoch(true),
    "stoch-down": stoch(false),
    "fib-hold-up": fibUp,
    "fib-hold-down": fibDown,
    "pivot-r1": c.map((x, i) => {
      const p = i > 0 ? pivots(x.t) : null;
      return Boolean(p) && x.close > p.r1 && closes[i - 1] <= p.r1;
    }),
    "pivot-s1": c.map((x, i) => {
      const p = i > 0 ? pivots(x.t) : null;
      return Boolean(p) && x.close < p.s1 && closes[i - 1] >= p.s1;
    }),
    ath,
    "streak-up": streak(true),
    "streak-down": streak(false),
    "mayer-high": c.map((x, i) => sma200[i] != null && x.close / sma200[i] >= 2.4),
    "mayer-low": c.map((x, i) => sma200[i] != null && x.close / sma200[i] <= 0.8),
    nr7: c.map((_, i) => {
      if (i < 6) return false;
      for (let k = i - 6; k < i; k += 1) if (!(range[i] < range[k])) return false;
      return true;
    }),
    "inside-day": c.map((x, i) => i > 0 && x.high < c[i - 1].high && x.low > c[i - 1].low),
  };
};

/* Every pattern and every daily reading the companion knows, in one list
   each — what the chart, the settings' chips and the base-rate screen look
   a definition up in. */
const COMPANION_PATTERN_DEFS = PRICE_PATTERNS.concat(SWING_PATTERNS);
const COMPANION_SETUP_DEFS = STRATEGY_SETUPS.concat(COMPANION_READINGS);

/* The next day's direction by the weekday of the close (UTC, Monday
   first): how often it closed higher, over every day of the history. */
const weekdayShares = (candles) => {
  const c = Array.isArray(candles) ? candles.filter((x) => x && x.close > 0) : [];
  if (c.length < 60) return null;
  const up = new Array(7).fill(0);
  const all = new Array(7).fill(0);
  for (let i = 0; i + 1 < c.length; i += 1) {
    const wd = (Math.floor(c[i].t / 86400) + 3) % 7;
    all[wd] += 1;
    if (c[i + 1].close > c[i].close) up[wd] += 1;
  }
  const n = all.reduce((a, b) => a + b, 0);
  return {
    shares: up.map((u, d) => (all[d] ? (u / all[d]) * 100 : 0)),
    n,
    all: (up.reduce((a, b) => a + b, 0) / n) * 100,
  };
};

// A sentence's first letter raised, for a clause that starts one
const capitalFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
