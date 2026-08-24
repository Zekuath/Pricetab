const panelLift = keyframes`
  from { transform: translateY(24px) scale(0.95); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
`;

const SettingsCard = styled.div`
  width: min(92vw, 32rem);
  /* 40rem left 1,488px of preferences scrolling through a 396px window on an
     ordinary 900px screen, with 92vh (828px) of room going unused. The cap is
     what keeps the card from becoming a full-height sheet on a tall monitor;
     it does not have to be this far below the room available. */
  height: min(92vh, 46rem);
  display: flex;
  flex-direction: column;
  border-radius: ${({ theme }) => theme.scale * 8}rem;
  padding: ${({ theme }) => theme.spacing.large * 1.5}rem;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.98)"
      : "rgba(5, 5, 5, 0.92)"};
  border: 1px solid ${({ theme }) => theme.color.border};
  box-shadow: 0 25px 60px ${({ theme }) => theme.color.shadow};
  text-align: center;
  animation: ${panelLift} 0.4s ease;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  overflow: hidden;
  position: relative;
`;

const SettingsClose = styled.button.attrs({ type: "button" })`
  position: absolute;
  top: ${({ theme }) => theme.spacing.medium}rem;
  right: ${({ theme }) => theme.spacing.medium}rem;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.color.bgSecondary};
    color: ${({ theme }) => theme.color.text};
  }
`;

const SettingsGroupTitle = styled.h4`
  width: 100%;
  max-width: 22rem;
  margin: ${({ theme }) => theme.spacing.medium}rem auto
    ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  color: ${({ theme }) => theme.color.textSecondary};
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;

  /* The heading is the hit area, so the arrow has to answer to it — hovering
   * the word and watching the only control on the row stay flat is what made
   * the group read as a label. */
  &:hover span,
  &:focus-visible span {
    opacity: 1;
  }

  &:first-child {
    margin-top: 0;
  }
`;

/* The one thing that says a heading opens.
 *
 * It was a 0.6rem "▾" at 0.7 opacity and went unreported for long enough that
 * the groups read as headings rather than as controls. Three things changed
 * and all three were needed: it is an SVG on the icon grid rather than a font
 * glyph, it is 0.82rem rather than 0.6, and it sits in its own bordered well
 * so there is a control-shaped thing to aim at. The rotation is what tells
 * you which way it went — a quarter turn, eased, on the same curve as the
 * reveal below it, so the arrow and the drawer move as one gesture.
 *
 * `-90deg` when closed rather than `+90`: the head of the arrow ends up on
 * the right, pointing into the row it would open, which is the direction the
 * content arrives from. */
const GroupChevron = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  flex: 0 0 auto;
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.textSecondary};
  border: 1px solid
    ${({ theme, open }) => (open ? theme.color.border : "transparent")};
  opacity: ${({ open }) => (open ? 0.95 : 0.6)};
  transition:
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease,
    border-color 0.2s ease;
  transform: rotate(${({ open }) => (open ? "0deg" : "-90deg")});
`;

const GroupReveal = styled.div`
  overflow: hidden;
  max-height: ${({ open }) => (open ? "60rem" : "0")};
  opacity: ${({ open }) => (open ? 1 : 0)};
  transition: max-height 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.28s ease;
`;

const SettingsTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  font-size: 1.25rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const RatePromptBar = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  margin-bottom: ${({ theme }) => theme.spacing.medium}rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale * 4}rem;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.color.textSecondary};
  text-align: left;
`;

const RatePromptText = styled.span`
  flex: 1;
`;

const RatePromptLink = styled.a`
  flex: 0 0 auto;
  color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-decoration: underline;
  cursor: pointer;
`;

const RatePromptClose = styled.button.attrs({ type: "button" })`
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

  &:focus {
    outline: none;
  }
`;

const TabContainer = styled.div`
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  margin-bottom: ${({ theme }) => theme.spacing.medium}rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  padding-bottom: ${({ theme }) => theme.spacing.small}rem;
`;

const TabButton = styled.button.attrs({ type: "button" })`
  background: transparent;
  border: none;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.875rem;
  font-weight: ${({ active, theme }) =>
    active ? theme.fontWeight.medium : theme.fontWeight.normal};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${({ active, theme }) =>
    active ? theme.color.text : theme.color.textSecondary};
  cursor: pointer;
  transition: all 0.2s ease;
  border-bottom: 2px solid
    ${({ active, theme }) => (active ? theme.color.text : "transparent")};
  margin-bottom: -${({ theme }) => theme.spacing.small}rem;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }

  &:focus {
    outline: none;
  }
`;

const tabFadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const TabContent = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  /* Keep the scrollbar out by the card edge and reserve its lane so
     content never shifts when it appears */
  scrollbar-gutter: stable;
  margin-right: -${({ theme }) => theme.spacing.large}rem;
  padding-right: ${({ theme }) => theme.spacing.large}rem;
  animation: ${tabFadeIn} 0.25s ease-out;

  ${themedScrollbar};
  &::-webkit-scrollbar-track {
    margin: ${({ theme }) => theme.scale * 4}rem 0;
  }

  /* Scrolled content **arrives and leaves**; it is never sliced.
   *
   * There was nothing here, so a heading scrolled to the top edge was cut
   * clean through the middle of its letters and left sitting a few pixels
   * under the tab strip's underline — two lines of type meeting with nothing
   * between them, which is what "the writing has run into itself" was. Caught
   * by screenshotting the panel rather than by measuring it: every box was
   * exactly where it should be, and the defect was the clipping edge.
   *
   * A mask rather than a gradient overlay, because the panel is drawn on two
   * different backgrounds and an overlay would have to know which. The same
   * treatment the news list and the targets panel already use at their foot —
   * this is the first surface here that needed it at the head as well, since
   * it is the only one whose content scrolls up into furniture. */
  /* **rem, not px.** theme.scale is PIXEL_SCALE / 16 — a multiplier for
     rem values, which is how every other measurement in this file uses it
     (theme.spacing.large is scale * 8 and is written …rem). Written
     …px it resolved to **5.5px**, a quarter of the 22 the comment claimed,
     and 5.5px under a 16px line is not a fade — it is a slice with a soft
     edge. That is what "the top swallows part of the text" was: a description
     line arriving at the top edge became an unreadable smear directly under
     the tab strip, and a toggle row leaving at the foot was cut through the
     middle. Measured on screen, not inferred: mask-image computed to
     rgb(0,0,0) 5.5px. 1.75rem (28px at the default root) clears a full line
     of the smallest type on this panel. */
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 ${({ theme }) => theme.scale * 7}rem,
    #000 calc(100% - ${({ theme }) => theme.scale * 7}rem),
    transparent 100%
  );

  /* And the fade is only honest if nothing lands *inside* it. Without this a
     heading scrolled into view stops half-faded, which is a slice by another
     means. */
  scroll-padding-top: ${({ theme }) => theme.scale * 8}rem;
  scroll-padding-bottom: ${({ theme }) => theme.scale * 8}rem;
`;

/* A setting that only applies while another one is on. Kept mounted so it
 * eases open instead of appearing from nowhere; `maxHeight` covers the cases
 * taller than a single row, since an unset max-height can't be transitioned. */
const SettingReveal = styled.div`
  overflow: hidden;
  max-height: ${({ open, maxHeight }) => (open ? maxHeight || "8rem" : "0")};
  opacity: ${({ open }) => (open ? 1 : 0)};
  transform: translateY(${({ open }) => (open ? "0" : "-6px")});
  transition: max-height 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.28s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
`;

const CoinList = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  margin-bottom: ${({ theme }) => theme.spacing.medium}rem;
  position: relative;
`;

/* The coin chip, in two elements that look identical.
 *
 * A tracked coin's chip carries a remove control inside it, and the two cannot
 * both be buttons — a button inside a button is invalid, and the browser makes
 * its own mind up about which one a click belongs to. So the tracked chip is a
 * plain element that happens to be draggable, and the × inside it is the real
 * button. It used to be the other way round: an outer `<button>` with no
 * `onClick` at all and a `<span>` carrying the click, which meant the only way
 * to remove a coin was to hit a 16px span with a pointer. Tab landed on the
 * chip, which did nothing, and never reached the ×. The suggestion chips below
 * the box are still buttons — there the whole chip *is* the action.
 */
