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
 * not (`docs/product/TODAY.md` §9.4). Nine textbook rules over 21,669 daily
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

const buildPortfolioSeries = (histories, holdings) => {
  const built = buildPortfolioParts(histories, holdings);
  return built ? built.series : null;
};

/* ── purchase lots ─────────────────────────────────────────────────────────
 * A lot is one purchase: { amount, paid, time, source }. Cost basis and P/L
 * come from lots; a holding without lots simply shows no P/L. Watched
 * addresses generate "chain" lots: every incoming transfer counts as a buy
 * at that date's price, outgoing transfers consume the oldest lots first.
 */
const lotsAmount = (lots) =>
  (lots || []).reduce((sum, l) => sum + l.amount, 0);

const lotsBasis = (lots) => (lots || []).reduce((sum, l) => sum + l.paid, 0);

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
const lotOrderFor = (lots, method) => {
  const order = (lots || []).map((_, i) => i);
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

const consumeLots = (lots, amount, method) => {
  let left = amount;
  let basis = 0;
  let covered = 0;
  const matched = [];
  for (const index of lotOrderFor(lots, method)) {
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
    });
  }
  return { basis, covered, matched };
};

// The name every existing caller used, kept as the FIFO case rather than
// rewritten at forty call sites
const consumeLotsFifo = (lots, amount) => consumeLots(lots, amount, "fifo");

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
  if (seen.length <= 1) return seen[0] || "another currency";
  return `${seen.slice(0, -1).join(", ")} and ${seen[seen.length - 1]}`;
};

/* "2 purchases", "1 purchase and 3 sales" — a count that says what was set
 * aside, since a purchase and a sale are set aside from different figures. */
