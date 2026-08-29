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
 * search. A section may return null (filtered out), and `CollapsibleGroup`
 * hides a group whose every child came back null, so searching collapses the
 * panel to the matches rather than leaving empty headings behind.
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
const settingTitle = (panel, key, title) =>
  React.createElement(
    SettingTitleRow,
    null,
    React.createElement(ToggleSectionTitle, { style: { margin: 0 } }, title),
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
      maxHeight: "14rem",
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

const renderModeRow = (panel) => {
  const { appMode, onAppMode } = panel.props;
  const hovered = APP_MODES.find((m) => m.value === panel.state.modeHover);
  const active = APP_MODES.find((m) => m.value === appMode);
  const shown = hovered || active;
  return React.createElement(
    ModeSection,
    { key: "modes" },
    React.createElement(ModeLabel, null, msg("pref_modes", "Modes")),
    React.createElement(
      PresetRow,
      { onMouseLeave: () => panel.setState({ modeHover: null }) },
      ...APP_MODES.map((mode) =>
        React.createElement(
          PresetButton,
          {
            key: mode.value,
            type: "button",
            active: appMode === mode.value,
            onClick: () => onAppMode && onAppMode(mode.value),
            onMouseEnter: () => panel.setState({ modeHover: mode.value }),
            onFocus: () => panel.setState({ modeHover: mode.value }),
            title: mode.desc,
          },
          mode.label,
        ),
      ),
    ),
    React.createElement(
      ModeDesc,
      { dim: !shown },
      shown
        ? shown.desc
        : msg(
          "pref_modes_own",
          "Your own arrangement. A mode sets a dozen of the settings below at once — currency, number format and theme are always left as you have them.",
        ),
    ),
  );
};

const renderPreferencesTab = (panel) => {
  const {
  themePreference, activeTheme, onThemeChange,
  language, onLanguageChange,
  chartColor, onChartColorChange,
  chartType, onChartTypeChange,
  volumeBars, onVolumeBarsChange,
  marketStats, onMarketStatsChange,
  chartGrid, onChartGridChange,
  moveNews, onMoveNewsChange,
  quietChrome, onQuietChromeChange,
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
  } = panel.props;

  const sections = {

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
            React.createElement(
              "option",
              { key: "auto", value: "auto" },
              msg("pref_language_auto", "Auto (follow Chrome)"),
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
              msg("pref_chart_color_desc", "Green when up, red when down — turn off for a plain line"),
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
                onClick: () =>
                  onChartColorChange && onChartColorChange(chartColor === false),
                "aria-label": msg("pref_chart_color_aria", "Toggle chart color"),
              }),
            ),
          ),
        ),
    quietChrome: () =>
      panel.section(
        msg("pref_quiet_chrome_title", "Quiet Controls"),
        msg("pref_quiet_chrome_keywords", "quiet minimal fade hide corner buttons chrome opacity keyboard focus"),
        React.createElement(
          ToggleSection,
          null,
          settingTitle(panel, "quietChrome", msg("pref_quiet_chrome_heading", "Quiet Controls")),
          React.createElement(
            ToggleSectionDesc,
            null,
            msg("pref_quiet_chrome_desc", "Let the corner buttons rest almost invisible and come back when you point at them. Nothing is hidden and nothing stops working — the keys still do what they did"),
          ),
          settingNote(
            panel,
            "quietChrome",
            msg("pref_quiet_chrome_note", "The gear rests brightest of the five, because it is the way back to this setting. Every one of them comes to full under the pointer and on keyboard focus, and the shortcuts work whatever they look like."),
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
              onClick: () =>
                onQuietChromeChange && onQuietChromeChange(quietChrome !== true),
              "aria-label": msg("pref_quiet_chrome_aria", "Toggle quiet controls"),
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
              maxHeight: "14rem", // a full section, not a single row
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
                onClick: () =>
                  onChartGridChange && onChartGridChange(chartGrid !== true),
                "aria-label": msg("pref_chart_grid_aria", "Toggle chart grid"),
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
              React.createElement(
                ToggleRow,
                null,
                React.createElement(
                  ToggleLabel,
                  null,
                  msg("pref_news_headlines", "News Headlines"),
                ),
                React.createElement(ToggleSwitch, {
                  active: newsTicker,
                  onClick: () =>
                    onNewsTickerChange && onNewsTickerChange(!newsTicker),
                  "aria-label": msg("pref_page_ticker_aria_3", "Toggle news headlines row"),
                }),
              ),
              React.createElement(
                SettingReveal,
                { key: "news-disclosure", open: newsTicker, maxHeight: "14rem" },
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
                React.createElement(
                  RefreshIntervalLabel,
                  { style: { margin: 0 } },
                  "Refresh Interval",
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
  };

  /* A group is a title and an order. `defaultOpen` is the second half of the
   * reorganisation: with every group open the tab was one seven-hundred-pixel
   * scroll, so the two people touch most stay open and the rest are a list of
   * headings you can read in one look. Searching forces all of them open —
   * hunting for a match behind a collapsed header defeats the search. */
  /* The order inside a group is not alphabetical and not historical. It is:
   * **the setting that changes the most on screen comes first**, and a setting
   * that only applies while another is on sits directly under its parent
   * (Volume Bars under Candlesticks, the interval under Auto Rotate). That is
   * why Candlesticks leads the chart group and Chart Details — which only
   * shows itself when you hover — closes it. */
  const group = (title, defaultOpen, keys) =>
    React.createElement(
      CollapsibleGroup,
      {
        key: title,
        title,
        defaultOpen,
        forceOpen: Boolean(panel.state.query),
      },
      ...keys.map((name) => sections[name]()),
    );

  return React.createElement(
    TabContent,
    { key: "preferences-tab" },
    React.createElement(SettingsSearch, {
      type: "text",
      value: panel.state.query,
      placeholder: msg("pref_search", "Search settings…"),
      "aria-label": msg("pref_search_label", "Search settings"),
      /* `panel`, not `this`. This file is a plain function, so `this` here was
       * the global object and every keystroke threw `this.setState is not a
       * function` — the search box took no text at all. */
      onChange: (e) => panel.setState({ query: e.target.value }),
    }),
    /* Modes first, and outside the groups: it is the one control that moves
     * every other control in the panel, so it reads as the shortcut rather
     * than as another setting. Hidden while searching — a search is a hunt for
     * one switch, and a row that changes twelve of them is not the answer. */
    !panel.state.query && renderModeRow(panel),
    group(msg("pref_group_look", "Look"), true, ["language", "theme", "chartColor", "quietChrome"]),
    group(msg("pref_group_chart", "Chart"), true, [
      "candlesticks",
      "volumeBars",
      "chartGrid",
      "moveNews",
      "chartDetails",
    ]),
    /* The three readouts that live under the price, together, because that is
     * where they are on screen — they used to sit under "Appearance" while the
     * chart's own settings were in "Chart", so half the chart was in each.
     *
     * **Open by default, and it is the third group that is** — the rest start
     * closed so the tab reads as a table of contents, which is the right
     * default and stays the default. The departure is deliberate: this is the
     * only group whose settings all govern the strip immediately under the
     * price, which is the most-looked-at part of the screen, and the headline
     * line is the one thing here that appears on its own without being asked
     * for. Someone who wants it gone looks straight at it and then goes to
     * Settings — and a closed accordion called "Under the price" is not where
     * they look. Reported as exactly that. */
    group(msg("pref_group_under_price", "Under the price"), true, ["moveHeadlines", "marketStats", "lastSeen"]),
    group(msg("pref_group_numbers", "Numbers"), false, ["currency", "numberFormat"]),
    /* Ordered by how much of the screen each one changes: the bar across the
     * page leads, the tab strip follows. */
    group(msg("pref_group_tickers", "Tickers"), false, ["pageTicker", "tabTicker"]),
    /* Everything that happens over time or while you are elsewhere: how often
     * it polls, whether it cycles coins, and the one setting that also governs
     * work done in a hidden tab. */
    group(msg("pref_group_updating", "Updating"), false, ["refreshInterval", "autoRotate", "alertTabTitle"]),

    // Evaluated after the groups, so the tally is final by now

    panel.state.query && panel._matched === 0
        ? React.createElement(
            SettingsNoMatch,
            null,
            `Nothing matches "${panel.state.query}".`,
          )
        : null,

    // The shortcuts and the tour are the least discoverable parts of the
    // extension — and the tour only ever shows itself once
    !panel.state.query &&
      React.createElement(
        HelpHintRow,
        null,
        React.createElement(
          ShortcutsHint,
          {
            onClick: () =>
              panel.props.onShowShortcuts &&
              panel.props.onShowShortcuts(),
            title: msg("pref_show_shortcuts", "Show the keyboard shortcuts"),
          },
          msg("sc_title", "Keyboard shortcuts"),
        ),
        React.createElement(
          ShortcutsHint,
          {
            onClick: () =>
              panel.props.onReplayTour && panel.props.onReplayTour(),
            title: msg("pref_replay_hint", "Run the first-run tour again"),
          },
          msg("pref_replay_tour", "Replay tour"),
        ),
        /* Always here, and quiet. The rating ask is a card that appears once
         * and can be waved away; this is the door it leaves open. */
        React.createElement(
          RateHint,
          {
            href: STORE_LISTING_URL,
            target: "_blank",
            rel: "noreferrer",
            title: msg("pref_rate_hint", "Open the Chrome Web Store listing in a new tab"),
          },
          msg("pref_rate", "Rate PriceTab"),
        ),
      ),
  );
};
