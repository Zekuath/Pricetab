const panelLift = keyframes`
  from { transform: translateY(24px) scale(0.95); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
`;

/* **SETTINGS IS A SCREEN** (26 Sep 2026, *"setting kısmını tam ekran haline
 * getir ve düzenle, artık gereksiz olanlar değişsin ve tasarımsal olarak daha
 * iyi bir noktaya getir"*).
 *
 * It had two sizes — a card over the chart and the window — and a switch in
 * Basics to pick between them, three tabs across the top under a centred
 * title, a row of group chips, and the groups as accordions in two columns.
 * Each of those was an answer to "thirty settings do not fit": the chips
 * because five collapsed headings name five groups and nothing else, the
 * columns because one column at full width was three screens of scrolling,
 * the accordions because every group open was one long wall.
 *
 * One answer replaces all four: **a menu down the left and one section at a
 * time on the right.** The menu names every section with its count, which
 * is what the chips were for; a section is short enough to read as a page,
 * which is what the accordions and the columns were for; and a screen has no
 * second size to offer, so the switch that chose one went too. The search
 * stays, at the head of the menu, and answers across every section. */
const SettingsCard = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.bg};
  text-align: left;
  animation: ${panelLift} 0.4s ease;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  overflow: hidden;
  position: relative;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/* The screen's head: its name on the left edge of the menu below it, and a
 * hairline under both. Room above for the offline and API-error banners,
 * which are fixed over everything (OfflineMessage, styles-app.js). */
const SettingsHead = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.medium}rem;
  padding: ${({ theme }) => theme.spacing.large * 0.9}rem
    ${({ theme }) => theme.spacing.large * 1.25}rem
    ${({ theme }) => theme.spacing.medium}rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  @media (max-width: 600px) {
    padding: ${({ theme }) => theme.spacing.medium}rem;
  }
`;

const SettingsLayout = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;

  @media (max-width: 900px) {
    flex-direction: column;
  }
`;

/* **The menu.** One button per section, in the order a person meets them:
 * the coins first, then the modes that move many settings at once, then the
 * groups, then what the extension may reach. A caption names each part; the
 * count beside a group is what it holds, so how much is behind a name is read
 * rather than found out. Under 900px it becomes a row above the section,
 * wrapping, with the captions and the foot put away. */
const SettingsNav = styled.nav`
  flex: 0 0 15.5rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.medium}rem
    ${({ theme }) => theme.spacing.medium}rem
    ${({ theme }) => theme.spacing.large}rem
    ${({ theme }) => theme.spacing.large * 1.25}rem;
  border-right: 1px solid ${({ theme }) => theme.color.border};
  ${themedScrollbar};

  @media (max-width: 900px) {
    flex: 0 0 auto;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px;
    overflow: visible;
    padding: ${({ theme }) => theme.spacing.small}rem
      ${({ theme }) => theme.spacing.medium}rem;
    border-right: none;
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
  }
`;

const SettingsNavCaption = styled.div`
  margin: ${({ theme }) => theme.spacing.medium}rem 0 0.3rem 0.6rem;
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};

  @media (max-width: 900px) {
    display: none;
  }
`;

const SettingsNavItem = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: none;
  border-radius: 7px;
  background: ${({ active, theme }) =>
    active ? theme.color.bgSecondary : "transparent"};
  color: ${({ active, theme }) =>
    active ? theme.color.text : theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.8rem;
  font-weight: ${({ active, theme }) =>
    active ? theme.fontWeight.semibold : theme.fontWeight.regular};
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.bgSecondary};
    color: ${({ theme }) => theme.color.text};
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }

  @media (max-width: 900px) {
    width: auto;
    padding: 0.35rem 0.6rem;
    font-size: 0.72rem;
  }
`;

/* The item's name with its number key before it (27 Sep 2026): the menu is
   walked by 1–9 and 0, which only the tooltips said. A column of keys down
   the left edge, quiet so the names still lead. Hidden where the menu turns
   into a strip of chips, like the counts. */
const SettingsNavLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;

  kbd {
    @media (max-width: 900px) {
      display: none;
    }
  }
`;

const SettingsNavCount = styled.span`
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
  /* The secondary ink at full strength: at 0.8 it measured 3.7:1 on the
     open item's ground. */
  color: ${({ theme }) => theme.color.textSecondary};

  @media (max-width: 900px) {
    display: none;
  }
`;

/* The search, at the head of the menu, because it answers across every
 * section rather than inside one. */
const SettingsNavSearch = styled.input`
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.78rem;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  @media (max-width: 900px) {
    flex: 1 1 100%;
    margin: 0 0 0.25rem;
  }
`;

/* The shortcuts, the tour and the store listing: not settings, so under the
 * menu rather than in it. */
const SettingsNavFoot = styled.div`
  margin-top: auto;
  padding-top: ${({ theme }) => theme.spacing.large}rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;

  @media (max-width: 900px) {
    display: none;
  }
`;

/* The section on screen: its name and one line of what it is for, then its
 * rows in the scroller below. */
const SettingsPane = styled.section`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: ${({ theme }) => theme.spacing.large}rem
    ${({ theme }) => theme.spacing.large * 1.5}rem 0;

  @media (max-width: 600px) {
    padding: ${({ theme }) => theme.spacing.medium}rem
      ${({ theme }) => theme.spacing.medium}rem 0;
  }
`;

const SettingsSectionHead = styled.header`
  flex: 0 0 auto;
  max-width: 52rem;
`;

const SettingsSectionTitle = styled.h3`
  margin: 0;
  font-size: 1.05rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.02em;
`;

const SettingsSectionDesc = styled.p`
  margin: 0.35rem 0 0;
  max-width: 64ch;
  font-size: 0.74rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* A group's name over its rows in the search's answer, which runs across
 * every section. Not a toggle: there is nothing to fold. */
const SettingsSearchGroup = styled.h4`
  margin: ${({ theme }) => theme.spacing.large}rem 0 0.25rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.68rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};

  &:first-child {
    margin-top: 0;
  }
`;

/* The count, dimmed inside its chip: it is how big the group is, not what it
   is called, so it must not compete with the name. */
/* The screen's name, on the menu's left edge — the drawers' titles' own
 * treatment, one step larger because this one names a whole screen. */
const SettingsTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  /* Its key sits beside it — see KeyCap. */
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
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

// "Don't ask again": quieter than "Rate", a word rather than a mark
const RatePromptNever = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.color.textSecondary};
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
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

/* At full screen the settings go into two columns, and that is the whole
 * reason full screen is worth offering: nineteen settings in one column is
 * three screens of scrolling however wide the card is, and in two it is one
 * screen with nothing to scroll. Groups are kept whole across the break — a
 * heading in one column with its rows in the other is worse than scrolling. */
/* Settings → Permissions. Each permission is a block: name and state on
 * one line, the reason, what leaves the device, then the controls. The
 * per-origin rows under the newsroom block are a table: name, host, state,
 * one button. Everything reads in the panel's own type. */
const PermIntro = styled.p`
  max-width: 80ch;
  margin: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  font-size: 0.78rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PermRow = styled.section`
  padding: ${({ theme }) => theme.spacing.medium}rem 0;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

const PermRowHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.4rem;
`;

const PermName = styled.h3`
  margin: 0;
  font-size: 0.85rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
`;

/* Active in the accent, Off in secondary ink — a state, said in a word, never
   in the up/down colours that mean a price moved. */
const PermState = styled.span`
  flex: 0 0 auto;
  padding: 0.12rem 0.5rem;
  border: 1px solid
    ${({ theme, on }) => (on ? theme.color.accent : theme.color.border)};
  border-radius: 6px;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme, on }) =>
    on ? theme.color.accent : theme.color.textSecondary};
`;

const PermWhy = styled.p`
  max-width: 80ch;
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.color.text};
`;

const PermDetail = styled.p`
  max-width: 80ch;
  margin: 0.35rem 0 0;
  font-size: 0.72rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PermNote = styled.span`
  font-size: 0.72rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PermControls = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.7rem;
`;

const PermButton = styled.button.attrs({ type: "button" })`
  padding: 0.4rem 0.9rem;
  border: 1px solid
    ${({ theme, primary }) => (primary ? theme.color.text : theme.color.border)};
  border-radius: 8px;
  background: ${({ theme, primary }) =>
    primary ? theme.color.text : "transparent"};
  color: ${({ theme, primary }) =>
    primary ? theme.color.bg : theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.74rem;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    opacity 0.15s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme, primary }) =>
      primary ? theme.color.text : theme.color.borderHover};
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
  ${touchTarget};
`;

const PermOrigins = styled.div`
  margin: -0.25rem 0 ${({ theme }) => theme.spacing.small}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  overflow: hidden;
