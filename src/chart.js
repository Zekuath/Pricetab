/* LINE COMPONENT */
const LINE_DUMMY = Array(2)
  .fill()
  .map((_, i) => ({ price: 0, time: new Date(2010 + i) }));

const PADDING = 24;
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

const Svg = styled.svg`
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
const CROSSHAIR_ROWS = ["Open", "High", "Low", "Close", "Volume"];

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
    this.hoverIndex = -1;

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
      // Candles are only worth fetching once someone actually reads the
      // chart — most tabs are opened, glanced at and closed
      if (!this._askedForOhlc && this.props.onNeedOhlc) {
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

    _defineProperty(this, "drawCrosshair", () => {
      this.hoverRaf = 0;
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
      const dateText = crosshairDate(source.time, this.props.period);
      this.hoverDateRef.current.textContent = dateText;

      // A candle for this point turns the readout into an OHLC table; with
      // no candle (unsupported range/currency, or still loading) it stays
      // the plain price line rather than showing blanks.
      const timeMs = Number(new Date(source.time));
      if (!candleMode && !compareMode) {
        candle = this.props.ohlc ? candleAt(this.props.ohlc, timeMs) : null;
      }
      this.hoverPriceRef.current.textContent =
        candle || compareMode ? "" : fmt(source.price);

      // Two shapes of readout share the same rows: OHLC for one coin, or one
      // row per coin when two are being compared
      const labels = compareMode
        ? [this.props.coin || "", this.props.compareCoin || ""]
        : CROSSHAIR_ROWS;
      const values = compareMode
        ? [
            formatSignedPercent(this.compareScaled.a[i].percent),
            formatSignedPercent(this.compareScaled.b[compareIndex].percent),
          ]
        : candle
          ? [
              fmt(candle.open),
              fmt(candle.high),
              fmt(candle.low),
              fmt(candle.close),
              `${formatVolume(candle.volume)} ${this.props.coin || ""}`.trim(),
            ]
          : null;
      const rowCount = values ? values.length : 0;

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
    /* The overlay is scaled against both series, so either one changing
     * rescales it — including the primary coin's own refresh. */
    const compareChanged =
      prevProps.comparePrices !== this.props.comparePrices ||
      prevProps.compareCoin !== this.props.compareCoin;
    if (compareChanged || prevProps.prices !== this.props.prices) {
      this.updateComparison(true);
      if (compareChanged) this.handlePointerLeave();
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

