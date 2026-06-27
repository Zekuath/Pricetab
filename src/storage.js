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

// Portfolio (tracking only): array of { coin, amount }. Coins are whitelisted
// against SUGGESTED_COINS and amounts coerced to a finite, non-negative number;
// anything malformed is dropped so a corrupted entry can't break the view.
const loadPortfolioFromStorage = () => {
  const saved = loadJsonSetting(PORTFOLIO_STORAGE_KEY);
  if (!Array.isArray(saved)) return [];
  const seen = new Set();
  const clean = [];
  for (const entry of saved) {
    if (!entry || typeof entry !== "object") continue;
    const coin = typeof entry.coin === "string" ? entry.coin.toUpperCase() : "";
    const amount = Number(entry.amount);
    if (!SUGGESTED_COINS.includes(coin) || seen.has(coin)) continue;
    if (!isFinite(amount) || amount < 0) continue;
    seen.add(coin);
    clean.push({ coin, amount });
  }
  return clean;
};

const savePortfolioToStorage = (holdings) =>
  saveJsonSetting(
    PORTFOLIO_STORAGE_KEY,
    Array.isArray(holdings) ? holdings : [],
  );
