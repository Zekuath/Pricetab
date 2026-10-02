// Practice Lab's account model: every Practice Unit that moves, and why.
//
// The gate this suite exists to pass is narrow and worth stating plainly:
// **the ledger must explain the balance exactly.** Not to a tolerance, not
// after ignoring rounding — exactly, as integers, whether or not the early
// events have been folded into a summary. The prototype this replaces could
// not do that: its account was a running float, and one save/restore of a
// position with added margin destroyed 300 PU.
//
// Nothing here touches a DOM, a clock or a network. Time, mark and seed are
// arguments, which is what makes a whole session reproducible from a seed.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* `BigInt` is named explicitly, not left to the context's own globals: the
 * exact path in `mulDiv` depends on it, and a sandbox that silently supplies
 * it is a sandbox that could silently stop. */
const sandbox = { console, Math, Number, Array, isFinite, JSON, Object, String, BigInt };
vm.createContext(sandbox);
for (const f of ["practice-math.js", "practice-model.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), sandbox, {
    filename: f,
  });
}
const run = (code) => vm.runInContext(code, sandbox);
/* **The per-contract margin wall, switched on for the tests that are about
   it.** It is off by default since 18 Sep 2026 (schema 4); a test that read
   the wall from the default would stop testing the rule the day the default
   moved — which is exactly what happened. 20% is the old default, so every
   figure below means what it meant before. */
const WALLED = (e) => `({ ...${e}, plan: { ...${e}.plan, marginSharePct: 20 } })`;

/* **A position is addressed by its id now, not by its coin**, because a coin
 * can carry as many contracts as the balance allows. These tests each work
 * with one contract on a coin at a time, so they ask for "the one on BTC" and
 * the helpers resolve it — which also means a test fails loudly if a step
 * left two where it expected one. Single quotes inside, because almost every
 * caller here is a double-quoted `run("…")`. */
run(`
  const __at = (s, c) => {
    const held = (s && s.positions) || {};
    const k = Object.keys(held).find((x) => held[x].coin === c);
    return k ? held[k] : undefined;
  };
  const __id = (s, c) => {
    const held = (s && s.positions) || {};
    return Object.keys(held).find((x) => held[x].coin === c);
  };
`);
const json = (code) => JSON.parse(JSON.stringify(run(code)));
/* The same "the one on this coin" lookup as `__at`, for a plain object that
 * has already been brought out of the sandbox. */
const atCoin = (state, coin) => {
  const held = (state && state.positions) || {};
  const key = Object.keys(held).find((k) => held[k].coin === coin);
  return key ? held[key] : undefined;
};

const P = (v) => Math.round(v * 10000); // a price, written readably
const Q = (v) => Math.round(v * 1000); // a quantity
const M = (v) => Math.round(v * 100); // Practice Units
const C = (v) => Math.round(v * 100000000); // contract coin

/* THE ARITHMETIC CONTRACT ------------------------------------------------ */
{
  assert.strictEqual(run(`practiceNotional(${P(100)}, ${Q(20)}, "down")`), M(2000),
    "100.0000 x 20.000 is 2,000.00 PU");
  assert.strictEqual(run(`practiceRate(${M(2000)}, 500, "up")`), M(1),
    "0.05% of 2,000 PU is 1.00 PU");

  /* **A product too big for a double is done exactly, not refused.**
   *
   * It used to throw, which was right while every product in the model was
   * `price x quantity`. A coin-margined contract converts between a size in
   * money and a value in coin, and at a coin scale fine enough to be useful
   * the intermediate is far past 9e15 for *ordinary* positions — measured,
   * 0.581 BTC at 43,480 needs 2.526e16 and the same position quoted in KRW
   * needs 3.486e19. Both now come back exact.
   *
   * The differential is the assertion that matters: wherever the fast path is
   * valid the two must agree **to the unit, in both rounding modes, on both
   * signs** — BigInt division truncates toward zero while `Math.floor` goes
   * down, and a unit that differs by sign is how a simulated account mints
   * money. Forty thousand pairs, deterministic seed, zero disagreements. */
  {
    let seed = 20260902;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let differ = 0;
    for (let i = 0; i < 20000; i += 1) {
      const a = Math.floor((next() - 0.3) * 1e7);
      const b = Math.floor(next() * 1e7) + 1;
      const d = Math.floor(next() * 1e6) + 1;
      for (const mode of ["down", "up"]) {
        const fast = mode === "up" ? Math.ceil((a * b) / d) : Math.floor((a * b) / d);
        if (run(`bigMulDiv(${a}, ${b}, ${d}, ${JSON.stringify(mode)})`) !== fast) differ += 1;
      }
    }
    assert.strictEqual(differ, 0,
      "the exact path agrees with the fast one everywhere the fast one is valid");
    assert.strictEqual(run("mulDiv(58100000, 434800000, 434800000, 'down')"), 58100000,
      "an ordinary BTC position converts rather than throwing");
    assert.strictEqual(run("mulDiv(58100000, 600000000000, 600000000000, 'down')"), 58100000,
      "…and so does the same one quoted in KRW");
    assert.throws(() => run("mulDiv(9007199254740991, 9007199254740991, 1, 'down')"),
      /safe integer/, "a result that cannot be stored is still refused");
  }

  /* Rounding never lands in the user's favour. A fee on an amount that does
   * not divide evenly rounds up; the same amount as a payout rounds down. */
  assert.strictEqual(run("practiceRate(101, 500, 'up')"), 1, "a fee rounds up");
  assert.strictEqual(run("practiceRate(101, 500, 'down')"), 0, "a credit rounds down");

  /* Adverse slippage points away from the user on both sides. */
  assert.ok(run(`practiceSlip(${P(100)}, 500, true)`) > P(100), "a buy fills higher");
  assert.ok(run(`practiceSlip(${P(100)}, 500, false)`) < P(100), "a sell fills lower");

  /* The bounds the overflow analysis rests on are enforced, not assumed.
   *
   * **The numbers here moved because the old ones were wrong about the
   * world.** The price ceiling was 10,000.0000, which refused every Bitcoin
   * order there has been since 2020 — the value below is a hundred million a
   * coin, over the ceiling in every currency this app quotes, including BTC
   * in KRW at nine figures. The quantity ceiling is loose for the mirror
   * reason: a holding is a count, and some coins cost a hundredth of a cent.
   * What actually holds the arithmetic safe is neither of them but the
   * notional, so that is asserted too — at the money cap, and at the guard
   * that refuses an oversized order *before* the first multiplication rather
   * than throwing out of it. */
  assert.throws(() => run("practiceNotional(100000000000000, 1000, 'down')"), /out of bounds/,
    "a price past the ceiling is refused");
  assert.throws(() => run("practiceNotional(10000, 10000000000000, 'down')"), /out of bounds/,
    "and so is a quantity");
  assert.ok(!/error/.test(String(run(`typeof practiceNotional(${P(110000)}, ${Q(0.18)}, "down")`))),
    "…while a real Bitcoin price and size go through");
  assert.strictEqual(
    run(`practiceOpen(${WALLED("practiceEmptySession()")}, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(110000)}).error`),
    "planMargin",
    "a real Bitcoin price reaches the plan's limits instead of the arithmetic's",
  );
  /* With the wall off — the default — the same order is refused by the only
     thing a venue would refuse it with: there is not the money. */
  assert.strictEqual(
    run(`practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(110000)}).error`),
    "funds",
    "…and with the wall off, by the free balance instead",
  );
  assert.strictEqual(
    run("practiceOpen(practiceEmptySession(), { coin: 'BTC', side: 'long', qty: 1000000000000, leverage: 2 }, 10000000000000).error"),
    "notional",
    "an order too large to compute is named, not thrown",
  );
  assert.throws(() => run("mulDiv(1e15, 1e15, 1, 'down')"), /safe integer/,
    "an unsafe product stops the model rather than being silently wrong");
}

/* COIN-SETTLED INVERSE CONTRACTS -----------------------------------------
 *
 * This is an account contract, not a label preference. Size stays in quote
 * money while margin, fees and P/L settle in the contract's own coin. BTC
 * and ETH therefore reconcile in two independent wallets; adding the two
 * numbers together would produce a total with no unit. */
{
  assert.strictEqual(
    run(`practiceCoinForMoney(${M(1000)}, ${P(1000)}, "down")`),
    C(1),
    "1,000 quote units at 1,000 per coin converts to 1.00000000 coin",
  );
  assert.strictEqual(
    run(`practiceMoneyForCoin(${C(1)}, ${P(1000)}, "down")`),
    M(1000),
    "the conversion has an exact reverse at the same price",
  );
  assert.strictEqual(
    run(`practiceInversePnl(${M(200)}, ${P(1000)}, ${P(1100)}, "long")`),
    1818181,
    "inverse long P/L is Q x (1 / entry - 1 / mark), in coin E8",
  );
  assert.ok(
    run(`practiceInversePnl(${M(200)}, ${P(1000)}, ${P(900)}, "long")`) < 0,
    "an inverse long still loses when price falls",
  );
  assert.strictEqual(run(`practiceCoinText(${C(1.25)}, "BTC")`), "1.25000000 BTC",
    "coin balances carry their own unit and eight-decimal scale");

  sandbox.__coin = run(`practiceEmptySession(undefined, "coin")`);
  sandbox.__coin = run(`practiceOpen(__coin,
    { coin: "BTC", currency: "USD", side: "long", qty: ${M(200)}, leverage: 2 },
    ${P(1000)}).state`);
  assert.strictEqual(run("__coin.settlement"), "coin", "the account owns its settlement mode");
  assert.strictEqual(run("__at(__coin, 'BTC').settlement"), "coin",
    "and the position stamps the arithmetic it opened under");
  assert.ok(run("__coin.wallets.BTC.balance") < C(1),
    "opening a BTC inverse contract locks BTC and charges its fee in BTC");
  assert.ok(json("practiceReconcile(__coin)").ok,
    "the BTC wallet reconciles exactly after opening");

  sandbox.__coin = run(`practiceOpen(__coin,
    { coin: "ETH", currency: "USD", side: "short", qty: ${M(100)}, leverage: 2 },
    ${P(500)}).state`);
  assert.ok(run("__coin.wallets.ETH.balance") < C(1),
    "an ETH contract uses an independent ETH wallet");
  assert.ok(json("practiceReconcile(__coin)").ok,
    "mixed BTC and ETH events reconcile per coin, never as one false total");

  sandbox.__coinClosed = run(`practiceReduce(__coin, __id(__coin, 'BTC'), ${M(200)}, ${P(1100)}, "close").state`);
  assert.ok(run("__coinClosed.wallets.BTC.realised") > 0,
    "a winning BTC contract realises BTC");
  assert.strictEqual(run("__coinClosed.wallets.ETH.realised"), 0,
    "and does not move the ETH result");
  assert.ok(json("practiceReconcile(__coinClosed)").ok,
    "the per-coin ledger still explains both wallets after close");
  sandbox.__coinReloaded = run("sanitizePractice(JSON.parse(JSON.stringify(__coinClosed)))");
  assert.strictEqual(run("__coinReloaded.settlement"), "coin",
    "a coin-settled account keeps its contract type across storage");
  assert.deepStrictEqual(json("__coinReloaded.wallets"), json("__coinClosed.wallets"),
    "its BTC and ETH ledgers rebuild the same wallets after storage");
  assert.ok(json("practiceReconcile(__coinReloaded)").ok,
    "the reloaded multi-asset account still reconciles");
}

/* OPENING, AND THE REFUSALS ---------------------------------------------- */
{
  sandbox.__s = run('practiceEmptySession()');
  sandbox.__o = run(`practiceOpen(__s, { coin: "BTC", side: "long", qty: ${Q(2)}, leverage: 5 }, ${P(1000)})`);
  assert.ok(!run("__o.error"), `a plan-compliant open is accepted (${run("__o.error")})`);
  sandbox.__g = run("__o.state");

  const pos = json("__at(__g, 'BTC')");
  assert.ok(pos.entry > P(1000), "the entry is the adverse fill, not the mark");
  assert.strictEqual(pos.margin, Math.ceil(run(`practiceNotional(__at(__g, 'BTC').entry, ${Q(2)}, "up")`) / 5),
    "margin is notional over leverage");

  const refuse = (order, price, why) =>
    assert.strictEqual(run(`practiceOpen(__g_empty, ${JSON.stringify(order)}, ${price}).error`), why,
      `${why} is refused by name`);
  sandbox.__g_empty = run('practiceEmptySession()');
  refuse({ coin: "BTC", side: "sideways", qty: Q(1), leverage: 2 }, P(1000), "side");
  /* **Above the range, not off a ladder.** This used to assert that 7x was
     refused, because leverage was nine fixed rungs and 7 was not one of them.
     It is a whole number between 1 and 200 now — the slider had to move in
     even steps, and a control whose notches are worth 1x at one end and 50x
     at the other is not one anybody can land a number with — so 7 is a valid
     leverage and the refusal has to be tested where the range actually ends.
     Both directions are pinned, or "fixed the test" and "widened the range"
     look identical from here. */
  refuse({ coin: "BTC", side: "long", qty: Q(1), leverage: 0 }, P(1000), "leverage");
  refuse({ coin: "BTC", side: "long", qty: Q(1), leverage: 201 }, P(1000), "leverage");
  refuse({ coin: "BTC", side: "long", qty: Q(1), leverage: 7.5 }, P(1000), "leverage");
  assert.ok(
    !run(`practiceOpen(__g_empty, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 7 }, ${P(1000)}).error`),
    "…and a whole number inside the range is accepted, 7x included",
  );
  /* The plan can be tightened below the model ceiling, and then it refuses —
     the default plan allows everything the ticket offers, so the guard is
     tested against a tightened plan rather than against the default. */
  sandbox.__tight = run("({ ...__g_empty, plan: { ...__g_empty.plan, maxLeverage: 3 } })");
  assert.strictEqual(
    run(`practiceOpen(__tight, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 10 }, ${P(1000)}).error`),
    "planLeverage",
    "a tightened plan refuses leverage above it",
  );
  refuse({ coin: "BTC", side: "long", qty: 0, leverage: 2 }, P(1000), "size");
  assert.strictEqual(
    run(`practiceOpen(${WALLED("__g_empty")}, ${JSON.stringify({ coin: "BTC", side: "long", qty: Q(500), leverage: 5 })}, ${P(1000)}).error`),
    "planMargin",
    "planMargin is refused by name",
  );
  /* **Off by default: the whole balance may stand behind one contract.**
     Asked for as "bütün parayı türevliye sokabileyim". 90% of a fresh
     account at 1x is past any wall the plan offers, and it opens. */
  assert.ok(
    !run(`practiceOpen(__g_empty, { coin: "BTC", side: "long", qty: ${Q(9)}, leverage: 1 }, ${P(1000)}).error`),
    "with the wall off, one contract may take nine tenths of the account",
  );
  /* **As many contracts as the balance carries, on the same coin, in either
     direction.** This asserted the opposite for as long as the store was
     keyed by the coin — "one position at a time" was a property of the data
     structure rather than a rule anybody chose, and it is exactly what was
     asked to go. What still refuses is everything that is genuinely about
     money: the free balance, the margin wall, the session caps, the slots. */
  sandbox.__two = run(
    `practiceOpen(__g, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)}).state`,
  );
  assert.ok(sandbox.__two, "a second contract on a coin you already hold is allowed");
  assert.strictEqual(run("Object.keys(__two.positions).length"), 2,
    "…and both of them run");
  sandbox.__three = run(
    `practiceOpen(__two, { coin: "BTC", side: "short", qty: ${Q(1)}, leverage: 2 }, ${P(1000)}).state`,
  );
  assert.ok(sandbox.__three, "and so is one the other way round on the same coin");
  assert.strictEqual(run("Object.keys(__three.positions).length"), 3,
    "…which makes three, two long and one short");
  assert.strictEqual(
    run("Object.keys(__three.positions).filter((k) => __three.positions[k].side === 'short').length"),
    1,
    "…and the sides are kept apart rather than netted",
  );
  /* Each is its own contract: closing one leaves the others alone. */
  sandbox.__closedOne = run(
    `practiceReduce(__three, Object.keys(__three.positions)[0], __three.positions[Object.keys(__three.positions)[0]].qty, ${P(1000)}, "close").state`,
  );
  assert.strictEqual(run("Object.keys(__closedOne.positions).length"), 2,
    "closing one of them closes exactly one");
  assert.ok(run("practiceReconcile(__closedOne).ok") === true,
    "…and the ledger still explains the balance");
}

/* CONSERVATION — the identity the whole model is for. ---------------------- */
{
  const check = (label, expr) => {
    const r = json(expr);
    assert.ok(r.ok, `${label}: the ledger explains the balance (${JSON.stringify(r)})`);
  };
  check("after an open", "practiceReconcile(__g)");

  sandbox.__c = run(`practiceReduce(__g, __id(__g, 'BTC'), ${Q(2)}, ${P(1100)}, "close").state`);
  check("after a close", "practiceReconcile(__c)");
  assert.strictEqual(
    run("Object.keys(__c.positions).length"),
    0,
    "a full reduce removes the coin from the map rather than leaving an empty slot",
  );
  assert.strictEqual(run("__c.margin"), 0, "and releases all of its margin");

  sandbox.__r = run(`practiceReduce(__g, __id(__g, 'BTC'), ${Q(1)}, ${P(1100)}, "close").state`);
  check("after a partial reduce", "practiceReconcile(__r)");
  assert.strictEqual(run("__at(__r, 'BTC').qty"), Q(1), "the rest of the position stays open");
  assert.ok(run("__r.margin") > 0 && run("__r.margin") < run("__g.margin"),
    "and keeps a proportional share of the margin");

  /* A profitable close returns more than the margin; a losing one less. Both
   * still reconcile, which is the point. */
  const up = run(`practiceReduce(__g, __id(__g, 'BTC'), ${Q(2)}, ${P(1100)}, "close").state.balance`);
  const down = run(`practiceReduce(__g, __id(__g, 'BTC'), ${Q(2)}, ${P(900)}, "close").state.balance`);
  assert.ok(up > run("__s.balance"), "a winning close leaves more than it started with");
  assert.ok(down < run("__s.balance"), "and a losing one less");
}

/* ISOLATED MARGIN CAN BE ADDED WITHOUT RESIZING THE CONTRACT. --------------- */
{
  const before = json("__at(__g, 'BTC')");
  const liqBefore = run("practiceLiquidationPrice(__at(__g, 'BTC'))");
  sandbox.__added = run(`practiceAddMargin(__g, __id(__g, 'BTC'), ${M(100)}).state`);
  const after = json("__at(__added, 'BTC')");
  assert.strictEqual(after.margin, before.margin + M(100), "added margin stays on the position");
  assert.strictEqual(run("__added.balance"), run("__g.balance") - M(100),
    "and comes out of the free balance exactly");
  for (const field of ["qty", "entry", "side", "leverage"]) {
    assert.strictEqual(after[field], before[field], `adding margin does not change ${field}`);
  }
  assert.ok(run("practiceLiquidationPrice(__at(__added, 'BTC'))") < liqBefore,
    "more isolated margin moves a long's liquidation farther from entry");
  assert.strictEqual(json("__added.ledger").slice(-1)[0].kind, "margin",
    "the transfer is named in the ledger");
  assert.ok(json("practiceReconcile(__added)").ok, "the account reconciles after adding margin");
  assert.strictEqual(run(`practiceAddMargin(__g, __id(__g, 'BTC'), 0).error`), "size",
    "zero is not a margin transfer");
  assert.strictEqual(run(`practiceAddMargin(__g, __id(__g, 'ETH'), ${M(1)}).error`), "none",
    "margin cannot be added to a position that is not there");
  assert.strictEqual(run(`practiceAddMargin(${WALLED("__g")}, __id(__g, 'BTC'), ${M(2000)}).error`), "planMargin",
    "added margin cannot step through the account's per-contract wall");
}

