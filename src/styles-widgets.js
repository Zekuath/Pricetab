/* WIDGET PANEL STYLES */
/* Hidden until the card is hovered — except where there is no hover to give.
 * On a tablet the widget row sits at the bottom of the screen and this was
 * the only way to dismiss a card, so it was unreachable on exactly the
 * devices that have the least room for the row. */
const WidgetHideButton = styled.button.attrs({ type: "button" })`
  position: absolute;
  top: 0.4em;
  right: 0.55em;
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

  /* On a touch screen the whole corner of the card is the button — the box
     the shared touch fragment would draw reaches past the card's edge, where
     the next card or the chart takes the press instead. The glyph stays the
     size it is; the button around it grows, in em like everything in a card. */
  @media (pointer: coarse) {
    top: 0;
    right: 0;
    width: 2.6em;
    height: 2.6em;
  }
`;

/* **The widgets are a drawer now, not a rail** (25 Sep 2026, *"soldan
 * hoverlanabilir olan menülerin yani widget, chart settings, targets, calls
 * kısmı soldan… folder tag gibi"*). They were a column of cards pinned down
 * the left of the chart for good, which is where the drawers dock too — so
 * for a day the column had to stand down whenever one opened. Now they are
 * the first of the four drawers on that edge, opened from its tab, and the
 * home screen is the chart and nothing over it.
 *
 * Same surface, same slide and same place as the chart's own drawer — see
 * ChartDrawer in styles-settings.js — because four drawers that arrive four
 * ways is the thing the folder tabs are there to hide. */
const WidgetsDrawer = styled.aside`
  ${chartDrawerSurface};
  /* Two cards across. A card's width is set in em by the size setting, so
     the grid below decides the columns and this only has to hold two of the
     medium size with their gap.
     **Or what the right edge was dragged to** (27 Sep 2026) — --widgets-w,
     set on the element by the app from WIDGETS_WIDTH_KEY, absent until the
     edge is first moved. The window still caps it, so a width chosen on a
     wide screen opens inside a narrow one; the phone's sheet (below) sets
     its own width and ignores both. */
  width: min(var(--widgets-w, 30rem), 92vw);
  padding: ${({ theme }) => theme.spacing.large}rem;
  /* The head on the targets drawer's line — see ChartDrawerTitle. */
  padding-top: 1.3rem;
  transform: translateX(${({ open }) => (open ? "0" : "calc(-100% - 8rem)")});
  opacity: ${({ open }) => (open ? 1 : 0)};
  visibility: ${({ open }) => (open ? "visible" : "hidden")};
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.24s ease,
    visibility 0s linear ${({ open }) => (open ? "0s" : "0.3s")};

  @media (prefers-reduced-motion: reduce) {
    transition: opacity 0.2s ease, visibility 0s;
    transform: none;
  }

  ${chartDrawerPhone};

  @media (max-width: 600px) {
    transform: translateY(${({ open }) => (open ? "0" : "calc(100% + 1.5rem)")});
  }
`;

/* The cards, inside the drawer. A grid rather than the old flex column: the
 * drawer is two cards wide, and a column of one would leave half of it empty
 * while the list scrolled. min(100%, …) so a single XL card still fits a
 * phone's sheet instead of overflowing it. */
const WidgetPanel = styled.div`
  display: grid;
  /* **The column floor rides the card size** (27 Sep 2026). It was 12.5rem
     whatever the size, so XL cards — 1.45 times the type — were poured into
     the same two medium columns and wrapped every line; the size setting
     made the text bigger and the cards no wider. Now the drawer holds as
     many of the chosen size as fit, and widening it (the right edge) is how
     to get two XL cards side by side. */
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(100%, ${({ scale }) => 12.5 * (scale || 1)}rem), 1fr)
  );
  align-content: start;
  gap: 0.5rem;
  /* Room for the cards' own shadow inside the scroller, which would
     otherwise clip it at the edges. */
  padding: 3px;
`;

/* What the drawer says when there is nothing in it: which of two things is
 * true, and the one press that changes it. */
const WidgetsDrawerEmpty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.small}rem;
  padding: ${({ theme }) => theme.spacing.medium}rem 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const WidgetsDrawerAction = styled.button.attrs({ type: "button" })`
  padding: 0.4rem 0.75rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.72rem;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

/* The head's right-hand end: Choose / Done beside the ×. The head lays out
 * its title against one child, so the two ride in this. */
const WidgetsDrawerTools = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5em;

  /* **On a phone the sizes take a second line** (27 Sep 2026). Title, four
     letters, Choose and × came to 327px in a 306px head at 390 wide, and the
     × was pushed past the sheet's edge. The break is forced, not left to
     wrapping — a shorter translation would otherwise fit the sizes after the
     ×, which has to stay last — by a zero-height item that takes a whole
     line between the two rows. */
  @media (max-width: 600px) {
    flex-wrap: wrap;
    justify-content: flex-end;
    row-gap: 0.25rem; /* twice: the break is a line of its own */

    &::before {
      content: "";
      order: 2;
      flex-basis: 100%;
      height: 0;
    }
  }
`;

