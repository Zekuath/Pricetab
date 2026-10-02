// Runs every test suite plus a syntax check over src/.
// Usage: node tests/run-all.js
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let failed = false;

const step = (label, fn) => {
  try {
    fn();
    console.log(`✔ ${label}`);
  } catch (e) {
    failed = true;
    console.error(`✘ ${label}`);
    if (e.stdout) process.stderr.write(e.stdout);
    if (e.stderr) process.stderr.write(e.stderr);
  }
};

for (const f of fs.readdirSync(path.join(ROOT, "src")).filter((f) => f.endsWith(".js"))) {
  step(`syntax: src/${f}`, () =>
    execFileSync("node", ["--check", path.join(ROOT, "src", f)]),
  );
}

const suites = [
  "test-invariants.js",
  "test-load.js",
  "test-storage.js",
  "test-i18n.js",
  "test-api.js",
  "test-provider.js",
  "test-cache.js",
  "test-bulk.js",
  "test-portfolio.js",
  "test-portfolio-chart.js",
  "test-onboarding.js",
  "test-settings.js",
  "test-chart.js",
  // The chart's axes: ticks, time labels and the lane allocator, on real d3.
  "test-axes.js",
  // The chart's window in time: the window arithmetic, the cut series, LTTB.
  "test-viewport.js",
  // The chart's tools: the ruler's count, hit distances, a drawing moved.
  "test-tools.js",
  // The chart's counted studies: profile, unusual volume, regimes, turns, where.
  "test-studies.js",
  // The palettes: contrast in both themes and palettes, up/down apart for colour-blind readers.
  "test-palette.js",
  // The positions model behind Calls: pure arithmetic, no DOM and no clock.
  "test-practice-model.js",
  "test-practice-fuzz.js",
  "test-tax-report.js",
  // The portfolio's ledger: records in date order, and the return with the
  // money moved in and out taken out of it.
  "test-portfolio-ledger.js",
  "test-crowd.js",
  // The candlestick shapes, and the counting rule they are read through.
  "test-candle-patterns.js",
  "test-price-patterns.js",
  "test-strategy-setups.js",
  "test-companion-readings.js",
  "test-regime-grid.js",
  "test-cell-odds.js",
  "test-model-outlook.js",
  "test-news-reader.js",
  // The outlook: counted readings of the next stretch, before a contract.
  "test-outlook.js",
  // The assistant: facts a desk checks, in three phases, never a verdict.
  "test-assistant.js",
  "test-quickswitch.js",
  "test-alerts.js",
  "test-calls.js",
  "test-d3.js",
  "test-smoke-jsdom.js",
  // Real browser, real D3. Skip themselves (exit 0) when Playwright or its
  // browser binary is absent, so these stay runnable on a bare checkout.
  "test-render.js",
  "test-calls-render.js",
  "test-modes-render.js",
  "test-polish-render.js",
  "test-i18n-render.js",
  "test-portfolio-chart-render.js",
  "test-transition-render.js",
];
/* Suites a checkout may or may not have: `tests/local-*.js` is git-ignored, so
 * these guard local working material rather than the extension and are simply
 * absent in CI. Sorted so the run order is the same everywhere. */
for (const f of fs.readdirSync(__dirname).sort()) {
  if (/^local-.*\.js$/.test(f)) suites.push(f);
}

for (const suite of suites) {
  step(suite, () =>
    execFileSync("node", [path.join(__dirname, suite)], { stdio: "pipe" }),
  );
}

process.exit(failed ? 1 : 0);
