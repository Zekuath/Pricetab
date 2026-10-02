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
  /* The rolling headline archive. Losing it costs the "what happened here?"
   * card its best answers for the weeks the network archive has not caught up
   * to, and costs nothing a person typed — so it goes before the portfolio,
   * with the rest of the caches. See `api.js`. */
  "crypto_chart_news_archive",
  "crypto_chart_ticker_cache",
  /* Years of daily candles for the base-rate panel and the candlestick
     patterns. It carries OHLC since 22 Sep 2026 — about 190 KB a coin
     against 97 — and losing it costs one refetch when that panel is next
     opened, which is the cheapest thing on this list to lose. */
  "crypto_chart_daily_closes",
  /* Finer candles a zoomed chart asked for (api.js, `fetchViewCandles`):
     at most six pages of 300 bars, and every one of them refetchable. */
  "crypto_chart_view_candles",
  /* What followed each of the last US CPI releases, per coin — 1-minute
     candles reduced to eight numbers a release. Rebuildable from the
     network, so it goes before anything a person typed. */
  "crypto_chart_cpi_moves",
  /* The bars the board's chances are read from (api.js, `fetchOddsSeries`):
     closes only, a few coins' worth, every one refetchable. */
  "crypto_chart_odds_series",
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

/* The coin list, and the whitelist that guards it.
 *
 * It lived in `utils.js` until 12 Sep 2026 and was moved here unchanged: it is
 * a `load*`/`save*` pair and every other one is in this file. The move is what
 * lets the toolbar popup read the list — `utils.js` builds a d3 line generator
 * at load, so a page that only wants prices cannot have it, and the
 * alternative was a second copy of the whitelist test. A validation rule with
 * two implementations is a validation rule with one of them out of date. */
const loadCoinOptionsFromStorage = () => {
  const parsed = loadJsonSetting(STORAGE_KEY);
  if (Array.isArray(parsed) && parsed.length > 0) {
    // Validate coins against whitelist and limit to 20
    const validCoins = parsed
      .filter(
        (coin) =>
          typeof coin === "string" &&
          SUGGESTED_COINS.includes(coin.toUpperCase()),
      )
      .map((coin) => coin.toUpperCase())
      .slice(0, 20);

    if (validCoins.length > 0) {
      return validCoins;
    }
  }
  return DEFAULT_COIN_OPTIONS.slice();
};

const saveCoinOptionsToStorage = (coinOptions) =>
  saveJsonSetting(STORAGE_KEY, coinOptions);

// Theme helper functions
const loadThemeFromStorage = () =>
  loadEnumSetting(THEME_STORAGE_KEY, ["auto", "light", "dark"], "auto");

const saveThemeToStorage = (theme) => saveSetting(THEME_STORAGE_KEY, theme);

// Green/red or blue/orange for up and down (theme.js)
const loadDirectionPalette = () =>
  loadEnumSetting(DIRECTION_PALETTE_KEY, DIRECTION_PALETTES, "classic");
const saveDirectionPalette = (value) => saveSetting(DIRECTION_PALETTE_KEY, value);

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

/* How many times the rating has been asked for, and the earliest moment the
 * next ask may come — see RATE_PROMPT_SNOOZE_DAYS. An install from before the
 * schedule that saw the one-time ask counts as one ask, due now. Broken
 * storage is "asked enough": never nag. */
const loadRateAsks = () => {
  try {
    const v = JSON.parse(localStorage.getItem(RATE_PROMPT_ASKS_KEY));
    if (v && Number.isFinite(v.n) && v.n >= 0)
      return { n: Math.min(Math.floor(v.n), RATE_PROMPT_MAX_ASKS), next: Number.isFinite(v.next) ? v.next : 0 };
    return { n: loadRatePromptShown() ? 1 : 0, next: 0 };
  } catch (error) {
    return { n: RATE_PROMPT_MAX_ASKS, next: Infinity };
  }
};

// Is an ask due now: past the first delay, not ended, under the cap, past the snooze
const rateAskDue = (now = Date.now()) => {
  if (loadRatePromptDismissed()) return false;
  if (now - getOrInitFirstUse() < RATE_PROMPT_DELAY_MS) return false;
  const a = loadRateAsks();
  return a.n < RATE_PROMPT_MAX_ASKS && now >= a.next;
};

