/* PORTFOLIO STYLES
 *
 * Split out of `portfolio.js`, which had grown to 3,494 lines against this
 * repo's ~800-line guideline — a thousand of them styled-components sitting
 * between the file's helpers and its one component. The same cut that produced
 * `styles-app`, `styles-widgets`, `styles-settings`, `styles-alerts` and
 * `styles-news`: the component is the behaviour, this is the look, and neither
 * has to be scrolled past to read the other.
 *
 * **Loads before `portfolio.js`** (see `index.html`) — a styled component is
 * built when its template literal is evaluated, so anything interpolated
 * outside a function has to exist by then: `themedScrollbar` and the donut
 * constants below among them. Interpolations that are functions of `props` run
 * at render and may reach anything, which is why `bandInk` can call
 * `isLightTheme` and `PORTFOLIO_BAND_COLORS` from `portfolio-chart.js`.
 *
 * Nothing was renamed and nothing was reordered in the move. The order here is
 * the order they were declared in, because several name each other in
 * selectors and a styled component can only be addressed once it exists.
 */
// Same entrance family as SettingsCard's panelLift / WidgetCard's widgetAppear
const portfolioFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const portfolioLift = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
`;

const PortfolioShell = styled.section`
  position: fixed;
  inset: 0;
  z-index: 100;
  overflow-y: auto;
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  padding: 4.5rem 1.25rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: ${portfolioFadeIn} 0.3s ease;
  ${themedScrollbar};
`;

/* Full-bleed total-value chart behind the content. Fixed so the list scrolls
 * over it; the entrance must end at the same opacity the element rests at —
 * fading to 1 would flash bright, then visibly dim when the animation hands
 * back to the static style.
 *
 * **0.16, not 0.45.** At 0.45 this was not wallpaper: a filled area chart at
 * that weight was the most visually dominant thing on the screen, with a hard
 * grey stroke running straight through the holdings rows and two green
 * mountains behind the figures people came here to read. The word for that is
 * decoration you cannot ignore, which is the opposite of what it is for — and
 * it is why the whole view read as cluttered. There is a chart you *can* read
 * one button away ("Explore chart"); this one only has to suggest the shape.
 */
const portfolioChartIn = keyframes`
  from { opacity: 0; }
  to { opacity: 0.16; }
`;

/* THE WALLPAPER CHART, AND THE RULE IT WAS BREAKING.
 *
 * It is `position: fixed; inset: 0` at a flat 16% — a full-viewport line with
 * nothing keeping it away from anything. Rendered with five holdings, the
 * trace ran straight through the holdings rows, crossed the headline figures
 * and left the screen through the top-right corner. At that size it is not
 * ambient, it is a second drawing competing with the one you opened, and it
 * reads as a rendering fault rather than a decision.
 *
 * The fix is a rule rather than a smaller number: **nothing is drawn inside
 * the reading column.** A horizontal mask takes the wallpaper to nothing
 * across the width the content occupies and lets it back in only out in the
 * margins, so what remains is the tail of a chart passing behind the card —
 * which is a device, where a line through a table is a mistake.
 *
 * It degrades in the right direction, which is why the mask is in percentages
 * of the viewport rather than a fixed inset: on a window no wider than the
 * column there is no margin left, the mask covers everything, and the
 * wallpaper is simply absent. A background that has nowhere to go should go
 * nowhere, not squeeze itself over the text.
 *
 * `mask-image` composites and never lays out, so this costs nothing on a page
 * whose whole argument is what it does not do on open. */
const PORTFOLIO_COL = 760;

const PortfolioChartBg = styled.div`
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  /* Quieter as well as masked: in the margins it is decoration, and 16% was
     set when it was competing with the whole screen for attention. */
  opacity: 0.11;
  animation: ${portfolioChartIn} 0.6s ease;

  --pf-half: ${PORTFOLIO_COL / 2}px;
  --pf-fade: 96px;
  mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(50% - var(--pf-half) - var(--pf-fade)),
    transparent calc(50% - var(--pf-half) + 16px),
    transparent calc(50% + var(--pf-half) - 16px),
    #000 calc(50% + var(--pf-half) + var(--pf-fade)),
    #000 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(50% - var(--pf-half) - var(--pf-fade)),
    transparent calc(50% - var(--pf-half) + 16px),
    transparent calc(50% + var(--pf-half) - 16px),
    #000 calc(50% + var(--pf-half) + var(--pf-fade)),
    #000 100%
  );
