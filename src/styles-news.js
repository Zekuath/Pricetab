/* NEWS PANEL STYLES
 *
 * Split out of `news.js` the way `styles-alerts` was split out of `alerts.js`:
 * the component is the behaviour, this is the look, and neither has to be
 * scrolled past to read the other.
 *
 * **A newswire's rows** (30 Sep 2026). The list was a table without a
 * `<table>` — age, source and headline in three columns — and at 1440 the two
 * narrow columns took 185px from every row while the headline ran to 110
 * characters a line. Each row is now one left edge: the newsroom and the age
 * on a line of small capitals, the headline under it at a size meant to be
 * read, two lines of summary, then what the story is about. The feed keeps a
 * reading measure (NewsBody) and the controls are trays (NewsScopeRow). Every
 * hook the checks read is where it was: the row is the link, its text starts
 * with the age, the fold is the link's sibling.
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
  align-items: stretch;
  justify-content: stretch;
  /* **The window, like Settings** (26 Sep 2026, *"news kısmının tasarımını
     da elden geçir… aynı şekilde base rate'i de"*): no rim and no card in the
     middle of it. The screens share one head, one left edge and one ground
     now, so moving between them is a change of content, not of furniture. */
  padding: 0;
  /* **Opaque, and the chart is not behind it.**
     It was 85% white over 90% black, with the price line showing through as a
     ghost. Asked for on 23 Sep 2026: *"arka planda bizim ana grafik
     görünmesin… her bir tab'ı tam ekranda yapabiliriz"*. A panel that covers
     the screen and still shows the chart is neither one thing nor the other —
     the chart cannot be read through it and its own content is competing with
     a line. These are screens now, in the app's own ground. */
  background: ${({ theme }) => theme.color.bg};
  ${besideScreenSpine};
`;

/* A reading room, not a card. It was a 56rem card in the middle of the
 * window; asked for as "tam ekran" on 21 Sep 2026 it takes the window less
 * a margin, and the width bought a second column: the feed on the left, and
 * on the right what the feed adds up to — the tone of what is on screen,
 * which of your coins the stories name, every source with when it last
 * spoke, and the permission line. Under 1100px the column stands down and
 * the panel is the list it was. */
const NewsCard = styled.div`
  display: flex;
  flex-direction: column;
  /* **A screen, not a dialog** — 23 Sep 2026, *"her bir tab'i tam ekranda
     yapabiliriz"*. A border, a radius and a drop shadow all mean the same
     thing: a layer floating above a page. Once the ground behind is opaque
     there is no page under it, so the three of them draw an outline around
     nothing — which is exactly what the panel looked like. The surface
     reaches the window instead and keeps only its fill, which is what the
     white controls inside it are read against. */
  width: 100%;
  /* Only the list scrolls, so the search box and the source chips stay
     reachable at two hundred stories. */
  height: 100vh;
  background: ${({ theme }) => theme.color.bg};
  overflow: hidden;
  animation: ${newsIn} 0.2s cubic-bezier(0.22, 1, 0.36, 1);
`;

/* Settings' head, to the pixel: the same padding, rule, left edge and the
   name in the same small capitals. */
const NewsHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 1.8rem 2.5rem 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  @media (max-width: 600px) {
    padding: 1rem;
  }
`;

const NewsTitle = styled.h2`
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

const NewsCount = styled.div`
  flex: 1;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The two halves under the controls: the feed, and the column beside it. */
const NewsBody = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);

  /* The feed at a reading measure and the column beside it (30 Sep 2026):
     at 1440 the feed took 1,000px and a summary ran to 110 characters a
     line. Whatever the window has left over sits past the column, on the
     screens' own left edge. */
  @media (min-width: 1100px) {
    grid-template-columns: minmax(0, 54rem) 21rem;
    justify-content: start;
  }
`;

const NewsMain = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;

/* What the feed adds up to. Scrolls on its own, so a long source table never
   pushes the tone tiles off; hidden under 1100px, where the chips already
   carry every source's state and the permission line sits under the list. */
const NewsAside = styled.aside`
  display: none;
  min-height: 0;
  overflow-y: auto;
  border-left: 1px solid ${({ theme }) => theme.color.border};
  border-top: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bg};
  ${themedScrollbar};

  @media (min-width: 1100px) {
    display: block;
  }

  /* The permission card and its lines keep the column's own inset here —
     under the list, where they also appear, they keep the list's — and the
     section above already draws the rule between them. */
  [data-news-access] {
    padding-left: 1rem;
    padding-right: 1rem;
    border-top: none;
  }
