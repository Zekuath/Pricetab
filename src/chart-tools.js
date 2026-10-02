/* THE CHART'S TOOLS — a ruler, drawings, and a line that becomes a target
 * (the chart plan's Phase 3)
 *
 * **The ruler.** Shift and drag — or the ruler over the chart, then drag —
 * from one point to another: the change in price and in percent, the time
 * between them, how many bars, and how often the range's own series moved
 * that far, up or down, over a stretch that long (`measureCount`). A count
 * with its denominator, never a forecast; below `BASE_RATE_MIN_EPISODES`
 * stretches it says there are too few to count. It stays until the next
 * press on the chart, and leaves nothing behind.
 *
 * **Drawings.** A horizontal line, a trend line, a ray, a box and a note,
 * stored per coin (`DRAWINGS_KEY`) and anchored in **time and price** — never
 * in pixels — so a line drawn on 1D is at the same price and moment on 1W, in a
 * zoomed window and after every refresh. Drawn in the levels' secondary ink;
 * the selected one in the text ink with its handles. Pressed and dragged,
 * one moves; its handle moves one end. The list in the chart's drawer (V)
 * reaches every one of them from the keyboard.
 *
 * **One pointer pipeline.** Nothing here listens to the pointer on its own:
 * the press, the drag and the release are `ChartView`'s (chart-viewport.js),
 * which asks `toolHitAt` whether a press landed on a drawing and hands the
 * gesture here; the click that places an anchor comes through the chart's own
 * `handleChartClick`, wrapped below. Hits are found by distance, the rule the
 * companion's marks follow — never by hit-testing SVG.
 *
 * **Where it stands down.** With calls on and under a comparison, the rule
 * the window in time follows: the board has its own price window and a
 * comparison has no price axis at all.
 *
 * Same idiom as `chart-axes.js`: a plain function handed the `LineBase`,
 * attached in its constructor. The pure helpers are tested in
 * `tests/test-tools.js`.
 */

const DRAW_HIT_PX = 7; // how far from a line a press still takes it
const DRAW_HANDLE_R = 4.5;
const DRAW_TWO = ["trend", "ray", "box"]; // the kinds with two anchors

const drawAnchorCount = (kind) => (DRAW_TWO.includes(kind) ? 2 : 1);

/* **How often the series moved at least this far over this long.** Every
 * stretch of `dt` ms that starts on one of the series' points and ends inside
 * it is one stretch; it moved "this far" when the log change between its two
 * ends is at least `|move|` — up or down, the ruler measures a distance. The
 * stretches overlap, which the words say ("of N stretches this long"), and the
 * end of each is the first point at or after its instant. Null when there is
 * no stretch at all. */
const measureCount = (points, dt, move) => {
  const n = Array.isArray(points) ? points.length : 0;
  if (n < 3 || !(dt > 0) || !isFinite(move)) return null;
  const ts = points.map((p) => (p.time instanceof Date ? p.time.getTime() : Number(p.time)));
  const ps = points.map((p) => Number(p.price));
  const need = Math.abs(move) - 1e-12;
  let windows = 0;
  let hits = 0;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const end = ts[i] + dt;
    if (end > ts[n - 1]) break;
    if (j <= i) j = i + 1;
    while (j < n - 1 && ts[j] < end) j++;
    if (!(ps[i] > 0) || !(ps[j] > 0)) continue;
    windows++;
    if (Math.abs(Math.log(ps[j] / ps[i])) >= need) hits++;
  }
  return windows ? { hits, windows } : null;
};

/* The distance from (x, y) to the segment a–b — or, with `ray`, to the half
   line from a through b. */
const segmentDistance = (x, y, ax, ay, bx, by, ray) => {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let k = len > 0 ? ((x - ax) * dx + (y - ay) * dy) / len : 0;
  k = ray ? Math.max(0, k) : Math.max(0, Math.min(1, k));
  const px = ax + k * dx;
  const py = ay + k * dy;
  return Math.hypot(x - px, y - py);
};

/* A drawing moved by a drag of its body: the time by the same interval, the
   price by the same difference — or, on a log axis, the same ratio, so a
   line keeps its slope in the units it is drawn in. */
