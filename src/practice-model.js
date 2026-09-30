/* PRACTICE MODEL — Synthetic Linear v1.
 *
 * Every Practice Unit that moves, moves through one of these functions, and
 * every movement leaves a signed ledger event. That is the contract the
 * prototype did not have: its balance was a running float nobody could
 * reconcile, and a saved position came back with a different margin than it
 * was saved with — measured, 300 PU vanished across one save/restore and the
 * liquidation price moved 15 points against the holder.
 *
 * Pure. No DOM, storage, fetch, `Date.now` or `Math.random`. Virtual time,
 * mark and seed all arrive as arguments, which is what makes the whole
 * account testable without a browser and reproducible from a seed.
 *
 * **The one identity, asserted by the tests and by `practiceReconcile`:**
 *
 *     balance === startingBalance + sum(event.cashDelta)
 *     margin  === sum(event.marginDelta)
 *
 * Margin is *stored*, never recomputed from quantity and leverage. The
 * prototype recomputed it in its sanitizer, which was correct until margin
 * could be added to a position and then silently destroyed 300 PU on the next
 * load. A number the user can change is a number that has to be persisted.
 */

const PRACTICE_MODEL_VERSION = 1;
/* 2 on 16 Sep 2026: the two session rules went off by default, and a stored
   account needs one pass to let go of the ones it never chose.
   3, the same day: the contract quota was removed from the product altogether
   and the loss stop is cleared on load whatever it was set to — see the
   migration in `sanitizePractice`. */
const PRACTICE_SCHEMA_VERSION = 5;
/* The schema each let-go migration arrived with. Named separately so a later
 * bump cannot re-run an earlier one: at 3 the loss stop was turned off and
 * ended accounts un-ended; at 4 the per-contract margin wall was turned off.
 * Somebody who turned the loss stop back on at schema 3 keeps it at 4. */
const PRACTICE_SCHEMA_LOSS_STOP_OFF = 3;
const PRACTICE_SCHEMA_MARGIN_WALL_OFF = 4;
/* 5 on 19 Sep 2026: the account became USDT-margined — see `PRACTICE_CURRENCY`. */
const PRACTICE_SCHEMA_USDT = 5;
/* **The one currency this account is in.** A USDT-margined perpetual is
 * quoted, margined and settled in USDT whatever the rest of the app is set to
 * show, so every contract and order is stamped with it and priced off the
 * perpetual itself (`perpLastFor`). It used to be the display currency, which
 * made a euro account on a euro chart and paused every contract the moment
 * the setting changed. */
const PRACTICE_CURRENCY = "USDT";
/* The sign a practice amount is printed with: the unit after the number for
   USDT (`practiceUnitAfter`), the display currency's own sign for a contract
   from before the switch. Runtime-only — `getCurrencySymbol` is config's. */
const practiceSymbolFor = (currency) =>
  !currency || currency === PRACTICE_CURRENCY ? ` ${PRACTICE_CURRENCY}` : getCurrencySymbol(currency);
/* What an older account's `USD` (or unstamped) contract becomes at schema 5.
 * A dollar and a tether trade within a tenth of a percent of each other, so a
 * dollar contract is carried across as it stands. Any other currency is not:
 * a lira entry read as tether would liquidate on the first tick, so those are
 * left in their own currency — paused, and said to be — rather than guessed. */
const practiceUsdtStamp = (currency, stored) => {
  const c = typeof currency === "string" ? currency.toUpperCase().slice(0, 4) : "";
  if (stored < PRACTICE_SCHEMA_USDT && (c === "" || c === "USD")) return PRACTICE_CURRENCY;
  return c;
};
const PRACTICE_SETTLEMENT_QUOTE = "quote";
const PRACTICE_SETTLEMENT_COIN = "coin";
const PRACTICE_START_COLLATERAL_E8 = COIN_SCALE; // 1.00000000 of each contract coin
const PRACTICE_MIN_COLLATERAL_E8 = 1000000; // 0.01000000
const PRACTICE_MAX_COLLATERAL_E8 = 100000000000; // 1,000.00000000
const PRACTICE_MAX_COIN_E8 = PRACTICE_MAX_COLLATERAL_E8 * 100;
const PRACTICE_INVERSE_LOT_E2 = MONEY_SCALE; // one quote-money contract

/* Training rules. Every one of these is a stated assumption of Synthetic
 * Linear v1, not a claim about any venue. They are stamped onto each event so
 * a later version cannot silently rescore an old session. */
const PRACTICE_FEE_PPM = 500; // 0.05% of notional per fill
const PRACTICE_SLIP_PPM = 500; // 0.05% adverse on every market fill

/* **The costs are the exercise, so they are a setting — and a setting that is
 * part of the account, not of the app.**
 *
 * Zero fees and zero slippage is a *legitimate* exercise: it isolates whether
 * the direction was right from what it cost to find out. Doubling them is how
 * somebody feels why scalping at 200x does not work. Neither is a toy, and
 * neither can be a global preference: a record read against costs it was not
 * traded under is a record that lies, so the figures live on the account, they
 * are locked while a contract is running, and every position **carries its
 * own copy**.
 *
 * That last part is what makes the maintenance rate work. `practiceMaintenance`
 * is handed a position and a price and never the session — it is called from
 * `practiceIsLiquidated`, from the ratio, from the band, from the chart — and
 * threading the session through all of them to look up one number would be a
 * far larger change than stamping the number where it is used. It is also more
 * honest: a contract opened under one schedule keeps it, exactly as a disposal
 * keeps the cost method it was recorded under.
 *
 * The choices are round numbers around the venue's own: 0.05% is what Coinbase
 * and Binance charge a taker, so it is the default and the middle of the list.
 */
const PRACTICE_COST_CHOICES = {
  feePpm: [0, 200, 500, 1000],
  slipPpm: [0, 200, 500, 1000],
};
/* **The maker fee, which is the whole reason to learn limit orders.**
 *
 * Every venue charges less — often a third — for an order that *rested* and was
 * filled by somebody else crossing to it, because that order was the liquidity
 * rather than the thing consuming it. 0.02% against a 0.05% taker is the shape
 * Binance, OKX and Bybit all publish.
 *
 * It is not a separate setting. The costs row on the Account tab asks one
 * question — "charge what a venue charges?" — and a second number under it
 * would be a preference about a preference. Derived from the taker fee so the
 * two cannot drift: a fifth of it is the ratio the venues quote, and at 0 it is
 * also 0, which is what "off" has to mean. */
const practiceMakerPpm = (feePpm) => Math.floor((feePpm || 0) * 0.4);
const practiceCosts = (s) => {
  const c = (s && s.costs) || null;
  return {
    feePpm: c && Number.isSafeInteger(c.feePpm) && c.feePpm >= 0 && c.feePpm <= 10000
      ? c.feePpm
      : PRACTICE_FEE_PPM,
    slipPpm: c && Number.isSafeInteger(c.slipPpm) && c.slipPpm >= 0 && c.slipPpm <= 10000
      ? c.slipPpm
      : PRACTICE_SLIP_PPM,
    /* Only `false` is ever stored, the same rule the news sources follow:
       absent means on, so an account written before this existed keeps
       charging funding, which is what it was doing. */
    funding: !(c && c.funding === false),
  };
};
/* What a position was opened under. Stamped at open; the default is the
 * schedule every account had before this was a setting, so an older position
 * is charged exactly what it was already being charged. */
const practicePosFee = (pos) =>
  pos && Number.isSafeInteger(pos.feePpm) && pos.feePpm >= 0 && pos.feePpm <= 10000
    ? pos.feePpm
    : PRACTICE_FEE_PPM;
const practicePosSlip = (pos) =>
  pos && Number.isSafeInteger(pos.slipPpm) && pos.slipPpm >= 0 && pos.slipPpm <= 10000
    ? pos.slipPpm
    : PRACTICE_SLIP_PPM;
const PRACTICE_MMR_PPM = 5000; // 0.50% maintenance margin on notional

/* **When funding settles.** Every perpetual this app can quote settles three
 * times a day on the same grid — measured 2 Sep 2026 against OKX's own
 * `fundingTime` for BTC, ETH and XRP, all three answered 00:00 / 08:00 /
 * 16:00 UTC. Eight hours divides a day evenly and the unix epoch begins on a
 * UTC midnight, so flooring the clock by the window lands exactly on that
 * grid and no calendar arithmetic is needed.
 *
 * **Missed windows are charged, up to a day of them, and no further.** A
 * position left open over a fortnight of closed browser crossed 42 windows at
 * 42 rates nobody recorded; charging today's rate 42 times is not a
 * simulation of that, it is a number made up to look like one. Three is a
 * day: enough that an overnight position pays what an overnight position
 * pays, short enough that the approximation stays an approximation. The
 * screen says so rather than leaving it to be discovered. */
const PRACTICE_FUNDING_MS = 8 * 60 * 60 * 1000;
const MAX_FUNDED_TO = 4102444800000; // 1 Jan 2100, in unix ms
const PRACTICE_FUNDING_MAX_WINDOWS = 3;
/* The last settlement at or before a moment. */
const practiceFundingAt = (nowMs) =>
  Number.isFinite(nowMs) && nowMs > 0
    ? Math.floor(nowMs / PRACTICE_FUNDING_MS) * PRACTICE_FUNDING_MS
    : 0;
/* How many settlements a position has sat through since it last paid, capped.
 * Zero for a position that has never been seen at a settlement — `fundedTo`
 * is stamped without charging the first time, because a window that closed
 * before this account was ever marked is one nobody watched. */
const practiceFundingWindows = (fundedTo, nowMs) => {
  const at = practiceFundingAt(nowMs);
  if (!fundedTo || !at || at <= fundedTo) return 0;
  return Math.min(
    PRACTICE_FUNDING_MAX_WINDOWS,
    Math.floor((at - fundedTo) / PRACTICE_FUNDING_MS),
  );
};

/* **Maintenance margin has to fall as leverage rises, or the top of the
 * ladder is unusable.** The distance from entry to liquidation is roughly
 * `1/leverage − mmr`: at 10x that is 10% − 0.5%, comfortable; at 200x it is
 * 0.5% − 0.5% = **zero**, so a 200x position would be liquidated by the
 * adverse fill on the way in. Every venue that offers three-figure leverage
 * therefore tiers its maintenance rate down.
 *
 * The rule here is one line and stated rather than tabulated: the
 * maintenance rate is at most 40% of the initial margin rate, capped at the
 * 0.5% base. So 200x keeps 0.2% and liquidates about 0.25% away; 10x is
 * unchanged at 0.5% and 9.45%. It is a training rule, not a claim about any
 * venue's tier table. */
const practiceMmrPpm = (leverage) =>
  Math.min(PRACTICE_MMR_PPM, Math.max(1, Math.floor((1000000 / leverage) * 0.4)));

/* **THE RISK LADDER — what a venue actually does, and what this did not.**
 *
 * The rule above ties the maintenance rate to the **leverage you picked**, and
 * every venue ties it to the **size you are holding**. The difference is not a
 * detail: it is why a large position is liquidated sooner than a small one at
 * the same leverage, and why 125x exists at all — it exists *up to a size*.
 * A trainer that says "size does not move your liquidation" teaches the
 * opposite of the truth, and this was the one place the model still did.
 *
 * So: brackets by notional, in the shape Binance, OKX and Bybit all publish.
 * **The shape is theirs; the numbers are ours**, because the account here runs
 * from 100 to 100,000 imaginary units and a table built for a venue's real
 * book would never bite inside that range — every order would sit in bracket
 * one and the ladder would be decoration.
 *
 * One rule generates the whole table: **the maintenance rate is half the
 * bracket's own initial margin rate.** At 200x the initial margin is 0.5% and
 * the maintenance is 0.25%, so half of what you put up is the room you have;
 * at 5x it is 20% and 10%. That is a sentence somebody can hold in their head,
 * and it keeps every bracket usable — a maintenance rate at or above the
 * initial one would liquidate a fresh position on the fill that opened it.
 *
 * **`maintE2` is load-bearing, not decoration.** Without it the maintenance
 * requirement would *jump* at a bracket edge: a position whose notional grew
 * by one cent would suddenly need twice the margin, and
 * `practiceLiquidationPrice` — a bisection over "is this liquidated at P?" —
 * would be searching a discontinuous function and could return a price on the
 * wrong side of the jump. Each bracket's amount is the running sum
 * `maint(n) = maint(n-1) + floor(n) × (mmr(n) − mmr(n-1))`, which is exactly
 * what makes `notional × mmr − maint` continuous across every edge. It is
 * derived below rather than typed, so it cannot drift from the rates it is
 * derived from.
 *
 * Notionals are quote money E2. An inverse account is bracketed by the same
 * quote notional — that is what the brackets mean on a coin-margined venue
 * too — and its requirement is converted to coin where it is used. */
const PRACTICE_RISK_TIERS = (() => {
  const rungs = [
    { upTo: 2500000, maxLeverage: 200 },
    { upTo: 10000000, maxLeverage: 100 },
    { upTo: 50000000, maxLeverage: 50 },
    { upTo: 200000000, maxLeverage: 20 },
    { upTo: 1000000000, maxLeverage: 10 },
    { upTo: Infinity, maxLeverage: 5 },
  ];
  let prevMmr = 0;
  let prevFloor = 0;
  let maint = 0;
  return rungs.map((r, i) => {
    /* Half the bracket's own initial margin rate, in ppm. */
    const mmrPpm = Math.round(RATE_SCALE / r.maxLeverage / 2);
    if (i > 0) maint += Math.round((prevFloor * (mmrPpm - prevMmr)) / RATE_SCALE);
    const tier = { tier: i + 1, upTo: r.upTo, maxLeverage: r.maxLeverage, mmrPpm, maintE2: maint };
    prevMmr = mmrPpm;
    prevFloor = r.upTo;
    return tier;
  });
})();

/* The bracket a notional falls in. Never null: the last rung has no ceiling,
   because a position too large for the table is still a position and still has
   to be told what it must keep. */
const practiceTierFor = (notionalE2) => {
  const n = Number.isFinite(notionalE2) ? Math.max(0, notionalE2) : 0;
  for (const t of PRACTICE_RISK_TIERS) {
    if (n <= t.upTo) return t;
  }
  return PRACTICE_RISK_TIERS[PRACTICE_RISK_TIERS.length - 1];
};

/* **The most leverage a given amount of margin may be run at.**
 *
 * Circular at first sight — the bracket depends on the notional and the
 * notional is margin × leverage — and not circular at all once it is read as a
 * question about each bracket in turn: inside bracket t you may use
 * `min(t.maxLeverage, t.upTo / margin)`, and the answer is the best of those.
 * It is what a venue's leverage slider does when it shortens as you size up,
 * and it is why the ticket can refuse to *offer* an illegal pair rather than
 * accepting one and then refusing the order. */
const practiceMaxLeverageForMargin = (marginE2) => {
  if (!(marginE2 > 0)) return PRACTICE_MAX_LEVERAGE;
  let best = PRACTICE_MIN_LEVERAGE;
  for (const t of PRACTICE_RISK_TIERS) {
    const fits = t.upTo === Infinity
      ? t.maxLeverage
      : Math.min(t.maxLeverage, Math.floor(t.upTo / marginE2));
    if (fits > best) best = fits;
  }
  return Math.max(PRACTICE_MIN_LEVERAGE, Math.min(PRACTICE_MAX_LEVERAGE, best));
};

/* What a practice account starts with. It is an imaginary number and any
 * amount inside the bounds is allowed, because the size only changes what the
 * exercise feels like — a 10x position on 1,000 is legible at a glance, the
 * same percentage on 100,000 looks like a headline. The bounds exist so the
 * arithmetic contract's overflow analysis still holds and so a hand-edited
 * file cannot declare itself arbitrarily rich. */
const PRACTICE_START_BALANCE_E2 = 1000000; // 10,000.00
const PRACTICE_MIN_BALANCE_E2 = 10000; // 100.00
/* 100,000.00, not a million, and the reason is arithmetic rather than taste:
 * the whole account at 200x is the largest notional this model can be asked
 * for, and it has to stay inside the product bound in `practice-math.js`
 * with room to spare (it does — 45x). A ceiling that refuses at its own top
 * setting is a control that cannot do what it offers. */
const PRACTICE_MAX_BALANCE_E2 = 10000000; // 100,000.00
const practiceBalanceOk = (v) =>
  Number.isSafeInteger(v) && v >= PRACTICE_MIN_BALANCE_E2 && v <= PRACTICE_MAX_BALANCE_E2;
const practiceCollateralOk = (v) =>
  Number.isSafeInteger(v) &&
  v >= PRACTICE_MIN_COLLATERAL_E8 &&
  v <= PRACTICE_MAX_COLLATERAL_E8;

/* ---- adding funds to a running account -------------------------------- */

/* **Every other account control starts a fresh account; this one is the
 * exception, and that is the whole point of it.** Balance, settlement,
 * collateral and every plan limit describe what the open contracts were
 * sized against, so changing one mid-run would re-scale a position after the
 * fact — which is why `resetPractice` refuses while anything is live. A
 * deposit does not re-scale anything: it adds money the account did not have,
 * on top of everything already recorded. So it is allowed **while a contract
 * is running**, which is the moment anyone actually wants it — a position
 * approaching its liquidation level and nothing free to put behind it.
 *
 * It is not, however, a way out of the loss cap. `plan.sessionLossPct` ends
 * the account outright, and an ended account that can be topped up and
 * carried on with has no cap at all, only a pause. `practiceDeposit` refuses
 * an ended account and says so.
 *
 * **The ceiling is arithmetic, not taste.** `PRACTICE_MAX_BALANCE_E2` is
 * 100,000.00 because the whole account at 200x is the largest notional this
 * model can be asked for and it has to stay inside `MAX_MONEY_E2` (1e10)
 * with room to spare. Deposits spend that room, so the *funded* account has
 * its own ceiling: 250,000.00 at 200x is 5e9, exactly half the bound, which
 * is the same "room to spare" rule applied to the number that can now grow.
 * The coin-settled ceiling is ten times the largest startable wallet, well
 * inside `PRACTICE_MAX_COIN_E8`.
 *
 * The floor is one Practice Unit rather than the account's own minimum: a
 * minimum *account* is a statement about how small an account may be, and a
 * minimum *top-up* is a different question with a different answer. */
const PRACTICE_MAX_ACCOUNT_E2 = 25000000; // 250,000.00
const PRACTICE_MAX_WALLET_E8 = PRACTICE_MAX_COLLATERAL_E8 * 10; // 10,000.00000000
const PRACTICE_MIN_DEPOSIT_E2 = MONEY_SCALE; // 1.00
const PRACTICE_MIN_DEPOSIT_E8 = PRACTICE_MIN_COLLATERAL_E8; // 0.01000000
/* Three round amounts only **select** a deposit now; the confirmation button
 * is the one door that starts the wait. They used to start it themselves, so
 * a chip that looked like a choice was also a money action. */
const PRACTICE_DEPOSIT_PRESETS = [100000, 500000, 2500000]; // 1,000 · 5,000 · 25,000
const PRACTICE_DEPOSIT_PRESETS_E8 = [10000000, 100000000, 1000000000]; // 0.1 · 1 · 10
/* **How long the money takes to land, and why it takes any time at all.**
 *
 * A real deposit is not instant and this one should not pretend to be: the
 * account here is imaginary, and a number that jumps the moment you press a
 * button teaches the one habit this whole section exists to avoid — that
 * more funds are always a click away. Four seconds is long enough to be a
 * wait you notice and short enough that nobody goes to another tab.
 *
 * It lives in the model rather than beside the bar because two files need
 * the same number: `alerts.js` runs the timer and `styles-practice.js` runs
 * the animation, and a bar that finishes before or after the money lands is
 * the one bug this constant exists to make impossible. */
const PRACTICE_DEPOSIT_MS = 4000;

/* **The shortcuts on the ticket's stop and take-profit, as percentages from
 * the entry.** Not a rounder-looking ladder: these are the distances people
 * actually use, and the two lists are deliberately different lengths on
 * different scales — a stop is chosen close to the entry and a take-profit
 * far from it, so offering the same four numbers for both would make one of
 * the two rows useless. They set a *price* into the field rather than being
 * stored, so there is no second value to drift from what is typed. */
const PRACTICE_STOP_PCTS = [1, 2, 5, 10];
const PRACTICE_TAKE_PCTS = [2, 5, 10, 25];
/* **Is an inverse position of this size, at this price, past what the
 * arithmetic can carry?**
 *
 * The bound itself must not overflow while checking for overflow — and it did:
 * written as `practiceCoinForMoney(qty, priceE4) > PRACTICE_MAX_COIN_E8`, the
 * exact conversion threw on precisely the values the check exists to refuse,
 * so `practiceIncrease` and `practiceReduce` raised out of a render instead of
 * returning `notional`. Found by `scripts/audit-futures.js` typing an entry of
 * 0.001 against a held ETH contract.
 *
 * A bound does not need exactness, it needs to be **conservative**: ordinary
 * floating point is right here, and anything it rounds is refused rather than
 * admitted. */
const practiceInverseTooBig = (qtyE2, priceE4) =>
  !(priceE4 > 0) || (qtyE2 * COIN_PRICE_DIVISOR) / priceE4 > PRACTICE_MAX_COIN_E8;

/* **The other direction of the same bound.** `practiceInverseTooBig` protects
 * money → coin; this protects coin → money, which is the conversion the
 * ticket's typed coin size goes through. `PRACTICE_MAX_COIN_E8` bounds the
 * coin on its own and `MAX_MONEY_E2` bounds the money on its own, and neither
 * bounds the **product**: 10,000 BTC typed against an entry price of
 * 999,999,999 is 1e17, past what a safe integer holds, and
 * `practiceMoneyForCoin` threw from inside a render. Reported as *"practice-
 * math: non-integer operand"* with nothing but React frames under it, and
 * found by `audit-futures.js 1 quote`.
 *
 * Returns the largest coin amount this price can be converted at. Divides
 * first — `MAX_MONEY_E2 * COIN_PRICE_DIVISOR` is 1e20 and loses precision as a
 * double — and the `min` against the coin's own ceiling is what makes flooring
 * a float safe here. A bound, like every other one in this file, is allowed to
 * be conservative and is not allowed to be optimistic. */
const practiceCoinCeiling = (priceE4) => {
  if (!(priceE4 > 0)) return 0;
  const cap = Math.floor((MAX_MONEY_E2 / priceE4) * COIN_PRICE_DIVISOR);
  return Math.max(0, Math.min(PRACTICE_MAX_COIN_E8, cap));
};

