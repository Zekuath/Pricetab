/* WIDGET PANEL STYLES */
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
const widgetJiggle = keyframes`
  0% { transform: rotate(-0.5deg); }
  50% { transform: rotate(0.5deg); }
  100% { transform: rotate(-0.5deg); }
`;

/* Edit mode on the grid: every card jiggles (offset so they do not move as
   one), and is a drag handle. Only while editing — an idle new tab runs no
   animation — and never under reduced motion. */
const widgetEditing = css`
  & > [data-widget] {
    cursor: grab;
    animation: ${widgetJiggle} 0.32s ease-in-out infinite;
  }
  & > [data-widget]:nth-child(2n) {
    animation-delay: -0.16s;
    animation-duration: 0.36s;
  }
  /* The card under the pointer or the focus holds still, so its "−" is a
     target that stays where it is pressed. */
  & > [data-widget]:hover,
  & > [data-widget]:focus-within {
    animation-play-state: paused;
  }
  @media (prefers-reduced-motion: reduce) {
    & > [data-widget] {
      animation: none;
    }
  }
`;

const WidgetPanel = styled.div`
  display: grid;
  /* **The column floor rides the card size** (27 Sep 2026). It was 12.5rem
     whatever the size, so XL cards — 1.45 times the type — were poured into
     the same two medium columns and wrapped every line; the size setting
     made the text bigger and the cards no wider. Now the drawer holds as
     many of the chosen size as fit, and widening it (the right edge) is how
     to get two XL cards side by side. */
  /* **iOS's grid** (1 Oct 2026): a column is a small card and a medium or
     large card spans two. Dense, so a small card fills the hole a wide one
     leaves. */
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(100%, ${({ scale }) => 9.5 * (scale || 1)}rem), 1fr)
  );

  /* One column (the drawer at its floor, a large type scale): every card
     takes the row, whatever its size — see watchWidgetPanel. */
  /* Doubled to outrank the card's own size rules, written later. */
  &&[data-cols="1"] > * {
    grid-column: auto;
    grid-row: auto;
  }
  grid-auto-flow: row dense;

  &[data-editing="true"] {
    ${widgetEditing};
  }
  align-content: start;
  gap: 0.7rem;
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
  /* iOS's families on the grid: small one column, medium two, large two by
     two — and a floor so a short card is still a tile, not a strip. Read
     from the attribute, so the gallery's previews and the cards share one
     rule. */
  grid-column: span 1;
  grid-row: span 1;
  min-height: 8.25em;
  /* Each card its own height: stretched to a taller neighbour's row, a
     small card was a tall tile with its figure at the top (640px drawer,
     1 Oct 2026). Large still fills the two rows it spans. */
  align-self: start;
  &[data-size="m"] {
    grid-column: span 2;
  }
  &[data-size="l"] {
    grid-column: span 2;
    grid-row: span 2;
    min-height: 17em;
    align-self: stretch;
  }
  /* The card a menu is open for stands forward, like iOS's lifted widget. */
  &[data-menu-open="true"] {
    transform: scale(1.02);
    z-index: 2;
  }
  display: flex;
  flex-direction: column;
  /* A card in the phone's scrolling row keeps a width its title and its ×
     both fit in; a narrower one drew the × over the title. */
  @media (max-width: 600px) {
    min-width: 11em;
  }
  /* **iOS's surface** (1 Oct 2026): a filled tile with a continuous-looking
     corner, no outline in the light theme and a hairline in the dark one
     (where a shadow says nothing), the shadow soft and wide. */
  background: ${({ theme }) => (theme.color.bg === "#ffffff" ? "#ffffff" : "#1c1c1e")};
  border: 1px solid ${({ theme }) => (theme.color.bg === "#ffffff" ? "transparent" : "rgba(255, 255, 255, 0.07)")};
  border-radius: 1.35em;
  padding: 0.85em 0.95em 0.9em;
  /* A ledger, not a badge. Every card was centred — title, figure, caption —
     which reads as a row of tiles on a dashboard poster. Left-aligned, with
     the title as a head bar and the figure under it, the column reads like a
     desk's readings: the eye runs down one edge and every card starts where
     the last one did. The meters and bars are full-width either way. */
  text-align: left;
  box-shadow: ${({ theme }) =>
    theme.color.bg === "#ffffff" ? "0 1px 2px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.07)" : "0 8px 24px rgba(0, 0, 0, 0.35)"};
  cursor: default;
  user-select: none;
  -webkit-touch-callout: none;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease,
    border-color 0.15s ease;
  animation: ${widgetAppear} 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  opacity: ${({ dragging }) => (dragging ? 0.4 : 1)};
  transform: ${({ dragging }) => (dragging ? "scale(0.97)" : "scale(1)")};


  /* Focus from the keyboard: the card is what opens its menu (Enter). */
  &:focus {
    outline: none;
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }

  /* A phone's sheet is one column of whatever fits: no spans there. */
  @media (max-width: 600px) {
    grid-column: auto;
    grid-row: auto;
  }


  /* Tablet */
  @media (max-width: 1024px) {
    padding: 0.7em 0.8em;
  }

  /* Phone */
  @media (max-width: 600px) {
    padding: 0.6em 0.7em;
  }
`;

