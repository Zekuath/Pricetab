/* LINE COMPONENT */
const LINE_DUMMY = Array(2)
  .fill()
  .map((_, i) => ({ price: 0, time: new Date(2010 + i) }));

const PADDING = 24;

/* The board's limits, in squares rather than in fractions of the width: a
 * limit written as a percentage would mean something different on every
 * window; written in squares it means the same thing everywhere, which is
 * that there is always a chart left to read and always somewhere to point.
 *
 * They are not the same number, and the reason is the part-column.
 *
 * History: one square. It was two, which is what stopped the line two squares
 * short of the left edge when you dragged it as far as it would go — the drag
 * ran out of travel with a strip of chart nobody had asked to keep.
 *
 * Board: two, and it cannot be one. The lattice is anchored to the clock, so
 * "now" falls somewhere *inside* a column and `cellAt` refuses that column —
 * half of it has already happened. One square of board is therefore that
 * part-column and nothing else: measured at 1280×800 with a 64.5px pitch,
 * dragging to a one-square board left **zero** callable squares, which is a
 * board you cannot call on. Two is the smallest number that guarantees one
 * whole square to the right of "now" whatever the anchor does — so on this
 * side, two squares *is* one square you can use. */
const MIN_HISTORY_CELLS = 1;
const MIN_BOARD_CELLS = 2;

/* What one square is worth in clock time — a rung on this ladder, and nothing
 * else.
 *
 * The board used to take the opposite route: pick a comfortable pixel width
 * first, then read off however many minutes happened to fit in it. That number
 * came out of the data (`span / width * pitch`), so it moved whenever the data
 * did — a square was 2m41s on one refresh and 2m44s on the next, and every
 * range had its own accidental figure. A call is a rectangle of *real time*, so
 * a lattice measured in accidental minutes cannot hold one: come back to the
 * range an hour later and the box no longer fits the squares it was drawn on.
 *
 * So the duration is chosen from round numbers people already think in, the
 * pixel width follows from it, and the price step is then sized to that same
 * width — the squares stay square, and one square stays 15 minutes for as long
 * as you are on that range. Every rung divides the day (or is a whole number of
 * weeks), so the boundaries land on the clock rather than wherever the series
 * happens to start. */
const MINUTE = 60e3;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/* No rung is more than twice the one below it, so the square the ladder hands
 * back is never more than about 40% off the comfortable size — a grid you can
 * still read. Wider gaps were tried first (no 3 min, no 4 days) and the hour
 * range landed on five-minute squares 107px across on a 495px chart: correct,
 * held, and too big to point at. */
const CELL_SPANS = [
  15e3, 30e3,
  MINUTE, 2 * MINUTE, 3 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE,
  30 * MINUTE,
  HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 8 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, 3 * DAY, 4 * DAY,
  WEEK, 2 * WEEK, 4 * WEEK, 8 * WEEK, 13 * WEEK, 26 * WEEK, 52 * WEEK,
  104 * WEEK,
];
/* How far the held square may drift from the comfortable one before it is
 * re-chosen. The rungs are never more than 2× apart, so a band of roughly
 * ±60% keeps one rung's worth of slack either side: the choice holds through
 * an ordinary refresh and only re-steps when the range genuinely changed. */
const CELL_KEEP_LO = 0.62;
const CELL_KEEP_HI = 1.65;
/* The thinnest sliced row the top fade will ramp over. Below this there is no
 * room for a ramp — see `fadeEnd`, which is the only caller. */
const FADE_MIN = 14;

/* The big celebration, in numbers. Three shells rather than one, because one
 * is a pop and three is an occasion; twenty sparks because at twelve the ring
 * reads as a star and at forty it reads as a smudge. The rise is deliberately
 * slower than the fall — a shell that goes up fast and hangs is a firework, one
 * that goes up slowly and drops is a flare. */
const FIREWORK_SHELLS = 3;
const FIREWORK_SPARKS = 20;
const FIREWORK_RISE_MS = 430;
const FIREWORK_FALL_MS = 760;
const isCellSpan = (ms) => CELL_SPANS.some((v) => Math.abs(v - ms) < 1);
/* How long the latch takes to close, and how long the draft's own pulse is
 * suppressed for so the two never play over each other. */
const LOCK_PULSE_MS = 520;
/* How close to the "now" line counts as grabbing it — 12 each way, so the band
 * is 24px wide. It was 10, which put a 20px target on a 1px line: inside the
 * letter of "big enough to hit" and outside the spirit of it. */
const NOW_GRAB = 12;
/* One press of an arrow key moves the board by a square. The line is a slider
 * and a slider that cannot be moved from the keyboard is a slider only some
 * people have — and this one has no other control anywhere: the stepper that
 * used to set it was removed when the drag replaced it. */
