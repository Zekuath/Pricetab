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
  /* Four values, not two.
   *
   * This was a two-value "padding: vertical horizontal", and the vertical
   * half grew by 3rem whenever the page ticker sat on top — which the two-value
   * shorthand applies to the bottom as well. So switching the ticker on cost
   * the chart 3rem at the top for the bar and another 3rem at the bottom for
   * nothing, and left a dead band under the chart that the grid made
   * impossible to miss. The padding-top transition below is the giveaway that
   * only the top was ever meant to move.
   *
   * Each edge is now driven by the ticker actually on it. */
  padding: ${({ theme, tickerTop, tickerBottom }) =>
    `${tickerTop ? theme.spacing.medium + 3 : theme.spacing.medium}rem ` +
    `${theme.spacing.large * 2}rem ` +
    `${tickerBottom ? theme.spacing.medium + 3 : theme.spacing.medium}rem`};
  position: relative;
  overflow: hidden;
  transition:
    padding-top 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    padding-bottom 0.4s cubic-bezier(0.22, 1, 0.36, 1);

  @media (max-width: ${({ theme }) => theme.breakpoint.down.md}px) {
    padding: ${({ theme, tickerTop, tickerBottom }) =>
      `${tickerTop ? theme.spacing.large + 3 : theme.spacing.large}rem ` +
      `${theme.spacing.medium}rem ` +
      `${tickerBottom ? theme.spacing.large + 3 : theme.spacing.large}rem`};
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding: ${({ theme, tickerTop, tickerBottom }) =>
      `${tickerTop ? theme.spacing.medium + 3 : theme.spacing.medium}rem ` +
      `${theme.spacing.small}rem ` +
      `${tickerBottom ? theme.spacing.medium + 3 : theme.spacing.medium}rem`};
  }
`;

/* `stale` is the chart of the coin (or range) you were looking at a moment
 * ago, still on screen while the new one is being fetched. It fades rather
 * than being torn down — see the note on `startSkeletonTimer` in app.js for
 * what tearing it down actually cost — and it stops taking the pointer,
 * because a crosshair over it would report the previous coin's prices under
 * the new coin's name. */
const ChartWrapper = styled.section`
  width: 100%;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
  margin: 0;
  opacity: ${({ stale }) => (stale ? 0.32 : 1)};
  pointer-events: ${({ stale }) => (stale ? "none" : "auto")};
  transition: opacity 240ms ease;
`;

const FullBleed = styled.div`
  position: relative;
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

/* Headlines shown beside an unusual move. The wording and the styling both
 * keep their distance: these are stories that mention the coin from the same
 * window, not an explanation of the move. */
const MoveHeadlines = styled.div`
  margin-top: ${({ theme }) => theme.spacing.small}rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  max-width: 34rem;
  margin-left: auto;
  margin-right: auto;
`;

const MoveHeadlinesLabel = styled.div`
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const MoveHeadlineLink = styled.a`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
  text-decoration: none;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;

  ${hoverUnderline};

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

/* Stats under the price: range high/low plus market cap and 24h volume.
 * Every value here is already on hand — the range comes off the series the
 * chart is drawing, the market figures ride along in the ticker's bulk
 * response — so the row costs no request of its own. */
const PriceStatsRow = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.3rem 1.4rem;
  margin-top: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.7rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PriceStatItem = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  white-space: nowrap;
`;

const PriceStatKey = styled.span`
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const PriceStatValue = styled.span`
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
  font-variant-numeric: tabular-nums;
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
const RetryButton = styled.button.attrs({ type: "button" })`
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

const InvalidCoinButton = styled.button.attrs({ type: "button" })`
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

/* The price readout's slot, while a switch is in flight.
 *
 * `blank` hides the figures without giving up the space they were standing
 * in: the coin you asked for has no price yet, and printing the one you just
 * left under its name would be a lie. Swapping the block for the shorter
 * skeleton instead was the obvious way to do it and cost 71px of column
 * height (measured at 1280x800), which the chart below immediately took —
 * so every coin switch threw the whole drawing 71px up the screen and back.
 * The layout has to hold still for the morph underneath it to read as one.
 *
 * The flex rules are ControlsStack's, repeated because this now sits between
 * it and its children and would otherwise collapse the gaps between them. */
const ReadoutSlot = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small * 0.75}rem;
  width: 100%;
  /* Inherited, not selected: the stand-in is a child of this box and turns
   * itself back on. A child selector would have had to out-specify it. */
  visibility: ${({ blank }) => (blank ? "hidden" : "visible")};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    gap: ${({ theme }) => theme.spacing.small * 0.5}rem;
  }
`;

