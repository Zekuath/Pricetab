/* PORTFOLIO (tracking only)
 * Full-screen view for manually-entered holdings. No wallet connection, no
 * transactions, no money movement — purely "what would my coins be worth".
 * Holdings persist in localStorage; prices come from the shared
 * pageTickerCache (filled by the parent). All math is read-only.
 */

const PORTFOLIO_MAX_HOLDINGS = 50; // sanity cap, plenty for tracking

/* ── styled components ─────────────────────────────────────────────────── */
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
`;

const PortfolioInner = styled.div`
  width: 100%;
  max-width: 760px;
`;

const PortfolioHeader = styled.div`
  margin-bottom: 1.5rem;
`;

const PortfolioEyebrow = styled.div`
  font-size: 0.72rem;
  letter-spacing: 0.08em;
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

const RemoveBtn = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.2rem 0.3rem;
  border-radius: 6px;
  &:hover {
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
    this.state = { query: "", drafts: {} };
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
    this.setState((s) => {
      const drafts = { ...s.drafts };
      delete drafts[coin];
      return { drafts };
    });
    // Commit a clean value (empty/invalid → 0)
    const raw = this.state.drafts[coin];
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
    const { query, drafts } = this.state;
    const { rows, totalNow, pnl, pnlPct, anyPriced } = this.computeTotals();
    const suggestions = this.matches();
    const atCap = holdings.length >= PORTFOLIO_MAX_HOLDINGS;

    return React.createElement(
      PortfolioShell,
      null,
      React.createElement(
        PortfolioInner,
        null,
        // Header: total value + 24h P/L
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
          holdings.length > 0 &&
            anyPriced &&
            pnl != null &&
            React.createElement(
              PortfolioDelta,
              { up: pnl === 0 ? null : pnl > 0 },
              // fmtMoney(pnl, true) already prints a +/- sign
              this.fmtMoney(pnl, true) +
                (pnlPct != null
                  ? ` (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%) 24h`
                  : " 24h"),
            ),
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
};