`;

const PermOrigin = styled.div`
  display: grid;
  grid-template-columns: minmax(7rem, 1fr) minmax(0, 1.4fr) auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.85rem;
  font-size: 0.74rem;
  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.border};
  }

  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 0.3rem;
  }
`;

const PermOriginName = styled.span`
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.text};
`;

const PermOriginHost = styled.span`
  font-size: 0.66rem;
  color: ${({ theme }) => theme.color.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 600px) {
    grid-column: 1 / -1;
    order: 3;
  }
`;

const TabContent = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  /* **The columns are not here, and that is the whole fix.**
   *
   * Two columns at full screen looked right and silently hid settings: this
   * box has a fixed height and hides horizontal overflow, so multi-column
   * layout puts whatever does not fit into a third and fourth column
   * sideways, where they are clipped. Measured with one extra group open,
   * everything below "Look" was gone from the screen — and the scrollbar
   * went with it, because nothing overflowed downwards any more, so there
   * was nothing to say it had happened.
   *
   * A settings list may scroll. It may not disappear. Full screen earns its
   * place on height and on a wider, still readable measure instead. */
  /* No cap of its own: the wide size is a card with a rem ceiling and its own
     padding, so the measure is already settled before the content gets here.
     A second cap inside it left the search box and the modes row running to
     one width and the settings below them to another. */
  width: 100%;
  /* A section is read, not scanned across: its rows keep a measure however
     wide the window, and the scroller still runs to the pane's edge. */
  & > * {
    max-width: 52rem;
  }
  /* A preferences section keeps the rows' own 44rem measure for everything
     in it — a dependent row revealed under its parent is a sibling here, not
     a child of the row, and at 52rem its switch ended 128px past its
     parent's. */
  &[data-pref-section] > * {
    max-width: 44rem;
  }
  ${() => css`
    ${ModeDesc} {
      min-height: 0;
    }
  `}
  /* Keep the scrollbar out by the card edge and reserve its lane so
     content never shifts when it appears.

     **both-edges**, because reserving the lane on one side only moves the
     centre. Everything in this tab is centred, and with a single gutter it
     centred inside a box 11px narrower than the card — measured, the search
     field sat at x 714.5 while the title and the tab underline sat at 720, so
     the panel's two halves were on different axes by half a scrollbar. */
  /* **One edge** (27 Sep 2026). Both edges kept a centred tab centred; the
     sections are left-aligned under their heads now, and the reserved lane
     on the left put every row 11px to the right of its own section's
     title. */
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
  /* The fade band is **padding**, so at rest there is nothing inside it.
   *
   * A mask alone fades whatever happens to be in the top and bottom 28px —
   * including at scrollTop 0, where nothing is scrolling anywhere. That is a
   * permanent murky strip under the tab strip and above the card's foot: the
   * first control in the list sits half-dissolved and reads as a smudge
   * rather than as a fade. Reserving the same distance as padding means the
   * band is empty until something is actually scrolled into it, which is when
   * a fade is telling the truth. */
  padding-top: ${({ theme }) => theme.scale * 7}rem;
  padding-bottom: ${({ theme }) => theme.scale * 7}rem;

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
 * eases open instead of appearing from nowhere. The box below is the styled
 * element; `SettingReveal`, under it, is the component that owns its height. */
/* A dependent row, or the ring's note, belongs under the description in the
 * same left-hand cell rather than in a column of its own. */
/* ONE SIZE FOR EVERY CONTROL IN A SETTINGS ROW.
 *
 * Measured across the nineteen rows before this existed, they came in three
 * shapes: a select with its padding stripped (16px tall and as narrow as its
 * longest option — 81px for "30 seconds"), a select at the card's full width
 * (424px), and segmented buttons at twice the height of the selects beside
 * them. "Full screen" was 49px tall because its two words would not fit the
 * width the other two buttons had settled on, so it wrapped.
 *
 * A select is bounded at both ends rather than sized to its content: under the
 * minimum it reads as a scrap, over the maximum it stops being a control at
 * the end of a row and becomes a bar across the card.
 *
 * It is a fragment because two places need it and they are not related: the
 * row itself, and the dependent row a setting can reveal underneath it — that
 * one is returned as a *sibling* of the row rather than inside it, so it never
 * inherited anything from it. Those four selects were the ones still at 424px
 * after the row was fixed.
 */
const prefControlScale = css`
  /* **One inset for both ends of a control: 12px.**
   *
   * Taken from what the field's own systems do rather than chosen by eye —
   * shadcn/ui's select trigger is 36px tall with 12px each side, GitHub
   * Primer's medium control is 32px on a semantic padding-inline token, and
   * Material 3 sizes a text field the same way: one horizontal inset applied
   * to the value and to the trailing icon alike. The right padding is that
   * 12px plus the 10px chevron plus an 8px gap, so a long value stops short
   * of the arrow instead of running under it. 2.1rem (33.6px) of height sits
   * inside the 32-36px those systems use. */
  select {
    min-width: 0;
    max-width: 100%;
    width: 100%;
    height: 2.1rem;
    padding: 0 1.875rem 0 0.75rem;
    font-size: 0.74rem;
  }

  /* **No bare button rule here, and this is the whole reason it moved.**
     It used to read a bare button rule setting height 2.1rem and a 0.6rem
     horizontal pad, right for the segmented groups and catastrophic for a
     ToggleSwitch is a button, 44×24 with a 20px knob pinned at top: 2px, so
     stretching it to 2.1rem left the knob at the top of a 34px pill with
     eleven pixels of dead track under it. The switch had stopped being a
     switch. The sizing now lives in PrefRow, where ToggleSwitch is already
     defined and can be excluded by name. */
`;

/* **A list of switches, as one grid item.**
 *
 * `PrefRow` pins every `ToggleRow` inside a section to column 2, row 1 —
 * exactly right while a section carries one control, which every section did
 * until this one. The Features list carries eight, and pinned to the same
 * cell all eight were drawn on top of each other: measured, every label
 * reported y=492.
 *
 * The fix is not to loosen that pinning, which is load-bearing for the other
 * forty settings. It is to stop being eight grid items: this wrapper is one
 * item spanning both columns, and the rows inside it lay themselves out the
 * ordinary way. The seam is the container this screen alone passes through —
 * nothing shared is restyled. */
const FeatureList = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  margin-top: 0.35rem;

  /* Inside here a row is a row again, not a grid item. */
  > * {
    grid-column: auto;
  }

  /* A rule between rows rather than a gap: eight switches in a column with
   * nothing between them read as one block, and the eye loses which label
   * belongs to which switch on the way across. */
  > * + * {
    border-top: 1px solid ${({ theme }) => theme.color.border};
  }
`;

const SettingRevealBox = styled.div`
  text-align: left;
  /* **Indented once, with a rule down its left.** A dependent row was drawn
     flush with the setting it hangs under, so "Position" read as a setting of
     its own that had lost its title. The rule says whose it is. Only the
     outermost level is indented: the News Headlines block carries a reveal
     inside a reveal inside a reveal, and three indents on a phone would leave
     the text column under 150px. */
  padding-left: 0.85rem;
  border-left: 1px solid ${({ theme }) => theme.color.border};
  /* **The full width of the row it hangs under, not the control lane.**
     Left to auto-placement it landed in column two — 184px wide — and the grid
     inside it then overflowed its own box by exactly the column gap, so that
     one dropdown sat 32px right of every other control on the screen. A
     dependent row is a row. */
  grid-column: 1 / -1;
  ${prefControlScale};

  /* The revealed control lines up with its parent's control rather than
     sitting under the description at full width — it is the same kind of
     thing, one level down. */
  > * {
    display: grid;
    /* The same fixed lane the row above it uses. With an auto track the
       control sized to its longest option — the ticker-position dropdown came
       out 519px, three times its lane — because a revealed row is a grid of
       its own and inherited none of the parent's placement. */
    /* 13rem, measured against the longest option this panel actually shows:
       "2 decimals (e.g. 1,234.56)" and "Auto (match your language)" were both
       cut off at 11.5rem, and a dropdown whose closed state hides the end of
       its own label is a dropdown you have to open to read. */
    grid-template-columns: minmax(0, 1fr) 13rem;
    align-items: center;
    column-gap: ${({ theme }) => theme.spacing.large}rem;

    /* The same narrower lane the row above it takes on a phone — see PrefRow. */
    @media (max-width: 600px) {
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: ${({ theme }) => theme.spacing.medium}rem;

      &:has(select) {
        grid-template-columns: minmax(0, 1fr) 9rem;
      }
    }
  }

  select {
    grid-column: 2;
    justify-self: end;
    width: 100%;
  }

  /* **The label sits on the left, like every other label on the tab.**
     RefreshIntervalLabel is centred for the widget tab's own use, and PrefRow
     puts it back on the left edge — but a revealed row is not inside PrefRow's
     wrapper rules, so "Position" was drawn centred in its column, on an axis
     nothing else on the screen used. */
  > * > label {
    text-align: left;
    margin: 0;
    min-height: 2.1rem;
    display: flex;
    align-items: center;
  }

  /* **A reveal inside a reveal is a block, not a grid of its own.** The rule
     above turns every direct child into a two-column grid so a revealed
     control lines up with the lane; applied to a nested reveal it put that
     reveal's switch at the *start* of the lane and its description in the
     text column — measured on News Headlines: the switch at x=592 where every
     other switch on the screen ended at x=876. The class name is what lets a
     component name itself in a descendant selector. */
  .pt-reveal & {
    display: block;
    grid-template-columns: none;
    padding-left: 0;
    border-left: none;
  }

  /* No max-height here: SettingReveal below measures the content and sets it
     inline, because a number written down here was wrong for the block it
     had to hold. */
  overflow: hidden;
  opacity: ${({ open }) => (open ? 1 : 0)};
  transform: translateY(${({ open }) => (open ? "0" : "-6px")});
  transition:
    max-height 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.28s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
`;

