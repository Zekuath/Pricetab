/* THE MONITOR ("M")
 *
 * Bloomberg's MOST and CORR for the coins on your list (2 Oct 2026), and its
 * IMAP for the market (9 Oct 2026, *"terminal kısmı … monitör, ona biraz
 * daha yetenek ekleyelim, çok yavan kalmış"*): one screen, three tabs.
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
      const c = Array.isArray(a) && Array.isArray(b) ? compareCorrelation(a, b) : null;
      out[`${coins[i]}|${coins[j]}`] = c;
      out[`${coins[j]}|${coins[i]}`] = c;
    }
  }
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
const MONITOR_MAP_MIN_TYPE = 0.64;
// The snapshot is asked again this often while the map is open
const MONITOR_MAP_REFRESH_MS = 60000;

/* ── styles ────────────────────────────────────────────────────────────── */

const MonitorTabs = styled.div`
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1.2rem;
`;

const MonitorTab = styled.button.attrs({ type: "button" })`
  min-height: 2.25rem;
  padding: 0 0.9rem;
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
  white-space: nowrap;
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
    font-size: 0.64rem;
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
  max-width: 72rem;
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
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;

  h4 {
    margin: 0 0 0.4rem;
    font-size: 0.64rem;
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
  grid-template-columns: minmax(3rem, auto) repeat(${({ n }) => n}, minmax(0, 4.5rem));
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
`;

/* ── component ─────────────────────────────────────────────────────────── */

const monitorSigned = (v, digits = 1) => (v == null || !isFinite(v) ? "—" : `${signedFixed(v, digits)}%`);
const monitorTone = (v) => (v == null || !isFinite(v) || Math.abs(v) < 0.05 ? "quiet" : v > 0 ? "up" : "down");

/* **The monitor and the base rates are one screen** (12 Oct 2026, the owner:
   *"monitor ve base rates'i aynı menüye yedirelim … tek bir sayfada daha çok
   işlem görülebilsin"*): one tab on the screens' column, and this strip at the
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
    this.state = { tab: "coins", series: {}, failed: {}, sort: { key: null, dir: -1 } };
    this._token = 0;
  }

  componentDidMount() {
    this.load();
    if (this.tab() === "market") this.refreshMarket();
  }

  // The app's tab when it holds one (the shared screen), else this panel's own
  tab() {
    return this.props.tab && this.props.tab !== "base" ? this.props.tab : this.state.tab;
  }

  componentDidUpdate(prev) {
    if (prev.currency !== this.props.currency || prev.coins !== this.props.coins) this.load();
  }

  componentWillUnmount() {
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

  renderCoins() {
    const { formatPrice, activeCoin, onPick } = this.props;
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
          onClick: () => onPick && onPick(r.coin),
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
          "mon_coins_note2",
          "The price and the 24 hours come from the ticker, or from the coin's own 30 days where the ticker has none; the rest from those 30 days, the series the 1M range draws. β is each coin's moves against Bitcoin's over the same days. A row opens that coin on the chart; ↑ and ↓ walk the rows.",
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
      out.push({ coin: key.slice(0, -(cur.length + 1)), cap: v.marketCap, change: v.change, at: v.timestamp });
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
    const { onPick, currency } = this.props;
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
    const remPerUnit = (phone ? 22 : 72) / W;
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
      if (SUGGESTED_COINS.includes(t.coin) && onPick) {
        return React.createElement(
          MarketTileButton,
          {
            key: t.coin,
            change: t.change,
            style,
            title,
            "aria-label": msg("mon_market_open", "Open $1 on the chart — $2 in 24 hours", name, day),
            "data-market-tile": t.coin,
            onClick: () => onPick(t.coin),
          },
          ...children,
        );
      }
      return React.createElement(MarketTile, { key: t.coin, change: t.change, style, title, "aria-hidden": "true", "data-market-tile": t.coin }, ...children);
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
        cells.push(
          React.createElement(
            CorrCell,
            {
              key: `${a}|${b}`,
              strength: c ? Math.min(1, Math.abs(c.r)) : null,
              "data-corr": `${a}|${b}`,
              title: c
                ? msg("mon_corr_cell", "$1 and $2: $3, from $4 moves", a, b, signedFixed(c.r, 2), c.n)
                : msg("mon_corr_few", "Too few shared moves to say"),
            },
            c ? signedFixed(c.r, 2) : "—",
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
      React.createElement(
        MonitorNote,
        null,
        msg(
          "mon_corr_note",
          "How each pair moved together over the last 30 days: the Pearson correlation of their moves, one every $1 — $2 moves a pair. 1 is in step, 0 unrelated, −1 opposite. It describes these 30 days, never what comes next.",
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
        null,
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
          tab === "corr" ? this.renderCorrelation() : tab === "market" ? this.renderMarket() : this.renderCoins(),
        ),
      ),
    );
  }
}

MonitorPanel.defaultProps = { coins: [], stats: {}, onPick: null, activeCoin: null };
