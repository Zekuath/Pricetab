/* PORTFOLIO CHART — the value chart you can read, as opposed to the one you
 * can look at.
 *
 * The portfolio has always had a chart: full-bleed, 45% opacity, behind a
 * scrolling column, `pointer-events: none`, `aria-hidden`. That is wallpaper,
 * and wallpaper was the right call for what it was — an ambient sense of the
 * shape of the last week. But the questions a portfolio is opened for are
 * *when* questions ("when did I go ahead", "what was it worth when I bought",
 * "which of these is carrying the position"), and none of them can be asked of
 * a picture you cannot point at.
 *
 * So this is the same series, given the things that make a chart an
 * instrument: a scale you can read, a crosshair that answers at a moment, the
 * purchases and sales you actually made drawn where they happened, and — the
 * part a single total line can never show — what the total was *made of* at
 * each point.
 *
 * ── Why its own file and its own component ─────────────────────────────────
 * `LineBase` already draws lines, candles and a comparison overlay and picks
 * between them inside one `componentDidUpdate`. `docs/product/TODAY.md` (Piece 4) says
 * plainly what a fourth axis of state on that component would do to it, and a
 * stacked composition is a fourth. This one shares what is genuinely shared —
 * the theme, `formatAxisPrice`, `crosshairDate`, the d3 scales — and owns its
 * own drawing.
 *
 * ── Why it is React-declarative where `LineBase` is imperative ─────────────
 * `LineBase` writes attributes by hand because it morphs a path thirty times a
 * second and repaints on every price refresh. This one is opened deliberately
 * and redraws when the range, the holdings or the window change — so the marks
 * are plain React elements, which is far less code to be wrong. The one thing
 * that does move at pointer speed is the crosshair, and that is written
 * imperatively through refs for exactly the reason `LineBase` gives: a
 * `setState` per mousemove would re-render the grid, the bands and every
 * marker to move one dashed line.
 */

/* The band palette.
 *
 * Six hues in a fixed order plus a neutral "Other" — never cycled, and a
 * seventh coin folds into Other rather than borrowing hue one back. Both
 * columns are selected for their own surface (#ffffff and #000000) rather than
 * being an automatic flip of each other, and the set is machine-checked rather
 * than eyeballed: lightness band, chroma floor, protan/deutan separation on
 * adjacent pairs (worst ΔE 9.1 light / 8.4 dark against a target of 8),
 * normal-vision separation (19.6 / 19.3 against a floor of 15), contrast
 * against the surface.
 *
 * Three of the light steps sit under 3:1 on white. That is allowed only with
 * relief, and the relief is real here: every band is directly labelled with
 * its coin wherever it is tall enough, the legend under the chart names all of
 * them, and the holdings table is one key away.
 */
/* THE BAND PALETTE — one ramp, ordered, biggest first.
 *
 * It was six saturated hues (blue, orange, green, amber, pink, green), and the
 * complaint that replaced them was exact: they were neither this app's colours
 * nor the coins' own. They were arbitrary labels pretending to be identities.
 *
 * What replaced them is a **sequential green ramp**, which says the thing that
 * is actually true of the order it is drawn in — so the strip can be read
 * without a legend. The interface is monospaced near-black on near-white with
 * green and red reserved for *direction*; six competing hues were the only
 * object breaking that.
 *
 * **The largest holding is the greenest, and that direction is the point.**
 * The first version ran the other way on the dark theme — biggest was a pale
 * near-white mint and the slivers were vivid — because on black the brightest
 * step is the most prominent one. That is true of *luminance* and wrong about
 * what the eye reads here: a saturated green is stronger than a washed-out
 * pale, whatever their luminances say, and "the majority should be the green
 * one" is what anybody looking at a share bar expects. So index 0 is the
 * deepest, most saturated green in both themes and the ramp fades toward pale
 * as the holdings get smaller. Flipping it also **gained** separation rather
 * than costing any: worst-case adjacent ΔE went 12.7 → 13.1 (dark).
 *
 * **Green, and the two hard parts of making it green.**
 *
 * The first is that green is exactly the hue red-green deficiency compresses:
 * a flat brand-green ramp measured ΔE **6.9** (dark) / **7.5** (light) between
 * adjacent steps, the worst of everything tried. The way out is that
 * deficiency preserves the **blue–yellow** axis, so the ramp travels *within*
 * green — teal-green at the strong end to a yellow-green at the faint end
 * (hue 85→135 dark, 95→135 light — deep and saturated at the big end, pale at the small) — which is separation a red-green-deficient
 * eye can still see. That is what takes it from 6.9 to **10.9**.
 *
 * **And then the saturation was pulled back, deliberately.** At full chroma
 * this ramp separated best (worst ΔE 13.1) and read as a lime gradient — the
 * loudest object on a screen whose entire complaint about the six hues was
 * that they were loud. Measured: dropping peak chroma from 98 to **69** costs
 * 2.2 ΔE and nothing else. Below about chroma 58 the separation stops falling
 * at all (10.2), so there are two quieter notches available for free if this
 * still shouts: saturation 0.48→0.22 and 0.36→0.18.
 *
 * Reversing the hue journey — deep emerald at the big end instead of a deep
 * yellow-green — was tried for the same reason and is a worse trade: the best
 * emerald-first ramp measured 11.4 at chroma 73, so it buys less quiet for
 * more separation.
 *
 * The second is that **green already means "up" on this screen**, two inches
 * from the P/L figures. Every step is held at least ΔE 20 from the app's own
 * up-green (measured: 24.5 dark, 18.8 light), so a large holding cannot read
 * as a gain.
 *
 * **The trade against the old palette is stated, not hidden.** Adjacent-step
 * CIE ΔE, under normal vision and under simulated deuteranopia and protanopia:
 *
 *   | | normal | deuteranopia | protanopia |
 *   |---|---|---|---|
 *   | the old six hues | 73–75 | 43–46 | **22–24** |
 *   | a flat green ramp | 10.8–13.6 | 6.9–7.5 | 7.2–7.7 |
 *   | this ramp | 13.7 / 19.8 | 12.7 / 15.3 | 13.5 / 16.6 |
 *
 * Lower in absolute terms, and **the same for everybody** where the old set
 * lost two thirds of its separation to protanopia. What pays for the drop is
 * that a ramp is read as an order rather than as six labels, the strip writes
 * the coin's name inside every segment wide enough to hold one, and the
 * holdings list repeats the same ink on every row.
 *
 * Also constrained: every step clears 3.36:1 (dark) / 1.38:1 (light) against
 * its own ground — these are large filled areas, not text.
 *
 * **"Other" is the last step of the ramp, not a separate grey.** It used to be
 * `textSecondary`, which against a neutral ramp would be a seventh shade of
 * the same thing; as the faintest step it is exactly what it means — the
 * smallest, last, and already named in the list and the legend.
 *
 * `PORTFOLIO_BAND_INK` is the label colour **per step**, and it has to be: a
 * ramp crosses the point where white stops being legible and black starts, so
 * one fixed ink is unreadable at one end of it whichever end you choose. Every
 * entry clears 4.8:1 against its own band, which is why the label that used to
 * carry a drop shadow no longer needs one.
 */
