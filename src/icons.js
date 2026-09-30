/* ICONS
 * Inline SVG for the UI's own controls, replacing the emoji that used to
 * stand in for them. Emoji are drawn by the operating system: 💼 and 🔔
 * looked different on every platform, carried their own colours regardless
 * of the theme, and brought their own metrics, so they never optically
 * matched the text glyphs beside them.
 *
 * Drawn here rather than pulled from an icon set: no third-party licence or
 * attribution to carry, and the geometry follows the same rules as the rest
 * of the UI — 24px grid, round-capped strokes weighted to match the bold ×
 * beside them, and `currentColor` so every icon inherits the theme and any
 * hover state.
 */

/* Weight is set to sit level with the bold × these buttons use for their
 * close state: at button size (≈17px) 2.4 on the 24 grid lands on the same
 * stem width. Going heavier starts to close the gear's valleys and the
 * link's interlock, so this is the top of the usable range. */
const ICON_STROKE = 2.4;

/* Gear outline: 8 teeth, flat tops at r 9.3 dropping to valleys at r 6.6.
 * An earlier version drew the teeth as thin radial spokes around a hub —
 * at button size that reads as a sun, which would be a bad thing to put
 * next to a theme setting. Real teeth are unmistakable. */
const GEAR_PATH =
  "M21.24 10.95 L21.24 13.05 L18.38 13.71 L17.72 15.30 L19.28 17.79 " +
  "L17.79 19.28 L15.30 17.72 L13.71 18.38 L13.05 21.24 L10.95 21.24 " +
  "L10.29 18.38 L8.70 17.72 L6.21 19.28 L4.72 17.79 L6.28 15.30 " +
  "L5.62 13.71 L2.76 13.05 L2.76 10.95 L5.62 10.29 L6.28 8.70 " +
  "L4.72 6.21 L6.21 4.72 L8.70 6.28 L10.29 5.62 L10.95 2.76 " +
  "L13.05 2.76 L13.71 5.62 L15.30 6.28 L17.79 4.72 L19.28 6.21 " +
  "L17.72 8.70 L18.38 10.29 Z";

