/* THE WIDGETS' SIZES, AS THREE DESIGNS (17 Oct 2026)
 *
 * The owner: large cards gave the same experience as small ones — a size only
 * decided how much of one layout showed, so a large card was a medium one
 * with empty space under it. Here a size is a different design:
 *
 *   s — a glance: the figure, one small picture, one line of state.
 *   m — context: the figure and two facts beside a real picture (a month's
 *       line, a split, a distribution).
 *   l — detail: a larger picture with its scale and its dates, a grid of
 *       figures, and the sentence saying what it is.
 *
 * A widget opts in with `render(size)` beside its `content`; one without it
 * still has its single layout cut by size (`WidgetBody`). Everything here is
 * sized in em, because the card sets the one font-size (test-invariants §9).
 * Inks are the theme's: text, secondary text, the up/down pair for a
 * direction and nothing else — the blue belongs to the comparison line. */

const KitWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45em;
  flex: 1;
  min-height: 0;
  min-width: 0;
`;

/* The figure. Larger as the card grows, so the hierarchy holds at each size. */
const KitHero = styled.div`
  font-size: ${({ size }) => (size === "l" ? 2.05 : size === "m" ? 1.45 : 1.45)}em;
  font-weight: ${({ theme }) => theme.fontWeight.bold};
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.005em;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme, tone }) =>
    tone === "up"
      ? theme.color.chartLineGreen
      : tone === "down"
        ? theme.color.chartLineRed
        : theme.color.text};
`;

/* A figure's unit, beside it and quieter, so "0.21 gwei" keeps its number
   whole in a small card. */
const KitUnit = styled.span`
  font-size: 0.5em;
  font-weight: ${({ theme }) => theme.fontWeight.medium || 500};
  color: ${({ theme }) => theme.color.textSecondary};
  margin-left: 0.3em;
  letter-spacing: 0.02em;
`;
const kitFigure = (value, unit) => [value, unit ? React.createElement(KitUnit, { key: "u" }, unit) : null];

/* A line under the figure: never smaller than the card's labels. */
const KitSub = styled.div`
  font-size: 0.7em;
  line-height: 1.35;
  color: ${({ theme }) => theme.color.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: ${({ wrap }) => (wrap ? "normal" : "nowrap")};
  & > b {
    color: ${({ theme }) => theme.color.text};
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
  }
`;

/* A figure inside a line, inked by its direction. */
const KitTone = styled.b`
  /* Doubled: a line's own "& > b" would otherwise paint it in the text ink */
  && {
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
    color: ${({ theme, tone }) =>
      tone === "up"
        ? theme.color.chartLineGreen
        : tone === "down"
          ? theme.color.chartLineRed
          : theme.color.text};
  }
`;

/* Medium's two columns: the figure and its facts, then the picture. */
const KitSplit = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1em;
  align-items: center;
  flex: 1;
  min-height: 0;
`;

const KitCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35em;
  min-width: 0;
`;

/* Large's figures: value over label, in a row of two to four. */
const KitStats = styled.div`
  display: grid;
  grid-template-columns: repeat(${({ cols }) => cols || 2}, minmax(0, 1fr));
  gap: 0.5em 0.8em;
`;

const KitStat = styled.div`
  min-width: 0;
  padding-top: 0.45em;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

const KitStatValue = styled.div`
  font-size: 0.92em;
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme, tone }) =>
    tone === "up"
      ? theme.color.chartLineGreen
      : tone === "down"
        ? theme.color.chartLineRed
        : theme.color.text};
`;

const KitStatLabel = styled.div`
  font-size: 0.64em;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textSecondary};
  margin-top: 0.2em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/* The sentence a large card ends on: what it is, from where, as of when. */
const KitNote = styled.div`
  margin-top: auto;
  font-size: 0.64em;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.textSecondary};
