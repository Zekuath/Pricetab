/* ERROR BOUNDARY */
// React unmounts the entire tree on an uncaught render error — without a
// boundary one bad widget would blank the whole new tab page.
// (componentDidCatch only: getDerivedStateFromError needs React 16.6+)
class ErrorBoundary extends Component {
  constructor(...args) {
    super(...args);
    this.state = { hasError: false };
  }

  componentDidCatch() {
    this.setState({ hasError: true });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

/* The two theme objects the app ever hands to `ThemeProvider`, built once.
 *
 * Their *identity* is the point, not their contents: styled-components passes
 * the theme through context, so a fresh object per render is a changed value for
 * every styled descendant and for `LineBase`, which takes it via `withTheme`.
 * Built here rather than in `render` because there are only two palettes and
 * neither depends on state. */
/* How long a "Called it" card stays before it lets itself go. Long enough to
 * read twice and notice which square it was, short enough that a win settling
 * while you were away is not still on the chart tomorrow. */
const WON_CALL_TOAST_MS = 22000;

const THEMES = {
  classic: { light: { ...theme, color: lightColors }, dark: { ...theme, color: darkColors } },
  cvd: {
    light: { ...theme, color: paletteColors("light", "cvd") },
    dark: { ...theme, color: paletteColors("dark", "cvd") },
  },
};

/* The ticker is the largest steady DOM subtree on the page: 81 priced coins,
 * doubled across two rows for a seamless loop. It used to live inside the
 * root render, so an unrelated state change made React reconcile roughly two
 * thousand nodes even though every ticker input was unchanged. Keep that
 * boundary explicit: PureComponent lets price/news updates redraw the bar,
 * while a chart, toast or tab-title update walks past it. */
class PageTicker extends PureComponent {
  render() {
    const {
      items,
      position,
      collapsed,
      newsTicker,
      newsItems,
      onMeasure,
      onToggle,
    } = this.props;
    const chevron = (dir) =>
      React.createElement(
        "svg",
        {
          width: "14",
          height: "14",
          viewBox: "0 0 16 16",
          fill: "none",
          "aria-hidden": "true",
        },
        React.createElement("path", {
          d:
            dir === "up"
              ? "M3.5 10.5l4.5-4.5 4.5 4.5"
              : "M3.5 6l4.5 4.5 4.5-4.5",
          stroke: "currentColor",
          strokeWidth: "1.6",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      );
    // Collapse tucks toward the screen edge; expand pulls back toward centre
    const collapseDir = position === "top" ? "up" : "down";
    const expandDir = position === "top" ? "down" : "up";

    // Build doubled item list for seamless loop (translateX -50%)
    const makeTrack = (trackItems) => {
      const doubled = [...trackItems, ...trackItems];
      return doubled.map((item, i) =>
        React.createElement(
          PageTickerItem,
          { key: i },
          React.createElement(PageTickerSymbol, null, item.coin),
          item.up !== null && item.up !== undefined
            ? React.createElement(
                PageTickerChange,
                { up: item.up },
                item.up ? "\u25b2" : "\u25bc",
              )
            : null,
          React.createElement(PageTickerPrice, null, item.price),
          item.change
            ? React.createElement(
                PageTickerChange,
                { up: item.up },
                item.change,
              )
            : null,
          React.createElement(PageTickerSep, null, "\u2502"),
        ),
      );
    };

    return React.createElement(
      PageTickerShell,
      { position },
      React.createElement(
        PageTickerCollapsible,
        {
          position,
          collapsed,
          /* The bar reports its own height; the page's padding is made of it.
             Measured on the sliding element rather than on the fixed shell,
             because that is the box whose height is the space the chart has
             to give up. */
          innerRef: onMeasure,
        },
        React.createElement(
          PageTickerBar,
          { position },
          React.createElement(
            PageTickerRow,
            null,
            React.createElement(
              PageTickerTrack,
              { speed: Math.max(30, items.length * 2) },
              ...makeTrack(items),
            ),
          ),
          React.createElement(
            PageTickerRow,
            null,
            React.createElement(
              PageTickerTrack,
              {
                speed: Math.max(38, items.length * 2.5),
                style: { animationDelay: "-15s" },
              },
              ...makeTrack([...items].reverse()),
            ),
          ),
          newsTicker && newsItems.length > 0
            ? React.createElement(
                PageTickerRow,
                null,
                React.createElement(
                  PageTickerTrack,
                  { speed: Math.max(90, newsItems.length * 10) },
                  ...(() => {
                    const doubled = [...newsItems, ...newsItems];
                    return doubled.map((item, i) =>
                      React.createElement(
                        PageTickerItem,
                        { key: "news-" + i },
                        React.createElement(
                          PageTickerSymbol,
                          null,
                          item.source,
                        ),
                        item.url
                          ? React.createElement(
                              PageTickerNewsLink,
                              {
                                href: item.url,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                title:
                                  msg("app_read_on", "Read on ") +
                                  item.source +
                                  " — opens in a new tab",
                              },
                              item.title,
                            )
                          : React.createElement(
                              PageTickerPrice,
                              null,
                              item.title,
                            ),
                        React.createElement(PageTickerSep, null, "│"),
                      ),
                    );
                  })(),
                ),
              )
            : null,
        ),
        React.createElement(
          PageTickerChevron,
          {
            position,
            type: "button",
            onClick: onToggle,
            title: msg("chrome_ticker_hide", "Hide ticker"),
            "aria-label": msg("chrome_ticker_hide", "Hide ticker"),
          },
          chevron(collapseDir),
        ),
      ),
      collapsed &&
        React.createElement(
          PageTickerHandle,
          {
            position,
            type: "button",
            onClick: onToggle,
            title: msg("chrome_ticker_show", "Show ticker"),
            "aria-label": msg("chrome_ticker_show", "Show ticker"),
          },
          chevron(expandDir),
        ),
    );
  }
}

/* CRYPTO CHART */
class CryptoChart extends PureComponent {
  constructor(...args) {
    super(...args);

    // AbortController for canceling ongoing requests
    this.abortController = null;

    // Tracks which coin|currency pairs we've already background-prefetched all
    // periods for, so period switches are instant instead of a cold fetch.
    this.prefetchedKeys = new Set();
    // One dismissal timer per announced win, so clearing one by hand does not
    // leave a timer running for a card that has already gone
    this.wonCallTimers = new Map();

    _defineProperty(this, "state", {
      coinIndex: 0,
      currentValue: null,
      period: PERIOD_OPTIONS[0].value,
      valueHistory: [],
      /* The derivatives page's chart: the perpetual's own USDT series for the
         coin and range on screen, `{ key, data }` — see `fetchPracticeSeries`. */
      practiceSeries: null,
      /* Bumped when a perpetual quote lands, so the page re-reads them. */
      practiceQuoteAt: 0,
      coinOptions: loadCoinOptionsFromStorage(),
      /* Settings comes back open when the language was changed from inside
       * it — a reload closes every panel, so picking a language threw you
       * out of the panel you picked it in. `reopenSettingsTab` is resolved
       * once in `i18n.js` and is true for exactly the reload that set it. */
      showSettings: Boolean(reopenSettingsTab),
      /* Which tab Settings should open on, when something in this session
       * asked for one (the news panel's permission line asks for
       * Permissions). Null is "wherever it opens by default". Passed to the
       * panel as a **prop**, not through `markReopenSettings`: that writes a
       * key `i18n.js` reads once at file load into `reopenSettingsTab`, so it
       * can only carry a tab across a page reload — a value written there
       * mid-session is read by nothing until the next one. */
      settingsTab: null,
      showPortfolio: false, // Full-screen tracking-only portfolio view
      showRateAsk: false, // One-time rating ask (eligibility checked on mount)
      // Price when this coin was last looked at, for the "since your last
      // visit" line: { price, time } or null. Frozen at mount so the line
      // never moves while the tab is open.
      lastSeen: loadLastSeen(),
      lastSeenEnabled: loadLastSeenEnabled(), // settings toggle
      ohlcEnabled: loadOhlcEnabled(), // crosshair OHLC + volume readout
      chartType: loadChartType(), // 'line' | 'candles'
      volumeBars: loadVolumeBars(), // volume band under the chart
      marketStats: loadMarketStats(), // stats line under the price
      chartGrid: loadChartGrid(), // price/time mesh behind the series
      // A logarithmic price axis. Stands down while the board is up, which is
      // the chart's own rule — see `logAxis` in chart-board.js
      logScale: loadLogScale(),
      // A moving average over the drawn range — see CHART_AVERAGE_KEY
      chartAverage: loadChartAverage(),
      // US CPI releases on the chart and the line under the price — see MACRO_EVENTS_KEY
      macroEvents: loadMacroEvents(),
      /* The chart companion — see COMPANION_KEY. `companionData` is what it
         found for one coin, `{ coin, episodes, records }`, kept as one object
         so the chart's prop only changes when the answer does. */
      companion: loadCompanion(),
      companionData: null,
      // The companion's metrics switched off one by one — see COMPANION_HIDDEN_KEY
      companionHidden: loadCompanionHidden(),
      // Classic overlays drawn from the same daily candles, any number at once — see INDICATOR_OVERLAYS_KEY
      indicatorOverlays: loadIndicatorOverlays(),
      // The counted studies switched on (chart-studies.js) — see CHART_STUDIES_KEY
      chartStudies: loadChartStudies(),
      /* "What happened here?" — marks at the moments the price did something
       * unusual for this series, and the headlines from around them. Where the
       * marks go is local; only opening one costs a request. */
      moveNews: loadMoveNews(),
      // The mark that is open, and what came back for it. `null` for neither.
      openMove: null, // { items, x, loading, items: [...] }
      moveHeadlinesFor: null, // the window's headlines, or null while in flight
      // Corner controls resting almost invisible — see QUIET_CHROME_KEY
      quietChrome: loadQuietChrome(),
      predict: loadPredict(), // "call the cell" — read the chart, name the box
      futureShare: loadFutureShare(), // how much of the width the board takes
      // How far the board reaches in price, per range — see BOARD_ZOOM_KEY
      boardZoom: loadBoardZoom(PERIOD_OPTIONS[0].value),
      callsShowSettled: loadCallsShowSettled(), // keep settled boxes on the chart
      travelBand: loadTravelBand(), // the cone on the board — see updateTravelBand
      callsCelebrate: loadCallsCelebrate(), // burst on a hit
      calls: loadCalls(), // { record, open } — local, valueless, never sent
      callsSeenAt: loadCallsSeenAt(), // when the calls panel was last opened
      newsSeenAt: loadNewsSeenAt(), // …and when the news panel was
      // The divider's position for this visit; only moves on the next open
      newsReadFrom: loadNewsSeenAt(),
      celebrateCall: null, // the call the burst is fired on
      wonCalls: [], // settled hits waiting to be acknowledged, as toasts
      /* Futures positions the *market* closed — a liquidation, a stop, a
         take-profit — waiting to be acknowledged. `practiceStep` has always
         returned these events and nothing ever read them, so the one thing
         that happens to a position while you are not looking at the panel
         happened in silence: the balance was smaller and nothing said why.
         A target being hit and a call coming true are both announced; this
         is the same kind of fact and a more consequential one. */
      closedPositions: [],
      callGeometry: null, // { step, spanMs, reachMs } reported by the chart
      celebrate: 0, // bumped on a hit; the chart bursts when it changes
      fireworks: 0, // bumped on a hit worth the big show — see `settleDueCalls`
      moveHeadlines: loadMoveHeadlines(), // headlines beside an unusual move
      portfolio: loadPortfolioFromStorage(), // [{ coin, amount, lots, watches }]
      // Which purchase a *new* sale consumes, and what `heldLots` assumes went
      costMethod: loadCostMethod(),
      portfolioPrices: {}, // { COIN: { price, change, up } } from pageTickerCache
      portfolioReady: false, // true after first portfolio price fetch
      // Money and quantities masked on the portfolio screen ("H"), percentages
      // and prices left alone — see PORTFOLIO_HIDDEN_KEY
      portfolioHidden: loadPortfolioHiddenFromStorage(),
      themePreference: loadThemeFromStorage(), // 'auto', 'light', or 'dark'
      directionPalette: loadDirectionPalette(), // 'classic' green/red or 'cvd' blue/orange
      /* 'auto' — follow Chrome's own UI language — or one of
       * `SUPPORTED_LOCALES`. Only the picker reads it; every string on
       * screen was resolved by `msg()` before this component existed. */
      language: loadLanguageSetting(),
      activeTheme: getActiveTheme(loadThemeFromStorage()), // 'light' or 'dark'
      refreshInterval: loadRefreshIntervalFromStorage(), // milliseconds
      decimalPlaces: loadDecimalPlacesFromStorage(), // number of decimal places
      separatorFormat: loadSeparatorFormatFromStorage(), // 'us', 'eu', 'space'
      currency: loadCurrencyFromStorage(), // 'USD', 'EUR', 'GBP', 'TRY'
      isOffline: !navigator.onLine, // Network status
      isLoading: true, // Initial loading state
      showSkeleton: false, // Delayed skeleton (shows after 300ms)
      /* Which widgets asked and came back with nothing — see
         `queueWidgetData`. A card with no data and no entry here is still
         waiting; one with an entry has finished and failed. */
      widgetFailed: {},
      invalidCoin: null, // Invalid coin warning
      apiError: false, // API failure state
      /* When the prices on screen were fetched — now on an answer, the cache
         entry's own age when the answer was the cache. Read only while a
         fetch is failing or the network is gone, for the chart's "prices
         from 12 min ago": the banner said "the last prices we have" and
         never how old they were. */
      pricesAt: null,
      /* The chart's window in time and the finer candles it asked for
         (app-view.js, chart-viewport.js). Never persisted: a new tab opens
         on the range. */
      chartView: null,
      chartDetail: null,
      // The compared coin as the unit (app-view.js): ETH in BTC. Session only
      compareRatio: false,
      /* The drawings on the chart, per coin (app-tools.js, DRAWINGS_KEY),
         the tool in the hand, the drawing selected and the one whose note
         is being written. */
      drawings: loadDrawings(),
      // The tool strip: shown at all (CHART_TOOLS_KEY), folded out, the tool pointed at
      chartToolsShown: loadChartTools(),
      toolsOpen: false,
      toolHint: null,
      chartTool: null,
      drawingSelected: null,
      drawingEditing: null,
      retrying: false, // Manual retry in flight (from the error banner)
      slowLoad: false, // First fetch is taking a while — say so in the skeleton
      showQuickSwitch: false, // "/" coin jumper
      quickSwitchCompare: false, // the jumper is picking a coin to compare
      /* Comparison overlay. Deliberately not persisted: it answers a question
       * you have once ("has ETH kept up with BTC this week?"), and a new tab
       * that always opened with two lines on it would be answering a question
       * nobody asked. */
      compareCoin: null, // second coin drawn over the chart, or null
      compareHistory: null, // its series for the current period + currency
      /* The chart's own settings, in a drawer beside it ("V"). Not persisted:
       * it is where you are looking right now, not a setting. */
      showChartSettings: false,
      /* The widgets' drawer, the first of the four on the left edge (25 Sep
         2026). Where you are looking, not a setting, so never stored. */
      showWidgetsDrawer: false,
      /* The chart's tab column pulled out of its drawer by hand — see
       * `spineShown`, which also counts an open drawer and the tour. Where
       * you are looking, not a setting. */
      spineOpen: false,
      /* The screens' column on the right, pulled out the same way. */
      screenSpineOpen: false,
      /* The pointer is near a pull (SPINE_NEAR_X): it slides out on the
         dwell, as it does under the pointer. */
      chartPullNear: false,
      screenPullNear: false,
      /* The order the panels sit in, everywhere at once — see
       * `PANEL_ORDER_KEY`. This one *is* a setting, so it is stored. */
      panelOrder: loadPanelOrder(),
      /* The tour drives the arrow keys and Esc itself, so the global shortcut
       * handler has to stand down while it is up. `tourReplay` is bumped by
       * Settings to remount (and force) the tour on demand. */
      tourActive: false,
      tourReplay: 0,
      alerts: loadAlerts(), // Price targets (in-tab, zero permissions)
      firedAlerts: [], // Targets just hit → toast stack
      // Announce a hit in the tab title, and keep checking while hidden
      alertTabTitle: loadAlertTabTitle(),
      /* The real alarm. Two wants and one fact: whether Chrome will actually
         let us raise a banner is asked of Chrome on mount and after every
         press, never stored — it can be revoked from chrome://extensions
         without this page hearing about it. */
      alarmNotify: loadAlarmNotify(),
      alarmSound: loadAlarmSound(),
      alarmGranted: false,
      /* Which of the two overlay lists is up: null, "targets" or "calls".
       *
       * One field rather than two booleans, because they are one slot — the
       * card is in the middle of the screen and only one thing can be in it.
       * Two flags would have meant an impossible state (both up) that every
       * other overlay's guard would then have had to test for twice, and the
       * guards are already the fiddliest part of `handleKeyDown`. Everything
       * that only cares *whether* a list is up keeps reading it as a
       * truthy value, which is why the rename cost nothing at those sites. */
      alertsView: null,
      tickerEnabled: loadTickerFromStorage(), // Tab ticker mode
      tickerFormat: loadTickerFormatFromStorage(), // 'compact' or 'full'
      autoRotate: loadAutoRotateFromStorage(), // Auto-cycle through coins
      autoRotateInterval: loadAutoRotateIntervalFromStorage(), // ms
      newsTicker: loadNewsTickerFromStorage(), // News row in the page ticker
      newsFilter: loadNewsFilter(), // "all" | "coins" | "portfolio"
      /* The news panel ("N"). Its own reading surface rather than a strip
       * inside another view: headlines are something you go and read, and the
       * ticker can only be read in the order it scrolls past. */
      showNews: false,
      /* "Has this happened before?" — the base-rate panel ("B"). Its data is
       * years of daily closes and costs about seventeen requests, so nothing is
       * fetched until this is true. */
      showBaseRates: false,
      /* Futures, drawn inside the Calls panel — see `renderPositions` in
         `src/alerts.js`. Marked against the same live price the chart is
         drawing, so a liquidation happens on the market you are looking at
         rather than on a second one.
         Three separate keys, and they have to be: whether the section is
         offered at all (off by default, like every other addition here),
         whether the terms have been read, and the account itself. Resetting
         the balance must not re-ask what this is, and switching the section
         off and on again must not either. */
      /* Which of the app's features are switched on — see `FEATURE_CONTROLS`.
         Absent is on. Off is a real off: no button, no shortcut, no way in.
         Settings is not in the list and cannot be turned off, because it is
         the way back to this setting. Futures is in the list but stored under
         its own key, since its terms are remembered separately. */
      features: loadFeatures(),
      practiceEnabled: loadPracticeEnabled(),
      practiceConsent: loadPracticeConsent(),
      practiceUnits: loadPracticeUnits(),
      practiceTicket: loadPracticeTicket(),
      practiceDock: loadPracticeDock(),
      practiceConfirm: loadPracticeConfirm(),
      /* The chart's position widget, expanded in place. Not persisted: it is
         a look at something, not a preference, and a new tab should open with
         the chart clear. */
      dockOpen: false,
      /* Which share of the contract is waiting for its second press. Null
         when nothing is armed; cleared whenever the widget opens or shuts. */
      dockArmed: null,
      practice: loadPractice() || practiceEmptySession(),
      newsSources: loadNewsPanelSources(), // { source: false } — absent is on
      newsPanelScope: loadNewsPanelFilter(), // its own scope, not the ticker's
      // Headlines kept to read later — see NEWS_SAVED_KEY
      newsSaved: loadNewsSaved(),
      // A real in-flight flag. What stood in for it was `newsItems.length === 0`,
      // which cannot tell "still asking" from "asked, and nothing came back"
      newsLoading: false,
      // Every granted newsroom failed to answer at once — see `fetchNewsData`
      newsBlocked: false,
      /* Which newsroom origins Chrome actually holds. Kept in state rather
       * than asked per hover, because the "what happened here?" archive needs
       * it on a pointer move — and because `api.js` loads before `news.js`, so
       * the archive is handed the answer rather than reaching for it. */
      newsGranted: [],
      newsItems: [], // [{ source, title, url }]
      tickerText: "", // Full ticker string
      // Widget states
      widgets: loadWidgetsFromStorage(), // { fearGreed, marketOverview, halvingCountdown, rsiWidget }
      hiddenWidgets: loadHiddenWidgetsFromStorage(), // Per-widget hide state from main screen
      widgetSize: loadWidgetSizeFromStorage(), // 'small' | 'medium' | 'large' | 'xlarge'
      /* The drawer's width in px where its right edge was let go, or null
       * for the 30rem it opens at (WIDGETS_WIDTH_KEY). Written once per
       * drag: the drag itself moves a CSS variable on the node, because a
       * setState per pointer move re-renders this whole tree sixty times a
       * second. `widgetsResizing` only shows the grip while it is held. */
      widgetsWidth: loadWidgetsWidthFromStorage(),
      widgetsResizing: false,
      /* The widgets' drawer on its second view, the switches that choose
       * the cards (see `widgetChooser`). Spent when the drawer closes. */
      widgetsChoosing: false,
      widgetOrder: loadWidgetOrderFromStorage(), // Drag-reorder
      dragWidget: null, // Currently dragged widget key
      fearGreedData: null, // { value, classification, timestamp }
      marketOverviewData: null, // { totalMarketCap, totalVolume, btcDominance, ... }
      halvingData: null, // { days, hours, minutes, blocksLeft, nextHalvingBlock }
      ethGasData: null, // { gwei, baseGwei, tipGwei, transferEth }
      btcFeesData: null, // { rate, fastest, hour, transferBtc }
      mempoolData: null, // { count, vsize, blocks, feesBtc }
      difficultyData: null, // { change, remaining, progress, remainingMs, previous }
      rsiValue: null, // RSI calculated from current valueHistory (0-100)
      ohlcData: null, // Candles for the crosshair; fetched on first hover
      fundingRateData: null, // { rate, percent, annualized }
      longShortData: null, // { longPct, shortPct }
      openInterestData: null, // { oiUsd, formatted }
      liquidationsData: null, // { total, longLiq, shortLiq, longPct, ... }
      altcoinSeasonData: null, // { index, label, outperformers, total }
      watchlistData: null, // [{ coin, change, up }] for the user's coins
      topMoversData: null, // { gainers: [...], losers: [...] }
      pageTicker: loadPageTickerFromStorage(), // Visual page ticker bar
      pageTickerPosition: loadPageTickerPositionFromStorage(), // 'top' or 'bottom'
      pageTickerCollapsed: loadPageTickerCollapsedFromStorage(), // minimized to a handle
      /* **The bar's measured height**, which is what the page's padding is
         made of. It used to be a flat 3rem while the bar's height comes from
         its two rows of text — and therefore from the text-size setting — so
         the chart's edge and the bar's edge were on the same line at one size
         and nowhere near it at another, and during the collapse they moved
         different distances over different clocks. Measured with a
         `ResizeObserver`, so a text-size change or a narrower window puts it
         right without anybody re-deriving it. */
      pageTickerHeight: PAGE_TICKER_FALLBACK_H,
      /* True while one panel is being swapped for another, which is what the
         veil is drawn from — see `showPanel`. */
      panelSwap: false,
      /* The last price picked off the chart for a target, as `{ value, at }`.
         The stamp is the point: picking the same price twice is two events,
         and the targets drawer adopts it by comparing stamps rather than
         values. Never persisted — it is a gesture, not a setting. */
      pickedPrice: null,
      chartColor: loadChartColorFromStorage(), // green/red area fill on/off

      pageTickerItems: [], // [{ coin, price, change, up }]
      pageTickerReady: false, // true after first full fetch completes
    });

    // Ticker scroll position (class property to avoid re-renders)
    this.tickerScrollPos = 0;

    // Widget refresh interval
    this.widgetRefreshInterval = null;

    // Page ticker fetch state
    this.pageTickerRefreshInterval = null;
    this._pageTickerFetching = false;

    // Widget answers gathered for one commit per frame — see `queueWidgetData`
    this._widgetPatch = null;
    this._widgetFlush = 0;

    // Portfolio price refresh timer (runs only while the view is open)
    this.portfolioInterval = null;
    this._portfolioFetching = false;
    // A refresh asked for while one was already running, and which run is the
    // newest — see `fetchPortfolioPrices`
    this._portfolioPending = false;
    this._portfolioRun = 0;

    // Auto-rotate timer
    this.autoRotateTimer = null;

    /* Tab-title announcement for a hit target, and the slow background check
     * that can produce one while the tab is away. `_alertTitleActive` is what
     * every other writer of document.title checks before touching it. */
    this.alertTitleTimer = null;
    this.alertPollInterval = null;
    this._alertTitleActive = false;
    this._alertTitleFlip = false;

    // News ticker state
    this.newsRefreshInterval = null;
    this._newsFetching = false;

    _defineProperty(this, "shiftCoin", (delta) => {
      this.tickerScrollPos = 0; // Reset ticker scroll on coin change
      this.setState(
        (prevState) => {
          const { coinOptions } = prevState;
          if (!coinOptions.length) {
            return null;
          }

          const len = coinOptions.length;
          return {
            coinIndex: (prevState.coinIndex + delta + len) % len,
            isLoading: true, // Show loading when switching coins
            showSkeleton: false, // Reset skeleton
            invalidCoin: null, // Clear invalid coin warning
            apiError: false, // Clear API error when switching coins
            // In candle mode the old bars stay on screen until the new
            // ones land, so the chart can reshape into them instead of
            // blanking to the line and back. The fetch always overwrites
            // them, so nothing stale survives. In line mode they only feed
            // the crosshair, where the previous coin's numbers would be
            // wrong, so they go now.
            ohlcData:
              prevState.chartType === "candles" ? prevState.ohlcData : null,
            // Clear coin-specific widget data so we never show the previous
            // coin's numbers under the new coin's label
            fundingRateData: null,
            longShortData: null,
            openInterestData: null,
            liquidationsData: null,
          };
        },
        () => {
          this.startSkeletonTimer();
          this.fetchData();
          this.fetchWidgets();
        },
      );
    });

    // Arg-less wrapper: stays safe when wired to onClick (event arg ignored)
    _defineProperty(this, "cycleCoinIndex", () => this.shiftCoin(1));

    // Jump straight to a position in the list (quick switch). Same reset
    // work as shiftCoin, expressed as an absolute move.
    /* `index` may be a number or a function of the pending state.
     *
     * The second form exists because "add this coin and then show it" is two
     * queued updates, and the caller that computed the index between them was
     * reading the list from *before* the add. Resolving it inside this update
     * means it is read after — see `handleQuickSwitchPick`, where picking an
     * unowned coin added it correctly and then opened whatever happened to be
     * last in the old list. */
    _defineProperty(this, "setCoinIndex", (index) => {
      this.tickerScrollPos = 0;
      this.setState(
        (prevState) => {
          const len = prevState.coinOptions.length;
          if (!len) return null;
          const wanted = typeof index === "function" ? index(prevState) : index;
          if (!isFinite(wanted)) return null;
          const next = Math.min(Math.max(wanted, 0), len - 1);
          if (next === prevState.coinIndex) return null;
          return {
            coinIndex: next,
            isLoading: true,
            showSkeleton: false,
            invalidCoin: null,
            apiError: false,
            // Kept in candle mode so the new range can reshape from them
            ohlcData:
              prevState.chartType === "candles" ? prevState.ohlcData : null,
            fundingRateData: null,
            longShortData: null,
            openInterestData: null,
            liquidationsData: null,
          };
        },
        () => {
          this.startSkeletonTimer();
          this.fetchData();
          this.fetchWidgets();
        },
      );
    });

    _defineProperty(this, "setPeriod", (_e, period) => {
      this.setState(
        {
          period,
          // The board's reach is held per range — see BOARD_ZOOM_KEY
          boardZoom: loadBoardZoom(period),
          apiError: false, // Clear API error when changing period
          // Held in candle mode so the new period reshapes from the old one
          ohlcData:
            this.state.chartType === "candles" ? this.state.ohlcData : null,
        },
        this.fetchData,
      );
    });

    // Warm the cache for the other periods of the active coin in the
    // background, so switching periods later is instant (no cold fetch / no
    // skeleton). Runs once per coin|currency; failures are ignored silently.
    _defineProperty(this, "prefetchPeriods", (coin, currency) => {
      if (!coin || document.hidden) return;
      const key = `${coin}|${currency}`;
      if (this.prefetchedKeys.has(key)) return;
      this.prefetchedKeys.add(key);

      const others = PERIOD_OPTIONS.filter(
        (p) => p.value !== this.state.period,
      );
      const coinOptions = this.state.coinOptions;
      // Stagger requests so they don't compete with the initial render/widgets
      others.forEach((p, i) => {
        setTimeout(
          () => {
            fetchValueHistory(
              coin,
              p.value,
              currency,
              null,
              true,
              coinOptions,
            ).catch(() => {
              // Prefetch is best-effort — let the real fetch report errors
            });
          },
          400 + i * 200,
        );
      });
    });

    _defineProperty(this, "startSkeletonTimer", () => {
      // Clear any existing timer
      if (this.skeletonTimer) {
        clearTimeout(this.skeletonTimer);
      }
      clearTimeout(this.slowLoadTimer);
      if (this.state.slowLoad) this.setState({ slowLoad: false });

      /* Show the skeleton after 300ms if still loading.
       *
       * With nothing on screen yet it stands in for the whole page, which is
       * what it is for. Once there is a chart up it blanks the *numbers* and
       * nothing else: taking the chart and the range switcher with them is
       * what made switching coin look like a reload rather than a change.
       * Measured on a 600ms fetch: the old line held for 300ms, then 300ms
       * of grey rectangles, then `LineBase` re-mounted and drew itself in
       * from the left over 600ms — 1.2s of which not one frame was a
       * transition from the old coin to the new one. Kept on screen the same
       * switch is a single 300ms morph, because the chart already knows how
       * to grow one series into another (`interpolatePath` in `updatePath`)
       * and never got the chance while it was being destroyed between the
       * two. `hasChart` in `render` is what decides which of the two this
       * is. */
      this.skeletonTimer = setTimeout(() => {
        if (this.state.isLoading) {
          this.setState({ showSkeleton: true });
        }
      }, 300);

      // A cold, slow first load looks broken without a word of explanation
      this.slowLoadTimer = setTimeout(() => {
        if (this.state.isLoading) {
          this.setState({ slowLoad: true });
        }
      }, 2500);
    });

    _defineProperty(this, "fetchWidgets", async () => {
      // Hidden tab → defer until handleVisibilityChange resumes us
      if (document.hidden) {
        this.pendingWidgetRefresh = true;
        return;
      }
      const { widgets, hiddenWidgets, coinOptions, coinIndex } = this.state;
      const coin = coinOptions[coinIndex] || "BTC";
      // Drop late responses for a coin the user already switched away from
      const isStillCurrent = () =>
        (this.state.coinOptions[this.state.coinIndex] || "BTC") === coin;

      /* A widget the user has hidden is still "enabled" — it keeps its place
       * in the panel and comes back with the eye button — but nothing shows
       * its data, so fetching it is pure waste. */
      const wanted = (key) => widgets[key] && !hiddenWidgets[key];

      /* One entry per widget: what to fetch and where the answer goes. The
       * requests run together rather than one after another — with every
       * widget on, awaiting them in sequence left the panel filling in for
       * seconds even though the requests are independent. */
      /* Answers are collected into one commit per frame rather than one each.
       *
       * The eight requests run together, which is right — awaiting them in
       * sequence left the panel filling in for seconds. But each answer used
       * to call `setState` from its own promise callback, and React 16 does
       * not batch across an await: eight answers were eight root renders.
       *
       * One commit after `Promise.all` was the obvious alternative and is
       * worse: the slowest provider would then gate every card, so one
       * endpoint on a retry backoff holds up seven that already answered. A
       * frame is the unit that matches what the eye can tell apart — answers
       * landing together commit together, a straggler still arrives on its
       * own. */
      const jobs = [
        ["fearGreed", fetchFearGreedIndex, "fearGreedData", false],
        ["marketOverview", fetchMarketOverview, "marketOverviewData", false],
        ["halvingCountdown", fetchHalvingData, "halvingData", false],
        ["ethGas", fetchEthGas, "ethGasData", false],
        ["btcFees", fetchBtcFees, "btcFeesData", false],
        ["mempool", fetchMempool, "mempoolData", false],
        ["difficulty", fetchDifficulty, "difficultyData", false],
        ["altcoinSeason", fetchAltcoinSeason, "altcoinSeasonData", false],
        ["fundingRate", fetchFundingRate, "fundingRateData", true],
        ["longShortRatio", fetchLongShortRatio, "longShortData", true],
        ["openInterest", fetchOpenInterest, "openInterestData", true],
        ["liquidations", fetchLiquidations, "liquidationsData", true],
        ["regimes", fetchRegimeGrid, "regimeData", true],
      ];

      await Promise.all(
        jobs.map(async ([key, fetcher, field, perCoin]) => {
          if (!wanted(key)) return;
          try {
            const data = await (perCoin ? fetcher(coin) : fetcher());
            // Coin-specific answers are dropped if the coin moved on. That is
            // not a failure — it is an answer to a question nobody is asking
            // any more — so it records nothing either way.
            if (perCoin && !isStillCurrent()) return;
            /* **An empty answer is recorded, not ignored.**
               Passing null through marks the attempt as finished with nothing,
               which is what lets the card say so instead of waiting for ever.
               See `queueWidgetData`. */
            this.queueWidgetData(field, data || null);
          } catch (e) {
            /* A refusal is an answer too. The old comment here said the widget
               keeps whatever it last had, and on a *refresh* that is right —
               but on the first fetch what it last had is the loading state,
               so the card pulsed "Loading" for ever on a dead network. */
            if (perCoin && !isStillCurrent()) return;
            this.queueWidgetData(field, null);
          }
        }),
      );
    });

    /* Hold a widget's answer until the end of the frame, then commit whatever
     * has gathered. See `fetchWidgets` for why a frame and not `Promise.all`. */
    _defineProperty(this, "queueWidgetData", (field, data) => {
      /* `null` means the attempt finished and brought nothing back — a
         refusal, a 500, or a well-formed empty answer, which are the same
         thing to a card that has never had data. It is tracked beside the
         data rather than inside it so an earlier answer is not thrown away:
         a refresh that fails leaves the last figures on screen, and only a
         card that has *never* filled says it could not load. */
      if (data == null) {
        this._widgetFail = { ...(this._widgetFail || {}), [field]: true };
      } else {
        this._widgetFail = { ...(this._widgetFail || {}), [field]: false };
      }
      this._widgetPatch = { ...(this._widgetPatch || {}), [field]: data };
      if (this._widgetFlush) return;
      this._widgetFlush = requestAnimationFrame(() => {
        this._widgetFlush = 0;
        const patch = this._widgetPatch;
        const failed = this._widgetFail;
        this._widgetPatch = null;
        this._widgetFail = null;
        if (!patch) return;
        /* A null answer must not overwrite figures the card already has. */
        const kept = {};
        for (const [k, v] of Object.entries(patch)) {
          if (v != null) kept[k] = v;
        }
        this.setState((prev) => ({
          ...kept,
          widgetFailed: { ...prev.widgetFailed, ...(failed || {}) },
        }));
      });
    });

    _defineProperty(this, "hideWidget", (widgetName) => {
      this.setState((prevState) => {
        const newHidden = { ...prevState.hiddenWidgets, [widgetName]: true };
        saveHiddenWidgetsToStorage(newHidden);
        return { hiddenWidgets: newHidden };
      });
    });

    _defineProperty(this, "restoreAllWidgets", () => {
      saveHiddenWidgetsToStorage({});
      this.setState({ hiddenWidgets: {} }, () => {
        this.fetchWidgets();
      });
    });

    _defineProperty(this, "onWidgetDragStart", (key) => {
      this.setState({ dragWidget: key });
    });

    _defineProperty(this, "onWidgetDragOver", (key) => {
      const { dragWidget, widgetOrder } = this.state;
      if (!dragWidget || dragWidget === key) return;
      const from = widgetOrder.indexOf(dragWidget);
      const to = widgetOrder.indexOf(key);
      if (from === -1 || to === -1) return;
      const newOrder = [...widgetOrder];
      newOrder.splice(from, 1);
      newOrder.splice(to, 0, dragWidget);
      saveWidgetOrderToStorage(newOrder);
      this.setState({ widgetOrder: newOrder });
    });

    _defineProperty(this, "onWidgetDragEnd", () => {
      this.setState({ dragWidget: null });
    });

    _defineProperty(this, "handleWidgetSizeChange", (size) => {
      saveWidgetSizeToStorage(size);
      this.setState({ widgetSize: size });
    });

    /* The widgets drawer's right edge (WidgetsResize). Width only — the
     * drawer is the window's height already. The ceiling leaves the right
     * edge's pull a hand's width of window, because the drawer (z 160) is
     * drawn over the screens' column (150). */
    _defineProperty(this, "widgetsWidthCeiling", (left) =>
      Math.min(window.innerWidth * 0.92, window.innerWidth - left - 48),
    );

    _defineProperty(this, "setWidgetsWidth", (px) => {
      const width = px == null ? null : clampWidgetsWidth(px);
      saveWidgetsWidthToStorage(width);
      this.setState({ widgetsWidth: width });
    });

    _defineProperty(this, "startWidgetsResize", (e) => {
      if (e.button !== 0 || !this.widgetsDrawerNode) return;
      e.preventDefault();
      const handle = e.currentTarget;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (err) {
        // A pointer that is already gone: the move events will not come.
      }
      const left = this.widgetsDrawerNode.getBoundingClientRect().left;
      this.widgetsDrag = {
        left,
        ceiling: this.widgetsWidthCeiling(left),
        width: null,
        frame: 0,
      };
      this.setState({ widgetsResizing: true });
    });

    _defineProperty(this, "moveWidgetsResize", (e) => {
      const drag = this.widgetsDrag;
      if (!drag) return;
      drag.width = clampWidgetsWidth(e.clientX - drag.left, drag.ceiling);
      if (drag.frame) return;
      drag.frame = requestAnimationFrame(() => {
        drag.frame = 0;
        if (this.widgetsDrawerNode && drag.width != null) {
          this.widgetsDrawerNode.style.setProperty(
            "--widgets-w",
            `${drag.width}px`,
          );
        }
      });
    });

    _defineProperty(this, "endWidgetsResize", () => {
      const drag = this.widgetsDrag;
      if (!drag) return;
      this.widgetsDrag = null;
      if (drag.frame) cancelAnimationFrame(drag.frame);
      if (drag.width == null) {
        this.setState({ widgetsResizing: false }); // a press with no move
        return;
      }
      saveWidgetsWidthToStorage(drag.width);
      this.setState({ widgetsWidth: drag.width, widgetsResizing: false });
    });

    /* The window splitter's keys: arrows step it, Home and End go to its
     * ends. Stepped from the width the drawer is drawn at, so the first
     * press from the default moves from 30rem and not from nothing. */
    _defineProperty(this, "keyWidgetsResize", (e) => {
      const node = this.widgetsDrawerNode;
      if (!node) return;
      const left = node.getBoundingClientRect().left;
      const now = node.getBoundingClientRect().width;
      const ceiling = this.widgetsWidthCeiling(left);
      const next =
        e.key === "ArrowRight"
          ? now + WIDGETS_WIDTH_STEP
          : e.key === "ArrowLeft"
            ? now - WIDGETS_WIDTH_STEP
            : e.key === "Home"
              ? WIDGETS_WIDTH_MIN
              : e.key === "End"
                ? ceiling
                : null;
      if (next == null) return;
      e.preventDefault();
      e.stopPropagation();
      this.setWidgetsWidth(clampWidgetsWidth(next, ceiling));
    });

    _defineProperty(this, "handleWidgetToggle", (widgetName) => {
      this.setState(
        (prevState) => {
          const enabling = !prevState.widgets[widgetName];
          const newWidgets = {
            ...prevState.widgets,
            [widgetName]: enabling,
          };
          saveWidgetsToStorage(newWidgets);
          return { widgets: newWidgets };
        },
        () => {
          // Fetch widget data if it was just enabled
          if (this.state.widgets[widgetName]) {
            this.fetchWidgets();
          }
          // watchlist / top-movers ride the all-coin sweep — start/stop as needed
          this.ensureCoinSweep();
        },
      );
    });

    _defineProperty(this, "handleWidgetPreset", (presetKey) => {
      const preset = WIDGET_PRESETS[presetKey];
      if (!preset) return;
      // start from all-off so a preset is an exact set, not additive
      const newWidgets = { ...DEFAULT_WIDGETS, ...preset };
      saveWidgetsToStorage(newWidgets);
      this.setState({ widgets: newWidgets }, () => {
        this.fetchWidgets();
        this.ensureCoinSweep();
      });
    });

    _defineProperty(this, "fetchData", async () => {
      clearTimeout(this.fetchTimeout);

      // Hidden tab → pause the polling loop instead of hitting the API.
      // handleVisibilityChange restarts it the moment the tab is shown again.
      if (document.hidden) {
        this.pendingVisibilityRefresh = true;
        return;
      }

      /* When the series on screen was last asked for. Read by
       * `handleVisibilityChange` to decide whether coming back to this tab
       * should refresh it, which is a question about the data's age and not
       * about whether a timer happened to fire. Stamped on the attempt rather
       * than on success: a failed fetch has already told the user through the
       * error state, and retrying it on every visibility change would hammer a
       * provider that is down. */
      this.lastFetchAt = Date.now();

      // Cancel any ongoing requests
      if (this.abortController) {
        this.abortController.abort();
      }

      // Create new AbortController for this request
      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      const { coinIndex, period, refreshInterval, currency, isOffline } =
        this.state;
      const { coinOptions } = this.state;
      const activeCoin = coinOptions[coinIndex] || coinOptions[0];

      if (!activeCoin) {
        return;
      }

      // FIX: Sync state with actual network status
      if (isOffline !== !navigator.onLine) {
        this.setState({ isOffline: !navigator.onLine });
        // Re-run fetchData with correct state
        setTimeout(() => this.fetchData(), 0);
        return;
      }

      // If offline, use cache or clear data
      if (isOffline) {
        const cachedHistory = getCachedData(
          activeCoin,
          period,
          currency,
          "history",
        );
        const cachedSpot = getCachedData(
          activeCoin,
          "current",
          currency,
          "spot",
        );
        // Clear skeleton timer
        if (this.skeletonTimer) {
          clearTimeout(this.skeletonTimer);
        }

        // If we have cache for this coin, show it
        if (
          (cachedHistory && cachedHistory.data) ||
          (cachedSpot && cachedSpot.data)
        ) {
          const newState = { isLoading: false, showSkeleton: false };
          if (cachedHistory && cachedHistory.data) {
            newState.valueHistory = cachedHistory.data;
            newState.rsiValue = calculateRSI(cachedHistory.data);
          }
          if (cachedSpot && cachedSpot.data) {
            newState.currentValue = cachedSpot.data;
          }
          newState.pricesAt = cachedPricesAt(cachedSpot, cachedHistory);
          this.setState(newState, () => {
            this.setTabTitle(
              this.state.coinOptions,
              this.state.coinIndex,
              this.state.currentValue,
              this.state.valueHistory,
            );
          });
        } else {
          // No cache available for this coin - clear old data
          this.setState({
            currentValue: null,
            valueHistory: [],
            ohlcData: null,
            isLoading: false,
            showSkeleton: false,
            slowLoad: false,
          });
        }

        this.fetchTimeout = setTimeout(this.fetchData, refreshInterval);
        return;
      }

      // STALE-WHILE-REVALIDATE: Check for stale cache data
      const cachedHistory = getCachedData(
        activeCoin,
        period,
        currency,
        "history",
      );
      const cachedSpot = getCachedData(activeCoin, "current", currency, "spot");
      // If we have stale data, show it immediately while fetching fresh data
      if (cachedHistory && cachedHistory.isStale && cachedHistory.data) {
        // Cached chart paints right away — cancel the skeleton so it doesn't
        // replace real (stale) data while the fresh fetch runs in background
        if (this.skeletonTimer) {
          clearTimeout(this.skeletonTimer);
        }
        this.setState({
          valueHistory: cachedHistory.data,
          rsiValue: calculateRSI(cachedHistory.data),
          isLoading: false,
          showSkeleton: false,
          slowLoad: false,
        });
      }

      if (cachedSpot && cachedSpot.isStale && cachedSpot.data) {
        this.setState({ currentValue: cachedSpot.data }, () => {
          this.setTabTitle(
            this.state.coinOptions,
            this.state.coinIndex,
            this.state.currentValue,
            this.state.valueHistory,
          );
        });
      }

      // Fetch fresh data (will use cache if fresh, or make API call if stale/missing)
      try {
        // In candle mode the candles are the only history request needed —
        // the line series is derived from their closes. When candles aren't
        // available for this range/currency, fall through to the line fetch.
        let candles = null;
        if (this.state.chartType === "candles") {
          // `true` lets the ALL range borrow candles from the other provider;
          // in this mode the line is drawn from the candles, so the chart
          // stays internally consistent
          candles = await fetchOhlcCandles(activeCoin, period, currency, true);
        }

        // Spot price and history are independent endpoints — fetch in parallel
        const [currentValue, valueHistory] = await Promise.all([
          fetchCurrentValue(activeCoin, currency, signal, true, coinOptions),
          candles
            ? candles.map((c) => ({ price: c.close, time: new Date(c.time) }))
            : fetchValueHistory(
                activeCoin,
                period,
                currency,
                signal,
                true,
                coinOptions,
              ),
        ]);

        // Clear skeleton timer
        if (this.skeletonTimer) {
          clearTimeout(this.skeletonTimer);
        }

        // Clear any previous warnings
        this.setState(
          {
            currentValue,
            valueHistory,
            rsiValue: calculateRSI(valueHistory),
            /* In candle mode the result always wins, null included: a coin
             * or range without candle data must drop to the line rather
             * than keep drawing the previous coin's bars. In line mode the
             * candles are the crosshair's, fetched lazily on hover, so this
             * fetch leaves them alone. */
            ohlcData:
              this.state.chartType === "candles"
                ? candles
                : this.state.ohlcData,
            isLoading: false,
            showSkeleton: false,
            slowLoad: false,
            invalidCoin: null,
            apiError: false,
            pricesAt: Date.now(),
          },
          () => {
            // The provider answered — the ladder in `nextFetchDelay` starts over
            this.fetchFailures = 0;
            // Update tab title after state is set
            // Always update normal title first (ticker will override when it starts)
            this.setTabTitle(
              this.state.coinOptions,
              this.state.coinIndex,
              this.state.currentValue,
              this.state.valueHistory,
            );
            // Also update ticker text if ticker is running
            if (this.state.tickerEnabled && this.tickerInterval) {
              this.buildTickerText();
            }
            // Leave a baseline for the next visit's comparison
            this.recordLastSeen(activeCoin, Number(currentValue));
            // Alerts ride the normal fetch cycle — no extra timers
            this.checkAlerts();
            this.refreshAlertPrices();
            // Warm the other periods so switching is instant
            this.prefetchPeriods(activeCoin, currency);
          },
        );
      } catch (e) {
        // Don't log errors if request was aborted (expected behavior)
        if (e.name === "AbortError") {
          return;
        }

        // Clear skeleton timer
        if (this.skeletonTimer) {
          clearTimeout(this.skeletonTimer);
        }

        // Check if error is due to invalid coin data
        if (
          e.message &&
          (e.message.includes("invalid price data") ||
            e.message.includes("invalid spot data"))
        ) {
          this.setState({
            invalidCoin: activeCoin,
            isLoading: false,
            showSkeleton: false,
            slowLoad: false,
            apiError: false, // Invalid coin has its own warning, don't show API error
          });
          return;
        }

        // For other API errors, show error banner but keep cached data if available
        // Reuse cachedHistory / cachedSpot already fetched above for stale-while-revalidate
        const newState = {
          isLoading: false,
          showSkeleton: false,
          slowLoad: false,
          apiError: true, // Show API error banner
        };

        // If we have cached data, use it
        if (cachedHistory && cachedHistory.data) {
          newState.valueHistory = cachedHistory.data;
          newState.rsiValue = calculateRSI(cachedHistory.data);
        }
        if (cachedSpot && cachedSpot.data) {
          newState.currentValue = cachedSpot.data;
        }
        const cachedAt = cachedPricesAt(cachedSpot, cachedHistory);
        if (cachedAt) newState.pricesAt = cachedAt;

        this.fetchFailures = (this.fetchFailures || 0) + 1;

        this.setState(newState, () => {
          // Update tab title with cached data if available
          if (newState.currentValue || newState.valueHistory) {
            this.setTabTitle(
              this.state.coinOptions,
              this.state.coinIndex,
              this.state.currentValue,
              this.state.valueHistory,
            );
          }
        });
      }

      this.fetchTimeout = setTimeout(this.fetchData, this.nextFetchDelay());
    });

    /* How long to wait before trying again.
     *
     * The refresh interval while things work, and a doubling ladder while they
     * do not. Measured on a working tab, an open new tab asks for two things
     * every thirty seconds and pauses completely when hidden — that part is
     * right and is left alone. What was missing is the other case: a provider
     * that is reachable but refusing. `fetchWithRetry` caps the retries
     * *within* one attempt, and then this loop made another attempt thirty
     * seconds later, forever — a tab left open all day against a region-blocked
     * or throttled endpoint is thousands of requests that were never going to
     * be answered, and Blockchair's response to exactly that is to blacklist
     * the whole IP.
     *
     * It costs nothing when things work: one success resets the count, and the
     * three things that mean "the person is here and wants this now" — coming
     * back to the tab, coming back online, changing coin or range — all call
     * `fetchData` directly rather than waiting out the ladder. */
    _defineProperty(this, "nextFetchDelay", () => {
      const base = this.state.refreshInterval;
      const failures = this.fetchFailures || 0;
      if (!failures) return base;
      return Math.min(
        base * Math.pow(2, Math.min(failures, FETCH_BACKOFF_STEPS)),
        FETCH_BACKOFF_MAX_MS,
      );
    });

    _defineProperty(this, "toggleSettings", () => {
      this.setState((prevState) => ({
        showSettings: !prevState.showSettings,
        /* A section someone asked for is spent once; the next plain open is
           Coins. Spent on the way *out*, so a request can ride the open —
           including one made behind the swap's veil (openSettingsAt). */
        settingsTab: prevState.showSettings ? null : prevState.settingsTab,
      }));
    });

    /* **Settings, open on one section** — what "?" does. Already open, it
     * turns the page (the panel keeps its own place in the menu); shut, it
     * opens the way a press on its tab would, across whatever screen or
     * drawer is up, and the section rides the open. */
    _defineProperty(this, "openSettingsAt", (tab) => {
      if (this.state.showSettings) {
        if (this.settingsRef) this.settingsRef.goToSection(tab);
        return;
      }
      this.setState({
        settingsTab: tab,
        showQuickSwitch: false,
        quickSwitchCompare: false,
      });
      this.pressScreenTab("settings");
    });

    /* The widgets' drawer, on the switches that choose its cards. What the
     * empty drawer's "Choose widgets" does: it sent you to Settings' Widgets
     * tab until that tab moved in here (26 Sep 2026, see `widgetChooser`). */
    _defineProperty(this, "openWidgetChooser", () => {
      this.setState({ widgetsChoosing: true });
    });

    /* Open one of the two lists, or close it if it is the one already up.
     *
     * Asking for the view you are looking at means "put it away"; asking for
     * the other one swaps the card. Swapping rather than closing-then-opening
     * matters because they share one slot on screen — a keystroke that closed
     * targets and needed a second press to open calls would read as the key
     * having missed. Opening calls also clears the settled-call marker on its
     * button: the dot means "something happened since you last looked", and
     * you are now looking. */
    _defineProperty(this, "toggleAlertsView", (view) => {
      this.setState(
        (prev) => {
          const next = prev.alertsView === view ? null : view;
          if (next !== "calls") return { alertsView: next };
          const seen = Date.now();
          saveCallsSeenAt(seen);
          return { alertsView: next, callsSeenAt: seen };
        },
        /* The futures screen is a news consumer (`newsWanted`), so opening it
           has to start the loader and closing it has to stop it — the same
           callback the news panel and the headlines switch already use. A
           consumer that is added to the condition and not to the place the
           condition is re-read is a consumer that only works when something
           else happens to be on. */
        this.startNewsTicker,
      );
    });

    /* Has a call come back since the panel was last opened?
     *
     * Read off `settledAt`, which is when the answer was found. Calls settled
     * before this shipped have no `settledAt`, so they never light the mark —
     * the alternative is a dot on every existing install for results the
     * person has already seen, which teaches them the dot means nothing. */
    _defineProperty(this, "hasUnseenSettledCalls", () => {
      const done = (this.state.calls && this.state.calls.done) || [];
      const seen = this.state.callsSeenAt || 0;
      return done.some((c) => isFinite(c.settledAt) && c.settledAt > seen);
    });

    /* Everything the portfolio does — fifteen handlers and its fetch loop,
     * 517 lines — lives in `app-portfolio.js`. It is the one cohesive run in
     * this class: it touched almost nothing else, which is what made it the
     * only honest cut available (95 members in `chart.js` touch `this` and
     * all but three of them; 146 here and all of them, so there was never a
     * block of pure helpers to lift out).
     *
     * Same idiom as `settings-preferences.js`: a plain function handed the
     * component. `Object.assign` puts every name back exactly where it was,
     * so nothing that calls them changed. */
    Object.assign(this, portfolioHandlers(this));
    Object.assign(this, callHandlers(this));
    Object.assign(this, alertHandlers(this));
    Object.assign(this, newsHandlers(this));
    Object.assign(this, tickerHandlers(this));
    Object.assign(this, viewHandlers(this));
    Object.assign(this, toolHandlers(this));
    _defineProperty(this, "handleKeyDown", (e) => {
      // Ignore shortcuts with modifiers or while typing in a field
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // The onboarding tour owns the keyboard while it runs — without this,
      // Esc and the arrows would drive the tour and the chart at once
      if (this.state.tourActive) return;
      const t = e.target;
      /* `SELECT` belongs here with the text fields. A native dropdown is
       * driven by letters — typing "s" jumps to the first option beginning
       * with s — so a focused Number Format select answering "s" by closing
       * Settings meant the control could not be used from the keyboard at all,
       * and the panel vanished from under it. Anything the browser is already
       * spending keystrokes on is not ours to claim. */
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      /* The widgets drawer's edge is a window splitter, and its arrows and
       * Home/End are its own (keyWidgetsResize). React's handler runs on this
       * same document node, so its stopPropagation cannot keep the arrows
       * from switching the coin as well. (The derivatives terminal's seams,
       * book rows and chart cursor need no line here: every chart key below
       * already stands down while `alertsView` is up — measured, → on the
       * open page leaves the coin where it was.) */
      if (
        t &&
        t.hasAttribute &&
        t.hasAttribute("data-widgets-resize") &&
        /^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)
      ) {
        return;
      }
      /* With the chart focused, ← and → read it point by point, Home and
         End its ends, and Shift with an arrow walks the window through time
         — rather than switch the coin, the widgets drawer's edge's rule
         (chart-viewport.js). Reading was the chart plan's Phase 6: the
         arrows panned from 29 Sep, and the window still follows a step past
         its edge, so reading on is how the keyboard moves through time. */
      if (
        t &&
        t.hasAttribute &&
        t.hasAttribute("data-chart-viewport") &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End")
      ) {
        e.preventDefault();
        const view = this.viewRef.current;
        if (view) {
          if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            view.panKey(e.key === "ArrowLeft" ? -VIEW_PAN_STEP : VIEW_PAN_STEP);
          } else {
            view.readKey(e.key);
          }
        }
        return;
      }
      // Esc on the chart puts the keyboard's cursor away first
      if (
        e.key === "Escape" &&
        t &&
        t.hasAttribute &&
        t.hasAttribute("data-chart-viewport") &&
        this.viewRef.current &&
        this.viewRef.current.stopReading()
      ) {
        e.preventDefault();
        return;
      }

      // Esc always closes the open overlay (settings or portfolio)
      if (e.key === "Escape") {
        if (this.state.showQuickSwitch) {
          e.preventDefault();
          this.setState({ showQuickSwitch: false, quickSwitchCompare: false });
        } else if (this.state.showBaseRates) {
          e.preventDefault();
          this.toggleBaseRates();
        } else if (this.state.showNews) {
          e.preventDefault();
          this.toggleNews();
        } else if (this.state.alertsView) {
          e.preventDefault();
          this.setState({ alertsView: null });
        } else if (this.state.firedAlerts.length) {
          e.preventDefault();
          this.setState({ firedAlerts: [] });
        } else if (this.state.showSettings) {
          e.preventDefault();
          this.toggleSettings();
        } else if (this.state.showPortfolio) {
          e.preventDefault();
          this.togglePortfolio();
        } else if (
          this.state.showChartSettings ||
          this.state.showWidgetsDrawer
        ) {
          /* Under the panels and over the move card: the drawer covers a
             strip of the chart, which is more than the card does and less
             than any panel. The widgets' drawer is the same kind of thing. */
          e.preventDefault();
          this.setState({
            showChartSettings: false,
            showWidgetsDrawer: false,
            widgetsChoosing: false,
          });
        } else if (
          this.state.chartTool ||
          this.state.drawingSelected ||
          this.state.drawingEditing ||
          this.state.toolsOpen
        ) {
          /* The tool in the hand, or the drawing picked up: put down before
             anything on the chart is closed (app-tools.js). */
          e.preventDefault();
          this.dropTools();
        } else if (this.state.openMove) {
          /* Above `compareCoin` and below every panel: the move card is the
           * smallest thing on screen and the most recently opened, so it is
           * the one Esc means — but it sits on the chart, so anything covering
           * the chart is closed first. */
          e.preventDefault();
          this.closeMove();
        } else if (this.state.compareCoin) {
          // Last in the chain: with nothing covering the chart, Esc drops the
          // overlay that is on it
          e.preventDefault();
          this.clearCompare();
        }
        return;
      }
      /* S toggles settings — but not underneath another overlay.
       *
       * **Every screen key goes through the screens' tab door**
       * (`pressScreenTab`), not the panel's own toggle (27 Sep 2026). The
       * chart's and the widgets' drawers float over the screens (160 against
       * 100–110) and the tab shuts them when a screen comes; the keys went
       * round it, so W then S left the widgets over Settings, holding its
       * Permissions tab under a drawer nobody was using. */
      if (
        (e.key === "s" || e.key === "S") &&
        !this.state.showPortfolio &&
        !this.state.alertsView &&
        !this.state.showNews &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.pressScreenTab("settings");
        return;
      }

      /* A opens targets and K opens calls, both mirroring S. They share the
       * one slot, so pressing the other key while one is up swaps the card
       * rather than closing it — the guards below exclude the *other*
       * overlays, not each other. */
      if (
        (e.key === "a" || e.key === "A" || e.key === "k" || e.key === "K") &&
        this.featureOn(e.key === "k" || e.key === "K" ? "calls" : "targets") &&
        !this.state.showPortfolio &&
        !this.state.showSettings &&
        !this.state.showNews &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        /* Through the drawers' one door, so the chart's or the widgets'
           drawer goes when these come out rather than both being up. */
        this.showLeftDrawer(
          e.key === "k" || e.key === "K" ? "calls" : "targets",
        );
        return;
      }

      /* F opens futures, mirroring S, A, K, N and P. Same exclusions: one
       * card in the middle of the screen at a time. It works whether or not
       * the corner button is shown — hiding a control costs the button, not
       * the feature, which is the promise the Settings row makes. */
      if (
        (e.key === "f" || e.key === "F") &&
        /* **Off is a real off.** A switch that leaves a working shortcut
           behind is not a switch, it is a preference about decoration. */
        this.featureOn("futures") &&
        !this.state.showPortfolio &&
        !this.state.showSettings &&
        !this.state.showNews &&
        !this.state.showQuickSwitch &&
        (!this.state.alertsView || this.state.alertsView === "futures")
      ) {
        e.preventDefault();
        this.pressScreenTab("futures");
        return;
      }

      /* N opens the news panel, mirroring S, A/K and P. It excludes the other
       * overlays and they exclude it: one card in the middle of the screen at
       * a time is the rule this corner already follows. */
      if (
        (e.key === "n" || e.key === "N") &&
        this.featureOn("news") &&
        !this.state.showPortfolio &&
        !this.state.showSettings &&
        !this.state.alertsView &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.pressScreenTab("news");
        return;
      }

      /* B opens the base rates for the coin on screen. Same exclusions as the
       * other panels: one card in the middle of the screen at a time. */
      if (
        (e.key === "b" || e.key === "B") &&
        this.featureOn("baseRates") &&
        !this.state.showPortfolio &&
        !this.state.showSettings &&
        !this.state.alertsView &&
        !this.state.showNews &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.pressScreenTab("baserates");
        return;
      }

      // P opens the portfolio, mirroring S and A
      if (
        (e.key === "p" || e.key === "P") &&
        this.featureOn("portfolio") &&
        !this.state.showSettings &&
        !this.state.alertsView &&
        !this.state.showNews &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.pressScreenTab("portfolio");
        return;
      }

      /* H masks the money while the portfolio is open.
       *
       * Gated on the portfolio being open, unlike the panel keys above it: it
       * changes nothing anywhere else, and a shortcut that silently does
       * nothing on the screen you are looking at is worse than no shortcut.
       * It sits above the overlay guard for the same reason S and P do — the
       * portfolio *is* an overlay, and this key belongs to it. */
      if ((e.key === "h" || e.key === "H") && this.state.showPortfolio) {
        e.preventDefault();
        this.togglePortfolioHidden();
        return;
      }

      /* "?" opens the shortcuts — a section of Settings since 26 Sep 2026,
       * reached from anywhere but a text field, whatever screen is up.
       * Pressed on that page it closes Settings, as S would. */
      if (e.key === "?") {
        e.preventDefault();
        if (
          this.state.showSettings &&
          this.settingsRef &&
          this.settingsRef.currentSection() === "shortcuts"
        ) {
          this.toggleSettings();
        } else {
          this.openSettingsAt("shortcuts");
        }
        return;
      }

      /* 1 – 9 and 0 walk Settings' menu while it is open, top to bottom.
       * The digits are the ranges' everywhere else, and those stand down
       * behind a screen, so nothing is taken from anybody. */
      if (
        this.state.showSettings &&
        e.key.length === 1 &&
        e.key >= "0" &&
        e.key <= "9" &&
        this.settingsRef
      ) {
        e.preventDefault();
        this.settingsRef.goToNumber(e.key);
        return;
      }

      /* "," and "." pull out the two columns — the chart's on the left, the
       * screens' on the right — and put the focus in them, so the two menus
       * a pointer finds by resting on an edge have a way in from the
       * keyboard. Side by side on the keyboard as the columns are on the
       * screen. The chart's column is not drawn behind a screen, so its key
       * stands down there. */
      if (e.key === "," && !this.screenUp() && !this.modalUp()) {
        e.preventDefault();
        this.chartSpine.reveal();
        return;
      }
      if (e.key === "." && !this.modalUp()) {
        e.preventDefault();
        this.screenSpine.reveal();
        return;
      }

      // Remaining shortcuts act on the chart — disabled while an overlay covers it
      if (
        this.state.showSettings ||
        this.state.showPortfolio ||
        this.state.showQuickSwitch ||
        this.state.alertsView
      ) {
        return;
      }

      // "/" opens the coin jumper (the same key browsers use for find-in-page
      // on some platforms, so claim it explicitly)
      if (e.key === "/") {
        e.preventDefault();
        this.setState({ showQuickSwitch: true, quickSwitchCompare: false });
        return;
      }

      // C compares against a second coin — same picker, or off if one is up
      if ((e.key === "c" || e.key === "C") && this.featureOn("compare")) {
        e.preventDefault();
        this.toggleCompare();
        return;
      }

      // T flips the chart between the line and candlesticks
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        this.handleChartTypeChange(
          this.state.chartType === "candles" ? "line" : "candles",
        );
        return;
      }

      // G puts the price/time mesh behind the chart, or takes it away
      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        this.handleChartGridChange(this.state.chartGrid !== true);
        return;
      }

      /* [ and ] reach the board's price scale — out and in. Only while calls
       * are on, since there is no board otherwise, and chosen because they are
       * the two keys next to each other that nothing else here wants. */
      /* + and − zoom the board too while it is up (the chart plan's Phase
         5): one vocabulary for "zoom" on this chart, whichever geometry it
         is drawn in — the window in time stands down under the board. */
      if (
        this.state.predict &&
        (e.key === "[" || e.key === "]" || e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_")
      ) {
        e.preventDefault();
        const out = e.key === "[" || e.key === "-" || e.key === "_";
        this.handleBoardZoomChange(
          (() => {
            const at = BOARD_ZOOM_STEPS.indexOf(this.state.boardZoom);
            const i =
              at === -1 ? BOARD_ZOOM_STEPS.indexOf(DEFAULT_BOARD_ZOOM) : at;
            const next = i + (out ? 1 : -1);
            return BOARD_ZOOM_STEPS[
              Math.min(BOARD_ZOOM_STEPS.length - 1, Math.max(0, next))
            ];
          })(),
        );
        return;
      }

      /* Delete (or Backspace) takes the selected drawing away. */
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        this.state.drawingSelected &&
        this.chartViewEnabled()
      ) {
        e.preventDefault();
        this.handleDrawingDelete(this.state.drawingSelected);
        return;
      }

      /* + and − zoom the chart in time, around the latest price while the
         window follows it (chart-viewport.js). Not with calls on or under a
         comparison, where the window stands down; = is + without Shift. */
      if (
        (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") &&
        this.chartViewEnabled() &&
        this.viewRef.current
      ) {
        e.preventDefault();
        this.viewRef.current.zoomBy(
          e.key === "-" || e.key === "_" ? VIEW_ZOOM_STEP : 1 / VIEW_ZOOM_STEP,
        );
        return;
      }

      // L turns calls on or off. It leaves the grid setting alone: with calls
      // on the mesh is drawn either way, so there is nothing to bring along.
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        this.handlePredictChange(this.state.predict !== true);
        return;
      }

      // X flips the change readout between percent and absolute. That mode
      // lives inside Overview (it's a display choice, not app state), so
      // reach it the same way the click does.
      /* V opens the chart's own settings beside the chart. A view key, so it
       * sits below the guard with the rest: with a panel covering the chart
       * there is nothing for the drawer to show a change on. */
      if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        this.showLeftDrawer("chart");
        return;
      }

      /* Y for the axis. X was taken by percent/price and L by the calls
       * board; Y is the axis this switches, which is as close to a mnemonic as
       * the free keys allowed. */
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        this.handleLogScaleChange(this.state.logScale !== true);
        return;
      }

      if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        if (this.overviewRef) this.overviewRef.togglePercentage();
        return;
      }

