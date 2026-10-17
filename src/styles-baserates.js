/* BASE RATES PANEL STYLES
 *
 * Split from `baserates.js` for the reason every other `styles-*.js` was: the
 * component is the behaviour, this is the look. **Loads before it** (see
 * `index.html`) — a styled component is built when its template literal runs.
 *
 * The panel's whole job is to make a *count* the loudest thing on the row, so
 * the type scale here is upside down compared with the rest of the app: the
 * sample size is not a footnote, it sits next to the figure at almost the same
 * weight. A percentage without its denominator is the failure this screen was
 * built to prevent.
 */
const baseRatesIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

/* A screen's content as it arrives — the monitor's tabs and the base rates
   share it, so a switch between them reads as one screen's pages (12 Oct
   2026). Content only: the head and the tab strip never move. */
const screenPaneKeys = keyframes`
  from { opacity: 0; transform: translate3d(0, 10px, 0); }
  to { opacity: 1; transform: none; }
`;
const screenPaneIn = css`
  animation: ${screenPaneKeys} 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const BaseOverlay = styled.div`
  position: fixed;
  inset: var(--pt-safe-top, 0px) var(--pt-safe-right, 0px) 0
    var(--pt-safe-left, 0px);
  z-index: 110;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  /* **The window, like Settings** (26 Sep 2026): no rim and no card in the
     middle of it. The screens share one head, one left edge and one ground now,
     so moving between them is a change of content, not of furniture. */
  padding: 0;
  /* **Opaque, and the chart is not behind it.**
     It was 85% white over 90% black, with the price line showing through as a
     ghost. Changed on 23 Sep 2026: the main chart must not
     show behind it, and each tab can be a full screen. A panel that covers
     the screen and still shows the chart is neither one thing nor the other —
     the chart cannot be read through it and its own content is competing with
     a line. These are screens now, in the app's own ground. */
  background: ${({ theme }) => theme.color.bg};
  ${besideScreenSpine};
`;

const BaseCard = styled.div`
  display: flex;
  flex-direction: column;
  /* **A screen, not a dialog** — 23 Sep 2026, each tab as a full
     screen. A border, a radius and a drop shadow all mean the same
     thing: a layer floating above a page. Once the ground behind is opaque
     there is no page under it, so the three of them draw an outline around
     nothing — which is exactly what the panel looked like. The surface
     reaches the window instead and keeps only its fill, which is what the
     white controls inside it are read against. */
  width: 100%;
  height: 100vh;
  height: 100dvh;
  background: ${({ theme }) => theme.color.bg};
  overflow: hidden;
  /* The screen's entrance — not replayed when the monitor only changes tab
     (still), where the head and the strip stay put and the content moves */
  animation: ${({ still }) =>
    still
      ? "none"
      : css`
          ${baseRatesIn} 0.2s cubic-bezier(0.22, 1, 0.36, 1)
        `};
`;

/* Settings' head, to the pixel: the same padding, rule and left edge. */
const BaseHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 1.8rem 2.5rem 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  /* The right side clears the screen's ×: the coin's name makes this the
     longest title of the five, and at 390px it ran its key under the ×. */
  @media (max-width: 600px) {
    padding: 1rem 3.25rem 1rem 1rem;
    /* The coins go under the title as one row that scrolls sideways: beside
       it they stacked into a column of four circles (12 Oct 2026) */
    flex-wrap: wrap;
    & > [data-base-coins] {
      order: 3;
      flex: 1 0 100%;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      margin: 0.25rem 0 0;
    }
  }
`;

/* In the screens' own head type (27 Sep 2026): News, Settings and the
   derivatives page set their names in tracked capitals, and this one alone
   was in sentence case at 0.02em — one of five screens with a head of its
   own kind. */
const BaseTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.text};
  /* Its key sits beside it — see KeyCap. */
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
`;

const BaseEyebrow = styled.div`
  flex: 1;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* A reading column on the head's left edge: the rows keep a measure however
   wide the window, and the scroller still runs to its edge. */
const BaseBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.6rem 2.5rem 3rem;
  ${themedScrollbar};

  & > * {
    max-width: min(100%, 92rem);
    width: 100%;
  }

  @media (min-width: 1100px) {
    padding-right: clamp(1.5rem, 2vw, 3rem);
  }

  @media (max-width: 600px) {
    padding: 1rem 1rem 2rem;
  }
`;

/* The two columns: the states and the candlestick shapes, side by side on
 * a wide window and stacked under a smaller viewport. The panel now fills the
 * space it is given instead of staying in a narrow reading column. */
const BaseColumns = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0 2.5rem;
  align-items: start;
  width: 100%;
  max-width: none;
  ${screenPaneIn};

  @media (min-width: 900px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
`;

const BaseColumn = styled.div`
  min-width: 0;
`;

/* The state now. One reading, said plainly, with the clock it was measured on
 * — the whole reason this panel exists is that the same three letters mean six
 * different numbers depending on which range is on screen. */
const BaseNow = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
  margin-bottom: 0.9rem;
`;

const BaseNowValue = styled.div`
  font-size: ${({ small }) => (small ? "1rem" : "1.6rem")};
  line-height: ${({ small }) => (small ? 1.35 : 1.15)};
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.text};
`;

/* **At a glance** (12 Oct 2026): four tiles over the columns, value over
   label like the price head; four across a wide window, two on a phone. A
   tile's value sits at its foot so a short figure and a two-line candle name
   share one baseline. */
const BaseGlance = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
  margin: 0.4rem 0 1.4rem;
  max-width: 110rem !important;
  ${screenPaneIn};

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const BaseGlanceTile = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.9rem 1rem 0.85rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.color.bgSecondary};
  overflow-wrap: anywhere;
`;

const BaseNowLabel = styled.div`
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const BaseNowJump = styled.button.attrs({ type: "button" })`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  ${touchRow};
`;

const BaseSubTabs = styled.div`
  display: flex;
  gap: 0.4rem;
  margin: 0 0 1rem;
`;

const BaseSubTab = styled.button.attrs({ type: "button" })`
  flex: 1;
  min-width: 0;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font: inherit;
  font-size: 0.8rem;
  padding: 0.6rem 0.3rem;
  overflow-wrap: anywhere;
  cursor: pointer;
  &[aria-selected="true"] {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bgSecondary};
    border-color: ${({ theme }) => theme.color.text};
  }
  ${touchRow};
`;

/* Marked so the panel's index can find every section it drew (11 Oct 2026).
   A head the eye can find the screen by (12 Oct 2026): the text ink, a
   weight, a rule under it — it was the quietest type on the page. */
const BaseSectionLabel = styled.div.attrs({ "data-base-section": "1" })`
  margin: 1.8rem 0 0.75rem;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.72rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.text};
  scroll-margin-top: 4rem;
`;

const BaseRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.2rem 1rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  margin-bottom: 0.5rem;
  /* A row about a state the coin is in right now is the one you came for:
     it wears the fill; the rest are outlines on the page's own ground. */
  background: ${({ theme, live }) =>
    live ? theme.color.bgSecondary : "transparent"};
  /* …and a strip in the text ink down its leading edge, so the rows that
     are about today can be found by eye in a column of thirty */
  box-shadow: ${({ theme, live }) =>
    live ? `inset 3px 0 0 ${theme.color.text}` : "none"};
`;

const BaseRowTitle = styled.div`
  font-size: 0.82rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
`;

/* The count, and it is not small. `n` is the reason this panel can be trusted
 * and the reason most of its answers are "not enough" — putting it in a
 * footnote would be the same lie as leaving it out. */
const BaseCount = styled.div`
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: ${({ theme, weak }) =>
    weak ? theme.color.textSecondary : theme.color.text};
`;

