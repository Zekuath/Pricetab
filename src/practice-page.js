/* THE DERIVATIVES MARKET AS A PAGE — Pro only.
 *
 * 18 Sep 2026, after a column docked down the right of the chart was built and
 * rejected: the page should be laid out like the portfolio, with the widget
 * data that is useful when opening a position. So Pro is laid out the way the
 * portfolio is — and with the portfolio's own components, not a lookalike:
 * `PortfolioShell`, `PortfolioInner`, `PortfolioColumns`, the eyebrow and the
 * total. One design language across the two full-screen views of this app.
 *
 *   - **The head** is the account: the equity in the headline size, what is
 *     free under it, and About at the right.
 *   - **The left column reads**: the market's own chart with this account's
 *     levels drawn across it, then what the derivatives market itself is
 *     doing (funding, open interest, positioning, forced closes — the four
 *     widget feeds that are about exactly this), then the counts that were
 *     already here.
 *   - **The right column does**: the tabs and the ticket, unchanged, on a
 *     `bgSecondary` desk — every control in them was designed for that
 *     ground, and the portfolio puts its own rows on the same grey for the
 *     same reason.
 *
 * It is the only derivatives screen: the simple Basic view was removed the
 * same day, at the user's request, so this page is the whole market.
 *
 * Same pattern as `alerts-futures.js`: a plain function handed the panel, no
 * `this` in the file. Loads after `alerts-futures.js` and before `alerts.js`.
 */

/* The terminal's floor for the chart when a seam is dragged, and one arrow
   press on a seam. */
const PRACTICE_MIN_CHART = 320;
const PRACTICE_MIN_CHART_H = 200;
const PRACTICE_SPLIT_STEP = 16;
/* The share of the chart's window that is blank time past the latest bar
   when it opens — where the plan and the fan are drawn (10 Oct 2026). */
const PRACTICE_VIEW_ROOM = 0.2;
/* The panel's tabs that are drawn into a height rather than listed: the
   book, the account's value and the readings under More. */
const PRACTICE_TALL_TABS = ["book", "depth", "trades", "value", "assistant", "market", "outlook", "crowd", "news"];
/* How many of the guide's items the row over the chart names before "+n",
   at most, and what a chip costs beside its words: its ring, padding,
   border and the gaps either side of them. The words are counted at the
   advance of the type the chip is set in (posType.body, Roboto Mono's
   0.6em) — a constant 7px here cut the row's last chip when the type grew
   to 13px. The room is the row's own, measured (measureBody). */
const PRACTICE_GUIDE_CHIPS = 5;
const PRACTICE_GUIDE_CHIP_PX = 54;
const PRACTICE_GUIDE_ADVANCE = 0.6;
/* Paths per first-touch count on the chart: the row's sentence keeps its
   2,000; a figure printed on a line that is redrawn while the ticket is
   typed can be read off 1,000 to the same percent and cost half. */
const PRACTICE_TOUCH_PATHS = 1000;
/* How long one drawing of the chart may spend replaying first touches before
   the rest wait for a task of their own (ppTouches). One replay is ~30 ms;
   the first of a drawing always runs, so a lone contract and the ticket are
   counted as they are drawn, as before. */
const PRACTICE_TOUCH_SYNC_MS = 24;
/* The guide's card: how long the pointer rests on its chip before it opens,
   and how long it may cross the gap to the card before it closes. */
const PRACTICE_GUIDE_HOVER_MS = 180;
const PRACTICE_GUIDE_LEAVE_MS = 260;

/* ── The crowd reading: a long/short lean that carries its own record ──────
 *
 * 18 Sep 2026: an algorithm that helps with long/short estimates from the
 * widgets' data. This codebase has measured what
 * happens to signals like that — "oversold" did not survive 21,669 daily
 * closes, and 28 of 64 rule × coin pairs beat holding — so the algorithm is
 * built the way `baserates.js` is: it may lean, but only when its own history
 * on this market says the lean has been worth something, and it always prints
 * that history beside the lean.
 *
 *   1. **State.** Today's share of Bybit accounts that are long, ranked
 *      against the previous `CROWD_WINDOW` days of the same market: the top
 *      fifth is *crowded long*, the bottom fifth *crowded short*, the rest
 *      *middle*. Ranked against its own past, never a fixed 60%, because a
 *      market where accounts are always 65% long is not crowded at 65%.
 *   2. **Episodes, not days.** Twenty crowded days in a row are one episode:
 *      counting each day would count the same event twenty times and make a
 *      thin record look thick (`baseRateFor`'s rule).
 *   3. **What followed.** For every past episode of today's state, whether
 *      the close `CROWD_HORIZON` days later was higher — against the same
 *      question asked of every day (the base rate).
 *   4. **The lean** is the side that followed more often, and it exists only
 *      when there were at least `BASE_RATE_MIN_EPISODES` episodes *and* the
 *      share differs from the base rate by `CROWD_LEAN_MARGIN`. Otherwise the
 *      reading says there is no lean, and why.
 *
 * Nothing is fitted and nothing is tuned to the answer: the window, the
 * fifths, the horizon and the margin are fixed here, before any data. */
const CROWD_WINDOW = 60;
const CROWD_HORIZON = 3;
const CROWD_EDGE = 0.2;
const CROWD_LEAN_MARGIN = 0.1;

const practiceVolumeProfile = (series) => {
  if (!Array.isArray(series) || series.length < 10) return null;
  const rows = series.filter((p) => isFinite(p.price) && p.price > 0 && isFinite(p.vol) && p.vol > 0);
  if (rows.length < 10) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of rows) {
    if (p.price < lo) lo = p.price;
    if (p.price > hi) hi = p.price;
  }
  if (!(hi > lo)) return null;
  const bins = 40;
  const step = (hi - lo) / bins;
  const vol = new Array(bins).fill(0);
  let total = 0;
  for (const p of rows) {
    const i = Math.min(bins - 1, Math.floor((p.price - lo) / step));
    vol[i] += p.vol;
    total += p.vol;
  }
  let poc = 0;
  for (let i = 1; i < bins; i += 1) if (vol[i] > vol[poc]) poc = i;
  let a = poc;
  let b = poc;
  let held = vol[poc];
  while (held < total * 0.7 && (a > 0 || b < bins - 1)) {
    const up = b < bins - 1 ? vol[b + 1] : -1;
    const down = a > 0 ? vol[a - 1] : -1;
    if (up >= down) {
      b += 1;
      held += vol[b];
    } else {
      a -= 1;
      held += vol[a];
    }
  }
  const mid = (i) => lo + (i + 0.5) * step;
  /* The bins themselves ride along for the chart's volume-by-price bars
     (chart-trade.js): `vols[i]` is the volume between lo + i·step and the
     step above it. */
  return { poc: mid(poc), vah: lo + (b + 1) * step, val: lo + a * step, share: held / total, bins, total, lo, step, vols: vol };
};

const crowdStateAt = (rows, i) => {
  if (i < CROWD_WINDOW) return null;
  const v = rows[i].long;
  let below = 0;
  for (let k = i - CROWD_WINDOW; k < i; k++) if (rows[k].long < v) below++;
  const rank = below / CROWD_WINDOW;
  return { rank, state: rank >= 1 - CROWD_EDGE ? "long" : rank <= CROWD_EDGE ? "short" : "middle" };
};

const crowdReading = (rows) => {
  if (!Array.isArray(rows) || rows.length <= CROWD_WINDOW + CROWD_HORIZON) return null;
  const last = rows.length - 1;
  const now = crowdStateAt(rows, last);
  if (!now) return null;
  let n = 0;
  let up = 0;
  let baseN = 0;
  let baseUp = 0;
  let prev = null;
  for (let i = CROWD_WINDOW; i + CROWD_HORIZON <= last; i++) {
    const at = crowdStateAt(rows, i);
    const rose = rows[i + CROWD_HORIZON].close > rows[i].close;
    baseN++;
    if (rose) baseUp++;
    /* The first day of a run is the episode; the rest of the run is it. */
    if (at.state === now.state && prev !== now.state) {
      n++;
      if (rose) up++;
    }
    prev = at.state;
  }
  const upRate = n ? up / n : null;
  const baseRate = baseN ? baseUp / baseN : null;
  let lean = null;
  let why = "thin";
  if (n >= BASE_RATE_MIN_EPISODES && upRate != null && baseRate != null) {
    if (Math.abs(upRate - baseRate) >= CROWD_LEAN_MARGIN) {
      lean = upRate > baseRate ? "long" : "short";
      why = "edge";
    } else {
      why = "ordinary";
    }
  }
  return {
    state: now.state,
    rank: now.rank,
    share: rows[last].long,
    n,
    up,
    upRate,
    baseN,
    baseUp,
    baseRate,
    lean,
    why,
    days: rows.length,
  };
};

/* **The market-structure readings: the crowd reading's rule on two more
 * series, and on the pair.**
 *
 * Funding and open interest each ranked against their own last CROWD_WINDOW
 * days (fifths, like the crowd), and the pair — funding's fifth with the way
 * open interest moved over the last day — because funding high with interest
 * still building is not the same market as funding high with interest
 * leaving. Measured on 531 days of Bybit history (22 Sep 2026): 16–41
 * episodes per state per coin, and the outcomes sat near the base rate more
 * often than not — which is exactly what a reading prints and a signal would
 * hide. Every figure carries its n; a lean only past the crowd's floor and
 * margin; and beside the "higher three days later" count there is a second
 * one, a fall past STRUCTURE_FALL by the same day, against ordinary days,
 * since the question the leverage on a market answers is about the fall.
 *
 * Pure: `rows` is `[{ t, value, close, ... }]` oldest first and `isHit(i)`
 * says whether day i is in today's state. An episode is the first day of a
 * run, the crowd reading's rule. */
const STRUCTURE_FALL = 0.03;
const structureRankAt = (rows, i, key) => {
  if (i < CROWD_WINDOW) return null;
  const v = rows[i][key];
  let below = 0;
  for (let k = i - CROWD_WINDOW; k < i; k++) if (rows[k][key] < v) below++;
  return below / CROWD_WINDOW;
};
const structureFifth = (rank) =>
  rank == null ? null : rank >= 1 - CROWD_EDGE ? "high" : rank <= CROWD_EDGE ? "low" : "middle";
const structureReading = (rows, isHit) => {
  if (!Array.isArray(rows) || rows.length <= CROWD_WINDOW + CROWD_HORIZON) return null;
  const last = rows.length - 1;
  let n = 0;
  let up = 0;
  let fell = 0;
  let baseN = 0;
  let baseUp = 0;
  let baseFell = 0;
  let prev = false;
  for (let i = CROWD_WINDOW; i + CROWD_HORIZON <= last; i++) {
    const move = rows[i + CROWD_HORIZON].close / rows[i].close - 1;
    const rose = move > 0;
    const dropped = move <= -STRUCTURE_FALL;
    baseN++;
    if (rose) baseUp++;
    if (dropped) baseFell++;
    const hit = Boolean(isHit(i));
    if (hit && !prev) {
      n++;
      if (rose) up++;
      if (dropped) fell++;
    }
    prev = hit;
  }
  const upRate = n ? up / n : null;
  const baseRate = baseN ? baseUp / baseN : null;
  let lean = null;
  let why = "thin";
  if (n >= BASE_RATE_MIN_EPISODES && upRate != null && baseRate != null) {
    if (Math.abs(upRate - baseRate) >= CROWD_LEAN_MARGIN) {
      lean = upRate > baseRate ? "long" : "short";
      why = "edge";
    } else {
      why = "ordinary";
    }
  }
  return { n, up, upRate, fell, baseN, baseUp, baseRate, baseFell, lean, why, days: rows.length };
};

/* The three readings from the two daily series and the crowd history's
 * closes, aligned by day. Null where a series is missing; each reading
 * carries what today is (`rank`, `state`) beside what followed. */
const structureReadings = (funding, oi, crowd) => {
  if (!Array.isArray(crowd) || !crowd.length) return null;
  const closeAt = new Map(crowd.map((r) => [Math.floor(r.t / 86400000) * 86400000, r.close]));
  const align = (series) =>
    Array.isArray(series)
      ? series
          .map((r) => ({ t: r.t, value: r.value, close: closeAt.get(r.t) }))
          .filter((r) => isFinite(r.value) && r.close > 0)
      : [];
  const f = align(funding);
  const o = align(oi);
  const one = (rows) => {
    if (rows.length <= CROWD_WINDOW + CROWD_HORIZON) return null;
    const rank = structureRankAt(rows, rows.length - 1, "value");
    const state = structureFifth(rank);
    const r = structureReading(rows, (i) => structureFifth(structureRankAt(rows, i, "value")) === state);
    return r ? Object.assign(r, { rank, state, now: rows[rows.length - 1].value }) : null;
  };
  /* The pair: funding's fifth beside open interest's move over the last day,
     on the days both series have. Middle funding is not a state worth a
     count — it is most days. */
  const oiAt = new Map(o.map((r) => [r.t, r.value]));
  const pair = f
    .map((r, i) => {
      const prevT = i > 0 ? f[i - 1].t : null;
      const cur = oiAt.get(r.t);
      const before = prevT != null ? oiAt.get(prevT) : null;
      return cur > 0 && before > 0 ? Object.assign({}, r, { oiMove: cur / before - 1 }) : null;
    })
    .filter(Boolean);
  let joint = null;
  if (pair.length > CROWD_WINDOW + CROWD_HORIZON) {
    const rankNow = structureRankAt(pair, pair.length - 1, "value");
    const fifth = structureFifth(rankNow);
    const oiWay = pair[pair.length - 1].oiMove >= 0 ? "rising" : "falling";
    if (fifth === "high" || fifth === "low") {
      const r = structureReading(
        pair,
        (i) => structureFifth(structureRankAt(pair, i, "value")) === fifth && (pair[i].oiMove >= 0 ? "rising" : "falling") === oiWay,
      );
      joint = r ? Object.assign(r, { funding: fifth, oi: oiWay, oiMove: pair[pair.length - 1].oiMove }) : null;
    } else {
      joint = { funding: "middle", oi: oiWay, oiMove: pair[pair.length - 1].oiMove, n: 0, days: pair.length };
    }
  }
  const oi24 = o.length >= 2 && o[o.length - 2].value > 0 ? o[o.length - 1].value / o[o.length - 2].value - 1 : null;
  return { funding: one(f), oi: one(o), joint, oi24 };
};

/* **A press on nothing closes the page** (26 Sep 2026).
 *
 * It closed only on a press that landed on the shell itself, and the shell is
 * nowhere to be pressed: the page fills it with a head, two columns and their
 * cards, so the gaps a person sees as empty are those wrappers, and a press
 * there did nothing. A press is blank when nothing between it and the shell
 * is *something*: no control, no text of its own, no drawing, and no surface
 * — a card is a box with a ground or a frame, and a press in its padding is a
 * press on the card. A rule under a heading is not a frame, so it takes three
 * sides to make one. And a press on the shell's own scrollbar is a scroll,
 * not a close; it used to be both. */
const practiceBlankPress = (event, shell) => {
  if (!shell || event.button > 0) return false;
  if (event.target === shell && event.clientX >= shell.getBoundingClientRect().left + shell.clientWidth) {
    return false;
  }
  for (let n = event.target; n && n !== shell; n = n.parentElement) {
    if (n.matches("button, a, input, select, textarea, label, svg, canvas, [role], [tabindex], [draggable='true']")) {
      return false;
    }
    const cs = getComputedStyle(n);
    if (!/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor)) return false;
    const framed = ["Top", "Right", "Bottom", "Left"]
      .filter((side) => parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== "none").length;
    if (framed >= 3) return false;
    for (const c of n.childNodes) {
      if (c.nodeType === 3 && c.textContent.trim()) return false;
    }
  }
  return true;
};

