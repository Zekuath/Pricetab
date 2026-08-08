/* PRICE TARGETS (in-tab)
 * Deliberately not called "alerts": nothing is pushed. You set a target and
 * PriceTab tells you it was hit the next time you open a tab — which, for a
 * new-tab page, is many times a day. Keeping it in-tab is what lets the
 * extension stay zero-permission (no `notifications`).
 *
 * Detection does look backwards, though: candle highs/lows are checked, so
 * a target hit overnight is still reported even though nothing was watching.
 *
 * A target is { id, coin, direction: "above"|"below", target, currency,
 * created, triggeredAt }. The number only means something in the currency it
 * was set in, so targets are evaluated only while that currency is on
 * display; others are shown as paused rather than silently compared wrong.
 */

/* Was the target hit inside the candle window, after the target was set?
 * Checking the current price alone only answers "is it past the target right
 * now" — a move that happened and reverted overnight would be missed
 * entirely. Candle highs/lows record the extremes, so a target hit while no
 * tab was open is still found the next time one opens. Returns when it was
 * first hit, or null. */
const targetHitInCandles = (target, candles) => {
  if (!Array.isArray(candles) || !candles.length) return null;
  for (const c of candles) {
    if (c.time < target.created) continue; // before it was set
    const hit =
      target.direction === "above"
        ? Number(c.high) >= target.target
        : Number(c.low) <= target.target;
    if (hit) return c.time;
  }
  return null;
};

/* Evaluate targets against the freshest prices and, where available, the
 * candle history. Pure: returns the ones to mark as hit, leaving
 * persistence and UI to the caller. Each result carries `hitAt` (when the
 * candles say it happened) or null for "it is past the target right now". */
const findTriggeredAlerts = (alerts, prices, currency, candlesByCoin) => {
  const fired = [];
  for (const a of alerts || []) {
    if (a.triggeredAt) continue;
    if (a.currency !== currency) continue; // paused in another currency
    const hitAt = targetHitInCandles(
      a,
      candlesByCoin ? candlesByCoin[a.coin] : null,
    );
    if (hitAt) {
      fired.push({ ...a, price: a.target, hitAt });
      continue;
    }
    const price = prices ? Number(prices[a.coin]) : NaN;
    if (!isFinite(price) || price <= 0) continue;
    if (a.direction === "above" ? price >= a.target : price <= a.target) {
      fired.push({ ...a, price, hitAt: null });
    }
  }
  return fired;
};

// Which coins need a price for the alert check (unfired, current currency)
const alertCoinsToWatch = (alerts, currency) => {
  const coins = new Set();
  for (const a of alerts || []) {
    if (!a.triggeredAt && a.currency === currency) coins.add(a.coin);
  }
  return [...coins];
};

/* ── styles ────────────────────────────────────────────────────────────── */

const alertIn = keyframes`
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// Fired-alert banners, stacked under the top edge
const AlertToastStack = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.spacing.medium}rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: center;
`;

const AlertToast = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}rem;
  max-width: min(30rem, calc(100vw - 2rem));
  padding: ${({ theme }) => theme.spacing.small}rem
    ${({ theme }) => theme.spacing.medium}rem;
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid
    ${({ theme, up }) =>
      up ? theme.color.chartLineGreen : theme.color.chartLineRed};
  border-radius: ${({ theme }) => theme.scale * 2}rem;
  box-shadow: 0 ${({ theme }) => theme.scale * 2}rem
    ${({ theme }) => theme.scale * 4}rem ${({ theme }) => theme.color.shadow};
  font-size: 0.78rem;
  color: ${({ theme }) => theme.color.text};
  animation: ${alertIn} 0.25s ease-out;
`;

const AlertToastClose = styled.button.attrs(() => ({ type: "button" }))`
  flex: 0 0 auto;
  background: transparent;
  border: none;
  padding: 0;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 1rem;
  line-height: 1;
  color: ${({ theme }) => theme.color.textSecondary};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

const AlertsOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 1rem 1rem;
  background: ${({ theme }) =>
    theme.color.bg === "#ffffff"
      ? "rgba(255, 255, 255, 0.85)"
      : "rgba(0, 0, 0, 0.88)"};
`;

const AlertsCard = styled.div`
  width: min(30rem, 100%);
  max-height: 70vh;
  overflow-y: auto;
  padding: 1.25rem;
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  box-shadow: 0 8px 32px ${({ theme }) => theme.color.shadow};
  animation: ${alertIn} 0.2s cubic-bezier(0.22, 1, 0.36, 1);
