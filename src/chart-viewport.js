/* THE CHART'S WINDOW IN TIME — zoom and pan (the chart plan's Phase 2)
 *
 * A range button is a preset; inside it the chart can be narrowed with the
 * wheel or a trackpad pinch, dragged sideways, stepped with + and −, walked
 * with ← and → while the chart has the focus, and put back with a
 * double-click or the Reset chip. The window is a start and an end in time,
 * held here while a gesture runs and handed to the app once it ends — the
 * rule the widgets drawer's drag follows — so the root does not re-render at
 * the pointer's rate.
 *
 * **How the chart is told.** Not through a new mode in `LineBase`: the series
 * it is handed is cut to the window (`sliceSeries`, with the price at each
 * edge interpolated so the line runs edge to edge and a pan slides rather than
 * steps), so every layer placed from the series' own ends — the axes, the CPI
 * marks, the companion, the overlays, the average — follows by construction.
 * The candles are cut to the bars inside the window, and the move marks, which
 * point into the series by index, are pointed again by time.
 *
 * **More detail as it narrows.** Every range is about 300 points, so a zoom on
 * them alone shows nothing new. The app asks for Coinbase Exchange candles at
 * the granularity that puts at most `VIEW_MAX_BARS` in the window
 * (`viewGranularity`) and hands them back as `detail`; until they land — and
 * wherever the window runs past what they cover — the range's own series is
 * drawn. Never a blank.
 *
 * **Where it stands down.** With calls on, because the board's lattice is
 * welded to the clock and to its own reach; and under a comparison, because
 * both lines are percent change from the range's first moment, which the
 * strip above the chart reads too. The app passes `viewEnabled: false` and the
 * chart is drawn exactly as it was.
 *
 * The first half of the file is pure and tested in `tests/test-viewport.js`.
 */

// Coinbase Exchange's candle sizes, finest first, in seconds
const VIEW_GRANULARITIES = [60, 300, 900, 3600, 21600, 86400];
// At most this many bars of detail in the window — about the density of a
// range's own series, so a zoom reads like a range and costs two requests
const VIEW_MAX_BARS = 300;
// The narrowest window, in the finest bars the coin has: 24 minutes of 1m
const VIEW_MIN_BARS = 24;
// Without finer data, no narrower than this many of the range's own points
const VIEW_MIN_POINTS = 12;
const VIEW_ZOOM_STEP = 1.5; // one press of + or −
const VIEW_PAN_STEP = 0.2; // one arrow: a fifth of the window
/* Zooming out past the whole range moves to the next range (30 Sep 2026,
   left from Phase 2) — after this much more wheel than the range needed,
   so a flick that only reached the whole range does not also leave it, and
   not again for a moment, so one flick's momentum cannot walk 1H to ALL. */
const VIEW_PAST_WHEEL = 300;
const VIEW_PAST_IDLE_MS = 450;
const VIEW_PAST_COOL_MS = 900;
const VIEW_DRAG_SLOP = 6; // px before a press is a pan — CALL_DRAG_SLOP's rule
/* **A drag pans, and only pans** (10 Oct 2026). From 1 Oct a hand pulling past the oldest point opened the
   longer range — measured: 13 frames of nothing, then the line jumped 20–26px
   a frame and came back as 64 points instead of 362. Now, as the window comes
   within this share of a window of the oldest bar loaded, the app is asked
   for older bars at the series' own step (`onNeedHistory`, the zoomed
   chart's own Exchange pages), and the hand carries on into them; where none
   can be had, the pan stops at the oldest point. A zoom still changes the
   range; a drag never does. */
const VIEW_HISTORY_AHEAD = 0.75;
// How far a vertical drag may slide the price window, in windows each way
const VIEW_Y_MAX = 1.5;
/* **The chart keeps its shape under the hand** (9 Oct 2026). A pan holds the price window drawn when the hand
   started — shiftDomain's `{ lo, hi }` — and moves it up and down with the
   hand from the first pixel, as a map moves. Until then the price was held
   only after a deliberate vertical move (10px, 2 Oct 2026) and re-fitted to
   every window a sideways pan passed through, so the line changed shape
   under the hand. The price stays held when the hand lets go; the "Auto"
   under the price scale, a double-click, or Whole range gives it back to the
   data (`fitScale`). */
/* **The wheel zooms into the point, in price too** (9 Oct 2026). Time zooms about the pointer, and the price window
   about the line's own price there — the point the crosshair's dot sits on —
   by the time factor to this power: prices travel roughly with the square
   root of time, so the line keeps about the same roughness at every zoom,
   and the dot stays where it is. It re-fitted instead, and the dot slid
   70–150px a notch. Out at the whole range the scale is the data's again.
   **About the pointer itself, not the line** (11 Oct 2026). Anchored on the line's price, a pointer 80px above or
   below the line watched the price under it slide 31–40px in five notches
   (measured, 1D and 1W): the zoom went towards the line, not where the
   pointer was. The price under the pointer is the anchor now — on the line
   it is the dot, as before. */
const VIEW_Y_ZOOM = 0.5;
/* The main chart's zoom feels flatter at 0.5 (more time than price). Its
  own view now asks for a slightly stronger vertical response, while other
  chart surfaces keep the older feel. */
const VIEW_Y_ZOOM_MAIN = 0.68;
/* Dragging the price scale itself stretches the window around its middle,
   TradingView's other vertical gesture: a full plot's height of travel is
   e^this — down widens the window (the line flattens), up narrows it. */
const VIEW_AXIS_STRETCH = 1.6;
/* **A finger reads the chart by holding still** (3 Oct 2026, the phone
   pass): a touch that stays within the drag's slop this long becomes the
   crosshair — moving then reads the line rather than panning it — and two
   taps this close together put the whole range back, as a double-click does.
   The numbers are the platforms' own: a long press is about a third of a
   second, a double tap a third of a second and a thumb's width apart. */
const VIEW_HOLD_MS = 350;
const VIEW_DOUBLE_TAP_MS = 320;
const VIEW_DOUBLE_TAP_PX = 30;
/* **Room past the latest price** (2 Oct 2026). A drag towards the future
   stopped dead at the last point; TradingView lets the chart go on into empty
   time. A window may end this share of its own span past the latest price — the
   line stops where the data does and the rest is blank time on the axis — and a
   window that ends there keeps that room as new prices arrive. Pans only: a
   zoom still fits the range. **0.85 since 14 Oct 2026**: at 0.4 the latest
   price could go no further than 60% across, so with Room Ahead resting at
   15% a single pull hit the wall — measured, 300px of drag moved the line
   300px and the next two moved it nothing. The latest price may now go to
   the left 15% of the window, as on TradingView. */
const VIEW_FUTURE_ROOM = 0.85;
/* The room a wheel zoom *in* may take past the price: the 0.4 every zoom
   had before the pan's room grew to 0.85, or the window's own when it
   already has more — the pan's room is for pans, and a zoom keeps the
   behaviour it had. */
const VIEW_ZOOM_ROOM = 0.4;
/* The resting chart's room past the price when Settings → "Room ahead" is on
   (ROOM_AHEAD_KEY): the range's own width, moved this share into the future.
   TradingView's default right margin is a few bars; a share of the range is
   the same idea at every range. */
const VIEW_REST_ROOM = 0.15;
const VIEW_WHEEL_SETTLE_MS = 240; // quiet this long and a wheel gesture has ended
/* **A mouse wheel's notch glides** (11 Oct 2026). Measured frame by frame: a trackpad's stream of
   small deltas zoomed smoothly, and a mouse notch moved the window 14–16% in
   a single frame — a staircase. A notch now sets a target and each frame
   takes this much of what is left (an exponential ease, time constant
   VIEW_WHEEL_GLIDE_MS — about 150 ms to settle), every step about the
   pointer, so the point under it holds through the glide. Notches arriving
   mid-glide add to the target. A trackpad, a pinch, and reduced motion are
   applied as they come. */
const VIEW_WHEEL_GLIDE_MS = 45;
// A delta this large in pixels, or any delta in lines or pages, is a notch
const VIEW_WHEEL_NOTCH = 40;
// A window ending this close to the latest price (as a share of its span)
// follows the price as it arrives, rather than staying where it was put
const VIEW_AT_NOW = 0.01;
// More points than this many per pixel and the line is thinned (`lttb`)
const VIEW_LTTB_OVER = 1.5;
// Finer data is worth a request only when it is finer than this share of the
// step the chart already has
const VIEW_FINER = 0.8;

const viewMs = (t) => (t instanceof Date ? t.getTime() : Number(t));

/* The coarsest granularity that still puts no more than `VIEW_MAX_BARS` in a
   window this long — the finest that is worth asking for. */
const viewGranularity = (spanMs) => {
  for (const g of VIEW_GRANULARITIES) {
    if (spanMs / (g * 1000) <= VIEW_MAX_BARS) return g;
  }
  return VIEW_GRANULARITIES[VIEW_GRANULARITIES.length - 1];
};

/* The typical distance between points, as a median so one gap in a feed does
   not decide it. */
const viewStep = (points, key = "time") => {
  if (!Array.isArray(points) || points.length < 2) return 0;
  const gaps = [];
  for (let i = 1; i < points.length; i++) {
    const d = viewMs(points[i][key]) - viewMs(points[i - 1][key]);
    if (d > 0) gaps.push(d);
  }
  if (!gaps.length) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
};

/* A window of `span` placed as near `t0` as the bounds allow. The span is
   held between `minSpan` and the whole range. Null without a range. */
const clampView = (t0, span, lo, hi, minSpan) => {
  const full = hi - lo;
  if (!(full > 0) || !isFinite(t0) || !isFinite(span)) return null;
  const s = Math.min(full, Math.max(Math.min(minSpan || 0, full), span));
  const a = Math.max(lo, Math.min(hi - s, t0));
  return { t0: a, t1: a + s };
};

/* Zoom by `factor` (under 1 is in) with `anchor` holding its place on screen
   — the instant under the pointer stays under the pointer. */
/* `room`: the share of the new window that may lie past the latest price —
   a window already in the blank future keeps the instant under the pointer
   where it was, instead of being pushed back onto the data. */
const zoomView = (view, factor, anchor, lo, hi, minSpan, room = 0) => {
  if (!view || !(factor > 0)) return null;
  const span = view.t1 - view.t0;
  if (!(span > 0)) return null;
  const at = isFinite(anchor)
    ? Math.max(view.t0, Math.min(view.t1, anchor))
    : (view.t0 + view.t1) / 2;
  const share = (at - view.t0) / span;
  const full = hi - lo;
  const next = Math.min(
    full,
    Math.max(Math.min(minSpan || 0, full), span * factor),
  );
  return clampView(
    at - share * next,
    next,
    lo,
    hi + Math.max(0, room) * next,
    minSpan,
  );
};

