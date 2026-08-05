/* PORTFOLIO (tracking only)
 * Full-screen view for manually-entered holdings. No wallet connection, no
 * transactions, no money movement — purely "what would my coins be worth".
 * Holdings persist in localStorage; prices come from the shared
 * pageTickerCache (filled by the parent). All math is read-only.
 */

const PORTFOLIO_MAX_HOLDINGS = 50; // sanity cap, plenty for tracking

/* ── background value chart ────────────────────────────────────────────────
 * Total portfolio value over time, drawn full-bleed behind the content with
 * the same Line chart the main view uses. Per-coin price histories are
 * fetched once per period/currency and summed as amount × price(t), so
 * editing an amount re-shapes the chart instantly without a refetch.
 */
const PORTFOLIO_CHART_MAX_COINS = 12; // chart the biggest holdings by value
const PORTFOLIO_CHART_BATCH_SIZE = 4; // history requests per burst
const PORTFOLIO_CHART_BATCH_DELAY = 400; // ms between bursts (be kind to Coinbase)
const PORTFOLIO_HISTORY_TTL = 300000; // 5 min — history barely moves in-session

// Periods for the value chart — "hour" is tick noise for a portfolio total
const PORTFOLIO_CHART_PERIODS = PERIOD_OPTIONS.filter(
  (o) => o.value !== "hour",
);

// coin-period-currency → { data, timestamp }; in-memory, survives view reopen
const portfolioHistoryCache = new Map();

const getPortfolioHistory = async (coin, period, currency) => {
  const key = `${coin}-${period}-${currency}`;
  const hit = portfolioHistoryCache.get(key);
  if (hit && Date.now() - hit.timestamp < PORTFOLIO_HISTORY_TTL) {
    return hit.data;
  }
  try {
    // useCache reads the shared price cache (free hit for the active main-chart
    // coin); allowedCoins stays empty so portfolio coins never write into it.
    const data = await fetchValueHistory(coin, period, currency);
    portfolioHistoryCache.set(key, { data, timestamp: Date.now() });
    return data;
  } catch (e) {
    return hit ? hit.data : null; // stale beats blank; missing coins are skipped
  }
};

// Sum per-coin histories into one total-value series. Series are aligned from
// the end (latest points line up); the range trims to the shortest history so
// a young coin can't fabricate a pre-listing portfolio value.
const buildPortfolioSeries = (histories, holdings) => {
  const parts = [];
  for (const h of holdings) {
    if (!(h.amount > 0)) continue;
    const prices = histories[h.coin];
    if (Array.isArray(prices) && prices.length > 1) {
      parts.push({ amount: h.amount, prices });
    }
  }
  if (!parts.length) return null;
  const len = Math.min(...parts.map((p) => p.prices.length));
  if (len < 2) return null;
  const base = parts[0].prices;
  const series = [];
  for (let i = 0; i < len; i++) {
    let total = 0;
    for (const p of parts) {
      total += p.prices[p.prices.length - len + i].price * p.amount;
    }
    series.push({ price: total, time: base[base.length - len + i].time });
  }
  return series;
};

/* ── styled components ─────────────────────────────────────────────────── */
// Same entrance family as SettingsCard's panelLift / WidgetCard's widgetAppear
const portfolioFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const portfolioLift = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
`;

const PortfolioShell = styled.section`
  position: fixed;
  inset: 0;
  z-index: 100;
  overflow-y: auto;
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  padding: 4.5rem 1.25rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: ${portfolioFadeIn} 0.3s ease;
`;

// Full-bleed total-value chart behind the content. Fixed so the list scrolls
// over it; muted opacity keeps the header/rows readable on top.
const PortfolioChartBg = styled.div`
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.45;
  animation: ${portfolioFadeIn} 0.6s ease;
`;

const PortfolioInner = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 760px;
  animation: ${portfolioLift} 0.4s cubic-bezier(0.22, 1, 0.36, 1);
`;

const PortfolioHeader = styled.div`
  margin-bottom: 1.5rem;
`;

// Mirrors SettingsGroupTitle's label treatment (size + tracking)
const PortfolioEyebrow = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.35rem;
`;

const PortfolioTotal = styled.div`
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1.1;
`;

const PortfolioDelta = styled.div`
  margin-top: 0.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: ${({ theme, up }) =>
    up == null
      ? theme.color.textSecondary
      : up
        ? theme.color.chartLineGreen
        : theme.color.chartLineRed};
`;

// Pulls the (generously padded) PeriodSwitcher into the portfolio's rhythm
const PortfolioPeriodRow = styled.div`
  margin: -1.25rem 0 -0.75rem;
`;

const HoldingsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const HoldingRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 7.5rem 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.color.bgSecondary};
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr 6rem auto;
  }
`;