/* **The same bound, for an account settled in the quote currency.** A
 * quantity can sit inside `MAX_QTY_E3` and still be worth more at this price
 * than `MAX_MONEY_E2` holds — and `practiceNotional` throws rather than
 * saturating, from inside a render. Found by `audit-futures.js 7`: type
 * 999,999,999 into a close field, then switch that field to money.
 *
 * It is `practiceQtyForNotional` of the money ceiling and deliberately
 * nothing new — that function is already the exact inverse of the conversion
 * being protected, so the bound cannot drift away from what it guards. */
const practiceQtyCeiling = (priceE4) =>
  practiceQtyForNotional(MAX_MONEY_E2, priceE4);

/* **The third direction, and the one that bites at cheap coins.** Money → coin
 * divides by the price, so the smaller the price the larger the result: at the
 * account ceiling a coin priced under about $0.0028 converts to more than
 * `PRACTICE_MAX_COIN_E8` and `practiceCoinForMoney` throws — from inside a
 * render, on the deposit field, by choosing a sub-cent coin as the unit.
 * Measured: $0.0027 throws, $0.0028 returns 8.9e15, which is already within a
 * rounding error of the safe-integer edge.
 *
 * Returns the largest money this price can be converted at. The division is
 * done first for the reason `practiceCoinCeiling` gives, and the `min` against
 * the money's own ceiling is what keeps the product away from the edge. */
const practiceMoneyCeiling = (priceE4) => {
  if (!(priceE4 > 0)) return 0;
  const cap = Math.floor((PRACTICE_MAX_COIN_E8 / COIN_PRICE_DIVISOR) * priceE4);
  return Math.max(0, Math.min(MAX_MONEY_E2, cap));
};

const practiceDepositOk = (s, v) =>
  practiceIsCoinSettled(s)
    ? Number.isSafeInteger(v) && v >= PRACTICE_MIN_DEPOSIT_E8 && v <= PRACTICE_MAX_WALLET_E8
    : Number.isSafeInteger(v) && v >= PRACTICE_MIN_DEPOSIT_E2 && v <= PRACTICE_MAX_ACCOUNT_E2;
/* **Any whole leverage from 1x to 200x**, not a ladder of nine.
 *
 * It was a fixed list, and the slider had to index into it — which meant the
 * control moved in jumps of wildly different size (10x to 20x, then 20x to
 * 50x) and the number under your thumb leapt about. A continuous range is one
 * gesture and the model validates a bound rather than a membership, which is
 * also the simpler rule to state: 1 to 200, whole numbers.
 *
 * The marks on the control are a display detail and live with it. */
const PRACTICE_MIN_LEVERAGE = 1;
const PRACTICE_MAX_LEVERAGE = 200;
const practiceLeverageOk = (v) =>
  Number.isSafeInteger(v) && v >= PRACTICE_MIN_LEVERAGE && v <= PRACTICE_MAX_LEVERAGE;
/* **A scale, not a preset list.**
 *
 * The eleven venue-style notches put six marks inside the first eighth of a
 * 515px track. Measured in the panel, the first three printed values occupied
 * only 118px while the last two had 247px between them — technically true and
 * visually shaped like an accident. Exact values have a typed field now, so
 * the rail only needs to explain its linear range. Five evenly spaced major
 * marks do that without pretending the crowded low end is five separate
 * controls. Every whole number remains reachable from both field and rail. */
const PRACTICE_LEVERAGE_MARKS = [1, 50, 100, 150, 200];

/* The account may set a lower ceiling than the model's 200x. The rail then
 * has to end at that ceiling too — showing 200x and refusing it afterwards
 * makes the account limit a trap, not a limit. Five divisions keep the same
 * calm rhythm at 10x, 50x and 200x; rounding is only for the printed whole
 * leverage and the ends are pinned exactly. */
const practiceLeverageMarks = (maximum) => {
  const top = Math.max(
    PRACTICE_MIN_LEVERAGE,
    Math.min(PRACTICE_MAX_LEVERAGE, Math.floor(Number(maximum) || PRACTICE_MAX_LEVERAGE)),
  );
  if (top === PRACTICE_MAX_LEVERAGE) return PRACTICE_LEVERAGE_MARKS;
  const marks = [];
  for (let i = 0; i <= 4; i += 1) {
    const raw = PRACTICE_MIN_LEVERAGE + ((top - PRACTICE_MIN_LEVERAGE) * i) / 4;
    /* **On the same fives the rail steps in.** Evenly dividing the range gave
       1 / 26 / 51 / 76 / 100 at a 100x ceiling — labelled rungs the step
       itself can never land on, so the mark pull was the only way to reach
       them and 52x snapped to 51x. Rounding the interior marks to fives puts
       the labels back on values the control actually produces. The two ends
       are the real limits and are never moved. */
    /* …but only where fives still give five distinct marks. At a 10x ceiling
       the interior raws are 3.25 / 5.5 / 7.75 and all three round into 5 or
       10, so the rail loses two of its five rungs. The quarter of the range
       has to be worth at least one five for the rounding to be free, which is
       a ceiling of 20x and up. */
    const onFives = top >= 20;
    const value = i === 0 || i === 4 || !onFives
      ? Math.round(raw)
      : Math.max(1, Math.round(raw / 5) * 5);
    if (marks.indexOf(value) === -1) marks.push(value);
  }
  return marks;
};

/* How close counts as arrived. Proportional and capped, so the major marks
 * are easy to land without swallowing the exact values between them. */
/* **The rail's own step: 1–5 one at a time, then fives.**
 *
 * Every whole number to 200 is 200 stops on a control about two inches wide,
 * which is why the field exists beside it — but it also means the *drag* can
 * only ever land somewhere arbitrary. Nobody opens a contract at 37x on
 * purpose; the leverages people actually use are 2, 3, 5, 10, 20, 25, 50, 100.
 * Below 5 the difference between 2x and 3x is the whole decision, so those
 * stay one apart; above it, fives.
 *
 * **The typed field is untouched by this** — `practiceLeverageOk` still
 * accepts every whole number from 1 to 200, so 37x remains reachable by
 * typing it. The rail is a quick way to a usual answer, not the range. */
const practiceLeverageStep = (v) => {
  if (!(v > PRACTICE_MIN_LEVERAGE)) return PRACTICE_MIN_LEVERAGE;
  if (v <= 5) return Math.round(v);
  return Math.round(v / 5) * 5;
};

const practiceLeverageSnap = (v, maximum) => {
  const stepped = Math.min(maximum, practiceLeverageStep(v));
  /* Below five the marks stay out of it. The mark at 1x pulls anything within
     one of itself, which swallowed 2x — and 2x against 3x is the whole
     decision at that end of the rail, so the step's own answer stands. */
  if (stepped <= 5) return stepped;
  let best = stepped;
  let bestGap = Infinity;
  /* The named marks still pull harder than the plain step, so the labelled
     rungs are reachable exactly rather than approached to within a five. */
  for (const m of practiceLeverageMarks(maximum)) {
    const gap = Math.abs(v - m);
    const pull = Math.min(4, Math.max(1, Math.floor(m / 20)));
    if (gap <= pull && gap < bestGap) {
      best = m;
      bestGap = gap;
    }
  }
  return best;
};
const PRACTICE_LOT_E3 = 1; // 0.001 LAB — the smallest tradable step

/* Session guards. Defaults and the choices offered; the ceiling is enforced
 * by the model, so a hand-edited plan cannot buy itself more rope than the
 * product allows. */
const PRACTICE_PLAN_LIMITS = {
  /* The offered ceiling is the model's own. A second, lower default only
     refused the leverage the ticket was already showing — a control that
     cannot do what it offers. The hard ceiling is what actually bounds it. */
  /* 100 sits between 50 and 200 because it is where the ladder actually
     bends: 10x and 50x are cautious accounts and 200x is the model's own
     ceiling, so without it the only step up from "half the maximum" was the
     maximum. It is also the ceiling most venues stop at. */
  maxLeverage: { def: 200, choices: [10, 50, 100, 200], ceiling: 200 },
  /* **Venue-style size tiers are the default, and may be stood down.**
   *
   * Every venue lowers the leverage ceiling as a contract grows. This model
   * keeps that honest default, but its deliberately compressed ladder bites
   * inside a 100–100,000-unit practice account: at 10,000 units, 200x is
   * limited to 25,000 of notional and leaves almost the whole account idle.
   * `0` is an explicit unrestricted exercise, not a claim about a venue. The
   * position stamps the choice because its maintenance rule must match the
   * leverage rule it was admitted under. */
  sizeTiers: { def: 1, choices: [1, 0], ceiling: 1 },
  /* **Pause after N losses in a row** — the one rule the Robbins Cup
     process names by number ("stop after two losses in a row"), because the
     third is the one taken angry. Off by default like every session rule; 0
     is off. Counted from the record, so it survives a reload. */
  streakPause: { def: 0, choices: [0, 2, 3], ceiling: 3 },
  /* **Off by default since 18 Sep 2026**, asked for as *"bütün parayı
     türevliye sokabileyim"*. A venue's isolated contract can take all the
     free balance there is; a wall at a fifth of the account is a training
     rule, the same inheritance the session quota and the loss stop were.
     Kept as a choice, 0 is off, and `practiceMarginWall` is the one place
     that reads it — so no caller can mistake off for the tightest cap. */
  marginSharePct: { def: 0, choices: [0, 10, 20, 30], ceiling: 30 },
  lossPerTradePct: { def: 1, choices: [0.5, 1, 2, 5], ceiling: 5 },
  /* **Off by default, because no venue has this rule.**
   *
   * Reported as: *a real exchange lets my account open a derivatives position,
   * so yours should.* It is right, and the reason this was ever here is
   * historical rather than considered — see the note where the contract quota
   * used to be, just below. A
   * session that stops you after losing 5% is a prop-firm drill, not a market:
   * the things a venue actually stops you with are margin, the leverage tier
   * and liquidation, and all three are still here and still bite.
   *
   * 0 is off and is the default; the rule is kept as a choice for anybody who
   * wants the discipline, which is what it was built for. */
  sessionLossPct: { def: 0, choices: [0, 2, 5, 10], ceiling: 10 },
  /* **There is no cap on how many contracts a session may open, and there
     must not be one.** It lived here from the panel's first life as a training
     drill, where being stopped by a quota you had set was the exercise; on a
     market screen it is a sentence no exchange has ever shown anybody, and it
     refused people who had most of their money still in the account. Removed
     on 16 Sep 2026 after it was reported three times.

     `opened` and `openedFrom` stay, because the *count* is a fact worth
     printing — how many this session has opened — and a fact is not a rule.
     What is gone is anything that reads them and refuses. The things that
     still stop an order are the ones a venue has: free balance, the margin
     wall, the leverage ceiling, the risk bracket, and liquidation. */
  durationMin: { def: 15, choices: [10, 15, 30], ceiling: 30 },
};

/* **0 means no cap**, for the two plan rules that can be turned off. Written
 * once because `Math.min` reads 0 as the *tightest* possible limit, which is
 * the exact opposite, and three call sites would each have got it right or
 * wrong on their own. */
const practicePlanCap = (v) => (v > 0 ? v : Infinity);

/* **The per-contract margin wall**, as money: a share of `base`, or Infinity
 * while the rule is off. Every check goes through here, because the rule's
 * off value is 0 and every one of them multiplied by it — a wall at 0 refuses
 * everything, and in the sanitizer it would have clamped every stored
 * contract's margin to nothing. */
const practiceMarginWall = (plan, base) => {
  const pct = plan ? practicePlanCap(plan.marginSharePct) : Infinity;
  return pct === Infinity ? Infinity : Math.floor((base * pct) / 100);
};

const practiceDefaultPlan = () => ({
  maxLeverage: PRACTICE_PLAN_LIMITS.maxLeverage.def,
  sizeTiers: PRACTICE_PLAN_LIMITS.sizeTiers.def,
  marginSharePct: PRACTICE_PLAN_LIMITS.marginSharePct.def,
  lossPerTradePct: PRACTICE_PLAN_LIMITS.lossPerTradePct.def,
  sessionLossPct: PRACTICE_PLAN_LIMITS.sessionLossPct.def,
  durationMin: PRACTICE_PLAN_LIMITS.durationMin.def,
  locked: false,
});

/* A plan may be tightened after `Begin training` and never loosened. The rule
 * is here rather than in the UI because a disabled control is not a limit —
 * the sanitizer and the transition both have to refuse. */
const practiceTightenPlan = (plan, next) => {
  if (!plan || !next) return { error: "plan" };
  /* The rules that can be off are compared as caps, not as numbers: off is the
     loosest setting there is, and `Math.min` would have made it the tightest
     and then silently written 0 over a real limit. */
  const capped = (a, b) => {
    const v = Math.min(practicePlanCap(a), practicePlanCap(b));
    return v === Infinity ? 0 : v;
  };
  const tighter = {
    maxLeverage: Math.min(plan.maxLeverage, next.maxLeverage),
    sizeTiers: Math.max(plan.sizeTiers, next.sizeTiers),
    marginSharePct: capped(plan.marginSharePct, next.marginSharePct),
    lossPerTradePct: Math.min(plan.lossPerTradePct, next.lossPerTradePct),
    sessionLossPct: capped(plan.sessionLossPct, next.sessionLossPct),
    durationMin: Math.min(plan.durationMin, next.durationMin),
    locked: true,
  };
  const loosened = ["maxLeverage", "lossPerTradePct", "durationMin"]
    .some((k) => next[k] > plan[k])
    || next.sizeTiers < plan.sizeTiers
    || ["sessionLossPct", "marginSharePct"]
      .some((k) => practicePlanCap(next[k]) > practicePlanCap(plan[k]));
  return loosened ? { error: "loosen", state: tighter } : { state: tighter };
};

const practiceEmptySession = (startBalance, settlement, startCollateral) => ({
  schemaVersion: PRACTICE_SCHEMA_VERSION,
  modelVersion: PRACTICE_MODEL_VERSION,
  step: 0,
  /* Only a size the product offers. An arbitrary number from a hand-edited
     file would set every plan cap with it, since the caps are shares of it. */
  startBalance: practiceBalanceOk(startBalance) ? startBalance : PRACTICE_START_BALANCE_E2,
  balance: practiceBalanceOk(startBalance) ? startBalance : PRACTICE_START_BALANCE_E2,
  margin: 0,
  /* Quote-settled is the established linear account. Coin-settled is an
     inverse account with one independent wallet per contract coin; a BTC
     debit can never be reconciled against an ETH credit. */
  settlement:
    settlement === PRACTICE_SETTLEMENT_COIN
      ? PRACTICE_SETTLEMENT_COIN
      : PRACTICE_SETTLEMENT_QUOTE,
  startCollateral: practiceCollateralOk(startCollateral)
    ? startCollateral
    : PRACTICE_START_COLLATERAL_E8,
  wallets: {},
  /* Money added after the account was opened. Deliberately **not** part of
     `startBalance`: the reconciliation invariant is `balance = startBalance +
     Σ cashDelta`, a deposit carries its money as a `cashDelta` like every
     other event, and folding it into `startBalance` as well would count it
     twice. What this is for is the plan caps, which are shares of the
     account's *size* rather than of what it opened with — see
     `practiceAccountSize`. It rides alongside `cashDelta` exactly as `fees`,
     `funding` and `realised` already do. */
  deposited: 0,
  /* **Where this session's loss is counted from.**
   *
   * `plan.sessionLossPct` ends the account, and ending it has to mean
   * something — but the only way past it was `resetPractice`, which throws
   * away the balance, the lots and the whole record. So the cap was a wall
   * with a demolition charge beside it and nothing else.
   *
   * A deposit into an ended account starts a **new session** instead: the
   * ledger, the balance and the record all survive, and the loss that ended
   * the last one is stamped here so the cap is measured from this point on.
   * The cap still did its job — it stopped the run, and carrying on took a
   * deliberate act that is itself recorded as a `deposit` event. What it no
   * longer does is force you to destroy everything to continue. */
  lossFrom: 0,
  /* **Where this session's contract count starts.**
   *
   * `plan.maxPositions` was counted for the life of the account, and that made
   * it the one limit you could meet with nothing wrong: five contracts opened
   * and closed leaves 99% of the money on the table and refuses the sixth
   * (measured — 991,000 of 1,000,000). A rule that stops you when nothing has
   * gone wrong is a quota, not a risk limit, and its only way out was
   * `resetPractice`, which destroys the balance and the record.
   *
   * Both plan caps describe **a session** now, which is the same word and the
   * same escape: `practiceNewSession` stamps this and `lossFrom` and keeps
   * everything else. */
  openedFrom: 0,
  /* **One position per coin, keyed by symbol.** A single slot meant switching
     coin paused the only position you had, which is neither what a venue does
     nor what anyone expects: you look at ETH, you should be able to open ETH
     without closing BTC. Isolated margin makes this safe — each position
     carries its own margin and its own liquidation, and none of them can
     reach into another. */
  positions: {},
  /* **Resting orders, keyed by their own id.** A limit order is not a position
     and not a plan: it is money *reserved* against a price that has not
     happened yet. It rides the same ledger every other movement does — placing
     one is an event with a `marginDelta`, cancelling is the opposite event, and
     filling releases the reserve and opens a contract — so
     `practiceReconcile` keeps explaining the balance without being taught
     anything new. */
  orders: {},
  nextOrderId: 1,
  plan: practiceDefaultPlan(),
  opened: 0,
  realised: 0,
  fees: 0,
  funding: 0,
  nextId: 1,
  nextPosId: 1,
  ledger: [],
  summary: null,
  ended: false,
});

const practiceIsCoinSettled = (s) =>
  Boolean(s && s.settlement === PRACTICE_SETTLEMENT_COIN);
const practiceWallet = (s, coin) => {
  if (!practiceIsCoinSettled(s) || !coin) return null;
  return (s.wallets && s.wallets[coin]) || {
    startBalance: s.startCollateral,
    balance: s.startCollateral,
    margin: 0,
    realised: 0,
    fees: 0,
    funding: 0,
    deposited: 0,
    lossFrom: 0,
  };
};
const practiceFreeBalance = (s, coin) => {
  const wallet = practiceWallet(s, coin);
  return wallet ? wallet.balance : s ? s.balance : 0;
};

/* ---- derived values -------------------------------------------------- */

const practiceNotionalAt = (pos, priceE4) =>
  pos
    ? pos.settlement === PRACTICE_SETTLEMENT_COIN
      ? pos.qty
      : practiceNotional(priceE4, pos.qty, ROUND_DOWN)
    : 0;

/* **A position is addressed by its own id, not by its coin.**
 *
 * `positions` was keyed by the coin, which made "one contract per coin" a
 * property of the *data structure* rather than a rule anybody chose — and
 * every attempt to open a second one on a coin you already held was refused by
 * the shape of the store. Reported as "I want twenty longs and twenty shorts
 * at once, on the same coin or on different ones", which is what a venue in
 * hedge mode does and what this could never have done.
 *
 * So the key is an id (`s.nextPosId` counting up) and the coin rides on the
 * position, where it always was. `practiceList` returns ids; every loop over
 * it that needs the coin reads `pos.coin`, and that is the whole of the
 * change at the call sites.
 */
const practiceList = (s) => (s && s.positions ? Object.keys(s.positions) : []);
const practiceAt = (s, id) => (s && s.positions ? s.positions[id] || null : null);
const practiceCount = (s) => practiceList(s).length;
/* Every position on one coin, oldest first — the list a screen showing a
 * single market wants, and the aggregate the chart draws from. */
const practiceForCoin = (s, coin) =>
  practiceList(s).filter((id) => s.positions[id] && s.positions[id].coin === coin);
/* Whether this coin is being marked at all: an inverse wallet exists per coin,
 * and several positions can share one. */
const practiceCoinsHeld = (s) => {
  const out = [];
  for (const id of practiceList(s)) {
    const coin = s.positions[id] && s.positions[id].coin;
    if (coin && !out.includes(coin)) out.push(coin);
  }
  return out;
};
/* **Every market this account has something waiting on**, held *or* resting.
 *
 * `practiceCoinsHeld` answers the positions, and for a long time that was the
 * same question — until orders could rest with no position behind them. Both
 * callers of this had the same bug the day limit orders landed: the marking
 * sweep returned early with nothing held, so a resting order was never tested
 * against a price, and the panel built no mark for its market, so the row
 * could not say how far away it was. */
const practiceCoinsActive = (s) => {
  const coins = new Set(practiceCoinsHeld(s));
  for (const id of Object.keys((s && s.orders) || {})) {
    const o = s.orders[id];
    if (o && o.coin) coins.add(o.coin);
  }
  return [...coins];
};


/* Unrealised P/L rounds down in both directions: a loss further from zero and
 * a gain closer to it are both the conservative answer, so one rule covers
 * the pair. */
const practiceUnrealised = (pos, priceE4) => {
  if (!pos || pos.qty <= 0) return 0;
  if (pos.settlement === PRACTICE_SETTLEMENT_COIN) {
    return practiceInversePnl(pos.qty, pos.entry, priceE4, pos.side);
  }
  const now = practiceNotional(priceE4, pos.qty, ROUND_DOWN);
  const entry = practiceNotional(pos.entry, pos.qty, ROUND_DOWN);
  return pos.side === "short" ? entry - now : now - entry;
};

const practicePositionEquity = (pos, priceE4) =>
  pos ? pos.margin + practiceUnrealised(pos, priceE4) : 0;

/* Total equity across every open position. `marks` is a symbol -> price map;
 * a coin with no price contributes its margin and no unrealised move rather
 * than being dropped, or the total would fall every time one quote is late. */
const practiceEquity = (s, marks, coin) => {
  if (!s) return 0;
  if (practiceIsCoinSettled(s)) {
    const wallet = practiceWallet(s, coin);
    if (!wallet) return 0;
    /* One wallet, and now possibly several contracts drawing on it. */
    const mark = marks && marks[coin];
    let held = 0;
    for (const id of practiceForCoin(s, coin)) {
      const pos = s.positions[id];
      held += mark > 0 ? practicePositionEquity(pos, mark) : pos.margin;
    }
    return wallet.balance + held + practiceReserved(s, coin);
  }
  let total = s.balance;
  for (const id of practiceList(s)) {
    const pos = s.positions[id];
    const mark = marks && marks[pos.coin];
    total += mark > 0 ? practicePositionEquity(pos, mark) : pos.margin;
  }
  /* **Reserved is not spent.** Placing a limit order takes its margin out of
     the balance, exactly as opening does — so without this line the money
     would disappear from the account for as long as the order rested, and
     cancelling would look like a windfall. */
  total += practiceReserved(s);
  return total;
};

