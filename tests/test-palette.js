// The palettes, read out of src/theme.js itself: every ink a figure is set
// in clears 4.5:1 on both grounds in both themes and both direction palettes,
// and the colour-blind palette keeps up and down apart under simulated
// protanopia and deuteranopia — the reason it exists (the chart plan's
// Phase 6). Numbers, not a look: a palette tweak that loses either fails here.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const tagged = () => {
  const fn = () => fn;
  fn.attrs = () => tagged();
  return new Proxy(fn, { get: (t, p) => (p in t ? t[p] : tagged()), apply: () => tagged() });
};
const styledStub = new Proxy(function styled() { return tagged(); }, {
  get: (t, p) => (p === "default" ? styledStub : tagged()),
  apply: () => tagged(),
});
const sandbox = {
  console,
  React: {},
  window: { styled: { css: tagged(), injectGlobal: tagged(), keyframes: tagged(), ThemeProvider: {}, withTheme: (c) => c, default: styledStub } },
  d3: {},
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "theme.js"), "utf8"), sandbox, { filename: "theme.js" });
const palette = (mode, name) => JSON.parse(JSON.stringify(vm.runInContext(`paletteColors(${JSON.stringify(mode)}, ${JSON.stringify(name)})`, sandbox)));

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// WCAG relative luminance and contrast
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Colour-blind simulation (Viénot, Brettel & Mollon 1999, linear RGB) and CIE76 ΔE
const SIM = {
  protan: [[0.11238, 0.88762, 0], [0.11238, 0.88762, 0], [0.00401, -0.00401, 1]],
  deutan: [[0.29275, 0.70725, 0], [0.29275, 0.70725, 0], [-0.02234, 0.02234, 1]],
};
const lab = (l) => {
  const X = 0.4124 * l[0] + 0.3576 * l[1] + 0.1805 * l[2];
  const Y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  const Z = 0.0193 * l[0] + 0.1192 * l[1] + 0.9505 * l[2];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X / 0.95047), f(Y), f(Z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const seen = (h, kind) => {
  const l = rgb(h).map(lin);
  if (!kind) return l;
  return SIM[kind].map((row) => Math.max(0, Math.min(1, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])));
};
const deltaE = (a, b, kind) => { const [p, q] = [lab(seen(a, kind)), lab(seen(b, kind))]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

for (const name of ["classic", "cvd"]) {
  for (const mode of ["light", "dark"]) {
    const c = palette(mode, name);
    for (const ground of ["bg", "bgSecondary"]) {
      for (const ink of ["text", "textSecondary", "chartLineGreen", "chartLineRed", "chartLine"]) {
        const r = contrast(c[ink], c[ground]);
        ok(r >= 4.5, `${name}/${mode}: ${ink} on ${ground} is ${r.toFixed(2)}:1 — type needs 4.5`);
      }
    }
    // The focus ring and the on-state: a non-text mark needs 3:1
    ok(contrast(c.accent, c.bg) >= 3, `${name}/${mode}: accent on bg ${contrast(c.accent, c.bg).toFixed(2)}:1 — a focus ring needs 3`);
  }
}

for (const mode of ["light", "dark"]) {
  const c = palette(mode, "cvd");
  for (const kind of ["protan", "deutan"]) {
    const d = deltaE(c.chartLineGreen, c.chartLineRed, kind);
    ok(d >= 60, `cvd/${mode}: up and down stay apart for ${kind} readers (ΔE ${d.toFixed(1)})`);
    const g = palette(mode, "classic");
    ok(d > deltaE(g.chartLineGreen, g.chartLineRed, kind) * 2,
      `…at least twice as far as green and red do (${deltaE(g.chartLineGreen, g.chartLineRed, kind).toFixed(1)})`);
  }
  // One hue, one meaning: the comparison's line is not the up colour
  ok(deltaE(c.chartLineGreen, c.chartLine, "deutan") >= 15, `cvd/${mode}: the comparison's line is not read as up`);
}
ok(palette("light", "none-such").bg === palette("light", "classic").bg, "an unknown palette is the classic one");

console.log(`✔ ${checks} palette checks`);
console.log("PALETTE TESTS OK");
