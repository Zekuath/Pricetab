/* QUICK SWITCH
 * Press "/" on the main view to jump between coins by typing. Searches the
 * user's own list first, then the rest of the supported coins — picking one
 * of those adds it to the list and switches to it. Keyboard-only by design:
 * type, arrow, Enter. Esc closes.
 */

const QUICK_SWITCH_MAX_RESULTS = 8;

// Matches on symbol or full name. Coins already on the user's list rank
// first (switching is the common case, adding is the exception).
const quickSwitchMatches = (query, coinOptions) => {
  const q = query.trim().toUpperCase();
  const owned = new Set(coinOptions);
  const score = (sym) => {
    const name = (COIN_NAMES[sym] || "").toUpperCase();
    if (!q) return owned.has(sym) ? 0 : -1; // empty query lists the user's coins
    if (sym === q) return 0;
    if (sym.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (sym.includes(q)) return 3;
    if (name.includes(q)) return 4;
    return -1;
  };
  const results = [];
  for (const sym of SUGGESTED_COINS) {
    const s = score(sym);
    if (s < 0) continue;
    results.push({ coin: sym, owned: owned.has(sym), score: s });
  }
  results.sort((a, b) => {
    if (a.owned !== b.owned) return a.owned ? -1 : 1;
    if (a.score !== b.score) return a.score - b.score;
    return a.coin.localeCompare(b.coin);
  });
  return results.slice(0, QUICK_SWITCH_MAX_RESULTS);
};

/* ── styles ────────────────────────────────────────────────────────────── */

const quickIn = keyframes`
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const QuickOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 18vh;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.75)"
      : "rgba(0, 0, 0, 0.75)"};
`;

const QuickCard = styled.div`
  width: min(28rem, calc(100vw - 2rem));
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  box-shadow: 0 8px 32px ${({ theme }) => theme.color.shadow};
  overflow: hidden;
  animation: ${quickIn} 0.18s cubic-bezier(0.22, 1, 0.36, 1);
`;

const QuickInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 0.85rem 1rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.95rem;
  color: ${({ theme }) => theme.color.text};
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  &:focus {
    outline: none;
  }
`;

const QuickList = styled.div`
  max-height: 17rem;
  overflow-y: auto;
`;

const QuickRow = styled.button.attrs(() => ({ type: "button" }))`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  text-align: left;
  padding: 0.6rem 1rem;
  border: none;
  background: ${({ active, theme }) =>
    active ? theme.color.bg : "transparent"};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.color.bg};
  }
`;

const QuickSym = styled.span`
  font-weight: 700;
  min-width: 3.5rem;
`;

const QuickName = styled.span`
  flex: 1;
  min-width: 0;
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.78rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const QuickTag = styled.span`
  flex: 0 0 auto;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const QuickHint = styled.div`
  padding: 0.5rem 1rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.66rem;
  color: ${({ theme }) => theme.color.textSecondary};
  display: flex;
  gap: 1rem;
`;

const QuickEmpty = styled.div`
  padding: 1rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* ── component ─────────────────────────────────────────────────────────── */

class QuickSwitch extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { query: "", index: 0 };
    this.inputRef = createRef();
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleChange = this.handleChange.bind(this);
  }

  componentDidMount() {
    if (this.inputRef.current) this.inputRef.current.focus();
  }

  results() {
    return quickSwitchMatches(this.state.query, this.props.coinOptions);
  }

  handleChange(e) {
    this.setState({ query: e.target.value, index: 0 });
  }

  handleKeyDown(e) {
    const results = this.results();
    if (e.key === "Escape") {
      e.preventDefault();
      this.props.onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      this.setState((s) => ({
        index: results.length ? (s.index + 1) % results.length : 0,
      }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.setState((s) => ({
        index: results.length
          ? (s.index - 1 + results.length) % results.length
          : 0,
      }));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[this.state.index];
      if (pick) this.props.onPick(pick.coin, pick.owned);
    }
  }

  render() {
    const results = this.results();
    const { index } = this.state;
    return React.createElement(
      QuickOverlay,
      {
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) this.props.onClose();
        },
      },
      React.createElement(
        QuickCard,
        null,
        React.createElement(QuickInput, {
          innerRef: this.inputRef,
          type: "text",
          value: this.state.query,
          placeholder: "Jump to a coin…",
          "aria-label": "Jump to a coin",
          onChange: this.handleChange,
          onKeyDown: this.handleKeyDown,
        }),
        results.length === 0
          ? React.createElement(QuickEmpty, null, "No coin matches that.")
          : React.createElement(
              QuickList,
              null,
              results.map((r, i) =>
                React.createElement(
                  QuickRow,
                  {
                    key: r.coin,
                    active: i === index,
                    onMouseEnter: () => this.setState({ index: i }),
                    onClick: () => this.props.onPick(r.coin, r.owned),
                  },
                  coinMark(r.coin, 1.4),
                  React.createElement(QuickSym, null, r.coin),
                  React.createElement(
                    QuickName,
                    null,
                    COIN_NAMES[r.coin] || r.coin,
                  ),
                  !r.owned && React.createElement(QuickTag, null, "add"),
                ),
              ),
            ),
        React.createElement(
          QuickHint,
          null,
          React.createElement("span", null, "↑↓ move"),
          React.createElement("span", null, "↵ select"),
          React.createElement("span", null, "esc close"),
        ),
      ),
    );
  }
}

QuickSwitch.defaultProps = {
  coinOptions: [],
};