// One ask shown: counted, and the next one put off by the schedule's next step
const recordRateAsk = (now = Date.now()) => {
  const a = loadRateAsks();
  const days = RATE_PROMPT_SNOOZE_DAYS[Math.min(a.n, RATE_PROMPT_SNOOZE_DAYS.length - 1)];
  saveJsonSetting(RATE_PROMPT_ASKS_KEY, { n: a.n + 1, next: now + days * 86400000 });
  saveRatePromptShown();
};

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
    const expiredAt = Number(a.expiredAt);
    const keepFor = Number(a.keepFor);
    const repeated = Number(a.repeated);
    clean.push({
      id: typeof a.id === "string" && a.id ? a.id : `${coin || "portfolio"}-${Date.now()}-${clean.length}`,
      coin: kind === "portfolio" ? "" : coin,
      kind,
      direction: a.direction,
      target,
      currency,
      created: isFinite(created) && created > 0 ? created : Date.now(),
      /* **Only a percent target has a window**, and one it does not recognise
       * becomes the default rather than dropping the target: an unreadable
       * window is a question we can still answer, where an unreadable price is
       * not. Absent on the other two kinds instead of null, so nothing
       * downstream can read a window off a target that never had one. */
      ...(kind === "percent"
        ? {
            window: PERCENT_WINDOW_OPTIONS.some((o) => o.value === Number(a.window))
              ? Number(a.window)
              : DEFAULT_PERCENT_WINDOW,
          }
        : {}),
      startPrice: isFinite(startPrice) && startPrice > 0 ? startPrice : null,
      triggeredAt: isFinite(triggeredAt) && triggeredAt > 0 ? triggeredAt : null,
      hitPrice: isFinite(hitPrice) && hitPrice > 0 ? hitPrice : null,
      /* The four fields added on 21 Sep 2026 — a note, a keep-for span, a
       * repeat flag and the moment a span ran out — are **absent when they
       * are not set**, the rule the window already follows: a target written
       * before they existed loads exactly as it did, and a reader that asks
       * `a.note || ""` gets the same answer either way. A span nobody offers
       * is dropped rather than the target; repeat is a price target's alone,
       * because a move target re-arms itself by the window passing. */
      ...(typeof a.note === "string" && a.note.trim()
        ? { note: a.note.trim().slice(0, ALERT_NOTE_MAX) }
        : {}),
      ...(isFinite(keepFor) && ALERT_KEEP_OPTIONS.some((o) => o.value === keepFor)
        ? { keepFor }
        : {}),
      ...(kind === "price" && a.repeat === true ? { repeat: true } : {}),
      ...(isFinite(repeated) && repeated > 0 ? { repeated: Math.floor(repeated) } : {}),
      ...(isFinite(expiredAt) && expiredAt > 0 && !(isFinite(triggeredAt) && triggeredAt > 0)
        ? { expiredAt }
        : {}),
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

/* The two alarm switches. The permission is never stored — see
 * `ALARM_NOTIFY_KEY` — so "on" here means "wanted", and whether it can
 * actually fire is asked of Chrome. */
const loadPracticeDock = () => loadBoolSetting(PRACTICE_DOCK_KEY, true);
const savePracticeDock = (v) => saveSetting(PRACTICE_DOCK_KEY, v);

/* The tax helper's choices: a country it knows and, per country, rates in
   percent between 0 and 100 under the names that country uses. Anything
   else is dropped, so a hand-edited file cannot put a rate of 900 on
   screen. */
/* The tax helper's choices: the country (any the world list knows — "uk",
   its old name for the United Kingdom, is read as "gb") and the rates typed
   for each country with a model, only under that model's own rate names. */
const sanitizeTaxSettings = (raw) => {
  const out = { country: null, rates: {} };
  if (!raw || typeof raw !== "object") return out;
  const entry = (c) => (typeof taxWorldEntry === "function" ? taxWorldEntry(c) : null);
  const id = (c) => (String(c).toLowerCase() === "uk" ? "gb" : String(c).toLowerCase());
  if (typeof raw.country === "string" && entry(raw.country)) out.country = id(raw.country);
  const rates = raw.rates && typeof raw.rates === "object" ? raw.rates : {};
  for (const c of Object.keys(rates)) {
    const e = entry(c);
    const given = rates[c];
    if (!e || !e.m || !e.m.rates || !given || typeof given !== "object") continue;
    const kept = {};
    for (const name of Object.keys(e.m.rates)) {
      const v = Number(given[name]);
      if (given[name] != null && given[name] !== "" && Number.isFinite(v) && v >= 0 && v <= 100) kept[name] = Math.round(v * 100) / 100;
    }
    if (Object.keys(kept).length) out.rates[id(c)] = kept;
  }
  return out;
};
const loadTaxSettings = () => sanitizeTaxSettings(loadJsonSetting(TAX_SETTINGS_KEY));
const saveTaxSettings = (settings) => saveJsonSetting(TAX_SETTINGS_KEY, sanitizeTaxSettings(settings));

/* The terminal's three seams. Rebuilt field by field: an unknown key, a
   string or a size outside its limits is dropped rather than kept, and a
   missing field is the default (`sanitizers rebuild the object`). */
const sanitizePracticeLayout = (raw) => {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(PRACTICE_LAYOUT_LIMITS)) {
    const v = raw[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const [lo, hi] = PRACTICE_LAYOUT_LIMITS[key];
    out[key] = Math.round(Math.min(hi, Math.max(lo, v)));
  }
  return out;
};
const loadPracticeLayout = () => sanitizePracticeLayout(loadJsonSetting(PRACTICE_LAYOUT_KEY));
const savePracticeLayout = (layout) => saveJsonSetting(PRACTICE_LAYOUT_KEY, sanitizePracticeLayout(layout));
const loadPracticeChartStyle = () => loadEnumSetting(PRACTICE_CHART_STYLE_KEY, PRACTICE_CHART_STYLES, "candles");
const savePracticeChartStyle = (v) => saveSetting(PRACTICE_CHART_STYLE_KEY, v);
const loadPracticeConfirm = () => loadBoolSetting(PRACTICE_CONFIRM_KEY, false);
const savePracticeConfirm = (v) => saveSetting(PRACTICE_CONFIRM_KEY, v);

const loadAlarmNotify = () => loadBoolSetting(ALARM_NOTIFY_KEY, DEFAULT_ALARM);
const saveAlarmNotify = (enabled) => saveSetting(ALARM_NOTIFY_KEY, enabled);
const loadAlarmSound = () => loadBoolSetting(ALARM_SOUND_KEY, DEFAULT_ALARM);
const saveAlarmSound = (enabled) => saveSetting(ALARM_SOUND_KEY, enabled);

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

// The moving-average line — see CHART_AVERAGE_KEY
const loadChartAverage = () =>
  loadBoolSetting(CHART_AVERAGE_KEY, DEFAULT_CHART_AVERAGE);
const saveChartAverage = (enabled) => saveSetting(CHART_AVERAGE_KEY, enabled);
// The chart's tool strip — see CHART_TOOLS_KEY
const loadChartTools = () => loadBoolSetting(CHART_TOOLS_KEY, DEFAULT_CHART_TOOLS);
const saveChartTools = (enabled) => saveSetting(CHART_TOOLS_KEY, enabled);
// The US-release markers and the line under the price — see MACRO_EVENTS_KEY
const loadMacroEvents = () => loadBoolSetting(MACRO_EVENTS_KEY, DEFAULT_MACRO_EVENTS);
const saveMacroEvents = (enabled) => saveSetting(MACRO_EVENTS_KEY, enabled);
// Indicator lines — see INDICATOR_OVERLAYS_KEY. Read as a set; a value
// stored before the set existed (the single choice) is its first member.
const loadIndicatorOverlays = () => {
  const saved = loadJsonSetting(INDICATOR_OVERLAYS_KEY);
  if (Array.isArray(saved)) {
    return INDICATOR_OVERLAYS.filter((k) => k !== "none" && saved.includes(k));
  }
  const single = loadEnumSetting(INDICATOR_OVERLAY_KEY, INDICATOR_OVERLAYS, DEFAULT_INDICATOR_OVERLAY);
  return single === "none" ? [] : [single];
};
const saveIndicatorOverlays = (kinds) => saveJsonSetting(INDICATOR_OVERLAYS_KEY, kinds);
// The chart's counted studies — see CHART_STUDIES_KEY. A set, in the list's
// own order; an id nothing knows any more is dropped.
const loadChartStudies = () => {
  const saved = loadJsonSetting(CHART_STUDIES_KEY);
  return Array.isArray(saved) ? CHART_STUDIES.filter((k) => saved.includes(k)) : [];
};
const saveChartStudies = (ids) => saveJsonSetting(CHART_STUDIES_KEY, ids);
// The chances under the price — see CHART_CHANCES_KEY
const loadChartChances = () => {
  const saved = loadJsonSetting(CHART_CHANCES_KEY);
  return Array.isArray(saved) ? CHART_CHANCES.filter((k) => saved.includes(k)) : DEFAULT_CHART_CHANCES.slice();
};
const saveChartChances = (ids) => saveJsonSetting(CHART_CHANCES_KEY, ids);
// Headlines kept to read later — see NEWS_SAVED_KEY. Rebuilt field by field:
// only an https link is kept, since the row opens it, and each link once.
const sanitizeNewsSaved = (list) => {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const url = typeof x.url === "string" && /^https:\/\//.test(x.url) ? x.url.slice(0, 800) : "";
    const title = typeof x.title === "string" ? x.title.trim().slice(0, 300) : "";
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const time = Number(x.time);
    const savedAt = Number(x.savedAt);
    out.push({
      url,
      title,
      source: typeof x.source === "string" ? x.source.slice(0, 60) : "",
      summary: typeof x.summary === "string" ? x.summary.slice(0, 400) : "",
      time: Number.isFinite(time) && time > 0 ? time : 0,
      savedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : 0,
    });
    if (out.length >= NEWS_SAVED_MAX) break;
  }
  return out;
};
const loadNewsSaved = () => sanitizeNewsSaved(loadJsonSetting(NEWS_SAVED_KEY));
const saveNewsSaved = (list) => saveJsonSetting(NEWS_SAVED_KEY, list);

/* The drawings, rebuilt field by field — a stored shape keeps only what is
 * named here. `{ COIN: [{ id, kind, currency, a: { t, p }, b?, note?, at }] }`:
 * a coin the app knows, a kind it draws, a currency it offers, anchors with a
 * finite time and a price above zero (two for the kinds that need two), a
 * note cut to its length, and at most `DRAWINGS_MAX_PER_COIN` a coin, newest
 * kept. A hand-edited file cannot put a NaN into a line or a script into a
 * note — the note is drawn as text, never as markup, and is trimmed here. */
const sanitizeDrawings = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  // Chart coins only: a coin that is priced but never drawn has no chart to draw on
  const coins = SUGGESTED_COINS;
  const currencies = CURRENCY_OPTIONS.map((c) => (typeof c === "string" ? c : c.value));
  const anchor = (x) => {
    if (!x || typeof x !== "object") return null;
    const t = Number(x.t);
    const p = Number(x.p);
    return Number.isFinite(t) && t > 0 && Number.isFinite(p) && p > 0 ? { t, p } : null;
  };
  const out = {};
  for (const coin of Object.keys(raw)) {
    if (!coins.includes(coin) || !Array.isArray(raw[coin])) continue;
    const list = [];
    const seen = new Set();
    for (const d of raw[coin]) {
      if (!d || typeof d !== "object" || !DRAWING_KINDS.includes(d.kind)) continue;
      const id = typeof d.id === "string" && /^[a-z0-9-]{1,40}$/i.test(d.id) ? d.id : null;
      if (!id || seen.has(id) || !currencies.includes(d.currency)) continue;
      const a = anchor(d.a);
      const two = d.kind !== "hline" && d.kind !== "note";
      const b = two ? anchor(d.b) : null;
      if (!a || (two && !b)) continue;
      seen.add(id);
      const item = { id, kind: d.kind, currency: d.currency, a };
      if (b) item.b = b;
      const note = typeof d.note === "string" ? d.note.trim().slice(0, DRAWING_NOTE_MAX) : "";
      if (note) item.note = note;
      const at = Number(d.at);
      item.at = Number.isFinite(at) && at > 0 ? at : 0;
      list.push(item);
    }
    list.sort((x, y) => x.at - y.at);
    if (list.length) out[coin] = list.slice(-DRAWINGS_MAX_PER_COIN);
  }
  return out;
};
const loadDrawings = () => sanitizeDrawings(loadJsonSetting(DRAWINGS_KEY));
const saveDrawings = (all) => saveJsonSetting(DRAWINGS_KEY, all);