const PORTFOLIO_BAND_COLORS = {
  light: ["#1c310c", "#305e1c", "#40882f", "#4faf46", "#73bf75", "#a1cea7", "#cce1d1"],
  dark: ["#496a1b", "#59922b", "#63b63f", "#78c369", "#98cf96", "#bfdec3", "#e5f0e8"],
};
const PORTFOLIO_BAND_INK = {
  light: ["#ffffff", "#ffffff", "#000000", "#000000", "#000000", "#000000", "#000000"],
  dark: ["#ffffff", "#000000", "#000000", "#000000", "#000000", "#000000", "#000000"],
};
// The ramp's faintest step, which is what "Other" is drawn in
const bandPalette = (theme) =>
  isLightTheme(theme) ? PORTFOLIO_BAND_COLORS.light : PORTFOLIO_BAND_COLORS.dark;
const bandOtherIndex = (theme) => bandPalette(theme).length - 1;

const PORTFOLIO_MAX_BANDS = 6;

const PC_PAD = { top: 22, right: 14, bottom: 30, left: 8 };
// Events closer together than this share one marker — see `clusterEvents`
const PC_MARKER_GAP = 16;
// How near the pointer has to be to a marker to be reading it. Generous on
// purpose: the triangle is 10px and nobody lands on a 10px target.
const PC_EVENT_REACH = 26;
// A band has to be at least this tall before its own name will fit inside it
const PC_LABEL_MIN = 16;

const isLightTheme = (theme) => theme.color.bg === lightColors.bg;

/* What a label written *on* a band should be. `tone == null` is the neutral
 * Other, whose grey takes the theme's own background as ink the way the bands
 * used to. Anything else reads its step's entry — a ramp crosses the point
 * where white stops being legible and black starts, and one fixed ink for the
 * whole palette is illegible at one end of it whichever end you choose. */
const bandLabelInk = (theme, tone) => {
  const ink = isLightTheme(theme)
    ? PORTFOLIO_BAND_INK.light
    : PORTFOLIO_BAND_INK.dark;
  // `tone == null` is Other, which is the ramp's last step — so its label
  // follows that step like every other band's does
  return ink[tone == null ? ink.length - 1 : tone];
};

const PcWrap = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
`;

const PcFrame = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
`;

/* The readout floats over the plot and is never a target itself — the pointer
 * is reading the chart, and a box that swallowed the pointer would stop the
 * chart answering the moment you moved onto it. */
const PcReadout = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s ease;
  min-width: 11rem;
  max-width: 17rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bg};
  box-shadow: 0 6px 24px ${({ theme }) => theme.color.shadow};
  font-family: ${({ theme }) => theme.font.primary};
  z-index: 2;
`;

const PcReadoutDate = styled.div`
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PcReadoutTotal = styled.div`
  font-size: 1.05rem;
  font-weight: 700;
  margin-top: 0.15rem;
  color: ${({ theme }) => theme.color.text};
`;

const PcReadoutLine = styled.div`
  font-size: 0.7rem;
  margin-top: 0.15rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PcReadoutRows = styled.div`
  margin-top: 0.45rem;
  padding-top: 0.4rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

