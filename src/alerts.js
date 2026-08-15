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
      // Which list is on screen. Targets first: it is what the panel has
      // always been, and what the "A" key has always opened.
      tab: "targets",
    };
    this.handleAdd = this.handleAdd.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
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
      return React.createElement(
        Fragment,
        null,
        React.createElement(
          AlertsEmpty,
          null,
          React.createElement(
            AlertsEmptyMark,
            { "aria-hidden": "true" },
            icon("target", 1.3),
          ),
          React.createElement(AlertsEmptyTitle, null, "Calls are off"),
          React.createElement(
            AlertsEmptyText,
            null,
            "Point at a square of empty future on the chart and you have said the price will be in that band, at that time. It settles itself the next time you open a tab. Nothing is announced, nothing is sent, and the score is worth nothing — it is a record of how well you read a chart.",
          ),
          React.createElement(
            AlertPrimaryButton,
            {
              onClick: () => this.props.onPredictChange(true),
            },
            "Turn calls on",
          ),
          /* Stored calls do not disappear when the feature is switched off,
           * and settling is paused with it — saying so is the difference
           * between "off" and "gone". */
          paused > 0 &&
            React.createElement(
              AlertsEmptyText,
              null,
              `${paused} call${paused === 1 ? "" : "s"} ${paused === 1 ? "is" : "are"} paused, not lost. Turning calls back on picks them up where they were.`,
            ),
        ),
        this.renderCallsControls(),
      );
    }

    const open = (Array.isArray(calls) ? calls : [])
      .slice()
      .sort((a, b) => a.target - b.target);
    const done = Array.isArray(settledCalls) ? settledCalls : [];
    const record = callRecord || { hits: 0, total: 0, streak: 0, best: 0 };
    const symbol = getCurrencySymbol(currency);
    const money = (v) => formatNumberString(v, symbol, true, false);
    const band = (c) => `${money(c.lo)} – ${money(c.hi)}`;

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

      open.length === 0 && done.length === 0 &&
        React.createElement(
          AlertsNote,
          null,
          "No calls yet. With the chart grid on, click any square to the right of the dotted line.",
        ),

      open.length > 0 &&
        React.createElement(
          Fragment,
          null,
          React.createElement(AlertsSectionLabel, null, "Open"),
          React.createElement(
            AlertsList,
            null,
            open.map((c) => {
              const d = this.callDistance(c);
              return React.createElement(
                AlertRow,
                { key: c.id, up: true },
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
                    `Settles ${describeAhead(c.target - Date.now())}`,
                    d &&
                      (d.inside
                        ? " · in the band now"
                        : ` · needs ${formatSignedPercent(d.percent)}`),
                    /* The price when the call was made. Stored since the
                     * beginning and never shown — it is what turns a band
                     * into a decision you can look back on. */
                    c.placedPrice != null
                      ? ` · called at ${money(c.placedPrice)}`
                      : "",
                    /* A call belongs to the range it was made on — that is
                     * what keeps it from being settled against a series that
                     * does not reach back to its target. So a call made on a
                     * different range is not on the chart in front of you,
                     * and the row has to say which one, or it looks lost. */
                    c.period !== this.props.period
                      ? ` · on ${periodLabel(c.period)}`
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
          React.createElement(AlertsSectionLabel, null, "Settled"),
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
                      ? `Called at ${money(c.placedPrice)}`
                      : "Called",
                    c.settledPrice != null
                      ? ` · closed at ${money(c.settledPrice)}`
                      : "",
                    by != null && by > 0 ? ` · missed by ${money(by)}` : "",
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

      this.renderCallsControls(),
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
  renderCallsControls() {
    const {
      predict,
      onPredictChange,
      predictAhead,
      onPredictAheadChange,
      callsShowSettled,
      onCallsShowSettledChange,
      callsCelebrate,
      onCallsCelebrateChange,
      onResetCalls,
      onClearSettled,
      callRecord,
      settledCalls,
      chartGrid,
      onChartGridChange,
    } = this.props;
    const record = callRecord || { total: 0 };
    const doneCount = Array.isArray(settledCalls) ? settledCalls.length : 0;

    const row = (name, hint, control) =>
      React.createElement(
        AlertSettingRow,
        null,
        React.createElement(
          AlertSettingText,
          null,
          React.createElement(AlertSettingName, null, name),
          hint && React.createElement(AlertSettingHint, null, hint),
        ),
        control,
      );

    const chip = (label, active, onClick, aria) =>
      React.createElement(
        AlertPlainChip,
        { active, onClick, "aria-label": aria || label },
        label,
      );

    return React.createElement(
      AlertCallSettings,
      null,
      /* Off is as reachable as on.
       *
       * Turning calls on was a button across the empty screen; turning them
       * off was a chip the width of the word. A switch whose two directions
       * look nothing alike reads as one you are meant to use once — and this
       * one sits on a chart people read for prices, so leaving has to be as
       * plain as arriving. Shown only while on: the off screen already has
       * the other half of the pair. */
      predict === true &&
        React.createElement(
          Fragment,
          null,
          React.createElement(
            AlertPrimaryButton,
            {
              ghost: true,
              block: true,
              onClick: () => onPredictChange && onPredictChange(false),
            },
            "Turn calls off",
          ),
          React.createElement(
            AlertSettingHint,
            { style: { marginTop: "0.4rem", marginBottom: "0.2rem" } },
            "L does the same from the chart, and brings the grid with it. Your calls and score are kept either way.",
          ),
        ),

      predict === true &&
        chartGrid !== true &&
        row(
          "Chart grid",
          "The squares are the grid's — with it off you cannot see what you are pointing at",
          chip("Turn on", false, () => onChartGridChange && onChartGridChange(true)),
        ),

      predict === true &&
        React.createElement(
          Fragment,
          null,
          React.createElement(
            AlertSettingRow,
            null,
            React.createElement(
              AlertSettingText,
              null,
              React.createElement(AlertSettingName, null, "Squares of future"),
              React.createElement(
                AlertSettingHint,
                null,
                "Each one is a separate call. More squares generally reach further, until the strip runs out of room and they start getting smaller instead — the line below is what this choice actually gives you",
              ),
              React.createElement(
                AlertChipRow,
                null,
                PREDICT_AHEAD_OPTIONS.map((n) =>
                  React.createElement(
                    AlertPlainChip,
                    {
                      key: n,
                      active: (predictAhead || DEFAULT_PREDICT_AHEAD) === n,
                      onClick: () =>
                        onPredictAheadChange && onPredictAheadChange(n),
                      "aria-label": `${n} squares of future`,
                    },
                    String(n),
                  ),
                ),
              ),
              /* What the number buys, in the two units it decides. A count on
               * its own is not a quantity anyone can picture; this is the
               * chart's own geometry, reported back rather than guessed. */
              this.props.callGeometry &&
                React.createElement(
                  AlertGeometryLine,
                  null,
                  React.createElement(
                    AlertGeometryFigure,
                    null,
                    describeSpan(this.props.callGeometry.reachMs),
                  ),
                  " of future to call in · each square is ",
                  React.createElement(
                    AlertGeometryFigure,
                    null,
                    formatAxisPrice(
                      this.props.callGeometry.step,
                      this.props.callGeometry.step,
                      getCurrencySymbol(this.props.currency),
                    ),
                  ),
                  " tall and ",
                  React.createElement(
                    AlertGeometryFigure,
                    null,
                    describeSpan(this.props.callGeometry.spanMs),
                  ),
                  " wide",
                ),
            ),
          ),

          row(
            "Keep settled calls on the chart",
            "The box you drew stays where it was, marked called it or missed",
            chip(
              callsShowSettled === false ? "Off" : "On",
              callsShowSettled !== false,
              () =>
                onCallsShowSettledChange &&
                onCallsShowSettledChange(callsShowSettled === false),
              "Toggle settled calls on the chart",
            ),
          ),

          row(
            "Celebrate a hit",
            "A burst on the chart the first time you open a tab after getting one right",
            chip(
              callsCelebrate === false ? "Off" : "On",
              callsCelebrate !== false,
              () =>
                onCallsCelebrateChange &&
                onCallsCelebrateChange(callsCelebrate === false),
              "Toggle the celebration",
            ),
          ),

          (record.total > 0 || doneCount > 0) &&
            row(
              "History",
              "The score lives on this device only, is worth nothing and is never sent anywhere",
              React.createElement(
                AlertChipRow,
                null,
                doneCount > 0 &&
                  chip("Clear settled", false, () => onClearSettled && onClearSettled()),
                record.total > 0 &&
                  chip("Reset score", false, () => onResetCalls && onResetCalls()),
              ),
            ),
        ),
    );
  }

  render() {
    const { alerts, currency, coinOptions, onClose } = this.props;
    const atCap = alerts.length >= MAX_ALERTS;
    const isPercent = this.state.kind === "percent";
    const hint = this.hint();
    // Already-hit targets are history: they get their own section under the
    // live ones instead of trailing the same list, so a full panel still
    // opens on what is about to happen
    /* The calls tab only exists when the app wired the feature up; the panel
     * is still the targets panel first. */
    const hasCallsTab = typeof this.props.onPredictChange === "function";
    const onCalls = hasCallsTab && this.state.tab === "calls";
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
            AlertsTabs,
            null,
            React.createElement(
              AlertsTab,
              {
                active: onCalls === false,
                onClick: () => this.setState({ tab: "targets" }),
              },
              "Targets",
            ),
            hasCallsTab &&
              React.createElement(
                AlertsTab,
                {
                  active: onCalls,
                  onClick: () => this.setState({ tab: "calls" }),
                },
                "Calls",
              ),
          ),
          React.createElement(AlertsTally, null, tally),
        ),
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
            React.createElement(
              AlertSelect,
              {
                value: this.state.coin,
                "aria-label": "Target coin",
                onChange: (e) => this.setState({ coin: e.target.value }),
              },
              React.createElement(
                "optgroup",
                { label: "Your coins" },
                coinOptions.map((c) =>
                  React.createElement("option", { key: c, value: c }, c),
                ),
              ),
              React.createElement(
                "optgroup",
                { label: "All coins" },
                SUGGESTED_COINS.filter((c) => !coinOptions.includes(c)).map(
                  (c) => React.createElement("option", { key: c, value: c }, c),
                ),
              ),
            ),
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
  alerts: [],
  coinOptions: [],
  activeCoin: "BTC",
  currency: "USD",
  stats: null, // { COIN: { price, change, marketCap } } in the displayed currency
};
