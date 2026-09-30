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
  /* **And the ticker's edge is measured, not assumed.** It was a flat 3rem
   * either side, while the bar's height comes from its two rows of text and
   * therefore from the text-size setting — so the chart's edge and the bar's
   * edge were on the same line at one size and nowhere near it at another.
   * tickerH is what the bar actually measures; the 48px is the frame before
   * the first measurement and nothing else. */
  padding: ${({ theme, tickerTop, tickerBottom, tickerH }) =>
    `calc(${theme.spacing.medium}rem + ${tickerTop ? tickerH || PAGE_TICKER_FALLBACK_H : 0}px) ` +
    `${theme.spacing.large * 2}rem ` +
    `calc(${theme.spacing.medium}rem + ${tickerBottom ? tickerH || PAGE_TICKER_FALLBACK_H : 0}px)`};
  position: relative;
  overflow: hidden;
  /* The same clock as the bar's own slide (PAGE_TICKER_SLIDE_MS), so the
   * two edges travel together instead of separating by twenty milliseconds
   * and however many pixels the height happened to differ by. */
  transition:
    padding-top ${PAGE_TICKER_SLIDE_MS}ms ${PAGE_TICKER_EASE},
    padding-bottom ${PAGE_TICKER_SLIDE_MS}ms ${PAGE_TICKER_EASE};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.md}px) {
    padding: ${({ theme, tickerTop, tickerBottom, tickerH }) =>
      `calc(${theme.spacing.large}rem + ${tickerTop ? tickerH || PAGE_TICKER_FALLBACK_H : 0}px) ` +
      `${theme.spacing.medium}rem ` +
      `calc(${theme.spacing.large}rem + ${tickerBottom ? tickerH || PAGE_TICKER_FALLBACK_H : 0}px)`};
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding: ${({ theme, tickerTop, tickerBottom, tickerH }) =>
      `calc(${theme.spacing.medium}rem + ${tickerTop ? tickerH || PAGE_TICKER_FALLBACK_H : 0}px) ` +
      `${theme.spacing.small}rem ` +
      `calc(${theme.spacing.medium}rem + ${tickerBottom ? tickerH || PAGE_TICKER_FALLBACK_H : 0}px)`};
  }

  /* **Nothing on the page moves when a drawer opens** (26 Sep 2026,
     *"ana ekrandaki fiyat yazan kısım falan sağa kayıyor, o olduğu yerde
     kalsın"*). For two days this padding grew by the open drawer's width so
     the price readout and the range row stepped out from under it — measured
     at 1280x800, the readout travelled from x=360 to x=634 every time Targets
     opened, and back when it shut. The drawing had already been taken off
     that (24 Sep: the chart runs on under the glass); the writing now stays
     put with it, and a drawer is a sheet laid over the page rather than a
     thing the page makes room for.
     It comes after the two breakpoint blocks on purpose — each of those
     writes the padding shorthand, and a shorthand later in the source would
     put this longhand back. */
  @media (min-width: 601px) {
    padding-left: ${({ theme }) => `${theme.spacing.large * 2}rem`};
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

/* Full bleed means the window: the chart escapes the shell's own padding on
 * both sides, so it starts at the window's left edge. */
const FullBleed = styled.div`
  position: relative;
  /* **The window, whatever is docked over it** (24 Sep 2026, *"bu hover
     olarak gelen menüler z-index'te en üstte olacak, böylelikle ana grafik
     yeniden şekil değiştirmek zorunda kalmaz"*).
     It spent a day giving the drawers their width back, and the price of
     that was the chart redrawing itself every time one opened: a new width
     means a new x scale, every point replaced, the candles re-laid. A drawer
     is a thing you open for ten seconds. The chart keeps its shape and the
     drawer floats over it — which is also why the drawer is see-through.
     The text above the chart went the same way on 26 Sep 2026 (see
     AppShell's padding-left), so this margin no longer follows a drawer. */
  width: 100vw;
  margin-left: ${({ theme }) => `calc(-1 * ${theme.spacing.large * 2}rem)`};
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
  /* **Under the drawers, over everything else** (27 Sep 2026). It was
     10000, above the drawers (160) — and it hangs from the top centre, which
     is where an open drawer's head keeps Choose and ×: measured at 1280 with
     the network down, the notice took the press meant for the widgets
     drawer's Choose, at its default width as well as dragged wider. A drawer
     is what was opened last; the notice still clears the screens (100–150)
     and the ticker, and its Retry stays to the right of any drawer's head. */
  z-index: 158;
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
  /* The row's height, held whether or not there is anything in it yet.
   *
   * The stats need a series, so on the first frame there is nothing to print
   * and the row is not rendered at all — then the prices land and everything
   * below it drops. Measured with a layout-shift observer: **the range
   * switcher moved 27px at 64ms, and that single shift was 0.0138 of a total
   * CLS of 0.0173** — eighty per cent of every shift this page makes, in the
   * first tenth of a second, and the one a person actually sees because the
   * chart is what they are looking at.
   *
   * One line of this type is 1.2rem; the row is one line until it wraps.
   * Reserving it costs nothing when the stats are on and is the honest thing
   * when they are: the space belongs to them either way. */
  min-height: 1.2rem;
`;

/* Each stat arrives on its own schedule — the range comes off the series as
 * soon as the chart has one, the market cap and 24h volume ride in with the
 * ticker's bulk sweep a moment later, and VWAP only when candles happen to be
 * loaded. The row's height is already reserved (see `PriceStatsRow`), so what
 * is left is the pop: figures appearing mid-sentence in a row that is already
 * there. They fade up instead.
 *
 * It plays **once per element, on mount**, which is exactly the event worth
 * marking: React keeps the same node when a value merely changes, so a price
 * refresh does not re-run it and the row does not flicker every thirty
 * seconds. Opacity and transform only — this is the new-tab page, and those
 * two are the properties that never cost a layout. */
const priceStatIn = keyframes`
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const PriceStatItem = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  white-space: nowrap;
  /* The fill mode is backwards, not both. Both holds the end state after it
     finishes, which keeps it in the page's animation list for good — measured
     as two finished entries still sitting there at idle. It costs no frames,
     but the rule this project holds itself to is that a settled tab has
     nothing animating, and a list that never empties makes that impossible to
     check. Backwards holds the from-state before it starts, which is the half
     that was actually wanted. (No backticks here: template literal.) */
  animation: ${priceStatIn} 260ms ease-out backwards;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/* THE COMPARISON STRIP
 *
 * While two coins share the chart, the row under the price stops printing
 * one coin's high, low, cap and volume — half of them are about a coin that
 * is no longer what the chart is showing — and says instead what the chart
 * *is* showing: the two lines, in their own inks, each with where it stands
 * since the start of the range; the gap between them in points; and the two
 * things you can do about it, swap them or stop. A chart that does not say
 * what and since when is not one you can read (the portfolio chart earned
 * that rule), and the comparison had only the two figures at the lines'
 * ends to say it with.
 *
 * The second leg's ink is asked of `chart.js` (`compareInk`) — the blue may
 * be named there and nowhere else, and a legend in another colour would be
 * for another chart. The strip keeps the stats row's height and type, so
 * the range switcher under it does not move when a comparison starts. */
const CompareStrip = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem 1.1rem;
  margin-top: ${({ theme }) => theme.spacing.small}rem;
  min-height: 1.2rem;
  font-size: 0.7rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const CompareLeg = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
`;

/* A short run of the line itself, not a dot: the thing being named is a
 * stroke, and a swatch the shape of the mark is the one legend nobody has to
 * decode. */
const CompareSwatch = styled.span`
  display: inline-block;
  width: 0.9rem;
  height: 2px;
  border-radius: 1px;
  background: ${({ theme, second }) => compareInk(theme, second)};
`;

const CompareCoin = styled.span`
  font-size: 0.6rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme, second }) => compareInk(theme, second)};
`;

const CompareValue = styled.span`
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.text};
`;

const CompareNote = styled.span`
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
`;

const CompareStripButton = styled.button.attrs({ type: "button" })`
  /* A button that stays down (the ratio) says so; the others never are */
  ${({ on, theme }) => (on ? `background: ${theme.color.bgSecondary}; color: ${theme.color.text};` : "")}
  padding: 0.12rem 0.45rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  background: transparent;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover,
  &:focus-visible {
    outline: none;
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.borderHover};
  }
  ${touchTarget};
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
  /* **Under the drawers, over everything else** (27 Sep 2026). It was
     10000, above the drawers (160) — and it hangs from the top centre, which
     is where an open drawer's head keeps Choose and ×: measured at 1280 with
     the network down, the notice took the press meant for the widgets
     drawer's Choose, at its default width as well as dragged wider. A drawer
     is what was opened last; the notice still clears the screens (100–150)
     and the ticker, and its Retry stays to the right of any drawer's head. */
  z-index: 158;
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
  border: 1px solid ${({ theme }) => theme.color.chartLineRed};
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

/* The notes over the chart's top-left, in the shell's own inset, side by
 * side: how old the prices are, and the window the chart is zoomed to. Only
 * the chip's button takes the pointer — the rest of the row is chart. */
const ChartNotes = styled.div`
  position: absolute;
  top: 0.25rem;
  left: ${({ theme }) => theme.spacing.large * 2}rem;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  pointer-events: none;
`;

/* "Prices from 12 min ago" — while a fetch is failing or the network is
 * gone. Read, never pressed. */
const ChartAgeNote = styled.div`
  padding: 0.125rem 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.75rem;
  line-height: 1.4;
  pointer-events: none;
`;

/* "Zoomed · Sep 14, 09:00 – 15:30" and the way back to the whole range
 * (chart-viewport.js). The pill is the age note's; the button is the one
 * thing in the row that takes a press. */
const ChartViewChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.125rem 0.125rem 0.125rem 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.75rem;
  line-height: 1.4;
`;

const ChartViewReset = styled.button.attrs({ type: "button" })`
  ${touchTarget};
  pointer-events: auto;
  padding: 0.0625rem 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  &:hover {
    border-color: ${({ theme }) => theme.color.accent};
  }
  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
`;

/* THE CHART'S TOOLS, AT THE RIGHT END OF THE RANGE ROW (app-tools.js)
 *
 * **Out of the plot** (30 Sep 2026, *"bilgilendirme indikatör yerleri ile de
 * çarpışıyor"*). The strip sat in the plot's top-left, which is where the
 * chart puts its own words: the companion's index, the setups' list, the
 * study labels. A control drawn over a reading hides one or the other.
 * The range row's right end has nothing drawn in it, ever, and it sits over
 * the price scale, so it reads as the chart's and not as a seventh range —
 * the objection that moved the chart-settings opener out of this row on 23
 * Sep 2026 was about a chip *beside ALL*.
 *
 * **One pill that grows out of the +.** At rest the tray is a circle around
 * the +; opened, it widens to the left over the tools, which come in one by
 * one from the + outwards, and the + turns to an ×. Closed, the tools fade
 * first and are `visibility: hidden` once they have, so a folded tool cannot
 * be tabbed to or pressed. Widths are counted from the constants below, so
 * the pill's width and the hint's caret agree with the buttons they are
 * measured from. */
const TOOL_REM = 2;
const TOOL_GAP_REM = 0.125;
const TOOL_PAD_REM = 0.1875;
// The hairline between the tools and the ×, with its air either side
const TOOL_RULE_REM = 0.5625;
const TOOL_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const toolTrayRem = (count, shown) =>
  shown
    ? 2 * TOOL_PAD_REM + (count + 1) * (TOOL_REM + TOOL_GAP_REM) + TOOL_RULE_REM
    : 2 * TOOL_PAD_REM + TOOL_REM;
/* How far tool `i` of `count` sits from the tray's right edge, to its centre:
 * the border, the padding, the ×, the rule and the tools to its right. */
const toolCaretRem = (i, count) =>
  0.0625 +
  TOOL_PAD_REM +
  TOOL_REM +
  2 * TOOL_GAP_REM +
  TOOL_RULE_REM +
  (count - 1 - i) * (TOOL_REM + TOOL_GAP_REM) +
  TOOL_REM / 2;
const toolTint = (theme) =>
  theme.color.bg === "#ffffff" ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.08)";

