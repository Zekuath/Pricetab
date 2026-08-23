/* BASE RATES — "has this happened before, and how often?"
 *
 * This panel is what got built instead of buy and sell signals, and the reason
 * is measured rather than tasteful. `docs/product/TODAY.md` §9 has the working;
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
 * `docs/store/policies/` bans gambling outright and the extension's declared
 * single purpose is *crypto price charts*. A buy point moves it to investment
 * advice; a count of what has happened does not.
 */

// How far ahead each row looks. Two horizons, because "it went up next week"
// and "it went up next month" are different claims and both get asked.
const BASE_RATE_HORIZONS = [
  { days: 7, label: "next 7 days" },
  { days: 30, label: "next 30 days" },
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
    title: "RSI above 70",
    note: "the line usually called overbought",
    test: (v) => v != null && v > 70,
  },
  {
    id: "rsi-veryhot",
    title: "RSI above 80",
    note: "the same line, further out",
    test: (v) => v != null && v > 80,
  },
  {
    id: "rsi-cold",
    title: "RSI below 30",
    note: "the line usually called oversold",
    test: (v) => v != null && v < 30,
  },
  {
    id: "rsi-verycold",
    title: "RSI below 20",
    note: "the same line, further out",
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
  if (rounded === 0) return "no different from an ordinary stretch";
  return `${Math.abs(rounded).toFixed(1)} points ${rounded > 0 ? "better" : "worse"} than an ordinary stretch`;
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
    this.state = { closes: null, loading: false, failed: false, coin: null };
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

  async load() {
    const coin = this.props.coin;
    if (!coin || this.state.loading) return;
    this.setState({ loading: true, failed: false, coin });
    let closes = null;
    try {
      closes = await fetchDailyCloses(coin);
    } catch (error) {
      closes = null;
    }
    if (this._gone) return;
    // Guard the coin as well as the mount: a switch mid-fetch must not put one
    // coin's history under another coin's name
    if (this.props.coin !== coin) return;
    this.setState({
      closes,
      loading: false,
      failed: !closes,
      coin,
    });
  }

  /* Everything the panel draws, computed once per render from the series.
   * Null while there is nothing to compute — the caller decides what to say
   * about that, because "still fetching" and "nothing came back" are different
   * sentences and one of them must not stand in for the other. */
  readings() {
    const { closes } = this.state;
    if (!Array.isArray(closes) || closes.length < 200) return null;
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
      title: "Above its 200-day average",
      note: "the line institutions read as a regime, not as an entry",
      live: above[last] === true,
      byHorizon: BASE_RATE_HORIZONS.map((h) => ({
        ...h,
        result: baseRateFor(closes, above, (v) => v === true, h.days),
      })),
    });
    return {
      rsiNow: rsi[last],
      priceNow: closes[last],
      ma200Now: ma200[last],
      days: closes.length,
      rows,
    };
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
            `${formatSigned(r.median)} typically, up ${r.up.toFixed(0)}% of the time`,
          ),
          ` across ${r.n} episode${r.n === 1 ? "" : "s"}. ` +
            `An ordinary ${h.days} days: ${formatSigned(r.baseMedian)}, up ${r.baseUp.toFixed(0)}% (${r.baseN} of them). ` +
            (enough
              ? `That is ${edge}.`
              : `${r.n} episodes is too few to compare — the difference is not printed.`),
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
        row.live ? " · now" : "",
      ),
      React.createElement(
        BaseCount,
        { weak: n < BASE_RATE_MIN_EPISODES },
        `${n} time${n === 1 ? "" : "s"}`,
      ),
      ...cells,
    );
  }

  render() {
    const { coin, onClose } = this.props;
    const { loading, failed } = this.state;
    const readings = this.readings();
    const live = readings ? readings.rows.filter((r) => r.live) : [];
    const rest = readings ? readings.rows.filter((r) => !r.live) : [];
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
          React.createElement(BaseTitle, null, `${coin} · has this happened before?`),
          React.createElement(
            BaseEyebrow,
            null,
            readings
              ? `${readings.days} daily closes`
              : loading
                ? "Reading the daily closes…"
                : "",
          ),
          React.createElement(
            BaseClose,
            { onClick: onClose, "aria-label": "Close base rates" },
            "×",
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
                "RSI 14 · daily closes · 0–100",
              ),
            ),
          loading &&
            React.createElement(
              BaseEmpty,
              null,
              "Reading this coin's daily closes. It goes back as far as the exchange publishes, which is what makes the counts below worth printing.",
            ),
          failed &&
            !loading &&
            React.createElement(
              BaseEmpty,
              null,
              `No daily history came back for ${coin}. Nothing can be counted without it, and a count made up would be worse than none.`,
              React.createElement(
                BaseLoad,
                { onClick: this.load, disabled: loading },
                "Try again",
              ),
            ),
          readings &&
            React.createElement(
              Fragment,
              null,
              React.createElement(
                BaseSectionLabel,
                null,
                live.length ? "True right now" : "Nothing unusual right now",
              ),
              live.length
                ? live.map((r) => this.renderRow(r))
                : React.createElement(
                    BaseEmpty,
                    null,
                    `${coin} is not in any of the states below. That is the ordinary case, and it is the honest answer far more often than any of them.`,
                  ),
              React.createElement(BaseSectionLabel, null, "The rest, for reference"),
              rest.map((r) => this.renderRow(r)),
            ),
          React.createElement(
            BaseNote,
            null,
            "This counts what happened after a state, against what happened after an ordinary day in the same coin. It is not a signal and there is nothing to act on here. ",
            "Nine textbook rules tested over 21,669 daily closes on eight coins produced 0 of 70 results that survived correction for multiple testing, and on live data the “overbought” line was followed by a better-than-ordinary month on four coins of six. ",
            "Where a count is small the comparison is left out rather than dressed up: a rate needs its denominator to mean anything.",
          ),
        ),
      ),
    );
  }
}

BaseRatesPanel.defaultProps = { coin: "BTC" };
