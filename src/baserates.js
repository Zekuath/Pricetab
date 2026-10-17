/* BASE RATES — "has this happened before, and how often?"
 *
 * This panel is what got built instead of buy and sell signals, and the reason
 * is measured rather than tasteful. the working notes §9 has the working;
 * the short version is three findings that all point the same way:
 *
 *   - Nine textbook rules over **21,669 daily closes on eight coins**: 7 raw
 *     p<0.05 where chance gives about 4, and **0 of 70 survive
 *     Holm–Bonferroni**. In/out-of-sample rank correlation +0.42. Donchian's
 *     median return runs +259% to +1175% across neighbouring lookbacks nobody
 *     can justify in advance.
 *   - The published literature agrees once data-snooping controls are applied:
 *     a 2017–2023 study of BTC and ETH under White's reality check found that
 *     *"previously profitable technical approaches… generally failed to
 *     generate profits during the subsequent out-of-sample period."*
 *   - Measured live on 22 Aug 2026, the textbook labels point the **wrong
 *     way**: after RSI 14 crosses 70 — the "sell" line — the next thirty days
 *     beat the coin's own ordinary month on four of six coins, BTC by 7.5
 *     percentage points over 92 episodes. The sign flips by coin.
 *
 * So there is no arrow on this screen and no advice. There is a count.
 *
 * **The design rule, and it is the whole feature: never a rate without its
 * denominator.** In two years of candles these conditions fire three to nine
 * times, so "up 90% of the time" is a sample of ten wearing a percentage sign.
 * The commonest honest answer here is *not enough to say anything*, and this
 * panel is built so that answer reads as it working rather than as it failing:
 * `BASE_RATE_MIN_EPISODES` decides when a comparison is printed at all, and the
 * count sits beside every figure at almost the same weight.
 *
 * There is also a compliance reason, which is not taste either.
 * Chrome Web Store policy bans gambling outright and the extension's declared
 * single purpose is *crypto price charts*. A buy point moves it to investment
 * advice; a count of what has happened does not.
 */

// How far ahead each row looks. Two horizons, because "it went up next week"
// and "it went up next month" are different claims and both get asked.
const BASE_RATE_HORIZONS = [
  { days: 7, label: msg("br_next_7", "next 7 days") },
  { days: 30, label: msg("br_next_30", "next 30 days") },
];

/* The states worth counting.
 *
 * The two RSI pairs are here **because they are the ones people have been
 * told to act on** — printing what actually followed them is the point. The
 * 200-day line is here because it is the one thing the sector research came
 * back with that is not an entry signal: institutions read it as a regime,
 * and a regime is a description of where you are, not an instruction.
 */
const BASE_RATE_STATES = [
  {
    id: "rsi-hot",
    title: msg("br_rsi_above_70", "RSI above 70"),
    note: msg("br_note_overbought", "the line usually called overbought"),
    test: (v) => v != null && v > 70,
  },
  {
    id: "rsi-veryhot",
    title: msg("br_rsi_above_80", "RSI above 80"),
    note: msg("br_note_further", "the same line, further out"),
    test: (v) => v != null && v > 80,
  },
  {
    id: "rsi-cold",
    title: msg("br_rsi_below_30", "RSI below 30"),
    note: msg("br_note_oversold", "the line usually called oversold"),
    test: (v) => v != null && v < 30,
  },
  {
    id: "rsi-verycold",
    title: msg("br_rsi_below_20", "RSI below 20"),
    note: msg("br_note_further", "the same line, further out"),
    test: (v) => v != null && v < 20,
  },
];

/* A simple moving average over `period` closes, aligned with the series so
 * index i is the average of the i-th close and the ones before it. */
const movingAverage = (closes, period) => {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
};

// `edge` is a difference of medians, not a difference of up shares.
const describeEdge = (edge) => {
  if (edge == null) return null;
  const rounded = Number(edge.toFixed(1));
  if (rounded === 0) {
    return msg("br_edge_none", "no different from an ordinary stretch");
  }
  return rounded > 0
    ? msg(
        "br_edge_above",
        "a typical move $1 points above an ordinary stretch",
        Math.abs(rounded).toFixed(1),
      )
    : msg(
        "br_edge_below",
        "a typical move $1 points below an ordinary stretch",
        Math.abs(rounded).toFixed(1),
      );
};

/* The sign comes from the **rounded** figure, never the raw one.
 *
 * The same defect was fixed once already, in the portfolio's benchmark: a gap
 * of −0.04 printed as "−0.0 pts", a direction claimed by a number that has no
 * direction left once it is rounded. Anything that rounds to zero is a dead
 * heat and is shown as one. */
const formatSigned = (value, digits = 1) => {
  const shown = Number(value.toFixed(digits));
  if (shown === 0) return `${(0).toFixed(digits)}%`;
  return `${shown > 0 ? "+" : "−"}${Math.abs(shown).toFixed(digits)}%`;
};

class BaseRatesPanel extends PureComponent {
  constructor(props) {
    super(props);
    /* `closes` is the deep daily series for the coin on screen. Null until
     * asked for: it costs about seventeen requests and 237 KB, which is right
     * for a coin somebody is studying and absurd for all 81, so nothing is
     * fetched until this panel is opened. */
    /* `candles` is the deep **daily OHLC** series for the coin on screen —
     * closes alone until 22 Sep 2026, when the candlestick patterns needed a
     * body and two wicks to look at. The closes the RSI rows count are
     * derived from it, so both readings come out of one request. */
    this.state = {
      candles: null,
      loading: false,
      failed: false,
      coin: null,
      cpi: null,
      sections: [],
      section: 0,
      tab: "now",
      horizon: 0,
      selected: "",
      query: "",
      sort: "default",
      liveOnly: false,
    };
    this.load = this.load.bind(this);
    this.bodyRef = null;
    this.onBodyScroll = this.onBodyScroll.bind(this);
    this.onTabKey = this.onTabKey.bind(this);
  }

  componentDidMount() {
    this.load();
    this.findSections();
    if (this.tabRef) this.tabRef.addEventListener("keydown", this.onTabKey);
  }

  componentDidUpdate(prev, prevState) {
    // The panel follows the chart: switch coin underneath it and it re-reads
    if (prev.coin !== this.props.coin) this.load();
    this.findSections();
    // The index keeps the section you are in within its own row
    if (prevState && prevState.section !== this.state.section) this.revealChip(this.state.section);
  }

  /* **The index says where you are** (12 Oct 2026): the section whose head
     has passed under the index is the one lit. Two columns put two heads at
     once near the top — the lower of those that have passed wins. One read a
     frame, however fast the wheel turns. */
  onBodyScroll() {
    if (this._spy) return;
    this._spy = requestAnimationFrame(() => {
      this._spy = 0;
      const body = this.bodyRef;
      if (!body || this._gone) return;
      const nav = body.querySelector("[data-base-nav]");
      const line = (nav ? nav.getBoundingClientRect().bottom : body.getBoundingClientRect().top) + 72;
      let best = 0;
      let bestTop = -Infinity;
      body.querySelectorAll("[data-base-section]").forEach((n, i) => {
        const top = n.getBoundingClientRect().top;
        if (top <= line && top > bestTop) {
          best = i;
          bestTop = top;
        }
      });
      if (best !== this.state.section) this.setState({ section: best });
    });
  }

