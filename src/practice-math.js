/* PRACTICE MATH — the one arithmetic contract Practice Lab is allowed to use.
 *
 * Every value in the lab is a **scaled integer**. Nothing here is a float,
 * because the account has to reconcile exactly: a ledger whose signed cash
 * deltas must add up to the balance cannot be built on a representation where
 * 0.1 + 0.2 is not 0.3. The prototype this replaces used plain JavaScript
 * numbers and its own tests could only assert to within a tolerance.
 *
 * Four scales, and each is chosen so the products the model actually forms
 * stay inside `Number.MAX_SAFE_INTEGER` with room to spare:
 *
 *   price     E4   110000.0000   ->      1100000000
 *   quantity  E3        0.180    ->             180
 *   money     E2    10000.00     ->         1000000
 *   rate     ppm        0.05%    ->             500
 *
 * **The two ends of the price range cannot both be small, and the first
 * version of this file assumed they could.** `MAX_PRICE_E4` was 1e8 —
 * 10,000.0000 — which was right for a lab with generated prices near 1,000
 * and wrong the moment this was pointed at the real market: every attempt to
 * open a Bitcoin position was refused with `price`, because BTC has not
 * traded under $10,000 since 2020. Nor is a high cap alone enough. The same
 * account has to hold a coin worth a hundred million (BTC quoted in KRW, and
 * a currency switch must not make a market unopenable) and a coin somebody
 * owns a billion of, so **neither factor can be bounded tightly**, and the
 * pair of caps multiplied together is nowhere near safe.
 *
 * What *is* bounded is the thing the two of them make: the **notional**.
 *
 *   product = price_E4 x qty_E3 = notional_E2 x (PRICE_SCALE x QTY_SCALE / MONEY_SCALE)
 *           = notional_E2 x 1e5
 *
 * so bounding the notional bounds the product exactly. `MAX_MONEY_E2` is 1e10
 * (100,000,000.00), giving a worst product of 1e15 against a safe limit of
 * 9.007e15 — **9x of headroom**, and it is reachable from nowhere: the largest
 * account is 100,000.00 (`PRACTICE_MAX_BALANCE_E2`) and the highest leverage
 * is 200, so the most notional an order can name is 20,000,000.00, a product
 * of 2e14 and 45x of headroom. The caps are what make that a fact rather
 * than a hope; `mulDiv` refuses rather than silently losing precision if a
 * caller ever exceeds them, and `practiceCanOpen` refuses *before* the
 * arithmetic runs so a person is told "notional" instead of being handed a
 * thrown error. A silent overflow here would show up as money appearing from
 * nowhere, which is the one failure this whole contract exists to prevent.
 */

const PRICE_SCALE = 10000; // price E4
const QTY_SCALE = 1000; // quantity E3
const MONEY_SCALE = 100; // Practice Units E2
/* Contract collateral and result. Eight places are deliberate: coin-settled
 * accounts must be able to show a satoshi-sized movement without feeding a
 * formatted float back into the ledger. */
const COIN_SCALE = 100000000; // contract coin E8
const RATE_SCALE = 1000000; // rates in parts per million

/* Hard bounds, asserted rather than assumed — see the analysis above for why
 * the price and quantity caps are loose and the money cap is the tight one.
 * Price reaches a billion because a coin is quoted in 37 currencies and BTC
 * in KRW is nine figures; quantity reaches a billion because a holding is a
 * count of coins and some coins cost a hundredth of a cent. Neither is a
 * limit anyone will meet; `MAX_MONEY_E2` is the one that binds. */
const MAX_PRICE_E4 = 10000000000000; // 1,000,000,000.0000
const MIN_PRICE_E4 = 1; // 0.0001 — a path may not reach zero
const MAX_QTY_E3 = 1000000000000; // 1,000,000,000.000
const MAX_MONEY_E2 = 10000000000; // 100,000,000.00

/* The bound the two loose caps are actually held by, stated once so the guard
 * and the analysis cannot drift apart. */
const MAX_PRODUCT = MAX_MONEY_E2 * ((PRICE_SCALE * QTY_SCALE) / MONEY_SCALE);

/* Rounding is never "nearest". Every call names the direction, because the
 * whole rounding contract is that a fraction of a Practice Unit must never
 * land in the user's favour by accident — a fee that rounds down and a payout
 * that rounds up are how a simulated account slowly mints money. */
