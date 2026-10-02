/* KEYBOARD SHORTCUTS REFERENCE
 * The shortcuts are the fastest way to use the extension and the least
 * discoverable part of it: the first-run tour mentions the buttons, not the
 * keys, and nothing else ever says they exist. This is the list — a section
 * of Settings, opened on its own with "?" from anywhere.
 *
 * The list is the single source of truth for what to advertise; the handlers
 * themselves live in app.js.
 */

const SHORTCUT_GROUPS = [
  {
    title: msg("sc_group_chart", "Chart"),
    items: [
      { keys: ["←", "→"], label: msg("sc_prev_next_coin", "Previous / next coin") },
      { keys: ["1", "–", "6"], label: msg("sc_switch_range", "Switch range, 1H through ALL") },
      { keys: ["/"], label: msg("sc_jump", "Jump to a coin by name") },
      { keys: ["R"], label: msg("sc_refresh", "Refresh now") },
    ],
  },
  {
    title: msg("sc_group_view", "View"),
    items: [
      { keys: ["T"], label: msg("sc_chart_type", "Line / candlestick chart") },
      { keys: ["G"], label: msg("sc_grid", "Price / time grid on the chart") },
      { keys: ["L"], label: msg("sc_calls", "Calls on / off") },
      { keys: ["[", "–", "]"], label: msg("sc_board_zoom", "Board reach: zoom out / in (calls on)") },
      { keys: ["↑", "↓"], label: msg("sc_board_walk", "With the board's now line focused: walk the board to higher / lower prices") },
      { keys: ["+", "-"], label: msg("sc_view_zoom2", "Zoom the chart in / out — in time, or the board's reach while calls are on") },
      { keys: ["←", "→"], label: msg("sc_view_read", "With the chart focused: read it point by point — the window follows past its edge") },
      { keys: ["Home", "End"], label: msg("sc_view_ends", "With the chart focused: its first / latest point") },
      { keys: ["Shift", "←", "→"], label: msg("sc_view_pan", "With the chart focused: move back / forward in time") },
      { keys: ["Shift"], label: msg("sc_ruler", "Hold and drag across the chart: the ruler") },
      { keys: ["Delete"], label: msg("sc_drawing_delete", "Remove the selected drawing") },
      { keys: ["X"], label: msg("sc_percent", "Percent / price change") },
      { keys: ["Y"], label: msg("sc_log_scale", "Log / plain price axis") },
      { keys: ["I"], label: msg("sc_save_image", "Save the chart as an image") },
      { keys: ["D"], label: msg("sc_theme", "Dark / light theme") },
      { keys: ["Space"], label: msg("sc_rotate", "Auto-rotate coins on / off") },
    ],
  },
  /* **The two columns, as the two groups** (26 Sep 2026). The keys were
   * listed by what they do ("View", "Open") while the screen had sorted the
   * same controls by where they are, so the list and the edges disagreed
   * about which things belong together. Each column opens first with its own
   * key — "," and "." — and then with a key per tab. */
  {
    title: msg("sc_group_left_column", "Beside the chart — the left column"),
    items: [
      { keys: [","], label: msg("sc_pull_column", "Pull the column out and move into it") },
      { keys: ["W"], label: msg("set_tab_widgets", "Widgets") },
      { keys: ["V"], label: msg("sc_chart_settings", "The chart's settings, beside the chart") },
      { keys: ["A"], label: msg("chrome_targets", "Price targets") },
      { keys: ["K"], label: msg("sc_calls_panel", "Calls — the board and the record") },
      { keys: ["C"], label: msg("sc_compare", "Compare with a second coin") },
    ],
  },
  {
    title: msg("sc_group_right_column", "Screens — the right column"),
    items: [
      { keys: ["."], label: msg("sc_pull_column", "Pull the column out and move into it") },
      { keys: ["S"], label: msg("chrome_settings", "Settings") },
      { keys: ["P"], label: msg("chrome_portfolio", "Portfolio") },
      {
        keys: ["F"],
        label: msg(
          "sc_futures_panel",
          "Derivatives market — simulated contracts, on a screen of their own",
        ),
      },
      { keys: ["N"], label: msg("sc_news_panel", "News — every source, filtered and dated") },
      {
        keys: ["B"],
        label: msg(
          "sc_base_rates",
          "Base rates — how often this coin has been here before",
        ),
      },
    ],
  },
  /* Settings' menu is the one menu with no tab in a column, so it is walked
   * by number while it is open — 1 is the top of the menu and 0 the tenth.
   * Each item names its number when the pointer rests on it. */
  {
    title: msg("sc_group_settings", "In Settings"),
    items: [
      { keys: ["1", "–", "9"], label: msg("sc_settings_sections", "A section of the menu, top to bottom") },
      { keys: ["0"], label: msg("sc_settings_tenth", "The tenth section") },
      { keys: ["?"], label: msg("sc_this_section", "These shortcuts, from anywhere — again to close") },
    ],
  },
  {
    title: msg("sc_group_portfolio", "In the portfolio"),
    items: [{ keys: ["H"], label: msg("sc_hide_amounts_open", "Hide / show your amounts") }],
  },
  {
    /* P8 — while the derivatives market (F) is open. */
    title: msg("sc_group_derivatives", "Derivatives market"),
    items: [
      { keys: ["B", "S"], label: msg("sc_side", "Long / short") },
      { keys: ["1", "–", "4"], label: msg("sc_size_share", "Size: 25%, 50%, 75%, 100%") },
      { keys: ["Enter"], label: msg("sc_order", "The order button — asks first if asking is on") },
      { keys: ["X"], label: msg("sc_close_contract", "Close the open contract — opens its ticket") },
    ],
  },
  {
    /* **The terminal's own controls** (27 Sep 2026) — keys that belong to
       whatever has the focus, not to the page: the chart, a level of the
       book, a seam. A key that works and is not listed does not exist. */
    title: msg("sc_group_derivatives_focus", "Derivatives market — on a focused control"),
    items: [
      { keys: ["←", "→"], label: msg("sc_chart_bars", "The chart: read the bars — Enter prices a limit at the one read") },
      { keys: ["↑", "↓"], label: msg("sc_book_levels", "The book: walk the levels — Enter puts one on the ticket") },
      { keys: ["←", "→", "↑", "↓"], label: msg("sc_seams", "A seam: resize the book, the ticket or the panel — Home and End for its ends") },
    ],
  },
  {
    title: msg("sc_group_anywhere", "Anywhere"),
    items: [{ keys: ["Esc"], label: msg("sc_close_open", "Close whatever is open") }],
  },
];

