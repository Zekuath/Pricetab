/* CALLS, THE BOARD AND THE MOVE MARKS — cut out of `app.js`
 *
 * Twenty-one handlers, 411 contiguous lines, moved on 26 Aug 2026 out of a
 * 5,491-line class. Chosen the way the four cuts before it were: by measuring
 * first, not by eye.
 *
 * Two numbers decided it. **`app.js` has 136 members and not one of them
 * touches no `this`** — so "split the file" cannot mean "lift out the pure
 * helpers", because there are none; that was already true of `chart.js` at
 * the last three cuts and it is still true. What *is* separable is a cohesive
 * run, and this one reaches **out to a single member** of the rest of the
 * class (`state`). Everything calls-shaped sat together already: placing and
 * settling a call, the board reach and its zoom, the celebration, the unusual
 * move marks and the card they open.
 *
 * The move marks travel with the calls rather than with the chart because
 * they share the same guard — both stand down under comparison, both are
 * drawn against the future-strip geometry — and because separating them would
 * have left `handleChartGeometry` with two owners.
 *
 * **The pattern is `app-portfolio.js`'s, which was `settings-preferences.js`'s
 * before it**: a plain function handed the component. `app` is the
 * `CryptoChart` instance, and `this` does not exist in this file on purpose —
 * reaching for it is the trap that made the settings search box silently take
 * no input, and the only defence is that it is not there to reach for.
 *
 * The constructor does `Object.assign(this, callHandlers(this))`, so every
 * name below lands on the component exactly where it was and no caller
 * changed. Nothing renamed, nothing reordered: the block moved whole, which is
 * the rule every cut here has followed.
 *
 * Loads before `app.js` in `index.html`.
 */
