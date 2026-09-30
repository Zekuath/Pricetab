/* PRICE TARGET STYLES
 * Split out of alerts.js, which passed the 800-line guideline once each
 * target grew from one sentence into a card. Same arrangement the rest of
 * the app already uses (styles-app / styles-widgets / styles-settings):
 * the panel keeps the logic, this keeps the look.
 *
 * Loaded before alerts.js — see the script order in index.html.
 */

/* In from the edge it is docked to, because it is a drawer now (23 Sep
 * 2026) — and that edge is the left one since the 24th, so the slide came
 * with it. It arrives mounted rather than sliding on a prop the way the
 * chart's own drawer does, so the entrance is a keyframe and not a
 * transition. */
const alertIn = keyframes`
  from { opacity: 0; transform: translateX(-18px); }
  to   { opacity: 1; transform: translateX(0); }
`;

/* A timed notice leaving (see TimedToast): up and out, the way it came in
   sideways — and the bar that says how long it has left. Transform and
   opacity only; this is a new-tab page. */
const toastOut = keyframes`
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-10px); }
`;

const toastOutStill = keyframes`
  from { opacity: 1; }
  to   { opacity: 0; }
`;

const toastClock = keyframes`
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
`;

// Fired-alert banners, stacked under the top edge
/* **One type ladder, shared with the derivatives page.** This file used
 * fifteen font sizes between 0.55rem and 0.9rem — twelve of them within a
 * quarter of a rem of each other — which is why the panel read flat next to
 * the practice page's five. Every size below is one of posType's rungs
 * (styles-practice.js loads first): lead for the empty state's title,
 * figure for rows and fields, body for prose and buttons, micro for labels,
 * counts and hints. The toast keeps its own, larger, because it is read
 * from across the room. */
const AlertToastStack = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.spacing.medium}rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  /* **On a phone the lane is at the foot.** At 430px the top of the page is
     the price and the corner controls, and a toast there sat on both; the
     bottom is where iOS puts its own, above the home indicator. */
  @media (max-width: 520px) and (orientation: portrait) {
    /* Under the header and above the drawing: the top of the chart is the
       one band of a phone screen with nothing in it, and the foot is where
       the widget dock and the app's own bar live. */
    top: 23.5rem;
    width: calc(100vw - 2rem);
  }
  align-items: center;
`;

/* The toast is the whole payoff of the feature — it is the moment the thing
 * you asked to be told about actually happened — so it carries the direction
 * in colour and in a glyph, not only in a border tint that a red/green-blind
 * reader can't separate. */
const AlertToast = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.medium}rem;
  max-width: min(32rem, calc(100vw - 2rem));
  padding: 0.7rem 0.9rem 0.7rem 0.75rem;
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid
    ${({ theme, up }) =>
      up ? theme.color.chartLineGreen : theme.color.chartLineRed};
  border-left-width: 4px;
  border-radius: 10px;
  box-shadow: 0 ${({ theme }) => theme.scale * 2}rem
    ${({ theme }) => theme.scale * 4}rem ${({ theme }) => theme.color.shadow};
  font-size: 0.82rem;
  color: ${({ theme }) => theme.color.text};
  animation: ${alertIn} 0.25s ease-out;
  /* For the time bar a timed notice carries along its foot. */
  position: relative;
  overflow: hidden;

  ${({ leaving }) =>
    leaving
      ? css`
          animation: ${toastOut} ${TOAST_LEAVE_MS}ms ease-in forwards;
          pointer-events: none;

          @media (prefers-reduced-motion: reduce) {
            animation: ${toastOutStill} ${TOAST_LEAVE_MS}ms linear forwards;
          }
        `
      : ""}
`;

/* How long a timed notice has left, as a hairline along its foot that
   empties. It stops while the notice is held — under the pointer, holding
   the focus, or on a tab nobody is looking at — because the time it
   measures is time on screen. */
const AlertToastTimer = styled.span`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  transform-origin: left center;
  background: ${({ theme, up }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
  opacity: 0.55;
  animation: ${toastClock} ${({ ms }) => ms}ms linear forwards;
  animation-play-state: ${({ held }) => (held ? "paused" : "running")};

  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`;

// Direction as a shape as well as a colour
/* The arrow. In a row it is a bare glyph on the coin's own baseline; the
 * ring it used to sit in was chrome around a one-character fact, and it was
 * the widest thing at the row's left edge. The toast keeps the ring — read
 * from across the room, the arrow needs the weight. */
const AlertDirBadge = styled.span`
  flex: 0 0 auto;
  width: ${({ small }) => (small ? "1rem" : "1.6rem")};
  height: ${({ small }) => (small ? "auto" : "1.6rem")};
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: ${({ small }) => (small ? posType.figure : posType.figure)};
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  line-height: ${({ small }) => (small ? "1.35" : "1")};
  color: ${({ theme, up }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
  border: ${({ small }) => (small ? "none" : "1px solid")}
    ${({ theme, up }) =>
      up ? theme.color.chartLineGreen : theme.color.chartLineRed};
`;

const AlertToastBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const AlertToastWhen = styled.div`
  margin-top: 0.15rem;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertToastClose = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  background: transparent;
  border: none;
  padding: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 1rem;
  line-height: 1;
  color: ${({ theme }) => theme.color.textSecondary};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

/* **THE TARGETS AND CALLS DRAWER.**
 *
 * It was a card in the middle of a covered screen. On 23 Sep 2026 it became
 * a drawer beside the chart, on the surface the chart's own switches use:
 * *"targets calls ve the chart'in opak olmamasi seffaf olmasi ama chart'in
 * ayarlari gibi gelmesi"*.
 *
 * The argument is the same one that put the chart's switches there. A price
 * target is a level on the axis you are looking at and a call is a box drawn
 * on that board — you set both *against* the chart, and the panel that
 * covered it made you set them from memory. With the drawer docked to the
 * right the line stays on screen, live, with its crosshair: nothing here
 * takes the pointer away from it, because there is no scrim. What closes it
 * is Escape, its own ×, its tab, or a press outside it that alerts.js hears
 * on the document — the same four the chart's drawer answers to.
 *
 * Everything the surface does, and the reason it is see-through at all, is
 * in chartDrawerSurface (theme.js).
 */
const AlertsOverlay = styled.div`
  ${chartDrawerSurface};
  /* **34rem, and it is the widest of the three drawers.** It carries a list
     of rows with a figure column, and a form under them — the chart's nine
     switches do not. Asked for with the transparency: *"bunlarin ekranlarini
     daha da buyutebiliriz"*. */
  width: min(34rem, 92vw);
  ${chartDrawerPhone};

  /* **A sheet with a form in it needs more than 70vh.** The chart's switches
     can live in a short sheet because the chart above is half the point of
     flipping one. This holds a list, a form and the alarm row: at 70vh of a
     780px phone the list band came out 150px and the empty state was cut off
     below its own icon. Six rem leaves the range switcher and the price
     readout above it. */
  @media (max-width: 600px) {
    max-height: calc(100vh - 6rem);
  }
`;

/* Three bands: heading, scrolling list, form. Only the middle one scrolls, so
 * the tally stays readable and — the part that actually mattered — the form
 * stays reachable. With ten targets it used to sit below a long scroll, so
 * adding an eleventh meant scrolling past the ten you already had.
 *
 * **It is no longer a surface of its own.** The drawer around it carries the
 * fill, the border, the radius and the shadow; a second bordered box inside
 * one is a box drawn around nothing, and painting it would put an opaque
 * panel back over the chart the drawer exists to show. */
const AlertsCard = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  animation: ${alertIn} 0.24s cubic-bezier(0.22, 1, 0.36, 1);

  /* **A phone on its side has no room for three bands.** At 430px of height
     the head and the form alone take the drawer, and the list — the one band
     that scrolls — was left a 30px slot with the targets in it (measured on
     an iPhone Pro Max in landscape: one row, unreachable). Below that height
     it scrolls as one surface, top to bottom, and the form is simply further
     down rather than always on screen. */
  @media (max-height: 520px) {
    overflow-y: auto;
    ${themedScrollbar};
  }
`;

/* How far the list fades at each end, and — the part that was missing — how
 * far the content is held off that fade. The two are one number because they
 * describe one edge: written as a bare `14px` in the mask alone, the body had
 * no vertical padding at all, so the fade was drawn over the first and last
 * *line* rather than over air. On futures that is the whole complaint —
 * "Equity" at the top and the note under the balance box at the foot were
 * both washed halfway out, on a screen that was not even scrolling, which
 * reads as a panel whose padding has gone negative. */
const ALERTS_FADE = 14;

const AlertsBody = styled.div`
  flex: ${({ collapsed }) => (collapsed ? "0 0 0" : "1 1 auto")};
  min-height: 0;
  overflow-y: auto;
  /* One extra pixel at the foot absorbs Chromium's fractional scroll rounding:
     with the taller leverage preview the last line otherwise stopped 13.3px
     into a 14px fade after scrolling all the way down. */
  padding: ${({ collapsed }) =>
    collapsed
      ? "0 1.5rem"
      : `${ALERTS_FADE}px 1.5rem calc(${ALERTS_FADE}px + 1px)`};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding: ${({ collapsed }) =>
      collapsed
        ? "0 1.1rem"
        : `${ALERTS_FADE}px 1.1rem calc(${ALERTS_FADE}px + 1px)`};
  }

  /* The card is the scroller on a short screen (see AlertsCard). */
  @media (max-height: 520px) {
    flex: none;
    overflow: visible;
  }

  /* The same scrollbar the settings panel uses.
   *
   * This body was the one scrolling surface in the app that never got it, so
   * it grew the platform's own bar: a grey strip in the OS style, sitting
   * inside the rounded card and offset from the content by the 1.5rem
   * padding, belonging to nothing around it. A stable gutter reserves the
   * lane whether or not it is needed, so nothing shifts sideways the moment
   * the list gets long enough to scroll. */
  scrollbar-gutter: stable;
  ${themedScrollbar};

  /* The list ends by fading rather than by being sliced. A row cut in half by
   * the divider above the foot reads as content jammed against a wall, which
   * is a large part of why a full panel felt tight even once everything fit.
   * Fourteen pixels is enough to say "there is more" without dimming a row
   * anyone is trying to read. */
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 ${ALERTS_FADE}px,
    #000 calc(100% - ${ALERTS_FADE}px),
    transparent 100%
  );

  /* The one thing this list wants that the shared rule does not give it: the
     track stops short of the card's rounded corners. */
  &::-webkit-scrollbar-track {
    margin: 0.4rem 0;
  }
`;