/* **The card size, in the drawer's head** (27 Sep 2026, *"widgetları
 * yeniden boyutlandıralım, zaten ayarlarında yazı büyüklüğü vardı"*). The
 * S/M/L/XL row existed, but only on the drawer's Choose view — one press
 * away from the cards it changes and out of sight while you look at them.
 * A segmented control of four letters, beside Choose, so the cards resize
 * under the pointer that asked. */
const WidgetsSizeGroup = styled.div`
  display: inline-flex;
  align-items: stretch;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;

  /* After the break WidgetsDrawerTools draws on a phone. */
  @media (max-width: 600px) {
    order: 3;
  }
`;

const WidgetsSizeButton = styled.button.attrs({ type: "button" })`
  min-width: 1.75rem;
  padding: 0.3rem 0.4rem;
  border: none;
  background: ${({ active, theme }) => (active ? theme.color.bgSecondary : "transparent")};
  color: ${({ active, theme }) => (active ? theme.color.text : theme.color.textSecondary)};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  font-weight: ${({ active, theme }) => (active ? theme.fontWeight.semibold : theme.fontWeight.regular)};
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  ${touchTarget};
  /* Four 28px letters side by side: each one's finger box overlapped the
     next, so a press off centre took the neighbour. Drawn wider on touch. */
  @media (pointer: coarse) {
    min-width: 2.25rem;
    min-height: 2rem;
  }

  /* Rounded at the ends by hand: an overflow: hidden on the group would
     clip the finger-sized box touchTarget draws round each letter. */
  &:first-child {
    border-radius: 5px 0 0 5px;
  }

  &:last-child {
    border-radius: 0 5px 5px 0;
  }

  & + & {
    border-left: 1px solid ${({ theme }) => theme.color.border};
  }

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bgSecondary};
  }
`;

/* **The drawer's right edge, dragged sideways** (27 Sep 2026, *"widget
 * penceresini de yeniden boyutlandırabilelim, sağa ve sola, aşağı yukarı
 * yok"*). Width only: the drawer already runs the window's height, top to
 * bottom, so there is no height to hand out. The WAI-ARIA window splitter —
 * a focusable separator with its value, arrows to step it, Home and End for
 * the ends — plus a double-click back to the 30rem it opens at. The strip is
 * 12px astride the border and invisible; a short grip shows where it is on
 * hover and focus. No handle on a phone, where the drawer is a sheet the
 * width of the screen. */
const WidgetsResize = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  right: -6px;
  width: 12px;
  z-index: 2;
  cursor: ew-resize;
  touch-action: none;
  outline: none;

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 4px;
    height: 2.75rem;
    border-radius: 2px;
    transform: translate(-50%, -50%);
    background: ${({ theme }) => theme.color.borderHover};
    opacity: ${({ dragging }) => (dragging ? 1 : 0)};
    transition: opacity 0.15s ease;
  }

  &:hover::after,
  &:focus-visible::after {
    opacity: 1;
  }

  &:focus-visible::after {
    background: ${({ theme }) => theme.color.text};
  }

  @media (max-width: 600px) {
    display: none;
  }
`;

/* Widget internals. Everything is `em` so it rides the card's size, and the
 * up/down colours come from the theme rather than fixed hex — the dark-mode
 * greens and reds were being drawn on white in light mode, where they are
 * noticeably weaker. */
const FundingValue = styled.div`
  font-size: 1.15em;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
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
  font-size: 1.15em;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  letter-spacing: 0.01em;
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
  /* A card in the phone's scrolling row keeps a width its title and its ×
     both fit in; a narrower one drew the × over the title. */
  @media (max-width: 600px) {
    min-width: 11em;
  }
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.95)"
      : "rgba(15, 15, 15, 0.9)"};
  backdrop-filter: blur(8px);
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 0.6em;
  padding: 0.55em 0.85em 0.65em;
  /* A ledger, not a badge. Every card was centred — title, figure, caption —
     which reads as a row of tiles on a dashboard poster. Left-aligned, with
     the title as a head bar and the figure under it, the column reads like a
     desk's readings: the eye runs down one edge and every card starts where
     the last one did. The meters and bars are full-width either way. */
  text-align: left;
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
/* The card's head bar: the title on its own line with a hairline under it,
 * and room at the right end for the × so the two never meet. */
const WidgetLabel = styled.div`
  font-size: 0.62em;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  padding: 0 1.6em 0.45em 0;
  margin-bottom: 0.5em;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/* The figure: one step heavier than the caption under it, and larger than
 * the title over it — the rule every readings card on the derivatives page
 * follows, brought to the column. */
const WidgetValue = styled.div`
  font-size: 1.15em;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
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
  font-size: 0.68em;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.2em;
  /* No text-transform. It used to capitalize, which was invisible while every
   * subtext was one word from an API that already capitalised it ("Greed",
   * "Neutral") and wrong the moment one of them became a sentence: the
   * network-fee cards read "≈ $0.21 To Send · Next Block". Nothing here
   * depended on it — the strings are cased correctly in the source, which is
   * where a reader looks. */
