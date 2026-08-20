// Render test — does the chart actually draw?
//
// Everything else in tests/ runs the source in jsdom or a vm context, which
// can verify logic but cannot tell you whether D3 produced a path. The most
// intricate and most frequently changed code in this project (LineBase's grid
// geometry, the square-cell pitch, the comparison overlay, the call boxes)
// fails in exactly the way jsdom cannot see: the source is fine, the screen is
// blank.
//
// Two deliberate design choices:
//
//   1. Loaded over file:// rather than as an installed extension. PriceTab has
//      no background service worker (zero permissions, newtab override only),
//      and without one there is no reliable way to discover the extension ID
//      from Playwright. Nothing in index.html touches a chrome.* API — only
//      src/rate.js does, and that is the toolbar popup — so a file:// load
//      exercises the same code the new tab does.
//
//   2. The network is stubbed, not used. A test that calls Coinbase fails when
//      Coinbase is slow, rate-limits, or moves a field, and then everyone
//      learns to ignore it. Every request is fulfilled from a fixture here, so
//      a failure means the rendering broke.
//
// Skips (exit 0) when the browser is not installed, so `npm test` stays usable
// without a 100 MB download:
//   npm --prefix tests exec -- playwright install chromium --no-shell
const path = require("path");

// Keep the browser inside tests/node_modules (which is gitignored) instead of
// the shared ~/Library cache, so the checkout stays self-contained and nothing
// large lands in the user's home directory. Must be set before playwright is
// required — it reads this at load time.
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

const ROOT = path.join(__dirname, "..");
const INDEX = "file://" + path.join(ROOT, "index.html");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("• render test skipped: playwright not installed");
  process.exit(0);
}

// --- fixtures -----------------------------------------------------------
// A gently rising series: enough points for the line, the candles and the
// grid to have something to lay out, and a shape that is obviously not flat.
const NOW = Math.floor(Date.now() / 1000);
const PRICES = Array.from({ length: 120 }, (_, i) => ({
  price: (40000 + i * 25 + (i % 7) * 60).toFixed(2),
  time: NOW - (120 - i) * 3600,
}));

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*" },
  body: JSON.stringify(body),
});

const fail = (msg) => {
  console.error(`✘ ${msg}`);
  process.exitCode = 1;
};

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  } catch (e) {
    console.log(`• render test skipped: no browser binary (${e.message.split("\n")[0]})`);
    process.exit(0);
  }

  const context = await browser.newContext();
  const consoleErrors = [];
  let historyRequests = 0;

  // Fulfil the two price endpoints; refuse everything else outright so a new
  // provider slipping into the code shows up here as a failure rather than as
  // a silent extra request from the new tab page.
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("file://")) return route.continue();
    if (url.includes("/prices/") && url.includes("historic")) {
      historyRequests++;
      return route.fulfill(json({ data: { prices: PRICES } }));
    }
    if (url.includes("/prices/") && url.includes("spot")) {
      return route.fulfill(json({ data: { amount: "43250.50", currency: "USD" } }));
    }
    // Widgets, news and tickers are all off on a fresh profile; anything else
    // that fires gets an empty answer rather than real network access.
    return route.fulfill(json({ data: {} }));
  });

  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(INDEX, { waitUntil: "load" });

  // --- 1. the chart draws ------------------------------------------------
  let d = null;
  try {
    const pathEl = await page.waitForSelector("svg path", { timeout: 15000 });
    d = await pathEl.getAttribute("d");
  } catch {
    fail("no <svg path> ever appeared — the chart did not render");
  }
  if (d && d.length > 20) {
    console.log(`✔ chart path rendered (${d.length} chars of path data)`);
  } else if (d !== null) {
    fail(`chart path is empty or degenerate: ${JSON.stringify(d)}`);
  }

  // --- 2. the price readout renders --------------------------------------
  const bodyText = await page.textContent("body");
  if (/\d/.test(bodyText || "")) {
    console.log("✔ price readout rendered");
  } else {
    fail("page rendered no numbers at all");
  }

  // --- 3. it asked for history exactly the way we expect ------------------
  if (historyRequests > 0) {
    console.log(`✔ historic endpoint requested (${historyRequests}x)`);
  } else {
    fail("the page never requested a price history");
  }

  // --- 4. nothing threw ---------------------------------------------------
  // A load-order mistake in index.html surfaces here and nowhere else.
  const realErrors = consoleErrors.filter(
    (e) => !/favicon|ERR_FILE_NOT_FOUND|net::ERR_FAILED/i.test(e),
  );
  if (realErrors.length === 0) {
    console.log("✔ no console errors on load");
  } else {
    fail(`${realErrors.length} console error(s) on load:`);
    realErrors.slice(0, 5).forEach((e) => console.error(`    ${e.slice(0, 200)}`));
  }

  await browser.close();

  if (process.exitCode) {
    console.error("\n✘ RENDER TEST FAILED");
  } else {
    console.log("ALL RENDER TESTS PASSED");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
