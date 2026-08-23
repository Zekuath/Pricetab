/* WIDGET SETTINGS STORAGE */
const WIDGETS_STORAGE_KEY = "crypto_chart_widgets";
const HIDDEN_WIDGETS_KEY = "crypto_chart_hidden_widgets";

/* WIDGET SIZE
 * The cards were built at one size, small, and everything inside them was
 * sized in `rem` — root-relative, so nothing scaled together. Their text ran
 * from 0.55rem (under 9px) upward, which is below what a lot of people can
 * comfortably read and not something the browser's own zoom fixes well on a
 * new-tab page you glance at.
 *
 * The card now sets a font size and everything inside it is in `em`, so one
 * number scales the whole thing — text, bars, gauges and padding together.
 * These are the multipliers on that number; `medium` is the shipped default
 * and already larger than what the cards used to be.
 */
const WIDGET_SIZE_KEY = "crypto_chart_widget_size";
const DEFAULT_WIDGET_SIZE = "medium";
const WIDGET_SIZE_OPTIONS = [
  { value: "small", short: "S", label: "Compact", scale: 0.85 },
  { value: "medium", short: "M", label: "Default", scale: 1 },
  { value: "large", short: "L", label: "Large", scale: 1.2 },
  { value: "xlarge", short: "XL", label: "Extra large", scale: 1.45 },
];

const widgetSizeScale = (value) => {
  const found = WIDGET_SIZE_OPTIONS.find((o) => o.value === value);
  return found ? found.scale : 1;
};

const loadWidgetSizeFromStorage = () =>
  loadEnumSetting(
    WIDGET_SIZE_KEY,
    WIDGET_SIZE_OPTIONS.map((o) => o.value),
    DEFAULT_WIDGET_SIZE,
  );