/* Labels use the secondary text colour rather than an opacity knocked out of
 * the primary one. Opacity on already-small type is what made these hardest
 * to read — and it stacked with the card's own translucent background, so the
 * effective contrast was lower than the number suggested. */
/* The card's head bar: the title on its own line with a hairline under it,
 * and room at the right end for the × so the two never meet. */
/* iOS's widget head: the name in a small semibold line, no rule under it —
   the tile's own edge already says where the card is. The whole width is the
   name's: nothing sits on a card's edge since the controls moved to its menu
   (a small card read "FEAR & GR…" while room was kept for them). */
const WidgetLabel = styled.div`
  font-size: 0.66em;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  padding: 0;
  margin-bottom: 0.55em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/* The figure: one step heavier than the caption under it, and larger than
 * the title over it — the rule every readings card on the derivatives page
 * follows, brought to the column. */
const WidgetValue = styled.div`
  font-size: 1.4em;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
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


/* **What a size shows** (1 Oct 2026): the card's content, cut by size. A
 * small card keeps its figure and its first line; medium four lines; large
 * everything. A list is cut by rows instead — three, six, all — so a small
 * watchlist is still a list. Hidden, not unmounted: every card builds its
 * content the same way, and a size is how much of it shows. */
const WidgetBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2em;
  flex: 1;
  min-width: 0;

  &[data-size="s"] > :nth-child(n + 3) {
    display: none;
  }

  &[data-size="m"] > :nth-child(n + 5) {
    display: none;
  }

  &[data-size="s"] ${WidgetCoinList} > :nth-child(n + 4) {
    display: none;
  }

  /* Six rows, and the movers' divider between them counted as a seventh. */
  &[data-size="m"] ${WidgetCoinList} > :nth-child(n + 8) {
    display: none;
  }

  /* A list that is the card's first child is the card: it stays. */
  &[data-size="s"] > ${WidgetCoinList} {
    min-width: 0;
  }
`;

/* Large's extra: the sentence that says what the card is. */
const WidgetFootnote = styled.div`
  margin-top: auto;
  padding-top: 0.7em;
  font-size: 0.64em;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* ── iOS's way of arranging widgets (1 Oct 2026, *"kenardan özelleştirme
 * yapmayalım, eklerken Apple iOS gibi yapalım"*) ──────────────────────────
 * Researched against Apple's own pages: a widget is added from a gallery
 * where its sizes are swiped through as previews and "Add Widget" places
 * it; a widget's size is changed from the menu a long press opens (iOS 18:
 * shape icons above "Edit Widget" and "Remove Widget", the removal asked
 * twice); arranging is an edit mode — the widgets jiggle, a "−" removes,
 * a drag moves, "Done" ends it. Nothing sits on a card's edge at rest. */

/* iOS's "−": a grey disc on the card's top-left corner, in edit mode only. */
const WidgetRemoveBadge = styled.button.attrs({ type: "button" })`
  position: absolute;
  top: -0.45em;
  left: -0.45em;
  z-index: 3;
  width: 1.5em;
  height: 1.5em;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: ${({ theme }) => (theme.color.bg === "#ffffff" ? "#d1d1d6" : "#636366")};
  color: ${({ theme }) => (theme.color.bg === "#ffffff" ? "#1c1c1e" : "#ffffff")};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.9em;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);

  &:focus {
    outline: none;
  }
  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }
`;

/* The menu a long press, a right click or Enter opens: sizes as shapes,
   then the two actions. A fixed layer over the drawer, placed by the app
   under (or over) the card it belongs to. */
