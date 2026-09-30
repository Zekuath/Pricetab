// The derivatives model under random use: every public move, in any order,
// at prices that walk and gap — and after each one, the things that must
// always be true.
//
// `test-practice-model.js` proves each rule on the case it was written for.
// This proves they hold *together*: that no sequence of opens, orders, moves,
// fills, triggers, margin changes, deposits and steps can leave an account
// the ledger does not explain, a negative or non-integer amount, a level on
// the wrong side of its price, or a state the sanitizer would change on the
// next load (a field it does not name vanishes — the defect this project has
// met three times). Deterministic: a seed, printed on failure, replays it.
//
//   node tests/test-practice-fuzz.js [sessions] [steps] [seed]
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { console, Math, Number, Array, isFinite, JSON, Object, String, BigInt };
vm.createContext(sandbox);
for (const f of ["practice-math.js", "practice-model.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), sandbox, { filename: f });
}
const M = vm.runInContext(`({
  practiceEmptySession, practiceOpen, practicePlaceOrder, practiceCancelOrder, practiceMoveOrder,
  practiceReduce, practiceSetTriggers, practiceAddMargin, practiceRemoveMargin, practiceRemovableMargin,
  practiceDeposit, practiceReverse, practiceStep, practiceReconcile, practiceEquity, practiceReserved,
  practiceLiquidationPrice, practiceList, practiceAt, sanitizePractice, practiceFreeBalance,
  PRACTICE_TRAIL_CHOICES, practicePlaceScale, practiceOrderHistory, PRACTICE_SCALE_COUNTS,
})`, sandbox);

const SESSIONS = Number(process.argv[2]) || 120;
const STEPS = Number(process.argv[3]) || 80;
const SEED0 = Number(process.argv[4]) || 20260927;

const E4 = (v) => Math.round(v * 10000);
const round = (v) => JSON.parse(JSON.stringify(v));

let failures = 0;
const counts = {};
const events = {};
for (let n = 0; n < SESSIONS; n += 1) {
  let seed = SEED0 + n * 7919;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const trace = [];
  let s = M.practiceEmptySession();
  let price = 100000 * (0.5 + rnd());
  let step = 0;
  const priceE4 = () => E4(price);
  const anyPos = () => {
    const ids = M.practiceList(s);
    return ids.length ? pick(ids) : null;
  };
  const anyOrder = () => {
    const ids = Object.keys(s.orders || {});
    return ids.length ? pick(ids) : null;
  };
  const apply = (name, out) => {
    counts[name] = counts[name] || { ok: 0, refused: 0 };
    if (out && out.state && !out.error) {
      s = out.state;
      counts[name].ok += 1;
    } else {
      counts[name].refused += 1;
    }
  };
  const actions = {
    open: () => {
      const side = rnd() < 0.5 ? "long" : "short";
      const leverage = pick([1, 2, 3, 5, 10, 20, 50, 100, 150, 200]);
      const qty = 1 + Math.floor(rnd() * 400);
      trace.push(`open ${side} ${qty} ${leverage}x @${price.toFixed(2)}`);
      apply("open", M.practiceOpen(s, { coin: "BTC", currency: "USDT", side, qty, leverage, at: step }, priceE4()));
    },
    order: () => {
      const side = rnd() < 0.5 ? "long" : "short";
      const kind = rnd() < 0.7 ? "limit" : "stop";
      const away = (0.002 + rnd() * 0.05) * (kind === "limit" ? (side === "long" ? -1 : 1) : (side === "long" ? 1 : -1));
      const limit = E4(price * (1 + away));
      const withLevels = rnd() < 0.5;
      const stop = withLevels ? E4(price * (1 + away) * (side === "long" ? 0.97 : 1.03)) : null;
      const take = withLevels ? E4(price * (1 + away) * (side === "long" ? 1.04 : 0.96)) : null;
      const reduce = kind === "limit" && rnd() < 0.15;
      const qty = 1 + Math.floor(rnd() * 300);
      trace.push(`order ${kind}${reduce ? " reduce" : ""} ${side} ${qty} @${(limit / 1e4).toFixed(2)} sl ${stop} tp ${take}`);
      apply("order", M.practicePlaceOrder(s, { coin: "BTC", currency: "USDT", side, qty, leverage: pick([2, 5, 10, 25]), limit, kind, reduce, stop, take, at: step }, priceE4()));
    },
    scale: () => {
      const side = rnd() < 0.5 ? "long" : "short";
      const n = pick(M.PRACTICE_SCALE_COUNTS);
      const dir = side === "long" ? -1 : 1;
      const from = E4(price * (1 + dir * (0.002 + rnd() * 0.01)));
      const to = E4(price * (1 + dir * (0.015 + rnd() * 0.05)));
      const qty = n + Math.floor(rnd() * 400);
      trace.push(`scale ${side} ${n} × ${qty} ${(from / 1e4).toFixed(2)} → ${(to / 1e4).toFixed(2)}`);
      apply("scale", M.practicePlaceScale(s, { coin: "BTC", currency: "USDT", side, qty, leverage: pick([2, 5, 10]), at: step }, n, from, to, priceE4()));
    },
    cancel: () => {
      const id = anyOrder();
      if (!id) return;
      trace.push(`cancel ${id}`);
      apply("cancel", M.practiceCancelOrder(s, id));
    },
    move: () => {
      const id = anyOrder();
      if (!id) return;
      const o = s.orders[id];
      const limit = Math.round(o.limit * (1 + (rnd() - 0.5) * 0.04));
      trace.push(`move ${id} → ${(limit / 1e4).toFixed(2)}`);
      apply("move", M.practiceMoveOrder(s, id, limit, priceE4()));
    },
    reduce: () => {
      const id = anyPos();
      if (!id) return;
      const pos = M.practiceAt(s, id);
      const qty = Math.max(1, Math.floor(pos.qty * pick([0.1, 0.25, 0.5, 1])));
      trace.push(`reduce ${id} ${qty}`);
      apply("reduce", M.practiceReduce(s, id, qty, priceE4(), "close"));
    },
    triggers: () => {
      const id = anyPos();
      if (!id) return;
      const pos = M.practiceAt(s, id);
      const long = pos.side !== "short";
      const stop = rnd() < 0.7 ? Math.round(pos.entry * (long ? 1 - rnd() * 0.1 : 1 + rnd() * 0.1)) : null;
      const take = rnd() < 0.7 ? Math.round(pos.entry * (long ? 1 + rnd() * 0.1 : 1 - rnd() * 0.1)) : null;
      const trail = rnd() < 0.3 ? pick(M.PRACTICE_TRAIL_CHOICES) : undefined;
      trace.push(`triggers ${id} sl ${stop} tp ${take} trail ${trail}`);
      apply("triggers", M.practiceSetTriggers(s, id, stop, take, undefined, trail));
    },
    addMargin: () => {
      const id = anyPos();
      if (!id) return;
      const amount = 100 + Math.floor(rnd() * 50000);
      trace.push(`addMargin ${id} ${amount}`);
      apply("addMargin", M.practiceAddMargin(s, id, amount));
    },
    removeMargin: () => {
      const id = anyPos();
      if (!id) return;
      const most = M.practiceRemovableMargin(s, id, priceE4());
      if (!(most > 0)) return;
      const amount = Math.max(1, Math.floor(most * rnd()));
      trace.push(`removeMargin ${id} ${amount}`);
      apply("removeMargin", M.practiceRemoveMargin(s, id, amount, priceE4()));
    },
    deposit: () => {
      const amount = 1000 + Math.floor(rnd() * 200000);
      trace.push(`deposit ${amount}`);
      apply("deposit", M.practiceDeposit(s, amount));
    },
    reverse: () => {
      const id = anyPos();
      if (!id) return;
      trace.push(`reverse ${id}`);
      apply("reverse", M.practiceReverse(s, id, priceE4()));
    },
    step: () => {
      /* A walk with the odd gap: most steps move a fraction of a percent,
         one in twelve jumps up to fifteen — enough to cross stops, fill
         orders, trip stop entries past their own levels and liquidate. */
      const gap = rnd() < 1 / 12 ? (rnd() - 0.5) * 0.3 : (rnd() - 0.5) * 0.012;
      price = Math.max(10, price * (1 + gap));
      step += 1;
      trace.push(`step ${step} @${price.toFixed(2)}`);
      const marks = { BTC: priceE4() };
      const out = M.practiceStep(s, s.step + 1, marks, { last: marks });
      for (const e of (out && out.events) || []) events[e.reason] = (events[e.reason] || 0) + 1;
      apply("step", out);
    },
  };
  const weights = [["open", 4], ["order", 4], ["scale", 1], ["cancel", 1], ["move", 2], ["reduce", 2], ["triggers", 2],
    ["addMargin", 1], ["removeMargin", 1], ["deposit", 1], ["reverse", 1], ["step", 8]];
  const total = weights.reduce((a, w) => a + w[1], 0);
  try {
    for (let i = 0; i < STEPS; i += 1) {
      let r = rnd() * total;
      const name = weights.find((w) => (r -= w[1]) < 0)[0];
      actions[name]();
      check(s, trace);
    }
  } catch (e) {
    failures += 1;
    console.error(`✘ session ${n} (seed ${SEED0 + n * 7919}): ${e.message}`);
    console.error("  last actions:\n    " + trace.slice(-8).join("\n    "));
    if (failures > 4) break;
  }
}

function check(s, trace) {
  const rec = M.practiceReconcile(s);
  assert.ok(rec && rec.ok, `the ledger does not explain the account after "${trace[trace.length - 1]}": ${JSON.stringify(rec)}`);
  const int = (v, what, min = 0) => assert.ok(Number.isSafeInteger(v) && v >= min, `${what} is ${v}`);
  int(s.balance, "the balance");
  int(s.margin, "the margin");
  int(M.practiceReserved(s), "the reserve");
  const equity = M.practiceEquity(s, {}, "BTC");
  assert.ok(Number.isFinite(equity), `equity is ${equity}`);
  for (const id of M.practiceList(s)) {
    const p = M.practiceAt(s, id);
    int(p.qty, `#${id} qty`, 1);
    int(p.margin, `#${id} margin`, 1);
    int(p.entry, `#${id} entry`, 1);
    const long = p.side !== "short";
    if (p.stop != null) assert.ok(long ? p.stop < p.entry : p.stop > p.entry, `#${id} stop ${p.stop} on the wrong side of ${p.entry}`);
    if (p.take != null) assert.ok(long ? p.take > p.entry : p.take < p.entry, `#${id} take ${p.take} on the wrong side of ${p.entry}`);
    const liq = M.practiceLiquidationPrice(p);
    assert.ok(liq == null || (Number.isFinite(liq) && liq >= 0), `#${id} liquidation ${liq}`);
  }
  for (const id of Object.keys(s.orders || {})) {
    const o = s.orders[id];
    int(o.margin, `order ${id} margin`);
    if (o.reduce) assert.strictEqual(o.margin, 0, `reduce-only order ${id} reserves ${o.margin}`);
    const long = o.side !== "short";
    if (o.stop != null) assert.ok(long ? o.stop < o.limit : o.stop > o.limit, `order ${id} stop ${o.stop} on the wrong side of ${o.limit}`);
    if (o.take != null) assert.ok(long ? o.take > o.limit : o.take < o.limit, `order ${id} take ${o.take} on the wrong side of ${o.limit}`);
  }
  /* **A save and a load change nothing.** Everything the model writes has to
     be something the sanitizer names and accepts. */
  /* The order history names only the three ways an order ends, and never
     an order that is still resting. */
  for (const h of M.practiceOrderHistory(s, 100)) {
    assert.ok(["filled", "cancelled", "refused"].includes(h.status), `history status ${h.status}`);
    assert.ok(!(s.orders && s.orders[h.order]), `order ${h.order} is both resting and in the history`);
  }
  /* Compared as a subset: a field the model never wrote may come back with
     its default (a plan written before a rule existed), but nothing the
     model did write may be dropped or changed. And a second load changes
     nothing the first one produced. */
  const before = round(s);
  const reloaded = round(M.sanitizePractice(round(s)));
  const diff = firstDiff(before, reloaded, "");
  assert.ok(!diff, `${diff} on a reload after "${trace[trace.length - 1]}"`);
  const twice = round(M.sanitizePractice(round(reloaded)));
  const again = firstDiff(reloaded, twice, "") || firstDiff(twice, reloaded, "");
  assert.ok(!again, `a second reload changes ${again}`);
}

function firstDiff(a, b, at) {
  if (a === b) return null;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return `${at || "the state"} was ${JSON.stringify(a)} and came back ${JSON.stringify(b)}`;
  }
  for (const key of Object.keys(a)) {
    /* An empty value dropped is the same reading: every reader tests these
       fields for presence (`!e.stopFirst`, `e.stopMoved > 0`). */
    if (!(key in b) && (a[key] === null || a[key] === 0 || a[key] === "" || a[key] === false)) continue;
    if (!(key in b)) return `${at}.${key} (${JSON.stringify(a[key]).slice(0, 60)}) was dropped`;
    const d = firstDiff(a[key], b[key], `${at}.${key}`);
    if (d) return d;
  }
  return null;
}

const moves = Object.entries(counts).map(([k, v]) => `${k} ${v.ok}/${v.ok + v.refused}`).join(" · ");
if (failures) {
  console.error(`\n✘ ${failures} FUZZ SESSION(S) FAILED — ${moves}`);
  process.exit(1);
}
/* A walk that refused everything proved nothing: every kind of move must
   have happened, and the fills and triggers the steps exist for with it. */
for (const name of ["open", "order", "scale", "cancel", "move", "reduce", "triggers", "addMargin", "removeMargin", "deposit", "reverse", "step"]) {
  assert.ok(counts[name] && counts[name].ok > 0, `no "${name}" ever went through — the walk is not exercising it`);
}
/* …and the market did the things the steps are there for. */
for (const reason of ["fill", "stop", "take", "liquidation"]) {
  assert.ok(events[reason] > 0, `no "${reason}" happened in the walk — the prices are not reaching it`);
}
console.log(`✔ ${SESSIONS} sessions × ${STEPS} moves: the ledger explained every account, nothing went negative, every level stayed on its side, and every state reloaded unchanged`);
console.log(`  ${moves}`);
console.log(`  the market: ${Object.entries(events).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log("PRACTICE FUZZ TESTS OK");