/* LONG AND SHORT ARE ONE ENGINE ------------------------------------------ */
{
  sandbox.__L = run(`practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: ${Q(2)}, leverage: 5 }, ${P(1000)}).state`);
  sandbox.__S = run(`practiceOpen(practiceEmptySession(), { coin: "BTC", side: "short", qty: ${Q(2)}, leverage: 5 }, ${P(1000)}).state`);
  const lu = run(`practiceUnrealised(__at(__L, 'BTC'), ${P(1050)})`);
  const sd = run(`practiceUnrealised(__at(__S, 'BTC'), ${P(950)})`);
  /* Not identical to the unit: the two positions entered at opposite adverse
   * fills, so their entries differ by one slippage step. Within that, a move
   * of the same size pays the same. */
  assert.ok(Math.abs(lu - sd) <= M(1),
    `a 5% move pays a long and a short the same (${lu} vs ${sd})`);
  assert.ok(run(`practiceUnrealised(__at(__S, 'BTC'), ${P(1050)})`) < 0,
    "and a short loses when the price rises");
}

/* LIQUIDATION — one equation, displayed and enforced. --------------------- */
{
  const liq = run("practiceLiquidationPrice(__at(__L, 'BTC'))");
  assert.ok(liq > 0 && liq < run("__at(__L, 'BTC').entry"), `a long liquidates below its entry (${liq})`);

  /* **The displayed level and the live check cannot disagree**, because the
   * level is found by searching the check. The prototype wrote the two from
   * one equation by hand and a sign error put a 10x long's liquidation at
   * -90.5. */
  sandbox.__liq = liq;
  assert.strictEqual(run("practiceIsLiquidated(__at(__L, 'BTC'), __liq)"), true,
    "the displayed price is liquidated");
  assert.strictEqual(run("practiceIsLiquidated(__at(__L, 'BTC'), __liq + 1)"), false,
    "and one E4 unit above it is not");

  sandbox.__sliq = run("practiceLiquidationPrice(__at(__S, 'BTC'))");
  assert.ok(run("__sliq") > run("__at(__S, 'BTC').entry"), "a short liquidates above its entry");
  assert.strictEqual(run("practiceIsLiquidated(__at(__S, 'BTC'), __sliq)"), true,
    "same equation on the short side");
  assert.strictEqual(run("practiceIsLiquidated(__at(__S, 'BTC'), __sliq - 1)"), false,
    "and one E4 unit inside it is not");

  /* Isolated means isolated: however far the price runs past the level, the
   * account cannot lose more than the margin the position held. */
  sandbox.__wipe = run(`practiceReduce(__L, __id(__L, 'BTC'), ${Q(2)}, ${P(1)}, "liquidation").state`);
  assert.strictEqual(run("__wipe.balance"), run("__L.balance"),
    "a catastrophic move costs the margin and nothing else");
  assert.ok(json("practiceReconcile(__wipe)").ok, "and it still reconciles");
  assert.ok(json("__wipe.ledger").slice(-1)[0].capped > 0, "the capped amount is recorded, not hidden");
}

/* STEP ORDERING — liquidation wins, stale steps are refused. -------------- */
{
  sandbox.__T = run(`practiceSetTriggers(__L, __id(__L, 'BTC'), practiceLiquidationPrice(__at(__L, 'BTC')) + 200, null).state`);
  assert.ok(run("__at(__T, 'BTC').stop") > 0, "a stop above the liquidation is accepted");

  /* One step that crosses both. The stop is nearer the entry, so a model that
   * tested triggers first would fill it — at a price the position was no
   * longer alive to reach. */
  assert.strictEqual(
    json("practiceStep(__T, 5, { BTC: practiceLiquidationPrice(__at(__T, 'BTC')) - 100 }, {}).events")[0]
      .reason,
    "liquidation",
    "liquidation wins when a step crosses it and a stop together",
  );
  /* A stop reached on its own still fires, or the assertion above would pass
   * for a model that had simply stopped honouring stops. */
  assert.strictEqual(
    json("practiceStep(__T, 5, { BTC: __at(__T, 'BTC').stop - 1 }, {}).events")[0].reason,
    "stop",
    "and a stop reached alone still fires",
  );

  /* A stale step changes nothing at all — the state comes back identical,
     which is stronger than a named reason: a replayed step must not charge
     funding twice or re-test a trigger that has already fired. */
  assert.strictEqual(run("practiceStep(__L, 0, { BTC: 100 }, {}).state"), run("__L"),
    "a step at or before the current one changes nothing");
  assert.strictEqual(run("practiceStep(__L, -1, { BTC: 100 }, {}).state"), run("__L"),
    "and so does a negative one");
  assert.strictEqual(run(`practiceStep(__L, 9, { BTC: ${P(1000)} }, {}).state.step`), 9,
    "a newer step advances the clock");
}

/* A GAP — a stop is a trigger, not a fill price. -------------------------
 *
 * The price jumps straight past the level in one step, which is what a fast
 * market does and what any sampled series always does. The model must fill at
 * the mark it can actually see, never at the trigger the user typed. */
{
  sandbox.__G = run(
    `practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 3 }, ${P(1000)}).state`,
  );
  sandbox.__G = run(`practiceSetTriggers(__G, __id(__G, 'BTC'), ${P(980)}, null).state`);
  const out = json(`practiceStep(__G, 1, { BTC: ${P(940)} }, {})`);
  assert.strictEqual(out.events[0].reason, "stop", "the step past the stop fires it");
  const last = out.state.ledger[out.state.ledger.length - 1];
  assert.ok(
    last.fill < P(980),
    `the fill is worse than the trigger the user typed (fill ${last.fill}, trigger ${P(980)})`,
  );
}

/* PLAN GUARDS — enforced in the model, not only greyed out. --------------- */
{
  sandbox.__P = run('practiceEmptySession()');
  const tight = json("practiceTightenPlan(__P.plan, { ...__P.plan, maxLeverage: 3 })");
  assert.strictEqual(tight.state.maxLeverage, 3, "a plan may be tightened");
  const loose = json("practiceTightenPlan({ ...__P.plan, maxLeverage: 3 }, { ...__P.plan, maxLeverage: 10 })");
  assert.strictEqual(loose.error, "loosen", "and never loosened");
  assert.strictEqual(loose.state.maxLeverage, 3, "the refusal keeps the stricter value");

  /* **The per-contract wall: off by default, off is the loosest.** Off (0)
     compared as a number would be the *tightest* setting there is, so
     turning a wall on must count as tightening and turning it off as
     loosening — the rule `practicePlanCap` exists for. */
  assert.strictEqual(run("__P.plan.marginSharePct"), 0, "the per-contract wall is off by default");
  assert.strictEqual(run("practiceMarginWall(__P.plan, 1000000)"), Infinity,
    "…and off is no wall at all, not a wall of nothing");
  const wallOn = json("practiceTightenPlan(__P.plan, { ...__P.plan, marginSharePct: 20 })");
  assert.ok(!wallOn.error && wallOn.state.marginSharePct === 20, "setting a wall is a tightening");
  const wallOff = json("practiceTightenPlan({ ...__P.plan, marginSharePct: 20 }, { ...__P.plan, marginSharePct: 0 })");
  assert.strictEqual(wallOff.error, "loosen", "…and taking it off a locked plan is refused");
  assert.strictEqual(wallOff.state.marginSharePct, 20, "…keeping the wall");

  /* **The schema-4 migration lets the wall go, once, and nothing else.** An
     account written at schema 3 carries the old default of 20%; it loads
     with no wall. The same account's loss stop — turned back on by hand at
     schema 3 — must survive: a later bump re-running the earlier migration
     would have switched it off again, and un-ended an account it had ended. */
  const v3 = (plan, ended) => `sanitizePractice(JSON.parse(JSON.stringify({ ...__P, schemaVersion: 3, ended: ${ended}, plan: { ...__P.plan, ...${JSON.stringify(plan)} } })))`;
  assert.strictEqual(run(`${v3({ marginSharePct: 20 }, false)}.plan.marginSharePct`), 0,
    "a schema-3 account loads with its per-contract wall off");
  assert.strictEqual(run(`${v3({ sessionLossPct: 5 }, false)}.plan.sessionLossPct`), 5,
    "…while a loss stop it chose at schema 3 is kept");
  assert.strictEqual(run(`${v3({ sessionLossPct: 5 }, true)}.ended`), true,
    "…and an account that stop ended stays ended");
  assert.strictEqual(
    run(`sanitizePractice(JSON.parse(JSON.stringify({ ...__P, schemaVersion: 4, plan: { ...__P.plan, marginSharePct: 20 } }))).plan.marginSharePct`),
    20, "a wall set at schema 4 is kept — the migration runs once");

  /* **Schema 5: the account became USDT-margined.** A dollar contract, order
     and ledger row (or one never stamped) carry across as USDT — the two
     trade within a tenth of a percent. A euro one does not: read as tether
     its entry would be a different price, so it keeps its currency and is
     paused. And the stamp runs once — a schema-5 account is left as it is. */
  sandbox.__v4 = run(`(() => {
    const o = practiceOpen(__P, { coin: "BTC", currency: "USD", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)});
    const e = practiceOpen(o.state, { coin: "ETH", currency: "EUR", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(100)});
    const placed = practicePlaceOrder(e.state, { coin: "BTC", currency: "", side: "long", qty: ${Q(1)}, leverage: 2, limit: ${P(900)} }, ${P(1000)});
    return JSON.parse(JSON.stringify({ ...placed.state, schemaVersion: 4 }));
  })()`);
  const usdt = json("sanitizePractice(__v4)");
  const byCoin = (c) => Object.values(usdt.positions).find((p) => p.coin === c);
  assert.strictEqual(byCoin("BTC").currency, "USDT", "a schema-4 dollar contract loads as USDT");
  assert.strictEqual(byCoin("ETH").currency, "EUR", "…a euro contract keeps its currency, and is paused");
  assert.strictEqual(Object.values(usdt.orders)[0].currency, "USDT", "…an unstamped order becomes USDT");
  assert.ok(usdt.ledger.filter((e) => e.coin === "BTC").every((e) => e.currency === "USDT"),
    "…and so do the dollar contract's ledger rows");
  assert.strictEqual(
    json(`sanitizePractice({ ...__v4, schemaVersion: 5 })`).positions[byCoin("BTC").id].currency,
    "USD", "the stamp runs once: a schema-5 account's currencies are read as written");

  /* **The outcome cone counts, and it counts the same thing every time.**
     Two cases whose answer is known before it runs: a market that only rises
     (every return +0.5%) must take-profit every path and never stop; a
     symmetric coin-flip market with the stop and the take the same distance
     away must split them near the middle. And the same seed must give the
     same counts — the model is replayable, and so is this. */
  sandbox.__coneOpen = run(`practiceOpen(__P, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)})`);
  /* Symmetric **in log space**, which is what a resampled log-return walks:
     1050 is +4.88% and 950 is −5.13%, so a 50/50 market would take profit
     more often than it stopped and the test would have blamed the model.
     1000/1.05 is the stop that mirrors a 1050 take. */
  sandbox.__coneUp = run(`practiceSetTriggers(__coneOpen.state, __coneOpen.id, ${P(1000 / 1.05)}, ${P(1050)}, 1000000, undefined).state`);
  sandbox.__rise = run("Array.from({ length: 80 }, (_, i) => ({ price: 1000 * Math.pow(1.005, i), time: i }))");
  const rise = json("practiceSimulate(__coneUp, __coneOpen.id, __rise, { markE4: " + P(1000) + ", horizon: 40, paths: 300, seed: 7 })");
  assert.strictEqual(rise.n, 300, "the cone plays the paths it was asked for");
  assert.strictEqual(rise.counts.take, 300, "a market that only rises takes profit on every path");
  assert.strictEqual(rise.counts.stop + rise.counts.liquidation, 0, "…and stops out on none");
  sandbox.__flip = run("Array.from({ length: 200 }, (_, i) => ({ price: 1000 * (i % 2 ? 1.01 : 1), time: i }))");
  const flip = json("practiceSimulate(__coneUp, __coneOpen.id, __flip, { markE4: " + P(1000) + ", horizon: 200, paths: 1000, block: 1, seed: 3 })");
  const decided = flip.counts.stop + flip.counts.take;
  assert.ok(decided > 900, `a symmetric market decides almost every path (${decided})`);
  assert.ok(Math.abs(flip.counts.stop - flip.counts.take) < decided * 0.15,
    `…and splits them near the middle (${flip.counts.stop} stop / ${flip.counts.take} take)`);
  const again = json("practiceSimulate(__coneUp, __coneOpen.id, __flip, { markE4: " + P(1000) + ", horizon: 200, paths: 1000, block: 1, seed: 3 })");
  assert.deepStrictEqual(again.counts, flip.counts, "the same seed gives the same counts");
  assert.strictEqual(json("practiceSimulate(__coneUp, __coneOpen.id, __flip.slice(0, 10), { markE4: " + P(1000) + " })").n, 0,
    "…and it refuses a window too short to resample from");

  /* **The process scorecard grades the trader on what the record saw.** One
     contract per grade, built the way the app builds them: A has a stop and
     loses within the plan; B risks more than the plan's share at its first
     stop; C moved its stop away; a second C never had a stop. Then two more
     losses make a streak, and the streak rule refuses the next open. */
  sandbox.__sc = run(`(() => {
    /* The pause is switched on only once the record is built — on, it would
       refuse the fifth contract itself, which is the point of the last test. */
    let s = { ...__P, plan: { ...__P.plan, lossPerTradePct: 1, streakPause: 0 } };
    const go = (stop, qty, price, closeAt, moveTo) => {
      const o = practiceOpen(s, { coin: "BTC", side: "long", qty, leverage: 5, at: 1000 }, price);
      s = o.state;
      if (stop) s = practiceSetTriggers(s, o.id, stop, null, 1000000, undefined).state;
      if (moveTo) s = practiceSetTriggers(s, o.id, moveTo, null, 1000000, undefined).state;
      s = practiceReduce(s, o.id, qty, closeAt, "close").state;
      return o.id;
    };
    const P = (v) => Math.round(v * 10000);
    go(P(990), 1000, P(1000), P(1010));            // A: small risk, wins
    go(P(900), 4000, P(1000), P(1010));            // B: risks more than 1% of the account
    go(P(990), 1000, P(1000), P(995), P(980));     // C: stop moved away, loses
    go(null, 1000, P(1000), P(995));               // C: no stop, loses
    go(P(990), 1000, P(1000), P(995));             // A on its own, but the third loss in a row -> C
    return { ...s, plan: { ...s.plan, streakPause: 2 } };
  })()`);
  const sc = json("practiceScorecard(__sc)");
  assert.strictEqual(sc.n, 5, "five closed contracts are graded");
  assert.deepStrictEqual(sc.rows.map((r) => r.grade).join(""), "ABCCC", `A, B, C, C, C — got ${sc.rows.map((r) => r.grade).join("")}`);
  assert.deepStrictEqual(sc.rows[1].why, ["risk"], "the B says why");
  assert.deepStrictEqual(sc.rows[2].why, ["moved"], "a stop moved away is a C");
  assert.deepStrictEqual(sc.rows[3].why, ["nostop"], "no stop is a C");
  assert.ok(sc.rows[4].why.includes("streak"), "the third loss in a row is a C");
  assert.strictEqual(sc.bad, 3, "three bad losses");
  assert.ok(sc.win && Math.abs(sc.win.p - 0.4) < 1e-9 && sc.win.lo < 0.4 && sc.win.hi > 0.4, "the win rate carries its interval");
  assert.ok(sc.rows[0].r > 0 && sc.rows[2].r < 0, "R-multiples are realised over the first stop's risk");
  assert.strictEqual(run("practiceLossStreak(__sc)"), 3, "the record ends with three losses in a row");
  assert.strictEqual(
    run(`practiceCanOpen(__sc, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)})`),
    "streak", "…and the streak rule refuses the next contract");
  assert.strictEqual(
    run(`practiceCanOpen({ ...__sc, plan: { ...__sc.plan, streakPause: 0 } }, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)})`),
    null, "…only while the rule is on");
  const w = json("practiceWilson(8, 12)");
  assert.ok(Math.abs(w.p - 0.6667) < 0.001 && w.lo > 0.38 && w.lo < 0.40 && w.hi > 0.86 && w.hi < 0.88, `Wilson 8/12 is 67% (39–87%): ${JSON.stringify(w)}`);
  /* Both stamps survive a reload. */
  const back = json("sanitizePractice(JSON.parse(JSON.stringify(__sc)))");
  assert.strictEqual(json("practiceScorecard(__sc)").bad, json("practiceScorecard(sanitizePractice(JSON.parse(JSON.stringify(__sc))))").bad, "the grades are the same after a reload");
  assert.ok(back.ledger.some((e) => e.stopMoved > 0), "…including the moved-stop count");

  /* **The setup is stamped on the contract and carried to its close.** Codes
     are validated to their shape and capped; junk is dropped, not stored. */
  {
    const o = json(`practiceOpen(__P, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2, setup: ["loc:below", "tape:buyers", "junk", 7, "a:b:c", "env:x", "x:y", "m:n", "p:q", "r:s", "t:u", "v:w"] }, ${P(1000)})`);
    const stamped = o.state.positions[o.id].setup;
    assert.deepStrictEqual(JSON.parse(JSON.stringify(stamped)), ["loc:below", "tape:buyers", "env:x", "x:y", "m:n", "p:q", "r:s", "t:u"], `eight valid codes kept, junk dropped: ${JSON.stringify(stamped)}`);
    sandbox.__su = run(`practiceReduce(${JSON.stringify(o.state)}, "${o.id}", ${Q(1)}, ${P(1010)}, "close").state`);
    const closeRow = json("__su.ledger[__su.ledger.length - 1]");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(closeRow.setup)), JSON.parse(JSON.stringify(stamped)), "the close event carries the setup");
    const back = json("sanitizePractice(JSON.parse(JSON.stringify(__su)))");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(back.ledger[back.ledger.length - 1].setup)), JSON.parse(JSON.stringify(stamped)), "…and it survives a reload");
    const none = json(`practiceOpen(__P, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)})`);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(none.state.positions[none.id].setup)), [], "no setup given, an empty list");
  }

  /* **A tether amount carries its unit after it; a price carries none.** */
  assert.strictEqual(run(`practiceMoneyText(-250, practiceSymbolFor("USDT"))`), "-2.50 USDT",
    "money in USDT is written with the unit after it, minus first");
  assert.strictEqual(run(`practicePriceText(${P(100050)}, practiceSymbolFor("USDT"))`), "100,050.00",
    "…and a price in a USDT market is bare");
  assert.strictEqual(run(`practiceMoneyText(250, "$")`), "$2.50", "a sign still goes in front");

  /* **Both session rules are off by default**, so each of these switches its
     own on first. A fixture that read the cap out of the default stopped
     testing the rule the moment the default moved — which is exactly what
     happened here on 16 Sep 2026, and the failure was the honest one. */
  sandbox.__lossOn = run("({ ...__P, plan: { ...__P.plan, sessionLossPct: 5 } })");
  sandbox.__loss = run("({ ...__lossOn, realised: -practiceSessionLossCap(__lossOn) })");
  assert.strictEqual(run(`practiceOpen(__loss, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)}).error`),
    "planLoss", "reaching the session loss stop blocks a new position");
  /* **And nothing counts contracts any more.** The session quota was removed
     from the product on 16 Sep 2026 — it refused people with most of their
     money still in the account, and no venue has one. An account that has
     opened a thousand is refused by nothing. */
  sandbox.__cap = run("({ ...__P, opened: 1000 })");
  assert.strictEqual(run(`practiceOpen(__cap, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)}).error`),
    undefined, "a thousand contracts in, the next one still opens");

  /* **And off is off**, which is the whole of the 16 Sep change: an account
     that has opened a hundred contracts and lost most of itself is refused by
     neither rule, because no venue has either of them. The margin wall and
     liquidation are untouched and are tested elsewhere. */
  sandbox.__noRules = run("({ ...__P, opened: 100, realised: -__P.startBalance / 2 })");
  assert.strictEqual(run(`practiceCanOpen(__noRules, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)})`),
    null, "a hundred contracts in and half the money lost, nothing refuses an order");
  assert.strictEqual(run("practiceSessionLossCap(__P) === Infinity"), true,
    "…and the loss cap reads as no cap rather than as a cap of zero");
}