const WidgetMenu = styled.div`
  position: fixed;
  z-index: 200;
  width: 15.5rem;
  padding: 0.35rem;
  border-radius: 0.9rem;
  background: ${({ theme }) => (theme.color.bg === "#ffffff" ? "rgba(255, 255, 255, 0.96)" : "rgba(44, 44, 46, 0.96)")};
  backdrop-filter: blur(20px);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 0 0 1px ${({ theme }) => theme.color.border};
  font-family: ${({ theme }) => theme.font.primary};
  animation: ${widgetAppear} 0.18s cubic-bezier(0.22, 1, 0.36, 1);
`;

const WidgetMenuSizes = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.3rem;
  padding: 0.2rem 0.2rem 0.45rem;
  margin-bottom: 0.25rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
`;

const WidgetMenuSize = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 2.6rem;
  border: none;
  border-radius: 0.6rem;
  background: ${({ active, theme }) => (active ? theme.color.bgSecondary : "transparent")};
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.bgSecondary};
    outline: none;
  }
`;

/* The size as its shape, the way iOS 18's menu draws it. */
const WidgetMenuShape = styled.span`
  display: block;
  width: ${({ size }) => (size === "s" ? "0.9rem" : "1.9rem")};
  height: ${({ size }) => (size === "l" ? "1.9rem" : "0.9rem")};
  border-radius: 0.28rem;
  border: 1.6px solid ${({ active, theme }) => (active ? theme.color.text : theme.color.textSecondary)};
  background: ${({ active, theme }) => (active ? theme.color.text : "transparent")};
`;

const WidgetMenuItem = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.6rem 0.7rem;
  border: none;
  border-radius: 0.55rem;
  background: transparent;
  font-family: inherit;
  font-size: 0.8rem;
  text-align: left;
  color: ${({ destructive, theme }) => (destructive ? (theme.color.bg === "#ffffff" ? "#d70015" : "#ff6961") : theme.color.text)};
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.bgSecondary};
    outline: none;
  }
`;

/* ── the gallery ── */
const WidgetGallery = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const WidgetGallerySearch = styled.input`
  width: 100%;
  box-sizing: border-box;
  height: 2.3rem;
  padding: 0 0.85rem;
  border: none;
  border-radius: 0.7rem;
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.8rem;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }
`;

const WidgetGalleryGroup = styled.div`
  display: flex;
  flex-direction: column;
  border-radius: 0.9rem;
  overflow: hidden;
  background: ${({ theme }) => (theme.color.bg === "#ffffff" ? "#f2f2f7" : "#1c1c1e")};
`;

const WidgetGalleryHead = styled.div`
  margin: 0.4rem 0 0.1rem 0.85rem;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const WidgetGalleryRow = styled.button.attrs({ type: "button" })`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.7rem 0.85rem;
  border: none;
  background: transparent;
  text-align: left;
  font-family: ${({ theme }) => theme.font.primary};
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.border};
  }

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.bgSecondary};
    outline: none;
  }
`;

const WidgetGalleryName = styled.span`
  display: block;
  font-size: 0.82rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
`;

const WidgetGalleryDesc = styled.span`
  display: block;
  margin-top: 0.2rem;
  font-size: 0.68rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const WidgetGalleryTag = styled.span`
  font-size: 0.66rem;
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
`;

/* A widget's page: its name and sentence, its sizes swiped through as live
   previews, the dots, and Add Widget. */
const WidgetDetail = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  text-align: center;
`;

const WidgetDetailTitle = styled.h3`
  margin: 0.4rem 0 0;
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  color: ${({ theme }) => theme.color.text};
`;

const WidgetDetailDesc = styled.p`
  margin: 0;
  max-width: 24rem;
  font-size: 0.72rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const WidgetCarousel = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 100%;
  width: 100%;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
  border-radius: 1rem;
  &:focus {
    outline: none;
  }
  &:focus-visible {
    box-shadow: inset 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }
  @media (prefers-reduced-motion: reduce) {
    scroll-behavior: auto;
  }
`;

/* One size's page: a two-column grid like the drawer's, so the preview is
   exactly as wide as the card would be. */
const WidgetSlide = styled.div`
  scroll-snap-align: center;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-content: center;
  justify-items: stretch;
  gap: 0.7rem;
  padding: 0.9rem 0.6rem;
  min-height: 19rem;
  pointer-events: none;

  & > [data-widget][data-size="s"] {
    grid-column: 1 / span 1;
    transform: translateX(calc(50% + 0.35rem));
  }
`;