/* Move by `delta` ms (positive is later), stopping at either end — or, with
   `room`, that share of the window past the latest price. */
const panView = (view, delta, lo, hi, room = 0) => {
  if (!view || !isFinite(delta)) return null;
  const span = view.t1 - view.t0;
  return clampView(view.t0 + delta, span, lo, hi + Math.max(0, room) * span, 0);
};

/* The whole range — the same as no window at all. A window with room past
   the latest price is a window, however wide. */
/* The whole range: as wide as it, ending at its end — and not standing in
   the older bars a pan brought in before its start (10 Oct 2026), which a
   window as wide as the range can do and is not the range. */
const viewIsFull = (view, lo, hi) =>
  !view ||
  (view.t1 - view.t0 >= (hi - lo) * 0.999 &&
    !(view.t1 > hi + 1) &&
    !(view.t0 < lo - (hi - lo) * 0.001));

// The first index whose time is at or after `t`
const viewSearch = (points, t, key = "time") => {
  let a = 0;
  let b = points.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (viewMs(points[m][key]) < t) a = m + 1;
    else b = m;
  }
  return a;
};

/* The series cut to [t0, t1], with the price at each edge interpolated from
 * the two points either side of it — so the line reaches both edges and a pan
 * slides it along. The two edge points carry `edge: true` and the crosshair
 * never reads one: they are where the line crosses the frame, not a price
 * anyone quoted. */
const sliceSeries = (points, t0, t1) => {
  if (!Array.isArray(points) || points.length < 2 || !(t1 > t0)) return points;
  const n = points.length;
  const at = (i) => viewMs(points[i].time);
  const priceAt = (t) => {
    const j = Math.min(n - 1, Math.max(1, viewSearch(points, t)));
    const a = at(j - 1);
    const b = at(j);
    const pa = Number(points[j - 1].price);
    const pb = Number(points[j].price);
    if (!(b > a)) return pb;
    const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return pa + (pb - pa) * k;
  };
  const i0 = viewSearch(points, t0);
  let i1 = viewSearch(points, t1);
  if (i1 < n && at(i1) === t1) i1 += 1; // a point exactly on the edge is kept
  const out = [];
  if (i0 >= n || at(i0) > t0)
    out.push({ price: priceAt(t0), time: new Date(t0), edge: true });
  for (let i = i0; i < i1; i++) out.push(points[i]);
  if (!out.length || viewMs(out[out.length - 1].time) < t1) {
    out.push({ price: priceAt(t1), time: new Date(t1), edge: true });
  }
  return out.length >= 2 ? out : points;
};

/* Every candle that overlaps [t0, t1]: one that opened before the window but
   is still open at its start counts, because part of it is on screen. */
const sliceCandles = (candles, t0, t1) => {
  if (!Array.isArray(candles) || !candles.length) return candles;
  const step = viewStep(candles) || 0;
  const i0 = viewSearch(candles, t0 - step + 1);
  let i1 = viewSearch(candles, t1);
  if (i1 < candles.length && viewMs(candles[i1].time) === t1) i1 += 1;
  return candles.slice(i0, Math.max(i0, i1));
};

/* **Largest-Triangle-Three-Buckets.** At most `threshold` points of `points`,
 * chosen so the drawn shape survives: the first and the last always, and from
 * each bucket between them the point making the largest triangle with the one
 * kept before it and the average of the bucket after — which is the spike, not
 * the mean. Steinarsson (2013). Returns the input when it is already short
 * enough, so a caller can apply it unconditionally. */
/* **M4: thinned on the clock** (12 Oct 2026). Jugel et al., "M4: A
   Visualization-Oriented Time Series Data Aggregation" (VLDB 2014): keep each
   pixel column's first, lowest, highest and last point and a line drawn from
   them is the line drawn from all of them, pixel for pixel. The columns are
   cut on absolute time (`floor(t / bucket)`), so a sideways drag — whose
   span, and so whose bucket, does not change — keeps every column it keeps
   on screen exactly as it was. LTTB's buckets started at the window's first
   point and re-chose its points at every step of a drag. */
const m4 = (points, t0, t1, columns) => {
  if (
    !Array.isArray(points) ||
    points.length < 3 ||
    !(columns > 0) ||
    !(t1 > t0)
  )
    return points;
  const bucket = (t1 - t0) / columns;
  const out = [];
  let key = null;
  let first = null;
  let lo = null;
  let hi = null;
  let last = null;
  const flush = () => {
    if (!first) return;
    const keep = [first, lo, hi, last].filter((p, i, a) => a.indexOf(p) === i);
    keep.sort((a, b) => viewMs(a.time) - viewMs(b.time));
    for (const p of keep) out.push(p);
  };
  for (const p of points) {
    const k = Math.floor(viewMs(p.time) / bucket);
    if (k !== key) {
      flush();
      key = k;
      first = lo = hi = last = p;
      continue;
    }
    if (Number(p.price) < Number(lo.price)) lo = p;
    if (Number(p.price) > Number(hi.price)) hi = p;
    last = p;
  }
  flush();
  return out;
};

const lttb = (points, threshold) => {
  const n = Array.isArray(points) ? points.length : 0;
  if (!(threshold >= 3) || n <= threshold) return points;
  const x = (p) => viewMs(p.time);
  const y = (p) => Number(p.price);
  const out = [points[0]];
  const every = (n - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    const from = Math.floor((i + 1) * every) + 1;
    const to = Math.min(n, Math.floor((i + 2) * every) + 1);
    let ax = 0;
    let ay = 0;
    for (let j = from; j < to; j++) {
      ax += x(points[j]);
      ay += y(points[j]);
    }
    const len = Math.max(1, to - from);
    ax /= len;
    ay /= len;
    const lo = Math.floor(i * every) + 1;
    const hi = Math.floor((i + 1) * every) + 1;
    const px = x(points[a]);
    const py = y(points[a]);
    let best = -1;
    let pick = lo;
    for (let j = lo; j < hi; j++) {
      const area = Math.abs(
        (px - ax) * (y(points[j]) - py) - (px - x(points[j])) * (ay - py),
      );
      if (area > best) {
        best = area;
        pick = j;
      }
    }
    out.push(points[pick]);
    a = pick;
  }
  out.push(points[n - 1]);
  return out;
};

/* The move marks point into the series by index; in a window they point
   into a different array, so each is pointed again at the point nearest its
   own time — and one outside the window is not drawn. */
const remapMoves = (moves, line) => {
  if (
    !Array.isArray(moves) ||
    !moves.length ||
    !Array.isArray(line) ||
    line.length < 2
  )
    return moves;
  const t0 = viewMs(line[0].time);
  const t1 = viewMs(line[line.length - 1].time);
  const out = [];
  for (const m of moves) {
    if (!(m.time >= t0 && m.time <= t1)) continue;
    let i = Math.min(line.length - 1, viewSearch(line, m.time));
    if (
      i > 0 &&
      Math.abs(viewMs(line[i - 1].time) - m.time) <
        Math.abs(viewMs(line[i].time) - m.time)
    )
      i -= 1;
    if (line[i].edge) i = i === 0 ? 1 : line.length - 2;
    out.push(Object.assign({}, m, { index: i }));
  }
  return out;
};

/* Is `detail` usable for this window: the same coin and currency, finer than
   what the chart already has, and covering the whole window? */
const detailCovers = (detail, coin, currency, t0, t1, coarseMs) => {
  if (!detail || detail.coin !== coin || detail.currency !== currency)
    return false;
  const rows = detail.candles;
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const g = detail.g * 1000;
  if (!(g > 0) || (coarseMs > 0 && !(g < coarseMs * VIEW_FINER))) return false;
  return (
    viewMs(rows[0].time) <= t0 + g &&
    viewMs(rows[rows.length - 1].time) + 2 * g >= t1
  );
};

/* The window as the screen shows it: a window at the end follows the price
   to wherever the end now is. */
const resolveView = (view, lo, hi, minSpan) => {
  if (!view || !(hi > lo)) return null;
  const span = view.t1 - view.t0;
  /* The room past the latest price, as a share of the span: stored with a
     committed window, read off the ends of one in the hand. */
  const given = Number.isFinite(view.ahead)
    ? view.ahead
    : span > 0
      ? (view.t1 - hi) / span
      : 0;
  const ahead = Math.max(0, Math.min(VIEW_FUTURE_ROOM, given));
  const atNow = Boolean(view.atNow) || ahead > 0;
  const hiX = hi + ahead * span;
  const out = atNow
    ? clampView(hiX - span, span, lo, hiX, minSpan)
    : clampView(view.t0, span, lo, hi, minSpan);
  if (!out || viewIsFull(out, lo, hi)) return null;
  return Object.assign(out, {
    atNow: atNow || out.t1 >= hi,
    ahead: out.t1 > hi ? (out.t1 - hi) / (out.t1 - out.t0) : 0,
  });
};

/* "Sep 14, 09:00 – 15:30": the window's two ends, the date said once when
   both fall on the same day. */
const viewWindowText = (t0, t1) => {
  const day = { month: "short", day: "numeric" };
  const clock = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  const a = new Date(t0);
  const b = new Date(t1);
  const span = t1 - t0;
  if (span >= 7 * 86400000)
    return `${localeDate(a, day)} – ${localeDate(b, day)}`;
  const same = a.toDateString() === b.toDateString();
  const left = `${localeDate(a, day)}, ${localeDate(a, clock)}`;
  const right = same
    ? localeDate(b, clock)
    : `${localeDate(b, day)}, ${localeDate(b, clock)}`;
  return `${left} – ${right}`;
};

/* **The chart in one sentence**, for a screen reader (the chart plan's
 * Phase 6): which coin, in what, over which stretch, from what to what, and
 * where it was highest and lowest — the numbers a sighted reader takes from
 * the line at a glance. The stretch is the points' own first and last time,
 * so a zoomed window describes itself. Nothing about what comes next. */
