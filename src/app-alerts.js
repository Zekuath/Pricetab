/* PRICE TARGETS — cut out of `app.js`
 *
 * Sixteen members, 354 contiguous lines, moved on 26 Aug 2026 alongside the
 * calls cut, out of a class that was 5,491 lines that morning.
 *
 * Measured before it was made, the same way the five cuts before it were.
 * **`app.js` has 136 members and none of them touches no `this`**, so there
 * are no pure helpers to lift; what is separable is a cohesive run. This run
 * reaches out to exactly **two** members of the rest of the class — `state`
 * and `setTabTitle` — and everything about a target sits inside it: adding,
 * re-arming, removing and restoring one, the announcement in the tab title,
 * the background poll, the check itself, and the two price helpers the check
 * is built on.
 *
 * `portfolioTotalFrom` and `coinStats` travel with the targets rather than
 * with the portfolio, and that is deliberate: the portfolio-total target is
 * the only reason the first exists, and `coinStats` is read by the targets
 * panel and the Settings coin list from the ticker snapshot the check already
 * holds. Splitting them off would have put one predicate in two files.
 *
 * `setTabTitle` is deliberately **not** moved with it: the ticker owns the tab
 * title and a target only borrows it, which is the whole point of
 * `_alertTitleActive`. It stays in `app.js` where the scrolling ticker is.
 *
 * The pattern is `app-portfolio.js`'s and `app-calls.js`'s: a plain function
 * handed the component. `app` is the `CryptoChart` instance, and `this` does
 * not exist in this file on purpose. The constructor does
 * `Object.assign(this, alertHandlers(this))`, so every name lands exactly
 * where it was and no caller changed.
 *
 * Loads before `app.js` in `index.html`.
 */