`;

/* Every picture is an SVG drawn in the card's own ink (currentColor) and
   stretched to its box; its height is set in em so it scales with the card. */
const KitSvg = styled.svg`
  display: block;
  width: 100%;
  height: ${({ h }) => h || 3}em;
  overflow: visible;
  color: ${({ theme }) => theme.color.text};
  & .kit-up {
    fill: ${({ theme }) => theme.color.chartLineGreen};
    stroke: ${({ theme }) => theme.color.chartLineGreen};
  }
  & .kit-down {
    fill: ${({ theme }) => theme.color.chartLineRed};
    stroke: ${({ theme }) => theme.color.chartLineRed};
  }
  & .kit-quiet {
    fill: ${({ theme }) => theme.color.textSecondary};
    stroke: ${({ theme }) => theme.color.textSecondary};
  }
  & .kit-rule {
    stroke: ${({ theme }) => theme.color.border};
    fill: none;
  }
  & text {
    fill: ${({ theme }) => theme.color.textSecondary};
    font-family: ${({ theme }) => theme.font.primary};
  }
`;

/* A labelled scale under a picture: its two ends, or its dates. */
const KitScale = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.6em;
  font-size: 0.62em;
  color: ${({ theme }) => theme.color.textSecondary};
  font-variant-numeric: tabular-nums;
  & > span {
    white-space: nowrap;
  }
`;

/* A bar list: label, track and figure, one row each. */
const KitBarRow = styled.div`
  display: grid;
  grid-template-columns: ${({ label }) => label || "3.2em"} minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55em;
  font-size: 0.7em;
  color: ${({ theme }) => theme.color.textSecondary};
  font-variant-numeric: tabular-nums;
  & > b {
    color: ${({ theme }) => theme.color.text};
    font-weight: ${({ theme }) => theme.fontWeight.semibold};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const KitTrack = styled.div`
  position: relative;
  height: 0.55em;
  border-radius: 0.3em;
  background: ${({ theme }) => theme.color.border};
  overflow: hidden;
  & > i {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    border-radius: inherit;
    background: ${({ theme, tone }) =>
      tone === "up"
        ? theme.color.chartLineGreen
        : tone === "down"
          ? theme.color.chartLineRed
          : theme.color.text};
    opacity: ${({ tone }) => (tone ? 1 : 0.75)};
  }
`;

/* ── Pictures. Pure: values in, an element out; no state, no fetch. ────── */

const kitFinite = (xs) => (Array.isArray(xs) ? xs.filter((v) => Number.isFinite(v)) : []);

/* A line over a series, optionally with its area and a zero rule. `domain`
   pins the scale (a 0–100 index), else it is the series' own range. */
const kitSpark = (values, opts) => {
  const o = opts || {};
  const xs = kitFinite(values);
  if (xs.length < 2) return null;
  const W = 100;
  const H = 40;
  let lo = o.domain ? o.domain[0] : Math.min(...xs);
  let hi = o.domain ? o.domain[1] : Math.max(...xs);
  if (o.zero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (!(hi > lo)) {
    hi = lo + 1;
  }
  const x = (i) => (i / (xs.length - 1)) * W;
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const line = xs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const last = xs[xs.length - 1];
  return React.createElement(
    KitSvg,
    { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", h: o.h, "aria-hidden": "true", "data-kit": "spark" },
    o.zero && lo < 0 && hi > 0
      ? React.createElement("line", { className: "kit-rule", x1: 0, x2: W, y1: y(0), y2: y(0), vectorEffect: "non-scaling-stroke", strokeDasharray: "3 3" })
      : null,
    // `mark`: a stretch of the series [from, to] (indices), shaded in plain ink
    o.mark && o.mark[1] > o.mark[0]
      ? React.createElement("rect", {
          x: x(o.mark[0]),
          width: Math.max(0.5, x(o.mark[1]) - x(o.mark[0])),
          y: 0,
          height: H,
          fill: "currentColor",
          opacity: 0.1,
        })
      : null,
    (o.levels || []).map((v) =>
      React.createElement("line", { key: v, className: "kit-rule", x1: 0, x2: W, y1: y(v), y2: y(v), vectorEffect: "non-scaling-stroke" }),
    ),
    o.area
      ? React.createElement("path", {
          d: `${line} L${W},${H} L0,${H} Z`,
          fill: "currentColor",
          opacity: 0.06,
          stroke: "none",
        })
      : null,
    React.createElement("path", {
      d: line,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      vectorEffect: "non-scaling-stroke",
      strokeLinejoin: "round",
      strokeLinecap: "round",
    }),
    React.createElement("circle", { cx: x(xs.length - 1), cy: y(last), r: 1.6, fill: "currentColor" }),
  );
};

/* A cone: where replays landed at each horizon — [{ at, lo, mid, hi }],
   `at` 0 for now — a band from the 5th to the 95th and the median line. */
const kitCone = (points, opts) => {
  const o = opts || {};
  const ps = (points || []).filter((p) => p && [p.at, p.lo, p.mid, p.hi].every(Number.isFinite));
  if (ps.length < 2) return null;
  const W = 100;
  const H = 40;
  const lo = Math.min(...ps.map((p) => p.lo));
  const hi = Math.max(...ps.map((p) => p.hi));
  const span = hi - lo || 1;
  const last = ps[ps.length - 1].at || 1;
  const x = (at) => (at / last) * W;
  const y = (v) => H - ((v - lo) / span) * H;
  const top = ps.map((p) => `${x(p.at).toFixed(2)},${y(p.hi).toFixed(2)}`);
  const bottom = ps.map((p) => `${x(p.at).toFixed(2)},${y(p.lo).toFixed(2)}`).reverse();
  return React.createElement(
    KitSvg,
    { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", h: o.h, "aria-hidden": "true", "data-kit": "cone" },
    React.createElement("polygon", { points: top.concat(bottom).join(" "), fill: "currentColor", opacity: 0.12 }),
    React.createElement("line", { className: "kit-rule", x1: 0, x2: W, y1: y(ps[0].mid), y2: y(ps[0].mid), vectorEffect: "non-scaling-stroke", strokeDasharray: "3 3" }),
    React.createElement("path", {
      d: ps.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(2)},${y(p.mid).toFixed(2)}`).join(" "),
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      vectorEffect: "non-scaling-stroke",
    }),
  );
};

