/* THE PAGE TICKER AND THE COIN SWEEP — cut out of `app.js`
 *
 * Seven members, 189 contiguous lines, moved on 26 Aug 2026 with the three
 * cuts beside it. It reaches out to **one** member of the rest of the class
 * (`state`), and everything the scrolling bar needs is inside it: what to
 * publish, the one bulk request that fills it, the bounded per-coin fallback
 * when that request fails, and the two predicates that decide whether any of
 * it should run at all.
 *
 * `needsCoinSweep` and `ensureCoinSweep` are here rather than with the widgets
 * they also serve, because the watchlist and top-movers cards read the cache
 * this file fills — the sweep is the producer and they are consumers, and the
 * producer is what has to live in one place.
 *
 * The pattern is `app-portfolio.js`'s: a plain function handed the component,
 * with no `this` in the file on purpose. `Object.assign(this,
 * tickerHandlers(this))` puts every name back exactly where it was.
 *
 * Loads before `app.js` in `index.html`.
 */
const tickerHandlers = (app) => ({
    buildPageTickerItems: () => {
      const { currency, decimalPlaces, separatorFormat, coinOptions } =
        app.state;
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

      app.setState({
        pageTickerItems: items,
        watchlistData: watchlist.length ? watchlist : null,
        topMoversData: topMovers,
      });
    },

    fetchPageTickerData: async () => {
      // Hidden tab → defer until handleVisibilityChange resumes us
      if (document.hidden) {
        app.pendingPageTickerRefresh = true;
        return;
      }
      if (app._pageTickerFetching) return;
      app._pageTickerFetching = true;

      const curr = app.state.currency || DEFAULT_CURRENCY;
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
      /* And bounded, because the fallback is a fallback rather than a second
       * implementation of the bulk request. In priority order — the coins this
       * person actually follows, which is exactly what the watchlist needs,
       * then the largest of the rest so the bar and the movers are not empty —
       * capped at `PAGE_TICKER_FALLBACK_MAX`. See the note on that constant
       * for the measurement that set it. */
      const mine = app.state.coinOptions || [];
      /* **As far as something on screen reads it** (27 Sep 2026). The
       * watchlist is on by default and reads only this person's coins; the
       * rest of the list is for the bar and the movers. Measured with both of
       * those off: every new tab more than a minute after the last one sent
       * 24–28 requests for twelve coins Coinlore's top 100 does not carry —
       * a spot price and a day's history each — which nothing on the page
       * drew. With the watchlist alone the sweep stops at the coins it
       * shows. */
      const order =
        app.coinSweepScope() === "mine"
          ? mine.slice()
          : [...mine, ...SUGGESTED_COINS.filter((c) => !mine.includes(c))];
      const stale = order
        .filter((coin) => {
          if (!SUGGESTED_COINS.includes(coin)) return false;
          const entry = pageTickerCache.get(`${coin}-${curr}`);
          return !entry || now - entry.timestamp > PAGE_TICKER_TTL;
        })
        .slice(0, PAGE_TICKER_FALLBACK_MAX);

      // Publish what the bulk gave us — or, on a hydrated cache with nothing
      // to fetch, publish the cache itself so the bar paints without a request
      if (bulkFilled || !stale.length) app.buildPageTickerItems();

      for (let i = 0; i < stale.length; i += PAGE_TICKER_BATCH_SIZE) {
        if (!app.needsCoinSweep()) break;

        const batch = stale.slice(i, i + PAGE_TICKER_BATCH_SIZE);

        await Promise.all(
          batch.map((coin) => refreshPageTickerCoin(coin, curr, now)),
        );

        app.buildPageTickerItems();

        // Only between batches that actually went to the network
        if (i + PAGE_TICKER_BATCH_SIZE < stale.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, PAGE_TICKER_BATCH_DELAY),
          );
        }
      }

      app._pageTickerFetching = false;
      // Mark ready after first complete fetch so the bar animates in
      if (!app.state.pageTickerReady) {
        app.setState({ pageTickerReady: true });
      }
    },

    handlePageTickerPositionChange: (position) => {
      savePageTickerPositionToStorage(position);
      app.setState({ pageTickerPosition: position });
    },

    togglePageTickerCollapsed: () => {
      app.setState((prevState) => {
        const next = !prevState.pageTickerCollapsed;
        savePageTickerCollapsedToStorage(next);
        return { pageTickerCollapsed: next };
      });
    },

    // The all-coin sweep feeds the page ticker AND the watchlist / top-movers
    // widgets, so it should run whenever ANY of them is active.
    needsCoinSweep: () => Boolean(app.coinSweepScope()),

    /* What the sweep is for: "all" while the bar or the movers are drawn,
       "mine" while only the watchlist is, null for nothing. */
    coinSweepScope: () => {
      const w = app.state.widgets || {};
      if (app.state.pageTicker || w.topMovers) return "all";
      if (w.watchlist) return "mine";
      return null;
    },

    ensureCoinSweep: () => {
      const scope = app.coinSweepScope();
      const widened = app._sweepScope === "mine" && scope === "all";
      app._sweepScope = scope;
      if (app.needsCoinSweep()) {
        /* The bar or the movers switched on while only the watchlist was
           being swept: the rest of the list is asked for now, not at the
           next two-minute tick. */
        if (widened && app.pageTickerRefreshInterval) app.fetchPageTickerData();
        if (!app.pageTickerRefreshInterval) {
          app.fetchPageTickerData();
          app.pageTickerRefreshInterval = setInterval(
            () => app.fetchPageTickerData(),
            PAGE_TICKER_REFRESH_MS,
          );
        }
      } else if (app.pageTickerRefreshInterval) {
        clearInterval(app.pageTickerRefreshInterval);
        app.pageTickerRefreshInterval = null;
      }
    },

    handlePageTickerChange: (enabled) => {
      savePageTickerToStorage(enabled);
      // Turning the ticker on from settings should always show it expanded
      if (enabled) savePageTickerCollapsedToStorage(false);
      app.setState(
        {
          pageTicker: enabled,
          pageTickerCollapsed: enabled ? false : app.state.pageTickerCollapsed,
        },
        app.ensureCoinSweep,
      );
    },
});