/* What resting orders are holding, on this account or in this coin's wallet. */
const practiceReserved = (s, coin) => {
  let held = 0;
  for (const id of Object.keys((s && s.orders) || {})) {
    const o = s.orders[id];
    if (!o) continue;
    if (coin && o.coin !== coin) continue;
    held += o.margin || 0;
  }
  return held;
};

/* The liquidation condition, written once. Everything that needs to know
 * where a position ends — the ticket preview, the chart level, the per-step
 * check — goes through one of these two, and they are the same expression. */
const practiceMaintenance = (pos, priceE4) => {
  const notional = practiceNotionalAt(pos, priceE4);
  /* **Read off the notional this position has right now**, not off the
     leverage it was opened at: a position whose price has run in its favour is
     a larger position and a venue asks it to keep more. The bracket is looked
     up rather than stamped for exactly that reason — it is the one part of a
     contract's schedule that is *meant* to move, and it is the reason this
     function still only ever sees a position and a price. */
  const tier = practiceTierFor(notional);
  /* **Standing the leverage ladder down also stands its maintenance ladder
   * down.** Skipping only the size-based leverage refusal admitted a 200x
   * contract into a tier whose 2.5% maintenance was five times its 0.5%
   * initial margin — it was liquidated at the fill that opened it. Flat mode
   * keeps the table's one memorable rule instead: maintenance is half this
   * contract's own initial-margin rate. The choice is stamped on the
   * position, so changing a later account cannot rewrite an open contract. */
  const flatMmr = pos && pos.sizeTiers === false
    ? Math.round(RATE_SCALE / Math.max(PRACTICE_MIN_LEVERAGE, pos.leverage) / 2)
    : null;
  const need = flatMmr == null
    ? Math.max(0, practiceRate(notional, tier.mmrPpm, ROUND_UP) - tier.maintE2)
    : practiceRate(notional, flatMmr, ROUND_UP);
  if (pos && pos.settlement === PRACTICE_SETTLEMENT_COIN) {
    const value = practiceCoinForMoney(notional, priceE4, ROUND_UP);
    /* The requirement is a quote figure and this account settles in coin, so
       it is converted at the same price everything else on this line uses. */
    return practiceCoinForMoney(need, priceE4, ROUND_UP)
      + practiceRate(value, practicePosFee(pos), ROUND_UP);
  }
  return need + practiceRate(notional, practicePosFee(pos), ROUND_UP);
};

const practiceIsLiquidated = (pos, priceE4) =>
  Boolean(pos) && practicePositionEquity(pos, priceE4) <= practiceMaintenance(pos, priceE4);

/* How far the position is from the rule that ends it: equity over what it
 * must keep. At 1 it is being liquidated. Shown rather than only a P/L
 * because P/L says how the trade is going and this says how close it is to
 * being over. */
const practiceMarginRatio = (pos, priceE4) => {
  if (!pos || !(priceE4 > 0)) return null;
  const need = practiceMaintenance(pos, priceE4);
  if (!(need > 0)) return null;
  return practicePositionEquity(pos, priceE4) / need;
};

/* **When a position is close enough to being ended that it has to say so.**
 *
 * The ratio was computed, printed as a bare `ratio 90.83`, and left there —
 * a number that means "how close am I to losing this" and that nobody can
 * read without knowing the maintenance rate. Nothing anywhere raised its
 * voice, so the first sign a position was in trouble was the toast saying it
 * had gone.
 *
 * **The ratio is the right measure precisely because it is leverage-aware.**
 * A fixed price distance is meaningless across leverages — 5% away is
 * comfortable at 2x and already dead at 100x — while the ratio starts at
 * about 90 on a fresh 2x position and about 2.2 on a fresh 100x one, because
 * that is how near to the edge those two actually are. Warning at 1.5 and
 * 1.15 therefore fires when a position has moved *toward* its liquidation,
 * rather than on the day it was opened, at every leverage, with no table of
 * thresholds to keep.
 *
 * Null rather than "safe" when there is no mark: a position outside its own
 * currency is not being priced, and a reassuring word about one is a claim
 * nobody can make. */
const PRACTICE_WARN_RATIO = 1.5;
const PRACTICE_DANGER_RATIO = 1.15;
const practiceMarginBand = (pos, priceE4) => {
  const ratio = practiceMarginRatio(pos, priceE4);
  if (ratio === null) return null;
  if (ratio <= PRACTICE_DANGER_RATIO) return "danger";
  if (ratio <= PRACTICE_WARN_RATIO) return "warn";
  return "safe";
};

/* The displayed level, found by bisection on the same predicate rather than
 * by rearranging it into a closed form.
 *
 * A closed form has to invert the rounding, and the prototype proved what
 * that costs: its solved price and its live check were written twice from one
 * equation and a sign error put a 10x long's liquidation at -90.5. Searching
 * the predicate cannot disagree with the predicate. Thirty-two halvings over
 * the price range settle to the E4 unit, and the result is nudged to the
 * first price that actually satisfies the check, so the number on screen is
 * the price at which the position really ends.
 */
/* **The search probes prices, and a probe must not throw.**
 *
 * The bound below keeps every ordinary position inside the arithmetic, but a
 * stored position is not always ordinary — a hand-edited file, or a shape from
 * an older model, can hand this something whose loss at a probe price cannot
 * be represented. That is not an error to propagate: a loss too large to hold
 * in a safe integer is unambiguously **past** the liquidation point, so the
 * only honest answer at that price is "yes". Scoped to the search on purpose;
 * every other caller of `practiceIsLiquidated` still hears the throw. */
const liquidatedAt = (pos, priceE4) => {
  try {
    return practiceIsLiquidated(pos, priceE4);
  } catch {
    return true;
  }
};

const practiceLiquidationPrice = (pos) => {
  if (!pos || pos.qty <= 0) return null;
  const long = pos.side !== "short";
  if (liquidatedAt(pos, pos.entry)) return pos.entry;
  let safe = pos.entry;
  /* **The far end of the search is derived from the entry, not from the price
     ceiling.** It used to be `MAX_PRICE_E4`, which was fine while that
     ceiling was 10,000 and stopped being fine the moment it was raised to a
     billion to admit real Bitcoin prices: the first probe multiplied a
     billion by the held quantity and `mulDiv` threw — correctly — out of the
     middle of a function whose whole job is to return a number or null.
     A short at leverage L ends near `entry × (1 + 1/L)`, worst case a little
     under twice the entry at 1x, so four times the entry is past every
     liquidation there is and stays in proportion to the position being asked
     about. Clamped to the ceiling so the bound itself is always legal. */
  /* **The long's far end is proportional too on an inverse contract, and it
     has to be.** The comment above fixed exactly this defect at the other end
     of the search and left this one: `MIN_PRICE_E4` is right for a linear
     long, which really is only liquidated as the price approaches zero, and
     wrong for an inverse one. An inverse P/L is
     `qty × DIVISOR × (mark − entry) / (entry × mark)`, so as the probe price
     approaches zero the denominator collapses and the result runs past
     `Number.MAX_SAFE_INTEGER` — `practiceInversePnl` then throws, correctly,
     out of the middle of a function whose whole job is to return a number or
     null. Measured: any inverse long of 10,000.00 or more threw, at every
     leverage, and the panel's error boundary swallowed the whole Futures
     screen. An inverse long is liquidated where the coin-denominated loss
     eats its margin — around `entry / 2` at 1x, and *closer* to the entry as
     leverage rises — so an eighth of the entry is past every one of them and
     stays in proportion to the position being asked about. */
  let doomed = long
    ? pos.settlement === PRACTICE_SETTLEMENT_COIN
      ? Math.max(MIN_PRICE_E4, Math.floor(pos.entry / 8))
      : MIN_PRICE_E4
    : Math.min(MAX_PRICE_E4, Math.max(pos.entry + 1, pos.entry * 4));
  if (!liquidatedAt(pos, doomed)) return null;
  for (let i = 0; i < 40 && Math.abs(safe - doomed) > 1; i += 1) {
    const mid = Math.floor((safe + doomed) / 2);
    if (liquidatedAt(pos, mid)) doomed = mid;
    else safe = mid;
  }
  return doomed;
};

/* **THE MARK — what a position is valued and liquidated against.**
 *
 * Every venue liquidates on a *mark* price and not on the last trade, and the
 * reason is the whole of why this exists: on a thin book one bad print takes
 * out positions that nothing was wrong with. Binance marks on
 * `median(index × (1 + funding × time to funding / interval), index + 30s
 * basis average, last traded)` — three inputs, two of which are an index built
 * from other venues and a book we do not have.
 *
 * **So this is a median of the last three ticks, and it says so.** It is the
 * honest version of the same idea on one price source: a median throws away a
 * single outlier and keeps the level, which is exactly the job. It is not an
 * index, it is not claimed to be one, and the panel's own card says what it is.
 *
 * Fewer than three ticks is not a failure — a fresh account has one — so the
 * median of what there is is returned and the mark converges as the ticks
 * arrive. Zero ticks is `null`, which every caller already handles as "not
 * priced".
 *
 * `PRACTICE_MARK_TICKS` is three because a median needs an odd count to have a
 * middle, and three is the shortest odd window that can reject one spike. Five
 * would reject two and lag twice as far behind a real move, which on a
 * 30-second refresh is a minute and a half of the wrong price. */
const PRACTICE_MARK_TICKS = 3;
const practiceMarkFrom = (ticks) => {
  if (!Array.isArray(ticks)) return null;
  const clean = ticks
    .filter((v) => Number.isSafeInteger(v) && v >= MIN_PRICE_E4 && v <= MAX_PRICE_E4)
    .slice(-PRACTICE_MARK_TICKS)
    .sort((a, b) => a - b);
  if (!clean.length) return null;
  return clean[Math.floor(clean.length / 2)];
};

/* ---- events ----------------------------------------------------------- */

const PRACTICE_MAX_LEDGER = 200;

/* How many coins may be held at once. Not a risk rule — the margin caps are
 * that — but a bound on the state a single account can hold, so a stored
 * session cannot grow without limit. */
/* **How many contracts may run at once.**
 *
 * Twelve, when a coin could hold one — which made it a cap on *coins*. Now
 * that a coin can hold many it is a cap on contracts, and the number that
 * matters is the one somebody actually asked for: twenty longs and twenty
 * shorts. Forty-eight leaves room above that.
 *
 * It is still a real ceiling rather than a token one. Every open position is
 * marked on every tick, drawn, and reconciled from the ledger, and the ledger
 * itself keeps `PRACTICE_MAX_LEDGER` entries — a thousand concurrent contracts
 * would make the record useless long before it made the arithmetic slow. */
const PRACTICE_MAX_POSITIONS = 48;

/* Every event carries what it moved and what produced it. `cashDelta` and
 * `marginDelta` are the only two fields the account is rebuilt from, which is
 * why compaction may fold rows away but must keep their sums. */
const practiceEvent = (s, kind, fields) => ({
  id: s.nextId,
  /* Which contract this happened to. A coin can carry several now, so the
     coin alone no longer identifies one — and everything that reads the
     record back for a single position (its funding, its compaction) matches
     on this. Empty for the events that belong to the account rather than to a
     contract: a deposit, a balance change. */
  pos: "",
  kind,
  step: s.step,
  modelVersion: PRACTICE_MODEL_VERSION,
  cashDelta: 0,
  marginDelta: 0,
  fee: 0,
  funding: 0,
  realised: 0,
  /* Money moved in or out by hand. It is the same figure as this event's
     `cashDelta`, tagged, so the account's *size* can be recovered after
     compaction has folded the row away and forgotten its kind.

     **Signed.** It was positive-only while the only movement was a deposit;
     setting the balance can also take money out, and a withdrawal has to
     shrink the account the same way a deposit grows it, or the plan caps go
     on describing money that is no longer there. */
  deposit: 0,
  ...fields,
});

const practiceAppend = (s, event) => {
  const ledger = [...s.ledger, event];
  if (ledger.length <= PRACTICE_MAX_LEDGER) return { ledger, summary: s.summary, nextId: s.nextId + 1 };
  /* Compaction folds the oldest rows into a signed summary rather than
   * dropping them. The prototype used `slice(-60)` with nothing kept, so a
   * long session's early money simply left the record and the balance could
   * no longer be explained by what was still on screen. */
  const fold = ledger.slice(0, ledger.length - PRACTICE_MAX_LEDGER);
  const add = (a, e) => ({
    cashDelta: (a.cashDelta || 0) + e.cashDelta,
    marginDelta: (a.marginDelta || 0) + e.marginDelta,
    fee: (a.fee || 0) + e.fee,
    funding: (a.funding || 0) + e.funding,
    realised: (a.realised || 0) + e.realised,
    /* Folded like every other signed total. Without this a long session's
       early top-ups would leave the record and take the account's size with
       them, so the plan caps would silently shrink back to what the account
       opened with. */
    deposit: (a.deposit || 0) + (e.deposit || 0),
  });
  let summary;
  if (practiceIsCoinSettled(s)) {
    const base = s.summary || { count: 0, wallets: {} };
    summary = fold.reduce((acc, e) => {
      const coin = e.coin || "";
      return {
        count: acc.count + 1,
        wallets: { ...acc.wallets, [coin]: add(acc.wallets[coin] || {}, e) },
      };
    }, base);
  } else {
    const base = s.summary || { count: 0, cashDelta: 0, marginDelta: 0, fee: 0, funding: 0, realised: 0 };
    summary = fold.reduce((acc, e) => ({ count: acc.count + 1, ...add(acc, e) }), base);
  }
  return { ledger: ledger.slice(-PRACTICE_MAX_LEDGER), summary, nextId: s.nextId + 1 };
};

/* **Removing a row from the record without removing it from the balance.**
 *
 * The ledger is not a list of things that happened; it is *what the balance
 * is recomputed from*. Deleting an event outright would move the money — a
 * closed contract's profit would vanish along with its row, and
 * `practiceReconcile` would stop agreeing with itself, which is the one thing
 * this model is built to guarantee.
 *
 * So a forgotten event is **folded into the summary**, exactly as compaction
 * already folds the oldest rows once the ledger passes its cap. The signed
 * totals it carried are kept, the row is gone, and the balance does not move
 * by a cent. That mechanism existed for a different reason and turns out to
 * be precisely the one this needs, which is why there is no new field here.
 *
 * Only settled contracts can be forgotten. An open position's own events are
 * still live — its margin is on the books — and folding those away would
 * leave a position whose history the record cannot explain. */
const PRACTICE_FORGETTABLE = ["close", "stop", "take", "liquidation"];
const practiceForget = (s, ids) => {
  if (!s || !Array.isArray(s.ledger)) return { error: "none" };
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map(Number));
  /* The *contracts* still running, not the coins: a coin can carry several
     now, so "this coin is still open" would refuse to forget a settled
     contract because a different one on the same market is alive. */
  const held = new Set(Object.keys(s.positions || {}));
  const go = (e) =>
    wanted.has(e.id) && PRACTICE_FORGETTABLE.includes(e.kind) && !held.has(e.pos);
  const fold = s.ledger.filter(go);
  if (!fold.length) return { error: "none" };
  const add = (a, e) => ({
    cashDelta: (a.cashDelta || 0) + e.cashDelta,
    marginDelta: (a.marginDelta || 0) + e.marginDelta,
    fee: (a.fee || 0) + e.fee,
    funding: (a.funding || 0) + e.funding,
    realised: (a.realised || 0) + e.realised,
    /* Folded like every other signed total. Without this a long session's
       early top-ups would leave the record and take the account's size with
       them, so the plan caps would silently shrink back to what the account
       opened with. */
    deposit: (a.deposit || 0) + (e.deposit || 0),
  });
  let summary;
  if (practiceIsCoinSettled(s)) {
    const base = s.summary || { count: 0, wallets: {} };
    summary = fold.reduce((acc, e) => {
      const coin = e.coin || "";
      return {
        count: acc.count + 1,
        wallets: { ...acc.wallets, [coin]: add(acc.wallets[coin] || {}, e) },
      };
    }, base);
  } else {
    const base = s.summary || { count: 0, cashDelta: 0, marginDelta: 0, fee: 0, funding: 0, realised: 0 };
    summary = fold.reduce((acc, e) => ({ count: acc.count + 1, ...add(acc, e) }), base);
  }
  return { state: { ...s, ledger: s.ledger.filter((e) => !go(e)), summary } };
};

/* The reconciliation the ledger exists for: the balance and the margin must
 * be exactly what the recorded events say they are, whether or not the early
 * ones have been folded away. */
const practiceReconcile = (s) => {
  if (practiceIsCoinSettled(s)) {
    const totals = {};
    const seed = s.summary && s.summary.wallets ? s.summary.wallets : {};
    for (const coin of Object.keys(seed)) totals[coin] = { ...seed[coin] };
    for (const e of s.ledger) {
      const coin = e.coin || "";
      const t = totals[coin] || { cashDelta: 0, marginDelta: 0 };
      totals[coin] = {
        cashDelta: (t.cashDelta || 0) + e.cashDelta,
        marginDelta: (t.marginDelta || 0) + e.marginDelta,
      };
    }
    const wallets = {};
    let ok = true;
    const coins = new Set([...Object.keys(s.wallets || {}), ...Object.keys(totals)]);
    for (const coin of coins) {
      const wallet = practiceWallet(s, coin);
      const t = totals[coin] || { cashDelta: 0, marginDelta: 0 };
      const balance = wallet.startBalance + (t.cashDelta || 0);
      const margin = t.marginDelta || 0;
      wallets[coin] = { balance, margin, ok: wallet.balance === balance && wallet.margin === margin };
      if (!wallets[coin].ok) ok = false;
    }
    return { wallets, ok };
  }
  const base = s.summary || { cashDelta: 0, marginDelta: 0 };
  let cash = base.cashDelta;
  let margin = base.marginDelta;
  for (const e of s.ledger) {
    cash += e.cashDelta;
    margin += e.marginDelta;
  }
  return {
    balance: s.startBalance + cash,
    margin,
    ok: s.balance === s.startBalance + cash && s.margin === margin,
  };
};

/* ---- transitions ------------------------------------------------------ */

const practiceApply = (s, event) => {
  const { ledger, summary, nextId } = practiceAppend(s, event);
  if (practiceIsCoinSettled(s)) {
    const coin = event.coin;
    const wallet = practiceWallet(s, coin);
    const nextWallet = {
      ...wallet,
      balance: wallet.balance + event.cashDelta,
      margin: wallet.margin + event.marginDelta,
      fees: wallet.fees + event.fee,
      funding: wallet.funding + event.funding,
      realised: wallet.realised + event.realised,
      deposited: (wallet.deposited || 0) + (event.deposit || 0),
    };
    return {
      ...s,
      wallets: { ...s.wallets, [coin]: nextWallet },
      ledger,
      summary,
      nextId,
    };
  }
  return {
    ...s,
    balance: s.balance + event.cashDelta,
    margin: s.margin + event.marginDelta,
    fees: s.fees + event.fee,
    funding: s.funding + event.funding,
    realised: s.realised + event.realised,
    deposited: (s.deposited || 0) + (event.deposit || 0),
    ledger,
    summary,
    nextId,
  };
};

/* **The account's value after every recorded event** (26 Sep 2026, *"hesap
 * değeri eğrisi"*).
 *
 * Value here is cash plus committed margin — the wallet, before anything
 * still open is marked — so it moves only when money does: a deposit, a
 * fee, funding, a contract settled. Opening a contract or placing an order
 * moves money from one to the other and leaves the sum where it was, which
 * is right: nothing has been won or lost yet. The last point is the equity
 * now, open contracts marked, and it is the only point that includes them.
 *
 * **There is no clock on the record** — this file has none, and an event
 * carries the step it happened on, not a time — so the x axis is the order
 * of events, and the chart says so rather than drawing dates it does not
 * have. Compaction folds the oldest rows into a summary that keeps their
 * sums, so the first point is where the kept record starts, not always the
 * account's opening. Quote accounts only; the coin-margined kind is no
 * longer offered. */
const practiceValueSeries = (s, marks) => {
  if (!s || practiceIsCoinSettled(s) || !Array.isArray(s.ledger)) return null;
  const base = s.summary || { cashDelta: 0, marginDelta: 0 };
  let v = s.startBalance + (base.cashDelta || 0) + (base.marginDelta || 0);
  const points = [{ v, kind: base.count ? "folded" : "start", id: null, deposit: 0 }];
  for (const e of s.ledger) {
    v += (e.cashDelta || 0) + (e.marginDelta || 0);
    points.push({ v, kind: e.kind, id: e.id, deposit: e.deposit || 0 });
  }
  points.push({ v: practiceEquity(s, marks || {}), kind: "now", id: null, deposit: 0 });
  return points;
};

/* **The record as a file** (26 Sep 2026, *"işlem geçmişi dışa aktarma"*):
 * every event the ledger still holds, one row each, in the units a
 * spreadsheet reads — money in the account's currency with two places,
 * prices with four. Nothing is masked and nothing is added: the same rows
 * the balance is rebuilt from, so a total taken in the sheet is the total
 * the page shows. A folded summary, when there is one, is its own first row
 * and says what it is. */