/* The calls tab's pinned foot, and its three strips.
 *
 * Two designs failed before this one. Putting every switch into the scrolling
 * body rendered a settings page inside a list panel: the content ran past the
 * card and the last row was cut in half by the edge. Hiding them behind a
 * disclosure labelled SETTINGS was worse — invisible to anyone who did not
 * already know the switches were there, and borrowing the name of the app's
 * own panel, so the row read as a way *out* of this tab rather than the rest
 * of it.
 *
 * So: always visible, never named after somewhere else, and split into strips
 * by what each one does — aim the call, choose what is drawn, manage the
 * record. A strip is a label and its controls on one line, which is the only
 * shape that fits under a list. */
const AlertCallsFoot = styled.div`
  flex: 0 0 auto;
  padding: 0.35rem 1.5rem 0.75rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding: 0.3rem 1.1rem 0.65rem;
  }
`;

/* Laid out like a terminal's status lines: a fixed label column on the left
 * and everything else in a settled column beside it, so the eye runs straight
 * down the labels instead of hunting for where each row starts. */
const AlertCallsStrip = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.6rem;
  padding: 0.55rem 0;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.border};
  }
`;

/* The strip's name. Quiet, and the same width on every row — that shared width
 * is the whole reason the foot reads as a table rather than three unrelated
 * lines of controls. */
const AlertStripLabel = styled.span`
  flex: 0 0 auto;
  width: 4.1rem;
  font-size: ${posType.micro};
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Pushes whatever follows to the far end of the strip.
const AlertStripGap = styled.span`
  flex: 1 1 auto;
`;

/* What the reach actually buys, on the same line rather than wrapped
 * underneath — the wrap was most of what made the foot feel cramped. */
const AlertStripFigures = styled.span`
  flex: 0 0 auto;
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`;

/* A switch that says what it is, the way a config listing does: a filled dot
 * for on, a hollow one for off. State is never carried by colour alone, so it
 * survives both themes and a reader who cannot separate them. */
const AlertStateChip = styled.button.attrs({ type: "button" })`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  background: transparent;
  color: ${({ theme, on }) =>
    on ? theme.color.text : theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;

  &::before {
    content: "";
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 50%;
    border: 1px solid
      ${({ theme, on }) =>
        on ? theme.color.chartLineGreen : theme.color.border};
    background: ${({ theme, on }) =>
      on ? theme.color.chartLineGreen : "transparent"};
  }

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
    color: ${({ theme }) => theme.color.text};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.chartLineGreen};
  }
  ${touchTarget};

  /* Inside a row that scrolls sideways on the phone the touch box is clipped
     to the row, so the chip itself grows to a finger's height there. */
  @media (pointer: coarse) {
    min-height: 28px;
  }
`;

/* The plain actions. Square-cornered like everything else down here, and
 * quieter than the switches — they are the things you reach for least.
 *
 * `strong` is for the one action in a strip that is not a piece of tidying up.
 * Switching calls off is the mode itself, and it was the same 24px sliver as
 * "clear settled" beside it — the smallest target in the panel for the biggest
 * thing in it. It gets a real hit area, the foreground colour, and a fill on
 * hover.
 *
 * **A permanent fill was too far, and that is what shipped.** The intent above
 * says "a fill on hover"; the code did it always, so the panel's loudest
 * object — a black slab in the light theme, a white one in the dark — was the
 * way *out* of the feature, sitting under a list of calls you are in the
 * middle of making. The primary thing here is placing a call, and that happens
 * on the chart; nothing in this foot should outrank it. It is back to the
 * described design: foreground colour, a real target, and the fill only under
 * the pointer.
 *
 * `danger` is the other half of that correction. Red was rejected for the exit
 * — red already means MISSED three rows above, and turning calls off loses
 * nothing — but `reset score` genuinely cannot be undone, and it was the
 * quietest thing in the foot. It stays quiet at rest and answers in red when
 * you reach for it, which is where the warning is actually useful. */