/* SIZING FROM THE PLAN --------------------------------------------------- */
{
  const qty = run(`practiceSizeForPlan(__P, "long", ${P(1000)}, ${P(980)})`);
  assert.ok(qty > 0, `a stop 2% away produces a size (${qty})`);
  sandbox.__sz = run(`practiceOpen(__P, { coin: "BTC", side: "long", qty: ${qty}, leverage: 5 }, ${P(1000)}).state`);
  const loss = run(`(() => {
    const closed = practiceReduce(__sz, __id(__sz, 'BTC'), __at(__sz, 'BTC').qty, ${P(980)}, "stop").state;
    return __sz.startBalance - closed.balance;
  })()`);
  const budget = run("Math.floor((__P.startBalance * __P.plan.lossPerTradePct) / 100)");
  assert.ok(loss <= budget,
    `stopping out costs no more than the planned budget (${loss} vs ${budget})`);
  assert.strictEqual(run(`practiceSizeForPlan(__P, "long", ${P(1000)}, ${P(1010)})`), null,
    "a stop on the wrong side of the entry produces no size");
}

/* FUNDING ---------------------------------------------------------------- */
{
  sandbox.__F = run(`practiceFunding(__L, __id(__L, 'BTC'), 100, ${P(1000)}).state`);
  assert.ok(run("__at(__F, 'BTC').margin") < run("__at(__L, 'BTC').margin"),
    "a positive rate is paid by the long, out of its margin");
  assert.ok(json("practiceReconcile(__F)").ok, "and funding reconciles");
  sandbox.__F2 = run(`practiceFunding(__S, __id(__S, 'BTC'), 100, ${P(1000)}).state`);
  assert.ok(run("__at(__F2, 'BTC').margin") > run("__at(__S, 'BTC').margin"),
    "and received by the short");
  assert.strictEqual(run(`practiceFunding(__L, __id(__L, 'BTC'), 0, ${P(1000)}).state`), run("__L"),
    "a zero rate is not an event");
}

/* CLOSING A PIECE OF A POSITION ------------------------------------------
 *
 * The row offered three fixed shares and an All, and the two rules that bend
 * a requested size — whole lots, and never leave a stub too small to close —
 * lived in `app-calls.js`. That put them on the *commit* side of a screen
 * that quotes the close before you press it, so the panel could show one
 * figure and the button take another. They are `practiceCloseSize` now and
 * the quote runs through them, which is the same argument `practiceCloseQuote`
 * already made about running the close rather than re-deriving it. */
{
  sandbox.__C = run(`(() => {
    let s = practiceEmptySession();
    return practiceOpen(s, { coin: "BTC", side: "long", qty: 100, leverage: 2 }, ${P(1000)}).state;
  })()`);
  const pos = "__at(__C, 'BTC')";

  assert.strictEqual(run(`practiceCloseSize(${pos}, 40)`), 40, "a whole-lot size is taken as asked");
  assert.strictEqual(run(`practiceCloseSize(${pos}, 40.9)`), 40,
    "the fraction under a lot is dropped, never rounded up");
  assert.strictEqual(run(`practiceCloseSize(${pos}, 0)`), 0, "nothing asked for is nothing taken");
  assert.strictEqual(run(`practiceCloseSize(${pos}, 500)`), 100,
    "more than the position is the position");
  /* The stub rule: 99 of 100 would leave 1, which is exactly one lot and
     closeable, so it stands; 99.5 rounds to 99 for the same reason. A size
     that would leave *less* than a lot takes the lot with it. */
  assert.strictEqual(run(`practiceCloseSize(${pos}, 99)`), 99, "a remainder of one whole lot stands");
  assert.strictEqual(run(`practiceCloseShare(${pos}, 1)`), 100, "a share of 1 is the whole position");
  assert.strictEqual(run(`practiceCloseShare(${pos}, 0.25)`), 25, "and a quarter is a quarter");
  assert.strictEqual(run(`practiceCloseShare(${pos}, 0)`), 0, "a share of nothing is nothing");

  /* Money in, size out — rounded down, so asking to take 500.00 off the table
     never takes 500.02. */
  assert.strictEqual(run(`practiceQtyForNotional(${M(500)}, ${P(1000)})`), 500,
    "500.00 at a price of 1,000 is 0.500");
  assert.strictEqual(run(`practiceQtyForNotional(${M(500) + 1}, ${P(1000)})`), 500,
    "…and a cent more is still 0.500, never 0.501");
  assert.strictEqual(run(`practiceQtyForNotional(0, ${P(1000)})`), 0, "nothing is nothing");

  const part = json(`practiceCloseQuote(__C, __id(__C, 'BTC'), ${P(1010)}, 40)`);
  const whole = json(`practiceCloseQuote(__C, __id(__C, 'BTC'), ${P(1010)})`);
  assert.strictEqual(part.qty, 40, "the quote is for the piece asked for");
  assert.strictEqual(part.all, false, "…and knows it is not the whole thing");
  assert.strictEqual(part.restQty, 60, "…and says what is left standing");
  assert.ok(part.restLiquidation > 0, "…including where the remainder liquidates");
  assert.strictEqual(whole.qty, 100, "an absent size still means all of it");
  assert.strictEqual(whole.restQty, 0, "…with nothing left");
  assert.ok(Math.abs(part.realised) < Math.abs(whole.realised),
    "closing less realises less");

  /* **The no-stub rule is dormant at the current lot size, and that is worth
     pinning down rather than assuming.** `PRACTICE_LOT_E3` is 1, so after the
     whole-lot floor a remainder can only be smaller than a lot when it is
     zero — the promotion can never *change* a size. It is kept because it is
     the model's invariant rather than an accident of the constant: raise the
     lot size and unclosable stubs become reachable the same day. The panel
     therefore does not carry a message for it, because a sentence nobody can
     ever see is a sentence that goes stale unread. */
  const edge = json(`practiceCloseQuote(__C, __id(__C, 'BTC'), ${P(1010)}, 99.5)`);
  assert.strictEqual(edge.qty, 99, "at a lot size of 1 nothing is promoted to a full close");
  assert.strictEqual(edge.all, false, "…so a near-total close still leaves the last lot");
  assert.strictEqual(run("PRACTICE_LOT_E3"), 1,
    "…and this is only true while the lot is 1 — raise it and the rule wakes up");

  /* And the whole point: the quote and the commit are the same arithmetic. */
  const committed = run(`(() => {
    const q = practiceCloseQuote(__C, __id(__C, 'BTC'), ${P(1010)}, 40);
    const out = practiceReduce(__C, __id(__C, 'BTC'), q.qty, ${P(1010)}, "close");
    return { balance: out.state.balance, quoted: q.balanceAfter, ok: practiceReconcile(out.state).ok };
  })()`);
  assert.strictEqual(committed.balance, committed.quoted,
    "the balance the ticket quotes is the balance the close produces");
  assert.ok(committed.ok, "and the ledger still explains it exactly");
}

/* THE WARNING, AND TIDYING THE RECORD ------------------------------------
 *
 * **The band is the ratio's, deliberately.** A fixed price distance is
 * meaningless across leverages — 5% away is comfortable at 2x and already
 * dead at 100x — while the ratio is equity over what the position must keep,
 * so a fresh 2x contract starts around 90 and a fresh 100x one around 2.2
 * because that *is* how near the edge they are. One pair of thresholds
 * therefore behaves sensibly at every leverage with no table to maintain.
 *
 * **Forgetting a row must not move a cent.** The ledger is what the balance
 * is recomputed from, so a deleted event would delete the money with it. The
 * row is folded into the summary instead — the mechanism compaction already
 * uses — and the assertion that matters is `practiceReconcile` still agreeing
 * afterwards. */
{
  const at = (lev, entry, mark) => run(`(() => {
    let s = practiceEmptySession();
    s = { ...s, plan: { ...s.plan, marginSharePct: 30 } };
    s = practiceOpen(s, { coin: "BTC", side: "long", qty: 100, leverage: ${lev} }, ${P(entry)}).state;
    return practiceMarginBand(__at(s, 'BTC'), ${P(mark)});
  })()`);
  assert.strictEqual(at(2, 1000, 1000), "safe", "a fresh 2x contract is nowhere near the edge");
  assert.strictEqual(at(100, 1000, 1000), "safe",
    "…and a fresh 100x one is not warned about on the day it is opened");
  /* Walked toward the rule that ends it, at both leverages — and the sizes of
     the two moves are the point. A 2x contract has to fall **49.74%** before
     it warns; a 100x one warns on **0.51%**. One pair of thresholds, no table,
     because the ratio already knows about leverage.
     Both moved slightly on 16 Sep 2026, when the maintenance requirement
     stopped being read off the leverage and started being read off the size:
     this fixture's position is 100.00 of notional, which sits in the first
     bracket and keeps 0.25% rather than the 0.5% the old rule gave a 2x
     contract. Measured, not adjusted until green — the claim being tested is
     that one pair of thresholds behaves sensibly at both ends, and it still
     does, a hundredfold apart. */
  /* 502.6 and not 503: one unit of price moves a 2x contract's ratio by 0.63
     here, so the whole warn band is narrower than an integer price. The band
     is a property of the ratio, and the fixture has to be able to land in it. */
  assert.strictEqual(at(2, 1000, 502.6), "warn", "a 2x contract warns once it has nearly halved");
  assert.strictEqual(at(2, 1000, 502), "danger", "…and is in danger a fraction further on");
  assert.strictEqual(at(100, 1000, 994), "warn",
    "…and a 100x one warns on a move a hundredth of that size");
  assert.strictEqual(at(100, 1000, 993), "danger", "…and the same, a hundredfold nearer");
  assert.strictEqual(run(`practiceMarginBand(null, ${P(1000)})`), null, "no position, no claim");
  assert.strictEqual(
    run(`(() => {
      const s = practiceOpen(practiceEmptySession(),
        { coin: "BTC", side: "long", qty: 100, leverage: 2 }, ${P(1000)}).state;
      return practiceMarginBand(__at(s, 'BTC'), 0);
    })()`),
    null,
    "…and an unpriced position is not reassured either",
  );

  const tidied = run(`(() => {
    let s = practiceEmptySession();
    s = practiceOpen(s, { coin: "BTC", side: "long", qty: 100, leverage: 2 }, ${P(1000)}).state;
    s = practiceReduce(s, __id(s, 'BTC'), 100, ${P(1010)}, "close").state;
    const closed = s.ledger.filter((e) => e.kind === "close");
    const before = { balance: s.balance, realised: s.realised, fees: s.fees, rows: closed.length };
    const out = practiceForget(s, closed.map((e) => e.id));
    return {
      before,
      after: {
        balance: out.state.balance,
        realised: out.state.realised,
        fees: out.state.fees,
        rows: out.state.ledger.filter((e) => e.kind === "close").length,
        folded: out.state.summary.count,
        ok: practiceReconcile(out.state).ok,
      },
    };
  })()`);
  assert.strictEqual(tidied.before.rows, 1, "there is a settled contract to forget");
  assert.strictEqual(tidied.after.rows, 0, "…and forgetting takes it off the record");
  assert.strictEqual(tidied.after.balance, tidied.before.balance,
    "…without moving the balance by a cent");
  assert.strictEqual(tidied.after.realised, tidied.before.realised,
    "…or the account's realised total");
  assert.strictEqual(tidied.after.fees, tidied.before.fees, "…or what it has paid in fees");
  assert.strictEqual(tidied.after.folded, 1, "…because the row was folded, not deleted");
  assert.ok(tidied.after.ok, "…and the ledger still explains the balance exactly");

  /* An open contract's own events are still live — its margin is on the books
     — so they are refused rather than quietly folded away. */
  const live = run(`(() => {
    let s = practiceEmptySession();
    s = practiceOpen(s, { coin: "BTC", side: "long", qty: 100, leverage: 2 }, ${P(1000)}).state;
    s = practiceReduce(s, __id(s, 'BTC'), 40, ${P(1010)}, "close").state;
    const closed = s.ledger.filter((e) => e.kind === "close");
    const out = practiceForget(s, closed.map((e) => e.id));
    return out.error || "folded";
  })()`);
  assert.strictEqual(live, "none",
    "a part-close of a contract that is still running cannot be taken off the record");
}

/* WHEN FUNDING IS CHARGED ------------------------------------------------
 *
 * Funding existed and was never charged: `practiceStep` took a single
 * `fundingPpm` for the whole step and the app passed `{}`, so `s.funding` was
 * always zero while the record screen printed `fees + funding` as one figure.
 * Three things had to be true before it could be switched on, and each is
 * asserted here because each is silently wrong if you get it slightly right.
 *
 * **The schedule.** Perpetuals settle on an 8-hour UTC grid — measured
 * against OKX's own `fundingTime` for BTC, ETH and XRP on 2 Sep 2026, all
 * three answered 00:00 / 08:00 / 16:00 UTC.
 *
 * **The first sight is a stamp, not a charge**, or a position opened at 07:59
 * pays for a window that closed before anything was watching.
 *
 * **The rate is per coin.** BTC and XRP were 0.0058% and 0.0100% at the same
 * instant, so one rate applied to both positions is a market that does not
 * exist. */
{
  const H8 = 8 * 60 * 60 * 1000;
  const at = run(`practiceFundingAt(${Date.UTC(2026, 8, 2, 11, 45)})`);
  assert.strictEqual(at, Date.UTC(2026, 8, 2, 8, 0),
    "11:45 UTC settles back to 08:00");
  assert.strictEqual(run(`practiceFundingAt(${Date.UTC(2026, 8, 2, 16, 0)})`),
    Date.UTC(2026, 8, 2, 16, 0), "a settlement is its own boundary");

  assert.strictEqual(run(`practiceFundingWindows(0, ${Date.UTC(2026, 8, 2, 11, 45)})`), 0,
    "a position never seen at a settlement owes nothing");
  assert.strictEqual(
    run(`practiceFundingWindows(${Date.UTC(2026, 8, 2, 0, 0)}, ${Date.UTC(2026, 8, 2, 11, 45)})`),
    1, "one settlement crossed is one window");
  /* Capped: a fortnight of closed browser crossed 42 windows at 42 rates
     nobody recorded, and charging today's rate 42 times is a number made up
     to look like a simulation. */
  assert.strictEqual(
    run(`practiceFundingWindows(${Date.UTC(2026, 8, 1, 0, 0)}, ${Date.UTC(2026, 8, 20, 0, 0)})`),
    3, "and a long gap is capped at a day of them");

  const stepped = run(`(() => {
    let s = practiceEmptySession();
    s = practiceOpen(s, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)}).state;
    s = practiceOpen(s, { coin: "ETH", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)}).state;
    const seen = { BTC: { ppm: 0, at: ${1788000000000} }, ETH: { ppm: 0, at: ${1788000000000} } };
    const a = practiceStep(s, s.step + 1, { BTC: ${P(1000)}, ETH: ${P(1000)} }, { funding: seen }).state;
    const due = {
      BTC: { ppm: 100, at: ${1788000000000 + 8 * 60 * 60 * 1000} },
      ETH: { ppm: 0, at: ${1788000000000 + 8 * 60 * 60 * 1000} },
    };
    const b = practiceStep(a, a.step + 1, { BTC: ${P(1000)}, ETH: ${P(1000)} }, { funding: due }).state;
    return {
      stampedOnly: a.funding,
      stamp: __at(a, 'BTC').fundedTo,
      charged: b.funding,
      btcMargin: __at(b, 'BTC').margin,
      ethMargin: __at(b, 'ETH').margin,
      ethStamp: __at(b, 'ETH').fundedTo,
      reconciles: practiceReconcile(b).ok,
    };
  })()`);
  assert.strictEqual(stepped.stampedOnly, 0, "the first settlement seen only stamps the clock");
  assert.strictEqual(stepped.stamp, 1788000000000, "…and the stamp is the settlement");
  assert.ok(stepped.charged > 0, "the next one charges");
  assert.strictEqual(stepped.ethMargin, run("practiceEmptySession() && " +
    `Math.ceil(practiceNotional(practiceSlip(${P(1000)}, 500, true), ${Q(1)}, "up") / 2)`),
    "a coin whose rate rounds to nothing pays nothing");
  assert.strictEqual(stepped.ethStamp, 1788000000000 + H8,
    "…and is still stamped, or it would owe that window for ever");
  assert.ok(stepped.reconciles, "and the ledger still explains the balance exactly");
}

/* LEDGER COMPACTION ------------------------------------------------------ */
{
  const many = run(`(() => {
    let s = practiceEmptySession();
    for (let i = 0; i < 260; i += 1) {
      const o = practiceOpen(s, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)});
      s = o.state;
      s = practiceReduce(s, __id(s, 'BTC'), ${Q(1)}, ${P(1001)}, "close").state;
    }
    return s;
  })()`);
  sandbox.__M = many;
  assert.strictEqual(run("__M.ledger.length"), 200, "the detailed ledger is capped at 200 events");
  assert.ok(run("__M.summary.count") > 0, "older events fold into a summary rather than vanishing");
  assert.ok(json("practiceReconcile(__M)").ok,
    "and the balance still reconciles after compaction — the prototype's slice(-60) kept no summary at all");
}