const practicePage = (panel) => ({
  // The futures chart's ChartView (renderMarketChart): its keyboard reading
  ppViewRef: createRef(),
  /* **What the derivatives market itself is saying about this coin.**
   *
   * Four widget feeds, the four that are about exactly this screen: what
   * holding a contract costs (funding), how much is open (open interest), how
   * the other side of the market is leaning (long/short accounts) and how
   * much was forced shut (liquidations). Each is cached per coin by the
   * widget layer (`WIDGET_CACHE_TTL`), so opening this page on a coin whose
   * cards are on screen costs nothing, and none of it adds a host: OKX and
   * Bybit are declared providers. Asked for when the page opens and when the
   * coin changes — never on a timer. */
  loadMarketContext: () => {
    const coin = panel.props.activeCoin;
    if (!coin) return;
    /* Which coins have a market at all — once, cached for a day. */
    if (panel.state.perps === undefined) {
      panel.setState({ perps: null });
      Promise.resolve()
        .then(() => fetchPerpCoins())
        .catch(() => null)
        .then((coins) => {
          if (!panel._gone) panel.setState({ perps: Array.isArray(coins) ? coins : false });
        });
    }
    panel.setState({ mkt: { coin, loading: true } });
    const safe = (f) => Promise.resolve().then(() => f(coin)).catch(() => null);
    Promise.all([
      safe(fetchFundingRate),
      safe(fetchOpenInterest),
      safe(fetchLongShortRatio),
      safe(fetchLiquidations),
      safe(fetchCrowdHistory),
      safe(fetchFundingHistory),
      safe(fetchOpenInterestHistory),
      safe(fetchPerpPriorDay),
    ]).then(([funding, oi, ls, liq, history, fundingHistory, oiHistory, priorDay]) => {
      if (panel._gone || panel.props.activeCoin !== coin) return;
      panel.setState({
        mkt: {
          coin,
          loading: false,
          funding,
          oi,
          ls,
          liq,
          crowd: crowdReading(history),
          structure: structureReadings(fundingHistory, oiHistory, history),
          priorDay,
        },
      });
    });
  },

  /* **Is there a market to trade this coin on?** `true` while the listing is
     unknown — not fetched yet, or not readable — because refusing a trade on
     a listing nobody has seen would be the page inventing a rule. */
  practiceHasPerp: (coin) => {
    const perps = panel.state.perps;
    return !Array.isArray(perps) || perps.includes(coin);
  },

  /* **The markets, above the market.** The coins you track, each with its
   * price, its 24h move and a dot where this account holds something — the
   * row a venue's pair selector is, drawn from the ticker snapshot the app
   * already holds, so it costs no request. "All markets" opens every other
   * coin this app supports that has a perpetual; choosing one adds it to your
   * list and switches to it, the "/" jumper's rule. A tracked coin with no
   * perpetual stays in the row, quiet, and says why when you point at it. */
  renderMarketBar: (coin) => {
    const tracked = Array.isArray(panel.props.coinOptions) ? panel.props.coinOptions : [];
    const practice = panel.props.practice;
    const pick = (c) => {
      if (c === coin || typeof panel.props.onPracticeMarket !== "function") return;
      const why = panel.props.onPracticeMarket(c);
      panel.setState({ ppPickWhy: why || null, ppAll: why ? panel.state.ppAll : false });
    };
    const chip = (c) => {
      /* The perpetual's own quote, in USDT — the price this page trades at.
         Until it has arrived the chip is the coin's name alone, never the
         display currency's price standing in for it. */
      const t = perpTickerFor(c);
      const st = t ? { price: t.last, change: t.change24h } : {};
      const held = practice ? practiceForCoin(practice, c).length > 0 : false;
      const perp = panel.practiceHasPerp(c);
      const change = Number(st.change);
      return React.createElement(
        PracticeMarketChip,
        {
          key: c,
          active: c === coin,
          quiet: !perp,
          "aria-pressed": c === coin,
          "data-practice-market": c,
          title: perp
            ? msg("pp_market_pick", "Trade $1", c)
            : msg("pp_market_noperp", "OKX lists no perpetual for $1, so it cannot be traded here", c),
          onClick: () => pick(c),
        },
        React.createElement("strong", null, c, held ? React.createElement(PracticeHeldDot, { "aria-hidden": "true" }) : null),
        st.price > 0
          ? React.createElement("span", null, formatAxisPrice(st.price, st.price / 1000, ""))
          : null,
        isFinite(change) && st.price > 0
          ? React.createElement(
              PracticeReadoutLine,
              { tone: change > 0 ? "up" : change < 0 ? "down" : null },
              `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
            )
          : null,
      );
    };
    const perps = Array.isArray(panel.state.perps) ? panel.state.perps : null;
    const others = perps
      ? SUGGESTED_COINS.filter((c) => perps.includes(c) && !tracked.includes(c))
      : [];
    const why = panel.state.ppPickWhy;
    return React.createElement(
      PracticeMarkets,
      { "data-practice-markets": "true" },
      /* The markets you keep scroll; the way into every other one is pinned
         beside them, because a control that scrolls out of sight is one
         nobody finds. */
      React.createElement(
        PracticeMarketBar,
        null,
        React.createElement(PracticeMarketRow2, null, ...tracked.map(chip)),
        others.length
          ? React.createElement(
              AlertPosChip,
              {
                active: Boolean(panel.state.ppAll),
                "aria-expanded": Boolean(panel.state.ppAll),
                onClick: () => panel.setState((q) => ({ ppAll: !q.ppAll, ppPickWhy: null })),
              },
              msg("pp_market_all", "All markets · $1", String(others.length)),
            )
          : null,
      ),
      panel.state.ppAll && others.length
        ? React.createElement(
            PracticeMarketAll,
            { "data-practice-markets-all": "true" },
            ...others.map((c) =>
              React.createElement(
                AlertPosChip,
                { key: c, title: COIN_NAMES[c] || c, onClick: () => pick(c) },
                c,
              ),
            ),
          )
        : null,
      why
        ? React.createElement(
            AlertPosMeasure,
            { "data-practice-pick-why": why },
            why === "limit"
              ? msg("pp_market_full", "Your coin list is full; remove a coin from it to add another market.")
              : msg("pp_market_cannot", "That market cannot be added to your list."),
          )
        : null,
    );
  },

  /* **P8 — keys for the page.** A trading screen is used with the hands on
   * the keyboard, and these are the handful every venue has: B and S for the
   * side, 1–4 for the size shares, Enter for the order button, X to take the
   * open contract's close ticket up. Listened for by the panel while the page
   * is up — the app's own keys stand down behind an open panel, and B and S
   * (base rates, Settings) are among them, so nothing is taken from anybody.
   * Never while typing, never with a modifier, and Enter never while a
   * button, link or select has the focus: there it already means "press
   * this", and taking it would press two things. Listed under "?". */
  pageKey: (e) => {
    if (panel.props.view !== "futures" || !panel.props.practice) return;
    /* **A key a control has already answered is not a shortcut too.**
       React's handlers run on this same document node first; Enter on the
       chart's keyboard cursor prices a limit, and without this it went on
       to press the order button as well — an order placed by reading a
       bar. */
    if (e.defaultPrevented) return;
    if (panel.props.practiceEnabled === false || !panel.props.practiceConsent) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    const k = e.key;
    if (k === "b" || k === "B" || k === "s" || k === "S") {
      e.preventDefault();
      panel.setState({ pSide: k === "b" || k === "B" ? "long" : "short", pTab: "trade", pTicketWhy: null });
      return;
    }
    if (k >= "1" && k <= "4") {
      e.preventDefault();
      const share = [25, 50, 75, 100][Number(k) - 1];
      panel.setState({ pSize: share, pQty: undefined, pTab: "trade" });
      panel.rememberTicket({ share });
      return;
    }
    if (k === "Enter") {
      /* A focused control's own Enter — a button, a link, a book level —
         is that control's, never the order button's. */
      if (tag === "BUTTON" || tag === "A" || (t && t.getAttribute && (t.getAttribute("role") === "button" || t.hasAttribute("data-owns-arrows")))) return;
      const b = document.querySelector("[data-practice-order-button]");
      if (!b || b.disabled) return;
      e.preventDefault();
      b.click();
      return;
    }
    if (k === "x" || k === "X") {
      const practice = panel.props.practice;
      const ids = practiceList(practice);
      const id = panel.state.pOpen && practice.positions[panel.state.pOpen] ? panel.state.pOpen : ids[0];
      const pos = id ? practiceAt(practice, id) : null;
      if (!pos) return;
      e.preventDefault();
      panel.focusContract(pos, true);
    }
  },

  /* **Every open contract, under the chart — the venue's bottom panel.**
   *
   * The desk's Positions tab holds each contract as a card, and it is a tab:
   * while the ticket is up, what is already running is out of sight. A venue
   * keeps it in a table under the chart for that reason. This is that table,
   * across every market: one row per contract, the figures a row is scanned
   * for, and two ways in — the row opens the contract's own card on the desk
   * (switching the market first if it is another coin), and Close opens its
   * close ticket there. Nothing here closes anything by itself: the close is
   * the desk's, with its quote, as it always was. */
  focusContract: (pos, close) => {
    const coin = panel.props.activeCoin;
    if (pos.coin === coin) {
      /* **Unfolded where it is read.** The contract used to be sent to the
         desk's own list; the desk is the ticket now and the row opens in
         place (`AlertPosReveal` animates it). Pressing the row it is already
         on folds it away again. */
      panel.setState(
        (q) => ({
          ppRow: !close && q.ppRow === pos.id ? null : pos.id,
          pOpen: pos.id,
          pWant: null,
        }),
        () => {
          if (close) panel.openClose(pos, 1);
        },
      );
      return;
    }
    if (typeof panel.props.onPracticeMarket !== "function") return;
    panel.setState({ pWant: { coin: pos.coin, id: pos.id, pos, close: Boolean(close) } });
    const why = panel.props.onPracticeMarket(pos.coin);
    if (why) panel.setState({ pWant: null, ppPickWhy: why });
  },

  /* **P6 — close all**, confirmed like every irreversible press on this
     screen (`pressConfirm`: a fill, a press stops it). Each contract at its own market's price, in one transition; how
     many it closed is said, because a contract paused outside its currency
     is left and the count is how you know. It sits in the head of the panel
     the table is a tab of. */
  renderCloseAll: (n) => {
    if (!n || typeof panel.props.onPracticeCloseAll !== "function") return null;
    return React.createElement(
      AlertPosChip,
      {
        filling: panel.confirming("closeAll"),
        "aria-busy": panel.confirming("closeAll") ? "true" : "false",
        "data-practice-close-all": panel.confirming("closeAll") ? "filling" : "idle",
        onClick: () =>
          panel.confirmPress("closeAll", () => {
            if (panel.props.onPracticeCloseAll) panel.props.onPracticeCloseAll();
            if (!panel._gone) panel.setState({ pOpen: null });
          }),
      },
      ...panel.confirmContent(
        "closeAll",
        msg("pp_close_all", "Close all"),
        msg("pp_close_all_running", "Closing $1 — press to stop", String(n)),
      ),
    );
  },

  renderPositionsTable: (marks) => {
    const practice = panel.props.practice;
    const ids = practice ? practiceList(practice) : [];
    if (!ids.length) return null;
    const head = [
      msg("pp_pt_contract", "Contract"),
      msg("pp_pt_size", "Size"),
      msg("pp_pt_entry", "Entry"),
      msg("pp_pt_mark", "Mark"),
      msg("pp_pt_liq", "Liq."),
      /* The margin is back now the market has the wider column — the one
         figure a venue's table always carries and the ROE is measured
         against. A stop or take is marked beside the contract's name, with
         its price one press away on the card. */
      msg("pp_pt_margin", "Margin"),
      msg("pp_pt_pnl", "P/L (ROE)"),
      "",
    ];
    return React.createElement(
      PracticePositions,
      { "data-practice-positions": String(ids.length) },
      React.createElement(
        PracticePosTable,
        { role: "table" },
        React.createElement(
          PracticePosRow,
          { head: true, role: "row" },
          ...head.map((t, i) => React.createElement("span", { key: i, role: "columnheader" }, t)),
        ),
        ...ids.map((id) => {
          /* The row, and under it the contract itself when it is the one
             being read. */
          const p = practice.positions[id];
          /* Bare, like the prices: the table's head names the unit once
             ("Open positions · 2 · USDT"), and a unit on every cell was what
             ran the margin into the result. A contract from before the
             switch keeps its own sign — it is not in USDT. */
          const sym = panel.posPriceSign(p.currency);
          const inverse = p.settlement === PRACTICE_SETTLEMENT_COIN;
          const amount = (v) => (inverse ? practiceCoinText(v, p.coin) : practiceMoneyText(v, sym));
          const mark = marks && marks[p.coin];
          const liq = practiceLiquidationPrice(p);
          /* **A contract walking towards its end says so on the row it is
             read from.** The card carries a band with the level and the
             distance; the table is what is on screen by default, so the row
             carries the same two facts — the same words, from the same
             model call, so they cannot disagree about where the line is. */
          /* `practiceMarginBand` answers "safe" as well — which is every
             healthy contract, and a warning on all of them is a warning on
             none. Only the two bands that mean something. */
          const raw = mark > 0 ? practiceMarginBand(p, mark) : null;
          const band = raw === "warn" || raw === "danger" ? raw : null;
          const away = liq && mark > 0 ? (Math.abs(liq - mark) / mark) * 100 : null;
          const pnl = mark > 0 ? practiceUnrealised(p, mark) : null;
          const roe = pnl != null && p.margin > 0 ? (pnl / p.margin) * 100 : null;
          const tone = pnl > 0 ? "up" : pnl < 0 ? "down" : null;
          const openHere = panel.state.ppRow === id;
          return React.createElement(
            Fragment,
            { key: id },
            React.createElement(
            PracticePosRow,
            {
              role: "row",
              "data-practice-position": id,
              side: p.side,
              band,
            },
            React.createElement(
              PracticePosOpen,
              {
                role: "cell",
                "aria-expanded": openHere ? "true" : "false",
                "aria-label": msg("pp_pt_open_aria", "Open contract #$1 on $2", id, p.coin),
                onClick: () => panel.focusContract(p, false),
              },
              React.createElement("strong", null, `${p.coin} ${p.side === "short" ? msg("pos_short", "Short") : msg("pos_long", "Long")} ${p.leverage}x`),
              React.createElement(
                "span",
                null,
                [`#${id}`, p.take ? "TP" : null, p.stop || p.trail ? "SL" : null].filter(Boolean).join(" · "),
              ),
              band
                ? React.createElement(
                    PracticeRowAlarm,
                    { danger: band === "danger", "data-practice-row-alarm": band },
                    band === "danger"
                      ? msg("pos_alarm_danger", "About to be liquidated")
                      : msg("pos_alarm_warn", "Close to liquidation"),
                  )
                : null,
            ),
            /* The coin is in the contract's name, so the size is the number. */
            React.createElement("span", { role: "cell" }, inverse ? practiceMoneyText(p.qty, sym) : practiceQtyText(p.qty)),
            React.createElement("span", { role: "cell" }, practicePriceText(p.entry, sym)),
            React.createElement("span", { role: "cell" }, mark > 0 ? practicePriceText(mark, sym) : "—"),
            React.createElement(
              "span",
              { role: "cell" },
              liq
                ? band && away != null
                  /* "Close" on its own is a mood; the distance is the fact. */
                  ? msg("pos_alarm_at_away", "at $1 · $2% away", practicePriceText(liq, sym), away.toFixed(1))
                  : practicePriceText(liq, sym)
                : msg("pos_liq_none", "none at 1x"),
            ),
            React.createElement("span", { role: "cell" }, amount(p.margin)),
            React.createElement(
              PracticeReadoutLine,
              { role: "cell", tone },
              pnl == null
                ? "—"
                : `${pnl >= 0 ? "+" : "−"}${amount(Math.abs(pnl))} (${signedFixed(roe, 1)}%)`,
            ),
            React.createElement(
              AlertPosChip,
              {
                role: "cell",
                "aria-label": msg("pp_pt_close_aria", "Close contract #$1 on $2", id, p.coin),
                onClick: () => panel.focusContract(p, true),
              },
              msg("pp_pt_close", "Close"),
            ),
            ),
            /* Drawn whether or not it is open so the reveal has something to
               animate; `AlertPosReveal` takes it out of the tab order and
               the accessibility tree while it is shut. */
            React.createElement(
              AlertPosReveal,
              {
                open: openHere,
                wide: true,
                "data-practice-row-detail": openHere ? id : undefined,
              },
              panel.renderPositionRow(p, mark, PRACTICE_CURRENCY, 0, openHere, true),
            ),
          );
        }),
      ),
    );
  },

  /* **The readings, three tabs deep instead of three cards long.**
   *
   * Nothing should be left far down the page, and no information
   * may be lost. The venue's figures, the crowd reading and
   * the headlines were three cards stacked under the positions table, which
   * put the last of them ~1,100px below the fold on a 900px window. They are
   * the same three blocks, unchanged, behind one row of tabs: nothing is
   * summarised away and nothing is two presses from view.
   *
   * The tab that is on screen is remembered for the session only — which one
   * you were reading is a fact about this look at the page, not a setting. */
  /* **The account's value after every recorded event** (26 Sep 2026).
   * The series is the model's
   * (`practiceValueSeries`): cash plus committed margin after each event, and
   * the equity now as its last point. Four figures read it first — where the
   * kept record starts, where the account is now, the difference, and the
   * deepest fall from a high, which is the one thing a line shows and a
   * total hides. The x axis is the order of events and the note says so:
   * the record carries no clock, and dates it does not have are not drawn. */
  renderAccountValue: (marks) => {
    const practice = panel.props.practice;
    const series = practiceValueSeries(practice, marks);
    if (!series) return null;
    const unit = practiceSymbolFor(PRACTICE_CURRENCY);
    const money = (v) => practiceMoneyText(v, unit);
    if (series.length <= 2) {
      return React.createElement(
        PracticeValueNote,
        { "data-practice-readings": "value" },
        msg("pp_value_empty", "Nothing has moved this account's money yet. The line starts with the first contract, fee or deposit."),
      );
    }
    const vals = series.map((p) => p.v);
    const first = vals[0];
    const now = vals[vals.length - 1];
    /* **Made, with the deposits taken out.** The line steps up when money is
       put in, and a change that counted that step printed +2,974.68 beside a
       head saying +474.68 since the start — the same account, two answers.
       This is the head's figure, over the same base: what the account has
       been given in all. */
    const deposited = series.reduce((t, p) => t + (p.deposit || 0), 0);
    const change = now - first - deposited;
    const base = first + deposited;
    let peak = vals[0];
    let fall = 0;
    for (const v of vals) {
      peak = Math.max(peak, v);
      fall = Math.max(fall, peak - v);
    }
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    const span = hi - lo || 1;
    const W = 100;
    const H = 40;
    const x = (i) => (i / (vals.length - 1)) * W;
    const y = (v) => H - ((v - lo) / span) * H;
    const path = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
    const figure = (label, value, tone) =>
      React.createElement(
        PracticeValueFigure,
        { key: label, tone: tone },
        React.createElement("strong", null, value),
        React.createElement("span", null, label),
      );
    const signed = (v) => `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`;
    const pct = base > 0 ? `${signedFixed((change / base) * 100, 2)}%` : "";
    return React.createElement(
      "div",
      { "data-practice-readings": "value", "data-practice-value-points": String(vals.length) },
      React.createElement(
        PracticeValueFigures,
        null,
        figure(
          series[0].kind === "folded"
            ? msg("pp_value_first_kept", "Earliest kept")
            : msg("pp_value_start", "Start"),
          money(first),
          null,
        ),
        figure(msg("pp_value_now", "Now"), money(now), null),
        figure(
          pct ? msg("pp_value_made_pct", "Made, deposits aside · $1", pct) : msg("pp_value_made", "Made, deposits aside"),
          signed(change),
          change > 0 ? "up" : change < 0 ? "down" : null,
        ),
        figure(msg("pp_value_fall", "Deepest fall from a high"), fall > 0 ? `−${money(fall)}` : money(0), fall > 0 ? "down" : null),
      ),
      React.createElement(
        PracticeValueChart,
        null,
        React.createElement(
          "svg",
          { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" },
          React.createElement("line", {
            className: "pv-start",
            x1: 0,
            x2: W,
            y1: y(first).toFixed(2),
            y2: y(first).toFixed(2),
          }),
          /* Money put in or taken out by hand, marked where it happened: a
             step in the line that nobody traded for should say so. */
          ...series.map((p, i) =>
            p.deposit
              ? React.createElement("line", {
                  key: `d${i}`,
                  className: "pv-deposit",
                  x1: x(i).toFixed(2),
                  x2: x(i).toFixed(2),
                  y1: H,
                  y2: H - 4,
                })
              : null,
          ),
          React.createElement("path", { className: "pv-line", d: path }),
        ),
      ),
      React.createElement(
        PracticeValueNote,
        null,
        msg(
          "pp_value_note",
          "$1 recorded events, oldest on the left; the dashed line is where the line starts and a tick at the foot is money you put in or took out. Value is cash plus the margin committed — it moves when money does, not when a price does — and the last point is now, with open contracts marked. The record keeps no clock, so there are no dates.",
          String(vals.length - 2),
        ),
      ),
    );
  },

  /* **The record as a file** (26 Sep 2026): every event the ledger holds, as
   * `practiceLedgerCsv` writes it. Beside the two tabs that are drawn from it.
   * */
  renderLedgerExport: () => {
    const practice = panel.props.practice;
    const rows = practice && Array.isArray(practice.ledger) ? practice.ledger.length : 0;
    return React.createElement(
      AlertPosChip,
      {
        "data-practice-export": "csv",
        disabled: !rows,
        title: msg("pp_export_hint", "Download every recorded event as a CSV file"),
        onClick: () => {
          if (!rows) return;
          downloadTextFile(
            `pricetab-derivatives-${new Date().toISOString().slice(0, 10)}.csv`,
            practiceLedgerCsv(practice),
            "text/csv",
          );
        },
      },
      msg("pp_export_csv", "Export CSV"),
    );
  },

  // The page is the two-pane terminal (layout D) from PORTFOLIO_WIDE up
  ppWide: () => typeof matchMedia === "function" && matchMedia(`(min-width: ${PORTFOLIO_WIDE}px)`).matches,

  // The terminal's grid (PRACTICE_PAGE_LAYOUT_KEY): the wide page, chosen
  ppTerminal: () => panel.ppWide() && panel.state.ppPageLayout === "terminal",

  /* Which of the panel's tabs is up: the one chosen, else what is held,
     else what was closed — the panel at its shortest, so the chart has the
     page (10 Oct 2026; it opened on the market's readings, a third of the
     height, under a chart with nothing on it). A tab pinned as its own panel
     is never the panel's. */
  ppReadTab: () => {
    const practice = panel.props.practice;
    const held = practice ? practiceList(practice).length : 0;
    const pinned = panel.ppPinnedHere();
    const chosen = panel.state.ppRead;
    if (["crowd", "news", "market", "closed", "value", "outlook", "assistant", "book", "depth", "trades", "positions"].includes(chosen) && !pinned.includes(chosen) && (chosen !== "positions" || held)) {
      return chosen;
    }
    const fallback = [held ? "positions" : null, "closed", "value", "assistant", "market", "outlook", "crowd", "news"].find((v) => v && !pinned.includes(v));
    return fallback || "closed";
  },

  /* **The page's areas, and where each stands** (10 Oct 2026). The areas
     drawn now, in the order the grip's arrows walk them; the tabs pinned as
     their own panel (the wide page only — under 1280px everything is the one
     column, and a book tab only where the book has no cell); and the place
     each area stands in: its own unless swapped, the stored swaps read only
     where they still make sense of the areas drawn. */
  ppPinnedHere: () => {
    if (!panel.ppWide()) return [];
    const p = panel.state.ppPinned || [];
    return panel.ppTerminal() ? p.filter((v) => !["book", "depth", "trades"].includes(v)) : p;
  },
  ppAreasHere: () => {
    if (!panel.ppWide()) return [];
    const out = ["desk", "chart"];
    if (panel.ppPinnedHere().length) out.push("pin");
    if (panel.ppTerminal()) out.push("book");
    out.push("bottom");
    return out;
  },
  ppPlaceMap: () => {
    const here = panel.ppAreasHere();
    const stored = panel.state.ppAreas;
    const out = {};
    for (const a of here) out[a] = stored && here.includes(stored[a]) ? stored[a] : a;
    if (new Set(here.map((a) => out[a])).size !== here.length) for (const a of here) out[a] = a;
    return out;
  },
  // Two areas trade places; the areas not drawn now keep their own
  ppSwapAreas: (x, y) => {
    if (!x || !y || x === y) return;
    const here = panel.ppPlaceMap();
    if (!here[x] || !here[y]) return;
    const full = {};
    for (const a of PRACTICE_AREAS) full[a] = here[a] || a;
    const t = full[x];
    full[x] = full[y];
    full[y] = t;
    savePracticeAreas(full);
    panel.setState({ ppAreas: sanitizePracticeAreas(full) });
  },
  // A press on an area's grip, then a drop on another area: they trade places
  ppSwapStart: (area) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const move = (ev) => {
      const n = document.elementFromPoint(ev.clientX, ev.clientY);
      const cell = n && n.closest ? n.closest("[data-practice-cell]") : null;
      const over = cell ? cell.getAttribute("data-practice-cell") : null;
      if (over !== panel.state.ppSwapOver) panel.setState({ ppSwapOver: over });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const over = panel.state.ppSwapOver;
      panel._ppSwap = null;
      panel.setState({ ppSwapFrom: null, ppSwapOver: null });
      if (over && over !== area && panel.ppAreasHere().includes(over)) panel.ppSwapAreas(area, over);
    };
    panel._ppSwap = { move, up };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    panel.setState({ ppSwapFrom: area, ppSwapOver: area });
  },
  // From the keyboard: an arrow trades places with the next area that way
  ppSwapKey: (area) => (e) => {
    const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    const here = panel.ppAreasHere();
    const map = panel.ppPlaceMap();
    // The order the places read in, left to right, top to bottom
    const order = here.slice().sort((p, q) => here.indexOf(map[p]) - here.indexOf(map[q]));
    const at = order.indexOf(area);
    const other = order[at + step];
    if (other) panel.ppSwapAreas(area, other);
  },
  ppPin: (tab) => {
    if (!PRACTICE_PIN_TABS.includes(tab)) return;
    const next = (panel.state.ppPinned || []).filter((v) => v !== tab).concat([tab]);
    savePracticePinned(next);
    panel.setState({ ppPinned: next, ppPinRead: tab });
  },
  ppUnpin: (tab) => {
    const next = (panel.state.ppPinned || []).filter((v) => v !== tab);
    savePracticePinned(next);
    panel.setState({ ppPinned: next, ppRead: tab, ppMore: true, ppMax: next.length ? panel.state.ppMax : panel.state.ppMax === "pin" ? null : panel.state.ppMax });
  },
  ppMaxToggle: (area) => panel.setState((p) => ({ ppMax: p.ppMax === area ? null : area })),

  /* An area's own tools, at the right of its head: enlarge (Esc or the same
     press puts it back) and the grip that swaps it with another. The ticket
     has the grip only — enlarged, a form is a wide form. */
  renderAreaTools: (area, extra) => {
    if (!panel.ppWide()) return extra || null;
    const maxed = panel.state.ppMax === area;
    return React.createElement(
      PracticeAreaTools,
      { "data-practice-area-tools": area },
      extra || null,
      area === "desk"
        ? null
        : React.createElement(
            PracticeToolBtn,
            {
              "aria-label": maxed ? msg("pp_restore", "Restore") : msg("pp_enlarge", "Enlarge"),
              "aria-pressed": maxed ? "true" : "false",
              title: maxed ? msg("pp_restore_title", "Back to its place (Esc)") : msg("pp_enlarge_title", "Enlarge to the whole page — Esc puts it back"),
              "data-practice-max": area,
              on: maxed,
              onClick: () => panel.ppMaxToggle(area),
            },
            icon(maxed ? "collapse" : "expand", 0.85),
          ),
      maxed
        ? null
        : React.createElement(
            PracticeToolBtn,
            {
              grip: true,
              "aria-label": msg("pp_grip", "Move this area"),
              title: msg("pp_grip_title", "Drag onto another area to swap places — or the arrow keys"),
              "data-practice-grip": area,
              onPointerDown: panel.ppSwapStart(area),
              onKeyDown: panel.ppSwapKey(area),
            },
            icon("grip", 0.85),
          ),
    );
  },

  /* Every tab's name and count, for the panel and the pinned panel alike. */
  ppTabLabels: (coin, marks) => {
    const practice = panel.props.practice;
    const held = practice ? practiceList(practice).length : 0;
    const closed = panel.ppClosedRows();
    return {
      positions: [msg("pp_read_positions", "Positions"), held],
      /* **What was closed, beside what is open** — asked for on 19 Sep 2026:
         the record belongs with the contracts, not on the ticket's desk. */
      closed: [msg("pos_tab_closed", "Closed"), closed.length],
      /* The book's three views are three tabs (10 Oct 2026): as one tab with
         its own row of three under the More row, the panel stacked three
         rows of tabs and left the ladder four levels a side. */
      book: [msg("pp_book_tab", "Book")],
      depth: [msg("pp_depth_tab", "Depth")],
      trades: [msg("pp_trades_tab", "Trades")],
      /* **What the account is worth, event by event** — beside the record
         it is drawn from (26 Sep 2026). */
      value: [msg("pp_read_value", "Account value")],
      /* **The assistant** — a desk's checks as facts, with a badge that
         counts what is missing and what has a clock on it. */
      assistant: [msg("pp_read_assistant", "Assistant"), panel.assistantBadge(coin, marks)],
      market: [msg("pp_read_market", "Market")],
      /* **Before a contract**: what this window says about the next
         stretch, counted — the cone, the regime, the location chain, and
         what followed the last times the market was here. */
      outlook: [msg("pp_read_outlook", "Outlook")],
      crowd: [msg("pp_read_crowd", "Crowd")],
      news: [msg("pp_read_news", "Headlines")],
    };
  },

  /* Every contract this account has closed — the trade history's copy, so
     what the ledger let go of after its last two hundred rows is still here
     (`practiceHistoryOf`); the ledger alone where the history cannot be read. */
  ppClosedRows: () => {
    const practice = panel.props.practice;
    if (!practice) return [];
    const h = typeof loadPracticeHistory === "function" ? loadPracticeHistory() : null;
    if (h && typeof practiceHistoryOf === "function") return practiceHistoryOf(h, practice);
    return (practice.ledger || []).filter(
      (e) => e.kind === "close" || e.kind === "stop" || e.kind === "take" || e.kind === "liquidation",
    );
  },

  /* **This account, or the ones before it.** A fresh account starts a fresh
     record, and the accounts before it stay readable here until they are
     deleted: one switch, drawn only when there is an earlier account. Their
     rows are renumbered for the list — two accounts both have a contract 1. */
  renderClosedTab: () => {
    const practice = panel.props.practice;
    if (!practice) return null;
    const h = typeof loadPracticeHistory === "function" ? loadPracticeHistory() : null;
    const earlier = h && typeof practiceHistoryEarlier === "function" ? practiceHistoryEarlier(h, practice) : [];
    const rows = [];
    for (const a of earlier) for (const r of a.rows) rows.push({ ...r, id: a.acct * 1e6 + r.id });
    const past = Boolean(panel.state.pRecPast) && rows.length > 0;
    const chip = (on, label, value) =>
      React.createElement(
        AlertPosChip,
        { key: String(value), active: on, "aria-pressed": on ? "true" : "false", onClick: () => panel.setState({ pRecPast: value, pRecShow: 20 }) },
        label,
      );
    return React.createElement(
      Fragment,
      null,
      rows.length
        ? React.createElement(
            AlertPosChips,
            { "data-practice-record-accounts": past ? "earlier" : "this" },
            chip(!past, msg("pos_record_this_account", "This account"), false),
            chip(past, msg("pos_record_earlier", "Earlier accounts · $1 contracts", String(rows.length)), true),
          )
        : null,
      panel.renderPracticeRecord(practice, past ? rows : panel.ppClosedRows(), { past }),
    );
  },

  /* What a tab shows, wherever the tab is — under the chart or pinned. */
  ppTabBody: (tab, coin, marks) =>
    tab === "positions"
      ? panel.renderPositionsTable(marks)
      : tab === "book" || tab === "depth" || tab === "trades"
      ? React.createElement(PracticeColBook, { "data-practice-book-tab": "true" }, panel.renderBookColumn(coin, tab))
      : tab === "closed"
      ? panel.renderClosedTab()
      : tab === "value"
      ? panel.renderAccountValue(marks)
      : tab === "market"
      ? React.createElement(
          PracticeMarketRow,
          { "data-practice-readings": "market" },
          React.createElement("div", null, panel.renderMarketContext(coin)),
          React.createElement(PracticeReadings, null, panel.renderMarketReadings(coin, marks)),
        )
      : tab === "outlook"
      ? React.createElement(PracticeReadings, { "data-practice-readings": "outlook" }, panel.renderOutlook(coin))
      : tab === "assistant"
      ? React.createElement(PracticeReadings, { "data-practice-readings": "assistant" }, panel.renderAssistant(coin, marks))
      : tab === "crowd"
      ? React.createElement(Fragment, null, panel.renderCrowdReading(coin, true), panel.renderStructureReading(coin, true))
      : React.createElement(PracticeReadings, { "data-practice-readings": "news" }, panel.renderMarketReadings(coin, marks, "news")),

  // One tab of a folder row
  ppFolderTab: (v, label, count, active, onClick, extra) =>
    React.createElement(
      PracticeFolderTab,
      Object.assign({ key: v, role: "tab", active, "aria-selected": active, onClick }, extra || {}),
      label,
      count ? React.createElement("span", null, String(count)) : null,
    ),

  // A tab's own data, asked for when it is opened
  ppTabOpened: (v) => {
    if (v === "depth") panel.loadBook();
    if (v === "trades") panel.loadTrades();
  },

  renderReadingTabs: (coin, marks) => {
    const practice = panel.props.practice;
    const held = practice ? practiceList(practice).length : 0;
    const tab = panel.ppReadTab();
    const pinned = panel.ppPinnedHere();
    const labels = panel.ppTabLabels(coin, marks);
    /* **Two tabs and More** (9 Oct 2026, the owner chose layout D of four:
       *"simple two pane"*). What is held and what was closed are always
       there; the book and the readings are one press further, under More —
       open while one of them is the tab. A pinned tab is in its own panel,
       so not here. */
    const MORE = ["book", "depth", "trades", "value", "assistant", "market", "outlook", "crowd", "news"];
    const moreOpen = Boolean(panel.state.ppMore) || MORE.includes(tab);
    const main = [...(held ? ["positions"] : []), "closed"].filter((v) => !pinned.includes(v));
    /* In the terminal the book has its cell beside the chart, with its own
       three views; under More they would be the same ladder twice. */
    const moreHere = MORE.filter((v) => !pinned.includes(v) && !(panel.ppTerminal() && ["book", "depth", "trades"].includes(v)));
    const tabs = moreOpen ? [...main, ...moreHere] : main;
    const pinBtn = panel.ppWide() && PRACTICE_PIN_TABS.includes(tab)
      ? React.createElement(
          PracticeToolBtn,
          {
            "aria-label": msg("pp_pin_tab", "Pin this tab as its own panel"),
            title: msg("pp_pin_tab_title", "Pin this tab as its own panel beside the chart"),
            "data-practice-pin": tab,
            onClick: () => panel.ppPin(tab),
          },
          icon("pin", 0.85),
        )
      : null;
    return React.createElement(
      PracticePanel,
      { "data-practice-readings-card": tab },
      React.createElement(
        PracticeFolderTabs,
        { role: "tablist" },
        ...tabs.map((v) =>
          panel.ppFolderTab(v, labels[v][0], labels[v][1], tab === v, () => {
            panel.setState({ ppRead: v, ppBookTab: v === "depth" || v === "trades" ? v : panel.state.ppBookTab }, () => {
              // The depth curve reads the deep book: asked at once, not on the timer's next tick
              if (v === "depth") panel.loadBook();
            });
            if (v === "trades") panel.loadTrades();
          }, { "data-practice-read-tab": v }),
        ),
        React.createElement(
          PracticeFolderTab,
          {
            key: "more",
            role: "tab",
            active: false,
            "aria-selected": false,
            "aria-expanded": moreOpen ? "true" : "false",
            "data-practice-read-more": moreOpen ? "open" : "shut",
            onClick: () =>
              moreOpen
                ? panel.setState({ ppMore: false, ppRead: MORE.includes(tab) ? (held ? "positions" : "closed") : tab })
                : panel.setState({ ppMore: true }),
          },
          moreOpen ? msg("pp_read_less", "Less") : msg("pp_read_more", "More"),
        ),
        React.createElement(
          "div",
          { "data-practice-folder-end": "true" },
          tab === "positions" ? panel.renderCloseAll(held) : tab === "closed" || tab === "value" ? panel.renderLedgerExport() : null,
          panel.renderAreaTools("bottom", pinBtn),
        ),
      ),
      panel.ppTabBody(tab, coin, marks),
    );
  },

  /* **The pinned panel** (10 Oct 2026): the tabs pinned out of the panel
     under the chart, in a column of their own beside it — one tab or a row
     of them, each with the pin that puts it back. */
  renderPinnedPanel: (coin, marks, pinned) => {
    const labels = panel.ppTabLabels(coin, marks);
    const tab = pinned.includes(panel.state.ppPinRead) ? panel.state.ppPinRead : pinned[0];
    const unpin = React.createElement(
      PracticeToolBtn,
      {
        on: true,
        "aria-label": msg("pp_unpin_tab", "Put this tab back under the chart"),
        title: msg("pp_unpin_tab", "Put this tab back under the chart"),
        "data-practice-unpin": tab,
        onClick: () => panel.ppUnpin(tab),
      },
      icon("pin", 0.85),
    );
    return React.createElement(
      PracticePanel,
      { "data-practice-pinned-card": tab },
      React.createElement(
        PracticeFolderTabs,
        { role: "tablist" },
        ...pinned.map((v) =>
          panel.ppFolderTab(v, labels[v][0], labels[v][1], tab === v, () => {
            panel.setState({ ppPinRead: v, ppBookTab: v === "depth" || v === "trades" ? v : panel.state.ppBookTab }, () => panel.ppTabOpened(v));
          }, { "data-practice-pinned-tab": v }),
        ),
        React.createElement("div", { "data-practice-folder-end": "true" }, panel.renderAreaTools("pin", unpin)),
      ),
      panel.ppTabBody(tab, coin, marks),
    );
  },

  /* **P4 — a level dropped somewhere new on the chart.** A stop or a take
   * goes through `onPracticeTriggers`, the call the card's editor makes, with
   * the contract's other levels and its share passed back as they are; a
   * resting order through `onPracticeMoveOrder`, one model transition. A
   * stop or take dropped where it would fire at once — a long's stop at or
   * above the price, its take at or below — is refused *here*, with the
   * reason, because the model only knows the entry side and a trigger that
   * closes the contract on the next tick is not what anybody dragging meant.
   * Hyperliquid documents the same refusal. */
  commitLevelDrag: (level, priceE4, nowE4) => {
    let why = null;
    if (level.order) {
      why = panel.props.onPracticeMoveOrder
        ? panel.props.onPracticeMoveOrder(level.order, priceE4)
        : "none";
    } else if (level.pos) {
      const p = level.pos;
      const long = p.side !== "short";
      const fires = nowE4 > 0 && (level.kind === "stop"
        ? (long ? priceE4 >= nowE4 : priceE4 <= nowE4)
        : (long ? priceE4 <= nowE4 : priceE4 >= nowE4));
      if (fires) why = "fires";
      else if (panel.props.onPracticeExitPlan) {
        /* **One line moves; the rest of the plan stays** (12 Oct 2026). The
           one-target door rewrote the whole plan as a single take, so a drag
           of the stop or of TP1 dropped TP2 and TP3. The exit plan takes only
           what is named: the stop alone, or the ladder with one price moved
           (nearest first again, the model refusing a wrong side). */
        if (level.kind === "stop") {
          why = panel.props.onPracticeExitPlan(p.id, { stop: priceE4 });
        } else {
          const long = p.side !== "short";
          const legs = practiceTakeLegs(p);
          const at = legs.length ? Math.max(0, Math.min(legs.length - 1, level.leg || 0)) : -1;
          const takes = (at < 0 ? [{ price: priceE4, share: 1000000 }] : legs.map((leg, i) => ({ price: i === at ? priceE4 : leg.price, share: leg.share })))
            .sort((a, b) => (long ? a.price - b.price : b.price - a.price));
          why = panel.props.onPracticeExitPlan(p.id, { takes, breakEven: p.takeBreakEven === true });
        }
      } else if (panel.props.onPracticeTriggers) {
        why = panel.props.onPracticeTriggers(
          p.id,
          level.kind === "stop" ? priceE4 : p.stop || null,
          level.kind === "take" ? priceE4 : p.take || null,
          p.takeShare || 1000000,
          undefined,
        );
      }
    }
    panel.setState({ ppDrag: null, ppDragWhy: why || null });
  },

  loadTrades: () => {
    const coin = panel.props.activeCoin;
    if (!coin) return;
    Promise.resolve(fetchRecentTrades(coin))
      .then((t) => {
        if (panel._gone || panel.props.activeCoin !== coin) return;
        panel.setState({ trades: Array.isArray(t) ? t : false, tradesFor: coin });
      })
      .catch(() => {
        if (!panel._gone) panel.setState({ trades: false, tradesFor: coin });
      });
  },

  /* **P7 — the book, or the tape.** One column, two readings of the same
   * market a venue puts side by side: what is resting (the book, with its
   * depth drawn behind each level already) and what just traded. Each print
   * with its time, its price in the colour of the side that took it, and
   * its size in money, the book's unit. */
  /* `view`, when the panel names it (its Book, Depth and Trades tabs), is
     the view, and the column's own row of three tabs is not drawn. */
  renderBookColumn: (coin, view) => {
    const tab = view || (["trades", "depth"].includes(panel.state.ppBookTab) ? panel.state.ppBookTab : "book");
    const trades = panel.state.tradesFor === coin ? panel.state.trades : null;
    const sym = panel.posSymbol();
    return React.createElement(
      Fragment,
      null,
      view ? null : React.createElement(
        PracticeFolderTabs,
        { "data-practice-book-tab": tab, role: "tablist" },
        ...[
          ["book", msg("pp_book_tab", "Book")],
          ["depth", msg("pp_depth_tab", "Depth")],
          ["trades", msg("pp_trades_tab", "Trades")],
        ].map(([v, label]) =>
          React.createElement(
            PracticeFolderTab,
            {
              key: v,
              role: "tab",
              active: tab === v,
              "aria-selected": tab === v,
              "aria-pressed": tab === v,
              onClick: () => {
                /* The depth curve reads the deep book, so switching to it
                   asks at once rather than on the next tick of the timer. */
                panel.setState({ ppBookTab: v }, () => {
                  if (v === "depth") panel.loadBook();
                });
                if (v === "trades") panel.loadTrades();
              },
            },
            label,
          ),
        ),
        panel.ppTerminal() ? React.createElement("div", { "data-practice-folder-end": "true" }, panel.renderAreaTools("book")) : null,
      ),
      tab === "book"
        ? panel.renderOrderBook(coin, { across: Boolean(view) })
        : tab === "depth"
          ? panel.renderDepthCurve(coin)
          : React.createElement(
            PracticeTape,
            { "data-practice-trades": trades ? String(trades.length) : trades === false ? "none" : "loading" },
            !trades
              ? React.createElement(
                  AlertPosHint,
                  null,
                  trades === false
                    ? msg("pp_trades_none", "No trades for this market right now.")
                    : msg("pp_trades_wait", "Reading the last trades."),
                )
              : null,
            /* **Who is hitting.** The tape's sides are the takers' — a print
               on the ask is an aggressive buyer — so the signed sum of the
               prints is the delta of this window, and the share says how
               one-sided it was. A count of what just traded; the champion's
               trigger is what it does *next to a level*, which the profile
               above draws. */
            trades && trades.length
              ? (() => {
                  const buy = trades.filter((t) => t.side === "buy").reduce((a, t) => a + t.size, 0);
                  const sell = trades.filter((t) => t.side !== "buy").reduce((a, t) => a + t.size, 0);
                  const all = buy + sell;
                  const net = buy - sell;
                  return React.createElement(
                    PracticeTapeSum,
                    { "data-practice-delta": net >= 0 ? "buy" : "sell" },
                    React.createElement("span", null, msg("pp_tape_delta", "Delta, last $1 prints", String(trades.length))),
                    React.createElement(
                      PracticeReadoutLine,
                      { tone: net > 0 ? "up" : net < 0 ? "down" : null },
                      `${net >= 0 ? "+" : "−"}${practiceQtyText(Math.round(Math.abs(net) * QTY_SCALE))} ${coin} · ${all > 0 ? Math.round((buy / all) * 100) : 0}% ${msg("pp_tape_buyers", "buyers")}`,
                    ),
                  );
                })()
              : null,
            ...(trades || []).map((t, i) =>
              React.createElement(
                PracticeTapeRow,
                { key: `${t.at}-${i}` },
                React.createElement(
                  "span",
                  null,
                  /* 24-hour, so the stamp is eight characters in every
                     locale and never wraps "PM" onto a second line in the
                     book's own column. */
                  new Date(t.at).toLocaleTimeString(intlTag(activeLocale()), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
                ),
                React.createElement(
                  PracticeReadoutLine,
                  { tone: t.side === "buy" ? "up" : "down" },
                  practicePriceText(Math.round(t.price * PRICE_SCALE), sym),
                ),
                React.createElement("span", null, formatWidgetUsdt(t.size * t.price)),
              ),
            ),
          ),
    );
  },

  /* **The book as a depth curve** (27 Sep 2026) — see `bookDepthCurve`. Two
     step lines on one axis of distance from the mid, bids in the colour the
     ladder gives bids and asks in the ask colour, and under them the same
     curves read at fixed distances. Every figure stops where the book was
     read: a distance past a side's last level prints a dash, not a guess. */
  renderDepthCurve: (coin) => {
    const book = panel.state.book;
    const curve = book && book.asks ? bookDepthCurve(book) : null;
    if (book === false || (book && !curve)) {
      return React.createElement(
        AlertPosBook,
        { "data-practice-depth": "none" },
        React.createElement(AlertPosHint, null, msg("pos_book_none", "No book for this market right now.")),
      );
    }
    if (!curve) return React.createElement(AlertPosBook, { "data-practice-depth": "loading" });
    const xMax = Math.max(curve.reach.bid, curve.reach.ask);
    const yMax = Math.max(
      curve.bids[curve.bids.length - 1].notional,
      curve.asks[curve.asks.length - 1].notional,
    );
    const W = 100;
    const H = 48;
    const x = (bp) => (xMax > 0 ? (bp / xMax) * W : 0);
    const y = (n) => H - (yMax > 0 ? (n / yMax) * H : 0);
    const stepPath = (pts) => {
      let d = `M0,${H}`;
      let prev = 0;
      for (const p of pts) {
        d += ` L${x(p.bp).toFixed(2)},${y(prev).toFixed(2)} L${x(p.bp).toFixed(2)},${y(p.notional).toFixed(2)}`;
        prev = p.notional;
      }
      return d;
    };
    const bp = (v) => msg("pp_depth_bp", "$1 bp", v < 10 ? v.toFixed(1) : String(Math.round(v)));
    const cell = (v) => (v == null ? "—" : formatWidgetUsdt(v));
    const marks = BOOK_DEPTH_MARKS_BP.filter((m) => m <= xMax + BOOK_DEPTH_EPS_BP);
    const row = (key, label, bid, ask) =>
      React.createElement(
        Fragment,
        { key },
        React.createElement("span", null, label),
        React.createElement("span", { className: "num" }, cell(bid)),
        React.createElement("span", { className: "num" }, cell(ask)),
      );
    return React.createElement(
      AlertPosBook,
      {
        "data-practice-depth": coin,
        "data-practice-depth-levels": `${curve.levels.bid}/${curve.levels.ask}`,
        "data-practice-depth-reach": `${curve.reach.bid.toFixed(3)}/${curve.reach.ask.toFixed(3)}`,
      },
      React.createElement(
        PracticeDepthChart,
        null,
        React.createElement(
          PracticeDepthAxis,
          { "aria-hidden": "true" },
          React.createElement("span", null, `${formatWidgetUsdt(yMax)} ${PRACTICE_CURRENCY}`),
          React.createElement(
            "span",
            null,
            React.createElement("i", { className: "dc-key dc-key-bid" }),
            msg("pp_book_bids", "Bids"),
            React.createElement("i", { className: "dc-key dc-key-ask" }),
            msg("pp_book_asks", "Asks"),
          ),
        ),
        React.createElement(
          "svg",
          { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" },
          ...marks.map((m) =>
            React.createElement("line", {
              key: `m${m}`,
              className: "dc-mark",
              x1: x(m).toFixed(2),
              x2: x(m).toFixed(2),
              y1: 0,
              y2: H,
            }),
          ),
          React.createElement("path", { className: "dc-bid", d: stepPath(curve.bids) }),
          React.createElement("path", { className: "dc-ask", d: stepPath(curve.asks) }),
        ),
        React.createElement(
          PracticeDepthAxis,
          { "aria-hidden": "true" },
          React.createElement("span", null, bp(0)),
          React.createElement("span", null, msg("pp_depth_axis", "distance from the mid")),
          React.createElement("span", null, bp(xMax)),
        ),
      ),
      React.createElement(
        PracticeDepthTable,
        { "data-practice-depth-table": String(marks.length) },
        React.createElement("span", { className: "h" }, msg("pp_depth_within", "Within")),
        React.createElement("span", { className: "h num" }, `${msg("pp_book_bids", "Bids")} · ${PRACTICE_CURRENCY}`),
        React.createElement("span", { className: "h num" }, `${msg("pp_book_asks", "Asks")} · ${PRACTICE_CURRENCY}`),
        ...marks.map((m) =>
          row(`w${m}`, bp(m), bookDepthAt(curve.bids, m), bookDepthAt(curve.asks, m)),
        ),
        row(
          "all",
          msg("pp_depth_all", "All read"),
          curve.bids[curve.bids.length - 1].notional,
          curve.asks[curve.asks.length - 1].notional,
        ),
      ),
      React.createElement(
        AlertPosHint,
        null,
        msg(
          "pp_depth_note",
          "OKX's live $1 perpetual book: $2 bid levels read to $3 and $4 ask levels read to $5. The curves stop at the last level read, and a dash means the book was not read that far — nothing beyond it is drawn or guessed. Orders on display can be withdrawn before anyone reaches them, so this is what is showing, not what a trade that size would fill at.",
          coin,
          String(curve.levels.bid),
          bp(curve.reach.bid),
          String(curve.levels.ask),
          bp(curve.reach.ask),
        ),
      ),
    );
  },

  /* **The levels this account has on this market**, as prices, with what
     each one is. Positions give entry, stop (or the trail, whichever is
     tighter is the one that fires first — both are drawn), take-profit and
     liquidation; resting orders give their limit. */
  /* **Where this range did its business.** The volume profile of the drawn
     series: its volume bucketed by price into forty bins, the bin with the
     most is the point of control (POC), and the value area is the run of
     bins around it holding 70% of the volume — expanded one bin at a time
     towards whichever neighbour holds more, the way every profile tool
     builds it. Location, in the order-flow sense: where the market agreed on
     a price, and where it did not. Answers null without volume on the bars
     (the app's own Coinbase series has none; the perpetual's candles do). */
  volumeProfile: (series) => practiceVolumeProfile(series),

  practiceLevels: (coin) => {
    const practice = panel.props.practice;
    if (!practice) return [];
    const out = [];
    /* The range's own levels first, quietest: they belong to the market, not
       to the account, and they are drawn whether or not anything is held. */
    const vp = panel.volumeProfile(panel.props.series);
    if (vp) {
      out.push({ key: "poc", kind: "poc", price: Math.round(vp.poc * PRICE_SCALE), tag: "POC", quiet: true });
      out.push({ key: "vah", kind: "vah", price: Math.round(vp.vah * PRICE_SCALE), tag: "VAH", quiet: true });
      out.push({ key: "val", kind: "val", price: Math.round(vp.val * PRICE_SCALE), tag: "VAL", quiet: true });
    }
    for (const id of practiceForCoin(practice, coin)) {
      const pos = practiceAt(practice, id);
      if (!pos) continue;
      const tag = `#${id}`;
      out.push({ key: `e${id}`, kind: "entry", price: pos.entry, tag, side: pos.side });
      /* `drag` — the levels a hand may move (P4): a typed stop, a take, a
         resting order. The trail moves itself; entry and liquidation are
         facts, not choices. */
      if (pos.stop) out.push({ key: `s${id}`, kind: "stop", price: pos.stop, tag, pos, drag: true });
      const trail = practiceTrailStop(pos);
      if (trail) out.push({ key: `t${id}`, kind: "stop", price: trail, tag: `${tag} trail` });
      /* Every target of the ladder is its own line (12 Oct 2026); the first
         keeps the old key, so a single take reads and drags as it always did */
      const legs = practiceTakeLegs(pos);
      legs.forEach((leg, i) =>
        out.push({ key: i ? `p${id}x${i}` : `p${id}`, kind: "take", price: leg.price, tag: legs.length > 1 ? `${tag} TP${i + 1}` : tag, pos, leg: i, drag: true }),
      );
      const liq = practiceLiquidationPrice(pos);
      if (liq) out.push({ key: `l${id}`, kind: "liq", price: liq, tag });
    }
    const orders = practice.orders || {};
    for (const id of Object.keys(orders)) {
      const o = orders[id];
      if (o && o.coin === coin && o.limit) {
        out.push({
          key: `o${id}`,
          kind: "order",
          price: o.limit,
          tag: o.side === "long" ? "buy" : "sell",
          order: id,
          drag: true,
          /* Which kind of resting order the line is: a limit, a stop entry,
             or a reduce-only — three different promises at one price. */
          word: o.kind === "stop"
            ? msg("pp_w_stop_entry", "stop entry")
            : o.reduce ? msg("pp_w_reduce", "reduce") : null,
        });
        /* The order's own stop and take, quiet and fixed: they are promises
           about a contract that does not exist yet, edited on the order,
           not dragged (27 Sep 2026). */
        if (o.stop) out.push({ key: `os${id}`, kind: "stop", price: o.stop, tag: `${o.side === "long" ? "buy" : "sell"} SL`, word: msg("pp_w_order_stop", "order stop"), quiet: true });
        if (o.take) out.push({ key: `ot${id}`, kind: "take", price: o.take, tag: `${o.side === "long" ? "buy" : "sell"} TP`, word: msg("pp_w_order_take", "order take"), quiet: true });
      }
    }
    return out;
  },

  /* **The market, on the app's own chart, with this account traded on it**
   * (10 Oct 2026). The futures chart was a drawing of its own — a 1000-unit
   * box stretched to the frame, text laid over it in HTML, a plot 150px tall
   * with a contract open — stiff, where it should be what TradingView is. It is now the chart the main screen
   * draws (`ChartView` + `Line`): the same price scale and last-price tag,
   * the same time axis, the same crosshair with the bar's OHLC, the wheel
   * zooming into the dot and a drag moving the window like a map, "Auto"
   * and "Whole range" — fed the perpetual's own candles. What only this page
   * has — the plan, the contracts, the orders, the fan and the guide — is
   * the trade layer on top of it (`chart-trade.js`, `ppTradeLayer` below).
   *
   * The window opens on the whole range with a fifth of blank time past the
   * latest bar (`PRACTICE_VIEW_ROOM`), because that is where the plan and
   * the fan are drawn: an order is about what has not happened yet. */
  ppChartSeries: (all) => {
    const m = panel._ppSeriesMemo;
    if (m && m.all === all) return m;
    const prices = [];
    const candles = [];
    for (const p of all) {
      const t = +p.time;
      if (!(p.price > 0) || !isFinite(t)) continue;
      prices.push({ time: new Date(t), price: p.price });
      if (p.open > 0 && p.high > 0 && p.low > 0) {
        candles.push({ time: t, open: p.open, high: p.high, low: p.low, close: p.price, volume: p.vol > 0 ? p.vol : 0 });
      }
    }
    const steps = [];
    for (let i = 1; i < prices.length; i += 1) steps.push(+prices[i].time - +prices[i - 1].time);
    steps.sort((a, b) => a - b);
    const out = {
      all,
      prices,
      // Candles only when nearly every bar is whole — the old chart's rule
      candles: candles.length >= prices.length * 0.9 ? candles : null,
      vol: candles.some((c) => c.volume > 0),
      stepMs: steps.length ? steps[steps.length >> 1] : 60000,
    };
    panel._ppSeriesMemo = out;
    return out;
  },

  // The window in time, stamped like the main chart's: read only while the coin and the range match
  ppViewNow: (coin, shaped) => {
    const z = panel.state.ppZoom;
    if (z && z.coin === coin && z.period === panel.props.period) return z;
    const p = shaped.prices;
    if (p.length < 2) return null;
    const lo = +p[0].time;
    const hi = +p[p.length - 1].time;
    const span = (hi - lo) / (1 - PRACTICE_VIEW_ROOM);
    return { t0: lo, t1: hi + PRACTICE_VIEW_ROOM * span, atNow: true, ahead: PRACTICE_VIEW_ROOM };
  },

  ppViewChange: (coin) => (view) => {
    panel.setState({ ppZoom: view ? Object.assign({}, view, { coin, period: panel.props.period }) : null });
  },

  // The layers the trade layer draws, each a switch (PRACTICE_CHART_LAYERS_KEY)
  ppLayerOn: (id) => {
    const off = panel.state.ppLayersOff || PRACTICE_CHART_LAYERS_OFF;
    return !off.includes(id);
  },

  ppLayerToggle: (id) => {
    const off = panel.state.ppLayersOff || PRACTICE_CHART_LAYERS_OFF;
    const next = off.includes(id) ? off.filter((k) => k !== id) : off.concat([id]);
    savePracticeLayersOff(next);
    panel.setState({ ppLayersOff: next });
  },

  // What each layer is called where it is switched
  ppLayerName: (id) =>
    ({
      plan: msg("pp_layer_plan", "The order you are writing"),
      contracts: msg("pp_layer_contracts", "Contracts and orders"),
      fan: msg("pp_layer_fan", "Replayed futures"),
      guide: msg("pp_layer_guide", "The guide's numbers"),
      location: msg("pp_layer_location", "Volume by price"),
      clock: msg("pp_layer_clock", "Next funding"),
      book: msg("pp_layer_book", "The book's largest levels"),
      liquidations: msg("pp_layer_liquidations", "Liquidations · OKX"),
    })[id] || id,

  /* **The fan and the first touches** — `practiceFan` for the market,
     `practiceSimulate` for each contract and for the ticket's own probe,
     over the bars that fit the room past now (a quarter of the window's own,
     12 to 240). Memoised on what they read, so a render that changes nothing
     replays nothing; two thousand paths through the model are not free. */
  ppFanHorizon: (shaped) => Math.max(12, Math.min(240, Math.round(shaped.prices.length * PRACTICE_VIEW_ROOM / (1 - PRACTICE_VIEW_ROOM)))),

  ppFanFor: (shaped, startE4) => {
    const horizon = panel.ppFanHorizon(shaped);
    const bucket = Math.round(startE4 / Math.max(1, startE4 / 2000));
    const key = `${shaped.prices.length}:${+shaped.prices[shaped.prices.length - 1].time}:${bucket}:${horizon}`;
    const m = panel._ppFanMemo;
    if (m && m.key === key) return m.out;
    const out = typeof practiceFan === "function" ? practiceFan(shaped.all, startE4, { horizon, block: 8 }) : null;
    panel._ppFanMemo = { key, out };
    return out;
  },

  /* **Replayed a few at a time** (10 Oct 2026). Every contract on the
     chart's market is replayed here, and each one's key moves with the
     series — a range switched, a new bar every minute on 1H — so with eight
     contracts open every such drawing replayed eight thousand paths in one
     go: a 234 ms long task, measured. Now a drawing spends at most
     PRACTICE_TOUCH_SYNC_MS (the first replay always runs); a contract past
     that keeps the share it last printed and is replayed in a task of its
     own, and the chart is drawn once more when the last one lands. The
     numbers are the same replays — only when they are counted moved. */
  ppTouches: (state, id, shaped, markE4, tag) => {
    if (!state || !id || !(markE4 > 0) || typeof practiceSimulate !== "function") return null;
    const pos = practiceAt(state, id);
    if (!pos) return null;
    const horizon = panel.ppFanHorizon(shaped);
    const bucket = Math.round(markE4 / Math.max(1, markE4 / 1000));
    const key = `${tag}:${id}:${pos.qty}:${pos.entry}:${pos.stop || 0}:${pos.take || 0}:${pos.leverage}:${bucket}:${shaped.prices.length}:${+shaped.prices[shaped.prices.length - 1].time}:${horizon}`;
    if (!panel._ppTouchMemo) panel._ppTouchMemo = new Map();
    const memo = panel._ppTouchMemo;
    if (memo.has(key)) return memo.get(key);
    const last = panel._ppTouchLast || (panel._ppTouchLast = new Map());
    const slot = `${tag}:${id}`;
    const replay = () => {
      if (memo.has(key)) return;
      const out = practiceSimulate(state, id, shaped.all, { markE4, horizon, block: 8, paths: PRACTICE_TOUCH_PATHS });
      memo.set(key, out);
      last.set(slot, out);
      // A handful of contracts and one ticket: the oldest answers go first
      while (memo.size > 24) memo.delete(memo.keys().next().value);
    };
    if (panel._touchSpent > 0 && panel._touchSpent >= PRACTICE_TOUCH_SYNC_MS) {
      panel.ppTouchLater(key, replay);
      return last.get(slot) || null;
    }
    const t0 = performance.now();
    replay();
    panel._touchSpent = (panel._touchSpent || 0) + Math.max(0.001, performance.now() - t0);
    return memo.get(key);
  },

  /* The replays a drawing left for later, one task each, then one more
     drawing with all of them in. A key that has been counted meanwhile is
     skipped; nothing is replayed for a page that has gone. */
  ppTouchLater: (key, replay) => {
    const queue = panel._touchQueue || (panel._touchQueue = new Map());
    queue.set(key, replay);
    if (panel._touchTimer) return;
    const next = () => {
      panel._touchTimer = 0;
      if (panel._gone) {
        queue.clear();
        return;
      }
      const first = queue.keys().next();
      if (first.done) {
        panel.forceUpdate();
        return;
      }
      const run = queue.get(first.value);
      queue.delete(first.value);
      run();
      panel._touchTimer = setTimeout(next, 0);
    };
    panel._touchTimer = setTimeout(next, 0);
  },

  /* **The trade layer's data** — every price and every word the chart will
     draw, worked out here with the page's own arithmetic so the chart cannot
     disagree with the ticket, the row or the model. See `chart-trade.js` for
     the shape. */
  ppTradeLayer: (coin, marks, shaped, nowPrice) => {
    const practice = panel.props.practice;
    if (!practice) return null;
    // This drawing's replay budget starts empty (ppTouches)
    panel._touchSpent = 0;
    const sym = panel.posSymbol();
    const lastT = +shaped.prices[shaped.prices.length - 1].time;
    const nowE4 = Math.round(nowPrice * PRICE_SCALE);
    const money = (e2) => `${e2 > 0 ? "+" : e2 < 0 ? "−" : ""}${practiceMoneyText(Math.abs(e2), sym)}`;
    const priceText = (v) => practicePriceText(Math.round(v * PRICE_SCALE), panel.posPriceSign());
    const pctFrom = (v, from) => `${signedFixed(((v - from) / from) * 100, 2)}%`;
    /* The share of the replays that touched this level first — left off
       under one in a hundred, where "first in 0%" only repeated the count
       of steps beside it. */
    const firstText = (sim, kind) => {
      const share = sim && sim.n && sim.counts && sim.counts[kind] != null ? sim.counts[kind] / sim.n : null;
      return share != null && share >= 0.005 ? ` · ${msg("pp_trade_first", "first in $1", `${Math.round(share * 100)}%`)}` : "";
    };
    const levels = [];
    const boxes = [];
    const handles = [];

    /* ── The contracts and the orders on this market ── */
    if (panel.ppLayerOn("contracts")) {
      for (const id of practiceForCoin(practice, coin)) {
        const pos = practiceAt(practice, id);
        if (!pos) continue;
        const long = pos.side !== "short";
        const markE4 = marks && marks[coin] > 0 ? marks[coin] : nowE4;
        const sim = panel.ppLayerOn("fan") ? panel.ppTouches(practice, id, shaped, markE4, "pos") : null;
        const pnl = practiceUnrealised(pos, markE4);
        const entry = pos.entry / PRICE_SCALE;
        const side = long ? msg("pos_long", "Long") : msg("pos_short", "Short");
        levels.push({
          key: `e${id}`,
          kind: "entry",
          price: entry,
          ink: pnl > 0 ? "up" : pnl < 0 ? "down" : "text",
          strong: true,
          tag: priceText(entry),
          label: msg("pp_trade_entry", "$1 $2x #$3 · $4", side, String(pos.leverage), String(id), money(pnl)),
        });
        const at = (e4) => {
          const q = practiceCloseQuote(practice, id, e4);
          return q ? q.realised : null;
        };
        const levelLabel = (word, e4, kind) => {
          const r = at(e4);
          return `${word} ${priceText(e4 / PRICE_SCALE)} · ${pctFrom(e4, pos.entry)}${r != null ? ` · ${money(r)}` : ""}${firstText(sim, kind)}`;
        };
        if (pos.stop) levels.push({ key: `s${id}`, kind: "stop", price: pos.stop / PRICE_SCALE, ink: "down", drag: true, tag: priceText(pos.stop / PRICE_SCALE), label: levelLabel("SL", pos.stop, "stop") });
        else handles.push({ key: `s${id}`, on: `e${id}`, text: msg("pp_trade_add_sl", "+ SL"), kind: "stop" });
        const trail = practiceTrailStop(pos);
        if (trail) levels.push({ key: `t${id}`, kind: "trail", price: trail / PRICE_SCALE, ink: "down", dash: "2 3", label: `${msg("pp_trade_trail", "trail")} ${priceText(trail / PRICE_SCALE)}` });
        const legs = practiceTakeLegs(pos);
        legs.forEach((leg, i) => {
          const word = legs.length > 1 ? `TP${i + 1} ${leg.all ? msg("pos_take_rest", "the rest") : `${Math.round(leg.share / 10000)}%`}` : "TP";
          levels.push({ key: i ? `p${id}x${i}` : `p${id}`, kind: "take", price: leg.price / PRICE_SCALE, ink: "up", drag: true, tag: priceText(leg.price / PRICE_SCALE), label: levelLabel(word, leg.price, "take") });
        });
        if (!legs.length) handles.push({ key: `p${id}`, on: `e${id}`, text: msg("pp_trade_add_tp", "+ TP"), kind: "take" });
        const liq = practiceLiquidationPrice(pos);
        if (liq) {
          const reach = typeof assistantShareAtLeast === "function" ? assistantShareAtLeast(shaped.all, markE4, liq) : null;
          levels.push({
            key: `l${id}`,
            kind: "liq",
            price: liq / PRICE_SCALE,
            ink: "liq",
            dash: "6 3",
            tag: priceText(liq / PRICE_SCALE),
            label: `LIQ ${priceText(liq / PRICE_SCALE)} · ${pctFrom(liq, markE4)}${reach ? ` · ${msg("pp_trade_reach", "$1 of $2 steps this far", String(Math.round(reach.share * reach.steps)), String(reach.steps))}` : ""}${firstText(sim, "liquidation")}`,
          });
        }
        const be = typeof practiceBreakEven === "function" ? practiceBreakEven(practice, id) : null;
        if (be) levels.push({ key: `b${id}`, kind: "be", price: be / PRICE_SCALE, ink: "quiet", dash: "1 3", label: `${msg("pp_trade_be", "break-even")} ${priceText(be / PRICE_SCALE)}` });
        /* What the contract stands at, between its entry and the price: the
           main chart's own reading, green ahead and red behind. */
        boxes.push({ key: `pnl${id}`, lo: Math.min(entry, markE4 / PRICE_SCALE), hi: Math.max(entry, markE4 / PRICE_SCALE), ink: pnl >= 0 ? "up" : "down", from: null });
      }
      const orders = practice.orders || {};
      for (const id of Object.keys(orders)) {
        const o = orders[id];
        if (!o || o.coin !== coin || !o.limit) continue;
        const buy = o.side === "long";
        const word = o.kind === "stop"
          ? msg("pp_w_stop_entry", "stop entry")
          : o.reduce ? msg("pp_w_reduce", "reduce") : msg("pp_w_order", "limit");
        levels.push({
          key: `o${id}`,
          kind: "order",
          price: o.limit / PRICE_SCALE,
          ink: buy ? "up" : "down",
          drag: true,
          cancel: true,
          tag: priceText(o.limit / PRICE_SCALE),
          label: `${buy ? msg("pp_trade_buy", "Buy") : msg("pp_trade_sell", "Sell")} ${word} ${practiceQtyText(o.qty)} @ ${priceText(o.limit / PRICE_SCALE)}`,
        });
        if (o.stop) levels.push({ key: `os${id}`, kind: "orderStop", price: o.stop / PRICE_SCALE, ink: "quiet", dash: "2 3", label: `${msg("pp_w_order_stop", "order stop")} ${priceText(o.stop / PRICE_SCALE)}` });
        if (o.take) levels.push({ key: `ot${id}`, kind: "orderTake", price: o.take / PRICE_SCALE, ink: "quiet", dash: "2 3", label: `${msg("pp_w_order_take", "order take")} ${priceText(o.take / PRICE_SCALE)}` });
      }
    }

    /* ── The plan: the ticket as it stands, from now into the room ──
       Only while the ticket is the desk's tab, and only for a ticket the
       model accepted (its probe exists); a ghost, never a contract. */
    const t = panel._lastTicket && panel._lastTicket.coin === coin ? panel._lastTicket : null;
    // The ticket is up unless the desk is on its other tabs
    const ticketUp = !["orders", "funds", "account"].includes(panel.state.pTab);
    let planSim = null;
    if (t && t.entryE4 > 0 && ticketUp && panel.ppLayerOn("plan")) {
      const long = t.side !== "short";
      const entry = t.entryE4 / PRICE_SCALE;
      planSim = t.probe && panel.ppLayerOn("fan") ? panel.ppTouches(t.probe.state, t.probe.id, shaped, t.entryE4, "plan") : null;
      const account = practiceAccountSize(practice, coin);
      const share = (e2) => (account > 0 ? ` · ${msg("pp_trade_of_account", "$1 of the account", `${((Math.abs(e2) / account) * 100).toFixed(2)}%`)}` : "");
      const kindWord = panel.state.pKind === "limit" ? msg("pp_w_order", "limit") : panel.state.pKind === "stop" ? msg("pp_w_stop_entry", "stop entry") : msg("pp_trade_market", "market");
      levels.push({
        key: "planEntry",
        kind: "planEntry",
        price: entry,
        ink: "plan",
        dash: "6 4",
        from: lastT,
        /* The kind only when it is not a market order — a market plan fills
         at the price the tag beside it already says, and the pill is the
         widest on the lane. */
      label: panel.state.pKind === "limit" || panel.state.pKind === "stop"
        ? msg("pp_trade_plan", "Plan · $1 $2x · $3 $4", long ? msg("pos_long", "Long") : msg("pos_short", "Short"), String(t.leverage), kindWord, priceText(entry))
        : msg("pp_trade_plan_market", "Plan · $1 $2x · $3", long ? msg("pos_long", "Long") : msg("pos_short", "Short"), String(t.leverage), priceText(entry)),
      });
      if (t.stopE4 > 0) {
        const r = t.quoteAt ? t.quoteAt(t.stopE4) : null;
        levels.push({ key: "planStop", kind: "planStop", price: t.stopE4 / PRICE_SCALE, ink: "down", drag: true, from: lastT, label: `SL ${priceText(t.stopE4 / PRICE_SCALE)} · ${pctFrom(t.stopE4, t.entryE4)}${r != null ? ` · ${money(r)}${share(r)}` : ""}${firstText(planSim, "stop")}` });
        boxes.push({ key: "planRisk", lo: Math.min(entry, t.stopE4 / PRICE_SCALE), hi: Math.max(entry, t.stopE4 / PRICE_SCALE), ink: "down", from: lastT });
      } else handles.push({ key: "planStop", on: "planEntry", text: msg("pp_trade_add_sl", "+ SL"), kind: "planStop" });
      if (t.takeE4 > 0) {
        const r = t.quoteAt ? t.quoteAt(t.takeE4) : null;
        const rr = t.rr ? ` · R:R ${t.rr.toFixed(2)}` : "";
        levels.push({ key: "planTake", kind: "planTake", price: t.takeE4 / PRICE_SCALE, ink: "up", drag: true, from: lastT, label: `TP ${priceText(t.takeE4 / PRICE_SCALE)} · ${pctFrom(t.takeE4, t.entryE4)}${r != null ? ` · ${money(r)}` : ""}${rr}${firstText(planSim, "take")}` });
        boxes.push({ key: "planReward", lo: Math.min(entry, t.takeE4 / PRICE_SCALE), hi: Math.max(entry, t.takeE4 / PRICE_SCALE), ink: "up", from: lastT });
      } else handles.push({ key: "planTake", on: "planEntry", text: msg("pp_trade_add_tp", "+ TP"), kind: "planTake" });
      /* Left off when a contract on this market already draws a
         liquidation within a thousandth of it: the same level twice, one
         line under the other, is the same fact twice. */
      const sameLiq = levels.some((lv) => lv.kind === "liq" && Math.abs(lv.price * PRICE_SCALE - t.liqE4) <= t.liqE4 * 0.001);
      if (t.liqE4 > 0 && !sameLiq) {
        const reach = typeof assistantShareAtLeast === "function" ? assistantShareAtLeast(shaped.all, t.entryE4, t.liqE4) : null;
        levels.push({
          key: "planLiq",
          kind: "planLiq",
          price: t.liqE4 / PRICE_SCALE,
          ink: "liq",
          dash: "2 3",
          from: lastT,
          label: `LIQ ${priceText(t.liqE4 / PRICE_SCALE)} · ${pctFrom(t.liqE4, t.entryE4)}${reach ? ` · ${msg("pp_trade_reach", "$1 of $2 steps this far", String(Math.round(reach.share * reach.steps)), String(reach.steps))}` : ""}${firstText(planSim, "liquidation")}`,
        });
      }
    }

    /* ── The fan, from the price now ── */
    let fan = null;
    if (panel.ppLayerOn("fan")) {
      const f = panel.ppFanFor(shaped, nowE4);
      if (f && f.n && f.steps.length) {
        fan = {
          from: lastT,
          stepMs: shaped.stepMs,
          start: nowPrice,
          steps: f.steps.map((s) => ({ step: s.step, p5: s.p5 / PRICE_SCALE, p25: s.p25 / PRICE_SCALE, p50: s.p50 / PRICE_SCALE, p75: s.p75 / PRICE_SCALE, p95: s.p95 / PRICE_SCALE })),
          label: msg("pp_trade_fan", "next $1 · $2 replays · 5–95%", describeSpan(f.horizon * shaped.stepMs) || `${f.horizon}`, formatCount(f.n)),
        };
      }
    }

    /* ── The guide: the assistant's items, numbered, each where it is about ── */
    const guide = panel.ppGuideItems(coin, marks);
    const gmarks = panel.ppLayerOn("guide")
      ? guide.items
          .map((g) => {
            const c = g.item.chart;
            if (g.item.key === "funding" && guide.ctx.funding && guide.ctx.funding.at > 0) return { n: g.n, key: g.key, kind: g.item.kind, t: guide.ctx.funding.at };
            if (!c) return null;
            return { n: g.n, key: g.key, kind: g.item.kind, price: c.level > 0 ? c.level : null, lo: c.band ? c.band[0] : null, hi: c.band ? c.band[1] : null };
          })
          .filter(Boolean)
      : [];

    /* ── Location: the window's volume by price ── */
    let profile = null;
    if (panel.ppLayerOn("location")) {
      const vp = panel.volumeProfile(shaped.all);
      if (vp && vp.vols) {
        profile = {
          bins: vp.vols.map((v, i) => ({ lo: vp.lo + i * vp.step, hi: vp.lo + (i + 1) * vp.step, v, inArea: vp.lo + (i + 0.5) * vp.step >= vp.val && vp.lo + (i + 0.5) * vp.step <= vp.vah })),
          poc: vp.poc,
          vah: vp.vah,
          val: vp.val,
          words: { poc: `POC ${priceText(vp.poc)}`, vah: msg("pp_w_vah", "value high"), val: msg("pp_w_val", "value low") },
        };
      }
    }

    /* ── The clock: the next funding settlement — a line where it falls,
       or, past the window, a pill at its edge with the time to it ── */
    const times = [];
    const mkt = panel.state.mkt && panel.state.mkt.coin === coin ? panel.state.mkt : null;
    if (panel.ppLayerOn("clock") && mkt && mkt.funding && mkt.funding.at > 0 && isFinite(mkt.funding.rate)) {
      const ms = mkt.funding.at - Date.now();
      const next = ms >= 3600e3
        ? msg("pp_strip_hm", "$1h $2m", String(Math.floor(ms / 3600e3)), String(Math.floor((ms % 3600e3) / 60e3)))
        : msg("pp_strip_m", "$1m", String(Math.max(1, Math.floor(ms / 60e3))));
      const rate = `${mkt.funding.rate >= 0 ? "+" : ""}${(mkt.funding.rate * 100).toFixed(4)}%`;
      times.push({
        key: "funding",
        t: mkt.funding.at,
        label: msg("pp_trade_funding", "funding $1", rate),
        ahead: `${msg("pp_funding", "Funding")} ${msg("pp_strip_funding", "$1 · in $2", rate, next)} →`,
      });
    }

    /* ── Where the market was yesterday, and where it was forced out ── */
    const refs = [];
    if (panel.ppLayerOn("location") && mkt && mkt.priorDay) {
      refs.push({ key: "pdh", price: mkt.priorDay.high, word: `${msg("pp_trade_pdh", "yesterday's high")} ${priceText(mkt.priorDay.high)}` });
      refs.push({ key: "pdl", price: mkt.priorDay.low, word: `${msg("pp_trade_pdl", "yesterday's low")} ${priceText(mkt.priorDay.low)}` });
    }
    let prints = null;
    if (panel.ppLayerOn("liquidations") && mkt && mkt.liq && Array.isArray(mkt.liq.prints) && mkt.liq.prints.length) {
      const max = Math.max(...mkt.liq.prints.map((q) => q.value));
      prints = mkt.liq.prints.map((q, i) => ({
        key: `liq${i}`,
        t: q.t,
        price: q.price,
        side: q.side,
        share: max > 0 ? q.value / max : 0,
        text: msg(
          "pp_trade_liq_print",
          "$1 liquidated · $2 · OKX · $3",
          q.side === "long" ? msg("pos_long", "Long") : msg("pos_short", "Short"),
          formatWidgetUsd(q.value),
          localeDate(new Date(q.t), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
        ),
      }));
    }

    /* ── The book: its largest resting levels inside the window ── */
    let walls = null;
    const book = panel.state.book;
    if (panel.ppLayerOn("book") && book && book.coin === coin && Array.isArray(book.bids) && Array.isArray(book.asks)) {
      const top = (rows, side) => rows.map((r) => ({ price: Number(r[0]), size: Number(r[1]), side })).filter((r) => r.price > 0 && r.size > 0);
      const all = [...top(book.bids, "bid"), ...top(book.asks, "ask")];
      const max = Math.max(0, ...all.map((r) => r.size));
      if (max > 0) walls = all.sort((a, b) => b.size - a.size).slice(0, 6).map((r) => ({ price: r.price, side: r.side, share: r.size / max }));
    }

    const ticket = t;
    return {
      levels,
      boxes,
      handles,
      fan,
      marks: gmarks,
      focus: panel.state.ppFocus ? panel.state.ppFocus.key : null,
      profile,
      walls,
      times,
      refs,
      prints,
      /* The held line's pill, from the same arithmetic as at rest: the
         close the button would run (a contract), the ticket's own probe
         (the plan), or the order's new price. */
      dragText: (key, price) => {
        const e4 = Math.round(price * PRICE_SCALE);
        const m = /^([spo])(\d+)(?:x(\d))?$/.exec(key);
        if (m && m[1] === "o") return `${msg("pp_trade_move_to", "move to")} ${priceText(price)}`;
        if (m) {
          const pos = practiceAt(practice, Number(m[2]));
          if (!pos) return null;
          const q = practiceCloseQuote(practice, pos.id, e4);
          return `${m[1] === "s" ? "SL" : "TP"} ${priceText(price)} · ${pctFrom(e4, pos.entry)}${q ? ` · ${money(q.realised)}` : ""}`;
        }
        if ((key === "planStop" || key === "planTake") && ticket) {
          const r = ticket.quoteAt ? ticket.quoteAt(e4) : null;
          return `${key === "planStop" ? "SL" : "TP"} ${priceText(price)} · ${pctFrom(e4, ticket.entryE4)}${r != null ? ` · ${money(r)}` : ""}`;
        }
        return null;
      },
      /* Where the hand is, as a level: its price, how far from now, and what
         this account's contracts here would be worth there. */
      /* And under it the point the pointer is over — its time, its close —
         and what the price has done since: the old chart's reading of the
         recent past, kept (18 Sep 2026). */
      hoverText: (price, time) => {
        const e4 = Math.round(price * PRICE_SCALE);
        const mine = practiceForCoin(practice, coin).map((id) => practiceAt(practice, id)).filter((q) => q && (!q.currency || q.currency === PRACTICE_CURRENCY));
        /* **Short lines, one thing each** (10 Oct 2026): as two long lines
           the pill was 425px of a 690px plot at 1280 and could stand
           nowhere off the order pills. The pointer's level, what the
           contracts are worth there, the point under it, what the price
           did since. */
        let head = msg("pp_at_price", "At $1 · $2 from now", priceText(price), pctFrom(price, nowPrice));
        if (mine.length) {
          const sum = mine.reduce((a, q) => a + practiceUnrealised(q, e4), 0);
          head += `\n${msg("pp_at_mine", "your $1 here: $2", mine.length === 1 ? msg("pp_at_one", "contract") : msg("pp_at_many", "$1 contracts", String(mine.length)), money(sum))}`;
        }
        const pts = shaped.all;
        if (time == null || time > +pts[pts.length - 1].time || time < +pts[0].time) return head;
        const p = pts[nearestIndex(pts, time)];
        if (!p || !(p.price > 0)) return head;
        const since = msg("pp_since", "$1 since · $2", pctFrom(nowPrice, p.price), `${nowPrice >= p.price ? "+" : "−"}${priceText(Math.abs(nowPrice - p.price))}`);
        return `${head}\n${crosshairDate(p.time, panel.props.period)} · ${priceText(p.price)}\n${since}`;
      },
    };
  },

  /* **The guide's items**, numbered in the order the strip and the chart
     both use: what is missing, then what to watch, then the notes; before a
     contract first, then each contract's own. One list, so "③" on the chart
     is "③" in the strip. */
  ppGuideItems: (coin, marks) => {
    if (typeof assistantReadings !== "function" || typeof panel.assistantContext !== "function") return { ctx: {}, items: [] };
    const ctx = panel.assistantContext(coin, marks);
    const r = assistantReadings(ctx);
    const all = [...r.before, ...r.during.flatMap((c) => c.items.map((i) => ({ ...i, contract: c })))];
    const order = ["missing", "watch", "note"];
    all.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    return {
      ctx,
      items: all.map((item, i) => ({ n: i + 1, item, key: `${item.contract ? item.contract.pos + "-" : ""}${item.key}` })),
    };
  },

  /* A line let go on the chart. The ticket's own stop and take are fields
     (the plan); a contract's are its triggers and an order's is its price —
     through `commitLevelDrag`, the door the old chart's tags used, so a
     refused move snaps back and says why. */
  ppTradeDrag: (coin, nowPrice) => ({ key, price }) => {
    const tick = panel.state.book && panel.state.book.tick > 0 ? panel.state.book.tick : null;
    const round = (v) => {
      const step = tick || Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-9))) - 4);
      const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step))));
      return Number((Math.round(v / step) * step).toFixed(decimals));
    };
    const clean = round(price);
    if (!(clean > 0)) return;
    if (key === "planStop") {
      panel.setState({ pTab: "trade", pStop: String(clean), pTicketWhy: null, ppDragWhy: null });
      return;
    }
    if (key === "planTake") {
      panel.setState({ pTab: "trade", pTake: String(clean), pTicketWhy: null, ppDragWhy: null });
      return;
    }
    const m = /^([spo])(\d+)(?:x(\d))?$/.exec(key);
    if (!m) return;
    const priceE4 = Math.round(clean * PRICE_SCALE);
    const nowE4 = Math.round(nowPrice * PRICE_SCALE);
    if (m[1] === "o") {
      panel.commitLevelDrag({ order: m[2] }, priceE4, nowE4);
      return;
    }
    const pos = practiceAt(panel.props.practice, Number(m[2]));
    if (!pos) return;
    panel.commitLevelDrag({ kind: m[1] === "s" ? "stop" : "take", pos, leg: m[3] ? Number(m[3]) : 0 }, priceE4, nowE4);
  },

  /* A press that stayed on something: a × cancels its order (the same
     handler the order's row uses), a number pins its guide item, a handle
     pressed without a drag puts the caret in the field it would have set. */
  ppTradePress: (coin, marks) => (hit) => {
    if (hit.part === "cancel") {
      const id = String(hit.key).replace(/^o/, "");
      const o = panel.props.practice && panel.props.practice.orders ? panel.props.practice.orders[id] : null;
      if (o && panel.props.onPracticeCancelOrder) panel.props.onPracticeCancelOrder(o.id != null ? o.id : id);
      return;
    }
    if (hit.part === "mark") {
      const g = panel.ppGuideItems(coin, marks).items.find((q) => q.key === hit.key);
      if (g) panel.assistantFocus(g.item, g.item.contract || null, true);
      return;
    }
    if (hit.part === "handle" && (hit.key === "planStop" || hit.key === "planTake")) {
      const label = hit.key === "planStop" ? msg("pos_stop_aria", "Stop price") : msg("pos_take_aria", "Take-profit price");
      panel.setState({ pTab: "trade" }, () => {
        const el = document.querySelector(`input[aria-label='${label}']`);
        if (el) el.focus();
      });
    }
  },

  renderMarketChart: (coin, marks) => {
    const all = panel.props.series;
    if (!Array.isArray(all) || all.length < 2) {
      return React.createElement(
        PracticeChartFrame,
        { "data-practice-chart": "empty" },
        React.createElement(
          PracticeChartEmpty,
          null,
          msg("pp_chart_wait", "Waiting for $1's price history.", coin),
        ),
      );
    }
    const shaped = panel.ppChartSeries(all);
    if (shaped.prices.length < 2) {
      return React.createElement(
        PracticeChartFrame,
        { "data-practice-chart": "empty" },
        React.createElement(PracticeChartEmpty, null, msg("pp_chart_wait", "Waiting for $1's price history.", coin)),
      );
    }
    const candles = panel.state.ppChartStyle !== "line" && Boolean(shaped.candles);
    /* The mark where this account holds something; otherwise the live price
       the ticket is quoting, and the series' own last point before either
       has arrived. */
    const last = shaped.prices[shaped.prices.length - 1];
    const markE4 = marks && marks[coin];
    const live = panel.props.livePrices && panel.props.livePrices[coin];
    const nowPrice = markE4 ? markE4 / PRICE_SCALE : live > 0 ? live : last.price;
    const trade = panel.ppTradeLayer(coin, marks, shaped, nowPrice);
    const sign = panel.posPriceSign();
    const fmt = (v) => practicePriceText(Math.round(Number(v) * PRICE_SCALE), sign);
    const tickFallback = Math.pow(10, Math.floor(Math.log10(Math.max(nowPrice, 1e-9))) - 4);
    return React.createElement(
      PracticeChartFrame,
      { "data-practice-chart": coin, "data-practice-chart-style": candles ? "candles" : "line" },
      React.createElement(
        PracticeChartBox,
        {
          "data-practice-plot": "true",
          /* **The cursor from the keyboard**, as the main chart reads it
             (`readKey`): ←/→ the bars, Home and End; Enter prices a limit at
             the bar read — the press's own equivalent. */
          "data-owns-arrows": "true",
          onKeyDown: (e) => {
            const view = panel.ppViewRef.current;
            if (!view) return;
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              view.readKey(e.key);
              return;
            }
            if (e.key === "Enter") {
              const chart = view.chart;
              if (!chart || !chart.reading || !chart.reading()) return;
              const pts = chart.readPoints();
              const p = pts[chart.readNearest(pts, chart._readT)];
              const v = p && (p.candle ? p.candle.close : p.price);
              if (v > 0) {
                e.preventDefault();
                panel.pickChartPrice(v, nowPrice, tickFallback);
              }
            }
          },
        },
        React.createElement(ChartView, {
          ref: panel.ppViewRef,
          view: panel.ppViewNow(coin, shaped),
          onViewChange: panel.ppViewChange(coin),
          viewEnabled: true,
          detailSupported: false,
          finerSpan: 0,
          prices: shaped.prices,
          candles: candles ? shaped.candles : null,
          ohlc: shaped.candles,
          showCandles: candles,
          showVolume: candles && shaped.vol,
          volumeVenue: "OKX",
          axes: true,
          interactive: true,
          period: panel.props.period,
          coin,
          currency: PRACTICE_CURRENCY,
          currencySymbol: sign,
          formatPrice: fmt,
          livePrice: nowPrice,
          colorize: panel.props.chartColor,
          trade,
          onTradeDrag: panel.ppTradeDrag(coin, nowPrice),
          onTradePress: panel.ppTradePress(coin, marks),
          /* **A press on the chart prices a limit there** (27 Sep 2026) —
             nothing is placed; the ticket's button is still the order. */
          onPickPrice: (v) => panel.pickChartPrice(v, nowPrice, tickFallback),
        }),
      ),
      panel.state.ppDragWhy
        ? React.createElement(
            PracticeDragWhy,
            { "data-practice-drag-why": panel.state.ppDragWhy },
            panel.state.ppDragWhy === "fires"
              ? msg("pp_drag_fires", "Not moved: at that price it would close the contract at once. A stop goes below the price on a long and above it on a short; a take the other way.")
              : msg("pp_drag_refused", "Not moved: $1.", panel.refusalText ? panel.refusalText(panel.state.ppDragWhy) : panel.state.ppDragWhy),
          )
        : null,
    );
  },
  /* **P3 — the line a venue prints above its chart.** The price, its 24h
   * move, the mark where this account holds something and it has moved away
   * from the last price (a median of three ticks — the one the account is
   * valued on), funding with the time to the next settlement, and open
   * interest. Nothing here is a request of its own: the ticker snapshot and
   * the market readings the page already asked for. The countdown is as live
   * as the page — it moves each time the price does — and no timer is kept
   * running on a new-tab page to move it faster. */
  renderMarketStrip: (coin, marks) => {
    /* The perpetual's own ticker: last, the day's move, high and low, all
       USDT and all from one request the page already makes. */
    const t = perpTickerFor(coin);
    const live = panel.props.livePrices && panel.props.livePrices[coin];
    const last = live > 0 ? live : t ? t.last : null;
    const sym = panel.posSymbol();
    const markE4 = marks && marks[coin];
    const lastE4 = last > 0 ? Math.round(last * PRICE_SCALE) : 0;
    const mkt = panel.state.mkt && panel.state.mkt.coin === coin ? panel.state.mkt : null;
    const change = t ? Number(t.change24h) : NaN;
    const cells = [];
    if (lastE4) {
      cells.push(["last", msg("pp_strip_last", "Last"), practicePriceText(lastE4, sym), null]);
    }
    if (markE4 && lastE4 && markE4 !== lastE4) {
      cells.push(["mark", msg("pp_strip_mark", "Mark"), practicePriceText(markE4, sym), null]);
    }
    if (isFinite(change) && lastE4) {
      cells.push(["change", msg("pp_strip_24h", "24h"), `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`, change > 0 ? "up" : change < 0 ? "down" : null]);
    }
    /* The day's low and high as one range, low first as a venue prints it
       — two cells were a gap and a label more, and at 1280 with the mark
       shown the row wrapped and cost the plot a line (10 Oct 2026). */
    if (t && t.high24h && t.low24h) {
      cells.push([
        "range",
        msg("pp_strip_range", "24h range"),
        `${practicePriceText(Math.round(t.low24h * PRICE_SCALE), sym)} – ${practicePriceText(Math.round(t.high24h * PRICE_SCALE), sym)}`,
        null,
      ]);
    }
    if (mkt && mkt.funding) {
      const f = mkt.funding;
      const ms = f.at - Date.now();
      const next = ms > 0
        ? ms >= 3600e3
          ? msg("pp_strip_hm", "$1h $2m", String(Math.floor(ms / 3600e3)), String(Math.floor((ms % 3600e3) / 60e3)))
          : msg("pp_strip_m", "$1m", String(Math.max(1, Math.floor(ms / 60e3))))
        : null;
      cells.push([
        "funding",
        msg("pp_funding", "Funding"),
        next
          ? msg("pp_strip_funding", "$1 · in $2", `${f.rate >= 0 ? "+" : ""}${f.percent}%`, next)
          : `${f.rate >= 0 ? "+" : ""}${f.percent}%`,
        null,
      ]);
    }
    if (mkt && mkt.oi) {
      cells.push(["oi", msg("pp_oi", "Open interest"), mkt.oi.formatted, null]);
    }
    /* **Three rows over the plot, not five** (10 Oct 2026, measured: the
       head took 170 of 800px at 1280×800 and left the plot 31% of the
       window). The venue's figures; the range, the style and what the chart
       draws, its name first (renderChartLegend); the guide. The name is not
       a cell of its own: the market row over the card already shows which
       market is open, and with the mark beside the last price the figures
       need the row's whole width at 1280. */
    return React.createElement(
      Fragment,
      null,
      React.createElement(
        PracticeStrip,
        { "data-practice-strip": coin },
        ...cells.map(([key, label, value, tone]) =>
          React.createElement(
            PracticeStripCell,
            { key, "data-practice-strip-cell": key },
            React.createElement("span", null, label),
            React.createElement(PracticeReadoutLine, { tone }, value),
          ),
        ),
      ),
      panel.renderAreaTools("chart"),
      React.createElement(PracticeMarketHead, { "data-practice-market-head": true }, panel.renderMarketPeriods(), panel.renderChartLegend(coin)),
      panel.renderChartFlags(coin, marks),
    );
  },

  /* **What the chart is**, beside its name (it was in the plot's corner
     until 10 Oct 2026, when the chart became the main screen's and the plot
     its own): the bar it is drawn in, the venue, where the volume is, and
     the two things a hand can do on it. A chart that does not say what it
     draws is not read correctly (the owner's rule 8). */
  renderChartLegend: (coin) => {
    const shaped = Array.isArray(panel.props.series) && panel.props.series.length > 1 ? panel.ppChartSeries(panel.props.series) : null;
    const candles = panel.state.ppChartStyle !== "line" && Boolean(shaped && shaped.candles);
    const bar = (PERP_SERIES_BARS[panel.props.period] || [])[0] || "";
    return React.createElement(
      PracticeChartLegend,
      { "data-practice-chart-legend": candles ? "candles" : "line" },
      React.createElement("strong", null, msg("pp_strip_perp", "$1 perpetual", `${coin}${PRACTICE_CURRENCY}`)),
      " · ",
      candles ? msg("pp_legend_candles", "$1 candles · OKX", bar) : msg("pp_legend_line", "$1 closes · OKX", bar),
      candles && shaped.vol ? ` · ${msg("pp_legend_volume", "volume in $1 below", coin)}` : "",
      ` · ${msg("pp_legend_hand", "click a price for a limit, drag a line to move it")}`,
    );
  },

  /* **The assistant, on the chart.** Its missing and watch items as chips
     under the strip — the four that matter most, each opening the tab. A
     chart with nothing to raise carries no row at all. */
  /* **The guide, over the chart** (10 Oct 2026) — the assistant's items as
     one numbered row in the chart's own chrome, never on the plot (the
     companion's index taught that on 9 Oct). The numbers are the ones the
     chart draws at the price or the time each item is about, so "② the
     liquidation" here is the ② beside the liquidation line. Pointing at a
     chip lights its band on the chart; a press keeps it lit; what the
     item asks for, where the chart can do it, is said in the chip — "drag
     + SL on the chart". The whole list, with its sentences and its whys, is
     the Assistant tab, one press away. */
  renderChartFlags: (coin, marks) => {
    if (!panel.ppLayerOn("guide")) return null;
    const guide = panel.ppGuideItems(coin, marks);
    if (!guide.items.length) return null;
    const act = {
      stop: msg("pp_guide_drag_sl", "drag + SL on the chart"),
      take: msg("pp_guide_drag_tp", "drag + TP on the chart"),
      posStop: msg("pp_guide_drag_sl", "drag + SL on the chart"),
      posTake: msg("pp_guide_drag_tp", "drag + TP on the chart"),
    };
    /* **One row, never three** — a guide that wraps takes the chart's
       height, the thing it is there to help read. As many chips as the
       row's measured room holds (`ppGuideRoom`, measureBody: the row less
       its head and its "+n"), by the type's own advance, then "+n";
       unmeasured, three. A digit's worth is kept back, for "+9" → "+10". */
    const words = (g) => {
      const [title] = panel.assistantWords(g.item, guide.ctx);
      return { title, act: act[g.item.key] || null };
    };
    const advance = parseFloat(posType.body) * 16 * PRACTICE_GUIDE_ADVANCE;
    const budget = panel.state.ppGuideRoom > 0 ? panel.state.ppGuideRoom - advance : null;
    const shown = [];
    let used = 0;
    for (const g of guide.items) {
      if (shown.length >= PRACTICE_GUIDE_CHIPS) break;
      const w = words(g);
      const width = PRACTICE_GUIDE_CHIP_PX + advance * (w.title.length + (w.act ? w.act.length : 0));
      if (budget == null ? shown.length >= 3 : used + width > budget) break;
      shown.push({ g, w });
      used += width;
    }
    const rest = guide.items.length - shown.length;
    const focus = panel.state.ppFocus;
    const open = panel.state.ppGuideOpen || null;
    const row = React.createElement(
      PracticeChartFlags,
      { "data-practice-chart-flags": String(guide.items.length), role: "list", "aria-label": msg("pp_guide_aria", "The guide — what the chart marks, numbered") },
      React.createElement(PracticeGuideHead, { "data-practice-guide-head": "true" }, msg("pp_guide", "Guide")),
      ...shown.map(({ g, w }) => {
        const title = w.title;
        const on = Boolean(focus && focus.key === g.key && focus.pinned);
        return React.createElement(
          PracticeChartFlag,
          {
            key: g.key,
            kind: g.item.kind,
            on,
            role: "listitem",
            "aria-pressed": on ? "true" : "false",
            "data-practice-chart-flag": g.item.kind,
            "data-practice-guide-key": g.key,
            title: g.item.chart
              ? msg("pp_guide_chip_title", "Point at it to see it on the chart; press to keep it there")
              : msg("pp_flag_open", "Open the assistant"),
            onMouseEnter: () => panel.assistantFocus(g.item, g.item.contract || null, false),
            onMouseLeave: () => panel.assistantBlur(),
            onFocus: () => panel.assistantFocus(g.item, g.item.contract || null, false),
            onBlur: () => panel.assistantBlur(),
            /* An item the chart cannot show opens the guide on it, rather
               than sending the eye to the panel under the chart. */
            onClick: () => (g.item.chart ? panel.assistantFocus(g.item, g.item.contract || null, true) : panel.ppGuideShow("pinned", g.key)),
          },
          React.createElement("b", null, String(g.n)),
          React.createElement("span", null, title),
          w.act ? React.createElement("em", null, w.act) : null,
        );
      }),
      React.createElement(
        PracticeChartFlag,
        {
          key: "all",
          kind: "note",
          on: open === "pinned",
          "data-practice-guide-all": "true",
          "aria-haspopup": "dialog",
          "aria-expanded": open ? "true" : "false",
          "aria-controls": "pp-guide-pop",
          onMouseEnter: panel.ppGuideHoverIn,
          onMouseLeave: panel.ppGuideHoverOut,
          onClick: () => (open === "pinned" ? panel.ppGuideClose() : panel.ppGuideShow("pinned", null)),
        },
        rest > 0 ? msg("pp_guide_more", "+$1 · the assistant", String(rest)) : msg("pp_guide_all", "The assistant"),
      ),
    );
    return React.createElement(
      PracticeGuideWrap,
      { "data-practice-guide": "true" },
      row,
      open ? panel.renderGuidePop(guide) : null,
    );
  },

  /* **Every item of the guide, over the chart** (10 Oct 2026). The
     assistant's own rows (`renderAssistantItems` — the same words, the same
     "On the chart" and the same way to the ticket), each beside the number
     the chart draws at its price, in the chart's order. The panel's
     Assistant tab is still one press away, for reading it at length. */
  renderGuidePop: (guide) => {
    const lit = panel.state.ppGuideLit || null;
    return React.createElement(
      PracticeGuidePop,
      {
        id: "pp-guide-pop",
        role: "dialog",
        "aria-label": msg("pp_guide_pop_aria", "The guide — every item, numbered as on the chart"),
        "data-practice-guide-pop": panel.state.ppGuideOpen,
        onMouseEnter: () => clearTimeout(panel._guideT),
        onMouseLeave: panel.ppGuideHoverOut,
      },
      React.createElement(
        PracticeGuidePopHead,
        null,
        React.createElement("span", null, msg("pp_guide_pop_head", "Guide · $1", String(guide.items.length))),
        React.createElement(
          AlertPosChips,
          null,
          React.createElement(
            AlertPosChip,
            {
              "data-practice-guide-panel": "true",
              onClick: () => panel.setState({ ppRead: "assistant", ppMore: true, ppGuideOpen: null }),
            },
            msg("pp_guide_in_panel", "Open in the panel"),
          ),
          React.createElement(
            AlertPosChip,
            { "aria-label": msg("pp_guide_close", "Close the guide"), "data-practice-guide-close": "true", onClick: panel.ppGuideClose },
            "\u00d7",
          ),
        ),
      ),
      ...guide.items.map((g) =>
        React.createElement(
          PracticeGuidePopItem,
          {
            key: g.key,
            kind: g.item.kind,
            lit: lit === g.key,
            "data-practice-guide-pop-item": g.key,
            innerRef: (n) => {
              // The item a chip opened the guide on is brought into view, once
              if (n && lit === g.key && panel._guideShown !== lit && n.parentNode) {
                panel._guideShown = lit;
                n.parentNode.scrollTop = Math.max(0, n.offsetTop - 48);
              }
            },
          },
          React.createElement("b", null, String(g.n)),
          ...panel.renderAssistantItems([g.item], guide.ctx, g.item.contract || null),
        ),
      ),
    );
  },

  /* Pointing opens it after a short rest and leaving puts it away; a press
     keeps it until a second press, Esc or a press elsewhere (alerts.js). */
  ppGuideShow: (how, lit) => {
    clearTimeout(panel._guideT);
    if (how === "hover" && panel.state.ppGuideOpen === "pinned") return;
    panel._guideShown = null;
    panel.setState({ ppGuideOpen: how, ppGuideLit: lit || null });
  },
  ppGuideClose: () => {
    clearTimeout(panel._guideT);
    if (panel.state.ppGuideOpen && !panel._gone) panel.setState({ ppGuideOpen: null, ppGuideLit: null });
  },
  ppGuideHoverIn: () => {
    clearTimeout(panel._guideT);
    if (panel.state.ppGuideOpen) return;
    panel._guideT = setTimeout(() => {
      if (!panel._gone) panel.ppGuideShow("hover", null);
    }, PRACTICE_GUIDE_HOVER_MS);
  },
  ppGuideHoverOut: () => {
    clearTimeout(panel._guideT);
    if (panel.state.ppGuideOpen !== "hover") return;
    panel._guideT = setTimeout(() => {
      if (!panel._gone && panel.state.ppGuideOpen === "hover") panel.setState({ ppGuideOpen: null, ppGuideLit: null });
    }, PRACTICE_GUIDE_LEAVE_MS);
  },

  /* **The crowd reading, on the page.** See `crowdReading` for the rule. The
     lean is drawn only with its record beside it — the count, the share that
     rose, and the same share on an ordinary day — so the one thing on this
     page that points a direction is also the one that says how often
     pointing that way has worked here. */
  renderCrowdReading: (coin, plain) => {
    const mkt = panel.state.mkt;
    const here = mkt && mkt.coin === coin ? mkt : null;
    const c = here && here.crowd;
    if (!here || here.loading) return null;
    if (!c) {
      return React.createElement(
        PracticeCrowd,
        { "data-practice-crowd": "none", plain },
        React.createElement(PortfolioEyebrow, null, msg("pp_crowd_head", "Crowd reading · Bybit accounts")),
        React.createElement(
          AlertPosMeasure,
          null,
          msg("pp_crowd_none", "Bybit has no daily positioning history for $1, so there is nothing to count.", coin),
        ),
      );
    }
    const pct = (v) => `${Math.round(v * 100)}%`;
    const where =
      c.state === "long"
        ? msg("pp_crowd_long", "in the top fifth of the last $1 days — crowded long", String(CROWD_WINDOW))
        : c.state === "short"
          ? msg("pp_crowd_short", "in the bottom fifth of the last $1 days — crowded short", String(CROWD_WINDOW))
          : msg("pp_crowd_middle", "in the middle of the last $1 days", String(CROWD_WINDOW));
    const why =
      c.why === "edge"
        ? msg(
            "pp_crowd_edge",
            "That is $1 points away from an ordinary day, which is the whole reason it leans.",
            String(Math.round(Math.abs(c.upRate - c.baseRate) * 100)),
          )
        : c.why === "ordinary"
          ? msg("pp_crowd_ordinary", "Not far enough from an ordinary day to lean on.")
          : msg(
              "pp_crowd_thin",
              "$1 times is too few to lean on; the floor is $2.",
              String(c.n),
              String(BASE_RATE_MIN_EPISODES),
            );
    return React.createElement(
      PracticeCrowd,
      { "data-practice-crowd": c.lean || "none", lean: c.lean, plain },
      React.createElement(
        PracticeCrowdHead,
        null,
        React.createElement(PortfolioEyebrow, null, msg("pp_crowd_head", "Crowd reading · Bybit accounts")),
        React.createElement(
          PracticeLean,
          { lean: c.lean, "data-practice-lean": c.lean || "none" },
          c.lean === "long"
            ? msg("pp_lean_long", "Leans long")
            : c.lean === "short"
              ? msg("pp_lean_short", "Leans short")
              : msg("pp_lean_none", "No lean"),
        ),
      ),
      React.createElement(
        PracticeCrowdLine,
        null,
        msg("pp_crowd_now", "Accounts are $1 long, $2.", pct(c.share), where),
      ),
      c.n
        ? React.createElement(
            PracticeCrowdLine,
            { "data-practice-crowd-record": "true" },
            msg(
              "pp_crowd_record",
              "After the last $1 times it was here, $2 was higher $3 days later $4 times ($5). On an ordinary day: $6 of $7.",
              String(c.n),
              coin,
              String(CROWD_HORIZON),
              String(c.up),
              pct(c.upRate),
              pct(c.baseRate),
              String(c.baseN),
            ),
          )
        : null,
      React.createElement(PracticeCrowdLine, null, why),
      React.createElement(
        AlertPosMeasure,
        null,
        msg(
          "pp_crowd_rule",
          "Counted from Bybit's last $1 days. What followed before, never a promise of what follows next.",
          String(c.days),
        ),
      ),
    );
  },

  /* **The market-structure readings, under the crowd's.** Three lines that
   * each print a state and its record — see `structureReadings`. The same
   * box, the same pill, the same sentences as the crowd reading, so the four
   * read as one table: what the market's own numbers were, and what
   * followed the last times they were there. */
  renderStructureReading: (coin, plain) => {
    const mkt = panel.state.mkt;
    const here = mkt && mkt.coin === coin ? mkt : null;
    const s = here && here.structure;
    if (!here || here.loading) return null;
    if (!s || (!s.funding && !s.oi && !s.joint)) {
      return React.createElement(
        PracticeCrowd,
        { "data-practice-structure": "none", plain },
        React.createElement(PortfolioEyebrow, null, msg("pp_struct_head", "Market structure · Bybit")),
        React.createElement(
          AlertPosMeasure,
          null,
          msg("pp_struct_none", "Bybit has no daily funding or open-interest history for $1, so there is nothing to count.", coin),
        ),
      );
    }
    const pct = (v) => `${Math.round(v * 100)}%`;
    const fifth = (state) =>
      state === "high"
        ? msg("pp_struct_high", "in the top fifth of the last $1 days", String(CROWD_WINDOW))
        : state === "low"
          ? msg("pp_struct_low", "in the bottom fifth of the last $1 days", String(CROWD_WINDOW))
          : msg("pp_struct_middle", "in the middle of the last $1 days", String(CROWD_WINDOW));
    const why = (r) =>
      r.why === "edge"
        ? msg("pp_crowd_edge", "That is $1 points away from an ordinary day, which is the whole reason it leans.", String(Math.round(Math.abs(r.upRate - r.baseRate) * 100)))
        : r.why === "ordinary"
          ? msg("pp_crowd_ordinary", "Not far enough from an ordinary day to lean on.")
          : msg("pp_crowd_thin", "$1 times is too few to lean on; the floor is $2.", String(r.n), String(BASE_RATE_MIN_EPISODES));
    const record = (r) =>
      r.n
        ? [
            React.createElement(
              PracticeCrowdLine,
              { key: "record", "data-practice-structure-record": "true" },
              msg(
                "pp_crowd_record",
                "After the last $1 times it was here, $2 was higher $3 days later $4 times ($5). On an ordinary day: $6 of $7.",
                String(r.n),
                coin,
                String(CROWD_HORIZON),
                String(r.up),
                pct(r.upRate),
                pct(r.baseRate),
                String(r.baseN),
              ),
            ),
            React.createElement(
              PracticeCrowdLine,
              { key: "fall", "data-practice-structure-fall": "true" },
              msg(
                "pp_struct_fall",
                "A fall past $1% by then: $2 of $3, against $4 of $5 ordinary days.",
                String(Math.round(STRUCTURE_FALL * 100)),
                String(r.fell),
                String(r.n),
                String(r.baseFell),
                String(r.baseN),
              ),
            ),
            React.createElement(PracticeCrowdLine, { key: "why" }, why(r)),
          ]
        : [];
    const block = (key, title, now, r) =>
      React.createElement(
        PracticeStructureItem,
        { key, "data-practice-structure": key, "data-practice-structure-lean": (r && r.lean) || "none" },
        React.createElement(
          PracticeCrowdHead,
          null,
          React.createElement(PracticeStructureTitle, null, title),
          React.createElement(
            PracticeLean,
            { lean: r && r.lean, "data-practice-lean": (r && r.lean) || "none" },
            r && r.lean === "long"
              ? msg("pp_lean_long", "Leans long")
              : r && r.lean === "short"
                ? msg("pp_lean_short", "Leans short")
                : msg("pp_lean_none", "No lean"),
          ),
        ),
        React.createElement(PracticeCrowdLine, null, now),
        ...(r ? record(r) : []),
      );
    const items = [];
    if (s.funding) {
      const f = s.funding;
      items.push(
        block(
          "funding",
          msg("pp_struct_funding", "Funding"),
          msg("pp_struct_funding_now", "Today's funding is $1 — $2 of those days were lower.", fifth(f.state), pct(f.rank)),
          f,
        ),
      );
    }
    if (s.oi) {
      const o = s.oi;
      items.push(
        block(
          "oi",
          msg("pp_struct_oi", "Open interest"),
          msg("pp_struct_oi_now", "Open interest is $1 — $2 of those days were lower.", fifth(o.state), pct(o.rank)),
          o,
        ),
      );
    }
    if (s.joint) {
      const j = s.joint;
      const way = j.oi === "rising" ? msg("pp_struct_rising", "rising") : msg("pp_struct_falling", "falling");
      const move = `${j.oiMove >= 0 ? "+" : ""}${(j.oiMove * 100).toFixed(1)}%`;
      items.push(
        block(
          "joint",
          msg("pp_struct_joint", "Funding × open interest"),
          j.funding === "middle"
            ? msg("pp_struct_joint_middle", "Funding is in the middle of its range and open interest is $1 over the last day ($2) — most days look like this, so there is nothing to count against.", way, move)
            : msg("pp_struct_joint_now", "Funding is $1 and open interest is $2 over the last day ($3).", fifth(j.funding), way, move),
          j.funding === "middle" ? null : j,
        ),
      );
    }
    return React.createElement(
      PracticeCrowd,
      { "data-practice-structure": "readings", plain },
      React.createElement(PortfolioEyebrow, null, msg("pp_struct_head", "Market structure · Bybit")),
      ...items,
      React.createElement(
        AlertPosMeasure,
        null,
        msg(
          "pp_struct_rule",
          "Counted from Bybit's last $1 days of funding and open interest, ranked against the $2 days before each. What followed before, never a promise of what follows next.",
          String(Math.max(s.funding ? s.funding.days : 0, s.oi ? s.oi.days : 0)),
          String(CROWD_WINDOW),
        ),
      ),
    );
  },

  /* The range chips under the chart — the main chart's own, so there is one
     range in the app and not two that disagree. */
  renderMarketPeriods: () =>
    typeof panel.props.onPeriod === "function"
      ? React.createElement(
          PracticePeriods,
          null,
          ...PERIOD_OPTIONS.map((o) =>
            React.createElement(
              AlertPosChip,
              {
                key: o.value,
                active: panel.props.period === o.value,
                "aria-pressed": panel.props.period === o.value,
                /* The range, and the bar it is drawn in — the question a
                   venue's interval buttons answer. */
                title: PERP_SERIES_BARS[o.value]
                  ? msg("pp_period_bars", "$1 — $2 bars", o.title, PERP_SERIES_BARS[o.value][0])
                  : o.title,
                onClick: () => panel.props.onPeriod(o.value),
              },
              o.label,
            ),
          ),
          /* The window back to the whole range, while it is not — the main
             chart's "Whole range", for this chart's own window. */
          panel.state.ppZoom && panel.state.ppZoom.coin === panel.props.activeCoin && panel.state.ppZoom.period === panel.props.period
            ? React.createElement(
                AlertPosChip,
                {
                  "data-practice-zoom-reset": "true",
                  title: msg("pp_zoom_reset_title", "Show the whole range again"),
                  onClick: () => {
                    panel.setState({ ppZoom: null });
                    const view = panel.ppViewRef.current;
                    if (view && view.fitScale) view.fitScale();
                  },
                },
                msg("view_reset", "Whole range"),
              )
            : null,
          /* **Candles or the close as a line** — how this chart draws, kept
             (PRACTICE_CHART_STYLE_KEY). Beside the range because both are
             controls of this chart and nothing else. */
          React.createElement(
            PracticeChartStyle,
            { role: "group", "aria-label": msg("pp_chart_style", "Chart style"), "data-practice-chart-style": panel.state.ppChartStyle },
            ...PRACTICE_CHART_STYLES.map((v) =>
              React.createElement(
                AlertPosChip,
                {
                  key: v,
                  active: panel.state.ppChartStyle === v,
                  "aria-pressed": panel.state.ppChartStyle === v,
                  onClick: () => {
                    savePracticeChartStyle(v);
                    panel.setState({ ppChartStyle: v });
                  },
                },
                v === "candles" ? msg("pp_style_candles", "Candles") : msg("pp_style_line", "Line"),
              ),
            ),
          ),
        )
      : null,

  /* **The derivatives market's own readings, as it reports them.**
   *
   * Grouped the way the portfolio groups its figures — by the question each
   * answers, with a hairline between — and every figure is the venue's own
   * number with the venue named. None of them is a signal and the line under
   * them says so: crowded longs are a fact about the crowd, not about what
   * the price does next, and this screen has an order button on it. A reading
   * that did not arrive is left out rather than drawn as a dash; when none
   * did, one sentence says so. */
  renderMarketContext: (coin) => {
    const mkt = panel.state.mkt;
    const here = mkt && mkt.coin === coin ? mkt : null;
    const series = panel.props.series;
    const groups = [];
    const item = (label, value, opts = {}) =>
      React.createElement(
        StatItem,
        { key: label, title: opts.title },
        React.createElement(StatLabel, null, label),
        React.createElement(StatValue, { up: opts.up == null ? null : opts.up }, value),
      );

    /* Funding's rate and countdown and the open interest are on the strip
       above the chart (P3); what stays here is what they do not say — who
       pays, and how the crowd is placed. */
    if (here && here.funding) {
      const f = here.funding;
      /* Two more figures from the same answer (22 Sep 2026, the first of the
         derivatives readings in VISION): the rate per year, with the
         settlement interval it was measured from, and OKX's premium — how far
         the perpetual sits from its spot index, which is the basis in one
         number. Both are printed as numbers; neither leans. */
      const hours = f.intervalHours > 0 ? f.intervalHours : 8;
      const perYear = f.annualized != null ? Number(f.annualized) : null;
      const premium = typeof f.premium === "number" && isFinite(f.premium) ? f.premium * 100 : null;
      groups.push([
        "funding",
        item(
          msg("pp_funding_pays", "Paid by"),
          f.rate > 0
            ? msg("pp_longs_pay", "longs, to shorts")
            : f.rate < 0
              ? msg("pp_shorts_pay", "shorts, to longs")
              : msg("pp_nobody_pays", "nobody at zero"),
          { title: msg("pp_funding_hint", "OKX's current perpetual funding rate, charged at each settlement") },
        ),
        perYear != null && isFinite(perYear)
          ? item(
              msg("pp_funding_pa", "Per year"),
              msg("pp_funding_pa_value", "$1% · every $2h", `${perYear >= 0 ? "+" : ""}${perYear.toFixed(2)}`, String(hours)),
              { title: msg("pp_funding_pa_hint", "This settlement's rate, paid every settlement for a year — the interval is measured from OKX's own next-settlement time, not assumed") },
            )
          : null,
        premium != null
          ? item(
              msg("pp_premium", "Over index"),
              `${premium >= 0 ? "+" : ""}${premium.toFixed(3)}%`,
              { title: msg("pp_premium_hint", "OKX's premium: how far the perpetual's price sits above (+) or below (−) its spot index — the basis funding is set from") },
            )
          : null,
      ]);
    }
    if (here && here.ls) {
      groups.push([
        "crowd",
        here.ls
          ? item(msg("pp_ls", "Accounts long"), `${here.ls.longPct}% / ${here.ls.shortPct}%`, {
              title: msg("pp_ls_hint", "Share of Bybit accounts holding a long against a short — accounts, not money"),
            })
          : null,
      ]);
    }
    if (here && here.liq) {
      groups.push([
        "forced",
        item(msg("pp_liq", "Liquidated 24h"), here.liq.totalFormatted, {
          title: msg("pp_liq_hint", "Positions OKX closed by force in the last 24 hours, from its latest hundred"),
        }),
        item(msg("pp_liq_longs", "Of it longs"), `${here.liq.longPct}%`),
      ]);
    }
    if (Array.isArray(series) && series.length > 1) {
      const prices = series.map((p) => p.price).filter((v) => isFinite(v));
      const a = prices[0];
      const b = prices[prices.length - 1];
      const hi = Math.max(...prices);
      const lo = Math.min(...prices);
      const sym = panel.posPriceSign();
      const label = (PERIOD_OPTIONS.find((o) => o.value === panel.props.period) || {}).label || "";
      groups.push([
        "range",
        item(msg("pp_range_move", "$1 move", label), `${b >= a ? "+" : ""}${(((b - a) / a) * 100).toFixed(2)}%`, {
          up: b === a ? null : b > a,
        }),
        item(msg("pp_range_hi", "$1 high", label), formatAxisPrice(hi, (hi - lo) / 4, sym)),
        item(msg("pp_range_lo", "$1 low", label), formatAxisPrice(lo, (hi - lo) / 4, sym)),
      ]);
    }

    return React.createElement(
      PracticeContext,
      { "data-practice-context": here ? (here.loading ? "loading" : "ready") : "none" },
      React.createElement(
        PortfolioEyebrow,
        null,
        msg("pp_market_head", "$1 perpetual · the market", coin),
      ),
      groups.length
        ? React.createElement(
            PracticeStats,
            null,
            ...groups.map(([key, ...items]) =>
              React.createElement(PracticeStatGroup, { key, "data-practice-stat": key }, ...items.filter(Boolean)),
            ),
          )
        : null,
      React.createElement(
        AlertPosMeasure,
        null,
        here && here.loading
          ? msg("pp_market_wait", "Asking OKX and Bybit about $1.", coin)
          : here && !here.funding && !here.oi && !here.ls && !here.liq
            ? msg("pp_market_none", "Neither OKX nor Bybit reports a perpetual market for $1 right now.", coin)
            : msg(
                "pp_market_rule",
                "Funding, open interest and liquidations from OKX; accounts from Bybit, as they report them. The crowd reading above is the only figure here that leans, and it prints its record.",
              ),
      ),
    );
  },

  /* **The account's result, in the three figures a venue prints.**
   *
   * Asked for by name: unrealized and realized P/L on the screen. What each
   * one is, precisely, because the ledger keeps them apart and a header that
   * blurred them would double-count a fee:
   *   - *unrealized* — the open contracts at the mark, before the fee closing
   *     them would cost (`practiceUnrealised` through `practiceSummary`);
   *   - *realized* — every closed contract's result after its closing fee
   *     (`realised`); the opening fees and funding are recorded apart;
   *   - *since start* — equity against everything put in (the opening
   *     balance and every deposit), which is the one figure with every cost
   *     already inside it, so it cannot disagree with the balance.
   * Fees and funding are printed under them so the gap between realized and
   * since-start is explained on the screen rather than left to arithmetic. */
  renderAccountResult: (practice, marks, coin) => {
    const inverse = practiceIsCoinSettled(practice);
    const wallet = inverse ? practiceWallet(practice, coin) : null;
    const src = wallet || practice;
    const sum = panel.practiceSummary(practice, marks);
    const amount = (v) => (inverse ? practiceCoinText(v, coin) : practiceMoneyText(v, panel.posSymbol()));
    const signed = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${amount(Math.abs(v))}`;
    const putIn = (src.startBalance || 0) + (src.deposited || 0);
    const since = sum.equity - putIn;
    const pct = (v, of) => (of > 0 ? ` (${signedFixed((v / of) * 100, 2)}%)` : "");
    const lead = (key, label, value, up, title) =>
      React.createElement(
        StatItem,
        { key, lead: true, title, "data-practice-result": key },
        React.createElement(StatLabel, null, label),
        React.createElement(StatValue, { up }, value),
      );
    const tone = (v) => (v > 0 ? true : v < 0 ? false : null);
    return React.createElement(
      PracticeResult,
      null,
      React.createElement(
        PortfolioStatsLead,
        null,
        lead(
          "unrealised",
          msg("pp_unrealised", "Unrealized P/L"),
          sum.unrealised == null ? "—" : `${signed(sum.unrealised)}${pct(sum.unrealised, sum.used)}`,
          sum.unrealised == null ? null : tone(sum.unrealised),
          msg("pp_unrealised_hint", "The open contracts at the mark, against the margin behind them — before the fee closing them would cost"),
        ),
        lead(
          "realised",
          msg("pp_realised", "Realized P/L"),
          signed(src.realised || 0),
          tone(src.realised || 0),
          msg("pp_realised_hint", "Every closed contract's result, after its closing fee. Opening fees and funding are counted apart, below"),
        ),
        lead(
          "since",
          msg("pp_since_start", "Since start"),
          `${signed(since)}${pct(since, putIn)}`,
          tone(since),
          msg("pp_since_start_hint", "Equity against everything put in — the opening balance and every deposit. Every cost is already inside it"),
        ),
      ),
      React.createElement(
        PracticeResultNote,
        null,
        msg(
          "pp_costs_line",
          "Fees paid $1 · funding $2",
          amount(src.fees || 0),
          (src.funding || 0) > 0
            ? msg("pp_funding_paid", "paid $1", amount(src.funding))
            : (src.funding || 0) < 0
              ? msg("pp_funding_received", "received $1", amount(-src.funding))
              : amount(0),
        ),
      ),
    );
  },

  /* **The page.** See the note at the top of this file. */
  /* **The terminal's seams** (27 Sep 2026, see PracticeColumns). Three
   * handles: `book` (between the chart and the book — the book's width),
   * `desk` (between the book and the ticket — width traded between the two,
   * so the chart does not move) and `bottom` (the positions panel's height).
   *
   * The drag writes the grid's CSS variables on its node, one frame per
   * move, and the panel's state once on release: a setState per pointer move
   * would render the whole page — book, ticket, table — sixty times a
   * second. Sizes are measured from the cells as drawn, so the first drag
   * from a window-chosen default starts where the eye sees the seam. */
  ppSplitStart: (which) => {
    const grid = panel.ppGridNode;
    if (!grid) return null;
    const cell = (area) => grid.querySelector(`[data-practice-cell="${area}"]`);
    const box = (n) => (n ? n.getBoundingClientRect() : { width: 0, height: 0 });
    const g = box(grid);
    return {
      which,
      book: box(cell("book")).width,
      desk: box(cell("desk")).width,
      pin: box(cell("pin")).width,
      bottom: box(cell("bottom")).height,
      gridW: g.width,
      gridH: g.height,
    };
  },

  /* Where a seam lands after moving `d` px (right or down is positive),
   * held inside the layout's limits and the window's: the chart keeps at
   * least PRACTICE_MIN_CHART across and PRACTICE_MIN_CHART_H down. Answers
   * only the fields this seam changes. */
  ppSplitTo: (start, d) => {
    const [bookLo, bookHi] = PRACTICE_LAYOUT_LIMITS.book;
    const [deskLo, deskHi] = PRACTICE_LAYOUT_LIMITS.desk;
    const [botLo, botHi] = PRACTICE_LAYOUT_LIMITS.bottom;
    const clamp = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), Math.max(lo, hi)));
    const room = start.gridW - 2 * PRACTICE_SPLIT_PX - PRACTICE_MIN_CHART;
    if (start.which === "book") {
      return { book: clamp(start.book - d, bookLo, Math.min(bookHi, room - start.desk)) };
    }
    if (start.which === "pin") {
      // The pinned panel is right of its seam: left is wider
      const [pinLo, pinHi] = PRACTICE_LAYOUT_LIMITS.pin;
      return { pin: clamp(start.pin - d, pinLo, Math.min(pinHi, room - (panel.ppTerminal() ? start.book + start.desk : start.desk))) };
    }
    if (start.which === "desk") {
      /* The terminal: the ticket is right of its seam, so left is wider,
         and the book keeps its width — the chart gives what is taken. */
      if (panel.ppTerminal()) {
        return { desk: clamp(start.desk - d, deskLo, Math.min(deskHi, room - start.book)) };
      }
      /* Layout D: the ticket is left of its seam, so right is wider, and
         the chart gives up what the ticket takes (it keeps
         PRACTICE_MIN_CHART). */
      return { desk: clamp(start.desk + d, deskLo, Math.min(deskHi, start.gridW - 2 * PRACTICE_SPLIT_PX - PRACTICE_MIN_CHART)) };
    }
    return { bottom: clamp(start.bottom - d, botLo, Math.min(botHi, start.gridH - PRACTICE_SPLIT_PX - PRACTICE_MIN_CHART_H)) };
  },

  ppPaintLayout: (layout) => {
    const grid = panel.ppGridNode;
    if (!grid) return;
    for (const key of ["book", "desk", "pin", "bottom"]) {
      if (layout[key] > 0) grid.style.setProperty(`--pp-${key}`, `${layout[key]}px`);
      else grid.style.removeProperty(`--pp-${key}`);
    }
  },

  ppCommitLayout: (patch, drop) => {
    const next = { ...panel.state.ppLayout, ...patch };
    for (const key of drop || []) delete next[key];
    savePracticeLayout(next);
    panel.setState({ ppLayout: sanitizePracticeLayout(next), ppSplit: null });
  },

  ppSplitDown: (which) => (e) => {
    if (e.button !== 0) return;
    const start = panel.ppSplitStart(which);
    if (!start) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // A pointer already gone: no moves will follow, and the up is harmless.
    }
    panel._ppSplit = { start, x: e.clientX, y: e.clientY, patch: null, frame: 0 };
    panel.setState({ ppSplit: which });
  },

  ppSplitMove: (e) => {
    const drag = panel._ppSplit;
    if (!drag) return;
    const d = drag.start.which === "bottom" ? e.clientY - drag.y : e.clientX - drag.x;
    drag.patch = panel.ppSplitTo(drag.start, d);
    if (drag.frame) return;
    drag.frame = requestAnimationFrame(() => {
      drag.frame = 0;
      if (drag.patch) panel.ppPaintLayout({ ...panel.state.ppLayout, ...drag.patch });
    });
  },

  ppSplitUp: () => {
    const drag = panel._ppSplit;
    if (!drag) return;
    panel._ppSplit = null;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    if (!drag.patch) {
      panel.setState({ ppSplit: null }); // a press with no move
      return;
    }
    panel.ppCommitLayout(drag.patch);
  },

  /* The keys: ←/→ (↑/↓ for the panel) one PRACTICE_SPLIT_STEP, Home and
     End to the ends. The global shortcuts stand down for them — see the
     `data-splitter` guard in app.js's handleKeyDown. */
  ppSplitKey: (which) => (e) => {
    const start = panel.ppSplitStart(which);
    if (!start) return;
    const row = which === "bottom";
    const big = 100000;
    const d =
      e.key === (row ? "ArrowDown" : "ArrowRight") ? PRACTICE_SPLIT_STEP
      : e.key === (row ? "ArrowUp" : "ArrowLeft") ? -PRACTICE_SPLIT_STEP
      : e.key === "Home" ? -big
      : e.key === "End" ? big
      : null;
    if (d == null) return;
    e.preventDefault();
    panel.ppCommitLayout(panel.ppSplitTo(start, d));
  },

  renderSplit: (which) => {
    const layout = panel.state.ppLayout || {};
    const row = which === "bottom";
    const now = which === "desk" ? layout.desk : layout[which];
    const label =
      which === "book"
        ? msg("pp_split_book", "Book width")
        : which === "desk"
          ? msg("pp_split_desk", "Ticket width")
          : which === "pin"
            ? msg("pp_split_pin", "Pinned panel width")
            : msg("pp_split_bottom", "Positions panel height");
    const [lo, hi] = PRACTICE_LAYOUT_LIMITS[which];
    return React.createElement(PracticeSplit, {
      area: which === "book" ? "splitA" : which === "desk" ? "splitB" : which === "pin" ? "splitP" : "splitC",
      dir: row ? "row" : "col",
      role: "separator",
      tabIndex: 0,
      "aria-orientation": row ? "horizontal" : "vertical",
      "aria-label": label,
      "aria-valuemin": lo,
      "aria-valuemax": hi,
      "aria-valuenow": now || undefined,
      "aria-valuetext": now
        ? msg("pp_split_px", "$1 pixels", String(now))
        : msg("pp_split_auto", "The window's choice"),
      title: msg("pp_split_title", "$1 — drag to resize · double-click for the default", label),
      "data-splitter": which,
      "data-practice-split": which,
      dragging: panel.state.ppSplit === which,
      onPointerDown: panel.ppSplitDown(which),
      onPointerMove: panel.ppSplitMove,
      onPointerUp: panel.ppSplitUp,
      onPointerCancel: panel.ppSplitUp,
      onLostPointerCapture: panel.ppSplitUp,
      onDoubleClick: () => panel.ppCommitLayout({}, [which]),
      onKeyDown: panel.ppSplitKey(which),
    });
  },

  /* The grid's variables from the stored layout — what the drag paints
     directly is the same three names. */
  ppLayoutStyle: () => {
    const layout = panel.state.ppLayout || {};
    const style = {};
    for (const key of ["book", "desk", "pin", "bottom"]) {
      if (layout[key] > 0) style[`--pp-${key}`] = `${layout[key]}px`;
    }
    return style;
  },

  /* **The derivatives market's settings, on the derivatives market** (27 Sep
   * 2026). They were in three places — Settings → Features for the contract
   * strip and the confirmation, the Account tab for the alarm, and the page's
   * own chips for the chart — and a person on this page reached two of them by
   * leaving it. One sheet now, from the head: the page (chart style and the
   * terminal's seams), the order confirmation, the strip on the main chart, the
   * alarm, and the way to the account's own settings.
   *
   * **Nothing is defined twice.** The confirmation, the strip and the
   * glossary are `settingSections()`'s rows — the chart drawer's adapter,
   * three fields — so Settings and this sheet are one definition. The
   * alarm row is `renderAlarmRow`, the one the Targets drawer draws. */
  ppSettingsOpen: (open) => {
    if (open === Boolean(panel.state.ppSettings)) return;
    if (open) {
      document.addEventListener("keydown", panel.ppSettingsKey, true);
      document.addEventListener("mousedown", panel.ppSettingsOutside, true);
    } else {
      document.removeEventListener("keydown", panel.ppSettingsKey, true);
      document.removeEventListener("mousedown", panel.ppSettingsOutside, true);
    }
    panel.setState({ ppSettings: open, ppSettingsInfo: null });
  },

  /* Escape closes the sheet and nothing else. Heard in the capture phase
     on the document, before app.js's handler — which would otherwise take
     the same key to close the whole page (see Escape has three claimants). */
  ppSettingsKey: (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    e.preventDefault();
    panel.ppSettingsOpen(false);
  },

  /* A press outside puts it away and is spent doing so — it does not also
     land on the blank page behind, which would close the page itself. */
  ppSettingsOutside: (e) => {
    const sheet = panel.ppSettingsNode;
    const t = e.target;
    if (!sheet || (sheet.contains && sheet.contains(t))) return;
    if (t && t.closest && t.closest("[data-practice-settings-open]")) return;
    e.stopPropagation();
    panel.ppSettingsOpen(false);
  },

  renderPageSettings: () => {
    const adapter = {
      props: { ...panel.props, practiceEnabled: true },
      state: { query: "", openInfo: panel.state.ppSettingsInfo || null, practiceAsk: false },
      setState: (patch) => panel.setState({ ppSettingsInfo: patch && "openInfo" in patch ? patch.openInfo : panel.state.ppSettingsInfo }),
      section: (title, keywords, node) => (node ? React.createElement(PrefRow, null, node) : node),
    };
    const sections = typeof settingSections === "function" ? settingSections(adapter) : {};
    const row = (key) => (typeof sections[key] === "function" ? sections[key]() : null);
    const layout = panel.state.ppLayout || {};
    const size = (key) =>
      layout[key] > 0 ? `${layout[key]} px` : msg("pp_split_auto_short", "auto");
    /* Layout D has two seams, the ticket's and the panel's. A book width
       stored before it is still read and cleared by Reset, but it no longer
       sizes anything, so it does not make the layout "stored". */
    const stored = layout.bottom > 0 || layout.desk > 0;
    return React.createElement(
      PracticeSettingsSheet,
      {
        role: "dialog",
        "aria-label": msg("pp_settings_title", "Derivatives market settings"),
        "data-practice-settings": "open",
        innerRef: (n) => (panel.ppSettingsNode = n),
      },
      React.createElement(
        PracticeSettingsHead,
        null,
        React.createElement("strong", null, msg("pp_settings_title", "Derivatives market settings")),
        React.createElement(
          ChartDrawerClose,
          { onClick: () => panel.ppSettingsOpen(false), "aria-label": msg("pp_settings_close", "Close the derivatives settings") },
          "\u00d7",
        ),
      ),
      /* What the chart draws over the market (chart-trade.js): a switch
         each, stored as what is off. */
      React.createElement(
        PracticeSettingsGroup,
        { "data-practice-settings-group": "layers" },
        React.createElement(PracticeSettingsLabel, null, msg("pp_settings_layers", "On the chart")),
        React.createElement(
          PracticeChartStyle,
          { role: "group", "aria-label": msg("pp_settings_layers", "On the chart"), flush: true, wrap: true },
          ...PRACTICE_CHART_LAYERS.map((id) =>
            React.createElement(
              AlertPosChip,
              {
                key: id,
                active: panel.ppLayerOn(id),
                "aria-pressed": panel.ppLayerOn(id),
                "data-practice-layer": id,
                onClick: () => panel.ppLayerToggle(id),
              },
              panel.ppLayerName(id),
            ),
          ),
        ),
      ),
      /* The page: how the chart draws and where the seams are. */
      React.createElement(
        PracticeSettingsGroup,
        { "data-practice-settings-group": "page" },
        React.createElement(PracticeSettingsLabel, null, msg("pp_settings_page", "This page")),
        React.createElement(
          PracticeSettingsLine,
          null,
          React.createElement("span", null, msg("pp_layout", "Layout")),
          React.createElement(
            PracticeChartStyle,
            { role: "group", "aria-label": msg("pp_layout", "Layout"), flush: true, "data-practice-page-layout": panel.state.ppPageLayout },
            ...PRACTICE_PAGE_LAYOUTS.map((v) =>
              React.createElement(
                AlertPosChip,
                {
                  key: v,
                  active: panel.state.ppPageLayout === v,
                  "aria-pressed": panel.state.ppPageLayout === v,
                  title: v === "terminal"
                    ? msg("pp_layout_terminal_title", "The chart, the order book and the ticket side by side, what is open under the chart and the book")
                    : msg("pp_layout_simple_title", "The ticket on the left, the chart on the right, the book one press away under More"),
                  onClick: () => {
                    savePracticePageLayout(v);
                    panel.setState({ ppPageLayout: v });
                  },
                },
                v === "terminal" ? msg("pp_layout_terminal", "Terminal") : msg("pp_layout_simple", "Simple"),
              ),
            ),
          ),
        ),
        React.createElement(
          PracticeSettingsLine,
          null,
          React.createElement("span", null, msg("pp_chart_style", "Chart style")),
          React.createElement(
            PracticeChartStyle,
            { role: "group", "aria-label": msg("pp_chart_style", "Chart style"), flush: true },
            ...PRACTICE_CHART_STYLES.map((v) =>
              React.createElement(
                AlertPosChip,
                {
                  key: v,
                  active: panel.state.ppChartStyle === v,
                  "aria-pressed": panel.state.ppChartStyle === v,
                  onClick: () => {
                    savePracticeChartStyle(v);
                    panel.setState({ ppChartStyle: v });
                  },
                },
                v === "candles" ? msg("pp_style_candles", "Candles") : msg("pp_style_line", "Line"),
              ),
            ),
          ),
        ),
        React.createElement(
          PracticeSettingsLine,
          { "data-practice-settings-layout": stored ? "stored" : "auto" },
          React.createElement(
            "span",
            null,
            msg("pp_settings_sizes", "Ticket width $1 · panel height $2", size("desk"), size("bottom")),
          ),
          React.createElement(
            AlertPosChip,
            {
              disabled: !stored,
              "data-practice-layout-reset": "true",
              onClick: () => {
                panel.ppPaintLayout({});
                panel.ppCommitLayout({}, ["book", "desk", "pin", "bottom"]);
              },
            },
            msg("pp_settings_reset", "Reset layout"),
          ),
        ),
        React.createElement(
          PracticeSettingsLine,
          { "data-practice-settings-places": panel.state.ppAreas || (panel.state.ppPinned || []).length ? "moved" : "own" },
          React.createElement(
            "span",
            null,
            (panel.state.ppPinned || []).length
              ? msg("pp_places_pinned", "Areas moved by their grips · $1 pinned", String(panel.state.ppPinned.length))
              : msg("pp_places", "Areas moved by their grips"),
          ),
          React.createElement(
            AlertPosChip,
            {
              disabled: !panel.state.ppAreas && !(panel.state.ppPinned || []).length,
              "data-practice-places-reset": "true",
              onClick: () => {
                savePracticeAreas(null);
                savePracticePinned([]);
                panel.setState({ ppAreas: null, ppPinned: [], ppMax: null });
              },
            },
            msg("pp_places_reset", "Put the areas back"),
          ),
        ),
        React.createElement(
          PracticeSettingsNote,
          null,
          msg(
            "pp_settings_sizes_note",
            "Drag the seam beside the ticket, or the one under the chart, to resize them — or focus one with Tab and use the arrow keys. A double-click on a seam puts its default back. The sizes are kept on this device; on a window under 1280 pixels the page is one column and they wait.",
          ),
        ),
      ),
      React.createElement(PracticeSettingsGroup, { "data-practice-settings-group": "orders" }, row("practiceConfirm")),
      React.createElement(
        PracticeSettingsGroup,
        { "data-practice-settings-group": "dock" },
        React.createElement(PracticeSettingsLabel, null, msg("pp_settings_main_chart", "On the main chart")),
        row("practiceDock"),
        row("practiceMainLines"),
      ),
      React.createElement(PracticeSettingsGroup, { "data-practice-settings-group": "alarm" }, panel.renderAlarmRow("futures")),
      React.createElement(
        PracticeSettingsGroup,
        { "data-practice-settings-group": "account" },
        React.createElement(PracticeSettingsLabel, null, msg("pp_settings_account", "The account")),
        React.createElement(
          PracticeSettingsNote,
          null,
          msg(
            "pp_settings_account_note",
            "The balance, the settlement, the costs and the plan's limits describe the account itself, so they live on the ticket's Account tab, where changing one says what it does to the account.",
          ),
        ),
        React.createElement(
          AlertPosChip,
          {
            "data-practice-settings-account": "true",
            onClick: () => {
              panel.ppSettingsOpen(false);
              panel.setState({ pTab: "account" });
            },
          },
          msg("pp_settings_to_account", "Open the Account tab"),
        ),
      ),
      React.createElement(PracticeSettingsGroup, { "data-practice-settings-group": "glossary" }, row("practiceGlossary")),
      React.createElement(
        PracticeSettingsNote,
        { foot: true },
        msg("pp_settings_foot", "Turning the derivatives market off, and everything else, is in Settings (S) → Features."),
      ),
    );
  },

  /* **The moment a contract opens** — see PracticeOpenMoment. Read off the
     contract the model opened (the one `before` did not hold): its fill and
     its margin, not the ticket's estimate of them. */
  renderOpenMoment: () => {
    const o = panel.state.pOpened;
    const practice = panel.props.practice;
    if (!o || !practice) return null;
    const id = practiceList(practice).find((k) => o.before.indexOf(k) === -1);
    const pos = id ? practiceAt(practice, id) : null;
    if (!pos) return null;
    const up = pos.side !== "short";
    const inverse = pos.settlement === PRACTICE_SETTLEMENT_COIN;
    const sym = panel.posSymbol(pos.currency);
    return React.createElement(
      PracticeOpenMoment,
      { key: o.at, "aria-hidden": "true", "data-practice-open-moment": pos.side },
      React.createElement(
        PracticeOpenCard,
        { up },
        React.createElement(
          PracticeOpenSide,
          { up },
          `${up ? msg("pos_long", "Long") : msg("pos_short", "Short")} · ${pos.leverage}x`,
        ),
        React.createElement(
          PracticeOpenLine,
          { lead: true },
          msg(
            "pp_open_moment_fill",
            "$1 opened at $2",
            inverse ? pos.coin : `${pos.coin}-${PRACTICE_CURRENCY}`,
            practicePriceText(pos.entry, sym),
          ),
        ),
        React.createElement(
          PracticeOpenLine,
          null,
          msg(
            "pp_open_moment_size",
            "$1 · margin $2",
            inverse ? practiceMoneyText(pos.qty, sym) : `${practiceQtyText(pos.qty)} ${pos.coin}`,
            inverse ? practiceCoinText(pos.margin, pos.coin) : practiceMoneyText(pos.margin, sym),
          ),
        ),
      ),
    );
  },

  renderPracticePage: (onClose) => {
    const practice = panel.props.practice;
    const coin = panel.props.activeCoin;
    const marks = panel.practiceMarkMap();
    const open = practice ? Object.keys(practice.positions || {}).length : 0;
    const ready = practice && panel.props.practiceEnabled !== false && panel.props.practiceConsent;
    /* **No row of its own for the account on the wide page** (10 Oct
       2026). Measured at 1280×800: the account's row took 90px over both
       columns and the chart was left 36% of the window. The balance heads
       the ticket's column, what it says about the account; the results and
       the page's two buttons sit at the right of the screen's own band, as
       a venue's top bar carries them. Narrower, the row is as it was. */
    const wide = Boolean(ready) && panel.ppWide();
    const equity = ready
      ? React.createElement(
          "div",
          null,
          /* The account's name and kind moved up into the screen's head
             (PracticeScreenHead); the balance leads this block now. */
          React.createElement(
            PortfolioTotal,
            { "data-practice-equity": "true" },
            practiceIsCoinSettled(practice)
              ? practiceCoinText(practiceEquity(practice, marks, coin), coin)
              : practiceMoneyText(practiceEquity(practice, marks)),
            /* The unit once, small, after the account's number — the
               figure is read first and the currency beside it. */
            practiceIsCoinSettled(practice)
              ? null
              : React.createElement(PracticeTotalUnit, null, ` ${PRACTICE_CURRENCY}`),
          ),
          React.createElement(
            PortfolioDelta,
            { up: null, "data-practice-head-free": open ? "true" : undefined },
            open
              ? `${panel.freeText(practice, coin)} · ${msg("pos_n_open", "$1 open", String(open))}`
              : msg("pp_equity_note", "Equity — nothing committed"),
          ),
        )
      : null;
    const headTools = React.createElement(
      PortfolioHeadTools,
      null,
      /* The page's settings (renderPageSettings), beside About. */
      ready
        ? React.createElement(
            InfoBtn,
            {
              type: "button",
              active: Boolean(panel.state.ppSettings),
              "aria-pressed": panel.state.ppSettings ? "true" : "false",
              "aria-haspopup": "dialog",
              "data-practice-settings-open": "true",
              title: msg("pp_settings_hint", "The chart, the layout, the order confirmation and the alarm"),
              onClick: () => panel.ppSettingsOpen(!panel.state.ppSettings),
            },
            msg("pp_settings", "Settings"),
          )
        : null,
      React.createElement(
        InfoBtn,
        {
          type: "button",
          active: panel.state.info,
          "aria-pressed": panel.state.info ? "true" : "false",
          "aria-label": msg("al_about_panel", "About this panel"),
          title: msg("al_info_futures", "What this simulation is, what it costs, and where the account stands"),
          onClick: () =>
            panel.setState(
              (p) => ({ info: !p.info }),
              () => {
                if (panel.state.info) panel.loadFunding();
              },
            ),
        },
        msg("po_info", "About"),
      ),
    );
    const badge = React.createElement(
      "span",
      null,
      `${msg("pp_usdt_margined", "USDT-margined")} · ${msg("pos_badge", "Simulated · no real money")}`,
    );
    const title = React.createElement("h2", null, msg("pos_title", "Derivatives Market"), keyCap("F"));
    /* Where each area stands, and which one is enlarged or being dropped on */
    const places = panel.ppPlaceMap();
    const maxed = panel.state.ppMax && panel.ppAreasHere().includes(panel.state.ppMax) ? panel.state.ppMax : null;
    const cellProps = (area) => ({
      area,
      place: maxed === area ? "max" : places[area] || area,
      "data-practice-cell": area,
      "data-pp-maxed": maxed === area ? "true" : undefined,
      dropping: Boolean(panel.state.ppSwapFrom) && panel.state.ppSwapOver === area && panel.state.ppSwapFrom !== area,
      lifting: panel.state.ppSwapFrom === area,
    });
    return React.createElement(
      PracticeShell,
      {
        "data-practice-page": "true",
        innerRef: (n) => (panel.bodyRef = n),
        onScroll: () => panel.measureBody(),
        onMouseDown: (e) => {
          if (practiceBlankPress(e, e.currentTarget)) onClose();
        },
      },
      wide
        ? React.createElement(
            PracticeScreenHead,
            { "data-practice-head": "true", wide: true },
            React.createElement("div", null, title, badge),
            React.createElement(
              PracticeHeadEnd,
              null,
              panel.renderAccountResult(practice, marks, coin),
              headTools,
            ),
          )
        : React.createElement(PracticeScreenHead, { "data-practice-head": "true" }, title, badge),
      React.createElement(
        PracticeInner,
        /* The hook the render tests measure the derivatives screen's width
           by — the card's, when it was a card. */
        { empty: !ready, "data-alerts-card": "true" },
        wide
          ? null
          : React.createElement(
              PracticeHeader,
              null,
              React.createElement(
                PortfolioHeadRow,
                null,
                React.createElement(
                  PracticeHeadMain,
                  null,
                  equity,
                  /* Beside the equity rather than under it: stacked, the
                     three figures pushed the desk 83px down and the
                     ticket's price fields under its own sticky foot at
                     1440×900. */
                  ready ? panel.renderAccountResult(practice, marks, coin) : null,
                ),
                headTools,
              ),
            ),
        /* The card that says what the screen cannot: the three costs, the
           walls the account can be stopped by, and the live funding rate —
           fetched when the card opens and nowhere else. */
        panel.state.info ? React.createElement(PracticeInfoWrap, null, panel.renderFuturesInfo()) : null,
        ready && panel.state.ppSettings ? panel.renderPageSettings() : null,
        /* The phone's four views (PracticeColumns): one part at a time,
           the ticket first. Not built at all above 600px — hidden by CSS it
           was still four buttons in the page, and a desktop test pressing
           the ticket's "Account" tab by its text pressed this one instead. */
        ready && typeof matchMedia === "function" && matchMedia("(max-width: 600px)").matches
          ? React.createElement(
              PracticePhoneTabs,
              { role: "tablist", "aria-label": msg("pp_phone_views", "Parts of the market"), "data-pp-phone-tabs": "true" },
              ...[
                ["trade", msg("pp_phone_trade", "Trade")],
                ["chart", msg("pp_phone_chart", "Chart")],
                ["book", msg("pp_phone_book", "Book")],
                ["positions", open ? msg("pp_phone_positions_n", "Open · $1", String(open)) : msg("pp_phone_activity", "Activity")],
              ].map(([id, label]) =>
                React.createElement(
                  PracticePhoneTab,
                  {
                    key: id,
                    role: "tab",
                    on: (panel.state.ppPhone || "trade") === id,
                    "aria-selected": (panel.state.ppPhone || "trade") === id ? "true" : "false",
                    "data-pp-phone-tab": id,
                    onClick: () => {
                      panel.setState({ ppPhone: id });
                      if (panel.bodyRef) panel.bodyRef.scrollTop = 0;
                    },
                  },
                  label,
                ),
              ),
            )
          : null,
        ready
          ? React.createElement(
              PracticeColumns,
              {
                "data-practice-columns": "true",
                "data-pp-phone": panel.state.ppPhone || "trade",
                "data-pp-layout": panel.ppTerminal() ? "terminal" : "simple",
                "data-pp-pin": panel.ppPinnedHere().length ? "on" : undefined,
                "data-pp-max": panel.state.ppMax && panel.ppAreasHere().includes(panel.state.ppMax) ? panel.state.ppMax : undefined,
                /* The panel under the chart: as tall as its rows, a height
                   for the drawn tabs, or the one its seam was dragged to —
                   and half the page when another area stands in its place. */
                "data-pp-bottom": (panel.state.ppLayout || {}).bottom > 0
                  ? "set"
                  : places.bottom !== "bottom" || Object.keys(places).some((k) => k !== "bottom" && places[k] === "bottom")
                    ? "book"
                    : ["book", "depth", "trades"].includes(panel.ppReadTab())
                    ? "book"
                    : PRACTICE_TALL_TABS.includes(panel.ppReadTab()) ? "tall" : "fit",
                innerRef: (n) => (panel.ppGridNode = n),
                style: panel.ppLayoutStyle(),
              },
              /* **The terminal** — see PracticeColumns. Four areas and the
                 the seam under the chart; below the wide breakpoint the
                 areas are not boxes at all and the page is the one column
                 it always was. **Layout D since 9 Oct 2026** (the owner's
                 pick of four): the ticket first — on the left, and first
                 for Tab — the chart and what is open on the right, the
                 book a tab under More (its cell stays for narrower
                 windows and the phone). */
              React.createElement(
                PracticeCell,
                cellProps("desk"),
                wide ? React.createElement(PracticeDeskHead, { "data-practice-desk-head": "true" }, equity, panel.renderAreaTools("desk")) : null,
                React.createElement(PracticeDesk, { "data-practice-desk": "true" }, panel.renderFuturesBody(true)),
              ),
              panel.renderSplit("desk"),
              React.createElement(
                PracticeCell,
                cellProps("chart"),
                panel.renderMarketBar(coin),
                /* **One card per question, one rhythm between them.** The
                   market, what you hold, what the crowd is doing, what the
                   venue reports: each framed the same way, a card's width
                   apart, instead of four blocks each with its own margins
                   (measured: gaps of 10, 14, 18 and 30px down the column). */
                React.createElement(
                  PracticePanel,
                  { "data-practice-market-card": "true" },
                  panel.renderMarketStrip(coin, marks),
                  panel.renderMarketChart(coin, marks),
                ),
              ),
              /* Below the wide breakpoint the book is a block of the one
                 column; on the wide page it is a tab of the panel, and a
                 second, hidden copy here was a second ladder in the DOM —
                 two tab stops and twice the rows to draw. */
              panel.ppWide() && !panel.ppTerminal()
                ? null
                : React.createElement(
                    PracticeCell,
                    cellProps("book"),
                    React.createElement(
                      PracticeColBook,
                      { "data-practice-book-card": "true" },
                      panel.renderBookColumn(coin),
                    ),
                  ),
              panel.ppTerminal() ? panel.renderSplit("book") : null,
              /* The tabs pinned as their own panel, beside the chart */
              panel.ppPinnedHere().length
                ? React.createElement(PracticeCell, cellProps("pin"), panel.renderPinnedPanel(coin, marks, panel.ppPinnedHere()))
                : null,
              panel.ppPinnedHere().length ? panel.renderSplit("pin") : null,
              panel.renderSplit("bottom"),
              React.createElement(
                PracticeCell,
                cellProps("bottom"),
                panel.renderReadingTabs(coin, marks),
              ),
            )
          : React.createElement(PracticeDesk, { "data-practice-desk": "true" }, panel.renderFuturesBody(true)),
      ),
      panel.renderOpenMoment(),
    );
  },
});

/* One word per kind of level, for the tags. */
const practiceLevelWord = (kind) =>
  kind === "entry"
    ? msg("pp_w_entry", "entry")
    : kind === "stop"
      ? msg("pp_w_stop", "stop")
      : kind === "take"
        ? msg("pp_w_take", "take")
        : kind === "liq"
          ? msg("pp_w_liq", "liq")
          : kind === "poc"
            ? msg("pp_w_poc", "POC")
            : kind === "vah"
              ? msg("pp_w_vah", "value high")
              : kind === "val"
                ? msg("pp_w_val", "value low")
                : msg("pp_w_order", "limit");
