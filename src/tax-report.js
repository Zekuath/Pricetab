/* THE TAX REPORT HELPER — a country's rules applied to the portfolio's own
 * records (28 Sep 2026).
 *
 * Asked for as *"ülkelere göre tax kurallarını ekleyip ülkeye göre rapor
 * yardımcısı oluşturabilir miyiz?"* with an estimate, for four countries;
 * the same day, *"tax muhabbetini sadece dört ülkeye vermeyelim"* — every
 * country. The rules are data now (`tax-world.js`); this file is the one
 * engine that reads them. It used to decline this on purpose — the
 * portfolio's CSV is deliberately a *cost basis* report — and what changed
 * is that the owner asked knowing that. So the helper keeps three promises:
 *
 *  - **Every rule carries its source and the day it was read**
 *    (`docs/internal/research/`); rules change, and a rule without a date
 *    cannot be checked. Each country also says how sure the source is.
 *  - **The one number it cannot know is the person's**: their rate. Every
 *    default can be changed on screen; a marginal rate starts empty and
 *    nothing is estimated until it is typed.
 *  - **It says what it could not use**: a sale with no matching purchase, an
 *    undated purchase (no holding period), a record in another currency (set
 *    aside, never converted — the portfolio's own rule).
 *
 * Pure: the holdings and the choices in, the report out. No DOM, no clock. */

const TAX_RULES_CHECKED = TAX_WORLD_CHECKED;
const TAX_DAY = 86400;

/* The id a country is stored under. "uk" was the helper's name for the
   United Kingdom before the list became ISO codes. */
const taxCountryId = (country) => {
  const c = String(country || "").toLowerCase();
  return c === "uk" ? "gb" : c;
};

/* ── dates ──────────────────────────────────────────────────────────────── */

const taxDate = (sec) => new Date(sec * 1000);
const taxDayKey = (sec) => Math.floor(sec / TAX_DAY);

/* **Held long enough** for a country's long-term rule, compared as UTC
 * calendar dates. `years`/`months` is "more than" that span: past the
 * anniversary, which is how the IRS counts (from the day after acquiring
 * through the day of disposal) and how §23 reads "nicht mehr als ein Jahr" —
 * a sale *on* the anniversary is still inside it. `days` is "at least" that
 * many days (Portugal's 365). 29 February rolls to 1 March. */
const taxHeldLong = (acquiredSec, disposedSec, rule) => {
  if (!rule || !(acquiredSec > 0) || !(disposedSec > 0)) return null;
  const a = taxDate(acquiredSec);
  const d = taxDate(disposedSec);
  const disposedDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const acquiredDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  if (rule.days) return (disposedDay - acquiredDay) / (TAX_DAY * 1000) >= rule.days;
  const anniversary = Date.UTC(a.getUTCFullYear() + (rule.years || 0), a.getUTCMonth() + (rule.months || 0), a.getUTCDate());
  return disposedDay > anniversary;
};

const taxHeldOverAYear = (acquiredSec, disposedSec) => taxHeldLong(acquiredSec, disposedSec, { years: 1 });

/* The tax year a moment falls in, as a label and a sortable key (the year it
 * starts in): the calendar year, or one that starts on the country's own
 * day — the UK's 6 April ("2025/26"), Australia's 1 July, India's 1 April. */
const taxYearOf = (country, sec) => {
  const e = taxWorldEntry(taxCountryId(country));
  const d = taxDate(sec);
  const y = d.getUTCFullYear();
  const start = e && e.y;
  if (start && !(start[0] === 1 && start[1] === 1)) {
    const first = d.getTime() >= Date.UTC(y, start[0] - 1, start[1]) ? y : y - 1;
    return { key: first, label: `${first}/${String((first + 1) % 100).padStart(2, "0")}` };
  }
  return { key: y, label: String(y) };
};

/* A model's value for one tax year: the entry in a `[[until, value], …]`
   list whose `until` the year does not pass, else the current one. */
const taxForYear = (list, key, current) => {
  for (const [until, v] of Array.isArray(list) ? list : []) if (key <= until) return v;
  return current;
};

/* ── the records ────────────────────────────────────────────────────────── */

/* Every purchase and income receipt a holding has had, and every sale — put
 * back together from what the portfolio stores: the lots still held (by hand
 * and at each watched address) and, for each sale, the slices of lots it
 * consumed. A lot partly sold appears twice, as its held part and as the
 * slice the sale took, both with its date and a pro-rata cost — which is
 * exactly what re-matching needs. `display` is the currency an unstamped
 * record was entered in (the portfolio's rule: absent means "what was on
 * screen"). */
