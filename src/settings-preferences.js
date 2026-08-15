/* SETTINGS — PREFERENCES TAB
 * Split out of settings.js, which had grown past the 800-line guideline and
 * made every settings change a scroll hunt. The panel still owns the state;
 * this only renders, reading it through the `panel` it is handed.
 *
 * Every control goes through `panel.section(title, keywords, node)`, which
 * is what the search filters on — a control added without it will be
 * invisible to search.
 */
const renderPreferencesTab = (panel) => {
  const {
  themePreference, activeTheme, onThemeChange,
  chartColor, onChartColorChange,
  chartType, onChartTypeChange,
  volumeBars, onVolumeBarsChange,
  marketStats, onMarketStatsChange,
  chartGrid, onChartGridChange,
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
  } = panel.props;

  return React.createElement(
            TabContent,
            { key: "preferences-tab" },
            React.createElement(SettingsSearch, {
              type: "text",
              value: panel.state.query,
              placeholder: "Search settings…",
              "aria-label": "Search settings",
              onChange: (e) => this.setState({ query: e.target.value }),
            }),
            React.createElement(
              CollapsibleGroup,
              { title: "Appearance", forceOpen: Boolean(panel.state.query) },

            // Theme Section
            panel.section(
              'Theme',
              'dark light auto system colour',
              React.createElement(
                ThemeSection,
                null,
                React.createElement(ThemeSectionTitle, null, "Theme"),
                React.createElement(
                  ThemeButtonGroup,
                  null,
                  React.createElement(
                    ThemeButton,
                    {
                      active: themePreference === "auto",
                      onClick: () => onThemeChange && onThemeChange("auto"),
                    },
                    "Auto",
                  ),
                  React.createElement(
                    ThemeButton,
                    {
                      active: themePreference === "light",
                      onClick: () => onThemeChange && onThemeChange("light"),
                    },
                    "Light",
                  ),
                  React.createElement(
                    ThemeButton,
                    {
                      active: themePreference === "dark",
                      onClick: () => onThemeChange && onThemeChange("dark"),
                    },
                    "Dark",
                  ),
                ),
                React.createElement(
                  ThemeDescription,
                  null,
                  themePreference === "auto"
                    ? `Using ${activeTheme} mode (system preference)`
                    : `Using ${themePreference} mode`,
                ),
              ),
            ),

            // Chart Color Section
            

            // Line vs candlesticks
            

            // Chart detail (OHLC + volume in the crosshair)
            

            // "Since your last visit" line under the price
            panel.section(
              'Market Stats',
              'stats high low market cap volume range',
              React.createElement(
                ToggleSection,
                null,
                React.createElement(ToggleSectionTitle, null, "Market Stats"),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "Show the range high and low, market cap and 24h volume under the price",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    marketStats === false ? "Off" : "On",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: marketStats !== false,
                    onClick: () =>
                      onMarketStatsChange &&
                      onMarketStatsChange(marketStats === false),
                    "aria-label": "Toggle market stats",
                  }),
                ),
              ),
            ),

            panel.section(
              'Chart Grid',
              'grid mesh levels gridlines price time axis estimate target',
              React.createElement(
                ToggleSection,
                null,
                React.createElement(ToggleSectionTitle, null, "Chart Grid"),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "Price levels and time divisions behind the chart, so you can read a level off it. Hover a cell to light it up",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    chartGrid === true ? "On" : "Off",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: chartGrid === true,
                    onClick: () =>
                      onChartGridChange && onChartGridChange(chartGrid !== true),
                    "aria-label": "Toggle chart grid",
                  }),
                ),
              ),
            ),

            panel.section(
              'Move Headlines',
              'news headlines big move story context',
              React.createElement(
                ToggleSection,
                null,
                React.createElement(ToggleSectionTitle, null, "Move Headlines"),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "When a coin makes an unusual move, show headlines that mention it from the same window. Uses the same news feed as the ticker",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    moveHeadlines ? "On" : "Off",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: Boolean(moveHeadlines),
                    onClick: () =>
                      onMoveHeadlinesChange &&
                      onMoveHeadlinesChange(!moveHeadlines),
                    "aria-label": "Toggle move headlines",
                  }),
                ),
              ),
            ),

            panel.section(
              'Since Your Last Visit',
              'delta change visit last seen',
              React.createElement(
                ToggleSection,
                null,
                React.createElement(ToggleSectionTitle, null, "Since Your Last Visit"),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "Show how the coin moved since you last opened a tab",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    lastSeenEnabled === false ? "Off" : "On",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: lastSeenEnabled !== false,
                    onClick: () =>
                      onLastSeenChange && onLastSeenChange(lastSeenEnabled === false),
                    "aria-label": "Toggle since your last visit line",
                  }),
                ),
              ),
            ),

            /* The one setting that also governs work done while you are
             * elsewhere, so the description says so rather than describing
             * only the part you can see. */
            panel.section(
              "Price Target Alerts",
              "alert target tab title notify background announce",
              React.createElement(
                ToggleSection,
                null,
                React.createElement(
                  ToggleSectionTitle,
                  null,
                  "Announce Targets In The Tab Title",
                ),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "When a price target is hit, say so in the tab title, so a PriceTab tab you're not looking at can tell you. Keeps checking your targets while the tab is in the background — the only thing PriceTab fetches while you're elsewhere, and only when you have a target set",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    alertTabTitle === false ? "Off" : "On",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: alertTabTitle !== false,
                    onClick: () =>
                      onAlertTabTitleChange &&
                      onAlertTabTitleChange(alertTabTitle === false),
                    "aria-label":
                      "Toggle price target announcements in the tab title",
                  }),
                ),
              ),
            ),

            ),
            React.createElement(
              CollapsibleGroup,
              { title: "Chart", forceOpen: Boolean(panel.state.query) },
            panel.section(
              'Chart Color',
              'green red fill trend colour',
              React.createElement(
                ToggleSection,
                null,
                React.createElement(ToggleSectionTitle, null, "Chart Color"),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "Green when up, red when down — turn off for a plain line",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    chartColor === false ? "Off" : "On",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: chartColor !== false,
                    onClick: () =>
                      onChartColorChange && onChartColorChange(chartColor === false),
                    "aria-label": "Toggle chart color",
                  }),
                ),
              ),
            ),

            panel.section(
              'Candlesticks',
              'candle ohlc bars japanese',
              React.createElement(
                ToggleSection,
                null,
                React.createElement(ToggleSectionTitle, null, "Candlesticks"),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "Draw open/high/low/close bars instead of a price line. Ranges without candle data stay on the line",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    chartType === "candles" ? "On" : "Off",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: chartType === "candles",
                    onClick: () =>
                      onChartTypeChange &&
                      onChartTypeChange(chartType === "candles" ? "line" : "candles"),
                    "aria-label": "Toggle candlestick chart",
                  }),
                ),
              ),
            ),

            panel.section(
              'Volume Bars',
              'volume band bars traded activity',
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
                  React.createElement(ToggleSectionTitle, null, "Volume Bars"),
                  React.createElement(
                    ToggleSectionDesc,
                    null,
                    "Show traded volume as a band along the bottom of the chart",
                  ),
                  React.createElement(
                    ToggleRow,
                    null,
                    React.createElement(
                      ToggleLabel,
                      null,
                      volumeBars === false ? "Off" : "On",
                    ),
                    React.createElement(ToggleSwitch, {
                      active: volumeBars !== false,
                      onClick: () =>
                        onVolumeBarsChange &&
                        onVolumeBarsChange(volumeBars === false),
                      "aria-label": "Toggle volume bars",
                    }),
                  ),
                ),
              ),
              chartType === 'candles',
            ),

            panel.section(
              'Chart Details',
              'ohlc volume crosshair hover open high low close',
              React.createElement(
                ToggleSection,
                null,
                React.createElement(ToggleSectionTitle, null, "Chart Details"),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "Show open/high/low/close and volume when you hover the chart (one extra request per chart, only on hover)",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    ohlcEnabled === false ? "Off" : "On",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: ohlcEnabled !== false,
                    onClick: () => onOhlcChange && onOhlcChange(ohlcEnabled === false),
                    "aria-label": "Toggle chart detail readout",
                  }),
                ),
              ),
            ),
            ),
            React.createElement(
              CollapsibleGroup,
              { title: "Display", forceOpen: Boolean(panel.state.query) },

            // Currency Section
            panel.section(
              'Currency',
              'usd eur fiat money',
              React.createElement(
                CurrencySection,
                null,
                React.createElement(CurrencyLabel, null, "Currency"),
                React.createElement(
                  CurrencySelect,
                  {
                    value: currency || DEFAULT_CURRENCY,
                    onChange: (e) => {
                      const newCurrency = e.target.value;
                      if (onCurrencyChange) {
                        onCurrencyChange(newCurrency);
                      }
                    },
                  },
                  React.createElement(
                    "optgroup",
                    { label: "Popular" },
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
                    { label: "All currencies" },
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

            // Number Format Section
            panel.section(
              'Number Format',
              'decimals separator thousands format',
              React.createElement(
                NumberFormatSection,
                null,
                React.createElement(NumberFormatLabel, null, "Decimal Places"),
                React.createElement(
                  NumberFormatSelect,
                  {
                    value: decimalPlaces || DEFAULT_DECIMAL_PLACES,
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
                React.createElement(NumberFormatLabel, null, "Number Format"),
                React.createElement(
                  NumberFormatSelect,
                  {
                    value: separatorFormat || DEFAULT_SEPARATOR_FORMAT,
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

            ),
            React.createElement(
              CollapsibleGroup,
              { title: "Data", forceOpen: Boolean(panel.state.query) },

            // Refresh Interval Section
            panel.section(
              'Refresh Interval',
              'update poll seconds frequency',
              React.createElement(
                RefreshIntervalSection,
                null,
                React.createElement(
                  RefreshIntervalLabel,
                  null,
                  "Refresh Interval",
                ),
                React.createElement(
                  RefreshIntervalSelect,
                  {
                    value: refreshInterval || DEFAULT_REFRESH_INTERVAL,
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

            // Auto Rotate Section
            panel.section(
              'Auto Rotate',
              'cycle coins rotate interval',
              React.createElement(
                ToggleSection,
                null,
                React.createElement(ToggleSectionTitle, null, "Auto Rotate"),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "Switch to the next coin in your list automatically",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    autoRotate ? "On" : "Off",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: autoRotate,
                    onClick: () =>
                      onAutoRotateChange && onAutoRotateChange(!autoRotate),
                    "aria-label": "Toggle auto rotate",
                  }),
                ),
              ),
            ),

            // Auto Rotate Interval (collapses smoothly when off)
            React.createElement(
              SettingReveal,
              { key: "auto-rotate-interval", open: autoRotate },
              React.createElement(
                RefreshIntervalSection,
                null,
                React.createElement(RefreshIntervalLabel, null, "Switch Every"),
                React.createElement(
                  RefreshIntervalSelect,
                  {
                    value: autoRotateInterval || DEFAULT_AUTO_ROTATE_INTERVAL,
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

            ),
            React.createElement(
              CollapsibleGroup,
              { title: "Tickers", forceOpen: Boolean(panel.state.query) },

            // Tab Ticker Section
            panel.section(
              'Tab Ticker',
              'browser tab title price',
              React.createElement(
                ToggleSection,
                null,
                React.createElement(
                  ToggleSectionTitle,
                  null,
                  "Browser Tab Title",
                ),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "Show live prices in the browser tab title",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    tickerEnabled ? "On" : "Off",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: tickerEnabled,
                    onClick: () =>
                      onTickerChange && onTickerChange(!tickerEnabled),
                    "aria-label": "Toggle tab ticker",
                  }),
                ),
              ),
            ),

            // Ticker Format (collapses smoothly when the tab ticker is off)
            React.createElement(
              SettingReveal,
              { key: "ticker-format", open: tickerEnabled },
                React.createElement(
                RefreshIntervalSection,
                null,
                React.createElement(
                  RefreshIntervalLabel,
                  null,
                  "Title Format",
                ),
                React.createElement(
                  RefreshIntervalSelect,
                  {
                    value: tickerFormat || DEFAULT_TICKER_FORMAT,
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

            // Page Ticker Section
            panel.section(
              'Price Ticker Bar',
              'scrolling bar news headlines position',
              React.createElement(
                ToggleSection,
                null,
                React.createElement(
                  ToggleSectionTitle,
                  null,
                  "Price Ticker Bar",
                ),
                React.createElement(
                  ToggleSectionDesc,
                  null,
                  "Scrolling price bar across the page (top or bottom)",
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    pageTicker ? "On" : "Off",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: pageTicker,
                    onClick: () =>
                      onPageTickerChange && onPageTickerChange(!pageTicker),
                    "aria-label": "Toggle page ticker",
                  }),
                ),
              ),
            ),

            // Page Ticker Position (collapses smoothly when the page ticker is off)
            React.createElement(
              SettingReveal,
              { key: "page-ticker-position", open: pageTicker },
                React.createElement(
                RefreshIntervalSection,
                null,
                React.createElement(RefreshIntervalLabel, null, "Position"),
                React.createElement(
                  RefreshIntervalSelect,
                  {
                    value: pageTickerPosition || DEFAULT_PAGE_TICKER_POSITION,
                    onChange: (e) =>
                      onPageTickerPositionChange &&
                      onPageTickerPositionChange(e.target.value),
                  },
                  React.createElement("option", { value: "bottom" }, "Bottom"),
                  React.createElement("option", { value: "top" }, "Top"),
                ),
                React.createElement(
                  ToggleRow,
                  null,
                  React.createElement(
                    ToggleLabel,
                    null,
                    "News Headlines",
                  ),
                  React.createElement(ToggleSwitch, {
                    active: newsTicker,
                    onClick: () =>
                      onNewsTickerChange && onNewsTickerChange(!newsTicker),
                    "aria-label": "Toggle news headlines row",
                  }),
                ),
                React.createElement(
                  SettingReveal,
                  { key: "news-disclosure", open: newsTicker },
                  React.createElement(
                    ToggleSectionDesc,
                    null,
                    "Headlines come from public sources via Blockchair. Clicking one opens the news site in a new tab.",
                  ),
                ),
              ),
              ),
            ),

            // Evaluated after the groups, so the tally is final by now
            panel.state.query && panel._matched === 0
              ? React.createElement(
                  SettingsNoMatch,
                  null,
                  `Nothing matches "${panel.state.query}".`,
                )
              : null,

            // The shortcuts and the tour are the least discoverable parts of
            // the extension — and the tour only ever shows itself once
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
                    title: "Show the keyboard shortcuts",
                  },
                  "Keyboard shortcuts",
                ),
                React.createElement(
                  ShortcutsHint,
                  {
                    onClick: () =>
                      panel.props.onReplayTour && panel.props.onReplayTour(),
                    title: "Run the first-run tour again",
                  },
                  "Replay tour",
                ),
              ),
          );
};