/* **A reveal is as tall as its contents, measured** — the rule `GroupReveal`
 * in settings.js already follows, and for the same reason. The box carried
 * `max-height: 8rem` when open, or a number a call site guessed; the News
 * Headlines block is a switch, a three-line description, a dropdown and a
 * note, which is about 14rem, so the bottom six were cut off and the "Show"
 * dropdown was drawn half under the next setting's title. A cap fails
 * silently and later, because of a change somewhere else — a longer
 * translation, a new dependent row.
 *
 * Open, the height is the content's own `scrollHeight`; once the transition
 * has run it is released to `none`, so a nested reveal that opens afterwards
 * is not clipped either. Closed, it goes to a number first (you cannot
 * transition from `none`) and to zero on the next frame. A prop of `open`
 * only; the old `maxHeight` is gone with the guess it stood for. */
class SettingReveal extends React.Component {
  constructor(props) {
    super(props);
    this.node = null;
    this.hold = (node) => {
      this.node = node;
      if (node && !this.props.open) {
        node.style.maxHeight = "0px";
        node.style.visibility = "hidden";
        return;
      }
      this.applyHeight();
    };
  }

  applyHeight() {
    const node = this.node;
    if (!node) return;
    window.clearTimeout(this._settle);
    if (!this.props.open) {
      node.style.maxHeight = `${node.scrollHeight}px`;
      window.requestAnimationFrame(() => {
        if (this.node && !this.props.open) this.node.style.maxHeight = "0px";
      });
      /* A shut row must expose no control: max-height 0 still hands its
         select to the Tab key. Hidden once the fold has run, not before, or
         the fold would be a cut. */
      this._settle = window.setTimeout(() => {
        if (this.node && !this.props.open)
          this.node.style.visibility = "hidden";
      }, 360);
      return;
    }
    node.style.visibility = "";
    node.style.maxHeight = `${node.scrollHeight}px`;
    this._settle = window.setTimeout(() => {
      if (this.node && this.props.open) this.node.style.maxHeight = "none";
    }, 360);
  }

  componentDidUpdate(prev) {
    if (prev.open !== this.props.open) this.applyHeight();
  }

  componentWillUnmount() {
    window.clearTimeout(this._settle);
  }

  render() {
    const { open, children } = this.props;
    /* Whatever else a call site passes — settingNote hands over aria-hidden —
       rides through to the box, so the sites that used the styled element
       directly needed no change beyond dropping `maxHeight`. */
    const props = Object.assign({}, this.props, {
      open: open,
      className: "pt-reveal",
      "data-reveal-open": open ? "true" : "false",
      innerRef: this.hold,
    });
    delete props.children;
    return React.createElement(SettingRevealBox, props, children);
  }
}

/* YOUR COINS ARE A LIST, NOT A BAG OF PILLS.
 *
 * They were chips that wrapped, so seven coins broke five-and-two and eight
 * broke five-and-three: a different ragged shape for every list length, and
 * nothing lining up with anything. A wrapping row is right for *results* you
 * pick from, where the set is arbitrary and transient. This set is ordered, it
 * is yours, and every entry has the same three things to say — which is a
 * list.
 *
 * It is also what the rest of this panel became: Preferences and Widgets are
 * rows with the label left and the control right, and the coins were the last
 * screen speaking a different language. Rows buy the room for the coin's full
 * name as well, which the pill never had.
 */
/* **One column until the list stops fitting, then as many as the card holds.**
 *
 * A tracked coin is a row about 35px tall, so a long list simply grew past the
 * card and the whole tab scrolled — the add box and the suggestions went off
 * the bottom, which is where you go *to* when the list is long. Above
 * COIN_LIST_COLUMN_AT the rows flow into columns instead: auto-fill, so the
 * count comes from the width the card actually has (two in the card, four or
 * five in the wide one) rather than from a number written down here.
 *
 * Under the threshold it stays a single column deliberately. Four coins in two
 * columns of two is a worse-looking list than four in a row, and four is the
 * default. Reordering still works, because the drag handler moves a coin
 * relative to the symbol under the pointer, never to a row index. */
const CoinList = styled.div`
  display: grid;
  grid-template-columns: ${({ count }) =>
    count > COIN_LIST_COLUMN_AT
      ? "repeat(auto-fill, minmax(13rem, 1fr))"
      : "1fr"};
  column-gap: ${({ theme }) => theme.spacing.medium}rem;
  row-gap: 0;
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
/* One coin, one row: symbol, name, today's move, and the way to remove it.
 *
 * The markup is unchanged — same drag handlers, same remove button — so this
 * is a layout, not a rewrite of how the list behaves. `coinChipFace` is left
 * to the suggestion chips, which are still chips. */
const CoinChipStatic = styled.div`
  display: grid;
  /* **A fixed column for the move, whether or not there is one.** It was
     auto, and a coin the ticker had no figure for rendered nothing in it — so
     that row's × slid 32px left of its neighbours' and the column of × ran
     ragged down the list. The cell is always rendered now and the column has
     a width. */
  grid-template-columns: 3.6rem minmax(0, 1fr) 4.4rem 1.4rem;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border}55;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.color.text};
  cursor: grab;
  position: relative;

  &:last-child {
    border-bottom: none;
  }

  /* The whole row lifts under the pointer, which is what says it can be
     dragged — a border change was the only signal and on a full-width row it
     reads as nothing at all. */
  &:hover {
    background: ${({ theme }) => theme.color.bgSecondary};
  }

  &:active {
    cursor: grabbing;
  }
`;

/* The coin's full name, in the row's second column. Secondary ink and a size
 * down: the symbol is what you scan for, the name is what confirms it. */
const CoinRowName = styled.span`
  font-size: 0.72rem;
  letter-spacing: 0.01em;
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CoinChipRemove = styled.button.attrs({ type: "button" })`
  /* A grid cell now, not an absolute overlay — on a full-width row the old
     position pinned it to the row's far edge with no relationship to anything
     beside it. */
  justify-self: end;
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

  /* scale alone: the translateY(-50%) that rode with it was left over from
     when this was absolutely positioned, and in a grid cell it hoisted the ×
     half its own height on every hover. */
  &:hover {
    opacity: 1;
    transform: scale(1.2);
  }

  /* It is the only way to remove a coin, so it has to be findable from the
     keyboard as well as under a pointer. */
  &:focus-visible {
    opacity: 1;
    outline: 2px solid ${({ theme }) => theme.color.bg};
    outline-offset: 1px;
  }
  ${touchTarget};
`;

/* The same heading as a Preferences group, and for the same reason: two tabs
 * of one panel should not name their sections in two different voices. It was
 * 0.875rem with no rule under it while a Preferences group was 0.66rem with
 * one, so moving between tabs changed what a heading looked like. */
const CoinSectionTitle = styled.h3`
  width: 100%;
  margin: 1.2rem 0 ${({ theme }) => theme.spacing.small}rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
`;

const CoinDragHint = styled.p`
  font-size: 0.65rem;
  opacity: 0.4;
  margin: 0.2rem 0 0.75rem;
  letter-spacing: 0.04em;
`;

/* Heading on the left, the count on the right, one rule under both — the
 * count is about that list, so it belongs on that list's line rather than
 * floating above it. The heading inside gives up its own rule and margins to
 * this row, or the two would draw two lines. */
const CoinSectionHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  /* 1.2rem under the section's head (27 Sep 2026): at large × 1.1 the two
     lists stood 78px below the line that introduces them, against 47px for
     every preferences section's first row. */
  margin: 1.2rem 0 ${({ theme }) => theme.spacing.small}rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  > h3 {
    margin: 0;
    padding: 0;
    border: none;
  }
