/* LINE COMPONENT */
const LINE_DUMMY = Array(2)
  .fill()
  .map((_, i) => ({ price: 0, time: new Date(2010 + i) }));

const PADDING = 24;

// The share of the chart's width the future strip may take when calls are on
const MAX_FUTURE_FRACTION = 0.45;
const TRANSITION_DURATION = 300;
const REVEAL_DURATION = 600;

const safePrices = (prices) =>
  Array.isArray(prices) && prices.length > 1 ? prices : LINE_DUMMY;

// Closes a line path down to the chart baseline to make a fillable area.
const buildAreaD = (lineD, scaled, height) => {
  if (!scaled || scaled.length < 2) return "";
  const x0 = scaled[0].time;
  const xN = scaled[scaled.length - 1].time;
  return `${lineD}L${xN},${height}L${x0},${height}Z`;
};

// Trend direction of a price series (last vs first), used to tint the area.
const isTrendUp = (prices) => {
  const p = safePrices(prices);
  return Number(p[p.length - 1].price) >= Number(p[0].price);
};

/* The live price marker breathes so it reads as a thing that is still
 * arriving, rather than one more dot on a static picture. Opacity and scale
 * only — nothing that moves it off the point it is marking. */
const draftGrow = keyframes`
  0%   { transform: scale(0.08); opacity: 0.55; }
  65%  { transform: scale(1);    opacity: 0.22; }
  100% { transform: scale(1);    opacity: 0; }
`;

const liveDotPulse = keyframes`
  0%, 100% { opacity: 1;    r: 3.5; }
  50%      { opacity: 0.45; r: 5;   }
`;

const Svg = styled.svg`
  /* The draft square arming itself: a green square growing from the centre
     to the walls of the box it is inside. It repeats because the box is
     still waiting for something — a fill that played once and stopped would
     just look like a filled box. transform-box:fill-box puts the origin at
     the middle of the rect rather than the middle of the SVG, which is the
     difference between growing in place and flying across the chart. */
  .pt-draft-fill {
    transform-box: fill-box;
    transform-origin: center;
    animation: ${draftGrow} 1.5s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }

  .pt-live-dot {
    animation: ${liveDotPulse} 1.8s ease-in-out infinite;
  }

  height: 100%;
  width: 100%;
  /* Only the interactive (main-view) chart takes pointer events; the
     portfolio's background chart stays click-through. */
  pointer-events: ${({ interactive }) => (interactive ? "auto" : "none")};
  flex: 1 0 ${({ theme }) => theme.scale * 40}rem;
  touch-action: pan-y;
`;

/* ── crosshair ─────────────────────────────────────────────────────────────
 * Reads the price/date under the pointer. Everything here is imperative:
 * the hover never touches React state (a setState per mousemove would
 * re-render the whole page), the nearest point is found by binary search
 * over the already-scaled pixel positions, and DOM writes are batched into
 * one rAF per frame. Cost per move: one binary search + a handful of
 * attribute writes.
 */
const CROSSHAIR_LABEL_PAD = 8;
const CROSSHAIR_LABEL_GAP = 10;
const CROSSHAIR_ROW_H = 13; // px between readout rows
const CROSSHAIR_COL_GAP = 14; // px between a row's label and its value
// Rows shown when candle data is available for the hovered point
/* Row slots in the crosshair readout. The array is a *pool* — how many
 * <text> pairs exist — not a fixed set of labels: comparison mode names two
 * coins in the same slots, and with calls on the last two carry the square
 * the pointer is standing in. Seven because OHLC+volume (5) and the square's
 * two lines can be on screen together. */
const CROSSHAIR_ROWS = ["Open", "High", "Low", "Close", "Volume", "Band", "Span"];

// Comparison-mode direct labels: how far above its line a label sits, and how
// far apart two of them must stay when the coins finish level
const COMPARE_LABEL_LIFT = 8;
const COMPARE_LABEL_MIN_GAP = 14;

// Compact volume: 1.57K, 42.4M — full digits would dominate the readout
const formatVolume = (value) => {
  const v = Number(value);
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(abs >= 1 ? 2 : 4);
};

// Nearest index to pixel x in an ascending list of scaled points
const nearestIndex = (scaled, x) => {
  let lo = 0;
  let hi = scaled.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (scaled[mid].time < x) lo = mid;
    else hi = mid;
  }
  return x - scaled[lo].time <= scaled[hi].time - x ? lo : hi;
};

const crosshairDate = (time, period) => {
  const d = time instanceof Date ? time : new Date(time);
  if (isNaN(d)) return "";
  // Intraday ranges need the clock; longer ones read better as plain dates
  const withTime = period === "hour" || period === "day";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: period === "year" || period === "all" ? "numeric" : undefined,
    hour: withTime ? "2-digit" : undefined,
    minute: withTime ? "2-digit" : undefined,
  });
};

