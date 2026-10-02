/* MORE SWING PATTERNS — triangles, wedges, rectangles, flags, triple tops.
 *
 * Asked for on 1 Oct 2026: *"ne kadar eşlikçi varsa araştır ve eklemeye
 * çalış"*. The four patterns in `price-patterns.js` left triangles out
 * because "converging regression lines" leaves too much to decide after
 * seeing the chart; here every shape is drawn through **swing points**, not
 * fitted, so each one is a rule written down before it was counted
 * (`docs/internal/research/companions-prereg.md`, group 1).
 *
 * Read exactly like the first four: the same causal zigzag (a swing point is
 * known L bars after it), the same breakout window and invalidation, the same
 * 90-bar walk with a tie counted against the pattern — `pricePivotAt` and
 * `pricePatternWalk` are borrowed, not copied. An episode has the shape
 * `detectPricePatterns` returns, so the chart companion and the base-rate
 * screen read both lists the same way; `lines` adds the pattern's second
 * line where it has one.
 *
 * Pure. Loads after price-patterns.js.
 */

const SWING_FLAT = 0.015; // "flat": within 1.5% of the larger
const SWING_SLOPE = 0.015; // "rising" / "falling": by at least 1.5%
const SWING_TRIPLE_DIP = 0.03; // a triple top's lows at least 3% under it
const SWING_RECT_HEIGHT = 0.03; // a rectangle at least 3% tall
const SWING_POLE = 0.15; // a flag's pole: at least a 15% move…
const SWING_POLE_BARS = 15; // …in at most 15 bars

/* `pair` groups the two directions of a shape that can break either way, so
 * one set of swing points fires once, whichever side it broke. */
const SWING_PATTERNS = [
  { id: "triple-top", bear: true, need: 5, end: "H",
    title: msg("swp_ttop", "Triple top"), claim: msg("swp_ttop_claim", "said to mark a ceiling") },
  { id: "triple-bottom", bear: false, need: 5, end: "L",
    title: msg("swp_tbot", "Triple bottom"), claim: msg("swp_tbot_claim", "said to mark a floor") },
  { id: "asc-triangle", bear: false, need: 4, end: "L",
    title: msg("swp_asc", "Ascending triangle"), claim: msg("swp_asc_claim", "said to break upwards") },
  { id: "desc-triangle", bear: true, need: 4, end: "H",
    title: msg("swp_desc", "Descending triangle"), claim: msg("swp_desc_claim", "said to break downwards") },
  { id: "sym-triangle-up", bear: false, need: 4, pair: "sym",
    title: msg("swp_sym_up", "Triangle, broken up"), claim: msg("swp_sym_up_claim", "said to run on the way it broke") },
  { id: "sym-triangle-down", bear: true, need: 4, pair: "sym",
    title: msg("swp_sym_down", "Triangle, broken down"), claim: msg("swp_sym_down_claim", "said to run on the way it broke") },
  { id: "rising-wedge", bear: true, need: 4,
    title: msg("swp_rwedge", "Rising wedge"), claim: msg("swp_rwedge_claim", "said to break downwards") },
  { id: "falling-wedge", bear: false, need: 4,
    title: msg("swp_fwedge", "Falling wedge"), claim: msg("swp_fwedge_claim", "said to break upwards") },
  { id: "rect-up", bear: false, need: 4, pair: "rect",
    title: msg("swp_rect_up", "Range, broken up"), claim: msg("swp_rect_up_claim", "said to run the range's height") },
  { id: "rect-down", bear: true, need: 4, pair: "rect",
    title: msg("swp_rect_down", "Range, broken down"), claim: msg("swp_rect_down_claim", "said to run the range's height") },
  { id: "bull-flag", bear: false, need: 4, end: "H",
    title: msg("swp_bflag", "Bull flag"), claim: msg("swp_bflag_claim", "said to run on by the pole's length") },
  { id: "bear-flag", bear: true, need: 4, end: "L",
    title: msg("swp_sflag", "Bear flag"), claim: msg("swp_sflag_claim", "said to fall on by the pole's length") },
];

/* **What the count said** (companions-prereg.md, group 1, run 1 Oct 2026):
 * pooled over BTC, ETH, SOL and LTC — found, resolved, how many reached the
 * measured move before the invalidation, what the same two distances from
 * every ordinary day gave, and the BH-adjusted q across the twelve (null:
 * fewer than twelve resolved, so not tested). One row is told apart from an
 * ordinary day: a triangle broken downwards. The card prints this beside the
 * coin's own count and says which kind of sentence it is allowed. */