const chartSummaryText = (points, opts) => {
  const list = (Array.isArray(points) ? points : []).filter(
    (p) => p && !p.edge && Number(p.price) > 0,
  );
  if (list.length < 2) return "";
  const { coin, currency, fmt, when } = opts;
  const first = list[0];
  const last = list[list.length - 1];
  let hi = first;
  let lo = first;
  for (const p of list) {
    if (Number(p.price) > Number(hi.price)) hi = p;
    if (Number(p.price) < Number(lo.price)) lo = p;
  }
  const change =
    ((Number(last.price) - Number(first.price)) / Number(first.price)) * 100;
  const size = `${localeNumber(Math.abs(change), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const move =
    Math.abs(change) < 0.005
      ? msg("sum_flat", "unchanged")
      : change > 0
        ? msg("sum_up", "up $1", size)
        : msg("sum_down", "down $1", size);
  return msg(
    "chart_summary",
    "$1 in $2, $3: from $4 to $5, $6. Highest $7 at $8, lowest $9 at $10.",
    coin,
    currency,
    viewWindowText(viewMs(first.time), viewMs(last.time)),
    fmt(first.price),
    fmt(last.price),
    move,
    fmt(hi.price),
    when(hi.time),
    fmt(lo.price),
    when(lo.time),
  );
};

/* **The whole range, drawn small** — the navigator's line (30 Sep 2026, left
 * from Phase 2). About one point for every one and a half pixels, in a box
 * w × h, the first and last points always in. Pure. */
const navSparkPath = (prices, w, h) => {
  const list = (Array.isArray(prices) ? prices : []).filter(
    (p) => p && Number(p.price) > 0,
  );
  if (list.length < 2 || !(w > 0) || !(h > 2)) return "";
  const t0 = viewMs(list[0].time);
  const t1 = viewMs(list[list.length - 1].time);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of list) {
    const v = Number(p.price);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = t1 - t0 || 1;
  const range = hi - lo || 1;
  const step = Math.max(1, Math.floor(list.length / (w * 1.5)));
  const pts = [];
  for (let i = 0; i < list.length; i += step) pts.push(list[i]);
  if (pts[pts.length - 1] !== list[list.length - 1])
    pts.push(list[list.length - 1]);
  return pts
    .map((p, i) => {
      const x = ((viewMs(p.time) - t0) / span) * w;
      const y = h - 1 - ((Number(p.price) - lo) / range) * (h - 2);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
};

const NAV_W = 140;
const NAV_H = 18;

/* The navigator's strip: the range's line, and the window as a box on it. */
const NavStrip = styled.svg`
  display: block;
  flex: 0 0 auto;
  width: ${NAV_W}px;
  height: ${NAV_H}px;
  cursor: grab;
  touch-action: none;
  pointer-events: auto;
  path {
    fill: none;
    stroke: ${({ theme }) => theme.color.textSecondary};
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  rect {
    fill: ${({ theme }) => theme.color.text};
    fill-opacity: 0.12;
    stroke: ${({ theme }) => theme.color.text};
    stroke-opacity: 0.55;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  @media (max-width: 1023px) {
    width: 92px;
  }
`;

/* **Where the window is, and a way to move it** (30 Sep 2026, left from
 * Phase 2). The range's own line drawn small with the window over it as a
 * box: a drag walks the window — the chart follows frame by frame through
 * ChartView's `show` and hears once, through `commit`, as a pan does —
 * and a press beside the box brings the window there first. It is rendered
 * by the app (app-view.js) and drives the chart through its ref, so it can
 * sit outside the plot, at the range row's left end opposite the tools. */
class ChartNavigator extends Component {
  constructor(props) {
    super(props);
    this.state = { drag: null };
    this.stripRef = createRef();
    this._drag = null;
    this.onDown = (e) => {
      if (e.button !== 0) return;
      const svg = this.stripRef.current;
      const view = this.props.viewRef && this.props.viewRef.current;
      if (!svg || !view || !view.enabled()) return;
      const b = view.bounds();
      const v = view.current();
      if (!b || !v) return;
      const r = svg.getBoundingClientRect();
      const at = b.lo + ((e.clientX - r.left) / r.width) * (b.hi - b.lo);
      const inside = at >= v.t0 && at <= v.t1;
      const from = inside
        ? v
        : panView(v, at - (v.t0 + v.t1) / 2, b.lo, b.hi) || v;
      if (!inside) view.show(from);
      this._drag = { x: e.clientX, w: r.width, from, last: from, b };
      this.setState({ drag: from });
      if (svg.setPointerCapture) svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    this.onMove = (e) => {
      const d = this._drag;
      const view = this.props.viewRef && this.props.viewRef.current;
      if (!d || !view) return;
      const next = panView(
        d.from,
        ((e.clientX - d.x) / d.w) * (d.b.hi - d.b.lo),
        d.b.lo,
        d.b.hi,
      );
      if (!next) return;
      d.last = next;
      view.show(next);
      this.setState({ drag: next });
    };
    this.onUp = () => {
      const d = this._drag;
      const view = this.props.viewRef && this.props.viewRef.current;
      this._drag = null;
      this.setState({ drag: null });
      if (d && view) view.commit(d.last);
    };
  }

  render() {
    const { prices, view } = this.props;
    const list = Array.isArray(prices) ? prices : [];
    if (list.length < 2) return null;
    const lo = viewMs(list[0].time);
    const hi = viewMs(list[list.length - 1].time);
    const w = this.state.drag || resolveView(view, lo, hi, 0);
    if (!w || !(hi > lo)) return null;
    const x0 = Math.max(0, ((w.t0 - lo) / (hi - lo)) * NAV_W);
    const x1 = Math.min(NAV_W, ((w.t1 - lo) / (hi - lo)) * NAV_W);
    return React.createElement(
      NavStrip,
      {
        innerRef: this.stripRef,
        viewBox: `0 0 ${NAV_W} ${NAV_H}`,
        preserveAspectRatio: "none",
        "aria-hidden": "true",
        "data-chart-nav-strip": "1",
        onPointerDown: this.onDown,
        onPointerMove: this.onMove,
        onPointerUp: this.onUp,
        onPointerCancel: this.onUp,
      },
      React.createElement("path", { d: navSparkPath(list, NAV_W, NAV_H) }),
      React.createElement("rect", {
        "data-chart-nav-window": "1",
        x: x0.toFixed(1),
        y: 0.5,
        width: Math.max(3, x1 - x0).toFixed(1),
        height: NAV_H - 1,
        rx: 2,
      }),
    );
  }
}

/* ── The component ───────────────────────────────────────────────────────── */

let viewSummarySeq = 0;

const ViewBox = styled.div`
  position: relative;
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  outline: none;
  /* **Every touch on the chart is the chart's** (2 Oct 2026). It was pan-y,
     to leave a phone its vertical scroll — but this page never scrolls, so
     all pan-y bought was the browser taking a finger that drifted up or
     down: pointercancel, and the drag or the pinch died mid-gesture. With
     the board up (enabled false) it was auto, and the board's own drag and
     pinch never arrived at all. */
  touch-action: none;
  user-select: ${({ enabled }) => (enabled ? "none" : "auto")};
  ${({ panning }) => (panning ? "&, & svg { cursor: grabbing; }" : "")}
  ${({ cursor, panning }) =>
    cursor && !panning ? `&, & svg { cursor: ${cursor}; }` : ""}
  /* The keyboard is on the chart. It was the border token, 1px, inset —
     about 1.2:1 and gone under the plot; the app's focus ink instead, drawn
     over the chart rather than under it (30 Sep 2026). */
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: -2px;
  }
`;

/* Text for a screen reader and nobody else: out of the layout, one pixel,
   clipped — not display:none, which a reader skips too. */
const ReadingText = styled.div`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
`;

/* The selected drawing's menu (`renderDrawMenu`): the app's pill, the
   app's button. */
const DrawMenu = styled.div`
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1875rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bg};
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
`;

const DrawMenuButton = styled.button.attrs({ type: "button" })`
  ${touchTarget};
  padding: 0.125rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font: inherit;
  font-size: 0.75rem;
  white-space: nowrap;
  cursor: pointer;
  &:hover {
    border-color: ${({ theme }) => theme.color.border};
    background: ${({ theme }) => theme.color.bgSecondary};
  }
  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
`;

/* The held price scale's way back (`renderAutoScale`): under the gutter, in
   the corner the two axes leave, quiet until it is pointed at. */
const ScaleAuto = styled.button.attrs({ type: "button" })`
  position: absolute;
  z-index: 2;
  height: 1.125rem;
  padding: 0 0.25rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.textSecondary};
  font: inherit;
  font-size: 0.625rem;
  line-height: 1;
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.borderHover};
  }
  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
`;

const DrawNoteInput = styled.input.attrs({ type: "text" })`
  width: 14rem;
  padding: 0.1875rem 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font: inherit;
  font-size: 0.75rem;
  &:focus {
    outline: 1px solid ${({ theme }) => theme.color.accent};
  }