class LineBase extends PureComponent {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "pathRef", createRef());
    _defineProperty(this, "areaRef", createRef());
    _defineProperty(this, "svgRef", createRef());
    _defineProperty(this, "clipRectRef", createRef());

    /* Two candle layers, cross-dissolved. One layer faded out and back in
     * would pass through zero opacity, and what shows through the gap is the
     * empty chart — the transition read as a blackout rather than a change
     * of range. Drawing the new set into the spare layer and fading the two
     * past each other keeps candles on screen the whole way. */
    this.candleLayers = [
      {
        group: createRef(),
        up: createRef(),
        down: createRef(),
        volUp: createRef(),
        volDown: createRef(),
      },
      {
        group: createRef(),
        up: createRef(),
        down: createRef(),
        volUp: createRef(),
        volDown: createRef(),
      },
    ];
    this.activeLayer = 0;
    _defineProperty(this, "lineGroupRef", createRef());

    /* Reference level drawn across the chart — the portfolio's cost basis.
     * Positioned imperatively like the comparison zero line, so a redraw
     * moves it without React touching the SVG. */
    _defineProperty(this, "refLineRef", createRef());
    _defineProperty(this, "refLabelRef", createRef());

    /* Grid layer. Lines, their axis labels and the cell under the pointer are
     * all written imperatively into one group, the same way every other
     * overlay here works — React renders the container once and never has to
     * diff a hundred short-lived <line> nodes on every resize. */
    _defineProperty(this, "gridRef", createRef());
    _defineProperty(this, "gridCellRef", createRef());
    _defineProperty(this, "cellHintRef", createRef());
    _defineProperty(this, "liveDotRef", createRef());
    _defineProperty(this, "callLayerRef", createRef());
    _defineProperty(this, "burstRef", createRef());

    // Comparison overlay: both coins as percent change on one shared axis
    _defineProperty(this, "compareGroupRef", createRef());
    _defineProperty(this, "compareZeroRef", createRef());
    _defineProperty(this, "comparePathARef", createRef());
    _defineProperty(this, "comparePathBRef", createRef());
    _defineProperty(this, "compareLabelARef", createRef());
    _defineProperty(this, "compareLabelBRef", createRef());
    this.compareScaled = null;
    this.compareD = { a: null, b: null };

    // Crosshair nodes — written to directly, never through React
    _defineProperty(this, "hoverRef", createRef());
    _defineProperty(this, "hoverLineRef", createRef());
    _defineProperty(this, "hoverDotRef", createRef());
    // Second dot, comparison mode only — one guide has to mark both lines
    _defineProperty(this, "hoverDotBRef", createRef());
    _defineProperty(this, "hoverBoxRef", createRef());
    _defineProperty(this, "hoverPriceRef", createRef());
    _defineProperty(this, "hoverDateRef", createRef());
    // One label + one value node per OHLC row, written to imperatively
    this.rowLabelRefs = CROSSHAIR_ROWS.map(() => createRef());
    this.rowValueRefs = CROSSHAIR_ROWS.map(() => createRef());
    this._askedForOhlc = false;
    this.scaled = null; // pixel-space points, index-aligned with props.prices
    this.hoverRaf = 0;
    this.hoverX = 0;
    this.hoverY = 0;
    this.hoverIndex = -1;
    this.gridX = [];              // vertical line positions, px
    this.gridY = [];              // horizontal line positions, px

    // Unique ids so the gradient/clip defs never collide in the DOM
    const uid = Math.random().toString(36).slice(2, 9);
    this.gradId = "ptArea_" + uid;
    this.clipId = "ptReveal_" + uid;

    // Debounced resize handler (150ms delay)
    _defineProperty(
      this,
      "handleResize",
      debounce(() => {
        if (this.svgRef && this.svgRef.current) {
          const { height, width } = this.svgRef.current.getBoundingClientRect();
          this.height = height;
          this.width = width;
          // Keep the reveal clip covering the full chart after a resize
          if (this.clipRect) {
            this.clipRect.attr("width", width).attr("height", height);
          }
          this.updatePath();
          this.updateCandles(false);
          this.updateComparison(false);
        }
      }, 150),
    );

    /* Pointer handling: record the position, do the work once per frame */
    _defineProperty(this, "handlePointerMove", (e) => {
      this.hoverX = e.offsetX;
      this.hoverY = e.offsetY;      // the grid needs both axes
      /* Candles are only worth fetching once someone actually reads the
       * chart — most tabs are opened, glanced at and closed. And not at all
       * while calls are on and the chart is a line: the readout shows the
       * square, so the OHLC would be a request for something never drawn. */
      const needsCandles = !this.props.predict || this.props.showCandles;
      if (needsCandles && !this._askedForOhlc && this.props.onNeedOhlc) {
        this._askedForOhlc = true;
        this.props.onNeedOhlc();
      }
      if (this.hoverRaf) return;
      this.hoverRaf = requestAnimationFrame(this.drawCrosshair);
    });

    _defineProperty(this, "handlePointerLeave", () => {
      if (this.hoverRaf) {
        cancelAnimationFrame(this.hoverRaf);
        this.hoverRaf = 0;
      }
      this.hoverIndex = -1;
      if (this.hoverRef.current) {
        this.hoverRef.current.setAttribute("visibility", "hidden");
      }
      if (this.gridCellRef.current) {
        this.gridCellRef.current.setAttribute("visibility", "hidden");
      }
      // Belt and braces: hide the rows outright as well, so no future edit
      // that marks a child "visible" can resurrect the readout.
      if (this.hoverDotBRef.current) {
        this.hoverDotBRef.current.setAttribute("visibility", "hidden");
      }
      for (let r = 0; r < CROSSHAIR_ROWS.length; r++) {
        const labelNode = this.rowLabelRefs[r].current;
        const valueNode = this.rowValueRefs[r].current;
        if (labelNode) labelNode.setAttribute("visibility", "hidden");
        if (valueNode) valueNode.setAttribute("visibility", "hidden");
      }
    });

    /* Which candle the pointer is over. Bars are evenly spaced, so the slot
     * is arithmetic — and using the slot rather than the nearest centre
     * means the whole bar is hoverable, not just the half nearest its axis. */
    _defineProperty(this, "candleIndexAt", (x) => {
      const bars = this.candleScale && this.candleScale.bars;
      if (!bars || !bars.length) return -1;
      const step = (this.width - PADDING * 2) / bars.length;
      if (!(step > 0)) return -1;
      const i = Math.floor((x - PADDING) / step);
      return Math.min(Math.max(i, 0), bars.length - 1);
    });

    /* The live price, pulsing on the last point it was drawn at.
     * Moved with a transition rather than jumped, so a refresh reads as the
     * price moving rather than the chart being replaced. */
    _defineProperty(this, "updateLiveDot", () => {
      const dot = this.liveDotRef.current;
      if (!dot) return;
      const scaled = this.scaled;
      if (!this.props.predict || !scaled || !scaled.length) {
        dot.setAttribute("visibility", "hidden");
        return;
      }
      const last = scaled[scaled.length - 1];
      const first = dot.getAttribute("visibility") === "hidden";
      dot.setAttribute("visibility", "visible");
      if (first) {
        dot.setAttribute("cx", last.time);
        dot.setAttribute("cy", last.price);
        return;
      }
      select(dot)
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(easeCubicOut)
        .attr("cx", last.time)
        .attr("cy", last.price);
    });

    /* Open calls, drawn as the boxes they are. */
    _defineProperty(this, "updateCalls", () => {
      const layer = this.callLayerRef.current;
      if (!layer) return;
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      if (!this.props.predict || !this.timeToX || !this.priceToY) return;

      const calls = Array.isArray(this.props.calls) ? this.props.calls : [];
      const { color, font } = this.props.theme;
      const ns = "http://www.w3.org/2000/svg";
      const tint = isTrendUp(this.props.prices)
        ? color.chartLineGreen
        : color.chartLineRed;

      const settled = Array.isArray(this.props.settledCalls)
        ? this.props.settledCalls
        : [];
      /* Open calls and settled ones are drawn by the same code: a settled
       * call is the same box with the answer in it. Keeping them on the chart
       * is the point — a prediction you can no longer see is a prediction you
       * cannot learn from. They leave on their own when the target scrolls
       * off the start of the range. */
      calls
        .concat(settled)
        .filter(
          (c) =>
            c.coin === this.props.coin &&
            c.currency === this.props.currency &&
            c.period === this.props.period,
        )
        .forEach((c) => {
          const x1 = this.timeToX(new Date(c.target - c.span));
          const x2 = this.timeToX(new Date(c.target));
          const y1 = this.priceToY(c.hi);
          const y2 = this.priceToY(c.lo);
          if (![x1, x2, y1, y2].every(isFinite)) return;

          const hit = c.result === "hit";
          const miss = c.result === "miss";
          const colour = hit
            ? color.chartLineGreen
            : miss
              ? color.chartLineRed
              : tint;

          const box = document.createElementNS(ns, "rect");
          box.setAttribute("x", Math.min(x1, x2));
          box.setAttribute("y", Math.min(y1, y2));
          box.setAttribute("width", Math.abs(x2 - x1));
          box.setAttribute("height", Math.abs(y2 - y1));
          box.setAttribute("fill", colour);
          box.setAttribute("fill-opacity", hit ? "0.14" : miss ? "0.05" : "0.07");
          box.setAttribute("stroke", colour);
          box.setAttribute("stroke-opacity", miss ? "0.45" : "0.8");
          box.setAttribute("stroke-width", "1");
          // Settled ones stop being dashed: the question is closed
          if (!c.result) box.setAttribute("stroke-dasharray", "3 3");
          layer.appendChild(box);

          /* The tag sits *above* its box, not inside it. A call keeps the
           * width it had when it was made, so an old one can be narrower
           * than today's squares — and inside the box the label was clipped
           * by a border it had no reason to be inside. Above, it is never
           * cut, and it still reads as belonging to the box under it. */
          const tag = document.createElementNS(ns, "text");
          const boxTop = Math.min(y1, y2);
          tag.setAttribute("x", Math.min(x1, x2));
          tag.setAttribute("y", boxTop > 12 ? boxTop - 4 : Math.max(y1, y2) + 11);
          tag.setAttribute("fill", colour);
          tag.setAttribute("fill-opacity", miss ? "0.75" : "1");
          tag.setAttribute("font-size", "9");
          tag.setAttribute("font-family", font.primary);
          tag.setAttribute("letter-spacing", "0.08em");
          tag.textContent = hit ? "CALLED IT" : miss ? "MISSED" : "CALLED";
          layer.appendChild(tag);
        });

      // The draft: drawn like a call that has not been made yet, and asking
      // for the second click in as many words
      const draft = this.draftCall;
      if (draft) {
        const x1 = this.timeToX(new Date(draft.target - draft.span));
        const x2 = this.timeToX(new Date(draft.target));
        const y1 = this.priceToY(draft.hi);
        const y2 = this.priceToY(draft.lo);
        if ([x1, x2, y1, y2].every(isFinite)) {
          const bx = Math.min(x1, x2);
          const by = Math.min(y1, y2);
          const bw = Math.abs(x2 - x1);
          const bh = Math.abs(y2 - y1);

          const box = document.createElementNS(ns, "rect");
          box.setAttribute("x", bx);
          box.setAttribute("y", by);
          box.setAttribute("width", bw);
          box.setAttribute("height", bh);
          box.setAttribute("fill", "none");
          box.setAttribute("stroke", color.text);
          box.setAttribute("stroke-opacity", "0.85");
          box.setAttribute("stroke-width", "1.5");
          layer.appendChild(box);

          // The square inside it, growing out to the walls
          const fill = document.createElementNS(ns, "rect");
          fill.setAttribute("class", "pt-draft-fill");
          fill.setAttribute("x", bx);
          fill.setAttribute("y", by);
          fill.setAttribute("width", bw);
          fill.setAttribute("height", bh);
          fill.setAttribute("fill", color.chartLineGreen);
          layer.appendChild(fill);

          /* Inside the box, not above it. The question belongs to the square
           * it is asking about, and a tag floating over the top edge reads as
           * a name for it rather than as something to answer. Dropped when
           * the box is too small to hold the word without spilling out of
           * the thing it is labelling. */
          if (bw > 44 && bh > 16) {
            const tag = document.createElementNS(ns, "text");
            tag.setAttribute("x", bx + bw / 2);
            tag.setAttribute("y", by + bh / 2);
            tag.setAttribute("text-anchor", "middle");
            tag.setAttribute("dominant-baseline", "central");
            tag.setAttribute("fill", color.text);
            tag.setAttribute("font-size", "9");
            tag.setAttribute("font-family", font.primary);
            tag.setAttribute("letter-spacing", "0.14em");
            tag.textContent = "LOCK?";
            layer.appendChild(tag);
          }
        }
      }
    });

    /* The one celebration.
     *
     * Thin radiating strokes in the chart's own colour — the house has no
     * confetti and no emoji, and a burst that looked like a different product
     * would cheapen the only moment the feature has.
     *
     * It fires on the **box that was called**, not on the live price. That
     * was the first version and it was celebrating in the wrong place: the
     * thing that came true is the square you drew, and a flash somewhere
     * else reads as an unrelated animation.
     *
     * Three things happen together, each on its own timing, because one pop
     * is an event and a short sequence is an occasion: the box swells and its
     * outline goes to full strength, two rings travel out of it, and a
     * staggered spray of rays fades as it goes.
     */
    _defineProperty(this, "burst", (cx, cy, box) => {
      const layer = this.burstRef.current;
      if (!layer) return;
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      const { color } = this.props.theme;
      const tint = color.chartLineGreen;
      const ns = "http://www.w3.org/2000/svg";

      // 1. The called box itself reacts
      if (box) {
        const flash = document.createElementNS(ns, "rect");
        flash.setAttribute("x", box.x);
        flash.setAttribute("y", box.y);
        flash.setAttribute("width", box.w);
        flash.setAttribute("height", box.h);
        flash.setAttribute("fill", tint);
        flash.setAttribute("stroke", tint);
        flash.setAttribute("stroke-width", "1.5");
        flash.setAttribute("rx", "2");
        layer.appendChild(flash);
        const grow = Math.min(10, Math.min(box.w, box.h) * 0.14);
        select(flash)
          .attr("fill-opacity", 0.42)
          .attr("stroke-opacity", 1)
          .transition()
          .duration(180)
          .ease(easeCubicOut)
          .attr("x", box.x - grow)
          .attr("y", box.y - grow)
          .attr("width", box.w + grow * 2)
          .attr("height", box.h + grow * 2)
          .transition()
          .duration(760)
          .attr("x", box.x)
          .attr("y", box.y)
          .attr("width", box.w)
          .attr("height", box.h)
          .attr("fill-opacity", 0)
          .attr("stroke-opacity", 0);
      }

      // 2. Two rings, the second chasing the first
      [0, 130].forEach((delay, i) => {
        const ring = document.createElementNS(ns, "circle");
        ring.setAttribute("cx", cx);
        ring.setAttribute("cy", cy);
        ring.setAttribute("r", 5);
        ring.setAttribute("fill", "none");
        ring.setAttribute("stroke", tint);
        ring.setAttribute("stroke-width", i ? 1 : 1.6);
        layer.appendChild(ring);
        select(ring)
          .attr("opacity", 0)
          .transition()
          .delay(delay)
          .duration(0)
          .attr("opacity", i ? 0.55 : 0.9)
          .transition()
          .duration(820 - i * 120)
          .ease(easeCubicOut)
          .attr("r", i ? 44 : 66)
          .attr("opacity", 0);
      });

      // 3. The spray
      const rays = 18;
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + 0.12;
        const near = 7 + (i % 3) * 4;
        const far = near + 24 + (i % 5) * 11;
        const el = document.createElementNS(ns, "line");
        el.setAttribute("x1", cx + Math.cos(a) * near);
        el.setAttribute("y1", cy + Math.sin(a) * near);
        el.setAttribute("x2", cx + Math.cos(a) * (near + 4));
        el.setAttribute("y2", cy + Math.sin(a) * (near + 4));
        el.setAttribute("stroke", tint);
        el.setAttribute("stroke-width", i % 4 ? 1.4 : 2);
        el.setAttribute("stroke-linecap", "round");
        layer.appendChild(el);
        select(el)
          .attr("opacity", 1)
          .transition()
          .delay((i % 5) * 26)
          .duration(430 + (i % 5) * 70)
          .ease(easeCubicOut)
          .attr("x1", cx + Math.cos(a) * far)
          .attr("y1", cy + Math.sin(a) * far)
          .attr("x2", cx + Math.cos(a) * (far + 18))
          .attr("y2", cy + Math.sin(a) * (far + 18))
          .attr("opacity", 0);
      }
    });

    /* Placing a call takes two clicks.
     *
     * A call is a claim, and the chart is a surface people click on for other
     * reasons — one stray click should not commit you to a prediction that
     * then goes on your record. So the first click on a square drafts it and
     * the square asks to be locked; the second locks it. Clicking a different
     * square moves the draft rather than stacking a second one, because a
     * draft is a thought, not a call.
     *
     * The draft lives on the instance rather than in app state: it is a
     * pointer gesture in progress, it never leaves this component, and
     * routing it through React would redraw the chart between two clicks.
     */
    _defineProperty(this, "cellAt", (x, y) => {
      if (!this.props.predict || !this.timeToX || !this.priceToY) return null;
      if (!this.cellPitch || !(x > this.nowX)) return null;

      const pitch = this.cellPitch;
      const col = Math.ceil((x - this.nowX) / pitch);
      const xEnd = this.nowX + col * pitch;
      const span =
        this.timeToX.invert(this.nowX + pitch) - this.timeToX.invert(this.nowX);
      const target = this.timeToX.invert(xEnd).getTime();

      const baseY = this.gridY.length ? this.gridY[0] : PADDING;
      const top = baseY + Math.floor((y - baseY) / pitch) * pitch;
      const hi = this.priceToY.invert(top);
      const lo = this.priceToY.invert(top + pitch);
      if (![hi, lo, target, span].every(isFinite) || !(hi > lo)) return null;
      return { target, span, lo, hi, col };
    });

    _defineProperty(this, "sameCell", (a, b) =>
      Boolean(a && b && a.col === b.col && Math.abs(a.hi - b.hi) < 1e-9),
    );

    _defineProperty(this, "handleChartClick", (e) => {
      if (!this.props.predict || !this.props.onPlaceCall) return;
      const cell = this.cellAt(e.offsetX, e.offsetY);
      if (!cell) {
        // A click anywhere else abandons the draft rather than leaving a
        // half-made call sitting on the chart
        if (this.draftCall) {
          this.draftCall = null;
          this.updateCalls();
        }
        return;
      }
      if (this.sameCell(this.draftCall, cell)) {
        this.draftCall = null;
        this.props.onPlaceCall(cell);
        return;
      }
      this.draftCall = cell;
      this.updateCalls();
      this.drawGridCell();
    });

    /* The cell the pointer is in — always a whole square.
     *
     * It used to be bounded by whatever lines happened to be either side,
     * which meant the strip at the top and bottom of the chart produced a
     * stub rather than a square: the highlight changed shape depending on
     * where you pointed, on a grid whose entire point is that every box is
     * the same. Now it is snapped to the lattice and is exactly one pitch
     * each way, wherever it lands.
     *
     * Where a square hangs off the top or bottom of the chart it is not
     * clipped into a stub either — it keeps its shape and loses opacity in
     * proportion to how much of it is off screen, so it fades out instead of
     * being cut. Drawn behind the series, so the price line stays the thing
     * you read.
     */
    _defineProperty(this, "drawGridCell", () => {
      const cell = this.gridCellRef.current;
      if (!cell) return;
      const hide = () => {
        cell.setAttribute("visibility", "hidden");
        if (this.cellHintRef.current) {
          this.cellHintRef.current.setAttribute("visibility", "hidden");
        }
        this.hoverCell = null;
      };
      if ((!this.props.grid && !this.props.predict) || !this.gridY.length) {
        return hide();
      }
      const pitch = this.cellPitch;
      if (!(pitch > 0) || !this.priceToY || !this.timeToX) return hide();

      const y = this.hoverY;
      const x = this.hoverX;
      if (!(y >= 0 && y <= this.height && x >= 0 && x <= this.width)) {
        return hide();
      }

      // Snap to the lattice both ways rather than to whichever lines exist
      const baseY = this.gridY[0];
      const y1 = baseY + Math.floor((y - baseY) / pitch) * pitch;
      const x2 = this.nowX + Math.ceil((x - this.nowX) / pitch) * pitch;
      const x1 = x2 - pitch;
      const y2 = y1 + pitch;

      // How much of the square the chart can actually show
      const visible = Math.max(0, Math.min(y2, this.height) - Math.max(y1, 0));
      const frac = visible / pitch;
      if (!(frac > 0.02)) return hide();

      cell.setAttribute("x", x1);
      cell.setAttribute("y", y1);
      cell.setAttribute("width", pitch);
      cell.setAttribute("height", pitch);
      cell.setAttribute("fill-opacity", (0.1 * frac).toFixed(3));
      cell.setAttribute("stroke-opacity", (0.4 * frac).toFixed(3));
      cell.setAttribute("visibility", "visible");

      /* Say what a click here would do. A square in the future is the only
       * part of this chart that is clickable, and nothing else on it says so
       * — without this the two-step placement is a secret. */
      const hint = this.cellHintRef.current;
      if (hint) {
        const future = this.props.predict && x > this.nowX;
        const drafted = this.sameCell(this.draftCall, this.cellAt(x, y));
        if (future && !drafted && frac > 0.5) {
          hint.setAttribute("x", x1 + 5);
          hint.setAttribute("y", y1 + 13);
          hint.setAttribute("fill", this.props.theme.color.textSecondary);
          hint.textContent = "CALL IT";
          hint.setAttribute("visibility", "visible");
        } else {
          hint.setAttribute("visibility", "hidden");
        }
      }

      this.hoverCell = {
        hi: this.priceToY.invert(y1),
        lo: this.priceToY.invert(y2),
        from: this.timeToX.invert(x1),
        to: this.timeToX.invert(x2),
      };
    });

    _defineProperty(this, "drawCrosshair", () => {
      this.hoverRaf = 0;
      this.drawGridCell();
      const g = this.hoverRef.current;
      const raw = safePrices(this.props.prices);
      const scaled = this.scaled;

      /* In candle mode the crosshair follows the bars, not the line's
       * points: the two use different x spacing (a line spreads n points
       * across the full width, candles sit in n slots), so reading from the
       * line left the guide between bars instead of through one. The
       * readout also has to describe the bar actually on screen, which
       * after aggregation is a merge of several source candles. */
      const candleMode = Boolean(
        this.props.showCandles && this.candleScale && this.candleBars,
      );

      /* Comparison mode reads off the percent-change series instead. The
       * guide has to describe both lines at that moment — a readout that
       * named only the coin you were already on would leave the mode's one
       * question ("which is ahead here?") unanswered. */
      const compareMode = Boolean(this.compareScaled);

      let i;
      let px;
      let py;
      let source;
      let candle = null;
      let compareIndex = -1;
      if (compareMode) {
        const points = this.compareScaled.a;
        if (points.length < 2) return;
        i = nearestIndex(points, this.hoverX);
        compareIndex = nearestIndex(this.compareScaled.b, this.hoverX);
        px = points[i].time;
        py = points[i].price;
        source = { price: points[i].percent, time: new Date(points[i].at) };
      } else if (candleMode) {
        i = this.candleIndexAt(this.hoverX);
        if (i < 0) return;
        const bar = this.candleScale.bars[i];
        candle = this.candleBars[i];
        px = bar.x;
        py = bar.yClose;
        source = { price: candle.close, time: candle.time };
      } else {
        if (!scaled || scaled.length < 2 || raw.length !== scaled.length) {
          return;
        }
        i = nearestIndex(scaled, this.hoverX);
        px = scaled[i].time;
        py = scaled[i].price;
        source = raw[i];
      }
      if (!g) return;
      g.setAttribute("visibility", "visible");
      // Skip the text work when the pointer is still on the same point
      if (i === this.hoverIndex) {
        return;
      }
      this.hoverIndex = i;

      const { color } = this.props.theme;
      this.hoverLineRef.current.setAttribute("x1", px);
      this.hoverLineRef.current.setAttribute("x2", px);
      this.hoverDotRef.current.setAttribute("cx", px);
      this.hoverDotRef.current.setAttribute("cy", py);

      // The second line's marker only exists in comparison mode
      const dotB = this.hoverDotBRef.current;
      if (dotB) {
        if (compareMode && compareIndex >= 0) {
          const point = this.compareScaled.b[compareIndex];
          dotB.setAttribute("cx", point.time);
          dotB.setAttribute("cy", point.price);
          dotB.setAttribute("visibility", "inherit");
        } else {
          dotB.setAttribute("visibility", "hidden");
        }
      }

      const fmt = this.props.formatPrice
        ? (v) => this.props.formatPrice(Number(v))
        : (v) => String(v);
      /* With calls on, the readout is the square — nothing else.
       *
       * It used to append the square's band and span to the OHLC table, so
       * the answer to "what am I about to call" sat underneath four rows of
       * open/high/low/close and a volume figure. Those describe what the
       * price *did*; a call is about where it will be, and the two questions
       * were competing in one box. In calls mode the headline is the band and
       * the line under it is the span, and there are no rows at all. */
      const cellBox = this.props.predict ? this.hoverCell : null;
      const dateText = cellBox
        ? `${crosshairDate(cellBox.from, this.props.period)} – ${crosshairDate(
            cellBox.to,
            this.props.period,
          )}`
        : crosshairDate(source.time, this.props.period);
      this.hoverDateRef.current.textContent = dateText;

      // A candle for this point turns the readout into an OHLC table; with
      // no candle (unsupported range/currency, or still loading) it stays
      // the plain price line rather than showing blanks.
      const timeMs = Number(new Date(source.time));
      if (!candleMode && !compareMode) {
        candle = this.props.ohlc ? candleAt(this.props.ohlc, timeMs) : null;
      }
      this.hoverPriceRef.current.textContent = cellBox
        ? `${fmt(cellBox.lo)} – ${fmt(cellBox.hi)}`
        : candle || compareMode
          ? ""
          : fmt(source.price);

      // Two shapes of readout share the same rows: OHLC for one coin, or one
      // row per coin when two are being compared
      let labels;
      let values;
      if (compareMode) {
        labels = [this.props.coin || "", this.props.compareCoin || ""];
        values = [
          formatSignedPercent(this.compareScaled.a[i].percent),
          formatSignedPercent(this.compareScaled.b[compareIndex].percent),
        ];
      } else if (candle && !cellBox) {
        labels = ["Open", "High", "Low", "Close", "Volume"];
        values = [
          fmt(candle.open),
          fmt(candle.high),
          fmt(candle.low),
          fmt(candle.close),
          `${formatVolume(candle.volume)} ${this.props.coin || ""}`.trim(),
        ];
      } else {
        labels = [];
        values = [];
      }
      const rowCount = values.length;

      let labelW = 0;
      let valueW = 0;
      for (let r = 0; r < CROSSHAIR_ROWS.length; r++) {
        const labelNode = this.rowLabelRefs[r].current;
        const valueNode = this.rowValueRefs[r].current;
        if (!labelNode || !valueNode) continue;
        if (r < rowCount) {
          labelNode.textContent = labels[r];
          valueNode.textContent = values[r];
          // "inherit", never "visible": visibility is an inherited property,
          // so a child marked visible stays on screen even after the parent
          // group is hidden — which left the readout stuck on the chart.
          labelNode.setAttribute("visibility", "inherit");
          valueNode.setAttribute("visibility", "inherit");
          labelW = Math.max(labelW, labelNode.getComputedTextLength());
          valueW = Math.max(valueW, valueNode.getComputedTextLength());
        } else {
          labelNode.setAttribute("visibility", "hidden");
          valueNode.setAttribute("visibility", "hidden");
        }
      }

      // Size the box to its widest line, then keep it inside the chart
      const dateW = this.hoverDateRef.current.getComputedTextLength();
      const bodyW = rowCount
        ? labelW + CROSSHAIR_COL_GAP + valueW
        : this.hoverPriceRef.current.getComputedTextLength();
      const boxW = Math.max(dateW, bodyW) + CROSSHAIR_LABEL_PAD * 2;
      const boxH = rowCount
        ? CROSSHAIR_LABEL_PAD * 2 + 12 + rowCount * CROSSHAIR_ROW_H
        : 34;
      let boxX = px + CROSSHAIR_LABEL_GAP;
      if (boxX + boxW > this.width) {
        boxX = px - CROSSHAIR_LABEL_GAP - boxW;
      }
      boxX = Math.max(0, boxX);
      const boxY = Math.min(
        Math.max(py - boxH / 2, 0),
        Math.max(this.height - boxH, 0),
      );
      const box = this.hoverBoxRef.current;
      box.setAttribute("x", boxX);
      box.setAttribute("y", boxY);
      box.setAttribute("width", boxW);
      box.setAttribute("height", boxH);
      box.setAttribute("fill", color.bgSecondary);
      box.setAttribute("stroke", color.border);

      // Date heads the readout; the price line only exists without candles
      this.hoverDateRef.current.setAttribute("x", boxX + CROSSHAIR_LABEL_PAD);
      this.hoverDateRef.current.setAttribute(
        "y",
        boxY + (rowCount ? CROSSHAIR_LABEL_PAD + 8 : 27),
      );
      this.hoverPriceRef.current.setAttribute("x", boxX + CROSSHAIR_LABEL_PAD);
      this.hoverPriceRef.current.setAttribute("y", boxY + 14);

      if (rowCount) {
        const rowsTop = boxY + CROSSHAIR_LABEL_PAD + 12 + CROSSHAIR_ROW_H;
        for (let r = 0; r < rowCount; r++) {
          const y = rowsTop + r * CROSSHAIR_ROW_H;
          this.rowLabelRefs[r].current.setAttribute(
            "x",
            boxX + CROSSHAIR_LABEL_PAD,
          );
          this.rowLabelRefs[r].current.setAttribute("y", y);
          this.rowValueRefs[r].current.setAttribute(
            "x",
            boxX + boxW - CROSSHAIR_LABEL_PAD,
          );
          this.rowValueRefs[r].current.setAttribute("y", y);
        }
      }
    });

    /* Candles are laid out for the current width, so this reruns on resize
     * and on new data. Aggregation keeps the bar count sane for the space.
     * `animate` is set for data and mode changes but not for resizes — a
     * window drag would otherwise strobe the chart.
     *
     * The line morphs between periods because its shape survives the change;
     * a candle set doesn't (60 one-minute bars become 120 six-hour ones), so
     * this cross-fades instead of trying to tween one into the other. */
    _defineProperty(this, "updateCandles", (animate) => {
      const layers = this.candleLayers;
      if (!layers[0].group.current || !layers[1].group.current) return;
      const candles = this.props.candles;
      const showing = Boolean(
        this.props.showCandles && candles && candles.length,
      );
      const active = layers[this.activeLayer];
      const spare = layers[1 - this.activeLayer];

      if (!showing) {
        this.fadeTo(active.group.current, 0, animate);
        this.fadeTo(spare.group.current, 0, false);
        this.candleScale = null;
        this.candleBars = null;
        return;
      }

      // One bar per ~3px of width, so bars never collapse into a smear —
      // and no more bars than the data can actually fill, so a thin market's
      // empty intervals merge into candles with real bodies
      const maxBars = Math.min(
        Math.max(20, Math.floor(this.width / 3)),
        candleDensityCap(candles),
      );
      const bars = aggregateCandles(candles, maxBars);
      const scaled = scaleCandles(bars, this.height, this.width, PADDING);
      const previous = this.candleScale;
      this.candleScale = scaled;
      this.candleBars = bars; // what the crosshair reports, post-aggregation

      const drawInto = (layer, geometry) => {
        layer.up.current.setAttribute("d", candlePathData(geometry, true));
        layer.down.current.setAttribute("d", candlePathData(geometry, false));
        this.drawVolume(layer, geometry, bars);
      };

      // Resize, first draw, or a mode switch with nothing to morph from
      if (!animate || !previous) {
        drawInto(active, scaled);
        this.fadeTo(active.group.current, 1, Boolean(animate));
        this.fadeTo(spare.group.current, 0, false);
        return;
      }

      /* Both layers travel the same geometric path so the shapes stay
       * aligned, while the opacity crossfade carries the colours over —
       * a bar that flips green to red doesn't pop, it dissolves in place.
       * The incoming layer ends exactly on the new set; the outgoing one
       * starts exactly on the old, so neither end of the transition jumps. */
      this.morph(spare, previous, scaled, false);
      this.morph(active, scaled, previous, true);
      // Volume is a bar chart, not a shape to tween — it swaps with the
      // layer's own crossfade rather than morphing
      this.drawVolume(spare, scaled, bars);
      this.fadeTo(spare.group.current, 1, true);
      this.fadeTo(active.group.current, 0, true);
      this.activeLayer = 1 - this.activeLayer;
    });

    // Volume band for one layer, cleared when the band is switched off
    _defineProperty(this, "drawVolume", (layer, geometry, bars) => {
      if (!layer.volUp.current || !layer.volDown.current) return;
      const show = this.props.showVolume && geometry;
      layer.volUp.current.setAttribute(
        "d",
        show ? volumeBarsData(geometry, bars, this.height, true) : "",
      );
      layer.volDown.current.setAttribute(
        "d",
        show ? volumeBarsData(geometry, bars, this.height, false) : "",
      );
    });

    /* Tween one layer's paths between two candle geometries. `reverse`
     * draws the outgoing set: same journey, mirrored, so it keeps its own
     * bars and colours while sliding onto the new layout. */
    _defineProperty(this, "morph", (layer, from, to, reverse) => {
      const build = (upward) => () => (t) => {
        const geometry = reverse
          ? interpolateCandleScale(from, to, 1 - t)
          : interpolateCandleScale(from, to, t);
        return candlePathData(geometry, upward);
      };
      select(layer.up.current)
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(easeCubicOut)
        .attrTween("d", build(true));
      select(layer.down.current)
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(easeCubicOut)
        .attrTween("d", build(false));
    });

    // Opacity tween with an optional callback once it lands
    _defineProperty(this, "fadeTo", (node, value, animate, done) => {
      if (!animate) {
        node.setAttribute("opacity", String(value));
        if (done) done();
        return;
      }
      select(node)
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(easeCubicOut)
        .attr("opacity", value)
        .on("end", () => {
          if (done) done();
        });
    });

    /* Comparison overlay. Both coins are drawn as percent change from the
     * start of the range on one shared axis — see scaleComparison for why a
     * second y-axis is not an option. The single-coin line and the candles
     * fade out while this is up: three sets of marks answering two different
     * questions on one chart is noise, not more information. */
    _defineProperty(this, "updateComparison", (animate) => {
      const group = this.compareGroupRef.current;
      if (!group) return;
      const scaled =
        this.props.comparePrices && this.props.comparePrices.length
          ? scaleComparison(
              this.props.prices,
              this.props.comparePrices,
              this.height,
              this.width,
              PADDING,
            )
          : null;

      if (!scaled) {
        this.compareScaled = null;
        this.compareD = { a: null, b: null };
        this.fadeTo(group, 0, animate);
        return;
      }

      this.compareScaled = scaled;
      this.hoverIndex = -1; // a readout from the old scale would be wrong now

      const dA = lineFromPrices(scaled.a);
      const dB = lineFromPrices(scaled.b);
      const draw = (ref, from, to) => {
        const node = select(ref.current);
        // Morph between ranges when there is a previous shape to morph from;
        // the first draw has nothing to grow out of
        if (animate && from) {
          node
            .transition()
            .duration(TRANSITION_DURATION)
            .ease(easeCubicOut)
            .attrTween("d", interpolatePath.bind(null, from, to));
        } else {
          node.attr("d", to);
        }
      };
      draw(this.comparePathARef, this.compareD.a, dA);
      draw(this.comparePathBRef, this.compareD.b, dB);
      this.compareD = { a: dA, b: dB };

      // The 0% reference. Always on screen, since both series start there
      const zero = this.compareZeroRef.current;
      if (zero) {
        zero.setAttribute("y1", scaled.zeroY);
        zero.setAttribute("y2", scaled.zeroY);
        zero.setAttribute("x1", PADDING);
        zero.setAttribute("x2", Math.max(PADDING, this.width - PADDING));
      }

      this.placeCompareLabels(scaled);
      this.fadeTo(group, 1, animate);
    });

    /* Each line is named at its own end. Two colours alone would leave the
     * chart unreadable to anyone who can't separate them, and unreadable to
     * everyone once it is a screenshot with no legend. */
    _defineProperty(this, "placeCompareLabels", (scaled) => {
      const entries = [
        [this.compareLabelARef.current, scaled.a, this.props.coin, scaled.lastA],
        [
          this.compareLabelBRef.current,
          scaled.b,
          this.props.compareCoin,
          scaled.lastB,
        ],
      ];
      const top = COMPARE_LABEL_MIN_GAP;
      const bottom = this.height - 4;
      const clamp = (v) => Math.min(Math.max(v, top), bottom);
      const placed = [];
      for (const [node, points, symbol, percent] of entries) {
        if (!node || !points.length) continue;
        const end = points[points.length - 1];
        node.textContent = `${symbol || ""} ${formatSignedPercent(percent)}`.trim();
        let y = clamp(end.price - COMPARE_LABEL_LIFT);
        /* Two coins that finish level land on the same pixel, so the second
         * label steps clear of the first — away from it by preference, but
         * the other way when that direction is off the chart. Clamping after
         * the step would just push it back onto the label it moved to avoid. */
        for (const taken of placed) {
          if (Math.abs(y - taken) >= COMPARE_LABEL_MIN_GAP) continue;
          const above = taken - COMPARE_LABEL_MIN_GAP;
          const below = taken + COMPARE_LABEL_MIN_GAP;
          y =
            y <= taken
              ? above >= top
                ? above
                : below
              : below <= bottom
                ? below
                : above;
          y = clamp(y);
        }
        placed.push(y);
        node.setAttribute("x", end.time);
        node.setAttribute("y", y);
      }
    });

    _defineProperty(this, "updatePath", () => {
      const { prices } = this.props;

      const scaled = scalePrices(
        safePrices(prices),
        this.height,
        this.width,
        PADDING,
        PADDING,
        0,
        this.futureWidth(),   // history stops short of the reserved future
      );
      this.scaled = scaled;
      this.hoverIndex = -1;
      const d = lineFromPrices(scaled);
      const areaD = buildAreaD(d, scaled, this.height);

      this.path
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(easeCubicOut)
        .attrTween("d", interpolatePath.bind(null, this.d, d));

      this.area
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(easeCubicOut)
        .attrTween("d", interpolatePath.bind(null, this.areaD || d, areaD));

      this.d = d;
      this.areaD = areaD;
      /* Called from here rather than from inside `updateGrid`, which is what
       * left traces behind: they used to run at the end of it, so every early
       * return — grid off, calls off, no geometry — skipped the clean-up and
       * the boxes and the live marker stayed on a chart that no longer had a
       * game on it. Drawing is conditional; clearing must not be. */
      this.updateGrid();
      this.updateCalls();
      this.updateLiveDot();
      this.updateReference();
    });

    /* The square cell size, and the round price levels that set it.
     *
     * Lifted out of `updateGrid` because `updatePath` needs it *first*: with
     * calls turned on the series has to stop short of the right edge to leave
     * whole cells of empty future to point at, and that reservation is a
     * multiple of the pitch. The pitch depends only on the price extent and
     * the height, never on the width, so there is no circularity — but the
     * order matters and this is why.
     */
    _defineProperty(this, "gridGeometry", () => {
      const data = safePrices(this.props.prices);
      if (data.length < 2 || !this.height) return null;
      const [lo, hi] = extent(data, (d) => d.price);
      if (!isFinite(lo) || !isFinite(hi) || lo === hi) return null;

      const top = PADDING;
      const bottom = this.height - PADDING;
      const plot = bottom - top;
      if (!(plot > 0)) return null;

      const priceToY = scaleLinear().range([bottom, top]).domain([lo, hi]);

      /* What size a cell should be.
       *
       * Normally: about a sixth of the plot height, which is a comfortable
       * reading grid. With calls on it is decided by the strip instead —
       * asking for ten squares of future must not push six of them off the
       * chart, so the squares get smaller rather than fewer. The future is
       * allowed a fixed share of the width and the cell size is whatever
       * divides it into the number asked for. */
      const target = Math.max(46, Math.min(104, plot / 6));
      /* With calls on the strip gets a budget rather than a target.
       *
       * Picking the pitch *nearest* a target looked reasonable and was not:
       * candidate pitches are quantised by d3's round price steps, so the
       * nearest one to 57px might be 43 while the nearest to 96 is 86 — and
       * six squares then reached three weeks while ten reached two and a
       * half. Asking for more future gave you less of it.
       *
       * Taking the largest pitch that still fits `ahead` of them inside the
       * budget makes the strip land just under the budget whatever the count
       * is: the reach stays put and the squares get smaller, which is the
       * behaviour the panel describes. */
      const budget =
        this.props.predict && this.width
          ? this.width * MAX_FUTURE_FRACTION
          : 0;
      const ahead = Math.max(1, Math.min(10, this.props.predictAhead || 2));

      /* Every round-step grid d3 will give us, largest cell first. */
      const candidates = [];
      for (let n = 3; n <= 14; n++) {
        const t = priceToY.ticks(n);
        if (t.length < 2) continue;
        const p = Math.abs(priceToY(t[1]) - priceToY(t[0]));
        if (p > 4) candidates.push({ levels: t, pitch: p });
      }
      if (!candidates.length) return null;

      let chosen;
      if (budget) {
        // The biggest square that still fits `ahead` of them in the strip,
        // so the reach lands just under the budget at any count. Falls back
        // to the finest grid when even that is too big for the strip.
        const fits = candidates.filter((c) => c.pitch * ahead <= budget);
        chosen = fits.length
          ? fits.reduce((a, b) => (b.pitch > a.pitch ? b : a))
          : candidates.reduce((a, b) => (b.pitch < a.pitch ? b : a));
      } else {
        chosen = candidates.reduce((a, b) =>
          Math.abs(b.pitch - target) < Math.abs(a.pitch - target) ? b : a,
        );
      }
      const levels = chosen.levels;
      const pitch = chosen.pitch;

      return {
        priceToY,
        levels,
        pitch,
        step: Math.abs(levels[1] - levels[0]),
        top,
        bottom,
      };
    });

    /* How much of the right-hand side is future rather than history. Zero
     * unless calls are on: an empty strip on a chart that cannot be pointed
     * at is just a chart that stops early. */
    _defineProperty(this, "futureWidth", () => {
      if (!this.props.predict) return 0;
      const geo = this.gridGeometry();
      if (!geo) return 0;
      /* Every square asked for, at the size `gridGeometry` chose for them.
       * The hard cap only bites when the pitch had to be clamped upward on a
       * narrow window — the alternative there is a cell too small to click. */
      const ahead = Math.max(1, Math.min(10, this.props.predictAhead || 2));
      return Math.min(geo.pitch * ahead, this.width * 0.55);
    });

    /* ── The grid ──
     *
     * Square cells, and that is the constraint everything else bends to.
     *
     * The first version let d3 choose round ticks on both axes independently.
     * That gives beautiful labels and cells 290px wide by 86px tall — which
     * is not a grid, it is a set of stripes. Square matters here because the
     * grid is for judging a move: when one cell across equals one cell up,
     * the *angle* of the line means something, and you can read "two cells in
     * a week" off the chart. Rectangles of an arbitrary ratio destroy that.
     *
     * So one pixel pitch drives both axes:
     *   · the price step is still one of d3's round numbers, picked as the
     *     one whose pixel height lands nearest a comfortable cell size — so
     *     the horizontal lines keep their $64.5K / $65K labels;
     *   · the vertical lines are then placed at that same pitch, measured
     *     from the right edge, because "now" is the origin you count back
     *     from rather than whenever the series happens to start.
     *
     * Columns therefore carry a uniform slice of time rather than a round
     * one. That is the trade, and it is the right way round: a level you can
     * name is worth more than a date that ends in :00.
     */
    _defineProperty(this, "updateGrid", () => {
      const g = this.gridRef.current;
      if (!g) return;
      while (g.firstChild) g.removeChild(g.firstChild);
      this.gridX = [];
      this.gridY = [];
      /* Forget the geometry on the way out, not just the lines.
       * `updateCalls` and `drawGridCell` read these to place their boxes, and
       * leaving yesterday's scales behind meant a chart with the feature
       * switched off could still be drawn on by them. */
      const forget = () => {
        this.timeToX = null;
        this.priceToY = null;
        this.cellPitch = 0;
        this.nowX = this.width;
        this.hoverCell = null;
      };
      if (!this.props.grid && !this.props.predict) return forget();

      const geo = this.gridGeometry();
      if (!geo || !this.width) return forget();
      const data = safePrices(this.props.prices);
      const [t0, t1] = extent(data, (d) => d.time);

      const { color, font } = this.props.theme;
      const { priceToY, levels, pitch, step, top, bottom } = geo;
      const future = this.futureWidth();
      const nowX = this.width - future;
      // Time runs out at "now", which is where history stops — the reserved
      // strip to its right is future, and the same scale extrapolates into it
      const timeToX = scaleTime().range([0, nowX]).domain([t0, t1]);
      this.nowX = nowX;
      this.timeToX = timeToX;
      this.priceToY = priceToY;
      this.cellPitch = pitch;

      const ns = "http://www.w3.org/2000/svg";
      const line = (x1, y1, x2, y2, dim) => {
        const el = document.createElementNS(ns, "line");
        el.setAttribute("x1", x1);
        el.setAttribute("y1", y1);
        el.setAttribute("x2", x2);
        el.setAttribute("y2", y2);
        el.setAttribute("stroke", color.border);
        el.setAttribute("stroke-width", "1");
        if (dim) el.setAttribute("opacity", "0.55");
        g.appendChild(el);
      };
      const label = (x, y, text) => {
        const el = document.createElementNS(ns, "text");
        el.setAttribute("x", x);
        el.setAttribute("y", y);
        el.setAttribute("fill", color.textSecondary);
        el.setAttribute("font-size", "9");
        el.setAttribute("font-family", font.primary);
        el.setAttribute("letter-spacing", "0.08em");
        el.textContent = text;
        g.appendChild(el);
      };

      /* The lattice runs the full height, not just the band the data covers.
       * d3's ticks stop at the domain, which left a ~24px strip top and
       * bottom with vertical lines but no horizontal ones — so a cell up
       * there was not a square, it was whatever was left over. Extending by
       * whole steps keeps every row the same height, and the extra levels
       * are real prices, so they get real labels. */
      const rowsUp = Math.ceil((priceToY(levels[levels.length - 1]) - 0) / pitch) + 1;
      const rowsDown = Math.ceil((this.height - priceToY(levels[0])) / pitch) + 1;
      const allLevels = [];
      for (let k = rowsDown; k > 0; k--) allLevels.push(levels[0] - step * k);
      levels.forEach((v) => allLevels.push(v));
      for (let k = 1; k <= rowsUp; k++) {
        allLevels.push(levels[levels.length - 1] + step * k);
      }
      allLevels.forEach((v) => {
        const y = priceToY(v);
        if (y < -0.5 || y > this.height + 0.5) return;
        this.gridY.push(y);
        line(0, y, this.width, y);
        label(4, y - 4, formatAxisPrice(v, step, this.props.currencySymbol));
      });

      /* Counted back from "now" at the same pitch, so the cells are square
       * and the boundaries mean something: the one ending at nowX is the
       * slice of time that just finished. */
      /* Labelling the time axis, and why it is sparse.
       *
       * A column is one pitch wide and the pitch comes from a round *price*
       * step, so a column is a uniform but arbitrary slice of time — about
       * 2.4 days on a month range. Squares and round numbers on both axes
       * cannot both hold: the price band is the thing a call actually names,
       * so price keeps the round numbers and time gets the awkward span.
       *
       * That awkwardness is only visible in the *labels*: printed at every
       * boundary they drift, Jul 13, 15, 18, 20, 23 — even spacing carrying
       * uneven numbers, which is what reads as muddled. Printed every other
       * boundary or so, each one is still a true date and the drift is a
       * fraction of the gap rather than most of it.
       *
       * A relative axis was tried instead (−2d, +2d) and was worse: with an
       * arbitrary span the unit slides along the axis, from −4.1w through
       * −1w to −4.8d, which is a harder thing to read than a date.
       */
      const xToTime = timeToX.invert;
      const LABEL_GAP = 150;
      const timeLabel = (x, cols) =>
        cols === 0 && this.props.predict
          ? "now"
          : crosshairDate(xToTime(x), this.props.period);

      let lastLabelX = Infinity;
      let col = 0;
      for (let x = nowX; x > 0.5; x -= pitch, col--) {
        this.gridX.push(x);
        line(x, 0, x, this.height);
        if (lastLabelX - x < LABEL_GAP) continue;
        lastLabelX = x;
        label(x + 4, this.height - 6, timeLabel(x, col));
      }

      // The future strip, dimmer, so it reads as "not drawn yet"
      let fcol = 1;
      for (let x = nowX + pitch; x <= this.width + 0.5; x += pitch, fcol++) {
        this.gridX.push(x);
        line(x, 0, x, this.height, true);
        /* Same convention as the history side: the label sits just right of
         * the boundary it names. Placing it at the column's left edge put it
         * on top of "now", which is the boundary the previous loop had
         * already labelled. Skipped when there is no room left for it. */
        if (x + 46 <= this.width) label(x + 4, this.height - 6, timeLabel(x, fcol));
      }
      if (future > 0) {
        // "now" itself gets the one emphatic line on the chart
        const el = document.createElementNS(ns, "line");
        el.setAttribute("x1", nowX);
        el.setAttribute("y1", 0);
        el.setAttribute("x2", nowX);
        el.setAttribute("y2", this.height);
        el.setAttribute("stroke", color.textSecondary);
        el.setAttribute("stroke-width", "1");
        el.setAttribute("stroke-dasharray", "2 3");
        el.setAttribute("opacity", "0.65");
        g.appendChild(el);
      }

      this.gridY.sort((a, b) => a - b);
      this.gridX.sort((a, b) => a - b);

      /* Report what a square actually is, so the panel can say it.
       *
       * "4 squares" is not a quantity anyone can picture — the two things it
       * decides are how far ahead you may call and how tight each band is,
       * and both are computed right here. Sent up only when the numbers
       * change: this runs on every redraw, and a setState per redraw would
       * feed straight back into another one. */
      if (typeof this.props.onGeometry === "function" && future > 0) {
        const spanMs = xToTime(nowX) - xToTime(nowX - pitch);
        const next = {
          step,                                  // price per square
          spanMs,                                // time per square
          reachMs: spanMs * Math.round(future / pitch),
        };
        const last = this._lastGeo;
        if (
          !last ||
          last.step !== next.step ||
          Math.abs(last.spanMs - next.spanMs) > 1000 ||
          Math.abs(last.reachMs - next.reachMs) > 1000
        ) {
          this._lastGeo = next;
          this.props.onGeometry(next);
        }
      }
    });

    /* The cell the pointer is in, bounded by the lines either side of it.
     * Drawn behind the series so the price line stays the thing you read. */
    /* Place (or hide) the reference level. Hidden whenever the level is not
     * inside the range the chart draws — see `priceToChartY`. The label sits
     * on the line at the left edge, so it reads as belonging to it rather
     * than floating in the plot. */
    _defineProperty(this, "updateReference", () => {
      const line = this.refLineRef.current;
      const label = this.refLabelRef.current;
      if (!line || !label) return;
      const ref = this.props.reference;
      const y =
        ref && isFinite(ref.value)
          ? priceToChartY(
              safePrices(this.props.prices),
              ref.value,
              this.height,
              PADDING,
              PADDING,
            )
          : null;
      if (y == null) {
        line.setAttribute("opacity", "0");
        label.setAttribute("opacity", "0");
        return;
      }
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("x1", PADDING);
      line.setAttribute("x2", Math.max(PADDING, this.width - PADDING));
      line.setAttribute("opacity", "1");
      label.setAttribute("x", PADDING + 4);
      label.setAttribute("y", y - 5);
      label.textContent = ref.label || "";
      label.setAttribute("opacity", "1");
    });
  }

  componentDidMount() {
    if (
      this.pathRef &&
      this.pathRef.current &&
      this.svgRef &&
      this.svgRef.current
    ) {
      const { height, width } = this.svgRef.current.getBoundingClientRect();
      const { prices } = this.props;

      this.path = select(this.pathRef.current);
      this.area = select(this.areaRef.current);
      this.clipRect = select(this.clipRectRef.current);
      this.height = height;
      this.width = width;

      const scaled = scalePrices(
        safePrices(prices),
        height,
        width,
        PADDING,
        PADDING,
      );
      this.scaled = scaled;
      const d = lineFromPrices(scaled);
      const areaD = buildAreaD(d, scaled, height);
      this.path.attr("d", d);
      this.area.attr("d", areaD);
      this.updateReference();
      this.d = d;
      this.areaD = areaD;

      // "Draw-in": reveal the chart left→right by widening the clip rect
      this.clipRect
        .attr("x", 0)
        .attr("y", 0)
        .attr("height", height)
        .attr("width", 0)
        .transition()
        .duration(REVEAL_DURATION)
        .ease(easeCubicOut)
        .attr("width", width);

      // Re-measure on ANY change to the chart box — window resize, but also
      // the page ticker appearing/collapsing or other padding shifts that
      // resize the chart without firing a window resize event. (Skip the
      // initial observe callback so it doesn't cut the draw-in reveal short.)
      if (typeof ResizeObserver !== "undefined") {
        let firstObserve = true;
        this.resizeObserver = new ResizeObserver((entries) => {
          if (firstObserve) {
            firstObserve = false;
            // Skip the initial callback ONLY when the size matches what we
            // measured at mount (so it doesn't cut the draw-in reveal short).
            // If layout settled to a different size after mount — e.g. the
            // chart measured 0×0 because scripts ran before first layout —
            // fall through and re-measure, otherwise the clip rect stays at
            // the wrong width and the chart looks like it never loads.
            const box = entries[entries.length - 1].contentRect;
            if (
              Math.abs(box.width - this.width) < 1 &&
              Math.abs(box.height - this.height) < 1
            ) {
              return;
            }
          }
          this.handleResize();
        });
        this.resizeObserver.observe(this.svgRef.current);
      } else {
        window.addEventListener("resize", this.handleResize);
      }

      this.updateCandles(false);
      this.updateComparison(false);
      if (this.lineGroupRef.current) {
        this.lineGroupRef.current.setAttribute(
          "opacity",
          this.props.showCandles || this.compareScaled ? "0" : "1",
        );
      }

      if (this.props.interactive) {
        const svg = this.svgRef.current;
        svg.addEventListener("pointermove", this.handlePointerMove, {
          passive: true,
        });
        svg.addEventListener("click", this.handleChartClick);
        svg.addEventListener("pointerleave", this.handlePointerLeave, {
          passive: true,
        });
        // A touch drag reads the chart too; lift = done
        svg.addEventListener("pointercancel", this.handlePointerLeave, {
          passive: true,
        });
        // The element's own pointerleave doesn't fire when the cursor exits
        // the window/screen in one motion, or when focus jumps to another
        // app — the readout would sit there pointing at nothing.
        document.addEventListener("mouseleave", this.handlePointerLeave, {
          passive: true,
        });
        window.addEventListener("blur", this.handlePointerLeave, {
          passive: true,
        });
      }
    }
  }

  componentDidUpdate(prevProps) {
    // Only update path if prices actually changed
    if (prevProps.prices !== this.props.prices) {
      this.updatePath();
      this.handlePointerLeave(); // stale readout would point at old data
      // New series → the candles that go with it haven't been asked for yet
      this._askedForOhlc = false;
    }

    /* Turning calls on or off, or changing how far ahead they reach, resizes
     * the reserved future — which moves every point of the series, so the
     * path has to be rebuilt, not just the mesh. */
    /* A draft is about one square on one chart. Change the coin, the range or
     * the currency and that square no longer means what it meant. */
    if (
      prevProps.coin !== this.props.coin ||
      prevProps.period !== this.props.period ||
      prevProps.currency !== this.props.currency ||
      (prevProps.predict && !this.props.predict)
    ) {
      this.draftCall = null;
    }

    if (
      prevProps.grid !== this.props.grid ||
      prevProps.predict !== this.props.predict ||
      prevProps.predictAhead !== this.props.predictAhead
    ) {
      this.updatePath();
    } else if (
      prevProps.calls !== this.props.calls ||
      /* Settled calls are a second list and were not being watched, so
       * clearing the history — or switching "keep settled calls on the
       * chart" off — left their boxes on screen until something unrelated
       * happened to redraw. */
      prevProps.settledCalls !== this.props.settledCalls
    ) {
      this.updateCalls();
    }

    /* A win, announced by the counter changing rather than by a ref reaching
     * in from the app. Fired at the live point, which is where the price
     * arrived — the thing that was called correctly. */
    if (
      this.props.celebrate &&
      prevProps.celebrate !== this.props.celebrate &&
      this.scaled &&
      this.scaled.length
    ) {
      const c = this.props.celebrateCall;
      let box = null;
      if (c && this.timeToX && this.priceToY) {
        const x1 = this.timeToX(new Date(c.target - c.span));
        const x2 = this.timeToX(new Date(c.target));
        const y1 = this.priceToY(c.hi);
        const y2 = this.priceToY(c.lo);
        if ([x1, x2, y1, y2].every(isFinite)) {
          box = {
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            w: Math.abs(x2 - x1),
            h: Math.abs(y2 - y1),
          };
        }
      }
      const last = this.scaled[this.scaled.length - 1];
      // On the box that came true; the live point only if we cannot place it
      this.burst(
        box ? box.x + box.w / 2 : last.time,
        box ? box.y + box.h / 2 : last.price,
        box,
      );
    }
    /* The overlay is scaled against both series, so either one changing
     * rescales it — including the primary coin's own refresh. */
    const compareChanged =
      prevProps.comparePrices !== this.props.comparePrices ||
      prevProps.compareCoin !== this.props.compareCoin;
    if (compareChanged || prevProps.prices !== this.props.prices) {
      this.updateComparison(true);
      if (compareChanged) this.handlePointerLeave();
    }
    // The level itself can move without the series doing so — recording a
    // purchase changes the cost basis while the chart stays put
    if (prevProps.reference !== this.props.reference) {
      this.updateReference();
    }
    const modeChanged = prevProps.showCandles !== this.props.showCandles;
    if (prevProps.showVolume !== this.props.showVolume) {
      this.updateCandles(false);
    }
    if (modeChanged || prevProps.candles !== this.props.candles) {
      this.updateCandles(true);
    }
    /* The single-coin line, the candles and the comparison overlay are three
     * ways of drawing the same chart and only one is ever up. Deciding the
     * line's visibility once, from both inputs, keeps a compare toggle and a
     * candle toggle from arguing over it — cross-faded so nothing blinks. */
    if ((modeChanged || compareChanged) && this.lineGroupRef.current) {
      const lineVisible = !this.compareScaled && !this.props.showCandles;
      this.fadeTo(this.lineGroupRef.current, lineVisible ? 1 : 0, true);
    }
    // An overlay opened over the chart. Opening it from the keyboard moves
    // no pointer, so no pointerleave fires and the readout would linger
    // under the panel.
    if (this.props.paused && !prevProps.paused) {
      this.handlePointerLeave();
    }
  }

  componentWillUnmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener("resize", this.handleResize);
    if (this.hoverRaf) cancelAnimationFrame(this.hoverRaf);
    const svg = this.svgRef.current;
    if (svg && this.props.interactive) {
      svg.removeEventListener("pointermove", this.handlePointerMove);
      svg.removeEventListener("click", this.handleChartClick);
      svg.removeEventListener("pointerleave", this.handlePointerLeave);
      svg.removeEventListener("pointercancel", this.handlePointerLeave);
      document.removeEventListener("mouseleave", this.handlePointerLeave);
      window.removeEventListener("blur", this.handlePointerLeave);
    }
  }

  render() {
    const { color } = this.props.theme;
    const tint = isTrendUp(this.props.prices)
      ? color.chartLineGreen
      : color.chartLineRed;

    return React.createElement(
      Svg,
      { innerRef: this.svgRef, interactive: this.props.interactive },
      React.createElement(
        "defs",
        null,
        React.createElement(
          "linearGradient",
          { id: this.gradId, x1: "0", y1: "0", x2: "0", y2: "1" },
          React.createElement("stop", {
            offset: "0%",
            stopColor: tint,
            stopOpacity: 0.25,
          }),
          React.createElement("stop", {
            offset: "100%",
            stopColor: tint,
            stopOpacity: 0,
          }),
        ),
        React.createElement(
          "clipPath",
          { id: this.clipId },
          // width/height are set imperatively (reveal animation + resize),
          // so they are intentionally omitted here to avoid React clobbering them
          React.createElement("rect", { ref: this.clipRectRef, x: "0", y: "0" }),
        ),
      ),
      React.createElement(
        "g",
        { clipPath: `url(#${this.clipId})` },
        /* Grid and the cell under the pointer, behind everything: the mesh is
         * the paper the series is drawn on, not something competing with it. */
        React.createElement("rect", {
          ref: this.gridCellRef,
          fill: tint,
          fillOpacity: "0.1",
          stroke: tint,
          strokeOpacity: "0.4",
          strokeWidth: "1",
          visibility: "hidden",
          pointerEvents: "none",
        }),
        React.createElement(
          "text",
          {
            ref: this.cellHintRef,
            fontSize: "9",
            fontFamily: this.props.theme.font.primary,
            letterSpacing: "0.08em",
            visibility: "hidden",
            pointerEvents: "none",
            "aria-hidden": "true",
          },
          "",
        ),
        React.createElement("g", {
          ref: this.gridRef,
          "aria-hidden": "true",
          pointerEvents: "none",
        }),
        React.createElement("g", {
          ref: this.callLayerRef,
          "aria-hidden": "true",
          pointerEvents: "none",
        }),
        /* Reference level (the portfolio's cost basis). Behind the series so
         * the line it explains stays on top, dashed and in the border colour
         * so it reads as a gridline rather than a second series. */
        React.createElement("line", {
          ref: this.refLineRef,
          stroke: color.textSecondary,
          strokeWidth: "1",
          strokeDasharray: "4 4",
          opacity: "0",
        }),
        React.createElement(
          "text",
          {
            ref: this.refLabelRef,
            fill: color.textSecondary,
            fontSize: "9",
            fontFamily: this.props.theme.font.primary,
            letterSpacing: "0.08em",
            opacity: "0",
          },
          "",
        ),
        // Line layer — faded rather than unmounted on a mode switch, so the
        // two chart types cross over instead of blinking
        React.createElement(
          "g",
          { ref: this.lineGroupRef, "data-line": "1" },
          React.createElement("path", {
            // colorize off → no fill, just the line (the "colourless" chart)
            fill:
              this.props.colorize === false || this.props.showCandles
                ? "none"
                : `url(#${this.gradId})`,
            stroke: "none",
            ref: this.areaRef,
          }),
          React.createElement("path", {
            fill: "none",
            ref: this.pathRef,
            stroke: color.text,
            strokeWidth: "1.5",
          }),
        ),
        // Candles: two identical layers so a range change can dissolve from
        // the old bars into the new ones instead of through an empty chart
        this.candleLayers.map((layer, i) =>
          React.createElement(
            "g",
            {
              key: `candles-${i}`,
              ref: layer.group,
              opacity: 0,
              "data-candles": i,
            },
            // Volume sits behind the candles and reads as background: it is
            // context for the price, not a second thing to compare
            React.createElement("path", {
              ref: layer.volUp,
              fill: color.chartLineGreen,
              stroke: "none",
              opacity: "0.28",
            }),
            React.createElement("path", {
              ref: layer.volDown,
              fill: color.chartLineRed,
              stroke: "none",
              opacity: "0.28",
            }),
            React.createElement("path", {
              ref: layer.up,
              fill: color.chartLineGreen,
              stroke: color.chartLineGreen,
              strokeWidth: "1",
            }),
            React.createElement("path", {
              ref: layer.down,
              fill: color.chartLineRed,
              stroke: color.chartLineRed,
              strokeWidth: "1",
            }),
          ),
        ),
        /* Comparison overlay. Ink for the coin you are on and the accent for
         * the one you brought in: the pair separates at ΔE 43 (light) / 29
         * (dark) under every simulated colour deficiency, and both lines are
         * named at their ends anyway, so nothing here rests on colour. */
        React.createElement(
          "g",
          { ref: this.compareGroupRef, opacity: 0, "data-compare": "1" },
          React.createElement("line", {
            ref: this.compareZeroRef,
            stroke: color.border,
            strokeWidth: "1",
            strokeDasharray: "3 4",
          }),
          React.createElement("path", {
            ref: this.comparePathARef,
            fill: "none",
            stroke: color.text,
            strokeWidth: "1.5",
          }),
          React.createElement("path", {
            ref: this.comparePathBRef,
            fill: "none",
            stroke: color.chartLine,
            strokeWidth: "1.5",
          }),
          /* Painted with a background-coloured halo underneath: a label sits
           * at its line's end, and a steeply falling line runs straight
           * through the text otherwise. */
          React.createElement("text", {
            ref: this.compareLabelARef,
            fill: color.text,
            stroke: color.bg,
            strokeWidth: "3",
            paintOrder: "stroke",
            fontSize: "10",
            fontWeight: "700",
            textAnchor: "end",
          }),
          React.createElement("text", {
            ref: this.compareLabelBRef,
            fill: color.chartLine,
            stroke: color.bg,
            strokeWidth: "3",
            paintOrder: "stroke",
            fontSize: "10",
            fontWeight: "700",
            textAnchor: "end",
          }),
        ),
      ),

      /* The live price, and the one celebration. Both sit above the series:
       * the dot is where you are, and the burst is the only moment this chart
       * ever asks to be looked at. */
      React.createElement("circle", {
        ref: this.liveDotRef,
        r: "3.5",
        fill: tint,
        stroke: color.bg,
        strokeWidth: "1",
        visibility: "hidden",
        pointerEvents: "none",
        className: "pt-live-dot",
      }),
      React.createElement("g", {
        ref: this.burstRef,
        "aria-hidden": "true",
        pointerEvents: "none",
      }),
      // Crosshair layer — positions/text are written imperatively on hover
      this.props.interactive &&
        React.createElement(
          "g",
          {
            ref: this.hoverRef,
            visibility: "hidden",
            pointerEvents: "none",
            "aria-hidden": "true",
          },
          React.createElement("line", {
            ref: this.hoverLineRef,
            y1: 0,
            y2: "100%",
            stroke: color.textSecondary,
            strokeWidth: "1",
            strokeDasharray: "3 3",
            opacity: "0.7",
          }),
          React.createElement("circle", {
            ref: this.hoverDotRef,
            r: "3.5",
            fill: color.bg,
            stroke: color.text,
            strokeWidth: "1.5",
          }),
          // The compared coin's marker, hidden outside comparison mode
          React.createElement("circle", {
            ref: this.hoverDotBRef,
            r: "3.5",
            fill: color.bg,
            stroke: color.chartLine,
            strokeWidth: "1.5",
            visibility: "hidden",
          }),
          React.createElement("rect", {
            ref: this.hoverBoxRef,
            rx: "6",
            strokeWidth: "1",
          }),
          React.createElement("text", {
            ref: this.hoverPriceRef,
            fill: color.text,
            fontSize: "12",
            fontWeight: "600",
            fontFamily: this.props.theme.font.primary,
          }),
          React.createElement("text", {
            ref: this.hoverDateRef,
            fill: color.textSecondary,
            fontSize: "10",
            fontFamily: this.props.theme.font.primary,
          }),
          // OHLC rows: label column left, value column right-aligned
          CROSSHAIR_ROWS.map((row, i) =>
            React.createElement(
              Fragment,
              { key: row },
              React.createElement("text", {
                ref: this.rowLabelRefs[i],
                visibility: "hidden",
                fill: color.textSecondary,
                fontSize: "10",
                fontFamily: this.props.theme.font.primary,
              }),
              React.createElement("text", {
                ref: this.rowValueRefs[i],
                visibility: "hidden",
                textAnchor: "end",
                fill: color.text,
                fontSize: "10",
                fontWeight: "600",
                fontFamily: this.props.theme.font.primary,
              }),
            ),
          ),
        ),
    );
  }
}

