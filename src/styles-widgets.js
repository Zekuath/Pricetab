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

  &:focus {
    outline: none;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    left: ${({ theme }) => theme.spacing.small}rem;
    top: ${({ theme, tickerTop }) =>
      tickerTop
        ? `calc(${theme.spacing.small}rem + 3rem)`
        : `${theme.spacing.small}rem`};
  }
`;

const WidgetHideButton = styled.button`
  position: absolute;
  top: 0.2rem;
  right: 0.2rem;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-size: 0.6rem;
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
`;

const WidgetPanel = styled.div`
  position: fixed;
  z-index: 40;
  display: flex;
  gap: 0.5rem;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.3s ease, top 0.4s cubic-bezier(0.22, 1, 0.36, 1);

  /* Desktop: sol üst, dikey */
  top: ${({ tickerTop }) => tickerTop ? "8rem" : "5rem"};
  left: 1rem;
  flex-direction: column;

  /* Tablet: alt orta, yatay + yatay kaydırma */
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

  /* Mobil: daha kompakt */
  @media (max-width: 600px) {
    bottom: 0.5rem;
    gap: 0.3rem;
    max-width: calc(100vw - 1rem);
  }
`;

/* ── New widget styled components ─────────────────────────── */
const FundingValue = styled.div`
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ positive }) =>
    positive ? "#f87171" : "#34d399"}; /* red = positive (long pays), green = negative (shorts pay) */
  letter-spacing: 0.02em;
`;

const FundingAnnual = styled.div`
  font-size: 0.6rem;
  opacity: 0.6;
  margin-top: 2px;
`;

const LSBarWrap = styled.div`
  display: flex;
  width: 100%;
  height: 5px;
  border-radius: 3px;
  overflow: hidden;
  margin: 4px 0 2px;
`;

const LSBarLong = styled.div`
  height: 100%;
  background: #34d399;
  width: ${({ pct }) => pct}%;
  transition: width 0.4s ease;
`;

const LSBarShort = styled.div`
  flex: 1;
  height: 100%;
  background: #f87171;
`;

const LSRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  opacity: 0.75;
`;

const OIValue = styled.div`
  font-size: 0.95rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.02em;
`;

const LiqBarWrap = styled.div`
  display: flex;
  width: 100%;
  height: 5px;
  border-radius: 3px;
  overflow: hidden;
  margin: 4px 0 2px;
`;

const LiqBarLong = styled.div`
  height: 100%;
  background: #f87171;
  width: ${({ pct }) => pct}%;
  transition: width 0.4s ease;
`;

const LiqBarShort = styled.div`
  flex: 1;
  height: 100%;
  background: #34d399;
`;

const LiqRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  opacity: 0.75;
`;

const AltSeasonBar = styled.div`
  width: 100%;
  height: 5px;
  border-radius: 3px;
  background: linear-gradient(to right, #f97316, #facc15, #34d399);
  position: relative;
  margin: 4px 0 2px;
`;

const AltSeasonMarker = styled.div`
  position: absolute;
  top: -2px;
  left: ${({ pct }) => Math.min(Math.max(pct, 2), 96)}%;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.text};
  transform: translateX(-50%);
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

const WidgetCard = styled.div`
  position: relative;
  flex: 0 0 auto;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.95)"
      : "rgba(15, 15, 15, 0.9)"};
  backdrop-filter: blur(8px);
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  text-align: center;
  box-shadow: 0 2px 8px ${({ theme }) => theme.color.shadow};
  cursor: grab;
  user-select: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
  animation: ${widgetAppear} 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  opacity: ${({ dragging }) => (dragging ? 0.4 : 1)};
  transform: ${({ dragging }) => (dragging ? "scale(0.97)" : "scale(1)")};

  &:hover ${WidgetHideButton} {
    opacity: 0.5;
  }

  &:hover ${WidgetHideButton}:hover {
    opacity: 1;
  }

  /* Tablet */
  @media (max-width: 1024px) {
    padding: 0.4rem 0.6rem;
  }

  /* Mobil */
  @media (max-width: 600px) {
    padding: 0.3rem 0.5rem;
    border-radius: 0.4rem;
  }
`;

const WidgetLabel = styled.div`
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.6;
  margin-bottom: 0.2rem;

  @media (max-width: 600px) {
    font-size: 0.5rem;
    margin-bottom: 0.1rem;
  }
`;

