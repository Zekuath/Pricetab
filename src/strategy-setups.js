/* STRATEGY SETUPS — what common strategies look for, as daily states.
 *
 * Asked for on 27 Sep 2026: *"Every Trading Strategy'nin de yardımcı
 * eşlikçi olarak yapılmasını istiyorum. Grafikte gösterecek, burada böyle bir
 * formasyon var diye."* Each setup a strategy family waits for — a golden
 * cross, a 20-day breakout, a close outside the Bollinger band, a Supertrend
 * flip — is a boolean per day here, entered on a day's close and read with
 * the same tools as everything else this app counts: `baseRateFor` for the
 * ones that claim a direction, `moveRateFor` for the ones that only claim a
 * big move. The chart companion names them where they happened; the
 * base-rate screen lists them. Neither says what to do.
 *
 * **Measured under a written preregistration first**
 * (`docs/internal/research/setups-prereg.md`): the parameters are the
 * classic defaults, fixed before a single state was computed on real data.
 *
 * Pure: daily candles in (`{ t, open, high, low, close }`, oldest first).
 * Every series here is aligned with the candles, and `null` wherever its
 * inputs do not all exist yet — no partial window stands in for a full one.
 */

const STRATEGY_SETUPS = [
  { id: "golden-cross", family: "trend", kind: "up",
    title: msg("ss_golden", "Golden cross"),
    what: msg("ss_golden_what", "50-day average crossed above the 200-day"),
    claim: msg("ss_golden_claim", "said to start an uptrend") },
  { id: "death-cross", family: "trend", kind: "down",
    title: msg("ss_death", "Death cross"),
    what: msg("ss_death_what", "50-day average crossed below the 200-day"),
    claim: msg("ss_death_claim", "said to start a downtrend") },
  { id: "macd-up", family: "momentum", kind: "up",
    title: msg("ss_macd_up", "MACD crossed up"),
    what: msg("ss_macd_up_what", "MACD (12, 26) crossed above its 9-day signal"),
    claim: msg("ss_macd_up_claim", "said to mark momentum turning up") },
  { id: "macd-down", family: "momentum", kind: "down",
    title: msg("ss_macd_down", "MACD crossed down"),
    what: msg("ss_macd_down_what", "MACD (12, 26) crossed below its 9-day signal"),
    claim: msg("ss_macd_down_claim", "said to mark momentum turning down") },
  { id: "breakout-high", family: "breakout", kind: "up",
    title: msg("ss_break_high", "20-day breakout"),
    what: msg("ss_break_high_what", "closed above the highest high of the 20 days before"),
    claim: msg("ss_break_high_claim2", "said to run on — the turtle traders' rule") },
  { id: "breakout-low", family: "breakout", kind: "down",
    title: msg("ss_break_low", "20-day breakdown"),
    what: msg("ss_break_low_what", "closed below the lowest low of the 20 days before"),
    claim: msg("ss_break_low_claim", "said to keep falling") },
  { id: "boll-upper", family: "reversion", kind: "down",
    title: msg("ss_boll_upper", "Above the upper band"),
    what: msg("ss_boll_upper_what", "closed above the upper Bollinger band (20 days, 2σ)"),
    claim: msg("ss_boll_upper_claim", "said to be stretched and due to fall back") },
  { id: "boll-lower", family: "reversion", kind: "up",
    title: msg("ss_boll_lower", "Below the lower band"),
    what: msg("ss_boll_lower_what", "closed below the lower Bollinger band (20 days, 2σ)"),
    claim: msg("ss_boll_lower_claim", "said to be stretched and due to bounce") },
  { id: "supertrend-up", family: "trend", kind: "up",
    title: msg("ss_st_up", "Supertrend flipped up"),
    what: msg("ss_st_up_what", "Supertrend (10, 3) turned from down to up"),
    claim: msg("ss_st_up_claim", "said to mark the trend turning up") },
  { id: "supertrend-down", family: "trend", kind: "down",
    title: msg("ss_st_down", "Supertrend flipped down"),
    what: msg("ss_st_down_what", "Supertrend (10, 3) turned from up to down"),
    claim: msg("ss_st_down_claim", "said to mark the trend turning down") },
  { id: "squeeze", family: "volatility", kind: "move",
    title: msg("ss_squeeze", "Bollinger squeeze"),
    what: msg("ss_squeeze_what", "the band at its narrowest of the last 120 days"),
    claim: msg("ss_squeeze_claim", "said to come before a big move, either way") },
  { id: "adx-strong", family: "volatility", kind: "move",
    title: msg("ss_adx", "ADX above 25"),
    what: msg("ss_adx_what", "ADX (14) rose through 25"),
    claim: msg("ss_adx_claim", "said to mean a strong trend is under way") },
];

