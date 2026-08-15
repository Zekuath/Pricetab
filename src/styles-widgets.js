/* WIDGET PANEL STYLES */
const WidgetRestoreButton = styled.button`
  position: fixed;
  left: ${({ theme }) => theme.spacing.large}rem;
  top: ${({ theme, tickerTop }) =>
    tickerTop
      ? `calc(${theme.spacing.large}rem + 3rem)`
      : `${theme.spacing.large}rem`};
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-size: 1.35rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  cursor: pointer;
  line-height: 1;
  z-index: 120;
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s ease, top 0.4s cubic-bezier(0.22, 1, 0.36, 1);

  &:hover {
    transform: scale(1.1);
  }

  /* A visible ring rather than none at all — these are the only way to reach
     the widget row and the compare overlay from the keyboard */
  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.borderHover};
    outline-offset: 3px;
    border-radius: 4px;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    left: ${({ theme }) => theme.spacing.small}rem;
    top: ${({ theme, tickerTop }) =>
      tickerTop
        ? `calc(${theme.spacing.small}rem + 3rem)`
        : `${theme.spacing.small}rem`};
  }
`;

/* Compare toggle — sits beside the widget control on the left, not in the
 * right-hand cluster: those three all open a panel over the chart, while this
 * changes how the chart itself is drawn. Active takes the accent the compared
 * line is drawn in, so the button and the line read as the same thing. */
const CompareToggleButton = styled.button`
  position: fixed;
  left: ${({ theme }) => `calc(${theme.spacing.large}rem + 2.5rem)`};
  top: ${({ theme, tickerTop }) =>
    tickerTop
      ? `calc(${theme.spacing.large}rem + 3rem)`
      : `${theme.spacing.large}rem`};
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme, active }) =>
    active ? theme.color.chartLine : theme.color.text};
  cursor: pointer;
  line-height: 1;
  z-index: 120;
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.25s ease,
    color 0.2s ease,
    top 0.4s cubic-bezier(0.22, 1, 0.36, 1);

  &:hover {
    transform: scale(1.1);
  }

  /* A visible ring rather than none at all — these are the only way to reach
     the widget row and the compare overlay from the keyboard */
  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.borderHover};
    outline-offset: 3px;
    border-radius: 4px;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    left: ${({ theme }) => `calc(${theme.spacing.small}rem + 2.5rem)`};
    top: ${({ theme, tickerTop }) =>
      tickerTop
        ? `calc(${theme.spacing.small}rem + 3rem)`
        : `${theme.spacing.small}rem`};
  }
`;

/* Hidden until the card is hovered — except where there is no hover to give.
 * On a tablet the widget row sits at the bottom of the screen and this was
 * the only way to dismiss a card, so it was unreachable on exactly the
 * devices that have the least room for the row. */
const WidgetHideButton = styled.button`
  position: absolute;
  top: 0.15em;
  right: 0.15em;
  width: 1.15em;
  height: 1.15em;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-size: 0.75em;
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease;
  border-radius: 50%;

  &:hover {
    background: ${({ theme }) => theme.color.border}44;
  }

  @media (hover: none) {
    opacity: 0.55;
  }
`;

const WidgetPanel = styled.div`
  position: fixed;
  z-index: 40;
  display: flex;
  gap: 0.5rem;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.3s ease, top 0.4s cubic-bezier(0.22, 1, 0.36, 1);

  /* Desktop: a column down the left */
  top: ${({ tickerTop }) => (tickerTop ? "8rem" : "5rem")};
  left: 1rem;
  flex-direction: column;

  /* Tablet: a scrollable row along the bottom */
  @media (max-width: 1024px) {
    top: auto;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    flex-direction: row;
    max-width: calc(100vw - 2rem);
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 0.35rem;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.color.border} transparent;

    &::-webkit-scrollbar {
      height: 5px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: ${({ theme }) => theme.color.border};
      border-radius: 3px;
    }
  }

  /* Phone: tighter */
  @media (max-width: 600px) {
    bottom: 0.5rem;
    gap: 0.3rem;
    max-width: calc(100vw - 1rem);
  }
`;

/* Widget internals. Everything is `em` so it rides the card's size, and the
 * up/down colours come from the theme rather than fixed hex — the dark-mode
 * greens and reds were being drawn on white in light mode, where they are
 * noticeably weaker. */
const FundingValue = styled.div`
  font-size: 1.05em;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  /* Positive funding means longs pay, which is the crowded side — so the
     colour follows who is paying, not whether the number is above zero */
  color: ${({ theme, positive }) =>
    positive ? theme.color.chartLineRed : theme.color.chartLineGreen};
  letter-spacing: 0.02em;
`;