const SWING_PATTERNS_TESTED = {
  "triple-top": { found: 0, n: 0, hits: 0, control: null, q: null },
  "triple-bottom": { found: 1, n: 1, hits: 1, control: 55, q: null },
  "asc-triangle": { found: 20, n: 20, hits: 11, control: 53, q: 1 },
  "desc-triangle": { found: 8, n: 8, hits: 0, control: 40, q: null },
  "sym-triangle-up": { found: 149, n: 136, hits: 55, control: 30, q: 0.051 },
  "sym-triangle-down": { found: 80, n: 72, hits: 24, control: 19, q: 0.038 },
  "rising-wedge": { found: 121, n: 113, hits: 31, control: 27, q: 1 },
  "falling-wedge": { found: 119, n: 104, hits: 36, control: 36, q: 1 },
  "rect-up": { found: 6, n: 6, hits: 4, control: 66, q: null },
  "rect-down": { found: 2, n: 2, hits: 2, control: 46, q: null },
  "bull-flag": { found: 3, n: 3, hits: 2, control: 26, q: null },
  "bear-flag": { found: 7, n: 6, hits: 0, control: 6, q: null },
};

/* The sentence the count allows: a difference only where the pooled q is
   under 0.05, "not told apart" where it was tested and is not, and "too rare
   to test" under twelve. */
const swingTestedText = (id) => {
  const r = SWING_PATTERNS_TESTED[id];
  if (!r) return "";
  if (r.q == null)
    return msg("swp_t_rare", "Found $1 times on four coins in up to eleven years — too rare to test.", String(r.found));
  if (r.q < 0.05)
    return msg(
      "swp_t_diff",
      "Tested on four coins: $1 of $2 reached the measured move first; the same distances from an ordinary day did $3% of the time.",
      String(r.hits),
      String(r.n),
      String(r.control),
    );
  return msg(
    "swp_t_same",
    "Tested on four coins: $1 of $2 reached the measured move first, against $3% from an ordinary day — not told apart from one.",
    String(r.hits),
    String(r.n),
    String(r.control),
  );
};

const swingFlat = (...xs) => (Math.max(...xs) - Math.min(...xs)) / Math.max(...xs) <= SWING_FLAT;
// b moved from a by at least SWING_SLOPE of the larger, upwards (dir 1) or down
const swingMoved = (a, b, dir) => (dir > 0 ? b - a : a - b) / Math.max(a, b) >= SWING_SLOPE;
// The line through two swing points, as a price at any bar
const swingLine = (p, q) => (i) => p.price + ((q.price - p.price) * (i - p.i)) / (q.i - p.i);

/* One shape read off its swing points: the breakout level at a bar, the
 * measured move, the invalidation, and the lines to draw — or null when the
 * points are not that shape. `seq` is oldest first and alternates. */
