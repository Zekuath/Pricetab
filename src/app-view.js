/* THE CHART'S WINDOW IN TIME, ON THE APP'S SIDE (the chart plan's Phase 2)
 *
 * `ChartView` (chart-viewport.js) owns the gesture; this owns what outlives
 * it: the window itself (`chartView`, never persisted — a new tab opens on the
 * range), the finer candles a narrow window asks for (`chartDetail`), and the
 * chip that says the chart is zoomed and puts it back.
 *
 * The window is stamped with the coin, the range and the currency it was set
 * on, and read only while all three still match (`chartViewNow`), so a coin
 * switch, a range switch or a currency change is a return to the whole range
 * without every one of those handlers having to know about it. Turning calls
 * on or starting a comparison lets it go the same way (`syncChartView`).
 *
 * The pattern is `app-ticker.js`'s: a plain function handed the component,
 * no `this` in the file. Loads before `app.js`.
 */
const VIEW_DETAIL_DELAY_MS = 150; // a gesture's last frame, then one ask

const viewHandlers = (app) => ({
  // The chart's window component, for the + / − and ← / → keys
  viewRef: createRef(),

  /* The window, if it belongs to what is on screen now. */
  chartViewNow: () => {
    const v = app.state.chartView;
    if (!v) return null;
    const coin = app.state.coinOptions[app.state.coinIndex];
    return v.coin === coin && v.period === app.state.period && v.currency === app.state.currency ? v : null;
  },

  /* Whether this chart can zoom: not under the board, not under a comparison. */
  chartViewEnabled: () => app.state.predict !== true && !app.state.compareCoin,

  /* Finer candles exist only where Coinbase Exchange quotes the pair. */
  chartDetailSupported: () => {
    const coin = app.state.coinOptions[app.state.coinIndex];
    return Boolean(coin) && effectiveProvider(coin) === "coinbase" && OHLC_CURRENCIES.includes(app.state.currency);
  },

  /* A gesture ended (or a key, or the chip): the window is set once. */
  handleChartView: (view) => {
    if (!view) {
      app._detailToken = (app._detailToken || 0) + 1;
      clearTimeout(app._detailTimer);
      app.setState({ chartView: null });
      return;
    }
    const coin = app.state.coinOptions[app.state.coinIndex];
    app.setState({
      chartView: {
        t0: view.t0,
        t1: view.t1,
        atNow: Boolean(view.atNow),
        coin,
        period: app.state.period,
        currency: app.state.currency,
      },
    });
    app.queueChartDetail();
  },

  resetChartView: () => app.handleChartView(null),

  /* **Out past the whole range** (30 Sep 2026, left from Phase 2): the next
   * range, opened on a window as wide as the range just left and ending now,
   * so the zoom carries on from where it was instead of jumping to a whole
   * new picture — the next notch out widens it within the new range. The
   * window is stamped with the new range, so it applies the moment that
   * range's prices land. Nothing past ALL. */
  /* Out past the whole range (dir 1) or in past the shorter range's length
     (dir −1): the neighbouring range, opened on the span the zoom was at,
     ending now — so the zoom goes on from where it was in either direction. */
  handleChartZoomPast: (span, dir = 1, win = null) => {
    const at = PERIOD_OPTIONS.findIndex((o) => o.value === app.state.period);
    const next = at >= 0 ? PERIOD_OPTIONS[at + (dir < 0 ? -1 : 1)] : null;
    if (!next || !(span > 0)) return false;
    const coin = app.state.coinOptions[app.state.coinIndex];
    const now = Date.now();
    app.setPeriod(null, next.value);
    // Zooming in keeps the window it was on; out opens one ending now
    const view = win && !win.atNow
      ? { t0: win.t0, t1: win.t1, atNow: false }
      : { t0: now - span, t1: now, atNow: true };
    app.setState({
      chartView: { ...view, coin, period: next.value, currency: app.state.currency },
    });
    app.queueChartDetail();
    return true;
  },

  /* The shorter range's length, which a zoom in at now crosses into it. */
  chartFinerSpan: () => {
    const at = PERIOD_OPTIONS.findIndex((o) => o.value === app.state.period);
    const finer = at > 0 ? PERIOD_OPTIONS[at - 1].value : null;
    return finer ? PERIOD_SPAN_MS[finer] || null : null;
  },

  queueChartDetail: () => {
    clearTimeout(app._detailTimer);
    app._detailTimer = setTimeout(app.loadChartDetail, VIEW_DETAIL_DELAY_MS);
  },

  /* **Ask for finer bars when the window is narrower than the range's own
   * points can show.** The granularity puts at most `VIEW_MAX_BARS` in the
   * window; the ask covers half a window either side so a pan does not ask
   * again; and nothing is asked when those bars would be no finer than what
   * the chart already has (`VIEW_FINER`) — the 1H range's own points are ten
   * seconds apart, finer than any candle there is. */
  loadChartDetail: async () => {
    const view = app.chartViewNow();
    if (!view || !app.chartViewEnabled() || !app.chartDetailSupported()) return;
    const series = app.state.valueHistory;
    if (!Array.isArray(series) || series.length < 2) return;
    const lo = viewMs(series[0].time);
    const hi = viewMs(series[series.length - 1].time);
    const span = view.t1 - view.t0;
    const t1 = view.atNow ? hi : view.t1;
    const t0 = t1 - span;
    const g = viewGranularity(span);
    const candleMode = app.state.chartType === "candles" && Array.isArray(app.state.ohlcData);
    const coarse = candleMode ? viewStep(app.state.ohlcData) : viewStep(series);
    if (!(g * 1000 < coarse * VIEW_FINER)) return;
    const coin = view.coin;
    const currency = view.currency;
    const from = Math.max(lo, t0 - span / 2);
    const to = Math.min(hi, t1 + span / 2);
    // Already in hand: a window that stays put needs nothing new
    const have = app.state.chartDetail;
    if (
      !view.atNow &&
      have &&
      have.coin === coin &&
      have.currency === currency &&
      have.g === g &&
      have.from <= from &&
      have.to >= to
    ) {
      return;
    }
    const token = (app._detailToken = (app._detailToken || 0) + 1);
    let candles;
    try {
      candles = await fetchViewCandles(coin, currency, g, from, to);
    } catch (error) {
      candles = null;
    }
    // A later window, or a different chart, has taken over since the ask
    if (token !== app._detailToken || !candles) return;
    const now = app.chartViewNow();
    if (!now || now.coin !== coin || now.currency !== currency) return;
    app.setState({ chartDetail: { coin, currency, g, from, to, candles } });
  },

  /* Let the window go when the chart it was set on is gone — the board came
   * up or a comparison started (a coin, range or currency switch is handled
   * by the stamp) — and ask again for the end of a window that follows the
   * price when a new series arrives. Called from `componentDidUpdate`. */
  syncChartView: (prevState) => {
    const s = app.state;
    // The tools stand down with the window: nothing in the hand, nothing picked up
    if (!app.chartViewEnabled() && (s.chartTool || s.drawingSelected || s.drawingEditing)) {
      app.setState({ chartTool: null, drawingSelected: null, drawingEditing: null });
    }
    if (s.chartView && !app.chartViewEnabled()) {
      app.handleChartView(null);
      return;
    }
    if (s.valueHistory !== prevState.valueHistory) {
      const v = app.chartViewNow();
      if (v && v.atNow) app.queueChartDetail();
    }
  },

  /* **The coin in the other coin** (a counted study, chart-studies.js): with
   * a comparison up, the chart can draw this coin priced in the compared one
   * — ETH in BTC — on an axis of its own. Kept for the session, not stored. */
  toggleCompareRatio: () => app.setState((prev) => ({ compareRatio: !prev.compareRatio })),

  compareRatioFor: () => {
    if (!app.state.compareCoin || !app.state.compareRatio) return null;
    const a = app.state.valueHistory;
    const b = app.state.compareHistory;
    const m = app._ratioMemo;
    if (m && m.a === a && m.b === b) return m.out;
    const out = ratioSeries(a, b);
    app._ratioMemo = { a, b, out };
    return out;
  },

  // A ratio's figure: five significant digits and the coin it is priced in
  formatRatio: (v) => {
    const n = Number(v);
    if (!isFinite(n) || n <= 0) return "—";
    const digits = n >= 1000 ? 0 : Math.max(0, 4 - Math.floor(Math.log10(n)));
    return `${n.toFixed(Math.min(8, digits))} ${app.state.compareCoin || ""}`.trim();
  },

  /* **The window, at the range row's left end** (30 Sep 2026): "Zoomed",
     the navigator — the whole range small with the window on it, dragged to
     move it — and the way back. It was a chip over the plot's top-left,
     on the companion's index; the dates it printed are on the time axis,
     and in its label for a reader. */
  renderViewChip: () => {
    const v = app.chartViewNow();
    if (!v || !app.chartViewEnabled()) return null;
    const series = app.state.valueHistory;
    if (!Array.isArray(series) || series.length < 2) return null;
    const hi = viewMs(series[series.length - 1].time);
    const span = v.t1 - v.t0;
    const t1 = v.atNow ? hi : v.t1;
    const said = msg("view_zoomed", "Zoomed · $1", viewWindowText(t1 - span, t1));
    return React.createElement(
      ChartNavDock,
      null,
      React.createElement(
      ChartViewChip,
      { "data-chart-view-chip": "1", role: "group", "aria-label": said, title: said },
      React.createElement(ChartNavWord, null, msg("view_zoomed_short", "Zoomed")),
      React.createElement(ChartNavigator, { prices: series, view: v, viewRef: app.viewRef }),
      React.createElement(
        ChartViewReset,
        {
          onClick: app.resetChartView,
          title: msg("view_reset_title", "Show the whole range again (double-click the chart)"),
        },
        msg("view_reset", "Whole range"),
      ),
      ),
    );
  },
});