/* The range row. On a phone the six ranges fill it, so while the tools are
 * drawn they leave the + its own room at the right rather than have it lie
 * on ALL. */
const ChartHead = styled.div`
  align-self: stretch;
  display: flex;
  justify-content: center;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding-right: ${({ tools }) => (tools ? `calc(${toolTrayRem(0, false)}rem + 0.5rem)` : "0")};
    & > [data-tour="period"] {
      flex: 1 1 auto;
      width: auto;
      min-width: 0;
    }
  }
`;

/* **Where the tools hang: a line of no height between the range row and the
 * chart.** It is written after the chart and drawn up here by `order`
 * (ControlsStack is -2), because the + is an svg and the first svg in the
 * document has to be the chart's — the browser suites wait on "svg path" and
 * measure the first svg, and the corner openers were moved after the chart
 * for exactly that. The negative margin takes back the shell's gap, which a
 * third item would otherwise add, so the chart does not move. */
const ChartToolsRail = styled.div`
  order: -1;
  position: relative;
  z-index: 3;
  height: 0;
  margin-top: -0.125rem;
`;

/* The dock: as wide as the + at rest, level with the range buttons — hung
 * from the rail by the range row's bottom padding, as tall as a range. The
 * tray opens out of it to the left. Its right edge is 1rem from the window's,
 * through the shell's padding (4rem here, 1rem under 1024px, half that on a
 * phone), which puts the + over the price scale's column. */