const AlertActionKey = styled.button.attrs({ type: "button" })`
  padding: ${({ strong }) => (strong ? "0.34rem 0.9rem" : "0.28rem 0.55rem")};
  min-height: ${({ strong }) => (strong ? "1.8rem" : "auto")};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  background: transparent;
  color: ${({ theme, strong }) =>
    strong ? theme.color.text : theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${({ strong }) => (strong ? posType.body : posType.micro)};
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background 0.15s ease,
    opacity 0.15s ease;

  /* At the end of a ladder there is nothing to press. Dimmed *and* disabled:
     one without the other is either a button that lies about being usable or
     one that looks usable and does nothing. */
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }

  &:hover:not(:disabled) {
    border-color: ${({ theme, danger }) =>
      danger ? theme.color.chartLineRed : theme.color.borderHover};
    color: ${({ theme, danger }) =>
      danger ? theme.color.chartLineRed : theme.color.text};
    background: ${({ theme, strong }) =>
      strong ? theme.color.bgSecondary : "transparent"};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme, danger }) =>
      danger ? theme.color.chartLineRed : theme.color.chartLineGreen};
  }
`;

/* One stepper, not two buttons and a word that comes and goes.
 *
 * The board's reach had `−` and `+` at the far end of the strip and a `reset`
 * that appeared beside them only when there was something to reset, which
 * moved the other two every time you crossed the default. The chart's own zoom
 * pill had already solved this: `−`, what the board covers, `+`, with the
 * middle one doubling as the way home. Same shape here, so the two controls
 * are one thing to learn rather than two that happen to do the same job. */
const AlertStepper = styled.span`
  display: inline-flex;
  align-items: stretch;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  overflow: hidden;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  /* The buttons' touch boxes reach past the pill; clipping them here made
     the zoom controls 20px tall on a phone. */
  @media (pointer: coarse) {
    overflow: visible;
  }
`;

const AlertStepperBtn = styled.button.attrs({ type: "button" })`
  min-width: 1.6rem;
  padding: 0.28rem 0.3rem;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;

  &:disabled {
    opacity: 0.3;
    cursor: default;
  }
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.bgSecondary};
    color: ${({ theme }) => theme.color.text};
  }
  &:focus-visible {
    outline: none;
    background: ${({ theme }) => theme.color.bgSecondary};
    color: ${({ theme }) => theme.color.chartLineGreen};
  }
  ${touchTarget};
`;

/* The middle of the stepper: where the board is on the ladder, and the way
 * back to where it started.
 *
 * A control only while it leads somewhere — the rule the chart's pill already
 * follows. At the default this is a `span` with no role, no tab stop, no name
 * and no underline, because a button that cannot change anything is a promise
 * the next click breaks. Rendered at every zoom either way, so the two arrows
 * never move under the pointer. */
const AlertStepperValue = styled.span`
  display: inline-flex;
  align-items: center;
  /* Written for both forms of itself: as a button (see AlertStepperReset) the
     browser would otherwise supply its own margin and a border on all four
     sides, and the two halves of one control would not line up. */
  margin: 0;
  padding: 0 0.45rem;
  border-top: 0;
  border-bottom: 0;
  border-left: 1px solid ${({ theme }) => theme.color.border};
  border-right: 1px solid ${({ theme }) => theme.color.border};
  background: transparent;
  color: ${({ theme, active }) =>
    active ? theme.color.text : theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  text-decoration: ${({ active }) => (active ? "underline" : "none")};
  text-underline-offset: 2px;
  cursor: ${({ active }) => (active ? "pointer" : "default")};
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: ${({ theme, active }) =>
      active ? theme.color.bgSecondary : "transparent"};
  }
  &:focus-visible {
    outline: none;
    background: ${({ theme }) => theme.color.bgSecondary};
    color: ${({ theme }) => theme.color.chartLineGreen};
  }
`;

/* The same thing, as a real button, for when it leads somewhere.
 *
 * Not a `<span role="button">` with a key handler, which is what this was for
 * about ten minutes. Two reasons, and the second is the one that bites: the
 * browser gives a real button Enter and Space for nothing, and — because the
 * new tab page listens for Space on the document to start and stop the coin
 * rotation, and stands down only for `BUTTON`, `SELECT` and `A` — a span
 * pretending to be a button would have reset the zoom *and* started the
 * rotation on the same keystroke. `preventDefault` does not help; the event
 * still reaches the document. Anything in this app that behaves like a button
 * for the keyboard has to actually be one. */
const AlertStepperReset = AlertStepperValue.withComponent("button");

// Title on the left, the tally on the right — the count used to be glued to
// the title, which read as part of the name rather than as status
const AlertsHead = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1.3rem 1.5rem 0.9rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding: 1.1rem 1.1rem 0.8rem;
  }