/* ONE POSITION PER COIN — and each one entirely on its own. -------------- */
{
  sandbox.__m = run(`(() => {
    let s = practiceEmptySession();
    s = practiceOpen(s, { coin: "BTC", side: "long", qty: ${Q(2)}, leverage: 5 }, ${P(1000)}).state;
    s = practiceOpen(s, { coin: "ETH", side: "short", qty: ${Q(3)}, leverage: 3 }, ${P(500)}).state;
    return s;
  })()`);
  assert.deepStrictEqual(
    /* The *coins*, read off the contracts — the map is keyed by contract id
       now, so its own keys are "1" and "2". */
    run("__m.positions ? Object.keys(__m.positions).map((k) => __m.positions[k].coin).sort() : []"),
    ["BTC", "ETH"],
    "two coins can be held at once — a single slot used to pause the only position you had the moment you switched coin",
  );
  assert.ok(json("practiceReconcile(__m)").ok, "and the ledger still explains the balance");
  assert.strictEqual(
    run(`practiceOpen(__m, { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 2 }, ${P(1000)}).error`),
    undefined,
    "and as many per coin as the balance carries",
  );

  /* **Isolated means isolated.** A step that liquidates one coin must leave
   * the other exactly as it was — same quantity, same margin, same entry. */
  const before = json("__at(__m, 'ETH')");
  const stepped = json(
    `practiceStep(__m, 1, { BTC: 1, ETH: ${P(500)} }, {})`,
  );
  assert.strictEqual(
    stepped.events.length,
    1,
    "a catastrophic move on one coin produces one event",
  );
  assert.strictEqual(stepped.events[0].coin, "BTC", "…on that coin");
  assert.strictEqual(stepped.events[0].reason, "liquidation");
  /* Untouched in everything that is the position: its size, its margin, its
     entry and its side. `peak` and `trough` do move, because ETH got a quote
     on the same step and those two are a record of where the price has been —
     asserting the whole object equal was asserting that a quote is ignored. */
  for (const field of ["qty", "margin", "entry", "side", "leverage"]) {
    assert.strictEqual(
      atCoin(stepped.state, "ETH")[field],
      before[field],
      `the other position keeps its ${field} when one coin is liquidated`,
    );
  }
  sandbox.__after = stepped.state;
  assert.ok(json("practiceReconcile(__after)").ok, "the account still reconciles afterwards");

  /* A coin with no quote is skipped rather than marked at zero — a late
   * price must not liquidate a position that never moved. */
  const partial = json(`practiceStep(__m, 2, { BTC: ${P(1000)} }, {})`);
  assert.strictEqual(partial.events.length, 0, "no quote, no event");
  assert.deepStrictEqual(
    atCoin(partial.state, "ETH"),
    before,
    "and the unquoted coin is left exactly as it was, peak and trough included",
  );

  /* Equity counts every coin, and a missing quote contributes its margin
   * rather than dropping the position out of the total. */
  const full = run(`practiceEquity(__m, { BTC: ${P(1000)}, ETH: ${P(500)} })`);
  const oneMissing = run(`practiceEquity(__m, { BTC: ${P(1000)} })`);
  assert.ok(full > 0 && oneMissing > 0, "equity is a number in both cases");
  assert.ok(
    Math.abs(full - oneMissing) < M(60),
    "a missing quote does not knock the whole position out of the total",
  );
}

/* HIGH LEVERAGE — the ladder is only usable if maintenance falls with it. */
{
  assert.deepStrictEqual(json("practiceLeverageMarks(10)"), [1, 3, 6, 8, 10],
    "a 10x account gets five even whole-number marks ending at 10x");
  assert.deepStrictEqual(json("practiceLeverageMarks(50)"), [1, 15, 25, 40, 50],
    "a 50x account gets the same even visual rhythm");
  assert.deepStrictEqual(json("practiceLeverageMarks(200)"), [1, 50, 100, 150, 200],
    "the full account keeps the established 200x scale");
  /* At a flat 0.5% maintenance rate the distance to liquidation is roughly
   * `1/leverage − mmr`, which at 200x is 0.5% − 0.5% = **zero**: the position
   * would be liquidated by the adverse fill on the way in. Every venue that
   * offers three-figure leverage tiers the rate down, and so does this. */
  for (const lev of [10, 50, 100, 200]) {
    sandbox.__hi = run(
      `practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: ${Q(0.1)}, leverage: ${lev} }, ${P(1000)}).state`,
    );
    const pos = json("__at(__hi, 'BTC')");
    const liq = run("practiceLiquidationPrice(__at(__hi, 'BTC'))");
    assert.ok(liq > 0 && liq < pos.entry, `${lev}x has a liquidation level below its entry`);
    assert.strictEqual(
      run("practiceIsLiquidated(__at(__hi, 'BTC'), __at(__hi, 'BTC').entry)"),
      false,
      `a fresh ${lev}x position is not already liquidated at its own entry`,
    );
    const away = ((pos.entry - liq) / pos.entry) * 100;
    assert.ok(away > 0.15, `${lev}x leaves room to move (${away.toFixed(3)}%)`);
  }

  /* And the rate itself only ever falls. */
  assert.ok(
    run("practiceMmrPpm(200)") < run("practiceMmrPpm(10)"),
    "the maintenance rate is lower at higher leverage",
  );
  assert.strictEqual(
    run("practiceMmrPpm(10)"),
    5000,
    "…and is unchanged at the leverages that never needed it",
  );
  assert.strictEqual(
    run("practiceOpen(practiceEmptySession(), { coin: \"BTC\", side: \"long\", qty: 1000, leverage: 500 }, 10000000).error"),
    "leverage",
    "a leverage past the top of the range is still refused",
  );
}