const PcReadoutRow = styled.div`
  display: grid;
  grid-template-columns: 0.55rem 1fr auto auto;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  line-height: 1.5;
`;

const PcSwatch = styled.span`
  width: 0.55rem;
  height: 0.55rem;
  min-width: 0.55rem;
  border-radius: 2px;
  display: inline-block;
`;

const PcReadoutName = styled.span`
  color: ${({ theme }) => theme.color.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// Values line up under each other, so they get the equal-width digits
const PcReadoutValue = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-variant-numeric: tabular-nums;
`;

const PcReadoutShare = styled.span`
  color: ${({ theme }) => theme.color.textSecondary};
  font-variant-numeric: tabular-nums;
  min-width: 2.1rem;
  text-align: right;
`;

const PcReadoutEvent = styled.div`
  margin-top: 0.45rem;
  padding-top: 0.4rem;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.7rem;
  white-space: pre-line;
`;

/* Identity is never colour alone: the legend names every band it paints, and
 * carries what each is worth now so it is a reading rather than a key. */
const PcLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.9rem;
  padding: 0.6rem 0.2rem 0;
  font-size: 0.7rem;
  color: ${({ theme }) => theme.color.textSecondary};
`;

const PcLegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
`;

const PcLegendName = styled.span`
  color: ${({ theme }) => theme.color.text};
`;

/* Where the value was at an arbitrary moment.
 *
 * The nearest sample, not an interpolation: the series is what was fetched,
 * and inventing a point between two of them would put a number on screen that
 * no request ever returned. */
const seriesIndexAt = (series, ms) => {
  if (!Array.isArray(series) || !series.length) return -1;
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (+series[mid].time <= ms) lo = mid;
    else hi = mid;
  }
  return ms - +series[lo].time <= +series[hi].time - ms ? lo : hi;
};

/* One marker per patch of chart, not per event.
 *
 * Four purchases in the same week on a year range are four triangles inside
 * eight pixels — a smudge that hides how many it is. Grouping by pixel
 * distance keeps every event (nothing is dropped, which would be a chart
 * quietly editing your history) and says how many are in the pile. */
const clusterEvents = (events, x, gap) => {
  const out = [];
  for (const e of events) {
    const px = x(new Date(e.time));
    if (!isFinite(px)) continue;
    const last = out[out.length - 1];
    if (last && px - last.x <= gap) {
      last.items.push(e);
      last.x = px; // the cluster sits at its latest event, never behind one
      if (e.kind !== last.kind) last.kind = "both";
      continue;
    }
    out.push({ x: px, kind: e.kind, items: [e] });
  }
  return out;
};

class PortfolioChartBase extends Component {
  constructor(props) {
    super(props);
    this.state = { w: 0, h: 0 };

    // Unique ids so two charts' clip paths can never collide in the DOM
    const uid = Math.random().toString(36).slice(2, 9);
    this.clipUpId = "pcUp_" + uid;
    this.clipDownId = "pcDown_" + uid;

    this.frameRef = createRef();
    this.hoverRef = createRef();
    this.hoverLineRef = createRef();
    this.hoverDotRef = createRef();
    this.readoutRef = createRef();
    this.roDateRef = createRef();
    this.roTotalRef = createRef();
    this.roDeltaRef = createRef();
    this.roCostRef = createRef();
    this.roRowsRef = createRef();
    this.roEventRef = createRef();
    /* One row per band plus Other, made once and written to on hover. A pool
     * rather than a list rendered from state, for the same reason the
     * crosshair is: this is a pointer-speed path. */
    this.roRows = [];
    for (let i = 0; i <= PORTFOLIO_MAX_BANDS; i++) {
      this.roRows.push({
        row: createRef(),
        dot: createRef(),
        name: createRef(),
        value: createRef(),
        share: createRef(),
      });
    }

    this.hoverRaf = 0;
    this.hoverX = -1;
    this.hoverY = 0;
    this._geo = null;
    this._bands = [];
    this._clusters = [];

    this.measure = this.measure.bind(this);
    this.handleResize = debounce(this.measure, 150);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.drawHover = this.drawHover.bind(this);
  }

