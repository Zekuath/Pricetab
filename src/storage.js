/* GENERIC LOCALSTORAGE HELPERS — all settings read/write through these */
const loadBoolSetting = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? saved === "true" : fallback;
  } catch (error) {
    return fallback;
  }
};

const loadEnumSetting = (key, validValues, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return validValues.includes(saved) ? saved : fallback;
  } catch (error) {
    return fallback;
  }
};

const loadNumberSetting = (key, validValues, fallback) => {
  try {
    const parsed = parseInt(localStorage.getItem(key), 10);
    return validValues.includes(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
};

const loadJsonSetting = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    return null;
  }
};

const saveSetting = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch (error) {
    // Silently fail
  }
};

const saveJsonSetting = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Silently fail
  }
};

// Theme helper functions
const loadThemeFromStorage = () =>
  loadEnumSetting(THEME_STORAGE_KEY, ["auto", "light", "dark"], "auto");

const saveThemeToStorage = (theme) => saveSetting(THEME_STORAGE_KEY, theme);

const loadRatePromptDismissed = () => {
  try {
    return localStorage.getItem(RATE_PROMPT_DISMISSED_KEY) === "true";
  } catch (error) {
    return true; // Broken storage → treat as dismissed, never nag
  }
};

const saveRatePromptDismissed = () =>
  saveSetting(RATE_PROMPT_DISMISSED_KEY, "true");

// First-use timestamp for the delayed rating ask. Initialized on the first
// load where it's missing, so existing installs start the clock at the
// update, not retroactively. A corrupt or future value is reset the same way.
const getOrInitFirstUse = () => {
  try {
    const raw = parseInt(localStorage.getItem(FIRST_USE_KEY), 10);
    if (isFinite(raw) && raw > 0 && raw <= Date.now()) return raw;
    const now = Date.now();
    localStorage.setItem(FIRST_USE_KEY, String(now));
    return now;
  } catch (error) {
    return Date.now(); // Broken storage → clock never elapses, never nag
  }
};

const loadRatePromptShown = () => {
  try {
    return localStorage.getItem(RATE_PROMPT_SHOWN_KEY) === "true";
  } catch (error) {
    return true; // Broken storage → treat as shown, never nag
  }
};

const saveRatePromptShown = () => saveSetting(RATE_PROMPT_SHOWN_KEY, "true");

const loadNewsTickerFromStorage = () =>
  loadBoolSetting(NEWS_TICKER_STORAGE_KEY, false);

const saveNewsTickerToStorage = (enabled) =>
  saveSetting(NEWS_TICKER_STORAGE_KEY, enabled);

const loadAutoRotateFromStorage = () =>
  loadBoolSetting(AUTO_ROTATE_STORAGE_KEY, DEFAULT_AUTO_ROTATE);

const saveAutoRotateToStorage = (enabled) =>
  saveSetting(AUTO_ROTATE_STORAGE_KEY, enabled);

const loadAutoRotateIntervalFromStorage = () =>
  loadNumberSetting(
    AUTO_ROTATE_INTERVAL_STORAGE_KEY,
    AUTO_ROTATE_OPTIONS.map((option) => option.value),
    DEFAULT_AUTO_ROTATE_INTERVAL,
  );

const saveAutoRotateIntervalToStorage = (interval) =>
  saveSetting(AUTO_ROTATE_INTERVAL_STORAGE_KEY, interval);

const getSystemTheme = () => {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
};

const getActiveTheme = (themePreference) => {
  if (themePreference === "auto") {
    return getSystemTheme();
  }
  return themePreference;
};

// Refresh interval helper functions
const loadRefreshIntervalFromStorage = () =>
  loadNumberSetting(
    REFRESH_INTERVAL_STORAGE_KEY,
    REFRESH_INTERVAL_OPTIONS.map((option) => option.value),
    DEFAULT_REFRESH_INTERVAL,
  );

const saveRefreshIntervalToStorage = (interval) =>
  saveSetting(REFRESH_INTERVAL_STORAGE_KEY, interval);

// Number format helper functions
const loadDecimalPlacesFromStorage = () =>
  loadNumberSetting(
    DECIMAL_PLACES_STORAGE_KEY,
    DECIMAL_PLACES_OPTIONS.map((option) => option.value),
    DEFAULT_DECIMAL_PLACES,
  );