const ROUND_DOWN = "down";
const ROUND_UP = "up";

const practiceIsInt = (v) => typeof v === "number" && Number.isSafeInteger(v);

/* `a * b / d`, with the product checked before the division and the direction
 * of rounding stated by the caller. Throws a named error rather than
 * returning a wrong number: an unbounded input is a programming mistake, and
 * the model would rather stop than reconcile to a lie. */
/* **The exact path for a product that will not fit, and why one is needed.**
 *
 * `a * b` overflowing the safe range used to be a thrown error, and that was
 * the right answer while every product in the model was `price x quantity`,
 * which the bounds analysis above holds under 9e15 with room to spare.
 *
 * A **coin-margined** contract is not that shape. Its margin, its result and
 * its balance are all denominated in the coin, so the model has to convert
 * between a size in money and a value in coin — and at a coin scale fine
 * enough to be useful (E8; a hundredth of a percent of a Bitcoin is still
 * four dollars) the intermediate is far past the ceiling. Measured: converting
 * an *ordinary* 0.581 BTC position at 43,480 needs 2.526e16, which is 2.8x
 * over, and the same position with BTC quoted in KRW needs 3.486e19, which is
 * 3,800x over. Neither is an extreme anybody has to reach for — the first is
 * a middling position in the app's default currency.
 *
 * So the intermediate is done in `BigInt` when it has to be. This is not a
 * relaxation of the contract, it is the contract holding at a scale plain
 * doubles cannot reach: BigInt is exact, so the answer is the same answer,
 * and the **result** is still required to be a safe integer — which is the
 * bound that actually matters, since the result is what gets stored.
 *
 * The rounding has to match the fast path exactly, including for negatives:
 * BigInt division truncates *toward zero* while `Math.floor` goes *down*, so
 * a negative quotient with a remainder is one short of floor and one past
 * ceil. Both are corrected here rather than left to differ by a unit — a unit
 * that differs by sign is precisely how a simulated account mints money.
 */
const bigMulDiv = (a, b, d, mode) => {
  const product = BigInt(a) * BigInt(b);
  const divisor = BigInt(d);
  let q = product / divisor;
  const rest = product % divisor;
  if (rest !== 0n) {
    const negative = product < 0n !== divisor < 0n;
    if (mode === ROUND_UP) {
      if (!negative) q += 1n;
    } else if (negative) {
      q -= 1n;
    }
  }
  const out = Number(q);
  if (!Number.isSafeInteger(out)) {
    throw new Error("practice-math: result outside safe integer range");
  }
  return out;
};

const mulDiv = (a, b, d, mode) => {
  if (!practiceIsInt(a) || !practiceIsInt(b) || !practiceIsInt(d)) {
    throw new Error("practice-math: non-integer operand");
  }
  if (d === 0) throw new Error("practice-math: divide by zero");
  const product = a * b;
  if (!Number.isSafeInteger(product)) return bigMulDiv(a, b, d, mode);
  const q = product / d;
  /* Sign matters: `Math.floor` on a negative number rounds away from zero,
   * which is *down* in the arithmetic sense and is what "down" must mean here
   * — a loss rounding further from zero is conservative, a loss rounding
   * toward zero is a gift. */
  return mode === ROUND_UP ? Math.ceil(q) : Math.floor(q);
};

/* Notional in money E2 from a price E4 and a quantity E3.
 * price * qty carries scale E7; money is E2, so the divisor is E5. */
const NOTIONAL_DIVISOR = (PRICE_SCALE * QTY_SCALE) / MONEY_SCALE;

const practiceNotional = (priceE4, qtyE3, mode) => {
  if (priceE4 < MIN_PRICE_E4 || priceE4 > MAX_PRICE_E4) {
    throw new Error("practice-math: price out of bounds");
  }
  if (qtyE3 < 0 || qtyE3 > MAX_QTY_E3) {
    throw new Error("practice-math: quantity out of bounds");
  }
  return mulDiv(priceE4, qtyE3, NOTIONAL_DIVISOR, mode || ROUND_DOWN);
};

/* A rate applied to money, in parts per million. Fees and maintenance round
 * up; nothing that costs the user rounds down. */
