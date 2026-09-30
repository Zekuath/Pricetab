/* THE CHART'S COUNTED STUDIES (the chart plan's Phase 4)
 *
 * Six things the chart can count from data it already has, each its own
 * switch (`CHART_STUDIES_KEY`), all off by default:
 *
 *   - **Volume by price** (`profile`): the volume of the bars on screen,
 *     spread evenly across each bar's own high–low, in thirty bands along the
 *     price scale; the band where most changed hands and the 70% around it.
 *     A fact about what traded, not a level anything will do anything at.
 *   - **Where the price sits** (`where`): drawn by the app under the price, not
 *     here — the price's place inside each range's high and low.
 *   - **Unusual volume** (`volumeEvents`): a bar whose volume is 2.5 standard
 *     deviations above the others on screen (log volume, the move marks'
 *     rule), marked on the volume pane with its multiple of the usual. The
 *     multiple only: what followed such days was measured and is in the note,
 *     not on the chart (studies-prereg.md, S7).
 *   - **Regimes** (`regimes`): each day shaded by whether the 20 days to it
 *     rose 5% or more, fell 5% or more, or neither — the Regimes card's own
 *     states (`regimeStates`), backward-looking by construction, and never a
 *     word about what comes next (S5; regimes-prereg.md).
 *   - **The usual range from here** (`usualRange`): a cone from the last price
 *     over a strip of future the chart makes room for, 10th–90th percentile of
 *     how far the range's own stretches of that length travelled, direction
 *     removed (`travelBand`). Measured out of sample: it held 92%, not 80% —
 *     the swings got smaller — and the label says so (S6).
 *   - **Where price has turned** (`turnLevels`): levels three swing points
 *     agreed on, formed walking forward in time, each with how often price
 *     turned there **and how often it turned at any price** — measured on four
 *     coins' history, the two did not differ, so neither is ever emphasised
 *     (S2).
 *
 * Drawn behind the price (shading, profile, cone) and in front of it (levels,
 * marks, words), both clipped to the plot; they take no pointer events. They
 * stand down with calls on and under a comparison, the rule the window in
 * time and the tools follow. Same idiom as `chart-tools.js`; the pure helpers
 * are tested in `tests/test-studies.js`.
 */

const STUDY_PROFILE_BINS = 30;
const STUDY_PROFILE_WIDTH = 0.16; // of the plot, for the busiest band
const STUDY_VALUE_AREA = 0.7;
const STUDY_VOLUME_MIN_BARS = 30;
const STUDY_VOLUME_MARKS = 6; // at most, the largest
const STUDY_FUTURE_SHARE = 0.14; // of the plot, given to the usual range
const STUDY_TURN_JOIN = 0.01; // a pivot joins a level within 1% of it
const STUDY_TURN_PIVOTS = 3; // a level is three pivots that agree
const STUDY_TURN_NEAR = 0.01; // a touch comes from at least 1% away
const STUDY_TURN_MOVE = 0.03; // turned / crossed: a close 3% either side
const STUDY_TURN_DAYS = 10;
const STUDY_TURN_PLACEBOS = 8; // "any price" draws per level
const STUDY_TURN_MAX = 8; // levels drawn, nearest the price first
// Measured out of sample (studies-prereg.md, S6): the median coverage of the
// in-sample 80% band on later data, four coins × three horizons
const STUDY_BAND_HELD = 0.92;

/* ── Pure ──────────────────────────────────────────────────────────────── */

/* Volume by price: each bar's volume spread evenly over its own high–low,
 * summed into `bins` bands between the lowest low and the highest high. The
 * point of control is the busiest band; the value area grows from it, a band
 * at a time on whichever side is busier, until it holds 70% of the volume. */
