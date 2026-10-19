/* CHART PATTERNS — found by rule, drawn as levels, and counted.
 *
 * Asked for on 27 Sep 2026 in a pasted spec: head and shoulders, double tops
 * and bottoms and triangles from swing points, with an entry, a measured
 * target, a stop and a 0–100 "conviction". What is here is the counted half
 * of that, and nothing else.
 *
 * **Measured before it was built**, under a written preregistration
 * (`docs/internal/research/patterns-prereg.md`; the rules below are that
 * file's, unchanged): on 13,489 daily candles of BTC, ETH, SOL and LTC the
 * four patterns completed **60 times in all**, and no coin–pattern pair
 * reached the twelve resolved episodes this app needs before it compares
 * anything with an ordinary day. So a pattern here is drawn, and its record
 * on this coin is printed beside it — "7 before, 4 reached the target first
 * — too few to compare" — and that is all. No score, no entry, no direction
 * the counts do not carry. Triangles are left out: "converging regression
 * lines" leaves too much to decide after seeing the chart.
 *
 * **Causal, on purpose.** A swing point at bar i is only known at bar i + L,
 * and every pattern is read off the zigzag as it stood at the bar its
 * breakout closed — so the history counted is the history a person watching
 * the chart could have seen, not one assembled afterwards.
 *
 * Pure: candles in (`{ t, open, high, low, close }`, oldest first, the shape
 * `fetchDailyCandles` returns), episodes out. Loads before the chart and the
 * base-rate screen, which both read it.
 */

const PRICE_PATTERN_PIVOT = 5; // L, bars either side of a swing point
const PRICE_PATTERN_WALK = 90; // bars a pattern is followed for
const PRICE_PATTERN_SHOULDERS = 0.03; // |P1 − P3| ≤ 3% of the head
const PRICE_PATTERN_TWIN = 0.005; // double top/bottom: peaks within 0.5%
const PRICE_PATTERN_DIP = 0.03; // …with at least a 3% retracement between

const PRICE_PATTERNS = [
  {
    id: "hs",
    bear: true,
    title: msg("cpat_hs", "Head and shoulders"),
    claim: msg("cpat_hs_claim", "said to mark a top"),
  },
  {
    id: "ihs",
    bear: false,
    title: msg("cpat_ihs", "Inverse head and shoulders"),
    claim: msg("cpat_ihs_claim", "said to mark a bottom"),
  },
  {
    id: "dtop",
    bear: true,
    title: msg("cpat_dtop", "Double top"),
    claim: msg("cpat_dtop_claim", "said to mark a ceiling"),
  },
  {
    id: "dbot",
    bear: false,
    title: msg("cpat_dbot", "Double bottom"),
    claim: msg("cpat_dbot_claim", "said to mark a floor"),
  },
];

/* A strict swing high (or low): higher (lower) than every other bar within
   L either side. */
const pricePivotAt = (c, i, kind) => {
  const L = PRICE_PATTERN_PIVOT;
  if (i - L < 0 || i + L >= c.length) return false;
  for (let j = i - L; j <= i + L; j += 1) {
    if (j === i) continue;
    if (kind === "H" ? c[j].high >= c[i].high : c[j].low <= c[i].low) return false;
  }
  return true;
};

/* **After a breakout: target first, invalidation first, or neither yet.**
   A bar that touches both is counted against the pattern — the conservative
   reading, since a day's candle does not say which came first. `open` is a
   walk that ran its full length without either; `pending` is one the data
   has not reached the end of yet. */
const pricePatternWalk = (c, from, target, stop, bear) => {
  const last = Math.min(c.length - 1, from + PRICE_PATTERN_WALK);
  for (let k = from + 1; k <= last; k += 1) {
    const hitT = bear ? c[k].low <= target : c[k].high >= target;
    const hitS = bear ? c[k].high >= stop : c[k].low <= stop;
    if (hitS) return { out: "stop", at: k };
    if (hitT) return { out: "target", at: k };
  }
  return { out: from + PRICE_PATTERN_WALK <= c.length - 1 ? "open" : "pending", at: null };
};