const saveDecimalPlacesToStorage = (places) =>
  saveSetting(DECIMAL_PLACES_STORAGE_KEY, places);

const loadSeparatorFormatFromStorage = () =>
  loadEnumSetting(
    SEPARATOR_FORMAT_STORAGE_KEY,
    ["us", "eu", "space"],
    DEFAULT_SEPARATOR_FORMAT,
  );

const saveSeparatorFormatToStorage = (format) =>
  saveSetting(SEPARATOR_FORMAT_STORAGE_KEY, format);

// Currency helper functions
const loadCurrencyFromStorage = () =>
  loadEnumSetting(
    CURRENCY_STORAGE_KEY,
    CURRENCY_OPTIONS.map((option) => option.value),
    DEFAULT_CURRENCY,
  );

const saveCurrencyToStorage = (currency) =>
  saveSetting(CURRENCY_STORAGE_KEY, currency);

// Ticker helper functions
const loadTickerFromStorage = () =>
  loadBoolSetting(TICKER_STORAGE_KEY, DEFAULT_TICKER_ENABLED);

const saveTickerToStorage = (enabled) => saveSetting(TICKER_STORAGE_KEY, enabled);

const loadTickerFormatFromStorage = () =>
  loadEnumSetting(
    TICKER_FORMAT_STORAGE_KEY,
    TICKER_FORMAT_OPTIONS.map((option) => option.value),
    DEFAULT_TICKER_FORMAT,
  );

const saveTickerFormatToStorage = (format) =>
  saveSetting(TICKER_FORMAT_STORAGE_KEY, format);

const loadPageTickerFromStorage = () =>
  loadBoolSetting(PAGE_TICKER_STORAGE_KEY, DEFAULT_PAGE_TICKER_ENABLED);

const savePageTickerToStorage = (enabled) =>
  saveSetting(PAGE_TICKER_STORAGE_KEY, enabled);

const loadPageTickerPositionFromStorage = () =>
  loadEnumSetting(
    PAGE_TICKER_POSITION_STORAGE_KEY,
    ["top", "bottom"],
    DEFAULT_PAGE_TICKER_POSITION,
  );

const savePageTickerPositionToStorage = (position) =>
  saveSetting(PAGE_TICKER_POSITION_STORAGE_KEY, position);

const loadPageTickerCollapsedFromStorage = () =>
  loadBoolSetting(PAGE_TICKER_COLLAPSED_STORAGE_KEY, DEFAULT_PAGE_TICKER_COLLAPSED);

const savePageTickerCollapsedToStorage = (collapsed) =>
  saveSetting(PAGE_TICKER_COLLAPSED_STORAGE_KEY, collapsed);

const loadChartColorFromStorage = () =>
  loadBoolSetting(CHART_COLOR_STORAGE_KEY, DEFAULT_CHART_COLOR);

const saveChartColorToStorage = (enabled) =>
  saveSetting(CHART_COLOR_STORAGE_KEY, enabled);

/* Price targets: [{ id, coin, kind, direction, target, currency, created,
 * startPrice, triggeredAt, hitPrice }]. Coins and currencies are
 * whitelist-checked and targets must be finite positives, so a corrupted
 * entry can't fire a bogus alert.
 *
 * `kind` and `startPrice` arrived after the first release: entries written
 * before them are still valid targets, so a missing kind reads as "price"
 * and a missing startPrice as null (the panel then draws no progress meter
 * rather than inventing a starting point). A percent target's `target` is a
 * size of move, so it is additionally capped — nothing moves 5,000% in a day,
 * and a target that can never fire is worse than no target. */
const MAX_PERCENT_TARGET = 100;