const volumeProfile = (candles, bins = STUDY_PROFILE_BINS) => {
  const rows = (Array.isArray(candles) ? candles : []).filter(
    (c) => c && Number(c.volume) > 0 && Number(c.high) >= Number(c.low) && Number(c.low) > 0,
  );
  if (rows.length < 2 || !(bins >= 2)) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of rows) {
    lo = Math.min(lo, Number(c.low));
    hi = Math.max(hi, Number(c.high));
  }
  if (!(hi > lo)) return null;
  const step = (hi - lo) / bins;
  const vols = new Array(bins).fill(0);
  for (const c of rows) {
    const l = Number(c.low);
    const h = Number(c.high);
    const v = Number(c.volume);
    if (h === l) {
      vols[Math.min(bins - 1, Math.floor((l - lo) / step))] += v;
      continue;
    }
    const a = Math.max(0, Math.floor((l - lo) / step));
    const b = Math.min(bins - 1, Math.floor((h - lo) / step));
    for (let k = a; k <= b; k++) {
      const overlap = Math.min(h, lo + (k + 1) * step) - Math.max(l, lo + k * step);
      if (overlap > 0) vols[k] += (v * overlap) / (h - l);
    }
  }
  const total = vols.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return null;
  let poc = 0;
  for (let k = 1; k < bins; k++) if (vols[k] > vols[poc]) poc = k;
  let vaLo = poc;
  let vaHi = poc;
  let held = vols[poc];
  while (held < total * STUDY_VALUE_AREA && (vaLo > 0 || vaHi < bins - 1)) {
    const up = vaHi < bins - 1 ? vols[vaHi + 1] : -1;
    const down = vaLo > 0 ? vols[vaLo - 1] : -1;
    if (up >= down) held += vols[++vaHi];
    else held += vols[--vaLo];
  }
  return { lo, hi, step, vols, total, poc, vaLo, vaHi };
};

/* The bars on screen whose volume is unusual among them: log volume at least
 * `sigma` standard deviations above the mean, with its multiple of the median.
 * Nothing under `minBars` bars with volume. The largest first, at most `max`. */
const volumeEventsIn = (bars, sigma, minBars = STUDY_VOLUME_MIN_BARS, max = STUDY_VOLUME_MARKS) => {
  const logs = [];
  const vols = [];
  (Array.isArray(bars) ? bars : []).forEach((b, i) => {
    const v = Number(b && b.volume);
    if (v > 0) {
      logs.push([i, Math.log(v)]);
      vols.push(v);
    }
  });
  if (logs.length < minBars) return [];
  const mean = logs.reduce((s, x) => s + x[1], 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((s, x) => s + (x[1] - mean) ** 2, 0) / logs.length);
  if (!(sd > 0)) return [];
  const sorted = vols.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  return logs
    .map(([index, lv]) => ({ index, z: (lv - mean) / sd, multiple: Math.exp(lv) / median }))
    .filter((e) => e.z >= sigma)
    .sort((a, b) => b.z - a.z)
    .slice(0, max);
};

/* Runs of days in one regime state: `{ from, to, state }` in ms, `to` the
   start of the run's last day. Days with no state yet are left out. */
const regimeSpans = (candles) => {
  const rows = Array.isArray(candles) ? candles : [];
  const states = regimeStates(rows.map((c) => c.close));
  const out = [];
  rows.forEach((c, i) => {
    const s = states[i];
    if (s === null || s === undefined) return;
    const t = c.t * 1000;
    const last = out[out.length - 1];
    if (last && last.state === s && last.i === i - 1) {
      last.to = t;
      last.i = i;
    } else {
      out.push({ from: t, to: t, state: s, i });
    }
  });
  return out.map(({ from, to, state }) => ({ from, to, state }));
};

/* **Where price has turned** — studies-prereg.md, S2, as preregistered.
 *
 * Pivots on daily candles (`pricePivotAt`), each known five bars after it;
 * walking forward, a pivot joins the first candidate within 1% of its mean
 * or starts one, and a candidate becomes a level at its third pivot, its
 * price frozen then. A touch is a later day whose high–low holds the level
 * with the previous close at least 1% away; over the next ten days it
 * **turned** if a close came back 3% on the side it came from before one went
 * 3% beyond, **crossed** the other way round. The base is the same count at
 * prices drawn at random between the lowest low and the highest high after
 * each level formed — "a price the market came to, anywhere". Seeded, so the
 * same history always gives the same base. */