`;

const PortfolioInner = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: ${PORTFOLIO_COL}px;
  animation: ${portfolioLift} 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  /* With nothing held the content is about 480px of a 900px window and it all
     sat against the top, so over half the screen was empty black beneath it —
     the void, rather than the two fields, was what you saw. margin: auto 0
     inside the shell column centres it, and unlike justify-content: center
     on the shell it degrades correctly: once the content is taller than the
     window the auto margins collapse to zero and the top stays reachable
     instead of being clipped above the scroll. */
  ${({ empty }) => (empty ? "margin: auto 0;" : "")}
`;

/* ── the chart brought forward ─────────────────────────────────────────────
 * Laid over the list rather than replacing it: the holdings stay mounted
 * underneath, so coming back costs no refetch, loses no scroll position and
 * keeps whatever row was open still open. It is opaque because the thing
 * behind it is a wall of text, and a chart you are trying to read through a
 * table is the problem this screen exists to fix.
 */
const PortfolioStage = styled.div`
  position: fixed;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4.5rem 1.25rem 1.5rem;
  background: ${({ theme }) => theme.color.bg};
  animation: ${portfolioFadeIn} 0.25s ease;
`;

const PortfolioStageInner = styled.div`
  width: 100%;
  max-width: 1100px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

// `min-height: 0` all the way down, or a flex child refuses to shrink and the
// x-axis band ends up below the fold with the container growing a scrollbar
const PortfolioStageChart = styled.div`
  flex: 1;
  min-height: 15rem;
  margin-top: 0.75rem;
`;

const PortfolioStageFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.6rem 1rem;
  margin-top: 0.9rem;
`;

const PortfolioStageTools = styled.div`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
`;

// A hint that says what the toggle costs, rather than leaving it to be
// discovered when the axis stops zooming
const PortfolioStageNote = styled.div`
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.color.textSecondary};
  /* The quiet variant is the standing model sentence rather than the note
   * about the mode you are in: it belongs under both, sits closer to the line
   * above it and steps back a shade, because it is the same on every mode and
   * should not compete with the one thing that changed. It is still real text
   * at a real size — the whole point is that it is read once.
   *
   * No backticks in this comment: it lives inside a template literal, and one
   * would end the literal here rather than quote a word. */
  margin-top: ${({ quiet }) => (quiet ? "0.25rem" : "0.5rem")};
  ${({ quiet }) => (quiet ? "opacity: 0.75;" : "")}
`;

/* THE ALLOCATION RING
 *
 * A **donut, not a pie**, and the hole is the argument: a pie invites you to
 * compare *areas*, which people read badly, and it has no room for the one
 * thing a ring cannot say. With the middle open the eye compares arc length,
 * and the centre carries the slice you are pointing at.
 *
 * It answers a question nothing else on this screen answered at a glance:
 * "what am I made of?" The rows print a percentage each, but seven numbers in
 * a column is a table, not a shape — and the value chart's By-coin mode
 * answers it *over time*, which is a different question and costs the zoom.
 *
 * **The colours are the value chart's** (`PORTFOLIO_BAND_COLORS`, six plus a
 * neutral Other, in the same biggest-first order `buildPortfolioParts` uses),
 * so a coin is one colour everywhere in this view. That palette is machine-
 * validated for colour-vision deficiency and the comment on it says it is
 * never cycled — this reuses it rather than inventing a second set that would
 * have to be validated again and would disagree with the chart below.
 *
 * The holdings list is the legend: each row's share bar now carries the same
 * colour, so the ring is labelled by the table under it rather than by a
 * second block of keys beside it.
 */