const FundingAnnual = styled.div`
  font-size: 0.68em;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.15em;
`;

const LSBarWrap = styled.div`
  display: flex;
  width: 100%;
  height: 0.35em;
  min-height: 4px;
  border-radius: 0.2em;
  overflow: hidden;
  margin: 0.3em 0 0.15em;
`;

const LSBarLong = styled.div`
  height: 100%;
  background: ${({ theme }) => theme.color.chartLineGreen};
  width: ${({ pct }) => pct}%;
  transition: width 0.4s ease;
`;

const LSBarShort = styled.div`
  flex: 1;
  height: 100%;
  background: ${({ theme }) => theme.color.chartLineRed};
`;

const LSRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.68em;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The two figures under a long/short or liquidation bar, tinted to match
 * their side of it. These were inline hex, so they stayed dark-mode colours
 * on a white background. */
const WidgetSideValue = styled.span`
  color: ${({ theme, up }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
`;

const OIValue = styled.div`
  font-size: 1em;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.02em;
`;

const LiqBarWrap = styled.div`
  display: flex;
  width: 100%;
  height: 0.35em;
  min-height: 4px;
  border-radius: 0.2em;
  overflow: hidden;
  margin: 0.3em 0 0.15em;
`;

const LiqBarLong = styled.div`
  height: 100%;
  background: ${({ theme }) => theme.color.chartLineRed};
  width: ${({ pct }) => pct}%;
  transition: width 0.4s ease;
`;

const LiqBarShort = styled.div`
  flex: 1;
  height: 100%;
  background: ${({ theme }) => theme.color.chartLineGreen};
`;

const LiqRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.68em;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// A three-stop scale, so it keeps its own colours in both themes
const AltSeasonBar = styled.div`
  width: 100%;
  height: 0.35em;
  min-height: 4px;
  border-radius: 0.2em;
  background: linear-gradient(to right, #f97316, #facc15, #34d399);
  position: relative;
  margin: 0.3em 0 0.15em;
`;

const AltSeasonMarker = styled.div`
  position: absolute;
  top: 50%;
  left: ${({ pct }) => Math.min(Math.max(pct, 2), 96)}%;
  width: 0.62em;
  height: 0.62em;
  min-width: 8px;
  min-height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.text};
  border: 1px solid ${({ theme }) => theme.color.bg};
  transform: translate(-50%, -50%);
  transition: left 0.4s ease;
`;

const widgetAppear = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

/* The card owns the type scale. Everything inside it is sized in `em`, so the
 * one `font-size` here — driven by the Settings size picker — scales the text,
 * the bars, the gauges and the padding together. Sizing the children in `rem`
 * (as they were) meant nothing could be scaled without touching every rule. */
const WidgetCard = styled.div`
  position: relative;
  flex: 0 0 auto;
  font-size: ${({ scale }) => scale || 1}rem;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.95)"
      : "rgba(15, 15, 15, 0.9)"};
  backdrop-filter: blur(8px);
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 0.55em;
  padding: 0.55em 0.8em;
  text-align: center;
  box-shadow: 0 2px 8px ${({ theme }) => theme.color.shadow};
  cursor: grab;
  user-select: none;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease,
    border-color 0.15s ease;
  animation: ${widgetAppear} 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  opacity: ${({ dragging }) => (dragging ? 0.4 : 1)};
  transform: ${({ dragging }) => (dragging ? "scale(0.97)" : "scale(1)")};

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:hover ${WidgetHideButton}, &:focus-within ${WidgetHideButton} {
    opacity: 0.55;
  }

  &:hover ${WidgetHideButton}:hover, ${WidgetHideButton}:focus {
    opacity: 1;
  }

  /* Tablet */
  @media (max-width: 1024px) {
    padding: 0.45em 0.65em;
  }

  /* Phone */
  @media (max-width: 600px) {
    padding: 0.35em 0.55em;
  }
`;

/* Labels use the secondary text colour rather than an opacity knocked out of
 * the primary one. Opacity on already-small type is what made these hardest
 * to read — and it stacked with the card's own translucent background, so the
 * effective contrast was lower than the number suggested. */
const WidgetLabel = styled.div`
  font-size: 0.62em;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.25em;
`;

const WidgetValue = styled.div`
  font-size: 1.05em;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.02em;
`;

/* Watchlist + Top movers: both are coin rows now — symbol, price, 24h
 * change — so the two widgets read the same way. The row keeps a faint
 * up/down wash, which is what the old heatmap grid was for; the change
 * value carries the direction, so the tint is decoration, not the message. */