const Line = withTheme(LineBase);

/* PERIOD SWITCHER */
const PeriodButton = styled.button`
  isolation: isolate;
  perspective: 1px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 1 auto;
  height: ${({ theme }) => theme.spacing.large * 1.5}rem;
  min-width: 3.5rem;
  padding: 0 ${({ theme }) => theme.spacing.small}rem;
  margin: 0;
  border: none;
  background: transparent;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.875rem;
  text-align: center;
  text-decoration: none;
  letter-spacing: 0.125em;
  cursor: pointer;
  appearance: none;
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  transition:
    background 0.2s ease,
    color 0.2s ease;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    height: 2px;
    width: ${({ active }) => (active ? "60%" : "0%")};
    background-color: ${({ theme }) => theme.color.text};
    transition: width 0.3s ease;
    border-radius: 2px;
  }

  &:focus {
    outline: none;
  }

  &:hover:not(:focus-visible) {
    background: ${({ theme, active }) =>
      active
        ? "transparent"
        : theme.color.bg === "#ffffff"
          ? "rgba(0, 0, 0, 0.05)"
          : "rgba(255, 255, 255, 0.08)"};
  }

  &:focus-visible {
    background: ${({ theme }) =>
      theme.color.bg === "#ffffff"
        ? "rgba(0, 0, 0, 0.05)"
        : "rgba(255, 255, 255, 0.08)"};
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    flex: 0 0 auto;
    min-width: 3rem;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
  }
`;

