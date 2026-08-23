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

/* The four caches, in the order they are worth least.
 *
 * Everything in this list is *rebuildable from the network*, and everything
 * not in it was typed by a person. That is the whole distinction the eviction
 * below rests on, so it is written once, here, rather than inferred from a key
 * prefix that a future cache might not follow. */
const EPHEMERAL_CACHE_KEYS = [
  "crypto_chart_price_cache",
  "crypto_chart_widget_cache",
  "crypto_chart_news_cache",
  "crypto_chart_ticker_cache",
];

/* Write, and if the quota refuses, spend the caches to make room.
 *
 * The caches are each capped by *entry count* — 30 prices, 40 widgets, 140
 * ticker symbols — and never against a shared byte budget, so a tab that has
 * met a lot of coins can fill the origin's storage with data that exists only
 * to save a request. Every write here caught the failure and returned in
 * silence, which is right for a cache and wrong for a portfolio: the holding
 * someone just typed would vanish at the next reload, with nothing said.
 *
 * So a failed write drops the caches, cheapest first, and tries again after
 * each one. Portfolio, calls, targets and preferences are never evicted to
 * make room for anything — they are the reason the storage exists. `true` or
 * `false` comes back so a caller who *can* tell the user (an import, say) has
 * something to tell them; the background caches keep ignoring it and start
 * cold next time, which is what a cache is for. */
const writeStorage = (key, serialized) => {
  try {
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    // A cache failing to save is not worth evicting other caches for
    if (EPHEMERAL_CACHE_KEYS.includes(key)) return false;
    for (const cacheKey of EPHEMERAL_CACHE_KEYS) {
      try {
        if (localStorage.getItem(cacheKey) === null) continue;
        localStorage.removeItem(cacheKey);
        localStorage.setItem(key, serialized);
        return true;
      } catch (retryError) {
        // Still no room — fall through to the next cache
      }
    }
    return false;
  }
};

const saveSetting = (key, value) => writeStorage(key, String(value));

const saveJsonSetting = (key, value) => {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    return false; // a shape that cannot be written is not a quota problem
  }
  return writeStorage(key, serialized);
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

const loadCostMethod = () =>
  loadEnumSetting(
    COST_METHOD_KEY,
    COST_METHODS.map((m) => m.value),
    DEFAULT_COST_METHOD,
  );
const saveCostMethod = (value) => saveSetting(COST_METHOD_KEY, value);

const loadNewsFilter = () =>
  loadEnumSetting(
    NEWS_FILTER_KEY,
    NEWS_FILTER_OPTIONS.map((o) => o.value),
    DEFAULT_NEWS_FILTER,
  );