// Each entry returns the shapes inside a 24×24 box
const ICON_SHAPES = {
  settings: () => [
    React.createElement("path", { key: "gear", d: GEAR_PATH }),
    React.createElement("circle", { key: "hub", cx: 12, cy: 12, r: 3.1 }),
  ],

  // Briefcase: body, lid seam, handle
  portfolio: () => [
    React.createElement("rect", {
      key: "body",
      x: 3,
      y: 7.5,
      width: 18,
      height: 12.5,
      rx: 2.2,
    }),
    React.createElement("line", { key: "seam", x1: 3, y1: 13, x2: 21, y2: 13 }),
    React.createElement("path", {
      key: "handle",
      d: "M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5",
    }),
  ],

  // Target: concentric rings around a filled centre — the feature is called
  // price targets, so the icon says target rather than notification bell
  target: () => [
    React.createElement("circle", { key: "o", cx: 12, cy: 12, r: 8.5 }),
    React.createElement("circle", { key: "m", cx: 12, cy: 12, r: 4.2 }),
    React.createElement("circle", {
      key: "c",
      cx: 12,
      cy: 12,
      r: 1.3,
      fill: "currentColor",
      stroke: "none",
    }),
  ],

  /* Info: a ring with a dotted stem. The dot is a filled circle rather than a
   * short stroke, because at 15px a two-pixel tittle sitting above a stroked
   * bar reads as a lower-case "i" with a broken top — a filled dot survives
   * the size the button is actually used at. */
  info: () => [
    React.createElement("circle", { key: "o", cx: 12, cy: 12, r: 9 }),
    React.createElement("path", { key: "s", d: "M12 11v5.5" }),
    React.createElement("circle", {
      key: "d",
      cx: 12,
      cy: 7.8,
      r: 1.15,
      fill: "currentColor",
      stroke: "none",
    }),
  ],

  // Eye: restore hidden widgets
  eye: () => [
    React.createElement("path", {
      key: "lid",
      d: "M2.5 12s3.6-5.8 9.5-5.8S21.5 12 21.5 12s-3.6 5.8-9.5 5.8S2.5 12 2.5 12Z",
    }),
    React.createElement("circle", { key: "iris", cx: 12, cy: 12, r: 2.6 }),
  ],

  /* Compare: two arrows passing each other. Three other readings were drawn
   * and rejected at button size, which is the only size that matters here:
   * two lines diverging from a shared origin collapsed into a "<", two trend
   * lines turned to mush, and a pair of peaks read as a scribble. This one
   * survives 17px with its arrowheads open. */
  /* The chart's own settings: three rails with a knob on each.
   *
   * Deliberately **not** the gear. The gear is the Settings panel's, it sits
   * in the corner of the same screen, and two gears that open two different
   * things is the kind of ambiguity a 17px icon cannot survive. Rails read as
   * "adjust what is in front of you", which is what the drawer is. */
  sliders: () => [
    React.createElement("path", { key: "r1", d: "M4 7h16" }),
    React.createElement("circle", { key: "k1", cx: "9", cy: "7", r: "2.1", fill: "currentColor", stroke: "none" }),
    React.createElement("path", { key: "r2", d: "M4 12h16" }),
    React.createElement("circle", { key: "k2", cx: "15.5", cy: "12", r: "2.1", fill: "currentColor", stroke: "none" }),
    React.createElement("path", { key: "r3", d: "M4 17h16" }),
    React.createElement("circle", { key: "k3", cx: "7.5", cy: "17", r: "2.1", fill: "currentColor", stroke: "none" }),
  ],

  /* Widgets: four cards, one of them taller — the drawer holds cards of
   * different heights in two columns, and four equal squares read as an app
   * launcher grid rather than as a set of readings. */
  widgets: () => [
    React.createElement("rect", { key: "a", x: 3.5, y: 3.5, width: 7.5, height: 10, rx: 1.6 }),
    React.createElement("rect", { key: "b", x: 13, y: 3.5, width: 7.5, height: 6, rx: 1.6 }),
    React.createElement("rect", { key: "c", x: 3.5, y: 15.5, width: 7.5, height: 5, rx: 1.6 }),
    React.createElement("rect", { key: "d", x: 13, y: 11.5, width: 7.5, height: 9, rx: 1.6 }),
  ],

  compare: () => [
    React.createElement("path", { key: "t", d: "M3.5 8.5h15" }),
    React.createElement("path", { key: "th", d: "M15.2 5 18.7 8.5 15.2 12" }),
    React.createElement("path", { key: "b", d: "M20.5 15.5h-15" }),
    React.createElement("path", { key: "bh", d: "M8.8 12 5.3 15.5 8.8 19" }),
  ],

  /* Calls: a board of squares with one of them claimed.
   *
   * The feature is "point at a square and name the price", so the icon is the
   * lattice with a box on it — the thing you actually do. A target's rings
   * were the obvious neighbour to borrow from and are exactly wrong here: a
   * target is a request and a call is a claim, and the two controls sit next
   * to each other in the corner, so they have to be told apart at 17px. The
   * claimed square is filled rather than outlined, because at that size a
   * second outline inside the first is invisible.
   *
   * Two squares each way, not three: at the 2.4 stroke these buttons use, a
   * 3×3 grid inside a 17-unit box leaves 5.7 units of gap between 2.4-unit
   * lines, and at 17px on screen that closes into a solid block. */
  calls: () => [
    React.createElement("rect", {
      key: "board", x: 3.6, y: 3.6, width: 16.8, height: 16.8, rx: 2.4,
    }),
    React.createElement("path", { key: "v", d: "M12 3.6v16.8" }),
    React.createElement("path", { key: "h", d: "M3.6 12h16.8" }),
    React.createElement("rect", {
      key: "claim", x: 13.4, y: 5, width: 5.6, height: 5.6, rx: 0.8,
      fill: "currentColor", stroke: "none",
    }),
  ],

  /* **Futures: a candle with a leveraged arm.**
   *
   * Everything obvious was taken or wrong. A bull/bear pair is two glyphs; a
   * percentage sign is the widget panel's; a bell means "tell me when" and
   * belongs to targets; the grid with a claimed square is calls, which is the
   * neighbour this most needs to be told apart from. What a futures position
   * actually is, drawn: a price bar with a wick, and a bracket reaching out
   * from it — the leverage — with the two ends the position lives between.
   * One filled body so it reads as a *position* rather than as a chart at
   * button size, where three hairlines close into a smudge. */
  futures: () => [
    React.createElement("path", { key: "wick", d: "M9 3.4v17.2" }),
    React.createElement("rect", {
      key: "body", x: 6.4, y: 7.6, width: 5.2, height: 8.8, rx: 1,
      fill: "currentColor", stroke: "none",
    }),
    React.createElement("path", { key: "arm", d: "M14 7.6h6" }),
    React.createElement("path", { key: "arm2", d: "M14 16.4h6" }),
    React.createElement("path", { key: "tie", d: "M19.4 7.6v8.8" }),
  ],

  /* A plain chevron, pointing down. The settings groups used the text glyph
   * "▾" for this, at 0.6rem and 0.7 opacity — a 9.6px character drawn by
   * whatever font the operating system picked, which is the same reason the
   * emoji were replaced here in the first place. On macOS it rendered as a
   * hairline wedge nobody reported ever noticing, so the accordion looked
   * like a heading you could not open. Drawn on the 24 grid it inherits the
   * icon weight and stays legible at any size. */
  chevron: () => React.createElement("path", { d: "M6 9.5 12 15.5 18 9.5" }),

  /* A folded newspaper: the sheet, a masthead rule, and two column rules.
   * The obvious alternative — a bell — already means "tell me when", which is
   * what the targets button does two icons along; news is something you go and
   * read, not something that comes and finds you. Three lines rather than the
   * usual five, because at button size (≈17px) five 2.4-weight strokes inside
   * a 24 box close up into a grey block. */
  news: () => [
    React.createElement("rect", {
      key: "sheet",
      x: 3,
      y: 5,
      width: 18,
      height: 14,
      rx: 2,
    }),
    React.createElement("path", { key: "masthead", d: "M7 9 H13" }),
    React.createElement("path", { key: "col1", d: "M7 13 H17" }),
    React.createElement("path", { key: "col2", d: "M7 16 H14" }),
  ],

  /* Base rates: a count, drawn as one — four bars on a baseline, the tallest
   * not at the end, so it reads as a distribution rather than as a chart
   * going up (the panel exists because nothing here is a signal). It had no
   * icon while it had no control of its own; it has a tab on the right-hand
   * spine since 26 Sep 2026. */
  baserates: () => [
    React.createElement("path", { key: "base", d: "M3.5 20.5h17" }),
    React.createElement("path", { key: "a", d: "M6.5 20.5v-5" }),
    React.createElement("path", { key: "b", d: "M10.5 20.5v-12" }),
    React.createElement("path", { key: "c", d: "M14.5 20.5v-8" }),
    React.createElement("path", { key: "d", d: "M18.5 20.5v-3" }),
  ],

  // Chain link: two interlocking pills. On the diagonal they read as a
  // chain; laid out horizontally they looked like a toggle switch.
  /* A bookmark: the news panel's "keep this". Filled once kept — the same
     outline, so the two states read as one control. */
  /* The chart's tools (chart-tools.js). Each shows the mark it leaves: a
     ruler's ticks, a level across, a line between two points, one that runs
     on, a box, a note. Drawn for 18px at a 1.6 stroke (30 Sep 2026): the
     handles are open rings the line stops short of, because a ring with a
     line through it read as a blot at that size. */
  ruler: () => [
    React.createElement("path", { key: "r", d: "M4 16 16 4l4 4L8 20z" }),
    React.createElement("path", { key: "t", d: "M8.5 11.5l1.75 1.75M11.25 8.75 13 10.5M14 6l1.75 1.75" }),
  ],
  hline: () => [
    React.createElement("path", { key: "l", d: "M3 12h6.5M14.5 12H21" }),
    React.createElement("circle", { key: "c", cx: "12", cy: "12", r: "2.5" }),
  ],
  trend: () => [
    React.createElement("path", { key: "l", d: "M8 16 16 8" }),
    React.createElement("circle", { key: "a", cx: "6.25", cy: "17.75", r: "2.25" }),
    React.createElement("circle", { key: "b", cx: "17.75", cy: "6.25", r: "2.25" }),
  ],
  ray: () => [
    React.createElement("path", { key: "l", d: "M7.75 16.25 20 4" }),
    React.createElement("path", { key: "h", d: "M14.5 4H20v5.5" }),
    React.createElement("circle", { key: "a", cx: "6", cy: "18", r: "2.25" }),
  ],
  box: () => React.createElement("rect", { x: "4", y: "6", width: "16", height: "12", rx: "2" }),
  note: () => [
    React.createElement("path", {
      key: "p",
      d: "M6 4.5h12A2 2 0 0 1 20 6.5v8a2 2 0 0 1-2 2h-6.5L7 20v-3.5H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z",
    }),
    React.createElement("path", { key: "t", d: "M8 9h8M8 12h5" }),
  ],
  // The chart tools' + (turned to an × while they are out)
  plus: () => React.createElement("path", { d: "M12 5v14M5 12h14" }),
  bookmark: () => React.createElement("path", { d: "M6.5 3.5h11v17l-5.5-4-5.5 4z" }),
  bookmarkOn: () =>
    React.createElement("path", { d: "M6.5 3.5h11v17l-5.5-4-5.5 4z", fill: "currentColor" }),
  link: () =>
    React.createElement(
      "g",
      { transform: "rotate(-45 12 12)" },
      React.createElement("rect", {
        key: "l",
        x: 2.4,
        y: 8.8,
        width: 11.2,
        height: 6.4,
        rx: 3.2,
      }),
      React.createElement("rect", {
        key: "r",
        x: 10.4,
        y: 8.8,
        width: 11.2,
        height: 6.4,
        rx: 3.2,
      }),
    ),
};

/* Renders one icon at `size` rem. Inherits colour from the parent, so
 * hover/focus states need no icon-specific styling. `stroke` exists for the
 * few large decorative uses, where the default weight would out-bold the
 * text around it. */
const icon = (name, size, stroke) => {
  const shapes = ICON_SHAPES[name];
  if (!shapes) return null;
  const rem = `${size || 1.05}rem`;
  return React.createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: rem,
      height: rem,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: stroke || ICON_STROKE,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      focusable: "false",
      style: { display: "block", flex: "0 0 auto" },
    },
    shapes(),
  );
};