const detectPricePatterns = (candles) => {
  const c = Array.isArray(candles) ? candles.filter((x) => x && x.high > 0 && x.low > 0 && x.close > 0) : [];
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
  const fired = new Set();
  const out = [];
  for (let b = 0; b < c.length; b += 1) {
    // Swing points at b − L become known now, never before
    const j = b - L;
    if (j >= L) {
      const hi = pricePivotAt(c, j, "H") ? { i: j, kind: "H", price: c[j].high } : null;
      const lo = pricePivotAt(c, j, "L") ? { i: j, kind: "L", price: c[j].low } : null;
      const order = zz.length && zz[zz.length - 1].kind === "H" ? [lo, hi] : [hi, lo];
      for (const p of order) if (p) add(p);
    }
    for (const def of PRICE_PATTERNS) {
      const bear = def.bear;
      const top = bear ? "H" : "L";
      let k = zz.length - 1;
      if (k >= 0 && zz[k].kind !== top) k -= 1;
      if (k < 0) continue;
      const head = def.id === "hs" || def.id === "ihs";
      const need = head ? 4 : 2;
      if (k - need < 0) continue;
      const seq = zz.slice(k - need, k + 1);
      const anchor = seq[seq.length - 1];
      const key = `${def.id}:${anchor.i}`;
      if (fired.has(key) || b < anchor.i + L) continue;
      const beyond = (a, x) => (bear ? a > x : a < x);
      let neckAt;
      let stop;
      let depth;
      let neck;
      if (head) {
        const [P1, T1, P2, T2, P3] = seq;
        if (!(beyond(P2.price, P1.price) && beyond(P2.price, P3.price))) continue;
        if (Math.abs(P1.price - P3.price) > PRICE_PATTERN_SHOULDERS * P2.price) continue;
        neckAt = (t) => T1.price + ((T2.price - T1.price) * (t - T1.i)) / (T2.i - T1.i);
        stop = P3.price;
        depth = Math.abs(P2.price - neckAt(P2.i));
        neck = { from: T1.i, to: T2.i };
      } else {
        const [P1, T, P2] = seq;
        const ext = bear ? Math.max(P1.price, P2.price) : Math.min(P1.price, P2.price);
        if (Math.abs(P1.price - P2.price) > PRICE_PATTERN_TWIN * ext) continue;
        if (Math.abs(ext - T.price) / ext < PRICE_PATTERN_DIP) continue;
        neckAt = () => T.price;
        stop = ext;
        depth = Math.abs(ext - T.price);
        neck = { from: T.i, to: T.i };
      }
      const width = anchor.i - seq[0].i;
      // Out of time, or closed through the invalidation first: never fires
      if (b > anchor.i + width) {
        fired.add(key);
        continue;
      }
      let broken = false;
      for (let m = anchor.i + 1; m <= b; m += 1) {
        if (bear ? c[m].close > stop : c[m].close < stop) broken = true;
      }
      if (broken) {
        fired.add(key);
        continue;
      }
      if (!(bear ? c[b].close < neckAt(b) : c[b].close > neckAt(b))) continue;
      fired.add(key);
      /* The close that broke the neckline — what the measured move is
         measured from. Not an entry: nothing here says to act on it. */
      const breakout = c[b].close;
      const target = bear ? breakout - depth : breakout + depth;
      if ((bear ? breakout >= stop : breakout <= stop) || target <= 0) continue;
      const walk = pricePatternWalk(c, b, target, stop, bear);
      out.push({
        kind: def.id,
        bear,
        points: seq.map((p) => ({ t: c[p.i].t, price: p.price, kind: p.kind })),
        neck: {
          from: { t: c[neck.from].t, price: neckAt(neck.from) },
          to: { t: c[b].t, price: neckAt(b) },
        },
        at: c[b].t,
        breakout,
        target,
        stop,
        out: walk.out,
        resolvedAt: walk.at == null ? null : c[walk.at].t,
      });
    }
  }
  return out;
};

