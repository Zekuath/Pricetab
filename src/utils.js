// Format price for ticker (compact or full)
const formatTickerPrice = (
  price,
  currencySymbol,
  format,
  decimalPlaces,
  separatorFormat,
) => {
  if (typeof price !== "number" || isNaN(price)) {
    return "—";
  }

  if (format === "compact") {
    // Compact format: 43.2K, 1.5M, etc.
    const absPrice = Math.abs(price);
    let formatted;
    if (absPrice >= 1000000) {
      formatted = (price / 1000000).toFixed(2) + "M";
    } else if (absPrice >= 1000) {
      formatted = (price / 1000).toFixed(1) + "K";
    } else if (absPrice >= 1) {
      formatted = price.toFixed(2);
    } else {
      formatted = price.toFixed(4);
    }
    return formatted;
  } else {
    // Full format with currency symbol
    return formatNumberString(
      price,
      currencySymbol,
      true,
      false,
      decimalPlaces,
      separatorFormat,
    );
  }
};

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

/* TAB TITLE UPDATE */
const updateTabTitle = (coinOptions, coinIndex, currentValue, valueHistory) => {
  try {
    if (!coinOptions || coinOptions.length === 0) {
      document.title = "New Tab";
      return;
    }

    const activeCoin = coinOptions[coinIndex] || coinOptions[0];

    if (typeof currentValue === "number" && activeCoin) {
      const formattedPrice = formatNumberString(currentValue, "$", true);

      // Calculate percentage change
      const percentDelta = derivePercentDelta(currentValue, valueHistory);
      let percentStr = "";

      if (typeof percentDelta === "number") {
        const sign = percentDelta >= 0 ? "+" : "";
        percentStr = ` (${sign}${percentDelta.toFixed(2)}%)`;
      }

      document.title = `${activeCoin} ${formattedPrice}${percentStr}`;
    } else {
      document.title = activeCoin;
    }
  } catch (e) {
    document.title = "New Tab";
  }
};

/* MEMOIZATION HELPER */
const memoize = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    // Limit cache size to prevent memory leaks
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    return result;
  };
};

/* DEBOUNCE HELPER */
const debounce = (fn, delay) => {
  let timeoutId = null;
  const debounced = function (...args) {
    const context = this;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn.apply(context, args);
    }, delay);
  };
  debounced.cancel = () => {
    clearTimeout(timeoutId);
    timeoutId = null;
  };
  return debounced;
};

/* UTILITY FUNCTIONS */
const formatValueHistory = (prices) =>
  prices
    .map((p) => ({
      price: Number(p.price),
      time: new Date(p.time * 1000),
    }))
    .sort((a, b) => a.time - b.time);

/* CANDLESTICKS ─────────────────────────────────────────────────────────────
 * Two pure steps so the drawing code stays dumb and both are testable:
 * aggregate to a bar count the width can actually show, then scale to pixels.
 */

/* How many bars this data can actually fill.
 *
 * A thin market doesn't trade every interval: XMR's one-minute candles are
 * two thirds empty, and an empty candle has open = high = low = close, which
 * draws as a dash with no body or wick. Sixty of those read as a broken
 * chart rather than a quiet hour. Merging them until most buckets contain a
 * trade gives real bodies again, and since it is the same aggregation the
 * width uses, the bars stay truthful — a merged candle is still first open,
 * last close, extreme high/low.
 *
 * Returns Infinity when the data is dense enough to leave alone, or when no
 * volume is reported at all (some ranges don't carry it, and guessing from
 * flat candles would merge a genuinely calm market).
 */
const candleDensityCap = (candles, minBars = 12) => {
  if (!Array.isArray(candles) || !candles.length) return Infinity;
  let traded = 0;
  for (const c of candles) if (Number(c.volume) > 0) traded++;
  if (!traded) return Infinity;
  if (traded >= candles.length * 0.66) return Infinity;
  // Aim for about two trading intervals per bar. Measured on XMR's hour:
  // one interval per bar still left 37% of bars flat because the quiet
  // minutes cluster, two brought it to 7%, and merging further gained
  // nothing while costing detail.
  return Math.max(minBars, Math.round(traded / 2));
};

// Merge candles into `maxBars` buckets: first open, last close, extreme
// high/low, summed volume — the standard reduction, so a bucket is still a
// truthful candle rather than a sample. Drawing 700 slivers on a 1400px
// chart costs the same as drawing 200 and reads worse.
const aggregateCandles = (candles, maxBars) => {
  if (!Array.isArray(candles) || !candles.length) return [];
  if (!(maxBars > 0) || candles.length <= maxBars) return candles;
  const size = Math.ceil(candles.length / maxBars);
  const out = [];
  for (let i = 0; i < candles.length; i += size) {
    const chunk = candles.slice(i, i + size);
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const c of chunk) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += Number(c.volume) || 0;
    }
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      close: chunk[chunk.length - 1].close,
      high,
      low,
      volume,
    });
  }
  return out;
};

// Pixel geometry for each bar. The y scale spans highs and lows (not just
// closes) so wicks can't run off the top or bottom of the plot.
/* `left`/`right` are the x bounds the bars are spread across — the history
 * area, which with calls on stops short of the reserved board. Defaulted to
 * the full width so every other caller is unchanged. */
