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

    handleMoveOpen: (items, x, y) => {
      if (!items || !items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const token = `${first.time}-${last.time}`;
      app._moveToken = token;
      app.setState({
        openMove: { items, x, y, token },
        moveHeadlinesFor: null,
      });
      fetchNewsAround(first.startTime, last.time, app.state.newsGranted).then((items2) => {
        /* Another mark may have been opened while this was in flight, and a
         * card must never fill with the previous window's headlines. */
        if (app._moveToken !== token) return;
        app.setState({ moveHeadlinesFor: items2 || [] });
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
    handleMoveOutside: (e) => {
      const card = app._moveCardNode;
      if (card && e.target instanceof Node && card.contains(e.target)) return;
      app.closeMove();
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