const taxRecordsFor = (holding, display) => {
  const acquisitions = [];
  const disposals = [];
  const cur = (x) => (x && x.currency) || display || "";
  const lots = [
    ...(Array.isArray(holding.lots) ? holding.lots : []),
    ...(Array.isArray(holding.watches) ? holding.watches.flatMap((w) => (Array.isArray(w.lots) ? w.lots : [])) : []),
  ];
  for (const lot of lots) {
    if (!(lot.amount > 0)) continue;
    acquisitions.push({ time: lot.time || 0, amount: lot.amount, cost: lot.paid || 0, currency: cur(lot), kind: lot.kind === "income" ? "income" : "buy" });
  }
  for (const sale of Array.isArray(holding.sales) ? holding.sales : []) {
    if (!(sale.amount > 0)) continue;
    for (const m of Array.isArray(sale.matched) ? sale.matched : []) {
      if (!(m.amount > 0)) continue;
      acquisitions.push({ time: m.acquired || 0, amount: m.amount, cost: m.cost || 0, currency: cur(sale), kind: m.kind === "income" ? "income" : "buy" });
    }
    disposals.push({ time: sale.time || 0, amount: sale.amount, proceeds: sale.received || 0, currency: cur(sale), matched: Array.isArray(sale.matched) ? sale.matched : [] });
  }
  return { acquisitions, disposals };
};

/* ── matching ───────────────────────────────────────────────────────────── */

const taxPair = (coin, acquired, disposed, amount, cost, proceeds, rule, kind) => ({
  coin,
  acquired,
  disposed,
  amount,
  cost,
  proceeds,
  gain: proceeds - cost,
  rule,
  kind: kind || "buy",
  overAYear: taxHeldOverAYear(acquired, disposed),
});

/* **FIFO**, recomputed from the records whatever method the sale was recorded
 * under — Germany requires it (BMF, 10 May 2022 and 6 March 2025) and it is
 * the method a Turkish declaration would use. Undated purchases come first:
 * they predate everything this app was told about. */
const taxMatchFifo = (coin, acquisitions, disposals) => {
  const queue = acquisitions
    .map((a, i) => ({ ...a, left: a.amount, i }))
    .sort((x, y) => (x.time || 0) - (y.time || 0) || x.i - y.i);
  const pairs = [];
  const uncovered = [];
  for (const d of [...disposals].sort((x, y) => x.time - y.time)) {
    let left = d.amount;
    for (const a of queue) {
      if (left <= 1e-12) break;
      if (a.left <= 1e-12) continue;
      if (a.time > d.time && d.time > 0) continue; // not yet bought
      const take = Math.min(a.left, left);
      a.left -= take;
      left -= take;
      pairs.push(taxPair(coin, a.time, d.time, take, a.cost * (take / a.amount), d.proceeds * (take / d.amount), "fifo", a.kind));
    }
    if (left > 1e-12) uncovered.push({ coin, disposed: d.time, amount: left, proceeds: d.proceeds * (left / d.amount) });
  }
  return { pairs, uncovered };
};

/* **The matches recorded with each sale** (the US): the slices the sale took
 * when it was entered, by the method stamped on it — the record a person
 * would hand over. What the recorded slices do not cover had no purchase to
 * match. */
const taxMatchRecorded = (coin, disposals) => {
  const pairs = [];
  const uncovered = [];
  for (const d of disposals) {
    let covered = 0;
    for (const m of d.matched) {
      if (!(m.amount > 0)) continue;
      covered += m.amount;
      pairs.push(taxPair(coin, m.acquired || 0, d.time, m.amount, m.cost || 0, d.proceeds * (m.amount / d.amount), "recorded", m.kind));
    }
    if (d.amount - covered > 1e-12) uncovered.push({ coin, disposed: d.time, amount: d.amount - covered, proceeds: d.proceeds * ((d.amount - covered) / d.amount) });
  }
  return { pairs, uncovered };
};

/* **HMRC's order** (CRYPTO22200): a disposal is matched first with the same
 * day's acquisitions, then with acquisitions in the next 30 days (earliest
 * first), and what is left comes out of the Section 104 pool at the pool's
 * average cost. Acquisitions matched by the first two never enter the pool.
 * Undated acquisitions are pooled from the start. */