const scaleCandles = (candles, height, width, padding = 0, left = null, right = null) => {
  if (!Array.isArray(candles) || candles.length < 1) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const c of candles) {
    if (c.low < min) min = c.low;
    if (c.high > max) max = c.high;
  }
  if (!isFinite(min) || !isFinite(max)) return null;
  if (min === max) {
    // A flat range would divide by zero; give it a nominal band
    min -= 1;
    max += 1;
  }
  const plotH = Math.max(1, height - padding * 2);
  const x0 = left == null ? padding : left;
  const x1 = right == null ? width - padding : right;
  const plotW = Math.max(1, x1 - x0);
  const y = (v) => padding + (1 - (v - min) / (max - min)) * plotH;
  const step = plotW / candles.length;
  // Leave a hairline gap between bars; never thinner than a visible line
  const barW = Math.max(1, Math.min(step * 0.7, 18));
  return {
    barW,
    // What the crosshair needs to turn an x back into a bar, without having to
    // reconstruct the layout from constants it does not own
    step,
    x0,
    bars: candles.map((c, i) => ({
      x: x0 + step * (i + 0.5),
      yOpen: y(c.open),
      yClose: y(c.close),
      yHigh: y(c.high),
      yLow: y(c.low),
      up: c.close >= c.open,
    })),
  };
};

/* Volume bars, drawn in a band along the bottom of the chart.
 *
 * The band has its own scale — volume and price share no units, and putting
 * them on one axis is the classic misleading chart. It is also drawn from
 * the same bars as the candles, so a bar always sits under the candle it
 * belongs to.
 *
 * Scaled against the 95th percentile rather than the maximum: one spike is
 * enough to flatten every other bar into the baseline, and the point of the
 * band is comparing ordinary days to each other. Bars past that clip to full
 * height, which reads as "off the scale" rather than pretending to be exact.
 */
const VOLUME_BAND_RATIO = 0.18; // share of the chart height the band occupies

