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

// Sum per-coin histories into one total-value series. Series are aligned from
// the end (latest points line up); the range trims to the shortest history so
// a young coin can't fabricate a pre-listing portfolio value.
const buildPortfolioSeries = (histories, holdings) => {
  const parts = [];
  for (const h of holdings) {
    const amount = holdingAmount(h);
    if (!(amount > 0)) continue;
    const prices = histories[h.coin];
    if (Array.isArray(prices) && prices.length > 1) {
      parts.push({ amount, prices });
    }
  }
  if (!parts.length) return null;
  const len = Math.min(...parts.map((p) => p.prices.length));
  if (len < 2) return null;
  const base = parts[0].prices;
  const series = [];
  for (let i = 0; i < len; i++) {
    let total = 0;
    for (const p of parts) {
      total += p.prices[p.prices.length - len + i].price * p.amount;
    }
    series.push({ price: total, time: base[base.length - len + i].time });
  }
  return series;
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

// rows = computeTotals().rows: [{ coin, amount, lots, price, value }].
// Summary per coin from its lots, then every lot as its own line — the part
// a tax return actually needs (dated purchases with what was paid).
const buildPortfolioCsv = (rows, currency) => {
  const lines = [
    `# PriceTab portfolio report — ${new Date().toISOString().slice(0, 10)} — prices in ${currency}`,
    "Coin,Name,Amount,Cost basis,Avg cost,Current price,Current value,Unrealized P/L,P/L %",
  ];
  let totalBasis = 0;
  let totalValue = 0;
  for (const r of rows) {
    const lotAmt = lotsAmount(r.lots);
    const basis = lotAmt > 0 ? lotsBasis(r.lots) : null;
    const avgCost = basis != null && lotAmt > 0 ? basis / lotAmt : null;
    // P/L covers the lotted amount (you may hold more than you've logged)
    const pl = basis != null && r.price != null ? r.price * lotAmt - basis : null;
    const plPct = pl != null && basis > 0 ? (pl / basis) * 100 : null;
    if (basis != null && r.price != null) {
      totalBasis += basis;
      totalValue += r.price * lotAmt;
    }
    lines.push(
      [
        r.coin,
        csvField(COIN_NAMES[r.coin] || r.coin),
        r.amount,
        basis != null ? basis : "",
        avgCost != null ? avgCost : "",
        r.price != null ? r.price : "",
        r.value != null ? r.value : "",
        pl != null ? pl : "",
        plPct != null ? plPct.toFixed(2) : "",
      ].join(","),
    );
  }
  if (totalBasis > 0) {
    const totalPl = totalValue - totalBasis;
    lines.push(
      `Total,,,${totalBasis},,,${totalValue},${totalPl},${((totalPl / totalBasis) * 100).toFixed(2)}`,
    );
  }
  const lotLines = [];
  for (const r of rows) {
    for (const lot of r.lots || []) {
      lotLines.push(
        [
          r.coin,
          lot.amount,
          lot.paid,
          lot.time > 0
            ? new Date(lot.time * 1000).toISOString().slice(0, 10)
            : "",
          lot.source === "chain" ? "chain (estimated)" : "manual",
        ].join(","),
      );
    }
  }
  if (lotLines.length) {
    lines.push("", "Purchase lots", "Coin,Amount,Paid,Date,Source");
    lines.push(...lotLines);
  }
  lines.push(
    "# Informational only — not tax advice. Chain-sourced lots use estimated historical prices.",
  );
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

// Quiet secondary stats under the headline (24h P/L, best/worst mover).
// Values wear the trend colors; labels stay in the eyebrow's quiet voice.
const PortfolioStats = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1.2rem;
  margin-top: 0.6rem;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const StatItem = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  white-space: nowrap;
`;

const StatLabel = styled.span`
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.62rem;
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
`;

// Section labels between the header and the lists — same voice as the eyebrow
const PortfolioSectionLabel = styled.div`
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin: 1.5rem 0 0.6rem;
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
  grid-template-columns: auto 1fr 6.5rem 6.5rem 1fr auto;
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
    grid-template-columns: auto 1fr 6rem 1fr auto;
  }
`;

// Column labels above the list (matches HoldingRow's grid; the mark, coin
// and remove columns stay unlabeled). Hidden on narrow screens with the
// cost column.
const HoldingsHead = styled.div`
  display: grid;
  grid-template-columns: auto 1fr 6.5rem 6.5rem 1fr auto;
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
  margin-left: 0.35rem;
  font-size: 0.75rem;
  line-height: 1;
  color: ${({ theme }) => theme.color.textSecondary};
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

const WatchSelect = styled.select`
  padding: 0.7rem 0.6rem;
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.85rem;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.bgSecondary};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s ease;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.borderHover};
  }
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
      watchCoin: "BTC",
      watchAddress: "",
      watchBusy: false,
      watchError: false,
      expandedCoin: null, // coin whose lot editor is open
      lotAmount: "", // lot form drafts (one editor open at a time)
      lotPaid: "",
      chartPeriod: loadPortfolioPeriodFromStorage(),
      histories: {}, // { COIN: [{ price, time }] } for the background chart
    };
    this._chartToken = 0; // invalidates in-flight history loads
    this._chartSig = null; // last loaded coins|currency|period signature
    this._seriesMemo = null; // keeps the summed series referentially stable
    this._importErrTimer = null;
    this.fileInput = createRef();
  }

  componentDidMount() {
    this.maybeLoadHistories();
  }

  componentDidUpdate() {
    this.maybeLoadHistories();
  }

  componentWillUnmount() {
    this._chartToken++; // drop any in-flight load's setState
    if (this._importErrTimer) clearTimeout(this._importErrTimer);
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
    const coins = this.chartCoins();
    const token = ++this._chartToken;
    if (!coins.length) {
      this.setState({ histories: {} });
      return;
    }
    const histories = {};
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

  // Memoized on (histories, holdings) refs so re-renders from typing don't
  // hand the Line a new array and restart its path transition.
  totalSeries() {
    const { holdings } = this.props;
    const { histories } = this.state;
    const memo = this._seriesMemo;
    if (memo && memo.histories === histories && memo.holdings === holdings) {
      return memo.series;
    }
    const series = buildPortfolioSeries(histories, holdings);
    this._seriesMemo = { histories, holdings, series };
    return series;
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
    const rows = holdings.map((h) => {
      const p = prices[h.coin];
      const price = p && isFinite(p.price) ? p.price : null;
      const amount = holdingAmount(h); // manual + every watched address
      const lots = holdingLots(h);
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
          // P/L covers the lotted amount, which may differ from the holding
          costValueNow += price * lotsAmount(lots);
        }
      }
      return {
        ...h,
        amount, // total across sources (h.amount stays the manual part)
        manualAmount: h.amount,
        lots, // combined; h.lots stays the manual part
        manualLots: h.lots,
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
    return { rows, totalNow, pnl, pnlPct, anyPriced, unrealized, unrealizedPct };
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
    }));

  handleLotAmountChange = (e) => this.setState({ lotAmount: e.target.value });

  handleLotPaidChange = (e) => this.setState({ lotPaid: e.target.value });

  handleLotAdd = (coin) => {
    const amount = Number(this.state.lotAmount);
    const paid = Number(this.state.lotPaid);
    if (!isFinite(amount) || amount <= 0) return;
    if (!isFinite(paid) || paid < 0) return;
    this.props.onAddLot(coin, amount, paid);
    this.setState({ lotAmount: "", lotPaid: "" });
  };

  handleLotKeyDown = (coin, e) => {
    if (e.key === "Enter") this.handleLotAdd(coin);
  };

  // One source's purchase lines. Only hand-entered lots are removable —
  // watched ones are the chain's record, not ours to edit.
  renderLotLines(coin, lots, editable, emptyText) {
    if (!lots.length) return React.createElement(LotMeta, null, emptyText);
    return lots.map((lot, i) =>
      React.createElement(
        LotLine,
        { key: `${lot.time}-${i}` },
        React.createElement(
          "span",
          null,
          `${lot.amount} ${coin} — ${this.fmtMoney(lot.paid, false)}`,
        ),
        React.createElement(
          LotMeta,
          null,
          (lot.time > 0
            ? new Date(lot.time * 1000).toLocaleDateString()
            : "date unknown") + (lot.source === "chain" ? " · ~on-chain" : ""),
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
      ),
    );
  }

  /* ── address watching ── */

  handleWatchCoinChange = (e) => this.setState({ watchCoin: e.target.value });

  handleWatchAddressChange = (e) =>
    this.setState({ watchAddress: e.target.value, watchError: false });

  handleWatchKeyDown = (e) => {
    if (e.key === "Enter") this.handleWatchSubmit();
  };

  handleWatchSubmit = async () => {
    const { watchCoin, watchAddress, watchBusy } = this.state;
    if (watchBusy || !watchAddress.trim()) return;
    this.setState({ watchBusy: true, watchError: false });
    const ok = await this.props.onWatch(watchCoin, watchAddress);
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
    const data = this.props.holdings.map(({ coin, amount, lots, watches }) => ({
      coin,
      amount,
      lots,
      watches,
    }));
    downloadTextFile(
      `pricetab-portfolio-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(data, null, 2),
      "application/json",
    );
  };

  handleExportCsv = () => {
    const { rows } = this.computeTotals();
    downloadTextFile(
      `pricetab-tax-report-${new Date().toISOString().slice(0, 10)}.csv`,
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
    const { rows, totalNow, pnl, pnlPct, anyPriced, unrealized, unrealizedPct } =
      this.computeTotals();
    const suggestions = this.matches();
    const atCap = holdings.length >= PORTFOLIO_MAX_HOLDINGS;

    // Background chart series + its first→last change over the chart period
    const series = this.totalSeries();
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
      null,
      // Total-value chart, full-bleed behind everything (decorative)
      series &&
        React.createElement(
          PortfolioChartBg,
          { "aria-hidden": true },
          React.createElement(Line, {
            prices: series,
            colorize: this.props.chartColorize,
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
          (show24h || best || unrealized != null) &&
            React.createElement(
              PortfolioStats,
              null,
              unrealized != null &&
                React.createElement(
                  StatItem,
                  { title: "Unrealized P/L vs your entered average costs" },
                  React.createElement(StatLabel, null, "P/L"),
                  React.createElement(
                    StatValue,
                    { up: unrealized === 0 ? null : unrealized > 0 },
                    this.fmtMoney(unrealized, true) +
                      (unrealizedPct != null
                        ? ` (${fmtPct(unrealizedPct)})`
                        : ""),
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

        // Chart range switcher (persisted; drives the background chart)
        holdings.length > 0 &&
          React.createElement(
            PortfolioPeriodRow,
            null,
            React.createElement(PeriodSwitcher, {
              onChange: this.handlePeriodChange,
              options: PORTFOLIO_CHART_PERIODS,
              value: chartPeriod,
            }),
          ),

        // Holdings list or empty state
        holdings.length === 0
          ? React.createElement(
              EmptyState,
              null,
              React.createElement(EmptyIcon, null, "💼"),
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
                PortfolioSectionLabel,
                null,
                `Holdings · ${holdings.length}`,
              ),
              React.createElement(
                HoldingsHead,
                { "aria-hidden": true },
                React.createElement("span", null, ""),
                React.createElement("span", null, ""),
                React.createElement("span", null, "Amount"),
                React.createElement("span", null, "Cost basis"),
                React.createElement("span", null, "Value"),
                React.createElement("span", null, ""),
              ),
              React.createElement(
                HoldingsList,
                null,
                rows.map((r) => {
                  const watched = r.watches.length > 0;
                  const amountDraft = drafts[`${r.coin}:amount`];
                  const amountVal =
                    amountDraft !== undefined
                      ? amountDraft
                      : String(r.manualAmount);
                  const basis = lotsBasis(r.lots);
                  const lotAmt = lotsAmount(r.lots);
                  const expanded = this.state.expandedCoin === r.coin;
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
                    coinMark(r.coin, 1.6),
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
                            r.watches.length > 1
                              ? `⛓${r.watches.length}`
                              : "⛓",
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
                          React.createElement(
                            LotForm,
                            null,
                            React.createElement(LotFormInput, {
                              type: "text",
                              inputMode: "decimal",
                              value: this.state.lotAmount,
                              placeholder: `amount (e.g. 0.5 ${r.coin})`,
                              "aria-label": "Lot amount",
                              onChange: this.handleLotAmountChange,
                              onKeyDown: (e) => this.handleLotKeyDown(r.coin, e),
                            }),
                            React.createElement(LotFormInput, {
                              type: "text",
                              inputMode: "decimal",
                              value: this.state.lotPaid,
                              placeholder: "paid in total (e.g. 15000)",
                              "aria-label": "Lot total paid",
                              onChange: this.handleLotPaidChange,
                              onKeyDown: (e) => this.handleLotKeyDown(r.coin, e),
                            }),
                            React.createElement(
                              LotAddBtn,
                              { onClick: () => this.handleLotAdd(r.coin) },
                              "Add",
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
                                "⛓ Watched address",
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
                  React.createElement(WatchChipCoin, null, c.coin),
                  `⛓ ${c.address.slice(0, 6)}…${c.address.slice(-4)}`,
                ),
              ),
            ),
          React.createElement(
            WatchRow,
            null,
            React.createElement(
              WatchSelect,
              {
                value: this.state.watchCoin,
                onChange: this.handleWatchCoinChange,
                "aria-label": "Coin for the watched address",
              },
              Object.keys(WATCH_CHAINS).map((sym) =>
                React.createElement("option", { key: sym, value: sym }, sym),
              ),
            ),
            React.createElement(WatchInput, {
              type: "text",
              value: this.state.watchAddress,
              placeholder: "Public address (read-only balance lookup)…",
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
                  "Reads the address's public balance and keeps the holding's amount synced (checked every 10 minutes while the portfolio is open)",
              },
              this.state.watchBusy ? "…" : "Watch",
            ),
          ),
          this.state.watchError &&
            React.createElement(
              ImportError,
              null,
              "Couldn't read that address — check the coin and the address, then try again.",
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
                  "Download a CSV with cost basis and unrealized P/L per coin — informational only, not tax advice",
              },
              "Tax report (CSV)",
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
    );
  }
}

Portfolio.defaultProps = {
  holdings: [],
  prices: {},
  ready: false,
  chartColorize: true,
};
