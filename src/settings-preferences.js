/* SETTINGS — PREFERENCES TAB
 * Split out of settings.js, which had grown past the 800-line guideline and
 * made every settings change a scroll hunt. The panel still owns the state;
 * this only renders, reading it through the `panel` it is handed.
 *
 * ── Shape ─────────────────────────────────────────────────────────────────
 * Every control is built once, named, and put in `sections`. The groups below
 * are then nothing but an *order* — a list of names — which is the thing that
 * actually changes when the panel is reorganised. Before this, the controls
 * were written inline inside their groups, so moving one setting from
 * "Appearance" to "Chart" meant moving forty lines of `createElement` between
 * two nested argument lists and getting the parentheses right, and the order
 * of the panel was impossible to see without reading all eight hundred lines.
 * Now it is the eight lines at the bottom of this file.
 *
 * Every control goes through `panel.section(title, keywords, node)`, which is
 * what the search filters on — a control added without it will be invisible to
 * search. A section may return null (filtered out), and the search's answer
 * leaves out a group whose every child came back null, so it lists the
 * matches rather than empty headings (renderPreferencesSection).
 */
/* MODES
 *
 * One click that sets a dozen settings — the widget bundles' idea, one level
 * up. It sits above the groups because it is the only control in the panel that
 * moves other controls: put among them it would read as a thirteenth setting
 * competing with the twelve it changes.
 *
 * Two things it deliberately does not do. It does not remember which mode you
 * picked — the active pill is *recognised* from the settings (`activeAppMode`),
 * so the moment you change one by hand the row honestly says the arrangement is
 * yours, rather than going on claiming to be Minimal with the ticker back on.
 * And it does not hide what it did: every value goes through the same switch you
 * would have used, so the groups below always show the truth.
 *
 * The description under the row follows the pointer, because the useful moment
 * for "what does Fast mean" is *before* the click, not after.
 */
/* A setting's title, and the ring beside it when there is more to say.
 *
 * The one-line description under a title answers "what does this do". The note
 * behind the ring answers the question that actually costs people time: what it
 * *costs*, what it interacts with, and the gotcha. Those used to be either
 * missing or crammed into the caption — the tab-title setting had sixty words
 * at 0.65rem and half opacity, which is a place text goes to not be read.
 *
 * Only settings with something non-obvious get a ring. A ring on every row is
 * noise, and noise is what people learn to skip.
 */
/* The settings a key also flips, and the key — drawn in the row beside the
 * title, the way every panel names its own key now (see KeyCap). The list
 * is the "?" page's: a key here that is not in SHORTCUT_GROUPS would be a
 * promise the handler does not keep. */
const SETTING_KEYS = { candlesticks: "T", chartGrid: "G", logScale: "Y", theme: "D" };

const settingTitle = (panel, key, title) =>
  React.createElement(
    SettingTitleRow,
    null,
    React.createElement(ToggleSectionTitle, { style: { margin: 0 } }, title),
    SETTING_KEYS[key] ? keyCap(SETTING_KEYS[key], { quiet: true }) : null,
    React.createElement(
      SettingInfoBtn,
      {
        active: panel.state.openInfo === key,
        onClick: () =>
          panel.setState((prev) => ({
            openInfo: prev.openInfo === key ? null : key,
          })),
        title: `About ${title}`,
        "aria-label": `About ${title}`,
        "aria-expanded": panel.state.openInfo === key ? "true" : "false",
      },
      icon("info", 0.8),
    ),
  );

/* The note, revealed under the description. Mounted either way so it eases
 * open, like every other dependent row in this panel. */
const settingNote = (panel, key, text) => {
  const open = panel.state.openInfo === key;
  return React.createElement(
    SettingReveal,
    {
      key: `${key}-note`,
      open,
      /* Clipped is not hidden. `SettingReveal` collapses with `max-height: 0`
       * and `opacity: 0`, which keeps the text in the accessibility tree — so a
       * screen reader would read out every note on the panel while the button
       * beside each one said `aria-expanded="false"`. Hiding it while it is
       * closed is what makes that attribute true. */
      "aria-hidden": open ? undefined : "true",
    },
    React.createElement(SettingNote, null, text),
  );
};

/* Custom is the fifth chip and the only one this file cannot describe: its
 * contents are whatever was saved into it. See `CUSTOM_MODE_KEY`. */
const CUSTOM_MODE = {
  value: "custom",
  label: "Custom",
  desc: "Your own arrangement, saved. Press Save to keep what is on screen now; press Custom to bring it back.",
};

const renderModeRow = (panel) => {
  const { appMode, onAppMode, customSaved, customActive, onSaveCustomMode } =
    panel.props;
  /* An empty slot is offered but does nothing, and says so — the alternative
   * is hiding it until something is saved, which leaves nowhere to discover
   * that saving is possible. */
  const modes = APP_MODES.concat([CUSTOM_MODE]);
  const hovered = modes.find((m) => m.value === panel.state.modeHover);
  const active = customActive
    ? CUSTOM_MODE
    : modes.find((m) => m.value === appMode);
  const shown = hovered || active;
  return React.createElement(
    ModeSection,
    { key: "modes" },
    React.createElement(
      ModeHeader,
      null,
      /* No label: the row has its own section of Settings since 26 Sep
         2026, whose head says "Modes" — the two were one word twice. The
         empty cell keeps Save at the line's far end. */
      React.createElement("span"),
      /* Save, on the label's line — see `ModeSaveButton`. */
      React.createElement(
        ModeSaveButton,
        {
          onClick: () => onSaveCustomMode && onSaveCustomMode(),
          onMouseEnter: () => panel.setState({ modeHover: "custom" }),
          onFocus: () => panel.setState({ modeHover: "custom" }),
          title: msg(
            "pref_mode_custom_save_title",
            "Keep what is on screen now as Custom, replacing anything saved before",
          ),
        },
        customSaved
          ? msg("pref_mode_custom_resave", "Save again")
          : msg("pref_mode_custom_save", "Save"),
      ),
    ),
    React.createElement(
      PresetRow,
      { onMouseLeave: () => panel.setState({ modeHover: null }) },
      ...modes.map((mode) => {
        const isCustom = mode.value === "custom";
        return React.createElement(
          PresetButton,
          {
            key: mode.value,
            type: "button",
            active: isCustom ? customActive : appMode === mode.value,
            /* An empty Custom is inert rather than absent: pressing it must not
             * write a set of defaults nobody chose, and hiding it would leave
             * nowhere to find out that saving exists. */
            disabled: isCustom && !customSaved,
            onClick: () => onAppMode && onAppMode(mode.value),
            onMouseEnter: () => panel.setState({ modeHover: mode.value }),
            onFocus: () => panel.setState({ modeHover: mode.value }),
            title:
              isCustom && !customSaved
                ? msg(
                    "pref_mode_custom_empty",
                    "Nothing saved yet — press Save to keep the arrangement you have now",
                  )
                : mode.desc,
          },
          isCustom ? msg("pref_mode_custom", "Custom") : mode.label,
        );
      }),
    ),
    React.createElement(
      ModeDesc,
      { dim: !shown },
      shown
        ? shown.value === "custom"
          ? customSaved
            ? msg(
                "pref_mode_custom_desc",
                "Your own arrangement, saved. Press Custom to bring it back; Save again replaces it with what is on screen now.",
              )
            : msg(
                "pref_mode_custom_desc_empty",
                "Nothing saved yet. Set the app up how you like it, then press Save — pressing another mode will not lose it after that.",
              )
          : shown.desc
        : msg(
          "pref_modes_own_sections",
          "Not one of these. A mode sets a dozen of the settings in the other sections at once; currency, number format and theme are always left as you have them.",
        ),
    ),
  );
};

/* **Every setting this panel can draw, as a map of builders.**
 *
 * Lifted out of `renderPreferencesTab` on 23 Sep 2026 so a second surface
 * could render some of them: the chart's own settings now open in a drawer
 * beside the chart (`chart-settings.js`), and a drawer with its own copy of
 * nine controls is a drawer that drifts from this one the first time
 * somebody adds a switch. One definition, two places that ask for it.
 *
 * Nothing inside moved a character. The block already reached for the panel
 * through `panel.props` and almost nothing else — measured before the cut,
 * the nine chart sections touch `panel.section` and `panel.setState` and
 * no other member — so a caller that is not the Settings panel only has to
 * hand over those two and the props the sections read.
 */
/* **The settings that are about the chart, in the order they are drawn.**
 *
 * One list, because two surfaces read it: this tab's "The chart" group, and
 * the drawer that slides in beside the chart (`chart-settings.js`). A second
 * copy would drift the first time a switch was added — the same hazard
 * `WIDGET_GROUPS` already warns about, where adding a widget means four
 * lists in two files. */
const CHART_SETTING_KEYS = [
  "candlesticks",
  "chartColor",
  "volumeBars",
  "chartGrid",
  "logScale",
  "chartAverage",
  "indicatorOverlay",
  "companion",
  "chartStudies",
  "chartChances",
  "chartTools",
  "macroEvents",
  "moveNews",
  "chartDetails",
  "quietChrome",
  "tabKeys",
];

/* **Twelve rows in three kinds** (27 Sep 2026, *"özellikle chart
 * ayarlarında tasarımsal sıkıntılar var"*). One undivided list of twelve
 * switches read as twelve equal things; they are three — how the chart is
 * drawn, what is drawn on it, and what sits around it. A heading goes in
 * before the key it names, in the drawer and in Settings' "The chart" alike,
 * and nowhere else: the list above stays the one list, so neither can gain
 * a row the other lacks. */
const CHART_SETTING_HEADS = {
  candlesticks: msg("pref_chart_sub_drawn", "How it is drawn"),
  chartAverage: msg("pref_chart_sub_on", "Drawn on it"),
  chartDetails: msg("pref_chart_sub_around", "Around it"),
};

/* The chart's rows as built, each with its heading in front of it. `rows` is
   [[key, node]] for the rows a builder returned. */
const withChartHeads = (rows) => {
  const out = [];
  for (const [key, node] of rows) {
    if (CHART_SETTING_HEADS[key]) {
      out.push(
        React.createElement(
          PrefSubhead,
          { key: `head-${key}`, "data-chart-group": key },
          CHART_SETTING_HEADS[key],
        ),
      );
    }
    out.push(node);
  }
  return out;
};

