/* THE CHART'S AXES — a price scale down the right, time along the foot
 * (29 Sep 2026, the chart plan's Phase 1: docs/internal/research/
 * chart-plan-2026-09-29.md).
 *
 * The chart ran edge to edge with no scale: a price could be read only by
 * hovering, and a date only on the grid. A venue's chart reads without the
 * pointer, and that is what this adds — and nothing else about the chart
 * moves to make room for it.
 *
 * **How it makes room.** The plot is the SVG *less* a gutter on the right
 * and a strip along the foot, and `chart.width` / `chart.height` are the
 * plot's. Every drawing in `chart.js` and `chart-board.js` already works in
 * those two numbers, so the line, the candles, the board and its squares,
 * the calls and every level simply draw into a slightly smaller box and none
 * of them had to learn about an axis. The pointer's coordinates in the plot
 * are unchanged, since the plot still starts at the SVG's own origin. The
 * axes draw into what is left, in one layer outside the plot's clip.
 *
 * **One set of numbers.** With the grid or the board on, the axis prints the
 * lattice's own levels and the dates the lattice chose (`updateGrid` records
 * them instead of drawing them inside the plot), so a gridline and its label
 * can never disagree — the label is on the axis, level with the line. With
 * neither, it asks d3 for round levels over the drawn range (`axisPriceTicks`,
 * log-aware) and for round instants over the drawn time (`axisTimeTicks`).
 * Under a comparison the scale is the comparison's: percent change, and the
 * three ticks it used to print inside the plot give way to it.
 *
 * **What goes in the gutter, and who wins.** The last price as a tag in the
 * day's direction ink, the price under the pointer as a pill, and the round
 * levels. `placeLabels` arbitrates: the pill is drawn over everything, the
 * tag is placed next, and a tick that would touch either is dropped rather
 * than moved — a tick is only worth printing at its own height.
 *
 * Same idiom as `chart-board.js`: a plain function handed the `LineBase`
 * instance, `Object.assign`ed in its constructor. Pure helpers first, so the
 * tests can reach them without a DOM. Loads before `chart.js`.
 */

const AXIS_FONT = 10;
/* Roboto Mono advances 0.6em, and the axis adds 0.02em of tracking: 6.2px a
   character at 10px — counted, never measured, for the reason
   `lastPriceTag` counts (a text node cannot be measured before it exists). */
const AXIS_CHAR = 6.2;
const AXIS_TAG_PAD = 6;
const AXIS_TIME_H = 20;
const AXIS_MIN_W = 52;
const AXIS_TICK = 4;
/* Price labels at least this far apart, centre to centre — a 10px figure
   with room to breathe; closer and the scale reads as a column of digits. */
const AXIS_PRICE_GAP = 34;
const AXIS_TIME_GAP = 18;
/* Below this the chart is a thumbnail and a scale would take a quarter of it. */
const AXIS_MIN_SVG_W = 280;

/* Round price levels over [lo, hi], about one every 56px. On a log axis d3
   hands back its 1–2–…–9 decades, which `thinAxisLabels` then spaces. */
const axisPriceTicks = (lo, hi, px, log) => {
  if (!(hi > lo) || !(px > 0) || !isFinite(lo) || !isFinite(hi)) return [];
  const count = Math.max(2, Math.floor(px / 56));
  const within = (list) => list.filter((v) => v >= lo && v <= hi && isFinite(v));
  if (log && lo > 0) {
    /* A log scale's ticks are 1–9 × 10ⁿ, so a range inside one of those
       steps (81K–88K) has none at all; there the linear round numbers are
       the honest labels, and a log axis over a narrow range is nearly
       straight anyway. */
    const logTicks = within(scaleLog().domain([lo, hi]).ticks(count));
    if (logTicks.length >= 2) return logTicks;
  }
  return within(scaleLinear().domain([lo, hi]).ticks(count));
};

/* Round instants over [t0, t1] (ms), about one every 110px, with the
   interval they were cut at — the label format follows the interval. */
const axisTimeTicks = (t0, t1, px) => {
  if (!(t1 > t0) || !(px > 0)) return { ticks: [], step: 0 };
  const count = Math.max(2, Math.floor(px / 110));
  const ticks = scaleTime().domain([new Date(t0), new Date(t1)]).ticks(count).map((d) => +d);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : t1 - t0;
  return { ticks, step };
};

