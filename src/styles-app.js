/* LAYOUT */
const AppShell = styled.main`
  width: 100%;
  max-width: 100%;
  height: 100vh;
  max-height: 100vh;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: ${({ theme, tickerTop }) =>
    `${tickerTop ? theme.spacing.medium + 3 : theme.spacing.medium}rem ${theme.spacing.large * 2}rem`};
  position: relative;
  overflow: hidden;
  transition: padding-top 0.4s cubic-bezier(0.22, 1, 0.36, 1);

  @media (max-width: ${({ theme }) => theme.breakpoint.down.md}px) {
    padding: ${({ theme, tickerTop }) =>
      `${tickerTop ? theme.spacing.large + 3 : theme.spacing.large}rem ${theme.spacing.medium}rem`};
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding: ${({ theme, tickerTop }) =>
      `${tickerTop ? theme.spacing.medium + 3 : theme.spacing.medium}rem ${theme.spacing.small}rem`};
  }
`;

const ChartWrapper = styled.section`
  width: 100%;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
  margin: 0;
`;

const FullBleed = styled.div`
  width: 100vw;
  margin-left: calc(-1 * ${({ theme }) => theme.spacing.large * 2}rem);
  margin-right: calc(-1 * ${({ theme }) => theme.spacing.large * 2}rem);
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 1px 0;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.md}px) {
    margin-left: calc(-1 * ${({ theme }) => theme.spacing.medium}rem);
    margin-right: calc(-1 * ${({ theme }) => theme.spacing.medium}rem);
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    margin-left: calc(-1 * ${({ theme }) => theme.spacing.small}rem);
    margin-right: calc(-1 * ${({ theme }) => theme.spacing.small}rem);
  }
`;

const OfflineMessage = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.spacing.medium}rem;
  left: 50%;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme }) => theme.color.textSecondary};
  box-shadow: 0 ${({ theme }) => theme.scale * 2}rem
    ${({ theme }) => theme.scale * 4}rem ${({ theme }) => theme.color.shadow};
  z-index: 10000;
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.small}rem;
  white-space: nowrap;
  animation: slideDown 0.3s ease-out;

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  &::before {
    content: "⚠️";
    font-size: 0.75rem;
    line-height: 1;
  }
`;

// "Since your last visit" — a quiet line under the price/change overview.
// Deliberately small: it's context, not a headline.
const SinceLastVisit = styled.div`
  margin-top: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  flex-wrap: wrap;
`;

const SinceValue = styled.span`
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme, up }) =>
    up == null
      ? theme.color.textSecondary
      : up
        ? theme.color.chartLineGreen
        : theme.color.chartLineRed};
`;

// One-time rating ask: small card in the bottom-right corner of the main
// view, lifted above the page ticker when the ticker sits at the bottom.
// Text/link/close children reuse the RatePrompt* pieces from styles-settings.
const rateAskIn = keyframes`
  from { transform: translateY(10px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
`;

const RateAskCard = styled.div`
  position: fixed;
  right: ${({ theme }) => theme.spacing.medium}rem;
  bottom: ${({ tickerBottom, theme }) =>
    tickerBottom
      ? `calc(${theme.spacing.medium}rem + 3rem)`
      : `${theme.spacing.medium}rem`};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  max-width: 22rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale * 4}rem;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.color.textSecondary};
  text-align: left;
  box-shadow: 0 ${({ theme }) => theme.scale * 2}rem
    ${({ theme }) => theme.scale * 4}rem ${({ theme }) => theme.color.shadow};
  animation: ${rateAskIn} 0.4s ease 0.8s backwards;
  z-index: 40;
`;

const RateAskText = styled.span`
  flex: 1;
`;

const ApiErrorMessage = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.spacing.medium}rem;
  left: 50%;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme }) => theme.color.textSecondary};
  box-shadow: 0 ${({ theme }) => theme.scale * 2}rem
    ${({ theme }) => theme.scale * 4}rem ${({ theme }) => theme.color.shadow};
  z-index: 10000;
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.small}rem;
  white-space: nowrap;
  animation: slideDown 0.3s ease-out;

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  &::before {
    content: "🔴";
    font-size: 0.75rem;
    line-height: 1;
  }
`;

