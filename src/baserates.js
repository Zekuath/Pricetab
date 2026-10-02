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

// "+1.4 pts better" / "0.9 pts worse" / "no different" — the comparison in
// words, and only ever about what already happened
const describeEdge = (edge) => {
  if (edge == null) return null;
  const rounded = Number(edge.toFixed(1));
  if (rounded === 0) {
    return msg("br_edge_none", "no different from an ordinary stretch");
  }
  return rounded > 0
    ? msg(
        "br_edge_better",
        "$1 points better than an ordinary stretch",
        Math.abs(rounded).toFixed(1),
      )
    : msg(
        "br_edge_worse",
        "$1 points worse than an ordinary stretch",
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
    };
    this.load = this.load.bind(this);
  }

  componentDidMount() {
    this.load();
  }

  componentDidUpdate(prev) {
    // The panel follows the chart: switch coin underneath it and it re-reads
    if (prev.coin !== this.props.coin) this.load();
  }

  componentWillUnmount() {
    this._gone = true;
  }

  /* What followed the last US CPI releases for this coin — its own request
   * path (`fetchCpiMoves`), apart from the daily history, so either can
   * arrive first and neither waits for the other. */
  async loadCpi() {
    const coin = this.props.coin;
    if (!coin) return;
    this.setState({ cpi: { coin, pending: true } });
    let r;
    try {
      r = await fetchCpiMoves(coin);
    } catch (error) {
      r = null;
    }
    if (this._gone || this.props.coin !== coin) return;
    this.setState({ cpi: { coin, ...(r || { failed: true }) } });
  }

  /* **The half hour after a US CPI release** (27 Sep 2026). Not a base rate
   * of a state but the same grammar: a count, what it is a count of, and
   * what chance would give — each of the eight half hours in a window is the
   * largest one time in eight, so a release half hour that were ordinary
   * would top the seven before it about n/8 times. */
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
      msg("br_cpi_section", "Around US CPI releases · 1-minute candles"),
    );
    const now = Date.now();
    const next = nextCpiRelease(now);
    const when = (t) =>
      new Date(t).toLocaleString(intlTag(activeLocale()), {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    if (!c || c.pending) {
      return [
        label,
        React.createElement(
          BaseEmpty,
          { key: "cpi-wait" },
          msg(
            "br_cpi_reading",
            "Reading the minute candles around the last twelve releases.",
          ),
        ),
      ];
    }
    if (c.unavailable) {
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
    const summary = c.failed ? null : cpiMovesSummary(c.moves);
    if (!summary) {
      return [
        label,
        React.createElement(
          BaseEmpty,
          { key: "cpi-none" },
          msg(
            "br_cpi_none",
            "No complete minute history came back around the last releases for $1, so nothing is counted.",
          ),
        ),
      ];
    }
    const pct = (v) => `${(v * 100).toFixed(2)}%`;
    return [
      label,
      React.createElement(
        BaseRow,
        { key: "cpi-row", "data-base-cpi-row": `${summary.top}/${summary.n}` },
        React.createElement(
          BaseRowTitle,
          null,
          msg("br_cpi_title", "The half hour after a release"),
        ),
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
      ),
    ];
  }

  async load() {
    const coin = this.props.coin;
    if (coin && !(this.state.cpi && this.state.cpi.coin === coin))
      this.loadCpi();
    if (!coin || this.state.loading) return;
    this.setState({ loading: true, failed: false, coin });
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
    const { candles } = this.state;
    if (!Array.isArray(candles) || candles.length < 200) return null;
    const closes = candles.map((c) => c.close);
    const rsi = dailyRsi(closes);
    const ma200 = movingAverage(closes, 200);
    const last = closes.length - 1;
    const rows = [];
    for (const state of BASE_RATE_STATES) {
      const live = state.test(rsi[last]);
      const byHorizon = BASE_RATE_HORIZONS.map((h) => ({
        ...h,
        result: baseRateFor(closes, rsi, state.test, h.days),
      }));
      rows.push({ ...state, live, byHorizon });
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
      byHorizon: BASE_RATE_HORIZONS.map((h) => ({
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
      closes,
    };
  }

  /* **What came after, for what is true now** (1 Oct 2026, *"gelecekte ne
   * olabileceğini anlayabileceğimiz bir yardımcı"*). Everything on this
   * screen that holds today — a setup or reading formed inside its horizon,
   * a pattern still being walked, the similar past — gathered in one place
   * with each one's own count. Never combined into a score or a direction:
   * tested, almost none of them told the next ten days apart from any ten
   * days, and the last sentence says so. */
  renderAhead(readings) {
    const items = [];
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
      const horizon = def.horizon || (def.kind === "move" ? SETUP_MOVE_HORIZON : SETUP_HORIZON);
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
        record = r && r.n
          ? msg("br_ah_up", "$1 days later up $2% of $3 times; any $1 days up $4%.", String(horizon), r.up.toFixed(0), String(r.n), r.baseUp.toFixed(0))
          : msg("br_ah_never", "nothing earlier to count.");
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
          "These are counts of what followed, not a forecast, and they are not added up. Tested on four coins before they were shown, none of the readings and none of the setups told the next ten days apart from any ten days; the similar past did no better than an ordinary day; of the patterns only a triangle broken downwards did — and it reached its measured move first one time in three.",
        ),
      ),
    ];
  }

  /* **The similar past, listed** (companions-prereg.md, group 4): the
   * twenty stretches and what each was followed by. Listed, never drawn —
   * scored from 2021 on, they said no more about the next ten days than an
   * ordinary day did. */
  renderSimilar(readings) {
    const sim = readings.similar;
    if (!sim) return [];
    const day = (t) =>
      new Date(t * 1000).toLocaleDateString(intlTag(activeLocale()), { day: "numeric", month: "short", year: "numeric" });
    const list = sim.stretches
      .slice()
      .sort((a, b) => b.t - a.t)
      .map((s) => `${day(s.t)} ${signedFixed(s.after, 1)}%`)
      .join(" · ");
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
      React.createElement(BaseDetail, { key: "sim-list", "data-base-similar-list": "1" }, list),
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
    if (q == null || !w)
      return [
        label,
        React.createElement(
          BaseEmpty,
          { key: "wd-none" },
          msg("br_wd_untested", "Tested on BTC, ETH, SOL and LTC: the next day's direction differed by weekday on ETH and LTC only. $1 was not tested.", coin),
        ),
      ];
    if (q >= 0.05)
      return [
        label,
        React.createElement(
          BaseEmpty,
          { key: "wd-same" },
          msg("br_wd_same", "Tested on this coin: no weekday's next day differed from the others'."),
        ),
      ];
    const names = [
      msg("wd_mon", "Mon"), msg("wd_tue", "Tue"), msg("wd_wed", "Wed"), msg("wd_thu", "Thu"),
      msg("wd_fri", "Fri"), msg("wd_sat", "Sat"), msg("wd_sun", "Sun"),
    ];
    return [
      label,
      React.createElement(
        BaseDetail,
        { key: "wd-list", "data-base-weekday": coin },
        w.shares.map((s, d) => `${names[d]} ${s.toFixed(0)}%`).join(" · "),
      ),
      React.createElement(
        BaseNote,
        { key: "wd-note" },
        msg(
          "br_wd_note",
          "How often the next day closed higher, by the weekday of the close (UTC), over $1 days; any day: $2%. Tested on four coins, this coin's weekdays differed from one another by more than chance — a small difference in a day's direction, not a size, and nothing about this week.",
          String(w.n),
          w.all.toFixed(0),
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
    const detail = (() => {
      if (def.kind === "move") {
        const m = moveRateFor(readings.closes, states, def.horizon || SETUP_MOVE_HORIZON);
        if (!m || !m.n)
          return msg("ss_none", "Not once in this coin's daily history.");
        if (def.horizon)
          return msg(
            "ss_move_detail_h",
            "The next $3 days moved more than an ordinary $3 days of this coin in $1 of $2 episodes — half would, if it meant nothing.",
            String(m.bigger),
            String(m.n),
            String(def.horizon),
          );
        return msg(
          "ss_move_detail",
          "The next 30 days moved more than an ordinary 30 days of this coin in $1 of $2 episodes — half would, if it meant nothing.",
          String(m.bigger),
          String(m.n),
        );
      }
      const r = baseRateFor(readings.closes, states, (v) => v, def.horizon || SETUP_HORIZON);
      if (!r || !r.n)
        return msg("ss_none", "Not once in this coin's daily history.");
      return msg(
        "ss_up_detail",
        "10 days later: up $1% of the time across $2 episodes. An ordinary 10 days of this coin: up $3%.",
        r.up.toFixed(0),
        String(r.n),
        r.baseUp.toFixed(0),
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
          BaseDetail,
          { key: h.days },
          `${h.label}: `,
          React.createElement(
            BaseCompare,
            null,
            msg(
              "br_typically",
              "$1 typically, up $2% of the time",
              formatSigned(r.median),
              r.up.toFixed(0),
            ),
          ),
          (r.n === 1
            ? msg("br_across_one_episode", " across 1 episode. ")
            : msg("br_across_episodes", " across $1 episodes. ", r.n)) +
            msg(
              "br_ordinary_days",
              "An ordinary $1 days: $2, up $3% ($4 of them). ",
              h.days,
              formatSigned(r.baseMedian),
              r.baseUp.toFixed(0),
              r.baseN,
            ) +
            (enough
              ? msg("br_that_is", "That is $1.", edge)
              : msg(
                  "br_too_few",
                  "$1 episodes is too few to compare — the difference is not printed.",
                  r.n,
                )),
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

  render() {
    const { coin, onClose } = this.props;
    const { loading, failed } = this.state;
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
    return React.createElement(
      BaseOverlay,
      {
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
      React.createElement(
        BaseCard,
        null,
        React.createElement(
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
        ),
        React.createElement(
          BaseBody,
          null,
          readings &&
            React.createElement(
              BaseNow,
              null,
              React.createElement(
                BaseNowValue,
                null,
                readings.rsiNow == null ? "—" : readings.rsiNow.toFixed(1),
              ),
              /* The clock is part of the reading. The same three letters mean
               * six different numbers on the widget depending on which range
               * is on screen — measured on live BTC at one instant, 63.8 to
               * 82.2 — so a panel that counts history has to say which one it
               * counted. */
              React.createElement(
                BaseNowLabel,
                null,
                msg("br_rsi_label", "RSI 14 · daily closes · 0–100"),
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
          !readings &&
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
                ...this.renderAhead(readings),
                React.createElement(
                  BaseSectionLabel,
                  null,
                  live.length
                    ? msg("br_true_now", "True right now")
                    : msg("br_nothing_unusual", "Nothing unusual right now"),
                ),
                live.length
                  ? live.map((r) => this.renderRow(r))
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
                ...restRows,
                ...this.renderCpi(),
                ...this.renderSimilar(readings),
                ...this.renderWeekday(readings),
              ),
              /* **The candlestick shapes, counted.** Whatever range is on the
                 chart, these are read off the daily candle — a pattern is a
                 claim about a bar, and a bar is half a minute on 1H and a
                 fortnight on ALL, so one name would mean six things. The
                 same argument `dailyRsi` settled, and the label says it. */
              React.createElement(
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
                ...patternsLive.map((r) => this.renderRow(r)),
                ...patternsRest.map((r) => this.renderRow(r)),
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
                ...PRICE_PATTERNS.map((def) =>
                  this.renderShape(def, readings.shapes),
                ),
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
                ...STRATEGY_SETUPS.map((def) =>
                  this.renderSetup(def, readings),
                ),
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
                ...SWING_PATTERNS.map((def) =>
                  this.renderShape(def, readings.swing),
                ),
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
                ...COMPANION_READINGS.map((def) =>
                  this.renderSetup(def, readings),
                ),
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
              "br_note_2",
              "Nine textbook rules tested over 21,669 daily closes on eight coins produced 0 of 70 results that survived correction for multiple testing, and on live data the “overbought” line was followed by a better-than-ordinary month on four coins of six. ",
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