/* THE ALLOCATION STRIP
 *
 * It was a 132px donut, and the donut was replaced rather than tuned.
 *
 * Two things were wrong with it, one measurable and one not. The measurable
 * one: the hole is 102px across, the label under the figure was 97.6px wide,
 * and at the height that label sits the chord is 99.6px — so it filled the
 * hole wall to wall and read as text spilling onto the ring. The other is that
 * a circular, five-hue, fully saturated object was the **only** one in this
 * interface. Everything else here is monospace, left-aligned, near-black on
 * white, with green and red reserved for direction — the ring looked imported
 * from another product, which is what the human said when they saw it.
 *
 * A single horizontal bar fixes both and gains three things:
 *   - it is the same drawing as the share bar on every row of the list
 *     directly below it, so the header and the table finally agree;
 *   - length against length is an easier comparison than arc against arc,
 *     which was the donut's own argument against a pie, only more so;
 *   - it is 26px tall instead of 132, so the total gets the header back.
 *
 * Labels go **inside** a segment when it is wide enough to hold one — the
 * value chart's stacked mode already does exactly this, and it means no second
 * block of colour keys. Everything too narrow to be labelled is named by the
 * list underneath, which carries the same ink.
 */
// Below this share a segment is thinner than the gap beside it, so it reads as
// a seam rather than a holding. Those fold into Other with everything past the
// palette's sixth colour.
const DONUT_MIN_SHARE = 1.5;
// A label needs this much room before it stops being a truncation
const ALLOC_LABEL_MIN_PX = 58;

const PortfolioHeadRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    flex-wrap: wrap;
  }
`;

/* The colour is resolved **here, not in the component**, because a styled
 * block is handed the theme and `Portfolio` deliberately is not — the file
 * already refuses a `withTheme` wrapper it does not otherwise need (see the
 * sparkline's `currentColor` note). So the segment carries a palette *index*
 * and the stylesheet turns it into ink. `tone == null` is the neutral Other:
 * index 0 is a real colour and must not be caught by a falsy test. */
const bandInk = (theme, tone) => {
  const palette = isLightTheme(theme)
    ? PORTFOLIO_BAND_COLORS.light
    : PORTFOLIO_BAND_COLORS.dark;
  // `tone == null` is Other, which is the ramp's faintest step rather than a
  // separate grey — against a neutral ramp a grey would be a seventh shade of
  // the same thing, and as the last step it is exactly what it means
  return palette[tone == null ? palette.length - 1 : tone];
};

const AllocBlock = styled.div`
  margin-top: 1.15rem;
`;

// Same treatment as PortfolioEyebrow — this is a label, and labels here look
// like labels
const AllocHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  margin-bottom: 0.4rem;
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AllocNote = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.06em;
  text-transform: none;
`;

const AllocBar = styled.div`
  display: flex;
  gap: 2px;
  height: 26px;
  width: 100%;
  border-radius: 5px;
  overflow: hidden;
`;

/* One holding. `grow` is its share, so the row is laid out by flex rather than
 * by percentage widths — a rounding error then lands in the gaps instead of
 * leaving a sliver of background at the right-hand end. */
const AllocSeg = styled.div`
  flex: ${({ grow }) => grow} 1 0;
  min-width: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
  cursor: default;
  background: ${({ theme, tone }) => bandInk(theme, tone)};
  opacity: ${({ dim }) => (dim ? 0.3 : 1)};
  transition: opacity 0.18s ease;

  &:first-child {
    border-radius: 5px 0 0 5px;
  }
  &:last-child {
    border-radius: 0 5px 5px 0;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.text};
    outline-offset: -2px;
  }
`;

/* The ink follows the band it is written on, not the theme.
 *
 * It was white with a drop shadow, which worked while the palette was six
 * hues of roughly one lightness. The palette is a ramp now
 * (`PORTFOLIO_BAND_COLORS`), and a ramp crosses the point where white stops
 * being legible and black starts — so one fixed ink is unreadable at one end
 * of it whichever end you choose. `PORTFOLIO_BAND_INK` carries the answer per
 * step, every entry measured at 4.7:1 or better against its own band, which is
 * also why the shadow has gone: it was propping up a contrast that is now
 * there on its own.
 */
const AllocSegLabel = styled.span`
  font-size: 0.64rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.04em;
  color: ${({ theme, tone }) => bandLabelInk(theme, tone)};
  padding: 0 0.35rem;
`;

const PortfolioHeader = styled.div`
  margin-bottom: 1.5rem;
`;

