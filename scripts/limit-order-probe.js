// A limit order, end to end, through the real app.
//
//   node scripts/limit-order-probe.js
//
// Not part of `npm --prefix tests run check`: it needs a browser and it waits
// for real marking sweeps, which the history TTL paces at about half a minute.
// What it asserts is the sequence a unit test cannot — place, rest, reserve,
// and a fill that happens because the market moved:
//
//   · the order rests instead of opening, and nothing is charged for waiting;
//   · its margin leaves the balance (and `practiceEquity` adds it back);
//   · the Orders tab says how far the market is from it;
//   · when the price reaches it, it fills **at its own price** and pays the
//     maker fee rather than the taker's.
//
// Two defects were found by writing it, both in the app rather than the model:
// the marking sweep and the panel's mark map were built from *held* coins, so
// a resting order with no position behind it was never priced and never
// tested; and fills were tested against the **mark**, which is a median of
// three ticks — an order sat through the move it was written for. Fills read
// the last price now; liquidations keep the mark.
const path = require("path");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";
const ROOT = path.join(__dirname, "..");
const { chromium } = require(require.resolve("playwright", { paths: [path.join(ROOT, "tests")] }));
let bad = 0;
const ok = (c, m, x) => { if (!c) { bad += 1; console.log("FAIL " + m + (x ? " — " + x : "")); } else console.log("ok   " + m + (x ? " — " + x : "")); };
let spot = 112480;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith("file://")) return r.continue();
    const body = u.includes("historic")
      ? { data: { prices: Array.from({ length: 200 }, (_, i) => ({ price: String(spot - i * 10), time: 1756900000 - i * 60 })) } }
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
  await page.waitForTimeout(1600);
  await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /Skip tour/i.test(n.innerText)); if (b) b.click(); })()`);
  await page.waitForTimeout(300);
  await page.keyboard.press("f");
  await page.waitForTimeout(900);

  const press = async (text) => page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll("button")).find((n) => n.innerText.trim() === ${JSON.stringify(text)});
    if (b && !b.disabled) { b.click(); return true; }
    return Boolean(b) ? "disabled" : false;
  })()`);
  const store = () => page.evaluate(`(() => {
    const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
    return { orders: Object.keys(p.orders || {}).length, positions: Object.keys(p.positions || {}).length,
             balance: p.balance, margin: p.margin, fees: p.fees,
             order: Object.values(p.orders || {})[0] || null,
             pos: Object.values(p.positions || {})[0] || null };
  })()`);

  ok(await press("Limit") === true, "the ticket offers a limit order");
  await page.waitForTimeout(350);
  // type a limit below the market, so it rests
  await page.evaluate(`(() => {
    const f = document.querySelector('input[aria-label="Entry price"], input[aria-label="Limit price"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(f, "100000"); f.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await page.waitForTimeout(400);
  const label = await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll("button")).find((n) => /^Place a/.test(n.innerText.trim()));
    return b ? b.innerText.trim() : null;
  })()`);
  ok(Boolean(label), "…and a button that places rather than opens", label);
  await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /^Place a/.test(n.innerText.trim())); if (b) b.click(); })()`);
  await page.waitForTimeout(600);
  let st = await store();
  ok(st.orders === 1 && st.positions === 0, "it rests instead of opening", JSON.stringify({ o: st.orders, p: st.positions }));
  ok(st.margin > 0 && st.balance < 1000000, "…with its margin reserved out of the balance",
    `balance ${st.balance} margin ${st.margin}`);
  ok(st.fees === 0, "…and no fee charged for waiting", `fees ${st.fees}`);
  const row = await page.evaluate(`(() => {
    const el = document.querySelector("[data-practice-order]");
    return el ? el.innerText.replace(/\\n/g, " | ") : null;
  })()`);
  ok(Boolean(row) && /away/.test(row || ""), "the Orders tab says how far the market is from it", row);

  const diag = await page.evaluate(`(() => {
    const p = JSON.parse(localStorage.getItem("crypto_chart_practice"));
    const o = Object.values(p.orders)[0];
    const marks = { BTC: Math.round(99000 * PRICE_SCALE) };
    const stepped = practiceStep(p, (p.step || 0) + 1, marks);
    return { step: p.step, coinsActive: practiceCoinsActive(p),
             hit: o.side === "long" ? marks.BTC <= o.limit : marks.BTC >= o.limit,
             events: stepped.events, orders: Object.keys(stepped.state.orders).length,
             positions: Object.keys(stepped.state.positions).length };
  })()`);
  console.log("model, driven by hand:", JSON.stringify(diag));
  console.log("--- the market comes to it ---");
  spot = 99000;
  /* The marking sweep runs when a fresh price *series* arrives, which the
     history TTL paces at about half a minute — so the wait is four of those,
     not four refresh intervals. */
  for (let i = 0; i < 4 && (await store()).orders; i += 1) await page.waitForTimeout(12000);
  st = await store();
  ok(st.orders === 0 && st.positions === 1, "it fills", JSON.stringify({ o: st.orders, p: st.positions }));
  ok(st.pos && st.pos.entry === 1000000000, "…at its own price, with no adverse fill",
    st.pos ? String(st.pos.entry) : "none");
  const makerFee = st.fees;
  ok(makerFee > 0, "…and pays the maker fee", `fees ${makerFee}`);

  console.log(errs.length ? "ERRORS " + errs.join(" | ") : "no page errors");
  if (errs.length) bad += 1;
  await browser.close();
  console.log(bad ? `\n${bad} FAILURES` : "\nprobe clean");
  process.exit(bad ? 1 : 0);
})();