const callHandlers = (app) => ({
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
    handlePredictChange: (enabled) => {
      savePredict(enabled);
      app.setState({ predict: enabled });
    },

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
    handleBoardZoomChange: (zoom) => {
      saveBoardZoom(app.state.period, zoom);
      app.setState({ boardZoom: zoom });
    },

    handleFutureShareChange: (share) => {
      app.setState({ futureShare: share });
      app.saveFutureShareSoon(share);
    },
    saveFutureShareSoon: debounce((share) => saveFutureShare(share), 300),

    /* One open call per *square*, not per coin.
     *
     * With three squares of future on screen there are three separate
     * questions — where the price is in two days, in four, in six — and a
     * player should be able to answer all of them. What must not stack is two
     * answers to the *same* question, so placing again on a square replaces
     * whatever was on it. */
    handlePlaceCall: ({ target, span, lo, hi }) => {
      const coin = app.state.coinOptions[app.state.coinIndex];
      const period = app.state.period;
      const currency = app.state.currency;
      app.setState((prev) => {
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
          /* **How likely this square was, measured at the moment it was
             named.** Stored rather than recomputed, because the series it was
             read from is gone by the time the call settles — a difficulty
             worked out later is a difficulty from a different market.
             `callOdds` returns null below its sample floor and the record
             then leaves this call out of the comparison rather than scoring
             it as a certainty; `n` rides along so a thin sample can say so. */
          odds: (() => {
            const now =
              typeof prev.currentValue === "number" && isFinite(prev.currentValue)
                ? prev.currentValue
                : null;
            if (!now) return null;
            /* The horizon in points of the series on screen, which is what
               `callOdds` counts in: how many samples fit between now and the
               square. */
            /* `valueHistory`, the same series `settleDueCalls` judges against
               — reading a different one would score a call against a market
               it was never measured on. */
            const series = prev.valueHistory;
            if (!Array.isArray(series) || series.length < 3) return null;
            const at = (d) => (d.time instanceof Date ? d.time.getTime() : Number(d.time));
            const step = (at(series[series.length - 1]) - at(series[0])) / (series.length - 1);
            if (!(step > 0)) return null;
            const steps = Math.max(1, Math.round((target - Date.now()) / step));
            return callOdds(series, steps, lo, hi, now);
          })(),
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
    },

    /* Settle whatever is due against the series already on screen. No new
     * request and no new host: the answer is in data the chart was drawn
     * from. Runs when a series arrives, which is exactly "next time you open
     * a tab" for the coin that was called. */
    /* PRACTICE POSITIONS — one per coin, opened, closed and ended by the
     * market.
     *
     * Marked against the same live prices the calls are settled on, so a
     * position and a call cannot disagree about where a coin is. Everything
     * arithmetic lives in `practice-model.js`; these only move it in and out
     * of storage, and every write is checked — a transition the browser
     * refused to save must not be left on screen as though it happened. */
    /* **A resting order is placed, not opened.** It goes through the model's
     * own `practicePlaceOrder`, which reserves its margin as a ledger event —
     * so the account stays explainable — and refuses the two things a limit
     * order can get wrong: a price that would cross (that is a market order in
     * a limit's clothes) and a reserve the balance cannot carry.
     *
     * The price *now* is handed in, because "would this rest?" is a question
     * about the market at the moment of asking and the model owns no clock. */
    /* **The price a contract is traded and marked at: the perpetual's, in
       USDT** (`perpLastFor`), whatever the app is set to show. A contract
       from before the account was USDT-margined, in a currency other than
       the dollar, has no price here — `null`, and it is paused and said to
       be (`practiceUsdtStamp`). */
    practiceQuote: (coin, currency) => {
      if (currency && currency !== PRACTICE_CURRENCY) return null;
      return perpLastFor(coin);
    },

    /* The live prices the derivatives page quotes, per coin: the page's own
       market plus every one with a contract or an order on it. */
    practiceLivePrices: () => {
      const out = {};
      const coins = [
        ...(app.state.practice ? practiceCoinsActive(app.state.practice) : []),
        app.state.coinOptions[app.state.coinIndex],
      ];
      for (const c of coins) {
        const v = c ? perpLastFor(c) : null;
        if (v > 0) out[c] = v;
      }
      return out;
    },

    /* **Asks for the perpetual's price, then marks.** Every coin with
       something on it plus the one on screen, through the ticker's own
       five-second cache, so calling this more often than that costs nothing.
       Nothing is asked for while the section is switched off. */
    refreshPracticeQuotes: async (every) => {
      if (!app.state.practiceEnabled) return;
      const s = app.state.practice;
      const coins = new Set(s ? practiceCoinsActive(s) : []);
      if (app.state.alertsView === "futures") {
        coins.add(app.state.coinOptions[app.state.coinIndex]);
        /* The market row's chips quote the perpetual too, but at the chart's
           own cadence rather than every five seconds: `every` is passed by
           the page opening and by the chart's refresh, not by the fast
           timer. A coin OKX lists no perpetual for is not asked about. */
        if (every === true) {
          const perps = getWidgetCache(coinWidgetKey("perpCoins", "ALL"));
          for (const c of app.state.coinOptions || []) {
            if (!Array.isArray(perps) || perps.includes(c)) coins.add(c);
          }
        }
      }
      if (!coins.size) return;
      await Promise.all([...coins].filter(Boolean).map((c) => fetchPerpTicker(c)));
      app.setState((prev) => ({ practiceQuoteAt: (prev.practiceQuoteAt || 0) + 1 }));
      app.markPractice();
    },

    placePracticeOrder: (order) => {
      const coin = order && order.coin;
      const live = coin ? app.practiceQuote(coin) : null;
      if (!(live > 0)) return "price";
      const out = practicePlaceOrder(
        app.state.practice,
        {
          coin,
          currency: PRACTICE_CURRENCY,
          side: order.side,
          qty: order.qty,
          leverage: order.leverage,
          limit: order.limit,
          at: Date.now(),
          /* P6 — a stop entry, or a reduce-only limit. */
          kind: order.kind,
          reduce: order.reduce === true,
          /* Its own stop and take-profit, applied to the contract when it
             fills (practiceOrderTriggers). */
          stop: order.stop > 0 ? order.stop : null,
          take: order.take > 0 ? order.take : null,
        },
        Math.round(live * PRICE_SCALE),
      );
      if (out.error || !out.state) return out.error || "place";
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    /* **A scaled order** (28 Sep 2026): N resting limits across a range,
       placed whole or not at all by the model — one save, one state. */
    placePracticeScale: (order) => {
      const coin = order && order.coin;
      const live = coin ? app.practiceQuote(coin) : null;
      if (!(live > 0)) return "price";
      const out = practicePlaceScale(
        app.state.practice,
        {
          coin,
          currency: PRACTICE_CURRENCY,
          side: order.side,
          qty: order.qty,
          leverage: order.leverage,
          at: Date.now(),
          stop: order.stop > 0 ? order.stop : null,
          take: order.take > 0 ? order.take : null,
        },
        order.count,
        order.from,
        order.to,
        Math.round(live * PRICE_SCALE),
      );
      if (out.error || !out.state) return out.error || "place";
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    /* P4 — an order dragged on the chart. One model transition, so a refused
       new price leaves the order where it was. */
    movePracticeOrder: (id, limitE4) => {
      const s = app.state.practice;
      const o = s && s.orders ? s.orders[id] : null;
      if (!o) return "none";
      const live = app.practiceQuote(o.coin, o.currency);
      if (!(live > 0)) return "price";
      const out = practiceMoveOrder(s, id, limitE4, Math.round(live * PRICE_SCALE));
      if (out.error || !out.state) return out.error || "place";
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    cancelPracticeOrder: (id) => {
      const out = practiceCancelOrder(app.state.practice, id);
      if (out.error || !out.state) return out.error || "none";
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    openPractice: (order) => {
      const entry = Number(order && order.entry);
      if (!(entry > 0) || !(order.qty > 0) || !order.coin) return "size";
      const out = practiceOpen(
        app.state.practice,
        {
          coin: order.coin,
          currency: PRACTICE_CURRENCY,
          side: order.side,
          qty: order.qty,
          leverage: order.leverage,
          /* The model has no clock of its own on purpose — the step counter
             is what makes it replayable — so the wall-clock moment comes in
             from here, the same way the price does. */
          at: Date.now(),
          /* The ticket's reading of the moment, stamped on the contract. */
          setup: Array.isArray(order.setup) ? order.setup : [],
        },
        entry,
      );
      if (out.error || !out.state) return out.error || "open";
      /* **The mark starts when the contract does.**
       *
       * The ring lives on the app and was filled by the first marking sweep —
       * which meant a contract opened seconds before a bad print had *no*
       * smoothing at all: the sweep's first tick seeded the ring with the
       * spike itself, so the median was the spike and the position went.
       * Measured, on a 50x long against one 3% print: liquidated at 109,045
       * with the ledger showing a single step. Seeded here, the same print is
       * outvoted by the entry either side of it.
       *
       * Only when the market has no ring yet: a contract opened on a market
       * already being marked joins the mark that is there, exactly as a second
       * position on a venue does. */
      if (!app._markTicks) app._markTicks = {};
      if (!app._markTicks[order.coin]) {
        app._markTicks[order.coin] = new Array(PRACTICE_MARK_TICKS).fill(entry);
      }
      let next = out.state;
      /* The triggers go through `practiceSetTriggers` rather than onto the
         position directly, so the same side check applies to one typed on the
         ticket as to one set later. A refusal leaves the position open with no
         triggers rather than dropping the whole order.

         **Addressed by the id the open just returned, not by the coin.** The
         coin stopped naming one contract the moment a market could carry
         several, and a `setTriggers` that misses is silent — the order still
         opens, without the stop that was typed into it. */
      if (order.stop > 0 || order.take > 0) {
        const withTriggers = practiceSetTriggers(
          next,
          out.id,
          order.stop > 0 ? order.stop : null,
          order.take > 0 ? order.take : null,
        );
        if (withTriggers && withTriggers.state) next = withTriggers.state;
      }
      if (!savePractice(next)) return "save";
      app.setState({ practice: next });
      return null;
    },

    /* **A position in the list is also a route back to its market.**
     *
     * The chart already draws entry, stop, take-profit and liquidation for
     * the coin on screen, but the Futures list could be opened from any other
     * coin and offered no way to put the selected contract under those lines.
     * Closing the panel, finding the coin, and then clearing comparison was
     * three separate pieces of app knowledge for one ordinary action.
     *
     * Coins removed from the watchlist are added back explicitly by the
     * button labelled "Explore chart". A full list is refused before the
     * panel moves, so the button never closes Futures without showing the
     * chart it promised. */
    focusPractice: (coin) => {
      /* **A market, not a contract** — this one really does take a coin: it
         puts a chart on screen, and a chart is a market. What it must not do
         is ask the store whether *the* position on that coin exists, because
         the store is keyed by contract id: `positions[coin]` was undefined
         from the moment a market could carry more than one, and the route
         back to the chart refused every time. */
      if (!app.state.practice || !practiceForCoin(app.state.practice, coin).length) {
        return "none";
      }
      if (!app.state.coinOptions.includes(coin)) {
        const added = app.handleAddCoinOption(coin);
        if (!added || added.success === false) {
          return (added && added.reason) || "unsupported";
        }
      }
      app.setState({
        alertsView: null,
        compareCoin: null,
        compareHistory: null,
      });
      app.setCoinIndex((prev) => prev.coinOptions.indexOf(coin));
      return null;
    },

    /* **Choose the market the derivatives page is about**, without leaving
       it. The page's chart is the app's own series, so the market is the
       app's coin: a coin you track is selected, one you do not is added to
       the list first — the "/" jumper's rule — and a full list says so
       rather than switching to something else. Returns the refusal's name,
       or null. */
    pickPracticeMarket: (coin) => {
      if (!coin) return "unsupported";
      if (!app.state.coinOptions.includes(coin)) {
        const added = app.handleAddCoinOption(coin);
        if (!added || added.success === false) {
          return (added && added.reason) || "unsupported";
        }
      }
      app.setState({ compareCoin: null, compareHistory: null });
      app.setCoinIndex((prev) => {
        const at = prev.coinOptions.indexOf(coin);
        return at >= 0 ? at : prev.coinOptions.length - 1;
      });
      return null;
    },

    /* **P6 — close everything, in one transition.** Each contract at its own
       market's price, under the same rule the single close keeps (a
       contract paused outside its currency is left). Built on one state and
       saved once: a loop of single closes would each read the state from
       before the last, and only the final one would stick. Returns how many
       it closed. */
    closeAllPractice: () => {
      let s = app.state.practice;
      if (!s) return 0;
      let n = 0;
      for (const id of practiceList(s)) {
        const pos = practiceAt(s, id);
        const live = pos ? app.practiceQuote(pos.coin, pos.currency) : null;
        if (!pos || !(live > 0)) continue;
        const out = practiceReduce(s, id, pos.qty, Math.round(live * PRICE_SCALE), "close");
        if (out && out.state) {
          s = out.state;
          n += 1;
        }
      }
      if (n && savePractice(s)) app.setState({ practice: s });
      return n;
    },

    /* **Every resting order taken back at once** (27 Sep 2026) — one state
       walked through, like closeAllPractice: the page calling
       cancelPracticeOrder once per order would have read the same stale
       `app.state.practice` each time and saved only the last. Answers how
       many went. */
    cancelAllPracticeOrders: (coin) => {
      let s = app.state.practice;
      if (!s || !s.orders) return 0;
      let n = 0;
      for (const id of Object.keys(s.orders)) {
        if (coin && s.orders[id].coin !== coin) continue;
        const out = practiceCancelOrder(s, id);
        if (out && out.state) {
          s = out.state;
          n += 1;
        }
      }
      if (n && savePractice(s)) app.setState({ practice: s });
      return n;
    },

    /* P9 — a note and tags on a closed contract. */
    annotatePractice: (eventId, note, tags) => {
      const out = practiceAnnotate(app.state.practice, eventId, note, tags);
      if (out.error || !out.state) return out.error || "none";
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    /* P6 — turn one contract around, as one model transition. */
    reversePractice: (id) => {
      const s = app.state.practice;
      const pos = practiceAt(s, id);
      if (!pos) return "none";
      const live = app.practiceQuote(pos.coin, pos.currency);
      if (!(live > 0)) return "price";
      const out = practiceReverse(s, id, Math.round(live * PRICE_SCALE));
      if (out.error || !out.state) return out.error || "open";
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    /* **Addressed by the contract, not by the coin.** A coin carries as many
       contracts as the balance allows now, so a handler that took a coin
       could only ever mean "whichever one happens to be first". */
    closePractice: (id) => {
      const s = app.state.practice;
      const pos = practiceAt(s, id);
      if (!pos) return;
      const live = app.practiceQuote(pos.coin, pos.currency);
      if (!(live > 0)) return;
      const out = practiceReduce(s, id, pos.qty, Math.round(live * PRICE_SCALE), "close");
      if (!out || !out.state) return;
      if (savePractice(out.state)) app.setState({ practice: out.state });
    },

    /* **A stop is not a thing you set once.** `practiceSetTriggers` has been
       in the model from the start and nothing ever called it: a position was
       opened with its stop and its take-profit and neither could ever be
       moved, which is the control every venue is used through more than any
       other. Moving a stop up behind a winning position is most of what
       managing one *is*. The model refuses a level on the wrong side of the
       entry, so nothing here has to know that rule. */
    setPracticeTriggers: (id, stop, take, takeShare, trail) => {
      const s = app.state.practice;
      if (!s || !practiceAt(s, id)) return "none";
      /* `trail` is passed through as it arrives, `undefined` included — the
         model reads a missing one as "leave the trail where it is", which is
         what a caller that does not know about trails means. */
      const out = practiceSetTriggers(s, id, stop, take, takeShare, trail);
      if (out.error) return out.error;
      if (savePractice(out.state)) app.setState({ practice: out.state });
      return null;
    },

    /* Moving free balance into one isolated position is a model transition,
       not a UI edit. Return its named refusal so the preview and the commit
       can say the same thing; only expose the state after storage accepts the
       ledger event. */
    /* **The one account control that does not start a fresh account.**
     *
     * Everything else on that screen — the balance, the settlement, the
     * collateral, every plan limit — describes what the open contracts were
     * sized against, so `resetPractice` and its neighbours refuse while
     * anything is live. A deposit adds money on top of what is already
     * recorded and re-scales nothing, so it is allowed **while a contract is
     * running**, which is the only moment anyone actually reaches for it.
     *
     * The four-second wait is the panel's, not this function's: the timer
     * belongs with the bar that draws it, and a model that slept would make
     * every test wait too. This lands the money, once, when it is called. */
    /* A display preference, so it writes and sets and nothing else — no
       fresh account, no refusal while a contract is running. Every other
       control on that tab re-scales what the open contracts were sized
       against; this one only changes which unit they are read in. */
    /* **The way past a plan limit that is not a reset.**
     *
     * Both caps stop a run, and the only escape used to be `resetPractice` —
     * which destroys the balance, the lots and the record. This keeps all of
     * it and moves only the two marks the caps are measured from. */
    newPracticeSession: () => {
      const out = practiceNewSession(app.state.practice);
      if (out.error) return out.error;
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    /* **What the ticket was last set to, remembered.** Leverage per coin the
       way a venue holds it, the size share globally. Written on every change
       rather than on the order: somebody who sets 20x and then closes the tab
       without trading meant to set 20x. Refused silently if storage will not
       take it — this is a convenience, and it must never be the thing that
       stops an order. */
    setPracticeTicket: (patch) => {
      const now = app.state.practiceTicket || { leverage: {}, share: DEFAULT_PRACTICE_SHARE };
      const next = {
        leverage: { ...now.leverage, ...(patch.leverage || {}) },
        share: PRACTICE_SIZE_SHARES.includes(patch.share) ? patch.share : now.share,
      };
      /* Oldest out first, so a long rotation cannot grow the key without
         bound. The coin just set is written last and therefore kept. */
      const coins = Object.keys(next.leverage);
      for (const coin of coins.slice(0, Math.max(0, coins.length - PRACTICE_TICKET_COINS))) {
        delete next.leverage[coin];
      }
      if (
        next.share === now.share
        && coins.every((c) => next.leverage[c] === now.leverage[c])
        && coins.length === Object.keys(now.leverage).length
      ) {
        return;
      }
      savePracticeTicket(next);
      app.setState({ practiceTicket: next });
    },

    /* How futures behaves, rather than what the account is — see
       `PRACTICE_DOCK_KEY`. Neither of these touches the model. */
    setPracticeDock: (on) => {
      savePracticeDock(on);
      app.setState({ practiceDock: on });
    },

    setPracticeConfirm: (on) => {
      savePracticeConfirm(on);
      app.setState({ practiceConfirm: on });
    },

    setPracticeUnits: (units) => {
      if (!PRACTICE_UNIT_OPTIONS.includes(units)) return;
      if (app.state.practiceUnits === units) return;
      savePracticeUnits(units);
      app.setState({ practiceUnits: units });
    },

    /* **Set the balance to a figure, up or down, keeping everything else.**
     *
     * The only way to a *particular* number used to be the reset, which
     * replaces the account and takes the lots and the record with it. This is
     * the deposit movement signed: the model refuses to take more than is
     * free, because margin behind an open contract is committed rather than
     * yours to remove. */
    setPracticeBalance: (target, coin) => {
      const out = practiceSetBalance(app.state.practice, target, coin);
      if (out.error) return out.error;
      if (out.state === app.state.practice) return null;
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    depositPractice: (amount, coin) => {
      const s = app.state.practice;
      const out = practiceDeposit(s, amount, coin);
      if (out.error) return out.error;
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    /* The mirror of `addPracticeMargin`. The price goes with it because "how
       close is this to dying" is a question about the mark, and the model
       refuses rather than guessing when there is none.

       **It names a contract, not a coin.** Several contracts can be open on
       one market now, each with its own margin and its own liquidation, so
       "add margin to BTC" is not a question with one answer — the card that
       was pressed knows which one it is, and passes its id. */
    removePracticeMargin: (id, amount, markE4) => {
      const out = practiceRemoveMargin(app.state.practice, id, amount, markE4);
      if (out.error || !out.state) return out.error || "margin";
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    addPracticeMargin: (id, amount) => {
      const s = app.state.practice;
      const out = practiceAddMargin(s, id, amount);
      if (out.error) return out.error;
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    /* **Any part of a position, in the size the person chose.**
     *
     * `practiceReduce` has always taken a quantity and the panel first handed
     * it the whole position, then three fixed shares. Neither is how anyone
     * actually manages a winner: you take *the piece you decided on*, and on
     * a venue you type it — in coins or in money.
     *
     * So this takes a **quantity** now, and the two rules that bend it —
     * whole lots, and never leave a stub too small to close — have moved into
     * `practiceCloseSize`. That is not tidying: the panel quotes the close
     * before you press it, and while the rules lived here the quote and the
     * commit were two implementations of the same arithmetic, which is the
     * one thing this model exists to prevent. The chips work it out through
     * the same helper (`practiceCloseShare`), so a chip and a typed amount
     * cannot be sized differently.
     *
     * Returns a named refusal rather than failing quietly, because the ticket
     * has somewhere to put one now. */
    reducePractice: (id, qtyE3) => {
      const s = app.state.practice;
      const pos = practiceAt(s, id);
      if (!pos) return "none";
      if (pos.currency && pos.currency !== PRACTICE_CURRENCY) return "paused";
      const live = app.practiceQuote(pos.coin, pos.currency);
      if (!(live > 0)) return "price";
      const qty = practiceCloseSize(pos, qtyE3);
      if (!qty) return "size";
      const out = practiceReduce(s, id, qty, Math.round(live * PRICE_SCALE), "close");
      if (out.error) return out.error;
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    /* **Tidying the record must not move the money**, which is why this goes
     * through `practiceForget` rather than filtering an array: the ledger is
     * what the balance is recomputed from. The model folds the row's signed
     * totals into the summary and drops the row, so the account is untouched
     * to the cent and `practiceReconcile` still agrees.
     *
     * With no id it clears every settled contract at once — the same
     * mechanism, the whole list. */
    forgetPracticeClosed: (id) => {
      const s = app.state.practice;
      if (!s) return "none";
      const ids =
        id === undefined || id === null
          ? (s.ledger || [])
              .filter((e) => PRACTICE_FORGETTABLE.includes(e.kind))
              .map((e) => e.id)
          : [id];
      if (!ids.length) return "none";
      const out = practiceForget(s, ids);
      if (out.error) return out.error;
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    dismissClosedPosition: (id) => {
      app.setState((prev) => ({
        closedPositions: prev.closedPositions.filter((c) => c.id !== id),
      }));
    },

    /* **The terms, accepted once.** Written before the state changes, so a
       storage refusal cannot leave someone past a gate the next tab will put
       back in front of them — and the section is switched on at the same
       time, because pressing Agree on the terms for a thing is the plainest
       possible way of asking for it. */
    acceptPractice: () => {
      savePracticeConsent();
      savePracticeEnabled(true);
      app.setState({ practiceConsent: true, practiceEnabled: true });
    },

    /* The Preferences switch. Turning it off is a real off — the section
       leaves the panel, so nothing is drawn and nothing is marked — but it
       never forgets that the terms were read: they are about what this is,
       and that does not change while the switch is down. */
    setPracticeEnabled: (on) => {
      savePracticeEnabled(on);
      app.setState({ practiceEnabled: on });
    },

    /* Reset, and also how the simulated balance is set: choosing a size makes
       a new account of that size. Refused while anything is open — a balance
       change moves every cap the open positions were sized against. */
    resetPractice: (startBalance) => {
      const s = app.state.practice;
      if (s && s.positions && Object.keys(s.positions).length) return;
      const fresh = practiceEmptySession(
        Number(startBalance) || s.startBalance,
        s.settlement,
        s.startCollateral,
      );
      if (savePractice(fresh)) app.setState({ practice: fresh });
    },

    /* Settlement is part of the account's arithmetic, not a display unit.
       A quote balance cannot be converted into a BTC or ETH wallet without
       inventing a rate and allocation, so changing it creates a fresh account
       and is locked while any position is live. */
    /* **Only the way back to quote money.** Coin-margined accounts stopped
       being offered on 18 Sep 2026: one wallet per coin, each started at one
       of that coin (1 BTC beside 1 DOGE), for the 15 coins that have an
       inverse perpetual at all. An account already in that mode keeps
       running — its arithmetic is still in the model — and this is how it
       leaves; nothing here can start a new one. */
    setPracticeSettlement: (settlement) => {
      const s = app.state.practice;
      if (!s || settlement !== PRACTICE_SETTLEMENT_QUOTE) {
        return "settlement";
      }
      if (s.positions && Object.keys(s.positions).length) return "open";
      if (s.settlement === settlement) return null;
      const fresh = practiceEmptySession(s.startBalance, settlement, s.startCollateral);
      if (!savePractice(fresh)) return "save";
      app.setState({ practice: fresh });
      return null;
    },


    /* **Liquidation, on the real price cycle.**
     *
     * Rides the same fetch the calls are settled on, so every held coin is
     * marked and tested whether or not the panel is open — a level that is
     * only checked while you are looking at it is not a liquidation, it is a
     * decoration. Each coin is quoted from the ticker snapshot the panel
     * already reads, so this costs no request of its own. */
    /* **A limit is part of the account, so changing one makes a new account.**
     *
     * The model refuses to loosen a plan (`practiceTightenPlan`, tighten-only
     * and then locked), which is the right rule for a plan you committed to
     * at the start of a session — and this app has no start of a session. So
     * rather than offering a control that can only ever go one way, a limit
     * follows the balance: it describes the account, and a different account
     * is a fresh one. The panel says so and refuses while anything is open.
     *
     * The value goes through `sanitizePractice` rather than being trusted:
     * that is the one place that knows a plan may only hold a number the
     * product actually offers, and writing the check a second time here is
     * how the two would come to disagree.
     */
    /* Costs do not reset the account: every closed entry records the fee it
       actually paid, so the record stays true whatever this becomes. The
       model refuses the change while a contract is running. */
    setPracticeCosts: (patch) => {
      const out = practiceSetCosts(app.state.practice, patch);
      if (!out.state || out.state === app.state.practice) return out.error || null;
      if (!savePractice(out.state)) return "save";
      app.setState({ practice: out.state });
      return null;
    },

    setPracticePlan: (key, value) => {
      const s = app.state.practice;
      if (!s || !PRACTICE_PLAN_LIMITS[key]) return;
      if (s.positions && Object.keys(s.positions).length) return;
      const fresh = practiceEmptySession(s.startBalance, s.settlement, s.startCollateral);
      const next = sanitizePractice({ ...fresh, plan: { ...fresh.plan, [key]: value } });
      if (next && next.plan[key] === value && savePractice(next)) {
        app.setState({ practice: next });
      }
    },

    /* **What each held position owes at this moment, or nothing at all.**
     *
     * Funding was never charged: `practiceStep` took a `fundingPpm` that this
     * file passed as `{}`, so `s.funding` was always zero — and the record
     * screen has been printing `fees + funding` as one figure the whole time,
     * which made a true-looking number that could only ever be the fee.
     *
     * **It costs nothing on almost every mark.** A perpetual settles three
     * times a day, so this returns `null` — and asks the network for nothing
     * — on every one of the ~2,880 daily marks that is not a settlement. Only
     * when a position has actually sat through one does it fetch that coin's
     * own rate, and `fetchFundingRate` holds it for fifteen minutes, so a
     * settlement costs one request per held coin and not one per tab.
     *
     * Three cases and each is deliberate. A position that has never been seen
     * at a settlement is **stamped, not charged** — the window closed before
     * anything was watching. A coin OKX has no perpetual for, or a request
     * that fails, is **stamped without a rate**: the settlement happened and
     * cannot be priced, and the alternative is asking again in thirty seconds
     * for ever on the seventy-odd coins that have no swap. Everything else
     * pays `rate x windows`, capped inside `practiceFundingWindows`.
     */
    /* **Every venue liquidates on a mark and not on the last trade**, because
     * one bad print on a thin book takes out positions that nothing was wrong
     * with. The tick goes into a short ring here — the one place in the app
     * that sees every price a held contract is marked at — and what comes back
     * out is `practiceMarkFrom`'s median of the last three.
     *
     * On the instance rather than in state: it is read during a render that a
     * price change has already caused, it is derived from prices that are
     * themselves stored, and nothing about it needs to survive a reload — a
     * ring rebuilt from the next three ticks is the same ring.
     *
     * **A price that is not a price does not go in.** The ring is what the
     * liquidation test reads, so a zero or a NaN here would be a liquidation
     * nobody's position deserved. */
    markTick: (coin, priceE4) => {
      if (!coin || !Number.isSafeInteger(priceE4) || priceE4 <= 0) return priceE4;
      if (!app._markTicks) app._markTicks = {};
      /* **A market's first sight of a price fills the whole ring, and it has
         to.** Measured before this line existed: the ring starts empty, so the
         first mark a position ever saw was whatever single price arrived —
         and a probe that opened a 50x long and then delivered one 3% print
         liquidated it, which is the exact failure the mark exists to prevent.
         Partly-filled is worse than empty, too: a median of two picks one of
         them arbitrarily, so it would have protected a long and fed a short to
         the same spike.
         Seeded, the mark *starts* at the price and converges: one bad print is
         outvoted 2-1 in either direction, and the second consecutive one
         carries it. */
      const ring = app._markTicks[coin]
        || new Array(PRACTICE_MARK_TICKS).fill(priceE4);
      ring.push(priceE4);
      app._markTicks[coin] = ring.slice(-PRACTICE_MARK_TICKS);
      return practiceMarkFrom(app._markTicks[coin]) || priceE4;
    },

    /* What every held market is marked at right now, for the screen. The same
     * ring the liquidation sweep reads, so the card and the rule cannot
     * disagree about what "now" is worth; a market with no ring yet falls back
     * to its last price, which is what a mark of one tick already is. */
    practiceMarkMap: () => {
      const out = {};
      const ticks = app._markTicks || {};
      for (const coin of Object.keys(ticks)) {
        const m = practiceMarkFrom(ticks[coin]);
        if (m) out[coin] = m;
      }
      return out;
    },

    practiceFundingDue: async (s, marks) => {
      const now = Date.now();
      const at = practiceFundingAt(now);
      if (!at) return null;
      /* **Off is a real off, and it is also a real saving.** With funding
         switched off nothing is charged *and* nothing is fetched — the whole
         point of the switch for somebody who wants to practise direction
         without a cost that arrives three times a day while they are not
         looking. The settlement is still stamped, so switching it back on
         does not bill for the windows it was off for. */
      if (!practiceCosts(s).funding) {
        const off = {};
        for (const coin of Object.keys(marks)) {
          if (practiceForCoin(s, coin).length) off[coin] = { ppm: 0, at };
        }
        return Object.keys(off).length ? off : null;
      }
      /* **Per coin still, because a rate is a fact about a market** — but a
         coin can now carry several contracts, so the windows owed are the
         *most* any of them is behind by: the settlement is the same moment
         for all of them, and `practiceStep` stamps each one as it charges it.
         A contract that has never been marked stamps without paying. */
      const due = {};
      const ask = [];
      for (const coin of Object.keys(marks)) {
        const ids = practiceForCoin(s, coin);
        if (!ids.length) continue;
        let windows = 0;
        let unseen = false;
        for (const id of ids) {
          const pos = s.positions[id];
          if (!pos.fundedTo) { unseen = true; continue; }
          windows = Math.max(windows, practiceFundingWindows(pos.fundedTo, now));
        }
        if (windows > 0) ask.push([coin, windows]);
        else if (unseen) due[coin] = { ppm: 0, at };
      }
      if (!ask.length) return Object.keys(due).length ? due : null;
      await Promise.all(
        ask.map(async ([coin, windows]) => {
          let ppm = 0;
          try {
            const f = await fetchFundingRate(coin);
            if (f && isFinite(f.rate)) ppm = Math.round(f.rate * 1e6) * windows;
          } catch (e) {
            ppm = 0;
          }
          due[coin] = { ppm: Number.isSafeInteger(ppm) ? ppm : 0, at };
        }),
      );
      return due;
    },

    markPractice: async () => {
      /* Off is a real off. Nothing is drawn, so nothing is marked either —
         the same gap a closed browser already leaves, and the positions are
         exactly where they were left when the switch comes back up. */
      if (!app.state.practiceEnabled) return;
      const s = app.state.practice;
      if (!s || !s.positions) return;
      /* The coins held, gathered off the contracts — several of them can
         share one market, and one quote serves all of them. */
      /* **Held or resting.** A resting limit order has no position behind it,
         so a sweep that looked only at `practiceCoinsHeld` returned early and
         the order was never tested against a price — it would have waited for
         ever on a market that was already past it. */
      const coins = practiceCoinsActive(s);
      if (!coins.length) return;
      const marks = {};
      const last = {};
      for (const coin of coins) {
        /* Paused outside the currency it was opened in, exactly as a price
           target is: the quote here would be a different number for the same
           market. */
        const holder = practiceList(s).map((id) => s.positions[id]).find((p) => p.coin === coin)
          || Object.values(s.orders || {}).find((o) => o.coin === coin);
        if (holder && holder.currency && holder.currency !== PRACTICE_CURRENCY) continue;
        const live = app.practiceQuote(coin);
        /* Through the ring: what steps the account — liquidation, the stop,
           the take-profit, the funding charge — is the **mark**, not the last
           print. Closing still happens at the last price, which is the split
           every venue makes and the one this trainer was missing. */
        if (live > 0) {
          const e4 = Math.round(live * PRICE_SCALE);
          marks[coin] = app.markTick(coin, e4);
          /* The raw quote travels beside the mark: resting orders fill on a
             price that actually happened, positions are valued and liquidated
             on the smoothed one. Same split as the panel's close quote. */
          last[coin] = e4;
        }
      }
      if (!Object.keys(marks).length) return;
      const funding = await app.practiceFundingDue(s, marks);
      /* Re-read after the await. The only path that fetches is a settlement,
         which is three times a day — but on that path the account may have
         been closed, reset or added to while the request was in flight, and
         stepping the copy this function started with would put the older one
         back. */
      const now = funding ? app.state.practice : s;
      if (!now || now.step !== s.step) return;
      const out = practiceStep(now, now.step + 1, marks, funding ? { funding, last } : { last });
      if (!out.state || out.state === now) return;
      if (!savePractice(out.state)) return;
      /* **Say what the market did.** These events were computed and thrown
         away: a position could be liquidated between two tabs and the only
         sign of it was a smaller balance. The realised amount is read off the
         ledger entry the same step wrote, so the toast and the account cannot
         disagree about what happened. */
      const told = (out.events || []).map((e, i) => {
        /* Matched on the **contract**, because a coin can carry several and
           two of them can settle on the same step.
           **A fill is the one event whose ledger row is named something else**
           — the row a fill writes is an `open`, because that is what happened
           to the account — so the reason and the row are looked up apart. */
        const kind = e.reason === "fill" ? "open" : e.reason;
        const entry = [...(out.state.ledger || [])]
          .reverse()
          .find((l) => l.pos === e.pos && l.kind === kind);
        /* **A fill opened something; it did not settle it.** Its ledger row
           is an open whose `realised` is nothing — and read as a result it
           made the notice say "+0.00" under the words for a stop, because
           neither the notice nor the alarm had a case for a fill and both
           fell through to their last one (found 27 Sep 2026: a resting
           long filling announced itself as "BTC stopped out"). */
        const opened = e.reason === "fill" || e.reason === "unfilled";
        return {
          id: `${out.state.step}-${e.pos}-${i}`,
          coin: e.coin,
          reason: e.reason,
          realised: entry && !opened ? entry.realised : null,
          fill: entry ? entry.fill : null,
          triggers: e.triggers || null,
          currency: PRACTICE_CURRENCY,
          settlement: entry ? entry.settlement : PRACTICE_SETTLEMENT_QUOTE,
        };
      });
      /* **A position walking toward its liquidation is news, and nothing was
         saying it.** The ratio was on the row as a bare number and the first
         announcement of trouble was the toast saying the contract had gone.
         Announced when a position *enters* a worse band, never on every mark
         — otherwise it is a siren rather than a warning — and the bands come
         from the model so the toast and the row cannot disagree about where
         the line is.

         Kept on the instance and not in storage: it is a fact about this
         look at the screen, not about the account. A new tab will say it
         once more, which is right — that is exactly when you want telling. */
      /* Per **contract**, not per coin: two contracts on one market can be in
         different bands — a 5x and a 100x on the same coin are nowhere near
         each other — and keying this by the coin would announce one of them
         and silence the other. */
      const bands = app._practiceBands || (app._practiceBands = {});
      const rank = { safe: 0, warn: 1, danger: 2 };
      const alarms = [];
      const live = out.state.positions || {};
      for (const id of Object.keys(live)) {
        const pos = live[id];
        const band = practiceMarginBand(pos, marks[pos.coin]);
        if (!band) continue;
        const was = bands[id] || "safe";
        if (rank[band] > rank[was]) {
          alarms.push({
            id: `warn-${out.state.step}-${id}`,
            coin: pos.coin,
            reason: band === "danger" ? "danger" : "warn",
            realised: null,
            fill: null,
            currency: PRACTICE_CURRENCY,
          });
        }
        bands[id] = band;
      }
      for (const id of Object.keys(bands)) {
        if (!live[id]) delete bands[id];
      }
      const shown = told.concat(alarms);
      /* **Raised for what the market did, not for what you pressed.** The
         four events here are the ones a contract has *done to it* — closed at
         its stop, closed at its take-profit, liquidated, or walked into the
         danger band — and they are the whole reason somebody would want a
         real alarm on this screen. A close you pressed yourself is not
         announced: you are already looking at it.

         One banner per event and no more, because the events are already
         de-duplicated above: `told` is one entry per settlement this step,
         and `alarms` fires only when a position *enters* a worse band. */
      for (const e of shown) {
        app.raiseAlarm(
          `futures-${e.id}`,
          e.reason === "liquidation"
            ? msg("alarm_liq", "$1 liquidated", e.coin)
            : e.reason === "stop"
              ? msg("alarm_stop", "$1 stopped out", e.coin)
              : e.reason === "take"
                ? msg("alarm_take", "$1 took profit", e.coin)
                : e.reason === "danger"
                  ? msg("alarm_danger", "$1 is about to be liquidated", e.coin)
                  : e.reason === "fill"
                    ? msg("alarm_fill", "$1 order filled", e.coin)
                    : e.reason === "unfilled"
                      ? msg("alarm_unfilled", "$1 order could not open", e.coin)
                      : msg("alarm_warn", "$1 is close to liquidation", e.coin),
          e.reason === "fill" && e.fill
            ? msg("alarm_fill_at", "Opened at $1.", practicePriceText(e.fill, practiceSymbolFor(e.currency)))
            : e.realised == null
            ? msg("alarm_open_contract", "Your $1 contract, on the chart you left open.", e.coin)
            : msg(
                "alarm_settled",
                "Settled at $1 for $2.",
                practicePriceText(e.fill, practiceSymbolFor(e.currency)),
                `${e.realised >= 0 ? "+" : "−"}${practiceMoneyText(Math.abs(e.realised), practiceSymbolFor(e.currency))}`,
              ),
        );
      }
      app.setState((prev) => ({
        practice: out.state,
        closedPositions: shown.length
          ? [...shown, ...prev.closedPositions].slice(0, 4)
          : prev.closedPositions,
      }));
    },

    settleDueCalls: () => {
      const { calls, period, currency } = app.state;
      if (!calls.open.length) return;
      const coin = app.state.coinOptions[app.state.coinIndex];
      const prices = app.state.valueHistory;
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
      const quiet = app.state.predict !== true;
      const columns = callColumns(
        calls.open.filter(
          (c) => c.coin === coin && c.currency === currency && c.period === period,
        ),
      );
      const firstEver = !(calls.record && calls.record.hits > 0);
      const bang =
        won.length > 0 &&
        (quiet || firstEver || won.some((c) => isLeadingCall(c, columns)));

      app.setState((prev) => ({
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
    },

    /* The chart already guards against reporting the same numbers twice, so
     * this only ever runs on a real change — but it compares again anyway,
     * because a setState loop between a chart and its panel is the kind of
     * bug that only shows up as a warm laptop. */
    handleChartGeometry: (geo) => {
      const cur = app.state.callGeometry;
      if (
        cur &&
        cur.step === geo.step &&
        cur.spanMs === geo.spanMs &&
        cur.reachMs === geo.reachMs
      ) {
        return;
      }
      app.setState({ callGeometry: geo });
    },

    /* ── "What happened here?" ────────────────────────────────────────────
     *
     * Where the marks go, worked out from the series on screen and nothing
     * else. Memoized on the identity of the series, because `render` runs on
     * every price tick and every hover and this walks 300 points — the same
     * reason `scalePrices` is cached on identity rather than through
     * `memoize`, which would stringify the whole series to look up an answer.
     */
    chartMoves: (prices) => {
      if (app.state.moveNews !== true || app.state.compareCoin) return null;
      if (app._movesFor === prices) return app._moves;
      app._movesFor = prices;
      app._moves = findUnusualMoves(prices, {
        sigma: MOVE_NEWS_SIGMA,
        max: MOVE_NEWS_MAX_MARKS,
      });
      return app._moves;
    },

    /* Hovering a mark asks for its window, and does nothing visible.
     *
     * The request is started here rather than on the click so the card is
     * already filled by the time it opens — a mark is a small target and the
     * pointer rests on it before the finger comes down. `fetchNewsAround`
     * caches and de-duplicates, so running the pointer along a row of marks
     * costs one request each and repeats cost none. */
    handleMoveHover: (items) => {
      if (!items || !items.length) return;
      const move = items[0];
      fetchNewsAround(
        move.startTime,
        items[items.length - 1].time,
        app.state.newsGranted,
      );
    },

    /* **How wide a window counts as "around" this move.**
     *
     * The archive is asked day by day and pads a flat ±24h, which is right for
     * a mark on a year chart and absurd for one on an hour chart: a story from
     * yesterday teatime is not what happened during a spike at 09:14. The feed
     * already in memory can be asked precisely, so it is — by the move's own
     * duration, floored at three hours (below that the feed simply has no
     * resolution to offer) and capped at a day (above it, the archive's window
     * is the honest one anyway). */
    moveWindowPad: (spanMs) =>
      Math.min(MOVE_NEWS_LOCAL_MAX_PAD, Math.max(MOVE_NEWS_LOCAL_MIN_PAD, spanMs || 0)),

    /* **The headlines already in hand, before anything is asked for.**
     *
     * The feed is fetched for the panel and the ticker, cached for ten
     * minutes, promo-filtered, and comes from the newsrooms this reader has
     * actually granted — everything the archive is not. For a mark inside the
     * window it covers it is both faster and *better*, so it goes first and
     * the archive tops it up. Measured 10 Sep 2026: on a fresh install the
     * feed holds ten stories across the last twelve hours, where the archive
     * returns nothing at all for any window younger than a few months. */
    localMoveHeadlines: (first, last, coin) => {
      const pad = app.moveWindowPad(last.time - first.startTime);
      /* The live feed *and* everything this browser has been shown before it.
       *
       * The feed holds about a week and the network archive lags three to four
       * weeks (measured — see `api.js`), so a mark in between had nothing but
       * a couple of Hacker News threads. The archive is the same headlines,
       * from the same granted newsrooms, already promo-filtered: it is not a
       * worse source for being an older one. Windowed first and merged second,
       * so the de-duplication runs on a handful of items rather than on four
       * hundred. */
      const { about, other } = newsAboutCoin(
        mergeNewsItems(
          app.state.newsItems,
          newsArchiveAround(first.startTime - pad, last.time + pad),
        ),
        coin,
        first.startTime - pad,
        last.time + pad,
        app.state.newsSources,
      );
      /* About the coin first, the rest behind it — the card labels the two
         groups, and the order here is what it labels. */
      return about.concat(other);
    },

    handleMoveOpen: (items, x, y) => {
      if (!items || !items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const token = `${first.time}-${last.time}`;
      app._moveToken = token;
      const coin =
        app.state.coinOptions[app.state.coinIndex] || app.state.coinOptions[0];
      /* Drawn immediately when the feed can answer: "Looking for headlines…"
         under a card that already has the answer is a spinner for its own
         sake. Still `null` when it cannot, so the card keeps saying it is
         looking until the archive lands. */
      const local = app.localMoveHeadlines(first, last, coin);
      app.setState({
        openMove: { items, x, y, token, coin },
        moveHeadlinesFor: local.length ? local : null,
      });
      fetchNewsAround(first.startTime, last.time, app.state.newsGranted).then((items2) => {
        /* Another mark may have been opened while this was in flight, and a
         * card must never fill with the previous window's headlines. */
        if (app._moveToken !== token) return;
        /* The feed's answers keep their place at the front; the archive adds
         * what it has and `mergeNewsItems` drops anything both of them
         * carried. A failed archive (`null`) must not throw away what the
         * feed already answered with. */
        const merged = mergeNewsItems(local.concat(items2 || []));
        app.setState({ moveHeadlinesFor: merged });
      });
    },

    closeMove: () => {
      app._moveToken = null;
      app.setState({ openMove: null, moveHeadlinesFor: null });
    },

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
    /* **The chart's position widget, opened in place.**
     *
     * It answered "how big is this, and can I take some off" by throwing you
     * into a chart-wide panel. Both are two lines of figures and a row of
     * shares, so it carries them itself now and the panel stays for
     * everything else. */
    /* Opening or shutting the widget always drops whatever was armed: a
       confirmation is a question about a press you just made, and one left
       waiting behind a closed box is a trap. */
    toggleDock: () =>
      app.setState((p) => ({ dockOpen: !p.dockOpen, dockArmed: null })),
    closeDock: () => app.setState({ dockOpen: false, dockArmed: null }),

    /* Bound on mousedown exactly as `handleMoveOutside` is, and for the same
     * reason: a listener registered on the click that opened the widget would
     * see its own opening gesture and close it again. The chart is left alone
     * — no overlay, no capture phase, no `stopPropagation` — so everything it
     * does with a pointer keeps working while the widget is open. */
    handleDockOutside: (e) => {
      const node = app._dockNode;
      if (node && e.target instanceof Node && node.contains(e.target)) return;
      app.closeDock();
    },

    /* **A share of the position, closed from the chart.**
     *
     * Goes through `practiceCloseShare` and then `reducePractice`, which are
     * the close ticket's own two steps — so a quarter taken here and a quarter
     * taken in the panel cannot be two different quantities, which is the rule
     * `practiceCloseSize` exists to enforce. The widget shows the refusal in
     * the only way it has room for: it stops offering the button. */
    /* **What a share actually closes, in the position's own units.**
     *
     * `25%` on its own says nothing — a quarter of what? It is answered twice
     * now: the row is headed with what these buttons do, and arming one names
     * the quantity it is about to take. The figure comes from
     * `practiceCloseShare`, which is the same helper the close ticket uses, so
     * the widget cannot quote a quantity the panel would take differently. */
    /* **Which contract the dock is about.** A coin can carry several, and the
       strip has room for one — so it is the newest on the coin you are
       looking at, and the head says how many there are. Newest rather than
       oldest because it is the one you just opened, which is the one you are
       watching. */
    dockPositionId: () => {
      const s = app.state.practice;
      const coin = app.state.coinOptions[app.state.coinIndex];
      const ids = practiceForCoin(s, coin);
      return ids.length ? ids[ids.length - 1] : null;
    },

    dockShareText: (share) => {
      const s = app.state.practice;
      const coin = app.state.coinOptions[app.state.coinIndex];
      const pos = practiceAt(s, app.dockPositionId());
      if (!pos) return "";
      const qty = practiceCloseShare(pos, share);
      if (!qty) return "";
      return pos.settlement === PRACTICE_SETTLEMENT_COIN
        ? practiceMoneyText(qty, practiceSymbolFor(PRACTICE_CURRENCY))
        : `${practiceQtyText(qty)} ${coin}`;
    },

    /* **Nothing closes on one press.**
     *
     * A share button sits under the pointer on a chart people click for other
     * reasons, and closing part of a contract is not undoable. So the first
     * press *arms* it — the button asks, and the line above says exactly what
     * will go — and only the second press commits. It is the rule the chart's
     * own call boxes already follow (`UNLOCK?`, then release), and the
     * two-click placement beside it.
     *
     * Pressing a **different** share re-arms that one rather than committing
     * the first: an armed share is a question, not an instruction. */
    dockReduce: (share) => {
      if (app.state.dockArmed !== share) {
        app.setState({ dockArmed: share });
        return;
      }
      const s = app.state.practice;
      const id = app.dockPositionId();
      const pos = practiceAt(s, id);
      app.setState({ dockArmed: null });
      if (!pos) return;
      const qty = practiceCloseShare(pos, share);
      if (!qty) return;
      app.reducePractice(id, qty);
    },

    handleMoveOutside: (e) => {
      const card = app._moveCardNode;
      if (card && e.target instanceof Node && card.contains(e.target)) return;
      app.closeMove();
    },

    /* **From the panel's reading to the chart's mark.**
     *
     * The news panel measures the same thing the marks do and neither used to
     * mention the other. This closes the panel and guarantees the marks are
     * drawn — turning the setting on if it was off, because an offer to show
     * something on the chart that leads to a chart without it is worse than no
     * offer. It goes through the setting's own handler, so it is written to
     * storage like any other change rather than left as a state that a reload
     * would forget. */
    showMovesOnChart: () => {
      if (app.state.moveNews !== true) app.handleMoveNewsChange(true);
      app.setState({ showNews: false });
    },

    handleMoveNewsChange: (enabled) => {
      saveMoveNews(enabled);
      // Switching it off closes whatever is open with it — a card describing a
      // mark that is no longer drawn is a card pointing at nothing
      app.setState({ moveNews: enabled, openMove: null, moveHeadlinesFor: null });
    },

    handleTravelBandChange: (v) => {
      saveTravelBand(v);
      app.setState({ travelBand: v });
    },

    handleCallsShowSettledChange: (v) => {
      saveCallsShowSettled(v);
      app.setState({ callsShowSettled: v });
    },

    handleCallsCelebrateChange: (v) => {
      saveCallsCelebrate(v);
      app.setState({ callsCelebrate: v });
    },

    dismissWonCall: (id) => {
      const timer = app.wonCallTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        app.wonCallTimers.delete(id);
      }
      app.setState((prev) => ({
        wonCalls: prev.wonCalls.filter((c) => c.id !== id),
      }));
    },

    /* A win announces itself and then gets out of the way.
     *
     * It had a × and nothing else, so a call that settled while the tab was
     * in the background left a card sitting over the chart until somebody
     * closed it — and on a new tab page that can be days. A hit **target** is
     * different and keeps its ×: it is a thing you asked to be told, and
     * dismissing it is how you acknowledge it. A settled call was not
     * requested at that moment; it is news, and news that has been read should
     * leave on its own.
     *
     * The record itself is untouched either way — the call is in `done` and
     * the tally has it. This closes a card, not an outcome. */
    armWonCallDismiss: (id) => {
      if (app.wonCallTimers.has(id)) return;
      app.wonCallTimers.set(
        id,
        setTimeout(() => {
          app.wonCallTimers.delete(id);
          app.setState((prev) => ({
            wonCalls: prev.wonCalls.filter((c) => c.id !== id),
          }));
        }, WON_CALL_TOAST_MS),
      );
    },

    handleClearSettled: () => {
      app.setState((prev) => {
        const next = { record: prev.calls.record, open: prev.calls.open, done: [] };
        saveCalls(next);
        return { calls: next };
      });
    },

    /* How sure the caller says they are, set on an open call from its row.
     * Null takes it off. It rides the call into `done` unchanged (settling
     * spreads the whole object), which is what the calibration table under
     * the scoreboard is built from. */
    handleCallConfidence: (id, level) => {
      const next = CALL_CONFIDENCE_LEVELS.includes(level) ? level : null;
      app.setState((prev) => {
        const open = prev.calls.open.map((c) =>
          c.id === id ? { ...c, confidence: next } : c,
        );
        const calls = { record: prev.calls.record, done: prev.calls.done, open };
        saveCalls(calls);
        return { calls };
      });
    },

    handleWithdrawCall: (id) => {
      app.setState((prev) => {
        const next = {
          record: prev.calls.record,
          done: prev.calls.done,
          open: prev.calls.open.filter((c) => c.id !== id),
        };
        saveCalls(next);
        return { calls: next };
      });
    },

    handleResetCalls: () => {
      const empty = {
        record: { hits: 0, total: 0, streak: 0, best: 0 },
        open: [],
        done: [],
      };
      saveCalls(empty);
      app.setState({ calls: empty });
    },
});