/* A time tick's label: the clock under a day, the date under a month, the
   month under a year, the year beyond — and at a boundary the coarser unit
   instead, so a day starts with its date and a year with its number. */
const axisTimeLabel = (t, step) => {
  const d = new Date(t);
  const DAY_MS = 86400000;
  const midnight = d.getHours() === 0 && d.getMinutes() === 0;
  if (step < DAY_MS && !midnight) {
    return localeDate(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }
  if (step < 28 * DAY_MS) {
    if (d.getMonth() === 0 && d.getDate() === 1) return localeDate(d, { year: "numeric" });
    return localeDate(d, { month: "short", day: "numeric" });
  }
  if (step < 360 * DAY_MS) {
    return d.getMonth() === 0 ? localeDate(d, { year: "numeric" }) : localeDate(d, { month: "short" });
  }
  return localeDate(d, { year: "numeric" });
};

/* Keep labels at least `gap` apart along one axis, walking in order — the
   first one wins, the way `updateGrid`'s date pass already works. */
const thinAxisLabels = (items, gap, key) => {
  const out = [];
  let last = -Infinity;
  for (const it of items.slice().sort((a, b) => a[key] - b[key])) {
    if (it[key] - last >= gap) {
      out.push(it);
      last = it[key];
    }
  }
  return out;
};

/* **The lane allocator.** Labels along one edge, each `{ id, y, h, priority,
 * fixed }`: the highest priority is placed nearest its own y, the rest find
 * the nearest free place, and a `fixed` label (a tick, whose only meaning is
 * its height) is dropped rather than moved. Answers `{ id: y | null }`. Pure,
 * so every edge that ever needs arbitrating can use the one rule. */
const placeLabels = (items, lo, hi, gap = 2) => {
  const placed = [];
  const out = {};
  const order = items.slice().sort((a, b) => b.priority - a.priority);
  for (const it of order) {
    const half = it.h / 2;
    const free = (y) =>
      y - half >= lo - 0.01 &&
      y + half <= hi + 0.01 &&
      placed.every((p) => Math.abs(p.y - y) >= (p.h + it.h) / 2 + gap - 0.01);
    const candidates = [it.y];
    if (!it.fixed) {
      for (const p of placed) {
        candidates.push(p.y - (p.h + it.h) / 2 - gap, p.y + (p.h + it.h) / 2 + gap);
      }
      candidates.push(lo + half, hi - half);
    }
    let best = null;
    for (const c of candidates) {
      if (free(c) && (best === null || Math.abs(c - it.y) < Math.abs(best - it.y))) best = c;
    }
    out[it.id] = best;
    if (best !== null) placed.push({ y: best, h: it.h });
  }
  return out;
};

const chartAxes = (chart) => ({
  /* **The labels inside the plot, one lane** (30 Sep 2026, left from Phase
   * 1). Targets, the drawings' pills, the overlays' names, the average's
   * label and the studies' words each kept clear of their own kind and
   * printed over each other's: three targets and a line near the price were
   * one grey smear. Each layer hands over what it drew (`edgeMark`, a list
   * per layer, replaced on every draw, so a label a layer stopped drawing
   * leaves with it), and once a frame the labels that share a stretch of x
   * are run through `placeLabels` — the most urgent nearest its own
   * height. A label is moved by a transform, never by its own y, so the
   * layer that drew it still owns where it wanted to be. Ranks: a target 5,
   * a drawing 4, an overlay's name or the average 2, a study 1. */
  edgeMark: (layer, items) => {
    if (!chart._edgeSets) chart._edgeSets = {};
    chart._edgeSets[layer] = Array.isArray(items) ? items : [];
    if (!chart._edgeRaf) chart._edgeRaf = requestAnimationFrame(chart.layoutEdge);
  },

  layoutEdge: () => {
    chart._edgeRaf = 0;
    const svg = chart.svgRef && chart.svgRef.current;
    if (!svg || !(chart.height > 0)) return;
    const top = svg.getBoundingClientRect().top;
    const items = [];
    const sets = chart._edgeSets || {};
    for (const layer of Object.keys(sets)) {
      for (const it of sets[layer]) {
        const nodes = (it.nodes || []).filter(
          (n) => n && n.isConnected && n.getAttribute("visibility") !== "hidden" && n.getAttribute("opacity") !== "0",
        );
        let l = Infinity;
        let r = -Infinity;
        let t = Infinity;
        let b = -Infinity;
        for (const n of nodes) {
          const bx = n.getBoundingClientRect();
          if (!(bx.width > 0) || !(bx.height > 0)) continue;
          const dy = n.__edgeDy || 0;
          l = Math.min(l, bx.left);
          r = Math.max(r, bx.right);
          t = Math.min(t, bx.top - dy);
          b = Math.max(b, bx.bottom - dy);
        }
        if (r > l) items.push({ nodes, l, r, y: (t + b) / 2 - top, h: b - t, rank: it.rank || 0 });
      }
    }
    const moved = new Set();
    items.sort((a, c) => a.l - c.l);
    let group = [];
    let reach = -Infinity;
    const settle = () => {
      if (group.length > 1) {
        const at = placeLabels(group.map((it, i) => ({ id: i, y: it.y, h: it.h, priority: it.rank })), 0, chart.height, 2);
        group.forEach((it, i) => {
          const dy = at[i] == null ? 0 : at[i] - it.y;
          if (Math.abs(dy) < 0.5) return;
          for (const n of it.nodes) {
            n.setAttribute("transform", `translate(0 ${dy.toFixed(1)})`);
            n.__edgeDy = dy;
            moved.add(n);
          }
        });
      }
      group = [];
    };
    for (const it of items) {
      if (it.l > reach + 4) settle();
      group.push(it);
      reach = group.length === 1 ? it.r : Math.max(reach, it.r);
    }
    settle();
    for (const n of chart._edgeMoved || []) {
      if (!moved.has(n)) {
        n.removeAttribute("transform");
        n.__edgeDy = 0;
      }
    }
    chart._edgeMoved = moved;
  },

  /* Only on the main chart (the portfolio's background chart has none) and
     only where there is room for one. */
  axesOn: () => Boolean(chart.props.axes) && (chart.svgW || 0) >= AXIS_MIN_SVG_W,

  /* The latest price: the series' last point — or, with a window in time
     that ends before it (chart-viewport.js), the whole range's last point,
     which the window hands down as `lastPoint`. */
  axisLastPoint: () => {
    const lp = chart.props.lastPoint;
    if (lp && isFinite(Number(lp.price))) return lp;
    const data = safePrices(chart.props.prices);
    return data.length ? data[data.length - 1] : null;
  },

  /* The last price as the tag will print it — what sizes the gutter. */
  axisLastLabel: () => {
    const lp = chart.axisLastPoint();
    if (!lp) return "";
    const v = Number(lp.price);
    if (!isFinite(v)) return "";
    return chart.props.formatPrice ? String(chart.props.formatPrice(v)) : String(v);
  },

  /* As wide as the widest thing it carries — the last price's tag — rounded
     up to 8px so a price gaining a digit does not nudge the whole plot. */
  axisGutter: () => {
    if (!chart.axesOn()) return 0;
    const label = chart.axisLastLabel() || "00,000.00";
    const w = label.length * AXIS_CHAR + AXIS_TAG_PAD * 2 + 6;
    return Math.max(AXIS_MIN_W, Math.ceil(w / 8) * 8);
  },

  /* The plot is the SVG less the axes. Called wherever the SVG is measured
     and at the top of every redraw, and a no-op unless something changed. */
  layoutPlot: () => {
    /* Never measured: the size is whatever was set, and stays so. Measured
       at nothing (a box with no layout) is a size, and the plot is nothing
       too — left unset, every x on the chart came out NaN. */
    if (chart.svgW === undefined || chart.svgH === undefined) return false;
    const gw = chart.axisGutter();
    const gh = gw ? AXIS_TIME_H : 0;
    const w = Math.max(0, (chart.svgW || 0) - gw);
    const h = Math.max(0, (chart.svgH || 0) - gh);
    const changed = w !== chart.width || h !== chart.height;
    chart.axisW = gw;
    chart.axisH = gh;
    chart.width = w;
    chart.height = h;
    // The reveal's own end sets the clip once it lands (see componentDidMount)
    if (changed && chart.clipRect && !chart._revealing) {
      chart.clipRect.attr("width", w).attr("height", h);
    }
    return changed;
  },

  /* The inverse of the drawn time mapping, whatever is drawn: the board's
     own scale, the comparison's, or the line's straight line between its
     first and last points (the rule `updateMacroEvents` places instants by). */
  axisTimeMap: () => {
    if (chart.timeToX && chart.props.predict) {
      const s = chart.timeToX;
      return { toX: (t) => s(new Date(t)), toT: (x) => +s.invert(x) };
    }
    const pts = chart.compareScaled ? chart.compareScaled.a : null;
    if (pts && pts.length > 1) {
      const a = pts[0];
      const b = pts[pts.length - 1];
      if (!(b.at > a.at) || !(b.time > a.time)) return null;
      const k = (b.time - a.time) / (b.at - a.at);
      return { toX: (t) => a.time + (t - a.at) * k, toT: (x) => a.at + (x - a.time) / k };
    }
    /* Candles sit in evenly spaced slots, not on the line's points, so their
       dates come from the bars: first and last slot centre, first and last
       bar's own time. */
    const sc = chart.candleScale;
    const cb = chart.candleBars;
    if (chart.props.showCandles && sc && cb && sc.bars.length > 1 && cb.length === sc.bars.length) {
      const xa = sc.bars[0].x;
      const xb = sc.bars[sc.bars.length - 1].x;
      const ta = +new Date(cb[0].time);
      const tb = +new Date(cb[cb.length - 1].time);
      if (tb > ta && xb > xa) {
        const k = (xb - xa) / (tb - ta);
        return { toX: (t) => xa + (t - ta) * k, toT: (x) => ta + (x - xa) / k };
      }
    }
    const data = safePrices(chart.props.prices);
    const scaled = chart.scaled;
    if (!scaled || scaled.length < 2 || data.length < 2) return null;
    const t0 = +data[0].time;
    const t1 = +data[data.length - 1].time;
    const x0 = scaled[0].time;
    const x1 = scaled[scaled.length - 1].time;
    if (!(t1 > t0) || !(x1 > x0)) return null;
    const k = (x1 - x0) / (t1 - t0);
    return { toX: (t) => x0 + (t - t0) * k, toT: (x) => t0 + (x - x0) / k };
  },

  /* The price (or, comparing, the percent) at a height in the plot. */
  axisValueAt: (y) => {
    const c = chart.compareScaled;
    if (c) {
      const top = PADDING;
      const bottom = chart.height - PADDING;
      if (!(bottom > top)) return null;
      return c.low + ((bottom - y) / (bottom - top)) * (c.high - c.low);
    }
    return chart.priceAtY(y);
  },

  /* The drawn range's bounds and the y of any value on it. */
  axisValueRange: () => {
    const c = chart.compareScaled;
    const top = c ? PADDING : chart.plotPadY();
    const bottom = chart.height - top;
    if (c) {
      const toY = (v) => bottom - ((v - c.low) / (c.high - c.low)) * (bottom - top);
      return { lo: c.low, hi: c.high, toY, percent: true };
    }
    // Candles: their own band, above the volume pane (`candleMap`)
    const candles = chart.candleMap ? chart.candleMap() : null;
    if (candles) return { lo: candles.min, hi: candles.max, toY: candles.toY, percent: false, bottom: candles.bottom };
    const lo = chart.priceAtY(bottom - 0.5);
    const hi = chart.priceAtY(top + 0.5);
    if (lo == null || hi == null) return null;
    return { lo, hi, toY: (v) => chart.levelY(v), percent: false };
  },

  /* One group per kind, in paint order — hairlines, then tags, then text.
     The pools grow on demand, so a node's place in one shared group was the
     order it happened to be made in: a tag made after a label had been
     pooled painted over it, and the pointer's price went blank under its
     own pill. */
  axisGroup: (kind) => {
    const layer = chart.axisRef.current;
    const pools = chart._axis;
    if (!pools.groups) pools.groups = {};
    let g = pools.groups[kind];
    if (!g || g.parentNode !== layer) {
      g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-axis-layer", kind);
      const order = ["lines", "rects", "texts"];
      const after = order.slice(order.indexOf(kind) + 1).map((k) => pools.groups[k]).find((n) => n && n.parentNode === layer);
      layer.insertBefore(g, after || null);
      pools.groups[kind] = g;
    }
    return g;
  },

  axisText: (x, y, text, anchor, ink, opacity) => {
    const { font } = chart.props.theme;
    const el = chart.poolNode(chart._axis.texts, "text", chart.axisGroup("texts"));
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.setAttribute("text-anchor", anchor);
    el.setAttribute("fill", ink);
    el.setAttribute("font-size", String(AXIS_FONT));
    el.setAttribute("font-family", font.primary);
    el.setAttribute("font-weight", "400");
    el.setAttribute("letter-spacing", "0.02em");
    el.setAttribute("opacity", opacity == null ? "1" : String(opacity));
    el.removeAttribute("data-axis-tick");
    el.removeAttribute("data-axis-time");
    el.removeAttribute("data-axis-last");
    if (el.textContent !== text) el.textContent = text;
    return el;
  },

  axisLine: (x1, y1, x2, y2, ink, opacity) => {
    const el = chart.poolNode(chart._axis.lines, "line", chart.axisGroup("lines"));
    el.setAttribute("x1", x1);
    el.setAttribute("y1", y1);
    el.setAttribute("x2", x2);
    el.setAttribute("y2", y2);
    el.setAttribute("stroke", ink);
    el.setAttribute("stroke-width", "1");
    el.setAttribute("stroke-dasharray", "none");
    el.setAttribute("opacity", String(opacity == null ? 1 : opacity));
    el.removeAttribute("data-axis-last");
    return el;
  },

  axisRect: (x, y, w, h, fill) => {
    const el = chart.poolNode(chart._axis.rects, "rect", chart.axisGroup("rects"));
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.setAttribute("width", Math.max(0, w));
    el.setAttribute("height", Math.max(0, h));
    el.setAttribute("rx", "2");
    el.setAttribute("fill", fill);
    el.removeAttribute("data-axis-last");
    return el;
  },

  /* The whole axis, redrawn wherever the plot's mappings change. Pooled like
     everything else on this chart; clearing is not conditional. */
  updateAxes: () => {
    const layer = chart.axisRef.current;
    if (!layer || !chart._axis) return;
    const pools = chart._axis;
    pools.lines.at = 0;
    pools.texts.at = 0;
    pools.rects.at = 0;
    const done = () => {
      chart.hideRest(pools.lines);
      chart.hideRest(pools.texts);
      chart.hideRest(pools.rects);
    };
    const W = chart.width;
    const H = chart.height;
    if (!chart.axesOn() || !(W > 0) || !(H > 0)) {
      done();
      return;
    }
    const { color } = chart.props.theme;
    const gx = W + 1;
    const gw = chart.axisW - 2;

    // The two edges of the plot, as the frame's hairlines
    chart.axisLine(W + 0.5, 0, W + 0.5, H, color.border, 1);
    chart.axisLine(0, H + 0.5, W, H + 0.5, color.border, 1);

    /* ── The gutter's tags first, so the ticks know where not to print ── */
    const tags = [];
    const range = chart.axisValueRange();
    const last = !chart.props.predict && !chart.compareScaled ? chart.axisLastLabel() : "";
    if (last && range) {
      const lp = chart.axisLastPoint();
      const v = Number(lp.price);
      /* A window that stops short of now is not showing the last bar, so
         the tag is placed by the price, not by the rightmost candle. */
      const bars = chart.candleScale && chart.props.showCandles && chart.props.atNow !== false ? chart.candleScale.bars : null;
      const bar = bars && bars.length ? bars[bars.length - 1] : null;
      const y = bar && isFinite(bar.yClose) ? bar.yClose : range.toY(v);
      if (y != null && isFinite(y) && y >= 0 && y <= H) {
        const up = typeof lp.up === "boolean" ? lp.up : bar ? bar.up : isTrendUp(chart.props.prices);
        tags.push({ id: "last", y, h: 16, priority: 3, text: last, ink: up ? color.chartLineGreen : color.chartLineRed });
      }
    }
    const pointer = chart._axisPointerY;
    const pointerX = chart._axisPointerX;
    const slots = placeLabels(
      [
        ...(pointer != null ? [{ id: "pointer", y: pointer, h: 16, priority: 9, fixed: true }] : []),
        ...tags,
      ],
      0,
      H,
    );

    /* ── The price levels ── */
    const gridLevels = chart._axisGridPrice && chart._axisGridPrice.length ? chart._axisGridPrice : null;
    let levels = [];
    let ink = 1;
    if (gridLevels) {
      levels = gridLevels.map((l) => ({ y: l.y, text: l.text }));
      ink = chart._labelInk === undefined ? 1 : chart._labelInk;
    } else if (range) {
      const ticks = axisPriceTicks(Math.min(range.lo, range.hi), Math.max(range.lo, range.hi), H, !range.percent && chart.logAxis());
      levels = ticks.map((v, i) => {
        const step = Math.abs((ticks[i + 1] !== undefined ? ticks[i + 1] : ticks[i - 1]) - v) || Math.abs(v) / 100 || 1;
        const text = range.percent
          ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0)}%`
          : formatAxisPrice(v, step, chart.props.currencySymbol);
        return { y: range.toY(v), text };
      });
    }
    const taken = Object.entries(slots)
      .filter(([, y]) => y != null)
      .map(([id, y]) => ({ y, h: 16 + 4 }));
    const clear = (y) => y >= 6 && y <= H - 4 && taken.every((t) => Math.abs(t.y - y) >= t.h / 2 + 5);
    const floor = range && range.bottom != null ? range.bottom : H;
    const shown = thinAxisLabels(levels.filter((l) => l.y != null && isFinite(l.y) && l.y <= floor && clear(l.y)), AXIS_PRICE_GAP, "y");
    for (const l of shown) {
      chart.axisLine(W, l.y, W + AXIS_TICK, l.y, color.border, 1);
      const el = chart.axisText(W + AXIS_TICK + 4, l.y + 3.5, l.text, "start", color.textSecondary, ink >= 0.999 ? 1 : ink.toFixed(3));
      el.setAttribute("data-axis-tick", l.text);
    }

    /* ── The last price: a hairline across the plot and its tag ── */
    for (const t of tags) {
      const y = slots[t.id];
      if (y == null) continue;
      const hair = chart.axisLine(0, Math.round(t.y) + 0.5, W, Math.round(t.y) + 0.5, t.ink, 0.45);
      hair.setAttribute("stroke-dasharray", "1 3");
      hair.setAttribute("data-axis-last", "line");
      chart.axisRect(gx, Math.round(y - t.h / 2), gw, t.h, t.ink).setAttribute("data-axis-last", "tag");
      const el = chart.axisText(gx + gw / 2, Math.round(y) + 3.5, t.text, "middle", color.bg, 1);
      el.setAttribute("font-weight", "600");
      el.setAttribute("data-axis-last", t.text);
    }

    /* ── Time along the foot ── */
    const map = chart.axisTimeMap();
    // The pointer's time tag, measured first so no label prints under it
    let pointerTime = null;
    if (pointer != null && pointerX != null && map) {
      const t = map.toT(pointerX);
      if (isFinite(t)) {
        const text = crosshairDate(new Date(t), chart.props.period);
        const w = text.length * AXIS_CHAR + AXIS_TAG_PAD * 2;
        pointerTime = { text, w, x: Math.max(0, Math.min(W - w, pointerX - w / 2)) };
      }
    }
    const gridTimes = chart._axisGridTime && chart._axisGridTime.length ? chart._axisGridTime : null;
    let times = [];
    if (gridTimes) {
      times = gridTimes.map((t) => ({ x: t.x, text: t.text, start: true }));
    } else if (map) {
      const tLeft = map.toT(0);
      const tRight = map.toT(W);
      const { ticks, step } = axisTimeTicks(tLeft, tRight, W);
      times = ticks.map((t) => ({ x: map.toX(t), text: axisTimeLabel(t, step), start: false }));
    }
    let lastRight = -Infinity;
    for (const t of times.sort((a, b) => a.x - b.x)) {
      if (!isFinite(t.x) || t.x < 0 || t.x > W) continue;
      const w = t.text.length * AXIS_CHAR;
      const left = t.start ? t.x + 3 : t.x - w / 2;
      if (left < 2 || left + w > W - 2 || left < lastRight + AXIS_TIME_GAP) continue;
      if (pointerTime && left < pointerTime.x + pointerTime.w + 4 && left + w > pointerTime.x - 4) continue;
      lastRight = left + w;
      chart.axisLine(t.x, H, t.x, H + AXIS_TICK, color.border, 1);
      const el = chart.axisText(t.start ? t.x + 3 : t.x, H + 14, t.text, t.start ? "start" : "middle", color.textSecondary, gridTimes ? (ink >= 0.999 ? 1 : ink.toFixed(3)) : 1);
      el.setAttribute("data-axis-time", t.text);
    }

    /* ── The pointer's own tags, over everything ── */
    if (pointer != null && pointerX != null) {
      const v = chart.axisValueAt(pointer);
      if (v != null && isFinite(v)) {
        const text = chart.compareScaled
          ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`
          : chart.props.formatPrice
            ? String(chart.props.formatPrice(v))
            : formatAxisPrice(v, Math.abs(v) / 10000 || 0.0001, chart.props.currencySymbol);
        chart.axisRect(gx, Math.round(pointer - 8), gw, 16, color.text).setAttribute("data-axis-last", "pointer");
        chart.axisText(gx + gw / 2, Math.round(pointer) + 3.5, text, "middle", color.bg, 1).setAttribute("data-axis-last", "pointer-price");
      }
      if (pointerTime) {
        const { x, w, text } = pointerTime;
        chart.axisRect(x, H + 2, w, AXIS_TIME_H - 4, color.text).setAttribute("data-axis-last", "pointer");
        chart.axisText(x + w / 2, H + 14, text, "middle", color.bg, 1).setAttribute("data-axis-last", "pointer-time");
      }
    }
    done();
  },

  /* Where the pointer is, for the axis tags — read off the crosshair's own
     numbers, and let go of with them. Off the lattice the crosshair is
     snapped to a point (a bar's close, a line's point), so the tags sit on
     that point and print its price: a tag at the bare pointer height named
     a price nothing on the chart was drawn at, beside a readout naming
     another. On the grid and the board the pointer's height is the
     question, so the tags follow it. */
  setAxisPointer: (x, y) => {
    const inside = x != null && y != null && x >= 0 && y >= 0 && x <= chart.width && y <= chart.height;
    const nx = inside ? x : null;
    const ny = inside ? y : null;
    if (nx === chart._axisPointerX && ny === chart._axisPointerY) return;
    chart._axisPointerX = nx;
    chart._axisPointerY = ny;
    chart.updateAxes();
  },

  /* Wrap the few entry points the axes ride on, so their bodies stay as
     they were: the crosshair draws and clears the pointer's tags, the
     pointer outside the plot is the pointer off the chart, and a press on
     the axes is a press on nothing. */
  wireAxes: () => {
    const draw = chart.drawCrosshair;
    chart.drawCrosshair = () => {
      draw();
      if (!chart.axesOn()) return;
      const dot = chart.hoverDotRef.current;
      const snapped = !chart.props.predict && !chart.props.grid && chart.hoverIndex >= 0 && dot;
      if (snapped) chart.setAxisPointer(Number(dot.getAttribute("cx")), Number(dot.getAttribute("cy")));
      else chart.setAxisPointer(chart.hoverX, chart.hoverY);
    };
    const clear = chart.clearHover;
    chart.clearHover = () => {
      clear();
      if (chart.axesOn()) chart.setAxisPointer(null, null);
    };
    const move = chart.handlePointerMove;
    chart.handlePointerMove = (e) => {
      const outside = chart.axesOn() && (e.offsetX > chart.width || e.offsetY > chart.height);
      if (outside && !chart.nowDrag && !chart.callDrag) {
        if (chart.hoverX !== -1 || chart._axisPointerY != null) chart.clearHover();
        return;
      }
      move(e);
    };
    const click = chart.handleChartClick;
    chart.handleChartClick = (e) => {
      if (chart.axesOn() && (e.offsetX > chart.width || e.offsetY > chart.height)) return;
      click(e);
    };
  },
});