// Retry action inside the API-error banner — silent failures read as bugs
const RetryButton = styled.button.attrs(() => ({ type: "button" }))`
  flex: 0 0 auto;
  background: transparent;
  border: none;
  padding: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-decoration: underline;
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
    text-decoration: none;
  }
`;

const InvalidCoinWarning = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.spacing.medium}rem;
  left: 50%;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid #ef4444;
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme }) => theme.color.text};
  box-shadow: 0 ${({ theme }) => theme.scale * 2}rem
    ${({ theme }) => theme.scale * 4}rem ${({ theme }) => theme.color.shadow};
  z-index: 10001;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  animation: slideDown 0.3s ease-out;

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
`;

const InvalidCoinMessage = styled.span`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.small * 0.5}rem;

  &::before {
    content: "❌";
    font-size: 0.75rem;
    line-height: 1;
  }
`;

const InvalidCoinButton = styled.button`
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale}rem;
  padding: ${({ theme }) => theme.spacing.small * 0.5}rem
    ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.7rem;
  font-family: ${({ theme }) => theme.font.primary};
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.color.border};
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:active {
    transform: scale(0.95);
  }
`;

/* SKELETON UI */
const skeletonPulse = keyframes`
  0% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.7;
  }
  100% {
    opacity: 0.4;
  }
`;

const skeletonShimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

const SkeletonBox = styled.div`
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.color.bgSecondary} 0%,
    ${({ theme }) => theme.color.border} 50%,
    ${({ theme }) => theme.color.bgSecondary} 100%
  );
  background-size: 200% 100%;
  border-radius: ${({ theme }) => theme.scale}rem;
  animation: ${skeletonShimmer} 2s ease-in-out infinite;
  width: ${({ width }) => width || "100%"};
  height: ${({ height }) => height || "1rem"};
`;

const SkeletonOverview = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  padding: ${({ theme }) => theme.spacing.medium}rem 0;
`;

const SkeletonPeriodSwitcher = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.small * 0.75}rem;
  justify-content: center;
  flex-wrap: wrap;
  padding: ${({ theme }) => theme.spacing.small}rem 0;
`;

// Shown inside the skeleton when the first fetch is slow — an honest word
// beats a chart that looks frozen (we don't fabricate placeholder prices)
const SkeletonNote = styled.div`
  position: relative;
  z-index: 1;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const SkeletonChart = styled.div`
  width: 100%;
  height: 100%;
  min-height: 20rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.color.bgSecondary} 0%,
    ${({ theme }) => theme.color.border} 50%,
    ${({ theme }) => theme.color.bgSecondary} 100%
  );
  background-size: 200% 100%;
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  animation: ${skeletonShimmer} 2s ease-in-out infinite;
  opacity: 0.5;
  position: relative;
  overflow: hidden;

  /* Subtle wave pattern to simulate chart line */
  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 10%;
    width: 80%;
    height: 2px;
    background: ${({ theme }) => theme.color.border};
    opacity: 0.4;
    border-radius: 2px;
    transform: translateY(-50%);
    box-shadow:
      0 -3rem 0 ${({ theme }) => theme.color.border}40,
      0 3rem 0 ${({ theme }) => theme.color.border}40;
  }
`;

const ControlsStack = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.small * 0.75}rem;
  align-items: center;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    gap: ${({ theme }) => theme.spacing.small * 0.5}rem;
  }
`;

const settingsPulse = keyframes`
  from { transform: scale(1); }
  50% { transform: scale(1.05); }
  to { transform: scale(1); }
`;

const SettingsToggleButton = styled.button`
  position: absolute;
  top: ${({ theme, tickerTop }) =>
    tickerTop
      ? `calc(${theme.spacing.large}rem + 3rem)`
      : `${theme.spacing.large}rem`};
  right: ${({ theme }) => theme.spacing.large}rem;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-size: 1.35rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  cursor: pointer;
  line-height: 1;
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s ease, top 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 120;

  &:hover {
    transform: scale(1.1);
  }

  &:focus {
    outline: none;
    animation: ${settingsPulse} 1s ease;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    right: ${({ theme }) => theme.spacing.small}rem;
    top: ${({ theme, tickerTop }) =>
      tickerTop
        ? `calc(${theme.spacing.small}rem + 3rem)`
        : `${theme.spacing.small}rem`};
  }