const saveWidgetSizeToStorage = (size) => saveSetting(WIDGET_SIZE_KEY, size);

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
  ethGas: false,
  btcFees: false,
  rsiWidget: false,
  worstFall: false,
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
        key: "altcoinSeason",
        label: "Altcoin Season",
        desc: "Are altcoins outperforming Bitcoin?",
      },
    ],
  },
  /* What the chain costs and where it is in its own schedule — none of these
   * is a price. Halving moved here from Market for that reason: it is a block
   * height, and the group it was in is about what things trade at. */
  {
    title: "Network",
    items: [
      {
        key: "ethGas",
        label: "ETH Gas",
        desc: "Gas price now, and what a plain ETH transfer costs",
      },
      {
        key: "btcFees",
        // The vsize is an assumption and it is stated here rather than on the
        // card: 141 vB is a one-in-two-out native SegWit spend, the ordinary
        // wallet transaction. Yours may be bigger.
        label: "BTC Fees",
        desc: "Fee rate now, and what a typical 141 vB transfer costs",
      },
      {
        key: "halvingCountdown",
        label: "BTC Halving Countdown",
        desc: "Time until the next Bitcoin halving",
      },
    ],
  },
  {
    title: "Trader",
    items: [
      {
        key: "rsiWidget",
        label: "RSI",
        // Not "overbought above 70, oversold below 30": that describes the
        // daily RSI, and this one's period follows the range on screen
        desc: "Momentum on a 0–100 scale, over the range you are looking at",
      },
      {
        key: "worstFall",
        label: "Worst Fall",
        // The risk column, and the only survivor of the algorithm research:
        // 59 of 64 rule x coin pairs cut the worst fall while only 28 beat
        // holding. A description of what happened, never an entry.
        desc: "The deepest peak-to-trough fall inside the range on screen",
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

/* Key → the one-line explanation Settings already carries. Half of these are
 * terms of art ("open interest", "funding rate", "alt season") that a card
 * three words wide has no room to explain, so the card hands the same
 * sentence over on hover instead of leaving the label to fend for itself. */
const WIDGET_DESCRIPTIONS = WIDGET_GROUPS.reduce((out, group) => {
  for (const item of group.items) out[item.key] = item.desc;
  return out;
}, {});

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

/* NETWORK FEES — what it costs to use the chain, not what the coin costs.
 *
 * These are the only two cards on the panel about *doing* something rather
 * than about a price, and they are the number people actually wait for: "is
 * it cheap enough to move it yet". Both sources were already reachable and
 * neither adds a host, a key or a permission — `ETH_RPC` is the node the
 * portfolio reads ERC-20 balances from, and mempool.space is where the
 * halving countdown gets its block height. Verified live 23 Aug 2026: both
 * answer a `chrome-extension://` Origin with `access-control-allow-origin: *`.
 *
 * They are also the fastest-moving readings here, so the cache is a minute
 * rather than the panel's usual five (`WIDGET_CACHE_TTL`, api.js).
 *
 * The pair share one grammar, and it is the point of them: **the figure is
 * what the chain quotes, the subtext is what that means in your money and how
 * soon**. A gwei price is not something anyone can price a transfer from in
 * their head, and the money is the reason the card is being read at all. The
 * money comes from the ticker snapshot the app already holds, so it costs no
 * request — and where the ticker has no price for the coin, the money line is
 * simply left off rather than guessed at.
 */

// A one-in-two-out native SegWit spend: the ordinary wallet transaction.
// Stated in the widget's own description, because it is an assumption and the
// figure it produces is not true of every transfer.
const BTC_TYPICAL_VBYTES = 141;
// A plain ETH transfer. Not an assumption — the protocol's own floor.
const ETH_TRANSFER_GAS = 21000;

const medianWei = (values) => {
  const nums = values
    .map((v) => Number(v))
    .filter((v) => isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

/* Gas, in one request.
 *
 * `eth_feeHistory` answers both halves of the price at once: the last entry of
 * `baseFeePerGas` is the **next** block's base fee (the array is one longer
 * than the window, which is the whole reason to ask this rather than
 * `eth_gasPrice`), and `reward` carries the tip actually paid at the
 * percentiles asked for. The tip is the median of the 50th percentile across
 * the window — one block's median tip is a single block's luck.
 */
const fetchEthGas = async () => {
  const cached = getWidgetCache("ethGas");
  if (cached) return cached;
  try {
    const res = await fetch(ETH_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_feeHistory",
        params: ["0x5", "latest", [50]],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json && json.result;
    const bases = result && result.baseFeePerGas;
    if (!Array.isArray(bases) || !bases.length) return null;
    const base = Number(bases[bases.length - 1]);
    if (!isFinite(base) || base < 0) return null;
    const tip =
      medianWei(
        (Array.isArray(result.reward) ? result.reward : [])
          .map((row) => (Array.isArray(row) ? row[0] : null))
          .filter((v) => v != null),
      ) || 0;
    const gwei = (base + tip) / 1e9;
    const data = {
      gwei,
      baseGwei: base / 1e9,
      tipGwei: tip / 1e9,
      // What it costs to send, in ETH. Turning that into money needs a price,
      // which belongs to the app, not to a fetcher.
      transferEth: ((base + tip) * ETH_TRANSFER_GAS) / 1e18,
    };
    setWidgetCache("ethGas", data);
    return data;
  } catch (e) {
    return null;
  }
};

/* Bitcoin's fee market, from mempool.space's own recommendation.
 *
 * The headline is the **half-hour** rate rather than the fastest: the fastest
 * is what you pay when you cannot wait, and a card read at a glance should
 * quote the ordinary case. The other two tiers ride along, because the spread
 * between them is the reading — three tiers at 1 sat/vB is an empty mempool,
 * and no single figure says that.
 */
const fetchBtcFees = async () => {
  const cached = getWidgetCache("btcFees");
  if (cached) return cached;
  try {
    const res = await fetch("https://mempool.space/api/v1/fees/recommended");
    if (!res.ok) return null;
    const json = await res.json();
    const rate = Number(json && json.halfHourFee);
    if (!isFinite(rate) || rate <= 0) return null;
    const data = {
      rate,
      fastest: Number(json.fastestFee) || rate,
      hour: Number(json.hourFee) || rate,
      transferBtc: (rate * BTC_TYPICAL_VBYTES) / 1e8,
    };
    setWidgetCache("btcFees", data);
    return data;
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
  "ethGas",
  "btcFees",
  "rsiWidget",
  "worstFall",
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