const BaseDetail = styled.div`
  grid-column: 1 / -1;
  font-size: 0.72rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* What a pattern is *said* to mean, under its name. Quieter than the count
 * beside it and in the secondary ink on purpose: it is the folklore the row
 * exists to test, not a finding of this panel's. */
const BaseClaim = styled.div`
  grid-column: 1 / -1;
  margin-top: -0.1rem;
  font-size: 0.68rem;
  font-style: italic;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const BaseCompare = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
`;

const BaseNote = styled.div`
  margin-top: 1rem;
  padding-top: 0.8rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.7rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* **Each month, each year** (7 Oct 2026): a year's label and twelve cells
   a row, newest year first, the counts under them. A cell is tinted by the
   size in neutral ink; its signed figure carries the direction. Every
   column shares the width (`minmax(0, 1fr)`): at 390px the grid fits and
   nothing scrolls sideways. */
const BaseMonthGrid = styled.div`
  display: grid;
  grid-template-columns: 2.4rem repeat(12, minmax(0, 1fr));
  gap: 2px;
  font-size: 0.64rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  @media (max-width: 600px) {
    grid-template-columns: 1.9rem repeat(12, minmax(0, 1fr));
    gap: 1px;
    font-size: 0.56rem;
  }
`;

const BaseMonthHead = styled.div`
  padding: 0.25rem 0;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const BaseMonthYear = styled.div`
  padding: 0.3rem 0;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const BaseMonthCell = styled.div`
  padding: 0.3rem 0;
  border-radius: 3px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme, change }) => {
    if (change == null) return "transparent";
    const ink = theme.color.text;
    const depth = Math.round(8 + Math.min(1, Math.abs(change) / 0.3) * 24);
    return `color-mix(in srgb, ${ink} ${depth}%, transparent)`;
  }};
  /* The month in progress: an outline, counted nowhere. */
  outline: ${({ theme, partial }) =>
    partial ? `1px dashed ${theme.color.textSecondary}` : "none"};
  outline-offset: -1px;
`;

const BaseMonthFoot = styled.div`
  padding: 0.3rem 0;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  border-top: ${({ theme, first }) =>
    first ? `1px solid ${theme.color.border}` : "none"};
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* Left, on the column's edge: a sentence in a reading column centred under
   left-aligned rows read as a caption that had lost its picture. */
const BaseEmpty = styled.div`
  padding: 0.6rem 0 1rem;
  text-align: left;
  font-size: 0.8rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const BaseLoad = styled.button.attrs({ type: "button" })`
  display: block;
  margin: 0.6rem auto 0;
  padding: 0.4rem 0.9rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.74rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.text};
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

/* ── Easier to read and to move around (11 Oct 2026) ─────────────────
   The screen ran 7,881px with every row a paragraph. Now: the coins to read
   in its head, an index of its sections that stays at the top while it
   scrolls. Since 14 Oct 2026 each count is one bar, its Wilson interval,
   and an ordinary-day reference tick, all in neutral ink. */
const BaseCoins = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-left: auto;
  margin-right: ${({ inline }) => (inline ? "0" : "2.5rem")};
`;

/* **The question and its coins, under the monitor's tabs** (12 Oct 2026):
   what the screen's own head said before it became a tab of the monitor. */
const BaseContext = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem 1rem;
  margin: 0 0 0.9rem;
  max-width: 110rem !important;
  ${screenPaneIn};

  @media (max-width: 600px) {
    & > [data-base-coins] {
      flex: 1 0 100%;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      margin-left: 0;
    }
  }
`;

const BaseContextTitle = styled.h3`
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.86rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.text};
`;

const BaseChip = styled.button.attrs({ type: "button" })`
  font-family: inherit;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  cursor: pointer;
  color: ${({ theme, active }) => (active ? theme.color.bg : theme.color.text)};
  background: ${({ theme, active }) =>
    active ? theme.color.text : "transparent"};
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.text};
  }
  ${touchRow};