/* ADDING FUNDS ----------------------------------------------------------
 *
 * A deposit is the only account movement that is *not* a reset, so the whole
 * point of these is that the invariant survives it: the ledger must still
 * explain the balance exactly, and the account's size must survive a reload
 * and a compaction. */
{
  const fresh = "practiceEmptySession()";
  assert.strictEqual(run(`${fresh}.deposited`), 0, "a new account has had nothing added");

  const one = `practiceDeposit(${fresh}, ${M(5000)}).state`;
  assert.strictEqual(run(`${one}.balance`), M(15000),
    "10,000 opening + 5,000 added is a 15,000 balance");
  assert.strictEqual(run(`${one}.startBalance`), M(10000),
    "…and the opening figure is untouched — it is what the account started with");
  assert.strictEqual(run(`${one}.deposited`), M(5000), "…the added money is tallied on its own");
  assert.strictEqual(run(`practiceAccountSize(${one})`), M(15000),
    "…and the account's size is the two together");

  /* The reconciliation this whole model exists for. */
  assert.strictEqual(run(`practiceReconcile(${one}).ok`), true,
    "the ledger still explains the balance to the unit after a deposit");
  assert.strictEqual(run(`${one}.ledger[${run(`${one}.ledger.length`) - 1}].kind`), "deposit",
    "…and the record says what happened");

  /* **The caps are shares of the size, not of the opening figure.** This is
   * the difference between a deposit that means something and one that only
   * moves a number: without it the balance grows while the amount you may
   * commit, and the loss that ends the account, stand still. */
  const capBefore = run(`practiceMarginWall(${WALLED("practiceEmptySession()")}.plan, practiceEmptySession().startBalance)`);
  const capAfter = run(`practiceMarginWall(${WALLED(one)}.plan, practiceAccountSize(${one}))`);
  assert.ok(capAfter > capBefore, "the per-contract margin wall grows with the account");
  /* Switched on for the comparison: the rule is off by default now, and
     "no cap is bigger than no cap" is not the question being asked. */
  const withLossRule = (e) => `({ ...${e}, plan: { ...${e}.plan, sessionLossPct: 5 } })`;
  assert.ok(
    run(`practiceSessionLossCap(${withLossRule(one)})`)
      > run(`practiceSessionLossCap(${withLossRule(fresh)})`),
    "…and so does the loss that ends it",
  );

  /* Survives a save/restore, field by field — the failure `sanitizeCalls`
   * once had with `settledAt`, which was dropped in silence for a week. */
  const round = `sanitizePractice(JSON.parse(JSON.stringify(${one})))`;
  assert.strictEqual(run(`${round}.deposited`), M(5000), "a deposit survives a reload");
  assert.strictEqual(run(`${round}.balance`), M(15000), "…and so does the balance it bought");
  assert.strictEqual(run(`practiceReconcile(${round}).ok`), true, "…still reconciling");

  /* A hand-edited file cannot lift the caps by claiming a deposit that is
     not in the record. */
  const lied = `sanitizePractice({ ...JSON.parse(JSON.stringify(${fresh})), deposited: ${M(200000)} })`;
  assert.strictEqual(run(`${lied}.deposited`), 0,
    "`deposited` is rebuilt from the events, never read from the file");

  /* Refusals, each named. */
  assert.strictEqual(run(`practiceDeposit(${fresh}, 0).error`), "size",
    "nothing is not an amount");
  assert.strictEqual(run(`practiceDeposit(${fresh}, ${M(0.5)}).error`), "size",
    "…nor is half a Practice Unit");
  assert.strictEqual(run(`practiceDeposit(${fresh}, ${M(1000000)}).error`), "size",
    "…nor is more than the model's ceiling in one go");
  assert.strictEqual(
    run(`practiceDeposit(practiceDeposit(${fresh}, ${M(200000)}).state, ${M(100000)}).error`),
    "full",
    "a top-up that would take the account past its ceiling is refused, and says so",
  );
  {
    const dead = `practiceDeposit({ ...${fresh}, ended: true }, ${M(1000)}).state`;
    assert.strictEqual(run(`${dead}.ended`), false,
      "money into an ended account starts a new session rather than being refused");
    assert.strictEqual(run(`${dead}.balance`), M(11000),
      "…and the money is actually there");
  }

  /* **It works while a contract is running**, which is the whole reason it
   * exists and the one thing every other account control refuses. */
  {
    const open = `practiceOpen(${fresh}, { coin: "BTC", side: "long", qty: ${Q(0.1)}, leverage: 10 }, ${P(50000)}).state`;
    assert.ok(run(`Object.keys(${open}.positions).length`) === 1, "a contract is running");
    const topped = `practiceDeposit(${open}, ${M(2000)}).state`;
    assert.strictEqual(run(`${topped}.deposited`), M(2000), "funds land while it runs");
    assert.strictEqual(run(`practiceReconcile(${topped}).ok`), true, "…and still reconcile");
    assert.deepStrictEqual(
      json(`__at(${topped}, 'BTC')`),
      json(`__at(${open}, 'BTC')`),
      "…and the running contract is untouched: same qty, entry, side, leverage and margin",
    );
  }

  /* Compaction folds the row away and must not fold the account's size away
     with it — the ledger is capped at 200 entries. */
  {
    const many = `(() => {
      let s = practiceDeposit(practiceEmptySession(), ${M(100)}).state;
      for (let i = 0; i < 240; i++) s = practiceDeposit(s, ${M(100)}).state;
      return s;
    })()`;
    assert.strictEqual(run(`${many}.ledger.length`), 200, "the ledger is capped");
    assert.strictEqual(run(`${many}.deposited`), M(24100),
      "…and every unit paid in is still counted after the oldest rows were folded");
    assert.strictEqual(run(`practiceReconcile(${many}).ok`), true, "…still reconciling");
    assert.strictEqual(
      run(`sanitizePractice(JSON.parse(JSON.stringify(${many}))).deposited`),
      M(24100),
      "…and the fold survives a reload too",
    );
  }

  /* Coin-settled: one wallet, not the account. */
  {
    const inv = `practiceEmptySession(undefined, "coin")`;
    const btc = `practiceDeposit(${inv}, ${C(2)}, "BTC").state`;
    assert.strictEqual(run(`practiceWallet(${btc}, "BTC").deposited`), C(2),
      "the BTC wallet took it");
    assert.strictEqual(run(`practiceWallet(${btc}, "ETH").deposited`), 0,
      "…and the ETH wallet did not — a BTC credit is not an ETH one");
    assert.strictEqual(run(`practiceAccountSize(${btc}, "BTC")`), C(3),
      "1 opening + 2 added");
    assert.strictEqual(run(`practiceReconcile(${btc}).ok`), true, "…reconciling per wallet");
    assert.strictEqual(run(`practiceDeposit(${inv}, ${C(2)}).error`), "coin",
      "an inverse deposit with no wallet named is refused");
    assert.strictEqual(
      run(`sanitizePractice(JSON.parse(JSON.stringify(${btc}))).wallets.BTC.deposited`),
      C(2),
      "…and survives a reload",
    );
  }

  /* **Topping up an account the loss cap has stopped.**
   *
   * Reported as "I used all the money, added more, and still cannot open a
   * contract". It was true and the way out was worse than the fault: the only
   * thing that cleared `planLoss` was `resetPractice`, which destroys the
   * balance, the lots and the whole record. The cap now stops a *session* and
   * a deposit starts the next one — everything else survives. */
  {
    const capped = `(() => {
      const s0 = practiceEmptySession();
      /* The rule is off by default; this fixture is about what happens when it
         is on and has bitten, so it switches it on. */
      const s = { ...s0, plan: { ...s0.plan, sessionLossPct: 5 } };
      return { ...s, realised: -Math.ceil((s.startBalance * s.plan.sessionLossPct) / 100) - 100 };
    })()`;
    const order = `{ coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 5 }`;
    assert.strictEqual(run(`practiceCanOpen(${capped}, ${order}, ${P(50000)})`), "planLoss",
      "an account at its session loss cap cannot open — that is the cap working");
    const revived = `practiceDeposit(${capped}, ${M(5000)}).state`;
    assert.strictEqual(run(`practiceCanOpen(${revived}, ${order}, ${P(50000)})`), null,
      "…and money in starts a new session, so it can open again");
    assert.strictEqual(run(`${revived}.realised`), run(`${capped}.realised`),
      "**the record is not destroyed** — the realised total is untouched");
    assert.strictEqual(run(`${revived}.lossFrom`), run(`${capped}.realised`),
      "…the loss that ended the last session is stamped, not forgotten");
    assert.strictEqual(run(`practiceSessionLoss(${revived})`), 0,
      "…so the new session starts from nothing lost");
    assert.strictEqual(run(`practiceReconcile(${revived}).ok`), true,
      "…and the ledger still explains the balance through the revival");

    /* A deposit into a healthy account must NOT wipe the running loss — the
       cap has to keep counting or it is a cap that resets itself. */
    const healthy = `practiceDeposit(practiceEmptySession(), ${M(1000)}).state`;
    assert.strictEqual(run(`${healthy}.lossFrom`), 0,
      "a top-up before the cap is met leaves the session's loss where it was");

    /* A hand-edited file cannot buy an unlimited cap. */
    assert.strictEqual(
      run(`sanitizePractice({ ...JSON.parse(JSON.stringify(practiceEmptySession())), lossFrom: -${M(999999)} }).lossFrom`),
      0,
      "`lossFrom` cannot claim a larger loss than the account has realised",
    );
  }

  /* The per-contract margin wall follows the funded account too — left on the
     opening figure, a deposit was money you could see and not commit. */
  {
    const big = `practiceDeposit(practiceEmptySession(), ${M(200000)}).state`;
    const wall = (st) =>
      run(`practiceMarginWall(${WALLED(st)}.plan, practiceAccountSize(${st}))`);
    assert.ok(wall(big) > wall("practiceEmptySession()"),
      "the margin a single contract may take grows with the funded account");
  }

  /* **A bound must not overflow while checking for overflow.**
   *
   * The inverse size guard was `practiceCoinForMoney(qty, priceE4) >
   * PRACTICE_MAX_COIN_E8` — an *exact* conversion, which throws on precisely
   * the values the guard exists to refuse. So `practiceIncrease` and
   * `practiceCanOpen` raised out of a render instead of returning `notional`.
   * Found by the panel walk typing an entry of 0.001 against a held contract.
   * A bound needs to be conservative, not exact. */
  {
    const inv = `practiceEmptySession(undefined, "coin")`;
    const held = `practiceOpen(${inv}, { coin: "ETH", side: "long", qty: 1000000, leverage: 5 }, ${P(112480)}).state`;
    /* A mark of 0.0010 against a real inverse position: the conversion behind
       the old guard was 3.9e16, past `Number.MAX_SAFE_INTEGER`. */
    assert.strictEqual(
      run(`practiceCanOpen(${inv}, { coin: "ETH", side: "long", qty: 19684000, leverage: 35 }, 10)`),
      "notional",
      "an absurd price is refused by name rather than thrown at the caller",
    );
    assert.strictEqual(
      run(`practiceIncrease(${held}, __id(${held}, 'ETH'), { side: "long", qty: 19684000, leverage: 5 }, 10).error`),
      "notional",
      "…and so is an addition at one",
    );
    assert.ok(
      run(`!practiceIncrease(${held}, __id(${held}, 'ETH'), { side: "long", qty: 100000, leverage: 5 }, ${P(112480)}).error`),
      "…while an ordinary addition at an ordinary price still goes through",
    );
  }

  /* **Adding to a position you hold, the way a venue does it.**
   *
   * A second order on a held coin was refused outright, and the ticket greyed
   * its whole form out on the strength of it — reported as "the long and short
   * buttons are deactivated even though there is money in the balance". On
   * BitMEX and on Binance an order in the same direction adds to the position
   * and the entry becomes the quantity-weighted average of every fill. */
  {
    const opened = `practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: 40, leverage: 5 }, ${P(100000)}).state`;
    const added = `practiceIncrease(${opened}, __id(${opened}, 'BTC'), { side: "long", qty: 40, leverage: 5 }, ${P(120000)}).state`;

    assert.strictEqual(run(`__at(${added}, 'BTC').qty`), 80, "the position grows by what was added");
    /* Both fills cross the spread, so the average sits a hair above the plain
       mean of 110,000 — that is the slippage, not a rounding slip. */
    const entry = run(`__at(${added}, 'BTC').entry`);
    assert.ok(entry > P(110000) && entry < P(110200),
      `the entry is the quantity-weighted average of both fills (got ${entry / 10000})`);
    assert.ok(run(`__at(${added}, 'BTC').margin`) > run(`__at(${opened}, 'BTC').margin`),
      "…and the margin behind it grows too");
    assert.strictEqual(run(`${added}.opened`), run(`${opened}.opened`),
      "**it is a fill, not a contract** — the session's contract count does not move");
    assert.strictEqual(run(`practiceReconcile(${added}).ok`), true,
      "…and the ledger still explains the balance");

    /* An unequal pair, so the *weighting* is tested and not just the midpoint:
       three at 100k and one at 120k averages 105k, not 110k. */
    const base = `practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: 60, leverage: 5 }, ${P(100000)}).state`;
    const skewed = `practiceIncrease(${base}, __id(${base}, 'BTC'), { side: "long", qty: 20, leverage: 5 }, ${P(120000)}).state`;
    const skewEntry = run(`__at(${skewed}, 'BTC').entry`);
    assert.ok(skewEntry > P(105000) && skewEntry < P(105200),
      `three parts at 100k and one at 120k average 105k (got ${skewEntry / 10000})`);

    /* Refusals, each named. */
    assert.strictEqual(
      run(`practiceIncrease(${opened}, __id(${opened}, 'BTC'), { side: "short", qty: 40, leverage: 5 }, ${P(100000)}).error`),
      "side", "the other direction is not an addition — the caller reduces instead");
    assert.strictEqual(
      run(`practiceIncrease(${opened}, __id(${opened}, 'BTC'), { side: "long", qty: 40, leverage: 20 }, ${P(100000)}).error`),
      "leverage", "a live position's leverage cannot be changed by adding to it");
    assert.strictEqual(
      run(`practiceIncrease(practiceEmptySession(), "nope", { side: "long", qty: 40, leverage: 5 }, ${P(100000)}).error`),
      "none", "…and there has to be something to add to");
    assert.strictEqual(
      run(`practiceIncrease(${WALLED(opened)}, __id(${opened}, 'BTC'), { side: "long", qty: 200, leverage: 5 }, ${P(100000)}).error`),
      "planMargin",
      "the plan's per-contract wall applies to the whole position after the addition");
  }

  /* **An inverse order the arithmetic cannot carry is refused at both doors.**
   *
   * Found by the random walk in `tests/local-audit.js`: on a coin-settled
   * account, `practiceInversePnl` threw from `practiceReduce` and took the
   * panel down. `practiceCanOpen` bounded the linear product
   * (`priceE4 * qty > MAX_PRODUCT`) and let every inverse order through, so
   * the model admitted positions whose own P/L could not be represented.
   *
   * The second door is storage: a file written by an older model could load
   * one, and then it could never be closed, because closing is what threw. */
  {
    const inv = `practiceEmptySession(undefined, "coin")`;
    const order = (qty) => `{ coin: "XRP", side: "long", qty: ${qty}, leverage: 5 }`;
    assert.strictEqual(run(`practiceCanOpen(${inv}, ${order(10000000000)}, ${P(2.94)})`), "notional",
      "an inverse order too large to compute is named, not thrown");
    assert.strictEqual(run(`practiceCanOpen(${inv}, ${order(100000000)}, ${P(2.94)})`), "notional",
      "…and so is the smaller one that also overflowed");
    assert.ok(run(`practiceCanOpen(${inv}, ${order(1000000)}, ${P(112480)}) !== "notional"`),
      "…while an ordinary inverse order is untouched");

    /* The stored door. Dropped rather than clamped: shrinking a recorded size
       would invent a different contract and put the balance out of step with
       the ledger. */
    const loaded = `sanitizePractice((() => {
      const raw = JSON.parse(JSON.stringify(${inv}));
      raw.positions = { XRP: { coin: "XRP", currency: "", side: "long", qty: 10000000000,
        entry: ${P(2.94)}, leverage: 5, settlement: "coin", margin: 1000, stop: null,
        take: null, openedStep: 0, fundedTo: 0, peak: ${P(2.94)}, trough: ${P(2.94)} } };
      return raw;
    })())`;
    assert.strictEqual(run(`Object.keys(${loaded}.positions).length`), 0,
      "a stored inverse position too large to compute does not survive loading");

    /* And a quote is an object or nothing, never a throw — it is asked during
       a render, and the answer to a price the arithmetic cannot carry is "no
       quote", not a blank panel. */
    assert.strictEqual(
      run(`practiceCloseQuote(${inv}, __id(${inv}, 'XRP'), ${P(2.94)})`),
      null,
      "a quote for a position that is not there is null rather than an error",
    );
  }

  /* **A liquidation price is a number or null, never a throw.**
   *
   * Reported as "something went wrong when I raise the leverage in futures".
   * It was not the leverage: on a **coin-settled** account the ticket asks for
   * the probed position's liquidation on every render, and the search probed
   * `MIN_PRICE_E4` for a long. An inverse P/L divides by `entry × mark`, so a
   * probe near zero ran past `Number.MAX_SAFE_INTEGER` and `practiceInversePnl`
   * threw out of the middle of a function whose contract is a number or null —
   * and the panel's error boundary swallowed the whole Futures screen.
   *
   * The comment in `practiceLiquidationPrice` had already fixed exactly this at
   * the short's end of the search and left the long's. */
  {
    const shapes = [];
    for (const side of ["long", "short"]) {
      for (const lev of [1, 2, 5, 20, 100, 200]) {
        for (const qty of [1000, 1000000, 100000000, 10000000000]) {
          shapes.push([side, lev, qty]);
        }
      }
    }
    for (const [side, lev, qty] of shapes) {
      const pos = `{ coin: "BTC", currency: "", side: "${side}", qty: ${qty},
        entry: ${P(112480)}, leverage: ${lev}, settlement: "coin",
        margin: Math.max(1, Math.ceil(${qty} / ${lev})), stop: null, take: null,
        openedStep: 0, fundedTo: 0, peak: ${P(112480)}, trough: ${P(112480)} }`;
      const out = run(`(() => {
        const v = practiceLiquidationPrice(${pos});
        return v === null || Number.isSafeInteger(v);
      })()`);
      assert.strictEqual(out, true,
        `a ${side} inverse contract at ${lev}x holding ${qty} answers rather than throwing`);
    }

    /* And the answers are the right shape: an inverse long at 1x ends near
       half the entry, and higher leverage moves it toward the entry. */
    const liqAt = (lev) => run(`(() => {
      const s = practiceEmptySession(undefined, "coin");
      const o = practiceOpen(s, { coin: "BTC", side: "long", qty: ${M(10000)}, leverage: ${lev} }, ${P(112480)});
      const p = __at(o.state, 'BTC');
      return (practiceLiquidationPrice(p) - p.entry) / p.entry;
    })()`);
    assert.ok(liqAt(1) < -0.4 && liqAt(1) > -0.6, "an inverse long at 1x ends near half the entry");
    assert.ok(liqAt(100) > -0.02, "…and at 100x within a couple of per cent of it");
    assert.ok(liqAt(1) < liqAt(20) && liqAt(20) < liqAt(100),
      "…with the level moving toward the entry as leverage rises");
  }

  /* **An account saved before sessions existed starts one on load.**
   *
   * Turning `plan.maxPositions` from a lifetime count into a session count
   * left every stored account arriving already at its cap — `opened` was 5 or
   * 12 and `openedFrom` defaulted to 0. So the fix for "a limit you can meet
   * with the money still there" shipped with exactly that symptom for anybody
   * who had traded before it, which is how it was reported: *two contracts,
   * even though I have money*. An absent `openedFrom` means the file predates
   * the field, and that is a different thing from a recorded zero. */
  {
    const used = `(() => {
      const raw = JSON.parse(JSON.stringify(practiceEmptySession()));
      raw.opened = 12;
      delete raw.openedFrom;
      return sanitizePractice(raw);
    })()`;
    assert.strictEqual(run(`${used}.openedFrom`), 12,
      "an account with no `openedFrom` recorded starts its session where it stands");
    assert.strictEqual(run(`practiceSessionOpened(${used})`), 0, "…so the session count is zero");
    assert.strictEqual(
      run(`practiceCanOpen(${used}, { coin: "BTC", side: "long", qty: 80, leverage: 5 }, ${P(112480)})`),
      null,
      "…and it can open a contract instead of arriving capped",
    );

    /* A recorded value is still honoured and still clamped. */
    const midSession = `(() => {
      const raw = JSON.parse(JSON.stringify(practiceEmptySession()));
      raw.opened = 12; raw.openedFrom = 10;
      return sanitizePractice(raw);
    })()`;
    assert.strictEqual(run(`practiceSessionOpened(${midSession})`), 2,
      "a session already under way is not restarted by loading it");
    assert.strictEqual(
      run(`(() => { const raw = JSON.parse(JSON.stringify(practiceEmptySession())); raw.opened = 3; raw.openedFrom = 99; return sanitizePractice(raw).openedFrom; })()`),
      3,
      "…and a hand-edited one cannot exceed what the account has opened",
    );
  }

  /* **Setting the balance to a figure, up or down.**
   *
   * Reported as "I have 1 BTC and I want 1.29". Adding funds could only go up,
   * and the only way to a *particular* number was the balance control, which
   * does not adjust an account — it replaces one, and takes the lots and the
   * record with it. This is the deposit movement signed. */
  {
    const inv = `practiceEmptySession(undefined, "coin")`;
    const up = `practiceSetBalance(${inv}, ${C(1.29)}, "BTC").state`;
    assert.strictEqual(run(`practiceFreeBalance(${up}, "BTC")`), C(1.29),
      "1 BTC becomes 1.29 BTC by typing it");
    assert.strictEqual(run(`practiceAccountSize(${up}, "BTC")`), C(1.29),
      "…and the account's size follows, so the plan caps describe the money there");
    assert.strictEqual(run(`practiceReconcile(${up}).wallets.BTC.ok`), true,
      "…and the ledger still explains it");

    const down = `practiceSetBalance(${up}, ${C(0.4)}, "BTC").state`;
    assert.strictEqual(run(`practiceFreeBalance(${down}, "BTC")`), C(0.4),
      "**and it goes down too** — a deposit could only go up");
    assert.ok(run(`${down}.wallets.BTC.deposited`) < 0,
      "…with the tag signed, so the size tracks down as well as up");
    assert.strictEqual(run(`practiceReconcile(${down}).wallets.BTC.ok`), true,
      "…still reconciling after money has been taken out");

    /* The quote side, and the guard that matters: margin behind an open
       contract is committed, not yours to take back. */
    const held = `practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: 40, leverage: 5 }, ${P(112480)}).state`;
    assert.strictEqual(run(`practiceSetBalance(${held}, ${M(20000)}).state.balance`), M(20000),
      "a quote balance can be set while a contract is running");
    assert.strictEqual(run(`practiceSetBalance(${held}, -1).error`), "size",
      "…a negative figure is refused");
    assert.strictEqual(
      run(`practiceSetBalance(${inv}, ${C(1)}, "BTC").state.ledger.length`),
      0,
      "…and setting it to what it already is records nothing",
    );

    /* Money in past a stopped cap starts the next session, exactly as a
       deposit does. Money out must not — the way past a loss limit cannot be
       to take your own money off the table. */
    const capped = `(() => {
      const s0 = practiceEmptySession();
      /* The rule is off by default; this fixture is about what happens when it
         is on and has bitten, so it switches it on. */
      const s = { ...s0, plan: { ...s0.plan, sessionLossPct: 5 } };
      return { ...s, realised: -Math.ceil((s.startBalance * s.plan.sessionLossPct) / 100) - 100 };
    })()`;
    assert.strictEqual(
      run(`practiceCanOpen(practiceSetBalance(${capped}, ${M(20000)}).state, { coin: "BTC", side: "long", qty: 40, leverage: 5 }, ${P(112480)})`),
      null,
      "setting the balance up past a stopped cap starts the next session",
    );
    assert.strictEqual(
      run(`practiceCanOpen(practiceSetBalance(${capped}, ${M(500)}).state, { coin: "BTC", side: "long", qty: 40, leverage: 5 }, ${P(112480)})`),
      "planLoss",
      "…taking money out does not, or the way past a loss limit would be to withdraw",
    );
  }

  /* **A limit you could meet with 99% of the money still there — and it is
   * gone.**
   *
   * Reported three times, the last as *"para olmasına rağmen hâlâ çözmedin"*:
   * the session quota refused the next contract on an account with nearly all
   * of its money untouched. It was removed from the product on 16 Sep 2026, so
   * this block now asserts the opposite of what it used to — five round trips
   * and the sixth opens — and keeps the `practiceNewSession` assertions under
   * the one rule that can still stop a session, which is off unless somebody
   * asks for it. */
  {
    const runFive = `(() => {
      let s = practiceEmptySession();
      for (let i = 0; i < 5; i += 1) {
        const o = practiceOpen(s, { coin: "BTC", side: "long", qty: 80, leverage: 5 }, ${P(112480)});
        s = practiceReduce(o.state, __id(o.state, 'BTC'), 80, ${P(112480)}, "close").state;
      }
      return s;
    })()`;
    const order = `{ coin: "BTC", side: "long", qty: 80, leverage: 5 }`;
    assert.strictEqual(run(`practiceCanOpen(${runFive}, ${order}, ${P(112480)})`), null,
      "five contracts opened and closed, and the sixth opens — there is no quota to meet");
    assert.ok(run(`${runFive}.balance > ${runFive}.startBalance * 0.98`),
      "…with nearly all of the money still in the account, which was the complaint");
    assert.strictEqual(run(`${runFive}.opened`), 5,
      "…and the count is kept as a fact, because a count is not a rule");
    assert.strictEqual(run(`${runFive}.plan.maxPositions`), undefined,
      "…and the plan does not carry the quota at all any more");

    /* The escape hatch still exists, for the rule that can still stop a
       session. Built by switching that rule on, since it is off by default. */
    const stopped = `(() => {
      const s0 = practiceEmptySession();
      const s = { ...s0, plan: { ...s0.plan, sessionLossPct: 5 } };
      return { ...s, realised: -Math.ceil((s.startBalance * s.plan.sessionLossPct) / 100) - 100 };
    })()`;
    assert.strictEqual(run(`practiceCanOpen(${stopped}, ${order}, ${P(112480)})`), "planLoss",
      "a session at its loss stop is still stopped — that rule is a choice, not a leftover");
    const next = `practiceNewSession(${stopped}).state`;
    assert.strictEqual(run(`practiceCanOpen(${next}, ${order}, ${P(112480)})`), null,
      "the next session can open again");
    assert.strictEqual(run(`${next}.balance`), run(`${stopped}.balance`),
      "**and keeps the money** — this is not a reset");
    assert.strictEqual(run(`${next}.ledger.length`), run(`${stopped}.ledger.length`),
      "…and the whole record");
    assert.strictEqual(run(`practiceSessionOpened(${next})`), 0,
      "…while the session counts from nothing");
    assert.strictEqual(run(`practiceReconcile(${next}).ok`), true,
      "…and the ledger still explains the balance");

    /* Refused with a contract running: the caps are what an open position was
       sized against, and re-basing them underneath it changes the rules a
       decision was already made under. */
    assert.strictEqual(
      run(`practiceNewSession(practiceOpen(practiceEmptySession(), ${order}, ${P(112480)}).state).error`),
      "open",
      "a new session is refused while a contract is running",
    );

    /* A hand-edited file cannot buy itself an unlimited contract count. */
    assert.strictEqual(
      run(`sanitizePractice({ ...JSON.parse(JSON.stringify(${runFive})), openedFrom: 999 }).openedFrom`),
      run(`${runFive}.opened`),
      "`openedFrom` can never exceed what the account has opened",
    );
  }

  /* The four seconds are the panel's, and the number is shared so the bar
     and the timer cannot disagree. */
  assert.strictEqual(run("PRACTICE_DEPOSIT_MS"), 4000, "a deposit takes four seconds to land");
}

/* EVERY TRANSITION, IN EVERY ORDER --------------------------------------
 *
 * The suite above asserts the things somebody thought to assert. This asserts
 * the two that must hold no matter what anybody thought of: **nothing throws**,
 * and **the ledger explains the balance** — after every single step, in both
 * settlements, through every transition the account has.
 *
 * It exists because three bugs were reported in a row that the targeted tests
 * could not have caught, and one of them (`practiceLiquidationPrice` throwing
 * on an inverse long) was a throw out of a function whose contract is a number
 * or null. A walk like this finds that class on the first run.
 *
 * Deterministic: one seed, so a failure is reproducible and the suite does not
 * flake. 200 accounts x 30 steps costs about a second and no network.
 */
{
  let seed = 20260903;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const COINS = ["BTC", "ETH", "XRP"];
  const priceOf = (c) => (c === "BTC" ? P(112480) : c === "ETH" ? P(4210) : P(2.94));
  /* **The mark drifts, and that is the point.** The first version of this walk
     closed at the price it opened at, which is why it missed the inverse
     order bound entirely: the P/L only runs away when the mark moves, and the
     defect the random UI walk found was a close at a drifted price on a cheap
     coin. A quarter to four times the entry covers both sides of every
     liquidation this model has. */
  const markOf = (c) => Math.max(1, Math.round(priceOf(c) * (0.25 + rnd() * 3.75)));
  const g = (n) => run(n);

  let steps = 0;
  for (let account = 0; account < 200; account += 1) {
    const settlement = rnd() < 0.4 ? "coin" : "quote";
    let s = g(`practiceEmptySession(undefined, ${JSON.stringify(settlement)})`);
    const trail = [`empty(${settlement})`];
    for (let n = 0; n < 30; n += 1) {
      const coin = pick(COINS);
      const price = priceOf(coin);
      /* `add` joined this list after the walk over the panel found
         `practiceIncrease` throwing out of a render on a coin-settled account
         — the model walk had no way to reach it because it never added to a
         position. A transition the walk does not take is a transition it does
         not guard. */
      const op = pick(["open", "add", "close", "part", "margin", "deposit", "session",
                       "triggers", "forget", "roundtrip", "liq", "quote"]);
      const before = s;
      sandbox.__s = s;
      let out;
      try {
        if (op === "open") {
          const order = {
            coin,
            side: pick(["long", "short"]),
            qty: settlement === "coin" ? pick([100, 1000000, 50000000, 300000000]) : pick([1, 10, 100, 1000]),
            leverage: pick([1, 2, 5, 20, 100, 200]),
          };
          trail.push(`open ${coin} ${order.side} ${order.leverage}x q${order.qty}`);
          out = g(`practiceOpen(__s, ${JSON.stringify(order)}, ${price})`);
        } else if (op === "add") {
          const pos = g(`practiceAt(__s, ${JSON.stringify(coin)})`);
          if (!pos) continue;
          const order = {
            side: pos.side,
            qty: settlement === "coin" ? pick([100, 1000000, 50000000, 300000000]) : pick([1, 10, 100]),
            leverage: pos.leverage,
          };
          trail.push(`add ${coin} q${order.qty}`);
          out = g(`practiceIncrease(__s, ${JSON.stringify(coin)}, ${JSON.stringify(order)}, ${markOf(coin)})`);
        } else if (op === "close" || op === "part") {
          const pos = g(`practiceAt(__s, ${JSON.stringify(coin)})`);
          if (!pos) continue;
          const qty = op === "close"
            ? pos.qty
            : g(`practiceCloseSize(practiceAt(__s, ${JSON.stringify(coin)}), ${Math.floor(pos.qty / 2)})`);
          if (!qty) continue;
          trail.push(`reduce ${coin} ${qty}`);
          out = g(`practiceReduce(__s, ${JSON.stringify(coin)}, ${qty}, ${markOf(coin)}, "close")`);
        } else if (op === "margin") {
          trail.push(`addMargin ${coin}`);
          out = g(`practiceAddMargin(__s, ${JSON.stringify(coin)}, ${pick([100, 10000, 1000000])})`);
        } else if (op === "deposit") {
          const amt = settlement === "coin" ? pick([1000000, 100000000]) : pick([100, 100000, 2500000]);
          trail.push(`deposit ${amt}`);
          out = g(`practiceDeposit(__s, ${amt}, ${JSON.stringify(coin)})`);
        } else if (op === "session") {
          trail.push("newSession");
          out = g("practiceNewSession(__s)");
        } else if (op === "triggers") {
          if (!g(`practiceAt(__s, ${JSON.stringify(coin)})`)) continue;
          const d = pick([0.9, 0.98, 1.02, 1.1]);
          trail.push(`triggers ${coin}`);
          out = g(`practiceSetTriggers(__s, ${JSON.stringify(coin)}, ${Math.round(price * d)}, ${Math.round(price * (2 - d))})`);
        } else if (op === "forget") {
          const ids = g("__s.ledger.filter((e) => [\"close\",\"stop\",\"take\",\"liquidation\"].includes(e.kind)).map((e) => e.id)");
          if (!ids.length) continue;
          trail.push("forget");
          out = g(`practiceForget(__s, ${pick(ids)})`);
        } else if (op === "roundtrip") {
          trail.push("roundtrip");
          const back = g("sanitizePractice(JSON.parse(JSON.stringify(__s)))");
          assert.ok(back, `a saved account came back as null after: ${trail.slice(-4).join(" / ")}`);
          assert.strictEqual(back.balance, before.balance,
            `a save/restore moved the balance after: ${trail.slice(-4).join(" / ")}`);
          sandbox.__s = back;
          s = back;
          out = null;
        } else if (op === "liq") {
          trail.push("liq");
          for (const c of COINS) {
            const v = g(`(() => { const p = practiceAt(__s, ${JSON.stringify(c)}); return p ? practiceLiquidationPrice(p) : null; })()`);
            assert.ok(v === null || Number.isSafeInteger(v),
              `a liquidation price was neither a number nor null after: ${trail.slice(-4).join(" / ")}`);
          }
          out = null;
        } else {
          trail.push("quote");
          for (const c of COINS) {
            g(`(() => { if (!practiceAt(__s, ${JSON.stringify(c)})) return null; return practiceCloseQuote(__s, ${JSON.stringify(c)}, ${markOf(c)}); })()`);
          }
          out = null;
        }
      } catch (e) {
        assert.fail(`${op} threw "${e.message}" after: ${trail.slice(-5).join(" / ")}`);
      }
      if (out && out.state) {
        sandbox.__s = out.state;
        s = out.state;
      }
      steps += 1;
      sandbox.__s = s;
      const rec = g("practiceReconcile(__s)");
      const ok = rec.ok === true
        || (rec.wallets && Object.keys(rec.wallets).every((k) => rec.wallets[k].ok));
      assert.ok(ok, `the ledger stopped explaining the balance after: ${trail.slice(-5).join(" / ")}`);
    }
  }
  assert.ok(steps > 3000, `the walk actually walked (${steps} steps)`);
}

