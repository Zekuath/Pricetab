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

  // Eye: restore hidden widgets
  eye: () => [
    React.createElement("path", {
      key: "lid",
      d: "M2.5 12s3.6-5.8 9.5-5.8S21.5 12 21.5 12s-3.6 5.8-9.5 5.8S2.5 12 2.5 12Z",
    }),
    React.createElement("circle", { key: "iris", cx: 12, cy: 12, r: 2.6 }),
  ],

  // Chain link: two interlocking pills. On the diagonal they read as a
  // chain; laid out horizontally they looked like a toggle switch.
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