const WidgetValue = styled.div`
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.02em;

  @media (max-width: 600px) {
    font-size: 0.85rem;
  }
`;

/* Watchlist heatmap + Top movers widgets */
const WatchlistGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 100%;
  margin-top: 2px;
`;
const WatchlistCell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 5px 2px;
  border-radius: 5px;
  background: ${({ up, intensity }) =>
    up
      ? `rgba(52, 211, 153, ${intensity})`
      : `rgba(248, 113, 113, ${intensity})`};
`;
const WatchlistSym = styled.span`
  font-size: 0.62rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  color: ${({ theme }) => theme.color.text};
`;
const WatchlistChg = styled.span`
  font-size: 0.55rem;
  color: ${({ theme }) => theme.color.text};
  opacity: 0.85;
`;

const MoversWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  margin-top: 2px;
`;
const MoverRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.66rem;
  line-height: 1.3;
`;
const MoverSym = styled.span`
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  color: ${({ theme }) => theme.color.text};
  opacity: 0.9;
`;
const MoverChg = styled.span`
  color: ${({ up, theme }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
`;

const WidgetSubtext = styled.div`
  font-size: 0.65rem;
  opacity: 0.7;
  margin-top: 2px;
  text-transform: capitalize;

  @media (max-width: 600px) {
    font-size: 0.55rem;
  }
`;

const FearGreedGauge = styled.div`
  display: flex;
  justify-content: center;
  gap: 2px;
  margin-top: 3px;

  @media (max-width: 600px) {
    gap: 1px;
    margin-top: 2px;
  }
`;

const GaugeDot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: ${({ active, value, theme }) => {
    if (!active) return theme.color.border;
    if (value <= 25) return "#ea3943";
    if (value <= 45) return "#f5a623";
    if (value <= 55) return "#c9c9c9";
    if (value <= 75) return "#93d572";
    return "#16c784";
  }};

  @media (max-width: 600px) {
    width: 4px;
    height: 4px;
  }
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
`;

const GaugeCenterDot = styled.circle`
  fill: ${({ theme }) => theme.color.text};
`;

const MarketStatLabel = styled.span`
  opacity: 0.5;
  margin-right: 2px;
  font-size: 0.6rem;

  @media (max-width: 600px) {
    font-size: 0.5rem;
  }
`;

const HalvingProgressBar = styled.div`
  width: 100%;
  height: 4px;
  background: ${({ theme }) => theme.color.border};
  border-radius: 2px;
  margin-top: 5px;
  overflow: hidden;

  @media (max-width: 600px) {
    height: 3px;
    margin-top: 4px;
  }
`;

const HalvingProgressFill = styled.div`
  height: 100%;
  width: ${({ percent }) => percent}%;
  background: ${({ theme }) => theme.color.text};
  border-radius: 2px;
  transition: width 0.4s ease;
`;

const HalvingTimeGrid = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
`;

const HalvingTimeUnit = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 2rem;
`;

const HalvingTimeNumber = styled.span`
  font-size: 1.15rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.02em;
  line-height: 1;

  @media (max-width: 600px) {
    font-size: 0.95rem;
  }
`;

const HalvingTimeLabel = styled.span`
  font-size: 0.45rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.5;
  margin-top: 2px;
`;

const HalvingTimeSep = styled.span`
  font-size: 1rem;
  opacity: 0.3;
  align-self: flex-start;
  padding-top: 1px;
`;

const HalvingEta = styled.div`
  font-size: 0.55rem;
  opacity: 0.55;
  margin-top: 4px;
  letter-spacing: 0.03em;

  @media (max-width: 600px) {
    font-size: 0.5rem;
  }
`;

const RsiBar = styled.div`
  width: 100%;
  height: 4px;
  background: linear-gradient(90deg, #16c784 0%, #f5a623 50%, #ea3943 100%);
  border-radius: 2px;
  margin: 5px 0 3px;
  position: relative;
`;

const RsiMarker = styled.div`
  position: absolute;
  top: 50%;
  left: ${({ value }) => value}%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.bg};
  border: 1.5px solid ${({ theme }) => theme.color.text};

  @media (max-width: 600px) {
    width: 6px;
    height: 6px;
  }
`;

const RsiLabels = styled.div`
  display: flex;
  justify-content: space-between;
`;