const NOW_STEP_CELLS = 1;
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
  /* Dragging the "now" line is a drag across a surface covered in <text>, and
     a drag across text selects it: the axis labels and the CALLED tags came up
     highlighted in the middle of the gesture. Nothing on a chart is text
     anyone copies, so the selection is pure artefact. */
  user-select: none;
  -webkit-user-select: none;
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
    // The stop that decides where the top fade finishes — moved with the pitch
    _defineProperty(this, "fadeStopRef", createRef());
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
    // The calls-mode third line: what naming this square would be claiming
    _defineProperty(this, "hoverNoteRef", createRef());
    // One label + one value node per OHLC row, written to imperatively
    this.rowLabelRefs = CROSSHAIR_ROWS.map(() => createRef());
    this.rowValueRefs = CROSSHAIR_ROWS.map(() => createRef());
    this._askedForOhlc = false;
    this.scaled = null; // pixel-space points, index-aligned with props.prices
    this.zoomAnim = null;         // { from, start } while the scale travels
    this._zoomUi = null;          // the board's own zoom control, made once
    this.zoomRaf = 0;
    this.hoverRaf = 0;
    this.hoverX = 0;
    this.hoverY = 0;
    this.hoverIndex = -1;
    this.hoverCellKey = null;     // which square the readout is describing
    this.nowDrag = null;          // { from, moved } while the now line is held
    this.suppressClick = false;   // the click that ends a drag is not a click
    // Kept and rewritten rather than rebuilt — see `poolNode`
    this._gridLines = { list: [], at: 0 };
    this._gridLabels = { list: [], at: 0 };
    this._callBoxes = { list: [], at: 0 };
    this._callTags = { list: [], at: 0 };
    // The leading-edge bar on the first call in a contested column
    this._callMarks = { list: [], at: 0 };
    this._nowLine = null;
    this._nowGrip = null;
    this.gridX = [];              // vertical line positions, px
    this.gridY = [];              // horizontal line positions, px
    /* The lattice's memory, and why it is keyed rather than single-valued.
     * A square is a unit someone reads a range in, so it has to be the same
     * unit every time they come back to that range — kept per period for the
     * clock and per coin/currency/period for the price, since a step from a
     * different order of magnitude is worse than none. */
    this._cellMs = {};            // period → ms per square
    this._boards = {};            // coin|currency|period → { step, base }
    this.cellMs = 0;              // the drawn lattice's own step, in ms
    this.cellStep = 0;            // …and in price
    this.gridOriginTime = null;   // the clock instant `gridOriginX` stands for

    // Unique ids so the gradient/clip defs never collide in the DOM
    const uid = Math.random().toString(36).slice(2, 9);
    this.gradId = "ptArea_" + uid;
    this.clipId = "ptReveal_" + uid;
    this.fadeId = "ptFade_" + uid;
    this.fadeGradId = "ptFadeGrad_" + uid;

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

    /* The "now" line is a handle.
     *
     * How much future the chart reserves is a number between one and ten, set
     * from the calls panel with a + and a −. But the thing that number moves
     * is *on the chart*, a metre wide, and people reach for it — the line
     * between what happened and what has not is exactly the edge you want to
     * pull. So it can be pulled: dragging it left buys more squares to call,
     * right gives the room back to the price line.
     *
     * It is the same setting, not a second one. The drag reports the count it
     * lands on and the panel's + and − keep working; there is nothing new to
     * store and nothing that can disagree. And it snaps, because the strip has
     * only ten legal widths — the line goes where the geometry can put it,
     * which is also what stops a drag from producing a board with half a
     * square on the end of it. */
    _defineProperty(this, "nowLineAt", (x) =>
      this.props.predict &&
      typeof this.props.onFutureShareChange === "function" &&
      this.nowX > 0 &&
      Math.abs(x - this.nowX) <= NOW_GRAB,
    );

    _defineProperty(this, "handlePointerDown", (e) => {
      if (!this.nowLineAt(e.offsetX)) return;
      this.nowDrag = { from: e.offsetX, x: e.offsetX, moved: false };
      const svg = this.svgRef.current;
      if (svg && svg.setPointerCapture) {
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          /* a pointer that has already gone; the drag still works off move */
        }
      }
      // A draft belongs to the board it was made on, and the board is about
      // to be rebuilt under it
      this.draftAt = null;
      this.clearHover();
      this.updateCalls();
    });

    /* Where the line is allowed to be, in pixels from the left. The drag and
     * the arrow keys both go through this — two callers computing the same
     * limits separately is how a keyboard user ends up able to reach a board
     * the mouse cannot, or the other way round. */
    _defineProperty(this, "nowLimits", () => {
      const pitch = this.boardPitch();
      const least = MIN_BOARD_CELLS * pitch;
      const most = Math.max(least, this.width - MIN_HISTORY_CELLS * pitch);
      return { pitch, least, most };
    });

    /* Move the board by whole squares, from the keyboard. `+1` means more
     * board (the line goes left), which is what "more room to call" means and
     * therefore what the right arrow should do — the value the slider reports
     * is squares of board, not pixels of history. */
    _defineProperty(this, "nudgeNow", (cells) => {
      if (!this.width || typeof this.props.onFutureShareChange !== "function") {
        return;
      }
      const { pitch, least, most } = this.nowLimits();
      if (!(pitch > 0)) return;
      const future = Math.min(
        most,
        Math.max(least, this.futureWidth() + cells * pitch),
      );
      const share = future / this.width;
      if (share !== this.props.futureShare) {
        this.props.onFutureShareChange(share);
      }
    });

    /* The arrow keys, on the focused handle.
     *
     * Right is more board, left is more history — the direction the line
     * itself travels. Home and End go to the two limits, which are the same
     * limits the drag clamps to, so the keyboard cannot reach a board the
     * pointer cannot. Every one of these is prevented from also scrolling the
     * panel behind it. */
    _defineProperty(this, "handleNowKey", (e) => {
      const { least, most } = this.nowLimits();
      let cells;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") cells = NOW_STEP_CELLS;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") cells = -NOW_STEP_CELLS;
      else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        e.stopPropagation();
        const future = e.key === "End" ? most : least;
        if (this.width) this.props.onFutureShareChange(future / this.width);
        return;
      } else {
        return;
      }
      e.preventDefault();
      /* The chart's own arrow keys walk the coin list. While the handle has
       * focus the arrows belong to it — anything else would move the coin out
       * from under the board you are sizing. */
      e.stopPropagation();
      this.nudgeNow(cells);
    });

    _defineProperty(this, "dragNowTo", (x) => {
      if (!this.width) return;
      if (Math.abs(x - this.nowDrag.from) > 2) this.nowDrag.moved = true;
      /* Straight to where the pointer is, as a share of the width — held
       * inside the same limits the geometry enforces, so what is stored is
       * always something the chart can honour. Storing the raw pointer instead
       * and letting `futureWidth` clamp it left dead travel at both ends: at
       * the far left the share kept climbing past what was drawable, and
       * dragging back out of it moved nothing for the first inch. */
      const { least, most } = this.nowLimits();
      const future = Math.min(most, Math.max(least, this.width - x));
      const share = future / this.width;
      if (share !== this.props.futureShare) this.props.onFutureShareChange(share);
    });

    _defineProperty(this, "applyDrag", () => {
      this.dragRaf = 0;
      if (this.nowDrag) this.dragNowTo(this.nowDrag.x);
    });

    _defineProperty(this, "handlePointerUp", (e) => {
      if (!this.nowDrag) return;
      if (this.dragRaf) {
        cancelAnimationFrame(this.dragRaf);
        this.dragRaf = 0;
      }
      // Whatever the last frame missed, honour it before letting go
      this.dragNowTo(this.nowDrag.x);
      /* A drag that moved must not also count as a click. The click event
       * arrives after the pointer is released, and on this chart a click is
       * how a call is drafted — so letting go of the line would have started
       * one. */
      this.suppressClick = this.nowDrag.moved;
      this.nowDrag = null;
      const svg = this.svgRef.current;
      if (svg && svg.releasePointerCapture && e && svg.hasPointerCapture(e.pointerId)) {
        svg.releasePointerCapture(e.pointerId);
      }
      this.updatePath();   // one last redraw, animated again now the hand is off
    });

    /* Pointer handling: record the position, do the work once per frame */
    _defineProperty(this, "handlePointerMove", (e) => {
      if (this.nowDrag) {
        /* One redraw per frame, not one per pointer event. A trackpad fires
         * several moves a frame and each one that crossed a square rebuilt the
         * chart through React — the work piled up behind the hand and the line
         * arrived late. Same rule the crosshair has always used. */
        this.nowDrag.x = e.offsetX;
        if (!this.dragRaf) this.dragRaf = requestAnimationFrame(this.applyDrag);
        return;
      }
      /* Say the line can be taken hold of, in the one way a pointer reads
       * without being told: the cursor. The line also comes up to full
       * strength under it, so the invitation is visible when the pointer is
       * somewhere else on the way to it. */
      const svg = this.svgRef.current;
      const grabbable = this.nowLineAt(e.offsetX);
      if (svg && this._grabbable !== grabbable) {
        this._grabbable = grabbable;
        svg.style.cursor = grabbable ? "ew-resize" : "";
        const grid = this.gridRef.current;
        const nowLine = grid ? grid.querySelector(".pt-now-line") : null;
        if (nowLine) {
          nowLine.setAttribute("opacity", grabbable ? "1" : "0.65");
          nowLine.setAttribute("stroke-width", grabbable ? "2" : "1");
        }
        const grip = grid ? grid.querySelector(".pt-now-grip") : null;
        if (grip) grip.setAttribute("opacity", grabbable ? "1" : "0.75");
        /* On the handle, the chart is not being read — it is being operated.
         * The crosshair kept drawing under the pointer, so reaching for the
         * line put a price readout over the very label the line was trying to
         * show you, and lit a square you were not pointing at. */
        this.clearHover();
        this.updateGrid();
      }
      if (grabbable) return;
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

    /* Everything the pointer draws, put away.
     *
     * Two things need this and they are not the same event: leaving the chart,
     * and taking hold of the "now" line — during a drag the pointer is on the
     * line rather than on a square, and a readout left behind describes a box
     * that the redraw has already moved out from under it. */
    _defineProperty(this, "clearHover", () => {
      this.hoverIndex = -1;
      this.hoverCellKey = null;
      /* Park the pointer off the chart, not just wherever it was last seen.
       * Every hover drawing reads these two numbers, so leaving them at the
       * last position inside the plot meant anything that redrew afterwards —
       * a click, a resize — could bring the highlight back with the pointer
       * nowhere near it. Out of bounds, and drawGridCell's own guard hides
       * the lot. */
      this.hoverX = -1;
      this.hoverY = -1;
      this.hoverCell = null;
      if (this.hoverRef.current) {
        this.hoverRef.current.setAttribute("visibility", "hidden");
      }
      if (this.gridCellRef.current) {
        this.gridCellRef.current.setAttribute("visibility", "hidden");
      }
      /* The label that says what a click would do. It was the one piece of
       * the hover drawing this never hid, so on the way out the square went
       * and CALL IT stayed — an invitation floating over a chart with no
       * pointer on it, still there minutes later. */
      if (this.cellHintRef.current) {
        this.cellHintRef.current.setAttribute("visibility", "hidden");
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
      if (this.hoverNoteRef.current) {
        this.hoverNoteRef.current.setAttribute("visibility", "hidden");
      }
    });

    _defineProperty(this, "handlePointerLeave", () => {
      if (this.hoverRaf) {
        cancelAnimationFrame(this.hoverRaf);
        this.hoverRaf = 0;
      }
      /* A drag that leaves the window is over. Without this the flag survived
       * — the pointer came back somewhere else on the chart and the line
       * followed it, having never been let go of. */
      if (this.nowDrag) {
        this.nowDrag = null;
        this.suppressClick = false;
        if (this.dragRaf) {
          cancelAnimationFrame(this.dragRaf);
          this.dragRaf = 0;
        }
        this.updatePath();
      }
      this._grabbable = false;
      this.clearHover();
    });

    /* Which candle the pointer is over. Bars are evenly spaced, so the slot
     * is arithmetic — and using the slot rather than the nearest centre
     * means the whole bar is hoverable, not just the half nearest its axis. */
    _defineProperty(this, "candleIndexAt", (x) => {
      const scale = this.candleScale;
      const bars = scale && scale.bars;
      if (!bars || !bars.length) return -1;
      // Read off the layout rather than rebuilding it: the bars no longer
      // always start at PADDING and end at the right-hand edge
      const step = scale.step;
      if (!(step > 0)) return -1;
      const i = Math.floor((x - scale.x0) / step);
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
      /* Straight there while the "now" line is being dragged. The dot moves on
       * a 300ms transition, which is right when the price arrives — it reads
       * as the price moving — and wrong under a hand: the chart slid with the
       * pointer and the dot crawled after it, ending up somewhere in the
       * middle of the plot with the line nowhere near it. `interrupt` because
       * a transition already in flight would otherwise carry on painting over
       * the position set here. */
      if (first || this.nowDrag) {
        select(dot).interrupt();
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
      /* Boxes and their tags are kept and rewritten, like the mesh. The
       * transient things below — the latch, the draft, the burst — are still
       * made and thrown away, because they are animated, short-lived and at
       * most one of each. */
      this._callBoxes.at = 0;
      this._callTags.at = 0;
      this._callMarks.at = 0;
      /* Two groups, made once and in this order: the kept boxes underneath and
       * the transient drawings above them. Pooled nodes are appended as the
       * pool grows, so without a group of its own the draft would end up
       * *under* a box created after it — z-order in SVG is document order, and
       * the thing you are in the middle of doing has to be on top. */
      if (!this._boxLayer) {
        const ns = "http://www.w3.org/2000/svg";
        this._boxLayer = document.createElementNS(ns, "g");
        this._extraLayer = document.createElementNS(ns, "g");
        layer.appendChild(this._boxLayer);
        layer.appendChild(this._extraLayer);
      }
      while (this._extraLayer.firstChild) {
        this._extraLayer.removeChild(this._extraLayer.firstChild);
      }
      if (!this.props.predict || !this.timeToX || !this.priceToY) {
        this.hideRest(this._callBoxes);
        this.hideRest(this._callTags);
        this.hideRest(this._callMarks);
        return;
      }

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
      /* Which call owns each column.
       *
       * Several calls can share a column — same minutes, different price
       * bands — and they are not equal: the first one placed there is the
       * claim, the rest are hedges around it. So the earliest `placed` in a
       * column is marked, and the others step back.
       *
       * Only when the column is actually contested. A mark that every lone
       * call carries says nothing about being first; it has to appear exactly
       * where there is something to be first *of*. Open calls only — a settled
       * one is an answer, and the future does not compete with the past. */
      const columns = callColumns(
        calls.filter(
          (c) =>
            c.coin === this.props.coin &&
            c.currency === this.props.currency &&
            c.period === this.props.period,
        ),
      );

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

          /* Off the screen entirely is not drawn. After the window pans
           * away from an old call — a fall of twenty squares takes it right
           * off the top — the box is still a rectangle the browser has to
           * clip on every frame, and there can be forty of them. */
          if (
            Math.max(x1, x2) < -1 ||
            Math.min(x1, x2) > this.width + 1 ||
            Math.max(y1, y2) < -1 ||
            Math.min(y1, y2) > this.height + 1
          ) {
            return;
          }

          const hit = c.result === "hit";
          const miss = c.result === "miss";
          const colour = hit
            ? color.chartLineGreen
            : miss
              ? color.chartLineRed
              : tint;

          /* First in a contested column, or one of the rest. A settled call is
           * neither — it is already answered, so it is drawn as it always was. */
          const column = c.result ? null : columns.get(c.target);
          const contested = Boolean(column && column.count > 1);
          const first = !c.result && isLeadingCall(c, columns);
          const rest = contested && !first;

          const bx = Math.min(x1, x2);
          const by = Math.min(y1, y2);
          const bw = Math.abs(x2 - x1);
          const bh = Math.abs(y2 - y1);

          const box = this.poolNode(this._callBoxes, "rect", this._boxLayer);
          box.setAttribute("x", bx);
          box.setAttribute("y", by);
          box.setAttribute("width", bw);
          box.setAttribute("height", bh);
          box.setAttribute("fill", colour);
          box.setAttribute(
            "fill-opacity",
            hit ? "0.14" : miss ? "0.05" : first ? "0.13" : rest ? "0.04" : "0.07",
          );
          box.setAttribute("stroke", colour);
          box.setAttribute(
            "stroke-opacity",
            miss ? "0.45" : rest ? "0.4" : "0.8",
          );
          box.setAttribute("stroke-width", first ? "1.6" : "1");

          /* The mark itself: a bar down the leading edge of the box.
           *
           * A bar rather than a brighter colour, because colour on this chart
           * already means the answer (green called it, red missed) and a third
           * meaning in the same channel is one too many. It is drawn only on a
           * contested column, so its presence *is* the message. */
          if (first) {
            const mark = this.poolNode(this._callMarks, "rect", this._boxLayer);
            mark.setAttribute("x", bx);
            mark.setAttribute("y", by);
            mark.setAttribute("width", "3");
            mark.setAttribute("height", bh);
            mark.setAttribute("fill", colour);
            mark.setAttribute("fill-opacity", "0.9");
          }
          // Settled ones stop being dashed: the question is closed. Written
          // both ways round — a reused node carries the last one's dashes
          if (c.result) box.removeAttribute("stroke-dasharray");
          else box.setAttribute("stroke-dasharray", "3 3");

          /* The tag sits *above* its box, not inside it. A call keeps the
           * width it had when it was made, so an old one can be narrower
           * than today's squares — and inside the box the label was clipped
           * by a border it had no reason to be inside. Above, it is never
           * cut, and it still reads as belonging to the box under it. */
          const tag = this.poolNode(this._callTags, "text", this._boxLayer);
          const boxTop = Math.min(y1, y2);
          tag.setAttribute("x", Math.min(x1, x2));
          tag.setAttribute("y", boxTop > 12 ? boxTop - 4 : Math.max(y1, y2) + 11);
          tag.setAttribute("fill", colour);
          tag.setAttribute("fill-opacity", miss ? "0.75" : "1");
          tag.setAttribute("font-size", "9");
          tag.setAttribute("font-family", font.primary);
          tag.setAttribute("letter-spacing", "0.08em");
          const text = hit
            ? "CALLED IT"
            : miss
              ? "MISSED"
              : first
                ? "CALLED · 1ST"
                : "CALLED";
          if (tag.textContent !== text) tag.textContent = text;
        });

      this.hideRest(this._callBoxes);
      this.hideRest(this._callTags);
      this.hideRest(this._callMarks);

      /* The latch closing.
       *
       * The second click is the moment the claim becomes a record, and until
       * now nothing marked it: the dashed draft was simply replaced by a
       * solid box on the next redraw, which reads as a repaint rather than as
       * something being committed. So a small square appears in the middle of
       * the cell and grows out to its walls, and the walls flash as it lands
       * — a bolt sliding home. It plays once, on the square that was called,
       * and then it is gone; a repeating animation would keep drawing the eye
       * back to a question that is already closed.
       */
      const pulse = this.lockPulse;
      if (pulse) {
        const px1 = this.timeToX(new Date(pulse.target - pulse.span));
        const px2 = this.timeToX(new Date(pulse.target));
        const py1 = this.priceToY(pulse.hi);
        const py2 = this.priceToY(pulse.lo);
        if ([px1, px2, py1, py2].every(isFinite)) {
          const bx = Math.min(px1, px2);
          const by = Math.min(py1, py2);
          const bw = Math.abs(px2 - px1);
          const bh = Math.abs(py2 - py1);

          const grow = document.createElementNS(ns, "rect");
          grow.setAttribute("x", bx + bw / 2);
          grow.setAttribute("y", by + bh / 2);
          grow.setAttribute("width", 0);
          grow.setAttribute("height", 0);
          grow.setAttribute("fill", tint);
          grow.setAttribute("fill-opacity", "0.30");
          grow.setAttribute("stroke", tint);
          grow.setAttribute("stroke-width", "1.5");
          this._extraLayer.appendChild(grow);
          select(grow)
            .transition()
            .duration(LOCK_PULSE_MS)
            .ease(easeCubicOut)
            .attr("x", bx)
            .attr("y", by)
            .attr("width", bw)
            .attr("height", bh)
            .attr("fill-opacity", 0.08)
            .attr("stroke-opacity", 0)
            .remove();

          // The walls answering: a brief bright outline that settles into the
          // ordinary locked border.
          const flash = document.createElementNS(ns, "rect");
          flash.setAttribute("x", bx);
          flash.setAttribute("y", by);
          flash.setAttribute("width", bw);
          flash.setAttribute("height", bh);
          flash.setAttribute("fill", "none");
          flash.setAttribute("stroke", tint);
          flash.setAttribute("stroke-width", "2");
          flash.setAttribute("stroke-opacity", "0");
          this._extraLayer.appendChild(flash);
          select(flash)
            .transition()
            .delay(LOCK_PULSE_MS * 0.55)
            .duration(LOCK_PULSE_MS * 0.45)
            .ease(easeCubicOut)
            .attr("stroke-opacity", 0.9)
            .transition()
            .duration(260)
            .attr("stroke-opacity", 0)
            .remove();
        }
      }

      // The draft: drawn like a call that has not been made yet, and asking
      // for the second click in as many words
      const draft = this.draftCell();
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
          this._extraLayer.appendChild(box);

          // The square inside it, growing out to the walls
          const fill = document.createElementNS(ns, "rect");
          fill.setAttribute("class", "pt-draft-fill");
          fill.setAttribute("x", bx);
          fill.setAttribute("y", by);
          fill.setAttribute("width", bw);
          fill.setAttribute("height", bh);
          fill.setAttribute("fill", color.chartLineGreen);
          this._extraLayer.appendChild(fill);

          /* The draft always says what it is waiting for.
           *
           * This used to be dropped whenever the box was under 44px wide —
           * and raising the square count makes every box narrower, so past
           * about four squares the first click produced a silent outline and
           * the second click appeared to come out of nowhere. A prompt that
           * disappears exactly when the squares get harder to read is the
           * wrong thing to drop. It goes inside when it fits and sits above
           * the box when it does not, which is the same convention the
           * CALLED tags already use. */
          const tag = document.createElementNS(ns, "text");
          const inside = bw > 44 && bh > 16;
          tag.setAttribute("fill", color.text);
          tag.setAttribute("font-size", "9");
          tag.setAttribute("font-family", font.primary);
          tag.setAttribute("letter-spacing", "0.14em");
          tag.textContent = "LOCK?";
          if (inside) {
            tag.setAttribute("x", bx + bw / 2);
            tag.setAttribute("y", by + bh / 2);
            tag.setAttribute("text-anchor", "middle");
            tag.setAttribute("dominant-baseline", "central");
          } else {
            tag.setAttribute("x", bx);
            tag.setAttribute("y", by > 12 ? by - 4 : by + bh + 11);
          }
          this._extraLayer.appendChild(tag);
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
          .attr("stroke-opacity", 0)
          .remove();
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
          .attr("opacity", 0)
          .remove();
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
          .attr("opacity", 0)
          .remove();
      }
    });

    /* The bigger one, for a win that was actually difficult.
     *
     * `burst` celebrates *the box* — it is precise, it is over in a second,
     * and it is right for the ordinary case. It also needs the box to be on
     * the chart, and there are two wins where it is not the right answer:
     *
     *   · the first call you ever get right, which is the moment the whole
     *     thing either becomes a habit or does not, and
     *   · a win with calls switched off, where the board is not drawn at all
     *     and nothing is announced — so this is the only thing that says it.
     *
     * …plus the one that is simply harder: the leading call in a contested
     * column, the claim everything else was hedging against.
     *
     * Shells, not confetti. Three of them, launched from the foot of the
     * chart at staggered moments, each rising and then opening into a ring of
     * sparks that fall a little as they fade. Still the chart's own green and
     * still thin strokes — the house has no emoji, and a celebration that
     * looked like a different product would cheapen the only moment this
     * feature has. It is drawn across the whole chart rather than at a point
     * because it is about the record, not about one square.
     */
    _defineProperty(this, "fireworks", () => {
      const layer = this.burstRef.current;
      if (!layer || !this.width || !this.height) return;
      const { color } = this.props.theme;
      const tint = color.chartLineGreen;
      const ns = "http://www.w3.org/2000/svg";
      const made = [];

      for (let s = 0; s < FIREWORK_SHELLS; s++) {
        // Spread across the middle two thirds, so no shell opens in a corner
        const cx = this.width * (0.22 + 0.28 * s);
        const cy = this.height * (0.3 + (s % 2) * 0.16);
        const delay = s * 260;

        // The shell on its way up: a short streak that shortens as it slows
        const trail = document.createElementNS(ns, "line");
        trail.setAttribute("x1", cx);
        trail.setAttribute("y1", this.height);
        trail.setAttribute("x2", cx);
        trail.setAttribute("y2", this.height + 18);
        trail.setAttribute("stroke", tint);
        trail.setAttribute("stroke-width", "1.4");
        trail.setAttribute("stroke-linecap", "round");
        layer.appendChild(trail);
        made.push(trail);
        select(trail)
          .attr("opacity", 0)
          .transition()
          .delay(delay)
          .duration(0)
          .attr("opacity", 0.75)
          .transition()
          .duration(FIREWORK_RISE_MS)
          .ease(easeCubicOut)
          .attr("y1", cy)
          .attr("y2", cy + 10)
          .attr("opacity", 0)
          .remove();

        // …and the shell opening where the streak ran out
        for (let i = 0; i < FIREWORK_SPARKS; i++) {
          const a = (i / FIREWORK_SPARKS) * Math.PI * 2 + s * 0.4;
          const reach = 34 + (i % 4) * 13;
          const spark = document.createElementNS(ns, "line");
          spark.setAttribute("x1", cx);
          spark.setAttribute("y1", cy);
          spark.setAttribute("x2", cx);
          spark.setAttribute("y2", cy);
          spark.setAttribute("stroke", tint);
          spark.setAttribute("stroke-width", i % 3 ? 1.1 : 1.7);
          spark.setAttribute("stroke-linecap", "round");
          layer.appendChild(spark);
          made.push(spark);
          /* The tail lags the head, so a spark reads as travelling rather
           * than as a line that grew. And both end lower than they started —
           * a spark that goes out where it stopped looks weightless. */
          select(spark)
            .attr("opacity", 0)
            .transition()
            .delay(delay + FIREWORK_RISE_MS)
            .duration(0)
            .attr("opacity", 0.95)
            .transition()
            .duration(FIREWORK_FALL_MS + (i % 4) * 90)
            .ease(easeCubicOut)
            .attr("x1", cx + Math.cos(a) * reach * 0.55)
            .attr("y1", cy + Math.sin(a) * reach * 0.55 + 14)
            .attr("x2", cx + Math.cos(a) * reach)
            .attr("y2", cy + Math.sin(a) * reach + 20)
            .attr("opacity", 0)
            .remove();
        }
      }

      /* Swept up on a timer as well as by the transitions' own `.remove()`.
       * A transition that never runs never removes its element — switching
       * coin mid-show interrupts every one of them — and the layer is above
       * the chart, so what is left behind is left on top of it. */
      clearTimeout(this._fireworkSweep);
      this._fireworkSweep = setTimeout(() => {
        for (const el of made) {
          if (el.parentNode === layer) layer.removeChild(el);
        }
      }, FIREWORK_SHELLS * 260 + FIREWORK_RISE_MS + FIREWORK_FALL_MS + 600);
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
      /* Snapped to the lattice, which is anchored to the clock — not measured
       * from "now", which is a moving point inside a column. */
      const origin = isFinite(this.gridOriginX) ? this.gridOriginX : this.nowX;
      const col = Math.ceil((x - origin) / pitch);
      const xEnd = origin + col * pitch;

      /* The column "now" is standing in is not callable. Part of it has
       * already happened, and a band named over drawn history is not a
       * prediction — the first square that is all still to come is the one
       * after it. */
      if (xEnd - pitch < this.nowX - 0.5) return null;

      /* Only a square the chart drew whole can be called.
       *
       * The strip is deliberately a little wider than `pitch × ahead` — see
       * `gridGeometry` — so its right-hand end holds a part-column that runs
       * off the edge, and that part-column was clickable. Measured at 1280px:
       * two squares asked for, three clickable; eight asked for, twelve. The
       * call in the twelfth was drawn clipped and came back with a column
       * number the store then refused, so locking it wrote nothing at all —
       * a call that sat on the chart for the session and was gone at the next
       * reload, with nothing said. A square you cannot see whole is not a
       * square you can point at, so the tail of the strip is chart, not board.
       */
      if (xEnd > this.width + 0.5) return null;

      /* The square's edges in the units it is stored in, taken from the
       * lattice's own numbers rather than read back off the pixels.
       *
       * `invert` of an x that was itself computed from a pitch gives the right
       * answer to about a millisecond, and a call is compared against the
       * lattice for the rest of its life — a millisecond of slop is enough to
       * put `target` on the wrong side of a boundary and leave the box a hair
       * off the lines it was drawn on. The origin is a whole multiple of the
       * span and a column is a whole span wide, so the arithmetic is exact:
       * every call ever made lands on the same clock instants. Likewise the
       * band, which is a whole multiple of the price step. */
      const span = this.cellMs;
      const target =
        isFinite(this.gridOriginTime) && span > 0
          ? this.gridOriginTime + col * span
          : NaN;

      const baseY = this.gridY.length ? this.gridY[0] : PADDING;
      const top = baseY + Math.floor((y - baseY) / pitch) * pitch;
      /* One rule, applied at both ends: a square you cannot see whole is not a
       * square you can point at — the same rule the part-column at the
       * right-hand end of the strip already follows.
       *
       * At the top that is the sliced row the fade is finishing, which is also
       * half-covered by the range switcher. At the bottom it is a row running
       * off the chart's foot, and that end had no rule at all: measured at
       * 1280×800, the lattice's last line sat at y=471 on a 495px chart and
       * everything down to y=490 was callable, so a call could be locked on a
       * box whose lower half was never drawn. */
      if (top < this.fadeEnd() - 0.5) return null;
      if (top + pitch > this.height + 0.5) return null;
      const step = this.cellStep;
      const raw = this.priceToY.invert(top);
      const hi = step > 0 ? Math.round(raw / step) * step : raw;
      const lo = step > 0 ? hi - step : this.priceToY.invert(top + pitch);
      if (![hi, lo, target, span].every(isFinite) || !(hi > lo)) return null;
      return { target, span, lo, hi, col };
    });

    _defineProperty(this, "sameCell", (a, b) =>
      Boolean(a && b && a.col === b.col && Math.abs(a.hi - b.hi) < 1e-9),
    );

    /* The draft, worked out again from where it was clicked.
     *
     * It used to be kept as geometry — the cell object the first click
     * produced. A refresh lands every thirty seconds and moves the price
     * domain a little, so `hi` for the very same square came back a fraction
     * different afterwards, `sameCell` said no, and the second click drafted
     * instead of locking. The gesture failed for the ordinary reason that data
     * arrived in the middle of it, and it failed silently.
     *
     * The pointer position is the thing that does not go stale, so that is
     * what is held: both clicks are then measured against the same lattice,
     * whatever happened to the scales between them, and the drawn draft stays
     * snapped to the grid instead of drifting off it. */
    _defineProperty(this, "draftCell", () =>
      this.draftAt ? this.cellAt(this.draftAt.x, this.draftAt.y) : null,
    );

    /* Does anything already claim this patch of the chart?
     *
     * Two calls are the same claim when their rectangles intersect in real
     * time and real price — not when they share a column index. `col` is
     * counted back from "now", so it names a different stretch of time every
     * minute: yesterday's column 2 and today's column 2 are different
     * questions, and treating them as one is what let a locked call be
     * silently replaced by an unrelated later one.
     *
     * Only *open* calls block. A settled one is a record of something already
     * answered, and the future cannot collide with the past.
     */
    _defineProperty(this, "callOccupying", (cell) => {
      if (!cell) return null;
      const calls = Array.isArray(this.props.calls) ? this.props.calls : [];
      return (
        calls.find(
          (c) =>
            c.coin === this.props.coin &&
            c.currency === this.props.currency &&
            c.period === this.props.period &&
            // strict overlap: touching edges are neighbours, not collisions
            c.target - c.span < cell.target &&
            cell.target - cell.span < c.target &&
            c.lo < cell.hi &&
            cell.lo < c.hi,
        ) || null
      );
    });

    _defineProperty(this, "handleChartClick", (e) => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      if (!this.props.predict || !this.props.onPlaceCall) return;
      const cell = this.cellAt(e.offsetX, e.offsetY);
      if (!cell) {
        // A click anywhere else abandons the draft rather than leaving a
        // half-made call sitting on the chart
        if (this.draftAt) {
          this.draftAt = null;
          this.updateCalls();
        }
        return;
      }
      /* A locked call is final. Clicking one does nothing — not re-drafting
       * it, not replacing it, not clearing it. The whole value of a record is
       * that you cannot edit it after the fact, and a square that could be
       * overwritten while you watch the price move is not a prediction. */
      if (this.callOccupying(cell)) {
        if (this.draftAt) {
          this.draftAt = null;
          this.updateCalls();
        }
        this.drawGridCell();
        return;
      }
      if (this.sameCell(this.draftCell(), cell)) {
        this.draftAt = null;
        // Play the latch on the square that was just locked
        this.lockPulse = cell;
        clearTimeout(this.lockPulseTimer);
        this.lockPulseTimer = setTimeout(() => {
          this.lockPulse = null;
          this.updateCalls();
        }, LOCK_PULSE_MS);
        this.props.onPlaceCall(cell);
        this.updateCalls();
        return;
      }
      this.draftAt = { x: e.offsetX, y: e.offsetY };
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
      const baseX = isFinite(this.gridOriginX) ? this.gridOriginX : this.nowX;
      const y1 = baseY + Math.floor((y - baseY) / pitch) * pitch;
      const x2 = baseX + Math.ceil((x - baseX) / pitch) * pitch;
      /* Neither sliced row is offered on a board. Lighting up a square that
       * cannot be called is an invitation the next click refuses — and the
       * refusal is silent, which is the worst way to say no. The plain grid
       * keeps its faded stubs: nothing there is clickable, so a highlight
       * promises nothing. */
      if (y1 < this.fadeEnd() - 0.5) return hide();
      if (this.props.predict && y1 + pitch > this.height + 0.5) return hide();
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

      /* Callable, not merely to the right of "now". `cellAt` refuses the
       * part-column at the edge of the strip and the column "now" is standing
       * in, and both the CALL IT hint and the readout have to agree with it:
       * an invitation over a square a click will not take is a promise the
       * code has already decided to break. */
      const here = this.cellAt(x, y);
      const callable = Boolean(here);

      /* Say what a click here would do. A square in the future is the only
       * part of this chart that is clickable, and nothing else on it says so
       * — without this the two-step placement is a secret. */
      const hint = this.cellHintRef.current;
      if (hint) {
        const drafted = this.sameCell(this.draftCell(), here);
        /* A square that already holds a call says so. Without this the only
         * difference between "free" and "taken" was a faint dashed box you
         * were probably hovering over, and the invitation still read CALL IT
         * — offering an action that is deliberately refused. */
        const taken = callable ? this.callOccupying(here) : null;
        if (callable && !drafted && frac > 0.5) {
          hint.setAttribute("x", x1 + 5);
          hint.setAttribute("y", y1 + 13);
          hint.setAttribute("fill", this.props.theme.color.textSecondary);
          hint.setAttribute("opacity", taken ? "0.55" : "1");
          hint.textContent = taken ? "LOCKED" : "CALL IT";
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
        // Whether a click here would take a call — the readout needs to know
        // whether there is anything to decide
        callable,
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

      /* What the readout is about, and therefore what makes it stale.
       *
       * With calls on it describes the square under the pointer, so the square
       * has to be part of that test. Guarding on the nearest data point alone
       * meant nothing was redrawn while the point stayed the same — and in the
       * future strip there is no data at all, so the nearest point is always
       * the last one. The whole board, the only place a call can be made, read
       * out the numbers of whichever square you happened to enter first: a
       * price band and a pair of times that belonged to a box somewhere else
       * on the chart. Either changing is a redraw; neither changing is not. */
      const cellBox = this.props.predict ? this.hoverCell : null;
      const cellKey = cellBox ? `${+cellBox.from}|${cellBox.hi}` : null;
      if (i === this.hoverIndex && cellKey === this.hoverCellKey) {
        return;
      }
      this.hoverIndex = i;
      this.hoverCellKey = cellKey;

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
      /* Both ends of the span, with the part they share said once.
       *
       * "Aug 12, 12:52 PM – Aug 12, 12:54 PM" spends more than half its width
       * repeating the date, on the line whose job is to say how long a square
       * lasts. The common head is taken off the second end rather than
       * reformatted, so this holds for every range: the pieces are whatever
       * `crosshairDate` decided they should be for that period. */
      const spanText = (from, to) => {
        const a = crosshairDate(from, this.props.period);
        const b = crosshairDate(to, this.props.period);
        const cut = b.lastIndexOf(", ");
        return cut > 0 && a.startsWith(b.slice(0, cut + 2))
          ? `${a} – ${b.slice(cut + 2)}`
          : `${a} – ${b}`;
      };
      const dateText = cellBox
        ? spanText(cellBox.from, cellBox.to)
        : crosshairDate(source.time, this.props.period);
      this.hoverDateRef.current.textContent = dateText;

      /* The third line: what naming this square would actually be claiming.
       *
       * A band and a pair of times are the *what*; on their own they leave
       * the two questions a call is made on unanswered — how far the price
       * has to travel to be in there, and how long it has to do it in. Both
       * are a subtraction away from numbers already on screen, and neither is
       * one anybody wants to do in their head while pointing at a box. It is
       * written only under a square that can be called: over history there is
       * nothing to decide, and "needs +0.4%" about a box the price has
       * already been through would be nonsense. The words are the targets
       * panel's own — needs, settles — because it is the same claim. */
      const live = raw.length ? Number(raw[raw.length - 1].price) : NaN;
      let noteText = "";
      if (cellBox && cellBox.callable) {
        const inside = live >= cellBox.lo && live <= cellBox.hi;
        const edge = live < cellBox.lo ? cellBox.lo : cellBox.hi;
        const away =
          isFinite(live) && live > 0 && !inside
            ? `needs ${formatSignedPercent(((edge - live) / live) * 100)}`
            : isFinite(live)
              ? "in the band now"
              : "";
        const when = describeAhead(+cellBox.to - Date.now());
        noteText = away ? `${away} · settles ${when}` : `settles ${when}`;
      }
      const note = this.hoverNoteRef.current;
      if (note) {
        note.textContent = noteText;
        note.setAttribute("visibility", noteText ? "inherit" : "hidden");
      }

      /* The guide belongs to a data point, so it leaves when the readout stops
       * describing one. Over the future strip the nearest point is the last
       * one drawn, which put a crosshair through the live price while the box
       * beside it talked about a square two inches away — a line pointing at
       * something nobody asked about. */
      const overFuture = Boolean(cellBox) && this.hoverX > this.nowX;
      this.hoverLineRef.current.setAttribute(
        "visibility",
        overFuture ? "hidden" : "inherit",
      );
      this.hoverDotRef.current.setAttribute(
        "visibility",
        overFuture ? "hidden" : "inherit",
      );

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
      const noteW = noteText && note ? note.getComputedTextLength() : 0;
      const bodyW = rowCount
        ? labelW + CROSSHAIR_COL_GAP + valueW
        : this.hoverPriceRef.current.getComputedTextLength();
      const boxW = Math.max(dateW, bodyW, noteW) + CROSSHAIR_LABEL_PAD * 2;
      const boxH = rowCount
        ? CROSSHAIR_LABEL_PAD * 2 + 12 + rowCount * CROSSHAIR_ROW_H
        : noteText
          ? 50
          : 34;

      /* Beside the square it describes, not beside the price line.
       *
       * Everywhere else the box is placed at the nearest data point, which is
       * the right answer when that point is what it is reading out. In the
       * future strip the nearest point is the live dot, so a square at the top
       * of the board had its numbers drawn halfway down the chart, next to a
       * marker with nothing to do with them — and they did not move when the
       * pointer moved. Anchored to the square's own right edge and centre, the
       * numbers sit beside the box they belong to, and the box you are about
       * to click is never the one covered up. */
      const anchorX = cellBox ? this.timeToX(cellBox.to) : px;
      const anchorMid = cellBox
        ? (this.priceToY(cellBox.hi) + this.priceToY(cellBox.lo)) / 2
        : py;
      const atX = isFinite(anchorX) ? anchorX : px;
      const atY = isFinite(anchorMid) ? anchorMid : py;

      let boxX = atX + CROSSHAIR_LABEL_GAP;
      if (boxX + boxW > this.width) {
        boxX = atX - CROSSHAIR_LABEL_GAP - boxW - (cellBox ? this.cellPitch : 0);
      }
      boxX = Math.max(0, boxX);
      const boxY = Math.min(
        Math.max(atY - boxH / 2, 0),
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
      if (note && noteText) {
        note.setAttribute("x", boxX + CROSSHAIR_LABEL_PAD);
        note.setAttribute("y", boxY + 42);
      }

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

      /* Candles live in the history area, and they leave it the same way the
       * line does.
       *
       * They used to be spread across the whole width at whatever the padding
       * was, which with calls on drew them straight through the board — bars
       * under squares meant for the future, on a price scale of their own that
       * agreed with the mesh nowhere. Confined to the left of "now" and cut to
       * the same visible window, they slide off the edge as the board grows
       * instead of squeezing: same bar width, same minutes per bar, fewer of
       * them on screen. */
      const future = this.futureWidth();
      const nowX = this.width - future;
      const visible =
        future > 0 && this.width > 0
          ? candles.slice(
              Math.floor(candles.length * Math.max(0, 1 - nowX / this.width)),
            )
          : candles;
      // One bar per ~3px of width, so bars never collapse into a smear —
      // and no more bars than the data can actually fill, so a thin market's
      // empty intervals merge into candles with real bodies
      const maxBars = Math.min(
        Math.max(20, Math.floor(nowX / 3)),
        candleDensityCap(visible),
      );
      const bars = aggregateCandles(visible, maxBars);
      const scaled = scaleCandles(bars, this.height, this.width, PADDING, PADDING, nowX);
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
      this.hoverCellKey = null;

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

      /* The board is taken out of the left, not out of the price line.
       *
       * The series used to be squeezed into whatever width the strip left
       * over, so asking for more future *redrew the past*: every peak moved,
       * every locked call slid against the line it was called on, and dragging
       * the "now" line felt like squashing the chart rather than moving along
       * it. The scale is fixed instead — the whole series across the whole
       * width, always the same pixels per minute — and the strip pushes it
       * left, so the oldest end goes off the edge of the screen. Nothing that
       * stays on screen changes shape, which is what makes the drag read as
       * pulling a sheet along rather than compressing it.
       *
       * `margin` is the room kept above and below the price for calling
       * beyond what has happened; the mesh uses the same figure, and the two
       * would part company on the first pixel if either computed its own. */
      const geo = this.gridGeometry();
      const future = this.futureWidth();
      /* With a board on, the price window is the board's, not the data's: the
       * lattice decides what is on screen and the line is drawn into it. They
       * would part company on the first refresh otherwise — the mesh holding
       * still while the line rescaled underneath it. */
      const window = geo && geo.domain ? geo.domain : [null, null];
      const padY = this.plotPadY();
      const scaled = scalePrices(
        safePrices(prices),
        this.height,
        this.width,
        padY,
        padY,
        -future,              // the past slides off the left edge…
        future,               // …by exactly what the future takes on the right
        window[0],
        window[1],
      );
      this.scaled = scaled;
      this.hoverIndex = -1;
      this.hoverCellKey = null;
      const d = lineFromPrices(scaled);
      const areaD = buildAreaD(d, scaled, this.height);

      /* A drag is not animated: the hand is the animation.
       *
       * The morph is 300ms and a drag re-fires it at every square it crosses,
       * each new tween starting from the last committed shape — so the mesh
       * moved with the pointer while the price line snapped backwards and set
       * off after it. Under the hand the path is simply put where it belongs;
       * `interrupt` first, or the transition still running would paint over
       * it a frame later. */
      if (this.nowDrag) {
        this.path.interrupt().attr("d", d);
        this.area.interrupt().attr("d", areaD);
      } else {
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
      }

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

    /* The square cell size, and the round levels that set it.
     *
     * Lifted out of `updateGrid` because `updatePath` needs it *first*: with
     * calls turned on the series has to stop short of the right edge to leave
     * whole cells of empty future to point at, and that reservation is a
     * multiple of the pitch. The pitch depends on the chart's size and on the
     * clock, never on how much of the width the board has taken, so there is
     * no circularity — but the order matters and this is why.
     */
    /* How much room the drawing keeps at the top and the bottom.
     *
     * A line wants an inset: it is a shape, and a shape that touches the edge
     * of its box reads as clipped. A board does not — its top and bottom rows
     * *are* lines, and the inset is what stopped the lattice 24px short of the
     * chart's foot. One function rather than two constants because the mesh
     * and the price line are drawn into the same price window: give them
     * different insets and they describe different prices at the same y, and
     * they part company on the first pixel. */
    _defineProperty(this, "plotPadY", () => (this.props.predict ? 0 : PADDING));

    /* How many whole squares of board there are between the fade and the foot
     * of the chart — the rows you can actually put a call in.
     *
     * Both the zoom pill's "±$4K" and the panel's Board strip print this ×
     * the step, and they used to compute it separately from the inset plot
     * (`(height − 2·PADDING) / pitch − 1`). That figure was wrong in both
     * directions once the board took the full height: it subtracted an inset
     * that is no longer there and a whole row for a fade that is now a
     * fraction of one. Two readouts of the same number, derived twice, is how
     * they end up disagreeing. */
    _defineProperty(this, "callableRows", () => {
      const pitch = this.cellPitch || this.boardPitch();
      if (!(pitch > 0) || !this.height) return 1;
      return Math.max(1, Math.floor((this.height - this.fadeEnd()) / pitch));
    });

    /* The size a square would ideally be, in pixels: about a sixth of the plot,
     * which is a comfortable reading grid. Nothing is drawn at this size — it
     * is only what the ladder of round durations is measured against. */
    _defineProperty(this, "targetPitch", () => {
      const plot = this.height - PADDING * 2;
      if (!(plot > 0)) return 0;
      return Math.max(46, Math.min(104, plot / 6));
    });

    /* Milliseconds per pixel, which is the one number that ties the clock to
     * the chart. The series is mapped across the *whole* width — the board
     * pushes the past off the left edge rather than squeezing it — so this is
     * independent of how wide the board is, and `boardPitch` can therefore be
     * worked out before `futureWidth` without any circularity. */
    _defineProperty(this, "msPerPx", () => {
      const data = safePrices(this.props.prices);
      const t0 = +data[0].time;
      const t1 = +data[data.length - 1].time;
      const per = (t1 - t0) / this.width;
      return isFinite(per) && per > 0 ? per : 0;
    });

    /* A square already called is the square to keep.
     *
     * A new tab is a fresh context with no memory of the lattice, and the range
     * drifts, so the rung nearest "comfortable" today is not guaranteed to be
     * the rung a call was made on a week ago. The calls themselves record what
     * a square was worth, so they are the memory: if one of them still names a
     * rung, and that rung is still a reasonable square, the board adopts it and
     * the box lands exactly where it was drawn. Legacy calls carry the old
     * accidental spans and are ignored here — `isCellSpan` is the filter. */
    _defineProperty(this, "calledSpan", () => {
      const calls = Array.isArray(this.props.calls) ? this.props.calls : [];
      const mine = calls.find(
        (c) =>
          c.coin === this.props.coin &&
          c.currency === this.props.currency &&
          c.period === this.props.period &&
          isCellSpan(c.span),
      );
      return mine ? mine.span : 0;
    });

    /* How much clock one square covers: a rung of `CELL_SPANS`, held per range.
     *
     * Held, because the ideal square moves a hair on every refresh and a
     * lattice that re-steps under a locked call is the whole problem this
     * solves. Per range, because that is the unit someone is thinking in —
     * switching to a year and back must bring the same squares back, which it
     * cannot do if the memory was thrown away at the switch. */
    _defineProperty(this, "cellSpan", () => {
      const per = this.msPerPx();
      const want = this.targetPitch() * per;
      if (!(want > 0)) return 0;

      const key = this.props.period || "";
      const held = this._cellMs[key];
      const comfortable = (ms) =>
        ms / want >= CELL_KEEP_LO && ms / want <= CELL_KEEP_HI;
      if (held && comfortable(held)) return held;

      const seed = this.calledSpan();
      const chosen = comfortable(seed)
        ? seed
        : CELL_SPANS.reduce((a, b) =>
            Math.abs(Math.log(b / want)) < Math.abs(Math.log(a / want)) ? b : a,
          );
      this._cellMs[key] = chosen;
      return chosen;
    });

    /* How wide a square is, in pixels — the rung, converted. Everything else
     * bends to this: the price step is chosen so its pixel height matches, and
     * the board's width is measured in whole squares of it. Where the clock
     * cannot be read (no width, a single point) it falls back to the
     * comfortable size, which is what the plain grid uses. */
    _defineProperty(this, "boardPitch", () => {
      const per = this.msPerPx();
      const ms = this.cellSpan();
      const px = per > 0 && ms > 0 ? ms / per : 0;
      /* Bounded at both ends, because the clock cannot always be read. Before
       * the first response the series is a two-point stand-in a millisecond
       * wide, and a rung of the ladder measured against that comes out
       * millions of pixels across. Where the answer is not a square anyone
       * could point at, the comfortable size stands in. */
      return px > 4 && px < this.height ? px : this.targetPitch();
    });

    /* The part of the series that is actually on screen.
     *
     * With the board taking width out of the left, most of the range can be
     * off the edge — and a price scale sized for data nobody can see draws the
     * visible part as a flat squiggle in the middle of an empty chart. The
     * window the board is scaled to is the window you are looking at. */
    _defineProperty(this, "visibleSlice", () => {
      const data = safePrices(this.props.prices);
      if (data.length < 2) return null;
      const t0 = +data[0].time;
      const t1 = +data[data.length - 1].time;
      const span = t1 - t0;
      if (!(span > 0) || !this.width) return data;
      const cut = t0 + (span * this.futureWidth()) / this.width;
      const from = data.filter((d) => +d.time >= cut);
      // Never fewer than two points: a window that has outrun the data still
      // has to have a scale
      return from.length >= 2 ? from : data.slice(-2);
    });

    /* The zoom, and the fact that it travels rather than jumps.
     *
     * A scale that changes between two frames leaves you working out what just
     * happened to the boxes; one that travels tells you which way it went and
     * carries every locked call with it, so you can see your own claims get
     * bigger or smaller rather than finding them somewhere new. 260ms of
     * ease-out, redrawn per frame off the same rAF the drag uses.
     */
    _defineProperty(this, "effectiveZoom", () => {
      const to = this.props.boardZoom > 0 ? this.props.boardZoom : 1;
      const anim = this.zoomAnim;
      let shown = to;
      if (anim) {
        const t = (Date.now() - anim.start) / BOARD_ZOOM_MS;
        if (t >= 1) this.zoomAnim = null;
        else {
          // Ease-out on the *ratio*, since zoom is multiplicative —
          // interpolating 1→16 linearly spends most of the animation already
          // zoomed out
          const eased = 1 - Math.pow(1 - t, 3);
          shown = anim.from * Math.pow(to / anim.from, eased);
        }
      }
      // Remembered so a change arriving mid-travel starts from where the eye
      // is, not from where the last one was aiming
      this._zoomShown = shown;
      return shown;
    });

    _defineProperty(this, "runZoomAnim", () => {
      this.zoomRaf = 0;
      if (!this.zoomAnim) return;
      this.updatePath();
      if (this.zoomAnim) {
        this.zoomRaf = requestAnimationFrame(this.runZoomAnim);
      } else {
        this.updatePath(); // the last frame, on the exact value
      }
    });

    /* One notch of zoom. Positive is out — each square worth more, the board
     * reaching further, which is the direction someone reaches for when the
     * call they want to make is off the screen. */
    _defineProperty(this, "zoomBoard", (dir) => {
      if (!this.props.predict || typeof this.props.onBoardZoomChange !== "function") {
        return;
      }
      const now = this.props.boardZoom > 0 ? this.props.boardZoom : 1;
      const i = BOARD_ZOOM_STEPS.indexOf(now);
      const at = i === -1 ? BOARD_ZOOM_STEPS.indexOf(DEFAULT_BOARD_ZOOM) : i;
      const next = BOARD_ZOOM_STEPS[Math.min(BOARD_ZOOM_STEPS.length - 1, Math.max(0, at + dir))];
      if (next === now) return;
      /* Only asks. The travel is started by the prop coming back changed —
       * see `componentDidUpdate` — so the wheel, the keys and the panel's two
       * buttons all animate, rather than only the one that happens to run
       * through here. */
      this.props.onBoardZoomChange(next);
    });

    _defineProperty(this, "handleWheel", (e) => {
      if (!this.props.predict || typeof this.props.onBoardZoomChange !== "function") {
        return;
      }
      /* The page does not scroll, so the wheel is free — and over a board it
       * means one thing everywhere else it is used. Ctrl/⌘ is the browser's
       * own page zoom; leave it alone. */
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const now = Date.now();
      // A trackpad fires a stream of small deltas; one notch per gesture beat
      if (now - (this._lastWheel || 0) < 220) return;
      this._lastWheel = now;
      this.zoomBoard(e.deltaY > 0 ? 1 : -1);
    });

    /* What the price actually does in one square's worth of time.
     *
     * The median absolute move over `cellSpan()`, taken from the series on
     * screen. This is the number a square should be sized against, and it is
     * not the same thing as the range: over a trending hour the range is the
     * *drift*, which can be four times what the price wiggles cell to cell.
     * Measured on live BTC — a square was $100 where five minutes typically
     * moved $30, so the price essentially never left the square it was in and
     * calling one was not a prediction.
     *
     * Median rather than mean: one spike in an hour should not decide how big
     * every square is for the rest of it.
     */
    _defineProperty(this, "cellVolatility", () => {
      const data = safePrices(this.props.prices);
      const cell = this.cellSpan();
      if (!(cell > 0) || data.length < 4) return 0;
      const key = `${data.length}|${cell}|${+data[0].time}|${data[0].price}`;
      if (this._volKey === key) return this._vol;
      const spanMs = +data[data.length - 1].time - +data[0].time;
      const stepMs = spanMs / (data.length - 1);
      const k = Math.max(1, Math.round(cell / stepMs));
      let vol = 0;
      if (k < data.length - 1) {
        const moves = [];
        for (let i = 0; i + k < data.length; i++) {
          const a = Number(data[i].price);
          const b = Number(data[i + k].price);
          if (isFinite(a) && isFinite(b)) moves.push(Math.abs(b - a));
        }
        if (moves.length) {
          moves.sort((a, b) => a - b);
          vol = moves[Math.floor(moves.length / 2)];
        }
      }
      this._volKey = key;
      this._vol = vol;
      return vol;
    });

    /* The price a square is worth.
     *
     * Round, and *sticky*: it changes only when the window it has to hold no
     * longer sits comfortably inside it. Recomputing it from the range on
     * every refresh is what made the board unusable over a real move — the
     * step would slide from 50 to 100 the moment a candle poked out, every
     * locked call would come off the gridlines it was called on, and each
     * square would quietly start meaning something else. With hysteresis it
     * holds for hours and then re-steps once, deliberately, when the price has
     * genuinely gone somewhere else.
     *
     * Held per coin, currency *and* range. It used to be one value thrown away
     * whenever any of the three changed, which meant a trip to the year and
     * back re-picked the step from the year's range on the way there and from
     * whatever the hour's range had become on the way back — so the boxes came
     * home to a lattice with different lines in it. What a square is worth on a
     * range is a property of that range, and it is remembered as one.
     *
     * As with the clock, an existing call seeds it: its band is what a square
     * was worth when it was made, so if that still fits the window it is the
     * step, and the box lands back on its own lines. */
    _defineProperty(this, "boardKey", () =>
      `${this.props.coin}|${this.props.currency}|${this.props.period}`,
    );

    _defineProperty(this, "board", () => {
      const key = this.boardKey();
      if (!this._boards[key]) this._boards[key] = { step: 0, base: null, baseStep: 0 };
      return this._boards[key];
    });

    _defineProperty(this, "calledStep", () => {
      const calls = Array.isArray(this.props.calls) ? this.props.calls : [];
      const mine = calls.find(
        (c) =>
          c.coin === this.props.coin &&
          c.currency === this.props.currency &&
          c.period === this.props.period &&
          c.hi > c.lo,
      );
      return mine ? mine.hi - mine.lo : 0;
    });

    _defineProperty(this, "boardStep", (range, rows) => {
      const held = this.board();
      const usable = Math.max(1, Math.floor(rows) - 2);
      /* What the square should be worth, and the two things pulling on it.
       *
       * `fair` is what the price does in one square of time — the size that
       * makes naming a square a real question. `fit` is the size that would
       * put the whole visible slice on screen at once. They agree on a quiet
       * range and disagree on a trending one, where `fit` is three or four
       * times `fair` and every call becomes "the price is already here".
       *
       * Fair wins, but not without limit: the square may not be smaller than
       * half of `fit`, so at most half the visible slice's range can run off
       * the window. What is *always* on screen is the live price, which the
       * window follows in whole squares — that is the part you are betting
       * against. Nor may it be larger than `fit`: if the price is quieter than
       * the window, showing the window is the better answer.
       */
      const fit = range / usable;
      const fair = this.cellVolatility();
      /* …and then whatever the zoom asks for. Zoom is the answer to the
       * question sizing cannot answer on its own: a square small enough to be
       * a tight call puts the board's whole reach three squares either side of
       * the price, so "it falls off a cliff" — the one call an hour chart most
       * invites — has nothing to point at. One size cannot serve both, so the
       * size is yours. */
      const zoom = this.effectiveZoom();
      const need = (fair > 0 ? Math.min(fit, Math.max(fair, fit / 2)) : fit) * zoom;
      /* Sticky around the target rather than around the range. It used to hold
       * while the range still fitted, which is a test the new sizing can fail
       * by design — a band around what the square is *for* keeps the same
       * property (a locked call does not come off its gridlines every
       * refresh) without arguing with it. */
      const fits = (step) => step > 0 && step >= need * 0.5 && step <= need * 2;
      /* Nothing is remembered while the scale is travelling. Halfway through a
       * zoom the target is halfway too, and the step computed there sits inside
       * the sticky band of the value being travelled *to* — so the animation
       * would quietly hold the board at its own midpoint and one press of the
       * button would appear to do nothing. */
      const travelling = Boolean(this.zoomAnim);
      if (!travelling && fits(held.step)) return held.step;
      const seed = this.calledStep();
      if (!travelling && fits(seed)) {
        held.step = seed;
        return seed;
      }
      const power = Math.pow(10, Math.floor(Math.log10(need)));
      // 1 · 2 · 2.5 · 5 · 10, the ladder whose rungs are all still round
      // numbers to print on an axis
      const step =
        [1, 2, 2.5, 5, 10].map((m) => m * power).find((v) => v >= need) ||
        power * 10;
      if (!travelling) held.step = step;
      return step;
    });

    /* The plain grid's lattice: the price scale, the levels and the pixel
     * pitch, all fitted to the data the way the rest of the chart is. This is
     * the no-board path — with calls on, `boardGeometry` takes over, because a
     * board needs a square that does not change size when the price does. */
    _defineProperty(this, "gridGeometryFor", () => {
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
      /* The square size no longer answers to anything but the chart.
       *
       * It used to be chosen to fit a requested *count* of squares inside a
       * budgeted strip, which is why this was the most intricate arithmetic in
       * the file: the count was the control, so the squares had to shrink to
       * honour it. The control is now the width of the board itself — you drag
       * the line to where you want it — and the number of squares is simply
       * however many fit. So the pitch is picked the way the plain grid has
       * always picked it, nearest a comfortable size, and it no longer moves
       * when the board does. A lattice that stops re-stepping every time the
       * board is resized is also a lattice that stops rearranging itself under
       * a call you have already locked. */

      const candidates = [];
      const seen = new Set();
      const addTicks = (t) => {
        if (!t || t.length < 2) return;
        const p = Math.abs(priceToY(t[1]) - priceToY(t[0]));
        if (!(p > 4)) return;
        const key = Math.round(p * 2); // dedupe pitches within half a pixel
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push({ levels: t, pitch: p });
      };
      for (let n = 3; n <= 14; n++) {
        const t = priceToY.ticks(n);
        addTicks(t);
        if (t.length >= 2) {
          // Built by index rather than by accumulating a float, so the last
          // level is exactly where it should be instead of a rounding away.
          const half = (t[1] - t[0]) / 2;
          const sub = [];
          for (let i = 0; i <= (t.length - 1) * 2; i++) sub.push(t[0] + i * half);
          addTicks(sub);
        }
      }
      if (!candidates.length) return null;

      /* Nearest a comfortable cell.
       *
       * "Largest that fits" was tried and is hypersensitive: as the price band
       * widens through the day every pitch shrinks, and the moment a coarser
       * step slips under some edge the whole lattice snaps to it — cells
       * jumping from 50px to 66px between two refreshes while nothing but the
       * range had changed. Aiming at the same comfortable size the plain grid
       * uses makes the choice depend on the plot height, which does not
       * drift. */
      const chosen = candidates.reduce((a, b) =>
        Math.abs(b.pitch - target) < Math.abs(a.pitch - target) ? b : a,
      );
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

    /* The lattice, with the margin solved for.
     *
     * Two or three passes of arithmetic, and it runs several times per redraw
     * (the path needs the reserved width, the mesh needs the levels, the panel
     * needs the step) — so the answer is kept until something it depends on
     * moves. A drag redraws every frame and this is the most expensive thing
     * on that path. */
    /* The board's lattice: a fixed grid of squares, and a window onto it.
     *
     * This is the vertical half of the same idea as the anchored time axis.
     * The chart's ordinary behaviour is to fit whatever it is given, which
     * means the price scale moves a little on every refresh — fine for reading
     * a line, useless under a board, because "one square" would be worth
     * something different every thirty seconds and the boxes already locked
     * would drift off the gridlines they were called on.
     *
     * So the square is fixed: `boardPitch` px tall, `boardStep` in price, and
     * neither depends on the data. What follows the price is the *window* —
     * it stays centred on the visible range, so a fall of twenty squares pans
     * the chart down twenty squares rather than rescaling it, and the calls
     * left above it slide off the top still meaning exactly what they meant.
     * The step only changes when the window genuinely cannot hold the range
     * any more, and then it changes once.
     *
     * The room above and below the data is structural rather than a margin
     * added afterwards: the range has to fit inside `rows − 2` squares, so
     * there is always a whole square of empty at both ends to point at.
     */
    _defineProperty(this, "boardGeometry", () => {
      const slice = this.visibleSlice();
      if (!slice || !this.height) return null;
      const [lo, hi] = extent(slice, (d) => d.price);
      if (!isFinite(lo) || !isFinite(hi)) return null;

      /* The board's plot is the whole chart. The inset belongs to the line —
       * a shape should not touch the edges — and a lattice is not a shape.
       *
       * With the inset, `base` is a whole multiple of the step, so the lowest
       * gridline landed on `height - PADDING` and the 24px below it was a
       * strip with vertical lines running through it and no horizontal one to
       * close them: measured at 1280×800, the mesh ended at y=471 on a 495px
       * chart, so the bottom square of the board was never a square. The
       * leftover fraction of a row has to go somewhere, and the top is where
       * it can go, because the fade is already there to finish it. Now the
       * lowest gridline is the chart's own bottom edge and every row above it
       * is whole.
       *
       * `plotPadY` is the other half of this: the price line is drawn into
       * the same window, so it has to be given the same inset or the mesh and
       * the line describe different prices at the same y. */
      const top = 0;
      const bottom = this.height;
      const plot = bottom - top;
      const pitch = this.boardPitch();
      if (!(plot > 0) || !(pitch > 0)) return null;
      /* Fractional on purpose. The pitch is now the clock's — one rung of
       * `CELL_SPANS` converted to pixels — so it no longer divides the plot a
       * whole number of times. Rounding `rows` to fix that would round the
       * pitch with it and the square would stop being square; carrying the
       * fraction through instead leaves the price step exactly `pitch` pixels
       * tall (`plot / rows`), which is the property that matters. What is left
       * over is a part-row at the top, which the lattice already extends
       * through. */
      const rows = plot / pitch;

      // A flat window still needs a height, or the scale divides by zero
      const range = hi > lo ? hi - lo : Math.max(Math.abs(hi) * 1e-4, 1e-8);
      const step = this.boardStep(range, rows);
      const span = rows * step;

      /* Where the window sits, and why it stays there.
       *
       * Centring it on the visible range put it somewhere slightly different
       * every thirty seconds: a new high a dollar above the old one moved the
       * whole board a pixel, and everything on it with it. The board is a
       * thing you point at — it has to hold still.
       *
       * So the window is placed in **whole squares** and then left alone until
       * it genuinely cannot hold what it is showing. When it does have to
       * move, it moves by whole steps, which is why the move is barely visible
       * on the lattice itself: the levels are multiples of the step, so after
       * a one-square pan the lines land exactly where the old ones were and
       * only the labels and the price have moved.
       *
       * The placement is anchored on the **left edge of the window** — the
       * price the visible history starts at. That is the number the rest of
       * the move is read against ("three squares up since the left of the
       * screen"), and on a fast rise or fall it is what the board re-places
       * itself around. */
      /* What the window has to hold.
       *
       * The whole visible slice when it fits — the old rule, and still the
       * usual case. When it does not (the square is now sized by what the
       * price *does*, not by the range, so a trending window can be taller
       * than the board), the thing that must stay on screen is the **live
       * price**: it is what every open call is measured against, and a board
       * whose current price is off the top is a board you cannot read or bet
       * on. The older part of the line runs off instead, which is what
       * zooming in has always meant.
       *
       * Either way there is a square of margin at both ends — the room to call
       * beyond what has happened, which is the whole point of the strip. */
      const last = slice[slice.length - 1]
        ? Number(slice[slice.length - 1].price)
        : (lo + hi) / 2;
      const roomy = hi - lo <= span - step * 2;
      const keepLo = roomy ? lo : last;
      const keepHi = roomy ? hi : last;
      const anchor = roomy
        ? slice[0]
          ? Number(slice[0].price)
          : (lo + hi) / 2
        : last;
      const inside = (base) =>
        keepLo >= base + step * 0.999 && keepHi <= base + span - step * 0.999;
      const held = this.board();
      const guard = Math.ceil(rows) * 4;
      let base = held.base;
      if (!(held.baseStep === step && isFinite(base) && inside(base))) {
        /* The anchor's own square, put near the middle of the window.
         *
         * `ceil` was tried here, to hand a fall the spare square on an uneven
         * row count. Measured, it moves the whole window down by one step:
         * with this chart the top price label went from $43.50K to $43.45K,
         * the same either way across three runs. That is a square taken from
         * above the price and given below it — and above is where a rising
         * chart invites calls, so it is not obviously the better half to
         * spend. The room for calling a fall is bought by the plot running the
         * full height of the chart, which is a whole extra row and costs
         * nothing at the other end; leaning the window as well was a guess
         * with a real price and no evidence behind it. */
        base =
          Math.floor(anchor / step) * step -
          Math.floor((Math.floor(rows) - 1) / 2) * step;
        // …then slid, a square at a time, until the window holds what it must
        for (let i = 0; i < guard && keepLo < base + step * 0.999; i++) base -= step;
        for (let i = 0; i < guard && keepHi > base + span - step * 0.999; i++) base += step;
        held.base = base;
        held.baseStep = step;
      }
      const domain = [base, base + span];

      const priceToY = scaleLinear().range([bottom, top]).domain(domain);
      /* Levels are the whole multiples of the step, so they are anchored to
       * absolute price the way the columns are anchored to absolute time —
       * $43,000 is on a line whatever the window happens to be showing. */
      const firstLevel = Math.ceil(domain[0] / step) * step;
      const count = Math.floor((domain[1] - firstLevel) / step) + 1;
      const levels = [];
      // By index, not by accumulating a float: at 0.0001 steps the drift is
      // visible by the twentieth line
      for (let i = 0; i < count; i++) levels.push(firstLevel + i * step);
      if (levels.length < 2) return null;

      return {
        priceToY,
        levels,
        pitch,
        step,
        top,
        bottom,
        domain,
      };
    });

    _defineProperty(this, "gridGeometry", () => {
      const data = safePrices(this.props.prices);
      const first = data[0];
      const last = data[data.length - 1];
      const key = [
        this.width,
        this.height,
        this.props.predict,
        // the visible window depends on how much of it the board is covering
        this.props.predict ? this.props.futureShare : 0,
        // …and on how far it reaches in price
        this.props.predict ? Math.round(this.effectiveZoom() * 1000) : 0,
        this.props.grid,
        // the step and the window are remembered per range, so the answer is
        // a different one on a different range even for identical-looking data
        this.boardKey(),
        data.length,
        first ? `${+first.time}:${first.price}` : "",
        last ? `${+last.time}:${last.price}` : "",
      ].join("|");
      if (this._geoKey === key) return this._geo;

      const geo = this.props.predict
        ? this.boardGeometry()
        : this.gridGeometryFor();
      this._geoKey = key;
      this._geo = geo;
      return geo;
    });

    /* How much of the right-hand side is board rather than history.
     *
     * The share is what someone dragged the line to; the limits are what the
     * chart insists on either side of that — `MIN_HISTORY_CELLS` and
     * `MIN_BOARD_CELLS`, which are one and two for the reason set out where
     * they are declared. The board's limit is also what keeps the handle
     * reachable: the line is only drawn while there is a board, so a drag that
     * could take the board to nothing would take the handle with it. */
    _defineProperty(this, "futureWidth", () => {
      if (!this.props.predict || !this.width) return 0;
      /* The square's size, not the whole geometry: the lattice is scaled to
       * the *visible* window and the visible window is whatever this function
       * leaves, so asking the geometry here would be asking it to know the
       * answer before it can be worked out. `boardPitch` depends on the chart
       * and the clock — never on the board's own width, because the series is
       * mapped across the full width whatever the board takes — which is
       * exactly why it can be asked first. */
      const pitch = this.boardPitch();
      if (!(pitch > 0)) return 0;
      const share = isFinite(this.props.futureShare)
        ? this.props.futureShare
        : DEFAULT_FUTURE_SHARE;
      const least = MIN_BOARD_CELLS * pitch;
      const most = this.width - MIN_HISTORY_CELLS * pitch;
      // A window too narrow to hold both gives what it can to the board
      if (!(most > least)) return Math.min(this.width * 0.5, least);
      return Math.min(most, Math.max(least, this.width * share));
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
     * So one pixel pitch drives both axes — and which axis chooses it depends
     * on whether there is a board on it.
     *
     * The plain grid ("G") reads prices, so price picks: the step is one of
     * d3's round numbers, chosen as the one whose pixel height lands nearest a
     * comfortable cell, and the vertical lines are then placed at that same
     * pitch from a fixed point on the clock. Columns therefore carry a uniform
     * but arbitrary slice of time — about 2.4 days on a month range — which is
     * the right way round for reading a line: a level you can name is worth
     * more than a date that ends in :00.
     *
     * The board ("L") is pointed at, so time picks. A call is a rectangle of
     * real time, and a rectangle of real time cannot be kept on a lattice whose
     * columns are worth 2.4 days today and 2.6 days when the series has grown a
     * point. So the column comes first and it is a round duration — a rung of
     * `CELL_SPANS`, held for as long as you are on the range — its pixel width
     * follows, and the price step is then sized to *that*, which keeps the
     * cells square and the horizontal labels round. What is given up is that
     * the rows no longer divide the plot a whole number of times; what is
     * bought is that one square is fifteen minutes, today and next week.
     *
     * They are counted from **absolute time**, not back from the right edge.
     *
     * Counting back from "now" kept the lines still on screen and moved the
     * time underneath them: every refresh, a column meant five minutes later
     * than it had a moment ago. A locked call is a fixed rectangle of real
     * time, so it slid out from under the lattice that produced it — after a
     * few refreshes the box you called sat across two squares, and there was
     * no square left on the chart that was the one you pointed at.
     *
     * Anchoring to the clock puts that right: a column covers the same minutes
     * for as long as it keeps its size, and a call stays welded to the square
     * it was made on. The cost is that "now" no longer falls on a boundary —
     * it sits somewhere inside a column, which is why the dashed line is drawn
     * separately and why `cellAt` refuses that column: half of it is already
     * answered, and a band named over drawn history is not a prediction.
     */
    /* Take a node from the pool, or make one the first time.
     *
     * The mesh used to be emptied and rebuilt on every redraw — measured at
     * 42 elements created and 42 destroyed *per frame* of a drag, and the same
     * on every price refresh. Nothing about it needs to be new: the lines are
     * always the same lines in different places, so they are kept and their
     * attributes written over, and whatever is left over from a bigger mesh is
     * hidden rather than removed. This is the SVG version of what every
     * charting library does in canvas — the cost that matters is creating and
     * destroying, not drawing. */
    _defineProperty(this, "poolNode", (pool, tag, parent) => {
      let el = pool.list[pool.at];
      if (!el) {
        el = document.createElementNS("http://www.w3.org/2000/svg", tag);
        pool.list.push(el);
        parent.appendChild(el);
      }
      pool.at++;
      el.setAttribute("visibility", "inherit");
      return el;
    });

    _defineProperty(this, "hideRest", (pool) => {
      for (let i = pool.at; i < pool.list.length; i++) {
        pool.list[i].setAttribute("visibility", "hidden");
      }
    });

    /* Where the top fade finishes, in pixels from the top of the chart — and
     * therefore where the callable part of the board begins, because the two
     * have to be the same line: a square you can barely see is not a square
     * anyone can point at, and one half-covered by the range switcher above it
     * is worse than that.
     *
     * It was a whole pitch, which assumed the sliced part-row at the top was
     * a whole row tall. It is not: the lattice is anchored to absolute price,
     * so the leftover fraction lands wherever it lands — measured at 1280×800,
     * 19.4px of sliced row, and then the fade ran on for another 45px and
     * swallowed the first *complete* square. That square was drawn in full,
     * sat in the middle of the board, and quietly refused to be called.
     *
     * So the boundary comes off the lattice instead: the first gridline far
     * enough down to have something above it worth fading. `FADE_MIN` is what
     * "far enough" means — under it the sliced row is a hairline, the ramp has
     * no room to be a ramp, and the mesh would arrive as the hard edge the
     * fade exists to prevent, so the first whole row goes to the fade as well.
     * Capped at a third of the chart so a very tall square cannot eat the
     * board on a short one. */
    _defineProperty(this, "fadeEnd", () => {
      if (!this.height || !this.gridY || !this.gridY.length) return 0;
      const at = this.gridY.find((y) => y >= FADE_MIN);
      return isFinite(at) ? Math.min(at, this.height / 3) : 0;
    });

    _defineProperty(this, "updateGrid", () => {
      const g = this.gridRef.current;
      if (!g) return;
      /* The mesh gets its own layer so the *mask* can be on the mesh alone.
       * The now-line's handle and the zoom pill live in this group too, and
       * they sit exactly where the fade is strongest — masked with the lattice
       * they would be the two controls on the board you cannot see. */
      if (!this._meshLayer) {
        const layer = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "g",
        );
        layer.setAttribute("mask", `url(#${this.fadeId})`);
        this._meshLayer = layer;
        // First child, so everything created later draws over it
        g.insertBefore(layer, g.firstChild);
      }
      this._gridLines.at = 0;
      this._gridLabels.at = 0;
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
        this.cellMs = 0;
        this.cellStep = 0;
        this.gridOriginX = null;
        this.gridOriginTime = null;
        this.nowX = this.width;
        this.hoverCell = null;
        // Nothing is removed any more, so leaving means hiding what is there
        this.hideRest(this._gridLines);
        this.hideRest(this._gridLabels);
        if (this._nowLine) this._nowLine.setAttribute("visibility", "hidden");
        if (this._nowGrip) this._nowGrip.setAttribute("visibility", "hidden");
        if (this._nowLabel) this._nowLabel.setAttribute("visibility", "hidden");
        if (this._zoomUi) this._zoomUi.setAttribute("visibility", "hidden");
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
      /* The same mapping the series is drawn with — fixed pixels per minute,
       * the whole width, pushed left by the width of the board. The range
       * starts at `-future` because that is where the oldest point now is:
       * off the left edge, where the strip pushed it. Reading `[0, nowX]`
       * here instead would have squeezed the mesh onto the visible part while
       * the price line slid, and the two would have described different
       * minutes at the same x. Time runs out at "now"; the strip to its right
       * is future, and this scale extrapolates into it. */
      const timeToX = scaleTime().range([-future, nowX]).domain([t0, t1]);
      this.nowX = nowX;
      this.timeToX = timeToX;
      this.priceToY = priceToY;
      this.cellPitch = pitch;

      /* Where the lattice starts, in real time.
       *
       * One square is `spanMs` of clock, and the boundaries are the whole
       * multiples of it — the same instants whatever is on screen, so nothing
       * about the lattice depends on when the last candle happened to arrive.
       * The anchor is the last such instant at or before the end of the
       * series, which is therefore never more than one square left of "now".
       * Everything downstream counts from `gridOriginX` rather than `nowX`.
       *
       * With a board on, `spanMs` is the rung the board chose — a round number
       * of minutes, hours or days, held for as long as you are on this range.
       * It used to be read back off the scale (`invert(pitch) - invert(0)`),
       * which made it whatever the pitch happened to be worth on this refresh:
       * a fresh accidental figure every time the series grew by a point, so
       * the boundaries moved under calls that had been locked to the old ones.
       * The plain grid, which has no calls on it and no round duration to keep,
       * still reads it off the scale. */
      const spanMs = this.props.predict
        ? this.cellSpan()
        : +timeToX.invert(pitch) - +timeToX.invert(0);
      const anchored = spanMs > 0 && isFinite(spanMs);
      const originTime = anchored ? Math.floor(+t1 / spanMs) * spanMs : null;
      const originX = anchored ? timeToX(new Date(originTime)) : nowX;
      this.cellMs = anchored ? spanMs : 0;
      this.cellStep = step;
      this.gridOriginTime = isFinite(originX) ? originTime : null;
      this.gridOriginX = isFinite(originX) ? originX : nowX;

      const ns = "http://www.w3.org/2000/svg";
      const mesh = this._meshLayer;
      const line = (x1, y1, x2, y2, dim) => {
        const el = this.poolNode(this._gridLines, "line", mesh);
        el.setAttribute("x1", x1);
        el.setAttribute("y1", y1);
        el.setAttribute("x2", x2);
        el.setAttribute("y2", y2);
        el.setAttribute("stroke", color.border);
        el.setAttribute("stroke-width", "1");
        // Written every time, not only when dim: a reused node still carries
        // whatever the last redraw left on it
        el.setAttribute("opacity", dim ? "0.55" : "1");
      };
      const label = (x, y, text) => {
        const el = this.poolNode(this._gridLabels, "text", mesh);
        el.setAttribute("x", x);
        el.setAttribute("y", y);
        el.setAttribute("fill", color.textSecondary);
        el.setAttribute("font-size", "9");
        el.setAttribute("font-family", font.primary);
        el.setAttribute("letter-spacing", "0.08em");
        // Assigning textContent replaces the text node even when the string is
        // the same one, which on a hover-heavy path is churn for nothing
        if (el.textContent !== text) el.textContent = text;
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
        /* The line always; the label only where it has somewhere to sit. The
         * lattice reaches the very bottom of the chart now that the board
         * scales the window rather than the data, and the price on the lowest
         * line landed on top of the date at the foot of the axis — two
         * different readings in the same few pixels. Cheaper to leave one
         * level unlabelled than to move an axis. */
        if (y - 4 >= 9 && y < this.height - 15) {
          label(4, y - 4, formatAxisPrice(v, step, this.props.currencySymbol));
        }
      });

      /* Move the fade to where the lattice says the sliced row ends. The stop
       * is a fraction of the chart's height because the mask is in
       * object-bounding-box units, which is what lets one mask serve both the
       * mesh and the call boxes. It has to run *after* the levels loop, not
       * before it: `fadeEnd` reads `gridY`, and asking before it is filled got
       * the answer for the previous redraw's lattice. */
      const fadeStop = this.fadeStopRef.current;
      if (fadeStop && this.height) {
        const at = `${((this.fadeEnd() / this.height) * 100).toFixed(2)}%`;
        if (fadeStop.getAttribute("offset") !== at) {
          fadeStop.setAttribute("offset", at);
        }
      }

      /* Out from the anchor in both directions. It sits within one pitch to
       * the left of "now", so everything the first loop draws is history and
       * everything the second draws is future — and both come out ordered
       * nearest-to-"now" first, which is the order the label pass needs. */
      const origin = this.gridOriginX;
      const boundaries = [];
      for (let x = origin; x > -0.5; x -= pitch) {
        this.gridX.push(x);
        line(x, 0, x, this.height);
        boundaries.push({ x });
      }
      // The future strip, dimmer, so it reads as "not drawn yet"
      const futureBoundaries = [];
      for (let x = origin + pitch; x <= this.width + 0.5; x += pitch) {
        this.gridX.push(x);
        line(x, 0, x, this.height, true);
        futureBoundaries.push({ x });
      }

      /* Labelling the time axis, and why it is sparse.
       *
       * On the plain grid a column is one pitch wide and the pitch comes from
       * a round *price* step, so a column is a uniform but arbitrary slice of
       * time — about 2.4 days on a month range. Squares and round numbers on
       * both axes cannot both hold, and there price keeps the round numbers.
       * (With a board on it is the other way round and the boundaries do land
       * on the clock, which only makes the labels easier.)
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
      const timeLabel = (x) => crosshairDate(xToTime(x), this.props.period);

      /* Lines first, labels second, and why they are two passes.
       *
       * The label rule has to hold across the whole axis, not within one
       * loop. Drawing them inside the two line loops meant the history side
       * enforced a gap and the future side enforced none — so asking for more
       * squares made the pitch smaller and printed a date at every one of
       * them, and past about six squares the bottom right became a smear of
       * overlapping timestamps. The count you chose decided whether the axis
       * was readable, which is not a trade anyone opted into.
       *
       * Collecting the boundaries first and then walking outwards from "now"
       * applies one rule everywhere: never place a label that would touch the
       * last one placed on that side. */

      /* Roughly how wide a label will be. Measuring each one with
       * getComputedTextLength would be exact but forces a layout per label on
       * every redraw; the axis font is fixed at 9px with 0.08em tracking, so
       * a per-character estimate is within a few pixels and costs nothing. */
      const LABEL_CHAR = 6.2;
      const LABEL_PAD = 14;
      const labelWidth = (text) => text.length * LABEL_CHAR + LABEL_PAD;

      /* "now" is a line, not a boundary, so its label goes on the line — and
       * it is placed before any date, so the dates give way to it rather than
       * the other way round. It used to be the label of the boundary that sat
       * at the right-hand edge; there is no such boundary now. */
      let leftEdge = Infinity;
      if (this.props.predict && future > 0) {
        label(nowX + 4, this.height - 6, "now");
        leftEdge = nowX;
      }
      // Outward from "now" in both directions, so the anchor is the boundary
      // that matters rather than whichever edge the loop happened to start at.
      for (const b of boundaries) {
        const text = timeLabel(b.x);
        const w = labelWidth(text);
        if (b.x + w > leftEdge) continue;
        leftEdge = b.x;
        label(b.x + 4, this.height - 6, text);
      }
      /* The future side starts from where the "now" label ends, so the first
       * date can never sit on top of it. */
      let rightEdge = nowX + (this.props.predict ? labelWidth("now") : 0);
      for (const b of futureBoundaries) {
        const text = timeLabel(b.x);
        const w = labelWidth(text);
        if (b.x < rightEdge) continue;
        if (b.x + w > this.width) continue; // would run off the edge
        rightEdge = b.x + w;
        label(b.x + 4, this.height - 6, text);
      }
      if (future > 0) {
        /* "now" itself gets the one emphatic line on the chart — kept from
         * redraw to redraw like everything else in here, and with it the grip
         * that says it can be pulled. Rebuilding the grip meant rebuilding a
         * group, a rect, two paths and a title five times a second during a
         * drag, for a shape that never changes. */
        if (!this._nowLine) {
          const el = document.createElementNS(ns, "line");
          el.setAttribute("stroke-dasharray", "2 3");
          el.setAttribute("class", "pt-now-line");
          const title = document.createElementNS(ns, "title");
          title.textContent = "Drag to change how far ahead you can call";
          el.appendChild(title);
          this._nowLine = el;
          g.appendChild(el);
        }
        const el = this._nowLine;
        el.setAttribute("visibility", "inherit");
        el.setAttribute("x1", nowX);
        el.setAttribute("y1", 0);
        el.setAttribute("x2", nowX);
        el.setAttribute("y2", this.height);
        el.setAttribute("stroke", color.textSecondary);
        // Held or hovered, it comes up to full strength — set here too so a
        // redraw during a drag does not put it back to its resting weight
        const held = Boolean(this.nowDrag) || this._grabbable;
        el.setAttribute("stroke-width", held ? "2" : "1");
        el.setAttribute("opacity", held ? "1" : "0.65");

        if (this.props.onFutureShareChange) {
          if (!this._nowGrip) {
            /* The handle, and why it looks like this.
             *
             * It was an 18×20 tab carrying two chevrons 11px apart, resting at
             * 0.55 opacity at the very top of the chart. At that size the two
             * chevrons close into a diamond — measured on screen, it reads as a
             * lozenge, not as "drag me sideways" — and 0.55 made the one
             * control on the board the faintest mark on it. So: a wider tab
             * with three upright grip lines, which is the one shape everything
             * draggable has used for thirty years, and a resting opacity you
             * can actually see.
             *
             * It is also a real slider now. `role="slider"` with the value in
             * *squares of board* (the unit the thing is measured in), focusable,
             * and driven by the arrow keys — because the stepper that used to
             * set this was removed when the drag replaced it, which left the
             * setting reachable by pointer only.
             */
            const grip = document.createElementNS(ns, "g");
            grip.setAttribute("class", "pt-now-grip");
            grip.setAttribute("tabindex", "0");
            grip.setAttribute("role", "slider");
            grip.setAttribute("aria-label", "How far ahead you can call");
            const tab = document.createElementNS(ns, "rect");
            tab.setAttribute("y", 1);
            tab.setAttribute("width", 26);
            tab.setAttribute("height", 22);
            tab.setAttribute("rx", 6);
            grip.appendChild(tab);
            const bars = [];
            for (const dx of [-4, 0, 4]) {
              const bar = document.createElementNS(ns, "line");
              bar.setAttribute("stroke-width", "1.5");
              bar.setAttribute("stroke-linecap", "round");
              bar.dataset.dx = String(dx);
              grip.appendChild(bar);
              bars.push(bar);
            }
            const gripTitle = document.createElementNS(ns, "title");
            gripTitle.textContent =
              "Drag, or use the arrow keys, to change how far ahead you can call";
            grip.appendChild(gripTitle);
            grip.addEventListener("keydown", this.handleNowKey);
            this._nowGrip = grip;
            this._nowGripParts = { tab, bars };
            g.appendChild(grip);

            /* What the drag buys, said where the hand is.
             *
             * The reach and the size of a square are in the calls panel, which
             * is a different overlay — so while you were dragging, the one
             * number the drag changes was on a screen you could not see. */
            const label = document.createElementNS(ns, "g");
            label.setAttribute("class", "pt-now-readout");
            label.setAttribute("pointer-events", "none");
            const labelBox = document.createElementNS(ns, "rect");
            labelBox.setAttribute("rx", 4);
            labelBox.setAttribute("height", 16);
            labelBox.setAttribute("y", 4);
            label.appendChild(labelBox);
            const labelText = document.createElementNS(ns, "text");
            labelText.setAttribute("font-size", "9");
            labelText.setAttribute("letter-spacing", "0.06em");
            labelText.setAttribute("y", 15.5);
            label.appendChild(labelText);
            this._nowLabel = label;
            this._nowLabelParts = { box: labelBox, text: labelText };
            g.appendChild(label);
          }
          const { tab, bars } = this._nowGripParts;
          this._nowGrip.setAttribute("visibility", "inherit");
          this._nowGrip.setAttribute("opacity", held ? "1" : "0.75");
          tab.setAttribute("x", nowX - 13);
          tab.setAttribute("fill", color.bgSecondary);
          tab.setAttribute("stroke", held ? color.text : color.border);
          for (const bar of bars) {
            const bx = nowX + Number(bar.dataset.dx);
            bar.setAttribute("x1", bx);
            bar.setAttribute("x2", bx);
            bar.setAttribute("y1", 7);
            bar.setAttribute("y2", 17);
            bar.setAttribute("stroke", held ? color.text : color.textSecondary);
          }

          /* The slider's value, in the unit the board is measured in. Squares,
           * not pixels and not a percentage: "four squares of board" is the
           * thing someone is actually setting. */
          const { pitch, least, most } = this.nowLimits();
          if (pitch > 0) {
            const cells = (px) => Math.round(px / pitch);
            this._nowGrip.setAttribute("aria-valuemin", String(cells(least)));
            this._nowGrip.setAttribute("aria-valuemax", String(cells(most)));
            this._nowGrip.setAttribute("aria-valuenow", String(cells(future)));
            const reach = +xToTime(this.width) - +xToTime(nowX);
            const ahead = describeSpan(reach);
            this._nowGrip.setAttribute(
              "aria-valuetext",
              `${cells(future)} squares of board${ahead ? `, ${ahead} ahead` : ""}`,
            );

            /* Shown while the hand is on it, or while it has focus — not
             * always. A number that is on screen the whole time stops being
             * read; one that appears when you touch the control is the answer
             * to the question you are asking at that moment. */
            const showing = Boolean(this.nowDrag) || held;
            const { box, text } = this._nowLabelParts;
            if (showing && ahead) {
              const words = `${ahead} ahead`;
              if (text.textContent !== words) text.textContent = words;
              const w = words.length * 5.4 + 12;
              // Flipped to the left when the board is too narrow to hold it
              const left = nowX + 16 + w > this.width - 2;
              const bx = left ? nowX - 16 - w : nowX + 16;
              box.setAttribute("x", bx);
              box.setAttribute("width", w);
              box.setAttribute("fill", color.bgSecondary);
              box.setAttribute("stroke", color.border);
              text.setAttribute("x", bx + 6);
              text.setAttribute("fill", color.text);
              text.setAttribute("font-family", font.primary);
              this._nowLabel.setAttribute("visibility", "inherit");
            } else {
              this._nowLabel.setAttribute("visibility", "hidden");
            }
          }
        }
      /* The board's own zoom, drawn on the board.
       *
       * Nothing said the scale could be changed. The wheel worked in silence,
       * the two keys were in a list nobody has open while they are calling,
       * and the panel's buttons are in another overlay — so the answer to "can
       * I reach further than this?" was "only if you already knew". A control
       * that exists is the only reliable way to say a thing is possible.
       *
       * It sits at the top of the strip because that is the strip it governs,
       * and it carries what the board currently covers between its two
       * buttons: the number that decides whether the call you have in mind has
       * a square at all. Quiet at rest, full under the pointer — the same
       * manners as every other control on this chart. */
      if (future > 0 && this.props.onBoardZoomChange) {
        if (!this._zoomUi) {
          const ui = document.createElementNS(ns, "g");
          ui.setAttribute("class", "pt-zoom");
          /* The whole pill takes the pointer, not only its two buttons. The
           * grid layer it lives in passes events through, so hovering the
           * middle — the label — left the control at its resting weight while
           * the pointer was on it. And a click on the body must not reach the
           * chart underneath: pressing a control is not pointing at a square. */
          ui.setAttribute("pointer-events", "auto");
          ui.addEventListener("click", (e) => e.stopPropagation());
          const parts = { buttons: [], label: null, box: null };
          const box = document.createElementNS(ns, "rect");
          box.setAttribute("rx", 5);
          box.setAttribute("height", 18);
          box.setAttribute("y", 5);
          ui.appendChild(box);
          parts.box = box;
          for (const dir of [1, -1]) {
            const b = document.createElementNS(ns, "g");
            b.setAttribute("class", "pt-zoom-btn");
            b.setAttribute("tabindex", "0");
            b.setAttribute("role", "button");
            b.setAttribute(
              "aria-label",
              dir > 0
                ? "Zoom the board out — a wider band, far enough to call a big move"
                : "Zoom the board in — a tighter band",
            );
            const hit = document.createElementNS(ns, "rect");
            hit.setAttribute("y", 5);
            hit.setAttribute("width", 18);
            hit.setAttribute("height", 18);
            hit.setAttribute("fill", "transparent");
            b.appendChild(hit);
            const glyph = document.createElementNS(ns, "text");
            glyph.setAttribute("y", 18);
            glyph.setAttribute("text-anchor", "middle");
            glyph.setAttribute("font-size", "12");
            glyph.textContent = dir > 0 ? "+" : "−";
            b.appendChild(glyph);
            const title = document.createElementNS(ns, "title");
            title.textContent =
              (dir > 0 ? "Zoom out" : "Zoom in") +
              " — scroll over the chart, or [ and ]";
            b.appendChild(title);
            const go = () => this.zoomBoard(dir);
            b.addEventListener("click", (e) => {
              e.stopPropagation();
              go();
            });
            b.addEventListener("keydown", (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              go();
            });
            ui.appendChild(b);
            parts.buttons.push({ node: b, hit, glyph, dir });
          }
          /* The readout between the two buttons is also the way back.
           *
           * The zoom is held per range and survives the tab, so it is easy to
           * come back to an hour chart a day later, find the board reaching
           * eight times further than you want, and have to count clicks back
           * — with no way to know when you have arrived, because nothing on
           * screen said which notch was the ordinary one. Pressing the number
           * returns it. The number is where the eye already is when the
           * question "how far does this reach?" is being asked, so it is the
           * right thing to press, and it costs no extra furniture on a strip
           * that is meant to be pointed at rather than operated.
           *
           * It is only a control while there is something to undo. At the
           * default the group loses its cursor, its focus stop and its name,
           * because a button that cannot change anything is a promise the
           * next click breaks — the same rule the two ± buttons already
           * follow at the ends of the ladder. */
          const home = document.createElementNS(ns, "g");
          home.setAttribute("class", "pt-zoom-home");
          const homeHit = document.createElementNS(ns, "rect");
          homeHit.setAttribute("y", 5);
          homeHit.setAttribute("height", 18);
          homeHit.setAttribute("fill", "transparent");
          home.appendChild(homeHit);
          const label = document.createElementNS(ns, "text");
          label.setAttribute("y", 18);
          label.setAttribute("text-anchor", "middle");
          label.setAttribute("font-size", "9");
          label.setAttribute("letter-spacing", "0.06em");
          home.appendChild(label);
          /* A rule under the number, drawn only when pressing it would do
           * something. An underline is the one mark that reads as "this can be
           * pressed" without adding a glyph the operating system draws.
           *
           * A `rect` one pixel tall rather than a `line`, and that is not
           * fussiness: on this chart a `line` *is* the lattice. Anything
           * reading geometry out of the DOM — the panel, a test, the next
           * person — collects lines and divides consecutive ones to get the
           * pitch, and a decorative 40px line at y=21 lands in that set and
           * quietly halves the answer. It cost three separate assertions
           * before the cause was found. A rect cannot be mistaken for a
           * gridline by anybody. */
          const homeRule = document.createElementNS(ns, "rect");
          homeRule.setAttribute("height", "1");
          home.appendChild(homeRule);
          const homeTitle = document.createElementNS(ns, "title");
          home.appendChild(homeTitle);
          const goHome = () => {
            if (this.props.boardZoom === DEFAULT_BOARD_ZOOM) return;
            this.props.onBoardZoomChange(DEFAULT_BOARD_ZOOM);
          };
          home.addEventListener("click", (e) => {
            e.stopPropagation();
            goHome();
          });
          home.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            goHome();
          });
          ui.appendChild(home);
          parts.label = label;
          parts.home = home;
          parts.homeHit = homeHit;
          parts.homeRule = homeRule;
          parts.homeTitle = homeTitle;
          this._zoomUi = ui;
          this._zoomParts = parts;
          g.appendChild(ui);
        }
        const { buttons, label, box, home, homeHit, homeRule, homeTitle } =
          this._zoomParts;
        const rows = this.callableRows();
        const covers = step * rows;
        /* Decimals from the number being printed, not from the square's step:
         * with the step as the guide the same control read "±$1.0K" at one
         * notch and "±$2K" at the next. */
        const half = covers / 2;
        const text = `±${formatAxisPrice(half, half, this.props.currencySymbol)}`;
        if (label.textContent !== text) label.textContent = text;
        const textW = text.length * 5.6;
        const w = 18 * 2 + textW + 8;
        // Tucked against the right edge of the board, which is the strip it is
        // the control for
        const x = Math.max(nowX + 2, this.width - w - 4);
        box.setAttribute("x", x);
        box.setAttribute("width", w);
        box.setAttribute("fill", color.bgSecondary);
        box.setAttribute("stroke", color.border);
        buttons[0].hit.setAttribute("x", x + w - 18);
        buttons[0].glyph.setAttribute("x", x + w - 9);
        buttons[1].hit.setAttribute("x", x);
        buttons[1].glyph.setAttribute("x", x + 9);
        label.setAttribute("x", x + w / 2);
        label.setAttribute("fill", color.text);
        label.setAttribute("font-family", font.primary);

        /* The way back, live only when it leads somewhere. */
        const atHome = this.props.boardZoom === DEFAULT_BOARD_ZOOM;
        homeHit.setAttribute("x", x + 18);
        homeHit.setAttribute("width", Math.max(0, w - 36));
        homeRule.setAttribute("x", x + w / 2 - textW / 2);
        homeRule.setAttribute("width", Math.max(0, textW));
        homeRule.setAttribute("y", 21);
        homeRule.setAttribute("fill", color.text);
        homeRule.setAttribute("opacity", atHome ? "0" : "0.5");
        home.setAttribute("pointer-events", atHome ? "none" : "auto");
        if (atHome) {
          home.removeAttribute("tabindex");
          home.removeAttribute("role");
          home.removeAttribute("aria-label");
          homeTitle.textContent = "How far the board reaches, up and down";
        } else {
          home.setAttribute("tabindex", "0");
          home.setAttribute("role", "button");
          home.setAttribute("aria-label", "Back to the default board reach");
          homeTitle.textContent = "Back to the default reach";
        }
        for (const b of buttons) {
          const zoom = this.props.boardZoom > 0 ? this.props.boardZoom : 1;
          const spent =
            b.dir > 0 ? zoom >= BOARD_ZOOM_MAX : zoom <= BOARD_ZOOM_MIN;
          b.glyph.setAttribute("fill", color.text);
          b.glyph.setAttribute("font-family", font.primary);
          b.node.setAttribute("opacity", spent ? "0.25" : "1");
          b.node.setAttribute("pointer-events", spent ? "none" : "auto");
          b.node.setAttribute("aria-disabled", spent ? "true" : "false");
        }
        this._zoomUi.setAttribute("visibility", "inherit");
      } else if (this._zoomUi) {
        this._zoomUi.setAttribute("visibility", "hidden");
      }
      } else if (this._nowLine) {
        if (this._nowLabel) this._nowLabel.setAttribute("visibility", "hidden");
        if (this._zoomUi) this._zoomUi.setAttribute("visibility", "hidden");
        this._nowLine.setAttribute("visibility", "hidden");
        if (this._nowGrip) this._nowGrip.setAttribute("visibility", "hidden");
      }

      this.hideRest(this._gridLines);
      this.hideRest(this._gridLabels);

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
        // `spanMs` is the lattice's own step, worked out where the lattice was
        // — recomputing it here from the scale gave the same number twice
        const next = {
          step,                                  // price per square
          spanMs,                                // time per square
          /* How far the board reaches in *price*, from the live price to the
           * edge of the window. This is the number that decides whether the
           * call you have in mind has a square at all — and the one the panel
           * could not say before, because nothing computed it. */
          covers: step * this.callableRows(),
          zoom: this.effectiveZoom(),
          /* How far the board reaches: the edge of the chart, in time. Counted
           * in whole callable squares instead it stepped by one every time the
           * lattice drifted a square under "now", which is a number changing
           * while nobody is touching anything. The far edge does not drift. */
          reachMs: +xToTime(this.width) - +xToTime(nowX),
        };
        const last = this._lastGeo;
        if (
          !last ||
          last.step !== next.step ||
          last.zoom !== next.zoom ||
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
        this.plotPadY(),
        this.plotPadY(),
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
        svg.addEventListener("wheel", this.handleWheel, { passive: false });
      svg.addEventListener("pointermove", this.handlePointerMove, {
          passive: true,
        });
        svg.addEventListener("pointerdown", this.handlePointerDown, {
          passive: true,
        });
        svg.addEventListener("pointerup", this.handlePointerUp, {
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
      this.draftAt = null;
      /* The step and the window used to be cleared here, because one shared
       * value would otherwise carry a scale from a different order of
       * magnitude across a change of coin. They are now held per coin,
       * currency and range instead of being thrown away — which is the same
       * protection and one more thing besides: come back to the hour after an
       * hour on the year, and the squares are the squares you left. */
    }

    /* The board's reach changed. Every square is about to be worth something
     * else, so a draft pointed at one of them is not a thought about anything
     * any more — and the scale travels rather than jumps, which is what lets
     * you see your own locked calls grow or shrink instead of finding them
     * somewhere new. */
    if (prevProps.boardZoom !== this.props.boardZoom) {
      /* Let go of the held step. Stickiness exists so a *drifting* market does
       * not re-step the square under a locked call, and its band is ±2× — which
       * is exactly one notch of zoom, so pressing the button once did nothing
       * at all. A zoom is not drift: it is someone asking, and an ask always
       * takes effect. */
      const board = this.board();
      board.step = 0;
      board.base = null;
      this.zoomAnim = {
        from: this._zoomShown || prevProps.boardZoom || 1,
        start: Date.now(),
      };
      this.draftAt = null;
      this.clearHover();
      if (!this.zoomRaf) this.zoomRaf = requestAnimationFrame(this.runZoomAnim);
    }

    if (
      prevProps.grid !== this.props.grid ||
      prevProps.predict !== this.props.predict ||
      prevProps.futureShare !== this.props.futureShare ||
      prevProps.boardZoom !== this.props.boardZoom
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

    /* The bigger show, on its own counter. Separate from `celebrate` because
     * the two answer different questions — "a call came true" and "that one
     * was worth something" — and because this one has to work when the board
     * is not drawn at all, which is exactly the case `burst` cannot serve. */
    if (
      this.props.fireworks &&
      prevProps.fireworks !== this.props.fireworks
    ) {
      this.fireworks();
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
    if (this.dragRaf) cancelAnimationFrame(this.dragRaf);
    if (this.zoomRaf) cancelAnimationFrame(this.zoomRaf);
    clearTimeout(this.lockPulseTimer);
    clearTimeout(this._fireworkSweep);
    const svg = this.svgRef.current;
    if (svg && this.props.interactive) {
      svg.removeEventListener("wheel", this.handleWheel);
      svg.removeEventListener("pointermove", this.handlePointerMove);
      svg.removeEventListener("pointerdown", this.handlePointerDown);
      svg.removeEventListener("pointerup", this.handlePointerUp);
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
        /* The top of the board, fading out.
         *
         * The lattice used to stop dead at the chart's top edge — a hard line
         * of cut-off squares directly under the range switcher, which read as
         * the mesh running into the furniture above it. This fades it instead:
         * a luminance mask whose ramp covers the topmost row, so the squares
         * arrive rather than being sliced, and there is nothing left of them by
         * the time the eye reaches 1H / 1D.
         *
         * A gradient and not a per-row opacity. Setting each row's own opacity
         * banded it — every boundary between two rows became a visible seam,
         * which is precisely the thing this is meant to remove. */
        React.createElement(
          "linearGradient",
          { id: this.fadeGradId, x1: "0", y1: "0", x2: "0", y2: "1" },
          React.createElement("stop", {
            offset: "0%",
            stopColor: "#fff",
            stopOpacity: 0,
          }),
          React.createElement("stop", {
            ref: this.fadeStopRef,
            offset: "12%",
            stopColor: "#fff",
            stopOpacity: 1,
          }),
          React.createElement("stop", {
            offset: "100%",
            stopColor: "#fff",
            stopOpacity: 1,
          }),
        ),
        React.createElement(
          "mask",
          { id: this.fadeId, maskUnits: "objectBoundingBox" },
          React.createElement("rect", {
            x: "0",
            y: "0",
            width: "100%",
            height: "100%",
            fill: `url(#${this.fadeGradId})`,
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
          // Boxes fade with the mesh they sit on. One left solid over a faded
          // lattice would be a call floating in the furniture.
          mask: `url(#${this.fadeId})`,
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
      /* The celebration's own layer. It carries a class so anything counting
       * what the burst drew can ask for *its* elements rather than for a style
       * — the rays were identified by `stroke-linecap="round"`, which the
       * board's grip bars also use, so a test for "the burst cleaned up after
       * itself" started counting the handle. */
      React.createElement("g", {
        ref: this.burstRef,
        className: "pt-burst",
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
          React.createElement("text", {
            ref: this.hoverNoteRef,
            visibility: "hidden",
            fill: color.text,
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

