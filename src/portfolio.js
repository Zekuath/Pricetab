/* PORTFOLIO (tracking only)
 * Full-screen view for manually-entered holdings. No wallet connection, no
 * transactions, no money movement — purely "what would my coins be worth".
 * Holdings persist in localStorage; prices come from the shared
 * pageTickerCache (filled by the parent). All math is read-only.
 */

const PORTFOLIO_MAX_HOLDINGS = 50; // sanity cap, plenty for tracking

/* ── background value chart ────────────────────────────────────────────────
 * Total portfolio value over time, drawn full-bleed behind the content with
 * the same Line chart the main view uses. Per-coin price histories are
 * fetched once per period/currency and summed as amount × price(t), so
 * editing an amount re-shapes the chart instantly without a refetch.
 */
const PORTFOLIO_CHART_MAX_COINS = 12; // chart the biggest holdings by value
const PORTFOLIO_CHART_BATCH_SIZE = 4; // history requests per burst
const PORTFOLIO_CHART_BATCH_DELAY = 400; // ms between bursts (be kind to Coinbase)
const PORTFOLIO_HISTORY_TTL = 300000; // 5 min — history barely moves in-session

// Periods for the value chart — "hour" is tick noise for a portfolio total
const PORTFOLIO_CHART_PERIODS = PERIOD_OPTIONS.filter(
  (o) => o.value !== "hour",
);

/* BENCHMARK
 * A portfolio's own percentage answers "did it go up", which in a market that
 * moves together is nearly always the same answer for everyone. The question
 * it hides is "did holding these particular coins beat holding the obvious
 * one", and that is the one a percentage on its own can't be read for.
 *
 * The comparison is exact rather than indicative: the value series is
 * amount × price(t) with the amounts held fixed, so there are no deposits or
 * withdrawals inside the window to distort it — both sides are simply what a
 * unit of value did over the same days.
 *
 * One extra history request per period, usually none: BTC is the most common
 * holding and the main chart's usual coin, so it is normally already cached.
 */
const BENCHMARK_COIN = "BTC";

// coin-period-currency → { data, timestamp }; in-memory, survives view reopen
const portfolioHistoryCache = new Map();

const getPortfolioHistory = async (coin, period, currency) => {
  const key = `${coin}-${period}-${currency}`;
  const hit = portfolioHistoryCache.get(key);
  if (hit && Date.now() - hit.timestamp < PORTFOLIO_HISTORY_TTL) {
    return hit.data;
  }
  try {
    // useCache reads the shared price cache (free hit for the active main-chart
    // coin); allowedCoins stays empty so portfolio coins never write into it.
    const data = await fetchValueHistory(coin, period, currency);
    portfolioHistoryCache.set(key, { data, timestamp: Date.now() });
    return data;
  } catch (e) {
    return hit ? hit.data : null; // stale beats blank; missing coins are skipped
  }
};

/* ── aligning two price series ─────────────────────────────────────────────
 * Every series here is ascending and carries its own timestamps, and **the
 * timestamps are the only thing they have in common**. Position is not:
 * point 40 of one coin and point 40 of another are routinely different days.
 *
 * They used to be aligned by position — trimmed to the shortest and summed
 * index for index — and that is wrong wherever two series are sampled at
 * different rates, which is most of the time:
 *
 *   - Coinbase's `period=all` spaces its points across each coin's own
 *     lifetime. Measured 22 Aug 2026: BTC 351 points **13.19 days** apart,
 *     SUI 332 points **3.64 days** apart. Trimmed to 332 and summed by
 *     position, the chart added BTC's 2014-08-18 price to SUI's 2023-05-04
 *     price at the same x, and took its dates from whichever holding happened
 *     to come first in the array.
 *   - Kraken-routed coins (`KRAKEN_PERIODS`) never match Coinbase on any
 *     range: 60/96/168/180 points against Coinbase's 359/300/306/311 for
 *     hour/day/week/month. BTC + XMR on a day range summed 7.7 hours of BTC
 *     with 24 hours of XMR.
 *
 * So the window is the **intersection** — from the latest first point to the
 * earliest last point, which keeps the old and correct intention that a young
 * coin cannot fabricate a portfolio value from before it existed — and the
 * grid is the timestamps of whichever series has the most points inside that
 * window, so the chart keeps the best resolution anyone actually quoted
 * without inventing more.
 */
const seriesTime = (point) => +point.time;

/* The window every series can speak for, or null when they do not overlap. */
const commonWindow = (list) => {
  let from = -Infinity;
  let to = Infinity;
  for (const prices of list) {
    const a = seriesTime(prices[0]);
    const b = seriesTime(prices[prices.length - 1]);
    if (!isFinite(a) || !isFinite(b)) return null;
    if (a > from) from = a;
    if (b < to) to = b;
  }
  return to > from ? { from, to } : null;
};

/* The timestamps to draw on: the densest series inside the window.
 *
 * Deliberately not a synthetic even grid. Every point returned is a moment
 * some exchange actually quoted, so the chart's x values stay real. */
const alignedTimes = (list, window) => {
  let best = null;
  for (const prices of list) {
    const inside = prices.filter((p) => {
      const t = seriesTime(p);
      return t >= window.from && t <= window.to;
    });
    if (!best || inside.length > best.length) best = inside;
  }
  return best && best.length > 1 ? best.map((p) => p.time) : null;
};

/* One series read at each of `times`: the last price quoted at or before each
 * moment. Both arrays ascend, so this is one walk rather than a search per
 * point.
 *
 * Held rather than interpolated. A price between two quotes is a price nobody
 * traded at, and this chart is read for what a holding was worth on a day.
 * Returns null if any moment falls before the series starts — inside the
 * intersection window that cannot happen, and drawing a hole would be worse
 * than not drawing.
 */
const sampleSeriesAt = (prices, times) => {
  const out = [];
  let i = 0;
  let held = null;
  for (const time of times) {
    const t = +time;
    while (i < prices.length && seriesTime(prices[i]) <= t) {
      held = prices[i].price;
      i++;
    }
    if (held == null || !isFinite(held)) return null;
    out.push(held);
  }
  return out;
};

/* The last price quoted at or before one moment — the single-point form of
 * `sampleSeriesAt`, for the benchmark's two ends. */
const priceAtOrBefore = (prices, ms) => {
  let held = null;
  for (const p of prices) {
    if (seriesTime(p) > ms) break;
    held = p.price;
  }
  return held != null && isFinite(held) ? held : null;
};

/* The worst peak-to-trough fall inside a series.
 *
 * This is here because of what the algorithm research found and what it did
 * not (the working notes §9.4). Nine textbook rules over 21,669 daily
 * closes on eight coins: **0 of 70 permutation tests survive Holm–Bonferroni**,
 * and on live daily closes the textbook labels point the wrong way — after
 * RSI 14 crosses 70, the "sell" signal, the next thirty days beat the coin's
 * ordinary month on four of six coins, BTC by 7.5 percentage points over 92
 * episodes. So there are no buy points and no sell points in this app.
 *
 * One effect did survive, in the other column: **59 of 64 rule × coin pairs
 * cut the worst fall**, while only 28 of 64 beat simply holding. Those are
 * risk statements, not entries. This is the risk statement, for the one
 * portfolio that matters to the person reading it, out of a series already in
 * memory — no request, no rule, no claim about what happens next.
 *
 * The chart asks it too — the `worstFall` widget is the same question about
 * one coin over the range on screen — so it is deliberately general: the
 * portfolio's times are numbers and the chart's are `Date`s, and a time comes
 * back out exactly as it went in for the caller to read. It stays in this
 * file rather than moving to `utils.js` because `utils.js` touches d3 at load
 * time, and three test sandboxes would have to grow a chart stub to keep
 * asking a question about a list of numbers.
 *
 * Peak-to-trough within the window on screen, so it answers "how bad did this
 * get" and never "how bad can it get".
 */
const maxDrawdown = (series) => {
  if (!Array.isArray(series) || series.length < 2) return null;
  let peak = -Infinity;
  let peakAt = null;
  let worst = 0;
  let from = null;
  let to = null;
  for (const point of series) {
    const v = point.price;
    if (!isFinite(v)) continue;
    if (v > peak) {
      peak = v;
      peakAt = point.time;
    }
    if (peak > 0) {
      const fall = (v - peak) / peak;
      if (fall < worst) {
        worst = fall;
        from = peakAt;
        to = point.time;
      }
    }
  }
  // A series that only ever went up has no fall to report, and saying "0%"
  // would read as a measurement rather than as an absence
  return worst < 0 ? { pct: worst * 100, from, to } : null;
};

/* Sum per-coin histories into one total-value series, and keep the parts.
 *
 * Aligned on time (see above), so every point is one moment and the bands
 * under it are what each coin was worth at that moment.
 *
 * The per-coin values used to be summed and thrown away, because the chart was
 * a single line behind some text. They are the answer to "which of these is
 * carrying the position, and since when" — the question a total cannot be read
 * for — so they are kept, aligned index-for-index with the total, and the
 * chart can stack them. Sorted biggest-first, which is the order the stack and
 * the legend both want.
 */
const buildPortfolioParts = (histories, holdings) => {
  const held = [];
  for (const h of holdings) {
    const amount = holdingAmount(h);
    if (!(amount > 0)) continue;
    const prices = histories[h.coin];
    if (Array.isArray(prices) && prices.length > 1) {
      held.push({ coin: h.coin, amount, prices });
    }
  }
  if (!held.length) return null;
  const all = held.map((p) => p.prices);
  const window = commonWindow(all);
  if (!window) return null;
  const times = alignedTimes(all, window);
  if (!times) return null;
  const values = [];
  for (const p of held) {
    const sampled = sampleSeriesAt(p.prices, times);
    if (!sampled) return null;
    values.push(sampled.map((price) => price * p.amount));
  }
  const series = times.map((time, i) => {
    let total = 0;
    for (const v of values) total += v[i];
    return { price: total, time };
  });
  const parts = held.map((p, k) => ({ coin: p.coin, values: values[k] }));
  const last = (p) => p.values[p.values.length - 1] || 0;
  parts.sort((a, b) => last(b) - last(a));
  return { series, parts };
};

/* WHICH HOLDING MOVED THE TOTAL — and deliberately not which one to buy.
 *
 * Allocation says what the basket is *made of*; this says what *moved* it, and
 * they are different questions that people routinely read off the same chart.
 * A coin can be 40% of the position and account for none of the month's
 * change, and a 3% holding can be the whole of it.
 *
 * It is arithmetic on a series already on screen, so it costs nothing:
 *
 *     contribution = values[last] - values[0]
 *
 * and because `values` is `amount x price(t)` with the amount fixed, that is
 * exactly `amount x (end price - start price)`. **They sum to the headline
 * delta by construction**, which is the property that makes the chart honest —
 * `tests/test-portfolio.js` asserts it rather than trusting it.
 *
 * `share` is against the sum of **absolute** contributions, not the net: with
 * winners and losers cancelling, a net denominator can be near zero and send
 * every share to infinity. Shares therefore say "how much of the total
 * movement was this", not "what fraction of the net".
 *
 * It says nothing about what happens next, and it must not: nine textbook
 * rules over 21,669 daily closes produced 0 of 70 results that survived
 * correction for multiple testing (the working notes §9). This is a description of
 * something that already happened, which is the only thing the data supports.
 */
const contributionsOf = (parts) => {
  if (!Array.isArray(parts) || !parts.length) return null;
  const rows = [];
  let net = 0;
  let gross = 0;
  for (const part of parts) {
    const values = part && part.values;
    if (!Array.isArray(values) || values.length < 2) continue;
    const first = values[0];
    const last = values[values.length - 1];
    if (!isFinite(first) || !isFinite(last)) continue;
    const change = last - first;
    rows.push({ coin: part.coin, change, from: first, to: last });
    net += change;
    gross += Math.abs(change);
  }
  if (!rows.length) return null;
  /* Biggest mover first, regardless of direction: the question is "what moved
   * this", and the largest loser answers it as well as the largest winner. */
  rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  for (const row of rows) {
    row.share = gross > 0 ? (Math.abs(row.change) / gross) * 100 : 0;
    /* Against the coin's own starting value, which is the figure people mean
     * by "how did BTC do" — null rather than a divide-by-zero when the
     * position was empty at the start of the window. */
    row.pct = row.from > 0 ? (row.change / row.from) * 100 : null;
  }
  return { rows, net, gross };
};

/* HOW FAR A HOLDING HAS DRIFTED FROM THE SHARE YOU WANTED IT TO BE.
 *
 * A portfolio drifts on its own: the coin that went up is a bigger part of the
 * total the next morning without anybody buying anything. Every tracker that
 * answers this calls it rebalancing and most of them end the sentence with an
 * instruction. **This one ends it with a number** — the same rule the base-rate
 * panel follows. No arrow, no "time to sell", nothing about what to do.
 *
 * The answer is given in the three units the question is actually asked in,
 * because each one is the natural one for a different person: **percentage
 * points** (what the strip above is drawn in), **money** (what it would take to
 * put it back), and **coins** (what you would have to move). The last two are
 * the same fact divided by the price, and they are deliberately *not* called a
 * trade — nothing here knows about fees, tax, or where the money would come
 * from, and "0.13 BTC over" is true of a position in a way that "sell 0.13 BTC"
 * is not.
 *
 * Null rather than a figure whenever the comparison cannot be made honestly: no
 * target set, nothing tracked yet, or a holding no exchange priced — a share of
 * an unknown value is not a share.
 */
const targetDrift = (row, totalNow) => {
  if (!row || row.target == null) return null;
  if (!(totalNow > 0) || row.value == null || !isFinite(row.value)) return null;
  const actual = (row.value / totalNow) * 100;
  const pts = actual - row.target;
  // What that gap is worth. Positive is over the target, negative is under.
  const value = (pts / 100) * totalNow;
  const amount = row.price > 0 ? value / row.price : null;
  return { actual, pts, value, amount };
};

/* THE SAME SERIES AS DISTANCE FROM ITS OWN PEAK.
 *
 * `maxDrawdown` already reports the deepest fall as one number, and one number
 * hides the two things that decide whether a fall mattered: **how long** it
 * lasted and **whether it came back**. A position that fell 12% and recovered
 * in a fortnight and one that fell 12% and stayed there produce the same
 * headline figure and are not the same experience.
 *
 * Every point is `(value / running peak) - 1`, so:
 *   - zero means "at a new high", and the top of the chart is a hard ceiling
 *     the series touches rather than an arbitrary edge;
 *   - everything else is negative, and the depth is read straight off the
 *     axis.
 *
 * It is derived from the series already drawn — no request, no second history,
 * no new state. And it is risk *context*, not a forecast: it says how bad this
 * got, never how bad it can get, which is the same wording rule the worst-fall
 * widget follows.
 */
const drawdownSeries = (series) => {
  if (!Array.isArray(series) || series.length < 2) return null;
  const out = [];
  let peak = -Infinity;
  for (const point of series) {
    const v = point.price;
    if (!isFinite(v)) {
      out.push({ time: point.time, price: 0 });
      continue;
    }
    if (v > peak) peak = v;
    /* Before the first positive value there is no peak to be below, and a
     * division by a non-positive peak is not a percentage of anything. */
    out.push({
      time: point.time,
      price: peak > 0 ? ((v - peak) / peak) * 100 : 0,
    });
  }
  return out;
};

const buildPortfolioSeries = (histories, holdings) => {
  const built = buildPortfolioParts(histories, holdings);
  return built ? built.series : null;
};

/* ── EACH COIN'S SHARE, THROUGH THE RANGE (27 Sep 2026) ─────────────────
 *
 * The allocation strip says what the basket is made of **now**; this says
 * how that got to be — the same parts as shares of the total at every point,
 * stacked to 100%. On today's amounts a share only moves because a price did,
 * which is exactly the drift a target share is kept against: the coin that
 * outran the rest widens, and nothing was bought or sold to do it. */
const mixOf = (built) => {
  if (!built || !Array.isArray(built.parts) || !built.parts.length) return null;
  const totals = built.series.map((p) => p.price);
  return {
    series: built.series.map((p, i) => ({ time: p.time, price: totals[i] > 0 ? 100 : 0 })),
    parts: built.parts.map((p) => ({
      coin: p.coin,
      values: p.values.map((v, i) => (totals[i] > 0 ? (v / totals[i]) * 100 : 0)),
    })),
  };
};

/* ── WHAT WAS HELD THEN, AND WHAT IT HAD COST (27 Sep 2026) ──────────────
 *
 * Asked for as "yenilik … grafik yönlü eklemeler" for the portfolio. Every
 * view above prices **today's** amounts backwards through the range — the
 * right model for "what moved this basket", and the wrong one for "what was
 * my account worth in March": a coin bought last week is carried back as
 * though it was held all year, and the headline's −30% over a year can be a
 * year in which more money went in. The sector's first portfolio chart is the
 * other one: what you actually held on each day, against what it had cost
 * you by then.
 *
 * **Rewound from now**, so the records decide it and nothing is guessed:
 *   amount(t) = what is held now
 *             − every purchase dated after t (it was not bought yet)
 *             + every sale dated after t, as far as it ate coins bought by t
 *               (they were still held then); the part of a sale with no
 *               purchase behind it is added back too — it was held, from
 *               somewhere
 * An undated purchase is held throughout: it has no date to rewind past.
 *
 * **Paid in** is the same rewind on money: the cost of the purchases held at
 * t, in the currency on screen. A purchase logged in another currency counts
 * as coins but not as money, the rule every other figure here keeps.
 */
/* `lots` defaults to every lot on record; the chart passes the ones
   `heldLots` keeps, so what it rewinds from is the same set the cost basis
   is read off — a hand-lowered amount does not leave purchases behind that
   the rows have already dropped. */
const heldAmountAt = (h, tSec, lots) => {
  let amount = holdingAmount(h);
  for (const lot of lots || holdingLots(h)) {
    if (lot.time > 0 && lot.time > tSec) amount -= lot.amount;
  }
  for (const sale of h.sales || []) {
    if (!(sale.time > tSec)) continue;
    const matched = Array.isArray(sale.matched) ? sale.matched : [];
    let covered = 0;
    for (const m of matched) {
      covered += m.amount || 0;
      if (!(m.acquired > 0) || m.acquired <= tSec) amount += m.amount || 0;
    }
    amount += Math.max(0, (sale.amount || 0) - covered);
  }
  return amount > AMOUNT_EPSILON ? amount : 0;
};

/* Coins received as income (staking, rewards, airdrops) were not paid for:
   their value on arrival is their cost for a sale, but not money put in —
   so the paid-in line leaves them out and the gap above it shows them as
   what they are, earned. */
const paidInAt = (h, tSec, currency, lots) => {
  let paid = 0;
  for (const lot of lotsIn(lots || holdingLots(h), currency)) {
    if (lot.kind === "income") continue;
    if (!(lot.time > 0) || lot.time <= tSec) paid += lot.paid || 0;
  }
  for (const sale of h.sales || []) {
    if (!(sale.time > tSec) || !inCurrency(sale, currency)) continue;
    for (const m of Array.isArray(sale.matched) ? sale.matched : []) {
      if (m.kind === "income") continue;
      if (!(m.acquired > 0) || m.acquired <= tSec) paid += m.cost || 0;
    }
  }
  return paid;
};

/* The same shape as `buildPortfolioParts` — `{ series, parts }` — plus
 * `paid`, the money in the coins held at each point, sampled on the same
 * times. Coins no longer held are not drawn: the chart fetches histories
 * for what is held now, and a coin sold to nothing has none. `gone` counts
 * them, so the note can say so. */
const buildHeldParts = (histories, holdings, currency, method) => {
  const held = [];
  let gone = 0;
  for (const h of holdings) {
    if (!(holdingAmount(h) > 0)) {
      if ((h.sales || []).length) gone += 1;
      continue;
    }
    const prices = histories[h.coin];
    if (Array.isArray(prices) && prices.length > 1) {
      held.push({ h, prices, lots: heldLots(holdingLots(h), holdingAmount(h), method || DEFAULT_COST_METHOD) });
    }
  }
  if (!held.length) return null;
  const all = held.map((p) => p.prices);
  const window = commonWindow(all);
  if (!window) return null;
  const times = alignedTimes(all, window);
  if (!times) return null;
  const sec = (t) => Math.floor(+t / 1000);
  const values = [];
  for (const p of held) {
    const sampled = sampleSeriesAt(p.prices, times);
    if (!sampled) return null;
    values.push(sampled.map((price, i) => price * heldAmountAt(p.h, sec(times[i]), p.lots)));
  }
  const series = times.map((time, i) => {
    let total = 0;
    for (const v of values) total += v[i];
    return { price: total, time };
  });
  const paid = times.map((time) => {
    let total = 0;
    for (const p of held) total += paidInAt(p.h, sec(time), currency, p.lots);
    return { price: total, time };
  });
  const parts = held.map((p, k) => ({ coin: p.h.coin, values: values[k] }));
  const last = (p) => p.values[p.values.length - 1] || 0;
  parts.sort((a, b) => last(b) - last(a));
  return { series, parts, paid, gone };
};

/* ── purchase lots ─────────────────────────────────────────────────────────
 * A lot is one purchase: { amount, paid, time, source }. Cost basis and P/L
 * come from lots; a holding without lots simply shows no P/L. Watched
 * addresses generate "chain" lots: every incoming transfer counts as a buy
 * at that date's price, outgoing transfers consume the oldest lots first.
 */
const lotsAmount = (lots) => (lots || []).reduce((sum, l) => sum + l.amount, 0);

const lotsBasis = (lots) => (lots || []).reduce((sum, l) => sum + l.paid, 0);

/* **How much a new purchase or receipt adds to the amount held** (28 Sep
 * 2026). A record the amount cannot hold is trimmed away by `heldLots` the
 * moment it is saved: logging "bought 2 SOL for 300" on a holding whose
 * amount was never typed stored the purchase and showed nothing — the
 * amount stayed 0 and the cost cell still said "+ lot". So the amount grows
 * by whatever the record adds beyond coins already counted but not yet
 * explained by a purchase:
 *
 *  - the usual order — type the amount, then log the purchases that explain
 *    it — raises nothing, because each purchase is already counted;
 *  - after the amount was reduced by hand, the lots outnumber it and nothing
 *    is unexplained, so a new record adds its whole size: the coins that
 *    left are not brought back.
 *
 * Only the hand-entered part: a watched address reports its own balance. */
const lotAmountGrowth = (holding, amount) => {
  const unexplained = Math.max(0, (holding.amount || 0) - lotsAmount(holding.lots));
  return Math.max(0, amount - unexplained);
};

/* A holding is the sum of its parts: the manually entered amount plus one
 * entry per watched address. These two helpers are the only places that
 * knowledge lives — everything else asks for the total. */
const holdingAmount = (h) =>
  (h.amount || 0) +
  (h.watches || []).reduce((sum, w) => sum + (w.amount || 0), 0);

const holdingLots = (h) => {
  const lots = [...(h.lots || [])];
  for (const w of h.watches || []) lots.push(...(w.lots || []));
  return lots;
};

/* What FIFO would consume for a disposal of `amount`: the basis taken out of
 * the oldest lots first, how much of the disposal those lots actually covered,
 * and — the part that matters for a report — *which* lots, in slices.
 *
 * A disposal on its own is half a record. Every tax form and every tax tool
 * asks the same question in the same shape: which acquisition, which disposal,
 * what did it cost, what did it fetch. Totals can't answer that, because one
 * sale can consume several purchases bought on different days at different
 * prices, and each of those pairs has its own holding period. So the slices
 * are kept: `matched` is what the lots gave up, one entry per lot touched.
 *
 * Selling more than you have logged purchases for is normal — the uncovered
 * part simply has no basis, and saying so is better than pretending the whole
 * sale had one. Pairs with `reduceLotsFifo`, which removes exactly this.
 */
