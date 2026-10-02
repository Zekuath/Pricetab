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
  scaleLog,
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
  /* The comparison's blue — its line and its coin's name in the strip under
     the price, set at 0.6rem. It was #3b82f6: 3.68:1 on white and 3.37 on
     bgSecondary, under the 4.5 that type needs (30 Sep 2026). The same hue,
     one step deeper: 5.17 and 4.75. */
  chartLine: "#2563eb",
  /* **Deep enough to be read as text** (27 Sep 2026). These two are the
   * figures' ink as much as the chart's — every "+2.1%" and "-$27.75" in the
   * app is set in them — and at #10b981 / #ef4444 they measured 2.54:1 and
   * 3.76:1 on white (2.33 and 3.45 on bgSecondary), under the 4.5:1 small
   * text needs; the design audit found 60-odd figures below it across the
   * portfolio, the derivatives page and the widgets. #0a7d4f and #c81e1e
   * clear 4.5 on white, on bgSecondary and on the watchlist's pale rows. The
   * dark palette already cleared it and is unchanged. Still not `accent`
   * (#059669): lighter and bluer than this, so a hovered row does not read
   * as a figure. */
  chartLineGreen: "#0a7d4f",
  chartLineRed: "#c81e1e",
  /* The interaction colour: "you are on this", "this one is on".
   *
   * It exists because hover and active states were borrowing `chartLine`,
   * which is a **blue** — the one hue in this palette that belongs to nothing
   * else in the interface, and reads as a link the moment it lands on a word.
   * Hovering a coin in the portfolio turned its symbol Tailwind-blue.
   *
   * Green-family, so it belongs; **not** `chartLineGreen`, and that is the
   * careful part. That green means "up" a few centimetres away on the same
   * row, next to the money — an accent identical to it would make hovering a
   * coin look like a reading about it. This is a deeper green in light and a
   * paler one in dark: unmistakably the same family, unmistakably not the
   * figure. */
  accent: "#059669",
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
  // Lighter than the up-green here, for the reason it is darker in light.
  accent: "#6ee7b7",
  shadow: "rgba(0, 0, 0, 0.5)",
};

/* **Up and down for colour-blind readers** (30 Sep 2026, the chart plan's
 * Phase 6). Green against red is the pair red–green colour blindness — about
 * one man in twelve — reads as one colour. The option is Okabe and Ito's
 * blue against orange, which every common deficiency keeps apart, in shades
 * that clear 4.5:1 as type on both grounds and both themes (light: up 5.92 /
 * 5.43, down 5.49 / 5.04 on bg / bgSecondary; dark: 9.10 / 7.54, 9.32 /
 * 7.73). The token names stay `chartLineGreen` / `chartLineRed` — they mean
 * up and down everywhere they are read, which is why swapping the two values
 * repaints every figure, bar and fill in the app at once.
 *
 * **The one-blue rule holds by moving the blue's owner.** Up takes the blue
 * here, so the comparison's line (`chartLine`, reached only through
 * `compareInk`) becomes Okabe–Ito's reddish purple: one hue, one meaning,
 * in both palettes. Four theme objects in all, each built once, so switching
 * nothing else hands the chart a new theme (see `currentTheme`, app.js). */
const DIRECTION_PALETTE_COLORS = {
  cvd: {
    light: { chartLineGreen: "#0068a8", chartLineRed: "#b04a00", chartLine: "#8e3a8c" },
    dark: { chartLineGreen: "#56b4e9", chartLineRed: "#e69f00", chartLine: "#cc79a7" },
  },
};

const paletteColors = (mode, palette) => {
  const base = mode === "light" ? lightColors : darkColors;
  const over = DIRECTION_PALETTE_COLORS[palette] && DIRECTION_PALETTE_COLORS[palette][mode];
  return over ? { ...base, ...over } : base;
};

/* **Reduced motion, for what the script animates too** (30 Sep 2026, the
 * chart plan's Phase 6). CSS transitions answer to the global rule in app.js;
 * d3's transitions are timers, which no stylesheet reaches — measured with the
 * preference on, a range switch still morphed the line over 75 frames
 * (~620 ms). Every drawn transition asks `motionMs` for its length, and the
 * celebrations ask `reducedMotion` whether to run at all. Read when asked, so
 * changing the preference applies to the next transition, no reload. */
const reducedMotion = () => {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (error) {
    return false;
  }
};
const motionMs = (ms) => (reducedMotion() ? 0 : ms);

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

/* 3px out and back, once. Named for what it is rather than for "shake" —
 * a shake is a thing that repeats, and this does not. */