// The companion's metrics switched off — see COMPANION_HIDDEN_KEY. Only
// strings are kept; an id nothing knows any more simply matches nothing.
// Room for every metric switched off at once: 49 since 1 Oct 2026.
const loadCompanionHidden = () => {
  const saved = loadJsonSetting(COMPANION_HIDDEN_KEY);
  return Array.isArray(saved) ? saved.filter((id) => typeof id === "string" && id.length < 40).slice(0, 100) : [];
};
const saveCompanionHidden = (ids) => saveJsonSetting(COMPANION_HIDDEN_KEY, ids);
// The chart companion — see COMPANION_KEY
const loadCompanion = () => loadBoolSetting(COMPANION_KEY, DEFAULT_COMPANION);
const saveCompanion = (enabled) => saveSetting(COMPANION_KEY, enabled);

// A logarithmic price axis — see LOG_SCALE_KEY
const loadLogScale = () => loadBoolSetting(LOG_SCALE_KEY, DEFAULT_LOG_SCALE);
const saveLogScale = (enabled) => saveSetting(LOG_SCALE_KEY, enabled);

const loadMoveNews = () => loadBoolSetting(MOVE_NEWS_KEY, DEFAULT_MOVE_NEWS);

const saveMoveNews = (enabled) => saveSetting(MOVE_NEWS_KEY, enabled);