`;

const AlertsTitle = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.75rem;
`;

const AlertRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.82rem;

  &:first-of-type {
    border-top: none;
  }
`;

const AlertText = styled.span`
  flex: 1;
  min-width: 0;
  color: ${({ theme, muted }) =>
    muted ? theme.color.textSecondary : theme.color.text};
`;

const AlertMeta = styled.span`
  flex: 0 0 auto;
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertRemove = styled.button.attrs(() => ({ type: "button" }))`
  flex: 0 0 auto;
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.chartLineRed};
  }
`;

const AlertForm = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.9rem;
`;

const AlertSelect = styled.select`
  padding: 0.55rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.82rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const AlertInput = styled.input`
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.55rem 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.82rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const AlertAdd = styled.button.attrs(() => ({ type: "button" }))`
  flex: 0 0 auto;
  padding: 0 0.9rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.78rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const AlertsNote = styled.div`
  margin-top: 0.9rem;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const AlertsEmpty = styled.div`
  padding: 0.5rem 0 0.2rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* ── panel ─────────────────────────────────────────────────────────────── */

class AlertsPanel extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      coin: props.activeCoin,
      direction: "above",
      target: "",
    };
    this.handleAdd = this.handleAdd.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  handleAdd() {
    const target = Number(this.state.target);
    if (!isFinite(target) || target <= 0) return;
    this.props.onAdd(this.state.coin, this.state.direction, target);
    this.setState({ target: "" });
  }

  handleKeyDown(e) {
    if (e.key === "Enter") this.handleAdd();
  }

  describe(a) {
    const price = this.props.formatPrice(a.target, a.currency);
    return `${a.coin} ${a.direction === "above" ? "rises above" : "drops below"} ${price}`;
  }

  render() {
    const { alerts, currency, coinOptions, onRemove, onClose } = this.props;
    const atCap = alerts.length >= MAX_ALERTS;
    return React.createElement(
      AlertsOverlay,
      {
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
      React.createElement(
        AlertsCard,
        null,
        React.createElement(
          AlertsTitle,
          null,
          `Price targets · ${alerts.length}/${MAX_ALERTS}`,
        ),
        alerts.length === 0 &&
          React.createElement(
            AlertsEmpty,
            null,
            "No targets yet. Set one below and PriceTab will tell you when it is hit — the next time you open a tab.",
          ),
        alerts.map((a) =>
          React.createElement(
            AlertRow,
            { key: a.id },
            coinMark(a.coin, 1.4),
            React.createElement(
              AlertText,
              { muted: Boolean(a.triggeredAt) },
              this.describe(a),
            ),
            a.triggeredAt
              ? React.createElement(AlertMeta, null, "hit")
              : a.currency !== currency
                ? React.createElement(AlertMeta, null, `paused · ${a.currency}`)
                : null,
            React.createElement(
              AlertRemove,
              {
                title: "Remove target",
                "aria-label": `Remove ${a.coin} target`,
                onClick: () => onRemove(a.id),
              },
              "×",
            ),
          ),
        ),
        React.createElement(
          AlertForm,
          null,
          React.createElement(
            AlertSelect,
            {
              value: this.state.coin,
              "aria-label": "Target coin",
              onChange: (e) => this.setState({ coin: e.target.value }),
            },
            coinOptions.map((c) =>
              React.createElement("option", { key: c, value: c }, c),
            ),
          ),
          React.createElement(
            AlertSelect,
            {
              value: this.state.direction,
              "aria-label": "Target direction",
              onChange: (e) => this.setState({ direction: e.target.value }),
            },
            React.createElement("option", { value: "above" }, "rises above"),
            React.createElement("option", { value: "below" }, "drops below"),
          ),
          React.createElement(AlertInput, {
            type: "text",
            inputMode: "decimal",
            value: this.state.target,
            placeholder: `target in ${currency}`,
            "aria-label": "Target price",
            onChange: (e) => this.setState({ target: e.target.value }),
            onKeyDown: this.handleKeyDown,
          }),
          React.createElement(
            AlertAdd,
            { onClick: this.handleAdd, disabled: atCap },
            "Add",
          ),
        ),
        React.createElement(
          AlertsNote,
          null,
          atCap
            ? `Target limit reached (${MAX_ALERTS}). Remove one to add another.`
            : "Checked when you open a tab, including targets hit while you were away. No notification permission, nothing leaves your device.",
        ),
      ),
    );
  }
}

AlertsPanel.defaultProps = {
  alerts: [],
  coinOptions: [],
  activeCoin: "BTC",
  currency: "USD",
};