const pausedCount = (row) => {
  const parts = [];
  const lots = row.paused.length;
  const sales = row.salesPaused.length;
  if (lots) parts.push(`${lots} purchase${lots > 1 ? "s" : ""}`);
  if (sales) parts.push(`${sales} sale${sales > 1 ? "s" : ""}`);
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
 * the rest, and `TODO.md` already declined country-specific tax computation
 * for exactly that reason. A calendar year is a fact this app can state; a tax
 * year is one it would be guessing at. */
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
    (s) =>
      (!currency || inCurrency(s, currency)) && saleRealized(s) != null,
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
  return `${m.label} — ${m.title.toLowerCase()}`;
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
const reduceLots = (lots, amount, method) => {
  let left = amount;
  const kept = new Map();
  for (const index of lotOrderFor(lots, method)) {
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
    kept.set(index, { ...lot, amount: keep, paid: lot.paid * (keep / lot.amount) });
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
    `# "Long term" here means held ${LONG_TERM_DAYS} days or more. That threshold is not the same in every country — check yours.`,
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
          lot.source === "chain" ? "chain (estimated)" : "manual",
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
      if (uncovered > AMOUNT_EPSILON) pair(uncovered, null, 0, "no purchase");
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
      drafts: {},
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
      watchError: false,
      expandedCoin: null, // coin whose lot editor is open
      lotAmount: "", // lot form drafts (one editor open at a time)
      lotPaid: "",
      lotMode: "buy", // "buy" | "sell" — the same two fields mean both
      sort: loadPortfolioSortFromStorage(), // holdings order (persisted)
      chartPeriod: loadPortfolioPeriodFromStorage(),
      histories: {}, // { COIN: [{ price, time }] } for the value chart
      // The chart brought forward: same series, given a scale, a crosshair and
      // the purchases and sales drawn where they happened
      chartOpen: false,
      chartStacked: loadPortfolioStackedFromStorage(),
    };
    this._chartToken = 0; // invalidates in-flight history loads
    this._chartSig = null; // last loaded coins|currency|period signature
    this._seriesMemo = null; // keeps the summed series referentially stable
    this._eventsMemo = null; // …and the marker list
    this._importErrTimer = null;
    this.fileInput = createRef();
    this.handleChartKey = this.handleChartKey.bind(this);
    this.toggleChart = this.toggleChart.bind(this);
    this.toggleStacked = this.toggleStacked.bind(this);
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

  componentDidUpdate() {
    this.maybeLoadHistories();
    this.measureAllocation();
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
    this._chartToken++; // drop any in-flight load's setState
    if (this._importErrTimer) clearTimeout(this._importErrTimer);
    if (this._mergeNoteTimer) clearTimeout(this._mergeNoteTimer);
    document.removeEventListener("keydown", this.handleChartKey, true);
  }

  handleChartKey(e) {
    if (e.key !== "Escape" || !this.state.chartOpen) return;
    e.stopPropagation();
    e.preventDefault();
    this.setState({ chartOpen: false });
  }

  toggleChart() {
    this.setState((prev) => ({ chartOpen: !prev.chartOpen }));
  }

  toggleStacked() {
    this.setState((prev) => {
      const chartStacked = !prev.chartStacked;
      savePortfolioStackedToStorage(chartStacked);
      return { chartStacked };
    });
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
    const rising = series[last].price >= series[0].price;
    return React.createElement(
      HoldingSpark,
      {
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
        up: rising,
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
          label: `COST ${this.fmtMoney(costBasis, false)}`,
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
    const { chartPeriod, chartStacked } = this.state;
    const series = built.series;
    return React.createElement(
      PortfolioStage,
      {
        /* Anywhere off the card puts the chart away. Esc did this and the
         * "Holdings" button did this, and both are things you have to know;
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
          React.createElement(PortfolioEyebrow, null, "Portfolio · Total value"),
          React.createElement(
            PortfolioTotal,
            {
              title: view.coverage
                ? `The value of the ${view.coverage.drawn} holdings on this chart. Your portfolio total covers all ${view.coverage.held}.`
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
        React.createElement(
          PortfolioStageChart,
          null,
          React.createElement(PortfolioChart, {
            series,
            parts: built.parts,
            events: this.chartEvents(series),
            costBasis: costBasis > 0 ? costBasis : null,
            period: chartPeriod,
            currency: this.props.currency,
            stacked: chartStacked,
            formatMoney: (v, sign) => this.fmtMoney(v, sign),
            formatAmount: (v) => this.fmtAmount(v),
          }),
        ),
        React.createElement(
          PortfolioStageFoot,
          null,
          React.createElement(PeriodSwitcher, {
            onChange: this.handlePeriodChange,
            options: PORTFOLIO_CHART_PERIODS,
            value: chartPeriod,
          }),
          React.createElement(
            PortfolioStageTools,
            null,
            React.createElement(PortfolioSortLabel, null, "Show"),
            React.createElement(
              PortfolioSortBtn,
              {
                active: !chartStacked,
                onClick: chartStacked ? this.toggleStacked : undefined,
                title: "One line: the total, on the range it actually moved in",
              },
              "Total",
            ),
            React.createElement(
              PortfolioSortBtn,
              {
                active: chartStacked,
                onClick: chartStacked ? undefined : this.toggleStacked,
                title:
                  "The coins the total is made of, stacked. The scale starts at zero — that is what makes the bands comparable",
              },
              "By coin",
            ),
            React.createElement(
              PortfolioChartBtn,
              {
                onClick: this.toggleChart,
                title: "Back to the holdings list (Esc)",
              },
              icon("portfolio", 0.85),
              React.createElement("span", null, "Holdings"),
            ),
          ),
        ),
        React.createElement(
          PortfolioStageNote,
          null,
          chartStacked
            ? "Bands add up to the line. The scale starts at zero, so the heights are comparable — which costs the zoom."
            : "Hover anywhere to read the total, what it was made of, and how far it sat above or below what you paid.",
        ),
      ),
    );
  }

  // Amounts are quantities, not money: enough digits to be true, none of the
  // trailing zeros a currency format would add
  fmtAmount(value) {
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
    const { currency, decimalPlaces, separatorFormat } = this.props;
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
        label: `Removed ${coin}${records ? " and everything logged against it" : ""}`,
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
    }));

  handleLotAmountChange = (e) => this.setState({ lotAmount: e.target.value });

  handleLotPaidChange = (e) => this.setState({ lotPaid: e.target.value });

  handleLotModeChange = (mode) =>
    this.setState({ lotMode: mode, lotAmount: "", lotPaid: "" });

  // The same two fields record both sides: how much, and for how much. Which
  // direction it is decides whether the second number is what you paid or
  // what you got, and that is the only difference between them.
  handleLotAdd = (coin) => {
    const amount = Number(this.state.lotAmount);
    const money = Number(this.state.lotPaid);
    if (!isFinite(amount) || amount <= 0) return;
    if (!isFinite(money) || money < 0) return;
    if (this.state.lotMode === "sell") {
      this.props.onAddSale(coin, amount, money);
    } else {
      this.props.onAddLot(coin, amount, money);
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
          `Sold ${Number(sale.amount.toPrecision(8))} ${coin} — ${this.fmtMoney(sale.received, false, sale.currency)}`,
        ),
        React.createElement(
          LotMeta,
          {
            title: paused
              ? `Recorded in ${sale.currency}. Its gain is left out of Realized while another currency is shown — switch to ${sale.currency} to include it.`
              : partial
              ? `Only ${Number(sale.basisAmount.toPrecision(6))} ${coin} of this sale had a purchase logged, so the gain covers that much of it`
              : realized == null
                ? "No purchase was logged for these coins, so there is no cost to set the proceeds against"
                : // Which purchases it ate, since one sale can span several
                  // bought on different days — the tax report pairs them out
                  (sale.matched || []).length > 1
                  ? `Proceeds less the cost of the ${sale.matched.length} purchases it consumed, oldest first. The tax report lists them as separate pairs, each with its own holding period.`
                  : "Proceeds less the cost of the purchase it consumed",
          },
          (sale.time > 0
            ? new Date(sale.time * 1000).toLocaleDateString()
            : "date unknown") +
            (realized == null
              ? " · no cost basis"
              : ` · ${realized >= 0 ? "+" : "−"}${this.fmtMoney(Math.abs(realized), false, sale.currency)}${partial ? " (part)" : ""}`) +
            (paused ? ` · ${sale.currency} · paused` : ""),
        ),
        React.createElement(
          RemoveBtn,
          {
            type: "button",
            "aria-label": `Remove this ${coin} sale`,
            title:
              "Remove this record. It does not give the coins back — adjust the amount if you need to.",
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
          `${lot.amount} ${coin} — ${this.fmtMoney(lot.paid, false, lot.currency)}`,
        ),
        React.createElement(
          LotMeta,
          {
            title: paused
              ? `Entered in ${lot.currency}. Its cost basis is left out of the P/L above while another currency is shown — switch to ${lot.currency} to include it.`
              : held == null
                ? undefined
                : `Held ${held} days — ${long ? "long term" : "short term"} at the ${LONG_TERM_DAYS}-day mark used in many places`,
          },
          (lot.time > 0
            ? new Date(lot.time * 1000).toLocaleDateString()
            : "date unknown") +
            (lot.source === "chain" ? " · ~on-chain" : "") +
            (long ? " · long" : "") +
            (paused ? ` · ${lot.currency} · paused` : ""),
        ),
        editable &&
          React.createElement(
            RemoveBtn,
            {
              type: "button",
              "aria-label": `Remove this ${coin} lot`,
              title: "Remove lot",
              onClick: () => this.props.onRemoveLot(coin, i),
            },
            "×",
          ),
      );
    });
  }

  /* ── address watching ── */

  handleWatchAddressChange = (e) =>
    this.setState({ watchAddress: e.target.value, watchError: false });

  handleWatchKeyDown = (e) => {
    if (e.key === "Enter") this.handleWatchSubmit();
  };

  handleWatchSubmit = async () => {
    const { watchAddress, watchBusy } = this.state;
    if (watchBusy || !watchAddress.trim()) return;
    this.setState({ watchBusy: true, watchError: false });
    // The address identifies its own chain — nothing to choose
    const ok = await this.props.onWatch(watchAddress);
    this.setState({
      watchBusy: false,
      watchError: !ok,
      watchAddress: ok ? "" : watchAddress,
    });
  };

  handleFieldChange = (coin, field, raw) => {
    const key = `${coin}:${field}`;
    this.setState((s) => ({ drafts: { ...s.drafts, [key]: raw } }));
    const num = Number(raw);
    if (raw !== "" && isFinite(num) && num >= 0) {
      this.commitField(coin, field, num);
    }
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
      ({ coin, amount, lots, watches, sales }) => ({
        coin,
        amount,
        lots,
        watches,
        sales,
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
    let ok = false;
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
            ? `Added ${merged.added} holding${merged.added > 1 ? "s" : ""} from the file`
            : `Replaced ${before.length} holding${before.length > 1 ? "s" : ""} with the file`,
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
        parts.push(`Added ${merged.added} holding${merged.added > 1 ? "s" : ""}`);
      }
      if (merged.kept) {
        parts.push(
          `${merged.kept} ${merged.kept > 1 ? "were" : "was"} already here and ${merged.kept > 1 ? "were" : "was"} left untouched`,
        );
      }
      if (merged.dropped) {
        parts.push(`${merged.dropped} did not fit — the list is full`);
      }
      this.setState({ mergeNote: parts.join(" · ") || "Nothing to add" });
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
      .filter((r) => typeof r.value === "number" && isFinite(r.value) && r.value > 0)
      .map((r) => ({ coin: r.coin, value: r.value, share: (r.value / totalNow) * 100 }))
      .sort((a, b) => b.value - a.value);
    if (!priced.length) return [];
    const named = [];
    let otherValue = 0;
    for (const p of priced) {
      if (named.length < PORTFOLIO_MAX_BANDS && p.share >= DONUT_MIN_SHARE) named.push(p);
      else otherValue += p.value;
    }
    const slices = named.map((p, i) => ({ ...p, tone: i }));
    if (otherValue > 0) {
      slices.push({
        coin: "Other",
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
          `${top.share >= 9.95 ? top.share.toFixed(0) : top.share.toFixed(1)}% in one holding`,
        ),
      ),
      React.createElement(
        AllocBar,
        {
          innerRef: (n) => (this.allocNode = n),
          role: "img",
          "aria-label":
            "Allocation: " +
            slices.map((s) => `${s.coin} ${s.share.toFixed(1)}%`).join(", "),
          onMouseLeave: () => this.setState({ allocAt: null }),
        },
        ...slices.map((slice, i) => {
          // A label only goes where it fits; everything else is named by the
          // list below, which carries the same ink
          const fits =
            width != null &&
            (slice.share / 100) * width >= ALLOC_LABEL_MIN_PX;
          return React.createElement(
            AllocSeg,
            {
              key: slice.coin,
              grow: slice.share,
              tone: slice.tone,
              dim: active != null && active !== i,
              tabIndex: 0,
              title: `${slice.coin} — ${slice.share.toFixed(1)}% of what you hold`,
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
    );
  }

  render() {
    const { holdings, ready } = this.props;
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
      React.createElement(
        PortfolioInner,
        null,
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
              React.createElement(PortfolioEyebrow, null, "Portfolio · Total value"),
          React.createElement(
            PortfolioTotal,
            null,
            !holdings.length || !anyPriced
              ? this.fmtMoney(0, false)
              : this.fmtMoney(totalNow, false),
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
                    ? `Over ${periodLabel.toLowerCase()}, across the ${coverage.drawn} holdings this chart can draw${coverage.share != null ? ` — ${coverage.share.toFixed(0)}% of your value` : ""}. The total above covers all ${coverage.held}.`
                    : undefined,
                },
                // fmtMoney(delta, true) already prints a +/- sign
                this.fmtMoney(seriesDelta, true) +
                  (seriesPct != null
                    ? ` (${seriesPct >= 0 ? "+" : ""}${seriesPct.toFixed(2)}%)`
                    : "") +
                  ` · ${periodLabel}` +
                  (coverage ? ` · ${coverage.drawn} of ${coverage.held}` : ""),
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
          ),
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
                        ? `Unrealized P/L vs what you paid — covers only the amounts you've logged a purchase for (${this.unloggedNote(rows)})`
                        : "Unrealized P/L vs what you paid") +
                      (pausedAny
                        ? ` · purchases entered in another currency are left out rather than converted — open a holding to see which`
                        : ""),
                  },
                  React.createElement(StatLabel, null, "Unrealized"),
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
                        ? " Sales recorded in another currency are left out rather than converted."
                        : ""),
                  },
                  React.createElement(StatLabel, null, "Realized"),
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
                  React.createElement(StatLabel, null, `vs ${BENCHMARK_COIN}`),
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
              /* The one thing the algorithm research left standing (§9.4):
               * rules cut the fall on 59 of 64 pairs and beat holding on 28.
               * So the honest number to put beside a portfolio is how far it
               * actually fell, not when to buy it. */
              drawdown != null &&
                React.createElement(
                  StatItem,
                  {
                    title:
                      `The deepest fall from a high to a later low inside this ${periodLabel.toLowerCase()} window` +
                      (drawdown.from && drawdown.to
                        ? ` — ${new Date(+drawdown.from).toLocaleDateString()} to ${new Date(+drawdown.to).toLocaleDateString()}`
                        : "") +
                      ". It says how bad this got, not how bad it can get.",
                  },
                  React.createElement(StatLabel, null, "Worst fall"),
                  React.createElement(
                    StatValue,
                    { up: false },
                    `${drawdown.pct.toFixed(1)}%`,
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
                  React.createElement(StatLabel, null, "Long term"),
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
                      `Gains and losses on sales you recorded between 1 January ${thisYear} and today. ` +
                      "This is the calendar year — the tax year ends on a different date in many countries, so check yours." +
                      (undatedSales
                        ? ` ${undatedSales} sale(s) have no date and are in neither year.`
                        : ""),
                  },
                  React.createElement(StatLabel, null, `Realized ${thisYear}`),
                  React.createElement(
                    StatValue,
                    { up: realizedThisYear === 0 ? null : realizedThisYear > 0 },
                    this.fmtMoney(realizedThisYear, true),
                  ),
                ),
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
                  React.createElement(StatLabel, null, "Best 24h"),
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
                  React.createElement(StatLabel, null, "Worst 24h"),
                  React.createElement(
                    StatValue,
                    { up: worst.change === 0 ? null : worst.change > 0 },
                    `${worst.coin} ${fmtPct(worst.change)}`,
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
              `The chart and the change beside the total cover ${coverage.drawn} of ${coverage.held} holdings` +
                (coverage.share != null
                  ? `, ${coverage.share.toFixed(0)}% of your value`
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
                ". The total above counts everything.",
            ),
          pausedAny &&
            React.createElement(
              LotNote,
              null,
              `Some purchases or sales were entered in another currency. They are shown in their own currency and left out of the figures above rather than converted — open a holding to see which, or switch back to that currency.`,
            ),
        ),

        // Chart range switcher (persisted; drives the value chart), and the
        // way into the chart itself
        holdings.length > 0 &&
          React.createElement(
            PortfolioPeriodRow,
            null,
            React.createElement(PeriodSwitcher, {
              onChange: this.handlePeriodChange,
              options: PORTFOLIO_CHART_PERIODS,
              value: chartPeriod,
            }),
            series &&
              React.createElement(
                PortfolioChartBtn,
                {
                  onClick: this.toggleChart,
                  title:
                    "Open the value chart — read it at any moment, with your purchases and sales on it",
                },
                icon("eye", 0.85),
                React.createElement("span", null, "Explore chart"),
              ),
          ),

        // Holdings list or empty state
        holdings.length === 0
          ? React.createElement(
              EmptyState,
              null,
              React.createElement(EmptyIcon, null, icon("portfolio", 1.8, 1.7)),
              "No holdings yet. Search a coin below to start tracking.",
              React.createElement(
                EmptyHint,
                null,
                "Amounts only — no wallet, no account, nothing leaves this device.",
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
                  `Holdings · ${holdings.length}`,
                ),
                holdings.length > 1 &&
                  React.createElement(
                    PortfolioSortBtns,
                    null,
                    React.createElement(PortfolioSortLabel, null, "Sort"),
                    ...PORTFOLIO_SORT_OPTIONS.map((option) =>
                      React.createElement(
                        PortfolioSortBtn,
                        {
                          key: option.value,
                          active: this.state.sort === option.value,
                          onClick: () => this.handleSortChange(option.value),
                          title:
                            option.value === "name"
                              ? "Alphabetical"
                              : `Largest ${option.label.toLowerCase()} first`,
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
                React.createElement("span", null, "Amount"),
                React.createElement("span", null, "Cost basis"),
                React.createElement("span", null, periodLabel),
                React.createElement("span", null, "Value"),
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
                    React.createElement(
                      HoldingCoin,
                      {
                        role: "button",
                        tabIndex: 0,
                        "aria-expanded": expanded,
                        title: watched
                          ? "Show where these coins came from and what you paid"
                          : "Show your purchases for this coin",
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
                        React.createElement(Chevron, { open: expanded }, "▶"),
                        r.coin,
                        watched &&
                          React.createElement(
                            WatchedBadge,
                            {
                              title: `${r.watches.length} watched address${r.watches.length > 1 ? "es" : ""}`,
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
                            title:
                              "Total across the hand-entered part and every watched address — click for the breakdown",
                            "aria-label": `${r.coin} total amount`,
                            onClick: () => this.handleToggleLots(r.coin),
                          },
                          String(r.amount),
                        )
                      : React.createElement(AmountInput, {
                          type: "text",
                          inputMode: "decimal",
                          value: amountVal,
                          "aria-label": `${r.coin} amount`,
                          onChange: (e) =>
                            this.handleFieldChange(
                              r.coin,
                              "amount",
                              e.target.value,
                            ),
                          onBlur: () => this.handleFieldBlur(r.coin, "amount"),
                        }),
                    React.createElement(
                      LotsBtn,
                      {
                        empty: basis <= 0,
                        open: expanded,
                        title:
                          basis <= 0 && r.paused.length
                            ? `Every purchase logged for ${r.coin} was entered in ${pausedCurrencies(r.paused)}. Switch to it to see this cost basis and its P/L.`
                            : watched
                              ? "Purchases inferred from the watched address — click to view"
                              : "Your purchases for this coin — click to view or add ('bought 0.5 for 15000')",
                        "aria-label": `${r.coin} purchase lots`,
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
                              title: "Unrealized P/L vs what you paid",
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
                        "aria-label": `Remove ${r.coin}`,
                        title:
                          "Remove this holding, its purchases and its recorded sales. Undoable until you close the portfolio.",
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
                            `${Number(r.unlogged.toPrecision(6))} ${r.coin} has no purchase logged, so it counts toward the value above but not toward the P/L.`,
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
                              "Added by hand",
                            ),
                            // Editable here only when the row's own amount
                            // cell is showing the multi-source total
                            watched
                              ? React.createElement(SourceAmountInput, {
                                  type: "text",
                                  inputMode: "decimal",
                                  value: amountVal,
                                  "aria-label": `${r.coin} hand-entered amount`,
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
                                  `${r.manualAmount} ${r.coin}`,
                                ),
                          ),
                          this.renderLotLines(
                            r.coin,
                            r.manualLots,
                            true,
                            "No purchases logged yet — add one below.",
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
                                active: selling === false,
                                onClick: () => this.handleLotModeChange("buy"),
                              },
                              "Bought",
                            ),
                            React.createElement(
                              LotModeBtn,
                              {
                                active: selling,
                                disabled: !(r.manualAmount > 0),
                                title: !(r.manualAmount > 0)
                                  ? "Nothing hand-entered to sell — a watched address reconciles itself from the chain"
                                  : "Record a sale: takes the coins off, consumes the oldest purchases, and keeps the gain",
                                onClick: () => this.handleLotModeChange("sell"),
                              },
                              "Sold",
                            ),
                          ),
                          React.createElement(
                            LotForm,
                            null,
                            React.createElement(LotFormInput, {
                              type: "text",
                              inputMode: "decimal",
                              value: this.state.lotAmount,
                              placeholder: `amount (e.g. 0.5 ${r.coin})`,
                              "aria-label": selling
                                ? "Amount sold"
                                : "Lot amount",
                              onChange: this.handleLotAmountChange,
                              onKeyDown: (e) => this.handleLotKeyDown(r.coin, e),
                            }),
                            React.createElement(LotFormInput, {
                              type: "text",
                              inputMode: "decimal",
                              value: this.state.lotPaid,
                              placeholder: selling
                                ? "received in total (e.g. 45000)"
                                : "paid in total (e.g. 15000)",
                              "aria-label": selling
                                ? "Total received"
                                : "Lot total paid",
                              onChange: this.handleLotPaidChange,
                              onKeyDown: (e) => this.handleLotKeyDown(r.coin, e),
                            }),
                            React.createElement(
                              LotAddBtn,
                              { onClick: () => this.handleLotAdd(r.coin) },
                              selling ? "Record" : "Add",
                            ),
                          ),
                          selling &&
                            React.createElement(
                              LotNote,
                              null,
                              `Takes the coins off your ${r.coin} and consumes the oldest purchases first. The gain is kept even after those purchases are gone.`,
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
                                "Watched address",
                              ),
                              React.createElement(
                                SourceAmount,
                                null,
                                `${w.amount} ${r.coin}`,
                              ),
                              React.createElement(
                                StopWatchBtn,
                                {
                                  title:
                                    "Stop syncing this address (its coins and purchases move to the hand-entered part)",
                                  "aria-label": `Stop watching this ${r.coin} address`,
                                  onClick: () =>
                                    this.props.onUnwatch(r.coin, w.address),
                                },
                                "Stop",
                              ),
                            ),
                            React.createElement(
                              SourceAddr,
                              { title: "Watched address (click to select)" },
                              w.address,
                            ),
                            this.renderLotLines(
                              r.coin,
                              w.lots,
                              false,
                              "No incoming transfers detected yet.",
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
                                `Lots cover ${lotAmt} of ${r.amount} ${r.coin} — P/L is computed on the logged part.`,
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
              "Undo",
            ),
          ),

        // Add holding
        React.createElement(
          AddSection,
          null,
          React.createElement(
            AddLabel,
            null,
            atCap ? "Holding limit reached" : "Add a holding",
          ),
          !atCap &&
            React.createElement(SearchInput, {
              type: "text",
              value: query,
              placeholder: "Search coin (e.g. BTC or Bitcoin)…",
              "aria-label": "Search coin to add",
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
              ? `Watching · ${watchedChips.length}`
              : "Watch an address",
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
                    title: `${c.coin} · ${c.address} — click for the breakdown`,
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
              placeholder: "Paste any BTC, ETH, LTC, DOGE, BCH or ZEC address…",
              "aria-label": "Address to watch",
              onChange: this.handleWatchAddressChange,
              onKeyDown: this.handleWatchKeyDown,
            }),
            React.createElement(
              WatchBtn,
              {
                onClick: this.handleWatchSubmit,
                disabled: this.state.watchBusy,
                title:
                  "Reads the address's public balances and keeps the holdings synced (checked every 10 minutes while the portfolio is open)",
              },
              this.state.watchBusy ? "…" : "Watch",
            ),
          ),
          this.state.watchError &&
            React.createElement(
              ImportError,
              null,
              "Nothing found for that address — check it, or it may hold no balance we can read.",
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
              React.createElement(MethodLabel, null, "Cost basis method"),
              ...COST_METHODS.map((m) =>
                React.createElement(
                  MethodBtn,
                  {
                    key: m.value,
                    active: this.props.costMethod === m.value,
                    title: `${m.title} — ${m.note}`,
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
          null,
          holdings.length > 0 &&
            React.createElement(
              ToolBtn,
              {
                onClick: this.handleExportJson,
                title: "Download holdings as a JSON backup",
              },
              "Export JSON",
            ),
          React.createElement(
            ToolBtn,
            {
              onClick: () => this.handleImportClick("replace"),
              title: "Restore holdings from a JSON backup (replaces the current list)",
            },
            "Import JSON",
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
              "Merge JSON",
            ),
          holdings.length > 0 &&
            React.createElement(
              ToolBtn,
              {
                onClick: this.handleExportCsv,
                title:
                  "Holdings, purchases and disposals with cost basis and gains — the record a tax return is worked out from, not the return itself. It knows only what you entered here: no exchange history, transfers, fees or crypto-to-crypto trades.",
              },
              "Cost basis report (CSV)",
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
            "Import failed — the file is not a valid PriceTab portfolio backup.",
          ),
        this.state.mergeNote &&
          React.createElement(LotNote, null, this.state.mergeNote),

        React.createElement(
          PrivacyNote,
          null,
          "Tracking only · no wallet connection · stored locally on this device. Watched addresses are used solely for public balance lookups.",
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
