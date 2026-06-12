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

