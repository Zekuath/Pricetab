/* PRICE TARGET STYLES
 * Split out of alerts.js, which passed the 800-line guideline once each
 * target grew from one sentence into a card. Same arrangement the rest of
 * the app already uses (styles-app / styles-widgets / styles-settings):
 * the panel keeps the logic, this keeps the look.
 *
 * Loaded before alerts.js — see the script order in index.html.
 */

const alertIn = keyframes`
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// Fired-alert banners, stacked under the top edge
const AlertToastStack = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.spacing.medium}rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
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
`;

// Direction as a shape as well as a colour
const AlertDirBadge = styled.span`
  flex: 0 0 auto;
  width: ${({ small }) => (small ? "1.35rem" : "1.6rem")};
  height: ${({ small }) => (small ? "1.35rem" : "1.6rem")};
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: ${({ small }) => (small ? "0.7rem" : "0.8rem")};
  line-height: 1;
  color: ${({ theme, up }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
  border: 1px solid
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

const AlertToastClose = styled.button.attrs(() => ({ type: "button" }))`
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

/* Centred, not pinned near the top. The panel used to start at 12vh and grow
 * downwards, so a panel with one target sat high with a lake of dim under it
 * and a full one ran to the bottom edge — its size decided where it lived.
 * Centring fixes the eye in one place whatever is in it. */
const AlertsOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.85)"
      : "rgba(0, 0, 0, 0.88)"};
`;

/* Three bands: heading, scrolling list, form. Only the middle one scrolls, so
 * the tally stays readable and — the part that actually mattered — the form
 * stays reachable. With ten targets it used to sit below a long scroll, so
 * adding an eleventh meant scrolling past the ten you already had. */
const AlertsCard = styled.div`
  display: flex;
  flex-direction: column;
  width: min(36rem, 100%);
  max-height: min(85vh, 44rem);
  overflow: hidden;
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 14px;
  box-shadow: 0 8px 32px ${({ theme }) => theme.color.shadow};
  animation: ${alertIn} 0.2s cubic-bezier(0.22, 1, 0.36, 1);
`;

const AlertsBody = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 1.5rem;

  @media (max-width: ${({ theme }) => theme.breakpoint.down.sm}px) {
    padding: 0 1.1rem;
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
  scrollbar-width: thin;
  scrollbar-color: ${({ theme }) => theme.color.border} transparent;

  /* The list ends by fading rather than by being sliced. A row cut in half by
   * the divider above the foot reads as content jammed against a wall, which
   * is a large part of why a full panel felt tight even once everything fit.
   * Fourteen pixels is enough to say "there is more" without dimming a row
   * anyone is trying to read. */
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 14px,
    #000 calc(100% - 14px),
    transparent 100%
  );

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    margin: 0.4rem 0;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.color.border};
    border-radius: 3px;
    transition: background 0.2s ease;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${({ theme }) => theme.color.borderHover};
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
  font-size: 0.58rem;
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
  font-size: 0.63rem;
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`;

/* A switch that says what it is, the way a config listing does: a filled dot
 * for on, a hollow one for off. State is never carried by colour alone, so it
 * survives both themes and a reader who cannot separate them. */
const AlertStateChip = styled.button.attrs(() => ({ type: "button" }))`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 3px;
  background: transparent;
  color: ${({ theme, on }) =>
    on ? theme.color.text : theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;

  &::before {
    content: "";
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 50%;
    border: 1px solid
      ${({ theme, on }) => (on ? theme.color.chartLineGreen : theme.color.border)};
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
`;

/* The plain actions. Square-cornered like everything else down here, and
 * quieter than the switches — they are the things you reach for least. */
/* `strong` is for the one action in a strip that is not a piece of tidying up.
 * Switching calls off is the mode itself, and it was the same 24px sliver as
 * "clear settled" beside it — the smallest target in the panel for the biggest
 * thing in it. It gets a real hit area, the foreground colour, and a fill on
 * hover so it reads as the button of the row rather than one of three
 * equally-weighted words. */
/* A filled action. Inverted rather than "white": the panel's own foreground
 * becomes the surface and its background becomes the label, so it is a solid
 * button in the dark theme and a solid button in the light one, without either
 * colour being named anywhere.
 *
 * Red was tried and rejected. Red already means something on this chart — the
 * price is down, the call was MISSED, three rows above — and turning calls off
 * loses nothing: the calls and the score are kept, and "L" brings it back. It
 * would also put the loudest colour in the panel on the exit while `reset
 * score`, the one action here that cannot be undone, sits beside it in a
 * ghost. If anything ever wears red in this foot it should be that one. */