`;

const CoinCounter = styled.span`
  font-size: 0.65rem;
  /* The secondary ink rather than the text at 0.4, which measured 2.5:1. */
  color: ${({ theme }) => theme.color.textSecondary};
  letter-spacing: 0.05em;
  /* It is one short figure and it broke across two lines when the heading beside
     it grew — nothing about "7 / 20" should ever wrap. */
  white-space: nowrap;
  flex: none;
`;

const ResetRow = styled.div`
  margin-top: ${({ compact, theme }) =>
    compact ? theme.spacing.small : theme.spacing.large}rem;
  padding-top: ${({ theme }) => theme.spacing.small}rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  transition: margin-top 0.45s cubic-bezier(0.33, 1, 0.68, 1);
`;

/* The same quiet face as the Preferences footer links, from the same
 * fragment. It was a bordered pill sitting alone in the middle of the card
 * while the equivalent actions one tab over were plain text — two tabs of one
 * panel offering the same *kind* of thing in two different voices. Reset is
 * still the only destructive control here, so it keeps its own confirmation
 * path and its undo; what changes is that it stops looking like the tab's main
 * button. */
/* The quiet face every "and here is one more thing you can do" control in this
 * panel wears — the Preferences footer links and the coin tab's reset alike.
 *
 * It lives up here rather than beside those links because a `css` fragment is a
 * value: interpolating it into a component defined earlier in the file reads
 * `hintFace` before the const exists and the whole page throws on load with
 * "Cannot access 'hintFace' before initialization". `node --check` sees
 * nothing wrong with it, because the file's syntax is fine. */
/* Shared by the two buttons and the one link in that row.
 *
 * A fragment rather than one component with an "as" prop: the vendored
 * styled-components is 3.4.6 and has no "as". One of the three has to be an
 * anchor because it leaves the extension, and three items that sit on one rule
 * must not be able to drift apart. */
const hintFace = css`
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
  text-decoration: none;
  text-align: center;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

const ResetButton = styled.button.attrs({ type: "button" })`
  ${hintFace};
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
  justify-self: end;
  font-size: 0.8em;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  text-transform: none;
  color: currentColor;
  opacity: 0.7;
`;

// Sort actions above the selected list — drag is precise but tedious past a
// handful of coins, and these are the three orders anyone actually wants
/* **The coins tab in two panes at full screen**: the list you have on the
 * left, the search that adds to it on the right — reading on the left, doing
 * on the right, which is the portfolio's rule. In one column a four-coin row
 * ran 1,080px with the symbol at one end and its × at the other. Under 900px
 * and at the card size both wrappers dissolve, so the narrow tab is the same
 * boxes in the same order. */
const CoinColumns = styled.div`
  display: ${({ two }) => (two ? "grid" : "contents")};
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 3rem;
  align-items: start;

  @media (max-width: 900px) {
    display: contents;
  }
`;

const CoinPane = styled.div`
  min-width: 0;
`;

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
  ${touchTarget};
`;

/* The field and its button on one line.
 *
 * They were stacked, so "Add coin" spanned the whole card in solid black —
 * the loudest thing on a tab whose subject is the chips above it. Adding a
 * coin is one action among several here, not the page's purpose. Side by side
 * the field takes the room it needs and the button takes what it needs.
 *
 * The suggestion list still has to sit under both, so the row is a grid with
 * the list spanning it, rather than a flex row it would have to escape. */
const SettingsForm = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: ${({ theme }) => theme.spacing.small}rem;
  align-items: start;
  width: 100%;
  position: relative;

  /* **Placed, not auto-flowed.** The markup order is field, suggestion list,
     button; left to auto-placement the list took row two across both columns
     and pushed the button down to row three, where it stretched across the
     wide column again — the same black bar, one row lower. Each of the three
     is told where it goes. */
  > input {
    grid-column: 1;
    grid-row: 1;
  }

  > button {
    grid-column: 2;
    grid-row: 1;
  }
`;

const SettingsInput = styled.input`
  padding: 0.75rem 1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  /* Sentence case. Upper case with 0.15em of tracking is the panel's *label*
     voice; on an input it made the placeholder shout the loudest line on the
     tab, and it did not match the search box in Preferences two tabs over. */
  letter-spacing: 0.02em;
  font-size: 0.82rem;
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
  grid-column: 1 / -1;
  grid-row: 2;
  display: grid;
  grid-template-rows: ${({ open }) => (open ? "1fr" : "0fr")};
  opacity: ${({ open }) => (open ? 1 : 0)};
  transition:
    grid-template-rows 0.45s cubic-bezier(0.33, 1, 0.68, 1),
    opacity 0.45s cubic-bezier(0.33, 1, 0.68, 1);
`;

const SuggestionsAreaInner = styled.div`
  min-height: 0;
  overflow: hidden;
`;

const SuggestionList = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: ${({ theme }) => theme.spacing.small}rem;
  padding: 0.25rem 0;
`;

/* The two answers to the futures terms, side by side and sized to their own
 * words. Accept is the weighted one because it is the thing being asked for;
 * declining is a preset-shaped button because it changes nothing. */
const PracticeTermsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.7rem;
`;

const SettingsActionButton = styled.button.attrs({ type: "button" })`
  /* Sized to its words, not to the card — see SettingsForm above. */
  white-space: nowrap;
  padding: 0.75rem 1.1rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: none;
  cursor: pointer;
  background: ${({ theme }) => theme.color.text};
  color: ${({ theme }) => theme.color.bg};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  font-size: 0.78rem;
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

/* ── the backup row ──────────────────────────────────────────────────────
 * Three quiet actions rather than the filled `SettingsActionButton`: one of
 * them replaces every setting in this browser, and a row of confident-looking
 * pills is the wrong shape for that. They read as what they are — links you
 * can miss until you are looking for them. */
const BackupRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.6rem;
  margin-top: 0.6rem;
`;

const BackupBtn = styled.button.attrs({ type: "button" })`
  padding: 0.32rem 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.7rem;
  color: ${({ theme, danger }) => (danger ? theme.color.bg : theme.color.text)};
  background: ${({ theme, danger }) =>
    danger ? theme.color.text : "transparent"};
  border: 1px solid
    ${({ theme, danger }) => (danger ? theme.color.text : theme.color.border)};
  border-radius: 7px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

// What a file turned out to hold, or why it was refused. Full ink: it is the
// sentence somebody reads before replacing everything they have set.
const BackupNote = styled.div`
  width: 100%;
  margin-top: 0.5rem;
  font-size: 0.7rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.text};
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
  margin: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
`;

/* Matched to ToggleSectionTitle deliberately — a setting driven by a select
 * and one driven by a switch are the same kind of thing, and were being drawn
 * as two: upper-case and centred here, sentence case and left there. */
const ThemeSectionTitle = styled.h3`
  margin: 0;
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  text-transform: none;
  font-weight: ${({ theme }) => theme.fontWeight.regular};
  opacity: 1;
  text-align: left;
`;

const ThemeButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xsmall}rem;
  justify-content: center;
  /* **Sized to its words, not to the lane, and right-aligned in it.** The
     three segments are still equal to each other — that is what makes it a
     segmented control rather than three buttons — but the group no longer
     stretches to the 208px a dropdown takes. It sits at the lane's right edge
     with the switches, which is the edge every control in this column shares.
     Filling the lane made three small words into three wide slabs. */
  justify-content: flex-end;

  > * {
    flex: 0 0 auto;
    min-width: 0;
  }
`;

const ThemeButton = styled.button.attrs({ type: "button" })`
  flex: 1;
  /* Narrow. It was 1rem each side on top of a 4rem floor, which is a slab
     around a four-letter word. */
  padding: 0.6rem 0.55rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid
    ${({ active, theme }) => (active ? theme.color.text : theme.color.border)};
  background: ${({ active, theme }) =>
    active ? theme.color.text : "transparent"};
  color: ${({ active, theme }) => (active ? theme.color.bg : theme.color.text)};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  letter-spacing: 0.06em;
  /* Lower case. Shouting three one-word options in capitals gave the smallest
     control on the tab the loudest type on it. */
  text-transform: lowercase;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 0;

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

/* **The companion's metrics, one chip each** (27 Sep 2026). A wrapping row
   rather than the theme's segmented control: sixteen names do not fit one
   line, and they keep their own case — lower-casing "MACD" and "ADX" makes
   them different words. Pressed is filled, like the segments. */
const MetricGroupLabel = styled.div`
  margin: 0.7rem 0 0.35rem;
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* **The companion's chips as a block** (1 Oct 2026, *"chart companion
   tarafı … birbirlerinin üzerine binme"*). Inside a reveal every direct child
   is made a label + 13rem-lane grid, so the two groups landed with their names
   centred in the left column and sixteen chips stacked one per line in the
   lane — 536px tall, neighbouring chips touching. Written at this seam, not
   on the reveal: `&&` outranks the reveal's child rule for this block only. */
