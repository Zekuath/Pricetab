/* NEWS PANEL STYLES
 *
 * Split out of `news.js` the way `styles-alerts` was split out of `alerts.js`:
 * the component is the behaviour, this is the look, and neither has to be
 * scrolled past to read the other.
 *
 * The list is a **table without being a `<table>`**: three columns — age,
 * source, headline — on a fixed grid, so the eye runs down the left-hand
 * edges instead of hunting for where each line starts. That is the one thing a
 * terminal does that a scrolling ticker cannot, and it is why this is a panel.
 */
const newsIn = keyframes`
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// Same wash the targets panel uses, so the two read as the same kind of thing
const NewsOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.85)"
      : "rgba(0, 0, 0, 0.88)"};
`;

const NewsCard = styled.div`
  display: flex;
  flex-direction: column;
  width: min(56rem, 100%);
  /* Tall, but never taller than the window: only the list scrolls, so the
     search box and the source chips stay reachable at two hundred stories */
  max-height: min(44rem, calc(100vh - 3rem));
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 14px;
  box-shadow: 0 8px 32px ${({ theme }) => theme.color.shadow};
  overflow: hidden;
  animation: ${newsIn} 0.2s cubic-bezier(0.22, 1, 0.36, 1);
`;

const NewsHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 1rem 1.1rem 0.75rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
`;

const NewsTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.color.text};
`;

const NewsCount = styled.div`
  flex: 1;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const NewsClose = styled.button.attrs({ type: "button" })`
  border: none;
  background: transparent;
  padding: 0 0.15rem;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  color: ${({ theme }) => theme.color.textSecondary};

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
  }
`;

const NewsControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  padding: 0.7rem 1.1rem;
`;

const NewsSearch = styled.input`
  flex: 1 1 12rem;
  min-width: 0;
  padding: 0.4rem 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.78rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 6px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const NewsScopeRow = styled.div`
  display: flex;
  gap: 0.25rem;
`;

/* One pressed state shared by the scope buttons and the source chips, so the
 * two rows read as the same kind of control rather than as two inventions. */
const newsPill = css`
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  padding: 0.28rem 0.62rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.borderHover};
    outline-offset: 2px;
  }
`;

const NewsScopeBtn = styled.button.attrs({ type: "button" })`
  ${newsPill};
  background: ${({ theme, active }) =>
    active ? theme.color.text : "transparent"};
  color: ${({ theme, active }) =>
    active ? theme.color.bg : theme.color.textSecondary};

  &:hover {
    color: ${({ theme, active }) =>
      active ? theme.color.bg : theme.color.text};
  }
`;

const NewsChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 0 1.1rem 0.7rem;
`;

/* Off is a real state, not a dimmer one: a chip you have switched off has to
 * look switched off from across the room, or the panel looks like it has lost
 * a source rather than hidden one. */
const NewsChip = styled.button.attrs({ type: "button" })`
  ${newsPill};
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  background: transparent;
  color: ${({ theme, active }) =>
    active ? theme.color.text : theme.color.textSecondary};
  opacity: ${({ active }) => (active ? 1 : 0.45)};
  text-decoration: ${({ active }) => (active ? "none" : "line-through")};

  &:hover {
    opacity: 1;
  }
`;

/* The age on a source that has stopped publishing. It carries the down colour
 * rather than the text colour, because it is the one thing on this panel that
 * is a warning: everything else here is a headline or a control, and a stale
 * feed reading exactly like a live one is the failure this panel was built
 * for. Not a colour on its own — the number is the message, and the colour
 * only makes it findable. */
const NewsChipAge = styled.span`
  font-size: 0.58rem;
  color: ${({ theme }) => theme.color.chartLineRed};
  opacity: 0.9;
`;