const ACTION_FILL = {
  solid: (theme) => ({ bg: theme.color.text, fg: theme.color.bg }),
};

const AlertActionKey = styled.button.attrs(() => ({ type: "button" }))`
  padding: ${({ strong }) => (strong ? "0.45rem 1.1rem" : "0.28rem 0.55rem")};
  min-height: ${({ strong }) => (strong ? "2rem" : "auto")};
  border: 1px solid
    ${({ theme, fill }) =>
      fill && ACTION_FILL[fill]
        ? ACTION_FILL[fill](theme).bg
        : theme.color.border};
  border-radius: 3px;
  background: ${({ theme, fill }) =>
    fill && ACTION_FILL[fill] ? ACTION_FILL[fill](theme).bg : "transparent"};
  color: ${({ theme, strong, fill }) =>
    fill && ACTION_FILL[fill]
      ? ACTION_FILL[fill](theme).fg
      : strong
        ? theme.color.text
        : theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: ${({ strong }) => (strong ? "0.74rem" : "0.68rem")};
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease,
    opacity 0.15s ease;

  /* At the end of a ladder there is nothing to press. Dimmed *and* disabled:
     one without the other is either a button that lies about being usable or
     one that looks usable and does nothing. */
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }

  &:hover:not(:disabled) {
    border-color: ${({ theme, fill }) =>
      fill && ACTION_FILL[fill]
        ? ACTION_FILL[fill](theme).bg
        : theme.color.borderHover};
    color: ${({ theme, fill }) =>
      fill && ACTION_FILL[fill] ? ACTION_FILL[fill](theme).fg : theme.color.text};
    // A filled button dims on hover rather than lighting up: there is nowhere
    // brighter for it to go
    opacity: ${({ fill }) => (fill ? "0.85" : "1")};
    background: ${({ theme, strong, fill }) =>
      fill && ACTION_FILL[fill]
        ? ACTION_FILL[fill](theme).bg
        : strong
          ? theme.color.bgSecondary
          : "transparent"};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.chartLineGreen};
  }
`;

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
  font-size: 0.72rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.text};
`;

/* A labelled control line in the panel's bottom block: label left, control
 * right, with the label allowed to wrap under its own explanation without
 * pushing the control around. */
/* The one real action on an empty screen. A chip is right for a setting in a
 * row of settings; the thing that starts the feature should look like the
 * button it is. */
const AlertPrimaryButton = styled.button.attrs(() => ({ type: "button" }))`
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
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ theme, ghost }) =>
      ghost ? theme.color.borderHover : theme.color.text};
  }
  &:active { transform: translateY(0); opacity: 0.85; }

  &:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px ${({ theme }) => theme.color.bg},
      0 0 0 4px ${({ theme }) => theme.color.chartLineGreen};
  }
`;

/* The live consequence of the squares setting, under its chips. */
const AlertGeometryLine = styled.div`
  margin-top: 0.55rem;
  padding: 0.45rem 0.6rem;
  border-radius: 7px;
  background: ${({ theme }) => theme.color.bgSecondary};
  font-size: 0.66rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertGeometryFigure = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-variant-numeric: tabular-nums;
`;

/* The settings group on the calls tab: separated from the list above by a
 * rule and some air, so it reads as controls rather than as more rows. */
const AlertCallSettings = styled.div`
  margin-top: 0.9rem;
  padding-top: 0.4rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

const AlertSettingRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.9rem;
  padding: 0.5rem 0;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.border};
  }
`;

const AlertSettingText = styled.div`
  min-width: 0;
`;

const AlertSettingName = styled.div`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.text};
`;

const AlertSettingHint = styled.div`
  margin-top: 0.15rem;
  font-size: 0.64rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertsTitle = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
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
  font-size: 0.66rem;
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
const AlertsInfoBtn = styled.button.attrs(() => ({ type: "button" }))`
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
  font-size: 0.72rem;
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
  font-size: 0.66rem;
  text-align: center;
  color: ${({ theme }) => theme.color.text};
`;