const taxMatchUkPool = (coin, acquisitions, disposals) => {
  const acq = acquisitions.map((a, i) => ({ ...a, left: a.amount, i, day: a.time > 0 ? taxDayKey(a.time) : -Infinity }));
  const disp = [...disposals]
    .sort((x, y) => x.time - y.time)
    .map((d) => ({ ...d, left: d.amount, day: taxDayKey(d.time) }));
  const pairs = [];
  const match = (d, a, take, rule) => {
    a.left -= take;
    d.left -= take;
    pairs.push(taxPair(coin, a.time, d.time, take, a.cost * (take / a.amount), d.proceeds * (take / d.amount), rule, a.kind));
  };
  // 1. The same day, then 2. the next 30 days — in disposal order.
  for (const d of disp) {
    for (const a of acq) {
      if (d.left <= 1e-12) break;
      if (a.day === d.day && a.left > 1e-12) match(d, a, Math.min(a.left, d.left), "same-day");
    }
  }
  for (const d of disp) {
    const window = acq
      .filter((a) => a.day > d.day && a.day <= d.day + 30 && a.left > 1e-12)
      .sort((x, y) => x.time - y.time || x.i - y.i);
    for (const a of window) {
      if (d.left <= 1e-12) break;
      match(d, a, Math.min(a.left, d.left), "30-day");
    }
  }
  // 3. The Section 104 pool, walked in time order.
  const events = [
    ...acq.map((a) => ({ t: a.time > 0 ? a.time : -1, order: 0, a })),
    ...disp.map((d) => ({ t: d.time, order: 1, d })),
  ].sort((x, y) => x.t - y.t || x.order - y.order);
  let poolQty = 0;
  let poolCost = 0;
  const uncovered = [];
  for (const e of events) {
    if (e.a) {
      if (e.a.left > 1e-12) {
        poolQty += e.a.left;
        poolCost += e.a.cost * (e.a.left / e.a.amount);
        e.a.left = 0;
      }
      continue;
    }
    const d = e.d;
    if (d.left <= 1e-12) continue;
    const take = Math.min(d.left, poolQty);
    if (take > 1e-12) {
      const cost = poolQty > 0 ? poolCost * (take / poolQty) : 0;
      pairs.push({ ...taxPair(coin, 0, d.time, take, cost, d.proceeds * (take / d.amount), "pool", "buy"), overAYear: null });
      poolQty -= take;
      poolCost -= cost;
      d.left -= take;
    }
    if (d.left > 1e-12) uncovered.push({ coin, disposed: d.time, amount: d.left, proceeds: d.proceeds * (d.left / d.amount) });
  }
  return { pairs, uncovered };
};

/* **Average cost**: every acquisition joins one pool per coin, and a
 * disposal takes its share of the pool's cost — Canada's adjusted cost base,
 * Sweden's genomsnittsmetod, Austria's gleitender Durchschnittspreis,
 * Brazil's custo médio, and the stand-in for Japan's total-average method
 * and France's portfolio formula (both say so on screen). Walked in time
 * order; undated acquisitions join first, and an acquisition at the moment
 * of a disposal joins before it. A pair has no acquisition date: an average
 * has none. */
const taxMatchAverage = (coin, acquisitions, disposals) => {
  const events = [
    ...acquisitions.map((a) => ({ t: a.time > 0 ? a.time : -1, order: 0, a })),
    ...disposals.map((d) => ({ t: d.time, order: 1, d })),
  ].sort((x, y) => x.t - y.t || x.order - y.order);
  let qty = 0;
  let cost = 0;
  const pairs = [];
  const uncovered = [];
  for (const e of events) {
    if (e.a) {
      qty += e.a.amount;
      cost += e.a.cost;
      continue;
    }
    const d = e.d;
    const take = Math.min(d.amount, qty);
    if (take > 1e-12) {
      const share = cost * (take / qty);
      pairs.push({ ...taxPair(coin, 0, d.time, take, share, d.proceeds * (take / d.amount), "average", "buy"), overAYear: null });
      qty -= take;
      cost -= share;
    }
    if (d.amount - take > 1e-12) uncovered.push({ coin, disposed: d.time, amount: d.amount - take, proceeds: d.proceeds * ((d.amount - take) / d.amount) });
  }
  return { pairs, uncovered };
};