const PeriodText = styled.span`
  color: ${({ theme, active }) =>
    active ? theme.color.text : theme.color.textSecondary};
  user-select: none;
  font-weight: ${({ active, theme }) =>
    active ? theme.fontWeight.medium : theme.fontWeight.regular};
  transition:
    color 0.2s ease,
    font-weight 0.2s ease;
  position: relative;
  z-index: 1;
`;

class PeriodItem extends PureComponent {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "handleClick", (e) => {
      const { onClick, value } = this.props;
      if (typeof onClick === "function") {
        onClick(e, value);
      }
    });
  }

  render() {
    const { active, children, title } = this.props;

    return React.createElement(
      PeriodButton,
      { active: active, onClick: this.handleClick, title: title },
      React.createElement(PeriodText, { active: active }, children),
    );
  }
}

_defineProperty(PeriodItem, "defaultProps", {
  active: false,
  children: null,
  onClick: null,
  value: null,
  title: null,
});

const PeriodSwitcherWrapper = styled.div`
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  flex: 0 0 auto;
  width: 100%;
  max-width: ${({ theme }) => theme.scale * 148}rem;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.medium}rem
    ${({ theme }) => theme.spacing.medium}rem
    ${({ theme }) => theme.spacing.large}rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    justify-content: center;
    gap: ${({ theme }) => theme.spacing.xsmall}rem;
    padding-bottom: ${({ theme }) => theme.spacing.medium}rem;
  }
`;