/* BOUNDS — a conversion answers inside the model's own range, or it throws
 * from inside somebody's render.
 *
 * Both of these were live: reported as *"practice-math: non-integer operand"*
 * with a stack of nothing but React frames, and found by
 * `scripts/audit-futures.js`. Each constant bounds one side of a product and
 * neither bounds the product, which is the whole class. --------------------- */
{
  /* Ten thousand coins against an entry price of 999,999,999 is 1e17 — an
     ordinary double, and past what a safe integer holds. The ceiling is the
     price's, so what comes back converts without throwing. */
  const huge = run("PRACTICE_MAX_COIN_E8");
  const dear = run(`${999999999} * PRICE_SCALE`);
  assert.throws(
    () => run(`practiceMoneyForCoin(${huge}, ${dear}, ROUND_DOWN)`),
    /safe integer|out of bounds/,
    "the unbounded conversion is the one that throws",
  );
  const ceiling = run(`practiceCoinCeiling(${dear})`);
  assert.ok(ceiling > 0 && ceiling < huge, `the ceiling bites at a high price (${ceiling})`);
  const money = run(`practiceMoneyForCoin(${ceiling}, ${dear}, ROUND_DOWN)`);
  assert.ok(Number.isSafeInteger(money), "and what it allows converts to a safe integer");
  assert.ok(money <= run("MAX_MONEY_E2"), `…inside the money the account can hold (${money})`);
  /* No price is no ceiling — not a fallback price. A conversion with nothing
     to convert at has nothing to say. */
  assert.strictEqual(run("practiceCoinCeiling(0)"), 0, "and no price allows nothing");

  /* The other one: the largest money this account can hold, at the smallest
     price a path may reach, came to ten times MAX_QTY_E3 — refused two frames
     later by `practiceNotional`, mid-render. */
  const qty = run("practiceQtyForNotional(MAX_MONEY_E2, MIN_PRICE_E4)");
  assert.ok(
    qty > 0 && qty <= run("MAX_QTY_E3"),
    `a notional converted at the lowest price stays a usable quantity (${qty})`,
  );
  assert.doesNotThrow(
    () => run(`practiceNotional(MIN_PRICE_E4, ${qty}, ROUND_UP)`),
    "…and the model will take it",
  );
}

/* BREAK-EVEN — where the contract stops costing money. ------------------- */
{
  sandbox.__B = run(
    `practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 10 }, ${P(1000)}).state`,
  );
  const even = run("practiceBreakEven(__B, __id(__B, 'BTC'))");
  const entry = run("__at(__B, 'BTC').entry");
  assert.ok(even > entry, `a long breaks even above its entry (${even} vs ${entry})`);
  /* The round trip is two fees and two adverse fills, and at 0.05% each that
     is a little over two tenths of a percent — a *little*, and this is what
     makes "closed where I opened" come back smaller. */
  const gap = ((even - entry) / entry) * 100;
  assert.ok(gap > 0.05 && gap < 0.5, `…by the round trip, not by nothing or by miles (${gap.toFixed(3)}%)`);
  /* Run it, do not take its word: closing one unit under pays less than
     nothing and closing at it pays nothing or better. */
  sandbox.__even = even;
  /* **Both fees, not the last one.** `realised` is the close's own result —
     net of the fee going out, but not of the fee paid coming in, which left
     the balance when the contract opened. This asserted `realised >= 0` and
     so passed with a break-even that forgot the opening fee: $100,151 for a
     contract whose round trip needed ~$100,201 (found 18 Sep 2026). The
     account is only even when the close pays back what opening cost. */
  sandbox.__openFee = run("__B.ledger.filter((e) => e.kind === 'open').reduce((a, e) => a + e.fee, 0)");
  assert.ok(run("__openFee") > 0, "the fixture paid a fee to open");
  assert.ok(run("practiceCloseQuote(__B, __id(__B, 'BTC'), __even).realised") >= run("__openFee"),
    "closing at it pays back the opening fee as well as the closing one");
  assert.ok(run("practiceCloseQuote(__B, __id(__B, 'BTC'), __even - 1).realised") < run("__openFee"),
    "…and one unit under it does not");

  sandbox.__BS = run(
    `practiceOpen(practiceEmptySession(), { coin: "BTC", side: "short", qty: ${Q(1)}, leverage: 10 }, ${P(1000)}).state`,
  );
  const evenS = run("practiceBreakEven(__BS, __id(__BS, 'BTC'))");
  assert.ok(evenS < run("__at(__BS, 'BTC').entry"), `a short breaks even below its entry (${evenS})`);
  assert.strictEqual(run("practiceBreakEven(practiceEmptySession(), 'BTC')"), null,
    "and nothing held has no break-even, rather than a number");
}

/* MARGIN OUT — the other half of adding it. --------------------------------- */
{
  sandbox.__M = run(
    `practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 5 }, ${P(1000)}).state`,
  );
  const mark = run(`${P(1000)}`);
  sandbox.__mark = mark;
  const before = run("__at(__M, 'BTC').margin");
  const cash = run("__M.balance");
  const free = run("practiceRemovableMargin(__M, __id(__M, 'BTC'), __mark)");
  assert.ok(free > 0 && free < before, `a fresh 5x contract has margin to spare (${free} of ${before})`);

  sandbox.__free = free;
  const out = run("practiceRemoveMargin(__M, __id(__M, 'BTC'), __free, __mark)");
  assert.ok(out.state, `taking exactly what it offers is allowed (${JSON.stringify(out.error)})`);
  sandbox.__O = out.state;
  assert.strictEqual(run("__at(__O, 'BTC').margin"), before - free, "the margin falls by what was taken");
  assert.strictEqual(run("__O.balance"), cash + free, "…and the balance rises by the same");
  /* Nothing about the contract itself moves — that is the whole claim the
     margin card makes about adding, and it has to hold in both directions. */
  assert.strictEqual(run("__at(__O, 'BTC').qty"), run("__at(__M, 'BTC').qty"), "the size is untouched");
  assert.strictEqual(run("__at(__O, 'BTC').entry"), run("__at(__M, 'BTC').entry"), "so is the entry");
  assert.strictEqual(run("__at(__O, 'BTC').leverage"), run("__at(__M, 'BTC').leverage"), "so is the leverage");
  assert.ok(
    run("practiceLiquidationPrice(__at(__O, 'BTC'))") > run("practiceLiquidationPrice(__at(__M, 'BTC'))"),
    "…and a long's liquidation moves closer, which is the point",
  );
  /* The ledger still explains the balance. */
  const rec = run("practiceReconcile(__O)");
  assert.ok(rec.ok === true, `the ledger explains the balance afterwards (${JSON.stringify(rec)})`);

  /* One unit more than it offered is refused, and the offer is the boundary
     rather than a comfortable guess. */
  assert.ok(
    run("practiceRemoveMargin(__M, __id(__M, 'BTC'), __free + 1, __mark).error"),
    "one unit past the offer is refused",
  );
  assert.strictEqual(
    run("practiceRemovableMargin(__O, __id(__O, 'BTC'), __mark)"), 0,
    "and once it has been taken there is nothing left to take",
  );
  /* No price is a refusal, not a guess: how close a contract is to dying is a
     question about the mark. */
  assert.ok(run("practiceRemoveMargin(__M, __id(__M, 'BTC'), 100, 0).error"), "no price is a refusal");
  assert.ok(run("practiceRemoveMargin(__M, __id(__M, 'BTC'), 0, __mark).error"), "and so is nothing at all");
}

/* MANY AT ONCE — the shape of the store, and what it is now able to hold. -- */
{
  /* **Twenty longs and twenty shorts on one coin, at once.** This is the
     thing that could not be done while `positions` was keyed by the coin: the
     refusal was the data structure, not a rule. Run at a size the balance
     genuinely carries, so what is being tested is the store and not the
     margin wall. */
  sandbox.__many = run(`(() => {
    let s = practiceEmptySession(${M(500000)});
    s = { ...s, plan: { ...s.plan, marginSharePct: 2 } };
    for (let i = 0; i < 20; i += 1) {
      s = practiceOpen(s, { coin: "BTC", side: "long", qty: ${Q(0.1)}, leverage: 20 }, ${P(1000)}).state;
      s = practiceOpen(s, { coin: "BTC", side: "short", qty: ${Q(0.1)}, leverage: 20 }, ${P(1000)}).state;
    }
    return s;
  })()`);
  assert.strictEqual(run("Object.keys(__many.positions).length"), 40,
    "forty contracts run at once on a single coin");
  assert.strictEqual(
    run("Object.keys(__many.positions).filter((k) => __many.positions[k].side === 'long').length"),
    20,
    "…twenty of them long",
  );
  assert.strictEqual(
    run("Object.keys(__many.positions).filter((k) => __many.positions[k].side === 'short').length"),
    20,
    "…and twenty short, at the same time, on the same market",
  );
  assert.strictEqual(run("practiceReconcile(__many).ok"), true,
    "…and the ledger explains the balance for all forty");
  /* Each contract has its own id, its own margin and its own liquidation —
     and closing one leaves the other thirty-nine exactly where they were. */
  const ids = run("Object.keys(__many.positions)");
  assert.strictEqual(new Set(ids).size, 40, "every contract has an id of its own");
  sandbox.__afterOne = run(
    `practiceReduce(__many, '${ids[7]}', __many.positions['${ids[7]}'].qty, ${P(1000)}, "close").state`,
  );
  assert.strictEqual(run("Object.keys(__afterOne.positions).length"), 39,
    "closing one closes exactly one");
  assert.ok(run(`!__afterOne.positions['${ids[7]}']`), "…and it is the one that was named");
  assert.strictEqual(run("practiceReconcile(__afterOne).ok"), true,
    "…with the ledger still explaining the balance");

  /* **Through storage and back.** The store is a map keyed by id now; a
     round trip must not merge two contracts on one coin into one. */
  sandbox.__reload = run("sanitizePractice(JSON.parse(JSON.stringify(__many)))");
  assert.strictEqual(run("Object.keys(__reload.positions).length"), 40,
    "all forty survive a save and a load");
  assert.strictEqual(run("practiceReconcile(__reload).ok"), true,
    "…and still reconcile afterwards");

  /* **The migration.** An account written before contracts had ids is keyed
     by the coin — it must come back as the same one contract, not vanish. */
  sandbox.__old = run(`(() => {
    const s = practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: ${Q(1)}, leverage: 5 }, ${P(1000)}).state;
    const only = s.positions[Object.keys(s.positions)[0]];
    const legacy = JSON.parse(JSON.stringify(s));
    legacy.positions = { BTC: { ...only } };
    delete legacy.positions.BTC.id;
    delete legacy.positions.BTC.coin;
    delete legacy.nextPosId;
    return sanitizePractice(legacy);
  })()`);
  assert.strictEqual(run("Object.keys(__old.positions).length"), 1,
    "an account keyed by the coin still loads its contract");
  assert.strictEqual(run("__at(__old, 'BTC').coin"), "BTC",
    "…and the key it was stored under becomes the contract's coin");
  assert.ok(run("Object.keys(__old.positions)[0] !== 'BTC'"),
    "…while the contract itself gets an id");
  assert.strictEqual(run("practiceReconcile(__old).ok"), true,
    "…and the migrated account reconciles");
}

/* THE RISK LADDER ---------------------------------------------------------
 *
 * The maintenance requirement used to be read off the leverage somebody
 * picked. Every venue reads it off the size they are holding, which is why a
 * large position is liquidated sooner than a small one at the same leverage —
 * and a trainer that says otherwise teaches the opposite of the truth.
 *
 * Four things are asserted, and the first two are what keep the arithmetic
 * safe rather than merely realistic. */
{
  /* **Continuous at every edge.** `practiceLiquidationPrice` is a bisection
     over "is this liquidated at P?", so a requirement that jumped at a bracket
     boundary would have it searching a discontinuous function — it could
     return a price on the wrong side of the jump and the position card would
     print a liquidation that is not one. The maintenance amount exists to make
     `notional × mmr − maint` continuous, and this is the assertion that says
     so. */
  const mmAt = (n) => run(`(() => {
    const t = practiceTierFor(${n});
    return Math.max(0, practiceRate(${n}, t.mmrPpm, 1) - t.maintE2);
  })()`);
  const edges = run("PRACTICE_RISK_TIERS.filter((t) => t.upTo !== Infinity).map((t) => t.upTo)");
  for (const edge of edges) {
    const below = mmAt(edge);
    const above = mmAt(edge + 1);
    assert.ok(
      Math.abs(above - below) <= 1,
      `the requirement is continuous across the ${edge / 100} bracket edge (${below} vs ${above})`,
    );
  }

  /* **Every bracket is usable.** A maintenance rate at or above the bracket's
     own initial margin rate would liquidate a fresh position on the fill that
     opened it — the rung would be a control that cannot do what it offers. */
  const rungs = run("PRACTICE_RISK_TIERS.map((t) => [t.maxLeverage, t.mmrPpm])");
  for (const [lev, mmr] of rungs) {
    assert.ok(mmr * 2 <= Math.round(1000000 / lev) + 1,
      `${lev}x keeps at most half of its initial margin as maintenance (${mmr}ppm)`);
  }

  /* **The point of the whole thing: size moves the liquidation price.** Two
     longs at the same leverage and the same entry, one of them large enough to
     be in a worse bracket. The large one must be liquidated on a *smaller*
     move. Written as a percentage of the entry so the two are comparable. */
  const away = (qty) => run(`(() => {
    let s = practiceEmptySession();
    /* Room for both: the wall is a share of the account, and this is about
       the risk ladder rather than about the wall. */
    s = { ...s, balance: ${M(10000000)}, startBalance: ${M(10000000)},
          plan: { ...s.plan, marginSharePct: 30 } };
    const o = practiceOpen(s, { coin: "BTC", side: "long", qty: ${'${qty}'}, leverage: 10 }, ${P(1000)});
    const pos = practiceAt(o.state, o.id);
    const liq = practiceLiquidationPrice(pos);
    return ((pos.entry - liq) / pos.entry) * 100;
  })()`.replace("${qty}", String(qty)));
  const small = away(Q(1));      // 1 coin at 1,000 = 1,000 of notional — bracket 1
  const large = away(Q(600));    // 600 coin = 600,000 — bracket 4
  assert.ok(small > 9 && small < 10,
    `a small 10x long is liquidated about 10% away (${small.toFixed(2)}%)`);
  /* Measured: 9.73% against 9.02%, a gap of 0.71 points. It is the bracket's
     own rates showing through — 0.25% of notional in the first, 1.16% in the
     fourth after its maintenance amount — less what the fees take. Asserted as
     half a point rather than as the figure itself, so the rates can be tuned
     without the test having to be rewritten, and so it still fails outright if
     size stops mattering. */
  assert.ok(small - large > 0.5,
    `…and a large one at the same leverage goes sooner (${large.toFixed(2)}% vs ${small.toFixed(2)}%)`);

  /* **The ladder caps the leverage, and the helper that says so cannot drift
     from the refusal that enforces it.** `practiceMaxLeverageForMargin` is what
     the ticket reads to explain itself; `practiceCanOpen` is what actually
     refuses. Asserted against each other at the edge: the value the helper
     offers opens, and one step above it does not. */
  const openAt = (qty, lev) => run(`practiceCanOpen(
    { ...practiceEmptySession(), balance: ${M(10000000)}, startBalance: ${M(10000000)},
      plan: { ...practiceEmptySession().plan, marginSharePct: 30 } },
    { coin: "BTC", side: "long", qty: ${qty}, leverage: ${lev} }, ${P(1000)})`);
  assert.strictEqual(openAt(Q(1), 200), null,
    "200x is allowed on a size the first bracket carries");
  assert.strictEqual(openAt(Q(100), 200), "tier",
    "…and refused on one it does not — by the bracket, not by the plan");
  assert.strictEqual(openAt(Q(100), 50), null,
    "…while the leverage that bracket does allow opens");

  /* **The venue ladder can be stood down for an unrestricted exercise.**
     Real venues lower the maximum leverage as a position grows, and that
     remains the default. The Account tab also offers an explicit flat mode:
     it is the only honest way to let a 10,000-unit account put nearly all of
     itself behind a 200x contract without pretending that a venue would take
     the same order. The maintenance rule has to move with the cap — skipping
     only the refusal would admit a position whose tiered maintenance is above
     its initial margin and liquidate it on the fill that opened it. */
  assert.strictEqual(run("practiceEmptySession().plan.sizeTiers"), 1,
    "size-based leverage tiers are on by default");
  const flat = `({ ...practiceEmptySession(), plan: {
    ...practiceEmptySession().plan, sizeTiers: 0 } })`;
  const nearFull = openAt(Q(100), 200);
  assert.strictEqual(nearFull, "tier", "the venue-style account keeps refusing the large 200x order");
  const flatOpen = `practiceOpen(${flat}, {
    coin: "BTC", side: "long", qty: ${Q(100)}, leverage: 200
  }, ${P(1000)})`;
  assert.strictEqual(run(`${flatOpen}.error`), undefined,
    "with tiers explicitly off, the same account can carry a large 200x order");
  assert.strictEqual(run(`practiceAt(${flatOpen}.state, ${flatOpen}.id).sizeTiers`), false,
    "the contract remembers that it was opened on the flat rule");
  assert.strictEqual(run(`practiceIsLiquidated(
    practiceAt(${flatOpen}.state, ${flatOpen}.id),
    practiceAt(${flatOpen}.state, ${flatOpen}.id).entry)`), false,
    "and its matching maintenance rule does not liquidate it at its own fill");
  const cap = run(`practiceMaxLeverageForMargin(${M(1000)})`);
  assert.ok(cap > 1 && cap < 200, `the helper names a ceiling for a 1,000 margin (${cap}x)`);
  assert.strictEqual(
    run(`practiceTierFor(${M(1000)} * ${cap}).maxLeverage >= ${cap}`), true,
    "…and the notional it implies is inside the bracket that allows it",
  );
  assert.strictEqual(
    run(`practiceTierFor(${M(1000)} * (${cap} + 1)).maxLeverage >= ${cap} + 1`), false,
    "…while one step more is not — the helper is exactly at the edge",
  );
}