const volumeBarsData = (scaled, bars, height, up) => {
  if (!scaled || !Array.isArray(bars) || bars.length !== scaled.bars.length) {
    return "";
  }
  const volumes = bars
    .map((b) => Number(b.volume) || 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (!volumes.length) return "";
  // Nearest-rank on a 0-indexed list. Using length × 0.95 would land on the
  // last element for small samples, making the outlier its own cutoff and
  // flattening everything else — the exact thing the percentile is for.
  const cutoff = volumes[Math.floor((volumes.length - 1) * 0.95)];
  if (!(cutoff > 0)) return "";

  const bandTop = height * (1 - VOLUME_BAND_RATIO);
  const bandHeight = height - bandTop;
  const half = scaled.barW / 2;
  let d = "";
  for (let i = 0; i < bars.length; i++) {
    if (scaled.bars[i].up !== up) continue;
    const volume = Number(bars[i].volume) || 0;
    if (volume <= 0) continue;
    const h = Math.max(1, Math.min(1, volume / cutoff) * bandHeight);
    const x = scaled.bars[i].x - half;
    d +=
      `M${x.toFixed(2)} ${(height - h).toFixed(2)}` +
      `h${scaled.barW.toFixed(2)}v${h.toFixed(2)}h${(-scaled.barW).toFixed(2)}Z`;
  }
  return d;
};

/* Morphing one candle set into another.
 *
 * Bar counts differ between ranges (60 one-minute bars become 120 six-hour
 * ones), so there is no bar-to-bar pairing to tween. Instead each bar reads
 * the other set at its own relative position along the chart, which stretches
 * the old shape into the new one: bars slide and grow rather than the whole
 * chart blinking out and back.
 *
 * `to` decides the bar count and the up/down split, so the result always ends
 * exactly on the destination. Running it with the arguments swapped and
 * `1 - t` gives the mirror image — the old set morphing toward the new one
 * while keeping its own colours, which is what the outgoing layer draws.
 */
const lerp = (a, b, t) => a + (b - a) * t;

// The bar `bars` would have at normalized position `pos` (0-1)
const sampleBarAt = (bars, pos) => {
  if (bars.length === 1) return bars[0];
  const f = Math.min(Math.max(pos, 0), 1) * (bars.length - 1);
  const i = Math.floor(f);
  const j = Math.min(i + 1, bars.length - 1);
  const u = f - i;
  const a = bars[i];
  const b = bars[j];
  return {
    x: lerp(a.x, b.x, u),
    yOpen: lerp(a.yOpen, b.yOpen, u),
    yClose: lerp(a.yClose, b.yClose, u),
    yHigh: lerp(a.yHigh, b.yHigh, u),
    yLow: lerp(a.yLow, b.yLow, u),
    up: b.up,
  };
};

const interpolateCandleScale = (from, to, t) => {
  if (!to || !to.bars || !to.bars.length) return to;
  if (!from || !from.bars || !from.bars.length || t >= 1) return to;
  const n = to.bars.length;
  return {
    barW: lerp(from.barW, to.barW, t),
    bars: to.bars.map((target, i) => {
      const src = sampleBarAt(from.bars, n === 1 ? 0 : i / (n - 1));
      return {
        x: lerp(src.x, target.x, t),
        yOpen: lerp(src.yOpen, target.yOpen, t),
        yClose: lerp(src.yClose, target.yClose, t),
        yHigh: lerp(src.yHigh, target.yHigh, t),
        yLow: lerp(src.yLow, target.yLow, t),
        up: target.up, // colour belongs to the set being drawn
      };
    }),
  };
};

/* Path data for one direction's bars: a wick line plus a body rectangle per
 * candle, concatenated. Two paths draw the whole chart no matter how many
 * candles there are — 700 separate nodes would cost far more to build and
 * to reconcile than the pixels are worth. */
const candlePathData = (scaled, up) => {
  if (!scaled) return "";
  const half = scaled.barW / 2;
  let d = "";
  for (const b of scaled.bars) {
    if (b.up !== up) continue;
    const top = Math.min(b.yOpen, b.yClose);
    const bottom = Math.max(b.yOpen, b.yClose);
    // A doji would be a zero-height rect and vanish — floor it to a line
    const bodyH = Math.max(bottom - top, 1);
    d += `M${b.x.toFixed(2)} ${b.yHigh.toFixed(2)}V${b.yLow.toFixed(2)}`;
    d +=
      `M${(b.x - half).toFixed(2)} ${top.toFixed(2)}` +
      `h${scaled.barW.toFixed(2)}v${bodyH.toFixed(2)}` +
      `h${(-scaled.barW).toFixed(2)}Z`;
  }
  return d;
};

/* `yLo`/`yHi` override the price domain. The chart normally fits whatever it
 * is given, which is why the domain is read off the data — but a board of
 * squares needs a scale that does *not* move every time a new high arrives,
 * so calls mode decides the window itself and passes it in. */
const scalePricesCore = (
  data,
  height,
  width,
  paddingTop = 0,
  paddingBottom = 0,
  paddingLeft = 0,
  paddingRight = 0,
  yLo = null,
  yHi = null,
) => {
  const domain =
    yLo != null && yHi != null && yHi > yLo
      ? [yLo, yHi]
      : extent(data, (d) => d.price);
  const priceToY = scaleLinear()
    .range([height - paddingBottom, paddingTop])
    .domain(domain);

  const timeToX = scaleTime()
    .range([paddingLeft, width - paddingRight])
    .domain(extent(data, (d) => d.time));

  return data.map(({ price, time }) => ({
    price: priceToY(price),
    time: timeToX(time),
  }));
};

// Memoized version for performance
/* Cached on the *identity* of the series, not on its contents.
 *
 * This went through `memoize`, which keys on `JSON.stringify(args)` — and the
 * first argument is the whole price series, so every call built a string of
 * three hundred points to look up an answer. Worse under a drag: each frame
 * passes a different padding, so each frame minted a new key and a new entry,
 * filling a hundred-entry cache with a hundred scaled copies of the series
 * nobody would ask for again.
 *
 * The series arrives as the same array on every redraw until new prices come
 * in, so `===` answers the question the string was being built to answer. Four
 * entries because two charts can be on screen (the portfolio draws its own)
 * and each wants a live entry and the one it had before the last change. */
const SCALE_CACHE = [];
const scalePrices = (data, height, width, pt, pb, pl, pr, yLo, yHi) => {
  const key = `${height}|${width}|${pt}|${pb}|${pl}|${pr}|${yLo}|${yHi}`;
  for (const entry of SCALE_CACHE) {
    if (entry.data === data && entry.key === key) return entry.out;
  }
  const out = scalePricesCore(data, height, width, pt, pb, pl, pr, yLo, yHi);
  SCALE_CACHE.unshift({ data, key, out });
  if (SCALE_CACHE.length > 4) SCALE_CACHE.pop();
  return out;
};

/* The y `scalePrices` would give an arbitrary price — for drawing a
 * horizontal reference across the chart at a level that isn't a data point.
 *
 * Null when the level falls outside the range the chart actually covers.
 * Clamping it to an edge would draw a line claiming the price came down to
 * meet it when it never entered the window at all, and a reference line that
 * can lie is worse than no reference line.
 */
const priceToChartY = (
  data,
  value,
  height,
  paddingTop = 0,
  paddingBottom = 0,
) => {
  if (!Array.isArray(data) || data.length < 2) return null;
  if (!isFinite(value)) return null;
  const [min, max] = extent(data, (d) => d.price);
  if (!isFinite(min) || !isFinite(max) || min === max) return null;
  if (value < min || value > max) return null;
  return scaleLinear()
    .range([height - paddingBottom, paddingTop])
    .domain([min, max])(value);
};

const lineFromPrices = line()
  .x((d) => d.time)
  .y((d) => d.price);

/* COMPARISON MODE ─────────────────────────────────────────────────────────
 * Two coins never share a price axis. BTC near 60,000 next to XRP near 0.50
 * presses one of them flat against the floor, and the usual escape — giving
 * each line its own y-axis — is the textbook misleading chart: where the two
 * lines cross is then decided by where the scales were put, not by anything
 * that happened in the market.
 *
 * So both series are converted to percent change from the start of the range.
 * That is a quantity the two coins genuinely share, one axis is therefore
 * honest for both, and it is the question the mode exists to answer: which of
 * these has done better over the range I am looking at?
 */
const toPercentChange = (history) => {
  const out = [];
  let base = null;
  for (const point of history || []) {
    const price = Number(point.price);
    const time = Number(new Date(point.time));
    if (!isFinite(price) || price <= 0 || !isFinite(time)) continue;
    if (base === null) base = price;
    out.push({ percent: ((price - base) / base) * 100, time });
  }
  return out.length >= 2 ? out : [];
};

/* Two coins that both sat still would otherwise be stretched to fill the
 * chart, turning a tenth of a percent of drift into a dramatic crossing. The
 * domain never closes tighter than this, so flat reads as flat. */
const COMPARE_MIN_SPAN = 1; // percentage points

const scaleComparison = (historyA, historyB, height, width, padding = 0) => {
  const a = toPercentChange(historyA);
  const b = toPercentChange(historyB);
  if (!a.length || !b.length) return null;

  // One domain for both series, in both directions — that sharing is the mode
  let low = Infinity;
  let high = -Infinity;
  let start = Infinity;
  let end = -Infinity;
  for (const list of [a, b]) {
    for (const point of list) {
      if (point.percent < low) low = point.percent;
      if (point.percent > high) high = point.percent;
      if (point.time < start) start = point.time;
      if (point.time > end) end = point.time;
    }
  }
  if (!(end > start)) return null;
  if (high - low < COMPARE_MIN_SPAN) {
    const mid = (high + low) / 2;
    low = mid - COMPARE_MIN_SPAN / 2;
    high = mid + COMPARE_MIN_SPAN / 2;
  }

  const percentToY = scaleLinear()
    .range([height - padding, padding])
    .domain([low, high]);
  const timeToX = scaleLinear()
    .range([padding, width - padding])
    .domain([start, end]);

  // Named price/time so the existing line generator draws these unchanged
  const project = (list) =>
    list.map((point) => ({
      price: percentToY(point.percent),
      time: timeToX(point.time),
      percent: point.percent,
      at: point.time,
    }));

  return {
    a: project(a),
    b: project(b),
    low,
    high,
    /* The 0% line is what the whole chart is read against, and it is always
     * on screen: both series start at 0% by construction, so the domain can
     * never sit entirely above or below it. */
    zeroY: percentToY(0),
    lastA: a[a.length - 1].percent,
    lastB: b[b.length - 1].percent,
  };
};

const formatSignedPercent = (value) => {
  const v = Number(value);
  if (!isFinite(v)) return "";
  return `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(2)}%`;
};

/* High and low of whatever range the chart is showing. Read off the series
 * already on screen, so it stays true to the chart rather than to a fixed
 * window the user can't see. */
const deriveRangeStats = (valueHistory) => {
  if (!Array.isArray(valueHistory) || valueHistory.length < 2) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const point of valueHistory) {
    const price = Number(point.price);
    if (!isFinite(price)) continue;
    if (price > high) high = price;
    if (price < low) low = price;
  }
  if (!isFinite(high) || !isFinite(low)) return null;
  return { high, low };
};