`;

/* The permission line under the list, only while the aside is not drawn. */
const NewsFootOnly = styled.div`
  @media (min-width: 1100px) {
    display: none;
  }
`;

const NewsAsideSection = styled.section`
  padding: 0.85rem 1rem 0.9rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
`;

const NewsAsideLabel = styled.div`
  margin-bottom: 0.55rem;
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const NewsAsideNote = styled.div`
  margin-top: 0.5rem;
  font-size: 0.62rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* Three figures over three labels — the scoreboard's shape, brought here. */
const NewsFacts = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  overflow: hidden;
`;

const NewsFact = styled.div`
  padding: 0.5rem 0.6rem 0.45rem;
  & + & {
    border-left: 1px solid ${({ theme }) => theme.color.border};
  }
`;

const NewsFactValue = styled.div`
  font-size: 0.95rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: ${({ theme }) => theme.color.text};
`;

const NewsFactLabel = styled.div`
  margin-top: 0.15rem;
  font-size: 0.56rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* Your coins, each with how many rows name it. A press narrows the search
   to that symbol — the box is the one filter that can say a coin's name. */
const NewsCoinRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
`;

const NewsCoinBtn = styled.button.attrs({ type: "button" })`
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.18rem 0.45rem;
  border: 1px solid ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 6px;
  background: transparent;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.62rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
  ${touchTarget};
`;

const NewsCoinCount = styled.span`
  font-weight: ${({ theme }) => theme.fontWeight.regular};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* Every source asked, one line each: name, when it last spoke, its state. */
const NewsSourceRow = styled.button.attrs({ type: "button" })`
  display: grid;
  grid-template-columns: 0.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
  width: calc(100% + 1rem);
  margin: 0 -0.5rem;
  padding: 0.34rem 0.5rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.68rem;
  text-align: left;
  color: ${({ theme, off }) => (off ? theme.color.textSecondary : theme.color.text)};
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.color.bgSecondary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.borderHover};
    outline-offset: -2px;
  }
  ${touchTarget};
`;

/* On or off, drawn: a filled dot for a source in the list, a ring for one
   switched off — with the name struck through as well, so neither the dot
   nor the colour carries it alone. */
const NewsSourceDot = styled.span`
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  box-sizing: border-box;
  border: 1px solid ${({ theme, off }) => (off ? theme.color.borderHover : theme.color.text)};
  background: ${({ theme, off }) => (off ? "transparent" : theme.color.text)};
  opacity: ${({ off }) => (off ? 1 : 0.7)};
`;

const NewsSourceName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: ${({ off }) => (off ? "line-through" : "none")};
`;

const NewsSourceState = styled.span`
  font-size: 0.64rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: ${({ theme, warn }) => (warn ? theme.color.chartLineRed : theme.color.textSecondary)};
`;

const NewsControls = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.55rem 0.75rem;
  padding: 0.85rem 2.5rem;

  /* The same width as the feed and its column below, so the last control
     ends where the column's words do. */
  @media (min-width: 1100px) {
    box-sizing: border-box;
    max-width: 75rem;
    padding-right: 1rem;
  }

  @media (max-width: 600px) {
    gap: 0.5rem;
    padding: 0.75rem 1rem;
  }
