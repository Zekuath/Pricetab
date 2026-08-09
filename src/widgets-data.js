/* WIDGET SETTINGS STORAGE */
const WIDGETS_STORAGE_KEY = "crypto_chart_widgets";
const HIDDEN_WIDGETS_KEY = "crypto_chart_hidden_widgets";

const loadHiddenWidgetsFromStorage = () =>
  loadJsonSetting(HIDDEN_WIDGETS_KEY) || {};

const saveHiddenWidgetsToStorage = (hidden) =>
  saveJsonSetting(HIDDEN_WIDGETS_KEY, hidden);

const DEFAULT_WIDGETS = {
  watchlist: false,
  topMovers: false,
  fearGreed: false,
  marketOverview: false,
  halvingCountdown: false,
  rsiWidget: false,
  fundingRate: false,
  longShortRatio: false,
  openInterest: false,
  liquidations: false,
  altcoinSeason: false,
};

// Shown to brand-new installs only (existing users keep their saved choices).
// A small, high-signal starter set so the panel demonstrates value on first open.
const STARTER_WIDGETS = {
  watchlist: true,
  fearGreed: true,
  marketOverview: true,
};

// One-click widget bundles for the two main audiences (+ a minimal set).
const WIDGET_PRESETS = {
  holder: {
    watchlist: true,
    topMovers: true,
    fearGreed: true,
    marketOverview: true,
    altcoinSeason: true,
  },
  trader: {
    fearGreed: true,
    rsiWidget: true,
    fundingRate: true,
    longShortRatio: true,
    openInterest: true,
    liquidations: true,
  },
  minimal: {
    watchlist: true,
    fearGreed: true,
  },
};

// A preset is "active" when the current toggles match it exactly
const isPresetActive = (widgets, presetKey) => {
  const preset = WIDGET_PRESETS[presetKey];
  if (!preset || !widgets) {
    return false;
  }
  return Object.keys(DEFAULT_WIDGETS).every(
    (key) => Boolean(widgets[key]) === Boolean(preset[key]),
  );
};

// Settings panel grouping + one-line explanations for each widget
const WIDGET_GROUPS = [
  {
    title: "Portfolio",
    items: [
      {
        key: "watchlist",
        label: "Watchlist",
        desc: "Your coins as a colour-coded 24h grid",
      },
      {
        key: "topMovers",
        label: "Top Movers",
        desc: "Today's biggest gainers and losers",
      },
    ],
  },
  {
    title: "Market",
    items: [
      {
        key: "fearGreed",
        label: "Fear & Greed",
        desc: "Market sentiment score from 0 to 100",
      },
      {
        key: "marketOverview",
        label: "Market Overview",
        desc: "Total market cap and BTC/ETH dominance",
      },
      {
        key: "halvingCountdown",
        label: "BTC Halving Countdown",
        desc: "Time until the next Bitcoin halving",
      },
      {
        key: "altcoinSeason",
        label: "Altcoin Season",
        desc: "Are altcoins outperforming Bitcoin?",
      },
    ],
  },
  {
    title: "Trader",
    items: [
      {
        key: "rsiWidget",
        label: "RSI",
        desc: "Momentum — overbought above 70, oversold below 30",
      },
      {
        key: "fundingRate",
        label: "Funding Rate",
        desc: "What longs pay shorts on perpetual futures",
      },
      {
        key: "longShortRatio",
        label: "Long / Short Ratio",
        desc: "How traders are positioned right now",
      },
      {
        key: "openInterest",
        label: "Open Interest",
        desc: "Value of open futures contracts",
      },
      {
        key: "liquidations",
        label: "Liquidations 24h",
        desc: "Forced position closures, last 24 hours",
      },
    ],
  },
];

const loadWidgetsFromStorage = () => {
  const saved = loadJsonSetting(WIDGETS_STORAGE_KEY);
  if (saved) {
    return { ...DEFAULT_WIDGETS, ...saved };
  }
  // New install → seed a curated starter set
  return { ...DEFAULT_WIDGETS, ...STARTER_WIDGETS };
};

const saveWidgetsToStorage = (widgets) =>
  saveJsonSetting(WIDGETS_STORAGE_KEY, widgets);

/* ── DERIVATIVES WIDGET FETCHERS (OKX + Bybit) ───────────────────────────
 * Moved off Binance: its futures API (fapi.binance.com) is geo-blocked in
 * the US, UK and other regions, so funding/OI/long-short silently failed for
 * a large share of users. OKX (already used for liquidations) covers funding
 * + open interest. OKX's long/short lives on its CORS-less "rubik" endpoint,
 * so that one uses Bybit, whose public API is CORS-enabled.
 */
const OKX_API = "https://www.okx.com/api/v5";
const BYBIT_API = "https://api.bybit.com";

const formatWidgetUsd = (n) => {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
};