// The grey boxes that stand in for the figures, over the slot they came from
const ReadoutStandIn = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  visibility: visible;
  pointer-events: none;
`;

/* The same honest word, for the case where the chart was kept instead of
 * being replaced by the skeleton. Outside `ChartWrapper` so the stale fade
 * does not take the message down with the drawing it is explaining. */
const ChartStaleNote = styled(SkeletonNote)`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  text-align: center;
  transform: translateY(-50%);
  pointer-events: none;
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

/* Quiet controls.
 *
 * With `quiet` on, the corner buttons rest at a fraction of their opacity and
 * come back to full under the pointer or on keyboard focus. They fade to a
 * ghost rather than to nothing on purpose: a control that is invisible but
 * still clickable is a trap, and one that stops receiving the pointer cannot
 * be brought back by reaching for it. The gear rests brightest of the five —
 * it is the way back to this setting, so it is the one that must stay
 * findable. */
const QUIET_LEAD = 0.32;
const QUIET_REST = 0.14;

const SettingsToggleButton = styled.button.attrs({ type: "button" })`
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
  /* Travels to the corner on open, on the same 0.4s ease as the panel's
     own entrance, so the close control and the panel move together */
  transition:
    transform 0.25s ease,
    opacity 0.25s ease,
    top 0.4s ease,
    right 0.4s ease;
  z-index: 120;

  /* Resting weight, and the two ways back to full — see QUIET_LEAD */
  opacity: ${({ quiet }) => (quiet ? QUIET_LEAD : 1)};

  &:hover,
  &:focus-visible {
    opacity: 1;
  }

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
const PortfolioToggleButton = styled.button.attrs({ type: "button" })`
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
  /* Same corner travel as the settings control */
  transition:
    transform 0.25s ease,
    opacity 0.25s ease,
    top 0.4s ease,
    right 0.4s ease;
  z-index: 120;

  /* Resting weight, and the two ways back to full — see QUIET_LEAD */
  opacity: ${({ quiet }) => (quiet ? QUIET_REST : 1)};

  &:hover,
  &:focus-visible {
    opacity: 1;
  }

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
const AlertsToggleButton = styled.button.attrs({ type: "button" })`
  position: absolute;
  top: ${({ theme, tickerTop }) =>
    tickerTop
      ? `calc(${theme.spacing.large}rem + 3rem)`
      : `${theme.spacing.large}rem`};
  right: ${({ theme, open }) =>
    open
      ? `${theme.spacing.large}rem`
      : `calc(${theme.spacing.large}rem + 5rem)`};
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
  /* Same corner travel as the settings control */
  transition:
    transform 0.25s ease,
    opacity 0.25s ease,
    top 0.4s ease,
    right 0.4s ease;
  z-index: 120;

  /* Resting weight, and the two ways back to full — see QUIET_LEAD */
  opacity: ${({ quiet }) => (quiet ? QUIET_REST : 1)};

  &:hover,
  &:focus-visible {
    opacity: 1;
  }

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
    right: ${({ theme, open }) =>
      open
        ? `${theme.spacing.small}rem`
        : `calc(${theme.spacing.small}rem + 5rem)`};
    top: ${({ theme, tickerTop }) =>
      tickerTop
        ? `calc(${theme.spacing.small}rem + 3rem)`
        : `${theme.spacing.small}rem`};
  }
`;


/* Calls — left of the targets button, same treatment.
 *
 * Its own control rather than a tab inside the targets panel. They are two
 * kinds of statement about a future price, which is why they shared a panel
 * to begin with, but only one of them is a game you come back to: a call is
 * placed on the chart, settles by itself and keeps a record, and reaching it
 * meant opening a panel named after something else and then finding a tab.
 * A dot marks calls that have settled since you last looked, the same way the
 * targets bell marks a hit — that is the whole reason to come back.
 */