/* ── the indicators ─────────────────────────────────────────────────────── */

const ssSma = (xs, n) => {
  const out = new Array(xs.length).fill(null);
  let sum = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sum += xs[i];
    if (i >= n) sum -= xs[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
};

/* An exponential average seeded with the simple average of its first n
   values, over a series that may start with nulls. */
const ssEma = (xs, n) => {
  const out = new Array(xs.length).fill(null);
  const k = 2 / (n + 1);
  const start = xs.findIndex((x) => x != null);
  if (start < 0) return out;
  if (start + n > xs.length) return out;
  let prev = 0;
  for (let i = start; i < start + n; i += 1) prev += xs[i];
  prev /= n;
  out[start + n - 1] = prev;
  for (let i = start + n; i < xs.length; i += 1) {
    prev += k * (xs[i] - prev);
    out[i] = prev;
  }
  return out;
};

const ssStd = (xs, n) => {
  const mean = ssSma(xs, n);
  const out = new Array(xs.length).fill(null);
  for (let i = n - 1; i < xs.length; i += 1) {
    let v = 0;
    for (let j = i - n + 1; j <= i; j += 1) v += (xs[j] - mean[i]) ** 2;
    out[i] = Math.sqrt(v / n);
  }
  return out;
};

const ssTrueRange = (c, i) =>
  i === 0
    ? c[i].high - c[i].low
    : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));

/* Wilder's average: the mean of the first n, then prev + (x − prev)/n. */
const ssWilder = (xs, n, from) => {
  const out = new Array(xs.length).fill(null);
  const s = from || 0;
  if (s + n > xs.length) return out;
  let prev = 0;
  for (let i = s; i < s + n; i += 1) prev += xs[i];
  prev /= n;
  out[s + n - 1] = prev;
  for (let i = s + n; i < xs.length; i += 1) {
    prev += (xs[i] - prev) / n;
    out[i] = prev;
  }
  return out;
};

const ssBollinger = (closes) => {
  const mid = ssSma(closes, 20);
  const sd = ssStd(closes, 20);
  return closes.map((_, i) =>
    mid[i] == null ? null : { mid: mid[i], upper: mid[i] + 2 * sd[i], lower: mid[i] - 2 * sd[i] },
  );
};

const ssMacd = (closes) => {
  const fast = ssEma(closes, 12);
  const slow = ssEma(closes, 26);
  const line = closes.map((_, i) => (fast[i] == null || slow[i] == null ? null : fast[i] - slow[i]));
  const signal = ssEma(line, 9);
  return { line, signal };
};

/* Supertrend (10, 3): the direction, +1 or −1, from the first day ATR
   exists, and the band the price is being held against that day. The bands
   ratchet — the upper only comes down, the lower only goes up, unless the
   previous close broke through — and the trend flips when a close crosses
   the band it is being held under or over. One copy, read by the setups and
   by the overlay line alike. */
const ssSupertrendBands = (c, n, mult) => {
  const tr = c.map((_, i) => ssTrueRange(c, i));
  const atr = ssWilder(tr, n, 1);
  const dir = new Array(c.length).fill(null);
  const band = new Array(c.length).fill(null);
  let up = null;
  let lo = null;
  let d = null;
  for (let i = 0; i < c.length; i += 1) {
    if (atr[i] == null) continue;
    const hl2 = (c[i].high + c[i].low) / 2;
    const ub = hl2 + mult * atr[i];
    const lb = hl2 - mult * atr[i];
    if (up == null) {
      up = ub;
      lo = lb;
      d = c[i].close >= hl2 ? 1 : -1;
    } else {
      const prevClose = c[i - 1].close;
      up = ub < up || prevClose > up ? ub : up;
      lo = lb > lo || prevClose < lo ? lb : lo;
      if (d === -1 && c[i].close > up) d = 1;
      else if (d === 1 && c[i].close < lo) d = -1;
    }
    dir[i] = d;
    band[i] = d === 1 ? lo : up;
  }
  return { dir, band };
};
const ssSupertrend = (c, n, mult) => ssSupertrendBands(c, n, mult).dir;

