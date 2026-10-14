/* THE MONITOR ("M")
 *
 * Bloomberg's MOST and CORR for the coins on your list (2 Oct 2026), and its
 * IMAP for the market (9 Oct 2026): one screen, three tabs.
 *
 *   - **Coins** — every coin you track on one row: the price and the day from
 *     the ticker snapshot already on hand, and from 30 days of its own series
 *     the week, the month, where it sits in the month's range, how far it is
 *     from the month's high and how far a day usually goes. Sortable by any
 *     column; a row opens that coin on the chart.
 *     Above it, four counted facts about the list at once (`monitorSummary`);
 *     in it, each coin's 30 days as a line (`monitorSpark`) and how far it
 *     moved for each move of Bitcoin's (β, `compareCorrelation`'s slope) —
 *     descriptions of the window, never what comes next.
 *   - **Market** — the top 100 by market value as a map: each coin a tile
 *     sized by its value and shaded by its 24 hours (`squarify`), from the
 *     snapshot the price bar already reads — one Coinlore request, no new
 *     host. A coin the chart can draw opens on it.
 *   - **Correlation** — the Pearson correlation of every pair's moves over
 *     the same 30 days, each cell with the count it was worked out from. A
 *     description of the window, never a forecast — the compare strip's rule
 *     (`compareCorrelation`, utils.js), applied to the whole list.
 *
 * The 30-day series is the one the chart asks for on its 1M range
 * (`fetchValueHistory(coin, "month")`), through the same cache and the same
 * providers — no new host — and only while this screen is open.
 */

const MONITOR_PERIOD = "month";
const MONITOR_DAY_MS = 86400000;
// How many coins' series are asked for at once
const MONITOR_CONCURRENCY = 3;

const monitorPoints = (series) =>
  (Array.isArray(series) ? series : [])
    .map((p) => ({ t: Number(new Date(p.time)), price: Number(p.price) }))
    .filter((p) => isFinite(p.t) && p.price > 0)
    .sort((a, b) => a.t - b.t);

/* **The month, side by side** (13 Oct 2026): each coin's 30 days as the
   percent change from its own first point, on one time axis — who is ahead,
   who fell behind and when. Thinned to `n` points a line (bucket low and
   high kept, as the spark does). Pure; null under two lines. */
const monitorRace = (seriesBy, coins, n = 120) => {
  const lines = [];
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const coin of coins) {
    const pts = monitorPoints(seriesBy[coin]);
    if (pts.length < 3) continue;
    const base = pts[0].price;
    const size = Math.max(1, Math.ceil(pts.length / n));
    const kept = [];
    for (let i = 0; i < pts.length; i += size) {
      let a = pts[i];
      let b = pts[i];
      for (let j = i; j < Math.min(pts.length, i + size); j += 1) {
        if (pts[j].price < a.price) a = pts[j];
        if (pts[j].price > b.price) b = pts[j];
      }
      for (const q of a === b ? [a] : a.t <= b.t ? [a, b] : [b, a]) kept.push(q);
    }
    const lastPt = pts[pts.length - 1];
    if (kept[kept.length - 1] !== lastPt) kept.push(lastPt);
    const line = kept.map((q) => ({ t: q.t, v: (q.price / base - 1) * 100 }));
    t0 = Math.min(t0, pts[0].t);
    t1 = Math.max(t1, lastPt.t);
    lines.push({ coin, pts: line, last: line[line.length - 1].v });
  }
  if (lines.length < 2 || !(t1 > t0)) return null;
  let lo = 0;
  let hi = 0;
  for (const l of lines) for (const p of l.pts) {
    if (p.v < lo) lo = p.v;
    if (p.v > hi) hi = p.v;
  }
  lines.sort((a, b) => b.last - a.last);
  return { lines, t0, t1, lo, hi };
};

/* End labels a line's height apart at least, in the order of their lines,
   kept inside [top, bottom]. Pure. */
const monitorRaceLabels = (ys, gap, top, bottom) => {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k += 1) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  const over = order.length ? order[order.length - 1].y - bottom : 0;
  if (over > 0) for (const o of order) o.y -= over;
  for (let k = 0; k < order.length; k += 1) order[k].y = Math.max(order[k].y, top + k * gap);
  const out = new Array(ys.length);
  for (const o of order) out[o.i] = o.y;
  return out;
};

/* The change since `ms` before the last point, in percent — null when the
   series does not reach that far back (a coin listed last week has no
   month). */
const monitorChangeSince = (pts, ms) => {
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const from = last.t - ms;
  if (pts[0].t > from + ms * 0.05) return null;
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].t <= from) i += 1;
  return (last.price / pts[i].price - 1) * 100;
};

/* One coin's row from its 30-day series. Pure. */
const monitorRow = (series) => {
  const pts = monitorPoints(series);
  if (pts.length < 3) return null;
  const last = pts[pts.length - 1].price;
  let hi = -Infinity;
  let lo = Infinity;
  for (const p of pts) {
    if (p.price > hi) hi = p.price;
    if (p.price < lo) lo = p.price;
  }
  /* How far a day usually goes: the standard deviation of the log steps,
     scaled to a day by the steps a day holds. Either way — it is a size,
     not a direction. */
  const steps = [];
  for (let i = 1; i < pts.length; i += 1) steps.push(Math.log(pts[i].price / pts[i - 1].price));
  const gaps = pts.slice(1).map((p, i) => p.t - pts[i].t).sort((a, b) => a - b);
  const step = gaps[Math.floor(gaps.length / 2)];
  let dailyMove = null;
  if (steps.length >= 2 && step > 0) {
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    const sd = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / (steps.length - 1));
    dailyMove = sd * Math.sqrt(MONITOR_DAY_MS / step) * 100;
  }
  return {
    // The series' own last price and day, for a coin the ticker has not swept
    last,
    change1d: monitorChangeSince(pts, MONITOR_DAY_MS),
    change7d: monitorChangeSince(pts, 7 * MONITOR_DAY_MS),
    change30d: monitorChangeSince(pts, 30 * MONITOR_DAY_MS),
    range: hi > lo ? (last - lo) / (hi - lo) : null,
    fromHigh: hi > 0 ? (last / hi - 1) * 100 : null,
    // The month's ends, for the coin's card (12 Oct 2026)
    high: hi,
    low: lo,
    dailyMove,
    step,
  };
};

/* Every pair once — the matrix is symmetric — and the diagonal is no
   measurement at all. Pure. */
const correlationMatrix = (coins, seriesByCoin) => {
  const out = {};
  for (let i = 0; i < coins.length; i += 1) {
    for (let j = i + 1; j < coins.length; j += 1) {
      const a = seriesByCoin[coins[i]];
      const b = seriesByCoin[coins[j]];
      let c = Array.isArray(a) && Array.isArray(b) ? compareCorrelation(a, b) : null;
      /* …and the plainer of the two counts beside it: how many of the steps
         both took went the same way (12 Oct 2026) */
      const sd = c ? compareSameDirection(a, b) : null;
      if (c && sd) c = Object.assign({}, c, { same: sd.same, sameN: sd.n });
      out[`${coins[i]}|${coins[j]}`] = c;
      out[`${coins[j]}|${coins[i]}`] = c;
    }
  }
  return out;
};

/* **The correlation in words** (12 Oct 2026). Five
   bands of r with a name each — the conventional cut points (0.2, 0.5, 0.8),
   said as what the two lines did, never as what they will do. Pure. */
const CORR_BANDS = [
  { min: 0.8, key: "together" },
  { min: 0.5, key: "mostly" },
  { min: 0.2, key: "loosely" },
  { min: -0.2, key: "unrelated" },
  { min: -Infinity, key: "opposite" },
];
const corrBand = (r) => (Number.isFinite(r) ? CORR_BANDS.find((b) => r >= b.min).key : null);
const corrWord = (band) =>
  ({
    together: msg("mon_corr_together", "In step"),
    mostly: msg("mon_corr_mostly", "Mostly together"),
    loosely: msg("mon_corr_loosely", "Loosely"),
    unrelated: msg("mon_corr_unrelated", "Unrelated"),
    opposite: msg("mon_corr_opposite", "Opposite"),
  })[band] || "";

/* The pairs worth a sentence: the three most in step, the one least related,
   and any that went opposite ways. Each pair once. Pure. */
const corrHighlights = (coins, matrix) => {
  const pairs = [];
  for (let i = 0; i < coins.length; i += 1) {
    for (let j = i + 1; j < coins.length; j += 1) {
      const c = matrix[`${coins[i]}|${coins[j]}`];
      if (c && Number.isFinite(c.r)) pairs.push({ a: coins[i], b: coins[j], c });
    }
  }
  if (!pairs.length) return [];
  const byR = pairs.slice().sort((x, y) => y.c.r - x.c.r);
  const out = byR.slice(0, Math.min(3, byR.length));
  const least = pairs.slice().sort((x, y) => Math.abs(x.c.r) - Math.abs(y.c.r))[0];
  if (least && !out.includes(least)) out.push(least);
  for (const p of byR) if (p.c.r <= -0.2 && !out.includes(p)) out.push(p);
  return out;
};

