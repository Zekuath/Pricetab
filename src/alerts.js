/* PRICE TARGETS (in-tab)
 * Deliberately not called "alerts": nothing is pushed. You set a target and
 * PriceTab tells you it was hit the next time you open a tab — which, for a
 * new-tab page, is many times a day. Keeping it in-tab is what lets the
 * extension stay zero-permission (no `notifications`).
 *
 * Detection does look backwards, though: candle highs/lows are checked, so
 * a target hit overnight is still reported even though nothing was watching.
 *
 * A target is
 *   { id, coin, kind: "price"|"percent", direction: "above"|"below", target,
 *     currency, created, startPrice, triggeredAt, hitPrice }
 *
 * Two kinds, because they answer different questions:
 *
 *   price   — "BTC rises above 80,000". The number only means something in
 *             the currency it was set in, so these are evaluated only while
 *             that currency is on display; others show as paused rather than
 *             being silently compared against the wrong number.
 *   percent — "BTC moves 5% in 24h". A move of a given size is close enough
 *             to the same fact in every currency (only the FX drift over the
 *             same day separates them, which is second-order next to a move
 *             worth alerting on), so these are never paused. That is also why
 *             they carry no displayed currency.
 *
 * `startPrice` is the price when the target was set. It is what makes the
 * panel able to say how far a target has come rather than only how far it has
 * left to go, and it is null on targets set before it existed.
 */

/* The window one target measures over, defaulting for anything written before
 * windows existed — see `PERCENT_WINDOW_OPTIONS` in `config.js`. */
const percentWindowOf = (target) => {
  const w = Number(target && target.window);
  return PERCENT_WINDOW_OPTIONS.some((o) => o.value === w)
    ? w
    : DEFAULT_PERCENT_WINDOW;
};

/* Percent for reading, not for arithmetic: precision scales down as the
 * number grows, because "12%" and "0.35%" both want to be read at a glance
 * and "12.00%" only adds noise. A whole number stays whole — someone who
 * typed 5 should see their target back as "5%", not "5.0%". */
const formatPercentValue = (value) => {
  if (!isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits =
    value === Math.round(value) ? 0 : abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
  return `${value.toFixed(digits)}%`;
};

/* Was a price target hit inside the candle window, after it was set?
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

/* The same backward look for percent targets. A move over a window can't be
 * read off a single candle, so each candle is compared with the one a window
 * earlier — the series is hourly over a week, so a day is 24 steps back and an
 * hour is one. Without this a percent target would only ever catch a move
 * still standing when you opened a tab, and the whole point of the feature is
 * that it doesn't need you watching. Returns when the move first reached the
 * target, or null.
 *
 * **The window comes off the target**, not from a constant: it is part of what
 * was asked for, and an old target read through somebody's later preference
 * would be answering a different question. Targets written before the field
 * existed have the default put on them by `sanitizeAlerts`. */
const percentHitInCandles = (target, candles) => {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const step = candles[1].time - candles[0].time;
  if (!isFinite(step) || step <= 0) return null;
  const back = Math.round(percentWindowOf(target) / step);
  if (back < 1 || back >= candles.length) return null;
  for (let i = back; i < candles.length; i++) {
    const c = candles[i];
    if (c.time < target.created) continue; // before it was set
    const then = Number(candles[i - back].close);
    const now = Number(c.close);
    if (!isFinite(then) || then <= 0 || !isFinite(now)) continue;
    const move = ((now - then) / then) * 100;
    const hit =
      target.direction === "above"
        ? move >= target.target
        : move <= -target.target;
    if (hit) return c.time;
  }
  return null;
};

// A percent target's number is a size of move, so it is stated unsigned and
// the direction says which way. Everything that compares one goes through
// here so the sign convention can't drift between the panel and detection.
const percentReached = (target, change) =>
  isFinite(change) &&
  (target.direction === "above"
    ? change >= target.target
    : change <= -target.target);

// Price targets are only meaningful in the currency they were set in
const targetApplies = (a, currency) =>
  a.kind === "percent" || a.currency === currency;

// Close of the candle covering a moment, for reporting what a percent move
// was worth when it happened. Null rather than a guess when nothing matches.
const priceAtOrNull = (candles, timeMs) => {
  if (!Array.isArray(candles)) return null;
  for (const c of candles) {
    if (c.time === timeMs) {
      const close = Number(c.close);
      return isFinite(close) && close > 0 ? close : null;
    }
  }
  return null;
};

/* Evaluate targets against the freshest prices and, where available, the
 * candle history. Pure: returns the ones to mark as hit, leaving
 * persistence and UI to the caller. Each result carries `hitAt` (when the
 * candles say it happened) or null for "it is past the target right now",
 * and `hitPrice` — the price at the moment it counted, so the row can still
 * say what it was worth long after the fact. */
/* Targets whose keep-for span has run out. Pure; returns the same array when
 * nothing changed, so the caller can tell whether there is anything to save.
 * An expired target is kept and marked rather than dropped — what somebody
 * asked for is a record, and a row that says "expired" can be re-armed where
 * a vanished one cannot. */
const expireAlerts = (alerts, now) => {
  let changed = false;
  const out = (alerts || []).map((a) => {
    if (a.triggeredAt || a.expiredAt || !a.keepFor) return a;
    if (now - a.created < a.keepFor) return a;
    changed = true;
    return { ...a, expiredAt: now };
  });
  return changed ? out : alerts;
};

/* A repeating price target re-arms itself once the price is back on the other
 * side of the line — TradingView's "every time" against its "only once", and
 * CoinGecko's "recurring". Not the moment it fires: re-armed while the price
 * is still past the target, it would fire again on the next sweep and report
 * one crossing as a hundred. Re-armed from where the price is now, so the
 * candle lookback cannot re-report the crossing it just reported, and counted,
 * so the row can say how many times it has spoken. Pure, like `expireAlerts`. */
const rearmRepeatingAlerts = (alerts, prices, now) => {
  let changed = false;
  const out = (alerts || []).map((a) => {
    if (!a.repeat || a.kind !== "price" || !a.triggeredAt) return a;
    const price = prices ? Number(prices[a.coin]) : NaN;
    if (!isFinite(price) || price <= 0) return a;
    const back = a.direction === "above" ? price < a.target : price > a.target;
    if (!back) return a;
    changed = true;
    return {
      ...a,
      triggeredAt: null,
      hitPrice: null,
      created: now,
      startPrice: price,
      repeated: (a.repeated || 0) + 1,
    };
  });
  return changed ? out : alerts;
};

const findTriggeredAlerts = (
  alerts,
  prices,
  currency,
  candlesByCoin,
  changes,
  portfolioTotal,
) => {
  const fired = [];
  for (const a of alerts || []) {
    if (a.triggeredAt || a.expiredAt) continue;
    if (!targetApplies(a, currency)) continue;

    /* A portfolio target is checked **live only**, and the row says so.
     *
     * The other two kinds look back through a week of candles so a crossing
     * that happened with no tab open is still reported. A total cannot do
     * that honestly: it would mean fetching a week of candles for every coin
     * held and summing them at each step, and the amounts held are only known
     * as they are *now* — a holding added yesterday would be backdated into
     * last week's total and the app would announce a crossing that never
     * happened. Live-only is the answer that is true. */
    if (a.kind === "portfolio") {
      const total = Number(portfolioTotal);
      if (!isFinite(total) || total <= 0) continue;
      if (a.direction === "above" ? total >= a.target : total <= a.target) {
        fired.push({ ...a, hitAt: null, hitPrice: total });
      }
      continue;
    }

    const candles = candlesByCoin ? candlesByCoin[a.coin] : null;
    const price = prices ? Number(prices[a.coin]) : NaN;
    const livePrice = isFinite(price) && price > 0 ? price : null;

    if (a.kind === "percent") {
      const hitAt = percentHitInCandles(a, candles);
      if (hitAt) {
        fired.push({ ...a, hitAt, hitPrice: priceAtOrNull(candles, hitAt) });
        continue;
      }
      /* **The live check is a 24h number and only answers a 24h target.**
       * `changes` is the ticker's own 24-hour move; comparing a one-hour
       * target against it would report a hit that the target's own window
       * never saw. The shorter windows are answered by the candles above,
       * which are hourly — so they are found within the hour rather than on
       * the tick, and the panel says so. */
      if (percentWindowOf(a) !== DEFAULT_PERCENT_WINDOW) continue;
      const change = changes ? Number(changes[a.coin]) : NaN;
      if (percentReached(a, change)) {
        fired.push({ ...a, hitAt: null, hitPrice: livePrice });
      }
      continue;
    }

    const hitAt = targetHitInCandles(a, candles);
    if (hitAt) {
      fired.push({ ...a, hitAt, hitPrice: a.target });
      continue;
    }
    if (livePrice === null) continue;
    if (
      a.direction === "above" ? livePrice >= a.target : livePrice <= a.target
    ) {
      fired.push({ ...a, hitAt: null, hitPrice: livePrice });
    }
  }
  return fired;
};

/* Which coins need a price for the alert check (unfired, and either a percent
 * target or a price target in the currency on display).
 *
 * `holdings` is passed in because a **portfolio** target needs a price for
 * everything held, not for one coin — it has no coin of its own. Passed rather
 * than reached for: `portfolio.js` loads after this file, and the caller
 * already has the list. */
const alertCoinsToWatch = (alerts, currency, holdings) => {
  const coins = new Set();
  let wantsPortfolio = false;
  for (const a of alerts || []) {
    if (a.expiredAt || !targetApplies(a, currency)) continue;
    // A hit repeating target still needs a price: it is waiting to re-arm
    if (a.triggeredAt && !(a.repeat && a.kind === "price")) continue;
    if (a.kind === "portfolio") {
      wantsPortfolio = true;
      continue;
    }
    coins.add(a.coin);
  }
  if (wantsPortfolio) {
    for (const h of holdings || []) {
      if (h && typeof h.coin === "string" && h.coin) coins.add(h.coin);
    }
  }
  return [...coins];
};

/* Is a portfolio target worth offering at all?
 *
 * A target on a total that is always zero can never fire, and a control that
 * cannot change anything in the state it is offered in is one this codebase
 * removes rather than ships. */
const hasHoldings = (holdings) =>
  Array.isArray(holdings) && holdings.some((h) => h && h.coin);

/* How far a target has to go, as a fraction of the whole journey from where
 * the price was when it was set. 0 = just set, 1 = hit. Null when there is
 * nothing honest to draw: no start price (targets predating it), or a start
 * already past the target. Clamped, because a price can overshoot backwards. */
const targetProgress = (a, current) => {
  if (a.kind === "percent") return null; // no fixed distance to travel
  const start = Number(a.startPrice);
  const now = Number(current);
  if (!isFinite(start) || start <= 0 || !isFinite(now) || now <= 0) return null;
  const span = a.target - start;
  if (span === 0) return null;
  // A target set on the wrong side of the price was already true when set
  if (a.direction === "above" ? span < 0 : span > 0) return null;
  return Math.max(0, Math.min(1, (now - start) / span));
};

// Distance left, as a percentage of the current price. Negative means the
// price is already past the target (which only happens before the next check).
const targetDistancePercent = (a, current) => {
  const now = Number(current);
  if (a.kind === "percent" || !isFinite(now) || now <= 0) return null;
  return ((a.target - now) / now) * 100;
};

/* ── panel ─────────────────────────────────────────────────────────────── */

// One-tap distances from the current price. Three each way is enough to
// cover "just past here", "a real move" and "a big one" without turning the
// form into a keypad.
const QUICK_PRICE_STEPS = [1, 5, 10, 25];
const QUICK_PERCENT_STEPS = [2, 5, 10, 20];

/* A target you can read back. 76,776.31 is arithmetic, not an intention —
 * four significant digits keeps the number you meant and drops the noise the
 * multiplication invented, at any magnitude from $100k down to $0.00001. */
const roundTargetPrice = (value) => Number(value.toPrecision(4));

/* A notice that leaves by itself — see POSITION_TOAST_MS. The clock runs only
 * while the page is visible and nothing holds the notice: a notice nobody
 * has had the chance to see has not been seen, and one being read (the
 * pointer on it, or the focus on its ×) is not finished with. It keeps what
 * is left rather than starting over, so resting on it pauses rather than
 * extends. */
class TimedToast extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { leaving: false, held: false };
    this.left = props.ms;
    this.startedAt = 0;
    this.timer = null;
    this.leaveTimer = null;
    this.holding = false;
    this.resume = () => {
      if (this.holding || document.hidden || this.state.leaving || this.timer)
        return;
      this.startedAt = Date.now();
      this.timer = setTimeout(this.leave, Math.max(0, this.left));
      if (this.state.held) this.setState({ held: false });
    };
    this.pause = () => {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
        this.left -= Date.now() - this.startedAt;
      }
      if (!this.state.held) this.setState({ held: true });
    };
    this.leave = () => {
      this.timer = null;
      this.setState({ leaving: true });
      this.leaveTimer = setTimeout(() => {
        if (typeof this.props.onDone === "function") this.props.onDone();
      }, TOAST_LEAVE_MS);
    };
    this.onVisibility = () => (document.hidden ? this.pause() : this.resume());
    this.hold = () => {
      this.holding = true;
      this.pause();
    };
    this.release = () => {
      this.holding = false;
      this.resume();
    };
  }

  componentDidMount() {
    document.addEventListener("visibilitychange", this.onVisibility);
    if (document.hidden) this.pause();
    else this.resume();
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
    clearTimeout(this.leaveTimer);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  render() {
    const { up, ms, children } = this.props;
    return React.createElement(
      AlertToast,
      {
        up,
        leaving: this.state.leaving,
        "data-toast-timed": this.state.leaving
          ? "leaving"
          : this.state.held
            ? "held"
            : "running",
        onMouseEnter: this.hold,
        onMouseLeave: this.release,
        onFocus: this.hold,
        onBlur: this.release,
      },
      children,
      React.createElement(AlertToastTimer, {
        up,
        ms,
        held: this.state.held,
        "aria-hidden": "true",
      }),
    );
  }
}