`;

class ChartView extends Component {
  constructor(props) {
    super(props);
    // `gesture`: "pan", "measure" or "tool" (moving a drawing) while a hand is down
    // `yPan`: how far a vertical drag slid the price window (`shiftDomain`); session only
    this.state = {
      live: null,
      driven: false,
      panning: false,
      gesture: null,
      readText: "",
      yPan: 0,
    };
    // The summary's id, one per chart on the page
    this.summaryId = `chart-summary-${++viewSummarySeq}`;
    this._summaryMemo = null;
    // A step past the window's edge, to be taken once the window has moved
    this._readAfter = 0;
    this.boxRef = createRef();
    this.chart = null;
    this._memo = null;
    this._pending = null;
    this._raf = 0;
    this._settle = 0;
    this._drag = null;
    this._swallow = false;
    this._swallowTimer = 0;

    this.setChart = (chart) => {
      this.chart = chart;
    };

    /* **One range at a time, both ways** (30 Sep 2026). After a switch the next
     * range's points take a moment to arrive, and until they do the bounds are
     * still the old range's — so the window read as "whole" again and the
     * momentum of the same flick, or the next press, switched once more: 1H
     * straight to 1W. A switch now waits for the bounds to become the new
     * range's (`_pastWait`), whichever way it went, and a cool-down still
     * separates two switches of one gesture. */
    this.pastReady = (b) => {
      if (this._pastCool) return false;
      const w = this._pastWait;
      if (w && Math.abs(b.hi - b.lo - w) <= w * 0.2) return false;
      this._pastWait = null;
      return true;
    };
    this.zoomPast = (span, dir, b, win) => {
      if (!this.props.onZoomPast || !this.pastReady(b)) return false;
      this._past = 0;
      this._pastCool = true;
      this._pastWait = b.hi - b.lo;
      setTimeout(() => {
        this._pastCool = false;
      }, VIEW_PAST_COOL_MS);
      // The window a zoom carries follows the price only when it reaches it (see commit)
      return (
        this.props.onZoomPast(
          span,
          dir,
          win ? { t0: win.t0, t1: win.t1, atNow: win.t1 >= b.hi } : null,
        ) !== false
      );
    };
    /* **In past the finer range**: a window narrowed to the next shorter
       range's length, inside the stretch that range covers (its last
       `finerSpan` before now), is that range — it has the finer points — so
       it opens there, on the same window. The wheel zooms around the
       pointer, so the window is rarely pinned to now; asking for that kept
       1D from ever reaching 1H. **A window further back stays where it is**
       (9 Oct 2026): it opened the shorter range whole, at now — a zoom into a
       point seventeen hours back jumped to the last hour and lost the point.
       The range keeps zooming there on its finer candles (`minSpan`). */
    this.zoomInPast = (next, b, carry) => {
      const finer = this.props.finerSpan;
      if (!(finer > 0) || !next) return false;
      const span = next.t1 - next.t0;
      if (span > finer || next.t0 < b.hi - finer) return false;
      // The price window comes along, so the switch does not jump (componentDidUpdate)
      this._carryY = carry && typeof carry === "object" ? carry : null;
      const moved = this.zoomPast(span, -1, b, next);
      if (!moved) this._carryY = null;
      return moved;
    };

    /* ── The wheel: zoom around the pointer; a sideways swipe pans ── */
    this.onWheel = (e) => {
      const box = this.plotBox(e.clientX, e.clientY);
      if (!box) return;
      e.preventDefault();
      const b = this.bounds();
      const v = this.current();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.h : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const span = v.t1 - v.t0;
      /* Out, and already the whole range: the wheel keeps count, and past
         VIEW_PAST_WHEEL the chart moves to the next range, framed on this
         one's span so the zoom goes on from where it was. */
      if (
        Math.abs(dy) > Math.abs(dx) &&
        dy > 0 &&
        (viewIsFull(v, b.lo, b.hi) || this.atRest()) &&
        this.props.onZoomPast
      ) {
        clearTimeout(this._pastTimer);
        this._pastTimer = setTimeout(() => {
          this._past = 0;
        }, VIEW_PAST_IDLE_MS);
        if (!this.pastReady(b)) return;
        this._past = (this._past || 0) + dy;
        if (this._past >= VIEW_PAST_WHEEL) this.zoomPast(b.hi - b.lo, 1, b);
        return;
      }
      const zooming = Math.abs(dx) <= Math.abs(dy);
      if (zooming) {
        const log = dy * (e.ctrlKey ? 0.01 : 0.0015);
        const notch =
          !e.ctrlKey &&
          (e.deltaMode !== 0 || Math.abs(e.deltaY) >= VIEW_WHEEL_NOTCH);
        const still = typeof reducedMotion === "function" && reducedMotion();
        if (notch && !still) this.glideZoom(e.clientX, e.clientY, log);
        else this.wheelZoom(e.clientX, e.clientY, log);
        return;
      }
      this.stopGlide();
      const r = this.reach();
      const next = panView(
        v,
        (dx / box.w) * span,
        r.lo,
        b.hi,
        VIEW_FUTURE_ROOM,
      );
      if (!next) return;
      // A sideways swipe is a pan: older bars as it nears them (never a zoom)
      this.askHistory(next, r);
      this.show(next, this.holdPrice());
      clearTimeout(this._settle);
      this._settle = setTimeout(
        () => this.commit(this._pending || this.state.live, false),
        VIEW_WHEEL_SETTLE_MS,
      );
    };

    /* One zoom step of the wheel, by e^log, about the pointer at (clientX,
       clientY): the window, the price about the pointer, the shorter range
       when the window has come down to it, and the commit once it is quiet.
       False when nothing moved (the range's edge, or the pointer left the
       plot). */
    this.wheelZoom = (clientX, clientY, log) => {
      const box = this.plotBox(clientX, clientY);
      if (!box) return false;
      const b = this.bounds();
      const v = this.current();
      const span = v.t1 - v.t0;
      const r = this.reach();
      /* **Out, the blank ahead does not grow** (12 Oct 2026). About a pointer
         left of the edge, a window ending at now widened into the future as
         much as into the past: twelve notches out from 1D left the chart
         ending 33 hours past the latest price, 28–40% of it empty. Zooming
         out keeps the share of blank time it had (or the resting room's);
         in, the window may still take the room any window may. */
      const ahead = Math.max(0, (v.t1 - b.hi) / span);
      const room =
        log > 0
          ? Math.min(
              VIEW_FUTURE_ROOM,
              Math.max(ahead, this.props.restRoom || 0),
            )
          : Math.min(VIEW_FUTURE_ROOM, Math.max(ahead, VIEW_ZOOM_ROOM));
      const next = zoomView(
        v,
        Math.exp(log),
        v.t0 + (box.x / box.w) * span,
        v.t0 < b.lo ? r.lo : b.lo,
        b.hi,
        this.minSpan(b),
        room,
      );
      if (!next) return false;
      const y = this.zoomedPrice(box.y, (next.t1 - next.t0) / span, b, next);
      // In, and down to the shorter range's length at now: that range
      if (log < 0 && this.zoomInPast(next, b, y)) {
        this.stopGlide();
        clearTimeout(this._settle);
        this.setState({ live: null, driven: false });
        return false;
      }
      this.show(next, y);
      clearTimeout(this._settle);
      this._settle = setTimeout(
        () => this.commit(this._pending || this.state.live, true),
        VIEW_WHEEL_SETTLE_MS,
      );
      return next.t1 - next.t0 !== span;
    };

    /* A notch's zoom, spread over the next frames (VIEW_WHEEL_GLIDE_MS). */
    this.glideZoom = (clientX, clientY, log) => {
      const g =
        this._glide || (this._glide = { rest: 0, x: 0, y: 0, raf: 0, at: 0 });
      g.rest += log;
      g.x = clientX;
      g.y = clientY;
      if (g.raf) return;
      g.at = performance.now();
      const frame = (now) => {
        g.raf = 0;
        const dt = Math.max(1, Math.min(64, now - g.at));
        g.at = now;
        const k = 1 - Math.exp(-dt / VIEW_WHEEL_GLIDE_MS);
        const step = Math.abs(g.rest) < 0.002 ? g.rest : g.rest * k;
        g.rest -= step;
        const moved = this.wheelZoom(g.x, g.y, step);
        if (!moved) g.rest = 0;
        if (g.rest !== 0) g.raf = requestAnimationFrame(frame);
      };
      g.raf = requestAnimationFrame(frame);
    };
    this.stopGlide = () => {
      const g = this._glide;
      if (!g) return;
      cancelAnimationFrame(g.raf);
      g.raf = 0;
      g.rest = 0;
    };

    /* ── A press on the plot: a pan, the ruler, or a drawing ──
     *
     * One pipeline for all three (chart-tools.js asks nothing of the pointer
     * itself). Shift, or the ruler put in the hand, measures; a press on a
     * drawing takes that drawing — a drag moves it, a click selects it; a
     * drawing tool in the hand leaves the press to the click that places an
     * anchor; anything else is a pan once it travels past the slop. */
    this.onPointerDown = (e) => {
      // A hand on the chart takes over from a notch still gliding
      this.stopGlide();
      /* **A pinch on a touch screen** (30 Sep 2026, left from Phase 2). The
         fingers are kept by id; a second one landing while the first holds a
         pan turns the pan into a pinch. The page cannot pinch-zoom over the
         chart (`touch-action: none`), so both fingers arrive here. */
      if (e.pointerType === "touch") {
        if (!this._touches) this._touches = new Map();
        this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (
          this._touches.size === 2 &&
          this._drag &&
          this._drag.mode === "pan"
        ) {
          this.startPinch();
          return;
        }
      }
      if (e.button !== 0 || e.isPrimary === false) return;
      const target = e.target;
      if (
        target &&
        target.closest &&
        target.closest(
          ".pt-pan, .pt-now-grip, button, a, input, select, [data-draw-menu]",
        )
      )
        return;
      const axis = this.axisBox(e.clientX, e.clientY);
      if (axis) {
        this._drag = {
          mode: "scale",
          x: e.clientX,
          y: e.clientY,
          id: e.pointerId,
          h: axis.h,
          domain0: this.chart.drawnDomain(),
          moved: false,
        };
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointercancel", this.onPointerUp);
        return;
      }
      const box = this.plotBox(e.clientX, e.clientY);
      if (!box) return;
      const chart = this.chart;
      const tools = Boolean(chart.toolsOn && chart.toolsOn());
      if (tools) chart.clearMeasure();
      let mode = "pan";
      let hit = null;
      /* The derivatives page's lines and handles first (chart-trade.js): a
         press on one holds it; a drawing tool in the hand takes the press
         instead, because placing is what the hand asked for. */
      const tradeHit =
        chart.tradeOn && chart.tradeOn() && !this.props.tool
          ? chart.tradeHitAt(box.x, box.y)
          : null;
      if (tradeHit) {
        mode = "trade";
        hit = tradeHit;
        chart.startTradeDrag(tradeHit, box.x, box.y);
      } else if (tools && (e.shiftKey || this.props.tool === "measure")) {
        mode = "measure";
        chart.startMeasure(box.x, box.y);
      } else if (tools && this.props.tool) {
        /* A drawing in the hand (9 Oct 2026): a press that travels
           pans — to the blank time past the latest price as well — and the
           click it ends with is swallowed; a press that stays is the click
           that places the anchor. It used to be the click and nothing else,
           so a second anchor could only go where the window already was. */
      } else if (tools) {
        hit = chart.toolHitAt(box.x, box.y);
        if (hit) {
          mode = "tool";
          chart.startToolDrag(hit, box.x, box.y);
        }
      }
      this._drag = {
        mode,
        hit,
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
        from: this.current(),
        w: box.w,
        h: box.h,
        moved: false,
        /* Up and down slide the price window, on a touch screen too (the page
           does not scroll) — but not while the board owns the price scale.
           The plain grid follows the held window since 12 Oct 2026. */
        vertical:
          !(chart.priceToY && chart.props.predict) && !chart.compareScaled,
        // The window the slide starts from, in prices; null until it engages
        domain0: null,
        yAt: null,
        touch: e.pointerType === "touch",
      };
      /* Older bars asked for at the press, not at the first move past the
         oldest one (13 Oct 2026): measured from the whole of 1H, the first
         400px pull moved the chart 200px and stood still while they came.
         Not on a pointer merely passing over: a wheel zoom on 1H asks for
         nothing, and hovering must not either (polish holds it). */
      if (mode === "pan" && this.enabled())
        this.askHistory(this._drag.from, this.reach());
      // A finger held still becomes the crosshair (VIEW_HOLD_MS)
      if (e.pointerType === "touch" && mode === "pan") {
        const d = this._drag;
        clearTimeout(this._holdTimer);
        this._holdTimer = setTimeout(() => {
          if (this._drag !== d || d.moved) return;
          d.mode = "inspect";
          // The reading starts where the finger is, before it moves
          const chart = this.chart;
          const svg = chart && chart.svgRef && chart.svgRef.current;
          if (svg && chart.handlePointerMove) {
            const r = svg.getBoundingClientRect();
            chart.handlePointerMove({
              offsetX: d.x - r.left,
              offsetY: d.y - r.top,
              clientX: d.x,
              clientY: d.y,
              pointerType: "touch",
              target: svg,
            });
          }
          try {
            if (navigator.vibrate) navigator.vibrate(8);
          } catch (error) {
            /* no haptics here */
          }
        }, VIEW_HOLD_MS);
      }
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("pointercancel", this.onPointerUp);
    };
    this.onPointerMove = (e) => {
      if (this._touches && this._touches.has(e.pointerId)) {
        this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      const d = this._drag;
      if (d && d.mode === "pinch") {
        this.movePinch();
        return;
      }
      if (!d || e.pointerId !== d.id) return;
      // Held: the chart's own hover reads the line under the finger
      if (d.mode === "inspect") return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (d.mode === "scale") {
        const from = d.domain0;
        if (!from || !(d.h > 0)) return;
        if (!d.moved && Math.abs(dy) < VIEW_DRAG_SLOP) return;
        if (!d.moved) {
          d.moved = true;
          this.setState({ gesture: "scale" });
        }
        const k = Math.exp((dy / d.h) * VIEW_AXIS_STRETCH);
        const log =
          Boolean(this.chart.logAxis && this.chart.logAxis()) && from.lo > 0;
        let held;
        if (log) {
          const mid = Math.sqrt(from.lo * from.hi);
          const half = (Math.log(from.hi / from.lo) / 2) * k;
          held = { lo: mid / Math.exp(half), hi: mid * Math.exp(half) };
        } else {
          const mid = (from.lo + from.hi) / 2;
          const half = ((from.hi - from.lo) / 2) * k;
          held = {
            lo: Math.max(mid - half, (from.hi - from.lo) * 1e-6),
            hi: mid + half,
          };
        }
        this.show(null, held);
        return;
      }
      if (!d.moved) {
        const far =
          d.mode === "pan" && !d.vertical ? Math.abs(dx) : Math.hypot(dx, dy);
        if (far < VIEW_DRAG_SLOP) return;
        d.moved = true;
        if (this.chart) this.chart.clearHover();
        this.setState({ panning: d.mode === "pan", gesture: d.mode });
      }
      if (d.mode !== "pan") {
        const svg =
          this.chart && this.chart.svgRef && this.chart.svgRef.current;
        if (!svg) return;
        const r = svg.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        if (d.mode === "measure") this.chart.moveMeasure(x, y);
        else if (d.mode === "trade") this.chart.moveTradeDrag(x, y);
        else this.chart.moveToolDrag(x, y);
        return;
      }
      const b = this.bounds();
      if (!b) return;
      const span = d.from.t1 - d.from.t0;
      const want = d.from.t0 + (-dx / d.w) * span;
      const r = this.reach();
      // Near the oldest bar: older ones at the same step (VIEW_HISTORY_AHEAD)
      this.askHistory({ t0: want, t1: want + span }, r);
      /* Held at the oldest bar while older ones are on their way: the hand's
         start moves with it, so when they land the window goes on from where
         it stopped instead of jumping to where the hand has got to. */
      if (want < r.lo && dx > 0) {
        d.from = { t0: r.lo, t1: r.lo + span, atNow: false };
        d.x = e.clientX;
      }
      /* The price window drawn when the pan began, held, and moved up and
         down with the hand from there — the rule written above VIEW_Y_ZOOM. */
      if (d.vertical && d.yAt == null) {
        d.yAt = dy;
        d.domain0 = this.heldStart();
      }
      let y = null;
      if (d.yAt != null && d.domain0 && d.h > 0) {
        const f = Math.max(
          -VIEW_Y_MAX,
          Math.min(VIEW_Y_MAX, (dy - d.yAt) / d.h),
        );
        const log =
          Boolean(this.chart.logAxis && this.chart.logAxis()) &&
          d.domain0.lo > 0;
        const [lo, hi] = shiftDomain(d.domain0.lo, d.domain0.hi, f, log);
        y = { lo, hi };
      }
      this.show(
        panView(d.from, want - d.from.t0, r.lo, b.hi, VIEW_FUTURE_ROOM),
        y,
      );
    };
    this.onPointerUp = (e) => {
      if (this._touches) this._touches.delete(e.pointerId);
      const d = this._drag;
      /* A pinch ends with the first finger up: the window goes to the app
         once, and the finger still down starts nothing. */
      if (d && d.mode === "pinch") {
        this.endDrag();
        this._touches = null;
        this._swallow = true;
        clearTimeout(this._swallowTimer);
        this._swallowTimer = setTimeout(() => {
          this._swallow = false;
        }, 400);
        this.commit(this._pending || this.state.live, true);
        return;
      }
      if (!d || e.pointerId !== d.id) return;
      clearTimeout(this._holdTimer);
      this.endDrag();
      // A held finger let go: the reading ends with it, and nothing was panned
      if (d.mode === "inspect") {
        if (this.chart && this.chart.clearHover) this.chart.clearHover();
        this.swallowClick();
        return;
      }
      /* Two taps on the plot: the whole range and the price's own scale, as
         a double-click (VIEW_DOUBLE_TAP_*). The tap's own click still goes
         where it goes. */
      if (d.touch && d.mode === "pan" && !d.moved) {
        const now = Date.now();
        const last = this._lastTap;
        this._lastTap = { t: now, x: e.clientX, y: e.clientY };
        if (
          last &&
          now - last.t < VIEW_DOUBLE_TAP_MS &&
          Math.hypot(e.clientX - last.x, e.clientY - last.y) <
            VIEW_DOUBLE_TAP_PX
        ) {
          this._lastTap = null;
          if (this.state.yPan) this.setState({ yPan: 0 });
          if (this.props.view || this.state.live) this.commit(null);
          return;
        }
      }
      // The price scale's own drag: the held window stays, the time window is untouched
      if (d.mode === "scale") {
        cancelAnimationFrame(this._raf);
        this._raf = 0;
        const s = { gesture: null, driven: false, live: null };
        if (this._pendingY != null) s.yPan = this._pendingY;
        this._pendingY = null;
        this._pending = null;
        this.setState(s);
        return;
      }
      const swallow = () => {
        /* The click that ends a gesture is not a click on the chart — it
           would otherwise pick a price for a target, open a mark, or let go
           of the drawing it has just selected. */
        this._swallow = true;
        clearTimeout(this._swallowTimer);
        this._swallowTimer = setTimeout(() => {
          this._swallow = false;
        }, 400);
      };
      if (d.mode === "measure") {
        if (d.moved) swallow();
        else if (this.chart) this.chart.clearMeasure();
        if (this.state.gesture) this.setState({ gesture: null });
        return;
      }
      /* A held line let go: its new price goes to the page once. A press
         that stayed is a press on what it landed on — a ×, a guide number,
         a handle — and the page decides what that means. */
      if (d.mode === "trade") {
        swallow();
        const out = this.chart ? this.chart.endTradeDrag() : null;
        if (d.moved && out && this.props.onTradeDrag)
          this.props.onTradeDrag(out);
        else if (!d.moved && d.hit && this.props.onTradePress)
          this.props.onTradePress(d.hit);
        if (this.state.gesture) this.setState({ gesture: null });
        return;
      }
      if (d.mode === "tool") {
        swallow();
        const out = this.chart ? this.chart.endToolDrag() : null;
        if (d.moved && out && this.props.onDrawingChange)
          this.props.onDrawingChange(out.id, { a: out.a, b: out.b });
        else if (!d.moved && d.hit && this.props.onDrawingSelect)
          this.props.onDrawingSelect(d.hit.id);
        if (this.state.gesture) this.setState({ gesture: null });
        return;
      }
      if (!d.moved) return;
      swallow();
      this.commit(this._pending || this.state.live);
    };
    this.onClickCapture = (e) => {
      if (!this._swallow) return;
      this._swallow = false;
      e.stopPropagation();
      e.preventDefault();
    };

    // A double-click on the plot puts the whole range back
    this.onDoubleClick = (e) => {
      // On the price scale: the scale goes back to the data, nothing else
      if (this.axisBox(e.clientX, e.clientY)) {
        this.fitScale();
        return;
      }
      if (!this.plotBox(e.clientX, e.clientY)) return;
      this.fitScale();
      if (!this.props.view && !this.state.live) return;
      this.commit(null);
    };
  }

  componentDidMount() {
    const box = this.boxRef.current;
    if (!box) return;
    box.addEventListener("wheel", this.onWheel, { passive: false });
    box.addEventListener("pointerdown", this.onPointerDown);
    box.addEventListener("click", this.onClickCapture, true);
    box.addEventListener("dblclick", this.onDoubleClick);
  }

  componentWillUnmount() {
    this.stopGlide();
    clearTimeout(this._holdTimer);
    const box = this.boxRef.current;
    if (box) {
      box.removeEventListener("wheel", this.onWheel);
      box.removeEventListener("pointerdown", this.onPointerDown);
      box.removeEventListener("click", this.onClickCapture, true);
      box.removeEventListener("dblclick", this.onDoubleClick);
    }
    this.endDrag();
    cancelAnimationFrame(this._raf);
    clearTimeout(this._settle);
    clearTimeout(this._swallowTimer);
    clearTimeout(this._pastTimer);
  }

  componentDidUpdate(prevProps) {
    /* The window followed a step past its edge: the step, taken in the
       window now drawn (the chart updated its points before this runs). */
    if (
      this._readAfter &&
      prevProps.view !== this.props.view &&
      this.chart &&
      this.chart.readAfterPan
    ) {
      const res = this.chart.readAfterPan(
        this._readAfter === "same" ? 0 : this._readAfter,
      );
      this._readAfter = 0;
      if (res && res.text) this.setState({ readText: res.text });
    }
    /* A gesture on a chart that has become another one ends with it. */
    const switched =
      prevProps.coin !== this.props.coin ||
      prevProps.period !== this.props.period ||
      prevProps.currency !== this.props.currency ||
      (prevProps.viewEnabled && !this.props.viewEnabled);
    if (switched && this._carryY && prevProps.period !== this.props.period)
      this.setState({ yPan: this._carryY });
    else if (switched && this.state.yPan) this.setState({ yPan: 0 });
    if (switched) this._carryY = null;
    if (switched && (this.state.live || this._drag || this._pending)) {
      this.endDrag();
      cancelAnimationFrame(this._raf);
      this._raf = 0;
      clearTimeout(this._settle);
      this._pending = null;
      this.setState({
        live: null,
        driven: false,
        panning: false,
        gesture: null,
      });
    }
  }

  /* Two fingers: where they are, relative to the plot, and how far apart. */
  pinchPoints() {
    const svg = this.chart && this.chart.svgRef && this.chart.svgRef.current;
    if (!svg || !this._touches || this._touches.size < 2) return null;
    const r = svg.getBoundingClientRect();
    const [a, b] = [...this._touches.values()];
    return {
      mid: (a.x + b.x) / 2 - r.left,
      midY: (a.y + b.y) / 2 - r.top,
      dist: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  /* **The price window for a zoom by `k` about a price**, from a window held
     at the gesture's start — the wheel's rule (VIEW_Y_ZOOM: prices travel
     with the square root of time) for the gestures that are not a wheel. A
     pinch measures every move from where its fingers landed, so it is
     scaled from that first window, never from the last frame's. Null while
     the price is not the chart's own (a lattice, a comparison). */
  priceZoom(from, at, k) {
    const chart = this.chart;
    if (
      !chart ||
      chart.priceToY ||
      chart.compareScaled ||
      !from ||
      !(from.hi > from.lo) ||
      !(k > 0) ||
      !isFinite(at)
    )
      return null;
    const log =
      Boolean(chart.logAxis && chart.logAxis()) && from.lo > 0 && at > 0;
    const f = log ? Math.log : (v) => v;
    const share = (f(at) - f(from.lo)) / (f(from.hi) - f(from.lo));
    if (!isFinite(share)) return null;
    const yPower = this.yZoomPower();
    const [lo, hi] = zoomDomain(
      from.lo,
      from.hi,
      Math.max(0, Math.min(1, share)),
      Math.pow(k, yPower),
      log,
    );
    return hi > lo ? { lo, hi } : null;
  }

  yZoomPower() {
    const p = Number(this.props.yZoomPower);
    return isFinite(p) && p > 0 ? p : VIEW_Y_ZOOM;
  }

  startPinch() {
    clearTimeout(this._holdTimer);
    const d = this._drag;
    const at = this.pinchPoints();
    if (!d || !at || !(at.dist > 0)) return;
    d.mode = "pinch";
    d.moved = true;
    /* The price under the fingers when they landed, and the window it was
       read in: the pinch zooms the price about it (9 Oct 2026's rule for
       the wheel, left for the pinch in #103). */
    const scale =
      this.chart && this.chart.plotScale ? this.chart.plotScale() : null;
    const domain0 =
      this.chart && this.chart.drawnDomain ? this.chart.drawnDomain() : null;
    const t0 = this.current();
    // The price between the fingers, as the wheel takes the pointer's
    const price = scale ? scale.toV(at.midY) : null;
    d.pinch = { from: t0, mid: at.mid, dist: at.dist, domain0, price };
    if (this.chart) this.chart.clearHover();
    this.setState({ panning: true, gesture: "pinch" });
  }

  /* Spread the fingers and the window narrows around the instant between
     them; move them together and it walks — both, the way a map does. */
  movePinch() {
    const d = this._drag;
    const at = this.pinchPoints();
    const b = this.bounds();
    if (!d || !d.pinch || !at || !b || !(at.dist > 0)) return;
    const { from, mid, dist } = d.pinch;
    const span = from.t1 - from.t0;
    const anchor = from.t0 + (mid / d.w) * span;
    const zoomed = zoomView(
      from,
      dist / at.dist,
      anchor,
      b.lo,
      b.hi,
      this.minSpan(b),
    );
    if (!zoomed) return;
    const moved = panView(
      zoomed,
      (-(at.mid - mid) / d.w) * (zoomed.t1 - zoomed.t0),
      b.lo,
      b.hi,
    );
    const k = (zoomed.t1 - zoomed.t0) / span;
    const y = viewIsFull(moved || zoomed, b.lo, b.hi)
      ? this.state.yPan
        ? 0
        : null
      : this.priceZoom(d.pinch.domain0, d.pinch.price, k);
    this.show(moved || zoomed, y);
  }

  // The click that ends a gesture is not a click on the chart
  swallowClick() {
    this._swallow = true;
    clearTimeout(this._swallowTimer);
    this._swallowTimer = setTimeout(() => {
      this._swallow = false;
    }, 400);
  }

  endDrag() {
    clearTimeout(this._holdTimer);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this._drag = null;
  }

  // The range the window lives in: the whole series' first and last instant
  bounds() {
    const p = this.props.prices;
    if (!Array.isArray(p) || p.length < 2) return null;
    const lo = viewMs(p[0].time);
    const hi = viewMs(p[p.length - 1].time);
    return hi > lo ? { lo, hi } : null;
  }

  /* **How far a window may go**: the range's own end, and back to the
     oldest of the older bars a pan has brought in. `bounds()` stays the
     range's own, so the whole range, a zoom out of it and the price scale
     handed back at it mean what they did; only where a window may stand —
     a pan, a window held, a zoom inside one — reaches further. */
  reach() {
    const b = this.bounds();
    if (!b) return null;
    const h = this.historyRows();
    return h ? { lo: Math.min(b.lo, viewMs(h[0].time)), hi: b.hi } : b;
  }

  /* The older bars the app fetched for a pan into the past, oldest first,
     only those before the range's own first point; null without any. */
  historyRows() {
    const p = this.props;
    const h = p.history;
    if (
      !Array.isArray(h) ||
      h.length < 2 ||
      !Array.isArray(p.prices) ||
      !p.prices.length
    )
      return null;
    const first = viewMs(p.prices[0].time);
    const m = this._histMemo;
    if (m && m.h === h && m.first === first) return m.out;
    const out = h.filter((c) => viewMs(c.time) < first);
    this._histMemo = { h, first, out: out.length >= 2 ? out : null };
    return this._histMemo.out;
  }

  /* Ask for older bars while the window nears the oldest one loaded. The
     app keeps one ask in flight and says when there is no more. */
  askHistory(view, b) {
    if (!view || !b || typeof this.props.onNeedHistory !== "function") return;
    const span = view.t1 - view.t0;
    if (span > 0 && view.t0 < b.lo + span * VIEW_HISTORY_AHEAD)
      this.props.onNeedHistory(b.lo, span);
  }

  /* The narrowest window worth drawing: a dozen of the range's own points,
     or — where finer candles can be asked for — 24 minutes of 1m bars,
     whichever is narrower. */
  minSpan(b) {
    const p = this.props;
    const own =
      p.showCandles && Array.isArray(p.candles)
        ? viewStep(p.candles)
        : viewStep(p.prices);
    const coarse = own * VIEW_MIN_POINTS;
    const fine = VIEW_GRANULARITIES[0] * 1000 * VIEW_MIN_BARS;
    const want = p.detailSupported ? Math.min(coarse, fine) : coarse;
    return Math.min(b ? b.hi - b.lo : Infinity, want);
  }

  enabled() {
    return (
      Boolean(this.props.viewEnabled) &&
      Boolean(this.bounds()) &&
      Boolean(this.chart)
    );
  }

  // The window in hand: mid-gesture, set, or the whole range
  current() {
    const b = this.bounds();
    if (!b) return null;
    const r = this.reach();
    const v = resolveView(
      this._pending || this.state.live || this.props.view,
      r.lo,
      r.hi,
      this.minSpan(b),
    );
    // The whole range is the range's own points, not the older bars behind it
    return v || this.restView(b) || { t0: b.lo, t1: b.hi, atNow: true };
  }

  /* **The chart at rest, with room ahead** (Settings → "Room ahead",
     VIEW_REST_ROOM). The range's own width, moved that share past the
     latest price: the series is cut there like any window reaching into
     the future, so everything placed from its ends follows, and a wheel or
     a drag starts from exactly what is drawn. Null when it is off. */
  restView(b) {
    const room = this.props.restRoom;
    if (!(room > 0) || !b || !this.props.viewEnabled) return null;
    const full = b.hi - b.lo;
    return {
      t0: b.lo + room * full,
      t1: b.hi + room * full,
      atNow: true,
      ahead: room,
    };
  }

  // Nothing in hand and no window set: the chart as it rests
  atRest() {
    return !this._pending && !this.state.live && !this.props.view;
  }

  /* Where the price scale is, if (x, y) is on it: the gutter right of the
     plot, the height of the plot — while the price is the chart's own to
     move (no lattice, no comparison's percent). */
  axisBox(clientX, clientY) {
    if (!this.enabled()) return null;
    const chart = this.chart;
    const svg = chart.svgRef && chart.svgRef.current;
    if (!svg || chart.priceToY || chart.compareScaled || !(chart.axisW > 0))
      return null;
    const r = svg.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const w = chart.width;
    const h = chart.height;
    if (!(h > 0) || x <= w || x > w + chart.axisW || y < 0 || y > h)
      return null;
    return { x, y, h };
  }

  /* Where the plot is on the page, if (x, y) is inside it — the axes and the
     gutter are not the plot, and nothing there starts a gesture. */
  plotBox(clientX, clientY) {
    if (!this.enabled()) return null;
    const svg = this.chart.svgRef && this.chart.svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const w = this.chart.width;
    const h = this.chart.height;
    const x = clientX - r.left;
    const y = clientY - r.top;
    if (!(w > 0) || !(h > 0) || x < 0 || y < 0 || x > w || y > h) return null;
    return { x, y, w, h };
  }

  /* The price window for a wheel zoom whose time window shrank (or grew)
     by `k`: scaled by k^VIEW_Y_ZOOM about the price under the pointer, from
     the window being drawn — a frame not yet painted included. 0 when the
     zoom reaches the whole range (the scale is the data's again); null
     while the price is not the chart's own (a lattice, a comparison). */
  zoomedPrice(y, k, b, next) {
    const chart = this.chart;
    if (
      !chart ||
      chart.priceToY ||
      chart.compareScaled ||
      !(k > 0) ||
      !chart.plotScale
    )
      return null;
    if (viewIsFull(next, b.lo, b.hi))
      return this.state.yPan || this._pendingY ? 0 : null;
    const drawn = chart.drawnDomain();
    const pending =
      this._pendingY && typeof this._pendingY === "object"
        ? this._pendingY
        : null;
    const from = pending || drawn;
    const scale = chart.plotScale();
    if (
      !drawn ||
      !from ||
      !scale ||
      !(drawn.hi > drawn.lo) ||
      !(from.hi > from.lo)
    )
      return null;
    const log =
      Boolean(chart.logAxis && chart.logAxis()) && drawn.lo > 0 && from.lo > 0;
    const f = log ? Math.log : (v) => v;
    // The price under the pointer: it stays under the pointer
    const shareOf = (v) => (f(v) - f(drawn.lo)) / (f(drawn.hi) - f(drawn.lo));
    const at = scale.toV(y);
    if (!(log ? at > 0 : isFinite(at))) return null;
    // Where it is in the window: the same share of any window at that pixel
    const share = shareOf(at);
    const yPower = this.yZoomPower();
    const [lo, hi] = zoomDomain(
      from.lo,
      from.hi,
      share,
      Math.pow(k, yPower),
      log,
    );
    return hi > lo ? { lo, hi } : null;
  }

  /* The drawn line's price at time `t`, between its two points either side
     — the series the chart has now, cut to the window and finer where the
     window asked for it. */
  lineAt(t) {
    const pts = this.chart && this.chart.props && this.chart.props.prices;
    if (!Array.isArray(pts) || pts.length < 2 || !isFinite(t)) return null;
    const i = viewSearch(pts, t);
    if (i <= 0) return Number(pts[0].price);
    if (i >= pts.length) return Number(pts[pts.length - 1].price);
    const a = pts[i - 1];
    const c = pts[i];
    const ta = viewMs(a.time);
    const tc = viewMs(c.time);
    const pa = Number(a.price);
    const pc = Number(c.price);
    return tc > ta ? pa + ((pc - pa) * (t - ta)) / (tc - ta) : pc;
  }

  /* A sideways swipe of the wheel holds the price as a drag does: the window
     drawn now, unless one is already held or on its way. */
  /* The grid's lattice holds too (12 Oct 2026): it is drawn from the held
     window (gridGeometryFor). The board does not — a drag there walks it. */
  holdPrice() {
    const chart = this.chart;
    if (
      !chart ||
      (chart.priceToY && chart.props.predict) ||
      chart.compareScaled ||
      this.state.yPan ||
      this._pendingY
    )
      return null;
    return this.heldStart();
  }

  // The price window a hold starts from: the grid's own while it is drawn
  heldStart() {
    const chart = this.chart;
    if (!chart) return null;
    if (chart.priceToY && !chart.props.predict && chart.priceToY.domain) {
      const [lo, hi] = chart.priceToY.domain();
      return hi > lo ? { lo, hi } : null;
    }
    return chart.drawnDomain ? chart.drawnDomain() : null;
  }

  // The price scale back to the data (the "Auto", Whole range, a double-click)
  fitScale() {
    this._pendingY = null;
    if (this.state.yPan) this.setState({ yPan: 0 });
  }

  /* **The scale's way back, where it can be seen** (9 Oct 2026). A pan, a
     vertical drag, the scale's own drag and the wheel all hold the price
     window; a double-click gave it back, and nothing said so. While it is
     held, "Auto" sits under the price scale — where TradingView keeps its
     own — and gives the scale back to the data. */
  renderAutoScale() {
    const chart = this.chart;
    if (
      !this.state.yPan ||
      !this.enabled() ||
      !chart ||
      !(chart.axisW > 0) ||
      !(chart.height > 0)
    )
      return null;
    if ((chart.priceToY && chart.props.predict) || chart.compareScaled)
      return null;
    const title = msg(
      "view_auto_title",
      "Fit the price scale to the line again (or double-click the price scale)",
    );
    return React.createElement(
      ScaleAuto,
      {
        "data-scale-auto": "1",
        title,
        "aria-label": title,
        style: {
          left: `${Math.round(chart.width + 4)}px`,
          top: `${Math.round(chart.height + 3)}px`,
          width: `${Math.max(28, Math.round(chart.axisW - 8))}px`,
        },
        onClick: () => this.fitScale(),
      },
      msg("view_auto", "Auto"),
    );
  }

  // One redraw per frame while a hand or a wheel drives the window
  show(view, y = null) {
    if (!view && y == null) return;
    if (view) this._pending = view;
    if (y != null) this._pendingY = y;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      const next = this._pending;
      const s = { driven: true };
      if (next) s.live = next;
      if (this._pendingY != null) s.yPan = this._pendingY;
      this._pendingY = null;
      this.setState(s);
    });
  }

  /* The gesture is over: the window goes to the app once, as a start, an
     end and whether it follows the price. The whole range is no window.
     **A zoom follows the price only when it reaches it** (11 Oct 2026). A
     window ending within VIEW_AT_NOW of the latest price follows it — right
     for a pan brought to the end, and wrong for a zoom about the pointer: a
     pointer near the right edge left the window's end a hair short of now,
     the commit pinned it to now, and each notch moved the point under the
     pointer left — 11px, then 24, 39 … 3,164px once 1D handed over to 1H
     (measured). `zoomed` asks for the end itself. */
  commit(view, zoomed = false) {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    clearTimeout(this._settle);
    this._pending = null;
    const b = this.bounds();
    let out = null;
    if (view && b && !viewIsFull(view, b.lo, b.hi)) {
      const span = view.t1 - view.t0;
      const atNow = zoomed
        ? view.t1 >= b.hi
        : view.t1 >= b.hi - span * VIEW_AT_NOW;
      out = {
        t0: view.t0,
        t1: view.t1,
        atNow,
        ahead: atNow && view.t1 > b.hi ? (view.t1 - b.hi) / span : 0,
      };
    }
    if (this.props.onViewChange) this.props.onViewChange(out);
    // The last frame of a vertical slide, which the cancelled frame was carrying
    const s = { live: null, driven: false, panning: false, gesture: null };
    if (this._pendingY != null) s.yPan = this._pendingY;
    this._pendingY = null;
    this.setState(s);
  }

  /* For the app's keys: + / − zoom around the latest price when the window
     follows it and around the middle otherwise; ← / → walk a fifth. */
  zoomBy(factor) {
    if (!this.enabled()) return false;
    const b = this.bounds();
    const v = this.current();
    // − on the whole range: the next range, framed on this one's span
    if (
      factor > 1 &&
      (viewIsFull(v, b.lo, b.hi) || this.atRest()) &&
      this.props.onZoomPast
    ) {
      this.zoomPast(b.hi - b.lo, 1, b);
      return true;
    }
    const anchor = v.atNow ? b.hi : (v.t0 + v.t1) / 2;
    const next = zoomView(v, factor, anchor, b.lo, b.hi, this.minSpan(b));
    /* The price follows the wheel's rule about the line's price at the
       anchor — the latest price when the window follows it (#103 left the
       keys' zoom holding the scale where it was). */
    const drawn =
      this.chart && this.chart.drawnDomain ? this.chart.drawnDomain() : null;
    const y = !next
      ? null
      : viewIsFull(next, b.lo, b.hi)
        ? this.state.yPan
          ? 0
          : null
        : this.priceZoom(
            drawn,
            this.lineAt(anchor) || (drawn ? (drawn.lo + drawn.hi) / 2 : NaN),
            (next.t1 - next.t0) / (v.t1 - v.t0),
          );
    // + down to the shorter range's length at now: that range
    if (factor < 1 && this.zoomInPast(next, b, y)) return true;
    if (next) {
      if (y != null) this._pendingY = y;
      this.commit(next);
    }
    return true;
  }

  panBy(share) {
    if (!this.enabled()) return false;
    const r = this.reach();
    const v = this.current();
    const next = panView(
      v,
      share * (v.t1 - v.t0),
      r.lo,
      r.hi,
      VIEW_FUTURE_ROOM,
    );
    // The keys' pan: older bars as it nears them
    this.askHistory(next, r);
    if (next) this.commit(next);
    return true;
  }

  reset() {
    this.commit(null);
  }

  /* **The keyboard's cursor** (app.js hands over ←, →, Home and End while
     the chart has the focus). A step past the window's edge moves the window
     a fifth that way and takes the step in it once it is drawn — the way a
     caret scrolls text — and at the range's own end it says so instead. */
  readKey(key) {
    const chart = this.chart;
    if (!this.enabled() || !chart || !chart.readStep) return false;
    let res;
    if (key === "Home" || key === "End") res = chart.readEdge(key === "End");
    else res = chart.readStep(key === "ArrowLeft" ? -1 : 1);
    if (res && res.edge) {
      const b = this.bounds();
      const v = this.current();
      const back = res.edge === "start";
      const room = back ? v.t0 > b.lo + 1 : v.t1 < b.hi - 1;
      if (room) {
        this._readAfter = back ? -1 : 1;
        this.panBy(back ? -VIEW_PAN_STEP : VIEW_PAN_STEP);
        return true;
      }
      res = {
        text: back
          ? msg("read_first", "The first point on the chart")
          : msg("read_last", "The latest point"),
      };
    }
    if (res && res.text) this.setState({ readText: res.text });
    return true;
  }

  /* Shift with an arrow: the window moves and the cursor, if one is out,
     stays on its moment — read again in the window drawn next, or at the
     window's nearest point when the moment has left it. */
  panKey(share) {
    const b = this.bounds();
    const v = this.current();
    if (!b || !v) return false;
    const room = share < 0 ? v.t0 > b.lo + 1 : v.t1 < b.hi - 1;
    if (room && this.chart && this.chart.reading && this.chart.reading())
      this._readAfter = "same";
    return this.panBy(share);
  }

  stopReading() {
    if (this.chart && this.chart.reading && this.chart.reading()) {
      this.chart.stopReading();
      this.setState({ readText: "" });
      return true;
    }
    return false;
  }

  // The chart described, memoised on the series it describes
  summary(prices) {
    const p = this.props;
    const m = this._summaryMemo;
    if (
      m &&
      m.prices === prices &&
      m.coin === p.coin &&
      m.currency === p.currency &&
      m.fmt === p.formatPrice &&
      m.period === p.period
    ) {
      return m.text;
    }
    const fmt = (v) => (p.formatPrice ? p.formatPrice(Number(v)) : String(v));
    const when = (t) => crosshairDate(new Date(viewMs(t)), p.period);
    const text = chartSummaryText(prices, {
      coin: p.coin || "",
      currency: p.currency || "",
      fmt,
      when,
    });
    this._summaryMemo = {
      prices,
      coin: p.coin,
      currency: p.currency,
      fmt: p.formatPrice,
      period: p.period,
      text,
    };
    return text;
  }

  /* What the chart is handed: the series, the candles, the crosshair's
     candles and the move marks, cut to the window — the same arrays as
     before when there is no window, so nothing redraws for nothing. */
  shape() {
    const p = this.props;
    const b = this.bounds();
    const r = this.reach();
    const v =
      b && p.viewEnabled
        ? resolveView(this.state.live || p.view, r.lo, r.hi, this.minSpan(b)) ||
          this.restView(b)
        : null;
    const width = this.chart ? this.chart.width : 0;
    const m = this._memo;
    if (
      m &&
      m.prices === p.prices &&
      m.candles === p.candles &&
      m.ohlc === p.ohlc &&
      m.moves === p.moves &&
      m.detail === p.detail &&
      m.history === p.history &&
      m.showCandles === p.showCandles &&
      m.t0 === (v && v.t0) &&
      m.t1 === (v && v.t1) &&
      m.width === width
    ) {
      return m.out;
    }
    let out;
    if (!v) {
      out = {
        prices: p.prices,
        candles: p.candles,
        ohlc: p.ohlc,
        moves: p.moves,
        lastPoint: null,
        atNow: true,
        viewWindow: null,
        viewFuture: 0,
      };
    } else {
      const candleMode = Boolean(
        p.showCandles && Array.isArray(p.candles) && p.candles.length,
      );
      const coarseMs = candleMode ? viewStep(p.candles) : viewStep(p.prices);
      const fine = detailCovers(
        p.detail,
        p.coin,
        p.currency,
        v.t0,
        v.t1,
        coarseMs,
      )
        ? p.detail
        : null;
      /* A window reaching before the range's first point draws the older
         bars the pan fetched in front of it — the same step, so the line
         keeps its shape as it passes from one to the other. */
      const older =
        !fine && v.t0 < viewMs(p.prices[0].time) ? this.historyRows() : null;
      const full = older
        ? older
            .map((c) => ({ price: c.close, time: new Date(viewMs(c.time)) }))
            .concat(p.prices)
        : p.prices;
      const last = full[full.length - 1];
      /* Room past the latest price: the series is cut where the data ends,
         and the chart is told what share of the width is blank time after
         it (LineBase's viewFutureWidth). */
      const lastT = viewMs(last.time);
      const t1 = Math.min(v.t1, lastT);
      const viewFuture =
        v.t1 > lastT && v.t1 > v.t0 ? (v.t1 - lastT) / (v.t1 - v.t0) : 0;
      let candles = p.candles;
      let line;
      if (candleMode) {
        candles = sliceCandles(
          fine ? fine.candles : older ? older.concat(p.candles) : p.candles,
          v.t0,
          t1,
        );
        line = candles.map((c) => ({ price: c.close, time: new Date(c.time) }));
        if (line.length < 2) line = sliceSeries(full, v.t0, t1);
      } else {
        let source = full;
        if (fine) {
          source = fine.candles.map((c) => ({
            price: c.close,
            time: new Date(c.time),
          }));
          // The live end: the range's own latest price, when it is newer
          if (viewMs(last.time) > viewMs(source[source.length - 1].time))
            source = source.concat([last]);
        }
        line = sliceSeries(source, v.t0, t1);
        if (width > 0 && line.length > width * VIEW_LTTB_OVER)
          line = m4(line, v.t0, v.t1, Math.round(width));
      }
      out = {
        prices: line,
        candles,
        ohlc: fine
          ? fine.candles
          : older && Array.isArray(p.ohlc)
            ? older.concat(p.ohlc)
            : p.ohlc,
        moves: remapMoves(p.moves, line),
        lastPoint: {
          price: Number(last.price),
          time: last.time,
          up: Number(last.price) >= Number(full[0].price),
        },
        atNow: v.atNow,
        viewWindow: { t0: v.t0, t1: v.t1, g: fine ? fine.g : 0 },
        viewFuture,
      };
    }
    this._memo = {
      prices: p.prices,
      candles: p.candles,
      ohlc: p.ohlc,
      moves: p.moves,
      detail: p.detail,
      history: p.history,
      showCandles: p.showCandles,
      t0: v && v.t0,
      t1: v && v.t1,
      width,
      out,
    };
    return out;
  }

  render() {
    // Everything but the window's own props goes on to the chart
    const rest = Object.assign({}, this.props);
    for (const k of [
      "view",
      "onViewChange",
      "viewEnabled",
      "detail",
      "detailSupported",
      "onZoomPast",
      "finerSpan",
      "history",
      "onNeedHistory",
      "restRoom",
    ])
      delete rest[k];
    const enabled = Boolean(this.props.viewEnabled);
    const shaped = this.shape();
    const gesture = this.state.gesture;
    const summary = this.summary(shaped.prices);
    return React.createElement(
      ViewBox,
      {
        innerRef: this.boxRef,
        enabled,
        panning: this.state.panning,
        cursor:
          gesture === "measure"
            ? "crosshair"
            : gesture === "tool"
              ? "move"
              : gesture === "trade" ||
                  gesture === "scale" ||
                  (!gesture && this.state.overAxis)
                ? "ns-resize"
                : !gesture && this.state.overTrade
                  ? this.state.overTrade
                  : enabled && this.props.tool
                    ? "crosshair"
                    : null,
        /* The price scale says it can be dragged, as the plot says it can be
           panned — and a line the hand can take says so before it is taken. */
        onMouseMove: enabled
          ? (e) => {
              const over = Boolean(this.axisBox(e.clientX, e.clientY));
              if (over !== Boolean(this.state.overAxis))
                this.setState({ overAxis: over });
              const chart = this.chart;
              const box =
                chart && chart.tradeOn && chart.tradeOn()
                  ? this.plotBox(e.clientX, e.clientY)
                  : null;
              const trade = box ? chart.tradeCursor(box.x, box.y) : null;
              if (trade !== (this.state.overTrade || null))
                this.setState({ overTrade: trade });
            }
          : undefined,
        "data-chart-viewport": enabled ? "1" : undefined,
        // The tour's "move around it" step (onboarding.js)
        "data-tour": "chart",
        "data-chart-window": shaped.viewWindow
          ? `${Math.round(shaped.viewWindow.t0)}-${Math.round(shaped.viewWindow.t1)}`
          : undefined,
        tabIndex: enabled ? 0 : undefined,
        role: enabled ? "group" : undefined,
        "aria-label": enabled
          ? msg(
              "view_label2",
              "Price chart. ← and → read it point by point, Home and End its ends; Shift with ← and → moves through time; + and − zoom; a double-click shows the whole range.",
            )
          : undefined,
        "aria-describedby": enabled && summary ? this.summaryId : undefined,
        onBlur: enabled ? () => this.stopReading() : undefined,
      },
      React.createElement(
        Line,
        Object.assign({}, rest, shaped, {
          viewDriven: this.state.driven,
          yPan: this.state.yPan,
          // The readout waits for any gesture, not only a pan
          panning: Boolean(gesture),
          chartRef: this.setChart,
          // The ruler counts moves on the whole range, not the window
          countSeries: this.props.prices,
          drawTools: enabled,
        }),
      ),
      this.renderDrawMenu(),
      this.renderAutoScale(),
      React.createElement(
        ReadingText,
        { id: this.summaryId, "data-chart-summary": "1" },
        summary,
      ),
      React.createElement(
        ReadingText,
        { "aria-live": "polite", "data-chart-reading": "1" },
        this.state.readText,
      ),
    );
  }

  /* **The selected drawing's menu**, over the plot beside it: a price
   * target at a horizontal line's level (the existing target, set from the
   * targets drawer — no new alarm), its note, and taking it away. The note is
   * edited here in place; Enter keeps it, Esc leaves it as it was. */
  renderDrawMenu() {
    const p = this.props;
    const chart = this.chart;
    if (!p.viewEnabled || !chart || !chart.toolsOn || !chart.toolsOn())
      return null;
    const id = p.drawingSelected;
    const d =
      id && Array.isArray(p.drawings)
        ? p.drawings.find((x) => x.id === id)
        : null;
    if (!d) return null;
    const pt = chart.drawPoint(d.a);
    if (!pt) return null;
    const W = chart.width;
    const H = chart.height;
    const editing = p.drawingEditing === id;
    const width = editing ? 240 : d.kind === "hline" ? 250 : 150;
    const x = d.kind === "hline" ? W - width - 90 : pt.x - width / 2;
    const left = Math.max(4, Math.min(W - width - 4, x));
    const top = Math.max(4, Math.min(H - 40, pt.y + (pt.y > 60 ? -40 : 14)));
    const commit = (value) => {
      if (p.onDrawingChange) p.onDrawingChange(id, { note: value });
      if (p.onDrawingEdit) p.onDrawingEdit(null);
    };
    const children = editing
      ? [
          React.createElement(DrawNoteInput, {
            key: "note",
            defaultValue: d.note || "",
            maxLength: DRAWING_NOTE_MAX,
            autoFocus: true,
            "aria-label": msg("tool_note_label", "A note on this drawing"),
            placeholder: msg(
              "tool_note_placeholder",
              "A note — Enter keeps it",
            ),
            onKeyDown: (e) => {
              if (e.key === "Enter") commit(e.target.value);
              else if (e.key === "Escape" && p.onDrawingEdit)
                p.onDrawingEdit(null);
            },
            onBlur: (e) => commit(e.target.value),
          }),
        ]
      : [
          d.kind === "hline" && p.onDrawingTarget
            ? React.createElement(
                DrawMenuButton,
                {
                  key: "target",
                  onClick: () => p.onDrawingTarget(id),
                  "data-draw-target": "1",
                },
                msg("tool_target_here", "Price target here"),
              )
            : null,
          React.createElement(
            DrawMenuButton,
            {
              key: "note",
              onClick: () => p.onDrawingEdit && p.onDrawingEdit(id),
            },
            d.note
              ? msg("tool_note_edit", "Edit note")
              : msg("tool_note_add", "Note"),
          ),
          React.createElement(
            DrawMenuButton,
            {
              key: "del",
              onClick: () => p.onDrawingDelete && p.onDrawingDelete(id),
              "data-draw-delete": "1",
            },
            msg("tool_delete", "Delete"),
          ),
        ];
    return React.createElement(
      DrawMenu,
      { "data-draw-menu": id, style: { left: `${left}px`, top: `${top}px` } },
      ...children,
    );
  }
}