/* Big numbers for the stats row: market caps run to twelve digits, which
 * would swamp the line they sit on. */
const formatCompactAmount = (value, symbol) => {
  const v = Number(value);
  if (!isFinite(v) || v <= 0) return null;
  const units = [
    { at: 1e12, suffix: "T" },
    { at: 1e9, suffix: "B" },
    { at: 1e6, suffix: "M" },
    { at: 1e3, suffix: "K" },
  ];
  for (const { at, suffix } of units) {
    if (v >= at) return `${symbol}${(v / at).toFixed(2)}${suffix}`;
  }
  return `${symbol}${v.toFixed(2)}`;
};

/* Axis labels for the chart grid.
 *
 * The decimals come from the *step between levels*, not from the magnitude
 * of the number. That is the only rule that works across this coin list: at
 * a $500 step "64500" needs none, and at a $0.002 step Dogecoin needs three —
 * formatting by magnitude gave two adjacent gridlines the same label ($0.07
 * and $0.07), which makes the grid useless for reading a level off.
 */
const formatAxisPrice = (value, step, symbol = "") => {
  const v = Number(value);
  const s = Number(step);
  if (!isFinite(v)) return "";
  const places = (x) =>
    isFinite(x) && x > 0 ? Math.max(0, Math.min(8, Math.ceil(-Math.log10(x)))) : 2;
  if (Math.abs(v) >= 1e3) {
    const units = [
      { at: 1e12, suffix: "T" },
      { at: 1e9, suffix: "B" },
      { at: 1e6, suffix: "M" },
      { at: 1e3, suffix: "K" },
    ];
    for (const { at, suffix } of units) {
      if (Math.abs(v) >= at) {
        return `${symbol}${(v / at).toFixed(places(s / at))}${suffix}`;
      }
    }
  }
  return `${symbol}${v.toFixed(places(s))}`;
};

/* ── Calls: settling one ──
 *
 * A call names a box: this price band, at this time. Settling it needs the
 * price *at that time*, not the price now — someone who opens a tab three
 * hours after the target must not be judged on three hours of drift they
 * were never asked about. So the series is searched for the point nearest
 * the target, and it only counts when that point is genuinely near: within
 * half the call's own cell width. Anything looser and the answer is about a
 * different moment than the one that was called.
 *
 * Four outcomes, and "expired" is a real one. If the tab stays shut long
 * enough for the target to fall off the start of the range, the evidence is
 * gone. Guessing from whatever is left would let the record drift away from
 * what actually happened, and this record's only job is to be true.
 */

