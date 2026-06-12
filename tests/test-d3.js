// Real-API test: load the custom d3 bundle + d3-interpolate-path (no stubs)
// and exercise every d3 API the app uses.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const vm = require("vm");
const assert = require("assert");

const sandbox = { console, Date, Math, setTimeout, clearTimeout };
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "vendor", "d3-custom.min.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "vendor", "d3-interpolate-path.min.js"), "utf8"), sandbox);

const d3 = vm.runInContext("d3", sandbox);

// Every name destructured in src/theme.js must exist
for (const name of ["easeCubicOut", "extent", "interpolatePath", "line", "scaleLinear", "scaleTime", "select"]) {
  assert.strictEqual(typeof d3[name], "function", `d3.${name} exists`);
}

// line generator with accessors → SVG path string (utils.js lineFromPrices)
const gen = d3.line().x((p) => p[0]).y((p) => p[1]);
assert.strictEqual(gen([[0, 0], [10, 5], [20, 3]]), "M0,0L10,5L20,3", "line path");

// scales (utils.js scalePricesCore)
const sl = d3.scaleLinear().domain([0, 100]).range([0, 1]);
assert.strictEqual(sl(50), 0.5, "scaleLinear maps");
const st = d3.scaleTime().domain([new Date(0), new Date(1000)]).range([0, 1]);
assert.strictEqual(st(new Date(500)), 0.5, "scaleTime maps");

// extent (utils.js)
assert.strictEqual(JSON.stringify(d3.extent([3, 1, 2])), "[1,3]", "extent");

// easing (chart.js transitions)
assert.strictEqual(d3.easeCubicOut(1), 1, "easeCubicOut");
assert.ok(d3.easeCubicOut(0.5) > 0.5, "easeCubicOut curve");

// selection.transition patched by d3-transition (chart.js .transition() chains)
assert.strictEqual(typeof d3.selection.prototype.transition, "function", "selection.transition");
for (const m of ["duration", "ease", "attrTween", "attr"]) {
  assert.strictEqual(typeof d3.transition.prototype[m], "function", `transition.prototype.${m}`);
}

// interpolatePath (chart.js attrTween morphing)
const ip = d3.interpolatePath("M0,0L10,10", "M0,0L20,20");
assert.strictEqual(typeof ip, "function", "interpolatePath returns interpolator");
assert.strictEqual(typeof ip(0.5), "string", "interpolator yields path string");

console.log("ALL D3 BUNDLE TESTS PASSED");