/* This coin's record for one pattern: how many completed, how many have
   resolved one way or the other, and how many of those reached the target
   first. The comparison with an ordinary day is left to the caller's
   `BASE_RATE_MIN_EPISODES` — below it there is none to print. */
const pricePatternRecord = (episodes, kind, lastT) => {
  const mine = (Array.isArray(episodes) ? episodes : []).filter((e) => e.kind === kind);
  const resolved = mine.filter((e) => e.out === "target" || e.out === "stop");
  const targetFirst = resolved.filter((e) => e.out === "target").length;
  return {
    found: mine.length,
    resolved: resolved.length,
    targetFirst,
    stopFirst: resolved.length - targetFirst,
    // Walks that ran their length without either, and walks still running
    open: mine.filter((e) => e.out === "open").length,
    unfinished: mine.filter((e) => e.out === "pending").length,
    within: Number.isFinite(lastT) ? patternWithinWalk(mine, lastT) : null,
  };
};

/* **Within the walk, with the running ones kept** (18 Oct 2026,
   research/pattern-survival-prereg.md). The share of episodes that reached
   the measured move first, the invalidation first, or neither within
   `PRICE_PATTERN_WALK` days — Aalen–Johansen cumulative incidence, so a walk
   still running counts for the days it has been seen and a walk that ran
   out is "neither", not dropped. Measured: neither was 0–12% of episodes,
   which "k of the resolved" never said. Times in days from the breakout. */
const patternWithinWalk = (mine, lastT, walk = PRICE_PATTERN_WALK) => {
  const DAY = 86400;
  const obs = [];
  for (const e of mine) {
    if (e.out === "target" || e.out === "stop") {
      obs.push({ time: Math.round((e.resolvedAt - e.at) / DAY), cause: e.out === "target" ? 1 : 2 });
    } else if (e.out === "open") {
      obs.push({ time: walk, cause: 0 });
    } else {
      obs.push({ time: Math.max(0, Math.min(walk, Math.round((lastT - e.at) / DAY))), cause: 0 });
    }
  }
  if (!obs.length) return null;
  obs.sort((x, y) => x.time - y.time);
  let surv = 1;
  let target = 0;
  let stop = 0;
  let i = 0;
  while (i < obs.length && obs[i].time <= walk) {
    const t = obs[i].time;
    const atRisk = obs.length - i;
    let d1 = 0;
    let d2 = 0;
    let j = i;
    for (; j < obs.length && obs[j].time === t; j += 1) {
      if (obs[j].cause === 1) d1 += 1;
      else if (obs[j].cause === 2) d2 += 1;
    }
    target += surv * (d1 / atRisk);
    stop += surv * (d2 / atRisk);
    surv *= 1 - (d1 + d2) / atRisk;
    i = j;
  }
  return { n: obs.length, target, stop, neither: Math.max(0, 1 - target - stop) };
};

/* The record in words, shared by the base-rate screen and the chart's card:
   the three outcomes within the walk as counts, the running ones named, and
   the shares — with the running ones kept — from BASE_RATE_MIN_EPISODES. */
const patternRecordText = (rec) => {
  const counts = msg(
    "cpat_within_counts",
    "Within 90 days, of $1: the measured move first $2, the invalidation first $3, neither $4.",
    String(rec.found),
    String(rec.targetFirst),
    String(rec.stopFirst),
    String(rec.open),
  );
  const running = rec.unfinished
    ? " " + msg("cpat_running", "$1 still running.", String(rec.unfinished))
    : "";
  const w = rec.within;
  const shares =
    w && rec.found >= BASE_RATE_MIN_EPISODES
      ? " " + msg(
          "cpat_within_shares",
          "As shares, the running ones kept: $1% · $2% · $3%.",
          (w.target * 100).toFixed(0),
          (w.stop * 100).toFixed(0),
          (w.neither * 100).toFixed(0),
        )
      : "";
  return counts + running + shares;
};