`;

/* **The regime grid** — nine cells and their headings, in the card's em
 * like everything in it. Neutral ink throughout: "rising" and "falling" are
 * names of states here, not figures, and green and red already mean a
 * figure went up or down. The row for today's state is the one marked. */
const RegimeTable = styled.div`
  display: grid;
  grid-template-columns: auto repeat(3, auto);
  justify-content: start;
  align-items: baseline;
  column-gap: 0.3em;
  row-gap: 0.1em;
  margin-top: 0.35em;
  font-size: 0.64em;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
`;

const RegimeHead = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  text-align: ${({ left }) => (left ? "left" : "right")};
  white-space: nowrap;
`;

const RegimeCell = styled.span`
  text-align: ${({ left }) => (left ? "left" : "right")};
  white-space: nowrap;
  padding: 0.1em 0.25em;
  border-radius: 0.25em;
  color: ${({ theme, quiet }) => (quiet ? theme.color.textSecondary : theme.color.text)};
  font-weight: ${({ theme, now }) => (now ? theme.fontWeight.semibold : theme.fontWeight.regular)};
  background: ${({ theme, now }) => (now ? theme.color.bgSecondary : "transparent")};
`;

const MarketStatLabel = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  margin-right: 0.15em;
  font-size: 0.68em;
`;

const HalvingTimeGrid = styled.div`
  display: flex;
  justify-content: flex-start;
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

/* A scale, drawn as one. It used to run green → amber → red, which says the
 * same thing the words at its ends used to say: low is good, high is bad. That
 * is the textbook reading of the *daily* RSI, this number is not the daily RSI
 * (its period follows the range on screen), and on 21,669 daily closes the
 * claim does not hold for the daily one either — see the working notes
 * §9. Removing the two words and leaving the traffic light would have moved
 * the claim rather than dropped it. Theme colours, too, per the codebase guide: the
 * three hex values were drawn on both a white and a black card. */
/* The one meter.
 *
 * It was the RSI card's own track, and Fear & Greed drew a rainbow arc with a
 * needle beside it — two drawings for the same shape of fact, a position on a
 * 0–100 scale. One track, used by both, is one visual language instead of two.
 */
/* A shape to wait in.
 *
 * Eleven cards said the bare word "Loading..." while their data was in flight,
 * which is not a state so much as an absence of one — and because the word is
 * one short line and the answer is usually two, the column visibly jumped as
 * each card filled. This is the card's own grammar with the ink taken out: a
 * figure-sized block and a subtext-sized one, pulsing, occupying exactly the
 * room the answer will need.
 *
 * `aria-hidden` on the blocks and the real word kept for screen readers — a
 * pulsing rectangle says nothing out loud.
 */
/* What a card says when it asked and nothing came back.
 *
 * `em`, not `rem` — everything inside a widget card scales off the one
 * font-size `WidgetCard` sets from the size picker, and a `rem` here would sit
 * at one size while the card around it grew.
 *
 * Secondary ink and no colour: a card that could not load is not an alarm, and
 * red in this panel already means a price fell. */
const WidgetEmptyNote = styled.div`
  font-size: 0.72em;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.textSecondary};
  padding: 0.4em 0;
`;

const widgetSkeletonPulse = keyframes`
  0%, 100% { opacity: 0.20; }
  50% { opacity: 0.42; }
`;

/* `row` stands in for a coin row rather than for a line of caption.
 *
 * A `WidgetCoinRow` is 0.72em type at 1.35 line-height inside 0.22em of
 * padding, with 0.15em of gap under it — about 1.44em all told, against the
 * 0.7em a caption line reserves. Four of those is roughly 35px, which is
 * exactly how far every widget below the watchlist dropped when the coin
 * sweep answered. A skeleton whose height is not the height of the thing it
 * replaces causes the jump it exists to prevent. */
const WidgetSkeletonLine = styled.div`
  height: ${({ tall, row }) => (tall ? "1.15em" : row ? "1.29em" : "0.7em")};
  width: ${({ tall, row }) => (tall ? "62%" : row ? "100%" : "44%")};
  margin: ${({ tall, row }) =>
    tall ? "0.15em 0 0.3em" : row ? "0 0 0.15em" : "0"};
  border-radius: 0.25em;
  background: ${({ theme }) => theme.color.text};
  animation: ${widgetSkeletonPulse} 1.4s ease-in-out infinite;
`;

const WidgetSkeletonReader = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;

const WidgetMeter = styled.div`
  width: 100%;
  height: 0.3em;
  min-height: 3px;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.color.border} 0%,
    ${({ theme }) => theme.color.textSecondary} 100%
  );
  border-radius: 0.15em;
  margin: 0.35em 0 0.2em;
  position: relative;
`;

const WidgetMeterMark = styled.div`
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