const ChartToolsBox = styled.div`
  position: absolute;
  bottom: ${({ theme }) => theme.spacing.large}rem;
  right: ${({ theme }) => theme.spacing.medium - theme.spacing.large * 2}rem;
  width: calc(${toolTrayRem(0, false)}rem + 2px);
  height: ${({ theme }) => theme.spacing.large * 1.5}rem;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.md}px) {
    right: 0;
  }

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    bottom: ${({ theme }) => theme.spacing.medium}rem;
  }
`;

const ChartToolStrip = styled.div`
  position: absolute;
  top: 50%;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${TOOL_GAP_REM}rem;
  box-sizing: border-box;
  width: calc(${({ count, shown }) => toolTrayRem(count, shown)}rem + 2px);
  height: calc(${2 * TOOL_PAD_REM + TOOL_REM}rem + 2px);
  padding: ${TOOL_PAD_REM}rem;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bg};
  box-shadow: ${({ shown, theme }) => (shown ? `0 6px 20px ${theme.color.shadow}` : "none")};
  transform: translateY(-50%);
  transition:
    width 280ms ${TOOL_EASE},
    box-shadow 200ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// The + that turns to an ×: first in the document, drawn last in the tray
const ChartToolToggle = styled.button.attrs({ type: "button" })`
  ${touchTarget};
  order: 99;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${TOOL_REM}rem;
  height: ${TOOL_REM}rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: ${({ shown, theme }) => (shown ? theme.color.text : theme.color.textSecondary)};
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
  svg {
    transform: rotate(${({ shown }) => (shown ? "45deg" : "0deg")});
    transition: transform 280ms ${TOOL_EASE};
  }
  &:hover {
    background: ${({ theme }) => toolTint(theme)};
    color: ${({ theme }) => theme.color.text};
  }
  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    svg {
      transition: none;
    }
  }
`;

const ChartToolRule = styled.span`
  order: 98;
  flex: 0 0 auto;
  width: 1px;
  height: 1.125rem;
  margin: 0 0.25rem;
  background: ${({ theme }) => theme.color.border};
  opacity: ${({ shown }) => (shown ? 1 : 0)};
  transition: opacity 160ms ease ${({ shown }) => (shown ? "60ms" : "0ms")};
`;

/* A tool. `delay` staggers the way in from the + outwards; the way out is
 * all at once, and `visibility` follows the fade so a folded tool is gone
 * from the keyboard and the pointer. */
const ChartToolButton = styled.button.attrs({ type: "button" })`
  ${touchTarget};
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${TOOL_REM}rem;
  height: ${TOOL_REM}rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: ${({ on, theme }) => (on ? theme.color.bgSecondary : "transparent")};
  color: ${({ on, theme }) => (on ? theme.color.text : theme.color.textSecondary)};
  box-shadow: ${({ on, theme }) => (on ? `inset 0 0 0 1px ${theme.color.border}` : "none")};
  cursor: pointer;
  visibility: ${({ shown }) => (shown ? "visible" : "hidden")};
  opacity: ${({ shown }) => (shown ? 1 : 0)};
  transform: ${({ shown }) => (shown ? "none" : "translateX(0.5rem) scale(0.85)")};
  transition:
    opacity ${({ shown }) => (shown ? "180ms" : "100ms")} ease ${({ shown, delay }) => (shown ? `${delay}ms` : "0ms")},
    transform 280ms ${TOOL_EASE} ${({ shown, delay }) => (shown ? `${delay}ms` : "0ms")},
    visibility 0s linear ${({ shown }) => (shown ? "0ms" : "100ms")},
    background-color 120ms ease,
    color 120ms ease;
  &:hover {
    background: ${({ on, theme }) => (on ? theme.color.bgSecondary : toolTint(theme))};
    color: ${({ theme }) => theme.color.text};
  }
  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/* A tool's name and what it does, under the tray while it is pointed at or
 * focused. Right-aligned with the tray, so it never runs off the window, with
 * a caret that slides to the tool; it stays up while the pointer moves along
 * the tools and only the words change. */