const practiceRate = (moneyE2, ppm, mode) => mulDiv(moneyE2, ppm, RATE_SCALE, mode || ROUND_UP);

/* Quote money E2 <-> contract coin E8 at a price E4. The scale factor is
 * 1e10 and therefore routinely pushes the intermediate past a safe double;
 * `mulDiv`'s exact path is the reason these remain integer operations. */
const COIN_PRICE_DIVISOR = (COIN_SCALE * PRICE_SCALE) / MONEY_SCALE;
const practiceCoinForMoney = (moneyE2, priceE4, mode) => {
  if (!practiceIsInt(moneyE2) || !practiceIsInt(priceE4) || priceE4 < MIN_PRICE_E4) {
    throw new Error("practice-math: coin conversion out of bounds");
  }
  return mulDiv(moneyE2, COIN_PRICE_DIVISOR, priceE4, mode || ROUND_DOWN);
};
const practiceMoneyForCoin = (coinE8, priceE4, mode) => {
  if (!practiceIsInt(coinE8) || !practiceIsInt(priceE4) || priceE4 < MIN_PRICE_E4) {
    throw new Error("practice-math: money conversion out of bounds");
  }
  return mulDiv(coinE8, priceE4, COIN_PRICE_DIVISOR, mode || ROUND_DOWN);
};

/* Inverse P/L, in the settlement coin:
 *
 *   long  Q x (1 / entry - 1 / mark)
 *   short Q x (1 / mark  - 1 / entry)
 *
 * `entry * mark` can itself be beyond Number's exact range, so this is one
 * rational BigInt operation rather than two rounded conversions subtracted
 * afterwards. Gains round toward zero and losses away from zero — the same
 * conservative rule the linear model applies with ROUND_DOWN. */
const practiceInversePnl = (contractsE2, entryE4, markE4, side) => {
  if (
    !practiceIsInt(contractsE2) || contractsE2 < 0 ||
    !practiceIsInt(entryE4) || entryE4 < MIN_PRICE_E4 ||
    !practiceIsInt(markE4) || markE4 < MIN_PRICE_E4
  ) {
    throw new Error("practice-math: inverse P/L out of bounds");
  }
  const direction = side === "short" ? -1n : 1n;
  const numerator = BigInt(contractsE2) * BigInt(COIN_PRICE_DIVISOR)
    * BigInt(markE4 - entryE4) * direction;
  const denominator = BigInt(entryE4) * BigInt(markE4);
  let value = numerator / denominator;
  if (numerator < 0n && numerator % denominator !== 0n) value -= 1n;
  const out = Number(value);
  if (!Number.isSafeInteger(out)) {
    throw new Error("practice-math: result outside safe integer range");
  }
  return out;
};

/* A price moved adversely by a rate. `worse` decides which way "adverse"
 * points: a buy fills higher, a sell fills lower, and both round away from the
 * user so the model never hands back a fraction it did not earn. */
const practiceSlip = (priceE4, ppm, worse) => {
  const delta = mulDiv(priceE4, ppm, RATE_SCALE, worse ? ROUND_UP : ROUND_DOWN);
  const out = worse ? priceE4 + delta : priceE4 - delta;
  if (out < MIN_PRICE_E4) return MIN_PRICE_E4;
  if (out > MAX_PRICE_E4) return MAX_PRICE_E4;
  return out;
};

/* Formatting lives here so every surface prints a scaled integer the same
 * way. It returns a string and never a Number: re-parsing a formatted value
 * back into arithmetic is how a rounding contract gets bypassed.
 *
 * **The currency's own sign, and the sign before it.** These printed bare
 * numbers, so a screen full of money read `10,000.00` beside a `43,501.7400`
 * price and nothing said which was which — the only symbol on the whole
 * screen was the one set into the balance field. `-$1.43`, never `$-1.43`:
 * the minus belongs to the amount, not to the currency. The argument is
 * optional and defaults to nothing, because the model's own tests compare
 * these strings and a symbol is a property of a *screen*, not of an integer.
 */
/* **A unit written after the amount** is passed with a leading space
 * (`" USDT"`, see `practiceSymbolFor`): `-2.50 USDT`, the way a venue writes
 * a tether amount. A price never carries it — the quote currency of a market
 * is said once, not on every level — so `practicePriceText` drops it. */