const sanitizeAlerts = (list) => {
  if (!Array.isArray(list)) return [];
  const clean = [];
  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    const coin = typeof a.coin === "string" ? a.coin.toUpperCase() : "";
    const currency =
      typeof a.currency === "string" ? a.currency.toUpperCase() : "";
    const target = Number(a.target);
    const kind = a.kind === "percent" ? "percent" : "price";
    if (!SUGGESTED_COINS.includes(coin)) continue;
    if (!CURRENCY_OPTIONS.some((c) => c.value === currency)) continue;
    if (!isFinite(target) || target <= 0) continue;
    if (kind === "percent" && target > MAX_PERCENT_TARGET) continue;
    if (a.direction !== "above" && a.direction !== "below") continue;
    const created = Number(a.created);
    const startPrice = Number(a.startPrice);
    const triggeredAt = Number(a.triggeredAt);
    const hitPrice = Number(a.hitPrice);
    clean.push({
      id: typeof a.id === "string" && a.id ? a.id : `${coin}-${Date.now()}-${clean.length}`,
      coin,
      kind,
      direction: a.direction,
      target,
      currency,
      created: isFinite(created) && created > 0 ? created : Date.now(),
      startPrice: isFinite(startPrice) && startPrice > 0 ? startPrice : null,
      triggeredAt: isFinite(triggeredAt) && triggeredAt > 0 ? triggeredAt : null,
      hitPrice: isFinite(hitPrice) && hitPrice > 0 ? hitPrice : null,
    });
    if (clean.length >= MAX_ALERTS) break;
  }
  return clean;
};

const loadAlerts = () => sanitizeAlerts(loadJsonSetting(ALERTS_STORAGE_KEY));

const saveAlerts = (alerts) =>
  saveJsonSetting(ALERTS_STORAGE_KEY, Array.isArray(alerts) ? alerts : []);

/* "Since your last visit" baselines: { COIN: { price, time } }. Entries are
 * validated on read (junk or expired ones dropped) so a corrupted store can
 * never show a nonsense comparison. */
/* Each entry holds two things: the anchor the line compares against
 * (`price`/`time` — what you last saw before a break) and the running
 * latest view (`lastPrice`/`lastTime`), which becomes the next anchor once
 * a break happens. Entries written before this split only have the anchor,
 * so the latest view falls back to it. */
const loadLastSeen = () => {
  const saved = loadJsonSetting(LAST_SEEN_KEY);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  const clean = {};
  const now = Date.now();
  for (const coin of Object.keys(saved)) {
    const entry = saved[coin];
    if (!entry || typeof entry !== "object") continue;
    const price = Number(entry.price);
    const time = Number(entry.time);
    if (!isFinite(price) || price <= 0) continue;
    if (!isFinite(time) || time <= 0 || time > now) continue;
    if (now - time > LAST_SEEN_MAX_AGE_MS) continue;
    const lastPriceNum = Number(entry.lastPrice);
    const lastTimeNum = Number(entry.lastTime);
    const lastPrice =
      isFinite(lastPriceNum) && lastPriceNum > 0 ? lastPriceNum : price;
    const lastTime =
      isFinite(lastTimeNum) && lastTimeNum > 0 && lastTimeNum <= now
        ? lastTimeNum
        : time;
    clean[coin] = { price, time, lastPrice, lastTime };
  }
  return clean;
};

const saveLastSeen = (map) => saveJsonSetting(LAST_SEEN_KEY, map);

/* Where a coin's "since your last visit" anchor goes on this visit.
 * Pure so the rule can be tested without a page:
 *   no history      → this visit becomes the record, nothing to show yet
 *   back from a gap → the price you last saw becomes the anchor
 *   same visit      → anchor stays put, only the running view moves
 * Keeping the anchor still is the whole point: refreshing it constantly
 * meant the comparison was always against a few minutes ago, so the delta
 * sat below the noise threshold and the line never appeared. */
const nextLastSeen = (prev, price, now) => {
  if (!prev) return { price, time: now, lastPrice: price, lastTime: now };
  const returning = now - prev.lastTime > LAST_SEEN_GAP_MS;
  return {
    price: returning ? prev.lastPrice : prev.price,
    time: returning ? prev.lastTime : prev.time,
    lastPrice: price,
    lastTime: now,
  };
};

const loadOhlcEnabled = () =>
  loadBoolSetting(OHLC_ENABLED_KEY, DEFAULT_OHLC_ENABLED);

const saveOhlcEnabled = (enabled) => saveSetting(OHLC_ENABLED_KEY, enabled);

const loadAlertTabTitle = () =>
  loadBoolSetting(ALERT_TAB_TITLE_KEY, DEFAULT_ALERT_TAB_TITLE);

const saveAlertTabTitle = (enabled) =>
  saveSetting(ALERT_TAB_TITLE_KEY, enabled);