const CallsToggleButton = styled.button.attrs({ type: "button" })`
  position: absolute;
  top: ${({ theme, tickerTop }) =>
    tickerTop
      ? `calc(${theme.spacing.large}rem + 3rem)`
      : `${theme.spacing.large}rem`};
  right: ${({ theme, open }) =>
    open
      ? `${theme.spacing.large}rem`
      : `calc(${theme.spacing.large}rem + 7.5rem)`};
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
  /* Same corner travel as the settings control */
  transition:
    transform 0.25s ease,
    opacity 0.25s ease,
    top 0.4s ease,
    right 0.4s ease;
  z-index: 120;

  /* Resting weight, and the two ways back to full — see QUIET_LEAD */
  opacity: ${({ quiet }) => (quiet ? QUIET_REST : 1)};

  &:hover,
  &:focus-visible {
    opacity: 1;
  }

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
    right: ${({ theme, open }) =>
      open
        ? `${theme.spacing.small}rem`
        : `calc(${theme.spacing.small}rem + 7.5rem)`};
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
  ${hoverUnderline};
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
const PageTickerChevron = styled.button.attrs({ type: "button" })`
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
const PageTickerHandle = styled.button.attrs({ type: "button" })`
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


/* ── "What happened here?" — the card a mark opens ────────────────────────
 *
 * Anchored to the mark rather than parked in a corner, because the question it
 * answers is about *that* moment: a card at the foot of the screen would make
 * the reader carry the date across the chart to find out which triangle it
 * belongs to. `translateX(-50%)` off the mark's own x, clamped by the caller
 * so a mark near either edge still opens a card that is entirely on screen.
 *
 * Opened by a click, not by the hover that fetches it — a card that lives only
 * while the pointer is on an eleven-pixel triangle is a card whose links can
 * never be reached.
 */
/* The transform is part of the animation, so the two have to be written
 * together: a keyframe that only moved `translateY` would drop the −50% and
 * the card would slide in a half-width off its own mark. */
const moveCardIn = keyframes`
  from { transform: translate(-50%, 8px); opacity: 0; }
  to   { transform: translate(-50%, 0);   opacity: 1; }
`;

const MoveCard = styled.div`
  position: fixed;
  top: ${({ y }) => y}px;
  left: ${({ x }) => x}px;
  transform: translateX(-50%);
  z-index: 90;
  width: min(26rem, calc(100vw - 2rem));
  padding: 0.85rem 1rem 0.9rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.color.bgSecondary};
  box-shadow: 0 ${({ theme }) => theme.scale * 2}rem
    ${({ theme }) => theme.scale * 4}rem ${({ theme }) => theme.color.shadow};
  animation: ${moveCardIn} 0.18s ease-out;
`;

const MoveCardHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.15rem;
`;

/* The move itself, in the colours the chart already uses for up and down —
 * here they mean the direction of the price, which is the one thing about this
 * card that *is* a fact about the market. */
const MoveCardMove = styled.div`
  font-size: 0.95rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme, up }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
`;

const MoveCardWhen = styled.div`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.65rem;
`;

const MoveCardClose = styled.button.attrs({ type: "button" })`
  flex: none;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  color: ${({ theme }) => theme.color.textSecondary};

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
  }
`;

const MoveCardList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const MoveCardItem = styled.a`
  display: block;
  font-size: 0.78rem;
  line-height: 1.35;
  color: ${({ theme }) => theme.color.text};
  ${hoverUnderline};
`;

const MoveCardSource = styled.span`
  display: block;
  font-size: 0.58rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The caveat, and it is not decoration. Headlines from the day of a move are
 * what was *being said*, not the cause — post hoc is the whole trap in a
 * feature like this. So the card says "around", never "because", and says it
 * every time rather than once in a tooltip somebody dismissed months ago. */
const MoveCardNote = styled.div`
  margin-top: 0.7rem;
  padding-top: 0.55rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.65rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* News, one slot further left than calls. Same corner family as the other
 * four: same travel, same resting weight, same × when it is the panel that is
 * open. No unread dot — the calls button has one because a call settling is
 * something that happened to you, while headlines are something you go and
 * read, and a permanently-lit dot on a feed that never stops is just a mark
 * that means "the world still exists". */
const NewsToggleButton = styled.button.attrs({ type: "button" })`
  position: absolute;
  top: ${({ theme, tickerTop }) =>
    tickerTop
      ? `calc(${theme.spacing.large}rem + 3rem)`
      : `${theme.spacing.large}rem`};
  right: ${({ theme, open }) =>
    open
      ? `${theme.spacing.large}rem`
      : `calc(${theme.spacing.large}rem + 10rem)`};
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
  /* Same corner travel as the settings control */
  transition:
    transform 0.25s ease,
    opacity 0.25s ease,
    top 0.4s ease,
    right 0.4s ease;
  z-index: 120;

  /* Resting weight, and the two ways back to full — see QUIET_LEAD */
  opacity: ${({ quiet }) => (quiet ? QUIET_REST : 1)};

  &:hover,
  &:focus-visible {
    opacity: 1;
  }

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
        : `calc(${theme.spacing.small}rem + 10rem)`};
    top: ${({ theme, tickerTop }) =>
      tickerTop
        ? `calc(${theme.spacing.small}rem + 3rem)`
        : `${theme.spacing.small}rem`};
  }
`;