// Section heading between the armed targets and the ones already hit
const AlertsSectionLabel = styled.div`
  margin: 0.9rem 0 0.5rem;
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Same label, but heading a block that already has a rule above it
const AlertsSectionLabelTight = styled.div`
  margin-bottom: 0.55rem;
  font-size: 0.6rem;
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
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertUndoButton = styled.button.attrs(() => ({ type: "button" }))`
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
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

/* A target is its own card now rather than a line between hairlines. Each one
 * carries three stacked facts (what, where it stands, how far it has come),
 * and hairline rows made those read as one run-on column. */
const AlertRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
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
  font-size: 0.82rem;
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
  font-size: 0.68rem;
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
  background: ${({ theme, up }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
  transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1);
`;

const AlertMeta = styled.span`
  flex: 0 0 auto;
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Re-arm: a target that has been hit is a target you cared about, and the
// only way back was to retype it
const AlertRearm = styled.button.attrs(() => ({ type: "button" }))`
  flex: 0 0 auto;
  padding: 0.2rem 0.45rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.64rem;
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

const AlertRemove = styled.button.attrs(() => ({ type: "button" }))`
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
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-right: 0.15rem;
`;

/* A section label with a control on the right — the calls section needs to
 * carry its own switch, since it no longer has a settings tab to live in. */
const AlertsSectionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
`;

/* Neutral chip: the squares selector and the section's own switch.
 * AlertQuickChip is coloured by direction, which means nothing here.
 *
 * Sized to be hit, not just seen. The first version was 0.2rem of padding on
 * a 0.66rem label — about 20px tall, which is under any reasonable pointer
 * target and impossible on a touchpad in a hurry. The selected state is
 * carried by fill *and* border rather than border alone, so it survives being
 * looked at quickly. */
const AlertPlainChip = styled.button.attrs(() => ({ type: "button" }))`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.1rem;
  min-height: 1.9rem;
  padding: 0 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: ${({ theme, active }) =>
    active ? theme.color.bg : theme.color.textSecondary};
  background: ${({ theme, active }) =>
    active ? theme.color.text : "transparent"};
  border: 1px solid
    ${({ theme, active }) =>
      active ? theme.color.text : theme.color.border};
  border-radius: 7px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
    color: ${({ theme, active }) => (active ? theme.color.bg : theme.color.text)};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.chartLineGreen};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.color.chartLineGreen};
  }
`;

/* The squares row wraps at ten chips rather than squeezing them, and keeps
 * its label on its own line so the two never collide. */
const AlertChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.3rem 0 0.1rem;
`;

/* A settled call's verdict, in the row it belongs to */
const AlertVerdict = styled.span`
  flex: none;
  align-self: center;
  padding: 0.1rem 0.45rem;
  border-radius: 5px;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme, hit }) =>
    hit ? theme.color.chartLineGreen : theme.color.chartLineRed};
  border: 1px solid
    ${({ theme, hit }) =>
      hit ? theme.color.chartLineGreen : theme.color.chartLineRed};
  opacity: 0.85;
`;

/* The record line: its own block with real space around it, rather than a
 * note wedged against the form below it. */
const AlertRecordBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.6rem 0 0.2rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  font-size: 0.68rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertRecordFigure = styled.span`
  color: ${({ theme }) => theme.color.text};
`;

const AlertQuickChip = styled.button.attrs(() => ({ type: "button" }))`
  padding: 0.2rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.68rem;
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

const AlertSelect = styled.select`
  padding: 0.6rem 0.55rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.82rem;
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
  font-size: 0.82rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

// Filled rather than outlined: it is the one thing in the panel you press to
// make something happen, and it read as another input before
const AlertAdd = styled.button.attrs(() => ({ type: "button" }))`
  flex: 0 0 auto;
  padding: 0 1.2rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.78rem;
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

const AlertKindButton = styled.button.attrs(() => ({ type: "button" }))`
  padding: 0.25rem 0.55rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.68rem;
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

const AlertsNote = styled.div`
  margin-top: 0.9rem;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// What the target being typed would mean right now — shown before it is
// added, because "already true" and "duplicate" are both worth knowing
// before you commit rather than after the target fires instantly
const AlertHint = styled.div`
  margin-top: 0.5rem;
  font-size: 0.68rem;
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
  font-size: 0.76rem;
  line-height: 1.5;
`;