const HoldingCoin = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const HoldingSym = styled.div`
  font-weight: 700;
  font-size: 0.95rem;
`;

const HoldingName = styled.div`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AmountInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  text-align: right;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 7px;
  transition: border-color 0.15s ease;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const HoldingValue = styled.div`
  text-align: right;
  min-width: 0;
`;

const HoldingValueMain = styled.div`
  font-weight: 600;
  font-size: 0.9rem;
`;

const HoldingValueSub = styled.div`
  font-size: 0.72rem;
  color: ${({ theme, up }) =>
    up == null
      ? theme.color.textSecondary
      : up
        ? theme.color.chartLineGreen
        : theme.color.chartLineRed};

  @media (max-width: 560px) {
    display: none;
  }
`;

// Circular hover treatment, same as SettingsClose
const RemoveBtn = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  width: 1.7rem;
  height: 1.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  &:hover {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.chartLineRed};
  }
`;

const AddSection = styled.div`
  margin-top: 1.5rem;
  position: relative;
`;

const AddLabel = styled.div`
  font-size: 0.78rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.5rem;
`;

const SearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 0.7rem 0.85rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.9rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  transition: border-color 0.15s ease;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const Suggestions = styled.div`
  margin-top: 0.4rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bgSecondary};
  box-shadow: 0 2px 8px ${({ theme }) => theme.color.shadow};
  animation: ${portfolioLift} 0.25s cubic-bezier(0.22, 1, 0.36, 1);
`;

const SuggestionRow = styled.button`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 0.6rem 0.85rem;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease;
  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.color.bg};
  }
`;

const SuggestionName = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.78rem;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 2.5rem 1rem;
  color: ${({ theme }) => theme.color.textSecondary};
  border: 1px dashed ${({ theme }) => theme.color.border};
  border-radius: 12px;
  font-size: 0.9rem;
`;

const PrivacyNote = styled.div`
  margin-top: 1.5rem;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
  text-align: center;
