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
const VIEW_WHEEL_SETTLE_MS = 240; // quiet this long and a wheel gesture has ended
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
const zoomView = (view, factor, anchor, lo, hi, minSpan) => {
  if (!view || !(factor > 0)) return null;
  const span = view.t1 - view.t0;
  if (!(span > 0)) return null;
  const at = isFinite(anchor) ? Math.max(view.t0, Math.min(view.t1, anchor)) : (view.t0 + view.t1) / 2;
  const share = (at - view.t0) / span;
  const full = hi - lo;
  const next = Math.min(full, Math.max(Math.min(minSpan || 0, full), span * factor));
  return clampView(at - share * next, next, lo, hi, minSpan);
};

/* Move by `delta` ms (positive is later), stopping at either end. */
const panView = (view, delta, lo, hi) => {
  if (!view || !isFinite(delta)) return null;
  return clampView(view.t0 + delta, view.t1 - view.t0, lo, hi, 0);
};

/* The whole range — the same as no window at all. */
const viewIsFull = (view, lo, hi) => !view || view.t1 - view.t0 >= (hi - lo) * 0.999;

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
  if (i0 >= n || at(i0) > t0) out.push({ price: priceAt(t0), time: new Date(t0), edge: true });
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
      const area = Math.abs((px - ax) * (y(points[j]) - py) - (px - x(points[j])) * (ay - py));
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
  if (!Array.isArray(moves) || !moves.length || !Array.isArray(line) || line.length < 2) return moves;
  const t0 = viewMs(line[0].time);
  const t1 = viewMs(line[line.length - 1].time);
  const out = [];
  for (const m of moves) {
    if (!(m.time >= t0 && m.time <= t1)) continue;
    let i = Math.min(line.length - 1, viewSearch(line, m.time));
    if (i > 0 && Math.abs(viewMs(line[i - 1].time) - m.time) < Math.abs(viewMs(line[i].time) - m.time)) i -= 1;
    if (line[i].edge) i = i === 0 ? 1 : line.length - 2;
    out.push(Object.assign({}, m, { index: i }));
  }
  return out;
};

/* Is `detail` usable for this window: the same coin and currency, finer than
   what the chart already has, and covering the whole window? */
const detailCovers = (detail, coin, currency, t0, t1, coarseMs) => {
  if (!detail || detail.coin !== coin || detail.currency !== currency) return false;
  const rows = detail.candles;
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const g = detail.g * 1000;
  if (!(g > 0) || (coarseMs > 0 && !(g < coarseMs * VIEW_FINER))) return false;
  return viewMs(rows[0].time) <= t0 + g && viewMs(rows[rows.length - 1].time) + 2 * g >= t1;
};

/* The window as the screen shows it: a window at the end follows the price
   to wherever the end now is. */
const resolveView = (view, lo, hi, minSpan) => {
  if (!view || !(hi > lo)) return null;
  const span = view.t1 - view.t0;
  const out = view.atNow ? clampView(hi - span, span, lo, hi, minSpan) : clampView(view.t0, span, lo, hi, minSpan);
  if (!out || viewIsFull(out, lo, hi)) return null;
  return Object.assign(out, { atNow: Boolean(view.atNow) || out.t1 >= hi });
};

/* "Sep 14, 09:00 – 15:30": the window's two ends, the date said once when
   both fall on the same day. */
const viewWindowText = (t0, t1) => {
  const day = { month: "short", day: "numeric" };
  const clock = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  const a = new Date(t0);
  const b = new Date(t1);
  const span = t1 - t0;
  if (span >= 7 * 86400000) return `${localeDate(a, day)} – ${localeDate(b, day)}`;
  const same = a.toDateString() === b.toDateString();
  const left = `${localeDate(a, day)}, ${localeDate(a, clock)}`;
  const right = same ? localeDate(b, clock) : `${localeDate(b, day)}, ${localeDate(b, clock)}`;
  return `${left} – ${right}`;
};

/* **The chart in one sentence**, for a screen reader (the chart plan's
 * Phase 6): which coin, in what, over which stretch, from what to what, and
 * where it was highest and lowest — the numbers a sighted reader takes from
 * the line at a glance. The stretch is the points' own first and last time,
 * so a zoomed window describes itself. Nothing about what comes next. */