const ChartToolHint = styled.div`
  position: absolute;
  top: calc(100% + 0.25rem);
  right: 0;
  z-index: 3;
  display: grid;
  gap: 0.125rem;
  box-sizing: border-box;
  width: 16rem;
  padding: 0.5rem 0.75rem 0.5625rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 0.625rem;
  background: ${({ theme }) => theme.color.bg};
  box-shadow: 0 8px 24px ${({ theme }) => theme.color.shadow};
  font-size: 0.75rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
  pointer-events: none;
  visibility: ${({ shown }) => (shown ? "visible" : "hidden")};
  opacity: ${({ shown }) => (shown ? 1 : 0)};
  transform: ${({ shown }) => (shown ? "none" : "translateY(-0.25rem)")};
  transition:
    opacity 140ms ease,
    transform 200ms ${TOOL_EASE},
    visibility 0s linear ${({ shown }) => (shown ? "0ms" : "140ms")};
  strong {
    color: ${({ theme }) => theme.color.text};
    font-weight: ${({ theme }) => theme.fontWeight.medium};
  }
  &::before {
    content: "";
    position: absolute;
    top: -0.3125rem;
    right: ${({ caret }) => caret}rem;
    width: 0.5rem;
    height: 0.5rem;
    border-top: 1px solid ${({ theme }) => theme.color.border};
    border-left: 1px solid ${({ theme }) => theme.color.border};
    background: ${({ theme }) => theme.color.bg};
    transform: translateX(50%) rotate(45deg);
    transition: right 200ms ${TOOL_EASE};
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &::before {
      transition: none;
    }
  }
`;

/* The drawings, listed in the chart's drawer (V) — every one reachable from
 * the keyboard, which a line on a chart is not. */
const DrawingsBox = styled.section`
  margin: 0.75rem 0 0.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

const DrawingsHead = styled.h3`
  margin: 0 0 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const DrawingsList = styled.div`
  display: grid;
  gap: 0.25rem;
`;

const DrawingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 0.375rem;
  background: ${({ on, theme }) => (on ? theme.color.bgSecondary : "transparent")};
`;

const DrawingRowName = styled.button.attrs({ type: "button" })`
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.375rem 0.5rem;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font: inherit;
  font-size: 0.75rem;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  strong {
    font-weight: 600;
  }
  em {
    font-style: normal;
    color: ${({ theme }) => theme.color.textSecondary};
  }
  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.accent};
    outline-offset: -1px;
  }
`;

const DrawingRowAction = styled.button.attrs({ type: "button" })`
  ${touchTarget};
  flex: 0 0 auto;
  padding: 0.25rem 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.text};
  font: inherit;
  font-size: 0.6875rem;
  cursor: pointer;
  &:hover {
    border-color: ${({ theme }) => theme.color.accent};
  }
  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
`;

const DrawingsEmpty = styled.p`
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* "Where it sits": one line under the price, a range per item — its name, a
 * short track from its low to its high with a mark where the price is, and
 * the share. Small type, the stats row's ink. */
const WhereRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.25rem 0.875rem;
  margin: 0.25rem 0 0;
  font-size: 0.6875rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const WhereHead = styled.span`
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const WhereItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
`;

const WhereKey = styled.span`
  letter-spacing: 0.06em;
`;

const WhereTrack = styled.span`
  position: relative;
  display: inline-block;
  width: 2.5rem;
  height: 0.25rem;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.border};
`;

const WhereMark = styled.span`
  position: absolute;
  top: -0.1875rem;
  width: 2px;
  height: 0.625rem;
  margin-left: -1px;
  border-radius: 1px;
  background: ${({ theme }) => theme.color.text};
`;

const WhereValue = styled.span`
  min-width: 3ch;
  color: ${({ theme }) => theme.color.text};
  font-variant-numeric: tabular-nums;
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
  /* First, with the chart's tools drawn after it (ChartToolsRail) */
  order: -2;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.small * 0.75}rem;
  align-items: center;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    gap: ${({ theme }) => theme.spacing.small * 0.5}rem;
  }
`;

/* Quiet controls: the weight the two pulls rest at with the setting on
 * (DrawerTabsHandle). A ghost rather than nothing, on purpose — a control
 * that is invisible but still clickable is a trap. It was the gear's level
 * when the corner rested as a row of ghosts; the gear was the brightest of
 * them because it was the way back to this setting, and the pulls are that
 * way now. */
const QUIET_LEAD = 0.32;

/* **THE CORNER CONTROLS REST OUT OF SIGHT** (23 Sep 2026).
 *
 * Asked for as *"gizlenmeli, sürekli ortada durmamalı, hover olan"*. Nine
 * icons in the corner of a page whose whole job is one chart are nine things
 * competing with it every second of every tab, and they are needed for about
 * one second in fifty. They come back when the pointer is anywhere near that
 * corner (`chromeNear` in app.js, a proximity test rather than a hover on a
 * box — a transparent box over the corner would have to swallow clicks to
 * feel a hover), while a panel is open (one of them is that panel's ×), and
 * on keyboard focus.
 *
 * **`quiet` still means what it meant.** Quiet Controls is the *shown*
 * weight: a ghost rather than full ink once they are on screen. The two are
 * different questions — whether they are there at all, and how loud they are
 * when they are — and this expression answers them in that order.
 *
 * **Pointer events stay on.** A control that is invisible *and* unclickable
 * needs the reveal to have already happened before the press, which is a race
 * every time and a broken control whenever it is lost. The corner these sit
 * in holds nothing else, so a press that lands on one is a press that meant
 * one. The reveal is discovery, not a gate. */
/* **Nothing is drawn around them.** They were given a background and a
 * hairline ring for one afternoon, to stop the page ticker's scrolling prices
 * running through them — and the answer to that was the wrong one twice over:
 * the controls simply do not belong on top of the bar (see the `top` rule
 * below), and nine boxed icons in a corner are nine boxes on a page that has
 * one chart on it. They are marks on the page, and the page is what is behind
 * them. */
/* **THE BAR IS NEVER UNDERNEATH THEM; IT PUSHES THEM DOWN.**
 *
 * 24 Sep 2026: *"o üst bar burada asla ve asla üzerinde olmayacak,
 * başlarken aynı yerde olacak, o üst bar gelince animasyon ile aşağı
 * kayacak"*. They were moved on top of the ticker the day before, which reads
 * as two things fighting for one strip of window whatever the z-order says.
 *
 * So: the top of the window when there is no bar, and the bar's own height
 * plus the same margin when there is one — **measured**, not a flat 3rem, so
 * the row sits under the bar at every text size (`tickerH`, the figure
 * `AppShell` already pads by, with `PAGE_TICKER_FALLBACK_H` for the frame
 * before the first measurement).
 *
 * **It travels on the bar's own clock** (`PAGE_TICKER_SLIDE_MS` /
 * `PAGE_TICKER_EASE`), because the two are one movement: the bar comes down
 * and the controls step aside for it. A different duration reads as two
 * animations that nearly agree, which is worse than none.
 */
