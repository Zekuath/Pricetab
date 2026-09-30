/* THE DERIVATIVES MARKET AS A PAGE — Pro only.
 *
 * Asked 18 Sep 2026, after a column docked down the right of the chart was
 * built and rejected: *"böyle sola yapmayalım, çok da iyi durmuyor, portföydeki
 * gibi olmasını istiyorum … widget verilerinden burada pozisyon açarken mantıklı
 * olabilecek şeyler"*. So Pro is laid out the way the portfolio is — and with
 * the portfolio's own components, not a lookalike: `PortfolioShell`,
 * `PortfolioInner`, `PortfolioColumns`, the eyebrow and the total. One design
 * language across the two full-screen views of this app.
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

/* The chart's plot box, inside its frame. The left gutter holds the price
 * axis, the right one the level tags; both are rem so they follow the text
 * size setting the way the labels in them do. */
const PRACTICE_PLOT = { top: 0.9, bottom: 1.9, left: 4.4, right: 8.4 };
/* The terminal's floor for the chart when a seam is dragged, and one arrow
   press on a seam. */
const PRACTICE_MIN_CHART = 320;
const PRACTICE_MIN_CHART_H = 200;
const PRACTICE_SPLIT_STEP = 16;
/* The share of the plot's height the price is drawn in when the bars carry
   volume; the volume has the fifth below it. */
const PRACTICE_PRICE_SHARE = 0.8;
/* The plot widths below which the chart's legend drops its volume note and
   its hint — measured on the legend's own text in Roboto Mono. */
const PRACTICE_LEGEND_VOLUME_W = 300;
const PRACTICE_LEGEND_PICK_W = 460;
/* Tags closer than this share of the plot height are pushed apart — two
 * levels a few dollars from each other are two labels on top of each other
 * otherwise, which is the one way a chart like this becomes unreadable. */
const PRACTICE_TAG_GAP = 7;