const chartSummaryText = (points, opts) => {
  const list = (Array.isArray(points) ? points : []).filter((p) => p && !p.edge && Number(p.price) > 0);
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
  const change = ((Number(last.price) - Number(first.price)) / Number(first.price)) * 100;
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
  const list = (Array.isArray(prices) ? prices : []).filter((p) => p && Number(p.price) > 0);
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
  if (pts[pts.length - 1] !== list[list.length - 1]) pts.push(list[list.length - 1]);
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
      const from = inside ? v : panView(v, at - (v.t0 + v.t1) / 2, b.lo, b.hi) || v;
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
      const next = panView(d.from, ((e.clientX - d.x) / d.w) * (d.b.hi - d.b.lo), d.b.lo, d.b.hi);
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
  /* A pan is a sideways drag; a phone still scrolls the page up and down. */
  touch-action: ${({ enabled }) => (enabled ? "pan-y" : "auto")};
  user-select: ${({ enabled }) => (enabled ? "none" : "auto")};
  ${({ panning }) => (panning ? "&, & svg { cursor: grabbing; }" : "")}
  ${({ cursor, panning }) => (cursor && !panning ? `&, & svg { cursor: ${cursor}; }` : "")}
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
    this.state = { live: null, driven: false, panning: false, gesture: null, readText: "" };
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
      if (Math.abs(dy) > Math.abs(dx) && dy > 0 && viewIsFull(v, b.lo, b.hi) && this.props.onZoomPast) {
        clearTimeout(this._pastTimer);
        this._pastTimer = setTimeout(() => {
          this._past = 0;
        }, VIEW_PAST_IDLE_MS);
        if (this._pastCool) return;
        this._past = (this._past || 0) + dy;
        if (this._past >= VIEW_PAST_WHEEL) {
          this._past = 0;
          this._pastCool = true;
          setTimeout(() => {
            this._pastCool = false;
          }, VIEW_PAST_COOL_MS);
          this.props.onZoomPast(b.hi - b.lo);
        }
        return;
      }
      const next =
        Math.abs(dx) > Math.abs(dy)
          ? panView(v, (dx / box.w) * span, b.lo, b.hi)
          : zoomView(
              v,
              Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0015)),
              v.t0 + (box.x / box.w) * span,
              b.lo,
              b.hi,
              this.minSpan(b),
            );
      if (!next) return;
      this.show(next);
      clearTimeout(this._settle);
      this._settle = setTimeout(() => this.commit(this._pending || this.state.live), VIEW_WHEEL_SETTLE_MS);
    };

    /* ── A press on the plot: a pan, the ruler, or a drawing ──
     *
     * One pipeline for all three (chart-tools.js asks nothing of the pointer
     * itself). Shift, or the ruler put in the hand, measures; a press on a
     * drawing takes that drawing — a drag moves it, a click selects it; a
     * drawing tool in the hand leaves the press to the click that places an
     * anchor; anything else is a pan once it travels past the slop. */
    this.onPointerDown = (e) => {
      /* **A pinch on a touch screen** (30 Sep 2026, left from Phase 2). The
         fingers are kept by id; a second one landing while the first holds a
         pan turns the pan into a pinch. The page cannot pinch-zoom over the
         chart (`touch-action: pan-y`), so both fingers arrive here. */
      if (e.pointerType === "touch") {
        if (!this._touches) this._touches = new Map();
        this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._touches.size === 2 && this._drag && this._drag.mode === "pan") {
          this.startPinch();
          return;
        }
      }
      if (e.button !== 0 || e.isPrimary === false) return;
      const target = e.target;
      if (target && target.closest && target.closest(".pt-pan, .pt-now-grip, button, a, input, select, [data-draw-menu]")) return;
      const box = this.plotBox(e.clientX, e.clientY);
      if (!box) return;
      const chart = this.chart;
      const tools = Boolean(chart.toolsOn && chart.toolsOn());
      if (tools) chart.clearMeasure();
      let mode = "pan";
      let hit = null;
      if (tools && (e.shiftKey || this.props.tool === "measure")) {
        mode = "measure";
        chart.startMeasure(box.x, box.y);
      } else if (tools && this.props.tool) {
        return;
      } else if (tools) {
        hit = chart.toolHitAt(box.x, box.y);
        if (hit) {
          mode = "tool";
          chart.startToolDrag(hit, box.x, box.y);
        }
      }
      this._drag = { mode, hit, x: e.clientX, y: e.clientY, id: e.pointerId, from: this.current(), w: box.w, moved: false };
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
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved) {
        const far = d.mode === "pan" ? Math.abs(dx) : Math.hypot(dx, dy);
        if (far < VIEW_DRAG_SLOP) return;
        d.moved = true;
        if (this.chart) this.chart.clearHover();
        this.setState({ panning: d.mode === "pan", gesture: d.mode });
      }
      if (d.mode !== "pan") {
        const svg = this.chart && this.chart.svgRef && this.chart.svgRef.current;
        if (!svg) return;
        const r = svg.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        if (d.mode === "measure") this.chart.moveMeasure(x, y);
        else this.chart.moveToolDrag(x, y);
        return;
      }
      const b = this.bounds();
      if (!b) return;
      this.show(panView(d.from, (-dx / d.w) * (d.from.t1 - d.from.t0), b.lo, b.hi));
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
        this.commit(this._pending || this.state.live);
        return;
      }
      if (!d || e.pointerId !== d.id) return;
      this.endDrag();
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
      if (d.mode === "tool") {
        swallow();
        const out = this.chart ? this.chart.endToolDrag() : null;
        if (d.moved && out && this.props.onDrawingChange) this.props.onDrawingChange(out.id, { a: out.a, b: out.b });
        else if (!d.moved && d.hit && this.props.onDrawingSelect) this.props.onDrawingSelect(d.hit.id);
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
      if (!this.plotBox(e.clientX, e.clientY)) return;
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
    if (this._readAfter && prevProps.view !== this.props.view && this.chart && this.chart.readAfterPan) {
      const res = this.chart.readAfterPan(this._readAfter === "same" ? 0 : this._readAfter);
      this._readAfter = 0;
      if (res && res.text) this.setState({ readText: res.text });
    }
    /* A gesture on a chart that has become another one ends with it. */
    const switched =
      prevProps.coin !== this.props.coin ||
      prevProps.period !== this.props.period ||
      prevProps.currency !== this.props.currency ||
      (prevProps.viewEnabled && !this.props.viewEnabled);
    if (switched && (this.state.live || this._drag || this._pending)) {
      this.endDrag();
      cancelAnimationFrame(this._raf);
      this._raf = 0;
      clearTimeout(this._settle);
      this._pending = null;
      this.setState({ live: null, driven: false, panning: false, gesture: null });
    }
  }

  /* Two fingers: where they are, relative to the plot, and how far apart. */
  pinchPoints() {
    const svg = this.chart && this.chart.svgRef && this.chart.svgRef.current;
    if (!svg || !this._touches || this._touches.size < 2) return null;
    const r = svg.getBoundingClientRect();
    const [a, b] = [...this._touches.values()];
    return { mid: (a.x + b.x) / 2 - r.left, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  startPinch() {
    const d = this._drag;
    const at = this.pinchPoints();
    if (!d || !at || !(at.dist > 0)) return;
    d.mode = "pinch";
    d.moved = true;
    d.pinch = { from: this.current(), mid: at.mid, dist: at.dist };
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
    const zoomed = zoomView(from, dist / at.dist, anchor, b.lo, b.hi, this.minSpan(b));
    if (!zoomed) return;
    const moved = panView(zoomed, (-(at.mid - mid) / d.w) * (zoomed.t1 - zoomed.t0), b.lo, b.hi);
    this.show(moved || zoomed);
  }

  endDrag() {
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

  /* The narrowest window worth drawing: a dozen of the range's own points,
     or — where finer candles can be asked for — 24 minutes of 1m bars,
     whichever is narrower. */
  minSpan(b) {
    const p = this.props;
    const own = p.showCandles && Array.isArray(p.candles) ? viewStep(p.candles) : viewStep(p.prices);
    const coarse = own * VIEW_MIN_POINTS;
    const fine = VIEW_GRANULARITIES[0] * 1000 * VIEW_MIN_BARS;
    const want = p.detailSupported ? Math.min(coarse, fine) : coarse;
    return Math.min(b ? b.hi - b.lo : Infinity, want);
  }

  enabled() {
    return Boolean(this.props.viewEnabled) && Boolean(this.bounds()) && Boolean(this.chart);
  }

  // The window in hand: mid-gesture, set, or the whole range
  current() {
    const b = this.bounds();
    if (!b) return null;
    const v = resolveView(this._pending || this.state.live || this.props.view, b.lo, b.hi, this.minSpan(b));
    return v || { t0: b.lo, t1: b.hi, atNow: true };
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

  // One redraw per frame while a hand or a wheel drives the window
  show(view) {
    if (!view) return;
    this._pending = view;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      const next = this._pending;
      if (next) this.setState({ live: next, driven: true });
    });
  }

  /* The gesture is over: the window goes to the app once, as a start, an
     end and whether it follows the price. The whole range is no window. */
  commit(view) {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    clearTimeout(this._settle);
    this._pending = null;
    const b = this.bounds();
    let out = null;
    if (view && b && !viewIsFull(view, b.lo, b.hi)) {
      const span = view.t1 - view.t0;
      out = { t0: view.t0, t1: view.t1, atNow: view.t1 >= b.hi - span * VIEW_AT_NOW };
    }
    if (this.props.onViewChange) this.props.onViewChange(out);
    this.setState({ live: null, driven: false, panning: false, gesture: null });
  }

  /* For the app's keys: + / − zoom around the latest price when the window
     follows it and around the middle otherwise; ← / → walk a fifth. */
  zoomBy(factor) {
    if (!this.enabled()) return false;
    const b = this.bounds();
    const v = this.current();
    // − on the whole range: the next range, framed on this one's span
    if (factor > 1 && viewIsFull(v, b.lo, b.hi) && this.props.onZoomPast) {
      this.props.onZoomPast(b.hi - b.lo);
      return true;
    }
    const anchor = v.atNow ? b.hi : (v.t0 + v.t1) / 2;
    const next = zoomView(v, factor, anchor, b.lo, b.hi, this.minSpan(b));
    if (next) this.commit(next);
    return true;
  }

  panBy(share) {
    if (!this.enabled()) return false;
    const b = this.bounds();
    const v = this.current();
    const next = panView(v, share * (v.t1 - v.t0), b.lo, b.hi);
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
      res = { text: back ? msg("read_first", "The first point on the chart") : msg("read_last", "The latest point") };
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
    if (room && this.chart && this.chart.reading && this.chart.reading()) this._readAfter = "same";
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
    if (m && m.prices === prices && m.coin === p.coin && m.currency === p.currency && m.fmt === p.formatPrice && m.period === p.period) {
      return m.text;
    }
    const fmt = (v) => (p.formatPrice ? p.formatPrice(Number(v)) : String(v));
    const when = (t) => crosshairDate(new Date(viewMs(t)), p.period);
    const text = chartSummaryText(prices, { coin: p.coin || "", currency: p.currency || "", fmt, when });
    this._summaryMemo = { prices, coin: p.coin, currency: p.currency, fmt: p.formatPrice, period: p.period, text };
    return text;
  }

  /* What the chart is handed: the series, the candles, the crosshair's
     candles and the move marks, cut to the window — the same arrays as
     before when there is no window, so nothing redraws for nothing. */
  shape() {
    const p = this.props;
    const b = this.bounds();
    const v = b && p.viewEnabled ? resolveView(this.state.live || p.view, b.lo, b.hi, this.minSpan(b)) : null;
    const width = this.chart ? this.chart.width : 0;
    const m = this._memo;
    if (
      m &&
      m.prices === p.prices &&
      m.candles === p.candles &&
      m.ohlc === p.ohlc &&
      m.moves === p.moves &&
      m.detail === p.detail &&
      m.showCandles === p.showCandles &&
      m.t0 === (v && v.t0) &&
      m.t1 === (v && v.t1) &&
      m.width === width
    ) {
      return m.out;
    }
    let out;
    if (!v) {
      out = { prices: p.prices, candles: p.candles, ohlc: p.ohlc, moves: p.moves, lastPoint: null, atNow: true, viewWindow: null };
    } else {
      const candleMode = Boolean(p.showCandles && Array.isArray(p.candles) && p.candles.length);
      const coarseMs = candleMode ? viewStep(p.candles) : viewStep(p.prices);
      const fine = detailCovers(p.detail, p.coin, p.currency, v.t0, v.t1, coarseMs) ? p.detail : null;
      const full = p.prices;
      const last = full[full.length - 1];
      let candles = p.candles;
      let line;
      if (candleMode) {
        candles = sliceCandles(fine ? fine.candles : p.candles, v.t0, v.t1);
        line = candles.map((c) => ({ price: c.close, time: new Date(c.time) }));
        if (line.length < 2) line = sliceSeries(full, v.t0, v.t1);
      } else {
        let source = full;
        if (fine) {
          source = fine.candles.map((c) => ({ price: c.close, time: new Date(c.time) }));
          // The live end: the range's own latest price, when it is newer
          if (viewMs(last.time) > viewMs(source[source.length - 1].time)) source = source.concat([last]);
        }
        line = sliceSeries(source, v.t0, v.t1);
        if (width > 0 && line.length > width * VIEW_LTTB_OVER) line = lttb(line, Math.round(width));
      }
      out = {
        prices: line,
        candles,
        ohlc: fine ? fine.candles : p.ohlc,
        moves: remapMoves(p.moves, line),
        lastPoint: { price: Number(last.price), time: last.time, up: Number(last.price) >= Number(full[0].price) },
        atNow: v.atNow,
        viewWindow: { t0: v.t0, t1: v.t1, g: fine ? fine.g : 0 },
      };
    }
    this._memo = {
      prices: p.prices,
      candles: p.candles,
      ohlc: p.ohlc,
      moves: p.moves,
      detail: p.detail,
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
    for (const k of ["view", "onViewChange", "viewEnabled", "detail", "detailSupported", "onZoomPast"]) delete rest[k];
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
        cursor: gesture === "measure" ? "crosshair" : gesture === "tool" ? "move" : enabled && this.props.tool ? "crosshair" : null,
        "data-chart-viewport": enabled ? "1" : undefined,
        "data-chart-window": shaped.viewWindow ? `${Math.round(shaped.viewWindow.t0)}-${Math.round(shaped.viewWindow.t1)}` : undefined,
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
          // The readout waits for any gesture, not only a pan
          panning: Boolean(gesture),
          chartRef: this.setChart,
          // The ruler counts moves on the whole range, not the window
          countSeries: this.props.prices,
          drawTools: enabled,
        }),
      ),
      this.renderDrawMenu(),
      React.createElement(ReadingText, { id: this.summaryId, "data-chart-summary": "1" }, summary),
      React.createElement(ReadingText, { "aria-live": "polite", "data-chart-reading": "1" }, this.state.readText),
    );
  }

  /* **The selected drawing's menu**, over the plot beside it: a price
   * target at a horizontal line's level (the existing target, set from the
   * targets drawer — no new alarm), its note, and taking it away. The note is
   * edited here in place; Enter keeps it, Esc leaves it as it was. */
  renderDrawMenu() {
    const p = this.props;
    const chart = this.chart;
    if (!p.viewEnabled || !chart || !chart.toolsOn || !chart.toolsOn()) return null;
    const id = p.drawingSelected;
    const d = id && Array.isArray(p.drawings) ? p.drawings.find((x) => x.id === id) : null;
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
            placeholder: msg("tool_note_placeholder", "A note — Enter keeps it"),
            onKeyDown: (e) => {
              if (e.key === "Enter") commit(e.target.value);
              else if (e.key === "Escape" && p.onDrawingEdit) p.onDrawingEdit(null);
            },
            onBlur: (e) => commit(e.target.value),
          }),
        ]
      : [
          d.kind === "hline" && p.onDrawingTarget
            ? React.createElement(
                DrawMenuButton,
                { key: "target", onClick: () => p.onDrawingTarget(id), "data-draw-target": "1" },
                msg("tool_target_here", "Price target here"),
              )
            : null,
          React.createElement(
            DrawMenuButton,
            { key: "note", onClick: () => p.onDrawingEdit && p.onDrawingEdit(id) },
            d.note ? msg("tool_note_edit", "Edit note") : msg("tool_note_add", "Note"),
          ),
          React.createElement(
            DrawMenuButton,
            { key: "del", onClick: () => p.onDrawingDelete && p.onDrawingDelete(id), "data-draw-delete": "1" },
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
