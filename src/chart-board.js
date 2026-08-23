/* CHART BOARD GEOMETRY — cut out of `chart.js`
 *
 * Twenty-five members, 782 contiguous lines, moved on 22 Aug 2026 out of a
 * 4,753-line class. The seam is not arbitrary and it is not a line count: it
 * is the one this file already drew for itself. Everything here answers
 * **how big is a square and where does the window sit** — the pitch, the
 * price step, the zoom, the visible slice, the fade boundary, the node pool.
 * `updateGrid`, which begins on the line after the last of these, answers
 * **put it on screen**. `CLAUDE.md` states the split in its own words:
 * "`gridGeometry()` is lifted out of `updateGrid` precisely because
 * `updatePath` needs the pitch *first*."
 *
 * `chart.js` had no block of pure helpers to lift — measured before the cut,
 * 95 members and **three** of them touch no `this`. What it had was this run,
 * and the run is contiguous, which is what made moving it a move rather than
 * a rearrangement. Nothing was renamed and nothing reordered.
 *
 * Same idiom as `app-portfolio.js` and `settings-preferences.js`: a plain
 * function handed the component. `chart` is the `LineBase` instance and there
 * is no `this` in this file, deliberately — the constructor does
 * `Object.assign(this, boardGeometry(this))`, so every name lands back exactly
 * where it was and every caller is unchanged.
 *
 * Loads before `chart.js` in `index.html`.
 */