const swingShape = (id, seq) => {
  const highs = seq.filter((p) => p.kind === "H");
  const lows = seq.filter((p) => p.kind === "L");
  const [Ha, Hb] = highs.slice(-2);
  const [La, Lb] = lows.slice(-2);
  const flat = (v) => () => v;
  if (id === "triple-top") {
    const top = Math.max(...highs.map((p) => p.price));
    if (!swingFlat(...highs.map((p) => p.price))) return null;
    if (lows.some((p) => p.price > top * (1 - SWING_TRIPLE_DIP))) return null;
    const level = Math.min(...lows.map((p) => p.price));
    return { level: flat(level), height: top - level, stop: top, lines: [] };
  }
  if (id === "triple-bottom") {
    const bottom = Math.min(...lows.map((p) => p.price));
    if (!swingFlat(...lows.map((p) => p.price))) return null;
    if (highs.some((p) => p.price < bottom * (1 + SWING_TRIPLE_DIP))) return null;
    const level = Math.max(...highs.map((p) => p.price));
    return { level: flat(level), height: level - bottom, stop: bottom, lines: [] };
  }
  if (id === "asc-triangle") {
    if (!swingFlat(Ha.price, Hb.price) || !swingMoved(La.price, Lb.price, 1)) return null;
    const level = Math.max(Ha.price, Hb.price);
    return { level: flat(level), height: level - La.price, stop: Lb.price, lines: [[La, Lb]] };
  }
  if (id === "desc-triangle") {
    if (!swingFlat(La.price, Lb.price) || !swingMoved(Ha.price, Hb.price, -1)) return null;
    const level = Math.min(La.price, Lb.price);
    return { level: flat(level), height: Ha.price - level, stop: Hb.price, lines: [[Ha, Hb]] };
  }
  // The height at the pattern's start: its first high less its first low
  const first = Ha.price - La.price;
  if (id === "sym-triangle-up" || id === "sym-triangle-down") {
    if (!swingMoved(Ha.price, Hb.price, -1) || !swingMoved(La.price, Lb.price, 1)) return null;
    const up = id === "sym-triangle-up";
    return {
      level: up ? swingLine(Ha, Hb) : swingLine(La, Lb),
      height: first,
      stop: up ? Lb.price : Hb.price,
      lines: [up ? [La, Lb] : [Ha, Hb]],
    };
  }
  const slope = (p, q) => (q.price / p.price - 1) / (q.i - p.i);
  if (id === "rising-wedge") {
    if (!swingMoved(Ha.price, Hb.price, 1) || !swingMoved(La.price, Lb.price, 1)) return null;
    if (!(slope(La, Lb) > slope(Ha, Hb))) return null;
    return { level: swingLine(La, Lb), height: first, stop: Hb.price, lines: [[Ha, Hb]] };
  }
  if (id === "falling-wedge") {
    if (!swingMoved(Ha.price, Hb.price, -1) || !swingMoved(La.price, Lb.price, -1)) return null;
    if (!(slope(Ha, Hb) < slope(La, Lb))) return null;
    return { level: swingLine(Ha, Hb), height: first, stop: Lb.price, lines: [[La, Lb]] };
  }
  if (id === "rect-up" || id === "rect-down") {
    if (!swingFlat(Ha.price, Hb.price) || !swingFlat(La.price, Lb.price)) return null;
    const top = Math.max(Ha.price, Hb.price);
    const bottom = Math.min(La.price, Lb.price);
    if (top - bottom < SWING_RECT_HEIGHT * top) return null;
    const up = id === "rect-up";
    return { level: flat(up ? top : bottom), height: top - bottom, stop: up ? bottom : top, lines: [] };
  }
  if (id === "bull-flag") {
    const [L0, H1, L1, H2] = seq;
    const pole = H1.price - L0.price;
    if (H1.price / L0.price - 1 < SWING_POLE || H1.i - L0.i > SWING_POLE_BARS) return null;
    if (L1.price < H1.price - pole / 2 || !(H2.price < H1.price)) return null;
    return { level: swingLine(H1, H2), height: pole, stop: L1.price, lines: [[L0, H1]] };
  }
  if (id === "bear-flag") {
    const [H0, L1, H1, L2] = seq;
    const pole = H0.price - L1.price;
    if (pole / H0.price < SWING_POLE || L1.i - H0.i > SWING_POLE_BARS) return null;
    if (H1.price > L1.price + pole / 2 || !(L2.price > L1.price)) return null;
    return { level: swingLine(L1, L2), height: pole, stop: H1.price, lines: [[H0, L1]] };
  }
  return null;
};

const detectSwingPatterns = (candles) => {
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
    for (const def of SWING_PATTERNS) {
      const k = zz.length - 1;
      if (k + 1 < def.need) continue;
      if (def.end && zz[k].kind !== def.end) continue;
      const seq = zz.slice(k + 1 - def.need);
      const anchor = seq[seq.length - 1];
      const key = `${def.pair || def.id}:${anchor.i}`;
      if (fired.has(key) || b < anchor.i + L) continue;
      const shape = swingShape(def.id, seq);
      if (!shape) continue;
      const bear = def.bear;
      const width = anchor.i - seq[0].i;
      // Out of time, or closed through the invalidation first: never fires
      if (b > anchor.i + width) {
        fired.add(key);
        continue;
      }
      let broken = false;
      for (let m = anchor.i + 1; m <= b; m += 1) {
        if (bear ? c[m].close > shape.stop : c[m].close < shape.stop) broken = true;
      }
      /* A two-way shape's other side keeps its chance: closing through the
         up side's invalidation is usually the down side's breakout. */
      if (broken) {
        if (!def.pair) fired.add(key);
        continue;
      }
      const level = shape.level(b);
      if (!(bear ? c[b].close < level : c[b].close > level)) continue;
      fired.add(key);
      const breakout = c[b].close;
      const target = bear ? breakout - shape.height : breakout + shape.height;
      if ((bear ? breakout >= shape.stop : breakout <= shape.stop) || target <= 0 || !(shape.height > 0)) continue;
      const walk = pricePatternWalk(c, b, target, shape.stop, bear);
      const at = (p) => ({ t: c[p.i].t, price: p.price });
      out.push({
        kind: def.id,
        bear,
        points: seq.map((p) => ({ t: c[p.i].t, price: p.price, kind: p.kind })),
        // The line the close broke, from its first swing point to the breakout
        neck: { from: { t: c[seq[0].i].t, price: shape.level(seq[0].i) }, to: { t: c[b].t, price: level } },
        lines: shape.lines.map(([p, q]) => ({ from: at(p), to: at(q) })),
        at: c[b].t,
        breakout,
        target,
        stop: shape.stop,
        out: walk.out,
        resolvedAt: walk.at == null ? null : c[walk.at].t,
      });
    }
  }
  return out;
};
