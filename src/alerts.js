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

const PERCENT_WINDOW_MS = 86400000; // percent targets measure over 24h

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

/* The same backward look for percent targets. A 24h move can't be read off a
 * single candle, so each candle is compared with the one a day earlier — the
 * series is hourly over a week, so that is 24 steps back. Without this a
 * percent target would only ever catch a move still standing when you opened
 * a tab, and the whole point of the feature is that it doesn't need you
 * watching. Returns when the move first reached the target, or null. */
const percentHitInCandles = (target, candles) => {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const step = candles[1].time - candles[0].time;
  if (!isFinite(step) || step <= 0) return null;
  const back = Math.round(PERCENT_WINDOW_MS / step);
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
const findTriggeredAlerts = (
  alerts,
  prices,
  currency,
  candlesByCoin,
  changes,
) => {
  const fired = [];
  for (const a of alerts || []) {
    if (a.triggeredAt) continue;
    if (!targetApplies(a, currency)) continue;
    const candles = candlesByCoin ? candlesByCoin[a.coin] : null;
    const price = prices ? Number(prices[a.coin]) : NaN;
    const livePrice = isFinite(price) && price > 0 ? price : null;

    if (a.kind === "percent") {
      const hitAt = percentHitInCandles(a, candles);
      if (hitAt) {
        fired.push({ ...a, hitAt, hitPrice: priceAtOrNull(candles, hitAt) });
        continue;
      }
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

// Which coins need a price for the alert check (unfired, and either a percent
// target or a price target in the currency on display)
const alertCoinsToWatch = (alerts, currency) => {
  const coins = new Set();
  for (const a of alerts || []) {
    if (!a.triggeredAt && targetApplies(a, currency)) coins.add(a.coin);
  }
  return [...coins];
};

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

class AlertsPanel extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      coin: props.activeCoin,
      kind: "price",
      direction: "above",
      target: "",
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
    };
    this.handleAdd = this.handleAdd.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleCoinKey = this.handleCoinKey.bind(this);
    this.renderCoinPicker = this.renderCoinPicker.bind(this);
    this.setInputRef = (r) => (this.inputRef = r);
  }

  // Straight to typing — the panel exists to add a target, and every visit
  // began with a click into the box
  componentDidMount() {
    if (this.inputRef && this.props.alerts.length < MAX_ALERTS) {
      this.inputRef.focus();
    }
  }

  typedTarget() {
    const value = Number(this.state.target);
    return isFinite(value) && value > 0 ? value : null;
  }

  handleAdd() {
    const target = this.typedTarget();
    if (target === null) return;
    if (this.state.kind === "percent" && target > MAX_PERCENT_TARGET) return;
    if (this.duplicate()) return;
    this.props.onAdd(
      this.state.coin,
      this.state.kind,
      this.state.direction,
      target,
    );
    this.setState({ target: "" });
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
    return quickSwitchMatches(this.state.coinQuery || "", this.props.coinOptions);
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
      if (rows.length) this.pickCoin(rows[Math.min(this.state.coinAt, rows.length - 1)].coin);
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
      const price = this.priceOf(this.state.coin);
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
        a.coin === coin &&
        a.kind === kind &&
        a.direction === direction &&
        a.target === target &&
        (kind === "percent" || a.currency === this.props.currency),
    );
  }

  // What we know about a coin right now, or nothing. `stats` is built by the
  // app from the ticker snapshot it already holds — see `coinStats`.
  statOf(coin) {
    return (this.props.stats && this.props.stats[coin]) || null;
  }

  priceOf(coin) {
    const stat = this.statOf(coin);
    const price = stat ? Number(stat.price) : NaN;
    return isFinite(price) && price > 0 ? price : null;
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
      return `${a.direction === "above" ? "rises" : "falls"} ${formatPercentValue(a.target)} in 24h`;
    }
    const price = this.props.formatPrice(a.target, a.currency);
    return `${a.direction === "above" ? "rises above" : "drops below"} ${price}`;
  }

  /* The second line of a row: what the target is worth knowing right now.
   * Four different situations, and saying nothing is better than guessing in
   * any of them — a row with no price beside it is at least honest. */
  detail(a) {
    if (a.triggeredAt) {
      const when = describeElapsed(Date.now() - a.triggeredAt);
      const at =
        a.hitPrice != null
          ? ` at ${this.props.formatPrice(a.hitPrice, a.currency)}`
          : "";
      return `Hit ${when}${at}`;
    }
    if (!targetApplies(a, this.props.currency)) {
      return `Set in ${a.currency} — resumes when you display ${a.currency} again`;
    }
    if (a.kind === "percent") {
      const change = this.changeOf(a.coin);
      if (change === null) return null;
      const moved = formatPercentValue(Math.abs(change));
      const way = change >= 0 ? "up" : "down";
      return `24h move ${moved} ${way} · needs ${formatPercentValue(a.target)} ${a.direction === "above" ? "up" : "down"}`;
    }
    const price = this.priceOf(a.coin);
    if (price === null) return null;
    const away = targetDistancePercent(a, price);
    const now = this.props.formatPrice(price, a.currency);
    if (away === null) return `Now ${now}`;
    return `Now ${now} · ${formatPercentValue(Math.abs(away))} away`;
  }

  /* Nearest to firing first, so the list answers "what is about to happen"
   * without reading it. Hit targets sink to the bottom — they are history,
   * and history shouldn't push a live target off the first screen. */
  sortedAlerts() {
    const rank = (a) => {
      if (a.triggeredAt) return Infinity;
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
  hint() {
    const target = this.typedTarget();
    if (target === null) return null;
    const { kind, coin, direction } = this.state;
    if (kind === "percent") {
      if (target > MAX_PERCENT_TARGET) {
        return {
          warn: true,
          text: `Keep it under ${MAX_PERCENT_TARGET}% — larger moves don't happen in a day.`,
        };
      }
      if (this.duplicate()) {
        return { warn: true, text: "You already have this target." };
      }
      const change = this.changeOf(coin);
      if (change !== null && percentReached({ direction, target }, change)) {
        return {
          warn: true,
          text: `${coin} has already moved that far today — this fires straight away.`,
        };
      }
      return null;
    }
    if (this.duplicate()) {
      return { warn: true, text: "You already have this target." };
    }
    const price = this.priceOf(coin);
    if (price === null) return null;
    const already = direction === "above" ? price >= target : price <= target;
    if (already) {
      return {
        warn: true,
        text: `${coin} is already ${direction === "above" ? "above" : "below"} that — this fires straight away.`,
      };
    }
    const away = ((target - price) / price) * 100;
    return {
      warn: false,
      text: `${formatPercentValue(Math.abs(away))} ${away >= 0 ? "above" : "below"} the current ${this.props.formatPrice(price, this.props.currency)}.`,
    };
  }

  // One target card. Direction badge, the sentence, where it stands, and the
  // meter — then whatever action the row's state allows.
  renderRow(a) {
    const { currency } = this.props;
    const up = a.direction === "above";
    const hit = Boolean(a.triggeredAt);
    const detail = this.detail(a);
    const progress = hit ? null : targetProgress(a, this.priceOf(a.coin));
    return React.createElement(
      AlertRow,
      { key: a.id, up, muted: hit },
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
          { muted: hit },
          React.createElement(AlertCoin, null, a.coin),
          " ",
          this.describe(a),
        ),
        detail && React.createElement(AlertDetail, null, detail),
        progress !== null &&
          React.createElement(
            AlertProgressTrack,
            {
              title: `${Math.round(progress * 100)}% of the way from where it was when you set this`,
            },
            React.createElement(AlertProgressFill, {
              up,
              style: { width: `${progress * 100}%` },
            }),
          ),
      ),
      hit
        ? React.createElement(
            AlertRearm,
            {
              title: "Arm this target again",
              "aria-label": `Re-arm ${a.coin} target`,
              onClick: () => this.props.onRearm && this.props.onRearm(a.id),
            },
            "Re-arm",
          )
        : !targetApplies(a, currency)
          ? React.createElement(AlertMeta, null, `paused · ${a.currency}`)
          : null,
      React.createElement(
        AlertRemove,
        {
          title: "Remove target",
          "aria-label": `Remove ${a.coin} target`,
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
    const { calls, settledCalls, onWithdrawCall, callRecord, currency, predict } =
      this.props;

    /* The off state is a screen you can act from, not a dead end.
     *
     * It used to return here with an explanation and nothing else — which
     * meant the switch that turns calls on lived *below* a return statement
     * and never rendered. The tab explained a feature it gave you no way to
     * start. It now falls through to the same controls block as the on
     * state, so the switch is always in the same place. */
    if (predict !== true) {
      const paused = Array.isArray(calls) ? calls.length : 0;
      const kept = callRecord || { hits: 0, total: 0, streak: 0, best: 0 };
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
          React.createElement(AlertsEmptyTitle, null, "Calls are off"),
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
            "Point at a square of empty future on the chart and you have said where the price will be, and when. It settles itself the next time you open a tab — nothing is announced, nothing is sent, and the score is worth nothing.",
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
                  "still settling",
                  "Calls you have already made are still judged while this is off — turning it back on brings the board back with them",
                ),
              kept.total > 0 &&
                fact(
                  `${Math.round((kept.hits / kept.total) * 100)}%`,
                  `of ${kept.total}`,
                  "Your record is kept. It lives on this device only and is worth nothing",
                ),
              kept.best > 0 &&
                fact(kept.best, "best streak", "The longest run of calls you got right"),
            ),

          React.createElement(
            AlertPrimaryButton,
            {
              onClick: () => this.props.onPredictChange(true),
            },
            "Turn calls on",
          ),
        ),
      );
    }

    const open = (Array.isArray(calls) ? calls : [])
      .slice()
      .sort((a, b) => a.target - b.target);
    const done = Array.isArray(settledCalls) ? settledCalls : [];
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

      record.total > 0 &&
        React.createElement(
          AlertRecordBar,
          null,
          React.createElement(
            "span",
            null,
            React.createElement(
              AlertRecordFigure,
              null,
              `${Math.round((record.hits / record.total) * 100)}%`,
            ),
            ` of ${record.total} settled`,
          ),
          React.createElement(
            "span",
            null,
            `streak ${record.streak} · best ${record.best}`,
          ),
        ),

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
      open.length === 0 && done.length === 0 &&
        React.createElement(
          AlertsEmpty,
          null,
          React.createElement(
            AlertsEmptyMark,
            { "aria-hidden": "true" },
            icon("calls", 1.3),
          ),
          React.createElement(AlertsEmptyTitle, null, "No calls yet"),
          React.createElement(
            AlertsEmptyText,
            null,
            "Point at a square to the right of the dotted line and click it twice — once to draft it, once to lock it in. You have said the price will be in that band, at that time.",
          ),
          React.createElement(
            AlertsEmptyText,
            null,
            "Drag the dotted line itself to make the board bigger or smaller.",
          ),
        ),

      open.length > 0 &&
        React.createElement(
          Fragment,
          null,
          React.createElement(AlertsSectionLabel, null, `Open · ${open.length}`),
          React.createElement(
            AlertsList,
            null,
            open.map((c) => {
              const d = this.callDistance(c);
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
                      ? "Due — settles next time this range loads"
                      : `Settles ${describeAhead(c.target - Date.now())}`,
                    d &&
                      (d.inside
                        ? " · in the band now"
                        : ` · needs ${formatSignedPercent(d.percent)}`),
                    /* The price when the call was made. Stored since the
                     * beginning and never shown — it is what turns a band
                     * into a decision you can look back on. */
                    c.placedPrice != null
                      ? ` · called at ${money(c.placedPrice, c)}`
                      : "",
                    /* A call belongs to the range it was made on — that is
                     * what keeps it from being settled against a series that
                     * does not reach back to its target. So a call made on a
                     * different range is not on the chart in front of you,
                     * and the row has to say which one, or it looks lost. */
                    c.period !== this.props.period
                      ? ` · on ${periodLabel(c.period)}`
                      : "",
                    /* Same for the currency, and it matters more: settling
                     * only ever runs in the currency a call was made in, so
                     * this row is not merely elsewhere, it is stopped. */
                    c.currency !== currency
                      ? ` · paused — set in ${c.currency}`
                      : "",
                  ),
                ),
                React.createElement(
                  AlertRemove,
                  {
                    onClick: () => onWithdrawCall && onWithdrawCall(c.id),
                    "aria-label": "Withdraw this call",
                    title: "Withdraw",
                  },
                  "×",
                ),
              );
            }),
          ),
        ),

      done.length > 0 &&
        React.createElement(
          Fragment,
          null,
          React.createElement(AlertsSectionLabel, null, `Settled · ${done.length}`),
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
                      ? `Called at ${money(c.placedPrice, c)}`
                      : "Called",
                    c.settledPrice != null
                      ? ` · closed at ${money(c.settledPrice, c)}`
                      : "",
                    by != null && by > 0 ? ` · missed by ${money(by, c)}` : "",
                  ),
                ),
                React.createElement(
                  AlertVerdict,
                  { hit },
                  hit ? "Called it" : "Missed",
                ),
              );
            }),
          ),
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
  renderCallsFoot() {
    const {
      onPredictChange,
      callsShowSettled,
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
        { on, onClick, title, "aria-pressed": Boolean(on), "aria-label": title || label },
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
    const zoomNow = BOARD_ZOOM_STEPS.indexOf(boardZoom) === -1
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
          title: "Zoom in: a tighter band, a shorter reach  ( ] )",
          "aria-label": "Zoom the board in",
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
              title: "Back to the default board reach",
              "aria-label": "Back to the default board reach",
            },
            `×${zoomNow}`,
          ),
      React.createElement(
        AlertStepperBtn,
        {
          onClick: () => onBoardZoomChange && onBoardZoomChange(zoomBy(1)),
          disabled: zoomNow >= BOARD_ZOOM_MAX,
          title: "Zoom out: a wider band, far enough to call a big move  ( [ )",
          "aria-label": "Zoom the board out",
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
            { title: "Drag the now line on the chart to resize the board" },
            "Board",
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
            `${describeSpan(callGeometry.reachMs)} ahead${
              callGeometry.covers
                ? ` · ±${formatAxisPrice(
                    callGeometry.covers,
                    callGeometry.step,
                    getCurrencySymbol(currency),
                  )}`
                : ""
            } · square ${formatAxisPrice(
              callGeometry.step,
              callGeometry.step,
              getCurrencySymbol(currency),
            )} × ${describeSpan(callGeometry.spanMs)}`,
          ),
          /* The strip was a readout with nothing to press, and the one thing it
           * describes that you *cannot* set by dragging the now line is how far
           * the board reaches in price. Out makes each square worth more and the
           * reach grow with it — which is the difference between being able to
           * call a crash and having no square to point at. */
          React.createElement(AlertStripGap, null),
          stepper,
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
        React.createElement(AlertStripLabel, null, "Show"),
        toggle(
          "settled",
          callsShowSettled !== false,
          () =>
            onCallsShowSettledChange &&
            onCallsShowSettledChange(callsShowSettled === false),
          "Keep settled calls on the chart, marked called it or missed",
        ),
        toggle(
          "celebrate",
          callsCelebrate !== false,
          () =>
            onCallsCelebrateChange &&
            onCallsCelebrateChange(callsCelebrate === false),
          "A burst on the chart the first time you open a tab after getting one right",
        ),
      ),

      /* The mode and the record. Turning calls off sits where the eye lands,
       * and the two things that cannot be undone at the far end, away from it. */
      React.createElement(
        AlertCallsStrip,
        null,
        React.createElement(AlertStripLabel, null, "Calls"),
        action(
          "turn off",
          () => onPredictChange && onPredictChange(false),
          "Stop calls. Your calls and score are kept, and L does the same from the chart",
          { strong: true },
        ),
        React.createElement(AlertStripGap, null),
        doneCount > 0 &&
          action(
            "clear settled",
            () => onClearSettled && onClearSettled(),
            "Remove settled calls from the chart and from this list",
          ),
        record.total > 0 &&
          action(
            "reset score",
            () => onResetCalls && onResetCalls(),
            "Set the record back to nothing. It lives on this device only and is worth nothing",
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
      React.createElement(AlertsInfoLine, { key: i }, React.createElement("span", null, text));

    if (!onCalls) {
      const paused = alerts.filter(
        (a) => !a.triggeredAt && !targetApplies(a, currency),
      ).length;
      const state = [
        `${lists.armed.length} armed · ${lists.done.length} hit · ${alerts.length} of ${MAX_ALERTS} used`,
      ];
      if (paused) {
        state.push(
          `${paused} paused — set in another currency, so ${paused === 1 ? "it resumes" : "they resume"} when you switch back to it. A move target never pauses: a percentage means the same thing everywhere.`,
        );
      }
      state.push(
        this.props.alertTabTitle !== false
          ? "A hit is announced in the tab title, and targets are checked while this tab is hidden."
          : "A hit is reported here only — announcing it in the tab title is off in Settings, which also stops the background checking.",
      );
      return React.createElement(
        AlertsInfo,
        null,
        React.createElement(
          AlertsInfoText,
          null,
          "A target is a request: tell me when. Name a price (“BTC rises above 80,000”) or a move (“BTC falls 5% in 24h”) and it is reported here the next time you open a tab — including one that happened overnight, because every target is checked against the last week of hourly candles rather than only against the price right now.",
        ),
        React.createElement(AlertsInfoState, null, ...state.map(line)),
        React.createElement(
          AlertsInfoKeys,
          null,
          key(["A"], "this panel"),
          key(["Enter"], "add"),
          key(["Esc"], "close"),
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
        ? `On · ${open} open · ${settled} settled`
        : `Off · ${open} kept and still settling in the background — what is off is the board: nothing is drawn, nothing can be placed, and a win is not announced`,
    );
    if (rec.total > 0) {
      state.push(
        `${rec.hits} of ${rec.total} called right${rec.best > 1 ? ` · best streak ${rec.best}` : ""}. The score is on this device only and is worth nothing.`,
      );
    }
    /* No board numbers here. How far it reaches and what a square is worth are
     * already on screen, in the Board strip at the foot of this tab — printing
     * them again a few inches above it makes the card look padded, and the card
     * has to be the one thing that says something new. The strip is a readout
     * with no control, so what this adds is where the control is. */
    if (on) {
      state.push(
        "A call belongs to the coin, range and currency it was made on, and only settles there. Calls stand down while two coins share the chart.",
      );
    }
    return React.createElement(
      AlertsInfo,
      null,
      React.createElement(
        AlertsInfoText,
        null,
        "A call is a claim: not “tell me when”, but “I say where”. Point at a square in the empty strip to the right of the chart and you are naming a price band and a moment — one click drafts it, a second locks it. It settles itself the next time you open a tab, against the price at that moment, and the box stays on the chart saying whether you were right. How far that strip reaches is yours to set: drag the “now” line left for more board, right for more history.",
      ),
      React.createElement(AlertsInfoState, null, ...state.map(line)),
      React.createElement(
        AlertsInfoKeys,
        null,
        key(["K"], "this panel"),
        key(["L"], "calls on / off"),
        key(["G"], "grid on the plain chart"),
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
        placeholder: "Search coins",
        "aria-label": "Target coin",
        "aria-expanded": searching,
        autoComplete: "off",
        spellCheck: false,
        onFocus: (e) => {
          this.setState({ coinQuery: "", coinAt: 0 });
          e.target.select();
        },
        onBlur: () => this.setState({ coinQuery: null, coinAt: 0 }),
        onChange: (e) => this.setState({ coinQuery: e.target.value, coinAt: 0 }),
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
                `Nothing matching \u201c${this.state.coinQuery}\u201d.`,
              ),
        ),
    );
  }

  render() {
    const { alerts, currency, onClose } = this.props;
    const atCap = alerts.length >= MAX_ALERTS;
    const isPercent = this.state.kind === "percent";
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
    const onCalls = hasCalls && this.props.view === "calls";
    const sorted = this.sortedAlerts();
    const armed = sorted.filter((a) => !a.triggeredAt);
    const done = sorted.filter((a) => a.triggeredAt);
    // A price chip needs a price to work off; a percent one is self-contained
    const callRec = this.props.callRecord || { hits: 0, total: 0 };
    const openCalls = Array.isArray(this.props.calls) ? this.props.calls.length : 0;
    const tally = onCalls
      ? this.props.predict !== true
        ? "off"
        : `${openCalls} open${callRec.total ? ` · ${Math.round((callRec.hits / callRec.total) * 100)}%` : ""}`
      : alerts.length === 0
        ? `0 / ${MAX_ALERTS}`
        : `${armed.length} armed${done.length ? ` · ${done.length} hit` : ""} · ${alerts.length}/${MAX_ALERTS}`;

    const quickUp = this.state.direction === "above";
    const quickSteps = isPercent
      ? QUICK_PERCENT_STEPS
      : this.priceOf(this.state.coin) !== null
        ? QUICK_PRICE_STEPS
        : null;
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
          AlertsHead,
          null,
          React.createElement(
            AlertsHeadTitle,
            null,
            onCalls ? "Calls" : "Targets",
          ),
          React.createElement(
            AlertsHeadRight,
            null,
            React.createElement(AlertsTally, null, tally),
            React.createElement(
              AlertsInfoBtn,
              {
                active: this.state.info,
                onClick: () => this.setState((p) => ({ info: !p.info })),
                title: onCalls
                  ? "What calls are, where they stand, and the keys"
                  : "What targets are, where they stand, and the keys",
                "aria-label": "About this panel",
                "aria-expanded": this.state.info ? "true" : "false",
              },
              icon("info", 0.95),
            ),
          ),
        ),
        this.state.info && this.renderInfo(onCalls, { armed, done }),
        React.createElement(
          AlertsBody,
          null,
              onCalls && this.renderCallsBody(),
          !onCalls &&
          alerts.length === 0 &&
            React.createElement(
              AlertsEmpty,
              null,
              React.createElement(
                AlertsEmptyMark,
                { "aria-hidden": "true" },
                icon("target", 1.3),
              ),
              React.createElement(AlertsEmptyTitle, null, "No targets yet"),
              React.createElement(
                AlertsEmptyText,
                null,
                "Watch for a price (“BTC rises above 80,000”) or for a move (“BTC falls 5% in 24h”). PriceTab tells you when it happens — the next time you open a tab, even if it happened overnight.",
              ),
            ),
          !onCalls &&
            armed.length > 0 &&
            React.createElement(
              AlertsList,
              null,
              armed.map((a) => this.renderRow(a)),
            ),
          !onCalls &&
            done.length > 0 &&
            React.createElement(
              Fragment,
              null,
              React.createElement(AlertsSectionLabel, null, "Already hit"),
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
                `Removed the ${this.state.undo.coin} target`,
              ),
              React.createElement(
                AlertUndoButton,
                { onClick: () => this.handleUndo() },
                "Undo",
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
          React.createElement(AlertsSectionLabelTight, null, "New target"),
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
              "A price",
            ),
            React.createElement(
              AlertKindButton,
              {
                active: isPercent,
                onClick: () => this.setState({ kind: "percent", target: "" }),
              },
              "A move in 24h",
            ),
          ),
          React.createElement(
            AlertForm,
            null,
            /* Any supported coin, not only the ones on your chart. Wanting to
             * be told when something moves is exactly how a coin earns a
             * place on the list — requiring it to be there first had the
             * dependency backwards. Your own coins stay on top. */
            this.renderCoinPicker(),
            React.createElement(
              AlertSelect,
              {
                value: this.state.direction,
                "aria-label": "Target direction",
                onChange: (e) => this.setState({ direction: e.target.value }),
              },
              React.createElement(
                "option",
                { value: "above" },
                isPercent ? "rises" : "rises above",
              ),
              React.createElement(
                "option",
                { value: "below" },
                isPercent ? "falls" : "drops below",
              ),
            ),
            React.createElement(AlertInput, {
              type: "text",
              inputMode: "decimal",
              innerRef: this.setInputRef,
              value: this.state.target,
              placeholder: isPercent ? "% in 24h" : `target in ${currency}`,
              "aria-label": isPercent
                ? "Target move in percent"
                : "Target price",
              onChange: (e) => this.setState({ target: e.target.value }),
              onKeyDown: this.handleKeyDown,
            }),
            React.createElement(
              AlertAdd,
              { onClick: this.handleAdd, disabled: atCap },
              "Add",
            ),
          ),
          quickSteps &&
            React.createElement(
              AlertQuickRow,
              null,
              React.createElement(
                AlertQuickLabel,
                null,
                isPercent ? "Common" : quickUp ? "Above by" : "Below by",
              ),
              quickSteps.map((step) =>
                React.createElement(
                  AlertQuickChip,
                  {
                    key: step,
                    up: quickUp,
                    title: isPercent
                      ? `A ${step}% move`
                      : `${step}% ${quickUp ? "above" : "below"} the current price`,
                    onClick: () => this.applyQuick(step),
                  },
                  `${quickUp ? "+" : "−"}${step}%`,
                ),
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
              ? `Target limit reached (${MAX_ALERTS}). Remove one to add another.`
              : "Checked when you open a tab, including targets hit while you were away — the last week of candles is searched, so a move that reverted overnight is still reported. Nothing is pushed and nothing leaves your device.",
          ),
        ),
      ),
    );
  }
}

AlertsPanel.defaultProps = {
  view: "targets", // "targets" | "calls" — which of the two the caller opened
  alerts: [],
  coinOptions: [],
  activeCoin: "BTC",
  currency: "USD",
  stats: null, // { COIN: { price, change, marketCap } } in the displayed currency
};