/* ── styles ────────────────────────────────────────────────────────────── */

/* The groups side by side on a wide pane and stacked on a narrow one. Each
 * group is a column of its own, so a key and its words stay on one line. */
const ShortcutGroups = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
  gap: 1.6rem 2.5rem;
  align-items: start;
`;

const ShortcutGroup = styled.section`
  min-width: 0;
`;

const ShortcutGroupTitle = styled.h4`
  margin: 0 0 0.45rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.66rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const ShortcutRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.32rem 0;
  font-size: 0.8rem;
`;

const ShortcutKeys = styled.div`
  flex: 0 0 5.5rem;
  display: flex;
  gap: 0.25rem;
  align-items: center;
`;

const Key = styled.kbd`
  min-width: 1.45rem;
  padding: 0.15rem 0.35rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-bottom-width: 2px;
  border-radius: 4px;
  background: ${({ theme }) => theme.color.bgSecondary};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.7rem;
  text-align: center;
  color: ${({ theme }) => theme.color.text};
`;

const KeySep = styled.span`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const ShortcutLabel = styled.span`
  flex: 1;
  min-width: 0;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.text};
`;

const ShortcutsNote = styled.p`
  margin: 1.8rem 0 0;
  font-size: 0.72rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* ── the section ───────────────────────────────────────────────────────── */

/* **A section of Settings, not a card of its own** (26 Sep 2026, *"keyboard
 * shortcut'ları ayrı bir menü açılıyor… ayarlar içerisinde açılmalı"*). It
 * was a dialog in the middle of the window, over the chart, with its own
 * scrim — the one reference card left after every other panel became a
 * screen or a drawer. It is read the way the settings are read, so it lives
 * among them: "?" opens Settings on it from anywhere, and it is the last
 * item of the menu. A plain function like the other sections; the title and
 * the line under it are the pane's. */
const renderShortcutsSection = () =>
  React.createElement(
    TabContent,
    { key: "shortcuts-tab", "data-shortcuts": "true" },
    React.createElement(
      ShortcutGroups,
      null,
      SHORTCUT_GROUPS.map((group) =>
        React.createElement(
          ShortcutGroup,
          { key: group.title },
          React.createElement(ShortcutGroupTitle, null, group.title),
          group.items.map((item) =>
            React.createElement(
              ShortcutRow,
              { key: item.label },
              React.createElement(
                ShortcutKeys,
                null,
                item.keys.map((key, i) =>
                  // A bare dash is a range ("1 – 6"), not a key to press
                  key === "–"
                    ? React.createElement(KeySep, { key: i }, "–")
                    : React.createElement(Key, { key: i }, key),
                ),
              ),
              React.createElement(ShortcutLabel, null, item.label),
            ),
          ),
        ),
      ),
    ),
    React.createElement(
      ShortcutsNote,
      null,
      msg(
        "sc_note_section",
        "Keys pause while you are typing in a field. Every tab in the two columns names its key when the pointer rests on it.",
      ),
    ),
  );
