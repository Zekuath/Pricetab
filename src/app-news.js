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
    /* Who wants the feed. Four consumers now — the scrolling row, the
     * move-headlines line under the price, the news panel, and the derivatives
     * workspace, whose left column lists what has been written about the
     * market you are about to open on — and the loader
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
          app.state.showNews ||
          /* The futures screen, by exactly the rule the news panel follows:
             nothing is fetched until it is open, and opening it is a
             deliberate act. Its headline strip is drawn from the same feed
             and asks for nothing of its own, so this is the one line that
             makes the strip fill rather than sit empty for anybody with the
             ticker off. */
          app.state.alertsView === "futures",
      ),

    /* `options`: `force` skips the cache (a source was just granted or
       switched on); `poll` is the interval's and the returning tab's own ask,
       which takes the cache only while it is younger than half the refresh.
       The interval runs at the refresh itself, jittered a tenth either way,
       so a poll that lands just under it found the cache "fresh", asked
       nothing, and the next real fetch came a whole period later — up to
       nineteen minutes between refreshes instead of ten. */
    fetchNewsData: async (options) => {
      if (!app.newsWanted()) return;
      const force = Boolean(options && options.force === true);
      const poll = Boolean(options && options.poll === true);
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
        /* …and a forced ask stays forced. The fetch in flight writes a fresh
           cache when it lands, so a re-run that consulted the cache found it
           fresh and asked nothing: a newsroom granted during a fetch did not
           appear until the next poll, the very case this re-run exists for. */
        app._newsAgain = app._newsAgain === "force" || force ? "force" : true;
        return;
      }

      /* Serve from cache while fresh — through the sanitizer, like every
       * other stored shape. A cache that survived a version upgrade or a hand
       * edit is untrusted input, and its `url` becomes an `href`. If nothing
       * survives the check, fall through and fetch rather than render the
       * remains: an empty row from a corrupt cache would look like a dead
       * feature and would keep looking like one for the rest of the TTL. */
      const cached = force ? null : loadJsonSetting(NEWS_CACHE_KEY);
      const fresh = poll ? NEWS_REFRESH_MS / 2 : NEWS_REFRESH_MS;
      if (cached && Date.now() - cached.t < fresh) {
        /* The cache this tab already shows is not handed over again: every
           open and close of the panel restarts the loader, and a freshly
           sanitized copy of the same headlines is a new array — which
           reopened the headline row's PureComponent subtree and recomputed
           the panel for nothing. */
        if (app._newsCacheT === cached.t && app.state.newsItems.length) return;
        const items = sanitizeNewsItems(cached.items, NEWS_FEED_MAX);
        if (items.length) {
          app._newsCacheT = cached.t;
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
          (src) =>
            (!src.optional || granted.includes(src.id)) &&
            // An opt-in source is not asked anything until it is switched on
            (!src.optIn || (app.state.newsSources || {})[src.name] === true),
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
        const items = balanceNewsItems(mergeNewsItems(Infinity, ranked));

        if (items.length) {
          const t = Date.now();
          app._newsCacheT = t;
          app.setState({ newsItems: items });
          saveJsonSetting(NEWS_CACHE_KEY, { t, items });
          /* …and kept. The line above replaces the cache wholesale every ten
           * minutes, which is right for "the news right now" and is why this
           * app used to throw away every headline it had ever shown. The
           * archive answers the weeks the network archive has not reached —
           * see `api.js`. */
          archiveNewsItems(items);
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
          const again = app._newsAgain;
          app._newsAgain = false;
          app.fetchNewsData(again === "force" ? { force: true } : undefined);
        }
      }
    },

    /* The panel asks for this after a permission is granted or dropped: six
     * feeds became readable (or stopped being), and waiting ten minutes for
     * the next poll to notice would make the button look like it did nothing.
     * The cache is cleared first, or the poll would serve the old answer. */
    refreshNewsSources: () => {
      saveJsonSetting(NEWS_CACHE_KEY, { t: 0, items: [] });
      app._newsCacheT = 0;
      app.setState({ newsItems: [] }, () => app.fetchNewsData({ force: true }));
    },

    /* After "Not now", the panel's quiet line leads to Settings →
       Permissions. A method rather than an arrow written into the panel's
       props: the panel is a PureComponent, and a new function on every render
       of the app redrew all of it on every price tick. */
    openNewsPermissions: () => {
      app.setState({ showNews: false, showSettings: true, settingsTab: "permissions" });
    },

    handleNewsSourceToggle: (name) => {
      /* An opt-in source is off unless stored on, so both states are
         written; switching one on asks it straight away rather than at the
         next poll, which would make the chip look as if it did nothing. */
      const src = NEWS_SOURCES.find((s) => s.name === name);
      const optIn = Boolean(src && src.optIn);
      let turnedOn = false;
      app.setState(
        (prev) => {
          const next = { ...prev.newsSources };
          if (optIn) {
            turnedOn = next[name] !== true;
            next[name] = turnedOn;
          } else if (next[name] === false) delete next[name];
          else next[name] = false;
          saveNewsPanelSources(next);
          return { newsSources: next };
        },
        () => {
          if (turnedOn) app.refreshNewsSources();
        },
      );
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
      const coins = app.state.coinOptions;
      const portfolio = app.state.portfolio;
      const previous = app._filteredNews;
      if (
        previous &&
        previous.items === items &&
        previous.mode === mode &&
        previous.coins === coins &&
        previous.portfolio === portfolio
      ) {
        return previous.value;
      }
      let value = items;
      if (mode === "coins") value = newsForCoins(items, coins);
      if (mode === "portfolio") {
        value = newsForCoins(items, (portfolio || []).map((h) => h.coin));
      }
      /* The row draws each headline twice for its loop; the feed is kept
         longer than that for the panel (NEWS_FEED_MAX), so the row takes
         the newest of it. */
      if (Array.isArray(value) && value.length > MAX_NEWS_ITEMS) value = value.slice(0, MAX_NEWS_ITEMS);
      /* A filtered mode returns a new array. Without retaining it, every
         unrelated root update handed the PureComponent ticker a different
         prop and reopened the two-thousand-node subtree this cache protects. */
      app._filteredNews = { items, mode, coins, portfolio, value };
      return value;
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
      /* Jittered by a tenth either way. Every tab on every machine polling on
         the same ten-minute beat from the same install time is how a public
         feed sees a burst rather than a reader; a little spread costs nothing
         and is the polite shape. */
      const period = Math.round(NEWS_REFRESH_MS * (0.9 + Math.random() * 0.2));
      app.newsRefreshInterval = setInterval(() => {
        if (!document.hidden) {
          app.fetchNewsData({ poll: true });
        }
      }, period);
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