const NewsList = styled.div`
  flex: 1;
  min-height: 6rem;
  overflow-y: auto;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  ${themedScrollbar};

  /* The list ends by fading rather than by being sliced — the same treatment
   * the targets panel uses, and for the same reason: a headline cut in half by
   * the card's edge reads as content jammed against a wall. Only at the
   * bottom here, because the top of this list is a hard rule under the source
   * chips and a fade there would blur that edge into them. */
  mask-image: linear-gradient(
    to bottom,
    #000 0,
    #000 calc(100% - 14px),
    transparent 100%
  );
`;

const NewsRowTitle = styled.span`
  font-size: 0.82rem;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.text};
  /* The line is declared here and lit by the row below — see the comment on
     the row. Always present, transparent until reached for, so the row never
     twitches as the pointer runs down the list. */
  ${hoverUnderline};

  @media (max-width: 620px) {
    grid-column: 2;
  }
`;

/* The three-column grid. `minmax(0, 1fr)` on the headline rather than `1fr`,
 * or a long unbroken title pushes the whole row wider than the card and the
 * age column slides off the left. */
const NewsRow = styled.a`
  display: grid;
  grid-template-columns: 2.6rem 8.5rem minmax(0, 1fr);
  gap: 0.7rem;
  align-items: baseline;
  padding: 0.5rem 1.1rem;
  text-decoration: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.border}55;

  /* The headline is the part that says it is a link, and only the headline:
   * underlining the age and the source as well would turn a three-column
   * table into three links. The row keeps its background change — that says
   * *which* row, this says *what it does*. Named through a component selector
   * so the whole row stays the hit area, which is why the title component is
   * defined above this one rather than below it. */
  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.bgSecondary};
  }

  &:hover ${NewsRowTitle},
  &:focus-visible ${NewsRowTitle} {
    text-decoration-color: currentColor;
  }

  &:focus-visible {
    outline: none;
  }

  @media (max-width: 620px) {
    /* The source folds under the age rather than squeezing the headline into
       a column two words wide */
    grid-template-columns: 2.6rem minmax(0, 1fr);
  }
`;

const NewsRowAge = styled.span`
  font-size: 0.62rem;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.color.textSecondary};
  text-align: right;
`;

const NewsRowSource = styled.span`
  font-size: 0.6rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 620px) {
    grid-column: 2;
  }
`;

const NewsEmpty = styled.div`
  padding: 2rem 1.1rem;
  text-align: center;
  font-size: 0.8rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const NewsStale = styled.div`
  padding: 0.6rem 1.1rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.66rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The permission card. It is a card and not a line of small print because it
 * is asking for something, and a request has to say what it wants, what it
 * does not want, and how to undo it — in that order, before the button. */
const NewsAccessCard = styled.div`
  padding: 0.9rem 1.1rem 1rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bg};
`;

const NewsAccessTitle = styled.div`
  font-size: 0.82rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
  margin-bottom: 0.35rem;
`;

const NewsAccessBody = styled.p`
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const NewsAccessBtn = styled.button.attrs({ type: "button" })`
  ${newsPill};
  padding: 0.4rem 0.9rem;
  font-size: 0.72rem;
  background: ${({ theme }) => theme.color.text};
  color: ${({ theme }) => theme.color.bg};

  &[disabled] {
    opacity: 0.55;
    cursor: default;
  }
`;

const NewsAccessRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 1.1rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

/* Takes the slack, so that with three children in the row — note, "allow the
 * rest", "turn off" — the two buttons group at the right instead of the middle
 * one floating between them. */
const NewsAccessNote = styled.div`
  flex: 1;
  min-width: 0;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The way out, as plainly as the way in. A switch whose two directions look
 * nothing alike reads as one you are meant to use once — the same rule the
 * calls panel's own off-button follows. */
const NewsAccessOff = styled.button.attrs({ type: "button" })`
  ${newsPill};
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};

  &:hover {
    color: ${({ theme }) => theme.color.chartLineRed};
    border-color: ${({ theme }) => theme.color.chartLineRed};
  }
`;