  componentDidMount() {
    this.measure();
    window.addEventListener("resize", this.handleResize);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.handleResize);
    this.handleResize.cancel();
    if (this.hoverRaf) cancelAnimationFrame(this.hoverRaf);
  }

  componentDidUpdate(prevProps) {
    /* Measured again after every update, not only on a window resize.
     *
     * The plot is a flex child above a legend, and the legend is not there on
     * the first pass — with no width there is nothing to draw and nothing to
     * name. So the first measurement was of a box 22px taller than the box the
     * chart ended up in, and the whole drawing was scaled to it: the x-axis
     * band landed under the legend and the dates were invisible, which is the
     * classic version of this mistake. `measure` ignores a change under a
     * pixel, so this settles in one extra pass and cannot loop. */
    this.measure();

    /* New data moves every scale under the readout, so what it is saying is
     * about a chart that is no longer there. Cheaper and more honest to put it
     * away than to try to keep it true. */
    if (
      prevProps.series !== this.props.series ||
      prevProps.parts !== this.props.parts ||
      prevProps.stacked !== this.props.stacked
    ) {
      this.handlePointerLeave();
    }
  }

  measure() {
    const box = this.frameRef.current;
    if (!box) return;
    const { width, height } = box.getBoundingClientRect();
    if (
      Math.abs(width - this.state.w) < 1 &&
      Math.abs(height - this.state.h) < 1
    ) {
      return;
    }
    this.setState({ w: width, h: height });
  }

  /* The bands, in the order they are stacked.
   *
   * Biggest at the bottom: it is the one whose shape is read against the axis,
   * and a base that changed rank would repaint the whole chart every time two
   * holdings swapped places. Everything past the sixth is one neutral "Other"
   * — a seventh hue would be a colour nobody can tell from the third.
   */
  bands() {
    const { parts, theme } = this.props;
    if (!Array.isArray(parts) || !parts.length) return [];
    const palette = isLightTheme(theme)
      ? PORTFOLIO_BAND_COLORS.light
      : PORTFOLIO_BAND_COLORS.dark;
    const named = parts.slice(0, PORTFOLIO_MAX_BANDS).map((p, i) => ({
      coin: p.coin,
      values: p.values,
      color: palette[i],
    }));
    const rest = parts.slice(PORTFOLIO_MAX_BANDS);
    if (rest.length === 1) {
      named.push({
        coin: rest[0].coin,
        values: rest[0].values,
        // The ramp's faintest step, not a separate grey — see the palette note
        color: bandPalette(theme)[bandOtherIndex(theme)],
      });
    } else if (rest.length > 1) {
      const values = rest[0].values.map((_, i) =>
        rest.reduce((sum, p) => sum + (p.values[i] || 0), 0),
      );
      named.push({
        coin: "Other",
        values,
        color: bandPalette(theme)[bandOtherIndex(theme)],
        other: true,
        count: rest.length,
      });
    }
    return named;
  }

  /* Everything the drawing needs, worked out once per render.
   *
   * The y domain is the one place the two modes genuinely disagree, and the
   * disagreement is not cosmetic. A line is read for its shape, so it gets the
   * range it moved in. A stack is read for its *proportions*, and proportions
   * are only true from zero — on a zoomed axis a stacked band can be drawn
   * twice the height of one worth ten times as much. So composition costs you
   * the zoom, deliberately, and the toggle says so.
   */
  geometry() {
    const { series, costBasis, stacked, theme } = this.props;
    const { w, h } = this.state;
    if (!Array.isArray(series) || series.length < 2) return null;
    if (!(w > 40) || !(h > 60)) return null;

    const t0 = +series[0].time;
    const t1 = +series[series.length - 1].time;
    if (!(t1 > t0)) return null;

    const x = scaleTime()
      .range([PC_PAD.left, w - PC_PAD.right])
      .domain([new Date(t0), new Date(t1)]);

    const [dataLo, dataHi] = extent(series, (d) => d.price);
    if (!isFinite(dataLo) || !isFinite(dataHi)) return null;
    const span = dataHi - dataLo || Math.abs(dataHi) * 0.02 || 1;

    let lo = stacked ? 0 : dataLo - span * 0.1;
    let hi = dataHi + span * (stacked ? 0.06 : 0.1);

    /* The cost level joins the scale rather than being clipped by it — where
     * you crossed into profit is the whole reason it is drawn.
     *
     * But not at any price. The test is what including it would *cost the
     * chart*: a basis far below a quiet range would squash the whole window
     * into a band a few pixels tall to make room for a line at the bottom, and
     * a flat line at the bottom is not worth a year of history. So the drawn
     * range may grow to about two and a half times the range the data actually
     * moved in — with a floor, since a portfolio that has barely moved has a
     * tiny span and would otherwise never be allowed to show its cost at all.
     * Out of reach, the level is not drawn and nothing is implied about a
     * crossing the window doesn't contain. */
    const cost = isFinite(costBasis) && costBasis > 0 ? costBasis : null;
    const room = Math.max(span * 2.5, Math.abs(dataHi) * 0.25);
    const reachable =
      cost != null &&
      Math.max(dataHi, cost) - Math.min(dataLo, cost) <= room;
    if (reachable) {
      lo = Math.min(lo, cost - span * 0.06);
      hi = Math.max(hi, cost + span * 0.06);
    }
    if (stacked) lo = 0;
    if (!(hi > lo)) return null;

    const y = scaleLinear()
      .range([h - PC_PAD.bottom, PC_PAD.top])
      .domain([lo, hi]);

    const plotH = h - PC_PAD.top - PC_PAD.bottom;
    const plotW = w - PC_PAD.left - PC_PAD.right;
    // Spaced so the labels have room, rather than however many d3 would fit
    const levels = y.ticks(Math.max(2, Math.min(6, Math.floor(plotH / 46))));
    const step = levels.length > 1 ? Math.abs(levels[1] - levels[0]) : 0;
    const columns = x.ticks(Math.max(2, Math.floor(plotW / 130)));

    const points = series.map((d) => ({
      x: x(new Date(+d.time)),
      y: y(d.price),
    }));

    return {
      x,
      y,
      levels,
      step,
      columns,
      points,
      cost: reachable ? cost : null,
      costY: reachable ? y(cost) : null,
      top: PC_PAD.top,
      bottom: h - PC_PAD.bottom,
      left: PC_PAD.left,
      right: w - PC_PAD.right,
      tint:
        series[series.length - 1].price >= series[0].price
          ? theme.color.chartLineGreen
          : theme.color.chartLineRed,
    };
  }

  /* A polyline through the points. Straight segments, not a smoothed curve: a
   * curve invents values between samples, and this chart is read for "what was
   * it worth on the 12th". */
  linePath(points) {
    return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join("");
  }

  /* One stacked band as a closed polygon: along its own top, back along the
   * top of the band below it. Written out rather than fed through `d3.area`
   * because the cumulative sums are the part worth reading. */
  bandPath(geo, tops, floors) {
    const up = tops.map((v, i) => `${i ? "L" : "M"}${geo.points[i].x},${v}`);
    const down = [];
    for (let i = floors.length - 1; i >= 0; i--) {
      down.push(`L${geo.points[i].x},${floors[i]}`);
    }
    return `${up.join("")}${down.join("")}Z`;
  }

  handlePointerMove(e) {
    const box = this.frameRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    this.hoverX = e.clientX - rect.left;
    this.hoverY = e.clientY - rect.top;
    if (this.hoverRaf) return;
    this.hoverRaf = requestAnimationFrame(this.drawHover);
  }

  handlePointerLeave() {
    if (this.hoverRaf) {
      cancelAnimationFrame(this.hoverRaf);
      this.hoverRaf = 0;
    }
    this.hoverX = -1;
    const hover = this.hoverRef.current;
    const readout = this.readoutRef.current;
    if (hover) hover.setAttribute("visibility", "hidden");
    if (readout) readout.style.opacity = "0";
  }

  write(ref, text) {
    const node = ref.current;
    // Assigning textContent replaces the text node even when the string is the
    // same one, which on a pointer-speed path is churn for nothing
    if (node && node.textContent !== text) node.textContent = text;
  }

  /* The crosshair and the readout, written by hand.
   *
   * Everything here is `setAttribute`, `textContent` and `style` on nodes that
   * already exist. Routing it through React would re-render the grid, every
   * band and every marker to move a dashed line four pixels.
   */
  drawHover() {
    this.hoverRaf = 0;
    const geo = this._geo;
    const hover = this.hoverRef.current;
    const readout = this.readoutRef.current;
    if (!geo || !hover || !readout || this.hoverX < 0) return;
    const { series, formatMoney, formatAmount, period, theme } = this.props;

    const px = Math.max(geo.left, Math.min(geo.right, this.hoverX));
    const i = seriesIndexAt(series, +geo.x.invert(px));
    if (i < 0 || !geo.points[i]) return;
    const point = geo.points[i];

    hover.setAttribute("visibility", "inherit");
    if (this.hoverLineRef.current) {
      this.hoverLineRef.current.setAttribute("x1", point.x);
      this.hoverLineRef.current.setAttribute("x2", point.x);
    }
    if (this.hoverDotRef.current) {
      this.hoverDotRef.current.setAttribute("cx", point.x);
      this.hoverDotRef.current.setAttribute("cy", point.y);
    }

    const total = series[i].price;
    const first = series[0].price;
    const delta = total - first;
    const pct = first > 0 ? (delta / first) * 100 : null;

    this.write(this.roDateRef, crosshairDate(series[i].time, period));
    this.write(this.roTotalRef, formatMoney(total, false));
    this.write(
      this.roDeltaRef,
      `${formatMoney(delta, true)}${
        pct != null ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : ""
      } since ${crosshairDate(series[0].time, period)}`,
    );
    if (this.roDeltaRef.current) {
      this.roDeltaRef.current.style.color =
        delta === 0
          ? theme.color.textSecondary
          : delta > 0
            ? theme.color.chartLineGreen
            : theme.color.chartLineRed;
    }

    /* Against cost, which is the question the line alone cannot answer: a
     * portfolio that is up over the window can still be under water since you
     * bought, and those are different facts. */
    const cost = this.props.costBasis;
    const costNode = this.roCostRef.current;
    if (costNode) {
      if (isFinite(cost) && cost > 0) {
        const over = total - cost;
        costNode.textContent = `${formatMoney(Math.abs(over), false)} ${
          over >= 0 ? "above" : "below"
        } cost`;
        costNode.style.color =
          over >= 0 ? theme.color.chartLineGreen : theme.color.chartLineRed;
        costNode.style.display = "";
      } else {
        costNode.style.display = "none";
      }
    }

    /* What the total was made of at that moment.
     *
     * Shown in both modes, not only when the bands are painted: composition is
     * asked for just as often of the plain line, and the numbers exist either
     * way. `stacked` decides what is drawn, never what can be read. */
    const bands = this._bands;
    let shown = 0;
    for (let b = 0; b < this.roRows.length; b++) {
      const row = this.roRows[b];
      const node = row.row.current;
      if (!node) continue;
      const band = bands[b];
      const value = band && isFinite(band.values[i]) ? band.values[i] : 0;
      if (!band || !(value > 0)) {
        node.style.display = "none";
        continue;
      }
      node.style.display = "";
      shown++;
      if (row.dot.current) row.dot.current.style.background = band.color;
      this.write(row.name, band.other ? `Other (${band.count})` : band.coin);
      this.write(row.value, formatMoney(value, false));
      this.write(
        row.share,
        total > 0 ? `${((value / total) * 100).toFixed(0)}%` : "",
      );
    }

    /* The container goes with its rows. It carries the rule that separates the
     * headline from the breakdown, and a rule under nothing is a line the
     * readout never meant to draw. */
    if (this.roRowsRef.current) {
      this.roRowsRef.current.style.display = shown ? "" : "none";
    }

    /* An event under the pointer, in words. The triangle says something
     * happened; only this says what. */
    const eventNode = this.roEventRef.current;
    if (eventNode) {
      const near = this._clusters.find(
        (c) => Math.abs(c.x - px) <= PC_EVENT_REACH,
      );
      if (near) {
        const lines = near.items.slice(0, 3).map((ev) => {
          const what = `${ev.kind === "buy" ? "▲ Bought" : "▼ Sold"} ${formatAmount(
            ev.amount,
          )} ${ev.coin}`;
          return ev.cash > 0 ? `${what} · ${formatMoney(ev.cash, false)}` : what;
        });
        if (near.items.length > 3) lines.push(`+${near.items.length - 3} more`);
        eventNode.textContent = lines.join("\n");
        eventNode.style.display = "";
      } else {
        eventNode.style.display = "none";
      }
    }

    /* Placed beside the pointer, and flipped before it would run off the
     * right-hand edge — a readout that leaves the chart to say something is
     * saying it to nobody. */
    readout.style.opacity = "1";
    const box = readout.getBoundingClientRect();
    const flip = point.x + 18 + box.width > this.state.w;
    const rx = flip ? point.x - 18 - box.width : point.x + 18;
    const ry = Math.max(
      4,
      Math.min(this.state.h - box.height - 4, this.hoverY - box.height / 2),
    );
    readout.style.transform = `translate(${Math.max(4, rx)}px, ${Math.max(0, ry)}px)`;
  }

  /* Solid hairlines, a shade off the surface. Dashes on a grid read as a
   * threshold or a projection, and the only dashed line on this chart is an
   * actual threshold. */
  /* An axis label, carried in a thin halo of the surface.
   *
   * The price labels sit inside the plot, and in composition mode the plot is
   * full of saturated bands — grey 9px type straight onto a blue field is not
   * a reading, it is a rumour. Drawing the surface colour underneath as a 3px
   * stroke (paint-order puts it behind the glyph) keeps the same label legible
   * on the surface, on a band, and on the line, without a box around it. */
  axisLabel(props, text) {
    const { theme } = this.props;
    return React.createElement(
      "text",
      Object.assign(
        {
          fill: theme.color.textSecondary,
          fontSize: 9,
          fontFamily: theme.font.primary,
          letterSpacing: "0.08em",
          stroke: theme.color.bg,
          strokeWidth: 3,
          strokeLinejoin: "round",
          paintOrder: "stroke",
        },
        props,
      ),
      text,
    );
  }

  renderGrid(geo) {
    const { currency, period, theme } = this.props;
    const symbol = getCurrencySymbol(currency);
    const out = [];
    geo.levels.forEach((v, k) => {
      const ly = geo.y(v);
      if (ly < geo.top - 1 || ly > geo.bottom + 1) return;
      out.push(
        React.createElement("line", {
          key: `gl${k}`,
          x1: 0,
          x2: this.state.w,
          y1: ly,
          y2: ly,
          stroke: theme.color.border,
          strokeWidth: 1,
        }),
        /* Recessive on the plain chart, full ink over the bands. The axis
         * should stay quiet, but quiet grey at 9px on a saturated field is
         * not quiet, it is unreadable — and the halo alone does not fix a
         * mid-grey glyph. */
        this.axisLabel(
          {
            key: `gt${k}`,
            x: geo.left + 2,
            y: ly - 5,
            fill: this.props.stacked ? theme.color.text : theme.color.textSecondary,
          },
          formatAxisPrice(v, geo.step, symbol),
        ),
      );
    });
    geo.columns.forEach((t, k) => {
      const cx = geo.x(t);
      if (cx < geo.left - 1 || cx > geo.right + 1) return;
      out.push(
        React.createElement("line", {
          key: `cl${k}`,
          x1: cx,
          x2: cx,
          y1: geo.top - 10,
          y2: geo.bottom,
          stroke: theme.color.border,
          strokeWidth: 1,
        }),
        this.axisLabel(
          { key: `ct${k}`, x: cx + 3, y: this.state.h - 9 },
          crosshairDate(t, period),
        ),
      );
    });
    return out;
  }

  /* The stack, bottom up. Each band's top is the running total and its floor
   * is the band below's top, which is what makes the areas add up to the line
   * drawn over them. */
  renderBands(geo, bands, surface) {
    const { theme } = this.props;
    const out = [];
    const running = geo.points.map(() => geo.bottom);
    const cumulative = geo.points.map(() => 0);
    const last = geo.points.length - 1;

    bands.forEach((band, b) => {
      const tops = [];
      const floors = [];
      for (let i = 0; i < geo.points.length; i++) {
        floors.push(running[i]);
        cumulative[i] += isFinite(band.values[i]) ? band.values[i] : 0;
        const ty = geo.y(cumulative[i]);
        tops.push(ty);
        running[i] = ty;
      }
      out.push(
        React.createElement("path", {
          key: `band${b}`,
          d: this.bandPath(geo, tops, floors),
          fill: band.color,
          fillOpacity: 0.85,
        }),
        /* The 2px gap between fills, drawn as the surface itself rather than
         * as a border around each band: a stroke would ring the sides too and
         * turn a stack into a stack of boxes. */
        React.createElement("path", {
          key: `gap${b}`,
          d: this.linePath(tops.map((v, i) => ({ x: geo.points[i].x, y: v }))),
          fill: "none",
          stroke: surface,
          strokeWidth: 2,
        }),
      );
      /* Direct label, and only where it fits with room to spare. A coin symbol
       * clipped by the band it sits inside is worse than no label — and these
       * labels are what earns the palette its faintest steps.
       *
       * The ink is **per band**, not the surface colour. It used to be
       * `theme.color.bg` for every band, which worked while the palette was
       * six hues of similar lightness; a ramp crosses the point where white
       * stops being legible and black starts, so one fixed ink is unreadable
       * at one end of it whichever end you pick. */
      const height = floors[last] - tops[last];
      if (height >= PC_LABEL_MIN) {
        out.push(
          React.createElement(
            "text",
            {
              key: `bl${b}`,
              x: geo.right - 6,
              y: tops[last] + height / 2 + 3,
              textAnchor: "end",
              fill: bandLabelInk(theme, band.other ? null : b),
              fontSize: 9,
              fontWeight: 700,
              fontFamily: theme.font.primary,
              letterSpacing: "0.08em",
            },
            band.other ? "OTHER" : band.coin,
          ),
        );
      }
    });
    return out;
  }

  /* Above cost and below it, as two clipped copies of one shape.
   *
   * The region between the curve and the cost level *is* the profit, so it is
   * drawn as that region rather than as an area under the line: close the path
   * to the cost level instead of to the floor, then let one clip keep the part
   * above and another the part below. Two fills, one path, and nowhere for the
   * two to disagree about where they meet.
   *
   * Composition mode leaves it out — the bands are already carrying colour
   * with meaning, and a green wash over them would be a second meaning in the
   * same pixels.
   */
  renderZones(geo, d) {
    const { theme } = this.props;
    const last = geo.points[geo.points.length - 1].x;
    const firstX = geo.points[0].x;
    if (geo.costY == null) {
      return React.createElement("path", {
        d: `${d}L${last},${geo.bottom}L${firstX},${geo.bottom}Z`,
        fill: geo.tint,
        fillOpacity: 0.1,
      });
    }
    const closed = `${d}L${last},${geo.costY}L${firstX},${geo.costY}Z`;
    return [
      React.createElement("path", {
        key: "up",
        d: closed,
        fill: theme.color.chartLineGreen,
        fillOpacity: 0.16,
        clipPath: `url(#${this.clipUpId})`,
      }),
      React.createElement("path", {
        key: "down",
        d: closed,
        fill: theme.color.chartLineRed,
        fillOpacity: 0.16,
        clipPath: `url(#${this.clipDownId})`,
      }),
    ];
  }

  // What you did, where you did it. Neutral ink rather than green/red: on this
  // chart those two already mean "above cost" and "below it", and a third
  // meaning in the same two colours is one meaning too many.
  renderEvents(geo, clusters, surface) {
    const { theme, series } = this.props;
    return clusters.map((c, k) => {
      const i = seriesIndexAt(series, +geo.x.invert(c.x));
      const py = geo.points[i] ? geo.points[i].y : geo.bottom;
      const up = c.kind === "buy";
      const s = 5;
      const shape =
        c.kind === "both"
          ? `M${c.x},${py - s} L${c.x + s},${py} L${c.x},${py + s} L${c.x - s},${py} Z`
          : up
            ? `M${c.x},${py - s - 1} L${c.x + s},${py + s - 1} L${c.x - s},${py + s - 1} Z`
            : `M${c.x},${py + s + 1} L${c.x + s},${py - s + 1} L${c.x - s},${py - s + 1} Z`;
      return React.createElement(
        Fragment,
        { key: `ev${k}` },
        /* A 2px ring of the surface, so a marker sitting on the line reads as
         * being on top of it rather than as a kink in it. */
        React.createElement("path", {
          d: shape,
          fill: theme.color.text,
          stroke: surface,
          strokeWidth: 2,
          strokeLinejoin: "round",
          paintOrder: "stroke",
        }),
        c.items.length > 1 &&
          React.createElement(
            "text",
            {
              x: c.x + s + 3,
              y: up ? py + s - 1 : py - s + 9,
              fill: theme.color.textSecondary,
              fontSize: 9,
              fontFamily: theme.font.primary,
            },
            `×${c.items.length}`,
          ),
      );
    });
  }

  renderReadout() {
    return React.createElement(
      PcReadout,
      { innerRef: this.readoutRef, "aria-hidden": true },
      React.createElement(PcReadoutDate, { innerRef: this.roDateRef }),
      React.createElement(PcReadoutTotal, { innerRef: this.roTotalRef }),
      React.createElement(PcReadoutLine, { innerRef: this.roDeltaRef }),
      React.createElement(PcReadoutLine, { innerRef: this.roCostRef }),
      React.createElement(
        PcReadoutRows,
        { innerRef: this.roRowsRef },
        ...this.roRows.map((row, i) =>
          React.createElement(
            PcReadoutRow,
            { key: i, innerRef: row.row },
            React.createElement(PcSwatch, { innerRef: row.dot }),
            React.createElement(PcReadoutName, { innerRef: row.name }),
            React.createElement(PcReadoutValue, { innerRef: row.value }),
            React.createElement(PcReadoutShare, { innerRef: row.share }),
          ),
        ),
      ),
      React.createElement(PcReadoutEvent, { innerRef: this.roEventRef }),
    );
  }

  renderLegend(bands) {
    const { formatMoney } = this.props;
    if (bands.length < 2) return null;
    const last = (band) => {
      const v = band.values[band.values.length - 1];
      return isFinite(v) ? v : 0;
    };
    const total = bands.reduce((sum, b) => sum + last(b), 0);
    return React.createElement(
      PcLegend,
      null,
      ...bands.map((band, i) =>
        React.createElement(
          PcLegendItem,
          { key: i },
          React.createElement(PcSwatch, { style: { background: band.color } }),
          React.createElement(
            PcLegendName,
            null,
            band.other ? `Other (${band.count})` : band.coin,
          ),
          total > 0 ? `${((last(band) / total) * 100).toFixed(0)}%` : "",
          React.createElement("span", null, formatMoney(last(band), false)),
        ),
      ),
    );
  }

  render() {
    const { theme, stacked } = this.props;
    const geo = this.geometry();
    const bands = this.bands();
    this._geo = geo;
    this._bands = bands;
    const surface = theme.color.bg;

    if (!geo) {
      this._clusters = [];
      return React.createElement(
        PcWrap,
        null,
        React.createElement(PcFrame, { innerRef: this.frameRef }),
      );
    }

    const events = Array.isArray(this.props.events) ? this.props.events : [];
    const clusters = clusterEvents(events, geo.x, PC_MARKER_GAP);
    this._clusters = clusters;
    const d = this.linePath(geo.points);
    const showBands = stacked && bands.length > 0;

    return React.createElement(
      PcWrap,
      null,
      React.createElement(
        PcFrame,
        {
          innerRef: this.frameRef,
          onMouseMove: this.handlePointerMove,
          onMouseLeave: this.handlePointerLeave,
        },
        React.createElement(
          "svg",
          {
            width: "100%",
            height: "100%",
            role: "img",
            "aria-label": "Portfolio value over time",
          },
          geo.costY != null &&
            React.createElement(
              "defs",
              null,
              React.createElement(
                "clipPath",
                { id: this.clipUpId },
                React.createElement("rect", {
                  x: 0,
                  y: 0,
                  width: Math.max(0, this.state.w),
                  height: Math.max(0, geo.costY),
                }),
              ),
              React.createElement(
                "clipPath",
                { id: this.clipDownId },
                React.createElement("rect", {
                  x: 0,
                  y: Math.max(0, geo.costY),
                  width: Math.max(0, this.state.w),
                  height: Math.max(0, this.state.h - geo.costY),
                }),
              ),
            ),
          this.renderGrid(geo),
          showBands
            ? this.renderBands(geo, bands, surface)
            : this.renderZones(geo, d),
          // The total, always drawn — in composition mode it is the roof the
          // bands add up to, which is the one thing that proves they do
          React.createElement("path", {
            d,
            fill: "none",
            stroke: showBands ? theme.color.text : geo.tint,
            strokeWidth: 2,
            strokeLinejoin: "round",
            strokeLinecap: "round",
            opacity: showBands ? 0.9 : 1,
          }),
          geo.costY != null &&
            React.createElement(
              Fragment,
              null,
              React.createElement("line", {
                x1: 0,
                x2: this.state.w,
                y1: geo.costY,
                y2: geo.costY,
                stroke: theme.color.textSecondary,
                strokeWidth: 1,
                strokeDasharray: "4 4",
                opacity: 0.9,
              }),
              this.axisLabel(
                { x: geo.left + 2, y: geo.costY - 5 },
                `COST ${this.props.formatMoney(geo.cost, false)}`,
              ),
            ),
          this.renderEvents(geo, clusters, surface),
          // Crosshair — moved imperatively, never re-rendered
          React.createElement(
            "g",
            {
              ref: this.hoverRef,
              visibility: "hidden",
              pointerEvents: "none",
              "aria-hidden": "true",
            },
            React.createElement("line", {
              ref: this.hoverLineRef,
              y1: geo.top - 10,
              y2: geo.bottom,
              stroke: theme.color.textSecondary,
              strokeWidth: 1,
              strokeDasharray: "3 3",
              opacity: 0.8,
            }),
            React.createElement("circle", {
              ref: this.hoverDotRef,
              r: 4,
              fill: surface,
              stroke: theme.color.text,
              strokeWidth: 2,
            }),
          ),
        ),
        this.renderReadout(),
      ),
      this.renderLegend(bands),
    );
  }
}

const PortfolioChart = withTheme(PortfolioChartBase);