class AlertsPanel extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      coin: props.activeCoin,
      kind: "price",
      direction: "above",
      target: "",
      /* What a percent target will measure over. Part of the form, not a
       * stored setting: it is stamped on the target when it is added, so the
       * form's last choice is a convenience for the next one and never a
       * reinterpretation of an old one. */
      percentWindow: DEFAULT_PERCENT_WINDOW,
      /* The optional stamps on the next target. The note clears once it is
       * added — it belonged to that target; the span and the repeat flag stay
       * as the form's last choice, like the window does. */
      note: "",
      keepFor: null,
      repeat: false,
      // The last target removed in this session, restorable until the panel
      // closes or another one is removed
      undo: null,
      /* Whether the explanation is open. Not persisted, and closed by default:
       * it answers a question you ask once, and a help card that reopens every
       * time becomes a thing to dismiss. It follows the tab rather than being
       * per-tab — you opened "what is this", and switching tab changes what
       * "this" is. */
      info: false,
      /* The coin picker's own state. `coinQuery` is null when the field is
       * showing the chosen coin rather than being searched — which is a
       * different thing from an empty search, and the field's value depends on
       * which it is. `coinAt` is the highlighted row for the arrow keys. */
      coinQuery: null,
      coinAt: 0,
      /* Which number box just refused a character, or null. One field at a
         time is enough: you can only be typing in one. */
      numWarn: null,
      /* The close ticket: which position's is open, what has been typed into
         it, whether that is a quantity or money, and the model's refusal if
         the last press was turned down. */
      pClose: null,
      pCloseDraft: "",
      pCloseUnit: "coin",
      pCloseWhy: null,
      /* A chart jump can fail only when a removed position coin has to be
         added back to an already full watchlist. Kept beside the action that
         was refused rather than turned into a global toast. */
      pChartWhy: null,
      /* The futures card's funding rate, and which coin it is for.
         `undefined` is "never asked", `null` "asking", `false` "this coin has
         no perpetual" — three states a single value cannot carry, and the
         card says something different for each. */
      funding: undefined,
      fundingFor: null,
      /* Simulated money movement: what has been typed, which deposit or
         withdrawal is currently landing, and the model's refusal if the last
         press was turned down. The pending values carry their amount because
         both the button and its status sentence name the figure, and because
         `componentWillUnmount` has to be able to land it. */
      pFund: undefined,
      pFundAmt: null,
      pFundWhy: null,
      pWithdrawAmt: null,
      pWithdrawWhy: null,
      /* The short-lived receipt after either movement completes. It is an
         object rather than a boolean so the deposit and withdrawal rows do
         not both claim the same completion. */
      pMoneyDone: null,
      /* Which unit the amount is typed in — null until somebody presses one,
         and always resolved through `fundUnit()` rather than read directly:
         the offered units change with the chart's coin and the settlement. */
      pFundUnit: null,
      /* The foot drawer, and the balance change waiting for its second press.
         Both are session-local: a drawer left open is not a preference, and a
         confirmation is a question about a press you just made. */
      pDrawer: false,
      pReset: null,
      /* The model's refusal from the last press of the ticket's own button,
         so an add or a reduce can say why it did not happen. */
      pTicketWhy: null,
      /* Which of the two words the ticket is explaining, or neither. One at a
         time: they are two answers to one question and the second would push
         the first off the screen. */
      pWhat: null,
      /* Which risk limit is opened out. One at a time — they are four answers
         to one question and a second open would push the first off screen. */
      pLimit: null,
      /* A typed contract size, and which unit it is typed in. `undefined`
         means "use the share chips" — the field then shows what they work out
         to, so it is never a blank that has quietly stopped the ticket. */
      pQty: undefined,
      pQtyUnit: "coin",
      /* Whether the body can scroll — the sticky foot's shadow is drawn only
         when something is actually under it. See `measureBody`. */
      bodyOver: false,
      /* The terminal's seams (PRACTICE_LAYOUT_KEY) and the one being held,
         and how the page's chart draws (candles or a line). */
      ppLayout: loadPracticeLayout(),
      ppSplit: null,
      ppChartStyle: loadPracticeChartStyle(),
      /* Calls view controls: session-local list tools, not saved preferences.
        The chart gesture stays the same; this only changes how the record is
        browsed inside the panel. */
      callsView: "all",
      callsMineOnly: false,
      callsOrder: "soon",
    };
    this.measureBody = this.measureBody.bind(this);
    this.handleAdd = this.handleAdd.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleCoinKey = this.handleCoinKey.bind(this);
    this.renderCoinPicker = this.renderCoinPicker.bind(this);
    this.setInputRef = (r) => (this.inputRef = r);
    this.setDrawerRef = (r) => (this.drawerRef = r);

    /* Which presses count as outside, and which only look it.
     *
     * The drawer has no scrim, so this hears every press in the window and
     * has to decide. Four do not close it: one inside the drawer; one on the
     * control that opens it, which would otherwise close and reopen in a
     * single gesture; one on the folder tabs, which change panels and would
     * be left changing to nothing; and any press at all while the futures
     * view is up, because that is a screen with its own shell and no drawer
     * to be outside of. */
    this.handleOutside = (event) => {
      const box = this.drawerRef;
      if (!box || this.props.view === "futures") return;
      const t = event.target;
      if (!t || (box.contains && box.contains(t))) return;
      if (
        t.closest &&
        t.closest(
          "[data-chrome-cluster], [data-panel-tabs], [data-drawer-tabs], [data-chrome-menu]",
        )
      ) {
        return;
      }
      /* **The chart is an input while targets are being set.** A press on it
         fills the price rather than closing the drawer — the two cannot both
         be true of one press, and the pick is the reason the drawer is docked
         beside the chart at all. Escape, the ×, its tab and a press anywhere
         else still close it. Only for targets, and only while the board is
         off: with `predict` on a click calls a square, so the chart is not
         taking prices and a press there means what it always did. The
         chart's tools count as the chart: they sat on it until 30 Sep 2026,
         and a line drawn there hands its price to this form. */
      if (
        this.props.view === "targets" &&
        this.props.predict !== true &&
        t.closest("[data-chart-surface], [data-chart-tools]")
      ) {
        return;
      }
      if (typeof this.props.onClose === "function") this.props.onClose();
    };

    /* The derivatives market — 4,750 lines of it — lives in
     * `alerts-futures.js`. Every name it defines lands here, so `this.`
     * still reaches all of it and no caller changed. */
    Object.assign(this, alertsFutures(this));
    /* Pro's page — `practice-page.js`, on the same terms. */
    Object.assign(this, practicePage(this));
  }

  // Straight to typing — the panel exists to add a target, and every visit
  // began with a click into the box
  componentDidMount() {
    /* The first paint is the one the rule is about. */
    setTimeout(() => this.measureBody(), 0);
    /* A resize changes the plot's height without an update to measure it on;
       the level tags' spacing is read from it (see measureBody). */
    window.addEventListener("resize", this.measureBody);
    /* P8 — the derivatives page's own keys; see `pageKey`. */
    document.addEventListener("keydown", this.pageKey);
    /* **A press outside closes the drawer, and no scrim catches it.**
     * There used to be one: the panel was a card on a sheet that covered the
     * window, and the sheet heard the press. The drawer has nothing behind
     * it on purpose — the chart has to stay live and pointable — so the
     * document hears it instead, exactly as the chart's own drawer does.
     * `mousedown` rather than `click`, because releasing a text selection
     * outside the drawer would otherwise shut it mid-drag. */
    document.addEventListener("mousedown", this.handleOutside);
    /* **The denominator for "how far away is it".** Daily closes for the coin
       on screen, one request per coin per twelve hours, shared with the
       base-rate panel and with the derivatives screen's own strip through
       `dailyClosesCache` — `loadEdge` is that screen's loader and there is no
       reason for a second one. Asked for only while this panel is open, like
       everything else that fetches here. */
    if (this.props.view === "targets" && typeof this.loadEdge === "function") {
      this.loadEdge();
    }
    /* The book polls only while it is the thing on screen — see `bookTimer`;
       the base-rate strip asks once per coin, from the same condition. */
    this.syncBook();
    if (this.inputRef && this.props.alerts.length < MAX_ALERTS) {
      this.inputRef.focus();
    }
  }

  /* The funding request outlives a panel closed while it is in flight, and
     `setState` on a gone component is a warning nobody will ever see in a
     production React build — so the answer is dropped rather than written. */
  /* **A tab press belongs to the coin it was made on.** `pTab` is a
     deliberate choice and worth keeping while you are looking at one coin;
     carried to the next one it is a stale answer to a question about a
     different position. Clearing it hands the decision back to the rule above
     — the coin on screen decides — which is what makes changing coin and
     opening a second contract work without finding a tab. */
  componentDidUpdate(prev) {
    /* A different coin is a different record; the loader is a no-op when it
       already holds that coin's closes. */
    if (
      this.props.view === "targets" &&
      prev.activeCoin !== this.props.activeCoin &&
      typeof this.loadEdge === "function"
    ) {
      this.loadEdge();
    }
    /* **A price picked off the chart lands in the form.**
     *
     * The drawer is docked beside a live chart, so the fastest way to say a
     * level is to point at it — `app.js` hands the click's price down as
     * `{ value, at }`, and the stamp is what makes a second pick at the same
     * price a second event rather than a no-op.
     *
     * It sets the coin as well as the number. The form can be aimed at a
     * coin that is not the one on screen, and a price read off this chart
     * belongs to this chart's coin; leaving the coin alone would write a
     * Bitcoin level into an Ethereum target. The kind goes to `price` for
     * the same reason: a number picked off a price axis is not a percentage.
     *
     * `roundTargetPrice` is the rule the quick steps already use — four
     * significant digits, because 86,412.7734 is arithmetic rather than an
     * intention. */
    const picked = this.props.pickedPrice;
    if (picked && (!prev.pickedPrice || prev.pickedPrice.at !== picked.at)) {
      const value = Number(picked.value);
      const now = this.priceOf(this.props.activeCoin);
      if (isFinite(value) && value > 0) {
        this.setState({
          kind: "price",
          coin: this.props.activeCoin,
          target: String(roundTargetPrice(value)),
          /* Which side of it you are watching is not a guess: the price is
             where it is, and a target above it can only be a rise. With no
             price to hand, `above` is the form's own default and nothing is
             claimed by keeping it. */
          direction: value >= Number(now) ? "above" : "below",
        });
      }
      return;
    }
    /* **A focus asked for from another market lands after the switch.** The
       page's positions table can point at a contract on a coin that is not
       on screen; switching coin clears the tab choice below, so the wanted
       row is carried across the switch and applied once it has happened. */
    if (
      prev.activeCoin !== this.props.activeCoin &&
      this.state.pWant &&
      this.state.pWant.coin === this.props.activeCoin
    ) {
      const want = this.state.pWant;
      /* The contract unfolds in the table it was pressed in (`ppRow`); the
         desk is the ticket now and has no list to switch to. */
      this.setState(
        {
          pWant: null,
          ppRow: want.id,
          pOpen: want.id,
          pClose: null,
          pReset: null,
          pArm: null,
        },
        () => {
          if (want.close) this.openClose(want.pos, 1);
        },
      );
      return;
    }
    if (
      prev.activeCoin !== this.props.activeCoin &&
      (this.state.pTab || this.state.ppRow)
    ) {
      this.setState({
        pTab: null,
        ppRow: null,
        pOpen: null,
        pClose: null,
        pReset: null,
        pArm: null,
      });
      return;
    }
    /* An armed reset cannot outlive a contract opening: the chips go disabled
       and the confirmation would sit there unanswerable, then fire the moment
       the contract closed. */
    if (
      this.state.pReset != null &&
      Object.keys(this.props.practice.positions || {}).length
    ) {
      this.setState({ pReset: null });
    }
    /* **The list is not a place to be left when the last contract closes.**
     * Opening one sets `pTab: "open"` so you land on what you just opened;
     * closing the last one leaves that choice pointing at an empty screen,
     * and since nothing clears it the ticket is unreachable without finding a
     * tab — the same defect as the landing rule, arrived at from the other
     * end. Pressing Positions with nothing open is still allowed and still
     * shows the empty state: what is corrected here is being *put* there. */
    const had =
      prev.practice && Object.keys(prev.practice.positions || {}).length;
    const has =
      this.props.practice &&
      Object.keys(this.props.practice.positions || {}).length;
    if (had && !has && this.state.pTab === "open") {
      this.setState({ pTab: null, pOpen: null, pClose: null });
    }
    this.measureBody();
    this.syncBook(prev);
  }

  /* **The order book runs while it is being looked at, and not one tick
   * longer.** The derivatives page draws it beside every tab, so the page
   * being up is the whole condition. A timer that survives it going away is a
   * request this new-tab page is making for nobody. */
  syncBook(prev) {
    /* `view`, not `alertsView`: the panel is handed the app's
       `state.alertsView` under the shorter name, and reading the wrong one
       made this condition false for ever — the column drew its heading and the
       ladder never arrived. */
    const want =
      this.props.view === "futures" && this.props.practiceEnabled !== false;
    const coinChanged = prev && prev.activeCoin !== this.props.activeCoin;
    if (want !== this._bookOn || (want && coinChanged)) {
      this._bookOn = want;
      this.bookTimer(want);
    }
    /* **The base-rate strip asks once, not on a timer.** A day's closes change
       once a day and are cached for twelve hours; what it shares with the book
       is only *when* it may ask — the workspace is on screen — and not the
       polling, which would be a request for a number that cannot have moved. */
    const wantEdge = want;
    if (wantEdge && (!this._edgeOn || coinChanged)) {
      this._edgeOn = true;
      this.loadEdge();
      /* The page's market readings ask on the same terms: when the page
         opens and when the coin changes, never on a timer. */
      this.loadMarketContext();
    }
    if (!wantEdge) this._edgeOn = false;
  }

  /* **Does anything actually pass under the sticky foot?**
   *
   * The foot carries an upward shadow so content sliding beneath it reads as
   * content rather than as a collision. On a screen that does not scroll,
   * that shadow is a soft grey band drawn across the
   * middle of empty space, and it was reported as exactly what it looks like:
   * *"there is a scrollbar in the main area"*. The comment on
   * `AlertPosTicketFoot` already states the rule it was breaking: a sticky
   * strip has to be invisible when nothing is under it.
   *
   * Measured rather than guessed, because the answer changes with the tab,
   * the language, the window and how many contracts are open. Written to
   * state only when it flips, so this cannot loop: `componentDidUpdate` runs
   * once more and settles.
   */
  measureBody() {
    const el = this.bodyRef;
    if (!el || this._gone) return;
    /* **On the derivatives page the page scrolling is not the question.**
       Its reading column runs below the fold by design, so the page always
       has somewhere to scroll — and asking the page made the foot draw its
       shadow over an empty desk that fitted the window with room to spare:
       the "scrollbar in the main area" report again, from the other side.
       What passes under a sticky foot is the desk's own content, so the
       desk is what is measured: something is under the foot exactly when
       the desk runs past the bottom of the page's window. */
    const desk = el.querySelector && el.querySelector("[data-practice-desk]");
    const over = desk
      ? desk.getBoundingClientRect().bottom >
        el.getBoundingClientRect().bottom + 1
      : el.scrollHeight > el.clientHeight + 1;
    if (over !== this.state.bodyOver) this.setState({ bodyOver: over });
    /* **The level tags' spacing, from what they measure** (27 Sep 2026). A
       fixed 7% of the plot was a tag's height on a 20rem chart; the chart
       follows the window down to 12rem, and there two levels a few dollars
       apart — the price, the POC, the value area's edge — were printed over
       each other. The gap is a tag's own height, and two pixels, as a share
       of the plot it is drawn on; never under PRACTICE_TAG_GAP. */
    /* **The book fills its column** (27 Sep 2026). The terminal's book
       cell is as tall as the seams make it, and eight levels a side left
       half of a tall one empty. What does not move with the row count —
       tabs, filters, head, spread, note — is measured as the card's height
       less its rows, and the rows a side are what fits beside it: never
       under four, never past the ORDER_BOOK_SHALLOW levels the request
       carries. Four, not ORDER_BOOK_ROWS: a short cell that cannot hold
       eight scrolled at six (77px over at 1440×900), and the seams are
       there to give it more. Only on the terminal (the cell is a box) and
       on both sides (one side already draws twice the rows). */
    const bookCell =
      el.querySelector && el.querySelector("[data-practice-cell='book']");
    const ladderRows = bookCell
      ? bookCell.querySelectorAll("[data-practice-book-row]")
      : [];
    if (
      bookCell &&
      bookCell.clientHeight > 0 &&
      ladderRows.length &&
      (this.state.ppBookView || "both") === "both"
    ) {
      const card = bookCell.firstElementChild;
      const rowH = ladderRows[0].getBoundingClientRect().height;
      const rowsH = rowH * ladderRows.length;
      const fixed = card ? card.getBoundingClientRect().height - rowsH : 0;
      const room = bookCell.clientHeight - fixed;
      const fits = rowH > 0 ? Math.floor(room / rowH / 2) : 0;
      const want = Math.max(4, Math.min(ORDER_BOOK_SHALLOW, fits));
      if (want !== (this.state.ppBookRows || ORDER_BOOK_ROWS))
        this.setState({ ppBookRows: want });
    }
    const plot = el.querySelector && el.querySelector("[data-practice-plot]");
    /* The plot's width, for what its legend can hold — written only when it
       moves by more than a few pixels, so a seam dragged a pixel at a time
       does not render the page per pixel. */
    if (plot) {
      const w = Math.round(plot.getBoundingClientRect().width);
      if (w > 0 && Math.abs(w - (this.state.ppPlotW || 0)) > 8)
        this.setState({ ppPlotW: w });
    }
    const tag = plot && plot.querySelector("[data-practice-tag]");
    if (plot && tag) {
      const h = plot.getBoundingClientRect().height;
      const t = tag.getBoundingClientRect().height;
      const gap =
        h > 0 && t > 0
          ? Math.max(PRACTICE_TAG_GAP, Math.ceil(((t + 2) / h) * 1000) / 10)
          : PRACTICE_TAG_GAP;
      if (gap !== this.state.ppTagGap) this.setState({ ppTagGap: gap });
    }
  }

  componentWillUnmount() {
    this._gone = true;
    window.removeEventListener("resize", this.measureBody);
    document.removeEventListener("keydown", this.pageKey);
    document.removeEventListener("mousedown", this.handleOutside);
    clearTimeout(this._numT);
    cancelAnimationFrame(this._ppRaf);
    cancelAnimationFrame(this._ppDragRaf);
    if (this._ppSplit) cancelAnimationFrame(this._ppSplit.frame);
    this._ppSplit = null;
    document.removeEventListener("keydown", this.ppSettingsKey, true);
    document.removeEventListener("mousedown", this.ppSettingsOutside, true);
    this.bookTimer(false);
    /* **Closing the panel lands the money; it does not throw it away.**
     * The press was the confirmation, and the four seconds are how long the
     * simulated transfer takes, not a window to change your mind in. Cancel
     * is the way out and is on screen for the whole wait. Dropping a pending
     * action on Esc, a coin switch or a tab close would leave the number and
     * the receipt disagreeing about what was confirmed. */
    clearTimeout(this._fundT);
    this.landPracticeDeposit();
    this.landPracticeWithdrawal();
    clearTimeout(this._fundDoneT);
  }

  typedTarget() {
    const value = Number(this.state.target);
    return isFinite(value) && value > 0 ? value : null;
  }

  handleAdd() {
    const target = this.typedTarget();
    if (target === null) return;
    /* The Add button is disabled at the cap; Enter in the target box was not,
     * and `onAdd` refuses the eleventh silently — so the box emptied and
     * nothing happened. Refuse here too, and keep what was typed. */
    if ((this.props.alerts || []).length >= MAX_ALERTS) return;
    if (this.state.kind === "percent" && target > MAX_PERCENT_TARGET) return;
    if (this.duplicate()) return;
    this.props.onAdd(
      this.state.kind === "portfolio" ? "" : this.state.coin,
      this.state.kind,
      this.state.direction,
      target,
      this.state.percentWindow,
      {
        note: this.state.note,
        keepFor: this.state.keepFor,
        repeat: this.state.repeat,
      },
    );
    this.setState({ target: "", note: "" });
    if (this.inputRef) this.inputRef.focus();
  }

  handleRemove(a) {
    this.setState({ undo: a });
    this.props.onRemove(a.id);
  }

  handleUndo() {
    const a = this.state.undo;
    if (!a) return;
    this.setState({ undo: null });
    if (this.props.onRestore) this.props.onRestore(a);
  }

  /* Esc has to be handled here as well as globally: the app's shortcut
   * handler stands down inside text fields, and the target box takes focus
   * on open — so without this the one key everyone presses to leave would
   * do nothing at exactly the moment it is most likely to be pressed. */
  handleKeyDown(e) {
    if (e.key === "Enter") this.handleAdd();
    else if (e.key === "Escape") this.props.onClose();
  }

  // Every coin, ranked by the matcher the "/" jumper already uses: symbol or
  // full name, and the coins on your own list first. One matcher, so the two
  // pickers cannot disagree about what "sol" means.
  coinMatches() {
    return quickSwitchMatches(
      this.state.coinQuery || "",
      this.props.coinOptions,
    );
  }

  pickCoin(coin) {
    this.setState({ coin, coinQuery: null, coinAt: 0 });
  }

  /* The picker's keys. Enter takes the highlighted row rather than submitting
   * the form — while a search is open the field is a list, and the target box
   * below it is where Enter means "add". Escape closes the list and leaves the
   * panel open, because the thing you are getting out of is the list; pressing
   * it again reaches `handleKeyDown` and closes the panel. */
  handleCoinKey(e) {
    const open = this.state.coinQuery !== null;
    const rows = open ? this.coinMatches() : [];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!rows.length) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      this.setState((s) => ({
        coinAt: (s.coinAt + step + rows.length) % rows.length,
      }));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (rows.length)
        this.pickCoin(rows[Math.min(this.state.coinAt, rows.length - 1)].coin);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      this.setState({ coinQuery: null, coinAt: 0 });
    }
  }

  // Fill the box from a distance off the current price, leaving it editable.
  // Nothing is added until Add is pressed.
  applyQuick(step) {
    if (this.state.kind === "percent") {
      this.setState({ target: String(step) });
    } else {
      const price = this.valueOf({
        kind: this.state.kind,
        coin: this.state.coin,
      });
      if (price === null) return;
      const factor =
        this.state.direction === "above" ? 1 + step / 100 : 1 - step / 100;
      this.setState({ target: String(roundTargetPrice(price * factor)) });
    }
    if (this.inputRef) this.inputRef.focus();
  }

  // An identical armed target already in the list. Adding it again would
  // spend one of the ten slots on a duplicate line that fires twice.
  duplicate() {
    const target = this.typedTarget();
    if (target === null) return null;
    const { kind, coin, direction } = this.state;
    return (this.props.alerts || []).find(
      (a) =>
        !a.triggeredAt &&
        (kind === "portfolio" || a.coin === coin) &&
        a.kind === kind &&
        a.direction === direction &&
        a.target === target &&
        // A move over an hour and the same move over a day are two targets
        (kind !== "percent" ||
          percentWindowOf(a) === this.state.percentWindow) &&
        (kind === "percent" || a.currency === this.props.currency),
    );
  }

  // What we know about a coin right now, or nothing. `stats` is built by the
  // app from the ticker snapshot it already holds — see `coinStats`.
  statOf(coin) {
    return (this.props.stats && this.props.stats[coin]) || null;
  }

  /* **The real alarm, offered where it is wanted and nowhere else.**
   *
   * Two switches and, behind one of them, a Chrome permission that is asked
   * for **from this press** and never at install. `permissions` in the
   * manifest is `[]` and stays that way; `notifications` is optional, which
   * Chrome grants only on a gesture and warns about only then. Routing the
   * request through anything asynchronous first makes Chrome refuse it in a
   * way that is indistinguishable from the person declining, which is why
   * `handleAlarmNotifyChange` calls it straight off the click.
   *
   * **It says what it cannot do.** There is no background service worker
   * here: this is a new-tab page, so it watches while a tab is open —
   * including one sitting in the background, which is the case the tab title
   * could never cover. With no tab open, nothing fires. A row that implied a
   * watchman would be selling something that is not there.
   *
   * The same row in both panels, because it is one permission and one pair of
   * switches: granting it from Targets arms Futures, and a person who found
   * it in one place should not have to find it again in the other.
   */
  renderAlarmRow(what) {
    const on = Boolean(this.props.alarmNotify && this.props.alarmGranted);
    /* Wanted but not allowed — revoked from chrome://extensions, or a build
       with no permissions API at all. Told apart, because "off" and "you
       turned this off somewhere else" are different things to fix. */
    const revoked = Boolean(this.props.alarmNotify && !this.props.alarmGranted);
    const chip = (active, label, aria, onClick) =>
      React.createElement(
        AlertPosChip,
        {
          active,
          "aria-pressed": active ? "true" : "false",
          "aria-label": aria,
          onClick,
        },
        label,
      );
    return React.createElement(
      AlertsAlarmBand,
      null,
      React.createElement(
        AlertPosStep,
        { "data-alarm": what },
        React.createElement(
          AlertPosStepHead,
          null,
          /* **The paragraph is behind the ring now.** It is four lines of prose
           about a permission, and it sat under the positions list on every
           visit — the heaviest thing on a screen whose subject is the
           contracts above it. It is still one press away, in the same ring
           every other explanation on this panel uses, and it is still drawn
           unasked when something is actually wrong (see `revoked` below). */
          React.createElement(
            AlertPosImpactLabel,
            null,
            msg("alarm_head", "Alarm"),
            React.createElement(
              AlertPosWhat,
              {
                open: this.state.pWhat === "alarm",
                "aria-expanded":
                  this.state.pWhat === "alarm" ? "true" : "false",
                "aria-label": msg("alarm_what_aria", "What the alarm does"),
                onClick: () =>
                  this.setState((p) => ({
                    pWhat: p.pWhat === "alarm" ? null : "alarm",
                  })),
              },
              "?",
            ),
          ),
          React.createElement(
            AlertPosStepValue,
            null,
            on || this.props.alarmSound
              ? msg("toggle_on", "On")
              : msg("toggle_off", "Off"),
          ),
        ),
        React.createElement(
          AlertPosChips,
          null,
          chip(
            on,
            /* Two whole calls, not one with a conditional key: the extractor
             reads literal keys. On the phone the API behind this is iOS's
             notification centre (ios.js), so the word "Chrome" would be
             wrong there. */
            window.PriceTabPlatform === "ios"
              ? msg("alarm_notify_ios", "Notification")
              : msg("alarm_notify", "Chrome notification"),
            window.PriceTabPlatform === "ios"
              ? msg("alarm_notify_aria_ios", "Raise a notification")
              : msg("alarm_notify_aria", "Raise a Chrome notification"),
            () => this.props.onAlarmNotify && this.props.onAlarmNotify(!on),
          ),
          chip(
            Boolean(this.props.alarmSound),
            msg("alarm_sound", "Sound"),
            msg("alarm_sound_aria", "Play a sound"),
            () =>
              this.props.onAlarmSound &&
              this.props.onAlarmSound(!this.props.alarmSound),
          ),
          on
            ? React.createElement(
                AlertPosChip,
                {
                  "data-alarm-drop": "true",
                  "aria-label":
                    window.PriceTabPlatform === "ios"
                      ? msg("alarm_drop_aria_ios", "Stop raising notifications")
                      : msg(
                          "alarm_drop_aria",
                          "Give the notification permission back to Chrome",
                        ),
                  onClick: () =>
                    this.props.onAlarmDrop && this.props.onAlarmDrop(),
                },
                msg("alarm_drop", "Give it back"),
              )
            : null,
        ),
        /* **One line always, the rest behind the ring.**
         *
         * The whole paragraph used to be drawn on every visit: four lines about
         * a Chrome permission under a list of running contracts. Hiding all of
         * it went too far the other way — what the alarm *is for* is the one
         * thing somebody deciding whether to press it needs, and the polish
         * suite said so by failing. So the events it announces stay on screen in
         * a single line, and the permission's own story — asked on the press,
         * never at install, alive only while a tab is open — is one press away
         * in the ring this panel uses for every other explanation. */
        React.createElement(
          AlertPosHint,
          null,
          what === "futures"
            ? msg(
                "alarm_lead_futures",
                "Tells you when a contract is stopped out, takes profit, is liquidated, or walks up to its liquidation — while you are looking at another tab.",
              )
            : msg(
                "alarm_lead_targets",
                "Tells you when a target is hit while you are looking at another tab.",
              ),
        ),
        revoked || this.state.pWhat === "alarm"
          ? React.createElement(
              AlertPosHint,
              null,
              revoked
                ? msg(
                    "alarm_revoked",
                    "Chrome is not holding the permission any more — it can be taken back from chrome://extensions. Press Chrome notification to ask for it again.",
                  )
                : what === "futures"
                  ? msg(
                      "alarm_hint_futures",
                      "Chrome asks for the permission when you press it, never at install, and it works while a PriceTab tab is open: there is no background service watching for you.",
                    )
                  : msg(
                      "alarm_hint_targets",
                      "Chrome asks for the permission when you press it, never at install, and it works while a PriceTab tab is open: there is no background service watching for you.",
                    ),
            )
          : null,
      ),
    );
  }

  priceOf(coin) {
    const stat = this.statOf(coin);
    const price = stat ? Number(stat.price) : NaN;
    return isFinite(price) && price > 0 ? price : null;
  }

  /* What a target is measured against: a coin's price, or — for a portfolio
   * target — the total of everything held. One reading, so the row's distance,
   * its meter and the quick chips cannot disagree about what "now" means. */
  valueOf(a) {
    if (a && a.kind === "portfolio") {
      const total = Number(this.props.portfolioTotal);
      return isFinite(total) && total > 0 ? total : null;
    }
    return this.priceOf(a ? a.coin : null);
  }

  changeOf(coin) {
    const stat = this.statOf(coin);
    const change = stat ? Number(stat.change) : NaN;
    return isFinite(change) ? change : null;
  }

  // Everything after the coin symbol, which the row renders separately so it
  // can carry weight — the symbol is what you scan the list for
  describe(a) {
    if (a.kind === "percent") {
      return a.direction === "above"
        ? msg(
            "al_rises_pct_in",
            "rises $1 in $2",
            formatPercentValue(a.target),
            percentWindowLabel(percentWindowOf(a)),
          )
        : msg(
            "al_falls_pct_in",
            "falls $1 in $2",
            formatPercentValue(a.target),
            percentWindowLabel(percentWindowOf(a)),
          );
    }
    const price = this.props.formatPrice(a.target, a.currency);
    if (a.kind === "portfolio") {
      // "is worth more than", not "rises above": a total is worth something,
      // it does not have a price
      return a.direction === "above"
        ? msg("al_worth_more_than", "is worth more than $1", price)
        : msg("al_worth_less_than", "is worth less than $1", price);
    }
    return a.direction === "above"
      ? msg("al_rises_above_price", "rises above $1", price)
      : msg("al_drops_below_price", "drops below $1", price);
  }

  /* The second line of a row: what the target is worth knowing right now.
   * Four different situations, and saying nothing is better than guessing in
   * any of them — a row with no price beside it is at least honest. */
  detail(a) {
    if (a.expiredAt && !a.triggeredAt) {
      return msg(
        "al_expired_when",
        "Expired $1",
        describeElapsed(Date.now() - a.expiredAt),
      );
    }
    if (a.triggeredAt) {
      const when = describeElapsed(Date.now() - a.triggeredAt);
      const at =
        a.hitPrice != null
          ? msg(
              "al_hit_at",
              " at $1",
              this.props.formatPrice(a.hitPrice, a.currency),
            )
          : "";
      /* One placeholder, joined here, **not two side by side**. Chrome reads
       * `$1$2` as the *named* placeholder `$1$` followed by a `2` — named
       * placeholders use the `$NAME$` form — and refuses to load the whole
       * extension with "Variable $1$ used but not defined. Could not load
       * manifest." The suffix already carries its own leading space, so
       * joining costs nothing and cannot be misread. */
      return msg("al_hit_when", "Hit $1", when + at);
    }
    if (!targetApplies(a, this.props.currency)) {
      return msg(
        "al_set_in_currency",
        "Set in $1 — resumes when you display $1 again",
        a.currency,
      );
    }
    if (a.kind === "percent") {
      /* **The live line is the ticker's 24-hour move, so it is only about a
       * 24-hour target.** Printing it beside a one-hour target would put a
       * number next to a target it says nothing about — the row would read
       * "24h move 6% up · needs 5% up" on a target that had not fired, which
       * looks like a bug in the app rather than two different windows. A
       * shorter window is answered by the hourly candles instead, and the row
       * says that rather than borrowing a figure. */
      if (percentWindowOf(a) !== DEFAULT_PERCENT_WINDOW) {
        return msg(
          "al_move_hourly",
          "Checked against the hourly candles, so within the hour",
        );
      }
      const change = this.changeOf(a.coin);
      if (change === null) return null;
      const moved = formatPercentValue(Math.abs(change));
      const way =
        change >= 0 ? msg("al_way_up", "up") : msg("al_way_down", "down");
      const need =
        a.direction === "above"
          ? msg("al_way_up", "up")
          : msg("al_way_down", "down");
      return msg(
        "al_move_needs",
        "24h move $1 $2 · needs $3 $4",
        moved,
        way,
        formatPercentValue(a.target),
        need,
      );
    }
    const price = this.valueOf(a);
    /* A portfolio target with no total is a target that cannot fire, and it
     * has to say so.
     *
     * `portfolioTotalFrom` returns **null rather than a partial sum** when a
     * held coin has no price — a smaller-than-true total would fire a "worth
     * less than" target on something that did not happen. That is the right
     * refusal, and until now its consequence was silent: the row showed the
     * target, no distance, no meter, and no reason, which is a row that looks
     * armed and never will be. It names the holdings it is waiting on. */
    if (price === null && a.kind === "portfolio") {
      const missing = (this.props.holdings || [])
        .map((h) => h && h.coin)
        .filter((c) => c && this.priceOf(c) === null);
      if (missing.length) {
        const named = missing.slice(0, 3).join(", ");
        return (
          msg("al_waiting_price", "Waiting on a price for $1", named) +
          (missing.length > 3
            ? msg("al_and_more", " and $1 more", missing.length - 3)
            : "") +
          msg(
            "al_total_unmeasured",
            " — the total is left unmeasured rather than counted short",
          )
        );
      }
      return msg("al_no_holdings", "No holdings to total yet");
    }
    if (price === null) return null;
    const away = targetDistancePercent(a, price);
    const now = this.props.formatPrice(price, a.currency);
    const base =
      away === null
        ? msg("al_now", "Now $1", now)
        : msg(
            "al_now_away",
            "Now $1 · $2 away",
            now,
            formatPercentValue(Math.abs(away)),
          );
    return base + this.expiryNote(a);
  }

  // " · expires in 3 days" on an armed target with a span, and nothing otherwise
  expiryNote(a) {
    if (!a.keepFor || a.triggeredAt || a.expiredAt) return "";
    return msg(
      "al_expires",
      " · expires $1",
      describeAhead(a.created + a.keepFor - Date.now()),
    );
  }

  /* Nearest to firing first, so the list answers "what is about to happen"
   * without reading it. Hit targets sink to the bottom — they are history,
   * and history shouldn't push a live target off the first screen. */
  sortedAlerts() {
    const rank = (a) => {
      if (a.triggeredAt) return Infinity;
      if (a.expiredAt) return Number.MAX_VALUE;
      if (!targetApplies(a, this.props.currency)) return Number.MAX_VALUE;
      if (a.kind === "percent") {
        const change = this.changeOf(a.coin);
        if (change === null) return Number.MAX_VALUE - 1;
        const towards = a.direction === "above" ? change : -change;
        return Math.max(0, a.target - towards);
      }
      const price = this.priceOf(a.coin);
      const away = price === null ? null : targetDistancePercent(a, price);
      return away === null ? Number.MAX_VALUE - 1 : Math.abs(away);
    };
    return (
      (this.props.alerts || [])
        .map((a, i) => ({ a, i, r: rank(a) }))
        // Index breaks ties so equally-distant targets keep a stable order
        .sort((x, y) => x.r - y.r || x.i - y.i)
        .map((entry) => entry.a)
    );
  }

  // What the form would produce if you pressed Add right now
  /* **One handler for every number box on this panel.**
   *
   * The character is refused rather than parsed away later, and the field
   * that refused it is remembered so the screen can say which one — the
   * refusal is otherwise indistinguishable from a key that did not register.
   * It clears itself, because a warning about a keystroke is not a state to
   * be dismissed. */
  numberField(name, raw, opts) {
    const d = numericDraft(raw, opts);
    /* **A clean keystroke must not clear it.** Typing is character by
       character, so `12ab3` arrives as five changes and the last of them is
       valid — written as `d.refused ? name : null` the warning appeared and
       was gone again within the same word, which is exactly the silence this
       replaces. Only the timer takes it down. */
    this.setState((p) => ({
      [name]: d.value,
      numWarn: d.refused ? name : p.numWarn,
    }));
    if (!d.refused) return d;
    clearTimeout(this._numT);
    this._numT = setTimeout(() => {
      if (this._gone) return;
      this.setState((p) => (p.numWarn === name ? { numWarn: null } : null));
    }, NUMBER_WARN_MS);
    return d;
  }

  /* The sentence, in the note each screen already has. Returns null when
     nothing was refused, so a caller can fall through to its own note.

     **It has to be asked about a particular field.** Written to answer "did
     anything refuse", the warning took over *every* note on the panel at
     once: a stray letter in the leverage box replaced the margin editor's
     `Margin $450 → $550 · liquidation …` preview two blocks away, and stayed
     there for the whole 2.6 seconds. A note belongs to its own field. */
  numberWarning(...names) {
    if (!this.state.numWarn) return null;
    if (names.length && !names.includes(this.state.numWarn)) return null;
    return msg("num_only", "Numbers only — that character was not entered.");
  }

  hint() {
    const warn = this.numberWarning("target");
    if (warn) return { warn: true, text: warn };
    const target = this.typedTarget();
    if (target === null) return null;
    const { kind, coin, direction } = this.state;
    if (kind === "percent") {
      if (target > MAX_PERCENT_TARGET) {
        return {
          warn: true,
          text: msg(
            "al_keep_under",
            "Keep it under $1% — larger moves don't happen in a day.",
            MAX_PERCENT_TARGET,
          ),
        };
      }
      if (this.duplicate()) {
        return {
          warn: true,
          text: msg("al_duplicate", "You already have this target."),
        };
      }
      const change = this.changeOf(coin);
      if (change !== null && percentReached({ direction, target }, change)) {
        return {
          warn: true,
          text: msg(
            "al_already_moved",
            "$1 has already moved that far today — this fires straight away.",
            coin,
          ),
        };
      }
      return null;
    }
    if (this.duplicate()) {
      return {
        warn: true,
        text: msg("al_duplicate", "You already have this target."),
      };
    }
    const price = this.priceOf(coin);
    if (price === null) return null;
    const already = direction === "above" ? price >= target : price <= target;
    if (already) {
      return {
        warn: true,
        text:
          direction === "above"
            ? msg(
                "al_already_above",
                "$1 is already above that — this fires straight away.",
                coin,
              )
            : msg(
                "al_already_below",
                "$1 is already below that — this fires straight away.",
                coin,
              ),
      };
    }
    const away = ((target - price) / price) * 100;
    return {
      warn: false,
      text:
        away >= 0
          ? msg(
              "al_above_current",
              "$1 above the current $2.",
              formatPercentValue(Math.abs(away)),
              this.props.formatPrice(price, this.props.currency),
            )
          : msg(
              "al_below_current",
              "$1 below the current $2.",
              formatPercentValue(Math.abs(away)),
              this.props.formatPrice(price, this.props.currency),
            ),
    };
  }

  // One target card. Direction badge, the sentence, where it stands, and the
  // meter — then whatever action the row's state allows.
  /* The row's figure column: the one number the panel is opened to read,
   * lifted out of the sentence and set beside it.
   *
   * Four cases and nothing invented for the rest: a hit row shows the price
   * it hit at; a price or portfolio target shows how far away it is; a
   * 24-hour move target shows how much of the move is still to go (the same
   * arithmetic `sortedAlerts` ranks by, so the column and the order agree);
   * a shorter window, a paused currency or a coin with no price yet shows
   * nothing, because the sentence already says why. */
  rowFigure(a) {
    if (a.expiredAt && !a.triggeredAt) return null;
    if (a.triggeredAt) {
      if (a.hitPrice == null) return null;
      return {
        value: this.props.formatPrice(a.hitPrice, a.currency),
        label: msg("al_fig_hit", "hit"),
      };
    }
    if (!targetApplies(a, this.props.currency)) return null;
    if (a.kind === "percent") {
      if (percentWindowOf(a) !== DEFAULT_PERCENT_WINDOW) return null;
      const change = this.changeOf(a.coin);
      if (change === null) return null;
      const towards = a.direction === "above" ? change : -change;
      return {
        value: formatPercentValue(Math.max(0, a.target - towards)),
        label: msg("al_fig_to_go", "to go"),
      };
    }
    const price = this.valueOf(a);
    if (price === null) return null;
    const away = targetDistancePercent(a, price);
    if (away === null) return null;
    return {
      value: formatPercentValue(Math.abs(away)),
      label: msg("al_fig_away", "away"),
    };
  }

  /* The draft target's distance, and how many days have moved at least that
   * far. Nothing is printed unless all four are true: it is a price target,
   * a number has been typed or picked, there is a live price to measure it
   * from, and the record is long enough for a count to mean anything
   * (`dailyMoveCount` refuses below its own minimum, and this refuses the
   * whole line rather than printing half of it).
   *
   * The closes arrive from `loadEdge`, so the line appears when they land
   * rather than blocking the form on a request. */
  renderTargetReach() {
    if (this.state.kind !== "price") return null;
    const value = this.typedTarget();
    if (value === null) return null;
    const coin = this.state.coin;
    const now = this.priceOf(coin);
    if (!(now > 0)) return null;
    const away = ((value - now) / now) * 100;
    if (!isFinite(away) || Math.abs(away) < 0.01) return null;
    const closes = this.state.edgeCloses;
    const reach = Array.isArray(closes) ? dailyMoveCount(closes, away) : null;
    if (!reach) return null;
    return React.createElement(
      AlertsNote,
      null,
      /* **It does not repeat the distance.** The hint above already says how
         far the target is from the price; printing "0.42% away" again two
         lines later reads as the same sentence stuttering. This one is the
         count, and it names the size it counted so it still stands alone
         when the hint is not there. */
      msg(
        "al_reach_note",
        "A move of $1 or more has happened on $2 of the last $3 days.",
        formatPercentValue(Math.abs(away)),
        String(reach.n),
        String(reach.of),
      ),
    );
  }

  renderFigure(fig, tone) {
    if (!fig) return null;
    return React.createElement(
      AlertFigure,
      null,
      React.createElement(AlertFigureValue, { tone }, fig.value),
      React.createElement(AlertFigureLabel, null, fig.label),
    );
  }

  renderRow(a) {
    const { currency } = this.props;
    const up = a.direction === "above";
    const hit = Boolean(a.triggeredAt);
    const expired = Boolean(a.expiredAt) && !hit;
    const detail = this.detail(a);
    const progress = hit || expired ? null : targetProgress(a, this.valueOf(a));
    return React.createElement(
      AlertRow,
      { key: a.id, up, muted: hit || expired },
      React.createElement(
        AlertDirBadge,
        { up, small: true, "aria-hidden": "true" },
        up ? "↑" : "↓",
      ),
      React.createElement(
        AlertMain,
        null,
        React.createElement(
          AlertText,
          { muted: hit || expired },
          React.createElement(
            AlertCoin,
            null,
            a.kind === "portfolio" ? msg("al_portfolio", "Portfolio") : a.coin,
          ),
          " ",
          this.describe(a),
        ),
        a.note &&
          React.createElement(AlertNoteLine, { title: a.note }, `“${a.note}”`),
        detail && React.createElement(AlertDetail, null, detail),
        progress !== null &&
          React.createElement(
            AlertProgressTrack,
            {
              title: msg(
                "al_progress_title",
                "$1% of the way from where it was when you set this",
                Math.round(progress * 100),
              ),
            },
            React.createElement(AlertProgressFill, {
              up,
              style: { width: `${progress * 100}%` },
            }),
          ),
      ),
      /* Re-arm and "paused" sit *before* the figure, so the figure column
       * keeps one right edge on every row — a hit row with the button after
       * its figure pushed that figure 65px left of the others, and a column
       * whose rows do not line up is not a column. */
      a.repeat &&
        React.createElement(
          AlertMeta,
          {
            title: msg(
              "al_repeat_hint",
              "Re-arms itself once the price is back on the other side, and reports every crossing",
            ),
            "aria-label": msg("al_repeat", "repeat"),
          },
          a.repeated ? `↻ ${a.repeated}` : "↻",
        ),
      hit || expired
        ? React.createElement(
            AlertRearm,
            {
              title: msg("al_rearm_hint", "Arm this target again"),
              "aria-label": msg(
                "al_rearm_aria",
                "Re-arm $1 target",
                a.kind === "portfolio"
                  ? msg("al_portfolio", "Portfolio")
                  : a.coin,
              ),
              onClick: () => this.props.onRearm && this.props.onRearm(a.id),
            },
            msg("al_rearm", "Re-arm"),
          )
        : !targetApplies(a, currency)
          ? React.createElement(
              AlertMeta,
              null,
              msg("al_paused_currency", "paused · $1", a.currency),
            )
          : null,
      this.renderFigure(this.rowFigure(a), null),
      React.createElement(
        AlertRemove,
        {
          title: msg("al_remove_target", "Remove target"),
          "aria-label": msg("al_remove_aria", "Remove $1 target", a.coin),
          onClick: () => this.handleRemove(a),
        },
        "×",
      ),
    );
  }

  /* ── Calls, inside the targets panel ──
   *
   * They live here rather than in a settings tab of their own because they
   * are the same kind of thing: something you have said about a future price,
   * settled the next time you open a tab. The panel already had the shape —
   * a list, a live distance, a section for the ones that are done.
   *
   * What they are not is a target, and the wording has to carry that or the
   * panel starts promising something it will not do. A target is a request:
   * tell me when. A call is a claim: I say where. Nothing here is announced,
   * nothing is pushed, and the row says "settles" rather than "hits".
   */
  /* How far the price still has to travel to land inside a call's band.
   * The panel already knows the live price for its targets, so this costs
   * nothing — and "needs +1.8%" is the one number that tells you whether a
   * call is close, which a band alone does not. */
  callDistance(c) {
    /* Only while the call's own currency is the one on screen. `priceOf` reads
     * the ticker, which holds the *display* currency, so a USD band measured
     * against a EUR price produced a confident "needs +9.4%" that was nothing
     * but the exchange rate. Settling is already scoped the same way, so the
     * honest row for a call in another currency says it is paused. */
    if (c.currency !== this.props.currency) return null;
    const price = this.priceOf(c.coin);
    if (price === null) return null;
    if (price >= c.lo && price <= c.hi) return { inside: true };
    const edge = price < c.lo ? c.lo : c.hi;
    return { inside: false, percent: ((edge - price) / price) * 100 };
  }

  renderCallsBody() {
    const {
      calls,
      settledCalls,
      onWithdrawCall,
      callRecord,
      currency,
      predict,
    } = this.props;

    /* The off state is a screen you can act from, not a dead end.
     *
     * It used to return here with an explanation and nothing else — which
     * meant the switch that turns calls on lived *below* a return statement
     * and never rendered. The tab explained a feature it gave you no way to
     * start. It now falls through to the same controls block as the on
     * state, so the switch is always in the same place. */
    if (predict !== true) {
      const now = Date.now();
      const recentFrom = now - 7 * 86400e3;
      const paused = Array.isArray(calls) ? calls.length : 0;
      const kept = callRecord || { hits: 0, total: 0, streak: 0, best: 0 };
      const recentDone = (
        Array.isArray(settledCalls) ? settledCalls : []
      ).filter(
        (c) =>
          c &&
          c.result !== "expired" &&
          isFinite(c.settledAt) &&
          c.settledAt >= recentFrom,
      );
      const recentHits = recentDone.filter((c) => c.result === "hit").length;
      const recentRate = recentDone.length
        ? `${Math.round((recentHits / recentDone.length) * 100)}%`
        : "—";
      const fact = (value, label, title) =>
        React.createElement(
          AlertsEmptyFact,
          { title },
          React.createElement(AlertsEmptyFactValue, null, value),
          React.createElement(AlertsEmptyFactLabel, null, label),
        );
      return React.createElement(
        Fragment,
        null,
        React.createElement(
          AlertsEmpty,
          null,
          React.createElement(
            AlertsEmptyMark,
            { "aria-hidden": "true" },
            /* The board, not the target's rings. Both empty states borrowed
             * the rings back when this was a tab inside the targets panel and
             * there was nothing else to borrow; with its own control in the
             * corner, an empty calls screen wearing the targets mark says you
             * are in the wrong place. */
            icon("calls", 1.3),
          ),
          React.createElement(
            AlertsEmptyTitle,
            null,
            msg("al_calls_off", "Calls are off"),
          ),
          /* Three lines, not six.
           *
           * This screen was carrying the whole manual — what a call is, how it
           * settles, what the score is and is not — centred, which is fine for
           * a line or two and hard work at six. The tab has an info ring in its
           * head for the long version, and it reads the live state rather than
           * repeating a paragraph. What has to stay is the sentence about the
           * score being worth nothing: it is not decoration, it is the line
           * between a chart and a wager, and it belongs where someone decides
           * whether to switch this on. */
          React.createElement(
            AlertsEmptyText,
            null,
            msg(
              "al_calls_off_body",
              "Point at a square of empty future on the chart and you have said where the price will be, and when. It settles itself the next time you open a tab — nothing is announced, nothing is sent, and the score is worth nothing.",
            ),
          ),

          React.createElement(
            AlertsEmptySteps,
            null,
            React.createElement(
              AlertsEmptyStep,
              null,
              React.createElement(AlertsEmptyStepNo, null, "1"),
              React.createElement(
                AlertsEmptyStepText,
                null,
                msg("al_calls_step_1", "Turn calls on and go to the board."),
              ),
            ),
            React.createElement(
              AlertsEmptyStep,
              null,
              React.createElement(AlertsEmptyStepNo, null, "2"),
              React.createElement(
                AlertsEmptyStepText,
                null,
                msg(
                  "al_calls_step_2",
                  "Click a square once to draft, twice to lock.",
                ),
              ),
            ),
            React.createElement(
              AlertsEmptyStep,
              null,
              React.createElement(AlertsEmptyStepNo, null, "3"),
              React.createElement(
                AlertsEmptyStepText,
                null,
                msg(
                  "al_calls_step_3",
                  "Come back with K to track open and settled calls.",
                ),
              ),
            ),
          ),

          /* Stored calls do not disappear when the feature is switched off,
           * and they do not stop being judged either — settling runs whatever
           * this switch says, or a call left open across a week off would come
           * back with its evidence scrolled off the range and be dropped
           * unanswered. What the switch turns off is the board: drawing it,
           * placing on it, and being told.
           *
           * That used to be a sentence *under* the button, in the same grey as
           * the explanation above it, where it read as one more thing to skip.
           * It is the only concrete fact on the screen, so it goes above the
           * button as a figure — with the record beside it, which survives the
           * switch in exactly the same way and was not shown at all. */
          (paused > 0 || kept.total > 0) &&
            React.createElement(
              AlertsEmptyFacts,
              null,
              paused > 0 &&
                fact(
                  paused,
                  msg("al_still_settling", "still settling"),
                  msg(
                    "al_still_judged",
                    "Calls you have already made are still judged while this is off — turning it back on brings the board back with them",
                  ),
                ),
              kept.total > 0 &&
                fact(
                  `${Math.round((kept.hits / kept.total) * 100)}%`,
                  msg("al_of_total", "of $1", kept.total),
                  msg(
                    "al_record_kept",
                    "Your record is kept. It lives on this device only and is worth nothing",
                  ),
                ),
              kept.best > 0 &&
                fact(
                  kept.best,
                  msg("al_best_streak", "best streak"),
                  msg(
                    "al_best_streak_hint",
                    "The longest run of calls you got right",
                  ),
                ),
            ),

          (recentDone.length > 0 || paused > 0) &&
            React.createElement(
              AlertsEmptyPanel,
              null,
              React.createElement(
                AlertsEmptyPanelTitle,
                null,
                msg("al_7d_snapshot", "Last 7 days"),
              ),
              React.createElement(
                AlertsEmptyFacts,
                { style: { marginTop: "0.2rem" } },
                fact(
                  recentRate,
                  msg("al_7d_hit_rate", "hit rate"),
                  msg(
                    "al_7d_hit_rate_hint",
                    "Settled calls in the last 7 days",
                  ),
                ),
                fact(
                  recentDone.length,
                  msg("al_7d_settled", "settled"),
                  msg(
                    "al_7d_settled_hint",
                    "Calls that got an answer in the last 7 days",
                  ),
                ),
                fact(
                  paused,
                  msg("al_open_now", "open now"),
                  msg(
                    "al_open_now_hint",
                    "Open calls currently waiting to settle",
                  ),
                ),
              ),
            ),

          /* The thing this switches on is the board, and the board is on the
           * chart behind this card. Leaving the card up after the press put
           * "point at a square to the right of the dotted line" in front of
           * the squares it was pointing at; the panel steps aside instead,
           * and K brings it back with the record and the foot. */
          React.createElement(
            AlertsEmptyActions,
            null,
            React.createElement(
              AlertPrimaryButton,
              {
                ghost: true,
                onClick: () => this.setState({ info: true }),
              },
              msg("al_calls_learn_more", "How calls work"),
            ),
            React.createElement(
              AlertPrimaryButton,
              {
                ghost: true,
                onClick: () => {
                  this.props.onPredictChange(true);
                  if (this.props.onClose) this.props.onClose();
                },
              },
              msg("al_calls_practice", "Try a practice call"),
            ),
            React.createElement(
              AlertPrimaryButton,
              {
                onClick: () => {
                  this.props.onPredictChange(true);
                  if (this.props.onClose) this.props.onClose();
                },
              },
              msg("al_turn_calls_on", "Turn calls on"),
            ),
          ),
        ),
      );
    }

    const nowMs = Date.now();
    const dayAhead = nowMs + 86400e3;
    const mineOnly = this.state.callsMineOnly === true;
    const view = this.state.callsView || "all";
    const order = this.state.callsOrder || "soon";
    const byCoin = (c) => !mineOnly || c.coin === this.props.activeCoin;
    const openRaw = (Array.isArray(calls) ? calls : []).filter(byCoin);
    const doneRaw = (Array.isArray(settledCalls) ? settledCalls : []).filter(
      byCoin,
    );
    const open = openRaw
      .slice()
      .sort((a, b) =>
        order === "recent"
          ? (b.placed || 0) - (a.placed || 0)
          : a.target - b.target,
      );
    const done = doneRaw
      .slice()
      .sort((a, b) => (b.settledAt || 0) - (a.settledAt || 0));
    const openDue = open.filter((c) => Number(c.target) <= dayAhead);
    const showOpen = view === "all" || view === "open" || view === "due";
    const showDone = view === "all" || view === "settled";
    const shownOpen = view === "due" ? openDue : open;
    const dueCount = open.filter((c) => Number(c.target) <= nowMs).length;
    const record = callRecord || { hits: 0, total: 0, streak: 0, best: 0 };
    /* Every price on a call row is printed in the currency that call was made
     * in, not the one on screen. Formatting a USD band with whatever symbol
     * happens to be selected puts a € in front of a number that was never a
     * euro — and the toast and the target rows had it right all along, so the
     * two halves of the same panel disagreed about the same call. */
    const money = (v, c) => this.props.formatPrice(v, c.currency);
    const band = (c) => `${money(c.lo, c)} – ${money(c.hi, c)}`;

    return React.createElement(
      Fragment,
      null,

      /* The scoreboard. Three figures over three labels — see `AlertScore`
       * for why it stopped being a sentence. The hit rate carries its `n` in
       * its own label and a meter of the same share under it, so the number
       * is never separated from what it is a share of. */
      record.total > 0 &&
        (() => {
          const share = (record.hits / record.total) * 100;
          const tile = (value, label, meter) =>
            React.createElement(
              AlertScoreTile,
              { key: label },
              React.createElement(AlertScoreValue, null, value),
              React.createElement(AlertScoreLabel, null, label),
              meter != null &&
                React.createElement(
                  AlertScoreMeter,
                  { "aria-hidden": "true" },
                  React.createElement(AlertScoreFill, { share: meter }),
                ),
            );
          return React.createElement(
            AlertScore,
            {
              role: "group",
              "aria-label": msg(
                "al_of_settled",
                " of $1 settled",
                record.total,
              ).trim(),
            },
            tile(
              `${Math.round(share)}%`,
              `${msg("al_sb_hit_rate", "hit rate")} · ${msg("al_of_total", "of $1", record.total)}`,
              share,
            ),
            tile(record.streak, msg("al_sb_streak", "streak")),
            tile(record.best, msg("al_best_streak", "best streak")),
          );
        })(),

      (open.length > 0 || done.length > 0) &&
        React.createElement(
          AlertRecordBar,
          { style: { marginTop: "0.7rem" } },
          React.createElement(
            "span",
            null,
            msg(
              "al_calls_pulse",
              "$1 open · $2 due now · $3 on this range",
              open.length,
              dueCount,
              this.props.period,
            ),
          ),
          mineOnly
            ? React.createElement(
                AlertRecordFigure,
                null,
                msg("al_this_coin_only", "this coin only"),
              )
            : null,
        ),

      /* **The record, broken down.** Three lines that a single hit rate hides,
       * each a count with its denominator and never a grade:
       *
       *  - **By confidence** — the calibration table forecasting sites keep
       *    (Metaculus draws it as a curve): of the calls marked "sure", how
       *    many came true, against "likely" and "hunch". A person can run a
       *    fine average and be systematically over-sure; this is the line
       *    that shows it. A percentage only from `RECORD_MIN_FOR_STATS` calls
       *    at that level, counts below it — the rule the derivatives record
       *    already follows.
       *  - **By coin** and **by range** — where the hits actually came from.
       *    Built from the settled calls still on the record (`done`), which
       *    "clear settled" empties, and the line says so by being absent.
       *
       * No colour and no ordering by merit: sorted by how many, so the busiest
       * line comes first, whatever it says. */
      done.length > 0 &&
        (() => {
          const lines = [];
          const tally = (list, key) => {
            const groups = new Map();
            for (const c of list) {
              const k = key(c);
              if (!k) continue;
              const g = groups.get(k) || { hits: 0, n: 0 };
              g.n += 1;
              if (c.result === "hit") g.hits += 1;
              groups.set(k, g);
            }
            return [...groups.entries()].sort((a, b) => b[1].n - a[1].n);
          };
          const cell = (label, g) =>
            `${label} ${msg("al_x_of_y", "$1 of $2", g.hits, g.n)}` +
            (g.n >= RECORD_MIN_FOR_STATS
              ? ` (${Math.round((g.hits / g.n) * 100)}%)`
              : "");
          const conf = tally(done, (c) => c.confidence);
          if (conf.length) {
            const order = CALL_CONFIDENCE_LEVELS.slice().reverse();
            const words = {
              sure: msg("al_conf_sure", "sure"),
              likely: msg("al_conf_likely", "likely"),
              hunch: msg("al_conf_hunch", "hunch"),
            };
            lines.push([
              msg("al_by_confidence", "By confidence"),
              order
                .filter((k) => conf.some(([g]) => g === k))
                .map((k) => cell(words[k], conf.find(([g]) => g === k)[1]))
                .join(" · "),
            ]);
          }
          const coins = tally(done, (c) => c.coin);
          if (coins.length > 1) {
            lines.push([
              msg("al_by_coin", "By coin"),
              coins
                .slice(0, 4)
                .map(([k, g]) => cell(k, g))
                .join(" · "),
            ]);
          }
          const ranges = tally(done, (c) => c.period);
          if (ranges.length > 1) {
            lines.push([
              msg("al_by_range", "By range"),
              ranges
                .slice(0, 4)
                .map(([k, g]) => cell(periodLabel(k), g))
                .join(" · "),
            ]);
          }
          if (!lines.length) return null;
          return React.createElement(
            Fragment,
            null,
            ...lines.map(([label, text]) =>
              React.createElement(
                AlertRecordBar,
                { key: label, "data-record-line": label },
                React.createElement(
                  AlertsSectionLabelTight,
                  { style: { margin: 0 } },
                  label,
                ),
                React.createElement(AlertRecordFigure, null, text),
              ),
            ),
          );
        })(),

      /* **What chance would have given.** A percentage on its own cannot tell
       * a careful caller from someone who only ever names the square the price
       * is already in: both read 60%. Each settled call carries the odds of
       * its own square, measured on the series at the moment it was named
       * (`callOdds`), so summing them gives the number of hits an indifferent
       * caller would expect from exactly these squares.
       *
       * Only the calls that carry odds are counted, on both sides of the
       * comparison — a call placed before this existed, or on a series too
       * short to measure, has no odds and is left out of *both* totals rather
       * than counted as a certainty or as a miss. Below two such calls there
       * is nothing to compare and the line is absent, not empty: the rule the
       * base-rate panel already follows. */
      (() => {
        const scored = (settledCalls || []).filter(
          (c) => c && c.odds && isFinite(c.odds.p) && c.result !== "expired",
        );
        if (scored.length < 2) return null;
        const expected = scored.reduce((sum, c) => sum + c.odds.p, 0);
        const got = scored.filter((c) => c.result === "hit").length;
        /* **And what it would have paid.**
         *
         * A called square is a binary option — a band and a time — so it has
         * a fair price, and `callPayout` reads it off the same odds. A flat
         * stake on every call, priced at those odds: naming the square the
         * price is already in returns about what it risked, and a square four
         * out returns several times it. That is the difference a hit rate
         * cannot show and this does, without anyone grading calls by hand.
         *
         * Points, never a currency, and the row says so in its own words. */
        const book = scored.reduce(
          (acc, c) => {
            const pay = callPayout(c, CALL_STAKE);
            if (!pay) return acc;
            return {
              staked: acc.staked + pay.staked,
              returned: acc.returned + pay.returned,
            };
          },
          { staked: 0, returned: 0 },
        );
        const net = book.returned - book.staked;
        return React.createElement(
          Fragment,
          null,
          React.createElement(
            AlertRecordBar,
            null,
            React.createElement(
              "span",
              null,
              msg(
                "al_vs_chance",
                "$1 of $2 called · chance would give $3",
                got,
                scored.length,
                expected.toFixed(1),
              ),
            ),
          ),
          book.staked > 0 &&
            React.createElement(
              AlertRecordBar,
              null,
              React.createElement(
                "span",
                null,
                msg(
                  "al_fair_odds",
                  "At fair odds, $1 points a call: risked $2, came back $3",
                  CALL_STAKE,
                  Math.round(book.staked),
                  Math.round(book.returned),
                ),
              ),
              React.createElement(
                AlertRecordFigure,
                null,
                (net >= 0 ? "+" : "") + Math.round(net),
              ),
            ),
        );
      })(),

      /* Nothing called yet: the panel's whole job on this visit is to explain
       * the gesture, so it gets the room the targets tab's empty state gets.
       * As a `AlertsNote` it was two lines of small grey text pinned to the
       * top-left of a band with no height to give — and the second line ran
       * into the fade at the bottom of the scroller, so the sentence that
       * explains the *second click* was the half you could not read.
       *
       * The wording is the gesture as it actually is. "With the chart grid on"
       * was left over from when the mesh was a separate switch — calls draw it
       * themselves now — and it named a prerequisite instead of the two
       * clicks, which is the part nobody guesses. */
      open.length === 0 &&
        done.length === 0 &&
        !this.state.info &&
        React.createElement(
          AlertsEmpty,
          null,
          React.createElement(
            AlertsEmptyMark,
            { "aria-hidden": "true" },
            icon("calls", 1.3),
          ),
          React.createElement(
            AlertsEmptyTitle,
            null,
            msg("al_no_calls", "No calls yet"),
          ),
          React.createElement(
            AlertsEmptyText,
            null,
            msg(
              "al_no_calls_body",
              "Point at a square to the right of the dotted line and click it twice — once to draft it, once to lock it in. You have said the price will be in that band, at that time.",
            ),
          ),
          React.createElement(
            AlertsEmptyText,
            null,
            msg(
              "al_drag_hint_b",
              "Drag the board up or down to look at other prices, and sideways to make it bigger or smaller.",
            ),
          ),
          /* The only thing to do on this screen is on the chart behind it. */
          React.createElement(
            AlertPrimaryButton,
            {
              ghost: true,
              onClick: () => this.props.onClose && this.props.onClose(),
            },
            msg("al_go_board", "Go to the board"),
          ),
        ),

      showOpen &&
        shownOpen.length > 0 &&
        React.createElement(
          Fragment,
          null,
          React.createElement(
            AlertsSectionLabel,
            null,
            msg("al_open_n", "Open · $1", shownOpen.length),
          ),
          React.createElement(
            AlertsList,
            null,
            shownOpen.map((c) => {
              const d = this.callDistance(c);
              const now = nowMs;
              /* How far along the call is, from when it was made to when it
               * settles. Time, not merit: the track is neutral ink. Clamped,
               * because a call that is due has run its whole length. */
              const elapsed =
                c.target > c.placed
                  ? Math.min(
                      1,
                      Math.max(0, (now - c.placed) / (c.target - c.placed)),
                    )
                  : 1;
              const fig =
                c.target <= now
                  ? { value: "—", label: msg("al_fig_due", "due") }
                  : d && d.inside
                    ? {
                        value: msg("al_fig_in_band", "in band"),
                        label: msg("al_fig_now", "now"),
                      }
                    : d
                      ? {
                          value: formatSignedPercent(d.percent),
                          label: msg("al_fig_needs", "needs"),
                        }
                      : null;
              return React.createElement(
                AlertRow,
                { key: c.id, up: true, dense: true },
                React.createElement(
                  AlertMain,
                  null,
                  React.createElement(
                    AlertText,
                    null,
                    React.createElement(AlertCoin, null, c.coin),
                    " in ",
                    band(c),
                  ),
                  React.createElement(
                    AlertDetail,
                    null,
                    /* A target that has come and gone is not "settling now" —
                     * it is waiting for the series that answers it. Left to
                     * `describeAhead`, a negative number came back as "now"
                     * and the row said "Settles now" for as long as the call
                     * sat there, which is a promise the panel cannot keep. */
                    c.target <= Date.now()
                      ? msg(
                          "al_due",
                          "Due — settles next time this range loads",
                        )
                      : msg(
                          "al_settles_in",
                          "Settles $1",
                          describeAhead(c.target - Date.now()),
                        ),
                    d &&
                      (d.inside
                        ? msg("al_in_band", " · in the band now")
                        : msg(
                            "al_needs_pct",
                            " · needs $1",
                            formatSignedPercent(d.percent),
                          )),
                    /* The price when the call was made. Stored since the
                     * beginning and never shown — it is what turns a band
                     * into a decision you can look back on. */
                    c.placedPrice != null
                      ? msg(
                          "al_called_at_suffix",
                          " · called at $1",
                          money(c.placedPrice, c),
                        )
                      : "",
                    /* A call belongs to the range it was made on — that is
                     * what keeps it from being settled against a series that
                     * does not reach back to its target. So a call made on a
                     * different range is not on the chart in front of you,
                     * and the row has to say which one, or it looks lost. */
                    c.period !== this.props.period
                      ? msg("al_on_range", " · on $1", periodLabel(c.period))
                      : "",
                    /* Same for the currency, and it matters more: settling
                     * only ever runs in the currency a call was made in, so
                     * this row is not merely elsewhere, it is stopped. */
                    c.currency !== currency
                      ? msg(
                          "al_paused_set_in",
                          " · paused — set in $1",
                          c.currency,
                        )
                      : "",
                  ),
                  React.createElement(
                    AlertProgressTrack,
                    {
                      title: msg(
                        "al_time_title",
                        "$1% of the way to settlement",
                        Math.round(elapsed * 100),
                      ),
                    },
                    React.createElement(AlertProgressFill, {
                      neutral: true,
                      style: { width: `${elapsed * 100}%` },
                    }),
                  ),
                  /* How sure. Three chips, one lit or none; pressing the lit
                   * one takes it off. Set here rather than on the chart,
                   * because the chart's two clicks are the gesture and a
                   * third would be a question in the way of it. */
                  this.props.onCallConfidence &&
                    React.createElement(
                      AlertConfRow,
                      {
                        role: "group",
                        "aria-label": msg(
                          "al_conf_hint",
                          "How sure you are — the record keeps score by it",
                        ),
                      },
                      ...CALL_CONFIDENCE_LEVELS.map((level) =>
                        React.createElement(
                          AlertStateChip,
                          {
                            key: level,
                            on: c.confidence === level,
                            "aria-pressed": c.confidence === level,
                            title: msg(
                              "al_conf_hint",
                              "How sure you are — the record keeps score by it",
                            ),
                            onClick: () =>
                              this.props.onCallConfidence(
                                c.id,
                                c.confidence === level ? null : level,
                              ),
                          },
                          level === "sure"
                            ? msg("al_conf_sure", "sure")
                            : level === "likely"
                              ? msg("al_conf_likely", "likely")
                              : msg("al_conf_hunch", "hunch"),
                        ),
                      ),
                    ),
                ),
                this.renderFigure(
                  fig,
                  d && !d.inside && c.target > now
                    ? d.percent >= 0
                      ? "up"
                      : "down"
                    : null,
                ),
                React.createElement(
                  AlertRemove,
                  {
                    onClick: () => onWithdrawCall && onWithdrawCall(c.id),
                    "aria-label": msg("al_withdraw_hint", "Withdraw this call"),
                    title: msg("al_withdraw", "Withdraw"),
                  },
                  "×",
                ),
              );
            }),
          ),
        ),

      /* Only once there is something to filter: with no call at all the empty
         state above already says so, and these two lines said it twice more. */
      showOpen &&
        shownOpen.length === 0 &&
        ((Array.isArray(this.props.calls) ? this.props.calls.length : 0) + (Array.isArray(this.props.settledCalls) ? this.props.settledCalls.length : 0)) > 0 &&
        React.createElement(
          AlertsNote,
          null,
          view === "due"
            ? msg(
                "al_due_empty",
                "No calls due in the next 24 hours on this view.",
              )
            : msg("al_open_empty", "No open calls on this view."),
        ),

      showDone &&
        done.length > 0 &&
        React.createElement(
          Fragment,
          null,
          React.createElement(
            AlertsSectionLabel,
            null,
            msg("al_settled_n", "Settled · $1", done.length),
          ),
          React.createElement(
            AlertsList,
            null,
            done.map((c) => {
              const hit = c.result === "hit";
              const by =
                !hit && c.settledPrice != null
                  ? c.settledPrice > c.hi
                    ? c.settledPrice - c.hi
                    : c.lo - c.settledPrice
                  : null;
              return React.createElement(
                AlertRow,
                { key: c.id, up: hit, muted: !hit },
                React.createElement(
                  AlertMain,
                  null,
                  React.createElement(
                    AlertText,
                    { muted: !hit },
                    React.createElement(AlertCoin, null, c.coin),
                    " in ",
                    band(c),
                  ),
                  React.createElement(
                    AlertDetail,
                    null,
                    c.placedPrice != null
                      ? msg(
                          "al_called_at",
                          "Called at $1",
                          money(c.placedPrice, c),
                        )
                      : msg("al_called", "Called"),
                    c.settledPrice != null
                      ? msg(
                          "al_closed_at",
                          " · closed at $1",
                          money(c.settledPrice, c),
                        )
                      : "",
                    by != null && by > 0
                      ? msg("al_missed_by", " · missed by $1", money(by, c))
                      : "",
                    c.confidence
                      ? ` · ${
                          c.confidence === "sure"
                            ? msg("al_conf_sure", "sure")
                            : c.confidence === "likely"
                              ? msg("al_conf_likely", "likely")
                              : msg("al_conf_hunch", "hunch")
                        }`
                      : "",
                  ),
                ),
                React.createElement(
                  AlertVerdict,
                  { hit },
                  hit
                    ? msg("al_called_it", "Called it")
                    : msg("al_missed", "Missed"),
                ),
              );
            }),
          ),
        ),

      showDone &&
        done.length === 0 &&
        ((Array.isArray(this.props.calls) ? this.props.calls.length : 0) + (Array.isArray(this.props.settledCalls) ? this.props.settledCalls.length : 0)) > 0 &&
        React.createElement(
          AlertsNote,
          null,
          msg("al_settled_empty", "No settled calls on this view."),
        ),
    );
  }

  /* The calls tab's settings.
   *
   * They scroll with the list rather than being pinned the way the add-target
   * form is. The form is pinned because adding a target is the reason that
   * tab exists and it must stay reachable at ten rows; a call is placed on
   * the chart, not here, so this tab has no action to keep in reach — and a
   * 400px block of switches nailed to the bottom left the list a slot barely
   * two rows deep. */
  /* The calls foot: three strips, always on screen.
   *
   * Grouped by what each control does, not by what kind of widget it is —
   * aim the call, choose what gets drawn, manage the record and the mode.
   * Each strip is one line, because three title-plus-explanation setting rows
   * is a settings page and a settings page does not fit under a list.
   *
   * The explanations moved into `title` tooltips. They were worth a paragraph
   * each when they lived in a scrolling body with room to spare; pinned under
   * the list, a paragraph per switch is what pushed the whole thing off the
   * card in the first place.
   */

  exportCalls() {
    const { callRecord, calls, settledCalls } = this.props;
    const body = {
      exported: new Date().toISOString(),
      record: callRecord || { hits: 0, total: 0, streak: 0, best: 0 },
      open: Array.isArray(calls) ? calls : [],
      done: Array.isArray(settledCalls) ? settledCalls : [],
    };
    downloadTextFile(
      `pricetab-calls-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(body, null, 2),
      "application/json",
    );
  }

  renderCallsFoot() {
    const {
      callsShowSettled,
      travelBand,
      cellOdds,
      onCellOddsChange,
      onTravelBandChange,
      onCallsShowSettledChange,
      callsCelebrate,
      onCallsCelebrateChange,
      onResetCalls,
      onClearSettled,
      callRecord,
      settledCalls,
      callGeometry,
      currency,
      boardZoom,
      onBoardZoomChange,
    } = this.props;
    const record = callRecord || { total: 0 };
    const doneCount = Array.isArray(settledCalls) ? settledCalls.length : 0;
    const openCount = Array.isArray(this.props.calls)
      ? this.props.calls.length
      : 0;
    const mineOnly = this.state.callsMineOnly === true;
    const view = this.state.callsView || "all";
    const order = this.state.callsOrder || "soon";
    /* One rung along the zoom ladder, clamped. `+1` is out — a wider band and a
     * longer reach, which is what you press when the move you want to call has
     * no square on the screen. */
    const zoomBy = (dir) => {
      const at = BOARD_ZOOM_STEPS.indexOf(boardZoom);
      const i = at === -1 ? BOARD_ZOOM_STEPS.indexOf(DEFAULT_BOARD_ZOOM) : at;
      return BOARD_ZOOM_STEPS[
        Math.min(BOARD_ZOOM_STEPS.length - 1, Math.max(0, i + dir))
      ];
    };

    const toggle = (label, on, onClick, title) =>
      React.createElement(
        AlertStateChip,
        {
          on,
          onClick,
          title,
          "aria-pressed": Boolean(on),
          "aria-label": title || label,
        },
        label,
      );
    const action = (label, onClick, title, opts) =>
      React.createElement(
        AlertActionKey,
        {
          onClick,
          title,
          strong: opts && opts.strong,
          danger: opts && opts.danger,
          disabled: opts && opts.disabled,
          "aria-label": title || label,
        },
        label,
      );

    /* The board's place on the zoom ladder, as one control.
     *
     * `−`, where it stands, `+` — the chart's own pill in the panel's
     * typeface, so the two are one thing to learn. The middle is the way back
     * to the default and, at the default, deliberately not a control at all:
     * no role, no tab stop, no name, no underline. It is drawn at every zoom
     * either way, so pressing `+` never moves `−` out from under the pointer,
     * which is exactly what the old appearing-and-disappearing `reset` did. */
    /* Everything below reads the *resolved* zoom, never the raw prop. A value
     * that is not on the ladder — a hand-edited storage key, a step retired in
     * a later version — already fell back to the default for the arrows
     * (`zoomBy` does its own `indexOf` check), and would then have been
     * printed between them as `×undefined`: the two halves of one control
     * disagreeing about where the board stands. */
    const zoomNow =
      BOARD_ZOOM_STEPS.indexOf(boardZoom) === -1
        ? DEFAULT_BOARD_ZOOM
        : boardZoom;
    const atDefault = zoomNow === DEFAULT_BOARD_ZOOM;
    const stepper = React.createElement(
      AlertStepper,
      null,
      React.createElement(
        AlertStepperBtn,
        {
          onClick: () => onBoardZoomChange && onBoardZoomChange(zoomBy(-1)),
          disabled: zoomNow <= BOARD_ZOOM_MIN,
          title: msg(
            "al_zoom_in_hint",
            "Zoom in: a tighter band, a shorter reach  ( ] )",
          ),
          "aria-label": msg("al_zoom_in", "Zoom the board in"),
        },
        "−",
      ),
      atDefault
        ? React.createElement(
            AlertStepperValue,
            { active: false, "aria-hidden": "true" },
            `×${zoomNow}`,
          )
        : React.createElement(
            AlertStepperReset,
            {
              active: true,
              type: "button",
              onClick: () =>
                onBoardZoomChange && onBoardZoomChange(DEFAULT_BOARD_ZOOM),
              title: msg("al_zoom_reset", "Back to the default board reach"),
              "aria-label": msg(
                "al_zoom_reset",
                "Back to the default board reach",
              ),
            },
            `×${zoomNow}`,
          ),
      React.createElement(
        AlertStepperBtn,
        {
          onClick: () => onBoardZoomChange && onBoardZoomChange(zoomBy(1)),
          disabled: zoomNow >= BOARD_ZOOM_MAX,
          title: msg(
            "al_zoom_out_hint",
            "Zoom out: a wider band, far enough to call a big move  ( [ )",
          ),
          "aria-label": msg("al_zoom_out", "Zoom the board out"),
        },
        "+",
      ),
    );

    return React.createElement(
      AlertCallsFoot,
      null,

      /* Reach. It reports; it does not set.
       *
       * There was a stepper here, one to ten squares, and it was the second
       * way to say a thing the chart already says better: the board's size is
       * a length, you can see it, and the line between what happened and what
       * has not is right there to be pulled. A number counting squares is that
       * length in a unit nobody thinks in, kept in sync by hand. What is worth
       * keeping is the readout — how far the board reaches and what one square
       * is worth in price and in time — which is the part you cannot see by
       * looking. */
      callGeometry &&
        React.createElement(
          AlertCallsStrip,
          null,
          React.createElement(
            AlertStripLabel,
            {
              title: msg(
                "al_board_hint",
                "Drag the now line on the chart to resize the board",
              ),
            },
            msg("al_board", "Board"),
          ),
          React.createElement(
            AlertStripFigures,
            null,
            /* "square" earns its place. Without it the second half is two
             * numbers with no noun in front of them — and it is the half that
             * decides how precise a call has to be. The label is "Board"
             * rather than "Reach" because the row describes the thing, and
             * because a row named after a quantity in a column of settings
             * reads like a setting you can change here. */
            msg(
              "al_board_readout",
              "$1 ahead$2 · square $3 × $4",
              describeSpan(callGeometry.reachMs),
              callGeometry.covers
                ? ` · ±${formatAxisPrice(
                    callGeometry.covers,
                    callGeometry.step,
                    getCurrencySymbol(currency),
                  )}`
                : "",
              formatAxisPrice(
                callGeometry.step,
                callGeometry.step,
                getCurrencySymbol(currency),
              ),
              describeSpan(callGeometry.spanMs),
            ),
          ),
          /* The strip was a readout with nothing to press, and the one thing it
           * describes that you *cannot* set by dragging the now line is how far
           * the board reaches in price. Out makes each square worth more and the
           * reach grow with it — which is the difference between being able to
           * call a crash and having no square to point at. */
          React.createElement(AlertStripGap, null),
          stepper,
        ),

      // Filters for a list that exists — not drawn before the first call
      openCount + doneCount > 0 &&
      React.createElement(
        AlertCallsStrip,
        null,
        React.createElement(AlertStripLabel, null, msg("al_view", "View")),
        toggle(
          msg("al_view_all", "all"),
          view === "all",
          () => this.setState({ callsView: "all" }),
          msg("al_view_all_hint", "Show open and settled calls together"),
        ),
        toggle(
          msg("al_view_open", "open"),
          view === "open",
          () => this.setState({ callsView: "open" }),
          msg("al_view_open_hint", "Only open calls"),
        ),
        toggle(
          msg("al_view_settled", "settled"),
          view === "settled",
          () => this.setState({ callsView: "settled" }),
          msg("al_view_settled_hint", "Only settled calls"),
        ),
        toggle(
          msg("al_view_due", "due"),
          view === "due",
          () => this.setState({ callsView: "due" }),
          msg("al_view_due_hint", "Open calls due in the next 24 hours"),
        ),
        toggle(
          msg("al_this_coin", "this coin"),
          mineOnly,
          () => this.setState({ callsMineOnly: !mineOnly }),
          msg("al_this_coin_hint", "Only calls for the coin on screen"),
        ),
        React.createElement(AlertStripGap, null),
        toggle(
          order === "recent"
            ? msg("al_order_recent", "recent first")
            : msg("al_order_soon", "due first"),
          order === "recent",
          () =>
            this.setState({
              callsOrder: order === "recent" ? "soon" : "recent",
            }),
          msg(
            "al_order_hint",
            "Switch between due-first and newest-first ordering for open calls",
          ),
        ),
      ),

      /* What is drawn on the chart.
       *
       * No grid switch here any more. It offered to turn the mesh off, and
       * with calls on the chart draws it either way — the squares *are* the
       * mesh, so there is nothing coherent for the switch to do. Measured:
       * twenty-eight lines with it on, twenty-eight with it off. A control
       * that cannot change anything in the state it is shown in is worse than
       * a missing one, because it teaches people the panel is decorative. It
       * still lives in Settings → Chart Grid and on "G", where it governs the
       * plain chart. */
      React.createElement(
        AlertCallsStrip,
        null,
        React.createElement(AlertStripLabel, null, msg("al_show", "Show")),
        toggle(
          "settled",
          callsShowSettled !== false,
          () =>
            onCallsShowSettledChange &&
            onCallsShowSettledChange(callsShowSettled === false),
          msg(
            "al_keep_settled_hint",
            "Keep settled calls on the chart, marked called it or missed",
          ),
        ),
        /* What the board could never say by itself: how far this coin
         * actually travels in a square's worth of time. Worded as what it is —
         * a record of distances, with the direction deliberately removed — so
         * nothing here can be read as a call the app is making. */
        /* The chance on each square (cell-odds.js): computed from the coin's
         * own bars, calibrated out of sample before it was allowed on the
         * board, and shaded in ink — never the direction colours. */
        toggle(
          msg("al_cell_odds", "chances"),
          cellOdds !== false,
          () => onCellOddsChange && onCellOddsChange(cellOdds === false),
          msg(
            "al_cell_odds_hint",
            "Write on each square the chance the price is in it when its column ends — from this coin's own bars, scaled to how it is moving now, and checked against years of squares before it was allowed on the board",
          ),
        ),
        toggle(
          msg("al_travel_band", "travel band"),
          travelBand === true,
          () => onTravelBandChange && onTravelBandChange(travelBand !== true),
          "Shade how far this coin has moved over each square's worth of time — the middle half and the middle 80% of past distances, with the direction taken out. It is a record, not a forecast",
        ),
        toggle(
          "celebrate",
          callsCelebrate !== false,
          () =>
            onCallsCelebrateChange &&
            onCallsCelebrateChange(callsCelebrate === false),
          msg(
            "al_burst_hint",
            "A burst on the chart the first time you open a tab after getting one right",
          ),
        ),
      ),

      /* The record. Turning calls off moved to the panel's head (30 Sep
       * 2026); what is left here is the record's own three actions, and the
       * row is not drawn while there is nothing to export, clear or reset. */
      (record.total > 0 || doneCount > 0) &&
      React.createElement(
        AlertCallsStrip,
        { "data-calls-record": "true" },
        React.createElement(AlertStripLabel, null, msg("al_record", "Record")),
        /* The record as a file. It is the one thing in this panel that is
         * yours and nowhere else, and a record you cannot take with you is
         * one you cannot trust to survive a reinstall. JSON, the same shape
         * the store holds, so the backup and this agree. */
        (record.total > 0 || doneCount > 0) &&
          action(
            msg("al_export", "export"),
            () => this.exportCalls(),
            msg(
              "al_export_hint",
              "Save the record as a file. It stays yours and is worth nothing",
            ),
          ),
        doneCount > 0 &&
          action(
            msg("al_clear_settled", "clear settled"),
            () => onClearSettled && onClearSettled(),
            msg(
              "al_clear_settled_hint",
              "Remove settled calls from the chart and from this list",
            ),
          ),
        record.total > 0 &&
          action(
            msg("al_reset_score", "reset score"),
            () => onResetCalls && onResetCalls(),
            msg(
              "al_reset_score_hint",
              "Set the record back to nothing. It lives on this device only and is worth nothing",
            ),
            { danger: true },
          ),
      ),
    );
  }

  /* What this tab is, where it stands, and the keys that reach it.
   *
   * Three things, and the middle one is why this is not a help page. A tally of
   * "0 open" says nothing about what an open call is; a paragraph of
   * documentation says nothing about the four you already have. The state lines
   * are read off the same props the list is drawn from, so they cannot drift
   * out of date the way written help does.
   *
   * The keys belong here too. They are all listed under "?", which is a
   * different overlay — telling someone the shortcut in the place they are
   * standing is how they stop needing this card at all.
   */
  renderInfo(onCalls, lists) {
    const { currency, alerts } = this.props;
    const key = (keys, label) =>
      React.createElement(
        AlertsInfoKey,
        { key: label },
        ...keys.map((k) => React.createElement(AlertsKey, { key: k }, k)),
        label,
      );
    const line = (text, i) =>
      React.createElement(
        AlertsInfoLine,
        { key: i },
        React.createElement("span", null, text),
      );

    if (!onCalls) {
      const paused = alerts.filter(
        (a) => !a.triggeredAt && !targetApplies(a, currency),
      ).length;
      const state = [
        msg(
          "al_armed_hit_used",
          "$1 armed · $2 hit · $3 of $4 used",
          lists.armed.length,
          lists.done.length,
          alerts.length,
          MAX_ALERTS,
        ),
      ];
      if (paused) {
        state.push(
          msg(
            "al_paused_info",
            "$1 paused — set in another currency, so $2 when you switch back to it. A move target never pauses: a percentage means the same thing everywhere.",
            paused,
            paused === 1
              ? msg("al_it_resumes", "it resumes")
              : msg("al_they_resume", "they resume"),
          ),
        );
      }
      state.push(
        this.props.alertTabTitle !== false
          ? msg(
              "al_hit_announced",
              "A hit is announced in the tab title, and targets are checked while this tab is hidden.",
            )
          : msg(
              "al_hit_here_only",
              "A hit is reported here only — announcing it in the tab title is off in Settings, which also stops the background checking.",
            ),
      );
      return React.createElement(
        AlertsInfo,
        null,
        React.createElement(
          AlertsInfoText,
          null,
          msg(
            "al_targets_info",
            "A target is a request: tell me when. Name a price (“BTC rises above 80,000”) or a move (“BTC falls 5% in 24h”) and it is reported here the next time you open a tab — including one that happened overnight, because every target is checked against the last week of hourly candles rather than only against the price right now.",
          ),
        ),
        React.createElement(AlertsInfoState, null, ...state.map(line)),
        React.createElement(
          AlertsInfoKeys,
          null,
          key(["A"], msg("al_key_this_panel", "this panel")),
          key(["Enter"], msg("al_key_add", "add")),
          key(["Esc"], msg("al_key_close", "close")),
        ),
      );
    }

    const on = this.props.predict === true;
    const rec = this.props.callRecord || { hits: 0, total: 0, best: 0 };
    const open = Array.isArray(this.props.calls) ? this.props.calls.length : 0;
    const settled = Array.isArray(this.props.settledCalls)
      ? this.props.settledCalls.length
      : 0;
    const state = [];
    state.push(
      on
        ? msg("al_on_open_settled", "On · $1 open · $2 settled", open, settled)
        : msg(
            "al_off_kept",
            "Off · $1 kept and still settling in the background — what is off is the board: nothing is drawn, nothing can be placed, and a win is not announced",
            open,
          ),
    );
    if (rec.total > 0) {
      state.push(
        msg(
          "al_called_right",
          "$1 of $2 called right$3. The score is on this device only and is worth nothing.",
          rec.hits,
          rec.total,
          rec.best > 1
            ? msg("al_best_streak_suffix", " · best streak $1", rec.best)
            : "",
        ),
      );
    }
    /* No board numbers here. How far it reaches and what a square is worth are
     * already on screen, in the Board strip at the foot of this tab — printing
     * them again a few inches above it makes the card look padded, and the card
     * has to be the one thing that says something new. The strip is a readout
     * with no control, so what this adds is where the control is. */
    if (on) {
      state.push(
        msg(
          "al_call_belongs",
          "A call belongs to the coin, range and currency it was made on, and only settles there. Calls stand down while two coins share the chart.",
        ),
      );
    }
    return React.createElement(
      AlertsInfo,
      null,
      React.createElement(
        AlertsInfoText,
        null,
        msg(
          "al_calls_info_b",
          "A call is a claim: not “tell me when”, but “I say where”. Point at a square in the empty strip to the right of the chart and you are naming a price band and a moment — one click drafts it, a second locks it. It settles itself the next time you open a tab, against the price at that moment, and the box stays on the chart saying whether you were right. Each square carries its chance: from this coin's own bars, scaled to how it is moving now, and measured on years of past squares before it was allowed on the board — a chance, not a tip. Drag the board up or down to look at other prices, and left or right for more board or more history.",
        ),
      ),
      React.createElement(AlertsInfoState, null, ...state.map(line)),
      React.createElement(
        AlertsInfoKeys,
        null,
        key(["K"], msg("al_key_this_panel", "this panel")),
        key(["L"], msg("al_key_calls_toggle", "calls on / off")),
        key(["G"], msg("al_key_grid", "grid on the plain chart")),
      ),
    );
  }

  /* The coin field: a search box with a ranked list above it.
   *
   * It replaced a `<select>` over all 81 coins in two optgroups. A native
   * select only jumps by the first letter of the label, so reaching SNX meant
   * scrolling a list the height of the panel — in a place people come to type
   * a number. Nothing else in the form changed, and neither did any target
   * already set.
   *
   * The list is only up while there is a query (`coinQuery !== null`), so the
   * field reads as the chosen coin the rest of the time. `onMouseDown` rather
   * than `onClick` on a row, because blur fires first and would close the menu
   * out from under the click.
   */
  renderCoinPicker() {
    const searching = this.state.coinQuery !== null;
    const rows = searching ? this.coinMatches() : [];
    return React.createElement(
      AlertCoinField,
      null,
      React.createElement(AlertCoinInput, {
        type: "text",
        open: searching,
        value: searching ? this.state.coinQuery : this.state.coin,
        placeholder: msg("al_search_coins", "Search coins"),
        "aria-label": msg("al_target_coin", "Target coin"),
        "aria-expanded": searching,
        autoComplete: "off",
        spellCheck: false,
        onFocus: (e) => {
          this.setState({ coinQuery: "", coinAt: 0 });
          e.target.select();
        },
        onBlur: () => this.setState({ coinQuery: null, coinAt: 0 }),
        onChange: (e) =>
          this.setState({ coinQuery: e.target.value, coinAt: 0 }),
        onKeyDown: this.handleCoinKey,
      }),
      searching &&
        React.createElement(
          AlertCoinMenu,
          null,
          rows.length
            ? rows.map((r, i) =>
                React.createElement(
                  AlertCoinOption,
                  {
                    key: r.coin,
                    active: i === Math.min(this.state.coinAt, rows.length - 1),
                    // Blur beats click; mousedown is the one that still lands
                    onMouseDown: (e) => {
                      e.preventDefault();
                      this.pickCoin(r.coin);
                    },
                  },
                  React.createElement(AlertCoin, null, r.coin),
                  React.createElement(
                    AlertCoinName,
                    null,
                    COIN_NAMES[r.coin] || "",
                  ),
                ),
              )
            : React.createElement(
                AlertCoinEmpty,
                null,
                msg(
                  "news_no_match",
                  "Nothing matching “$1”.",
                  this.state.coinQuery,
                ),
              ),
        ),
    );
  }

  render() {
    const { alerts, currency, onClose } = this.props;
    const atCap = alerts.length >= MAX_ALERTS;
    const isPercent = this.state.kind === "percent";
    /* A target on the total of everything held. Offered only when there is
     * something held: a target on a total that is always zero can never fire,
     * and a control that cannot change anything in the state it is offered in
     * is one this codebase removes rather than ships. */
    const isPortfolio = this.state.kind === "portfolio";
    const canPortfolio = hasHoldings(this.props.holdings);
    const hint = this.hint();
    // Already-hit targets are history: they get their own section under the
    // live ones instead of trailing the same list, so a full panel still
    // opens on what is about to happen
    /* Which of the two the caller opened. It is a prop rather than state
     * because the two are separate controls now — the corner button and the
     * key decide, and a panel that remembered its own last tab would open on
     * calls after you pressed the targets key. Calls still need the app to
     * have wired the feature up, so a caller that did not falls back to
     * targets rather than rendering a screen with no handlers behind it. */
    const hasCalls = typeof this.props.onPredictChange === "function";
    /* **The derivatives market is a page, not this card** — see
       `practice-page.js`. It still lives in this component, so the Esc
       handling, the book's timer and the deposit that lands on unmount are
       shared; everything below the return is targets and calls. */
    if (this.props.view === "futures") return this.renderPracticePage(onClose);
    const onCalls = hasCalls && this.props.view === "calls";
    const sorted = this.sortedAlerts();
    const armed = sorted.filter((a) => !a.triggeredAt && !a.expiredAt);
    const done = sorted.filter((a) => a.triggeredAt);
    const lapsed = sorted.filter((a) => a.expiredAt && !a.triggeredAt);
    // A price chip needs a price to work off; a percent one is self-contained
    const callRec = this.props.callRecord || { hits: 0, total: 0 };
    const openCalls = Array.isArray(this.props.calls)
      ? this.props.calls.length
      : 0;
    const tally = onCalls
      ? this.props.predict !== true
        ? "off"
        : msg(
            "al_n_open",
            "$1 open$2",
            openCalls,
            callRec.total
              ? ` · ${Math.round((callRec.hits / callRec.total) * 100)}%`
              : "",
          )
      : alerts.length === 0
        ? `0 / ${MAX_ALERTS}`
        : msg(
            "al_armed_summary",
            "$1 armed$2 · $3/$4",
            armed.length,
            done.length ? msg("al_n_hit", " · $1 hit", done.length) : "",
            alerts.length,
            MAX_ALERTS,
          );

    const quickUp = this.state.direction === "above";
    const quickSteps = isPercent
      ? QUICK_PERCENT_STEPS
      : this.valueOf({ kind: this.state.kind, coin: this.state.coin }) !== null
        ? QUICK_PRICE_STEPS
        : null;
    return React.createElement(
      AlertsOverlay,
      {
        innerRef: this.setDrawerRef,
        "data-alerts-drawer": "true",
        role: "dialog",
        "aria-label": onCalls
          ? msg("al_calls", "Calls")
          : msg("chrome_targets_short", "Targets"),
      },
      React.createElement(
        AlertsCard,
        /* A hook for the render tests: finding the card by class means
           finding a generated one. */
        { "data-alerts-card": "true" },
        React.createElement(
          AlertsHead,
          null,
          React.createElement(
            AlertsHeadTitle,
            null,
            onCalls
              ? msg("al_calls", "Calls")
              : msg("chrome_targets_short", "Targets"),
            keyCap(onCalls ? "K" : "A"),
          ),
          React.createElement(
            AlertsHeadRight,
            null,
            React.createElement(AlertsTally, null, tally),
            /* **Calls on and off, where the eye lands** (30 Sep 2026, "calls
             * modunu turn off etmek kullanıcı için zor, butonu bulması zor").
             * It was "turn off" in the last row of the panel's foot, under
             * five rows of board settings and at the fold on a laptop. It is
             * the panel's first control now, the same switch Settings uses. */
            onCalls &&
              React.createElement(
                AlertsCallsSwitch,
                { "data-calls-switch": this.props.predict === true ? "on" : "off" },
                React.createElement(
                  AlertsCallsSwitchText,
                  { "aria-hidden": "true" },
                  this.props.predict === true ? msg("al_calls_state_on", "On") : msg("al_calls_state_off", "Off"),
                ),
                React.createElement(ToggleSwitch, {
                  active: this.props.predict === true,
                  role: "switch",
                  "aria-checked": this.props.predict === true ? "true" : "false",
                  "aria-label": msg("al_calls_switch", "Calls on the chart"),
                  title: msg("al_calls_switch_title", "Calls on the chart — your calls and score are kept either way (L)"),
                  onClick: () => this.props.onPredictChange && this.props.onPredictChange(this.props.predict !== true),
                }),
              ),
            React.createElement(
              AlertsInfoBtn,
              {
                active: this.state.info,
                onClick: () => this.setState((p) => ({ info: !p.info })),
                title: onCalls
                  ? msg(
                      "al_info_calls",
                      "What calls are, where they stand, and the keys",
                    )
                  : msg(
                      "al_info_targets",
                      "What targets are, where they stand, and the keys",
                    ),
                "aria-label": msg("al_about_panel", "About this panel"),
                "aria-expanded": this.state.info ? "true" : "false",
              },
              icon("info", 0.95),
            ),
          ),
        ),
        this.state.info && this.renderInfo(onCalls, { armed, done }),
        React.createElement(
          AlertsBody,
          {
            /* **So the sticky foot can know whether anything is under it.**
               See `measureBody`. */
            innerRef: (n) => (this.bodyRef = n),
            onScroll: () => this.measureBody(),
            /* With the info card open and nothing to list, the body is a
               28px band of padding and fade between the card and the form —
               a box with nothing in it. It folds to nothing instead. */
            collapsed:
              this.state.info &&
              (onCalls
                ? this.props.predict === true &&
                  !(
                    Array.isArray(this.props.calls) && this.props.calls.length
                  ) &&
                  !(
                    Array.isArray(this.props.settledCalls) &&
                    this.props.settledCalls.length
                  ) &&
                  !(callRec.total > 0)
                : alerts.length === 0 && !this.state.undo),
          },
          onCalls && this.renderCallsBody(),
          /* A first visit gets the coin on the chart, where it stands, and
           * an example written from that price — not "BTC rises above
           * 80,000" on a chart showing SOL at $148. Hidden while the info
           * card is open: that card is the explanation, and two of them
           * pushed the form's own state under the fade. */
          !onCalls &&
            alerts.length === 0 &&
            !this.state.info &&
            (() => {
              const coin = this.props.activeCoin;
              const stat = this.statOf(coin);
              const price =
                stat && isFinite(stat.price) && stat.price > 0
                  ? stat.price
                  : null;
              const example = price
                ? this.props.formatPrice(
                    roundTargetPrice(price * 1.05),
                    currency,
                  )
                : "80,000";
              const change = stat && isFinite(stat.change) ? stat.change : null;
              const fact = (value, label) =>
                React.createElement(
                  AlertsEmptyFact,
                  { key: label },
                  React.createElement(AlertsEmptyFactValue, null, value),
                  React.createElement(AlertsEmptyFactLabel, null, label),
                );
              return React.createElement(
                AlertsEmpty,
                null,
                React.createElement(
                  AlertsEmptyMark,
                  { "aria-hidden": "true" },
                  icon("target", 1.3),
                ),
                React.createElement(
                  AlertsEmptyTitle,
                  null,
                  msg("al_no_targets", "No targets yet"),
                ),
                React.createElement(
                  AlertsEmptyText,
                  null,
                  msg(
                    "al_no_targets_body",
                    "Watch for a price (“$1 rises above $2”) or for a move (“$1 falls 5% in 24h”). It is reported the next time you open a tab, even if it happened overnight.",
                    price ? coin : "BTC",
                    example,
                  ),
                ),
                price &&
                  React.createElement(
                    AlertsEmptyFacts,
                    null,
                    fact(
                      this.props.formatPrice(price, currency),
                      msg("al_fact_now", "$1 now", coin),
                    ),
                    change !== null &&
                      fact(
                        formatSignedPercent(change),
                        msg("al_fact_24h", "24h change"),
                      ),
                  ),
              );
            })(),
          !onCalls &&
            armed.length > 0 &&
            React.createElement(
              AlertsList,
              null,
              armed.map((a) => this.renderRow(a)),
            ),
          !onCalls &&
            lapsed.length > 0 &&
            React.createElement(
              Fragment,
              null,
              React.createElement(
                AlertsSectionLabel,
                null,
                msg("al_expired", "Expired"),
              ),
              React.createElement(
                AlertsList,
                null,
                lapsed.map((a) => this.renderRow(a)),
              ),
            ),
          !onCalls &&
            done.length > 0 &&
            React.createElement(
              Fragment,
              null,
              React.createElement(
                AlertsSectionLabel,
                null,
                msg("al_already_hit", "Already hit"),
              ),
              React.createElement(
                AlertsList,
                null,
                done.map((a) => this.renderRow(a)),
              ),
            ),
          !onCalls &&
            this.state.undo &&
            React.createElement(
              AlertUndoBar,
              null,
              React.createElement(
                "span",
                null,
                msg(
                  "al_removed_target",
                  "Removed the $1 target",
                  this.state.undo.coin,
                ),
              ),
              React.createElement(
                AlertUndoButton,
                { onClick: () => this.handleUndo() },
                msg("set_undo", "Undo"),
              ),
            ),
        ),
        /* The calls tab's pinned foot. Only while calls are on: the off
         * screen already carries its own switch, and a drawer whose every row
         * is conditional on the feature being on would open onto nothing. */
        onCalls && this.props.predict === true && this.renderCallsFoot(),
        !onCalls &&
          React.createElement(
            AlertFormBlock,
            null,
            React.createElement(
              AlertsSectionLabelTight,
              null,
              msg("al_new_target", "New target"),
            ),
            // Kind first: it changes what the rest of the row means, so it
            // reads wrong underneath the inputs it governs
            React.createElement(
              AlertKindRow,
              null,
              React.createElement(
                AlertKindButton,
                {
                  active: !isPercent,
                  onClick: () => this.setState({ kind: "price", target: "" }),
                },
                msg("al_kind_price", "A price"),
              ),
              React.createElement(
                AlertKindButton,
                {
                  active: isPercent,
                  onClick: () => this.setState({ kind: "percent", target: "" }),
                },
                msg("al_kind_percent", "A move"),
              ),
              canPortfolio &&
                React.createElement(
                  AlertKindButton,
                  {
                    active: isPortfolio,
                    title: msg(
                      "al_portfolio_kind_hint",
                      "Watch the total of everything you hold, rather than one coin. Checked whenever a tab is open — a total cannot be reconstructed from candles, because the amounts held are only known as they are now.",
                    ),
                    onClick: () =>
                      this.setState({ kind: "portfolio", target: "" }),
                  },
                  msg("al_kind_portfolio", "My portfolio"),
                ),
            ),
            React.createElement(
              AlertForm,
              null,
              /* Any supported coin, not only the ones on your chart. Wanting to
               * be told when something moves is exactly how a coin earns a
               * place on the list — requiring it to be there first had the
               * dependency backwards. Your own coins stay on top. */
              // A portfolio target has no coin to pick — the whole point of it
              isPortfolio ? null : this.renderCoinPicker(),
              /* The window, beside the direction rather than under the form: it
               * is part of the sentence being written ("rises 5% in 4h"), not a
               * setting about it. Offered only for the kind that has one — a
               * control that cannot change anything in the state it is offered
               * in is one this panel has removed before. */
              isPercent &&
                React.createElement(
                  AlertSelect,
                  {
                    value: String(this.state.percentWindow),
                    "aria-label": msg(
                      "al_window_label",
                      "Window the move is measured over",
                    ),
                    onChange: (e) =>
                      this.setState({ percentWindow: Number(e.target.value) }),
                  },
                  ...PERCENT_WINDOW_OPTIONS.map((o) =>
                    React.createElement(
                      "option",
                      { key: o.value, value: String(o.value) },
                      msg("al_window_in", "in $1", o.label),
                    ),
                  ),
                ),
              React.createElement(
                AlertSelect,
                {
                  value: this.state.direction,
                  "aria-label": msg("al_direction", "Target direction"),
                  onChange: (e) => this.setState({ direction: e.target.value }),
                },
                React.createElement(
                  "option",
                  { value: "above" },
                  isPercent
                    ? msg("al_rises", "rises")
                    : isPortfolio
                      ? msg("al_worth_more", "worth more than")
                      : msg("al_rises_above", "rises above"),
                ),
                React.createElement(
                  "option",
                  { value: "below" },
                  isPercent
                    ? msg("al_falls", "falls")
                    : isPortfolio
                      ? msg("al_worth_less", "worth less than")
                      : msg("al_drops_below", "drops below"),
                ),
              ),
              React.createElement(AlertInput, {
                type: "text",
                inputMode: "decimal",
                innerRef: this.setInputRef,
                value: this.state.target,
                placeholder: isPercent
                  ? msg(
                      "al_pct_in",
                      "% in $1",
                      percentWindowLabel(this.state.percentWindow),
                    )
                  : isPortfolio
                    ? msg("al_total_in", "total in $1", currency)
                    : msg("al_target_in", "target in $1", currency),
                "aria-label": isPercent
                  ? msg("al_target_percent", "Target move in percent")
                  : isPortfolio
                    ? msg("al_target_total", "Target portfolio total")
                    : msg("al_target_price", "Target price"),
                "aria-invalid":
                  this.state.numWarn === "target" ? "true" : "false",
                onChange: (e) => this.numberField("target", e.target.value),
                onKeyDown: this.handleKeyDown,
              }),
              React.createElement(
                AlertAdd,
                { onClick: this.handleAdd, disabled: atCap },
                msg("al_add", "Add"),
              ),
            ),
            quickSteps &&
              React.createElement(
                AlertQuickRow,
                null,
                React.createElement(
                  AlertQuickLabel,
                  null,
                  isPercent
                    ? msg("al_common", "Common")
                    : quickUp
                      ? msg("al_above_by", "Above by")
                      : msg("al_below_by", "Below by"),
                ),
                quickSteps.map((step) =>
                  React.createElement(
                    AlertQuickChip,
                    {
                      key: step,
                      up: quickUp,
                      title: isPercent
                        ? msg("al_a_pct_move", "A $1% move", step)
                        : quickUp
                          ? msg(
                              "al_pct_above_current",
                              "$1% above the current price",
                              step,
                            )
                          : msg(
                              "al_pct_below_current",
                              "$1% below the current price",
                              step,
                            ),
                      onClick: () => this.applyQuick(step),
                    },
                    `${quickUp ? "+" : "−"}${step}%`,
                  ),
                ),
              ),
            /* What else a target can carry. A note (the reason, on the row
             * where it can be read back), a span (TradingView's expiration),
             * and — for a price target — whether it repeats (TradingView's
             * "every time", CoinGecko's "recurring"). A move target has no
             * repeat switch: its window passing is what re-arms it. */
            React.createElement(
              AlertOptionsRow,
              null,
              React.createElement(AlertInput, {
                type: "text",
                value: this.state.note,
                maxLength: ALERT_NOTE_MAX,
                placeholder: msg("al_note_placeholder", "note, optional"),
                "aria-label": msg("al_note_label", "A note to yourself"),
                onChange: (e) => this.setState({ note: e.target.value }),
                onKeyDown: this.handleKeyDown,
              }),
              React.createElement(
                AlertSelect,
                {
                  value:
                    this.state.keepFor === null
                      ? ""
                      : String(this.state.keepFor),
                  "aria-label": msg("al_keep_label", "Keep the target for"),
                  title: msg("al_keep_label", "Keep the target for"),
                  onChange: (e) =>
                    this.setState({
                      keepFor:
                        e.target.value === "" ? null : Number(e.target.value),
                    }),
                },
                ...ALERT_KEEP_OPTIONS.map((o) =>
                  React.createElement(
                    "option",
                    {
                      key: String(o.value),
                      value: o.value === null ? "" : String(o.value),
                    },
                    o.label,
                  ),
                ),
              ),
              !isPercent &&
                !isPortfolio &&
                React.createElement(
                  AlertStateChip,
                  {
                    on: this.state.repeat,
                    "aria-pressed": this.state.repeat,
                    title: msg(
                      "al_repeat_hint",
                      "Re-arms itself once the price is back on the other side, and reports every crossing",
                    ),
                    onClick: () =>
                      this.setState((p) => ({ repeat: !p.repeat })),
                  },
                  msg("al_repeat", "repeat"),
                ),
            ),
            hint &&
              React.createElement(AlertHint, { warn: hint.warn }, hint.text),
            // Inside the form band, not below it: the card's bands own their
            // padding now, and how detection works is context for adding one
            React.createElement(
              AlertsNote,
              null,
              atCap
                ? msg(
                    "al_limit_reached",
                    "Target limit reached ($1). Remove one to add another.",
                    MAX_ALERTS,
                  )
                : msg(
                    "al_detect_note_short",
                    "Checked on every new tab, including last week's candles, so a move that reverted overnight is still reported. Nothing leaves your device.",
                  ),
            ),
            /* **How far, and how ordinary that far is.**
             A percentage on its own does not say whether a target is a
             Tuesday or an event, and that is the thing worth knowing before
             setting one. A count with its denominator says it — no arrow, no
             probability, and nothing about *this* target: the rule the
             base-rate panel is built on, applied to one number. */
            !atCap && this.renderTargetReach(),
            /* **The gesture has to be advertised or it does not exist**, which
             is the rule the "?" list already states about a shortcut. The
             drawer sits beside a live chart and a click on it fills the price
             — said here, under the field it fills, and only while it is true:
             a percent target has no level to pick, and with the board on the
             click belongs to the square. */
            !atCap &&
              !isPercent &&
              !isPortfolio &&
              this.props.predict !== true &&
              React.createElement(
                AlertsNote,
                null,
                msg("al_pick_hint", "Or click the chart to pick a price."),
              ),
            this.renderAlarmRow("targets"),
          ),
      ),
    );
  }
}

AlertsPanel.defaultProps = {
  view: "targets", // "targets" | "calls" | "futures" — the screen the caller opened
  alerts: [],
  coinOptions: [],
  activeCoin: "BTC",
  currency: "USD",
  stats: null, // { COIN: { price, change, marketCap } } in the displayed currency
};