// Mirrors SettingsGroupTitle's label treatment (size + tracking)
const PortfolioEyebrow = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.35rem;
`;

const PortfolioTotal = styled.div`
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1.1;
`;

const PortfolioDelta = styled.div`
  margin-top: 0.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: ${({ theme, up }) =>
    up == null
      ? theme.color.textSecondary
      : up
        ? theme.color.chartLineGreen
        : theme.color.chartLineRed};
`;

/* Stats under the headline, in two tiers.
 *
 * They used to be one flat run of equal-weight chips, which worked at three
 * and stopped working at seven: ~950px of content in a 760px column, wrapping
 * into two lines of 10px uppercase with nothing to tell you where to look
 * first. Now the two results — what you have made, realized and not — lead at
 * a readable size, and everything that qualifies them sits in a quiet grid
 * underneath. The grid also aligns them into columns instead of letting them
 * run together at whatever width each happens to be.
 */
const PortfolioStatsLead = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.6rem;
  margin-top: 0.75rem;
`;

/* Grouped, not just aligned.
 *
 * The grid already lined the seven figures into columns; what it could not do
 * was say which belonged together. Read straight across, "vs BTC · Worst fall
 * · Return p.a. · Long term" is four unrelated facts in a row, and the reader
 * has to sort them. They are really three subjects — how it went wrong, what
 * it returned, and what today did — so the columns are now those subjects,
 * each a stack, with a hairline between them. Nothing was added or removed;
 * the same numbers are simply standing next to the ones they belong with. */
const PortfolioStatGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding-left: 1.2rem;
  border-left: 1px solid ${({ theme }) => theme.color.border};

  &:first-child {
    padding-left: 0;
    border-left: none;
  }

  /* One column on a narrow screen: three stacks side by side in a 320px
     column is three characters wide each. The rules go with them, or every
     group would grow a stray line above it. */
  @media (max-width: 620px) {
    padding-left: 0;
    border-left: none;
  }
`;

const PortfolioStats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.9rem 1.2rem;
  margin-top: 0.7rem;
  padding-top: 0.7rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const StatItem = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  white-space: nowrap;
  /* The lead tier stacks its label above the value, so the two figures read
     as headlines rather than as two more entries in a list */
  ${({ lead }) =>
    lead &&
    css`
      flex-direction: column;
      align-items: flex-start;
      gap: 0.1rem;
      /* 1.05rem was the same weight as the period change under the total, so
         the screen carried two large green figures one above the other and
         nothing said which was the headline — they answer different questions
         (what the basket did over the range; what it is worth against what
         you paid). The total keeps the headline; this is the second rank, and
         being visibly second is the whole job. */
      font-size: 0.92rem;
    `}
`;

const StatLabel = styled.span`
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.62rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const StatValue = styled.span`
  font-weight: 600;
  color: ${({ theme, up }) =>
    up == null
      ? theme.color.text
      : up
        ? theme.color.chartLineGreen
        : theme.color.chartLineRed};
`;

/* THE CHART, IN THE PLACE IT WAS ALREADY LEAVING EMPTY.
 *
 * Between the stats and the holdings list there was a band with nothing in it
 * but the range switcher and a button — measured at roughly 200px on a 900px
 * window, in the middle of the screen. Meanwhile the only chart on the page
 * was the wallpaper, which is deliberately unreadable, and seeing a real one
 * took a click.
 *
 * The data was already loaded for the wallpaper, so putting a bounded chart
 * here costs nothing but the pixels. `Explore chart` still opens the full
 * stage — this is the glance, that is the instrument. It is the difference
 * between a form with figures on it and something that reads as a dashboard.
 *
 * Fixed height rather than an aspect ratio: the band it fills is a fixed gap,
 * and a chart that grows with the window would push the holdings list off the
 * fold on a short one. */
/* It has to pass the height straight through.
 *
 * The chart measures its own frame and draws nothing at all when that comes
 * back zero — it renders a bare box with no plot in it. Dropped in as a plain
 * `div`, this wrapper broke the flex chain from the stage down to the chart,
 * so every mode rendered an empty frame: the browser suite could not find the
 * plot at all, on a page that looked to me like it was working. A wrapper that
 * animates must be invisible to layout. */
const PortfolioChartSwap = styled.div`
  display: flex;
  flex-direction: column;
  /* A percentage height, not a flex item property: the parent it sits in is
     not a flex container, so flex:1 on this did nothing and the box collapsed
     to zero — measured at 1100x0, which the chart inside then read as "no
     room" and drew nothing at all. (No backticks in this comment: it lives in
     a template literal and one would end it here.) */
  height: 100%;
  width: 100%;