/* A coin's 30 days as a line in a box of 0..1 each way, thinned to about `n`
   buckets by keeping each bucket's low and high in their own order — so a
   spike survives the thinning. Pure. */
const monitorSpark = (series, n = 48) => {
  const pts = monitorPoints(series);
  if (pts.length < 3) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    if (p.price < lo) lo = p.price;
    if (p.price > hi) hi = p.price;
  }
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  if (!(t1 > t0)) return null;
  const size = Math.max(1, Math.ceil(pts.length / n));
  const kept = [];
  for (let i = 0; i < pts.length; i += size) {
    let a = pts[i];
    let b = pts[i];
    for (let j = i; j < Math.min(pts.length, i + size); j += 1) {
      if (pts[j].price < a.price) a = pts[j];
      if (pts[j].price > b.price) b = pts[j];
    }
    for (const q of a === b ? [a] : a.t <= b.t ? [a, b] : [b, a]) kept.push(q);
  }
  const last = pts[pts.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  const span = hi - lo;
  return kept.map((q) => [(q.t - t0) / (t1 - t0), span > 0 ? (q.price - lo) / span : 0.5]);
};

/* Four facts about the list at once, each a count or a figure with its coin.
   Rows without the figure are left out of it, never read as zero. Pure. */
const monitorSummary = (rows) => {
  const has = (k) => rows.filter((r) => r[k] != null && Number.isFinite(r[k]));
  const day = has("change24h");
  const month = has("change30d").map((r) => r.change30d).sort((a, b) => a - b);
  const mid = month.length >> 1;
  const median = !month.length ? null : month.length % 2 ? month[mid] : (month[mid - 1] + month[mid]) / 2;
  const widest = has("dailyMove").sort((a, b) => b.dailyMove - a.dailyMove)[0] || null;
  const mover = has("change30d").sort((a, b) => Math.abs(b.change30d) - Math.abs(a.change30d))[0] || null;
  return {
    up: day.filter((r) => r.change24h > 0).length,
    of: day.length,
    median30: median,
    widest: widest ? { coin: widest.coin, v: widest.dailyMove } : null,
    mover: mover ? { coin: mover.coin, v: mover.change30d } : null,
  };
};

/* **The squarified treemap** (Bruls, Huizing & van Wijk, 2000): tiles largest
   first, each row laid along the shorter side of what is left and closed
   when the next tile would make the row's worst aspect ratio worse — so the
   tiles stay as near square as the sizes allow and the labels fit. Pure;
   rects in the box's own units. */
const squarify = (items, w, h) => {
  const list = items.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((a, d) => a + d.value, 0);
  const out = [];
  if (!(total > 0) || !(w > 0) || !(h > 0)) return out;
  const scale = (w * h) / total;
  let x = 0;
  let y = 0;
  let rw = w;
  let rh = h;
  const worst = (row, side) => {
    const sum = row.reduce((a, d) => a + d.area, 0);
    let max = 0;
    for (const d of row) {
      const ratio = Math.max((side * side * d.area) / (sum * sum), (sum * sum) / (side * side * d.area));
      if (ratio > max) max = ratio;
    }
    return max;
  };
  const lay = (row) => {
    const sum = row.reduce((a, d) => a + d.area, 0);
    if (rw >= rh) {
      const cw = sum / rh;
      let cy = y;
      for (const d of row) {
        out.push({ key: d.key, x, y: cy, w: cw, h: d.area / cw });
        cy += d.area / cw;
      }
      x += cw;
      rw -= cw;
    } else {
      const ch = sum / rw;
      let cx = x;
      for (const d of row) {
        out.push({ key: d.key, x: cx, y, w: d.area / ch, h: ch });
        cx += d.area / ch;
      }
      y += ch;
      rh -= ch;
    }
  };
  let row = [];
  for (const d of list) {
    const tile = { key: d.key, area: d.value * scale };
    const side = Math.min(rw, rh);
    if (!row.length || worst(row.concat(tile), side) <= worst(row, side)) row.push(tile);
    else {
      lay(row);
      row = [tile];
    }
  }
  if (row.length) lay(row);
  return out;
};

// The market map's tiles: the largest this many by market value
const MONITOR_MAP_MAX = 100;
// The smallest type a tile's label is set in, in rem; a smaller tile has none
const MONITOR_MAP_MIN_TYPE = 0.72; // rem — raised from 0.64 with the larger map (12 Oct 2026)
// The snapshot is asked again this often while the map is open
const MONITOR_MAP_REFRESH_MS = 60000;

/* ── styles ────────────────────────────────────────────────────────────── */

const MonitorTabs = styled.div`
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1.2rem;
  /* Four now (the base rates joined): on a phone they scroll as a row
     rather than push the screen sideways */
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const MonitorTab = styled.button.attrs({ type: "button" })`
  min-height: 2.25rem;
  padding: 0 0.9rem;
  white-space: nowrap;
  border-radius: 8px;
  border: 1px solid ${({ theme, active }) => (active ? theme.color.text : theme.color.border)};
  background: ${({ theme, active }) => (active ? theme.color.text : "transparent")};
  color: ${({ theme, active }) => (active ? theme.color.bg : theme.color.textSecondary)};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  ${touchTarget};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
  }
  // The four fit a 390px phone at this size
  @media (max-width: 600px) {
    flex: 1 0 auto;
    padding: 0 0.6rem;
    font-size: 0.7rem;
    letter-spacing: 0.02em;
  }
`;

/* Nine columns on a wide window; on a phone the line, the high, the typical
   day and β step aside rather than push the row past the edge — nothing here
   scrolls sideways. */
const MONITOR_COLUMNS = "minmax(4.5rem, 1fr) minmax(6rem, 1.3fr) repeat(3, minmax(4rem, 0.8fr)) minmax(8rem, 1.7fr) minmax(5rem, 0.9fr) minmax(5rem, 0.9fr) minmax(4rem, 0.7fr)";
const MONITOR_COLUMNS_PHONE = "minmax(3.2rem, 0.9fr) minmax(4.6rem, 1.3fr) repeat(3, minmax(2.9rem, 0.8fr))";

const MonitorTable = styled.div`
  display: grid;
  grid-template-columns: ${MONITOR_COLUMNS};
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  /* Wider than the body's reading measure (BaseBody's 52rem): a table */
  && {
    max-width: 72rem;
  }

  @media (max-width: 600px) {
    grid-template-columns: ${MONITOR_COLUMNS_PHONE};
    font-size: 0.74rem;
    & [data-monitor-wide="hide"] {
      display: none;
    }
  }
`;

const MonitorHeadCell = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: center;
  justify-content: ${({ left }) => (left ? "flex-start" : "flex-end")};
  gap: 0.25rem;
  min-height: 2.25rem;
  padding: 0 0.5rem;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: transparent;
  color: ${({ theme, active }) => (active ? theme.color.text : theme.color.textSecondary)};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  /* A head wraps inside its column rather than run into the next one: in
     French "Depuis le plus haut" ran 28px over "30 jours" (12 Oct 2026). */
  min-width: 0;
  padding-top: 0.3rem;
  padding-bottom: 0.3rem;
  line-height: 1.25;
  text-align: ${({ left }) => (left ? "left" : "right")};
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: -2px;
  }
`;

/* A row is one button laid over its cells, so the whole row is one target
   and one tab stop — and the cells stay grid items of the table. */
const MonitorRowButton = styled.button.attrs({ type: "button" })`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  align-items: center;
  min-height: 2.75rem;
  padding: 0;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme, current }) => (current ? theme.color.bgSecondary : "transparent")};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  font-size: inherit;
  text-align: right;
  cursor: pointer;

  position: relative;

  &:hover {
    background: ${({ theme }) => theme.color.bgSecondary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: -2px;
  }
  /* What a press does, said where the hand is (11 Oct 2026): the row opens
     its coin on the chart, and nothing on it said so but a sentence under
     the table. */
  &::after {
    content: "→";
    position: absolute;
    right: -1.5rem;
    top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.color.textSecondary};
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  &:hover::after,
  &:focus-visible::after {
    opacity: 1;
  }
  @media (max-width: 600px) {
    &::after {
      display: none;
    }
  }
`;

const MonitorCell = styled.span`
  padding: 0 0.5rem;
  text-align: ${({ left }) => (left ? "left" : "right")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme, tone }) =>
    tone === "up" ? theme.color.chartLineGreen : tone === "down" ? theme.color.chartLineRed : tone === "quiet" ? theme.color.textSecondary : theme.color.text};
  font-weight: ${({ strong, theme }) => (strong ? theme.fontWeight.semibold : theme.fontWeight.regular)};
`;

/* The month as a line (`monitorSpark`): low to high is the cell's height, so
   where the line ends is where the price sits in its range — what the range
   bar said, with the shape that got it there. In the 30 days' direction ink;
   a stroke that does not scale with the stretched box. */