const settingSections = (panel) => {
  const {
  themePreference, activeTheme, onThemeChange,
  directionPalette, onDirectionPaletteChange,
  language, onLanguageChange,
  chartColor, onChartColorChange,
  chartType, onChartTypeChange,
  volumeBars, onVolumeBarsChange,
  marketStats, onMarketStatsChange,
  chartGrid, onChartGridChange,
  logScale, onLogScaleChange,
  chartAverage, onChartAverageChange,
  macroEvents, onMacroEventsChange,
  companion, onCompanionChange,
  companionHidden, onCompanionMetricToggle,
  indicatorOverlays, onIndicatorOverlayChange,
  chartStudies, onChartStudyToggle,
  chartChances, cellOdds, onChartChanceToggle,
  moveNews, onMoveNewsChange,
  quietChrome, onQuietChromeChange,
  tabKeys, onTabKeysChange,
  chartToolsShown, onChartToolsShownChange,
  moveHeadlines, onMoveHeadlinesChange,
  ohlcEnabled, onOhlcChange,
  lastSeenEnabled, onLastSeenChange,
  alertTabTitle, onAlertTabTitleChange,
  currency, onCurrencyChange,
  decimalPlaces, onDecimalPlacesChange,
  separatorFormat, onSeparatorFormatChange,
  refreshInterval, onRefreshIntervalChange,
  autoRotate, onAutoRotateChange,
  autoRotateInterval, onAutoRotateIntervalChange,
  tickerEnabled, onTickerChange, tickerFormat, onTickerFormatChange,
  pageTicker, onPageTickerChange,
  pageTickerPosition, onPageTickerPositionChange,
  newsTicker, onNewsTickerChange,
  newsFilter, onNewsFilterChange,
  practiceEnabled, practiceConsent, onPracticeAccept,
  practiceDock, onPracticeDockChange,
  practiceConfirm, onPracticeConfirmChange,
  features, onFeatureChange,
  } = panel.props;

  return {

    /* Language sits above Theme because it is the same kind of setting and the
     * more fundamental one: both have an Auto that means "follow the browser",
     * and Auto is the default for both. The description says which language
     * that actually resolved to — "Auto" on its own is a promise the person
     * cannot check.
     *
     * Changing it reloads the page, and the button says so before it happens.
     * Every string on screen was built during a render that has already run,
     * the `Intl` formatters are cached per locale, and a live swap would leave
     * a chart drawn in one language beside a panel drawn in another. */
    language: () => {
      const current = typeof activeLocale === "function" ? activeLocale() : "en";
      const named = SUPPORTED_LOCALES.find((l) => l.value === current);
      const chosen = language || DEFAULT_LANGUAGE;
      return panel.section(
        msg("pref_language_title", "Language"),
        msg("pref_language_keywords", "language locale translate english turkish spanish german french chinese japanese auto"),
        React.createElement(
          NumberFormatSection,
          null,
          React.createElement(NumberFormatLabel, null, msg("pref_language_label", "Language")),
          React.createElement(
            NumberFormatSelect,
            {
              value: chosen,
              "aria-label": msg("pref_language_aria", "Language"),
              onChange: (e) => onLanguageChange && onLanguageChange(e.target.value),
            },
            /* Just "Auto". What auto *means* is the line under the field —
             * "Following Chrome — English" — which says it with the answer in
             * it. Saying it twice made the closed field the longest control in
             * the panel to carry a word the caption already had. */
            React.createElement(
              "option",
              { key: "auto", value: "auto" },
              msg("pref_language_auto", "Auto"),
            ),
            SUPPORTED_LOCALES.map((option) =>
              React.createElement(
                "option",
                { key: option.value, value: option.value },
                option.label,
              ),
            ),
          ),
          React.createElement(
            ThemeDescription,
            null,
            chosen === DEFAULT_LANGUAGE
              ? msg("pref_language_following", "Following Chrome — $1", named ? named.label : "English")
              : msg(
                  "pref_language_chosen",
                  "Chosen by you. The page reloads when you change it.",
                ),
          ),
        ),
      );
    },
    theme: () =>
        panel.section(
          msg("pref_theme_title", "Theme"),
          msg("pref_theme_keywords", "dark light auto system colour"),
          React.createElement(
            ThemeSection,
            null,
            React.createElement(ThemeSectionTitle, null, msg("pref_theme_heading", "Theme")),
            React.createElement(
              ThemeButtonGroup,
              null,
              React.createElement(
                ThemeButton,
                {
                  active: themePreference === "auto",
                  onClick: () => onThemeChange && onThemeChange("auto"),
                },
                msg("pref_theme_auto", "Auto"),
              ),
              React.createElement(
                ThemeButton,
                {
                  active: themePreference === "light",
                  onClick: () => onThemeChange && onThemeChange("light"),
                },
                msg("pref_theme_light", "Light"),
              ),
              React.createElement(
                ThemeButton,
                {
                  active: themePreference === "dark",
                  onClick: () => onThemeChange && onThemeChange("dark"),
                },
                msg("pref_theme_dark", "Dark"),
              ),
            ),
            React.createElement(
              ThemeDescription,
              null,
              themePreference === "auto"
                ? msg("pref_theme_using_auto", "Using $1 mode (system preference)", activeTheme)
                : msg("pref_theme_using", "Using $1 mode", themePreference),
            ),
          ),
        ),
    /* Up and down, as green/red or as blue/orange for colour-blind readers
       (theme.js). Beside the theme because it repaints every screen. */
    directionColors: () =>
      panel.section(
        msg("pref_dir_title", "Up and Down Colours"),
        msg("pref_dir_keywords", "colour color blind colorblind deuteranopia protanopia green red blue orange up down palette accessibility"),
        React.createElement(
          ThemeSection,
          { "data-direction-palette": directionPalette === "cvd" ? "cvd" : "classic" },
          React.createElement(ThemeSectionTitle, null, msg("pref_dir_heading", "Up and Down Colours")),
          React.createElement(
            ThemeButtonGroup,
            null,
            ...[
              ["classic", msg("pref_dir_classic", "Green / red")],
              ["cvd", msg("pref_dir_cvd", "Blue / orange")],
            ].map(([value, label]) =>
              React.createElement(
                ThemeButton,
                {
                  key: value,
                  active: (directionPalette === "cvd" ? "cvd" : "classic") === value,
                  "aria-pressed": (directionPalette === "cvd" ? "cvd" : "classic") === value ? "true" : "false",
                  "data-direction-choice": value,
                  onClick: () => onDirectionPaletteChange && onDirectionPaletteChange(value),
                },
                label,
              ),
            ),
          ),
          React.createElement(
            ThemeDescription,
            null,
            msg(
              "pref_dir_desc",
              "Blue and orange stay apart for red–green colour blindness, the most common kind. Every rise and fall in the app changes with it.",
            ),
          ),
        ),
      ),
    chartColor: () =>
        panel.section(
          msg("pref_chart_color_title", "Chart Color"),
          msg("pref_chart_color_keywords", "green red fill trend colour"),
          React.createElement(
            ToggleSection,
            null,
            React.createElement(ToggleSectionTitle, null, msg("pref_chart_color_heading", "Chart Color")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_chart_color_desc2", "Coloured by whether the range went up or down, in the colours chosen under Basics — turn off for a plain line"),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                chartColor === false ? msg("toggle_off", "Off") : msg("toggle_on", "On"),
              ),
              React.createElement(ToggleSwitch, {
                active: chartColor !== false,
                "aria-pressed": (chartColor !== false) ? "true" : "false",
                onClick: () =>
                  onChartColorChange && onChartColorChange(chartColor === false),
                "aria-label": msg("pref_chart_color_aria", "Toggle chart color"),
              }),
            ),
          ),
        ),
    /* The + over the chart that opens to the ruler and the drawing tools. */
    chartTools: () =>
      panel.section(
        msg("pref_tools_title", "Chart Tools"),
        msg("pref_tools_keywords", "tools toolbar draw drawing ruler measure line trend ray box note plus"),
        React.createElement(
          ToggleSection,
          null,
          settingTitle(panel, "chartTools", msg("pref_tools_heading", "Chart Tools")),
          React.createElement(
            ToggleSectionDesc,
            null,
            msg("pref_tools_desc2", "A + at the right end of the range buttons that opens to the ruler and the drawing tools — on a press, or after the pointer rests on it for a second"),
          ),
          settingNote(
            panel,
            "chartTools",
            msg("pref_tools_note", "Pointing at a tool says its name and what it does. Off takes the + away and nothing else: your drawings stay on the chart and in the list below, and Shift + drag still measures."),
          ),
          React.createElement(
            ToggleRow,
            null,
            React.createElement(
              ToggleLabel,
              null,
              chartToolsShown !== false ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
            ),
            React.createElement(ToggleSwitch, {
              active: chartToolsShown !== false,
              "aria-pressed": chartToolsShown !== false ? "true" : "false",
              "data-chart-tools-setting": "1",
              onClick: () =>
                onChartToolsShownChange && onChartToolsShownChange(chartToolsShown === false),
              "aria-label": msg("pref_tools_aria", "Show or hide the chart tools"),
            }),
          ),
        ),
      ),
    quietChrome: () =>
      panel.section(
        msg("pref_quiet_chrome_title", "Quiet Controls"),
        msg("pref_quiet_chrome_keywords", "quiet minimal fade hide corner buttons chrome opacity keyboard focus pull tabs edge"),
        React.createElement(
          ToggleSection,
          null,
          settingTitle(panel, "quietChrome", msg("pref_quiet_chrome_heading", "Quiet Controls")),
          React.createElement(
            ToggleSectionDesc,
            null,
            /* New keys, not new words under the old ones (26 Sep 2026): the
               corner buttons this described became the two edges' tabs, and
               twelve catalogues would have gone on describing the corner. */
            msg("pref_quiet_pulls_desc", "Let the two pulls at the window's edges rest faint and come to full when you point at them. Nothing is hidden and nothing stops working — the keys still do what they did"),
          ),
          settingNote(
            panel,
            "quietChrome",
            msg("pref_quiet_pulls_note", "The pull on the left brings out the chart's tabs, the one on the right the screens' — Settings among them, so neither goes quieter than you can find it. Both come to full under the pointer and on keyboard focus, and the shortcuts work whatever they look like."),
          ),
          React.createElement(
            ToggleRow,
            null,
            React.createElement(
              ToggleLabel,
              null,
              quietChrome === true ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
            ),
            React.createElement(ToggleSwitch, {
              active: quietChrome === true,
              "aria-pressed": (quietChrome === true) ? "true" : "false",
              onClick: () =>
                onQuietChromeChange && onQuietChromeChange(quietChrome !== true),
              "aria-label": msg("pref_quiet_chrome_aria", "Toggle quiet controls"),
            }),
          ),
        ),
      ),
    /* The key letters under the edges' tabs (TAB_KEYS_KEY), on or off. */
    tabKeys: () =>
      panel.section(
        msg("pref_tab_keys_title", "Keys on the Tabs"),
        msg("pref_tab_keys_keywords", "keyboard shortcut keys letters tabs edge column pull hide show keycap"),
        React.createElement(
          ToggleSection,
          null,
          settingTitle(panel, "tabKeys", msg("pref_tab_keys_heading", "Keys on the Tabs")),
          React.createElement(
            ToggleSectionDesc,
            null,
            msg("pref_tab_keys_desc", "The shortcut letter under each tab on the two edges. Off hides the letters only — the keys still work, and each tab's tooltip still names its key"),
          ),
          React.createElement(
            ToggleRow,
            null,
            React.createElement(ToggleLabel, null, tabKeys !== false ? msg("toggle_on", "On") : msg("toggle_off", "Off")),
            React.createElement(ToggleSwitch, {
              active: tabKeys !== false,
              "aria-pressed": tabKeys !== false ? "true" : "false",
              onClick: () => onTabKeysChange && onTabKeysChange(tabKeys === false),
              "aria-label": msg("pref_tab_keys_aria", "Show the shortcut letters on the tabs"),
              "data-tab-keys-switch": "1",
            }),
          ),
        ),
      ),
    /* **Every feature the app has, on one screen, with a switch each.**
     *
     * PriceTab has grown eight things you can open and nobody wants all
     * eight. This is where they are chosen. It replaced two smaller answers
     * that were each half of it: a "Corner Controls" list that only hid
     * *buttons* — leaving the shortcut working, which is not what a switch
     * marked off means — and a Futures section of its own, which had no
     * reason to be separate once every other feature was here.
     *
     * **Off is a real off**: no button, no shortcut, no way in. That is the
     * promise, and it is asserted in `app.js` by every corner control and
     * every key going through one `featureOn`.
     *
     * **Settings is not on this list and must never be.** It is the way back
     * to this screen: a switch that could turn it off is one press away from
     * locking somebody out of their own preferences.
     *
     * One row per feature rather than one group per feature: these are the
     * same kind of choice about the same kind of thing, and eight accordions
     * would be eight places to look for one answer. */
    features: () =>
      panel.section(
        msg("pref_features_title", "Features"),
        msg(
          "pref_features_keywords",
          "features on off enable disable hide show buttons icons targets calls derivatives market futures news base rates portfolio compare widgets clutter simplify",
        ),
        React.createElement(
          ToggleSection,
          null,
          settingTitle(panel, "features", msg("pref_features_heading", "Features")),
          React.createElement(
            ToggleSectionDesc,
            null,
            msg(
              "pref_features_desc",
              "Choose what this tab has. Switching one off takes away its button and its shortcut — the chart, the price and this screen are always there",
            ),
          ),
          settingNote(
            panel,
            "features",
            msg(
              "pref_features_note",
              "Settings is not on this list and cannot be switched off: it is the way back to this screen. Nothing is deleted by turning a feature off — your targets, calls, positions and holdings are exactly where you left them, and switching it back on finds them there. Quiet Controls is the gentler version of this: it fades the buttons rather than removing the features.",
            ),
          ),
          React.createElement(
            FeatureList,
            null,
            ...FEATURE_CONTROLS.map((c) => {
            /* **Futures reads as off until the terms have been read**, and
               that is not a cosmetic choice: without consent the section
               opens onto the terms and nothing else — no ticket, no balance,
               no button that opens anything — so a switch showing "on" would
               be describing something that is not available. It also makes
               the first press ask, which is the whole of what this row is
               for. Accepting is what turns it on, from either route. */
            const on =
              c.key === "futures"
                ? practiceEnabled === true && practiceConsent === true
                : (features || {})[c.key] !== false;
            return React.createElement(
              Fragment,
              { key: c.key },
              React.createElement(
                ToggleRow,
                null,
                /* The feature's key drawn as every key is (KeyCap), where
                   it was "(A)" in the label's own words. */
                React.createElement(
                  ToggleLabel,
                  { style: { display: "inline-flex", alignItems: "center", gap: "0.5rem" } },
                  c.label,
                  c.shortcut ? keyCap(c.shortcut, { quiet: true }) : null,
                ),
                React.createElement(ToggleSwitch, {
                  active: on,
                  "aria-pressed": (on) ? "true" : "false",
                  /* **Futures cannot be switched on without reading what it
                     is.** Every other row here is a preference; this one adds
                     a leveraged simulation with an imaginary balance, and the
                     Chrome Web Store's rule for a simulation that offers no
                     winnings is that it must *clearly* say so. So the first
                     time it is asked for, the switch does not move — the
                     terms open under it and the switch follows the answer.
                     Asked again on every attempt until it is accepted, and
                     never again once it is: this is a fact about what the
                     thing is, and it does not change while the switch is
                     down. */
                  onClick: () => {
                    if (c.key === "futures" && !on && practiceConsent !== true) {
                      panel.setState({ practiceAsk: true });
                      return;
                    }
                    if (c.key === "futures") panel.setState({ practiceAsk: false });
                    if (onFeatureChange) onFeatureChange(c.key, !on);
                  },
                  "aria-label": msg("pref_features_aria", "Turn $1 on or off", c.label),
                }),
              ),
              /* The terms, in the same words the panel's own screen uses —
                 one statement of what this is, not two that can drift. */
              c.key === "futures" && panel.state.practiceAsk && practiceConsent !== true
                ? React.createElement(
                    SettingNote,
                    { "data-practice-terms": "true" },
                    React.createElement(
                      ToggleSectionTitle,
                      null,
                      msg("pos_terms_title", "Before you start"),
                    ),
                    React.createElement(
                      "ul",
                      null,
                      ...[
                        msg(
                          "pos_terms_1",
                          "This is a simulation. No order is placed, nothing is sent anywhere, and there is no exchange, broker or account behind it.",
                        ),
                        msg(
                          "pos_terms_2",
                          "The balance is imaginary and has no value. It cannot be bought, topped up, transferred, withdrawn or redeemed, and clearing your browser data ends it.",
                        ),
                        msg(
                          "pos_terms_3",
                          "Prices are real, but the result is not: a real venue has spreads, queues, slippage and outages this does not reproduce.",
                        ),
                        msg(
                          "pos_terms_4",
                          "Nothing here is financial advice, and a result here says nothing about how you would do with money. Leveraged trading with real money can lose more than you put in.",
                        ),
                      ].map((t, i) => React.createElement("li", { key: i }, t)),
                    ),
                    React.createElement(
                      PracticeTermsRow,
                      null,
                      React.createElement(
                        SettingsActionButton,
                        {
                          "data-practice-accept": "true",
                          onClick: () => {
                            panel.setState({ practiceAsk: false });
                            if (onPracticeAccept) onPracticeAccept();
                          },
                        },
                        msg("pref_practice_accept", "I have read this — turn it on"),
                      ),
                      React.createElement(
                        PresetButton,
                        {
                          onClick: () => panel.setState({ practiceAsk: false }),
                        },
                        msg("pref_practice_decline", "Not now"),
                      ),
                    ),
                  )
                : null,
              );
            }),
          ),
        ),
      ),

    candlesticks: () =>
        panel.section(
          msg("pref_candlesticks_title", "Candlesticks"),
          msg("pref_candlesticks_keywords", "candle ohlc bars japanese kraken request cost"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "candlesticks", msg("pref_candlesticks_heading", "Candlesticks")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_candlesticks_desc", "Draw open/high/low/close bars instead of a price line. Ranges without candle data stay on the line"),
            ),
            settingNote(
              panel,
              "candlesticks",
              msg("pref_candlesticks_note", "Cheaper than it looks: the candles are the only request the chart makes, because the price line is derived from their closes. The ALL range comes from Kraken — no other source reaches back years, and BTC goes to 2013. A coin or currency with no candle data stays on the line rather than showing you an empty chart."),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                chartType === "candles" ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
              ),
              React.createElement(ToggleSwitch, {
                active: chartType === "candles",
                "aria-pressed": (chartType === "candles") ? "true" : "false",
                onClick: () =>
                  onChartTypeChange &&
                  onChartTypeChange(chartType === "candles" ? "line" : "candles"),
                "aria-label": msg("pref_candlesticks_aria", "Toggle candlestick chart"),
              }),
            ),
          ),
        ),
    volumeBars: () =>
        panel.section(
          msg("pref_volume_bars_title", "Volume Bars"),
          msg("pref_volume_bars_keywords", "volume band bars traded activity"),
          // Only means anything on the candlestick chart, so it stays
          // out of the way until that is on — mounted either way, so it
          // eases open rather than appearing from nowhere
          React.createElement(
            SettingReveal,
            {
              key: 'volume-bars',
              open: chartType === 'candles',
            },
            React.createElement(
              ToggleSection,
              null,
              React.createElement(ToggleSectionTitle, null, msg("pref_volume_bars_heading", "Volume Bars")),
              React.createElement(
                ToggleSectionDesc,
                null,
                msg("pref_volume_bars_desc", "Show traded volume as a band along the bottom of the chart"),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(
                  ToggleLabel,
                  null,
                  volumeBars === false ? msg("toggle_off", "Off") : msg("toggle_on", "On"),
                ),
                React.createElement(ToggleSwitch, {
                  active: volumeBars !== false,
                  "aria-pressed": (volumeBars !== false) ? "true" : "false",
                  onClick: () =>
                    onVolumeBarsChange &&
                    onVolumeBarsChange(volumeBars === false),
                  "aria-label": msg("pref_volume_bars_aria", "Toggle volume bars"),
                }),
              ),
            ),
          ),
          chartType === 'candles',
        ),
    chartGrid: () =>
        panel.section(
          msg("pref_chart_grid_title", "Chart Grid"),
          msg("pref_chart_grid_keywords", "grid mesh levels gridlines price time axis estimate target calls squares"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "chartGrid", msg("pref_chart_grid_heading", "Chart Grid")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_chart_grid_desc", "Price levels and time divisions behind the chart, so you can read a level off it. Hover a cell to light it up"),
            ),
            settingNote(
              panel,
              "chartGrid",
              msg("pref_chart_grid_note", "This governs the plain chart, and the G key does the same thing. With calls switched on the mesh is drawn either way — the squares you point at are the grid — so there is nothing for this switch to change while you are playing."),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                chartGrid === true ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
              ),
              React.createElement(ToggleSwitch, {
                active: chartGrid === true,
                "aria-pressed": (chartGrid === true) ? "true" : "false",
                onClick: () =>
                  onChartGridChange && onChartGridChange(chartGrid !== true),
                "aria-label": msg("pref_chart_grid_aria", "Toggle chart grid"),
              }),
            ),
          ),
        ),
    chartAverage: () =>
        panel.section(
          msg("pref_average_title", "Average Line"),
          msg("pref_average_keywords", "moving average ma trend smooth mean line 50 200"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "chartAverage", msg("pref_average_heading", "Average Line")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg(
                "pref_average_desc",
                "A moving average over the range you are looking at, so the trend under the noise has a line",
              ),
            ),
            settingNote(
              panel,
              "chartAverage",
              msg(
                "pref_average_note",
                "It averages a sixth of whatever is on screen, and the line says how long that is — “avg 2 months” on the year, “avg 10 min” on the hour. It is deliberately not the 50- or 200-day line: those names mean days, and a point on this chart is half a minute on one range and a fortnight on another, so a line called “200” would be eight years wide on one and three hours on the next. The same arithmetic the base-rate panel reads its 200-day regime row from.",
              ),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                chartAverage === true ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
              ),
              React.createElement(ToggleSwitch, {
                active: chartAverage === true,
                "aria-pressed": (chartAverage === true) ? "true" : "false",
                onClick: () =>
                  onChartAverageChange && onChartAverageChange(chartAverage !== true),
                "aria-label": msg("pref_average_aria", "Toggle the moving-average line"),
              }),
            ),
          ),
        ),
    /* **US CPI releases on the chart, and the line under the price** (27 Sep
     * 2026). On by default: it costs no request, the calendar ships with the
     * extension. */
    macroEvents: () =>
        panel.section(
          msg("pref_macro_title", "US Releases"),
          msg("pref_macro_keywords", "cpi inflation consumer price index macro event release calendar news schedule fed"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "macroEvents", msg("pref_macro_heading", "US Releases")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg(
                "pref_macro_desc",
                "Marks each US CPI release on the chart, and says under the price when the next one is close",
              ),
            ),
            settingNote(
              panel,
              "macroEvents",
              msg(
                "pref_macro_note",
                "The Consumer Price Index comes out at 08:30 New York time. On Coinbase's own minute candles, BTC moved more in the half hour after it than in any of the seven half hours before it on 28 of the 36 releases of 2022–2024 — chance would give four or five. What the last twelve did to the coin on screen is on the base-rate screen (B). The calendar is read from the Bureau of Labor Statistics and ships with the extension, so nothing is asked for it; past its last date nothing more is marked.",
              ),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                macroEvents !== false ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
              ),
              React.createElement(ToggleSwitch, {
                active: macroEvents !== false,
                "aria-pressed": (macroEvents !== false) ? "true" : "false",
                onClick: () =>
                  onMacroEventsChange && onMacroEventsChange(macroEvents === false),
                "aria-label": msg("pref_macro_aria", "Toggle the US release markers"),
              }),
            ),
          ),
        ),
    /* **The chart companion** (27 Sep 2026): the chart names the setups it
     * finds where they are, with this coin's record for each. Off by default:
     * it reads the coin's whole daily history. */
    /* **One chip per metric** (27 Sep 2026, *"bu metrikler grafik
     * ayarlarında da olsun"*): under the switch, while it is on, every
     * pattern and setup the companion can name, each pressed while it is
     * shown. The same section in Settings and in the chart's drawer. */
    companion: () => {
      const node = panel.section(
          msg("pref_companion_title", "Chart Companion"),
          msg("pref_companion_keywords", "companion pattern patterns head and shoulders double top bottom formation setup strategy technical analysis"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "companion", msg("pref_companion_heading", "Chart Companion")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg(
                "pref_companion_desc2",
                "Names what it finds where it happened — head and shoulders, double tops and bottoms, and the setups common strategies wait for, from golden crosses to Supertrend flips — each with its record on this coin",
              ),
            ),
            settingNote(
              panel,
              "companion",
              msg(
                "pref_companion_note2",
                "Found by rule on the daily candles, never by eye. A pattern is read from swing points — a day higher (or lower) than the five on either side, used only once those five days have happened — and drawn with its points, its neckline, the target its height measures and the level that would undo it, followed for 90 days; the four patterns completed 60 times in eleven years of BTC, ETH, SOL and LTC together, too rare to compare with an ordinary day. The twelve strategy setups — crosses, 20-day breakouts, closes outside the Bollinger bands, Supertrend flips, squeezes — are numbered on the chart by their latest entry when it is recent and listed in its corner with how often the price was up ten days later, beside an ordinary day; tested together on the same four coins, none of them was distinguishable from an ordinary day either. So nothing here is called better or worse, and nothing is a signal. It reads the coin's whole daily history, about fifteen requests the first time and then twelve hours from the cache, which is why it is off until switched on.",
              ),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                companion === true ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
              ),
              React.createElement(ToggleSwitch, {
                active: companion === true,
                "aria-pressed": (companion === true) ? "true" : "false",
                onClick: () => onCompanionChange && onCompanionChange(companion !== true),
                "aria-label": msg("pref_companion_aria", "Toggle the chart companion"),
              }),
            ),
          ),
        );
      if (!node) return null;
      const hidden = companionHidden || [];
      const chip = (id, label) =>
        React.createElement(
          MetricChip,
          {
            key: id,
            active: !hidden.includes(id),
            "aria-pressed": hidden.includes(id) ? "false" : "true",
            "data-companion-metric": id,
            onClick: () => onCompanionMetricToggle && onCompanionMetricToggle(id),
          },
          label,
        );
      /* A group: its name, how many are shown, All / None, then its chips
         wrapping across the drawer's width. */
      const group = (key, label, aria, list) => {
        const ids = list.map((d) => d.id);
        const shown = ids.filter((id) => !hidden.includes(id)).length;
        const set = (on) => onCompanionMetricToggle && onCompanionMetricToggle(ids, on);
        return React.createElement(
          Fragment,
          { key },
          React.createElement(
            MetricGroupHead,
            null,
            React.createElement(MetricGroupLabel, null, label),
            React.createElement(MetricGroupCount, { "data-companion-count": key }, msg("pref_companion_shown", "$1 of $2 shown", String(shown), String(ids.length))),
            React.createElement(
              MetricGroupAct,
              { onClick: () => set(true), disabled: shown === ids.length, "aria-label": msg("pref_companion_all_aria", "Show every one of $1", label) },
              msg("pref_companion_all", "All"),
            ),
            React.createElement(
              MetricGroupAct,
              { onClick: () => set(false), disabled: shown === 0, "aria-label": msg("pref_companion_none_aria", "Hide every one of $1", label) },
              msg("pref_companion_none", "None"),
            ),
          ),
          React.createElement(MetricChips, { role: "group", "aria-label": aria }, ...list.map((d) => chip(d.id, d.title))),
        );
      };
      return React.createElement(
        Fragment,
        { key: "companion" },
        node,
        React.createElement(
          SettingReveal,
          { key: "companion-metrics", open: companion === true, "aria-hidden": companion === true ? undefined : "true" },
          React.createElement(
            CompanionMetrics,
            { "data-companion-metrics": "true" },
            group("patterns", msg("pref_companion_patterns", "Patterns"), msg("pref_companion_patterns_aria", "Which patterns the companion names"), COMPANION_PATTERN_DEFS),
            group("setups", msg("pref_companion_setups", "Strategy setups"), msg("pref_companion_setups_aria", "Which strategy setups the companion names"), STRATEGY_SETUPS),
            group("readings", msg("pref_companion_readings", "Readings"), msg("pref_companion_readings_aria", "Which readings the companion names — divergences, Ichimoku, stochastic, levels, stretches"), COMPANION_READINGS),
          ),
        ),
      );
    },
    /* **Indicator lines** (27 Sep 2026): classic overlays from the coin's
     * daily candles, any number at once — each pill adds its lines or takes
     * them away, and None takes them all away. Pills like the theme's,
     * because the choices are few and named. */
    indicatorOverlay: () =>
        panel.section(
          msg("pref_overlay_title", "Indicator Lines"),
          msg("pref_overlay_keywords", "indicator overlay bollinger bands donchian channel moving average 50 200 sma supertrend lines"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "indicatorOverlay", msg("pref_overlay_heading", "Indicator Lines")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_overlay_desc2", "Classic indicators drawn on the chart from the coin's daily candles — one, several or none"),
            ),
            settingNote(
              panel,
              "indicatorOverlay",
              msg(
                "pref_overlay_note",
                "Bollinger bands (20 days, two standard deviations), the Donchian channel (the highest high and lowest low of 20 days), the 50- and 200-day averages, or Supertrend (10 days, 3 × ATR). They are daily lines, and say so: a 20-day band means twenty days on every range, so it is not drawn where the range holds fewer than five of them. What happened after each classic setup on these lines is counted on the base-rate screen (B). They read the same daily history as the chart companion.",
              ),
            ),
            /* Chips that wrap, like the companion's metrics: five names do
               not fit the theme's segmented row, and squeezed into it
               "50/200 averages" ran into "supertrend". Their own case, too
               — the segmented control lower-cases, and a product's name
               is spelt the way it is spelt. */
            React.createElement(
              MetricChips,
              { role: "group", "aria-label": msg("pref_overlay_aria", "Which indicator lines to draw") },
              ...[
                ["none", msg("pref_overlay_none", "None")],
                ["bollinger", msg("pref_overlay_bollinger", "Bollinger")],
                ["donchian", msg("pref_overlay_donchian", "Donchian")],
                ["averages", msg("pref_overlay_averages", "50/200 averages")],
                ["supertrend", msg("pref_overlay_supertrend", "Supertrend")],
              ].map(([v, label]) =>
                React.createElement(
                  MetricChip,
                  {
                    key: v,
                    active: v === "none" ? !(indicatorOverlays || []).length : (indicatorOverlays || []).includes(v),
                    "aria-pressed": (v === "none" ? !(indicatorOverlays || []).length : (indicatorOverlays || []).includes(v)) ? "true" : "false",
                    "data-overlay-choice": v,
                    onClick: () => onIndicatorOverlayChange && onIndicatorOverlayChange(v),
                  },
                  label,
                ),
              ),
            ),
          ),
        ),
    /* **Counted studies** (the chart plan's Phase 4, chart-studies.js): six
     * things the chart counts from what it already has, a chip each. The note
     * carries what was measured before any of them was allowed to say
     * anything (research/studies-prereg.md), in words. */
    chartStudies: () =>
        panel.section(
          msg("pref_studies_title", "Counted Studies"),
          msg("pref_studies_keywords", "study studies volume profile price where range regime turn level support resistance usual range cone unusual volume"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "chartStudies", msg("pref_studies_heading", "Counted Studies")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_studies_desc", "Things the chart counts from what it already has — each says what it counts, none says what comes next"),
            ),
            settingNote(
              panel,
              "chartStudies",
              msg(
                "pref_studies_note",
                "Volume by price spreads each bar's volume evenly over its high and low, and marks the band where most traded and the 70% around it. Where it sits prints the price's place inside each range's high and low. Unusual volume marks the bars 2.5 standard deviations above the others on screen, with the multiple; on four coins' daily history the five days after such days moved about 1.5 times as far on three of them, which is a fact about days, so the chart says nothing about what follows. Regimes shades the days whose last 20 days rose or fell 5%; what a regime said about the next 20 days was measured, and it was nothing. Usual range draws, in a strip of future, how far 80% of this range's own stretches of that length travelled, direction left out; tested on later data, such a band held 92% rather than 80%, because the swings got smaller. Turn levels are prices three swing points agreed on, each with how often price turned there and how often it turned at any price it came to; on four coins the two did not differ.",
              ),
            ),
            React.createElement(
              MetricChips,
              { role: "group", "aria-label": msg("pref_studies_aria", "Which studies to draw") },
              ...[
                ["where", msg("pref_study_where", "Where it sits")],
                ["profile", msg("pref_study_profile", "Volume by price")],
                ["volumeEvents", msg("pref_study_volume", "Unusual volume")],
                ["regimes", msg("pref_study_regimes", "Regimes")],
                ["usualRange", msg("pref_study_range", "Usual range")],
                ["turnLevels", msg("pref_study_turns", "Turn levels")],
              ].map(([id, label]) =>
                React.createElement(
                  MetricChip,
                  {
                    key: id,
                    active: (chartStudies || []).includes(id),
                    "aria-pressed": (chartStudies || []).includes(id) ? "true" : "false",
                    "data-study-choice": id,
                    onClick: () => onChartStudyToggle && onChartStudyToggle(id),
                  },
                  label,
                ),
              ),
            ),
          ),
        ),
    /* **The chances, in one place** (30 Sep 2026, "bu olasılıkları
     * ayarlardan kapatıp açabilelim"): the board's squares, the regime row
     * and the outlook's range — each a chip, each with how it was measured. */
    chartChances: () =>
        panel.section(
          msg("pref_chances_title", "Chances"),
          msg("pref_chances_keywords", "chance chances probability odds markov regime outlook range squares board calls forecast"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "chartChances", msg("pref_chances_heading", "Chances")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_chances_desc", "Probabilities counted from this coin's own history — on the board's squares and in a line under the price"),
            ),
            settingNote(
              panel,
              "chartChances",
              msg(
                "pref_chances_note",
                "Squares writes on each square of the calls board the chance the price is in it when its column ends; it was checked out of sample on four coins before it was allowed on (on the hour, day, week, month and year boards; not on all time, where it failed). Regime is the Regimes widget's row for today — the past entries into the state the coin is in and the state 20 days later, the Markov question counted; measured, no such row differed from any day by 10 points. Range is the Outlook widget's 5th–95th range for the next stretch, from replays of this range's own steps. None of them says which way to trade.",
              ),
            ),
            React.createElement(
              MetricChips,
              { role: "group", "aria-label": msg("pref_chances_aria", "Which chances to show") },
              ...[
                ["squares", msg("pref_chance_squares", "Squares"), cellOdds !== false],
                ["regime", msg("pref_chance_regime", "Regime"), (chartChances || []).includes("regime")],
                ["range", msg("pref_chance_range", "Range"), (chartChances || []).includes("range")],
              ].map(([id, label, active]) =>
                React.createElement(
                  MetricChip,
                  {
                    key: id,
                    active,
                    "aria-pressed": active ? "true" : "false",
                    "data-chance-choice": id,
                    onClick: () => onChartChanceToggle && onChartChanceToggle(id),
                  },
                  label,
                ),
              ),
            ),
          ),
        ),
    /* The axis. It sits with the grid because both are about how the price is
     * *laid out* rather than about what is drawn on it. */
    logScale: () =>
        panel.section(
          msg("pref_log_scale_title", "Log Scale"),
          msg("pref_log_scale_keywords", "log logarithmic axis scale ratio percent long range all years squashed"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "logScale", msg("pref_log_scale_heading", "Log Scale")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg(
                "pref_log_scale_desc",
                "Space the price axis by ratio instead of by amount, so the early years of a long range are readable",
              ),
            ),
            settingNote(
              panel,
              "logScale",
              msg(
                "pref_log_scale_note",
                "On the ALL range a plain axis spends almost all of its height on the most recent prices: measured on Bitcoin's own history, the first half of it takes 16% of the chart against 72% here. The two answer different questions — a plain axis shows what the money did, this one shows what the rate did — and on anything shorter than a year they look the same. It switches off by itself while the calls board is up, because the board's squares are a fixed step in price and this axis has no fixed step.",
              ),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                logScale === true ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
              ),
              React.createElement(ToggleSwitch, {
                active: logScale === true,
                "aria-pressed": (logScale === true) ? "true" : "false",
                onClick: () => onLogScaleChange && onLogScaleChange(logScale !== true),
                "aria-label": msg("pref_log_scale_aria", "Toggle logarithmic price axis"),
              }),
            ),
          ),
        ),
    moveNews: () =>
        panel.section(
          msg("pref_move_news_title", "What Happened Here"),
          msg("pref_move_news_keywords", "news headlines moves spikes crash rally why history archive events"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "moveNews", msg("pref_move_news_heading", "What Happened Here")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_move_news_desc", "Marks the moments the price did something unusual for the range you are on. Click one for the headlines published around that day"),
            ),
            settingNote(
              panel,
              "moveNews",
              msg("pref_move_news_note", "The marks cost nothing — where they go is worked out from the series already on screen. Only opening one asks for anything, and the answer is cached, so the same moment is free afterwards. What it cannot tell you is why: headlines from the day of a move are what was being written, not the cause, and the card says so. Off while two coins share the chart, like the grid."),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                moveNews === true ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
              ),
              React.createElement(ToggleSwitch, {
                active: moveNews === true,
                "aria-pressed": (moveNews === true) ? "true" : "false",
                onClick: () =>
                  onMoveNewsChange && onMoveNewsChange(moveNews !== true),
                "aria-label": msg("pref_move_news_aria", "Toggle what happened here"),
              }),
            ),
          ),
        ),
    chartDetails: () =>
        panel.section(
          msg("pref_chart_details_title", "Chart Details"),
          msg("pref_chart_details_keywords", "ohlc volume crosshair hover open high low close request cost"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "chartDetails", msg("pref_chart_details_heading", "Chart Details")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_chart_details_desc", "Show open/high/low/close and volume when you hover the chart (one extra request per chart, only on hover)"),
            ),
            settingNote(
              panel,
              "chartDetails",
              msg("pref_chart_details_note", "Open, high, low and close: the four prices that describe one period, plus what was traded in it. It costs one extra request per chart, made the first time you hover and not before."),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                ohlcEnabled === false ? msg("toggle_off", "Off") : msg("toggle_on", "On"),
              ),
              React.createElement(ToggleSwitch, {
                active: ohlcEnabled !== false,
                "aria-pressed": (ohlcEnabled !== false) ? "true" : "false",
                onClick: () => onOhlcChange && onOhlcChange(ohlcEnabled === false),
                "aria-label": msg("pref_chart_details_aria", "Toggle chart detail readout"),
              }),
            ),
          ),
        ),
    marketStats: () =>
        panel.section(
          msg("pref_market_stats_title", "Market Stats"),
          msg("pref_market_stats_keywords", "stats high low market cap volume range free"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "marketStats", msg("pref_market_stats_heading", "Market Stats")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_market_stats_desc", "Show the range high and low, market cap and 24h volume under the price"),
            ),
            settingNote(
              panel,
              "marketStats",
              msg("pref_market_stats_note", "Free. The high and low are read off the series already on screen, and the market cap and volume arrive with the ticker data — nothing extra is fetched for this line."),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                marketStats === false ? msg("toggle_off", "Off") : msg("toggle_on", "On"),
              ),
              React.createElement(ToggleSwitch, {
                active: marketStats !== false,
                "aria-pressed": (marketStats !== false) ? "true" : "false",
                onClick: () =>
                  onMarketStatsChange &&
                  onMarketStatsChange(marketStats === false),
                "aria-label": msg("pref_market_stats_aria", "Toggle market stats"),
              }),
            ),
          ),
        ),
    lastSeen: () =>
        panel.section(
          msg("pref_last_seen_title", "Since Your Last Visit"),
          msg("pref_last_seen_keywords", "delta change visit last seen device"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "lastSeen", msg("pref_last_seen_heading", "Since Your Last Visit")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_last_seen_desc", "Show how the coin moved since you last opened a tab"),
            ),
            settingNote(
              panel,
              "lastSeen",
              msg("pref_last_seen_note", "Compares the price now with the price the last time you opened a tab. The mark is kept on this device only, so a new browser starts counting again."),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                lastSeenEnabled === false ? msg("toggle_off", "Off") : msg("toggle_on", "On"),
              ),
              React.createElement(ToggleSwitch, {
                active: lastSeenEnabled !== false,
                "aria-pressed": (lastSeenEnabled !== false) ? "true" : "false",
                onClick: () =>
                  onLastSeenChange && onLastSeenChange(lastSeenEnabled === false),
                "aria-label": msg("pref_last_seen_aria", "Toggle since your last visit line"),
              }),
            ),
          ),
        ),
    moveHeadlines: () =>
        panel.section(
          msg("pref_move_headlines_title", "Move Headlines"),
          msg("pref_move_headlines_keywords", "news headlines big move story context unusual source"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "moveHeadlines", msg("pref_move_headlines_heading", "Move Headlines")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_move_headlines_desc", "When a coin makes an unusual move, show headlines that mention it from the same window. Uses the same news feed as the ticker"),
            ),
            settingNote(
              panel,
              "moveHeadlines",
              msg("pref_move_headlines_note", "Unusual is measured against the range you are looking at, so a 2% day counts on the hour chart and not on the year. Only stories that name the coin qualify, and the label says where they came from rather than claiming they explain the move."),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                moveHeadlines ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
              ),
              React.createElement(ToggleSwitch, {
                active: Boolean(moveHeadlines),
                "aria-pressed": moveHeadlines ? "true" : "false",
                onClick: () =>
                  onMoveHeadlinesChange &&
                  onMoveHeadlinesChange(!moveHeadlines),
                "aria-label": msg("pref_move_headlines_aria", "Toggle move headlines"),
              }),
            ),
          ),
        ),
    currency: () =>
        panel.section(
          msg("pref_currency_title", "Currency"),
          msg("pref_currency_keywords", "usd eur fiat money exchange rate pause paused targets calls"),
          React.createElement(
            CurrencySection,
            null,
            /* The ring sits on the label, since a select has no description
             * line to hang one under — and this is the setting with the
             * consequence people least expect. */
            React.createElement(
              SettingTitleRow,
              null,
              React.createElement(CurrencyLabel, { style: { margin: 0 } }, "Currency"),
              React.createElement(
                SettingInfoBtn,
                {
                  active: panel.state.openInfo === "currency",
                  onClick: () =>
                    panel.setState((prev) => ({
                      openInfo: prev.openInfo === "currency" ? null : "currency",
                    })),
                  title: msg("pref_currency_about", "About Currency"),
                  "aria-label": msg("pref_currency_about", "About Currency"),
                  "aria-expanded":
                    panel.state.openInfo === "currency" ? "true" : "false",
                },
                icon("info", 0.8),
              ),
            ),
            settingNote(
              panel,
              "currency",
              msg("pref_currency_note", "Converted with the exchange rate the ticker already fetches, so switching costs no extra request. Price targets and calls made in another currency pause while you are in this one — they are not lost, and they pick up again when you switch back. A target on a percentage move never pauses: a percentage means the same thing in every currency."),
            ),
            React.createElement(
              CurrencySelect,
              {
                value: currency || DEFAULT_CURRENCY,
              "aria-label": msg("pref_currency_aria_2", "Currency"),
                onChange: (e) => {
                  const newCurrency = e.target.value;
                  if (onCurrencyChange) {
                    onCurrencyChange(newCurrency);
                  }
                },
              },
              React.createElement(
                "optgroup",
                { label: msg("pref_currency_popular", "Popular") },
                POPULAR_CURRENCIES.map((code) => {
                  const option = CURRENCY_OPTIONS.find(
                    (o) => o.value === code,
                  );
                  return option
                    ? React.createElement(
                        "option",
                        { key: option.value, value: option.value },
                        option.label,
                      )
                    : null;
                }),
              ),
              React.createElement(
                "optgroup",
                { label: msg("pref_currency_all", "All currencies") },
                CURRENCY_OPTIONS.filter(
                  (option) => !POPULAR_CURRENCIES.includes(option.value),
                ).map((option) =>
                  React.createElement(
                    "option",
                    { key: option.value, value: option.value },
                    option.label,
                  ),
                ),
              ),
            ),
          ),
        ),
    /* Sits with Language, Currency and Theme: it changes every screen forever
     * rather than the chart, which is what Basics is for. (A "Full Screen"
     * switch sat beside it until 26 Sep 2026, choosing between a card and
     * the window; Settings is only ever a screen now — see SettingsCard.) */
    textSize: () =>
      panel.section(
        msg("pref_text_size_title", "Text Size"),
        msg("pref_text_size_keywords", "text size font bigger smaller larger zoom readable"),
        React.createElement(
          ThemeSection,
          null,
          React.createElement(
            ThemeSectionTitle,
            null,
            msg("pref_text_size_heading", "Text Size"),
          ),
          React.createElement(
            ToggleSectionDesc,
            null,
            msg(
              "pref_text_size_desc",
              "The size of everything, not only the words — the panels and the chart's own labels move with it.",
            ),
          ),
          React.createElement(
            ThemeButtonGroup,
            null,
            ...TEXT_SIZE_OPTIONS.map((option) =>
              React.createElement(
                ThemeButton,
                {
                  key: option.value,
                  active: (panel.state.textSize || DEFAULT_TEXT_SIZE) === option.value,
                  onClick: () => panel.handleTextSize(option.value),
                  "aria-pressed": (panel.state.textSize || DEFAULT_TEXT_SIZE) === option.value,
                  "aria-label": option.label,
                },
                /* One letter each. Four words in the lane the three theme
                 * words already fill would wrap, and S/M/L/XL is the ladder
                 * the widget sizes already use. The full word is on the
                 * button's own label for anyone reading it aloud. */
                option.value === "small"
                  ? msg("pref_text_size_s", "S")
                  : option.value === "default"
                    ? msg("pref_text_size_m", "M")
                    : option.value === "large"
                      ? msg("pref_text_size_l", "L")
                      : msg("pref_text_size_xl", "XL"),
              ),
            ),
          ),
        ),
      ),
    numberFormat: () =>
        panel.section(
          msg("pref_number_format_title", "Number Format"),
          msg("pref_number_format_keywords", "decimals separator thousands format"),
          React.createElement(
            NumberFormatSection,
            null,
            React.createElement(NumberFormatLabel, null, msg("pref_number_format_label", "Decimal Places")),
            React.createElement(
              NumberFormatSelect,
              {
                value: decimalPlaces || DEFAULT_DECIMAL_PLACES,
              "aria-label": msg("pref_number_format_aria", "Decimal places"),
                onChange: (e) => {
                  const newPlaces = parseInt(e.target.value, 10);
                  if (onDecimalPlacesChange) {
                    onDecimalPlacesChange(newPlaces);
                  }
                },
              },
              DECIMAL_PLACES_OPTIONS.map((option) =>
                React.createElement(
                  "option",
                  { key: option.value, value: option.value },
                  option.label,
                ),
              ),
            ),
            React.createElement(NumberFormatLabel, null, msg("pref_number_format_label_2", "Number Format")),
            React.createElement(
              NumberFormatSelect,
              {
                value: separatorFormat || DEFAULT_SEPARATOR_FORMAT,
              "aria-label": msg("pref_number_format_aria_2", "Number format"),
                onChange: (e) => {
                  const newFormat = e.target.value;
                  if (onSeparatorFormatChange) {
                    onSeparatorFormatChange(newFormat);
                  }
                },
              },
              SEPARATOR_FORMAT_OPTIONS.map((option) =>
                React.createElement(
                  "option",
                  { key: option.value, value: option.value },
                  option.label,
                ),
              ),
            ),
          ),
        ),
    /* A control and the row that appears under it, as one section — and null
     * when the search has filtered the control out. The revealed row is not
     * itself a `panel.section` (it is not a setting you search for, it is a
     * detail of the one above), so on its own it counted as content and left an
     * empty group heading behind on every search that missed. Tying the two
     * together is what makes a search collapse the panel to its matches. */
    tabTicker: () => {
      const node = panel.section(
            msg("pref_tab_ticker_title", "Tab Ticker"),
            msg("pref_tab_ticker_keywords", "browser tab title price strip hidden"),
            React.createElement(
              ToggleSection,
              null,
              settingTitle(panel, "tabTicker", msg("pref_tab_ticker_heading", "Browser Tab Title")),
              React.createElement(
                ToggleSectionDesc,
                null,
                msg("pref_tab_ticker_desc", "Show live prices in the browser tab title"),
              ),
              settingNote(
                panel,
                "tabTicker",
                msg("pref_tab_ticker_note", "Writes into the browser tab's title, so you can read the price from the tab strip with the page hidden. The title is shared: a hit price target takes it over while it is announcing, then hands it back."),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(
                  ToggleLabel,
                  null,
                  tickerEnabled ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
                ),
                React.createElement(ToggleSwitch, {
                  active: tickerEnabled,
                  "aria-pressed": (tickerEnabled) ? "true" : "false",
                  onClick: () =>
                    onTickerChange && onTickerChange(!tickerEnabled),
                  "aria-label": msg("pref_tab_ticker_aria", "Toggle tab ticker"),
                }),
              ),
            ),
      );
      if (!node) return null;
      return React.createElement(
        Fragment,
        { key: "tab-ticker" },
        node,
          React.createElement(
            SettingReveal,
            { key: "ticker-format", open: tickerEnabled },
              React.createElement(
              RefreshIntervalSection,
              null,
              React.createElement(
                RefreshIntervalLabel,
                null,
                msg("pref_tab_ticker_format", "Title Format"),
              ),
              React.createElement(
                RefreshIntervalSelect,
                {
                  value: tickerFormat || DEFAULT_TICKER_FORMAT,
                  "aria-label": msg("pref_tab_ticker_aria_2", "Tab ticker format"),
                  onChange: (e) => {
                    if (onTickerFormatChange) {
                      onTickerFormatChange(e.target.value);
                    }
                  },
                },
                TICKER_FORMAT_OPTIONS.map((option) =>
                  React.createElement(
                    "option",
                    { key: option.value, value: option.value },
                    option.label,
                  ),
                ),
              ),
            ),
            ),
      );
    },
    /* A control and the row that appears under it, as one section — and null
     * when the search has filtered the control out. The revealed row is not
     * itself a `panel.section` (it is not a setting you search for, it is a
     * detail of the one above), so on its own it counted as content and left an
     * empty group heading behind on every search that missed. Tying the two
     * together is what makes a search collapse the panel to its matches. */
    pageTicker: () => {
      const node = panel.section(
            msg("pref_page_ticker_title", "Price Ticker Bar"),
            msg("pref_page_ticker_keywords", "scrolling bar news headlines position every coin all filter my coins portfolio hold"),
            React.createElement(
              ToggleSection,
              null,
              settingTitle(panel, "pageTicker", msg("pref_page_ticker_heading", "Price Ticker Bar")),
              React.createElement(
                ToggleSectionDesc,
                null,
                msg("pref_page_ticker_desc", "Scrolling price bar across the page (top or bottom)"),
              ),
              settingNote(
                panel,
                "pageTicker",
                msg("pref_page_ticker_note", "Shows every coin PriceTab supports, not only the ones on your list — one request serves all of them. The headlines row underneath uses the same feed as Move Headlines."),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(
                  ToggleLabel,
                  null,
                  pageTicker ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
                ),
                React.createElement(ToggleSwitch, {
                  active: pageTicker,
                  "aria-pressed": (pageTicker) ? "true" : "false",
                  onClick: () =>
                    onPageTickerChange && onPageTickerChange(!pageTicker),
                  "aria-label": msg("pref_page_ticker_aria", "Toggle page ticker"),
                }),
              ),
            ),
      );
      if (!node) return null;
      return React.createElement(
        Fragment,
        { key: "page-ticker" },
        node,
          React.createElement(
            SettingReveal,
            { key: "page-ticker-position", open: pageTicker },
              React.createElement(
              RefreshIntervalSection,
              null,
              React.createElement(RefreshIntervalLabel, null, msg("pref_page_ticker_position", "Position")),
              React.createElement(
                RefreshIntervalSelect,
                {
                  value: pageTickerPosition || DEFAULT_PAGE_TICKER_POSITION,
                  "aria-label": msg("pref_page_ticker_aria_2", "Price ticker bar position"),
                  onChange: (e) =>
                    onPageTickerPositionChange &&
                    onPageTickerPositionChange(e.target.value),
                },
                React.createElement("option", { value: "bottom" }, msg("pref_position_bottom", "Bottom")),
                React.createElement("option", { value: "top" }, msg("pref_position_top", "Top")),
              ),
            ),
            /* **A sibling of the position row, not a child of it.**
             *
             * The News Headlines switch and everything under it were nested
             * *inside* the `RefreshIntervalSection` that holds the Position
             * label and its select — a row laid out in two columns. So every
             * block below it became a cell of that row and was drawn at 232px
             * where its neighbours are 472px: the description under the
             * filter had half the width of the description above it, hard
             * against the left, which is what a reader sees as a padding
             * fault. Measured before: `A story counts as yours…` at x=404
             * w=232, beside `Headlines come from public feeds…` at w=472.
             *
             * They are two settings, one after the other, and that is now
             * what the markup says. */
            /* **The same shape as the Position row above it**: a label in
             * the text column and the control in the lane. It was a bare
             * ToggleRow — label left, switch right — dropped straight into
             * the reveal, whose per-child grid then put the switch at the
             * *start* of the control lane, 280px left of every other switch
             * on the screen, and the description under it was clipped by
             * the reveal's old fixed height with the "Show" dropdown drawn
             * half under the next setting. Measured at 1280: switch right
             * edge 636 against 876 for the row above. */
            React.createElement(
              SettingReveal,
              { key: "page-ticker-news", open: pageTicker },
              React.createElement(
                RefreshIntervalSection,
                { "data-pref-news-row": "true" },
                React.createElement(
                  RefreshIntervalLabel,
                  null,
                  msg("pref_news_headlines", "News Headlines"),
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    newsTicker ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
                  ),
                  React.createElement(ToggleSwitch, {
                    active: newsTicker,
                    "aria-pressed": (newsTicker) ? "true" : "false",
                    onClick: () =>
                      onNewsTickerChange && onNewsTickerChange(!newsTicker),
                    "aria-label": msg("pref_page_ticker_aria_3", "Toggle news headlines row"),
                  }),
                ),
              ),
              React.createElement(
                SettingReveal,
                { key: "news-disclosure", open: newsTicker },
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  msg("pref_page_ticker_news_desc", "Headlines come from public feeds — Hacker News, Bitcoin.com and three financial newsrooms, plus any you have allowed in the news panel. Clicking one opens the story in a new tab."),
                ),
                /* What the row is allowed to carry. The feed is general crypto
                 * news, so on a tab kept for four coins most of what scrolls
                 * past is about something else. The two narrow settings can
                 * leave the row empty for hours — a quiet week for your coins
                 * is a quiet week — so the note says so rather than letting it
                 * look broken. */
                React.createElement(
                  RefreshIntervalSection,
                  null,
                  React.createElement(RefreshIntervalLabel, null, msg("pref_show", "Show")),
                  React.createElement(
                    RefreshIntervalSelect,
                    {
                      value: newsFilter || DEFAULT_NEWS_FILTER,
                      "aria-label": msg("pref_page_ticker_aria_4", "Which headlines the news row carries"),
                      onChange: (e) =>
                        onNewsFilterChange && onNewsFilterChange(e.target.value),
                    },
                    ...NEWS_FILTER_OPTIONS.map((o) =>
                      React.createElement(
                        "option",
                        { key: o.value, value: o.value },
                        o.label,
                      ),
                    ),
                  ),
                ),
                React.createElement(
                  SettingReveal,
                  {
                    key: "news-filter-note",
                    open: (newsFilter || DEFAULT_NEWS_FILTER) !== "all",
                  },
                  React.createElement(
                    ToggleSectionDesc,
                    null,
                    msg("pref_page_ticker_scope_desc", "A story counts as yours when it names the coin — its ticker or its full name. Quiet weeks leave the row empty rather than filling it with everything else."),
                  ),
                ),
              ),
            ),
            ),
      );
    },
    refreshInterval: () =>
        panel.section(
          msg("pref_refresh_interval_title", "Refresh Interval"),
          msg("pref_refresh_interval_keywords", "update poll seconds frequency hidden background cost"),
          React.createElement(
            RefreshIntervalSection,
            null,
            React.createElement(
                SettingTitleRow,
                null,
                /* ToggleSectionTitle, not RefreshIntervalLabel. That one is
                 * the small uppercase sub-label the dependent rows use —
                 * Position, Show, Switch Every — and this is a setting of its
                 * own with a ring beside it, so it was the one title on the
                 * tab shouting in capitals. The string was also the only title
                 * not passing through msg(), so it stayed English in all
                 * twelve translations. */
                React.createElement(
                  ToggleSectionTitle,
                  { style: { margin: 0 } },
                  msg("pref_refresh_interval_heading", "Refresh Interval"),
                ),
                React.createElement(
                  SettingInfoBtn,
                  {
                    active: panel.state.openInfo === "refreshInterval",
                    onClick: () =>
                      panel.setState((prev) => ({
                        openInfo:
                          prev.openInfo === "refreshInterval" ? null : "refreshInterval",
                      })),
                    title: msg("pref_refresh_about", "About Refresh Interval"),
                    "aria-label": msg("pref_refresh_about", "About Refresh Interval"),
                    "aria-expanded":
                      panel.state.openInfo === "refreshInterval" ? "true" : "false",
                  },
                  icon("info", 0.8),
                ),
              ),
              settingNote(
                panel,
                "refreshInterval",
                msg("pref_refresh_interval_note", "How often the chart asks for a new price. A hidden tab does not poll at all and catches up when you look at it, so a short interval costs nothing while you are somewhere else."),
              ),
            React.createElement(
              RefreshIntervalSelect,
              {
                value: refreshInterval || DEFAULT_REFRESH_INTERVAL,
                "aria-label": msg("pref_refresh_interval_aria_2", "Refresh interval"),
                onChange: (e) => {
                  const newInterval = parseInt(e.target.value, 10);
                  if (onRefreshIntervalChange) {
                    onRefreshIntervalChange(newInterval);
                  }
                },
              },
              REFRESH_INTERVAL_OPTIONS.map((option) =>
                React.createElement(
                  "option",
                  { key: option.value, value: option.value },
                  option.label,
                ),
              ),
            ),
          ),
        ),
    /* A control and the row that appears under it, as one section — and null
     * when the search has filtered the control out. The revealed row is not
     * itself a `panel.section` (it is not a setting you search for, it is a
     * detail of the one above), so on its own it counted as content and left an
     * empty group heading behind on every search that missed. Tying the two
     * together is what makes a search collapse the panel to its matches. */
    autoRotate: () => {
      const node = panel.section(
            msg("pref_auto_rotate_title", "Auto Rotate"),
            msg("pref_auto_rotate_keywords", "cycle coins rotate interval pause panel"),
            React.createElement(
              ToggleSection,
              null,
              settingTitle(panel, "autoRotate", msg("pref_auto_rotate_heading", "Auto Rotate")),
              React.createElement(
                ToggleSectionDesc,
                null,
                msg("pref_auto_rotate_desc", "Switch to the next coin in your list automatically"),
              ),
              settingNote(
                panel,
                "autoRotate",
                msg("pref_auto_rotate_note", "Holds still while any panel is open, so it cannot move the chart out from under you in the middle of reading it."),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(
                  ToggleLabel,
                  null,
                  autoRotate ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
                ),
                React.createElement(ToggleSwitch, {
                  active: autoRotate,
                  "aria-pressed": (autoRotate) ? "true" : "false",
                  onClick: () =>
                    onAutoRotateChange && onAutoRotateChange(!autoRotate),
                  "aria-label": msg("pref_auto_rotate_aria", "Toggle auto rotate"),
                }),
              ),
            ),
      );
      if (!node) return null;
      return React.createElement(
        Fragment,
        { key: "auto-rotate" },
        node,
          React.createElement(
            SettingReveal,
            { key: "auto-rotate-interval", open: autoRotate },
            React.createElement(
              RefreshIntervalSection,
              null,
              React.createElement(RefreshIntervalLabel, null, msg("pref_rotate_every", "Switch Every")),
              React.createElement(
                RefreshIntervalSelect,
                {
                  value: autoRotateInterval || DEFAULT_AUTO_ROTATE_INTERVAL,
                  "aria-label": msg("pref_auto_rotate_aria_2", "Auto rotate interval"),
                  onChange: (e) => {
                    const newInterval = parseInt(e.target.value, 10);
                    if (onAutoRotateIntervalChange) {
                      onAutoRotateIntervalChange(newInterval);
                    }
                  },
                },
                AUTO_ROTATE_OPTIONS.map((option) =>
                  React.createElement(
                    "option",
                    { key: option.value, value: option.value },
                    option.label,
                  ),
                ),
              ),
            ),
          ),
      );
    },
    /* **How futures behaves, which is not the same as what the account is.**
     *
     * The Account tab holds the second kind — the balance, the settlement,
     * the costs, the four rules — because all of those are part of what this
     * account *is*, and every one of them is stamped on the contracts it
     * writes. These two are neither: they are about the app around it, they
     * touch no money and they are not locked while a contract runs.
     *
     * Drawn only when futures is switched on at all. A group of settings for
     * a feature somebody has turned off is a group that cannot change
     * anything, which is the kind of control this codebase removes. */
    /* **The words, before the switch.**
     *
     * The panel explains leverage, margin and cover where they are used —
     * which is right, and which is also *in the middle of a leveraged order
     * ticket*. Somebody who has never traded a derivative needs the six words
     * before they arrive there, and the main menu is where a person goes to
     * find out what a thing is.
     *
     * Drawn whether or not futures is switched on: this is the answer to
     * "what is that", and refusing to answer until it has been turned on is
     * the wrong way round. It is also, deliberately, the one place that says
     * the thing costs money in the real world — every sentence here is about
     * what the mechanism *does*, never about whether to use it. */
    practiceGlossary: () =>
      panel.section(
        msg("pref_glossary_title", "What A Futures Contract Is"),
        msg("pref_glossary_keywords", "futures derivatives leverage margin liquidation funding long short explain glossary beginner what is"),
        React.createElement(
          ToggleSection,
          { "data-practice-glossary": "true" },
          settingTitle(panel, "practiceGlossary", msg("pref_glossary_heading", "What A Futures Contract Is")),
          React.createElement(
            ToggleSectionDesc,
            null,
            msg(
              "pref_glossary_desc",
              "Six words that decide what happens to the money, in plain language — before you open anything",
            ),
          ),
          settingNote(
            panel,
            "practiceGlossary",
            msg(
              "pref_glossary_note",
              "PriceTab's derivatives market is a simulation: the prices are real, the balance is imaginary and nothing is ever sent anywhere. The words below are the real ones, though, and they mean the same thing at a real venue — which is the point of practising with them here first. Leveraged trading with real money can lose more than you put in.",
            ),
          ),
          React.createElement(
            PrefGlossary,
            null,
            ...[
              [
                msg("pref_gloss_contract", "A contract"),
                msg(
                  "pref_gloss_contract_v",
                  "An agreement to take the price move on an amount larger than the money you put behind it. You never own the coin, and there is nothing to store or send: you are exposed to what the price does, and that is all.",
                ),
              ],
              [
                msg("pref_gloss_side", "Long and short"),
                msg(
                  "pref_gloss_side_v",
                  "Long makes money when the price rises and loses when it falls; short is the other way round. Every contract is one or the other, and you choose before anything else.",
                ),
              ],
              [
                msg("pref_gloss_lev", "Leverage"),
                /* No currency symbol in front of a figure: a "$" followed by
                   a digit is a placeholder to `msg()`, so "$100" reads as
                   placeholder 1 followed by "00" and the sentence loses its
                   example in all twelve translations. Written in words
                   instead, which is also how somebody says it out loud.
                   The comment lives out here because the extractor reads the
                   source: one between the key and the default string hides
                   the whole call from it. */
                msg(
                  "pref_gloss_lev_v",
                  "How large a contract your money carries: at 10x, a hundred carries a thousand. What it really decides is the room — at 10x the price has about 10% to move against you before the contract is closed for you, at 100x about 1%. It multiplies the result in both directions equally; nothing about it makes a rise more likely than a fall.",
                ),
              ],
              [
                msg("pref_gloss_margin", "Margin"),
                msg(
                  "pref_gloss_margin_v",
                  "The money taken out of your balance and placed behind one contract. It is isolated here: that contract can lose that money and nothing else, and neither your other contracts nor the rest of your balance can be reached from it.",
                ),
              ],
              [
                msg("pref_gloss_liq", "Liquidation"),
                msg(
                  "pref_gloss_liq_v",
                  "When what is left of the margin falls under what the contract must keep, it is closed for you at that price and the margin is gone. It is not a penalty and not a decision anybody makes — it is the rule that stops the loss growing past what was put behind it.",
                ),
              ],
              [
                msg("pref_gloss_funding", "Funding"),
                msg(
                  "pref_gloss_funding_v",
                  "These contracts have no expiry date, so every eight hours one side pays the other to keep the price near the real one. It is small and it is relentless: on a leveraged position held for days it is often the whole result.",
                ),
              ],
              [
                msg("pref_gloss_cost", "What it costs"),
                msg(
                  "pref_gloss_cost_v",
                  "A fee on the way in and again on the way out, as a share of the contract rather than of your money — so the same money at 40x pays forty times the fee — plus the spread on both fills. A contract closed at exactly the price it opened at comes back smaller, and that is why.",
                ),
              ],
            ].map(([term, text]) =>
              React.createElement(
                Fragment,
                { key: term },
                React.createElement("dt", null, term),
                React.createElement("dd", null, text),
              ),
            ),
          ),
        ),
      ),

    /* **Two settings, two rows** (27 Sep 2026, *"show the contract kısmı
     * açıkta olsa kapalı da olsa hep açık görünüyor ve birbirinin üzerine
     * biniyor"*). The strip and the confirmation were one section carrying
     * two switches, and a row pins its control to its first line — so the
     * second switch was drawn exactly over the first, the strip's own switch
     * could not be seen or pressed, and whichever state it was in, the row
     * showed the other's. Each is its own section now, like every other
     * setting; polish §64 fails any row with a control drawn over another. */
    practiceDock: () =>
      practiceEnabled !== true
        ? null
        : panel.section(
            msg("pref_practice_dock_title", "Contract Strip"),
            msg("pref_practice_keywords", "derivatives market futures perpetual practice dock chart strip confirm ask order contract simulation"),
            React.createElement(
              ToggleSection,
              { "data-practice-prefs": "dock" },
              settingTitle(panel, "practiceDock", msg("pref_practice_dock_heading", "Show The Contract Strip On The Chart")),
              React.createElement(
                ToggleSectionDesc,
                null,
                msg("pref_practice_dock_desc", "The compact strip over the chart while a contract is running — its coin, side, leverage and result, and a press to open it"),
              ),
              settingNote(
                panel,
                "practiceDock",
                msg("pref_practice_dock_note", "The contract's own levels are still drawn on the chart either way: the entry, the stop, the take-profit and the liquidation are the reading this feature exists to give. This is the control that sits on top of them, and it is the part somebody may not want on their chart."),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(
                  ToggleLabel,
                  null,
                  practiceDock === false ? msg("toggle_off", "Off") : msg("toggle_on", "On"),
                ),
                React.createElement(ToggleSwitch, {
                  active: practiceDock !== false,
                  "aria-pressed": (practiceDock !== false) ? "true" : "false",
                  onClick: () =>
                    onPracticeDockChange && onPracticeDockChange(practiceDock === false),
                  "aria-label": msg("pref_practice_dock_aria", "Toggle the contract strip on the chart"),
                }),
              ),
            ),
          ),

    practiceConfirm: () =>
      practiceEnabled !== true
        ? null
        : panel.section(
            msg("pref_practice_confirm_title", "Ask Before Opening"),
            msg("pref_practice_keywords", "derivatives market futures perpetual practice dock chart strip confirm ask order contract simulation"),
            React.createElement(
              ToggleSection,
              { "data-practice-prefs": "confirm" },
              settingTitle(panel, "practiceConfirm", msg("pref_practice_confirm_heading", "Ask Before Opening A Contract")),
              React.createElement(
                ToggleSectionDesc,
                null,
                msg("pref_practice_confirm_desc", "Turn the order button into two presses, the way closing a share already asks"),
              ),
              settingNote(
                panel,
                "practiceConfirm",
                msg("pref_practice_confirm_note", "Off by default, and deliberately: a simulation with an imaginary balance is a place to press the button and find out, and a confirmation on every order makes the cheap experiment expensive. It is here for practising the discipline rather than the arithmetic."),
              ),
              React.createElement(
                ToggleRow,
                null,
                React.createElement(
                  ToggleLabel,
                  null,
                  practiceConfirm === true ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
                ),
                React.createElement(ToggleSwitch, {
                  active: practiceConfirm === true,
                  "aria-pressed": (practiceConfirm === true) ? "true" : "false",
                  onClick: () =>
                    onPracticeConfirmChange && onPracticeConfirmChange(practiceConfirm !== true),
                  "aria-label": msg("pref_practice_confirm_aria", "Toggle asking before a contract is opened"),
                }),
              ),
            ),
          ),

    alertTabTitle: () =>
        /* The one setting that also governs work done while you are
         * elsewhere, so the description says so rather than describing
         * only the part you can see. */
        panel.section(
          msg("pref_alerts_title", "Price Target Alerts"),
          msg("pref_alerts_keywords", "alert target tab title notify background announce armed"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "alertTabTitle", msg("pref_alert_tab_title_heading", "Announce Targets In The Tab Title")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg("pref_alert_tab_title_desc", "Say so in the tab title when a target is hit, so a tab you are not looking at can tell you"),
            ),
            settingNote(
              panel,
              "alertTabTitle",
              msg("pref_alert_tab_title_note", "It also keeps checking your targets while the tab is in the background — the only thing PriceTab fetches while you are elsewhere, and only when you have a target armed. Switching this off stops the announcement and the background checking together."),
            ),
            React.createElement(
              ToggleRow,
              null,
              React.createElement(
                ToggleLabel,
                null,
                alertTabTitle === false ? msg("toggle_off", "Off") : msg("toggle_on", "On"),
              ),
              React.createElement(ToggleSwitch, {
                active: alertTabTitle !== false,
                "aria-pressed": (alertTabTitle !== false) ? "true" : "false",
                onClick: () =>
                  onAlertTabTitleChange &&
                  onAlertTabTitleChange(alertTabTitle === false),
                "aria-label": msg(
                  "pref_alert_tab_title_aria",
                  "Toggle price target announcements in the tab title",
                ),
              }),
            ),
          ),
        ),

    /* **Everything this browser knows, in one file.**
     *
     * There are sixty-four `crypto_chart_*` keys and, before this, one export
     * path — the portfolio's. A new machine, a cleared profile or a reinstall
     * took the calls record, the price targets, the practice account, the
     * widget layout and every preference with it, and there was nothing
     * anybody could have done about it in advance.
     *
     * `chrome.storage.sync` is the obvious answer and is a permission, which
     * this extension does not have and does not want. A file is the
     * zero-permission answer and the more honest one: it goes where the reader
     * puts it and nowhere else.
     *
     * **Restoring is two presses, not one.** The file is read first and the
     * panel says what is in it — how many settings, and when it was made —
     * before anything is written, because the one part of this that cannot be
     * undone is a person not having read it. What *can* be undone is the
     * write, and is: the previous values are snapshotted first and offered
     * back here for a day.
     */
    backup: () =>
        panel.section(
          msg("pref_backup_title", "Backup"),
          msg("pref_backup_keywords", "backup restore export import settings file save sync device move transfer"),
          React.createElement(
            ToggleSection,
            null,
            settingTitle(panel, "backup", msg("pref_backup_heading", "Backup")),
            React.createElement(
              ToggleSectionDesc,
              null,
              msg(
                "pref_backup_desc",
                "Save everything this browser knows — your coins, targets, calls, portfolio, widgets and preferences — to one file, and read it back on another machine",
              ),
            ),
            settingNote(
              panel,
              "backup",
              msg(
                "pref_backup_note",
                "The file holds what you typed and chose, never the cached prices and headlines — those come back on their own. Restoring adds and replaces what the file holds and leaves anything else alone, so a backup made before a setting existed cannot un-set it. Nothing is sent anywhere: the file goes where you put it. PriceTab asks for no sync permission, which is why this is a file rather than something that happens by itself.",
              ),
            ),
            React.createElement(
              BackupRow,
              null,
              React.createElement(
                BackupBtn,
                { onClick: panel.handleBackupExport },
                msg("pref_backup_save", "Save a backup"),
              ),
              React.createElement(
                BackupBtn,
                { onClick: panel.handleBackupPick },
                msg("pref_backup_read", "Read a backup…"),
              ),
              panel.state.backupUndo &&
                React.createElement(
                  BackupBtn,
                  { onClick: panel.handleBackupUndo },
                  msg(
                    "pref_backup_undo",
                    "Undo the last restore ($1 settings)",
                    panel.state.backupUndo.count,
                  ),
                ),
              /* Read, counted, and waiting to be committed. The button that
               * writes is the only filled one in this panel, because it is the
               * only control here that replaces something. */
              panel.state.backupFound &&
                React.createElement(
                  BackupNote,
                  null,
                  panel.state.backupFound.at
                    ? msg(
                        "pref_backup_found_dated",
                        "That file holds $1 settings, saved $2.",
                        panel.state.backupFound.count,
                        new Date(panel.state.backupFound.at).toLocaleDateString(),
                      )
                    : msg(
                        "pref_backup_found",
                        "That file holds $1 settings.",
                        panel.state.backupFound.count,
                      ),
                ),
              panel.state.backupFound &&
                React.createElement(
                  BackupBtn,
                  { danger: true, onClick: panel.handleBackupRestore },
                  msg("pref_backup_apply", "Replace my settings"),
                ),
              panel.state.backupFound &&
                React.createElement(
                  BackupBtn,
                  {
                    onClick: () => panel.setState({ backupFound: null }),
                  },
                  msg("pref_backup_cancel", "Cancel"),
                ),
              panel.state.backupNote &&
                React.createElement(BackupNote, null, panel.state.backupNote),
            ),
          ),
        ),
  };
};