const PRACTICE_CSV_COLUMNS = [
  "event", "step", "kind", "contract", "coin", "side", "qty", "price",
  "leverage", "realised", "fee", "funding", "cash_change", "margin_change", "deposit",
];
const practiceLedgerCsv = (s) => {
  if (!s || !Array.isArray(s.ledger)) return "";
  const money = (v) => (Number.isFinite(v) ? (v / MONEY_SCALE).toFixed(2) : "");
  const price = (v) => (Number.isFinite(v) && v > 0 ? (v / PRICE_SCALE).toFixed(4) : "");
  const cell = (v) => {
    const t = v == null ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = [PRACTICE_CSV_COLUMNS.join(",")];
  const sum = s.summary;
  if (sum && sum.count && !practiceIsCoinSettled(s)) {
    rows.push([
      "", "", `folded (${sum.count} earlier events)`, "", "", "", "", "", "",
      money(sum.realised || 0), money(sum.fee || 0), money(sum.funding || 0),
      money(sum.cashDelta || 0), money(sum.marginDelta || 0), money(sum.deposit || 0),
    ].map(cell).join(","));
  }
  for (const e of s.ledger) {
    rows.push([
      e.id, e.step, e.kind, e.pos || "", e.coin || "", e.side || "",
      Number.isFinite(e.qty) ? (e.qty / QTY_SCALE).toFixed(3) : "", price(e.fill), e.leverage || "",
      money(e.realised || 0), money(e.fee || 0), money(e.funding || 0),
      money(e.cashDelta || 0), money(e.marginDelta || 0), money(e.deposit || 0),
    ].map(cell).join(","));
  }
  return rows.join("\n") + "\n";
};

/* **How big this account is now** — what it opened with plus what has been
 * added to it. Every plan cap is a share of this rather than of
 * `startBalance`, and that is what makes a deposit mean anything: a limit
 * that stayed pinned to the opening figure would let the balance grow while
 * the amount you may commit, and the loss that ends the account, stood still
 * — money you could see and not use. */
const practiceAccountSize = (s, coin) => {
  if (!s) return 0;
  if (practiceIsCoinSettled(s)) {
    const wallet = practiceWallet(s, coin);
    return wallet.startBalance + (wallet.deposited || 0);
  }
  return s.startBalance + (s.deposited || 0);
};

/* **Infinity when the rule is off**, and not 0 — a cap of 0 is met by a loss of
   nothing, so returning it would have refused every order on an account that
   had lost not one cent. The one place this is read for display knows to print
   nothing instead. */
const practiceSessionLossCap = (s, coin) =>
  s.plan.sessionLossPct > 0
    ? Math.ceil((practiceAccountSize(s, coin) * s.plan.sessionLossPct) / 100)
    : Infinity;

/* What this session has lost — the realised total less whatever the previous
 * session had already lost when a deposit revived the account. On a fresh
 * account `lossFrom` is 0 and this is just the realised figure. */
/* How many contracts this session has opened. */
const practiceSessionOpened = (s) =>
  s ? Math.max(0, s.opened - (s.openedFrom || 0)) : 0;

const practiceSessionLoss = (s, coin) => {
  if (!s) return 0;
  const wallet = practiceIsCoinSettled(s) ? practiceWallet(s, coin) : null;
  const realised = wallet ? wallet.realised : s.realised;
  const from = (wallet ? wallet.lossFrom : s.lossFrom) || 0;
  return -(realised - from) || 0;
};

/* Why an entry was refused, never a bare false: the ticket has to be able to
 * say which limit stopped it, and "no" alone sends someone to guess. */
const practiceCanOpen = (s, order, priceE4) => {
  if (!s || s.ended) return "ended";
  if (!order || typeof order.coin !== "string" || !order.coin) return "coin";
  /* **Holding a coin is no longer a reason to refuse one.** That refusal was
     never a rule anybody chose — it was the store being keyed by the coin, so
     a second contract had nowhere to live. A venue in hedge mode lets you run
     as many as your balance carries, in either direction, on the same market
     or on different ones, and the only things that should stop you are the
     ones that are actually about money: the free balance, the per-contract
     margin wall, the session's own caps, and the slot ceiling below. */
  if (practiceCount(s) >= PRACTICE_MAX_POSITIONS) return "slots";
  if (!order || (order.side !== "long" && order.side !== "short")) return "side";
  if (!practiceLeverageOk(order.leverage)) return "leverage";
  if (order.leverage > s.plan.maxLeverage) return "planLeverage";
  const lot = practiceIsCoinSettled(s) ? PRACTICE_INVERSE_LOT_E2 : PRACTICE_LOT_E3;
  const maxQty = practiceIsCoinSettled(s) ? MAX_MONEY_E2 : MAX_QTY_E3;
  if (!Number.isSafeInteger(order.qty) || order.qty < lot || order.qty > maxQty) return "size";
  if (order.qty % lot !== 0) return "lot";
  if (practiceSessionLoss(s, order.coin) >= practiceSessionLossCap(s, order.coin)) return "planLoss";
  if (s.plan && s.plan.streakPause > 0 && practiceLossStreak(s) >= s.plan.streakPause) return "streak";
  if (priceE4 < MIN_PRICE_E4 || priceE4 > MAX_PRICE_E4) return "price";
  /* Refused here, before the first `mulDiv`, so an order too large to compute
     is *told* rather than thrown. The price and quantity caps above are
     deliberately loose — see the analysis in `practice-math.js` — and this is
     the bound that actually holds the arithmetic safe. */
  if (!practiceIsCoinSettled(s) && priceE4 * order.qty > MAX_PRODUCT) return "notional";
  /* **The inverse arm of the same bound, which was missing.**
   *
   * The line above refuses a linear order too large to compute and let every
   * inverse one through — so the model admitted positions whose own P/L could
   * not be represented, and `practiceInversePnl` threw later, from
   * `practiceReduce` and from the liquidation search, out of the middle of a
   * render. Found by the random walk in `tests/local-audit.js`, on a
   * coin-settled account; the same class as the liquidation fix and a second
   * instance of it, which is why the bound belongs here rather than at each
   * caller.
   *
   * What binds is the position's value **in the settlement coin**, not its
   * quote size: the inverse P/L is `qty × DIVISOR × (mark − entry) /
   * (entry × mark)`, so a big quote size on a cheap coin is what runs away.
   * At the worst mark this model will ever be asked about — `entry / 8`, past
   * every liquidation, which is where `practiceLiquidationPrice` stops — that
   * expression is `7 × coinValue`, so `PRACTICE_MAX_COIN_E8` (1e13) leaves a
   * hundredfold margin under `Number.MAX_SAFE_INTEGER`. It also refuses
   * nothing anyone can reach: 100,000 coin is a hundred times the largest
   * collateral the account can be given. */
  if (practiceIsCoinSettled(s) && practiceInverseTooBig(order.qty, priceE4)) {
    return "notional";
  }
  /* **The risk ladder caps the leverage, and it caps it by size.** Last,
     deliberately: it is the only refusal here that depends on the price *and*
     the quantity together, and every cheaper check has already run. An inverse
     contract is written in quote money, so its notional is the quantity
     itself. */
  const bracketNotional = practiceIsCoinSettled(s)
    ? order.qty
    : practiceNotional(priceE4, order.qty, ROUND_UP);
  if (s.plan.sizeTiers !== 0
      && order.leverage > practiceTierFor(bracketNotional).maxLeverage) return "tier";
  return null;
};

/* Setup codes are short `group:word` strings and there are at most eight of
   them; anything else is dropped rather than stored. */
const PRACTICE_SETUP_MAX = 8;
const practiceSetupCodes = (list) =>
  Array.isArray(list)
    ? list.filter((c) => typeof c === "string" && /^[a-z]+:[a-z]+$/.test(c)).slice(0, PRACTICE_SETUP_MAX)
    : [];

const practiceOpen = (s, order, priceE4) => {
  /* The account's schedule, read once and stamped on the position below: what
     this contract is charged is fixed when it is opened. */
  const costs = practiceCosts(s);
  const refusal = practiceCanOpen(s, order, priceE4);
  if (refusal) return { error: refusal };

  const long = order.side === "long";
  /* **A maker gets the price it asked for, and pays less for it.**
   *
   * `order.maker` is set only by `practiceFillOrders`, when a *resting* order
   * is filled by the market coming to it. Two consequences, and they are the
   * two halves of one fact — that order did not cross the spread:
   *   · no adverse fill, because there was nothing to cross;
   *   · the maker fee rather than the taker's.
   * Everything else about opening is identical, which is why this goes here
   * rather than in a second copy of `practiceOpen`. */
  const fill = order.maker ? priceE4 : practiceSlip(priceE4, costs.slipPpm, long);
  const entryFeePpm = order.maker ? practiceMakerPpm(costs.feePpm) : costs.feePpm;
  const inverse = practiceIsCoinSettled(s);
  const notional = inverse ? order.qty : practiceNotional(fill, order.qty, ROUND_UP);
  const margin = inverse
    ? mulDiv(order.qty, COIN_PRICE_DIVISOR, fill * order.leverage, ROUND_UP)
    : Math.ceil(notional / order.leverage);
  const feeBase = inverse
    ? practiceCoinForMoney(order.qty, fill, ROUND_UP)
    : notional;
  const fee = practiceRate(feeBase, entryFeePpm, ROUND_UP);

  const accountStart = inverse ? practiceWallet(s, order.coin).startBalance : s.startBalance;
  if (margin > practiceMarginWall(s.plan, accountStart)) return { error: "planMargin" };
  if (margin + fee > practiceFreeBalance(s, order.coin)) return { error: "funds" };

  /* The contract's own name, counted up and never reused inside an account:
     a record entry and a chart level both point at *this* contract, and a
     coin is no longer enough to say which one. */
  const id = String(s.nextPosId || 1);
  const position = {
    id,
    coin: order.coin,
    currency: order.currency || "",
    side: order.side,
    qty: order.qty,
    entry: fill,
    leverage: order.leverage,
    settlement: inverse ? PRACTICE_SETTLEMENT_COIN : PRACTICE_SETTLEMENT_QUOTE,
    margin,
    stop: null,
    take: null,
    /* A contract opens with no trail. The ticket does not offer one: a trail
       is a thing you put behind a position that is already running, and
       offering it in the order form would be a fifth number on a form that
       already asks for four. */
    trail: null,
    trailFrom: null,
    openedStep: s.step,
    /* **Wall-clock time comes in as data.** This file has no `Date.now` and
       is not going to grow one — the step counter is its clock and that is
       what makes it replayable. But "held for 14m" is a real reading and the
       step count cannot give it, so the caller stamps the moment the way it
       already stamps the price. Zero when nobody said, which reads as absent
       rather than as 1970. */
    openedAt: Number.isSafeInteger(order.at) && order.at > 0 ? order.at : 0,
    /* **The setup it was opened in, as codes** (`outlookSetupCodes`): where
       the price sat, what the tape and the book were doing, whether a stop
       was on the ticket. Stamped so the record can later be read *by setup*
       — the trader's own base rate. Facts about the moment, never a verdict;
       validated to the code shape and capped, like every stored list. */
    setup: practiceSetupCodes(order.setup),
    /* **The schedule this contract was opened under, carried with it.** The
       maintenance rate is computed from a position and a price and never from
       the session, so the number has to be here; and a contract that keeps
       the costs it was written under is the same rule a disposal follows for
       its cost method. */
    feePpm: costs.feePpm,
    slipPpm: costs.slipPpm,
    /* The maintenance ladder is part of the contract's schedule just like
       its costs. `false` means the explicitly unrestricted exercise; absent
       on an older position means the venue-style ladder it was opened under. */
    sizeTiers: s.plan.sizeTiers !== 0,
    /* Stamped at the first mark rather than here: this function has no clock,
       deliberately, and a position that has never been marked has never sat
       through a settlement. */
    fundedTo: 0,
    peak: fill,
    trough: fill,
  };
  const next = practiceApply(
    {
      ...s,
      positions: { ...s.positions, [id]: position },
      opened: s.opened + 1,
      nextPosId: (s.nextPosId || 1) + 1,
    },
    practiceEvent(s, "open", {
      pos: id,
      coin: order.coin,
      side: order.side,
      qty: order.qty,
      mark: priceE4,
      fill,
      leverage: order.leverage,
      settlement: position.settlement,
      currency: order.currency || "",
      cashDelta: -(margin + fee),
      marginDelta: margin,
      fee,
    }),
  );
  /* **The id comes back with the state.** The caller has a second thing to do
     to the contract it just opened — the ticket's stop and take-profit go on
     through `practiceSetTriggers`, so that a level typed on the ticket is
     checked by the same code as one set an hour later — and while a coin
     named one contract it could name it again afterwards. It cannot now, and
     recovering the id from the state is guesswork the model can simply not
     ask for. */
  return { state: next, id };
};

/* ---- RESTING ORDERS ---------------------------------------------------
 *
 * **The maker side of a market, which this trainer did not have.** Every order
 * until now crossed the spread: you pressed a button and paid the taker fee,
 * which is half of what a beginner needs to learn and the expensive half. A
 * limit order is the other half — you name a price, the money is *reserved*,
 * and nothing happens until the market comes to you.
 *
 * Three rules hold the whole feature together:
 *
 * 1. **Reserved money is still your money.** Placing takes the margin out of
 *    the balance and into `marginDelta`, exactly as opening does, so the
 *    ledger keeps explaining the account (`practiceReconcile`) and
 *    `practiceEquity` adds it back (`practiceReserved`). Cancelling is the
 *    same event with the signs flipped.
 * 2. **A limit order has to rest.** A buy above the market or a sell below it
 *    would fill on the next tick at the market price — which is a market
 *    order wearing a limit's clothes, and the refusal says so rather than
 *    quietly doing it.
 * 3. **A fill is `practiceOpen` with one flag.** `maker: true` means no
 *    adverse fill and the maker fee; everything else about a contract — the
 *    bracket, the plan, the stamping, the id — is the same code that opens a
 *    market order, because it is the same contract.
 *
 * How many may rest at once is a bound on state, not a rule about trading:
 * every one is drawn, sanitized and reconciled on every tick. */
const PRACTICE_MAX_ORDERS = 20;

/* **How much of a contract a take-profit may close.** A quarter, a half, all of
   it — the three a person actually says out loud, and `RATE_SCALE` (a million
   ppm) is "all", which is what every position written before scaling out
   existed already means. Not an arbitrary field: a typed share would be a
   fourth number on a row that already carries three. */
const PRACTICE_TAKE_SHARES = [250000, 500000, RATE_SCALE];

/* **How far behind the best price a trailing stop follows**, in ppm: 1%, 2%,
   5%, 10%. Four distances rather than a typed one, for the reason the take's
   shares are three — and because a trail typed to four decimal places implies
   a precision that a trainer marking on a three-tick median does not have.

   **It follows the best price *since the trail was set*, not since the
   contract was opened.** The position already carries `peak` and `trough`
   from its first tick, and riding those would put the level far above a
   contract that has given a run back — setting a trail would close the
   position on the next tick, which is the opposite of what the control is
   for. `trailFrom` is the trail's own high-water mark, seeded at the first
   step after it is set and ratcheted one way only. */
const PRACTICE_TRAIL_CHOICES = [10000, 20000, 50000, 100000];

/* Where a trailing stop currently sits, or null when there is no trail (or no
   anchor yet — the first step after it is set is what seeds one).

   Rounded **down** as a distance, so the level lands on the protective side
   of the fraction rather than a tick further away from it. */
const practiceTrailStop = (pos) => {
  if (!pos || !pos.trail || !pos.trailFrom) return null;
  const away = practiceRate(pos.trailFrom, pos.trail, ROUND_DOWN);
  if (!away) return null;
  const level = pos.side !== "short" ? pos.trailFrom - away : pos.trailFrom + away;
  if (level < MIN_PRICE_E4 || level > MAX_PRICE_E4) return null;
  return level;
};

/* A price the model can be asked about at all — the same bound every other
   price in this file is held to, checked here so a hand-edited limit cannot
   reach the arithmetic. */
const practiceOrderPriceOk = (v) =>
  Number.isSafeInteger(v) && v >= MIN_PRICE_E4 && v <= MAX_PRICE_E4;

/* **A stop and a take-profit that ride a resting order** (27 Sep 2026) — the
   venue's "TP/SL on a limit". Checked against the order's own price, the
   price the contract will open at: a long's stop below it and its take
   above, a short's the other way. `null` for none; `undefined` for a level
   that is not a price or is on the wrong side, which the caller refuses.
   The same rule `practiceSetTriggers` holds a running contract to, applied
   before there is one. */
const practiceOrderTriggers = (side, limit, stop, take) => {
  const long = side !== "short";
  const check = (v, wantBelow) => {
    if (v == null || v === 0) return null;
    if (!practiceOrderPriceOk(v)) return undefined;
    return v < limit === wantBelow && v !== limit ? v : undefined;
  };
  return { stop: check(stop, long), take: check(take, !long) };
};

const practicePlaceOrder = (s, order, priceE4) => {
  if (!s || s.ended) return { error: "ended" };
  if (!order || !order.coin) return { error: "coin" };
  if (order.side !== "long" && order.side !== "short") return { error: "side" };
  if (!practiceOrderPriceOk(order.limit)) return { error: "price" };
  if (!practiceOrderPriceOk(priceE4)) return { error: "price" };
  if (Object.keys(s.orders || {}).length >= PRACTICE_MAX_ORDERS) return { error: "orders" };
  /* **P6 — two more kinds of resting order.**
     A *stop* entry opens when the price breaks through its trigger — "open
     long if it breaks 105,000" — so it rests on the other side from a limit:
     above the market for a long, below it for a short. It reserves margin
     at its trigger like a limit and fills at the market when it trips.
     A *reduce-only* limit can only make contracts on the other side smaller;
     it opens nothing, so it reserves nothing, and it needs something to
     reduce. Both are refused rather than quietly turned into something else. */
  const kind = order.kind === "stop" ? "stop" : "limit";
  const reduce = order.reduce === true && kind === "limit";
  /* **It has to rest.** Equal counts as crossing: a limit at the market is
     filled by the tick that is already here, and so is a stop. */
  const long = order.side === "long";
  const crosses = kind === "stop"
    ? (long ? order.limit <= priceE4 : order.limit >= priceE4)
    : (long ? order.limit >= priceE4 : order.limit <= priceE4);
  if (crosses) return { error: "crosses" };
  /* A reduce-only order closes and opens nothing, so it carries no levels
     of its own; any other resting order may. */
  const levels = reduce ? { stop: null, take: null } : practiceOrderTriggers(order.side, order.limit, order.stop, order.take);
  if (levels.stop === undefined || levels.take === undefined) return { error: "side" };
  if (reduce) {
    const against = practiceForCoin(s, order.coin)
      .map((pid) => s.positions[pid])
      .filter((p) => p && p.side !== order.side);
    const heldQty = against.reduce((a, p) => a + p.qty, 0);
    if (!heldQty) return { error: "reduce" };
    if (!Number.isSafeInteger(order.qty) || order.qty <= 0 || order.qty > heldQty) return { error: "reduceSize" };
    const id = String(s.nextOrderId || 1);
    const placed = {
      id,
      coin: order.coin,
      currency: typeof order.currency === "string" ? order.currency : "",
      side: order.side,
      qty: order.qty,
      leverage: order.leverage || 1,
      limit: order.limit,
      margin: 0,
      kind: "limit",
      reduce: true,
      stop: null,
      take: null,
      at: Number.isFinite(order.at) ? order.at : 0,
    };
    const next = practiceApply(
      { ...s, orders: { ...s.orders, [id]: placed }, nextOrderId: (s.nextOrderId || 1) + 1 },
      practiceEvent(s, "place", {
        pos: "",
        order: id,
        coin: order.coin,
        currency: placed.currency,
        side: order.side,
        qty: order.qty,
        leverage: placed.leverage,
        mark: priceE4,
        fill: order.limit,
        margin: 0,
        cashDelta: 0,
        marginDelta: 0,
        /* What kind of order it was and when, for the order history. */
        orderKind: "reduce",
        ...(placed.at > 0 ? { at: placed.at } : {}),
      }),
    );
    return { state: next, id };
  }
  /* Validated against the price it will actually fill at, not the price now —
     the bracket, the plan's leverage and the arithmetic bounds are all
     functions of the fill. */
  const refusal = practiceCanOpen(s, { ...order, qty: order.qty }, order.limit);
  if (refusal) return { error: refusal };

  const inverse = practiceIsCoinSettled(s);
  const notional = inverse ? order.qty : practiceNotional(order.limit, order.qty, ROUND_UP);
  const margin = inverse
    ? mulDiv(order.qty, COIN_PRICE_DIVISOR, order.limit * order.leverage, ROUND_UP)
    : Math.ceil(notional / order.leverage);
  const accountStart = inverse ? practiceWallet(s, order.coin).startBalance : s.startBalance;
  if (margin > practiceMarginWall(s.plan, accountStart)) return { error: "planMargin" };
  /* **No fee at rest.** A venue charges when an order fills, not when it is
     written down — and reserving the fee as well would refuse orders the
     account can afford. The fee is taken by `practiceOpen` on the fill. */
  if (margin > practiceFreeBalance(s, order.coin)) return { error: "funds" };

  const id = String(s.nextOrderId || 1);
  const placed = {
    id,
    coin: order.coin,
    currency: typeof order.currency === "string" ? order.currency : "",
    side: order.side,
    qty: order.qty,
    leverage: order.leverage,
    limit: order.limit,
    margin,
    kind,
    reduce: false,
    stop: levels.stop,
    take: levels.take,
    at: Number.isFinite(order.at) ? order.at : 0,
  };
  const next = practiceApply(
    { ...s, orders: { ...s.orders, [id]: placed }, nextOrderId: (s.nextOrderId || 1) + 1 },
    practiceEvent(s, "place", {
      pos: "",
      order: id,
      coin: order.coin,
      currency: placed.currency,
      side: order.side,
      qty: order.qty,
      leverage: order.leverage,
      mark: priceE4,
      fill: order.limit,
      margin,
      cashDelta: -margin,
      marginDelta: margin,
      orderKind: kind,
      ...(placed.at > 0 ? { at: placed.at } : {}),
    }),
  );
  return { state: next, id };
};

/* Taking an order back: the reserve returns and the row goes. Never a
   `realised` figure — nothing was ever opened, so nothing was made or lost. */
/* `end` says how the order ended when it was not taken back by hand — the
   ledger wrote a fill's release as a plain cancel, so a history read from
   it could not tell an order that filled from one that was cancelled
   (27 Sep 2026). "fill", "refused" (released to fill, and the open said
   no), "moved" (the first half of practiceMoveOrder); absent is a cancel. */
const PRACTICE_ORDER_ENDS = ["fill", "refused", "moved"];
const practiceCancelOrder = (s, id, end) => {
  const o = s && s.orders ? s.orders[id] : null;
  if (!o) return { error: "none" };
  const rest = { ...s.orders };
  delete rest[id];
  const next = practiceApply(
    { ...s, orders: rest },
    practiceEvent(s, "cancel", {
      pos: "",
      order: id,
      coin: o.coin,
      currency: o.currency,
      side: o.side,
      qty: o.qty,
      leverage: o.leverage,
      fill: o.limit,
      margin: o.margin,
      cashDelta: o.margin,
      marginDelta: -o.margin,
      ...(PRACTICE_ORDER_ENDS.includes(end) ? { end } : {}),
    }),
  );
  return { state: next };
};

/* **Moving a resting order is one transition, not two.** Dragged on the
   chart (P4): the reserve comes back and goes out again at the new price, as
   a cancel and a place in the ledger — so `practiceReconcile` explains it
   without being taught anything — but they are applied together or not at
   all. Done as two separate calls, a refused placement (the new price
   crosses, or the plan now refuses it) left the order gone. Refused, the
   original state comes back untouched with the placement's own reason. */
const practiceMoveOrder = (s, id, limitE4, priceE4) => {
  const o = s && s.orders ? s.orders[id] : null;
  if (!o) return { error: "none" };
  if (limitE4 === o.limit) return { state: s, id };
  const cancelled = practiceCancelOrder(s, id, "moved");
  if (cancelled.error) return cancelled;
  const placed = practicePlaceOrder(
    cancelled.state,
    /* The levels go with it and are checked against the new price: a limit
       dragged past its own stop is refused with the triggers' reason rather
       than landing with a stop on the wrong side. */
    { coin: o.coin, currency: o.currency, side: o.side, qty: o.qty, leverage: o.leverage, limit: limitE4, at: o.at, kind: o.kind, reduce: o.reduce, stop: o.stop, take: o.take },
    priceE4,
  );
  if (placed.error) return { error: placed.error };
  return placed;
};

/* **How each order ended**, newest first — read from the ledger's place and
 * cancel rows by order id (27 Sep 2026). Filled, cancelled or refused; a
 * move is the same order at a new id, so its first half is left out, and an
 * order still resting is in `s.orders`, not here. What compaction has
 * folded away is gone from this too — it is the record's, not a second one. */
const practiceOrderHistory = (s, max) => {
  const ledger = (s && s.ledger) || [];
  const placed = {};
  for (const e of ledger) if (e.kind === "place" && e.order) placed[e.order] = e;
  const out = [];
  for (let i = ledger.length - 1; i >= 0 && out.length < (max || 30); i -= 1) {
    const e = ledger[i];
    if (e.kind !== "cancel" || !e.order || e.end === "moved") continue;
    const p = placed[e.order];
    out.push({
      order: e.order,
      coin: e.coin,
      side: e.side,
      qty: e.qty,
      leverage: e.leverage,
      limit: e.fill,
      kind: p && p.orderKind ? p.orderKind : "limit",
      at: p && p.at > 0 ? p.at : 0,
      status: e.end === "fill" ? "filled" : e.end === "refused" ? "refused" : "cancelled",
    });
  }
  return out;
};

/* **A scaled order: one size laid across a range as N resting limits**
 * (27 Sep 2026) — the venue's "scale order". Evenly spaced from the first
 * price to the last, the size split evenly (the remainder of the lot on
 * the first), each a limit through `practicePlaceOrder` with the same
 * leverage and the same stop and take — so every rule a single order
 * meets, each of these meets. **All or none**: the orders are placed on a
 * working copy and only a copy that took every one is returned, with the
 * index of the one refused otherwise. */
const PRACTICE_SCALE_COUNTS = [3, 5, 10];
const practiceScaleLevels = (fromE4, toE4, n) =>
  n >= 2 ? Array.from({ length: n }, (_, i) => Math.round(fromE4 + ((toE4 - fromE4) * i) / (n - 1))) : [];
const practicePlaceScale = (s, order, n, fromE4, toE4, priceE4) => {
  if (!PRACTICE_SCALE_COUNTS.includes(n)) return { error: "scaleCount" };
  if (!practiceOrderPriceOk(fromE4) || !practiceOrderPriceOk(toE4) || fromE4 === toE4) return { error: "scaleRange" };
  const lot = practiceIsCoinSettled(s) ? PRACTICE_INVERSE_LOT_E2 : PRACTICE_LOT_E3;
  const total = order && Number.isSafeInteger(order.qty) ? order.qty : 0;
  const each = Math.floor(total / n / lot) * lot;
  if (each < lot) return { error: "scaleSize" };
  if (Object.keys((s && s.orders) || {}).length + n > PRACTICE_MAX_ORDERS) return { error: "orders" };
  let state = s;
  const ids = [];
  const levels = practiceScaleLevels(fromE4, toE4, n);
  for (let i = 0; i < levels.length; i += 1) {
    const qty = each + (i === 0 ? total - each * n : 0);
    const placed = practicePlaceOrder(state, { ...order, kind: "limit", reduce: false, limit: levels[i], qty }, priceE4);
    if (placed.error || !placed.state) return { error: placed.error || "place", index: i };
    state = placed.state;
    ids.push(placed.id);
  }
  return { state, ids, levels, each };
};

/* **Did the market come to the order?**
 *
 * A resting buy fills when the price trades at or below its own; a sell, at or
 * above. The **last** price, not the mark: a fill is a trade at your level,
 * and the mark is a median built to keep one bad print from *liquidating* you.
 * An order waiting on the mark sat through the move it was written for.
 *
 * The reserve is released *before* `practiceOpen` is asked, because the open
 * checks the free balance and the money it needs is the money this order is
 * holding. If the open refuses anyway — a bracket that moved, a plan tightened
 * under it — the order is gone and the money is back, which is the only
 * honest end for an order that can no longer be filled. */
const practiceFillOrders = (s, marks) => {
  if (!s || !s.orders) return null;
  const ids = Object.keys(s.orders);
  if (!ids.length) return null;
  let state = s;
  const filled = [];
  for (const id of ids) {
    const o = state.orders[id];
    if (!o) continue;
    if (o.currency && marks && marks.currency && o.currency !== marks.currency) continue;
    const mark = marks ? marks[o.coin] : 0;
    if (!(mark > 0)) continue;
    /* A stop trips when the price comes *through* it; a limit fills when the
       price comes *to* it. */
    const stop = o.kind === "stop";
    const hit = stop
      ? (o.side === "long" ? mark >= o.limit : mark <= o.limit)
      : (o.side === "long" ? mark <= o.limit : mark >= o.limit);
    if (!hit) continue;
    const released = practiceCancelOrder(state, id, "fill");
    if (released.error || !released.state) continue;
    /* **Reduce-only: it takes contracts on the other side down, oldest
       first, at its own price and on maker terms, and anything left over
       when there is nothing more to reduce is simply not done** — it can
       never open a contract the other way. */
    if (o.reduce) {
      let rest = o.qty;
      let after = released.state;
      for (const pid of practiceForCoin(after, o.coin)) {
        const p = after.positions[pid];
        if (!p || p.side === o.side || rest <= 0) continue;
        const take = Math.min(rest, p.qty);
        const out = practiceReduce(after, pid, take, o.limit, "close", true);
        if (out.error || !out.state) continue;
        after = out.state;
        rest -= take;
      }
      state = after;
      filled.push({ order: id, coin: o.coin, reduce: true, qty: o.qty - rest, limit: o.limit, side: o.side });
      continue;
    }
    const opened = practiceOpen(
      released.state,
      {
        coin: o.coin,
        currency: o.currency,
        side: o.side,
        qty: o.qty,
        leverage: o.leverage,
        at: o.at,
        /* A limit fills at its own price on maker terms; a stop, once
           tripped, is a market order at the price that tripped it. */
        maker: !stop,
      },
      stop ? mark : o.limit,
    );
    if (opened.error || !opened.state) {
      /* Refused on the way in: the reserve is already back and the row is
         already gone, so the account is whole and the order simply ended —
         released as refused, not as filled, so its history says so. */
      const refused = practiceCancelOrder(state, id, "refused");
      state = refused.state || released.state;
      filled.push({ order: id, coin: o.coin, error: opened.error || "open" });
      continue;
    }
    state = opened.state;
    /* **The order's levels land on the contract it became**, through
       `practiceSetTriggers` like any level typed on a running contract. A
       stop entry fills at the mark that tripped it, and a mark that gapped
       past the order's own take-profit leaves that take on the wrong side
       of the fill (its stop cannot be passed that way — the gap is always
       away from it): the contract is kept, without the levels, and the
       entry says so — the same outcome as a ticket whose stop is refused on
       opening. */
    let triggers = null;
    if (o.stop > 0 || o.take > 0) {
      const set = practiceSetTriggers(state, opened.id, o.stop > 0 ? o.stop : null, o.take > 0 ? o.take : null);
      if (set.error || !set.state) triggers = set.error || "side";
      else state = set.state;
    }
    filled.push({ order: id, coin: o.coin, pos: opened.id, limit: o.limit, side: o.side, ...(triggers ? { triggers } : {}) });
  }
  return filled.length ? { state, filled } : null;
};

/* **Add margin without changing the contract.** On an isolated position the
 * quantity, entry and leverage stay put; only more of the account is placed
 * behind that one position, moving its liquidation level away. It is an
 * account movement, so it gets its own ledger event and has to respect both
 * the free balance and the plan's per-contract margin wall. */
const practiceAddMargin = (s, id, amountE2) => {
  if (!s || s.ended) return { error: "ended" };
  const pos = practiceAt(s, id);
  if (!pos) return { error: "none" };
  if (!Number.isSafeInteger(amountE2) || amountE2 <= 0) return { error: "size" };
  if (pos.margin + amountE2 > practiceMarginWall(s.plan, practiceAccountSize(s, pos.coin))) {
    return { error: "planMargin" };
  }
  if (amountE2 > practiceFreeBalance(s, pos.coin)) return { error: "funds" };
  const nextPos = { ...pos, margin: pos.margin + amountE2 };
  const next = practiceApply(
    { ...s, positions: { ...s.positions, [id]: nextPos } },
    practiceEvent(s, "margin", {
      pos: id,
      coin: pos.coin,
      side: pos.side,
      qty: pos.qty,
      leverage: pos.leverage,
      settlement: pos.settlement || PRACTICE_SETTLEMENT_QUOTE,
      cashDelta: -amountE2,
      marginDelta: amountE2,
    }),
  );
  return { state: next };
};

/* **A new session — the honest thing `resetPractice` was standing in for.**
 *
 * Both plan caps stop a *run*: the session loss limit and the contract count.
 * Meeting either used to leave exactly one way on — a reset that throws away
 * the balance, the lots and the whole record. So the punishment for meeting a
 * limit was "lose your history", which is the one thing a practice tool must
 * not do, and it is why neither limit was doing the job it was written for.
 *
 * This starts the next session and **keeps everything**: the balance, every
 * lot, every settled contract and the ledger the balance is reconciled from.
 * What it moves is the two marks the caps are measured against, so the limits
 * count afresh from here — and the account's whole history is still on the
 * record and still adds up.
 *
 * Refused while a contract is running: the caps are what the open contracts
 * were sized against, and re-basing them underneath a live position would
 * change the rules a decision was already made under. */
/* **Taking margin back out, which is the other half of adding it.**
 *
 * `practiceAddMargin` has existed since the position card did; there was never
 * a way back. That is not a rule the model was enforcing — it is simply a
 * function nobody wrote, and a venue lets you withdraw free margin from an
 * isolated position exactly as it lets you post more. Asked as "why can we
 * not change the margin afterwards", which is the right question.
 *
 * **Where the floor is.** Removing margin does not touch the size, the entry
 * or the leverage; it moves the liquidation *closer*, and past some point it
 * moves it past the price. A venue's own rule is "not below maintenance",
 * which permits taking a contract to within one tick of dying — a control
 * nobody wants and this panel already has a name for. The floor here is the
 * band the screen shouts at: after the withdrawal the contract must still be
 * out of `PRACTICE_DANGER_RATIO`. It is a training rule, it is stated, and it
 * is the same threshold the row and the toast use, so the three cannot
 * disagree about where the edge is.
 *
 * Needs a price, because "how close is this to dying" is a question about the
 * mark and not about the contract. No price is a refusal, not a guess. */
const practiceRemoveMargin = (s, id, amountE2, priceE4) => {
  if (!s || s.ended) return { error: "ended" };
  const pos = practiceAt(s, id);
  if (!pos) return { error: "none" };
  if (!Number.isSafeInteger(amountE2) || amountE2 <= 0) return { error: "size" };
  if (!Number.isSafeInteger(priceE4) || priceE4 <= 0) return { error: "price" };
  if (amountE2 >= pos.margin) return { error: "margin" };
  const nextPos = { ...pos, margin: pos.margin - amountE2 };
  const ratio = practiceMarginRatio(nextPos, priceE4);
  if (ratio === null || ratio <= PRACTICE_DANGER_RATIO) return { error: "margin" };
  const next = practiceApply(
    { ...s, positions: { ...s.positions, [id]: nextPos } },
    practiceEvent(s, "margin", {
      pos: id,
      coin: pos.coin,
      side: pos.side,
      qty: pos.qty,
      leverage: pos.leverage,
      settlement: pos.settlement || PRACTICE_SETTLEMENT_QUOTE,
      /* The mirror of adding: the money goes back to the balance and comes
         out from behind the contract. Same event kind, opposite signs, so the
         reconcile invariant and the record need to learn nothing. */
      cashDelta: amountE2,
      marginDelta: -amountE2,
    }),
  );
  return { state: next };
};

/* **The most that may be taken, found by asking the same question.**
 *
 * Bisected on `practiceRemoveMargin` itself rather than solved: the floor is a
 * predicate about the margin ratio, and rearranging it into a closed form is
 * how the liquidation price got a sign error the first time it was written.
 * Searching the predicate cannot disagree with the predicate.
 *
 * Zero when nothing may be taken, which is a real and common answer — a
 * contract already near its edge has no free margin behind it. */
const PRACTICE_FREE_MARGIN_STEPS = 34;
const practiceRemovableMargin = (s, id, priceE4) => {
  const pos = practiceAt(s, id);
  if (!pos || !(priceE4 > 0) || !(pos.margin > 0)) return 0;
  const ok = (v) => v > 0 && !practiceRemoveMargin(s, id, v, priceE4).error;
  let lo = 0;
  let hi = pos.margin - 1;
  if (!ok(1)) return 0;
  if (ok(hi)) return hi;
  for (let i = 0; i < PRACTICE_FREE_MARGIN_STEPS && hi - lo > 1; i += 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
};

const practiceNewSession = (s) => {
  if (!s) return { error: "none" };
  if (s.positions && Object.keys(s.positions).length) return { error: "open" };
  if (practiceIsCoinSettled(s)) {
    const wallets = {};
    for (const coin of Object.keys(s.wallets || {})) {
      wallets[coin] = { ...s.wallets[coin], lossFrom: s.wallets[coin].realised };
    }
    return { state: { ...s, wallets, openedFrom: s.opened, ended: false } };
  }
  return { state: { ...s, lossFrom: s.realised, openedFrom: s.opened, ended: false } };
};

/* **Adding funds to an account that is already running.**
 *
 * The money is carried as a `cashDelta` like every other event, so
 * `practiceReconcile` needs no new term and the record explains the balance
 * exactly as it did before. The same figure is tagged on the event as
 * `deposit`, which is what survives compaction and is what
 * `practiceAccountSize` sums — see the comment on `session.deposited`.
 *
 * Four refusals, each named rather than a bare false, because the panel has
 * somewhere to put one: an ended account (a cap you can pay your way out of
 * is not a cap), a nonsensical or out-of-range amount, and a top-up that
 * would take the account past what the arithmetic can hold.
 *
 * On a coin-settled account this lands in **one wallet**, the contract coin's
 * own: a BTC credit cannot be reconciled against an ETH debit, which is the
 * rule the rest of the inverse account already follows. */
const practiceDeposit = (s, amount, coin) => {
  if (!s) return { error: "ended" };
  const inverse = practiceIsCoinSettled(s);
  if (inverse && (typeof coin !== "string" || !coin)) return { error: "coin" };
  if (!practiceDepositOk(s, amount)) return { error: "size" };
  const ceiling = inverse ? PRACTICE_MAX_WALLET_E8 : PRACTICE_MAX_ACCOUNT_E2;
  if (practiceAccountSize(s, coin) + amount > ceiling) return { error: "full" };
  let next = practiceApply(
    s,
    practiceEvent(s, "deposit", {
      coin: inverse ? coin : "",
      settlement: inverse ? PRACTICE_SETTLEMENT_COIN : PRACTICE_SETTLEMENT_QUOTE,
      cashDelta: amount,
      deposit: amount,
    }),
  );
  /* **Money into an ended account starts a new session rather than nothing.**
   *
   * It used to be refused outright, on the argument that a loss cap you can
   * pay your way past is not a cap. That argument was half right and the half
   * it missed was the cost: the *only* way to carry on was `resetPractice`,
   * which destroys the balance, the lots and the whole record. So the rule did
   * not protect anyone from over-trading — it made the punishment for hitting
   * it "lose your history", which is the one thing a practice tool must not do.
   *
   * The cap still stops the run, and it is still measured over a session — the
   * loss that ended the last one is stamped into `lossFrom` and no longer
   * counted, so the next cap is a fresh one from here. Everything else
   * survives, and the act of carrying on is itself in the ledger as a deposit
   * anyone reading the record can count. */
  /* **The condition is the cap, not the `ended` flag.** Nothing in this model
     ever sets `ended` — the session loss limit stops an account by refusing
     `practiceCanOpen` with `planLoss`, which is what somebody actually meets.
     Re-basing only on `ended` would have been dead code guarding the wrong
     thing. Measured against `s`, before this deposit lands, so a top-up that
     was already going to clear the cap by raising it does not silently also
     wipe the session's loss. */
  const wasCapped =
    practiceSessionLoss(s, coin) >= practiceSessionLossCap(s, coin);
  if (s.ended || wasCapped) {
    /* One implementation of "the next session begins", shared with the button
       on the Account tab — two would drift and one of them would forget a
       mark. A live position is already impossible here, since a capped account
       has nothing open to have capped it. */
    const fresh = practiceNewSession(next);
    if (fresh.state) next = fresh.state;
  }
  return { state: next };
};

/* **Adding to a position you already hold — what a venue calls a fill, not a
 * new contract.**
 *
 * `practiceCanOpen` refuses a second order on a held coin with `open`, and the
 * ticket greyed its whole form out on the strength of it. That is not what
 * either venue this model is measured against does: on BitMEX and on Binance
 * an order in the **same direction** as an open position simply adds to it,
 * and the entry becomes the quantity-weighted average of every fill —
 * `Σ(price × qty) / Σ(qty)`. An order the other way reduces it. The form is
 * never dead, because an order on a symbol you hold is an ordinary order.
 *
 * Three things this deliberately does not do:
 *
 *   · **It does not count as a contract.** `opened` stays where it is, and so
 *     the session's contract cap is unmoved: the cap counts *positions taken*,
 *     and scaling into one is one position. Counting fills would make "five
 *     contracts" mean "five clicks", which is not a risk rule.
 *   · **It does not flip.** Reducing past the full size is the caller's job to
 *     clamp; a flip is two decisions and this model has no hedge mode in which
 *     to make the second one.
 *   · **It does not re-open a stop or a take.** Those were set against the old
 *     entry and the average has moved; leaving them is the honest thing, and
 *     saying so is the panel's.
 *
 * The margin for the added quantity is charged the same way the open charges
 * it, and the plan's per-contract wall applies to the **whole** position after
 * the addition — which is the wall's meaning. */
const practiceIncrease = (s, id, order, priceE4) => {
  if (!s || s.ended) return { error: "ended" };
  const pos = practiceAt(s, id);
  if (!pos) return { error: "none" };
  if (!order || order.side !== pos.side) return { error: "side" };
  if (Number(order.leverage) !== pos.leverage) return { error: "leverage" };
  const inverse = practiceIsCoinSettled(s);
  const lot = inverse ? PRACTICE_INVERSE_LOT_E2 : PRACTICE_LOT_E3;
  const maxQty = inverse ? MAX_MONEY_E2 : MAX_QTY_E3;
  if (!Number.isSafeInteger(order.qty) || order.qty < lot || order.qty > maxQty) return { error: "size" };
  if (order.qty % lot !== 0) return { error: "lot" };
  if (priceE4 < MIN_PRICE_E4 || priceE4 > MAX_PRICE_E4) return { error: "price" };
  const qty = pos.qty + order.qty;
  if (qty > maxQty) return { error: "size" };
  /* The same two bounds the door applies, against the position this leaves. */
  if (!inverse && priceE4 * qty > MAX_PRODUCT) return { error: "notional" };
  if (inverse && practiceInverseTooBig(qty, priceE4)) return { error: "notional" };

  const long = pos.side === "long";
  const fill = practiceSlip(priceE4, practicePosSlip(pos), long);
  const addNotional = inverse ? order.qty : practiceNotional(fill, order.qty, ROUND_UP);
  const addMargin = inverse
    ? mulDiv(order.qty, COIN_PRICE_DIVISOR, fill * pos.leverage, ROUND_UP)
    : Math.ceil(addNotional / pos.leverage);
  const feeBase = inverse ? practiceCoinForMoney(order.qty, fill, ROUND_UP) : addNotional;
  const fee = practiceRate(feeBase, practicePosFee(pos), ROUND_UP);

  if (pos.margin + addMargin > practiceMarginWall(s.plan, practiceAccountSize(s, pos.coin))) {
    return { error: "planMargin" };
  }
  if (addMargin + fee > practiceFreeBalance(s, pos.coin)) return { error: "funds" };

  /* **The quantity-weighted average, as two exact terms rather than one
   * inexact sum.**
   *
   * Written first as `mulDiv(entry * qty + fill * addQty, 1, qty)`, which
   * multiplies **before** `mulDiv` can see it: on an inverse contract
   * `entry × qty` reaches 1.1e19, past `Number.MAX_SAFE_INTEGER`, so what
   * arrived was a float and `mulDiv` refused it — correctly, and from inside
   * a render. Found by `scripts/audit-futures.js` on a id-settled walk, and
   * it is the same class of defect as the inverse P/L overflow two fixes ago:
   * arithmetic that is fine in the quote path and runs away in the id one.
   *
   * Each term goes through `mulDiv` whole, so the big product happens in
   * BigInt where it is exact. The two truncations cost at most one unit of
   * e4 — a hundredth of a cent on the entry — and both round the same way, so
   * the average never drifts in the trader's favour. */
  const entry = mulDiv(pos.entry, pos.qty, qty, long ? ROUND_UP : ROUND_DOWN)
    + mulDiv(fill, order.qty, qty, long ? ROUND_UP : ROUND_DOWN);

  const nextPos = {
    ...pos,
    qty,
    entry: Math.min(MAX_PRICE_E4, Math.max(MIN_PRICE_E4, entry)),
    margin: pos.margin + addMargin,
    peak: Math.max(pos.peak, fill),
    trough: Math.min(pos.trough, fill),
  };
  const next = practiceApply(
    { ...s, positions: { ...s.positions, [id]: nextPos } },
    practiceEvent(s, "add", {
      pos: id,
      coin: pos.coin,
      side: pos.side,
      qty: order.qty,
      mark: priceE4,
      fill,
      leverage: pos.leverage,
      settlement: pos.settlement || PRACTICE_SETTLEMENT_QUOTE,
      currency: pos.currency || "",
      cashDelta: -(addMargin + fee),
      marginDelta: addMargin,
      fee,
    }),
  );
  return { state: next };
};

/* **Setting the balance to a figure, rather than adding to it.**
 *
 * Adding funds could only go up, and the only way down — or to a *particular*
 * number — was the balance control, which does not adjust an account: it
 * replaces one, and takes the lots and the whole record with it. So "I have 1
 * BTC and I want 1.29" meant either working out that the difference is 0.29
 * and depositing that, or destroying the account to type a number.
 *
 * This is the same movement as a deposit, signed. Up is a deposit; down is a
 * withdrawal, and a withdrawal may only take what is **free** — margin behind
 * an open contract is committed, not yours to remove, and letting it go would
 * leave a position whose own margin is no longer in the account.
 *
 * The account's *size* moves with it (`deposited` is signed), so the plan caps
 * describe the money that is actually there rather than the high-water mark.
 * `startBalance` is untouched, as ever: the reconciliation invariant is
 * `balance = startBalance + Σ cashDelta`, and this is a `cashDelta` like every
 * other event. */
const practiceSetBalance = (s, target, coin) => {
  if (!s) return { error: "none" };
  const inverse = practiceIsCoinSettled(s);
  if (inverse && (typeof coin !== "string" || !coin)) return { error: "coin" };
  if (!Number.isSafeInteger(target) || target < 0) return { error: "size" };
  const free = practiceFreeBalance(s, coin);
  const delta = target - free;
  if (delta === 0) return { state: s };
  if (delta < 0 && target < 0) return { error: "funds" };
  const ceiling = inverse ? PRACTICE_MAX_WALLET_E8 : PRACTICE_MAX_ACCOUNT_E2;
  if (practiceAccountSize(s, coin) + delta > ceiling) return { error: "full" };
  /* An account cannot be set to less than it has committed: what is left has
     to cover the margin already behind the open contracts. */
  if (delta < 0 && practiceAccountSize(s, coin) + delta < 0) return { error: "funds" };

  let next = practiceApply(
    s,
    practiceEvent(s, delta > 0 ? "deposit" : "withdraw", {
      coin: inverse ? coin : "",
      settlement: inverse ? PRACTICE_SETTLEMENT_COIN : PRACTICE_SETTLEMENT_QUOTE,
      cashDelta: delta,
      deposit: delta,
    }),
  );
  /* Money in can restart a session the caps have stopped, exactly as a deposit
     does — money out cannot, or the way past a loss limit would be to take
     your own money off the table. */
  if (delta > 0) {
    const capped =
      practiceSessionLoss(s, coin) >= practiceSessionLossCap(s, coin);
    if (s.ended || capped) {
      const fresh = practiceNewSession(next);
      if (fresh.state) next = fresh.state;
    }
  }
  return { state: next };
};

/* **How much a close actually takes, decided in one place.**
 *
 * Two rules bend the number somebody asks for, and both used to live in
 * `app-calls.js` — which meant the panel could quote a figure the commit
 * would not take. That is the one thing this model exists to prevent, and it
 * is the same argument `practiceCloseQuote` makes about running the close
 * rather than re-deriving it.
 *
 *   · **Whole lots.** A quantity is an integer of `PRACTICE_LOT_E3`; the
 *     fraction under one lot is dropped rather than rounded up, so a close
 *     never takes more than was asked for.
 *   · **No stub.** A close that would leave less than one lot behind takes
 *     the lot with it, because a remainder too small to close is a position
 *     you cannot get out of.
 *
 * Zero means "nothing closeable was asked for" — the caller says so rather
 * than sending a refusal down into `practiceReduce`. */
const practiceCloseSize = (pos, qtyE3) => {
  if (!pos || !(pos.qty > 0)) return 0;
  const asked = Math.floor(Number(qtyE3));
  if (!Number.isFinite(asked) || asked <= 0) return 0;
  const lot = pos.settlement === PRACTICE_SETTLEMENT_COIN
    ? PRACTICE_INVERSE_LOT_E2
    : PRACTICE_LOT_E3;
  const want = Math.min(pos.qty, asked);
  const lots = want - (want % lot);
  if (lots < lot) return 0;
  return pos.qty - lots < lot ? pos.qty : lots;
};

/* The same, from a share of the position. `1` is the whole thing exactly,
 * never `floor(qty * 1)` — a rounding step on the way to "all of it" is how a
 * lot gets left behind on a position with an odd size. */
const practiceCloseShare = (pos, share) => {
  if (!pos) return 0;
  if (!(share > 0)) return 0;
  return practiceCloseSize(pos, share >= 1 ? pos.qty : Math.floor(pos.qty * share));
};

/* **A size typed as money, turned into a size.**
 *
 * The other half of what a venue's ticket offers: not "how many coins" but
 * "how much of it". Rounded **down**, so asking to take 500.00 off the table
 * never takes 500.02 — and written here rather than in the panel because the
 * scale conversion is the arithmetic contract's, not the screen's. */
/* **A conversion returns a value inside the model's declared range, or it is
 * handing its caller a number the caller cannot use.** At the largest money
 * this account can hold and the smallest price a path may reach, this came to
 * 1e15 — a perfectly ordinary double, ten times `MAX_QTY_E3`, and refused by
 * `practiceNotional` two frames later with the panel already mid-render. */
const practiceQtyForNotional = (notionalE2, priceE4) => {
  if (!(notionalE2 > 0) || !(priceE4 > 0)) return 0;
  return Math.min(MAX_QTY_E3, Math.floor((notionalE2 * NOTIONAL_DIVISOR) / priceE4));
};

/* Reduce and close are one path: closing is reducing the whole quantity. The
 * released margin is proportional, so the position that remains keeps the
 * leverage it was opened at. */
/* `maker` — P6, a resting reduce-only order filling at its own price: no
 * adverse fill and the maker fee, the same terms `practiceOpen` gives a
 * resting order. Absent means a taker close, which is every caller that
 * existed before it. */
const practiceReduce = (s, id, qtyE3, priceE4, why, maker) => {
  const pos = practiceAt(s, id);
  if (!pos) return { error: "none" };
  const qty = Math.min(pos.qty, Math.max(0, Math.floor(qtyE3)));
  const inverse = pos.settlement === PRACTICE_SETTLEMENT_COIN;
  const lot = inverse ? PRACTICE_INVERSE_LOT_E2 : PRACTICE_LOT_E3;
  if (qty < lot) return { error: "size" };

  const long = pos.side !== "short";
  /* A close sells a long and buys a short, so the adverse direction reverses:
   * the fill is worse than the mark on the way out too. */
  const fill = maker === true ? priceE4 : practiceSlip(priceE4, practicePosSlip(pos), !long);
  const notionalOut = inverse ? qty : practiceNotional(fill, qty, ROUND_DOWN);
  const notionalIn = inverse ? qty : practiceNotional(pos.entry, qty, ROUND_DOWN);
  const realised = inverse
    ? practiceInversePnl(qty, pos.entry, fill, pos.side)
    : long ? notionalOut - notionalIn : notionalIn - notionalOut;
  const feeBase = inverse
    ? practiceCoinForMoney(qty, fill, ROUND_UP)
    : practiceNotional(fill, qty, ROUND_UP);
  const fee = practiceRate(
    feeBase,
    maker === true ? practiceMakerPpm(practicePosFee(pos)) : practicePosFee(pos),
    ROUND_UP,
  );
  const released = qty === pos.qty ? pos.margin : Math.floor((pos.margin * qty) / pos.qty);

  /* Isolated means isolated: a close can never hand back more than the margin
   * it held plus what the move actually made, and a liquidation can never
   * reach past that margin into the rest of the account. */
  let cash = released + realised - fee;
  let capped = 0;
  if (cash < 0) {
    capped = -cash;
    cash = 0;
  }

  const rest = qty === pos.qty ? null : { ...pos, qty: pos.qty - qty, margin: pos.margin - released };
  const positions = { ...s.positions };
  if (rest) positions[id] = rest;
  else delete positions[id];
  const next = practiceApply(
    { ...s, positions },
    practiceEvent(s, why || "close", {
      pos: id,
      coin: pos.coin,
      side: pos.side,
      qty,
      mark: priceE4,
      fill,
      leverage: pos.leverage,
      settlement: pos.settlement || PRACTICE_SETTLEMENT_QUOTE,
      currency: pos.currency || "",
      cashDelta: cash,
      marginDelta: -released,
      fee,
      realised: cash - released,
      capped,
      /* For the scorecard: what the stop was when it was first set, how
         many times it was moved away, the loss that first stop defined,
         the margin behind the contract and when it was opened. */
      stopFirst: pos.stopFirst || null,
      stopMoved: pos.stopMoved || 0,
      risk: pos.stopFirst ? Math.max(0, -practiceUnrealised(pos, pos.stopFirst)) : 0,
      margin: pos.margin,
      openedAt: pos.openedAt || 0,
      ...(pos.setup && pos.setup.length ? { setup: pos.setup.slice() } : {}),
    }),
  );
  return { state: next };
};

/* **How many losing contracts in a row the record ends with.** Read off
 * the ledger's closing rows (close, stop, take, liquidation), newest first,
 * until one that did not lose. */
const practiceLossStreak = (s) => {
  let n = 0;
  const rows = (s && s.ledger) || [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const e = rows[i];
    if (!PRACTICE_CLOSED_KINDS.includes(e.kind)) continue;
    if (e.realised < 0) n += 1;
    else break;
  }
  return n;
};

/* Wilson score interval for k of n, at 95%: the honest way to print a win
 * rate from a small record — 8 of 12 reads "67% (43–85%)". */
const practiceWilson = (k, n) => {
  if (!(n > 0)) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), n };
};