const settleCall = (call, prices, now) => {
  const out = (status, price) => ({ status, price: price == null ? null : price });
  if (!call || !isFinite(call.target) || !isFinite(call.span)) return out("expired");
  if (!(now >= call.target)) return out("pending");

  const data = Array.isArray(prices) ? prices : [];
  if (data.length < 2) return out("pending");

  const at = (d) => (d.time instanceof Date ? d.time.getTime() : Number(d.time));
  const first = at(data[0]);
  const last = at(data[data.length - 1]);
  if (!isFinite(first) || !isFinite(last)) return out("pending");

  // The target predates everything on screen: the moment is unrecoverable
  if (call.target < first) return out("expired");
  // The series has not caught up yet — ask again next time
  if (call.target > last + call.span) return out("pending");

  let best = null;
  let bestGap = Infinity;
  for (const d of data) {
    const gap = Math.abs(at(d) - call.target);
    if (gap < bestGap) {
      bestGap = gap;
      best = d;
    }
  }
  if (!best || bestGap > call.span / 2) return out("pending");

  const price = Number(best.price);
  if (!isFinite(price)) return out("pending");
  return out(price >= call.lo && price <= call.hi ? "hit" : "miss", price);
};

/* Who claimed each column, and whether anyone contested it.
 *
 * Several calls can share a column — same minutes, different price bands —
 * and they are not equal: the earliest one placed there is the claim, the
 * rest are hedges around it. That is what the chart's `CALLED · 1ST` tag
 * means, and it is also what decides whether a win is worth a firework, so
 * the test lives here rather than in either caller. It was inline in the
 * chart's draw loop; the second reader would have been a copy, and a copy of
 * a rule this small is the one that drifts.
 *
 * The caller filters to one coin, currency and range first — a column is a
 * stretch of time on one chart, and two coins at the same minute are not
 * competing for anything.
 */
const callColumns = (calls) => {
  const columns = new Map();
  for (const c of calls || []) {
    const placed = isFinite(c.placed) ? c.placed : Infinity;
    const at = columns.get(c.target);
    if (!at) columns.set(c.target, { first: placed, count: 1 });
    else {
      at.count += 1;
      if (placed < at.first) at.first = placed;
    }
  }
  return columns;
};

/* First into a column somebody else also called. Both halves matter: a mark
 * every lone call carries says nothing about being first, so a column of one
 * is never leading. */
const isLeadingCall = (call, columns) => {
  if (!call || !columns) return false;
  const column = columns.get(call.target);
  if (!column || column.count < 2) return false;
  return (isFinite(call.placed) ? call.placed : Infinity) === column.first;
};

/* Applies a settled outcome to the tally. Separate from `settleCall` so the
 * arithmetic can be checked on its own, and so a miss and a hit go through
 * exactly the same path. */
const applyCallResult = (record, status) => {
  const r = {
    hits: record && isFinite(record.hits) ? record.hits : 0,
    total: record && isFinite(record.total) ? record.total : 0,
    streak: record && isFinite(record.streak) ? record.streak : 0,
    best: record && isFinite(record.best) ? record.best : 0,
  };
  if (status !== "hit" && status !== "miss") return r;   // expired never counts
  r.total += 1;
  if (status === "hit") {
    r.hits += 1;
    r.streak += 1;
    if (r.streak > r.best) r.best = r.streak;
  } else {
    r.streak = 0;
  }
  return r;
};

/* Prices for the widget list rows. The panel is narrow, so the decimals
 * adapt to the magnitude instead of using the display setting: a $65,014.68
 * would crowd out the change column, while a $0.0000 would say nothing.
 * The separator format is still respected. */
const formatWidgetPrice = (value, symbol, separatorFormat) => {
  const v = Number(value);
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  const decimals = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return formatNumberString(v, symbol, true, false, decimals, separatorFormat);
};

// Coarse "how long ago" for the since-last-visit line. Deliberately vague —
// the point is orientation ("this morning"), not a stopwatch.
const describeElapsed = (ms) => {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return "a month ago";
};

/* The mirror of `describeElapsed`, for something that has not happened yet.
 * Same thresholds, so "3h ago" and "in 3h" read as the same scale — and it
 * degrades to "now" rather than "0 min" when the moment has arrived. */
const describeAhead = (ms) => {
  if (!isFinite(ms) || ms <= 0) return "now";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "tomorrow";
  if (days < 30) return `in ${days} days`;
  return "in over a month";
};

/* A duration written the way someone would say it: "2 days", "6h", "45 min".
 * Not `describeAhead` — that answers "when", this answers "how long", and a
 * square's size is a length, not a moment. */
