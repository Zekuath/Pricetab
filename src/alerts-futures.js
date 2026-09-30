/* THE DERIVATIVES MARKET — cut out of `alerts.js`
 *
 * 4,750 lines and 35 of the panel's 69 members, moved on 13 Sep 2026 out of a
 * 7,131-line class. The seam was measured before anything was touched, and the
 * measurement is the reason the cut is *this* one:
 *
 *   - The obvious cut — the single 3,980-line run from `refusalText` through
 *     the account controls — reaches out to **18** members that would stay
 *     behind. That is not a seam, it is a tear.
 *   - The whole feature, gathered from its six runs, reaches out to **four**
 *     (`numberField`, `numberWarning`, `priceOf`, `renderAlarmRow`) and is
 *     reached into at **four** (`landPracticeDeposit` from the unmount and the
 *     deposit timer, `loadFunding`, `renderFuturesBody`, `renderFuturesInfo`
 *     from the render and the info card). Eight edges for 4,750 lines.
 *
 * Three helpers came with it because nothing else uses them: `scaled`,
 * `rememberTicket`, `ticketLeverage` and `leverageField` had zero call sites
 * outside this feature. `numberField` and `numberWarning` did not — the
 * add-target form types numbers too — so they stayed.
 *
 * **The pattern is the one every cut here has used** (`app-portfolio.js`,
 * `app-calls.js`, `settings-preferences.js`): a plain function handed the
 * component, with **no `this` in the file at all**. `panel` is the
 * `AlertsPanel` instance; the constructor does
 * `Object.assign(this, alertsFutures(this))`, so every name below lands back
 * on the component exactly where it was and every caller is unchanged.
 * Nothing was renamed and nothing reordered — the blocks moved whole, and the
 * only edit inside them was `this.` → `panel.` and the class-method syntax
 * becoming an arrow property.
 *
 * Loads before `alerts.js` in `index.html`.
 */
const PRACTICE_MONEY_DONE_MS = 2400;