const coinChipFace = css`
  border-radius: 999px;
  border: 1px solid
    ${({ selected, theme }) =>
      selected ? theme.color.text : theme.color.border};
  padding: ${({ selected }) =>
    selected ? "0.45rem 1.8rem 0.45rem 0.85rem" : "0.35rem 0.75rem"};
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  background: ${({ selected, theme }) =>
    selected ? theme.color.text : "transparent"};
  color: ${({ selected, theme }) =>
    selected ? theme.color.bg : theme.color.text};
  text-transform: uppercase;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease,
    opacity 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
  min-width: 3.5rem;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const CoinChip = styled.button.attrs({ type: "button" })`
  ${coinChipFace};
  cursor: pointer;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: ${({ selected, theme }) =>
      selected ? theme.color.text : theme.color.borderHover};
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
    transform: none;
  }
`;

// The tracked-coin chip: the same face, but it is a handle for dragging and a
// frame for the × — not something to press.
const CoinChipStatic = styled.div`
  ${coinChipFace};
  cursor: grab;

  &:hover {
    border-color: ${({ theme }) => theme.color.text};
  }

  &:active {
    cursor: grabbing;
  }
`;

const CoinChipRemove = styled.button.attrs({ type: "button" })`
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 300;
  opacity: 0.5;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  border-radius: 50%;

  &:hover {
    opacity: 1;
    transform: translateY(-50%) scale(1.2);
  }

  /* It is the only way to remove a coin, so it has to be findable from the
     keyboard as well as under a pointer. */
  &:focus-visible {
    opacity: 1;
    outline: 2px solid ${({ theme }) => theme.color.bg};
    outline-offset: 1px;
  }
`;

const CoinSectionTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.875rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

const SettingsDescription = styled.p`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  max-width: 22rem;
  font-size: 0.875rem;
  opacity: 0.8;
  line-height: 1.5;
`;

const CoinDragHint = styled.p`
  font-size: 0.65rem;
  opacity: 0.4;
  margin: 0.2rem 0 0.75rem;
  letter-spacing: 0.04em;
`;

const CoinSectionHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 0 ${({ theme }) => theme.spacing.medium}rem;
`;

const CoinCounter = styled.span`
  font-size: 0.65rem;
  opacity: 0.4;
  letter-spacing: 0.05em;
`;

const ResetRow = styled.div`
  margin-top: ${({ compact, theme }) =>
    compact ? theme.spacing.small : theme.spacing.large}rem;
  padding-top: ${({ compact, theme }) =>
    compact ? theme.spacing.xsmall : theme.spacing.medium}rem;
  border-top: 1px solid ${({ theme }) => theme.color.border}22;
  transition: margin-top 0.45s cubic-bezier(0.33, 1, 0.68, 1),
    padding-top 0.45s cubic-bezier(0.33, 1, 0.68, 1);
`;

const ResetButton = styled.button.attrs({ type: "button" })`
  background: none;
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.text};
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  padding: 0.4rem 1.25rem;
  font-size: 0.7rem;
  font-family: inherit;
  letter-spacing: 0.06em;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
  }
`;

const SuggestionHint = styled.p`
  margin: ${({ theme }) => theme.spacing.xsmall}rem 0 0;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  opacity: 0.7;
`;

const CoinChipName = styled.span`
  margin-left: 0.4em;
  font-size: 0.75em;
  opacity: 0.6;
  text-transform: none;
  letter-spacing: 0.02em;
`;

/* The 24h move, on the chip. The list used to be bare symbols — a naming
 * exercise, when the question you open it with is usually "which of these is
 * doing what". Nothing is fetched for it: the ticker snapshot is already in
 * memory, so the number is free.
 *
 * A selected chip is filled with the text colour, so the usual green/red
 * would be sitting on its own inverse and lose most of its contrast.
 * `currentColor`, dialled back, reads there — and the sign already carries
 * the direction, so no information rests on the colour. */
const CoinChipChange = styled.span`
  margin-left: 0.5em;
  font-size: 0.8em;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  text-transform: none;
  color: currentColor;
  opacity: 0.7;
`;

// Sort actions above the selected list — drag is precise but tedious past a
// handful of coins, and these are the three orders anyone actually wants
const CoinSortRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
`;

const CoinSortLabel = styled.span`
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-right: 2px;
`;

const CoinSortButton = styled.button.attrs({ type: "button" })`
  padding: 4px 9px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 7px;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.borderHover};
    color: ${({ theme }) => theme.color.text};
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const SettingsForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.small}rem;
  width: 100%;
  position: relative;