/* **A year's cost pool** (Poland, Hungary): not lot matching at all. The
 * year's income is what the sales brought in, less what was spent buying
 * crypto that year; costs above the proceeds carry into the next year. Each
 * sale is listed with its proceeds and no cost of its own, because it has
 * none — the costs belong to the year. */
const taxMatchCostPool = (coin, disposals) => ({
  pairs: disposals.map((d) => ({ ...taxPair(coin, 0, d.time, d.amount, 0, d.proceeds, "cost-pool", "buy"), cost: null, gain: null, overAYear: null })),
  uncovered: [],
});

/* ── the report ─────────────────────────────────────────────────────────── */

/* Everything for one country: the matched pairs, the income receipts, what
 * was set aside and why, and a summary per tax year with the estimate.
 * `rates` holds only what the person changed, in percent; the country's
 * defaults (and a year's own, where the law changed) fill the rest. Null for
 * a country whose rule is not specific enough to compute. */
const taxReport = (holdings, country, display, rates) => {
  const id = taxCountryId(country);
  const e = taxWorldEntry(id);
  if (!e || !e.m || e.m.wealth) return null;
  const m = e.m;
  const pairs = [];
  const uncovered = [];
  const income = [];
  const poolCosts = new Map();
  const gaps = { otherCurrency: 0, otherCurrencies: [], undated: 0 };
  for (const h of Array.isArray(holdings) ? holdings : []) {
    const { acquisitions, disposals } = taxRecordsFor(h, display);
    const mine = (x) => x.currency === e.cur;
    for (const x of [...acquisitions, ...disposals]) {
      if (!mine(x)) {
        gaps.otherCurrency += 1;
        if (x.currency && !gaps.otherCurrencies.includes(x.currency)) gaps.otherCurrencies.push(x.currency);
      }
    }
    const acq = acquisitions.filter(mine);
    const disp = disposals.filter(mine);
    for (const a of acq) {
      if (a.kind === "income" && a.time > 0) income.push({ coin: h.coin, time: a.time, amount: a.amount, value: a.cost });
    }
    let out;
    if (m.method === "cost-pool" || m.method === "pool") {
      out = taxMatchCostPool(h.coin, disp);
      /* Every purchase counts in the year it was made — including the part
         a later sale consumed, which `taxRecordsFor` lists as its own
         acquisition. Undated ones cannot be placed in a year. */
      for (const a of acq) {
        if (a.kind === "income") continue;
        if (!(a.time > 0)) {
          gaps.undated += 1;
          continue;
        }
        const k = taxYearOf(id, a.time).key;
        poolCosts.set(k, (poolCosts.get(k) || 0) + a.cost);
      }
    } else if (m.method === "uk-pool") out = taxMatchUkPool(h.coin, acq, disp);
    else if (m.method === "recorded") out = taxMatchRecorded(h.coin, disp);
    else if (m.method === "average") out = taxMatchAverage(h.coin, acq, disp);
    else out = taxMatchFifo(h.coin, acq, disp);
    pairs.push(...out.pairs);
    uncovered.push(...out.uncovered);
  }
  // One income receipt may be both held and sold in slices; count it once.
  const incomeSeen = new Map();
  for (const i of income) {
    const k = `${i.coin}:${i.time}`;
    const prev = incomeSeen.get(k);
    if (prev) {
      prev.amount += i.amount;
      prev.value += i.value;
    } else incomeSeen.set(k, { ...i });
  }
  const incomeList = [...incomeSeen.values()].sort((a, b) => a.time - b.time);
  gaps.undated += pairs.filter((p) => !(p.acquired > 0) && ["fifo", "recorded", "30-day", "same-day"].includes(p.rule)).length;

  const years = new Map();
  const yearFor = (sec) => {
    const y = taxYearOf(id, sec);
    if (!years.has(y.key)) years.set(y.key, { key: y.key, label: y.label, pairs: [], income: [], uncovered: [], poolCost: 0 });
    return years.get(y.key);
  };
  for (const p of pairs) if (p.disposed > 0) yearFor(p.disposed).pairs.push(p);
  for (const u of uncovered) if (u.disposed > 0) yearFor(u.disposed).uncovered.push(u);
  for (const i of incomeList) yearFor(i.time).income.push(i);
  for (const [k, v] of poolCosts) {
    if (!years.has(k)) years.set(k, { key: k, label: taxYearOf(id, Date.UTC(k, (e.y ? e.y[0] : 1) - 1, e.y ? e.y[1] : 1) / 1000).label, pairs: [], income: [], uncovered: [], poolCost: 0 });
    years.get(k).poolCost = v;
  }
  /* Oldest first, because a cost pool carries its excess forward. */
  const ctx = { carry: 0 };
  const summaries = [...years.values()].sort((a, b) => a.key - b.key).map((y) => taxSummary(e, y, rates || {}, ctx)).reverse();
  return { country: id, currency: e.cur, model: m, pairs, uncovered, income: incomeList, gaps, years: summaries, checked: TAX_RULES_CHECKED };
};