const chromeUnderTicker = css`
  top: ${({ theme, tickerTop, tickerH }) =>
    tickerTop
      ? `calc(${theme.spacing.large}rem + ${tickerH || PAGE_TICKER_FALLBACK_H}px)`
      : `${theme.spacing.large}rem`};
`;

/* ── THE CORNER, SINCE 26 SEP 2026 ────────────────────────────────────────
 *
 * It held nine controls once — measured at 420px they filled the whole top
 * edge of a phone, which is why a phone had one button and a list instead.
 * The chart's controls became tabs on the left spine and the screens' on the
 * right one, and what is left here is an open screen's ×: one at a time,
 * and none at all on a plain chart. The wrapper generates no box
 * (`display: contents`); it is kept as the hook the drawers use to tell a
 * press on it from a press outside them (data-chrome-cluster).
 */
const ChromeCluster = styled.div`
  display: contents;
`;

/* **THE VEIL THAT SOFTENS A PANEL SWAP** (24 Sep 2026, *"geçiş
 * animasyonlarla yumuşatılsın"*).
 *
 * Pressing a tab closed one screen and opened another in the same frame:
 * each panel has its own entrance, so the arriving one faded in, but the one
 * you were reading vanished on the spot. A cross-fade is the obvious answer
 * and is not available here — the panels are separate components at
 * different z-indexes, so keeping the outgoing one mounted underneath would
 * sometimes draw it *over* the arriving one.
 *
 * Both are opaque screens on the same ground, so the honest cross-fade is
 * that ground: a sheet of `color.bg` fades up, the swap happens behind it,
 * and it fades away. Nothing else moves, nothing is drawn twice, and it costs
 * one element for a third of a second.
 *
 * Below the spines (165–170) and above everything else: a tab is what
 * you are looking at while you press it, and it should not blink.
 */
const panelSwapVeil = keyframes`
  0% { opacity: 0; }
  38% { opacity: 1; }
  62% { opacity: 1; }
  100% { opacity: 0; }
`;

const PanelVeil = styled.div`
  position: fixed;
  inset: 0;
  z-index: 145;
  pointer-events: none;
  background: ${({ theme }) => theme.color.bg};
  animation: ${panelSwapVeil} ${PANEL_SWAP_MS}ms ease;
`;

/* **THE DRAWERS' FOLDER TABS** (25 Sep 2026, *"sol ekran ile arasında bir
 * şey olacak, o boşlukta bu saydığım kısımların isimleri dikey yazılmış
 * olacak ve böyle folder tag gibi arasında geçiş yapılacak"* — and, when the
 * first answer was a plain column of words, *"şerit halinde de olmamalı,
 * tasarımsal olarak da iyi durmalı"*).
 *
 * Widgets, the chart's switches, targets and calls: the four panels that
 * change what the chart shows, on the edge they open from. Always there,
 * opened by a press — a hover that opened a drawer would open one every
 * time the pointer crossed the edge on its way to the chart.
 *
 * **A tab, not a strip.** Each is its own piece with a rounded outer edge.
 * The open one is the drawer's own ground, reaches the drawer's edge and has
 * no border on that side — the drawer has none on its side either — so the
 * two read as one folder. The closed ones stop a few pixels short and sit a
 * shade back, which is what the tabs behind the front one of a folder do.
 * The icon stays upright and only the name runs along the edge: a rotated
 * icon is a different icon.
 *
 * Above the drawers (160), so the open tab is drawn over the drawer's edge
 * rather than under it. */
/* Is a column out, and where it goes when it is not. `pinned` is the
 * screens' column beside an open screen (renderScreenTabs). */
const spineOut = ({ shown, pinned }) => Boolean(shown || pinned);
const spineAwayX = ({ side }) =>
  side === "right" ? "calc(100% + 4px)" : "calc(-100% - 4px)";

const DrawerTabs = styled.nav`
  position: fixed;
  /* **One spine a side** (26 Sep 2026, *"sol kısımdaki yaptığımız barı aynı
     şekilde sağ kısımdaki chip tuşları için de yapalım, burayı da sağ kısma
     koyalım"*). The screens — Settings, the portfolio, the derivatives
     page, the news, the base rates — have the same column on the right
     edge, which is the edge their corner controls were on. side="right"
     mirrors everything that has a direction: the edge, the slide, the
     rounded corners, the way the names read. */
  ${({ side }) => (side === "right" ? "right: 0;" : "left: 0;")}
  /* **Hung from the top, on the corner controls' line** (26 Sep 2026,
     *"sol tab'ı iyice yukarı çıkaralım"*). It was centred on the window, so
     the first tab began at y=195 of 800 and the column pointed at the
     middle of the chart rather than at the top of the drawer it opens —
     a folder's tabs are at its head. It takes the same top as the gear
     across the window, which is also the rule that keeps it off the page
     ticker: under the bar by the bar's measured height, on the bar's own
     clock (chromeUnderTicker). The top-left corner is free for it, because
     compare, the last control that lived there, is a tab on this spine
     now. */
  ${chromeUnderTicker};
  z-index: 170;
  width: ${CHROME_SPINE_REM}rem;
  display: flex;
  flex-direction: column;
  align-items: ${({ side }) => (side === "right" ? "flex-end" : "flex-start")};
  gap: 4px;

  /* **It rests in a drawer of its own** (26 Sep 2026, *"normalde bu kısım
     saklı kalsın, çekmece gibi olsun"*): slid out past the window's edge
     until the handle below brings it back, a drawer is open, or the tour
     is pointing at one of its tabs (spineShown, app.js). transform rather
     than left, so the slide costs no layout; and hidden as well as moved,
     after the slide, so a tab nobody can see cannot take the keyboard's
     focus either. The 4px past its own width carry the open tab's shadow
     out of sight with it. */
  transform: translateX(${(p) => (spineOut(p) ? "0" : spineAwayX(p))});
  visibility: ${(p) => (spineOut(p) ? "visible" : "hidden")};
  transition:
    top ${PAGE_TICKER_SLIDE_MS}ms ${PAGE_TICKER_EASE},
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0s linear ${(p) => (spineOut(p) ? "0s" : "0.28s")};

  /* **Pinned out beside an open screen**, under the screen's × — which is
     in the screen's own top corner, since a screen covers the page ticker
     and has no bar to clear. */
  @media (min-width: 601px) {
    ${({ pinned }) => (pinned ? "top: 3rem;" : "")}
  }

  @media (prefers-reduced-motion: reduce) {
    transform: none;
    opacity: ${(p) => (spineOut(p) ? 1 : 0)};
    transition:
      opacity 0.2s ease,
      visibility 0s linear ${(p) => (spineOut(p) ? "0s" : "0.2s")};
  }

  /* **On a phone it hangs from the foot**, because that is where a phone's
     drawer is: a sheet up from the bottom (chartDrawerPhone), whose head is
     nowhere near the top of the window. Hung from the top there, the tab
     column ran beside the price readout, which starts 32px from the edge
     at 360-420px — measured, the raised Widgets tab (36px) cut the dollar
     sign off a six-digit price. */
  @media (max-width: 600px) {
    top: auto;
    bottom: ${({ theme }) => theme.spacing.medium}rem;
    /* A phone's screen is the whole of a narrow window: the column stays
       in its drawer there and is pulled out by hand. */
    ${(p) =>
      p.pinned && !p.shown
        ? `transform: translateX(${spineAwayX(p)}); visibility: hidden; opacity: 0;`
        : ""}
  }
`;