const loadMoveHeadlines = () =>
  loadBoolSetting(MOVE_HEADLINES_KEY, DEFAULT_MOVE_HEADLINES);

const saveMoveHeadlines = (enabled) =>
  saveSetting(MOVE_HEADLINES_KEY, enabled);

const loadMarketStats = () =>
  loadBoolSetting(MARKET_STATS_KEY, DEFAULT_MARKET_STATS);

const saveMarketStats = (enabled) => saveSetting(MARKET_STATS_KEY, enabled);

const loadChartGrid = () =>
  loadBoolSetting(CHART_GRID_KEY, DEFAULT_CHART_GRID);

const saveChartGrid = (enabled) => saveSetting(CHART_GRID_KEY, enabled);

const loadPredict = () => loadBoolSetting(PREDICT_KEY, DEFAULT_PREDICT);
const savePredict = (enabled) => saveSetting(PREDICT_KEY, enabled);

const loadPredictAhead = () =>
  loadNumberSetting(PREDICT_AHEAD_KEY, PREDICT_AHEAD_OPTIONS, DEFAULT_PREDICT_AHEAD);
const savePredictAhead = (n) => saveSetting(PREDICT_AHEAD_KEY, n);

const loadCallsShowSettled = () =>
  loadBoolSetting(CALLS_SHOW_SETTLED_KEY, DEFAULT_CALLS_SHOW_SETTLED);
const saveCallsShowSettled = (v) => saveSetting(CALLS_SHOW_SETTLED_KEY, v);

const loadCallsCelebrate = () =>
  loadBoolSetting(CALLS_CELEBRATE_KEY, DEFAULT_CALLS_CELEBRATE);
const saveCallsCelebrate = (v) => saveSetting(CALLS_CELEBRATE_KEY, v);

/* Open calls and the tally. Sanitized on the way in like every other stored
 * shape: a hand-edited file must not be able to produce a call that resolves
 * against a band it never named, or a streak longer than the games played. */
const sanitizeCalls = (raw) => {
  const empty = { record: { hits: 0, total: 0, streak: 0, best: 0 }, open: [] };
  if (!raw || typeof raw !== "object") return empty;
  const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const r = raw.record && typeof raw.record === "object" ? raw.record : {};
  const total = num(r.total);
  const hits = Math.min(num(r.hits), total);
  const best = Math.min(num(r.best), total);
  const record = { hits, total, streak: Math.min(num(r.streak), hits), best };

  const shape = (list, cap, extra) =>
    (Array.isArray(list) ? list : [])
    .filter(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof c.id === "string" &&
        typeof c.coin === "string" &&
        SUGGESTED_COINS.includes(c.coin.toUpperCase()) &&
        // CURRENCY_OPTIONS holds { value, label, symbol } objects, so an
        // `includes` on the code silently rejected everything
        CURRENCY_OPTIONS.some((o) => o.value === c.currency) &&
        [c.target, c.span, c.lo, c.hi, c.placed].every(
          (v) => typeof v === "number" && isFinite(v),
        ) &&
        c.span > 0 &&
        c.hi > c.lo &&
        // Which future square: 1 is the next one along. A call without a
        // column cannot be replaced by a later call on the same square.
        typeof c.col === "number" &&
        isFinite(c.col) &&
        c.col >= 1 &&
        c.col <= 10,
    )
    .map((c) => ({
      id: c.id,
      coin: c.coin.toUpperCase(),
      currency: c.currency,
      period: typeof c.period === "string" ? c.period : "day",
      col: Math.round(c.col),
      target: c.target,
      span: c.span,
      lo: c.lo,
      hi: c.hi,
      placed: c.placed,
      placedPrice:
        typeof c.placedPrice === "number" && isFinite(c.placedPrice)
          ? c.placedPrice
          : null,
      result: c.result === "hit" || c.result === "miss" ? c.result : null,
      settledPrice:
        typeof c.settledPrice === "number" && isFinite(c.settledPrice)
          ? c.settledPrice
          : null,
    }))
      .slice(0, cap)
      .map((c) => (extra ? extra(c) : c));

  const open = shape(raw.open, MAX_OPEN_CALLS);

  /* Settled calls are kept so the chart can still show what was said and how
   * it turned out. `result` is the only thing that separates them, and a row
   * without a real one is dropped rather than shown as an unexplained box. */
  const done = shape(raw.done, MAX_DONE_CALLS, (c) => c).filter(
    (c) => c.result === "hit" || c.result === "miss",
  );

  return { record, open, done };
};