/* Columns above and below zero, inked by sign: funding, flows. */
const kitColumns = (values, opts) => {
  const o = opts || {};
  const xs = kitFinite(values);
  if (!xs.length) return null;
  const W = 100;
  const H = 40;
  const top = Math.max(0, ...xs);
  const bottom = Math.min(0, ...xs);
  const span = top - bottom || 1;
  const zero = (top / span) * H;
  const w = W / xs.length;
  return React.createElement(
    KitSvg,
    { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", h: o.h, "aria-hidden": "true", "data-kit": "columns" },
    React.createElement("line", { className: "kit-rule", x1: 0, x2: W, y1: zero, y2: zero, vectorEffect: "non-scaling-stroke" }),
    xs.map((v, i) => {
      const h = (Math.abs(v) / span) * H;
      return React.createElement("rect", {
        key: i,
        // `invert`: funding, where above zero is longs paying — the crowded side
        className: (v >= 0) !== Boolean(o.invert) ? "kit-up" : "kit-down",
        x: i * w + w * 0.15,
        width: w * 0.7,
        y: v >= 0 ? zero - h : zero,
        height: Math.max(h, 0.4),
        stroke: "none",
      });
    }),
  );
};

/* A ring: a share of a whole, the share written inside. */
const kitRing = (share, label, opts) => {
  const o = opts || {};
  const s = Math.max(0, Math.min(1, Number(share) || 0));
  const R = 15.9155; // circumference 100
  return React.createElement(
    KitSvg,
    { viewBox: "0 0 36 36", h: o.h || 4.2, style: { width: `${o.h || 4.2}em` }, role: "img", "aria-label": label, "data-kit": "ring" },
    React.createElement("circle", { className: "kit-rule", cx: 18, cy: 18, r: R, strokeWidth: 3.2 }),
    React.createElement("circle", {
      cx: 18,
      cy: 18,
      r: R,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 3.2,
      strokeDasharray: `${(s * 100).toFixed(2)} 100`,
      strokeLinecap: "round",
      transform: "rotate(-90 18 18)",
    }),
    React.createElement(
      "text",
      { x: 18, y: 20.4, textAnchor: "middle", fontSize: 7.5, style: { fill: "currentColor", fontWeight: 600 } },
      o.text != null ? o.text : `${Math.round(s * 100)}%`,
    ),
  );
};

/* A whole split into parts, side by side, in ink steps — never a direction. */
const kitStack = (parts, opts) => {
  const o = opts || {};
  const list = (parts || []).filter((p) => p && p.share > 0);
  const total = list.reduce((a, p) => a + p.share, 0);
  if (!(total > 0)) return null;
  let at = 0;
  return React.createElement(
    KitSvg,
    { viewBox: "0 0 100 6", preserveAspectRatio: "none", h: o.h || 0.7, "aria-hidden": "true", "data-kit": "stack" },
    list.map((p, i) => {
      const w = (p.share / Math.max(total, o.whole || total)) * 100;
      const el = React.createElement("rect", {
        key: i,
        x: at,
        width: Math.max(w - 0.6, 0.2),
        y: 0,
        height: 6,
        rx: 1,
        fill: "currentColor",
        opacity: [1, 0.6, 0.35, 0.2][i] != null ? [1, 0.6, 0.35, 0.2][i] : 0.15,
      });
      at += w;
      return el;
    }),
  );
};

/* A queue as blocks: one square a block, the last one only as full as the
   fraction left, at most `max` and a "+n" past it. */
const kitBlocks = (count, opts) => {
  const o = opts || {};
  const max = o.max || 12;
  const n = Math.max(0, Number(count) || 0);
  const shown = Math.min(Math.ceil(n), max);
  const size = 10;
  const gap = 3;
  const W = max * (size + gap);
  return React.createElement(
    KitSvg,
    { viewBox: `0 0 ${W} ${size}`, h: o.h || 1.1, "aria-hidden": "true", "data-kit": "blocks", preserveAspectRatio: "xMinYMid meet" },
    Array.from({ length: shown }, (_, i) => {
      const fill = i < Math.floor(n) ? 1 : n - Math.floor(n);
      return React.createElement(
        "g",
        { key: i },
        React.createElement("rect", { className: "kit-rule", x: i * (size + gap) + 0.5, y: 0.5, width: size - 1, height: size - 1, rx: 1.5 }),
        React.createElement("rect", { x: i * (size + gap) + 0.5, y: 0.5 + (size - 1) * (1 - Math.min(1, fill)), width: size - 1, height: (size - 1) * Math.min(1, fill), rx: 1.5, fill: "currentColor", opacity: 0.8 }),
      );
    }),
  );
};

/* A bar list's rows: [{ label, value, text, tone }], scaled to the largest. */
const kitBars = (rows, opts) => {
  const o = opts || {};
  const list = (rows || []).filter((r) => r && Number.isFinite(r.value));
  const max = o.max || Math.max(...list.map((r) => Math.abs(r.value)), 0);
  return list.map((r) =>
    React.createElement(
      KitBarRow,
      { key: r.key != null ? r.key : r.label, label: o.label, "data-kit-bar": r.label },
      React.createElement("b", null, r.label),
      React.createElement(
        KitTrack,
        { tone: r.tone },
        React.createElement("i", { style: { width: `${max > 0 ? Math.max(2, (Math.abs(r.value) / max) * 100) : 0}%` } }),
      ),
      React.createElement("span", null, r.text),
    ),
  );
};

/* A row of large-card figures: [{ value, label, tone }]. */
const kitStats = (items, cols) =>
  React.createElement(
    KitStats,
    { cols: cols || 2 },
    ...(items || [])
      .filter(Boolean)
      .map((it) =>
        React.createElement(
          KitStat,
          { key: it.label },
          React.createElement(KitStatValue, { tone: it.tone }, it.value),
          React.createElement(KitStatLabel, null, it.label),
        ),
      ),
  );

/* A date for a scale: "Oct 3". */
const kitDay = (t) =>
  Number.isFinite(t) ? localeDate(t, { month: "short", day: "numeric" }) : "";

/* What a card shows at a size: its own design when it has one, else the one
   layout `WidgetBody` cuts. `designed` turns the cutting off. */
const widgetSized = (def, size) =>
  def && typeof def.render === "function"
    ? { designed: true, node: def.render(size) }
    : { designed: false, node: def ? def.content : null };
