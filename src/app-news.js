/* THE NEWS FEED AND THE HEADLINE ROW — cut out of `app.js`
 *
 * Twelve members, 216 contiguous lines, moved on 26 Aug 2026 with the calls
 * and targets cuts. Measured the same way: **not one of `app.js`'s 136
 * members touches no `this`**, so the separable unit is a cohesive run, and
 * this one reaches out to exactly **one** member of the rest of the class
 * (`state`).
 *
 * `toggleBaseRates` travels with it, which looks odd for a panel about price
 * history until you read `newsWanted`: both panels are opened the same way,
 * both fetch nothing until they are, and both were written as one run.
 * Splitting them would separate two halves of one condition.
 *
 * The pattern is `app-portfolio.js`'s: a plain function handed the component,
 * with no `this` in the file on purpose. `Object.assign(this,
 * newsHandlers(this))` puts every name back exactly where it was.
 *
 * Loads before `app.js` in `index.html`.
 */
const newsHandlers = (app) => ({
    /* Who wants the feed. Three consumers now — the scrolling row, the
     * move-headlines line under the price, and the news panel — and the loader
     * and the poller have to agree about it or one of them is always wrong.
     * That was not hypothetical: the poller once asked only about the row, so
     * a tab with headlines on and the ticker off made no news request at all
     * on load. Two copies of the condition became three, which is where a
     * condition stops being a condition and becomes a name.
     *
     * It named "the portfolio's own strip" as the third until 22 Aug 2026.
     * That strip was replaced by the panel and the comment outlived it — as
     * did the same claim in the codebase guide and in the working notes. A
     * comment naming a caller that no longer exists is worse than no comment:
     * it is the thing the next reader trusts instead of grepping. */
    newsWanted: () =>
      Boolean(
        app.state.newsTicker ||
          app.state.moveHeadlines ||
          app.state.showNews,
      ),

    fetchNewsData: async () => {
      if (!app.newsWanted()) return;
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
      if (app._newsFetching) {
        app._newsAgain = true;
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
          app.setState({ newsItems: items });
          return;
        }
      }

      app._newsFetching = true;
      app.setState({ newsLoading: true });
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
        app.setState({ newsGranted: granted });
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
        app.setState({
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
          app.setState({ newsItems: items });
          saveJsonSetting(NEWS_CACHE_KEY, { t: Date.now(), items });
        }
      } catch (error) {
        // Silently fail — the news row simply stays hidden
      } finally {
        app._newsFetching = false;
        /* The panel's "Fetching headlines…" used to be `newsItems.length === 0`
         * — which is not a loading flag, it is an emptiness flag. A fetch where
         * nothing answered never reached `setState` at all, so the panel sat on
         * "Fetching headlines…" for ever and a failed refresh was
         * indistinguishable on screen from one still running. It has to be
         * cleared here, in `finally`, or the throw path leaves the same lie. */
        app.setState({ newsLoading: false });
        if (app._newsAgain) {
          app._newsAgain = false;
          app.fetchNewsData();
        }
      }
    },

    /* The panel asks for this after a permission is granted or dropped: six
     * feeds became readable (or stopped being), and waiting ten minutes for
     * the next poll to notice would make the button look like it did nothing.
     * The cache is cleared first, or the poll would serve the old answer. */
    refreshNewsSources: () => {
      saveJsonSetting(NEWS_CACHE_KEY, { t: 0, items: [] });
      app.setState({ newsItems: [] }, app.fetchNewsData);
    },

    handleNewsSourceToggle: (name) => {
      app.setState((prev) => {
        const next = { ...prev.newsSources };
        if (next[name] === false) delete next[name];
        else next[name] = false;
        saveNewsPanelSources(next);
        return { newsSources: next };
      });
    },

    handleNewsScopeChange: (value) => {
      saveNewsPanelFilter(value);
      app.setState({ newsPanelScope: value });
    },

    toggleNews: () => {
      app.setState(
        (prev) => {
          if (prev.showNews) return { showNews: false };
          /* Opening it is looking, so the line that divides new from already-
           * read is set here — and the *previous* stamp is what the panel is
           * given, or the divider would be drawn at this instant and there
           * would never be anything above it. `newsSeenAt` is the stamp on
           * disk; `newsReadFrom` is the one on screen for this visit, and it
           * only moves the next time the panel is opened. */
          const seen = Date.now();
          saveNewsSeenAt(seen);
          return { showNews: true, newsSeenAt: seen, newsReadFrom: prev.newsSeenAt };
        },
        () => {
          // Opening it is a reason to want the feed, so the shared loader has
          // to be asked again — same shape as the portfolio's own toggle
          app.startNewsTicker();
        },
      );
    },

    /* Has a headline about a coin you are tracking arrived since the panel was
     * last opened?
     *
     * The narrowness is the whole design, and `styles-app.js` carries the
     * argument: a dot that lights whenever anything at all has been published
     * is lit permanently and therefore says nothing. Three things keep it
     * quiet. It asks only about **your** coins — the chart list plus what you
     * hold, which is the same set the panel's own two scopes offer, so the dot
     * and the filters agree about whose news this is. It asks only about
     * items **newer than the last time you looked**, from the stamp that
     * outlives the tab. And an item with no time at all cannot be newer than
     * anything, so it never lights it — an unknown date is not a recent one,
     * the rule the feed is already sorted by.
     *
     * Sources you have switched off are excluded too, for the reason the
     * cluster is built after the filters rather than before: a dot promising
     * something the panel will not show you is worse than no dot.
     *
     * Costs nothing. It is a pass over a list already in memory, and it runs
     * only while the panel is closed — with it open you are looking, so there
     * is nothing to announce. */
    hasUnseenCoinNews: () => {
      if (app.state.showNews) return false;
      const since = app.state.newsSeenAt || 0;
      if (!since) return false;
      const items = app.state.newsItems;
      if (!Array.isArray(items) || !items.length) return false;
      const enabled = app.state.newsSources || {};
      const fresh = items.filter(
        (i) => i && i.time > since && enabled[i.source] !== false,
      );
      if (!fresh.length) return false;
      const mine = new Set([
        ...(app.state.coinOptions || []),
        ...(app.state.portfolio || []).map((h) => h && h.coin),
      ]);
      for (const coin of mine) {
        if (!coin) continue;
        if (headlinesForCoin(fresh, coin, since, 1).length) return true;
      }
      return false;
    },

    /* The base-rate panel. Nothing is fetched until it opens: the deep daily
     * series behind it is about seventeen requests and 237 KB, which is right
     * for a coin somebody is studying and absurd for all 81. */
    toggleBaseRates: () => {
      app.setState((prev) => ({ showBaseRates: !prev.showBaseRates }));
    },

    /* The headline row's own list. "My coins" is the list on the chart; "what
     * I hold" is the portfolio, which is a smaller and more personal set — a
     * coin you own is one you care about whether or not it is in the rotation.
     * Anything else, including a stored value from a future version, reads as
     * "everything", because showing too much is the harmless failure. */
    filteredNews: () => {
      const items = app.state.newsItems;
      const mode = app.state.newsFilter;
      if (mode === "coins") return newsForCoins(items, app.state.coinOptions);
      if (mode === "portfolio") {
        return newsForCoins(items, (app.state.portfolio || []).map((h) => h.coin));
      }
      return items;
    },

    handleNewsFilterChange: (value) => {
      saveNewsFilter(value);
      app.setState({ newsFilter: value });
    },

    /* One loader, two consumers.
     *
     * `fetchNewsData` has always served both the scrolling row and the
     * move-headlines line under the price, but this only started it for the
     * row — so a tab with headlines on and the ticker off made no news request
     * at all on load, and the line only ever appeared if you happened to
     * toggle the setting in that session. Measured: 0 requests to Blockchair
     * or Hacker News on a fresh tab. The condition here has to be the same one
     * `fetchNewsData` uses, or one of them is always wrong. */
    startNewsTicker: () => {
      app.stopNewsTicker();
      if (!app.newsWanted()) {
        return;
      }
      app.fetchNewsData();
      app.newsRefreshInterval = setInterval(() => {
        if (!document.hidden) {
          app.fetchNewsData();
        }
      }, NEWS_REFRESH_MS);
    },

    stopNewsTicker: () => {
      clearInterval(app.newsRefreshInterval);
      app.newsRefreshInterval = null;
    },

    handleNewsTickerChange: (enabled) => {
      saveNewsTickerToStorage(enabled);
      /* Not `enabled ? start : stop` — the loader is shared with the
       * move-headlines line, and stopping it because the row was switched off
       * would silently stop refreshing the feed the line still reads. */
      app.setState({ newsTicker: enabled }, app.startNewsTicker);
    },
});
