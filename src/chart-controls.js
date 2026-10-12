/* CHART CONTROLS — the range switcher and the price display
 *
 * Cut out of `chart.js` on 22 Aug 2026, which was 5,176 lines against this
 * repo's ~800-line guideline. The cut is the safe one and was measured before
 * it was made: **the two blocks share no symbol in either direction** — the
 * 423 lines below reference nothing from `LineBase` and nothing in `LineBase`
 * references them. They were only ever neighbours.
 *
 * That leaves `chart.js` as the chart and nothing else, which is the point.
 * It is an improvement and not a solved problem: what remains there is one
 * 4,500-line class, and cutting into *that* is a behavioural refactor rather
 * than moving a block, which is a different and much riskier job.
 *
 * Nothing was renamed and nothing reordered — the same rule the six
 * `styles-*.js` cuts followed. Loads after `chart.js` in `index.html` purely
 * to keep them adjacent; with no shared symbols the order does not matter.
 */
/* PERIOD SWITCHER */
const PeriodButton = styled.button.attrs({ type: "button", "data-own-before": "true" })`
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

  /* 44pt under a finger, and the button itself rather than a box hung off
     it: the row scrolls sideways, and a scroller clips whatever spills — a
     phone held sideways measured 32px with every box cut to it (9 Oct 2026).
     Its ::before is the active underline. */
  ${touchRow};

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

  /* A phone on its side: see SHORT_SCREEN below. */
  @media (max-height: 500px) and (orientation: landscape) {
    height: 2rem;
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

/* The chart-settings opener lived here for a few hours on 23 Sep 2026, as a
 * chip at the end of these six. It was wrong twice over, and it showed at
 * once: beside ALL it reads as a seventh range, and a control that opens a
 * panel belongs with the other controls that open panels — where it also
 * inherits the quiet-chrome rule, which it was breaking (it rested at full
 * opacity while its neighbours sat at 0.14). It is a corner control now. */
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
      // The range on screen says so to a screen reader, not only in ink
      { active: active, onClick: this.handleClick, title: title, "aria-pressed": active ? "true" : "false", "data-period-button": "1" },
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
  ${themedScrollbar};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    justify-content: center;
    gap: ${({ theme }) => theme.spacing.xsmall}rem;
    padding-bottom: ${({ theme }) => theme.spacing.medium}rem;
  }

  @media (max-height: 500px) and (orientation: landscape) {
    padding: 0 ${({ theme }) => theme.spacing.medium}rem;
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
const OverviewItemButton = styled.button.attrs({ type: "button" })`
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

  /* **Two figures share a phone's width** (8 Oct 2026). Each button held a
     10rem floor, so at 360px the pair needed more than the row had and the
     row scrolled sideways under the finger; and at 1.5rem an eleven-figure
     "+$21,175.83" ran 30px out of its own box at 320-390px, which is why the
     two read off-centre. Below 400px the padding closes up and the figure
     is sized from the window (Value). */
  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    min-width: 10rem;
  }
  @media (max-width: 400px) {
    min-width: 0;
    padding-left: 0.25rem;
    padding-right: 0.25rem;
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
  /* Twelve monospace figures (0.6em each) in half of a 320px row */
  @media (max-width: 400px) {
    font-size: min(1.5rem, 5.4vw);
    white-space: nowrap;
  }
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

const OverviewItem = ({ children, label, onClick, title, dataTour, flash, valueRef }) =>
  React.createElement(
    OverviewItemButton,
    { onClick, title: title, "data-tour": dataTour },
    React.createElement(
      Value,
      // Remounting on each flash restarts the CSS animation; without the
      // key a second move in the same direction wouldn't re-trigger it
      { flash, key: flash ? `${flash}-${children}` : "static", innerRef: valueRef },
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
  valueRef: null,
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
  ${themedScrollbar};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    justify-content: flex-start;
    padding: ${({ theme }) => theme.spacing.medium}rem
      ${({ theme }) => theme.spacing.small}rem;
  }

  /* **A phone on its side** (2 Oct 2026, the phone pass). At 844x390 the
     readout and the range row took 298px and left the chart 26px — the
     calls board could not be drawn at all. On a short landscape screen the
     price sits on one line with its label, and the paddings close up. */
  @media (max-height: 500px) and (orientation: landscape) {
    padding: 0 ${({ theme }) => theme.spacing.medium}rem;
    & > button {
      padding: 0.15rem 0.5rem;
    }
    & > button > div:first-child {
      margin-bottom: 0;
      font-size: 1.15rem;
      line-height: 1.25;
    }
  }
`;

// How long the first price takes to count up to itself
const OVERVIEW_COUNT_MS = 700;

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

    _defineProperty(this, "valueRef", (node) => {
      this._valueNode = node;
    });

    // One-time count-up to the first real price (intro flourish only).
    // **The frames between the first and the last are written into the
    // node, not rendered** (3 Oct 2026): through setState the header and
    // both its styled buttons rendered 79 times in 700ms, 18ms of a
    // 4x-throttled phone's load. React renders the start and the end; a
    // render in between reads `_countNow`, so it cannot show a stale figure.
    // None under reduced motion.
    _defineProperty(this, "maybeCountUp", () => {
      if (this._counted) return;
      const target = this.props.currentValue;
      if (typeof target !== "number" || !isFinite(target)) return;
      this._counted = true;
      const duration = motionMs(OVERVIEW_COUNT_MS);
      if (!duration) return;
      const start =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      // Set here, inside the update that brought the price, so the price
      // itself is never painted for a frame before counting up to it
      this._countNow = 0;
      this.setState({ countValue: 0 });
      const tick = (now) => {
        // A frame's timestamp can be earlier than `start`, and a negative t
        // eases to a negative price
        const t = Math.max(0, Math.min(1, (now - start) / duration));
        if (t < 1) {
          this._countNow = target * (1 - Math.pow(1 - t, 3));
          if (this._valueNode) {
            this._valueNode.textContent = this.priceText(this._countNow);
          }
          this._rafId = requestAnimationFrame(tick);
        } else {
          this._rafId = 0;
          // The last written frame may already read what React last
          // rendered, in which case React writes nothing: put the price
          // there first
          if (this._valueNode) {
            this._valueNode.textContent = this.priceText(this.props.currentValue);
          }
          this.setState({ countValue: null });
        }
      };
      this._rafId = requestAnimationFrame(tick);
    });

    // Decided by the live price, so the count-up keeps one width throughout
    _defineProperty(this, "priceText", (value) =>
      formatNumberString(
        value,
        getCurrencySymbol(this.props.currency || DEFAULT_CURRENCY),
        true,
        false,
        priceDecimals(this.props.currentValue, this.props.decimalPlaces),
        this.props.separatorFormat,
      ),
    );
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
      valueHistory,
      decimalPlaces,
      separatorFormat,
      currency,
    } = this.props;
    const { calcPercentage, countValue } = this.state;
    const currencySymbol = getCurrencySymbol(currency || DEFAULT_CURRENCY);
    // During the intro count-up show the animating value; otherwise the real price
    const displayValue = countValue != null ? this._countNow : currentValue;

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
          priceDecimals(currentValue, decimalPlaces),
          separatorFormat,
        );

    return React.createElement(
      OverviewWrapper,
      null,
      React.createElement(
        OverviewItem,
        {
          onClick: this.props.cycleCoinIndex,
          label: msg("chart_coin_price", "$1 Price", coin),
          title: msg("chart_next_coin", "Next coin"),
          dataTour: "price",
          flash: this.state.flash,
          valueRef: this.valueRef,
        },
        this.priceText(displayValue),
      ),
      React.createElement(
        OverviewItem,
        {
          onClick: this.togglePercentage,
          label: calcPercentage
            ? msg("chart_percent_change", "Percent Change")
            : msg("chart_price_change", "Price Change"),
          title: calcPercentage
            ? msg("chart_switch_to_price", "Switch to price change")
            : msg("chart_switch_to_percent", "Switch to percent change"),
          dataTour: "change",
        },
        delta,
      ),
    );
  }
}