const describeSpan = (ms) => {
  if (!isFinite(ms) || ms <= 0) return "";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = ms / 3600e3;
  if (hours < 24) return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, "") : Math.round(hours)}h`;
  const days = ms / 86400e3;
  if (days < 14) return `${days < 10 ? days.toFixed(1).replace(/\.0$/, "") : Math.round(days)} days`;
  const weeks = ms / 604800e3;
  if (weeks < 9) return `${weeks.toFixed(1).replace(/\.0$/, "")} weeks`;
  return `${Math.round(ms / 2629800e3)} months`;
};

/* The moments in a series where the price did something out of the ordinary
 * *for that series*.
 *
 * Entirely local — no request decides where a mark goes, which is what makes
 * the feature affordable: a chart nobody points at costs nothing. What the
 * headlines cost is paid on the hover, one window at a time.
 *
 * Measured in standard deviations of the series' own step-to-step returns, not
 * in a fixed percentage. A fixed threshold is wrong at both ends: 3% is an
 * ordinary hour for DOGE and a violent year for USDC, so one number would mark
 * everything on one coin and nothing on another. The step is whatever the
 * range's resolution happens to be — 30 seconds on 1H, 91 days on ALL — and
 * that is the right unit, because the question is "what stands out on the
 * chart I am looking at".
 *
 * Log returns, so a fall of 20% and a rise of 25% are the same size — on a
 * plain percentage the up moves dominate the tail and the marks drift onto one
 * side of the chart.
 *
 * The first return is skipped rather than measured: `prices[0]` has nothing
 * before it, and treating the opening level as a move from zero puts a mark on
 * the left edge of every chart.
 */
const findUnusualMoves = (prices, options = {}) => {
  const sigma = isFinite(options.sigma) ? options.sigma : 2.5;
  const max = isFinite(options.max) ? options.max : 6;
  if (!Array.isArray(prices) || prices.length < 12 || max < 1) return [];

  const steps = [];
  for (let i = 1; i < prices.length; i++) {
    const a = Number(prices[i - 1].price);
    const b = Number(prices[i].price);
    if (!(a > 0) || !(b > 0)) {
      steps.push(null);
      continue;
    }
    steps.push(Math.log(b / a));
  }
  const real = steps.filter((s) => s !== null && isFinite(s));
  if (real.length < 10) return [];
  const mean = real.reduce((t, s) => t + s, 0) / real.length;
  const sd = Math.sqrt(
    real.reduce((t, s) => t + (s - mean) ** 2, 0) / real.length,
  );
  /* A flat or near-flat series has no unusual moment in it, and dividing by a
   * standard deviation of zero would call every rounding error a spike. */
  if (!(sd > 0)) return [];

  const found = [];
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] === null) continue;
    const z = (steps[i] - mean) / sd;
    if (Math.abs(z) < sigma) continue;
    const at = prices[i + 1];
    const before = prices[i];
    const from = Number(before.price);
    const to = Number(at.price);
    found.push({
      index: i + 1,
      z,
      // Both ends of the move, because the window the headlines come from is
      // the span between them, not a single instant
      startTime: +new Date(before.time),
      time: +new Date(at.time),
      from,
      to,
      pct: ((to - from) / from) * 100,
    });
  }

  /* The biggest few, then back into time order. Sorting only by size would
   * hand the caller a list that draws right-to-left at random, and the cap has
   * to be applied to the *biggest*, not to the first few in the series. */
  return found
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, max)
    .sort((a, b) => a.time - b.time);
};

/* HTML entities out of a plain string, without touching the DOM.
 *
 * WordPress hands back `title.rendered`, which is HTML: `&#8217;` for an
 * apostrophe, `&amp;` for an ampersand, `&#8220;` for a quote. The usual trick
 * is to set it as `innerHTML` and read `textContent` back, and that is exactly
 * the pattern this repository forbids — `tests/test-invariants.js` fails on
 * any `innerHTML` assignment, because the string came off the network.
 *
 * A table plus the numeric forms covers everything a headline contains. The
 * numeric branch is clamped: `String.fromCodePoint` throws on anything above
 * 0x10FFFF, and a malformed feed should give back a slightly wrong headline,
 * never an exception on the way to the screen.
 */
const HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  eacute: "é",
  pound: "£",
  euro: "€",
  deg: "°",
};

const decodeEntities = (text) => {
  if (typeof text !== "string" || text.indexOf("&") === -1) return text || "";
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch (error) {
        return whole;
      }
    }
    const known = HTML_ENTITIES[body.toLowerCase()];
    return known === undefined ? whole : known;
  });
};

const NUMBER_REG = /\B(?=(\d{3})+(?!\d))/g;

const getSign = (price, hidePlus) => {
  if (!hidePlus && price > 0) return "+";
  if (price < 0) return "-";
  return "";
};

const formatNumberStringCore = (
  price,
  symbol = "",
  hidePlus = false,
  symbolAfter = false,
  decimalPlaces = DEFAULT_DECIMAL_PLACES,
  separatorFormat = DEFAULT_SEPARATOR_FORMAT,
) => {
  if (typeof price === "number") {
    const sign = getSign(price, hidePlus);
    const string = Math.abs(price).toFixed(decimalPlaces);
    const parts = string.split(".");

    // Apply separator format
    if (separatorFormat === "us") {
      // US: 1,234.56
      parts[0] = parts[0].replace(NUMBER_REG, ",");
      return `${sign}${symbolAfter ? "" : symbol}${parts.join(".")}${
        symbolAfter ? symbol : ""
      }`;
    } else if (separatorFormat === "eu") {
      // EU: 1.234,56
      parts[0] = parts[0].replace(NUMBER_REG, ".");
      return `${sign}${symbolAfter ? "" : symbol}${parts.join(",")}${
        symbolAfter ? symbol : ""
      }`;
    } else if (separatorFormat === "space") {
      // Space: 1 234.56
      parts[0] = parts[0].replace(NUMBER_REG, " ");
      return `${sign}${symbolAfter ? "" : symbol}${parts.join(".")}${
        symbolAfter ? symbol : ""
      }`;
    }
  }
  return null;
};

