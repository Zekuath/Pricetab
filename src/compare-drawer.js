/* THE COMPARE DRAWER (1 Oct 2026, *"compare soldan gelse, ana ekranı direk
 * kaplamasa daha iyi olur — sadece hangilerini compare edeceğin ile ilgili;
 * belki S&P 500 ve major şeylerle compare de edebiliriz ve onu da compare
 * ayarlarından seçebiliriz"*).
 *
 * It was the "/" jumper in a compare mode — a dialog over the whole screen
 * for choosing one thing to lay over the chart. Now it is a drawer on the
 * chart's column like the other four: what is being compared and Stop, a
 * search, the markets (COMPARE_MARKETS — the S&P 500 and the Nasdaq 100 as
 * Kraken's tokenized ETFs, gold as PAXG), your coins, the rest by search,
 * and its own settings: which markets the list offers. Typing and Enter pick
 * the first match, so "C, eth, Enter" works as it did. Loads before app.js. */

const COMPARE_DRAWER_SUGGEST = 8;

class CompareDrawer extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { query: "" };
    this.search = createRef();
    this.handleQuery = (e) => this.setState({ query: e.target.value });
    /* Esc from inside the search (the app's keys stand down in a field);
       Enter takes the first match — or, with nothing typed, the first of
       your coins, as the jumper's Enter did. */
    this.handleKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.props.onClose();
        return;
      }
      if (e.key !== "Enter") return;
      const first = this.state.query.trim()
        ? this.results()[0]
        : (this.props.coinOptions || []).filter((c) => c !== this.props.coin).map((c) => ({ id: c }))[0];
      if (first) {
        e.preventDefault();
        this.props.onPick(first.id);
        this.setState({ query: "" });
      }
    };
  }

  /* A press outside puts it away, like every drawer on this column — not
     one inside it or on the tab column, which changes drawers itself. */
  componentDidMount() {
    this.handleOutside = (event) => {
      if (!this.props.open || !this.box) return;
      const t = event.target;
      if (!t || this.box.contains(t)) return;
      if (t.closest && t.closest("[data-drawer-tabs]")) return;
      this.props.onClose();
    };
    document.addEventListener("mousedown", this.handleOutside);
  }

  componentWillUnmount() {
    document.removeEventListener("mousedown", this.handleOutside);
  }

  componentDidUpdate(prev) {
    // The search has the focus the moment the drawer is out, as the jumper did
    if (this.props.open && !prev.open && this.search.current) this.search.current.focus();
    if (!this.props.open && prev.open && this.state.query) this.setState({ query: "" });
  }

  /* What a query finds: markets by name or ticker, then coins the way "/"
     finds them (quickSwitchMatches), never the coin already on the chart. */
  results() {
    const q = this.state.query.trim().toLowerCase();
    if (!q) return [];
    const markets = (this.props.markets || [])
      .map(compareMarket)
      .filter((m) => m && `${m.id} ${m.name}`.toLowerCase().includes(q))
      .map((m) => ({ id: m.id, market: m }));
    const coins = quickSwitchMatches(this.state.query, this.props.coinOptions || [], this.props.coin)
      .filter((r) => r.chartable && !markets.some((m) => m.id === r.coin))
      .map((r) => ({ id: r.coin }));
    return [...markets, ...coins];
  }

  row(id, market) {
    const { compareCoin, period, onPick } = this.props;
    const on = compareCoin === id;
    const fromDay = market && market.source === "kraken" && !COMPARE_MARKET_PERIODS.includes(period);
    return React.createElement(
      ComparePickRow,
      {
        key: id,
        on,
        "aria-pressed": on ? "true" : "false",
        "data-compare-pick": id,
        onClick: () => onPick(id),
        title: market ? market.what : COIN_NAMES[id] || id,
      },
      React.createElement(ComparePickSym, null, market ? market.name : id),
      React.createElement(
        ComparePickName,
        null,
        market ? market.id : COIN_NAMES[id] || "",
        market ? React.createElement(ComparePickNote, null, market.what) : null,
      ),
      React.createElement(
        ComparePickTag,
        null,
        on ? msg("cmp_drawer_on", "On") : fromDay ? msg("cmp_drawer_from_1d", "opens on 1D") : "",
      ),
    );
  }

  section(key, head, rows) {
    if (!rows.length) return null;
    return React.createElement(
      CompareSection,
      { key, "data-compare-section": key },
      React.createElement(CompareSectionHead, null, head),
      React.createElement(CompareList, null, ...rows),
    );
  }

  render() {
    const { open, onClose, coin, compareCoin, coinOptions, markets, onStop, onMarketsChange } = this.props;
    /* **Nothing is built until it is first opened** — the chart drawer's
       rule (ChartSettingsDrawer.shouldBuild): a list of every market and coin
       inside a shut drawer on every new tab is work nobody sees. */
    if (open) this._opened = true;
    if (!this._opened) {
      return React.createElement(ChartDrawer, { open: false, "data-compare-drawer": "shut", "aria-hidden": "true" });
    }
    const q = this.state.query.trim();
    const found = q ? this.results() : null;
    const yours = (coinOptions || []).filter((c) => c !== coin);
    const more = SUGGESTED_COINS.filter((c) => c !== coin && !(coinOptions || []).includes(c)).slice(0, COMPARE_DRAWER_SUGGEST);
    const shown = (markets || []).map(compareMarket).filter(Boolean);
    const comparing = compareMarket(compareCoin);
    return React.createElement(
      ChartDrawer,
      {
        open,
        innerRef: (n) => (this.box = n),
        "data-compare-drawer": open ? "open" : "shut",
        "aria-hidden": open ? undefined : "true",
        role: "dialog",
        "aria-label": msg("drawer_tab_compare", "Compare"),
      },
      React.createElement(
        ChartDrawerHead,
        null,
        React.createElement(ChartDrawerTitle, null, msg("drawer_tab_compare", "Compare"), keyCap("C")),
        React.createElement(ChartDrawerClose, { onClick: onClose, "aria-label": msg("cmp_drawer_close", "Close compare") }, "×"),
      ),
      React.createElement(
        ChartDrawerBody,
        null,
        compareCoin
          ? React.createElement(
              CompareNow,
              { "data-compare-now": compareCoin },
              React.createElement("span", null, msg("cmp_drawer_now", "$1 against $2", coin, comparing ? comparing.name : compareCoin)),
              React.createElement(WidgetsDrawerAction, { onClick: onStop, "data-compare-stop": "1" }, msg("cmp_stop", "Stop")),
            )
          : null,
        React.createElement(CompareSearch, {
          innerRef: this.search,
          type: "search",
          value: this.state.query,
          onChange: this.handleQuery,
          onKeyDown: this.handleKey,
          placeholder: msg("cmp_drawer_search", "Compare $1 with…", coin),
          "aria-label": msg("cmp_drawer_search", "Compare $1 with…", coin),
          "data-compare-search": "1",
        }),
        found
          ? this.section("found", msg("cmp_drawer_found", "Found"), found.map((r) => this.row(r.id, r.market)))
          : React.createElement(
              Fragment,
              null,
              this.section("markets", msg("cmp_drawer_markets", "Markets"), shown.map((m) => this.row(m.id, m))),
              this.section("yours", msg("cmp_drawer_yours", "Your coins"), yours.map((c) => this.row(c))),
              this.section("more", msg("cmp_drawer_more", "More coins — type to find any"), more.map((c) => this.row(c))),
            ),
        found && !found.length ? React.createElement(CompareHint, null, msg("cmp_drawer_none", "Nothing matches that")) : null,
        /* Its own settings: which markets the list offers, and what each is. */
        React.createElement(
          CompareSection,
          { "data-compare-settings": "1" },
          React.createElement(CompareSectionHead, null, msg("cmp_drawer_settings", "Markets in this list")),
          ...COMPARE_MARKETS.map((m) =>
            React.createElement(
              ToggleRow,
              { key: m.id },
              React.createElement(
                "span",
                null,
                React.createElement(ComparePickSym, null, m.name),
                React.createElement(ComparePickNote, null, m.what),
              ),
              React.createElement(ToggleSwitch, {
                active: (markets || []).includes(m.id),
                "aria-pressed": (markets || []).includes(m.id) ? "true" : "false",
                "aria-label": msg("cmp_drawer_market_aria", "Offer $1 to compare with", m.name),
                "data-compare-market-switch": m.id,
                onClick: () =>
                  onMarketsChange(
                    (markets || []).includes(m.id) ? markets.filter((x) => x !== m.id) : [...(markets || []), m.id],
                  ),
              }),
            ),
          ),
          React.createElement(
            CompareHint,
            null,
            msg(
              "cmp_drawer_markets_note",
              "The S&P 500 and the Nasdaq 100 are Kraken's tokens for the SPY and QQQ ETFs, priced in USD around the clock: over six months their price stayed within 2.5% of the ETFs and their moves within a point. They trade thinly minute by minute, so they are drawn from 1D up.",
            ),
          ),
        ),
      ),
      React.createElement(
        ChartDrawerFoot,
        null,
        msg("cmp_drawer_foot", "Type and Enter picks the first match. This drawer: "),
        React.createElement(ChartDrawerKey, null, "C"),
      ),
    );
  }
}