/* **A tab's content arrives; the screen around it stays** (12 Oct 2026).
   Keyed by the tab, so a
   switch replays it and nothing else moves; none under reduced motion. */
const MonitorPane = styled.div`
  ${screenPaneIn};
  /* The body holds its children to a reading measure; the market map and the
     table want the window (12 Oct 2026) */
  max-width: none !important;
`;

/* **A coin's card, over the monitor** (12 Oct 2026).
   A row used to close the screen and switch the chart; now it opens this,
   and the chart is one press inside it. */
const monitorCardIn = keyframes`
  from { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.98); }
  to { opacity: 1; transform: none; }
`;
const MonitorDetailScrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 300;
  /* The body holds its children to a reading measure (BaseBody); the scrim
     is the whole window, or the right of the table stayed lit */
  max-width: none !important;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: ${({ theme }) => (theme.color.bg === "#ffffff" ? "rgba(15, 23, 32, 0.28)" : "rgba(0, 0, 0, 0.6)")};
`;
const MonitorDetail = styled.div`
  position: relative;
  width: min(30rem, 100%);
  max-height: calc(100dvh - 2rem);
  overflow-y: auto;
  padding: 1.3rem 1.4rem 1.2rem;
  border: 1px solid ${({ theme }) => theme.color.borderHover};
  border-radius: 16px;
  background: ${({ theme }) => theme.color.bg};
  box-shadow: 0 24px 60px ${({ theme }) => theme.color.shadow};
  font-family: ${({ theme }) => theme.font.primary};
  color: ${({ theme }) => theme.color.text};
  animation: ${monitorCardIn} 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
const MonitorDetailClose = styled.button.attrs({ type: "button" })`
  position: absolute;
  top: 0.7rem;
  right: 0.7rem;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: ${({ theme }) => theme.color.textSecondary};
  font: inherit;
  font-size: 1.1rem;
  cursor: pointer;
  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bgSecondary};
  }
  ${touchSquare};
`;
const MonitorDetailHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  padding-right: 2rem;
  strong {
    font-size: 1.1rem;
    letter-spacing: 0.08em;
  }
  span {
    font-size: 0.8rem;
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;
const MonitorDetailPrice = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
  margin: 0.8rem 0 0.2rem;
  b {
    font-size: 1.6rem;
    font-weight: ${({ theme }) => theme.fontWeight.bold};
    font-variant-numeric: tabular-nums;
  }
`;
const MonitorDetailChart = styled.div`
  margin: 0.6rem 0 0.2rem;
  color: ${({ theme, tone }) =>
    tone === "up" ? theme.color.chartLineGreen : tone === "down" ? theme.color.chartLineRed : theme.color.text};
  svg {
    display: block;
    width: 100%;
    height: 4.5rem;
    overflow: visible;
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  circle {
    fill: currentColor;
  }
`;
const MonitorDetailEnds = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.textSecondary};
`;
const MonitorDetailGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 0.5rem;
  margin: 1rem 0;
  div {
    padding: 0.55rem 0.65rem;
    border: 1px solid ${({ theme }) => theme.color.border};
    border-radius: 10px;
    background: ${({ theme }) => theme.color.bgSecondary};
  }
  dt {
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.textSecondary};
  }
  dd {
    margin: 0.25rem 0 0;
    font-size: 1rem;
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
    font-variant-numeric: tabular-nums;
  }
`;
const MonitorDetailNote = styled.p`
  margin: 0.8rem 0;
  font-size: 0.78rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const MonitorDetailActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;
const MonitorDetailAction = styled.button.attrs({ type: "button" })`
  flex: 1 1 auto;
  min-height: 2.5rem;
  padding: 0 1rem;
  border-radius: 999px;
  border: 1px solid ${({ theme, primary }) => (primary ? theme.color.text : theme.color.border)};
  background: ${({ theme, primary }) => (primary ? theme.color.text : "transparent")};
  color: ${({ theme, primary }) => (primary ? theme.color.bg : theme.color.text)};
  font: inherit;
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  &:hover {
    border-color: ${({ theme }) => theme.color.text};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.borderHover};
    outline-offset: 2px;
  }
  ${touchRow};
`;

const MonitorSpark = styled.svg`
  display: block;
  width: calc(100% - 1rem);
  height: 1.5rem;
  margin: 0 0.5rem;
  overflow: visible;

  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  circle {
    fill: currentColor;
  }
`;

/* Four facts over the table, each a figure over its label — the price head's
   grammar. */
const MonitorFacts = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  max-width: 72rem;
  margin: 0 0 1.2rem;

  @media (max-width: 600px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

/* A press sorts the table by what the card measures (11 Oct 2026). */
const MonitorFact = styled.button.attrs({ type: "button" })`
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  padding: 0.7rem 0.85rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.color.bgSecondary};

  strong {
    display: block;
    font-size: 1.05rem;
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
    font-variant-numeric: tabular-nums;
    color: ${({ theme, tone }) =>
      tone === "up" ? theme.color.chartLineGreen : tone === "down" ? theme.color.chartLineRed : theme.color.text};
  }
  span {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.textSecondary};
  }
`;

/* The market map: a box of a fixed shape the tiles are laid out in, in
   percentages of it, so nothing is measured. */
const MarketMap = styled.div`
  position: relative;
  width: 100%;
  /* As wide as the screen allows, and never taller than the window leaves
     under the head, the tabs and the lists' first lines */
  max-width: min(100%, calc((100dvh - 17rem) * ${({ aspect }) => aspect}));
  aspect-ratio: ${({ ratio }) => ratio};
  border-radius: 10px;
  overflow: hidden;
  background: ${({ theme }) => theme.color.border};
`;

/* A tile: shaded by its 24 hours in the direction ink, mixed into the ground
   so the type stays the theme's own and readable; flat is the quiet grey. */
const marketTile = css`
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 0.1em;
  padding: 0.35em 0.45em;
  border: none;
  box-shadow: inset 0 0 0 1px ${({ theme }) => theme.color.bg};
  overflow: hidden;
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
  text-align: left;
  line-height: 1.15;
  background: ${({ theme, change }) => {
    if (change == null || !Number.isFinite(change) || Math.abs(change) < 0.05) return theme.color.bgSecondary;
    const ink = change > 0 ? theme.color.chartLineGreen : theme.color.chartLineRed;
    const share = Math.round(14 + 41 * Math.min(1, Math.abs(change) / 8));
    return `color-mix(in srgb, ${ink} ${share}%, ${theme.color.bg})`;
  }};

  strong {
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
  }
  small {
    font-size: 0.8em;
    font-variant-numeric: tabular-nums;
  }
`;

const MarketTile = styled.div`
  ${marketTile};
`;

const MarketTileButton = styled.button.attrs({ type: "button" })`
  ${marketTile};
  cursor: pointer;
  &:hover {
    box-shadow: inset 0 0 0 2px ${({ theme }) => theme.color.text};
  }
  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px ${({ theme }) => theme.color.accent};
  }
`;

/* The day's largest moves under the map, as lines a reader can read. */
const MarketMoves = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.2rem;
  max-width: 72rem;
  margin-top: 1.2rem;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;

  h4 {
    margin: 0 0 0.4rem;
    font-size: 0.7rem;
    font-weight: ${({ theme }) => theme.fontWeight.regular};
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.textSecondary};
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
  }
  li > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  li > span:last-child {
    flex: none;
  }

  @media (max-width: 600px) {
    gap: 0.8rem;
    font-size: 0.72rem;
  }
`;

const MonitorLegend = styled.details`
  max-width: 52rem;
  margin: 1rem 0 0;
  font-size: 0.74rem;
  color: ${({ theme }) => theme.color.text};

  summary {
    cursor: pointer;
    color: ${({ theme }) => theme.color.textSecondary};
    letter-spacing: 0.04em;
  }
  summary:hover,
  summary:focus-visible {
    color: ${({ theme }) => theme.color.text};
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.35rem 1rem;
    margin: 0.6rem 0 0;
  }
  dt {
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
  }
  dd {
    margin: 0;
    color: ${({ theme }) => theme.color.textSecondary};
    line-height: 1.5;
  }
`;

/* The race: a frame with its own head, the lines in the ink of the text and
   the one pointed at (or on the chart) drawn full; the rest stand back. */
const MonitorRace = styled.figure`
  margin: 1.4rem 0 0;
  padding: 0.9rem 1rem 0.8rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.color.bgSecondary};
  && {
    max-width: 72rem;
  }

  figcaption {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.3rem 1rem;
    margin-bottom: 0.6rem;
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.textSecondary};
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .grid {
    stroke: ${({ theme }) => theme.color.border};
    stroke-width: 1;
  }
  .zero {
    stroke: ${({ theme }) => theme.color.textSecondary};
    stroke-dasharray: 3 4;
  }
  .tick {
    fill: ${({ theme }) => theme.color.textSecondary};
    font-size: 11px;
    font-family: ${({ theme }) => theme.font.primary};
  }
  .line {
    fill: none;
    stroke: ${({ theme }) => theme.color.textSecondary};
    stroke-width: 1.4;
    stroke-linejoin: round;
    opacity: 0.55;
    transition: opacity 0.15s ease, stroke-width 0.15s ease;
  }
  .line[data-lit="true"] {
    stroke: ${({ theme }) => theme.color.text};
    stroke-width: 2.4;
    opacity: 1;
  }
  .label {
    font-size: 12px;
    font-family: ${({ theme }) => theme.font.primary};
    fill: ${({ theme }) => theme.color.textSecondary};
    cursor: default;
  }
  .label[data-lit="true"] {
    fill: ${({ theme }) => theme.color.text};
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
  }
  .label .up {
    fill: ${({ theme }) => theme.color.chartLineGreen};
  }
  .label .down {
    fill: ${({ theme }) => theme.color.chartLineRed};
  }

  @media (max-width: 600px) {
    padding: 0.7rem 0.6rem 0.6rem;
  }