const chartBoardGeometry = (chart) => ({
    plotPadY: () => (chart.props.predict ? 0 : PADDING),

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
    callableRows: () => {
      const pitch = chart.cellPitch || chart.boardPitch();
      if (!(pitch > 0) || !chart.height) return 1;
      return Math.max(1, Math.floor((chart.height - chart.fadeEnd()) / pitch));
    },

    /* The size a square would ideally be, in pixels: about a sixth of the plot,
     * which is a comfortable reading grid. Nothing is drawn at this size — it
     * is only what the ladder of round durations is measured against. */
    targetPitch: () => {
      const plot = chart.height - PADDING * 2;
      if (!(plot > 0)) return 0;
      return Math.max(46, Math.min(104, plot / 6));
    },

    /* Milliseconds per pixel, which is the one number that ties the clock to
     * the chart. The series is mapped across the *whole* width — the board
     * pushes the past off the left edge rather than squeezing it — so this is
     * independent of how wide the board is, and `boardPitch` can therefore be
     * worked out before `futureWidth` without any circularity. */
    msPerPx: () => {
      const data = safePrices(chart.props.prices);
      const t0 = +data[0].time;
      const t1 = +data[data.length - 1].time;
      const per = (t1 - t0) / chart.width;
      return isFinite(per) && per > 0 ? per : 0;
    },

    /* A square already called is the square to keep.
     *
     * A new tab is a fresh context with no memory of the lattice, and the range
     * drifts, so the rung nearest "comfortable" today is not guaranteed to be
     * the rung a call was made on a week ago. The calls themselves record what
     * a square was worth, so they are the memory: if one of them still names a
     * rung, and that rung is still a reasonable square, the board adopts it and
     * the box lands exactly where it was drawn. Legacy calls carry the old
     * accidental spans and are ignored here — `isCellSpan` is the filter. */
    calledSpan: () => {
      const calls = Array.isArray(chart.props.calls) ? chart.props.calls : [];
      const mine = calls.find(
        (c) =>
          c.coin === chart.props.coin &&
          c.currency === chart.props.currency &&
          c.period === chart.props.period &&
          isCellSpan(c.span),
      );
      return mine ? mine.span : 0;
    },

    /* How much clock one square covers: a rung of `CELL_SPANS`, held per range.
     *
     * Held, because the ideal square moves a hair on every refresh and a
     * lattice that re-steps under a locked call is the whole problem this
     * solves. Per range, because that is the unit someone is thinking in —
     * switching to a year and back must bring the same squares back, which it
     * cannot do if the memory was thrown away at the switch. */
    cellSpan: () => {
      const per = chart.msPerPx();
      const want = chart.targetPitch() * per;
      if (!(want > 0)) return 0;

      const key = chart.props.period || "";
      const held = chart._cellMs[key];
      const comfortable = (ms) =>
        ms / want >= CELL_KEEP_LO && ms / want <= CELL_KEEP_HI;
      if (held && comfortable(held)) return held;

      const seed = chart.calledSpan();
      const chosen = comfortable(seed)
        ? seed
        : CELL_SPANS.reduce((a, b) =>
            Math.abs(Math.log(b / want)) < Math.abs(Math.log(a / want)) ? b : a,
          );
      chart._cellMs[key] = chosen;
      return chosen;
    },

    /* How wide a square is, in pixels — the rung, converted. Everything else
     * bends to this: the price step is chosen so its pixel height matches, and
     * the board's width is measured in whole squares of it. Where the clock
     * cannot be read (no width, a single point) it falls back to the
     * comfortable size, which is what the plain grid uses. */
    boardPitch: () => {
      const per = chart.msPerPx();
      const ms = chart.cellSpan();
      const px = per > 0 && ms > 0 ? ms / per : 0;
      /* Bounded at both ends, because the clock cannot always be read. Before
       * the first response the series is a two-point stand-in a millisecond
       * wide, and a rung of the ladder measured against that comes out
       * millions of pixels across. Where the answer is not a square anyone
       * could point at, the comfortable size stands in. */
      return px > 4 && px < chart.height ? px : chart.targetPitch();
    },

    /* The part of the series that is actually on screen.
     *
     * With the board taking width out of the left, most of the range can be
     * off the edge — and a price scale sized for data nobody can see draws the
     * visible part as a flat squiggle in the middle of an empty chart. The
     * window the board is scaled to is the window you are looking at. */
    visibleSlice: () => {
      const data = safePrices(chart.props.prices);
      if (data.length < 2) return null;
      const t0 = +data[0].time;
      const t1 = +data[data.length - 1].time;
      const span = t1 - t0;
      if (!(span > 0) || !chart.width) return data;
      const cut = t0 + (span * chart.futureWidth()) / chart.width;
      const from = data.filter((d) => +d.time >= cut);
      // Never fewer than two points: a window that has outrun the data still
      // has to have a scale
      return from.length >= 2 ? from : data.slice(-2);
    },

    /* The zoom, and the fact that it travels rather than jumps.
     *
     * A scale that changes between two frames leaves you working out what just
     * happened to the boxes; one that travels tells you which way it went and
     * carries every locked call with it, so you can see your own claims get
     * bigger or smaller rather than finding them somewhere new. 260ms of
     * ease-out, redrawn per frame off the same rAF the drag uses.
     */
    effectiveZoom: () => {
      const to = chart.props.boardZoom > 0 ? chart.props.boardZoom : 1;
      const anim = chart.zoomAnim;
      let shown = to;
      if (anim) {
        const t = (Date.now() - anim.start) / BOARD_ZOOM_MS;
        if (t >= 1) chart.zoomAnim = null;
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
      chart._zoomShown = shown;
      return shown;
    },

    runZoomAnim: () => {
      chart.zoomRaf = 0;
      if (!chart.zoomAnim) return;
      chart.updatePath();
      if (chart.zoomAnim) {
        chart.zoomRaf = requestAnimationFrame(chart.runZoomAnim);
      } else {
        chart.updatePath(); // the last frame, on the exact value
      }
    },

    /* One notch of zoom. Positive is out — each square worth more, the board
     * reaching further, which is the direction someone reaches for when the
     * call they want to make is off the screen. */
    zoomBoard: (dir) => {
      if (!chart.props.predict || typeof chart.props.onBoardZoomChange !== "function") {
        return;
      }
      const now = chart.props.boardZoom > 0 ? chart.props.boardZoom : 1;
      const i = BOARD_ZOOM_STEPS.indexOf(now);
      const at = i === -1 ? BOARD_ZOOM_STEPS.indexOf(DEFAULT_BOARD_ZOOM) : i;
      const next = BOARD_ZOOM_STEPS[Math.min(BOARD_ZOOM_STEPS.length - 1, Math.max(0, at + dir))];
      if (next === now) return;
      /* Only asks. The travel is started by the prop coming back changed —
       * see `componentDidUpdate` — so the wheel, the keys and the panel's two
       * buttons all animate, rather than only the one that happens to run
       * through here. */
      chart.props.onBoardZoomChange(next);
    },

    handleWheel: (e) => {
      if (!chart.props.predict || typeof chart.props.onBoardZoomChange !== "function") {
        return;
      }
      /* The page does not scroll, so the wheel is free — and over a board it
       * means one thing everywhere else it is used. Ctrl/⌘ is the browser's
       * own page zoom; leave it alone. */
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const now = Date.now();
      // A trackpad fires a stream of small deltas; one notch per gesture beat
      if (now - (chart._lastWheel || 0) < 220) return;
      chart._lastWheel = now;
      chart.zoomBoard(e.deltaY > 0 ? 1 : -1);
    },

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
    cellVolatility: () => {
      const data = safePrices(chart.props.prices);
      const cell = chart.cellSpan();
      if (!(cell > 0) || data.length < 4) return 0;
      const key = `${data.length}|${cell}|${+data[0].time}|${data[0].price}`;
      if (chart._volKey === key) return chart._vol;
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
      chart._volKey = key;
      chart._vol = vol;
      return vol;
    },

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
    boardKey: () =>
      `${chart.props.coin}|${chart.props.currency}|${chart.props.period}`,

    board: () => {
      const key = chart.boardKey();
      if (!chart._boards[key]) chart._boards[key] = { step: 0, base: null, baseStep: 0 };
      return chart._boards[key];
    },

    calledStep: () => {
      const calls = Array.isArray(chart.props.calls) ? chart.props.calls : [];
      const mine = calls.find(
        (c) =>
          c.coin === chart.props.coin &&
          c.currency === chart.props.currency &&
          c.period === chart.props.period &&
          c.hi > c.lo,
      );
      return mine ? mine.hi - mine.lo : 0;
    },

    boardStep: (range, rows) => {
      const held = chart.board();
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
      const fair = chart.cellVolatility();
      /* …and then whatever the zoom asks for. Zoom is the answer to the
       * question sizing cannot answer on its own: a square small enough to be
       * a tight call puts the board's whole reach three squares either side of
       * the price, so "it falls off a cliff" — the one call an hour chart most
       * invites — has nothing to point at. One size cannot serve both, so the
       * size is yours. */
      const zoom = chart.effectiveZoom();
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
      const travelling = Boolean(chart.zoomAnim);
      if (!travelling && fits(held.step)) return held.step;
      const seed = chart.calledStep();
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
    },

    /* The plain grid's lattice: the price scale, the levels and the pixel
     * pitch, all fitted to the data the way the rest of the chart is. This is
     * the no-board path — with calls on, `boardGeometry` takes over, because a
     * board needs a square that does not change size when the price does. */
    gridGeometryFor: () => {
      const data = safePrices(chart.props.prices);
      if (data.length < 2 || !chart.height) return null;
      const [lo, hi] = extent(data, (d) => d.price);
      if (!isFinite(lo) || !isFinite(hi) || lo === hi) return null;

      const top = PADDING;
      const bottom = chart.height - PADDING;
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
    },

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
    boardGeometry: () => {
      const slice = chart.visibleSlice();
      if (!slice || !chart.height) return null;
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
      const bottom = chart.height;
      const plot = bottom - top;
      const pitch = chart.boardPitch();
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
      const step = chart.boardStep(range, rows);
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
      const held = chart.board();
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
    },

    gridGeometry: () => {
      const data = safePrices(chart.props.prices);
      const first = data[0];
      const last = data[data.length - 1];
      const key = [
        chart.width,
        chart.height,
        chart.props.predict,
        // the visible window depends on how much of it the board is covering
        chart.props.predict ? chart.props.futureShare : 0,
        // …and on how far it reaches in price
        chart.props.predict ? Math.round(chart.effectiveZoom() * 1000) : 0,
        chart.props.grid,
        // the step and the window are remembered per range, so the answer is
        // a different one on a different range even for identical-looking data
        chart.boardKey(),
        data.length,
        first ? `${+first.time}:${first.price}` : "",
        last ? `${+last.time}:${last.price}` : "",
      ].join("|");
      if (chart._geoKey === key) return chart._geo;

      const geo = chart.props.predict
        ? chart.boardGeometry()
        : chart.gridGeometryFor();
      chart._geoKey = key;
      chart._geo = geo;
      return geo;
    },

    /* How much of the right-hand side is board rather than history.
     *
     * The share is what someone dragged the line to; the limits are what the
     * chart insists on either side of that — `MIN_HISTORY_CELLS` and
     * `MIN_BOARD_CALLABLE` (plus the part-column it sits behind), both one
     * for the reason set out where they are declared. The board's limit is also what keeps the handle
     * reachable: the line is only drawn while there is a board, so a drag that
     * could take the board to nothing would take the handle with it. */
    futureWidth: () => {
      if (!chart.props.predict || !chart.width) return 0;
      /* The square's size, not the whole geometry: the lattice is scaled to
       * the *visible* window and the visible window is whatever this function
       * leaves, so asking the geometry here would be asking it to know the
       * answer before it can be worked out. `boardPitch` depends on the chart
       * and the clock — never on the board's own width, because the series is
       * mapped across the full width whatever the board takes — which is
       * exactly why it can be asked first. */
      const pitch = chart.boardPitch();
      if (!(pitch > 0)) return 0;
      const share = isFinite(chart.props.futureShare)
        ? chart.props.futureShare
        : DEFAULT_FUTURE_SHARE;
      const least = (MIN_BOARD_CALLABLE + NOW_PART_COLUMN) * pitch;
      const most = chart.width - MIN_HISTORY_CELLS * pitch;
      // A window too narrow to hold both gives what it can to the board
      if (!(most > least)) return Math.min(chart.width * 0.5, least);
      return Math.min(most, Math.max(least, chart.width * share));
    },

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
    poolNode: (pool, tag, parent) => {
      let el = pool.list[pool.at];
      if (!el) {
        el = document.createElementNS("http://www.w3.org/2000/svg", tag);
        pool.list.push(el);
        parent.appendChild(el);
      }
      pool.at++;
      el.setAttribute("visibility", "inherit");
      return el;
    },

    /* One of the two mesh layers, made on demand.
     *
     * Masked, both of them: a lattice solid over a faded one is the fade
     * failing at exactly the moment two lattices are on screen. The first is
     * born visible and the second at nothing, since the only thing that ever
     * asks for a second layer is a cross-fade, and it has to come *from*
     * nothing. */
    meshSet: (i, g) => {
      const set = chart._meshSets[i];
      if (!set.layer) {
        const layer = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "g",
        );
        layer.setAttribute("mask", `url(#${chart.fadeId})`);
        layer.setAttribute("opacity", i === chart._meshAt ? "1" : "0");
        set.layer = layer;
        const other = chart._meshSets[1 - i].layer;
        // First child, so everything created later draws over it — and the
        // pair kept adjacent, so the two never end up either side of the
        // controls that live in this group.
        if (other) g.insertBefore(layer, other.nextSibling);
        else g.insertBefore(layer, g.firstChild);
      }
      return set;
    },

    hideRest: (pool) => {
      for (let i = pool.at; i < pool.list.length; i++) {
        pool.list[i].setAttribute("visibility", "hidden");
      }
    },

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
    fadeEnd: () => {
      if (!chart.height || !chart.gridY || !chart.gridY.length) return 0;
      const at = chart.gridY.find((y) => y >= FADE_MIN);
      return isFinite(at) ? Math.min(at, chart.height / 3) : 0;
    },
});
