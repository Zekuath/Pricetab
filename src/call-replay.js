/* A SETTLED CALL, SEEN AGAIN (8 Oct 2026).
 *
 * A call is drawn on the board only on the range it was made on, and only
 * while its minutes are still inside that range's window — a 1H call is off
 * the chart an hour later, and the record kept the last 24 of them. So the
 * record keeps them now (`MAX_DONE_CALLS`), each row says when its square
 * was, and a row opens the square again here: the price through those
 * minutes, the square at its real time and band, the moment it was called
 * and the price it settled at. It asks Coinbase Exchange for the candles
 * once per open (`fetchViewCandles`, the zoomed chart's own pages, cached),
 * and says so plainly when a coin or currency has none.
 *
 * Shapes are drawn under `preserveAspectRatio="none"` so the strip takes the
 * row's width; every stroke is `non-scaling-stroke`, and the words sit in
 * HTML under it, because text in a stretched SVG stretches with it.
 * Loads before alerts.js, which renders it. */

const REPLAY_W = 300;
const REPLAY_H = 90;

const CallReplayBox = styled.div`
  margin-top: 0.5rem;
`;

const CallReplaySvg = styled.svg`
  display: block;
  width: 100%;
  height: 5.5rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.color.bgSecondary};
`;

const CallReplayLegend = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.25rem;
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const CallReplayNote = styled.div`
  margin-top: 0.4rem;
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
`;

const CallReplayToggle = styled.button.attrs({ type: "button" })`
  margin-top: 0.35rem;
  padding: 0;
  border: none;
  background: transparent;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.text};
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  ${touchTarget};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
  }
`;

/* The stretch asked for: from when the call was made (or the square began,
   if that was earlier) to the square's end, with a quarter of that and one
   square's length either side, so the square is never at the strip's edge. */
const callReplayWindow = (c) => {
  const start = Math.min(Number(c.placed), Number(c.target) - Number(c.span));
  const end = Number(c.target);
  const pad = (end - start) * 0.25 + Number(c.span);
  return { from: start - pad, to: Math.min(Date.now(), end + pad) };
};

class CallReplayBase extends PureComponent {
  constructor(...args) {
    super(...args);
    _defineProperty(this, "state", { candles: undefined });
  }

  componentDidMount() {
    this._alive = true;
    const c = this.props.call;
    const { from, to } = callReplayWindow(c);
    fetchViewCandles(c.coin, c.currency, viewGranularity(to - from), from, to)
      .then((candles) => this._alive && this.setState({ candles: candles || null }))
      .catch(() => this._alive && this.setState({ candles: null }));
  }

  componentWillUnmount() {
    this._alive = false;
  }

  render() {
    const c = this.props.call;
    const candles = this.state.candles;
    if (candles === undefined) {
      return React.createElement(CallReplayNote, null, msg("rp_loading", "Reading the price around this square…"));
    }
    if (!candles) {
      return React.createElement(
        CallReplayNote,
        null,
        msg("rp_none", "No minute history for $1 in $2 to draw this square with.", c.coin, c.currency),
      );
    }
    const { from, to } = callReplayWindow(c);
    const prices = [c.lo, c.hi];
    if (Number.isFinite(c.settledPrice)) prices.push(c.settledPrice);
    if (Number.isFinite(c.placedPrice)) prices.push(c.placedPrice);
    for (const k of candles) prices.push(k.low, k.high);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const pad = (hi - lo) * 0.08 || hi * 0.001;
    const x = (t) => ((t - from) / (to - from)) * REPLAY_W;
    const y = (p) => REPLAY_H - ((p - (lo - pad)) / (hi - lo + 2 * pad)) * REPLAY_H;
    const path = candles.map((k, i) => `${i ? "L" : "M"}${x(k.time).toFixed(2)},${y(k.close).toFixed(2)}`).join("");
    const hit = c.result === "hit";
    const theme = this.props.theme;
    const ink = hit ? theme.color.chartLineGreen : theme.color.chartLineRed;
    const line = { vectorEffect: "non-scaling-stroke" };
    const when = (t) => localeDate(t, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return React.createElement(
      CallReplayBox,
      { "data-call-replay": c.id },
      React.createElement(
        CallReplaySvg,
        {
          viewBox: `0 0 ${REPLAY_W} ${REPLAY_H}`,
          preserveAspectRatio: "none",
          role: "img",
          "aria-label": msg(
            "rp_aria",
            "$1 from $2 to $3: the square $4, called at $5, settled at $6",
            c.coin,
            when(from),
            when(to),
            this.props.band,
            when(c.placed),
            Number.isFinite(c.settledPrice) ? this.props.money(c.settledPrice) : "—",
          ),
        },
        React.createElement("rect", {
          x: x(c.target - c.span),
          y: y(c.hi),
          width: Math.max(1, x(c.target) - x(c.target - c.span)),
          height: Math.max(1, y(c.lo) - y(c.hi)),
          fill: ink,
          fillOpacity: hit ? 0.18 : 0.1,
          stroke: ink,
          strokeWidth: 1,
          style: line,
          "data-call-replay-square": "true",
        }),
        React.createElement("line", {
          x1: x(c.placed),
          x2: x(c.placed),
          y1: 0,
          y2: REPLAY_H,
          stroke: theme.color.textSecondary,
          strokeWidth: 1,
          strokeDasharray: "3 3",
          style: line,
          "data-call-replay-called": "true",
        }),
        React.createElement("path", {
          d: path,
          fill: "none",
          stroke: theme.color.text,
          strokeWidth: 1.25,
          style: line,
          "data-call-replay-price": String(candles.length),
        }),
        Number.isFinite(c.settledPrice)
          ? React.createElement("line", {
              x1: x(c.target) - 4,
              x2: x(c.target) + 4,
              y1: y(c.settledPrice),
              y2: y(c.settledPrice),
              stroke: ink,
              strokeWidth: 3,
              style: line,
              "data-call-replay-settled": "true",
            })
          : null,
      ),
      // The two ends on one line under the strip, and the key under them
      React.createElement(
        CallReplayLegend,
        null,
        React.createElement("span", null, when(from)),
        React.createElement("span", null, when(to)),
      ),
      React.createElement(CallReplayNote, null, msg("rp_legend", "dashed: called · box: the square · bar: settled")),
    );
  }
}

// The theme's inks are needed inside the SVG, as LineBase needs them
const CallReplay = withTheme(CallReplayBase);