const CompanionMetrics = styled.div`
  && {
    display: block;
  }
  padding: 0.15rem 0 0.6rem;
`;

/* A group's name, how many of it are shown, and All / None. */
const MetricGroupHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0.75rem 0 0.4rem;

  ${MetricGroupLabel} {
    margin: 0;
    white-space: nowrap;
  }

  /* On a phone the name keeps its line and the count goes under it, so
     neither breaks mid-phrase (390px, 1 Oct 2026). */
  @media (max-width: 420px) {
    flex-wrap: wrap;
    row-gap: 0.15rem;

    ${MetricGroupLabel} {
      flex: 1 0 100%;
    }
  }
`;

const MetricGroupCount = styled.span`
  flex: 1;
  white-space: nowrap;
  font-size: 0.62rem;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const MetricGroupAct = styled.button.attrs({ type: "button" })`
  padding: 0.15rem 0.35rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.64rem;
  color: ${({ theme }) => theme.color.textSecondary};
  cursor: pointer;

  &:hover:not(:disabled),
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bgSecondary};
  }

  &:focus {
    outline: none;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  ${touchBox};
`;

const MetricChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`;

const MetricChip = styled.button.attrs({ type: "button" })`
  padding: 0.4rem 0.75rem;
  border-radius: ${({ theme }) => theme.scale * 3}rem;
  border: 1px solid
    ${({ active, theme }) => (active ? theme.color.text : theme.color.border)};
  background: ${({ active, theme }) =>
    active ? theme.color.text : "transparent"};
  color: ${({ active, theme }) => (active ? theme.color.bg : theme.color.text)};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.72rem;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }
`;

const ThemeDescription = styled.p`
  margin: ${({ theme }) => theme.spacing.small}rem 0 0;
  font-size: 0.7rem;
  opacity: 0.6;
  text-align: left;
  line-height: 1.4;
`;

// Toggle Switch Components
const ToggleSection = styled.div`
  margin: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
`;

const ToggleSectionTitle = styled.div`
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  text-align: left;
  margin-bottom: 0.15rem;
`;

/* A setting's title, with the ring that explains it.
 *
 * Only settings with something genuinely non-obvious to say get one — the
 * cost of a control, an interaction with another setting, a gotcha. A ring on
 * every row would be noise, and noise is what people stop reading. */
const SettingTitleRow = styled.div`
  display: flex;
  align-items: center;
  /* Left, like the plain titles beside it. It was centred, so a setting with
     an explaining ring sat on a different axis from one without — two title
     components for one kind of thing, disagreeing. */
  justify-content: flex-start;
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
  ${touchTarget};
`;

/* The note itself: left-aligned, in a box, at readable weight.
 *
 * The one-line description above it is centred at half opacity because it is
 * a caption. This is prose — a caption you have to squint at is a caption
 * nobody reads, and the whole point of the ring is that what it reveals is
 * worth reading. */
/* **A glossary, for the one feature that has a vocabulary.**
 *
 * Everything else in Preferences is a switch whose name is its meaning.
 * Futures brings six words that decide what happens to your money and that
 * nobody is born knowing — and the panel's own cards explain them *in the
 * middle of using it*, which is late. This is the same six, in the main menu,
 * before anything is switched on.
 *
 * A term over its sentence rather than a two-column table: the sentences are
 * the point and a narrow value column would set them in a ribbon. */
const PrefGlossary = styled.dl`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0.35rem 0 0;
  grid-column: 1 / -1;

  dt {
    font-size: 0.7rem;
    font-weight: ${({ theme }) => theme.fontWeight.medium};
    color: ${({ theme }) => theme.color.text};
  }

  dd {
    margin: 0.1rem 0 0;
    font-size: 0.68rem;
    line-height: 1.45;
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* **Prose inside a reveal is prose, not a row.**
 *
 * SettingRevealBox makes every direct child a two-column grid
 * (minmax(0,1fr) 13rem) so that a *revealed control* lines up with the control
 * above it. Applied to a bare child selector, that catches the descriptions
 * too: a paragraph became a grid whose text sat in the 1fr column at 232px
 * with a 13rem lane empty beside it, while the description one level up ran
 * the full 472px. Measured on the News Headlines block: "A story counts as
 * yours…" at w=232 against "Scrolling price bar across the page…" at w=472 —
 * which reads as text stuck on the left with a padding fault, and is what it
 * was reported as.
 *
 * Written here rather than in `SettingRevealBox`, which is declared before these
 * two exist and so cannot name them: a styled component can only be named in
 * another's selector once it has been created. A control inside a reveal still
 * gets the lane; only the prose steps out of it. */
const prefRevealProse = css`
  ${SettingRevealBox} > & {
    display: block;
    grid-template-columns: none;
    grid-column: 1 / -1;
  }

  /* One level down — a whole section inside the reveal (title, this, a
     switch) — it is the text column's, as it is one level up in PrefRow. */
  ${SettingRevealBox} > * > & {
    grid-column: 1;
  }
`;

const SettingNote = styled.div`
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSecondary};
  font-size: 0.68rem;
  line-height: 1.5;
  text-align: left;
  color: ${({ theme }) => theme.color.textSecondary};

  ${prefRevealProse};
`;

const ToggleSectionDesc = styled.div`
  font-size: 0.68rem;
  line-height: 1.4;
  opacity: 0.62;
  text-align: left;
  margin: 0.1rem 0 0;

  ${prefRevealProse};
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.medium}rem;
  padding: 0.4rem 0;

  /* **In a revealed row, the switch is in the lane.** The reveal lays its
     rows out as label + control, the way PrefRow does one level up, and the
     row's own space-between would put the state word at the lane's left edge
     and the switch at its right. Written here for the reason prefRevealProse
     gives: the reveal is declared first and cannot name this component. */
  ${SettingRevealBox} > * > & {
    /* **Opposite its title, in the lane** (28 Sep 2026, *"volume bars on/off
       slider switch'i sağa yasla, solda durmamalı"*). Without a column it
       was auto-placed: a revealed section is title, description, switch,
       and the description took the lane beside the title while the switch
       dropped to the text column's second row — 240px left of every other
       switch in the drawer and in Settings. Pinned where PrefRow pins its
       own controls: column two, row one. */
    grid-column: 2;
    grid-row: 1;
    align-self: start;
    justify-self: end;
    justify-content: flex-end;
    gap: ${({ theme }) => theme.spacing.small}rem;
    padding: 0;
    height: 2.1rem;
  }
`;

const ToggleLabel = styled.label`
  font-size: 0.7rem;
  opacity: 0.6;
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
/* Flush with everything else in the tab.
 *
 * It carried `margin: 0 auto` and `max-width: 22rem` from when the whole panel
 * was a centred 22rem column. With the settings now running the full width of
 * the card, that left the modes block on its **own axis** — measured, its
 * label and chips began 36px right of the search box above it and every
 * setting below it, and ended 36px short on the other side. One list with two
 * left edges is the kind of thing that reads as "off" without being nameable.
 */
const ModeSection = styled.div`
  /* Tighter when the panel is the whole screen — keyed on an ancestor
     attribute rather than a prop, because these three are defined *after*
     TabContent and naming them from there reads a const before it exists,
     which takes the whole file down with it. */
  [data-size="full"] & {
    margin-bottom: 0.5rem;
    padding-bottom: 0.6rem;
  }

  margin: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  padding-bottom: ${({ theme }) => theme.spacing.medium}rem;
  width: 100%;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
`;

/* Two lines of room, held whether or not there is anything to say: the text
 * follows the pointer across four pills, and a box that grew and shrank as it
 * changed would move the pills out from under the cursor. */
const ModeDesc = styled.div`
  /* Tighter when the panel is the whole screen — keyed on an ancestor
     attribute rather than a prop, because these three are defined *after*
     TabContent and naming them from there reads a const before it exists,
     which takes the whole file down with it. */
  [data-size="full"] & {
    min-height: 0;
  }

  min-height: 2.4em;
  font-size: 0.66rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.textSecondary};
  opacity: ${({ dim }) => (dim ? 0.8 : 1)};
`;

/* "MODES" on the left, Save on the right. Save was inside the chip row and
 * wrapped onto a line of its own once Custom made five chips — alone,
 * right-aligned, under the row it belongs to. It is an action *about* the row,
 * so it belongs on the row's own label line, where it competes with nothing. */
const ModeHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
`;

const PresetRow = styled.div`
  display: flex;
  gap: 6px;
  margin: 4px 0 10px;
  flex-wrap: wrap;
  /* Four size letters across a 1,080px full-screen tab were four 260px
     buttons with one letter each. A segmented control is a hand's width. */
  max-width: 36rem;
`;