class PeriodSwitcher extends PureComponent {
  render() {
    const { onChange, options, value } = this.props;

    return React.createElement(
      PeriodSwitcherWrapper,
      { "data-tour": "period" },
      Array.isArray(options) &&
        options.map((o) =>
          React.createElement(
            PeriodItem,
            {
              active: value === o.value,
              key: o.value,
              onClick: onChange,
              value: o.value,
              title: o.title,
            },
            o.label,
          ),
        ),
    );
  }
}

_defineProperty(PeriodSwitcher, "defaultProps", {
  onChange: null,
  options: [],
  value: null,
});

/* OVERVIEW */
const OverviewItemButton = styled.button`
  padding: ${({ theme }) =>
    `${theme.spacing.small}rem ${theme.spacing.medium}rem`};
  flex: 1 1 calc(50% - ${({ theme }) => theme.spacing.medium}rem);
  min-width: 0;
  border: none;
  text-align: center;
  background: transparent;
  font-family: ${({ theme }) => theme.font.primary};
  text-decoration: none;
  cursor: pointer;
  color: ${({ theme }) => theme.color.text};
  appearance: none;
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  transition: background 0.2s ease;

  &:hover {
    background: ${({ theme }) =>
      theme.color.bg === "#ffffff"
        ? "rgba(0, 0, 0, 0.05)"
        : "rgba(255, 255, 255, 0.08)"};
  }

  &:focus {
    outline: none;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    min-width: 10rem;
  }
`;