const WidgetSlideName = styled.div`
  margin-top: 0.1rem;
  font-size: 0.72rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
`;

const WidgetDots = styled.div`
  display: flex;
  gap: 0.15rem;
`;

const WidgetDot = styled.button.attrs({ type: "button" })`
  width: 1.4rem;
  height: 1.4rem;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  position: relative;

  &::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0.45rem;
    height: 0.45rem;
    margin: -0.225rem 0 0 -0.225rem;
    border-radius: 50%;
    background: ${({ active, theme }) => (active ? theme.color.text : theme.color.border)};
  }

  &:focus {
    outline: none;
  }
  &:focus-visible::after {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }
`;

/* iOS's filled pill. */
const WidgetAddButton = styled.button.attrs({ type: "button" })`
  min-width: 11rem;
  height: 2.6rem;
  padding: 0 1.4rem;
  border: none;
  border-radius: 1.3rem;
  background: ${({ theme }) => theme.color.text};
  color: ${({ theme }) => theme.color.bg};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.82rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  cursor: pointer;

  &:focus {
    outline: none;
  }
  &:focus-visible {
    box-shadow: 0 0 0 3px ${({ theme }) => theme.color.borderHover};
  }
`;

/* ── the pinned stack (mockup C, 1 Oct 2026) ─────────────────────────────
 * The chart's lower-left corner, above the time axis. The stack takes no
 * pointer events; its cards do, so the chart under the gaps still answers. */
const PinnedStack = styled.div`
  position: fixed;
  left: 3.25rem;
  bottom: ${({ lift }) => (lift ? "7.5rem" : "4.75rem")};
  z-index: 90;
  display: flex;
  flex-direction: column-reverse;
  gap: 0.5rem;
  pointer-events: none;

  @media (max-width: 600px) {
    display: none;
  }
`;

/* At rest: the edge and faint figures, nothing filled — the chart reads
   through. Under the pointer or the focus: the tile, full ink, a line more. */
const PinnedCard = styled.div`
  pointer-events: auto;
  width: 11.5em;
  /* The size the card's menu sets: medium and large are wider, and show as
     much as they do in the drawer when pointed at. */
  &[data-size="m"],
  &[data-size="l"] {
    width: 17em;
  }
  font-size: ${({ scale }) => scale || 1}rem;
  padding: 0.6em 0.8em 0.65em;
  border-radius: 1.1em;
  border: 1px solid ${({ theme }) => theme.color.borderHover};
  background: transparent;
  /* No fill, but what runs behind is softened: a monospace figure has gaps
     between its glyphs that no halo covers, and the line read through them. */
  backdrop-filter: blur(4px);
  color: ${({ theme }) => theme.color.textSecondary};
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  /* Transparent, and still readable where the line runs through a figure:
     a halo in the ground's colour, the way a map keeps its labels over roads
     (1 Oct 2026 — the first cut had $84,907 crossed out by the price). */
  text-shadow: ${({ theme }) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]]
      .map(([x, y]) => `${x}px ${y}px 0 ${theme.color.bg}`)
      .join(", ")};

  ${WidgetLabel} {
    margin-bottom: 0.3em;
    padding-right: 0;
  }

  ${WidgetValue} {
    color: ${({ theme }) => theme.color.textSecondary};
    font-size: 1.15em;
    transition: color 0.2s ease;
  }

  &:not(:hover):not(:focus-within):not([data-menu-open="true"]) [data-widget-body] > :nth-child(n + 2) {
    display: none;
  }

  &:not(:hover):not(:focus-within):not([data-menu-open="true"]) ${WidgetCoinList} > :nth-child(n + 4) {
    display: none;
  }

  &:hover,
  &:focus-within,
  &[data-menu-open="true"] {
    background: ${({ theme }) => (theme.color.bg === "#ffffff" ? "#ffffff" : "#1c1c1e")};
    color: ${({ theme }) => theme.color.text};
    border-color: transparent;
    text-shadow: none;
    box-shadow: ${({ theme }) => (theme.color.bg === "#ffffff" ? "0 8px 24px rgba(0, 0, 0, 0.1)" : "0 8px 24px rgba(0, 0, 0, 0.45)")};
  }

  &:hover ${WidgetValue}, &:focus-within ${WidgetValue}, &[data-menu-open="true"] ${WidgetValue} {
    color: ${({ theme }) => theme.color.text};
  }

  &:focus {
    outline: none;
  }
  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

