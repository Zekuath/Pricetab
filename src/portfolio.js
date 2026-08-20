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

/* Sum per-coin histories into one total-value series, and keep the parts.
 *
 * Series are aligned from the end (latest points line up); the range trims to
 * the shortest history so a young coin can't fabricate a pre-listing portfolio
 * value.
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
  const len = Math.min(...held.map((p) => p.prices.length));
  if (len < 2) return null;
  const base = held[0].prices;
  const series = [];
  const values = held.map(() => []);
  for (let i = 0; i < len; i++) {
    let total = 0;
    for (let k = 0; k < held.length; k++) {
      const p = held[k];
      const v = p.prices[p.prices.length - len + i].price * p.amount;
      values[k].push(v);
      total += v;
    }
    series.push({ price: total, time: base[base.length - len + i].time });
  }
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
const consumeLotsFifo = (lots, amount) => {
  let left = amount;
  let basis = 0;
  let covered = 0;
  const matched = [];
  for (const lot of lots || []) {
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

const salesRealized = (sales) =>
  (sales || []).reduce((sum, s) => {
    const r = saleRealized(s);
    return r == null ? sum : sum + r;
  }, 0);

const hasRealized = (sales) =>
  (sales || []).some((s) => saleRealized(s) != null);

// Below this, a difference between what you hold and what you've logged is
// double-precision residue from adding fractions, not a real remainder
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
 * FIFO decides which lots survive: the oldest are the ones disposed of first,
 * so what remains is the newest.
 */
const heldLots = (lots, amount) => {
  const total = lotsAmount(lots);
  if (!(total > amount + AMOUNT_EPSILON)) return lots || [];
  return reduceLotsFifo(lots || [], total - amount);
};

// Remove `amount` from the oldest lots first (FIFO), shrinking a partially
// consumed lot's paid proportionally. Returns a new array.
const reduceLotsFifo = (lots, amount) => {
  let left = amount;
  const out = [];
  for (const lot of lots) {
    if (left <= 0) {
      out.push(lot);
      continue;
    }
    if (lot.amount <= left) {
      left -= lot.amount; // fully consumed
      continue;
    }
    const keep = lot.amount - left;
    out.push({
      ...lot,
      amount: keep,
      paid: lot.paid * (keep / lot.amount),
    });
    left = 0;
  }
  return out;
};

