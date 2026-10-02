/* THE PORTFOLIO'S LEDGER VIEWS — one holding in detail, everything recorded
 * in date order, and the return month by month (28 Sep 2026). The tax
 * screen that grew beside them is its own file now: `tax-guide.js`.
 *
 * Asked for as *"portföy kısmını da detaylandıralım"*, with the four views
 * chosen by the owner: an asset detail page, performance analysis, an
 * activity timeline and income records — and beside them the country report
 * (`tax-report.js`). They read the records the portfolio already keeps and
 * add none of their own, so nothing here can disagree with the holdings list:
 * a purchase is a lot, a sale is a sale with the slices it consumed, and an
 * income receipt is a lot with `kind: "income"` whose `paid` is its value
 * when it arrived.
 *
 * Attached to `Portfolio` as `Object.assign(this, portfolioLedger(this))`,
 * the idiom every cut out of a large component uses — `view` is the
 * component, never `this`. The pure functions above the factory are what
 * the tests read. */

// How many of the latest records the activity list shows before "Show all"
const LEDGER_ACTIVITY_SHORT = 8;
// The months grid stops here; older months are counted in its note
const LEDGER_MONTHS_MAX = 24;
const LEDGER_DAY = 86400;

/* ── records, in date order ────────────────────────────────────────────── */

/* Every purchase, receipt, transfer in and sale a holding list has recorded,
 * newest first.
 *
 * A purchase that has been sold since is no longer a lot — `reduceLots` took
 * it away — and survives only as the slices the sale consumed. So purchases
 * are put back together from both: the part still held and every slice of
 * it, merged on what makes them one purchase (coin, source, kind, day and
 * unit price; a slice's cost is pro-rata, so its unit price is the lot's).
 * Undated records cannot be placed on a timeline; they are counted, not
 * dropped in silence. */
const ledgerEvents = (holdings) => {
  const dated = [];
  let undated = 0;
  for (const h of holdings || []) {
    const buys = new Map();
    const addBuy = (x) => {
      if (!(x.amount > 0)) return;
      const unit = x.money / x.amount;
      const key = `${x.kind}|${x.source}|${x.time}|${x.currency || ""}|${unit.toPrecision(9)}`;
      const prev = buys.get(key);
      if (prev) {
        prev.amount += x.amount;
        prev.money += x.money;
      } else buys.set(key, { ...x });
    };
    const kindOf = (lot) => (lot.kind === "income" ? "income" : lot.source === "chain" ? "chain" : "buy");
    for (const lot of h.lots || []) {
      addBuy({ kind: kindOf(lot), source: lot.source === "chain" ? "chain" : "manual", coin: h.coin, time: lot.time || 0, amount: lot.amount, money: lot.paid || 0, currency: lot.currency || null });
    }
    for (const w of h.watches || []) {
      for (const lot of w.lots || []) {
        addBuy({ kind: kindOf({ ...lot, source: "chain" }), source: "chain", coin: h.coin, time: lot.time || 0, amount: lot.amount, money: lot.paid || 0, currency: lot.currency || null });
      }
    }
    for (const sale of h.sales || []) {
      for (const m of sale.matched || []) {
        addBuy({ kind: kindOf(m), source: m.source === "chain" ? "chain" : "manual", coin: h.coin, time: m.acquired || 0, amount: m.amount, money: m.cost || 0, currency: sale.currency || null });
      }
      if (!(sale.amount > 0)) continue;
      const entry = { kind: "sell", coin: h.coin, time: sale.time || 0, amount: sale.amount, money: sale.received || 0, currency: sale.currency || null, gain: saleRealized(sale), method: sale.method || "fifo" };
      if (entry.time > 0) dated.push(entry);
      else undated += 1;
    }
    for (const b of buys.values()) {
      if (b.time > 0) dated.push(b);
      else undated += 1;
    }
  }
  const order = { sell: 0, income: 1, chain: 2, buy: 3 };
  dated.sort((a, b) => b.time - a.time || order[a.kind] - order[b.kind] || (a.coin < b.coin ? -1 : 1));
  return { events: dated, undated };
};

/* ── the return, with the money moved in and out taken out of it ──────── */

/* How much of a holding, at a moment, arrived as income (staking, a reward,
 * an airdrop) — held still, or sold after `tSec`. The same two places
 * `heldAmountAt` reads, filtered to receipts. */