const turnTouches = (c, level, from) => {
  let turned = 0;
  let crossed = 0;
  for (let d = Math.max(1, from + 1); d < c.length; d++) {
    if (!(c[d].low <= level && level <= c[d].high)) continue;
    const prev = c[d - 1].close;
    const above = prev >= level * (1 + STUDY_TURN_NEAR);
    const below = prev <= level * (1 - STUDY_TURN_NEAR);
    if (!above && !below) continue;
    for (let k = d; k <= Math.min(c.length - 1, d + STUDY_TURN_DAYS); k++) {
      const x = c[k].close;
      if (above ? x >= level * (1 + STUDY_TURN_MOVE) : x <= level * (1 - STUDY_TURN_MOVE)) {
        turned++;
        break;
      }
      if (above ? x <= level * (1 - STUDY_TURN_MOVE) : x >= level * (1 + STUDY_TURN_MOVE)) {
        crossed++;
        break;
      }
    }
  }
  return { turned, crossed };
};

const turnLevels = (candles) => {
  const c = Array.isArray(candles) ? candles : [];
  if (c.length < 60 || typeof pricePivotAt !== "function") return null;
  const L = typeof PRICE_PATTERN_PIVOT === "number" ? PRICE_PATTERN_PIVOT : 5;
  const known = [];
  for (let i = L; i + L < c.length; i++) {
    if (pricePivotAt(c, i, "H")) known.push({ at: i + L, price: c[i].high });
    if (pricePivotAt(c, i, "L")) known.push({ at: i + L, price: c[i].low });
  }
  known.sort((a, b) => a.at - b.at);
  const candidates = [];
  const levels = [];
  for (const p of known) {
    const cand = candidates.find((k) => !k.done && Math.abs(p.price / k.mean - 1) <= STUDY_TURN_JOIN);
    if (!cand) {
      candidates.push({ prices: [p.price], mean: p.price, done: false });
      continue;
    }
    cand.prices.push(p.price);
    cand.mean = cand.prices.reduce((s, v) => s + v, 0) / cand.prices.length;
    if (cand.prices.length === STUDY_TURN_PIVOTS) {
      cand.done = true;
      levels.push({ price: cand.mean, from: p.at, t: c[p.at].t * 1000 });
    }
  }
  let seed = 20260929;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const base = { turned: 0, crossed: 0 };
  for (const lv of levels) {
    Object.assign(lv, turnTouches(c, lv.price, lv.from));
    let lo = Infinity;
    let hi = -Infinity;
    for (let d = lv.from; d < c.length; d++) {
      lo = Math.min(lo, c[d].low);
      hi = Math.max(hi, c[d].high);
    }
    for (let k = 0; k < STUDY_TURN_PLACEBOS; k++) {
      const pb = turnTouches(c, lo + (hi - lo) * rand(), lv.from);
      base.turned += pb.turned;
      base.crossed += pb.crossed;
    }
  }
  return { levels, base };
};

/* **Where a price sits** inside each range's high and low: 0 at the low, 1 at
   the high — clamped, since the spot can be a moment newer than a series — for
   every range whose series is at hand. `rows` is `[{ key, prices }]`. */
const rangePositions = (price, rows) => {
  if (!(price > 0) || !Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    const range = deriveRangeStats(r.prices);
    if (!range || !(range.high > range.low)) continue;
    const pos = Math.max(0, Math.min(1, (price - range.low) / (range.high - range.low)));
    out.push({ key: r.key, pos, high: range.high, low: range.low });
  }
  return out;
};

/* **One coin priced in another** — the question "did it beat bitcoin" read
 * as a price. Both series cut to the time they share (`alignComparison`, the
 * comparison's own rule), then each of the first coin's points divided by the
 * second's price at that moment, interpolated between its two nearest points.
 * Null under two points. */