`;

/* What the panel is, in its head.
 *
 * There were tabs here — Targets and Calls, one panel, one key. They are two
 * kinds of statement about a future price, so sharing looked right, and it
 * cost more than it saved: calls are placed on the chart and settle by
 * themselves, so the one thing that brings you back to them is a result, and
 * the way to that result was a panel named after something else plus a tab.
 * Each has its own corner control and its own key now, and the head simply
 * says which one you are in.
 *
 * Kept as a heading rather than reverting to the old plain title so the row's
 * metrics do not move: the tally and the info ring beside it were laid out
 * against the tab strip's height.
 */
const AlertsHeadTitle = styled.h2`
  margin: 0;
  padding: 0.35rem 0.1rem 0.45rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.text};
  /* Its key sits beside it — see KeyCap. */
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
`;

/* A labelled control line in the panel's bottom block: label left, control
 * right, with the label allowed to wrap under its own explanation without
 * pushing the control around. */
/* The one real action on an empty screen. A chip is right for a setting in a
 * row of settings; the thing that starts the feature should look like the
 * button it is. */
const AlertPrimaryButton = styled.button.attrs({ type: "button" })`
  display: block;
  width: ${({ block }) => (block ? "100%" : "auto")};
  margin-top: 0.9rem;
  padding: 0.6rem 1.4rem;
  border: 1px solid
    ${({ theme, ghost }) => (ghost ? theme.color.border : theme.color.text)};
  border-radius: 8px;
  background: ${({ theme, ghost }) =>
    ghost ? "transparent" : theme.color.text};
  color: ${({ theme, ghost }) => (ghost ? theme.color.text : theme.color.bg)};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ theme, ghost }) =>
      ghost ? theme.color.borderHover : theme.color.text};
  }
  &:active {
    transform: translateY(0);
    opacity: 0.85;
  }

  &:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px ${({ theme }) => theme.color.bg},
      0 0 0 4px ${({ theme }) => theme.color.chartLineGreen};
  }
`;

/* The right-hand end of the head: the tally, and the button that explains it.
 * Aligned on the text baseline rather than centred, so the tally still reads as
 * part of the same line as the tab labels. */
const AlertsHeadRight = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.55rem;
`;

const AlertsTally = styled.div`
  flex: 0 0 auto;
  font-size: ${posType.micro};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* "What is this, and where do I stand?"
 *
 * A tab that is both a record and a set of controls has to be able to say what
 * it is — the tally says "0 open" and nothing about what an open call is, and
 * the shortcut that gets you here is written down in one place nobody is
 * looking at while they are already here. Quiet until asked: it is a ring in
 * the corner, and it goes bright while it is the thing that is open. */
const AlertsInfoBtn = styled.button.attrs({ type: "button" })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.15rem;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: ${({ theme, active }) =>
    active ? theme.color.text : theme.color.textSecondary};
  opacity: ${({ active }) => (active ? 1 : 0.75)};
  transition:
    color 0.15s ease,
    opacity 0.15s ease;

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
    opacity: 1;
  }
  ${touchTarget};
`;

/* The explanation itself, between the head and the list rather than floating
 * over it: a popover would cover the rows it is describing, and the one thing
 * someone reading this wants to do next is look at them. It pushes the list
 * down instead, and the list gives up the height (the body is the only band
 * that scrolls). */
const AlertsInfo = styled.div`
  flex: 0 0 auto;
  padding: 0.85rem 1.5rem 0.95rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  font-size: ${posType.body};
  line-height: 1.55;
  color: ${({ theme }) => theme.color.textSecondary};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding: 0.8rem 1.1rem 0.9rem;
  }
`;