const ledgerIncomeAt = (h, tSec, lots) => {
  let amount = 0;
  for (const lot of lots || []) {
    if (lot.kind === "income" && lot.time > 0 && lot.time <= tSec) amount += lot.amount;
  }
  for (const sale of h.sales || []) {
    if (!(sale.time > tSec)) continue;
    for (const m of sale.matched || []) {
      if (m.kind === "income" && m.acquired > 0 && m.acquired <= tSec) amount += m.amount;
    }
  }
  return amount;
};

/* **The time-weighted return, step by step, of what was actually held.**
 *
 * The "As held" series rises when a purchase arrives, and a purchase is not
 * a gain. Each step here splits the change in value into the part the
 * prices made and the part that was coins arriving or leaving: the change in
 * each coin's amount across the step, valued at the step's closing price, is
 * a flow — money in, or out — and comes off before the step's return is
 * taken. A receipt of income is *not* a flow: coins that arrived without
 * being paid for are what the holding earned.
 *
 * Flows are valued at the market, not at what was paid, so the figure is
 * the holdings' own performance — what they did while held — and it needs
 * no exchange rate: a purchase recorded in dollars moves the amount held,
 * and the amount is all this reads. Same holdings, lots and windows as
 * `buildHeldParts`, so the steps are the chart's steps. */
const ledgerSteps = (histories, holdings, method) => {
  const held = [];
  for (const h of holdings || []) {
    if (!(holdingAmount(h) > 0)) continue;
    const prices = histories && histories[h.coin];
    if (Array.isArray(prices) && prices.length > 1) {
      held.push({ h, prices, lots: heldLots(holdingLots(h), holdingAmount(h), method || DEFAULT_COST_METHOD) });
    }
  }
  if (!held.length) return null;
  const all = held.map((p) => p.prices);
  const window = commonWindow(all);
  if (!window) return null;
  const times = alignedTimes(all, window);
  if (!times || times.length < 2) return null;
  const sec = (t) => Math.floor(+t / 1000);
  const cols = [];
  for (const p of held) {
    const px = sampleSeriesAt(p.prices, times);
    if (!px) return null;
    cols.push(times.map((t, i) => ({ px: px[i], amt: heldAmountAt(p.h, sec(t), p.lots), inc: ledgerIncomeAt(p.h, sec(t), p.lots) })));
  }
  const steps = [];
  for (let i = 1; i < times.length; i++) {
    let before = 0;
    let after = 0;
    let flow = 0;
    for (const c of cols) {
      before += c[i - 1].px * c[i - 1].amt;
      after += c[i].px * c[i].amt;
      flow += (c[i].amt - c[i - 1].amt - (c[i].inc - c[i - 1].inc)) * c[i].px;
    }
    // Nothing held at the step's start: there is no return to take yet
    if (!(before > 0)) continue;
    const r = (after - flow) / before - 1;
    if (Number.isFinite(r)) steps.push({ time: +times[i], r });
  }
  return { steps, from: +times[0], to: +times[times.length - 1] };
};

/* The steps chained into calendar months (UTC) and into the whole range.
 * A month the series starts inside, or one not over yet, is marked
 * `partial` — its figure is real, but it is not the month's. */
const ledgerMonths = (run, nowMs) => {
  if (!run || !run.steps.length) return null;
  const months = new Map();
  let whole = 1;
  for (const s of run.steps) {
    const d = new Date(s.time);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    const m = months.get(key) || { key, year: d.getUTCFullYear(), month: d.getUTCMonth(), growth: 1, steps: 0 };
    m.growth *= 1 + s.r;
    m.steps += 1;
    months.set(key, m);
    whole *= 1 + s.r;
  }
  const list = [...months.values()].sort((a, b) => a.key - b.key);
  const start = new Date(run.from);
  const now = new Date(nowMs);
  for (const m of list) {
    m.r = m.growth - 1;
    const first = m.key === start.getUTCFullYear() * 12 + start.getUTCMonth() && (start.getUTCDate() > 1 || start.getUTCHours() > 0);
    const current = m.key === now.getUTCFullYear() * 12 + now.getUTCMonth();
    m.partial = first || current;
  }
  const full = list.filter((m) => !m.partial);
  const best = full.length ? full.reduce((a, b) => (b.r > a.r ? b : a)) : null;
  const worst = full.length ? full.reduce((a, b) => (b.r < a.r ? b : a)) : null;
  return { months: list, whole: whole - 1, best, worst, up: full.filter((m) => m.r > 0).length, full: full.length };
};

