function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    obj[key] = value;
  }
  return obj;
}

/* IMPORTS */
const { Component, createRef, Fragment, PureComponent } = React;
const {
  css,
  injectGlobal,
  keyframes,
  ThemeProvider,
  withTheme,
  default: styled,
} = window.styled;
const {
  easeCubicOut,
  extent,
  interpolatePath,
  line,
  scaleLinear,
  scaleTime,
  select,
} = d3;

/* THEME */
const PIXEL_SCALE = 4;
const scale = PIXEL_SCALE / 16;

const breakpoint = {
  up: { xl: 1440, lg: 1024, md: 768, sm: 576 },
  down: { lg: 1439, md: 1023, sm: 767, xs: 575 },
};

// Theme colors for light and dark modes
const lightColors = {
  bg: "#ffffff",
  bgSecondary: "#f5f5f5",
  text: "#1a1a1a",
  textSecondary: "#666666",
  border: "rgba(0, 0, 0, 0.12)",
  borderHover: "rgba(0, 0, 0, 0.25)",
  chartLine: "#3b82f6",
  chartLineGreen: "#10b981",
  chartLineRed: "#ef4444",
  shadow: "rgba(0, 0, 0, 0.1)",
};

const darkColors = {
  bg: "#000000",
  bgSecondary: "#1a1a1a",
  text: "#ffffff",
  textSecondary: "#a0a0a0",
  border: "rgba(255, 255, 255, 0.12)",
  borderHover: "rgba(255, 255, 255, 0.25)",
  chartLine: "#60a5fa",
  chartLineGreen: "#34d399",
  chartLineRed: "#f87171",
  shadow: "rgba(0, 0, 0, 0.5)",
};

const color = darkColors; // Default to dark (will be overridden by theme context)

const font = {
  primary: `'Roboto Mono', monospace`,
};

const fontWeight = {
  black: "900",
  bold: "700",
  semibold: "600",
  medium: "500",
  regular: "400",
  light: "300",
  extralight: "200",
};

const spacing = {
  xsmall: scale,
  small: scale * 2,
  medium: scale * 4,
  large: scale * 8,
  xlarge: scale * 16,
};

const theme = {
  breakpoint,
  color,
  font,
  fontWeight,
  scale,
  spacing,
};

/* ── The scrollbar, once ──────────────────────────────────────────────────
 *
 * Every list in this extension scrolls, and the browser's default scrollbar is
 * drawn by the operating system: on the dark theme it arrives as a pale grey
 * bar on a black panel, which is the single loudest thing on the screen and
 * belongs to nothing around it.
 *
 * Three files had already solved this and each carried its own copy — the
 * targets panel, the widget row and the settings card — while the portfolio,
 * the coin jumper, the shortcut list and the news panel had none at all, so
 * exactly half the scrolling surfaces in the app matched the theme and the
 * other half did not. Well past the third repetition, so it lives here, in the
 * first file that loads, and everything interpolates it.
 *
 * `scrollbar-color` covers Firefox, the `::-webkit-` block covers Chrome —
 * which is the one that actually ships, but the page is also opened in
 * Firefox-based forks and the two-line version costs nothing.
 *
 * The thumb is `border` at rest and `borderHover` under the pointer: the same
 * two tokens every other edge in the app uses, so a scrollbar reads as the
 * panel's own edge rather than as furniture bolted on. `track` stays
 * transparent — a filled track doubles the visual weight of something whose
 * whole job is to be findable and otherwise ignored.
 */
/* A headline says it is a link **when you reach for it**, and not before.
 *
 * Four surfaces carry outbound headlines — the news panel, the "what happened
 * here?" card, the line under the price and the ticker row — and three of them
 * had already invented `text-decoration: underline` on hover while the panel,
 * the one built for reading, had nothing but a background change. Four is past
 * the point where they should be one thing.
 *
 * The rule is not `none` → `underline`. The underline is always there and
 * starts **transparent**, for two reasons: it can be eased, which a
 * `text-decoration` swap cannot, and the line's box never changes, so a row of
 * headlines does not twitch as the pointer runs down it. `currentColor` rather
 * than a fixed ink, so it belongs to whatever is using it — secondary text
 * underlines in secondary grey, a title in the text colour.
 *
 * `0.18em` of offset and a single pixel of thickness: at 0.72–0.82rem an
 * underline sitting on the baseline cuts the descenders off the g and the y.
 * Keyboard focus gets the same line as the pointer, since the same press
 * follows it.
 */
const hoverUnderline = css`
  text-decoration: underline;
  text-decoration-color: transparent;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
  transition: text-decoration-color 0.18s ease;

  &:hover,
  &:focus-visible {
    text-decoration-color: currentColor;
  }
`;

const themedScrollbar = css`
  scrollbar-width: thin;
  scrollbar-color: ${({ theme: t }) => t.color.border} transparent;

  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme: t }) => t.color.border};
    border-radius: 3px;
    transition: background 0.2s ease;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${({ theme: t }) => t.color.borderHover};
  }

  /* Chrome draws the corner where two scrollbars meet in its own grey, and it
   * is the one piece the rules above do not cover. */
  &::-webkit-scrollbar-corner {
    background: transparent;
  }
`;