/* The order a method eats them in, as indices into the original array.
 *
 * Indices rather than a sorted copy, because what is left over must come back
 * in the order it was stored: the lot list on screen is a record of what was
 * entered, and re-ordering it every time the method changes would make the
 * setting look like it had rewritten history — which is the one thing it must
 * never appear to do.
 *
 * FIFO is the array's own order, deliberately, and that is not the same as
 * "by date": chain lots arrive in chronological order and hand-entered ones in
 * the order they were typed, undated ones included. Sorting by `time` here
 * would silently move undated lots (`time: 0`) to the front and change the
 * cost basis of holdings that predate this function.
 */
/* `before` (unix seconds, optional): only lots acquired on or before it may
   be eaten — a sale recorded with a date in the past cannot consume a
   purchase that had not happened yet (28 Sep 2026, when dates came to the
   form). Undated lots are always eligible; absent, every lot is. */
const lotOrderFor = (lots, method, before) => {
  const order = (lots || [])
    .map((_, i) => i)
    .filter((i) => !(before > 0) || !((lots[i].time || 0) > before));
  if (method === "lifo") return order.reverse();
  if (method === "hifo") {
    const unit = (i) => {
      const lot = lots[i];
      return lot.amount > 0 ? lot.paid / lot.amount : 0;
    };
    // Ties keep the array's order, so HIFO on equally-priced lots is FIFO
    return order.sort((a, b) => unit(b) - unit(a) || a - b);
  }
  return order;
};

const consumeLots = (lots, amount, method, before) => {
  let left = amount;
  let basis = 0;
  let covered = 0;
  const matched = [];
  for (const index of lotOrderFor(lots, method, before)) {
    const lot = lots[index];
    if (left <= 0) break;
    const take = Math.min(lot.amount, left);
    const cost = lot.amount > 0 ? lot.paid * (take / lot.amount) : 0;
    basis += cost;
    covered += take;
    left -= take;
    matched.push({
      amount: take,
      cost,
      acquired: lot.time || 0,
      source: lot.source === "chain" ? "chain" : "manual",
      /* An income receipt (staking, a reward, an airdrop) stays one when it
         is sold: the tax report counts it as income when received and as a
         cost when disposed of (tax-report.js). */
      ...(lot.kind === "income" ? { kind: "income" } : {}),
    });
  }
  return { basis, covered, matched };
};

/* ── money entered in another currency ─────────────────────────────────────
 * A lot's `paid` and a sale's `received` are numbers of a specific currency,
 * and every price on this screen is in whatever is selected right now. When
 * those differ there are three things you can do, and only one of them is
 * honest in the space available:
 *
 *   - **Add them anyway.** What this did until now: a purchase entered as
 *     15,000 USD was read as 15,000 EUR the moment the display changed, and
 *     the row P/L, the headline Unrealized, the chart's COST line and the
 *     CSV's own "All amounts in EUR" header all repeated it.
 *   - **Convert at today's rate.** True as far as it goes — the gain, valued
 *     in EUR today — but it is not the return a euro buyer had, and the
 *     figure would change every day for a purchase that never moved. It also
 *     needs a rate we may not have, at which point there is a number on
 *     screen that quietly stops updating.
 *   - **Set it aside and say so.** What `alerts.js` already does with a price
 *     target set in another currency, and what this does now.
 *
 * A lot with no currency at all was recorded before the field existed. It is
 * read as "whatever is on screen", which is exactly how it has always
 * behaved — the alternative is inventing a currency for someone's data.
 */
const inCurrency = (entry, currency) =>
  !entry || !entry.currency || entry.currency === currency;

/* "USD", "USD and GBP", "USD, GBP and EUR" — the currencies a set of set-aside
 * entries was recorded in, so a note can name them instead of saying "another
 * currency" to someone who has to go and find out which. */
const pausedCurrencies = (entries) => {
  const seen = [];
  for (const e of entries || []) {
    if (e && e.currency && !seen.includes(e.currency)) seen.push(e.currency);
  }
  if (seen.length <= 1)
    return seen[0] || msg("po_another_currency", "another currency");
  return `${seen.slice(0, -1).join(", ")} and ${seen[seen.length - 1]}`;
};

/* "2 purchases", "1 purchase and 3 sales" — a count that says what was set
 * aside, since a purchase and a sale are set aside from different figures. */
const pausedCount = (row) => {
  const parts = [];
  const lots = row.paused.length;
  const sales = row.salesPaused.length;
  if (lots)
    parts.push(
      lots > 1
        ? msg("po_n_purchases", "$1 purchases", lots)
        : msg("po_one_purchase", "1 purchase"),
    );
  if (sales)
    parts.push(
      sales > 1
        ? msg("po_n_sales", "$1 sales", sales)
        : msg("po_one_sale", "1 sale"),
    );
  return parts.join(" and ");
};

const lotsIn = (lots, currency) =>
  (lots || []).filter((l) => inCurrency(l, currency));

const lotsOut = (lots, currency) =>
  (lots || []).filter((l) => !inCurrency(l, currency));

/* Realized gain on one sale.
 *
 * Only the part of the sale that had a purchase behind it can produce a gain,
 * so the proceeds are split by the covered share before the basis is taken
 * off. That is arithmetic rather than an assumption: a sale happens at one
 * price, so every unit sold fetched the same amount.
 */
const saleRealized = (sale) => {
  if (!sale || !(sale.basisAmount > 0) || !(sale.amount > 0)) return null;
  const proceeds = sale.received * (sale.basisAmount / sale.amount);
  return proceeds - sale.basis;
};

/* The calendar year a disposal falls in, or null when it was never dated.
 *
 * Deliberately the **calendar** year and never called a tax year: the tax year
 * ends on 5 April in the UK, 30 June in Australia and 31 December in most of
 * the rest. A tax year needs a country, and this figure has none — the tax
 * report helper (tax-report.js) asks for one and uses that country's year.
 * Here a calendar year is the fact the app can state without guessing. */
const saleYear = (sale) =>
  sale && sale.time > 0 ? new Date(sale.time * 1000).getFullYear() : null;

/* Both sides of a disposal are in one currency, so a sale either counts
 * toward the displayed total or it does not. `currency` is optional so the
 * report — which prints each figure beside its own currency — can still ask
 * for everything. */
const salesRealized = (sales, currency) =>
  (sales || []).reduce((sum, s) => {
    if (currency && !inCurrency(s, currency)) return sum;
    const r = saleRealized(s);
    return r == null ? sum : sum + r;
  }, 0);

const hasRealized = (sales, currency) =>
  (sales || []).some(
    (s) => (!currency || inCurrency(s, currency)) && saleRealized(s) != null,
  );

// Below this, a difference between what you hold and what you've logged is
// double-precision residue from adding fractions, not a real remainder
/* "First in, first out — the oldest purchase is sold first." One sentence for
 * whichever method is on, so the note under the picker never has to be kept in
 * sync with `COST_METHODS` by hand. */
const methodTitle = (method) => {
  const m =
    COST_METHODS.find((x) => x.value === method) ||
    COST_METHODS.find((x) => x.value === DEFAULT_COST_METHOD);
  return msg("po_method_line", "$1 — $2", m.label, m.title.toLowerCase());
};

const AMOUNT_EPSILON = 1e-9;

/* The lots you still hold.
 *
 * Cost basis must never cover more coins than you have. It could: reducing an
 * amount by hand — which is what selling looked like before sales could be
 * recorded — left the lots untouched, so a holding sold down to half still
 * carried the full original basis and reported the whole position's gain on
 * coins that were gone. Every basis and P/L figure goes through here, so the
 * clamp holds whatever caused the mismatch: a recorded sale, a hand edit, or
 * an import.
 *
 * Which lots survive is the chosen method's answer (`COST_METHODS`), because
 * nobody said which coins left — it is an assumption either way, and it should
 * be the assumption you picked. A past *sale* is different: that recorded the
 * lots it ate at the time and is never re-decided.
 */
const heldLots = (lots, amount, method) => {
  const total = lotsAmount(lots);
  if (!(total > amount + AMOUNT_EPSILON)) return lots || [];
  return reduceLots(lots || [], total - amount, method);
};

/* Remove `amount` from the lots the method eats first, shrinking a partially
 * consumed lot's paid proportionally. Returns a new array **in the original
 * order** — see `lotOrderFor` for why that matters. */
const reduceLots = (lots, amount, method, before) => {
  let left = amount;
  const kept = new Map();
  /* Lots the order leaves out (acquired after `before`) are kept whole. */
  const order = lotOrderFor(lots, method, before);
  (lots || []).forEach((lot, i) => {
    if (!order.includes(i)) kept.set(i, lot);
  });
  for (const index of order) {
    const lot = lots[index];
    if (left <= 0) {
      kept.set(index, lot);
      continue;
    }
    if (lot.amount <= left) {
      left -= lot.amount; // fully consumed
      continue;
    }
    const keep = lot.amount - left;
    kept.set(index, {
      ...lot,
      amount: keep,
      paid: lot.paid * (keep / lot.amount),
    });
    left = 0;
  }
  // Back in storage order, whatever order they were eaten in
  return lots.map((_, i) => kept.get(i)).filter(Boolean);
};

const reduceLotsFifo = (lots, amount) => reduceLots(lots, amount, "fifo");

// Replay chronological balance deltas into lots: buys become lots priced by
// priceAt(timeSec) (0 paid when the price is unknown), spends reduce FIFO.
// `currency` is what `priceAt` quoted in, and it is stamped on every lot for
// the same reason a hand-entered one carries it.
const buildLotsFromDeltas = (deltas, priceAt, currency) => {
  let lots = [];
  for (const { time, delta } of deltas || []) {
    if (delta > 0) {
      const price = priceAt(time);
      lots.push({
        amount: delta,
        paid: price != null ? price * delta : 0,
        time,
        source: "chain",
        currency,
      });
    } else if (delta < 0) {
      lots = reduceLotsFifo(lots, -delta);
    }
  }
  return lots.slice(0, MAX_LOTS_PER_HOLDING);
};

// price-at-date lookup for chain lots: nearest point of the cached year
// series, falling back to the all-time series for older dates. Estimation —
// good enough for an inferred cost basis, and labeled as such in the UI.
const makePortfolioPriceAt = async (coin, currency) => {
  const year = await getPortfolioHistory(coin, "year", currency);
  const all = await getPortfolioHistory(coin, "all", currency);
  const toSec = (t) => {
    const ms = Number(new Date(t));
    return isFinite(ms) ? ms / 1000 : null;
  };
  const nearest = (series, timeSec) => {
    if (!Array.isArray(series) || !series.length) return null;
    let best = null;
    let bestDist = Infinity;
    for (const point of series) {
      const sec = toSec(point.time);
      if (sec == null) continue;
      const dist = Math.abs(sec - timeSec);
      if (dist < bestDist) {
        bestDist = dist;
        best = point.price;
      }
    }
    return isFinite(best) ? best : null;
  };
  return (timeSec) => {
    const yearFirst =
      Array.isArray(year) && year.length ? toSec(year[0].time) : null;
    if (yearFirst != null && timeSec >= yearFirst) {
      const p = nearest(year, timeSec);
      if (p != null) return p;
    }
    const p = nearest(all, timeSec);
    return p != null ? p : nearest(year, timeSec);
  };
};

/* ── export helpers ────────────────────────────────────────────────────────
 * JSON backup/restore + a spreadsheet-friendly CSV report (a small tax aid:
 * cost basis and unrealized P/L per coin). Raw numbers with dot decimals so
 * spreadsheet apps parse them regardless of the display format setting.
 */
const csvField = (value) => {
  const s = String(value == null ? "" : value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* A year is where most jurisdictions put the line between a short-term and a
 * long-term holding, and it is the single split a tax return cares most about.
 * We report the days held and where each lot falls against this threshold —
 * and say plainly in the file that the threshold is not universal, because it
 * is a fact about tax law we can state but not decide for the reader. */
const LONG_TERM_DAYS = 365;
const DAY_MS = 86400000;

const lotHeldDays = (lot, nowMs) =>
  lot.time > 0 ? Math.floor((nowMs - lot.time * 1000) / DAY_MS) : null;

// One lot, priced and aged. Everything the report needs about it in one place
// so the summary and the per-lot table can't drift apart.
const describeLot = (lot, price, nowMs) => {
  const held = lotHeldDays(lot, nowMs);
  const value = price != null ? price * lot.amount : null;
  const gain = value != null ? value - lot.paid : null;
  return {
    lot,
    held,
    longTerm: held == null ? null : held >= LONG_TERM_DAYS,
    unitCost: lot.amount > 0 ? lot.paid / lot.amount : null,
    value,
    gain,
    gainPct: gain != null && lot.paid > 0 ? (gain / lot.paid) * 100 : null,
  };
};

/* rows = computeTotals().rows: [{ coin, amount, lots, price, value }].
 *
 * Three blocks: a summary of the whole portfolio, a line per coin, then a line
 * per purchase lot. The lot table is what a return actually needs — dated
 * acquisitions with what was paid — and it now carries each lot's holding
 * period and its own unrealized gain, so the sheet can be sorted or filtered
 * on the short/long-term split without recomputing anything.
 *
 * The one thing this file must not do is quietly imply it covers everything.
 * Cost basis only exists for the amount you have logged purchases for, which
 * can be less than what you hold; every affected number therefore states the
 * amount it applies to, and the unlogged remainder is reported as its own
 * column rather than left to be inferred from a mismatch.
 */
const buildPortfolioCsv = (rows, currency, costMethod) => {
  const nowMs = Date.now();
  const stamp = new Date(nowMs).toISOString().slice(0, 10);
  const perCoin = [];
  let totalRealized = 0;
  let anyRealized = false;
  let totalBasis = 0;
  let totalCostedValue = 0;
  let totalHoldingsValue = 0;
  let shortBasis = 0;
  let shortValue = 0;
  let longBasis = 0;
  let longValue = 0;
  let undatedLots = 0;
  let estimatedLots = 0;
  // Entered in a currency other than the one this file totals in
  let otherCurrencyLots = 0;
  let otherCurrencySales = 0;

  for (const r of rows) {
    /* Every figure summed below is in `currency`, so only the lots actually
     * entered in it can be summed. The lot table further down still lists all
     * of them, each beside the currency it was recorded in — dropping a
     * purchase from a tax record because a display setting changed would be
     * far worse than leaving it out of a total that says so. */
    const lots = lotsIn(r.lots || [], currency);
    const otherLots = lotsOut(r.lots || [], currency);
    if (otherLots.length) otherCurrencyLots += otherLots.length;
    const lotAmt = lotsAmount(lots);
    const basis = lotAmt > 0 ? lotsBasis(lots) : null;
    const costedValue =
      basis != null && r.price != null ? r.price * lotAmt : null;
    const pl = costedValue != null ? costedValue - basis : null;
    if (r.value != null) totalHoldingsValue += r.value;
    if (costedValue != null) {
      totalBasis += basis;
      totalCostedValue += costedValue;
    }
    for (const lot of lots) {
      const d = describeLot(lot, r.price, nowMs);
      if (d.held == null) undatedLots++;
      if (lot.source === "chain") estimatedLots++;
      if (d.value == null) continue;
      // Undated lots can't be aged, so they sit with the short-term side
      // rather than being credited with a holding period they may not have
      if (d.longTerm) {
        longBasis += lot.paid;
        longValue += d.value;
      } else {
        shortBasis += lot.paid;
        shortValue += d.value;
      }
    }
    if (hasRealized(r.sales, currency)) {
      totalRealized += salesRealized(r.sales, currency);
      anyRealized = true;
    }
    otherCurrencySales += (r.sales || []).filter(
      (sale) => !inCurrency(sale, currency),
    ).length;
    perCoin.push({
      r,
      lotAmt,
      basis,
      avgCost: basis != null && lotAmt > 0 ? basis / lotAmt : null,
      costedValue,
      pl,
      plPct: pl != null && basis > 0 ? (pl / basis) * 100 : null,
      // What you hold beyond what you've logged a purchase for. Its value is
      // in the portfolio total but not in any cost basis or gain.
      unlogged: Math.max(0, r.amount - lotAmt),
    });
  }

  const totalPl = totalBasis > 0 ? totalCostedValue - totalBasis : null;
  /* Doubles carry their error in the last couple of significant digits, and a
   * spreadsheet shows every one of them: 0.7 of 1.2 leaves "0.49999999999999994"
   * in the unlogged column and a clean $34,000 gain prints as 33999.99999999999.
   * Twelve significant digits is past anything real here and short of where the
   * noise lives — and unlike a fixed number of decimals it doesn't round a
   * fraction-of-a-cent coin down to zero. */
  const num = (v, digits) =>
    v == null || !isFinite(v)
      ? ""
      : digits != null
        ? v.toFixed(digits)
        : Number(v.toPrecision(12));

  const lines = [
    `# PriceTab cost basis report — ${stamp}`,
    "# This is the record a tax return is worked out from, not the return itself.",
    "# It knows only what you entered in PriceTab: no exchange history, no transfers, no fees, no crypto-to-crypto trades, no staking or airdrop income. Sales appear only if you recorded them.",
    "# Nothing here is tax advice, and no tax has been calculated.",
    `# Totals are in ${currency}. The method now selected is ${methodTitle(costMethod)}.`,
    /* Per line, not once at the top. The setting can only apply to sales made
     * after it was chosen — a disposal recorded under FIFO consumed those lots
     * and they are gone — so a single header claim would be false the moment
     * anybody changed it. Each disposal below carries the method it was
     * actually made with. */
    "# A sale keeps the method it was recorded with. The Method column on each disposal says which, and sales made before PriceTab offered a choice say FIFO, because that is what they used.",
    ...(otherCurrencyLots || otherCurrencySales
      ? [
          /* This line used to read "All amounts in X", and it was not true:
           * `paid` carried no currency, so a purchase entered in dollars was
           * summed as euros and the file said so in its own header. */
          `# ${otherCurrencyLots} purchase(s) and ${otherCurrencySales} sale(s) were entered in a different currency. They are listed below with their own currency and are NOT in the totals above — converting them at today's rate would state a gain that moves on days the purchase did not.`,
        ]
      : []),
    `# msg("po_long_term", "Long term") here means held ${LONG_TERM_DAYS} days or more. That threshold is not the same in every country — check yours.`,
    "",
    "Summary,Value",
    `Portfolio value,${num(totalHoldingsValue)}`,
    `Cost basis (logged purchases),${num(totalBasis)}`,
    `Value of those purchases,${num(totalCostedValue)}`,
    `Unrealized P/L,${num(totalPl)}`,
    `Unrealized P/L %,${totalBasis > 0 ? ((totalPl / totalBasis) * 100).toFixed(2) : ""}`,
    `Short-term basis (held under ${LONG_TERM_DAYS} days),${num(shortBasis)}`,
    `Short-term unrealized P/L,${shortBasis > 0 ? num(shortValue - shortBasis) : ""}`,
    `Long-term basis (held ${LONG_TERM_DAYS} days or more),${num(longBasis)}`,
    `Long-term unrealized P/L,${longBasis > 0 ? num(longValue - longBasis) : ""}`,
    `Realized P/L (recorded sales),${anyRealized ? num(totalRealized) : ""}`,
    "",
    "Coin,Name,Amount held,Amount with cost logged,Amount without cost,Cost basis,Avg cost,Current price,Current value,Unrealized P/L,P/L %",
  ];

  for (const c of perCoin) {
    lines.push(
      [
        c.r.coin,
        csvField(COIN_NAMES[c.r.coin] || c.r.coin),
        num(c.r.amount),
        c.lotAmt > 0 ? num(c.lotAmt) : "",
        c.unlogged > 0 ? num(c.unlogged) : "",
        num(c.basis),
        num(c.avgCost),
        num(c.r.price),
        num(c.r.value),
        num(c.pl),
        num(c.plPct, 2),
      ].join(","),
    );
  }
  if (totalBasis > 0) {
    lines.push(
      `Total,,,,,${num(totalBasis)},,,${num(totalCostedValue)},${num(totalPl)},${((totalPl / totalBasis) * 100).toFixed(2)}`,
    );
  }

  const lotLines = [];
  for (const c of perCoin) {
    for (const lot of c.r.lots || []) {
      const own = inCurrency(lot, currency);
      /* A gain is a price minus a cost, and the price is in `currency`. Where
       * the cost is not, there is no gain to state — the columns are left
       * empty rather than filled with a subtraction across two currencies. */
      const d = describeLot(lot, own ? c.r.price : null, nowMs);
      lotLines.push(
        [
          c.r.coin,
          lot.time > 0
            ? new Date(lot.time * 1000).toISOString().slice(0, 10)
            : "",
          num(lot.amount),
          num(lot.paid),
          lot.currency || currency,
          num(d.unitCost),
          own ? num(c.r.price) : "",
          num(d.value),
          num(d.gain),
          num(d.gainPct, 2),
          d.held == null ? "" : d.held,
          d.longTerm == null ? "unknown" : d.longTerm ? "long" : "short",
          lot.source === "chain"
            ? msg("po_chain_estimated", "chain (estimated)")
            : "manual",
          own ? "" : "not in totals",
        ].join(","),
      );
    }
  }
  if (lotLines.length) {
    lines.push(
      "",
      "Purchase lots",
      "Coin,Date acquired,Amount,Paid,Paid currency,Cost per unit,Current price,Current value,Unrealized gain,Gain %,Days held,Term,Source,Note",
      ...lotLines,
    );
  }

  /* Disposals, as matched pairs.
   *
   * A sale is only half a record. Every tax form and every tax tool asks the
   * same thing in the same shape — which acquisition, which disposal, what it
   * cost, what it fetched — because one sale can consume several purchases
   * bought on different days, and each of those pairs has its own holding
   * period and its own gain. A single line per sale can't carry that, so each
   * sale becomes one line per purchase it consumed.
   *
   * Proceeds are split across the pairs by amount. That is arithmetic, not an
   * allocation: a sale happens at one price, so every unit fetched the same.
   *
   * Two kinds of line have no acquisition to name, and both are emitted
   * rather than dropped, because a proceeds column that doesn't add up to
   * what you received is the first thing an accountant will query:
   *   - the part of a sale with no purchase behind it, and
   *   - sales recorded before the pairing existed, which kept only totals.
   */
  const saleLines = [];
  let partialSales = 0;
  let unpairedSales = 0;
  for (const c of perCoin) {
    for (const sale of c.r.sales || []) {
      if (!(sale.amount > 0)) continue;
      const perUnit = sale.received / sale.amount;
      const soldOn =
        sale.time > 0
          ? new Date(sale.time * 1000).toISOString().slice(0, 10)
          : "";
      const partial = sale.basisAmount > 0 && sale.basisAmount < sale.amount;
      if (partial) partialSales++;

      const pair = (amount, cost, acquired, source) => {
        const proceeds = perUnit * amount;
        const gain = cost == null ? null : proceeds - cost;
        const heldDays =
          acquired > 0 && sale.time > 0
            ? Math.floor((sale.time - acquired) / (DAY_MS / 1000))
            : null;
        saleLines.push(
          [
            c.r.coin,
            acquired > 0
              ? new Date(acquired * 1000).toISOString().slice(0, 10)
              : "",
            soldOn,
            num(amount),
            num(proceeds),
            cost == null ? "" : num(cost),
            num(gain),
            gain != null && cost > 0 ? ((gain / cost) * 100).toFixed(2) : "",
            heldDays == null ? "" : heldDays,
            heldDays == null
              ? "unknown"
              : heldDays >= LONG_TERM_DAYS
                ? "long"
                : "short",
            source,
            // The method this sale actually ate by, not the one selected now
            sale.method || DEFAULT_COST_METHOD,
            // Both sides of a disposal were recorded together, so one stamp
            // covers proceeds, basis and gain on this line
            sale.currency || currency,
            inCurrency(sale, currency) ? "" : "not in totals",
          ].join(","),
        );
      };

      const matched = sale.matched || [];
      if (matched.length) {
        for (const m of matched) pair(m.amount, m.cost, m.acquired, m.source);
      } else if (sale.basisAmount > 0) {
        // Recorded before pairing existed: the totals survive, the dates don't
        unpairedSales++;
        pair(sale.basisAmount, sale.basis, 0, "unpaired");
      }
      // Whatever the purchases didn't cover — proceeds with no cost to match
      const uncovered = sale.amount - (sale.basisAmount || 0);
      if (uncovered > AMOUNT_EPSILON)
        pair(uncovered, null, 0, msg("po_no_purchase", "no purchase"));
    }
  }
  if (saleLines.length) {
    lines.push(
      "",
      "Disposals (one line per purchase consumed)",
      "Coin,Date acquired,Date sold,Amount,Proceeds,Cost basis,Gain,Gain %,Days held,Term,Source,Method,Currency,Note",
      ...saleLines,
    );
  }

  // Caveats last, and only the ones that actually apply to this file
  const notes = [];
  if (partialSales > 0) {
    notes.push(
      `# ${partialSales} sale(s) covered more than the purchases logged for that coin. The uncovered part appears with no acquisition date and no cost ('no purchase'), so the proceeds column still adds up to what was received.`,
    );
  }
  if (unpairedSales > 0) {
    notes.push(
      `# ${unpairedSales} sale(s) were recorded before PriceTab paired each disposal with the purchases it consumed. Their totals are right, but the acquisition dates were not kept, so no holding period could be worked out ('unpaired').`,
    );
  }
  if (perCoin.some((c) => c.unlogged > 0)) {
    notes.push(
      "# Some holdings have no purchase logged for part of the amount ('Amount without cost'). Their value counts toward the portfolio total but not toward any cost basis or gain.",
    );
  }
  if (estimatedLots > 0) {
    notes.push(
      `# ${estimatedLots} lot(s) came from a watched address, priced at an estimate of the market price on the transfer date — not what you actually paid.`,
    );
  }
  if (undatedLots > 0) {
    notes.push(
      `# ${undatedLots} lot(s) have no acquisition date, so no holding period could be worked out. They are counted as short term above.`,
    );
  }
  lines.push("", ...notes);
  return lines.join("\n");
};

const downloadTextFile = (filename, text, mime) => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/* What a hidden figure looks like.
 *
 * **Not a blur.** A blurred number still reports its own size: six blurred
 * characters are not the same secret as three, the grouping commas survive the
 * blur, and a blur is a thing a screenshot can be sharpened back out of. A
 * mask of fixed width says a figure is there and says nothing else, whether
 * the total behind it is 40 or 400,000.
 *
 * The currency symbol and the sign stay with it. Which currency you are
 * looking at is not a balance, and the direction is already being said two
 * inches away by the colour of the row — masking the sign would hide nothing
 * and lose the only part of the figure that still reads. */
const MONEY_MASK = "•••";

/* The lot form's date as the moment it records: noon UTC on the day picked,
 * so the day is the same one in every timezone a person might open the tab
 * in — or undefined for "now", when nothing or today is picked (a record
 * made today keeps its hour, and with it its order among today's). */
const lotToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const lotDateSeconds = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "") || value === lotToday()) return undefined;
  const ms = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
};