const practiceUnitAfter = (symbol) => typeof symbol === "string" && symbol.charAt(0) === " ";
const withSign = (symbol, neg, body) =>
  practiceUnitAfter(symbol)
    ? `${neg ? "-" : ""}${body}${symbol}`
    : `${neg ? "-" : ""}${symbol || ""}${body}`;

const practiceMoneyText = (moneyE2, symbol) => {
  if (!practiceIsInt(moneyE2)) return withSign(symbol, false, "0.00");
  const neg = moneyE2 < 0;
  const abs = Math.abs(moneyE2);
  const whole = Math.floor(abs / MONEY_SCALE);
  const frac = String(abs % MONEY_SCALE).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return withSign(symbol, neg, `${grouped}.${frac}`);
};

/* The same amount, short enough for a chip. `100,000.00` is nine characters
 * on a control that has to sit three abreast; `100K` is the same fact. Only
 * used where the exact figure is a keystroke away in the field beside it. */
const practiceMoneyShort = (moneyE2, symbol) => {
  if (!practiceIsInt(moneyE2)) return withSign(symbol, false, "0");
  const whole = Math.abs(moneyE2) / MONEY_SCALE;
  const neg = moneyE2 < 0;
  for (const [at, suffix] of [[1e6, "M"], [1e3, "K"]]) {
    if (whole >= at) {
      const v = whole / at;
      return withSign(symbol, neg, `${v % 1 === 0 ? v : v.toFixed(1)}${suffix}`);
    }
  }
  return withSign(symbol, neg, `${whole % 1 === 0 ? whole : whole.toFixed(2)}`);
};

const practiceCoinText = (coinE8, coin) => {
  if (!practiceIsInt(coinE8)) return `0.00000000${coin ? ` ${coin}` : ""}`;
  const neg = coinE8 < 0;
  const abs = Math.abs(coinE8);
  const whole = Math.floor(abs / COIN_SCALE);
  const frac = String(abs % COIN_SCALE).padStart(8, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}.${frac}${coin ? ` ${coin}` : ""}`;
};

/* **A price is shown to the precision the instrument trades in, not to the
 * precision the model stores it at.** `PRICE_SCALE` is e4 because a
 * fraction-of-a-cent coin needs four places; printing all four for every coin
 * put `$112,536.2400` next to the header's `$112,480.00` and `$56,579.9999`
 * on the same card — three precisions for the same kind of number, and the
 * one that mattered was the hardest to read.
 *
 * The rule is the app's own (`formatWidgetPrice`): the decimals come from the
 * magnitude. Two places above $10, four below, so a $112k fill reads like
 * money and a $0.08 one still says something. Fixed rather than trimmed —
 * these sit in columns, and a trailing zero that comes and goes is worse than
 * a place that is always there.
 *
 * Rounded, never truncated: `$56,579.9999` printed as `$56,579.99` would name
 * a liquidation a cent below the real one. */
const PRICE_TEXT_SMALL = 10 * PRICE_SCALE;
const practicePriceText = (priceE4, sign) => {
  const symbol = practiceUnitAfter(sign) ? "" : sign;
  if (!practiceIsInt(priceE4)) return withSign(symbol, false, "0.00");
  const neg = priceE4 < 0;
  const abs = Math.abs(priceE4);
  const places = abs >= PRICE_TEXT_SMALL ? 2 : 4;
  const unit = places === 2 ? PRICE_SCALE / 100 : 1;
  const rounded = Math.round(abs / unit) * unit;
  const whole = Math.floor(rounded / PRICE_SCALE);
  const frac = String(rounded % PRICE_SCALE)
    .padStart(4, "0")
    .slice(0, places);
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return withSign(symbol, neg, `${grouped}.${frac}`);
};

const practiceQtyText = (qtyE3) => {
  if (!practiceIsInt(qtyE3)) return "0.000";
  const abs = Math.abs(qtyE3);
  return `${qtyE3 < 0 ? "-" : ""}${Math.floor(abs / QTY_SCALE)}.${String(abs % QTY_SCALE).padStart(3, "0")}`;
};

/* Node's test harness loads these files with `vm` the way `src/*.js` are
 * loaded, so there is no module system here on purpose: these are classic
 * script globals, exactly as they will be when they move into `src/`. */