/* **The process scorecard — the trader graded, never the market.**
 *
 * The one transferable idea in the Robbins Cup transcript: sessions are
 * A-game, B-game or C-game on *execution*, not on P/L, and consistency comes
 * from removing the C's rather than adding A's. A paper account can do this
 * without pretending, because it recorded everything the grade needs.
 *
 * Each closed contract is graded on what the record can observe, and only
 * that. A C is a rule that was there to be followed and was not: no stop
 * when it opened (`nostop`), a stop moved away from the price (`moved`), or
 * the third loss in a row (`streak`) — the one the transcript says is taken
 * angry. A B is a judgement call gone big: more risked at the first stop
 * than the plan's per-contract share (`risk`), or sized up straight after a
 * loss (`sizeup`). Otherwise A. A **bad loss** is a loss graded C.
 *
 * Alongside: the R-multiple of each contract (realised over the loss its
 * first stop defined), the average R, the profit factor (gross wins over
 * gross losses) and the win rate with its Wilson interval — the champion's
 * own four numbers, none of which the record printed before. Everything
 * carries its `n`; below `RECORD_MIN_FOR_STATS` the averages are null. */
const practiceScorecard = (s) => {
  const rows = ((s && s.ledger) || []).filter((e) => PRACTICE_CLOSED_KINDS.includes(e.kind));
  const size = practiceAccountSize(s);
  const perTrade = s && s.plan && s.plan.lossPerTradePct > 0 ? Math.round((size * s.plan.lossPerTradePct) / 100) : 0;
  const out = [];
  const grades = { A: 0, B: 0, C: 0 };
  let bad = 0;
  let wins = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let streak = 0;
  let prev = null;
  const rs = [];
  for (const e of rows) {
    const why = [];
    if (!e.stopFirst) why.push("nostop");
    if (e.stopMoved > 0) why.push("moved");
    if (e.realised < 0 && streak >= 2) why.push("streak");
    if (perTrade > 0 && e.risk > perTrade) why.push("risk");
    if (prev && prev.realised < 0 && e.margin > prev.margin) why.push("sizeup");
    const grade = why.some((w) => w === "nostop" || w === "moved" || w === "streak") ? "C" : why.length ? "B" : "A";
    grades[grade] += 1;
    if (e.realised < 0 && grade === "C") bad += 1;
    if (e.realised > 0) {
      wins += 1;
      grossWin += e.realised;
      streak = 0;
    } else if (e.realised < 0) {
      grossLoss += -e.realised;
      streak += 1;
    }
    const r = e.risk > 0 ? e.realised / e.risk : null;
    if (r != null) rs.push(r);
    out.push({ id: e.id, pos: e.pos, grade, why, r });
    prev = e;
  }
  const n = rows.length;
  /* Five, mirroring the record's own RECORD_MIN_FOR_STATS (config.js): the
     model does not read the app's config, so the floor is restated here. */
  const enough = n >= 5;
  return {
    n,
    grades,
    bad,
    rows: out,
    avgR: enough && rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    rN: rs.length,
    profitFactor: enough && grossLoss > 0 ? grossWin / grossLoss : null,
    win: enough ? practiceWilson(wins, n) : null,
  };
};