/* ── component ─────────────────────────────────────────────────────────── */
class Portfolio extends PureComponent {
  constructor(props) {
    super(props);
    // `drafts` holds in-progress input text (keyed "COIN:amount" /
    // "COIN:cost") so typing "0." / "" never fights the canonical numeric
    // value coming back from the parent.
    this.state = {
      query: "",
      // Which allocation segment the pointer or the keyboard is on, or null
      allocAt: null,
      /* The strip's own width in px. A label only goes inside a segment that
       * can actually hold one, and "can it hold one" is a pixel question — the
       * same reason `PortfolioChart.measure()` runs on every update rather
       * than only on resize. Null until measured, and until then no segment is
       * labelled: an unlabelled bar for one frame is better than a bar of
       * clipped words. */
      allocWidth: null,
      /* Whether the target-share editor under the strip is open. Not
       * persisted, deliberately: a target is persisted and setting one is not
       * — this is a place you go, and the portfolio opens on its holdings,
       * the same rule `chartOpen` follows. */
      showTargets: false,
      /* The "what is this" panel. Not persisted: it is read once and then
       * never again, which is the whole reason it is behind a button. */
      showInfo: false,
      drafts: {},
      /* Which number box just refused a character (`"BTC:amount"`, or the
         lot field's own name), or null. */
      numWarn: null,
      importError: false,
      // What a merge just did, said in words for a few seconds
      mergeNote: null,
      /* The last thing that threw data away, and everything that was there
       * before it. Removing a holding takes its purchases and its recorded
       * sales with it, and Import replaces the whole list — both were a
       * single click with no confirmation and no way back, on the one screen
       * in this app holding numbers nobody else has a copy of. Kept until the
       * view is closed, the way a removed price target is. */
      undo: null,
      watchAddress: "",
      watchBusy: false,
      // Null, or the reason the last attempt failed — see `watchErrorText`
      watchError: null,
      expandedCoin: null, // coin whose lot editor is open
      lotAmount: "", // lot form drafts (one editor open at a time)
      lotPaid: "",
      lotMode: "buy", // "buy" | "income" | "sell" — the same two fields mean all three
      /* The lot form's date, "YYYY-MM-DD" or "" for today: a tax year and a
         holding period turn on it (portfolio-ledger.js). */
      lotDate: "",
      sort: loadPortfolioSortFromStorage(), // holdings order (persisted)
      chartPeriod: loadPortfolioPeriodFromStorage(),
      histories: {}, // { COIN: [{ price, time }] } for the value chart
      // The chart brought forward: same series, given a scale, a crosshair and
      // the purchases and sales drawn where they happened
      chartOpen: false,
      chartMode: loadPortfolioChartMode(), // "total" | "bycoin" | "pnl"
      /* The ledger views (portfolio-ledger.js): the holding open in detail,
         the tax helper's screen, the activity list at full length, and the
         tax choices — kept, like any setting. */
      assetOpen: null,
      taxOpen: false,
      taxSettings: loadTaxSettings(),
      taxYear: null,
      taxDrafts: {},
      // The tax guide's picker and its two views (tax-guide.js)
      taxQuery: "",
      taxFilter: "all",
      taxView: "country",
      activityAll: false,
    };
    this._chartToken = 0; // invalidates in-flight history loads
    this._chartSig = null; // last loaded coins|currency|period signature
    this._seriesMemo = null; // keeps the summed series referentially stable
    this._eventsMemo = null; // …and the marker list
    this._importErrTimer = null;
    this.fileInput = createRef();
    /* The chart's wrapper, animated on a mode switch — see
     * `componentDidUpdate`. */
    this.chartSwapRef = createRef();
    this.handleChartKey = this.handleChartKey.bind(this);
    this.toggleChart = this.toggleChart.bind(this);
    this.setChartMode = this.setChartMode.bind(this);
    Object.assign(this, portfolioLedger(this), taxGuide(this));
  }

  componentDidMount() {
    this.maybeLoadHistories();
    this.measureAllocation();
    /* Esc, taken in the capture phase.
     *
     * The app's own handler listens on `document` and closes the portfolio
     * outright, which is the right answer from the holdings list and the wrong
     * one from inside the chart: pressing Esc there means "put the chart
     * away", not "throw the whole view away". Capturing at `document` runs
     * before the app's bubble-phase listener, and stopping propagation there
     * stops the event reaching it at all. It only intervenes while the chart
     * is actually open, so every other Esc in this view behaves as it did.
     */
    document.addEventListener("keydown", this.handleChartKey, true);
  }