/* Which sources the news panel is showing, as `{ "Cointelegraph": false }` —
 * an absent key means on. Stored that way round on purpose: the set of sources
 * grows, and a stored allow-list would silently hide every source added after
 * it was written. Only `false` is ever recorded, so a new outlet arrives
 * visible and an old one stays hidden. */
const loadNewsPanelSources = () => {
  const saved = loadJsonSetting(NEWS_PANEL_KEY);
  const good = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  const out = {};
  for (const key of Object.keys(good)) {
    if (typeof key === "string" && good[key] === false) out[key] = false;
  }
  /* An opt-in source (NEWS_SOURCES' `optIn`) is off unless stored on, so
     every reader of this map — which treats "absent" as on — sees it off. */
  for (const src of typeof NEWS_SOURCES !== "undefined" ? NEWS_SOURCES : []) {
    if (src.optIn) out[src.name] = good[src.name] === true;
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

const loadTabKeys = () => loadBoolSetting(TAB_KEYS_KEY, DEFAULT_TAB_KEYS);
const saveTabKeys = (enabled) => saveSetting(TAB_KEYS_KEY, enabled);

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
const loadTravelBand = () =>
  loadBoolSetting(TRAVEL_BAND_KEY, DEFAULT_TRAVEL_BAND);
const saveTravelBand = (v) => saveSetting(TRAVEL_BAND_KEY, v);
const loadCellOdds = () => loadBoolSetting(CELL_ODDS_KEY, DEFAULT_CELL_ODDS);
const saveCellOdds = (v) => saveSetting(CELL_ODDS_KEY, v);

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

// The news panel's own last-opened stamp, read exactly the same way.
const loadNewsSeenAt = () => {
  try {
    const raw = Number(localStorage.getItem(NEWS_SEEN_KEY));
    return isFinite(raw) && raw > 0 ? raw : 0;
  } catch (error) {
    return 0;
  }
};
const saveNewsSeenAt = (at) => saveSetting(NEWS_SEEN_KEY, at);

/* Practice Lab. `sanitizePractice` owns every rule about what these numbers
 * mean; storage only carries them. The session is typed user state, so it is
 * never an eviction candidate — see `EPHEMERAL_CACHE_KEYS`. */
const loadPractice = () => sanitizePractice(loadJsonSetting(PRACTICE_STATE_KEY));
/* Returns whether the write landed, and the caller is expected to use it: a
 * transition that could not be saved must not be shown as if it had. */
const savePractice = (v) => saveJsonSetting(PRACTICE_STATE_KEY, v);
const loadPracticeUnits = () =>
  loadEnumSetting(PRACTICE_UNITS_KEY, PRACTICE_UNIT_OPTIONS, PRACTICE_UNITS_COIN);
const savePracticeUnits = (v) => saveSetting(PRACTICE_UNITS_KEY, v);
/* **The ticket's own memory.** Validated on the way in rather than trusted:
 * this is user-writable storage, and a leverage of `"200x"` or of 5,000 would
 * reach `practiceOpen` as a number the model has to refuse. Coins are capped
 * so a long rotation cannot grow the key without bound — the oldest simply
 * fall off, and a coin with nothing remembered starts at the default. */
const loadPracticeTicket = () => {
  const raw = loadJsonSetting(PRACTICE_TICKET_KEY);
  const out = { leverage: {}, share: DEFAULT_PRACTICE_SHARE };
  if (!raw || typeof raw !== "object") return out;
  const lev = raw.leverage && typeof raw.leverage === "object" ? raw.leverage : {};
  for (const coin of Object.keys(lev).slice(0, PRACTICE_TICKET_COINS)) {
    const v = lev[coin];
    if (SUGGESTED_COINS.includes(coin) && practiceLeverageOk(v)) out.leverage[coin] = v;
  }
  if (PRACTICE_SIZE_SHARES.includes(raw.share)) out.share = raw.share;
  return out;
};
const savePracticeTicket = (v) => saveJsonSetting(PRACTICE_TICKET_KEY, v);
const loadPracticeConsent = () => loadBoolSetting(PRACTICE_CONSENT_KEY, false);
// The news panel's one-time ask, put away with "Not now" — see NEWS_ASK_SEEN_KEY
const loadNewsAskSeen = () => loadBoolSetting(NEWS_ASK_SEEN_KEY, false);
const saveNewsAskSeen = () => saveSetting(NEWS_ASK_SEEN_KEY, true);
const savePracticeConsent = () => saveSetting(PRACTICE_CONSENT_KEY, true);
/* Off by default, like every other addition in this codebase: the plain chart
 * is what ships, and a leveraged ticket is not something to arrive at
 * unasked. */
/* `{ compare: false }` — absent is on, and only false is ever written, so a
 * feature added in a later version arrives switched on rather than being
 * silently disabled by an old stored list. Anything that is not one of the
 * known keys is dropped on read: a hand-edited file must not be able to turn
 * off something the Settings list has no row for, which would leave it off
 * with no way back. Futures keeps its own key (`store: "practice"`) and is
 * skipped here. */
const loadFeatures = () => {
  const raw = loadJsonSetting(FEATURES_KEY, {});
  const out = {};
  if (raw && typeof raw === "object") {
    for (const c of FEATURE_CONTROLS) {
      if (!c.store && raw[c.key] === false) out[c.key] = false;
    }
  }
  return out;
};
const saveFeatures = (v) => saveJsonSetting(FEATURES_KEY, v);

/* **On by default, and that is a reversal with a reason.**
 *
 * It shipped off, on the rule this codebase applies to every addition: the
 * plain chart is what ships, and a leveraged ticket is not something to
 * arrive at unasked. Two things changed that.
 *
 * The first is the terms gate. Opening the section lands on four paragraphs
 * saying it is a simulation with an imaginary balance, and there is no ticket
 * behind them until they are read. The button does not show anyone a
 * leveraged form; it shows them a sentence about one. The switch was doing
 * the safety work before that gate existed, and is not doing it now.
 *
 * The second is the Features list. Every other feature there is on, so one
 * row switched off reads as a fault rather than as a default — and it was the
 * only reason the control was missing from the corner, with no way to find
 * out why short of opening Settings and reading eight rows.
 *
 * Turning it off is still a real off: no button, no shortcut, no marking. */
const loadPracticeEnabled = () => loadBoolSetting(PRACTICE_ENABLED_KEY, true);
const savePracticeEnabled = (v) => saveSetting(PRACTICE_ENABLED_KEY, v);

// The interface's root text size — see TEXT_SIZE_KEY.
const loadTextSize = () =>
  loadEnumSetting(
    TEXT_SIZE_KEY,
    TEXT_SIZE_OPTIONS.map((o) => o.value),
    DEFAULT_TEXT_SIZE,
  );
const saveTextSize = (v) => saveSetting(TEXT_SIZE_KEY, v);
/* One place decides what a stored value means in pixels, so the pass that runs
 * before React and the handler that runs after it cannot disagree. */
const textSizePx = (value) => {
  const found = TEXT_SIZE_OPTIONS.find((o) => o.value === value);
  return (found || TEXT_SIZE_OPTIONS.find((o) => o.value === DEFAULT_TEXT_SIZE)).px;
};
const applyTextSize = (value) => {
  document.documentElement.style.fontSize = `${textSizePx(value)}px`;
};

/* The panel order — see `PANEL_ORDER_KEY`.
 *
 * Rebuilt from the default rather than trusted: anything stored that this
 * version does not have is dropped, anything it has gained is appended, and
 * Settings is pulled back to the front whatever the file says. A hand-edited
 * or out-of-date file must not be able to leave a panel with no tab, which is
 * the same rule every sanitiser in this app follows. */
const loadPanelOrder = () => {
  const stored = loadJsonSetting(PANEL_ORDER_KEY);
  const known = DEFAULT_PANEL_ORDER;
  const kept = Array.isArray(stored)
    ? stored.filter((k, i) => known.includes(k) && stored.indexOf(k) === i)
    : [];
  const order = kept.concat(known.filter((k) => !kept.includes(k)));
  return ["settings"].concat(order.filter((k) => k !== "settings"));
};
const savePanelOrder = (order) =>
  saveJsonSetting(PANEL_ORDER_KEY, Array.isArray(order) ? order : DEFAULT_PANEL_ORDER);


/* The Custom mode's slot — see `CUSTOM_MODE_KEY`.
 *
 * Sanitised on the way in like every other stored shape: only the keys a mode
 * actually governs survive, so a hand-edited file cannot make "restore my
 * arrangement" write a setting no mode is allowed to touch. Widgets come back
 * as plain booleans for the same reason. An unreadable slot is an empty one —
 * the failure that costs nothing is Custom simply not lighting up. */
const loadCustomMode = () => {
  const raw = loadJsonSetting(CUSTOM_MODE_KEY);
  if (!raw || typeof raw !== "object" || !raw.settings) return null;
  const settings = {};
  for (const key of MODE_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw.settings, key)) {
      settings[key] = raw.settings[key];
    }
  }
  if (!Object.keys(settings).length) return null;
  const widgets = {};
  if (raw.widgets && typeof raw.widgets === "object") {
    for (const w of Object.keys(raw.widgets)) widgets[w] = Boolean(raw.widgets[w]);
  }
  return { settings, widgets, savedAt: Number(raw.savedAt) || 0 };
};