const alertsFutures = (panel) => ({
  /* A completed transfer stays in the control long enough to be read, then
     yields back to the next action. Before this receipt existed the bar
     disappeared into the new balance, so a finished wait had no ending. */
  finishPracticeMoney: (kind, amount) => {
    clearTimeout(panel._fundDoneT);
    panel.setState({ pMoneyDone: { kind, amount } });
    panel._fundDoneT = setTimeout(() => {
      if (!panel._gone) panel.setState({ pMoneyDone: null });
    }, PRACTICE_MONEY_DONE_MS);
  },

  /* Commits whatever is pending, once. Guarded on the amount rather than on
     the timer, so the unmount path and the timer cannot both land it. */
  landPracticeDeposit: () => {
    const amount = panel.state.pFundAmt;
    if (!amount || !panel.props.onPracticeDeposit) return;
    const why = panel.props.onPracticeDeposit(amount, panel.props.activeCoin);
    if (panel._gone) return;
    panel.setState({ pFundAmt: null, pFundWhy: why || null });
    if (!why) panel.finishPracticeMoney("deposit", amount);
  },

  /* **The refusal comes from the model, before the wait starts.**
   * Four seconds of bar followed by "no" would be the worst of both — so the
   * amount is checked against the account here, and the timer only runs on a
   * deposit that is going to land. What can still change underneath it is the
   * account ending mid-wait, which `practiceDeposit` refuses on arrival and
   * the panel then says. */
  startPracticeDeposit: (practice, amount) => {
    if (panel.state.pFundAmt || panel.state.pWithdrawAmt) return;
    const inverse = practiceIsCoinSettled(practice);
    const ceiling = inverse ? PRACTICE_MAX_WALLET_E8 : PRACTICE_MAX_ACCOUNT_E2;
    let why = null;
    if (practice.ended) why = "ended";
    else if (!practiceDepositOk(practice, amount)) why = "size";
    else if (practiceAccountSize(practice, panel.props.activeCoin) + amount > ceiling) {
      why = "full";
    }
    if (why) {
      panel.setState({ pFundWhy: why });
      return;
    }
    panel.setState({
      pFund: undefined,
      pFundAmt: amount,
      pFundWhy: null,
      pMoneyDone: null,
      pReset: null,
    });
    clearTimeout(panel._fundT);
    panel._fundT = setTimeout(() => {
      if (panel._gone) return;
      panel.landPracticeDeposit();
    }, PRACTICE_DEPOSIT_MS);
  },

  cancelPracticeTransfer: () => {
    clearTimeout(panel._fundT);
    /* A cancelled withdrawal disarms too: the next press asks again rather
       than running on a confirmation given before the change of mind. */
    panel.setState({
      pFundAmt: null,
      pFundWhy: null,
      pWithdrawAmt: null,
      pWithdrawWhy: null,
      pMoneyDone: null,
      pReset: null,
    });
  },

  /* A preset chooses an amount; it is not a hidden submit button. The chips
     used to start the four-second deposit immediately, so comparing three
     round figures also moved money. Every path now ends at the same explicit
     Add funds button. */
  /* **A preset adds to the amount, it does not replace it.** Asked for as
     "bir ekleme mantığıyla olmalı": +1,000 pressed twice is 2,000 in the
     field, on top of whatever was typed. The field stays the one place the
     figure lives; the button underneath is still the only thing that
     commits it. */
  choosePracticeDeposit: (practice, amount) => {
    if (panel.state.pFundAmt || panel.state.pWithdrawAmt) return;
    const inverse = practiceIsCoinSettled(practice);
    const scale = inverse ? COIN_SCALE : MONEY_SCALE;
    const sameUnit = (panel.state.pFundUnit || "cash") === (inverse ? panel.props.activeCoin : "cash");
    const typed = sameUnit ? Number(panel.state.pFund) : 0;
    const base = isFinite(typed) && typed > 0 ? Math.round(typed * scale) : 0;
    panel.setState({
      pFund: String((base + amount) / scale),
      pFundUnit: inverse ? panel.props.activeCoin : "cash",
      pFundWhy: null,
      pMoneyDone: null,
      pReset: null,
    });
  },

  /* **Withdraw means zero, not "start over".**
   *
   * The old destructive action threw away the account and then put its
   * opening balance straight back, which is the opposite of what a money
   * control called Withdraw promises. This movement keeps the record and the
   * rules, uses the model's signed balance event, and is available only when
   * no contract is running so "zero" means the whole free account rather
   * than everything except committed margin. */
  startPracticeWithdrawal: (practice) => {
    if (panel.state.pFundAmt || panel.state.pWithdrawAmt) return;
    const live = Object.keys(practice.positions || {}).length;
    const amount = practiceFreeBalance(practice, panel.props.activeCoin);
    let why = null;
    if (live) why = "open";
    else if (!(amount > 0)) why = "empty";
    else {
      const probe = practiceSetBalance(practice, 0, panel.props.activeCoin);
      if (probe.error) why = probe.error;
    }
    if (why) {
      panel.setState({ pWithdrawWhy: why });
      return;
    }
    panel.setState({
      pReset: "withdraw",
      pWithdrawAmt: amount,
      pWithdrawWhy: null,
      pMoneyDone: null,
    });
    clearTimeout(panel._fundT);
    panel._fundT = setTimeout(() => {
      if (!panel._gone) panel.landPracticeWithdrawal();
    }, PRACTICE_DEPOSIT_MS);
  },

  landPracticeWithdrawal: () => {
    const amount = panel.state.pWithdrawAmt;
    if (!amount || !panel.props.onPracticeSetBalance) return;
    const why = panel.props.onPracticeSetBalance(0, panel.props.activeCoin);
    if (panel._gone) return;
    /* The confirm section stays open on success so the button can say
       "Sent" over its finished bar — folding it away on the same tick as
       the money left made the press look like it had vanished. */
    panel.setState({ pReset: why ? null : "withdraw", pWithdrawAmt: null, pWithdrawWhy: why || null });
    if (!why) panel.finishPracticeMoney("withdraw", amount);
  },

  /* **What the amount can be typed in.**
   *
   * The account's own unit first — the money a linear account settles in, the
   * contract coin an inverse wallet holds — and then the units somebody
   * actually has money in. "Add 0.5 BTC" is how a deposit is thought about by
   * anyone who has ever moved coin onto a venue, and the account is imaginary
   * either way, so refusing to accept it is arbitrary.
   *
   * The list is **only what can be priced right now**, from the ticker
   * snapshot the panel already holds (`priceOf`) — so it costs no request and
   * a coin whose price has not arrived is simply not offered rather than
   * offered and then refused. The coin on the chart comes first among them,
   * because that is the one already on screen; BTC and ETH follow because
   * they are the two anything else is usually held in.
   *
   * An inverse wallet is offered its own coin and the display currency and
   * nothing else. Funding a BTC wallet by way of an ETH price would be a
   * cross rate through two ticker quotes, and this account keeps its coins
   * apart on purpose. */
  fundUnits: (practice) => {
    const inverse = practiceIsCoinSettled(practice);
    const symbol = panel.posUnit();
    const active = panel.props.activeCoin;
    if (inverse) {
      const out = [{ id: active, label: active }];
      if (panel.priceOf(active)) out.push({ id: "cash", label: symbol });
      return out;
    }
    const out = [{ id: "cash", label: symbol }];
    for (const coin of [active, "BTC", "ETH"]) {
      if (!coin || out.some((u) => u.id === coin)) continue;
      if (panel.priceOf(coin)) out.push({ id: coin, label: coin });
    }
    return out;
  },

  /* The unit in force. `pFundUnit` is null until somebody presses one, and it
     is checked against the current list rather than trusted: the offered
     units change with the chart's coin and with the settlement, and a stale
     one would convert at a price the panel is no longer showing. */
  fundUnit: (practice) => {
    const units = panel.fundUnits(practice);
    const want = panel.state.pFundUnit;
    return units.some((u) => u.id === want) ? want : units[0].id;
  },

  /* **One conversion, called once.**
   *
   * `practiceCloseSize` exists because the panel quoted a close and the model
   * committed a different one — two implementations of the same arithmetic.
   * The same trap is here: the line under the field says what a typed 0.5 BTC
   * is worth, and the button has to add exactly that. So this is the only
   * place the rate is applied; the preview reads it and the press reads it,
   * and `startPracticeDeposit` is handed the number rather than the words.
   *
   * **The rate is the one at the press, not at the landing.** The amount is
   * fixed into `pFundAmt` when the button is pressed, so the four seconds
   * cannot move it — the figure you were shown is the figure that lands.
   *
   * Returns `{ amount, from }`: the amount in the account's own unit, and —
   * when a conversion happened — what it was converted from, so the panel can
   * print it without doing the arithmetic a second time. */
  fundQuote: (practice) => {
    const typed = Number(panel.state.pFund);
    if (!isFinite(typed) || typed <= 0) return null;
    const inverse = practiceIsCoinSettled(practice);
    const unit = panel.fundUnit(practice);
    const own = inverse ? panel.props.activeCoin : "cash";
    const lo = inverse ? PRACTICE_MIN_DEPOSIT_E8 : PRACTICE_MIN_DEPOSIT_E2;
    const hi = inverse ? PRACTICE_MAX_WALLET_E8 : PRACTICE_MAX_ACCOUNT_E2;
    const clamp = (v) => Math.min(hi, Math.max(lo, v));
    if (unit === own) return { amount: clamp(Math.round(typed * (inverse ? COIN_SCALE : MONEY_SCALE))) };
    /* The priced coin: the typed coin on a linear account, the wallet's own
       coin when cash is being converted into an inverse wallet. */
    const coin = inverse ? panel.props.activeCoin : unit;
    const price = panel.priceOf(coin);
    if (!price) return null;
    const priceE4 = Math.round(price * PRICE_SCALE);
    if (priceE4 < 1) return null;
    const from = { coin, price: priceE4, unit };
    if (inverse) {
      /* Cash into a coin wallet. */
      /* Bounded against *this price* as well as against the money's own
         ceiling: the conversion throws rather than saturating, and at a
         sub-cent coin the account ceiling alone is not enough — see
         `practiceMoneyCeiling`. Clamped, not refused, which is what every
         money box on this screen does. */
      const money = Math.min(
        panel.scaled(typed, MONEY_SCALE, MAX_MONEY_E2),
        practiceMoneyCeiling(priceE4),
      );
      if (money <= 0) return null;
      from.typed = money;
      return { amount: clamp(practiceCoinForMoney(money, priceE4, ROUND_DOWN)), from };
    }
    const coinE8 = Math.min(
      panel.scaled(typed, COIN_SCALE, PRACTICE_MAX_COIN_E8),
      practiceCoinCeiling(priceE4),
    );
    if (coinE8 <= 0) return null;
    from.typed = coinE8;
    return { amount: clamp(practiceMoneyForCoin(coinE8, priceE4, ROUND_DOWN)), from };
  },

  /* The amount in the field, as scaled integers, or null. Clamped rather
     than refused, like every other money box on this screen. */
  typedDeposit: (practice) => {
    const quote = panel.fundQuote(practice);
    return quote ? quote.amount : null;
  },

  /* Switching the unit **converts what is already typed** rather than
     clearing it, the rule the close ticket's own toggle follows: the number
     in the box is a quantity of money somebody meant, not a string that
     happens to be there, and clearing it makes the toggle something you have
     to type around. */
  setFundUnit: (practice, next) => {
    const unit = panel.fundUnit(practice);
    if (next === unit) return;
    const quote = panel.fundQuote(practice);
    if (!quote) {
      panel.setState({ pFundUnit: next, pFundWhy: null });
      return;
    }
    const inverse = practiceIsCoinSettled(practice);
    const own = inverse ? panel.props.activeCoin : "cash";
    const coin = inverse ? panel.props.activeCoin : next === own ? unit : next;
    const price = panel.priceOf(coin);
    const priceE4 = price ? Math.round(price * PRICE_SCALE) : 0;
    let text = "";
    if (next === own) {
      text = inverse
        ? String(quote.amount / COIN_SCALE)
        : String(quote.amount / MONEY_SCALE);
    } else if (priceE4 >= 1) {
      /* The same two bounds on the way back out: this converts an amount that
         was clamped against the *account*, which says nothing about what this
         price can carry. */
      text = inverse
        ? String(
            practiceMoneyForCoin(
              Math.min(quote.amount, practiceCoinCeiling(priceE4)),
              priceE4,
              ROUND_DOWN,
            ) / MONEY_SCALE,
          )
        : String(
            practiceCoinForMoney(
              Math.min(quote.amount, practiceMoneyCeiling(priceE4)),
              priceE4,
              ROUND_DOWN,
            ) / COIN_SCALE,
          );
    }
    panel.setState({ pFundUnit: next, pFund: text, pFundWhy: null });
  },

  /* Which unit a contract's size is read in. Validated rather than trusted,
     the rule every stored enum here follows. */
  practiceUnits: () => {
    return panel.props.practiceUnits === PRACTICE_UNITS_CASH
      ? PRACTICE_UNITS_CASH
      : PRACTICE_UNITS_COIN;
  },

  /* **A typed number, scaled and clamped to the model's own range.**
   *
   * Every box on this panel takes free text and multiplies it by a scale
   * before handing it to the model — and `999999999` in a coin box scales to
   * 1e17, past `Number.MAX_SAFE_INTEGER`, where `practiceMoneyForCoin` throws
   * out of a render and the error boundary eats the panel. Found by
   * `scripts/audit-futures.js`; there were four copies of the same three
   * lines, so this is one.
   *
   * Nothing is lost by clamping. Every consumer already clamps again to what
   * is actually possible — a close to the position, a deposit to the account
   * ceiling — so a number larger than the model can hold means "as much as it
   * goes" either way, which is what a person typing nines means. */
  scaled: (value, scale, hi) => {
    const n = Number(value);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.min(hi, Math.max(0, Math.round(n * scale)));
  },

  /* **The two words in this panel everybody thinks they know.**
   *
   * Leverage and margin are where the misunderstandings that cost money live,
   * and a paragraph of general prose is not what fixes them — the rule this
   * panel's own info card already follows is that help written in advance goes
   * stale, so it says where things stand *right now*, read off the same
   * figures the screen is drawing. These do the same: every sentence names a
   * number from the ticket in front of you.
   *
   * A card under the control rather than a popover over it, for the reason
   * `renderInfo` gives: a popover covers the thing it is describing. */
  renderPracticeWhat: (kind, ctx) => {
    /* **Whole sentences with placeholders, never fragments.** The first draft
       built each line out of four `msg()` pieces with the figures between
       them — which reads correctly in English and cannot be translated at all,
       because no other language is obliged to put the number in the same
       place. One message per idea, and the figures go in as `$1`. */
    const row = (label, text) =>
      React.createElement(
        AlertPosExplainRow,
        { key: label },
        React.createElement("strong", null, label),
        React.createElement("span", null, text),
      );

    if (kind === "leverage") {
      return React.createElement(
        AlertPosExplain,
        { "data-practice-what": "leverage" },
        row(
          msg("what_lev_is", "What it is"),
          msg(
            "what_lev_is_v",
            "How large a contract your margin carries. At $1, $2 of your balance carries a $3 contract.",
            `${ctx.leverage}x`,
            ctx.marginText,
            ctx.notionalText,
          ),
        ),
        row(
          msg("what_lev_room", "The room it leaves"),
          msg(
            "what_lev_room_v",
            "This is what it really decides. The price has about $1 to move against you before the contract is closed for you. Half the leverage is roughly twice the room.",
            ctx.awayText,
          ),
        ),
        row(
          msg("what_lev_cost", "What it costs"),
          msg(
            "what_lev_cost_v",
            "The fee is 0.05% of the contract, not of your margin — so the same money committed at 40x pays forty times the fee it pays at 1x, once going in and again coming out. It is the quietest way a run of small wins turns into a loss.",
          ),
        ),
        row(
          msg("what_lev_not", "What it is not"),
          msg(
            "what_lev_not_v",
            "It changes nothing about the coin. It multiplies your result in both directions equally — nothing here makes a rise more likely than a fall.",
          ),
        ),
      );
    }

    if (kind === "cover") {
      return React.createElement(
        AlertPosExplain,
        { "data-practice-what": "cover" },
        row(
          msg("what_cov_is", "What it is"),
          msg(
            "what_cov_is_v",
            "How many times over this contract still covers what it must keep. It is $1 now, and the contract is closed at 1x — so it is a distance, counted in the only unit that means the same thing at every leverage.",
            ctx.coverText,
          ),
        ),
        row(
          msg("what_cov_not", "What it is not"),
          msg(
            "what_cov_not_v",
            "Not a percentage, and not the venue's own margin ratio, which counts the other way up and calls 100% the end. And not a distance in price: 5% away is comfortable at 2x and already gone at 100x, which is exactly why this is not shown in price.",
          ),
        ),
        row(
          msg("what_cov_now", "Where it starts"),
          msg(
            "what_cov_now_v",
            "A fresh contract opens near 90x at 2x leverage and near 2.2x at 100x, because that is how near the edge those two really are. This screen says so at $1 and says so louder at $2.",
            ctx.warnText,
            ctx.dangerText,
          ),
        ),
      );
    }

    return React.createElement(
      AlertPosExplain,
      { "data-practice-what": "margin" },
      row(
        msg("what_mar_is", "What it is"),
        msg(
          "what_mar_is_v",
          "The money taken out of your balance and placed behind this one contract — $1 here. It is isolated: this contract can lose that and nothing else, and neither your other contracts nor the rest of your balance can be reached from it.",
          ctx.marginText,
        ),
      ),
      row(
        msg("what_mar_two", "Two of them"),
        msg(
          "what_mar_two_v",
          "You put up the initial margin, which is the contract divided by the leverage. The contract is closed when what is left falls under the maintenance margin — 0.50% of the contract, a little less at high leverage. The gap between those two is all the room you have.",
        ),
      ),
      row(
        msg("what_mar_cost", "What comes out of it"),
        msg(
          "what_mar_cost_v",
          "The fee going in and again coming out, the adverse fill on both, and funding at each settlement. Every result you see is already net of them, which is why a contract closed at the price it opened at still comes back smaller.",
        ),
      ),
      row(
        msg("what_mar_add", "Adding to it"),
        ctx.capText
          ? msg(
              "what_mar_add_v",
              "Add margin from the position's own card. It changes nothing about the contract — not the size, not the entry, not the leverage — it moves the liquidation further away. This account commits at most $1 to any one contract, and that wall is on the Account tab.",
              ctx.capText,
            )
          : msg(
              "what_mar_add_off_v",
              "Add margin from the position's own card. It changes nothing about the contract — not the size, not the entry, not the leverage — it moves the liquidation further away. There is no wall on one contract here, so it can take all of your free balance; one can be set on the Account tab.",
            ),
      ),
    );
  },

  /* The three cost controls, as the same accordion the risk limits use: a
   * value you can scan, and the explanation one press in. */
  renderPracticeCosts: (practice, live) => {
    const st = panel.state;
    const costs = practiceCosts(practice);
    /* Two places, always: every value the product offers is a whole
       hundredth of a percent, and a third place that is always zero is a
       precision the figure does not have. */
    const pct = (ppm) => `${(ppm / 10000).toFixed(2)}%`;
    const rows = [
      [
        "feePpm",
        msg("cost_fee", "Fee on every fill"),
        pct(costs.feePpm),
        PRACTICE_COST_CHOICES.feePpm,
        (v) => pct(v),
      ],
      [
        "slipPpm",
        msg("cost_slip", "Slippage on every fill"),
        pct(costs.slipPpm),
        PRACTICE_COST_CHOICES.slipPpm,
        (v) => pct(v),
      ],
      [
        "funding",
        msg("cost_funding", "Funding every eight hours"),
        costs.funding ? msg("toggle_on", "On") : msg("toggle_off", "Off"),
        [true, false],
        (v) => (v ? msg("toggle_on", "On") : msg("toggle_off", "Off")),
      ],
    ];
    return rows.map(([key, label, value, choices, fmt]) => {
      const open = st.pCost === key;
      const held = costs[key];
      return React.createElement(
        AlertPosDrawer,
        { key, "data-practice-cost": key },
        React.createElement(
          AlertPosDrawerHead,
          {
            onClick: () => panel.setState((p) => ({ pCost: p.pCost === key ? null : key })),
            "aria-expanded": open ? "true" : "false",
          },
          React.createElement("span", null, label),
          React.createElement(
            AlertPosLevHeadRight,
            null,
            React.createElement(AlertPosStepValue, null, value),
            React.createElement(
              AlertPosDrawerChevron,
              { open, "aria-hidden": "true" },
              icon("chevron", 0.7),
            ),
          ),
        ),
        React.createElement(
          AlertPosDrawerBody,
          { open, "aria-hidden": open ? "false" : "true" },
          React.createElement(
            AlertPosChips,
            null,
            ...choices.map((v) =>
              React.createElement(
                AlertPosChip,
                {
                  key: String(v),
                  active: held === v,
                  disabled: live,
                  "aria-pressed": held === v ? "true" : "false",
                  onClick: () => {
                    if (live || !panel.props.onPracticeCosts) return;
                    panel.props.onPracticeCosts({ [key]: v });
                  },
                },
                fmt(v),
              ),
            ),
          ),
          panel.renderCostWhat(key, {
            feeText: pct(costs.feePpm),
            slipText: pct(costs.slipPpm),
          }),
          live
            ? React.createElement(
                AlertPosHint,
                null,
                msg(
                  "cost_locked",
                  "Locked while a contract is running. A contract keeps the costs it was opened under, so changing this would put a figure on screen that the running one is not being charged.",
                ),
              )
            : null,
        ),
      );
    });
  },

  /* What each cost is, what it is not, and what it does to the exercise.
   * Same three rows as the limits' cards, and for the same reason: the
   * middle one is where the misunderstanding lives. */
  renderCostWhat: (key, ctx) => {
    const row = (label, text) =>
      React.createElement(
        AlertPosExplainRow,
        { key: label },
        React.createElement("strong", null, label),
        React.createElement("span", null, text),
      );
    const is = msg("lim_is", "What it is");
    const not = msg("lim_not", "What it is not");
    const body = {
      feePpm: [
        row(is, msg(
          "cost_fee_is",
          "Charged on the way in and again on the way out, as a share of the contract — not of your margin. It is $1 here, which a venue would call the taker fee.",
          ctx.feeText,
        )),
        row(not, msg(
          "cost_fee_not",
          "Not a share of what you put up: at 40x the same money commits a contract forty times larger, so it pays forty times the fee. That is the whole reason a run of small wins can net to a loss.",
        )),
        row(msg("cost_try", "Worth trying"), msg(
          "cost_fee_try",
          "Set it to 0% for a while. What is left is whether the direction was right, with nothing else in the way — and the difference between that run and the same one at 0.05% is what the fee actually costs you.",
        )),
      ],
      slipPpm: [
        row(is, msg(
          "cost_slip_is",
          "The price moving against you as your own order fills. Every fill here is a market order, so it is charged going in and coming out: $1 of the price, in the worse direction each time.",
          ctx.slipText,
        )),
        row(not, msg(
          "cost_slip_not",
          "Not the fee, and not a penalty for being wrong. It is the spread — the reason a contract closed at exactly the price it opened at still comes back smaller, along with the fee.",
        )),
        row(msg("cost_try", "Worth trying"), msg(
          "cost_slip_try",
          "A larger figure is what a thin market feels like: the same plan, the same prices, and a worse fill at both ends.",
        )),
      ],
      funding: [
        row(is, msg(
          "cost_funding_is",
          "A perpetual has no expiry, so it is held to the spot price by a payment between the two sides every eight hours. The rate is the real one, fetched per coin when a settlement is actually due.",
        )),
        row(not, msg(
          "cost_funding_not",
          "Not a fee the app charges and not a fixed amount: it is paid by longs to shorts or the other way about, depending on the rate's sign, and on a leveraged position held overnight it is often the whole result.",
        )),
        row(msg("cost_try", "Worth trying"), msg(
          "cost_funding_try",
          "Off is for practising a direction over days without a charge landing three times a day while you are not looking. With it off nothing is charged and nothing is fetched.",
        )),
      ],
    };
    return React.createElement(
      AlertPosExplain,
      { "data-practice-cost-what": key },
      ...(body[key] || []),
    );
  },

  /* **What each plan limit is, and what it is not.**
   *
   * The four of them were four rows of chips with a line of standing under
   * each — enough for somebody who already knows what a margin cap is, and
   * nothing at all for somebody who does not. Every one of these is a rule
   * that can stop you, and a rule you can be stopped by is a rule you are owed
   * an explanation of.
   *
   * Same shape as the leverage and margin cards on the ticket, and for the
   * same reason: **what it is, what it is not, and where you stand** — in the
   * account's own figures, so it cannot go stale the way written help does.
   * The "is not" line is the one that does the work; every one of these gets
   * mistaken for a neighbouring rule. */
  renderLimitWhat: (key, ctx) => {
    const row = (label, text) =>
      React.createElement(
        AlertPosExplainRow,
        { key: label },
        React.createElement("strong", null, text ? label : ""),
        React.createElement("span", null, text || label),
      );
    const is = msg("lim_is", "What it is");
    const not = msg("lim_not", "What it is not");
    const now = msg("lim_now", "Right now");

    const body = {
      maxLeverage: [
        row(is, msg(
          "lim_lev_is",
          "The highest multiple this account will let you pick. It sets where the leverage rail ends on the order ticket.",
        )),
        row(not, msg(
          "lim_lev_not",
          "Not a leverage you have to use, and not a promise about anything: it caps the choice, it does not make one. What the number you pick actually decides is how far the price may move against you before the contract is closed for you.",
        )),
        row(now, msg("lim_lev_now", "The rail ends at $1.", ctx.levText)),
      ],
      sizeTiers: [
        row(is, msg(
          "lim_tiers_is",
          "The venue-style ladder that lowers the maximum leverage as a contract grows. Bigger positions keep more maintenance margin and therefore get less leverage.",
        )),
        row(not, msg(
          "lim_tiers_not",
          "Not a balance reserve and not the fee: it limits the contract size that may use a leverage. Turning it off is an unrestricted practice rule — real venues keep size tiers on.",
        )),
        row(now, ctx.tiersOn
          ? msg(
              "pos_tier_line",
              "Bracket $1 · up to $2 of contract · keeps $3 of it · max $4x",
              "1",
              ctx.tierTopText,
              ctx.tierMmrText,
              String(PRACTICE_RISK_TIERS[0].maxLeverage),
            )
          : msg(
              "lim_tiers_now_off",
              "Off — the account maximum, $1, applies at every size. This is not how a real venue limits large positions.",
              ctx.levText,
            )),
      ],
      marginSharePct: [
        row(is, msg(
          "lim_margin_is",
          "The most of the account that may stand behind any one contract, as a share of its size. Off by default: a venue lets one contract take all the free balance there is, and so does this account until you set a wall.",
        )),
        row(not, msg(
          "lim_margin_not",
          "Not a limit on how much of the account can be committed altogether — five contracts at a fifth each is all of it — and not a limit on how many you may hold, because there is no such limit: nothing here rations contracts.",
        )),
        row(now, ctx.capText
          ? msg("lim_margin_now", "At most $1 in any one contract.", ctx.capText)
          : msg("lim_margin_now_off", "Off — any one contract may take all of the free balance, $1 now.", ctx.freeText)),
      ],
      sessionLossPct: [
        row(is, msg(
          "lim_loss_is",
          "When this session has lost this share of the account, it stops opening contracts. It is the one rule here that ends a run rather than shaping it, which is why it is off by default — what a market actually stops you with is margin and liquidation, and both are always on.",
        )),
        row(not, msg(
          "lim_loss_not",
          "Not a stop-loss: it does not close anything, and a contract already running keeps running. It counts what has been realised — money actually lost on closed contracts — not what an open one is showing.",
        )),
        row(now, ctx.lossOff
          ? msg("lim_loss_now_off", "Off — $1 lost this session, and the session does not end on it.", ctx.lostText)
          : msg("lim_loss_now", "$1 lost of $2.", ctx.lostText, ctx.lossCapText)),
      ],
      streakPause: [
        row(is, msg(
          "lim_streak_is",
          "After this many losses in a row the account refuses the next contract, and lifts the moment a closed contract does not lose. The record grades the third loss in a row as taken angry, and this is the one rule that stops you before it — chosen, never default.",
        )),
        row(not, msg(
          "lim_streak_not",
          "Not a loss limit: it counts contracts, not money, and a run of three small losses trips it while one large one does not. It does not close anything and does not end the session.",
        )),
        row(now, ctx.streakAt > 0
          ? msg("lim_streak_now", "$1 in a row now, of $2.", String(ctx.streakNow), String(ctx.streakAt))
          : msg("lim_streak_now_off", "Off — $1 losses in a row now, and nothing pauses on it.", String(ctx.streakNow))),
      ],
    };
    return React.createElement(
      AlertPosExplain,
      { "data-practice-limit-what": key },
      ...(body[key] || []),
    );
  },

  /* **Remember what the ticket was set to.** Leverage belongs to the coin —
   * that is how every venue holds it — and the size share to the panel. It
   * goes through the app so there is one writer and one storage key; a
   * refusal there is silent, because this is a convenience and must never be
   * the thing that stops an order. */
  rememberTicket: (patch) => {
    if (panel.props.onPracticeTicket) panel.props.onPracticeTicket(patch);
  },

  /* What this coin was last traded at, or the ticket's own default. Clamped
   * by the caller against the plan, which can be tightened after a leverage
   * was remembered. */
  ticketLeverage: (coin) => {
    const t = panel.props.practiceTicket;
    const v = t && t.leverage && t.leverage[coin];
    return practiceLeverageOk(v) ? v : 2;
  },

  /* A typed leverage needs a draft separate from the live number. Without
   * one, deleting `2` on the way to `37` immediately put the `2` back and the
   * next key made `23`. Valid drafts update the ticket as they are typed;
   * empty and out-of-range drafts stay visible but never reach the model. */
  leverageField: (raw, maximum) => {
    const d = panel.numberField("pLevDraft", raw, { decimals: false });
    const value = Number(d.value);
    if (d.value !== "" && practiceLeverageOk(value) && value <= maximum) {
      panel.setState({ pLev: value });
      const coin = panel.props.activeCoin;
      if (coin) panel.rememberTicket({ leverage: { [coin]: value } });
    }
  },

  /* **What the model's refusal means, in words.** The model answers with a
   * short name because a name is what a test can assert on and what a caller
   * can branch on; putting that name on screen — `Cannot open: planMargin` —
   * is handing someone the internals and calling it an explanation. Each of
   * these says the limit *and* what to do about it, because every one of them
   * is reachable by an ordinary press. Anything not listed falls back to the
   * name, which is the honest answer for a case nobody has written a sentence
   * for yet. */
  /* **"I have money and it will not open."**
   *
   * Reported by the human on 13 Sep 2026, and the model was right every time:
   * what binds is the **free** balance, not the account. Seven contracts at
   * 0.2 BTC on a $10,000 account leave $427 uncommitted — the header still
   * says $10,000, because that is what the account *is*, and the margin behind
   * the open contracts is committed rather than spent. So the refusal names
   * the figure it is actually talking about when it can. Nothing about the
   * rule changed; what changed is that the sentence stops being deniable. */
  refusalText: (code, practice) => {
    const free =
      practice && code === "funds"
        ? practiceFreeBalance(practice, panel.props.activeCoin)
        : null;
    const t = {
      /* `price` fires on the model's own range, not on a missing quote — an
         empty entry field never reaches the model at all. Saying "no live
         price" here named the wrong thing entirely. */
      price: msg("pos_no_price", "that price is outside the range this account can work in"),
      notional: msg("pos_no_notional", "that is more than this account can size"),
      planMargin: msg("pos_no_margin", "more margin than this account commits at once — try a smaller size"),
      /* **Three of these used to end in "reset", and that is no longer the
         answer — it is the destructive one.** Adding funds and starting the
         next session both keep the balance, the lots and the record, so a
         refusal that sends somebody to a reset is telling them to destroy
         their account to get past a limit that has a way through. */
      funds:
        free == null
          ? msg("pos_no_funds", "not enough left in the balance — close something, or add funds on the Account tab")
          : msg(
              "pos_no_funds_free",
              "only $1 of the balance is uncommitted — the rest is margin behind your open contracts. Close something, or add funds on the Account tab",
              panel.posAmount(free, panel.props.activeCoin, practice.settlement),
            ),
      planLeverage: msg("pos_no_lev", "above the leverage this account allows"),
      /* **The one refusal that names a number the screen cannot show
         anywhere else.** "Too much leverage" is not the fact; the fact is that
         this *size* is in a bracket that allows less, which is the whole of
         what the risk ladder teaches. */
      tier: msg("pos_no_tier", "more leverage than a contract this size may use"),
      /* P5 — sizing by risk is a size measured to a stop, so it needs one. */
      riskStop: msg("pos_no_risk_stop", "sizing by risk needs a stop on the losing side of the entry — set one below"),
      riskSmall: msg("pos_no_risk_small", "even the smallest size would lose more than that at the stop — risk more, or move the stop closer"),
      /* **A limit that would fill on the next tick is a market order.** Said
         rather than done: the whole point of the order type is that it waits,
         and silently crossing would charge the taker fee somebody was trying
         to avoid. */
      crosses: msg("pos_no_crosses", "that price is already here — a limit order has to wait above or below the market"),
      orders: msg("pos_no_orders", "as many orders resting as this account will hold"),
      stopCrosses: msg("pos_no_stop_crosses", "that trigger is already passed — a stop waits above the price for a long and below it for a short"),
      reduce: msg("pos_no_reduce", "there is nothing on the other side of this market to reduce"),
      /* A scaled order's own three (practicePlaceScale). */
      scaleCount: msg("pos_no_scale_count", "a scaled order is 3, 5 or 10 orders"),
      scaleRange: msg("pos_no_scale_range", "From and To have to be two different prices"),
      scaleSize: msg("pos_no_scale_size", "that size is too small to split into this many orders"),
      reduceSize: msg("pos_no_reduce_size", "more than there is on the other side to reduce"),
      leverage: msg("pos_no_lev2", "that leverage is outside 1x to 200x"),
      size: msg("pos_no_size", "the size works out too small to trade"),
      lot: msg("pos_no_lot", "the size is not a whole number of lots"),
      slots: msg("pos_no_slots", "every position slot is in use"),
      /* `open` — "you already hold this coin" — is gone with the rule it
         described. `practiceCanOpen` stopped refusing a second contract on a
         market on 8 Sep 2026 and says so where the check used to be; the
         string outlived it by five days, unreachable and wrong. */
      planLoss: msg("pos_no_loss", "this session has reached its loss limit"),
      streak: msg("pos_no_streak", "paused — the account's own rule after this many losses in a row; it lifts on the next contract that does not lose"),
      ended: msg("pos_no_ended", "this session is finished"),
      /* Reachable from the level editor as well as from the ticket: a stop
         above a long's entry is a take-profit typed into the wrong box. */
      side: msg("pos_no_side", "a stop goes on the losing side of your entry and a take-profit on the winning one"),
      none: msg("pos_no_position", "there is no position on that coin any more"),
    };
    return t[code] || code;
  },

  /* **What the next hour did to this contract, two thousand times.** See
     `practiceSimulate`: the window the chart draws is resampled in blocks and
     every path is stepped through the real model, so a liquidation here is
     the account's own rule firing. The three counts are first touches; the
     quantiles are the result at the horizon of the paths nothing stopped.
     Cached on the contract, the mark to the nearest 0.1% and the series, so
     a tick that changes nothing does not replay two thousand hours. */
  outcomeCone: (pos, markE4) => {
    const series = panel.props.series;
    const bucket = Math.round(markE4 / Math.max(1, markE4 / 1000));
    const key = `${pos.id}:${bucket}:${pos.stop || 0}:${pos.take || 0}:${pos.qty}:${series ? series.length + ":" + series[series.length - 1].time : 0}`;
    if (panel._cone && panel._cone.key === key) return panel._cone.out;
    const out = practiceSimulate(panel.props.practice, pos.id, series, { markE4, horizon: 60, block: 8 });
    panel._cone = { key, out };
    return out;
  },

  renderOutcomeCone: (pos, markE4) => {
    const cone = panel.outcomeCone(pos, markE4);
    const sym = panel.posSymbol(pos.currency);
    const label = (PERIOD_OPTIONS.find((o) => o.value === panel.props.period) || {}).label || "";
    if (!cone || !cone.n) {
      return React.createElement(
        AlertPosMeasure,
        { "data-practice-cone": "thin" },
        msg(
          "pos_cone_thin",
          "Too few bars on this range to resample the next hour from ($1 of $2 needed).",
          String(cone ? cone.bars : 0),
          String(PRACTICE_CONE_MIN_BARS),
        ),
      );
    }
    const pct = (k) => `${Math.round((cone.counts[k] / cone.n) * 100)}%`;
    const money = (v) => `${v >= 0 ? "+" : "−"}${practiceMoneyText(Math.abs(v), sym)}`;
    return React.createElement(
      AlertPosMeasure,
      { "data-practice-cone": String(cone.n), title: msg("pos_cone_hint", "Resampled in blocks of 8 bars from the range on screen and stepped through the same rules the account runs on. A count of simulated paths, not a probability of profit.") },
      msg(
        "pos_cone",
        "Of $1 next hours resampled from the $2 range: $3 touched the liquidation first, $4 the stop, $5 the take, $6 reached the hour — where the middle one stood at $7 (5th–95th $8 … $9).",
        String(cone.n),
        label,
        pct("liquidation"),
        pct("stop"),
        pct("take"),
        pct("open"),
        cone.median == null ? "—" : money(cone.median),
        cone.p5 == null ? "—" : money(cone.p5),
        cone.p95 == null ? "—" : money(cone.p95),
      ),
    );
  },

  /* **Which currency the money on this screen is in.**
   *
   * Every figure in this section printed a bare number — `10,000.00` beside a
   * `43,501.7400` price, with the only symbol on the whole screen the one set
   * into the balance field. They carry the sign now, and *whose* sign is not
   * one answer: a position stores the currency it was opened in and is paused
   * outside it, so its own row prints its own symbol. A margin taken in
   * dollars, drawn with a euro sign in front of it because the chart happens
   * to be in euros, is a number that was never true — the same rule the
   * paused target rows already follow. */
  posSymbol: (currency) => {
    return practiceSymbolFor(currency || panel.props.currency);
  },

  /* The sign in front of a **price**: none for a USDT market (its quote is
     named once, not on every level), the old sign for a contract from
     before the switch. `practicePriceText` drops a unit on its own; this is
     for the chart's axis and tags, which format through `formatAxisPrice`. */
  posPriceSign: (currency) => {
    const sign = panel.posSymbol(currency);
    return practiceUnitAfter(sign) ? "" : sign;
  },

  /* **The unit's name, where a unit is what is being named** — a size
     toggle, a field's affix, a funding choice. USDT has no sign
     (`getCurrencySymbol`), so these say "USDT" where they used to say "$". */
  posUnit: (currency) => {
    const c = currency || panel.props.currency;
    return getCurrencySymbol(c) || c;
  },

  /* Prices keep the quote symbol in both contract types. Account amounts do
     not: an inverse contract's collateral, costs and P/L belong to the
     contract coin, and are formatted here so they cannot acquire a dollar
     sign merely because the chart is quoted in dollars. */
  posAmount: (value, coin, settlement) => {
    return settlement === PRACTICE_SETTLEMENT_COIN
      ? practiceCoinText(value, coin)
      : practiceMoneyText(value, panel.posSymbol());
  },

  /* **What is left, and what it is left of.**
   *
   * Reported as "shouldn't the part that's left be more obvious — and say the
   * total?". Both halves are the same complaint: the free balance is the
   * figure that decides whether an order can be placed *and* the figure the
   * size chips take their percentage of, and it was printed alone, in the
   * grey used for scope notes. Alone it is also unreadable in the way that
   * matters — $6,057 free means nothing without knowing whether the account
   * is $6,100 or $60,000.
   *
   * The total is **free plus committed**, which is the account's money right
   * now and deliberately not its equity: equity moves with every tick of an
   * open contract, and a denominator that moves while you size an order is
   * not a denominator. It is not `practiceAccountSize` either — that is what
   * was *put in*, and funding has been taken out of it since.
   *
   * With nothing committed the two are the same number and the sentence
   * drops back to the short form, the same rule the header line follows. */
  freeText: (practice, coin) => {
    const inverse = practiceIsCoinSettled(practice);
    const wallet = inverse ? practiceWallet(practice, coin) : null;
    const free = practiceFreeBalance(practice, coin);
    const used = inverse ? wallet.margin : practice.margin;
    const money = (v) =>
      inverse ? practiceCoinText(v, coin) : practiceMoneyText(v, panel.posSymbol());
    return used > 0
      ? msg("pos_free_of", "$1 free of $2", money(free), money(free + used))
      : msg("pos_free_all", "$1 free", money(free));
  },

  posSize: (pos, qty) => {
    return pos && pos.settlement === PRACTICE_SETTLEMENT_COIN
      ? `${practiceMoneyText(qty, panel.posSymbol(pos.currency))} contracts`
      : `${practiceQtyText(qty)} ${pos ? pos.coin : ""}`;
  },

  /* **The futures screen.**
   *
   * It was a disclosure block inside the calls panel and it has a card of its
   * own now, so there is nothing to disclose it from: the terms, the equity,
   * the open positions, the ticket and the record are simply the screen, in
   * that order. The pieces are the same pieces, so nothing about a position
   * looks different for having moved. */
  /* **Marked on the mark, traded at the last** — the per-coin map every
     valuation on this screen reads. Out of `renderFuturesBody` so the Pro
     page's chart reads the same numbers as the rows beside it. */
  practiceMarkMap: () => {
    const { practice, livePrices } = panel.props;
    const markPrices = panel.props.practiceMarks || {};
    const marks = {};
    if (!practice) return marks;
    /* **Every market with something on it, held or resting.** Built from the
       contracts *and* the orders: a resting order's row exists to say how far
       the market is from it, and with no position on that coin there was no
       mark to say it with. */
    for (const c of practiceCoinsActive(practice)) {
      const v = livePrices && livePrices[c];
      if (markPrices[c] > 0) marks[c] = markPrices[c];
      else if (v > 0) marks[c] = Math.round(v * PRICE_SCALE);
    }
    return marks;
  },

  /* The body of the derivatives page's desk (`practice-page.js`): the tabs
     and what each one shows. The page draws the equity in its own head and
     the market in its own column. */
  renderFuturesBody: () => {
    const {
      practice,
      practiceConsent,
      practiceEnabled,
      activeCoin: coin,
      onPracticeAccept,
      onPracticeOpen,
      onPracticeReset,
    } = panel.props;
    if (!practice) return null;
    if (!practiceEnabled) {
      /* Switched off in Settings and reached anyway — by the key, or by a
         corner button somebody chose to keep. Saying so beats an empty card. */
      return React.createElement(
        AlertsEmpty,
        null,
        React.createElement(AlertsEmptyMark, { "aria-hidden": "true" }, icon("futures", 1.3)),
        React.createElement(AlertsEmptyTitle, null, msg("pos_off_title", "The derivatives market is switched off")),
        React.createElement(
          AlertsEmptyText,
          null,
          msg(
            "pos_off_text",
            "Turn it on in Settings → Preferences → Derivatives market. Nothing is drawn and nothing is marked while it is off, and any contract you had is exactly where you left it.",
          ),
        ),
      );
    }
    if (!practiceConsent) return panel.renderPracticeTerms(onPracticeAccept);

    /* **Marked on the mark, traded at the last.** Everything this map feeds —
       equity, unrealised, the cover ratio, the band, the liquidation line — is
       a *valuation*, and a venue values a position on its mark price. The
       ticket's entry and the close quote keep reading `livePrices`, because
       that is a *fill* and a fill happens at the price on the screen. The
       fallback is the last price, which is what a mark of one tick is anyway. */
    const marks = panel.practiceMarkMap();
    /* The orders waiting on a price, oldest first — the order they were
       written in, which is the only order that does not move under you. */
    const resting = Object.keys(practice.orders || {})
      .map((id) => practice.orders[id])
      .filter(Boolean);
    /* A possible trade and live risk are different jobs. The former gets an
       order ticket; the latter gets a position list. Keeping them as two
       tabs matches the working split of a derivatives terminal and stops a
       new-order form appearing as the footer of an unrelated open position. */
    /* **The coin on the chart decides where you land, not the total count.**
     *
     * This was `coins.length ? "open" : "trade"` — *anything* held anywhere
     * sent you to the list. Together with the `pTab: "open"` written after a
     * successful open, that meant the first contract you ever opened was the
     * last time the panel showed you the ticket: every visit afterwards
     * landed on Positions, on every coin, and the only way back was noticing
     * the "New contract" tab. Reported as "a position already open and a new
     * one will not open" — which is what it looks like from the outside,
     * because the form is simply not on the screen.
     *
     * The rule that answers both cases without a preference to get stuck:
     * **the coin you are looking at has a position → show it; it does not →
     * show the ticket.** Holding BTC is not a reason to hide the ETH form. */
    /* Read through the helper so the book's timer and this render cannot
       disagree about which tab is on screen — see `futuresTab`, which holds
       the rule the comment above describes. */
    const tab = panel.futuresTab();
    const tabBody =
      tab === "orders"
        ? panel.renderRestingOrders(resting, marks)
        : tab === "funds"
          ? panel.renderPracticeAccount(practice, onPracticeReset, marks, "funds")
        : tab === "account"
          ? panel.renderPracticeAccount(practice, onPracticeReset, marks)
          /* The ticket has the desk to itself: the book is a reading of the
             market and lives in its own column, and what is open or closed
             is on the page's panel. **Only on a coin with a market** — see
             `practiceHasPerp`; contracts already held on any coin are in
             that panel whatever the listing says. */
          : panel.practiceHasPerp(coin)
            ? panel.renderPositionTicket(practice, coin, marks, onPracticeOpen)
            : React.createElement(
                AlertsEmpty,
                { "data-practice-noperp": coin },
                React.createElement(
                  AlertsEmptyTitle,
                  null,
                  msg("pp_noperp_title", "No market for $1 here", coin),
                ),
                React.createElement(
                  AlertsEmptyText,
                  null,
                  msg(
                    "pp_noperp_text",
                    "OKX lists no perpetual contract for $1, so there is no book, no funding and no open interest to trade it against. Choose a market above — every coin with one is under All markets.",
                    coin,
                  ),
                ),
              );
    return React.createElement(
      Fragment,
      null,
      React.createElement(
        AlertPosTabs,
        null,
        ...[
          ["trade", msg("pos_tab_trade", "New contract"), 0],
          /* **No list of contracts here at all.** They are on the page's own
             panel — a row each, unfolding in place — so the desk is the
             ticket, what is resting, and the account. Asked for on 19 Sep
             2026: *"open kontratlar hali hazırda solda var, sağda bunu
             koymaya gerek yok"*. */
          /* **Orders, between what you are about to do and what you have
             done.** Drawn even with nothing resting — a tab that appears when
             the first order is placed is a tab nobody knows is there. */
          ["orders", msg("pos_tab_orders", "Orders"), resting.length],
          ["funds", msg("pos_tab_funds", "Funds"), 0],
          ["account", msg("pos_tab_account", "Account"), 0],
        ].map((t) =>
          React.createElement(
            AlertPosTab,
            {
              key: t[0],
              active: tab === t[0],
              "aria-pressed": tab === t[0],
              /* Leaving the tab drops an armed reset with it: a
                 confirmation is a question about a press you just made, and
                 one waiting on a screen you walked away from is a trap. */
              onClick: () => panel.setState({ pTab: t[0], pReset: null, pCancelAll: false }),
            },
            t[1],
            t[2] ? React.createElement(AlertPosTabCount, null, String(t[2])) : null,
          ),
        ),
      ),
      tabBody,
    );
  },

  /* **The terms, once, before anything else is drawn.**
   *
   * Not a banner that can be scrolled past: while this is on screen there is
   * no ticket, no balance and no button to open anything. The Chrome Web
   * Store's rule for a simulation that offers no winnings is that it must
   * *clearly* say no real money is involved, and a statement shown once at
   * the bottom of a panel is not clear. Accepting is the only way past it,
   * and the acceptance is remembered so it is asked exactly once — the
   * section can be switched off and on again in Settings without asking
   * again, because the person has already read it.
   */
  renderPracticeTerms: (onPracticeAccept) => {
    return React.createElement(
      AlertPosTerms,
      null,
      React.createElement(AlertPosTermsTitle, null, msg("pos_terms_title", "Before you start")),
      React.createElement(
        AlertPosTermsList,
        null,
        React.createElement(
          "li",
          null,
          msg(
            "pos_terms_1",
            "This is a simulation. No order is placed, nothing is sent anywhere, and there is no exchange, broker or account behind it.",
          ),
        ),
        React.createElement(
          "li",
          null,
          msg(
            "pos_terms_2",
            "The balance is imaginary and has no value. It cannot be bought, topped up, transferred, withdrawn or redeemed, and clearing your browser data ends it.",
          ),
        ),
        React.createElement(
          "li",
          null,
          msg(
            "pos_terms_3",
            "Prices are real, but the result is not: a real venue has spreads, queues, slippage and outages this does not reproduce.",
          ),
        ),
        React.createElement(
          "li",
          null,
          msg(
            "pos_terms_4",
            "Nothing here is financial advice, and a result here says nothing about how you would do with money. Leveraged trading with real money can lose more than you put in.",
          ),
        ),
      ),
      React.createElement(
        AlertPosButton,
        { onClick: () => onPracticeAccept && onPracticeAccept() },
        msg("pos_terms_accept", "I have read this — don't show again"),
      ),
      React.createElement(
        AlertPosNote,
        null,
        msg(
          "pos_terms_off",
          "You can switch this section off again in Settings → Preferences.",
        ),
      ),
    );
  },

  /* **What you have actually done, which nothing said.**
   *
   * Every closed position was written to the ledger from the first day and
   * none of it was ever shown: the balance went up or down and the screen
   * held no record of why, so there was nothing to learn from and nothing to
   * come back for. Calls have kept a tally since they existed; this is the
   * same fact about the other half of the panel.
   *
   * Three numbers and a short list, and each is read off the ledger rather
   * than counted separately — a second tally kept alongside the events is a
   * second tally that drifts. **Fees are named**, because they are charged on
   * both sides of every position and are otherwise invisible: a run of small
   * wins that nets to a loss is the most useful thing this screen can show
   * somebody, and it cannot show it if the cost is hidden.
   *
   * Absent, not empty, until something has been closed: a results block
   * reading "0 of 0" on a fresh account is furniture. */
  /* One word per ending, written once: the filter chip and the row have to
   * agree about what a `stop` is called. */
  recordHowText: (kind) => {
    return kind === "liquidation"
      ? msg("pos_why_liq", "liquidated")
      : kind === "stop"
        ? msg("pos_why_stop", "stopped")
        : kind === "take"
          ? msg("pos_why_take", "took profit")
          : msg("pos_why_closed", "closed");
  },

  /* **The shape of the run, which six numbers cannot draw.**
   *
   * Cumulative realised, oldest to newest, one point per settled contract.
   * It is the only thing on this screen that says *when* the damage happened
   * — six small wins and one large loss and the reverse have the same net,
   * the same average and completely different lines.
   *
   * Drawn from the same list the figures are computed over, so a filter
   * narrows both. No axis and no labels: the readings are directly above it
   * and a second copy of them inside a 40px strip would be noise. The zero
   * line is drawn when the run crosses it, because "did this account ever go
   * under" is the one question the shape alone should answer. */
  renderRecordCurve: (list) => {
    if (!list || list.length < RECORD_MIN_FOR_CURVE) return null;
    const points = [];
    let cum = 0;
    for (const e of list) {
      cum += e.realised;
      points.push(cum);
    }
    const hi = Math.max(0, ...points);
    const lo = Math.min(0, ...points);
    const span = hi - lo || 1;
    const W = 100;
    const H = 26;
    const x = (i) => (points.length === 1 ? W : (i / (points.length - 1)) * W);
    const y = (v) => H - ((v - lo) / span) * H;
    const path = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
    const end = points[points.length - 1];
    return React.createElement(
      AlertPosCurve,
      { "data-practice-record-curve": String(points.length) },
      React.createElement(
        "svg",
        {
          viewBox: `0 0 ${W} ${H}`,
          preserveAspectRatio: "none",
          "aria-hidden": "true",
          focusable: "false",
        },
        lo < 0 && hi > 0
          ? React.createElement("line", {
              x1: 0,
              x2: W,
              y1: y(0).toFixed(2),
              y2: y(0).toFixed(2),
              className: "pt-zero",
            })
          : null,
        React.createElement("path", { d: path, className: end >= 0 ? "pt-up" : "pt-down" }),
      ),
    );
  },

  /* **Why a contract got its grade, in words.** Each code from
     `practiceScorecard` is one clause; an A has none and says so. Used for
     the chip's title and nothing else, so the card itself stays one line. */
  gradeReasons: (row) => {
    const words = {
      nostop: msg("pos_grade_nostop", "no stop was set"),
      moved: msg("pos_grade_moved", "the stop was moved away"),
      streak: msg("pos_grade_streak", "the third loss in a row"),
      risk: msg("pos_grade_risk", "risked more than the plan's share per contract"),
      sizeup: msg("pos_grade_sizeup", "sized up straight after a loss"),
    };
    const said = (row.why || []).map((w) => words[w]).filter(Boolean);
    return said.length
      ? `${row.grade} — ${said.join("; ")}`
      : msg("pos_grade_clean", "A — had a stop, kept it, risked within the plan");
  },

  /* **The process scorecard** — the record graded on how each contract was
     handled, which is the one thing about it the trader controlled. The
     research behind it (ORDERFLOW_AND_MARKOV_RESEARCH.md §3) puts it plainly:
     a result is one draw from a distribution and says almost nothing on its
     own; the process is what repeats. Five figures, every one with its count:
     the grades, the bad losses (a loss that was a C), the average R-multiple
     (realised over the risk the first stop defined — so a contract with no
     stop has no R and is left out of that mean), the profit factor, and the
     win rate with its Wilson interval, which at five contracts is honestly
     wide. Below five closed contracts only the grades are drawn: the record's
     own RECORD_MIN_FOR_STATS rule, applied to a scorecard. */
  renderProcessScore: (practice, shown, grade) => {
    if (!shown.length) return null;
    const rows = shown.map((e) => grade[e.id]).filter(Boolean);
    if (!rows.length) return null;
    const count = { A: 0, B: 0, C: 0 };
    let bad = 0;
    const rs = [];
    let grossWin = 0;
    let grossLoss = 0;
    let wins = 0;
    for (const e of shown) {
      const g = grade[e.id];
      if (!g) continue;
      count[g.grade] += 1;
      if (e.realised < 0 && g.grade === "C") bad += 1;
      if (g.r != null) rs.push(g.r);
      if (e.realised > 0) {
        wins += 1;
        grossWin += e.realised;
      } else if (e.realised < 0) grossLoss += -e.realised;
    }
    const n = rows.length;
    const enough = n >= RECORD_MIN_FOR_STATS;
    const avgR = enough && rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    const pf = enough && grossLoss > 0 ? grossWin / grossLoss : null;
    const win = enough ? practiceWilson(wins, n) : null;
    const pct = (v) => `${Math.round(v * 100)}%`;
    const cells = [
      [
        msg("pos_score_grades", "Process"),
        `A ${count.A} · B ${count.B} · C ${count.C}`,
        msg("pos_score_grades_hint", "A had a stop, kept it and risked within the plan; B risked more than the plan's share or sized up after a loss; C had no stop, moved it away, or was the third loss in a row"),
        null,
      ],
      [
        msg("pos_score_bad", "Bad losses"),
        msg("pos_score_bad_of", "$1 of $2", String(bad), String(n)),
        msg("pos_score_bad_hint", "Losses graded C — the ones the process, not the market, took"),
        bad > 0 ? "down" : null,
      ],
      avgR != null
        ? [
            msg("pos_score_r", "Avg R"),
            `${avgR >= 0 ? "+" : "\u2212"}${Math.abs(avgR).toFixed(2)}R`,
            msg("pos_score_r_hint", "Result over the risk the first stop defined, averaged over the $1 contracts that had one", String(rs.length)),
            avgR > 0 ? "up" : avgR < 0 ? "down" : null,
          ]
        : null,
      pf != null
        ? [
            msg("pos_score_pf", "Profit factor"),
            pf.toFixed(2),
            msg("pos_score_pf_hint", "Gross wins over gross losses, fees and funding included"),
            pf > 1 ? "up" : "down",
          ]
        : null,
      win
        ? [
            msg("pos_score_win", "Win rate"),
            `${pct(win.p)} (${pct(win.lo)}\u2013${pct(win.hi)})`,
            msg("pos_score_win_hint", "$1 of $2 came good; the range is the 95% Wilson interval, which is what $2 contracts can honestly say", String(wins), String(n)),
            null,
          ]
        : null,
    ].filter(Boolean);
    return React.createElement(
      Fragment,
      null,
      React.createElement(
        AlertPosDetail,
        { "data-practice-scorecard": "true" },
        ...cells.map(([label, value, hint, tone]) =>
          React.createElement(
            AlertPosDetailCell,
            { key: label, title: hint },
            React.createElement("span", null, label),
            React.createElement("strong", { "data-tone": tone || undefined }, value),
          ),
        ),
      ),
      enough
        ? null
        : React.createElement(
            AlertPosRecordNote,
            null,
            msg("pos_score_few", "R, profit factor and win rate wait for $1 closed contracts — $2 so far", String(RECORD_MIN_FOR_STATS), String(n)),
          ),
    );
  },

  renderPracticeRecord: (practice, closes) => {
    const st = panel.state;
    const inverse = practiceIsCoinSettled(practice);
    /* **Has this account ever closed a contract?** — which is a different
       question from "has it ever spent anything", and the two were the same
       test. `realised !== 0 || fees > 0` is true from the **first order**,
       because opening one charges a fee: a brand-new account with one
       contract running and nothing ever settled was told "the record is empty
       because you cleared it".
       Counted instead, from the two numbers that can only mean this: every
       contract this account has opened, less the ones still running. Adding
       to a position does not move `opened` — it is a fill, not a contract —
       so the difference is exactly the number that has been closed. */
    const everClosed = Math.max(0, (practice.opened || 0) - practiceCount(practice));
    /* How many coins this account has ever settled in — the record's own
       count on an inverse account, where "net" is a different number per
       coin and cannot be added up. */
    const wallets = Object.keys(practice.wallets || {});
    if (!closes.length) {
      return React.createElement(
        AlertsEmpty,
        null,
        React.createElement(AlertsEmptyMark, { "aria-hidden": "true" }, icon("futures", 1.3)),
        React.createElement(
          AlertsEmptyTitle,
          null,
          msg("pos_record_none", "Nothing closed yet"),
        ),
        React.createElement(
          AlertsEmptyText,
          null,
          /* **Cleared is not the same as never traded**, and the two used to
             read identically. Told apart from the account itself rather than
             from a flag: an account that has settled a contract has closed
             something, whatever the list says now.
             Parenthesised, and it has to be: `?:` is right-associative, so
             the old `inverse ? a : b || c ? d : e` handed a **boolean** back
             on a coin-settled account and React drew a title with an empty
             paragraph under it. */
          everClosed > 0
            ? msg(
                "pos_record_cleared",
                "The record is empty because you cleared it. The balance and the account's own totals are untouched — nothing was undone, only unlisted.",
              )
            : msg(
                "pos_record_none_text",
                "Every contract you close lands here — what you made on it, and what ended it. It is the half of this you can learn from.",
              ),
        ),
      );
    }
    /* **A record you can narrow.** Twenty rows of everything is a log; the
       questions people actually bring to it are "how do I do on ETH" and
       "how often does a stop save me", and neither can be asked of a list.
       Two filters, both drawn only when there is something to choose between
       — a coin filter over one coin is a control that cannot change
       anything. */
    const coinsSeen = [];
    const howSeen = [];
    /* P9 — the journal's tags are a third filter: "how do my breakouts do"
       is the question a tag is written to be able to ask. */
    const tagsSeen = [];
    for (const e of closes) {
      if (!coinsSeen.includes(e.coin)) coinsSeen.push(e.coin);
      if (!howSeen.includes(e.kind)) howSeen.push(e.kind);
      for (const t of e.tags || []) if (!tagsSeen.includes(t)) tagsSeen.push(t);
    }
    const pickedCoin = coinsSeen.includes(st.pRecCoin) ? st.pRecCoin : null;
    const pickedHow = howSeen.includes(st.pRecHow) ? st.pRecHow : null;
    const pickedTag = tagsSeen.includes(st.pRecTag) ? st.pRecTag : null;
    const shown = closes.filter(
      (e) => (!pickedCoin || e.coin === pickedCoin) && (!pickedHow || e.kind === pickedHow)
        && (!pickedTag || (e.tags || []).includes(pickedTag)),
    );
    const wins = shown.filter((e) => e.realised > 0).length;
    /* **The process scorecard**, graded over the whole record and then read
       for what is listed: a streak or a size-up is a fact about the contract
       *before* this one, and a filtered list would lose the contract before.
       Keyed by event id, so the card and the summary read the same grade. */
    const scorecard = inverse ? null : practiceScorecard(practice);
    const grade = {};
    for (const r of (scorecard && scorecard.rows) || []) grade[r.id] = r;
    /* **What the record is for, and what it cannot say yet.**
     *
     * Six readings, and every one of them is a mean or an extreme — which is
     * exactly the shape of figure that lies on a small sample. The rule is
     * the base-rate panel's: print the count and refuse the comparison rather
     * than dress four contracts up as a track record. Quote accounts only,
     * for the same reason the net figure is: on an inverse account the
     * results are in different coins and cannot be added.
     *
     * Expectancy is the mean, which is the only honest one-number answer to
     * "what does a contract do for me" — and it is net of the fees and the
     * funding, because the ledger's `realised` already is. */
    const stats = (() => {
      if (inverse || shown.length < RECORD_MIN_FOR_STATS) return null;
      const ups = shown.filter((e) => e.realised > 0).map((e) => e.realised);
      const downs = shown.filter((e) => e.realised < 0).map((e) => -e.realised);
      const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
      let cum = 0;
      let peak = 0;
      let drop = 0;
      for (const e of shown) {
        cum += e.realised;
        peak = Math.max(peak, cum);
        drop = Math.max(drop, peak - cum);
      }
      return {
        avgWin: mean(ups),
        avgLoss: mean(downs),
        each: Math.round(shown.reduce((x, e) => x + e.realised, 0) / shown.length),
        best: shown.reduce((m, e) => Math.max(m, e.realised), -Infinity),
        worst: shown.reduce((m, e) => Math.min(m, e.realised), Infinity),
        drop,
      };
    })();
    return React.createElement(
      Fragment,
      null,
      /* The three figures the record is for, on one line: how many came good,
         what it all came to, and what it cost in fees — that last one because
         a run of small wins that nets to a loss is the most useful thing this
         screen can show, and it cannot show it if the cost is hidden. */
      React.createElement(
        AlertPosScore,
        null,
        React.createElement(
          AlertPosScoreCell,
          null,
          React.createElement(AlertPosKey, null, msg("pos_record_won", "Came good")),
          React.createElement(
            AlertPosScoreValue,
            null,
            /* "of what is listed", because the list can now be shorter than
               the account's own history — the money beside it is the
               account's and does not shrink when a row is dropped. */
            msg(
              "pos_record_score",
              "$1 of $2 listed",
              String(wins),
              String(closes.length),
            ),
          ),
        ),
        inverse
          ? React.createElement(
              AlertPosScoreCell,
              null,
              React.createElement(AlertPosKey, null, msg("pos_record_assets", "Assets")),
              React.createElement(AlertPosScoreValue, null, String(wallets.length)),
            )
          : React.createElement(
              AlertPosScoreCell,
              null,
              React.createElement(AlertPosKey, null, msg("pos_record_net", "Net")),
              React.createElement(
                AlertPosScoreValue,
                { tone: practice.realised > 0 ? "up" : practice.realised < 0 ? "down" : null },
                `${practice.realised >= 0 ? "+" : "-"}${practiceMoneyText(Math.abs(practice.realised), panel.posSymbol())}`,
              ),
            ),
        inverse
          ? React.createElement(
              AlertPosScoreCell,
              null,
              React.createElement(AlertPosKey, null, msg("pos_settlement", "Settlement")),
              React.createElement(
                AlertPosScoreValue,
                null,
                msg("pos_settlement_per_asset", "Per asset"),
              ),
            )
          : React.createElement(
              AlertPosScoreCell,
              null,
              React.createElement(AlertPosKey, null, msg("pos_record_cost", "Fees")),
              React.createElement(
                AlertPosScoreValue,
                null,
                practiceMoneyText(practice.fees + practice.funding, panel.posSymbol()),
              ),
            ),
      ),
      /* **The two filters, and only when they can change something.** */
      coinsSeen.length > 1 || howSeen.length > 1 || tagsSeen.length
        ? React.createElement(
            AlertPosFilters,
            { "data-practice-record-filters": "true" },
            tagsSeen.length
              ? React.createElement(
                  AlertPosChips,
                  { "data-practice-record-tags": "true" },
                  ...[[null, msg("pos_record_all_tags", "All tags")], ...tagsSeen.map((t) => [t, `#${t}`])].map(
                    ([value, label]) =>
                      React.createElement(
                        AlertPosChip,
                        {
                          key: String(value),
                          active: pickedTag === value,
                          "aria-pressed": pickedTag === value ? "true" : "false",
                          onClick: () => panel.setState({ pRecTag: value }),
                        },
                        label,
                      ),
                  ),
                )
              : null,
            coinsSeen.length > 1
              ? React.createElement(
                  AlertPosChips,
                  null,
                  ...[[null, msg("pos_record_all", "All")], ...coinsSeen.map((c) => [c, c])].map(
                    ([value, label]) =>
                      React.createElement(
                        AlertPosChip,
                        {
                          key: label,
                          active: pickedCoin === value,
                          "aria-pressed": pickedCoin === value ? "true" : "false",
                          onClick: () => panel.setState({ pRecCoin: value }),
                        },
                        label,
                      ),
                  ),
                )
              : null,
            howSeen.length > 1
              ? React.createElement(
                  AlertPosChips,
                  null,
                  ...[
                    [null, msg("pos_record_all", "All")],
                    ...howSeen.map((k) => [k, panel.recordHowText(k)]),
                  ].map(([value, label]) =>
                    React.createElement(
                      AlertPosChip,
                      {
                        key: String(value),
                        active: pickedHow === value,
                        "aria-pressed": pickedHow === value ? "true" : "false",
                        onClick: () => panel.setState({ pRecHow: value }),
                      },
                      label,
                    ),
                  ),
                )
              : null,
          )
        : null,
      /* **Six readings and a line.** See `stats` for why they are refused on
         a small sample and on an inverse account. */
      stats
        ? React.createElement(
            Fragment,
            null,
            React.createElement(
              AlertPosDetail,
              { "data-practice-record-stats": "true" },
              ...[
                [msg("pos_stat_each", "Per contract"), stats.each, true],
                [msg("pos_stat_win", "Average win"), stats.avgWin, true],
                [msg("pos_stat_loss", "Average loss"), stats.avgLoss == null ? null : -stats.avgLoss, true],
                [msg("pos_stat_best", "Best"), stats.best, true],
                [msg("pos_stat_worst", "Worst"), stats.worst, true],
                /* A drawdown is a depth, not a result: it has no sign to
                   read and it is never good news, so it is drawn plain. */
                [msg("pos_stat_drop", "Deepest fall"), stats.drop, false],
              ]
                .filter(([, value]) => value != null && isFinite(value))
                .map(([label, value, signed]) =>
                  React.createElement(
                    AlertPosDetailCell,
                    { key: label },
                    React.createElement("span", null, label),
                    React.createElement(
                      "strong",
                      null,
                      signed
                        ? `${value >= 0 ? "+" : "\u2212"}${practiceMoneyText(Math.abs(value), panel.posSymbol())}`
                        : practiceMoneyText(Math.abs(value), panel.posSymbol()),
                    ),
                  ),
                ),
            ),
            panel.renderRecordCurve(shown),
          )
        : null,
      panel.renderProcessScore(practice, shown, grade),
      React.createElement(
        AlertPosRecordList,
        null,
        /* Newest first, and capped: the ledger holds two hundred entries and
           this is a record to read down, not an archive to page through. */
        ...shown
          .slice(-20)
          .reverse()
          .map((e, i) => {
            const sym = panel.posSymbol(e.currency);
            const coinSettled = e.settlement === PRACTICE_SETTLEMENT_COIN;
            const amount = (v) =>
              coinSettled ? practiceCoinText(v, e.coin) : practiceMoneyText(v, sym);
            return React.createElement(
              AlertPosRecordCard,
              { key: `${e.id || i}-${e.coin}`, "data-practice-record": "true" },
              React.createElement(
                AlertPosRecordTop,
                null,
                React.createElement(
                  AlertPosRecordCoin,
                  null,
                  e.coin,
                  React.createElement(
                    "span",
                    null,
                    `${e.side === "short" ? msg("pos_short", "Short") : msg("pos_long", "Long")} ${e.leverage}x`,
                  ),
                ),
                React.createElement(
                  AlertPosValue,
                  { tone: e.realised > 0 ? "up" : e.realised < 0 ? "down" : null },
                  `${e.realised >= 0 ? "+" : "-"}${amount(Math.abs(e.realised))}`,
                ),
              ),
              React.createElement(
                AlertPosRecordLine,
                null,
                React.createElement(
                  AlertPosRecordWhy,
                  { liquidated: e.kind === "liquidation" },
                  e.kind === "liquidation"
                    ? msg("pos_why_liq", "liquidated")
                    : e.kind === "stop"
                      ? msg("pos_why_stop", "stopped")
                      : e.kind === "take"
                        ? msg("pos_why_take", "took profit")
                        : msg("pos_why_closed", "closed"),
                ),
                /* **The grade is on the process, never on the money** — a
                   loss that had its stop and kept it is an A, and a win with
                   no stop is a C. The chip says its letter; the reasons are
                   in its title, one clause each, so a C can be read back to
                   the thing that made it one. */
                grade[e.id]
                  ? React.createElement(
                      AlertPosRecordGrade,
                      {
                        grade: grade[e.id].grade,
                        "data-practice-grade": grade[e.id].grade,
                        title: panel.gradeReasons(grade[e.id]),
                      },
                      grade[e.id].grade,
                    )
                  : null,
                /* **What the contract was, which the line had no room for.**
                   The size and the price it left at were in the event the
                   whole time and were never drawn — so the record said a
                   contract had ended and nothing about what ended. Both are
                   read off the event rather than recomputed: it is the
                   record, and a figure worked out again from today's state
                   would not be what happened. */
                e.qty
                  ? React.createElement(
                      "span",
                      null,
                      coinSettled
                        ? practiceMoneyText(e.qty, sym)
                        : `${practiceQtyText(e.qty)} ${e.coin}`,
                    )
                  : null,
                e.fill
                  ? React.createElement(
                      "span",
                      null,
                      msg("pos_record_out", "out at $1", practicePriceText(e.fill, sym)),
                    )
                  : null,
                e.fee
                  ? React.createElement(
                      "span",
                      null,
                      msg("pos_record_fee", "fee $1", amount(e.fee)),
                    )
                  : null,
              ),
              /* **P9 — the journal line.** What was written about this contract,
                 its tags, and the way to write or change them. The editor is
                 one card at a time, like every drawer on this screen. */
              e.note || (e.tags && e.tags.length)
                ? React.createElement(
                    AlertPosRecordNote,
                    { "data-practice-note": "true" },
                    (e.tags || []).length ? React.createElement("strong", null, e.tags.map((t) => `#${t}`).join(" ")) : null,
                    e.note ? React.createElement("span", null, e.note) : null,
                  )
                : null,
              st.pNoteFor === e.id
                ? React.createElement(
                    AlertPosEdit,
                    { "data-practice-note-editor": "true" },
                    React.createElement("textarea", {
                      "aria-label": msg("pos_note_aria", "Why this contract, in your words"),
                      maxLength: PRACTICE_NOTE_MAX,
                      rows: 3,
                      value: st.pNoteDraft || "",
                      placeholder: msg("pos_note_ph", "Why you took it, and what you would do again"),
                      onChange: (ev) => panel.setState({ pNoteDraft: ev.target.value }),
                      style: { width: "100%", font: "inherit", resize: "vertical" },
                    }),
                    React.createElement("input", {
                      type: "text",
                      "aria-label": msg("pos_tags_aria", "Tags, separated by commas"),
                      value: st.pTagsDraft || "",
                      placeholder: msg("pos_tags_ph", "tags, e.g. breakout, news"),
                      onChange: (ev) => panel.setState({ pTagsDraft: ev.target.value }),
                      style: { font: "inherit" },
                    }),
                    React.createElement(
                      AlertPosChips,
                      null,
                      React.createElement(
                        AlertPosChip,
                        {
                          active: true,
                          onClick: () => {
                            const why = panel.props.onPracticeAnnotate
                              && panel.props.onPracticeAnnotate(e.id, st.pNoteDraft || "", st.pTagsDraft || "");
                            panel.setState(why ? { pNoteWhy: why } : { pNoteFor: null, pNoteWhy: null });
                          },
                        },
                        msg("pos_note_save", "Save note"),
                      ),
                      React.createElement(
                        AlertPosChip,
                        { onClick: () => panel.setState({ pNoteFor: null, pNoteWhy: null }) },
                        msg("pos_note_cancel", "Cancel"),
                      ),
                    ),
                  )
                : React.createElement(
                    AlertPosClose,
                    {
                      "data-practice-note-open": e.id,
                      onClick: () =>
                        panel.setState({
                          pNoteFor: e.id,
                          pNoteDraft: e.note || "",
                          pTagsDraft: (e.tags || []).join(", "),
                          pNoteWhy: null,
                        }),
                    },
                    e.note || (e.tags && e.tags.length)
                      ? msg("pos_note_edit", "Edit note")
                      : msg("pos_note_add", "Add note"),
                  ),
              /* **Unlisted, not undone.** The ledger is what the balance is
                 recomputed from, so this cannot delete the event — the model
                 folds its totals into the summary and drops the row, and the
                 account does not move by a cent. No confirmation: nothing is
                 lost that the figures above do not still carry. In the card's
                 own corner now rather than in the line, where it sat a few
                 pixels from the next entry's coin. */
              React.createElement(
                AlertPosRecordDrop,
                {
                  "aria-label": msg(
                    "pos_record_drop_aria",
                    "Remove the $1 contract from the record",
                    e.coin,
                  ),
                  title: msg(
                    "pos_record_drop_title",
                    "Take this off the record. The balance does not change.",
                  ),
                  onClick: () =>
                    panel.props.onPracticeForget &&
                    panel.props.onPracticeForget(e.id),
                },
                "\u00d7",
              ),
            );
          }),
      ),
      /* Clearing the lot, at the foot where a list's own action belongs — and
         only once there is enough of a list for the one-by-one × to be the
         tedious way of doing it. */
      closes.length > 1
        ? React.createElement(
            AlertPosActions,
            null,
            React.createElement(
              AlertPosClose,
              {
                "aria-label": msg(
                  "pos_record_clear_aria",
                  "Take every settled contract off the record",
                ),
                onClick: () =>
                  panel.props.onPracticeForget && panel.props.onPracticeForget(),
              },
              msg("pos_record_clear", "Clear the record"),
            ),
          )
        : null,
    );
  },

  /* **The contract, opened out.** `headless` leaves off the card's own head
     — the page's table is the head now: a row per contract, and pressing one
     unfolds this underneath it. The rest is unchanged, including the reveal
     that animates it (`AlertPosReveal`). */
  renderPositionRow: (pos, markE4, currency, index, open, headless) => {
    /* The position's own, not the screen's — see `posSymbol`. A paused row is
       drawn from prices that were taken in another currency, and this is the
       one place on the screen where those two can differ. */
    const sym = panel.posSymbol(pos.currency);
    /* **What a close would actually fill at.** Everything above values the
       position on its *mark*; a close is a fill and `reducePractice` runs it at
       the last price. Quoting the exit at the mark would print a number the
       button does not produce — the one defect this panel has fixed most
       often, wearing a new hat. */
    const lastLive = Number(panel.props.livePrices && panel.props.livePrices[pos.coin]);
    const fillE4 = lastLive > 0 ? Math.round(lastLive * PRICE_SCALE) : markE4;
    const inverse = pos.settlement === PRACTICE_SETTLEMENT_COIN;
    const amount = (v) => inverse
      ? practiceCoinText(v, pos.coin)
      : practiceMoneyText(v, sym);
    const liq = practiceLiquidationPrice(pos);
    const paused = pos.currency && pos.currency !== currency;
    const pnl = markE4 && !paused ? practiceUnrealised(pos, markE4) : null;
    const ratio = markE4 && !paused ? practiceMarginRatio(pos, markE4) : null;
    const away = liq && markE4 && !paused ? (Math.abs(liq - markE4) / markE4) * 100 : null;
    /* From the model, not from a threshold written here: the toast on the
       chart and this row have to agree about where the line is. */
    const band = markE4 && !paused ? practiceMarginBand(pos, markE4) : null;
    /* Only when it can be quoted: outside its own currency the position is
       not being marked, so there is no price to close it at and a figure here
       would be invented. */
    const quote =
      markE4 && !paused && panel.props.practice
        ? practiceCloseQuote(panel.props.practice, pos.id, fillE4)
        : null;
    /* Adding margin is previewed by the transition that will commit it. That
       keeps the displayed liquidation move, the balance guard and the plan
       wall on the same arithmetic path as the button. */
    const closing = panel.state.pClose === pos.id;
    /* The size the ticket is currently holding, so the row's share chips can
       show which one you are on. Worked out here rather than in the ticket
       because the strip is drawn outside it — and through the same two
       helpers the ticket uses, or the chip would light for a size the ticket
       would not take. */
    const closeQty = closing
      ? practiceCloseSize(
          pos,
          inverse
            ? panel.state.pCloseUnit === "coin"
              ? practiceMoneyForCoin(
                  panel.scaled(panel.state.pCloseDraft, COIN_SCALE, PRACTICE_MAX_COIN_E8),
                  markE4,
                  ROUND_DOWN,
                )
              : panel.scaled(panel.state.pCloseDraft, MONEY_SCALE, MAX_MONEY_E2)
            : panel.state.pCloseUnit === "cash"
              ? practiceQtyForNotional(
                  panel.scaled(panel.state.pCloseDraft, MONEY_SCALE, MAX_MONEY_E2),
                  markE4,
                )
              : panel.scaled(panel.state.pCloseDraft, QTY_SCALE, MAX_QTY_E3),
        )
      : 0;
    const editingMargin = panel.state.pMargin === pos.id;
    const marginAmount = Math.round(
      Number(panel.state.pMarginDraft || 0) * (inverse ? COIN_SCALE : MONEY_SCALE),
    );
    /* **Margin moves both ways.** Adding has been here since the card was;
       taking it back out was never written, which is not a rule the model was
       enforcing — a venue lets you withdraw free margin from an isolated
       position exactly as it lets you post more. One editor, one field, and a
       direction. */
    const marginOut = panel.state.pMarginWay === "out";
    const marginFree = marginOut && panel.props.practice && markE4
      ? practiceRemovableMargin(panel.props.practice, pos.id, markE4)
      : 0;
    const marginProbe =
      editingMargin && marginAmount > 0 && panel.props.practice
        ? marginOut
          ? practiceRemoveMargin(panel.props.practice, pos.id, marginAmount, markE4)
          : practiceAddMargin(panel.props.practice, pos.id, marginAmount)
        : null;
    const marginAfter = marginProbe && marginProbe.state
      ? marginProbe.state.positions[pos.id]
      : null;
    const liqAfter = marginAfter ? practiceLiquidationPrice(marginAfter) : null;
    const marginCap = panel.props.practice
      ? practiceMarginWall(
          panel.props.practice.plan,
          inverse
            ? practiceWallet(panel.props.practice, pos.coin).startBalance
            : panel.props.practice.startBalance,
        )
      : pos.margin;
    const marginRoom = panel.props.practice
      ? Math.max(
          0,
          Math.min(
            marginCap - pos.margin,
            practiceFreeBalance(panel.props.practice, pos.coin),
          ),
        )
      : 0;
    return React.createElement(
      headless ? AlertPosContractDetail : AlertPosCard,
      /* **Keyed by the contract, not by its market.** A coin names as many
         cards as the balance allows now, so `key: pos.coin` handed React
         duplicate keys — it keeps the first and reconciles the rest onto the
         wrong card, which is how an open row folds itself when a neighbour
         closes. */
      { key: pos.id, "data-practice-contract": pos.id },
      headless ? null : React.createElement(
        AlertPosCardTop,
        {
          /* **The row says how close it is by how much of it is shaded.** The
             inverse of the cover ratio, so a contract at its edge is a full
             row and a comfortable one is a sliver; nothing at all beyond five
             times the requirement — see the fill on `AlertPosCardTop`. */
          risk: ratio != null && ratio < 5 ? Math.min(100, (1 / ratio) * 100) : 0,
          /* No `aria-label`: the row's own text — "BTC Long 2x, +12.48" — is
             the name, and `aria-expanded` is what says there is something
             behind it. A label here would have replaced the live figure in
             the name with a fixed sentence. */
          "aria-expanded": open ? "true" : "false",
          onClick: () =>
            panel.setState((prev) => ({
              pOpen: (prev.pOpen == null ? null : prev.pOpen) === pos.id ? "" : pos.id,
              /* A row folded away with its level editor open would come back
                 open on whatever was half-typed into it. */
              pEdit: prev.pEdit === pos.id ? null : prev.pEdit,
              pMargin: prev.pMargin === pos.id ? null : prev.pMargin,
              pClose: prev.pClose === pos.id ? null : prev.pClose,
              pChartWhy: null,
            })),
        },
        React.createElement(
          AlertPosCoin,
          null,
          React.createElement(
            AlertPosNumber,
            { "aria-hidden": "true" },
            `#${index || 1}`,
          ),
          `${pos.coin} ${pos.side === "short" ? msg("pos_short", "Short") : msg("pos_long", "Long")} ${pos.leverage}x`,
        ),
        /* **Where you got in and where it ends, on the shut row.** They were
           inside the reveal, so comparing three contracts cost three unfolds
           — and they are the two columns a venue's position table is read
           across. Absent while the row is paused: outside its own currency
           there is no live distance to quote. */
        paused
          ? null
          : React.createElement(
              AlertPosHeadFacts,
              null,
              /* **Three cells, not two sentences.** They were "entry $1" and
                 "liq $1 · $2%" laid out by flex, so the figures started at a
                 different x on every row — the one thing a position table
                 exists to make comparable was the one thing that did not line
                 up. Each fact has a column of its own now, measured in `ch`
                 off this element's own size: the face is monospace, so a
                 column counted in characters is exact and the rows agree down
                 the whole list. */
              /* **What it is worth right now, on the shut row.** Asked for
                 directly: *"açtığımız pozisyonun anlık fiyatını bilebilmem
                 gerekiyor"* — and it was true that the only way to see the
                 market's price was to unfold the contract. It is the mark
                 rather than the last print, because that is what this row's
                 result, its distance and its liquidation are all computed
                 from; the two are the same number except when a single tick
                 has run away from the others, and the open card prints both. */
              React.createElement(
                "span",
                null,
                markE4
                  ? msg("pos_fact_now", "now $1", practicePriceText(markE4, sym))
                  : "",
              ),
              React.createElement(
                "span",
                null,
                msg("pos_fact_entry", "entry $1", practicePriceText(pos.entry, sym)),
              ),
              /* **The distance rides with the level, in one cell.** Three
                 prices, a distance and a result do not fit across this card
                 without one of them overlapping another — measured: the head
                 wanted 738px inside 688. The distance is the one figure here
                 that is *derivable* from the two either side of it, and the
                 open card states it again anyway, so it gives up its column
                 and keeps its place. */
              React.createElement(
                "span",
                null,
                liq
                  ? away == null
                    ? msg("pos_fact_liq", "liq $1", practicePriceText(liq, sym))
                    : msg(
                        "pos_fact_liq_away",
                        "liq $1 · $2%",
                        practicePriceText(liq, sym),
                        away.toFixed(1),
                      )
                  : msg("pos_liq_none", "none at 1x"),
              ),
            ),
        React.createElement(
          AlertPosCardRight,
          null,
          React.createElement(
            AlertPosValue,
            { tone: pnl == null ? null : pnl > 0 ? "up" : pnl < 0 ? "down" : null },
            pnl == null
              ? msg("pos_paused", "paused")
              : `${pnl >= 0 ? "+" : ""}${amount(pnl)}`,
          ),
          /* **The same result as a share of what it was risked against.**
             The money alone cannot be read without knowing the margin behind
             it — `+40.00` is a rounding error on one position and a doubling
             on another — and margin is exactly what leverage changes, which
             is the whole subject of this screen. So the percentage is against
             the **margin**, not the notional: it answers "what has this done
             to the money I committed", which is the question, and at 37x the
             notional figure would be the same move divided by 37 and read as
             nothing happening.

             Absent rather than zero when there is no margin to divide by, and
             absent while the position is paused — a percentage of a P/L the
             panel is refusing to state would be a number invented to fill a
             slot. */
          pnl != null && pos.margin > 0
            ? React.createElement(
                AlertPosRoe,
                { tone: pnl > 0 ? "up" : pnl < 0 ? "down" : null },
                `${signedFixed((pnl / pos.margin) * 100, 1)}%`,
              )
            : null,
          React.createElement(
            AlertPosChevron,
            { open, "aria-hidden": "true" },
            icon("chevron", 0.8),
          ),
        ),
      ),
      band === "warn" || band === "danger"
        ? React.createElement(
            AlertPosAlarm,
            { danger: band === "danger" },
            React.createElement(
              "span",
              null,
              band === "danger"
                ? msg("pos_alarm_danger", "About to be liquidated")
                : msg("pos_alarm_warn", "Close to liquidation"),
            ),
            /* The level and the distance to it, because "close" on its own is
               a mood. Quiet ink: how urgent and how far are two facts. */
            React.createElement(
              AlertPosAlarmWhere,
              null,
              away == null
                ? msg("pos_alarm_at", "at $1", practicePriceText(liq, sym))
                : msg(
                    "pos_alarm_at_away",
                    "at $1 · $2% away",
                    practicePriceText(liq, sym),
                    away.toFixed(1),
                  ),
            ),
            /* The way out of it, said rather than left to be worked out.
               Its own separator, because the three parts are one sentence on
               a wrapping line and ran together as "0.2% away close some". */
            React.createElement(
              AlertPosAlarmWhere,
              null,
              msg("pos_alarm_do", "· close some, or add margin"),
            ),
          )
        : null,
      /* **Outside the reveal, deliberately.** See `AlertPosQuick` — with the
         accordion this was the difference between three running contracts and
         one you could act on. Absent while the position is paused, because
         outside its own currency there is no price to close it at. */
      paused
        ? null
        : React.createElement(
            AlertPosQuick,
            null,
            React.createElement(
              AlertPosQuickKey,
              null,
              msg("pos_close_open", "Close"),
            ),
            ...[
              [0.25, "25%"],
              [0.5, "50%"],
              [0.75, "75%"],
              [1, msg("pos_close_all", "All")],
            ].map(([share, label]) =>
              React.createElement(
                AlertPosChip,
                {
                  key: label,
                  active: closing && practiceCloseShare(pos, share) === closeQty,
                  "aria-label": msg(
                    "pos_close_share",
                    "Close $1 of the $2 position",
                    label,
                    pos.coin,
                  ),
                  onClick: () => panel.openClose(pos, share),
                },
                label,
              ),
            ),
            /* The way to a size that is not a quarter of anything. It opens
               the same ticket on the same amount the row is already showing,
               so pressing it never changes what would be closed. */
            React.createElement(
              AlertPosChip,
              {
                active: closing,
                "aria-expanded": closing,
                "aria-label": msg(
                  "pos_close_open_aria",
                  "Close some or all of the $1 position",
                  pos.coin,
                ),
                onClick: () =>
                  closing
                    ? panel.setState({ pClose: null })
                    : panel.openClose(pos, 1),
              },
              msg("pos_close_custom", "Amount…"),
            ),
          ),
      React.createElement(
        AlertPosReveal,
        { open },
        React.createElement(
          AlertPosCardBody,
          null,
          /* **The two halves of one reading, side by side.** What ending
             the contract would pay, and where the contract stands — a pair,
             not a flow, and neither of them grows without bound. Stacked,
             they made an open card taller than a panel holding three
             contracts could show without scrolling. */
          React.createElement(
            AlertPosStudy,
            null,
            /* **What you went in with, and what you would walk away with.**
             *
             * The row said what the position is worth and not what taking it would
             * pay — different numbers, because closing crosses the spread the wrong
             * way and pays a fee. Somebody reading "+12.48" and banking "11.90" has
             * been told something that was not quite true. Both are here now, and
             * the second is quoted by *running* the close (`practiceCloseQuote`) so
             * the figure on the row is the figure the button produces. */
            quote
              ? React.createElement(
                  AlertPosSettle,
                  null,
                  React.createElement(
                    AlertPosSettleRow,
                    null,
                    React.createElement(AlertPosKey, null, msg("pos_in_with", "In with")),
                    React.createElement(
                      "span",
                      null,
                      /* **The notional left this line and became a reading.**
                         Three facts in one right-aligned value wrapped
                         between the figure and its own unit — "$899.84 /
                         notional" — in half a card. How big the contract is
                         is a reading like the mark and the break-even, and
                         the grid beside this block had a cell free for it. */
                      msg(
                        "pos_in_with_v",
                        "$1 margin at $2x",
                        amount(quote.margin),
                        String(pos.leverage),
                      ),
                    ),
                  ),
                  React.createElement(
                    AlertPosSettleRow,
                    null,
                    React.createElement(AlertPosKey, null, msg("pos_close_now", "Close now")),
                    React.createElement(
                      AlertPosValue,
                      { tone: quote.realised > 0 ? "up" : quote.realised < 0 ? "down" : null },
                      /* One argument for the signed amount, not two adjacent
                         placeholders: Chrome reads `$1$` in `"$1$2"` as a named
                         placeholder and refuses the whole manifest. */
                      msg(
                        "pos_close_now_v",
                        "$1 after the $2 fee",
                        `${quote.realised >= 0 ? "+" : "-"}${amount(Math.abs(quote.realised))}`,
                        amount(quote.fee),
                      ),
                    ),
                  ),
                  React.createElement(
                    AlertPosSettleRow,
                    null,
                    React.createElement(AlertPosKey, null, msg("pos_balance_after", "Balance becomes")),
                    React.createElement(
                      AlertPosSettleBalance,
                      null,
                      amount(quote.balanceAfter),
                    ),
                  ),
                )
              : null,
            /* **The five readings the card never gave.**
             *
             * `entry / liq / cover` said what the contract *is*; none of them
             * said what it is being measured against, where it stops costing
             * money, what you told it to do, what it has quietly paid, or how
             * long it has been running. Each is absent rather than blank when
             * there is no answer — a mark needs a live price, a break-even needs
             * a crossing inside the bracket, and a position saved before the
             * open time was recorded has no age to give. */
            React.createElement(
              AlertPosDetail,
              { "data-practice-detail": "true" },
              ...[
                [
                  msg("pos_detail_mark", "Mark"),
                  markE4 ? practicePriceText(markE4, sym) : null,
                ],
                [
                  /* **Only when it differs**, which is the only time it says
                     anything. A median of three ticks equals the last price
                     most of the time; when it does not, one print has run away
                     from the other two and this row is the difference between
                     "the market moved" and "a tick did". Pro's, like every
                     other cell in venue vocabulary. */
                  msg("pos_detail_last", "Last"),
                  markE4 && fillE4 && fillE4 !== markE4
                    ? practicePriceText(fillE4, sym)
                    : null,
                ],
                [
                  msg("pos_impact_notional", "Notional"),
                  /* The one cell here written in venue vocabulary rather than
                     in money you can act on: what the contract *controls*, as
                     opposed to what it cost and what closing pays. */
                  markE4
                    ? practiceMoneyText(practiceNotionalAt(pos, markE4), sym)
                    : null,
                ],
                [
                  msg("pos_detail_even", "Break-even"),
                  (() => {
                    const even = practiceBreakEven(panel.props.practice, pos.id);
                    return even ? practicePriceText(even, sym) : null;
                  })(),
                ],
                [
                  msg("pos_stop", "Stop"),
                  pos.stop ? practicePriceText(pos.stop, sym) : null,
                ],
                [
                  msg("pos_take", "Take profit"),
                  /* With a share, the level alone is only half the order — a
                     take at 110,000 that closes a quarter is a different
                     instruction from one that closes the lot. */
                  pos.take
                    ? pos.takeShare && pos.takeShare < 1000000
                      ? msg(
                          "pos_take_of",
                          "$1 · $2",
                          practicePriceText(pos.take, sym),
                          pos.takeShare === 250000
                            ? msg("pos_take_quarter", "a quarter")
                            : msg("pos_take_half", "half"),
                        )
                      : practicePriceText(pos.take, sym)
                    : null,
                ],
                [
                  /* **Where the trail has got to.** A trail with no level on
                     the card is a control you press and then cannot see the
                     effect of — the number moves on its own, which is the
                     entire point, and a cell that moves is how you watch it.
                     Absent until one is set, like every other cell here. */
                  msg("pos_detail_trail", "Trail"),
                  (() => {
                    const at = practiceTrailStop(pos);
                    if (!at) return null;
                    return msg(
                      "pos_trail_at_cell",
                      "$1 · $2",
                      practicePriceText(at, sym),
                      `${(pos.trail / 10000).toFixed(pos.trail % 10000 ? 2 : 0)}%`,
                    );
                  })(),
                ],
                [
                  msg("pos_detail_funding", "Funding paid"),
                  (() => {
                    const paid = practiceFundingPaid(panel.props.practice, pos.id);
                    if (!paid) return null;
                    return inverse
                      ? practiceCoinText(paid, pos.coin)
                      : practiceMoneyText(paid, sym);
                  })(),
                ],
                [
                  /* **The cover, among the other readings.** It stood alone
                     under a rule of its own — one line between a block and
                     three buttons, which is what an orphan looks like. It is a
                     reading like the rest, and the only one that needs its
                     ring beside it, so the label is an element rather than a
                     string (see the key note below). */
                  ratio == null
                    ? msg("pos_detail_cover", "Cover")
                    : React.createElement(
                        AlertPosImpactLabel,
                        null,
                        msg("pos_detail_cover", "Cover"),
                        React.createElement(
                          AlertPosWhat,
                          {
                            open: panel.state.pWhat === "cover",
                            "aria-expanded": panel.state.pWhat === "cover",
                            "aria-label": msg("what_cov_aria", "What cover is, on this contract"),
                            onClick: (e) => {
                              e.stopPropagation();
                              panel.setState((q) => ({ pWhat: q.pWhat === "cover" ? null : "cover" }));
                            },
                          },
                          "?",
                        ),
                      ),
                  ratio == null
                    ? null
                    : ratio > 99
                      ? "99+x"
                      : `${ratio.toFixed(2)}x`,
                ],
                [
                  msg("pos_detail_held", "Held for"),
                  /* `newsAge` takes the *moment*, not the elapsed time, and it
                     is the app's own short form — "14m", "3h", "2d". A contract
                     held for under a minute and a half reads "now", which is
                     what somebody who just opened one would say. */
                  pos.openedAt > 0 ? newsAge(pos.openedAt) || null : null,
                ],
              ]
                .filter(([, value]) => value != null)
                /* **Keyed by position, not by the label.** One of these labels
                   is an element now — the cover carries its own ring — and an
                   element is a key React cannot compare, which is the same
                   trap the impact grid documents. */
                .map(([label, value], i) =>
                  React.createElement(
                    AlertPosDetailCell,
                    { key: i },
                    React.createElement("span", null, label),
                    React.createElement("strong", null, value),
                  ),
                ),
            ),
          ),
          /* **Only a paused row has anything left to say here.**
             Entry and the liquidation level are in the head, where they are
             readable without unfolding; the cover joined the readings above.
             A paused row draws no head facts — outside its own currency there
             is no live distance — so its entry is drawn here, and when there
             is nothing to draw the strip is *absent* rather than an empty rule
             above the buttons. */
          paused
            ? React.createElement(
                AlertPosCardFacts,
                null,
                React.createElement(
                  "span",
                  null,
                  msg("pos_fact_entry", "entry $1", practicePriceText(pos.entry, sym)),
                ),
              )
            : null,
          panel.state.pWhat === "cover" && ratio != null
            ? panel.renderPracticeWhat("cover", {
                coverText: ratio > 99 ? "99+x" : `${ratio.toFixed(2)}x`,
                warnText: `${PRACTICE_WARN_RATIO}x`,
                dangerText: `${PRACTICE_DANGER_RATIO}x`,
              })
            : null,
          /* What is left in here is what you *study* a position with — its
             levels and its margin. The way out moved up to the row's own
             strip, outside the accordion, because it is the one thing you
             reach for in a hurry and it has to be there whether or not this
             row happens to be the open one. */
          /* **The cone**: this contract's next hour, resampled from the
             window on screen and stepped through the model — counts of what
             touched first, never a probability of profit. Only on the market
             the chart is drawing, because the window is the chart's. */
          !paused && markE4 && pos.coin === panel.props.activeCoin
            ? panel.renderOutcomeCone(pos, markE4)
            : null,
          paused
            ? React.createElement(
                AlertPosNote,
                null,
                msg(
                  "pos_paused_usdt",
                  "Opened in $1 before this account became USDT, so there is no price here to mark it or close it at. Starting a new account on the Account tab clears it.",
                  pos.currency,
                ),
              )
            : React.createElement(
                AlertPosActions,
                null,
                typeof panel.props.onPracticeFocus === "function"
                  ? React.createElement(
                      AlertPosClose,
                      {
                        onClick: () => {
                          const why = panel.props.onPracticeFocus(pos.coin);
                          if (why) panel.setState({ pChartWhy: why });
                        },
                      },
                      msg("po_explore", "Explore chart"),
                    )
                  : null,
                React.createElement(
                  AlertPosClose,
                  {
                    "aria-expanded": panel.state.pEdit === pos.id,
                    "aria-label": msg("pos_edit_aria", "Change the stop, take-profit and trail"),
                    onClick: () =>
                      panel.setState((prev) => ({
                        pEdit: prev.pEdit === pos.id ? null : pos.id,
                        pMargin: null,
                        pClose: null,
                        pEditStop:
                          pos.stop > 0 ? String(pos.stop / PRICE_SCALE) : "",
                        pEditTake:
                          pos.take > 0 ? String(pos.take / PRICE_SCALE) : "",
                        /* The share and the trail are read off the contract
                           the way the two prices are: an editor that opens
                           showing defaults instead of what is set is an
                           editor that changes things by being opened. */
                        pEditShare: pos.takeShare || 1000000,
                        pEditTrail: pos.trail || 0,
                        pEditWhy: null,
                      })),
                  },
                  msg("pos_edit", "Stop / TP"),
                ),
                React.createElement(
                  AlertPosClose,
                  {
                    "aria-expanded": editingMargin,
                    onClick: () =>
                      panel.setState((prev) => ({
                        pMargin: prev.pMargin === pos.id ? null : pos.id,
                        pMarginDraft: "",
                        pEdit: null,
                        pClose: null,
                      })),
                  },
                  msg("pos_margin_edit", "Margin"),
                ),
                /* **P6 — reverse**, two presses: it closes this contract at
                   the market and opens the other side at the same size, and
                   neither half can be taken back. */
                React.createElement(
                  AlertPosClose,
                  {
                    "data-practice-reverse": pos.id,
                    strong: panel.state.pRevArm === pos.id,
                    onClick: () => {
                      if (panel.state.pRevArm !== pos.id) {
                        panel.setState({ pRevArm: pos.id, pRevWhy: null });
                        return;
                      }
                      const why = panel.props.onPracticeReverse && panel.props.onPracticeReverse(pos.id);
                      panel.setState({ pRevArm: null, pRevWhy: why || null, pOpen: null });
                    },
                  },
                  panel.state.pRevArm === pos.id
                    ? msg("pos_reverse_sure", "Press again to reverse")
                    : msg("pos_reverse", "Reverse"),
                ),
              ),
          panel.state.pRevWhy && panel.state.pRevArm == null && open
            ? React.createElement(
                AlertPosNote,
                null,
                msg("pos_reverse_refused", "Not reversed — $1.", panel.refusalText(panel.state.pRevWhy, panel.props.practice)),
              )
            : null,
          panel.state.pChartWhy
            ? React.createElement(
                AlertPosNote,
                null,
                panel.state.pChartWhy === "limit"
                  ? msg("set_max_coins", "Max $1 coins reached", MAX_COINS)
                  : msg("pos_no_position", "there is no position on that coin any more"),
              )
            : null,
          closing && !paused
            ? panel.renderClosePanel(pos, markE4, sym)
            : null,
          editingMargin && !paused
            ? React.createElement(
                AlertPosEdit,
                null,
                /* The direction, above the field it changes the meaning of.
                   Switching it clears the draft: the two are answers to
                   different questions and a figure typed for one is not an
                   answer to the other. */
                React.createElement(
                  AlertPosChips,
                  null,
                  ...[
                    ["add", msg("pos_margin_in", "Add")],
                    ["out", msg("pos_margin_out", "Take out")],
                  ].map(([way, label]) =>
                    React.createElement(
                      AlertPosChip,
                      {
                        key: way,
                        active: (way === "out") === marginOut,
                        "aria-pressed": (way === "out") === marginOut ? "true" : "false",
                        onClick: () =>
                          panel.setState({ pMarginWay: way, pMarginDraft: "" }),
                      },
                      label,
                    ),
                  ),
                ),
                React.createElement(
                  AlertPosFields,
                  null,
                  React.createElement(
                    AlertPosField,
                    null,
                    marginOut
                      ? msg("pos_margin_out_label", "Take margin out")
                      : msg("pos_add_margin", "Add margin"),
                    React.createElement(AlertPosInput, {
                      type: "text",
                      inputMode: "decimal",
                      value: panel.state.pMarginDraft || "",
                      placeholder: amount(marginOut ? marginFree : marginRoom),
                      "aria-label": marginOut
                        ? msg("pos_margin_out_label", "Take margin out")
                        : msg("pos_add_margin", "Add margin"),
                      "aria-invalid":
                        panel.state.numWarn === "pMarginDraft" ||
                        Boolean(marginProbe && marginProbe.error)
                          ? "true"
                          : "false",
                      onChange: (e) => panel.numberField("pMarginDraft", e.target.value),
                    }),
                  ),
                ),
                panel.numberWarning("pMarginDraft")
                  ? React.createElement(AlertPosNote, null, panel.numberWarning("pMarginDraft"))
                  : marginProbe && marginProbe.error
                    ? React.createElement(
                        AlertPosNote,
                        null,
                        msg(
                          "pos_edit_refused",
                          "Not saved — $1.",
                          panel.refusalText(marginProbe.error),
                        ),
                      )
                    : marginAfter
                      ? React.createElement(
                          AlertPosNote,
                          null,
                          msg(
                            "pos_add_margin_preview",
                            "Margin $1 → $2 · liquidation $3 → $4",
                            amount(pos.margin),
                            amount(marginAfter.margin),
                            liq ? practicePriceText(liq, sym) : msg("pos_none", "none"),
                            liqAfter
                              ? practicePriceText(liqAfter, sym)
                              : msg("pos_none", "none"),
                          ),
                        )
                      : React.createElement(
                          AlertPosNote,
                          null,
                          marginOut
                            ? /* **The most that may be taken, said rather than
                                 left to be discovered by refusal.** Bisected
                                 on the same predicate the withdrawal is
                                 refused by, so the figure and the rule cannot
                                 disagree. Zero is a real answer: a contract
                                 already near its edge has no free margin
                                 behind it. */
                              marginFree > 0
                                ? msg(
                                    "pos_margin_out_hint",
                                    "Enter an amount to preview the liquidation move · up to $1, which is what leaves this contract clear of its edge.",
                                    amount(marginFree),
                                  )
                                : msg(
                                    "pos_margin_out_none",
                                    "There is no free margin behind this contract — it is already close enough to its liquidation that taking any out would put it there.",
                                  )
                            : msg(
                                "pos_add_margin_hint",
                                "Enter an amount to preview the liquidation move · up to $1.",
                                amount(marginRoom),
                              ),
                        ),
                React.createElement(
                  AlertPosButton,
                  {
                    disabled: !marginAfter,
                    onClick: () => {
                      const why = marginOut
                        ? panel.props.onPracticeMarginOut
                          && panel.props.onPracticeMarginOut(pos.id, marginAmount, markE4)
                        : panel.props.onPracticeMargin
                          && panel.props.onPracticeMargin(pos.id, marginAmount);
                      if (!why) panel.setState({ pMargin: null, pMarginDraft: "" });
                    },
                  },
                  marginOut
                    ? msg("pos_margin_out_label", "Take margin out")
                    : msg("pos_add_margin", "Add margin"),
                ),
              )
            : null,
          /* **A stop is not a thing you set once.** `practiceSetTriggers` was in
             the model from the first day and nothing called it: a position was
             opened with its levels and neither could ever be moved again, which
             is the control a venue is used through more than any other — moving
             a stop up behind a winner is most of what managing one is. The model
             refuses a level on the wrong side of the entry, so this hands the
             refusal straight back rather than inventing the rule a second time. */
          panel.state.pEdit === pos.id && !paused
            ? React.createElement(
                AlertPosEdit,
                null,
                React.createElement(
                  AlertPosFields,
                  null,
                  React.createElement(
                    AlertPosField,
                    null,
                    msg("pos_stop", "Stop"),
                    React.createElement(AlertPosInput, {
                      type: "text",
                      inputMode: "decimal",
                      value: panel.state.pEditStop || "",
                      placeholder: msg("pos_none", "none"),
                      "aria-label": msg("pos_stop_aria", "Stop price"),
                      "aria-invalid": panel.state.numWarn === "pEditStop" ? "true" : "false",
                      onChange: (e) => panel.numberField("pEditStop", e.target.value),
                    }),
                  ),
                  React.createElement(
                    AlertPosField,
                    null,
                    msg("pos_take", "Take profit"),
                    React.createElement(AlertPosInput, {
                      type: "text",
                      inputMode: "decimal",
                      value: panel.state.pEditTake || "",
                      placeholder: msg("pos_none", "none"),
                      "aria-label": msg("pos_take_aria", "Take-profit price"),
                      "aria-invalid": panel.state.numWarn === "pEditTake" ? "true" : "false",
                      onChange: (e) => panel.numberField("pEditTake", e.target.value),
                    }),
                  ),
                ),
                /* **How much of it the take closes.** Scaling out — "take half
                   off here and let the rest run" — had no expression at all:
                   the take-profit closed everything, so the technique could be
                   described but not practised. Three shares, because they are
                   the three a person says out loud; a typed share would be a
                   fourth number on a row that carries three.
                   Only drawn with a take-profit in the box: a share of nothing
                   is a control with no subject. */
                (panel.state.pEditTake || "").trim()
                  ? React.createElement(
                      AlertPosStep,
                      { key: "share" },
                      React.createElement(
                        AlertPosStepHead,
                        null,
                        React.createElement("span", null, msg("pos_take_share", "It closes")),
                      ),
                      React.createElement(
                        AlertPosChips,
                        { "data-practice-take-share": "true" },
                        ...[
                          [250000, msg("pos_take_quarter", "a quarter")],
                          [500000, msg("pos_take_half", "half")],
                          [1000000, msg("pos_take_all", "all of it")],
                        ].map(([ppm, label]) => {
                          const active = (panel.state.pEditShare || 1000000) === ppm;
                          return React.createElement(
                            AlertPosChip,
                            {
                              key: ppm,
                              active,
                              "aria-pressed": active,
                              onClick: () => panel.setState({ pEditShare: ppm }),
                            },
                            label,
                          );
                        }),
                      ),
                    )
                  : null,
                /* **The trailing stop — a stop that follows.**
                 *
                 * The other half of scaling out, and the half the model could
                 * not express: a stop is a line drawn once, and most of what
                 * managing a winner means is moving it up behind the price.
                 * Four distances, off first, because off is where every
                 * contract starts and the control has to say so.
                 *
                 * **It follows from where the price is when you set it**, not
                 * from the best price since the contract opened — the model
                 * seeds its anchor on the next step, and the line under the
                 * chips says which of the two it is, since that difference is
                 * the whole behaviour. */
                React.createElement(
                  AlertPosStep,
                  { key: "trail" },
                  React.createElement(
                    AlertPosStepHead,
                    null,
                    React.createElement("span", null, msg("pos_trail", "Trailing stop")),
                  ),
                  React.createElement(
                    AlertPosChips,
                    { "data-practice-trail": "true" },
                    ...[
                      [0, msg("pos_trail_off", "off")],
                      [10000, "1%"],
                      [20000, "2%"],
                      [50000, "5%"],
                      [100000, "10%"],
                    ].map(([ppm, label]) => {
                      const active = (panel.state.pEditTrail || 0) === ppm;
                      return React.createElement(
                        AlertPosChip,
                        {
                          key: `t-${ppm}`,
                          active,
                          "aria-pressed": active,
                          "aria-label": ppm
                            ? msg("pos_trail_aria", "Trail $1 behind the best price", label)
                            : msg("pos_trail_off_aria", "No trailing stop"),
                          onClick: () => panel.setState({ pEditTrail: ppm }),
                        },
                        label,
                      );
                    }),
                  ),
                  React.createElement(
                    AlertPosNote,
                    { "data-practice-trail-note": "true" },
                    (() => {
                      const at = practiceTrailStop(pos);
                      if (at) {
                        return msg(
                          "pos_trail_at",
                          "Following $1 behind. It closes at $2 unless the price goes further your way.",
                          `${(pos.trail / 10000).toFixed(pos.trail % 10000 ? 2 : 0)}%`,
                          practicePriceText(at, sym),
                        );
                      }
                      return msg(
                        "pos_trail_hint",
                        "A stop that follows the best price and never moves back. It starts from the price when you save it, not from the best this contract has seen.",
                      );
                    })(),
                  ),
                ),
                panel.numberWarning("pEditStop", "pEditTake")
                  ? React.createElement(
                      AlertPosNote,
                      null,
                      panel.numberWarning("pEditStop", "pEditTake"),
                    )
                  : panel.state.pEditWhy
                  ? React.createElement(
                      AlertPosNote,
                      null,
                      msg("pos_edit_refused", "Not saved — $1.", panel.refusalText(panel.state.pEditWhy)),
                    )
                  : React.createElement(
                      AlertPosNote,
                      null,
                      msg(
                        "pos_edit_hint",
                        "An empty box is no order. Entry $1.",
                        practicePriceText(pos.entry, sym),
                      ),
                    ),
                React.createElement(
                  AlertPosButton,
                  {
                    onClick: () => {
                      const num = (v) =>
                        v && Number(v) > 0 ? Math.round(Number(v) * PRICE_SCALE) : null;
                      const why =
                        panel.props.onPracticeTriggers &&
                        panel.props.onPracticeTriggers(
                          pos.id,
                          num(panel.state.pEditStop),
                          num(panel.state.pEditTake),
                          panel.state.pEditShare || 1000000,
                          /* `0` is the model's "take it off"; `undefined`
                             would mean "leave it", which is not what an
                             editor showing `off` as pressed says. */
                          panel.state.pEditTrail || 0,
                        );
                      panel.setState(
                        why
                          ? { pEditWhy: why }
                          : { pEdit: null, pEditWhy: null, pEditShare: null, pEditTrail: 0 },
                      );
                    },
                  },
                  msg("pos_edit_save", "Save levels"),
                ),
              )
            : null,
        ),
      ),
    );
  },

  /* Open the close ticket on a position, pre-filled at a share of it.
   *
   * Shared by the always-visible strip on the row and by the chips inside the
   * ticket, so a quarter means the same size from either — and it opens the
   * row as well, because the strip is reachable while the row is shut and a
   * ticket drawn inside a collapsed reveal is a ticket nobody can fill in. */
  openClose: (pos, share) => {
    const qty = practiceCloseShare(pos, share);
    const inverse = pos.settlement === PRACTICE_SETTLEMENT_COIN;
    panel.setState({
      pOpen: pos.id,
      pClose: pos.id,
      pCloseUnit: inverse ? "cash" : "coin",
      pCloseDraft: inverse ? String(qty / MONEY_SCALE) : practiceQtyText(qty),
      pCloseWhy: null,
      pEdit: null,
      pMargin: null,
    });
  },

  /* **THE CLOSE TICKET — taking a position off in the piece you chose.**
   *
   * The row offered 25%, 50% and All, fired on the press with no figure and
   * no confirmation. Three fractions cannot say "take 0.35 off", which is
   * what managing a position actually consists of, and the one irreversible
   * control on the screen was the one you could hit by accident.
   *
   * What a venue's close ticket does, and what this does:
   *
   *   · **the size is typed**, in the coin *or* in money — the "order by
   *     value" half is not a luxury, it is how anyone thinks about taking
   *     500 off the table rather than 0.0115 of something;
   *   · the percentages survive as **shortcuts that fill the same field**,
   *     so a chip and a typed amount cannot be sized differently;
   *   · everything is quoted **for that exact size** before you commit — the
   *     fill (which is not the mark, because a close crosses the spread the
   *     wrong way), the fee, what lands, and what the balance becomes;
   *   · and, the half a percentage cannot show, **what is left standing**:
   *     the remaining size, its margin, its unrealised result and its new
   *     liquidation. Reducing a position is a decision about the position you
   *     keep, and no fraction on a button says anything about that one.
   *
   * Every figure comes from `practiceCloseQuote`, which produces them by
   * *running* the close — so the ticket cannot quote a number the button will
   * not take. The whole-lot and no-stub rules live in `practiceCloseSize` for
   * the same reason, and the ticket says so out loud when the stub rule turns
   * a partial close into a full one.
   */
  renderClosePanel: (pos, markE4, sym) => {
    const st = panel.state;
    /* The same split as the row: the figures here are all "what closing pays",
       so they are quoted at the price the close fills at rather than at the
       mark the position is valued on. */
    const lastLive = Number(panel.props.livePrices && panel.props.livePrices[pos.coin]);
    const fillE4 = lastLive > 0 ? Math.round(lastLive * PRICE_SCALE) : markE4;
    const inverse = pos.settlement === PRACTICE_SETTLEMENT_COIN;
    const unit = st.pCloseUnit === "cash" ? "cash" : "coin";
    const typed = Number(st.pCloseDraft);
    const draft = isFinite(typed) && typed > 0 ? typed : 0;
    /* The typed amount, turned into a quantity. In money that conversion is
       the arithmetic contract's, not this screen's — `practiceQtyForNotional`
       rounds down, so asking to take 500.00 off never takes 500.02. */
    /* **A typed number is clamped to the model's own range before it is
       converted, not after.** `999999999` in the coin box scales to 1e17,
       past `Number.MAX_SAFE_INTEGER`, and `practiceMoneyForCoin` threw on it —
       out of a render, taking the panel with it. Found by
       `scripts/audit-futures.js`. Nothing is lost by clamping: the close is
       already clamped to the position by `practiceCloseSize`, so a number
       larger than the position could ever be means "all of it" either way. */
    const wanted = inverse
      ? unit === "cash"
        ? panel.scaled(draft, MONEY_SCALE, MAX_MONEY_E2)
        : practiceMoneyForCoin(
            panel.scaled(draft, COIN_SCALE, PRACTICE_MAX_COIN_E8), fillE4, ROUND_DOWN)
      : unit === "cash"
        ? practiceQtyForNotional(panel.scaled(draft, MONEY_SCALE, MAX_MONEY_E2), fillE4)
        : panel.scaled(draft, QTY_SCALE, MAX_QTY_E3);
    const quote =
      wanted > 0 && panel.props.practice
        ? practiceCloseQuote(panel.props.practice, pos.id, fillE4, wanted)
        : null;
    /* Asked for less than a lot, or for nothing at all. Said rather than left
       as a dead button: the amount is the only thing on the ticket and a
       control that refuses in silence is the bug this panel keeps fixing. */
    const tooSmall = draft > 0 && !quote;
    const money = (v) => inverse
      ? practiceCoinText(v, pos.coin)
      : practiceMoneyText(v, sym);
    const price = (v) => practicePriceText(v, sym);
    const fill = (share) => panel.openClose(pos, share);
    return React.createElement(
      AlertPosCloseForm,
      null,
      React.createElement(
        AlertPosChips,
        null,
        ...[
          [0.25, "25%"],
          [0.5, "50%"],
          [0.75, "75%"],
          [1, msg("pos_close_all", "All")],
        ].map(([share, label]) =>
          React.createElement(
            AlertPosChip,
            {
              key: label,
              active: Boolean(quote) && practiceCloseShare(pos, share) === quote.qty,
              "aria-label": msg(
                "pos_close_share",
                "Close $1 of the $2 position",
                label,
                pos.coin,
              ),
              onClick: () => fill(share),
            },
            label,
          ),
        ),
      ),
      React.createElement(
        AlertPosAmountField,
        null,
        React.createElement(AlertPosAmount, {
          type: "text",
          inputMode: "decimal",
          value: st.pCloseDraft === undefined ? "" : st.pCloseDraft,
          placeholder: msg("pos_close_amount", "how much to close"),
          "aria-label": msg("pos_close_amount_aria", "Amount of $1 to close", pos.coin),
          "aria-invalid": st.numWarn === "pCloseDraft" ? "true" : "false",
          onChange: (e) => panel.numberField("pCloseDraft", e.target.value),
        }),
        /* **The unit is part of the field, and switching it converts.** A
           toggle that only relabelled the box would leave `0.5` meaning half
           a coin one moment and fifty cents the next, which is the shape of
           an order somebody did not mean to place. */
        React.createElement(
          AlertPosUnits,
          null,
          ...[
            ["coin", pos.coin],
            ["cash", sym],
          ].map(([v, label]) =>
            React.createElement(
              AlertPosUnit,
              {
                key: v,
                active: unit === v,
                "aria-pressed": unit === v,
                "aria-label": msg("pos_close_unit", "Type the amount in $1", label),
                onClick: () => {
                  if (unit === v) return;
                  const qty = inverse
                    ? unit === "cash"
                      ? panel.scaled(draft, MONEY_SCALE, MAX_MONEY_E2)
                      : practiceMoneyForCoin(
                          panel.scaled(draft, COIN_SCALE, PRACTICE_MAX_COIN_E8),
                          markE4,
                          ROUND_DOWN,
                        )
                    : unit === "cash"
                      ? practiceQtyForNotional(
                          panel.scaled(draft, MONEY_SCALE, MAX_MONEY_E2), markE4)
                      : panel.scaled(draft, QTY_SCALE, MAX_QTY_E3);
                  panel.setState({
                    pCloseUnit: v,
                    pCloseDraft: !qty
                      ? ""
                      : inverse
                        ? v === "cash"
                          ? String(qty / MONEY_SCALE)
                          : String(practiceCoinForMoney(qty, markE4, ROUND_DOWN) / COIN_SCALE)
                        : v === "cash"
                          /* Past what the money type holds at this mark, the
                             field empties rather than throwing — the same
                             rule the open ticket's own conversion follows. */
                          ? qty > practiceQtyCeiling(markE4)
                            ? ""
                            : String(practiceNotional(markE4, qty, "down") / MONEY_SCALE)
                          : practiceQtyText(qty),
                    pCloseWhy: null,
                  });
                },
              },
              label,
            ),
          ),
        ),
      ),
      quote
        ? React.createElement(
            AlertPosSplit,
            null,
            React.createElement(
              AlertPosSplitCol,
              null,
              React.createElement(
                AlertPosSplitHead,
                null,
                msg("pos_close_taking", "Closing"),
              ),
              React.createElement(
                "span",
                null,
                msg(
                  "pos_close_qty",
                  "$1 $2 at $3",
                  inverse ? practiceMoneyText(quote.qty, sym) : practiceQtyText(quote.qty),
                  inverse ? msg("pos_contracts", "contracts") : pos.coin,
                  price(quote.fill),
                ),
              ),
              React.createElement(
                AlertPosValue,
                { tone: quote.realised > 0 ? "up" : quote.realised < 0 ? "down" : null },
                msg(
                  "pos_close_now_v",
                  "$1 after the $2 fee",
                  `${quote.realised >= 0 ? "+" : "-"}${money(Math.abs(quote.realised))}`,
                  money(quote.fee),
                ),
              ),
              React.createElement(
                "span",
                null,
                msg("pos_close_balance", "balance $1", money(quote.balanceAfter)),
              ),
            ),
            React.createElement(
              AlertPosSplitCol,
              null,
              React.createElement(
                AlertPosSplitHead,
                null,
                quote.all
                  ? msg("pos_close_left_none_head", "Left")
                  : msg("pos_close_left_head", "Still open"),
              ),
              quote.all
                ? React.createElement(
                    "span",
                    null,
                    msg("pos_close_left_none", "nothing — this ends the contract"),
                  )
                : React.createElement(
                    Fragment,
                    null,
                    React.createElement(
                      "span",
                      null,
                      msg(
                        "pos_close_left_qty",
                        "$1 $2 on $3 of margin",
                        inverse ? practiceMoneyText(quote.restQty, sym) : practiceQtyText(quote.restQty),
                        inverse ? msg("pos_contracts", "contracts") : pos.coin,
                        money(quote.restMargin),
                      ),
                    ),
                    React.createElement(
                      AlertPosValue,
                      {
                        tone:
                          quote.restUnrealised > 0
                            ? "up"
                            : quote.restUnrealised < 0
                              ? "down"
                              : null,
                      },
                      `${quote.restUnrealised >= 0 ? "+" : ""}${money(quote.restUnrealised)}`,
                    ),
                    React.createElement(
                      "span",
                      null,
                      quote.restLiquidation
                        ? msg("pos_close_left_liq", "liq $1", price(quote.restLiquidation))
                        : msg("pos_liq_none", "none at 1x"),
                    ),
                  ),
            ),
          )
        : null,
      /* One note, and it says the most urgent true thing: a refusal from the
         model, then the lot rule quietly taking the rest, then the ordinary
         hint. */
      React.createElement(
        AlertPosNote,
        null,
        panel.numberWarning("pCloseDraft") ||
          (st.pCloseWhy
            ? msg("pos_close_refused", "Not closed — $1.", panel.refusalText(st.pCloseWhy))
            : tooSmall
              ? msg(
                  "pos_close_too_small",
                  "That is under one lot of $1 — the smallest piece you can take is $2.",
                  pos.coin,
                  inverse
                    ? practiceMoneyText(PRACTICE_INVERSE_LOT_E2, sym)
                    : practiceQtyText(PRACTICE_LOT_E3),
                )
              : msg(
                  "pos_close_hint",
                  "Type it in $1 or in $2 — the price it fills at is not the price above, because closing crosses the spread.",
                  pos.coin,
                  sym,
                )),
      ),
      React.createElement(
        AlertPosButton,
        {
          disabled: !quote,
          onClick: () => {
            if (!quote) return;
            const why =
              panel.props.onPracticeReduce &&
              panel.props.onPracticeReduce(pos.id, quote.qty);
            panel.setState(
              why
                ? { pCloseWhy: why }
                : { pClose: null, pCloseDraft: "", pCloseWhy: null },
            );
          },
        },
        quote
          ? quote.all
            ? msg("pos_close_do_all", "Close all $1", pos.coin)
            : msg(
                "pos_close_do",
                "Close $1 $2",
                inverse ? practiceMoneyText(quote.qty, sym) : practiceQtyText(quote.qty),
                inverse ? msg("pos_contracts", "contracts") : pos.coin,
              )
          : msg("pos_close_open", "Close"),
      ),
    );
  },

  /* **The rest of what an order ticket says before you press it.**
   *
   * Asked for as more detail on the contract window. The grid above sizes the
   * contract; these are the consequences a venue's ticket prints under it,
   * each read off the probe — the same contract opened inside the model — so
   * none of them is a second calculation that could disagree with the button:
   * where it is liquidated, where it is even with *both* fees paid, what
   * closing would charge, the most it can lose (isolated: the margin, and the
   * fee already gone — which is also what opening takes), and — when
   * the venue's rate is known — what one funding settlement would move, with
   * the sign for the side being opened. Absent rather than blank when there
   * is no answer. */
  renderTicketDetails: (impact, coin, long, inverse) => {
    const amount = (v) => (inverse ? practiceCoinText(v, coin) : practiceMoneyText(v, panel.posSymbol()));
    const sym = panel.posSymbol();
    const mkt = panel.state.mkt;
    const rate = mkt && mkt.coin === coin && mkt.funding ? mkt.funding.rate : null;
    let funding = null;
    if (rate != null && isFinite(rate) && !inverse) {
      /* A positive rate is paid by longs to shorts (`practiceFunding`). */
      const per = Math.round(impact.notional * Math.abs(rate));
      const pays = (rate > 0) === long;
      funding = rate === 0
        ? amount(0)
        : `${pays ? "−" : "+"}${amount(per)}`;
    }
    /* Short labels so the five fit one row; the full sentence each stands
       for rides on the cell as its title. */
    const cells = [
      [
        msg("pos_more_liq", "Liquidation"),
        impact.liq ? practicePriceText(impact.liq, sym) : msg("pos_liq_none", "none at 1x"),
        msg("pos_more_liq_hint", "The price this contract is closed at by the maintenance rule"),
      ],
      [
        msg("pos_more_even", "Break-even"),
        impact.breakEven ? practicePriceText(impact.breakEven, sym) : null,
        msg("pos_more_even_hint", "Where closing pays back both fees and both adverse fills"),
      ],
      [
        msg("pos_more_exit", "Close fee"),
        impact.exitFee != null ? amount(impact.exitFee) : null,
        msg("pos_more_exit_hint", "What closing at this price would charge"),
      ],
      /* One cell, not two: on an isolated contract what opening takes from
         the balance (margin and fee) *is* the most it can lose — liquidation
         takes the margin and nothing else — and two cells with one number
         in them would read as a mistake. */
      [
        msg("pos_more_worst", "Max loss"),
        amount(impact.margin + impact.fee),
        msg("pos_more_worst_hint", "The margin and the opening fee — what opening takes from the balance, and on an isolated contract the most it can lose"),
      ],
      [
        msg("pos_more_funding", "Funding / 8h"),
        funding,
        msg("pos_more_funding_hint", "One settlement at the current rate, for this size and side: minus is paid, plus is received"),
      ],
    ].filter(([, v]) => v != null);
    return React.createElement(
      AlertPosTicketMore,
      { "data-practice-ticket-more": "true" },
      ...cells.map(([label, value, hint]) =>
        React.createElement(
          AlertPosDetailCell,
          { key: label, title: hint },
          React.createElement("span", null, label),
          React.createElement("strong", null, value),
        ),
      ),
    );
  },

  /* The scaled order's own row on the ticket: To, the count, and the
     levels it will rest at with the size at each — read off the model's
     own answer, so the list is what pressing places. */
  renderScaleRow: (count, toText, probe, coin) =>
    React.createElement(
      AlertPosScale,
      { "data-practice-scale": String(count) },
      React.createElement(
        AlertPosField,
        null,
        msg("pos_scale_to", "To"),
        React.createElement(
          AlertPosInputWrap,
          null,
          React.createElement(AlertPosInputUnit, { "aria-hidden": "true" }, panel.posUnit()),
          React.createElement(AlertPosInput, {
            type: "text",
            inputMode: "decimal",
            value: toText,
            placeholder: msg("pos_scale_to_ph", "last price"),
            "aria-label": msg("pos_scale_to_aria", "The last price of the scaled order"),
            "aria-invalid": panel.state.numWarn === "pScaleTo" ? "true" : "false",
            onChange: (e) => panel.numberField("pScaleTo", e.target.value),
          }),
        ),
      ),
      React.createElement(
        AlertPosField,
        null,
        msg("pos_scale_count", "Orders"),
        React.createElement(
          AlertPosChips,
          { role: "group", "aria-label": msg("pos_scale_count_aria", "How many orders to spread it across") },
          ...PRACTICE_SCALE_COUNTS.map((n) =>
            React.createElement(
              AlertPosChip,
              {
                key: n,
                active: count === n,
                "aria-pressed": count === n,
                onClick: () => panel.setState({ pScaleN: n, pTicketWhy: null, pArm: null }),
              },
              String(n),
            ),
          ),
        ),
      ),
      probe && probe.levels && !probe.error
        ? React.createElement(
            AlertPosScaleLevels,
            { "data-practice-scale-levels": String(probe.levels.length) },
            ...probe.levels.map((l, i) =>
              React.createElement(
                "span",
                { key: i },
                practicePriceText(l, panel.posSymbol()),
                React.createElement("em", null, `${practiceQtyText(probe.each + (i === 0 ? panel._posQty - probe.each * probe.levels.length : 0))} ${coin}`),
              ),
            ),
          )
        : null,
    ),

  renderPositionTicket: (practice, coin, marks, onPracticeOpen, onPracticeReset) => {
    const st = panel.state;
    const inverse = practiceIsCoinSettled(practice);
    const live = Number(panel.props.livePrices && panel.props.livePrices[coin]);
    const side = st.pSide || "long";
    const long = side !== "short";
    /* **A resting order, or one that crosses now.** */
    /* P6 — three kinds: at the market, resting at a price you name (limit),
       or resting until the price breaks through a trigger (stop). The two
       resting kinds share everything about being placed rather than opened. */
    const orderKind = st.pKind === "limit" ? "limit" : st.pKind === "stop" ? "stop" : st.pKind === "scale" ? "scale" : "market";
    const scaleOn = orderKind === "scale";
    const limitOrder = orderKind !== "market";
    /* Reduce-only is a limit that can only take contracts on the other side
       of this market down — offered only when there are some. */
    const againstQty = practiceForCoin(practice, coin)
      .map((pid) => practice.positions[pid])
      .filter((p) => p && p.side !== side)
      .reduce((a, p) => a + p.qty, 0);
    const reduceOnly = orderKind === "limit" && Boolean(st.pReduce) && againstQty > 0;
    const takeRaw = st.pTake;
    /* Three units on a quote account: the coin, money, and — P5 — the loss at
       the stop. An inverse account is sized in its own contracts and keeps two. */
    const qtyUnit = st.pQtyUnit === "cash"
      ? "cash"
      : st.pQtyUnit === "risk" && !practiceIsCoinSettled(practice) ? "risk" : "coin";
    /* The result of sizing by risk, read by the size step below: the loss it
       settled on, or why it could not. */
    let riskInfo = null;
    /* **Every press opens a contract.**
     *
     * This form had three modes — open, add to what you hold, reduce it —
     * because a coin could hold exactly one position and a second order had
     * nowhere to go. It can hold as many as the balance carries now, so an
     * order is an order: a new contract, on the side you chose, at the
     * leverage you chose. Adding to an existing one and taking some off are
     * both still there and both belong to that contract's own card, which is
     * where you can say *which* one you meant.
     *
     * Nothing on this form is disabled by holding something any more. That
     * was the whole of the "the buttons are dead" report, and the reason for
     * it is gone rather than worked around. */
    const heldHere = practiceForCoin(practice, coin);
    const leverageLimit = Math.min(PRACTICE_MAX_LEVERAGE, practice.plan.maxLeverage);
    const leverage = Math.min(st.pLev || panel.ticketLeverage(coin), leverageLimit);
    const leverageText = st.pLevDraft === undefined ? String(leverage) : st.pLevDraft;
    const draftedLeverage = Number(st.pLevDraft);
    const leverageOutOfRange =
      st.pLevDraft !== undefined &&
      (st.pLevDraft === "" || !practiceLeverageOk(draftedLeverage));
    const leverageAbovePlan =
      st.pLevDraft !== undefined &&
      practiceLeverageOk(draftedLeverage) &&
      draftedLeverage > leverageLimit;
    const leverageInvalid = leverageOutOfRange || leverageAbovePlan;
    const leverageMarks = practiceLeverageMarks(leverageLimit);
    const sizePct = st.pSize
      || ((panel.props.practiceTicket && panel.props.practiceTicket.share) || 25);
    const tiersOn = !practice.plan || practice.plan.sizeTiers !== 0;
    /* **What a share chip is a share of**, hoisted so every reader of it
       reads one value. It is deliberately *not* the free
       balance: the plan's per-contract margin wall is usually the smaller of
       the two, so "25% of your money" would be wrong by a factor of five on a
       fresh account. Both bounds are explained where they are applied below,
       which now reads this one value rather than computing a second copy —
       the chip, the note and the order cannot disagree. */
    const sizeCap = Math.min(
      practiceMarginWall(practice.plan, inverse ? practice.startCollateral : practice.startBalance),
      practiceFreeBalance(practice, coin),
    );
    /* What the share chips come to, in the unit the size field is showing.
       Filled in as the field's value while nothing is typed, so the box always
       says what the ticket is about to do rather than sitting empty. Read from
       `panel._posQty`, which the probe has already settled — one number, not a
       second derivation that could disagree with it. */
    const sizeIn = (qty) => {
      if (!qty) return "";
      const cash = qtyUnit === "cash";
      /* **A conversion with no price to convert at has nothing to say.**
       *
       * This read `entryE4 || 1` — a fallback whose only job was to keep the
       * divisor off zero, and which then went on to do arithmetic at a price
       * of $0.0001. On the inverse path that is one ten-thousandth of a cent
       * per contract, so the quantity it implies is past what a safe integer
       * can hold: `practiceCoinForMoney` threw *inside a render*, and the
       * ErrorBoundary took the whole screen. Found by the sweep at
       * `audit-futures.js 4242 coin`, one action after `Entry price = "0"`.
       *
       * Empty is the honest answer, and it is also the one the field is built
       * for: with nothing to show it falls back to its placeholder. The bound
       * is checked as well as the zero, because a real but tiny price can
       * overflow the same way — that is what `practiceInverseTooBig` is for,
       * and a bound must be checked *before* the arithmetic it protects. */
      if (!(entryE4 > 0)) return "";
      if (inverse) {
        if (cash) return String(qty / MONEY_SCALE);
        if (practiceInverseTooBig(qty, entryE4)) return "";
        return String(practiceCoinForMoney(qty, entryE4, ROUND_DOWN) / COIN_SCALE);
      }
      /* The quote side has the same overflow the inverse side has, and the
         same answer: a bound checked *before* the arithmetic it protects, and
         an empty field rather than a thrown render. */
      if (cash && qty > practiceQtyCeiling(entryE4)) return "";
      return cash
        ? String(practiceNotional(entryE4, qty, ROUND_DOWN) / MONEY_SCALE)
        : String(qty / QTY_SCALE);
    };
    const holding = false;

    /* The entry price is a field, not only the live number. Naming it is the
       only way to build the situation worth watching — a position that starts
       near its own liquidation, say — without waiting days for the market to
       arrange it. It follows the live price until it is typed into.
       It is editable again in every state: it was locked while a position was
       held, because an order then *changed* that contract and a typed price
       would have been a fill nobody could get. An order opens its own
       contract now, so naming its entry is naming where this one starts. */
    const entryText = st.pEntry === undefined
      ? (live > 0 ? String(live) : "")
      : st.pEntry;
    const entryE4 = Math.round(Number(entryText) * PRICE_SCALE);
    const usable = entryE4 > 0 && isFinite(entryE4);
    const stopRaw = st.pStop;
    let refused = leverageInvalid
      ? leverageAbovePlan
        ? "planLeverage"
        : "leverage"
      : null;
    let impact = null;
    /* **The risk bracket this order falls in, and the ceiling it puts on the
       leverage.** Held outside `impact` on purpose: `impact` is built from a
       probe that only runs when the order is *accepted*, and the bracket is
       most needed exactly when it is not — the refusal says "see the bracket
       below", so there has to be one below. */
    let ticketTier = null;
    let sizeMaxLev = null;

    let preview = msg(
          "pos_hint",
          "Pick a side and a size. The liquidation level follows from the leverage.",
        );
    if (usable && leverageInvalid) {
      preview = msg("pos_refused", "Cannot open — $1.", panel.refusalText(refused, practice));
    } else if (usable) {
      /* **A share of what can actually be committed right now.**
       *
       * Two bounds, and it took both. The first is the plan's margin wall: a
       * share of the *whole balance* meant 100% asked for more margin than the
       * plan permits and the open was refused every time. The second is the
       * money that is still free, and it was missing — the wall is a share of
       * the **starting** balance, so it does not move when six contracts are
       * already holding most of the account. Pressing 100% with $427 free
       * asked for $2,000 of margin and was refused, which is the shape the
       * human reported: "I have money and it will not open."
       *
       * The smaller of the two is what a share can honestly be a share of.
       * `practiceFreeBalance` is the same figure the model checks the order
       * against and the same one the Account tab prints, so the chip, the
       * refusal and the field cannot disagree. */
      const assigned = Math.floor((sizeCap * sizePct) / 100);
      const notional = inverse
        ? practiceMoneyForCoin(assigned, entryE4, ROUND_DOWN) * leverage
        : assigned * leverage;
      /* **A typed size takes over from the share.**
       *
       * The chips are shares of the margin wall, which is the right shortcut
       * and the wrong only option: on a venue you type the size, because the
       * size is usually the decision — "a tenth of a Bitcoin", "a thousand
       * dollars of it" — and a percentage of a wall you cannot see is a
       * roundabout way of saying it.
       *
       * Both units, for the same reason the deposit field takes both: one is
       * what you are exposed to and the other is what it is worth. Typed
       * through `scaled`, so a wall of nines is clamped to the model's range
       * before it can reach the arithmetic. Empty falls back to the share, so
       * the field is never a blank that has quietly stopped the ticket. */
      const typedQty = st.pQty === undefined || st.pQty === "" ? null : (() => {
        const unit = qtyUnit;
        /* **P5 — the size that loses what you typed, at the stop.**
         *
         * The size mode a professional ticket offers: "risk $100 to the
         * stop" and the ticket works out how much. Found by bisection through
         * the model — open this many lots, close them at the stop with
         * `practiceCloseQuote`, add back the fee that opening charged — so the
         * loss is the one the stop would really realise, adverse fill and
         * both fees in, never a multiplication that could disagree with it.
         * The largest whole number of lots whose loss stays within the
         * figure; a refusal with its reason when there is no stop, or when a
         * single lot already loses more. A number, not advice: how much to
         * risk is the person's, and the ticket only does the arithmetic. */
        if (unit === "risk") {
          const riskE2 = panel.scaled(st.pQty, MONEY_SCALE, MAX_MONEY_E2);
          const stopE4 = Number(stopRaw) > 0 ? Math.round(Number(stopRaw) * PRICE_SCALE) : 0;
          if (!stopE4 || (long ? stopE4 >= entryE4 : stopE4 <= entryE4)) {
            riskInfo = { error: "riskStop" };
            return null;
          }
          const lossAt = (q) => {
            const o = practiceOpen(practice, { coin, side, qty: q, leverage }, entryE4);
            if (o.error) return null;
            const quote = practiceCloseQuote(o.state, o.id, stopE4);
            if (!quote) return null;
            const opened = [...(o.state.ledger || [])].reverse().find((e) => e.kind === "open");
            return -quote.realised + (opened ? opened.fee : 0);
          };
          const step = PRACTICE_LOT_E3;
          const first = lossAt(step);
          if (first == null || first > riskE2) {
            riskInfo = { error: "riskSmall" };
            return null;
          }
          /* An upper bound from the distance alone, doubled for the costs it
             leaves out; the bisection only ever trusts the model. */
          const guess = Math.floor(
            (riskE2 * ((PRICE_SCALE * QTY_SCALE) / MONEY_SCALE)) / Math.max(1, Math.abs(entryE4 - stopE4)),
          );
          let lo = step;
          let hi = Math.min(MAX_QTY_E3, Math.max(step, guess * 2));
          hi -= hi % step;
          let best = step;
          let bestLoss = first;
          while (lo <= hi) {
            const mid = Math.max(step, Math.floor((lo + hi) / (2 * step)) * step);
            const loss = lossAt(mid);
            if (loss != null && loss <= riskE2) {
              best = mid;
              bestLoss = loss;
              lo = mid + step;
            } else {
              hi = mid - step;
            }
          }
          riskInfo = { qty: best, loss: bestLoss, stop: stopE4 };
          return best;
        }
        if (inverse) {
          /* An inverse contract is *written* in the quote currency, so "cash"
             is its own unit and the coin box is the conversion. */
          /* The coin ceiling is the **price's**, not the coin's: the two
             constants each bound one side and neither bounds the product, and
             it is the product this converts. Without it a wall of nines in
             both boxes threw from inside the render. */
          return unit === "cash"
            ? panel.scaled(st.pQty, MONEY_SCALE, MAX_MONEY_E2)
            : practiceMoneyForCoin(
                panel.scaled(st.pQty, COIN_SCALE, practiceCoinCeiling(entryE4)),
                entryE4,
                ROUND_DOWN,
              );
        }
        return unit === "cash"
          ? practiceQtyForNotional(panel.scaled(st.pQty, MONEY_SCALE, MAX_MONEY_E2), entryE4)
          : panel.scaled(st.pQty, QTY_SCALE, MAX_QTY_E3);
      })();
      let qty = typedQty || (inverse
        ? Math.max(
            PRACTICE_INVERSE_LOT_E2,
            notional - (notional % PRACTICE_INVERSE_LOT_E2),
          )
        : Math.max(
            PRACTICE_LOT_E3,
            Math.floor((notional * ((PRICE_SCALE * QTY_SCALE) / MONEY_SCALE)) / entryE4),
          ));
      /* The whole-lot rule applies to a typed size exactly as it does to a
         derived one — a quantity is an integer number of lots or it is not a
         quantity the model will take. */
      const lotSize = inverse ? PRACTICE_INVERSE_LOT_E2 : PRACTICE_LOT_E3;
      qty = Math.max(lotSize, qty - (qty % lotSize));
      /* **The probe runs the operation the button will run**, which is now
         always the same one: an order opens a contract. It used to switch on
         a mode, and before that it ran `practiceOpen` even when the button
         would add — so a held coin failed the probe, `refused` was set, and
         the button was disabled whatever the form said. Neither can happen
         again: there is one operation and the probe is it. */
      const run = (q) => practiceOpen(practice, { coin, side, qty: q, leverage }, entryE4);
      let probe = run(qty);
      const lot = lotSize;
      /* A *typed* size is not shrunk to fit — somebody who asked for a tenth
         of a Bitcoin is told the plan refuses it, rather than quietly given
         nine hundredths. The shrink is for the chips, which are asking for
         "as much as this share allows". */
      /* `funds` as well as `planMargin`: the cap above leaves the fee out of
         its arithmetic — the model charges margin *and* fee against the free
         balance — so a chip sized to the last dollar of it misses by the fee
         alone. The exact search below keeps the promise that a chip asking for
         "as much as this allows" lands on something that opens. */
      if (!typedQty && (probe.error === "planMargin" || probe.error === "funds")) {
        /* **A percentage asks for the largest size that actually fits.**
         *
         * Eight arbitrary one-percent cuts used to be enough at ordinary
         * leverage and fail at 200x: a 0.05% fee on 200 times the margin is
         * ten percent of that margin, so 100% was still refused after the
         * eighth cut. The model transition is the predicate and the lot is
         * the unit, so a binary search finds the exact last whole lot without
         * copying the fee, slippage or margin arithmetic into the panel.
         * A typed size is still never changed behind the person's back. */
        let lo = lot;
        let hi = qty - lot;
        let fitted = null;
        while (lo <= hi) {
          let mid = Math.floor((lo + hi) / (2 * lot)) * lot;
          if (mid < lot) mid = lot;
          const attempt = run(mid);
          if (attempt.error) {
            hi = mid - lot;
          } else {
            fitted = { qty: mid, probe: attempt };
            lo = mid + lot;
          }
        }
        if (fitted) {
          qty = fitted.qty;
          probe = fitted.probe;
        }
      }
      panel._posQty = qty;
      /* Read off the size the ticket has settled on, before the probe's answer
         is consulted, so a refused order still explains itself. */
      try {
        const bracketNotional = inverse
          ? qty
          : practiceNotional(entryE4, qty, ROUND_UP);
        if (tiersOn) {
          ticketTier = practiceTierFor(bracketNotional);
          sizeMaxLev = practiceMaxLeverageForMargin(
            /* The margin behind it, which is what the ceiling is a function of —
               derived from the notional rather than from the chip, so a typed
               size and a pressed share are answered the same way. */
            Math.max(1, Math.floor(bracketNotional / Math.max(1, leverage))),
          );
        }
      } catch {
        ticketTier = null;
        sizeMaxLev = null;
      }
      /* **The button follows the probe, not the fields.** It used to be
         enabled whenever the entry parsed, so a refusal the model had already
         worked out — the price outside the model's range, the plan's margin
         cap, not enough left — was printed in the note above a button that
         still looked pressable and did nothing at all. Measured on live BTC:
         the note read `Cannot open: price` and the button was `disabled:
         false`. A control that cannot do what it offers is worse than one
         that is not there. */
      refused = probe.error || null;
      if (reduceOnly) {
        /* Opens nothing and reserves nothing, so what refuses an *opening*
           — the free balance, the bracket — does not refuse this. What can
           refuse it, the model says when it is placed. */
        refused = null;
        preview = msg(
          "pos_reduce_preview",
          "Takes up to $1 off your $2 here at $3, on maker terms. Opens nothing.",
          `${practiceQtyText(Math.min(qty, againstQty))} ${coin}`,
          side === "short" ? msg("pos_longs", "longs") : msg("pos_shorts", "shorts"),
          practicePriceText(entryE4, panel.posSymbol()),
        );
      } else if (riskInfo && riskInfo.error) {
        refused = riskInfo.error;
        preview = msg("pos_refused", "Cannot open — $1.", panel.refusalText(riskInfo.error, practice));
      } else if (probe.error) {
        preview = msg("pos_refused", "Cannot open — $1.", panel.refusalText(probe.error, practice));
      } else {
        /* The probe's own contract, by the id the open handed back — not
           "the one on this coin", which is now a question with as many
           answers as the market has contracts running. */
        const p = practiceAt(probe.state, probe.id);
        const l = practiceLiquidationPrice(p);
        /* **What the stop and the take-profit are actually worth.**
         *
         * They were two price boxes with no consequence anywhere on the
         * screen: you typed a number and the ticket said nothing about what
         * it costs you, which is the one thing the number is for. Every venue
         * shows the money, and it is the difference between choosing a stop
         * and guessing one.
         *
         * **Run, not re-derived.** `practiceCloseQuote` closes the probed
         * position at that price inside the model — so the figure carries the
         * adverse fill and the exit fee, and is the same arithmetic the close
         * ticket quotes and the trigger will actually execute. Working the
         * P/L out here with a multiplication would be the `practiceCloseSize`
         * defect again: two implementations, two answers.
         *
         * `event.realised` is `cash - released`, so it is **net of the fee** —
         * what lands, not what the move made. */
        const quoteAt = (level) => {
          if (!Number.isSafeInteger(level) || level < 1) return null;
          const q = practiceCloseQuote(probe.state, probe.id, level);
          return q ? q.realised : null;
        };
        const outcome = (raw, wantBelow) => {
          const n = Number(raw);
          if (!raw || !isFinite(n) || n <= 0) return null;
          const level = Math.round(n * PRICE_SCALE);
          if (level < entryE4 !== wantBelow) return null;
          return quoteAt(level);
        };
        const stopPnl = outcome(stopRaw, long);
        const takePnl = outcome(takeRaw, !long);
        /* **What the press costs, read off the fill the model actually
           built.** 0.05% of the *notional*, so at 200x it is a tenth of the
           margin behind the contract — the single figure most likely to
           explain a run of small wins that nets to a loss, and it appeared
           nowhere on this screen before the ledger, after the fact. */
        const opened = [...(probe.state.ledger || [])]
          .reverse()
          .find((e) => e.coin === coin && (e.kind === "open" || e.kind === "add"));
        /* What getting out would cost at the price the order fills at —
           the same close the button would run, so the figure is the fee
           that would actually be charged, adverse fill and all. */
        const exitQuote = practiceCloseQuote(probe.state, probe.id, entryE4);
        impact = {
          /* Where this contract would stop costing money, both fees in —
             bisected through the close the button runs. */
          breakEven: practiceBreakEven(probe.state, probe.id),
          exitFee: exitQuote ? exitQuote.fee : null,
          fee: opened && opened.fee > 0 ? opened.fee : 0,
          /* The same conservative entry notional `practiceOpen` charged,
             rather than the marked-notional helper's round-down view. */
          notional: inverse ? p.qty : practiceNotional(p.entry, p.qty, ROUND_UP),
          inverse,
          margin: p.margin,
          rate: 100 / leverage,
          away: l ? (Math.abs(l - p.entry) / p.entry) * 100 : null,
          liq: l || null,
          stopPnl,
          takePnl,
          /* **Reward against risk, on the two figures above it.** Both net of
             fees, so it is the ratio you actually get rather than the one the
             prices suggest — on a small position the exit fees alone can move
             1:2 to 1:1.6. Only when the stop really loses: a "stop" that
             makes money is a take-profit in the wrong box, which `wrongSide`
             is already saying, and a ratio drawn from it would dress up a
             mistake as a plan. */
          rr: stopPnl != null && takePnl != null && stopPnl < 0 && takePnl > 0
            ? takePnl / -stopPnl
            : null,
        };
        /* **What the ticket stands at, for the assistant.** Read off the
           probe the button would run, so the assistant's loss-at-stop and
           liquidation are the ticket's own and never a second arithmetic.
           A plain field on the panel, not state: the assistant renders
           after the ticket in the same pass and reads it then. */
        panel._lastTicket = {
          coin,
          side,
          leverage,
          entryE4,
          stopE4: stopRaw ? Math.round(Number(stopRaw) * PRICE_SCALE) : null,
          takeE4: takeRaw ? Math.round(Number(takeRaw) * PRICE_SCALE) : null,
          stopLossE2: impact.stopPnl != null && impact.stopPnl < 0 ? -impact.stopPnl : 0,
          marginE2: impact.margin || 0,
          notionalE2: inverse ? 0 : impact.notional || 0,
          liqE4: impact.liq || null,
        };
        const feeText = impact.fee
          ? (inverse
              ? practiceCoinText(impact.fee, coin)
              : practiceMoneyText(impact.fee, panel.posSymbol()))
          : null;
        preview = inverse
          ? msg(
              "pos_preview_inverse",
              "$1 contracts · margin and P/L settle in $2 · entry $3.",
              practiceMoneyText(p.qty, panel.posSymbol()),
              coin,
              practicePriceText(p.entry, panel.posSymbol()),
            )
          /* **The same contract, in the unit you asked for.** `Read a
             contract in` on the Account tab decides whether this is the
             exposure (0.008 BTC) or what it is worth (900.00) — the model
             never sees the preference, so the figure is converted here from
             the position the probe actually built. */
          : panel.practiceUnits() === PRACTICE_UNITS_CASH
            ? (() => {
                const size = practiceMoneyText(
                  practiceNotional(p.entry, p.qty, ROUND_UP),
                  panel.posSymbol(),
                );
                const at = practicePriceText(p.entry, panel.posSymbol());
                const fee = feeText || practiceMoneyText(0, panel.posSymbol());
                return msg(
                      "pos_preview_ready_cash",
                      "$1 of $2 at $3 · fee $4 to open.",
                      size, coin, at, fee,
                    );
              })()
            : (() => {
                const size = practiceQtyText(p.qty);
                const at = practicePriceText(p.entry, panel.posSymbol());
                const fee = feeText || practiceMoneyText(0, panel.posSymbol());
                return msg(
                      "pos_preview_ready",
                      "$1 $2 at $3 · fee $4 to open.",
                      size, coin, at, fee,
                    );
              })();
      }
    }

    /* A stop above a long's entry is a take-profit typed into the wrong box
       and would fire on the next tick. The model refuses it; saying so here
       is what stops the press from doing nothing. */
    const wrong = (v, wantBelow) => {
      const n = Number(v);
      if (!v || !isFinite(n) || n <= 0 || !entryE4) return false;
      return Math.round(n * PRICE_SCALE) < entryE4 !== wantBelow;
    };
    const wrongSide =
      wrong(stopRaw, long) || wrong(takeRaw, !long)
        ? long
          ? msg(
              "pos_wrong_long",
              "On a long the stop goes below your entry and the take-profit above it.",
            )
          : msg(
              "pos_wrong_short",
              "On a short the stop goes above your entry and the take-profit below it.",
            )
        : null;

    /* **A scaled order** (28 Sep 2026): the size laid across a range as 3, 5
       or 10 resting limits, from the entry field's price ("From") to "To".
       Asked of the model on the account as it is — `practicePlaceScale` on a
       copy — so every figure here is what pressing would do, and a range
       that crosses the market, a stop on the wrong side of any level or a
       size that cannot be split is refused by the same rules one order is. */
    const scaleCount = PRACTICE_SCALE_COUNTS.includes(st.pScaleN) ? st.pScaleN : 5;
    const scaleToText = st.pScaleTo === undefined ? "" : st.pScaleTo;
    const scaleToE4 = Math.round(Number(scaleToText) * PRICE_SCALE);
    const scaleProbe = scaleOn && usable && scaleToE4 > 0 && live > 0 && panel._posQty > 0
      ? practicePlaceScale(
          practice,
          {
            coin,
            currency: PRACTICE_CURRENCY,
            side,
            qty: panel._posQty,
            leverage,
            stop: stopRaw ? Math.round(Number(stopRaw) * PRICE_SCALE) : null,
            take: takeRaw ? Math.round(Number(takeRaw) * PRICE_SCALE) : null,
          },
          scaleCount,
          entryE4,
          scaleToE4,
          Math.round(live * PRICE_SCALE),
        )
      : null;
    const scaleHeld = scaleProbe && scaleProbe.state
      ? practiceReserved(scaleProbe.state) - practiceReserved(practice)
      : 0;
    const scaleNote = !scaleOn
      ? null
      : !(scaleToE4 > 0)
        ? msg("pos_scale_need_to", "Name the last price of the range in To — the orders are spread evenly from From to To.")
        : scaleProbe && scaleProbe.error
          ? msg("pos_refused", "Cannot open — $1.", panel.refusalText(scaleProbe.error, practice))
          : scaleProbe
            ? msg(
                "pos_scale_preview",
                "$1 orders of $2 from $3 to $4 — $5 held until they fill.",
                String(scaleCount),
                `${practiceQtyText(scaleProbe.each)} ${coin}`,
                practicePriceText(entryE4, panel.posSymbol()),
                practicePriceText(scaleToE4, panel.posSymbol()),
                practiceMoneyText(scaleHeld, panel.posSymbol()),
              )
            : null;

    const last = practice.ledger[practice.ledger.length - 1];

    /* Hoisted out of the argument list so the grid can be handed the number
       of cells it is actually drawing — see `AlertPosImpact`. */
    const impactCells = impact
      ? [
          [
            msg("pos_impact_notional", "Notional"),
            practiceMoneyText(inverse ? panel._posQty : impact.notional, panel.posSymbol()),
          ],
          [
            React.createElement(
              AlertPosImpactLabel,
              null,
              msg("pos_impact_margin", "Initial margin"),
              React.createElement(
                AlertPosWhat,
                {
                  open: st.pWhat === "margin",
                  "aria-expanded": st.pWhat === "margin",
                  "aria-label": msg("what_mar_aria", "What margin is, on this contract"),
                  onClick: () =>
                    panel.setState((p) => ({ pWhat: p.pWhat === "margin" ? null : "margin" })),
                },
                "?",
              ),
            ),
            inverse
              ? practiceCoinText(impact.margin, coin)
              : practiceMoneyText(impact.margin, panel.posSymbol()),
          ],
          [
            msg("pos_impact_rate", "Margin rate"),
            `${impact.rate < 1 ? impact.rate.toFixed(2) : impact.rate.toFixed(1)}%`,
          ],
          /* **The fifth cell, and the one that was missing.** The other
             four describe the size of the thing; this is what it costs to
             have it, which is the figure a run of small wins turns on.
             Charged again on the way out, so the round trip is twice
             this — said in the leverage card, not repeated here. */
          [
            msg("pos_impact_fee", "Fee to open"),
            inverse
              ? practiceCoinText(impact.fee, coin)
              : practiceMoneyText(impact.fee, panel.posSymbol()),
          ],
          [
            msg("pos_impact_liq", "To liquidation"),
            impact.away == null ? msg("pos_liq_none", "none at 1x") : `${impact.away.toFixed(2)}%`,
          ],
        ]
      : [];

    /* Built here rather than inline so the two of them can be handed to
       the ticket in either order — see the note at the point of use. */
      /* **Leverage as one control with two ways in.** The rail is the quick
         gesture and the field is the exact one: 37x no longer asks someone to
         land a 13px thumb on one pixel of travel. Both end at this account's
         actual ceiling and write the same state, so the preview cannot
         disagree with the number in the field. The five marks describe that
         linear scale at an even rhythm; they are not a second preset list. */
      /* Its own stacked block rather than a row in the label/control grid: at
         full width the slider leaves the label nothing, and "Leverage 100x"
         wrapped onto two lines with the number under the word. Name on the
         left, value on the right, the track under both — which is also how
         every venue draws it. */
    const levStep =
      React.createElement(
        AlertPosStep,
        { key: "lev" },
        React.createElement(
          AlertPosStepHead,
          null,
          /* Name and ring are one thing on the left — the head spaces its
             children apart, and a `Fragment` is not a box, so left loose the
             ring drifted into the middle of the row whenever the value beside
             it was short. `AlertPosImpactLabel` is the same
             pairing the margin cell already draws. */
          React.createElement(
            AlertPosImpactLabel,
            null,
            /* The label says what the number does, on the screen where the
               word is the obstacle. The ring still explains it properly. */
            msg("pos_leverage", "Leverage"),
            React.createElement(
              AlertPosWhat,
              {
                open: st.pWhat === "leverage",
                "aria-expanded": st.pWhat === "leverage",
                "aria-label": msg("what_lev_aria", "What leverage is, on this contract"),
                onClick: () =>
                  panel.setState((p) => ({ pWhat: p.pWhat === "leverage" ? null : "leverage" })),
              },
              "?",
            ),
          ),
          React.createElement(
                AlertPosLevHeadRight,
                null,
                React.createElement(
                  AlertPosLevMeta,
                  null,
                  sizeMaxLev && sizeMaxLev < leverageLimit
                    /* **What a venue's slider does when it shortens as you
                       size up.** The account's ceiling is one rule and the
                       bracket's is another, and the one that binds is the
                       smaller — saying only the first would leave the rail
                       offering a number the order will refuse. */
                    ? msg(
                        "pos_leverage_scope_tier",
                        "Isolated · account max $1x · this size $2x",
                        String(leverageLimit),
                        String(sizeMaxLev),
                      )
                    : msg(
                        "pos_leverage_scope",
                        "Isolated · account max $1x",
                        String(leverageLimit),
                      ),
                ),
                React.createElement(
                  AlertPosLevField,
                  {
                    invalid: leverageInvalid,
                    locked: holding,
                    "aria-invalid":
                      leverageInvalid || st.numWarn === "pLevDraft" ? "true" : "false",
                  },
                  React.createElement(AlertPosLevInput, {
                    type: "text",
                    inputMode: "numeric",
                    value: leverageText,
                    disabled: false,
                    "aria-label": msg("pos_leverage_set", "Leverage $1x", leverageText || "—"),
                    "aria-invalid":
                      leverageInvalid || st.numWarn === "pLevDraft" ? "true" : "false",
                    onChange: (e) => panel.leverageField(e.target.value, leverageLimit),
                    onBlur: () => panel.setState({ pLevDraft: undefined }),
                  }),
                  React.createElement(AlertPosLevUnit, { "aria-hidden": "true" }, "x"),
                ),
              ),
        ),
        React.createElement(
            AlertPosLev,
            null,
            React.createElement(AlertPosSlider, {
              type: "range",
              min: PRACTICE_MIN_LEVERAGE,
              max: leverageLimit,
              step: 1,
              value: leverage,
              disabled: false,
              pct: leverageLimit === PRACTICE_MIN_LEVERAGE
                ? 100
                : ((leverage - PRACTICE_MIN_LEVERAGE) /
                    (leverageLimit - PRACTICE_MIN_LEVERAGE)) * 100,
              "aria-label": msg("pos_leverage", "Leverage"),
              "aria-valuetext": `${leverage}x`,
              /* Major marks have a small magnetic catch, while the field stays
                 the direct route to any exact value between them. */
              onChange: (e) => {
                const v = practiceLeverageSnap(Number(e.target.value), leverageLimit);
                panel.setState({ pLev: v, pLevDraft: undefined });
                panel.rememberTicket({ leverage: { [coin]: v } });
              },
            }),
            React.createElement(
              AlertPosTicks,
              null,
              /* Placed by the value rather than by flex spacing. The values are
                 major divisions of this account's linear range, so their
                 physical rhythm and their numerical rhythm agree at every
                 available ceiling. */
              ...leverageMarks.map((v) => {
                const at = leverageLimit === PRACTICE_MIN_LEVERAGE
                  ? 0
                  : ((v - PRACTICE_MIN_LEVERAGE) /
                      (leverageLimit - PRACTICE_MIN_LEVERAGE)) * 100;
                return React.createElement(
                  AlertPosTick,
                  {
                    key: v,
                    at: at,
                    past: leverage >= v,
                    here: leverage === v,
                    edge: v === PRACTICE_MIN_LEVERAGE ? "start" : v === leverageLimit ? "end" : null,
                    disabled: false,
                    "aria-label": msg("pos_leverage_set", "Leverage $1x", String(v)),
                    onClick: () => {
                    panel.setState({ pLev: v, pLevDraft: undefined });
                    panel.rememberTicket({ leverage: { [coin]: v } });
                  },
                  },
                  React.createElement(AlertPosTickMark, { tall: true }),
                  React.createElement(AlertPosTickText, null, `${v}x`),
                );
              }),
            ),
          ),
      );

    const sizeStep =
      React.createElement(
        AlertPosStep,
        { key: "size" },
        React.createElement(
          AlertPosStepHead,
          null,
          React.createElement(
            Fragment,
            null,
            /* "Size" is the venue's word for a question with a plainer form:
               the chips are shares of what is free and the box is money.
               **Phrased as a question** since 15 Sep: the block above it asks
               one, and three blocks in three grammars is the same half-finished
               change as plain words in an uppercase slot. */
            msg("pos_size", "Size"),
            /* **What you can still commit**, beside the box that commits it.
               The header says equity, which is everything including what is
               already behind a contract; every venue prints the free figure
               here instead, because it is the one that answers "can I". */
            React.createElement(
                  AlertPosFreeNow,
                  { "data-practice-free": "true" },
                  panel.freeText(practice, coin),
                ),
          ),
          /* The share, beside the chips: they can be off the share
             entirely once a size is typed. */
          React.createElement(
            AlertPosStepValue,
            /* The hook says which of the two the size is coming from. Reading
               it off the rendered word instead made a test about the wording
               and about `text-transform`, neither of which is the behaviour. */
            { "data-practice-size-mode": st.pQty === undefined ? "share" : "typed" },
            st.pQty === undefined ? `${sizePct}%` : msg("pos_size_typed", "typed"),
          ),
        ),
        React.createElement(
          AlertPosChips,
          null,
          ...[25, 50, 75, 100].map((v) =>
            React.createElement(
              AlertPosChip,
              {
                key: v,
                active: sizePct === v,
                "aria-pressed": sizePct === v,
                  "aria-label": msg("pos_size_pct", "Size $1 percent", String(v)),
                /* Pressing a share means "use the share" — it drops whatever
                   was typed rather than leaving two sources for one number. */
                onClick: () => {
                  panel.setState({ pSize: v, pQty: undefined });
                  panel.rememberTicket({ share: v });
                },
              },
              `${v}%`,
            ),
          ),
        ),
        /* **Or type it.** The chips are shares of a wall you cannot see; the
           size is usually the decision itself. Both units, for the reason the
           deposit field takes both — one is what you are exposed to, the other
           is what it is worth. */
        React.createElement(
          AlertPosMoneyField,
          { "data-practice-size": "true" },
          React.createElement(
            AlertPosMoneySign,
            null,
            qtyUnit === "cash"
              ? (inverse ? msg("pos_contracts", "contracts") : panel.posUnit())
              : coin,
          ),
          React.createElement(AlertPosMoney, {
            type: "text",
            inputMode: "decimal",
            /* **The figure in the box is the one in the sentence under it.**
               Derived as `notional / leverage` it came out a dollar short of
               the model's margin — the probe's entry carries the adverse fill
               and this conversion does not — and two figures a dollar apart,
               one of them labelled "how much to put in", read as a defect.
               `impact.margin` is what the model actually charged. */
            value: st.pQty !== undefined
              ? st.pQty
              : qtyUnit === "risk"
                /* A coin quantity in a box labelled Risk would read as the
                   loss; the box stays empty and says what it wants. */
                ? ""
                : sizeIn(panel._posQty),
            placeholder: qtyUnit === "risk"
              ? msg("pos_risk_type", "loss at the stop")
              : msg("pos_size_type", "type a size"),
            "aria-label": msg("pos_size_aria", "Contract size"),
            "aria-invalid": st.numWarn === "pQty" ? "true" : "false",
            onChange: (e) => panel.numberField("pQty", e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") e.preventDefault();
            },
          }),
          React.createElement(
            AlertPosUnits,
            null,
            ...[
              ["coin", coin],
              ["cash", inverse ? msg("pos_contracts", "contracts") : panel.posUnit()],
              ...(inverse ? [] : [["risk", msg("pos_unit_risk", "Risk")]]),
            ].map(([v, label]) =>
              React.createElement(
                AlertPosUnit,
                {
                  key: v,
                  active: qtyUnit === v,
                  "aria-pressed": qtyUnit === v,
                  "aria-label": msg("pos_close_unit", "Type the amount in $1", label),
                  /* Switching the unit clears the draft rather than
                     converting it. The close ticket converts because the
                     number there is a quantity somebody meant; here the field
                     falls back to showing the share, which is a better answer
                     than a converted figure nobody typed. */
                  onClick: () => panel.setState({ pQtyUnit: v, pQty: undefined }),
                },
                label,
              ),
            ),
          ),
        ),
        panel.numberWarning("pQty")
          ? React.createElement(AlertPosHint, null, panel.numberWarning("pQty"))
          : null,
        /* What sizing by risk settled on, in the terms it was asked in. */
        qtyUnit === "risk"
          ? React.createElement(
              AlertPosHint,
              { "data-practice-risk-size": riskInfo ? (riskInfo.error || "ok") : "empty" },
              riskInfo && riskInfo.qty
                ? msg(
                    "pos_risk_sized",
                    "$1 $2 — at the stop it would lose $3, both fees in.",
                    practiceQtyText(riskInfo.qty),
                    coin,
                    practiceMoneyText(riskInfo.loss, panel.posSymbol()),
                  )
                : msg("pos_risk_ask", "Type the most this contract may lose at the stop; the size follows from the stop below."),
            )
          : null,
      );

    return React.createElement(
      /* **Blocks with air between them**, not one flat column. The ticket is
         four decisions made in order — side, leverage, size, prices — and it
         read as an undifferentiated list at a single 0.4rem rhythm, which is
         what made a screen of its own feel more cramped than the disclosure
         it replaced. */
      AlertPosTicket,
      { "data-practice-ticket": "pro" },
      /* What ended the last position, said once. A balance that is simply
         smaller does not tell anyone the maintenance rule closed it, and that
         is the whole lesson of the level shown on the row above. */
      last && (last.kind === "liquidation" || last.kind === "stop")
        ? React.createElement(
            AlertPosNote,
            null,
            last.kind === "liquidation"
              ? msg(
                  "pos_liquidated",
                  "$1 liquidated at $2. Equity reached the maintenance margin, so it closed there — a stop is a level you choose, this one is the contract's rule. The loss stopped at the margin.",
                  last.coin || "",
                  practicePriceText(last.fill, panel.posSymbol(last.currency)),
                )
              : msg(
                  "pos_stopped",
                  "$1 stopped out at $2.",
                  last.coin || "",
                  practicePriceText(last.fill, panel.posSymbol(last.currency)),
                ),
          )
        : null,
      /* **Market or limit, above the side.**
       *
       * It sits first because it changes what every control under it means: a
       * limit order's price *is* the entry field, its fee is the maker's, and
       * its button places rather than opens.
       *
       * The state is the panel's, not the account's: an order type is a
       * decision about the press you are about to make. */
      React.createElement(
            AlertPosChips,
            { "data-practice-kind": orderKind },
            ...[
              ["market", msg("pos_kind_market", "Market")],
              ["limit", msg("pos_kind_limit", "Limit")],
              ["stop", msg("pos_kind_stop", "Stop")],
              ["scale", msg("pos_kind_scale", "Scale")],
            ].map(([v, label]) =>
              React.createElement(
                AlertPosChip,
                {
                  key: v,
                  active: orderKind === v,
                  "aria-pressed": orderKind === v,
                  onClick: () => panel.setState({ pKind: v, pTicketWhy: null }),
                },
                label,
              ),
            ),
            /* Reduce-only, beside the kind it belongs to, and only where it
               can do something. */
            orderKind === "limit" && againstQty > 0
              ? React.createElement(
                  AlertPosChip,
                  {
                    active: reduceOnly,
                    "aria-pressed": reduceOnly,
                    "data-practice-reduce": reduceOnly ? "on" : "off",
                    title: msg(
                      "pos_reduce_hint",
                      "Only takes your $1 on this market down — up to $2 — and never opens a $3",
                      side === "short" ? msg("pos_longs", "longs") : msg("pos_shorts", "shorts"),
                      `${practiceQtyText(againstQty)} ${coin}`,
                      side === "short" ? msg("pos_a_short", "short") : msg("pos_a_long", "long"),
                    ),
                    onClick: () => panel.setState((q) => ({ pReduce: !q.pReduce, pTicketWhy: null })),
                  },
                  msg("pos_reduce_only", "Reduce only"),
                )
              : null,
          ),
      /* **Side first, as a pair of buttons.** The order every venue puts it
         in, because it is the decision everything else depends on. */
      React.createElement(
        AlertPosSides,
        null,
        ...[
          ["long", msg("pos_long", "Long")],
          ["short", msg("pos_short", "Short")],
        ].map(([v, label]) =>
          React.createElement(
            AlertPosSide,
            {
              key: v,
              active: side === v,
              "aria-pressed": side === v,
              onClick: () => panel.setState({ pSide: v, pTicketWhy: null }),
            },
            label,
          ),
        ),
      ),
      /* **What you already hold on this market, above the form.**
       *
       * It was one contract's own line, because a coin could hold one. It can
       * hold as many as the balance carries now, so this is the market's
       * summary: how many are running, what they are worth between them, and
       * what they are doing right now. The individual contracts are the
       * Positions tab, one row each — putting twenty of them above an order
       * form would bury the form.
       *
       * Absent, not empty, when nothing is held here. */
      heldHere.length
        ? React.createElement(
            AlertPosHeld,
            { "data-practice-held": "true" },
            React.createElement(
              "strong",
              null,
              heldHere.length === 1
                    ? msg("pos_held_one", "1 contract on $1", coin)
                    : msg("pos_held_many", "$1 contracts on $2", String(heldHere.length), coin),
            ),
            (() => {
              let longs = 0;
              for (const id of heldHere) {
                if (practice.positions[id].side !== "short") longs += 1;
              }
              const shorts = heldHere.length - longs;
              return React.createElement(
                "span",
                null,
                msg("pos_held_sides", "$1 long · $2 short", String(longs), String(shorts)),
              );
            })(),
            (() => {
              const markE4 = live > 0 ? Math.round(live * PRICE_SCALE) : 0;
              if (!markE4) return null;
              let margin = 0;
              let pnl = 0;
              for (const id of heldHere) {
                const p = practice.positions[id];
                margin += p.margin;
                pnl += practiceUnrealised(p, markE4);
              }
              const amount = (v) => (inverse
                ? practiceCoinText(v, coin)
                : practiceMoneyText(v, panel.posSymbol()));
              return React.createElement(
                Fragment,
                null,
                React.createElement(
                  "span",
                  null,
                  msg("pos_held_margin", "$1 committed", amount(margin)),
                ),
                React.createElement(
                  AlertPosValue,
                  { tone: pnl > 0 ? "up" : pnl < 0 ? "down" : null },
                  `${pnl >= 0 ? "+" : "\u2212"}${amount(Math.abs(pnl))}`,
                ),
              );
            })(),
            /* **And the rule, which is now the opposite of the old one.**
             * Reported three times as "I already hold one and cannot take
             * another": that was true, it was the store's shape rather than a
             * decision, and it is gone. */
            /* One line, not a paragraph: the ticket grew by a row of
               consequences on 18 Sep 2026 and the desk has to fit the
               window, so the rule says only what it rules. That each
               contract is its own row is what the Positions tab shows. */
            React.createElement(
              AlertPosHeldWhy,
              null,
              msg("pos_held_why_short", "As many as your balance carries, long and short at once."),
            ),
          )
        : null,
      /* **The setup before the size.** The four gates are read before a
         leverage or a size is chosen — the order the process runs in — and
         up here the "How" chip is clear of the sticky foot's shadow, which
         is where it landed below the impact grid at 1280 px. */
      panel.renderSetupGates(coin, impact, stopRaw),
      /* The venue's order, leverage first: the rail is the biggest control
         on the ticket and the size box reads as its consequence. */
      levStep, sizeStep,
      /* **The bracket, in one line, under the figures it explains.**
       *
       * Drawn whether or not the order is accepted: a refusal that says "this
       * size allows less leverage" is useless without the size ladder beside
       * it. */
      ticketTier
        ? React.createElement(
            AlertPosNote,
            { "data-practice-tier": String(ticketTier.tier) },
            ticketTier.upTo === Infinity
              ? msg(
                  "pos_tier_top",
                  "Bracket $1 · the largest · keeps $2 of the contract · max $3x",
                  String(ticketTier.tier),
                  `${(ticketTier.mmrPpm / 10000).toFixed(2)}%`,
                  String(ticketTier.maxLeverage),
                )
              : msg(
                  "pos_tier_line",
                  "Bracket $1 · up to $2 of contract · keeps $3 of it · max $4x",
                  String(ticketTier.tier),
                  /* Always quote money, on both settlements: a bracket is a
                     ceiling on the contract's *notional*, which an inverse
                     account writes in quote money too. A coin formatter would
                     print it as coin here and be wrong by the price. */
                  practiceMoneyText(ticketTier.upTo, panel.posSymbol()),
                  `${(ticketTier.mmrPpm / 10000).toFixed(2)}%`,
                  String(ticketTier.maxLeverage),
                ),
          )
        : !tiersOn && impact
          ? React.createElement(
              AlertPosNote,
              { "data-practice-tier": "off" },
              msg(
                "lim_tiers_now_off",
                "Off — the account maximum, $1, applies at every size. This is not how a real venue limits large positions.",
                `${leverage}x`,
              ),
            )
          : null,
      impact && !scaleOn
        ? React.createElement(
            AlertPosImpact,
            { cells: impactCells.length, "data-practice-impact": "true" },
            ...impactCells.map(([label, value], i) =>
              React.createElement(
                AlertPosImpactCell,
                /* Keyed by position: one of these labels is an element (the
                   margin cell carries its own ring), and an element makes a
                   key React cannot compare. */
                { key: i },
                label,
                React.createElement(AlertPosImpactValue, null, value),
              ),
            ),
          )
        : null,
      /* One contract's figures, at one price: a scaled order is several at
         several, so its own lines (below the prices) stand in for them. */
      impact && !scaleOn ? panel.renderTicketDetails(impact, coin, long, inverse) : null,
      /* **The three prices together, each with its own name.** Entry was a
         lone unlabelled box squeezed against the right edge; a stop and a
         take-profit are the same kind of thing and belong beside it, in the
         order they are decided — where you get in, where you get out if you
         are wrong, where you get out if you are right.
         Stop and take-profit are optional: an empty field is no order. */
      React.createElement(
        AlertPosFields,
        { "data-practice-levels": "true" },
        React.createElement(
          AlertPosFieldCol,
          null,
          React.createElement(
            AlertPosField,
            null,
            orderKind === "stop"
              ? msg("pos_trigger", "Trigger")
              : scaleOn ? msg("pos_scale_from", "From")
              : limitOrder ? msg("pos_limit", "Limit") : msg("pos_entry", "Entry"),
            React.createElement(
              AlertPosInputWrap,
              null,
              /* The symbol belongs to the field, not to the value: the value
                 is parsed straight back with `Number()`, so a formatted one
                 would have to be un-formatted again on every keystroke. A
                 price with no currency on it, beside four figures that all
                 carry one, was the only bare number on the ticket. */
              inverse
                ? null
                : React.createElement(AlertPosInputUnit, { "aria-hidden": "true" }, panel.posUnit()),
              React.createElement(AlertPosInput, {
                type: "text",
                inputMode: "decimal",
                value: entryText,
                disabled: false,
                "aria-label": msg("pos_entry_aria", "Entry price"),
                "aria-invalid": st.numWarn === "pEntry" ? "true" : "false",
                onChange: (e) => panel.numberField("pEntry", e.target.value),
              }),
            ),
          ),
        ),
        /* **The stop and the take-profit, each as one column.**
         *
         * Label, field, the shortcuts that write into it, and what the level
         * is worth. All four used to be two separate blocks with the name
         * repeated in each, and a bare `—` under a row of chips that nothing
         * explained — it is the money, before there is a level to price.
         *
         * The percentage writes a **price into the field** rather than being
         * held as a percentage of its own, so the field stays the single
         * source of truth and there is no second value to drift from it.
         * The money is `practiceCloseQuote` run against the probed position,
         * so it carries the adverse fill and the exit fee: it is what the
         * trigger will actually pay, not what the prices suggest. */
        ...[
          ["stop", msg("pos_stop", "Stop"), "pStop", PRACTICE_STOP_PCTS, long,
            msg("pos_stop_aria", "Stop price")],
          ["take", msg("pos_take", "Take profit"), "pTake", PRACTICE_TAKE_PCTS, !long,
            msg("pos_take_aria", "Take-profit price")],
        ].map(([key, label, field, pcts, below, aria]) => {
          const pnl = impact ? (key === "stop" ? impact.stopPnl : impact.takePnl) : null;
          return React.createElement(
            AlertPosFieldCol,
            { key },
            React.createElement(
              AlertPosField,
              null,
              label,
              React.createElement(
                AlertPosInputWrap,
                null,
                inverse
                  ? null
                  : React.createElement(
                      AlertPosInputUnit,
                      { "aria-hidden": "true" },
                      panel.posUnit(),
                    ),
                React.createElement(AlertPosInput, {
                  type: "text",
                  inputMode: "decimal",
                  value: st[field] === undefined ? "" : st[field],
                  /* "none" rather than "optional": it is what an empty field
                     means (no stop, no take), and it fits the 120px field
                     a 416px desk leaves — "optional" was cut to "optiona". */
                  placeholder: msg("pos_level_none", "none"),
                  disabled: false,
                  "aria-label": aria,
                  "aria-invalid": st.numWarn === field ? "true" : "false",
                  onChange: (e) => panel.numberField(field, e.target.value),
                }),
              ),
            ),
            React.createElement(
              AlertPosChips,
              null,
              ...pcts.map((pct) =>
                React.createElement(
                  AlertPosChip,
                  {
                    key: pct,
                    disabled: false,
                    "aria-label": msg(
                      "pos_level_pct_aria",
                      "$1 at $2 percent from the entry",
                      label,
                      String(pct),
                    ),
                    onClick: () => {
                      if (holding) return;
                      const level = Math.round(entryE4 * (1 + (below ? -pct : pct) / 100));
                      if (level < 1) return;
                      panel.numberField(field, String(level / PRICE_SCALE));
                    },
                  },
                  `${below ? "\u2212" : "+"}${pct}%`,
                ),
              ),
            ),
            /* Absent, not a dash, until there is a level to price: an empty
               figure under a row of chips reads as a broken readout. */
            pnl == null
              ? null
              : React.createElement(
                  AlertPosLevelValue,
                  { tone: pnl > 0 ? "up" : pnl < 0 ? "down" : null },
                  `${pnl >= 0 ? "+" : "\u2212"}${
                    inverse
                      ? practiceCoinText(Math.abs(pnl), coin)
                      : practiceMoneyText(Math.abs(pnl), panel.posSymbol())
                  }`,
                ),
          );
        }),
          ),
      /* Reward against risk, on the two figures above it. Both net of fees,
         so it is the ratio you actually get — on a small position the exit
         fees alone move 1:2 to 1:1.6. Only when the stop really loses: a
         "stop" that makes money is a take-profit in the wrong box, which
         `wrongSide` already says, and a ratio drawn from it would dress a
         mistake up as a plan. */
      /* The scale's own row: where it ends, how many, and each level. */
      scaleOn ? panel.renderScaleRow(scaleCount, scaleToText, scaleProbe, coin) : null,
      impact && impact.rr && !scaleOn
        ? React.createElement(
            AlertPosRatio,
            null,
            React.createElement("span", null, msg("pos_rr", "Reward : risk")),
            React.createElement("strong", null, `1 : ${impact.rr.toFixed(2)}`),
          )
        : null,
      /* **The explanation, under the numbers it explains.** Drawn only when
         asked for and only when there is a probe to read figures off: a card
         about "your margin" with no contract on the ticket would be the
         general prose this deliberately is not. */
      st.pWhat && impact
        ? panel.renderPracticeWhat(st.pWhat, {
            leverage,
            marginText: inverse
              ? practiceCoinText(impact.margin, coin)
              : practiceMoneyText(impact.margin, panel.posSymbol()),
            notionalText: practiceMoneyText(
              inverse ? panel._posQty : impact.notional,
              panel.posSymbol(),
            ),
            awayText: impact.away == null
              ? msg("pos_liq_none", "none at 1x")
              : `${impact.away.toFixed(2)}%`,
            /* `null` while the wall is off: a sentence about "at most" a
               figure that does not exist would print Infinity. */
            capText: (() => {
              const cap = practiceMarginWall(practice.plan, practiceAccountSize(practice, coin));
              if (cap === Infinity) return null;
              return inverse ? practiceCoinText(cap, coin) : practiceMoneyText(cap, panel.posSymbol());
            })(),
          })
        : null,
      /* **The way out of the ticket, pinned to its foot.**
       *
       * Measured: on a 1280×720 viewport the button's bottom edge landed at
       * 732px — twelve pixels below the fold, with the panel scrolling. It is
       * reachable and it is not *there*, and 1366×768 is a live laptop. No
       * venue lets the order button leave the screen.
       *
       * So the last three things — what the press was told, the way on when a
       * session limit stopped you, and the button itself — sit in a sticky
       * foot and the form scrolls behind them. The note comes with the button
       * deliberately: a refusal printed above the fold with the button below
       * it is the same defect from the other end. */
      React.createElement(
        AlertPosTicketFoot,
        /* Drawn only when something is actually under it — see
           `measureBody` in alerts.js. */
        { "data-practice-ticket-foot": "true", under: panel.state.bodyOver === true },
      React.createElement(
        AlertPosNote,
        null,
        /* **What the press was told, ahead of what the probe expects.** The
           probe runs the same operation and catches almost everything before
           the button is pressed — but not a storage refusal, and not a change
           that landed between the render and the click. Without this the
           refusal was set on state and drawn nowhere, which is the silent
           failure this panel keeps being audited for. */
        panel.numberWarning("pEntry", "pStop", "pTake", "pScaleTo")
          || (scaleOn ? (st.pTicketWhy ? msg("pos_refused", "Cannot open — $1.", panel.refusalText(st.pTicketWhy, practice)) : null) || scaleNote : null)
          || (st.pTicketWhy
                ? msg("pos_refused", "Cannot open — $1.", panel.refusalText(st.pTicketWhy, practice))
                : null)
          || (reduceOnly ? null : wrongSide)
          || preview,
      ),
      /* **The way on, where you were stopped.**
       *
       * Three refusals mean "this session is over", and the thing that clears
       * them lived on the Account tab — a screen somebody meeting a limit on
       * the ticket has no reason to open. So the ticket said "this session has
       * opened every contract it is allowed" and offered nothing, which reads
       * as "your account is broken and you have money in it".
       *
       * It keeps the balance, the lots and the record; only the two marks the
       * caps are measured from move. Same handler as the Account tab's, so
       * there is one implementation of "the next session begins". */
      ["planLoss", "ended"].includes(refused) && !holding
        ? React.createElement(
            AlertPosButton,
            {
              "data-practice-ticket-session": "true",
              onClick: () =>
                panel.props.onPracticeNewSession && panel.props.onPracticeNewSession(),
            },
            msg("pos_new_session", "Start the next session"),
          )
        : null,
      React.createElement(
        AlertPosButton,
        {
          /* P8 — Enter presses this, through this: the keyboard goes through
             the same confirmation and the same refusal as the pointer. */
          "data-practice-order-button": "true",
          /* A reduce-only order carries no stop or take — it *is* the way
             out — so a stop left in the field from the last contract, on
             the wrong side of this price, must not hold it back. Found with
             the ticket keeping a long's stop above a reduce price. */
          disabled: scaleOn
            ? !scaleProbe || Boolean(scaleProbe.error)
            : !usable || (Boolean(wrongSide) && !reduceOnly) || Boolean(refused),
          /* **One button, three operations, and it says which.** A venue's
             order button does exactly this: the symbol you are on, the side
             you chose, and what that does to what you already hold. */
          onClick: () => {
            /* **Ask first, when asked to ask.** Off by default, because a
               simulator is a place to press the button and find out; on, it
               is the same two-press shape the close shares and Start over
               already use, and the button says what the second press does. */
            if (panel.props.practiceConfirm && st.pArm !== side) {
              panel.setState({ pArm: side, pTicketWhy: null });
              return;
            }
            /* **A limit order is placed, not opened**, and it goes to a
               different handler because it is a different thing: nothing is
               opened, money is reserved against a price that has not happened
               yet. It lands on the Orders tab rather than on Positions, which
               is where it actually is. */
            /* A scaled order is placed whole or not at all — see
               practicePlaceScale — and lands on Orders like any limit. */
            if (scaleOn) {
              const no = panel.props.onPracticeScale && panel.props.onPracticeScale({
                coin,
                side,
                leverage,
                qty: panel._posQty,
                from: entryE4,
                to: scaleToE4,
                count: scaleCount,
                stop: stopRaw ? Math.round(Number(stopRaw) * PRICE_SCALE) : null,
                take: takeRaw ? Math.round(Number(takeRaw) * PRICE_SCALE) : null,
              });
              if (!no) panel.setState({ pTab: "orders", pTicketWhy: null, pArm: null });
              else panel.setState({ pTicketWhy: no, pArm: null });
              return;
            }
            if (limitOrder) {
              const no = panel.props.onPracticeOrder && panel.props.onPracticeOrder({
                coin,
                side,
                leverage,
                /* A reduce-only order cannot ask for more than it could
                   reduce; the rest would simply never be done. */
                qty: reduceOnly ? Math.min(panel._posQty, againstQty) : panel._posQty,
                limit: entryE4,
                kind: orderKind,
                reduce: reduceOnly,
                /* **The stop and take typed on the ticket ride the order**
                   (27 Sep 2026) and land on the contract when it fills. They
                   were dropped here before: a limit with a stop typed on it
                   opened without one. */
                stop: !reduceOnly && stopRaw ? Math.round(Number(stopRaw) * PRICE_SCALE) : null,
                take: !reduceOnly && takeRaw ? Math.round(Number(takeRaw) * PRICE_SCALE) : null,
              });
              const named = no === "crosses" && orderKind === "stop" ? "stopCrosses" : no;
              if (!no) panel.setState({ pTab: "orders", pTicketWhy: null, pArm: null });
              else panel.setState({ pTicketWhy: named, pArm: null });
              return;
            }
            const why = onPracticeOpen && onPracticeOpen({
              coin,
              side,
              leverage,
              qty: panel._posQty,
              entry: entryE4,
              /* Sent as prices, validated by the model against the entry: a
                 stop on the wrong side would fire on the next tick, so it is
                 refused there rather than accepted here. */
              stop: stopRaw ? Math.round(Number(stopRaw) * PRICE_SCALE) : null,
              take: takeRaw ? Math.round(Number(takeRaw) * PRICE_SCALE) : null,
              /* The moment's facts as codes, so the record can be read by
                 setup later. */
              setup: outlookSetupCodes(panel.setupFacts(coin, impact, stopRaw)),
            });
            /* Straight to the list, and to no row in particular: the contract
               just opened is the newest one there, and `pOpen: null` is
               "nobody has chosen", which opens the first. */
            if (!why) panel.setState({ pTab: "open", pOpen: null, pTicketWhy: null, pArm: null });
            else panel.setState({ pTicketWhy: why, pArm: null });
          },
        },
        st.pArm === side
          ? msg("pos_do_again", "Press again to confirm")
          : scaleOn
            ? (side === "short"
                ? msg("pos_place_scale_short", "Place $1 shorts from $2 to $3", String(scaleCount), practicePriceText(entryE4, panel.posSymbol()), scaleToE4 > 0 ? practicePriceText(scaleToE4, panel.posSymbol()) : "…")
                : msg("pos_place_scale_long", "Place $1 longs from $2 to $3", String(scaleCount), practicePriceText(entryE4, panel.posSymbol()), scaleToE4 > 0 ? practicePriceText(scaleToE4, panel.posSymbol()) : "…"))
          : orderKind === "stop"
            ? (side === "short"
                ? msg("pos_place_stop_short", "Short if it breaks $1", practicePriceText(entryE4, panel.posSymbol()))
                : msg("pos_place_stop_long", "Long if it breaks $1", practicePriceText(entryE4, panel.posSymbol())))
          : reduceOnly
            ? msg("pos_place_reduce", "Reduce at $1", practicePriceText(entryE4, panel.posSymbol()))
          : limitOrder
            ? (side === "short"
                ? msg("pos_place_short", "Place a short at $1", practicePriceText(entryE4, panel.posSymbol()))
                : msg("pos_place_long", "Place a long at $1", practicePriceText(entryE4, panel.posSymbol())))
            : side === "short"
              ? msg("pos_open_short", "Open short on $1", coin)
              : msg("pos_open_long", "Open long on $1", coin),
      ),
      ),
    );
  },

  /* **THE ACCOUNT TAB: what this account is, rather than what it is doing.**
   *
   * Two things live here and they belong together for one reason — both of
   * them describe the account before a single contract is opened, and both
   * of them start a fresh one when they change.
   *
   * **The balance** was at the foot of the ticket, under the button, and only
   * while nothing was open. That is where it is *used* and not where it is
   * *decided*: it vanished the moment there was a position, so the one
   * question it answers — "how big is this account" — had no place to be
   * asked from once the account was running.
   *
   * **The limits are the part that was invisible, and they were refusing
   * orders.** `practice.plan` has been enforced by the model since the first
   * day and shown by nothing. `marginSharePct` is what turns the ticket's 100%
   * button into "more margin than this account commits at once", and
   * `sessionLossPct` — off unless somebody asks for it — ends the session
   * outright. A rule you can be stopped by is a rule you are owed a sight of.
   *
   * The contract quota that used to head this list is **gone from the product**
   * (16 Sep 2026), not merely hidden: it refused the sixth contract an account
   * ever opened with most of the money still in it, and no venue has such a
   * thing. `PRACTICE_PLAN_LIMITS` carries the reasoning.
   *
   * **Two of the six are not offered, deliberately.** `lossPerTradePct` is
   * read only by `practiceSizeForPlan`, which nothing calls, and `durationMin`
   * is read by nothing at all — a control that cannot change what happens is
   * one this codebase removes rather than ships.
   *
   * **Changing anything here starts a new account**, which is the rule the
   * balance already followed, and it is refused while a contract is open
   * rather than hidden: `resetPractice` refuses, so a control that looked
   * pressable and did nothing would be the worse half of the same bug the
   * ticket's button had.
   */
  /* **The account summary — where you stand, before anything you can set.**
   *
   * The tab opened on a *control*: Settlement, then the balance box, then four
   * rows of chips. Every venue read for this (OKX, Binance, BitMEX — see
   * `docs/product/derivatives-simulator/ACCOUNT_SCREEN_RESEARCH.md`) opens on
   * equity, free margin, margin in use and unrealised P/L, and for a reason
   * that is not decoration: those four are the only numbers on the screen you
   * cannot change, and everything below them is a rule you set *against* them.
   * Reading four chip rows to work out how much room is left is work the
   * screen can do.
   *
   * It costs no request. `practiceEquity` and `practiceFreeBalance` are model
   * functions and the marks are the ticker snapshot the panel already holds;
   * where a coin has no mark, `practiceEquity` falls back to the position's
   * own margin rather than dropping it, so the total is never quietly short.
   *
   * **Unrealised is absent, not zero, when nothing is open** — an absence and
   * a flat result are different facts, the rule the portfolio's empty total
   * already follows. */
  practiceSummary: (practice, marks) => {
    const inverse = practiceIsCoinSettled(practice);
    const coin = panel.props.activeCoin;
    const wallet = inverse ? practiceWallet(practice, coin) : null;
    const equity = practiceEquity(practice, marks, coin);
    const free = practiceFreeBalance(practice, coin);
    const used = inverse ? wallet.margin : practice.margin;
    /* Every contract, and each one knows its own market — an inverse account
       reads only the one it is settled in. */
    let unrealised = null;
    for (const id of practiceList(practice)) {
      const p = practice.positions[id];
      if (inverse && p.coin !== coin) continue;
      const mark = marks && marks[p.coin];
      if (!(mark > 0)) continue;
      unrealised = (unrealised || 0) + practiceUnrealised(p, mark);
    }
    /* The loss cap as a proportion rather than a sentence. `realised` is
       signed and a gain is not progress toward a loss limit, so only a
       negative one counts — a profitable account showing a filled bar would
       be reading the sign backwards. */
    const cap = practiceSessionLossCap(practice, coin);
    const lost = Math.max(0, -(inverse ? wallet.realised : practice.realised));
    return {
      equity,
      free,
      used,
      unrealised,
      lost,
      cap,
      lossPct: cap > 0 ? Math.min(100, (lost / cap) * 100) : 0,
      open: practiceCount(practice),
    };
  },

  /* **Where the money is, market by market.**
   *
   * One wallet carries every market now (62 coins have a perpetual), and the
   * question an account with several markets in it is asked is *which one is
   * doing what*. One row per market that has anything on it or anything in
   * its record: how many contracts are open, the margin behind them, what
   * they are showing at the mark, what closing has made there, and what fees
   * and funding have cost there. Read from the positions and the ledger the
   * totals above are made of — with one exception it says out loud: a record
   * that was cleared is folded into one summary with no markets in it
   * (`practiceForgetClosed`), so its results count above and in no row. */
  renderMarketBreakdown: (practice, marks, accountAmount) => {
    const rows = {};
    const row = (c) =>
      rows[c] || (rows[c] = { coin: c, open: 0, margin: 0, unrealised: 0, priced: true, realised: 0, costs: 0 });
    for (const id of practiceList(practice)) {
      const p = practice.positions[id];
      const r = row(p.coin);
      r.open += 1;
      r.margin += p.margin;
      const mark = marks && marks[p.coin];
      if (mark > 0) r.unrealised += practiceUnrealised(p, mark);
      else r.priced = false;
    }
    for (const e of practice.ledger || []) {
      if (!e.coin) continue;
      const r = row(e.coin);
      r.realised += e.realised || 0;
      r.costs += (e.fee || 0) + (e.funding || 0);
    }
    const list = Object.values(rows).sort((a, b) => b.margin - a.margin || a.coin.localeCompare(b.coin));
    if (!list.length) return null;
    const signed = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${accountAmount(Math.abs(v))}`;
    const tone = (v) => (v > 0 ? "up" : v < 0 ? "down" : null);
    return React.createElement(
      Fragment,
      null,
      React.createElement(AlertPosSectionHead, null, msg("pos_sec_markets", "By market")),
      React.createElement(
        AlertPosMarketTable,
        { "data-practice-by-market": String(list.length), role: "table" },
        React.createElement(
          AlertPosMarketRow,
          { head: true, role: "row" },
          ...[
            msg("pos_bm_market", "Market"),
            msg("pos_bm_open", "Open"),
            msg("pos_bm_margin", "Margin"),
            msg("pos_bm_unrealised", "Unrealized"),
            msg("pos_bm_realised", "Realized"),
            msg("pos_bm_costs", "Fees + funding"),
          ].map((t) => React.createElement("span", { key: t, role: "columnheader" }, t)),
        ),
        ...list.map((r) =>
          React.createElement(
            AlertPosMarketRow,
            { key: r.coin, role: "row", "data-practice-by-market-row": r.coin },
            React.createElement("strong", { role: "cell" }, r.coin),
            React.createElement("span", { role: "cell" }, String(r.open)),
            React.createElement("span", { role: "cell" }, r.open ? accountAmount(r.margin) : "—"),
            React.createElement(
              AlertPosValue,
              { role: "cell", tone: r.open && r.priced ? tone(r.unrealised) : null },
              r.open ? (r.priced ? signed(r.unrealised) : msg("pos_paused", "paused")) : "—",
            ),
            React.createElement(AlertPosValue, { role: "cell", tone: tone(r.realised) }, signed(r.realised)),
            React.createElement("span", { role: "cell" }, accountAmount(r.costs)),
          ),
        ),
      ),
      practice.summary && practice.summary.count > 0
        ? React.createElement(
            AlertPosNote,
            null,
            msg(
              "pos_bm_cleared",
              "Contracts you cleared from the record count in the totals above and in no row here — clearing keeps the sum, not the markets.",
            ),
          )
        : null,
    );
  },

  renderPracticeAccount: (practice, _onPracticeReset, marks, part) => {
    const st = panel.state;
    const symbol = panel.posSymbol();
    const money = (v) => practiceMoneyText(v, symbol);
    const inverse = practiceIsCoinSettled(practice);
    const activeCoin = panel.props.activeCoin;
    const wallet = inverse ? practiceWallet(practice, activeCoin) : null;
    const accountAmount = (v) => inverse
      ? practiceCoinText(v, activeCoin)
      : money(v);
    const live = Object.keys(practice.positions).length;
    /* The deposit currently in flight, or null. Named apart from
       `st.funding`, which is this coin's perpetual funding *rate* — two
       different things one letter apart. */
    const landing = st.pFundAmt;
    const withdrawing = st.pWithdrawAmt;
    const moneyBusy = Boolean(landing || withdrawing);
    const moneyDone = st.pMoneyDone;
    /* The units the amount may be typed in, and which one is in force. Read
       once here rather than per element: `fundUnits` walks the ticker
       snapshot, and the field, the toggle and the conversion line must all be
       describing the same list. */
    const fundUnits = panel.fundUnits(practice);
    const fundUnit = panel.fundUnit(practice);
    const fundQuote = panel.fundQuote(practice);
    const chip = (key, value, label, active, disabled) =>
      React.createElement(
        AlertPosChip,
        {
          key: `${key}-${value}`,
          active,
          disabled,
          "aria-pressed": active,
          onClick: () =>
            !disabled &&
            panel.props.onPracticePlan &&
            panel.props.onPracticePlan(key, value),
        },
        label,
      );
    /* Where you stand, beside each limit — the half a number on its own does
       not give you. "5" is a rule; "3 of 5 opened" is a position in it. */
    const plan = practice.plan;
    const accountStart = inverse ? practice.startCollateral : practice.startBalance;
    const realised = inverse ? wallet.realised : practice.realised;
    const marginCap = practiceMarginWall(plan, accountStart);
    const marginOff = marginCap === Infinity;
    const tiersOn = plan.sizeTiers !== 0;
    /* Both of these can be **off**, which is their default. `null` rather than
       a number, so a figure that does not exist cannot be printed as one. */
    const lossOff = !(plan.sessionLossPct > 0);
    const lossCap = lossOff ? null : Math.ceil((accountStart * plan.sessionLossPct) / 100);
    /* Which cap, if either, has stopped this session — read from the model's
       own counters rather than from a flag, so the screen and `practiceCanOpen`
       cannot disagree about whether you are stopped. */
    /* Only one rule can stop a session now, and it is off unless somebody asks
       for it: the contract quota is gone from the product entirely. */
    const capped = practiceSessionLoss(practice, activeCoin)
      >= practiceSessionLossCap(practice, activeCoin)
      ? "loss"
      : null;
    /* One word for a rule that is not in force, used by the head readout and by
       its own chip, so the two cannot describe it differently. */
    const offText = msg("pos_lim_off", "Off");
    const limits = [
      [
        "maxLeverage",
        msg("pos_lim_lev", "Most leverage"),
        `${plan.maxLeverage}x`,
        (v) => `${v}x`,
        null,
      ],
      [
        "sizeTiers",
        msg("pos_lim_tiers", "Size-based leverage"),
        tiersOn ? msg("toggle_on", "On") : offText,
        (v) => (v ? msg("toggle_on", "On") : offText),
        tiersOn
          ? msg(
              "pos_tier_line",
              "Bracket $1 · up to $2 of contract · keeps $3 of it · max $4x",
              "1",
              money(PRACTICE_RISK_TIERS[0].upTo),
              `${(PRACTICE_RISK_TIERS[0].mmrPpm / 10000).toFixed(2)}%`,
              String(PRACTICE_RISK_TIERS[0].maxLeverage),
            )
          : msg(
              "lim_tiers_now_off",
              "Off — the account maximum, $1, applies at every size. This is not how a real venue limits large positions.",
              `${plan.maxLeverage}x`,
            ),
      ],
      [
        "marginSharePct",
        msg("pos_lim_margin", "Margin per contract"),
        marginOff ? offText : `${plan.marginSharePct}%`,
        (v) => (v > 0 ? `${v}%` : offText),
        marginOff
          ? msg("pos_lim_margin_off", "no wall — one contract may take all of the free balance")
          : msg("pos_lim_margin_at", "at most $1 of margin in any one contract", accountAmount(marginCap)),
      ],
      [
        "sessionLossPct",
        msg("pos_lim_loss", "Loss that ends the session"),
        lossOff ? offText : `${plan.sessionLossPct}%`,
        (v) => (v > 0 ? `${v}%` : offText),
        lossOff
          ? msg(
              "pos_lim_loss_off",
              "no limit — only margin and liquidation end a contract",
            )
          : realised < 0
            ? msg("pos_lim_loss_at", "$1 of $2 lost so far", accountAmount(-realised), accountAmount(lossCap))
            : msg("pos_lim_loss_none", "nothing lost yet, out of $1", accountAmount(lossCap)),
      ],
      /* **Pause after N losses in a row** — off is 0. The note counts the
         streak the record ends with, which is what the rule reads. */
      [
        "streakPause",
        msg("pos_lim_streak", "Pause after losses in a row"),
        plan.streakPause > 0 ? String(plan.streakPause) : offText,
        (v) => (v > 0 ? String(v) : offText),
        plan.streakPause > 0
          ? msg("pos_lim_streak_at", "no new contract after $1 losses in a row — $2 in a row now", String(plan.streakPause), String(practiceLossStreak(practice)))
          : msg("pos_lim_streak_off", "no pause — the third loss in a row is the one the record says is taken angry"),
      ],
    ];
    const sum = panel.practiceSummary(practice, marks);
    const units = panel.practiceUnits();
    const head = (key, title) =>
      React.createElement(AlertPosSectionHead, { key }, title);
    /* **The money is a tab of its own — Funds.** Asked for as "change money
       kısmını funds diye aynı account gibi bir şey yap": Add funds and
       Withdraw are two cards on one pane beside the account, not a drawer at
       its foot. The pane is built here because it reads the account's own
       locals; the desk asks for it with `part === "funds"`. */
    const fundsPane =
        React.createElement(
          AlertPosFunds,
          { "data-practice-funds": "true" },
            React.createElement(
              AlertPosNote,
              { "data-practice-money-note": "true" },
              msg(
                "pos_money_game",
                "Practice controls only: Add funds and Withdraw change this game's local balance. No deposit, withdrawal, wallet, exchange account or real money exists.",
              ),
            ),
            head("balance", msg("pos_sec_balance", "Balance")),
            /* **One additive path, with one explicit confirmation.** Presets
               used to begin the wait themselves and Enter on the custom field
               did too. Now they only prepare the amount; the named button is
               the single place that can commit it. */
            React.createElement(
              AlertPosStep,
              { "data-practice-fund": "true" },
              React.createElement(
                AlertPosStepHead,
                null,
                React.createElement("span", null, msg("pos_fund", "Add funds")),
                React.createElement(
                  AlertPosStepValue,
                  null,
                  msg(
                    "pos_fund_size",
                    "account $1",
                    accountAmount(practiceAccountSize(practice, activeCoin)),
                  ),
                ),
              ),
              React.createElement(
                AlertPosPresets,
                null,
                ...(inverse ? PRACTICE_DEPOSIT_PRESETS_E8 : PRACTICE_DEPOSIT_PRESETS).map((v) => {
                  const selected = fundUnit === (inverse ? activeCoin : "cash")
                    && fundQuote && fundQuote.amount === v;
                  return React.createElement(
                    AlertPosChip,
                    {
                      key: v,
                      active: selected,
                      disabled: moneyBusy,
                      "aria-pressed": selected,
                      "aria-label": msg(
                        "pos_fund_add",
                        "Add $1 to the deposit amount",
                        accountAmount(v),
                      ),
                      onClick: () => panel.choosePracticeDeposit(practice, v),
                    },
                    inverse
                      ? `+${practiceCoinText(v).replace(/0+$/, "").replace(/\.$/, "")}`
                      : `+${practiceMoneyShort(v, symbol)}`,
                  );
                }),
              ),
          React.createElement(
            AlertPosMoneyField,
            null,
            /* The unit is the sign as well as the switch: the box reads
               `BTC 0.5` the way it reads `$ 500`, so the number is never
               floating without one. */
            React.createElement(
              AlertPosMoneySign,
              null,
              (fundUnits.find((u) => u.id === fundUnit) || fundUnits[0]).label,
            ),
            React.createElement(AlertPosMoney, {
              type: "text",
              inputMode: "decimal",
              disabled: moneyBusy,
              value: st.pFund === undefined ? "" : st.pFund,
              placeholder: msg("pos_fund_placeholder", "amount"),
              "aria-label": inverse
                ? msg("pos_fund_aria_coin", "Amount to add to this coin's wallet")
                : msg("pos_fund_aria", "Amount to add to the simulated balance"),
              "aria-invalid": st.numWarn === "pFund" ? "true" : "false",
              onChange: (e) => {
                panel.numberField("pFund", e.target.value);
                panel.setState({ pFundWhy: null, pMoneyDone: null, pReset: null });
              },
            }),
            /* Absent rather than disabled when there is only one unit — a
               single-choice toggle is furniture. That happens when the ticker
               has no price yet, which is also exactly when a conversion would
               have nothing to convert at. */
            fundUnits.length > 1
              ? React.createElement(
                  AlertPosUnits,
                  null,
                  ...fundUnits.map((u) =>
                    React.createElement(
                      AlertPosUnit,
                      {
                        key: u.id,
                        active: fundUnit === u.id,
                        disabled: moneyBusy,
                        "aria-pressed": fundUnit === u.id,
                        "aria-label": msg("pos_fund_unit", "Type the amount in $1", u.label),
                        onClick: () => !moneyBusy && panel.setFundUnit(practice, u.id),
                      },
                      u.label,
                    ),
                  ),
                )
              : null,
          ),
          /* **What a typed coin amount actually adds, and at what price.**
             A conversion nobody can see is a number appearing from nowhere,
             and the rate is the part that decides whether the figure is the
             one you meant. Drawn only when a conversion happened — under the
             account's own unit there is nothing to say. `~`, never `≈`: this
             line is 0.66rem and the two are hard to tell apart at that size.
             The rate shown is the one the press will use. */
          fundQuote && fundQuote.from
            ? React.createElement(
                AlertPosFundStatus,
                null,
                msg(
                  "pos_fund_rate",
                  "$1 ~ $2 at $3",
                  inverse
                    ? money(fundQuote.from.typed)
                    : `${practiceCoinText(fundQuote.from.typed)
                        .replace(/0+$/, "")
                        .replace(/\.$/, "")} ${fundQuote.from.coin}`,
                  accountAmount(fundQuote.amount),
                  panel.props.formatPrice(fundQuote.from.price / PRICE_SCALE, panel.props.currency),
                ),
              )
            : null,
          React.createElement(
            AlertPosFundRow,
            null,
            React.createElement(
              AlertPosTransferButton,
              {
                "data-practice-transfer": "deposit",
                /* **The same button is the way out.** While the deposit is
                   landing the press that started it cancels it — one control,
                   two states, and nothing else on the row to find. */
                disabled: landing ? false : moneyBusy || panel.typedDeposit(practice) === null,
                "aria-busy": landing ? "true" : "false",
                "aria-label": landing ? msg("pos_fund_cancel_aria", "Cancel — keep the money out") : undefined,
                complete: Boolean(moneyDone && moneyDone.kind === "deposit"),
                onClick: () => {
                  if (landing) return panel.cancelPracticeTransfer();
                  const want = panel.typedDeposit(practice);
                  if (want) panel.startPracticeDeposit(practice, want);
                },
              },
              landing
                ? React.createElement(
                    AlertPosFundTrack,
                    { key: `fund-${landing}`, "aria-hidden": "true" },
                    React.createElement(AlertPosFundFill, null),
                  )
                : null,
              React.createElement(
                AlertPosButtonLabel,
                null,
                moneyDone && moneyDone.kind === "deposit"
                  ? msg("tour_done", "Done")
                  : landing
                    ? msg("pos_fund_landing", "Adding $1…", accountAmount(landing))
                    : msg("pos_fund_go", "Add funds"),
              ),
            ),
          ),
          React.createElement(
            AlertPosFundStatus,
            { role: "status", "aria-live": "polite" },
            landing
              ? msg(
                  "pos_fund_wait",
                  "Adding $1 — about four seconds. Pressing the button again is the only way it does not land; closing this panel still adds it.",
                  accountAmount(landing),
                )
              : moneyDone && moneyDone.kind === "deposit"
                ? msg(
                    "pos_money_done",
                    "Simulation updated — $1. No real money moved.",
                    accountAmount(moneyDone.amount),
                  )
                : "",
          ),
          React.createElement(
            AlertPosHint,
            null,
            panel.numberWarning("pFund") ||
            (st.pFundWhy
              ? st.pFundWhy === "ended"
                ? msg(
                    "pos_fund_why_ended",
                    "This account has ended on its own loss limit. Adding funds cannot restart it — a limit you can pay your way past is not a limit. Reset the account to carry on.",
                  )
                : st.pFundWhy === "full"
                  ? msg(
                      "pos_fund_why_full",
                      "That would take the account past $1, which is as large as the arithmetic behind it stays exact at 200x.",
                      accountAmount(inverse ? PRACTICE_MAX_WALLET_E8 : PRACTICE_MAX_ACCOUNT_E2),
                    )
                  : st.pFundWhy === "save"
                    ? msg("pos_fund_why_save", "Nothing was added — this browser refused to store it.")
                    : msg("pos_fund_why_size", "That is not an amount this account can take.")
              : msg(
                  "pos_fund_note",
                  "$1 to $2, and it works while a contract is running — this is the one thing here that adds to the account instead of starting a new one. The amount can be typed in the account's own unit or in a coin, converted at the price on the button you press. The limits below are shares of the account's size, so they grow with it. Still imaginary money.",
                  accountAmount(inverse ? PRACTICE_MIN_DEPOSIT_E8 : PRACTICE_MIN_DEPOSIT_E2),
                  accountAmount(inverse ? PRACTICE_MAX_WALLET_E8 : PRACTICE_MAX_ACCOUNT_E2),
                )),
          ),
            ),
            /* **Withdraw is the other card, and one button is its whole
               control.** It takes the free simulated balance to zero and keeps
               the account's rules and record. The button arms on the first
               press ("Press again to confirm"), runs the four-second bar on
               the second, cancels on a press while it runs, and reads "Sent"
               when the money has gone. Refused while a contract is live, so
               "zero" stays exactly true. */
            React.createElement(
              AlertPosStep,
              { "data-practice-withdraw": "true" },
              React.createElement(
                AlertPosStepHead,
                null,
                React.createElement("span", null, msg("pos_withdraw", "Withdraw funds")),
                React.createElement(
                  AlertPosStepValue,
                  null,
                  accountAmount(practiceFreeBalance(practice, activeCoin)),
                ),
              ),
              React.createElement(
                AlertPosNote,
                { "data-practice-withdraw-note": "true" },
                msg(
                  "pos_withdraw_note",
                  "Withdraw all $1 of free balance and set it to zero. Your account rules and record stay. Close open contracts first. It is a game action — there is no wallet and no real transfer.",
                  accountAmount(practiceFreeBalance(practice, activeCoin)),
                ),
              ),
              React.createElement(
                AlertPosFundRow,
                null,
                React.createElement(
                  AlertPosTransferButton,
                  {
                    "data-practice-transfer": "withdraw",
                    disabled: withdrawing
                      ? false
                      : Boolean(live) || !(practiceFreeBalance(practice, activeCoin) > 0) || Boolean(landing),
                    "aria-busy": withdrawing ? "true" : "false",
                    "aria-label": withdrawing ? msg("pos_fund_cancel_aria", "Cancel — keep the money out") : undefined,
                    complete: Boolean(moneyDone && moneyDone.kind === "withdraw"),
                    onClick: () => {
                      if (withdrawing) return panel.cancelPracticeTransfer();
                      if (st.pReset === "withdraw") return panel.startPracticeWithdrawal(practice);
                      panel.setState({ pReset: "withdraw", pWithdrawWhy: null, pMoneyDone: null });
                    },
                  },
                  withdrawing
                    ? React.createElement(
                        AlertPosFundTrack,
                        { key: `withdraw-${withdrawing}`, "aria-hidden": "true" },
                        React.createElement(AlertPosFundFill, null),
                      )
                    : null,
                  React.createElement(
                    AlertPosButtonLabel,
                    null,
                    moneyDone && moneyDone.kind === "withdraw"
                      ? msg("pos_withdraw_sent", "Sent")
                      : withdrawing
                        ? msg("pos_withdraw_sending", "Sending $1\u2026", accountAmount(withdrawing))
                        : st.pReset === "withdraw"
                          ? msg("pos_do_again", "Press again to confirm")
                          : msg("pos_withdraw_all", "Withdraw all $1", accountAmount(practiceFreeBalance(practice, activeCoin))),
                  ),
                ),
              ),
              React.createElement(
                AlertPosFundStatus,
                { role: "status", "aria-live": "polite" },
                withdrawing
                  ? msg(
                      "pos_withdraw_wait",
                      "Withdrawing $1 — about four seconds. No real money is being sent.",
                      accountAmount(withdrawing),
                    )
                  : moneyDone && moneyDone.kind === "withdraw"
                    ? msg(
                        "pos_money_done",
                        "Simulation updated — $1. No real money moved.",
                        accountAmount(moneyDone.amount),
                      )
                    : st.pWithdrawWhy
                      ? msg(
                          "pos_set_why",
                          "Not changed — $1.",
                          panel.refusalText(st.pWithdrawWhy, practice),
                        )
                      : "",
              ),
            ),
        );
    if (part === "funds") return fundsPane;
    return React.createElement(
      Fragment,
      null,
      React.createElement(
        AlertPosTicket,
        { "data-practice-account": "true" },
        /* **Where you stand, above everything you can set.** Four figures you
           cannot change, then the rules you set against them. The loss gauge
           belongs here rather than beside its own chip row for the same
           reason: it is a fact about this account now, not the setting. */
        React.createElement(
          AlertPosSummary,
          null,
          React.createElement(
            AlertPosSummaryCell,
            null,
            /* The same plain word the head uses on this screen. */
            msg("pos_sum_equity", "Equity"),
            React.createElement(
              AlertPosSummaryValue,
              { lead: true },
              accountAmount(sum.equity),
            ),
          ),
          React.createElement(
            AlertPosSummaryCell,
            null,
            msg("pos_sum_free", "Free"),
            React.createElement(AlertPosSummaryValue, null, accountAmount(sum.free)),
          ),
          React.createElement(
            AlertPosSummaryCell,
            null,
            msg("pos_sum_used", "In contracts"),
            React.createElement(AlertPosSummaryValue, null, accountAmount(sum.used)),
          ),
          React.createElement(
            AlertPosSummaryCell,
            null,
            msg("pos_sum_open", "Running"),
            React.createElement(
              AlertPosSummaryValue,
              null,
              msg("pos_n_open", "$1 open", String(sum.open)),
            ),
          ),
          React.createElement(
            AlertPosSummaryCell,
            null,
            msg("pos_sum_unreal", "Unrealised"),
            React.createElement(
              AlertPosSummaryValue,
              {
                tone:
                  sum.unrealised == null
                    ? null
                    : sum.unrealised > 0
                      ? "up"
                      : sum.unrealised < 0
                        ? "down"
                        : null,
              },
              /* An absence is not a flat result — the rule the portfolio's
                 empty total already follows. */
              sum.unrealised == null
                ? "—"
                : `${sum.unrealised >= 0 ? "+" : "−"}${accountAmount(Math.abs(sum.unrealised))}`,
            ),
          ),
          /* **A bar with nothing written on it is a divider.** This is how
             much of the session's loss limit has been spent — the one rule
             here that ends a run rather than shaping it — and it was drawn as
             a flat 4px rule with no caption, no figure and no colour until it
             was nearly full. On the capture it was indistinguishable from the
             section rule under it. The screen reader had the whole sentence
             the whole time; everybody else had a line. */
          /* **No cap, no gauge.** The loss rule is off by default now, and
             `practiceSessionLossCap` answers Infinity for it — a bar measuring
             progress towards a limit that does not exist is a bar that is
             always empty and always wrong, and "$0.00 of ∞" is worse. What
             ends a contract when this is off is margin and liquidation, which
             the ticket says on every order. */
          !Number.isFinite(sum.cap) ? null : React.createElement(
            AlertPosGaugeHead,
            null,
            React.createElement(
              "span",
              null,
              msg("pos_lim_loss", "Loss that ends the session"),
            ),
            React.createElement(
              AlertPosValue,
              { tone: sum.lossPct >= 100 ? "down" : null },
              msg(
                "pos_sum_loss_of",
                "$1 of $2",
                accountAmount(sum.lost),
                accountAmount(sum.cap),
              ),
            ),
          ),
          !Number.isFinite(sum.cap) ? null : React.createElement(
            AlertPosGauge,
            {
              role: "progressbar",
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": Math.round(sum.lossPct),
              "aria-label": msg(
                "pos_sum_loss_aria",
                "$1 of the $2 loss that ends this account",
                accountAmount(sum.lost),
                accountAmount(sum.cap),
              ),
            },
            React.createElement(AlertPosGaugeFill, { pct: sum.lossPct }),
          ),
        ),
        panel.renderMarketBreakdown(practice, marks, accountAmount),
        head("rules", msg("pos_sec_contract", "Contract rules")),
        /* **Settlement is quote money, and there is no choice to draw.**
           Coin-margined accounts stopped being offered on 18 Sep 2026 — see
           `setPracticeSettlement`. A control with one option is not a
           control, so a quote account shows nothing here; an account still
           in the old mode says what it is, that it is no longer offered, and
           gives the one way out — which starts a fresh account, and so waits
           until nothing is running, like every rule on this tab. */
        inverse
          ? React.createElement(
              AlertPosStep,
              { "data-practice-legacy-coin": "true" },
              React.createElement(
                AlertPosStepHead,
                null,
                React.createElement("span", null, msg("pos_settlement", "Settlement")),
                React.createElement(AlertPosStepValue, null, msg("pos_settlement_coin", "Contract coin")),
              ),
              React.createElement(
                AlertPosNote,
                null,
                msg(
                  "pos_settlement_retired",
                  "Coin-margined accounts are no longer offered. This one keeps working as it is; switching starts a fresh account in quote money, with one wallet for every market.",
                ),
              ),
              React.createElement(
                AlertPosChips,
                null,
                React.createElement(
                  AlertPosChip,
                  {
                    disabled: Boolean(live),
                    onClick: () => {
                      if (live || !panel.props.onPracticeSettlement) return;
                      panel.setState({ pBal: undefined });
                      panel.props.onPracticeSettlement(PRACTICE_SETTLEMENT_QUOTE);
                    },
                  },
                  msg("pos_settlement_switch", "Switch to quote currency"),
                ),
              ),
            )
          : null,
        inverse
          ? React.createElement(
              AlertPosStep,
              null,
              React.createElement(
                AlertPosStepHead,
                null,
                React.createElement("span", null, msg("pos_wallets", "Asset wallets")),
                React.createElement(
                  AlertPosStepValue,
                  null,
                  msg("pos_wallets_count", "$1 active", String(Object.keys(practice.wallets || {}).length)),
                ),
              ),
              React.createElement(
                AlertPosWallets,
                null,
                ...((Object.keys(practice.wallets || {}).length
                  ? Object.keys(practice.wallets)
                  : [activeCoin]
                ).map((coin) => {
                  const w = practiceWallet(practice, coin);
                  return React.createElement(
                    AlertPosWallet,
                    { key: coin },
                    React.createElement("strong", null, coin),
                    React.createElement(
                      "span",
                      null,
                      msg("pos_wallet_free", "free $1", practiceCoinText(w.balance, coin)),
                    ),
                    React.createElement(
                      AlertPosValue,
                      { tone: w.realised > 0 ? "up" : w.realised < 0 ? "down" : null },
                      msg(
                        "pos_wallet_pnl",
                        "P/L $1",
                        `${w.realised >= 0 ? "+" : ""}${practiceCoinText(w.realised, coin)}`,
                      ),
                    ),
                  );
                })),
              ),
            )
          : null,
        /* **How a contract is printed is not one of its rules.** This sat in
           Contract rules beside Settlement, which decides what the contract
           *is*; this decides how the same contract is read, and its own note
           already says "nothing about the account moves". A display
           preference filed under rules tells the reader the wrong thing about
           what the control can do to them. */
        /* **What a contract costs, which is the exercise itself.**
         *
         * Three constants until now — 0.05% taker, 0.05% adverse fill, funding
         * every eight hours — and every one of them is a legitimate thing to
         * want to change. **Zero fees and zero slippage isolates whether the
         * direction was right from what it cost to find out**; doubling them
         * is how you feel why scalping at 200x does not work; funding off is
         * how you practise a hold without a charge arriving three times a day
         * while you are not looking.
         *
         * They are on the *account* and not in Preferences because they are
         * part of what this account is: each contract carries the schedule it
         * was opened under, and every closed entry records the fee it actually
         * paid — so the record stays true whatever this is set to afterwards.
         * Locked while a contract is running, like every other rule here. */
        head("costs", msg("pos_sec_costs", "Costs")),
        ...panel.renderPracticeCosts(practice, Boolean(live)),
        head("display", msg("pos_sec_display", "Display")),
        React.createElement(
          AlertPosStep,
          { "data-practice-units": "true" },
          React.createElement(
            AlertPosStepHead,
            null,
          React.createElement(
            AlertPosImpactLabel,
            null,
            msg("pos_units", "Read a contract in"),
            React.createElement(
              AlertPosWhat,
              {
                open: st.pWhat === "units",
                "aria-expanded": st.pWhat === "units" ? "true" : "false",
                "aria-label": msg("pos_units_aria", "What reading a contract in each unit changes"),
                onClick: () =>
                  panel.setState((p) => ({ pWhat: p.pWhat === "units" ? null : "units" })),
              },
              "?",
            ),
          ),
            React.createElement(
              AlertPosStepValue,
              null,
              units === PRACTICE_UNITS_CASH
                ? panel.posUnit()
                : msg("pos_units_coin_v", "the coin"),
            ),
          ),
          React.createElement(
            AlertPosChips,
            null,
            ...[
              [PRACTICE_UNITS_COIN, msg("pos_units_coin", "Crypto")],
              [PRACTICE_UNITS_CASH, msg("pos_units_cash", "Currency")],
            ].map(([value, label]) =>
              React.createElement(
                AlertPosChip,
                {
                  key: value,
                  active: units === value,
                  "aria-pressed": units === value,
                  onClick: () =>
                    panel.props.onPracticeUnits && panel.props.onPracticeUnits(value),
                },
                label,
              ),
            ),
          ),
          /* **Not locked while a contract runs, and that is the point.** Every
             other row on this tab re-scales what the open contracts were sized
             against, so all of them refuse mid-run. This changes which unit
             the same size is read in and touches no arithmetic — the model
             never sees it. */
          st.pWhat === "units" ? React.createElement(
            AlertPosHint,
            null,
            msg(
              "pos_units_note",
              "0.008 BTC, or what that is worth in your currency — the same contract, said two ways. Changes the ticket and the position rows only; nothing about the account moves.",
            ),
          ) : null,
        ),
        head("limits", msg("pos_sec_limits", "Risk limits")),
        /* **Four rules, one open at a time.**
         *
         * They were four rows of chips with a line of standing under each — a
         * wall of controls where the only thing you usually want is to *read*
         * one of them. Collapsed, the section is a list of the four rules with
         * their current values, which is what you scan for; opening one gives
         * you the choices, where you stand, and what the rule actually is.
         *
         * **The value stays in the head**, because that is the part you came
         * to check. One at a time: they are four answers to one question and a
         * second open would push the first off the screen. Same components as
         * the money drawer — the idiom is already here. */
        ...limits.map(([key, label, value, fmt, note]) => {
          const open = st.pLimit === key;
          return React.createElement(
            AlertPosDrawer,
            { key, "data-practice-limit": key },
            React.createElement(
              AlertPosDrawerHead,
              {
                onClick: () => panel.setState((p) => ({ pLimit: p.pLimit === key ? null : key })),
                "aria-expanded": open ? "true" : "false",
              },
              React.createElement("span", null, label),
              React.createElement(
                AlertPosLevHeadRight,
                null,
                React.createElement(AlertPosStepValue, null, value),
                React.createElement(
                  AlertPosDrawerChevron,
                  { open, "aria-hidden": "true" },
                  icon("chevron", 0.7),
                ),
              ),
            ),
            React.createElement(
              AlertPosDrawerBody,
              { open, "aria-hidden": open ? "false" : "true" },
              React.createElement(
                AlertPosChips,
                null,
                ...PRACTICE_PLAN_LIMITS[key].choices.map((v) =>
                  chip(key, v, fmt(v), plan[key] === v, Boolean(live)),
                ),
              ),
              note ? React.createElement(AlertPosHint, null, note) : null,
              panel.renderLimitWhat(key, {
                levText: `${plan.maxLeverage}x`,
                tiersOn,
                tierTopText: money(PRACTICE_RISK_TIERS[0].upTo),
                tierMmrText: `${(PRACTICE_RISK_TIERS[0].mmrPpm / 10000).toFixed(2)}%`,
                capText: marginOff ? null : accountAmount(marginCap),
                freeText: accountAmount(practiceFreeBalance(practice, activeCoin)),
                lossOff,
                lostText: accountAmount(Math.max(0, -realised)),
                lossCapText: lossCap == null ? offText : accountAmount(lossCap),
                streakAt: plan.streakPause > 0 ? plan.streakPause : 0,
                streakNow: practiceLossStreak(practice),
              }),
            ),
          );
        }),
        /* **Everything that changes the imaginary money, behind one gate.**
         *
         * This used to offer two ways to do the same thing: Set the balance
         * moved the account to an exact figure immediately, while a preset in
         * Add funds started a deposit immediately. The screen therefore made
         * choosing a round number indistinguishable from committing it.
         *
         * There is one additive path now. Presets only fill the amount and the
         * named button is the only confirmation. The opposite action is an
         * explicit withdrawal to zero, not a reset that destroys the account
         * and then refills it. Both show the simulation warning before their
         * controls and a receipt after their four-second wait.
         *
         * The body goes `visibility: hidden` once it has finished collapsing
         * (see `AlertPosDrawerBody`): a `max-height: 0` alone hides a control
         * and leaves it in the tab order. */
        /* **The way past a limit that is not a reset.**
         *
         * Both plan caps stop a run, and until now the only thing that cleared
         * either was the balance control below — which starts a fresh account
         * and takes the record with it. So the punishment for meeting a limit
         * was "lose your history", and the contract count could be met with
         * 99% of the money still on the table.
         *
         * Offered only while one of them is actually met, because a button
         * that starts a new session when the old one has not ended is an
         * invitation to reset the caps out of habit — which is the one way to
         * make them mean nothing. */
        capped && !live
          ? React.createElement(
              AlertPosStep,
              { "data-practice-newsession": "true" },
              React.createElement(
                AlertPosDanger,
                null,
                msg(
                      "pos_capped_loss",
                      "This session has lost the $1 that ends it. Your money and your record are untouched — start the next session to carry on.",
                      accountAmount(lossCap || 0),
                    ),
              ),
              React.createElement(
                AlertPosButton,
                {
                  onClick: () =>
                    panel.props.onPracticeNewSession && panel.props.onPracticeNewSession(),
                },
                msg("pos_new_session", "Start the next session"),
              ),
            )
          : null,
        /* One sentence for the whole tab — but it stopped being true of every
           row on it. **The balance is not locked and never needed to be**: it
           is a deposit movement, not a new account, and the model refuses on
           its own to take back committed margin. Saying "every one of these"
           while one of them is editable is the screen contradicting itself,
           and this is the sentence somebody reads when they are trying to work
           out why they cannot open a contract. */
        React.createElement(
          AlertPosNote,
          null,
          live
            ? msg(
                "pos_account_live",
                "The settlement, the plan and the costs are locked while a contract is running: each of them changes what the open contracts were sized against, so changing one starts a fresh account. The balance is not — setting it moves money in or out and leaves your contracts, your lots and the record alone.",
              )
            : msg(
                "pos_account_note",
                "These describe the account itself, so changing any of them starts a fresh one: the balance goes back to full and the record is cleared. Nothing here is real money.",
              ),
            ),
      ),
      /* The alarm moved to the page's settings sheet on 27 Sep 2026
         (renderPageSettings) — a setting about this screen, with the
         screen's others, rather than inside the account it does not
         change. */
    );
  },

  /* Clamped rather than refused. A number outside the range is a person
     saying "as much as it goes" or "as little as it goes", and the field
     shows what it settled on instead of rejecting the press and leaving them
     to guess the bounds. Nonsense — an empty field, letters — puts the
     current balance back. */
  /* **Setting the balance to a figure, which is not the same as replacing the
   * account.**
   *
   * This used to call `onPracticeReset`: typing a number destroyed the lots
   * and the whole record to get to it. Now it is the deposit movement signed —
   * up is money in, down is money out, and the model refuses to take more than
   * is free, because margin behind an open contract is committed rather than
   * yours to remove.
   *
   * Clamped rather than refused, like every other money box on this screen: a
   * number outside the range is somebody saying "as much as it goes", and the
   * field shows what it settled on. Nonsense — an empty field, letters — puts
   * the current balance back. */
  commitPracticeBalance: (practice) => {
    const inverse = practiceIsCoinSettled(practice);
    const want = inverse
      ? panel.scaled(panel.state.pBal, COIN_SCALE, PRACTICE_MAX_WALLET_E8)
      : panel.scaled(panel.state.pBal, MONEY_SCALE, PRACTICE_MAX_ACCOUNT_E2);
    panel.setState({ pBal: undefined });
    if (!want) return;
    const why = panel.props.onPracticeSetBalance
      && panel.props.onPracticeSetBalance(want, panel.props.activeCoin);
    if (why) panel.setState({ pBalWhy: why });
    else panel.setState({ pBalWhy: null });
  },

  /* **What the futures screen is, what it costs you, and where you stand.**
   *
   * Written to the same three-part shape the other two cards use — a
   * paragraph that says what the thing is, state lines read off the same
   * model the screen is drawn from so they cannot go stale, and the keys.
   *
   * The costs are the part worth the space. A fee and an adverse fill are
   * charged on both sides of every contract and funding is charged three
   * times a day, and none of the three was said anywhere: the ticket quotes a
   * margin and a liquidation, the row quotes a close, and the difference
   * between them was simply smaller money. A run of small wins that nets to a
   * loss is the most useful thing this screen can show somebody, and it
   * cannot show it if the costs are invisible.
   */
  renderFuturesInfo: () => {
    const practice = panel.props.practice;
    const key = (keys, label) =>
      React.createElement(
        AlertsInfoKey,
        { key: label },
        ...keys.map((k) => React.createElement(AlertsKey, { key: k }, k)),
        label,
      );
    const line = (text, i) =>
      React.createElement(AlertsInfoLine, { key: i }, React.createElement("span", null, text));
    const money = (v) => practiceMoneyText(v, panel.posSymbol());
    const state = [];
    if (practice) {
      const held = Object.keys(practice.positions || {}).length;
      if (practiceIsCoinSettled(practice)) {
        state.push(
          /* **A count, not a quota.** This read "$2 of $3 contracts opened"
             because there used to be a ceiling to be a fraction of. There is
             not, and a denominator that is not a limit is worse than none. */
          msg(
            "pos_info_coin_stands",
            "$1 running · $2 opened in all · inverse, settled separately in each contract coin.",
            held,
            practice.opened,
          ),
        );
      } else {
        state.push(
          msg(
            "pos_info_stands",
            "$1 running · $2 opened in all · balance $3",
            held,
            practice.opened,
            money(practice.balance),
          ),
        );
      }
      /* Net and costs on one line, because the second explains the first.
         Read off the session totals rather than counted again here — a second
         tally kept alongside the ledger is a second tally that drifts. */
      if (!practiceIsCoinSettled(practice)) state.push(
        msg(
          "pos_info_costs",
          "$1 realised so far, after $2 in fees and $3 in funding.",
          `${practice.realised >= 0 ? "+" : "-"}${money(Math.abs(practice.realised))}`,
          money(practice.fees),
          money(practice.funding),
        ),
      );
    }
    state.push(panel.fundingLine());
    return React.createElement(
      AlertsInfo,
      null,
      React.createElement(
        AlertsInfoText,
        null,
        msg(
          "pos_info_what",
          "A futures contract here is a claim on a price with borrowed size behind it: pick a side, pick how much leverage, and the account gains or loses that many times what the coin does. The prices are the real ones, and nothing else about it is — no order is placed, no venue is involved, and the balance is imaginary. Three costs are charged and they are the reason a run of small wins can still come out a loss: 0.05% of the contract in fees on the way in and again on the way out, 0.05% of adverse slippage on every fill, and funding at each settlement.",
        ),
      ),
      React.createElement(AlertsInfoState, null, ...state.map(line)),
      React.createElement(
        AlertsInfoKeys,
        null,
        key(["F"], msg("al_key_this_panel", "this panel")),
        key(["Esc"], msg("al_key_close", "close")),
      ),
    );
  },

  /* **The one number on that card that is not already in the account.**
   *
   * Funding is what a perpetual charges for being held rather than for being
   * traded, and it is the cost people are most often surprised by: it is
   * levied on the whole contract, so at 50x it can be fifty times what the
   * same money would pay unlevered. Four states, and each says something
   * different — still asking, no perpetual for this coin, the rate, and no
   * account yet — because "—" for all four is how a live figure and a missing
   * one come to look identical.
   */
  fundingLine: () => {
    const f = panel.state.funding;
    const coin = panel.props.activeCoin;
    if (f === null || f === undefined) {
      return msg("pos_info_funding_wait", "Reading $1's funding rate…", coin);
    }
    if (f === false) {
      return msg(
        "pos_info_funding_none",
        "No perpetual is quoted for $1, so nothing is charged for holding it here. Funding is charged at 00:00, 08:00 and 16:00 UTC on the coins that have one.",
        coin,
      );
    }
    const pct = Number(f.percent);
    const longPays = pct > 0;
    /* `describeSpan`, not `describeAhead`: the second answers "when" and does
       so in English ("in 11h"), which would sit untranslated in the middle of
       a translated sentence. A bare duration drops into "in $6" in every
       language this ships in. */
    const at = Number(f.at) || 0;
    const away = at > 0 ? describeSpan(at - Date.now()) : "";
    /* The interval is the venue's, measured — "every 8 hours" was written
       into the sentence and WIF settles every 4. */
    const hours = f.intervalHours > 0 ? f.intervalHours : 8;
    return msg(
      "pos_info_funding",
      "$1 funding is $2% every $7 hours — about $3% a year — so a $4 pays it and a $5 is paid it, out of the contract's margin. $6",
      coin,
      `${pct > 0 ? "+" : ""}${f.percent}`,
      f.annualized,
      longPays ? msg("pos_long", "Long") : msg("pos_short", "Short"),
      longPays ? msg("pos_short", "Short") : msg("pos_long", "Long"),
      away
        ? msg("pos_info_funding_in", "The next settlement is $1 away.", away)
        : msg("pos_info_funding_soon", "The next settlement is at the next settlement mark."),
      String(hours),
    );
  },

  /* Asked for when the card is opened and never on a timer: the rate moves
   * three times a day and the card is a thing you read once. `false` is a
   * real answer — most of the 81 coins have no perpetual on OKX — and is kept
   * apart from `null`, which means the request is still out. */
  /* **THE ORDERS TAB — what is waiting, and how far away it is.**
   *
   * One aligned row per resting order, in the same `ch` columns the position
   * list uses, because they are read the same way: down a column. What a
   * person wants from this screen is not the order they typed — they typed it
   * — but **how far the market is from it**, which is the one figure an order
   * ticket cannot show and the only reason to come back here.
   *
   * Cancel is on the row and takes one press. It is not destructive in the way
   * closing is: nothing was ever opened, so there is nothing to lose and no
   * confirmation to earn — the money simply comes back. */
  /* **How the orders that are gone ended** (28 Sep 2026) — filled,
     cancelled, or refused when they came to fill — read from the ledger by
     `practiceOrderHistory`, newest first, under what is still waiting. */
  renderOrderHistory: () => {
    const sym = panel.posSymbol();
    const rows = practiceOrderHistory(panel.props.practice, 15);
    if (!rows.length) return null;
    const word = { filled: msg("pos_hist_filled", "filled"), cancelled: msg("pos_hist_cancelled", "cancelled"), refused: msg("pos_hist_refused", "could not open") };
    return React.createElement(
      AlertPosHistory,
      { "data-practice-order-history": String(rows.length) },
      React.createElement(AlertPosOrdersHead, null, React.createElement("span", null, msg("pos_hist_title", "Order history"))),
      ...rows.map((h) =>
        React.createElement(
          AlertPosHistoryRow,
          { key: `${h.order}-${h.status}`, status: h.status, "data-practice-history-row": h.status },
          React.createElement(
            "span",
            null,
            `${h.coin} ${h.side === "short" ? msg("pos_short", "Short") : msg("pos_long", "Long")} ${h.leverage}x` +
              (h.kind === "stop" ? ` · ${msg("pos_kind_stop_entry", "stop entry")}` : h.kind === "reduce" ? ` · ${msg("pos_reduce_only_short", "reduce-only")}` : ""),
          ),
          React.createElement("span", null, `${practiceQtyText(h.qty)} ${h.coin} · ${msg("pos_order_at", "at $1", practicePriceText(h.limit, sym))}`),
          React.createElement("strong", null, word[h.status] || h.status),
        ),
      ),
    );
  },

  renderRestingOrders: (resting, marks) => {
    const sym = panel.posSymbol();
    if (!resting.length) {
      return React.createElement(
        Fragment,
        null,
        React.createElement(
          AlertsEmpty,
          null,
          React.createElement(AlertsEmptyTitle, null, msg("pos_orders_none", "Nothing waiting")),
          React.createElement(
            AlertsEmptyText,
            null,
            msg(
              "pos_orders_none_text",
              "A limit order waits at a price you name and costs the maker fee when the market comes to it — about half of what crossing the spread costs. Place one from New contract.",
            ),
          ),
        ),
        panel.renderOrderHistory(),
      );
    }
    return React.createElement(
      Fragment,
      null,
      /* **Cancel all**, two presses like Close all: the first says how many
         it will take back, the second does it. Every reserve comes back. */
      resting.length > 1 && typeof panel.props.onPracticeCancelAll === "function"
        ? React.createElement(
            AlertPosOrdersHead,
            null,
            React.createElement("span", null, msg("pos_orders_n", "$1 waiting", String(resting.length))),
            React.createElement(
              AlertPosChip,
              {
                active: Boolean(panel.state.pCancelAll),
                "data-practice-cancel-all": panel.state.pCancelAll ? "armed" : "idle",
                onClick: () => {
                  if (!panel.state.pCancelAll) {
                    panel.setState({ pCancelAll: true });
                    return;
                  }
                  panel.props.onPracticeCancelAll();
                  panel.setState({ pCancelAll: false });
                },
              },
              panel.state.pCancelAll
                ? msg("pos_cancel_all_sure", "Press again to cancel all $1", String(resting.length))
                : msg("pos_cancel_all", "Cancel all"),
            ),
          )
        : null,
      ...resting.map((o) => {
        const mark = marks && marks[o.coin];
        const away = mark > 0 ? ((o.limit - mark) / mark) * 100 : null;
        return React.createElement(
          AlertPosCard,
          { key: o.id, "data-practice-order": o.id },
          React.createElement(
            AlertPosOrderRow,
            null,
            React.createElement(
              AlertPosCoin,
              null,
              `${o.coin} ${o.side === "short" ? msg("pos_short", "Short") : msg("pos_long", "Long")} ${o.leverage}x` +
                (o.kind === "stop"
                  ? ` · ${msg("pos_kind_stop_entry", "stop entry")}`
                  : o.reduce ? ` · ${msg("pos_reduce_only_short", "reduce-only")}` : ""),
            ),
            React.createElement(
              "span",
              { "data-practice-order-levels": o.stop || o.take ? "true" : undefined },
              msg("pos_order_at", "at $1", practicePriceText(o.limit, sym)),
              /* Its own levels, which the contract takes when it fills. */
              o.stop > 0 ? ` · ${msg("pos_order_sl", "SL $1", practicePriceText(o.stop, sym))}` : "",
              o.take > 0 ? ` · ${msg("pos_order_tp", "TP $1", practicePriceText(o.take, sym))}` : "",
            ),
            React.createElement(
              "span",
              null,
              away == null
                ? ""
                : msg("pos_order_away", "$1% away", (away >= 0 ? "+" : "") + away.toFixed(2)),
            ),
            React.createElement(
              "span",
              null,
              msg("pos_order_holds", "$1 held", practiceMoneyText(o.margin, sym)),
            ),
            React.createElement(
              AlertPosQuiet,
              {
                "data-practice-order-cancel": o.id,
                "aria-label": msg("pos_order_cancel_aria", "Cancel the $1 order at $2", o.coin, practicePriceText(o.limit, sym)),
                onClick: () =>
                  panel.props.onPracticeCancelOrder && panel.props.onPracticeCancelOrder(o.id),
              },
              msg("pos_order_cancel", "Cancel"),
            ),
          ),
        );
      }),
      panel.renderOrderHistory(),
    );
  },

  /* **THE MARKET PANE — the left half of the workspace.**
   *
   * Two things, and both of them are things nothing else in the app can show
   * *while you are deciding*: the window you are trading in with **your own
   * contract's levels drawn across it**, and one counted statement about how
   * this market has actually moved.
   *
   * The chart is deliberately not `LineBase`. That component is the app's
   * main instrument — five thousand lines, its own board, lattice, crosshair
   * and call boxes — and what is wanted here is a hundred-point context
   * drawing with three horizontal rules on it. It is built from the same two
   * helpers the real chart uses (`scalePrices`, `priceToChartY`), so the shape
   * and the levels cannot disagree with the chart behind the panel.
   *
   * **A level outside the window is not drawn, and is said instead.**
   * `priceToChartY` returns null rather than clamping — its comment is
   * explicit that a reference line which can lie is worse than none — and a
   * liquidation 50% away on a 2x contract is *routinely* outside. That is not
   * a gap in the drawing; it is the single most useful thing this pane can
   * tell you, so the measure below says it in words. */
  /* **What the page's chart cannot say about this market**: how far the
     nearest liquidation is against the steps the window is made of, what
     has followed this market's state before, and what has been written
     about it. The page's own chart draws the levels; these are the readings
     under it (`practice-page.js`). */
  /* ---- the outlook, before a contract ---------------------------------
   *
   * Everything here is read off the series already on the screen and the
   * book and tape already polled, so it costs no request. Memoised on the
   * identity of those three: the cone is two thousand resampled paths and
   * the location states walk a 96-bar window per bar, and neither belongs in
   * a render that runs on every tick. `src/outlook.js` holds the maths; the
   * research is docs/product/derivatives-simulator/PRE_TRADE_OUTLOOK.md. */
  outlookFacts: (coin) => {
    const series = panel.props.series;
    const trades = panel.state.tradesFor === coin ? panel.state.trades : null;
    const book = panel.state.bookFor === coin && panel.state.book ? panel.state.book : null;
    const memo = panel._outlook;
    if (memo && memo.coin === coin && memo.series === series && memo.trades === trades && memo.book === book) return memo.facts;
    let facts = null;
    if (Array.isArray(series) && series.length > OUTLOOK_MIN_BARS) {
      const states = outlookLocationStates(series);
      const location = states[states.length - 1] || null;
      const vol = outlookVolRegime(series);
      const part = outlookParticipation(series);
      const chain = outlookChain(states, { minRow: BASE_RATE_MIN_EPISODES, ahead: 6 });
      const horizons = outlookHorizonBars(series, [
        { label: msg("pp_h_1h", "1h"), seconds: 3600 },
        { label: msg("pp_h_4h", "4h"), seconds: 4 * 3600 },
        { label: msg("pp_h_1d", "1d"), seconds: 24 * 3600 },
        { label: msg("pp_h_1w", "1w"), seconds: 7 * 24 * 3600 },
        { label: msg("pp_h_1m", "1m"), seconds: 30 * 24 * 3600 },
      ]).slice(-3);
      const cone = horizons.length
        ? outlookCone(series, { horizons: horizons.map((h) => h.bars), states, seed: 20260921 })
        : null;
      const mid = horizons.length ? horizons[Math.min(1, horizons.length - 1)].bars : 0;
      const episodes = mid > 0 ? outlookEpisodes(series, states, mid) : null;
      let tape = null;
      if (trades && trades.length) {
        const buy = trades.filter((t) => t.side === "buy").reduce((a, t) => a + t.size, 0);
        const all = trades.reduce((a, t) => a + t.size, 0);
        tape = all > 0 ? { buyers: buy / all, n: trades.length } : null;
      }
      let depth = null;
      if (book && book.bids && book.asks) {
        const top = (side) => side.slice(0, 10).reduce((a, l) => a + l.size, 0);
        const b = top(book.bids);
        const a = top(book.asks);
        depth = a + b > 0 ? { bidShare: b / (a + b), levels: Math.min(10, book.bids.length, book.asks.length) } : null;
      }
      facts = { series, states, location, vol, part, chain, horizons, cone, episodes, mid, tape, depth };
    }
    panel._outlook = { coin, series, trades, book, facts };
    return facts;
  },

  /* The location state as a word, the same three everywhere. */
  outlookStateWord: (state) =>
    state === "below"
      ? msg("pp_loc_below", "below value")
      : state === "above"
        ? msg("pp_loc_above", "above value")
        : state === "inside"
          ? msg("pp_loc_inside", "inside value")
          : msg("pp_loc_none", "unplaced"),

  /* **The fan**, drawn from the cone's quantiles at each horizon. Pure
     geometry: the x axis is the horizon in bars, the y axis the price range
     the outer band spans, and the start is a dashed line. */
  renderFan: (cone, sym) => {
    if (!cone || !cone.horizons.length) return null;
    const W = 320;
    const H = 64;
    const padL = 2;
    const padR = 2;
    const hs = cone.horizons;
    const lo = Math.min(cone.from, ...hs.map((h) => h.p5));
    const hi = Math.max(cone.from, ...hs.map((h) => h.p95));
    if (!(hi > lo)) return null;
    const maxBars = hs[hs.length - 1].bars;
    const x = (bars) => padL + ((W - padL - padR) * bars) / maxBars;
    const y = (v) => 4 + ((H - 8) * (hi - v)) / (hi - lo);
    const pts = [{ bars: 0, p5: cone.from, p25: cone.from, p50: cone.from, p75: cone.from, p95: cone.from }, ...hs];
    const band = (top, bottom) =>
      `M${pts.map((p) => `${x(p.bars).toFixed(1)},${y(p[top]).toFixed(1)}`).join("L")}L${pts
        .slice()
        .reverse()
        .map((p) => `${x(p.bars).toFixed(1)},${y(p[bottom]).toFixed(1)}`)
        .join("L")}Z`;
    const line = `M${pts.map((p) => `${x(p.bars).toFixed(1)},${y(p.p50).toFixed(1)}`).join("L")}`;
    return React.createElement(
      AlertPosFan,
      { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true", "data-practice-fan": String(hs.length) },
      React.createElement("path", { className: "fan-outer", d: band("p95", "p5") }),
      React.createElement("path", { className: "fan-inner", d: band("p75", "p25") }),
      React.createElement("path", { className: "fan-median", d: line }),
      React.createElement("line", { className: "fan-now", x1: padL, x2: W - padR, y1: y(cone.from), y2: y(cone.from) }),
    );
  },

  /* **The outlook tab.** In order: the cone (what the window's own steps do
     when replayed forward from here), the regime the window is in, where the
     price sits and where that state went next, and what followed the last
     times it entered this state. Every figure carries its n and its window;
     the closing line says what none of it is. */
  renderOutlook: (coin) => {
    const f = panel.outlookFacts(coin);
    const sym = panel.posSymbol();
    const series = panel.props.series;
    if (!f) {
      return React.createElement(
        AlertPosMeasure,
        { "data-practice-outlook": "short" },
        msg(
          "pp_outlook_short",
          "Too few bars on this range to count anything forward from — $1 of $2. Pick a longer range above the chart.",
          String(Array.isArray(series) ? series.length : 0),
          String(OUTLOOK_MIN_BARS + 1),
        ),
      );
    }
    const pct = (v) => `${Math.round(v * 100)}%`;
    const price = (v) => practicePriceText(Math.round(v * PRICE_SCALE), sym);
    const cone = f.cone && f.cone.n ? f.cone : null;
    const blocks = [];

    blocks.push(
      React.createElement(
        AlertPosPaneHead,
        { key: "cone-head" },
        React.createElement("span", null, msg("pp_outlook_head", "Where this window's own steps land")),
        cone
          ? React.createElement(
              "span",
              null,
              msg("pp_outlook_paths", "$1 replays · blocks of $2 bars", String(cone.n), String(cone.block)),
            )
          : null,
      ),
    );
    if (cone) {
      blocks.push(panel.renderFan(cone, sym));
      blocks.push(
        React.createElement(
          AlertPosHorizons,
          { key: "hz", "data-practice-outlook": "cone" },
          ...f.horizons.flatMap((h, i) => {
            const q = cone.horizons[i];
            return [
              React.createElement("strong", { key: `l${i}` }, h.label),
              React.createElement("b", { key: `r${i}` }, `${price(q.p5)} \u2026 ${price(q.p95)}`),
              React.createElement("span", { key: `m${i}` }, msg("pp_outlook_median", "median $1", price(q.p50))),
              React.createElement("span", { key: `u${i}` }, msg("pp_outlook_up", "$1 above", pct(q.up / q.n))),
            ];
          }),
        ),
      );
      blocks.push(
        React.createElement(
          AlertPosMeasure,
          { key: "cone-how", "data-practice-outlook-cond": cone.conditioned ? "state" : "all" },
          cone.conditioned
            ? msg(
                "pp_outlook_cond",
                "Resampled from the $1 bars of the last $2 that sat $3, like now — the 5th to 95th of where $4 replays landed.",
                String(cone.starts),
                String(cone.bars),
                panel.outlookStateWord(cone.state),
                String(cone.n),
              )
            : msg(
                "pp_outlook_all",
                "Resampled from all $1 bars on screen — too few sat $2 to draw from those alone — the 5th to 95th of where $3 replays landed.",
                String(cone.bars),
                panel.outlookStateWord(f.location),
                String(cone.n),
              ),
        ),
      );
    } else {
      blocks.push(
        React.createElement(
          AlertPosMeasure,
          { key: "cone-none", "data-practice-outlook": "nocone" },
          msg("pp_outlook_nocone", "No horizon fits inside half of this range; pick a longer range above the chart."),
        ),
      );
    }

    /* The regime. */
    if (f.vol) {
      const v = f.vol;
      blocks.push(
        React.createElement(AlertPosPaneHead, { key: "vol-head" }, React.createElement("span", null, msg("pp_regime_head", "Regime"))),
        React.createElement(
          AlertPosExplain,
          { key: "vol", "data-practice-outlook": "regime" },
          React.createElement(
            AlertPosExplainRow,
            null,
            React.createElement("strong", null, msg("pp_regime_vol", "Volatility")),
            React.createElement(
              "span",
              null,
              v.ratio == null
                ? msg("pp_regime_vol_short", "Too few bars to compare the last $1 with what came before.", String(v.short))
                : msg(
                    "pp_regime_vol_line",
                    "The last $1 bars moved $2× the $3 before them — $4 (over 1.3 expanding, under 0.7 contracting). Against every $1-bar stretch on this range it sits at percentile $5 (n = $6).",
                    String(v.short),
                    v.ratio.toFixed(2),
                    String(v.long),
                    v.regime === "expanding"
                      ? msg("pp_regime_expanding", "expanding")
                      : v.regime === "contracting"
                        ? msg("pp_regime_contracting", "contracting")
                        : msg("pp_regime_steady", "steady"),
                    String(Math.round(v.pct * 100)),
                    String(v.windows),
                  ),
            ),
          ),
          React.createElement(
            AlertPosExplainRow,
            null,
            React.createElement("strong", null, msg("pp_regime_ac", "Follow-through")),
            React.createElement(
              "span",
              null,
              v.ac1 == null
                ? "—"
                : msg(
                    "pp_regime_ac_line",
                    "Lag-1 autocorrelation of the $1 returns on screen: $2 — $3.",
                    String(v.n),
                    (v.ac1 >= 0 ? "+" : "\u2212") + Math.abs(v.ac1).toFixed(2),
                    v.ac1 < -0.05
                      ? msg("pp_regime_damped", "a step here has tended to be followed by a step back (damped)")
                      : v.ac1 > 0.05
                        ? msg("pp_regime_amplified", "a step here has tended to be followed by another the same way (amplified)")
                        : msg("pp_regime_neutral", "no tendency either way"),
                  ),
            ),
          ),
          f.part
            ? React.createElement(
                AlertPosExplainRow,
                null,
                React.createElement("strong", null, msg("pp_regime_part", "Participation")),
                React.createElement(
                  "span",
                  null,
                  msg(
                    "pp_regime_part_line",
                    "This bar's volume sits at percentile $1 of the $2 bars on screen.",
                    String(Math.round(f.part.pct * 100)),
                    String(f.part.n),
                  ),
                ),
              )
            : null,
        ),
      );
    }

    /* Where the price sits, and where that state went next. */
    const ch = f.chain;
    const row = ch && ch.next;
    const chainLine = (dist) => {
      if (!dist) return null;
      return ["below", "inside", "above"].map((st) => `${panel.outlookStateWord(st)} ${pct(dist[st])}`).join(" · ");
    };
    blocks.push(
      React.createElement(AlertPosPaneHead, { key: "loc-head" }, React.createElement("span", null, msg("pp_chain_head", "Location, and where it went next"))),
      React.createElement(
        AlertPosExplain,
        { key: "chain", "data-practice-outlook": "chain", "data-practice-location": f.location || "none" },
        React.createElement(
          AlertPosExplainRow,
          null,
          React.createElement("strong", null, msg("pp_chain_now", "Now")),
          React.createElement(
            "span",
            null,
            f.location
              ? msg(
                  "pp_chain_now_line",
                  "$1 sits $2 — against the value area (70% of volume) of the $3 bars before it.",
                  coin,
                  panel.outlookStateWord(f.location),
                  String(OUTLOOK_LOCATION_WINDOW),
                )
              : msg("pp_chain_now_none", "Not enough bars behind the last one to place it ($1 needed).", String(OUTLOOK_LOCATION_WINDOW)),
          ),
        ),
        row
          ? React.createElement(
              AlertPosExplainRow,
              null,
              React.createElement("strong", null, msg("pp_chain_next", "Next bar")),
              React.createElement(
                "span",
                null,
                row.p
                  ? msg(
                      "pp_chain_next_line",
                      "From here the next bar went: $1 (n = $2 bars in this state; smoothed $3% towards the window's own mix).",
                      chainLine(row.p),
                      String(row.n),
                      String(Math.round(ch.damping * 100)),
                    )
                  : msg(
                      "pp_chain_next_few",
                      "Only $1 bars were in this state — under the $2 this app counts from. The raw counts: $3.",
                      String(row.n),
                      String(ch.minRow),
                      row.to ? ["below", "inside", "above"].map((st) => `${panel.outlookStateWord(st)} ${row.to[st]}`).join(" · ") : "—",
                    ),
              ),
            )
          : null,
        row && ch.ahead
          ? React.createElement(
              AlertPosExplainRow,
              null,
              React.createElement("strong", null, msg("pp_chain_ahead", "$1 bars on", String(ch.steps))),
              React.createElement(
                "span",
                null,
                msg(
                  "pp_chain_ahead_line",
                  "Walking the counted chain $1 steps: $2. Markov's point — the walk forgets where it started; the mix it settles into is the window's own.",
                  String(ch.steps),
                  chainLine(ch.ahead),
                ),
              ),
            )
          : null,
        f.episodes
          ? React.createElement(
              AlertPosExplainRow,
              null,
              React.createElement("strong", null, msg("pp_chain_before", "Before")),
              React.createElement(
                "span",
                null,
                !f.episodes.n
                  ? msg("pp_chain_before_none", "The market did not enter this state earlier on this range.")
                  : f.episodes.edge == null
                    ? msg(
                        "pp_chain_before_few",
                        "It entered this state $1 times on this range — under the $2 needed to compare with an ordinary bar. $3 bars later the median move was $4%.",
                        String(f.episodes.n),
                        String(BASE_RATE_MIN_EPISODES),
                        String(f.mid),
                        (f.episodes.median >= 0 ? "+" : "") + f.episodes.median.toFixed(2),
                      )
                    : msg(
                        "pp_chain_before_line",
                        "It entered this state $1 times on this range. $2 bars later the price was higher in $3% of them, against $4% of all $5 bars; median move $6% against $7%.",
                        String(f.episodes.n),
                        String(f.mid),
                        f.episodes.up.toFixed(0),
                        f.episodes.baseUp.toFixed(0),
                        String(f.episodes.baseN),
                        (f.episodes.median >= 0 ? "+" : "") + f.episodes.median.toFixed(2),
                        (f.episodes.baseMedian >= 0 ? "+" : "") + f.episodes.baseMedian.toFixed(2),
                      ),
              ),
            )
          : null,
      ),
    );

    blocks.push(
      React.createElement(
        AlertPosMeasure,
        { key: "rule", "data-practice-outlook-rule": "true" },
        msg(
          "pp_outlook_rule",
          "Counts of the range on the chart, replayed and tallied — not a claim about what comes next. Change the range and every figure changes with it; that is the point.",
        ),
      ),
    );
    return React.createElement(Fragment, null, ...blocks);
  },

  /* **The setup gates on the ticket** — the champion's four questions asked
     of the facts on hand, each answered as a fact and turned into a code
     that is stamped on the contract when it opens. Under them, the trader's
     own record with each code present, once there is one: the personal base
     rate, which no shared statistic can give. */
  setupFacts: (coin, impact, stopRaw) => {
    const f = panel.outlookFacts(coin) || {};
    const practice = panel.props.practice;
    const plan = practice && practice.plan;
    let withinPlan = null;
    if (impact && impact.stopPnl != null && impact.stopPnl < 0 && plan && plan.lossPerTradePct > 0) {
      const perTrade = Math.round((practiceAccountSize(practice, coin) * plan.lossPerTradePct) / 100);
      withinPlan = -impact.stopPnl <= perTrade;
    }
    return {
      vol: f.vol || null,
      location: f.location || null,
      tape: f.tape || null,
      book: f.depth || null,
      stop: Boolean(stopRaw),
      withinPlan,
    };
  },

  renderSetupGates: (coin, impact, stopRaw) => {
    const facts = panel.setupFacts(coin, impact, stopRaw);
    const codes = outlookSetupCodes(facts);
    const practice = panel.props.practice;
    const closed = practice
      ? (practice.ledger || []).filter((e) => PRACTICE_CLOSED_KINDS.includes(e.kind))
      : [];
    const by = outlookBySetup(closed, RECORD_MIN_FOR_STATS);
    const word = (code) => {
      const table = {
        "env:expanding": msg("pp_code_expanding", "vol expanding"),
        "env:contracting": msg("pp_code_contracting", "vol contracting"),
        "env:steady": msg("pp_code_steady", "vol steady"),
        "env:damped": msg("pp_code_damped", "damped"),
        "env:amplified": msg("pp_code_amplified", "amplified"),
        "env:neutral": msg("pp_code_neutral", "no follow-through"),
        "loc:below": msg("pp_code_below", "below value"),
        "loc:inside": msg("pp_code_inside", "inside value"),
        "loc:above": msg("pp_code_above", "above value"),
        "tape:buyers": msg("pp_code_buyers", "tape buying"),
        "tape:sellers": msg("pp_code_sellers", "tape selling"),
        "tape:even": msg("pp_code_even", "tape even"),
        "book:bids": msg("pp_code_bids", "book bid-heavy"),
        "book:asks": msg("pp_code_asks", "book ask-heavy"),
        "book:even": msg("pp_code_book_even", "book even"),
        "mgmt:stop": msg("pp_code_stop", "stop set"),
        "mgmt:nostop": msg("pp_code_nostop", "no stop"),
        "mgmt:inplan": msg("pp_code_inplan", "risk in plan"),
        "mgmt:overplan": msg("pp_code_overplan", "risk over plan"),
      };
      return table[code] || code;
    };
    const chips = (list) =>
      list.map((c) => React.createElement(AlertPosGateCode, { key: c, "data-practice-code": c }, word(c)));
    const env = codes.filter((c) => c.startsWith("env:"));
    const loc = codes.filter((c) => c.startsWith("loc:"));
    const conf = codes.filter((c) => c.startsWith("tape:") || c.startsWith("book:"));
    const mgmt = codes.filter((c) => c.startsWith("mgmt:"));
    const gate = (key, label, text, list) =>
      React.createElement(
        AlertPosExplainRow,
        { key, "data-practice-gate": key },
        React.createElement("strong", null, label),
        React.createElement("span", null, text, list.length ? chips(list) : null),
      );
    const v = facts.vol;
    const rows = [
      gate(
        "env",
        msg("pp_gate_env", "Environment"),
        v && v.ratio != null
          ? msg("pp_gate_env_text", "Last $1 bars at $2× the $3 before.", String(v.short), v.ratio.toFixed(2), String(v.long))
          : msg("pp_gate_env_none", "No reading yet on this range."),
        env,
      ),
      gate(
        "loc",
        msg("pp_gate_loc", "Location"),
        facts.location
          ? msg("pp_gate_loc_text", "Against the last $1 bars' value area.", String(OUTLOOK_LOCATION_WINDOW))
          : msg("pp_gate_loc_none", "Too few bars behind the last one to place it."),
        loc,
      ),
      gate(
        "conf",
        msg("pp_gate_conf", "Confirmation"),
        facts.tape || facts.book
          ? [
              facts.tape ? msg("pp_gate_tape_text", "Buyers $1% of the last $2 prints.", String(Math.round(facts.tape.buyers * 100)), String(facts.tape.n)) : null,
              facts.book ? msg("pp_gate_book_text", "Bids $1% of the top $2 levels.", String(Math.round(facts.book.bidShare * 100)), String(facts.book.levels)) : null,
            ]
              .filter(Boolean)
              .join(" ")
          : msg("pp_gate_conf_none", "Open the Trades tab or the book to read the flow."),
        conf,
      ),
      gate(
        "mgmt",
        msg("pp_gate_mgmt", "Management"),
        facts.stop
          ? facts.withinPlan == null
            ? msg("pp_gate_mgmt_stop", "A stop is on the ticket.")
            : facts.withinPlan
              ? msg("pp_gate_mgmt_in", "A stop is on the ticket, and its loss is within the plan's share.")
              : msg("pp_gate_mgmt_over", "A stop is on the ticket, and its loss is over the plan's share.")
          : msg("pp_gate_mgmt_none", "No stop on the ticket — the record grades that a C."),
        mgmt,
      ),
    ];
    /* The trader's own record, for the codes present now. */
    const own = codes
      .map((c) => ({ code: c, r: by.codes[c] }))
      .filter((x) => x.r && x.r.with.n > 0);
    /* **One line shut, four rows open.** The ticket is a column that scrolls
       inside the window, and a card of prose above the order button pushed
       the controls that matter under the fold — measured as 13 of the 20
       controls the foot test expects on screen. So the codes ride one row
       with the head, as the chips they are, and the four facts unfold from
       it. The stamp is the same either way. */
    const open = panel.state.pSetupOpen === true;
    return React.createElement(
      Fragment,
      null,
      React.createElement(
        AlertPosPaneHead,
        { "data-practice-setup": codes.join(" ") },
        React.createElement("span", null, msg("pp_setup_head", "Setup — stamped on the contract")),
        React.createElement(
          AlertPosChip,
          {
            active: open,
            "aria-expanded": open ? "true" : "false",
            "aria-label": msg("pp_setup_toggle", "Show how each setup reading was made"),
            onClick: () => panel.setState({ pSetupOpen: !open }),
          },
          open ? msg("pp_setup_less", "Hide") : msg("pp_setup_more", "How"),
        ),
      ),
      codes.length
        ? React.createElement("div", { "data-practice-setup-codes": String(codes.length) }, ...chips(codes))
        : null,
      React.createElement(
        AlertPosReveal,
        { open, "data-practice-setup-detail": open ? "open" : "shut" },
        React.createElement(AlertPosExplain, null, ...rows),
      ),
      own.length
        ? React.createElement(
            AlertPosMeasure,
            { "data-practice-setup-record": String(own.length) },
            msg("pp_setup_record", "Your record with these present, of $1 closed:", String(by.n)),
            " ",
            own
              .map((x) => {
                const w = x.r.with;
                const r = w.avgR == null ? "" : ` · ${msg("pp_setup_avg_r", "avg $1R", (w.avgR >= 0 ? "+" : "\u2212") + Math.abs(w.avgR).toFixed(2))}`;
                return `${word(x.code)} ${w.wins}/${w.n}${r}`;
              })
              .join(" · "),
          )
        : null,
    );
  },

  /* ---- the assistant ---------------------------------------------------
   *
   * A desk's checks as facts — `src/assistant.js` decides what is raised
   * and with which numbers; this is where the numbers become sentences. The
   * one rule, again: it reports, it never advises. Every sentence below
   * carries a figure and its denominator, and none carries a direction. */
  assistantContext: (coin, marks) => {
    const practice = panel.props.practice;
    const f = panel.outlookFacts(coin) || {};
    const mkt = panel.state.mkt && panel.state.mkt.coin === coin ? panel.state.mkt : null;
    const t = panel._lastTicket && panel._lastTicket.coin === coin ? panel._lastTicket : null;
    const now = Date.now();
    const feed = Array.isArray(panel.props.newsItems) ? panel.props.newsItems : [];
    const about = newsAboutCoin(feed, coin, now - ASSISTANT_NEWS_HOURS * 3600000, now, panel.props.newsSources).about;
    const newest = about.length ? Math.max(...about.map((i) => Number(i.time) || 0)) : 0;
    const held = practice ? practiceList(practice).map((id) => practiceAt(practice, id)).filter(Boolean) : [];
    const closed = practice ? (practice.ledger || []).filter((e) => PRACTICE_CLOSED_KINDS.includes(e.kind)) : [];
    return {
      now,
      coin,
      series: panel.props.series,
      marks: marks || {},
      positions: held,
      plan: practice ? practice.plan : {},
      accountE2: practice ? practiceAccountSize(practice, coin) : 0,
      freeE2: practice ? practiceFreeBalance(practice, coin) : 0,
      ticket: t,
      funding: mkt && mkt.funding ? { rate: mkt.funding.rate, at: mkt.funding.at, intervalHours: mkt.funding.intervalHours } : null,
      crowd: mkt && mkt.crowd ? mkt.crowd : null,
      vol: f.vol || null,
      location: f.location || null,
      locationWindow: OUTLOOK_LOCATION_WINDOW,
      area: Array.isArray(panel.props.series) && panel.props.series.length > OUTLOOK_LOCATION_WINDOW
        ? outlookValueArea(panel.props.series.slice(-OUTLOOK_LOCATION_WINDOW))
        : null,
      participation: f.part || null,
      cone: f.cone && f.cone.n ? f.cone : null,
      coneLabel: f.horizons && f.horizons.length ? f.horizons[0].label : null,
      streak: practice ? practiceLossStreak(practice) : 0,
      news: about.length ? { count: about.length, newestMin: newest ? Math.max(0, Math.floor((now - newest) / 60000)) : null } : null,
      scorecard: practice && !practiceIsCoinSettled(practice) ? practiceScorecard(practice) : null,
      bySetup: closed.length ? outlookBySetup(closed, RECORD_MIN_FOR_STATS) : null,
    };
  },

  /* The sentence, the why, and where a press can go — per item key. */
  assistantWords: (item, ctx) => {
    const d = item.data;
    const sym = panel.posSymbol();
    const money = (e2) => practiceMoneyText(Math.abs(e2), sym);
    const pct = (v, dp = 0) => `${(v * 100).toFixed(dp)}%`;
    const loc = (st) => panel.outlookStateWord(st);
    const side = (v) => (v === "short" ? msg("pos_short", "Short") : msg("pos_long", "Long"));
    switch (item.key) {
      case "stop":
        return [msg("as_stop_t", "No stop on the ticket"), msg("as_stop", "The order has no exit if it is wrong; the loss is whatever the market decides."), msg("as_stop_why", "A desk decides where it is wrong before it presses, and sizes from that distance."), msg("as_stop_go", "Set a stop")];
      case "stopNoise":
        return [msg("as_noise_t", "Stop against the window's steps"), msg("as_noise", "The stop is $1 away. In this window $2 of $3 steps were at least that big (a watch over $4).", `${d.awayPct.toFixed(2)}%`, String(Math.round(d.share * d.steps)), String(d.steps), pct(d.threshold)), msg("as_noise_why", "A stop inside the ordinary step is taken by noise, not by being wrong."), null];
      case "riskShare":
        return [msg("as_risk_t", "Loss at the stop"), msg("as_risk", "$1 — $2 of the account, against the plan's $3 per contract ($4).", money(d.lossE2), pct(d.pct / 100, 2), `${d.planPct}%`, money(d.capE2)), msg("as_risk_why", "Risk per contract is the number that decides whether a run of losses is survivable."), null];
      case "stopCone":
        return [msg("as_cone_t", "Stop against the outlook"), d.inside ? msg("as_cone_in", "The stop sits inside the 5th–95th band of the next $1 ($2 … $3, $4 replays).", d.label, practicePriceText(Math.round(d.p5 * PRICE_SCALE), sym), practicePriceText(Math.round(d.p95 * PRICE_SCALE), sym), String(d.n)) : msg("as_cone_out", "The stop sits outside the 5th–95th band of the next $1 ($2 … $3, $4 replays).", d.label, practicePriceText(Math.round(d.p5 * PRICE_SCALE), sym), practicePriceText(Math.round(d.p95 * PRICE_SCALE), sym), String(d.n)), msg("as_cone_why", "Where this window's own steps land, replayed — the band the stop is measured against."), null];
      case "take":
        return [msg("as_take_t", "No take-profit"), msg("as_take", "Nothing on the ticket says where the contract is right."), msg("as_take_why", "Knowing where you get out if you are right is the other half of the plan."), msg("as_take_go", "Set a take-profit")];
      case "marginShare":
        return [msg("as_margin_t", "Margin against the free balance"), msg("as_margin", "$1 of $2 free — $3 (a watch over $4).", money(d.marginE2), money(d.freeE2), pct(d.share), pct(d.threshold)), msg("as_margin_why", "What one contract takes is what the next one, or a margin call, cannot have."), null];
      case "liqNoise":
        return [msg("as_liq_t", "Liquidation against the window"), msg("as_liq", "At $1x the liquidation is $2 away. In this window $3 of $4 steps were at least that big.", String(d.leverage), `${d.awayPct.toFixed(2)}%`, String(Math.round(d.share * d.steps)), String(d.steps)), msg("as_liq_why", "Leverage is a distance; the window says whether that distance is an ordinary step."), null];
      case "funding":
        return [msg("as_funding_t", "Funding"), d.costE2 ? msg("as_funding", "Next settlement in $1 min at $2. On this contract that is $3 $4 per settlement, $5 a day (a watch under 45 min).", String(d.minutes), `${(d.rate * 100).toFixed(4)}%`, money(d.costE2), d.pays ? msg("as_paid", "paid") : msg("as_received", "received"), money(d.perDayE2)) : msg("as_funding_bare", "Next settlement in $1 min at $2 (a watch under 45 min).", String(d.minutes), `${(d.rate * 100).toFixed(4)}%`), msg("as_funding_why", "Three settlements a day; on a hold of days the rate is a real cost or a real income."), null];
      case "crowd":
        return [msg("as_crowd_t", "The crowd at an extreme"), d.n ? (d.baseUp != null ? msg("as_crowd", "$1 of accounts are long — the $2 percentile of the last 60 days. After the last $3 days like it, the price was higher 3 days later in $4, against $5 of all days.", pct(d.share), String(Math.round(d.rank * 100)), String(d.n), pct(d.up), pct(d.baseUp)) : msg("as_crowd_nobase", "$1 of accounts are long — the $2 percentile of the last 60 days. After the last $3 days like it, the price was higher 3 days later in $4.", pct(d.share), String(Math.round(d.rank * 100)), String(d.n), pct(d.up))) : msg("as_crowd_thin", "$1 of accounts are long — the $2 percentile of the last 60 days; no past days like it to count.", pct(d.share), String(Math.round(d.rank * 100))), msg("as_crowd_why", "A market where nine in ten accounts sit one way has one direction it can move fast in."), null];
      case "regime":
        return [msg("as_regime_t", "Regime"), msg("as_regime", "The last $1 bars moved $2× the $3 before — $4, percentile $5 — and lag-1 autocorrelation $6.", String(d.short), d.ratio.toFixed(2), String(d.long), d.regime === "expanding" ? msg("pp_regime_expanding", "expanding") : d.regime === "contracting" ? msg("pp_regime_contracting", "contracting") : msg("pp_regime_steady", "steady"), String(Math.round(d.pct * 100)), d.ac1 == null ? "—" : (d.ac1 >= 0 ? "+" : "\u2212") + Math.abs(d.ac1).toFixed(2)), msg("as_regime_why", "A stop sized for a damped regime is wrong for an amplified one, and the other way round."), null];
      case "location":
        return [msg("as_loc_t", "Location"), msg("as_loc", "$1 sits $2, against the value area of the $3 bars before it.", ctx.coin, loc(d.state), String(d.window)), msg("as_loc_why", "Where the price is against value is the first filter a process trader runs."), null];
      case "streak":
        return [msg("as_streak_t", "Losses in a row"), d.pause ? msg("as_streak", "The record ends with $1 in a row; the account pauses at $2.", String(d.streak), String(d.pause)) : msg("as_streak_nopause", "The record ends with $1 in a row; no pause rule is set.", String(d.streak)), msg("as_streak_why", "The third loss in a row is the one the record grades as taken angry."), msg("as_streak_go", "Open the record")];
      case "sameSide":
        return [msg("as_same_t", "Same-side exposure"), msg("as_same", "$1 contracts, all $2 ($3) — $4 of margin faces one move.", String(d.count), side(d.side), d.coins.join(", "), money(d.marginE2)), msg("as_same_why", "Crypto correlates in a fall; three longs on three coins is one trade."), null];
      case "news":
        return [msg("as_news_t", "Written in the last $1 h", String(d.hours)), msg("as_news", "$1 headline(s) name $2; the newest is $3 min old.", String(d.count), ctx.coin, d.newestMin == null ? "—" : String(d.newestMin)), msg("as_news_why", "A headline moves a thin book before it moves a thick one."), msg("as_news_go", "Read them")];
      case "clock":
        return [msg("as_clock_t", "The clock"), msg("as_clock", "$1 UTC, $2. This bar's volume sits at percentile $3 of the $4 on screen.", `${String(d.utcHour).padStart(2, "0")}:00`, [msg("as_sun", "Sunday"), msg("as_mon", "Monday"), msg("as_tue", "Tuesday"), msg("as_wed", "Wednesday"), msg("as_thu", "Thursday"), msg("as_fri", "Friday"), msg("as_sat", "Saturday")][d.utcDay], String(Math.round(d.pct * 100)), String(d.n)), msg("as_clock_why", "Thin hours slip more; the percentile says whether this hour is thin, the clock says only what time it is."), null];
      case "posStop":
        return [msg("as_pstop_t", "$1 — no stop", d.coin), msg("as_pstop", "The contract is running with no exit if it is wrong."), msg("as_stop_why", "A desk decides where it is wrong before it presses, and sizes from that distance."), msg("as_pstop_go", "Open the contract")];
      case "posTake":
        return [msg("as_ptake_t", "$1 — no take-profit or trail", d.coin), msg("as_ptake", "Nothing says where this contract is right."), msg("as_take_why", "Knowing where you get out if you are right is the other half of the plan."), msg("as_pstop_go", "Open the contract")];
      case "posLiq":
        return [msg("as_pliq_t", "$1 — liquidation", d.coin), msg("as_pliq", "The liquidation is $1 from the mark. In this window $2 of $3 steps were at least that big.", `${d.awayPct.toFixed(2)}%`, String(Math.round(d.share * d.steps)), String(d.steps)), msg("as_liq_why", "Leverage is a distance; the window says whether that distance is an ordinary step."), null];
      case "posMargin":
        return [msg("as_pmargin_t", "$1 — margin band", d.coin), msg("as_pmargin", "Equity is $1× the maintenance requirement — the venue's $2 band.", d.ratio == null ? "—" : d.ratio.toFixed(2), d.band === "danger" ? msg("pos_band_danger", "danger") : msg("pos_band_warn", "warning")), msg("as_pmargin_why", "The band is the venue's own warning; under 1.0 the contract is closed for you."), null];
      case "posGiveBack":
        return [msg("as_pgive_t", "$1 — given back", d.coin), msg("as_pgive", "Was up $1 at its best, now $2 — $3 of the peak given back (a watch over $4).", money(d.bestE2), (d.nowE2 >= 0 ? "+" : "\u2212") + money(d.nowE2), pct(d.gave), pct(d.threshold)), msg("as_pgive_why", "A contract that was up 3R and is now up 0.5R has already said something."), msg("as_pstop_go", "Open the contract")];
      case "posR":
        return [msg("as_pr_t", "$1 — R now", d.coin), msg("as_pr", "$1R — the result in units of the $2 the first stop risked.", (d.r >= 0 ? "+" : "\u2212") + Math.abs(d.r).toFixed(2), money(d.riskE2)), msg("as_pr_why", "Profit in units of risk, not in money, is how a record becomes comparable."), null];
      case "posHeld":
        return [msg("as_pheld_t", "$1 — held", d.coin), d.fundingDue ? msg("as_pheld", "Held $1 min; $2 funding settlement(s) due at the next mark.", String(d.minutes), String(d.fundingDue)) : msg("as_pheld_none", "Held $1 min.", String(d.minutes)), msg("as_pheld_why", "Time is a cost on a perpetual."), null];
      case "grades":
        return [msg("as_grades_t", "The record's grades"), msg("as_grades", "$1 closed: A $2 · B $3 · C $4, $5 bad losses.", String(d.n), String(d.A), String(d.B), String(d.C), String(d.bad)), msg("as_grades_why", "The result is one draw; the process is what repeats."), msg("as_streak_go", "Open the record")];
      case "bySetup":
        return [msg("as_bysetup_t", "Your record, by setup"), msg("as_bysetup", "With $1: $2 of $3 came good; without it $4 of $5.", d.code, String(d.with.wins), String(d.with.n), String(d.without.wins), String(d.without.n)), msg("as_bysetup_why", "The one statistic no venue can show you — your own contracts, conditioned on the moment you entered."), msg("as_streak_go", "Open the record")];
      default:
        return [item.key, "", "", null];
    }
  },

  assistantJump: (item, contract) => {
    const focus = (label) => () => {
      const el = document.querySelector(`input[aria-label='${label}']`);
      if (el) el.focus();
    };
    if (item.jump === "stop") return () => panel.setState({ pTab: "trade" }, focus(msg("pos_stop_aria", "Stop price")));
    if (item.jump === "take") return () => panel.setState({ pTab: "trade" }, focus(msg("pos_take_aria", "Take-profit price")));
    if (item.jump === "position" && contract) return () => panel.setState({ ppRead: "positions", ppRow: contract.pos });
    if (item.jump === "closed") return () => panel.setState({ ppRead: "closed" });
    if (item.jump === "news") return () => panel.setState({ ppRead: "news" });
    return null;
  },

  /* **On the chart.** An item that is about a price carries a `chart`
     hint — the level it names and the band of ordinary steps around the
     price it is measured from. Looking at the row (hover or focus) draws the
     hint on the market chart; pressing "On the chart" pins it until pressed
     again. So "the stop is inside the noise" is a band you can see the stop
     sitting in, not only a sentence. */
  assistantFocus: (item, contract, pin) => {
    if (!item.chart) return;
    const key = `${contract ? contract.pos + "-" : ""}${item.key}`;
    const cur = panel.state.ppFocus;
    if (pin) {
      panel.setState({ ppFocus: cur && cur.key === key && cur.pinned ? null : { ...item.chart, key, pinned: true } });
      return;
    }
    if (cur && cur.pinned) return;
    panel.setState({ ppFocus: { ...item.chart, key, pinned: false } });
  },

  assistantBlur: () => {
    const cur = panel.state.ppFocus;
    if (cur && !cur.pinned) panel.setState({ ppFocus: null });
  },

  renderAssistantItems: (items, ctx, contract) =>
    items.map((item) => {
      const [title, text, why, go] = panel.assistantWords(item, ctx);
      const jump = go ? panel.assistantJump(item, contract) : null;
      const key = `${contract ? contract.pos + "-" : ""}${item.key}`;
      const pinned = Boolean(panel.state.ppFocus && panel.state.ppFocus.key === key && panel.state.ppFocus.pinned);
      return React.createElement(
        AlertPosAssistRow,
        {
          key,
          "data-practice-assist": item.kind,
          "data-practice-assist-key": item.key,
          "data-practice-assist-chart": item.chart ? (pinned ? "pinned" : "yes") : "no",
          onMouseEnter: () => panel.assistantFocus(item, contract, false),
          onMouseLeave: () => panel.assistantBlur(),
        },
        React.createElement(
          AlertPosKind,
          { kind: item.kind },
          item.kind === "missing" ? msg("as_kind_missing", "Missing") : item.kind === "watch" ? msg("as_kind_watch", "Watch") : msg("as_kind_note", "Note"),
        ),
        React.createElement(
          "div",
          null,
          React.createElement("strong", null, title),
          React.createElement("span", null, text),
          why ? React.createElement(AlertPosWhy, null, why) : null,
          React.createElement(
            AlertPosAssistActions,
            null,
            jump
              ? React.createElement(AlertPosChip, { onClick: jump, "data-practice-assist-go": item.jump }, go)
              : null,
            item.chart
              ? React.createElement(
                  AlertPosChip,
                  {
                    active: pinned,
                    "aria-pressed": pinned ? "true" : "false",
                    "data-practice-assist-pin": key,
                    onClick: () => panel.assistantFocus(item, contract, true),
                  },
                  pinned ? msg("as_chart_pinned", "On the chart \u2713") : msg("as_chart_show", "On the chart"),
                )
              : null,
          ),
        ),
      );
    }),

  renderAssistant: (coin, marks) => {
    const ctx = panel.assistantContext(coin, marks);
    const r = assistantReadings(ctx);
    const head = (key, label, count) =>
      React.createElement(
        AlertPosPaneHead,
        { key: `${key}-head` },
        React.createElement("span", null, label),
        React.createElement("span", null, count),
      );
    const blocks = [];
    blocks.push(head("before", msg("as_before", "Before a contract"), String(r.before.length)));
    blocks.push(
      r.before.length
        ? React.createElement(AlertPosExplain, { key: "before", "data-practice-assist-phase": "before" }, ...panel.renderAssistantItems(r.before, ctx, null))
        : React.createElement(AlertPosMeasure, { key: "before-none" }, msg("as_before_none", "Nothing to raise on this market yet — the ticket and the range decide what appears here.")),
    );
    blocks.push(head("during", msg("as_during", "While a contract is open"), String(r.during.reduce((a, c) => a + c.items.length, 0))));
    if (r.during.length) {
      for (const c of r.during) {
        blocks.push(
          React.createElement(
            AlertPosExplain,
            { key: `c-${c.pos}`, "data-practice-assist-phase": "during", "data-practice-assist-pos": c.pos },
            React.createElement(
              AlertPosAssistContract,
              null,
              `${c.coin} · ${c.side === "short" ? msg("pos_short", "Short") : msg("pos_long", "Long")}`,
            ),
            ...(c.items.length
              ? panel.renderAssistantItems(c.items, ctx, c)
              : [React.createElement(AlertPosMeasure, { key: "none" }, msg("as_pos_clean", "A stop, an exit and a liquidation further than any step in the window."))]),
          ),
        );
      }
    } else {
      blocks.push(React.createElement(AlertPosMeasure, { key: "during-none" }, msg("as_during_none", "No contract is open.")));
    }
    blocks.push(head("after", msg("as_after", "After"), String(r.after.length)));
    blocks.push(
      r.after.length
        ? React.createElement(AlertPosExplain, { key: "after", "data-practice-assist-phase": "after" }, ...panel.renderAssistantItems(r.after, ctx, null))
        : React.createElement(AlertPosMeasure, { key: "after-none" }, msg("as_after_none", "Nothing closed yet; the grades and the record by setup appear here once something has.")),
    );
    blocks.push(
      React.createElement(
        AlertPosMeasure,
        { key: "rule", "data-practice-assist-rule": "true" },
        msg("as_rule", "Facts with their counts, in the order a desk checks them. Nothing here says which way; what is missing is missing, what has a clock on it is a watch, the rest is context."),
      ),
    );
    return React.createElement(Fragment, null, ...blocks);
  },

  /* The badge for the tab: what is missing plus what has a clock on it. */
  assistantBadge: (coin, marks) => {
    const r = assistantReadings(panel.assistantContext(coin, marks));
    return r.missing + r.watch;
  },

  renderMarketReadings: (coin, marks, part) => {
    const series = panel.props.series;
    const practice = panel.props.practice;
    if (!Array.isArray(series) || series.length < 2) return null;
    /* **Ids, not contracts.** `practiceForCoin` answers the keys of the store
       — the same shape the ticket's `heldHere` walks — and reading `.entry`
       off a string is silently `undefined`: the levels simply never drew and
       the measure never appeared, with nothing thrown anywhere. */
    const held = (practice ? practiceForCoin(practice, coin) : [])
      .map((id) => practiceAt(practice, id))
      .filter(Boolean);
    const markE4 = marks && marks[coin];

    /* **The measure.** How far the nearest liquidation is, counted against
       the steps this very window is made of — `moveRarity` is the share of
       steps at least that big, so the sentence carries its own denominator.
       Zero of them is the common answer and the useful one: it is what "your
       liquidation is further away than anything that has happened here" looks
       like as a number. Never an arrow, never a probability about your
       contract: the standing rule of `baserates.js` applies here too. */
    let measure = null;
    if (held.length && markE4) {
      let nearest = null;
      for (const pos of held) {
        const liq = practiceLiquidationPrice(pos);
        if (!liq) continue;
        const away = Math.abs(liq - markE4) / markE4;
        if (!nearest || away < nearest.away) nearest = { away, liq, pos };
      }
      if (nearest) {
        const share = moveRarity(series, { from: markE4, to: nearest.liq });
        const steps = series.length - 1;
        measure = share == null
          ? null
          : React.createElement(
              AlertPosMeasure,
              { "data-practice-measure": "true" },
              /* **Plain strings only.** `msg` substitutes text; handing it a
                 React element puts `[object Object]` in the middle of a
                 sentence — which is exactly what happened the first time, and
                 what an empty-looking pane in a screenshot turned out to be.
                 The emphasis lives on the whole line instead. */
              msg(
                "pos_pane_measure",
                "The nearest liquidation is $1 away. In this window $2 of $3 steps were at least that big.",
                `${(nearest.away * 100).toFixed(2)}%`,
                String(Math.round(share * steps)),
                String(steps),
              ),
            );
      }
    }

    /* **What has been written about this market, in the column that is
       already about this market.**
     *
     * Ranked, never filtered — `newsAboutCoin`'s own rule, and the reason the
     * move card does not empty for every coin but BTC. What names the coin
     * comes first; if nothing does, the latest of the feed is shown under a
     * line that says so, because "nothing was written about BTC in the last
     * hour" is a real answer and an empty box is not one.
     *
     * It costs no request: `newsWanted` now counts this screen, so the feed
     * the ticker and the panel share is loaded while it is open and by
     * nothing of its own. */
    /* **Has this happened before?** — the app's own best idea, applied to the
       market the ticket is pointed at. Counted, never predicted: the sentence
       says how many times the market has been in this state and what followed
       those times, and it says how many *ordinary* weeks did the same, so the
       comparison carries its own denominator. Below `BASE_RATE_MIN_EPISODES`
       the count stands and the comparison is refused — `edge` is null there
       and nothing is written in its place. */
    const edge = panel.edgeReading();
    const edgeBlock = React.createElement(
      React.Fragment,
      null,
      React.createElement(
        AlertPosPaneHead,
        null,
        React.createElement("span", null, msg("pos_edge_head", "Has this happened before?")),
      ),
      React.createElement(
        AlertPosMeasure,
        { "data-practice-edge": edge ? (edge.state ? "state" : "none") : "waiting" },
        !edge
          ? panel.state.edgeLoading !== false
            ? msg("pos_edge_wait", "Reading this market's daily history.")
            : msg(
                "pos_edge_short",
                "Not enough daily history for $1 to count anything against.",
                coin,
              )
          : !edge.state
            ? msg(
                "pos_edge_idle",
                "$1 is in none of the states this app counts. Its daily RSI is $2, over $3 days of history.",
                coin,
                edge.rsi == null ? "—" : edge.rsi.toFixed(0),
                String(edge.days),
              )
            : !edge.result || !edge.result.n
              ? msg(
                  "pos_edge_never",
                  "$1, and this market has not been there before in $2 days of history.",
                  edge.state.title,
                  String(edge.days),
                )
              : edge.result.edge == null
                ? msg(
                    "pos_edge_few",
                    "$1, $2 times in $3 days. Too few to compare against an ordinary week — the count is what there is.",
                    edge.state.title,
                    String(edge.result.n),
                    String(edge.days),
                  )
                : msg(
                    "pos_edge_count",
                    "$1, $2 times. A week later the price was higher in $3% of them, against $4% of ordinary weeks here.",
                    edge.state.title,
                    String(edge.result.n),
                    edge.result.up.toFixed(0),
                    edge.result.baseUp.toFixed(0),
                  ),
      ),
      React.createElement(
        AlertPosMeasure,
        { "data-practice-edge-rule": "true" },
        /* Said on the screen, not only in a document: the strip sits next to
           an order button, which is the one place a count is most likely to
           be read as a recommendation. */
        msg(
          "pos_edge_rule",
          "A count of what has happened, not a claim about what will. Press B for the full table.",
        ),
      ),
    );

    const feed = Array.isArray(panel.props.newsItems) ? panel.props.newsItems : [];
    const split = newsAboutCoin(feed, coin, null, null, panel.props.newsSources);
    const stories = (split.about.length ? split.about : split.other).slice(0, 4);
    const headlines = React.createElement(
      React.Fragment,
      null,
      React.createElement(
        AlertPosPaneHead,
        null,
        React.createElement(
          "span",
          null,
          stories.length === 0
            ? msg("pos_news_head", "Headlines")
            : split.about.length
              ? msg("pos_news_about", "Written about $1", coin)
              : msg("pos_news_other", "Nothing names $1 — the latest instead", coin),
        ),
      ),
      stories.length
        ? React.createElement(
            AlertPosNews,
            { "data-practice-news": split.about.length ? "about" : "feed" },
            ...stories.map((item, i) =>
              React.createElement(
                AlertPosNewsRow,
                { key: `n-${i}-${item.source}` },
                React.createElement(
                  "a",
                  {
                    href: item.url || undefined,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    /* The newsroom and the moment, on hover — the news
                       panel's own row carries the same pair, and a headline
                       with no date is a headline nobody can weigh. */
                    title: item.url
                      ? `${item.source}${newsExactTime(item.time)}`
                      : item.title,
                  },
                  item.title,
                ),
                React.createElement(AlertPosNewsAge, null, newsAge(item.time)),
              ),
            ),
          )
        : React.createElement(
            AlertPosMeasure,
            { "data-practice-news": "empty" },
            panel.props.newsLoading
              ? msg("pos_news_wait", "Reading the newsrooms.")
              : msg(
                  "pos_news_off",
                  "No headlines have arrived. The news panel (N) is where the sources are chosen.",
                ),
          ),
    );

    /* **One block or the other.** The page gives the counts and the
       headlines tabs of their own, so this says which is wanted rather than
       rendering both and letting the caller throw one away. */
    if (part === "news") return headlines;
    return React.createElement(
      Fragment,
      null,
      held.length ? measure : null,
      edgeBlock,
    );
  },

  /* **The venue's own book, polled while it is on screen and never otherwise.**
   *
   * Five seconds is the cache's life (`ORDER_BOOK_TTL`) and therefore the
   * fastest this can usefully ask; the timer is cleared the moment the panel
   * closes, the coin changes or the tab is hidden, because this is the new tab
   * page and a page that keeps a network timer running in the background is
   * the thing this project measures itself against.
   *
   * `bookFor` guards the same race `loadFunding` guards: a reply for the coin
   * you were on before is not an answer about the coin you are on. */
  /* **Which tab the derivatives panel is showing**, by the rule above: an
     explicit press wins, otherwise the coin you are looking at decides —
     holding BTC is not a reason to hide the ETH form. Extracted when the order
     book needed to know, because a book that polls while the Positions tab is
     up is a request nobody asked for. */
  futuresTab: () => {
    const valid = ["trade", "orders", "funds", "account"];
    if (valid.includes(panel.state.pTab)) return panel.state.pTab;
    /* **The ticket, unless a contract was opened for reading.** The desk used
       to land on the list whenever the market had one, which is now the
       page's own panel; what is left here is the form and, while a contract
       is being studied, that contract. */
    return "trade";
  },

  /* **The assistant, and the one rule it has: it counts, it never advises.**
   *
   * `WORKSPACE_PLAN.md` §5, asked for as *"algoritmik ve verilere dayanan bir
   * tahmin yardımcısı"*. What it is **not** is a forecast about this contract:
   * a base rate is a fact about a market's history, a forecast is a claim
   * about the future, and the standing rule of `baserates.js` — no arrow, no
   * score, every figure with its `n` — applies here for the same reason it
   * applies there, only harder, because this screen has an order button on it.
   *
   * It costs one request per coin per twelve hours, shared with the base-rate
   * panel through `dailyClosesCache`, and it is asked for only while this
   * screen is open. */
  loadEdge: () => {
    const coin = panel.props.activeCoin;
    if (!coin) return;
    if (panel.state.edgeFor !== coin) {
      panel.setState({ edgeFor: coin, edgeCloses: null, edgeLoading: true });
    }
    Promise.resolve(fetchDailyCloses(coin))
      .then((closes) => {
        if (panel._gone || panel.props.activeCoin !== coin) return;
        panel.setState({ edgeCloses: closes, edgeFor: coin, edgeLoading: false });
      })
      .catch(() => {
        if (panel._gone || panel.props.activeCoin !== coin) return;
        panel.setState({ edgeCloses: false, edgeFor: coin, edgeLoading: false });
      });
  },

  /* What the market is in right now, of the states this app already counts,
     and what has followed it before. One state and one horizon: the panel
     behind "B" is where the full table lives, and a strip beside an order
     ticket that tried to be that table would be read by nobody.

     **The live state, not the most flattering one.** Which state is drawn is
     decided by the RSI as it stands — picking the state with the biggest
     number would be a recommendation wearing a count's clothes. */
  edgeReading: () => {
    const closes = panel.state.edgeCloses;
    if (!Array.isArray(closes) || closes.length < 200) return null;
    const rsi = dailyRsi(closes);
    const last = closes.length - 1;
    const live = BASE_RATE_STATES.find((st) => st.test(rsi[last]));
    if (!live) return { rsi: rsi[last], days: closes.length, state: null };
    return {
      rsi: rsi[last],
      days: closes.length,
      state: live,
      /* Seven days, the shorter of the two horizons the panel offers: a
         contract at 20x is not a thirty-day instrument. */
      result: baseRateFor(closes, rsi, live.test, 7),
    };
  },

  loadBook: () => {
    const coin = panel.props.activeCoin;
    if (!coin) return;
    if (panel.state.bookFor !== coin) panel.setState({ bookFor: coin, book: null, trades: null });
    /* P7 — the tape rides the book's timer, and only while it is the tab on
       screen: a request for trades nobody is looking at is a request this
       new-tab page is making for nobody. */
    if (panel.state.ppBookTab === "trades" && typeof panel.loadTrades === "function") panel.loadTrades();
    /* The deep book only when a filter needs what lies behind the first
       rows — see `ORDER_BOOK_DEEP`. */
    const deep = Boolean(panel.state.ppBookStep) || Boolean(panel.state.ppBookMin)
      /* The depth curve is the whole book as read, so it reads all of it. */
      || panel.state.ppBookTab === "depth";
    Promise.resolve(fetchOrderBook(coin, deep))
      .then((b) => {
        if (panel._gone || panel.props.activeCoin !== coin) return;
        panel.setState({ book: b, bookFor: coin });
      })
      .catch(() => {
        if (panel._gone || panel.props.activeCoin !== coin) return;
        panel.setState({ book: false, bookFor: coin });
      });
  },

  bookTimer: (on) => {
    clearInterval(panel._bookT);
    panel._bookT = null;
    if (!on) return;
    panel.loadBook();
    panel._bookT = setInterval(() => {
      if (panel._gone || (typeof document !== "undefined" && document.hidden)) return;
      panel.loadBook();
    }, ORDER_BOOK_TTL);
  },

  /* **The ladder.** Asks descending to the spread, the spread, then bids —
     the way every venue draws it, because the two prices that matter are the
     ones either side of the line in the middle. */
  /* **The ladder, and the three ways to read it.** Which side (both, bids
     or asks — one side alone draws twice the rows), how finely (the venue's
     tick, or ten or a hundred of them grouped), and how big a level has to be
     to be drawn. Each is a reading of the same book, never a change to it:
     the running total beside a row still counts every level a filter hid. */
  renderBookFilters: (steps) => {
    const view = panel.state.ppBookView || "both";
    const stepIdx = panel.state.ppBookStep || 0;
    const min = panel.state.ppBookMin || 0;
    const set = (patch) => panel.setState(patch, () => panel.loadBook());
    return React.createElement(
      PracticeBookFilters,
      { "data-practice-book-filters": "true" },
      React.createElement(
        PracticeSegment,
        { role: "group", "aria-label": msg("pp_book_view_aria", "Which side of the book") },
        ...[
          ["both", msg("pp_book_both", "Both")],
          ["bids", msg("pp_book_bids", "Bids")],
          ["asks", msg("pp_book_asks", "Asks")],
        ].map(([v, label]) =>
          React.createElement(
            AlertPosChip,
            { key: v, active: view === v, "aria-pressed": view === v, onClick: () => set({ ppBookView: v }) },
            label,
          ),
        ),
      ),
      steps.length < 2 ? null : React.createElement(
        PracticeBookPick,
        null,
        React.createElement("span", { "aria-hidden": "true" }, msg("pp_book_step", "Step")),
        React.createElement(
          PracticeBookSelect,
          {
            "aria-label": msg("pp_book_step_aria", "Group price levels by"),
            value: String(stepIdx),
            onChange: (e) => set({ ppBookStep: Number(e.target.value) || 0 }),
          },
          ...steps.map((st, i) =>
            React.createElement("option", { key: i, value: String(i) }, formatAxisPrice(st, st, "")),
          ),
        ),
      ),
      React.createElement(
        PracticeBookPick,
        null,
        React.createElement("span", { "aria-hidden": "true" }, msg("pp_book_min", "Min size")),
        React.createElement(
          PracticeBookSelect,
          {
            "aria-label": msg("pp_book_min_aria", "Hide levels smaller than"),
            value: String(min),
            onChange: (e) => set({ ppBookMin: Number(e.target.value) || 0 }),
          },
          ...PRACTICE_BOOK_MINS.map((v) =>
            React.createElement(
              "option",
              { key: v, value: String(v) },
              v ? `${formatWidgetUsdt(v)} ${PRACTICE_CURRENCY}` : msg("pp_book_min_all", "All"),
            ),
          ),
        ),
      ),
    );
  },

  /* **The ladder.** Asks descending to the spread, the spread, then bids —
     the way every venue draws it, because the two prices that matter are the
     ones either side of the line in the middle. */
  /* **A price from the book onto the ticket** (27 Sep 2026). A bid level is
   * where a long rests, an ask where a short does — so the press sets the
   * side that makes the order *rest* there, not cross the spread and be
   * refused, and switches the ticket to a limit at that price. Nothing is
   * placed: the ticket's own button is still the order. */
  /* A price off the page's chart onto the ticket — rounded to the book's
     tick (a hundredth of the axis step before a book has arrived), with
     the side that rests there: under the price a long, over it a short. */
  pickChartPrice: (raw, nowPrice, fallbackTick) => {
    const tick = panel.state.book && panel.state.book.tick > 0 ? panel.state.book.tick : fallbackTick || 0.01;
    const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(tick))));
    const clean = Number((Math.round(raw / tick) * tick).toFixed(decimals));
    if (!(clean > 0)) return;
    panel.setState({
      pTab: "trade",
      pKind: "limit",
      pSide: clean < nowPrice ? "long" : "short",
      pEntry: String(clean),
      pReduce: false,
      pTicketWhy: null,
      pArm: null,
    });
  },

  pickBookPrice: (price, side) => {
    if (!(price > 0)) return;
    panel.setState({
      pTab: "trade",
      pKind: "limit",
      pSide: side === "ask" ? "short" : "long",
      pEntry: String(price),
      pReduce: false,
      pTicketWhy: null,
      pArm: null,
      ppBookAt: price,
    });
  },

  /* The last price, and which way the one before it went. */
  lastPriceMark: (coin) => {
    const live = panel.props.livePrices && panel.props.livePrices[coin];
    const t = perpTickerFor(coin);
    const last = live > 0 ? live : t ? t.last : null;
    if (!(last > 0)) return null;
    const prev = panel._lastSeen && panel._lastSeen.coin === coin ? panel._lastSeen : null;
    const dir = prev && prev.price !== last ? (last > prev.price ? "up" : "down") : prev ? prev.dir : null;
    if (!prev || prev.price !== last) panel._lastSeen = { coin, price: last, dir };
    return React.createElement(
      PracticeReadoutLine,
      { tone: dir, "data-practice-book-last": dir || "flat" },
      React.createElement("strong", null, practicePriceText(Math.round(last * PRICE_SCALE), panel.posSymbol())),
      dir === "up" ? " \u2191" : dir === "down" ? " \u2193" : "",
    );
  },

  renderOrderBook: (coin) => {
    const book = panel.state.book;
    const sym = panel.posSymbol();
    if (book === false || (book && !book.asks)) {
      return React.createElement(
        AlertPosBook,
        { "data-practice-book": "none" },
        React.createElement(
          AlertPosHint,
          null,
          msg("pos_book_none", "No book for this market right now."),
        ),
      );
    }
    if (!book) {
      return React.createElement(AlertPosBook, { "data-practice-book": "loading" });
    }
    const view = panel.state.ppBookView || "both";
    const steps = bookSteps(book.tick, book);
    const stepIdx = Math.min(panel.state.ppBookStep || 0, Math.max(0, steps.length - 1));
    const min = panel.state.ppBookMin || 0;
    /* As many rows as the column has room for (measureBody reads it), from
       ORDER_BOOK_ROWS up to what the shallow request carries. */
    const rowsHere = panel.state.ppBookRows > 0 ? panel.state.ppBookRows : ORDER_BOOK_ROWS;
    const ladder = bookLadder(book, {
      step: stepIdx > 0 ? steps[stepIdx] : 0,
      view,
      min,
      rows: view === "both" ? rowsHere : rowsHere * 2,
    });
    const price = (v) => practicePriceText(Math.round(v * PRICE_SCALE), sym);
    /* **One tab stop for the ladder, the arrows inside it** — a roving
       tabindex: the best bid is the stop until a row is pressed, and ↑/↓
       walk the rows from there. Thirty-two stops in a row of Tab would make
       the ticket beside it thirty-two presses further away. */
    const stopAt = panel.state.ppBookAt;
    let stopTaken = false;
    const row = (r, side, first) => {
      const isStop = stopAt != null ? stopAt === r.price : first;
      const tabIndex = isStop && !stopTaken ? 0 : -1;
      if (tabIndex === 0) stopTaken = true;
      return React.createElement(
        AlertPosBookRow,
        {
          key: `${side}-${r.price}`,
          side,
          role: "button",
          tabIndex,
          "data-owns-arrows": "true",
          "data-practice-book-row": side,
          "data-price": String(r.price),
          title: side === "ask"
            ? msg("pp_book_pick_ask", "Sell at $1 — a short limit resting at this ask", price(r.price))
            : msg("pp_book_pick_bid", "Buy at $1 — a long limit resting at this bid", price(r.price)),
          onClick: () => panel.pickBookPrice(r.price, side),
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              panel.pickBookPrice(r.price, side);
              return;
            }
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            const rows = Array.from(e.currentTarget.parentNode.querySelectorAll("[data-practice-book-row]"));
            const i = rows.indexOf(e.currentTarget);
            const next = rows[i + (e.key === "ArrowUp" ? -1 : 1)];
            if (next) {
              panel.setState({ ppBookAt: Number(next.getAttribute("data-price")) });
              next.focus();
            }
          },
          pct: ladder.deepest ? (r.depth / ladder.deepest) * 100 : 0,
          /* The figures are already on the row; what the screen reader cannot
             see is which side it is and how deep the book is by then. */
          "aria-label": msg(
            "pos_book_row_aria",
            "$1 $2, $3 deep",
            side === "ask" ? msg("pos_book_ask", "Ask") : msg("pos_book_bid", "Bid"),
            price(r.price),
            `${formatWidgetUsdt(r.depth * r.price)} ${PRACTICE_CURRENCY}`,
          ),
        },
        React.createElement("span", null, price(r.price)),
        /* **What is resting there, in money**, then the running total to
           that level. In coins it was unreadable: a BTC contract is 0.01 of
           a coin, so most rows rounded to `0.000`. */
        React.createElement("span", null, formatWidgetUsdt(r.size * r.price)),
        React.createElement("span", null, formatWidgetUsdt(r.depth * r.price)),
      );
    };
    const none = (side) =>
      React.createElement(
        AlertPosHint,
        { key: `none-${side}` },
        msg("pp_book_min_none", "No level that size within $1 of the best price — as far as the book was read.", price(ladder.reach)),
      );
    return React.createElement(
      AlertPosBook,
      { "data-practice-book": coin, "data-practice-book-view": view },
      panel.renderBookFilters(steps),
      React.createElement(
        AlertPosBookCols,
        { "aria-hidden": "true" },
        React.createElement("span", null, msg("pp_book_price", "Price")),
        React.createElement("span", null, `${msg("pp_book_size", "Size")} · ${PRACTICE_CURRENCY}`),
        React.createElement("span", null, msg("pp_book_total", "Total")),
      ),
      /* Asks are drawn far-to-near so the spread sits in the middle of the
         ladder, which is the shape everyone reads a book in. */
      ...(view === "bids"
        ? []
        : ladder.asks.length
          ? [...ladder.asks].reverse().map((r, i, all) => row(r, "ask", view === "asks" && i === all.length - 1))
          : [none("ask")]),
      React.createElement(
        AlertPosBookSpread,
        { "data-practice-spread": "true" },
        /* **The last trade, large, between the two sides** — where every
           venue prints it, in the colour of its last move. */
        panel.lastPriceMark(coin),
        React.createElement("span", null, msg("pos_book_spread", "Spread")),
        React.createElement(
          "strong",
          null,
          msg(
            "pos_book_spread_v",
            "$1 · $2 bps",
            practicePriceText(Math.round(book.spread * PRICE_SCALE), sym),
            book.spreadBps.toFixed(2),
          ),
        ),
      ),
      ...(view === "asks"
        ? []
        : ladder.bids.length
          ? ladder.bids.map((r, i) => row(r, "bid", i === 0))
          : [none("bid")]),
      React.createElement(
        AlertPosHint,
        null,
        msg(
          "pos_book_note",
          "OKX's live $1 perpetual book, sized in USDT. Nothing you open here reaches it.",
          coin,
        ),
      ),
    );
  },

  loadFunding: () => {
    const coin = panel.props.activeCoin;
    if (!coin || panel.state.fundingFor === coin) return;
    panel.setState({ fundingFor: coin, funding: null });
    Promise.resolve(fetchFundingRate(coin))
      .then((f) => {
        if (panel._gone || panel.state.fundingFor !== coin) return;
        panel.setState({ funding: f && isFinite(f.rate) ? f : false });
      })
      .catch(() => {
        if (panel._gone || panel.state.fundingFor !== coin) return;
        panel.setState({ funding: false });
      });
  },
});