`;

const PortfolioInlineChart = styled.div`
  position: relative;
  height: 8.5rem;
  margin-top: 1.1rem;
  cursor: pointer;

  /* A frame, not a card: the surrounding screen is already a stack of
     panels, and one more filled box would make the chart the heaviest thing
     on a page whose headline is the total. */
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale * 6}px;
  padding: 0.5rem 0.35rem 0.2rem;
  transition: border-color 140ms ease;

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.text};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.border};
  }

  /* Under about 560px the holdings rows already drop their sparklines; a
     chart in a column that narrow is a smear, and the stage is one tap away. */
  @media (max-width: 560px) {
    display: none;
  }
`;

// Pulls the (generously padded) PeriodSwitcher into the portfolio's rhythm
const PortfolioPeriodRow = styled.div`
  margin: -1.25rem 0 -0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
`;

// Section labels between the header and the lists — same voice as the eyebrow
const PortfolioSectionLabel = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin: 1.5rem 0 0.6rem;
`;

/* The list's heading and its order control share a line: the control belongs
 * to the list it reorders, not to the page. Same shape as the coin list's
 * sort row in Settings, so the two read as the same gesture. */
const PortfolioSortRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.4rem 0.75rem;
  margin: 1.5rem 0 0.6rem;
`;

const PortfolioSortBtns = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  flex-wrap: wrap;
`;

const PortfolioSortLabel = styled.span`
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-right: 0.1rem;
`;

const PortfolioSortBtn = styled.button.attrs({ type: "button" })`
  padding: 0.15rem 0.45rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  color: ${({ theme, active }) =>
    active ? theme.color.bg : theme.color.textSecondary};
  background: ${({ theme, active }) =>
    active ? theme.color.text : "transparent"};
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

// The same pill as the sort buttons, given room for an icon beside its label
const PortfolioChartBtn = styled(PortfolioSortBtn)`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  font-size: 0.68rem;
`;

const HoldingsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const HoldingRow = styled.div`
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 6.5rem 6.5rem 4.5rem 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.color.bgSecondary};
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr 6rem 1fr auto;
  }
`;

// Column labels above the list (matches HoldingRow's grid; the coin and
// remove columns stay unlabeled). Hidden on narrow screens with the cost
// column.
const HoldingsHead = styled.div`
  display: grid;
  grid-template-columns: 1fr 6.5rem 6.5rem 4.5rem 1fr auto;
  gap: 0.75rem;
  padding: 0 0.85rem;
  margin-bottom: 0.4rem;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};

  & > span {
    text-align: right;
  }

  @media (max-width: 560px) {
    display: none;
  }
`;

/* Per-row trend. The histories are already fetched for the background chart
 * (the twelve biggest by value), so for most rows this costs nothing and the
 * rest simply show no curve rather than a placeholder. It carries no numbers
 * — the change and the value are printed right beside it — so it is doing the
 * one thing a number can't: showing the shape of how it got there. */
const HoldingSpark = styled.svg`
  display: block;
  width: 100%;
  height: 1.6rem;
  overflow: visible;
  /* The polyline strokes currentColor, so the theme reaches it here rather
     than through a withTheme wrapper the component does not otherwise need.

     **Neutral ink, not green or red**, and that is this project's own rule
     rather than a preference: on this row those two colours already mean
     "up on what you paid" and "down on it", printed as a figure two inches to
     the right. The sparkline was colouring itself by a different question —
     the trend across the displayed range — so a holding could show a red line
     beside a green +$2,448, which is two colour signals contradicting each
     other about the same coin. Measured on a five-holding portfolio, two of
     the five rows did exactly that.

     Nothing is lost by dropping the colour, because the line's own slope
     already says which way the range went; what goes is a second meaning
     borrowing a channel that was spoken for. The chart's buy/sell markers and
     the travel band were both made neutral for this reason, and each says so
     in its own comment. */
  color: ${({ theme }) => theme.color.textSecondary};
  opacity: 0.75;

  @media (max-width: 560px) {
    display: none;
  }
