// Does the mark actually do its job? — a live check of the one thing the mark
// price exists for.
//
// Not part of `npm --prefix tests run check`: it needs a browser and it spends
// about ninety seconds waiting for real refresh ticks, because what it is
// testing is a *sequence* of prices rather than a function of one.
//
//   node scripts/mark-probe.js
//
// It opens a 50x long, lets the market sit, then delivers one 3% print against
// it and asserts the position is still there — a venue marks on an index and
// does not liquidate you on a single bad trade. Then it holds that price and
// asserts the position does go, because a move is not a print.
//
// Two defects were found by writing it, both in the wiring rather than in the
// arithmetic: the tick ring was filled by the first marking sweep (so a
// contract opened seconds before a spike had no smoothing at all and was
// liquidated by it — the ledger read `liquidation@109,045` after a single
// step), and a partly-filled ring made a median of two, which picks one of
// them arbitrarily and would have protected a long while feeding a short to
// the same print. The ring is seeded at open and filled whole; see
// `markTick` and `openPractice` in `src/app-calls.js`.
// sustained move still take it? Driven through the real app on a 10s refresh.
const path = require("path");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";
const ROOT = "/Users/zekuath/Desktop/Repository/Pricetab";
const { chromium } = require(require.resolve("playwright", { paths: [path.join(ROOT, "tests")] }));
let bad = 0;
const ok = (c, m, x) => { if (!c) { bad += 1; console.log("FAIL " + m + (x ? " — " + x : "")); } else console.log("ok   " + m + (x ? " — " + x : "")); };

let spot = 112480;   // the price the stub answers with, changed as the probe runs
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith("file://")) return r.continue();
    const body = u.includes("historic")
      ? { data: { prices: Array.from({ length: 200 }, (_, i) => ({ price: String(112480 - i * 10), time: 1756900000 - i * 60 })) } }
      : { data: { amount: String(spot), currency: "USD" } };
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await ctx.addInitScript(
    'localStorage.setItem("crypto_chart_practice_enabled","true");' +
    'localStorage.setItem("crypto_chart_practice_consent","true");' +
    'localStorage.setItem("crypto_chart_onboarding_seen","true");' +
    'localStorage.setItem("crypto_chart_practice_basic","false");' +
    'localStorage.setItem("crypto_chart_refresh_interval","10000");');
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.goto("file://" + path.join(ROOT, "index.html"), { waitUntil: "load" });
  await page.waitForTimeout(1800);
  await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /Skip tour/i.test(n.innerText)); if (b) b.click(); })()`);
  await page.waitForTimeout(400);
  await page.keyboard.press("f");
  await page.waitForTimeout(1000);

  // a 50x long: liquidation sits about 1.7% away, so a 3% print is past it
  await page.evaluate(`(() => {
    const f = document.querySelector('input[inputmode="numeric"][aria-label^="Leverage"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(f, "50"); f.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await page.waitForTimeout(400);
  await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /^Open long/.test(n.innerText.trim())); if (b) b.click(); })()`);
  await page.waitForTimeout(700);

  const held = async () => page.evaluate(`(() => {
    const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
    return Object.keys(p.positions || {}).length;
  })()`);
  const why = async () => page.evaluate(`(() => {
    const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
    return { step: p.step, ledger: (p.ledger || []).map((e) => e.kind + "@" + (e.fill || 0)) };
  })()`);
  const liqPct = await page.evaluate(`(() => (document.body.innerText.match(/([\\d.]+)% away/) || [])[1] || null)()`);
  ok(await held() === 1, "a 50x long is running", `liquidation ${liqPct}% away`);

  // let the ring fill at the true level
  await page.waitForTimeout(11000);
  await page.waitForTimeout(11000);

  console.log("--- one bad print, 3% down ---");
  spot = 109100;
  await page.waitForTimeout(11000);
  const afterSpike = await held();
  /* The detail rows live inside the card, and a collapsed card's innerText is
     empty — so open it before reading, or this measures the fold rather than
     the feature. */
  await page.evaluate(`(() => {
    const head = Array.from(document.querySelectorAll("button[aria-expanded]"))
      .find((b) => /#[0-9]/.test(b.innerText));
    if (head && head.getAttribute("aria-expanded") === "false") head.click();
  })()`);
  await page.waitForTimeout(400);
  const rows = await page.evaluate(`(() => {
    const card = Array.from(document.querySelectorAll("[data-practice-detail]"))
      .find((n) => n.innerText.trim());
    const t = card ? card.innerText : "";
    return { detail: t.replace(/\\n/g, " | ").slice(0, 160),
             mark: (t.match(/MARK\\n([^\\n]+)/i) || [])[1],
             last: (t.match(/LAST\\n([^\\n]+)/i) || [])[1] };
  })()`);
  ok(afterSpike === 1, "…does not liquidate the position", JSON.stringify(rows) + " " + JSON.stringify(await why()));
  ok(Boolean(rows.last) && rows.last !== rows.mark, "…and the card shows mark and last apart", JSON.stringify(rows));

  console.log("--- the print comes back ---");
  spot = 112480;
  await page.waitForTimeout(11000);
  ok(await held() === 1, "…and the position is still there once it does");

  console.log("--- a sustained 3% move ---");
  spot = 109100;
  await page.waitForTimeout(11000);
  await page.waitForTimeout(11000);
  await page.waitForTimeout(11000);
  const afterMove = await held();
  ok(afterMove === 0, "…is a liquidation, as it should be", `positions: ${afterMove}`);

  console.log(errs.length ? "PAGE ERRORS: " + errs.join(" | ") : "no page errors");
  if (errs.length) bad += 1;
  await browser.close();
  console.log(bad ? `\n${bad} FAILURES` : "\nprobe clean");
  process.exit(bad ? 1 : 0);
})();