/* ── The crowd reading: a long/short lean that carries its own record ──────
 *
 * Asked for on 18 Sep 2026 as *"widget'lardan alabileceğimiz long/short
 * tahminlerine yardımcı bir algoritma"*. This codebase has measured what
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
  return { poc: mid(poc), vah: lo + (b + 1) * step, val: lo + a * step, share: held / total, bins, total };
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

/* **A press on nothing closes the page** (26 Sep 2026, *"futures kısmında
 * aktif olmayan yerlere tıklayınca kapanması gerekiyor, bu çalışmıyor"*).
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
    ]).then(([funding, oi, ls, liq, history, fundingHistory, oiHistory]) => {
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
      panel.setState({ pSide: k === "b" || k === "B" ? "long" : "short", pTab: "trade", pTicketWhy: null, pArm: null });
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

  /* **P6 — close all**, two presses, like every irreversible press on this
     screen. Each contract at its own market's price, in one transition; how
     many it closed is said, because a contract paused outside its currency
     is left and the count is how you know. It sits in the head of the panel
     the table is a tab of. */
  renderCloseAll: (n) => {
    if (!n || typeof panel.props.onPracticeCloseAll !== "function") return null;
    return React.createElement(
      AlertPosChip,
      {
        active: Boolean(panel.state.ppCloseAll),
        "data-practice-close-all": panel.state.ppCloseAll ? "armed" : "idle",
        onClick: () => {
          if (!panel.state.ppCloseAll) {
            panel.setState({ ppCloseAll: true });
            return;
          }
          panel.props.onPracticeCloseAll();
          panel.setState({ ppCloseAll: false, pOpen: null });
        },
      },
      panel.state.ppCloseAll
        ? msg("pp_close_all_sure", "Press again to close all $1", String(n))
        : msg("pp_close_all", "Close all"),
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
   * Asked for: *"tek sayfada böyle aşağıda bir şey kalsın istemiyorum …
   * hiçbir bilgi kaybolmadan"*. The venue's figures, the crowd reading and
   * the headlines were three cards stacked under the positions table, which
   * put the last of them ~1,100px below the fold on a 900px window. They are
   * the same three blocks, unchanged, behind one row of tabs: nothing is
   * summarised away and nothing is two presses from view.
   *
   * The tab that is on screen is remembered for the session only — which one
   * you were reading is a fact about this look at the page, not a setting. */
  /* **The account's value after every recorded event** (26 Sep 2026,
   * *"hesap değeri eğrisi"*). The series is the model's
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

  /* **The record as a file** (26 Sep 2026, *"işlem geçmişi dışa aktarma"*):
   * every event the ledger holds, as `practiceLedgerCsv` writes it. Beside
   * the two tabs that are drawn from it. */
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

  renderReadingTabs: (coin, marks) => {
    const practice = panel.props.practice;
    const held = practice ? practiceList(practice).length : 0;
    const closed = practice
      ? (practice.ledger || []).filter(
          (e) => e.kind === "close" || e.kind === "stop" || e.kind === "take" || e.kind === "liquidation",
        )
      : [];
    const tab = ["crowd", "news", "market", "closed", "value", "outlook", "assistant"].includes(panel.state.ppRead)
      ? panel.state.ppRead
      : held
        ? "positions"
        : "market";
    const tabs = [
      ...(held ? [["positions", msg("pp_read_positions", "Positions"), held]] : []),
      /* **What was closed, beside what is open** — asked for on 19 Sep 2026:
         the record belongs with the contracts, not on the ticket's desk. */
      ["closed", msg("pos_tab_closed", "Closed"), closed.length],
      /* **What the account is worth, event by event** — beside the record
         it is drawn from (26 Sep 2026). */
      ["value", msg("pp_read_value", "Account value")],
      /* **The assistant** — a desk's checks as facts, with a badge that
         counts what is missing and what has a clock on it. */
      ["assistant", msg("pp_read_assistant", "Assistant"), panel.assistantBadge(coin, marks)],
      ["market", msg("pp_read_market", "Market")],
      /* **Before a contract**: what this window says about the next stretch,
         counted — the cone, the regime, the location chain, and what
         followed the last times the market was here. */
      ["outlook", msg("pp_read_outlook", "Outlook")],
      ["crowd", msg("pp_read_crowd", "Crowd")],
      ["news", msg("pp_read_news", "Headlines")],
    ];
    return React.createElement(
      PracticePanel,
      { "data-practice-readings-card": tab },
      React.createElement(
        PracticeFolderTabs,
        { role: "tablist" },
        ...tabs.map(([v, label, count]) =>
          React.createElement(
            PracticeFolderTab,
            {
              key: v,
              role: "tab",
              active: tab === v,
              "aria-selected": tab === v,
              onClick: () => panel.setState({ ppRead: v }),
            },
            label,
            count ? React.createElement("span", null, String(count)) : null,
          ),
        ),
        tab === "positions"
          ? React.createElement("div", { "data-practice-folder-end": "true" }, panel.renderCloseAll(held))
          : tab === "closed" || tab === "value"
            ? React.createElement("div", { "data-practice-folder-end": "true" }, panel.renderLedgerExport())
            : null,
      ),
      tab === "positions"
        ? panel.renderPositionsTable(marks)
        : tab === "closed"
        ? panel.renderPracticeRecord(panel.props.practice, closed)
        : tab === "value"
        ? panel.renderAccountValue(marks)
        : tab === "market"
        ? React.createElement(
            PracticeMarketRow,
            { "data-practice-readings": "market" },
            React.createElement("div", null, panel.renderMarketContext(coin)),
            React.createElement(
              PracticeReadings,
              null,
              panel.renderMarketReadings(coin, marks),
            ),
          )
        : tab === "outlook"
          ? React.createElement(
              PracticeReadings,
              { "data-practice-readings": "outlook" },
              panel.renderOutlook(coin),
            )
        : tab === "assistant"
          ? React.createElement(
              PracticeReadings,
              { "data-practice-readings": "assistant" },
              panel.renderAssistant(coin, marks),
            )
        : tab === "crowd"
          ? React.createElement(
              Fragment,
              null,
              panel.renderCrowdReading(coin, true),
              panel.renderStructureReading(coin, true),
            )
          : React.createElement(
              PracticeReadings,
              { "data-practice-readings": "news" },
              panel.renderMarketReadings(coin, marks, "news"),
            ),
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
      else if (panel.props.onPracticeTriggers) {
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
  renderBookColumn: (coin) => {
    const tab = ["trades", "depth"].includes(panel.state.ppBookTab) ? panel.state.ppBookTab : "book";
    const trades = panel.state.tradesFor === coin ? panel.state.trades : null;
    const sym = panel.posSymbol();
    return React.createElement(
      Fragment,
      null,
      React.createElement(
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
      ),
      tab === "book"
        ? panel.renderOrderBook(coin)
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
      if (pos.take) out.push({ key: `p${id}`, kind: "take", price: pos.take, tag, pos, drag: true });
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

  /* **The market, with this account drawn across it.**
   *
   * The series is the one the main chart is drawing (`series`, the app's
   * `valueHistory`), so the range chips under it are the main chart's own
   * range: pressing 1W here re-reads the same history the chart behind the
   * page will show when it is closed. Framed and axed like the portfolio's
   * chart, because a line with no axis is a mood, not a reading.
   *
   * **A level outside the window is not pinned onto it as a line.** It is a
   * tag at the edge with an arrow, the way the main chart marks a
   * liquidation below the range — a line at the edge would draw a crossing
   * the window does not contain (`priceToChartY`'s rule). Everything in the
   * SVG is non-scaling and in a 1000-unit box, so the text never stretches:
   * the labels are HTML, placed by percentage over the same box. */
  renderMarketChart: (coin, marks) => {
    const series = panel.props.series;
    /* A price, so no unit: the market's quote currency is in the strip's
       name, and "USDT" on every axis label would be the only thing read. */
    const sym = panel.posPriceSign();
    if (!Array.isArray(series) || series.length < 2) {
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
    /* **Candles, as a venue draws its chart** (27 Sep 2026), when the
       series carries them — `fetchPerpSeries` keeps the whole bar now — and
       the style is not switched to a line. Volume under them, in the lower
       fifth, when the bars carry any: the price is drawn in the upper
       `priceH` of the plot so the two never cross. */
    const candles = panel.state.ppChartStyle !== "line" &&
      series.filter((p) => p.open > 0).length >= series.length * 0.9;
    const vmax = Math.max(0, ...series.map((p) => (p.vol > 0 ? p.vol : 0)));
    const priceH = vmax > 0 ? PRACTICE_PRICE_SHARE : 1;
    const prices = series.map((p) => p.price).filter((v) => isFinite(v));
    let lo = Math.min(...prices, ...(candles ? series.filter((p) => p.low > 0).map((p) => p.low) : []));
    let hi = Math.max(...prices, ...(candles ? series.filter((p) => p.high > 0).map((p) => p.high) : []));
    if (!(hi > lo)) {
      hi = lo * 1.001 + 1;
      lo = lo * 0.999 - 1;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    const t0 = +series[0].time;
    const t1 = +series[series.length - 1].time;
    /* Half a bar in from each edge when candles are drawn, so the first
       and the last are whole rather than cut down the middle. */
    const inset = candles ? 500 / series.length : 0;
    const X = (t) => (t1 > t0 ? inset + ((+t - t0) / (t1 - t0)) * (1000 - 2 * inset) : 1000);
    const Y = (v) => (1 - (v - lo) / (hi - lo)) * 1000 * priceH;
    const path = series
      .filter((p) => isFinite(p.price))
      .map((p, i) => `${i ? "L" : "M"}${X(p.time).toFixed(1)},${Y(p.price).toFixed(1)}`)
      .join("");
    const last = series[series.length - 1];
    /* The mark where this account holds something; otherwise the live price
       the ticket is quoting, and the series' own last point before either
       has arrived. */
    const markE4 = marks && marks[coin];
    const live = panel.props.livePrices && panel.props.livePrices[coin];
    const nowPrice = markE4 ? markE4 / PRICE_SCALE : live > 0 ? live : last.price;

    const ticks = scaleLinear().domain([lo, hi]).ticks(4);
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : hi - lo;

    /* Levels in the window become lines; the rest become edge tags. A level
       being dragged is drawn where the pointer has it (P4). */
    const drag = panel.state.ppDrag;
    const levels = panel.practiceLevels(coin).map((l) => {
      const v = drag && drag.key === l.key ? drag.v : l.price / PRICE_SCALE;
      const inside = v >= lo && v <= hi;
      return { ...l, v, y: inside ? Y(v) / 10 : v > hi ? 0 : 100 * priceH, inside };
    });
    /* The entry band: from each entry to the price now, in the colour of
       the result — the main chart's own reading, green where the contract
       is ahead and red where it is behind. */
    const bands = levels
      .filter((l) => l.kind === "entry" && l.inside)
      .map((l) => {
        const yNow = Y(Math.min(hi, Math.max(lo, nowPrice)));
        const ahead = l.side === "long" ? nowPrice >= l.v : nowPrice <= l.v;
        return React.createElement("rect", {
          key: `b${l.key}`,
          x: 0,
          width: 1000,
          y: Math.min(yNow, Y(l.v)),
          height: Math.abs(yNow - Y(l.v)),
          className: ahead ? "pp-band-up" : "pp-band-down",
        });
      });

    /* **The outlook's first horizon, at the right edge.** Where this
       window's own steps land, replayed — the 5th to 95th as a band and the
       25th to 75th inside it, clipped to the plot. Read off `outlookFacts`,
       which is memoised, so this costs the chart nothing. */
    const outlook = typeof panel.outlookFacts === "function" ? panel.outlookFacts(coin) : null;
    const coneQ = outlook && outlook.cone && outlook.cone.n && outlook.cone.horizons.length ? outlook.cone.horizons[0] : null;
    const clipY = (v) => Y(Math.min(hi, Math.max(lo, v)));
    const coneBands = coneQ && coneQ.p5 < hi && coneQ.p95 > lo
      ? [
          React.createElement("rect", { key: "cone", className: "pp-cone", x: 962, width: 38, y: clipY(coneQ.p95), height: Math.max(0, clipY(coneQ.p5) - clipY(coneQ.p95)), "data-practice-cone-band": outlook.horizons[0].label }),
          React.createElement("rect", { key: "cone-in", className: "pp-cone-inner", x: 962, width: 38, y: clipY(coneQ.p75), height: Math.max(0, clipY(coneQ.p25) - clipY(coneQ.p75)) }),
        ]
      : [];

    /* **The assistant's hint** — the band of ordinary steps and the level
       an item is about, while the item is looked at or pinned. */
    const focus = panel.state.ppFocus;
    const focusBands = focus
      ? [
          ...(focus.band && focus.band[1] > lo && focus.band[0] < hi
            ? [React.createElement("rect", { key: "focus-band", className: "pp-focus-band", x: 0, width: 1000, y: clipY(focus.band[1]), height: Math.max(0, clipY(focus.band[0]) - clipY(focus.band[1])), "data-practice-focus": focus.key })]
            : []),
          ...(focus.level > 0 && focus.level >= lo && focus.level <= hi
            ? [React.createElement("line", { key: "focus-level", className: "pp-focus-level", x1: 0, x2: 1000, y1: Y(focus.level), y2: Y(focus.level) })]
            : []),
        ]
      : [];

    /* Tags: every level plus the price now, sorted and pushed apart. */
    const nowE4Here = Math.round(nowPrice * PRICE_SCALE);
    const startDrag = (l) => (e) => {
      const plot = e.currentTarget.closest("[data-practice-plot]");
      if (!plot) return;
      e.preventDefault();
      const box = plot.getBoundingClientRect();
      /* The price is drawn in the plot's upper `priceH`; the volume has
         the rest, and a level dropped there is at the window's low. */
      const at = (clientY) => {
        const f = Math.min(1, Math.max(0, (clientY - box.top) / Math.max(1, box.height * priceH)));
        return hi - f * (hi - lo);
      };
      panel.setState({ ppDrag: { key: l.key, v: at(e.clientY) }, ppDragWhy: null });
      const move = (ev) => {
        cancelAnimationFrame(panel._ppDragRaf);
        panel._ppDragRaf = requestAnimationFrame(() => {
          if (!panel._gone) panel.setState({ ppDrag: { key: l.key, v: at(ev.clientY) } });
        });
      };
      const up = (ev) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        cancelAnimationFrame(panel._ppDragRaf);
        /* The click that follows a drag lands on the plot (the nearest
           box holding both ends of it) — it is the drag's, not a pick. */
        panel._ppDragAt = Date.now();
        if (panel._gone) return;
        panel.commitLevelDrag(l, Math.round(at(ev.clientY) * PRICE_SCALE), nowE4Here);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    const tags = [
      ...levels.map((l) => ({
        key: l.key,
        kind: l.kind,
        drag: l.drag && l.inside ? startDrag(l) : null,
        y: l.y,
        /* A tenth of the axis step: the axis can say $100.0K, a level
           cannot — an entry at 100,050 and one at 100,000 are different
           contracts. */
        text: `${l.inside ? "" : l.v > hi ? "↑ " : "↓ "}${l.word || practiceLevelWord(l.kind)} ${formatAxisPrice(l.v, step / 10, sym)}`,
        title: `${l.tag} · ${practicePriceText(l.price, sym)}`,
      })),
      {
        key: "now",
        kind: "now",
        y: Y(Math.min(hi, Math.max(lo, nowPrice))) / 10,
        text: formatAxisPrice(nowPrice, step / 10, sym),
        title: msg("pp_tag_now", "The price the account is marked at"),
      },
    ].sort((a, b) => a.y - b.y);
    /* Contracts opened at the same price have the same entry and the same
       liquidation: one tag with a count, not the same words twice.
       **Both sides are stripped of the count before they are compared** —
       comparing a plain tag with one that had already been merged left the
       third contract drawing "entry 100.05K" under "entry 100.05K ×2". */
    const bare = (t) => t.replace(/ ×\d+$/, "");
    const howMany = (t) => Number((t.match(/ ×(\d+)$/) || [])[1]) || 1;
    for (let i = tags.length - 1; i > 0; i--) {
      const a = tags[i - 1];
      const b = tags[i];
      if (a.kind === b.kind && bare(a.text) === bare(b.text) && Math.abs(a.y - b.y) < 0.01) {
        a.text = `${bare(a.text)} ×${howMany(a.text) + howMany(b.text)}`;
        a.title = `${a.title}, ${b.title}`;
        tags.splice(i, 1);
      }
    }
    // Measured on the plot as drawn — see measureBody in alerts.js
    const tagGap = panel.state.ppTagGap || PRACTICE_TAG_GAP;
    for (let i = 1; i < tags.length; i++) {
      if (tags[i].y - tags[i - 1].y < tagGap) tags[i].y = tags[i - 1].y + tagGap;
    }
    /* Pushed off the bottom: walk back up so the last tag stays inside. */
    for (let i = tags.length - 1; i >= 0; i--) {
      const ceiling = i === tags.length - 1 ? 100 : tags[i + 1].y - tagGap;
      if (tags[i].y > ceiling) tags[i].y = ceiling;
    }

    /* **The cursor: a point in the window, and what has happened since.**
     *
     * Asked for as a way to read the recent past from the chart itself. The
     * readout answers the question a point on a price chart is pointed at
     * for — *where was it then, and what has it done since* — with the
     * change to the price now and the highest and lowest it went in between.
     * Measured on the series on screen, so it costs no request; never a
     * forecast, only what the window already contains. State holds the
     * point's *time*, not its index, so a refreshed series re-finds it. */
    const hoverT = panel.state.ppHover;
    let cursor = null;
    if (hoverT != null && hoverT >= t0 && hoverT <= t1) {
      const i = nearestIndex(series, hoverT);
      const p = series[i];
      if (p && isFinite(p.price)) {
        let upTo = -Infinity;
        let downTo = Infinity;
        for (let k = i; k < series.length; k++) {
          const v = series[k].price;
          if (v > upTo) upTo = v;
          if (v < downTo) downTo = v;
        }
        cursor = {
          x: X(p.time) / 10,
          y: Y(p.price) / 10,
          time: p.time,
          price: p.price,
          bar: candles && p.open > 0 ? p : null,
          change: nowPrice - p.price,
          pct: ((nowPrice - p.price) / p.price) * 100,
          upTo,
          downTo,
        };
      }
    }
    /* Only when the nearest point changes: this panel is large, and a
       re-render per mouse event would be one per pixel travelled. */
    const onMove = (e) => {
      const box = e.currentTarget.getBoundingClientRect();
      const px = ((e.clientX - box.left) / Math.max(1, box.width)) * 1000;
      const f = Math.min(1, Math.max(0, (px - inset) / Math.max(1, 1000 - 2 * inset)));
      const t = t0 + f * (t1 - t0);
      cancelAnimationFrame(panel._ppRaf);
      panel._ppRaf = requestAnimationFrame(() => {
        const at = +series[nearestIndex(series, t)].time;
        if (panel.state.ppHover !== at) panel.setState({ ppHover: at });
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(panel._ppRaf);
      if (panel.state.ppHover != null) panel.setState({ ppHover: null });
    };
    /* **A press on the chart prices a limit there** (27 Sep 2026) — the way
       a venue's chart takes an order price. Below the price is where a long
       rests and above it a short, so the side follows; the price is rounded
       to the book's tick. Nothing is placed: the ticket's button is still
       the order. The volume band and a press that ended a drag are not
       picks. */
    const onPick = (e) => {
      if (panel._ppDragAt && Date.now() - panel._ppDragAt < 400) return;
      if (e.target && e.target.closest && e.target.closest("[data-practice-tag]")) return;
      const box = e.currentTarget.getBoundingClientRect();
      const f = (e.clientY - box.top) / Math.max(1, box.height * priceH);
      if (!(f >= 0 && f <= 1)) return;
      panel.pickChartPrice(hi - f * (hi - lo), nowPrice, step / 100);
    };

    /* The bars: a wick from high to low and a body from open to close,
       green where the bar closed up and red where it closed down — the
       app's up and down inks, which the theme already carries for both
       palettes. crispEdges snaps each edge to a pixel, so a 3px body at a
       fractional x is 3px rather than a smear across four. */
    const barW = (1000 / series.length) * 0.64;
    const candleMarks = candles
      ? series.map((p, i) => {
          if (!(p.open > 0)) return null;
          const up = p.price >= p.open;
          const x = X(p.time);
          const top = Y(Math.max(p.open, p.price));
          const bottom = Y(Math.min(p.open, p.price));
          return React.createElement(
            "g",
            { key: `c${i}`, className: up ? "pp-candle-up" : "pp-candle-down" },
            React.createElement("line", { x1: x, x2: x, y1: Y(p.high), y2: Y(p.low) }),
            React.createElement("rect", { x: x - barW / 2, width: barW, y: top, height: Math.max(bottom - top, 1.2) }),
          );
        })
      : [];
    const volumeBars = vmax > 0
      ? series.map((p, i) => {
          if (!(p.vol > 0)) return null;
          const h = (p.vol / vmax) * 1000 * (1 - priceH) * 0.92;
          const up = p.open > 0 ? p.price >= p.open : i === 0 || p.price >= series[i - 1].price;
          return React.createElement("rect", {
            key: `v${i}`,
            className: up ? "pp-vol-up" : "pp-vol-down",
            x: X(p.time) - barW / 2,
            width: barW,
            y: 1000 - h,
            height: h,
          });
        })
      : [];
    const bar = (PERP_SERIES_BARS[panel.props.period] || [])[0];

    const span = t1 - t0;
    const fmt = (t) =>
      new Date(t).toLocaleString(intlTag(activeLocale()),
        span <= 2 * 86400e3
          ? { hour: "2-digit", minute: "2-digit" }
          : span <= 120 * 86400e3
            ? { month: "short", day: "numeric" }
            : { month: "short", year: "numeric" });

    return React.createElement(
      PracticeChartFrame,
      { "data-practice-chart": coin },
      React.createElement(
        PracticePlot,
        {
          plot: PRACTICE_PLOT,
          onMouseMove: onMove,
          onMouseLeave: onLeave,
          onClick: onPick,
          /* **The cursor from the keyboard.** Focused, the plot reads the
             last bar; ←/→ walk the bars (Home, End), and Enter prices a
             limit at the bar read — the press's own equivalent, and the
             readout, which was the mouse's alone. */
          tabIndex: 0,
          role: "group",
          "aria-label": msg("pp_plot_aria", "The chart — arrow keys read the bars, Enter prices a limit at the one read"),
          "data-owns-arrows": "true",
          onFocus: () => {
            if (panel.state.ppHover == null) panel.setState({ ppHover: +series[series.length - 1].time });
          },
          onBlur: () => {
            if (panel.state.ppHover != null) panel.setState({ ppHover: null });
          },
          onKeyDown: (e) => {
            const at = panel.state.ppHover != null ? nearestIndex(series, panel.state.ppHover) : series.length - 1;
            const to =
              e.key === "ArrowLeft" ? at - 1
              : e.key === "ArrowRight" ? at + 1
              : e.key === "Home" ? 0
              : e.key === "End" ? series.length - 1
              : null;
            if (to != null) {
              e.preventDefault();
              const i = Math.max(0, Math.min(series.length - 1, to));
              panel.setState({ ppHover: +series[i].time });
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const p = series[Math.max(0, Math.min(series.length - 1, at))];
              if (p && p.price > 0) panel.pickChartPrice(p.price, nowPrice, step / 100);
            }
          },
          "data-practice-plot": "true",
        },
        React.createElement(
          "svg",
          {
            viewBox: "0 0 1000 1000",
            preserveAspectRatio: "none",
            role: "img",
            "aria-label": msg(
              "pp_chart_aria",
              "$1 over the range on the chart, with this account's levels drawn across it",
              coin,
            ),
          },
          ...ticks.map((v) =>
            React.createElement("line", {
              key: `g${v}`,
              x1: 0,
              x2: 1000,
              y1: Y(v),
              y2: Y(v),
              className: "pp-grid",
            }),
          ),
          ...bands,
          ...coneBands,
          ...focusBands,
          ...volumeBars,
          ...(candles ? candleMarks : [React.createElement("path", { key: "line", d: path, className: "pp-line" })]),
          ...levels
            .filter((l) => l.inside)
            .map((l) =>
              React.createElement("line", {
                key: l.key,
                x1: 0,
                x2: 1000,
                y1: Y(l.v),
                y2: Y(l.v),
                className: `pp-level pp-${l.kind}`,
              }),
            ),
          cursor
            ? React.createElement("line", {
                x1: cursor.x * 10,
                x2: cursor.x * 10,
                y1: 0,
                y2: 1000,
                className: "pp-cursor",
              })
            : null,
        ),
        cursor
          ? React.createElement(PracticeCursorDot, {
              style: { left: `${cursor.x}%`, top: `${cursor.y}%` },
            })
          : null,
        cursor
          ? React.createElement(
              PracticeReadout,
              {
                "data-practice-readout": "true",
                /* Beside the line, on whichever side has the room. */
                style: cursor.x > 55
                  ? { right: `${100 - cursor.x}%`, marginRight: "0.6rem" }
                  : { left: `${cursor.x}%`, marginLeft: "0.6rem" },
              },
              React.createElement("span", null, crosshairDate(cursor.time, panel.props.period)),
              /* The price in full: this is the one place on the chart that is
                 read for an exact figure rather than a shape. */
              React.createElement("strong", null, practicePriceText(Math.round(cursor.price * PRICE_SCALE), sym)),
              React.createElement(
                PracticeReadoutLine,
                { tone: cursor.change > 0 ? "up" : cursor.change < 0 ? "down" : null },
                msg(
                  "pp_since",
                  "$1 since · $2",
                  `${cursor.pct >= 0 ? "+" : ""}${cursor.pct.toFixed(2)}%`,
                  `${cursor.change >= 0 ? "+" : "−"}${formatAxisPrice(Math.abs(cursor.change), step / 100, sym)}`,
                ),
              ),
              React.createElement(
                PracticeReadoutLine,
                null,
                msg(
                  "pp_since_range",
                  "high $1 · low $2",
                  formatAxisPrice(cursor.upTo, step / 100, sym),
                  formatAxisPrice(cursor.downTo, step / 100, sym),
                ),
              ),
              /* The bar itself, on a candle chart: what a venue's crosshair
                 prints first. */
              cursor.bar
                ? React.createElement(
                    PracticeReadoutLine,
                    { "data-practice-readout-bar": "true" },
                    msg(
                      "pp_readout_ohlc",
                      "O $1 H $2 L $3 C $4",
                      formatAxisPrice(cursor.bar.open, step / 100, sym),
                      formatAxisPrice(cursor.bar.high, step / 100, sym),
                      formatAxisPrice(cursor.bar.low, step / 100, sym),
                      formatAxisPrice(cursor.bar.price, step / 100, sym),
                    ),
                  )
                : null,
              cursor.bar && cursor.bar.vol > 0
                ? React.createElement(
                    PracticeReadoutLine,
                    null,
                    msg("pp_readout_vol", "volume $1 $2", practiceQtyText(Math.round(cursor.bar.vol * QTY_SCALE)), coin),
                  )
                : null,
            )
          : null,
        ...ticks.map((v) =>
          React.createElement(
            PracticeAxisY,
            { key: `y${v}`, style: { top: `${Y(v) / 10}%` } },
            formatAxisPrice(v, step, sym),
          ),
        ),
        ...[0, 1 / 3, 2 / 3, 1].map((f) =>
          React.createElement(
            PracticeAxisX,
            { key: `x${f}`, style: { left: `${X(t0 + (t1 - t0) * f) / 10}%` }, edge: f === 0 ? "start" : f === 1 ? "end" : null, mid: f !== 0 && f !== 1 },
            fmt(t0 + (t1 - t0) * f),
          ),
        ),
        /* **What the chart is** — the bar, the style and where the volume
           is — in its corner, because a chart that does not say what it
           draws is not read correctly (the owner's rule 8). */
        React.createElement(
          PracticeChartLegend,
          { "data-practice-chart-legend": candles ? "candles" : "line" },
          candles
            ? msg("pp_legend_candles", "$1 candles · OKX", bar || "")
            : msg("pp_legend_line", "$1 closes · OKX", bar || ""),
          /* What fits the plot's width (measureBody's ppPlotW; unmeasured,
             all of it): the volume from 300px, the hint from 460px. */
          vmax > 0 && !(panel.state.ppPlotW < PRACTICE_LEGEND_VOLUME_W)
            ? React.createElement("span", { "data-legend-volume": "true" }, ` · ${msg("pp_legend_volume", "volume in $1 below", coin)}`)
            : null,
          !(panel.state.ppPlotW < PRACTICE_LEGEND_PICK_W)
            ? React.createElement("span", { "data-legend-pick": "true" }, ` · ${msg("pp_legend_pick", "click a price for a limit")}`)
            : null,
        ),
        ...tags.map((t) =>
          React.createElement(
            PracticeTag,
            {
              key: `tag${t.key}`,
              kind: t.kind,
              drag: Boolean(t.drag),
              title: t.drag
                ? msg("pp_drag_hint", "$1 — drag to move it; the contract's card edits it by keyboard", t.title)
                : t.title,
              "data-practice-tag": t.key,
              onPointerDown: t.drag || undefined,
              style: { top: `${t.y}%` },
            },
            t.text,
          ),
        ),
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
    if (t && t.high24h && t.low24h) {
      cells.push(["high", msg("pp_strip_high", "24h high"), practicePriceText(Math.round(t.high24h * PRICE_SCALE), sym), null]);
      cells.push(["low", msg("pp_strip_low", "24h low"), practicePriceText(Math.round(t.low24h * PRICE_SCALE), sym), null]);
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
    /* The market's name and the chart's range on one line — the range is a
       control *of this chart*, so it sits at the chart's head rather than
       floating under it — then the figures. */
    return React.createElement(
      Fragment,
      null,
      React.createElement(
        PracticeMarketHead,
        null,
        React.createElement("strong", null, msg("pp_strip_perp", "$1 perpetual", `${coin}${PRACTICE_CURRENCY}`)),
        panel.renderMarketPeriods(),
      ),
      cells.length
        ? React.createElement(
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
          )
        : null,
      panel.renderChartFlags(coin, marks),
    );
  },

  /* **The assistant, on the chart.** Its missing and watch items as chips
     under the strip — the four that matter most, each opening the tab. A
     chart with nothing to raise carries no row at all. */
  renderChartFlags: (coin, marks) => {
    if (typeof assistantReadings !== "function") return null;
    const ctx = panel.assistantContext(coin, marks);
    const r = assistantReadings(ctx);
    const items = [...r.before, ...r.during.flatMap((c) => c.items.map((i) => ({ ...i, contract: c })))]
      .filter((i) => i.kind !== "note")
      .slice(0, 4);
    if (!items.length) return null;
    return React.createElement(
      PracticeChartFlags,
      { "data-practice-chart-flags": String(items.length) },
      ...items.map((item) => {
        const [title] = panel.assistantWords(item, ctx);
        return React.createElement(
          PracticeChartFlag,
          {
            key: `${item.contract ? item.contract.pos + "-" : ""}${item.key}`,
            kind: item.kind,
            "data-practice-chart-flag": item.kind,
            title: msg("pp_flag_open", "Open the assistant"),
            onMouseEnter: () => panel.assistantFocus(item, item.contract || null, false),
            onMouseLeave: () => panel.assistantBlur(),
            onClick: () => panel.setState({ ppRead: "assistant" }),
          },
          React.createElement("b", null, item.kind === "missing" ? msg("as_kind_missing", "Missing") : msg("as_kind_watch", "Watch")),
          title,
        );
      }),
    );
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
    if (start.which === "desk") {
      /* Traded between the two: the book gains what the ticket gives, so
         the seam follows the pointer and the chart does not move. */
      const dMin = Math.max(start.desk - deskHi, bookLo - start.book);
      const dMax = Math.min(start.desk - deskLo, bookHi - start.book);
      const move = Math.min(Math.max(d, dMin), Math.max(dMin, dMax));
      return { book: Math.round(start.book + move), desk: Math.round(start.desk - move) };
    }
    return { bottom: clamp(start.bottom - d, botLo, Math.min(botHi, start.gridH - PRACTICE_SPLIT_PX - PRACTICE_MIN_CHART_H)) };
  },

  ppPaintLayout: (layout) => {
    const grid = panel.ppGridNode;
    if (!grid) return;
    for (const key of ["book", "desk", "bottom"]) {
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
          : msg("pp_split_bottom", "Positions panel height");
    const [lo, hi] = PRACTICE_LAYOUT_LIMITS[which];
    return React.createElement(PracticeSplit, {
      area: which === "book" ? "splitA" : which === "desk" ? "splitB" : "splitC",
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
      onDoubleClick: () => panel.ppCommitLayout({}, which === "desk" ? ["book", "desk"] : [which]),
      onKeyDown: panel.ppSplitKey(which),
    });
  },

  /* The grid's variables from the stored layout — what the drag paints
     directly is the same three names. */
  ppLayoutStyle: () => {
    const layout = panel.state.ppLayout || {};
    const style = {};
    for (const key of ["book", "desk", "bottom"]) {
      if (layout[key] > 0) style[`--pp-${key}`] = `${layout[key]}px`;
    }
    return style;
  },

  /* **The derivatives market's settings, on the derivatives market**
   * (27 Sep 2026, *"futures'ın ayarları da yine burada bulunsun"*). They were
   * in three places — Settings → Features for the contract strip and the
   * confirmation, the Account tab for the alarm, and the page's own chips
   * for the chart — and a person on this page reached two of them by
   * leaving it. One sheet now, from the head: the page (chart style and
   * the terminal's seams), the order confirmation, the strip on the main
   * chart, the alarm, and the way to the account's own settings.
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
    const stored = Object.keys(layout).length > 0;
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
      /* The page: how the chart draws and where the seams are. */
      React.createElement(
        PracticeSettingsGroup,
        { "data-practice-settings-group": "page" },
        React.createElement(PracticeSettingsLabel, null, msg("pp_settings_page", "This page")),
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
            msg(
              "pp_settings_layout",
              "Sizes — book $1 · ticket $2 · panel $3",
              size("book"),
              size("desk"),
              size("bottom"),
            ),
          ),
          React.createElement(
            AlertPosChip,
            {
              disabled: !stored,
              "data-practice-layout-reset": "true",
              onClick: () => {
                panel.ppPaintLayout({});
                panel.ppCommitLayout({}, ["book", "desk", "bottom"]);
              },
            },
            msg("pp_settings_reset", "Reset layout"),
          ),
        ),
        React.createElement(
          PracticeSettingsNote,
          null,
          msg(
            "pp_settings_layout_note",
            "Drag the seams between the chart, the book, the ticket and the panel below to resize them — or focus one with Tab and use the arrow keys. A double-click on a seam puts its default back. The sizes are kept on this device; on a window under 1280 pixels the page is one column and they wait.",
          ),
        ),
      ),
      React.createElement(PracticeSettingsGroup, { "data-practice-settings-group": "orders" }, row("practiceConfirm")),
      React.createElement(PracticeSettingsGroup, { "data-practice-settings-group": "dock" }, row("practiceDock")),
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
              panel.setState({ pTab: "account", pReset: null });
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

  renderPracticePage: (onClose) => {
    const practice = panel.props.practice;
    const coin = panel.props.activeCoin;
    const marks = panel.practiceMarkMap();
    const open = practice ? Object.keys(practice.positions || {}).length : 0;
    const ready = practice && panel.props.practiceEnabled !== false && panel.props.practiceConsent;
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
      React.createElement(
        PracticeScreenHead,
        { "data-practice-head": "true" },
        React.createElement("h2", null, msg("pos_title", "Derivatives Market"), keyCap("F")),
        React.createElement(
          "span",
          null,
          `${msg("pp_usdt_margined", "USDT-margined")} · ${msg("pos_badge", "Simulated · no real money")}`,
        ),
      ),
      React.createElement(
        PracticeInner,
        /* The hook the render tests measure the derivatives screen's width
           by — the card's, when it was a card. */
        { empty: !ready, "data-alerts-card": "true" },
        React.createElement(
          PracticeHeader,
          null,
          React.createElement(
            PortfolioHeadRow,
            null,
            React.createElement(
              PracticeHeadMain,
              null,
              React.createElement(
              "div",
              null,
              /* The account's name and kind moved up into the screen's head
                 (PracticeScreenHead); the balance leads this block now. */
              ready
                ? React.createElement(
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
                  )
                : null,
              ready
                ? React.createElement(
                    PortfolioDelta,
                    { up: null, "data-practice-head-free": open ? "true" : undefined },
                    open
                      ? `${panel.freeText(practice, coin)} · ${msg("pos_n_open", "$1 open", String(open))}`
                      : msg("pp_equity_note", "Equity — nothing committed"),
                  )
                : null,
              ),
              /* Beside the equity rather than under it: stacked, the three
                 figures pushed the desk 83px down and the ticket's price
                 fields under its own sticky foot at 1440×900. */
              ready ? panel.renderAccountResult(practice, marks, coin) : null,
            ),
            React.createElement(
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
            ),
          ),
        ),
        /* The card that says what the screen cannot: the three costs, the
           walls the account can be stopped by, and the live funding rate —
           fetched when the card opens and nowhere else. */
        panel.state.info ? panel.renderFuturesInfo() : null,
        ready && panel.state.ppSettings ? panel.renderPageSettings() : null,
        ready
          ? React.createElement(
              PracticeColumns,
              {
                "data-practice-columns": "true",
                innerRef: (n) => (panel.ppGridNode = n),
                style: panel.ppLayoutStyle(),
              },
              /* **The terminal** — see PracticeColumns. Four areas and the
                 three seams between them; below the wide breakpoint the
                 areas are not boxes at all and the page is the one column
                 it always was. DOM order is the market's side first —
                 chart, book, what is open — then the ticket, which is the
                 order Tab walks and the order it always had. */
              React.createElement(
                PracticeCell,
                { area: "chart", "data-practice-cell": "chart" },
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
              panel.renderSplit("book"),
              React.createElement(
                PracticeCell,
                { area: "book", "data-practice-cell": "book" },
                React.createElement(
                  PracticeColBook,
                  { "data-practice-book-card": "true" },
                  panel.renderBookColumn(coin),
                ),
              ),
              panel.renderSplit("bottom"),
              React.createElement(
                PracticeCell,
                { area: "bottom", "data-practice-cell": "bottom" },
                panel.renderReadingTabs(coin, marks),
              ),
              panel.renderSplit("desk"),
              React.createElement(
                PracticeCell,
                { area: "desk", "data-practice-cell": "desk" },
                React.createElement(PracticeDesk, { "data-practice-desk": "true" }, panel.renderFuturesBody(true)),
              ),
            )
          : React.createElement(PracticeDesk, { "data-practice-desk": "true" }, panel.renderFuturesBody(true)),
      ),
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