`;

/* ── component ─────────────────────────────────────────────────────────── */
class Portfolio extends PureComponent {
  constructor(props) {
    super(props);
    // `drafts` holds in-progress amount text so typing "0." / "" never fights
    // the canonical numeric value coming back from the parent.
    this.state = {
      query: "",
      drafts: {},
      chartPeriod: loadPortfolioPeriodFromStorage(),
      histories: {}, // { COIN: [{ price, time }] } for the background chart
    };
    this._chartToken = 0; // invalidates in-flight history loads
    this._chartSig = null; // last loaded coins|currency|period signature
    this._seriesMemo = null; // keeps the summed series referentially stable
  }

  componentDidMount() {
    this.maybeLoadHistories();
  }

  componentDidUpdate() {
    this.maybeLoadHistories();
  }

  componentWillUnmount() {
    this._chartToken++; // drop any in-flight load's setState
  }

  // The biggest holdings by current value, capped so a period switch never
  // fires more than PORTFOLIO_CHART_MAX_COINS history requests.
  chartCoins() {
    const { holdings, prices } = this.props;
    const value = (h) => {
      const p = prices[h.coin];
      return p && isFinite(p.price) ? p.price * h.amount : 0;
    };
    return holdings
      .filter((h) => h.amount > 0)
      .sort((a, b) => value(b) - value(a))
      .slice(0, PORTFOLIO_CHART_MAX_COINS)
      .map((h) => h.coin);
  }

  // Idempotent: reloads histories only when the coin set, currency or period
  // actually changed (sorted signature, so value-rank reshuffles don't count).
  maybeLoadHistories() {
    const sig =
      this.chartCoins().slice().sort().join(",") +
      "|" +
      this.props.currency +
      "|" +
      this.state.chartPeriod;
    if (sig === this._chartSig) return;
    this._chartSig = sig;
    this.loadHistories();
  }

  loadHistories = async () => {
    const { currency } = this.props;
    const period = this.state.chartPeriod;
    const coins = this.chartCoins();
    const token = ++this._chartToken;
    if (!coins.length) {
      this.setState({ histories: {} });
      return;
    }
    const histories = {};
    for (let i = 0; i < coins.length; i += PORTFOLIO_CHART_BATCH_SIZE) {
      if (token !== this._chartToken) return; // superseded or unmounted
      const batch = coins.slice(i, i + PORTFOLIO_CHART_BATCH_SIZE);
      await Promise.all(
        batch.map(async (coin) => {
          const data = await getPortfolioHistory(coin, period, currency);
          if (data) histories[coin] = data;
        }),
      );
      if (i + PORTFOLIO_CHART_BATCH_SIZE < coins.length) {
        await sleep(PORTFOLIO_CHART_BATCH_DELAY);
      }
    }
    if (token !== this._chartToken) return;
    this.setState({ histories });
  };

  handlePeriodChange = (_e, period) => {
    if (!period || period === this.state.chartPeriod) return;
    savePortfolioPeriodToStorage(period);
    this.setState({ chartPeriod: period }); // componentDidUpdate reloads
  };

  // Memoized on (histories, holdings) refs so re-renders from typing don't
  // hand the Line a new array and restart its path transition.
  totalSeries() {
    const { holdings } = this.props;
    const { histories } = this.state;
    const memo = this._seriesMemo;
    if (memo && memo.histories === histories && memo.holdings === holdings) {
      return memo.series;
    }
    const series = buildPortfolioSeries(histories, holdings);
    this._seriesMemo = { histories, holdings, series };
    return series;
  }

  fmtMoney(value, withSign) {
    const { currency, decimalPlaces, separatorFormat } = this.props;
    return formatNumberString(
      value,
      getCurrencySymbol(currency),
      !withSign,
      false,
      decimalPlaces,
      separatorFormat,
    );
  }

  // Derive totals + per-holding values from the shared price map
  computeTotals() {
    const { holdings, prices } = this.props;
    let totalNow = 0;
    let totalAgo = 0;
    let anyPriced = false;
    const rows = holdings.map((h) => {
      const p = prices[h.coin];
      const price = p && isFinite(p.price) ? p.price : null;
      const value = price != null ? price * h.amount : null;
      if (value != null) {
        anyPriced = true;
        totalNow += value;
        // 24h-ago value implied by the 24h % change (when known)
        if (p && isFinite(p.change)) {
          totalAgo += value / (1 + p.change / 100);
        } else {
          totalAgo += value;
        }
      }
      return { ...h, price, value, change: p ? p.change : null, up: p ? p.up : null };
    });
    const pnl = anyPriced ? totalNow - totalAgo : null;
    const pnlPct = pnl != null && totalAgo > 0 ? (pnl / totalAgo) * 100 : null;
    return { rows, totalNow, pnl, pnlPct, anyPriced };
  }

  handleSearchChange = (e) => this.setState({ query: e.target.value });

  handleAdd = (coin) => {
    this.setState({ query: "" });
    this.props.onAdd(coin, 0);
  };

  handleAmountChange = (coin, raw) => {
    this.setState((s) => ({ drafts: { ...s.drafts, [coin]: raw } }));
    const num = Number(raw);
    if (raw !== "" && isFinite(num) && num >= 0) {
      this.props.onUpdateAmount(coin, num);
    }
  };

  handleAmountBlur = (coin) => {
    // Read the draft before clearing it — setState is async, but don't rely on it
    const raw = this.state.drafts[coin];
    this.setState((s) => {
      const drafts = { ...s.drafts };
      delete drafts[coin];
      return { drafts };
    });
    // Commit a clean value (empty/invalid → 0)
    if (raw !== undefined) {
      const num = Number(raw);
      this.props.onUpdateAmount(coin, isFinite(num) && num >= 0 ? num : 0);
    }
  };

  // Coin matches for the add search: symbol or full name, excluding held coins
  matches() {
    const q = this.state.query.trim().toUpperCase();
    if (!q) return [];
    const held = new Set(this.props.holdings.map((h) => h.coin));
    return SUGGESTED_COINS.filter((sym) => {
      if (held.has(sym)) return false;
      const name = (COIN_NAMES[sym] || "").toUpperCase();
      return sym.includes(q) || name.includes(q);
    }).slice(0, 8);
  }

  render() {
    const { holdings, ready } = this.props;
    const { query, drafts, chartPeriod } = this.state;
    const { rows, totalNow, pnl, pnlPct, anyPriced } = this.computeTotals();
    const suggestions = this.matches();
    const atCap = holdings.length >= PORTFOLIO_MAX_HOLDINGS;

    // Background chart series + its first→last change over the chart period
    const series = this.totalSeries();
    const seriesFirst = series ? series[0].price : null;
    const seriesDelta = series
      ? series[series.length - 1].price - seriesFirst
      : null;
    const seriesPct =
      seriesDelta != null && seriesFirst > 0
        ? (seriesDelta / seriesFirst) * 100
        : null;
    const periodOption = PORTFOLIO_CHART_PERIODS.find(
      (o) => o.value === chartPeriod,
    );
    const periodLabel = periodOption ? periodOption.label : "";

    return React.createElement(
      PortfolioShell,
      null,
      // Total-value chart, full-bleed behind everything (decorative)
      series &&
        React.createElement(
          PortfolioChartBg,
          { "aria-hidden": true },
          React.createElement(Line, {
            prices: series,
            colorize: this.props.chartColorize,
          }),
        ),
      React.createElement(
        PortfolioInner,
        null,
        // Header: total value + change over the chart period (24h fallback)
        React.createElement(
          PortfolioHeader,
          null,
          React.createElement(PortfolioEyebrow, null, "Portfolio · Total value"),
          React.createElement(
            PortfolioTotal,
            null,
            !holdings.length || !anyPriced
              ? this.fmtMoney(0, false)
              : this.fmtMoney(totalNow, false),
          ),
          seriesDelta != null
            ? React.createElement(
                PortfolioDelta,
                { up: seriesDelta === 0 ? null : seriesDelta > 0 },
                // fmtMoney(delta, true) already prints a +/- sign
                this.fmtMoney(seriesDelta, true) +
                  (seriesPct != null
                    ? ` (${seriesPct >= 0 ? "+" : ""}${seriesPct.toFixed(2)}%)`
                    : "") +
                  ` · ${periodLabel}`,
              )
            : holdings.length > 0 &&
                anyPriced &&
                pnl != null &&
                React.createElement(
                  PortfolioDelta,
                  { up: pnl === 0 ? null : pnl > 0 },
                  this.fmtMoney(pnl, true) +
                    (pnlPct != null
                      ? ` (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%) 24h`
                      : " 24h"),
                ),
        ),

        // Chart range switcher (persisted; drives the background chart)
        holdings.length > 0 &&
          React.createElement(
            PortfolioPeriodRow,
            null,
            React.createElement(PeriodSwitcher, {
              onChange: this.handlePeriodChange,
              options: PORTFOLIO_CHART_PERIODS,
              value: chartPeriod,
            }),
          ),

        // Holdings list or empty state
        holdings.length === 0
          ? React.createElement(
              EmptyState,
              null,
              "No holdings yet. Search a coin below to start tracking — amounts only, no wallet needed.",
            )
          : React.createElement(
              HoldingsList,
              null,
              rows.map((r) => {
                const draft = drafts[r.coin];
                const amountVal =
                  draft !== undefined ? draft : String(r.amount);
                return React.createElement(
                  HoldingRow,
                  { key: r.coin },
                  React.createElement(
                    HoldingCoin,
                    null,
                    React.createElement(HoldingSym, null, r.coin),
                    React.createElement(
                      HoldingName,
                      null,
                      COIN_NAMES[r.coin] || r.coin,
                    ),
                  ),
                  React.createElement(AmountInput, {
                    type: "text",
                    inputMode: "decimal",
                    value: amountVal,
                    "aria-label": `${r.coin} amount`,
                    onChange: (e) =>
                      this.handleAmountChange(r.coin, e.target.value),
                    onBlur: () => this.handleAmountBlur(r.coin),
                  }),
                  React.createElement(
                    HoldingValue,
                    null,
                    React.createElement(
                      HoldingValueMain,
                      null,
                      r.value != null
                        ? this.fmtMoney(r.value, false)
                        : ready
                          ? "—"
                          : "…",
                    ),
                    React.createElement(
                      HoldingValueSub,
                      { up: r.change == null ? null : r.up },
                      r.change != null
                        ? `${r.change >= 0 ? "+" : ""}${r.change.toFixed(2)}%`
                        : "",
                    ),
                  ),
                  React.createElement(
                    RemoveBtn,
                    {
                      type: "button",
                      "aria-label": `Remove ${r.coin}`,
                      title: "Remove",
                      onClick: () => this.props.onRemove(r.coin),
                    },
                    "×",
                  ),
                );
              }),
            ),

        // Add holding
        React.createElement(
          AddSection,
          null,
          React.createElement(
            AddLabel,
            null,
            atCap ? "Holding limit reached" : "Add a holding",
          ),
          !atCap &&
            React.createElement(SearchInput, {
              type: "text",
              value: query,
              placeholder: "Search coin (e.g. BTC or Bitcoin)…",
              "aria-label": "Search coin to add",
              onChange: this.handleSearchChange,
            }),
          !atCap &&
            suggestions.length > 0 &&
            React.createElement(
              Suggestions,
              null,
              suggestions.map((sym) =>
                React.createElement(
                  SuggestionRow,
                  {
                    key: sym,
                    type: "button",
                    onClick: () => this.handleAdd(sym),
                  },
                  React.createElement("span", null, sym),
                  React.createElement(
                    SuggestionName,
                    null,
                    COIN_NAMES[sym] || "",
                  ),
                ),
              ),
            ),
        ),

        React.createElement(
          PrivacyNote,
          null,
          "Tracking only · no wallet connection · stored locally on this device.",
        ),
      ),
    );
  }
}

Portfolio.defaultProps = {
  holdings: [],
  prices: {},
  ready: false,
  chartColorize: true,
};