`;

const MonitorNote = styled.p`
  max-width: 52rem;
  margin: 1.2rem 0 0;
  font-size: 0.72rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const CorrGrid = styled.div`
  display: grid;
  width: max-content;
  max-width: 100%;
  grid-template-columns: minmax(3rem, auto) repeat(${({ n }) => n}, minmax(0, 5.5rem));
  gap: 2px;
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;

  @media (max-width: 600px) {
    width: 100%;
    grid-template-columns: minmax(2.4rem, auto) repeat(${({ n }) => n}, minmax(0, 1fr));
    font-size: ${({ n }) => (n > 6 ? "0.6rem" : "0.68rem")};
  }
`;

const CorrLabel = styled.span`
  display: flex;
  align-items: center;
  justify-content: ${({ top }) => (top ? "center" : "flex-start")};
  min-height: 2.25rem;
  padding: 0 0.3rem;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.color.textSecondary};
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  overflow: hidden;
`;

/* The strength of a relation is the cell's weight; its sign is written. The
   palette's direction colours stay out: together is not up. */
const CorrCell = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.25rem;
  border-radius: 4px;
  background: ${({ theme, strength }) =>
    strength == null
      ? "transparent"
      : theme.color.bg === "#ffffff"
        ? `rgba(0, 0, 0, ${0.04 + strength * 0.32})`
        : `rgba(255, 255, 255, ${0.04 + strength * 0.3})`};
  color: ${({ theme, strength }) => (strength == null ? theme.color.textSecondary : theme.color.text)};
  font-weight: ${({ theme, strength }) => (strength != null && strength >= 0.7 ? theme.fontWeight.semibold : theme.fontWeight.regular)};
  flex-direction: column;
  gap: 0.1rem;
  min-height: 3rem;
  text-align: center;
  b {
    font-weight: inherit;
  }
  small {
    font-size: 0.58rem;
    letter-spacing: 0.02em;
    line-height: 1.15;
    color: ${({ theme }) => theme.color.textSecondary};
  }
  @media (max-width: 600px) {
    min-height: 2.25rem;
    small {
      display: none;
    }
  }
`;

/* The cell's two lines: r, and its word under it — the word steps aside on
   a narrow phone with many coins, where the shade still says it */
const CorrLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  margin: 0.9rem 0 0;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.color.textSecondary};
  span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  b {
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
    color: ${({ theme }) => theme.color.text};
  }
`;
const CorrSwatch = styled.i`
  display: inline-block;
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 3px;
  background: ${({ theme, strength }) =>
    theme.color.bg === "#ffffff" ? `rgba(0, 0, 0, ${0.04 + strength * 0.32})` : `rgba(255, 255, 255, ${0.04 + strength * 0.3})`};
`;
const CorrPairs = styled.div`
  max-width: 52rem;
  margin: 1.2rem 0 0;
  padding: 0.9rem 1rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.color.bgSecondary};
  h4 {
    margin: 0 0 0.5rem;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.textSecondary};
  }
  p {
    margin: 0.35rem 0;
    font-size: 0.78rem;
    line-height: 1.55;
    color: ${({ theme }) => theme.color.text};
  }
`;
const CorrTag = styled.span`
  display: inline-block;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.color.text};
`;

/* ── component ─────────────────────────────────────────────────────────── */

const monitorSigned = (v, digits = 1) => (v == null || !isFinite(v) ? "—" : `${signedFixed(v, digits)}%`);
const monitorTone = (v) => (v == null || !isFinite(v) || Math.abs(v) < 0.05 ? "quiet" : v > 0 ? "up" : "down");

/* **The monitor and the base rates are one screen** (12 Oct 2026): one tab on the screens' column, and this strip at the
   head of both bodies — Coins, Market, Correlation, Base rates. The two
   components stay apart (they share nothing but the frame); the app swaps
   which one is drawn (`monitorTab`), so the frame, the × and the column's tab
   never move. M opens it where it was, B on Base rates. */
const MONITOR_TABS = ["coins", "market", "corr", "base"];
const monitorTabStrip = (active, onTab) =>
  React.createElement(
    MonitorTabs,
    { role: "group", "aria-label": msg("mon_title", "Monitor"), "data-monitor-tabs": "true" },
    ...[
      ["coins", msg("mon_tab_coins", "Coins")],
      ["market", msg("mon_tab_market", "Market")],
      ["corr", msg("mon_tab_corr", "Correlation")],
      ["base", msg("mon_tab_base", "Base rates")],
    ].map(([id, label]) =>
      React.createElement(
        MonitorTab,
        { key: id, active: active === id, "aria-pressed": active === id ? "true" : "false", "data-monitor-tab": id, onClick: () => onTab(id) },
        label,
      ),
    ),
  );

