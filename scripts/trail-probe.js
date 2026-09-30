/* **A trailing stop, from the screen it is set on.**
 *
 * The model's own suite proves the arithmetic; this proves the wiring: the
 * chips are on the editor, saving one stores it, the anchor is seeded at the
 * price when it was saved rather than at the contract's peak, the level
 * ratchets and the contract closes on it. It walks the real panel in a real
 * browser, so every one of those is a press and not a call.
 *
 * Run it: node scripts/trail-probe.js
 */
const path = require("path");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";
const ROOT = path.join(__dirname, "..");
const { chromium } = require(require.resolve("playwright", { paths: [path.join(ROOT, "tests")] }));
const INDEX = "file://" + path.join(ROOT, "index.html");

const NOW_S = Math.floor(Date.now() / 1000);
const series = (at) =>
  Array.from({ length: 120 }, (_, i) => ({ price: at.toFixed(2), time: NOW_S - (120 - i) * 30 }));
const json = (b) => ({
  status: 200, contentType: "application/json",
  headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b),
});

let failed = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`  ✔ ${label}`);
  else { failed++; console.error(`  ✘ ${label}${detail ? " — " + detail : ""}`); }
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  /* The price the stubbed feed answers with, moved between reloads-free
     refreshes so the panel marks a moving market. */
  let price = 100000;
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith("file://")) return r.continue();
    if (u.includes("historic")) return r.fulfill(json({ data: { prices: series(price) } }));
    if (u.includes("spot"))
      return r.fulfill(json({ data: { amount: price.toFixed(2), currency: "USD" } }));
    return r.fulfill(json({}));
  });
  await ctx.addInitScript(
    'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
    'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
    'localStorage.setItem("crypto_chart_practice_basic", "false");' +
    'localStorage.setItem("crypto_chart_refresh_interval", "10000");' +
    'localStorage.setItem("crypto_chart_practice_consent", "true");');
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(INDEX, { waitUntil: "load" });
  await page.waitForTimeout(1500);

  const press = (re) =>
    page.evaluate(
      "(() => { const b = Array.from(document.querySelectorAll('button')).find((n) => " +
      re + ".test(n.innerText.trim())); if (b) b.click(); return Boolean(b); })()");
  const pos = () =>
    page.evaluate(
      "(() => { const s = JSON.parse(localStorage.getItem('crypto_chart_practice') || 'null');" +
      "  const p = s && s.positions && Object.values(s.positions)[0];" +
      "  return p ? { trail: p.trail, from: p.trailFrom, entry: p.entry } : null; })()");
  /* Move the market and wait for the panel to actually mark the new price.
     **Longer than the refresh interval**: a spot price is cached for
     `CACHE_TTL` (30s) and the ticker snapshot the marking sweep actually
     reads for `PAGE_TICKER_TTL` (60s), so a refresh inside those windows
     re-reads the same number and the market has not moved at all — which is
     what the first two versions of this probe measured, one of them missing
     every other move and reporting it as the trail's fault.

     A mark at a price that has *not* changed needs none of that: the sweep
     runs on the refresh tick with whatever price it holds, which is what
     `settle` waits for. */
  const moveTo = async (next) => { price = next; await page.waitForTimeout(70000); };
  const settle = () => page.waitForTimeout(12000);

  /* A tab button carries its count on a second line, so the whole label is
     never the word. */
  const tab = (name) =>
    page.evaluate(
      "(() => { const want = " + JSON.stringify(name) + ";" +
      "  const b = Array.from(document.querySelectorAll('button')).find((n) =>" +
      "    n.innerText.trim().split(String.fromCharCode(10))[0] === want);" +
      "  if (b) b.click(); return Boolean(b); })()");

  await page.keyboard.press("f");
  await page.waitForTimeout(800);
  check(await press("/^25%$/"), "the ticket offers a size");
  await page.waitForTimeout(200);
  check(await press("/Open long on/"), "…and opens a long");
  await page.waitForTimeout(900);

  /* Up to 120k, then back to 110k, before any trail exists. */
  await moveTo(120000);
  await moveTo(110000);
  const ran = await page.evaluate(
    "(() => { const s = JSON.parse(localStorage.getItem('crypto_chart_practice') || 'null');" +
    "  const p = s && Object.values(s.positions)[0]; return p ? p.peak : 0; })()");
  check(ran >= 1190000000, "the contract has seen a peak it has since given back", String(ran));

  check(await tab("Positions"), "the positions tab is reachable");
  await page.waitForTimeout(400);
  check(await press("/^Stop \\/ TP$/"), "…and the row opens its trigger editor");
  await page.waitForTimeout(300);
  const chips = await page.evaluate(
    "(() => { const box = document.querySelector('[data-practice-trail]');" +
    "  return box ? Array.from(box.querySelectorAll('button')).map((b) => b.innerText.trim()) : null; })()");
  check(
    Array.isArray(chips) && chips.join(",") === "off,1%,2%,5%,10%",
    "the editor offers the trail, off first",
    JSON.stringify(chips),
  );
  await page.evaluate(
    "(() => { const box = document.querySelector('[data-practice-trail]');" +
    "  const b = Array.from(box.querySelectorAll('button')).find((n) => n.innerText.trim() === '5%');" +
    "  b.click(); })()");
  await page.waitForTimeout(200);
  check(await press("/^Save levels$/"), "…and the levels are saved");
  await page.waitForTimeout(600);

  let p = await pos();
  check(p && p.trail === 50000, "the trail is stored as 5%", JSON.stringify(p));

  /* One mark seeds the anchor — at the price now, not at the peak. */
  await settle();
  p = await pos();
  check(
    p && p.from === 1100000000,
    "the anchor is seeded where the price is, not at the peak it gave back",
    JSON.stringify(p),
  );
  check(Boolean(p), "…and the contract is still open, which is the point of that");

  /* Ratchet up, then come back through the level. */
  await moveTo(130000);
  p = await pos();
  check(p && p.from === 1300000000, "the anchor follows the price up", JSON.stringify(p));
  await moveTo(120000);
  /* **The ledger is the record.** There is no `closed` array — every account
     movement is an event with a `kind`, and a close records the reason as
     that kind. Reading a field that does not exist answers `undefined`
     forever, which is what the first run of this assertion did. */
  const gone = await page.evaluate(
    "(() => { const s = JSON.parse(localStorage.getItem('crypto_chart_practice') || 'null');" +
    "  const last = (s.ledger || []).slice(-1)[0] || null;" +
    "  return { open: Object.keys(s.positions).length," +
    "    kind: last && last.kind, fill: last && last.fill }; })()");
  check(gone.open === 0, "coming back through the trailing level closes the contract");
  check(gone.kind === "stop", "…recorded as a stop, which is what happened", JSON.stringify(gone));

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nTRAIL PROBE OK");
  process.exit(failed ? 1 : 0);
})();
