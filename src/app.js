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
const LIGHT_THEME = { ...theme, color: lightColors };
const DARK_THEME = { ...theme, color: darkColors };

/* CRYPTO CHART */
class CryptoChart extends PureComponent {
  constructor(...args) {
    super(...args);

    // AbortController for canceling ongoing requests
    this.abortController = null;

    // Tracks which coin|currency pairs we've already background-prefetched all
    // periods for, so period switches are instant instead of a cold fetch.
    this.prefetchedKeys = new Set();

    _defineProperty(this, "state", {
      coinIndex: 0,
      currentValue: null,
      period: PERIOD_OPTIONS[0].value,
      valueHistory: [],
      coinOptions: loadCoinOptionsFromStorage(),
      showSettings: false,
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
      /* "What happened here?" — marks at the moments the price did something
       * unusual for this series, and the headlines from around them. Where the
       * marks go is local; only opening one costs a request. */
      moveNews: loadMoveNews(),
      // The mark that is open, and what came back for it. `null` for neither.
      openMove: null,      // { items, x, loading, items: [...] }
      moveHeadlinesFor: null, // the window's headlines, or null while in flight
      // Corner controls resting almost invisible — see QUIET_CHROME_KEY
      quietChrome: loadQuietChrome(),
      predict: loadPredict(), // "call the cell" — read the chart, name the box
      futureShare: loadFutureShare(), // how much of the width the board takes
      // How far the board reaches in price, per range — see BOARD_ZOOM_KEY
      boardZoom: loadBoardZoom(PERIOD_OPTIONS[0].value),
      callsShowSettled: loadCallsShowSettled(), // keep settled boxes on the chart
      callsCelebrate: loadCallsCelebrate(), // burst on a hit
      calls: loadCalls(), // { record, open } — local, valueless, never sent
      callsSeenAt: loadCallsSeenAt(), // when the calls panel was last opened
      celebrateCall: null, // the call the burst is fired on
      wonCalls: [], // settled hits waiting to be acknowledged, as toasts
      callGeometry: null, // { step, spanMs, reachMs } reported by the chart
      celebrate: 0, // bumped on a hit; the chart bursts when it changes
      fireworks: 0, // bumped on a hit worth the big show — see `settleDueCalls`
      moveHeadlines: loadMoveHeadlines(), // headlines beside an unusual move
      portfolio: loadPortfolioFromStorage(), // [{ coin, amount, lots, watches }]
      portfolioPrices: {}, // { COIN: { price, change, up } } from pageTickerCache
      portfolioReady: false, // true after first portfolio price fetch
      themePreference: loadThemeFromStorage(), // 'auto', 'light', or 'dark'
      activeTheme: getActiveTheme(loadThemeFromStorage()), // 'light' or 'dark'
      refreshInterval: loadRefreshIntervalFromStorage(), // milliseconds
      decimalPlaces: loadDecimalPlacesFromStorage(), // number of decimal places
      separatorFormat: loadSeparatorFormatFromStorage(), // 'us', 'eu', 'space'
      currency: loadCurrencyFromStorage(), // 'USD', 'EUR', 'GBP', 'TRY'
      isOffline: !navigator.onLine, // Network status
      isLoading: true, // Initial loading state
      showSkeleton: false, // Delayed skeleton (shows after 300ms)
      invalidCoin: null, // Invalid coin warning
      apiError: false, // API failure state
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
      showShortcuts: false, // "?" keyboard reference
      /* The tour drives the arrow keys and Esc itself, so the global shortcut
       * handler has to stand down while it is up. `tourReplay` is bumped by
       * Settings to remount (and force) the tour on demand. */
      tourActive: false,
      tourReplay: 0,
      alerts: loadAlerts(), // Price targets (in-tab, zero permissions)
      firedAlerts: [], // Targets just hit → toast stack
      // Announce a hit in the tab title, and keep checking while hidden
      alertTabTitle: loadAlertTabTitle(),
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
      newsSources: loadNewsPanelSources(), // { source: false } — absent is on
      newsPanelScope: loadNewsPanelFilter(), // its own scope, not the ticker's
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
      pendingWidgetReveal: {}, // Widgets enabled while settings open — mounted (animated) on close
      widgetOrder: loadWidgetOrderFromStorage(), // Drag-reorder
      dragWidget: null, // Currently dragged widget key
      fearGreedData: null, // { value, classification, timestamp }
      marketOverviewData: null, // { totalMarketCap, totalVolume, btcDominance, ... }
      halvingData: null, // { days, hours, minutes, blocksLeft, nextHalvingBlock }
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
          const wanted =
            typeof index === "function" ? index(prevState) : index;
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

      const others = PERIOD_OPTIONS.filter((p) => p.value !== this.state.period);
      const coinOptions = this.state.coinOptions;
      // Stagger requests so they don't compete with the initial render/widgets
      others.forEach((p, i) => {
        setTimeout(() => {
          fetchValueHistory(coin, p.value, currency, null, true, coinOptions).catch(
            () => {
              // Prefetch is best-effort — let the real fetch report errors
            },
          );
        }, 400 + i * 200);
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
        ["altcoinSeason", fetchAltcoinSeason, "altcoinSeasonData", false],
        ["fundingRate", fetchFundingRate, "fundingRateData", true],
        ["longShortRatio", fetchLongShortRatio, "longShortData", true],
        ["openInterest", fetchOpenInterest, "openInterestData", true],
        ["liquidations", fetchLiquidations, "liquidationsData", true],
      ];

      await Promise.all(
        jobs.map(async ([key, fetcher, field, perCoin]) => {
          if (!wanted(key)) return;
          try {
            const data = await (perCoin ? fetcher(coin) : fetcher());
            // Coin-specific answers are dropped if the coin moved on
            if (data && (!perCoin || isStillCurrent())) {
              this.queueWidgetData(field, data);
            }
          } catch (e) {
            /* silent fail — the widget keeps whatever it last had */
          }
        }),
      );
    });

    /* Hold a widget's answer until the end of the frame, then commit whatever
     * has gathered. See `fetchWidgets` for why a frame and not `Promise.all`. */
    _defineProperty(this, "queueWidgetData", (field, data) => {
      this._widgetPatch = { ...(this._widgetPatch || {}), [field]: data };
      if (this._widgetFlush) return;
      this._widgetFlush = requestAnimationFrame(() => {
        this._widgetFlush = 0;
        const patch = this._widgetPatch;
        this._widgetPatch = null;
        if (patch) this.setState(patch);
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

    _defineProperty(this, "hideAllWidgets", () => {
      const { widgets } = this.state;
      const newHidden = {};
      Object.keys(widgets).forEach((key) => {
        if (widgets[key]) newHidden[key] = true;
      });
      saveHiddenWidgetsToStorage(newHidden);
      this.setState({ hiddenWidgets: newHidden });
    });

    _defineProperty(this, "handleWidgetSizeChange", (size) => {
      saveWidgetSizeToStorage(size);
      this.setState({ widgetSize: size });
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
          // Defer mounting widgets enabled while settings is open, so their
          // entrance animation plays on close instead of behind the overlay.
          const pendingWidgetReveal = { ...prevState.pendingWidgetReveal };
          if (prevState.showSettings && enabling) {
            pendingWidgetReveal[widgetName] = true;
          } else {
            delete pendingWidgetReveal[widgetName];
          }
          return { widgets: newWidgets, pendingWidgetReveal };
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
            : fetchValueHistory(activeCoin, period, currency, signal, true, coinOptions),
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
          },
          () => {
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

      this.fetchTimeout = setTimeout(this.fetchData, refreshInterval);
    });

    _defineProperty(this, "toggleSettings", () => {
      this.setState((prevState) => ({
        showSettings: !prevState.showSettings,
        pendingWidgetReveal: {},
      }));
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
      this.setState((prev) => {
        const next = prev.alertsView === view ? null : view;
        if (next !== "calls") return { alertsView: next };
        const seen = Date.now();
        saveCallsSeenAt(seen);
        return { alertsView: next, callsSeenAt: seen };
      });
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

    _defineProperty(this, "togglePortfolio", () => {
      this.setState(
        (prevState) => ({ showPortfolio: !prevState.showPortfolio }),
        () => {
          if (this.state.showPortfolio) {
            this.fetchPortfolioPrices();
            // Refresh prices while the view stays open
            if (!this.portfolioInterval) {
              this.portfolioInterval = setInterval(
                () => this.fetchPortfolioPrices(),
                60000,
              );
            }
          } else if (this.portfolioInterval) {
            clearInterval(this.portfolioInterval);
            this.portfolioInterval = null;
          }
        },
      );
    });

    _defineProperty(this, "handleAddHolding", (coin, amount) => {
      const normalized = (coin || "").trim().toUpperCase();
      if (!SUGGESTED_COINS.includes(normalized)) return;
      this.setState((prevState) => {
        if (prevState.portfolio.some((h) => h.coin === normalized)) {
          return null; // already tracked
        }
        const amt = isFinite(Number(amount)) ? Math.max(0, Number(amount)) : 0;
        const portfolio = [
          ...prevState.portfolio,
          { coin: normalized, amount: amt, lots: [], watches: [] },
        ];
        savePortfolioToStorage(portfolio);
        return { portfolio };
      }, this.fetchPortfolioPrices);
    });

    _defineProperty(this, "handleUpdateHoldingAmount", (coin, amount) => {
      const amt = isFinite(Number(amount)) ? Math.max(0, Number(amount)) : 0;
      this.setState((prevState) => {
        const portfolio = prevState.portfolio.map((h) =>
          h.coin === coin ? { ...h, amount: amt } : h,
        );
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    });

    /* Record a sale: "sold `amount` for `received` in total".
     *
     * One action, not two. Before this, selling meant editing the amount down
     * by hand, which left the purchase lots untouched — so a position sold in
     * half still reported the whole position's gain, on coins that were gone.
     * Recording it does all three things that have to happen together: takes
     * the coins off the manual amount, consumes the matching cost basis FIFO
     * (oldest first), and keeps the disposal so the gain it produced survives
     * the lots it consumed.
     *
     * Only the hand-entered part can be sold here. A watched address reports
     * its own balance from the chain and reconciles itself; what it cannot
     * know is the price you sold at, so a sale out of a watched address is
     * still just a balance going down.
     */
    _defineProperty(this, "handleAddSale", (coin, amount, received) => {
      const amt = Number(amount);
      const got = Number(received);
      if (!isFinite(amt) || amt <= 0 || !isFinite(got) || got < 0) return;
      this.setState((prevState) => {
        const holding = prevState.portfolio.find((h) => h.coin === coin);
        if (!holding) return null;
        const sales = holding.sales || [];
        if (sales.length >= MAX_SALES_PER_HOLDING) return null;
        // Can't sell what the hand-entered part doesn't hold
        const sold = Math.min(amt, holding.amount || 0);
        if (!(sold > 0)) return null;
        const lots = holding.lots || [];
        const { basis, covered, matched } = consumeLotsFifo(lots, sold);
        const portfolio = prevState.portfolio.map((h) =>
          h.coin === coin
            ? {
                ...h,
                amount: Math.max(0, h.amount - sold),
                lots: reduceLotsFifo(lots, sold),
                sales: [
                  ...sales,
                  {
                    amount: sold,
                    // Proceeds scale with what was actually sold, in case the
                    // entry asked for more than the holding had
                    received: got * (sold / amt),
                    basis,
                    basisAmount: covered,
                    // Which purchases it consumed, so the report can pair
                    // each acquisition with this disposal
                    matched,
                    time: Math.floor(Date.now() / 1000),
                  },
                ],
              }
            : h,
        );
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    });

    _defineProperty(this, "handleRemoveSale", (coin, index) => {
      this.setState((prevState) => {
        const portfolio = prevState.portfolio.map((h) =>
          h.coin === coin
            ? { ...h, sales: (h.sales || []).filter((_, i) => i !== index) }
            : h,
        );
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    });

    // Log a purchase lot: "bought `amount` for `paid` in total" (dated now —
    // the date only matters for chain-inferred lots and the tax report)
    _defineProperty(this, "handleAddLot", (coin, amount, paid) => {
      const amt = Number(amount);
      const cost = Number(paid);
      if (!isFinite(amt) || amt <= 0 || !isFinite(cost) || cost < 0) return;
      this.setState((prevState) => {
        const portfolio = prevState.portfolio.map((h) => {
          if (h.coin !== coin || h.lots.length >= MAX_LOTS_PER_HOLDING) {
            return h;
          }
          return {
            ...h,
            lots: [
              ...h.lots,
              {
                amount: amt,
                paid: cost,
                time: Math.floor(Date.now() / 1000),
                source: "manual",
              },
            ],
          };
        });
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    });

    _defineProperty(this, "handleRemoveLot", (coin, index) => {
      this.setState((prevState) => {
        const portfolio = prevState.portfolio.map((h) =>
          h.coin === coin
            ? { ...h, lots: h.lots.filter((_, i) => i !== index) }
            : h,
        );
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    });

    // Chain lots for a watched address. BTC: replay the real transfer
    // history (plus a synthetic opening lot when the 50-tx page doesn't
    // reach back to the full balance). Other chains expose no cheap history,
    // so the whole balance becomes one lot priced at the watch date.
    _defineProperty(this, "buildChainLots", async (coin, address, balance) => {
      const priceAt = await makePortfolioPriceAt(coin, this.state.currency);
      const nowSec = Math.floor(Date.now() / 1000);
      if (coin === "BTC") {
        const deltas = await fetchBtcAddressDeltas(address);
        if (deltas) {
          const seen = deltas.reduce((sum, d) => sum + d.delta, 0);
          const opening = balance - seen;
          const all =
            opening > 1e-8
              ? [
                  {
                    time: deltas.length ? deltas[0].time : nowSec,
                    delta: opening,
                  },
                  ...deltas,
                ]
              : deltas;
          return buildLotsFromDeltas(all, priceAt);
        }
      }
      if (!(balance > 0)) return [];
      const price = priceAt(nowSec);
      return [
        {
          amount: balance,
          paid: price != null ? price * balance : 0,
          time: nowSec,
          source: "chain",
        },
      ];
    });

    // Watch an on-chain address: reads its public balance and keeps the
    // holding's amount synced to it. Returns false when the coin/address is
    // unsupported or the provider can't resolve it (caller shows an error).
    /* Watch an address. The address says which chain it is on, so there is
     * nothing to pick: paste it and every positive balance it holds becomes
     * a holding — the native coin plus, on Ethereum, its tokens. Returns
     * false when nothing could be read, so the panel can say so. */
    _defineProperty(this, "handleWatchAddress", async (address) => {
      const addr = (address || "").trim();
      const chain = detectAddressChain(addr);
      if (!chain || !WATCH_ADDRESS_RE.test(addr)) return false;

      // The native balance, and on Ethereum every token in one batched call
      const [native, tokens] = await Promise.all([
        fetchAddressBalance(chain, addr),
        chain === "ETH"
          ? fetchErc20Balances(addr, Object.keys(ERC20_TOKENS))
          : Promise.resolve({}),
      ]);

      const found = [];
      if (native != null && native > 0) found.push({ coin: chain, amount: native });
      for (const coin of Object.keys(tokens)) {
        if (tokens[coin] > 0) found.push({ coin, amount: tokens[coin] });
      }
      // An address we can't read, or one holding nothing, isn't worth adding
      if (!found.length) return false;

      /* The native coin's lots come from its transfer history where the
       * chain exposes one; tokens start without lots, so their cost basis
       * is the user's to fill in. */
      const lotsByCoin = {};
      const nativeEntry = found.find((f) => f.coin === chain);
      if (nativeEntry) {
        try {
          lotsByCoin[chain] = await this.buildChainLots(
            chain,
            addr,
            nativeEntry.amount,
          );
        } catch (e) {
          lotsByCoin[chain] = [];
        }
      }

      this.setState((prevState) => {
        let portfolio = prevState.portfolio;
        for (const { coin, amount } of found) {
          const watch = { address: addr, amount, lots: lotsByCoin[coin] || [] };
          const existing = portfolio.find((h) => h.coin === coin);
          if (!existing) {
            if (portfolio.length >= PORTFOLIO_MAX_HOLDINGS) break;
            portfolio = [
              ...portfolio,
              { coin, amount: 0, lots: [], watches: [watch] },
            ];
            continue;
          }
          if (
            !existing.watches.some((w) => w.address === addr) &&
            existing.watches.length >= MAX_WATCHES_PER_HOLDING
          ) {
            continue;
          }
          portfolio = portfolio.map((h) =>
            h.coin === coin
              ? {
                  ...h,
                  watches: h.watches.some((w) => w.address === addr)
                    ? h.watches.map((w) =>
                        w.address === addr ? watch : w,
                      )
                    : [...h.watches, watch],
                }
              : h,
          );
        }
        savePortfolioToStorage(portfolio);
        return { portfolio };
      }, this.fetchPortfolioPrices);
      return true;
    });

    // Stop watching one address. What it contributed folds into the manual
    // part, so the totals and P/L stay exactly as they were.
    _defineProperty(this, "handleUnwatchAddress", (coin, address) => {
      this.setState((prevState) => {
        const portfolio = prevState.portfolio.map((h) => {
          if (h.coin !== coin) return h;
          const gone = h.watches.find((w) => w.address === address);
          if (!gone) return h;
          return {
            ...h,
            amount: h.amount + gone.amount,
            lots: [...h.lots, ...gone.lots].slice(0, MAX_LOTS_PER_HOLDING),
            watches: h.watches.filter((w) => w.address !== address),
          };
        });
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    });

    // JSON restore: replaces current holdings. Runs through the same
    // whitelist validation as storage, so a hand-edited file can't inject
    // junk. Returns false when nothing valid survives (caller shows an error).
    _defineProperty(this, "handleImportPortfolio", (list) => {
      const portfolio = sanitizePortfolio(list).slice(0, PORTFOLIO_MAX_HOLDINGS);
      if (!portfolio.length) return false;
      savePortfolioToStorage(portfolio);
      this.setState({ portfolio }, this.fetchPortfolioPrices);
      return true;
    });

    _defineProperty(this, "handleRemoveHolding", (coin) => {
      this.setState((prevState) => {
        const portfolio = prevState.portfolio.filter((h) => h.coin !== coin);
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    });

    // Ensure every held coin has a fresh price in the shared pageTickerCache,
    // then publish a coin→price map into state for the Portfolio view.
    /* One refresh at a time, and never a request that is simply dropped.
     *
     * A run takes as long as its slowest address lookup, and the two things
     * that ask for a refresh — opening the view and adding a holding — both
     * land inside that window. The in-flight guard used to return and leave
     * nothing behind, so a coin added while a refresh was running had no price
     * until the sixty-second interval came round: measured, BTC priced and ETH
     * blank six seconds after the refresh finished. The ask is remembered now
     * and honoured once the current run ends.
     *
     * The generation counter answers the other half: a run publishes a
     * snapshot of the coins and the currency it *started* with, so a slow run
     * finishing after the currency changed would overwrite the newer prices
     * with older ones. A run that is no longer the newest publishes nothing. */
    _defineProperty(this, "fetchPortfolioPrices", async () => {
      if (document.hidden) return;
      if (this._portfolioFetching) {
        this._portfolioPending = true;
        return;
      }
      const generation = ++this._portfolioRun;
      const holdings = this.state.portfolio;
      if (!holdings.length) {
        this.setState({ portfolioPrices: {}, portfolioReady: true });
        return;
      }
      this._portfolioFetching = true;
      const curr = this.state.currency;
      const coins = holdings.map((h) => h.coin);

      // Re-sync every watched address so values use fresh balances.
      // fetchAddressBalance caches per address (10 min), so this is usually
      // free; failures keep the last synced amount. On a change the lots
      // update too: BTC replays the real transfer history, other chains log
      // the delta as a buy at today's price (or FIFO-consume on a decrease).
      /* Token balances for one address all come from one batched call, so
       * a portfolio watching a dozen tokens costs a single request instead
       * of a dozen. The per-watch loop below then reads them from cache. */
      const tokensByAddress = new Map();
      for (const h of holdings) {
        if (!ERC20_TOKENS[h.coin]) continue;
        for (const w of h.watches) {
          if (!tokensByAddress.has(w.address)) tokensByAddress.set(w.address, []);
          tokensByAddress.get(w.address).push(h.coin);
        }
      }
      for (const [addr, coins] of tokensByAddress) {
        await fetchErc20Balances(addr, coins);
      }

      for (const h of holdings) {
        if (!isWatchableCoin(h.coin)) continue;
        for (const w of h.watches) {
          const balance = await fetchAddressBalance(h.coin, w.address);
          if (balance == null || balance === w.amount) continue;
          let lots = w.lots;
          try {
            if (h.coin === "BTC") {
              lots = await this.buildChainLots(h.coin, w.address, balance);
            } else if (balance > w.amount) {
              const priceAt = await makePortfolioPriceAt(h.coin, curr);
              const nowSec = Math.floor(Date.now() / 1000);
              const price = priceAt(nowSec);
              const delta = balance - w.amount;
              lots = [
                ...w.lots,
                {
                  amount: delta,
                  paid: price != null ? price * delta : 0,
                  time: nowSec,
                  source: "chain",
                },
              ].slice(0, MAX_LOTS_PER_HOLDING);
            } else {
              lots = reduceLotsFifo(w.lots, w.amount - balance);
            }
          } catch (e) {
            // keep the existing lots — the amount still updates below
          }
          this.setState((prevState) => {
            const portfolio = prevState.portfolio.map((p) =>
              p.coin === h.coin
                ? {
                    ...p,
                    watches: p.watches.map((pw) =>
                      pw.address === w.address
                        ? { ...pw, amount: balance, lots }
                        : pw,
                    ),
                  }
                : p,
            );
            savePortfolioToStorage(portfolio);
            return { portfolio };
          });
        }
      }

      try {
        // Bulk path (Coinlore top-100) covers most coins in one request
        await bulkRefreshPageTickerCache(coins, curr);

        // Per-coin fallback for anything still missing/stale (Coinbase)
        const stale = coins.filter((c) => {
          const e = pageTickerCache.get(`${c}-${curr}`);
          return !e || Date.now() - e.timestamp > PAGE_TICKER_TTL;
        });
        for (let i = 0; i < stale.length; i += 4) {
          await Promise.all(
            stale
              .slice(i, i + 4)
              .map((c) => refreshPageTickerCoin(c, curr, Date.now())),
          );
        }
      } catch (e) {
        // Best-effort — show whatever the cache already has
      }

      const prices = {};
      coins.forEach((c) => {
        const e = pageTickerCache.get(`${c}-${curr}`);
        if (e) prices[c] = { price: e.price, change: e.change, up: e.up };
      });
      this._portfolioFetching = false;
      // A newer run has already started: this snapshot is the older answer to
      // a question that has since changed, and publishing it would undo theirs
      if (generation === this._portfolioRun) {
        this.setState({ portfolioPrices: prices, portfolioReady: true });
      }
      if (this._portfolioPending) {
        this._portfolioPending = false;
        this.fetchPortfolioPrices();
      }
    });

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

      // Esc always closes the open overlay (settings or portfolio)
      if (e.key === "Escape") {
        if (this.state.showShortcuts) {
          e.preventDefault();
          this.setState({ showShortcuts: false });
        } else if (this.state.showQuickSwitch) {
          e.preventDefault();
          this.setState({ showQuickSwitch: false, quickSwitchCompare: false });
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
      // S toggles settings — but not underneath another overlay
      if (
        (e.key === "s" || e.key === "S") &&
        !this.state.showPortfolio &&
        !this.state.alertsView &&
        !this.state.showNews &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.toggleSettings();
        return;
      }

      /* A opens targets and K opens calls, both mirroring S. They share the
       * one slot, so pressing the other key while one is up swaps the card
       * rather than closing it — the guards below exclude the *other*
       * overlays, not each other. */
      if (
        (e.key === "a" || e.key === "A" || e.key === "k" || e.key === "K") &&
        !this.state.showPortfolio &&
        !this.state.showSettings &&
        !this.state.showNews &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.toggleAlertsView(
          e.key === "k" || e.key === "K" ? "calls" : "targets",
        );
        return;
      }

      /* N opens the news panel, mirroring S, A/K and P. It excludes the other
       * overlays and they exclude it: one card in the middle of the screen at
       * a time is the rule this corner already follows. */
      if (
        (e.key === "n" || e.key === "N") &&
        !this.state.showPortfolio &&
        !this.state.showSettings &&
        !this.state.alertsView &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.toggleNews();
        return;
      }

      // P opens the portfolio, mirroring S and A
      if (
        (e.key === "p" || e.key === "P") &&
        !this.state.showSettings &&
        !this.state.alertsView &&
        !this.state.showNews &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.togglePortfolio();
        return;
      }

      // "?" lists the shortcuts — reachable from anywhere but a text field
      if (e.key === "?") {
        e.preventDefault();
        this.setState((prev) => ({ showShortcuts: !prev.showShortcuts }));
        return;
      }

      // Remaining shortcuts act on the chart — disabled while an overlay covers it
      if (
        this.state.showSettings ||
        this.state.showPortfolio ||
        this.state.showQuickSwitch ||
        this.state.alertsView ||
        this.state.showShortcuts
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
      if (e.key === "c" || e.key === "C") {
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
      if (this.state.predict && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        this.handleBoardZoomChange(
          (() => {
            const at = BOARD_ZOOM_STEPS.indexOf(this.state.boardZoom);
            const i = at === -1 ? BOARD_ZOOM_STEPS.indexOf(DEFAULT_BOARD_ZOOM) : at;
            const next = i + (e.key === "[" ? 1 : -1);
            return BOARD_ZOOM_STEPS[
              Math.min(BOARD_ZOOM_STEPS.length - 1, Math.max(0, next))
            ];
          })(),
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
      if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        if (this.overviewRef) this.overviewRef.togglePercentage();
        return;
      }

      // W clears the widget row, or brings back everything hidden from it
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        if (Object.keys(this.state.hiddenWidgets).length) {
          this.restoreAllWidgets();
        } else {
          this.hideAllWidgets();
        }
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

    /* ── price targets (in-tab) ── */

    _defineProperty(this, "handleAddAlert", (coin, kind, direction, target) => {
      this.setState((prev) => {
        if (prev.alerts.length >= MAX_ALERTS) return null;
        const alerts = [
          ...prev.alerts,
          {
            id: `${coin}-${kind}-${direction}-${Date.now()}`,
            coin,
            kind,
            direction,
            target,
            currency: prev.currency,
            created: Date.now(),
            // Where the price was when this was set, so the panel can show
            // how far it has come rather than only how far is left
            startPrice: this.alertPriceFor(coin, prev),
            triggeredAt: null,
            hitPrice: null,
          },
        ];
        saveAlerts(alerts);
        return { alerts };
      }, this.checkAlerts);
    });

    /* Re-arm a target that has been hit. It keeps its number and direction —
     * that was the point of it — but starts again from now, so the candle
     * lookback can't immediately re-report the crossing it just reported. */
    _defineProperty(this, "handleRearmAlert", (id) => {
      this.setState((prev) => {
        const alerts = prev.alerts.map((a) =>
          a.id === id
            ? {
                ...a,
                created: Date.now(),
                startPrice: this.alertPriceFor(a.coin, prev),
                triggeredAt: null,
                hitPrice: null,
              }
            : a,
        );
        saveAlerts(alerts);
        return {
          alerts,
          firedAlerts: prev.firedAlerts.filter((f) => f.id !== id),
        };
      }, this.checkAlerts);
    });

    // Best price we have for a coin in the displayed currency: the chart's
    // own value for the active coin, the ticker snapshot otherwise.
    _defineProperty(this, "alertPriceFor", (coin, state) => {
      const s = state || this.state;
      if (coin === s.coinOptions[s.coinIndex]) {
        const live = Number(s.currentValue);
        if (isFinite(live) && live > 0) return live;
      }
      const entry = pageTickerCache.get(`${coin}-${s.currency}`);
      return entry && isFinite(entry.price) && entry.price > 0
        ? entry.price
        : null;
    });

    _defineProperty(this, "handleRemoveAlert", (id) => {
      this.setState((prev) => {
        const alerts = prev.alerts.filter((a) => a.id !== id);
        saveAlerts(alerts);
        return { alerts, firedAlerts: prev.firedAlerts.filter((a) => a.id !== id) };
      });
    });

    /* Put a removed target back exactly as it was — same id, same created
     * time, same start price. Rebuilding it from the form would lose all
     * three, which is the reason undo exists rather than "type it again". */
    _defineProperty(this, "handleRestoreAlert", (alert) => {
      this.setState((prev) => {
        if (prev.alerts.length >= MAX_ALERTS) return null;
        if (prev.alerts.some((a) => a.id === alert.id)) return null;
        const alerts = [...prev.alerts, alert];
        saveAlerts(alerts);
        return { alerts };
      }, this.checkAlerts);
    });

    /* ── announcing a hit in the tab title ──
     *
     * What a hit looks like from another tab. The text alternates with a
     * short marker rather than sitting still: a tab strip shows a dozen
     * truncated titles and a static one among them is easy to miss, while
     * something that changes catches the eye the way an unread count does.
     *
     * It stops the moment you look at the tab — the banner is right there and
     * a title still flashing at a page you are reading is just noise. The
     * announcement itself stays until the banner is dismissed, so a hit
     * noticed out of the corner of your eye is still there when you arrive.
     */
    _defineProperty(this, "alertTitleText", () => {
      const fired = this.state.firedAlerts;
      if (!fired.length) return null;
      const first = fired[0];
      const what =
        first.kind === "percent"
          ? `${first.coin} ${first.direction === "above" ? "rose" : "fell"} ${formatPercentValue(first.target)}`
          : `${first.coin} hit ${formatNumberString(
              first.target,
              getCurrencySymbol(first.currency),
              true,
              false,
              this.state.decimalPlaces,
              this.state.separatorFormat,
            )}`;
      return fired.length > 1 ? `${what} +${fired.length - 1} more` : what;
    });

    _defineProperty(this, "syncAlertTitle", () => {
      const wanted =
        this.state.alertTabTitle && this.state.firedAlerts.length > 0;
      if (!wanted) {
        this.stopAlertTitle();
        return;
      }
      this._alertTitleActive = true;
      // Visible tab: state it once and leave it alone. Hidden tab: alternate,
      // so the change is what draws the eye rather than the text.
      const paint = () => {
        const text = this.alertTitleText();
        if (!text) return;
        if (document.hidden) {
          this._alertTitleFlip = !this._alertTitleFlip;
          document.title = this._alertTitleFlip ? `● ${text}` : "● ● ●";
        } else {
          document.title = `● ${text}`;
        }
      };
      paint();
      clearInterval(this.alertTitleTimer);
      this.alertTitleTimer = setInterval(paint, ALERT_TITLE_FLASH_MS);
    });

    _defineProperty(this, "stopAlertTitle", () => {
      if (this.alertTitleTimer) {
        clearInterval(this.alertTitleTimer);
        this.alertTitleTimer = null;
      }
      if (!this._alertTitleActive) return;
      this._alertTitleActive = false;
      this._alertTitleFlip = false;
      // Hand the title back to whoever had it
      this.setTabTitle(
        this.state.coinOptions,
        this.state.coinIndex,
        this.state.currentValue,
        this.state.valueHistory,
      );
    });

    /* Keeps checking targets while the tab is hidden — the one thing in the
     * extension that fetches while you are looking elsewhere, because a
     * target nobody checks can't be announced. Bounded on every side: only
     * with an armed target, only that target's coins (one bulk request, and
     * the candle lookback is cached), only slowly, and only while the
     * announcement setting is on, which is what makes the switch a real off
     * switch for the background work rather than for the message alone.
     */
    _defineProperty(this, "syncAlertBackgroundPoll", () => {
      const armed = this.state.alerts.some((a) => !a.triggeredAt);
      const wanted = this.state.alertTabTitle && armed;
      if (wanted === Boolean(this.alertPollInterval)) return;
      if (wanted) {
        this.alertPollInterval = setInterval(() => {
          if (!document.hidden) return; // the normal fetch loop has it
          this.refreshAlertPrices();
        }, ALERT_BACKGROUND_POLL_MS);
      } else {
        clearInterval(this.alertPollInterval);
        this.alertPollInterval = null;
      }
    });

    _defineProperty(this, "handleAlertTabTitleChange", (enabled) => {
      saveAlertTabTitle(enabled);
      this.setState({ alertTabTitle: enabled }, () => {
        this.syncAlertTitle();
        this.syncAlertBackgroundPoll();
      });
    });

    _defineProperty(this, "dismissFiredAlert", (id) => {
      this.setState((prev) => ({
        firedAlerts: prev.firedAlerts.filter((a) => a.id !== id),
      }));
    });

    // Check every armed alert against the freshest prices we have. Runs
    // after each fetch; the active coin's price comes from state, the rest
    // from the shared ticker cache (filled by the bulk sweep below).
    _defineProperty(this, "checkAlerts", async () => {
      const { alerts, currency } = this.state;
      if (!alerts.some((a) => !a.triggeredAt)) return;
      const prices = {};
      const activeCoin = this.state.coinOptions[this.state.coinIndex];
      /* The chart's own value is the freshest thing we have for the active
       * coin — but only while the tab is being looked at. Hidden, the chart
       * loop is paused and that number is however old the tab is, while the
       * background check's own sweep is seconds old, so state must not win. */
      if (
        !document.hidden &&
        activeCoin &&
        isFinite(Number(this.state.currentValue))
      ) {
        prices[activeCoin] = Number(this.state.currentValue);
      }
      const watched = alertCoinsToWatch(alerts, currency);
      // Percent targets compare against the 24h change, which the ticker
      // snapshot already carries — no request of their own
      const changes = {};
      for (const coin of watched) {
        const entry = pageTickerCache.get(`${coin}-${currency}`);
        if (!entry) continue;
        if (prices[coin] == null && isFinite(entry.price)) {
          prices[coin] = entry.price;
        }
        if (isFinite(entry.change)) changes[coin] = entry.change;
      }
      // Candle history catches targets hit while no tab was open. Cached
      // for 5 minutes and only fetched for coins with an armed target.
      const candlesByCoin = {};
      await Promise.all(
        watched.map(async (coin) => {
          const candles = await fetchTargetCandles(coin, currency);
          if (candles) candlesByCoin[coin] = candles;
        }),
      );
      const fired = findTriggeredAlerts(
        alerts,
        prices,
        currency,
        candlesByCoin,
        changes,
      );
      if (!fired.length) return;
      // Record when it was actually hit, not when we noticed, and what it was
      // worth then — the row still says so days later
      const hits = new Map(fired.map((a) => [a.id, a]));
      this.setState((prev) => {
        const now = Date.now();
        const updated = prev.alerts.map((a) => {
          const hit = hits.get(a.id);
          if (!hit) return a;
          return {
            ...a,
            triggeredAt: hit.hitAt || now,
            hitPrice: hit.hitPrice != null ? hit.hitPrice : a.hitPrice,
          };
        });
        saveAlerts(updated);
        return { alerts: updated, firedAlerts: [...prev.firedAlerts, ...fired] };
      });
    });

    /* What price, 24h move and market cap we currently know for every
     * supported coin. Both the targets panel and the Settings coin list read
     * it: the first so a target can name any coin, the second so the coin
     * chips can say how their coin is doing.
     *
     * Everything comes from data already on hand — the chart's own value for
     * the active coin, the ticker snapshot for the rest — so opening either
     * panel costs no request. A coin with no snapshot yet is simply absent,
     * and the panels show nothing rather than a placeholder pretending to be
     * a price. Built only while a panel is open: every call site sits behind
     * that panel's render guard.
     */
    _defineProperty(this, "coinStats", () => {
      const out = {};
      const currency = this.state.currency;
      for (const coin of SUGGESTED_COINS) {
        const entry = pageTickerCache.get(`${coin}-${currency}`);
        const price = this.alertPriceFor(coin);
        if (price == null && !entry) continue;
        out[coin] = {
          price,
          change: entry && isFinite(entry.change) ? entry.change : null,
          marketCap:
            entry && isFinite(entry.marketCap) ? entry.marketCap : null,
        };
      }
      return out;
    });

    // Alerts on coins other than the active one need prices too — one bulk
    // request covers them all, and only runs when such alerts exist.
    _defineProperty(this, "refreshAlertPrices", async () => {
      const { alerts, currency, coinOptions, coinIndex } = this.state;
      const activeCoin = coinOptions[coinIndex];
      const coins = alertCoinsToWatch(alerts, currency).filter(
        (c) => c !== activeCoin,
      );
      if (!coins.length) return;
      try {
        await bulkRefreshPageTickerCache(coins, currency);
      } catch (e) {
        // Best effort — the next cycle tries again
      }
      this.checkAlerts();
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

    // What both the "C" key and the button in the range row do
    _defineProperty(this, "toggleCompare", () => {
      if (this.state.compareCoin) this.clearCompare();
      else this.setState({ showQuickSwitch: true, quickSwitchCompare: true });
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
          intensity: tint
            ? Math.min(0.3, 0.05 + Math.abs(c.change) / 55)
            : 0,
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

    _defineProperty(this, "handleThemeChange", (newTheme) => {
      saveThemeToStorage(newTheme);
      const activeTheme = getActiveTheme(newTheme);
      this.setState({
        themePreference: newTheme,
        activeTheme: activeTheme,
      });
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

    /* Who wants the feed. Three consumers now — the scrolling row, the
     * move-headlines line under the price, and the portfolio's own strip —
     * and the loader and the poller have to agree about it or one of them is
     * always wrong. That was not hypothetical: the poller once asked only
     * about the row, so a tab with headlines on and the ticker off made no
     * news request at all on load. Two copies of the condition became three,
     * which is where a condition stops being a condition and becomes a name. */
    _defineProperty(this, "newsWanted", () =>
      Boolean(
        this.state.newsTicker ||
          this.state.moveHeadlines ||
          this.state.showNews,
      ),
    );

    _defineProperty(this, "fetchNewsData", async () => {
      if (!this.newsWanted()) return;
      /* A fetch already running does not mean this one has nothing to do.
       *
       * `refreshNewsSources` is called the moment a permission is granted, and
       * the fetch in flight resolved the permission state *before* the grant —
       * so its source list excludes the newsrooms that just became readable,
       * and it will write that answer into the cache. Returning here left the
       * panel saying it was reading six newsrooms while showing none of them,
       * with nothing to correct it until the ten-minute poll. So the request
       * is remembered and re-run when the current one lands, rather than
       * dropped. */
      if (this._newsFetching) {
        this._newsAgain = true;
        return;
      }

      /* Serve from cache while fresh — through the sanitizer, like every
       * other stored shape. A cache that survived a version upgrade or a hand
       * edit is untrusted input, and its `url` becomes an `href`. If nothing
       * survives the check, fall through and fetch rather than render the
       * remains: an empty row from a corrupt cache would look like a dead
       * feature and would keep looking like one for the rest of the TTL. */
      const cached = loadJsonSetting(NEWS_CACHE_KEY);
      if (cached && Date.now() - cached.t < NEWS_REFRESH_MS) {
        const items = sanitizeNewsItems(cached.items);
        if (items.length) {
          this.setState({ newsItems: items });
          return;
        }
      }

      this._newsFetching = true;
      this.setState({ newsLoading: true });
      try {
        /* Every source that can be read right now, asked at once. Hacker News
         * always; a newsroom only once Chrome has actually granted that
         * origin, which is a question with a real answer rather than a setting
         * — the permission can be revoked from chrome://extensions without
         * this app being told, and it can be revoked one origin at a time.
         * `fetchNewsSource` never throws, and answers `null` for "did not
         * answer", which is not the same as an empty feed and is why the panel
         * can say which sources are quiet. */
        const granted = await grantedNewsSources();
        this.setState({ newsGranted: granted });
        const sources = NEWS_SOURCES.filter(
          (src) => !src.optional || granted.includes(src.id),
        );
        const results = await Promise.all(sources.map(fetchNewsSource));

        /* Granted and yet not one of them answered. That is the shape of the
         * permission being live while the page's own network state is not —
         * the case where a reload is what fixes it. It is deliberately narrow:
         * one newsroom being down is an ordinary Tuesday, all of them at once
         * is not. Said in the panel rather than guessed at silently. */
        const optionalResults = sources
          .map((src, i) => (src.optional ? results[i] : undefined))
          .filter((r) => r !== undefined);
        this.setState({
          newsBlocked:
            optionalResults.length > 0 && optionalResults.every((r) => !r),
        });

        /* Newest first, across all of them.
         *
         * The old order was "Blockchair, then Hacker News", which was fine
         * with two sources and is wrong with eight: it would have put a
         * four-day-old aggregator story above a wire report from an hour ago
         * purely because of the order the fetchers are listed in. Undated
         * stories sort last rather than first — an unknown time is not a
         * recent one. */
        const ranked = results
          .filter(Boolean)
          .reduce((all, list) => all.concat(list), [])
          .sort((a, b) => (b.time || 0) - (a.time || 0));
        const items = mergeNewsItems(ranked);

        if (items.length) {
          this.setState({ newsItems: items });
          saveJsonSetting(NEWS_CACHE_KEY, { t: Date.now(), items });
        }
      } catch (error) {
        // Silently fail — the news row simply stays hidden
      } finally {
        this._newsFetching = false;
        /* The panel's "Fetching headlines…" used to be `newsItems.length === 0`
         * — which is not a loading flag, it is an emptiness flag. A fetch where
         * nothing answered never reached `setState` at all, so the panel sat on
         * "Fetching headlines…" for ever and a failed refresh was
         * indistinguishable on screen from one still running. It has to be
         * cleared here, in `finally`, or the throw path leaves the same lie. */
        this.setState({ newsLoading: false });
        if (this._newsAgain) {
          this._newsAgain = false;
          this.fetchNewsData();
        }
      }
    });

    /* The panel asks for this after a permission is granted or dropped: six
     * feeds became readable (or stopped being), and waiting ten minutes for
     * the next poll to notice would make the button look like it did nothing.
     * The cache is cleared first, or the poll would serve the old answer. */
    _defineProperty(this, "refreshNewsSources", () => {
      saveJsonSetting(NEWS_CACHE_KEY, { t: 0, items: [] });
      this.setState({ newsItems: [] }, this.fetchNewsData);
    });

    _defineProperty(this, "handleNewsSourceToggle", (name) => {
      this.setState((prev) => {
        const next = { ...prev.newsSources };
        if (next[name] === false) delete next[name];
        else next[name] = false;
        saveNewsPanelSources(next);
        return { newsSources: next };
      });
    });

    _defineProperty(this, "handleNewsScopeChange", (value) => {
      saveNewsPanelFilter(value);
      this.setState({ newsPanelScope: value });
    });

    _defineProperty(this, "toggleNews", () => {
      this.setState(
        (prev) => ({ showNews: !prev.showNews }),
        () => {
          // Opening it is a reason to want the feed, so the shared loader has
          // to be asked again — same shape as the portfolio's own toggle
          this.startNewsTicker();
        },
      );
    });

    /* The headline row's own list. "My coins" is the list on the chart; "what
     * I hold" is the portfolio, which is a smaller and more personal set — a
     * coin you own is one you care about whether or not it is in the rotation.
     * Anything else, including a stored value from a future version, reads as
     * "everything", because showing too much is the harmless failure. */
    _defineProperty(this, "filteredNews", () => {
      const items = this.state.newsItems;
      const mode = this.state.newsFilter;
      if (mode === "coins") return newsForCoins(items, this.state.coinOptions);
      if (mode === "portfolio") {
        return newsForCoins(items, (this.state.portfolio || []).map((h) => h.coin));
      }
      return items;
    });

    _defineProperty(this, "handleNewsFilterChange", (value) => {
      saveNewsFilter(value);
      this.setState({ newsFilter: value });
    });

    /* One loader, two consumers.
     *
     * `fetchNewsData` has always served both the scrolling row and the
     * move-headlines line under the price, but this only started it for the
     * row — so a tab with headlines on and the ticker off made no news request
     * at all on load, and the line only ever appeared if you happened to
     * toggle the setting in that session. Measured: 0 requests to Blockchair
     * or Hacker News on a fresh tab. The condition here has to be the same one
     * `fetchNewsData` uses, or one of them is always wrong. */
    _defineProperty(this, "startNewsTicker", () => {
      this.stopNewsTicker();
      if (!this.newsWanted()) {
        return;
      }
      this.fetchNewsData();
      this.newsRefreshInterval = setInterval(() => {
        if (!document.hidden) {
          this.fetchNewsData();
        }
      }, NEWS_REFRESH_MS);
    });

    _defineProperty(this, "stopNewsTicker", () => {
      clearInterval(this.newsRefreshInterval);
      this.newsRefreshInterval = null;
    });

    _defineProperty(this, "handleNewsTickerChange", (enabled) => {
      saveNewsTickerToStorage(enabled);
      /* Not `enabled ? start : stop` — the loader is shared with the
       * move-headlines line, and stopping it because the row was switched off
       * would silently stop refreshing the feed the line still reads. */
      this.setState({ newsTicker: enabled }, this.startNewsTicker);
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

    /* One switch, one setting — and it is not the grid's.
     *
     * Turning calls on used to switch `chartGrid` on as well, and write it to
     * storage. The reason was real once: the squares were the grid's, so calls
     * on a chart with the grid off were an invisible game. It stopped being
     * true when `updateGrid` began drawing on `predict` alone (`!grid &&
     * !predict` is the only way out of it) — with calls on, the mesh is drawn
     * whatever the grid setting says, because the squares *are* the mesh.
     *
     * What was left was a switch that quietly rewrote a different, persisted
     * setting — and never gave it back. Turn calls on once and the plain chart
     * had a grid on it forever, in every tab, with the Chart Grid row in
     * Settings showing On for a choice nobody made. Turning calls off could
     * not undo it either, because by then there was nothing recording what the
     * setting had been.
     *
     * So calls own `predict` and nothing else. The Chart Grid switch and "G"
     * mean exactly one thing: the mesh on the plain chart. */
    _defineProperty(this, "handlePredictChange", (enabled) => {
      savePredict(enabled);
      this.setState({ predict: enabled });
    });

    /* Where the "now" line was put, as a share of the chart's width.
     *
     * The write is debounced and the state is not: a drag reports every frame,
     * and localStorage is synchronous — sixty writes a second is the one thing
     * on this path that could make the line stutter. The last position wins a
     * third of a second after the hand stops, which is indistinguishable from
     * saving on release and needs no second event to be sure of. */
    /* Held per range, so the zoom follows the chart rather than the tab: the
     * reach you want on an hour is not the reach you want on a year, and one
     * shared number would fight you at every switch. */
    _defineProperty(this, "handleBoardZoomChange", (zoom) => {
      saveBoardZoom(this.state.period, zoom);
      this.setState({ boardZoom: zoom });
    });

    _defineProperty(this, "handleFutureShareChange", (share) => {
      this.setState({ futureShare: share });
      this.saveFutureShareSoon(share);
    });
    _defineProperty(
      this,
      "saveFutureShareSoon",
      debounce((share) => saveFutureShare(share), 300),
    );

    /* One open call per *square*, not per coin.
     *
     * With three squares of future on screen there are three separate
     * questions — where the price is in two days, in four, in six — and a
     * player should be able to answer all of them. What must not stack is two
     * answers to the *same* question, so placing again on a square replaces
     * whatever was on it. */
    _defineProperty(this, "handlePlaceCall", ({ target, span, lo, hi }) => {
      const coin = this.state.coinOptions[this.state.coinIndex];
      const period = this.state.period;
      const currency = this.state.currency;
      this.setState((prev) => {
        /* Two calls are the same claim when their rectangles intersect in
         * real time and real price. This used to compare `col` — the column
         * index counted back from "now" — and that is not an identity at all:
         * "now" moves, so column 2 names a different stretch of time every
         * minute. The consequences were both of the things that looked like
         * separate bugs. A call placed today in column 2 deleted a locked
         * call made yesterday in what was then column 2, so locks vanished on
         * their own; and two calls whose columns differed could still cover
         * the same minutes and prices, so boxes piled up on top of each other
         * and the chart became unreadable.
         *
         * Absolute geometry fixes both at once, and permanently: a stored
         * call never moves in time-and-price space, so a set that does not
         * overlap today cannot start overlapping later. */
        const intersects = (a, b) =>
          a.target - a.span < b.target &&
          b.target - b.span < a.target &&
          a.lo < b.hi &&
          b.lo < a.hi;
        const here = { target, span, lo, hi };
        const mine = (c) =>
          c.coin === coin && c.currency === currency && c.period === period;

        /* Locked is locked. Landing on an existing open call is not a
         * replacement and not an error — it is a click on something already
         * decided, and the honest response is to leave it exactly as it is.
         * Being able to overwrite a call while watching the price move would
         * make the record worthless. */
        if (prev.calls.open.some((c) => mine(c) && intersects(c, here))) {
          return null;
        }

        const open = prev.calls.open.slice();
        open.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          coin,
          currency,
          period,
          target,
          span,
          lo,
          hi,
          /* No `col`. The square's identity is the ground it covers, and a
           * column index counted back from "now" names different ground every
           * minute — it was written, never read, and validating it on the way
           * to storage threw away calls placed past the tenth square. */
          placed: Date.now(),
          /* The live price is `currentValue`, a plain number. This read
           * `prev.spot.amount` — a field this component has never had — so
           * every call was stored with a null placedPrice. It is what the
           * panel needs to say what the price was when the call was made. */
          placedPrice:
            typeof prev.currentValue === "number" && isFinite(prev.currentValue)
              ? prev.currentValue
              : null,
        });
        /* Capped here as well as on load. Only sanitising on read meant a
         * long session could hold more than the cap and quietly drop the
         * overflow at the next reload — the oldest calls vanishing with no
         * event the user could connect them to. */
        const calls = {
          record: prev.calls.record,
          done: prev.calls.done,
          open: open.slice(-MAX_OPEN_CALLS),
        };
        saveCalls(calls);
        return { calls };
      });
    });

    /* Settle whatever is due against the series already on screen. No new
     * request and no new host: the answer is in data the chart was drawn
     * from. Runs when a series arrives, which is exactly "next time you open
     * a tab" for the coin that was called. */
    _defineProperty(this, "settleDueCalls", () => {
      const { calls, period, currency } = this.state;
      if (!calls.open.length) return;
      const coin = this.state.coinOptions[this.state.coinIndex];
      const prices = this.state.valueHistory;
      if (!Array.isArray(prices) || prices.length < 2) return;

      const now = Date.now();
      let record = calls.record;
      let hit = false;
      const open = [];
      const settled = [];
      for (const c of calls.open) {
        const mine =
          c.coin === coin && c.currency === currency && c.period === period;
        if (!mine) {
          open.push(c);
          continue;
        }
        const { status, price } = settleCall(c, prices, now);
        if (status === "pending") {
          open.push(c);
          continue;
        }
        record = applyCallResult(record, status);
        if (status === "hit") hit = true;
        /* Expired calls are dropped rather than kept: there is no answer to
         * show, and a box on the chart with no result is a question mark
         * nobody can resolve. */
        if (status === "hit" || status === "miss") {
          /* `settledAt` is when the answer was *found*, not when the call was
           * due — a tab opened a day late settles a call whose target was
           * yesterday, and the mark on the calls button has to say "there is
           * something here you have not seen", which is a fact about looking,
           * not about the clock. */
          settled.push({ ...c, result: status, settledPrice: price, settledAt: now });
        }
      }
      if (open.length === calls.open.length && record === calls.record) return;

      const next = {
        record,
        open,
        // Newest first, so the cap drops the oldest rather than the latest
        done: settled.concat(calls.done || []).slice(0, MAX_DONE_CALLS),
      };
      saveCalls(next);
      const won = settled.filter((c) => c.result === "hit");

      /* Which wins get the big show.
       *
       * Three cases, and each is a different kind of "this one mattered":
       *
       *   · the first call ever settled right — the moment the feature either
       *     becomes a habit or does not, and there is exactly one of them;
       *   · the leading call in a contested column, which is the claim every
       *     hedge in that column was placed against (the chart's `1ST` tag);
       *   · any win at all while calls are switched off, because then the
       *     board is not drawn and nothing is announced, so this is the only
       *     thing that says it happened.
       *
       * The columns are worked out from the calls as they stood *before* this
       * settlement: everything sharing a target settles in the same pass, so
       * asking afterwards would find an empty column and nobody first in it.
       */
      const quiet = this.state.predict !== true;
      const columns = callColumns(
        calls.open.filter(
          (c) => c.coin === coin && c.currency === currency && c.period === period,
        ),
      );
      const firstEver = !(calls.record && calls.record.hits > 0);
      const bang =
        won.length > 0 &&
        (quiet || firstEver || won.some((c) => isLeadingCall(c, columns)));

      this.setState((prev) => ({
        calls: next,
        celebrate: hit ? prev.celebrate + 1 : prev.celebrate,
        // The chart bursts on the box that came true, so it needs to know
        // which one — the newest hit if several settled at once
        celebrateCall: won.length ? won[won.length - 1] : prev.celebrateCall,
        fireworks: bang ? prev.fireworks + 1 : prev.fireworks,
        /* Announced the same way a hit target is — but only while the feature
         * is on. With calls off you are not playing: settling still runs, so
         * the record stays true, and the win is shown on the chart rather than
         * pushed into a toast stack for a game you have put down. */
        wonCalls:
          won.length && !quiet ? won.concat(prev.wonCalls) : prev.wonCalls,
      }));
    });

    /* The chart already guards against reporting the same numbers twice, so
     * this only ever runs on a real change — but it compares again anyway,
     * because a setState loop between a chart and its panel is the kind of
     * bug that only shows up as a warm laptop. */
    _defineProperty(this, "handleChartGeometry", (geo) => {
      const cur = this.state.callGeometry;
      if (
        cur &&
        cur.step === geo.step &&
        cur.spanMs === geo.spanMs &&
        cur.reachMs === geo.reachMs
      ) {
        return;
      }
      this.setState({ callGeometry: geo });
    });

    /* ── "What happened here?" ────────────────────────────────────────────
     *
     * Where the marks go, worked out from the series on screen and nothing
     * else. Memoized on the identity of the series, because `render` runs on
     * every price tick and every hover and this walks 300 points — the same
     * reason `scalePrices` is cached on identity rather than through
     * `memoize`, which would stringify the whole series to look up an answer.
     */
    _defineProperty(this, "chartMoves", (prices) => {
      if (this.state.moveNews !== true || this.state.compareCoin) return null;
      if (this._movesFor === prices) return this._moves;
      this._movesFor = prices;
      this._moves = findUnusualMoves(prices, {
        sigma: MOVE_NEWS_SIGMA,
        max: MOVE_NEWS_MAX_MARKS,
      });
      return this._moves;
    });

    /* Hovering a mark asks for its window, and does nothing visible.
     *
     * The request is started here rather than on the click so the card is
     * already filled by the time it opens — a mark is a small target and the
     * pointer rests on it before the finger comes down. `fetchNewsAround`
     * caches and de-duplicates, so running the pointer along a row of marks
     * costs one request each and repeats cost none. */
    _defineProperty(this, "handleMoveHover", (items) => {
      if (!items || !items.length) return;
      const move = items[0];
      fetchNewsAround(
        move.startTime,
        items[items.length - 1].time,
        this.state.newsGranted,
      );
    });

    _defineProperty(this, "handleMoveOpen", (items, x, y) => {
      if (!items || !items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const token = `${first.time}-${last.time}`;
      this._moveToken = token;
      this.setState({
        openMove: { items, x, y, token },
        moveHeadlinesFor: null,
      });
      fetchNewsAround(first.startTime, last.time, this.state.newsGranted).then((items2) => {
        /* Another mark may have been opened while this was in flight, and a
         * card must never fill with the previous window's headlines. */
        if (this._moveToken !== token) return;
        this.setState({ moveHeadlinesFor: items2 || [] });
      });
    });

    _defineProperty(this, "closeMove", () => {
      this._moveToken = null;
      this.setState({ openMove: null, moveHeadlinesFor: null });
    });

    /* Clicking away closes the card.
     *
     * It had Escape and its own ×, which is two ways out for someone who knows
     * they exist. A small card floating over a chart people click for other
     * reasons — to place a call, to hover a square — has to get out of the way
     * when the next click is plainly not about it.
     *
     * On `mousedown`, and this is what makes it safe: the card is opened from
     * a `click`, which fires *after* the mousedown that produced it, so the
     * listener registered here cannot see its own opening gesture. No timer,
     * no flag, no "ignore the first event". Clicking a second mark closes the
     * first on mousedown and opens the second on click, in that order.
     *
     * The chart is left alone deliberately — no overlay, no capture phase, no
     * `stopPropagation`. Everything the chart does with a pointer keeps
     * working while the card is up, and the card simply stops being up. */
    _defineProperty(this, "handleMoveOutside", (e) => {
      const card = this._moveCardNode;
      if (card && e.target instanceof Node && card.contains(e.target)) return;
      this.closeMove();
    });

    _defineProperty(this, "handleMoveNewsChange", (enabled) => {
      saveMoveNews(enabled);
      // Switching it off closes whatever is open with it — a card describing a
      // mark that is no longer drawn is a card pointing at nothing
      this.setState({ moveNews: enabled, openMove: null, moveHeadlinesFor: null });
    });

    _defineProperty(this, "handleCallsShowSettledChange", (v) => {
      saveCallsShowSettled(v);
      this.setState({ callsShowSettled: v });
    });

    _defineProperty(this, "handleCallsCelebrateChange", (v) => {
      saveCallsCelebrate(v);
      this.setState({ callsCelebrate: v });
    });

    _defineProperty(this, "dismissWonCall", (id) => {
      this.setState((prev) => ({
        wonCalls: prev.wonCalls.filter((c) => c.id !== id),
      }));
    });

    _defineProperty(this, "handleClearSettled", () => {
      this.setState((prev) => {
        const next = { record: prev.calls.record, open: prev.calls.open, done: [] };
        saveCalls(next);
        return { calls: next };
      });
    });

    _defineProperty(this, "handleWithdrawCall", (id) => {
      this.setState((prev) => {
        const next = {
          record: prev.calls.record,
          done: prev.calls.done,
          open: prev.calls.open.filter((c) => c.id !== id),
        };
        saveCalls(next);
        return { calls: next };
      });
    });

    _defineProperty(this, "handleResetCalls", () => {
      const empty = {
        record: { hits: 0, total: 0, streak: 0, best: 0 },
        open: [],
        done: [],
      };
      saveCalls(empty);
      this.setState({ calls: empty });
    });

    _defineProperty(this, "handleChartGridChange", (enabled) => {
      saveChartGrid(enabled);
      this.setState({ chartGrid: enabled });
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
    _defineProperty(this, "handleAppMode", (modeKey) => {
      const mode = APP_MODES.find((m) => m.value === modeKey);
      if (!mode) return;
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
      for (const key of Object.keys(mode.settings)) {
        const handler = apply[key];
        if (handler) handler(mode.settings[key]);
      }
      if (mode.widgets === "none") {
        // The bundles are additive sets; "none" is the empty one, and there is
        // no preset for it because a preset that turns everything off is a
        // reset with a name
        saveWidgetsToStorage({ ...DEFAULT_WIDGETS });
        this.setState({ widgets: { ...DEFAULT_WIDGETS } }, this.ensureCoinSweep);
      } else if (mode.widgets) {
        this.handleWidgetPreset(mode.widgets);
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
      this.setState({ ohlcEnabled: enabled, ohlcData: enabled ? this.state.ohlcData : null });
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

    _defineProperty(this, "buildPageTickerItems", () => {
      const { currency, decimalPlaces, separatorFormat, coinOptions } =
        this.state;
      const curr = currency || DEFAULT_CURRENCY;
      const currencySymbol = getCurrencySymbol(curr);
      const items = [];
      const moverPool = []; // { coin, change, up } for everything we have

      for (const coin of SUGGESTED_COINS) {
        const cached = pageTickerCache.get(`${coin}-${curr}`);
        if (!cached) continue;

        const priceStr = formatTickerPrice(
          cached.price,
          currencySymbol,
          "compact",
          decimalPlaces,
          separatorFormat,
        );

        const hasChange =
          cached.change !== null &&
          cached.change !== undefined &&
          isFinite(cached.change);
        const changeStr = hasChange
          ? `${cached.up ? "+" : ""}${cached.change.toFixed(2)}%`
          : null;

        items.push({ coin, price: priceStr, change: changeStr, up: cached.up });
        if (hasChange) {
          moverPool.push({
            coin,
            change: cached.change,
            up: cached.up,
            price: cached.price,
          });
        }
      }

      // Watchlist — the user's coins, in their own order
      const watchlist = (coinOptions || [])
        .map((coin) => {
          const c = pageTickerCache.get(`${coin}-${curr}`);
          if (!c || c.change === null || c.change === undefined) return null;
          return { coin, change: c.change, up: c.up, price: c.price };
        })
        .filter(Boolean);

      // Top movers — 3 biggest gainers + 3 biggest losers (24h)
      let topMovers = null;
      if (moverPool.length >= 4) {
        const sorted = moverPool.slice().sort((a, b) => b.change - a.change);
        topMovers = {
          gainers: sorted.slice(0, 3),
          losers: sorted.slice(-3).reverse(),
        };
      }

      this.setState({
        pageTickerItems: items,
        watchlistData: watchlist.length ? watchlist : null,
        topMoversData: topMovers,
      });
    });

    _defineProperty(this, "fetchPageTickerData", async () => {
      // Hidden tab → defer until handleVisibilityChange resumes us
      if (document.hidden) {
        this.pendingPageTickerRefresh = true;
        return;
      }
      if (this._pageTickerFetching) return;
      this._pageTickerFetching = true;

      const curr = this.state.currency || DEFAULT_CURRENCY;
      const now = Date.now();

      // One bulk request covers the top-100 coins; the per-coin loop below
      // only fetches whatever Coinlore didn't have (TTL skips fresh entries)
      const bulkFilled = await bulkRefreshPageTickerCache(SUGGESTED_COINS, curr);

      /* What the bulk response did not cover, worked out once.
       *
       * The fallback loop used to walk all 66 coins in groups of four whatever
       * the bulk sweep had achieved. `refreshPageTickerCoin` does return
       * without a request for a fresh coin — so no requests were wasted — but
       * the *caller* still published the ticker after every group and still
       * waited 500ms before the next one. On the ordinary path, where Coinlore
       * answers for every coin, that was seventeen publications and sixteen
       * sleeps for no work at all: measured at 19 root renders and about eight
       * seconds of a fetch that had already finished.
       *
       * The `needsCoinSweep()` guard below reads as though it prevented this
       * and does not: it asks whether anything is *watching* the ticker, not
       * whether there is anything to fetch. Both are wanted, so both are kept.
       */
      const stale = SUGGESTED_COINS.filter((coin) => {
        const entry = pageTickerCache.get(`${coin}-${curr}`);
        return !entry || now - entry.timestamp > PAGE_TICKER_TTL;
      });

      // Publish what the bulk gave us — or, on a hydrated cache with nothing
      // to fetch, publish the cache itself so the bar paints without a request
      if (bulkFilled || !stale.length) this.buildPageTickerItems();

      for (let i = 0; i < stale.length; i += PAGE_TICKER_BATCH_SIZE) {
        if (!this.needsCoinSweep()) break;

        const batch = stale.slice(i, i + PAGE_TICKER_BATCH_SIZE);

        await Promise.all(
          batch.map((coin) => refreshPageTickerCoin(coin, curr, now)),
        );

        this.buildPageTickerItems();

        // Only between batches that actually went to the network
        if (i + PAGE_TICKER_BATCH_SIZE < stale.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, PAGE_TICKER_BATCH_DELAY),
          );
        }
      }

      this._pageTickerFetching = false;
      // Mark ready after first complete fetch so the bar animates in
      if (!this.state.pageTickerReady) {
        this.setState({ pageTickerReady: true });
      }
    });

    _defineProperty(this, "handlePageTickerPositionChange", (position) => {
      savePageTickerPositionToStorage(position);
      this.setState({ pageTickerPosition: position });
    });

    _defineProperty(this, "togglePageTickerCollapsed", () => {
      this.setState((prevState) => {
        const next = !prevState.pageTickerCollapsed;
        savePageTickerCollapsedToStorage(next);
        return { pageTickerCollapsed: next };
      });
    });

    // The all-coin sweep feeds the page ticker AND the watchlist / top-movers
    // widgets, so it should run whenever ANY of them is active.
    _defineProperty(this, "needsCoinSweep", () => {
      const w = this.state.widgets || {};
      return this.state.pageTicker || w.watchlist || w.topMovers;
    });

    _defineProperty(this, "ensureCoinSweep", () => {
      if (this.needsCoinSweep()) {
        if (!this.pageTickerRefreshInterval) {
          this.fetchPageTickerData();
          this.pageTickerRefreshInterval = setInterval(
            () => this.fetchPageTickerData(),
            PAGE_TICKER_REFRESH_MS,
          );
        }
      } else if (this.pageTickerRefreshInterval) {
        clearInterval(this.pageTickerRefreshInterval);
        this.pageTickerRefreshInterval = null;
      }
    });

    _defineProperty(this, "handlePageTickerChange", (enabled) => {
      savePageTickerToStorage(enabled);
      // Turning the ticker on from settings should always show it expanded
      if (enabled) savePageTickerCollapsedToStorage(false);
      this.setState(
        {
          pageTicker: enabled,
          pageTickerCollapsed: enabled ? false : this.state.pageTickerCollapsed,
        },
        this.ensureCoinSweep,
      );
    });

    _defineProperty(this, "handleOnline", () => {
      this.setState({ isOffline: false });
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
        document.title = "New Tab";
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
      if (this.pendingVisibilityRefresh) {
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
  }

  componentWillUnmount() {
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
    this.stopTickerInterval();
    this.stopAutoRotate();
    this.stopNewsTicker();
    document.removeEventListener("mousedown", this.handleMoveOutside);
    // A widget answer waiting for the end of the frame — see `queueWidgetData`
    if (this._widgetFlush) cancelAnimationFrame(this._widgetFlush);

    // Cancel any ongoing requests
    if (this.abortController) {
      this.abortController.abort();
    }

    document.body.style.overflow = "";
    // Reset tab title on unmount
    document.title = "New Tab";

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

    document.removeEventListener("visibilitychange", this.handleVisibilityChange);

    document.removeEventListener("keydown", this.handleKeyDown);
  }

  componentDidUpdate(_prevProps, prevState) {
    /* The click-away listener lives exactly as long as the card does. Bound on
     * mousedown so it cannot catch the click that opened the card — see
     * `handleMoveOutside`. */
    const wasOpen = Boolean(prevState.openMove);
    const isOpen = Boolean(this.state.openMove);
    if (isOpen !== wasOpen) {
      const bind = isOpen ? "addEventListener" : "removeEventListener";
      document[bind]("mousedown", this.handleMoveOutside);
    }

    // A hit arriving, or the last banner being dismissed, is what starts and
    // stops the announcement
    if (prevState.firedAlerts !== this.state.firedAlerts) {
      this.syncAlertTitle();
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
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
    const headlines = this.state.moveHeadlinesFor;
    /* Anchored to the mark in both axes, and clamped so it is always whole on
     * screen: half the card either side, and below the mark unless there is no
     * room, in which case above it. A card pinned to a fixed height would make
     * the reader carry the date back to the chart to find out which of five
     * triangles it belongs to. `MOVE_CARD_H` is an estimate rather than a
     * measurement — the card is not on screen yet when this runs, and being a
     * few pixels out only changes when it flips to the other side. */
    const half = Math.min(208, window.innerWidth / 2 - 16);
    const x = Math.max(half + 16, Math.min(window.innerWidth - half - 16, open.x));
    const MOVE_CARD_H = 230;
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
          { onClick: this.closeMove, "aria-label": "Close" },
          "×",
        ),
      ),
      React.createElement(
        MoveCardWhen,
        null,
        when + (items.length > 1 ? ` · ${items.length} unusual moves here` : ""),
      ),
      headlines === null
        ? React.createElement(MoveCardWhen, null, "Looking for headlines…")
        : headlines.length
          ? React.createElement(
              MoveCardList,
              null,
              ...headlines.slice(0, 4).map((item, i) =>
                React.createElement(
                  MoveCardItem,
                  {
                    key: `mv-${i}`,
                    href: item.url || undefined,
                    target: "_blank",
                    rel: "noopener noreferrer",
                  },
                  React.createElement(MoveCardSource, null, item.source),
                  item.title,
                ),
              ),
            )
          : React.createElement(
              MoveCardWhen,
              null,
              "Nothing in the archive for those days.",
            ),
      React.createElement(
        MoveCardNote,
        null,
        "Headlines published around this move — what was being written at the " +
          "time, not why the price moved.",
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
      quietChrome,
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
      isLoading,
      showSkeleton,
      invalidCoin,
      apiError,
      widgets,
      fearGreedData,
      marketOverviewData,
      halvingData,
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
    // 0 → needle left, 100 → needle right; 1.8° per point of the index
    const fgNeedleAngle = fearGreedData
      ? (Math.min(Math.max(fearGreedData.value, 0), 100) * 1.8).toFixed(1)
      : 90;
    const activeCoin = coinOptions[coinIndex] || coinOptions[0] || "BTC";
    /* There is a drawing on screen, so a switch is a transition and not a
     * first paint: the skeleton stands down for the chart and the range
     * switcher, and the chart is left to morph into the new series. The
     * price readout still greys out — those figures belong to the coin you
     * just left, and the one thing this must not do is print them under the
     * new coin's name. */
    const hasChart = Boolean(valueHistory && valueHistory.length);
    const chartStale = showSkeleton && hasChart;
    const periodOption = PERIOD_OPTIONS.find((o) => o.value === period);
    const periodLabel = periodOption ? periodOption.label : "";
    const tickerVisible =
      this.state.pageTicker &&
      this.state.pageTickerReady &&
      !this.state.pageTickerCollapsed;
    const tickerPosition =
      this.state.pageTickerPosition || DEFAULT_PAGE_TICKER_POSITION;
    const tickerTop = tickerVisible && tickerPosition === "top";
    const tickerBottom = tickerVisible && tickerPosition === "bottom";

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
    const currentTheme = activeTheme === "light" ? LIGHT_THEME : DARK_THEME;

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
            "You are offline. Data will update when connection is restored.",
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
                ? "Retrying…"
                : "Couldn't reach the price service. Showing the last prices we have.",
            ),
            React.createElement(
              RetryButton,
              {
                onClick: this.handleRetry,
                disabled: this.state.retrying,
                title: "Fetch the latest prices again",
              },
              "Retry",
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
              "Remove",
            ),
            React.createElement(
              InvalidCoinButton,
              { onClick: this.handleDismissInvalidCoin },
              "Skip",
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
            onToggleSource: this.handleNewsSourceToggle,
            onScopeChange: this.handleNewsScopeChange,
            onSourcesChange: this.refreshNewsSources,
            onClose: this.toggleNews,
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
              "Enjoying PriceTab? A quick rating helps others find it.",
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
                "aria-label": "Dismiss rating request",
              },
              "×",
            ),
          ),
        React.createElement(
          AppShell,
          { tickerTop, tickerBottom },
          !showPortfolio &&
            !this.state.alertsView &&
            !this.state.showNews &&
            !this.state.showQuickSwitch &&
            React.createElement(
              SettingsToggleButton,
              {
                onClick: this.toggleSettings,
                open: showSettings,
                type: "button",
                /* Never quiet while it is this panel's × — you are looking at
                 * the panel, and the way out of it is not a thing to hunt for. */
                quiet: quietChrome && !showSettings,
                // While open this is the panel's × — the panel covers the
                // ticker, so the corner is where it belongs
                tickerTop: tickerTop && !showSettings,
                "data-tour": "settings",
                "aria-label": showSettings ? "Close settings" : "Open settings",
                title: showSettings ? "Close settings" : "Settings",
              },
              showSettings ? "×" : icon("settings", 1.15),
            ),

          // Targets bell (left of the portfolio button)
          !showSettings &&
            !showPortfolio &&
            !this.state.showQuickSwitch &&
            this.state.alertsView !== "calls" &&
            !this.state.showNews &&
            React.createElement(
              AlertsToggleButton,
              {
                onClick: () => this.toggleAlertsView("targets"),
                type: "button",
                quiet: quietChrome && !this.state.alertsView,
                tickerTop: tickerTop && !this.state.alertsView,
                open: this.state.alertsView === "targets",
                "data-tour": "alerts",
                hasFired:
                  !this.state.alertsView &&
                  this.state.alerts.some((a) => a.triggeredAt),
                "aria-label": this.state.alertsView
                  ? "Close price targets"
                  : "Price targets",
                title: this.state.alertsView
                  ? "Close price targets"
                  : "Price targets (A)",
              },
              this.state.alertsView ? "×" : icon("target", 1.1),
            ),

          /* Calls — its own control, left of the targets bell.
           *
           * The two swap places in the corner rather than stacking: whichever
           * list is up owns the × in the top-right, and the other button
           * stands down, because two × -shaped controls in one corner is a
           * question about which one closes what. */
          !showSettings &&
            !showPortfolio &&
            !this.state.showQuickSwitch &&
            this.state.alertsView !== "targets" &&
            !this.state.showNews &&
            React.createElement(
              CallsToggleButton,
              {
                onClick: () => this.toggleAlertsView("calls"),
                type: "button",
                quiet: quietChrome && !this.state.alertsView,
                tickerTop: tickerTop && !this.state.alertsView,
                open: this.state.alertsView === "calls",
                "data-tour": "calls",
                /* Something settled since the panel was last opened. This is
                 * the only thing on the page that says a call came back, and
                 * it is the reason to open a new tab and look. */
                hasFired:
                  !this.state.alertsView && this.hasUnseenSettledCalls(),
                "aria-label": this.state.alertsView ? "Close calls" : "Calls",
                title: this.state.alertsView ? "Close calls" : "Calls (K)",
              },
              this.state.alertsView ? "×" : icon("calls", 1.05),
            ),

          /* News, one slot further left than calls. Same rule as the pair
           * beside it: whichever panel is up owns the × in the corner, so the
           * others stand down rather than stacking a second one. */
          !showSettings &&
            !showPortfolio &&
            !this.state.alertsView &&
            !this.state.showQuickSwitch &&
            React.createElement(
              NewsToggleButton,
              {
                onClick: this.toggleNews,
                type: "button",
                quiet: quietChrome && !this.state.showNews,
                tickerTop: tickerTop && !this.state.showNews,
                open: this.state.showNews,
                "aria-label": this.state.showNews ? "Close news" : "News",
                title: this.state.showNews ? "Close news" : "News (N)",
              },
              this.state.showNews ? "×" : icon("news", 1.05),
            ),

          // Portfolio toggle (left of the gear)
          !showSettings &&
            !this.state.alertsView &&
            !this.state.showNews &&
            !this.state.showQuickSwitch &&
            React.createElement(
              PortfolioToggleButton,
              {
                onClick: this.togglePortfolio,
                open: showPortfolio,
                type: "button",
                quiet: quietChrome && !showPortfolio,
                // The portfolio covers the page ticker, so its × must not
                // follow it — otherwise a ticker that finishes loading in
                // the background shifts the close button for no visible
                // reason (it was the only button still mounted).
                tickerTop: tickerTop && !showPortfolio,
                "data-tour": "portfolio",
                "aria-label": showPortfolio ? "Close portfolio" : "Open portfolio",
                title: showPortfolio ? "Close portfolio" : "Portfolio",
              },
              showPortfolio ? "×" : icon("portfolio", 1.1),
            ),

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
                    if (typeof move !== "number" || Math.abs(move) < threshold) {
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
                      stats.push([`${periodLabel} High`, money(range.high)]);
                      stats.push([`${periodLabel} Low`, money(range.low)]);
                    }
                    const cap = ticker
                      ? formatCompactAmount(ticker.marketCap, symbol)
                      : null;
                    if (cap) stats.push(["Mkt Cap", cap]);
                    const vol = ticker
                      ? formatCompactAmount(ticker.volume24, symbol)
                      : null;
                    if (vol) stats.push(["24h Vol", vol]);
                    if (!stats.length) return null;
                    return React.createElement(
                      PriceStatsRow,
                      null,
                      stats.map(([key, value]) =>
                        React.createElement(
                          PriceStatItem,
                          { key },
                          React.createElement(PriceStatKey, null, key),
                          React.createElement(PriceStatValue, null, value),
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
              : React.createElement(PeriodSwitcher, {
                  onChange: this.setPeriod,
                  options: PERIOD_OPTIONS,
                  value: period,
                }),
          ),

          React.createElement(
            FullBleed,
            null,
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
                          ? "Offline — waiting for a connection"
                          : "Fetching prices…",
                      ),
                  )
                : React.createElement(Line, {
                    prices: valueHistory,
                    colorize: this.state.chartColor,
                    /* Both off while two coins share the chart, for the same
                     * reason the candles and the volume band are: comparison
                     * puts percent change on the y axis, and the mesh, its
                     * price labels and the squares you call are all built from
                     * the price scale. Left on, the chart offered a band to
                     * point at that no line on it was drawn against — and let
                     * you lock a prediction on it. Calls already placed keep
                     * settling; only drawing and placing stand down. */
                    grid: this.state.chartGrid === true && !this.state.compareCoin,
                    predict:
                      this.state.predict === true && !this.state.compareCoin,
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
                    currencySymbol: getCurrencySymbol(this.state.currency),
                    interactive: true, // crosshair with OHLC + volume
                    period,
                    coin: activeCoin,
                    ohlc: this.state.ohlcEnabled === false ? null : this.state.ohlcData,
                    onNeedOhlc:
                      this.state.ohlcEnabled === false ? null : this.loadOhlc,
                    /* Comparison replaces the single-coin drawing rather than
                     * layering on top of it: candles and a volume band belong
                     * to one coin, and leaving them under two percent-change
                     * lines would put two different y-meanings on one chart. */
                    compareCoin: this.state.compareCoin,
                    comparePrices: this.state.compareHistory,
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
                    formatPrice: this.formatChartPrice,
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
                  ? "Offline — waiting for a connection"
                  : "Fetching prices…",
              ),
          ),
        ),
        // Compare toggle (fixed, right of the widget control)
        !showSettings &&
          !showPortfolio &&
          !this.state.alertsView &&
          !this.state.showQuickSwitch &&
          React.createElement(
            CompareToggleButton,
            {
              type: "button",
              tickerTop,
              quiet: quietChrome,
              active: Boolean(this.state.compareCoin),
              onClick: this.toggleCompare,
              "data-tour": "compare",
              "aria-label": this.state.compareCoin
                ? `Stop comparing with ${this.state.compareCoin}`
                : "Compare with a second coin",
              title: this.state.compareCoin
                ? `Comparing with ${this.state.compareCoin} — click to stop (C)`
                : "Compare with a second coin (C)",
            },
            icon("compare", 1.15),
          ),

        // Widget toggle button (fixed, above the panel)
        (() => {
          if (
            showSettings ||
            showPortfolio ||
            this.state.alertsView ||
            this.state.showQuickSwitch
          ) {
            return null;
          }
          const hidden = this.state.hiddenWidgets;
          const anyEnabled = Object.keys(widgets).some((k) => widgets[k]);
          if (!anyEnabled) return null;
          const anyVisible = Object.keys(widgets).some((k) => widgets[k] && !hidden[k]);
          return React.createElement(
            WidgetRestoreButton,
            {
              type: "button",
              tickerTop,
              quiet: quietChrome,
              "data-tour": "widget-toggle",
              onClick: anyVisible ? this.hideAllWidgets : this.restoreAllWidgets,
              "aria-label": anyVisible ? "Hide all widgets" : "Show hidden widgets",
              title: anyVisible ? "Hide all widgets" : "Show hidden widgets",
            },
            anyVisible ? "\u00d7" : icon("eye", 1.15),
          );
        })(),
        // Widget Panel (drag-reorderable, widgets only)
        (() => {
          if (showPortfolio) return null;
          const hidden = this.state.hiddenWidgets;
          const widgetDefs = {
            watchlist: {
              label: "Watchlist",
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
                  : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            topMovers: {
              label: "Top Movers 24h",
              visible: widgets.topMovers && !hidden.topMovers,
              content: topMoversData
                ? React.createElement(
                    WidgetCoinList,
                    null,
                    topMoversData.gainers.map((m) => this.renderCoinRow(m)),
                    React.createElement(WidgetListDivider, { key: "split" }),
                    topMoversData.losers.map((m) => this.renderCoinRow(m)),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            fearGreed: {
              label: "Fear & Greed",
              visible: widgets.fearGreed && !hidden.fearGreed,
              content: fearGreedData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      "svg",
                      {
                        viewBox: "0 8 100 44",
                        style: {
                          display: "block",
                          margin: "0 auto",
                          // em, so the gauge grows with the card
                          width: "5.75em",
                          height: "2.5em",
                          overflow: "visible",
                        },
                      },
                      React.createElement(GaugeTrackPath, { d: GAUGE_ARC }),
                      GAUGE_SEGS.map((seg, i) =>
                        React.createElement("path", {
                          key: "seg-" + i,
                          d: GAUGE_ARC,
                          fill: "none",
                          stroke: seg.color,
                          strokeWidth: "7",
                          strokeLinecap:
                            i === 0 || i === 4 ? "round" : "butt",
                          strokeDasharray: seg.len + " " + GAUGE_LEN,
                          strokeDashoffset: -seg.offset,
                        }),
                      ),
                      React.createElement(GaugeNeedle, {
                        x1: "50",
                        y1: "50",
                        // Fixed endpoint at the 0 position; the angle does
                        // the work so the needle can swing to it
                        x2: "20",
                        y2: "50",
                        angle: fgNeedleAngle,
                      }),
                      React.createElement(GaugeCenterDot, {
                        cx: "50",
                        cy: "50",
                        r: "3",
                      }),
                    ),
                    React.createElement(
                      WidgetValue,
                      { style: { marginTop: "0.2em" } },
                      fearGreedData.value,
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      fearGreedData.classification,
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            marketOverview: {
              label: "Market",
              visible: widgets.marketOverview && !hidden.marketOverview,
              content: marketOverviewData
                ? React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      WidgetValue,
                      { style: { fontSize: "0.9em" } },
                      React.createElement(MarketStatLabel, null, "Cap"),
                      "$" +
                        (marketOverviewData.totalMarketCap / 1e12).toFixed(
                          2,
                        ) +
                        "T",
                    ),
                    React.createElement(
                      WidgetSubtext,
                      null,
                      React.createElement(MarketStatLabel, null, "BTC"),
                      marketOverviewData.btcDominance.toFixed(1) + "%",
                      " ",
                      React.createElement(MarketStatLabel, null, "ETH"),
                      marketOverviewData.ethDominance.toFixed(1) + "%",
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            halvingCountdown: {
              label: "BTC Halving",
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
                        React.createElement(HalvingTimeLabel, null, "Yrs"),
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
                        React.createElement(HalvingTimeLabel, null, "Days"),
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
                        React.createElement(HalvingTimeLabel, null, "Hrs"),
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
                        React.createElement(HalvingTimeLabel, null, "Min"),
                      ),
                    ),
                    React.createElement(
                      "div",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4em",
                          marginTop: "0.35em",
                        },
                      },
                      React.createElement(
                        HalvingProgressBar,
                        { style: { flex: 1, marginTop: 0 } },
                        React.createElement(HalvingProgressFill, {
                          percent: halvingData.progressPercent,
                        }),
                      ),
                      React.createElement(
                        HalvingTimeLabel,
                        null,
                        halvingData.progressPercent + "%",
                      ),
                    ),
                    React.createElement(
                      HalvingEta,
                      null,
                      "ETA: " + halvingData.etaFormatted,
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            rsiWidget: {
              // RSI is computed from the chart's current series, so the same
              // number means something different per coin and per range —
              // both belong in the label, like the other coin-specific widgets
              label: `${activeCoin} RSI · ${periodLabel}`,
              visible: widgets.rsiWidget && !hidden.rsiWidget,
              content:
                rsiValue !== null
                  ? React.createElement(
                      Fragment,
                      null,
                      React.createElement(WidgetValue, null, rsiValue),
                      React.createElement(
                        RsiBar,
                        null,
                        React.createElement(RsiMarker, {
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
                       * is in `docs/product/TODAY.md` §9. A momentum reading is
                       * worth showing; telling someone what it means is not
                       * something this data supports. */
                      React.createElement(
                        RsiLabels,
                        null,
                        React.createElement(HalvingTimeLabel, null, "0"),
                        React.createElement(HalvingTimeLabel, null, "100"),
                      ),
                    )
                  : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            fundingRate: {
              label: activeCoin + " Funding",
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
                      "Ann. " +
                        (fundingRateData.annualized >= 0 ? "+" : "") +
                        fundingRateData.annualized +
                        "%",
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            longShortRatio: {
              label: activeCoin + " L/S Ratio",
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
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            openInterest: {
              label: activeCoin + " Open Int.",
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
                    React.createElement(
                      WidgetSubtext,
                      null,
                      "Open Interest",
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            liquidations: {
              label: activeCoin + " Liqs 24h",
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
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
            altcoinSeason: {
              label: "Alt Season",
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
                      "BTC Dom " + altcoinSeasonData.btcDom + "%",
                    ),
                  )
                : React.createElement(WidgetSubtext, null, "Loading..."),
            },
          };

          const anyEnabled = Object.keys(widgets).some((k) => widgets[k]);
          if (!anyEnabled) return null;

          const visibleOrder = widgetOrder.filter(
            (key) =>
              widgetDefs[key] &&
              widgetDefs[key].visible &&
              !(showSettings && this.state.pendingWidgetReveal[key]),
          );

          if (!visibleOrder.length) return null;

          return React.createElement(
            ErrorBoundary,
            { key: "widget-panel-boundary", fallback: null },
            React.createElement(
              WidgetPanel,
              { visible: true, tickerTop, "data-tour": "widgets" },
              ...visibleOrder.map((key) => {
                const def = widgetDefs[key];
                return React.createElement(
                  WidgetCard,
                  {
                    key: key,
                    // One number drives the whole card — everything inside
                    // it is sized in em against this
                    scale: widgetSizeScale(this.state.widgetSize),
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
                      title: `Hide ${def.label}`,
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
              }),
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
          if (showSettings || showPortfolio || !pageTicker || !pageTickerReady || !pageTickerItems || pageTickerItems.length === 0) return null;

          /* Filtered here rather than at the fetch. The same `newsItems` feeds
           * the move-headlines line under the price, which is already narrowed
           * to the coin on screen — narrowing the stored list as well would
           * mean a headline about the coin you are looking at disappearing
           * because it is not one you hold. One feed, two readers, each asking
           * for what it needs. */
          const newsItems = this.filteredNews();

          const position = pageTickerPosition || DEFAULT_PAGE_TICKER_POSITION;

          const chevron = (dir) =>
            React.createElement(
              "svg",
              { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
              React.createElement("path", {
                d: dir === "up" ? "M3.5 10.5l4.5-4.5 4.5 4.5" : "M3.5 6l4.5 4.5 4.5-4.5",
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
          const makeTrack = (items) => {
            const doubled = [...items, ...items];
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
              { position, collapsed: pageTickerCollapsed },
              React.createElement(
                PageTickerBar,
                { position },
                React.createElement(
                  PageTickerRow,
                  null,
                  React.createElement(
                    PageTickerTrack,
                    { speed: Math.max(30, pageTickerItems.length * 2) },
                    ...makeTrack(pageTickerItems),
                  ),
                ),
                React.createElement(
                  PageTickerRow,
                  null,
                  React.createElement(
                    PageTickerTrack,
                    { speed: Math.max(38, pageTickerItems.length * 2.5), style: { animationDelay: "-15s" } },
                    ...makeTrack([...pageTickerItems].reverse()),
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
                                        "Read on " +
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
                              React.createElement(
                                PageTickerSep,
                                null,
                                "│",
                              ),
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
                  onClick: this.togglePageTickerCollapsed,
                  title: "Hide ticker",
                  "aria-label": "Hide ticker",
                },
                chevron(collapseDir),
              ),
            ),
            pageTickerCollapsed &&
              React.createElement(
                PageTickerHandle,
                {
                  position,
                  type: "button",
                  onClick: this.togglePageTickerCollapsed,
                  title: "Show ticker",
                  "aria-label": "Show ticker",
                },
                chevron(expandDir),
              ),
          );
        })(),

        // LAZY LOADING: Only render SettingsPanel when user opens it
        showSettings &&
          React.createElement(SettingsPanel, {
            coins: coinOptions,
            visible: showSettings,
            onAddCoin: this.handleAddCoinOption,
            onRemoveCoin: this.handleRemoveCoinOption,
            onReorderCoin: this.handleReorderCoinOption,
            onResetCoins: this.handleResetCoins,
            onRestoreCoins: this.handleRestoreCoins,
            // Lets the coin chips show today's move and the list be sorted
            // by it — read from the ticker snapshot, so it costs no request
            coinStats: this.coinStats(),
            onClose: this.toggleSettings,
            themePreference: themePreference,
            activeTheme: activeTheme,
            onThemeChange: this.handleThemeChange,
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
            moveNews: this.state.moveNews,
            onMoveNewsChange: this.handleMoveNewsChange,
            moveHeadlines: this.state.moveHeadlines,
            onMoveHeadlinesChange: this.handleMoveHeadlinesChange,
            quietChrome: this.state.quietChrome,
            onQuietChromeChange: this.handleQuietChromeChange,
            /* Modes are recognised from the settings rather than remembered, so
             * the row needs the same values the switches below it are drawn
             * from — see `activeAppMode`. */
            appMode: activeAppMode(
              {
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
                /* Named by Holder, so it has to be here: `activeAppMode`
                 * compares only what a mode names, and a named setting missing
                 * from this snapshot is a comparison against `undefined` that
                 * never matches — the pill would simply never light. */
                newsFilter: this.state.newsFilter,
                autoRotate: this.state.autoRotate === true,
                refreshInterval: this.state.refreshInterval,
              },
              widgets,
            ),
            onAppMode: this.handleAppMode,
            onShowShortcuts: () =>
              this.setState({ showSettings: false, showShortcuts: true }),
            onReplayTour: () =>
              this.setState((prev) => ({
                showSettings: false,
                tourReplay: prev.tourReplay + 1,
              })),
            widgets: widgets,
            widgetSize: this.state.widgetSize,
            onWidgetSizeChange: this.handleWidgetSizeChange,
            onWidgetToggle: this.handleWidgetToggle,
            onWidgetPreset: this.handleWidgetPreset,
          }),

        // First-run spotlight tour (self-hides after it has been seen)
        // Full-screen tracking-only portfolio
        showPortfolio &&
          React.createElement(Portfolio, {
            holdings: portfolio,
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
            onWatch: this.handleWatchAddress,
            onUnwatch: this.handleUnwatchAddress,
            onClose: this.togglePortfolio,
          }),

        /* Targets that were hit and calls that came true — one dismissible
         * toast each. The stack was gated on `firedAlerts` alone, so a call
         * settling with no target pending had nowhere to be announced. */
        (this.state.firedAlerts.length > 0 || this.state.wonCalls.length > 0) &&
          React.createElement(
            AlertToastStack,
            null,
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
                    "aria-label": "Dismiss",
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
                    "aria-label": "Dismiss",
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
                  callsCelebrate: this.state.callsCelebrate,
                  onCallsCelebrateChange: this.handleCallsCelebrateChange,
                  onClearSettled: this.handleClearSettled,
                  callGeometry: this.state.callGeometry,
                  boardZoom: this.state.boardZoom,
                  onBoardZoomChange: this.handleBoardZoomChange,
                  onWithdrawCall: this.handleWithdrawCall,
                  onResetCalls: this.handleResetCalls,
                  // The panel names a call's range when it is not the one on
                  // screen; without this it had nothing to compare against
                  // and said so on every row.
                  period: this.state.period,
                  alerts: this.state.alerts,
                  // The info card states where things stand, and whether a hit
                  // is announced (and checked in the background) is part of
                  // that — it is a Settings switch the panel cannot see
                  alertTabTitle: this.state.alertTabTitle,
            coinOptions,
            activeCoin,
            currency,
            formatPrice: (value, curr) =>
              formatNumberString(
                value,
                getCurrencySymbol(curr || currency),
                true,
                false,
                decimalPlaces,
                separatorFormat,
              ),
            // Live prices and 24h moves, so each row can say where it stands
            // instead of only what was asked for
            stats: this.coinStats(),
            onAdd: this.handleAddAlert,
            onRemove: this.handleRemoveAlert,
            onRestore: this.handleRestoreAlert,
            onRearm: this.handleRearmAlert,
            onClose: () => this.setState({ alertsView: null }),
          }),

        // Keyboard reference ("?")
        this.state.showShortcuts &&
          React.createElement(ShortcutsPanel, {
            onClose: () => this.setState({ showShortcuts: false }),
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
  React.createElement("div", null, "Something went wrong."),
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
    "Reload",
  ),
);

const app = document.createElement("div");
app.setAttribute("id", "root");
document.body.appendChild(app);

ReactDOM.render(
  React.createElement(
    ErrorBoundary,
    { fallback: rootErrorFallback },
    React.createElement(App, null),
  ),
  app,
);