/* Save, and deliberately **not** a `PresetButton`.
 *
 * It was one, and the result is why this component exists: `PresetButton`
 * carries `flex: 1 1 auto`, so once five chips filled the row Save wrapped
 * onto a line of its own and stretched edge to edge — a full-width bar under
 * the modes, reading as the panel's primary action when it is a small thing
 * you do to one chip. It does not grow, it does not take a chip's border, and
 * it is quieter than the things it sits beside, because it is an action on a
 * mode rather than another mode. */
const ModeSaveButton = styled.button.attrs({ type: "button" })`
  flex: 0 0 auto;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  cursor: pointer;
  ${hoverUnderline};

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
  }

  &:focus-visible {
    outline: none;
  }
  ${touchTarget};
`;

const PresetButton = styled.button.attrs({ type: "button" })`
  flex: 1 1 auto;
  min-width: 64px;
  padding: 6px 8px;
  border: 1px solid
    ${({ active, theme }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 7px;
  background: ${({ active, theme }) =>
    active ? theme.color.bgSecondary : "transparent"};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  font-weight: ${({ active, theme }) =>
    active ? theme.fontWeight.medium : theme.fontWeight.regular};
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;

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
  margin: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
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
  /* The chevron sits on the same 12px edge the text uses on the other side.
     It used to end 5px from the border while the value began 13.6px from the
     opposite one, so the two ends of one control had different margins. */
  background-position:
    calc(100% - 22px) center,
    calc(100% - 17px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 1.875rem;

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
  margin: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
`;

const NumberFormatLabel = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.small}rem;
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  text-transform: none;
  opacity: 1;
  text-align: left;
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
  /* The chevron sits on the same 12px edge the text uses on the other side.
     It used to end 5px from the border while the value began 13.6px from the
     opposite one, so the two ends of one control had different margins. */
  background-position:
    calc(100% - 22px) center,
    calc(100% - 17px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 1.875rem;
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
  margin: 0 0 ${({ theme }) => theme.spacing.medium}rem;
  padding: 0;
  width: 100%;
`;

/* ONE SETTING, ONE ROW — and applied where it cannot reach anything else.
 *
 * A setting was a centred stack: an upper-case title centred, its description
 * centred under it, then a line with the state word at the far left and the
 * switch at the far right, four hundred pixels apart. Three alignments per
 * setting, ~130px of height each, and no left edge for the eye to run down.
 * Nineteen of them made 1,426px of content in a 478px window.
 *
 * **The first attempt restyled the shared containers and broke two tabs.**
 * ToggleSection, ThemeSection and NumberFormatSection are not Preferences
 * components — the Widgets tab builds its list out of the same pieces, so
 * turning them into a two-column grid collapsed every widget label into one
 * overlapping line and stacked the S/M/L/XL row vertically. Nothing in the
 * Preferences screenshots showed it, because it was a different tab.
 *
 * So the layout lives here and is applied by `panel.section`, which is the one
 * gate every Preferences setting already passes through and nothing else does.
 * The nineteen call sites stay untouched, the shared pieces stay as they were,
 * and the other two tabs cannot be reached by this at all.
 *
 * Flow rather than named areas: a section holds a title, a description, and
 * sometimes a revealed note or a dependent row, so the count varies. Everything
 * defaults to column one and stacks; the control claims column two.
 */
/* A heading inside a section: the chart's three kinds (see
   CHART_SETTING_HEADS). The type of the drawers' own heads, one step
   quieter, and space above it so the kinds read as kinds. */
const PrefSubhead = styled.h4`
  margin: 1.4rem 0 0.1rem;
  padding: 0 0 0.35rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.62rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};

  &:first-child {
    margin-top: 0.3rem;
  }