/* **P9 — the record as a journal.** A note and up to three tags on a closed
 * contract's own event: *why* it was taken and what kind of trade it was,
 * written down while it was fresh — the thing a trade journal adds to a
 * history. It changes no figure: the ledger's money fields are untouched, so
 * `practiceReconcile` is not asked anything new. Tags are normalised (lower
 * case, letters, digits and dashes, at most 16 characters, no repeats) so
 * "Breakout" and "breakout " are one tag a filter can find. An empty note and
 * no tags take the annotation off. */
const PRACTICE_NOTE_MAX = 280;
const PRACTICE_TAGS_MAX = 3;
const practiceTags = (raw) => {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out = [];
  for (const t of list) {
    const tag = String(t || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 16);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= PRACTICE_TAGS_MAX) break;
  }
  return out;
};
const PRACTICE_CLOSED_KINDS = ["close", "stop", "take", "liquidation"];
const practiceAnnotate = (s, eventId, note, tags) => {
  if (!s || !Array.isArray(s.ledger)) return { error: "none" };
  const at = s.ledger.findIndex((e) => e.id === eventId && PRACTICE_CLOSED_KINDS.includes(e.kind));
  if (at < 0) return { error: "none" };
  const text = typeof note === "string" ? note.trim().slice(0, PRACTICE_NOTE_MAX) : "";
  const clean = practiceTags(tags);
  const entry = { ...s.ledger[at] };
  delete entry.note;
  delete entry.tags;
  if (text) entry.note = text;
  if (clean.length) entry.tags = clean;
  const ledger = s.ledger.slice();
  ledger[at] = entry;
  return { state: { ...s, ledger } };
};

/* **P6 — turn a contract around.** Close it whole at the market and open the
 * other side with the same size and leverage, as one transition: a venue's
 * "reverse" is one press, and done as two the second could be refused (the
 * bracket, the free balance) with the first already gone. Refused, nothing
 * has happened. The new contract is a new contract — its own id, entry, fee
 * and levels; none of the old one's stop or take is carried across, because
 * they were on the losing and winning sides of a position that no longer
 * exists. */
const practiceReverse = (s, id, priceE4) => {
  const pos = practiceAt(s, id);
  if (!pos) return { error: "none" };
  const closed = practiceReduce(s, id, pos.qty, priceE4, "close");
  if (closed.error || !closed.state) return { error: closed.error || "close" };
  const opened = practiceOpen(
    closed.state,
    {
      coin: pos.coin,
      currency: pos.currency,
      side: pos.side === "short" ? "long" : "short",
      qty: pos.qty,
      leverage: pos.leverage,
    },
    priceE4,
  );
  if (opened.error || !opened.state) return { error: opened.error || "open" };
  return opened;
};

/* **What closing right now would actually leave you with.**
 *
 * The row could say what the position is worth and not what taking it would
 * pay, which are different numbers: closing crosses the spread the wrong way
 * and pays a fee, so the money that reaches the balance is always less than
 * the unrealised figure above it. Somebody reading "+12.48" and banking
 * "+11.90" has been told something that was not quite true.
 *
 * **Quoted by running the close**, not by writing the arithmetic a second
 * time. `practiceReduce` already knows about the adverse fill, the fee and
 * the isolated-margin floor; doing the sum again here would be a second
 * implementation to keep in step, and the one thing this whole model is for
 * is that the number shown and the number banked cannot disagree. The state
 * it produces is thrown away; only the figures are kept. */
/* **A quote is an object or nothing, never a throw.**
 *
 * This is asked during a render — the close ticket quotes before you press,
 * and the chart widget quotes to show what a share would take. A price the
 * arithmetic cannot carry is a quote that cannot be given, which is `null`;
 * propagating it takes the whole panel down through the error boundary. The
 * bound in `practiceCanOpen` is what stops an ordinary account reaching this,
 * and this is what stops a stored one from an older model doing so. */
const practiceCloseQuote = (s, id, priceE4, qtyE3) => {
  try {
    return practiceCloseQuoteAt(s, id, priceE4, qtyE3);
  } catch {
    return null;
  }
};

const practiceCloseQuoteAt = (s, id, priceE4, qtyE3) => {
  const pos = practiceAt(s, id);
  if (!pos || !(priceE4 > 0)) return null;
  /* **Any part of it, not only all of it.** The quote took the whole position
   * because the row only offered the whole position; a typed amount needs the
   * same figures for the piece being taken, and — the half a percentage
   * cannot show — for the piece being *left*. Absent, it still means all of
   * it, which is what every existing caller asks for. */
  const qty = qtyE3 === undefined || qtyE3 === null
    ? pos.qty
    : practiceCloseSize(pos, qtyE3);
  if (!qty) return null;
  const out = practiceReduce(s, id, qty, priceE4, "close");
  if (!out.state) return null;
  const event = out.state.ledger[out.state.ledger.length - 1];
  const rest = practiceAt(out.state, id);
  return {
    /* What is actually being taken, after the whole-lot and no-stub rules —
     * so the ticket can say "this takes all of it" when the remainder would
     * have been unclosable, instead of the button quietly doing more than the
     * field said. */
    qty,
    asked: qtyE3 === undefined || qtyE3 === null ? pos.qty : Math.floor(Number(qtyE3)) || 0,
    all: qty >= pos.qty,
    /* What the position cost to hold — the margin it locked up. */
    margin: pos.margin,
    /* What the move made, before the cost of getting out. */
    unrealised: practiceUnrealised(pos, priceE4),
    /* What getting out costs: the fee, plus the adverse fill on the way. */
    fee: event ? event.fee : 0,
    /* The price it actually fills at, which is not the mark: a close crosses
     * the spread the wrong way. Shown because a partial close is a decision
     * about a price, and the mark above it is not the one you get. */
    fill: event ? event.fill : priceE4,
    /* What actually lands: the margin back plus the result, net of both. */
    proceeds: event ? event.cashDelta : 0,
    realised: event ? event.realised : 0,
    balanceAfter: practiceFreeBalance(out.state, id),
    /* **What is left standing.** Read off the state the close produced rather
     * than worked out again here, for the reason the rest of this function
     * exists: two implementations of the same arithmetic are two answers. */
    restQty: rest ? rest.qty : 0,
    restMargin: rest ? rest.margin : 0,
    restUnrealised: rest ? practiceUnrealised(rest, priceE4) : 0,
    restLiquidation: rest ? practiceLiquidationPrice(rest) : null,
  };
};

/* Synthetic funding. Charged on marked notional, so it does not scale with
 * leverage a second time — the misunderstanding the funding drill exists to
 * correct. Taken from the position's margin rather than the free balance,
 * because an isolated position's costs must be able to end it. */
/* **The price at which this contract stops costing money.**
 *
 * Entry plus the round trip: the adverse fill on the way in is already in the
 * entry, and the fee on the way in and the fee and fill on the way out are
 * still to come. It is the number a beginner most needs and the one nothing
 * on this screen was saying — a contract closed at the price it opened at
 * comes back smaller, and until you can see where "even" is, that reads as
 * the model cheating.
 *
 * **Searched, not derived.** `practiceCloseQuote` is the same arithmetic the
 * close button runs, so bisecting it cannot disagree with what closing
 * actually pays; a closed form would be a second implementation, and the
 * liquidation price is bisected for exactly that reason. Realised rises with
 * price on a long and falls on a short, so the predicate is monotone either
 * way. Null when there is no answer inside the bracket rather than a number
 * pulled from an edge. */
const PRACTICE_EVEN_STEPS = 40;
/* **What opening this contract cost**, for the part of it still open. The
 * fee on the way in leaves the balance when the contract opens and never
 * appears in a close's `realised`, so anything asking "is this even yet" has
 * to add it back. Summed from the contract's own `open` and `add` events and
 * scaled to the quantity still held — a contract half closed has half its
 * opening cost still to earn back. Rounded up: even means *at least* even. */
const practiceEntryFees = (s, id) => {
  const pos = practiceAt(s, id);
  if (!pos || !s || !Array.isArray(s.ledger)) return 0;
  let fee = 0;
  let qty = 0;
  for (const e of s.ledger) {
    if (e.pos === id && (e.kind === "open" || e.kind === "add")) {
      fee += e.fee || 0;
      qty += e.qty || 0;
    }
  }
  if (!(qty > 0)) return fee;
  return pos.qty >= qty ? fee : Math.ceil((fee * pos.qty) / qty);
};

const practiceBreakEven = (s, id) => {
  const pos = practiceAt(s, id);
  if (!pos || !(pos.entry > 0)) return null;
  const long = pos.side !== "short";
  /* Even is the close paying back the opening fee too — see
     `practiceEntryFees`. It was `realised >= 0`, which forgot it: $100,151
     where the round trip needed ~$100,201 on 0.01 BTC at 2x. */
  const need = practiceEntryFees(s, id);
  const pays = (priceE4) => {
    const q = practiceCloseQuote(s, id, priceE4);
    return q ? q.realised >= need : false;
  };
  let lo = Math.max(MIN_PRICE_E4, Math.floor(pos.entry / 4));
  let hi = Math.min(MAX_PRICE_E4, pos.entry * 4);
  /* The bracket must contain the crossing or there is nothing to find. On a
     long the far end must pay and the near end must not; on a short it is the
     other way up. */
  if (long ? !pays(hi) || pays(lo) : !pays(lo) || pays(hi)) return null;
  for (let i = 0; i < PRACTICE_EVEN_STEPS && hi - lo > 1; i += 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (pays(mid) === long) hi = mid;
    else lo = mid;
  }
  return long ? hi : lo;
};

/* What this position has paid in funding so far, from the ledger it is
 * recorded in. Entries are per coin and stamped with the step they were
 * charged on, so a position opened after an earlier one was closed does not
 * inherit the older one's settlements. */
const practiceFundingPaid = (s, id) => {
  const pos = practiceAt(s, id);
  if (!pos || !s || !Array.isArray(s.ledger)) return 0;
  let sum = 0;
  for (const e of s.ledger) {
    /* Matched on the **position**, not on the coin: a coin can carry several
       contracts now, and charging one of them the settlements of its
       neighbours was the first thing this got wrong. */
    if (e.pos === id && e.kind === "funding") {
      sum += e.funding || 0;
    }
  }
  return sum;
};

