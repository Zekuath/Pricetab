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

/* "Since your last visit" baselines: { COIN: { price, time } }. Entries are
 * validated on read (junk or expired ones dropped) so a corrupted store can
 * never show a nonsense comparison. */
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
    clean[coin] = { price, time };
  }
  return clean;
};

const saveLastSeen = (map) => saveJsonSetting(LAST_SEEN_KEY, map);

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

// Watched addresses of one holding: [{ address, amount, lots }] — each entry
// is one address whose on-chain balance (and inferred lots) is tracked
// separately from the manually entered part, so the row can break down
// "what came from where". Addresses must be valid for the holding's chain.
const sanitizeWatches = (list, coin) => {
  if (!Array.isArray(list) || !WATCH_CHAINS[coin]) return [];
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
      WATCH_CHAINS[coin] &&
      WATCH_ADDRESS_RE.test(legacyAddr)
    ) {
      watches = [{ address: legacyAddr, amount, lots }];
      amount = 0;
      lots = [];
    }
    seen.add(coin);
    clean.push({ coin, amount, lots, watches });
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