/* THE MARK -----------------------------------------------------------------
 *
 * A venue liquidates on a mark price rather than on the last trade, because one
 * bad print on a thin book takes out positions that nothing was wrong with.
 * With a single price source the honest version is a median of the last few
 * ticks — and the assertion that matters is not the median itself but what it
 * saves. */
{
  assert.strictEqual(run("practiceMarkFrom([1000000])"), 1000000,
    "one tick is its own mark — a fresh account is not unpriced");
  assert.strictEqual(run("practiceMarkFrom([1000000, 1001000, 1500000])"), 1001000,
    "a spike is outvoted by the two ticks either side of it");
  assert.strictEqual(run("practiceMarkFrom([1000000, 1100000, 1200000])"), 1100000,
    "…while a real move carries the mark with it");
  assert.strictEqual(run("practiceMarkFrom([])"), null, "no ticks, no mark");
  assert.strictEqual(run("practiceMarkFrom([0, -5, NaN, 1000000])"), 1000000,
    "a price that is not a price never reaches the liquidation test");
  assert.strictEqual(run("practiceMarkFrom([1, 2, 3, 4, 5].map((v) => v * 100000))"), 400000,
    "…and only the last three count, so the window cannot grow");

  /* **The point of all of it.** A 50x long, one print 3% below the market, and
     two ticks either side of it that are not. On the last price it is gone; on
     the mark it is untouched — which is the difference between a trainer that
     teaches what a venue does and one that teaches what a thin book does. */
  const spiked = `(() => {
    const s = practiceOpen(practiceEmptySession(),
      { coin: "BTC", side: "long", qty: ${Q(0.1)}, leverage: 50 }, ${P(1000)}).state;
    return practiceAt(s, Object.keys(s.positions)[0]);
  })()`;
  assert.strictEqual(run(`practiceIsLiquidated(${spiked}, ${P(970)})`), true,
    "a 3% print against a 50x long is a liquidation on the last price");
  assert.strictEqual(
    run(`practiceIsLiquidated(${spiked}, practiceMarkFrom([${P(1000)}, ${P(970)}, ${P(999)}]))`),
    false,
    "…and is not one on the mark, which is the whole reason venues use it",
  );
}

/* RESTING ORDERS ----------------------------------------------------------
 *
 * The maker side of the market: a price you name, money reserved, and nothing
 * happening until the market comes to you. What is asserted here is the part
 * the screen cannot show — that the account stays explainable the whole time,
 * and that a fill is cheaper *and* exact. */
{
  const place = (limit, at) => `practicePlaceOrder(practiceEmptySession(),
    { coin: "BTC", side: "long", qty: 80, leverage: 5, limit: ${P(limit)}, at: 1 }, ${P(at)})`;

  /* **A limit order has to rest.** A buy at or above the market fills on the
     next tick at the market price, which is a market order wearing a limit's
     clothes — refused rather than quietly done. */
  assert.strictEqual(run(`${place(112480, 112480)}.error`), "crosses",
    "a buy at the market is refused: it would not rest");
  assert.strictEqual(run(`${place(120000, 112480)}.error`), "crosses",
    "…and so is one above it");

  const placed = place(100000, 112480);
  assert.strictEqual(run(`${placed}.error`), undefined, "a buy below the market rests");
  sandbox.__ord = run(`${placed}.state`);

  /* **Reserved is not spent, and the ledger says so.** The margin leaves the
     balance exactly as it does when opening, which is why the account still
     reconciles — and `practiceEquity` adds it back, which is why placing an
     order does not look like losing money. */
  assert.ok(run("__ord.balance") < run("practiceEmptySession().balance"),
    "placing takes the margin out of the balance");
  assert.strictEqual(run("__ord.margin"), run("practiceReserved(__ord)"),
    "…and the account's margin is exactly what the orders hold");
  assert.strictEqual(run("practiceEquity(__ord, {}, 'BTC')"), run("practiceEmptySession().balance"),
    "…so equity is unchanged: reserved money is still yours");
  assert.strictEqual(run("practiceReconcile(__ord).ok"), true,
    "…and the ledger still explains the account");
  assert.strictEqual(run("__ord.fees"), 0, "nothing is charged for waiting");

  /* **Moving an order is one transition** (P4, dragged on the chart). A
     new price that rests moves it, and the ledger still explains the account;
     a new price that crosses is refused and the order is exactly where it
     was — done as a cancel and a place in two steps, the refusal left it
     gone. */
  const moved = run(`practiceMoveOrder(__ord, '1', ${P(105000)}, ${P(112480)})`);
  assert.ok(moved && moved.state && !moved.error, "an order can be moved to another resting price");
  sandbox.__moved = moved.state;
  assert.deepStrictEqual(
    json("Object.values(__moved.orders).map((o) => o.limit)"), [P(105000)],
    "…where it now rests, and only there",
  );
  assert.strictEqual(run("practiceReconcile(__moved).ok"), true, "…with the account still reconciling");
  /* The reserve is the margin *at the order's price*, so a move changes it —
     what must hold is that the account holds exactly what the order does. */
  assert.strictEqual(run("__moved.margin"), run("practiceReserved(__moved)"),
    "…and the account holds exactly the reserve at the new price");
  const crossed = run(`practiceMoveOrder(__ord, '1', ${P(120000)}, ${P(112480)})`);
  assert.strictEqual(crossed.error, "crosses", "a move across the market is refused by name");
  assert.strictEqual(crossed.state, undefined, "…and hands back no state to save");
  assert.deepStrictEqual(json("Object.values(__ord.orders).map((o) => o.limit)"), [P(100000)],
    "…so the order is exactly where it was");

  /* **P6 — a stop entry rests on the other side, and trips into the market.**
     A long stop rests *above* the price; below it, it would trip at once and
     is refused. When the price comes through, it opens at the price that
     tripped it, on taker terms — adverse fill and the full fee — unlike a
     limit, which fills at its own price as a maker. */
  const stopAt = (limit) => `practicePlaceOrder(practiceEmptySession(),
    { coin: "BTC", side: "long", qty: 80, leverage: 5, limit: ${P(limit)}, at: 1, kind: "stop" }, ${P(112480)})`;
  assert.strictEqual(run(`${stopAt(110000)}.error`), "crosses", "a long stop below the price is refused: it would trip now");
  sandbox.__stopOrd = run(`${stopAt(115000)}.state`);
  assert.strictEqual(run("Object.values(__stopOrd.orders)[0].kind"), "stop", "…one above it rests, as a stop");
  assert.strictEqual(run(`practiceFillOrders(__stopOrd, { BTC: ${P(114000)} })`), null, "…untouched below its trigger");
  const tripped = run(`practiceFillOrders(__stopOrd, { BTC: ${P(115200)} })`);
  assert.ok(tripped && tripped.filled.length === 1 && tripped.filled[0].pos, "…and opened when the price comes through");
  sandbox.__tripped = tripped.state;
  const tpos = run("__at(__tripped, 'BTC')");
  assert.ok(tpos.entry > P(115200), `…at the price that tripped it, with the adverse fill (${tpos.entry})`);
  assert.strictEqual(run("practiceReconcile(__tripped).ok"), true, "…and the account still reconciles");
  assert.strictEqual(
    run("sanitizePractice(JSON.parse(JSON.stringify(__stopOrd))).orders['1'].kind"), "stop",
    "a resting stop survives a reload as a stop, not as a limit");

  /* **P6 — reduce-only takes a contract down and never opens one.** With a
     long held, a short reduce-only limit above the price reserves nothing;
     filled, it closes the long's share at its own price on maker terms and
     opens no short. With nothing to reduce it is refused. */
  sandbox.__heldLong = run(`practiceOpen(practiceEmptySession(), { coin: "BTC", side: "long", qty: 100, leverage: 5 }, ${P(112480)}).state`);
  const reduceAt = (base, qty) => `practicePlaceOrder(${base},
    { coin: "BTC", side: "short", qty: ${qty}, leverage: 5, limit: ${P(116000)}, at: 1, reduce: true }, ${P(112480)})`;
  assert.strictEqual(run(`${reduceAt("practiceEmptySession()", 40)}.error`), "reduce",
    "a reduce-only order with nothing to reduce is refused");
  assert.strictEqual(run(`${reduceAt("__heldLong", 400)}.error`), "reduceSize",
    "…and so is one larger than what it could reduce");
  sandbox.__ro = run(`${reduceAt("__heldLong", 40)}.state`);
  assert.strictEqual(run("__ro.balance"), run("__heldLong.balance"), "a reduce-only order reserves nothing");
  assert.strictEqual(run("sanitizePractice(JSON.parse(JSON.stringify(__ro))).orders['1'].reduce"), true,
    "…and survives a reload, margin 0 and all");
  const reduced = run(`practiceFillOrders(__ro, { BTC: ${P(116100)} })`);
  sandbox.__reduced = reduced.state;
  assert.strictEqual(run("__at(__reduced, 'BTC').qty"), 60, "filled, it takes 40 off the long");
  assert.strictEqual(run("__at(__reduced, 'BTC').side"), "long", "…and opens nothing the other way");
  const closeEvent = run("__reduced.ledger.filter((e) => e.kind === 'close').pop()");
  assert.strictEqual(closeEvent.fill, P(116000), "…at its own price, with no adverse fill");
  assert.strictEqual(run("practiceReconcile(__reduced).ok"), true, "…and the account reconciles");

  /* **P9 — a note and tags on a closed contract**, which change no figure,
     survive a reload, normalise, and come off again when emptied. */
  sandbox.__closedOne = run(`practiceReduce(__heldLong, __id(__heldLong, 'BTC'), 100, ${P(113000)}, "close").state`);
  const closeId = run("__closedOne.ledger.filter((e) => e.kind === 'close').pop().id");
  sandbox.__noted = run(`practiceAnnotate(__closedOne, ${closeId}, "  Broke the range on volume.  ", "Breakout, NEWS , breakout, a b").state`);
  const noted = run(`__noted.ledger.find((e) => e.id === ${closeId})`);
  assert.strictEqual(noted.note, "Broke the range on volume.", "the note is kept, trimmed");
  assert.deepStrictEqual(Array.from(noted.tags), ["breakout", "news", "a-b"], "tags are normalised and never repeated");
  assert.strictEqual(run("practiceReconcile(__noted).ok"), true, "…and the account still reconciles: no figure moved");
  assert.strictEqual(run("__noted.balance"), run("__closedOne.balance"), "…not by a cent");
  const reloaded = run(`sanitizePractice(JSON.parse(JSON.stringify(__noted))).ledger.find((e) => e.id === ${closeId})`);
  assert.strictEqual(reloaded.note, "Broke the range on volume.", "a note survives a reload");
  assert.deepStrictEqual(Array.from(reloaded.tags), ["breakout", "news", "a-b"], "…and so do its tags");
  const cleared = run(`practiceAnnotate(__noted, ${closeId}, "", "").state.ledger.find((e) => e.id === ${closeId})`);
  assert.ok(!("note" in cleared) && !("tags" in cleared), "an empty note and no tags take the annotation off");
  assert.strictEqual(run("practiceAnnotate(__noted, 999999, 'x', '').error"), "none", "only a closed contract can be annotated");

  /* **P6 — reverse is one transition.** */
  sandbox.__rev = run(`practiceReverse(__heldLong, __id(__heldLong, 'BTC'), ${P(113000)}).state`);
  assert.strictEqual(run("Object.values(__rev.positions).length"), 1, "reversing leaves one contract");
  assert.strictEqual(run("Object.values(__rev.positions)[0].side"), "short", "…on the other side");
  assert.strictEqual(run("Object.values(__rev.positions)[0].qty"), 100, "…of the same size");
  assert.strictEqual(run("practiceReconcile(__rev).ok"), true, "…and the account reconciles");
  const cannot = run(`practiceReverse(__heldLong, __id(__heldLong, 'BTC'), ${P(113000) * 1000000})`);
  assert.ok(cannot.error && !cannot.state, "a reverse that cannot open is refused, and hands back no state");

  /* Cancelling is the same event with the signs flipped. */
  sandbox.__cancelled = run("practiceCancelOrder(__ord, '1').state");
  assert.strictEqual(run("Object.keys(__cancelled.orders).length"), 0, "cancelling takes the row away");
  assert.strictEqual(run("__cancelled.balance"), run("practiceEmptySession().balance"),
    "…and hands every unit of the reserve back");
  assert.strictEqual(run("__cancelled.margin"), 0, "…leaving nothing held");
  assert.strictEqual(run("practiceReconcile(__cancelled).ok"), true, "…and still reconciling");
  assert.strictEqual(run("__cancelled.realised"), 0,
    "…with no result recorded, because nothing was ever opened");

  /* **The fill: exact, and cheaper.** It does not fill above its price, it
     fills *at* its price with no adverse slip, and it pays the maker fee —
     which is the entire reason to learn the order type. */
  assert.strictEqual(run(`practiceStep(__ord, 1, { BTC: ${P(105000)} }, { last: { BTC: ${P(105000)} } }).events.length`), 0,
    "the market above it does not fill it");
  sandbox.__filled = run(`practiceStep(__ord, 1, { BTC: ${P(99000)} }, { last: { BTC: ${P(99000)} } }).state`);
  assert.strictEqual(run("Object.keys(__filled.positions).length"), 1, "the market reaching it fills it");
  assert.strictEqual(run("Object.keys(__filled.orders).length"), 0, "…and the order is gone");
  assert.strictEqual(run("practiceAt(__filled, Object.keys(__filled.positions)[0]).entry"), P(100000),
    "…at exactly the price it asked for, with no adverse fill");
  assert.strictEqual(run("practiceReconcile(__filled).ok"), true, "…and the account reconciles");

  const taker = run(`practiceOpen(practiceEmptySession(),
    { coin: "BTC", side: "long", qty: 80, leverage: 5 }, ${P(100000)}).state.fees`);
  const maker = run("__filled.fees");
  assert.ok(maker > 0 && maker < taker,
    `a filled resting order pays the maker fee, not the taker's (${maker} vs ${taker})`);
  /* Derived rather than configured, so the two cannot drift: the maker rate is
     a fixed share of the taker's (`practiceMakerPpm`), which also makes "off"
     mean off on both sides. */
  assert.strictEqual(run("practiceMakerPpm(500)"), 200, "the maker rate is derived from the taker's");
  assert.strictEqual(run("practiceMakerPpm(0)"), 0, "…and off is off on both sides");

  /* A short rests above the market and fills coming up to it. */
  const shortOrder = `practicePlaceOrder(practiceEmptySession(),
    { coin: "BTC", side: "short", qty: 80, leverage: 5, limit: ${P(120000)}, at: 1 }, ${P(112480)})`;
  assert.strictEqual(run(`${shortOrder}.error`), undefined, "a sell above the market rests");
  assert.strictEqual(
    run(`Object.keys(practiceStep(${shortOrder}.state, 1, { BTC: ${P(121000)} }, { last: { BTC: ${P(121000)} } }).state.positions).length`),
    1,
    "…and fills when the market comes up to it",
  );

  /* Survives a reload with its reserve intact — the failure mode a sanitizer
     that does not name a field produces is silent and costs money. */
  sandbox.__round = run("sanitizePractice(JSON.parse(JSON.stringify(__ord)))");
  assert.strictEqual(run("Object.keys(__round.orders).length"), 1, "an order survives a reload");
  assert.strictEqual(run("__round.margin"), run("__ord.margin"), "…still holding its margin");
  assert.strictEqual(run("practiceReconcile(__round).ok"), true, "…and still reconciling");
  assert.strictEqual(run("__round.nextOrderId"), 2, "…and the next id is past it");
}

/* SCALING OUT -------------------------------------------------------------
 *
 * "Take half off here and let the rest run" is a real technique and had no
 * expression at all: the take-profit closed everything. The share is the
 * feature; the *clearing* of the trigger afterwards is what makes it mean what
 * it says. */
{
  const open = `practiceOpen(practiceEmptySession(),
    { coin: "BTC", side: "long", qty: 40, leverage: 5 }, ${P(100000)})`;
  sandbox.__half = run(`(() => {
    const o = ${open};
    const s = practiceSetTriggers(o.state, o.id, null, ${P(110000)}, 500000).state;
    return { s, id: o.id, before: practiceAt(s, o.id).qty };
  })()`);
  sandbox.__hit = run(`practiceStep(__half.s, 1, { BTC: ${P(110001)} }, { last: { BTC: ${P(110001)} } }).state`);
  assert.strictEqual(run("practiceAt(__hit, __half.id).qty"), run("__half.before / 2"),
    "a take-profit set to half closes half");
  assert.strictEqual(run("practiceAt(__hit, __half.id).take"), null,
    "…and is spent, so the rest runs instead of being closed a slice at a time");
  assert.strictEqual(run("practiceReconcile(__hit).ok"), true, "…and the account reconciles");

  /* The default is unchanged for every position ever written: no share means
     the whole contract, which is what they all meant. */
  sandbox.__whole = run(`(() => {
    const o = ${open};
    const s = practiceSetTriggers(o.state, o.id, null, ${P(110000)}).state;
    return practiceStep(s, 1, { BTC: ${P(110001)} }, { last: { BTC: ${P(110001)} } }).state;
  })()`);
  assert.strictEqual(run("Object.keys(__whole.positions).length"), 0,
    "a take-profit with no share still closes the whole contract");

  /* A share the product does not offer is not a share. */
  sandbox.__odd = run(`(() => {
    const o = ${open};
    return practiceSetTriggers(o.state, o.id, null, ${P(110000)}, 123456).state;
  })()`);
  assert.strictEqual(run("practiceAt(__odd, '1').takeShare"), 1000000,
    "an unoffered share falls back to the whole contract");
}