const fieldNudge = keyframes`
  0% { transform: translateX(0); }
  35% { transform: translateX(-3px); }
  70% { transform: translateX(3px); }
  100% { transform: translateX(0); }
`;

/* **A number field that has just refused a character, said in the field.**
 *
 * One fragment rather than a rule per input, for the reason `themedScrollbar`
 * is one: there are six styled number inputs across three files and they had
 * each solved nothing, so a refusal looked like a key that had not registered.
 *
 * It is a **border and a nudge, not a shake**: this is a new-tab page, so
 * nothing here animates geometry — the movement is a transform on a control
 * the pointer is already inside, it runs once, and it is 3px, which reads as
 * "that did not go in" without becoming a thing to wait out. Under
 * `prefers-reduced-motion` the colour does the whole job. The message itself
 * goes where each screen already keeps its notes; this is what points at the
 * box the message is about. */
const refusedField = css`
  &[aria-invalid="true"] {
    border-color: ${({ theme: t }) => t.color.chartLineRed};
    animation: ${fieldNudge} 0.22s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    &[aria-invalid="true"] {
      animation: none;
    }
  }
`;

/* **A finger needs more than a glyph.** On a touch screen — `pointer: coarse`
 * is the phone app, and a tablet running the extension — a 14px × or a 15px
 * "?" is a miss more often than a hit (Apple asks for 44pt; the audit in the
 * phone QA found eleven controls under 20px). The control keeps its look; an
 * invisible box centred on it, never smaller than 36px a side, takes the
 * press. A mouse sees nothing of this. `touchBox` is the box alone, for a
 * control that is already positioned; `touchTarget` positions it too. */
const touchBox = css`
  @media (pointer: coarse) {
    &::after {
      content: "";
      position: absolute;
      left: 50%;
      top: 50%;
      width: max(100%, 36px);
      height: max(100%, 36px);
      transform: translate(-50%, -50%);
    }
  }
`;

const touchTarget = css`
  @media (pointer: coarse) {
    position: relative;
  }
  ${touchBox};
`;

/* The gutter the folder tabs ride in, between the window's left edge and a
 * drawer's own edge (24 Sep 2026). The drawers start after it, so the tabs
 * sit on the drawer's spine rather than on top of what it holds.
 *
 * It was 6.5rem while the names ran across the strip: wide enough for the
 * longest of them, "Base rates" at 88px. Since 25 Sep 2026 they run along it
 * (PanelTab's writing-mode), so the strip is one line of type wide — the
 * raised tab measures 30px at 1280, 1.875rem — and 2.25rem leaves the drawer
 * a hair of air past it. Both are rem, so they grow together with the text.
 *
 * **It lives here rather than in config.js**, which is where the rest of the
 * chrome's numbers are: the fragment below interpolates it, and a styled
 * template evaluates its interpolations the moment the file loads — theme.js
 * is the second script on the page and config.js the seventh. */
const CHROME_SPINE_REM = 2.25;

/* **The screens stand clear of their column** (26 Sep 2026, *"sağdaki bir
 * şey yani setting vs açıkken o sağ kenarlık kapanmasın, sürekli açık
 * kalsın"*). With a screen open, the screens' column stays out on the right
 * edge, so every screen's frame ends where the column begins. `right`
 * rather than a padding: each screen keeps its own padding and centring and
 * simply lays out in a window one column narrower, and nothing of it is
 * ever under a tab. The gutter itself is painted by ScreenRail. Not on a
 * phone, where the column hangs from the foot and is pulled out by hand. */
const besideScreenSpine = css`
  @media (min-width: 601px) {
    right: ${CHROME_SPINE_REM}rem;
  }
`;

