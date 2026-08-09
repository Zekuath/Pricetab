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
      showShortcuts: false, // "?" keyboard reference
      alerts: loadAlerts(), // Price targets (in-tab, zero permissions)
      firedAlerts: [], // Targets just hit → toast stack
      showAlerts: false, // Targets panel visibility
      tickerEnabled: loadTickerFromStorage(), // Tab ticker mode
      tickerFormat: loadTickerFormatFromStorage(), // 'compact' or 'full'
      autoRotate: loadAutoRotateFromStorage(), // Auto-cycle through coins
      autoRotateInterval: loadAutoRotateIntervalFromStorage(), // ms
      newsTicker: loadNewsTickerFromStorage(), // News row in the page ticker
      newsItems: [], // [{ source, title, url }]
      tickerText: "", // Full ticker string
      // Widget states
      widgets: loadWidgetsFromStorage(), // { fearGreed, marketOverview, halvingCountdown, rsiWidget }
      hiddenWidgets: loadHiddenWidgetsFromStorage(), // Per-widget hide state from main screen
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

    // Portfolio price refresh timer (runs only while the view is open)
    this.portfolioInterval = null;
    this._portfolioFetching = false;

    // Auto-rotate timer
    this.autoRotateTimer = null;

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
    _defineProperty(this, "setCoinIndex", (index) => {
      this.tickerScrollPos = 0;
      this.setState(
        (prevState) => {
          const len = prevState.coinOptions.length;
          if (!len) return null;
          const next = Math.min(Math.max(index, 0), len - 1);
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

      // Show skeleton after 300ms if still loading
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
      const { widgets, coinOptions, coinIndex } = this.state;
      const coin = coinOptions[coinIndex] || "BTC";
      // Drop late responses for a coin the user already switched away from
      const isStillCurrent = () =>
        (this.state.coinOptions[this.state.coinIndex] || "BTC") === coin;

      // Market-wide widgets
      if (widgets.fearGreed) {
        try {
          const data = await fetchFearGreedIndex();
          if (data) this.setState({ fearGreedData: data });
        } catch (e) { /* silent fail – widget shows stale data */ }
      }
      if (widgets.marketOverview) {
        try {
          const data = await fetchMarketOverview();
          if (data) this.setState({ marketOverviewData: data });
        } catch (e) { /* silent fail */ }
      }
      if (widgets.halvingCountdown) {
        try {
          const data = await fetchHalvingData();
          if (data) this.setState({ halvingData: data });
        } catch (e) { /* silent fail */ }
      }
      if (widgets.altcoinSeason) {
        try {
          const data = await fetchAltcoinSeason();
          if (data) this.setState({ altcoinSeasonData: data });
        } catch (e) { /* silent fail */ }
      }

      // Coin-specific widgets
      if (widgets.fundingRate) {
        try {
          const data = await fetchFundingRate(coin);
          if (isStillCurrent()) this.setState({ fundingRateData: data });
        } catch (e) { /* silent fail */ }
      }
      if (widgets.longShortRatio) {
        try {
          const data = await fetchLongShortRatio(coin);
          if (isStillCurrent()) this.setState({ longShortData: data });
        } catch (e) { /* silent fail */ }
      }
      if (widgets.openInterest) {
        try {
          const data = await fetchOpenInterest(coin);
          if (isStillCurrent()) this.setState({ openInterestData: data });
        } catch (e) { /* silent fail */ }
      }
      if (widgets.liquidations) {
        try {
          const data = await fetchLiquidations(coin);
          if (isStillCurrent()) this.setState({ liquidationsData: data });
        } catch (e) { /* silent fail */ }
      }
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
            updateTabTitle(
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
          updateTabTitle(
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
            updateTabTitle(
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
            updateTabTitle(
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
    _defineProperty(this, "fetchPortfolioPrices", async () => {
      if (document.hidden || this._portfolioFetching) return;
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
      this.setState({ portfolioPrices: prices, portfolioReady: true });
    });

    _defineProperty(this, "handleKeyDown", (e) => {
      // Ignore shortcuts with modifiers or while typing in a field
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
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
          this.setState({ showQuickSwitch: false });
        } else if (this.state.showAlerts) {
          e.preventDefault();
          this.setState({ showAlerts: false });
        } else if (this.state.firedAlerts.length) {
          e.preventDefault();
          this.setState({ firedAlerts: [] });
        } else if (this.state.showSettings) {
          e.preventDefault();
          this.toggleSettings();
        } else if (this.state.showPortfolio) {
          e.preventDefault();
          this.togglePortfolio();
        }
        return;
      }
      // S toggles settings — but not underneath another overlay
      if (
        (e.key === "s" || e.key === "S") &&
        !this.state.showPortfolio &&
        !this.state.showAlerts &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.toggleSettings();
        return;
      }

      // A toggles price targets, mirroring S
      if (
        (e.key === "a" || e.key === "A") &&
        !this.state.showPortfolio &&
        !this.state.showSettings &&
        !this.state.showQuickSwitch
      ) {
        e.preventDefault();
        this.setState((prev) => ({ showAlerts: !prev.showAlerts }));
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
        this.state.showAlerts ||
        this.state.showShortcuts
      ) {
        return;
      }

      // "/" opens the coin jumper (the same key browsers use for find-in-page
      // on some platforms, so claim it explicitly)
      if (e.key === "/") {
        e.preventDefault();
        this.setState({ showQuickSwitch: true });
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

    _defineProperty(this, "handleAddAlert", (coin, direction, target) => {
      this.setState((prev) => {
        if (prev.alerts.length >= MAX_ALERTS) return null;
        const alerts = [
          ...prev.alerts,
          {
            id: `${coin}-${direction}-${Date.now()}`,
            coin,
            direction,
            target,
            currency: prev.currency,
            created: Date.now(),
            triggeredAt: null,
          },
        ];
        saveAlerts(alerts);
        return { alerts };
      }, this.checkAlerts);
    });

    _defineProperty(this, "handleRemoveAlert", (id) => {
      this.setState((prev) => {
        const alerts = prev.alerts.filter((a) => a.id !== id);
        saveAlerts(alerts);
        return { alerts, firedAlerts: prev.firedAlerts.filter((a) => a.id !== id) };
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
      if (activeCoin && isFinite(Number(this.state.currentValue))) {
        prices[activeCoin] = Number(this.state.currentValue);
      }
      const watched = alertCoinsToWatch(alerts, currency);
      for (const coin of watched) {
        if (prices[coin] != null) continue;
        const entry = pageTickerCache.get(`${coin}-${currency}`);
        if (entry && isFinite(entry.price)) prices[coin] = entry.price;
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
      );
      if (!fired.length) return;
      // Record when it was actually hit, not when we noticed
      const hitTimes = new Map(fired.map((a) => [a.id, a.hitAt]));
      this.setState((prev) => {
        const now = Date.now();
        const updated = prev.alerts.map((a) =>
          hitTimes.has(a.id)
            ? { ...a, triggeredAt: hitTimes.get(a.id) || now }
            : a,
        );
        saveAlerts(updated);
        return { alerts: updated, firedAlerts: [...prev.firedAlerts, ...fired] };
      });
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
    _defineProperty(this, "handleQuickSwitchPick", (coin, owned) => {
      this.setState({ showQuickSwitch: false });
      if (!owned) {
        const result = this.handleAddCoinOption(coin);
        if (!result || result.success === false) return;
      }
      const index = this.state.coinOptions.indexOf(coin);
      // Adding appends to the end of the list
      const target =
        index >= 0 ? index : Math.max(0, this.state.coinOptions.length - 1);
      this.setCoinIndex(target);
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

    _defineProperty(this, "fetchNewsData", async () => {
      if (!this.state.newsTicker || this._newsFetching) {
        return;
      }

      // Serve from cache while fresh
      const cached = loadJsonSetting(NEWS_CACHE_KEY);
      if (
        cached &&
        Date.now() - cached.t < NEWS_REFRESH_MS &&
        Array.isArray(cached.items) &&
        cached.items.length
      ) {
        this.setState({ newsItems: cached.items });
        return;
      }

      this._newsFetching = true;
      try {
        // Either source failing alone must not empty the row
        const [blockchairItems, hnItems] = await Promise.all([
          fetchBlockchairNews().catch(() => []),
          fetchHackerNewsStories().catch(() => []),
        ]);

        // Fresh headlines first, HN's weekly best appended; spam + cross-source
        // duplicates dropped inside the merge
        const items = mergeNewsItems(blockchairItems, hnItems);

        if (items.length) {
          this.setState({ newsItems: items });
          saveJsonSetting(NEWS_CACHE_KEY, { t: Date.now(), items });
        }
      } catch (error) {
        // Silently fail — the news row simply stays hidden
      } finally {
        this._newsFetching = false;
      }
    });

    _defineProperty(this, "startNewsTicker", () => {
      this.stopNewsTicker();
      if (!this.state.newsTicker) {
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
      this.setState({ newsTicker: enabled }, () => {
        if (enabled) {
          this.startNewsTicker();
        } else {
          this.stopNewsTicker();
        }
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
          updateTabTitle(
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
      if (await bulkRefreshPageTickerCache(SUGGESTED_COINS, curr)) {
        this.buildPageTickerItems();
      }

      for (let i = 0; i < SUGGESTED_COINS.length; i += PAGE_TICKER_BATCH_SIZE) {
        if (!this.needsCoinSweep()) break;

        const batch = SUGGESTED_COINS.slice(i, i + PAGE_TICKER_BATCH_SIZE);

        await Promise.all(
          batch.map((coin) => refreshPageTickerCoin(coin, curr, now)),
        );

        this.buildPageTickerItems();

        if (i + PAGE_TICKER_BATCH_SIZE < SUGGESTED_COINS.length) {
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

    _defineProperty(this, "scrollTickerTitle", () => {
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
    // Set initial tab title
    updateTabTitle(
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
    this.stopTickerInterval();
    this.stopAutoRotate();
    this.stopNewsTicker();

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

    // Select color palette based on active theme
    const colors = activeTheme === "light" ? lightColors : darkColors;
    const currentTheme = {
      ...theme,
      color: colors,
    };

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
          { tickerTop },
          !showPortfolio &&
            !this.state.showAlerts &&
            !this.state.showQuickSwitch &&
            React.createElement(
              SettingsToggleButton,
              {
                onClick: this.toggleSettings,
                open: showSettings,
                type: "button",
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
            React.createElement(
              AlertsToggleButton,
              {
                onClick: () =>
                  this.setState((prev) => ({ showAlerts: !prev.showAlerts })),
                type: "button",
                tickerTop: tickerTop && !this.state.showAlerts,
                open: this.state.showAlerts,
                hasFired:
                  !this.state.showAlerts &&
                  this.state.alerts.some((a) => a.triggeredAt),
                "aria-label": this.state.showAlerts
                  ? "Close price targets"
                  : "Price targets",
                title: this.state.showAlerts
                  ? "Close price targets"
                  : "Price targets (A)",
              },
              this.state.showAlerts ? "×" : icon("target", 1.1),
            ),

          // Portfolio toggle (left of the gear)
          !showSettings &&
            !this.state.showAlerts &&
            !this.state.showQuickSwitch &&
            React.createElement(
              PortfolioToggleButton,
              {
                onClick: this.togglePortfolio,
                open: showPortfolio,
                type: "button",
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

            // Show skeleton or actual overview
            showSkeleton
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
                  Fragment,
                  null,
                  React.createElement(Overview, {
                    coin: activeCoin,
                    cycleCoinIndex: this.cycleCoinIndex,
                    currentValue,
                    valueHistory,
                    decimalPlaces,
                    separatorFormat,
                    currency,
                  }),
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
                ),

            // Show skeleton or actual period switcher
            showSkeleton
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
              null,
              // Show skeleton or actual chart
              showSkeleton
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
                    interactive: true, // crosshair with OHLC + volume
                    period,
                    coin: activeCoin,
                    ohlc: this.state.ohlcEnabled === false ? null : this.state.ohlcData,
                    onNeedOhlc:
                      this.state.ohlcEnabled === false ? null : this.loadOhlc,
                    showCandles:
                      this.state.chartType === "candles" &&
                      Boolean(this.state.ohlcData),
                    candles: this.state.ohlcData,
                    // Any overlay covering the chart clears the readout
                    paused:
                      showSettings ||
                      showPortfolio ||
                      this.state.showAlerts ||
                      this.state.showQuickSwitch,
                    formatPrice: this.formatChartPrice,
                  }),
            ),
          ),
        ),
        // Widget toggle button (fixed, above the panel)
        (() => {
          if (
            showSettings ||
            showPortfolio ||
            this.state.showAlerts ||
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
                          width: "92px",
                          height: "40px",
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
                      { style: { marginTop: "3px" } },
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
                      { style: { fontSize: "0.85rem" } },
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
                          gap: "6px",
                          marginTop: "5px",
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
                      React.createElement(
                        RsiLabels,
                        null,
                        React.createElement(
                          HalvingTimeLabel,
                          null,
                          "Oversold",
                        ),
                        React.createElement(
                          HalvingTimeLabel,
                          null,
                          "Overbought",
                        ),
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
                        "span",
                        { style: { color: "#34d399" } },
                        "L " + longShortData.longPct + "%",
                      ),
                      React.createElement(
                        "span",
                        { style: { color: "#f87171" } },
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
                      React.createElement(
                        "span",
                        { style: { color: "#f87171" } },
                        "L " + liquidationsData.longFormatted,
                      ),
                      React.createElement(
                        "span",
                        { style: { color: "#34d399" } },
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
                    { onClick: () => this.hideWidget(key), title: "Hide" },
                    "\u00d7",
                  ),
                  React.createElement(WidgetLabel, null, def.label),
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
            newsItems,
          } = this.state;
          if (showSettings || showPortfolio || !pageTicker || !pageTickerReady || !pageTickerItems || pageTickerItems.length === 0) return null;

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
            chartColor: this.state.chartColor,
            onChartColorChange: this.handleChartColorChange,
            lastSeenEnabled: this.state.lastSeenEnabled,
            onLastSeenChange: this.handleLastSeenChange,
            ohlcEnabled: this.state.ohlcEnabled,
            onOhlcChange: this.handleOhlcChange,
            chartType: this.state.chartType,
            onChartTypeChange: this.handleChartTypeChange,
            onShowShortcuts: () =>
              this.setState({ showSettings: false, showShortcuts: true }),
            widgets: widgets,
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
            onRemove: this.handleRemoveHolding,
            onImport: this.handleImportPortfolio,
            onWatch: this.handleWatchAddress,
            onUnwatch: this.handleUnwatchAddress,
            onClose: this.togglePortfolio,
          }),

        // Targets that were hit — one dismissible toast each
        this.state.firedAlerts.length > 0 &&
          React.createElement(
            AlertToastStack,
            null,
            this.state.firedAlerts.map((a) =>
              React.createElement(
                AlertToast,
                { key: a.id, up: a.direction === "above" },
                React.createElement(
                  "span",
                  null,
                  `${a.coin} hit ` +
                    formatNumberString(
                      a.target,
                      getCurrencySymbol(a.currency),
                      true,
                      false,
                      decimalPlaces,
                      separatorFormat,
                    ) +
                    // Candles can say when it happened; a live crossing is
                    // happening right now, so it says so
                    (a.hitAt
                      ? ` · ${describeElapsed(Date.now() - a.hitAt)}`
                      : " · just now"),
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
        this.state.showAlerts &&
          React.createElement(AlertsPanel, {
            alerts: this.state.alerts,
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
            onAdd: this.handleAddAlert,
            onRemove: this.handleRemoveAlert,
            onClose: () => this.setState({ showAlerts: false }),
          }),

        // Keyboard reference ("?")
        this.state.showShortcuts &&
          React.createElement(ShortcutsPanel, {
            onClose: () => this.setState({ showShortcuts: false }),
          }),

        // Quick coin jumper ("/")
        this.state.showQuickSwitch &&
          React.createElement(QuickSwitch, {
            coinOptions,
            onPick: this.handleQuickSwitchPick,
            onClose: () => this.setState({ showQuickSwitch: false }),
          }),

        !showSettings && !showPortfolio && React.createElement(OnboardingTour, null),
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