`;

/* **One row that says where you are** (12 Oct 2026): it wrapped to two and
   three lines of twelve equal chips, none of them lit. Now one line that
   scrolls sideways under the hand, the section you are in filled. */
const BaseNav = styled.nav`
  position: sticky;
  top: -1.6rem;
  z-index: 2;
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
  gap: 0.3rem;
  /* Up into the body's padding, unless the monitor's tabs are over it —
     pulled up, it sat across their lower half (12 Oct 2026) */
  margin: ${({ afterTabs }) => (afterTabs ? "0" : "-1.6rem")} -2.5rem 0.6rem;
  padding: 0.75rem 2.5rem 0.65rem;
  max-width: none !important;
  background: ${({ theme }) => theme.color.bg};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  @media (max-width: 600px) {
    margin: ${({ afterTabs }) => (afterTabs ? "0" : "-1rem")} -1rem 0.6rem;
    padding: 0.6rem 1rem;
    top: -1rem;
  }
`;

const BaseNavChip = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  cursor: pointer;
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : "transparent")};
  background: ${({ theme, active }) =>
    active ? theme.color.bgSecondary : "transparent"};
  color: ${({ theme, active }) =>
    active ? theme.color.text : theme.color.textSecondary};
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.border};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.borderHover};
    outline-offset: 1px;
  }
  ${touchRow};
`;

const BaseHorizon = styled.div`
  grid-column: 1 / -1;
  margin-top: 0.35rem;
`;

const BaseHorizonLabel = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.25rem;
`;

const BaseBars = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 0.25rem 0.6rem;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: ${({ theme, quiet }) => quiet ? theme.color.textSecondary : theme.color.text};
  & > span { color: inherit; }
`;

const BaseBarLabel = styled.span`
  color: ${({ theme, base }) =>
    base ? theme.color.textSecondary : theme.color.text};
`;

const BaseBarTrack = styled.span`
  position: relative;
  display: block;
  height: 0.45rem;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.border};
  margin: 0.35rem 0;
  color: ${({ theme, quiet }) =>
    quiet ? theme.color.textSecondary : theme.color.text};

  > i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 999px;
    background: currentColor;
  }
  > b {
    position: absolute;
    width: 2px;
    height: 1.1rem;
    top: -0.325rem;
    background: ${({ theme }) => theme.color.text};
  }
  > em {
    position: absolute;
    top: -0.18rem;
    height: 0.8rem;
    border: 1px solid currentColor;
    border-top: 0;
    border-bottom: 0;
    &::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      border-top: 1px solid currentColor;
    }
  }
`;

const BaseVerdict = styled.div`
  margin-top: 0.3rem;
  font-size: 0.72rem;
  color: ${({ theme, weak }) =>
    weak ? theme.color.textSecondary : theme.color.text};
`;

const BaseHistoryBox = styled.div`
  min-width: 0;
  margin: 0.75rem 0;
  color: ${({ theme }) => theme.color.text};
  font-size: 0.75rem;
  & > label {
    display: block;
  }
`;

const BaseHistorySvg = styled.svg`
  display: block;
  width: 100%;
  height: auto;
  color: ${({ theme }) => theme.color.text};
  font-family: inherit;
`;

const BaseSimilarGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem 1rem;
`;

const BaseLibraryTools = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1rem;
  max-width: 110rem !important;
  & > label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    ${touchRow};
  }
  & > label > input {
    margin: 0;
  }
`;

const baseHistoryField = css`
  min-width: 0;
  max-width: 100%;
  padding: 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  font: inherit;
  font-size: 0.75rem;
  ${touchField};
`;
const BaseHistorySelect = styled.select`
  ${baseHistoryField};
`;
const BaseHistoryInput = styled.input`
  ${baseHistoryField};
`;