const ratioSeries = (historyA, historyB) => {
  const [a, b] = alignComparison(historyA, historyB);
  if (a.length < 2 || b.length < 2) return null;
  const tb = b.map((p) => +new Date(p.time));
  const out = [];
  let j = 0;
  for (const p of a) {
    const t = +new Date(p.time);
    while (j + 1 < tb.length && tb[j + 1] <= t) j++;
    const k = j + 1 < tb.length && tb[j + 1] > tb[j] ? Math.max(0, Math.min(1, (t - tb[j]) / (tb[j + 1] - tb[j]))) : 0;
    const pb = Number(b[j].price) + (j + 1 < tb.length ? (Number(b[j + 1].price) - Number(b[j].price)) * k : 0);
    const pa = Number(p.price);
    if (pa > 0 && pb > 0) out.push({ price: pa / pb, time: p.time instanceof Date ? p.time : new Date(t) });
  }
  return out.length >= 2 ? out : null;
};

/* ── Drawing ───────────────────────────────────────────────────────────── */

const chartStudies = (chart) => ({
  studiesOn: () =>
    Array.isArray(chart.props.studies) &&
    chart.props.studies.length > 0 &&
    !chart.props.predict &&
    !chart.compareScaled &&
    !chart.props.compareCoin,
  studyOn: (id) => chart.studiesOn() && chart.props.studies.includes(id),

  /* The strip of future the usual range is drawn into. The series slides
     left by it, the board's own arrangement, so nothing is squeezed. */
  studyFutureWidth: () =>
    chart.studyOn("usualRange") && chart.width > 0 ? Math.round(chart.width * STUDY_FUTURE_SHARE) : 0,

  studyNode: (pool, tag, layer) => chart.poolNode(chart._studies[pool], tag, layer),

  studyRect: (x, y, w, h, fill, opacity) => {
    const el = chart.studyNode("rects", "rect", chart.studiesBackRef.current);
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.setAttribute("width", Math.max(0, w));
    el.setAttribute("height", Math.max(0, h));
    el.setAttribute("fill", fill);
    el.setAttribute("fill-opacity", String(opacity));
    el.removeAttribute("data-study");
    return el;
  },

  studyPath: (d, fill, opacity, stroke) => {
    const el = chart.studyNode("paths", "path", chart.studiesBackRef.current);
    el.setAttribute("d", d);
    el.setAttribute("fill", fill);
    el.setAttribute("fill-opacity", String(opacity));
    el.setAttribute("stroke", stroke || "none");
    el.setAttribute("stroke-dasharray", "3 3");
    return el;
  },

  studyLine: (x1, y1, x2, y2, ink, opacity, dash) => {
    const el = chart.studyNode("lines", "line", chart.studyGroup("lines"));
    el.setAttribute("x1", x1);
    el.setAttribute("y1", y1);
    el.setAttribute("x2", x2);
    el.setAttribute("y2", y2);
    el.setAttribute("stroke", ink);
    el.setAttribute("stroke-opacity", String(opacity == null ? 1 : opacity));
    el.setAttribute("stroke-width", "1");
    el.setAttribute("stroke-dasharray", dash || "none");
    el.removeAttribute("data-study");
    return el;
  },

  /* Front words, over a pill of the page's ground so they read over the line
     — and never over another study's words: a label that would land on one
     already placed this draw steps down a line (up, near the foot) until it
     is clear. Two studies had put their headers on the same corner. */
  studyLabel: (x, y0, text, ink, anchor, tag) => {
    const { color, font } = chart.props.theme;
    const w = text.length * AXIS_CHAR + 8;
    const left = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
    const boxes = chart._studyBoxes || (chart._studyBoxes = []);
    const hits = (yy) => boxes.some((b) => left < b.x + b.w && left + w > b.x && yy - 11 < b.y + 15 && yy + 4 > b.y);
    const dir = y0 > chart.height - 40 ? -1 : 1;
    let y = y0;
    for (let k = 0; k < 8 && hits(y); k++) y += dir * 16;
    boxes.push({ x: left, y: y - 11, w });
    const pill = chart.studyNode("pills", "rect", chart.studyGroup("pills"));
    pill.setAttribute("x", left);
    pill.setAttribute("y", y - 11);
    pill.setAttribute("width", w);
    pill.setAttribute("height", 15);
    pill.setAttribute("rx", "3");
    pill.setAttribute("fill", color.bg);
    pill.setAttribute("fill-opacity", "0.9");
    const el = chart.studyNode("texts", "text", chart.studyGroup("words"));
    el.setAttribute("x", left + 4);
    el.setAttribute("y", y);
    el.setAttribute("fill", ink);
    el.setAttribute("font-size", "10");
    el.setAttribute("font-family", font.primary);
    if (tag) el.setAttribute("data-study", tag);
    else el.removeAttribute("data-study");
    if (el.textContent !== text) el.textContent = text;
    return el;
  },

  // The front layer's groups, in paint order (see chart-axes.js)
  studyGroup: (kind) => {
    const layer = chart.studiesFrontRef.current;
    const pools = chart._studies;
    if (!pools.groups) pools.groups = {};
    let g = pools.groups[kind];
    if (!g || g.parentNode !== layer) {
      g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-study-layer", kind);
      const order = ["lines", "pills", "words"];
      const after = order.slice(order.indexOf(kind) + 1).map((k) => pools.groups[k]).find((n) => n && n.parentNode === layer);
      layer.insertBefore(g, after || null);
      pools.groups[kind] = g;
    }
    return g;
  },

  /* The bars the profile and the volume marks read: the candles drawn, or in
     line mode the range's candles if the crosshair has them — asked for once
     when a study needs them and nothing has. */
  studyCandles: () => {
    const map = chart.axisTimeMap();
    const source = chart.props.showCandles && Array.isArray(chart.props.candles) ? chart.props.candles : chart.props.ohlc;
    if (!Array.isArray(source) || !source.length) {
      if (!chart._askedForOhlc && chart.props.onNeedOhlc) {
        chart._askedForOhlc = true;
        chart.props.onNeedOhlc();
      }
      return null;
    }
    if (!map) return source;
    const t0 = map.toT(0);
    const t1 = map.toT(chart.width);
    return source.filter((c) => {
      const t = +new Date(c.time);
      return t >= t0 && t <= t1;
    });
  },

  updateStudies: () => {
    const back = chart.studiesBackRef.current;
    const front = chart.studiesFrontRef.current;
    if (!back || !front || !chart._studies) return;
    const pools = chart._studies;
    const kinds = ["rects", "paths", "lines", "pills", "texts"];
    for (const k of kinds) pools[k].at = 0;
    chart._studyBoxes = [];
    const done = () => {
      for (const k of kinds) chart.hideRest(pools[k]);
    };
    const sc = chart.studiesOn() ? chart.plotScale() : null;
    if (!sc || !(chart.width > 0) || !(chart.height > 0)) {
      done();
      return;
    }
    const clip = chart.studyClipRef.current;
    if (clip) {
      clip.setAttribute("width", chart.width);
      clip.setAttribute("height", chart.height);
    }
    const { color } = chart.props.theme;
    const W = chart.width;
    const H = chart.height;
    const fmt = chart.props.formatPrice ? (v) => String(chart.props.formatPrice(v)) : (v) => v.toFixed(2);

    // ── Regimes: behind everything, a faint band per run of days
    if (chart.studyOn("regimes") && Array.isArray(chart.props.studyDaily)) {
      const spans = chart.studyRegimeMemo();
      let rising = 0;
      let falling = 0;
      for (const s of spans) {
        if (s.state === 1) continue;
        const x0 = Math.max(0, sc.toX(s.from));
        const x1 = Math.min(W, sc.toX(s.to + 86400000));
        if (!(x1 > x0)) continue;
        chart.studyRect(x0, 0, x1 - x0, H, s.state === 0 ? color.chartLineGreen : color.chartLineRed, 0.06).setAttribute("data-study", "regime");
        if (s.state === 0) rising += x1 - x0;
        else falling += x1 - x0;
      }
      chart.studyLabel(
        6,
        H - 8,
        msg("study_regime_label", "Shaded: the 20 days to each day rose ≥5% (green) or fell ≥5% (red) — $1% / $2% of this view", String(Math.round((rising / W) * 100)), String(Math.round((falling / W) * 100))),
        color.textSecondary,
        "start",
        "regime",
      );
    }

    // ── Volume by price: bands from the right edge of the price
    if (chart.studyOn("profile")) {
      const bars = chart.studyCandles();
      const prof = bars ? volumeProfile(bars) : null;
      if (prof) {
        const max = Math.max(...prof.vols);
        const right = W - chart.studyFutureWidth();
        const most = W * STUDY_PROFILE_WIDTH;
        for (let k = 0; k < prof.vols.length; k++) {
          const yTop = sc.toY(prof.lo + (k + 1) * prof.step);
          const yBot = sc.toY(prof.lo + k * prof.step);
          if (!isFinite(yTop) || !isFinite(yBot)) continue;
          const w = (prof.vols[k] / max) * most;
          const inside = k >= prof.vaLo && k <= prof.vaHi;
          chart.studyRect(right - w, Math.min(yTop, yBot) + 0.5, w, Math.abs(yBot - yTop) - 1, k === prof.poc ? color.text : color.textSecondary, k === prof.poc ? 0.3 : inside ? 0.2 : 0.1).setAttribute("data-study", "profile");
        }
        const pocPrice = prof.lo + (prof.poc + 0.5) * prof.step;
        const yPoc = sc.toY(pocPrice);
        if (isFinite(yPoc)) {
          chart.studyLine(0, yPoc, right, yPoc, color.textSecondary, 0.5, "2 4");
          chart.studyLabel(right - most - 6, yPoc + 4, msg("study_profile_poc", "Most traded $1", fmt(pocPrice)), color.text, "end", "profile");
        }
        const vaLo = prof.lo + prof.vaLo * prof.step;
        const vaHi = prof.lo + (prof.vaHi + 1) * prof.step;
        chart.studyLabel(right - 4, 14, msg("study_profile_label", "Volume by price · 70% between $1 and $2", fmt(vaLo), fmt(vaHi)), color.textSecondary, "end", "profile");
      }
    }

    // ── The usual range from here: a cone into the strip of future
    if (chart.studyOn("usualRange")) {
      const scaled = chart.scaled;
      const data = safePrices(chart.props.prices);
      const future = chart.studyFutureWidth();
      if (scaled && scaled.length > 2 && future > 0) {
        const first = scaled[0];
        const lastPt = scaled[scaled.length - 1];
        const perStep = (lastPt.time - first.time) / (scaled.length - 1);
        const steps = perStep > 0 ? Math.max(1, Math.round(future / perStep)) : 0;
        const series = chart.props.countSeries || chart.props.prices;
        const band = steps ? travelBand(series, steps, 0.1, 0.9) : null;
        const last = Number(data[data.length - 1].price);
        const map = chart.axisTimeMap();
        if (band && last > 0) {
          const x0 = lastPt.time;
          const x1 = W;
          const y0 = sc.toY(last);
          const yHi = sc.toY(last * band.hi);
          const yLo = sc.toY(last * band.lo);
          if ([y0, yHi, yLo].every(isFinite)) {
            chart.studyPath(`M${x0},${y0}L${x1},${yHi}L${x1},${yLo}Z`, color.textSecondary, 0.12, color.textSecondary).setAttribute("data-study", "usual-range");
            const span = map ? map.toT(W) - map.toT(x0) : 0;
            chart.studyLabel(x1 - 4, Math.max(14, Math.min(yHi, yLo) - 8), msg("study_range_label", "80% of $1 past stretches of $2 ended in here", String(band.n), describeSpan(span) || "—"), color.textSecondary, "end", "usual-range");
            chart.studyLabel(x1 - 4, Math.min(H - 4, Math.max(yHi, yLo) + 16), msg("study_range_held", "held $1% on later data", String(Math.round(STUDY_BAND_HELD * 100))), color.textSecondary, "end", "usual-range");
          }
        } else if (map) {
          chart.studyLabel(W - 4, 14, msg("study_range_few", "Too few stretches this long here for a usual range"), color.textSecondary, "end", "usual-range");
        }
      }
    }

    // ── Where price has turned: levels in the neutral ink, with their base
    if (chart.studyOn("turnLevels") && Array.isArray(chart.props.studyDaily)) {
      const found = chart.studyTurnMemo();
      if (found && found.levels.length) {
        const top = sc.toV(0);
        const bottom = sc.toV(H);
        const lo = Math.min(top, bottom);
        const hi = Math.max(top, bottom);
        const data = safePrices(chart.props.prices);
        const last = Number(data[data.length - 1].price);
        const baseN = found.base.turned + found.base.crossed;
        const baseShare = baseN ? Math.round((found.base.turned / baseN) * 100) : null;
        const shown = found.levels
          .filter((l) => l.price >= lo && l.price <= hi)
          .sort((a, b) => Math.abs(a.price - last) - Math.abs(b.price - last))
          .slice(0, STUDY_TURN_MAX);
        for (const l of shown) {
          const y = sc.toY(l.price);
          if (!isFinite(y)) continue;
          chart.studyLine(0, y, W, y, color.textSecondary, 0.55, "6 4").setAttribute("data-study", "turn-level");
          const n = l.turned + l.crossed;
          const text =
            n >= BASE_RATE_MIN_EPISODES && baseShare !== null
              ? msg("study_turn_label", "Turned here $1 of $2 · any price $3%", String(l.turned), String(n), String(baseShare))
              : msg("study_turn_few", "Turned here $1 of $2", String(l.turned), String(n));
          chart.studyLabel(8, y - 4, `${fmt(l.price)} · ${text}`, color.textSecondary, "start", "turn-level");
        }
      }
    }

    // ── Unusual volume: on the volume pane, over the bar
    if (chart.studyOn("volumeEvents") && chart.props.showCandles && chart.props.showVolume && chart.candleScale && chart.candleBars) {
      const bars = chart.candleBars;
      const geo = chart.candleScale.bars;
      const events = volumeEventsIn(bars, MOVE_NEWS_SIGMA);
      if (events.length && geo.length === bars.length) {
        const vols = bars.map((b) => Number(b.volume) || 0).filter((v) => v > 0).sort((a, b) => a - b);
        const cutoff = vols[Math.floor((vols.length - 1) * 0.95)];
        const bandTop = H * (1 - VOLUME_BAND_RATIO);
        for (const e of events) {
          const g = geo[e.index];
          const v = Number(bars[e.index].volume);
          const h = Math.max(1, Math.min(1, v / cutoff) * (H - bandTop));
          const y = H - h - 3;
          chart.studyLine(g.x, y, g.x, y - 6, color.text, 0.8).setAttribute("data-study", "volume-event");
          chart.studyLabel(g.x, y - 8, `${e.multiple.toFixed(1)}×`, color.text, "middle", "volume-event");
        }
      }
    }
    done();
  },

  // The heavy ones, once per series of daily candles
  studyRegimeMemo: () => {
    const daily = chart.props.studyDaily;
    if (!chart._regimeMemo || chart._regimeMemo.daily !== daily) {
      chart._regimeMemo = { daily, spans: regimeSpans(daily) };
    }
    return chart._regimeMemo.spans;
  },
  studyTurnMemo: () => {
    const daily = chart.props.studyDaily;
    if (!chart._turnMemo || chart._turnMemo.daily !== daily) {
      chart._turnMemo = { daily, found: turnLevels(daily) };
    }
    return chart._turnMemo.found;
  },
});