const loadCalls = () => sanitizeCalls(loadJsonSetting(CALLS_KEY, null));
const saveCalls = (calls) => saveJsonSetting(CALLS_KEY, sanitizeCalls(calls));

const loadVolumeBars = () =>
  loadBoolSetting(VOLUME_BARS_KEY, DEFAULT_VOLUME_BARS);

const saveVolumeBars = (enabled) => saveSetting(VOLUME_BARS_KEY, enabled);

const loadChartType = () =>
  loadEnumSetting(CHART_TYPE_KEY, ["line", "candles"], DEFAULT_CHART_TYPE);

const saveChartType = (type) => saveSetting(CHART_TYPE_KEY, type);

const loadLastSeenEnabled = () =>
  loadBoolSetting(LAST_SEEN_ENABLED_KEY, DEFAULT_LAST_SEEN_ENABLED);

const saveLastSeenEnabled = (enabled) =>
  saveSetting(LAST_SEEN_ENABLED_KEY, enabled);

// One purchase lot: amount bought, total paid for it, unix-seconds date
// (0 = unknown) and whether it was typed in or inferred from a watched chain
const sanitizeLots = (list) => {
  if (!Array.isArray(list)) return [];
  const lots = [];
  for (const lot of list) {
    if (!lot || typeof lot !== "object") continue;
    const amount = Number(lot.amount);
    const paid = Number(lot.paid);
    const time = Number(lot.time);
    if (!isFinite(amount) || amount <= 0) continue;
    if (!isFinite(paid) || paid < 0) continue;
    lots.push({
      amount,
      paid,
      time: isFinite(time) && time > 0 ? Math.floor(time) : 0,
      source: lot.source === "chain" ? "chain" : "manual",
    });
    if (lots.length >= MAX_LOTS_PER_HOLDING) break;
  }
  return lots;
};

/* The lot slices one sale consumed: [{ amount, cost, acquired, source }].
 *
 * This is what lets the report pair an acquisition with a disposal, which is
 * the shape every tax form asks for. Sales recorded before it existed simply
 * have none — they keep their totals and the report says which lines it could
 * not pair, rather than inventing an acquisition date for them.
 */
const sanitizeMatched = (list) => {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    const amount = Number(m.amount);
    const cost = Number(m.cost);
    const acquired = Number(m.acquired);
    if (!isFinite(amount) || amount <= 0) continue;
    out.push({
      amount,
      cost: isFinite(cost) && cost >= 0 ? cost : 0,
      acquired: isFinite(acquired) && acquired > 0 ? Math.floor(acquired) : 0,
      source: m.source === "chain" ? "chain" : "manual",
    });
    if (out.length >= MAX_LOTS_PER_HOLDING) break;
  }
  return out;
};

/* Sales: [{ amount, received, basis, basisAmount, matched, time }].
 *
 * A sale can't be recomputed after the fact — the lots it consumed are gone —
 * so the cost basis it used is written down at the moment it is recorded, not
 * derived later. `basisAmount` is how much of the sold amount actually had a
 * purchase behind it, which is not always the whole sale: you can hold coins
 * you never logged a purchase for, and selling those produces proceeds with
 * no basis to set against them. Keeping the two separate is what lets the
 * report say "this gain covers 3 of the 5 you sold" instead of quietly
 * treating the unlogged part as free money.
 */
const sanitizeSales = (list) => {
  if (!Array.isArray(list)) return [];
  const sales = [];
  for (const sale of list) {
    if (!sale || typeof sale !== "object") continue;
    const amount = Number(sale.amount);
    const received = Number(sale.received);
    const basis = Number(sale.basis);
    const basisAmount = Number(sale.basisAmount);
    const time = Number(sale.time);
    if (!isFinite(amount) || amount <= 0) continue;
    if (!isFinite(received) || received < 0) continue;
    sales.push({
      amount,
      received,
      basis: isFinite(basis) && basis >= 0 ? basis : 0,
      // Can never exceed what was sold, whatever the stored value claims
      basisAmount:
        isFinite(basisAmount) && basisAmount > 0
          ? Math.min(basisAmount, amount)
          : 0,
      matched: sanitizeMatched(sale.matched),
      time: isFinite(time) && time > 0 ? Math.floor(time) : 0,
    });
    if (sales.length >= MAX_SALES_PER_HOLDING) break;
  }
  return sales;
};