// What it is. Full ink: this is the sentence the panel exists to have somewhere
const AlertsInfoText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.text};
`;

/* Where it stands right now — the half of the answer a static help text can
 * never give. One line per fact, quiet, under the description. */
const AlertsInfoState = styled.div`
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
`;

const AlertsInfoLine = styled.div`
  display: flex;
  gap: 0.4rem;

  &::before {
    content: "·";
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

const AlertsInfoKeys = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem 0.6rem;
  margin-top: 0.65rem;
  padding-top: 0.6rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

const AlertsInfoKey = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
`;

/* The same key chip the "?" reference uses — deliberately the same shape, so a
 * key looks like a key everywhere in the app. Defined here rather than borrowed
 * from `shortcuts.js` because each panel owns its own styles; if a third
 * surface needs it, that is the moment to lift it into one place. */
const AlertsKey = styled.kbd`
  min-width: 1.35rem;
  padding: 0.1rem 0.3rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-bottom-width: 2px;
  border-radius: 4px;
  background: ${({ theme }) => theme.color.bg};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  text-align: center;
  color: ${({ theme }) => theme.color.text};
`;

// Section heading between the armed targets and the ones already hit
const AlertsSectionLabel = styled.div`
  margin: 0.9rem 0 0.5rem;
  font-size: ${posType.micro};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Same label, but heading a block that already has a rule above it
const AlertsSectionLabelTight = styled.div`
  margin-bottom: 0.55rem;
  font-size: ${posType.micro};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;

  &:first-child {
    margin-top: 0.9rem;
  }

  &:last-child {
    margin-bottom: 0.9rem;
  }
`;

/* Removing a target throws away when it was set and where the price was then,
 * which no amount of retyping brings back. One click shouldn't be able to do
 * that silently, and a confirm dialog for something this small would be worse
 * than the mistake — so the row is simply recoverable until you leave. */
const AlertUndoBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin: 0.9rem 0;
  padding: 0.5rem 0.75rem;
  background: ${({ theme }) => theme.color.bg};
  border: 1px dashed ${({ theme }) => theme.color.border};
  border-radius: 10px;
  font-size: ${posType.body};
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertUndoButton = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  padding: 0.2rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

/* A target is its own card now rather than a line between hairlines. Each one
 * carries three stacked facts (what, where it stands, how far it has come),
 * and hairline rows made those read as one run-on column. */
const AlertRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  /* Calls stack up in a way targets do not — you place several in a session
   * and they all sit there until they settle, so ten of them is normal rather
   * than exceptional. At the target tab's spacing that reads as a wall of
   * identical blocks, so call rows run tighter. */
  padding: ${({ dense }) => (dense ? "0.5rem 0.7rem" : "0.7rem 0.75rem")};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-left: 3px solid
    ${({ theme, muted, up }) =>
      muted
        ? theme.color.border
        : up
          ? theme.color.chartLineGreen
          : theme.color.chartLineRed};
  border-radius: 10px;
  font-size: ${posType.figure};
  opacity: ${({ muted }) => (muted ? 0.75 : 1)};
  transition:
    border-color 0.15s ease,
    opacity 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

// The description and the live detail under it share a column, so the
// remove button stays put however much the second line has to say
const AlertMain = styled.div`
  flex: 1;
  min-width: 0;
`;

const AlertText = styled.div`
  line-height: 1.35;
  color: ${({ theme, muted }) =>
    muted ? theme.color.textSecondary : theme.color.text};
`;

// The coin leads the line, so it should be findable without reading
const AlertCoin = styled.span`
  font-weight: ${({ theme }) => theme.fontWeight.bold};
`;

/* Where the price is now, relative to the target. This is the line the panel
 * was missing: a list of targets with no prices beside them can't answer the
 * only question you open it to ask. */
const AlertDetail = styled.div`
  margin-top: 0.2rem;
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* How far the price has come from where it was when the target was set,
 * rather than only how far is left. Same thin-meter language as the
 * portfolio's allocation share. */
const AlertProgressTrack = styled.div`
  margin-top: 0.35rem;
  height: 2px;
  border-radius: 1px;
  background: ${({ theme }) => theme.color.border};
  overflow: hidden;
`;

const AlertProgressFill = styled.div`
  height: 100%;
  border-radius: 1px;
  /* neutral is time: an open call's track from when it was made to when it
     settles. Green on that track would say the call is going well, which is
     a claim the clock cannot make. (No backticks here: template literal.) */
  background: ${({ theme, up, neutral }) =>
    neutral
      ? theme.color.textSecondary
      : up
        ? theme.color.chartLineGreen
        : theme.color.chartLineRed};
  transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1);
`;

const AlertMeta = styled.span`
  flex: 0 0 auto;
  align-self: center;
  font-size: ${posType.micro};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* THE FIGURE COLUMN
 *
 * A row used to be a sentence with a number somewhere inside it: "Now
 * $43,250.50 · 4.0% away". The one thing a person opens this panel to read —
 * how close is it — was the fourth token of the second line, in the same
 * grey as the words around it. A ledger puts that number in its own column,
 * right-aligned, one weight heavier than the label under it, so the eye can
 * run down the list and read every row's distance without reading a word.
 * The sentence stays; the column is what it says, said as a figure.
 *
 * Right-aligned and tabular so the digits stack. The label is the unit or
 * the verb — "away", "needs", "to go", "hit" — because a figure with no
 * label is a number and a figure with one is a fact. */
const AlertFigure = styled.div`
  flex: 0 0 auto;
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.12rem;
  min-width: 5ch;
  text-align: right;
`;

const AlertFigureValue = styled.span`
  font-size: ${posType.figure};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1.2;
  color: ${({ theme, tone }) =>
    tone === "up"
      ? theme.color.chartLineGreen
      : tone === "down"
        ? theme.color.chartLineRed
        : theme.color.text};
`;

const AlertFigureLabel = styled.span`
  font-size: ${posType.micro};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Re-arm: a target that has been hit is a target you cared about, and the
// only way back was to retype it
const AlertRearm = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  padding: 0.2rem 0.45rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const AlertRemove = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.chartLineRed};
  }
`;

/* The form is its own band under the scrolling list rather than another row
 * in it — with the list made of cards, a bare row of inputs read as one more
 * target that had somehow lost its border, and it scrolled away besides. */
const AlertFormBlock = styled.div`
  flex: 0 0 auto;
  padding: 0.9rem 1.5rem 1.2rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding: 0.8rem 1.1rem 1rem;
  }
`;

/* One tap instead of arithmetic. Setting a target means answering "what is
 * 10% above the current price", which is a sum nobody wants to do in their
 * head against a five-figure number — so the panel does it and fills the box,
 * leaving it editable rather than committing anything. */
const AlertQuickRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
`;

const AlertQuickLabel = styled.span`
  font-size: ${posType.micro};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-right: 0.15rem;
`;

/* The second line of the form: the three things a target can carry besides
 * its number — a note, a span, and whether it repeats. One row, under the
 * quick chips, so the first row stays the sentence and nothing else. */
const AlertOptionsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.55rem;
  flex-wrap: wrap;
`;

/* The reason a target was set, on its row. Ink, not grey: it is the one line
 * on the row the person wrote themselves. */