`;

const HoldingSparkCell = styled.div`
  min-width: 0;

  @media (max-width: 560px) {
    display: none;
  }
`;

/* Allocation meter: a thin underline whose width is this holding's share.
 *
 * It carries **the coin's own colour from the allocation ring** rather than
 * one neutral accent for every row. That is what makes the list the ring's
 * legend: the ring says the shape, the row says which arc, and neither needs
 * a separate block of colour keys beside it. Rows past the palette's six, and
 * any too thin to be an arc, fall back to the old neutral — the ring calls
 * them Other, and Other is not a colour you can point at. */
const HoldingShareBar = styled.div`
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  border-radius: 0 1px 0 0;
  /* Neutral for Other, never the blue it used to fall back to: the palette's
     own rule is that Other stays the secondary ink so it reads as *not one of
     these*, and a blue bar under a row made it look like a seventh identity
     rather than the absence of one. (No backticks: template literal.) */
  background: ${({ theme, tone }) =>
    tone == null ? theme.color.textSecondary : bandInk(theme, tone)};
  opacity: ${({ tone }) => (tone == null ? 0.55 : 0.85)};
  transition: width 0.3s ease;
`;

// Clicking the coin opens/closes the row's source + purchases breakdown
/* Hovering a coin says two things: this is the interactive part of the row,
 * and pressing it opens something.
 *
 * It used to say them by turning the symbol `chartLine` — a **blue**, and the
 * only blue in this interface. On a word, at that saturation, it reads as a
 * hyperlink, which is the one thing it is not. The accent is green-family now
 * and deliberately not the up-green: that colour means "up" beside the money
 * on the same row, and an accent identical to it would make hovering a coin
 * look like a reading about the coin.
 *
 * And it moves, which is the half that was missing entirely — the colour
 * swapped instantly. The chevron slides a little way towards where it is
 * about to point, so the row hints at what the click does rather than only
 * lighting up. `transform` and `color` only: neither touches layout, so a
 * pointer running down five rows costs nothing. */
const HoldingCoin = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  cursor: pointer;
  user-select: none;
  transition: color 0.16s ease;

  /* HoldingSym inherits this; HoldingName sets its own colour */
  &:hover {
    color: ${({ theme }) => theme.color.accent};
  }

  &:hover > * > span:first-child {
    transform: translateX(2px);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover > * > span:first-child {
      transform: none;
    }
  }
`;

const Chevron = styled.span`
  display: inline-block;
  margin-right: 0.35rem;
  font-size: 0.6rem;
  /* Takes the accent with the rest of the row on hover, rather than staying
     grey while the symbol beside it lights up. */
  color: inherit;
  opacity: 0.65;
  transform: rotate(${({ open }) => (open ? "90deg" : "0deg")});
  transition:
    transform 0.16s ease,
    opacity 0.16s ease;
`;

const HoldingSym = styled.div`
  font-weight: 700;
  font-size: 0.95rem;
`;