`;

const NewsSearch = styled.input`
  flex: 1 1 13rem;
  max-width: 22rem;
  min-width: 0;
  height: 2rem;
  box-sizing: border-box;
  padding: 0 0.75rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.74rem;
  color: ${({ theme }) => theme.color.text};
  /* A field on the page's own ground takes the secondary fill, as Settings'
     search does; it was white on a grey card. */
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid transparent;
  border-radius: 8px;
  transition: border-color 0.15s ease, background 0.15s ease;

  &::placeholder {
    color: ${({ theme }) => theme.color.textSecondary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
    background: ${({ theme }) => theme.color.bg};
  }

  @media (max-width: 600px) {
    flex-basis: 100%;
    max-width: none;
  }
`;

/* **A segmented control, not a row of pills** (30 Sep 2026). Three groups of
 * black-filled pills — scope, wording, order — made the defaults the loudest
 * thing on the screen and wrapped mid-label at 1100px ("Any / wording"). One
 * tray per question, the chosen answer lifted out of it; a group wraps whole,
 * never inside a label. */
/* **A segmented control, not a row of pills** (30 Sep 2026). Three groups of
 * black-filled pills — scope, wording, order — made the defaults the loudest
 * thing on the screen and wrapped mid-label at 1100px ("Any / wording"). One
 * tray per question, the chosen answer lifted out of it; a group wraps whole,
 * never inside a label. The wording and order trays (wide) give way to two
 * selects on a phone, where a third and fourth tray would take two lines. */
const NewsScopeRow = styled.div`
  display: inline-flex;
  flex: none;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: ${({ theme }) => theme.color.bgSecondary};
  visibility: ${({ idle }) => (idle ? "hidden" : "visible")};

  @media (max-width: 600px) {
    display: ${({ wide }) => (wide ? "none" : "inline-flex")};
  }
`;

/* The wording and the order as two selects, on a phone only. */
const NewsSelectRow = styled.div`
  display: none;

  @media (max-width: 600px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    flex-basis: 100%;
  }
`;

const NewsSelect = styled.select`
  visibility: ${({ idle }) => (idle ? "hidden" : "visible")};
  height: 2rem;
  min-width: 0;
  padding: 0 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid transparent;
  border-radius: 8px;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.borderHover};
    outline-offset: 1px;
  }
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

/* The saved view's chip sits apart from the scope it is not part of. */
/* Pushes what follows it to the row's right end where the row has room. */
/* Where the row holds everything (from 1220px) this pushes the wording and
   the order to its right end; narrower, it is the line break that puts them
   on a line of their own together, rather than leaving the order alone on
   the second line. */
const NewsSavedSplit = styled.span`
  flex: 1 1 0;
  min-width: 0;

  @media (max-width: 1219px) {
    flex-basis: 100%;
    height: 0;
  }

  @media (max-width: 600px) {
    display: none;
  }
`;

const NewsScopeBtn = styled.button.attrs({ type: "button" })`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 1.75rem;
  padding: 0 0.7rem;
  border: 0;
  border-radius: 6px;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  white-space: nowrap;
  background: ${({ theme, active }) =>
    active ? (theme.color.bg === "#ffffff" ? "#ffffff" : "rgba(255, 255, 255, 0.12)") : "transparent"};
  color: ${({ theme, active }) => (active ? theme.color.text : theme.color.textSecondary)};
  box-shadow: ${({ theme, active }) =>
    active ? `0 1px 2px ${theme.color.shadow}, 0 0 0 1px ${theme.color.border}` : "none"};
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.borderHover};
    outline-offset: 1px;
  }

  @media (max-width: 600px) {
    padding: 0 0.55rem;
  }
  ${touchTarget};
`;

const NewsChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 0 2.5rem 0.85rem;

  @media (max-width: 600px) {
    padding: 0 1rem 0.7rem;
  }

  /* From 1100px every source is a line in the column beside the feed, with
     its age and its switch, so the chips would be the same list twice. */
  @media (min-width: 1100px) {
    display: none;
  }
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
  ${touchTarget};

  /* A finger's height on a phone, where these are the sources' only switches */
  @media (max-width: 600px) {
    min-height: 2rem;
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
  /* The headline is what the eye runs down: a step up from everything else
     in the row, at a size meant to be read rather than scanned past. */
  font-size: 0.94rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  line-height: 1.4;
  color: ${({ theme }) => theme.color.text};
  /* The line is declared here and lit by the row below — see the comment on
     the row. Always present, transparent until reached for, so the row never
     twitches as the pointer runs down the list. */
  ${hoverUnderline};
`;

/* The headline, the summary under it and what the story is about. What a
 * feed already hands over and the panel was discarding is a summary — RSS
 * calls it description, WordPress calls it excerpt — so the headline carries
 * the sentence that says whether the story is worth the click. The coin marks
 * answer the other question a filtered list raises: which of the coins you
 * follow this row is here for.
 */
const NewsRowBody = styled.span`
  display: block;
  min-width: 0;
`;

/* Two lines, and the clamp is the point: three would make the list a column of
   paragraphs and lose the thing a list is for, which is scanning it. */
const NewsRowSummary = styled.span`
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 0.3rem;
  font-size: 0.76rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const NewsRowCoins = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.6rem;
  margin-top: 0.5rem;
`;

const NewsRowCoin = styled.span`
  font-size: 0.62rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.06em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
`;

/* The tone mark, beside the coin chips. Secondary ink and never green or
   red: those two mean a price went up or down on the same screen, and a
   headline "worded down" is a count of words, not a fall. The words it
   counted are the tooltip, so the mark can be argued with. */
const NewsRowTone = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  font-size: 0.64rem;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The row's edges, in one place.
 *
 * A clustered story draws a second line under its headline naming the other
 * newsrooms, and that line has to start exactly where the headline starts or
 * the list develops a second left edge. Interpolating one fragment into both
 * is how this codebase already shares a look across two elements — there is no
 * `as` prop in styled-components 3.4.6 — so the two cannot drift apart. The
 * right padding holds the bookmark. */
const newsRowGrid = css`
  display: block;
  padding: 0.9rem 3.5rem 0.9rem 2.5rem;

  @media (max-width: 620px) {
    padding: 0.8rem 2.75rem 0.8rem 1rem;
  }
`;

/* The row and its bookmark (27 Sep 2026). The row is a link, and a button
   inside a link is two controls in one — a press on the bookmark would open
   the story too — so the button sits beside the row in a wrapper, over the
   row's own right-hand padding, which is widened to hold it. */
const NewsSaveBtn = styled.button.attrs({ type: "button" })`
  position: absolute;
  top: 0.6rem;
  right: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ on, theme }) => (on ? theme.color.text : theme.color.textSecondary)};
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease,
    opacity 0.15s ease;

  /* Thirty bookmarks at full ink are thirty more things in a column meant for
     headlines: at rest one is a faint mark, and it comes up with its row.
     Only where there is a pointer to come up for — on a touch screen it
     stays at full ink, and a kept story always does. */
  @media (hover: hover) {
    opacity: ${({ on }) => (on ? 1 : 0.4)};
  }

  &:hover,
  &:focus-visible {
    opacity: 1;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bgSecondary};
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }

  @media (max-width: 620px) {
    right: 0.5rem;
  }
  ${touchTarget};