const saveCustomMode = (settings, widgets) => {
  const kept = {};
  for (const key of MODE_SETTING_KEYS) {
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) {
      kept[key] = settings[key];
    }
  }
  const on = {};
  for (const w of Object.keys(widgets || {})) on[w] = Boolean(widgets[w]);
  return saveJsonSetting(CUSTOM_MODE_KEY, {
    settings: kept,
    widgets: on,
    savedAt: Date.now(),
  });
};

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
      /* **How likely the square was, measured when it was named.**
       *
       * Kept for the same reason `settledAt` is, and it is the same trap: a
       * field left out of this shape exists until the next reload and then
       * quietly does not. Without it the record cannot say what a call was
       * worth — a hit rate treats naming the square the price is already in as
       * equal to naming one four squares out, which is the whole thing the
       * odds are there to separate.
       *
       * `p` is a probability and `n` the sample behind it; both are validated
       * because a hand-edited file must not be able to make an easy square
       * pay like a hard one. A call placed before this existed carries null
       * and is left out of the comparison rather than counted as a certainty. */
      /* How sure the caller said they were — one of three words, or nothing.
       * Kept for the same reason `odds` is: the calibration table under the
       * scoreboard is built from settled calls, and a field this shape does
       * not name is gone at the next reload. */
      confidence: CALL_CONFIDENCE_LEVELS.includes(c.confidence) ? c.confidence : null,
      odds:
        c.odds &&
        typeof c.odds === "object" &&
        typeof c.odds.p === "number" &&
        isFinite(c.odds.p) &&
        c.odds.p >= 0 &&
        c.odds.p <= 1 &&
        typeof c.odds.n === "number" &&
        isFinite(c.odds.n) &&
        c.odds.n > 0
          ? { p: c.odds.p, n: Math.round(c.odds.n) }
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

