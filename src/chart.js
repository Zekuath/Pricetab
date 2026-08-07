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
const CROSSHAIR_LABEL_PAD = 6;
const CROSSHAIR_LABEL_GAP = 10;

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

    // Crosshair nodes — written to directly, never through React
    _defineProperty(this, "hoverRef", createRef());
    _defineProperty(this, "hoverLineRef", createRef());
    _defineProperty(this, "hoverDotRef", createRef());
    _defineProperty(this, "hoverBoxRef", createRef());
    _defineProperty(this, "hoverPriceRef", createRef());
    _defineProperty(this, "hoverDateRef", createRef());
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
        }
      }, 150),
    );

    /* Pointer handling: record the position, do the work once per frame */
    _defineProperty(this, "handlePointerMove", (e) => {
      this.hoverX = e.offsetX;
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
    });

    _defineProperty(this, "drawCrosshair", () => {
      this.hoverRaf = 0;
      const g = this.hoverRef.current;
      const scaled = this.scaled;
      const raw = safePrices(this.props.prices);
      if (!g || !scaled || scaled.length < 2 || raw.length !== scaled.length) {
        return;
      }
      const i = nearestIndex(scaled, this.hoverX);
      const point = scaled[i];
      const source = raw[i];
      g.setAttribute("visibility", "visible");
      // Skip the text work when the pointer is still on the same point
      if (i === this.hoverIndex) {
        return;
      }
      this.hoverIndex = i;

      const { color } = this.props.theme;
      this.hoverLineRef.current.setAttribute("x1", point.time);
      this.hoverLineRef.current.setAttribute("x2", point.time);
      this.hoverDotRef.current.setAttribute("cx", point.time);
      this.hoverDotRef.current.setAttribute("cy", point.price);

      const priceText = this.props.formatPrice
        ? this.props.formatPrice(Number(source.price))
        : String(source.price);
      const dateText = crosshairDate(source.time, this.props.period);
      this.hoverPriceRef.current.textContent = priceText;
      this.hoverDateRef.current.textContent = dateText;

      // Size the label to its text, then keep it inside the chart box
      const textWidth = Math.max(
        this.hoverPriceRef.current.getComputedTextLength(),
        this.hoverDateRef.current.getComputedTextLength(),
      );
      const boxW = textWidth + CROSSHAIR_LABEL_PAD * 2;
      const boxH = 34;
      let boxX = point.time + CROSSHAIR_LABEL_GAP;
      if (boxX + boxW > this.width) {
        boxX = point.time - CROSSHAIR_LABEL_GAP - boxW;
      }
      boxX = Math.max(0, boxX);
      const boxY = Math.min(
        Math.max(point.price - boxH / 2, 0),
        Math.max(this.height - boxH, 0),
      );
      const box = this.hoverBoxRef.current;
      box.setAttribute("x", boxX);
      box.setAttribute("y", boxY);
      box.setAttribute("width", boxW);
      box.setAttribute("height", boxH);
      box.setAttribute("fill", color.bgSecondary);
      box.setAttribute("stroke", color.border);
      this.hoverPriceRef.current.setAttribute("x", boxX + CROSSHAIR_LABEL_PAD);
      this.hoverPriceRef.current.setAttribute("y", boxY + 14);
      this.hoverDateRef.current.setAttribute("x", boxX + CROSSHAIR_LABEL_PAD);
      this.hoverDateRef.current.setAttribute("y", boxY + 27);
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
      }
    }
  }

  componentDidUpdate(prevProps) {
    // Only update path if prices actually changed
    if (prevProps.prices !== this.props.prices) {
      this.updatePath();
      this.handlePointerLeave(); // stale readout would point at old data
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
        React.createElement("path", {
          // colorize off → no fill, just the line (the "colourless" chart)
          fill: this.props.colorize === false ? "none" : `url(#${this.gradId})`,
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

const Value = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.text};
`;

const Label = styled.div`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  line-height: 1.3333;
  letter-spacing: 0.125em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const OverviewItem = ({ children, label, onClick, title, dataTour }) =>
  React.createElement(
    OverviewItemButton,
    { onClick, title: title, "data-tour": dataTour },
    React.createElement(
      Value,
      null,
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

  componentDidUpdate() {
    this.maybeCountUp();
  }

  componentWillUnmount() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
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