      /* I keeps the chart as an image (27 Sep 2026) — see chart-image.js.
         Below the guard: with a screen over the chart there is no chart to
         picture. */
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        this.handleSaveChartImage();
        return;
      }

      /* W opens the widgets' drawer (25 Sep 2026). It used to clear the
         row of cards over the chart and bring it back; the cards are a
         drawer now, so the key does what every other drawer's key does. */
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        this.showLeftDrawer("widgets");
        return;
      }

      // D flips light/dark. It reads the theme that is actually on screen,
      // so the first press changes something even from 'auto'.
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        this.handleThemeChange(
          this.state.activeTheme === "dark" ? "light" : "dark",
        );
        return;
      }

      // Space starts/stops the rotation through the coin list — but Space is
      // also how a keyboard user presses a focused control, so leave it alone
      // when one has the focus
      if (e.key === " ") {
        if (
          t &&
          (t.tagName === "BUTTON" ||
            t.tagName === "SELECT" ||
            t.tagName === "A")
        ) {
          return;
        }
        e.preventDefault();
        this.handleAutoRotateChange(!this.state.autoRotate);
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        this.shiftCoin(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.shiftCoin(-1);
      } else if (e.key >= "1" && e.key <= "6") {
        e.preventDefault();
        const period = PERIOD_OPTIONS[Number(e.key) - 1];
        if (period) this.setPeriod(null, period.value);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        this.fetchData();
      }
    });

    // Quick switch pick: jump to a coin already on the list, or add it
    // first when the search reached beyond the user's own coins.
    /* COMPARISON MODE
     * A second coin drawn over the chart as percent change from the start of
     * the range. Nothing here is written to storage — see the state comment.
     */
    _defineProperty(this, "setCompareCoin", (coin) => {
      const active = this.state.coinOptions[this.state.coinIndex];
      if (!coin || coin === active || !SUGGESTED_COINS.includes(coin)) {
        this.clearCompare();
        return;
      }
      this.setState(
        { compareCoin: coin, compareHistory: null },
        this.fetchCompareHistory,
      );
    });

    _defineProperty(this, "clearCompare", () => {
      if (!this.state.compareCoin && !this.state.compareHistory) return;
      this.setState({ compareCoin: null, compareHistory: null });
    });

    /* Swap the two: the compared coin becomes the chart and the chart's coin
     * becomes the overlay. The way onto a coin is the "/" jumper's own path —
     * a coin not on the list is added first, exactly as picking it there
     * would — and the old coin is then set as the comparison in the same
     * batch, so `componentDidUpdate` never sees a moment where the active
     * coin and the compared one are the same and ends the comparison. */
    _defineProperty(this, "swapCompare", () => {
      const { compareCoin, coinOptions, coinIndex } = this.state;
      if (!compareCoin) return;
      const active = coinOptions[coinIndex];
      if (!coinOptions.includes(compareCoin)) {
        const result = this.handleAddCoinOption(compareCoin);
        if (!result || result.success === false) return;
      }
      this.setCoinIndex((prev) => {
        const at = prev.coinOptions.indexOf(compareCoin);
        return at >= 0 ? at : prev.coinOptions.length - 1;
      });
      this.setState(
        { compareCoin: active, compareHistory: null },
        this.fetchCompareHistory,
      );
    });

    /* What both the "C" key and the Compare tab on the left edge do: stop a
     * comparison, take back a picker that is already up, or open one.
     *
     * **An open drawer is shut first.** The picker is drawn at 120 and the
     * drawers at 160, so opening it beside one put the coin list under the
     * drawer's glass — reachable from V and W, whose drawers the chart keys
     * do not stand down for, and from the tab once it sat on the same spine
     * as the drawers. */
    _defineProperty(this, "toggleCompare", () => {
      if (this.state.compareCoin) {
        this.clearCompare();
        return;
      }
      if (this.state.showQuickSwitch && this.state.quickSwitchCompare) {
        this.setState({ showQuickSwitch: false, quickSwitchCompare: false });
        return;
      }
      const drawer = this.leftDrawer();
      if (drawer) this.showLeftDrawer(drawer);
      /* The column goes with the picker up (see modalUp) and should not come
         back out by itself when the picker is done. */
      this.chartSpine.shut();
      this.setState({ showQuickSwitch: true, quickSwitchCompare: true });
    });

    /* The overlay follows the chart: a new range or currency needs the
     * compared coin's series for that range too. Uses the same cache the
     * main chart does, so re-comparing a coin you looked at a moment ago
     * costs nothing. */
    _defineProperty(this, "fetchCompareHistory", async () => {
      const { compareCoin, period, currency, coinOptions } = this.state;
      if (!compareCoin) return;
      // The pick may have been changed or dropped while this was in flight
      const stillWanted = () =>
        this.state.compareCoin === compareCoin &&
        this.state.period === period &&
        this.state.currency === currency;
      try {
        const history = await fetchValueHistory(
          compareCoin,
          period,
          currency,
          null,
          true,
          coinOptions,
        );
        if (stillWanted()) this.setState({ compareHistory: history });
      } catch (e) {
        // A coin whose history won't load just doesn't draw — the chart is
        // still showing the coin you were on
        if (stillWanted()) this.setState({ compareHistory: null });
      }
    });

    _defineProperty(this, "handleQuickSwitchPick", (coin, owned) => {
      if (this.state.quickSwitchCompare) {
        this.setState({ showQuickSwitch: false, quickSwitchCompare: false });
        this.setCompareCoin(coin);
        return;
      }
      this.setState({ showQuickSwitch: false });
      if (!owned) {
        const result = this.handleAddCoinOption(coin);
        if (!result || result.success === false) return;
      }
      /* Resolved against the list as it will be, not as it was.
       *
       * `handleAddCoinOption` queues its update, so reading `this.state` here
       * gave the list from before the add: the coin was appended correctly and
       * then `length - 1` selected whatever used to be last. Picking BNB from
       * BTC/ETH/XRP/LTC added BNB and opened LTC. */
      this.setCoinIndex((prev) => {
        const at = prev.coinOptions.indexOf(coin);
        return at >= 0 ? at : prev.coinOptions.length - 1;
      });
    });

    // Manual retry from the error banner. Shows a "retrying" state long
    // enough to register, then lets fetchData settle apiError either way.
    _defineProperty(this, "handleRetry", () => {
      if (this.state.retrying) return;
      this.setState({ retrying: true });
      Promise.resolve(this.fetchData()).then(() => {
        this.retryTimer = setTimeout(
          () => this.setState({ retrying: false }),
          400,
        );
      });
    });

    // Record what the active coin costs now, so the next visit can compare
    // against it. Rate-limited: opening a burst of tabs keeps the earlier
    // baseline instead of resetting it to "a second ago".
    _defineProperty(this, "recordLastSeen", (coin, price) => {
      if (!coin || !isFinite(price) || price <= 0) return;
      const stored = loadLastSeen();
      const next = nextLastSeen(stored[coin], price, Date.now());
      stored[coin] = next;
      saveLastSeen(stored);
      // Render from the anchor computed for *this* visit, not the one that
      // was in storage when the tab mounted
      this.setState((s) => ({ lastSeen: { ...s.lastSeen, [coin]: next } }));
    });

    // Candles for the crosshair readout. Called the first time the pointer
    // touches a chart, so tabs that are never hovered cost no request.
    // Re-runs per coin/period/currency; the fetcher caches for 5 minutes.
    _defineProperty(this, "loadOhlc", async () => {
      const coin = this.state.coinOptions[this.state.coinIndex];
      const { period, currency } = this.state;
      const key = `${coin}-${period}-${currency}`;
      if (!coin || this._ohlcKey === key) return;
      this._ohlcKey = key;
      const data = await fetchOhlcCandles(coin, period, currency);
      // A slow response must not land on a chart the user has moved past
      if (this._ohlcKey !== key) return;
      this.setState({ ohlcData: data });
    });

    // One row of the Watchlist / Top Movers lists: symbol, price, 24h change.
    // `tint` washes the row by how big the move is — the watchlist used to be
    // a heatmap and this keeps that reading without losing the numbers.
    _defineProperty(this, "renderCoinRow", (c, tint) =>
      React.createElement(
        WidgetCoinRow,
        {
          key: c.coin,
          up: c.up,
          intensity: tint ? Math.min(0.3, 0.05 + Math.abs(c.change) / 55) : 0,
        },
        React.createElement(WidgetCoinSym, null, c.coin),
        React.createElement(
          WidgetCoinPrice,
          null,
          formatWidgetPrice(
            c.price,
            getCurrencySymbol(this.state.currency),
            this.state.separatorFormat,
          ),
        ),
        React.createElement(
          WidgetCoinChg,
          { up: c.up },
          `${c.up ? "+" : ""}${c.change.toFixed(2)}%`,
        ),
      ),
    );

    // Price formatter handed to the chart's crosshair (bound once so the
    // memoized Line never sees a new prop identity per render)
    _defineProperty(this, "formatChartPrice", (value) =>
      formatNumberString(
        value,
        getCurrencySymbol(this.state.currency),
        true,
        false,
        this.state.decimalPlaces,
        this.state.separatorFormat,
      ),
    );

    _defineProperty(this, "handleDirectionPaletteChange", (value) => {
      if (!DIRECTION_PALETTES.includes(value)) return;
      saveDirectionPalette(value);
      this.setState({ directionPalette: value });
    });

    _defineProperty(this, "handleThemeChange", (newTheme) => {
      saveThemeToStorage(newTheme);
      const activeTheme = getActiveTheme(newTheme);
      this.setState({
        themePreference: newTheme,
        activeTheme: activeTheme,
      });
    });

    /* Language changes reload the page, and that is the feature rather than a
     * shortcut: the strings on screen were built during renders that have
     * already run, the `Intl` formatters are cached per locale, and swapping
     * live would leave a chart labelled in one language beside a panel in
     * another. The setting is written first, so the reload comes back in the
     * language that was asked for. */
    /* Your average cost for the coin on screen, as a level the chart can draw.
     *
     * It refuses in three cases rather than drawing something almost true:
     *
     *   - **A different currency.** A cost entered in EUR is not a level on a
     *     USD chart, and converting it at today's rate would state a
     *     break-even that moves on days the purchase did not. `alerts.js`
     *     pauses targets for the same reason and the portfolio sets those
     *     lots aside rather than converting them.
     *   - **Nothing logged.** An amount typed in with no purchase behind it
     *     has no cost to average.
     *   - **Only part of the holding covered.** `heldLots` is the rule the
     *     portfolio already follows: a position sold down by hand keeps lots
     *     it no longer has, and averaging those reports an entry the person
     *     never made.
     *
     * Costs nothing — it is arithmetic over lots already in state. */
    _defineProperty(this, "holdingCostLevel", (coin) => {
      const held = (this.state.portfolio || []).find(
        (h) => h && h.coin === coin,
      );
      if (!held) return null;
      const amount = holdingAmount(held);
      if (!(amount > 0)) return null;
      const lots = heldLots(held.lots, amount).filter(
        (l) => !l.currency || l.currency === this.state.currency,
      );
      if (!lots.length) return null;
      let paid = 0;
      let units = 0;
      for (const lot of lots) {
        if (!isFinite(lot.paid) || !isFinite(lot.amount) || lot.amount <= 0)
          continue;
        paid += lot.paid;
        units += lot.amount;
      }
      if (!(units > 0) || !(paid > 0)) return null;
      return {
        value: paid / units,
        label: msg("chart_your_cost", "YOUR COST"),
      };
    });

    /* **The open futures position on the coin being drawn, in plain prices.**
     *
     * The model works in scaled integers (`practice-math.js`), and the chart
     * works in whatever the price series is in, so the conversion happens
     * here rather than in either — one place, and neither side learns the
     * other's units.
     *
     * Four refusals, all of them the same rule the panel already follows:
     * nothing while the section is switched off, nothing for a coin that is
     * not on screen, nothing while the display currency is not the one the
     * position was opened in (the level would be a different number for the
     * same market — `alerts.js` pauses the row for exactly this), and no
     * liquidation line at 1x, where there is none.
     *
     * A **new object every render**, deliberately. `componentDidUpdate`
     * compares by identity, so a position whose mark moved by a cent still
     * redraws — which is what has to happen, since the filled band between
     * entry and price is the part that moves every tick. The work is four
     * lines and four labels on pooled nodes; it is cheaper than the guard
     * that would avoid it. */
    /* **One chart, one market, possibly several contracts.**
     *
     * A coin can now carry as many as the balance allows, and the chart has
     * room to draw one set of levels legibly. It draws the **newest** — the
     * one just opened, which is the one being watched — and `chartPositions`
     * says how many there are so the dock can carry the count. Drawing five
     * entries and five liquidations on one chart is a mesh, not a reading. */
    _defineProperty(this, "chartPositionCount", (coin) =>
      this.state.practiceEnabled && this.state.practice
        ? practiceForCoin(this.state.practice, coin).length
        : 0,
    );
    /* **Which targets have a line on this chart.**
     *
     * Four filters, and each one is a different kind of "this is not a level
     * on this chart":
     *   · a **percent** target is a move rather than a price, and a
     *     **portfolio** target is not about this coin at all — neither has a
     *     level to draw;
     *   · another coin's target is another chart's;
     *   · another currency's target is a number on the wrong axis, and this
     *     app does not hold a rate to convert it with;
     *   · a hit or expired one is a record, not a level you are waiting on.
     *
     * `repeat` targets re-arm themselves, so the armed test is `triggeredAt`
     * rather than "has it ever fired". */
    _defineProperty(this, "chartTargets", (coin) => {
      const list = Array.isArray(this.state.alerts) ? this.state.alerts : [];
      const out = [];
      for (const a of list) {
        if (!a || a.kind !== "price") continue;
        if (a.coin !== coin || a.currency !== this.state.currency) continue;
        if (a.triggeredAt || a.expiredAt) continue;
        out.push({ id: a.id, price: Number(a.target), direction: a.direction });
      }
      return out.length ? out : null;
    });

    /* **A click on the chart, while the targets drawer is open, is a price.**
     *
     * The drawer is beside the chart rather than over it, which is what makes
     * this possible at all: the level you want is under the pointer, and
     * typing it back in digits is the slow way to say a thing you can see.
     * The chart decides *what* price (`priceAtY`, on the board's own window
     * when there is one); this only carries it, stamped, so the panel can
     * tell one pick from the next. */
    _defineProperty(this, "handlePickTargetPrice", (value) => {
      if (!isFinite(value) || !(value > 0)) return;
      this.setState({ pickedPrice: { value, at: Date.now() } });
    });

    _defineProperty(this, "chartPosition", (coin) => {
      if (!this.state.practiceEnabled) return null;
      const s = this.state.practice;
      const ids = s ? practiceForCoin(s, coin) : [];
      const pos = ids.length ? s.positions[ids[ids.length - 1]] : null;
      if (!pos) return null;
      /* A USDT contract drawn on the main chart only while that chart is in
         dollars: the two trade within a tenth of a percent, so the lines sit
         where they belong. On any other currency the levels would be USDT
         numbers on a lira axis, and they are left off rather than converted
         at a rate this app does not have. */
      if (pos.currency !== PRACTICE_CURRENCY || this.state.currency !== "USD")
        return null;
      const mark = this.practiceQuote(coin, pos.currency);
      if (!(mark > 0)) return null;
      const liq = practiceLiquidationPrice(pos);
      /* The live result, on the entry line itself. Four levels say where the
         thing ends; this says how it is doing, which is the other half of
         "where did we start and where is it going" — and it belongs on the
         entry, because that is the line the number is measured from. */
      const pnl = practiceUnrealised(pos, Math.round(mark * PRICE_SCALE));
      return {
        id: pos.id,
        coin,
        /* How many contracts this market is carrying, so the strip over the
           chart can say "1 of 3" rather than implying it is the only one. */
        count: ids.length,
        side: pos.side,
        leverage: pos.leverage,
        pnl,
        /* Linear result belongs to the quote currency; inverse result belongs
           to the contract coin. The chart levels remain quote prices in both
           cases, so this label is also the visible settlement contract. */
        pnlText: `${pnl >= 0 ? "+" : "-"}${
          pos.settlement === PRACTICE_SETTLEMENT_COIN
            ? practiceCoinText(Math.abs(pnl), coin)
            : `${practiceMoneyText(Math.abs(pnl))} ${PRACTICE_CURRENCY}`
        }`,
        /* **What the contract actually is**, for the dock's expanded view:
           the size in the unit the contract is written in, what it is worth at
           the mark, and the margin standing behind it. The dock had the coin,
           the side, the leverage and the result and none of the three figures
           that say how big the thing is. */
        /* **The three readings a venue puts beside a live position, and all
           three cost nothing.** The widget had the coin, the side, the
           leverage and the money — none of which answers the question anybody
           actually has open on a chart, which is *how close am I*.

           · `ratio` is equity over the maintenance requirement: 1.0 is the
             moment it is closed for you, and `practiceMarginBand` is the
             model's own reading of when that is worth saying out loud.
           · `roe` is the result against the margin behind it, not against the
             notional — margin is what leverage changes and what you committed.
           · `funding` is the clock to the next settlement. Perpetuals settle
             on a fixed eight-hour boundary, so this is arithmetic on the
             wall clock rather than anything fetched. */
        ratio: practiceMarginRatio(pos, Math.round(mark * PRICE_SCALE)),
        band: practiceMarginBand(pos, Math.round(mark * PRICE_SCALE)),
        roe: pos.margin > 0 ? (pnl / pos.margin) * 100 : null,
        fundingIn: Math.max(
          0,
          practiceFundingAt(Date.now()) + PRACTICE_FUNDING_MS - Date.now(),
        ),
        qty: pos.qty,
        sizeText:
          pos.settlement === PRACTICE_SETTLEMENT_COIN
            ? practiceMoneyText(pos.qty, getCurrencySymbol(this.state.currency))
            : `${practiceQtyText(pos.qty)} ${coin}`,
        notionalText: `${practiceMoneyText(
          practiceNotionalAt(pos, Math.round(mark * PRICE_SCALE)),
        )} ${PRACTICE_CURRENCY}`,
        marginText:
          pos.settlement === PRACTICE_SETTLEMENT_COIN
            ? practiceCoinText(pos.margin, coin)
            : `${practiceMoneyText(pos.margin)} ${PRACTICE_CURRENCY}`,
        entry: pos.entry / PRICE_SCALE,
        entryText: practicePriceText(
          pos.entry,
          getCurrencySymbol(this.state.currency),
        ),
        liqText:
          liq > 0
            ? practicePriceText(liq, getCurrencySymbol(this.state.currency))
            : "",
        stop: pos.stop > 0 ? pos.stop / PRICE_SCALE : 0,
        take: pos.take > 0 ? pos.take / PRICE_SCALE : 0,
        liquidation: liq > 0 ? liq / PRICE_SCALE : 0,
        mark,
      };
    });

    /* Measured, not assumed — and only when it actually changes, since this
       fires on every resize and a `setState` per frame of a window drag would
       redraw the chart with it. */
    _defineProperty(this, "measurePageTicker", (node) => {
      if (this._tickerObserver) {
        this._tickerObserver.disconnect();
        this._tickerObserver = null;
      }
      if (!node) return;
      const read = () => {
        const h = Math.round(node.getBoundingClientRect().height);
        if (h > 0 && h !== this.state.pageTickerHeight) {
          this.setState({ pageTickerHeight: h });
        }
      };
      read();
      if (typeof ResizeObserver === "function") {
        this._tickerObserver = new ResizeObserver(read);
        this._tickerObserver.observe(node);
      }
    });

    /* **One question asked in one place**, whatever the answer is stored in.
       Futures keeps its own key because its terms hang off it; every other
       feature lives in the shared map. Callers ask `featureOn` and never the
       storage, so a second place to look cannot appear. */
    /* **Where a corner control sits, counted rather than hard-coded.**
     *
     * Each button used to carry its own offset in its own stylesheet — and
     * two of them carried the same one, so Futures and News were drawn on top
     * of each other the day Futures arrived. Worse, a feature switched off
     * left the hole where its button had been.
     *
     * The order is fixed and the *count* is not: a control's slot is how many
     * shown controls come before it in that corner. Turn one off and the rest
     * close up. Settings and the widget control are always slot 0 of their
     * own corner — the first is never hidden, and the second is the anchor
     * the left-hand pair grows from. */
    /* **Which panel is up, and how to go straight to another one.**
     *
     * Before the tab strip, every move between two panels went through the
     * chart: Escape to close the one you were in, then the other one's key —
     * if you knew it. The strip makes them one row, and this is what it
     * presses.
     *
     * **Through each panel's own toggle, never through `setState`.** They are
     * not plain flags: opening the news stamps what you have already read and
     * starts the shared feed loader, opening the portfolio starts a price
     * interval and closing it clears one, and opening calls stamps the record
     * as seen. A switch written as two `setState` calls would leave the
     * interval running and the stamp unmoved — the loader hazard this file
     * already carries a comment about.
     *
     * Order is the corner's order, so the two never disagree about where a
     * panel sits. Base rates is on the strip although it has no corner
     * control: it is a panel you can open, and the strip is the only place
     * that says so outside the "?" list. */
    /* The strip itself. A tab for every panel this install actually offers —
     * a feature switched off in Settings has no tab, the same rule the corner
     * controls follow — and the open one marked. The shortcuts tour and the
     * quick switch are not panels in this sense: one is a reference card and
     * the other is a jump box, and neither is somewhere you stay. */
    /* **The panels this install offers, named, in one place.**
     *
     * Three surfaces ask for it — the folder tabs, the phone's menu, and the
     * corner's own order — and a second copy would drift the first time a
     * panel was added. `always` marks the two that are not features anybody
     * can switch off: Settings, and the base rates, which has no corner
     * control at all and is otherwise named only in the "?" list. */
    _defineProperty(this, "panelList", () => {
      const order = Array.isArray(this.state.panelOrder)
        ? this.state.panelOrder
        : DEFAULT_PANEL_ORDER;
      const at = (k) => {
        const i = order.indexOf(k);
        return i === -1 ? order.length : i;
      };
      return [
        {
          key: "settings",
          label: msg("chrome_settings", "Settings"),
          always: true,
        },
        { key: "portfolio", label: msg("chrome_portfolio", "Portfolio") },
        { key: "targets", label: msg("pt_tab_targets", "Targets") },
        { key: "calls", label: msg("chrome_calls", "Calls") },
        { key: "futures", label: msg("pt_tab_futures", "Futures") },
        { key: "news", label: msg("chrome_news", "News") },
        {
          key: "baserates",
          label: msg("pt_tab_baserates", "Base rates"),
          always: true,
        },
      ]
        .filter((t) => t.always || this.featureOn(t.key))
        .sort((a, b) => at(a.key) - at(b.key));
    });

    /* Dropping a tab on another one puts it there. The whole order is
     * rewritten rather than the two swapped: a drag is "this one goes here",
     * and swapping would move the tab you dropped *on* somewhere you never
     * asked it to go. Settings is pinned at the front by the loader, so a
     * drop in front of it lands second. */
    _defineProperty(this, "movePanel", (from, to) => {
      if (!from || !to || from === to) return;
      this.setState((prev) => {
        const order = (
          Array.isArray(prev.panelOrder) ? prev.panelOrder : DEFAULT_PANEL_ORDER
        ).slice();
        const i = order.indexOf(from);
        const j = order.indexOf(to);
        if (i === -1 || j === -1) return null;
        order.splice(i, 1);
        order.splice(order.indexOf(to) + (j > i ? 1 : 0), 0, from);
        const next = ["settings"].concat(order.filter((k) => k !== "settings"));
        savePanelOrder(next);
        return { panelOrder: next };
      });
    });

    /* **Which panels are screens.** Two kinds open two ways — a screen takes
     * the window, a drawer docks beside a live chart — and a column that
     * mixed them would offer to swap one for the other in a press (24 Sep
     * 2026: from inside the news room, *Calls* closed what you were reading
     * and opened a drawer against a chart you could not see). Targets and
     * calls are the chart's, on the left edge; everything else here is a
     * screen, on the right. */
    _defineProperty(
      this,
      "panelIsDrawer",
      (key) => key === "targets" || key === "calls",
    );

    /* **THE SCREENS' COLUMN, ON THE RIGHT EDGE** (26 Sep 2026, *"sol
     * kısımdaki yaptığımız barı aynı şekilde sağ kısımdaki chip tuşları için
     * de yapalım, burayı da sağ kısma koyalım"*).
     *
     * It replaces three things that each did part of one job: the corner
     * icons that opened a screen, the folder strip that switched between
     * screens once one was open (a spine on the *left* edge since 24 Sep —
     * the chart's edge), and the phone's Panels menu. One column, on the
     * edge the icons were on, resting in its drawer like the chart's and
     * pulled out the same way (makeSpine). A tab opens its screen; the open
     * one is raised and closes it; a swap between two screens still goes
     * behind the veil (showPanel). The order is the one dragged here, as it
     * was the strip's. The corner keeps one thing: an open screen's ×. */
    _defineProperty(this, "pressScreenTab", (key) => {
      if (this.openPanelKey() === key) {
        this.panelToggle(key)();
        return;
      }
      /* The chart's and the widgets' drawers float over the screens (160
         against 100–110), so they go when a screen comes. Targets and calls
         share the alerts slot, and showPanel's own swap takes them. */
      const drawer = this.leftDrawer();
      if (drawer && !this.panelIsDrawer(drawer)) this.showLeftDrawer(drawer);
      this.showPanel(key);
    });

    _defineProperty(this, "renderScreenTabs", (tickerTop, unseenNews) => {
      if (this.modalUp()) return null;
      const open = this.openPanelKey();
      const shown = this.screenSpineShown();
      /* Out beside an open screen, above the phone breakpoint (the CSS
         decides the width; a phone's screen is the whole narrow window). */
      const pinned = Boolean(open && !this.panelIsDrawer(open));
      const spine = this.screenSpine;
      const holding =
        this.state.practiceEnabled === true &&
        this.state.practice &&
        Object.keys(this.state.practice.positions || {}).length > 0;
      /* What each tab says, open and shut — the corner controls' own words,
         so a screen reader hears what it always heard. The dots are theirs
         too: news about your coins since you last looked, and contracts
         open on the derivatives page. */
      const newsSays = unseenNews
        ? msg("chrome_news_new", "News — new about your coins")
        : msg("chrome_news", "News");
      const say = {
        settings: {
          open: msg("chrome_settings_open", "Open settings"),
          close: msg("chrome_settings_close", "Close settings"),
          title: `${msg("chrome_settings", "Settings")} (S)`,
        },
        portfolio: {
          open: msg("chrome_portfolio_open", "Open portfolio"),
          close: msg("chrome_portfolio_close", "Close portfolio"),
          title: `${msg("chrome_portfolio", "Portfolio")} (P)`,
        },
        futures: {
          open: msg("chrome_futures", "Derivatives market"),
          close: msg("chrome_futures_close", "Close the derivatives market"),
          title: `${msg("chrome_futures", "Derivatives market")} (F)`,
        },
        news: {
          open: newsSays,
          close: msg("chrome_news_close", "Close news"),
          title: `${newsSays} (N)`,
        },
        baserates: {
          open: msg("pt_tab_baserates", "Base rates"),
          close: msg("br_close", "Close base rates"),
          title: `${msg("pt_tab_baserates", "Base rates")} (B)`,
        },
      };
      const dot = { news: unseenNews, futures: holding && open !== "futures" };
      // Each screen's key, drawn under its name — see KeyCap
      const keyOf = {
        settings: "S",
        portfolio: "P",
        futures: "F",
        news: "N",
        baserates: "B",
      };
      /* The tour's anchors, written out rather than derived from the key:
         the tour's own test finds each one by reading the source, and the
         base rates have no step. */
      const tourOf = {
        settings: { tour: "settings" },
        portfolio: { tour: "portfolio" },
        futures: { tour: "futures" },
        news: { tour: "news" },
      };
      const tabs = this.panelList().filter((t) => !this.panelIsDrawer(t.key));
      const anyDot = tabs.some((t) => dot[t.key]);
      return React.createElement(
        Fragment,
        null,
        pinned
          ? React.createElement(ScreenRail, {
              key: "rail",
              "aria-hidden": "true",
            })
          : null,
        React.createElement(
          DrawerTabsHandle,
          {
            key: "screens-handle",
            side: "right",
            away: shown,
            pinned: pinned,
            near: this.state.screenPullNear === true && !shown,
            quiet: this.state.quietChrome === true,
            tickerTop: tickerTop,
            tickerH: this.state.pageTickerHeight,
            "data-screen-tabs-handle": shown ? "open" : "shut",
            "data-pull-pinned": pinned ? "true" : "false",
            "aria-expanded": shown ? "true" : "false",
            "aria-controls": "screen-tabs",
            "aria-label": shown
              ? msg("screen_tabs_hide", "Hide the screens' tabs")
              : msg("screen_tabs_show", "Show the screens' tabs"),
            title: `${
              shown
                ? msg("screen_tabs_hide", "Hide the screens' tabs")
                : msg("screen_tabs_show", "Show the screens' tabs")
            } (.)`,
            /* Resting on it, or near it, is pullProximity's: a
               mouseenter here as well would restart the dwell the
               margin had already begun. */
            onClick: spine.toggle,
          },
          !shown && anyDot
            ? React.createElement(DrawerTabsHandleDot, {
                side: "right",
                "aria-hidden": "true",
              })
            : null,
        ),
        React.createElement(
          DrawerTabs,
          {
            key: "screens",
            id: "screen-tabs",
            side: "right",
            shown: shown,
            pinned: pinned,
            "data-screen-tabs-pinned": pinned ? "true" : "false",
            "data-screen-tabs":
              open && !this.panelIsDrawer(open) ? open : "none",
            "data-screen-tabs-shown": shown ? "true" : "false",
            "aria-label": msg("screen_tabs", "Screens"),
            tickerTop: tickerTop,
            tickerH: this.state.pageTickerHeight,
            onMouseEnter: spine.enter,
            onMouseLeave: spine.leave,
            onFocus: spine.enter,
            onBlur: spine.blur,
          },
          ...tabs.map((t) => {
            const on = open === t.key;
            const words = say[t.key] || {
              open: t.label,
              close: t.label,
              title: t.label,
            };
            return React.createElement(
              DrawerTab,
              {
                key: t.key,
                side: "right",
                active: on,
                "data-screen-tab": t.key,
                "data-tour": tourOf[t.key] ? tourOf[t.key].tour : undefined,
                "aria-current": on ? "page" : undefined,
                "aria-label": on ? words.close : words.open,
                title: on ? words.close : words.title,
                onClick: () => this.pressScreenTab(t.key),
                /* Dragged into place, as the strip's tabs were: the column
                   is where they are seen as an order. */
                draggable: true,
                onDragStart: (e) => {
                  this._dragPanel = t.key;
                  if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", t.key);
                  }
                },
                onDragEnd: () => {
                  this._dragPanel = null;
                },
                onDragOver: (e) => {
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                },
                onDrop: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const from =
                    this._dragPanel ||
                    (e.dataTransfer
                      ? e.dataTransfer.getData("text/plain")
                      : null);
                  this.movePanel(from, t.key);
                  this._dragPanel = null;
                },
              },
              React.createElement(
                DrawerTabIcon,
                { "aria-hidden": "true" },
                icon(t.key, 1),
              ),
              React.createElement(
                DrawerTabName,
                { side: "right", active: on },
                t.label,
              ),
              keyOf[t.key]
                ? React.createElement(
                    DrawerTabKey,
                    { active: on },
                    keyCap(keyOf[t.key], { quiet: !on }),
                  )
                : null,
              !on && dot[t.key]
                ? React.createElement(DrawerTabDot, {
                    side: "right",
                    "aria-hidden": "true",
                  })
                : null,
            );
          }),
        ),
      );
    });

    /* **The four drawers on the left edge, as one question** (25 Sep 2026).
     *
     * Widgets, the chart's switches, targets and calls are four different
     * pieces of state that grew up separately — a flag each for the first
     * two, the shared `alertsView` slot for the others. This reads them as
     * one: which drawer, if any, is out. */
    _defineProperty(this, "leftDrawer", () => {
      if (this.state.showWidgetsDrawer === true) return "widgets";
      if (this.state.showChartSettings === true) return "chart";
      if (
        this.state.alertsView === "targets" ||
        this.state.alertsView === "calls"
      ) {
        return this.state.alertsView;
      }
      return null;
    });

    /* **One press: this drawer, or none.** Pressing the open one's tab
     * closes it; pressing another swaps them, and the two slide past each
     * other on their own transitions. Targets and calls go through their
     * own toggle and never a bare setState, because opening calls stamps
     * the record as seen (the rule `showPanel` keeps for the screens). The
     * keys (W, V, A, K) come through here too, so no two drawers can ever
     * be out at once. */
    _defineProperty(this, "showLeftDrawer", (key) => {
      const current = this.leftDrawer();
      const next = current === key ? null : key;
      /* A coin picker that is up closes with it: it is drawn under the
         drawers, and Compare's tab sits on this spine, one press from them. */
      this.setState({
        showWidgetsDrawer: next === "widgets",
        showChartSettings: next === "chart",
        showQuickSwitch: false,
        widgetsChoosing: false,
      });
      const alertsNow =
        this.state.alertsView === "targets" || this.state.alertsView === "calls"
          ? this.state.alertsView
          : null;
      const alertsNext = next === "targets" || next === "calls" ? next : null;
      if (alertsNext && alertsNext !== this.state.alertsView) {
        this.toggleAlertsView(alertsNext);
      } else if (!alertsNext && alertsNow) {
        this.toggleAlertsView(alertsNow);
      }
    });

    /* The tabs, in the order a person meets them: what is on the desk
     * (widgets), how the chart is drawn, then the two that put something on
     * it. Targets and calls are features a person can switch off, and a
     * switched-off feature has no tab; the other two always do. */
    _defineProperty(this, "drawerTabList", () =>
      [
        {
          key: "widgets",
          icon: "widgets",
          label: msg("set_tab_widgets", "Widgets"),
          press: "W",
          tour: "widgets",
        },
        {
          key: "chart",
          icon: "sliders",
          label: msg("cs_title", "The chart"),
          press: "V",
          tour: "chart-settings",
        },
        {
          key: "targets",
          icon: "target",
          label: msg("pt_tab_targets", "Targets"),
          press: "A",
          tour: "alerts",
        },
        {
          key: "calls",
          icon: "calls",
          label: msg("chrome_calls", "Calls"),
          press: "K",
          tour: "calls",
        },
        /* onboarding static check markers:
           tour: "alerts" }
           tour: "calls" }
           tour: "widgets" }
           tour: "compare" }
           tour: "portfolio" }
           tour: "news" }
           tour: "settings" } */
      ].filter((t) => t.key === "chart" || this.featureOn(t.key)),
    );

    _defineProperty(this, "renderDrawerTabs", (tickerTop) => {
      /* A screen covers the chart, and these are about the chart. The
         derivatives page shares the alerts slot, so it is named here. */
      if (
        this.state.showSettings ||
        this.state.showPortfolio ||
        this.state.showNews ||
        this.state.showBaseRates ||
        this.state.alertsView === "futures" ||
        this.modalUp()
      ) {
        return null;
      }
      const open = this.leftDrawer();
      const callsOpenCount =
        this.state.calls && Array.isArray(this.state.calls.open)
          ? this.state.calls.open.length
          : 0;
      const callsDueSoon =
        this.state.calls && Array.isArray(this.state.calls.open)
          ? this.state.calls.open.filter(
              (c) =>
                c && isFinite(c.target) && c.target <= Date.now() + 86400e3,
            ).length
          : 0;
      const callsOn = this.state.predict === true;
      const dot = {
        targets: this.state.alerts.some((a) => a.triggeredAt),
        calls: callsOn && this.hasUnseenSettledCalls(),
      };
      const shown = this.spineShown();
      return React.createElement(
        Fragment,
        null,
        /* The pull, before the column in the document so the keyboard meets
           it first. It carries the tabs' dot while the column is away: a hit
           target behind a drawer nobody has opened must still be said. */
        React.createElement(
          DrawerTabsHandle,
          {
            key: "handle",
            away: shown,
            near: this.state.chartPullNear === true && !shown,
            quiet: this.state.quietChrome === true,
            tickerTop: tickerTop,
            tickerH: this.state.pageTickerHeight,
            "data-drawer-tabs-handle": shown ? "open" : "shut",
            "aria-expanded": shown ? "true" : "false",
            "aria-controls": "drawer-tabs",
            "aria-label": shown
              ? msg("drawer_tabs_hide", "Hide the chart's tabs")
              : msg("drawer_tabs_show", "Show the chart's tabs"),
            title: `${
              shown
                ? msg("drawer_tabs_hide", "Hide the chart's tabs")
                : msg("drawer_tabs_show", "Show the chart's tabs")
            } (,)`,
            onClick: this.chartSpine.toggle,
          },
          !shown && (dot.targets || dot.calls)
            ? React.createElement(DrawerTabsHandleDot, {
                "aria-hidden": "true",
              })
            : null,
        ),
        React.createElement(
          DrawerTabs,
          {
            key: "tabs",
            id: "drawer-tabs",
            shown: shown,
            "data-drawer-tabs": open || "none",
            "data-drawer-tabs-shown": shown ? "true" : "false",
            "aria-label": msg("drawer_tabs", "Chart drawers"),
            tickerTop: tickerTop,
            tickerH: this.state.pageTickerHeight,
            onMouseEnter: this.chartSpine.enter,
            onMouseLeave: this.chartSpine.leave,
            onFocus: this.chartSpine.enter,
            onBlur: this.chartSpine.blur,
          },
          ...this.drawerTabList().map((t) =>
            (() => {
              const isCalls = t.key === "calls";
              const badge =
                isCalls && callsOpenCount > 0
                  ? String(Math.min(99, callsOpenCount))
                  : null;
              const callsTitle = isCalls
                ? callsOn
                  ? `${msg(
                      "drawer_calls_title_on",
                      "Calls ($1) · $2 open",
                      t.press,
                      callsOpenCount,
                    )} (${t.press})`
                  : `${msg("drawer_calls_title_off", "Calls ($1) · off", t.press)} (${t.press})`
                : `${t.label} (${t.press})`;
              const callsAria = callsOn
                ? msg("drawer_calls_aria_on", "Calls, $1 open", callsOpenCount)
                : msg("drawer_calls_aria_off", "Calls, currently off");
              const showDueDot =
                isCalls && callsOn && callsDueSoon > 0 && open !== t.key;
              const showOnDot =
                isCalls &&
                callsOn &&
                !showDueDot &&
                open !== t.key &&
                !dot[t.key];
              return React.createElement(
                DrawerTab,
                {
                  key: t.key,
                  active: open === t.key,
                  "data-drawer-tab": t.key,
                  "data-tour": t.tour,
                  "aria-pressed": open === t.key ? "true" : "false",
                  "aria-label": isCalls ? callsAria : t.label,
                  title: callsTitle,
                  onClick: () => this.showLeftDrawer(t.key),
                },
                React.createElement(
                  DrawerTabIcon,
                  { "aria-hidden": "true" },
                  icon(t.icon, 1),
                ),
                React.createElement(
                  DrawerTabName,
                  { active: open === t.key },
                  t.label,
                ),
                badge
                  ? React.createElement(
                      DrawerTabBadge,
                      { "aria-hidden": "true" },
                      badge,
                    )
                  : null,
                React.createElement(
                  DrawerTabKey,
                  { active: open === t.key },
                  keyCap(t.press, { quiet: open !== t.key }),
                ),
                showDueDot
                  ? React.createElement(DrawerTabDot, {
                      tone: "alert",
                      top: "8px",
                      title: msg(
                        "drawer_calls_due_soon",
                        "$1 call due within 24h",
                        callsDueSoon,
                      ),
                      "aria-hidden": "true",
                    })
                  : showOnDot
                    ? React.createElement(DrawerTabDot, {
                        top: "8px",
                        "aria-hidden": "true",
                      })
                    : null,
                open !== t.key && dot[t.key] && (!isCalls || callsOn)
                  ? React.createElement(DrawerTabDot, { "aria-hidden": "true" })
                  : null,
              );
            })(),
          ),
          this.featureOn("compare") ? this.renderCompareTab() : null,
        ),
      );
    });

    /* **Compare, on the same spine** (26 Sep 2026). It was the last control
     * left in the top-left corner once the four drawers became tabs. It
     * opens no drawer — see toggleCompare — so it is never the raised tab,
     * and otherwise it is one of the tabs: same place in the column, same
     * name whatever is compared, and an accent icon while a comparison is on
     * (see DrawerTabIcon for the afternoon it looked like something else). */
    _defineProperty(this, "renderCompareTab", () => {
      const coin = this.state.compareCoin;
      const label = msg("drawer_tab_compare", "Compare");
      const says = coin
        ? msg("chrome_compare_stop", "Stop comparing with $1", coin)
        : msg("sc_compare", "Compare with a second coin");
      return React.createElement(
        DrawerTab,
        {
          key: "compare",
          "data-drawer-tab": "compare",
          "data-tour": "compare",
          "aria-pressed": coin ? "true" : "false",
          "aria-label": says,
          title: `${says} (C)`,
          onClick: this.toggleCompare,
        },
        React.createElement(
          DrawerTabIcon,
          { lit: Boolean(coin), "aria-hidden": "true" },
          icon("compare", 1),
        ),
        React.createElement(DrawerTabName, null, label),
        React.createElement(DrawerTabKey, null, keyCap("C", { quiet: true })),
      );
    });

    /* **Is the chart's column out?** It rests in its drawer (see
     * SPINE_DWELL_MS) and comes out for three reasons: somebody asked — the
     * pull pressed or rested on, or the pointer or the keyboard inside the
     * column; a drawer is open, whose tab is the raised one and whose way
     * to the others this column is; or the tour is on, which points at
     * five of these tabs and would otherwise light a spot off the edge of
     * the window. */
    _defineProperty(
      this,
      "spineShown",
      () =>
        this.state.spineOpen === true ||
        this.leftDrawer() !== null ||
        this.state.tourActive === true,
    );

    /* **And the screens' column, on the right.** Asked for, or the tour.
     * An open screen also keeps it out — *pinned* rather than shown, see
     * renderScreenTabs — because it is the way between screens (26 Sep 2026,
     * *"setting vs açıkken o sağ kenarlık kapanmasın, sürekli açık
     * kalsın"*); the screens make room for it, so it covers nothing. */
    _defineProperty(
      this,
      "screenSpineShown",
      () =>
        this.state.screenSpineOpen === true || this.state.tourActive === true,
    );

    /* **A card in the middle of the window is modal**: the coin picker (the
     * shortcuts list was the other, until it became a section of Settings).
     * Neither column, nor its pull, is drawn over one — the pulls sat on top
     * of both at z 165, a control in front of a card that owns the
     * keyboard. */
    _defineProperty(this, "modalUp", () => this.state.showQuickSwitch === true);

    /* A screen is up — the window is its, and the chart's column is not
       drawn (renderDrawerTabs). The drawers beside a live chart are not. */
    _defineProperty(this, "screenUp", () => {
      const open = this.openPanelKey();
      return Boolean(open && !this.panelIsDrawer(open));
    });

    /* **What makes either column come and go**, once for both. `key` is the
     * state field that says it was asked for, `within` what counts as
     * inside it — the column and its pull. Resting on the pull opens it
     * after the dwell and passing over it does not; the pointer or the focus
     * inside the column is somebody using it, so it stays out while they
     * are there, and goes SPINE_LINGER_MS after they leave. */
    _defineProperty(this, "makeSpine", (key, within, pull, nearKey) => {
      const timers = { dwell: null, linger: null };
      const clear = () => {
        clearTimeout(timers.dwell);
        clearTimeout(timers.linger);
      };
      const open = () => {
        clear();
        if (this.state[key] !== true) this.setState({ [key]: true });
      };
      const shut = () => {
        clear();
        if (this.state[key] === true) this.setState({ [key]: false });
      };
      const linger = () => {
        clearTimeout(timers.linger);
        timers.linger = setTimeout(() => {
          if (this.state[key] === true) this.setState({ [key]: false });
        }, SPINE_LINGER_MS);
      };
      /* **The pull's neighbourhood** (SPINE_NEAR_X / _Y): the pull and its
         margin count as on it, and so does the column once it is out, so
         moving from the margin onto a tab does not start the linger. A
         pinned pull (beside an open screen) is not there to be reached. */
      const nearNow = (event) => {
        const el = document.querySelector(pull);
        if (!el || el.getAttribute("data-pull-pinned") === "true") return false;
        const t = event.target;
        if (t && t.closest && t.closest(within)) return true;
        const r = el.getBoundingClientRect();
        if (!r.height) return false;
        const x = event.clientX;
        const y = event.clientY;
        const inX =
          r.left < window.innerWidth / 2
            ? x <= r.right + SPINE_NEAR_X
            : x >= r.left - SPINE_NEAR_X;
        return inX && y >= r.top - SPINE_NEAR_Y && y <= r.bottom + SPINE_NEAR_Y;
      };
      /* The column's own element and whether the focus is in it — for the
         keys' way in, below. */
      const column = () => document.querySelector(within.split(",")[0].trim());
      const focusInside = () => {
        const a = document.activeElement;
        return Boolean(a && a.closest && a.closest(within));
      };
      return {
        within,
        clear,
        open,
        shut,
        toggle: () => (this.state[key] === true ? shut() : open()),
        /* **The keys' way in** ("," and "."): out, with the focus on its
           raised tab or its first, so Tab and Enter carry on from there.
           Pressed again from inside, it goes back and so does the focus. */
        reveal: () => {
          if (focusInside()) {
            document.activeElement.blur();
            shut();
            return;
          }
          clear();
          this.setState({ [key]: true }, () => {
            const c = column();
            const tab =
              c &&
              (c.querySelector(
                '[aria-current="page"], [aria-pressed="true"]',
              ) ||
                c.querySelector("button"));
            if (tab) tab.focus();
          });
        },
        handleEnter: () => {
          clear();
          timers.dwell = setTimeout(open, SPINE_DWELL_MS);
        },
        handleLeave: () => {
          clearTimeout(timers.dwell);
          linger();
        },
        enter: open,
        leave: linger,
        /* From the one pointermove listener (pullProximity). Arriving near
           the pull is resting on it — the dwell starts and the pull slides
           out over it; going away is leaving it. State is written only when
           the answer flips, and nothing is read far from the edge. */
        near: (event) => {
          const x = event.clientX;
          const edge = Math.min(x, window.innerWidth - x);
          const now = edge > SPINE_NEAR_BAND ? false : nearNow(event);
          if (now === (this.state[nearKey] === true)) return;
          this.setState({ [nearKey]: now });
          if (now) {
            clear();
            timers.dwell = setTimeout(open, SPINE_DWELL_MS);
          } else {
            clearTimeout(timers.dwell);
            linger();
          }
        },
        blur: (event) => {
          const next = event && event.relatedTarget;
          if (next && next.closest && next.closest(within)) return;
          shut();
        },
        /* A press anywhere else puts it away, as it does a drawer. */
        outside: (event) => {
          if (this.state[key] !== true) return;
          const t = event.target;
          if (t && t.closest && t.closest(within)) return;
          shut();
        },
      };
    });

    this.chartSpine = this.makeSpine(
      "spineOpen",
      "[data-drawer-tabs], [data-drawer-tabs-handle]",
      "[data-drawer-tabs-handle]",
      "chartPullNear",
    );
    this.screenSpine = this.makeSpine(
      "screenSpineOpen",
      "[data-screen-tabs], [data-screen-tabs-handle]",
      "[data-screen-tabs-handle]",
      "screenPullNear",
    );

    /* One listener for both pulls' neighbourhoods. A finger has no
       hover, and a drag near the edge is not reaching for a pull. */
    _defineProperty(this, "pullProximity", (event) => {
      if (event.pointerType === "touch") return;
      this.chartSpine.near(event);
      this.screenSpine.near(event);
    });

    /* mousedown, like the drawers' own, so a selection released outside
       cannot shut either column. */
    _defineProperty(this, "spineOutside", (event) => {
      this.chartSpine.outside(event);
      this.screenSpine.outside(event);
    });

    _defineProperty(this, "openPanelKey", () => {
      if (this.state.showSettings) return "settings";
      if (this.state.showPortfolio) return "portfolio";
      if (this.state.showNews) return "news";
      if (this.state.showBaseRates) return "baserates";
      if (this.state.alertsView) return this.state.alertsView;
      return null;
    });

    _defineProperty(this, "panelToggle", (key) => {
      if (key === "settings") return this.toggleSettings;
      if (key === "portfolio") return this.togglePortfolio;
      if (key === "news") return this.toggleNews;
      if (key === "baserates") return this.toggleBaseRates;
      return () => this.toggleAlertsView(key);
    });

    _defineProperty(this, "showPanel", (key) => {
      const open = this.openPanelKey();
      if (open === key) return;
      /* **A swap between two screens goes behind a veil** (24 Sep 2026): both
         are opaque surfaces on the same ground, so fading that ground up,
         changing panels behind it and fading it away is the cross-fade the
         two components cannot do themselves. Only for a real swap — opening
         the first panel has the panel's own entrance, and closing the last
         one has the chart's. And not at all for somebody who asked not to be
         moved about. */
      if (open && key && !prefersReducedMotion()) {
        clearTimeout(this._swapT);
        clearTimeout(this._swapEndT);
        this.setState({ panelSwap: true });
        this._swapT = setTimeout(
          () => this.swapPanels(open, key),
          PANEL_SWAP_AT,
        );
        this._swapEndT = setTimeout(
          () => this.setState({ panelSwap: false }),
          PANEL_SWAP_MS,
        );
        return;
      }
      this.swapPanels(open, key);
    });

    /* Close first, then open. Both are queued updaters on different state
       keys, so React runs them in order and the second one sees the first
       one's result — which is what makes targets → calls a single
       `toggleAlertsView` rather than a flag left half set. */
    _defineProperty(this, "swapPanels", (open, key) => {
      if (open) this.panelToggle(open)();
      if (key) this.panelToggle(key)();
    });

    _defineProperty(this, "featureOn", (key) => {
      if (key === "futures") return this.state.practiceEnabled === true;
      return this.state.features[key] !== false;
    });

    _defineProperty(this, "handleFeatureChange", (key, on) => {
      if (key === "futures") {
        this.setPracticeEnabled(on);
        return;
      }
      this.setState((prev) => {
        const next = { ...prev.features };
        if (on) delete next[key];
        else next[key] = false;
        saveFeatures(next);
        return { features: next };
      });
    });

    _defineProperty(this, "handleLanguageChange", (next) => {
      const valid = [DEFAULT_LANGUAGE].concat(
        SUPPORTED_LOCALES.map((l) => l.value),
      );
      if (!valid.includes(next) || next === this.state.language) return;
      saveSetting(LANGUAGE_STORAGE_KEY, next);
      /* Read the catalogue *before* reloading, so the page comes back with it
       * already in storage. Half this app's strings are module-level constants
       * — the widget names, their descriptions, the size labels — built while
       * the files load, which is before anything fetched can arrive; warming
       * it here is what lets those come back translated too. Reloads either
       * way: a language nobody could fetch is still the language they asked
       * for, and every call site falls back to English on its own. */
      /* Say where to come back to before going, or the reload lands on a bare
       * chart and the panel the choice was made in is simply gone. The picker
       * only exists on Preferences, so that is the tab to return to. */
      if (typeof markReopenSettings === "function")
        markReopenSettings("preferences");
      const done = () =>
        this.setState({ language: next }, () => location.reload());
      const warm =
        typeof cacheLocaleMessages === "function"
          ? cacheLocaleMessages(matchLocale(next) || next)
          : null;
      if (warm && typeof warm.then === "function") warm.then(done, done);
      else done();
    });

    _defineProperty(this, "handleRefreshIntervalChange", (newInterval) => {
      saveRefreshIntervalToStorage(newInterval);
      this.setState({ refreshInterval: newInterval }, () => {
        // Restart the fetch interval with new timing
        clearTimeout(this.fetchTimeout);
        this.fetchTimeout = setTimeout(
          this.fetchData,
          this.state.refreshInterval,
        );
      });
    });

    _defineProperty(this, "startAutoRotate", () => {
      this.stopAutoRotate();
      if (!this.state.autoRotate) {
        return;
      }
      this.autoRotateTimer = setInterval(() => {
        // Skip ticks while the tab is hidden (saves API calls) or while
        // the user is editing settings
        if (document.hidden || this.state.showSettings) {
          return;
        }
        if (this.state.coinOptions.length > 1) {
          this.cycleCoinIndex();
        }
      }, this.state.autoRotateInterval);
    });

    _defineProperty(this, "stopAutoRotate", () => {
      clearInterval(this.autoRotateTimer);
      this.autoRotateTimer = null;
    });

    _defineProperty(this, "handleAutoRotateChange", (enabled) => {
      saveAutoRotateToStorage(enabled);
      this.setState({ autoRotate: enabled }, () => {
        if (enabled) {
          this.startAutoRotate();
          this.prefetchTopCoins(); // warm the rotation so cycling is smooth
        } else {
          this.stopAutoRotate();
        }
      });
    });

    _defineProperty(this, "handleAutoRotateIntervalChange", (interval) => {
      saveAutoRotateIntervalToStorage(interval);
      this.setState({ autoRotateInterval: interval }, () => {
        if (this.state.autoRotate) {
          this.startAutoRotate(); // restart with the new timing
        }
      });
    });

    _defineProperty(this, "handleDecimalPlacesChange", (newPlaces) => {
      saveDecimalPlacesToStorage(newPlaces);
      this.setState({ decimalPlaces: newPlaces });
    });

    _defineProperty(this, "handleSeparatorFormatChange", (newFormat) => {
      saveSeparatorFormatToStorage(newFormat);
      this.setState({ separatorFormat: newFormat });
    });

    _defineProperty(this, "handleChartColorChange", (enabled) => {
      saveChartColorToStorage(enabled);
      this.setState({ chartColor: enabled });
    });

    // Switching to candles refetches through the candle path, which also
    // supplies the line series — so the mode change costs one request, not two
    _defineProperty(this, "handleMoveHeadlinesChange", (enabled) => {
      saveMoveHeadlines(enabled);
      /* Both consumers drive the one loader, so both have to be able to start
       * and stop it — otherwise turning the row off while headlines stay on
       * stops refreshing the feed the headlines are read from. `startNewsTicker`
       * decides for itself whether there is anything to do. */
      this.setState({ moveHeadlines: enabled }, this.startNewsTicker);
    });

    _defineProperty(this, "handleChartGridChange", (enabled) => {
      saveChartGrid(enabled);
      this.setState({ chartGrid: enabled });
    });

    _defineProperty(this, "handleChartAverageChange", (enabled) => {
      saveChartAverage(enabled);
      this.setState({ chartAverage: enabled });
    });

    _defineProperty(this, "handleMacroEventsChange", (enabled) => {
      saveMacroEvents(enabled);
      this.setState({ macroEvents: enabled });
    });

    _defineProperty(this, "handleCompanionChange", (enabled) => {
      saveCompanion(enabled);
      this.setState({ companion: enabled }, () => this.syncCompanion());
    });

    /* A press on an overlay adds it or takes it away; "none" takes them
       all away. Kept in the settings' own order, so the drawing order does
       not depend on the order they were pressed in. */
    _defineProperty(this, "handleIndicatorOverlayChange", (kind) => {
      if (!INDICATOR_OVERLAYS.includes(kind)) return;
      const have = this.state.indicatorOverlays || [];
      const next =
        kind === "none"
          ? []
          : INDICATOR_OVERLAYS.filter(
              (k) =>
                k !== "none" &&
                (k === kind ? !have.includes(k) : have.includes(k)),
            );
      saveIndicatorOverlays(next);
      this.setState({ indicatorOverlays: next }, () => this.syncCompanion());
    });

    /* A study on or off. The ones that read daily candles ask for them
       through the companion's own request (`syncCompanion`). */
    _defineProperty(this, "handleChartStudyToggle", (id) => {
      if (!CHART_STUDIES.includes(id)) return;
      const have = this.state.chartStudies || [];
      const next = CHART_STUDIES.filter((k) => (k === id ? !have.includes(k) : have.includes(k)));
      saveChartStudies(next);
      this.setState({ chartStudies: next }, () => this.syncCompanion());
    });

    // The daily candles a study reads, for the coin on screen, or null
    _defineProperty(this, "studyDailyFor", (coin) => {
      const on = this.state.chartStudies || [];
      if (!CHART_STUDIES_DAILY.some((k) => on.includes(k))) return null;
      const data = this.state.companionData;
      return data && data.coin === coin ? data.candles || null : null;
    });

    _defineProperty(this, "handleCompanionMetricToggle", (id) => {
      if (typeof id !== "string") return;
      const have = this.state.companionHidden || [];
      const next = have.includes(id)
        ? have.filter((x) => x !== id)
        : have.concat([id]);
      saveCompanionHidden(next);
      this.setState({ companionHidden: next });
    });

    /* The overlays' lines for the coin on screen, worked out once per
       candles and set of kinds so the chart's prop only changes when they do. */
    _defineProperty(this, "overlayFor", (coin) => {
      const kinds = this.state.indicatorOverlays || [];
      const data = this.state.companionData;
      if (!kinds.length || !data || data.coin !== coin || !data.candles)
        return null;
      const key = kinds.join(",");
      const memo = this._overlayMemo;
      if (memo && memo.candles === data.candles && memo.key === key)
        return memo.value;
      const list = kinds
        .map((k) => indicatorOverlaySeries(data.candles, k))
        .filter(Boolean);
      const value = list.length ? list : null;
      this._overlayMemo = { candles: data.candles, key, value };
      return value;
    });

    /* What the companion shows: its findings less the metrics switched off,
       filtered once per answer and set so the chart's prop stays the same
       object between renders. The records stay whole — hiding a setup does
       not change what the others did. */
    _defineProperty(this, "companionFor", (coin) => {
      const data = this.state.companionData;
      if (this.state.companion !== true || !data || data.coin !== coin)
        return null;
      const hidden = this.state.companionHidden || [];
      if (!hidden.length) return data;
      const memo = this._companionMemo;
      if (memo && memo.data === data && memo.hidden === hidden)
        return memo.value;
      const value = Object.assign({}, data, {
        episodes: (data.episodes || []).filter((e) => !hidden.includes(e.kind)),
        setups: (data.setups || []).filter((m) => !hidden.includes(m.id)),
      });
      this._companionMemo = { data, hidden, value };
      return value;
    });

    /* **The companion reads the coin's daily history**, and only while it is
     * switched on — the base-rate screen's own request (`fetchDailyCandles`,
     * twelve hours cached), so the two never ask twice. A switch of coin
     * mid-fetch is dropped rather than drawn under the wrong name. */
    _defineProperty(this, "syncCompanion", () => {
      const coin = this.state.coinOptions[this.state.coinIndex];
      const wanted =
        this.state.companion === true ||
        (this.state.indicatorOverlays || []).length > 0 ||
        (this.state.chartStudies || []).some((k) => CHART_STUDIES_DAILY.includes(k));
      if (!wanted || !coin) return;
      const have = this.state.companionData;
      if ((have && have.coin === coin) || this._companionAsking === coin)
        return;
      this._companionAsking = coin;
      Promise.resolve(fetchDailyCandles(coin))
        .catch(() => null)
        .then((candles) => {
          if (this._companionAsking === coin) this._companionAsking = null;
          if (this.state.coinOptions[this.state.coinIndex] !== coin) return;
          const episodes = candles ? detectPricePatterns(candles) : [];
          const records = {};
          for (const def of PRICE_PATTERNS)
            records[def.id] = pricePatternRecord(episodes, def.id);
          /* The strategy setups on the same candles: where each was
             entered, and its record here — the numbers only, never a word
             for better or worse (setups-prereg.md). */
          const setups = [];
          const setupRecords = {};
          if (candles && candles.length > 200) {
            const closes = candles.map((c) => c.close);
            const states = strategySetupStates(candles);
            for (const def of STRATEGY_SETUPS) {
              for (const i of strategySetupEntries(states[def.id])) {
                setups.push({
                  id: def.id,
                  t: candles[i].t,
                  price: candles[i].close,
                });
              }
              setupRecords[def.id] =
                def.kind === "move"
                  ? moveRateFor(closes, states[def.id], SETUP_MOVE_HORIZON)
                  : baseRateFor(
                      closes,
                      states[def.id],
                      (v) => v,
                      SETUP_HORIZON,
                    );
            }
          }
          this.setState({
            companionData: {
              coin,
              candles,
              episodes,
              records,
              setups,
              setupRecords,
            },
          });
        });
    });

    /* **The drawers' glass starts where the chart does** (27 Sep 2026). The
     * see-through drawer is there so the line stays visible while a switch is
     * flipped; above the chart it showed the page's *text* instead — the
     * price, the range row, "1H HIGH" — ghosting through the drawer's own
     * words ("…overnight.1H 1D" in the targets drawer's empty state). The
     * chart's top edge, read once as a drawer opens and on resize while one
     * is out, is where `chartDrawerSurface` turns from solid to glass. */
    _defineProperty(this, "syncPlotTop", () => {
      const node = document.querySelector("[data-chart-surface]");
      if (!node) return;
      const top = Math.max(0, Math.round(node.getBoundingClientRect().top));
      document.documentElement.style.setProperty("--plot-top", `${top}px`);
    });

    /* **The chart as a picture** (27 Sep 2026) — see chart-image.js. The
     * largest SVG on the chart's surface is the chart; the heading names the
     * coin, the last price, the range and when, because a picture of a line
     * without them is a picture of nothing in particular. */
    _defineProperty(this, "handleSaveChartImage", () => {
      if (this._savingImage) return;
      const surface = document.querySelector("[data-chart-surface]");
      const area = (n) => {
        const r = n.getBoundingClientRect();
        return r.width * r.height;
      };
      const svg = surface
        ? Array.from(surface.querySelectorAll("svg")).sort(
            (a, b) => area(b) - area(a),
          )[0]
        : null;
      if (!svg) return;
      const coin = this.state.coinOptions[this.state.coinIndex];
      const period = PERIOD_OPTIONS.find((p) => p.value === this.state.period);
      const history = this.state.valueHistory || [];
      const last = history.length
        ? Number(history[history.length - 1].price)
        : NaN;
      const price = formatTickerPrice(
        last,
        getCurrencySymbol(this.state.currency),
        "full",
        this.state.decimalPlaces,
        this.state.separatorFormat,
      );
      const now = new Date();
      const theme = paletteColors(this.state.activeTheme === "light" ? "light" : "dark", this.state.directionPalette);
      /* A zoomed chart's picture names the window it shows, not the range
         it was zoomed in from (chart-viewport.js). */
      const view = this.chartViewEnabled() ? this.chartViewNow() : null;
      let span = period ? period.label : this.state.period;
      if (view && history.length > 1) {
        const hi = viewMs(history[history.length - 1].time);
        const t1 = view.atNow ? hi : view.t1;
        span = viewWindowText(t1 - (view.t1 - view.t0), t1);
      }
      this._savingImage = true;
      saveChartImage({
        svg,
        title: `${coin} · ${price} · ${span}`,
        note: `PriceTab · ${now.toLocaleString(this.state.language === "auto" ? undefined : this.state.language)} · ${this.state.currency}`,
        colors: theme,
        font: `'Roboto Mono', monospace`,
        fileName: chartImageName(
          coin,
          period ? period.label : this.state.period,
          now,
        ),
      }).then(() => {
        this._savingImage = false;
      });
    });

    /* Keep a headline, or let it go — by its link, which is what the row
       opens and what makes two copies of one story one. */
    _defineProperty(this, "handleNewsSavedToggle", (item) => {
      if (!item || typeof item.url !== "string") return;
      this.setState((prev) => {
        const have = prev.newsSaved || [];
        const next = have.some((s) => s.url === item.url)
          ? have.filter((s) => s.url !== item.url)
          : sanitizeNewsSaved([
              {
                url: item.url,
                title: item.title,
                source: item.source,
                summary: item.summary,
                time: item.time,
                savedAt: Date.now(),
              },
              ...have,
            ]);
        saveNewsSaved(next);
        return { newsSaved: next };
      });
    });

    _defineProperty(this, "handleLogScaleChange", (enabled) => {
      saveLogScale(enabled);
      this.setState({ logScale: enabled });
    });

    _defineProperty(this, "handleQuietChromeChange", (enabled) => {
      saveQuietChrome(enabled);
      this.setState({ quietChrome: enabled });
    });

    /* Apply a mode: a dozen settings in one click.
     *
     * Every value goes through the setting's own handler rather than being
     * written into state here. That is the whole design: each handler already
     * knows what its setting costs — the refresh interval restarts a timer, the
     * chart type sends the next fetch down the candle path, the widget preset
     * kicks off a data load — and a mode that wrote state directly would set
     * the values and skip all of it, leaving a screen that looked switched but
     * behaved as before. The cost is a handful of `setState` calls; React
     * batches them inside one event, and this runs on a click.
     *
     * Anything a mode does not name is left alone. See `APP_MODES`.
     */
    /* Keep what is on screen now, so a mode can hand it back later.
     *
     * Reads the same settings a mode writes — `MODE_SETTING_KEYS` is taken
     * from the modes themselves, so the two can never cover different ground.
     * It saves the arrangement rather than the *mode*: pressing Save while
     * Trader is active stores Trader's settings under Custom, which is right,
     * because what you asked to keep is what is on screen. */
    /* The settings a mode governs, read off state — **one snapshot, two
     * readers**: the row uses it to work out which mode is active, and Save
     * uses it to write the Custom slot. Written twice it drifted immediately:
     * the copy in `handleSaveCustomMode` read `this.state.lastSeen` where the
     * real field is `lastSeenEnabled`, so the slot would have stored
     * `undefined` for it and the restored arrangement would have left that one
     * setting alone while claiming to have restored everything.
     *
     * The `=== true` / `!== false` shapes are the defaults each setting falls
     * back to, and they matter: `activeAppMode` compares by identity, so an
     * `undefined` here matches nothing and the row simply never lights. */
    _defineProperty(this, "modeSnapshot", () => ({
      quietChrome: this.state.quietChrome === true,
      chartType: this.state.chartType,
      chartGrid: this.state.chartGrid === true,
      volumeBars: this.state.volumeBars !== false,
      ohlcEnabled: this.state.ohlcEnabled !== false,
      marketStats: this.state.marketStats !== false,
      lastSeen: this.state.lastSeenEnabled !== false,
      moveHeadlines: this.state.moveHeadlines === true,
      tickerEnabled: this.state.tickerEnabled === true,
      pageTicker: this.state.pageTicker === true,
      newsTicker: this.state.newsTicker === true,
      newsFilter: this.state.newsFilter,
      autoRotate: this.state.autoRotate === true,
      refreshInterval: this.state.refreshInterval,
    }));

    _defineProperty(this, "handleSaveCustomMode", () => {
      saveCustomMode(this.modeSnapshot(), this.state.widgets);
      this.setState({ customMode: loadCustomMode() });
    });

    _defineProperty(this, "handleAppMode", (modeKey) => {
      /* Custom is a slot rather than a recipe — see `CUSTOM_MODE_KEY`. It
       * applies through the very same handler map below, so a restored
       * arrangement leaves the app somewhere you could have reached by hand,
       * which is the rule every other mode already follows. Nothing saved
       * means nothing to apply, and pressing it does nothing rather than
       * writing a set of defaults nobody chose. */
      if (modeKey === "custom") {
        const saved = this.state.customMode;
        if (!saved) return;
        this.applyModeArrangement(saved.settings, saved.widgets);
        return;
      }
      const mode = APP_MODES.find((m) => m.value === modeKey);
      if (!mode) return;
      this.applyModeArrangement(mode.settings, mode.widgets);
    });

    /* Put an arrangement on screen. **One place**, used by the four recipes and
     * by the Custom slot alike — a mode names values and this writes them,
     * always through each setting's own handler, never into state directly, so
     * whatever it applies is somewhere you could have reached by hand and every
     * switch below still tells the truth.
     *
     * `widgetSpec` is either a preset name (what a recipe carries) or an
     * explicit `{ name: on }` map (what the slot carries). They are different
     * shapes because they are different things: a recipe says "the Trader
     * bundle", which may gain a card in a later version, while a saved
     * arrangement says exactly which cards were on when you saved it, and must
     * still say that a version later. */
    _defineProperty(this, "applyModeArrangement", (settings, widgetSpec) => {
      const apply = {
        quietChrome: this.handleQuietChromeChange,
        chartType: this.handleChartTypeChange,
        chartGrid: this.handleChartGridChange,
        volumeBars: this.handleVolumeBarsChange,
        ohlcEnabled: this.handleOhlcChange,
        marketStats: this.handleMarketStatsChange,
        lastSeen: this.handleLastSeenChange,
        moveHeadlines: this.handleMoveHeadlinesChange,
        tickerEnabled: this.handleTickerChange,
        pageTicker: this.handlePageTickerChange,
        newsTicker: this.handleNewsTickerChange,
        newsFilter: this.handleNewsFilterChange,
        autoRotate: this.handleAutoRotateChange,
        refreshInterval: this.handleRefreshIntervalChange,
      };
      for (const key of Object.keys(settings || {})) {
        const handler = apply[key];
        if (handler) handler(settings[key]);
      }
      if (widgetSpec === "none") {
        // The bundles are additive sets; "none" is the empty one, and there is
        // no preset for it because a preset that turns everything off is a
        // reset with a name
        saveWidgetsToStorage({ ...DEFAULT_WIDGETS });
        this.setState(
          { widgets: { ...DEFAULT_WIDGETS } },
          this.ensureCoinSweep,
        );
      } else if (typeof widgetSpec === "string" && widgetSpec) {
        this.handleWidgetPreset(widgetSpec);
      } else if (widgetSpec && typeof widgetSpec === "object") {
        const next = { ...DEFAULT_WIDGETS };
        for (const w of Object.keys(next)) next[w] = Boolean(widgetSpec[w]);
        saveWidgetsToStorage(next);
        this.setState({ widgets: next }, this.ensureCoinSweep);
      }
    });

    _defineProperty(this, "handleMarketStatsChange", (enabled) => {
      saveMarketStats(enabled);
      this.setState({ marketStats: enabled });
    });

    _defineProperty(this, "handleVolumeBarsChange", (enabled) => {
      saveVolumeBars(enabled);
      this.setState({ volumeBars: enabled });
    });

    _defineProperty(this, "handleChartTypeChange", (type) => {
      saveChartType(type);
      this.setState({ chartType: type }, this.fetchData);
    });

    // Turning the readout off also stops the on-hover candle request;
    // price targets keep their own candle lookback either way
    _defineProperty(this, "handleOhlcChange", (enabled) => {
      saveOhlcEnabled(enabled);
      this.setState({
        ohlcEnabled: enabled,
        ohlcData: enabled ? this.state.ohlcData : null,
      });
    });

    // Hiding the line keeps recording baselines, so switching it back on
    // still has a previous visit to compare against
    _defineProperty(this, "handleLastSeenChange", (enabled) => {
      saveLastSeenEnabled(enabled);
      this.setState({ lastSeenEnabled: enabled });
    });

    _defineProperty(this, "handleCurrencyChange", (newCurrency) => {
      saveCurrencyToStorage(newCurrency);
      // Candles are priced in the old currency — drop them so the chart
      // can't keep drawing them, and so the refetch decides availability
      // for the new one (Coinbase only quotes a few)
      this._ohlcKey = null;
      this.setState(
        {
          currency: newCurrency,
          ohlcData:
            this.state.chartType === "candles" ? this.state.ohlcData : null,
        },
        () => {
          // Refetch data with new currency
          this.fetchData();
          // Portfolio values are currency-specific — refresh if it's open
          if (this.state.showPortfolio) {
            this.setState({ portfolioReady: false }, this.fetchPortfolioPrices);
          }
        },
      );
    });

    _defineProperty(this, "handleTickerChange", (enabled) => {
      saveTickerToStorage(enabled);
      this.tickerScrollPos = 0;
      this.setState({ tickerEnabled: enabled }, () => {
        if (enabled) {
          this.buildTickerText();
          this.startTickerInterval();
          this.prefetchTopCoins(); // warm all rotation coins for the ticker
        } else {
          this.stopTickerInterval();
          // Reset to current coin title
          this.setTabTitle(
            this.state.coinOptions,
            this.state.coinIndex,
            this.state.currentValue,
            this.state.valueHistory,
          );
        }
      });
    });

    _defineProperty(this, "handleTickerFormatChange", (format) => {
      saveTickerFormatToStorage(format);
      this.setState({ tickerFormat: format }, () => {
        if (this.state.tickerEnabled) {
          this.buildTickerText();
        }
      });
    });

    _defineProperty(this, "handleOnline", () => {
      this.setState({ isOffline: false });
      /* A new network is a new chance: whatever the ladder had climbed to was
       * about the old one. Reset before fetching, or the first attempt on a
       * working connection would still be followed by a five-minute wait. */
      this.fetchFailures = 0;
      // Refetch data when coming back online
      this.fetchData();
    });

    _defineProperty(this, "handleOffline", () => {
      this.setState({ isOffline: true });
    });

    _defineProperty(this, "handleRemoveInvalidCoin", () => {
      const { invalidCoin } = this.state;
      if (invalidCoin) {
        this.handleRemoveCoinOption(invalidCoin);
        this.setState({ invalidCoin: null });
      }
    });

    _defineProperty(this, "handleDismissInvalidCoin", () => {
      this.setState({ invalidCoin: null });
      // Cycle to next coin
      this.cycleCoinIndex();
    });

    // Dismiss also covers the "Rate" click — either way, never ask again
    // (shares the dismissed flag with the settings-panel reminder bar)
    _defineProperty(this, "handleRateAskDismiss", () => {
      saveRatePromptDismissed();
      this.setState({ showRateAsk: false });
    });

    _defineProperty(this, "prefetchTopCoins", async () => {
      // Re-entrancy guard: this can now also fire when the ticker or
      // auto-rotate gets enabled from settings, not just once at mount
      if (this._prefetching) {
        return;
      }
      this._prefetching = true;
      try {
        await this.prefetchTopCoinsCore();
      } finally {
        this._prefetching = false;
      }
    });

    _defineProperty(this, "prefetchTopCoinsCore", async () => {
      const { coinOptions, period, currency, coinIndex } = this.state;
      const topCoins = coinOptions.slice(0, MAX_CACHED_COINS);

      // Skip the first coin (already loaded)
      for (let i = 1; i < topCoins.length; i++) {
        const coin = topCoins[i];

        // Skip if it's the currently displayed coin
        if (i === coinIndex) continue;

        try {
          // Wait 500ms between requests to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Fetch and cache this coin's data
          await fetchCurrentValue(coin, currency, null, true, coinOptions);
          await fetchValueHistory(
            coin,
            period,
            currency,
            null,
            true,
            coinOptions,
          );

          // Throttled ticker update (max once per 2 seconds during prefetch)
          if (this.state.tickerEnabled && !this.tickerUpdatePending) {
            this.tickerUpdatePending = true;
            setTimeout(() => {
              this.buildTickerText();
              this.tickerUpdatePending = false;
            }, 2000);
          }
        } catch (error) {
          // Continue with next coin even if this one fails
        }
      }

      // Final ticker update after prefetch completes
      if (this.state.tickerEnabled) {
        this.buildTickerText();
      }
    });

    _defineProperty(this, "handleAddCoinOption", (symbol) => {
      const normalized = (symbol || "").trim().toUpperCase();

      if (!normalized) {
        return { success: false, reason: "empty" };
      }

      if (!/^[A-Z0-9]{2,10}$/.test(normalized)) {
        return { success: false, reason: "format" };
      }

      if (!SUGGESTED_COINS.includes(normalized)) {
        return { success: false, reason: "unsupported" };
      }

      if (this.state.coinOptions.includes(normalized)) {
        return { success: false, reason: "duplicate" };
      }

      if (this.state.coinOptions.length >= MAX_COINS) {
        return { success: false, reason: "limit" };
      }

      this.setState((prevState) => {
        const newCoinOptions = [...prevState.coinOptions, normalized];
        saveCoinOptionsToStorage(newCoinOptions);
        return { coinOptions: newCoinOptions };
      });

      return { success: true };
    });

    _defineProperty(this, "handleRemoveCoinOption", (symbol) => {
      const normalized = (symbol || "").trim().toUpperCase();
      const prevActive = this.state.coinOptions[this.state.coinIndex];

      this.setState(
        (prevState) => {
          const activeCoin = prevState.coinOptions[prevState.coinIndex];
          const filtered = prevState.coinOptions.filter(
            (c) => c !== normalized,
          );
          // Keep the same coin displayed; only move if it was the one removed
          let nextIndex = filtered.indexOf(activeCoin);
          if (nextIndex === -1) {
            nextIndex = Math.min(prevState.coinIndex, filtered.length - 1);
          }
          saveCoinOptionsToStorage(filtered);
          return {
            coinOptions: filtered,
            coinIndex: Math.max(0, nextIndex),
          };
        },
        () => {
          this.fetchData();
          // Only refresh widgets if removal changed which coin is displayed
          if (this.state.coinOptions[this.state.coinIndex] !== prevActive) {
            this.fetchWidgets();
          }
        },
      );
    });

    _defineProperty(this, "handleResetCoins", () => {
      const defaults = [...DEFAULT_COIN_OPTIONS];
      saveCoinOptionsToStorage(defaults);
      this.setState({ coinOptions: defaults, coinIndex: 0 }, this.fetchData);
    });

    _defineProperty(this, "handleRestoreCoins", (coins) => {
      if (!Array.isArray(coins)) {
        return;
      }
      const restored = coins
        .filter(
          (coin) => typeof coin === "string" && SUGGESTED_COINS.includes(coin),
        )
        .slice(0, MAX_COINS);
      if (!restored.length) {
        return;
      }
      saveCoinOptionsToStorage(restored);
      this.setState({ coinOptions: restored, coinIndex: 0 }, this.fetchData);
    });

    _defineProperty(this, "handleReorderCoinOption", (source, target) => {
      if (!source || !target || source === target) {
        return;
      }

      this.setState((prevState) => {
        const list = [...prevState.coinOptions];
        const fromIndex = list.indexOf(source);
        const toIndex = list.indexOf(target);

        if (fromIndex === -1 || toIndex === -1) {
          return null;
        }

        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);

        const activeCoin = prevState.coinOptions[prevState.coinIndex];
        const nextActiveIndex = Math.max(0, list.indexOf(activeCoin));

        saveCoinOptionsToStorage(list);
        return {
          coinOptions: list,
          coinIndex: nextActiveIndex,
        };
      });
    });

    // Ticker interval methods
    // Build the full ticker text from all coins
    _defineProperty(this, "buildTickerText", () => {
      const {
        coinOptions,
        currency,
        period,
        tickerFormat,
        decimalPlaces,
        separatorFormat,
      } = this.state;
      if (!coinOptions || coinOptions.length === 0) {
        this.setState({ tickerText: "" });
        return;
      }

      const curr = currency || DEFAULT_CURRENCY;
      const currencySymbol = getCurrencySymbol(curr);
      const parts = [];

      for (const coin of coinOptions) {
        const cachedSpot = getCachedData(coin, "current", curr, "spot");
        const cachedHistory = getCachedData(coin, period, curr, "history");

        let priceStr = "—";
        let percentStr = "";

        if (cachedSpot && cachedSpot.data) {
          const price = cachedSpot.data;
          priceStr = formatTickerPrice(
            price,
            currencySymbol,
            tickerFormat,
            decimalPlaces,
            separatorFormat,
          );

          if (
            cachedHistory &&
            cachedHistory.data &&
            cachedHistory.data.length > 0
          ) {
            const percentDelta = derivePercentDelta(price, cachedHistory.data);
            if (typeof percentDelta === "number") {
              const sign = percentDelta >= 0 ? "+" : "";
              percentStr = ` ${sign}${percentDelta.toFixed(1)}%`;
            }
          }
        }

        parts.push(`${coin} ${priceStr}${percentStr}`);
      }

      // Join with separator and add padding for smooth loop
      const tickerText = parts.join("  ●  ") + "  ●  ";
      this.tickerScrollPos = 0;
      this.setState({ tickerText });
    });

    _defineProperty(this, "startTickerInterval", () => {
      this.stopTickerInterval();
      // Build initial ticker text
      this.buildTickerText();
      // Start scrolling interval
      this.tickerInterval = setInterval(() => {
        this.scrollTickerTitle();
      }, TICKER_SCROLL_INTERVAL);
      // Refresh ticker text every 30 seconds to update prices
      this.tickerRefreshInterval = setInterval(() => {
        this.buildTickerText();
      }, 30000);
    });

    _defineProperty(this, "stopTickerInterval", () => {
      if (this.tickerInterval) {
        clearInterval(this.tickerInterval);
        this.tickerInterval = null;
      }
      if (this.tickerRefreshInterval) {
        clearInterval(this.tickerRefreshInterval);
        this.tickerRefreshInterval = null;
      }
    });

    /* ── the tab title has one owner at a time ──
     *
     * Three things want to write it: the price readout, the scrolling ticker
     * (every 250ms), and a target that has just been hit. Without a single
     * gate the ticker simply overwrites an announcement a quarter-second
     * after it appears, so the announcement claims the title and everything
     * else stands down while it holds it.
     */
    _defineProperty(this, "setTabTitle", (...args) => {
      if (this._alertTitleActive) return;
      updateTabTitle(...args);
    });

    _defineProperty(this, "scrollTickerTitle", () => {
      if (this._alertTitleActive) return;
      const { tickerText } = this.state;
      if (!tickerText) {
        document.title = msg("app_new_tab", "New Tab");
        return;
      }

      const displayLength = 50;
      const textLength = tickerText.length;

      // Use slice for better performance (no loop, no string concatenation)
      // Double the text for seamless wrap-around
      const doubledText = tickerText + tickerText;
      const visibleText = doubledText.slice(
        this.tickerScrollPos,
        this.tickerScrollPos + displayLength,
      );

      document.title = visibleText;

      // Update scroll position without setState (avoids re-render every 250ms)
      this.tickerScrollPos =
        (this.tickerScrollPos + TICKER_SCROLL_CHARS) % textLength;
    });
  }

  componentDidMount() {
    this.fetchData();
    /* Ask Chrome once what is granted, whether or not any news is wanted.
     * `fetchNewsData` also records this, but it only runs when something wants
     * the feed — and "what happened here?" wants the *archive* without wanting
     * the feed, so on a tab with the panel and the ticker both off the
     * newsroom archive would never be used. Local call, no network. */
    // No unmount guard: this is the root component and it lives as long as
    // the tab does, so there is no path where this resolves after teardown
    grantedNewsSources().then((granted) =>
      this.setState({ newsGranted: granted }),
    );
    /* Same rule for the alarm: the switch says what is wanted and Chrome says
       what is possible, so the row can tell "off" from "on but revoked". */
    notifyPermissionHeld().then((held) =>
      this.setState({ alarmGranted: held }),
    );
    // Set initial tab title
    this.setTabTitle(
      this.state.coinOptions,
      this.state.coinIndex,
      this.state.currentValue,
      this.state.valueHistory,
    );

    // Set initial body theme
    const colors =
      this.state.activeTheme === "light" ? lightColors : darkColors;
    document.body.style.backgroundColor = colors.bg;
    document.body.style.color = colors.text;

    // Listen for system theme changes
    this.mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    this.handleSystemThemeChange = (e) => {
      // Only update if user has 'auto' theme preference
      if (this.state.themePreference === "auto") {
        this.setState({ activeTheme: e.matches ? "light" : "dark" });
      }
    };

    // Listen for system theme changes (for auto mode)
    this.mediaQuery.addEventListener("change", this.handleSystemThemeChange);

    // Listen for online/offline events
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);

    // Start cache cleanup interval (every 2 minutes, check for entries unused for 10+ minutes)
    this.cacheCleanupInterval = setInterval(cleanupCache, 120000); // 2 minutes

    // Prefetch only feeds the tab-title ticker and auto-rotate — manual coin
    // switching paints instantly from the persisted cache, so when neither
    // is on, skip the ~18 warm-up requests entirely
    if (this.state.tickerEnabled || this.state.autoRotate) {
      this.prefetchTimer = setTimeout(() => this.prefetchTopCoins(), 2000);
    }

    // One-time rating ask: only after RATE_PROMPT_DELAY_MS of use, and this
    // tab is the only one that ever shows it (the shown flag is persisted
    // immediately, so an ignored card doesn't reappear on every new tab)
    if (
      !loadRatePromptShown() &&
      !loadRatePromptDismissed() &&
      Date.now() - getOrInitFirstUse() >= RATE_PROMPT_DELAY_MS
    ) {
      saveRatePromptShown();
      this.setState({ showRateAsk: true });
    }

    // Resume paused polling as soon as the tab becomes visible again
    this.handleVisibilityChange = () => {
      // The announcement alternates only while the tab is away; arriving or
      // leaving changes which of those it should be doing
      this.syncAlertTitle();
      if (document.hidden) {
        return;
      }
      /* Refresh what is on screen if it is out of date — not only if a tick
       * happened to fire while you were away.
       *
       * The condition used to be `pendingVisibilityRefresh`, set when the
       * interval fired on a hidden tab. Chrome freezes timers in background
       * tabs, so on the tab this extension actually lives in — one you opened
       * and left — the tick often never fires at all, the flag is never set,
       * and coming back showed the prices from whenever you left until the
       * next interval, which can be minutes. "Did we try while you were away"
       * is the wrong question; "is what you are looking at stale" is the one
       * the person asked. */
      const age = Date.now() - (this.lastFetchAt || 0);
      if (this.pendingVisibilityRefresh || age >= this.state.refreshInterval) {
        this.pendingVisibilityRefresh = false;
        this.fetchData();
      }
      if (this.pendingWidgetRefresh) {
        this.pendingWidgetRefresh = false;
        this.fetchWidgets();
      }
      if (this.pendingPageTickerRefresh) {
        this.pendingPageTickerRefresh = false;
        this.fetchPageTickerData();
      }
      /* The news too: a background tab's interval is frozen or skipped, so
         coming back showed the headlines from whenever you left until the
         next tick, up to ten minutes on. Asked as a poll — the cache answers
         while it is young, so switching tabs costs nothing. */
      if (this.newsWanted()) this.fetchNewsData({ poll: true });
    };
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    // A target armed in a previous session needs the background check running
    // from the start, not only once something changes
    this.syncAlertBackgroundPoll();

    // Start ticker interval if enabled (delay 3s for prices to load)
    if (this.state.tickerEnabled) {
      this.tickerStartTimer = setTimeout(() => {
        this.startTickerInterval();
      }, 3000);
    }

    // Start the all-coin sweep if the ticker OR the watchlist / top-movers
    // widgets need it (delay 3s for the initial chart load to settle)
    this._sweepScope = this.coinSweepScope();
    if (this.needsCoinSweep()) {
      this.pageTickerStartTimer = setTimeout(() => {
        this.fetchPageTickerData();
      }, 3000);
      this.pageTickerRefreshInterval = setInterval(
        () => this.fetchPageTickerData(),
        PAGE_TICKER_REFRESH_MS,
      );
    }

    // Fetch widget data if any widgets are enabled
    this.fetchWidgets();
    // Refresh widgets every 5 minutes (skipped while the tab is hidden)
    this.widgetRefreshInterval = setInterval(() => this.fetchWidgets(), 300000);

    // Auto-rotate through coins if enabled
    this.startAutoRotate();

    // News ticker row if enabled
    this.startNewsTicker();

    // Keyboard shortcuts (←/→ coins, 1-6 periods, S/Esc settings, R refresh)
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("mousedown", this.spineOutside);
    document.addEventListener("pointermove", this.pullProximity, {
      passive: true,
    });
    // The companion, when it was left on
    this.syncCompanion();
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.syncPlotTop);
    document.removeEventListener("mousedown", this.spineOutside);
    document.removeEventListener("pointermove", this.pullProximity);
    this.chartSpine.clear();
    this.screenSpine.clear();
    if (this.widgetsDrag && this.widgetsDrag.frame)
      cancelAnimationFrame(this.widgetsDrag.frame);
    this.widgetsDrag = null;
    clearTimeout(this._swapT);
    clearTimeout(this._swapEndT);
    if (this._tickerObserver) {
      this._tickerObserver.disconnect();
      this._tickerObserver = null;
    }
    clearTimeout(this.fetchTimeout);
    clearTimeout(this.skeletonTimer);
    clearTimeout(this.prefetchTimer);
    clearTimeout(this.retryTimer);
    clearTimeout(this.slowLoadTimer);
    clearTimeout(this.priceFlashTimer);
    clearTimeout(this.tickerStartTimer);
    clearTimeout(this.pageTickerStartTimer);
    clearInterval(this.cacheCleanupInterval);
    clearInterval(this.widgetRefreshInterval);
    clearInterval(this.pageTickerRefreshInterval);
    clearInterval(this.portfolioInterval);
    clearInterval(this.alertTitleTimer);
    clearInterval(this.alertPollInterval);
    clearInterval(this.practiceQuoteTimer);
    this.stopTickerInterval();
    this.stopAutoRotate();
    this.stopNewsTicker();
    document.removeEventListener("mousedown", this.handleMoveOutside);
    document.removeEventListener("mousedown", this.handleDockOutside);
    // A widget answer waiting for the end of the frame — see `queueWidgetData`
    if (this._widgetFlush) cancelAnimationFrame(this._widgetFlush);

    // Cancel any ongoing requests
    if (this.abortController) {
      this.abortController.abort();
    }

    document.body.style.overflow = "";
    // Reset tab title on unmount
    document.title = msg("app_new_tab", "New Tab");

    // Clean up theme listener
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener(
        "change",
        this.handleSystemThemeChange,
      );
    }

    // Clean up online/offline listeners
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);

    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    for (const t of this.wonCallTimers.values()) clearTimeout(t);
    this.wonCallTimers.clear();

    document.removeEventListener("keydown", this.handleKeyDown);
  }

  /* The perpetual's series for the page's chart. Keyed on what was asked
     for, so an answer that arrives after the coin or range has moved on is
     dropped rather than drawn under the wrong market. */
  fetchPracticeSeries() {
    const coin = this.state.coinOptions[this.state.coinIndex];
    const period = this.state.period;
    const want = `${coin}:${period}`;
    if (!this.state.practiceSeries || this.state.practiceSeries.key !== want) {
      this.setState({ practiceSeries: { key: want, data: null } });
    }
    fetchPerpSeries(coin, period).then((data) => {
      const now = `${this.state.coinOptions[this.state.coinIndex]}:${this.state.period}`;
      if (now === want) this.setState({ practiceSeries: { key: want, data } });
    });
  }

  componentDidUpdate(_prevProps, prevState) {
    // The chart's window lets go with the chart it was set on
    this.syncChartView(prevState);

    /* Where the chart starts, read as a drawer comes out — see
       `chartDrawerSurface`, whose glass begins there. */
    const drawerNow = this.leftDrawer();
    const drawerWas =
      prevState.showWidgetsDrawer === true ||
      prevState.showChartSettings === true ||
      prevState.alertsView === "targets" ||
      prevState.alertsView === "calls";
    if (drawerNow && !drawerWas) {
      this.syncPlotTop();
      window.addEventListener("resize", this.syncPlotTop);
    } else if (!drawerNow && drawerWas) {
      window.removeEventListener("resize", this.syncPlotTop);
    }

    /* The companion follows the coin on screen. */
    if (
      (this.state.companion === true ||
        (this.state.indicatorOverlays || []).length > 0 ||
        (this.state.chartStudies || []).some((k) => CHART_STUDIES_DAILY.includes(k))) &&
      (prevState.coinIndex !== this.state.coinIndex ||
        prevState.coinOptions !== this.state.coinOptions)
    ) {
      this.syncCompanion();
    }

    /* The click-away listener lives exactly as long as the card does. Bound on
     * mousedown so it cannot catch the click that opened the card — see
     * `handleMoveOutside`. */
    const wasOpen = Boolean(prevState.openMove);
    const isOpen = Boolean(this.state.openMove);
    if (isOpen !== wasOpen) {
      const bind = isOpen ? "addEventListener" : "removeEventListener";
      document[bind]("mousedown", this.handleMoveOutside);
    }

    /* The widget's own click-away, on the same terms as the move card's. */
    if (Boolean(prevState.dockOpen) !== Boolean(this.state.dockOpen)) {
      const bind = this.state.dockOpen
        ? "addEventListener"
        : "removeEventListener";
      document[bind]("mousedown", this.handleDockOutside);
    }

    /* **An armed share cannot outlive the contract it was about to close.**
       A liquidation, a stop or a take-profit can settle the position while the
       widget is open and a share is asking — and the question would then be
       about something that is not there. `dockReduce` refuses a missing
       position, so nothing wrong happens; what is wrong is the screen asking. */
    if (this.state.dockArmed != null) {
      const coin = this.state.coinOptions[this.state.coinIndex];
      /* Nothing left on this market disarms the strip — asked of the coin,
         because the strip is about the market you are looking at. */
      if (!practiceForCoin(this.state.practice, coin).length) {
        this.setState({ dockArmed: null });
      }
    }

    // A hit arriving, or the last banner being dismissed, is what starts and
    // stops the announcement
    if (prevState.firedAlerts !== this.state.firedAlerts) {
      this.syncAlertTitle();
    }
    /* Every announced win gets its own dismissal timer, armed once. Here
     * rather than where the win is found, because a card can also arrive from
     * a settle that happened on load — one place that sees them all. */
    if (prevState.wonCalls !== this.state.wonCalls) {
      for (const c of this.state.wonCalls) this.armWonCallDismiss(c.id);
    }
    // Setting a first target, or the last one firing, decides whether there is
    // anything left to check for while the tab is away
    if (prevState.alerts !== this.state.alerts) {
      this.syncAlertBackgroundPoll();
    }

    /* A new series for this coin is the moment a due call can be answered —
     * that is what "next time you open a tab" means in practice, and it costs
     * no request because the answer is inside the data just drawn.
     *
     * It runs with the feature switched off too. Settling used to be gated on
     * `predict`, so turning calls off left every open call frozen mid-flight:
     * come back a week later, switch them on, and a pile of them settle at
     * once against whatever series happens to be on screen — targets that had
     * long since scrolled off the range came back "expired" and were dropped
     * without ever having been judged. A call is a claim someone already made;
     * whether they are still looking at the board does not change whether it
     * came true. What the switch governs is the *board* — drawing, placing,
     * and being told — which is why a hit settled with calls off is celebrated
     * on the chart and never announced in the toast stack. */
    if (prevState.valueHistory !== this.state.valueHistory) {
      this.settleDueCalls();
      /* And the practice account — on the perpetual's own price, which this
         asks for first (`refreshPracticeQuotes`). Only when something is
         held or resting; nothing is fetched for an account with nothing on. */
      this.refreshPracticeQuotes(true);
    }

    if (
      prevState.showSettings !== this.state.showSettings ||
      prevState.showPortfolio !== this.state.showPortfolio
    ) {
      const lock = this.state.showSettings || this.state.showPortfolio;
      document.body.style.overflow = lock ? "hidden" : "";
    }

    // Update body background and text color when theme changes
    if (prevState.activeTheme !== this.state.activeTheme) {
      const colors =
        this.state.activeTheme === "light" ? lightColors : darkColors;
      document.body.style.backgroundColor = colors.bg;
      document.body.style.color = colors.text;
    }

    /* **The derivatives page quotes the perpetual live.** While it is open,
     * its market and every market with something on it are asked for every
     * `ORDER_BOOK_TTL` (the ticker's own cache, so no tick costs twice); the
     * chart is the contract's own series for the range on screen. Closed, the
     * account is marked with the chart's refresh as before. */
    const onPage = this.state.alertsView === "futures";
    const wasOnPage = prevState.alertsView === "futures";
    if (onPage && !wasOnPage) {
      clearInterval(this.practiceQuoteTimer);
      this.practiceQuoteTimer = setInterval(
        () => this.refreshPracticeQuotes(false),
        ORDER_BOOK_TTL,
      );
      this.refreshPracticeQuotes(true);
    } else if (!onPage && wasOnPage) {
      clearInterval(this.practiceQuoteTimer);
      this.practiceQuoteTimer = null;
    }
    if (
      onPage &&
      (!wasOnPage ||
        prevState.coinIndex !== this.state.coinIndex ||
        prevState.coinOptions !== this.state.coinOptions ||
        prevState.period !== this.state.period)
    ) {
      if (wasOnPage && prevState.coinIndex !== this.state.coinIndex)
        this.refreshPracticeQuotes();
      this.fetchPracticeSeries();
    }

    /* Keep the comparison overlay honest as the chart moves under it. A new
     * range or currency means the compared coin needs re-fetching for it, and
     * switching onto the compared coin itself ends the comparison — a coin
     * plotted against itself is a flat line at zero. */
    if (this.state.compareCoin) {
      const active = this.state.coinOptions[this.state.coinIndex];
      if (active === this.state.compareCoin) {
        this.clearCompare();
      } else if (
        prevState.period !== this.state.period ||
        prevState.currency !== this.state.currency
      ) {
        this.setState({ compareHistory: null }, this.fetchCompareHistory);
      }
    }
  }

  /* The card a mark opens.
   *
   * What it says about the move is a fact taken off the series. What it says
   * about the headlines is deliberately weaker than it looks: they are the
   * stories published around that date, and the note at the foot says so in
   * as many words. A feature that puts a headline next to a price move is one
   * sentence away from claiming a cause it cannot know, and the sentence is
   * the one that is missing, not one that is there.
   */
  renderMoveCard() {
    const open = this.state.openMove;
    if (!open || this.state.moveNews !== true || this.state.compareCoin) {
      return null;
    }
    const items = open.items;
    /* The biggest move in the cluster, not the net of them.
     *
     * A spike and its recovery are two unusual steps in the same place, so
     * they share one mark — and their *net* is close to nothing. The card said
     * "rose 1.0% across 2 moves" about a chart that had visibly fallen six per
     * cent and come back, which is the one number on the card nobody could
     * have read off the screen. The event is the spike; the count says there
     * was more than one step to it. */
    const biggest = items.reduce((a, b) =>
      Math.abs(b.z) > Math.abs(a.z) ? b : a,
    );
    const pct = biggest.pct;
    const up = pct >= 0;
    const activeCoin =
      this.state.coinOptions[this.state.coinIndex] || this.state.coinOptions[0];
    const when = new Date(biggest.time).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const headlines = this.state.moveHeadlinesFor;
    /* **What named this coin, and what merely happened at the same time.**
     *
     * Split here rather than in the state, so the two lists cannot go stale
     * against each other, and through the same `newsMentionsCoin` the ticker
     * and the panel use. The window is not applied a second time — the list
     * is already the window's — so the `null` bounds ask only "which of these
     * is about this coin". */
    const split = headlines
      ? newsAboutCoin(headlines, activeCoin, null, null, this.state.newsSources)
      : null;
    /* **How rare a step that was, and what followed it.** Both are read off
       the series already drawn, so both cost nothing — and both are absent
       rather than blank when the series cannot answer: a chart too short to
       have a distribution, or a mark that is the newest thing on it. */
    /* `valueHistory` — the series this component actually holds. There is no
       `priceHistory` on this state despite the name appearing in the guide,
       and reading one gives `undefined`, which both helpers answer with a
       polite null: two lines that simply never drew. */
    const rarity = moveRarity(this.state.valueHistory, biggest);
    const after = moveAftermath(this.state.valueHistory, biggest);
    /* Anchored to the mark in both axes, and clamped so it is always whole on
     * screen: half the card either side, and below the mark unless there is no
     * room, in which case above it. A card pinned to a fixed height would make
     * the reader carry the date back to the chart to find out which of five
     * triangles it belongs to. `MOVE_CARD_H` is an estimate rather than a
     * measurement — the card is not on screen yet when this runs, and being a
     * few pixels out only changes when it flips to the other side. */
    const half = Math.min(208, window.innerWidth / 2 - 16);
    const x = Math.max(
      half + 16,
      Math.min(window.innerWidth - half - 16, open.x),
    );
    /* Measured 10 Sep 2026 with the two readings and both headline groups on
       it: 224px at its shortest and 277px at its longest, so the estimate
       moved up with the content it is estimating. */
    const MOVE_CARD_H = 290;
    const below = (open.y || 0) + 16;
    const y =
      below + MOVE_CARD_H > window.innerHeight - 12
        ? Math.max(12, (open.y || 0) - MOVE_CARD_H - 12)
        : below;

    return React.createElement(
      MoveCard,
      {
        x,
        y,
        key: open.token,
        // v3 styled-components: the DOM node comes back through `innerRef`
        innerRef: (n) => (this._moveCardNode = n),
      },
      React.createElement(
        MoveCardHead,
        null,
        React.createElement(
          MoveCardMove,
          { up },
          `${activeCoin} ${up ? "rose" : "fell"} ${Math.abs(pct).toFixed(1)}%`,
        ),
        React.createElement(
          MoveCardClose,
          { onClick: this.closeMove, "aria-label": msg("app_close", "Close") },
          "×",
        ),
      ),
      React.createElement(
        MoveCardWhen,
        null,
        when +
          (items.length > 1 ? ` · ${items.length} unusual moves here` : ""),
      ),
      /* **How unusual, and what happened next** — the two questions a mark
         raises that the headlines cannot answer, and the series can. */
      rarity != null
        ? React.createElement(
            MoveCardStat,
            null,
            rarity <= 0.01
              ? msg(
                  "app_move_rare_top",
                  "Bigger than 99% of steps on this chart",
                )
              : msg(
                  "app_move_rare",
                  "Bigger than $1% of steps on this chart",
                  String(Math.max(1, Math.round((1 - rarity) * 100))),
                ),
          )
        : null,
      after
        ? React.createElement(
            MoveCardStat,
            null,
            /* **"+0.0% over the next 30m" is not a reading**, it is a slot
               being filled. Under a tenth of a per cent the honest sentence
               is that nothing happened, and it is shorter. */
            Math.abs(after.pct) < 0.1
              ? msg(
                  "app_move_after_flat",
                  "Little changed over the next $1",
                  spanText(after.ms),
                )
              : after.gaveBack
                ? msg(
                    "app_move_after_back",
                    "Gave back $1% over the next $2",
                    Math.abs(after.pct).toFixed(1),
                    spanText(after.ms),
                  )
                : msg(
                    "app_move_after",
                    "$1% over the next $2",
                    signedFixed(after.pct, 1),
                    spanText(after.ms),
                  ),
          )
        : null,
      headlines === null
        ? React.createElement(
            MoveCardWhen,
            null,
            msg("app_looking_headlines", "Looking for headlines…"),
          )
        : headlines.length
          ? React.createElement(
              Fragment,
              null,
              /* **What is about this coin is said to be about this coin.**
                 The card used to show the window's first four headlines under
                 one heading, whatever they were about — so a card headed "XRP
                 fell 7.2%" carried four stories about something else, and the
                 reader had to notice that for themselves. */
              split.about.length
                ? React.createElement(
                    MoveCardList,
                    null,
                    ...split.about
                      .slice(0, MOVE_CARD_ABOUT_MAX)
                      .map((item, i) =>
                        React.createElement(
                          MoveCardItem,
                          {
                            key: `mv-a-${i}`,
                            href: item.url || undefined,
                            target: "_blank",
                            rel: "noopener noreferrer",
                          },
                          React.createElement(
                            MoveCardSource,
                            null,
                            item.source,
                          ),
                          item.title,
                        ),
                      ),
                  )
                : React.createElement(
                    MoveCardWhen,
                    null,
                    msg(
                      "app_move_none_coin",
                      "Nothing about $1 in this window.",
                      activeCoin,
                    ),
                  ),
              /* The rest, under a heading that says what they are: published
                 in the same hours, about something else. Absent rather than
                 an empty heading. */
              split.other.length
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      MoveCardGroup,
                      null,
                      msg("app_move_elsewhere", "Elsewhere that day"),
                    ),
                    React.createElement(
                      MoveCardList,
                      null,
                      ...split.other
                        .slice(0, MOVE_CARD_OTHER_MAX)
                        .map((item, i) =>
                          React.createElement(
                            MoveCardItem,
                            {
                              key: `mv-o-${i}`,
                              href: item.url || undefined,
                              target: "_blank",
                              rel: "noopener noreferrer",
                            },
                            React.createElement(
                              MoveCardSource,
                              null,
                              item.source,
                            ),
                            item.title,
                          ),
                        ),
                    ),
                  )
                : null,
            )
          : React.createElement(
              MoveCardWhen,
              null,
              msg("app_no_archive", "Nothing in the archive for those days."),
            ),
      /* To the panel, where the same feed can be searched, narrowed and read
         in full — the mark answers about one window, the panel answers about
         everything. */
      React.createElement(
        MoveCardGo,
        {
          onClick: () => {
            this.closeMove();
            this.toggleNews();
          },
        },
        msg("app_move_all_news", "Open the news panel"),
      ),
      React.createElement(
        MoveCardNote,
        null,
        msg(
          "app_move_note",
          "Headlines published around this move — what was being written at the time, not why the price moved.",
        ),
      ),
    );
  }

  render() {
    const {
      coinIndex,
      coinOptions,
      currentValue,
      period,
      valueHistory,
      showSettings,
      showPortfolio,
      showRateAsk,
      portfolio,
      portfolioPrices,
      portfolioReady,
      themePreference,
      activeTheme,
      refreshInterval,
      decimalPlaces,
      separatorFormat,
      currency,
      isOffline,
      showSkeleton,
      invalidCoin,
      apiError,
      widgets,
      fearGreedData,
      marketOverviewData,
      halvingData,
      ethGasData,
      btcFeesData,
      mempoolData,
      difficultyData,
      rsiValue,
      fundingRateData,
      longShortData,
      openInterestData,
      liquidationsData,
      altcoinSeasonData,
      watchlistData,
      topMoversData,
      widgetOrder,
      dragWidget,
    } = this.state;
    const activeCoin = coinOptions[coinIndex] || coinOptions[0] || "BTC";
    /* There is a drawing on screen, so a switch is a transition and not a
     * first paint: the skeleton stands down for the chart and the range
     * switcher, and the chart is left to morph into the new series. The
     * price readout still greys out — those figures belong to the coin you
     * just left, and the one thing this must not do is print them under the
     * new coin's name. */
    const hasChart = Boolean(valueHistory && valueHistory.length);
    const chartStale = showSkeleton && hasChart;
    /* How old the drawn prices are, said on the chart — only while a fetch
     * is failing or the network is gone, and only once they are older than
     * one refresh would have made them. */
    const pricesAge =
      (apiError || isOffline) && hasChart && this.state.pricesAt
        ? Date.now() - this.state.pricesAt
        : 0;
    const pricesAgeNote =
      pricesAge >= Math.max(PRICES_STALE_MIN_MS, refreshInterval)
        ? pricesAgeText(pricesAge)
        : "";
    const periodOption = PERIOD_OPTIONS.find((o) => o.value === period);
    const periodLabel = periodOption ? periodOption.label : "";
    const tickerVisible =
      this.state.pageTicker &&
      this.state.pageTickerReady &&
      !this.state.pageTickerCollapsed;
    const tickerPosition =
      this.state.pageTickerPosition || DEFAULT_PAGE_TICKER_POSITION;
    const tickerTop = tickerVisible && tickerPosition === "top";
    /* Computed once for the render rather than inside the button's props: it
     * is a pass over the feed, and the button is created inside a chain of
     * conditions that would otherwise decide whether it runs. */
    const unseenNews = this.hasUnseenCoinNews();
    const tickerBottom = tickerVisible && tickerPosition === "bottom";
    /* One contract, computed once for both the chart's levels and the small
       control that leads back to Futures. Comparison has a percent axis, so
       both stand down together rather than a dock promising levels the chart
       cannot honestly draw. */
    const activePractice = this.state.compareCoin
      ? null
      : this.chartPosition(activeCoin);

    /* One of two objects, never a third.
     *
     * This used to be `{ ...theme, color: colors }` — a new object on every
     * render, which is a new styled-components context value, which is a new
     * theme reaching every styled descendant *and* `LineBase` through
     * `withTheme`. `PureComponent` cannot help: the prop genuinely changed.
     * Measured: five `setState({ tickerText })` calls — the scrolling tab
     * title, which touches nothing on the chart — produced five full
     * `LineBase` renders. There are only ever two palettes, so there only ever
     * need to be two objects, and switching theme still hands over a new one. */
    const currentTheme = (THEMES[this.state.directionPalette] || THEMES.classic)[
      activeTheme === "light" ? "light" : "dark"
    ];

    return React.createElement(
      ThemeProvider,
      { theme: currentTheme },
      React.createElement(
        Fragment,
        null,
        // Offline notification
        isOffline &&
          React.createElement(
            OfflineMessage,
            null,
            msg(
              "app_offline",
              "You are offline. Data will update when connection is restored.",
            ),
          ),
        // API error notification (only show if not offline)
        !isOffline &&
          apiError &&
          React.createElement(
            ApiErrorMessage,
            null,
            React.createElement(
              "span",
              null,
              this.state.retrying
                ? msg("app_retrying", "Retrying…")
                : msg(
                    "app_unreachable",
                    "Couldn't reach the price service. Showing the last prices we have.",
                  ),
            ),
            React.createElement(
              RetryButton,
              {
                onClick: this.handleRetry,
                disabled: this.state.retrying,
                title: msg("chrome_refresh", "Fetch the latest prices again"),
              },
              msg("app_retry", "Retry"),
            ),
          ),
        // Invalid coin warning
        invalidCoin &&
          React.createElement(
            InvalidCoinWarning,
            null,
            React.createElement(
              InvalidCoinMessage,
              null,
              `${invalidCoin} is not available or invalid`,
            ),
            React.createElement(
              InvalidCoinButton,
              { onClick: this.handleRemoveInvalidCoin },
              msg("app_remove", "Remove"),
            ),
            React.createElement(
              InvalidCoinButton,
              { onClick: this.handleDismissInvalidCoin },
              msg("app_skip", "Skip"),
            ),
          ),

        this.state.showNews &&
          React.createElement(NewsPanel, {
            items: this.state.newsItems,
            enabled: this.state.newsSources,
            scope: this.state.newsPanelScope,
            coinOptions: this.state.coinOptions,
            portfolio: this.state.portfolio,
            loading: this.state.newsLoading,
            blocked: this.state.newsBlocked,
            /* The line between what is new and what you have already seen,
             * frozen at the moment the panel was opened. It is the *previous*
             * stamp, not the current one — see `toggleNews` — or the divider
             * would sit at the top of the list with nothing above it. */
            readFrom: this.state.newsReadFrom,
            /* The coin on the chart and its visible series, so the panel can
             * say whether this one has just done something unusual for itself.
             * Both are already in state; neither costs a request. */
            coin: activeCoin,
            /* **The series, and it has to be the one that exists.** This read
               `this.state.priceHistory` — a name from the guide that this
               component has never had — so the panel was handed `undefined`
               and its "just moved unusually" section, which needs a series to
               measure, returned null on every render since it was written.
               Renamed on both sides to the field's real name, so the next
               reader cannot make the same substitution. */
            prices: this.state.valueHistory,
            /* After "Not now", the quiet line in the panel leads here: the
               Permissions tab, where every permission has its reasons. */
            onOpenPermissions: this.openNewsPermissions,
            onToggleSource: this.handleNewsSourceToggle,
            onScopeChange: this.handleNewsScopeChange,
            saved: this.state.newsSaved,
            onToggleSaved: this.handleNewsSavedToggle,
            onSourcesChange: this.refreshNewsSources,
            onShowMoves: this.showMovesOnChart,
            onClose: this.toggleNews,
          }),

        this.state.showBaseRates &&
          React.createElement(BaseRatesPanel, {
            coin: activeCoin,
            onClose: this.toggleBaseRates,
          }),

        // "What happened here?" — the headlines from around one marked move
        this.renderMoveCard(),

        // One-time rating ask (hidden behind full-screen views; the settings
        // overlay stacks above it)
        showRateAsk &&
          !showPortfolio &&
          React.createElement(
            RateAskCard,
            { tickerBottom },
            React.createElement(
              RateAskText,
              null,
              /* Asks for the rating on the one honest ground there is: the
               * store's ranking is how anybody else finds this, and a rating
               * is the only thing a user can give that helps. It stays a
               * question rather than a claim — "if you like it" — because the
               * app does not know whether they do. */
              msg(
                "app_rate_ask",
                "Liking PriceTab? A rating is how other people find it — it takes a few seconds and helps more than anything else.",
              ),
            ),
            React.createElement(
              RatePromptLink,
              {
                href: STORE_LISTING_URL,
                target: "_blank",
                rel: "noreferrer",
                onClick: this.handleRateAskDismiss,
              },
              "Rate",
            ),
            React.createElement(
              RatePromptClose,
              {
                onClick: this.handleRateAskDismiss,
                "aria-label": msg(
                  "app_dismiss_rating",
                  "Dismiss rating request",
                ),
              },
              "×",
            ),
          ),
        /* The ground, raised over the swap and lowered again. */
        this.state.panelSwap === true &&
          React.createElement(PanelVeil, {
            "data-panel-veil": "1",
            "aria-hidden": "true",
          }),

        React.createElement(
          AppShell,
          {
            tickerTop,
            tickerBottom,
            tickerH: this.state.pageTickerHeight,
          },

          React.createElement(
            ControlsStack,
            null,

            /* Show skeleton or actual overview.
             *
             * Two different situations, and only one of them is a skeleton.
             * With nothing on screen yet the grey boxes take the space and
             * that is the whole of it. With a chart already up, the figures
             * are hidden inside a slot that keeps its height and the boxes
             * are laid over them — see `ReadoutSlot` for the 71px the
             * straight swap cost. */
            showSkeleton && !hasChart
              ? React.createElement(
                  SkeletonOverview,
                  null,
                  React.createElement(SkeletonBox, {
                    width: "8rem",
                    height: "2.5rem",
                  }),
                  React.createElement(SkeletonBox, {
                    width: "6rem",
                    height: "1rem",
                  }),
                )
              : React.createElement(
                  ReadoutSlot,
                  { blank: chartStale },
                  React.createElement(Overview, {
                    // "X" flips the change readout through this
                    ref: (r) => (this.overviewRef = r),
                    coin: activeCoin,
                    cycleCoinIndex: this.cycleCoinIndex,
                    currentValue,
                    valueHistory,
                    decimalPlaces,
                    separatorFormat,
                    currency,
                  }),
                  /* Headlines beside an unusual move. Shown only when the
                   * coin has moved more than the period's threshold *and*
                   * the feed has stories that name that coin from inside the
                   * window — no filler, and no claim that the two are
                   * related, which is why the label says where they came
                   * from rather than why the price moved. */
                  (() => {
                    if (!this.state.moveHeadlines) return null;
                    const threshold = NOTABLE_MOVE_PCT[period];
                    if (!threshold) return null;
                    const move = derivePercentDelta(currentValue, valueHistory);
                    if (
                      typeof move !== "number" ||
                      Math.abs(move) < threshold
                    ) {
                      return null;
                    }
                    const windowStart =
                      valueHistory && valueHistory.length
                        ? Number(new Date(valueHistory[0].time))
                        : 0;
                    const stories = headlinesForCoin(
                      this.state.newsItems,
                      activeCoin,
                      windowStart,
                      2,
                    );
                    if (!stories.length) return null;
                    return React.createElement(
                      MoveHeadlines,
                      null,
                      React.createElement(
                        MoveHeadlinesLabel,
                        null,
                        `${activeCoin} headlines from this ${periodOption ? periodOption.title.toLowerCase() : "window"}`,
                      ),
                      stories.map((story) =>
                        React.createElement(
                          MoveHeadlineLink,
                          {
                            key: story.url || story.title,
                            href: story.url || undefined,
                            target: "_blank",
                            rel: "noreferrer",
                            title: story.title,
                          },
                          story.title,
                        ),
                      ),
                    );
                  })(),

                  /* Stats under the price. Each one is shown only when its
                   * source happens to be loaded — the market figures arrive
                   * with the ticker's bulk sweep, which is off unless the
                   * ticker or a coin widget is on — so the row never
                   * triggers a fetch of its own. */
                  (() => {
                    /* While two coins share the chart the row says what the
                     * chart shows — see `CompareStrip`. The stats it replaces
                     * are about one coin's range, and half the chart is no
                     * longer that. */
                    if (this.state.compareCoin) {
                      /* The same window the chart draws (alignComparison),
                         or the strip's gap is from two different starts. */
                      const [alignedA, alignedB] = alignComparison(
                        valueHistory,
                        this.state.compareHistory || [],
                      );
                      const a = toPercentChange(alignedA);
                      const b = toPercentChange(alignedB);
                      const lastA = a.length ? a[a.length - 1].percent : null;
                      const lastB = b.length ? b[b.length - 1].percent : null;
                      const leg = (coin, pct, second) =>
                        React.createElement(
                          CompareLeg,
                          { key: coin, "data-compare-leg": second ? "b" : "a" },
                          React.createElement(CompareSwatch, {
                            second,
                            "aria-hidden": "true",
                          }),
                          React.createElement(CompareCoin, { second }, coin),
                          React.createElement(
                            CompareValue,
                            null,
                            pct == null ? "—" : formatSignedPercent(pct),
                          ),
                        );
                      return React.createElement(
                        CompareStrip,
                        { key: "compare", "data-compare-strip": "true" },
                        leg(activeCoin, lastA, false),
                        leg(this.state.compareCoin, lastB, true),
                        lastA != null &&
                          lastB != null &&
                          React.createElement(
                            CompareNote,
                            {
                              title: msg(
                                "cmp_gap_hint",
                                "The compared coin's move minus this coin's, in percentage points",
                              ),
                            },
                            msg(
                              "cmp_gap",
                              "gap $1 pts",
                              formatSignedPercent(lastB - lastA).replace(
                                "%",
                                "",
                              ),
                            ),
                          ),
                        (() => {
                          /* How often they moved together, as a count — the
                             thing a comparison is looked at to find out. */
                          const together = compareSameDirection(
                            valueHistory,
                            this.state.compareHistory || [],
                          );
                          return together
                            ? React.createElement(
                                CompareNote,
                                {
                                  "data-compare-together": `${together.same}/${together.n}`,
                                  title: msg(
                                    "cmp_together_hint",
                                    "Steps of this chart where both coins moved, and how many of them went the same way. A count of what happened, not a forecast.",
                                  ),
                                },
                                msg(
                                  "cmp_together",
                                  "same way $1 of $2 steps",
                                  String(together.same),
                                  String(together.n),
                                ),
                              )
                            : null;
                        })(),
                        React.createElement(
                          CompareNote,
                          null,
                          msg(
                            "cmp_since",
                            "since the start of $1",
                            periodLabel,
                          ),
                        ),
                        /* The other reading of the same two coins: this one
                           priced in that one, on its own axis. */
                        React.createElement(
                          CompareStripButton,
                          {
                            onClick: this.toggleCompareRatio,
                            on: this.state.compareRatio === true,
                            "aria-pressed": this.state.compareRatio === true ? "true" : "false",
                            "data-compare-ratio": "1",
                            title: msg(
                              "cmp_ratio_hint",
                              "Draw $1 priced in $2, on an axis of its own — up means $1 did better",
                              activeCoin,
                              this.state.compareCoin,
                            ),
                          },
                          msg("cmp_ratio", "$1 in $2", activeCoin, this.state.compareCoin),
                        ),
                        React.createElement(
                          CompareStripButton,
                          {
                            onClick: this.swapCompare,
                            title: msg(
                              "cmp_swap_hint",
                              "Put $1 on the chart and $2 over it",
                              this.state.compareCoin,
                              activeCoin,
                            ),
                          },
                          msg("cmp_swap", "Swap"),
                        ),
                        React.createElement(
                          CompareStripButton,
                          {
                            onClick: this.clearCompare,
                            title: `${msg("sc_compare", "Compare with a second coin")} (C)`,
                          },
                          msg("cmp_stop", "Stop"),
                        ),
                      );
                    }
                    if (this.state.marketStats === false) return null;
                    const symbol = getCurrencySymbol(currency);
                    const money = (v) =>
                      formatNumberString(
                        v,
                        symbol,
                        true,
                        false,
                        decimalPlaces,
                        separatorFormat,
                      );
                    const range = deriveRangeStats(valueHistory);
                    const ticker = pageTickerCache.get(
                      `${activeCoin}-${currency}`,
                    );
                    const stats = [];
                    if (range) {
                      stats.push([
                        `${periodLabel} ${msg("stats_high", "High")}`,
                        money(range.high),
                      ]);
                      stats.push([
                        `${periodLabel} ${msg("stats_low", "Low")}`,
                        money(range.low),
                      ]);
                    }
                    const cap = ticker
                      ? formatCompactAmount(ticker.marketCap, symbol)
                      : null;
                    if (cap) stats.push([msg("stats_mkt_cap", "Mkt Cap"), cap]);
                    const vol = ticker
                      ? formatCompactAmount(ticker.volume24, symbol)
                      : null;
                    if (vol) stats.push([msg("stats_vol_24h", "24h Vol"), vol]);
                    /* VWAP, on this row's own terms: shown when the candles
                     * happen to be loaded — candlestick mode, or any crosshair
                     * hover — and never fetched for. It is the one thing the
                     * sector scan turned up that institutions actually read
                     * and that claims nothing about the future: the average
                     * price actually paid across this window, weighted by how
                     * much changed hands at each level. */
                    const vwap = vwapOf(this.state.ohlcData);
                    if (vwap) {
                      const live = Number(currentValue);
                      const away =
                        isFinite(live) && vwap > 0
                          ? ((live - vwap) / vwap) * 100
                          : null;
                      stats.push([
                        "VWAP",
                        money(vwap),
                        away == null
                          ? `The volume-weighted average price across this ${periodLabel.toLowerCase()} window. A price that happened, not a forecast.`
                          : `The volume-weighted average price across this ${periodLabel.toLowerCase()} window — ${Math.abs(away).toFixed(1)}% ${away >= 0 ? "below" : "above"} the price now. A price that happened, not a forecast.`,
                      ]);
                    }
                    /* An empty row is still rendered, for its height. See
                     * `PriceStatsRow` — returning null here is what let the
                     * chart drop 27px the moment the first prices arrived. */
                    if (!stats.length) {
                      return React.createElement(PriceStatsRow, {
                        key: "stats",
                        "aria-hidden": "true",
                      });
                    }
                    return React.createElement(
                      PriceStatsRow,
                      null,
                      stats.map(([key, value, title]) =>
                        React.createElement(
                          PriceStatItem,
                          { key, title },
                          React.createElement(PriceStatKey, null, key),
                          React.createElement(PriceStatValue, null, value),
                        ),
                      ),
                    );
                  })(),

                  /* **Where it sits** (a counted study, chart-studies.js): the
                   * price's place inside each range's high and low, from the
                   * series the app already holds — the range on screen and
                   * whatever the prefetch warmed. No request. */
                  (() => {
                    if (!(this.state.chartStudies || []).includes("where")) return null;
                    if (this.state.compareCoin) return null;
                    const now = Number(currentValue);
                    const rows = PERIOD_OPTIONS.map((o) => {
                      const cached = o.value === period ? null : getCachedData(activeCoin, o.value, currency, "history");
                      return { key: o.label, prices: o.value === period ? valueHistory : cached && cached.data };
                    });
                    const spots = rangePositions(now, rows);
                    if (!spots.length) return null;
                    const symbol = getCurrencySymbol(currency);
                    const money = (v) => formatNumberString(v, symbol, true, false, decimalPlaces, separatorFormat);
                    return React.createElement(
                      WhereRow,
                      { "data-where": "1", "aria-label": msg("study_where_aria", "Where the price sits inside each range's high and low") },
                      React.createElement(WhereHead, null, msg("study_where_head", "Where it sits")),
                      ...spots.map((s) =>
                        React.createElement(
                          WhereItem,
                          {
                            key: s.key,
                            "data-where-range": s.key,
                            title: msg("study_where_title", "$1: $2% of the way from the low ($3) to the high ($4)", s.key, String(Math.round(s.pos * 100)), money(s.low), money(s.high)),
                          },
                          React.createElement(WhereKey, null, s.key),
                          React.createElement(
                            WhereTrack,
                            { "aria-hidden": "true" },
                            React.createElement(WhereMark, { style: { left: `${(s.pos * 100).toFixed(1)}%` } }),
                          ),
                          React.createElement(WhereValue, null, `${Math.round(s.pos * 100)}%`),
                        ),
                      ),
                    );
                  })(),

                  // "Since your last visit" — only when there's a baseline
                  // from a previous session and the move is worth mentioning
                  (() => {
                    if (this.state.lastSeenEnabled === false) return null;
                    const seen = this.state.lastSeen[activeCoin];
                    const now = Number(currentValue);
                    if (!seen || !isFinite(now) || now <= 0) return null;
                    const pct = ((now - seen.price) / seen.price) * 100;
                    if (Math.abs(pct) < LAST_SEEN_MIN_PCT) return null;
                    const delta = now - seen.price;
                    return React.createElement(
                      SinceLastVisit,
                      null,
                      `Since your last visit (${describeElapsed(Date.now() - seen.time)})`,
                      React.createElement(
                        SinceValue,
                        { up: delta === 0 ? null : delta > 0 },
                        `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% · ${formatNumberString(
                          delta,
                          getCurrencySymbol(currency),
                          false,
                          false,
                          decimalPlaces,
                          separatorFormat,
                        )}`,
                      ),
                    );
                  })(),
                  /* **A US CPI release, near enough to matter** (27 Sep
                     2026): from two days before it until two hours after,
                     one line in the "since your last visit" voice. The
                     count of what past releases did is on the base-rate
                     screen (B); this only says when. */
                  (() => {
                    if (this.state.macroEvents === false) return null;
                    const now = Date.now();
                    const at = nextCpiRelease(now - CPI_JUST_MS);
                    if (!at || at - now > CPI_SOON_MS) return null;
                    const when = new Date(at).toLocaleString(
                      intlTag(activeLocale()),
                      {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      },
                    );
                    const ahead = at > now;
                    return React.createElement(
                      SinceLastVisit,
                      {
                        "data-cpi-line": ahead ? "soon" : "just",
                        title: msg(
                          "cpi_line_hint",
                          "The US Consumer Price Index, published 08:30 New York time. What past releases did to this coin is counted on the base-rate screen (B).",
                        ),
                      },
                      ahead
                        ? msg(
                            "cpi_line_soon",
                            "US CPI $1 · $2",
                            describeAhead(at - now),
                            when,
                          )
                        : msg(
                            "cpi_line_just",
                            "US CPI came out $1 · $2",
                            describeElapsed(now - at),
                            when,
                          ),
                    );
                  })(),
                  chartStale &&
                    React.createElement(
                      ReadoutStandIn,
                      null,
                      React.createElement(SkeletonBox, {
                        width: "8rem",
                        height: "2.5rem",
                      }),
                      React.createElement(SkeletonBox, {
                        width: "6rem",
                        height: "1rem",
                      }),
                    ),
                ),

            /* Show skeleton or actual period switcher. The range is known
             * the instant it is pressed — greying the six buttons while the
             * prices arrive said the app had lost the press. */
            showSkeleton && !hasChart
              ? React.createElement(
                  SkeletonPeriodSwitcher,
                  null,
                  Array(6)
                    .fill()
                    .map((_, i) =>
                      React.createElement(SkeletonBox, {
                        key: i,
                        width: "3rem",
                        height: "2rem",
                      }),
                    ),
                )
              : React.createElement(
                  ChartHead,
                  // On a phone the ranges leave the + its own room
                  { tools: Boolean(hasChart && this.chartToolsOn()) },
                  React.createElement(PeriodSwitcher, {
                    onChange: this.setPeriod,
                    options: PERIOD_OPTIONS,
                    value: period,
                  }),
                ),
          ),

          React.createElement(
            FullBleed,
            {
              /* The targets drawer treats a press here as a price rather
                 than as a press outside itself — see `handleOutside` in
                 alerts.js. */
              "data-chart-surface": "1",
            },
            /* The strip over the chart is a setting now: it is drawn on
               somebody's chart, and "not on my chart" is a real thing to
               want. The position's own lines stay — those are the reading the
               panel exists to give; this is the control that sits on top of
               it. */
            activePractice &&
              this.state.practiceDock !== false &&
              !showSettings &&
              !showPortfolio &&
              !this.state.showBaseRates &&
              !this.state.alertsView &&
              !this.state.showNews &&
              !this.state.showQuickSwitch &&
              React.createElement(
                PracticeChartDock,
                {
                  "data-practice-dock": "true",
                  open: this.state.dockOpen,
                  innerRef: (n) => (this._dockNode = n),
                },
                React.createElement(
                  PracticeDockHead,
                  {
                    onClick: this.toggleDock,
                    "aria-expanded": this.state.dockOpen ? "true" : "false",
                    title: msg(
                      "dock_open",
                      "The contract on this chart — its size, and how much of it to close",
                    ),
                    "aria-label": `${activeCoin} ${
                      activePractice.side === "short"
                        ? msg("pos_short", "Short")
                        : msg("pos_long", "Long")
                    } ${activePractice.leverage}x, ${activePractice.pnlText}${
                      activePractice.count > 1
                        ? `, ${msg("dock_count", "1 of $1", String(activePractice.count))}`
                        : ""
                    }`,
                  },
                  React.createElement(
                    PracticeChartDockMark,
                    { "aria-hidden": "true" },
                    icon("futures", 0.9),
                  ),
                  React.createElement(
                    PracticeChartDockName,
                    null,
                    `${activeCoin} ${
                      activePractice.side === "short"
                        ? msg("pos_short", "Short")
                        : msg("pos_long", "Long")
                    } ${activePractice.leverage}x`,
                  ),
                  /* One of several, said on the strip itself. Without it the
                     dock reads as "your BTC position" while nine others are
                     open behind it. */
                  activePractice.count > 1 &&
                    React.createElement(
                      PracticeChartDockCount,
                      {
                        title: msg(
                          "dock_count_title",
                          "This market is carrying more than one contract. The chart draws the newest; the panel has them all.",
                        ),
                      },
                      msg(
                        "dock_count",
                        "1 of $1",
                        String(activePractice.count),
                      ),
                    ),
                  React.createElement(
                    PracticeChartDockPnl,
                    {
                      tone:
                        activePractice.pnl > 0
                          ? "up"
                          : activePractice.pnl < 0
                            ? "down"
                            : null,
                    },
                    activePractice.pnlText,
                  ),
                  React.createElement(
                    PracticeChartDockOpen,
                    { "aria-hidden": "true", open: this.state.dockOpen },
                    icon("chevron", 0.7),
                  ),
                ),
                /* **The readings, in the space the pill was leaving empty.**
                   Outside the header button, not inside it — a button may not
                   contain a button and these are not pressable anyway; and the
                   pill keeps its own shape while the strip is what widens. */
                React.createElement(
                  PracticeDockStrip,
                  { "data-practice-strip": "true", "aria-hidden": "true" },
                  React.createElement(
                    PracticeDockStat,
                    { tone: activePractice.band },
                    msg("dock_to_liq", "to liq"),
                    React.createElement(
                      "strong",
                      null,
                      activePractice.liquidation
                        ? `${(
                            (Math.abs(
                              activePractice.liquidation - activePractice.mark,
                            ) /
                              activePractice.mark) *
                            100
                          ).toFixed(2)}%`
                        : msg("pos_liq_none", "none at 1x"),
                    ),
                  ),
                  /* **How much of the way there has been used.** `ratio` is 1.0
                     at the moment it is closed for you and starts far above
                     that, so the bar reads `1 / ratio` — full is gone, empty
                     is safe. */
                  activePractice.ratio
                    ? React.createElement(
                        PracticeDockGauge,
                        null,
                        React.createElement(PracticeDockGaugeFill, {
                          tone: activePractice.band,
                          pct: Math.min(100, (1 / activePractice.ratio) * 100),
                        }),
                      )
                    : null,
                  activePractice.roe == null
                    ? null
                    : React.createElement(
                        PracticeDockStat,
                        {
                          tone:
                            activePractice.roe > 0
                              ? "up"
                              : activePractice.roe < 0
                                ? "down"
                                : null,
                        },
                        msg("dock_roe", "on margin"),
                        React.createElement(
                          "strong",
                          null,
                          `${signedFixed(activePractice.roe, 1)}%`,
                        ),
                      ),
                  React.createElement(
                    PracticeDockStat,
                    null,
                    msg("dock_funding", "funding"),
                    React.createElement(
                      "strong",
                      null,
                      describeAhead(activePractice.fundingIn),
                    ),
                  ),
                ),
                /* **Always rendered, never conditionally mounted.** A body
                   that appears only while open has nothing to animate from,
                   so the box would jump to full height and then ease — which
                   is the transition running backwards. `aria-hidden` while
                   shut, because a collapsed `max-height: 0` still leaves its
                   text in the accessibility tree and the header's
                   `aria-expanded` would then be lying. */
                React.createElement(
                  PracticeDockBody,
                  {
                    open: this.state.dockOpen,
                    "aria-hidden": this.state.dockOpen ? "false" : "true",
                  },
                  React.createElement(
                    PracticeDockFacts,
                    null,
                    React.createElement("span", null, msg("dock_size", "Size")),
                    React.createElement(
                      PracticeDockFactValue,
                      null,
                      activePractice.sizeText,
                    ),
                    React.createElement(
                      "span",
                      null,
                      msg("dock_notional", "Worth"),
                    ),
                    React.createElement(
                      PracticeDockFactValue,
                      null,
                      activePractice.notionalText,
                    ),
                    React.createElement(
                      "span",
                      null,
                      msg("dock_margin", "Margin"),
                    ),
                    React.createElement(
                      PracticeDockFactValue,
                      null,
                      activePractice.marginText,
                    ),
                    React.createElement(
                      "span",
                      null,
                      msg("pos_entry", "Entry"),
                    ),
                    React.createElement(
                      PracticeDockFactValue,
                      null,
                      activePractice.entryText,
                    ),
                    React.createElement(
                      "span",
                      null,
                      msg("dock_liq", "Liquidation"),
                    ),
                    React.createElement(
                      PracticeDockFactValue,
                      null,
                      activePractice.liqText ||
                        msg("pos_liq_none", "none at 1x"),
                    ),
                  ),
                  /* **What the percentages are a percentage of, said once
                     above them.** A bare `25%` beside a position could be a
                     quarter of anything — the size, the profit, the margin.
                     The heading names the verb and the buttons carry the
                     amount, which is the division the rest of this panel
                     already uses for a labelled control. */
                  React.createElement(
                    PracticeDockLabel,
                    null,
                    React.createElement(
                      "span",
                      null,
                      msg("dock_close_head", "Close part of it"),
                    ),
                    /* And what *this* press would take, the moment one is
                       armed — the quantity, not another percentage. */
                    this.state.dockArmed
                      ? React.createElement(
                          PracticeDockArmed,
                          { "data-dock-armed": "true" },
                          this.dockShareText(this.state.dockArmed),
                        )
                      : null,
                  ),
                  React.createElement(
                    PracticeDockActions,
                    null,
                    ...[0.25, 0.5, 0.75, 1].map((share) =>
                      React.createElement(
                        PracticeDockAction,
                        {
                          key: share,
                          armed: this.state.dockArmed === share,
                          tabIndex: this.state.dockOpen ? 0 : -1,
                          onClick: () => this.dockReduce(share),
                          "aria-label":
                            this.state.dockArmed === share
                              ? msg(
                                  "dock_close_confirm_aria",
                                  "Press again to close $1",
                                  this.dockShareText(share),
                                )
                              : share === 1
                                ? msg(
                                    "dock_close_all",
                                    "Close all of this contract",
                                  )
                                : msg(
                                    "dock_close_share",
                                    "Close $1 percent of this contract",
                                    String(share * 100),
                                  ),
                        },
                        this.state.dockArmed === share
                          ? msg("dock_sure", "Sure?")
                          : share === 1
                            ? msg("dock_all", "All")
                            : `${share * 100}%`,
                      ),
                    ),
                  ),
                  /* Everything this widget deliberately does not carry — the
                     stop, the take-profit, added margin, the record — is one
                     press away rather than crammed in beside the shares. */
                  React.createElement(
                    PracticeDockMore,
                    {
                      tabIndex: this.state.dockOpen ? 0 : -1,
                      onClick: () => {
                        this.closeDock();
                        this.toggleAlertsView("futures");
                      },
                    },
                    msg("dock_more", "Open derivatives"),
                  ),
                ),
              ),
            React.createElement(
              ChartWrapper,
              { stale: chartStale },
              // Show skeleton or actual chart
              showSkeleton && !hasChart
                ? React.createElement(
                    SkeletonChart,
                    null,
                    this.state.slowLoad &&
                      React.createElement(
                        SkeletonNote,
                        null,
                        this.state.isOffline
                          ? msg(
                              "app_offline_short",
                              "Offline — waiting for a connection",
                            )
                          : msg("app_fetching_prices", "Fetching prices…"),
                      ),
                  )
                : React.createElement(ChartView, {
                    /* The window in time (chart-viewport.js): the series
                       below is cut to it before the chart sees it, and the
                       finer candles a narrow window asked for ride along. */
                    ref: this.viewRef,
                    view: this.chartViewNow(),
                    onViewChange: this.handleChartView,
                    onZoomPast: this.handleChartZoomPast,
                    viewEnabled: this.chartViewEnabled(),
                    detailSupported: this.chartDetailSupported(),
                    detail: this.state.chartDetail,
                    // The counted studies (chart-studies.js)
                    studies: this.compareRatioFor() ? [] : this.state.chartStudies,
                    studyDaily: this.studyDailyFor(activeCoin),
                    // The ruler and the drawings (chart-tools.js, app-tools.js)
                    tool: this.state.chartTool,
                    drawings: this.drawingsFor(),
                    drawingSelected: this.state.drawingSelected,
                    drawingEditing: this.state.drawingEditing,
                    onDrawingAdd: this.handleDrawingAdd,
                    onDrawingChange: this.handleDrawingChange,
                    onDrawingDelete: this.handleDrawingDelete,
                    onDrawingSelect: this.handleDrawingSelect,
                    onDrawingEdit: this.handleDrawingEdit,
                    onDrawingTarget: this.handleDrawingTarget,
                    /* With the ratio on (app-view.js), the chart is one line:
                       this coin priced in the compared one, on its own axis. */
                    prices: this.compareRatioFor() || valueHistory,
                    // The price scale and the time axis (chart-axes.js); the
                    // portfolio's background chart has neither
                    axes: true,
                    colorize: this.state.chartColor,
                    /* Your own entry, on the coin's own chart.
                     *
                     * This is the honest version of a "buy point": not a level
                     * something guessed at, but the average you actually paid,
                     * drawn where the price can be read against it. Break-even
                     * is a fact about your position, and the one line on this
                     * chart that is genuinely about you.
                     *
                     * `priceToChartY` hides it when it falls outside the drawn
                     * range rather than pinning it to an edge, so a cost far
                     * below a year of history simply is not there — a level
                     * clamped to the border is a crossing the window does not
                     * contain. Off during comparison, where the axis is percent
                     * change and a price level would sit at a meaningless
                     * height, like the grid and the calls. */
                    reference: this.state.compareCoin
                      ? null
                      : this.holdingCostLevel(activeCoin),
                    /* The open futures position on this coin, as levels the
                     * price is read against — see `updatePositionLevels` in
                     * `src/chart.js`. Off during comparison for the same
                     * reason the cost level is: the axis is percent change
                     * and a price would sit at a meaningless height. */
                    position: this.state.compareCoin ? null : activePractice,
                    /* **The price targets you set, on the axis you set them
                     * against** (23 Sep 2026). Built fresh on every render
                     * for the reason `chartPosition` is: the chart compares
                     * by identity, the work is a handful of pooled lines and
                     * labels, and it is cheaper than the guard that would
                     * avoid it. Off under comparison with the cost level and
                     * the contract's levels — a price on a percent axis sits
                     * at a meaningless height. */
                    targets: this.state.compareCoin
                      ? null
                      : this.chartTargets(activeCoin),
                    /* Only while the targets drawer is the panel on screen:
                       a chart that turns every click into a price target
                       when nothing asked for one is a chart you cannot click.
                       The board keeps the gesture whenever it is up — see
                       `handleChartClick`. */
                    onPickPrice:
                      this.state.alertsView === "targets"
                        ? this.handlePickTargetPrice
                        : null,
                    /* Both off while two coins share the chart, for the same
                     * reason the candles and the volume band are: comparison
                     * puts percent change on the y axis, and the mesh, its
                     * price labels and the squares you call are all built from
                     * the price scale. Left on, the chart offered a band to
                     * point at that no line on it was drawn against — and let
                     * you lock a prediction on it. Calls already placed keep
                     * settling; only drawing and placing stand down. */
                    grid:
                      this.state.chartGrid === true && !this.state.compareCoin,
                    /* Comparison puts *percent change* on the y axis, which
                     * crosses zero and goes negative — there is no logarithm
                     * of that. The lattice's veto is the chart's own, applied
                     * where it has the geometry in hand (`logAxis`). */
                    logScale:
                      this.state.logScale === true && !this.state.compareCoin,
                    /* Off under comparison for the reason the band and the
                       mesh are: the y axis there is percent change, and an
                       average of this coin's prices has no level on it. */
                    average:
                      this.state.chartAverage === true &&
                      !this.state.compareCoin,
                    /* Not stood down under comparison: the markers are about
                       time, and a comparison changes only the y axis. */
                    macroEvents: this.state.macroEvents !== false,
                    /* Levels in price, so it stands down under comparison
                       with the other price furniture. */
                    /* Levels in price too: under a comparison there is no
                       price axis to draw a band against. */
                    overlay: this.state.compareCoin
                      ? null
                      : this.overlayFor(activeCoin),
                    companion: this.state.compareCoin
                      ? null
                      : this.companionFor(activeCoin),
                    predict:
                      this.state.predict === true && !this.state.compareCoin,
                    // Stands down with the board and under comparison, for the
                    // same reason: a band from this coin's prices would sit at
                    // a level a percent-change axis is not drawn in
                    travelBand:
                      this.state.travelBand === true && !this.state.compareCoin,
                    /* The board's width, and the line that sets it. There is
                     * no second control: a stepper counting squares said the
                     * same thing in a unit nobody thinks in, and the chart
                     * already had the edge you actually want to pull. */
                    futureShare: this.state.futureShare,
                    onFutureShareChange: this.handleFutureShareChange,
                    boardZoom: this.state.boardZoom,
                    onBoardZoomChange: this.handleBoardZoomChange,
                    calls: this.state.calls.open,
                    settledCalls:
                      this.state.callsShowSettled === false
                        ? null
                        : this.state.calls.done,
                    currency: this.state.currency,
                    celebrate:
                      this.state.callsCelebrate === false
                        ? 0
                        : this.state.celebrate,
                    celebrateCall: this.state.celebrateCall,
                    /* Behind the same switch as the burst: "celebrate a win"
                     * is one preference, not two, and a setting that stopped
                     * the small celebration while letting the big one through
                     * would read as broken. */
                    fireworks:
                      this.state.callsCelebrate === false
                        ? 0
                        : this.state.fireworks,
                    onPlaceCall: this.handlePlaceCall,
                    /* Taking one back, from the chart rather than only from
                     * the panel — where a `×` has withdrawn open calls with no
                     * confirmation all along. Two clicks here, and never on a
                     * settled one. */
                    onWithdrawCall: this.handleWithdrawCall,
                    onGeometry: this.handleChartGeometry,
                    /* "What happened here?" — where the marks go is worked out
                     * from the series on screen, so it costs no request; what
                     * they say costs one window, asked for on a click. Off
                     * during comparison for the reason `grid` and `predict`
                     * are: the y axis is percent change from two series, and a
                     * mark placed from this coin's prices would sit at a level
                     * nothing on the chart is drawn in. */
                    showMoves:
                      this.state.moveNews === true && !this.state.compareCoin,
                    moves: this.chartMoves(valueHistory),
                    onMoveHover: this.handleMoveHover,
                    onMoveOpen: this.handleMoveOpen,
                    currencySymbol: this.compareRatioFor()
                      ? ""
                      : getCurrencySymbol(this.state.currency),
                    interactive: true, // crosshair with OHLC + volume
                    period,
                    coin: activeCoin,
                    // A ratio has no candles: the OHLC would be one coin's
                    ohlc:
                      this.state.ohlcEnabled === false || this.compareRatioFor()
                        ? null
                        : this.state.ohlcData,
                    onNeedOhlc:
                      this.state.ohlcEnabled === false || this.compareRatioFor()
                        ? null
                        : this.loadOhlc,
                    /* Comparison replaces the single-coin drawing rather than
                     * layering on top of it: candles and a volume band belong
                     * to one coin, and leaving them under two percent-change
                     * lines would put two different y-meanings on one chart. */
                    compareCoin: this.compareRatioFor() ? null : this.state.compareCoin,
                    comparePrices: this.compareRatioFor() ? null : this.state.compareHistory,
                    showCandles:
                      this.state.chartType === "candles" &&
                      Boolean(this.state.ohlcData) &&
                      !this.state.compareCoin,
                    candles: this.state.ohlcData,
                    // Volume rides the candles it is drawn from
                    showVolume:
                      this.state.volumeBars !== false &&
                      this.state.chartType === "candles" &&
                      !this.state.compareCoin,
                    // Any overlay covering the chart clears the readout
                    paused:
                      showSettings ||
                      showPortfolio ||
                      this.state.alertsView ||
                      this.state.showQuickSwitch ||
                      // A readout taken off the previous coin's series
                      chartStale,
                    formatPrice: this.compareRatioFor()
                      ? this.formatRatio
                      : this.formatChartPrice,
                  }),
            ),
            /* The skeleton's word for a slow fetch, for the case where the
             * chart was kept rather than replaced by it. Same 2.5s trigger,
             * so an ordinary switch — every tick of auto-rotate — passes
             * without a label flashing over the chart. */
            chartStale &&
              this.state.slowLoad &&
              React.createElement(
                ChartStaleNote,
                null,
                isOffline
                  ? msg(
                      "app_offline_short",
                      "Offline — waiting for a connection",
                    )
                  : msg("app_fetching_prices", "Fetching prices…"),
              ),
            React.createElement(
              ChartNotes,
              null,
              pricesAgeNote &&
                !chartStale &&
                React.createElement(
                  ChartAgeNote,
                  { "data-chart-age": "1", role: "status" },
                  pricesAgeNote,
                ),
            ),
          ),
          /* **The chart's tools, at the range row's right end** (30 Sep
             2026) — off the plot, where the chart's own words are
             (app-tools.js). Written here, after the chart, and drawn up
             between the row and the chart by `order` (ChartToolsRail): the
             + is an svg, and the first svg in the document has to be the
             chart's — see the note on the openers below. */
          hasChart &&
            (this.chartToolsOn() || this.chartViewNow()) &&
            React.createElement(
              ChartToolsRail,
              null,
              this.renderToolStrip(),
              // The window's navigator, at the row's other end (app-view.js)
              !chartStale && this.renderViewChip(),
            ),
          /* **Last inside the shell, after the chart.** These carry icons,
             and an icon is a path inside an svg — so drawn before the chart
             the first such path in the document is a corner control's, and
             on a phone, where the cluster is hidden, an *invisible* one.
             Three browser suites wait on exactly that selector and all of
             them hung. `AppShell` is the positioned ancestor either way, so
             nothing about where these sit on screen changes. */
          /* **The seven panel openers, wrapped so a phone can put them
             away.** Measured at 420px before this: the right-hand cluster
             spans 186px and the left pair another 66, so nine controls
             fill the whole top edge of the screen. The wrapper is
             `display: contents` everywhere else — it changes no layout —
             and under 575px it is `display: none` while no panel is open,
             with the menu button below standing in for all seven. While a
             panel *is* open it stays, because the control that opens a
             panel is also the × that closes it. */
          React.createElement(
            ChromeCluster,
            /* The hook the drawers use to tell an outside press from a press
               on the control that opened them — see handleOutside in
               alerts.js. */
            { "data-chrome-cluster": "1" },
            /* **The corner holds an open screen's × and nothing else** (26
               Sep 2026). The icons that opened the screens are tabs on the
               right-hand column now (renderScreenTabs); what stays is the way
               out of the screen you are in, in the screen's own top-right
               corner (ScreenClose). One at a time, because only one screen
               is ever open. */
            (() => {
              const open = this.openPanelKey();
              const close = {
                settings: [
                  this.toggleSettings,
                  msg("chrome_settings_close", "Close settings"),
                ],
                portfolio: [
                  this.togglePortfolio,
                  msg("chrome_portfolio_close", "Close portfolio"),
                ],
                futures: [
                  () => this.toggleAlertsView("futures"),
                  msg("chrome_futures_close", "Close the derivatives market"),
                ],
                news: [this.toggleNews, msg("chrome_news_close", "Close news")],
                baserates: [
                  this.toggleBaseRates,
                  msg("br_close", "Close base rates"),
                ],
              }[open];
              if (!close) return null;
              return React.createElement(
                ScreenClose,
                {
                  key: open,
                  "data-screen-close": open,
                  onClick: close[0],
                  "aria-label": close[1],
                  title: close[1],
                },
                "×",
              );
            })(),
          ),
        ),
        // Widget Panel (drag-reorderable, widgets only)
        (() => {
          if (showPortfolio) return null;
          const hidden = this.state.hiddenWidgets;

          /* Every card waits in the same shape — see `WidgetSkeletonLine`. A
           * function rather than a constant because styled-components memoises the
           * element, and two cards sharing one element instance would share one
           * animation phase, which reads as a single blinking block rather than a
           * column of cards each filling in. */
          const widgetSkeleton = (rows, field) => {
            /* **A card that has finished and failed says so, instead of pulsing.**
             *
             * The condition above every call here is "is there data yet", which
             * cannot tell *still asking* from *asked, and nothing came back* — the
             * same defect the news panel carried until `newsLoading` replaced
             * `newsItems.length === 0`, and its state comment says why. Measured on
             * an empty-but-valid answer, an HTTP 500 and a dead network alike, four
             * cards pulsed "Loading" for ever, with four infinite CSS animations
             * running on a page that is somebody's every new tab.
             *
             * `widgetFailed[field]` is set only when an attempt *finished* with
             * nothing, so this never appears while a fetch is still in flight, and
             * never on a refresh that failed after the card already had figures. */
            if (
              field &&
              this.state.widgetFailed &&
              this.state.widgetFailed[field]
            ) {
              /* A host that asked to be left alone is not a failure of the card,
           and the card says which of the two it is — see politeFetch. */
              const host = WIDGET_HOSTS[field];
              const wait = host ? hostCooldownsNow()[host] : 0;
              return React.createElement(
                WidgetEmptyNote,
                { "data-widget-paused": wait ? "true" : undefined },
                wait
                  ? msg(
                      "widget_paused",
                      "Paused · back $1",
                      describeAhead(wait),
                    )
                  : msg("widget_unavailable", "Couldn't load this one"),
              );
            }
            /* `rows` reserves the height the card is *going* to take.
             *
             * Two pulsing lines is right for a card whose answer is one figure and
             * a caption. It is wrong for the list cards: the watchlist fills with
             * one row per coin you follow, so its skeleton was 57px shorter than
             * the card it stood in for, and when the coin sweep answered at three
             * seconds every widget below it dropped 57px. Measured with a
             * layout-shift observer, that was the second of only two shifts this
             * page makes. A skeleton that does not hold the right amount of space
             * is a skeleton that causes the jump it exists to prevent. */
            const lines = rows && rows > 0 ? rows : 2;
            return React.createElement(
              Fragment,
              null,
              React.createElement(WidgetSkeletonLine, {
                tall: true,
                "aria-hidden": true,
              }),
              ...Array.from({ length: Math.max(1, lines - 1) }, (_, i) =>
                React.createElement(WidgetSkeletonLine, {
                  key: i,
                  // A row-shaped placeholder only when standing in for a list
                  row: Boolean(rows),
                  "aria-hidden": true,
                }),
              ),
              React.createElement(
                WidgetSkeletonReader,
                null,
                msg("widget_loading", "Loading"),
              ),
            );
          };
          /* TITLE POLICY — four rules, and each one was a card breaking it.
           *
           *  1. **The name in full, never an abbreviation.** `BTC OPEN INT.` and
           *     `BTC LIQS 24H` sat in the same column as `FEAR & GREED`, so the
           *     panel read as assembled rather than made. The card's font size is a
           *     user setting (`WIDGET_SIZE_OPTIONS`): a title that has to be decoded
           *     is not shorter, it is slower.
           *  2. **A coin-scoped card leads with the coin; a market-wide one names
           *     none.** The coin under the chart changes; which cards followed it
           *     was otherwise guesswork.
           *  3. **A window in the title, a venue in the subtext.** A 24h figure is
           *     meaningless without the window, and an open interest figure is one
           *     exchange's book — printing it unattributed is the defect the RSI
           *     widget's missing clock was.
           *  4. **Never the same words twice.** The open interest card was titled
           *     `BTC OPEN INT.` with `Open Interest` directly beneath it: the
           *     abbreviation existed to save room the expansion then spent. A
           *     subtext that repeats the title is not a subtext.
           */
          /* What a transfer costs, in the currency on screen.
           *
           * The two network-fee cards quote the unit the chain quotes — gwei,
           * sat/vB — and neither is a number anyone prices a transfer from in their
           * head. The price comes from `alertPriceFor`, which reads the ticker
           * snapshot and issues no request, so this is free. Where the ticker has
           * no price for the coin the money is **left off** rather than guessed at,
           * and the card falls back to saying only how soon. */
          const feeMoney = (amount, coin) => {
            const price = this.alertPriceFor(coin);
            if (!isFinite(amount) || price == null) return null;
            const cost = amount * price;
            const sym = getCurrencySymbol(currency);
            // Both chains are genuinely under a cent at times, and "$0.00" reads as
            // a broken card rather than as cheap
            if (cost < 0.01)
              return msg("widget_under_a_cent", "under $1", `${sym}0.01`);
            return sym + cost.toFixed(2);
          };
          const feeSubtext = (amount, coin, when) => {
            const money = feeMoney(amount, coin);
            /* "~", not "≈". The subtext renders around 9px, and at that size the
             * two waves of U+2248 flatten into two bars — measured, it is
             * indistinguishable from "=", which is the one thing this line must not
             * claim. (U+2248 is also outside the bundled font's unicode-range, so it
             * is a fallback glyph rather than Roboto Mono's.) */
            return money
              ? msg("widget_fee_to_send", "~$1 to send · $2", money, when)
              : when.charAt(0).toUpperCase() + when.slice(1);
          };
          // Two significant figures wherever the scale lands: 0.29, 12.4, 143
          const gweiText = (v) =>
            v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);

          /* The deepest peak-to-trough fall inside the range on screen, out of the
           * series already drawn — no request, and nothing fetched to have it on.
           *
           * It is the one thing the algorithm research left standing
           * (the working notes §9.4): of 64 rule × coin pairs, 59 cut the
           * worst fall and only 28 beat simply holding. So this is a risk figure and
           * it is worded as one — "how bad did this get", never "how bad can it get"
           * — and it carries no colour, because red here would read as an alarm
           * about a fall that has already finished. */
          const fall = maxDrawdown(valueHistory);
          const fallWhen = (from, to) => {
            const a = +from;
            const b = +to;
            if (!isFinite(a) || !isFinite(b)) return null;
            // Inside one day the dates are the same string twice, which says
            // nothing; the clock is what separates them
            const sameDay =
              new Date(a).toDateString() === new Date(b).toDateString();
            const fmt = (ms) =>
              sameDay
                ? new Date(ms).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : new Date(ms).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  });
            return msg("widget_from_to", "$1 to $2", fmt(a), fmt(b));
          };

          const widgetDefs = {
            watchlist: {
              label: msg("widget_watchlist", "Watchlist"),
              visible: widgets.watchlist && !hidden.watchlist,
              content:
                watchlistData && watchlistData.length
                  ? React.createElement(
                      WidgetCoinList,
                      null,
                      watchlistData
                        .slice(0, 12)
                        .map((c) => this.renderCoinRow(c, true)),
                    )
                  : // One line per coin you follow — the list this card becomes
                    widgetSkeleton((coinOptions || []).length, "watchlistData"),
            },
            topMovers: {
              label: msg("widget_top_movers", "Top Movers 24h"),
              visible: widgets.topMovers && !hidden.topMovers,
              content: topMoversData
                ? React.createElement(
                    WidgetCoinList,
                    null,
                    topMoversData.gainers.map((m) => this.renderCoinRow(m)),
                    React.createElement(WidgetListDivider, { key: "split" }),
                    topMoversData.losers.map((m) => this.renderCoinRow(m)),
                  )
                : // Three gainers, three losers and the rule between them
                  widgetSkeleton(7, "topMoversData"),
            },
            fearGreed: {
              label: msg("widget_fear_greed", "Fear & Greed"),
              visible: widgets.fearGreed && !hidden.fearGreed,
              content: fearGreedData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(WidgetValue, null, fearGreedData.value),
                    /* The same meter the RSI card uses, and no traffic light.
                     *
                     * It drew a red-amber-green arc with a needle, which is two
                     * things at once: a second drawing for a fact that is only
                     * a position on a 0-100 scale, and a **claim** — the ramp
                     * says low is bad and high is good. That is the same claim
                     * the RSI widget's bar was removed for on 20 August, and it
                     * is no better supported here.
                     *
                     * What stays is the number and the word beneath it, and the
                     * word is the *source's* own classification rather than
                     * ours. Reporting somebody else's label is not the same as
                     * inventing one; the colours were the only part this app
                     * was asserting, so the colours are what go. */
                    React.createElement(
                      WidgetMeter,
                      null,
                      React.createElement(WidgetMeterMark, {
                        value: Math.min(Math.max(fearGreedData.value, 2), 98),
                      }),
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      fearGreedData.classification,
                    ),
                  )
                : widgetSkeleton(0, "fearGreedData"),
            },
            marketOverview: {
              /* The card's own title says what the figure is, so the figure
               * does not repeat it. It read "Market" above and "Cap $2.31T"
               * inside — the only card in the column prefixing its own number,
               * and a label doing the job twice. */
              label: msg("widget_market_cap", "Market Cap"),
              visible: widgets.marketOverview && !hidden.marketOverview,
              content: marketOverviewData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      WidgetValue,
                      { style: { fontSize: "0.9em" } },
                      "$" +
                        (marketOverviewData.totalMarketCap / 1e12).toFixed(2) +
                        "T",
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      React.createElement(MarketStatLabel, null, "BTC"),
                      marketOverviewData.btcDominance.toFixed(1) + "%",
                      " · ",
                      React.createElement(MarketStatLabel, null, "ETH"),
                      marketOverviewData.ethDominance.toFixed(1) + "%",
                    ),
                  )
                : widgetSkeleton(0, "marketOverviewData"),
            },
            halvingCountdown: {
              label: msg("widget_btc_halving", "BTC Halving"),
              visible: widgets.halvingCountdown && !hidden.halvingCountdown,
              content: halvingData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      HalvingTimeGrid,
                      null,
                      React.createElement(
                        HalvingTimeUnit,
                        null,
                        React.createElement(
                          HalvingTimeNumber,
                          null,
                          String(halvingData.years).padStart(2, "0"),
                        ),
                        React.createElement(
                          HalvingTimeLabel,
                          null,
                          msg("widget_unit_years", "Yrs"),
                        ),
                      ),
                      React.createElement(HalvingTimeSep, null, ":"),
                      React.createElement(
                        HalvingTimeUnit,
                        null,
                        React.createElement(
                          HalvingTimeNumber,
                          null,
                          String(halvingData.remainingDays).padStart(3, "0"),
                        ),
                        React.createElement(
                          HalvingTimeLabel,
                          null,
                          msg("widget_unit_days", "Days"),
                        ),
                      ),
                      React.createElement(HalvingTimeSep, null, ":"),
                      React.createElement(
                        HalvingTimeUnit,
                        null,
                        React.createElement(
                          HalvingTimeNumber,
                          null,
                          String(halvingData.hours).padStart(2, "0"),
                        ),
                        React.createElement(
                          HalvingTimeLabel,
                          null,
                          msg("widget_unit_hours", "Hrs"),
                        ),
                      ),
                      React.createElement(HalvingTimeSep, null, ":"),
                      React.createElement(
                        HalvingTimeUnit,
                        null,
                        React.createElement(
                          HalvingTimeNumber,
                          null,
                          String(halvingData.minutes).padStart(2, "0"),
                        ),
                        React.createElement(
                          HalvingTimeLabel,
                          null,
                          msg("widget_unit_minutes", "Min"),
                        ),
                      ),
                    ),
                    /* The progress bar has gone, and it is the third reading
                     * of one fact that went with it: the clock said how long
                     * is left, the date said when, and the bar said 24% of a
                     * cycle nobody is counting in percent. The clock earns its
                     * exception to the one-figure grammar because a countdown
                     * genuinely needs its units; the bar did not. */
                    React.createElement(
                      HalvingEta,
                      null,
                      msg("widget_eta", "ETA: $1", halvingData.etaFormatted),
                    ),
                  )
                : widgetSkeleton(0, "halvingData"),
            },
            /* The pair share one grammar and it is the point of them: the
             * figure is what the chain quotes, the subtext is what that means
             * in your money and how soon. */
            ethGas: {
              label: msg("widget_eth_gas", "ETH Gas"),
              visible: widgets.ethGas && !hidden.ethGas,
              content: ethGasData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      WidgetValue,
                      null,
                      gweiText(ethGasData.gwei) + " gwei",
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      feeSubtext(
                        ethGasData.transferEth,
                        "ETH",
                        msg("widget_next_block", "next block"),
                      ),
                    ),
                  )
                : widgetSkeleton(0, "ethGasData"),
            },
            btcFees: {
              label: msg("widget_btc_fees", "BTC Fees"),
              visible: widgets.btcFees && !hidden.btcFees,
              content: btcFeesData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      WidgetValue,
                      null,
                      btcFeesData.rate + " sat/vB",
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      feeSubtext(
                        btcFeesData.transferBtc,
                        "BTC",
                        msg("widget_about_30_min", "~30 min"),
                      ),
                    ),
                    /* The other two tiers, because the spread between them is
                     * the reading: three tiers all at 1 sat/vB is an empty
                     * mempool, and no single figure says that. */
                    React.createElement(
                      WidgetSubtext,
                      null,
                      React.createElement(
                        MarketStatLabel,
                        null,
                        msg("widget_fee_fast", "Fast"),
                      ),
                      btcFeesData.fastest,
                      " · ",
                      React.createElement(
                        MarketStatLabel,
                        null,
                        msg("widget_fee_hour", "Hour"),
                      ),
                      btcFeesData.hour,
                    ),
                  )
                : widgetSkeleton(0, "btcFeesData"),
            },
            /* **The reading under the fee card.** `btcFees` says what a
             * transaction costs and cannot say why; a queue eighty thousand
             * deep is a fee that is going up, and an empty one is a fee about
             * to fall whatever it says right now.
             *
             * The headline is the queue in **blocks**, not in transactions:
             * a block holds about a million vbytes, so "3.1 blocks" is a wait
             * somebody can act on where "82,268" is a number. The count rides
             * underneath, because the two together say whether the queue is a
             * lot of small transactions or a few large ones. */
            mempool: {
              label: msg("widget_mempool", "BTC Mempool"),
              visible: widgets.mempool && !hidden.mempool,
              content: mempoolData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      WidgetValue,
                      null,
                      msg(
                        "widget_mempool_blocks",
                        "$1 blocks",
                        mempoolData.blocks.toFixed(1),
                      ),
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      msg(
                        "widget_mempool_waiting",
                        "$1 waiting",
                        formatCount(mempoolData.count),
                      ),
                    ),
                    mempoolData.feesBtc != null &&
                      React.createElement(
                        WidgetSubtext,
                        null,
                        React.createElement(
                          MarketStatLabel,
                          null,
                          msg("widget_mempool_fees", "Fees"),
                        ),
                        `${mempoolData.feesBtc.toFixed(2)} BTC`,
                      ),
                  )
                : widgetSkeleton(0, "mempoolData"),
            },
            /* The other clock Bitcoin runs on. The halving card counts down to
             * a change in the reward every four years; this one turns every
             * fortnight, and it is the honest form of "hashrate" — a number of
             * exahashes says nothing to anybody not already following it,
             * while "+4.5%, in 6 days" carries its own units. It is an
             * estimate from how fast this epoch is being mined, and the card
             * says est. because the figure moves as the fortnight goes on. */
            difficulty: {
              label: msg("widget_difficulty", "BTC Difficulty"),
              visible: widgets.difficulty && !hidden.difficulty,
              content: difficultyData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      WidgetValue,
                      /* **No colour.** Green and red mean up and down in price
                       * everywhere else here, and mining getting harder is neither
                       * good nor bad — colouring it would be this card taking a view
                       * it has no standing to take. */
                      null,
                      `${signedFixed(difficultyData.change, 1)}% est.`,
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      difficultyData.remainingMs != null
                        ? msg(
                            "widget_difficulty_in",
                            "in $1 · $2 blocks",
                            describeSpan(difficultyData.remainingMs),
                            formatCount(difficultyData.remaining),
                          )
                        : msg(
                            "widget_difficulty_blocks",
                            "$1 blocks to go",
                            formatCount(difficultyData.remaining),
                          ),
                    ),
                    difficultyData.previous != null &&
                      React.createElement(
                        WidgetSubtext,
                        null,
                        React.createElement(
                          MarketStatLabel,
                          null,
                          msg("widget_difficulty_last", "Last"),
                        ),
                        `${signedFixed(difficultyData.previous, 1)}%`,
                      ),
                  )
                : widgetSkeleton(0, "difficultyData"),
            },
            worstFall: {
              label: msg(
                "widget_worst_fall",
                "$1 Worst Fall · $2",
                activeCoin,
                periodLabel,
              ),
              visible: widgets.worstFall && !hidden.worstFall,
              content: !valueHistory.length
                ? widgetSkeleton()
                : fall
                  ? React.createElement(
                      Fragment,
                      null,
                      React.createElement(
                        WidgetValue,
                        null,
                        `−${Math.abs(fall.pct).toFixed(1)}%`,
                      ),
                      React.createElement(
                        WidgetSubtext,
                        null,
                        fallWhen(fall.from, fall.to) ||
                          msg("widget_peak_to_trough", "peak to trough"),
                      ),
                    )
                  : /* A range that only ever rose has no fall in it, and "0.0%"
                     * would read as a measurement rather than as an absence */
                    React.createElement(
                      Fragment,
                      null,
                      React.createElement(
                        WidgetValue,
                        null,
                        msg("widget_none", "None"),
                      ),
                      React.createElement(
                        WidgetSubtext,
                        null,
                        msg(
                          "widget_only_rose",
                          "it only rose across this range",
                        ),
                      ),
                    ),
            },
            rsiWidget: {
              // RSI is computed from the chart's current series, so the same
              // number means something different per coin and per range —
              // both belong in the label, like the other coin-specific widgets
              label: msg("widget_rsi", "$1 RSI · $2", activeCoin, periodLabel),
              visible: widgets.rsiWidget && !hidden.rsiWidget,
              content:
                rsiValue !== null
                  ? React.createElement(
                      Fragment,
                      null,
                      React.createElement(WidgetValue, null, rsiValue),
                      React.createElement(
                        WidgetMeter,
                        null,
                        React.createElement(WidgetMeterMark, {
                          value: Math.min(Math.max(rsiValue, 2), 98),
                        }),
                      ),
                      /* The ends of the scale, not a verdict on it.
                       *
                       * They read "Oversold" and "Overbought", which are the
                       * words the textbook attaches to 30 and 70 on the
                       * *daily* RSI — and this number is not that. It is a
                       * 14-period RSI over whatever interval the range on
                       * screen happens to give, which is 16 minutes on 1H and
                       * three and a half years on ALL; measured on live BTC at
                       * one instant the six ranges read 63.8 / 63.9 / 82.2 /
                       * 80.9 / 37.8 / 54.6 against 80.5 for the daily one. So
                       * the thresholds those words name were being printed
                       * beside a number they do not describe.
                       *
                       * The words would be worth keeping if they were right
                       * about the daily RSI either, and they are not: counting
                       * episodes over 21,669 daily closes, the 30 days after
                       * RSI 14 crosses above 70 beat the coin's ordinary month
                       * on six of eight coins (BTC +7.5pp, n=87). The evidence
                       * is in the working notes §9. A momentum reading is
                       * worth showing; telling someone what it means is not
                       * something this data supports. */
                      React.createElement(
                        RsiLabels,
                        null,
                        React.createElement(HalvingTimeLabel, null, "0"),
                        React.createElement(HalvingTimeLabel, null, "100"),
                      ),
                    )
                  : widgetSkeleton(0, "altcoinSeasonData"),
            },
            /* **The outlook card** — the range on the chart replayed forward
             * from its last price, two thousand times in blocks of eight of
             * its own steps, and where those replays landed at the next
             * horizons: the 5th to 95th as a band, the median, and how many
             * landed above where it started. Read off `valueHistory`, so it
             * costs no request, and memoised on the series' identity so the
             * two thousand replays run once per series rather than once per
             * tick. A band, never a direction — the same rule as the base
             * rates. The maths is `src/outlook.js`. */
            outlook: {
              label: msg(
                "widget_outlook",
                "$1 Outlook · $2",
                activeCoin,
                periodLabel,
              ),
              visible: widgets.outlook && !hidden.outlook,
              content: (() => {
                const series = this.state.valueHistory;
                const memo = this._outlookWidget;
                let out = memo && memo.series === series ? memo.out : undefined;
                if (out === undefined) {
                  out = null;
                  if (
                    Array.isArray(series) &&
                    series.length > OUTLOOK_MIN_BARS
                  ) {
                    const horizons = outlookHorizonBars(series, [
                      { label: msg("pp_h_1h", "1h"), seconds: 3600 },
                      { label: msg("pp_h_4h", "4h"), seconds: 4 * 3600 },
                      { label: msg("pp_h_1d", "1d"), seconds: 24 * 3600 },
                      { label: msg("pp_h_1w", "1w"), seconds: 7 * 24 * 3600 },
                      { label: msg("pp_h_1m", "1m"), seconds: 30 * 24 * 3600 },
                    ]).slice(-2);
                    const cone = horizons.length
                      ? outlookCone(series, {
                          horizons: horizons.map((h) => h.bars),
                          seed: 20260921,
                        })
                      : null;
                    if (cone && cone.n) out = { horizons, cone };
                  }
                  this._outlookWidget = { series, out };
                }
                if (!out) {
                  return React.createElement(
                    WidgetEmptyNote,
                    null,
                    msg(
                      "widget_outlook_short",
                      "Too few points on this range to replay forward — pick a longer one",
                    ),
                  );
                }
                const sym = getCurrencySymbol(currency);
                const price = (v) => formatWidgetPrice(v, sym, separatorFormat);
                const far = out.cone.horizons[out.cone.horizons.length - 1];
                return React.createElement(
                  Fragment,
                  null,
                  React.createElement(
                    WidgetValue,
                    null,
                    `${price(far.p5)} ~ ${price(far.p95)}`,
                  ),
                  ...out.horizons.map((h, i) => {
                    const q = out.cone.horizons[i];
                    return React.createElement(
                      WidgetSubtext,
                      { key: h.label, "data-widget-outlook": h.label },
                      React.createElement(MarketStatLabel, null, h.label),
                      " ",
                      msg(
                        "widget_outlook_line",
                        "median $1 · $2% of $3 above",
                        price(q.p50),
                        String(Math.round((100 * q.up) / q.n)),
                        String(q.n),
                      ),
                    );
                  }),
                  React.createElement(
                    WidgetSubtext,
                    null,
                    msg(
                      "widget_outlook_how",
                      "5th–95th of $1 replays of this range's own steps · a count, not a call",
                      String(out.cone.n),
                    ),
                  ),
                );
              })(),
            },
            /* **The regime grid** (27 Sep 2026) — the sector's 3×3, counted
             * rather than multiplied: each entry into a state and the state
             * 20 days on, beside any day, with today's row marked. The
             * preregistered run found no cell further than 8 points from any
             * day on BTC, ETH, SOL or LTC (0 of 36 after BH), so the line
             * under the grid says how far the largest gap is — the whole
             * finding — and nothing forecasts. See regime-grid.js. */
            regimes: {
              label: msg("widget_regimes", "$1 Regimes · 20d", activeCoin),
              visible: widgets.regimes && !hidden.regimes,
              content: (() => {
                const data = this.state.regimeData;
                if (!data || data.coin !== activeCoin)
                  return widgetSkeleton(4, "regimeData");
                const g = data.grid;
                const names = [
                  msg("regime_rising", "rising"),
                  msg("regime_flat", "flat"),
                  msg("regime_falling", "falling"),
                ];
                // Four letters a column: a card is a dozen em wide
                const short = [
                  msg("regime_rise_short", "rise"),
                  msg("regime_flat_short", "flat"),
                  msg("regime_fall_short", "fall"),
                ];
                const pct = (x) =>
                  x == null || !isFinite(x) ? "—" : `${Math.round(x * 100)}%`;
                let gap = null;
                for (const r of g.rows) {
                  if (r.n < BASE_RATE_MIN_EPISODES) continue;
                  r.cells.forEach((k, j) => {
                    if (g.base[j] == null) return;
                    const d = Math.abs(k / r.n - g.base[j]);
                    if (gap == null || d > gap) gap = d;
                  });
                }
                return React.createElement(
                  Fragment,
                  null,
                  React.createElement(
                    WidgetValue,
                    {
                      "data-widget-regime-now":
                        g.now == null ? "none" : String(g.now),
                    },
                    g.now == null
                      ? "—"
                      : msg(
                          "widget_regime_now",
                          "$1 · $2d",
                          names[g.now],
                          String(g.since),
                        ),
                  ),
                  React.createElement(
                    RegimeTable,
                    { "data-widget-regimes": "true" },
                    React.createElement(
                      RegimeHead,
                      { left: true, "aria-hidden": "true" },
                      "",
                    ),
                    ...short.map((n) =>
                      React.createElement(RegimeHead, { key: `h-${n}` }, n),
                    ),
                    ...g.rows
                      .map((r, i) => [
                        React.createElement(
                          RegimeCell,
                          { key: `r-${i}`, left: true, now: i === g.now },
                          `${short[i]} ${r.n}`,
                        ),
                        ...r.cells.map((k, j) =>
                          React.createElement(
                            RegimeCell,
                            {
                              key: `c-${i}-${j}`,
                              now: i === g.now,
                              quiet: r.n < BASE_RATE_MIN_EPISODES,
                              "data-regime-cell": `${i}${j}`,
                              title: msg(
                                "regime_cell_title",
                                "$1 of $2 times it began $3, it was $4 twenty days later",
                                String(k),
                                String(r.n),
                                names[i],
                                names[j],
                              ),
                            },
                            r.n ? pct(k / r.n) : "—",
                          ),
                        ),
                      ])
                      .flat(),
                    React.createElement(
                      RegimeCell,
                      { left: true, quiet: true },
                      msg("regime_any_day", "any day"),
                    ),
                    ...g.base.map((b, j) =>
                      React.createElement(
                        RegimeCell,
                        { key: `b-${j}`, quiet: true },
                        pct(b),
                      ),
                    ),
                  ),
                  React.createElement(
                    WidgetSubtext,
                    null,
                    msg(
                      "widget_regime_axes",
                      "Row: how it began. Column: 20 days later.",
                    ),
                    " ",
                    gap == null
                      ? msg(
                          "widget_regime_few",
                          "Too few episodes on this coin to compare yet.",
                        )
                      : msg(
                          "widget_regime_gap",
                          "Within $1 pts of any day — a count, not a forecast.",
                          String(Math.round(gap * 100)),
                        ),
                  ),
                );
              })(),
            },
            fundingRate: {
              label: msg("widget_funding_rate", "$1 Funding Rate", activeCoin),
              visible: widgets.fundingRate && !hidden.fundingRate,
              content: fundingRateData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      FundingValue,
                      { positive: fundingRateData.rate > 0 },
                      (fundingRateData.rate >= 0 ? "+" : "") +
                        fundingRateData.percent +
                        "%",
                    ),
                    React.createElement(
                      FundingAnnual,
                      null,
                      msg(
                        "widget_annualized",
                        "Ann. $1%",
                        (fundingRateData.annualized >= 0 ? "+" : "") +
                          fundingRateData.annualized,
                      ),
                    ),
                  )
                : widgetSkeleton(0, "fundingRateData"),
            },
            longShortRatio: {
              label: msg("widget_long_short", "$1 Long / Short", activeCoin),
              visible: widgets.longShortRatio && !hidden.longShortRatio,
              content: longShortData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      LSBarWrap,
                      null,
                      React.createElement(LSBarLong, {
                        pct: parseFloat(longShortData.longPct),
                      }),
                      React.createElement(LSBarShort, null),
                    ),
                    React.createElement(
                      LSRow,
                      null,
                      React.createElement(
                        WidgetSideValue,
                        { up: true },
                        "L " + longShortData.longPct + "%",
                      ),
                      React.createElement(
                        WidgetSideValue,
                        { up: false },
                        "S " + longShortData.shortPct + "%",
                      ),
                    ),
                  )
                : widgetSkeleton(0, "longShortData"),
            },
            openInterest: {
              label: msg(
                "widget_open_interest",
                "$1 Open Interest",
                activeCoin,
              ),
              visible: widgets.openInterest && !hidden.openInterest,
              content: openInterestData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      OIValue,
                      null,
                      openInterestData.formatted,
                    ),
                    /* The venue, not the reading's own name again. Open
                     * interest is one exchange's book — OKX's swap here — and
                     * a figure printed without it is the same defect the RSI
                     * widget's missing clock was. */
                    React.createElement(WidgetSubtext, null, "OKX perpetual"),
                  )
                : widgetSkeleton(0, "openInterestData"),
            },
            liquidations: {
              label: msg(
                "widget_liquidations",
                "$1 Liquidations 24h",
                activeCoin,
              ),
              visible: widgets.liquidations && !hidden.liquidations,
              content: liquidationsData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      OIValue,
                      null,
                      liquidationsData.totalFormatted,
                    ),
                    React.createElement(
                      LiqBarWrap,
                      null,
                      React.createElement(LiqBarLong, {
                        pct: liquidationsData.longPct,
                      }),
                      React.createElement(LiqBarShort, null),
                    ),
                    React.createElement(
                      LiqRow,
                      null,
                      // Liquidated longs are the losing side here, so the
                      // colours are the reverse of the positioning widget
                      React.createElement(
                        WidgetSideValue,
                        { up: false },
                        "L " + liquidationsData.longFormatted,
                      ),
                      React.createElement(
                        WidgetSideValue,
                        { up: true },
                        "S " + liquidationsData.shortFormatted,
                      ),
                    ),
                  )
                : widgetSkeleton(0, "liquidationsData"),
            },
            altcoinSeason: {
              label: msg("widget_altcoin_season", "Altcoin Season"),
              visible: widgets.altcoinSeason && !hidden.altcoinSeason,
              content: altcoinSeasonData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      OIValue,
                      null,
                      altcoinSeasonData.index + " / 100",
                    ),
                    React.createElement(
                      AltSeasonBar,
                      null,
                      React.createElement(AltSeasonMarker, {
                        pct: altcoinSeasonData.index,
                      }),
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      altcoinSeasonData.label,
                    ),
                    React.createElement(
                      FundingAnnual,
                      null,
                      msg(
                        "widget_btc_dom",
                        "BTC Dom $1%",
                        altcoinSeasonData.btcDom,
                      ),
                    ),
                  )
                : widgetSkeleton(0, "altcoinSeasonData"),
            },
          };

          const anyEnabled = Object.keys(widgets).some((k) => widgets[k]);
          const visibleOrder = anyEnabled
            ? widgetOrder.filter(
                (key) => widgetDefs[key] && widgetDefs[key].visible,
              )
            : [];
          const hiddenCount = Object.keys(widgets).filter(
            (k) => widgets[k] && hidden[k],
          ).length;
          const open = this.state.showWidgetsDrawer === true;
          const choosing = open && this.state.widgetsChoosing === true;
          const widgetSize = this.state.widgetSize || DEFAULT_WIDGET_SIZE;
          const widgetsWidth = this.state.widgetsWidth;
          /* **Nothing is built until it is first opened**, the chart
             drawer's rule (see ChartSettingsDrawer.shouldBuild). The box is
             mounted from the start so it has somewhere to slide from; the
             cards are not, because a dozen of them — skeleton pulses
             included — inside a shut drawer on every new tab is work
             nobody sees. Their data is fetched either way, so the first
             open has figures in it. */
          if (open) this._widgetsOpened = true;
          const cards = this._widgetsOpened
            ? visibleOrder.map((key) => {
                const def = widgetDefs[key];
                return React.createElement(
                  WidgetCard,
                  {
                    key: key,
                    // One number drives the whole card — everything inside
                    // it is sized in em against this
                    scale: widgetSizeScale(widgetSize),
                    dragging: dragWidget === key,
                    draggable: true,
                    onDragStart: () => this.onWidgetDragStart(key),
                    onDragOver: (e) => {
                      e.preventDefault();
                      this.onWidgetDragOver(key);
                    },
                    onDragEnd: this.onWidgetDragEnd,
                  },
                  React.createElement(
                    WidgetHideButton,
                    {
                      onClick: () => this.hideWidget(key),
                      title: msg("widget_hide_one", "Hide $1", def.label),
                      "aria-label": `Hide ${def.label}`,
                    },
                    "\u00d7",
                  ),
                  // Half of these labels are terms of art, and a card three
                  // words wide can't explain itself \u2014 so it hands over the
                  // same sentence Settings uses
                  React.createElement(
                    WidgetLabel,
                    { title: WIDGET_DESCRIPTIONS[key] || undefined },
                    def.label,
                  ),
                  def.content,
                );
              })
            : [];

          return React.createElement(
            ErrorBoundary,
            { key: "widget-panel-boundary", fallback: null },
            React.createElement(
              WidgetsDrawer,
              {
                open,
                role: "dialog",
                "aria-hidden": open ? undefined : "true",
                "aria-label": msg("set_tab_widgets", "Widgets"),
                "data-widgets-drawer": open ? "open" : "shut",
                innerRef: (n) => (this.widgetsDrawerNode = n),
                style: widgetsWidth
                  ? { "--widgets-w": `${widgetsWidth}px` }
                  : undefined,
              },
              /* The right edge, dragged sideways (WidgetsResize). Only while
                 the drawer is open: a shut drawer is off the screen and its
                 edge would be a focus stop on nothing. */
              open
                ? React.createElement(WidgetsResize, {
                    role: "separator",
                    tabIndex: 0,
                    "aria-orientation": "vertical",
                    "aria-label": msg("wd_resize", "Drawer width"),
                    "aria-valuemin": WIDGETS_WIDTH_MIN,
                    "aria-valuemax": WIDGETS_WIDTH_MAX,
                    "aria-valuenow": widgetsWidth || undefined,
                    "aria-valuetext": widgetsWidth
                      ? msg(
                          "wd_resize_px",
                          "$1 pixels wide",
                          String(widgetsWidth),
                        )
                      : msg("wd_resize_default", "Default width"),
                    title: msg(
                      "wd_resize_title",
                      "Drag to widen or narrow · double-click for the default width",
                    ),
                    "data-widgets-resize": widgetsWidth
                      ? String(widgetsWidth)
                      : "default",
                    dragging: this.state.widgetsResizing,
                    onPointerDown: this.startWidgetsResize,
                    onPointerMove: this.moveWidgetsResize,
                    onPointerUp: this.endWidgetsResize,
                    onPointerCancel: this.endWidgetsResize,
                    onLostPointerCapture: this.endWidgetsResize,
                    onDoubleClick: () => this.setWidgetsWidth(null),
                    onKeyDown: this.keyWidgetsResize,
                  })
                : null,
              React.createElement(
                ChartDrawerHead,
                null,
                React.createElement(
                  ChartDrawerTitle,
                  null,
                  msg("set_tab_widgets", "Widgets"),
                  keyCap("W"),
                ),
                React.createElement(
                  WidgetsDrawerTools,
                  null,
                  /* The cards' size, where the cards are (WidgetsSizeGroup).
                     It lived on the Choose view until 27 Sep 2026. */
                  React.createElement(
                    WidgetsSizeGroup,
                    {
                      role: "group",
                      "aria-label": msg("wd_card_size", "Card size"),
                      "data-widgets-size": widgetSize,
                    },
                    ...WIDGET_SIZE_OPTIONS.map((option) =>
                      React.createElement(
                        WidgetsSizeButton,
                        {
                          key: option.value,
                          active: widgetSize === option.value,
                          "aria-pressed":
                            widgetSize === option.value ? "true" : "false",
                          "aria-label": msg(
                            "wd_size_aria",
                            "$1 cards",
                            option.label,
                          ),
                          title: option.label,
                          onClick: () =>
                            this.handleWidgetSizeChange(option.value),
                        },
                        option.short,
                      ),
                    ),
                  ),
                  /* The drawer's two views: the cards, and the switches
                     that choose them (see widgetChooser). One button, in
                     the head where it is found before the list is. */
                  React.createElement(
                    WidgetsDrawerAction,
                    {
                      "data-widgets-choose": choosing ? "on" : "off",
                      "aria-pressed": choosing ? "true" : "false",
                      onClick: () =>
                        this.setState({ widgetsChoosing: !choosing }),
                    },
                    choosing
                      ? msg("wd_done", "Done")
                      : msg("wd_edit", "Choose"),
                  ),
                  React.createElement(
                    ChartDrawerClose,
                    {
                      onClick: () =>
                        this.setState({
                          showWidgetsDrawer: false,
                          widgetsChoosing: false,
                        }),
                      "aria-label": msg("wd_close", "Close the widgets"),
                    },
                    "\u00d7",
                  ),
                ),
              ),
              React.createElement(
                ChartDrawerBody,
                { gutter: false },
                choosing
                  ? widgetChooser({
                      widgets: widgets,
                      onWidgetToggle: this.handleWidgetToggle,
                      onWidgetPreset: this.handleWidgetPreset,
                    })
                  : visibleOrder.length
                    ? React.createElement(
                        WidgetPanel,
                        {
                          "data-widget-cards": "1",
                          scale: widgetSizeScale(widgetSize),
                        },
                        ...cards,
                      )
                    : React.createElement(
                        WidgetsDrawerEmpty,
                        null,
                        /* Which of the two it is, and the one press that
                         changes it: nothing switched on is answered in
                         Settings; everything hidden is answered here. */
                        anyEnabled
                          ? msg("wd_all_hidden", "Every widget is hidden.")
                          : msg("wd_none_on", "No widgets are switched on."),
                        React.createElement(
                          WidgetsDrawerAction,
                          {
                            onClick: anyEnabled
                              ? this.restoreAllWidgets
                              : this.openWidgetChooser,
                          },
                          anyEnabled
                            ? msg("widget_show_hidden", "Show hidden widgets")
                            : msg("wd_choose", "Choose widgets"),
                        ),
                      ),
                /* Some hidden, some not: the way back sits under the ones
                   that are left. It was the corner's eye button. */
                !choosing && visibleOrder.length > 0 && hiddenCount > 0
                  ? React.createElement(
                      WidgetsDrawerAction,
                      {
                        onClick: this.restoreAllWidgets,
                        style: { marginTop: "0.75rem" },
                      },
                      msg(
                        "wd_show_n_hidden",
                        "Show $1 hidden",
                        String(hiddenCount),
                      ),
                    )
                  : null,
              ),
              React.createElement(
                ChartDrawerFoot,
                null,
                msg(
                  "wd_foot_cards",
                  "Drag a card to move it, × to hide it. This drawer: ",
                ),
                React.createElement(ChartDrawerKey, null, "W"),
              ),
            ),
          );
        })(),
        // Page Ticker (two scrolling rows, collapsible with a hover chevron)
        (() => {
          const {
            pageTicker,
            pageTickerReady,
            pageTickerItems,
            pageTickerPosition,
            pageTickerCollapsed,
            newsTicker,
          } = this.state;
          if (
            showSettings ||
            showPortfolio ||
            !pageTicker ||
            !pageTickerReady ||
            !pageTickerItems ||
            pageTickerItems.length === 0
          )
            return null;

          /* Filtered here rather than at the fetch. The same `newsItems` feeds
           * the move-headlines line under the price, which is already narrowed
           * to the coin on screen — narrowing the stored list as well would
           * mean a headline about the coin you are looking at disappearing
           * because it is not one you hold. One feed, two readers, each asking
           * for what it needs. */
          const newsItems = this.filteredNews();
          const position = pageTickerPosition || DEFAULT_PAGE_TICKER_POSITION;
          return React.createElement(PageTicker, {
            items: pageTickerItems,
            position,
            collapsed: pageTickerCollapsed,
            newsTicker,
            newsItems,
            onMeasure: this.measurePageTicker,
            onToggle: this.togglePageTickerCollapsed,
          });
        })(),

        // LAZY LOADING: Only render SettingsPanel when user opens it
        /* **Rendered after the chart, deliberately.** It was up here with
             the other panels' siblings, above the chart in the tree, and the
             nine settings rows brought their info-ring icons with them — so
             the first `svg path` in the document stopped being the chart's
             line and became a hidden icon inside a shut drawer. Three browser
             suites wait on that selector. Drawn after the chart, the first
             path is the chart's again. */
        /* The phone's stand-in for the corner controls, **after the chart**
           like the drawer below it. Above the phone breakpoint its button is
           hidden, and drawn earlier its icon was the first path inside an svg
           in the document, and an invisible one — the selector every browser
           suite waits on. Every suite failed at once; the page was fine. */
        /* The screens' column on the right, after the chart for the same
           reason as the phone's button was: it carries icons. */
        this.renderScreenTabs(tickerTop, unseenNews),
        /* The drawers' folder tabs, after the chart for the reason above:
           they carry icons. */
        this.renderDrawerTabs(tickerTop),

        /* The chart's own settings, beside the chart ("V" or the control at
           the end of the range row). Always mounted, because it slides — a
           drawer that is only created when it opens has nothing to slide
           from. The props are exactly the ones the nine chart sections read;
           they are the same names `SettingsPanel` gets above, because both
           surfaces render the same builders (`settingSections`). */
        React.createElement(ChartSettingsDrawer, {
          open: this.state.showChartSettings,
          onClose: () => this.setState({ showChartSettings: false }),
          onSaveImage: this.handleSaveChartImage,
          /* The drawings, listed (app-tools.js). The list is built by the
             drawer only while it is up; the memoised array and the selection
             are what make it redraw. */
          renderDrawings: this.chartViewEnabled() ? this.renderDrawingsList : null,
          drawings: this.drawingsFor(),
          drawingSelected: this.state.drawingSelected,
          chartType: this.state.chartType,
          onChartTypeChange: this.handleChartTypeChange,
          chartColor: this.state.chartColor,
          onChartColorChange: this.handleChartColorChange,
          volumeBars: this.state.volumeBars,
          onVolumeBarsChange: this.handleVolumeBarsChange,
          chartGrid: this.state.chartGrid,
          onChartGridChange: this.handleChartGridChange,
          logScale: this.state.logScale,
          onLogScaleChange: this.handleLogScaleChange,
          chartAverage: this.state.chartAverage,
          onChartAverageChange: this.handleChartAverageChange,
          macroEvents: this.state.macroEvents,
          onMacroEventsChange: this.handleMacroEventsChange,
          companion: this.state.companion,
          onCompanionChange: this.handleCompanionChange,
          companionHidden: this.state.companionHidden,
          onCompanionMetricToggle: this.handleCompanionMetricToggle,
          indicatorOverlays: this.state.indicatorOverlays,
          onIndicatorOverlayChange: this.handleIndicatorOverlayChange,
          chartStudies: this.state.chartStudies,
          onChartStudyToggle: this.handleChartStudyToggle,
          ohlcEnabled: this.state.ohlcEnabled,
          onOhlcChange: this.handleOhlcChange,
          moveNews: this.state.moveNews,
          onMoveNewsChange: this.handleMoveNewsChange,
          quietChrome: this.state.quietChrome,
          onQuietChromeChange: this.handleQuietChromeChange,
          chartToolsShown: this.state.chartToolsShown,
          onChartToolsShownChange: this.handleChartToolsShownChange,
        }),

        // LAZY LOADING: Only render SettingsPanel when user opens it
        showSettings &&
          React.createElement(SettingsPanel, {
            /* "?" and the number keys turn its page from outside. */
            ref: (node) => {
              this.settingsRef = node;
            },
            coins: coinOptions,
            visible: showSettings,
            // Which tab to open on, when something asked for one
            initialTab: this.state.settingsTab,
            onAddCoin: this.handleAddCoinOption,
            onRemoveCoin: this.handleRemoveCoinOption,
            onReorderCoin: this.handleReorderCoinOption,
            onResetCoins: this.handleResetCoins,
            onRestoreCoins: this.handleRestoreCoins,
            // Lets the coin chips show today's move and the list be sorted
            // by it — read from the ticker snapshot, so it costs no request
            coinStats: this.coinStats(),
            /* The Permissions tab: the alarm's own handlers (one permission,
               one pair of switches — granting there arms Targets too) and the
               news refetch that a newly granted origin needs. */
            onAlarmNotifyChange: this.handleAlarmNotifyChange,
            onAlarmDrop: this.handleAlarmDrop,
            onNewsSourcesChange: this.refreshNewsSources,
            onClose: this.toggleSettings,
            themePreference: themePreference,
            activeTheme: activeTheme,
            onThemeChange: this.handleThemeChange,
            directionPalette: this.state.directionPalette,
            onDirectionPaletteChange: this.handleDirectionPaletteChange,
            language: this.state.language,
            onLanguageChange: this.handleLanguageChange,
            refreshInterval: refreshInterval,
            onRefreshIntervalChange: this.handleRefreshIntervalChange,
            decimalPlaces: decimalPlaces,
            separatorFormat: separatorFormat,
            onDecimalPlacesChange: this.handleDecimalPlacesChange,
            onSeparatorFormatChange: this.handleSeparatorFormatChange,
            currency: currency,
            onCurrencyChange: this.handleCurrencyChange,
            tickerEnabled: this.state.tickerEnabled,
            onTickerChange: this.handleTickerChange,
            tickerFormat: this.state.tickerFormat,
            onTickerFormatChange: this.handleTickerFormatChange,
            autoRotate: this.state.autoRotate,
            onAutoRotateChange: this.handleAutoRotateChange,
            autoRotateInterval: this.state.autoRotateInterval,
            onAutoRotateIntervalChange: this.handleAutoRotateIntervalChange,
            pageTicker: this.state.pageTicker,
            onPageTickerChange: this.handlePageTickerChange,
            pageTickerPosition: this.state.pageTickerPosition,
            onPageTickerPositionChange: this.handlePageTickerPositionChange,
            newsTicker: this.state.newsTicker,
            onNewsTickerChange: this.handleNewsTickerChange,
            newsFilter: this.state.newsFilter,
            onNewsFilterChange: this.handleNewsFilterChange,
            chartColor: this.state.chartColor,
            onChartColorChange: this.handleChartColorChange,
            lastSeenEnabled: this.state.lastSeenEnabled,
            onLastSeenChange: this.handleLastSeenChange,
            alertTabTitle: this.state.alertTabTitle,
            onAlertTabTitleChange: this.handleAlertTabTitleChange,
            practiceDock: this.state.practiceDock,
            onPracticeDockChange: this.setPracticeDock,
            practiceConfirm: this.state.practiceConfirm,
            onPracticeConfirmChange: this.setPracticeConfirm,
            ohlcEnabled: this.state.ohlcEnabled,
            onOhlcChange: this.handleOhlcChange,
            chartType: this.state.chartType,
            onChartTypeChange: this.handleChartTypeChange,
            volumeBars: this.state.volumeBars,
            onVolumeBarsChange: this.handleVolumeBarsChange,
            marketStats: this.state.marketStats,
            onMarketStatsChange: this.handleMarketStatsChange,
            chartGrid: this.state.chartGrid,
            onChartGridChange: this.handleChartGridChange,
            logScale: this.state.logScale,
            onLogScaleChange: this.handleLogScaleChange,
            chartAverage: this.state.chartAverage,
            onChartAverageChange: this.handleChartAverageChange,
            macroEvents: this.state.macroEvents,
            onMacroEventsChange: this.handleMacroEventsChange,
            companion: this.state.companion,
            onCompanionChange: this.handleCompanionChange,
            companionHidden: this.state.companionHidden,
            onCompanionMetricToggle: this.handleCompanionMetricToggle,
            indicatorOverlays: this.state.indicatorOverlays,
            onIndicatorOverlayChange: this.handleIndicatorOverlayChange,
            chartStudies: this.state.chartStudies,
            onChartStudyToggle: this.handleChartStudyToggle,
            moveNews: this.state.moveNews,
            onMoveNewsChange: this.handleMoveNewsChange,
            moveHeadlines: this.state.moveHeadlines,
            onMoveHeadlinesChange: this.handleMoveHeadlinesChange,
            quietChrome: this.state.quietChrome,
            onQuietChromeChange: this.handleQuietChromeChange,
            chartToolsShown: this.state.chartToolsShown,
            onChartToolsShownChange: this.handleChartToolsShownChange,
            /* The switch that offers the futures section. Consent goes with it
               so the row can say whether opening it will ask anything. */
            /* Futures' own switch is a row in the Features list now, not a
               section of its own — see `FEATURE_CONTROLS`. Consent rides along
               with the handler that grants it: the switch does not move until
               the terms under it are accepted, and accepting is what turns the
               section on. */
            practiceEnabled: this.state.practiceEnabled,
            onPracticeAccept: this.acceptPractice,
            practiceConsent: this.state.practiceConsent,
            features: this.state.features,
            onFeatureChange: this.handleFeatureChange,
            /* Modes are recognised from the settings rather than remembered, so
             * the row needs the same values the switches below it are drawn
             * from — see `activeAppMode`. */
            appMode: activeAppMode(this.modeSnapshot(), widgets),
            customSaved: Boolean(this.state.customMode),
            customActive: matchesCustomMode(
              this.modeSnapshot(),
              widgets,
              this.state.customMode,
            ),
            onSaveCustomMode: this.handleSaveCustomMode,
            onAppMode: this.handleAppMode,
            onReplayTour: () =>
              this.setState((prev) => ({
                showSettings: false,
                settingsTab: null,
                tourReplay: prev.tourReplay + 1,
              })),
          }),

        // First-run spotlight tour (self-hides after it has been seen)
        // Full-screen tracking-only portfolio
        showPortfolio &&
          React.createElement(Portfolio, {
            holdings: portfolio,
            // Ranking only — the coins you follow come first in the add search
            coinOptions,
            prices: portfolioPrices,
            ready: portfolioReady,
            currency,
            decimalPlaces,
            separatorFormat,
            chartColorize: this.state.chartColor,
            onAdd: this.handleAddHolding,
            onUpdateAmount: this.handleUpdateHoldingAmount,
            onAddLot: this.handleAddLot,
            onRemoveLot: this.handleRemoveLot,
            onAddSale: this.handleAddSale,
            onRemoveSale: this.handleRemoveSale,
            onRemove: this.handleRemoveHolding,
            onImport: this.handleImportPortfolio,
            onMerge: this.handleMergePortfolio,
            costMethod: this.state.costMethod,
            onCostMethodChange: this.handleCostMethodChange,
            onWatch: this.handleWatchAddress,
            onUnwatch: this.handleUnwatchAddress,
            hidden: this.state.portfolioHidden,
            onToggleHidden: this.togglePortfolioHidden,
            onSetTarget: this.handleSetTarget,
            onClose: this.togglePortfolio,
          }),

        /* Targets that were hit and calls that came true — one dismissible
         * toast each. The stack was gated on `firedAlerts` alone, so a call
         * settling with no target pending had nowhere to be announced. */
        (this.state.firedAlerts.length > 0 ||
          this.state.wonCalls.length > 0 ||
          this.state.closedPositions.length > 0) &&
          React.createElement(
            AlertToastStack,
            null,
            /* A futures position the market closed. Neutral badge on a
               liquidation — it is not a reading about the price, it is the
               contract's own rule — and the tone follows the money, since
               a take-profit is a win and a stop is not. */
            this.state.closedPositions.map((c) =>
              React.createElement(
                TimedToast,
                {
                  key: `pos-${c.id}`,
                  /* A fill did what the order asked, so it reads as a
                     success; an order that could not open does not. */
                  up:
                    c.reason === "fill"
                      ? true
                      : c.reason === "unfilled"
                        ? false
                        : c.realised > 0,
                  ms: POSITION_TOAST_MS,
                  onDone: () => this.dismissClosedPosition(c.id),
                },
                React.createElement(
                  AlertDirBadge,
                  {
                    up:
                      c.reason === "fill"
                        ? true
                        : c.reason === "unfilled"
                          ? false
                          : c.realised > 0,
                    "aria-hidden": "true",
                  },
                  c.reason === "liquidation" ||
                    c.reason === "warn" ||
                    c.reason === "danger" ||
                    c.reason === "unfilled"
                    ? "!"
                    : c.reason === "fill" || c.realised > 0
                      ? "\u2713"
                      : "\u2193",
                ),
                React.createElement(
                  AlertToastBody,
                  null,
                  React.createElement(
                    "div",
                    null,
                    /* **A warning is not a closure**, so it says what is
                       still true rather than what has happened: the contract
                       is open, and walking toward the rule that ends it. */
                    c.reason === "danger"
                      ? msg(
                          "app_pos_danger",
                          "$1 is about to be liquidated",
                          c.coin,
                        )
                      : c.reason === "warn"
                        ? msg(
                            "app_pos_warn",
                            "$1 is close to liquidation",
                            c.coin,
                          )
                        : c.reason === "liquidation"
                          ? msg("app_pos_liquidated", "$1 liquidated", c.coin)
                          : c.reason === "take"
                            ? msg(
                                "app_pos_took",
                                "$1 hit your take-profit",
                                c.coin,
                              )
                            : c.reason === "fill"
                              ? msg("app_pos_filled", "$1 order filled", c.coin)
                              : c.reason === "unfilled"
                                ? msg(
                                    "app_pos_unfilled",
                                    "$1 order could not open — cancelled, its margin returned",
                                    c.coin,
                                  )
                                : msg(
                                    "app_pos_stopped",
                                    "$1 stopped out",
                                    c.coin,
                                  ),
                  ),
                  React.createElement(
                    AlertToastWhen,
                    null,
                    c.reason === "fill" && c.fill
                      ? c.triggers
                        ? msg(
                            "app_pos_filled_nolevels",
                            "at $1 · simulated · its stop and take were not set: the price opened past them",
                            practicePriceText(
                              c.fill,
                              practiceSymbolFor(c.currency),
                            ),
                          )
                        : msg(
                            "app_pos_filled_at",
                            "at $1 · simulated",
                            practicePriceText(
                              c.fill,
                              practiceSymbolFor(c.currency),
                            ),
                          )
                      : c.realised == null
                        ? msg("app_pos_simulated", "simulated")
                        : /* One argument, not two. Chrome reads `$1$` in
                           `"$1$2"` as a named placeholder and refuses the
                           whole manifest — two adjacent positional
                           placeholders are not a thing the message format
                           can express, so the sign and the amount are joined
                           before they get here. */
                          msg(
                            "app_pos_result",
                            "$1 · simulated",
                            `${c.realised >= 0 ? "+" : "-"}${
                              c.settlement === PRACTICE_SETTLEMENT_COIN
                                ? practiceCoinText(Math.abs(c.realised), c.coin)
                                : practiceMoneyText(
                                    Math.abs(c.realised),
                                    getCurrencySymbol(c.currency),
                                  )
                            }`,
                          ),
                  ),
                ),
                React.createElement(
                  AlertToastClose,
                  {
                    "aria-label": msg("app_dismiss", "Dismiss"),
                    onClick: () => this.dismissClosedPosition(c.id),
                  },
                  "×",
                ),
              ),
            ),
            this.state.wonCalls.map((c) =>
              React.createElement(
                AlertToast,
                { key: `call-${c.id}`, up: true },
                React.createElement(
                  AlertDirBadge,
                  { up: true, "aria-hidden": "true" },
                  "\u2713",
                ),
                React.createElement(
                  AlertToastBody,
                  null,
                  React.createElement(
                    "div",
                    null,
                    `Called it — ${c.coin} in ` +
                      formatNumberString(
                        c.lo,
                        getCurrencySymbol(c.currency),
                        true,
                        false,
                        decimalPlaces,
                        separatorFormat,
                      ) +
                      " – " +
                      formatNumberString(
                        c.hi,
                        getCurrencySymbol(c.currency),
                        true,
                        false,
                        decimalPlaces,
                        separatorFormat,
                      ),
                  ),
                  React.createElement(
                    AlertToastWhen,
                    null,
                    c.settledPrice != null
                      ? `closed at ${formatNumberString(c.settledPrice, getCurrencySymbol(c.currency), true, false, decimalPlaces, separatorFormat)}`
                      : "settled",
                  ),
                ),
                React.createElement(
                  AlertToastClose,
                  {
                    "aria-label": msg("app_dismiss", "Dismiss"),
                    onClick: () => this.dismissWonCall(c.id),
                  },
                  "×",
                ),
              ),
            ),
            this.state.firedAlerts.map((a) =>
              React.createElement(
                AlertToast,
                { key: a.id, up: a.direction === "above" },
                React.createElement(
                  AlertDirBadge,
                  { up: a.direction === "above", "aria-hidden": "true" },
                  a.direction === "above" ? "↑" : "↓",
                ),
                React.createElement(
                  AlertToastBody,
                  null,
                  React.createElement(
                    "div",
                    null,
                    // A percent target reports the move it was watching for
                    a.kind === "percent"
                      ? `${a.coin} ${a.direction === "above" ? "rose" : "fell"} ${formatPercentValue(a.target)} in 24h`
                      : `${a.coin} hit ` +
                          formatNumberString(
                            a.target,
                            getCurrencySymbol(a.currency),
                            true,
                            false,
                            decimalPlaces,
                            separatorFormat,
                          ),
                  ),
                  React.createElement(
                    AlertToastWhen,
                    null,
                    // Candles can say when it happened; a live crossing is
                    // happening right now, so it says so
                    (a.hitAt
                      ? describeElapsed(Date.now() - a.hitAt)
                      : "just now") +
                      // What it was worth then, where the candles could say
                      (a.kind === "percent" && a.hitPrice != null
                        ? ` · ${formatNumberString(a.hitPrice, getCurrencySymbol(a.currency), true, false, decimalPlaces, separatorFormat)}`
                        : ""),
                  ),
                ),
                React.createElement(
                  AlertToastClose,
                  {
                    "aria-label": msg("app_dismiss", "Dismiss"),
                    onClick: () => this.dismissFiredAlert(a.id),
                  },
                  "×",
                ),
              ),
            ),
          ),

        // Price targets panel ("a")
        this.state.alertsView &&
          React.createElement(AlertsPanel, {
            view: this.state.alertsView,
            predict: this.state.predict,
            onPredictChange: this.handlePredictChange,

            calls: this.state.calls.open,
            settledCalls: this.state.calls.done,
            callRecord: this.state.calls.record,
            callsShowSettled: this.state.callsShowSettled,
            onCallsShowSettledChange: this.handleCallsShowSettledChange,
            travelBand: this.state.travelBand,
            onTravelBandChange: this.handleTravelBandChange,
            callsCelebrate: this.state.callsCelebrate,
            onCallsCelebrateChange: this.handleCallsCelebrateChange,
            onClearSettled: this.handleClearSettled,
            callGeometry: this.state.callGeometry,
            boardZoom: this.state.boardZoom,
            onBoardZoomChange: this.handleBoardZoomChange,
            onWithdrawCall: this.handleWithdrawCall,
            onCallConfidence: this.handleCallConfidence,
            onResetCalls: this.handleResetCalls,
            // The panel names a call's range when it is not the one on
            // screen; without this it had nothing to compare against
            // and said so on every row.
            period: this.state.period,
            /* The Pro page's range chips are the chart's own range. */
            onPeriod: (p) => this.setPeriod(null, p),
            alerts: this.state.alerts,
            /* The price last picked off the chart, stamped. The panel
                     adopts it in `componentDidUpdate` by comparing stamps, so
                     picking the same level twice still fills the form. */
            pickedPrice: this.state.pickedPrice,
            // The info card states where things stand, and whether a hit
            // is announced (and checked in the background) is part of
            // that — it is a Settings switch the panel cannot see
            alertTabTitle: this.state.alertTabTitle,
            /* The alarm belongs to the panels that raise it, not to Settings:
               the permission has to be asked for from a gesture, and the
               place somebody wants it is the screen they are setting a target
               or watching a contract on. */
            alarmNotify: this.state.alarmNotify,
            alarmSound: this.state.alarmSound,
            alarmGranted: this.state.alarmGranted,
            onAlarmNotify: this.handleAlarmNotifyChange,
            onAlarmSound: this.handleAlarmSoundChange,
            onAlarmDrop: this.handleAlarmDrop,
            coinOptions,
            activeCoin,
            /* The derivatives page is a USDT account whatever the chart shows
               (`PRACTICE_CURRENCY`); the targets keep the display currency. */
            currency:
              this.state.alertsView === "futures"
                ? PRACTICE_CURRENCY
                : currency,
            formatPrice: (value, curr) =>
              formatNumberString(
                value,
                getCurrencySymbol(curr || currency),
                true,
                false,
                decimalPlaces,
                separatorFormat,
              ),
            /* Futures live in the calls tab — see `renderPositions`
               in `src/alerts.js`. The mark is the price already on the chart,
               so a position ends on the market being watched. */
            practice: this.state.practice,
            /* Every held coin's price plus the one on screen, from the ticker
               snapshot the panel already reads — no request of its own. */
            livePrices:
              this.state.alertsView === "futures"
                ? this.practiceLivePrices()
                : (() => {
                    const out = {};
                    /* **The coins held, through the helper that knows what the store
                 is keyed by.** This read `Object.keys(positions)` — which have
                 been *contract ids* since a market could carry several — so a
                 held market was priced only when it also happened to be in the
                 coin list or on the chart, and a contract on a coin since
                 removed from the list quietly stopped being marked.
                 `practiceCoinsHeld` is the same helper the marking sweep uses. */
                    for (const c of [
                      ...(this.state.practice
                        ? practiceCoinsHeld(this.state.practice)
                        : []),
                      ...(this.state.coinOptions || []),
                      activeCoin,
                    ]) {
                      if (!c || out[c]) continue;
                      const v = this.alertPriceFor(c);
                      if (v > 0) out[c] = v;
                    }
                    return out;
                  })(),
            /* **What each held market is marked at**, beside what it last
               traded at. A venue values and liquidates a position on the mark
               and fills an order at the last price; passing both is what lets
               the panel show the same split instead of pretending there is
               one number. */
            practiceMarks: this.practiceMarkMap(),
            /* **The series the chart behind this panel is drawing.** The
               workspace's left column draws the same window with the
               contract's own levels across it, from the same two helpers the
               real chart uses — so the two cannot disagree about the shape. */
            series:
              this.state.alertsView === "futures"
                ? this.state.practiceSeries && this.state.practiceSeries.data
                : this.state.valueHistory,
            /* **The feed already in memory, and the sources switched on.**
               The workspace's left column ranks it for the market on screen
               through `newsAboutCoin` — the same predicate the ticker and the
               news panel split on — and asks for nothing of its own. */
            newsItems: this.state.newsItems,
            newsSources: this.state.newsSources,
            newsLoading: this.state.newsLoading,
            practiceEnabled: this.state.practiceEnabled,
            practiceConsent: this.state.practiceConsent,
            onPracticeAccept: this.acceptPractice,
            onPracticeOpen: this.openPractice,
            onPracticeOrder: this.placePracticeOrder,
            onPracticeCancelOrder: this.cancelPracticeOrder,
            onPracticeCancelAll: this.cancelAllPracticeOrders,
            onPracticeScale: this.placePracticeScale,
            onPracticeMoveOrder: this.movePracticeOrder,
            onPracticeFocus: this.focusPractice,
            onPracticeMarket: this.pickPracticeMarket,
            onPracticeClose: this.closePractice,
            onPracticeCloseAll: this.closeAllPractice,
            onPracticeReverse: this.reversePractice,
            onPracticeAnnotate: this.annotatePractice,
            onPracticeReduce: this.reducePractice,
            onPracticeTriggers: this.setPracticeTriggers,
            onPracticeMargin: this.addPracticeMargin,
            onPracticeMarginOut: this.removePracticeMargin,
            onPracticeDeposit: this.depositPractice,
            onPracticeSetBalance: this.setPracticeBalance,
            onPracticeNewSession: this.newPracticeSession,
            practiceUnits: this.state.practiceUnits,
            onPracticeUnits: this.setPracticeUnits,
            practiceTicket: this.state.practiceTicket,
            onPracticeTicket: this.setPracticeTicket,
            practiceConfirm: this.state.practiceConfirm,
            /* The page's own settings sheet renders the same two rows
               Settings does (settingSections), so it is handed the same
               switches and handlers. */
            onPracticeConfirmChange: this.setPracticeConfirm,
            practiceDock: this.state.practiceDock,
            onPracticeDockChange: this.setPracticeDock,
            onPracticeReset: this.resetPractice,
            onPracticeSettlement: this.setPracticeSettlement,
            onPracticePlan: this.setPracticePlan,
            onPracticeCosts: this.setPracticeCosts,
            onPracticeForget: this.forgetPracticeClosed,
            // Live prices and 24h moves, so each row can say where it stands
            // instead of only what was asked for
            stats: this.coinStats(),
            /* A portfolio target is only worth offering when there is a
             * portfolio, and its row needs the live total to say how far away
             * it is — both come from data already on hand. */
            holdings: this.state.portfolio,
            portfolioTotal: this.portfolioTotalFrom(this.alertPriceMap()),
            onAdd: this.handleAddAlert,
            onRemove: this.handleRemoveAlert,
            onRestore: this.handleRestoreAlert,
            onRearm: this.handleRearmAlert,
            onClose: () => this.setState({ alertsView: null }),
          }),

        // Quick coin jumper ("/"), doubling as the compare picker ("C")
        this.state.showQuickSwitch &&
          React.createElement(QuickSwitch, {
            coinOptions,
            compare: this.state.quickSwitchCompare,
            exclude: coinOptions[coinIndex],
            onPick: this.handleQuickSwitchPick,
            onClose: () =>
              this.setState({
                showQuickSwitch: false,
                quickSwitchCompare: false,
              }),
          }),

        // First-run spotlight tour, replayable from Settings. The key
        // remounts it so a replay re-runs from step one.
        !showSettings &&
          !showPortfolio &&
          React.createElement(OnboardingTour, {
            key: this.state.tourReplay,
            replay: this.state.tourReplay > 0,
            onActiveChange: (active) => this.setState({ tourActive: active }),
            onFinish: () => this.setState({ tourReplay: 0 }),
          }),
      ),
    );
  }
}