const WidgetCoinList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.15em;
  width: 100%;
  min-width: 10.5em;
  margin-top: 0.25em;
`;
const WidgetCoinRow = styled.div`
  display: grid;
  grid-template-columns: 2.8em 1fr auto;
  align-items: baseline;
  gap: 0.4em;
  padding: 0.22em 0.35em;
  border-radius: 0.3em;
  font-size: 0.72em;
  line-height: 1.35;
  background: ${({ up, intensity }) =>
    intensity
      ? up
        ? `rgba(52, 211, 153, ${intensity})`
        : `rgba(248, 113, 113, ${intensity})`
      : "transparent"};
`;
const WidgetCoinSym = styled.span`
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  color: ${({ theme }) => theme.color.text};
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
`;
const WidgetCoinPrice = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;
const WidgetCoinChg = styled.span`
  min-width: 3.4em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: ${({ up, theme }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
`;
// Separates gainers from losers in Top Movers
const WidgetListDivider = styled.div`
  height: 1px;
  margin: 0.25em 0.15em;
  background: ${({ theme }) => theme.color.border};
`;

const WidgetSubtext = styled.div`
  font-size: 0.72em;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.15em;
  text-transform: capitalize;
`;

const FearGreedGauge = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.15em;
  margin-top: 0.25em;
`;

const GaugeDot = styled.span`
  width: 0.35em;
  height: 0.35em;
  min-width: 4px;
  min-height: 4px;
  border-radius: 50%;
  background: ${({ active, value, theme }) => {
    if (!active) return theme.color.border;
    if (value <= 25) return "#ea3943";
    if (value <= 45) return "#f5a623";
    if (value <= 55) return "#c9c9c9";
    if (value <= 75) return "#93d572";
    return "#16c784";
  }};
`;

const GaugeTrackPath = styled.path`
  fill: none;
  stroke: ${({ theme }) => theme.color.border};
  stroke-width: 7;
  stroke-linecap: round;
`;

const GaugeNeedle = styled.line`
  stroke: ${({ theme }) => theme.color.text};
  stroke-width: 1.5;
  stroke-linecap: round;
  /* Drawn pointing at 0 and rotated into place: SVG line endpoints are
     attributes, not animatable CSS properties, but a transform is — and a
     swinging needle is what a gauge should do anyway. */
  transform: rotate(${({ angle }) => angle}deg);
  transform-box: view-box;
  transform-origin: 50px 50px;
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
`;

const GaugeCenterDot = styled.circle`
  fill: ${({ theme }) => theme.color.text};
`;

const MarketStatLabel = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  margin-right: 0.15em;
  font-size: 0.68em;
`;

const HalvingProgressBar = styled.div`
  width: 100%;
  height: 0.3em;
  min-height: 3px;
  background: ${({ theme }) => theme.color.border};
  border-radius: 0.15em;
  margin-top: 0.35em;
  overflow: hidden;
`;

const HalvingProgressFill = styled.div`
  height: 100%;
  width: ${({ percent }) => percent}%;
  background: ${({ theme }) => theme.color.text};
  border-radius: 0.15em;
  transition: width 0.4s ease;
`;

const HalvingTimeGrid = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.5em;
  margin-bottom: 0.35em;
`;

const HalvingTimeUnit = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 2em;
`;

const HalvingTimeNumber = styled.span`
  font-size: 1.2em;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.02em;
  line-height: 1;
`;

const HalvingTimeLabel = styled.span`
  font-size: 0.55em;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.2em;
`;

const HalvingTimeSep = styled.span`
  font-size: 1em;
  color: ${({ theme }) => theme.color.border};
  align-self: flex-start;
  padding-top: 1px;
`;

const HalvingEta = styled.div`
  font-size: 0.65em;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.3em;
  letter-spacing: 0.03em;
`;

const RsiBar = styled.div`
  width: 100%;
  height: 0.3em;
  min-height: 3px;
  background: linear-gradient(90deg, #16c784 0%, #f5a623 50%, #ea3943 100%);
  border-radius: 0.15em;
  margin: 0.35em 0 0.2em;
  position: relative;
`;

const RsiMarker = styled.div`
  position: absolute;
  top: 50%;
  left: ${({ value }) => value}%;
  transform: translate(-50%, -50%);
  transition: left 0.4s ease;
  width: 0.55em;
  height: 0.55em;
  min-width: 7px;
  min-height: 7px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.bg};
  border: 1.5px solid ${({ theme }) => theme.color.text};
`;

const RsiLabels = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.68em;
  color: ${({ theme }) => theme.color.textSecondary};
`;