/* **The pull on the tabs' drawer** (26 Sep 2026). A short tab of its own at
 * the window's edge, where the column's first tab will be, so the hand that
 * reaches for it is already where the column arrives.
 *
 * It opens on a press, or once the pointer has rested on it for
 * SPINE_DWELL_MS. **The wait is visible**: at rest it is tucked a few pixels
 * past the edge, and under the pointer it slides out over exactly the
 * dwell, so it finishes arriving as the column does — the board's arrows
 * light up the moment their dwell starts for the same reason, a wait that
 * shows nothing reads as a control that is broken.
 *
 * Under the column (165 against 170): while the column is out it covers
 * the pull, and the pull fades rather than showing round its edge. */
/* Under the pointer, or near it (SPINE_NEAR_X): out over exactly the
   dwell, so it finishes arriving as the column does. */
const pullOut = css`
  opacity: 1;
  transform: translateX(0);
  transition:
    top ${PAGE_TICKER_SLIDE_MS}ms ${PAGE_TICKER_EASE},
    opacity 0.2s ease,
    transform ${SPINE_DWELL_MS}ms linear;
`;

const DrawerTabsHandle = styled.button.attrs({ type: "button" })`
  position: fixed;
  ${({ side }) => (side === "right" ? "right: 0;" : "left: 0;")}
  ${chromeUnderTicker};
  z-index: 165;
  width: 14px;
  height: 3rem;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.color.border};
  ${({ side }) =>
    side === "right" ? "border-right: none;" : "border-left: none;"}
  border-radius: ${({ side }) =>
    side === "right" ? "7px 0 0 7px" : "0 7px 7px 0"};
  background: ${({ theme }) => theme.color.bgSecondary};
  cursor: pointer;
  /* **Quiet Controls is the pulls' weight now.** The setting made the corner
     controls rest as a ghost; since 26 Sep 2026 the corner holds only an
     open screen's ×, and what rests on the page are these two. They rest at
     the gear's old quiet level rather than the rest's, because they are
     the way back to that setting. */
  opacity: ${({ away, pinned, quiet }) =>
    away || pinned ? 0 : quiet ? QUIET_LEAD : 0.85};
  pointer-events: ${({ away, pinned }) => (away || pinned ? "none" : "auto")};
  transform: translateX(${({ side }) => (side === "right" ? "5px" : "-5px")});
  transition:
    top ${PAGE_TICKER_SLIDE_MS}ms ${PAGE_TICKER_EASE},
    opacity 0.2s ease,
    transform 0.2s ease;

  /* The grip: one short rule down the middle of what shows. */
  &::before {
    content: "";
    position: absolute;
    top: 50%;
    left: ${({ side }) =>
      side === "right" ? "calc(50% - 2px)" : "calc(50% + 2px)"};
    width: 2px;
    height: 1.1rem;
    border-radius: 1px;
    transform: translate(-50%, -50%);
    background: ${({ theme }) => theme.color.textSecondary};
  }

  &:hover {
    ${pullOut};
  }
  ${({ near, away, pinned }) => (near && !away && !pinned ? pullOut : "")}

  &:focus {
    outline: none;
  }

  &:focus-visible {
    opacity: 1;
    transform: translateX(0);
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }

  @media (prefers-reduced-motion: reduce) {
    &:hover {
      transform: translateX(
        ${({ side }) => (side === "right" ? "5px" : "-5px")}
      );
    }
    ${({ near, side }) =>
      near
        ? `transform: translateX(${side === "right" ? "5px" : "-5px"});`
        : ""}
  }

  @media (min-width: 601px) {
    ${({ pinned }) => (pinned ? "top: 3rem;" : "")}
  }

  @media (max-width: 600px) {
    top: auto;
    bottom: ${({ theme }) => theme.spacing.medium}rem;
    ${({ pinned, away, quiet }) =>
      pinned && !away
        ? `opacity: ${quiet ? QUIET_LEAD : 0.85}; pointer-events: auto;`
        : ""}
  }

  ${touchBox};
`;

/* **An open screen's ×, in the screen's top-right corner** (26 Sep 2026,
 * *"bu opak menülerdeki x kapatma tuşunu sağ üste koy, çok aşağıda"*). It
 * sat on the corner controls' line — 2rem down, and pushed under the page
 * ticker by the bar's height, 80px down with the bar on, although every
 * screen covers the bar. It is the screen's own corner now: 0.75rem from the
 * top and centred over the screens' column, which stands just under it while
 * a screen is open. One component for every screen; there were four, one
 * per corner control each × used to be, and the base rates kept a fifth in
 * their own head. */