/* The model outlook's forecasts as issued. Rebuilt field by field and
   bounded; a record whose numbers do not hang together (an origin off the
   hour, a band out of order, a probability outside [0, 1]) is dropped. */
const MODEL_OUTLOOK_HOUR_MS = 3600e3;
const sanitizeModelOutlookRecords = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const r of raw) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || r.id.length > 80 || seen.has(r.id)) continue;
    const origin = Number(r.origin);
    const target = Number(r.target);
    const s0 = Number(r.s0);
    const lo = Number(r.lo);
    const median = Number(r.median);
    const hi = Number(r.hi);
    if (!Number.isInteger(origin) || origin % MODEL_OUTLOOK_HOUR_MS !== 0 || target !== origin + MODEL_OUTLOOK_HOUR_MS) continue;
    if (!(s0 > 0 && lo > 0 && lo <= median && median <= hi && Number.isFinite(hi))) continue;
    const rec = {
      id: r.id,
      model: typeof r.model === "string" ? r.model.slice(0, 40) : "",
      source: typeof r.source === "string" ? r.source.slice(0, 20) : "",
      origin, target, s0, lo, median, hi,
    };
    const k = Number(r.targetPrice);
    const p = Number(r.pAbove);
    if (k > 0 && p >= 0 && p <= 1) {
      rec.targetPrice = k;
      rec.pAbove = p;
    }
    seen.add(rec.id);
    out.push(rec);
  }
  return out.slice(-MODEL_OUTLOOK_RECORDS_MAX);
};
const sanitizeModelOutlookOutcomes = (raw) => {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, o] of Object.entries(raw).slice(-MODEL_OUTLOOK_RECORDS_MAX)) {
    if (typeof id !== "string" || id.length > 80 || !o || typeof o !== "object") continue;
    if (o.none === true) {
      out[id] = { none: true };
      continue;
    }
    const close = Number(o.close);
    if (!(close > 0) || typeof o.inside !== "boolean") continue;
    out[id] = { close, inside: o.inside, ...(typeof o.above === "boolean" ? { above: o.above } : {}) };
  }
  return out;
};
const loadModelOutlookRecords = () => sanitizeModelOutlookRecords(loadJsonSetting(MODEL_OUTLOOK_RECORDS_KEY, null));
const saveModelOutlookRecords = (list) => saveJsonSetting(MODEL_OUTLOOK_RECORDS_KEY, sanitizeModelOutlookRecords(list));
const loadModelOutlookOutcomes = () => sanitizeModelOutlookOutcomes(loadJsonSetting(MODEL_OUTLOOK_OUTCOMES_KEY, null));
const saveModelOutlookOutcomes = (map) => saveJsonSetting(MODEL_OUTLOOK_OUTCOMES_KEY, sanitizeModelOutlookOutcomes(map));
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
    /* **An income receipt** — staking, a reward, an airdrop (28 Sep 2026).
       Its `paid` is its market value when it arrived: the income the tax
       report counts, and the cost a later sale is measured against. Named,
       or it would come back a purchase on the next tab. */
    if (lot.kind === "income") clean.kind = "income";
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
      // Named, or a sold income receipt comes back as a purchase
      ...(m.kind === "income" ? { kind: "income" } : {}),
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
/* A target share, as a percentage of the tracked total.
 *
 * **`null` is the normal state and 0 is a real answer** — "I want to hold none
 * of this" is a position somebody can genuinely hold, and it is not the same
 * as never having set a target. So the absent case is tested for explicitly
 * before the number is read: `Number(null)` is 0 and `isFinite(null)` is
 * `true`, which would have turned every holding on the screen into one with a
 * target of zero and reported the whole portfolio as over.
 *
 * Kept to one decimal: the field is a share of a portfolio, and nobody means
 * the third decimal place of a percent. */