const shiftDrawing = (d, dt, dp, ratio) => {
  const move = (a) => ({ t: a.t + dt, p: ratio ? a.p * ratio : a.p + dp });
  const out = Object.assign({}, d, { a: move(d.a) });
  if (d.b) out.b = move(d.b);
  return out;
};

const chartTools = (chart) => ({
  toolsOn: () => Boolean(chart.props.drawTools) && !chart.props.predict && !chart.compareScaled,

  /* Time and price to the plot and back, **unclamped** — a trend line's end
     may be off the chart, and `levelY` answers null there by design. Mirrors
     `levelY`'s order: the grid's own scale while the mesh is drawn, the
     candles' band in candle mode, else the line's domain with its padding,
     on the log axis when that is what is drawn. */
  drawScale: () => (chart.toolsOn() ? chart.plotScale() : null),

  // The same, for anything else drawn in time and price (chart-studies.js)
  plotScale: () => {
    if (chart.props.predict || chart.compareScaled) return null;
    const time = chart.axisTimeMap();
    if (!time) return null;
    const grid = chart.priceToY;
    if (grid && typeof grid.invert === "function") {
      return { toX: time.toX, toT: time.toT, toY: (v) => grid(v), toV: (y) => grid.invert(y), log: false };
    }
    const candles = chart.candleMap();
    if (candles) {
      return { toX: time.toX, toT: time.toT, toY: candles.toY, toV: candles.toV, log: false };
    }
    const data = safePrices(chart.props.prices);
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of data) {
      const v = Number(d.price);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!(hi > lo)) return null;
    [lo, hi] = shiftDomain(lo, hi, chart.yShift(), chart.logAxis() && canScaleLog([lo, hi]));
    const top = PADDING;
    const bottom = chart.height - PADDING;
    const log = chart.logAxis() && canScaleLog([lo, hi]);
    const f = log ? Math.log : (v) => v;
    const fi = log ? Math.exp : (v) => v;
    const a = f(lo);
    const b = f(hi);
    return {
      toX: time.toX,
      toT: time.toT,
      toY: (v) => (v > 0 || !log ? bottom - ((f(v) - a) / (b - a)) * (bottom - top) : NaN),
      toV: (y) => fi(a + ((bottom - y) / (bottom - top)) * (b - a)),
      log,
    };
  },

  // A point on the plot as the anchor it stands for, or null
  toolPoint: (x, y) => {
    const sc = chart.drawScale();
    if (!sc) return null;
    const t = sc.toT(x);
    const p = sc.toV(y);
    return isFinite(t) && isFinite(p) && p > 0 ? { t, p } : null;
  },

  // An anchor on the plot, or null
  drawPoint: (a) => {
    const sc = chart.drawScale();
    if (!sc || !a) return null;
    const x = sc.toX(a.t);
    const y = sc.toY(a.p);
    return isFinite(x) && isFinite(y) ? { x, y } : null;
  },

  // The drawings as they are drawn — one being dragged in its new place
  toolDrawings: () => {
    const list = Array.isArray(chart.props.drawings) ? chart.props.drawings : [];
    const drag = chart._toolDrag;
    return drag && drag.now ? list.map((d) => (d.id === drag.id ? drag.now : d)) : list;
  },

  /* Which drawing a press at (x, y) lands on, and which part of it: an end
     (its handle), or the body. The selected drawing's handles first, then
     the nearest line within `DRAW_HIT_PX`. */
  toolHitAt: (x, y) => {
    if (!chart.toolsOn()) return null;
    const sc = chart.drawScale();
    if (!sc) return null;
    let best = null;
    const consider = (id, part, dist) => {
      if (dist <= DRAW_HIT_PX && (!best || dist < best.dist)) best = { id, part, dist };
    };
    for (const d of chart.toolDrawings()) {
      const a = { x: sc.toX(d.a.t), y: sc.toY(d.a.p) };
      const b = d.b ? { x: sc.toX(d.b.t), y: sc.toY(d.b.p) } : null;
      if (d.id === chart.props.drawingSelected) {
        consider(d.id, "a", Math.hypot(x - a.x, y - a.y) - 2);
        if (b) consider(d.id, "b", Math.hypot(x - b.x, y - b.y) - 2);
      }
      if (d.kind === "hline") consider(d.id, "body", Math.abs(y - a.y));
      else if (d.kind === "note") consider(d.id, "body", Math.hypot(x - a.x, y - a.y) - 4);
      else if (d.kind === "trend") consider(d.id, "body", segmentDistance(x, y, a.x, a.y, b.x, b.y, false));
      else if (d.kind === "ray") consider(d.id, "body", segmentDistance(x, y, a.x, a.y, b.x, b.y, true));
      else if (d.kind === "box") {
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const y1 = Math.max(a.y, b.y);
        const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
        const edge = Math.min(
          Math.abs(x - x0), Math.abs(x - x1), Math.abs(y - y0), Math.abs(y - y1),
        );
        consider(d.id, "body", inside ? Math.min(edge, DRAW_HIT_PX - 1) : Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1)));
      }
    }
    return best ? { id: best.id, part: best.part } : null;
  },

  /* ── Moving a drawing ── */
  startToolDrag: (hit, x, y) => {
    const d = chart.toolDrawings().find((q) => q.id === hit.id);
    if (!d) return;
    chart._toolDrag = { id: d.id, part: hit.part, from: { x, y }, orig: d, now: null };
  },
  moveToolDrag: (x, y) => {
    const g = chart._toolDrag;
    const sc = chart.drawScale();
    if (!g || !sc) return;
    const d = g.orig;
    if (g.part === "a" || g.part === "b") {
      const pt = chart.toolPoint(x, y);
      if (!pt) return;
      g.now = Object.assign({}, d, { [g.part]: d.kind === "hline" ? { t: d.a.t, p: pt.p } : pt });
    } else {
      const dt = sc.toT(x) - sc.toT(g.from.x);
      const v0 = sc.toV(g.from.y);
      const v1 = sc.toV(y);
      if (!isFinite(dt) || !(v0 > 0) || !(v1 > 0)) return;
      const ratio = sc.log ? v1 / v0 : 0;
      g.now = shiftDrawing(d, d.kind === "hline" ? 0 : dt, v1 - v0, ratio);
      if (g.now.a.p <= 0 || (g.now.b && g.now.b.p <= 0)) g.now = null;
    }
    chart.updateTools();
  },
  endToolDrag: () => {
    const g = chart._toolDrag;
    chart._toolDrag = null;
    if (!g || !g.now) {
      chart.updateTools();
      return null;
    }
    const out = { id: g.id, a: g.now.a, b: g.now.b };
    return out;
  },

  /* ── The ruler ── */
  startMeasure: (x, y) => {
    const a = chart.toolPoint(x, y);
    chart._measure = a ? { a, b: a } : null;
    chart.updateTools();
  },
  moveMeasure: (x, y) => {
    const m = chart._measure;
    const b = chart.toolPoint(x, y);
    if (!m || !b) return;
    m.b = b;
    chart.updateTools();
  },
  clearMeasure: () => {
    if (!chart._measure) return;
    chart._measure = null;
    chart.updateTools();
  },

  /* What the ruler says, as lines of text: the change, the time and the
     bars, and the count. */
  measureLines: (m) => {
    const dp = m.b.p - m.a.p;
    const pct = (dp / m.a.p) * 100;
    const fmt = chart.props.formatPrice ? (v) => String(chart.props.formatPrice(v)) : (v) => v.toFixed(2);
    const sign = dp > 0 ? "+" : dp < 0 ? "−" : "";
    const dt = Math.abs(m.b.t - m.a.t);
    const lo = Math.min(m.a.t, m.b.t);
    const hi = Math.max(m.a.t, m.b.t);
    const bars = chart.props.showCandles && Array.isArray(chart.props.candles) ? chart.props.candles : safePrices(chart.props.prices);
    let n = 0;
    for (const c of bars) {
      const t = c.time instanceof Date ? c.time.getTime() : Number(c.time);
      if (t >= lo && t <= hi && !c.edge) n += 1;
    }
    const lines = [
      `${formatSignedPercent(pct)} · ${sign}${fmt(Math.abs(dp))}`,
      msg("tool_measure_span", "$1 · $2 bars", describeSpan(dt) || "0 min", String(n)),
    ];
    const count = measureCount(chart.props.countSeries || chart.props.prices, dt, Math.log(m.b.p / m.a.p));
    if (dt > 0 && count && count.windows >= BASE_RATE_MIN_EPISODES) {
      lines.push(
        msg("tool_measure_count", "Moved this far in this long: $1 of $2 stretches here", String(count.hits), String(count.windows)),
      );
    } else if (dt > 0) {
      lines.push(msg("tool_measure_few", "Too few stretches this long here to count"));
    }
    return lines;
  },

  /* ── Placing a drawing: the click that lands, one anchor at a time ── */
  placeAnchor: (x, y) => {
    const kind = chart.props.tool;
    const pt = chart.toolPoint(x, y);
    if (!pt || !DRAWING_KINDS.includes(kind) || typeof chart.props.onDrawingAdd !== "function") return;
    if (drawAnchorCount(kind) === 1) {
      chart._draft = null;
      chart.props.onDrawingAdd({ kind, a: pt });
      return;
    }
    const draft = chart._draft;
    if (!draft || draft.kind !== kind) {
      chart._draft = { kind, a: pt };
      chart.updateTools();
      return;
    }
    chart._draft = null;
    const pa = chart.drawPoint(draft.a);
    if (pa && Math.hypot(pa.x - x, pa.y - y) < 4) {
      // Two presses on one spot are not a line
      chart.updateTools();
      return;
    }
    chart.props.onDrawingAdd({ kind, a: draft.a, b: pt });
  },

  /* ── Drawing it all ── */
  // One pool per group, so a reused node is never in another group's paint order
  toolNode: (pool, tag, kind) => chart.poolNode(chart._tools[pool], tag, chart.toolGroup(kind)),

  toolGroup: (kind) => {
    const layer = chart.toolsRef.current;
    const pools = chart._tools;
    if (!pools.groups) pools.groups = {};
    let g = pools.groups[kind];
    if (!g || g.parentNode !== layer) {
      g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-tool-layer", kind);
      // Fills, lines, handles, the words' pills, the words — by kind, never
      // by the order a pooled node happened to be made in (see chart-axes.js)
      const order = ["fills", "lines", "handles", "pills", "words"];
      const after = order.slice(order.indexOf(kind) + 1).map((k) => pools.groups[k]).find((n) => n && n.parentNode === layer);
      layer.insertBefore(g, after || null);
      pools.groups[kind] = g;
    }
    return g;
  },

  toolLine: (x1, y1, x2, y2, ink, dash, width, id) => {
    const el = chart.toolNode("lines", "line", "lines");
    el.setAttribute("x1", x1);
    el.setAttribute("y1", y1);
    el.setAttribute("x2", x2);
    el.setAttribute("y2", y2);
    el.setAttribute("stroke", ink);
    el.setAttribute("stroke-width", String(width || 1.25));
    el.setAttribute("stroke-dasharray", dash || "none");
    el.setAttribute("stroke-linecap", "round");
    if (id) el.setAttribute("data-drawing", id);
    else el.removeAttribute("data-drawing");
    return el;
  },

  toolRect: (x, y, w, h, fill, stroke, opacity, id, pool) => {
    const words = pool === "words";
    const el = chart.toolNode(words ? "wordRects" : "fillRects", "rect", words ? "pills" : "fills");
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.setAttribute("width", Math.max(0, w));
    el.setAttribute("height", Math.max(0, h));
    el.setAttribute("rx", words ? "3" : "0");
    el.setAttribute("fill", fill);
    el.setAttribute("fill-opacity", String(opacity == null ? 1 : opacity));
    el.setAttribute("stroke", stroke || "none");
    el.setAttribute("stroke-dasharray", "none");
    if (id) el.setAttribute("data-drawing", id);
    else el.removeAttribute("data-drawing");
    return el;
  },

  toolText: (x, y, text, ink, anchor, weight) => {
    const { font } = chart.props.theme;
    const el = chart.toolNode("texts", "text", "words");
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.setAttribute("fill", ink);
    el.setAttribute("text-anchor", anchor || "start");
    el.setAttribute("font-size", "10");
    el.setAttribute("font-family", font.primary);
    el.setAttribute("font-weight", weight || "400");
    if (el.textContent !== text) el.textContent = text;
    return el;
  },

  toolHandle: (x, y, ink, bg) => {
    const el = chart.toolNode("circles", "circle", "handles");
    el.setAttribute("cx", x);
    el.setAttribute("cy", y);
    el.setAttribute("r", String(DRAW_HANDLE_R));
    el.setAttribute("fill", bg);
    el.setAttribute("stroke", ink);
    el.setAttribute("stroke-width", "1.25");
    el.removeAttribute("data-drawing");
    return el;
  },

  // A word on a pill of the page's ground, so it reads over the line
  toolLabel: (x, y, text, ink, anchor) => {
    const { color } = chart.props.theme;
    const w = text.length * AXIS_CHAR + 8;
    const left = anchor === "end" ? x - w : x;
    const pill = chart.toolRect(left, y - 11, w, 15, color.bg, color.border, 0.92, null, "words");
    const word = chart.toolText(left + 4, y, text, ink, "start");
    // To the plot's one label lane (edgeMark, chart-axes.js)
    if (chart._edgeTools) chart._edgeTools.push({ nodes: [pill, word], rank: 4 });
  },

  // One drawing, in `ink`, with a dash when it is only a preview
  toolShape: (d, sc, ink, dash, selected) => {
    const W = chart.width;
    const H = chart.height;
    const { color } = chart.props.theme;
    const ax = sc.toX(d.a.t);
    const ay = sc.toY(d.a.p);
    const width = selected ? 1.75 : 1.25;
    if (!isFinite(ay)) return;
    if (d.kind === "hline") {
      chart.toolLine(0, ay, W, ay, ink, dash, width, d.id);
      const fmt = chart.props.formatPrice ? String(chart.props.formatPrice(d.a.p)) : d.a.p.toFixed(2);
      chart.toolLabel(W - 6, ay - 4, d.note ? `${d.note} · ${fmt}` : fmt, ink, "end");
    } else if (d.kind === "note") {
      const dot = chart.toolHandle(ax, ay, ink, ink);
      dot.setAttribute("r", "2.5");
      dot.setAttribute("data-drawing", d.id);
      chart.toolLabel(ax + 7, ay - 5, d.note || msg("tool_note_empty", "Note"), ink, "start");
    } else if (d.b) {
      const bx = sc.toX(d.b.t);
      const by = sc.toY(d.b.p);
      if (!isFinite(ax) || !isFinite(bx) || !isFinite(by)) return;
      if (d.kind === "box") {
        chart.toolRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), ink, ink, 0.07, d.id);
        const edges = [[ax, ay, bx, ay], [bx, ay, bx, by], [bx, by, ax, by], [ax, by, ax, ay]];
        for (const [x1, y1, x2, y2] of edges) chart.toolLine(x1, y1, x2, y2, ink, dash, width, d.id);
      } else {
        let ex = bx;
        let ey = by;
        if (d.kind === "ray") {
          // On past the second point to the edge of the plot and beyond
          const len = Math.hypot(bx - ax, by - ay) || 1;
          const far = (W + H) * 4;
          ex = ax + ((bx - ax) / len) * far;
          ey = ay + ((by - ay) / len) * far;
        }
        chart.toolLine(ax, ay, ex, ey, ink, dash, width, d.id);
      }
      if (d.note && d.kind !== "box") chart.toolLabel(bx + 7, by - 5, d.note, ink, "start");
      if (d.note && d.kind === "box") chart.toolLabel(Math.min(ax, bx) + 4, Math.min(ay, by) + 14, d.note, ink, "start");
    }
    if (selected) {
      chart.toolHandle(d.kind === "hline" ? Math.min(W - 12, Math.max(12, ax)) : ax, ay, color.text, color.bg);
      if (d.b) chart.toolHandle(sc.toX(d.b.t), sc.toY(d.b.p), color.text, color.bg);
    }
  },

  updateTools: () => {
    const layer = chart.toolsRef.current;
    if (!layer || !chart._tools) return;
    const pools = chart._tools;
    const kinds = ["lines", "fillRects", "wordRects", "texts", "circles"];
    for (const k of kinds) pools[k].at = 0;
    chart._edgeTools = [];
    const done = () => {
      for (const k of kinds) chart.hideRest(pools[k]);
      chart.edgeMark("tools", chart._edgeTools);
    };
    const sc = chart.drawScale();
    if (!sc || !(chart.width > 0)) {
      done();
      return;
    }
    const clip = chart.toolClipRef.current;
    if (clip) {
      clip.setAttribute("width", chart.width);
      clip.setAttribute("height", chart.height);
    }
    const { color } = chart.props.theme;
    const selected = chart.props.drawingSelected;
    for (const d of chart.toolDrawings()) {
      const on = d.id === selected;
      chart.toolShape(d, sc, on ? color.text : color.textSecondary, null, on);
    }

    /* The drawing being placed: its first anchor is down and the second
       follows the pointer; a one-anchor tool shows where it would land. */
    const tool = chart.props.tool;
    const hover = chart._toolHover;
    if (DRAWING_KINDS.includes(tool) && hover) {
      const draft = chart._draft && chart._draft.kind === tool ? chart._draft : null;
      const ghost = draft
        ? { id: "", kind: tool, a: draft.a, b: hover }
        : { id: "", kind: tool, a: hover, b: drawAnchorCount(tool) === 2 ? null : undefined };
      if (ghost.kind === "hline" || ghost.kind === "note" || ghost.b) {
        chart.toolShape(ghost, sc, color.textSecondary, "3 3", false);
      } else {
        chart.toolHandle(sc.toX(ghost.a.t), sc.toY(ghost.a.p), color.textSecondary, color.bg);
      }
    }

    // The ruler: a box from where it started to where it is, and its words
    const m = chart._measure;
    if (m) {
      const ax = sc.toX(m.a.t);
      const ay = sc.toY(m.a.p);
      const bx = sc.toX(m.b.t);
      const by = sc.toY(m.b.p);
      if ([ax, ay, bx, by].every(isFinite)) {
        const ink = m.b.p >= m.a.p ? color.chartLineGreen : color.chartLineRed;
        chart.toolRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), ink, null, 0.1);
        chart.toolLine(ax, ay, bx, by, ink, "4 3", 1.25);
        const lines = chart.measureLines(m);
        const widest = Math.max(...lines.map((l) => l.length)) * AXIS_CHAR + 12;
        const boxH = lines.length * 14 + 8;
        const lx = Math.max(2, Math.min(chart.width - widest - 2, bx + (bx >= ax ? 10 : -10 - widest)));
        const ly = Math.max(2, Math.min(chart.height - boxH - 2, by + (by >= ay ? 8 : -8 - boxH)));
        const pill = chart.toolRect(lx, ly, widest, boxH, color.bg, ink, 0.96, null, "words");
        pill.setAttribute("rx", "4");
        pill.setAttribute("data-measure", "1");
        lines.forEach((l, i) => {
          const el = chart.toolText(lx + 6, ly + 15 + i * 14, l, i === 0 ? ink : color.text, "start", i === 0 ? "600" : "400");
          el.setAttribute("data-measure-line", String(i));
        });
      }
    }
    done();
  },

  /* Wrap the entry points the tools ride on, the way `wireAxes` does. */
  /* ── Reading the chart from the keyboard (the chart plan's Phase 6) ──
   *
   * With the chart focused, ← and → walk the points the chart draws — the
   * candles in candle mode — one at a time, and the crosshair, its readout
   * and the axes' pills go where a pointer would have put them: the same
   * drawing, driven by an index instead of a pixel. The practice chart has
   * done this since 19 Sep 2026; the main chart had only a label. What each
   * step says is returned for the page to announce (ChartView's live
   * region), because a screen reader cannot read a crosshair.
   *
   * The place is kept as a **time**, not an index: when the window follows a
   * step past its edge, the points are cut again and an index would point at
   * a different moment. The window's cut edges (`edge`) are where the line
   * crosses the frame, not prices anyone quoted, so they are not read. */
  readPoints: () => {
    if (chart.props.showCandles && chart.candleScale && chart.candleBars) {
      return chart.candleScale.bars.map((bar, i) => ({
        x: bar.x,
        y: bar.yClose,
        t: +new Date(chart.candleBars[i].time),
        candle: chart.candleBars[i],
      }));
    }
    const raw = safePrices(chart.props.prices);
    const s = chart.scaled;
    if (!s || s.length < 2 || s.length !== raw.length) return [];
    const out = [];
    for (let i = 0; i < s.length; i++) {
      if (raw[i].edge) continue;
      out.push({ x: s[i].time, y: s[i].price, t: +new Date(raw[i].time), price: Number(raw[i].price) });
    }
    return out;
  },

  // The point nearest a time, by halving: the list is in time order
  readNearest: (pts, t) => {
    let a = 0;
    let b = pts.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (pts[m].t < t) a = m;
      else b = m;
    }
    return Math.abs(pts[a].t - t) <= Math.abs(pts[b].t - t) ? a : b;
  },

  readAt: (pts, i) => {
    const p = pts[i];
    if (chart.hoverRaf) {
      cancelAnimationFrame(chart.hoverRaf);
      chart.hoverRaf = 0;
    }
    chart.hoverX = p.x;
    chart.hoverY = p.y;
    // Drawn even when the point is the one last drawn — the memo would skip it
    chart.hoverIndex = -1;
    chart.drawCrosshair();
    chart._readT = p.t;
    const fmt = (v) => (chart.props.formatPrice ? chart.props.formatPrice(Number(v)) : String(v));
    /* The range's own date, and the clock too wherever two points share a
       day — "Sep 30" twice, a step apart, reads as no step at all. */
    const step = pts.length > 1 ? Math.abs(pts[1].t - pts[0].t) : Infinity;
    const when =
      step < 86400000
        ? localeDate(new Date(p.t), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        : crosshairDate(new Date(p.t), chart.props.period);
    const text = p.candle
      ? msg("read_candle", "$1 — open $2, high $3, low $4, close $5", when, fmt(p.candle.open), fmt(p.candle.high), fmt(p.candle.low), fmt(p.candle.close))
      : msg("read_point", "$1 — $2", when, fmt(p.price));
    return { index: i, count: pts.length, text };
  },

  /* One step. The first press reads the latest point, which is where a
     person reading a price chart starts; past either end it answers the
     edge and moves nothing, so the window can follow. */
  readStep: (delta) => {
    const pts = chart.readPoints();
    if (!pts.length) return null;
    if (chart._readT == null) return chart.readAt(pts, pts.length - 1);
    const to = chart.readNearest(pts, chart._readT) + delta;
    if (to < 0) return { edge: "start" };
    if (to >= pts.length) return { edge: "end" };
    return chart.readAt(pts, to);
  },

  // Home and End: the first and the latest point in the window
  readEdge: (last) => {
    const pts = chart.readPoints();
    return pts.length ? chart.readAt(pts, last ? pts.length - 1 : 0) : null;
  },

  // After the window followed a step: the step, taken in the new window
  readAfterPan: (delta) => {
    const pts = chart.readPoints();
    if (!pts.length || chart._readT == null) return null;
    const at = chart.readNearest(pts, chart._readT);
    const to = Math.max(0, Math.min(pts.length - 1, pts[at].t === chart._readT ? at + delta : at));
    return chart.readAt(pts, to);
  },

  reading: () => chart._readT != null,

  stopReading: () => {
    if (chart._readT == null) return;
    chart._readT = null;
    chart.clearHover();
  },

  wireTools: () => {
    const click = chart.handleChartClick;
    chart.handleChartClick = (e) => {
      if (chart.toolsOn()) {
        if (DRAWING_KINDS.includes(chart.props.tool)) {
          if (e.offsetX <= chart.width && e.offsetY <= chart.height) chart.placeAnchor(e.offsetX, e.offsetY);
          return;
        }
        if (chart.props.drawingSelected && typeof chart.props.onDrawingSelect === "function") {
          chart.props.onDrawingSelect(null);
        }
      }
      click(e);
    };
    const move = chart.handlePointerMove;
    chart.handlePointerMove = (e) => {
      move(e);
      if (chart.toolsOn() && DRAWING_KINDS.includes(chart.props.tool)) {
        chart._toolHover = e.offsetX <= chart.width && e.offsetY <= chart.height ? chart.toolPoint(e.offsetX, e.offsetY) : null;
        chart.updateTools();
      }
    };
    const leave = chart.handlePointerLeave;
    chart.handlePointerLeave = (e) => {
      leave(e);
      if (chart._toolHover) {
        chart._toolHover = null;
        chart.updateTools();
      }
    };
  },
});