/* ── one holding ───────────────────────────────────────────────────────── */

/* The figures the asset page leads with, from the row `computeTotals` built
 * — so they are the list's own figures and cannot disagree with it. Money
 * only from records in the currency on screen; the rest are counted. */
const ledgerAssetFacts = (row, currency, nowSec) => {
  const priced = row.priced || [];
  const basis = lotsBasis(priced);
  const amt = lotsAmount(priced);
  let income = 0;
  let receipts = 0;
  let longAmount = 0;
  let datedAmount = 0;
  let first = 0;
  for (const lot of row.lots || []) {
    if (lot.time > 0) {
      datedAmount += lot.amount;
      if (taxHeldOverAYear(lot.time, nowSec)) longAmount += lot.amount;
      if (!first || lot.time < first) first = lot.time;
    }
    if (lot.kind === "income" && inCurrency(lot, currency)) {
      income += lot.paid || 0;
      receipts += 1;
    }
  }
  for (const sale of row.sales || []) {
    for (const m of sale.matched || []) {
      if (m.acquired > 0 && (!first || m.acquired < first)) first = m.acquired;
      if (m.kind === "income" && inCurrency(sale, currency)) {
        income += m.cost || 0;
        receipts += 1;
      }
    }
  }
  return {
    basis,
    average: amt > 0 && basis > 0 ? basis / amt : null,
    unrealized: basis > 0 && row.price > 0 ? row.price * amt - basis : null,
    income: receipts ? income : null,
    receipts,
    longShare: datedAmount > 0 ? longAmount / datedAmount : null,
    first: first || null,
  };
};

/* ── words ─────────────────────────────────────────────────────────────── */

const ledgerKindLabel = (kind) =>
  kind === "sell"
    ? msg("po_kind_sold", "Sold")
    : kind === "income"
      ? msg("po_kind_received", "Received")
      : kind === "chain"
        ? msg("po_kind_transfer", "Transfer in")
        : msg("po_kind_bought", "Bought");

const ledgerDate = (sec) => (sec > 0 ? new Date(sec * 1000).toLocaleDateString() : "—");

const ledgerMonthLabel = (m) =>
  new Date(Date.UTC(m.year, m.month, 1)).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

const ledgerPct = (r) => `${signedFixed(r * 100, 1)}%`;

const ledgerTone = (v) => (v > 0 ? "up" : v < 0 ? "down" : null);

/* ── the component's half ──────────────────────────────────────────────── */

/* One table, head and records: `cells` are text or elements, or
 * `{ v, tone, title }` for a figure with a sign or a note. Every cell is
 * named by its column (`data-label`), which is what lets a phone lay a
 * record out as a card; `flat` keeps a two-column list a list. */
const ledgerTable = (gridCols, heads, rows, flat) =>
  React.createElement(
    LedgerTable,
    { gridCols, flat },
    heads &&
      React.createElement(
        "div",
        { "data-head": "true" },
        heads.map((h, i) => React.createElement("span", { key: i, "data-left": h.left ? "true" : undefined }, h.label)),
      ),
    rows.map((row) =>
      React.createElement(
        "div",
        { key: row.key, "data-strong": row.strong ? "true" : undefined },
        row.cells.map((raw, i) => {
          const c = raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "v") ? raw : { v: raw };
          const props = {
            key: i,
            "data-label": heads ? heads[i].label : undefined,
            "data-left": heads && heads[i].left ? "true" : undefined,
            title: c.title,
          };
          return c.tone !== undefined
            ? React.createElement(LedgerTone, { ...props, tone: c.tone }, c.v)
            : React.createElement("span", props, c.v);
        }),
      ),
    ),
  );