/* **THE GROUPS, ONCE** (26 Sep 2026).
 *
 * The order of the sections and of the settings inside them, with each
 * section's name and one line of what it is for. Settings draws its menu
 * from this and its pane from this, so a count in the menu and the rows
 * under a heading cannot disagree — the count is the rows, after the search
 * has had its say (a builder returns null for a setting it filtered out).
 *
 * **Five groups became seven sections, and every move had a reason** (the
 * arrangement is older than the menu): Language and Theme left "Look" for
 * Basics, which changes every screen; Currency came out of a collapsed
 * "Numbers"; the two settings that write the browser tab's title sit
 * together; Chart Colour and Quiet Controls joined the chart they are about.
 * Inside a section, the setting that changes the most on screen comes first,
 * and a dependent one sits directly under its parent. */
const preferenceGroups = (panel) => {
  const sections = settingSections(panel);
  const build = (keys) => keys.map((name) => sections[name]()).filter(Boolean);
  // The same, keeping each row's key — for the chart's headings
  const keyed = (keys) =>
    keys.map((name) => [name, sections[name]()]).filter(([, node]) => Boolean(node));
  const chartRows = keyed(CHART_SETTING_KEYS);
  return [
    {
      key: "basics",
      title: msg("pref_group_basics", "Basics"),
      desc: msg("pref_group_basics_desc", "Language, currency, how numbers are written, the theme and the size of everything — they change every screen."),
      nodes: build(["language", "currency", "numberFormat", "theme", "directionColors", "textSize"]),
    },
    {
      key: "chart",
      title: msg("pref_group_chart", "The chart"),
      desc: msg("pref_group_chart_desc", "How the chart is drawn. The same switches are in the drawer beside the chart, on its tab or V."),
      nodes: chartRows.map(([, node]) => node),
      // What the section shows: the same rows under their three headings
      display: withChartHeads(chartRows),
    },
    {
      key: "underPrice",
      title: msg("pref_group_under_price", "Under the price"),
      desc: msg("pref_group_under_price_desc", "What sits between the price and the chart."),
      nodes: build(["marketStats", "moveHeadlines", "lastSeen"]),
    },
    {
      key: "tabTickers",
      title: msg("pref_group_tab_tickers", "Tab & tickers"),
      desc: msg("pref_group_tab_tickers_desc", "The scrolling bar of prices, and what the browser tab says."),
      nodes: build(["pageTicker", "tabTicker", "alertTabTitle"]),
    },
    {
      key: "updating",
      title: msg("pref_group_updating", "Updating"),
      desc: msg("pref_group_updating_desc", "How often prices are asked for, and whether the chart walks through your coins by itself."),
      nodes: build(["refreshInterval", "autoRotate"]),
    },
    /* The one section about the app rather than the chart: what this tab
     * has at all. */
    {
      key: "features",
      title: msg("pref_group_features", "Features"),
      desc: msg("pref_group_features_desc", "What this tab has at all. Anything switched off here leaves no tab, no key and no request behind."),
      nodes: build(["features", "practiceGlossary", "practiceDock", "practiceConfirm"]),
    },
    /* Not a setting: the one thing here about the settings themselves. */
    {
      key: "data",
      title: msg("pref_group_data", "Your data"),
      desc: msg("pref_group_data_desc", "Everything this browser keeps for PriceTab, in one file you can carry to another."),
      nodes: build(["backup"]),
    },
  ];
};