const sanitizeTargetShare = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
};

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
     * a holding whether or not there is a line to look at.
     *
     * **It reads `HOLDABLE_COINS` rather than rebuilding the test.** This line
     * used to be `SUGGESTED_COINS.includes(coin) || isWatchableCoin(coin)` —
     * that list's own definition, written a second time — and when the
     * price-only tier was added to the list on 12 Sep 2026 the second copy
     * would have gone on refusing it: offered by the search, kept in memory,
     * gone on the next tab open. Exactly the failure this comment was written
     * about, one rung up. The list is still closed, so the protection against
     * a hand-edited file is unchanged. */
    if (!isHoldableCoin(coin) || seen.has(coin)) continue;
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
      target: sanitizeTargetShare(entry.target),
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

/* Which of the three views the value chart opens on.
 *
 * Reads the old boolean key when the new one is absent, so an existing choice
 * survives the view being added rather than being silently reset — `true` was
 * the by-coin stack, `false` was the total. Written to the new key from then
 * on; the old one is left alone rather than deleted, because a downgrade
 * should still find what it wrote. */
const loadPortfolioChartMode = () => {
  const saved = loadEnumSetting(
    PORTFOLIO_CHART_MODE_KEY,
    PORTFOLIO_CHART_MODES,
    "",
  );
  if (saved) return saved;
  return loadPortfolioStackedFromStorage() ? "bycoin" : DEFAULT_PORTFOLIO_CHART_MODE;
};

const savePortfolioChartMode = (mode) =>
  saveSetting(PORTFOLIO_CHART_MODE_KEY, mode);

const loadPortfolioSortFromStorage = () =>
  loadEnumSetting(
    PORTFOLIO_SORT_KEY,
    PORTFOLIO_SORT_OPTIONS.map((o) => o.value),
    DEFAULT_PORTFOLIO_SORT,
  );

const savePortfolioSortToStorage = (sort) =>
  saveSetting(PORTFOLIO_SORT_KEY, sort);

// Amounts masked on the portfolio screen — see PORTFOLIO_HIDDEN_KEY
const loadPortfolioHiddenFromStorage = () =>
  loadBoolSetting(PORTFOLIO_HIDDEN_KEY, DEFAULT_PORTFOLIO_HIDDEN);

const savePortfolioHiddenToStorage = (hidden) =>
  saveSetting(PORTFOLIO_HIDDEN_KEY, hidden);

/* ── BACKING UP EVERYTHING THIS BROWSER KNOWS ────────────────────────────
 *
 * **There are sixty-four `crypto_chart_*` keys and, until now, exactly one
 * export path** — the portfolio's. The calls record, the price targets, the
 * practice account, the widget layout, the modes, the language, the currency:
 * all of it was lost on a new machine, a cleared profile, or a reinstall, and
 * there was nothing the person could have done about it beforehand.
 *
 * `chrome.storage.sync` is the obvious answer and is not available here: it is
 * a permission, and "zero permissions at install" is a shipped promise. A file
 * is the zero-permission answer, and it is also the more honest one — it goes
 * where the reader puts it and nowhere else.
 *
 * **The caches are deliberately left out.** `EPHEMERAL_CACHE_KEYS` already
 * names everything that is rebuildable from the network, and a backup of a
 * price cache is dead weight that is stale before it lands. What is kept is
 * exactly what a person typed or chose.
 */
const BACKUP_APP = "pricetab";
const BACKUP_VERSION = 1;
const BACKUP_KEY_RE = /^crypto_chart_[a-z0-9_]+$/;
// Generous against anything a person could produce here, and a bound against
// a file that is not one: the portfolio is the largest value and a big one is
// tens of kilobytes.
const BACKUP_MAX_VALUE = 524288;
const BACKUP_MAX_KEYS = 200;
/* The snapshot a restore leaves behind so it can be undone, and its own key —
 * excluded from backups, because a backup of the state before the last restore
 * is not part of anybody's settings. */
const BACKUP_UNDO_KEY = "crypto_chart_backup_undo";
const BACKUP_UNDO_MAX_AGE = 86400000;

const backupExcluded = (key) =>
  key === BACKUP_UNDO_KEY || EPHEMERAL_CACHE_KEYS.includes(key);

/* Everything worth keeping, read straight out of storage.
 *
 * Deliberately **not** a list of the keys this build knows about: a hand-kept
 * list is one a new setting gets left out of, silently, and the person only
 * finds out when the restore does not bring it back. The prefix is the rule. */