const taxSum = (list, f) => list.reduce((a, x) => a + f(x), 0);

/* Progressive brackets, `[[upTo, pct], …, [null, pct]]`, on one amount. */
const taxBrackets = (amount, brackets) => {
  let left = Math.max(0, amount);
  let floor = 0;
  let tax = 0;
  for (const [upTo, pct] of brackets) {
    const width = upTo == null ? left : Math.min(left, upTo - floor);
    tax += width * (pct / 100);
    left -= width;
    floor = upTo == null ? floor : upTo;
    if (left <= 0) break;
  }
  return tax;
};

/* The rates for one year: the country's defaults, the year's own where the
   law changed (`byYear`), then whatever the person typed. */
const taxRatesFor = (m, key, given) => ({ ...(m.rates || {}), ...taxForYear(m.byYear, key, {}), ...(given || {}) });

/* The rate a model's gains are taxed at: its single named rate. */
const taxGainsRateName = (m) => ["gains", "cgt", "personal"].find((k) => m.rates && k in m.rates) || null;

/* One tax year: the figures a return asks for, and the estimate. Every
 * branch says what it did in `steps` — `[name, value, rateName]` — so the
 * screen shows its working. The field names the first four countries'
 * reports were written against stay what they were. */
const taxSummary = (e, y, given, ctx) => {
  const m = e.m;
  const r = taxRatesFor(m, y.key, given);
  const has = (name) => r[name] != null && r[name] !== "" && Number.isFinite(Number(r[name]));
  const pct = (name) => (has(name) ? Math.max(0, Math.min(100, Number(r[name]))) / 100 : 0);
  const proceeds = taxSum(y.pairs, (p) => p.proceeds);
  const pooled = m.method === "cost-pool" || m.method === "pool";
  const cost = pooled ? y.poolCost : taxSum(y.pairs, (p) => p.cost);
  const gains = pooled ? Math.max(0, proceeds - cost) : taxSum(y.pairs, (p) => Math.max(0, p.gain));
  const losses = pooled ? Math.min(0, proceeds - cost) : taxSum(y.pairs, (p) => Math.min(0, p.gain));
  const incomeValue = taxSum(y.income, (i) => i.value);
  const out = {
    key: y.key, label: y.label, disposals: y.pairs.length, proceeds, cost, gains, losses, net: gains + losses,
    income: incomeValue, uncovered: y.uncovered.length, pairs: y.pairs, incomeList: y.income,
    steps: [], estimate: 0, taxable: 0, rates: r, missingRate: false,
  };
  const push = (...s) => out.steps.push(s);
  const rateName = taxGainsRateName(m);

  /* Income received (staking, rewards, airdrops): its own rate, or the
     gains rate where the country taxes both alike; a Freigrenze if any. */
  const incomeRateName = m.incomeRate || (m.rates && "income" in m.rates ? "income" : null);
  const incomeTaxable = incomeValue > 0 && !(m.incomeThreshold && incomeValue < m.incomeThreshold) ? incomeValue : 0;
  const taxI = incomeRateName ? incomeTaxable * pct(incomeRateName) : 0;
  if (incomeValue > 0 && incomeRateName && !has(incomeRateName)) out.missingRate = true;

  /* A tax on each sale's value (Indonesia, Vietnam): gains do not enter. */
  if (m.turnover) {
    const tax = proceeds * pct("turnover");
    Object.assign(out, { taxable: proceeds, estimate: tax });
    push("proceeds", proceeds);
    push("taxTurnover", tax, "turnover");
    return out;
  }

  /* Not taxed yet in this year (Slovenia, Cyprus and Belgium from 2026). */
  if (m.startsFrom && y.key < m.startsFrom) {
    push("notYet", 0);
    return out;
  }

  /* The year's cost pool: proceeds less the year's purchases and what an
     earlier year could not use. */
  if (pooled) {
    const carried = ctx.carry;
    const base = proceeds - cost - carried;
    ctx.carry = base < 0 ? -base : 0;
    const taxable = Math.max(0, base);
    const tax = taxable * pct(rateName);
    if (!has(rateName)) out.missingRate = taxable > 0;
    Object.assign(out, { net: proceeds - cost, taxable, carried, carryNext: ctx.carry, estimate: tax + taxI });
    push("proceeds", proceeds);
    push("poolCost", cost);
    if (carried) push("carried", carried);
    push("taxable", taxable);
    push("taxGains", tax, rateName);
    if (incomeRateName) push("taxIncome", taxI, incomeRateName);
    return out;
  }

  /* Monthly: Brazil exempts a month whose sales total R$ 35,000 or less,
     and taxes the others' gains by its brackets. */
  if (m.monthlyProceedsLimit) {
    const months = new Map();
    for (const p of y.pairs) {
      const d = taxDate(p.disposed);
      const k = d.getUTCFullYear() * 12 + d.getUTCMonth();
      const x = months.get(k) || { proceeds: 0, net: 0 };
      x.proceeds += p.proceeds;
      x.net += p.gain;
      months.set(k, x);
    }
    let exemptMonths = 0;
    let taxable = 0;
    let tax = 0;
    for (const x of months.values()) {
      if (x.proceeds <= m.monthlyProceedsLimit) {
        exemptMonths += 1;
        continue;
      }
      const base = Math.max(0, x.net);
      taxable += base;
      tax += m.brackets ? taxBrackets(base, m.brackets) : base * pct(rateName);
    }
    Object.assign(out, { taxable, exemptMonths, estimate: tax + taxI });
    push("monthsExempt", exemptMonths);
    push("taxable", taxable);
    push("taxGains", tax, m.brackets ? "brackets" : rateName);
    if (incomeRateName) push("taxIncome", taxI, incomeRateName);
    return out;
  }

  /* The year's sales at or under a limit: none of it is taxed (France's
     €305, Finland's €1,000, Czechia's CZK 100,000 — of proceeds, not gains). */
  if (m.proceedsLimit && proceeds > 0 && proceeds <= m.proceedsLimit) {
    Object.assign(out, { underProceeds: true, estimate: taxI });
    push("underProceeds", proceeds);
    if (incomeRateName) push("taxIncome", taxI, incomeRateName);
    return out;
  }

  /* Short and long by the country's own holding rule; losses as it allows. */
  const lossOf = (g) => (g >= 0 ? g : m.noLosses ? 0 : g * (m.lossFactor || 1));
  let short = 0;
  let long = 0;
  let shortGains = 0;
  let longGains = 0;
  let lossTotal = 0;
  for (const p of y.pairs) {
    const isLong = m.long ? taxHeldLong(p.acquired, p.disposed, m.long) === true : false;
    const g = lossOf(p.gain);
    if (isLong) long += g;
    else short += g;
    if (g > 0 && isLong) longGains += g;
    else if (g > 0) shortGains += g;
    else lossTotal -= g;
  }
  if (m.lossFactor && losses < 0) push("lossesReduced", losses * m.lossFactor);

  /* Romania: a gain under RON 200 a sale is free while the year's stay
     within RON 600. */
  if (m.smallGains && y.pairs.length && y.pairs.every((p) => p.gain < m.smallGains[0]) && gains <= m.smallGains[1]) {
    Object.assign(out, { smallGains: true, estimate: taxI });
    push("smallGains", gains);
    if (incomeRateName) push("taxIncome", taxI, incomeRateName);
    return out;
  }

  /* The US and Colombia: two rates, and a loss on one side reduces a gain
     on the other first (Schedule D netting). */
  if (m.long && m.long.mode === "rate") {
    let s = short;
    let l = long;
    if (s < 0 && l > 0) {
      l = Math.max(0, l + s);
      s = Math.min(0, s + long);
    } else if (l < 0 && s > 0) {
      s = Math.max(0, s + l);
      l = Math.min(0, l + short);
    }
    const taxS = Math.max(0, s) * pct("short");
    const taxL = Math.max(0, l) * pct("long");
    if ((s > 0 && !has("short")) || (l > 0 && !has("long"))) out.missingRate = true;
    Object.assign(out, { short, long, taxable: Math.max(0, s) + Math.max(0, l), estimate: taxS + taxL + taxI, netLoss: Math.min(0, s + l) });
    push("short", short);
    push("long", long);
    push("taxShort", taxS, "short");
    push("taxLong", taxL, "long");
    if (incomeRateName) push("taxIncome", taxI, incomeRateName);
    return out;
  }

  /* Held long enough to be free (Germany, Portugal, Croatia, Czechia…), or
     half of it taxed (Australia's discount, after losses). */
  let base = short + long;
  let exempt = 0;
  if (m.long && m.long.mode === "exempt") {
    exempt = long;
    base = short;
  } else if (m.long && m.long.mode === "discount") {
    /* Losses come off the gains the discount does not apply to first, then
       off the discountable ones; the discount takes what is left (ATO). */
    const s = Math.max(0, shortGains - lossTotal);
    const l = Math.max(0, longGains - Math.max(0, lossTotal - shortGains));
    const discount = l * m.long.value;
    base = s + l - discount;
    push("discount", discount);
  }

  /* A Freigrenze: under it, nothing; at or over it, all of it (Germany's
     €1,000, Luxembourg's €500). */
  let underThreshold = false;
  if (m.threshold && base > 0 && base < m.threshold) {
    underThreshold = true;
    base = 0;
  }
  /* An allowance comes off; the inclusion rate takes a share of the rest. */
  const allowance = taxForYear(m.allowanceByYear, y.key, m.allowance || 0);
  const afterAllowance = Math.max(0, base - allowance);
  const taxable = m.inclusion ? afterAllowance * m.inclusion : afterAllowance;
  const tax = m.brackets ? taxBrackets(taxable, m.brackets) : taxable * pct(rateName);
  if (taxable > 0 && !m.brackets && !has(rateName)) out.missingRate = true;

  Object.assign(out, { short, long, exempt, taxable, estimate: tax + taxI });
  if (m.threshold) Object.assign(out, { freigrenze: m.threshold, underFreigrenze: underThreshold });
  if (allowance) out.allowance = allowance;
  if (m.incomeThreshold) out.incomeTaxable = incomeTaxable;

  if (m.long) {
    push("short", short);
    if (m.long.mode === "exempt") push("exempt", exempt);
    else push("long", long);
  } else push("net", short + long);
  if (underThreshold) push("underThreshold", short);
  if (allowance) push("allowance", allowance);
  if (m.inclusion) push("inclusion", taxable);
  else push("taxable", taxable);
  push("taxGains", tax, m.brackets ? "brackets" : rateName);
  if (m.incomeThreshold) push("incomeTaxable", incomeTaxable);
  if (incomeRateName) push("taxIncome", taxI, incomeRateName);
  return out;
};