const practiceFunding = (s, id, ratePpm, priceE4) => {
  const pos = practiceAt(s, id);
  if (!pos || !Number.isSafeInteger(ratePpm) || ratePpm === 0) return { state: s };
  const notional = practiceNotionalAt(pos, priceE4);
  const base = pos.settlement === PRACTICE_SETTLEMENT_COIN
    ? practiceCoinForMoney(notional, priceE4, ROUND_UP)
    : notional;
  const magnitude = practiceRate(base, Math.abs(ratePpm), ROUND_UP);
  /* A positive rate is paid by longs to shorts. The sign of what *this*
   * position pays therefore depends on both the rate and the side. */
  const pays = (ratePpm > 0) === (pos.side !== "short");
  const amount = pays ? magnitude : -magnitude;
  const next = practiceApply(
    { ...s, positions: { ...s.positions, [id]: { ...pos, margin: pos.margin - amount } } },
    practiceEvent(s, "funding", {
      pos: id,
      coin: pos.coin,
      side: pos.side,
      qty: pos.qty,
      mark: priceE4,
      ratePpm,
      settlement: pos.settlement || PRACTICE_SETTLEMENT_QUOTE,
      currency: pos.currency || "",
      cashDelta: 0,
      marginDelta: -amount,
      funding: amount,
    }),
  );
  return { state: next };
};

/* One generated step, in the fixed order the model version owns.
 *
 * Liquidation is tested before the triggers and that ordering is the rule
 * rather than a tidy-up: a step that crosses both took the position out
 * first, and filling the stop afterwards would hand back money at a price the
 * position was no longer alive to reach. A queued user action runs last, so
 * it can never jump ahead of an engine event on the same step.
 */
const practiceStep = (s, stepIndex, marks, options) => {
  if (!s || s.ended) return { state: s, events: [] };
  /* Out-of-order and duplicate steps are refused rather than replayed. A
   * repeated step would charge funding twice and re-test a trigger that has
   * already fired. */
  if (!Number.isSafeInteger(stepIndex) || stepIndex <= s.step) {
    return { state: s, events: [] };
  }

  let next = { ...s, step: stepIndex };
  const opts = options || {};
  const events = [];

  /* Each **contract** in turn, and each one entirely independently: isolated
   * margin means one position's liquidation cannot touch another's, and a
   * coin can now carry several contracts in either direction. The list is
   * taken once, up front, because a liquidation removes an entry from the
   * object being walked. */
  for (const id of practiceList(next).slice()) {
    const cur = practiceAt(next, id);
    if (!cur) continue;
    const coin = cur.coin;
    const priceE4 = marks && marks[coin];
    if (!(priceE4 > 0)) continue;

    /* **Funding, per coin, because every perpetual has its own rate.** This
       took a single `fundingPpm` for the whole step, which is only right in a
       lab where one instrument exists: BTC and XRP were 0.0058% and 0.0100%
       at the same instant on 2 Sep 2026, and charging one of those rates to
       both positions would be inventing a market. The caller works out what
       is owed — it owns the clock, this file owns the schedule
       (`practiceFundingWindows`) — and hands `{ ppm, at }` per coin: what to
       charge now, and the settlement it pays up to.

       **The stamp is not conditional on the charge.** A rate that rounds to
       nothing is still a settlement that happened, and leaving `fundedTo`
       behind on those would make the position owe that window for ever. */
    const due = opts.funding && opts.funding[coin];
    if (due && Number.isSafeInteger(due.ppm) && due.ppm !== 0) {
      next = practiceFunding(next, id, due.ppm, priceE4).state;
    }

    const held = practiceAt(next, id);
    if (!held) continue;
    next = {
      ...next,
      positions: {
        ...next.positions,
        [id]: {
          ...held,
          fundedTo:
            due && Number.isSafeInteger(due.at) && due.at > (held.fundedTo || 0)
              ? due.at
              : held.fundedTo || 0,
          peak: Math.max(held.peak, priceE4),
          trough: Math.min(held.trough, priceE4),
          /* **The trail's own high-water mark**, seeded here rather than
             where the trail is set — the model is handed a price on a step
             and not on a control press, and a trail anchored to the peak
             *since the contract opened* would fire the moment it was set on
             anything that had given a run back. One way only, and cleared
             with the trail itself. */
          trailFrom: !held.trail
            ? null
            : held.trailFrom == null
              ? priceE4
              : held.side !== "short"
                ? Math.max(held.trailFrom, priceE4)
                : Math.min(held.trailFrom, priceE4),
        },
      },
    };

    const pos = practiceAt(next, id);
    if (practiceIsLiquidated(pos, priceE4)) {
      const out = practiceReduce(next, id, pos.qty, priceE4, "liquidation");
      if (out.state) {
        next = out.state;
        events.push({ pos: id, coin, reason: "liquidation" });
      }
      continue;
    }
    const long = pos.side !== "short";
    /* **A trailing stop is a stop**, and it closes the contract for the same
       reason and under the same name: the level moved with the price, but the
       thing that happened is that a stop was hit. Whichever of the two is
       reached first fires — a contract may carry both, and a trail behind a
       winner does not cancel the line you drew when you were wrong. */
    const trailAt = practiceTrailStop(pos);
    const hitLevel = (level) =>
      level != null && (long ? priceE4 <= level : priceE4 >= level);
    const hitStop = hitLevel(pos.stop) || hitLevel(trailAt);
    if (hitStop) {
      const out = practiceReduce(next, id, pos.qty, priceE4, "stop");
      if (out.state) {
        next = out.state;
        events.push({ pos: id, coin, reason: "stop" });
      }
      continue;
    }
    /* **A take-profit may be for a share of the contract.**
     *
     * Scaling out is a real technique and could not be practised here: the
     * take closed everything, so "take half off and let the rest run" had no
     * expression at all. `takeShare` is that share in ppm — absent means the
     * whole contract, which is what every stored position says and what the
     * ticket means when nothing is chosen.
     *
     * The stop is deliberately **not** shareable. A stop is the line where you
     * were wrong; taking a third off at it is a decision nobody makes, and a
     * partial stop leaves a position running at the level that just proved it
     * should not be. */
    const hitTake = pos.take != null && (long ? priceE4 >= pos.take : priceE4 <= pos.take);
    if (hitTake) {
      /* `practiceCloseSize` holds the lot and stub rules, so a share that
         rounds to less than a lot — or leaves a stub behind — becomes the
         whole contract there rather than a fraction here. */
      const wanted = pos.takeShare > 0 && pos.takeShare < RATE_SCALE
        ? practiceCloseSize(pos, practiceRate(pos.qty, pos.takeShare, ROUND_DOWN))
        : pos.qty;
      const out = practiceReduce(next, id, wanted || pos.qty, priceE4, "take");
      if (out.state) {
        next = out.state;
        /* **A take that took a share is spent.**
         *
         * Left in place it fires again on the very next tick at the same
         * price, and again, until the contract is gone — which is the exact
         * opposite of what scaling out means. *Take half off here and let the
         * rest run* is one instruction, not a standing one; the rest runs with
         * no take-profit until somebody sets another. */
        const rest = practiceAt(next, id);
        if (rest && rest.take != null) {
          next = {
            ...next,
            positions: {
              ...next.positions,
              [id]: { ...rest, take: null, takeShare: RATE_SCALE },
            },
          };
        }
        events.push({ pos: id, coin, reason: "take" });
      }
    }
  }
  /* **The resting orders, after the contracts.**
   *
   * Last, deliberately: a fill opens a contract at a price the market has
   * just reached, and marking it in the same step would test it against the
   * tick that filled it — a position liquidated on arrival by the crossing it
   * was waiting for. It is marked on the next tick like everything else.
   *
   * The events are handed back the same way a liquidation's are, so the panel
   * can say what happened rather than leaving a new contract to be noticed. */
  /* **Filled on the last price, not on the mark.**
   *
   * The mark is a median of three ticks and exists to stop one bad print
   * liquidating a position. A fill is not a liquidation: on a venue a trade
   * *at* your price is what fills you, so a resting order that waits for a
   * smoothed price would sit through the move it was written for — measured,
   * it took two sweeps and about a minute to notice a price it was already
   * past. The caller hands the raw quote in `options.last`; with none, the
   * mark is used rather than nothing. */
  const fills = practiceFillOrders(next, opts.last || marks);
  if (fills) {
    next = fills.state;
    for (const f of fills.filled) {
      events.push({
        pos: f.pos || "",
        order: f.order,
        coin: f.coin,
        reason: f.error ? "unfilled" : "fill",
        /* Said, not swallowed: the order's stop or take could not be put on
           the contract it became (see practiceFillOrders). */
        ...(f.triggers ? { triggers: f.triggers } : {}),
      });
    }
  }

  return { state: next, events };
};

/* Triggers are refused on the wrong side of the entry rather than swapped:
 * a stop above a long's entry is a take-profit typed into the wrong box, and
 * accepting it would fire on the very next step. */
/* **Change what a contract costs — for the contracts that come after it.**
 *
 * Refused while anything is running, the same rule every other account
 * control follows: a contract already open keeps the schedule stamped on it,
 * and letting the account's figure diverge from the running one while both
 * are on screen is a screen that contradicts itself.
 *
 * Nothing else moves. The balance, the lots and the record are untouched, and
 * unlike a plan change this does **not** start a fresh account — every closed
 * entry records the fee it actually paid, so the record stays true whatever
 * this is set to afterwards. */
const practiceSetCosts = (s, patch) => {
  if (!s || s.ended) return { error: "ended" };
  if (s.positions && Object.keys(s.positions).length) return { error: "open" };
  const now = practiceCosts(s);
  const next = { ...now };
  if (patch && Object.prototype.hasOwnProperty.call(patch, "feePpm")) {
    if (!PRACTICE_COST_CHOICES.feePpm.includes(patch.feePpm)) return { error: "size" };
    next.feePpm = patch.feePpm;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, "slipPpm")) {
    if (!PRACTICE_COST_CHOICES.slipPpm.includes(patch.slipPpm)) return { error: "size" };
    next.slipPpm = patch.slipPpm;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, "funding")) {
    next.funding = patch.funding !== false;
  }
  if (
    next.feePpm === now.feePpm
    && next.slipPpm === now.slipPpm
    && next.funding === now.funding
  ) {
    return { state: s };
  }
  return { state: { ...s, costs: next } };
};

/* `trail` is the fifth control and the only optional one: **`undefined` means
   "leave it alone" and `null` means "take it off"**. Every call site that
   existed before the trail did passes four arguments, and reading a missing
   fifth as "no trail" would have made each of them silently clear one — the
   defect a renamed argument makes, from the other direction. */
const practiceSetTriggers = (s, id, stop, take, takeShare, trail) => {
  const pos = practiceAt(s, id);
  if (!pos) return { error: "none" };
  const long = pos.side !== "short";
  const check = (v, wantBelow) => {
    if (v == null) return null;
    if (!Number.isSafeInteger(v) || v < MIN_PRICE_E4 || v > MAX_PRICE_E4) return undefined;
    return v < pos.entry === wantBelow ? v : undefined;
  };
  const s1 = check(stop, long);
  const t1 = check(take, !long);
  if (s1 === undefined || t1 === undefined) return { error: "side" };
  /* **The share the take-profit closes**, in ppm, and only ever offered as a
     share of what is *still* held: a position that has already been scaled
     out of is a smaller position, and a share of the original would be a
     figure about a contract that no longer exists. Absent or whole means the
     lot — the answer every stored position gives and the one the ticket means
     when nothing is pressed. */
  const share = PRACTICE_TAKE_SHARES.includes(takeShare) ? takeShare : RATE_SCALE;
  let trailPpm = pos.trail || null;
  if (trail !== undefined) {
    if (trail === null || trail === 0) trailPpm = null;
    else if (!PRACTICE_TRAIL_CHOICES.includes(trail)) return { error: "size" };
    else trailPpm = trail;
  }
  return {
    state: {
      ...s,
      positions: {
        ...s.positions,
        [id]: {
          ...pos,
          stop: s1,
          /* **The process record.** The first stop a contract ever had is
             what its risk was sized by; a stop moved *away* from the price
             — a long's lowered, a short's raised — is the thing a grading
             cannot forgive, so it is counted rather than forgotten. */
          stopFirst: pos.stopFirst || s1 || null,
          stopMoved: (pos.stopMoved || 0)
            + (pos.stop != null && s1 != null && (long ? s1 < pos.stop : s1 > pos.stop) ? 1 : 0),
          take: t1,
          takeShare: t1 == null ? RATE_SCALE : share,
          trail: trailPpm,
          /* The anchor survives a change of distance — widening a trail from
             1% to 5% is still the same trail following the same high-water
             mark — and goes with the trail when it is taken off, so setting
             one again starts from where the price is then. */
          trailFrom: trailPpm ? pos.trailFrom || null : null,
        },
      },
    },
  };
};

/* Size from the plan's Practice-Unit loss budget rather than from a feeling.
 * The quantity is reduced until the modelled stop loss — including both fees
 * and the adverse fill on the way out — is inside the budget, so the number
 * offered is one the plan can actually afford. */
const practiceSizeForPlan = (s, side, priceE4, stopE4) => {
  /* Sizing an order that does not exist yet, so it is the account's schedule
     and not any position's. */
  const planCosts = practiceCosts(s);
  if (!s || !stopE4 || stopE4 <= 0) return null;
  const budget = Math.floor((s.startBalance * s.plan.lossPerTradePct) / 100);
  const long = side !== "short";
  const entryFill = practiceSlip(priceE4, planCosts.slipPpm, long);
  if (long ? stopE4 >= entryFill : stopE4 <= entryFill) return null;
  const stopFill = practiceSlip(stopE4, planCosts.slipPpm, !long);
  const perUnit = Math.abs(entryFill - stopFill);
  if (perUnit <= 0) return null;
  /* One unit of quantity is E3, so the loss per E3 unit is the price gap
   * scaled the way `practiceNotional` scales it. */
  let qty = Math.floor((budget * ((PRICE_SCALE * QTY_SCALE) / MONEY_SCALE)) / perUnit);
  qty = qty - (qty % PRACTICE_LOT_E3);
  while (qty >= PRACTICE_LOT_E3) {
    const inN = practiceNotional(entryFill, qty, ROUND_UP);
    const outN = practiceNotional(stopFill, qty, ROUND_DOWN);
    const loss = (long ? inN - outN : outN - inN)
      + practiceRate(inN, planCosts.feePpm, ROUND_UP)
      + practiceRate(practiceNotional(stopFill, qty, ROUND_UP), planCosts.feePpm, ROUND_UP);
    if (loss <= budget) break;
    qty -= PRACTICE_LOT_E3;
  }
  return qty >= PRACTICE_LOT_E3 ? qty : null;
};

/* ---- stored state is untrusted input ---------------------------------- */

/* Rebuilt field by field, and every derived total is **recomputed from the
 * ledger** rather than read. The Paper prototype trusted its stored balance
 * and recomputed its stored margin, which is exactly backwards: margin is a
 * number the user can change and had to be kept, while the balance is a
 * consequence of the events and must never be taken on trust. A hand-edited
 * file could otherwise simply declare itself rich.
 */
const practiceInt = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < lo || n > hi) return fallback;
  return n;
};

/* **The outcome cone: play the contract's next hour a few thousand times and
 * count.** Ulam's move — when the analytic answer is out of reach, run the
 * game many times with the real rules and tally. The rules are this model's
 * own: every path is stepped through `practiceStep`, so a path's liquidation
 * is the same liquidation the account would suffer, and the cone cannot
 * disagree with the ledger about what a stop is.
 *
 * The paths are **resampled from the market's own recent steps**, never from
 * a normal curve (the `moveRarity` rule): a block bootstrap of the log-returns
 * handed in, in runs of `block` bars, which keeps the short-range dependence
 * a plain shuffle throws away. It is a statement about "if the next `horizon`
 * bars look like the last window", with the window named by the caller —
 * not a probability of profit, and the screen must say so.
 *
 * Pure and replayable: the generator is seeded (`seed`), so the same contract
 * on the same window prints the same counts on every tab. Funding is not
 * charged inside a path — a horizon of one hour crosses at most one
 * settlement and the rate is stated on the strip. Refuses with `n: 0` when
 * there are fewer than `PRACTICE_CONE_MIN_BARS` returns to resample from. */