const portfolioLedger = (view) => ({
  /* ── activity ── */

  ledgerData() {
    const { holdings } = view.props;
    const memo = view._ledgerMemo;
    if (memo && memo.holdings === holdings) return memo.data;
    const data = ledgerEvents(holdings);
    view._ledgerMemo = { holdings, data };
    return data;
  },

  renderActivity() {
    const { events, undated } = view.ledgerData();
    if (!events.length && !undated) return null;
    const all = view.state.activityAll;
    const shown = all ? events : events.slice(0, LEDGER_ACTIVITY_SHORT);
    return React.createElement(
      LedgerPanel,
      { "data-portfolio-activity": "true" },
      React.createElement(
        LedgerPanelHead,
        null,
        React.createElement("span", null, msg("po_activity", "Activity")),
        events.length > LEDGER_ACTIVITY_SHORT &&
          React.createElement(
            LedgerChip,
            {
              active: all,
              "aria-pressed": all ? "true" : "false",
              onClick: () => view.setState((s) => ({ activityAll: !s.activityAll })),
            },
            all ? msg("po_activity_fewer", "Latest only") : msg("po_activity_all", "Show all $1", String(events.length)),
          ),
      ),
      shown.length > 0 &&
        ledgerTable(
          "minmax(9ch, auto) minmax(12ch, 1fr) minmax(8ch, auto) minmax(12ch, auto) minmax(10ch, auto)",
          [
            { label: msg("po_col_date", "Date") },
            { label: msg("po_col_what", "What"), left: true },
            { label: msg("po_col_amount", "Amount") },
            { label: msg("po_col_money", "Money") },
            { label: msg("po_col_gain", "Gain") },
          ],
          shown.map((e, i) => ({
            key: `${e.coin}:${e.kind}:${e.time}:${i}`,
            cells: [
              ledgerDate(e.time),
              React.createElement(
                LedgerLink,
                {
                  onClick: () => view.openAsset(e.coin),
                  title: msg("po_asset_open_hint", "Open $1 in detail", e.coin),
                },
                `${ledgerKindLabel(e.kind)} ${e.coin}`,
              ),
              view.fmtAmount(e.amount),
              view.fmtMoney(e.money, false, e.currency || undefined),
              e.kind === "sell" && e.gain != null
                ? { v: view.fmtMoney(e.gain, true, e.currency || undefined), tone: ledgerTone(e.gain) }
                : "",
            ],
          })),
        ),
      undated > 0 &&
        React.createElement(
          LedgerNote,
          null,
          undated === 1
            ? msg("po_activity_undated_one", "1 record has no date and is not on this list.")
            : msg("po_activity_undated_n", "$1 records have no date and are not on this list.", String(undated)),
        ),
    );
  },

  /* ── performance ── */

  ledgerReturns() {
    const { holdings, costMethod } = view.props;
    const { histories } = view.state;
    const memo = view._returnsMemo;
    if (memo && memo.histories === histories && memo.holdings === holdings && memo.costMethod === costMethod) {
      return memo.out;
    }
    const out = ledgerMonths(ledgerSteps(histories, holdings, costMethod), Date.now());
    view._returnsMemo = { histories, holdings, costMethod, out };
    return out;
  },

  renderPerformance(periodLabel) {
    const perf = view.ledgerReturns();
    if (!perf) return null;
    const short = ["day", "week", "month"].includes(view.state.chartPeriod);
    const months = perf.months.slice(-LEDGER_MONTHS_MAX);
    const hiddenMonths = perf.months.length - months.length;
    return React.createElement(
      LedgerPanel,
      { "data-portfolio-performance": "true" },
      React.createElement(
        LedgerPanelHead,
        null,
        React.createElement("span", null, msg("po_performance", "Performance · $1", periodLabel)),
        short &&
          React.createElement(
            LedgerChip,
            {
              onClick: () => view.handlePeriodChange(null, "year"),
              title: msg("po_perf_year_hint", "Draw a year, so the return can be read month by month"),
            },
            msg("po_perf_by_month", "By month (1Y)"),
          ),
      ),
      React.createElement(
        LedgerCells,
        { style: { borderBottom: short ? "none" : undefined, marginBottom: short ? 0 : undefined } },
        React.createElement(
          LedgerCell,
          { lead: true, tone: ledgerTone(perf.whole) },
          React.createElement("span", null, msg("po_perf_whole", "Time-weighted return")),
          React.createElement("strong", null, ledgerPct(perf.whole)),
        ),
        !short &&
          perf.best &&
          React.createElement(
            LedgerCell,
            { tone: ledgerTone(perf.best.r) },
            React.createElement("span", null, msg("po_perf_best", "Best month")),
            React.createElement("strong", null, ledgerPct(perf.best.r)),
            React.createElement("em", null, ledgerMonthLabel(perf.best)),
          ),
        !short &&
          perf.worst &&
          React.createElement(
            LedgerCell,
            { tone: ledgerTone(perf.worst.r) },
            React.createElement("span", null, msg("po_perf_worst", "Worst month")),
            React.createElement("strong", null, ledgerPct(perf.worst.r)),
            React.createElement("em", null, ledgerMonthLabel(perf.worst)),
          ),
        !short &&
          perf.full > 0 &&
          React.createElement(
            LedgerCell,
            null,
            React.createElement("span", null, msg("po_perf_up", "Months up")),
            React.createElement("strong", null, msg("po_perf_up_of", "$1 of $2", String(perf.up), String(perf.full))),
          ),
      ),
      !short &&
        React.createElement(
          LedgerMonths,
          null,
          months.map((m) =>
            React.createElement(
              LedgerMonth,
              {
                key: m.key,
                tone: ledgerTone(m.r),
                title: m.partial ? msg("po_perf_partial", "Part of the month only") : undefined,
              },
              React.createElement("span", null, ledgerMonthLabel(m) + (m.partial ? " *" : "")),
              React.createElement("strong", null, ledgerPct(m.r)),
            ),
          ),
        ),
      React.createElement(
        LedgerNote,
        null,
        msg(
          "po_perf_note",
          "What the coins did while you held them. Money you put in or took out is not a gain or a loss: each purchase and sale enters at that day's market price. Coins received as income count as return.",
        ) +
          (short ? "" : msg("po_perf_partial_note", " * marks a month the range covers only part of.")) +
          (hiddenMonths > 0
            ? msg("po_perf_more", " $1 earlier months are in the return above.", String(hiddenMonths))
            : ""),
      ),
    );
  },

  /* ── one holding ── */

  openAsset(coin) {
    view._chartHolding = false;
    view.setState({ assetOpen: coin, chartOpen: false, taxOpen: false });
  },

  renderAssetStage(rows, totalNow) {
    const coin = view.state.assetOpen;
    const row = coin && rows.find((r) => r.coin === coin);
    if (!row) return null;
    const { currency } = view.props;
    const nowSec = Math.floor(Date.now() / 1000);
    const facts = ledgerAssetFacts(row, currency, nowSec);
    const close = () => view.setState({ assetOpen: null });
    const cell = (label, value, extra) =>
      React.createElement(
        LedgerCell,
        { key: label, tone: extra && extra.tone, lead: extra && extra.lead },
        React.createElement("span", null, label),
        React.createElement("strong", null, value),
        extra && extra.note ? React.createElement("em", null, extra.note) : null,
      );
    const lots = row.lots || [];
    const sales = row.sales || [];
    return React.createElement(
      LedgerStage,
      {
        "data-portfolio-asset": coin,
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) close();
        },
      },
      React.createElement(
        LedgerStageInner,
        null,
        React.createElement(
          LedgerHead,
          null,
          React.createElement("h2", null, coin),
          React.createElement("span", null, (COIN_NAMES[coin] ? `${COIN_NAMES[coin]} · ` : "") + msg("po_asset_band", "Holding in detail")),
          React.createElement(LedgerClose, { onClick: close, "aria-label": msg("po_close_detail", "Close the detail (Esc)"), title: msg("po_close_detail", "Close the detail (Esc)") }, "×"),
        ),
        React.createElement(
          LedgerCells,
          null,
          cell(msg("po_asset_value", "Value now"), row.price > 0 ? view.fmtMoney(row.value, false) : "—", {
            lead: true,
            note: totalNow > 0 && row.price > 0 ? msg("po_asset_share", "$1% of the portfolio", ((row.value / totalNow) * 100).toFixed(1)) : null,
          }),
          cell(msg("po_asset_held", "Held"), `${view.fmtAmount(row.amount)} ${coin}`, {
            note: row.unlogged > 0 ? msg("po_asset_unlogged", "$1 with no purchase logged", view.fmtAmount(row.unlogged)) : null,
          }),
          cell(msg("po_asset_average", "Average cost"), facts.average != null ? view.fmtMoney(facts.average, false) : "—", {
            note: facts.average != null ? msg("po_asset_per_coin", "per coin, from $1 purchases", String((row.priced || []).length)) : null,
          }),
          cell(msg("po_unrealized", "Unrealized"), facts.unrealized != null ? view.fmtMoney(facts.unrealized, true) : "—", {
            tone: facts.unrealized != null ? ledgerTone(facts.unrealized) : null,
          }),
          cell(msg("po_realized", "Realized"), row.realized != null ? view.fmtMoney(row.realized, true) : "—", {
            tone: row.realized != null ? ledgerTone(row.realized) : null,
          }),
          cell(msg("po_asset_income", "Income received"), facts.income != null ? view.fmtMoney(facts.income, false) : "—", {
            note: facts.receipts === 1 ? msg("po_asset_receipt_one", "1 receipt") : facts.receipts ? msg("po_asset_receipts", "$1 receipts", String(facts.receipts)) : null,
          }),
          cell(msg("po_asset_long", "Held over a year"), facts.longShare != null ? `${(facts.longShare * 100).toFixed(0)}%` : "—", {
            note: facts.first ? msg("po_asset_since", "first bought $1", ledgerDate(facts.first)) : null,
          }),
        ),
        React.createElement(LedgerSectionTitle, null, msg("po_asset_lots", "Held now — $1", String(lots.length))),
        lots.length
          ? ledgerTable(
              "minmax(9ch, auto) minmax(10ch, 1fr) minmax(8ch, auto) minmax(11ch, auto) minmax(11ch, auto) minmax(11ch, auto) minmax(8ch, auto)",
              [
                { label: msg("po_col_date", "Date") },
                { label: msg("po_col_what", "What"), left: true },
                { label: msg("po_col_amount", "Amount") },
                { label: msg("po_col_cost", "Cost") },
                { label: msg("po_col_now", "Now") },
                { label: msg("po_col_pl", "P/L") },
                { label: msg("po_col_held", "Held") },
              ],
              lots.map((lot, i) => {
                const mine = inCurrency(lot, currency);
                const now = row.price > 0 ? row.price * lot.amount : null;
                const pl = mine && now != null && lot.paid > 0 ? now - lot.paid : null;
                const days = lot.time > 0 ? Math.max(0, Math.floor((nowSec - lot.time) / LEDGER_DAY)) : null;
                const long = taxHeldOverAYear(lot.time, nowSec);
                return {
                  key: i,
                  cells: [
                    ledgerDate(lot.time),
                    ledgerKindLabel(lot.kind === "income" ? "income" : lot.source === "chain" ? "chain" : "buy"),
                    view.fmtAmount(lot.amount),
                    lot.paid > 0 ? view.fmtMoney(lot.paid, false, lot.currency || undefined) : "—",
                    now != null ? view.fmtMoney(now, false) : "—",
                    { v: pl != null ? view.fmtMoney(pl, true) : "—", tone: pl != null ? ledgerTone(pl) : null },
                    {
                      v: days == null ? "—" : msg("po_days", "$1 d", String(days)) + (long ? " ·1y+" : ""),
                      title: long ? msg("po_asset_long_hint", "Held more than a year") : undefined,
                    },
                  ],
                };
              }),
            )
          : React.createElement(LedgerNote, null, msg("po_no_purchases_detail", "No purchases logged — open the holding's editor on the list and add one.")),
        sales.length > 0 && React.createElement(LedgerSectionTitle, null, msg("po_asset_sales", "Sold — $1", String(sales.length))),
        sales.length > 0 &&
          ledgerTable(
            "minmax(9ch, 1fr) minmax(8ch, auto) minmax(11ch, auto) minmax(11ch, auto) minmax(11ch, auto) minmax(6ch, auto)",
            [
              { label: msg("po_col_date", "Date") },
              { label: msg("po_col_amount", "Amount") },
              { label: msg("po_col_received", "Received") },
              { label: msg("po_col_cost", "Cost") },
              { label: msg("po_col_gain", "Gain") },
              { label: msg("po_col_method", "Method") },
            ],
            [...sales]
              .sort((a, b) => (b.time || 0) - (a.time || 0))
              .map((sale, i) => {
                const gain = saleRealized(sale);
                const as = sale.currency || undefined;
                return {
                  key: i,
                  cells: [
                    ledgerDate(sale.time),
                    view.fmtAmount(sale.amount),
                    view.fmtMoney(sale.received || 0, false, as),
                    sale.basisAmount > 0 ? view.fmtMoney(sale.basis || 0, false, as) : "—",
                    { v: gain != null ? view.fmtMoney(gain, true, as) : "—", tone: gain != null ? ledgerTone(gain) : null },
                    String(sale.method || "fifo").toUpperCase(),
                  ],
                };
              }),
          ),
        React.createElement(
          LedgerNote,
          null,
          msg(
            "po_asset_note",
            "Held counts days from the purchase date; a purchase with no date has no holding period. Figures in another currency are printed in their own and left out of the totals, never converted.",
          ),
        ),
      ),
    );
  },
});