const AlertNoteLine = styled.div`
  margin-top: 0.15rem;
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/* The three confidence chips under an open call. */
const AlertConfRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.4rem;
`;

/* A settled call's verdict, in the row it belongs to */
const AlertVerdict = styled.span`
  flex: none;
  align-self: center;
  padding: 0.1rem 0.45rem;
  border-radius: 5px;
  font-size: ${posType.micro};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme, hit }) =>
    hit ? theme.color.chartLineGreen : theme.color.chartLineRed};
  border: 1px solid
    ${({ theme, hit }) =>
      hit ? theme.color.chartLineGreen : theme.color.chartLineRed};
  opacity: 0.85;
`;

/* THE SCOREBOARD
 *
 * The record was one line of small grey text — "64% of 11 settled · streak 2
 * · best 4" — which is four facts written as a sentence, at the size of a
 * caption, above the thing it is the score of. A record is the one part of
 * this panel that is a *figure* rather than a request or a claim, and it now
 * reads like one: three tiles, figure over label, on the derivatives page's
 * ladder (`lead` for the number, `micro` for the word), with a hairline
 * between them and a meter under the hit rate showing what share of the
 * settled calls it is — so "64%" is never printed without its `n`.
 *
 * No colour on any of it. A hit rate in green would grade the caller, and
 * the panel's rule is that it counts and never judges. */
const AlertScore = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0.9rem 0 0.2rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.color.bg};
  overflow: hidden;
`;

const AlertScoreTile = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  padding: 0.6rem 0.75rem 0.55rem;

  & + & {
    border-left: 1px solid ${({ theme }) => theme.color.border};
  }
`;

const AlertScoreValue = styled.div`
  font-size: ${posType.lead};
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: ${({ theme }) => theme.color.text};
`;

const AlertScoreLabel = styled.div`
  font-size: ${posType.micro};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertScoreMeter = styled.div`
  height: 2px;
  margin-top: 0.35rem;
  border-radius: 1px;
  background: ${({ theme }) => theme.color.border};
  overflow: hidden;
`;

const AlertScoreFill = styled.div`
  height: 100%;
  width: ${({ share }) => Math.min(100, Math.max(0, share))}%;
  border-radius: 1px;
  background: ${({ theme }) => theme.color.text};
`;

/* What chance would have given, and what fair odds would have paid: the two
 * lines that qualify the scoreboard. Plain lines under it now, not a second
 * and third boxed bar — a box for every sentence was most of what made the
 * top of this tab read as furniture. */
const AlertRecordBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.35rem 0.1rem 0;
  font-size: ${posType.micro};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertRecordFigure = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-variant-numeric: tabular-nums;
`;

const AlertQuickChip = styled.button.attrs({ type: "button" })`
  padding: 0.2rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
  color: ${({ theme, up }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme, up }) =>
      up ? theme.color.chartLineGreen : theme.color.chartLineRed};
  }
  ${touchTarget};
`;

const AlertForm = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.55rem;

  /* On a phone the four controls can't share a line without each becoming
     too narrow to read, so they wrap into two */
  @media (max-width: ${({ theme }) => theme.breakpoint.down.xs}px) {
    flex-wrap: wrap;
  }
`;

/* THE COIN PICKER IN THE TARGET FORM
 *
 * It was a `<select>` over all 81 coins in two optgroups. A native select can
 * only jump by first letter of the label, so finding SNX meant scrolling a
 * list as long as the panel — and the panel is a place people come to type a
 * number, not to hunt. This is a text box with a ranked list under it, using
 * the matcher the "/" jumper already has: symbol or full name, your own coins
 * first.
 *
 * Kept the same height and border as the controls beside it, because it is
 * still one field in a row of four and should not announce itself as new.
 */
const AlertCoinField = styled.div`
  position: relative;
  flex: 0 0 7.5rem;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.xs}px) {
    flex: 1 1 100%;
  }
`;

const AlertCoinInput = styled.input`
  width: 100%;
  padding: 0.6rem 0.55rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.figure};
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid
    ${({ theme, open }) =>
      open ? theme.color.borderHover : theme.color.border};
  border-radius: 8px;
  cursor: text;

  &::placeholder {
    color: ${({ theme }) => theme.color.textSecondary};
    letter-spacing: 0;
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

/* Above the form rather than below it: the form sits at the foot of the card,
 * so a menu dropping downwards would open off the bottom of the panel.
 *
 * Wider than the field it belongs to (`min-width`), because the field is
 * sized for a three-letter symbol and the rows carry the full name — clipping
 * "Synthetix" to fit the box would take away the reason the name is there.
 * It grows rightwards only, so its left edge still lines up with the control
 * that opened it.
 *
 * Opaque and lifted, not tinted: it crosses the kind buttons above it, and a
 * translucent menu over a pill reads as a rendering fault rather than as a
 * layer. */
const AlertCoinMenu = styled.div`
  position: absolute;
  left: 0;
  bottom: calc(100% + 0.45rem);
  z-index: 4;
  min-width: 13rem;
  max-height: 13rem;
  overflow-y: auto;
  padding: 0.3rem;
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.borderHover};
  border-radius: 8px;
  box-shadow:
    0 10px 28px ${({ theme }) => theme.color.shadow},
    0 2px 6px ${({ theme }) => theme.color.shadow};
  ${themedScrollbar};

  @media (max-width: ${({ theme }) => theme.breakpoint.down.xs}px) {
    right: 0;
    min-width: 0;
  }
`;

const AlertCoinOption = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  width: 100%;
  padding: 0.34rem 0.42rem;
  border: none;
  border-radius: 6px;
  text-align: left;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  cursor: pointer;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme, active }) =>
    active ? theme.color.bgSecondary : "transparent"};

  &:hover {
    background: ${({ theme }) => theme.color.bgSecondary};
  }