const HoldingName = styled.div`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AmountInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  text-align: right;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 7px;
  transition: border-color 0.15s ease;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

// Cost-basis cell: a button that opens the row's purchase-lot editor.
// Styled like the inputs so the grid reads as one family; hidden on narrow
// screens (amount wins the space).
const LotsBtn = styled.button.attrs({ type: "button" })`
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  text-align: right;
  color: ${({ theme, empty }) =>
    empty ? theme.color.textSecondary : theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid
    ${({ theme, open }) => (open ? theme.color.borderHover : theme.color.border)};
  border-radius: 7px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  @media (max-width: 560px) {
    display: none;
  }
`;

// Expanded lot editor: spans the whole row under the grid columns
const LotsPanel = styled.div`
  grid-column: 1 / -1;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  margin-top: 0.25rem;
  padding-top: 0.6rem;
`;

const LotLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.2rem 0;
  font-size: 0.78rem;
`;

const LotMeta = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.7rem;
`;

// Bought / Sold. Same visual language as the targets panel's kind toggle —
// the two features ask the user the same shape of question.
const LotModeRow = styled.div`
  display: flex;
  gap: 0.3rem;
  margin-top: 0.5rem;
`;

const LotModeBtn = styled.button.attrs({ type: "button" })`
  padding: 0.2rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  color: ${({ theme, active }) =>
    active ? theme.color.bg : theme.color.textSecondary};
  background: ${({ theme, active }) =>
    active ? theme.color.text : "transparent"};
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const LotForm = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const LotFormInput = styled(AmountInput)`
  flex: 1;
  text-align: left;
`;

const LotAddBtn = styled.button.attrs({ type: "button" })`
  padding: 0 0.9rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.78rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 7px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

/* The bar that offers the last destructive action back.
 *
 * Deliberately the same shape as `AlertUndoBar` — dashed, quiet, with the
 * action at the far end — because it is the same promise, and a second visual
 * language for "you can take that back" would make people learn it twice.
 */
/* The cost-basis method picker. Same shape as the sort buttons above the
 * list — this is a choice between three named things, and the app already has
 * one drawing for that. */
const MethodRow = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.4rem 0.6rem;
  margin: 1.2rem 0 0.4rem;
`;

const MethodLabel = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const MethodBtn = styled.button.attrs({ type: "button" })`
  padding: 0.18rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.7rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.04em;
  color: ${({ theme, active }) =>
    active ? theme.color.bg : theme.color.textSecondary};
  background: ${({ theme, active }) =>
    active ? theme.color.text : "transparent"};
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    color: ${({ theme, active }) => (active ? theme.color.bg : theme.color.text)};
    border-color: ${({ theme }) => theme.color.text};
  }
`;

const PortfolioUndoBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin: 0.9rem 0;
  padding: 0.5rem 0.75rem;
  background: ${({ theme }) => theme.color.bg};
  border: 1px dashed ${({ theme }) => theme.color.border};
  border-radius: 10px;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PortfolioUndoBtn = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  padding: 0.2rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.68rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.color.text};
  }
`;

const LotNote = styled.div`
  margin-top: 0.45rem;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Marker next to the coin symbol showing the row is fed by watched
// addresses (the whole coin cell opens the breakdown, so this is inert)
const WatchedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  margin-left: 0.35rem;
  line-height: 1;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const WatchedBadgeCount = styled.span`
  font-size: 0.6rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
`;

/* Compact chips summarising every watched address, so what's being synced
 * is visible at a glance; clicking one opens that coin's breakdown. */
const WatchChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.6rem;
`;

const WatchChip = styled.button.attrs({ type: "button" })`
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  color: ${({ theme }) => theme.color.textSecondary};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const WatchChipCoin = styled.span`
  font-weight: 700;
  color: ${({ theme }) => theme.color.text};
`;

/* Source breakdown inside the expanded row: one block per source (the
 * manual part first, then each watched address) so it's obvious which
 * coins came from where. */
const SourceBlock = styled.div`
  padding: 0.5rem 0;
  border-top: 1px solid ${({ theme }) => theme.color.border};

  &:first-child {
    border-top: none;
    padding-top: 0;
  }
`;

const SourceHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
`;

const SourceTitle = styled.div`
  min-width: 0;
  font-size: 0.74rem;
  font-weight: 600;
`;

const SourceAmount = styled.div`
  flex: 0 0 auto;
  font-size: 0.74rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Amount cell for rows fed by watched addresses: the column keeps showing
// the coin's total, and clicking opens the breakdown (the hand-entered part
// is edited inside the accordion).
const AmountTotalBtn = styled.button.attrs({ type: "button" })`
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  text-align: right;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px dashed ${({ theme }) => theme.color.border};
  border-radius: 7px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

// Manual-amount field inside the accordion (only shown when the row also
// has watched sources — otherwise the row's own input handles it)
const SourceAmountInput = styled(AmountInput)`
  flex: 0 0 7rem;
`;

const SourceAddr = styled.div`
  margin-top: 0.15rem;
  font-size: 0.66rem;
  color: ${({ theme }) => theme.color.textSecondary};
  word-break: break-all;
  user-select: all;
`;

const StopWatchBtn = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  padding: 0.3rem 0.7rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 7px;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.chartLineRed};
    border-color: ${({ theme }) => theme.color.chartLineRed};
  }
`;