/* **One section of the preferences, or the search's answer across all of
 * them.** `pick` is a group's key, or "modes" for the row that moves a dozen
 * settings at once — first under Preferences in the menu, because it is the
 * shortcut past the rest. A plain function like everything in this file:
 * state goes through `panel`, never `this`. */
const renderPreferencesSection = (panel, groups, pick, searching) => {
  if (searching) {
    const hits = groups.filter((g) => g.nodes.length);
    return React.createElement(
      TabContent,
      { key: "pref-search", "data-pref-section": "search" },
      ...hits.map((g) =>
        React.createElement(
          Fragment,
          { key: g.key },
          React.createElement(SettingsSearchGroup, null, g.title),
          ...g.nodes,
        ),
      ),
      panel._matched === 0
        ? React.createElement(
            SettingsNoMatch,
            null,
            `Nothing matches "${panel.state.query}".`,
          )
        : null,
    );
  }
  if (pick === "modes") {
    return React.createElement(
      TabContent,
      { key: "pref-modes", "data-pref-section": "modes" },
      renderModeRow(panel),
    );
  }
  const group = groups.find((g) => g.key === pick) || groups[0];
  return React.createElement(
    TabContent,
    { key: `pref-${group.key}`, "data-pref-section": group.key },
    ...(group.display || group.nodes),
  );
};
