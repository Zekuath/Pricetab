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
  { value: "small", short: "S", label: msg("wsize_compact", "Compact"), scale: 0.85 },
  { value: "medium", short: "M", label: msg("wsize_default", "Default"), scale: 1 },
  { value: "large", short: "L", label: msg("wsize_large", "Large"), scale: 1.2 },
  { value: "xlarge", short: "XL", label: msg("wsize_xlarge", "Extra large"), scale: 1.45 },
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

/* The widgets drawer's width, in pixels, where its right edge was let go
 * (27 Sep 2026). **Absent means the 30rem it opens at** — nothing is written
 * until the edge is moved, and a double-click on it writes null back. The
 * floor holds one medium card and its padding; the ceiling is a number
 * rather than the window because a width is stored once and read on every
 * screen — the window's own limit is applied where it is drawn
 * (WidgetsDrawer's min(…, 92vw)) and at the drag (`widgetsWidthCeiling`). */
const WIDGETS_WIDTH_KEY = "crypto_chart_widgets_width";
const WIDGETS_WIDTH_MIN = 280;
const WIDGETS_WIDTH_MAX = 1400;
const WIDGETS_WIDTH_STEP = 24; // one arrow press on the edge

const clampWidgetsWidth = (px, ceiling = WIDGETS_WIDTH_MAX) => {
  const n = Math.round(Number(px));
  if (!Number.isFinite(n)) return null;
  const top = Math.max(WIDGETS_WIDTH_MIN, Math.min(WIDGETS_WIDTH_MAX, ceiling));
  return Math.max(WIDGETS_WIDTH_MIN, Math.min(top, n));
};

const loadWidgetsWidthFromStorage = () => {
  const saved = loadJsonSetting(WIDGETS_WIDTH_KEY);
  return typeof saved === "number" ? clampWidgetsWidth(saved) : null;
};