`;

const NewsRow = styled.a`
  ${newsRowGrid};
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid ${({ theme }) => theme.color.border}55;
  transition: background 0.15s ease;

  /* The headline is the part that says it is a link, and only the headline:
   * underlining the source and the age as well would turn one line of type
   * into three links. The row keeps its background change — that says
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

  /* A headline already opened steps back to the secondary ink (29 Sep 2026),
     the one thing a reader scanning a list for what is new cannot otherwise
     tell. It is the browser's own history, read by the browser — nothing is
     stored here — and only colour, the one property :visited may change. */
  &:visited ${NewsRowTitle} {
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* A day's heading in the list (29 Sep 2026), with how many stories the day
   holds (30 Sep 2026). */
const NewsDay = styled.div`
  /* Held at the top of the list while its day scrolls under it, so a row
     deep in yesterday still says it is yesterday's. A hairline, no shadow —
     a shadow over the list reads as the edge of a scrollbar. */
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 3.5rem 0.45rem 2.5rem;
  background: ${({ theme }) => theme.color.bg};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.62rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.text};

  @media (max-width: 620px) {
    padding: 0.6rem 1rem 0.4rem;
  }
`;

// How many stories the day holds, at the heading's right
const NewsDayCount = styled.span`
  font-weight: ${({ theme }) => theme.fontWeight.regular};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The small print beside the chips: how many points a discussion had. */
const NewsRowMeta = styled.span`
  font-size: 0.64rem;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const NewsSavable = styled.div`
  position: relative;

  &:hover ${NewsSaveBtn} {
    opacity: 1;
  }
`;

/* The newswire's line over the headline: the newsroom, then how long ago.
   The age is first in the document — it is what a row is read by, and what
   the row's accessible text starts with — and drawn second. */
const NewsRowLead = styled.span`
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  margin-bottom: 0.3rem;
  font-size: 0.64rem;
  line-height: 1.3;
`;

const NewsRowAge = styled.span`
  order: 2;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.textSecondary};

  &::before {
    content: "·";
    margin-right: 0.45rem;
  }
`;

const NewsRowSource = styled.span`
  order: 1;
  min-width: 0;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  /* A cluster holds its head row's bookmark itself, so the head row stays
     the cluster's own child (see NewsSavable for a lone row). */
  position: relative;

  ${NewsRow} {
    border-bottom: none;
  }

  /* The pointer anywhere over the cluster lights the whole cluster, including
     the second line: it is one story, so it should not look like two rows that
     happen to be adjacent. */
  &:hover ${NewsRow} {
    background: ${({ theme }) => theme.color.bgSecondary};
  }

  &:hover ${NewsSaveBtn} {
    opacity: 1;
  }
`;

const NewsAlso = styled.div`
  ${newsRowGrid};
  padding-top: 0;
  padding-bottom: 0.8rem;
  margin-top: -0.35rem;
  transition: background 0.15s ease;

  ${NewsCluster}:hover & {
    background: ${({ theme }) => theme.color.bgSecondary};
  }
`;

/* The other newsrooms, on the headline's own left edge (newsRowGrid). */
const NewsAlsoLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.55rem;
  font-size: 0.64rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* How many newsrooms ran it, which is the thing a list of names does not say
   at a glance. Four outlets covering something is the story being big, and
   that is a fact about the news rather than about this panel. */
const NewsAlsoCount = styled.span`
  font-size: 0.62rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.04em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  white-space: nowrap;
`;

/* Not a link, because there is nothing single to point it at. */
const NewsAlsoRest = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.64rem;
`;

const NewsAlsoLink = styled.a`
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.64rem;
  letter-spacing: 0.04em;
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
  padding: 0.55rem clamp(1rem, 3vw, 2.5rem) 0.35rem;

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
  padding: 0.7rem clamp(1rem, 3vw, 2.5rem) 0.75rem;
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

/* How rare the step was, counted on the chart in view — the line that
   stops "−0.06%" reading as noise on an hour's chart. */
const NewsUnusualRare = styled.div`
  font-size: 0.64rem;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.3rem;
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
`;

/* **The one control in this section**, and it is a link out of the panel
 * rather than a filter inside it: the moment being described is drawn on the
 * chart behind you, and until this existed nothing said so. Quiet — the
 * section's subject is the headlines, and this is the footnote that gets you
 * to the picture. */
const NewsUnusualGo = styled.button.attrs({ type: "button" })`
  margin-top: 0.55rem;
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

const NewsEmpty = styled.div`
  max-width: 40rem;
  padding: 2rem 2.5rem;
  font-size: 0.78rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.color.textSecondary};

  @media (max-width: 620px) {
    padding: 1.5rem 1rem;
  }
`;

const NewsStale = styled.div`
  padding: 0.6rem clamp(1rem, 3vw, 2.5rem);
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.66rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* The permission card. It is a card and not a line of small print because it
 * is asking for something, and a request has to say what it wants, what it
 * does not want, and how to undo it — in that order, before the button. */
const NewsAccessCard = styled.div.attrs({ "data-news-access": "card" })`
  padding: 0.9rem clamp(1rem, 3vw, 2.5rem) 1rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bg};
`;

const NewsAccessTitle = styled.div`
  font-size: 0.78rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
  margin-bottom: 0.4rem;
`;

const NewsAccessBody = styled.p`
  margin: 0 0 0.5rem;
  font-size: 0.68rem;
  line-height: 1.55;
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

const NewsAccessRow = styled.div.attrs({ "data-news-access": "row" })`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem clamp(1rem, 3vw, 2.5rem);
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
/* The quiet way to the permissions once the ask has been put away: a
   text-shaped button to Settings → Permissions, not a second ask. */
const NewsAccessLink = styled.button.attrs({ type: "button" })`
  border: none;
  background: transparent;
  padding: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  color: ${({ theme }) => theme.color.text};
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  ${touchTarget};
`;

const NewsAccessOff = styled.button.attrs({ type: "button" })`
  ${newsPill};
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};

  &:hover {
    color: ${({ theme }) => theme.color.chartLineRed};
    border-color: ${({ theme }) => theme.color.chartLineRed};
  }
`;