// A refreshed price tints green/red for a moment, so a tab left open
// visibly reacts when the number moves. Colour only — no layout shift.
const priceFlashUp = keyframes`
  0%   { color: inherit; }
  15%  { color: var(--pt-flash-up); }
  100% { color: inherit; }
`;

const priceFlashDown = keyframes`
  0%   { color: inherit; }
  15%  { color: var(--pt-flash-down); }
  100% { color: inherit; }
`;

const Value = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.text};
  --pt-flash-up: ${({ theme }) => theme.color.chartLineGreen};
  --pt-flash-down: ${({ theme }) => theme.color.chartLineRed};
  animation: ${({ flash }) =>
      flash === "up"
        ? priceFlashUp
        : flash === "down"
          ? priceFlashDown
          : "none"}
    1.1s ease-out;
`;

const Label = styled.div`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  line-height: 1.3333;
  letter-spacing: 0.125em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const OverviewItem = ({ children, label, onClick, title, dataTour, flash }) =>
  React.createElement(
    OverviewItemButton,
    { onClick, title: title, "data-tour": dataTour },
    React.createElement(
      Value,
      // Remounting on each flash restarts the CSS animation; without the
      // key a second move in the same direction wouldn't re-trigger it
      { flash, key: flash ? `${flash}-${children}` : "static" },
      children || React.createElement(Fragment, null, "\u00A0"),
    ),
    React.createElement(Label, null, label),
  );