/* The Netherlands' way, which is not about gains: a deemed return on what is
   held on 1 January, taxed above the allowance. `value` is what the screen
   has — today's value, and it says so. */
const taxWealthEstimate = (m, value) => {
  if (!m || !m.wealth || !(value > 0)) return null;
  const base = Math.max(0, value - m.wealth.allowance);
  const deemed = base * (m.wealth.deemed / 100);
  return { value, base, deemed, tax: deemed * (m.wealth.rate / 100) };
};

/* ── the file ───────────────────────────────────────────────────────────── */

const taxCsvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const taxIsoDate = (sec) => (sec > 0 ? taxDate(sec).toISOString().slice(0, 10) : "");
const taxUsDate = (sec) => {
  if (!(sec > 0)) return "VARIOUS";
  const d = taxDate(sec);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
};
const taxMoney = (v) => (v == null ? "" : (Math.round(v * 100) / 100).toFixed(2));
const taxQty = (v) => String(Math.round(v * 1e8) / 1e8);

/* One tax year as the country's own form reads it where there is one to
 * follow: Form 8949's columns in the US (Part I short-term, box I; Part II
 * long-term, box L — the self-tracked case), the SA108 figures and each
 * disposal's matching rule in the UK, Anlage SO's in Germany, a FIFO list in
 * Türkiye; every other country gets the same columns in plain English.
 * Headed with the rules' date and the words that this is an estimate. */