`;

const PrefRow = styled.div`
  display: grid;
  /* **A definite width, which matters inside the two-column layout.**
     A grid whose available width is indefinite resolves 1fr to zero and
     shrinks its first track to min-content — inside CSS columns that is what
     happened, and the right-hand column's descriptions wrapped one word per
     line while the left column, whose rows had wider content, looked fine. */
  width: 100%;
  /* The text column has a floor and the control column takes what is left.
     With a bare auto track the control sized itself first and could take the
     whole row — measured inside the two-column layout, one row resolved to
     0px and 411px, so its title and description had no width at all and
     wrapped one word per line. */
  /* A fixed lane for the control and the rest to the text. Every attempt to
     let the control size itself ended with it taking the row: auto sizes to
     max-content, and a segmented group of three buttons has a large one. With
     the lane fixed, a narrow column shrinks the text and never the other way
     round, and nothing has to be measured. */
  /* 12rem. It was 13 while the decimal options carried worked examples in
     their own labels; with those gone the widest closed select is a currency
     name, and the rem the lane gives back goes to the text beside it. Back to
     13 once the full-screen measure was capped: the text column no longer has
     to be rescued from a column that grows with the monitor, so the rem goes
     to the dropdowns, which is where it was asked for. */
  grid-template-columns: minmax(0, 1fr) 13rem;
  align-items: start;
  column-gap: ${({ theme }) => theme.spacing.large}rem;
  /* **9rem on a phone.** At 420px the card is 386px wide and 346px inside,
     and a 13rem lane plus its gap left 114px for the words: "Price Ticker
     Bar" came out one word per line and "Announce Targets In The Tab Title"
     five deep. 9rem still holds the widest closed value ("US Dollar ($)") and
     the three theme buttons, and hands 70px back to the title. */
  /* And measured again after 9rem: the tab is 291px wide on a 420px phone
     once the card's padding and the scrollbar gutter are paid, so a 9rem lane
     still left 131px for the words and "Announce Targets In The Tab Title"
     ran four lines deep beside an 80px switch. The lane only has to be wide
     for a dropdown. A switch with its state word is 80px and a segmented
     group is bounded by its own buttons, so those rows take an auto lane
     that sizes to the control, and the dropdown rows keep 9rem. */
  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: ${({ theme }) => theme.spacing.medium}rem;

    &:has(select) {
      grid-template-columns: minmax(0, 1fr) 9rem;
    }
  }
  /* **Tight under the title** (27 Sep 2026). 0.9rem here put a setting's
     description 40px under its own name — the title row is the control
     lane's 2.1rem, and the gap came on top of it — so each sentence sat
     nearer the next setting than the one it describes. The two-pair
     section's spacing, which is what the 0.9rem was for, is its own rule
     below (NumberFormatSection). */
  row-gap: 0.15rem;
  padding: 0.7rem 0;
  /* **A row that is only a shut reveal takes no room** (27 Sep 2026).
     Volume Bars waits inside its reveal until the candles are on, and the
     row around it kept its padding: a 1.4rem hole between Chart Color and
     Chart Grid that read as a missing setting. */
  &:has(> ${SettingRevealBox}[data-reveal-open="false"]:only-child) {
    padding-top: 0;
    padding-bottom: 0;
    border-bottom-color: transparent;
  }
  transition: padding 0.25s ease;

  /* **A measure for the row** (27 Sep 2026). At full screen the switch sat
     at the far end of a 52rem line — 800px from the name it belongs to —
     and a description ran to 150 characters. The rows keep their own
     narrower measure inside the pane; the pane's other content (the coin
     lists, the modes) keeps its own. */
  max-width: 44rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border}55;
  text-align: left;

  &:last-child {
    border-bottom: none;
  }

  /* **The wrapper dissolves.**
     
     A setting arrives as one container holding its title, its description and
     its control, so the control is the grid's *grandchild* — and grid-column
     does nothing to a grandchild. Named and styled anyway, it stayed in the
     flow and sat below the title instead of opposite it, which looked like the
     rule had simply been ignored. display:contents removes the container's
     box and promotes its children to items of this grid, which is exactly what
     it is for. Safe here because these three wrappers carry no background, no
     border and no padding of their own — they were only ever grouping. */
  > ${ToggleSection},
    > ${ThemeSection},
    > ${NumberFormatSection},
    > ${RefreshIntervalSection},
    > ${CurrencySection} {
    display: contents;
  }

  /* The wrapped node keeps its own component and its own markup; what it
     loses here is the spacing it used to add for itself. Both were applied and
     the rows doubled their gaps — 3.6 screens where 2.8 had been. The row owns
     the rhythm now, and nothing inside it contributes to it. */
  /* **Written out at both depths, because :where() cannot do this.**
     
     The first version wrapped the defaults in :where() to drop their
     specificity below the control rule. That is invalid CSS — :where() takes a
     plain selector list and a relative selector like "> *" is not one — so the
     browser threw the whole rule away and **every placement rule here was
     dead**. Measured: every child reported grid-column: auto, and the layout
     that looked almost right was CSS auto-placement doing it by accident.
     
     So the two rules are written at matching depth instead, and the control
     rule wins because it is later and equally specific. */
  > *,
  > ${ToggleSection} > *,
  > ${ThemeSection} > *,
  > ${NumberFormatSection} > *,
  > ${RefreshIntervalSection} > *,
  > ${CurrencySection} > * {
    grid-column: 1;
    min-width: 0;
    margin: 0;
    max-width: none;
    text-align: left;
  }

  /* The control, opposite the title. No fixed row: a section may carry two of
     them — the number group has one select for the decimals and one for the
     separators — and pinning both to row one drew the second underneath the
     first, so that setting appeared to have no control at all. */
  > ${ToggleRow}, > ${ThemeButtonGroup}, > select,
  > ${ToggleSection}
    > ${ToggleRow},
    > ${ThemeSection}
    > ${ThemeButtonGroup},
    > ${NumberFormatSection}
    > select,
  > ${RefreshIntervalSection} > select,
  > ${CurrencySection} > select {
    grid-column: 2;
    /* **Row one, opposite the title.** Without it the control is auto-placed,
       and auto-placement runs a cursor that never goes back: the title takes
       row 1, the description row 2, the note row 3, and the control — the
       last child in the markup — lands in row 3, under the prose. That is the
       drift, and centring it in that row is what made it look arbitrary
       rather than wrong. A row this pins is a row col1 also starts in, so
       the two are opposite each other by construction.

       The old warning against pinning stands only where a section carries two
       controls: both would be drawn in row 1 and the second hidden under the
       first. Measured across every group with all five expanded, no section
       does — each control has a title of its own and a PrefRow of its own —
       and tests/test-polish-render.js asserts the count, so a section that
       grows a second control fails there rather than losing it silently. */
    grid-row: 1;
    /* **start, not center.** The row is as tall as its description, and a
       control centred in it drifts down the row until it is opposite the
       prose rather than opposite the title it belongs to — measured down the
       compact list, the drop ran from 4px to 155px and took fourteen distinct
       values, so no two controls lined up with their own labels. The title is
       already the lane's own height (2.1rem), so starting both at the row's
       top puts them exactly opposite each other, whatever is written below. */
    align-self: start;
    justify-self: end;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: ${({ theme }) => theme.spacing.small}rem;
    /* **One height for the whole lane.** Measured down the column: selects
       and segmented buttons came to 34px and the switch rows to 46px, so the
       control edge stepped in and out down the list. A state word beside a
       pill needs no more height than a dropdown. */
    height: 2.1rem;
    min-height: 0;
    /* **Not a blanket zero, which is what emptied the dropdowns.**
       This rule exists to make a switch row the same height as a select, and
       a blanket zero did that by stripping the select's own horizontal inset
       as well — it reaches the select through this row's wrapper, so it beats
       the component's own rule, and every value in the panel ended up flush
       against its left border. Only the block padding is flattened here; the
       inline padding is the control's, and the selects below restate it. */
    padding-block: 0;
    /* **max-width, not width:auto.** Auto let a select size to its longest
       option and spill left out of its lane, over the label beside it — the
       decimals row read "Decimal Plac" with the dropdown on top of the rest.
       The lane is the limit; what sits in it may be narrower. */
    max-width: 100%;
  }

  /* **Two pairs in one section, so these flow.**
     The number section is not title-prose-control: it is "Decimal Places" +
     a select and "Number Format" + a select, one after the other with nothing
     between them. Pinned to row one both selects were drawn in the same
     place and the second setting had no visible control at all. Left to flow,
     each select lands in its own label's row, which is what pairs do. */
  > ${NumberFormatSection} > select {
    grid-row: auto;
  }

  /* The second pair of the number section starts a step below the first:
     the row gap is a title's distance from its own description now, and
     two dropdowns 0.15rem apart read as one control. */
  > ${NumberFormatSection}
    > select
    + ${NumberFormatLabel},
    > ${NumberFormatSection}
    > select
    + ${NumberFormatLabel}
    + select {
    margin-top: 0.75rem;
  }

  /* **A plain label is text, and text is not the lane's height.**
     Where the title is a styled block it already stands 2.1rem tall and sits
     exactly opposite its control. Where it is a bare label it is 14-15px, so
     starting both at the top of the row left its centre 9px above the
     control's — close enough to look like a mistake and far enough to see.
     Given the lane's height and its text centred in it, the pair lines up by
     construction rather than by arithmetic. */
  /* **The prose spans the row.**
     A description confined to the text column is a column of six or eight
     short lines with the control lane empty beside it for all of them —
     Settings Width ran to eight. It only had to share the row while the
     control was auto-placed, because a full-width item would have pushed the
     control down past it; the control is pinned to row one now, so the prose
     can have the width it wants and the pair above it stays where it is. */
  /* SettingRevealBox carries its own grid-column: 1 / -1 and loses it here —
     a rule reaching through this row's wrapper is more specific than the
     component's own — so it is named again rather than left to be overridden
     back into the text column with the note folded inside it. */
  /* And a bare paragraph, wherever its section wraps it. Settings Width's
     own description is a <p> in a wrapper this row does not name, so nothing
     placed it and it auto-flowed into the text column — eight short lines
     with the control lane empty beside every one of them. */
  /* Named at both depths, and for every wrapper. A bare "> * > p" is one
     class and one type where the wrapper rule that places it in the text
     column is two classes, so it lost — the paragraph kept its eight lines
     and nothing in the stylesheet looked wrong. */
  > p,
  > * > p,
  > ${ToggleSection} > p,
  > ${ThemeSection} > p,
  > ${NumberFormatSection} > p,
  > ${RefreshIntervalSection} > p,
  > ${CurrencySection} > p,
  > ${ToggleSectionDesc},
  > ${SettingNote},
  > ${SettingRevealBox},
  > ${ToggleSection} > ${ToggleSectionDesc},
  > ${ToggleSection} > ${SettingNote},
  > ${ToggleSection} > ${SettingRevealBox},
  /* And the Features list, for the same reason SettingRevealBox is named here:
     it carries its own grid-column: 1 / -1 and loses it to this row's
     "> ToggleSection > *" rule, which reaches through the wrapper and is
     therefore more specific than the component's own. Measured before it was
     named: the eight rows drew 255px wide in the text column with the control
     lane empty beside every one of them. */
  > ${ToggleSection} > ${FeatureList},
  /* The glossary is prose in a list, not a control opposite a label — same
     case as the feature list beside it, and it loses its own
     its own full-width placement to this row's "> ToggleSection > *" rule for
     exactly the reason written above. */
  > ${ToggleSection} > ${PrefGlossary},
  > ${ThemeSection} > ${SettingRevealBox},
  > ${NumberFormatSection} > ${SettingRevealBox},
  > ${RefreshIntervalSection} > ${SettingRevealBox},
  > ${CurrencySection} > ${SettingRevealBox},
  > ${ThemeSection} > ${ToggleSectionDesc},
  > ${ThemeSection} > ${SettingNote},
  > ${NumberFormatSection} > ${ToggleSectionDesc},
  > ${RefreshIntervalSection} > ${ToggleSectionDesc},
  > ${CurrencySection} > ${ToggleSectionDesc},
  > ${CurrencySection} > ${SettingNote} {
    grid-column: 1 / -1;
  }

  /* The bare titles are the same case: ToggleSectionTitle without an info
     ring beside it, and ThemeSectionTitle, are single lines of text rather
     than the 2.1rem row SettingTitleRow builds. */
  > label,
  > ${ToggleSectionTitle}, > ${ThemeSectionTitle}, > ${ToggleSection} > label,
  > ${ToggleSection} > ${ToggleSectionTitle}, > ${ThemeSection} > label,
  > ${ThemeSection}
    > ${ThemeSectionTitle},
    > ${ThemeSection}
    > ${ToggleSectionTitle},
    > ${NumberFormatSection}
    > label,
  > ${RefreshIntervalSection} > label,
  > ${CurrencySection} > label {
    min-height: 2.1rem;
    display: flex;
    align-items: center;
  }

  /* The segmented groups and the mode chips take the lane's height; the
     switch is exempt, because its own 44×24 is what makes it read as a
     switch rather than as a stretched button. */
  button:not(${ToggleSwitch}) {
    height: 2.1rem;
    padding: 0 0.6rem;
    font-size: 0.72rem;
    font-weight: ${({ theme }) => theme.fontWeight.regular};
    white-space: nowrap;
    min-width: 0;
  }

  /* A row of choices under a setting's description spans the row, the way
     the description does, and wraps rather than squeezing its names. */
  > ${MetricChips}, > ${ToggleSection} > ${MetricChips} {
    grid-column: 1 / -1;
    margin-top: 0.45rem;
  }

  ${prefControlScale};
