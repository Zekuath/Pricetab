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
    // One dismissal timer per announced win, so clearing one by hand does not
    // leave a timer running for a card that has already gone
    this.wonCallTimers = new Map();

    _defineProperty(this, "state", {
      coinIndex: 0,
      currentValue: null,
      period: PERIOD_OPTIONS[0].value,
      valueHistory: [],
      coinOptions: loadCoinOptionsFromStorage(),
      /* Settings comes back open when the language was changed from inside
       * it — a reload closes every panel, so picking a language threw you
       * out of the panel you picked it in. `reopenSettingsTab` is resolved
       * once in `i18n.js` and is true for exactly the reload that set it. */
      showSettings: Boolean(reopenSettingsTab),
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
      travelBand: loadTravelBand(), // the cone on the board — see updateTravelBand
      callsCelebrate: loadCallsCelebrate(), // burst on a hit
      calls: loadCalls(), // { record, open } — local, valueless, never sent
      callsSeenAt: loadCallsSeenAt(), // when the calls panel was last opened
      newsSeenAt: loadNewsSeenAt(), // …and when the news panel was
      // The divider's position for this visit; only moves on the next open
      newsReadFrom: loadNewsSeenAt(),
      celebrateCall: null, // the call the burst is fired on
      wonCalls: [], // settled hits waiting to be acknowledged, as toasts
      callGeometry: null, // { step, spanMs, reachMs } reported by the chart
      celebrate: 0, // bumped on a hit; the chart bursts when it changes
      fireworks: 0, // bumped on a hit worth the big show — see `settleDueCalls`
      moveHeadlines: loadMoveHeadlines(), // headlines beside an unusual move
      portfolio: loadPortfolioFromStorage(), // [{ coin, amount, lots, watches }]
      // Which purchase a *new* sale consumes, and what `heldLots` assumes went
      costMethod: loadCostMethod(),
      portfolioPrices: {}, // { COIN: { price, change, up } } from pageTickerCache
      portfolioReady: false, // true after first portfolio price fetch
      themePreference: loadThemeFromStorage(), // 'auto', 'light', or 'dark'
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
      /* "Has this happened before?" — the base-rate panel ("B"). Its data is
       * years of daily closes and costs about seventeen requests, so nothing is
       * fetched until this is true. */
      showBaseRates: false,
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
      ethGasData: null, // { gwei, baseGwei, tipGwei, transferEth }
      btcFeesData: null, // { rate, fastest, hour, transferBtc }
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
        ["ethGas", fetchEthGas, "ethGasData", false],
        ["btcFees", fetchBtcFees, "btcFeesData", false],
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

      /* B opens the base rates for the coin on screen. Same exclusions as the
       * other panels: one card in the middle of the screen at a time. */
      if (
        (e.key === "b" || e.key === "B") &&
        !this.state.showPortfolio &&
        !this.state.showSettings &&
        !this.state.alertsView &&
        !this.state.showNews &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.toggleBaseRates();
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
      const held = (this.state.portfolio || []).find((h) => h && h.coin === coin);
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
        if (!isFinite(lot.paid) || !isFinite(lot.amount) || lot.amount <= 0) continue;
        paid += lot.paid;
        units += lot.amount;
      }
      if (!(units > 0) || !(paid > 0)) return null;
      return {
        value: paid / units,
        label: msg("chart_your_cost", "YOUR COST"),
      };
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
      if (typeof markReopenSettings === "function") markReopenSettings("preferences");
      const done = () => this.setState({ language: next }, () => location.reload());
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

    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    for (const t of this.wonCallTimers.values()) clearTimeout(t);
    this.wonCallTimers.clear();

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
          { onClick: this.closeMove, "aria-label": msg("app_close", "Close") },
          "×",
        ),
      ),
      React.createElement(
        MoveCardWhen,
        null,
        when + (items.length > 1 ? ` · ${items.length} unusual moves here` : ""),
      ),
      headlines === null
        ? React.createElement(MoveCardWhen, null, msg("app_looking_headlines", "Looking for headlines…"))
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
              msg("app_no_archive", "Nothing in the archive for those days."),
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
      showSkeleton,
      invalidCoin,
      apiError,
      widgets,
      fearGreedData,
      marketOverviewData,
      halvingData,
      ethGasData,
      btcFeesData,
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
            msg("app_offline", "You are offline. Data will update when connection is restored."),
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
                : msg("app_unreachable", "Couldn't reach the price service. Showing the last prices we have."),
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
            priceHistory: this.state.priceHistory,
            onToggleSource: this.handleNewsSourceToggle,
            onScopeChange: this.handleNewsScopeChange,
            onSourcesChange: this.refreshNewsSources,
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
                "aria-label": msg("app_dismiss_rating", "Dismiss rating request"),
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
                "aria-label": showSettings
                  ? msg("chrome_settings_close", "Close settings")
                  : msg("chrome_settings_open", "Open settings"),
                title: showSettings
                  ? msg("chrome_settings_close", "Close settings")
                  : msg("chrome_settings", "Settings"),
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
                  ? msg("chrome_targets_close", "Close price targets")
                  : msg("chrome_targets", "Price targets"),
                title: this.state.alertsView
                  ? msg("chrome_targets_close", "Close price targets")
                  : `${msg("chrome_targets", "Price targets")} (A)`,
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
                "aria-label": this.state.alertsView
                  ? msg("chrome_calls_close", "Close calls")
                  : msg("chrome_calls", "Calls"),
                title: this.state.alertsView
                  ? msg("chrome_calls_close", "Close calls")
                  : `${msg("chrome_calls", "Calls")} (K)`,
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
                "data-tour": "news",
                /* Something was published about a coin you are tracking since
                 * you last looked. Deliberately not "anything was published" —
                 * see the component's own note for why that dot would be lit
                 * for ever and therefore mean nothing. */
                hasFired: unseenNews,
                "aria-label": this.state.showNews
                  ? msg("chrome_news_close", "Close news")
                  : unseenNews
                    ? msg("chrome_news_new", "News — new about your coins")
                    : msg("chrome_news", "News"),
                title: this.state.showNews
                  ? msg("chrome_news_close", "Close news")
                  : unseenNews
                    ? `${msg("chrome_news_new", "News — new about your coins")} (N)`
                    : `${msg("chrome_news", "News")} (N)`,
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
                "aria-label": showPortfolio
                  ? msg("chrome_portfolio_close", "Close portfolio")
                  : msg("chrome_portfolio_open", "Open portfolio"),
                title: showPortfolio
                  ? msg("chrome_portfolio_close", "Close portfolio")
                  : msg("chrome_portfolio", "Portfolio"),
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
                          ? msg("app_offline_short", "Offline — waiting for a connection")
                          : msg("app_fetching_prices", "Fetching prices…"),
                      ),
                  )
                : React.createElement(Line, {
                    prices: valueHistory,
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
                  ? msg("app_offline_short", "Offline — waiting for a connection")
                  : msg("app_fetching_prices", "Fetching prices…"),
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
                : msg("sc_compare", "Compare with a second coin"),
              title: this.state.compareCoin
                ? `Comparing with ${this.state.compareCoin} — click to stop (C)`
                : `${msg("sc_compare", msg("sc_compare", "Compare with a second coin"))} (C)`,
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
              "aria-label": anyVisible
                ? msg("widget_hide_all", "Hide all widgets")
                : msg("widget_show_hidden", "Show hidden widgets"),
              title: anyVisible
                ? msg("widget_hide_all", "Hide all widgets")
                : msg("widget_show_hidden", "Show hidden widgets"),
            },
            anyVisible ? "\u00d7" : icon("eye", 1.15),
          );
        })(),
        // Widget Panel (drag-reorderable, widgets only)
        (() => {
          if (showPortfolio) return null;
          const hidden = this.state.hiddenWidgets;
      
    /* Every card waits in the same shape — see `WidgetSkeletonLine`. A
     * function rather than a constant because styled-components memoises the
     * element, and two cards sharing one element instance would share one
     * animation phase, which reads as a single blinking block rather than a
     * column of cards each filling in. */
    const widgetSkeleton = (rows) => {
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
        React.createElement(WidgetSkeletonLine, { tall: true, "aria-hidden": true }),
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
      if (cost < 0.01) return msg("widget_under_a_cent", "under $1", `${sym}0.01`);
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
      const sameDay = new Date(a).toDateString() === new Date(b).toDateString();
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
                  // One line per coin you follow — the list this card becomes
                  : widgetSkeleton((coinOptions || []).length),
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
                // Three gainers, three losers and the rule between them
                : widgetSkeleton(7),
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
                : widgetSkeleton(),
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
                      " · ",
                      React.createElement(MarketStatLabel, null, "ETH"),
                      marketOverviewData.ethDominance.toFixed(1) + "%",
                    ),
                  )
                : widgetSkeleton(),
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
                : widgetSkeleton(),
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
                : widgetSkeleton(),
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
                : widgetSkeleton(),
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
                      React.createElement(WidgetValue, null, msg("widget_none", "None")),
                      React.createElement(
                        WidgetSubtext,
                        null,
                        msg("widget_only_rose", "it only rose across this range"),
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
                  : widgetSkeleton(),
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
                : widgetSkeleton(),
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
                : widgetSkeleton(),
            },
            openInterest: {
              label: msg("widget_open_interest", "$1 Open Interest", activeCoin),
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
                : widgetSkeleton(),
            },
            liquidations: {
              label: msg("widget_liquidations", "$1 Liquidations 24h", activeCoin),
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
                : widgetSkeleton(),
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
                      msg("widget_btc_dom", "BTC Dom $1%", altcoinSeasonData.btcDom),
                    ),
                  )
                : widgetSkeleton(),
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
                  title: msg("chrome_ticker_hide", "Hide ticker"),
                  "aria-label": msg("chrome_ticker_hide", "Hide ticker"),
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
                  title: msg("chrome_ticker_show", "Show ticker"),
                  "aria-label": msg("chrome_ticker_show", "Show ticker"),
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