const HoldingValue = styled.div`
  text-align: right;
  min-width: 0;
`;

const HoldingValueMain = styled.div`
  font-weight: 600;
  font-size: 0.9rem;
`;

const HoldingValueSub = styled.div`
  font-size: 0.72rem;
  color: ${({ theme, up }) =>
    up == null
      ? theme.color.textSecondary
      : up
        ? theme.color.chartLineGreen
        : theme.color.chartLineRed};

  @media (max-width: 560px) {
    display: none;
  }
`;

// Circular hover treatment, same as SettingsClose
const RemoveBtn = styled.button.attrs({ type: "button" })`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  width: 1.7rem;
  height: 1.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  &:hover {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.chartLineRed};
  }
`;

const AddSection = styled.div`
  margin-top: 1.5rem;
  position: relative;
`;

// Same eyebrow voice as the section labels (AddSection provides the margin)
const AddLabel = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.6rem;
`;

const SearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 0.7rem 0.85rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.9rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  transition: border-color 0.15s ease;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

/* Address watching: coin picker + address field + submit, one row */
const WatchRow = styled.div`
  display: flex;
  gap: 0.5rem;
`;


const WatchInput = styled(SearchInput)`
  width: auto;
  flex: 1;
`;

const WatchBtn = styled.button.attrs({ type: "button" })`
  padding: 0 1rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const Suggestions = styled.div`
  margin-top: 0.4rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bgSecondary};
  box-shadow: 0 2px 8px ${({ theme }) => theme.color.shadow};
  animation: ${portfolioLift} 0.25s cubic-bezier(0.22, 1, 0.36, 1);
`;

const SuggestionRow = styled.button.attrs({ type: "button" })`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 0.6rem 0.85rem;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease;
  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.color.bg};
  }
`;

const SuggestionName = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.78rem;
`;

/* Where the total goes when there is no total.
 *
 * Same place as `PortfolioTotal` — this is still the headline of the screen —
 * but in the secondary ink, because it is a state rather than a figure, and a
 * little smaller than the money it stands in for: three words at 2.6rem is a
 * slogan, and this is a caption.
 */
const PortfolioEmptyTitle = styled.div`
  font-size: 1.6rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.01em;
  color: ${({ theme }) => theme.color.textSecondary};
  margin: 0.15rem 0 0;
`;

// The one instruction. The privacy promise is the footer's job on every other
// state of this screen, and it stays the footer's job here.
const PortfolioEmptyLine = styled.div`
  margin-top: 1.25rem;
  font-size: 0.85rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Backup / restore / report actions — quiet text buttons in the eyebrow voice
const ToolsRow = styled.div`
  display: flex;
  /* Centred under a full-width list, but the empty screen is a single
     left-aligned column of about 410px inside a 760px box, and a centred
     footer under it reads as belonging to something else. */
  justify-content: ${({ empty }) => (empty ? "flex-start" : "center")};
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin-top: 1.5rem;
`;

const ToolBtn = styled.button.attrs({ type: "button" })`
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }

  /* On the empty screen this is one of only three ways to get data in, and
     the other two are obvious input fields — a borderless label in secondary
     ink was the odd one out and did not read as something you could press.
     It takes the address field's own button shape, so the three routes in
     look like three routes in. Only when empty: alongside Export and Merge
     under a populated list, three pills would be heavier than that footer
     wants. */
  ${({ empty, theme }) =>
    empty
      ? `
    padding: 0.5rem 0.9rem;
    color: ${theme.color.text};
    background: ${theme.color.bgSecondary};
    border: 1px solid ${theme.color.border};
    border-radius: 10px;
    transition: border-color 0.15s ease;

    &:hover {
      border-color: ${theme.color.borderHover};
    }
  `
      : ""}
`;

const ImportError = styled.div`
  margin-top: 0.5rem;
  font-size: 0.72rem;
  text-align: center;
  color: ${({ theme }) => theme.color.chartLineRed};
`;

const PrivacyNote = styled.div`
  margin-top: 1.5rem;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
  text-align: ${({ empty }) => (empty ? "left" : "center")};
  ${({ empty }) => (empty ? "max-width: 30rem;" : "")}
`;