const PRACTICE_CONE_MIN_BARS = 30;
const PRACTICE_CONE_PATHS = 2000;
const practiceRng = (seed) => {
  /* mulberry32: small, fast, and good enough for a resampler. */
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const practiceLogReturns = (series) => {
  const out = [];
  if (!Array.isArray(series)) return out;
  for (let i = 1; i < series.length; i += 1) {
    const a = Number(series[i - 1] && series[i - 1].price);
    const b = Number(series[i] && series[i].price);
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
};
const practiceSimulate = (s, id, series, options) => {
  const o = options || {};
  const pos = practiceAt(s, id);
  const returns = practiceLogReturns(series);
  const paths = o.paths > 0 ? Math.min(o.paths, 20000) : PRACTICE_CONE_PATHS;
  const horizon = o.horizon > 0 ? o.horizon : 60;
  const block = o.block > 0 ? o.block : 8;
  const startE4 = o.markE4 > 0 ? o.markE4 : 0;
  if (!pos || returns.length < PRACTICE_CONE_MIN_BARS || !(startE4 > 0)) {
    return { n: 0, paths: 0, horizon, bars: returns.length };
  }
  const rng = practiceRng(o.seed == null ? 20260920 : o.seed);
  /* One contract alone, on a copy: the cone is about this contract, and a
     liquidation elsewhere in the account must not end a path. */
  const lone = {
    ...s,
    positions: { [id]: pos },
    orders: {},
    step: 0,
    ended: false,
  };
  const counts = { liquidation: 0, stop: 0, take: 0, open: 0 };
  const results = [];
  for (let p = 0; p < paths; p += 1) {
    let state = lone;
    let priceE4 = startE4;
    let ended = null;
    let i = 0;
    while (i < horizon) {
      /* A block of consecutive real steps, from a random start. */
      const at = Math.floor(rng() * returns.length);
      for (let k = 0; k < block && i < horizon; k += 1, i += 1) {
        const r = returns[(at + k) % returns.length];
        priceE4 = Math.max(MIN_PRICE_E4, Math.round(priceE4 * Math.exp(r)));
        const out = practiceStep(state, state.step + 1, { [pos.coin]: priceE4 }, { last: { [pos.coin]: priceE4 } });
        state = out.state;
        const hit = (out.events || []).find((e) => e.pos === id);
        if (hit) {
          ended = hit.reason;
          break;
        }
      }
      if (ended) break;
    }
    if (ended === "liquidation" || ended === "stop" || ended === "take") counts[ended] += 1;
    else {
      counts.open += 1;
      const live = practiceAt(state, id);
      results.push(live ? practiceUnrealised(live, priceE4) : 0);
    }
  }
  results.sort((a, b) => a - b);
  const q = (f) => (results.length ? results[Math.min(results.length - 1, Math.floor(f * results.length))] : null);
  return {
    n: paths,
    paths,
    horizon,
    bars: returns.length,
    counts,
    /* The P/L at the horizon of the paths that reached it, as quantiles. */
    median: q(0.5),
    p5: q(0.05),
    p95: q(0.95),
  };
};

const sanitizePractice = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const settlement = raw.settlement === PRACTICE_SETTLEMENT_COIN
    ? PRACTICE_SETTLEMENT_COIN
    : PRACTICE_SETTLEMENT_QUOTE;
  const base = practiceEmptySession(
    Number(raw.startBalance),
    settlement,
    Number(raw.startCollateral),
  );
  if (raw.modelVersion !== PRACTICE_MODEL_VERSION) return base;
  const inverse = settlement === PRACTICE_SETTLEMENT_COIN;
  const amountMax = inverse ? PRACTICE_MAX_COIN_E8 : MAX_MONEY_E2;
  const qtyMax = inverse ? MAX_MONEY_E2 : MAX_QTY_E3;

  /* The costs the account is set to, validated the way the plan is: only a
     number the product offers, and an unrecognised one falls back to the
     default rather than to whatever was in the file. `practiceCosts` is where
     the defaulting lives, so this only has to carry a shape it will accept. */
  const costs = practiceCosts(raw);
  const plan = { ...base.plan, locked: raw.plan ? Boolean(raw.plan.locked) : false };
  for (const key of Object.keys(PRACTICE_PLAN_LIMITS)) {
    const limit = PRACTICE_PLAN_LIMITS[key];
    const v = raw.plan ? Number(raw.plan[key]) : NaN;
    /* Only a value the product actually offers, and never above the ceiling —
     * a plan is a limit, so an unrecognised one falls back to the default
     * rather than to whatever was in the file. */
    plan[key] = limit.choices.includes(v) ? v : limit.def;
  }
  /* **The migrations in this file, and they only let go.**
   *
   * A plan is stored *with the account*, so a rule that has been taken out of
   * the product is still sitting in every file written before it went. Twice
   * now somebody has been unable to open a contract on an account with most of
   * its money still in it, because of a limit nobody chose and no venue has.
   *
   * At the schema bump, therefore: the session contract quota is gone from the
   * plan entirely (the loop above no longer copies it, whatever the file
   * says), the session loss stop is turned **off whatever it was set to**, and
   * an account that a stop had *ended* is un-ended — a session held shut by a
   * rule that no longer exists is the same bug wearing the last of its hats.
   *
   * It only ever removes a limit; it never invents one. The loss stop is one
   * press away on the Account tab for anybody who wants the discipline back. */
  const stored = practiceInt(raw.schemaVersion, 0, 1e6, 0);
  /* Named apart for the USDT stamp: the position loop below has a `stored`
     of its own (the coin a position was keyed by); read there, the stamp
     compared a coin with a schema number and carried no contract across. */
  const schemaIn = stored;
  if (stored < PRACTICE_SCHEMA_LOSS_STOP_OFF) {
    plan.sessionLossPct = 0;
  }
  /* **And the per-contract margin wall**, the same way and for the same
     reason — a limit that was a default rather than a choice, stored in every
     account written before it went. Turned off once, at schema 4; one press
     on the Account tab brings it back for anybody who wants it. */
  if (stored < PRACTICE_SCHEMA_MARGIN_WALL_OFF) {
    plan.marginSharePct = 0;
  }

  const ledger = Array.isArray(raw.ledger)
    ? raw.ledger
        .filter((e) => e && typeof e === "object" && typeof e.kind === "string")
        .slice(-PRACTICE_MAX_LEDGER)
        .map((e) => ({
          id: practiceInt(e.id, 0, 1e9, 0),
          kind: e.kind.slice(0, 16),
          step: practiceInt(e.step, 0, 1e9, 0),
          modelVersion: PRACTICE_MODEL_VERSION,
          pos: typeof e.pos === "string" ? e.pos.slice(0, 12) : "",
          /* **The resting order a place, a cancel or a fill belongs to** —
             named since 27 Sep 2026, when a random walk over the model found
             it dropped on every reload: the order history is read from these
             rows, and without the id a place and its cancel are two
             strangers. */
          ...(typeof e.order === "string" && e.order ? { order: e.order.slice(0, 12) } : {}),
          /* The order history's fields, where the row has them. */
          ...(PRACTICE_ORDER_ENDS.includes(e.end) ? { end: e.end } : {}),
          ...(["limit", "stop", "reduce"].includes(e.orderKind) ? { orderKind: e.orderKind } : {}),
          ...(e.kind === "place" && e.at > 0 ? { at: practiceInt(e.at, 0, MAX_FUNDED_TO, 0) } : {}),
          coin: typeof e.coin === "string" ? e.coin.toUpperCase().slice(0, 8) : "",
          currency: practiceUsdtStamp(e.currency, schemaIn),
          settlement: inverse ? PRACTICE_SETTLEMENT_COIN : PRACTICE_SETTLEMENT_QUOTE,
          side: e.side === "short" ? "short" : "long",
          qty: practiceInt(e.qty, 0, qtyMax, 0),
          mark: practiceInt(e.mark, 0, MAX_PRICE_E4, 0),
          fill: practiceInt(e.fill, 0, MAX_PRICE_E4, 0),
          leverage: practiceLeverageOk(Number(e.leverage)) ? Number(e.leverage) : 1,
          cashDelta: practiceInt(e.cashDelta, -amountMax, amountMax, 0),
          marginDelta: practiceInt(e.marginDelta, -amountMax, amountMax, 0),
          fee: practiceInt(e.fee, 0, amountMax, 0),
          funding: practiceInt(e.funding, -amountMax, amountMax, 0),
          realised: practiceInt(e.realised, -amountMax, amountMax, 0),
          /* Signed since the balance became settable — see the field's own
             note on `practiceEvent`. */
          deposit: practiceInt(e.deposit, -amountMax, amountMax, 0),
          capped: practiceInt(e.capped, 0, amountMax, 0),
          /* The scorecard's fields, only where the row has them. */
          ...(e.stopFirst ? { stopFirst: practiceInt(e.stopFirst, MIN_PRICE_E4, MAX_PRICE_E4, 0) || null } : {}),
          ...(e.stopMoved > 0 ? { stopMoved: practiceInt(e.stopMoved, 0, 1e6, 0) } : {}),
          ...(e.risk > 0 ? { risk: practiceInt(e.risk, 0, amountMax, 0) } : {}),
          ...(e.margin > 0 ? { margin: practiceInt(e.margin, 0, amountMax, 0) } : {}),
          ...(e.openedAt > 0 ? { openedAt: practiceInt(e.openedAt, 0, MAX_FUNDED_TO, 0) } : {}),
          ...(practiceSetupCodes(e.setup).length ? { setup: practiceSetupCodes(e.setup) } : {}),
          /* P9 — named, or a journal written today is gone on the next tab.
             Only where there is one, so an unannotated record costs nothing. */
          ...(typeof e.note === "string" && e.note.trim()
            ? { note: e.note.trim().slice(0, PRACTICE_NOTE_MAX) }
            : {}),
          ...(practiceTags(e.tags).length ? { tags: practiceTags(e.tags) } : {}),
        }))
    : [];

  const s = raw.summary && typeof raw.summary === "object" ? raw.summary : null;
  const summary = s
    ? inverse
      ? {
          count: practiceInt(s.count, 0, 1e9, 0),
          wallets: Object.keys(s.wallets && typeof s.wallets === "object" ? s.wallets : {})
            .slice(0, PRACTICE_MAX_POSITIONS)
            .reduce((out, coin) => {
              const w = s.wallets[coin] || {};
              out[String(coin).toUpperCase().slice(0, 8)] = {
                cashDelta: practiceInt(w.cashDelta, -amountMax, amountMax, 0),
                marginDelta: practiceInt(w.marginDelta, -amountMax, amountMax, 0),
                fee: practiceInt(w.fee, 0, amountMax, 0),
                funding: practiceInt(w.funding, -amountMax, amountMax, 0),
                realised: practiceInt(w.realised, -amountMax, amountMax, 0),
                deposit: practiceInt(w.deposit, -amountMax, amountMax, 0),
              };
              return out;
            }, {}),
        }
      : {
        count: practiceInt(s.count, 0, 1e9, 0),
        cashDelta: practiceInt(s.cashDelta, -MAX_MONEY_E2, MAX_MONEY_E2, 0),
        marginDelta: practiceInt(s.marginDelta, -MAX_MONEY_E2, MAX_MONEY_E2, 0),
        fee: practiceInt(s.fee, 0, MAX_MONEY_E2, 0),
        funding: practiceInt(s.funding, -MAX_MONEY_E2, MAX_MONEY_E2, 0),
        realised: practiceInt(s.realised, -MAX_MONEY_E2, MAX_MONEY_E2, 0),
        deposit: practiceInt(s.deposit, -MAX_MONEY_E2, MAX_MONEY_E2, 0),
        }
    : null;

  /* **What has been paid in, worked out before the positions are read.**
     A stored margin is bounded against a share of the account, and the
     account grows with its deposits — without this a position opened on a
     topped-up account would be measured against the opening figure and
     silently clipped on the next tab. Per coin, because an inverse account's
     wallets are independent. */
  const depositedIn = (coin) => {
    const seed = summary
      ? inverse
        ? ((summary.wallets || {})[coin] || {}).deposit || 0
        : summary.deposit || 0
      : 0;
    return ledger.reduce(
      (a, e) => a + (!inverse || e.coin === coin ? e.deposit || 0 : 0),
      seed,
    );
  };

  /* Every held coin, rebuilt field by field. A malformed one is dropped
     rather than allowed to blank the tab, and the map is bounded so a
     hand-edited file cannot make the account unboundedly large. */
  /* **Resting orders come back or they never rested.** A field the sanitizer
     does not name is a field that vanishes on the next tab — and this one
     holds *reserved money*, so losing it would silently hand the balance back
     while the ledger still said it was held, and `practiceReconcile` would
     start disagreeing with the account on load. Bounded exactly like a
     position: a price the model can be asked about, a quantity on the lot, a
     leverage it offers. */
  const orders = {};
  const rawOrders = raw.orders && typeof raw.orders === "object" ? raw.orders : {};
  let nextOrderId = practiceInt(raw.nextOrderId, 1, 1e9, 1);
  for (const key of Object.keys(rawOrders).slice(0, PRACTICE_MAX_ORDERS)) {
    const o = rawOrders[key];
    if (!o || typeof o !== "object") continue;
    const coin = String(o.coin || "").toUpperCase().slice(0, 8);
    const qty = practiceInt(o.qty, inverse ? PRACTICE_INVERSE_LOT_E2 : PRACTICE_LOT_E3, qtyMax, 0);
    const limit = practiceInt(o.limit, MIN_PRICE_E4, MAX_PRICE_E4, 0);
    const leverage = practiceLeverageOk(Number(o.leverage)) ? Number(o.leverage) : 0;
    const margin = practiceInt(o.margin, 0, amountMax, 0);
    /* A reduce-only order reserves nothing, so its margin is 0 by design —
       every other order without margin is malformed and dropped. */
    const reduce = o.reduce === true && o.kind !== "stop";
    if (!coin || !qty || !limit || !leverage || (!margin && !reduce)) continue;
    const id = String(key).slice(0, 12);
    /* Its stop and take-profit, if it has them — named, or an order placed
       with them would come back without — and dropped rather than kept when
       they are not a price on the right side of the order's own. */
    const levels = reduce
      ? { stop: null, take: null }
      : practiceOrderTriggers(o.side === "short" ? "short" : "long", limit,
        practiceInt(o.stop, MIN_PRICE_E4, MAX_PRICE_E4, 0) || null,
        practiceInt(o.take, MIN_PRICE_E4, MAX_PRICE_E4, 0) || null);
    orders[id] = {
      id,
      coin,
      currency: practiceUsdtStamp(o.currency, schemaIn),
      side: o.side === "short" ? "short" : "long",
      qty,
      leverage,
      limit,
      margin: reduce ? 0 : margin,
      /* Named, or they vanish on the next tab: a stop entry reloaded as a
         limit would fill on the wrong side of the market. */
      kind: o.kind === "stop" ? "stop" : "limit",
      reduce,
      stop: levels.stop || null,
      take: levels.take || null,
      at: practiceInt(o.at, 0, MAX_FUNDED_TO, 0),
    };
    if (Number(id) >= nextOrderId) nextOrderId = Number(id) + 1;
  }

  const positions = {};
  const raws = raw.positions && typeof raw.positions === "object" ? raw.positions : {};
  /* **The migration from a coin-keyed store to an id-keyed one.**
     Every account written before contracts had ids is keyed by the coin, so
     the key *is* the coin and there is exactly one per coin. Both shapes are
     read here: a position that carries its own `coin` is already the new
     shape and keeps its key as an id; one that does not takes the key as its
     coin and is given the next id. Nothing is dropped and nothing is
     renamed twice, because the id is only ever assigned to a position that
     has none. */
  let nextPosId = practiceInt(raw.nextPosId, 1, 1e9, 1);
  for (const key of Object.keys(raws).slice(0, PRACTICE_MAX_POSITIONS)) {
    const p = raws[key];
    if (!p || typeof p !== "object") continue;
    const stored = typeof p.coin === "string" ? p.coin : "";
    const coin = String(stored || key).toUpperCase().slice(0, 8);
    if (!coin) continue;
    /* A key that is not a coin is already an id and is kept, so a reload
       never renames a contract the record and the chart are pointing at. */
    const id = stored ? String(key).slice(0, 12) : String(nextPosId);
    if (!stored) nextPosId += 1;
    const qty = practiceInt(
      p.qty,
      inverse ? PRACTICE_INVERSE_LOT_E2 : PRACTICE_LOT_E3,
      qtyMax,
      0,
    );
    const entry = practiceInt(p.entry, MIN_PRICE_E4, MAX_PRICE_E4, 0);
    const leverage = practiceLeverageOk(Number(p.leverage)) ? Number(p.leverage) : 0;
    if (!qty || !entry || !leverage) continue;
    /* **The same bound as the door, on the way in from storage.**
     *
     * `practiceCanOpen` refuses an inverse order whose settlement-coin value
     * runs past what the P/L arithmetic can carry. A stored file is the other
     * entrance and had no such check, so an account written by an older model
     * — or by hand — could load a position that threw the moment anything
     * asked what it was worth. Worse than a blank panel: the position could
     * never be closed, because closing is what threw.
     *
     * Dropped rather than clamped. A position is a record of a size that was
     * taken; shrinking it would invent a different contract and put the
     * balance out of step with the ledger, which is the one thing this model
     * guarantees. */
    if (inverse && practiceInverseTooBig(qty, entry)) continue;
    const side = p.side === "short" ? "short" : "long";
    /* With the wall off, a contract may hold the whole account — so the
       bound on a stored margin is the account itself, not a wall of 0. */
    const accountIn = (inverse ? base.startCollateral : base.startBalance) + depositedIn(coin);
    const wall = practiceMarginWall(plan, accountIn);
    const cap = wall === Infinity ? accountIn : wall;
    const pos = {
      id,
      coin,
      currency: practiceUsdtStamp(p.currency, schemaIn),
      side,
      qty,
      entry,
      leverage,
      settlement: inverse ? PRACTICE_SETTLEMENT_COIN : PRACTICE_SETTLEMENT_QUOTE,
      /* **Stored, not recomputed** — funding moves margin off the opening
         formula, and recomputing it destroyed 300 units across one
         save/restore in the prototype this replaces. Bounded instead. */
      margin: practiceInt(
        p.margin,
        0,
        cap * 4,
        inverse
          ? mulDiv(qty, COIN_PRICE_DIVISOR, entry * leverage, ROUND_UP)
          : Math.ceil(practiceNotional(entry, qty, ROUND_UP) / leverage),
      ),
      stop: practiceInt(p.stop, MIN_PRICE_E4, MAX_PRICE_E4, null),
      take: practiceInt(p.take, MIN_PRICE_E4, MAX_PRICE_E4, null),
      /* A share the product offers, or the whole contract. A file written
         before scaling out existed has no share at all, and "all of it" is
         exactly what those positions meant. */
      takeShare: PRACTICE_TAKE_SHARES.includes(Number(p.takeShare))
        ? Number(p.takeShare)
        : RATE_SCALE,
      openedStep: practiceInt(p.openedStep, 0, 1e9, 0),
      /* Positions saved before this field existed have no stamp, and 0 is
         the answer that says so. */
      openedAt: practiceInt(p.openedAt, 0, MAX_FUNDED_TO, 0),
      setup: practiceSetupCodes(p.setup),
      /* A position saved before costs were a setting carries none, and
         `practicePosFee` answers with the schedule it was actually charged
         under — which is the default. */
      feePpm: practiceInt(p.feePpm, 0, 10000, PRACTICE_FEE_PPM),
      slipPpm: practiceInt(p.slipPpm, 0, 10000, PRACTICE_SLIP_PPM),
      /* Older positions predate the switch and therefore keep the ladder
         they were already being maintained against. Only an explicit false
         is the flat exercise. */
      sizeTiers: p.sizeTiers !== false,
      /* The settlement this position has paid up to, in unix ms. Zero means
         "never seen at one", which is what a position from before funding
         existed reads as — it starts its clock at the next mark and is never
         billed for windows nobody was watching. `MAX_FUNDED_TO` is 1 Jan
         2100: a clock, not a duration, so the usual 1e9 bound would throw
         every real timestamp away. */
      fundedTo: practiceInt(p.fundedTo, 0, MAX_FUNDED_TO, 0),
      peak: practiceInt(p.peak, MIN_PRICE_E4, MAX_PRICE_E4, entry),
      trough: practiceInt(p.trough, MIN_PRICE_E4, MAX_PRICE_E4, entry),
      /* **A trail is one of four distances or it is not a trail.** A stored
         number that is not one of them is storage that has been edited, and
         this file treats storage as untrusted: it becomes no trail rather
         than a distance the product does not offer. */
      trail: PRACTICE_TRAIL_CHOICES.includes(Number(p.trail)) ? Number(p.trail) : null,
      /* And the anchor is only meaningful with a trail on. Absent, the next
         step seeds it at the price then — which is also what a file written
         before trails existed will do. */
      trailFrom: PRACTICE_TRAIL_CHOICES.includes(Number(p.trail))
        ? practiceInt(p.trailFrom, MIN_PRICE_E4, MAX_PRICE_E4, null)
        : null,
      /* The process record rides with the contract. */
      stopFirst: practiceInt(p.stopFirst, MIN_PRICE_E4, MAX_PRICE_E4, 0) || null,
      stopMoved: practiceInt(p.stopMoved, 0, 1e6, 0),
    };
    /* A trigger on the wrong side of the entry would fire on the next step;
       drop it rather than store a booby trap. */
    const long = side !== "short";
    if (pos.stop != null && (long ? pos.stop >= entry : pos.stop <= entry)) pos.stop = null;
    if (pos.take != null && (long ? pos.take <= entry : pos.take >= entry)) pos.take = null;
    positions[id] = pos;
    /* Ids never go backwards inside an account: a file that already carries
       ids must not hand the next contract one that is in use. */
    const asNumber = Number(id);
    if (Number.isSafeInteger(asNumber) && asNumber >= nextPosId) nextPosId = asNumber + 1;
  }

  if (inverse) {
    const totals = {};
    const seeds = summary && summary.wallets ? summary.wallets : {};
    for (const coin of Object.keys(seeds)) totals[coin] = { ...seeds[coin] };
    for (const e of ledger) {
      if (!e.coin) continue;
      const t = totals[e.coin] || {
        cashDelta: 0, marginDelta: 0, fee: 0, funding: 0, realised: 0, deposit: 0,
      };
      totals[e.coin] = {
        cashDelta: t.cashDelta + e.cashDelta,
        marginDelta: t.marginDelta + e.marginDelta,
        fee: t.fee + e.fee,
        deposit: (t.deposit || 0) + (e.deposit || 0),
        funding: t.funding + e.funding,
        realised: t.realised + e.realised,
      };
    }
    const wallets = {};
    /* **The coins held, not the contracts.** `positions` is keyed by contract
       id now, so its keys are "1", "2", … — folding those in minted a wallet
       called "2" with the opening balance in it and left the real one short.
       Caught by the round-trip test, which is what it is for. */
    const walletCoins = new Set([
      ...Object.keys(totals),
      ...practiceCoinsHeld({ positions }),
      ...Object.keys(raw.wallets && typeof raw.wallets === "object" ? raw.wallets : {}),
    ]);
    for (const coin of [...walletCoins].slice(0, PRACTICE_MAX_POSITIONS)) {
      const t = totals[coin] || {
        cashDelta: 0, marginDelta: 0, fee: 0, funding: 0, realised: 0, deposit: 0,
      };
      const balance = base.startCollateral + t.cashDelta;
      if (balance < 0 || balance > PRACTICE_MAX_COIN_E8) return base;
      /* Rebuilt from the events like the balance, never read from the file:
         `deposited` sets the plan caps, so a hand-edited one would lift every
         limit the account is supposed to be held to. */
      const deposited = t.deposit || 0;
      if (base.startCollateral + deposited > PRACTICE_MAX_WALLET_E8) return base;
      wallets[coin] = {
        startBalance: base.startCollateral,
        balance,
        /* "Is anything of this coin's still open" — asked of the contracts,
           because the map is keyed by contract now and `positions[coin]` was
           looking up a coin among ids and finding nothing, which zeroed every
           wallet's margin on reload. */
        margin: practiceForCoin({ positions }, coin).length ? t.marginDelta : 0,
        realised: t.realised,
        fees: t.fee,
        funding: t.funding,
        deposited,
        /* Read from the file — it is not derivable from the events — but
           bounded to what could actually have happened: never positive, and
           never a bigger loss than the wallet has realised, or a hand-edited
           value would hand the account an unlimited loss cap. */
        lossFrom: Math.min(0, Math.max(t.realised, practiceInt(
          (raw.wallets && raw.wallets[coin] || {}).lossFrom, -amountMax, 0, 0))),
      };
    }
    return {
      ...base,
      plan,
      costs,
      step: practiceInt(raw.step, 0, 1e9, 0),
      positions,
      wallets,
      opened: practiceInt(raw.opened, 0, 1000, 0),
      nextPosId,
      /* Same migration on the inverse branch — see the quote one below. */
      openedFrom: raw.openedFrom === undefined
        ? practiceInt(raw.opened, 0, 1000, 0)
        : Math.min(
            practiceInt(raw.opened, 0, 1000, 0),
            practiceInt(raw.openedFrom, 0, 1000, 0),
          ),
      nextId: practiceInt(raw.nextId, 1, 1e9, ledger.length + 1),
      ledger,
      summary,
      /* Un-ended by the migration: the only thing that ends a session is the
         loss stop, and that is cleared on the way in — see the note there. */
      ended: stored < PRACTICE_SCHEMA_LOSS_STOP_OFF ? false : Boolean(raw.ended),
    };
  }

  /* Balance and margin come from the events, never from the file. */
  const sums = (summary || { cashDelta: 0, marginDelta: 0 }).cashDelta;
  let cash = sums;
  let margin = (summary || { marginDelta: 0 }).marginDelta;
  let fees = (summary || { fee: 0 }).fee;
  let funding = (summary || { funding: 0 }).funding;
  let realised = (summary || { realised: 0 }).realised;
  let deposited = (summary || { deposit: 0 }).deposit || 0;
  for (const e of ledger) {
    cash += e.cashDelta;
    margin += e.marginDelta;
    fees += e.fee;
    funding += e.funding;
    realised += e.realised;
    deposited += e.deposit || 0;
  }
  if (base.startBalance + deposited > PRACTICE_MAX_ACCOUNT_E2) return base;
  const balance = base.startBalance + cash;
  /* The sanity bound is a multiple of the account's **size**, not of what it
     opened with. Left as `startBalance * 100` a topped-up account would fail
     its own check on the next tab and be thrown away in silence — the
     hundred-fold headroom is there for winnings, and a deposit is not one. */
  if (balance < 0 || balance > (base.startBalance + deposited) * 100) return base;

  return {
    ...base,
    plan,
    costs,
    step: practiceInt(raw.step, 0, 1e9, 0),
    balance,
    /* **Zeroed only when nothing at all is holding margin.** This read
       `positions.length ? margin : 0` — a repair for a stored file whose
       margin did not match its (empty) book. A resting order holds margin
       with no position behind it, so the old test would have thrown the
       reserve away on load and left the ledger describing money the account
       no longer had. */
    margin: Object.keys(positions).length || Object.keys(orders).length ? margin : 0,
    positions,
    orders,
    nextOrderId,
    opened: practiceInt(raw.opened, 0, 1000, 0),
    nextPosId,
    deposited,
    /* Bounded the same way the wallet's is: never positive, never claiming a
       larger loss than was realised. */
    lossFrom: Math.min(0, Math.max(realised, practiceInt(raw.lossFrom, -MAX_MONEY_E2, 0, 0))),
    /* **An account saved before sessions existed starts one now.**
     *
     * `plan.maxPositions` used to be counted for the life of the account, and
     * making it a session count left every stored account arriving in the new
     * world **already at its cap**: `opened` was 12 and `openedFrom` defaulted
     * to 0. So the fix for "a limit you can meet with the money still there"
     * shipped with exactly that symptom for anybody who had traded before it,
     * and the only way out was a button on a tab they had no reason to open.
     *
     * An absent `openedFrom` means the file predates the field, which is a
     * different thing from a recorded zero — so it starts the session here
     * rather than counting the account's whole history against it. Present and
     * out of range is still clamped: a hand-edited one would buy an unlimited
     * contract count. */
    openedFrom: raw.openedFrom === undefined
      ? practiceInt(raw.opened, 0, 1000, 0)
      : Math.min(
          practiceInt(raw.opened, 0, 1000, 0),
          practiceInt(raw.openedFrom, 0, 1000, 0),
        ),
    realised,
    fees,
    funding,
    nextId: practiceInt(raw.nextId, 1, 1e9, ledger.length + 1),
    ledger,
    summary,
    ended: stored < PRACTICE_SCHEMA_LOSS_STOP_OFF ? false : Boolean(raw.ended),
  };
};