const taxReportCsv = (report, yearKey) => {
  if (!report) return "";
  const y = report.years.find((x) => x.key === yearKey);
  if (!y) return "";
  const rows = [];
  const line = (...cells) => rows.push(cells.map(taxCsvCell).join(","));
  const cur = report.currency;
  const c = report.country;
  line(`PriceTab tax report helper — ${c.toUpperCase()} ${y.label} — amounts in ${cur}`);
  line(`An estimate from your own records, with the rules as read on ${report.checked}. Not tax advice; check with a tax adviser.`);
  line("");
  if (c === "us") {
    for (const [title, long] of [["Part I — Short-term (box I)", false], ["Part II — Long-term (box L)", true]]) {
      line(title);
      line("(a) Description", "(b) Date acquired", "(c) Date sold", "(d) Proceeds", "(e) Cost or other basis", "(f) Code", "(g) Adjustment", "(h) Gain or (loss)");
      for (const p of y.pairs.filter((q) => (q.overAYear === true) === long)) {
        line(`${taxQty(p.amount)} ${p.coin}`, taxUsDate(p.acquired), taxUsDate(p.disposed), taxMoney(p.proceeds), taxMoney(p.cost), "", "", taxMoney(p.gain));
      }
      line("");
    }
  } else if (c === "gb") {
    line("Date", "Asset", "Quantity", "Matching rule", "Disposal proceeds", "Allowable cost", "Gain or loss");
    for (const p of y.pairs) {
      line(taxIsoDate(p.disposed), p.coin, taxQty(p.amount), p.rule === "pool" ? "Section 104 pool" : p.rule === "30-day" ? "30-day rule" : "Same-day rule", taxMoney(p.proceeds), taxMoney(p.cost), taxMoney(p.gain));
    }
    line("");
    line("SA108 figures");
    line("Number of disposals", y.disposals);
    line("Disposal proceeds", taxMoney(y.proceeds));
    line("Allowable costs", taxMoney(y.cost));
    line("Gains in the year, before losses", taxMoney(y.gains));
    line("Losses in the year", taxMoney(-y.losses));
  } else if (c === "de") {
    line("Wirtschaftsgut", "Anschaffung", "Veräußerung", "Menge", "Veräußerungspreis", "Anschaffungskosten", "Gewinn/Verlust", "Haltedauer über 1 Jahr");
    for (const p of y.pairs) {
      line(p.coin, taxIsoDate(p.acquired), taxIsoDate(p.disposed), taxQty(p.amount), taxMoney(p.proceeds), taxMoney(p.cost), taxMoney(p.gain), p.overAYear === true ? "ja (steuerfrei)" : p.overAYear === false ? "nein" : "unbekannt");
    }
    line("");
    line("Summe steuerpflichtig (§23)", taxMoney(y.short || 0));
    line("Freigrenze 1.000 EUR", y.underFreigrenze ? "unterschritten — steuerfrei" : (y.short || 0) >= 1000 ? "erreicht — voll steuerpflichtig" : "");
  } else if (c === "tr") {
    line("Varlık", "Alış tarihi", "Satış tarihi", "Miktar", "Satış tutarı", "Maliyet (FIFO)", "Kazanç/Zarar");
    for (const p of y.pairs) {
      line(p.coin, taxIsoDate(p.acquired), taxIsoDate(p.disposed), taxQty(p.amount), taxMoney(p.proceeds), taxMoney(p.cost), taxMoney(p.gain));
    }
  } else {
    line("Date sold", "Asset", "Quantity", "Date acquired", "Proceeds", "Cost", "Gain or loss", "Matched by");
    for (const p of y.pairs) {
      line(taxIsoDate(p.disposed), p.coin, taxQty(p.amount), taxIsoDate(p.acquired), taxMoney(p.proceeds), taxMoney(p.cost), taxMoney(p.gain), p.rule);
    }
    if (report.model && (report.model.method === "cost-pool" || report.model.method === "pool")) {
      line("");
      line("Costs of acquisition in the year", taxMoney(y.cost));
      if (y.carried) line("Costs carried from earlier years", taxMoney(y.carried));
    }
  }
  if (y.incomeList.length) {
    line("");
    line(c === "de" ? "Einkünfte (§22 Nr. 3)" : c === "tr" ? "Gelir (staking, ödül)" : "Income (staking, rewards, airdrops)");
    for (const i of y.incomeList) line(taxIsoDate(i.time), i.coin, taxQty(i.amount), taxMoney(i.value));
  }
  if (y.uncovered) {
    line("");
    line(`${y.uncovered} disposal(s) had no recorded purchase to match and are not in the figures above.`);
  }
  line("");
  line("Estimated tax at the rates you entered", taxMoney(y.estimate));
  return rows.join("\n");
};