const alertHandlers = (app) => ({
    /* ── price targets (in-tab) ── */

    handleAddAlert: (coin, kind, direction, target) => {
      app.setState((prev) => {
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
            startPrice:
              kind === "portfolio"
                ? app.portfolioTotalFrom(app.alertPriceMap(prev))
                : app.alertPriceFor(coin, prev),
            triggeredAt: null,
            hitPrice: null,
          },
        ];
        saveAlerts(alerts);
        return { alerts };
      }, app.checkAlerts);
    },

    /* Re-arm a target that has been hit. It keeps its number and direction —
     * that was the point of it — but starts again from now, so the candle
     * lookback can't immediately re-report the crossing it just reported. */
    handleRearmAlert: (id) => {
      app.setState((prev) => {
        const alerts = prev.alerts.map((a) =>
          a.id === id
            ? {
                ...a,
                created: Date.now(),
                startPrice:
                  a.kind === "portfolio"
                    ? app.portfolioTotalFrom(app.alertPriceMap(prev))
                    : app.alertPriceFor(a.coin, prev),
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
      }, app.checkAlerts);
    },

    // Best price we have for a coin in the displayed currency: the chart's
    // own value for the active coin, the ticker snapshot otherwise.
    alertPriceFor: (coin, state) => {
      const s = state || app.state;
      if (coin === s.coinOptions[s.coinIndex]) {
        const live = Number(s.currentValue);
        if (isFinite(live) && live > 0) return live;
      }
      const entry = pageTickerCache.get(`${coin}-${s.currency}`);
      return entry && isFinite(entry.price) && entry.price > 0
        ? entry.price
        : null;
    },

    /* Prices for everything held, in the shape `portfolioTotalFrom` wants.
     * Built out of `alertPriceFor`, so the active coin still contributes the
     * chart's own live value and everything else comes from the ticker
     * snapshot — no request, and one definition of "the price" rather than
     * two that can disagree. */
    alertPriceMap: (state) => {
      const s = state || app.state;
      const prices = {};
      for (const h of s.portfolio || []) {
        if (!h || !h.coin) continue;
        const price = app.alertPriceFor(h.coin, s);
        if (price != null) prices[h.coin] = price;
      }
      return prices;
    },

    handleRemoveAlert: (id) => {
      app.setState((prev) => {
        const alerts = prev.alerts.filter((a) => a.id !== id);
        saveAlerts(alerts);
        return { alerts, firedAlerts: prev.firedAlerts.filter((a) => a.id !== id) };
      });
    },

    /* Put a removed target back exactly as it was — same id, same created
     * time, same start price. Rebuilding it from the form would lose all
     * three, which is the reason undo exists rather than "type it again". */
    handleRestoreAlert: (alert) => {
      app.setState((prev) => {
        if (prev.alerts.length >= MAX_ALERTS) return null;
        if (prev.alerts.some((a) => a.id === alert.id)) return null;
        const alerts = [...prev.alerts, alert];
        saveAlerts(alerts);
        return { alerts };
      }, app.checkAlerts);
    },

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
    alertTitleText: () => {
      const fired = app.state.firedAlerts;
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
              app.state.decimalPlaces,
              app.state.separatorFormat,
            )}`;
      return fired.length > 1 ? `${what} +${fired.length - 1} more` : what;
    },

    syncAlertTitle: () => {
      const wanted =
        app.state.alertTabTitle && app.state.firedAlerts.length > 0;
      if (!wanted) {
        app.stopAlertTitle();
        return;
      }
      app._alertTitleActive = true;
      // Visible tab: state it once and leave it alone. Hidden tab: alternate,
      // so the change is what draws the eye rather than the text.
      const paint = () => {
        const text = app.alertTitleText();
        if (!text) return;
        if (document.hidden) {
          app._alertTitleFlip = !app._alertTitleFlip;
          document.title = app._alertTitleFlip ? `● ${text}` : "● ● ●";
        } else {
          document.title = `● ${text}`;
        }
      };
      paint();
      clearInterval(app.alertTitleTimer);
      app.alertTitleTimer = setInterval(paint, ALERT_TITLE_FLASH_MS);
    },

    stopAlertTitle: () => {
      if (app.alertTitleTimer) {
        clearInterval(app.alertTitleTimer);
        app.alertTitleTimer = null;
      }
      if (!app._alertTitleActive) return;
      app._alertTitleActive = false;
      app._alertTitleFlip = false;
      // Hand the title back to whoever had it
      app.setTabTitle(
        app.state.coinOptions,
        app.state.coinIndex,
        app.state.currentValue,
        app.state.valueHistory,
      );
    },

    /* Keeps checking targets while the tab is hidden — the one thing in the
     * extension that fetches while you are looking elsewhere, because a
     * target nobody checks can't be announced. Bounded on every side: only
     * with an armed target, only that target's coins (one bulk request, and
     * the candle lookback is cached), only slowly, and only while the
     * announcement setting is on, which is what makes the switch a real off
     * switch for the background work rather than for the message alone.
     */
    syncAlertBackgroundPoll: () => {
      const armed = app.state.alerts.some((a) => !a.triggeredAt);
      const wanted = app.state.alertTabTitle && armed;
      if (wanted === Boolean(app.alertPollInterval)) return;
      if (wanted) {
        app.alertPollInterval = setInterval(() => {
          if (!document.hidden) return; // the normal fetch loop has it
          app.refreshAlertPrices();
        }, ALERT_BACKGROUND_POLL_MS);
      } else {
        clearInterval(app.alertPollInterval);
        app.alertPollInterval = null;
      }
    },

    handleAlertTabTitleChange: (enabled) => {
      saveAlertTabTitle(enabled);
      app.setState({ alertTabTitle: enabled }, () => {
        app.syncAlertTitle();
        app.syncAlertBackgroundPoll();
      });
    },

    dismissFiredAlert: (id) => {
      app.setState((prev) => ({
        firedAlerts: prev.firedAlerts.filter((a) => a.id !== id),
      }));
    },

    // Check every armed alert against the freshest prices we have. Runs
    // after each fetch; the active coin's price comes from state, the rest
    // from the shared ticker cache (filled by the bulk sweep below).
    checkAlerts: async () => {
      const { alerts, currency } = app.state;
      if (!alerts.some((a) => !a.triggeredAt)) return;
      const prices = {};
      const activeCoin = app.state.coinOptions[app.state.coinIndex];
      /* The chart's own value is the freshest thing we have for the active
       * coin — but only while the tab is being looked at. Hidden, the chart
       * loop is paused and that number is however old the tab is, while the
       * background check's own sweep is seconds old, so state must not win. */
      if (
        !document.hidden &&
        activeCoin &&
        isFinite(Number(app.state.currentValue))
      ) {
        prices[activeCoin] = Number(app.state.currentValue);
      }
      const watched = alertCoinsToWatch(alerts, currency, app.state.portfolio);
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
        app.portfolioTotalFrom(prices),
      );
      if (!fired.length) return;
      // Record when it was actually hit, not when we noticed, and what it was
      // worth then — the row still says so days later
      const hits = new Map(fired.map((a) => [a.id, a]));
      app.setState((prev) => {
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
    },

    /* What everything held is worth right now, from the prices this check has
     * already gathered — no request of its own.
     *
     * Null rather than a partial sum when a held coin has no price: a total
     * missing one holding is a smaller number than the truth, and a target
     * that fires because a price was briefly unavailable is a target that
     * announced something that did not happen. `holdingAmount` covers the
     * hand-entered part plus every watched address, and lives in
     * `portfolio.js` — which loads after this file, so this may only be called
     * at runtime, never at module level. */
    portfolioTotalFrom: (prices) => {
      const holdings = app.state.portfolio;
      if (!holdings || !holdings.length) return null;
      let total = 0;
      for (const h of holdings) {
        const amount = holdingAmount(h);
        if (!(amount > 0)) continue;
        const price = Number(prices ? prices[h.coin] : NaN);
        if (!isFinite(price) || price <= 0) return null;
        total += price * amount;
      }
      return total > 0 ? total : null;
    },

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
    coinStats: () => {
      const out = {};
      const currency = app.state.currency;
      for (const coin of SUGGESTED_COINS) {
        const entry = pageTickerCache.get(`${coin}-${currency}`);
        const price = app.alertPriceFor(coin);
        if (price == null && !entry) continue;
        out[coin] = {
          price,
          change: entry && isFinite(entry.change) ? entry.change : null,
          marketCap:
            entry && isFinite(entry.marketCap) ? entry.marketCap : null,
        };
      }
      return out;
    },

    // Alerts on coins other than the active one need prices too — one bulk
    // request covers them all, and only runs when such alerts exist.
    refreshAlertPrices: async () => {
      const { alerts, currency, coinOptions, coinIndex } = app.state;
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
      app.checkAlerts();
    },
});