`;

const SettingsInput = styled.input`
  padding: 0.75rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  text-transform: uppercase;
  letter-spacing: 0.15em;
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
    background: ${({ theme }) => theme.color.bgSecondary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* Suggestion area between the search bar and the Add coin button.
   grid-template-rows 0fr→1fr animates to the REAL content height in one
   uninterrupted motion (no max-height guessing). */
const SuggestionsArea = styled.div`
  display: grid;
  grid-template-rows: ${({ open }) => (open ? "1fr" : "0fr")};
  opacity: ${({ open }) => (open ? 1 : 0)};
  transition: grid-template-rows 0.45s cubic-bezier(0.33, 1, 0.68, 1),
    opacity 0.45s cubic-bezier(0.33, 1, 0.68, 1);
`;

const SuggestionsAreaInner = styled.div`
  min-height: 0;
  overflow: hidden;
`;

const SuggestionList = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  padding: 0.25rem 0;
`;

const SettingsActionButton = styled.button.attrs({ type: "button" })`
  padding: 0.75rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: none;
  cursor: pointer;
  background: ${({ theme }) => theme.color.text};
  color: ${({ theme }) => theme.color.bg};
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 24px ${({ theme }) => theme.color.shadow};
  }

  &:active {
    transform: scale(0.98);
  }
`;

const SettingsFeedback = styled.p`
  margin: ${({ theme }) => theme.spacing.small}rem 0 0;
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  color: ${({ error, theme }) =>
    theme.color.bg === "#ffffff"
      ? error
        ? "#c62828"
        : "#1e7e46"
      : error
        ? "#ff8a8a"
        : "#8affc1"};
`;

const ThemeSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
  max-width: 22rem;
`;

const ThemeSectionTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const ThemeButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xsmall}rem;
  justify-content: center;
`;

const ThemeButton = styled.button.attrs({ type: "button" })`
  flex: 1;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid
    ${({ active, theme }) => (active ? theme.color.text : theme.color.border)};
  background: ${({ active, theme }) =>
    active ? theme.color.text : "transparent"};
  color: ${({ active, theme }) => (active ? theme.color.bg : theme.color.text)};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 4rem;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.borderHover};
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const ThemeDescription = styled.p`
  margin: ${({ theme }) => theme.spacing.small}rem 0 0;
  font-size: 0.7rem;
  opacity: 0.6;
  text-align: center;
  line-height: 1.4;
`;

// Toggle Switch Components
const ToggleSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
  max-width: 22rem;
`;

const ToggleSectionTitle = styled.div`
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
  margin-bottom: 0.25rem;
`;

/* A setting's title, with the ring that explains it.
 *
 * Only settings with something genuinely non-obvious to say get one — the
 * cost of a control, an interaction with another setting, a gotcha. A ring on
 * every row would be noise, and noise is what people stop reading. */
const SettingTitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  margin-bottom: 0.25rem;
`;

const SettingInfoBtn = styled.button.attrs({ type: "button" })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: ${({ theme }) => theme.color.text};
  opacity: ${({ active }) => (active ? 0.9 : 0.4)};
  transition: opacity 0.15s ease;

  &:hover,
  &:focus-visible {
    opacity: 0.9;
  }
`;

/* The note itself: left-aligned, in a box, at readable weight.
 *
 * The one-line description above it is centred at half opacity because it is
 * a caption. This is prose — a caption you have to squint at is a caption
 * nobody reads, and the whole point of the ring is that what it reveals is
 * worth reading. */
const SettingNote = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.small}rem;
  padding: 0.5rem 0.65rem;
  max-width: 22rem;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  font-size: 0.68rem;
  line-height: 1.5;
  text-align: left;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const ToggleSectionDesc = styled.div`
  font-size: 0.65rem;
  opacity: 0.5;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.medium}rem;
  padding: 0.4rem 0;

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.color.border}22;
  }
`;

const ToggleLabel = styled.label`
  font-size: 0.7rem;
  opacity: 0.6;