`;

/* The full name, so "Synthetix" finds SNX and the symbol is not a riddle. */
const AlertCoinName = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertCoinEmpty = styled.div`
  padding: 0.4rem 0.42rem;
  font-size: ${posType.body};
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertSelect = styled.select`
  padding: 0.6rem 0.55rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.figure};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const AlertInput = styled.input`
  flex: 1;
  min-width: 5rem;
  box-sizing: border-box;
  padding: 0.6rem 0.65rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.figure};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  ${refusedField};
`;

// Filled rather than outlined: it is the one thing in the panel you press to
// make something happen, and it read as another input before
const AlertAdd = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  padding: 0 1.2rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.body};
  font-weight: 600;
  color: ${({ theme }) => theme.color.bg};
  background: ${({ theme }) => theme.color.text};
  border: 1px solid ${({ theme }) => theme.color.text};
  border-radius: 8px;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const AlertKindRow = styled.div`
  display: flex;
  gap: 0.35rem;
`;

const AlertKindButton = styled.button.attrs({ type: "button" })`
  padding: 0.25rem 0.55rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${posType.micro};
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
  ${touchTarget};
`;

/* **A band of its own, in both panels.** The alarm row lands under a
 * paragraph in Targets and under a list in Futures, and in both it is a
 * different kind of thing from what is above it — a setting, not a reading.
 * A rule and some air is the whole separation it needs.
 *
 * Wrapped here rather than by restyling `AlertPosStep`, which the Account tab
 * uses four times over and which must not learn about this one screen. */
const AlertsAlarmBand = styled.div`
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

const AlertsNote = styled.div`
  margin-top: 0.75rem;
  font-size: ${posType.micro};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// What the target being typed would mean right now — shown before it is
// added, because "already true" and "duplicate" are both worth knowing
// before you commit rather than after the target fires instantly
const AlertHint = styled.div`
  margin-top: 0.5rem;
  font-size: ${posType.micro};
  color: ${({ theme, warn }) =>
    warn ? theme.color.chartLineRed : theme.color.textSecondary};
`;

/* The empty state carries the panel on a first visit, so it gets room and a
 * shape rather than a paragraph pinned to the top-left of a tall box. */
const AlertsEmpty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  padding: 2.2rem 1rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertsEmptyMark = styled.div`
  width: 2.6rem;
  height: 2.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 50%;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertsEmptyTitle = styled.div`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.color.text};
`;

const AlertsEmptyText = styled.div`
  max-width: 24rem;
  font-size: ${posType.body};
  line-height: 1.5;
`;

const AlertsEmptySteps = styled.div`
  width: min(26rem, 100%);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.25rem;
  text-align: left;
`;

const AlertsEmptyStep = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: 0.45rem;
`;

const AlertsEmptyStepNo = styled.span`
  width: 1.15rem;
  height: 1.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  font-size: ${posType.micro};
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertsEmptyStepText = styled.span`
  font-size: ${posType.body};
  line-height: 1.45;
  color: ${({ theme }) => theme.color.text};
`;

const AlertsEmptyActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
`;

const AlertsEmptyPanel = styled.div`
  width: min(26rem, 100%);
  margin-top: 0.15rem;
  padding: 0.55rem 0.6rem 0.65rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.color.bgSecondary};
`;

const AlertsEmptyPanelTitle = styled.div`
  font-size: ${posType.micro};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* What an off screen is actually for.
 *
 * The calls tab switched off used to be six centred lines of prose with a
 * button under it and, *below the button*, the one concrete thing on the
 * screen: that calls you had already made were still being settled. That is
 * status, not a footnote — and the record, which survives the switch just as
 * the calls do, was not shown at all, so a feature you had used forty times
 * looked exactly like one you had never touched.
 *
 * Figures, then, above the button and in the panel's own numeric voice: only
 * the ones that are true, so a first visit still gets a clean screen with
 * nothing but the explanation and the way in. */
const AlertsEmptyFacts = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 0.35rem;
`;

const AlertsEmptyFact = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 6.5rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 7px;
  background: ${({ theme }) => theme.color.bgSecondary};
`;

const AlertsEmptyFactValue = styled.div`
  color: ${({ theme }) => theme.color.text};
  font-size: ${posType.figure};
  font-variant-numeric: tabular-nums;
`;

const AlertsEmptyFactLabel = styled.div`
  font-size: ${posType.micro};
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;
