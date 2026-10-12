// Derivatives page audit — a random walk over every control the page offers,
// asking one question after each press: **is the page still there?**
//
// Not part of `npm --prefix tests run check`: it needs a browser, takes
// minutes, and takes a seed. It lives here because three defects in a row
// were reported that no targeted assertion could have caught, and all three
// were on a seam — a tab preference that outlived its subject, a liquidation
// search that threw on one settlement, an order the arithmetic could not
// carry. A walk like this finds that class on the first run; it found the
// third one after the first two were fixed.
//
//   node scripts/audit-futures.js [seed]
//
// A bounded 120-action version of this walk runs in
// `tests/test-polish-render.js` on a fixed seed. The second argument this
// script used to take — `coin`, pinning the account to coin settlement — went
// with coin-margined accounts (18 Sep 2026): `setPracticeSettlement` accepts
// only quote now, so there is no second shape to pin.
//
// The error boundary swallows a render throw, so a blank page is the symptom
// and there is no console error to look for. "Gone" only counts when it will
// not come back: some controls close the page on purpose.
const path = require("path");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";
const { chromium } = require(require.resolve("playwright", {
  paths: [path.join(__dirname, "..", "tests")],
}));
const INDEX = "file://" + path.join(__dirname, "..", "index.html");

const SEQ = [];
const seed0 = Number(process.argv[2] || 4242);
let seed = Number(process.argv[2] || 4242);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

/* **A market that answers as the venue does, and moves** (27 Sep 2026). The
   stub this walk had answered every host with one Coinbase-shaped body, and
   since the account became USDT-margined and priced by OKX's perpetual the
   ticket never had a quote: two seeds of 700 actions each "survived" having
   opened nothing (the coverage line read a field, `opened`, the model no
   longer writes, so it could not say so either). The price here is a walk
   the actions advance, with the odd gap, so orders fill, stops and takes
   fire and a leveraged contract can be liquidated. */