`;

// Sits just left of the settings gear, same vertical rhythm.
const PortfolioToggleButton = styled.button`
  position: absolute;
  top: ${({ theme, tickerTop }) =>
    tickerTop
      ? `calc(${theme.spacing.large}rem + 3rem)`
      : `${theme.spacing.large}rem`};
  right: ${({ theme, open }) =>
    open
      ? `${theme.spacing.large}rem`
      : `calc(${theme.spacing.large}rem + 2.5rem)`};
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ open }) => (open ? "1.35rem" : "1.15rem")};
  cursor: pointer;
  line-height: 1;
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  /* The vertical slide is for the page ticker appearing on the main view.
     While the portfolio is open the button also moves horizontally
     (untransitioned), so animating only the vertical half would read as a
     stray drift. */
  transition: ${({ open }) =>
    open
      ? "transform 0.25s ease"
      : "transform 0.25s ease, top 0.4s cubic-bezier(0.22, 1, 0.36, 1)"};
  z-index: 120;

  &:hover {
    transform: scale(1.1);
  }

  &:focus {
    outline: none;
    animation: ${settingsPulse} 1s ease;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    right: ${({ theme, open }) =>
      open
        ? `${theme.spacing.small}rem`
        : `calc(${theme.spacing.small}rem + 2.5rem)`};
    top: ${({ theme, tickerTop }) =>
      tickerTop
        ? `calc(${theme.spacing.small}rem + 3rem)`
        : `${theme.spacing.small}rem`};
  }
`;

// Alerts bell — sits left of the portfolio button, same treatment.
// A dot marks alerts that have fired but not been cleared.
const AlertsToggleButton = styled.button`
  position: absolute;
  top: ${({ theme, tickerTop }) =>
    tickerTop
      ? `calc(${theme.spacing.large}rem + 3rem)`
      : `${theme.spacing.large}rem`};
  right: calc(${({ theme }) => theme.spacing.large}rem + 5rem);
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ open }) => (open ? "1.35rem" : "1.05rem")};
  cursor: pointer;
  line-height: 1;
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Pinned to the corner while open — see SettingsToggleButton */
  transition: ${({ open }) =>
    open
      ? "transform 0.25s ease"
      : "transform 0.25s ease, top 0.4s cubic-bezier(0.22, 1, 0.36, 1)"};
  z-index: 120;

  &:hover {
    transform: scale(1.1);
  }

  &:focus {
    outline: none;
    animation: ${settingsPulse} 1s ease;
  }

  &::after {
    content: "";
    display: ${({ hasFired }) => (hasFired ? "block" : "none")};
    position: absolute;
    top: 0;
    right: 0;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: ${({ theme }) => theme.color.chartLineGreen};
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    right: calc(${({ theme }) => theme.spacing.small}rem + 5rem);
    top: ${({ theme, tickerTop }) =>
      tickerTop
        ? `calc(${theme.spacing.small}rem + 3rem)`
        : `${theme.spacing.small}rem`};
  }
`;


const overlayBlur = keyframes`
  from { backdrop-filter: blur(0px); }
  to { backdrop-filter: blur(10px); }
`;

const SettingsOverlay = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.85)"
      : "rgba(0, 0, 0, 0.9)"};
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.35s ease;
  animation: ${overlayBlur} 0.45s ease forwards;
  /* Above the page ticker (90): a modal covers the page chrome, which also
     lets its × stay pinned to the corner instead of dodging the ticker */
  z-index: 100;
  padding: ${({ theme }) => theme.spacing.medium}rem;
`;

/* PAGE TICKER STYLES */
const pageTickerScroll = keyframes`
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
`;

const pageTickerSlideBottom = keyframes`
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
`;

const pageTickerSlideTop = keyframes`
  from { transform: translateY(-100%); opacity: 0; }
  to   { transform: translateY(0);     opacity: 1; }
`;