// Memoized version for performance
const formatNumberString = memoize(formatNumberStringCore);

const deriveValueDelta = (currentValue, valueHistory) => {
  if (
    typeof currentValue === "number" &&
    Array.isArray(valueHistory) &&
    valueHistory.length > 0 &&
    valueHistory[0].price
  ) {
    return currentValue - valueHistory[0].price;
  }
  return null;
};

const derivePercentDelta = (currentValue, valueHistory) => {
  if (
    Array.isArray(valueHistory) &&
    valueHistory.length > 0 &&
    valueHistory[0].price
  ) {
    return (
      ((currentValue - valueHistory[0].price) /
        Math.abs(valueHistory[0].price)) *
        100 || 0
    );
  }
  return null;
};

const calculateRSI = (valueHistory, period = 14) => {
  if (!Array.isArray(valueHistory) || valueHistory.length < period + 1)
    return null;

  // Sample to ~50 points to avoid noise on short-interval periods (e.g. 1H)
  const maxPoints = 50;
  const step =
    valueHistory.length > maxPoints
      ? Math.floor(valueHistory.length / maxPoints)
      : 1;
  const sampled = valueHistory.filter((_, i) => i % step === 0);

  if (sampled.length < period + 1) return null;

  const prices = sampled.map((d) => d.price);
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
};

/* API FETCHING WITH CACHE & STALE-WHILE-REVALIDATE */
/* Volume-weighted average price over a set of candles.
 *
 * This is here because of what the sector scan found rather than what the
 * textbooks say: roughly 78% of institutional traders use technical analysis,
 * and what they primarily read is **volume-based** — VWAP, volume profile,
 * order flow — with the 200-day average as a regime line rather than an entry.
 * VWAP earns its place where RSI thresholds did not, and the reason is simple:
 * **it makes no claim about the future.** It is the average price actually
 * paid across the window, weighted by how much changed hands at each level. A
 * price that happened.
 *
 * The typical price `(high + low + close) / 3` is the conventional input, and
 * using the close alone would quietly weight the end of each bar.
 *
 * Null when there is no volume to weight by — an unweighted average of prices
 * is a different number with the same name, and printing it under this label
 * would be the sort of thing this codebase removes.
 */
const vwapOf = (candles) => {
  if (!Array.isArray(candles) || !candles.length) return null;
  let weighted = 0;
  let volume = 0;
  for (const c of candles) {
    const v = Number(c.volume);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    if (!isFinite(v) || v <= 0) continue;
    if (!isFinite(high) || !isFinite(low) || !isFinite(close)) continue;
    weighted += ((high + low + close) / 3) * v;
    volume += v;
  }
  return volume > 0 ? weighted / volume : null;
};

/* ── BASE RATES ─────────────────────────────────────────────────────────────
 * "This has happened before. Here is how often, and what followed."
 *
 * This exists in place of buy and sell signals, and the reason is measured
 * rather than tasteful (`docs/product/TODAY.md` §9). Nine textbook rules over
 * 21,669 daily closes on eight coins: **0 of 70 permutation tests survive
 * Holm–Bonferroni**, in/out-of-sample rank correlation +0.42, and Donchian's
 * median return runs +259% to +1175% across neighbouring lookbacks nobody can
 * justify in advance. The published literature lands in the same place once
 * data-snooping controls are applied: a 2017–2023 study of BTC and ETH under
 * White's reality check found that *"previously profitable technical
 * approaches… generally failed to generate profits during the subsequent
 * out-of-sample period"*.
 *
 * Worse for the textbook, measured live on 22 Aug 2026: after RSI 14 crosses
 * **70** — the "sell" signal — the next thirty days beat the coin's own
 * ordinary month on four of six coins, BTC by 7.5 percentage points over 92
 * episodes. The sign flips by coin, which is the finding: a rule whose
 * direction depends on which coin you ran it on is not a rule.
 *
 * So nothing here says buy or sell. It counts, and it prints the count. The
 * design rule that follows is the important one: **never a rate without its
 * denominator.** In two years of candles these conditions fire three to nine
 * times, so "100% of the time" is a sample of one with a percentage sign on
 * it, and the commonest honest answer — *not enough to say anything* — has to
 * read as the feature working rather than as it failing.
 */

// Under this many episodes, a percentage is theatre. The panel says so
// instead of printing one.
const BASE_RATE_MIN_EPISODES = 12;

/* RSI 14 on daily closes, Wilder's smoothing — the one every published figure
 * means by "RSI".
 *
 * Deliberately **not** `calculateRSI`, which samples whatever range is on
 * screen down to ~50 points: that makes its period sixteen minutes on 1H and
 * three and a half years on ALL, and the two must never be confused again.
 * Returns an array the same length as `closes`, null where there is not yet
 * enough history to have a value.
 */
const dailyRsi = (closes, period = 14) => {
  const out = new Array(Array.isArray(closes) ? closes.length : 0).fill(null);
  if (!Array.isArray(closes) || closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = value();
  }
  return out;
};