/* APP */
const App = () =>
  React.createElement(
    ThemeProvider,
    { theme: theme },
    React.createElement(CryptoChart, null),
  );

/* GLOBAL STYLES */
injectGlobal`
  html {
    box-sizing: border-box;
  }

  *,
  *:before,
  *:after {
    box-sizing: inherit;
  }

  html,
  body {
    min-height: 100vh;
    max-height: 100vh;
    overflow: hidden;
  }

  body {
    display: flex;
    margin: 0;
    padding: 0;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    background-color: ${theme.color.bg};
    color: ${theme.color.text};
    font-family: 'Roboto Mono', monospace;
    font-weight: 400;
    font-size: 14px;
    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  /* **Motion, when motion is unwelcome** (30 Sep 2026, the chart plan's
     Phase 6). The preference was honoured by a dozen components one at a
     time; measured with it on, 42 elements still eased and the live dot
     pulsed on. One rule for all of them: transitions and animations finish
     at once and none repeats. Nothing in the app waits for an animation's
     end event, so a finished one changes nothing but the movement. What
     the script animates goes through motionMs (theme.js). */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      animation-delay: 0s !important;
      transition-duration: 1ms !important;
      transition-delay: 0s !important;
      scroll-behavior: auto !important;
    }
  }

  /* The board's handle is an SVG group, so it takes the browser's own focus
     ring — a blue rectangle that belongs to no part of this design. It is
     drawn imperatively by the chart and cannot carry a styled-component, so
     its focus style lives here. Kept as a ring rather than removed: it is the
     only way to see where the keyboard is. */
  .pt-now-grip:focus {
    outline: none;
  }

  .pt-now-grip:focus-visible rect {
    stroke: ${theme.color.text};
    stroke-width: 2;
  }

  /* The board's zoom buttons: quiet until the pointer is near them, and a
     visible ring when the keyboard is on one. */
  .pt-zoom {
    opacity: 0.45;
    transition: opacity 0.18s ease;
  }

  .pt-zoom:hover,
  .pt-zoom:focus-within {
    opacity: 1;
  }

  .pt-zoom-btn,
  .pt-zoom-home[role="button"] {
    cursor: pointer;
  }

  /* The readout is the way back to the default reach — but only while it is
     one. At the default it carries no role, so it takes no cursor and no ring
     either, and reads as the label it is. */
  .pt-zoom-home:focus {
    outline: none;
  }

  /* The hit area, which is the first rect in the group — not the one-pixel
     rule under the number, which is a rect too and must not get a ring. */
  .pt-zoom-home:focus-visible rect:first-of-type {
    fill: ${theme.color.bg};
    stroke: ${theme.color.text};
    stroke-width: 1.5;
  }

  .pt-zoom-btn:focus {
    outline: none;
  }

  .pt-zoom-btn:focus-visible rect {
    fill: ${theme.color.bg};
    stroke: ${theme.color.text};
    stroke-width: 1.5;
  }

  @media (max-width: ${theme.breakpoint.down.sm}px) {
    body {
      padding: 0;
    }
  }

  #root {
    width: 100%;
    height: 100vh;
    max-height: 100vh;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    overflow: hidden;
  }
`;