`;

const WidgetGroupTitle = styled.h4`
  margin: ${({ theme }) => theme.spacing.medium}rem 0
    ${({ theme }) => theme.spacing.xsmall}rem;
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const ToggleTextCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 2px;
`;

const ToggleDesc = styled.span`
  font-size: 0.62rem;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The modes row.
 *
 * Sits above the groups with a rule under it, because it is not one of them:
 * everything below is a single setting, and this is the row that moves twelve
 * of them at once. It borrows the widget bundles' pills on purpose — the same
 * gesture ("pick a bundle") should look the same wherever it appears. */
const ModeSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding-bottom: ${({ theme }) => theme.spacing.small}rem;
  width: 100%;
  max-width: 22rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
`;

const ModeLabel = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.35rem;
`;

/* Two lines of room, held whether or not there is anything to say: the text
 * follows the pointer across four pills, and a box that grew and shrank as it
 * changed would move the pills out from under the cursor. */
const ModeDesc = styled.div`
  min-height: 2.4em;
  font-size: 0.66rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.textSecondary};
  opacity: ${({ dim }) => (dim ? 0.8 : 1)};
`;

const PresetRow = styled.div`
  display: flex;
  gap: 6px;
  margin: 4px 0 10px;
  flex-wrap: wrap;
`;

const PresetButton = styled.button.attrs({ type: "button" })`
  flex: 1 1 auto;
  min-width: 64px;
  padding: 6px 8px;
  border: 1px solid
    ${({ active, theme }) =>
      active ? theme.color.text : theme.color.border};
  border-radius: 7px;
  background: ${({ active, theme }) =>
    active ? theme.color.bgSecondary : "transparent"};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  font-weight: ${({ active, theme }) =>
    active ? theme.fontWeight.medium : theme.fontWeight.normal};
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
    background: ${({ theme }) => theme.color.bgSecondary};
  }
`;

const ToggleSwitch = styled.button.attrs({ type: "button" })`
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  background-color: ${({ active, theme }) =>
    active ? theme.color.text : theme.color.border};
  transition: background-color 0.2s ease;
  flex-shrink: 0;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.text}40;
  }

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ active }) => (active ? "22px" : "2px")};
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: ${({ active, theme }) =>
      active ? theme.color.bg : theme.color.text};
    transition: left 0.2s ease;
  }
`;

const RefreshIntervalSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
  max-width: 22rem;
`;

const RefreshIntervalLabel = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const RefreshIntervalSelect = styled.select`
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image:
    linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position:
    calc(100% - 15px) center,
    calc(100% - 10px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 2rem;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.text};
  }

  option {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.text};
  }
`;

const NumberFormatSection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
  max-width: 22rem;
`;

const NumberFormatLabel = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const NumberFormatSelect = styled.select`
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image:
    linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position:
    calc(100% - 15px) center,
    calc(100% - 10px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 2rem;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.text};
  }

  option {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.text};
  }
`;

const CurrencySection = styled.div`
  margin: 0 auto ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
  max-width: 22rem;
`;

const CurrencyLabel = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
  text-align: center;
`;

const CurrencySelect = styled.select`
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image:
    linear-gradient(
      45deg,
      transparent 50%,
      ${({ theme }) => theme.color.text} 50%
    ),
    linear-gradient(
      135deg,
      ${({ theme }) => theme.color.text} 50%,
      transparent 50%
    );
  background-position:
    calc(100% - 15px) center,
    calc(100% - 10px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 2rem;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.text};
  }

  option {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.text};
  }
`;


/* Settings search — sits above the groups in Preferences */
const SettingsSearch = styled.input`
  width: 100%;
  box-sizing: border-box;
  margin-bottom: ${({ theme }) => theme.spacing.medium}rem;
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.scale * 4}rem;
  transition: border-color 0.15s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const SettingsNoMatch = styled.div`
  padding: ${({ theme }) => theme.spacing.medium}rem 0;
  font-size: 0.8125rem;
  text-align: center;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// The two quiet "how does this work" links at the foot of Preferences
const HelpHintRow = styled.div`
  display: flex;
  align-items: stretch;
  gap: ${({ theme }) => theme.spacing.medium}rem;
  margin-top: ${({ theme }) => theme.spacing.medium}rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

// Quiet pointer to the shortcut list, at the foot of Preferences
const ShortcutsHint = styled.button.attrs({ type: "button" })`
  display: block;
  flex: 1;
  padding: ${({ theme }) => theme.spacing.small}rem 0;
  background: transparent;
  border: none;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;