let px = 112480;
const tick = () => {
  const gap = rnd() < 1 / 15 ? (rnd() - 0.5) * 0.12 : (rnd() - 0.5) * 0.004;
  px = Math.max(1000, px * (1 + gap));
};
const okx = (data) => ({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ code: "0", data }) });
const answer = (u) => {
  const now = Date.now();
  if (u.includes("/market/ticker")) {
    return okx([{ instId: "BTC-USDT-SWAP", last: String(px), open24h: String(px * 0.98), high24h: String(px * 1.02), low24h: String(px * 0.97), ts: String(now) }]);
  }
  if (u.includes("/market/candles")) {
    const n = Number((u.match(/limit=(\d+)/) || [])[1]) || 100;
    return okx(Array.from({ length: n }, (_, i) => {
      const c = px * (1 + Math.sin(i / 7) * 0.01);
      return [String(now - i * 60000), String(c * 0.999), String(c * 1.003), String(c * 0.997), String(c), "10", "10", "1000", "1"];
    }));
  }
  if (u.includes("/market/history-candles") || u.includes("liquidation")) return okx([]);
  if (u.includes("/market/books")) {
    const sz = Number((u.match(/sz=(\d+)/) || [])[1]) || 16;
    return okx([{ asks: Array.from({ length: sz }, (_, i) => [String(px + 0.1 * (i + 1)), String(5 + i), "0", "1"]), bids: Array.from({ length: sz }, (_, i) => [String(px - 0.1 * i), String(6 + i), "0", "1"]), ts: String(now) }]);
  }
  if (u.includes("/market/trades")) return okx(Array.from({ length: 14 }, (_, i) => ({ px: String(px), sz: "2", side: i % 2 ? "buy" : "sell", ts: String(now - i * 1000) })));
  if (u.includes("/public/instruments")) return okx(["BTC", "ETH", "XRP", "LTC"].map((c) => ({ instId: `${c}-USDT-SWAP`, instType: "SWAP", ctVal: "0.01", tickSz: "0.1", lotSz: "1", minSz: "1", state: "live" })));
  if (u.includes("/public/funding-rate")) return okx([{ fundingRate: "0.0001", nextFundingTime: String(now + 3600e3), fundingTime: String(now + 3600e3) }]);
  if (u.includes("/public/open-interest")) return okx([{ oi: "1000", oiCcy: "10", ts: String(now) }]);
  return { status: 200, contentType: "application/json", body: JSON.stringify({ data: { amount: String(px), currency: "USD",
    prices: Array.from({ length: 200 }, (_, i) => ({ price: String(px * (1 + Math.sin(i / 9) * 0.01)), time: Math.floor(now / 1000) - i * 60 })) } }) };
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route("**/*", (r) => r.request().url().startsWith("file://") ? r.continue() : r.fulfill(answer(r.request().url())));
  await ctx.addInitScript('localStorage.setItem("crypto_chart_practice_enabled","true");localStorage.setItem("crypto_chart_practice_consent","true");localStorage.setItem("crypto_chart_onboarding_seen","true");');
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 900)));
  page.on("console", async (m) => {
    if (m.type() !== "error") return;
    errs.push("CONSOLE " + m.text().slice(0, 900));
    if (/safe integer|out of bounds/.test(m.text())) {
      try {
        const st = await page.evaluate(`(() => {
          const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
          return { settlement: p.settlement, startCollateral: p.startCollateral,
                   positions: Object.keys(p.positions || {}).map((c) => {
                     const q = p.positions[c];
                     return { c, qty: q.qty, entry: q.entry, lev: q.leverage, margin: q.margin };
                   }) };
        })()`);
        errs.push("STATE " + JSON.stringify(st));
      } catch (e) {
        errs.push("STATE unavailable: " + String(e).slice(0, 80));
      }
    }
  });
  await page.goto(INDEX, { waitUntil: "load" });
  await page.waitForTimeout(1800);
  // The tour owns the keyboard until it is dismissed; the stored flag alone
  // did not settle it in earlier probes, so dismiss it the way a person does.
  await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /Skip tour/i.test(n.innerText)); if (b) b.click(); })()`);
  await page.waitForTimeout(600);
  await page.keyboard.press("f");
  await page.waitForTimeout(900);

  const alive = () => page.evaluate(`(() => {
    const t = document.body.innerText;
    return ["New contract","Positions","Closed","Account"].filter((k)=>t.includes(k)).length >= 2;
  })()`);
  if (!(await alive())) { console.log("panel never opened"); await browser.close(); return; }

  const ACTS = 700;
  let broke = null;
  for (let i = 0; i < ACTS && !broke; i += 1) {
    const roll = rnd();
    const act = await page.evaluate(`(() => {
      const scope = document.querySelector("[data-practice-page]") || document.body;
      /* Buttons, and the book's levels, which are role=button rows. */
      const btns = Array.from(scope.querySelectorAll("button, [role='button']")).filter(
        (b) => !b.disabled && b.checkVisibility && b.checkVisibility({ checkVisibilityCSS: true }));
      const ins = Array.from(scope.querySelectorAll("input")).filter(
        (n) => !n.disabled && n.checkVisibility && n.checkVisibility({ checkVisibilityCSS: true }));
      const roll = ${roll};
      /* **Weighted toward trading.** Among a hundred and fifty controls the
         order button came up about once in two hundred presses, and a walk
         that never opens a contract has only tested the furniture. One
         press in ten is the order button when it can be pressed, one in
         twenty a level of the book. */
      const order = scope.querySelector("[data-practice-order-button]");
      if (roll < 0.1 && order && !order.disabled) {
        order.click();
        return "click " + JSON.stringify(order.innerText.trim().slice(0, 42));
      }
      const levels = Array.from(scope.querySelectorAll("[data-practice-book-row]"));
      if (roll >= 0.1 && roll < 0.15 && levels.length) {
        const l = levels[Math.floor(((roll - 0.1) / 0.05) * levels.length) % levels.length];
        l.click();
        return "book " + l.getAttribute("data-practice-book-row") + " " + l.getAttribute("data-price");
      }
      if (roll < 0.72 && btns.length) {
        const b = btns[Math.floor(roll / 0.72 * btns.length) % btns.length];
        const name = (b.getAttribute("aria-label") || b.innerText || "?").trim().slice(0, 42);
        b.click();
        return "click " + JSON.stringify(name);
      }
      if (ins.length) {
        const n = ins[Math.floor((roll - 0.72) / 0.28 * ins.length) % ins.length];
        const vals = ["", "0", "1", "5", "37", "201", "0.001", "999999999", "-4", "abc", "1e30", "0.00000001"];
        const v = vals[Math.floor(roll * 1000) % vals.length];
        const proto = n.type === "range" ? window.HTMLInputElement.prototype : window.HTMLInputElement.prototype;
        const set = Object.getOwnPropertyDescriptor(proto, "value").set;
        set.call(n, v);
        n.dispatchEvent(new Event("input", { bubbles: true }));
        return "type " + JSON.stringify((n.getAttribute("aria-label") || n.type).slice(0, 34)) + " = " + JSON.stringify(v);
      }
      return "nothing to do";
    })()`);
    SEQ.push(act);
    tick();
    await page.waitForTimeout(55);
    /* The terminal's seams, from the keyboard, now and then. */
    if (i % 23 === 11) {
      const key = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"][Math.floor(rnd() * 6)];
      const which = await page.evaluate(`(() => { const all = [...document.querySelectorAll("[data-splitter]")]; const n = all[${Math.floor(rnd() * 3)}]; if (!n) return null; n.focus(); return n.getAttribute("data-splitter"); })()`);
      if (which) {
        await page.keyboard.press(key);
        SEQ.push(`seam ${which} ${key}`);
      }
    }
    if (i % 37 === 36) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(160);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(420);
      await page.keyboard.press("f");
      await page.waitForTimeout(420);
      SEQ.push("— coin change + reopen —");
    }
    if (i % 149 === 148) {
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(1700);
      await page.keyboard.press("f");
      await page.waitForTimeout(700);
      SEQ.push("— reload —");
    }
    if (!(await alive())) {
      await page.keyboard.press("f");
      await page.waitForTimeout(320);
      if (!(await alive())) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        await page.keyboard.press("f");
        await page.waitForTimeout(420);
        if (!(await alive())) broke = act;
      }
    }
  }

  /* Coverage, so a green run is not just a walk that never went anywhere. */
  const seen = await page.evaluate(`(() => {
    const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
    const kinds = {};
    for (const e of p.ledger || []) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    return { contracts: (p.nextPosId || 1) - 1, orders: (p.nextOrderId || 1) - 1,
             open: Object.keys(p.positions || {}).length, resting: Object.keys(p.orders || {}).length,
             ledger: kinds };
  })()`);
  const tabs = {};
  for (const a of SEQ) { const m = a.match(/"(New contract|Positions|Closed|Account)"/); if (m) tabs[m[1]] = (tabs[m[1]] || 0) + 1; }
  console.log(broke ? "PANEL BLANKED after: " + broke : `seed ${seed0}: survived ${ACTS} actions`);
  console.log("  reached:", JSON.stringify(seen), "tabs:", JSON.stringify(tabs));
  if (broke) console.log("last 12 actions:\n  " + SEQ.slice(-12).join("\n  "));
  const real = errs.filter((e) => !/Failed to load resource|net::/i.test(e));
  console.log("errors:", real.length ? real.slice(0, 5) : "none");
  await browser.close();
})();