  componentDidUpdate(prevProps, prevState) {
    this.maybeLoadHistories();
    this.measureAllocation();

    /* A mode switch is a different drawing, so it arrives.
     *
     * The line morphs when the drawing is the same and the data changed (see
     * `morphLine`), but a line and a stack of bands and a row of ranked bars
     * are not states of one shape — there is nothing to interpolate between,
     * so this cross-fades instead.
     *
     * Driven from here with the Web Animations API rather than a CSS class or
     * a React `key`: a key would remount the chart and throw away its
     * measurement, and a class would need adding and removing to replay. This
     * is one call, one-shot, and `getAnimations()` is empty again when it
     * lands — which matters on a page that opens in every new tab.
     *
     * Opacity and a two-pixel lift only: neither touches layout. */
    if (prevState && prevState.chartMode !== this.state.chartMode) {
      const node = this.chartSwapRef.current;
      if (
        node &&
        typeof node.animate === "function" &&
        !prefersReducedMotion()
      ) {
        node.animate(
          [
            { opacity: 0, transform: "translateY(2px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }
    }
  }

  /* The strip's width, for deciding which segments can hold a label.
   *
   * Guarded on the value actually changing: this runs from
   * `componentDidUpdate`, and a `setState` there that does not check first is
   * an infinite loop. Rounded, so a sub-pixel reflow does not count as a
   * change. */
  measureAllocation() {
    const node = this.allocNode;
    if (!node) {
      if (this.state.allocWidth != null) this.setState({ allocWidth: null });
      return;
    }
    const width = Math.round(node.getBoundingClientRect().width);
    if (width > 0 && width !== this.state.allocWidth) {
      this.setState({ allocWidth: width });
    }
  }

  componentWillUnmount() {
    this._gone = true;
    this._chartToken++; // drop any in-flight load's setState
    if (this._importErrTimer) clearTimeout(this._importErrTimer);
    if (this._mergeNoteTimer) clearTimeout(this._mergeNoteTimer);
    clearTimeout(this._numT);
    document.removeEventListener("keydown", this.handleChartKey, true);
  }

  /* `_chartHolding` is an instance field, not state, and deliberately: nothing
   * renders from it, and routing it through `setState` would re-render the
   * whole portfolio on every arrow key — the same reason the crosshair itself
   * is written imperatively. It is read by a capture-phase listener, so it
   * also has to be true *synchronously* by the time the next key arrives. */
  handleChartKey(e) {
    if (e.key !== "Escape") return;
    /* The ledger's two screens are the same kind of place as the chart: Esc
       puts them away and leaves the portfolio open. */
    if (!this.state.chartOpen && (this.state.assetOpen || this.state.taxOpen)) {
      e.stopPropagation();
      e.preventDefault();
      this.setState({ assetOpen: null, taxOpen: false });
      return;
    }
    if (!this.state.chartOpen) return;
    /* Stopped here, in the capture phase, whatever it turns out to mean.
     *
     * Three handlers want this key: the chart's crosshair, this stage, and
     * `app.js`'s global one that closes the portfolio. The last two both
     * listen on `document` in the bubble phase, so `stopPropagation` from
     * anywhere downstream cannot separate them — the event has already
     * arrived at the element they share. This listener is the only one that
     * runs first, so it decides, and nothing after it sees the key at all. */
    e.stopPropagation();
    e.preventDefault();

    /* Two meanings, in the order you would expect: let go of the point you
     * are reading, then leave the chart. Anything else makes Escape close a
     * whole screen while you were only trying to drop a crosshair. */
    if (this._chartHolding) {
      this._chartHolding = false;
      if (typeof this._releaseChart === "function") this._releaseChart();
      return;
    }
    this.setState({ chartOpen: false });
  }

  toggleChart() {
    this._chartHolding = false;
    this.setState((prev) => ({ chartOpen: !prev.chartOpen }));
  }

  /* **What the drawn range carries**, on one line at the chart's head — the
   * derivatives market's strip, in the portfolio's own words. Every figure
   * comes off the series the chart is drawing, so the strip cannot disagree
   * with the line under it: where it ended, what it did across the range, the
   * high and low it did it between, and (on the value chart) what the whole
   * basket cost. Percent modes get the same cells in percent, because their
   * series is already a percentage — `formatMoney` is the one place that
   * knows which. Masked with everything else when the figures are hidden. */
  renderStageStrip(series, costBasis, mode, paid) {
    if (!Array.isArray(series) || series.length < 2) return null;
    // The shares view has no money to range over: its legend is its figures
    if (mode === "mix") return null;
    const percent = mode === "drawdown" || mode === "vsbtc";
    const fmt = percent
      ? (v) => `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}%`
      : (v, sign) => this.fmtMoney(v, sign);
    let hi = series[0].price;
    let lo = series[0].price;
    for (const p of series) {
      if (p.price > hi) hi = p.price;
      if (p.price < lo) lo = p.price;
    }
    const last = series[series.length - 1].price;
    /* **What the head does not already say.** The total and what it did over
       this range are in the header two lines up; repeating them here would be
       the screen saying one number twice. What the range carries and nothing
       else says: where it topped out, where it bottomed, what the basket
       cost, and how far above or below that it ended. */
    const cells = [];
    if (percent) {
      cells.push([
        "now",
        msg("po_strip_now", "Now"),
        fmt(last, true),
        last > 0 ? "up" : last < 0 ? "down" : null,
      ]);
    }
    cells.push(["high", msg("po_strip_high", "Range high"), fmt(hi, percent)]);
    cells.push(["low", msg("po_strip_low", "Range low"), fmt(lo, percent)]);
    /* As held: the money in it now, and how far the value stands from it —
       the view's whole question, in two figures. */
    if (mode === "held" && Array.isArray(paid) && paid.length) {
      const inNow = paid[paid.length - 1].price;
      const inThen = paid[0].price;
      cells.push(["paid", msg("po_strip_paid", "Paid in"), fmt(inNow, false)]);
      if (inNow !== inThen) {
        cells.push(["added", msg("po_strip_added", "Added in range"), fmt(inNow - inThen, true)]);
      }
      if (inNow > 0) {
        const above = last - inNow;
        cells.push([
          "above",
          above >= 0 ? msg("po_strip_above_paid", "Above paid in") : msg("po_strip_below_paid", "Below paid in"),
          fmt(Math.abs(above), false),
          above > 0 ? "up" : above < 0 ? "down" : null,
        ]);
      }
    }
    // The "as held" view has its own level — what had been paid in — above
    if (!percent && costBasis > 0 && mode !== "pnl" && mode !== "held") {
      cells.push(["cost", msg("po_strip_cost", "Cost"), fmt(costBasis, false)]);
      const above = last - costBasis;
      cells.push([
        "above",
        above >= 0
          ? msg("po_strip_above", "Above cost")
          : msg("po_strip_below", "Below cost"),
        fmt(Math.abs(above), false),
        above > 0 ? "up" : above < 0 ? "down" : null,
      ]);
    }
    return React.createElement(
      PortfolioStageStrip,
      { "data-portfolio-strip": mode },
      ...cells.map(([key, label, value, tone]) =>
        React.createElement(
          PortfolioStageCell,
          { key, tone: tone || null, "data-portfolio-strip-cell": key },
          React.createElement("span", null, label),
          React.createElement("span", null, value),
        ),
      ),
    );
  }

  setChartMode(mode) {
    if (!PORTFOLIO_CHART_MODES.includes(mode)) return;
    savePortfolioChartMode(mode);
    // The old boolean is kept in step so a downgrade still finds a sane value
    savePortfolioStackedToStorage(mode === "bycoin");
    this.setState({ chartMode: mode });
  }

  // The biggest holdings by current value, capped so a period switch never
  // fires more than PORTFOLIO_CHART_MAX_COINS history requests.
  chartCoins() {
    const { holdings, prices } = this.props;
    const value = (h) => {
      const p = prices[h.coin];
      return p && isFinite(p.price) ? p.price * holdingAmount(h) : 0;
    };
    return holdings
      .filter((h) => holdingAmount(h) > 0)
      .sort((a, b) => value(b) - value(a))
      .slice(0, PORTFOLIO_CHART_MAX_COINS)
      .map((h) => h.coin);
  }

  // Idempotent: reloads histories only when the coin set, currency or period
  // actually changed (sorted signature, so value-rank reshuffles don't count).
  maybeLoadHistories() {
    const sig =
      this.chartCoins().slice().sort().join(",") +
      "|" +
      this.props.currency +
      "|" +
      this.state.chartPeriod;
    if (sig === this._chartSig) return;
    this._chartSig = sig;
    this.loadHistories();
  }

  loadHistories = async () => {
    const { currency } = this.props;
    const period = this.state.chartPeriod;
    let coins = this.chartCoins();
    const token = ++this._chartToken;
    if (!coins.length) {
      this.setState({ histories: {} });
      return;
    }
    const histories = {};
    /* The benchmark rides along with the chart's own requests. It lands in
     * the same map — `buildPortfolioSeries` only reads the coins you actually
     * hold, so an extra key is inert there and the benchmark reader picks it
     * up by name. */
    if (!coins.includes(BENCHMARK_COIN)) {
      coins = [...coins, BENCHMARK_COIN];
    }
    for (let i = 0; i < coins.length; i += PORTFOLIO_CHART_BATCH_SIZE) {
      if (token !== this._chartToken) return; // superseded or unmounted
      const batch = coins.slice(i, i + PORTFOLIO_CHART_BATCH_SIZE);
      await Promise.all(
        batch.map(async (coin) => {
          const data = await getPortfolioHistory(coin, period, currency);
          if (data) histories[coin] = data;
        }),
      );
      if (i + PORTFOLIO_CHART_BATCH_SIZE < coins.length) {
        await sleep(PORTFOLIO_CHART_BATCH_DELAY);
      }
    }
    if (token !== this._chartToken) return;
    this.setState({ histories });
  };

  handlePeriodChange = (_e, period) => {
    if (!period || period === this.state.chartPeriod) return;
    savePortfolioPeriodToStorage(period);
    this.setState({ chartPeriod: period }); // componentDidUpdate reloads
  };

  /* Memoized on (histories, holdings) refs so re-renders from typing don't
   * hand the chart a new array and restart its path transition — and, now that
   * the expanded chart reads the parts as well, so the stack isn't rebuilt on
   * every keystroke either. */
  chartData() {
    const { holdings } = this.props;
    const { histories } = this.state;
    const memo = this._seriesMemo;
    if (memo && memo.histories === histories && memo.holdings === holdings) {
      return memo.built;
    }
    const built = buildPortfolioParts(histories, holdings);
    this._seriesMemo = { histories, holdings, built };
    return built;
  }

  totalSeries() {
    const built = this.chartData();
    return built ? built.series : null;
  }

  /* The "as held" view's series — see buildHeldParts. Memoized like
     chartData, and on the currency too, since paid-in counts only money
     entered in the one on screen. */
  heldData() {
    const { holdings, currency, costMethod } = this.props;
    const { histories } = this.state;
    const memo = this._heldMemo;
    if (
      memo &&
      memo.histories === histories &&
      memo.holdings === holdings &&
      memo.currency === currency &&
      memo.costMethod === costMethod
    ) {
      return memo.built;
    }
    const built = buildHeldParts(histories, holdings, currency, costMethod);
    this._heldMemo = { histories, holdings, currency, costMethod, built };
    return built;
  }

  // The shares view's series — see mixOf; memoized on the parts it reads
  mixData(built) {
    const memo = this._mixMemo;
    if (memo && memo.built === built) return memo.mix;
    const mix = mixOf(built);
    this._mixMemo = { built, mix };
    return mix;
  }

  /* Every purchase and sale that falls inside the window on screen.
   *
   * From `holdingLots` rather than the held subset the rows carry: `heldLots`
   * exists so a position sold down cannot keep claiming the cost basis of
   * coins that are gone, which is right for a basis and wrong for a record. A
   * purchase you later sold still happened, and the whole point of putting it
   * on the chart is to see what you paid against what it did next.
   *
   * Undated entries (`time: 0`) are skipped rather than placed anywhere —
   * "somewhere on this chart" is not a date, and a marker in the wrong month
   * is worse than no marker.
   */
  chartEvents(series) {
    const { holdings } = this.props;
    const memo = this._eventsMemo;
    if (memo && memo.holdings === holdings && memo.series === series) {
      return memo.events;
    }
    const events = [];
    if (Array.isArray(series) && series.length > 1) {
      const from = +series[0].time;
      const to = +series[series.length - 1].time;
      for (const h of holdings) {
        for (const lot of holdingLots(h)) {
          const ms = (lot.time || 0) * 1000;
          if (!(ms >= from && ms <= to)) continue;
          events.push({
            time: ms,
            kind: "buy",
            coin: h.coin,
            amount: lot.amount,
            cash: lot.paid,
          });
        }
        for (const sale of h.sales || []) {
          const ms = (sale.time || 0) * 1000;
          if (!(ms >= from && ms <= to)) continue;
          events.push({
            time: ms,
            kind: "sell",
            coin: h.coin,
            amount: sale.amount,
            cash: sale.received,
          });
        }
      }
      events.sort((a, b) => a.time - b.time);
    }
    this._eventsMemo = { holdings, series, events };
    return events;
  }

  /* One holding's shape over the chart period, as a bare polyline.
   *
   * Drawn straight from the history the background chart already fetched, in
   * a unitless 0–100 box so it scales to whatever the column ends up being.
   * Each row is scaled to its own range: this says how the coin moved, not
   * how big it is — the value beside it already answers that, and a shared
   * scale would flatten every small holding into a straight line.
   *
   * Tinted by its own first-to-last direction rather than the day's, so the
   * curve and its colour are telling you the same thing.
   */
  renderSpark(coin) {
    const series = this.state.histories[coin];
    if (!Array.isArray(series) || series.length < 2) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const p of series) {
      if (!isFinite(p.price)) continue;
      if (p.price < min) min = p.price;
      if (p.price > max) max = p.price;
    }
    if (!isFinite(min) || !isFinite(max)) return null;
    const span = max - min;
    const last = series.length - 1;
    // A flat series has no shape to draw, so it draws down the middle
    const y = (price) => (span > 0 ? 100 - ((price - min) / span) * 100 : 50);
    const points = series
      .map((p, i) => `${(i / last) * 100},${y(p.price).toFixed(2)}`)
      .join(" ");
    /* No `up` flag any more: the line is neutral ink, because green and red on
     * this row already mean the P/L printed beside it. See `HoldingSpark`. */
    return React.createElement(
      HoldingSpark,
      {
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
        "aria-hidden": true,
      },
      React.createElement("polyline", {
        points,
        fill: "none",
        stroke: "currentColor",
        // Unitless viewBox stretched by preserveAspectRatio="none", so the
        // stroke would stretch with it — vectorEffect keeps it 1.5px
        strokeWidth: "1.5",
        vectorEffect: "non-scaling-stroke",
        strokeLinejoin: "round",
        strokeLinecap: "round",
        opacity: "0.85",
      }),
    );
  }

  /* What the value chart is actually made of, when that is less than the
   * portfolio.
   *
   * The header prints `totalNow` — every holding — and the change beside it
   * comes from the chart's series, which is built only from coins that
   * returned a history. Two things narrow that set: `PORTFOLIO_CHART_MAX_COINS`
   * draws the twelve biggest, and a coin neither Coinbase nor Kraken quotes a
   * series for (stETH, wBETH, FDUSD and TUSD are held at plenty of Ethereum
   * addresses and chartable at neither) simply has no line. Nothing said so,
   * so a total covering fifteen holdings sat beside a percentage covering
   * twelve, and the benchmark compared the wrong portfolio.
   *
   * Null when the chart covers everything, which is the ordinary case — the
   * note exists to be absent.
   */
  chartCoverage(built) {
    const { holdings, prices } = this.props;
    if (!built) return null;
    const drawn = new Set(built.parts.map((p) => p.coin));
    // The twelve the chart even asked about; anything outside this list is
    // missing because of the cap, not because it has no history
    const asked = new Set(this.chartCoins());
    const capped = [];
    const unchartable = [];
    let drawnValue = 0;
    let totalValue = 0;
    for (const h of holdings) {
      const amount = holdingAmount(h);
      if (!(amount > 0)) continue;
      const p = prices[h.coin];
      const value = p && isFinite(p.price) ? p.price * amount : 0;
      totalValue += value;
      if (drawn.has(h.coin)) {
        drawnValue += value;
      } else if (asked.has(h.coin)) {
        unchartable.push(h.coin);
      } else {
        capped.push(h.coin);
      }
    }
    const missing = capped.length + unchartable.length;
    if (!missing) return null;
    return {
      capped,
      unchartable,
      drawn: drawn.size,
      held: drawn.size + missing,
      share: totalValue > 0 ? (drawnValue / totalValue) * 100 : null,
    };
  }

  /* The cost-basis reference for the background chart. Memoized on the value
   * so a re-render from typing hands the chart the same object and doesn't
   * make it re-place a line that hasn't moved. */
  costReference(costBasis) {
    if (!this._refMemo || this._refMemo.value !== costBasis) {
      this._refMemo = {
        value: costBasis,
        ref: {
          value: costBasis,
          label: msg("pc_cost", "COST $1", this.fmtMoney(costBasis, false)),
        },
      };
    }
    return this._refMemo.ref;
  }

  /* What the benchmark did over the same days, as a percentage.
   *
   * Read at the two ends of the window actually on screen. It used to take
   * the benchmark's last `series.length` points, which is a *count*, not a
   * window — and the two are only the same thing while both series are
   * sampled at the same rate. On a portfolio of BTC and SUI over the ALL
   * range (BTC 351 points 13.19 days apart, SUI 332 at 3.64) that read BTC as
   * **+15,839.5%**, its whole life since 2014, where BTC did **+190.2%** over
   * the window the chart was drawing. The stat is a gap in percentage points,
   * so it was out by about 15,650 of them.
   *
   * Null rather than a guess when the benchmark's own history starts after
   * the window does: there is no honest first price to measure from.
   */
  /* The basket and the benchmark, both re-based to 0% at their first common
   * point — the only honest way to put two series of different magnitudes on
   * one chart.
   *
   * **One axis, never two.** A second y-axis is the trick that makes any two
   * lines look related; the coin comparison already refuses it and says so in
   * its own comment, and this refuses it the same way. Percentages from a
   * shared start need no second axis, because they are already the same unit.
   *
   * It refuses rather than approximates in the cases that matter: no benchmark
   * history, a benchmark that starts after the basket does, or a starting
   * price of zero to divide by. A comparison drawn from a window the benchmark
   * was not trading in is a comparison of different dates wearing one x-axis.
   */
  benchmarkSeries(series) {
    const bench = this.state.histories[BENCHMARK_COIN];
    if (
      !series ||
      series.length < 2 ||
      !Array.isArray(bench) ||
      bench.length < 2
    ) {
      return null;
    }
    const base = priceAtOrBefore(bench, +series[0].time);
    if (!(base > 0)) return null;
    const out = [];
    for (const point of series) {
      const at = priceAtOrBefore(bench, +point.time);
      if (at == null || !isFinite(at)) continue;
      out.push({ time: point.time, price: ((at - base) / base) * 100 });
    }
    /* Every point or none: a benchmark drawn over part of the window and
     * absent for the rest reads as the market having stopped. */
    return out.length === series.length ? out : null;
  }

  /* The basket itself as percent change from the same start. */
  basketPctSeries(series) {
    if (!series || series.length < 2) return null;
    const base = series[0].price;
    if (!(base > 0)) return null;
    return series.map((p) => ({
      time: p.time,
      price: ((p.price - base) / base) * 100,
    }));
  }

  benchmarkPct(series) {
    const bench = this.state.histories[BENCHMARK_COIN];
    if (!series || !Array.isArray(bench) || bench.length < 2) return null;
    const first = priceAtOrBefore(bench, +series[0].time);
    const last = priceAtOrBefore(bench, +series[series.length - 1].time);
    if (!(first > 0) || last == null) return null;
    return ((last - first) / first) * 100;
  }

  /* The chart, brought forward.
   *
   * Everything on it answers a *when* question, which is what the wallpaper
   * could not do: the crosshair reads the total at a moment and what it was
   * made of, the dashed level is what you paid, the wash between them is the
   * profit that was actually on the table, and the triangles are the days you
   * did something about it.
   */
  renderChartStage(view) {
    const { built, costBasis, seriesDelta, seriesPct, periodLabel } = view;
    const { chartPeriod, chartMode } = this.state;
    const series = built.series;
    /* **The series the chart actually draws**, worked out once: the value
       line, the same line re-based to what it cost, the basket against BTC,
       or how far under its own peak it has been. The strip at the card's head
       reads *this* — handed the untransformed line, it printed money figures
       with a percent sign in the two percent modes. */
    const held = chartMode === "held" ? this.heldData() : null;
    const mix = chartMode === "mix" ? this.mixData(built) : null;
    const chartSeries =
      held
        ? held.series
        : mix
          ? mix.series
          : chartMode === "vsbtc"
        ? this.basketPctSeries(series) || series
        : chartMode === "drawdown"
          ? drawdownSeries(series) || series
          : chartMode === "pnl" && costBasis > 0
            ? series.map((p) => ({ ...p, price: p.price - costBasis }))
            : series;
    return React.createElement(
      PortfolioStage,
      {
        /* Anywhere off the card puts the chart away. Esc did this and the
         * Holdings button did this, and both are things you have to know;
         * clicking the empty margin around a thing you opened is what
         * everybody tries first, and it did nothing at all. `currentTarget`
         * is the test rather than a bounding box, so a click that lands on
         * the chart, the range switcher or the note is a click on the chart —
         * the same rule the targets overlay already uses.
         *
         * `onMouseDown`, not `onClick`: the chart is a surface people drag
         * across to read the crosshair, and a drag that starts on the plot
         * and finishes in the margin is not a request to leave. */
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) this.setState({ chartOpen: false });
        },
      },
      React.createElement(
        PortfolioStageInner,
        null,
        React.createElement(
          PortfolioHeader,
          { style: { marginBottom: 0 } },
          React.createElement(
            PortfolioEyebrow,
            null,
            msg("po_chart_title", "Portfolio · Total value"),
          ),
          React.createElement(
            PortfolioTotal,
            {
              title: view.coverage
                ? msg(
                    "po_chart_value_note",
                    "The value of the $1 holdings on this chart. Your portfolio total covers all $2.",
                    view.coverage.drawn,
                    view.coverage.held,
                  )
                : undefined,
            },
            this.fmtMoney(series[series.length - 1].price, false),
          ),
          seriesDelta != null &&
            React.createElement(
              PortfolioDelta,
              { up: seriesDelta === 0 ? null : seriesDelta > 0 },
              this.fmtMoney(seriesDelta, true) +
                (seriesPct != null
                  ? ` (${seriesPct >= 0 ? "+" : ""}${seriesPct.toFixed(2)}%)`
                  : "") +
                ` · ${periodLabel}`,
            ),
        ),
        /* **The chart in a card, its controls at its head** — the shape the
           derivatives page settled on: what you are looking at and the range
           you are looking at it over, then the figures that range carries,
           then the plot. They used to sit under the chart, a screen apart
           from the thing they change. */
        React.createElement(
          PortfolioStagePanel,
          { "data-portfolio-chart-card": chartMode },
          React.createElement(
            PortfolioStageHead,
            null,

            React.createElement(
              PortfolioStageTools,
              null,
              React.createElement(
                PortfolioSortLabel,
                null,
                msg("po_show", "Show"),
              ),
              /* Three views of one series, and each answers a question the other
               * two cannot: what is it worth, what is it made of, and am I up. */
              ...[
                [
                  "total",
                  msg("po_total", "Total"),
                  msg(
                    "po_total_hint",
                    "One line: the total, on the range it actually moved in",
                  ),
                ],
                [
                  "held",
                  msg("po_as_held", "As held"),
                  msg(
                    "po_as_held_hint",
                    "What you actually held on each day — purchases from their date, sales until theirs — against what it had cost you by then",
                  ),
                ],
                [
                  "bycoin",
                  msg("po_by_coin", "By coin"),
                  msg(
                    "po_by_coin_hint",
                    "The coins the total is made of, stacked. The scale starts at zero — that is what makes the bands comparable",
                  ),
                ],
                [
                  "mix",
                  msg("po_mix", "Mix"),
                  msg(
                    "po_mix_hint",
                    "Each coin's share of the total through the range — how the allocation drifted as prices moved, with nothing bought or sold",
                  ),
                ],
                [
                  "pnl",
                  "P/L",
                  msg(
                    "po_pnl_hint",
                    "The same total, re-based so zero is what you paid. Above the line is profit, below it is loss — the one thing the value chart cannot show when the cost sits off the scale",
                  ),
                ],
                [
                  "vsbtc",
                  msg("po_vs_btc", "vs BTC"),
                  msg(
                    "po_vs_btc_hint",
                    "Your basket and BTC over exactly the same dates, both starting at 0% — where you pulled ahead, and where you only followed the market",
                  ),
                ],
                [
                  "drawdown",
                  msg("po_drawdown", "Peak"),
                  msg(
                    "po_drawdown_mode_hint",
                    "How far below its own highest point the total has been, all the way along — depth and how long it took to come back, which one 'worst fall' number cannot show",
                  ),
                ],
                [
                  "moved",
                  msg("po_moved", "What moved it"),
                  msg(
                    "po_moved_hint",
                    "Which holdings account for this range's change, biggest first. The bars add up to the figure above them",
                  ),
                ],
              ].map(([value, label, title]) =>
                React.createElement(
                  PortfolioSortBtn,
                  {
                    key: value,
                    active: chartMode === value,
                    onClick:
                      chartMode === value
                        ? undefined
                        : () => this.setChartMode(value),
                    title,
                  },
                  label,
                ),
              ),
              React.createElement(
                PortfolioChartBtn,
                {
                  onClick: this.toggleChart,
                  title: msg(
                    "po_back_to_list",
                    "Back to the holdings list (Esc)",
                  ),
                },
                icon("portfolio", 0.85),
                React.createElement(
                  "span",
                  null,
                  msg("po_holdings", "Holdings"),
                ),
              ),
            ),
            React.createElement(
              PortfolioStageRange,
              null,
              React.createElement(PeriodSwitcher, {
                onChange: this.handlePeriodChange,
                options: PORTFOLIO_CHART_PERIODS,
                value: chartPeriod,
              }),
            ),
          ),
          this.renderStageStrip(chartSeries, costBasis, chartMode, held ? held.paid : null),
          React.createElement(
            PortfolioStageChart,
            null,
            /* **The P/L view is the total re-based, not a second chart.**
             *
             * Everything the value chart already does — the fill above and below
             * the cost level, the crosshair, the buy and sell markers, the
             * scale — is right for profit and loss the moment the cost level is
             * zero. So the transform happens here, where the series is built,
             * and `PortfolioChart` stays one chart with one set of rules rather
             * than growing a third branch. Its own comment says what a fourth
             * mode would do to it; this is not one.
             *
             * The whole cost basis is subtracted, constant across the window,
             * because that is what the series is: `amount x price(t)` with
             * today's amounts. Stepping the cost up on each purchase date would
             * pair a cost that changes with a value that does not, and every
             * point before the last purchase would report a profit nobody made.
             * The note under the chart says so in as many words. */
            /* A different chart, not a fourth branch inside the time series.
             *
             * `PortfolioChart` already switches between a line, stacked bands
             * and a re-based line inside one `componentDidUpdate`; a ranked bar
             * chart shares none of that — no x scale, no crosshair, no markers —
             * and putting it there would be the fourth mode its own comment
             * warns about. */
            /* Faded in place rather than remounted.
             *
             * A `key` on the mode was the obvious way to replay the animation,
             * and it is the wrong one here: remounting throws away the chart's
             * measurement, so on every switch it renders once with no geometry —
             * no plot, no marker, nothing to point at — and only settles a frame
             * later. The animation is driven from `componentDidUpdate` instead,
             * on this node, so the component stays mounted and keeps its size. */
            React.createElement(
              PortfolioChartSwap,
              { innerRef: this.chartSwapRef },
              chartMode === "moved"
                ? React.createElement(PortfolioContribution, {
                    parts: built.parts,
                    periodLabel,
                    formatMoney: (v, sign) => this.fmtMoney(v, sign),
                  })
                : React.createElement(PortfolioChart, {
                    /* Reported up so Escape has two steps rather than one — see
                     * `handleChartKey`. Closing the stage also clears it, or a
                     * reopened chart would start out owning a key it is not using. */
                    onHoldingChange: (held, release) => {
                      this._chartHolding = held;
                      this._releaseChart = release;
                    },
                    series: chartSeries,
                    parts: held ? held.parts : mix ? mix.parts : built.parts,
                    // The step the "as held" value is read against
                    paid: held ? held.paid : null,
                    /* Only in the comparison mode, and only when it is complete —
                     * `benchmarkSeries` returns null rather than a partial line. */
                    compare:
                      chartMode === "vsbtc"
                        ? this.benchmarkSeries(series)
                        : null,
                    events: this.chartEvents(series),
                    /* Zero is the peak in this mode, and it is the same device P/L
                     * uses: a level of 0 forces the top of the scale onto the chart,
                     * so "at a new high" is a line you can see rather than an edge you
                     * have to infer. */
                    costBasis:
                      held || mix
                        ? null
                        : chartMode === "pnl" ||
                            chartMode === "drawdown" ||
                            chartMode === "vsbtc"
                          ? 0
                          : costBasis > 0
                            ? costBasis
                            : null,
                    period: chartPeriod,
                    currency: this.props.currency,
                    mode: chartMode,
                    /* Percentages, not money, in this mode — the readout and the axis
                     * both go through this one formatter, so passing a different one
                     * is all it takes to change the units the chart speaks in. */
                    formatMoney:
                      chartMode === "drawdown" || chartMode === "vsbtc"
                        ? (v) => `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}%`
                        : mix
                          ? (v) => `${Number(v).toFixed(0)}%`
                          : (v, sign) => this.fmtMoney(v, sign),
                    /* A band's value is money in every mode; only the axis and the
                 headline follow the mode's own units — see `money()`. The
                 shares view is the exception: its bands *are* shares. */
                    formatValue: mix
                      ? (v) => `${Number(v).toFixed(1)}%`
                      : (v, sign) => this.fmtMoney(v, sign),
                    unit:
                      chartMode === "drawdown" || chartMode === "vsbtc" || mix
                        ? "percent"
                        : "money",
                    formatAmount: (v) => this.fmtAmount(v),
                    /* The axis gutter is masked with everything else — except in the
                     * two modes whose axis is already a percentage. "−18% below its
                     * own peak" says nothing about how much money that is, which is
                     * the reason those two modes exist. */
                    hidden:
                      this.props.hidden &&
                      chartMode !== "drawdown" &&
                      chartMode !== "vsbtc" &&
                      chartMode !== "mix",
                  }),
            ),
          ),
        ),
        React.createElement(
          PortfolioStageNote,
          null,
          chartMode === "held"
            ? held && held.gone
              ? msg(
                  "po_held_note_gone",
                  "What was held on each day, rewound from your purchases and sales, against what it had cost by then — the dashed step. Undated purchases count as held throughout. Coins you no longer hold ($1) are not drawn: no history is fetched for them.",
                  String(held.gone),
                )
              : msg(
                  "po_held_note",
                  "What was held on each day, rewound from your purchases and sales, against what it had cost by then — the dashed step. Undated purchases count as held throughout.",
                )
            : chartMode === "mix"
              ? msg(
                  "po_mix_note",
                  "Each band is that coin's share of the total at that moment, so the stack is always 100%. On today's amounts a share widens only because its price outran the rest — the drift a target share is kept against.",
                )
              : chartMode === "bycoin"
            ? msg(
                "po_bands_note",
                "Bands add up to the line. The scale starts at zero, so the heights are comparable — which costs the zoom.",
              )
            : chartMode === "vsbtc"
              ? (() => {
                  /* The gap, stated rather than left to the eye — and refused
                   * outright when the benchmark could not be built, because a
                   * lone line labelled "vs BTC" is the worst of both. */
                  const bench = this.benchmarkPct(series);
                  if (bench == null || seriesPct == null) {
                    return msg(
                      "po_vs_btc_none",
                      "No BTC history covering these dates, so there is nothing to compare against. The line above is your basket alone.",
                    );
                  }
                  const gap = seriesPct - bench;
                  return msg(
                    "po_vs_btc_note",
                    "Both from 0% at the same first date, on one scale — never two axes, which is what makes any two lines look related. Yours $1, BTC $2: a gap of $3 points. Holding BTC instead is the comparison, not a suggestion.",
                    `${signedFixed(seriesPct, 1, "-")}%`,
                    `${signedFixed(bench, 1, "-")}%`,
                    signedFixed(gap, 1),
                  );
                })()
              : chartMode === "drawdown"
                ? msg(
                    "po_drawdown_note",
                    "Zero is a new high. Everything below it is how far under its own peak the total was at that moment — the depth, and how long it took to get back. It says how bad this got, not how bad it can get.",
                  )
                : chartMode === "pnl"
                  ? msg(
                      "po_pnl_note",
                      "Zero is what you paid, so the line crossing it is the moment this became a profit or a loss. It uses the whole cost basis, not the cost as it stood on each day — the amounts are today's.",
                    )
                  : msg(
                      "po_hover_note",
                      "Hover, tap or focus the chart to read the total, what it was made of, and how far it sat above or below what you paid.",
                    ),
        ),
        /* What the line actually is, said once and in the open.
         *
         * The series is `amount x price(t)` with **today's** amounts, so it is
         * this basket priced backwards through the range — not a history of
         * what the account was worth. A purchase made yesterday is carried
         * back as though those coins were held all along, and something sold
         * last month is missing from the earlier part of the curve. The
         * markers show the transactions but do not change the quantities.
         *
         * The code has always known this — the comment above `buildPortfolioParts`
         * says it in as many words — and the screen said "Total value", which
         * reads as account history. A chart that is more precise about a model
         * it never states just looks more authoritative. */
        /* Not under the one view that is not on today's amounts. */
        chartMode !== "held" &&
          React.createElement(
            PortfolioStageNote,
            { quiet: true },
            msg(
              "po_model_note",
              "Today's amounts priced across this range. Purchases and sales are marked, but they do not change the historical quantities.",
            ),
          ),
      ),
    );
  }

  // Amounts are quantities, not money: enough digits to be true, none of the
  // trailing zeros a currency format would add
  fmtAmount(value) {
    // A quantity is a balance too — 0.004 BTC and 40 BTC are not the same
    // thing to know about somebody
    if (this.props.hidden) return MONEY_MASK;
    const v = Number(value);
    if (!isFinite(v)) return "0";
    return String(Number(v.toPrecision(6)));
  }

  /* `as` prints a figure in the currency it was *entered* in rather than the
   * one on screen. A purchase logged in dollars has to say so with its own
   * symbol — printing a USD number behind a € sign is a number that was never
   * true, which is the same rule the targets panel follows for a paused
   * target. */
  fmtMoney(value, withSign, as) {
    const { currency, decimalPlaces, separatorFormat, hidden } = this.props;
    /* Hidden figures are masked here, at the one place every money string on
     * this screen is built — including the ones the value chart draws, which
     * are handed `formatMoney` rather than formatting anything themselves.
     * The export files do not come through here and must not: `num()` in
     * `buildPortfolioCsv` writes the real number, because a file is not a
     * screen with somebody standing behind it. */
    if (hidden && typeof value === "number") {
      // Same sign the printed figure would have carried, by the same call
      return `${getSign(value, !withSign)}${getCurrencySymbol(as || currency)}${MONEY_MASK}`;
    }
    return formatNumberString(
      value,
      getCurrencySymbol(as || currency),
      !withSign,
      false,
      decimalPlaces,
      separatorFormat,
    );
  }

  // Derive totals + per-holding values from the shared price map
  computeTotals() {
    const { holdings, prices, currency, costMethod } = this.props;
    let totalNow = 0;
    let totalAgo = 0;
    let anyPriced = false;
    let costBasis = 0; // Σ cost × amount over rows with a cost and a price
    let costValueNow = 0; // current value of those same rows
    // Value of logged purchases past the long-term mark, and the total they
    // are measured against — the same split the tax report reports
    let longTermValue = 0;
    let datedValue = 0;
    // Realized P/L across every recorded sale, whatever is held now
    let realizedTotal = 0;
    let anyRealized = false;
    /* …and the part of it that happened this calendar year, which is the
     * window anyone works a return out of. Undated sales are counted here as
     * neither this year nor another — they are counted as unplaceable, so the
     * figure can say it is incomplete rather than quietly claiming to be the
     * whole year. */
    let realizedThisYear = 0;
    let anyRealizedThisYear = false;
    let undatedSales = 0;
    // Anything at all entered in a currency that is not the one on screen
    let pausedAny = false;
    const nowMs = Date.now();
    // Declared after `nowMs`, not with the counters above it: `const` is not
    // hoisted, and reading it a few lines early threw inside render, where the
    // error boundary swallowed it and the whole view became "Something went
    // wrong." with nothing in `pageerror`
    const thisYear = new Date(nowMs).getFullYear();
    const rows = holdings.map((h) => {
      const p = prices[h.coin];
      const price = p && isFinite(p.price) ? p.price : null;
      const amount = holdingAmount(h); // manual + every watched address
      const allLots = holdingLots(h);
      // Never let cost basis cover coins that are gone — see `heldLots`
      const lots = heldLots(allLots, amount, costMethod);
      /* Every money figure below is one of these two: `priced` is what the
       * displayed currency can be measured against, `paused` is what was
       * entered in another one and is therefore reported rather than added. */
      const priced = lotsIn(lots, currency);
      const paused = lotsOut(lots, currency);
      const salesPaused = (h.sales || []).filter(
        (sale) => !inCurrency(sale, currency),
      );
      const value = price != null ? price * amount : null;
      if (value != null) {
        anyPriced = true;
        totalNow += value;
        // 24h-ago value implied by the 24h % change (when known)
        if (p && isFinite(p.change)) {
          totalAgo += value / (1 + p.change / 100);
        } else {
          totalAgo += value;
        }
        const basis = lotsBasis(priced);
        if (basis > 0) {
          costBasis += basis;
          // P/L covers the lotted amount, which may still be less than the
          // holding — you can hold coins you never logged a purchase for
          costValueNow += price * lotsAmount(priced);
        }
        for (const lot of priced) {
          const held = lotHeldDays(lot, nowMs);
          if (held == null) continue; // no date, no holding period
          datedValue += price * lot.amount;
          if (held >= LONG_TERM_DAYS) longTermValue += price * lot.amount;
        }
      }
      const lotAmt = lotsAmount(priced);
      const realized = salesRealized(h.sales, currency);
      if (hasRealized(h.sales, currency)) {
        realizedTotal += realized;
        anyRealized = true;
      }
      for (const sale of h.sales || []) {
        if (!inCurrency(sale, currency)) continue;
        const gain = saleRealized(sale);
        if (gain == null) continue;
        const year = saleYear(sale);
        if (year == null) {
          undatedSales++;
        } else if (year === thisYear) {
          realizedThisYear += gain;
          anyRealizedThisYear = true;
        }
      }
      if (paused.length || salesPaused.length) pausedAny = true;
      return {
        ...h,
        amount, // total across sources (h.amount stays the manual part)
        manualAmount: h.amount,
        lots, // the lots still held; h.lots stays the manual part
        priced, // …of those, the ones this currency can measure
        paused, // …and the ones it cannot, kept so the row can say so
        salesPaused,
        basis: lotsBasis(priced),
        manualLots: heldLots(h.lots, h.amount, costMethod),
        lotAmount: lotAmt,
        sales: h.sales || [],
        realized: hasRealized(h.sales, currency) ? realized : null,
        /* What you hold beyond what you've logged a purchase for. The row's
         * value covers everything; its P/L can only cover this much less —
         * so the difference has to be sayable rather than left as a silent
         * mismatch between two numbers on the same line. */
        unlogged:
          Math.max(0, amount - lotsAmount(lots)) > AMOUNT_EPSILON
            ? amount - lotsAmount(lots)
            : 0,
        price,
        value,
        change: p ? p.change : null,
        up: p ? p.up : null,
      };
    });
    /* MONEY-WEIGHTED RETURN — the rate this person's own timing earned.
     *
     * Every other percentage on this screen is `(value - cost) / cost`, which
     * treats money put in this morning exactly like money put in two years
     * ago. Two positions that both read "+20%" can be a very different piece
     * of work: measured on the arithmetic in `utils.js`, £1,000 in at the
     * start and £1,200 now is **9.55% a year**, while the same £1,000 paid
     * half at the start and half a month ago is **17.76%**. The first number
     * is the one a fund factsheet and a bank statement print, and it is the
     * one a crypto tracker almost never does.
     *
     * The flows are exactly what has been recorded: a lot is money leaving,
     * a sale is money coming back, and what is held now is a final notional
     * sale at today's price. Only lots and sales in the currency on screen —
     * the same rule the cost basis follows, and for the same reason: a rate
     * built from two currencies is not a rate.
     *
     * Undated entries cannot be placed on a timeline at all, so they are
     * **counted and named** rather than quietly dropped, the way the chart
     * names the holdings it cannot draw. */
    const flows = [];
    let datedLots = 0;
    let undatedLots = 0;
    for (const h of holdings) {
      for (const lot of holdingLots(h)) {
        if (!inCurrency(lot, currency)) continue;
        // A receipt of income was not money paid in: it is what was earned
        if (lot.kind === "income") continue;
        const paid = Number(lot.paid);
        if (!isFinite(paid) || paid <= 0) continue;
        if (lot.time > 0) {
          flows.push({ when: lot.time, amount: -paid });
          datedLots++;
        } else {
          undatedLots++;
        }
      }
      for (const sale of h.sales || []) {
        if (!inCurrency(sale, currency)) continue;
        const got = Number(sale.received);
        if (!isFinite(got) || got <= 0 || !(sale.time > 0)) continue;
        flows.push({ when: sale.time, amount: got });
      }
    }
    if (flows.length && totalNow > 0) {
      flows.push({ when: Math.floor(Date.now() / 1000), amount: totalNow });
    }
    const moneyWeighted = datedLots ? xirr(flows) : null;

    const pnl = anyPriced ? totalNow - totalAgo : null;
    const pnlPct = pnl != null && totalAgo > 0 ? (pnl / totalAgo) * 100 : null;
    // Unrealized P/L vs entered average costs (only rows that have both)
    const unrealized = costBasis > 0 ? costValueNow - costBasis : null;
    const unrealizedPct =
      unrealized != null ? (unrealized / costBasis) * 100 : null;
    return {
      rows,
      totalNow,
      pnl,
      pnlPct,
      anyPriced,
      costBasis,
      unrealized,
      unrealizedPct,
      longTermValue,
      longTermPct: datedValue > 0 ? (longTermValue / datedValue) * 100 : null,
      realized: anyRealized ? realizedTotal : null,
      realizedThisYear: anyRealizedThisYear ? realizedThisYear : null,
      thisYear,
      undatedSales,
      pausedAny,
      moneyWeighted,
      // Purchases with no date: they cannot be placed on a timeline, so the
      // rate above is the rate of what is left, and the row says so
      undatedLots,
      datedLots,
    };
  }

  /* Holdings in the order they are worth reading.
   *
   * They used to render in the order coins were added, so the biggest
   * position could be at the bottom — while the chart behind the list was
   * already ranking the same holdings by value to pick which twelve to draw.
   *
   * Rows with nothing to sort on (no price yet, no cost basis, no 24h figure)
   * go to the back rather than sorting as zero, which would scatter them
   * through the middle of the list. The coin symbol breaks ties, so the order
   * is stable across refreshes instead of shuffling as prices tick.
   */
  sortRows(rows) {
    const mode = this.state.sort;
    if (mode === "name") {
      return [...rows].sort((a, b) => a.coin.localeCompare(b.coin));
    }
    const key = (r) => {
      if (mode === "pl") {
        // Only what this currency can measure — a row whose purchases are
        // all in another one has no P/L to sort on, and goes to the back
        return r.basis > 0 && r.price != null
          ? r.price * lotsAmount(r.priced) - r.basis
          : null;
      }
      if (mode === "change") {
        return r.change != null && isFinite(r.change) ? r.change : null;
      }
      return r.value != null ? r.value : null;
    };
    return [...rows].sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      if (av == null && bv == null) return a.coin.localeCompare(b.coin);
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av || a.coin.localeCompare(b.coin);
    });
  }

  handleSortChange = (mode) => {
    if (mode === this.state.sort) return;
    savePortfolioSortToStorage(mode);
    this.setState({ sort: mode });
  };

  /* "0.5 BTC, 12 SOL" — the amounts held with no purchase behind them, for
   * the tooltip on a P/L that therefore doesn't cover them. Null when every
   * holding is fully logged, so the plain wording is used instead. */
  unloggedNote(rows) {
    const parts = rows
      .filter((r) => r.unlogged > 0 && lotsAmount(r.lots) > 0)
      .map((r) => `${Number(r.unlogged.toPrecision(6))} ${r.coin}`);
    if (!parts.length) return null;
    return parts.length > 3
      ? `${parts.slice(0, 3).join(", ")} and ${parts.length - 3} more`
      : parts.join(", ");
  }

  /* Both destructive actions go back through `onImport`, which is already the
   * "make the portfolio be exactly this list" path and already sanitizes —
   * so undo cannot put back something a hand-edited file could not. */
  handleRemoveHolding = (coin) => {
    const before = this.props.holdings;
    // Read what is being thrown away *before* throwing it away — after the
    // call the holding is gone and there is nothing left to describe
    const gone = before.find((h) => h.coin === coin);
    const records =
      gone && (holdingLots(gone).length || (gone.sales || []).length);
    this.props.onRemove(coin);
    this.setState({
      undo: {
        /* One placeholder, joined here — two adjacent ones read as the named
         * form `$1$` to Chrome and stop the extension loading at all. */
        label: msg(
          "po_removed",
          "Removed $1",
          coin +
            (records
              ? msg("po_and_records", " and everything logged against it")
              : ""),
        ),
        list: before,
      },
    });
  };

  handleUndo = () => {
    const undo = this.state.undo;
    if (!undo) return;
    this.setState({ undo: null });
    this.props.onImport(undo.list);
  };

  handleSearchChange = (e) => this.setState({ query: e.target.value });

  handleAdd = (coin) => {
    this.setState({ query: "" });
    this.props.onAdd(coin, 0);
  };

  // Draft handling for the amount input
  commitField(coin, field, num) {
    if (field === "amount") this.props.onUpdateAmount(coin, num);
  }

  /* ── purchase lots editor ── */

  handleToggleLots = (coin) =>
    this.setState((s) => ({
      expandedCoin: s.expandedCoin === coin ? null : coin,
      lotAmount: "",
      lotPaid: "",
      lotMode: "buy",
      lotDate: "",
    }));

  /* **Every box on this screen that wants a number now refuses letters.**
   *
   * All four of them were `type="text"` with `inputMode="decimal"` — right,
   * because a spinner on a money field is wrong — and that shape accepts
   * anything: `12ab` sat in the amount box looking entered, `Number` said
   * `NaN`, and the value was quietly not committed. Nothing on screen said
   * so, so it read as a field that had eaten what you typed.
   *
   * `numericDraft` refuses the character; this remembers *that* it refused,
   * so the lot form's own note can say why, and clears itself — a warning
   * about a keystroke is not a state to be dismissed. */
  numberField = (name, raw) => {
    const d = numericDraft(raw);
    /* **A clean keystroke must not clear it.** Typing is character by
       character, so `12ab3` arrives as five changes and the last of them is
       valid — written as `d.refused ? name : null` the warning appeared and
       was gone again within the same word, which is exactly the silence this
       replaces. Only the timer takes it down. */
    this.setState((p) => ({
      [name]: d.value,
      numWarn: d.refused ? name : p.numWarn,
    }));
    if (!d.refused) return;
    clearTimeout(this._numT);
    this._numT = setTimeout(() => {
      if (this._gone) return;
      this.setState((p) => (p.numWarn === name ? { numWarn: null } : null));
    }, NUMBER_WARN_MS);
  };

  /* Asked about particular fields, never "did anything refuse": written the
     loose way, a refusal in one box takes over every note on the screen — a
     stray letter in a row's amount replaced the lot form's own note further
     down, and stayed there for the whole warning. */
  numberWarning = (...names) => {
    if (!this.state.numWarn) return null;
    if (names.length && !names.includes(this.state.numWarn)) return null;
    return msg("num_only", "Numbers only — that character was not entered.");
  };

  handleLotAmountChange = (e) => this.numberField("lotAmount", e.target.value);

  handleLotPaidChange = (e) => this.numberField("lotPaid", e.target.value);

  handleLotModeChange = (mode) =>
    this.setState({ lotMode: mode, lotAmount: "", lotPaid: "" });

  handleLotDateChange = (e) => this.setState({ lotDate: e.target.value });

  // The same two fields record all three: how much, and for how much. Which
  // direction it is decides whether the second number is what you paid, what
  // it was worth when it arrived, or what you got — and that is the only
  // difference between them.
  handleLotAdd = (coin) => {
    const amount = Number(this.state.lotAmount);
    const money = Number(this.state.lotPaid);
    if (!isFinite(amount) || amount <= 0) return;
    if (!isFinite(money) || money < 0) return;
    const when = lotDateSeconds(this.state.lotDate);
    if (this.state.lotMode === "sell") {
      this.props.onAddSale(coin, amount, money, when);
    } else {
      this.props.onAddLot(coin, amount, money, when, this.state.lotMode === "income" ? "income" : undefined);
    }
    this.setState({ lotAmount: "", lotPaid: "" });
  };

  handleLotKeyDown = (coin, e) => {
    if (e.key === "Enter") this.handleLotAdd(coin);
  };

  // Recorded sales for one holding, newest last, with what each realized
  renderSaleLines(coin, sales) {
    if (!sales || !sales.length) return null;
    return sales.map((sale, i) => {
      const realized = saleRealized(sale);
      const partial = sale.basisAmount > 0 && sale.basisAmount < sale.amount;
      // Recorded in another currency: shown in its own, out of the Realized
      // figure above until that currency is selected again
      const paused = !inCurrency(sale, this.props.currency);
      return React.createElement(
        LotLine,
        { key: `sale-${sale.time}-${i}` },
        React.createElement(
          "span",
          null,
          msg(
            "po_sold_line",
            "Sold $1 $2 — $3",
            this.props.hidden ? MONEY_MASK : Number(sale.amount.toPrecision(8)),
            coin,
            this.fmtMoney(sale.received, false, sale.currency),
          ),
        ),
        React.createElement(
          LotMeta,
          {
            title: paused
              ? msg(
                  "po_sale_paused",
                  "Recorded in $1. Its gain is left out of Realized while another currency is shown — switch to $1 to include it.",
                  sale.currency,
                )
              : partial
                ? msg(
                    "po_sale_partial",
                    "Only $1 $2 of this sale had a purchase logged, so the gain covers that much of it",
                    Number(sale.basisAmount.toPrecision(6)),
                    coin,
                  )
                : realized == null
                  ? msg(
                      "po_sale_no_basis",
                      "No purchase was logged for these coins, so there is no cost to set the proceeds against",
                    )
                  : // Which purchases it ate, since one sale can span several
                    // bought on different days — the tax report pairs them out
                    (sale.matched || []).length > 1
                    ? `Proceeds less the cost of the ${sale.matched.length} purchases it consumed, oldest first. The tax report lists them as separate pairs, each with its own holding period.`
                    : msg(
                        "po_proceeds_less",
                        "Proceeds less the cost of the purchase it consumed",
                      ),
          },
          (sale.time > 0
            ? new Date(sale.time * 1000).toLocaleDateString()
            : msg("po_date_unknown", "date unknown")) +
            (realized == null
              ? msg("po_no_basis_suffix", " · no cost basis")
              : ` · ${realized >= 0 ? "+" : "−"}${this.fmtMoney(Math.abs(realized), false, sale.currency)}${partial ? " (part)" : ""}`) +
            (paused
              ? msg("po_currency_paused", " · $1 · paused", sale.currency)
              : ""),
        ),
        React.createElement(
          RemoveBtn,
          {
            type: "button",
            "aria-label": msg("po_remove_sale", "Remove this $1 sale", coin),
            title: msg(
              "po_remove_sale_hint",
              "Remove this record. It does not give the coins back — adjust the amount if you need to.",
            ),
            onClick: () => this.props.onRemoveSale(coin, i),
          },
          "×",
        ),
      );
    });
  }

  // One source's purchase lines. Only hand-entered lots are removable —
  // watched ones are the chain's record, not ours to edit.
  renderLotLines(coin, lots, editable, emptyText) {
    if (!lots.length) return React.createElement(LotMeta, null, emptyText);
    const nowMs = Date.now();
    return lots.map((lot, i) => {
      // How long it has been held: the one thing about a lot that changes
      // while you do nothing, and the line a tax return draws
      const held = lotHeldDays(lot, nowMs);
      const long = held != null && held >= LONG_TERM_DAYS;
      // Entered in another currency: printed in its own, and out of every
      // total on this screen until that currency is selected again
      const paused = !inCurrency(lot, this.props.currency);
      return React.createElement(
        LotLine,
        { key: `${lot.time}-${i}` },
        React.createElement(
          "span",
          null,
          msg(
            "po_lot_line",
            "$1 $2 — $3",
            this.props.hidden ? MONEY_MASK : lot.amount,
            coin,
            this.fmtMoney(lot.paid, false, lot.currency),
          ),
        ),
        React.createElement(
          LotMeta,
          {
            title: paused
              ? `Entered in ${lot.currency}. Its cost basis is left out of the P/L above while another currency is shown — switch to ${lot.currency} to include it.`
              : held == null
                ? undefined
                : long
                  ? msg(
                      "po_held_long",
                      "Held $1 days — long term at the $2-day mark used in many places",
                      held,
                      LONG_TERM_DAYS,
                    )
                  : msg(
                      "po_held_short",
                      "Held $1 days — short term at the $2-day mark used in many places",
                      held,
                      LONG_TERM_DAYS,
                    ),
          },
          (lot.time > 0
            ? new Date(lot.time * 1000).toLocaleDateString()
            : msg("po_date_unknown", "date unknown")) +
            (lot.source === "chain" ? msg("po_on_chain", " · ~on-chain") : "") +
            (long ? msg("po_long_suffix", " · long") : "") +
            (paused
              ? msg("po_currency_paused", " · $1 · paused", lot.currency)
              : ""),
        ),
        editable &&
          React.createElement(
            RemoveBtn,
            {
              type: "button",
              "aria-label": msg(
                "po_remove_lot_aria",
                "Remove this $1 lot",
                coin,
              ),
              title: msg("po_remove_lot", "Remove lot"),
              onClick: () => this.props.onRemoveLot(coin, i),
            },
            "×",
          ),
      );
    });
  }

  /* ── address watching ── */

  handleWatchAddressChange = (e) =>
    this.setState({ watchAddress: e.target.value, watchError: null });

  handleWatchKeyDown = (e) => {
    if (e.key === "Enter") this.handleWatchSubmit();
  };

  handleWatchSubmit = async () => {
    const { watchAddress, watchBusy } = this.state;
    if (watchBusy || !watchAddress.trim()) return;
    this.setState({ watchBusy: true, watchError: null });
    // The address identifies its own chain — nothing to choose
    const result = await this.props.onWatch(watchAddress);
    this.setState({
      watchBusy: false,
      watchError: result === "ok" ? null : result,
      watchAddress: result === "ok" ? "" : watchAddress,
    });
  };

  /* One sentence per outcome, and the point of each is that it is *not* the
   * others. The old single message told a person with a good Solana address
   * to go and check it. */
  watchErrorText(reason) {
    if (!reason) return null;
    if (reason.startsWith("foreign:")) {
      const chain = reason.slice(8);
      return (
        /* The article ("a" / "an") is English grammar and does not survive
         * translation, so the whole sentence is one message with the chain as
         * a placeholder — every language decides its own wording around it. */
        msg("po_watch_foreign", "That is a $1 address. ", chain) +
        msg(
          "po_watch_chains",
          "PriceTab reads Bitcoin, Ethereum and its tokens, Litecoin, Dogecoin, Bitcoin Cash and Zcash — the amount can still be typed in above.",
        )
      );
    }
    if (reason === "unreachable") {
      return msg(
        "po_watch_unreachable",
        "The balance service did not answer just now. It limits how often it can be asked, so this usually clears on its own — try again in a few minutes. Nothing is wrong with the address.",
      );
    }
    if (reason === "empty") {
      return msg(
        "po_watch_empty",
        "That address holds nothing PriceTab can price right now.",
      );
    }
    return msg(
      "po_watch_shape",
      "That does not look like an address. Paste the whole thing, with no spaces.",
    );
  }

  handleFieldChange = (coin, field, raw) => {
    const key = `${coin}:${field}`;
    /* Filtered before it is drafted, so the box never shows the character it
       is not going to keep. The warning is keyed on the same `coin:field` the
       draft is, because two of these can be on screen at once. */
    const d = numericDraft(raw);
    this.setState((s) => ({
      drafts: { ...s.drafts, [key]: d.value },
      numWarn: d.refused ? key : s.numWarn,
    }));
    if (d.refused) {
      clearTimeout(this._numT);
      this._numT = setTimeout(() => {
        if (this._gone) return;
        this.setState((p) => (p.numWarn === key ? { numWarn: null } : null));
      }, NUMBER_WARN_MS);
    }
    const num = Number(d.value);
    if (d.value !== "" && isFinite(num) && num >= 0) {
      this.commitField(coin, field, num);
    }
  };

  /* The target field has its own pair, and does not go through
   * `handleFieldChange` / `commitField`.
   *
   * Two of the generic pair's rules are wrong for it, and both quietly. An
   * empty box there commits **0**, which for an amount means "I hold none"
   * and is right; for a target it means "I want none of this", which is a
   * real position somebody might hold and is *not* what clearing the field
   * says. Clearing it here removes the target. And a share cannot be over
   * 100: the generic path would have accepted 150 and drawn a tick off the
   * end of the row, so it is refused the same way a letter is, with the box
   * saying so rather than silently rounding the number down to something the
   * person did not type.
   */
  handleTargetChange = (coin, raw) => {
    const key = `${coin}:target`;
    const d = numericDraft(raw);
    const num = Number(d.value);
    const tooBig = d.value !== "" && isFinite(num) && num > 100;
    this.setState((s) => ({
      drafts: { ...s.drafts, [key]: d.value },
      numWarn: d.refused || tooBig ? key : s.numWarn,
    }));
    if (d.refused || tooBig) {
      clearTimeout(this._numT);
      this._numT = setTimeout(() => {
        if (this._gone) return;
        this.setState((p) => (p.numWarn === key ? { numWarn: null } : null));
      }, NUMBER_WARN_MS);
    }
    if (tooBig) return;
    this.props.onSetTarget(
      coin,
      d.value === "" ? null : isFinite(num) && num >= 0 ? num : null,
    );
  };

  handleTargetBlur = (coin) => {
    const key = `${coin}:target`;
    this.setState((s) => {
      if (!(key in s.drafts)) return null;
      const drafts = { ...s.drafts };
      delete drafts[key];
      return { drafts };
    });
  };

  handleFieldBlur = (coin, field) => {
    // Read the draft before clearing it — setState is async, but don't rely on it
    const key = `${coin}:${field}`;
    const raw = this.state.drafts[key];
    this.setState((s) => {
      const drafts = { ...s.drafts };
      delete drafts[key];
      return { drafts };
    });
    // Commit a clean value (empty/invalid → 0)
    if (raw !== undefined) {
      const num = Number(raw);
      this.commitField(coin, field, isFinite(num) && num >= 0 ? num : 0);
    }
  };

  /* ── backup / restore / report ── */

  handleExportJson = () => {
    // Sales ride along: a backup that dropped them would restore holdings
    // whose cost basis no longer matches the gains already taken out of it
    const data = this.props.holdings.map(
      ({ coin, amount, lots, watches, sales, target }) => ({
        coin,
        amount,
        lots,
        watches,
        sales,
        // A target belongs to the holding, so a backup that dropped it would
        // restore a portfolio that had quietly forgotten what it was aiming at
        target: target == null ? null : target,
      }),
    );
    downloadTextFile(
      `pricetab-portfolio-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(data, null, 2),
      "application/json",
    );
  };

  handleExportCsv = () => {
    // Same order the list is in, so the file reads like the screen
    const rows = this.sortRows(this.computeTotals().rows);
    downloadTextFile(
      `pricetab-cost-basis-${new Date().toISOString().slice(0, 10)}.csv`,
      buildPortfolioCsv(rows, this.props.currency, this.props.costMethod),
      "text/csv",
    );
  };

  /* One file picker, two things it can do. The mode is an instance field
   * rather than state: it is decided by the click and read by the change
   * event that follows it, and nothing renders differently in between. */
  handleImportClick = (mode) => {
    this.importMode = mode === "merge" ? "merge" : "replace";
    if (this.fileInput.current) this.fileInput.current.click();
  };

  handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const merging = this.importMode === "merge";
    const before = this.props.holdings;
    let ok;
    let merged = null;
    try {
      const parsed = JSON.parse(await file.text());
      if (merging) {
        merged = this.props.onMerge ? this.props.onMerge(parsed) : null;
        ok = Boolean(merged);
      } else {
        ok = this.props.onImport(parsed) === true;
      }
    } catch (err) {
      ok = false; // unreadable / invalid JSON
    }
    /* Nothing was replaced if there was nothing there, and offering to restore
     * an empty list is an undo that does nothing. A merge that added nothing
     * changed nothing either, so it gets no undo — an Undo button that undoes
     * a no-op is a button that makes people doubt what just happened. */
    if (ok && before.length && (!merging || merged.added > 0)) {
      this.setState({
        undo: {
          label: merging
            ? msg(
                "po_added_from_file",
                "Added $1 holdings from the file",
                merged.added,
              )
            : msg(
                "po_replaced_with_file",
                "Replaced $1 holdings with the file",
                before.length,
              ),
          list: before,
        },
      });
    }
    if (ok && merging) {
      /* Say what happened. "Nothing was added" is the commonest outcome of
       * merging a backup you have already merged, and it has to read as the
       * rule working rather than as a failure. */
      const parts = [];
      if (merged.added) {
        parts.push(msg("po_added_holdings", "Added $1 holdings", merged.added));
      }
      if (merged.kept) {
        parts.push(
          `${merged.kept} ${merged.kept > 1 ? "were" : "was"} already here and ${merged.kept > 1 ? "were" : "was"} left untouched`,
        );
      }
      if (merged.dropped) {
        parts.push(
          msg(
            "po_dropped",
            "$1 did not fit — the list is full",
            merged.dropped,
          ),
        );
      }
      this.setState({
        mergeNote:
          parts.join(" · ") || msg("po_nothing_to_add", "Nothing to add"),
      });
      if (this._mergeNoteTimer) clearTimeout(this._mergeNoteTimer);
      this._mergeNoteTimer = setTimeout(
        () => this.setState({ mergeNote: null }),
        8000,
      );
    }
    this.setState({ importError: !ok });
    if (!ok) {
      if (this._importErrTimer) clearTimeout(this._importErrTimer);
      this._importErrTimer = setTimeout(
        () => this.setState({ importError: false }),
        4000,
      );
    }
  };

  /* Coin matches for the add search.
   *
   * This was a fourth idea of what "matches BTC" means — a plain substring
   * filter over `SUGGESTED_COINS`, which ranked nothing and offered less than
   * `sanitizePortfolio` would keep. Two things changed by folding it into
   * `quickSwitchMatches`: the results are **ranked** (exact symbol, then
   * symbol prefix, then name prefix, then anywhere), and the pool is
   * `HOLDABLE_COINS`, so the four tokens you could only acquire by watching an
   * address can now be typed in. Coins already held are excluded — the whole
   * list, not one symbol, which is why that argument takes either. */
  matches() {
    if (!this.state.query.trim()) return [];
    return quickSwitchMatches(
      this.state.query,
      this.props.coinOptions,
      this.props.holdings.map((h) => h.coin),
      HOLDABLE_COINS,
    ).map((m) => m.coin);
  }

  /* The strip's segments: biggest first, capped at the palette's six, with
   * everything past that — and anything too thin to read — folded into a
   * neutral Other. Built from the same `rows` the table is drawn from, so the
   * strip and the list cannot disagree about a share. Costs no request. */
  allocationSlices(rows, totalNow) {
    if (!totalNow || !rows || !rows.length) return [];
    const priced = rows
      .filter(
        (r) => typeof r.value === "number" && isFinite(r.value) && r.value > 0,
      )
      .map((r) => ({
        coin: r.coin,
        value: r.value,
        share: (r.value / totalNow) * 100,
      }))
      .sort((a, b) => b.value - a.value);
    if (!priced.length) return [];
    const named = [];
    let otherValue = 0;
    for (const p of priced) {
      if (named.length < PORTFOLIO_MAX_BANDS && p.share >= DONUT_MIN_SHARE)
        named.push(p);
      else otherValue += p.value;
    }
    const slices = named.map((p, i) => ({ ...p, tone: i }));
    if (otherValue > 0) {
      slices.push({
        coin: msg("po_other", "Other"),
        value: otherValue,
        share: (otherValue / totalNow) * 100,
        tone: null, // neutral, and the stylesheet knows what that means
      });
    }
    return slices;
  }

  /* The ring itself. One `<circle>` per slice with a dash pattern rather than
   * an arc path: the geometry is one number per slice instead of four
   * trigonometric ones, and a stroked circle is already round-capped and
   * centred with no transform to get wrong.
   *
   * Hover and keyboard focus do the same thing, because the same question
   * follows both: which one is this? Everything else dims rather than the
   * hovered one brightening — dimming says "not these" without making the
   * slice you asked about a different colour from the row it matches. */
  /* The allocation strip.
   *
   * It was a donut, and the donut was replaced rather than tuned — the reasons
   * are in `styles-portfolio.js` above `AllocBar`. What survives from it is the
   * palette, the biggest-first order and the rule that the holdings list is the
   * legend; what changed is that a segment names itself when it is wide enough
   * to, so nothing has to be hovered to read the shape.
   */
  /* EVERYTHING THIS SCREEN USED TO EXPLAIN IN PLACE, IN ONE PANEL.
   *
   * The reasoning for the move is above `InfoBlock` in `styles-portfolio.js`.
   * What belongs here is the part that is the same on every visit: what the
   * screen is, what each figure measures, and what it deliberately does not
   * do. What does *not* belong here is any note that qualifies a particular
   * number on screen — those stay where the number is.
   *
   * The last section is the one worth keeping honest. This app states figures
   * and never advice, and a panel that says so is cheaper than the hundred
   * places somebody might otherwise expect a signal.
   */
  renderInfo() {
    const term = (name, text) =>
      React.createElement(
        InfoRow,
        { key: name },
        React.createElement(InfoTerm, null, name),
        React.createElement("span", null, text),
      );
    return React.createElement(
      InfoBlock,
      null,
      React.createElement(
        "div",
        null,
        React.createElement(
          InfoTitle,
          null,
          msg("po_info_what", "What this is"),
        ),
        React.createElement(
          InfoText,
          null,
          msg(
            "po_info_what_text",
            "A record of what you hold, kept on this device. No wallet is connected and nothing is sent anywhere — a watched address is used only to read its public balance. Amounts, purchases and sales are whatever you have entered here, so the figures are as complete as your entries are.",
          ),
        ),
      ),
      React.createElement(
        "div",
        null,
        React.createElement(
          InfoTitle,
          null,
          msg("po_info_figures", "What the figures mean"),
        ),
        term(
          msg("po_unrealized", "Unrealized"),
          msg(
            "po_info_unrealized",
            "Value now less what you paid, over the amounts you have logged a purchase for.",
          ),
        ),
        term(
          msg("po_realized", "Realized"),
          msg(
            "po_info_realized",
            "Gains and losses on sales you have recorded — settled, unlike the figure beside it.",
          ),
        ),
        term(
          msg("po_return_pa", "Return p.a."),
          msg(
            "po_info_return",
            "Money-weighted: when you paid in counts, not only how much. Refused under two weeks of history, where annualising says more than the data does.",
          ),
        ),
        term(
          msg("po_worst_fall", "Worst fall"),
          msg(
            "po_info_worst",
            "The deepest drop from a peak, inside the range on screen.",
          ),
        ),
        term(
          msg("po_vs_btc", "vs BTC"),
          msg(
            "po_info_vsbtc",
            "The gap, in percentage points, between this basket and holding Bitcoin over the same window.",
          ),
        ),
        term(
          msg("po_long_term", "Long term"),
          msg(
            "po_info_long",
            "The share of your logged purchases held a year or more. Many places treat that as long term; the threshold is not the same everywhere.",
          ),
        ),
      ),
      React.createElement(
        "div",
        null,
        React.createElement(
          InfoTitle,
          null,
          msg("po_info_not", "What it does not do"),
        ),
        React.createElement(
          InfoText,
          null,
          msg(
            "po_info_not_text",
            "It never says to buy or sell. Targets state how far a holding has drifted from the share you chose and stop there; base rates count what has happened before and stop there. The cost basis report is the record a tax return is worked out from, not one — it holds only what was entered here, with no exchange history, transfers, fees or crypto-to-crypto trades.",
          ),
        ),
      ),
    );
  }

  /* THE TARGET EDITOR, UNDER THE STRIP IT BELONGS TO.
   *
   * One cell per holding, biggest first — the strip's own order, so the block
   * that opens under it reads in the same direction. Every cell says something
   * true whether or not a target is set: with one, how far the holding has
   * drifted from it in percentage points; without one, what share it is right
   * now, which is the figure somebody is looking for when they are deciding
   * what to type. That also keeps the row from changing height as targets are
   * added, and it means no cell is ever blank furniture.
   *
   * **Points on the face, money and coins in the title.** The gap between a
   * target and a holding is a percentage of the whole, and that is what the
   * strip above is drawn in; what it is worth and how many coins it comes to
   * are the follow-up question, not the answer. The wording never says to buy
   * or sell anything — see `targetDrift`.
   */
  renderTargets(rows, totalNow) {
    const ranked = rows.slice().sort((a, b) => (b.value || 0) - (a.value || 0));
    let assigned = 0;
    let anyTarget = false;
    for (const r of ranked) {
      if (r.target != null) {
        assigned += r.target;
        anyTarget = true;
      }
    }
    return React.createElement(
      TargetsBlock,
      null,
      ...ranked.map((r) => {
        const key = `${r.coin}:target`;
        const draft = this.state.drafts[key];
        const value =
          draft !== undefined
            ? draft
            : r.target == null
              ? ""
              : String(r.target);
        const drift = targetDrift(r, totalNow);
        const warn = this.state.numWarn === key;
        // Both are set in every branch below; the three cases are exhaustive
        let face;
        let hint;
        if (drift) {
          const over = drift.pts >= 0;
          face = `${over ? "+" : "\u2212"}${Math.abs(drift.pts).toFixed(1)} ${
            Math.abs(drift.pts) === 1
              ? msg("po_target_pt", "pt")
              : msg("po_target_pts", "pts")
          }`;
          /* Two whole sentences rather than one with an "over"/"under" hole in
           * it: the word lands in a different place in half these languages,
           * and a sentence assembled from fragments cannot be translated. */
          hint = over
            ? msg(
                "po_target_over",
                "$1 is $2 points above its target — $3 more than the target, which is $4 $1.",
                r.coin,
                Math.abs(drift.pts).toFixed(1),
                this.fmtMoney(Math.abs(drift.value), false),
                drift.amount == null
                  ? "?"
                  : this.fmtAmount(Math.abs(drift.amount)),
              )
            : msg(
                "po_target_under",
                "$1 is $2 points below its target — $3 less than the target, which is $4 $1.",
                r.coin,
                Math.abs(drift.pts).toFixed(1),
                this.fmtMoney(Math.abs(drift.value), false),
                drift.amount == null
                  ? "?"
                  : this.fmtAmount(Math.abs(drift.amount)),
              );
        } else if (r.value != null && totalNow > 0) {
          face = msg(
            "po_target_now",
            "now $1%",
            ((r.value / totalNow) * 100).toFixed(1),
          );
          hint = msg("po_target_none", "No target set for $1.", r.coin);
        } else {
          // No price, so no share — say that rather than print a zero
          face = msg("po_target_unpriced", "no price");
          hint = msg(
            "po_target_unpriced_hint",
            "$1 has no price right now, so its share of the total cannot be worked out.",
            r.coin,
          );
        }
        return React.createElement(
          TargetCell,
          { key: r.coin },
          React.createElement(TargetCoin, null, r.coin),
          React.createElement(
            TargetField,
            null,
            React.createElement(TargetInput, {
              type: "text",
              inputMode: "decimal",
              value,
              warn,
              "aria-invalid": warn ? "true" : "false",
              "aria-label": msg(
                "po_target_aria",
                "$1 target share in percent",
                r.coin,
              ),
              // An empty box is a holding with no target, and says so
              placeholder: msg("po_target_placeholder", "none"),
              onChange: (e) => this.handleTargetChange(r.coin, e.target.value),
              onBlur: () => this.handleTargetBlur(r.coin),
            }),
            React.createElement(TargetPercent, null, "%"),
          ),
          React.createElement(TargetDrift, { title: hint }, face),
        );
      }),
      /* What the targets add up to. **Nothing is corrected and nothing is
       * refused** — targets that come to 80% are a perfectly ordinary way to
       * use this (four coins you have a view on and the rest left alone), and
       * ones that come to 120% are a mistake worth being told about rather
       * than being silently rescaled into something nobody chose. */
      React.createElement(
        TargetsNote,
        null,
        !anyTarget
          ? msg(
              "po_targets_empty",
              "Set the share you want a holding to be, and this says how far it has drifted. Nothing is bought or sold — the number is the whole feature.",
            )
          : assigned > 100.05
            ? msg(
                "po_targets_over_100",
                "Targets add up to $1% — more than the whole portfolio.",
                assigned.toFixed(1),
              )
            : assigned < 99.95
              ? msg(
                  "po_targets_partial",
                  "Targets cover $1% of the total; the rest is left unassigned.",
                  assigned.toFixed(1),
                )
              : msg("po_targets_full", "Targets cover the whole portfolio."),
      ),
    );
  }

  renderAllocation(rows, totalNow) {
    const slices = this.allocationSlices(rows, totalNow);
    if (slices.length < 2) return null;
    const active = this.state.allocAt;
    const width = this.state.allocWidth;
    const top = slices[0];
    return React.createElement(
      AllocBlock,
      null,
      React.createElement(
        AllocHead,
        null,
        React.createElement("span", null, "Allocation ·"),
        /* The one thing a column of percentages does not give you at a glance,
         * and what the ring's hole used to carry. Unattributed on purpose: the
         * segment beside it already says which coin, and naming it twice is
         * one of them saying nothing. A share, not a warning about one. */
        React.createElement(
          AllocNote,
          null,
          msg(
            "po_share_in_one",
            "$1% in one holding",
            top.share >= 9.95 ? top.share.toFixed(0) : top.share.toFixed(1),
          ),
        ),
        /* The way in to the targets, on the label row of the thing it is
         * about. It is a switch, so it says which state pressing it leads to
         * and reports the one it is in — the same pill, and the same
         * `aria-pressed`, as the mask button in the header above. */
        React.createElement(
          TargetsBtn,
          {
            type: "button",
            active: this.state.showTargets,
            "aria-pressed": this.state.showTargets ? "true" : "false",
            onClick: () =>
              this.setState((st) => ({ showTargets: !st.showTargets })),
            title: msg(
              "po_targets_hint",
              "The share you want each holding to be, and how far it has drifted from that. Nothing is bought or sold.",
            ),
          },
          msg("po_targets", "Targets"),
        ),
      ),
      React.createElement(
        AllocBar,
        {
          innerRef: (n) => (this.allocNode = n),
          role: "img",
          "aria-label":
            msg("po_allocation_prefix", "Allocation: ") +
            slices.map((s) => `${s.coin} ${s.share.toFixed(1)}%`).join(", "),
          onMouseLeave: () => this.setState({ allocAt: null }),
        },
        ...slices.map((slice, i) => {
          // A label only goes where it fits; everything else is named by the
          // list below, which carries the same ink
          const fits =
            width != null && (slice.share / 100) * width >= ALLOC_LABEL_MIN_PX;
          return React.createElement(
            AllocSeg,
            {
              key: slice.coin,
              grow: slice.share,
              tone: slice.tone,
              dim: active != null && active !== i,
              tabIndex: 0,
              title: msg(
                "po_slice_title",
                "$1 — $2% of what you hold",
                slice.coin,
                slice.share.toFixed(1),
              ),
              "aria-label": `${slice.coin} ${slice.share.toFixed(1)}%`,
              onMouseEnter: () => this.setState({ allocAt: i }),
              onFocus: () => this.setState({ allocAt: i }),
              onBlur: () => this.setState({ allocAt: null }),
            },
            fits &&
              React.createElement(
                AllocSegLabel,
                { tone: slice.tone },
                `${slice.coin} ${slice.share.toFixed(0)}%`,
              ),
          );
        }),
      ),
      this.state.showTargets && this.renderTargets(rows, totalNow),
    );
  }

  render() {
    const { holdings, ready, hidden } = this.props;
    const { query, drafts, chartPeriod } = this.state;
    const {
      rows,
      totalNow,
      pnl,
      pnlPct,
      anyPriced,
      unrealized,
      unrealizedPct,
      longTermValue,
      longTermPct,
      realized,
      realizedThisYear,
      thisYear,
      undatedSales,
      costBasis,
      pausedAny,
      moneyWeighted,
      undatedLots,
      datedLots,
    } = this.computeTotals();
    const suggestions = this.matches();
    const sortedRows = this.sortRows(rows);
    const atCap = holdings.length >= PORTFOLIO_MAX_HOLDINGS;

    // Value chart series + its first→last change over the chart period
    const built = this.chartData();
    const series = built ? built.series : null;
    const seriesFirst = series ? series[0].price : null;
    const seriesDelta = series
      ? series[series.length - 1].price - seriesFirst
      : null;
    const seriesPct =
      seriesDelta != null && seriesFirst > 0
        ? (seriesDelta / seriesFirst) * 100
        : null;
    const periodOption = PORTFOLIO_CHART_PERIODS.find(
      (o) => o.value === chartPeriod,
    );
    const periodLabel = periodOption ? periodOption.label : "";
    // How the same window treated the benchmark, and the gap in percentage
    // points. Suppressed when the portfolio is the benchmark and nothing else,
    // where the answer is always zero and says nothing.
    const coverage = this.chartCoverage(built);
    const drawdown = maxDrawdown(series);
    const benchPct = this.benchmarkPct(series);
    const onlyBenchmark = rows.length === 1 && rows[0].coin === BENCHMARK_COIN;
    const benchGap =
      benchPct != null && seriesPct != null && !onlyBenchmark
        ? seriesPct - benchPct
        : null;

    // Secondary stats: 24h P/L (only when the headline shows the chart-period
    // change instead) and the day's best/worst mover (needs ≥ 2 priced coins)
    const show24h = seriesDelta != null && pnl != null;
    const priced = rows.filter((r) => r.change != null && isFinite(r.change));
    let best = null;
    let worst = null;
    if (priced.length >= 2) {
      best = priced.reduce((a, b) => (b.change > a.change ? b : a));
      worst = priced.reduce((a, b) => (b.change < a.change ? b : a));
      if (best.coin === worst.coin) best = worst = null;
    }
    const fmtPct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
    /* Coin → its colour in the allocation ring, so the row bars can be the
     * ring's legend. Built from the same slices the ring draws, which is why
     * a coin folded into Other has no entry here and falls back to neutral. */
    const sliceTone = {};
    for (const slice of this.allocationSlices(rows, totalNow)) {
      if (slice.tone != null) sliceTone[slice.coin] = slice.tone;
    }
    // Flat list of every watched address across holdings, for the chips
    const watchedChips = [];
    for (const r of rows) {
      for (const w of r.watches) {
        watchedChips.push({ coin: r.coin, address: w.address });
      }
    }

    return React.createElement(
      PortfolioShell,
      {
        headed: true,
        /* A hook on the view's own root. Three controls in here share a word
           with something else on screen now — the panel tabs and the phone's
           menu both carry a Targets button — so a test that means *this*
           screen's control has to be able to say so, rather than excluding a
           list of other places that grows every time one is added. */
        "data-portfolio-view": "1",
        // Clicking the empty space beside the content closes the view, the
        // same as the × — mousedown + target check so a drag that ends out
        // here (text selection, dismissing the coin suggestions) doesn't
        // count as clicking outside
        onMouseDown: (e) => {
          if (e.target === e.currentTarget && this.props.onClose) {
            this.props.onClose();
          }
        },
      },
      // Total-value chart, full-bleed behind everything (decorative)
      series &&
        React.createElement(
          PortfolioChartBg,
          { "aria-hidden": true },
          /* The chart was decoration: no axis, no readout, nothing to take a
           * number off. One horizontal mark changes that — where the curve
           * sits above your cost is where you are ahead, and where it crosses
           * is when you got there. It draws only when the level is inside the
           * range on screen, so it can never imply a crossing that the window
           * doesn't contain. */
          React.createElement(Line, {
            prices: series,
            colorize: this.props.chartColorize,
            reference: costBasis > 0 ? this.costReference(costBasis) : null,
          }),
        ),
      /* The screens' head band: the name and its key, and what is here. */
      React.createElement(
        PortfolioScreenHead,
        { "data-portfolio-head": "true" },
        React.createElement("h2", null, msg("po_title", "Portfolio"), keyCap("P")),
        React.createElement(
          "span",
          null,
          holdings.length === 1
            ? msg("po_band_one", "1 holding · tracking only")
            : holdings.length
              ? msg("po_band_n", "$1 holdings · tracking only", String(holdings.length))
              : msg("po_band_none", "Tracking only"),
        ),
      ),
      React.createElement(
        PortfolioInner,
        { empty: holdings.length === 0 },
        // Header: total value + change over the chart period (24h fallback)
        React.createElement(
          PortfolioHeader,
          null,
          React.createElement(
            PortfolioHeadRow,
            null,
            React.createElement(
              "div",
              null,
              /* **A total of nothing is not zero.**
               *
               * This screen used to open on `$0.00` in the largest type it
               * has, under the words "Total value" — a statement about a
               * person's money, made about a portfolio that does not exist
               * yet. It is the same mistake the `worstFall` widget avoids by
               * saying "None" rather than `0.0%`, and the base-rate panel
               * avoids by refusing to print a comparison it cannot support: a
               * figure of zero reads as a measurement, and an absence is not
               * one.
               *
               * The two empty cases are also not the same case. Nothing held
               * is *nothing tracked yet*. Holdings held but none of them
               * priced — the ticker has not answered, or every coin is one no
               * exchange quotes — is *we cannot value this right now*, and
               * printing `$0.00` there is worse still: it says your holdings
               * are worthless. Each now says its own thing. */
              /* The name and its key are the band's now; the eyebrow says
                 what the figure under it is. */
              holdings.length
                ? React.createElement(PortfolioEyebrow, null, msg("po_total_value", "Total value"))
                : null,
              holdings.length === 0
                ? React.createElement(
                    PortfolioEmptyTitle,
                    null,
                    msg("po_nothing_tracked", "Nothing tracked yet"),
                  )
                : React.createElement(
                    PortfolioTotal,
                    null,
                    anyPriced ? this.fmtMoney(totalNow, false) : "—",
                  ),
              seriesDelta != null
                ? React.createElement(
                    PortfolioDelta,
                    {
                      up: seriesDelta === 0 ? null : seriesDelta > 0,
                      /* The figure above is every holding; this one is only the
                       * ones with a line. Where they differ the label says so —
                       * two numbers on one line that measure different things and
                       * do not admit it is the defect, not the gap itself. */
                      title: coverage
                        ? msg(
                            "po_coverage_note",
                            "Over $1, across the $2 holdings this chart can draw$3. The total above covers all $4.",
                            periodLabel.toLowerCase(),
                            coverage.drawn,
                            coverage.share != null
                              ? msg(
                                  "po_share_of_value_dash",
                                  " — $1% of your value",
                                  coverage.share.toFixed(0),
                                )
                              : "",
                            coverage.held,
                          )
                        : undefined,
                    },
                    // fmtMoney(delta, true) already prints a +/- sign
                    this.fmtMoney(seriesDelta, true) +
                      (seriesPct != null
                        ? ` (${seriesPct >= 0 ? "+" : ""}${seriesPct.toFixed(2)}%)`
                        : "") +
                      ` · ${periodLabel}` +
                      (coverage
                        ? msg(
                            "po_drawn_of_held",
                            " · $1 of $2",
                            coverage.drawn,
                            coverage.held,
                          )
                        : ""),
                  )
                : holdings.length > 0 &&
                    anyPriced &&
                    pnl != null &&
                    React.createElement(
                      PortfolioDelta,
                      { up: pnl === 0 ? null : pnl > 0 },
                      this.fmtMoney(pnl, true) +
                        (pnlPct != null
                          ? ` (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%) 24h`
                          : " 24h"),
                    ),
            ),
            /* The two header switches, in one group at the right-hand end:
             * what the screen is (pressed once) and the mask (pressed often,
             * so it keeps the outer edge where the pointer lands). */
            React.createElement(
              PortfolioHeadTools,
              null,
              React.createElement(
                InfoBtn,
                {
                  type: "button",
                  active: this.state.showInfo,
                  "aria-pressed": this.state.showInfo ? "true" : "false",
                  "aria-label": msg(
                    "po_info_aria",
                    "What this screen is, and what the figures mean",
                  ),
                  onClick: () =>
                    this.setState((st) => ({ showInfo: !st.showInfo })),
                  title: msg(
                    "po_info_aria",
                    "What this screen is, and what the figures mean",
                  ),
                },
                msg("po_info", "About"),
              ),
              /* The country report helper: a screen of its own over the list,
                 the way the chart is brought forward. */
              holdings.length > 0 &&
                React.createElement(
                  InfoBtn,
                  {
                    type: "button",
                    active: this.state.taxOpen,
                    "aria-pressed": this.state.taxOpen ? "true" : "false",
                    "data-portfolio-tax-open": "true",
                    onClick: () =>
                      this.setState((st) => ({ taxOpen: !st.taxOpen, assetOpen: null, chartOpen: false })),
                    title: msg(
                      "po_tax_guide_hint",
                      "Crypto tax rules for every country — what is taxed and what is not, with an estimate from your records where the rule allows. Not tax advice",
                    ),
                  },
                  msg("po_tax_guide", "Tax guide"),
                ),
              /* The mask switch, opposite the total it hides.
               *
               * Only where there is something to hide: on the empty screen it
               * would be a control that cannot change anything, which is the
               * kind this screen has removed before. `active` fills the pill in
               * while the figures are masked, so the state is readable without
               * reading the word on the button. */
              holdings.length > 0 &&
                React.createElement(
                  PortfolioHideBtn,
                  {
                    type: "button",
                    active: hidden,
                    "aria-pressed": hidden ? "true" : "false",
                    onClick: this.props.onToggleHidden,
                    title: msg(
                      "po_hide_hint",
                      "Mask every figure of yours on this screen — percentages, prices and the shape of the chart stay. Exports are never masked. (H)",
                    ),
                  },
                  hidden
                    ? msg("po_show_amounts", "Show amounts")
                    : msg("po_hide_amounts", "Hide amounts"),
                ),
            ),
          ),
        ),
        this.state.showInfo && this.renderInfo(),
        /* TWO COLUMNS ON A SCREEN WIDE ENOUGH FOR THEM.
         *
         * Nothing here was rewritten — the same children, in the same
         * order, in two containers. What reads goes left (the shape of
         * the basket, the figures, the chart); what you do goes right
         * (the list, the two forms, the backup). Below the breakpoint
         * the grid collapses to one column and the order is exactly the
         * order it was before. */
        React.createElement(
          PortfolioColumns,
          /* With nothing held there is nothing to put in a second column:
           * the empty screen is one left-aligned column and stays one. */
          { single: holdings.length === 0 },
          React.createElement(
            PortfolioColMain,
            null,
            /* Full width, under the total rather than opposite it. The ring that
             * used to sit here was 132px of circle in a header whose job is the
             * total; the strip is 26px, spans the width the way every other row
             * on this screen does, and answers the same question — not how much,
             * but of what. */
            this.renderAllocation(rows, totalNow),
            /* Lead tier: the two "what have I made" figures. One is a position,
             * the other is settled — side by side, not folded together. */
            (unrealized != null || realized != null) &&
              React.createElement(
                PortfolioStatsLead,
                null,
                unrealized != null &&
                  React.createElement(
                    StatItem,
                    {
                      lead: true,
                      title:
                        (this.unloggedNote(rows)
                          ? msg(
                              "po_unrealized_partial",
                              "Unrealized P/L vs what you paid — covers only the amounts you've logged a purchase for ($1)",
                              this.unloggedNote(rows),
                            )
                          : msg(
                              "po_unrealized_hint",
                              "Unrealized P/L vs what you paid",
                            )) +
                        (pausedAny
                          ? msg(
                              "po_unrealized_paused",
                              " · purchases entered in another currency are left out rather than converted — open a holding to see which",
                            )
                          : ""),
                    },
                    React.createElement(
                      StatLabel,
                      null,
                      msg("po_unrealized", "Unrealized"),
                    ),
                    React.createElement(
                      StatValue,
                      { up: unrealized === 0 ? null : unrealized > 0 },
                      this.fmtMoney(unrealized, true) +
                        (unrealizedPct != null
                          ? ` (${fmtPct(unrealizedPct)})`
                          : ""),
                    ),
                  ),
                realized != null &&
                  React.createElement(
                    StatItem,
                    {
                      lead: true,
                      title:
                        "Gains and losses on sales you've recorded — proceeds less the cost of the purchases each sale consumed, oldest first. Unlike the figure beside it, this one is settled." +
                        (pausedAny
                          ? msg(
                              "po_realized_paused",
                              " Sales recorded in another currency are left out rather than converted.",
                            )
                          : ""),
                    },
                    React.createElement(
                      StatLabel,
                      null,
                      msg("po_realized", "Realized"),
                    ),
                    React.createElement(
                      StatValue,
                      { up: realized === 0 ? null : realized > 0 },
                      this.fmtMoney(realized, true),
                    ),
                  ),
              ),
            (show24h ||
              best ||
              benchGap != null ||
              drawdown != null ||
              realizedThisYear != null ||
              longTermPct != null) &&
              React.createElement(
                PortfolioStats,
                null,
                /* Three subjects, not seven facts in a row.
                 *
                 * The grid already aligned these into columns; what it could
                 * not do was say which belonged with which. Read straight
                 * across, the old order put the fall next to the benchmark next
                 * to the annualised return — three different questions, evenly
                 * spaced. The columns are now the subjects themselves: how it
                 * went wrong, what it returned, and what today did. Same
                 * figures, standing next to the ones they belong with. */
                React.createElement(
                  PortfolioStatGroup,
                  null,
                  /* The one thing the algorithm research left standing (§9.4):
                   * rules cut the fall on 59 of 64 pairs and beat holding on 28.
                   * So the honest number to put beside a portfolio is how far it
                   * actually fell, not when to buy it. */
                  drawdown != null &&
                    React.createElement(
                      StatItem,
                      {
                        title:
                          msg(
                            "po_drawdown_hint",
                            "The deepest fall from a high to a later low inside this $1 window",
                            periodLabel.toLowerCase(),
                          ) +
                          (drawdown.from && drawdown.to
                            ? msg(
                                "po_drawdown_range",
                                " — $1 to $2",
                                new Date(+drawdown.from).toLocaleDateString(),
                                new Date(+drawdown.to).toLocaleDateString(),
                              )
                            : "") +
                          msg(
                            "po_worst_fall_note",
                            ". It says how bad this got, not how bad it can get.",
                          ),
                      },
                      React.createElement(
                        StatLabel,
                        null,
                        msg("po_worst_fall", "Worst fall"),
                      ),
                      React.createElement(
                        StatValue,
                        { up: false },
                        `${drawdown.pct.toFixed(1)}%`,
                      ),
                    ),

                  /* The one number a portfolio percentage can't be read for: in a
                   * market that moves together, "up 8%" is nearly everyone's
                   * answer. Whether these particular coins beat simply holding
                   * the obvious one is the part that was yours. */
                  benchGap != null &&
                    React.createElement(
                      StatItem,
                      {
                        title: `Over ${periodLabel.toLowerCase()}: your holdings ${fmtPct(seriesPct)}, ${BENCHMARK_COIN} ${fmtPct(benchPct)}. The gap is what holding these coins rather than ${BENCHMARK_COIN} was worth — amounts are fixed across the window, so nothing is distorting it.`,
                      },
                      React.createElement(
                        StatLabel,
                        null,
                        msg("po_vs_benchmark", "vs $1", BENCHMARK_COIN),
                      ),
                      /* The sign comes from the **rounded** figure, not the raw
                       * one. A gap of −0.04 printed as "−0.0 pts", in the down
                       * colour: a direction claimed by a number that has no
                       * direction left once it is rounded. Anything that rounds to
                       * zero is a dead heat and is shown as one. */
                      (() => {
                        const shown = Number(benchGap.toFixed(1));
                        return React.createElement(
                          StatValue,
                          { up: shown === 0 ? null : shown > 0 },
                          `${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown).toFixed(1)} pts`,
                        );
                      })(),
                    ),
                ),
                React.createElement(
                  PortfolioStatGroup,
                  null,
                  /* THE RATE, not the amount — a bank statement's headline.
                   *
                   * Every other percentage here divides one number by another and
                   * ignores when the money went in. This one does not, which is
                   * why it can disagree with "Unrealized" and why the disagreement
                   * is the useful part: the same money in and the same value now
                   * is 9.55% a year if it all went in at the start and 17.76% if
                   * half went in last month. */
                  moneyWeighted != null &&
                    React.createElement(
                      StatItem,
                      {
                        title:
                          "Money-weighted return, annualised — the rate that would have turned your recorded purchases, on the dates you made them, into what you hold now. " +
                          "Unlike the percentages beside it this one counts *when* money went in, so topping up at a good moment shows up in it. " +
                          (undatedLots
                            ? `Worked out from the ${datedLots} purchase${datedLots === 1 ? "" : "s"} that carry a date; ${undatedLots} without one could not be placed on a timeline and are left out. `
                            : "") +
                          "It is not printed at all until a position is two weeks old, because annualising three days of anything is arithmetic rather than information.",
                      },
                      React.createElement(
                        StatLabel,
                        null,
                        msg("po_return_pa", "Return p.a."),
                      ),
                      React.createElement(
                        StatValue,
                        { up: Number((moneyWeighted * 100).toFixed(1)) === 0 ? null : moneyWeighted > 0 },
                        `${signedFixed(moneyWeighted * 100, 1, "-")}%`,
                      ),
                    ),

                  /* How much of what you've logged is past the one-year mark.
                   * It's the split the tax report leads with, and the one thing
                   * about a holding that changes on its own while you do nothing. */
                  longTermPct != null &&
                    React.createElement(
                      StatItem,
                      {
                        title: `${this.fmtMoney(longTermValue, false)} of your logged purchases have been held ${LONG_TERM_DAYS} days or more. Many places treat that as long term — the threshold isn't the same everywhere.`,
                      },
                      React.createElement(
                        StatLabel,
                        null,
                        msg("po_long_term", "Long term"),
                      ),
                      React.createElement(
                        StatValue,
                        null,
                        `${longTermPct.toFixed(0)}%`,
                      ),
                    ),

                  /* The window a return is worked out over. Shown only when it
                   * is not simply the Realized figure again — if every sale you
                   * recorded happened this year the two are the same number, and
                   * printing it twice is one of them saying nothing.
                   *
                   * Called the calendar year and never the tax year: that ends on
                   * 5 April in the UK and 30 June in Australia, and `TODO.md`
                   * declined country-specific tax computation for exactly this
                   * reason. A calendar year is a fact; a tax year is a guess. */
                  realizedThisYear != null &&
                    realized != null &&
                    Math.abs(realizedThisYear - realized) > 0.005 &&
                    React.createElement(
                      StatItem,
                      {
                        title:
                          msg(
                            "po_realized_year_hint",
                            "Gains and losses on sales you recorded between 1 January $1 and today. ",
                            thisYear,
                          ) +
                          msg(
                            "po_calendar_year",
                            "This is the calendar year — the tax year ends on a different date in many countries, so check yours.",
                          ) +
                          (undatedSales
                            ? msg(
                                "po_undated_sales",
                                " $1 sale(s) have no date and are in neither year.",
                                undatedSales,
                              )
                            : ""),
                      },
                      React.createElement(
                        StatLabel,
                        null,
                        msg("po_realized_year", "Realized $1", thisYear),
                      ),
                      React.createElement(
                        StatValue,
                        {
                          up:
                            realizedThisYear === 0
                              ? null
                              : realizedThisYear > 0,
                        },
                        this.fmtMoney(realizedThisYear, true),
                      ),
                    ),
                ),
                React.createElement(
                  PortfolioStatGroup,
                  null,
                  show24h &&
                    React.createElement(
                      StatItem,
                      null,
                      React.createElement(StatLabel, null, "24h"),
                      React.createElement(
                        StatValue,
                        { up: pnl === 0 ? null : pnl > 0 },
                        this.fmtMoney(pnl, true) +
                          (pnlPct != null ? ` (${fmtPct(pnlPct)})` : ""),
                      ),
                    ),

                  best &&
                    React.createElement(
                      StatItem,
                      null,
                      React.createElement(
                        StatLabel,
                        null,
                        msg("po_best_24h", "Best 24h"),
                      ),
                      React.createElement(
                        StatValue,
                        { up: best.change === 0 ? null : best.change > 0 },
                        `${best.coin} ${fmtPct(best.change)}`,
                      ),
                    ),

                  worst &&
                    React.createElement(
                      StatItem,
                      null,
                      React.createElement(
                        StatLabel,
                        null,
                        msg("po_worst_24h", "Worst 24h"),
                      ),
                      React.createElement(
                        StatValue,
                        { up: worst.change === 0 ? null : worst.change > 0 },
                        `${worst.coin} ${fmtPct(worst.change)}`,
                      ),
                    ),
                ),
              ),
            /* Said once, at the top, because a figure that silently covers less
             * than you think is the failure this whole section is written
             * against. The per-holding panels name the currency; this one only
             * has to say the totals are not the whole story. */
            /* Named, not just counted: "12 of 15" tells you something is out
             * and not which, and the two reasons have different answers — one
             * is a cap you can change by holding less, the other is a coin with
             * no series anywhere. */
            coverage &&
              React.createElement(
                LotNote,
                {
                  title: coverage.unchartable.length
                    ? `No price history is published for ${coverage.unchartable.join(", ")} by either exchange this app reads, so there is no line to draw. They are still in the total above.`
                    : undefined,
                },
                msg(
                  "po_chart_covers",
                  "The chart and the change beside the total cover $1 of $2 holdings",
                  coverage.drawn,
                  coverage.held,
                ) +
                  (coverage.share != null
                    ? msg(
                        "po_share_of_value",
                        ", $1% of your value",
                        coverage.share.toFixed(0),
                      )
                    : "") +
                  ". " +
                  [
                    coverage.unchartable.length
                      ? `${coverage.unchartable.join(", ")} ${coverage.unchartable.length > 1 ? "have" : "has"} no price history to draw`
                      : "",
                    coverage.capped.length
                      ? `${coverage.capped.length} smaller holding${coverage.capped.length > 1 ? "s are" : " is"} beyond the ${PORTFOLIO_CHART_MAX_COINS} this chart draws`
                      : "",
                  ]
                    .filter(Boolean)
                    .join("; ") +
                  msg(
                    "po_total_counts_all",
                    ". The total above counts everything.",
                  ),
              ),
            pausedAny &&
              React.createElement(
                LotNote,
                null,
                `Some purchases or sales were entered in another currency. They are shown in their own currency and left out of the figures above rather than converted — open a holding to see which, or switch back to that currency.`,
              ),

            /* The chart itself, in the band that was empty.
             *
             * The same component the stage uses, in a fixed frame — one chart with
             * one set of rules, rather than a second drawing that could disagree
             * with it. Only the total line here: composition, P/L, the benchmark
             * and the rest are questions you go and ask, and a glance should
             * answer one thing.
             *
             * The whole frame opens the stage, so the chart is its own way in and
             * `Explore chart` beside it is the label for what clicking does. */
            holdings.length > 0 &&
              series &&
              built &&
              React.createElement(
                PortfolioGlanceCard,
                { "data-portfolio-glance": "true" },
                /* The range and the way in at the card's head, the plot under
                   them — the derivatives page's shape, and the stage's. */
                React.createElement(
                  PortfolioGlanceHead,
                  null,
                  React.createElement(PeriodSwitcher, {
                    onChange: this.handlePeriodChange,
                    options: PORTFOLIO_CHART_PERIODS,
                    value: chartPeriod,
                  }),
                  React.createElement(
                    PortfolioChartBtn,
                    {
                      onClick: this.toggleChart,
                      title: msg(
                        "po_explore_hint",
                        "Open the value chart — read it at any moment, with your purchases and sales on it",
                      ),
                    },
                    icon("eye", 0.85),
                    React.createElement(
                      "span",
                      null,
                      msg("po_explore", "Explore chart"),
                    ),
                  ),
                ),
                React.createElement(
                  PortfolioInlineChart,
                  {
                    onClick: this.toggleChart,
                    onKeyDown: (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        this.toggleChart();
                      }
                    },
                    tabIndex: 0,
                    role: "button",
                    "aria-label": msg("po_explore", "Explore chart"),
                    title: msg(
                      "po_explore_hint",
                      "Open the value chart — read it at any moment, with your purchases and sales on it",
                    ),
                  },
                  React.createElement(PortfolioChart, {
                    series,
                    parts: built.parts,
                    events: this.chartEvents(series),
                    costBasis: costBasis > 0 ? costBasis : null,
                    period: chartPeriod,
                    currency: this.props.currency,
                    mode: "total",
                    formatMoney: (v, sign) => this.fmtMoney(v, sign),
                    formatAmount: (v) => this.fmtAmount(v),
                    hidden: this.props.hidden,
                    /* The glance: no crosshair, no legend, no focus stop of its own
                     * — the frame around it is the control. See `compact` in
                     * `portfolio-chart.js` for why the legend in particular has to
                     * go here and stay in the stage. */
                    compact: true,
                  }),
                ),
              ),

            /* With nothing held there is no chart and no range to switch, so
               the row that used to carry them is gone with them. */
            /* Under the chart it reads from: the return with the money moved
               in and out taken out of it, then every record in date order. */
            holdings.length > 0 && this.renderPerformance(periodLabel),
            holdings.length > 0 && this.renderActivity(),
          ),
          React.createElement(
            PortfolioColSide,
            null,
            // Holdings list or empty state
            /* The empty state is a line under the title now, not a dashed box
             * above the form.
             *
             * It was a 160px bordered island holding two sentences, sitting
             * between the heading and the two fields that are the only thing to
             * do on this screen — furniture in the one place where there is
             * nothing else to look at. And the second of its two sentences was
             * the privacy promise, which the footer of the same screen prints
             * again twenty lines below: on a populated portfolio you see it once,
             * on an empty one you saw it twice. One says what to do, the footer
             * says what it promises. */
            holdings.length === 0
              ? React.createElement(
                  PortfolioEmptyLine,
                  null,
                  msg(
                    "po_empty_hint",
                    "Search a coin below, or paste an address to watch.",
                  ),
                )
              : React.createElement(
                  Fragment,
                  null,
                  React.createElement(
                    PortfolioSortRow,
                    null,
                    React.createElement(
                      PortfolioSectionLabel,
                      { style: { margin: 0 } },
                      msg("po_holdings_n", "Holdings · $1", holdings.length),
                    ),
                    holdings.length > 1 &&
                      React.createElement(
                        PortfolioSortBtns,
                        null,
                        React.createElement(
                          PortfolioSortLabel,
                          null,
                          msg("po_sort", "Sort"),
                        ),
                        ...PORTFOLIO_SORT_OPTIONS.map((option) =>
                          React.createElement(
                            PortfolioSortBtn,
                            {
                              key: option.value,
                              active: this.state.sort === option.value,
                              onClick: () =>
                                this.handleSortChange(option.value),
                              title:
                                option.value === "name"
                                  ? msg("po_alphabetical", "Alphabetical")
                                  : msg(
                                      "po_largest_first",
                                      "Largest $1 first",
                                      option.label.toLowerCase(),
                                    ),
                            },
                            option.label,
                          ),
                        ),
                      ),
                  ),
                  React.createElement(
                    HoldingsHead,
                    { "aria-hidden": true },
                    React.createElement("span", null, ""),
                    React.createElement(
                      "span",
                      null,
                      msg("po_amount", "Amount"),
                    ),
                    React.createElement(
                      "span",
                      null,
                      msg("po_cost_basis", "Cost basis"),
                    ),
                    React.createElement("span", null, periodLabel),
                    React.createElement("span", null, msg("po_value", "Value")),
                    React.createElement("span", null, ""),
                  ),
                  React.createElement(
                    HoldingsList,
                    null,
                    sortedRows.map((r) => {
                      const watched = r.watches.length > 0;
                      const amountDraft = drafts[`${r.coin}:amount`];
                      const amountVal =
                        amountDraft !== undefined
                          ? amountDraft
                          : String(r.manualAmount);
                      // What this currency can measure, and what it covers
                      const basis = r.basis;
                      const pricedAmt = lotsAmount(r.priced);
                      // Coverage is a different question from currency: this is
                      // every lot still held, whatever it was entered in
                      const lotAmt = lotsAmount(r.lots);
                      const expanded = this.state.expandedCoin === r.coin;
                      // Which side the open editor is recording
                      const selling = expanded && this.state.lotMode === "sell";
                      const receiving = expanded && this.state.lotMode === "income";
                      // Unrealized P/L over the lotted amount (needs a price)
                      const rowPl =
                        basis > 0 && r.price != null
                          ? r.price * pricedAmt - basis
                          : null;
                      const share =
                        r.value != null && totalNow > 0
                          ? (r.value / totalNow) * 100
                          : null;
                      return React.createElement(
                        HoldingRow,
                        { key: r.coin },
                        share != null &&
                          share > 0 &&
                          React.createElement(HoldingShareBar, {
                            "aria-hidden": true,
                            tone: sliceTone[r.coin],
                            style: { width: `${share}%` },
                          }),
                        /* The target on the same bar, as a mark rather than a
                         * second bar — the bar is where this holding *is* and the
                         * mark is where it was meant to be, so the gap between
                         * them is the drift the editor states in numbers. Drawn
                         * from the row's own width, never from the strip's
                         * segment: see `HoldingTargetTick`. */
                        r.target != null &&
                          React.createElement(HoldingTargetTick, {
                            "aria-hidden": true,
                            style: { left: `calc(${r.target}% - 1px)` },
                            title: msg(
                              "po_target_tick",
                              "Target: $1% of the portfolio",
                              r.target,
                            ),
                          }),
                        React.createElement(
                          HoldingCoin,
                          {
                            role: "button",
                            tabIndex: 0,
                            "aria-expanded": expanded,
                            title: watched
                              ? msg(
                                  "po_show_origin",
                                  "Show where these coins came from and what you paid",
                                )
                              : msg(
                                  "po_show_purchases",
                                  "Show your purchases for this coin",
                                ),
                            onClick: () => this.handleToggleLots(r.coin),
                            onKeyDown: (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                this.handleToggleLots(r.coin);
                              }
                            },
                          },
                          React.createElement(
                            HoldingSym,
                            null,
                            React.createElement(
                              Chevron,
                              { open: expanded },
                              "▶",
                            ),
                            r.coin,
                            watched &&
                              React.createElement(
                                WatchedBadge,
                                {
                                  title:
                                    r.watches.length > 1
                                      ? msg(
                                          "po_n_watched",
                                          "$1 watched addresses",
                                          r.watches.length,
                                        )
                                      : msg(
                                          "po_one_watched",
                                          "1 watched address",
                                        ),
                                },
                                icon("link", 0.85),
                                r.watches.length > 1
                                  ? React.createElement(
                                      WatchedBadgeCount,
                                      null,
                                      r.watches.length,
                                    )
                                  : null,
                              ),
                          ),
                          React.createElement(
                            HoldingName,
                            null,
                            (COIN_NAMES[r.coin] || r.coin) +
                              (share != null && share >= 0.1
                                ? ` · ${share >= 9.95 ? share.toFixed(0) : share.toFixed(1)}%`
                                : ""),
                          ),
                        ),
                        watched
                          ? React.createElement(
                              AmountTotalBtn,
                              {
                                title: msg(
                                  "po_total_across",
                                  "Total across the hand-entered part and every watched address — click for the breakdown",
                                ),
                                "aria-label": msg(
                                  "po_total_amount_aria",
                                  "$1 total amount",
                                  r.coin,
                                ),
                                onClick: () => this.handleToggleLots(r.coin),
                              },
                              hidden ? MONEY_MASK : String(r.amount),
                            )
                          : React.createElement(AmountInput, {
                              type: "text",
                              inputMode: "decimal",
                              /* Hidden, and therefore not editable: a field you
                               * cannot read is one you cannot correct, and a
                               * number typed over a mask is a change made blind.
                               * `readOnly` rather than `disabled` — it keeps its
                               * place in the tab order and keeps its name, it
                               * just has nothing to give while the screen is
                               * masked. */
                              value: hidden ? MONEY_MASK : amountVal,
                              readOnly: hidden || undefined,
                              title: hidden
                                ? msg(
                                    "po_amount_hidden",
                                    "Amounts are hidden — press H to show them",
                                  )
                                : undefined,
                              "aria-label": msg(
                                "po_amount_aria",
                                "$1 amount",
                                r.coin,
                              ),
                              "aria-invalid":
                                this.state.numWarn === `${r.coin}:amount`
                                  ? "true"
                                  : "false",
                              onChange: (e) =>
                                this.handleFieldChange(
                                  r.coin,
                                  "amount",
                                  e.target.value,
                                ),
                              onBlur: () =>
                                this.handleFieldBlur(r.coin, "amount"),
                            }),
                        React.createElement(
                          LotsBtn,
                          {
                            empty: basis <= 0,
                            open: expanded,
                            title:
                              basis <= 0 && r.paused.length
                                ? msg(
                                    "po_paused_basis",
                                    "Every purchase logged for $1 was entered in $2. Switch to it to see this cost basis and its P/L.",
                                    r.coin,
                                    pausedCurrencies(r.paused),
                                  )
                                : watched
                                  ? msg(
                                      "po_inferred",
                                      "Purchases inferred from the watched address — click to view",
                                    )
                                  : msg(
                                      "po_your_purchases",
                                      "Your purchases for this coin — click to view or add ('bought 0.5 for 15000')",
                                    ),
                            "aria-label": msg(
                              "po_lots_aria",
                              "$1 purchase lots",
                              r.coin,
                            ),
                            onClick: () => this.handleToggleLots(r.coin),
                          },
                          basis > 0
                            ? this.fmtMoney(basis, false)
                            : /* There *are* purchases, they are just in another
                               * currency. "+ lot" would invite logging a second
                               * copy of something already recorded. */
                              r.paused.length
                              ? "paused"
                              : `+ ${r.lots.length ? "lots" : "lot"}`,
                        ),
                        React.createElement(
                          HoldingSparkCell,
                          null,
                          this.renderSpark(r.coin),
                        ),
                        React.createElement(
                          HoldingValue,
                          null,
                          React.createElement(
                            HoldingValueMain,
                            null,
                            r.value != null
                              ? this.fmtMoney(r.value, false)
                              : ready
                                ? "—"
                                : "…",
                          ),
                          // With a cost set the sub-line shows unrealized P/L
                          // (the day's move already lives in the header stats)
                          rowPl != null
                            ? React.createElement(
                                HoldingValueSub,
                                {
                                  up: rowPl === 0 ? null : rowPl > 0,
                                  title: msg(
                                    "po_unrealized_hint",
                                    "Unrealized P/L vs what you paid",
                                  ),
                                },
                                this.fmtMoney(rowPl, true),
                              )
                            : React.createElement(
                                HoldingValueSub,
                                { up: r.change == null ? null : r.up },
                                r.change != null
                                  ? `${r.change >= 0 ? "+" : ""}${r.change.toFixed(2)}%`
                                  : "",
                              ),
                        ),
                        React.createElement(
                          RemoveBtn,
                          {
                            type: "button",
                            "aria-label": msg(
                              "po_remove_coin",
                              "Remove $1",
                              r.coin,
                            ),
                            title: msg(
                              "po_remove_holding_hint",
                              "Remove this holding, its purchases and its recorded sales. Undoable until you close the portfolio.",
                            ),
                            onClick: () => this.handleRemoveHolding(r.coin),
                          },
                          "×",
                        ),

                        // Accordion: where this coin's amount comes from —
                        // the hand-entered part first, then one block per
                        // watched address, each with its own purchases
                        expanded &&
                          React.createElement(
                            LotsPanel,
                            null,
                            /* The row's value covers everything you hold; its P/L
                             * can only cover what you've logged a purchase for.
                             * When those differ the panel says so — otherwise the
                             * two numbers on the same line quietly disagree. */
                            r.unlogged > 0 &&
                              lotsAmount(r.lots) > 0 &&
                              React.createElement(
                                LotNote,
                                null,
                                msg(
                                  "po_unlogged_note",
                                  "$1 $2 has no purchase logged, so it counts toward the value above but not toward the P/L.",
                                  Number(r.unlogged.toPrecision(6)),
                                  r.coin,
                                ),
                              ),
                            /* Entered in another currency. Converting at today's
                             * rate would give a figure that moves on days the
                             * purchase did not, so it is set aside and named —
                             * the answer a paused price target already gets. */
                            (r.paused.length > 0 || r.salesPaused.length > 0) &&
                              React.createElement(
                                LotNote,
                                null,
                                `${pausedCount(r)} recorded in ${pausedCurrencies([...r.paused, ...r.salesPaused])}. Left out of the totals above while ${this.props.currency} is on screen; each is shown below in the currency it was entered in.`,
                              ),
                            React.createElement(
                              SourceBlock,
                              null,
                              React.createElement(
                                SourceHead,
                                null,
                                React.createElement(
                                  SourceTitle,
                                  null,
                                  msg("po_added_by_hand", "Added by hand"),
                                ),
                                // Editable here only when the row's own amount
                                // cell is showing the multi-source total
                                watched
                                  ? React.createElement(SourceAmountInput, {
                                      type: "text",
                                      inputMode: "decimal",
                                      "aria-invalid":
                                        this.state.numWarn ===
                                        `${r.coin}:amount`
                                          ? "true"
                                          : "false",
                                      value: hidden ? MONEY_MASK : amountVal,
                                      readOnly: hidden || undefined,
                                      "aria-label": msg(
                                        "po_manual_amount_aria",
                                        "$1 hand-entered amount",
                                        r.coin,
                                      ),
                                      onChange: (e) =>
                                        this.handleFieldChange(
                                          r.coin,
                                          "amount",
                                          e.target.value,
                                        ),
                                      onBlur: () =>
                                        this.handleFieldBlur(r.coin, "amount"),
                                    })
                                  : React.createElement(
                                      SourceAmount,
                                      null,
                                      `${hidden ? MONEY_MASK : r.manualAmount} ${r.coin}`,
                                    ),
                              ),
                              this.renderLotLines(
                                r.coin,
                                r.manualLots,
                                true,
                                msg(
                                  "po_no_purchases",
                                  "No purchases logged yet — add one below.",
                                ),
                              ),
                              this.renderSaleLines(r.coin, r.sales),
                              /* Buying and selling are the same two questions —
                               * how much, and for how much — so they are one form
                               * with a direction rather than two that look alike. */
                              React.createElement(
                                LotModeRow,
                                null,
                                React.createElement(
                                  LotModeBtn,
                                  {
                                    active: !selling && !receiving,
                                    onClick: () =>
                                      this.handleLotModeChange("buy"),
                                  },
                                  msg("po_bought", "Bought"),
                                ),
                                /* Coins that arrived without being bought —
                                   staking, a reward, an airdrop. Their value
                                   on arrival is income, and the cost of a
                                   later sale. */
                                React.createElement(
                                  LotModeBtn,
                                  {
                                    active: receiving,
                                    title: msg(
                                      "po_received_hint",
                                      "Record coins received as income — staking, a reward, an airdrop — at their value when they arrived",
                                    ),
                                    onClick: () =>
                                      this.handleLotModeChange("income"),
                                  },
                                  msg("po_received", "Received"),
                                ),
                                React.createElement(
                                  LotModeBtn,
                                  {
                                    active: selling,
                                    disabled: !(r.manualAmount > 0),
                                    title: !(r.manualAmount > 0)
                                      ? msg(
                                          "po_nothing_to_sell",
                                          "Nothing hand-entered to sell — a watched address reconciles itself from the chain",
                                        )
                                      : msg(
                                          "po_record_sale_hint",
                                          "Record a sale: takes the coins off, consumes the oldest purchases, and keeps the gain",
                                        ),
                                    onClick: () =>
                                      this.handleLotModeChange("sell"),
                                  },
                                  msg("po_sold", "Sold"),
                                ),
                                /* The day it happened, and the way into the
                                   whole holding — at the row's far end. */
                                React.createElement(
                                  LotModeEnd,
                                  null,
                                  React.createElement(LotDateInput, {
                                    type: "date",
                                    value: this.state.lotDate || lotToday(),
                                    max: lotToday(),
                                    "aria-label": selling
                                      ? msg("po_date_sold", "Date sold")
                                      : receiving
                                        ? msg("po_date_received", "Date received")
                                        : msg("po_date_bought", "Date bought"),
                                    title: msg(
                                      "po_date_hint",
                                      "The day it happened — a tax year and a holding period turn on it",
                                    ),
                                    onChange: this.handleLotDateChange,
                                  }),
                                  React.createElement(
                                    LotModeBtn,
                                    {
                                      "data-portfolio-details": r.coin,
                                      onClick: () => this.openAsset(r.coin),
                                      title: msg("po_asset_open_hint", "Open $1 in detail", r.coin),
                                    },
                                    msg("po_details", "Details"),
                                  ),
                                ),
                              ),
                              React.createElement(
                                LotForm,
                                null,
                                React.createElement(LotFormInput, {
                                  type: "text",
                                  inputMode: "decimal",
                                  value: this.state.lotAmount,
                                  "aria-invalid":
                                    this.state.numWarn === "lotAmount"
                                      ? "true"
                                      : "false",
                                  placeholder: msg(
                                    "po_amount_placeholder",
                                    "amount (e.g. 0.5 $1)",
                                    r.coin,
                                  ),
                                  "aria-label": selling
                                    ? msg("po_amount_sold", "Amount sold")
                                    : msg("po_lot_amount", "Lot amount"),
                                  onChange: this.handleLotAmountChange,
                                  onKeyDown: (e) =>
                                    this.handleLotKeyDown(r.coin, e),
                                }),
                                React.createElement(LotFormInput, {
                                  type: "text",
                                  inputMode: "decimal",
                                  value: this.state.lotPaid,
                                  "aria-invalid":
                                    this.state.numWarn === "lotPaid"
                                      ? "true"
                                      : "false",
                                  placeholder: selling
                                    ? msg(
                                        "po_received_placeholder",
                                        "received in total (e.g. 45000)",
                                      )
                                    : receiving
                                      ? msg(
                                          "po_income_placeholder",
                                          "worth when received (e.g. 120)",
                                        )
                                      : msg(
                                          "po_paid_placeholder",
                                          "paid in total (e.g. 15000)",
                                        ),
                                  "aria-label": selling
                                    ? msg("po_total_received", "Total received")
                                    : receiving
                                      ? msg("po_income_value", "Value when received")
                                      : msg(
                                          "po_lot_total_paid",
                                          "Lot total paid",
                                        ),
                                  onChange: this.handleLotPaidChange,
                                  onKeyDown: (e) =>
                                    this.handleLotKeyDown(r.coin, e),
                                }),
                                React.createElement(
                                  LotAddBtn,
                                  { onClick: () => this.handleLotAdd(r.coin) },
                                  selling || receiving
                                    ? msg("po_record", "Record")
                                    : msg("al_add", "Add"),
                                ),
                              ),
                              /* Borrowed rather than a second line: this note is
                                 under the two boxes the refusal came from, and it
                                 is empty almost all of the time. */
                              this.numberWarning("lotAmount", "lotPaid")
                                ? React.createElement(
                                    LotNote,
                                    null,
                                    this.numberWarning("lotAmount", "lotPaid"),
                                  )
                                : selling
                                  ? React.createElement(
                                      LotNote,
                                      null,
                                      msg(
                                        "po_sell_hint",
                                        "Takes the coins off your $1 and consumes the oldest purchases first. The gain is kept even after those purchases are gone.",
                                        r.coin,
                                      ),
                                    )
                                  : receiving &&
                                    React.createElement(
                                      LotNote,
                                      null,
                                      msg(
                                        "po_income_hint_grows",
                                        "Its value when it arrived is counted as income in the tax report, and is the cost of a later sale. The amount above grows by it, unless the amount you typed already counts these coins.",
                                      ),
                                    ),
                            ),

                            r.watches.map((w) =>
                              React.createElement(
                                SourceBlock,
                                { key: w.address },
                                React.createElement(
                                  SourceHead,
                                  null,
                                  React.createElement(
                                    SourceTitle,
                                    null,
                                    msg(
                                      "po_watched_address",
                                      "Watched address",
                                    ),
                                  ),
                                  React.createElement(
                                    SourceAmount,
                                    null,
                                    `${hidden ? MONEY_MASK : w.amount} ${r.coin}`,
                                  ),
                                  React.createElement(
                                    StopWatchBtn,
                                    {
                                      title: msg(
                                        "po_stop_sync_hint",
                                        "Stop syncing this address (its coins and purchases move to the hand-entered part)",
                                      ),
                                      "aria-label": msg(
                                        "po_stop_watch_aria",
                                        "Stop watching this $1 address",
                                        r.coin,
                                      ),
                                      onClick: () =>
                                        this.props.onUnwatch(r.coin, w.address),
                                    },
                                    msg("po_stop", "Stop"),
                                  ),
                                ),
                                React.createElement(
                                  SourceAddr,
                                  {
                                    title: msg(
                                      "po_watched_select",
                                      "Watched address (click to select)",
                                    ),
                                  },
                                  w.address,
                                ),
                                /* **Said where the address is, and only about
                                 * addresses that are on the list.** Nothing is
                                 * refused and nothing is hidden: this is
                                 * somebody's own holding, the check is a
                                 * comparison against a bundled government
                                 * list, and the only honest thing to do with
                                 * the answer is print it beside the address it
                                 * is about. The list's date is in the sentence
                                 * because a bundled list is a list as of a day
                                 * — see `src/sanctions.js`. */
                                isSanctionedAddress(w.address) &&
                                  React.createElement(
                                    SanctionNote,
                                    {
                                      title: msg(
                                        "po_sanctioned_hint",
                                        "The list is the US Treasury's own, bundled with this version and compared on this device — the address is not sent anywhere. It says an address was designated; it says nothing about any address that is not on it.",
                                      ),
                                    },
                                    msg(
                                      "po_sanctioned",
                                      "On the OFAC sanctions list published $1.",
                                      SANCTIONS_LIST_DATE,
                                    ),
                                  ),
                                this.renderLotLines(
                                  r.coin,
                                  w.lots,
                                  false,
                                  msg(
                                    "po_no_transfers",
                                    "No incoming transfers detected yet.",
                                  ),
                                ),
                              ),
                            ),

                            watched
                              ? React.createElement(
                                  LotNote,
                                  null,
                                  "Watched purchases are inferred from each address's transfer history: incoming transfers count as buys at that date's estimated price, outgoing transfers consume the oldest lots first.",
                                )
                              : lotAmt > 0 &&
                                  Math.abs(lotAmt - r.amount) > 1e-9 &&
                                  React.createElement(
                                    LotNote,
                                    null,
                                    msg(
                                      "po_lots_cover",
                                      "Lots cover $1 of $2 $3 — P/L is computed on the logged part.",
                                      hidden ? MONEY_MASK : lotAmt,
                                      hidden ? MONEY_MASK : r.amount,
                                      r.coin,
                                    ),
                                  ),
                          ),
                      );
                    }),
                  ),
                ),

            /* Between the list and the form: a removal happens in the list above
             * and an import at the tools below, and this is the one place both
             * can be seen from. */
            this.state.undo &&
              React.createElement(
                PortfolioUndoBar,
                null,
                React.createElement("span", null, this.state.undo.label),
                React.createElement(
                  PortfolioUndoBtn,
                  { onClick: this.handleUndo },
                  msg("set_undo", "Undo"),
                ),
              ),

            // Add holding
            React.createElement(
              AddSection,
              null,
              React.createElement(
                AddLabel,
                null,
                atCap
                  ? msg("po_limit_reached", "Holding limit reached")
                  : msg("po_add_holding", "Add a holding"),
              ),
              !atCap &&
                React.createElement(SearchInput, {
                  type: "text",
                  value: query,
                  placeholder: msg(
                    "po_search_coin",
                    "Search coin (e.g. BTC or Bitcoin)…",
                  ),
                  "aria-label": msg(
                    "po_search_coin_label",
                    "Search coin to add",
                  ),
                  onChange: this.handleSearchChange,
                }),
              !atCap &&
                suggestions.length > 0 &&
                React.createElement(
                  Suggestions,
                  null,
                  suggestions.map((sym) =>
                    React.createElement(
                      SuggestionRow,
                      {
                        key: sym,
                        type: "button",
                        onClick: () => this.handleAdd(sym),
                      },
                      React.createElement("span", null, sym),
                      React.createElement(
                        SuggestionName,
                        null,
                        COIN_NAMES[sym] || "",
                      ),
                      /* Priced by the sweep the app already makes, drawn by
                       * nothing: said here, on the row, rather than left to be
                       * discovered under an empty chart afterwards. */
                      isPricedOnlyCoin(sym) &&
                        React.createElement(
                          SuggestionTag,
                          {
                            title: msg(
                              "po_no_chart_hint",
                              "PriceTab can price this coin but no exchange it reads publishes a price history for it, so it is tracked in your holdings and left out of the value chart.",
                            ),
                          },
                          msg("po_no_chart", "no chart"),
                        ),
                    ),
                  ),
                ),
            ),

            // Watch an on-chain address (BTC/ETH/LTC/DOGE): the amount stays
            // synced to the address's public balance. Address goes only to the
            // balance provider, stored locally like everything else.
            React.createElement(
              AddSection,
              null,
              React.createElement(
                AddLabel,
                null,
                watchedChips.length
                  ? msg("po_watching_n", "Watching · $1", watchedChips.length)
                  : msg("po_watch_address", "Watch an address"),
              ),
              // Small standing summary of what's being synced; click a chip to
              // open that coin's breakdown
              watchedChips.length > 0 &&
                React.createElement(
                  WatchChips,
                  null,
                  watchedChips.map((c) =>
                    React.createElement(
                      WatchChip,
                      {
                        key: `${c.coin}-${c.address}`,
                        title: msg(
                          "po_watch_chip_title",
                          "$1 · $2 — click for the breakdown",
                          c.coin,
                          c.address,
                        ),
                        onClick: () => this.handleToggleLots(c.coin),
                      },
                      icon("link", 0.72),
                      React.createElement(WatchChipCoin, null, c.coin),
                      `${c.address.slice(0, 6)}…${c.address.slice(-4)}`,
                    ),
                  ),
                ),
              React.createElement(
                WatchRow,
                null,
                React.createElement(WatchInput, {
                  type: "text",
                  value: this.state.watchAddress,
                  placeholder: msg(
                    "po_paste_address",
                    "Paste any BTC, ETH, LTC, DOGE, BCH or ZEC address…",
                  ),
                  "aria-label": msg("po_address_label", "Address to watch"),
                  onChange: this.handleWatchAddressChange,
                  onKeyDown: this.handleWatchKeyDown,
                }),
                React.createElement(
                  WatchBtn,
                  {
                    onClick: this.handleWatchSubmit,
                    disabled: this.state.watchBusy,
                    title: msg(
                      "po_watch_note",
                      "Reads the address's public balances and keeps the holdings synced (checked every 10 minutes while the portfolio is open)",
                    ),
                  },
                  this.state.watchBusy ? "…" : "Watch",
                ),
              ),
              this.state.watchError &&
                React.createElement(
                  ImportError,
                  null,
                  this.watchErrorText(this.state.watchError),
                ),
              /* Answered while it is still in the box, before the button is
               * pressed: the check costs nothing (a set lookup against a list
               * that already shipped) and the moment it is worth knowing is
               * the moment the address is in front of you. It does not stop
               * the watch — this is a comparison against a public list, not a
               * verdict, and refusing would be this screen deciding something
               * it has no standing to decide. */
              isSanctionedAddress(this.state.watchAddress) &&
                React.createElement(
                  SanctionNote,
                  null,
                  msg(
                    "po_sanctioned",
                    "On the OFAC sanctions list published $1.",
                    SANCTIONS_LIST_DATE,
                  ) +
                    " " +
                    msg(
                      "po_sanctioned_hint",
                      "The list is the US Treasury's own, bundled with this version and compared on this device — the address is not sent anywhere. It says an address was designated; it says nothing about any address that is not on it.",
                    ),
                ),
            ),

            /* Which purchase a sale consumes. It lives here rather than in
             * Settings for the same reason the calls panel keeps its own switch:
             * this is the screen where the choice has a visible consequence, and
             * the report it governs is two rows below it. */
            holdings.length > 0 &&
              React.createElement(
                Fragment,
                null,
                React.createElement(
                  MethodRow,
                  null,
                  React.createElement(
                    MethodLabel,
                    null,
                    msg("po_cost_method", "Cost basis method"),
                  ),
                  ...COST_METHODS.map((m) =>
                    React.createElement(
                      MethodBtn,
                      {
                        key: m.value,
                        active: this.props.costMethod === m.value,
                        title: msg(
                          "po_method_line",
                          "$1 — $2",
                          m.title,
                          m.note,
                        ),
                        onClick: () =>
                          this.props.onCostMethodChange &&
                          this.props.onCostMethodChange(m.value),
                      },
                      m.label,
                    ),
                  ),
                ),
                React.createElement(
                  LotNote,
                  null,
                  `${methodTitle(this.props.costMethod)}. It decides which purchase the next sale consumes, and which is assumed gone when you reduce an amount by hand. Sales you have already recorded keep the method they were made with — the purchases they consumed are gone, so nothing here can honestly re-decide them.`,
                ),
              ),

            // Backup / restore / tax report. Import is always available (restore
            // on a fresh device); exports need something to export.
            React.createElement(
              ToolsRow,
              { empty: holdings.length === 0 },
              holdings.length > 0 &&
                React.createElement(
                  ToolBtn,
                  {
                    onClick: this.handleExportJson,
                    title: msg(
                      "po_export_hint",
                      "Download holdings as a JSON backup",
                    ),
                  },
                  msg("po_export", "Export JSON"),
                ),
              React.createElement(
                ToolBtn,
                {
                  empty: holdings.length === 0,
                  onClick: () => this.handleImportClick("replace"),
                  title: msg(
                    "po_import_hint",
                    "Restore holdings from a JSON backup (replaces the current list)",
                  ),
                },
                msg("po_import", "Import JSON"),
              ),
              /* Only with something to merge into: against an empty list this
               * button and the one beside it would do exactly the same thing, and
               * two controls with one behaviour is one of them lying. */
              holdings.length > 0 &&
                React.createElement(
                  ToolBtn,
                  {
                    onClick: () => this.handleImportClick("merge"),
                    title:
                      "Add holdings from a backup without touching the ones you already have. A coin already in the list is left exactly as it is, so merging the same file twice changes nothing the second time.",
                  },
                  msg("po_merge", "Merge JSON"),
                ),
              holdings.length > 0 &&
                React.createElement(
                  ToolBtn,
                  {
                    onClick: this.handleExportCsv,
                    title:
                      "Holdings, purchases and disposals with cost basis and gains — the record a tax return is worked out from, not the return itself. It knows only what you entered here: no exchange history, transfers, fees or crypto-to-crypto trades.",
                  },
                  msg("po_csv", "Cost basis report (CSV)"),
                ),
            ),
            React.createElement("input", {
              type: "file",
              accept: ".json,application/json",
              style: { display: "none" },
              ref: this.fileInput,
              onChange: this.handleImportFile,
            }),
            this.state.importError &&
              React.createElement(
                ImportError,
                null,
                msg(
                  "po_import_failed",
                  "Import failed — the file is not a valid PriceTab portfolio backup.",
                ),
              ),
            this.state.mergeNote &&
              React.createElement(LotNote, null, this.state.mergeNote),

            /* **The promise stays on the empty screen and leaves the full
             * one.** Somebody with nothing tracked is deciding whether to
             * type an address into a browser extension, and that is the
             * moment the sentence is worth a line of its own — it is the
             * only prose on that screen, and `tests/test-polish-render.js`
             * §14 holds it there. Once there are holdings it has been read,
             * and it is one press away under the "i" instead of under every
             * visit. */
            holdings.length === 0 &&
              React.createElement(
                PrivacyNote,
                { empty: true },
                msg(
                  "po_footer",
                  "Tracking only · no wallet connection · stored locally on this device. Watched addresses are used solely for public balance lookups.",
                ),
              ),
          ),
        ),
      ),
      /* Over the list, not instead of it — the holdings stay mounted, so
       * leaving and coming back costs nothing and loses nothing. */
      this.state.chartOpen &&
        built &&
        this.renderChartStage({
          built,
          costBasis,
          seriesDelta,
          seriesPct,
          periodLabel,
          coverage,
        }),
      this.state.assetOpen && this.renderAssetStage(rows, totalNow),
      this.state.taxOpen && this.renderTaxStage(totalNow),
    );
  }
}

Portfolio.defaultProps = {
  holdings: [],
  // Only for ranking: the coins you follow come first in the add search
  coinOptions: [],
  prices: {},
  ready: false,
  chartColorize: true,
  costMethod: DEFAULT_COST_METHOD,
};