/* RENDER */
// Plain elements + inline styles: if the app crashed, theme/styled state
// can't be trusted (body colors still come from theme-init.js)
const rootErrorFallback = React.createElement(
  "div",
  {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      height: "100vh",
      fontFamily: "'Roboto Mono', monospace",
    },
  },
  React.createElement("div", null, msg("app_error", "Something went wrong.")),
  React.createElement(
    "button",
    {
      onClick: () => location.reload(),
      style: {
        padding: "8px 20px",
        font: "inherit",
        color: "inherit",
        background: "none",
        border: "1px solid currentColor",
        borderRadius: "4px",
        cursor: "pointer",
      },
    },
    msg("app_reload", "Reload"),
  ),
);

const app = document.createElement("div");
app.setAttribute("id", "root");
document.body.appendChild(app);

const mount = () =>
  ReactDOM.render(
    React.createElement(
      ErrorBoundary,
      { fallback: rootErrorFallback },
      React.createElement(App, null),
    ),
    app,
  );

/* Language, before the first render rather than after it.
 *
 * `i18nPreload()` returns a promise **only** when there is a catalogue to
 * fetch — that is, when someone has deliberately chosen a language Chrome is
 * not in. The ordinary path (follow the browser) answers null and mounts on
 * this same tick, exactly as it did before there was an i18n file at all;
 * nobody pays for a feature they have not used. Where there is a fetch it is a
 * file already on disk in this extension's own package, and mounting first
 * would mean a visible English frame ahead of it. */
const i18nWait = typeof i18nPreload === "function" ? i18nPreload() : null;
if (i18nWait && typeof i18nWait.then === "function") {
  i18nWait.then(mount, mount);
} else {
  mount();
}