// Percentage move from i to i+horizon, or null past the end of the series
const forwardReturn = (closes, i, horizon) => {
  const j = i + horizon;
  if (j >= closes.length) return null;
  const from = closes[i];
  return from > 0 ? ((closes[j] - from) / from) * 100 : null;
};

const medianOf = (list) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

/* What followed every time a series entered a state, against what follows an
 * ordinary day in the same series.
 *
 * **Episodes, not days.** A run of eleven days above 70 is one thing that
 * happened, not eleven — counting each day inside it would inflate n elevenfold
 * and correlate every observation with its neighbour, which is how a sample of
 * four is dressed up as a sample of forty.
 *
 * The baseline is the coin's *own* ordinary horizon, because "up 60% of the
 * time" means nothing until you know the coin was up 57% of the time anyway.
 * That difference is the only number on this panel worth reading, and it is
 * still not a signal — see the note above.
 */
const baseRateFor = (closes, values, test, horizon) => {
  if (!Array.isArray(closes) || closes.length <= horizon + 1) return null;
  const episodes = [];
  let inside = false;
  for (let i = 0; i < values.length; i++) {
    const now = test(values[i]);
    if (now && !inside) {
      const f = forwardReturn(closes, i, horizon);
      if (f !== null) episodes.push(f);
    }
    inside = now;
  }
  const baseline = [];
  for (let i = 0; i < closes.length; i++) {
    const f = forwardReturn(closes, i, horizon);
    if (f !== null) baseline.push(f);
  }
  if (!baseline.length) return null;
  const upRate = (list) =>
    list.length ? (list.filter((x) => x > 0).length / list.length) * 100 : null;
  return {
    n: episodes.length,
    median: medianOf(episodes),
    up: upRate(episodes),
    baseN: baseline.length,
    baseMedian: medianOf(baseline),
    baseUp: upRate(baseline),
    // The one number worth reading, and only when there is enough behind it
    edge:
      episodes.length >= BASE_RATE_MIN_EPISODES
        ? medianOf(episodes) - medianOf(baseline)
        : null,
  };
};

const fetchValueHistory = async (
  coin,
  period,
  currency = "USD",
  signal = null,
  useCache = true,
  allowedCoins = [],
) => {
  // Check cache first
  if (useCache) {
    const cached = getCachedData(coin, period, currency, "history");
    if (cached && !cached.isStale) {
      // Fresh cache, return immediately
      return cached.data;
    }
  }

  // Coins Coinbase doesn't list — or has stopped answering for — come from
  // their own provider, in the same shape, and go through the same cache
  const fromKraken = async () => {
    const data = await fetchKrakenHistory(coin, period, currency, signal);
    setCachedData(coin, period, currency, "history", data, allowedCoins);
    return data;
  };
  if (effectiveProvider(coin) === "kraken") return fromKraken();

  // Fetch fresh data
  const options = signal ? { signal } : {};
  try {
    const d = await fetchWithRetry(
      `${API_BASE}${coin}-${currency}/${API_HISTORY}${period}`,
      options,
    ).then((r) => r.json());
    const prices = d && d.data && d.data.prices;

    if (Array.isArray(prices) && prices.length > 0) {
      const formattedData = formatValueHistory(prices);
      // Cache the result (only if coin is in first 10)
      setCachedData(
        coin,
        period,
        currency,
        "history",
        formattedData,
        allowedCoins,
      );
      return formattedData;
    }

    throw new Error("invalid price data returned");
  } catch (error) {
    /* A blank chart is the worst possible answer to "the other exchange is
     * having a moment". The same series exists at Kraken for all but four of
     * the coins offered here, so it is fetched from there instead and the coin
     * stays there for the rest of the tab. */
    if (!noteProviderFailure(coin, error)) throw error;
    return fromKraken();
  }
};

const fetchCurrentValue = async (
  coin,
  currency = "USD",
  signal = null,
  useCache = true,
  allowedCoins = [],
) => {
  // Check cache first (using "current" as period since spot price doesn't have periods)
  if (useCache) {
    const cached = getCachedData(coin, "current", currency, "spot");
    if (cached && !cached.isStale) {
      // Fresh cache, return immediately
      return cached.data;
    }
  }

  const fromKraken = async () => {
    const value = await fetchKrakenSpot(coin, currency, signal);
    setCachedData(coin, "current", currency, "spot", value, allowedCoins);
    return value;
  };
  if (effectiveProvider(coin) === "kraken") return fromKraken();

  // Fetch fresh data
  const options = signal ? { signal } : {};
  try {
    const d = await fetchWithRetry(
      `${API_BASE}${coin}-${currency}/${API_SPOT}`,
      options,
    ).then((r) => r.json());
    const spot = d && d.data && d.data.amount;

    if (typeof spot === "string") {
      const value = Number(spot);
      // Cache the result (only if coin is in first 10)
      setCachedData(coin, "current", currency, "spot", value, allowedCoins);
      return value;
    }

    throw new Error("invalid spot data returned");
  } catch (error) {
    // Same fallback as the history: one failing exchange is not a reason to
    // show nothing, and the price it quotes is the same price
    if (!noteProviderFailure(coin, error)) throw error;
    return fromKraken();
  }
};