const fetchFundingRate = async (coin) => {
  const key = coinWidgetKey("fundingRate", coin);
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${OKX_API}/public/funding-rate?instId=${coin}-USDT-SWAP`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const d = json && json.data && json.data[0];
    if (!d || d.fundingRate === "" || d.fundingRate == null) return null;
    const rate = parseFloat(d.fundingRate);
    if (!isFinite(rate)) return null;
    const data = {
      rate,
      percent: (rate * 100).toFixed(4),
      annualized: (rate * 3 * 365 * 100).toFixed(2), // funding settles 3x/day
    };
    setWidgetCache(key, data);
    return data;
  } catch (e) {
    return null;
  }
};

const fetchLongShortRatio = async (coin) => {
  const key = coinWidgetKey("longShortRatio", coin);
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${BYBIT_API}/v5/market/account-ratio?category=linear&symbol=${coin}USDT&period=5min&limit=1`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const d = json && json.result && json.result.list && json.result.list[0];
    if (!d) return null;
    // buyRatio / sellRatio are fractions that sum to 1
    const long = parseFloat(d.buyRatio);
    const short = parseFloat(d.sellRatio);
    if (!isFinite(long) || !isFinite(short)) return null;
    const data = {
      longPct: (long * 100).toFixed(1),
      shortPct: (short * 100).toFixed(1),
    };
    setWidgetCache(key, data);
    return data;
  } catch (e) {
    return null;
  }
};

const fetchOpenInterest = async (coin) => {
  const key = coinWidgetKey("openInterest", coin);
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${OKX_API}/public/open-interest?instType=SWAP&instId=${coin}-USDT-SWAP`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const d = json && json.data && json.data[0];
    if (!d) return null;
    const oiUsd = parseFloat(d.oiUsd); // OKX returns USD value directly
    if (!isFinite(oiUsd) || oiUsd <= 0) return null;
    const data = { oiUsd, formatted: formatWidgetUsd(oiUsd) };
    setWidgetCache(key, data);
    return data;
  } catch (e) {
    return null;
  }
};

const fetchLiquidations = async (coin) => {
  const key = coinWidgetKey("liquidations", coin);
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    // OKX public liquidation endpoint — no auth required
    const uly = coin + "-USDT";
    const res = await fetch(
      `https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&state=filled&uly=${uly}&limit=100`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || json.code !== "0" || !Array.isArray(json.data)) return null;
    const cutoff = Date.now() - 86400000; // 24h ago
    let longLiq = 0;
    let shortLiq = 0;
    json.data.forEach((order) => {
      (order.details || []).forEach((det) => {
        if (parseInt(det.ts) < cutoff) return;
        const val = parseFloat(det.sz) * parseFloat(det.bkPx);
        if (det.posSide === "long") longLiq += val;
        else shortLiq += val;
      });
    });
    const total = longLiq + shortLiq;
    if (total === 0) return null;
    const data = {
      total,
      longLiq,
      shortLiq,
      totalFormatted: formatWidgetUsd(total),
      longFormatted: formatWidgetUsd(longLiq),
      shortFormatted: formatWidgetUsd(shortLiq),
      longPct: Math.round((longLiq / total) * 100),
    };
    setWidgetCache(key, data);
    return data;
  } catch (e) {
    return null;
  }
};

const STABLE_SYMBOLS = new Set([
  "USDT","USDC","BUSD","DAI","TUSD","USDP","FRAX","LUSD","GUSD","USDD","USDE","FDUSD",
]);

const fetchAltcoinSeason = async () => {
  try {
    // Same global figures Market Overview reads — one shared, cached fetch
    // rather than a second identical request every cycle
    const g = await fetchCoinloreGlobal();
    const dom = g ? parseFloat(g.btc_d) : NaN;
    if (!isFinite(dom)) return null;
    // Map BTC dominance to 0-100 alt season index
    // dom ≥ 65% → index ~0 (BTC Season), dom ≤ 40% → index ~100 (Alt Season)
    const index = Math.round(Math.max(0, Math.min(100, ((65 - dom) / 25) * 100)));
    let label;
    if (index >= 75) label = "Altcoin Season";
    else if (index <= 25) label = "BTC Season";
    else label = "Neutral";
    return { index, label, btcDom: dom.toFixed(1) };
  } catch (e) {
    return null;
  }
};

const WIDGET_ORDER_KEY = "crypto_chart_widget_order";
const DEFAULT_WIDGET_ORDER = [
  "watchlist",
  "topMovers",
  "fearGreed",
  "marketOverview",
  "halvingCountdown",
  "rsiWidget",
  "fundingRate",
  "longShortRatio",
  "openInterest",
  "liquidations",
  "altcoinSeason",
];

const loadWidgetOrderFromStorage = () => {
  const saved = loadJsonSetting(WIDGET_ORDER_KEY);
  if (Array.isArray(saved)) {
    const valid = saved.filter((k) => DEFAULT_WIDGET_ORDER.includes(k));
    const extra = DEFAULT_WIDGET_ORDER.filter((k) => !valid.includes(k));
    return [...valid, ...extra];
  }
  return [...DEFAULT_WIDGET_ORDER];
};

const saveWidgetOrderToStorage = (order) =>
  saveJsonSetting(WIDGET_ORDER_KEY, order);