/* ADX (14), Wilder's: directional movement smoothed with his running sum,
   DX from the two lines, ADX the Wilder average of DX. */
const ssAdx = (c, n) => {
  const len = c.length;
  const out = new Array(len).fill(null);
  if (len < 2 * n + 1) return out;
  const tr = new Array(len).fill(0);
  const pdm = new Array(len).fill(0);
  const mdm = new Array(len).fill(0);
  for (let i = 1; i < len; i += 1) {
    const upMove = c[i].high - c[i - 1].high;
    const downMove = c[i - 1].low - c[i].low;
    pdm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    mdm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = ssTrueRange(c, i);
  }
  let str = 0;
  let sp = 0;
  let sm = 0;
  for (let i = 1; i <= n; i += 1) {
    str += tr[i];
    sp += pdm[i];
    sm += mdm[i];
  }
  const dx = new Array(len).fill(null);
  for (let i = n; i < len; i += 1) {
    if (i > n) {
      str = str - str / n + tr[i];
      sp = sp - sp / n + pdm[i];
      sm = sm - sm / n + mdm[i];
    }
    const pdi = str > 0 ? (100 * sp) / str : 0;
    const mdi = str > 0 ? (100 * sm) / str : 0;
    dx[i] = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
  }
  let adx = 0;
  for (let i = n; i < 2 * n; i += 1) adx += dx[i];
  adx /= n;
  out[2 * n - 1] = adx;
  for (let i = 2 * n; i < len; i += 1) {
    adx = (adx * (n - 1) + dx[i]) / n;
    out[i] = adx;
  }
  return out;
};

/* ── the states ─────────────────────────────────────────────────────────── */

/* Every setup as a boolean per day: true on the day it holds. A cross is
   true on the day it crosses; a close outside a band is true for as long as
   it stays out — `baseRateFor` counts the entry either way, so a run of days
   is one episode. */
const strategySetupStates = (candles) => {
  const c = Array.isArray(candles) ? candles.filter((x) => x && x.close > 0 && x.high > 0 && x.low > 0) : [];
  const closes = c.map((x) => x.close);
  const cross = (a, b, dirUp) =>
    c.map((_, i) => {
      if (i === 0 || a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) return false;
      return dirUp ? a[i - 1] <= b[i - 1] && a[i] > b[i] : a[i - 1] >= b[i - 1] && a[i] < b[i];
    });
  const sma50 = ssSma(closes, 50);
  const sma200 = ssSma(closes, 200);
  const macd = ssMacd(closes);
  const boll = ssBollinger(closes);
  const st = ssSupertrend(c, 10, 3);
  const adx = ssAdx(c, 14);
  const width = boll.map((b) => (b ? (b.upper - b.lower) / b.mid : null));
  const hiBefore = (i) => {
    if (i < 20) return null;
    let m = -Infinity;
    for (let j = i - 20; j < i; j += 1) m = Math.max(m, c[j].high);
    return m;
  };
  const loBefore = (i) => {
    if (i < 20) return null;
    let m = Infinity;
    for (let j = i - 20; j < i; j += 1) m = Math.min(m, c[j].low);
    return m;
  };
  const squeeze = width.map((w, i) => {
    if (w == null || i < 119) return false;
    for (let j = i - 119; j < i; j += 1) if (width[j] == null || width[j] < w) return false;
    return true;
  });
  return {
    "golden-cross": cross(sma50, sma200, true),
    "death-cross": cross(sma50, sma200, false),
    "macd-up": cross(macd.line, macd.signal, true),
    "macd-down": cross(macd.line, macd.signal, false),
    "breakout-high": c.map((x, i) => {
      const h = hiBefore(i);
      return h != null && x.close > h;
    }),
    "breakout-low": c.map((x, i) => {
      const l = loBefore(i);
      return l != null && x.close < l;
    }),
    "boll-upper": c.map((x, i) => Boolean(boll[i]) && x.close > boll[i].upper),
    "boll-lower": c.map((x, i) => Boolean(boll[i]) && x.close < boll[i].lower),
    "supertrend-up": st.map((d, i) => i > 0 && st[i - 1] === -1 && d === 1),
    "supertrend-down": st.map((d, i) => i > 0 && st[i - 1] === 1 && d === -1),
    squeeze,
    "adx-strong": adx.map((v) => v != null && v > 25),
  };
};