const buildSettingsBackup = () => {
  const keys = {};
  let count = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !BACKUP_KEY_RE.test(key) || backupExcluded(key)) continue;
      const value = localStorage.getItem(key);
      if (typeof value !== "string" || value.length > BACKUP_MAX_VALUE) continue;
      keys[key] = value;
      count += 1;
      if (count >= BACKUP_MAX_KEYS) break;
    }
  } catch (error) {
    // Storage unavailable — an empty backup, which the caller refuses to save
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, at: Date.now(), keys };
};

/* What a file actually holds, before anything is written.
 *
 * Returns the keys it would restore, or null if this is not one of our files.
 * **The count is shown to the person before they commit**, which is the only
 * part of a restore that cannot be undone by the undo below: the reading of
 * it. Every value is left as the string it was — the readers above
 * (`loadBoolSetting`, `loadEnumSetting`, the `sanitize*` family) are what
 * decide whether a value is usable, and they already treat storage as
 * untrusted input. This adds the boundary they cannot: **which keys exist at
 * all.** */
const readSettingsBackup = (parsed) => {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (parsed.app !== BACKUP_APP) return null;
  const source = parsed.keys;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const keys = {};
  let count = 0;
  for (const key of Object.keys(source)) {
    if (!BACKUP_KEY_RE.test(key) || backupExcluded(key)) continue;
    const value = source[key];
    if (typeof value !== "string" || value.length > BACKUP_MAX_VALUE) continue;
    keys[key] = value;
    count += 1;
    if (count >= BACKUP_MAX_KEYS) break;
  }
  if (!count) return null;
  return {
    keys,
    count,
    at: typeof parsed.at === "number" && isFinite(parsed.at) ? parsed.at : null,
  };
};

/* Write it, keeping what was there.
 *
 * **A restore adds and replaces; it does not clear.** A key this file has no
 * opinion about is a setting the backup predates, and throwing it away would
 * make "restore my settings" mean "and forget everything since". The panel
 * says so in as many words.
 *
 * The snapshot of what is being overwritten goes down **first**, so an
 * interrupted restore leaves a way back rather than a half-written profile.
 */
const restoreSettingsBackup = (backup) => {
  if (!backup || !backup.keys) return null;
  const before = {};
  const added = [];
  try {
    for (const key of Object.keys(backup.keys)) {
      const current = localStorage.getItem(key);
      /* A key that did not exist is not "an empty value" — undoing has to
       * remove it, or the way back leaves settings behind that were never
       * there. The two cases are kept apart rather than folded into one map
       * with empty strings in it. */
      if (typeof current === "string") before[key] = current;
      else added.push(key);
    }
    writeStorage(
      BACKUP_UNDO_KEY,
      JSON.stringify({ at: Date.now(), keys: before, added }),
    );
  } catch (error) {
    // No undo, which the caller cannot fix — the restore itself still stands
  }
  let written = 0;
  let refused = 0;
  for (const key of Object.keys(backup.keys)) {
    if (writeStorage(key, backup.keys[key])) written += 1;
    else refused += 1;
  }
  return { written, refused };
};

/* The way back, for a day.
 *
 * A day rather than for ever because it is a snapshot of a moment nobody chose
 * to keep, and an "undo" offered next month is offering to undo something the
 * person has since built on. */
const pendingBackupUndo = () => {
  const saved = loadJsonSetting(BACKUP_UNDO_KEY);
  if (!saved || typeof saved !== "object" || !saved.keys) return null;
  const at = typeof saved.at === "number" && isFinite(saved.at) ? saved.at : 0;
  if (!at || Date.now() - at > BACKUP_UNDO_MAX_AGE) return null;
  const keys = Object.keys(saved.keys).filter(
    (k) => BACKUP_KEY_RE.test(k) && !backupExcluded(k),
  );
  const added = Array.isArray(saved.added)
    ? saved.added.filter((k) => typeof k === "string" && BACKUP_KEY_RE.test(k))
    : [];
  if (!keys.length && !added.length) return null;
  return { at, count: keys.length + added.length };
};

/* Put back what the restore overwrote, and remove what it added, so undo is
 * the state before rather than an approximation of it. */
const undoBackupRestore = () => {
  const saved = loadJsonSetting(BACKUP_UNDO_KEY);
  if (!saved || !saved.keys) return false;
  for (const key of Object.keys(saved.keys)) {
    if (!BACKUP_KEY_RE.test(key) || backupExcluded(key)) continue;
    writeStorage(key, saved.keys[key]);
  }
  if (Array.isArray(saved.added)) {
    for (const key of saved.added) {
      if (typeof key !== "string" || !BACKUP_KEY_RE.test(key)) continue;
      if (backupExcluded(key)) continue;
      try {
        localStorage.removeItem(key);
      } catch (error) {
        // Leave it: a key that will not go is better than a thrown restore
      }
    }
  }
  clearBackupUndo();
  return true;
};

const clearBackupUndo = () => {
  try {
    localStorage.removeItem(BACKUP_UNDO_KEY);
    return true;
  } catch (error) {
    return false;
  }
};

/* Which markets the compare drawer offers (COMPARE_MARKETS); absent = all. */
const sanitizeCompareMarkets = (raw) =>
  Array.isArray(raw) ? COMPARE_MARKETS.map((m) => m.id).filter((id) => raw.includes(id)) : DEFAULT_COMPARE_MARKETS.slice();
const loadCompareMarkets = () => sanitizeCompareMarkets(loadJsonSetting(COMPARE_MARKETS_KEY, null));
const saveCompareMarkets = (ids) => saveJsonSetting(COMPARE_MARKETS_KEY, sanitizeCompareMarkets(ids));