  revealChip(i) {
    const nav = this.bodyRef && this.bodyRef.querySelector("[data-base-nav]");
    const chip = nav && nav.children[i];
    if (!chip) return;
    const left = chip.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + chip.offsetWidth > nav.scrollLeft + nav.clientWidth) {
      nav.scrollLeft = Math.max(0, left - 24);
    }
  }

  /* **The index reads the sections the panel drew** (11 Oct 2026): every
     section label carries `data-base-section`, so the index is the screen's
     own headings in its own language, in its own order — nothing to keep in
     step by hand. Written only when the list changes, so it cannot loop. */
  findSections() {
    const body = this.bodyRef;
    if (!body || !body.querySelectorAll) return;
    const found = [...body.querySelectorAll("[data-base-section]")]
      .map((n) => (n.textContent || "").split(" · ")[0].trim())
      .filter(Boolean);
    if (found.join("|") !== this.state.sections.join("|")) this.setState({ sections: found });
  }

  // Scrolled to just under the index, whose height depends on how it wraps
  goToSection(i) {
    const body = this.bodyRef;
    const node = body && body.querySelectorAll("[data-base-section]")[i];
    if (!node) return;
    const nav = body.querySelector("[data-base-nav]");
    const navH = nav ? nav.getBoundingClientRect().height : 0;
    const top = node.getBoundingClientRect().top - body.getBoundingClientRect().top - navH - 12;
    const still = typeof reducedMotion === "function" && reducedMotion();
    body.scrollBy({ top, behavior: still ? "auto" : "smooth" });
  }

  /* One counted bar, its uncertainty, and the ordinary share as a tick.
     The reference used to take a second bar for every comparison. */
  renderBars(self, base) {
    const [, up, , n] = self;
    if (n < BASE_RATE_MIN_EPISODES) return React.createElement(BaseVerdict, { weak: true },
      msg("br_too_few", "$1 episodes is too few to compare — the difference is not printed.", String(n)));
    const interval = n >= BASE_RATE_MIN_EPISODES ? wilsonInterval(Math.round(up * n / 100), n) : null;
    const quiet = !interval || (base[1] >= interval.lo * 100 && base[1] <= interval.hi * 100);
    const describe = ([label, share, median, count]) => `${label}: ` + (median == null
      ? msg("br_bar_up", "up $1% · $2×", share.toFixed(0), String(count))
      : msg("br_bar_value", "up $1% · $2 typically · $3×", share.toFixed(0), formatSigned(median), String(count)));
    const chance = interval && quiet ? msg("br_within_chance", "within what chance gives") : "";
    const uncertainty = interval ? msg("br_interval", "Wilson 95% interval: $1–$2%", (interval.lo * 100).toFixed(1), (interval.hi * 100).toFixed(1)) : "";
    const name = [describe(self), describe(base), uncertainty, chance].filter(Boolean).join("; ");
    return React.createElement(BaseBars, { quiet, "data-base-bars": "1", "data-base-n": n, "data-base-quiet": String(quiet), role: "img", "aria-label": name, title: name },
      React.createElement(BaseBarLabel, null, describe(self)),
      React.createElement(BaseBarTrack, { "aria-hidden": "true", quiet },
        React.createElement("i", { "data-base-fill": "1", style: { width: `${up}%` } }),
        React.createElement("b", { "data-base-tick": "1", style: { left: `${base[1]}%` } }),
        interval && React.createElement("em", { "data-base-interval": "1", style: { left: `${interval.lo * 100}%`, width: `${(interval.hi - interval.lo) * 100}%` } }),
      ),
      React.createElement(BaseBarLabel, { base: true }, describe(base)),
      chance && React.createElement(BaseBarLabel, { base: true }, chance),
    );
  }

  componentWillUnmount() {
    this._gone = true;
    if (this._spy) cancelAnimationFrame(this._spy);
    if (this.tabRef) this.tabRef.removeEventListener("keydown", this.onTabKey);
  }

  /* What followed the last US releases for this coin — CPI, the jobs
   * report, the Fed's statement and PCE — on their own request path
   * (`fetchReleaseMoves`), apart from the daily history, so either can
   * arrive first and neither waits for the other. One kind after another,
   * each drawn as it lands: the first open of a coin asks up to 48 minute
   * windows, and every one of them is kept for good. */
  async loadCpi() {
    const coin = this.props.coin;
    if (!coin) return;
    this.setState({ cpi: { coin, pending: true, kinds: {} } });
    for (const kind of macroKinds()) {
      let r;
      try {
        r = await fetchReleaseMoves(coin, kind);
      } catch (error) {
        r = null;
      }
      if (this._gone || this.props.coin !== coin) return;
      if (r && r.unavailable) {
        this.setState({ cpi: { coin, unavailable: true, kinds: {} } });
        return;
      }
      this.setState((prev) => ({
        cpi: {
          coin,
          pending: true,
          kinds: { ...(prev.cpi && prev.cpi.kinds), [kind]: r || { failed: true } },
        },
      }));
    }
    this.setState((prev) => ({ cpi: { ...prev.cpi, pending: false } }));
  }

  /* Each kind's own name on its row: a literal key per kind, so the
   * extractor sees each one. */
  releaseTitle(kind) {
    if (kind === "nfp") return msg("br_nfp_title", "US jobs report · nonfarm payrolls");
    if (kind === "fomc") return msg("br_fomc_title", "Fed rate decision · FOMC statement");
    if (kind === "pce") return msg("br_pce_title", "US PCE · personal consumption prices");
    return msg("br_cpi_title", "US CPI · consumer prices");
  }

  /* **The half hour after a US release** (27 Sep 2026 for CPI; the jobs
   * report, the Fed and PCE since 7 Oct 2026, each measured before it was
   * let in — research/macro-releases-prereg.md). Not a base rate of a state
   * but the same grammar: a count, what it is a count of, and what chance
   * would give — each of the eight half hours in a window is the largest
   * one time in eight, so a release half hour that were ordinary would top
   * the seven before it about n/8 times. */
  renderCpi() {
    const coin = this.props.coin;
    const c =
      this.state.cpi && this.state.cpi.coin === coin ? this.state.cpi : null;
    const label = React.createElement(
      BaseSectionLabel,
      {
        key: "cpi-label",
        "data-base-cpi": c
          ? c.unavailable
            ? "unavailable"
            : c.pending
              ? "pending"
              : "done"
          : "none",
      },
      msg("br_cpi_section", "Around US releases · 1-minute candles"),
    );
    const now = Date.now();
    const when = (t) =>
      new Date(t).toLocaleString(intlTag(activeLocale()), {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    if (c && c.unavailable) {
      return [
        label,
        React.createElement(
          BaseEmpty,
          { key: "cpi-na" },
          msg(
            "br_cpi_unavailable",
            "The minute candles this reads come from Coinbase, which does not list $1.",
            coin,
          ),
        ),
      ];
    }
    const kinds = (c && c.kinds) || {};
    const pct = (v) => `${(v * 100).toFixed(2)}%`;
    const rows = macroKinds()
      .filter((kind) => kinds[kind])
      .map((kind) => {
        const k = kinds[kind];
        const summary = k.failed ? null : cpiMovesSummary(k.moves);
        const title = React.createElement(BaseRowTitle, null, this.releaseTitle(kind));
        if (!summary) {
          return React.createElement(
            BaseRow,
            { key: `cpi-row-${kind}`, "data-base-release-row": `${kind}:none` },
            title,
            React.createElement(
              BaseDetail,
              null,
              msg(
                "br_cpi_none",
                "No complete minute history came back around the last releases for $1, so nothing is counted.",
                coin,
              ),
            ),
          );
        }
        const next = macroReleaseTimes(kind).find((t) => t > now) || null;
        return React.createElement(
          BaseRow,
          {
            key: `cpi-row-${kind}`,
            "data-base-release-row": `${kind}:${summary.top}/${summary.n}`,
            ...(kind === "cpi" ? { "data-base-cpi-row": `${summary.top}/${summary.n}` } : {}),
          },
          title,
          React.createElement(
            BaseCount,
            { weak: summary.n < BASE_RATE_MIN_EPISODES },
            msg(
              "br_cpi_count",
              "$1 of $2",
              String(summary.top),
              String(summary.n),
            ),
          ),
          React.createElement(
            BaseDetail,
            null,
            msg(
              "br_cpi_detail",
              "Moved more than in any of the seven half hours before it on $1 of the last $2 releases. Had the release been an ordinary half hour, about $3 would. ",
              String(summary.top),
              String(summary.n),
              summary.expect.toFixed(1),
            ),
            React.createElement(
              BaseCompare,
              null,
              msg(
                "br_cpi_medians",
                "Typical move after: $1; in the half hours before: $2; largest after: $3.",
                pct(summary.medAfter),
                pct(summary.medBefore),
                pct(summary.largest),
              ),
            ),
          ),
          React.createElement(
            BaseDetail,
            null,
            next
              ? msg(
                  "br_cpi_next",
                  "Next release: $1, your time. The chart marks each one.",
                  when(next),
                )
              : msg(
                  "br_cpi_no_next",
                  "The calendar this ships with ends at its last release; nothing later is marked.",
                ),
          ),
        );
      });
    const waiting =
      !c || c.pending
        ? React.createElement(
            BaseEmpty,
            { key: "cpi-wait" },
            msg(
              "br_cpi_reading",
              "Reading the minute candles around the last twelve releases.",
            ),
          )
        : null;
    return [label, ...rows, waiting].filter(Boolean);
  }

  async load() {
    const coin = this.props.coin;
    if (coin && !(this.state.cpi && this.state.cpi.coin === coin))
      this.loadCpi();
    if (!coin || (this.state.loading && this.state.coin === coin)) return;
    this.setState({ candles: null, loading: true, failed: false, coin });
    const candles = await fetchDailyCandles(coin).catch(() => null);
    if (this._gone) return;
    // Guard the coin as well as the mount: a switch mid-fetch must not put one
    // coin's history under another coin's name
    if (this.props.coin !== coin) return;
    this.setState({
      candles,
      loading: false,
      failed: !candles,
      coin,
    });
  }

  /* Everything the panel draws, computed once per render from the series.
   * Null while there is nothing to compute — the caller decides what to say
   * about that, because "still fetching" and "nothing came back" are different
   * sentences and one of them must not stand in for the other. */
  readings() {
    /* Kept against the candles it was read from. It used to be counted on
     * every render — and the screen renders once per release kind as the
     * minute candles arrive, so opening it counted every pattern, setup and
     * reading five times over (measured 10 Oct 2026: two long tasks of 120 ms
     * and 103 ms). Nothing else goes into it: `candles` is replaced, never
     * changed in place, so its identity is the whole key. */
    const { candles } = this.state;
    const kept = this._readings;
    if (kept && kept.candles === candles && kept.horizon === this.state.horizon) return kept.out;
    const out = this.countReadings(candles);
    this._readings = { candles, out, horizon: this.state.horizon };
    return out;
  }

  countReadings(candles) {
    if (!Array.isArray(candles) || candles.length < 200) return null;
    const closes = candles.map((c) => c.close);
    const rsi = dailyRsi(closes);
    const ma200 = movingAverage(closes, 200);
    const last = closes.length - 1;
    const horizons = this.state.horizon ? [{ days: this.state.horizon, label: msg("cp_next_days", "next $1 days", String(this.state.horizon)) }] : BASE_RATE_HORIZONS;
    const rows = [];
    for (const state of BASE_RATE_STATES) {
      const live = state.test(rsi[last]);
      const byHorizon = horizons.map((h) => ({
        ...h,
        result: baseRateFor(closes, rsi, state.test, h.days),
      }));
      rows.push({ ...state, live, byHorizon, entries: strategySetupEntries(rsi.map(state.test)) });
    }
    // The regime line, read off the same series
    const above = ma200.map((v, i) => (v == null ? null : closes[i] > v));
    rows.push({
      id: "ma200",
      title: msg("br_above_200d", "Above its 200-day average"),
      note: msg(
        "br_note_200d",
        "the line institutions read as a regime, not as an entry",
      ),
      live: above[last] === true,
      entries: strategySetupEntries(above.map((v) => v === true)),
      byHorizon: horizons.map((h) => ({
        ...h,
        result: baseRateFor(closes, above, (v) => v === true, h.days),
      })),
    });
    /* The candlestick patterns, as states of exactly the same kind: a
     * boolean per day through `baseRateFor`, one horizon, the same floor.
     * See `candle-patterns.js` for what the counting found — the short of it
     * is that almost nothing clears the bar, which is the answer this panel
     * exists to be able to give. */
    const horizon = {
      days: CANDLE_PATTERN_HORIZON,
      label: msg(
        "cp_next_days",
        "next $1 days",
        String(CANDLE_PATTERN_HORIZON),
      ),
    };
    const patterns = candlePatternsNow(candles).map(
      ({ pattern, hits, live }) => ({
        id: pattern.id,
        title: pattern.title,
        claim: pattern.claim,
        live,
        entries: strategySetupEntries(hits),
        byHorizon: [
          {
            ...horizon,
            result: baseRateFor(closes, hits, (v) => v === true, horizon.days),
          },
        ],
      }),
    );
    return {
      rsiNow: rsi[last],
      priceNow: closes[last],
      ma200Now: ma200[last],
      days: closes.length,
      rows,
      patterns,
      /* The chart patterns, on the same daily candles — see
         `price-patterns.js`. Counted, never compared below the floor. */
      shapes: detectPricePatterns(candles),
      /* The strategy setups, entered on a day's close — see
         `strategy-setups.js` and setups-prereg.md. */
      setups: strategySetupStates(candles),
      /* The second round (1 Oct 2026, companions-prereg.md): twelve more
         swing patterns, twenty-one daily readings, the stretches most like
         the last thirty days, and the next day by weekday. */
      swing: detectSwingPatterns(candles),
      readingStates: companionReadingStates(candles),
      similar: similarStretches(candles),
      weekday: weekdayShares(candles),
      // Each month of each year (7 Oct 2026) — seasonality-prereg.md
      months: monthlyReturns(candles),
      closes,
    };
  }

  /* **What came after, for what is true now** (1 Oct 2026). Everything on this
   * screen that holds today — a setup or reading formed inside its horizon, a
   * pattern still being walked, the similar past — gathered in one place with
   * each one's own count. Never combined into a score or a direction: tested,
   * almost none of them told the next ten days apart from any ten days, and the
   * last sentence says so. */
  aheadItems(readings) {
    const items = [];
    for (const row of readings.rows.concat(readings.patterns).filter((r) => r.live)) {
      const h = row.byHorizon[0];
      const r = h && h.result;
      const text = r && r.n >= BASE_RATE_MIN_EPISODES
        ? msg("br_ah_up", "$1 days later up $2% of $3 times; any $1 days up $4%.", String(h.days), r.up.toFixed(0), String(r.n), r.baseUp.toFixed(0))
        : msg("br_n_times", "$1 times", String(r ? r.n : 0));
      items.push({ key: row.id, title: row.title, text });
    }
    const day = (t) =>
      new Date(t * 1000).toLocaleDateString(intlTag(activeLocale()), { day: "numeric", month: "short" });
    const money = (v) => formatAxisPrice(v, v / 2000, "");
    for (const def of COMPANION_SETUP_DEFS) {
      const states = readings.setups[def.id] || readings.readingStates[def.id];
      if (!states) continue;
      const entries = strategySetupEntries(states);
      const last = entries[entries.length - 1];
      if (last == null) continue;
      const ago = states.length - 1 - last;
      const horizon = this.state.horizon || def.horizon || (def.kind === "move" ? SETUP_MOVE_HORIZON : SETUP_HORIZON);
      // Inside its horizon, the rule the row's own " · now" uses
      if (ago >= (def.recentDays || SETUP_HORIZON)) continue;
      let record;
      if (def.kind === "move") {
        const m = moveRateFor(readings.closes, states, horizon);
        record = m && m.n
          ? msg("br_ah_move", "the next $1 days moved more than usual $2 of $3 times; half would.", String(horizon), String(m.bigger), String(m.n))
          : msg("br_ah_never", "nothing earlier to count.");
      } else {
        const r = baseRateFor(readings.closes, states, (v) => v, horizon);
        record = r && r.n >= BASE_RATE_MIN_EPISODES
          ? msg("br_ah_up", "$1 days later up $2% of $3 times; any $1 days up $4%.", String(horizon), r.up.toFixed(0), String(r.n), r.baseUp.toFixed(0))
          : r && r.n ? msg("br_n_times", "$1 times", String(r.n)) : msg("br_ah_never", "nothing earlier to count.");
      }
      const when =
        ago === 0 ? msg("ss_formed_today", "Formed on today's close.") : ago === 1 ? msg("ss_formed_yesterday", "Formed yesterday.") : msg("ss_formed_ago", "Formed $1 days ago.", String(ago));
      items.push({ key: `s-${def.id}`, title: def.title, text: `${when} ${capitalFirst(record)}` });
    }
    const shapes = readings.shapes.concat(readings.swing);
    for (const def of COMPANION_PATTERN_DEFS) {
      const mine = shapes.filter((e) => e.kind === def.id);
      const latest = mine[mine.length - 1];
      if (!latest || latest.out !== "pending") continue;
      const tested = SWING_PATTERNS.includes(def) ? ` ${swingTestedText(def.id)}` : "";
      items.push({
        key: `p-${def.id}`,
        title: def.title,
        text:
          msg("br_ah_pattern", "Broke out on $1: measured move $2, invalidation $3, neither reached yet.", day(latest.at), money(latest.target), money(latest.stop)) +
          tested,
      });
    }
    return items;
  }

  renderAhead(readings) {
    const items = this.aheadItems(readings);
    const sim = readings.similar;
    return [
      React.createElement(BaseSectionLabel, { key: "ahead-label", "data-base-ahead": String(items.length) }, msg("br_ah_title", "What came after, for what is true now")),
      items.length
        ? null
        : React.createElement(
            BaseEmpty,
            { key: "ahead-none" },
            msg("br_ah_none", "No pattern, setup or reading on this screen has formed in its last ten days. The ordinary case."),
          ),
      ...items.map((it) =>
        React.createElement(
          BaseRow,
          { key: it.key, live: true, "data-base-ahead-item": it.key },
          React.createElement(BaseRowTitle, null, it.title),
          React.createElement(BaseDetail, null, it.text),
        ),
      ),
      sim
        ? React.createElement(
            BaseRow,
            { key: "ahead-similar", "data-base-ahead-similar": "1" },
            React.createElement(BaseRowTitle, null, msg("br_sim_title", "The most similar past")),
            React.createElement(
              BaseDetail,
              null,
              msg(
                "br_sim_line",
                "The $1 stretches of $2 days most like the last $2 were up $3 of $1 times $4 days later, by $5 in the middle one.",
                String(sim.n),
                String(ANALOG_WINDOW),
                String(sim.up),
                String(ANALOG_AHEAD),
                `${signedFixed(sim.median, 1)}%`,
              ),
            ),
          )
        : null,
      React.createElement(
        BaseNote,
        { key: "ahead-note", "data-base-ahead-note": "1" },
        msg(
          "br_ah_note",
          "These are counts of what followed, not a forecast, and they are not added up. Tested on four coins before they were shown, none of the readings and none of the setups told the next ten days apart from any ten days; the similar past was not told apart from an ordinary day; of the patterns only a triangle broken downwards did — and it reached its measured move first one time in three.",
        ),
      ),
    ];
  }

  /* **The similar past, listed** (companions-prereg.md, group 4): the
   * twenty stretches and what each was followed by. Individual small charts
   * in a list, never a fan over the main price chart —
   * scored from 2021 on, they said no more about the next ten days than an
   * ordinary day did. */
  renderSimilar(readings) {
    const sim = readings.similar;
    if (!sim) return [];
    return [
      React.createElement(BaseSectionLabel, { key: "sim-label", "data-base-similar": String(sim.n) }, msg("br_sim_section", "The similar past · daily candles")),
      React.createElement(
        BaseEmpty,
        { key: "sim-intro" },
        msg(
          "br_sim_intro",
          "The $1 stretches of this coin's history whose last $2 days had the shape of the last $2 — the path, not the level or the size — each with the $3 days that followed it.",
          String(sim.n),
          String(ANALOG_WINDOW),
          String(ANALOG_AHEAD),
        ),
      ),
      React.createElement(React.Fragment, { key: "sim-list" }, renderBaseSimilar(this, readings)),
      React.createElement(
        BaseNote,
        { key: "sim-note" },
        msg(
          "br_sim_note",
          "Tested on BTC, ETH, SOL and LTC from 2021 on, every day: what followed the most similar stretches said no more about the next ten days than what followed any day, and their majority called the direction about half the time. That is why they are a list here and not a line on the chart.",
        ),
      ),
    ];
  }

  /* **The next day, by weekday** (group 3): printed as a difference only on
   * a coin where it was tested and differed — ETH and LTC. */
  renderWeekday(readings) {
    const { coin } = this.props;
    const q = WEEKDAY_TESTED[coin];
    const w = readings.weekday;
    const label = React.createElement(BaseSectionLabel, { key: "wd-label" }, msg("br_wd_section", "The next day, by weekday"));
    if (!w)
      return [
        label,
        React.createElement(
          BaseEmpty,
          { key: "wd-none" },
          msg("br_wd_untested", "Tested on BTC, ETH, SOL and LTC: the next day's direction differed by weekday on ETH and LTC only. $1 was not tested.", coin),
        ),
      ];
    const names = [
      msg("wd_mon", "Mon"), msg("wd_tue", "Tue"), msg("wd_wed", "Wed"), msg("wd_thu", "Thu"),
      msg("wd_fri", "Fri"), msg("wd_sat", "Sat"), msg("wd_sun", "Sun"),
    ];
    return [
      label,
      React.createElement(BaseHistoryBox, { key: "wd-list", "data-base-weekday": coin },
        ...w.shares.map((s, d) => React.createElement(BaseHorizon, { key: d, "data-base-weekday-bar": String(d) },
          React.createElement(BaseHorizonLabel, null, names[d]),
          this.renderBars([msg("br_bar_this", "After this"), s, null, w.counts[d]], [msg("br_bar_base", "Any day"), w.all, null, w.n]),
        )),
      ),
      React.createElement(
        BaseNote,
        { key: "wd-note" },
        q == null ? msg("br_wd_untested", "Tested on BTC, ETH, SOL and LTC: the next day's direction differed by weekday on ETH and LTC only. $1 was not tested.", coin) : q >= 0.05 ? msg("br_wd_same", "Tested on this coin: no weekday's next day differed from the others'.") : msg(
          "br_wd_note",
          "How often the next day closed higher, by the weekday of the close (UTC), over $1 days; any day: $2%. Tested on four coins, this coin's weekdays differed from one another by more than chance — a small difference in a day's direction, not a size, and nothing about this week.",
          String(w.n),
          w.all.toFixed(0),
        ),
      ),
    ];
  }

  /* **Each month, each year** (7 Oct 2026, the Bloomberg list's SEAS). The
   * coin's daily history read as calendar months — a record with its
   * counts, never a forecast: tested on BTC, ETH and LTC, no month differed
   * from the rest (research/seasonality-prereg.md), and the sentence under
   * the grid says so. Costs no request: the daily candles are already here. */
  renderMonths(readings) {
    const { coin } = this.props;
    const mo = readings.months;
    const label = React.createElement(
      BaseSectionLabel,
      { key: "mo-label" },
      msg("br_months_section", "Each month, each year · from the daily history"),
    );
    if (!mo) return [];
    const monthName = (m) =>
      localeDate(Date.UTC(2020, m, 15), { month: "short", timeZone: "UTC" }).replace(/\.$/, "");
    /* The reading is in log returns (what the test compared); a cell says
       the change a person means by "percent": a log −0.46 is −37%, not
       −46%. The median converts the same way — the order is unchanged. */
    const pct = (r) => {
      const v = Math.round((Math.exp(r) - 1) * 100);
      return v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)}`;
    };
    const byKey = new Map(mo.rows.map((r) => [`${r.year}-${r.month}`, r]));
    const cells = [React.createElement(BaseMonthHead, { key: "h-y", role: "columnheader" }, "")];
    for (let m = 0; m < 12; m += 1) {
      cells.push(React.createElement(BaseMonthHead, { key: `h-${m}`, role: "columnheader" }, monthName(m)));
    }
    for (const y of mo.years) {
      cells.push(React.createElement(BaseMonthYear, { key: `y-${y}`, role: "rowheader" }, String(y)));
      for (let m = 0; m < 12; m += 1) {
        const r = byKey.get(`${y}-${m}`);
        const text = r ? pct(r.r) : "";
        cells.push(
          React.createElement(
            BaseMonthCell,
            {
              key: `c-${y}-${m}`,
              role: "cell",
              change: r ? r.r : null,
              partial: Boolean(r && r.partial),
              "data-month-cell": r ? `${y}-${m + 1}` : undefined,
              title: r
                ? r.partial
                  ? msg("br_months_so_far", "$1 $2: $3% so far — not counted", monthName(m), String(y), text)
                  : `${monthName(m)} ${y}: ${text}%`
                : undefined,
            },
            text,
          ),
        );
      }
    }
    cells.push(React.createElement(BaseMonthYear, { key: "f-up", role: "rowheader" }, msg("br_months_up", "up")));
    mo.byMonth.forEach((b, m) => {
      cells.push(
        React.createElement(
          BaseMonthFoot,
          { key: `u-${m}`, role: "cell", first: true, "data-month-up": `${b.up}/${b.n}` },
          b.n ? `${b.up}/${b.n}` : "",
        ),
      );
    });
    cells.push(React.createElement(BaseMonthYear, { key: "f-med", role: "rowheader" }, msg("br_months_median", "median")));
    mo.byMonth.forEach((b, m) => {
      cells.push(
        React.createElement(BaseMonthFoot, { key: `m-${m}`, role: "cell" }, b.median == null ? "" : pct(b.median)),
      );
    });
    const tested = SEASONALITY_TESTED.coins.includes(coin);
    return [
      label,
      React.createElement(
        BaseMonthGrid,
        {
          key: "mo-grid",
          role: "table",
          "data-base-months": coin,
          "aria-label": msg("br_months_aria", "$1's change in each calendar month, by year, in percent", coin),
        },
        ...cells,
      ),
      React.createElement(
        BaseNote,
        { key: "mo-note" },
        tested
          ? msg(
              "br_months_note",
              "Each cell is the month's change in percent, from the last close of the month before; under them, how many of each month closed higher, and the median. Tested on BTC, ETH and LTC — each month against the other eleven — no month differed from the rest once the 36 tests were weighed together (smallest q $1). With nine to twelve of each month only a very large difference could have shown, so no month here is a forecast.",
              SEASONALITY_TESTED.smallestQ.toFixed(2),
            )
          : msg(
              "br_months_untested",
              "Each cell is the month's change in percent, from the last close of the month before; under them, how many of each month closed higher, and the median. Months were tested on BTC, ETH and LTC, where none differed from the rest; $1's were not tested, so no month here is a forecast.",
              coin,
            ),
      ),
    ];
  }

  /* **One strategy setup's record here** (27 Sep 2026). The numbers only:
   * how often the price was up (or moved more than usual) after it, against
   * an ordinary stretch of the same coin — and no sentence calling it better
   * or worse, because tested together on four coins none of the twelve was
   * distinguishable from an ordinary day, and on LTC the loudest difference
   * pointed against its own claim. Marked "now" when it was entered in the
   * last ten days. */
  renderSetup(def, readings) {
    // A reading of 1 Oct 2026 carries its own horizon (companion-readings.js)
    const states = readings.setups[def.id] || readings.readingStates[def.id] || [];
    const entries = strategySetupEntries(states);
    const last = entries[entries.length - 1];
    const ago = last == null ? null : states.length - 1 - last;
    const live = ago != null && ago < (def.recentDays || SETUP_HORIZON);
    const days = this.state.horizon || def.horizon || (def.kind === "move" ? SETUP_MOVE_HORIZON : SETUP_HORIZON);
    const detail = (() => {
      if (def.kind === "move") {
        const m = moveRateFor(readings.closes, states, days);
        if (!m || !m.n)
          return msg("ss_none", "Not once in this coin's daily history.");
        if (days)
          return msg(
            "ss_move_detail_h",
            "The next $3 days moved more than an ordinary $3 days of this coin in $1 of $2 episodes — half would, if it meant nothing.",
            String(m.bigger),
            String(m.n),
            String(days),
          );
        return msg(
          "ss_move_detail",
          "The next 30 days moved more than an ordinary 30 days of this coin in $1 of $2 episodes — half would, if it meant nothing.",
          String(m.bigger),
          String(m.n),
        );
      }
      const r = baseRateFor(readings.closes, states, (v) => v, days);
      if (!r || !r.n)
        return msg("ss_none", "Not once in this coin's daily history.");
      // The two counts and no verdict: tested, none of these differed (see the note)
      return React.createElement(
        BaseHorizon,
        { "data-base-horizon": String(days) },
        React.createElement(BaseHorizonLabel, null, msg("cp_next_days", "next $1 days", String(days))),
        this.renderBars(
          [msg("br_bar_this", "After this"), r.up, null, r.n],
          [msg("br_bar_base", "Any day"), r.baseUp, null, r.baseN],
        ),
      );
    })();
    return React.createElement(
      BaseRow,
      { key: `setup-${def.id}`, live, "data-base-setup": def.id },
      React.createElement(
        BaseRowTitle,
        null,
        def.title,
        live ? msg("br_now_suffix", " · now") : "",
      ),
      React.createElement(
        BaseCount,
        { weak: entries.length < BASE_RATE_MIN_EPISODES },
        entries.length === 1
          ? msg("br_one_time", "1 time")
          : msg("br_n_times", "$1 times", entries.length),
      ),
      React.createElement(BaseClaim, null, `${def.what} — ${def.claim}`),
      React.createElement(BaseDetail, null, detail),
      live
        ? React.createElement(
            BaseDetail,
            null,
            /* "Formed", not "entered": on this screen the word would read as
               a trade, which is the one thing it must not say. */
            ago === 0
              ? msg("ss_formed_today", "Formed on today's close.")
              : ago === 1
                ? msg("ss_formed_yesterday", "Formed yesterday.")
                : msg("ss_formed_ago", "Formed $1 days ago.", String(ago)),
          )
        : null,
    );
  }

  /* **One chart pattern's record on this coin** (27 Sep 2026): how often it
   * completed, how many of those have resolved, and how many reached the
   * measured target before the invalidation — in the same grammar as the
   * rows above, and below `BASE_RATE_MIN_EPISODES` resolved ones, without a
   * comparison. The most recent one is named with its levels when it is
   * still being walked, so the chart's lines have a sentence behind them. */
  renderShape(def, episodes) {
    const rec = pricePatternRecord(episodes, def.id);
    const mine = episodes.filter((e) => e.kind === def.id);
    const latest = mine[mine.length - 1];
    const live = latest && latest.out === "pending";
    const money = (v) => formatAxisPrice(v, v / 2000, "");
    const day = (t) =>
      new Date(t * 1000).toLocaleDateString(intlTag(activeLocale()), {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    return React.createElement(
      BaseRow,
      {
        key: `shape-${def.id}`,
        live: Boolean(live),
        "data-base-shape": def.id,
      },
      React.createElement(
        BaseRowTitle,
        null,
        def.title,
        live ? msg("br_now_suffix", " · now") : "",
      ),
      React.createElement(
        BaseCount,
        { weak: rec.resolved < BASE_RATE_MIN_EPISODES },
        rec.found === 1
          ? msg("br_one_time", "1 time")
          : msg("br_n_times", "$1 times", rec.found),
      ),
      React.createElement(BaseClaim, null, def.claim),
      React.createElement(
        BaseDetail,
        null,
        rec.found
          ? msg(
              "cpat_record2",
              "Reached its measured move before its invalidation on $1 of the $2 that have resolved within 90 days. ",
              String(rec.targetFirst),
              String(rec.resolved),
            ) +
              (rec.resolved < BASE_RATE_MIN_EPISODES
                ? msg(
                    "cpat_too_few",
                    "$1 is too few to compare with an ordinary day — no comparison is printed.",
                    String(rec.resolved),
                  )
                : "")
          : msg(
              "cpat_never",
              "Not once in this coin's daily history, by these rules.",
            ),
      ),
      // The pooled count only beside this coin's own — a row of "not once here" printing a rate is a rate without its count
      SWING_PATTERNS.includes(def) && rec.found
        ? React.createElement(BaseDetail, { "data-base-shape-tested": def.id }, swingTestedText(def.id))
        : null,
      live
        ? React.createElement(
            BaseDetail,
            null,
            msg(
              "cpat_live2",
              "The latest completed on $1: measured move to $2, invalidation $3. It has not reached either yet.",
              day(latest.at),
              money(latest.target),
              money(latest.stop),
            ),
          )
        : null,
    );
  }

  renderRow(row) {
    const cells = row.byHorizon
      .map((h) => {
        const r = h.result;
        if (!r || !r.n) return null;
        const enough = r.edge != null;
        const edge = describeEdge(r.edge);
        return React.createElement(
          BaseHorizon,
          { key: h.days, "data-base-horizon": String(h.days) },
          React.createElement(BaseHorizonLabel, null, h.label),
          this.renderBars(
            [msg("br_bar_this", "After this"), r.up, r.median, r.n],
            [msg("br_bar_base", "Any day"), r.baseUp, r.baseMedian, r.baseN],
          ),
          React.createElement(
            BaseVerdict,
            { weak: !enough, "data-base-verdict": "1" },
            enough
              ? msg("br_that_is", "That is $1.", edge)
              : msg(
                  "br_too_few",
                  "$1 episodes is too few to compare — the difference is not printed.",
                  r.n,
                ),
          ),
        );
      })
      .filter(Boolean);
    if (!cells.length) return null;
    const n = row.byHorizon[0].result ? row.byHorizon[0].result.n : 0;
    return React.createElement(
      BaseRow,
      { key: row.id, live: row.live },
      React.createElement(
        BaseRowTitle,
        null,
        row.title,
        row.live ? msg("br_now_suffix", " · now") : "",
      ),
      React.createElement(
        BaseCount,
        { weak: n < BASE_RATE_MIN_EPISODES },
        n === 1
          ? msg("br_one_time", "1 time")
          : msg("br_n_times", "$1 times", n),
      ),
      // Only the pattern rows carry one; the RSI states are not folklore
      row.claim ? React.createElement(BaseClaim, null, row.claim) : null,
      ...cells,
    );
  }

  selectTab(tab) {
    this.setState({ tab, section: 0 });
    if (this.bodyRef) this.bodyRef.scrollTop = 0;
  }

  /* Native at the strip: React 16 delegates keys to document, where the
     app's coin arrows had already acted before React could stop them. */
  onTabKey(e) {
    const tabs = ["now", "library", "calendar"];
    const i = tabs.indexOf(e.target.getAttribute("data-base-tab"));
    if (i < 0) return;
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    e.stopPropagation();
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + step + tabs.length) % tabs.length;
    this.selectTab(tabs[next]);
    this.tabRef.children[next].focus();
  }

  renderTabs() {
    const tabs = [
      ["now", msg("br_tab_now", "Now")],
      ["library", msg("br_tab_library", "Library")],
      ["calendar", msg("br_tab_calendar", "Calendar")],
    ];
    return React.createElement(BaseSubTabs, { innerRef: (n) => (this.tabRef = n), role: "tablist", "aria-label": msg("br_tabs", "Base rate views") },
      ...tabs.map(([id, label]) => React.createElement(BaseSubTab, {
        key: id, role: "tab", "aria-selected": this.state.tab === id, tabIndex: this.state.tab === id ? 0 : -1,
        "data-base-tab": id, onClick: () => this.selectTab(id),
      }, label)),
    );
  }

  render() {
    const { coin, onClose } = this.props;
    const { loading, failed, tab } = this.state;
    const readings = this.readings();
    const live = readings ? readings.rows.filter((r) => r.live) : [];
    const rest = readings ? readings.rows.filter((r) => !r.live) : [];
    const restRows = rest.map((r) => this.renderRow(r)).filter(Boolean);
    /* Today's shapes first — it is the question somebody opens this to ask —
       then the others by how much history stands behind them, so the rows
       that can say anything sit above the ones that cannot. */
    const patterns = readings ? readings.patterns : [];
    const patternsLive = patterns.filter((p) => p.live);
    const patternsRest = patterns
      .filter((p) => !p.live)
      .slice()
      .sort((a, b) => {
        const n = (r) => (r.byHorizon[0].result ? r.byHorizon[0].result.n : 0);
        return n(b) - n(a);
      });
    const embedded = Boolean(this.props.tabs);
    /* The coins to read, here: it used to take closing the screen,
       switching the chart and opening it again. A pick switches the
       chart's coin too — this screen always reads the chart's. */
    const coinChips =
      Array.isArray(this.props.coins) && this.props.coins.length > 1 && this.props.onPickCoin
        ? React.createElement(
            BaseCoins,
            { role: "group", "aria-label": msg("br_coins_aria", "Read another coin"), "data-base-coins": "1", inline: embedded },
            ...this.props.coins.map((c) =>
              React.createElement(
                BaseChip,
                { key: c, active: c === coin, "aria-pressed": c === coin ? "true" : "false", onClick: () => c !== coin && this.props.onPickCoin(c) },
                c,
              ),
            ),
          )
        : null;
    return React.createElement(
      BaseOverlay,
      {
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
      React.createElement(
        BaseCard,
        { still: this.props.still === true },
        /* **Inside the monitor, the monitor's head** (12 Oct 2026): the same title, key and line as the other three
           tabs, so a switch changes the page and not the frame; this screen's
           own question, its count and its coins move under the tabs. */
        embedded
          ? React.createElement(
              BaseHead,
              null,
              React.createElement(BaseTitle, null, msg("mon_title", "Monitor"), keyCap("M")),
              React.createElement(
                BaseEyebrow,
                null,
                readings
                  ? msg("br_eyebrow_in_monitor", "Base rates · $1 · $2 daily closes", coin, readings.days)
                  : msg("br_reading", "Reading the daily closes…"),
              ),
            )
          : React.createElement(
              BaseHead,
              null,
              React.createElement(
                BaseTitle,
                null,
                msg("br_title", "$1 · has this happened before?", coin),
                keyCap("B"),
              ),
              React.createElement(
                BaseEyebrow,
                null,
                readings
                  ? msg("br_daily_closes", "$1 daily closes", readings.days)
                  : loading
                    ? msg("br_reading", "Reading the daily closes…")
                    : "",
              ),
              coinChips,
            ),
        React.createElement(
          BaseBody,
          { "data-base-body": "1", innerRef: (n) => (this.bodyRef = n), onScroll: this.onBodyScroll },
          // The monitor's tabs, when this is the monitor's Base rates tab
          this.props.tabs || null,
          embedded &&
            React.createElement(
              BaseContext,
              { "data-base-context": "1" },
              React.createElement(
                BaseContextTitle,
                null,
                msg("br_title", "$1 · has this happened before?", coin),
                keyCap("B"),
              ),
              coinChips,
            ),
          this.renderTabs(),
          this.state.horizon > 0 && React.createElement(BaseNote, { "data-base-untested": "1" }, msg("br_horizon_untested", "Untested horizon: descriptive counts only; the original tests do not apply to this selection.")),
          readings && tab === "library" && renderBaseLibraryTools(this, readings),
          tab === "library" && this.state.sections.length > 2
            ? React.createElement(
                BaseNav,
                { "aria-label": msg("br_nav_aria", "Sections of this screen"), "data-base-nav": String(this.state.sections.length), afterTabs: Boolean(this.props.tabs) },
                ...this.state.sections.map((t, i) =>
                  React.createElement(
                    BaseNavChip,
                    { key: `${i}-${t}`, active: i === this.state.section, "aria-current": i === this.state.section ? "true" : undefined, onClick: () => this.goToSection(i) },
                    t,
                  ),
                ),
              )
            : null,
          /* **At a glance** (12 Oct 2026): the four things somebody opens
             this to ask, as figures over their names like the price head —
             the RSI with its clock, how much is true right now, what today's
             candle is, and how much history the counts stand on. Each is a
             fact read off what is below; none is a verdict. */
          readings && tab === "now" &&
            React.createElement(
              BaseGlance,
              { "data-base-glance": "1" },
              React.createElement(
                BaseGlanceTile,
                null,
                React.createElement(BaseNowValue, null, readings.rsiNow == null ? "—" : readings.rsiNow.toFixed(1)),
                /* The clock is part of the reading. The same three letters mean
                 * six different numbers on the widget depending on which range
                 * is on screen — measured on live BTC at one instant, 63.8 to
                 * 82.2 — so a panel that counts history has to say which one it
                 * counted. */
                React.createElement(BaseNowLabel, null, msg("br_rsi_label", "RSI 14 · daily closes · 0–100")),
              ),
              React.createElement(
                BaseGlanceTile,
                null,
                React.createElement(BaseNowJump, {
                  onClick: () => {
                    const ahead = this.bodyRef && this.bodyRef.querySelector("[data-base-ahead]");
                    if (ahead) ahead.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
                  },
                },
                  React.createElement(BaseNowValue, { "data-base-now-count": "1" }, String(this.aheadItems(readings).length)),
                  React.createElement(BaseNowLabel, null, msg("br_glance_now", "Items true right now")),
                ),
              ),
              React.createElement(
                BaseGlanceTile,
                null,
                React.createElement(
                  BaseNowValue,
                  { small: true },
                  patternsLive.length ? patternsLive.map((p) => p.title).join(" · ") : "—",
                ),
                React.createElement(
                  BaseNowLabel,
                  null,
                  patternsLive.length ? msg("br_glance_candle", "Today's candle") : msg("br_glance_candle_none", "Today's candle: no named shape"),
                ),
              ),
              React.createElement(
                BaseGlanceTile,
                null,
                React.createElement(BaseNowValue, null, (readings.days / 365.25).toFixed(1)),
                React.createElement(BaseNowLabel, null, msg("br_glance_years", "Years of daily closes counted")),
              ),
            ),
          loading &&
            React.createElement(
              BaseEmpty,
              null,
              msg(
                "br_loading_body",
                "Reading this coin's daily closes. It goes back as far as the exchange publishes, which is what makes the counts below worth printing.",
              ),
            ),
          failed &&
            !loading &&
            React.createElement(
              BaseEmpty,
              null,
              msg(
                "br_failed",
                "No daily history came back for $1. Nothing can be counted without it, and a count made up would be worse than none.",
                coin,
              ),
              React.createElement(
                BaseLoad,
                { onClick: this.load, disabled: loading },
                msg("br_try_again", "Try again"),
              ),
            ),
          /* The CPI count stands on its own request, so it does not wait
             for — or disappear with — the daily history: without the
             columns it is drawn by itself. */
          !readings && tab === "calendar" &&
            React.createElement(
              BaseColumns,
              null,
              React.createElement(
                BaseColumn,
                { "data-base-cpi-alone": "1" },
                ...this.renderCpi(),
              ),
            ),
          readings &&
            /* **Two columns on a wide window** (26 Sep 2026): the states on
               the left and the candlestick shapes beside them, rather than
               one column that stopped two thirds of the way across a screen
               with the rest of it empty. Under 1100px they stack. */
            React.createElement(
              BaseColumns,
              null,
              React.createElement(
                BaseColumn,
                { "data-base-states": "1" },
                ...(tab === "now" ? this.renderAhead(readings) : []),
                ...(tab === "library" ? [
                React.createElement(
                  BaseSectionLabel,
                  null,
                  live.length
                    ? msg("br_true_now", "True right now")
                    : msg("br_nothing_unusual", "Nothing unusual right now"),
                ),
                live.length
                  ? baseLibraryRows(this, live.map((r) => this.renderRow(r)), readings)
                  : React.createElement(
                      BaseEmpty,
                      null,
                      msg(
                        "br_no_states",
                        "$1 is not in any of the states below. That is the ordinary case, and it is the honest answer far more often than any of them.",
                        coin,
                      ),
                    ),
                /* Only with something under it: a row can come back empty
                   (a state with no record), and a heading over nothing read
                   as a section that had failed to load. */
                restRows.length
                  ? React.createElement(
                      BaseSectionLabel,
                      null,
                      msg("br_the_rest", "The rest, for reference"),
                    )
                  : null,
                ...baseLibraryRows(this, restRows, readings),
                ...this.renderSimilar(readings),
                ] : []),
                ...(tab === "calendar" ? [...this.renderWeekday(readings), ...this.renderMonths(readings)] : []),
              ),
              /* **The candlestick shapes, counted.** Whatever range is on the
                 chart, these are read off the daily candle — a pattern is a
                 claim about a bar, and a bar is half a minute on 1H and a
                 fortnight on ALL, so one name would mean six things. The
                 same argument `dailyRsi` settled, and the label says it. */
              tab === "now" ? React.createElement(BaseColumn, { "data-base-history-col": "1" }, renderBaseHistory(this, readings)) :
              tab === "calendar" ? React.createElement(BaseColumn, null, ...this.renderCpi()) : React.createElement(
                BaseColumn,
                { "data-base-patterns-col": "1" },
                React.createElement(
                  BaseSectionLabel,
                  { "data-base-patterns": "1" },
                  msg("cp_section", "Candlestick patterns · daily candles"),
                ),
                React.createElement(
                  BaseEmpty,
                  null,
                  patternsLive.length
                    ? msg(
                        "cp_on_today",
                        "Today's candle is $1. What followed the last times it appeared is under it; the other shapes this coin's history has shown are below that.",
                        patternsLive
                          .map((p) => p.title.toLowerCase())
                          .join(", "),
                      )
                    : msg(
                        "cp_none_today",
                        "Today's candle is none of the $1 shapes this panel looks for. That is the ordinary case — most candles are not a pattern. The ones this coin's history has shown are below.",
                        String(patterns.length),
                      ),
                ),
                ...baseLibraryRows(this, patternsLive.concat(patternsRest).map((r) => this.renderRow(r)), readings),
                /* **Chart patterns** (27 Sep 2026) — the geometric ones, by
                   rule on swing points. Counted; see `price-patterns.js` and
                   the preregistration it points to. */
                React.createElement(
                  BaseSectionLabel,
                  { "data-base-shapes": String(readings.shapes.length) },
                  msg("cpat_section", "Chart patterns · daily candles"),
                ),
                React.createElement(
                  BaseEmpty,
                  null,
                  msg(
                    "cpat_intro2",
                    "Found by rule on swing points five days either side, and followed for 90 days to the measured move or the invalidation, whichever came first. The same rules found 60 of these in eleven years of four coins together — rare enough that none of them can be compared with an ordinary day yet.",
                  ),
                ),
                ...baseLibraryRows(this, PRICE_PATTERNS.map((def) =>
                  this.renderShape(def, readings.shapes),
                ), readings),
                /* **Strategy setups** (27 Sep 2026) — what trend, breakout,
                   mean-reversion and volatility strategies wait for, counted
                   on the same candles. */
                React.createElement(
                  BaseSectionLabel,
                  { "data-base-setups": "1" },
                  msg("ss_section", "Strategy setups · daily candles"),
                ),
                React.createElement(
                  BaseEmpty,
                  null,
                  msg(
                    "ss_intro",
                    "What common strategies wait for — crosses, breakouts, closes outside the bands, Supertrend flips — with what followed each time on this coin, beside an ordinary day. The chart companion names them where they happened.",
                  ),
                ),
                ...baseLibraryRows(this, STRATEGY_SETUPS.map((def) =>
                  this.renderSetup(def, readings),
                ), readings),
                React.createElement(
                  BaseNote,
                  { "data-base-setups-note": "1" },
                  msg(
                    "ss_note",
                    "Tested together on BTC, ETH, SOL and LTC on 27 September 2026, after correcting for the 48 comparisons, none of these twelve was distinguishable from an ordinary day. A difference that looks large on one coin is the size chance produces across this many rows — on LTC the largest ones point against the setup's own claim — so none is called better or worse here.",
                  ),
                ),
                /* **More chart patterns** (1 Oct 2026) — triangles, wedges,
                   ranges, flags and triple tops through swing points, by
                   rules written before they were counted. */
                React.createElement(
                  BaseSectionLabel,
                  { "data-base-swing": String(readings.swing.length) },
                  msg("swp_section", "More chart patterns · daily candles"),
                ),
                React.createElement(
                  BaseEmpty,
                  null,
                  msg(
                    "swp_intro",
                    "Triangles, wedges, ranges, flags and triple tops, drawn through swing points rather than fitted, each followed for 90 days to its measured move or its invalidation. Under each, how the same rule did on four coins together against the same two distances from an ordinary day.",
                  ),
                ),
                ...baseLibraryRows(this, SWING_PATTERNS.map((def) =>
                  this.renderShape(def, readings.swing),
                ), readings),
                /* **Readings** (1 Oct 2026) — divergences, Ichimoku, the
                   stochastic, Fibonacci, pivots, highs, streaks and quiet days. */
                React.createElement(
                  BaseSectionLabel,
                  { "data-base-readings": "1" },
                  msg("cr_section", "Readings · daily candles"),
                ),
                React.createElement(
                  BaseEmpty,
                  null,
                  msg(
                    "cr_intro",
                    "What chart tools read off a chart to say what comes next — divergences, the Ichimoku cloud, the stochastic, Fibonacci retracements, weekly pivots, new highs, streaks, the Mayer multiple, quiet days — with what followed each on this coin over ten days, beside any ten days.",
                  ),
                ),
                ...baseLibraryRows(this, COMPANION_READINGS.map((def) =>
                  this.renderSetup(def, readings),
                ), readings),
                React.createElement(
                  BaseNote,
                  { "data-base-readings-note": "1" },
                  msg(
                    "cr_note",
                    "Tested together on BTC, ETH, SOL and LTC on 1 October 2026 — 88 comparisons, written down before any was counted — none of these was distinguishable from an ordinary day; the smallest corrected q was 0.63. So none is called better or worse here.",
                  ),
                ),
              ),
            ),
          React.createElement(
            BaseNote,
            null,
            msg(
              "br_note_1",
              "This counts what happened after a state, against what happened after an ordinary day in the same coin. It is not a signal and there is nothing to act on here. ",
            ),
            msg(
              "br_note_tested",
              "Nine textbook rules tested over 21,669 daily closes on eight coins produced 0 of 70 results that survived correction for multiple testing. ",
            ),
            msg(
              "br_note_3",
              "Where a count is small the comparison is left out rather than dressed up: a rate needs its denominator to mean anything.",
            ),
          ),
        ),
      ),
    );
  }
}

BaseRatesPanel.defaultProps = { coin: "BTC" };