const saveWidgetsWidthToStorage = (px) =>
  saveJsonSetting(WIDGETS_WIDTH_KEY, px == null ? null : clampWidgetsWidth(px));

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
  difficulty: false,
  ethGas: false,
  btcFees: false,
  mempool: false,
  rsiWidget: false,
  outlook: false,
  regimes: false,
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
    title: msg("wgroup_portfolio", "Portfolio"),
    items: [
      {
        key: "watchlist",
        label: msg("wname_watchlist", "Watchlist"),
        desc: msg("wdesc_watchlist", "Your coins as a colour-coded 24h grid"),
      },
      {
        key: "topMovers",
        label: msg("wname_top_movers", "Top Movers"),
        desc: msg("wdesc_top_movers", "Today's biggest gainers and losers"),
      },
    ],
  },
  {
    title: msg("wgroup_market", "Market"),
    items: [
      {
        key: "fearGreed",
        label: msg("wname_fear_greed", "Fear & Greed"),
        desc: msg("wdesc_fear_greed", "Market sentiment score from 0 to 100"),
      },
      {
        key: "marketOverview",
        label: msg("wname_market_overview", "Market Overview"),
        desc: msg("wdesc_market_overview", "Total market cap and BTC/ETH dominance"),
      },
      {
        key: "altcoinSeason",
        label: msg("wname_altcoin_season", "Altcoin Season"),
        desc: msg("wdesc_altcoin_season", "Are altcoins outperforming Bitcoin?"),
      },
      /* The chart's own range replayed forward: where its steps land at the
       * next horizons, as a counted band — never a direction. Costs no
       * request; it reads the series already drawn. */
      {
        key: "outlook",
        label: msg("wname_outlook", "Outlook"),
        desc: msg("wdesc_outlook", "Where this range's own steps land at the next horizons — a counted band, not a call"),
      },
      /* The 3×3 regime picture the sector draws, counted the way this app
       * counts: each entry into a state and the state 20 days later, beside
       * any day. See regime-grid.js. Reads the base rates' daily closes. */
      {
        key: "regimes",
        label: msg("wname_regimes", "Regimes"),
        desc: msg("wdesc_regimes", "Rising, flat or falling over 20 days — and what each was 20 days after it began, beside any day. Counted, not forecast"),
      },
    ],
  },
  /* What the chain costs and where it is in its own schedule — none of these
   * is a price. Halving moved here from Market for that reason: it is a block
   * height, and the group it was in is about what things trade at. */
  {
    title: msg("wgroup_network", "Network"),
    items: [
      {
        key: "ethGas",
        label: msg("wname_eth_gas", "ETH Gas"),
        desc: msg("wdesc_eth_gas", "Gas price now, and what a plain ETH transfer costs"),
      },
      {
        key: "difficulty",
        label: msg("wname_difficulty", "BTC Difficulty"),
        desc: msg(
          "wdesc_difficulty",
          "How much harder mining is about to get, and when the change lands",
        ),
      },
      {
        key: "btcFees",
        // The vsize is an assumption and it is stated here rather than on the
        // card: 141 vB is a one-in-two-out native SegWit spend, the ordinary
        // wallet transaction. Yours may be bigger.
        label: msg("wname_btc_fees", "BTC Fees"),
        desc: msg("wdesc_btc_fees", "Fee rate now, and what a typical 141 vB transfer costs"),
      },
      {
        key: "halvingCountdown",
        label: msg("wname_halving_countdown", "BTC Halving Countdown"),
        desc: msg("wdesc_halving_countdown", "Time until the next Bitcoin halving"),
      },
      {
        key: "mempool",
        label: msg("wname_mempool", "BTC Mempool"),
        desc: msg(
          "wdesc_mempool",
          "How many transactions are waiting, and how deep the queue is — the reading under the fee card",
        ),
      },
    ],
  },
  {
    title: msg("wgroup_trader", "Trader"),
    items: [
      {
        key: "rsiWidget",
        label: msg("wname_rsi_widget", "RSI"),
        // Not "overbought above 70, oversold below 30": that describes the
        // daily RSI, and this one's period follows the range on screen
        desc: msg("wdesc_rsi_widget", "Momentum on a 0–100 scale, over the range you are looking at"),
      },
      {
        key: "worstFall",
        label: msg("wname_worst_fall", "Worst Fall"),
        // The risk column, and the only survivor of the algorithm research:
        // 59 of 64 rule x coin pairs cut the worst fall while only 28 beat
        // holding. A description of what happened, never an entry.
        desc: msg("wdesc_worst_fall", "The deepest peak-to-trough fall inside the range on screen"),
      },
      {
        key: "fundingRate",
        label: msg("wname_funding_rate", "Funding Rate"),
        desc: msg("wdesc_funding_rate", "What longs pay shorts on perpetual futures"),
      },
      {
        key: "longShortRatio",
        label: msg("wname_long_short_ratio", "Long / Short Ratio"),
        desc: msg("wdesc_long_short_ratio", "How traders are positioned right now"),
      },
      {
        key: "openInterest",
        label: msg("wname_open_interest", "Open Interest"),
        desc: msg("wdesc_open_interest", "Value of open futures contracts"),
      },
      {
        key: "liquidations",
        label: msg("wname_liquidations", "Liquidations 24h"),
        desc: msg("wdesc_liquidations", "Forced position closures, last 24 hours"),
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
/* Which host each card's figure comes from, so a card whose host is cooling
 * can say *paused* rather than "could not load". Only the cards that go
 * through `politeFetch`; the coin lists ride the price sweep, the RSI reads
 * candles from the price provider, ETH gas is the RPC node, and those keep
 * their own paths. Keyed by the state field the card is drawn from. */
const WIDGET_HOSTS = {
  fearGreedData: "api.alternative.me",
  marketOverviewData: "api.coinlore.com",
  altcoinSeasonData: "api.coinlore.com",
  halvingData: "mempool.space",
  btcFeesData: "mempool.space",
  mempoolData: "mempool.space",
  difficultyData: "mempool.space",
  fundingRateData: "www.okx.com",
  openInterestData: "www.okx.com",
  liquidationsData: "www.okx.com",
  longShortData: "api.bybit.com",
};

/* Every card's request goes through `politeFetch` (api.js): a host that
 * answered 429 or 403 is left alone for a while and the card says *paused*.
 * The derivatives page's own quote, book, trades and candles do not — see the
 * note on `politeFetch` for why a live page is the one place that is wrong. */
const OKX_API = "https://www.okx.com/api/v5";
const BYBIT_API = "https://api.bybit.com";

const formatWidgetUsd = (n) => {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
};

/* The same compact figure in USDT, for the book and the tape: a size on a
 * USDT-margined book is tether, and the column head names the unit once. */
const formatWidgetUsdt = (n) => formatWidgetUsd(n).slice(1);

const fetchFundingRate = async (coin) => {
  const key = coinWidgetKey("fundingRate", coin);
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    const res = await politeFetch(
      `${OKX_API}/public/funding-rate?instId=${coin}-USDT-SWAP`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const d = json && json.data && json.data[0];
    if (!d || d.fundingRate === "" || d.fundingRate == null) return null;
    const rate = parseFloat(d.fundingRate);
    if (!isFinite(rate)) return null;
    /* **The settlement interval is measured, never assumed.** Annualised
       funding was rate × 3 × 365 — three settlements a day — and OKX does not
       settle every contract every 8 hours: WIF-USDT-SWAP settled every 4
       (measured 22 Sep 2026), so its yearly figure and the "every 8 hours"
       sentence were both half what they should be. The answer carries this
       settlement's time and the next one's; their gap is the interval, and 8
       hours is only the fallback for an answer without the second stamp. */
    const at = Number(d.fundingTime) || 0;
    const next = Number(d.nextFundingTime) || 0;
    const intervalMs = at > 0 && next > at ? next - at : FUNDING_DEFAULT_INTERVAL_MS;
    const perYear = (365 * 24 * 3600e3) / intervalMs;
    /* OKX's premium: how far the perpetual sits from its own spot index, the
       figure funding is set from. A basis in one number and no new request.
       Absent from an older cache entry, and left null when the venue sends
       nothing. */
    const premium = d.premium === "" || d.premium == null ? null : parseFloat(d.premium);
    const data = {
      rate,
      percent: (rate * 100).toFixed(4),
      annualized: (rate * perYear * 100).toFixed(2),
      intervalHours: intervalMs / 3600e3,
      premium: isFinite(premium) ? premium : null,
      /* When this rate is actually charged. The widget never needed it; the
         futures account does — it pays at settlements, not on every tick, and
         the panel says how long that is away. Kept as the venue's own number
         rather than derived, so a coin that ever moves off the 8-hour grid
         says so instead of being assumed onto it. A cache entry written
         before this field existed simply has no `at`. */
      at,
    };
    setWidgetCache(key, data);
    return data;
  } catch (e) {
    return null;
  }
};
const FUNDING_DEFAULT_INTERVAL_MS = 8 * 3600e3;

const fetchLongShortRatio = async (coin) => {
  const key = coinWidgetKey("longShortRatio", coin);
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    const res = await politeFetch(
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
    const res = await politeFetch(
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
    const res = await politeFetch(
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

/* **How the crowd has been positioned, day by day, beside the price.**
 *
 * The long/short card reads one number — the share of Bybit accounts long
 * right now. The derivatives page's crowd reading needs that number's own
 * history, to say whether today is unusual *for this market* and what has
 * followed days like it. Bybit publishes both on the host this file already
 * talks to: `account-ratio` at a daily period (up to 500 days) and the same
 * perpetual's daily candles, stamped on the same UTC midnights — so the two
 * are joined on the timestamp, never on position in a list. Verified 18 Sep
 * 2026 from an extension Origin: both answer 200 and echo it in
 * `Access-Control-Allow-Origin`.
 *
 * Answers `[{ t, long, close }]`, oldest first, or null. Cached through the
 * widget cache so a new tab does not pay for it again (`crowdHistory`). */
const CROWD_HISTORY_DAYS = 500;
const fetchCrowdHistory = async (coin) => {
  const key = coinWidgetKey("crowdHistory", coin);
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    const [ratioRes, klineRes] = await Promise.all([
      fetch(`${BYBIT_API}/v5/market/account-ratio?category=linear&symbol=${coin}USDT&period=1d&limit=${CROWD_HISTORY_DAYS}`),
      fetch(`${BYBIT_API}/v5/market/kline?category=linear&symbol=${coin}USDT&interval=D&limit=${CROWD_HISTORY_DAYS}`),
    ]);
    if (!ratioRes.ok || !klineRes.ok) return null;
    const ratio = await ratioRes.json();
    const kline = await klineRes.json();
    const ratios = ratio && ratio.result && Array.isArray(ratio.result.list) ? ratio.result.list : [];
    const candles = kline && kline.result && Array.isArray(kline.result.list) ? kline.result.list : [];
    const closeAt = new Map();
    for (const row of candles) {
      const t = Number(row && row[0]);
      const close = Number(row && row[4]);
      if (isFinite(t) && isFinite(close) && close > 0) closeAt.set(t, close);
    }
    const rows = [];
    for (const r of ratios) {
      const t = Number(r && r.timestamp);
      const long = parseFloat(r && r.buyRatio);
      const close = closeAt.get(t);
      if (isFinite(t) && isFinite(long) && long >= 0 && long <= 1 && close) {
        rows.push({ t, long, close });
      }
    }
    rows.sort((a, b) => a.t - b.t);
    if (rows.length < 30) return null;
    setWidgetCache(key, rows);
    return rows;
  } catch (e) {
    return null;
  }
};

/* **Funding and open interest as daily series, for the structure readings.**
 *
 * Measured 22 Sep 2026 (`ref/data-sources.md`, the derivatives sweep): OKX's
 * own funding history stops at 93 days, which leaves 1–4 episodes past a
 * 60-day window — *thin* for every coin — while Bybit's pages back more than
 * 800 days with CORS, from the host the crowd history already reads. Two
 * hundred settlements a page, `endTime` walks back; the page count is bounded
 * by the window, not by a loop that could run to the venue's first day. The
 * settlements are folded to a daily mean (three or six a day, by contract),
 * so the series lines up with the crowd history's daily closes. Open interest
 * comes at `intervalTime=1d`, two hundred a page with a cursor. Both are
 * `[{ t, value }]`, oldest first, `t` at the UTC day's start, or null below
 * thirty rows — the same floor the crowd history keeps. */
const STRUCTURE_HISTORY_DAYS = CROWD_HISTORY_DAYS;
const STRUCTURE_PAGE = 200;
const STRUCTURE_DAY_MS = 86400000;
const fetchFundingHistory = async (coin) => {
  const key = coinWidgetKey("fundingHistory", coin);
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    const since = Date.now() - STRUCTURE_HISTORY_DAYS * STRUCTURE_DAY_MS;
    const byDay = new Map();
    let end = "";
    for (let page = 0; page < 8; page++) {
      const res = await politeFetch(
        `${BYBIT_API}/v5/market/funding/history?category=linear&symbol=${coin}USDT&limit=${STRUCTURE_PAGE}${end ? `&endTime=${end}` : ""}`,
      );
      if (!res.ok) return null;
      const json = await res.json();
      const list = json && json.result && Array.isArray(json.result.list) ? json.result.list : [];
      if (!list.length) break;
      let oldest = Infinity;
      for (const r of list) {
        const t = Number(r && r.fundingRateTimestamp);
        const f = parseFloat(r && r.fundingRate);
        if (!isFinite(t) || !isFinite(f)) continue;
        if (t < oldest) oldest = t;
        const day = Math.floor(t / STRUCTURE_DAY_MS) * STRUCTURE_DAY_MS;
        const e = byDay.get(day) || { sum: 0, n: 0 };
        e.sum += f;
        e.n += 1;
        byDay.set(day, e);
      }
      if (list.length < STRUCTURE_PAGE || !isFinite(oldest) || oldest <= since) break;
      end = String(oldest - 1);
    }
    const rows = Array.from(byDay, ([t, e]) => ({ t, value: e.sum / e.n }))
      .filter((r) => r.t >= since - STRUCTURE_DAY_MS)
      .sort((a, b) => a.t - b.t);
    if (rows.length < 30) return null;
    setWidgetCache(key, rows);
    return rows;
  } catch (e) {
    return null;
  }
};

const fetchOpenInterestHistory = async (coin) => {
  const key = coinWidgetKey("oiHistory", coin);
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    const since = Date.now() - STRUCTURE_HISTORY_DAYS * STRUCTURE_DAY_MS;
    const byDay = new Map();
    let cursor = "";
    for (let page = 0; page < 4; page++) {
      const res = await politeFetch(
        `${BYBIT_API}/v5/market/open-interest?category=linear&symbol=${coin}USDT&intervalTime=1d&limit=${STRUCTURE_PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (!res.ok) return null;
      const json = await res.json();
      const list = json && json.result && Array.isArray(json.result.list) ? json.result.list : [];
      if (!list.length) break;
      let oldest = Infinity;
      for (const r of list) {
        const t = Number(r && r.timestamp);
        const v = parseFloat(r && r.openInterest);
        if (!isFinite(t) || !(v > 0)) continue;
        if (t < oldest) oldest = t;
        byDay.set(Math.floor(t / STRUCTURE_DAY_MS) * STRUCTURE_DAY_MS, v);
      }
      cursor = json.result.nextPageCursor || "";
      if (!cursor || !isFinite(oldest) || oldest <= since) break;
    }
    const rows = Array.from(byDay, ([t, value]) => ({ t, value }))
      .filter((r) => r.t >= since - STRUCTURE_DAY_MS)
      .sort((a, b) => a.t - b.t);
    if (rows.length < 30) return null;
    setWidgetCache(key, rows);
    return rows;
  } catch (e) {
    return null;
  }
};

/* **Which coins have a market to trade here.** A perpetual on OKX is what
 * gives a coin a book, a funding rate and open interest on this page, so it is
 * also what makes one tradeable: a contract on a coin no venue lists would be
 * a market simulated from nothing. Measured 18 Sep 2026: 467 live USDT
 * swaps, 62 of this app's 81 coins among them. One request a day, cached,
 * on the host this file already uses for the book; answers the base symbols
 * as an array, or null when the listing could not be read — and null means
 * "do not know", which the page treats as *allow*, never as *refuse*. */
const fetchPerpCoins = async () => {
  const key = coinWidgetKey("perpCoins", "ALL");
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    const res = await politeFetch(`${OKX_API}/public/instruments?instType=SWAP`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || json.code !== "0" || !Array.isArray(json.data)) return null;
    const coins = Array.from(
      new Set(
        json.data
          .filter((d) => d && d.settleCcy === "USDT" && d.state === "live" && typeof d.instId === "string")
          .map((d) => d.instId.split("-")[0]),
      ),
    ).sort();
    if (!coins.length) return null;
    setWidgetCache(key, coins);
    return coins;
  } catch (e) {
    return null;
  }
};

const STABLE_SYMBOLS = new Set([
  "USDT","USDC","BUSD","DAI","TUSD","USDP","FRAX","LUSD","GUSD","USDD","USDE","FDUSD",
]);

/* The regime grid for one coin, from the daily closes the base-rate screen
   reads (twelve hours in the cache, so a card that refreshes every few
   minutes asks nothing new). Null below a hundred days: a grid of a few
   episodes is a grid of nothing. */
const fetchRegimeGrid = async (coin) => {
  const closes = await fetchDailyCloses(coin);
  if (!Array.isArray(closes) || closes.length < 100) return null;
  return { coin, grid: regimeGrid(closes) };
};

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
    const res = await politeFetch("https://mempool.space/api/v1/fees/recommended");
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

/* **How full the queue is — the reading under the fee card.**
 *
 * `btcFees` says what a transaction costs and cannot say *why*, and the why is
 * the only part of it anybody can act on: a mempool with eighty thousand
 * transactions waiting is a fee that is going up, and an empty one is a fee
 * that is about to fall whatever it says right now. Same host and the same
 * minute of cache as the fees card, because they are two readings of one
 * market and a card pair that disagreed about the moment would be worse than
 * either alone.
 *
 * `vsize` is what decides a block, not the count: blocks hold about 1 million
 * vbytes, so the queue is reported in **blocks deep** as well as in
 * transactions — "3.1 blocks" is a wait, where "82,268" is a number.
 */
const MEMPOOL_BLOCK_VBYTES = 1000000;

const fetchMempool = async () => {
  const cached = getWidgetCache("mempool");
  if (cached) return cached;
  try {
    const res = await politeFetch("https://mempool.space/api/mempool");
    if (!res.ok) return null;
    const json = await res.json();
    const count = Number(json && json.count);
    const vsize = Number(json && json.vsize);
    if (!isFinite(count) || count < 0 || !isFinite(vsize) || vsize < 0) return null;
    const data = {
      count,
      vsize,
      blocks: vsize / MEMPOOL_BLOCK_VBYTES,
      // Total fees waiting, in BTC — what the next blocks are worth to miners
      feesBtc: isFinite(Number(json.total_fee)) ? Number(json.total_fee) / 1e8 : null,
    };
    setWidgetCache("mempool", data);
    return data;
  } catch (e) {
    return null;
  }
};

/* **When mining gets harder, and by how much.**
 *
 * The halving card counts down to a change in the *reward*; this is the other
 * clock Bitcoin runs on, and it turns every two weeks rather than every four
 * years. The estimate is mempool.space's own, from how fast the current epoch
 * is being mined — it is a projection and the card says "est.", because the
 * number moves as the fortnight goes on.
 *
 * **Hashrate was the obvious third card and is deliberately not here.** "948
 * EH/s" is a number without a scale for anybody who is not already following
 * it, and what it *means* — mining got harder or easier — is exactly what this
 * card says in a form that carries its own units.
 */
const fetchDifficulty = async () => {
  const cached = getWidgetCache("difficulty");
  if (cached) return cached;
  try {
    const res = await politeFetch("https://mempool.space/api/v1/difficulty-adjustment");
    if (!res.ok) return null;
    const json = await res.json();
    const change = Number(json && json.difficultyChange);
    const remaining = Number(json && json.remainingBlocks);
    if (!isFinite(change) || !isFinite(remaining) || remaining < 0) return null;
    const data = {
      change,
      remaining,
      progress: Number(json.progressPercent) || 0,
      // Their estimate of when, in ms from now. Null rather than a date when
      // the field is missing: a countdown is the one thing here worth refusing
      remainingMs:
        isFinite(Number(json.remainingTime)) ? Number(json.remainingTime) : null,
      previous: isFinite(Number(json.previousRetarget))
        ? Number(json.previousRetarget)
        : null,
    };
    setWidgetCache("difficulty", data);
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
  "difficulty",
  "ethGas",
  "btcFees",
  "mempool",
  "rsiWidget",
  "outlook",
  "regimes",
  "worstFall",
  "fundingRate",
  "longShortRatio",
  "openInterest",
  "liquidations",
  "altcoinSeason",
];

/* ---- the order book ---------------------------------------------------
 *
 * **A real book, from the venue this panel already quotes.** The derivatives
 * screen simulates a perpetual swap and reads its funding rate from OKX at
 * `BTC-USDT-SWAP`; this is the same instrument's depth, so the spread on
 * screen and the funding underneath it describe one market rather than two.
 *
 * **No new host.** `www.okx.com` has been a declared provider since the
 * funding and open-interest widgets, and the endpoint answers
 * `Access-Control-Allow-Origin: *` — verified 17 Sep 2026 by sending a
 * `chrome-extension://` Origin and reading the header back, alongside Bybit
 * (which echoes the origin instead) and OKX's spot book. 354ms round trip.
 * A fabricated book was never an option: a market invented to teach from is
 * the one thing `EXCHANGE_FIDELITY.md` rules out in writing.
 *
 * **Its own cache, and a short one.** The widget cache measures in minutes;
 * a book measured in minutes is a lie with a timestamp on it. Five seconds,
 * in memory only — a stale book is worse than no book, so it is never
 * persisted and never hydrated into a new tab.
 *
 * The rows come back as `[price, size, liquidatedOrders, orderCount]`; only
 * the first two are used. `depth` is the running sum, which is what the row's
 * fill is drawn from — a second dimension for free, which is how every venue
 * draws a book. */
const ORDER_BOOK_TTL = 5000;
/* **How old a cached book, tape or perpetual quote may be and still answer
   an ask** — half a second under the timer that asks (27 Sep 2026). They
   were the same number, so a timer firing every ORDER_BOOK_TTL found the
   last answer a few milliseconds younger than the TTL about half the time
   and got it back: measured over 30s on the open page, 3 book requests
   where 6 were meant — a book refreshed every ten seconds, not five. The
   cache still collapses two asks in the same moment (a tab switch and a
   tick), which is what it is for. The book and the tape only: the quote
   has two timers asking and keeps the full TTL (see fetchPerpTicker). */
const ORDER_BOOK_FRESH = ORDER_BOOK_TTL - 500;
const ORDER_BOOK_ROWS = 8;
/* **How deep the book is read.** Two readings: the plain ladder asks for
 * twice its rows (one side alone draws sixteen); grouping levels or hiding
 * small ones needs the book behind the first rows, and asks for the
 * `market/books` maximum — 400 a side, ~22 KB, measured 19 Sep 2026 at
 * about ±0.08% of a BTC price. `books-full` reaches further but is ~92 KB,
 * which every five seconds is a cost this page does not get to charge. */
const ORDER_BOOK_SHALLOW = ORDER_BOOK_ROWS * 2;
const ORDER_BOOK_DEEP = 400;
const orderBookCache = new Map();

const parseBookSide = (rows, want, ctVal) => {
  const out = [];
  let depth = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const price = parseFloat(row && row[0]);
    /* Contracts on the wire, coins on the screen — see `fetchContractSpec`. */
    const size = parseFloat(row && row[1]) * ctVal;
    if (!isFinite(price) || !isFinite(size) || price <= 0 || size <= 0) continue;
    depth += size;
    out.push({ price, size, depth });
    if (out.length >= want) break;
  }
  return out;
};

/* **What one contract is worth on that venue, which the book cannot be read
 * without.** OKX quotes swap depth in *contracts*, and a contract is 0.01 BTC,
 * 0.1 ETH or 100 XRP — verified against `public/instruments` on 17 Sep 2026.
 * Printing those numbers beside a panel that talks in coins would be three
 * different units on one screen, two of them unlabelled.
 *
 * Cached through the widget cache, which measures in minutes and persists: an
 * instrument's contract size is a fact about the venue, not about the market,
 * and it changes on the day the venue announces it changes.
 *
 * Required, not optional: without it there is no honest size column, and a
 * book with a wrong size column is worse than no book. */
const fetchContractSpec = async (coin) => {
  const key = coinWidgetKey("contractSpec", coin);
  const cached = getWidgetCache(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${OKX_API}/public/instruments?instType=SWAP&instId=${coin}-USDT-SWAP`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const d = json && json.data && json.data[0];
    const ctVal = parseFloat(d && d.ctVal);
    if (!isFinite(ctVal) || ctVal <= 0) return null;
    const data = {
      ctVal,
      ccy: typeof d.ctValCcy === "string" ? d.ctValCcy : coin,
      tick: parseFloat(d.tickSz) || 0,
    };
    setWidgetCache(key, data);
    return data;
  } catch (e) {
    return null;
  }
};

/* **P7 — the trades that just printed**, the tape beside the book. OKX's
 * `market/trades` on the host the book already uses (verified 19 Sep 2026
 * from an extension Origin: 200, the origin echoed). Sizes arrive in
 * contracts and are turned into coins with the same contract value the book
 * uses. Five seconds in memory and never persisted, the book's rule: a tape
 * read from yesterday's cache is a lie with a timestamp on it. */
const recentTradesCache = new Map();
const RECENT_TRADES_ROWS = 14;
const fetchRecentTrades = async (coin) => {
  const hit = recentTradesCache.get(coin);
  if (hit && Date.now() - hit.at < ORDER_BOOK_FRESH) return hit.data;
  try {
    const res = await fetch(`${OKX_API}/market/trades?instId=${coin}-USDT-SWAP&limit=${RECENT_TRADES_ROWS}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || json.code !== "0" || !Array.isArray(json.data)) return null;
    const spec = await fetchContractSpec(coin);
    if (!spec) return null;
    const data = json.data
      .map((t) => ({
        price: parseFloat(t && t.px),
        size: parseFloat(t && t.sz) * spec.ctVal,
        side: t && t.side === "sell" ? "sell" : "buy",
        at: Number(t && t.ts) || 0,
      }))
      .filter((t) => isFinite(t.price) && t.price > 0 && isFinite(t.size) && t.size > 0);
    recentTradesCache.set(coin, { at: Date.now(), data });
    return data;
  } catch (e) {
    return null;
  }
};

const fetchOrderBook = async (coin, deep) => {
  if (!coin) return null;
  const sz = deep ? ORDER_BOOK_DEEP : ORDER_BOOK_SHALLOW;
  const key = `book:${coin}:${sz}`;
  const hit = orderBookCache.get(key);
  if (hit && Date.now() - hit.at < ORDER_BOOK_FRESH) return hit.data;
  try {
    const res = await fetch(
      `${OKX_API}/market/books?instId=${coin}-USDT-SWAP&sz=${sz}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const d = json && json.data && json.data[0];
    if (!d) return null;
    /* OKX returns asks ascending and bids descending, which is the order a
       book is drawn in — asks away from the spread going up, bids away going
       down. Kept as it comes rather than sorted here: a side that arrived in
       the wrong order would be a fact about the venue worth seeing, not
       something to paper over. */
    const spec = await fetchContractSpec(coin);
    if (!spec) return null;
    const asks = parseBookSide(d.asks, sz, spec.ctVal);
    const bids = parseBookSide(d.bids, sz, spec.ctVal);
    if (!asks.length || !bids.length) return null;
    const best = { ask: asks[0].price, bid: bids[0].price };
    const data = {
      asks,
      bids,
      ...best,
      /* The spread, in money and in basis points off the mid — the second is
         what makes two markets comparable and the first is what it costs. */
      spread: best.ask - best.bid,
      spreadBps: ((best.ask - best.bid) / ((best.ask + best.bid) / 2)) * 10000,
      /* The deepest running total on either side, so both ladders draw their
         fills against one scale and a thin side looks thin. */
      deepest: Math.max(
        asks[asks.length - 1].depth,
        bids[bids.length - 1].depth,
      ),
      /* The venue's own price step, so the ladder can say what it is quoting
         to rather than leaving the reader to infer it from the gaps. */
      tick: spec.tick,
      at: Date.now(),
    };
    orderBookCache.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    return null;
  }
};

/* **The ladder as it is drawn: grouped, one side or both, small levels
 * hidden.** Pure, so the panel draws exactly what this returns and a test can
 * read it without a browser.
 *
 * - `step` groups levels into price buckets the way every venue's "0.1 / 1 /
 *   10" control does: an ask belongs to the bucket above it and a bid to the
 *   one below, so grouping can never draw a bid above an ask.
 * - The running depth is summed over **every** grouped level, before `min`
 *   hides any: hiding a small level takes its row away, not its liquidity —
 *   the depth beside the next row still includes it.
 * - `min` is a size in money (the book's unit), compared per level.
 * - `deepest` is taken from what is drawn, so the fills use the whole width.
 *
 * Returns `{ asks, bids, deepest, reach }`; `reach` is how far from the best
 * price the fetched book went, so the panel can say when a filter ran out of
 * book rather than suggest the market has nothing further out. */
const bookLadder = (book, opts) => {
  const o = opts || {};
  const step = o.step > 0 ? o.step : 0;
  const rows = o.rows > 0 ? o.rows : ORDER_BOOK_ROWS;
  const min = o.min > 0 ? o.min : 0;
  const side = (levels, up) => {
    const grouped = [];
    for (const r of Array.isArray(levels) ? levels : []) {
      const price = step
        ? Math.round((up ? Math.ceil(r.price / step - 1e-9) : Math.floor(r.price / step + 1e-9)) * step * 1e8) / 1e8
        : r.price;
      const last = grouped[grouped.length - 1];
      if (last && last.price === price) last.size += r.size;
      else grouped.push({ price, size: r.size });
    }
    let depth = 0;
    for (const g of grouped) {
      depth += g.size;
      g.depth = depth;
    }
    return grouped.filter((g) => g.size * g.price >= min).slice(0, rows);
  };
  const asks = o.view === "bids" ? [] : side(book && book.asks, true);
  const bids = o.view === "asks" ? [] : side(book && book.bids, false);
  const drawn = [...asks, ...bids];
  const fetched = book && book.asks && book.bids && book.asks.length && book.bids.length
    ? Math.max(
        book.asks[book.asks.length - 1].price - book.asks[0].price,
        book.bids[0].price - book.bids[book.bids.length - 1].price,
      )
    : 0;
  return {
    asks,
    bids,
    deepest: drawn.length ? Math.max(...drawn.map((g) => g.depth)) : 0,
    reach: fetched,
  };
};

/* The group sizes offered for a market: its own tick, and ten and a hundred
 * times it — the steps a venue's control offers, and as far as a 400-level
 * book can fill a ladder. */
/* The sizes a level can be required to reach before it is drawn, in USDT:
 * everything, then the three orders of magnitude a BTC book's walls sit at. */
const PRACTICE_BOOK_MINS = [0, 10000, 100000, 1000000];
const bookSteps = (tick, book) => {
  /* Without the venue's tick (the spec could not be read), the finest gap
     between two levels on the book is the step it is quoted in. */
  let t = tick > 0 ? tick : 0;
  if (!t && book) {
    for (const side of [book.asks, book.bids]) {
      for (let i = 1; i < (side || []).length; i += 1) {
        const gap = Math.abs(side[i].price - side[i - 1].price);
        if (gap > 0 && (!t || gap < t)) t = gap;
      }
    }
  }
  return t > 0 ? [1, 10, 100].map((m) => Math.round(t * m * 1e8) / 1e8) : [];
};

/* **The book as a depth curve** (27 Sep 2026) — the measurement in §5.3 and
 * Figure 2 of the user's paper, *Endogenous Shock Amplification*: for each
 * level, the displayed notional summed from the best price outwards
 * (Σ price × size, in USDT), against its distance from the mid in basis
 * points, 10⁴·|p/M − 1|. Each side is its own curve, so the two are read at
 * the same distance rather than at the same price. Pure.
 *
 * **It ends where the book was read.** `reach` is the farthest level each side
 * returned, and nothing is drawn or quoted past it: 400 levels of a BTC book
 * is about eight basis points, and a curve extrapolated from there into a
 * crash-sized move would be a number nobody measured. What is displayed can
 * also be cancelled before anyone reaches it — this is what is showing, not
 * what would fill. */
const BOOK_DEPTH_MARKS_BP = [1, 2, 5, 10, 25, 50];
const bookDepthCurve = (book) => {
  if (!book || !Array.isArray(book.asks) || !Array.isArray(book.bids)) return null;
  if (!book.asks.length || !book.bids.length) return null;
  const mid = (book.asks[0].price + book.bids[0].price) / 2;
  if (!(mid > 0)) return null;
  const side = (levels) => {
    let total = 0;
    const out = [];
    for (const r of levels) {
      if (!(r && r.price > 0 && r.size > 0)) continue;
      total += r.price * r.size;
      out.push({ bp: Math.abs(r.price / mid - 1) * 10000, notional: total });
    }
    return out;
  };
  const bids = side(book.bids);
  const asks = side(book.asks);
  if (!bids.length || !asks.length) return null;
  return {
    mid,
    bids,
    asks,
    levels: { bid: bids.length, ask: asks.length },
    reach: { bid: bids[bids.length - 1].bp, ask: asks[asks.length - 1].bp },
  };
};

/* The notional displayed within `bp` of the mid on one side — or null when
 * the book was not read that far, which is a different answer from zero. */
/* A level exactly at the distance counts. The distance is a float — 100.4
 * against a mid of 100 is 40.00000000000036 bp, not 40 — so "within" allows
 * a billionth of a basis point, far below any tick. */
const BOOK_DEPTH_EPS_BP = 1e-9;
const bookDepthAt = (points, bp) => {
  if (!Array.isArray(points) || !points.length || !(bp >= 0)) return null;
  if (bp > points[points.length - 1].bp + BOOK_DEPTH_EPS_BP) return null;
  let total = 0;
  for (const p of points) {
    if (p.bp > bp + BOOK_DEPTH_EPS_BP) break;
    total = p.notional;
  }
  return total;
};

/* **The price the derivatives account trades at: the perpetual's own, in
 * USDT.** The account used to be priced off whatever currency the app was set
 * to show — a euro chart made a euro account, and switching the setting
 * paused every contract. A USDT-margined account is quoted by its contract,
 * so the price here is OKX's `<COIN>-USDT-SWAP` last trade (verified 19 Sep
 * 2026 from an extension Origin: 200, the origin echoed), on the host the
 * book already uses.
 *
 * Five seconds in memory, never persisted — the book's rule, and stricter
 * here, because this number is a *fill*. `perpLastFor` is the synchronous
 * read every order path uses, and it refuses a quote older than
 * `PERP_TICKER_MAX_AGE`: a price from two minutes ago is not one anybody
 * could have traded at. */
const PERP_TICKER_MAX_AGE = 120000;
const perpTickerCache = new Map();
const fetchPerpTicker = async (coin) => {
  if (!coin) return null;
  const hit = perpTickerCache.get(coin);
  /* The whole TTL here, not ORDER_BOOK_FRESH: two callers ask for the
     quote — the page's timer and the chart's refresh — and this cache is
     what makes one tick cost one request (measured: 6 a half minute; with
     the book's slack it was 9). */
  if (hit && Date.now() - hit.at < ORDER_BOOK_TTL) return hit.data;
  try {
    const res = await fetch(`${OKX_API}/market/ticker?instId=${coin}-USDT-SWAP`);
    if (!res.ok) return null;
    const json = await res.json();
    const d = json && json.code === "0" && Array.isArray(json.data) ? json.data[0] : null;
    const last = parseFloat(d && d.last);
    if (!(last > 0)) return null;
    const open = parseFloat(d.open24h);
    const high = parseFloat(d.high24h);
    const low = parseFloat(d.low24h);
    const data = {
      last,
      high24h: high > 0 ? high : null,
      low24h: low > 0 ? low : null,
      change24h: open > 0 ? ((last - open) / open) * 100 : null,
    };
    perpTickerCache.set(coin, { at: Date.now(), data });
    return data;
  } catch (e) {
    return null;
  }
};
const perpTickerFor = (coin) => {
  const hit = perpTickerCache.get(coin);
  return hit && Date.now() - hit.at < PERP_TICKER_MAX_AGE ? hit.data : null;
};
const perpLastFor = (coin) => {
  const t = perpTickerFor(coin);
  return t ? t.last : null;
};

/* **The perpetual's own history, for the page's chart.** The account's
 * levels are USDT prices, so the chart they are drawn across has to be the
 * contract's series — a chart in the app's display currency put a USDT
 * entry on a euro line. OKX candles on the same host; the bar is chosen so
 * each range has about as many points as the main chart draws, and a range
 * longer than one request (`candles` answers at most 300) pages back through
 * `history-candles` (at most 100 a call).
 *
 * Answers `[{ price, time, vol, open, high, low }]` oldest first, `time` in
 * ms — `valueHistory`'s shape plus the candle, so anything that reads a
 * close series reads it unchanged.
 * Persisted through the widget cache, one TTL per range (`perpSeries*`),
 * because a year of daily closes does not need asking for on every tab. */
const PERP_SERIES_BARS = {
  hour: ["1m", 60, "perpSeriesHour"],
  day: ["5m", 288, "perpSeriesDay"],
  week: ["1H", 168, "perpSeriesWeek"],
  month: ["4H", 180, "perpSeriesMonth"],
  year: ["1D", 365, "perpSeriesYear"],
  all: ["1W", 300, "perpSeriesAll"],
};
const fetchPerpSeries = async (coin, period) => {
  const spec = PERP_SERIES_BARS[period];
  if (!coin || !spec) return null;
  const [bar, want, name] = spec;
  const key = coinWidgetKey(name, coin);
  const cached = getWidgetCache(key);
  /* A series cached before the candles were kept (27 Sep 2026) has closes
     only; it is asked again rather than drawn as a line for up to half a
     day. */
  if (cached && (!cached.length || cached[0].open > 0)) return cached;
  try {
    const rows = [];
    let before = null;
    while (rows.length < want) {
      const n = before == null ? Math.min(300, want) : Math.min(100, want - rows.length);
      const url = before == null
        ? `${OKX_API}/market/candles?instId=${coin}-USDT-SWAP&bar=${bar}&limit=${n}`
        : `${OKX_API}/market/history-candles?instId=${coin}-USDT-SWAP&bar=${bar}&limit=${n}&after=${before}`;
      const res = await fetch(url);
      if (!res.ok) break;
      const json = await res.json();
      const page = json && json.code === "0" && Array.isArray(json.data) ? json.data : [];
      if (!page.length) break;
      for (const c of page) {
        const time = Number(c && c[0]);
        const price = parseFloat(c && c[4]);
        /* The bar's volume in **coins** (OKX's volCcy, c[6]) rides with the
           close: the volume profile — where this range did its business —
           is bucketed from it, and a series that threw it away could only
           say where the price went, never how much traded there. */
        const vol = parseFloat(c && c[6]);
        /* **The whole candle** (27 Sep 2026): the page draws the perpetual
           as candles now, as a venue does, and the open, high and low were
           in the same row the close was read from. A bar whose three do not
           bracket its close is kept as a close alone. */
        const open = parseFloat(c && c[1]);
        const high = parseFloat(c && c[2]);
        const low = parseFloat(c && c[3]);
        const whole = open > 0 && high > 0 && low > 0 && high >= low && high >= Math.max(open, price) && low <= Math.min(open, price);
        if (isFinite(time) && price > 0) {
          rows.push(whole
            ? { price, time, vol: isFinite(vol) && vol >= 0 ? vol : 0, open, high, low }
            : { price, time, vol: isFinite(vol) && vol >= 0 ? vol : 0 });
        }
      }
      before = Number(page[page.length - 1][0]);
      if (page.length < n) break;
    }
    if (rows.length < 2) return null;
    rows.sort((a, b) => a.time - b.time);
    setWidgetCache(key, rows);
    return rows;
  } catch (e) {
    return null;
  }
};

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