// Watched addresses of one holding: [{ address, amount, lots }] — each entry
// is one address whose on-chain balance (and inferred lots) is tracked
// separately from the manually entered part, so the row can break down
// "what came from where". Addresses must be valid for the holding's chain.
const sanitizeWatches = (list, coin) => {
  if (!Array.isArray(list) || !isWatchableCoin(coin)) return [];
  const seen = new Set();
  const clean = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const address =
      typeof entry.address === "string" ? entry.address.trim() : "";
    if (!WATCH_ADDRESS_RE.test(address) || seen.has(address)) continue;
    const amount = Number(entry.amount);
    if (!isFinite(amount) || amount < 0) continue;
    seen.add(address);
    clean.push({ address, amount, lots: sanitizeLots(entry.lots) });
    if (clean.length >= MAX_WATCHES_PER_HOLDING) break;
  }
  return clean;
};

// Portfolio (tracking only): array of { coin, amount, lots, watches } where
// `amount`/`lots` are the manually entered part and `watches` are watched
// addresses tracked separately (see sanitizeWatches). Shared by storage load
// and JSON import: coins whitelisted against SUGGESTED_COINS, numbers
// coerced to finite non-negatives; anything malformed is dropped so a
// corrupted entry (or a hand-edited import file) can't break the view.
// Legacy shapes migrate: a `paid` total becomes one lot, and a single
// top-level `address` becomes the holding's first watch entry.
const sanitizePortfolio = (list) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const clean = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const coin = typeof entry.coin === "string" ? entry.coin.toUpperCase() : "";
    let amount = Number(entry.amount);
    if (!SUGGESTED_COINS.includes(coin) || seen.has(coin)) continue;
    if (!isFinite(amount) || amount < 0) continue;
    let lots = sanitizeLots(entry.lots);
    if (!lots.length) {
      const paidNum = Number(entry.paid);
      if (isFinite(paidNum) && paidNum > 0 && amount > 0) {
        lots = [{ amount, paid: paidNum, time: 0, source: "manual" }];
      }
    }
    let watches = sanitizeWatches(entry.watches, coin);
    // Legacy single-address holding: the whole amount came from that address
    const legacyAddr =
      typeof entry.address === "string" ? entry.address.trim() : "";
    if (
      !watches.length &&
      isWatchableCoin(coin) &&
      WATCH_ADDRESS_RE.test(legacyAddr)
    ) {
      watches = [{ address: legacyAddr, amount, lots }];
      amount = 0;
      lots = [];
    }
    seen.add(coin);
    clean.push({
      coin,
      amount,
      lots,
      watches,
      sales: sanitizeSales(entry.sales),
    });
  }
  return clean;
};

const loadPortfolioFromStorage = () =>
  sanitizePortfolio(loadJsonSetting(PORTFOLIO_STORAGE_KEY));

const savePortfolioToStorage = (holdings) =>
  saveJsonSetting(
    PORTFOLIO_STORAGE_KEY,
    Array.isArray(holdings) ? holdings : [],
  );

// Portfolio background chart period ("hour" excluded — it's a value trend,
// not a tick chart). Defaults to a week, the most portfolio-shaped range.
const loadPortfolioPeriodFromStorage = () =>
  loadEnumSetting(
    PORTFOLIO_PERIOD_KEY,
    ["day", "week", "month", "year", "all"],
    "week",
  );

const savePortfolioPeriodToStorage = (period) =>
  saveSetting(PORTFOLIO_PERIOD_KEY, period);

const loadPortfolioSortFromStorage = () =>
  loadEnumSetting(
    PORTFOLIO_SORT_KEY,
    PORTFOLIO_SORT_OPTIONS.map((o) => o.value),
    DEFAULT_PORTFOLIO_SORT,
  );

const savePortfolioSortToStorage = (sort) =>
  saveSetting(PORTFOLIO_SORT_KEY, sort);
