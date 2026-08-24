/* PORTFOLIO BEHAVIOUR — cut out of `app.js`
 *
 * Fifteen handlers and one fetch loop, 517 contiguous lines, moved on
 * 22 Aug 2026 out of a 5,707-line class. They were measured first, and the
 * measurement is why this file exists and why it looks like this:
 *
 *   - `chart.js` has 95 members and **three** of them touch no `this`
 *     (62 lines); `app.js` has 146 and **none** do. There is no block of pure
 *     functions to lift out of either — every member is bound to component
 *     state, so "split the file" cannot mean "extract the helpers".
 *   - What *is* separable is a **cohesive run**: everything the portfolio
 *     does sat together at lines 850–1366 and touched almost nothing else.
 *
 * **The pattern is not new here.** `settings-preferences.js` is already a
 * plain function that is handed the component and calls `panel.setState` —
 * this is that idiom applied to handlers instead of to a render. `app` is the
 * `CryptoChart` instance; `this` does not exist in this file, which is
 * deliberate: it is the same trap that made the settings search box silently
 * take no input, and the only defence is that there is no `this` to reach for.
 *
 * The constructor does `Object.assign(this, portfolioHandlers(this))`, so
 * every name below still lands on the component exactly where it was, and
 * every caller — `handleKeyDown`, the render, the `Portfolio` props — is
 * unchanged. Nothing was renamed and nothing reordered; the block moved whole,
 * the same rule the seven file cuts before it followed.
 *
 * Loads before `app.js` in `index.html`. Strictly the order does not matter —
 * the factory is called when a component is constructed, long after every
 * script has run — but a file that is read by another reads better before it.
 */