const saveNewsFilter = (value) => saveSetting(NEWS_FILTER_KEY, value);

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
    /* Three kinds now. A **portfolio** target watches the total of everything
     * held rather than one coin's price, so it is the one kind with no coin —
     * and the whitelist below has to let that through instead of dropping the
     * record on load. Everything else about it is a price target: a number in
     * a currency, above or below. */
    const kind =
      a.kind === "percent"
        ? "percent"
        : a.kind === "portfolio"
          ? "portfolio"
          : "price";
    if (kind !== "portfolio" && !SUGGESTED_COINS.includes(coin)) continue;
    if (!CURRENCY_OPTIONS.some((c) => c.value === currency)) continue;
    if (!isFinite(target) || target <= 0) continue;
    if (kind === "percent" && target > MAX_PERCENT_TARGET) continue;
    if (a.direction !== "above" && a.direction !== "below") continue;
    const created = Number(a.created);
    const startPrice = Number(a.startPrice);
    const triggeredAt = Number(a.triggeredAt);
    const hitPrice = Number(a.hitPrice);
    clean.push({
      id: typeof a.id === "string" && a.id ? a.id : `${coin || "portfolio"}-${Date.now()}-${clean.length}`,
      coin: kind === "portfolio" ? "" : coin,
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

const loadMoveNews = () => loadBoolSetting(MOVE_NEWS_KEY, DEFAULT_MOVE_NEWS);

const saveMoveNews = (enabled) => saveSetting(MOVE_NEWS_KEY, enabled);

/* Which sources the news panel is showing, as `{ "Cointelegraph": false }` —
 * an absent key means on. Stored that way round on purpose: the set of sources
 * grows, and a stored allow-list would silently hide every source added after
 * it was written. Only `false` is ever recorded, so a new outlet arrives
 * visible and an old one stays hidden. */
const loadNewsPanelSources = () => {
  const saved = loadJsonSetting(NEWS_PANEL_KEY);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  const out = {};
  for (const key of Object.keys(saved)) {
    if (typeof key === "string" && saved[key] === false) out[key] = false;
  }
  return out;
};

const saveNewsPanelSources = (map) => saveJsonSetting(NEWS_PANEL_KEY, map);

const loadNewsPanelFilter = () =>
  loadEnumSetting(
    NEWS_PANEL_FILTER_KEY,
    NEWS_FILTER_OPTIONS.map((o) => o.value),
    DEFAULT_NEWS_FILTER,
  );

const saveNewsPanelFilter = (value) => saveSetting(NEWS_PANEL_FILTER_KEY, value);

/* Held per range: the reach you want on an hour chart is not the reach you want
 * on a year, and a single number would fight you every time you switched. */
const loadBoardZoom = (period) =>
  Number(
    loadEnumSetting(
      `${BOARD_ZOOM_KEY}_${period}`,
      BOARD_ZOOM_STEPS.map(String),
      String(DEFAULT_BOARD_ZOOM),
    ),
  );

const saveBoardZoom = (period, zoom) =>
  saveSetting(`${BOARD_ZOOM_KEY}_${period}`, String(zoom));

const loadQuietChrome = () =>
  loadBoolSetting(QUIET_CHROME_KEY, DEFAULT_QUIET_CHROME);

const saveQuietChrome = (enabled) => saveSetting(QUIET_CHROME_KEY, enabled);

const loadPredict = () => loadBoolSetting(PREDICT_KEY, DEFAULT_PREDICT);
const savePredict = (enabled) => saveSetting(PREDICT_KEY, enabled);

/* A continuous setting, so it is read through a clamp rather than a list of
 * allowed values the way every other number here is: what it stores is where
 * someone let go of a line, and there are no legal positions, only limits. */
const loadFutureShare = () => {
  try {
    const parsed = parseFloat(localStorage.getItem(FUTURE_SHARE_KEY));
    if (!isFinite(parsed)) return DEFAULT_FUTURE_SHARE;
    return Math.min(MAX_FUTURE_SHARE, Math.max(MIN_FUTURE_SHARE, parsed));
  } catch (error) {
    return DEFAULT_FUTURE_SHARE;
  }
};
const saveFutureShare = (share) => saveSetting(FUTURE_SHARE_KEY, share);

const loadCallsShowSettled = () =>
  loadBoolSetting(CALLS_SHOW_SETTLED_KEY, DEFAULT_CALLS_SHOW_SETTLED);
const saveCallsShowSettled = (v) => saveSetting(CALLS_SHOW_SETTLED_KEY, v);

const loadCallsCelebrate = () =>
  loadBoolSetting(CALLS_CELEBRATE_KEY, DEFAULT_CALLS_CELEBRATE);
const saveCallsCelebrate = (v) => saveSetting(CALLS_CELEBRATE_KEY, v);

/* When the calls panel was last opened. Not `loadNumberSetting` — that takes
 * a whitelist of permitted values, and a timestamp has no whitelist. A stored
 * value that is not a finite number reads as "never looked", which shows the
 * mark; the failure that costs nothing is the one to pick. */
const loadCallsSeenAt = () => {
  try {
    const raw = Number(localStorage.getItem(CALLS_SEEN_KEY));
    return isFinite(raw) && raw > 0 ? raw : 0;
  } catch (error) {
    return 0;
  }
};
const saveCallsSeenAt = (at) => saveSetting(CALLS_SEEN_KEY, at);

/* Open calls and the tally. Sanitized on the way in like every other stored
 * shape: a hand-edited file must not be able to produce a call that resolves
 * against a band it never named, or a streak longer than the games played. */
const sanitizeCalls = (raw) => {
  /* `done` belongs in the empty shape too. Leaving it out meant a fresh
   * install held a `calls` whose settled list was `undefined` while every
   * other path holds an array, so each reader needed its own guard and the one
   * that forgot would throw on the first call ever placed. */
  const empty = {
    record: { hits: 0, total: 0, streak: 0, best: 0 },
    open: [],
    done: [],
  };
  if (!raw || typeof raw !== "object") return empty;
  const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const r = raw.record && typeof raw.record === "object" ? raw.record : {};
  const total = num(r.total);
  const hits = Math.min(num(r.hits), total);
  /* A best streak longer than the number of hits never happened, and a current
   * streak longer than the best one cannot come out of `applyCallResult` —
   * it raises `best` the moment `streak` passes it. Clamping both against
   * `total` instead let a hand-edited file claim a best of five with no hits
   * at all, which is the one thing this record exists not to do. */
  const best = Math.min(num(r.best), hits);
  const record = { hits, total, streak: Math.min(num(r.streak), best), best };

  const shape = (list) =>
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
        c.hi > c.lo,
    )
    /* No column number, here or in the stored shape.
     *
     * `col` counts squares back from "now", so it is not an identity and
     * nothing reads it off a stored call — placement, drawing and settling all
     * work from `target`, `span`, `lo` and `hi`, which do not move. It was
     * still being *validated*, `1 ≤ col ≤ 10`, and the strip can offer more
     * squares than that: a call locked in the twelfth was dropped by this
     * function on the way to localStorage, so the write silently kept nothing.
     * A record is not allowed to lose a row over a field it does not use. */
    .map((c) => ({
      id: c.id,
      coin: c.coin.toUpperCase(),
      currency: c.currency,
      period: typeof c.period === "string" ? c.period : "day",
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
      /* When the answer was *found*, not when the call was due — a tab opened
       * a day late settles a call whose moment was yesterday. It is what the
       * mark on the calls button reads to decide whether there is a result
       * you have not seen, so it has to survive the write; a field left out
       * of this shape is a field that exists until the next reload. Calls
       * settled before it existed carry null and never light the mark, which
       * is right: you have already seen them. */
      settledAt:
        typeof c.settledAt === "number" && isFinite(c.settledAt) && c.settledAt > 0
          ? c.settledAt
          : null,
    }));

  /* Overlapping open calls cannot be drawn honestly — two boxes covering the
   * same minutes and prices are two answers to one question, and on screen
   * they simply pile up. Placement refuses to create them, but a store
   * written before that rule existed can still hold them, so they are cleared
   * on the way in rather than left to be redrawn every time the chart loads.
   *
   * The earliest call wins: it is the one that was actually locked first, and
   * a later claim on ground already taken is exactly what should never have
   * been accepted. Same rule as `handlePlaceCall`, applied retroactively. */
  const intersects = (a, b) =>
    a.coin === b.coin &&
    a.currency === b.currency &&
    a.period === b.period &&
    a.target - a.span < b.target &&
    b.target - b.span < a.target &&
    a.lo < b.hi &&
    b.lo < a.hi;
  /* Over the cap, the newest survive — the same end of the list `handlePlaceCall`
   * keeps when it writes. Cutting from the front here meant the two halves of
   * one rule disagreed: a session that had already dropped its oldest calls
   * reloaded to find the newest gone instead. */
  const open = [];
  for (const c of shape(raw.open)
    .sort((a, b) => b.placed - a.placed)
    .slice(0, MAX_OPEN_CALLS)
    .sort((a, b) => a.placed - b.placed)) {
    if (!open.some((kept) => intersects(kept, c))) open.push(c);
  }

  /* Settled calls are kept so the chart can still show what was said and how
   * it turned out. `result` is the only thing that separates them, and a row
   * without a real one is dropped rather than shown as an unexplained box.
   * Stored newest-first, so the cap takes from the front. */
  const done = shape(raw.done)
    .filter((c) => c.result === "hit" || c.result === "miss")
    .slice(0, MAX_DONE_CALLS);

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
/* The currency a money figure was entered in.
 *
 * Kept only when it is one this app actually offers, and **left off entirely**
 * when it is not, because absent has to keep meaning something: a lot recorded
 * before this field existed cannot be assigned a currency without inventing
 * one, and a lot that says nothing is read as "whatever is on screen", which
 * is exactly how it always behaved. `null` would be a third state nobody
 * needs.
 */
const sanitizeMoneyCurrency = (value) =>
  typeof value === "string" && CURRENCY_OPTIONS.some((c) => c.value === value)
    ? value
    : null;

/* `paid` is a number of *something*, and until now nothing recorded of what.
 *
 * Switching the display currency re-read every cost basis in the new one: a
 * lot entered as 15,000 USD became 15,000 EUR, and the row P/L, the headline
 * Unrealized, the chart's COST line and the CSV's "All amounts in EUR" all
 * stated it. The currency is stamped at entry now, and anything wearing a
 * different one is set aside rather than added up — the same answer
 * `alerts.js` gives a target set in another currency.
 */
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
    const currency = sanitizeMoneyCurrency(lot.currency);
    const clean = {
      amount,
      paid,
      time: isFinite(time) && time > 0 ? Math.floor(time) : 0,
      source: lot.source === "chain" ? "chain" : "manual",
    };
    if (currency) clean.currency = currency;
    lots.push(clean);
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
    const currency = sanitizeMoneyCurrency(sale.currency);
    const clean = {
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
    };
    // Both sides of a disposal are money: what it fetched and the basis it
    // consumed. They are the same currency by construction — the lots it ate
    // were entered in it — so one stamp covers the row.
    if (currency) clean.currency = currency;
    /* Which purchase this sale ate, decided when it was recorded and never
     * afterwards. A sale from before the setting existed has no stamp and the
     * report says FIFO for it, because FIFO is what it actually used. */
    if (COST_METHODS.some((m) => m.value === sale.method)) {
      clean.method = sale.method;
    }
    sales.push(clean);
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
// and JSON import: coins whitelisted against the coins this app knows, numbers
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
    /* The whitelist is what the app knows, not what it can chart.
     *
     * It was `SUGGESTED_COINS` alone, and that quietly deleted holdings: an
     * Ethereum address can hold stETH, wBETH, FDUSD or TUSD — all four are
     * read from their own contracts and priced by the ticker sweep — but
     * neither Coinbase nor Kraken quotes a series for any of them, so putting
     * them in the coin list would offer four chart coins that cannot draw.
     * Kept out of that list, they were found at the address, added, saved,
     * and dropped on the next tab open with nothing said. A token you hold is
     * a holding whether or not there is a line to look at. `isWatchableCoin`
     * is a closed list too — `WATCH_CHAINS` plus `ERC20_TOKENS` — so this is
     * the same protection against a hand-edited file, over a wider set. */
    if (
      (!SUGGESTED_COINS.includes(coin) && !isWatchableCoin(coin)) ||
      seen.has(coin)
    ) {
      continue;
    }
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

// Total or composition in the expanded chart. Off by default: the plain line
// is what the portfolio has always shown, and the stacked view trades the
// zoomed scale for honest proportions — an opt-in, not a surprise.
const loadPortfolioStackedFromStorage = () =>
  loadBoolSetting(PORTFOLIO_STACKED_KEY, false);

const savePortfolioStackedToStorage = (on) =>
  saveSetting(PORTFOLIO_STACKED_KEY, on ? "true" : "false");

const loadPortfolioSortFromStorage = () =>
  loadEnumSetting(
    PORTFOLIO_SORT_KEY,
    PORTFOLIO_SORT_OPTIONS.map((o) => o.value),
    DEFAULT_PORTFOLIO_SORT,
  );

const savePortfolioSortToStorage = (sort) =>
  saveSetting(PORTFOLIO_SORT_KEY, sort);