// Gentle up/down bob to invite a click on the collapsed handle
const pageTickerHandleBobTop = keyframes`
  0%, 100% { transform: translate(-50%, 0); }
  50%      { transform: translate(-50%, 3px); }
`;
const pageTickerHandleBobBottom = keyframes`
  0%, 100% { transform: translate(-50%, 0); }
  50%      { transform: translate(-50%, -3px); }
`;

const PageTickerTrack = styled.div`
  display: inline-flex;
  white-space: nowrap;
  animation: ${pageTickerScroll} ${({ speed }) => speed || 35}s linear infinite;
  will-change: transform;
`;

const PageTickerRow = styled.div`
  display: flex;
  overflow: hidden;
  height: 1.5rem;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.color.border || "rgba(128,128,128,0.12)"};
  &:last-child {
    border-bottom: none;
  }
`;

const PageTickerNewsLink = styled.a`
  color: inherit;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

// Rows wrapper (fixed positioning now lives on the Shell)
const PageTickerBar = styled.div`
  position: relative;
  pointer-events: auto;
  background: ${({ theme }) => theme.color.bg};
  ${({ position }) =>
    position === "top"
      ? "border-bottom: 1px solid rgba(128,128,128,0.2);"
      : "border-top: 1px solid rgba(128,128,128,0.2);"}
  overflow: hidden;
  animation: ${({ position }) =>
    position === "top" ? pageTickerSlideTop : pageTickerSlideBottom} 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
`;

// Hover-revealed chevron tab that collapses the ticker toward the screen edge
const PageTickerChevron = styled.button`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  ${({ position }) => (position === "top" ? "bottom: -14px;" : "top: -14px;")}
  width: 34px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.color.border};
  ${({ position }) =>
    position === "top"
      ? "border-top: none; border-radius: 0 0 9px 9px;"
      : "border-bottom: none; border-radius: 9px 9px 0 0;"}
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.textSecondary};
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease, color 0.2s ease;
  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

// Small bobbing handle that remains when the ticker is collapsed
const PageTickerHandle = styled.button`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  ${({ position }) => (position === "top" ? "top: 0;" : "bottom: 0;")}
  width: 46px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.color.border};
  ${({ position }) =>
    position === "top"
      ? "border-top: none; border-radius: 0 0 9px 9px;"
      : "border-bottom: none; border-radius: 9px 9px 0 0;"}
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.textSecondary};
  cursor: pointer;
  pointer-events: auto;
  animation: ${({ position }) =>
    position === "top" ? pageTickerHandleBobTop : pageTickerHandleBobBottom} 1.9s ease-in-out infinite;
  transition: color 0.2s ease;
  &:hover {
    color: ${({ theme }) => theme.color.text};
    animation-play-state: paused;
  }
`;

// Slides the whole ticker off-screen when collapsed; pauses scroll + reveals
// the chevron on hover
const PageTickerCollapsible = styled.div`
  position: relative;
  pointer-events: auto;
  transform: translateY(${({ collapsed, position }) =>
    collapsed ? (position === "top" ? "-100%" : "100%") : "0"});
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
  &:hover ${PageTickerTrack} {
    animation-play-state: paused;
  }
  &:hover ${PageTickerChevron} {
    opacity: 1;
    pointer-events: auto;
  }
`;

const PageTickerShell = styled.div`
  position: fixed;
  ${({ position }) => (position === "top" ? "top: 0;" : "bottom: 0;")}
  left: 0;
  right: 0;
  z-index: 90;
  pointer-events: none;
`;

const PageTickerItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 1.25rem;
  font-size: 0.68rem;
  letter-spacing: 0.025em;
  line-height: 1;
`;

const PageTickerSep = styled.span`
  color: ${({ theme }) => theme.color.text};
  opacity: 0.2;
  font-size: 0.6rem;
`;

const PageTickerSymbol = styled.span`
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  color: ${({ theme }) => theme.color.text};
  opacity: 0.9;
`;

const PageTickerPrice = styled.span`
  color: ${({ theme }) => theme.color.text};
  opacity: 0.65;
`;

const PageTickerChange = styled.span`
  color: ${({ up }) => (up ? "#26a69a" : "#ef5350")};
  font-size: 0.62rem;
`;

