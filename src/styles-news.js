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
  display: block;
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
/* Column three is a block now, not a line.
 *
 * The row was age / source / headline and nothing else. What a feed already
 * hands over and the panel was discarding is a summary — RSS calls it
 * description, WordPress calls it excerpt — so the headline gained the sentence
 * under it that says whether the story is worth the click. The coin chips
 * answer the other question a filtered list raises: which of the coins you
 * follow this row is here for.
 */
const NewsRowBody = styled.span`
  display: block;
  min-width: 0;

  @media (max-width: 620px) {
    grid-column: 2;
  }
`;

/* Two lines, and the clamp is the point: three would make the list a column of
   paragraphs and lose the thing a list is for, which is scanning it. */
const NewsRowSummary = styled.span`
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 0.22rem;
  font-size: 0.72rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const NewsRowCoins = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  margin-top: 0.34rem;
`;

const NewsRowCoin = styled.span`
  font-size: 0.56rem;
  letter-spacing: 0.09em;
  padding: 0.06rem 0.32rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 0.3rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The row's three columns, in one place.
 *
 * A clustered story draws a second line under its headline naming the other
 * newsrooms, and that line has to start exactly where the headline starts or
 * the list develops a second left edge. Interpolating one fragment into both
 * is how this codebase already shares a look across two elements — there is no
 * `as` prop in styled-components 3.4.6 — and it means the alignment cannot
 * drift when the columns are next adjusted, including at the breakpoint where
 * the source folds under the age. */
const newsRowGrid = css`
  display: grid;
  grid-template-columns: 2.6rem 8.5rem minmax(0, 1fr);
  gap: 0.7rem;
  padding: 0.5rem 1.1rem;

  @media (max-width: 620px) {
    /* The source folds under the age rather than squeezing the headline into
       a column two words wide */
    grid-template-columns: 2.6rem minmax(0, 1fr);
  }
`;

const NewsRow = styled.a`
  ${newsRowGrid};
  align-items: baseline;
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

/* A story four newsrooms ran is one row, and the other three are named under
 * it — see clusterNewsItems in api.js for how two headlines are judged the
 * same story, and why the threshold errs towards leaving them apart.
 *
 * They are links, not text. The whole promise of the fold is that nothing is
 * discarded, and a newsroom you can read the name of but not the article is
 * discarded with extra steps. That is also why this wrapper exists at all: the
 * row is an anchor, an anchor cannot contain another anchor, so the second
 * line has to be its sibling. The border moves out here with it, or the fold
 * would draw a rule through the middle of one story.
 */
const NewsCluster = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.color.border}55;

  ${NewsRow} {
    border-bottom: none;
  }

  /* The pointer anywhere over the cluster lights the whole cluster, including
     the second line: it is one story, so it should not look like two rows that
     happen to be adjacent. */
  &:hover ${NewsRow} {
    background: ${({ theme }) => theme.color.bgSecondary};
  }
`;

const NewsAlso = styled.div`
  ${newsRowGrid};
  align-items: baseline;
  padding-top: 0;
  padding-bottom: 0.5rem;
  margin-top: -0.15rem;

  ${NewsCluster}:hover & {
    background: ${({ theme }) => theme.color.bgSecondary};
  }
`;

/* The line sits in the headline's column. Its first two grid cells are left
   empty rather than collapsed, which is what keeps it aligned at both
   breakpoints without either block knowing about the other. */
const NewsAlsoLine = styled.div`
  grid-column: 3;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.5rem;
  font-size: 0.62rem;
  color: ${({ theme }) => theme.color.textSecondary};

  @media (max-width: 620px) {
    grid-column: 2;
  }
`;

/* How many newsrooms ran it, which is the thing a list of names does not say
   at a glance. Four outlets covering something is the story being big, and
   that is a fact about the news rather than about this panel. */
const NewsAlsoCount = styled.span`
  font-size: 0.56rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  padding: 0.06rem 0.34rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 0.3rem;
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
`;

/* Not a link, because there is nothing single to point it at. */
const NewsAlsoRest = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.58rem;
  letter-spacing: 0.06em;
  opacity: 0.8;
`;

const NewsAlsoLink = styled.a`
  color: ${({ theme }) => theme.color.textSecondary};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.58rem;
  ${hoverUnderline};

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
  }

  &:focus-visible {
    outline: none;
  }
`;

/* ── The line between new and already-read ───────────────────────────────
 *
 * A rule with the words sitting on it, rather than a coloured band down the
 * new rows. A band would be a second thing competing with the coin chips and
 * the source names for the same glance, and it would have to be a colour —
 * every colour in this palette already means something (up, down, "you are on
 * this"). A rule means one thing and means it in one place.
 *
 * It scrolls with the list on purpose. Pinned, it would be a permanent
 * announcement; in the flow it is a mark you pass once and then leave behind,
 * which is what it is for. */
const NewsDivider = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 1.1rem 0.35rem;

  &::before,
  &::after {
    content: "";
    height: 1px;
    background: ${({ theme }) => theme.color.border};
  }

  &::before {
    width: 1.4rem;
    flex: none;
  }

  &::after {
    flex: 1;
  }
`;

const NewsDividerText = styled.span`
  font-size: 0.56rem;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
`;

/* ── What the coin on the chart just did ─────────────────────────────────
 *
 * Above the list and outside it, because it is not a row: the list is sorted
 * by time and filtered by your scope, and this answers a different question
 * that neither of those controls governs. Inside the list it would be a row
 * that ignores the filters, which is the kind of exception that makes a list
 * stop being trustworthy.
 *
 * See `unusualNow` in news.js for what "unusual" means here and why the
 * section is absent rather than empty when there is nothing to say. */
const NewsUnusual = styled.div`
  padding: 0.7rem 1.1rem 0.75rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
`;

const NewsUnusualHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
`;

/* Green and red here are the same green and red as everywhere else — this is
   a price move, which is exactly what those two colours mean in this app. The
   written sign carries it as well, so colour is never alone. */
const NewsUnusualMove = styled.span`
  font-size: 0.86rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  font-variant-numeric: tabular-nums;
  color: ${({ up, theme }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};
`;

const NewsUnusualWhat = styled.span`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.color.text};
`;

const NewsUnusualList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  margin-top: 0.5rem;
`;

const NewsUnusualLink = styled.a`
  font-size: 0.72rem;
  line-height: 1.35;
  color: ${({ theme }) => theme.color.text};
  ${hoverUnderline};

  &:focus-visible {
    outline: none;
  }
`;

const NewsUnusualNone = styled.div`
  font-size: 0.68rem;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.45rem;
`;

const NewsUnusualNote = styled.div`
  font-size: 0.6rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.5rem;
  opacity: 0.85;
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