const portfolioHandlers = (app) => ({
    togglePortfolio: () => {
      app.setState(
        (prevState) => ({ showPortfolio: !prevState.showPortfolio }),
        () => {
          if (app.state.showPortfolio) {
            app.fetchPortfolioPrices();
            // Refresh prices while the view stays open
            if (!app.portfolioInterval) {
              app.portfolioInterval = setInterval(
                () => app.fetchPortfolioPrices(),
                60000,
              );
            }
          } else if (app.portfolioInterval) {
            clearInterval(app.portfolioInterval);
            app.portfolioInterval = null;
          }
        },
      );
    },

    handleAddHolding: (coin, amount) => {
      const normalized = (coin || "").trim().toUpperCase();
      if (!SUGGESTED_COINS.includes(normalized)) return;
      app.setState((prevState) => {
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
      }, app.fetchPortfolioPrices);
    },

    handleUpdateHoldingAmount: (coin, amount) => {
      const amt = isFinite(Number(amount)) ? Math.max(0, Number(amount)) : 0;
      app.setState((prevState) => {
        const portfolio = prevState.portfolio.map((h) =>
          h.coin === coin ? { ...h, amount: amt } : h,
        );
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    },

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
    handleAddSale: (coin, amount, received) => {
      const amt = Number(amount);
      const got = Number(received);
      if (!isFinite(amt) || amt <= 0 || !isFinite(got) || got < 0) return;
      app.setState((prevState) => {
        const holding = prevState.portfolio.find((h) => h.coin === coin);
        if (!holding) return null;
        const sales = holding.sales || [];
        if (sales.length >= MAX_SALES_PER_HOLDING) return null;
        // Can't sell what the hand-entered part doesn't hold
        const sold = Math.min(amt, holding.amount || 0);
        if (!(sold > 0)) return null;
        const lots = holding.lots || [];
        const method = prevState.costMethod;
        const { basis, covered, matched } = consumeLots(lots, sold, method);
        const portfolio = prevState.portfolio.map((h) =>
          h.coin === coin
            ? {
                ...h,
                amount: Math.max(0, h.amount - sold),
                lots: reduceLots(lots, sold, method),
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
                    // Proceeds and the basis it consumed are both in the
                    // currency that was on screen when it was recorded
                    currency: prevState.currency,
                    /* …and which purchases it ate, decided now and never
                     * re-decided. Those lots are gone after this, so a later
                     * change of method cannot honestly rewrite this line. */
                    method,
                  },
                ],
              }
            : h,
        );
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    },

    handleRemoveSale: (coin, index) => {
      app.setState((prevState) => {
        const portfolio = prevState.portfolio.map((h) =>
          h.coin === coin
            ? { ...h, sales: (h.sales || []).filter((_, i) => i !== index) }
            : h,
        );
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    },

    // Log a purchase lot: "bought `amount` for `paid` in total" (dated now —
    // the date only matters for chain-inferred lots and the tax report)
    handleAddLot: (coin, amount, paid) => {
      const amt = Number(amount);
      const cost = Number(paid);
      if (!isFinite(amt) || amt <= 0 || !isFinite(cost) || cost < 0) return;
      app.setState((prevState) => {
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
                // What `paid` is a number of. Without it, switching the
                // display currency re-read every basis in the new one.
                currency: prevState.currency,
              },
            ],
          };
        });
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    },

    handleRemoveLot: (coin, index) => {
      app.setState((prevState) => {
        const portfolio = prevState.portfolio.map((h) =>
          h.coin === coin
            ? { ...h, lots: h.lots.filter((_, i) => i !== index) }
            : h,
        );
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    },

    // Chain lots for a watched address. BTC: replay the real transfer
    // history (plus a synthetic opening lot when the 50-tx page doesn't
    // reach back to the full balance). Other chains expose no cheap history,
    // so the whole balance becomes one lot priced at the watch date.
    buildChainLots: async (coin, address, balance) => {
      const priceAt = await makePortfolioPriceAt(coin, app.state.currency);
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
          return buildLotsFromDeltas(all, priceAt, app.state.currency);
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
          // `priceAt` priced this in the display currency, so that is what
          // `paid` is a number of
          currency: app.state.currency,
        },
      ];
    },

    // Watch an on-chain address: reads its public balance and keeps the
    // holding's amount synced to it. Returns false when the coin/address is
    // unsupported or the provider can't resolve it (caller shows an error).
    /* Watch an address. The address says which chain it is on, so there is
     * nothing to pick: paste it and every positive balance it holds becomes
     * a holding — the native coin plus, on Ethereum, its tokens. Returns
     * false when nothing could be read, so the panel can say so. */
    /* Watch an address, and say **which** way it went wrong when it does.
     *
     * This returned a bare `false` for four situations that have nothing in
     * common, and the panel printed one sentence for all of them: "check it,
     * or it may hold no balance we can read". For the likeliest of the four —
     * a perfectly good address on a chain PriceTab cannot read — that sentence
     * is untrue twice over: there is nothing to check, and the balance is not
     * the problem. The four are now told apart and each says its own thing,
     * the same way `emptyReason()` in `news.js` distinguishes the four ways a
     * headline list can be empty.
     *
     * `"unreachable"` matters as much as the rest: Blockchair answers a burst
     * by blacklisting the whole IP for a while (HTTP 430), and a provider
     * refusing to talk to us is not a fact about the person's address. */
    handleWatchAddress: async (address) => {
      const raw = (address || "").trim();
      if (!raw) return "shape";
      // A `bitcoincash:` prefix matched the chain pattern and was then thrown
      // out by the alphanumeric shape check — copied straight from a wallet
      const addr = normalizeWatchAddress(raw);
      const chain = detectAddressChain(addr);
      if (!chain || !WATCH_ADDRESS_RE.test(addr)) {
        const foreign = detectForeignChain(raw);
        return foreign ? `foreign:${foreign}` : "shape";
      }

      /* One request for Ethereum, not two: the ether goes in the same batch as
       * the tokens (see `fetchErc20Balances`). It used to ask Blockchair for
       * the ether and the node for the tokens — two providers for one address,
       * one of them rate-limited. */
      const [native, tokens] = await (chain === "ETH"
        ? fetchErc20Balances(addr, ["ETH", ...Object.keys(ERC20_TOKENS)]).then(
            (all) => [all.ETH == null ? null : all.ETH, all],
          )
        : Promise.all([fetchAddressBalance(chain, addr), Promise.resolve({})]));

      const found = [];
      if (native != null && native > 0) found.push({ coin: chain, amount: native });
      for (const coin of Object.keys(tokens)) {
        if (coin === chain) continue; // already counted as the native balance
        if (tokens[coin] > 0) found.push({ coin, amount: tokens[coin] });
      }
      /* Nothing read at all is a provider problem; a zero that was actually
       * read is an empty address. Telling someone to check a correct address
       * because a rate limit was hit is the failure this separates. */
      if (!found.length) {
        const readSomething =
          native != null || Object.keys(tokens).length > 0;
        return readSomething ? "empty" : "unreachable";
      }

      /* The native coin's lots come from its transfer history where the
       * chain exposes one; tokens start without lots, so their cost basis
       * is the user's to fill in. */
      const lotsByCoin = {};
      const nativeEntry = found.find((f) => f.coin === chain);
      if (nativeEntry) {
        try {
          lotsByCoin[chain] = await app.buildChainLots(
            chain,
            addr,
            nativeEntry.amount,
          );
        } catch (e) {
          lotsByCoin[chain] = [];
        }
      }

      app.setState((prevState) => {
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
      }, app.fetchPortfolioPrices);
      return "ok";
    },

    // Stop watching one address. What it contributed folds into the manual
    // part, so the totals and P/L stay exactly as they were.
    handleUnwatchAddress: (coin, address) => {
      app.setState((prevState) => {
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
    },

    // JSON restore: replaces current holdings. Runs through the same
    // whitelist validation as storage, so a hand-edited file can't inject
    // junk. Returns false when nothing valid survives (caller shows an error).
    handleImportPortfolio: (list) => {
      const portfolio = sanitizePortfolio(list).slice(0, PORTFOLIO_MAX_HOLDINGS);
      if (!portfolio.length) return false;
      savePortfolioToStorage(portfolio);
      app.setState({ portfolio }, app.fetchPortfolioPrices);
      return true;
    },

    /* Merge a backup into what is already here, rather than replacing it.
     *
     * The rule is deliberately narrow: **a coin you do not already hold is
     * added; a coin you do hold is left exactly as it is.** That makes the
     * operation idempotent — importing the same file twice does nothing the
     * second time — and it makes it impossible to corrupt a position. The
     * obvious alternative, adding the file's lots to a holding you already
     * have, cannot tell a purchase you are restoring from a purchase you
     * already logged, so importing a backup twice would double your cost basis
     * and there is no way to detect it afterwards. Combining one coin's lots is
     * a thing to do by hand, where you can see what you are doing.
     *
     * Returns what happened rather than true/false, so the panel can say it
     * rather than leaving someone to compare two lists.
     */
    handleMergePortfolio: (list) => {
      const incoming = sanitizePortfolio(list);
      if (!incoming.length) return null;
      const held = new Set(app.state.portfolio.map((h) => h.coin));
      const fresh = incoming.filter((h) => !held.has(h.coin));
      const room = Math.max(0, PORTFOLIO_MAX_HOLDINGS - app.state.portfolio.length);
      const added = fresh.slice(0, room);
      const result = {
        added: added.length,
        kept: incoming.length - fresh.length,
        // Named separately from `kept`: one is "you already had this", the
        // other is "there was no room", and they need different sentences
        dropped: fresh.length - added.length,
      };
      if (!added.length) return result;
      const portfolio = [...app.state.portfolio, ...added];
      savePortfolioToStorage(portfolio);
      app.setState({ portfolio }, app.fetchPortfolioPrices);
      return result;
    },

    handleCostMethodChange: (method) => {

      if (!COST_METHODS.some((m) => m.value === method)) return;

      saveCostMethod(method);

      app.setState({ costMethod: method });

    },


    handleRemoveHolding: (coin) => {
      app.setState((prevState) => {
        const portfolio = prevState.portfolio.filter((h) => h.coin !== coin);
        savePortfolioToStorage(portfolio);
        return { portfolio };
      });
    },

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
    fetchPortfolioPrices: async () => {
      if (document.hidden) return;
      if (app._portfolioFetching) {
        app._portfolioPending = true;
        return;
      }
      const generation = ++app._portfolioRun;
      const holdings = app.state.portfolio;
      if (!holdings.length) {
        app.setState({ portfolioPrices: {}, portfolioReady: true });
        return;
      }
      app._portfolioFetching = true;
      const curr = app.state.currency;
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
              lots = await app.buildChainLots(h.coin, w.address, balance);
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
          app.setState((prevState) => {
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
      app._portfolioFetching = false;
      // A newer run has already started: this snapshot is the older answer to
      // a question that has since changed, and publishing it would undo theirs
      if (generation === app._portfolioRun) {
        app.setState({ portfolioPrices: prices, portfolioReady: true });
      }
      if (app._portfolioPending) {
        app._portfolioPending = false;
        app.fetchPortfolioPrices();
      }
    },
});