/* THE DRAWER BESIDE THE CHART, AND WHY YOU CAN SEE THROUGH IT.
 *
 * Three panels share this surface: the chart's own switches, price targets
 * and calls. All three are *about the line on screen* — a target is a price
 * on that axis, a call is a box drawn on that board — and a panel that
 * covers the chart while you set one is asking you to remember what it just
 * hid. Asked for on 23 Sep 2026: *"targets calls ve the chart'in opak
 * olmamasi seffaf olmasi ama chart'in ayarlari gibi gelmesi"*.
 *
 * The other panels went the opposite way on the same day. News, the base
 * rates, the portfolio, the derivatives page and Settings are opaque screens
 * with nothing behind them, because none of them is about the line — reading
 * a headline through a price chart is two things competing. **That split is
 * the rule**: a panel that changes what the chart shows is see-through and
 * beside it; a panel that replaces what you are reading takes the screen.
 *
 * 0.84 rather than the 0.97 the chart's drawer carried. At 0.97 the drawer
 * was translucent only on paper: the price line under it resolved to about
 * three parts in a hundred, which is a smudge nobody reads as a chart. At
 * 0.84 the line is legibly there and body text on top of it still sits at
 * better than 12:1 against the app's own ink.
 *
 * **No backdrop blur.** A blurred backdrop over a chart that redraws — and
 * this one redraws on every refresh and every range change — repaints the
 * whole drawer each frame, which is the one thing a new tab page must not
 * spend. Flat alpha costs nothing and keeps the line honest rather than
 * smeared.
 *
 * It carries no width: a drawer is as wide as what it holds, and its owner
 * says so. It carries no entrance either — the chart's drawer stays mounted
 * and slides on a prop, the alerts panel is mounted when it opens and
 * animates in, and those cannot be the same declaration.
 */
const chartDrawerSurface = css`
  position: fixed;
  /* **Top to bottom, over the ticker** (25 Sep 2026, *"en yukarıdan aşağıya
     kadar kaplayacak, yani üstten akan tickerların da üstünde olacak"*). It
     started at 4.5rem so the corner controls above it stayed reachable; the
     four controls it had to clear are the folder tabs now, on its own edge,
     so the drawer takes the window's height like a sheet and the page
     ticker keeps scrolling underneath it. */
  top: 0;
  bottom: 0;
  /* **Docked to its tabs.** The left edge is the tab column's right edge —
     CHROME_SPINE_REM, no gap — and that edge has no border and no rounding,
     because the open tab is the rest of this box: a line between them would
     draw a folder and its own tab as two things. The corners on the open
     side keep the radius. */
  left: ${CHROME_SPINE_REM}rem;
  /* The front layer: over the page ticker (90), the corner controls (140),
     the swap veil (145) and the screens' strip (150). Only the drawers' own
     tabs (170) are above it, since the open one is drawn joined to it. */
  z-index: 160;
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-left: none;
  border-radius: 0 ${({ theme }) => theme.scale * 8}rem ${({ theme }) => theme.scale * 8}rem 0;
  /* **See-through only where the chart is what is behind it.**
     Below 1025px the widget rail stops being a column down the left and
     becomes a row along the foot — which lands under the lower half of a
     drawer. Measured at 1000x760 with two cards on: "Couldn't load this one"
     read straight through the target form. The chart runs under the drawer
     above 600px and sits above it on a phone, so at those sizes transparency
     shows the one thing it must not: another panel's text under this one's. */
  background: ${({ theme }) => theme.color.bg};

  /* **Solid over the page's text, glass over the chart** (27 Sep 2026).
     Flat 0.84 all the way down let the price readout, the stats row and the
     range buttons show through the drawer's own text — the design audit
     read "…overnight.1H 1D" out of the targets drawer's empty state. The
     chart is what the glass is for, so it starts at the chart's top edge
     (--plot-top, measured by the app as a drawer opens) and eases in over
     a rem; above it the drawer is as solid as any panel. Unmeasured, the
     variable is 0 and the drawer is the glass it always was. */
  @media (min-width: 1025px) {
    background: ${({ theme }) => {
      const glass = theme.color.bg === "#ffffff" ? "rgba(255, 255, 255, 0.84)" : "rgba(5, 5, 5, 0.84)";
      return `linear-gradient(to bottom, ${theme.color.bg} 0, ${theme.color.bg} var(--plot-top, 0px), ${glass} calc(var(--plot-top, 0px) + 1rem), ${glass} 100%)`;
    }};
  }

  box-shadow: 0 18px 50px ${({ theme }) => theme.color.shadow};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.primary};
`;

/* The same drawer on a phone, where there is no room for a chart beside it:
 * it takes the width and the chart keeps the height above it. Top goes back
 * to auto, since nothing is beside the corner controls at this width.
 *
 * **It is a second fragment, and it has to be.** A media query adds no
 * specificity, so a plain `width` written after this block would win inside
 * it as well — the drawer would stay 26rem wide and anchored to both edges
 * of a phone. Interpolated *after* the owner's own width, the override lands
 * in the order it is written. */
const chartDrawerPhone = css`
  @media (max-width: 600px) {
    width: auto;
    /* Beside the tabs, which stay on the left edge at every width. */
    left: ${CHROME_SPINE_REM}rem;
    right: ${({ theme }) => theme.spacing.medium}rem;
    top: auto;
    height: auto;
    max-height: 70vh;
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