`;

/* Sentence case, like every other setting's title. It was upper case with wide
 * tracking — the panel's *label* voice — so one row in the middle of the list
 * shouted while its neighbours spoke. */
const CurrencyLabel = styled.label`
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  text-align: left;
  display: block;
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
  /* The chevron sits on the same 12px edge the text uses on the other side.
     It used to end 5px from the border while the value began 13.6px from the
     opposite one, so the two ends of one control had different margins. */
  background-position:
    calc(100% - 22px) center,
    calc(100% - 17px) center;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 1.875rem;

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

const SettingsNoMatch = styled.div`
  padding: ${({ theme }) => theme.spacing.medium}rem 0;
  font-size: 0.8125rem;
  text-align: center;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* A quiet action under Settings' menu — the tour's replay. The keyboard
 * shortcuts were here too until they became a section of the menu. */
const FootHint = styled.button.attrs({ type: "button" })`
  ${hintFace};
`;

/* The way to the store listing that is always there.
 *
 * The rating ask can be dismissed, and should be — but until this existed the
 * two prompts were the *only* routes to the listing, so someone who waved the
 * card away and later wanted to leave a review had nowhere to go. Asking less
 * is only honest if the door stays open. */
const RateHint = styled.a`
  ${hintFace};
`;

/* ── THE CHART'S OWN SETTINGS, IN A DRAWER ─────────────────────────────────
 *
 * Asked for on 23 Sep 2026: *"chart settings gibi bir şeyi kenardan kayan
 * grafiğe koymak daha kolaylaştırır gibi geliyor"*. It does, and the argument
 * was already written down in this file — the note on `SettingsCard` says a
 * panel that covers the chart cannot show you what you just changed, and
 * making Settings full screen two days earlier made that worse rather than
 * better. Measured before building: from a cold start a chart switch is a
 * key, a tab click, a chip click, a scroll and a click, through a list 1,719
 * pixels tall in a 586-pixel window.
 *
 * **No scrim, and that is the feature.** Every other overlay in this app dims
 * what is behind it; this one must not, because the whole point is watching
 * the chart redraw as a switch flips. The chart stays live under it — the
 * crosshair still follows the pointer — and the drawer closes on Escape, on
 * its own ×, on the key that opened it, or on a press outside it.
 *
 * Right-hand side, because the widget dock floats over the left third and a
 * drawer that landed on it would be two panels fighting for one edge.
 * `z-index: 110` is under the corner controls' 120, so the gear and the rest
 * stay reachable with it open.
 */
const ChartDrawer = styled.aside`
  /* The surface, the place on screen and the see-through are shared with the
     targets and calls drawers — chartDrawerSurface in theme.js holds them,
     and holds the reason they are see-through at all. */
  ${chartDrawerSurface};
  /* **30rem, not 23.** Asked for on 23 Sep 2026 along with the transparency:
     *"bunlarin ekranlarini daha da buyutebiliriz"*. At 23rem the nine rows
     ran their labels into two and three lines against a fixed control lane,
     which is what made a nine-row drawer scroll at all on an 800px window.
      30rem gives the words more room and keeps control rows from colliding. */
  width: min(30rem, 94vw);
  padding: ${({ theme }) => theme.spacing.large}rem;
  /* The head on the targets drawer's line — see ChartDrawerTitle. */
  padding-top: 1.3rem;
  /* Slides, never blinks — the standing rule for anything that arrives on
     this screen. Off-screen by its own width plus the margin it sits in, so
     no edge of it is left showing while it is shut. */
  /* Out through the edge it is docked to — the left one since 24 Sep 2026 —
     by its own width plus the margin it sits in, so no sliver of it is left
     showing while it is shut. */
  transform: translateX(${({ open }) => (open ? "0" : "calc(-100% - 8rem)")});
  opacity: ${({ open }) => (open ? 1 : 0)};
  visibility: ${({ open }) => (open ? "visible" : "hidden")};
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.24s ease,
    visibility 0s linear ${({ open }) => (open ? "0s" : "0.3s")};

  @media (prefers-reduced-motion: reduce) {
    transition:
      opacity 0.2s ease,
      visibility 0s;
    transform: none;
  }

  ${chartDrawerPhone};

  /* Up from the foot rather than in from the side, once it is a sheet. */
  @media (max-width: 600px) {
    transform: translateY(
      ${({ open }) => (open ? "0" : "calc(100% + 1.5rem)")}
    );
  }
`;

const ChartDrawerHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  flex: 0 0 auto;
  padding-bottom: ${({ theme }) => theme.spacing.small}rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
`;

/* **One head for every drawer** (27 Sep 2026). The targets and calls
   drawers named themselves in small tracked capitals on a band 1.3rem from
   the top; these two used a larger title-case heading 2rem down, so the
   four drawers on one column had two kinds of head at two heights. This is
   AlertsHeadTitle's type, and the drawer's own padding (see ChartDrawer and
   WidgetsDrawer) puts it on the same line. */
const ChartDrawerTitle = styled.h2`
  margin: 0;
  padding: 0.35rem 0.1rem 0.45rem;
  font-size: 0.72rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  /* Its key sits beside it — see KeyCap. */
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
`;

const ChartDrawerClose = styled.button.attrs({ type: "button" })`
  width: 1.8rem;
  height: 1.8rem;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 1.05rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.color.bgSecondary};
    color: ${({ theme }) => theme.color.text};
  }
`;

const ChartDrawerBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* The settings rows keep a still lane for the scrollbar. The widget cards
     do not (gutter false): their grid needs every pixel of the drawer's
     default 30rem for two medium cards across (409 of 408), and the reserved
     11px left one. The cards reflow when the list outgrows the drawer; that
     is the price, paid only then. */
  scrollbar-gutter: ${({ gutter }) => (gutter === false ? "auto" : "stable")};
  margin-right: -${({ theme }) => theme.spacing.small}rem;
  padding-right: ${({ theme }) => theme.spacing.small}rem;
  ${themedScrollbar};
  /* The rows are the Settings panel's own, so they arrive with its lane. In
     23rem the 13rem lane would leave 130px for the words — the phone case
     this file already solved, applied here by width rather than by media,
     because the drawer is narrow on every screen. */
  ${PrefRow} {
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: ${({ theme }) => theme.spacing.medium}rem;
  }

  ${PrefRow}:has(select) {
    grid-template-columns: minmax(0, 1fr) 10rem;
  }

  /* The head's own rule is just above: the first heading stands clear of
     it rather than drawing a second line under the first. */
  > ${PrefSubhead}:first-child {
    margin-top: 0.9rem;
  }
`;

/* One line at the foot: where the rest of the settings are, and the key that
 * opens this again. A drawer that does not say it has a key teaches nobody
 * the fast path, which was the whole complaint. */
const ChartDrawerFoot = styled.div`
  flex: 0 0 auto;
  margin-top: ${({ theme }) => theme.spacing.small}rem;
  padding-top: ${({ theme }) => theme.spacing.small}rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.68rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// The foot line's key is the one every other key is drawn as (KeyCap)
const ChartDrawerKey = KeyCap;

/* The drawer's one action, above its foot line: a full-width quiet button,
   the size of the drawer's other controls, with its key at the end. */
const ChartDrawerSave = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 ${({ theme }) => theme.spacing.small}rem;
  padding: 0 0.75rem;
  height: 2.1rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.72rem;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.borderHover};
  }
`;

/* ── THE COMPARE DRAWER (1 Oct 2026, compare-drawer.js) ─────────────────
 * A drawer beside the chart like the others on this column — the picker was
 * a dialog over the whole screen, and choosing what to lay over the chart is
 * a thing done beside it. */
const CompareSearch = styled.input`
  width: 100%;
  box-sizing: border-box;
  height: 2.3rem;
  padding: 0 0.85rem;
  margin: 0.75rem 0 0.25rem;
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

const CompareNow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding: 0.65rem 0.8rem;
  border-radius: 0.7rem;
  background: ${({ theme }) => theme.color.bgSecondary};
  font-size: 0.74rem;
  color: ${({ theme }) => theme.color.text};
`;

const CompareSection = styled.div`
  margin-top: 1rem;
`;

const CompareSectionHead = styled.div`
  margin: 0 0 0.35rem 0.2rem;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const CompareList = styled.div`
  display: flex;
  flex-direction: column;
  border-radius: 0.8rem;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.color.border};
`;

const ComparePickRow = styled.button.attrs({ type: "button" })`
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: none;
  background: ${({ on, theme }) => (on ? theme.color.bgSecondary : "transparent")};
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

const ComparePickSym = styled.span`
  font-size: 0.78rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
`;

const ComparePickName = styled.span`
  font-size: 0.74rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ComparePickNote = styled.span`
  display: block;
  font-size: 0.64rem;
  color: ${({ theme }) => theme.color.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ComparePickTag = styled.span`
  font-size: 0.66rem;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const CompareHint = styled.p`
  margin: 0.5rem 0.2rem 0;
  font-size: 0.66rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textSecondary};
`;