/* The days a state was entered — where the companion puts a name. */
const strategySetupEntries = (states) => {
  const out = [];
  const list = Array.isArray(states) ? states : [];
  for (let i = 0; i < list.length; i += 1) if (list[i] && !list[i - 1]) out.push(i);
  return out;
};

/* **For a setup that only claims a big move**: how often the move over the
 * horizon after an entry was bigger than the move over an ordinary stretch
 * of the same length — the median |return| of every day — which is one time
 * in two if the setup means nothing. Episodes, not days, like `baseRateFor`.
 * The comparison is left out below `BASE_RATE_MIN_EPISODES`. */
const moveRateFor = (closes, states, horizon) => {
  if (!Array.isArray(closes) || closes.length <= horizon + 1) return null;
  const fwd = (i) => (i + horizon < closes.length && closes[i] > 0 ? Math.abs(closes[i + horizon] / closes[i] - 1) : null);
  const base = [];
  for (let i = 0; i < closes.length; i += 1) {
    const f = fwd(i);
    if (f != null) base.push(f);
  }
  if (!base.length) return null;
  const sorted = base.slice().sort((a, b) => a - b);
  const baseMedian = sorted[Math.floor(sorted.length / 2)];
  const moves = [];
  for (const i of strategySetupEntries(states)) {
    const f = fwd(i);
    if (f != null) moves.push(f);
  }
  const bigger = moves.filter((m) => m > baseMedian).length;
  return {
    n: moves.length,
    bigger,
    share: moves.length ? (bigger / moves.length) * 100 : null,
    baseMedian,
    median: moves.length ? moves.slice().sort((a, b) => a - b)[Math.floor(moves.length / 2)] : null,
  };
};

/* **The overlay lines** for the chart's "Indicator lines" setting: each a
 * list of `{ t, v }` in the candles' own seconds, null where the indicator
 * has no value yet. Pure. Supertrend is drawn as the band it is holding the
 * price against — below it in an uptrend, above it in a downtrend — split
 * where the trend flips so the line does not jump across the price. */
const indicatorOverlaySeries = (candles, kind) => {
  const c = Array.isArray(candles) ? candles.filter((x) => x && x.close > 0 && x.high > 0 && x.low > 0) : [];
  if (c.length < 30) return null;
  const closes = c.map((x) => x.close);
  const at = (vals) => c.map((x, i) => ({ t: x.t, v: vals[i] == null ? null : vals[i] }));
  if (kind === "bollinger") {
    const b = ssBollinger(closes);
    return {
      kind,
      lines: [
        { id: "upper", points: at(b.map((x) => (x ? x.upper : null))) },
        { id: "mid", points: at(b.map((x) => (x ? x.mid : null))), dash: "3 3" },
        { id: "lower", points: at(b.map((x) => (x ? x.lower : null))) },
      ],
    };
  }
  if (kind === "donchian") {
    const hi = c.map((_, i) => {
      if (i < 19) return null;
      let m = -Infinity;
      for (let j = i - 19; j <= i; j += 1) m = Math.max(m, c[j].high);
      return m;
    });
    const lo = c.map((_, i) => {
      if (i < 19) return null;
      let m = Infinity;
      for (let j = i - 19; j <= i; j += 1) m = Math.min(m, c[j].low);
      return m;
    });
    return {
      kind,
      lines: [
        /* Dotted, so drawn beside Bollinger's solid band the two channels
           can be told apart without a colour of their own. */
        { id: "upper", points: at(hi), dash: "1 2" },
        { id: "mid", points: at(hi.map((h, i) => (h == null ? null : (h + lo[i]) / 2))), dash: "3 3" },
        { id: "lower", points: at(lo), dash: "1 2" },
      ],
    };
  }
  if (kind === "averages") {
    return {
      kind,
      lines: [
        { id: "sma50", points: at(ssSma(closes, 50)) },
        { id: "sma200", points: at(ssSma(closes, 200)), dash: "5 3" },
      ],
    };
  }
  if (kind === "supertrend") {
    const st = ssSupertrendBands(c, 10, 3);
    const up = st.band.map((b, i) => (st.dir[i] === 1 ? b : null));
    const down = st.band.map((b, i) => (st.dir[i] === -1 ? b : null));
    return {
      kind,
      lines: [
        { id: "st-up", points: at(up), tone: "up" },
        { id: "st-down", points: at(down), tone: "down" },
      ],
    };
  }
  return null;
};