// Replay chronological balance deltas into lots: buys become lots priced by
// priceAt(timeSec) (0 paid when the price is unknown), spends reduce FIFO.
const buildLotsFromDeltas = (deltas, priceAt) => {
  let lots = [];
  for (const { time, delta } of deltas || []) {
    if (delta > 0) {
      const price = priceAt(time);
      lots.push({
        amount: delta,
        paid: price != null ? price * delta : 0,
        time,
        source: "chain",
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
const buildPortfolioCsv = (rows, currency) => {
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

  for (const r of rows) {
    const lots = r.lots || [];
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
    if (hasRealized(r.sales)) {
      totalRealized += salesRealized(r.sales);
      anyRealized = true;
    }
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
    `# All amounts in ${currency}. Cost basis is FIFO: within a coin, the oldest purchase is consumed first.`,
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
      const d = describeLot(lot, c.r.price, nowMs);
      lotLines.push(
        [
          c.r.coin,
          lot.time > 0
            ? new Date(lot.time * 1000).toISOString().slice(0, 10)
            : "",
          num(lot.amount),
          num(lot.paid),
          num(d.unitCost),
          num(c.r.price),
          num(d.value),
          num(d.gain),
          num(d.gainPct, 2),
          d.held == null ? "" : d.held,
          d.longTerm == null ? "unknown" : d.longTerm ? "long" : "short",
          lot.source === "chain" ? "chain (estimated)" : "manual",
        ].join(","),
      );
    }
  }
  if (lotLines.length) {
    lines.push(
      "",
      "Purchase lots",
      "Coin,Date acquired,Amount,Paid,Cost per unit,Current price,Current value,Unrealized gain,Gain %,Days held,Term,Source",
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
      "Coin,Date acquired,Date sold,Amount,Proceeds,Cost basis,Gain,Gain %,Days held,Term,Source",
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

/* ── styled components ─────────────────────────────────────────────────── */
// Same entrance family as SettingsCard's panelLift / WidgetCard's widgetAppear
const portfolioFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const portfolioLift = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
`;

const PortfolioShell = styled.section`
  position: fixed;
  inset: 0;
  z-index: 100;
  overflow-y: auto;
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  padding: 4.5rem 1.25rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: ${portfolioFadeIn} 0.3s ease;
`;

// Full-bleed total-value chart behind the content. Fixed so the list scrolls
// over it; muted opacity keeps the header/rows readable on top. The entrance
// must end at the same opacity the element rests at — fading to 1 would flash
// bright, then visibly dim when the animation hands back to the static style.
const portfolioChartIn = keyframes`
  from { opacity: 0; }
  to { opacity: 0.45; }
`;

const PortfolioChartBg = styled.div`
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.45;
  animation: ${portfolioChartIn} 0.6s ease;
`;

const PortfolioInner = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 760px;
  animation: ${portfolioLift} 0.4s cubic-bezier(0.22, 1, 0.36, 1);
`;

/* ── the chart brought forward ─────────────────────────────────────────────
 * Laid over the list rather than replacing it: the holdings stay mounted
 * underneath, so coming back costs no refetch, loses no scroll position and
 * keeps whatever row was open still open. It is opaque because the thing
 * behind it is a wall of text, and a chart you are trying to read through a
 * table is the problem this screen exists to fix.
 */
const PortfolioStage = styled.div`
  position: fixed;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4.5rem 1.25rem 1.5rem;
  background: ${({ theme }) => theme.color.bg};
  animation: ${portfolioFadeIn} 0.25s ease;
`;

const PortfolioStageInner = styled.div`
  width: 100%;
  max-width: 1100px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

// `min-height: 0` all the way down, or a flex child refuses to shrink and the
// x-axis band ends up below the fold with the container growing a scrollbar
const PortfolioStageChart = styled.div`
  flex: 1;
  min-height: 15rem;
  margin-top: 0.75rem;
`;

const PortfolioStageFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.6rem 1rem;
  margin-top: 0.9rem;
`;

const PortfolioStageTools = styled.div`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
`;

// A hint that says what the toggle costs, rather than leaving it to be
// discovered when the axis stops zooming
const PortfolioStageNote = styled.div`
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.5rem;
`;

const PortfolioHeader = styled.div`
  margin-bottom: 1.5rem;
`;

// Mirrors SettingsGroupTitle's label treatment (size + tracking)
const PortfolioEyebrow = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.35rem;
`;

const PortfolioTotal = styled.div`
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1.1;
`;

const PortfolioDelta = styled.div`
  margin-top: 0.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: ${({ theme, up }) =>
    up == null
      ? theme.color.textSecondary
      : up
        ? theme.color.chartLineGreen
        : theme.color.chartLineRed};
`;

/* Stats under the headline, in two tiers.
 *
 * They used to be one flat run of equal-weight chips, which worked at three
 * and stopped working at seven: ~950px of content in a 760px column, wrapping
 * into two lines of 10px uppercase with nothing to tell you where to look
 * first. Now the two results — what you have made, realized and not — lead at
 * a readable size, and everything that qualifies them sits in a quiet grid
 * underneath. The grid also aligns them into columns instead of letting them
 * run together at whatever width each happens to be.
 */
const PortfolioStatsLead = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.6rem;
  margin-top: 0.75rem;
`;

const PortfolioStats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
  gap: 0.35rem 1.2rem;
  margin-top: 0.7rem;
  padding-top: 0.7rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const StatItem = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  white-space: nowrap;
  /* The lead tier stacks its label above the value, so the two figures read
     as headlines rather than as two more entries in a list */
  ${({ lead }) =>
    lead &&
    css`
      flex-direction: column;
      align-items: flex-start;
      gap: 0.1rem;
      font-size: 1.05rem;
    `}
`;

const StatLabel = styled.span`
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.62rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const StatValue = styled.span`
  font-weight: 600;
  color: ${({ theme, up }) =>
    up == null
      ? theme.color.text
      : up
        ? theme.color.chartLineGreen
        : theme.color.chartLineRed};
`;

// Pulls the (generously padded) PeriodSwitcher into the portfolio's rhythm
const PortfolioPeriodRow = styled.div`
  margin: -1.25rem 0 -0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
`;

// Section labels between the header and the lists — same voice as the eyebrow
const PortfolioSectionLabel = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin: 1.5rem 0 0.6rem;
`;

/* The list's heading and its order control share a line: the control belongs
 * to the list it reorders, not to the page. Same shape as the coin list's
 * sort row in Settings, so the two read as the same gesture. */
const PortfolioSortRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.4rem 0.75rem;
  margin: 1.5rem 0 0.6rem;
`;

const PortfolioSortBtns = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  flex-wrap: wrap;
`;

const PortfolioSortLabel = styled.span`
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-right: 0.1rem;
`;

const PortfolioSortBtn = styled.button.attrs(() => ({ type: "button" }))`
  padding: 0.15rem 0.45rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  color: ${({ theme, active }) =>
    active ? theme.color.bg : theme.color.textSecondary};
  background: ${({ theme, active }) =>
    active ? theme.color.text : "transparent"};
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

// The same pill as the sort buttons, given room for an icon beside its label
const PortfolioChartBtn = styled(PortfolioSortBtn)`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  font-size: 0.68rem;
`;

const HoldingsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const HoldingRow = styled.div`
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 6.5rem 6.5rem 4.5rem 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.color.bgSecondary};
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr 6rem 1fr auto;
  }
`;

// Column labels above the list (matches HoldingRow's grid; the coin and
// remove columns stay unlabeled). Hidden on narrow screens with the cost
// column.
const HoldingsHead = styled.div`
  display: grid;
  grid-template-columns: 1fr 6.5rem 6.5rem 4.5rem 1fr auto;
  gap: 0.75rem;
  padding: 0 0.85rem;
  margin-bottom: 0.4rem;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};

  & > span {
    text-align: right;
  }

  @media (max-width: 560px) {
    display: none;
  }
`;

/* Per-row trend. The histories are already fetched for the background chart
 * (the twelve biggest by value), so for most rows this costs nothing and the
 * rest simply show no curve rather than a placeholder. It carries no numbers
 * — the change and the value are printed right beside it — so it is doing the
 * one thing a number can't: showing the shape of how it got there. */
const HoldingSpark = styled.svg`
  display: block;
  width: 100%;
  height: 1.6rem;
  overflow: visible;
  /* The polyline strokes currentColor, so the theme reaches it here rather
     than through a withTheme wrapper the component does not otherwise need */
  color: ${({ theme, up }) =>
    up ? theme.color.chartLineGreen : theme.color.chartLineRed};

  @media (max-width: 560px) {
    display: none;
  }
`;

const HoldingSparkCell = styled.div`
  min-width: 0;

  @media (max-width: 560px) {
    display: none;
  }
`;

// Allocation meter: a thin accent underline whose width is this holding's
// share of the portfolio. Single neutral accent (the chart-line blue) so the
// palette stays monochrome + trend colors; the exact share is printed next to
// the coin name.
const HoldingShareBar = styled.div`
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  border-radius: 0 1px 0 0;
  background: ${({ theme }) => theme.color.chartLine};
  opacity: 0.55;
  transition: width 0.3s ease;
`;

// Clicking the coin opens/closes the row's source + purchases breakdown
const HoldingCoin = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  cursor: pointer;
  user-select: none;

  /* HoldingSym inherits this; HoldingName sets its own colour */
  &:hover {
    color: ${({ theme }) => theme.color.chartLine};
  }
`;

const Chevron = styled.span`
  display: inline-block;
  margin-right: 0.35rem;
  font-size: 0.6rem;
  color: ${({ theme }) => theme.color.textSecondary};
  transform: rotate(${({ open }) => (open ? "90deg" : "0deg")});
  transition: transform 0.15s ease;
`;

const HoldingSym = styled.div`
  font-weight: 700;
  font-size: 0.95rem;
`;

const HoldingName = styled.div`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AmountInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  text-align: right;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 7px;
  transition: border-color 0.15s ease;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

// Cost-basis cell: a button that opens the row's purchase-lot editor.
// Styled like the inputs so the grid reads as one family; hidden on narrow
// screens (amount wins the space).
const LotsBtn = styled.button.attrs(() => ({ type: "button" }))`
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  text-align: right;
  color: ${({ theme, empty }) =>
    empty ? theme.color.textSecondary : theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid
    ${({ theme, open }) => (open ? theme.color.borderHover : theme.color.border)};
  border-radius: 7px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  @media (max-width: 560px) {
    display: none;
  }
`;

// Expanded lot editor: spans the whole row under the grid columns
const LotsPanel = styled.div`
  grid-column: 1 / -1;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  margin-top: 0.25rem;
  padding-top: 0.6rem;
`;

const LotLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.2rem 0;
  font-size: 0.78rem;
`;

const LotMeta = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.7rem;
`;

// Bought / Sold. Same visual language as the targets panel's kind toggle —
// the two features ask the user the same shape of question.
const LotModeRow = styled.div`
  display: flex;
  gap: 0.3rem;
  margin-top: 0.5rem;
`;

const LotModeBtn = styled.button.attrs(() => ({ type: "button" }))`
  padding: 0.2rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  color: ${({ theme, active }) =>
    active ? theme.color.bg : theme.color.textSecondary};
  background: ${({ theme, active }) =>
    active ? theme.color.text : "transparent"};
  border: 1px solid
    ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const LotForm = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const LotFormInput = styled(AmountInput)`
  flex: 1;
  text-align: left;
`;

const LotAddBtn = styled.button.attrs(() => ({ type: "button" }))`
  padding: 0 0.9rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.78rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 7px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const LotNote = styled.div`
  margin-top: 0.45rem;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Marker next to the coin symbol showing the row is fed by watched
// addresses (the whole coin cell opens the breakdown, so this is inert)
const WatchedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  margin-left: 0.35rem;
  line-height: 1;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const WatchedBadgeCount = styled.span`
  font-size: 0.6rem;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
`;

/* Compact chips summarising every watched address, so what's being synced
 * is visible at a glance; clicking one opens that coin's breakdown. */
const WatchChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.6rem;
`;

const WatchChip = styled.button.attrs(() => ({ type: "button" }))`
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  color: ${({ theme }) => theme.color.textSecondary};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

const WatchChipCoin = styled.span`
  font-weight: 700;
  color: ${({ theme }) => theme.color.text};
`;

/* Source breakdown inside the expanded row: one block per source (the
 * manual part first, then each watched address) so it's obvious which
 * coins came from where. */
const SourceBlock = styled.div`
  padding: 0.5rem 0;
  border-top: 1px solid ${({ theme }) => theme.color.border};

  &:first-child {
    border-top: none;
    padding-top: 0;
  }
`;

const SourceHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
`;

const SourceTitle = styled.div`
  min-width: 0;
  font-size: 0.74rem;
  font-weight: 600;
`;

const SourceAmount = styled.div`
  flex: 0 0 auto;
  font-size: 0.74rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

// Amount cell for rows fed by watched addresses: the column keeps showing
// the coin's total, and clicking opens the breakdown (the hand-entered part
// is edited inside the accordion).
const AmountTotalBtn = styled.button.attrs(() => ({ type: "button" }))`
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  text-align: right;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bg};
  border: 1px dashed ${({ theme }) => theme.color.border};
  border-radius: 7px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

// Manual-amount field inside the accordion (only shown when the row also
// has watched sources — otherwise the row's own input handles it)
const SourceAmountInput = styled(AmountInput)`
  flex: 0 0 7rem;
`;

const SourceAddr = styled.div`
  margin-top: 0.15rem;
  font-size: 0.66rem;
  color: ${({ theme }) => theme.color.textSecondary};
  word-break: break-all;
  user-select: all;
`;

const StopWatchBtn = styled.button.attrs(() => ({ type: "button" }))`
  flex: 0 0 auto;
  padding: 0.3rem 0.7rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 7px;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.chartLineRed};
    border-color: ${({ theme }) => theme.color.chartLineRed};
  }
`;

const HoldingValue = styled.div`
  text-align: right;
  min-width: 0;
`;

const HoldingValueMain = styled.div`
  font-weight: 600;
  font-size: 0.9rem;
`;

const HoldingValueSub = styled.div`
  font-size: 0.72rem;
  color: ${({ theme, up }) =>
    up == null
      ? theme.color.textSecondary
      : up
        ? theme.color.chartLineGreen
        : theme.color.chartLineRed};

  @media (max-width: 560px) {
    display: none;
  }
`;

// Circular hover treatment, same as SettingsClose
const RemoveBtn = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  width: 1.7rem;
  height: 1.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  &:hover {
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.chartLineRed};
  }
`;

const AddSection = styled.div`
  margin-top: 1.5rem;
  position: relative;
`;

// Same eyebrow voice as the section labels (AddSection provides the margin)
const AddLabel = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-bottom: 0.6rem;
`;

const SearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 0.7rem 0.85rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.9rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  transition: border-color 0.15s ease;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
`;

/* Address watching: coin picker + address field + submit, one row */
const WatchRow = styled.div`
  display: flex;
  gap: 0.5rem;
`;


const WatchInput = styled(SearchInput)`
  width: auto;
  flex: 1;
`;

const WatchBtn = styled.button.attrs(() => ({ type: "button" }))`
  padding: 0 1rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderHover};
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const Suggestions = styled.div`
  margin-top: 0.4rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bgSecondary};
  box-shadow: 0 2px 8px ${({ theme }) => theme.color.shadow};
  animation: ${portfolioLift} 0.25s cubic-bezier(0.22, 1, 0.36, 1);
`;

const SuggestionRow = styled.button`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 0.6rem 0.85rem;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease;
  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.color.bg};
  }
`;

const SuggestionName = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.78rem;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 2.75rem 1.5rem;
  color: ${({ theme }) => theme.color.textSecondary};
  border: 1px dashed ${({ theme }) => theme.color.border};
  border-radius: 12px;
  font-size: 0.9rem;
`;

const EmptyIcon = styled.div`
  font-size: 1.6rem;
  margin-bottom: 0.75rem;
`;

const EmptyHint = styled.div`
  margin-top: 0.4rem;
  font-size: 0.75rem;
`;

// Backup / restore / report actions — quiet text buttons in the eyebrow voice
const ToolsRow = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin-top: 1.5rem;
`;

const ToolBtn = styled.button.attrs(() => ({ type: "button" }))`
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

const ImportError = styled.div`
  margin-top: 0.5rem;
  font-size: 0.72rem;
  text-align: center;
  color: ${({ theme }) => theme.color.chartLineRed};
`;

const PrivacyNote = styled.div`
  margin-top: 1.5rem;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
  text-align: center;
`;

/* ── component ─────────────────────────────────────────────────────────── */
class Portfolio extends PureComponent {
  constructor(props) {
    super(props);
    // `drafts` holds in-progress input text (keyed "COIN:amount" /
    // "COIN:cost") so typing "0." / "" never fights the canonical numeric
    // value coming back from the parent.
    this.state = {
      query: "",
      drafts: {},
      importError: false,
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
  }

  componentWillUnmount() {
    this._chartToken++; // drop any in-flight load's setState
    if (this._importErrTimer) clearTimeout(this._importErrTimer);
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
   * Aligned from the end and trimmed to the shorter of the two, exactly the
   * way the portfolio series aligns its own parts — otherwise a benchmark
   * with more history than the portfolio would be measured over a longer
   * window and quietly win (or lose) on span rather than on performance.
   */
  benchmarkPct(series) {
    const bench = this.state.histories[BENCHMARK_COIN];
    if (!series || !Array.isArray(bench) || bench.length < 2) return null;
    const len = Math.min(series.length, bench.length);
    if (len < 2) return null;
    const first = bench[bench.length - len].price;
    const last = bench[bench.length - 1].price;
    if (!(first > 0) || !isFinite(last)) return null;
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
            null,
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

  fmtMoney(value, withSign) {
    const { currency, decimalPlaces, separatorFormat } = this.props;
    return formatNumberString(
      value,
      getCurrencySymbol(currency),
      !withSign,
      false,
      decimalPlaces,
      separatorFormat,
    );
  }

  // Derive totals + per-holding values from the shared price map
  computeTotals() {
    const { holdings, prices } = this.props;
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
    const nowMs = Date.now();
    const rows = holdings.map((h) => {
      const p = prices[h.coin];
      const price = p && isFinite(p.price) ? p.price : null;
      const amount = holdingAmount(h); // manual + every watched address
      const allLots = holdingLots(h);
      // Never let cost basis cover coins that are gone — see `heldLots`
      const lots = heldLots(allLots, amount);
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
        const basis = lotsBasis(lots);
        if (basis > 0) {
          costBasis += basis;
          // P/L covers the lotted amount, which may still be less than the
          // holding — you can hold coins you never logged a purchase for
          costValueNow += price * lotsAmount(lots);
        }
        for (const lot of lots) {
          const held = lotHeldDays(lot, nowMs);
          if (held == null) continue; // no date, no holding period
          datedValue += price * lot.amount;
          if (held >= LONG_TERM_DAYS) longTermValue += price * lot.amount;
        }
      }
      const lotAmt = lotsAmount(lots);
      const realized = salesRealized(h.sales);
      if (hasRealized(h.sales)) {
        realizedTotal += realized;
        anyRealized = true;
      }
      return {
        ...h,
        amount, // total across sources (h.amount stays the manual part)
        manualAmount: h.amount,
        lots, // the lots still held; h.lots stays the manual part
        manualLots: heldLots(h.lots, h.amount),
        lotAmount: lotAmt,
        sales: h.sales || [],
        realized: hasRealized(h.sales) ? realized : null,
        /* What you hold beyond what you've logged a purchase for. The row's
         * value covers everything; its P/L can only cover this much less —
         * so the difference has to be sayable rather than left as a silent
         * mismatch between two numbers on the same line. */
        unlogged:
          Math.max(0, amount - lotAmt) > AMOUNT_EPSILON ? amount - lotAmt : 0,
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
        const basis = lotsBasis(r.lots);
        return basis > 0 && r.price != null
          ? r.price * lotsAmount(r.lots) - basis
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
      return React.createElement(
        LotLine,
        { key: `sale-${sale.time}-${i}` },
        React.createElement(
          "span",
          null,
          `Sold ${Number(sale.amount.toPrecision(8))} ${coin} — ${this.fmtMoney(sale.received, false)}`,
        ),
        React.createElement(
          LotMeta,
          {
            title: partial
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
              : ` · ${realized >= 0 ? "+" : "−"}${this.fmtMoney(Math.abs(realized), false)}${partial ? " (part)" : ""}`),
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
      return React.createElement(
        LotLine,
        { key: `${lot.time}-${i}` },
        React.createElement(
          "span",
          null,
          `${lot.amount} ${coin} — ${this.fmtMoney(lot.paid, false)}`,
        ),
        React.createElement(
          LotMeta,
          {
            title:
              held == null
                ? undefined
                : `Held ${held} days — ${long ? "long term" : "short term"} at the ${LONG_TERM_DAYS}-day mark used in many places`,
          },
          (lot.time > 0
            ? new Date(lot.time * 1000).toLocaleDateString()
            : "date unknown") +
            (lot.source === "chain" ? " · ~on-chain" : "") +
            (long ? " · long" : ""),
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
      buildPortfolioCsv(rows, this.props.currency),
      "text/csv",
    );
  };

  handleImportClick = () => {
    if (this.fileInput.current) this.fileInput.current.click();
  };

  handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    let ok = false;
    try {
      ok = this.props.onImport(JSON.parse(await file.text())) === true;
    } catch (err) {
      ok = false; // unreadable / invalid JSON
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

  // Coin matches for the add search: symbol or full name, excluding held coins
  matches() {
    const q = this.state.query.trim().toUpperCase();
    if (!q) return [];
    const held = new Set(this.props.holdings.map((h) => h.coin));
    return SUGGESTED_COINS.filter((sym) => {
      if (held.has(sym)) return false;
      const name = (COIN_NAMES[sym] || "").toUpperCase();
      return sym.includes(q) || name.includes(q);
    }).slice(0, 8);
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
      costBasis,
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
                { up: seriesDelta === 0 ? null : seriesDelta > 0 },
                // fmtMoney(delta, true) already prints a +/- sign
                this.fmtMoney(seriesDelta, true) +
                  (seriesPct != null
                    ? ` (${seriesPct >= 0 ? "+" : ""}${seriesPct.toFixed(2)}%)`
                    : "") +
                  ` · ${periodLabel}`,
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
                    title: this.unloggedNote(rows)
                      ? `Unrealized P/L vs what you paid — covers only the amounts you've logged a purchase for (${this.unloggedNote(rows)})`
                      : "Unrealized P/L vs what you paid",
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
                      "Gains and losses on sales you've recorded — proceeds less the cost of the purchases each sale consumed, oldest first. Unlike the figure beside it, this one is settled.",
                  },
                  React.createElement(StatLabel, null, "Realized"),
                  React.createElement(
                    StatValue,
                    { up: realized === 0 ? null : realized > 0 },
                    this.fmtMoney(realized, true),
                  ),
                ),
            ),
          (show24h || best || benchGap != null || longTermPct != null) &&
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
                  React.createElement(
                    StatValue,
                    { up: benchGap === 0 ? null : benchGap > 0 },
                    `${benchGap >= 0 ? "+" : "−"}${Math.abs(benchGap).toFixed(1)} pts`,
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
                  const basis = lotsBasis(r.lots);
                  const lotAmt = lotsAmount(r.lots);
                  const expanded = this.state.expandedCoin === r.coin;
                  // Which side the open editor is recording
                  const selling = expanded && this.state.lotMode === "sell";
                  // Unrealized P/L over the lotted amount (needs a price)
                  const rowPl =
                    basis > 0 && r.price != null
                      ? r.price * lotAmt - basis
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
                        title: watched
                          ? "Purchases inferred from the watched address — click to view"
                          : "Your purchases for this coin — click to view or add ('bought 0.5 for 15000')",
                        "aria-label": `${r.coin} purchase lots`,
                        onClick: () => this.handleToggleLots(r.coin),
                      },
                      basis > 0
                        ? this.fmtMoney(basis, false)
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
                        title: "Remove",
                        onClick: () => this.props.onRemove(r.coin),
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
              onClick: this.handleImportClick,
              title: "Restore holdings from a JSON backup (replaces the current list)",
            },
            "Import JSON",
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
        }),
    );
  }
}

Portfolio.defaultProps = {
  holdings: [],
  prices: {},
  ready: false,
  chartColorize: true,
};