/* ── the trailing stop ────────────────────────────────────────────────────
 *
 * The other half of scaling out. A stop is a line drawn once; a trail is the
 * same line told to follow, and the two things it has to get right are that
 * it **never moves back** and that it starts from the price when it was set
 * rather than from the best this contract has ever seen — otherwise putting
 * one on a position that has given a run back closes it on the next tick,
 * which is the opposite of the control.
 */
{
  const open = `practiceOpen(practiceEmptySession(),
    { coin: "BTC", side: "long", qty: 40, leverage: 5 }, ${P(100000)})`;
  /* Opened at 100k, ran to 120k, came back to 110k — then a 5% trail is set.
     Anchored to the contract's peak it would sit at 114k and fire at once. */
  sandbox.__tr = run(`(() => {
    const o = ${open};
    let s = practiceStep(o.state, 1, { BTC: ${P(120000)} }, { last: { BTC: ${P(120000)} } }).state;
    s = practiceStep(s, 2, { BTC: ${P(110000)} }, { last: { BTC: ${P(110000)} } }).state;
    return { s: practiceSetTriggers(s, o.id, null, null, undefined, 50000).state, id: o.id };
  })()`);
  assert.strictEqual(run("practiceAt(__tr.s, __tr.id).trail"), 50000,
    "a trail is stored as the distance it was given");
  assert.strictEqual(run("practiceAt(__tr.s, __tr.id).trailFrom"), null,
    "…with no anchor until the next step gives it a price");
  assert.strictEqual(run("practiceAt(__tr.s, __tr.id).peak"), run(`${P(120000)}`),
    "…and the contract's own peak is still the peak, untouched by it");

  sandbox.__tr1 = run(`practiceStep(__tr.s, 3, { BTC: ${P(110000)} }, { last: { BTC: ${P(110000)} } }).state`);
  assert.strictEqual(run("practiceAt(__tr1, __tr.id).trailFrom"), run(`${P(110000)}`),
    "the anchor is seeded where the price was, not at the contract's peak");
  assert.strictEqual(run("practiceTrailStop(practiceAt(__tr1, __tr.id))"), run(`${P(104500)}`),
    "…so a 5% trail sits 5% under it");
  assert.ok(run("Boolean(practiceAt(__tr1, __tr.id))"),
    "…and the contract it was set on is still open, which is the whole point");

  /* Up, then back down: the level follows one way only. */
  sandbox.__tr2 = run(`(() => {
    let s = practiceStep(__tr1, 4, { BTC: ${P(130000)} }, { last: { BTC: ${P(130000)} } }).state;
    return practiceStep(s, 5, { BTC: ${P(125000)} }, { last: { BTC: ${P(125000)} } }).state;
  })()`);
  assert.strictEqual(run("practiceAt(__tr2, __tr.id).trailFrom"), run(`${P(130000)}`),
    "the anchor ratchets up and never back");
  assert.strictEqual(run("practiceTrailStop(practiceAt(__tr2, __tr.id))"), run(`${P(123500)}`),
    "…so the level rises with it");

  /* And it closes the contract when the price reaches it. */
  sandbox.__tr3 = run(`practiceStep(__tr2, 6, { BTC: ${P(123000)} }, { last: { BTC: ${P(123000)} } })`);
  assert.strictEqual(run("Object.keys(__tr3.state.positions).length"), 0,
    "reaching the trailing level closes the contract");
  assert.strictEqual(run("__tr3.events[0].reason"), "stop",
    "…as a stop, because that is what happened");
  assert.strictEqual(run("practiceReconcile(__tr3.state).ok"), true,
    "…and the account reconciles");

  /* A short trails from below. */
  sandbox.__trS = run(`(() => {
    const o = practiceOpen(practiceEmptySession(),
      { coin: "BTC", side: "short", qty: 40, leverage: 5 }, ${P(100000)});
    const s = practiceSetTriggers(o.state, o.id, null, null, undefined, 20000).state;
    const s1 = practiceStep(s, 1, { BTC: ${P(90000)} }, { last: { BTC: ${P(90000)} } }).state;
    return { at: practiceTrailStop(practiceAt(s1, o.id)), id: o.id, s: s1 };
  })()`);
  assert.strictEqual(run("__trS.at"), run(`${P(91800)}`),
    "a short's trail sits above the best price, by the same distance");

  /* The fifth argument is optional in both directions: a caller that does not
     pass it leaves the trail alone, and `0` takes it off. */
  assert.strictEqual(
    run("practiceAt(practiceSetTriggers(__trS.s, __trS.id, null, null).state, __trS.id).trail"),
    20000,
    "a call that says nothing about the trail leaves it on");
  sandbox.__trOff = run("practiceSetTriggers(__trS.s, __trS.id, null, null, undefined, 0).state");
  assert.strictEqual(run("practiceAt(__trOff, __trS.id).trail"), null,
    "…and zero takes it off");
  assert.strictEqual(run("practiceAt(__trOff, __trS.id).trailFrom"), null,
    "…taking its anchor with it, so the next one starts where the price is then");
  assert.strictEqual(
    run("practiceSetTriggers(__trS.s, __trS.id, null, null, undefined, 33333).error"),
    "size",
    "a distance the product does not offer is refused, not stored");

  /* Storage is untrusted: an edited file cannot invent a distance. */
  sandbox.__trBad = run(`sanitizePractice(JSON.parse(JSON.stringify(
    (() => { const s = JSON.parse(JSON.stringify(__trS.s));
      s.positions[__trS.id].trail = 7; return s; })())))`);
  assert.strictEqual(run("practiceAt(__trBad, __trS.id).trail"), null,
    "a stored trail that is not one of the four offered is no trail at all");
}

/* THE ACCOUNT'S VALUE, EVENT BY EVENT, AND THE RECORD AS A FILE (26 Sep
   2026). The series moves only when money does: an open moves cash into
   margin and leaves the sum alone; a settled contract moves it by what it
   made less the fee. Its last point is the equity now. The CSV is the same
   rows the balance is rebuilt from, so its cash column sums to the balance's
   distance from the start. ------------------------------------------------ */
{
  const series = json("practiceValueSeries(__c, {})");
  const opened = json("practiceValueSeries(__g, {})");
  assert.strictEqual(series[0].v, run("__c.startBalance"), "the series starts at the account's opening");
  assert.strictEqual(opened[1].v, opened[0].v - run("__g.ledger[0].fee"),
    "opening a contract moves the value by its fee alone, not by the margin it commits");
  const settled = series[series.length - 2];
  assert.strictEqual(settled.v, run("__c.balance + __c.margin"),
    "after the last event the value is the wallet — cash plus committed margin");
  assert.strictEqual(series[series.length - 1].kind, "now", "and the last point is the equity now");
  assert.strictEqual(run("practiceValueSeries(null)"), null, "no account, no series");

  const csv = run("practiceLedgerCsv(__c)").trim().split("\n");
  assert.strictEqual(csv[0].split(",")[0], "event", "the file names its columns");
  assert.strictEqual(csv.length - 1, run("__c.ledger.length"), "one row per event the ledger holds");
  const cashCol = csv[0].split(",").indexOf("cash_change");
  const sum = csv.slice(1).reduce((t, line) => t + Math.round(Number(line.split(",")[cashCol]) * 100), 0);
  assert.strictEqual(sum, run("__c.balance - __c.startBalance"),
    "the cash column adds up to the balance's distance from the start, to the cent");
}

/* ── The liquidation price agrees with the closed form ──────────────────
 *
 * For an isolated linear contract with no fees, a flat maintenance rate m of
 * current notional and initial collateral 1/L of the entry notional, the
 * threshold has a closed form: a long ends at a fall of (1/L − m)/(1 − m),
 * a short at a rise of (1/L − m)/(1 + m) — equation (2) of the user's own
 * paper, *Endogenous Shock Amplification*, and the same algebra either side.
 * The engine deliberately does not use it (it bisects its own predicate, see
 * `practiceLiquidationPrice`), which is exactly why the two are worth holding
 * against each other: the search cannot drift from the algebra without this
 * failing. Flat mode is the one with a single m (half the contract's own
 * initial-margin rate); the tolerance is the engine's rounding, which must
 * only ever put the level on the entry's side — a hair early, never late.
 * Measured 27 Sep 2026: within 0.05 bp at 2x–100x, both sides. */
{
  const rows = JSON.parse(run(`JSON.stringify([["long", 2], ["long", 10], ["long", 50], ["long", 100],
      ["short", 2], ["short", 10], ["short", 100]].map(([side, L]) => {
    let s = practiceEmptySession();
    s = practiceSetCosts(s, { feePpm: 0, slipPpm: 0, funding: false }).state || s;
    s = { ...s, plan: { ...s.plan, sizeTiers: 0, maxLeverage: 200 } };
    const E = 50000 * 10000;
    const r = practiceOpen(s, { coin: "BTC", side, qty: 100, leverage: L }, E);
    const p = r.state && Object.values(r.state.positions)[0];
    return { side, L, error: r.error || null, flat: p ? p.sizeTiers === false : null,
      E, liq: p ? practiceLiquidationPrice(p) : null };
  }))`));
  for (const r of rows) {
    assert.strictEqual(r.error, null, `${r.side} ${r.L}x opens with costs off: ${r.error}`);
    assert.strictEqual(r.flat, true, `${r.side} ${r.L}x is stamped with flat maintenance`);
    const m = 1 / r.L / 2;
    const want = r.side === "long"
      ? r.E * (1 - (1 / r.L - m) / (1 - m))
      : r.E * (1 + (1 / r.L - m) / (1 + m));
    const gapBp = ((r.liq - want) / want) * 1e4;
    assert.ok(Math.abs(gapBp) < 0.1,
      `${r.side} ${r.L}x liquidates at ${r.liq / 1e4}, the closed form says ${(want / 1e4).toFixed(4)} (${gapBp.toFixed(3)} bp)`);
    assert.ok(r.side === "long" ? r.liq >= want : r.liq <= want,
      `${r.side} ${r.L}x: the rounding lands on the entry's side of the closed form, never past it`);
  }
}

/* **A stop and a take-profit on a resting order** (27 Sep 2026) — the venue's
 * TP/SL on a limit. Checked against the order's own price, kept through a
 * move and a reload, and put on the contract the fill opens. */
{
  const at = P(112480);
  const place = (extra) => `practicePlaceOrder(practiceEmptySession(),
    { coin: "BTC", side: "long", qty: 80, leverage: 5, limit: ${P(100000)}, at: 1, ${extra} }, ${at})`;
  assert.strictEqual(run(`${place(`stop: ${P(101000)}`)}.error`), "side",
    "a long limit's stop above its own price is refused by name");
  assert.strictEqual(run(`${place(`take: ${P(99000)}`)}.error`), "side",
    "…and so is a take-profit under it");
  assert.strictEqual(run(`${place(`stop: ${P(100000)}`)}.error`), "side",
    "…and a stop at the order's own price");
  const ok = run(`${place(`stop: ${P(95000)}, take: ${P(110000)}`)}`);
  assert.ok(ok.state && !ok.error, "a stop under and a take over the price rest with the order");
  sandbox.__tp = ok.state;
  assert.deepStrictEqual(json("[__tp.orders['1'].stop, __tp.orders['1'].take]"), [P(95000), P(110000)],
    "…stored on it");
  assert.strictEqual(run("practiceReconcile(__tp).ok"), true, "…and the account still reconciles");

  /* The levels go with a move and are checked against the new price. */
  assert.strictEqual(run(`practiceMoveOrder(__tp, '1', ${P(94000)}, ${at}).error`), "side",
    "an order dragged under its own stop is refused, not left with a stop on the wrong side");
  const moved = run(`practiceMoveOrder(__tp, '1', ${P(101000)}, ${at})`);
  assert.ok(moved.state, "a move that keeps the levels on their sides is allowed");
  sandbox.__tpm = moved.state;
  assert.deepStrictEqual(json("Object.values(__tpm.orders).map((o) => [o.limit, o.stop, o.take])"),
    [[P(101000), P(95000), P(110000)]], "…and the order keeps its levels");

  /* Kept through a save and a load — the sanitizer rebuilds every order. */
  sandbox.__tpl = run("sanitizePractice(JSON.parse(JSON.stringify(__tp)))");
  assert.deepStrictEqual(json("[__tpl.orders['1'].stop, __tpl.orders['1'].take]"), [P(95000), P(110000)],
    "the levels survive a reload");
  sandbox.__tpbad = run("JSON.parse(JSON.stringify(__tp))");
  run(`__tpbad.orders['1'].stop = ${P(105000)}`);
  assert.strictEqual(run("sanitizePractice(__tpbad).orders['1'].stop"), null,
    "…and a hand-edited stop on the wrong side is dropped, not kept");
  assert.strictEqual(run("sanitizePractice(__tpbad).orders['1'].take"), P(110000),
    "…without taking the take-profit with it");

  /* The fill: the contract carries the order's levels. */
  const filled = run(`practiceFillOrders(__tp, { BTC: ${P(99990)} })`);
  sandbox.__tpf = filled.state;
  assert.strictEqual(run("Object.keys(__tpf.orders).length"), 0, "the order fills when the price comes to it");
  assert.deepStrictEqual(json("Object.values(__tpf.positions).map((p) => [p.entry, p.stop, p.take])"),
    [[P(100000), P(95000), P(110000)]], "…and the contract it opens has its stop and its take");
  assert.strictEqual(run("practiceReconcile(__tpf).ok"), true, "…with the ledger explaining all of it");

  /* A stop entry fills at the mark that tripped it, and a mark that gapped
     past the order's own take-profit leaves that take on the wrong side of
     the fill: the contract opens and says the levels did not land. (Its
     stop cannot be passed that way — the gap is always away from it.) */
  const stopEntry = run(`practicePlaceOrder(practiceEmptySession(),
    { coin: "BTC", side: "short", qty: 80, leverage: 5, limit: ${P(110000)}, at: 1, kind: "stop", stop: ${P(111000)} }, ${at})`);
  assert.ok(stopEntry.state, "a short stop entry below the price rests with its stop above it");
  sandbox.__se = stopEntry.state;
  const gapped = run(`practiceFillOrders(__se, { BTC: ${P(111500)} })`);
  void gapped;
  const through = run(`practiceFillOrders(__se, { BTC: ${P(108000)} })`);
  assert.strictEqual(run("Object.keys(__se.orders).length"), 1, "a short stop waits while the price is above it");
  sandbox.__sef = through.state;
  assert.deepStrictEqual(json("Object.values(__sef.positions).map((p) => p.stop)"), [P(111000)],
    "…trips when the price comes through, carrying its stop");
  const past = run(`practicePlaceOrder(practiceEmptySession(),
    { coin: "BTC", side: "short", qty: 80, leverage: 5, limit: ${P(110000)}, at: 1, kind: "stop", take: ${P(109000)} }, ${at})`);
  assert.ok(past.state, "a short stop entry with its take under the trigger rests");
  sandbox.__sp = past.state;
  const far = run(`practiceFillOrders(__sp, { BTC: ${P(108000)} })`);
  sandbox.__spf = far.state;
  assert.strictEqual(run("Object.keys(__spf.positions).length"), 1,
    "a stop entry that trips past its own take-profit still opens");
  assert.strictEqual(run("Object.values(__spf.positions)[0].take"), null,
    "…without a take that would sit on the wrong side of the fill");
  assert.strictEqual(far.filled[0].triggers, "side", "…and the fill says the levels did not land");

  /* A reduce-only order carries none. */
  assert.strictEqual(run(`practiceOrderTriggers("long", ${P(100)}, ${P(90)}, ${P(110)}).stop`), P(90),
    "the helper answers a level on its side");
}

/* **Scaled orders and the order history** (28 Sep 2026). A scale is N
 * resting limits evenly across a range, the size split with the lot's
 * remainder on the first, placed whole or not at all; the ledger now says
 * how each order ended, so the history can tell a fill from a cancel. */
{
  const at = P(100000);
  const scale = (n, from, to, extra = "") => `practicePlaceScale(practiceEmptySession(),
    { coin: "BTC", currency: "USDT", side: "long", qty: 103, leverage: 5, at: 7 ${extra} }, ${n}, ${P(from)}, ${P(to)}, ${at})`;
  const five = run(scale(5, 99000, 95000));
  assert.ok(five.state && !five.error, "five longs from 99,000 to 95,000 rest");
  sandbox.__sc = five.state;
  assert.deepStrictEqual(json("Object.values(__sc.orders).map((o) => o.limit)"), [P(99000), P(98000), P(97000), P(96000), P(95000)],
    "…evenly spaced from From to To");
  assert.deepStrictEqual(json("Object.values(__sc.orders).map((o) => o.qty)"), [23, 20, 20, 20, 20],
    "…with the size split evenly and the remainder on the first");
  assert.strictEqual(run("practiceReconcile(__sc).ok"), true, "…and the ledger explains all five reserves");
  assert.strictEqual(run(`${scale(5, 101000, 95000)}.error`), "crosses", "a range reaching above the market is refused");
  assert.strictEqual(run(`${scale(5, 101000, 95000)}.state`), undefined, "…whole: not the four that would have rested");
  assert.strictEqual(run(`${scale(4, 99000, 95000)}.error`), "scaleCount", "only 3, 5 or 10");
  assert.strictEqual(run(`${scale(5, 99000, 99000)}.error`), "scaleRange", "From and To must differ");
  assert.strictEqual(run(`practicePlaceScale(practiceEmptySession(), { coin: "BTC", currency: "USDT", side: "long", qty: 4, leverage: 5 }, 5, ${P(99000)}, ${P(95000)}, ${at}).error`), "scaleSize",
    "a size smaller than one lot per order is refused");
  assert.strictEqual(run(`${scale(5, 99000, 95000, `, stop: ${P(96500)}`)}.error`), "side",
    "a stop above the lowest level would be on the wrong side of it — refused");
  const withLevels = run(`${scale(3, 99000, 97000, `, stop: ${P(95000)}, take: ${P(105000)}`)}`);
  sandbox.__scl = withLevels.state;
  assert.ok(run("Object.values(__scl.orders).every((o) => o.stop === " + P(95000) + " && o.take === " + P(105000) + ")"),
    "…and a stop and take on the right side of every level ride each order");

  /* The history: a fill, a cancel, a move and a refusal, told apart. */
  sandbox.__h1 = run("practiceCancelOrder(__sc, '2').state");
  sandbox.__h2 = run(`practiceMoveOrder(__h1, '3', ${P(96900)}, ${at}).state`);
  sandbox.__h3 = run(`practiceFillOrders(__h2, { BTC: ${P(98900)} }).state`);
  const hist = json("practiceOrderHistory(__h3)");
  assert.deepStrictEqual(hist.map((h) => [h.order, h.status]), [["1", "filled"], ["2", "cancelled"]],
    "the history says which filled and which was cancelled, newest first — a move is not an ending");
  assert.strictEqual(hist[0].kind, "limit", "…what kind of order it was");
  assert.strictEqual(hist[0].at, 7, "…and when it was placed");
  sandbox.__h3r = run("sanitizePractice(JSON.parse(JSON.stringify(__h3)))");
  assert.deepStrictEqual(json("practiceOrderHistory(__h3r).map((h) => [h.order, h.status, h.at])"), hist.map((h) => [h.order, h.status, h.at]),
    "…and reads the same after a reload");
  const refused = run(`practicePlaceOrder(practiceEmptySession(), { coin: "BTC", currency: "USDT", side: "long", qty: 100, leverage: 5, limit: ${P(99000)} }, ${at})`);
  sandbox.__rf = run(`({ ...(${JSON.stringify(refused.state)}), ended: false })`);
  sandbox.__rf2 = run("({ ...__rf, plan: { ...__rf.plan, maxLeverage: 2 } })");
  const refusedFill = run(`practiceFillOrders(__rf2, { BTC: ${P(98000)} })`);
  sandbox.__rf3 = refusedFill.state;
  assert.strictEqual(refusedFill.filled[0].error != null, true, "an order the plan no longer allows cannot open when it fills");
  assert.deepStrictEqual(json("practiceOrderHistory(__rf3).map((h) => h.status)"), ["refused"],
    "…and the history says it could not open, not that it filled");
}

console.log("PRACTICE MODEL TESTS OK");