OverviewItem.defaultProps = {
  children: null,
  label: "",
  onClick: null,
  title: null,
  dataTour: null,
  flash: null,
};

const OverviewWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: stretch;
  flex-wrap: nowrap;
  gap: ${({ theme }) => theme.spacing.medium}rem;
  flex: 0 0 auto;
  width: 100%;
  max-width: ${({ theme }) => theme.scale * 148}rem;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.large}rem
    ${({ theme }) => theme.spacing.medium}rem;
  color: ${({ theme }) => theme.color.text};
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    justify-content: flex-start;
    padding: ${({ theme }) => theme.spacing.medium}rem
      ${({ theme }) => theme.spacing.small}rem;
  }
`;

class Overview extends PureComponent {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "state", {
      calcPercentage: false,
      countValue: null, // non-null only while the intro count-up is running
      flash: null, // 'up' | 'down' for ~1s after the price moves
    });

    _defineProperty(this, "togglePercentage", () => {
      this.setState((prevState) => ({
        calcPercentage: !prevState.calcPercentage,
      }));
    });

    // One-time count-up to the first real price (intro flourish only)
    _defineProperty(this, "maybeCountUp", () => {
      if (this._counted) return;
      const target = this.props.currentValue;
      if (typeof target !== "number" || !isFinite(target)) return;
      this._counted = true;
      const start =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 700);
        const eased = 1 - Math.pow(1 - t, 3);
        this.setState({ countValue: target * eased });
        if (t < 1) {
          this._rafId = requestAnimationFrame(tick);
        } else {
          this.setState({ countValue: null });
        }
      };
      this._rafId = requestAnimationFrame(tick);
    });
  }

  componentDidMount() {
    this.maybeCountUp();
  }

  componentDidUpdate(prevProps) {
    this.maybeCountUp();
    // Flash on a real price move of the same coin — not on coin switches
    // (that's a different number, not a change) and not on the first value
    if (
      prevProps.coin === this.props.coin &&
      typeof prevProps.currentValue === "number" &&
      typeof this.props.currentValue === "number" &&
      this.props.currentValue !== prevProps.currentValue
    ) {
      const dir = this.props.currentValue > prevProps.currentValue ? "up" : "down";
      clearTimeout(this._flashTimer);
      this.setState({ flash: dir });
      this._flashTimer = setTimeout(
        () => this.setState({ flash: null }),
        1100,
      );
    }
  }

  componentWillUnmount() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    clearTimeout(this._flashTimer);
  }

  render() {
    const {
      coin,
      currentValue,
      cycleCoinIndex,
      valueHistory,
      decimalPlaces,
      separatorFormat,
      currency,
    } = this.props;
    const { calcPercentage, countValue } = this.state;
    const currencySymbol = getCurrencySymbol(currency || DEFAULT_CURRENCY);
    // During the intro count-up show the animating value; otherwise the real price
    const displayValue = countValue != null ? countValue : currentValue;

    const delta = calcPercentage
      ? formatNumberString(
          derivePercentDelta(currentValue, valueHistory),
          "%",
          false,
          true,
          decimalPlaces,
          separatorFormat,
        )
      : formatNumberString(
          deriveValueDelta(currentValue, valueHistory),
          currencySymbol,
          false,
          false,
          decimalPlaces,
          separatorFormat,
        );

    return React.createElement(
      OverviewWrapper,
      null,
      React.createElement(
        OverviewItem,
        {
          onClick: this.props.cycleCoinIndex,
          label: `${coin} Price`,
          title: "Next coin",
          dataTour: "price",
          flash: this.state.flash,
        },
        formatNumberString(
          displayValue,
          currencySymbol,
          true,
          false,
          decimalPlaces,
          separatorFormat,
        ),
      ),
      React.createElement(
        OverviewItem,
        {
          onClick: this.togglePercentage,
          label: `${calcPercentage ? "Percent" : "Price"} Change`,
          title: calcPercentage ? "Switch to price change" : "Switch to percent change",
          dataTour: "change",
        },
        delta,
      ),
    );
  }
}