class MonitorPanel extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { tab: "coins", series: {}, failed: {}, sort: { key: null, dir: -1 }, detail: null, mapPx: 0 };
    this.detailKey = this.detailKey.bind(this);
    this.onResize = this.onResize.bind(this);
    this._token = 0;
  }

  componentDidMount() {
    this.load();
    if (this.tab() === "market") this.refreshMarket();
    window.addEventListener("resize", this.onResize);
    this.measureMap();
  }

  // The map's labels are sized from its drawn width; the card keeps its place
  onResize() {
    if (this._rz) return;
    this._rz = requestAnimationFrame(() => {
      this._rz = 0;
      if (this._gone) return;
      this.measureMap();
      this.placeDetail();
    });
  }

  measureMap() {
    const w = this._mapNode ? this._mapNode.offsetWidth : 0;
    if (w && Math.abs(w - this.state.mapPx) > 8) this.setState({ mapPx: w });
  }

  // The app's tab when it holds one (the shared screen), else this panel's own
  tab() {
    return this.props.tab && this.props.tab !== "base" ? this.props.tab : this.state.tab;
  }

  componentDidUpdate(prev, prevState) {
    if (prev.currency !== this.props.currency || prev.coins !== this.props.coins) this.load();
    this.measureMap();
    // A card that grew (its 30 days arrived) keeps inside the window
    if (this.state.detail && (prevState.detail !== this.state.detail || prevState.series !== this.state.series)) this.placeDetail();
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.detailKey, true);
    window.removeEventListener("resize", this.onResize);
    if (this._rz) cancelAnimationFrame(this._rz);
    this._token += 1;
    this._gone = true;
    if (this._abort) this._abort.abort();
    clearInterval(this._mapTimer);
  }

  /* A few at a time, each landing as it arrives; a later load (another
     currency, another list) makes every answer of this one moot. */
  load() {
    const token = (this._token += 1);
    if (this._abort) this._abort.abort();
    const abort = typeof AbortController === "function" ? new AbortController() : null;
    this._abort = abort;
    const { coins, currency } = this.props;
    /* Bitcoin's 30 days ride along when it is not on the list: β is each
       coin's moves against Bitcoin's. It makes no row of its own. */
    const queue = (Array.isArray(coins) ? coins : []).slice();
    if (queue.length && !queue.includes("BTC")) queue.push("BTC");
    this.setState({ series: {}, failed: {} });
    const next = async () => {
      const coin = queue.shift();
      if (!coin || token !== this._token) return;
      try {
        const data = await fetchValueHistory(coin, MONITOR_PERIOD, currency, abort ? abort.signal : null, true, coins);
        if (token === this._token) this.setState((s) => ({ series: { ...s.series, [coin]: data } }));
      } catch (error) {
        if (token === this._token) this.setState((s) => ({ failed: { ...s.failed, [coin]: true } }));
      }
      return next();
    };
    for (let i = 0; i < MONITOR_CONCURRENCY; i += 1) next();
  }

  rows() {
    const { coins, stats } = this.props;
    const list = (Array.isArray(coins) ? coins : []).map((coin) => {
      const s = (stats && stats[coin]) || {};
      const r = monitorRow(this.state.series[coin]) || {};
      /* The ticker's figures where it has them — they are the freshest — and
         the 30-day series' own last price and day where it has not. */
      const price = Number.isFinite(s.price) ? s.price : Number.isFinite(r.last) ? r.last : null;
      const change24h = Number.isFinite(s.change) ? s.change : Number.isFinite(r.change1d) ? r.change1d : null;
      const own = this.state.series[coin];
      const btc = this.state.series.BTC;
      const vs = coin !== "BTC" && Array.isArray(own) && Array.isArray(btc) ? compareCorrelation(own, btc) : null;
      return { coin, ...r, price, change24h, beta: vs && Number.isFinite(vs.beta) ? vs.beta : null, spark: monitorSpark(own) };
    });
    const { key, dir } = this.state.sort;
    if (!key) return list;
    const val = (row) => (key === "coin" ? row.coin : row[key]);
    return list.slice().sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null || (typeof x === "number" && !isFinite(x))) return 1;
      if (y == null || (typeof y === "number" && !isFinite(y))) return -1;
      if (typeof x === "string") return dir * x.localeCompare(y);
      return dir * (x - y);
    });
  }

  sortBy(key) {
    this.setState((s) => ({ sort: { key, dir: s.sort.key === key ? -s.sort.dir : key === "coin" ? 1 : -1 } }));
  }

  renderHead(key, label, opts = {}) {
    const on = this.state.sort.key === key;
    return React.createElement(
      MonitorHeadCell,
      {
        key,
        left: opts.left,
        active: on,
        title: opts.title || msg("mon_sort", "Sort by $1", label),
        "aria-sort": on ? (this.state.sort.dir > 0 ? "ascending" : "descending") : undefined,
        "data-monitor-wide": opts.wide ? "hide" : undefined,
        // β upper-cased is Β, a Greek capital that reads as a Latin B
        style: opts.asTyped ? { textTransform: "none" } : undefined,
        onClick: () => this.sortBy(key),
      },
      label,
      on ? (this.state.sort.dir > 0 ? " ↑" : " ↓") : null,
    );
  }

  /* ↑ and ↓ walk the rows, Home and End go to the ends — the table is one
     list, and Tab stays the way out of it. */
  rowKey(e) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const rows = Array.from(e.currentTarget.querySelectorAll("[data-monitor-row]"));
    if (!rows.length) return;
    const at = rows.indexOf(document.activeElement);
    const to =
      e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : e.key === "ArrowDown" ? Math.min(rows.length - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1);
    e.preventDefault();
    e.stopPropagation();
    rows[to].focus();
  }

  renderFacts(rows) {
    const f = monitorSummary(rows);
    const sortFor = { up: "change24h", median: "change30d", widest: "dailyMove", mover: "change30d" };
    const fact = (key, value, label, tone) =>
      React.createElement(
        MonitorFact,
        {
          key,
          tone,
          "data-monitor-fact": key,
          title: msg("mon_fact_sort", "Sort the table by this"),
          onClick: () => this.setState({ sort: { key: sortFor[key], dir: -1 } }),
        },
        React.createElement("strong", null, value),
        React.createElement("span", null, label),
      );
    return React.createElement(
      MonitorFacts,
      { "data-monitor-facts": "true" },
      fact("up", f.of ? `${f.up} / ${f.of}` : "—", msg("mon_fact_up", "Up in the last 24 hours")),
      fact("median", monitorSigned(f.median30), msg("mon_fact_median", "The middle coin's 30 days"), monitorTone(f.median30)),
      fact("widest", f.widest ? `${f.widest.coin} ${f.widest.v.toFixed(1)}%` : "—", msg("mon_fact_widest", "Widest typical day")),
      fact("mover", f.mover ? `${f.mover.coin} ${monitorSigned(f.mover.v)}` : "—", msg("mon_fact_mover", "Moved most in 30 days"), f.mover ? monitorTone(f.mover.v) : null),
    );
  }

  renderSpark(r) {
    if (!r.spark) return null;
    const d = r.spark.map(([x, y], i) => `${i ? "L" : "M"}${(x * 100).toFixed(2)} ${(22 - y * 20).toFixed(2)}`).join(" ");
    const [ex, ey] = r.spark[r.spark.length - 1];
    return React.createElement(
      MonitorSpark,
      {
        viewBox: "0 0 100 24",
        preserveAspectRatio: "none",
        "aria-hidden": "true",
        "data-monitor-spark": r.coin,
      },
      React.createElement("path", { d }),
      React.createElement("circle", { cx: (ex * 100).toFixed(2), cy: (22 - ey * 20).toFixed(2), r: 1.6 }),
    );
  }

  /* **The month, side by side** — see monitorRace. Pointing at a line or its
     label lights it; with nothing pointed at, the coin on the chart is lit. */
  renderRace() {
    const coins = Array.isArray(this.props.coins) ? this.props.coins : [];
    const race = monitorRace(this.state.series, coins);
    if (!race) return null;
    const W = 1000;
    const H = 300;
    const L = 52;
    const R = 130;
    const T = 10;
    const B = 26;
    const pad = Math.max(0.5, (race.hi - race.lo) * 0.06);
    const lo = race.lo - pad;
    const hi = race.hi + pad;
    const x = (t) => L + ((t - race.t0) / (race.t1 - race.t0)) * (W - L - R);
    const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
    const lit = this.state.raceLit || this.props.activeCoin;
    // Round percent levels, about five
    const raw = (hi - lo) / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
    const levels = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) levels.push(Math.round(v * 1e6) / 1e6);
    const ends = monitorRaceLabels(race.lines.map((l) => y(l.last)), 16, T + 6, H - B);
    const days = [0, 7, 14, 21, 28].map((d) => race.t1 - d * 86400e3).filter((t) => t >= race.t0);
    const dayText = (t) => {
      try {
        return new Date(t).toLocaleDateString(intlTag(activeLocale()), { month: "short", day: "numeric" });
      } catch (error) {
        return "";
      }
    };
    const leader = race.lines[0];
    const last = race.lines[race.lines.length - 1];
    const lightOn = (coin) => () => this.setState({ raceLit: coin });
    const lightOff = () => this.setState({ raceLit: null });
    return React.createElement(
      MonitorRace,
      { "data-monitor-race": "true" },
      React.createElement(
        "figcaption",
        null,
        React.createElement("span", null, msg("mon_race_head", "The last 30 days, side by side · from each coin's own start")),
        React.createElement(
          "span",
          null,
          msg("mon_race_spread", "$1 ahead, $2 behind · $3 points apart", leader.coin, last.coin, (leader.last - last.last).toFixed(1)),
        ),
      ),
      React.createElement(
        "svg",
        {
          viewBox: `0 0 ${W} ${H}`,
          role: "img",
          "aria-label": msg("mon_race_aria", "The percent change of each coin over the last 30 days: $1", race.lines.map((l) => `${l.coin} ${monitorSigned(l.last)}`).join(", ")),
          onMouseLeave: lightOff,
        },
        ...levels.map((v) =>
          React.createElement(
            "g",
            { key: `l${v}` },
            React.createElement("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), className: v === 0 ? "zero" : "grid" }),
            React.createElement("text", { x: L - 8, y: y(v) + 4, textAnchor: "end", className: "tick" }, `${v > 0 ? "+" : ""}${v}%`),
          ),
        ),
        ...days.map((t) =>
          React.createElement("text", { key: `d${t}`, x: x(t), y: H - 6, textAnchor: "middle", className: "tick" }, dayText(t)),
        ),
        // The lit line last, so it is drawn over the others
        ...race.lines
          .slice()
          .sort((a, b) => (a.coin === lit) - (b.coin === lit))
          .map((l) =>
            React.createElement("polyline", {
              key: `p${l.coin}`,
              points: l.pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" "),
              className: "line",
              "data-lit": l.coin === lit ? "true" : "false",
              "data-monitor-race-line": l.coin,
              onMouseEnter: lightOn(l.coin),
            }),
          ),
        ...race.lines.map((l, i) =>
          React.createElement(
            "text",
            {
              key: `t${l.coin}`,
              x: W - R + 10,
              y: ends[i] + 4,
              className: "label",
              "data-lit": l.coin === lit ? "true" : "false",
              onMouseEnter: lightOn(l.coin),
            },
            `${l.coin} `,
            React.createElement("tspan", { className: monitorTone(l.last) === "up" ? "up" : monitorTone(l.last) === "down" ? "down" : undefined }, monitorSigned(l.last)),
          ),
        ),
      ),
    );
  }

  renderCoins() {
    const { formatPrice, activeCoin } = this.props;
    const rows = this.rows();
    const head = [
      this.renderHead("coin", msg("mon_col_coin", "Coin"), { left: true }),
      this.renderHead("price", msg("mon_col_price", "Price")),
      this.renderHead("change24h", "24h"),
      this.renderHead("change7d", "7d"),
      this.renderHead("change30d", "30d"),
      this.renderHead("range", msg("mon_col_spark", "30 days"), {
        wide: true,
        title: msg("mon_col_spark_title", "The last 30 days, low to high — sorted by where the price sits between them"),
      }),
      this.renderHead("fromHigh", msg("mon_col_from_high", "From high"), {
        wide: true,
        title: msg("mon_col_from_high_title", "How far the price is under the 30-day high"),
      }),
      this.renderHead("dailyMove", msg("mon_col_move", "Typical day"), {
        wide: true,
        title: msg("mon_col_move_title", "How far a day's move usually goes, either way: the standard deviation of the last 30 days, scaled to a day"),
      }),
      this.renderHead("beta", msg("mon_col_beta", "β BTC"), {
        wide: true,
        asTyped: true,
        title: msg("mon_col_beta_title", "How far it moved for each 1% Bitcoin moved, over the same 30 days — the slope of its moves on Bitcoin's. It describes these 30 days, never what comes next"),
      }),
    ];
    const body = rows.map((r) => {
      const waiting = !this.state.series[r.coin] && !this.state.failed[r.coin];
      const dash = waiting ? "…" : "—";
      return React.createElement(
        MonitorRowButton,
        {
          key: r.coin,
          current: r.coin === activeCoin,
          "data-monitor-row": r.coin,
          "aria-label": msg("mon_open", "Open $1 on the chart", COIN_NAMES[r.coin] || r.coin),
          "aria-haspopup": "dialog",
          onClick: (ev) => this.openDetail(r.coin, ev.currentTarget, ev),
        },
        React.createElement(MonitorCell, { left: true, strong: true }, r.coin),
        React.createElement(MonitorCell, null, r.price != null && formatPrice ? formatPrice(r.price) : "—"),
        React.createElement(MonitorCell, { tone: monitorTone(r.change24h) }, monitorSigned(r.change24h, 2)),
        React.createElement(MonitorCell, { tone: monitorTone(r.change7d) }, r.change7d == null ? dash : monitorSigned(r.change7d)),
        React.createElement(MonitorCell, { tone: monitorTone(r.change30d) }, r.change30d == null ? dash : monitorSigned(r.change30d)),
        React.createElement(
          "span",
          {
            "data-monitor-wide": "hide",
            style: { color: "inherit" },
            title: r.range == null ? undefined : msg("mon_range_at", "$1% of the way from the 30-day low to the high", String(Math.round(r.range * 100))),
          },
          r.spark
            ? React.createElement(MonitorCell, { tone: monitorTone(r.change30d) === "quiet" ? null : monitorTone(r.change30d), style: { display: "block", padding: 0 } }, this.renderSpark(r))
            : React.createElement(MonitorCell, { tone: "quiet" }, dash),
        ),
        React.createElement(MonitorCell, { tone: "quiet", "data-monitor-wide": "hide" }, r.fromHigh == null ? dash : monitorSigned(r.fromHigh)),
        React.createElement(MonitorCell, { "data-monitor-wide": "hide" }, r.dailyMove == null ? dash : `${r.dailyMove.toFixed(1)}%`),
        React.createElement(
          MonitorCell,
          { "data-monitor-wide": "hide", tone: r.beta == null ? "quiet" : null, "data-monitor-beta": r.coin },
          r.coin === "BTC" ? "1.00" : r.beta == null ? dash : r.beta.toFixed(2),
        ),
      );
    });
    return React.createElement(
      Fragment,
      null,
      this.renderFacts(rows),
      React.createElement(MonitorTable, { "data-monitor-table": "true", onKeyDown: (e) => this.rowKey(e) }, ...head, ...body),
      this.renderRace(),
      /* **What the columns mean, where it can be found** (11 Oct 2026): each
         heading carried its definition as a tooltip, which nobody finds. The
         same words, one press away. */
      React.createElement(
        MonitorLegend,
        { "data-monitor-legend": "true" },
        React.createElement("summary", null, msg("mon_legend", "What the columns mean")),
        React.createElement(
          "dl",
          null,
          ...[
            ["24h · 7d · 30d", msg("mon_col_changes_title", "How far the price moved over the last day, week and month")],
            [msg("mon_col_spark", "30 days"), msg("mon_col_spark_title", "The last 30 days, low to high — sorted by where the price sits between them")],
            [msg("mon_col_from_high", "From high"), msg("mon_col_from_high_title", "How far the price is under the 30-day high")],
            [msg("mon_col_move", "Typical day"), msg("mon_col_move_title", "How far a day's move usually goes, either way: the standard deviation of the last 30 days, scaled to a day")],
            [msg("mon_col_beta", "β BTC"), msg("mon_col_beta_title", "How far it moved for each 1% Bitcoin moved, over the same 30 days — the slope of its moves on Bitcoin's. It describes these 30 days, never what comes next")],
          ].flatMap(([t, d]) => [React.createElement("dt", { key: `t-${t}` }, t), React.createElement("dd", { key: `d-${t}` }, d)]),
        ),
      ),
      React.createElement(
        MonitorNote,
        null,
        msg(
          "mon_coins_note3",
          "The price and the 24 hours come from the ticker, or from the coin's own 30 days where the ticker has none; the rest from those 30 days, the series the 1M range draws. β is each coin's moves against Bitcoin's over the same days. A row opens the coin's card, with the chart one press inside it; ↑ and ↓ walk the rows.",
        ),
      ),
    );
  }

  /* The coin's card: opened by a row, closed by its ×, Esc (taken before the
     screen's own Esc, in the capture phase) or a press outside it; the focus
     goes back to the row it came from. */
  /* **Where it was pressed** (12 Oct 2026): beside the press on a wide window — to its right,
     or its left where the right has no room, held inside the window — and
     the centred sheet it was on a phone. A press from the keyboard has no
     point; the element's middle stands in. */
  openDetail(coin, from, ev) {
    this._detailFrom = from || null;
    const r = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null;
    const keyed = !ev || (ev.clientX === 0 && ev.clientY === 0);
    this._detailAt = keyed
      ? r
        ? { x: r.left + Math.min(r.width, 160) / 2, y: r.top + r.height / 2 }
        : null
      : { x: ev.clientX, y: ev.clientY };
    window.addEventListener("keydown", this.detailKey, true);
    this.loadOne(coin);
    this.setState({ detail: coin }, () => {
      const x = this._detailNode && this._detailNode.querySelector("[data-monitor-detail-close]");
      if (x) x.focus({ preventScroll: true });
    });
  }

  // A coin off the list has no 30 days yet: asked for when its card opens
  loadOne(coin) {
    if (!SUGGESTED_COINS.includes(coin) || this.state.series[coin] || this.state.failed[coin]) return;
    const token = this._token;
    fetchValueHistory(coin, MONITOR_PERIOD, this.props.currency, null, true, this.props.coins)
      .then((data) => {
        if (!this._gone && token === this._token) this.setState((st) => ({ series: { ...st.series, [coin]: data } }));
      })
      .catch(() => {
        if (!this._gone && token === this._token) this.setState((st) => ({ failed: { ...st.failed, [coin]: true } }));
      });
  }

  placeDetail() {
    const node = this._detailNode;
    const at = this._detailAt;
    if (!node) return;
    const phone = typeof matchMedia === "function" && matchMedia("(max-width: 600px)").matches;
    if (phone || !at) {
      node.style.position = "";
      node.style.left = "";
      node.style.top = "";
      return;
    }
    const gap = 16;
    const edge = 12;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    let left = at.x + gap;
    if (left + w > window.innerWidth - edge) left = at.x - gap - w;
    left = Math.max(edge, Math.min(left, window.innerWidth - w - edge));
    const top = Math.max(edge, Math.min(at.y - 48, window.innerHeight - h - edge));
    node.style.position = "fixed";
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  }

  // Any coin's figures: its row when it is on the list, else the market's snapshot and its 30 days
  rowFor(coin) {
    const listed = this.rows().find((x) => x.coin === coin);
    const cur = this.props.currency;
    const t = typeof pageTickerCache !== "undefined" && cur ? pageTickerCache.get(`${coin}-${cur}`) : null;
    const market = { cap: t && Number.isFinite(t.marketCap) ? t.marketCap : null, volume: t && Number.isFinite(t.volume24) ? t.volume24 : null };
    if (listed) return { ...listed, ...market, chartable: SUGGESTED_COINS.includes(coin) };
    const own = this.state.series[coin];
    const r = monitorRow(own) || {};
    const btc = this.state.series.BTC;
    const vs = coin !== "BTC" && Array.isArray(own) && Array.isArray(btc) ? compareCorrelation(own, btc) : null;
    return {
      coin,
      ...r,
      price: t && Number.isFinite(t.price) ? t.price : Number.isFinite(r.last) ? r.last : null,
      change24h: t && Number.isFinite(t.change) ? t.change : Number.isFinite(r.change1d) ? r.change1d : null,
      beta: vs && Number.isFinite(vs.beta) ? vs.beta : null,
      spark: monitorSpark(own),
      ...market,
      chartable: SUGGESTED_COINS.includes(coin),
    };
  }

  closeDetail() {
    window.removeEventListener("keydown", this.detailKey, true);
    const from = this._detailFrom;
    this.setState({ detail: null }, () => {
      if (from && from.focus && document.body.contains(from)) from.focus();
    });
  }

  detailKey(e) {
    if (e.key !== "Escape" || !this.state.detail) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.closeDetail();
  }

  renderDetail() {
    const coin = this.state.detail;
    const r = coin && this.rowFor(coin);
    if (!r) return null;
    const { formatPrice, onPick, onBase } = this.props;
    const waiting = r.chartable && !this.state.series[coin] && !this.state.failed[coin];
    const compact = (v) => {
      try {
        return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(v);
      } catch (error) {
        return String(Math.round(v));
      }
    };
    const dash = waiting ? "…" : "—";
    const tone = monitorTone(r.change30d);
    const spark = r.spark
      ? React.createElement(
          "svg",
          { viewBox: "0 0 100 24", preserveAspectRatio: "none", "aria-hidden": "true" },
          React.createElement("path", {
            d: r.spark.map(([x, y], i) => `${i ? "L" : "M"}${(x * 100).toFixed(2)} ${(22 - y * 20).toFixed(2)}`).join(" "),
          }),
          React.createElement("circle", { cx: (r.spark[r.spark.length - 1][0] * 100).toFixed(2), cy: (22 - r.spark[r.spark.length - 1][1] * 20).toFixed(2), r: 1.4 }),
        )
      : null;
    const cell = (label, value, cellTone, asTyped) =>
      React.createElement(
        "div",
        { key: label },
        // β upper-cased is Β, which reads as a Latin B (the table's own rule)
        React.createElement("dt", asTyped ? { style: { textTransform: "none" } } : null, label),
        React.createElement("dd", null, React.createElement(MonitorCell, { tone: cellTone, style: { padding: 0, textAlign: "left" } }, value)),
      );
    return React.createElement(
      MonitorDetailScrim,
      {
        "data-monitor-detail-scrim": "true",
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) this.closeDetail();
        },
      },
      React.createElement(
        MonitorDetail,
        {
          innerRef: (n) => (this._detailNode = n),
          role: "dialog",
          "aria-modal": "true",
          "aria-label": msg("mon_detail_aria", "$1 over the last 30 days", COIN_NAMES[coin] || coin),
          "data-monitor-detail": coin,
        },
        React.createElement(MonitorDetailClose, { "data-monitor-detail-close": "true", "aria-label": msg("mon_detail_close", "Close"), onClick: () => this.closeDetail() }, "×"),
        React.createElement(
          MonitorDetailHead,
          null,
          React.createElement("strong", null, coin),
          React.createElement("span", null, COIN_NAMES[coin] || ""),
        ),
        React.createElement(
          MonitorDetailPrice,
          null,
          React.createElement("b", null, r.price != null && formatPrice ? formatPrice(r.price) : dash),
          React.createElement(MonitorCell, { tone: monitorTone(r.change24h), style: { padding: 0 } }, `${monitorSigned(r.change24h, 2)} · 24h`),
        ),
        spark && React.createElement(MonitorDetailChart, { tone: tone === "quiet" ? null : tone }, spark),
        r.low != null &&
          formatPrice &&
          React.createElement(
            MonitorDetailEnds,
            null,
            React.createElement("span", null, msg("mon_detail_low", "30-day low $1", formatPrice(r.low))),
            React.createElement("span", null, msg("mon_detail_high", "high $1", formatPrice(r.high))),
          ),
        React.createElement(
          MonitorDetailGrid,
          null,
          cell("7d", r.change7d == null ? dash : monitorSigned(r.change7d), monitorTone(r.change7d)),
          cell("30d", r.change30d == null ? dash : monitorSigned(r.change30d), monitorTone(r.change30d)),
          cell(msg("mon_col_from_high", "From high"), r.fromHigh == null ? dash : monitorSigned(r.fromHigh), "quiet"),
          cell(msg("mon_col_move", "Typical day"), r.dailyMove == null ? dash : `${r.dailyMove.toFixed(1)}%`),
          cell(msg("mon_col_beta", "β BTC"), coin === "BTC" ? "1.00" : r.beta == null ? dash : r.beta.toFixed(2), null, true),
          cell(msg("mon_detail_range", "In its range"), r.range == null ? dash : `${Math.round(r.range * 100)}%`),
          r.cap != null && cell(msg("mon_detail_cap", "Market value"), `${compact(r.cap)} ${this.props.currency || ""}`.trim()),
          r.volume != null && cell(msg("mon_detail_volume", "Traded in 24h"), `${compact(r.volume)} ${this.props.currency || ""}`.trim()),
        ),
        !r.chartable &&
          React.createElement(
            MonitorDetailNote,
            { "data-monitor-detail-priced-only": "true" },
            msg("mon_detail_priced_only", "PriceTab prices $1 from the market's snapshot but cannot draw it, so it has no 30 days, chart or base rates here.", coin),
          ),
        React.createElement(
          MonitorDetailActions,
          null,
          onPick &&
            r.chartable &&
            React.createElement(
              MonitorDetailAction,
              { primary: true, "data-monitor-detail-chart": "true", onClick: () => onPick(coin) },
              msg("mon_detail_chart", "Open on the chart"),
            ),
          onBase &&
            r.chartable &&
            React.createElement(
              MonitorDetailAction,
              { "data-monitor-detail-base": "true", onClick: () => { this.closeDetail(); onBase(coin); } },
              msg("mon_detail_base", "Base rates for $1", coin),
            ),
        ),
      ),
    );
  }

  /* The shared snapshot (`pageTickerCache`) for this currency: every coin it
     holds with a market value, largest first. */
  marketEntries() {
    const cur = this.props.currency;
    const out = [];
    if (typeof pageTickerCache === "undefined" || !cur) return out;
    const now = Date.now();
    for (const [key, v] of pageTickerCache) {
      if (!key.endsWith(`-${cur}`) || !v || !(v.marketCap > 0)) continue;
      if (now - v.timestamp > PAGE_TICKER_MAX_AGE) continue;
      out.push({ coin: key.slice(0, -(cur.length + 1)), cap: v.marketCap, change: v.change, price: v.price, volume: v.volume24, at: v.timestamp });
    }
    return out.sort((a, b) => b.cap - a.cap).slice(0, MONITOR_MAP_MAX);
  }

  // One request for the whole top 100, again each minute while the map is open
  refreshMarket() {
    const ask = () =>
      Promise.resolve(bulkRefreshPageTickerCache(HOLDABLE_COINS, this.props.currency))
        .catch(() => false)
        .then(() => {
          if (!this._gone) this.setState({ marketAt: Date.now() });
        });
    clearInterval(this._mapTimer);
    ask();
    this._mapTimer = setInterval(ask, MONITOR_MAP_REFRESH_MS);
  }

  setTab(tab) {
    if (tab === "market") this.refreshMarket();
    else clearInterval(this._mapTimer);
    if (tab !== "base") this.setState({ tab });
    if (this.props.onTab) this.props.onTab(tab);
  }

  renderMarket() {
    const tiles = this.marketEntries();
    if (!tiles.length) {
      return React.createElement(MonitorNote, null, msg("mon_market_loading", "Reading the market…"));
    }
    const phone = typeof matchMedia === "function" && matchMedia("(max-width: 600px)").matches;
    const W = phone ? 100 : 220;
    const H = phone ? 140 : 100;
    const rects = squarify(tiles.map((t) => ({ key: t.coin, value: t.cap })), W, H);
    const byCoin = {};
    for (const t of tiles) byCoin[t.coin] = t;
    const { currency } = this.props;
    const compact = (v) => {
      try {
        return `${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v)} ${currency}`;
      } catch (error) {
        return `${Math.round(v)} ${currency}`;
      }
    };
    /* About how many rem the box is wide, so a label is drawn only where it
       fits: a monospace glyph is 0.6em, a line 1.15em, the tile's padding
       0.45em a side. Measured once per render, not per tile. */
    const remPerUnit = (this.state.mapPx ? this.state.mapPx / 16 : phone ? 22 : 72) / W;
    const cells = rects.map((rc) => {
      const t = byCoin[rc.key];
      const name = COIN_NAMES[t.coin] || t.coin;
      const day = monitorSigned(t.change);
      const wRem = rc.w * remPerUnit;
      const hRem = rc.h * remPerUnit;
      const fits = (f, lines, chars) => chars * 0.6 * f + 0.9 * f <= wRem && lines * 1.15 * f + 0.7 * f <= hRem;
      // Under 0.64rem a label is noise, not reading: the tile keeps its title
      let size = Math.min(1.5, Math.sqrt(wRem * hRem) / 5);
      while (size > MONITOR_MAP_MIN_TYPE && !fits(size, 1, t.coin.length)) size -= 0.04;
      const label = size >= MONITOR_MAP_MIN_TYPE && fits(size, 1, t.coin.length);
      const both = label && fits(size, 2, Math.max(t.coin.length, day.length));
      const style = {
        left: `${(rc.x / W) * 100}%`,
        top: `${(rc.y / H) * 100}%`,
        width: `${(rc.w / W) * 100}%`,
        height: `${(rc.h / H) * 100}%`,
        fontSize: `${Math.max(MONITOR_MAP_MIN_TYPE, size).toFixed(2)}rem`,
      };
      const children = label
        ? [React.createElement("strong", { key: "c" }, t.coin), both ? React.createElement("small", { key: "d" }, day) : null]
        : [];
      const title = `${name} · ${day} · ${msg("mon_market_value", "market value $1", compact(t.cap))}`;
      /* Every tile opens its coin's card where it was pressed (12 Oct 2026),
         the chart one press inside it for a coin the chart can draw */
      return React.createElement(
        MarketTileButton,
        {
          key: t.coin,
          change: t.change,
          style,
          title,
          "aria-haspopup": "dialog",
          "aria-label": msg("mon_market_card", "$1 — $2 in 24 hours; opens its card", name, day),
          "data-market-tile": t.coin,
          onClick: (ev) => this.openDetail(t.coin, ev.currentTarget, ev),
        },
        ...children,
      );
    });
    const moved = tiles.filter((t) => Number.isFinite(t.change));
    const list = (items) =>
      React.createElement(
        "ol",
        null,
        ...items.map((t) =>
          React.createElement(
            "li",
            { key: t.coin },
            React.createElement("span", null, COIN_NAMES[t.coin] && COIN_NAMES[t.coin] !== t.coin ? `${t.coin} · ${COIN_NAMES[t.coin]}` : t.coin),
            React.createElement(MonitorCell, { tone: monitorTone(t.change), style: { padding: 0 } }, monitorSigned(t.change, 2)),
          ),
        ),
      );
    const at = Math.max(...tiles.map((t) => t.at));
    const when = new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return React.createElement(
      Fragment,
      null,
      React.createElement(
        MarketMap,
        {
          ratio: `${W} / ${H}`,
          aspect: (W / H).toFixed(3),
          innerRef: (n) => (this._mapNode = n),
          role: "group",
          "data-market-map": "true",
          "aria-label": msg("mon_market_label", "The top $1 coins by market value, each sized by it and shaded by its last 24 hours", String(tiles.length)),
        },
        ...cells,
      ),
      React.createElement(
        MarketMoves,
        { "data-market-moves": "true" },
        React.createElement(
          "div",
          null,
          React.createElement("h4", null, msg("mon_market_up", "Up most in 24 hours")),
          list(moved.slice().sort((a, b) => b.change - a.change).slice(0, 5)),
        ),
        React.createElement(
          "div",
          null,
          React.createElement("h4", null, msg("mon_market_down", "Down most in 24 hours")),
          list(moved.slice().sort((a, b) => a.change - b.change).slice(0, 5)),
        ),
      ),
      React.createElement(
        MonitorNote,
        null,
        msg(
          "mon_market_note",
          "Coinlore's top $1 by market value as of $2, the same snapshot the price bar reads — one request a minute while this tab is open. A tile's size is its market value and its shade its last 24 hours. A coin the chart can draw opens on it.",
          String(tiles.length),
          when,
        ),
      ),
    );
  }

  renderCorrelation() {
    const coins = (Array.isArray(this.props.coins) ? this.props.coins : []).filter((c) => this.state.series[c]);
    if ((this.props.coins || []).length < 2) {
      return React.createElement(MonitorNote, null, msg("mon_need_two", "Add a second coin to see how your coins move together."));
    }
    const matrix = correlationMatrix(coins, this.state.series);
    const step = coins.length ? (monitorRow(this.state.series[coins[0]]) || {}).step : 0;
    // The counts the cells rest on, said once under the grid (a tooltip is
    // no denominator on a phone)
    const ns = Object.values(matrix).filter(Boolean).map((c) => c.n);
    const nText = ns.length ? (Math.min(...ns) === Math.max(...ns) ? String(ns[0]) : `${Math.min(...ns)}–${Math.max(...ns)}`) : "—";
    const cells = [React.createElement(CorrLabel, { key: "corner" }, "")];
    for (const c of coins) cells.push(React.createElement(CorrLabel, { key: `h-${c}`, top: true }, c));
    for (const a of coins) {
      cells.push(React.createElement(CorrLabel, { key: `r-${a}` }, a));
      for (const b of coins) {
        if (a === b) {
          cells.push(React.createElement(CorrCell, { key: `${a}|${b}`, strength: null }, "·"));
          continue;
        }
        const c = matrix[`${a}|${b}`];
        const band = c ? corrBand(c.r) : null;
        cells.push(
          React.createElement(
            CorrCell,
            {
              key: `${a}|${b}`,
              strength: c ? Math.min(1, Math.abs(c.r)) : null,
              "data-corr": `${a}|${b}`,
              "data-corr-band": band || undefined,
              title: c
                ? c.sameN
                  ? msg("mon_corr_cell_same", "$1 and $2: $3 — the same way on $4% of $5 moves (r $6)", a, b, corrWord(band), String(Math.round((c.same / c.sameN) * 100)), String(c.sameN), signedFixed(c.r, 2))
                  : msg("mon_corr_cell", "$1 and $2: $3, from $4 moves", a, b, signedFixed(c.r, 2), c.n)
                : msg("mon_corr_few", "Too few shared moves to say"),
            },
            c
              ? React.createElement(
                  Fragment,
                  null,
                  React.createElement("b", null, signedFixed(c.r, 2)),
                  React.createElement("small", null, corrWord(band)),
                )
              : "—",
          ),
        );
      }
    }
    return React.createElement(
      Fragment,
      null,
      coins.length < 2
        ? React.createElement(MonitorNote, null, msg("mon_loading", "Reading 30 days of prices…"))
        : React.createElement(CorrGrid, { n: coins.length, "data-corr-grid": "true" }, ...cells),
      // What the shades say, in the cells' own words
      coins.length >= 2 &&
        React.createElement(
          CorrLegend,
          { "aria-label": msg("mon_corr_legend", "What the cells say"), "data-corr-legend": "true" },
          ...[
            ["together", "0.8 – 1", 0.9],
            ["mostly", "0.5 – 0.8", 0.65],
            ["loosely", "0.2 – 0.5", 0.35],
            ["unrelated", "−0.2 – 0.2", 0.05],
            ["opposite", "< −0.2", 0.5],
          ].map(([band, range, strength]) =>
            React.createElement(
              "span",
              { key: band },
              React.createElement(CorrSwatch, { strength, "aria-hidden": "true" }),
              React.createElement("b", null, corrWord(band)),
              React.createElement("small", null, range),
            ),
          ),
        ),
      // The pairs worth a sentence, in plain words
      coins.length >= 2 &&
        (() => {
          const lines = corrHighlights(coins, matrix);
          if (!lines.length) return null;
          return React.createElement(
            CorrPairs,
            { "data-corr-pairs": "true" },
            React.createElement("h4", null, msg("mon_corr_pairs", "In plain words")),
            ...lines.map(({ a, b, c }) =>
              React.createElement(
                "p",
                { key: `${a}|${b}` },
                React.createElement("b", null, `${a} · ${b}`),
                " ",
                React.createElement(CorrTag, { band: corrBand(c.r) }, corrWord(corrBand(c.r))),
                " ",
                c.sameN
                  ? msg("mon_corr_pair_line", "went the same way on $1 of every 10 moves (r $2).", String(Math.round((c.same / c.sameN) * 10)), signedFixed(c.r, 2))
                  : msg("mon_corr_pair_line_r", "r $1.", signedFixed(c.r, 2)),
              ),
            ),
          );
        })(),
      React.createElement(
        MonitorNote,
        null,
        msg(
          "mon_corr_note2",
          "Two counts for each pair over the last 30 days, one move every $1, $2 moves a pair: how often the two went the same way, and the correlation r of their moves — 1 when they move in step, 0 when one says nothing about the other, −1 when they go opposite ways. Moving together is not a reason to hold both or either: it describes these 30 days, never what comes next.",
          describeSpan(step) || "—",
          nText,
        ),
      ),
    );
  }

  render() {
    const { onClose, coins } = this.props;
    const tab = this.tab();
    return React.createElement(
      BaseOverlay,
      {
        "data-monitor": "true",
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
      React.createElement(
        BaseCard,
        { still: this.props.still === true },
        React.createElement(
          BaseHead,
          null,
          React.createElement(BaseTitle, null, msg("mon_title", "Monitor"), keyCap("M")),
          React.createElement(
            BaseEyebrow,
            null,
            msg("mon_eyebrow", "Your $1 coins · the last 30 days", (coins || []).length),
          ),
        ),
        React.createElement(
          BaseBody,
          null,
          this.props.onTab ? monitorTabStrip(tab, (t) => this.setTab(t)) : null,
          React.createElement(
            MonitorPane,
            { key: tab },
            tab === "corr" ? this.renderCorrelation() : tab === "market" ? this.renderMarket() : this.renderCoins(),
          ),
          this.state.detail ? this.renderDetail() : null,
        ),
      ),
    );
  }
}

MonitorPanel.defaultProps = { coins: [], stats: {}, onPick: null, activeCoin: null };