const ScreenClose = styled.button.attrs({ type: "button" })`
  position: fixed;
  top: 0.75rem;
  right: ${(CHROME_SPINE_REM - 1.8) / 2}rem;
  z-index: 175;
  width: 1.8rem;
  height: 1.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 1.35rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  line-height: 1;
  cursor: pointer;
  transition: background 0.18s ease;

  &:hover {
    background: ${({ theme }) => theme.color.bgSecondary};
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }

  @media (max-width: 600px) {
    top: ${({ theme }) => theme.spacing.small}rem;
    right: ${({ theme }) => theme.spacing.small}rem;
  }

  ${touchBox};
`;

/* The column's gutter while a screen is open. The screens end one column
 * short of the window (besideScreenSpine, theme.js); this is the window's
 * last 2.25rem in the screen's own ground, so the column stands on the page
 * it serves rather than on the chart behind it. No rule between them: the
 * two are one ground, and a line down the whole height would draw a frame
 * around the screen. Above the swap's veil, so it does not blink. */
const ScreenRail = styled.div`
  display: none;

  @media (min-width: 601px) {
    display: block;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: ${CHROME_SPINE_REM}rem;
    z-index: 150;
    background: ${({ theme }) => theme.color.bg};
  }
`;

/* The tabs' dot, carried by the pull while the column is away. */
const DrawerTabsHandleDot = styled.span`
  position: absolute;
  top: 4px;
  ${({ side }) => (side === "right" ? "left: 3px;" : "right: 3px;")}
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.chartLineGreen};
`;

const drawerGround = ({ theme }) => theme.color.bg;

/* **A key, drawn where the thing it opens is named** (27 Sep 2026, *"her
 * bir menünün altında nasıl bir keyboard shortcut'ı olduğu yazıyor, bu
 * tasarım genele yayılmalı"*). The chart's and the widgets' drawers said
 * their key in a line at the foot; nothing else did, and a key only a
 * tooltip mentions is a key nobody learns. One component for every place a
 * key is shown — each tab on both columns, the head of every drawer and
 * screen, Settings' menu, and the rows that have one — so a key looks the
 * same wherever it is met. `quiet` is for a list where every item carries
 * one (the menu): outlined, in the secondary ink, so the column of keys
 * does not compete with the names beside it. */
const KeyCap = styled.kbd`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 1.2rem;
  height: 1.2rem;
  padding: 0 0.3rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-bottom-width: 2px;
  border-radius: 4px;
  background: ${({ quiet, theme }) =>
    quiet ? "transparent" : theme.color.bgSecondary};
  color: ${({ quiet, theme }) =>
    quiet ? theme.color.textSecondary : theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.64rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  line-height: 1;
  letter-spacing: 0;
  text-transform: none;
  vertical-align: middle;
  flex: 0 0 auto;
`;

/* The one way a key is drawn: its letter, and what pressing it does in the
   tooltip. Not hidden from a screen reader — the key is the information. */
const keyCap = (key, props) =>
  React.createElement(
    KeyCap,
    Object.assign(
      { "data-key-hint": key, title: msg("key_hint_title", "Key: $1", key) },
      props,
    ),
    key,
  );

const DrawerTab = styled.button.attrs({ type: "button" })`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  /* The open tab reaches the drawer; the rest stop short of it. */
  width: ${({ active }) => (active ? "100%" : "calc(100% - 5px)")};
  padding: 0.7rem 0 0.8rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  ${({ side, active, theme }) =>
    side === "right"
      ? `border-right: none; border-left: ${active ? "none" : `1px solid ${theme.color.border}`};`
      : `border-left: none; border-right: ${active ? "none" : `1px solid ${theme.color.border}`};`}
  border-radius: ${({ active, side }) =>
    active ? "0" : side === "right" ? "8px 0 0 8px" : "0 8px 8px 0"};
  /* The open one wears the drawer's ground, see-through exactly where the
     drawer is (chartDrawerSurface), so the join cannot show a seam. On the
     right it is an open screen's, which is opaque. */
  /* The open one wears the drawer's ground. Since the drawer went solid
     above the chart (27 Sep 2026, chartDrawerSurface) that ground is the
     page's own colour where the tabs hang, so it is that — the glass it
     carried before drew a lighter tab against a solid drawer. */
  background: ${({ active, theme }) =>
    active ? drawerGround({ theme }) : theme.color.bgSecondary};
  @media (min-width: 1025px) {
    background: ${({ active, theme }) =>
      active ? theme.color.bg : theme.color.bgSecondary};
  }
  color: ${({ active, theme }) =>
    active ? theme.color.text : theme.color.textSecondary};
  box-shadow: ${({ active, theme }) =>
    active ? `0 10px 30px ${theme.color.shadow}` : "none"};
  font-family: ${({ theme }) => theme.font.primary};
  /* **Full opacity, closed or open** (27 Sep 2026). A closed tab was the
     secondary ink at 0.78, which the design audit measured at 3.36:1 on its
     own ground — under what a 0.68rem label needs. The secondary ink alone
     is 5.3:1 and still reads as the quieter of the two. */
  opacity: 1;
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    color 0.2s ease,
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);

  &:hover,
  &:focus-visible {
    opacity: 1;
    color: ${({ theme }) => theme.color.text};
    /* A closed tab comes a step forward under the pointer. transform, not
       width: nothing on a new tab page animates layout. */
    transform: ${({ active, side }) =>
      active
        ? "none"
        : side === "right"
          ? "translateX(-2px)"
          : "translateX(2px)"};
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }

  @media (prefers-reduced-motion: reduce) {
    transition:
      opacity 0.2s ease,
      color 0.2s ease;
    &:hover,
    &:focus-visible {
      transform: none;
    }
  }
`;

/* **Compare's "on" is its icon and nothing else** (26 Sep 2026, *"compare
 * diğerlerine kıyasla biraz daha düzensiz"*). For an afternoon the tab stood
 * apart from the four drawers, took the accent across its name and grew by
 * the coin's name while comparing — 142px against the others' 85-114 — so
 * the one tab that opens no drawer was also the one that looked like a
 * different control. It is shaped, spaced and coloured like the rest now;
 * while a comparison is on, its icon takes the accent, which is the colour
 * the corner control it replaced wore for the same thing. */
const DrawerTabIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  color: ${({ lit, theme }) => (lit ? theme.color.accent : "inherit")};
`;

const DrawerTabName = styled.span`
  /* Read bottom to top on the left edge and top to bottom on the right —
     the way a spine is read on either side of a shelf; sideways rather than
     vertical so CJK names turn with the Latin ones. */
  writing-mode: ${({ side }) =>
    side === "right" ? "sideways-rl" : "sideways-lr"};
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  white-space: nowrap;
  font-weight: ${({ active, theme }) =>
    active ? theme.fontWeight.semibold : theme.fontWeight.regular};
`;

/* The tab's key, under its name. Upright, not turned with the name: a
   letter on its side is not the letter on the keyboard. */
const DrawerTabKey = styled.span`
  display: flex;
  justify-content: center;
  line-height: 0;

  /* Not on a phone, or wherever the pointer is a finger: there is no
     keyboard to press it on, and the key made every tab a line taller, which
     put the column hung from the foot over the stats row. */
  @media (max-width: 600px), (hover: none) {
    display: none;
  }
`;

/* Something happened behind a closed tab: a target was hit, a call came
 * back. The corner controls carried this dot, and the tabs replaced them. */
const DrawerTabDot = styled.span`
  position: absolute;
  top: ${({ top }) => top || "5px"};
  ${({ side }) => (side === "right" ? "left: 6px;" : "right: 6px;")}
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ theme, tone }) =>
    tone === "alert" ? theme.color.chartLineRed : theme.color.chartLineGreen};
`;

/* A small count beside the tab label: enough to say "there is work waiting"
 * without expanding the tab or turning the spine into a dashboard. */
const DrawerTabBadge = styled.span`
  margin-top: -0.15rem;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.22rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  font-size: 0.56rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
`;

const SettingsOverlay = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  /* **Opaque, and the chart is not behind it.**
     It was 85% white over 90% black, with the price line showing through as a
     ghost. Asked for on 23 Sep 2026: *"arka planda bizim ana grafik
     görünmesin… her bir tab'ı tam ekranda yapabiliriz"*. A panel that covers
     the screen and still shows the chart is neither one thing nor the other —
     the chart cannot be read through it and its own content is competing with
     a line. These are screens now, in the app's own ground. */
  background: ${({ theme }) => theme.color.bg};
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.35s ease;
  /* The backdrop blur went with the transparency: there is nothing behind
     this to blur, and blurring a whole viewport every frame is the most
     expensive thing a new-tab page can be asked to do for no picture. */
  /* Above the page ticker (90): a modal covers the page chrome, which also
     lets its × stay pinned to the corner instead of dodging the ticker */
  z-index: 100;
  /* **No rim** (23 Sep 2026, *"settings panelini tam ekran yap artık"*):
     Settings is a screen, and the way out is the × and Escape like every
     other screen. It had a card size with a rim until 26 Sep 2026. */
  padding: 0;
  ${besideScreenSpine};
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
  border-bottom: 1px solid
    ${({ theme }) => theme.color.border || "rgba(128,128,128,0.12)"};
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
      position === "top" ? pageTickerSlideTop : pageTickerSlideBottom}
    0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
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
  transition:
    opacity 0.22s ease,
    color 0.2s ease;
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
      position === "top" ? pageTickerHandleBobTop : pageTickerHandleBobBottom}
    1.9s ease-in-out infinite;
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
  transform: translateY(
    ${({ collapsed, position }) =>
      collapsed ? (position === "top" ? "-100%" : "100%") : "0"}
  );
  /* The same clock and curve the shell's padding uses — see
   * PAGE_TICKER_SLIDE_MS. They were 0.42s and 0.4s, which is two movements
   * that start together and stop twenty milliseconds apart. */
  transition: transform ${PAGE_TICKER_SLIDE_MS}ms ${PAGE_TICKER_EASE};
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
  /* A bottom ticker rises above the phone app's own bar (the shim's lift;
     0 in the extension), or the bar would cover every headline. */
  ${({ position }) =>
    position === "top" ? "top: 0;" : "bottom: var(--pt-dock-lift, 0px);"}
  left: 0;
  right: 0;
  z-index: 90;
  pointer-events: none;

  /* **It never hides** (25 Sep 2026, *"tickerlar şu an gizleniyor otomatik,
     bu olmayacak kesinlikle… hover olduğunda ticker aktif ise kaymaya devam
     edecek"*). For a day it faded with the corner controls, on the idea that
     a quiet page is one with less moving on it; the answer was that a bar
     you asked for is a bar you want to see. It keeps its lane either way —
     the layout never depended on the fade — and a drawer from the left now
     simply passes over it at the front layer while it keeps scrolling
     underneath. */
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

/* **Two readings the chart can answer and the newsroom cannot**: how rare a
 * step that was in this series' own terms, and what the price did next. They
 * sit between the date and the headlines, because they are facts about the
 * move and everything below is only what was being written near it.
 *
 * Mono, quiet, one line each, and absent when there is nothing to say — a
 * short chart has no distribution to compare against, and the newest mark on
 * the chart has no "next" yet. */
const MoveCardStat = styled.div`
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};

  &:last-of-type {
    margin-bottom: 0.65rem;
  }
`;

/* The heading over the stories that are *not* about this coin. It exists so
 * that a general headline is never presented as the explanation of a
 * particular move — the whole card is one sentence away from claiming a cause,
 * and this is one of the words that keeps it honest. */
const MoveCardGroup = styled.div`
  margin: 0.6rem 0 0.35rem;
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
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

/* **The other half of the handoff.** The panel's unusual section can now put
 * the marks on the chart; this goes the other way, from one mark's window to
 * the whole feed with its filters, sources and search. Same quiet weight as
 * the panel's button, because neither is the point of the card it sits on. */
const MoveCardGo = styled.button.attrs({ type: "button" })`
  margin-top: 0.7rem;
  padding: 0.22rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.62rem;
  color: ${({ theme }) => theme.color.textSecondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.borderHover};
  }
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
