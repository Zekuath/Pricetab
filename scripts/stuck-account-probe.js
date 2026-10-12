// The account that could not open a contract — kept, because it was reported
// three times and each fix was partial.
//
//   node scripts/stuck-account-probe.js
//
// It builds the exact shape that was stuck: a file written under an old schema,
// a plan still carrying the session contract quota, that quota met (50 opened),
// and the session *ended* by a loss stop. Then it reloads and asserts the
// account opens contract after contract, long and short, on the same market.
//
// What it guards, in order of how the complaint arrived:
//   1. the quota is gone from the plan on load, whatever the file says;
//   2. the loss stop is off, whatever it was set to;
//   3. an account a stop had ended is un-ended, because the rule that ended it
//      no longer exists;
//   4. the account's own history (`opened`) is kept — a count is a fact, and a
//      fact is not a rule.
//
// The migration lands in memory on load and reaches the file at the next write,
// which is why the shape is asserted after the first contract opens.
const path = require("path");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";
const ROOT = path.join(__dirname, "..");
const { chromium } = require(require.resolve("playwright", { paths: [path.join(ROOT, "tests")] }));
let bad = 0;
const ok = (c, m, x) => { if (!c) { bad += 1; console.log("FAIL " + m + (x ? " — " + x : "")); } else console.log("ok   " + m + (x ? " — " + x : "")); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route("**/*", (r) => r.request().url().startsWith("file://") ? r.continue()
    : r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ data: { amount: "112480.00", currency: "USD",
        prices: Array.from({length:200},(_,i)=>({price:String(112480-i*10),time:1756900000-i*60})) } }) }));
  await ctx.addInitScript(
    'localStorage.setItem("crypto_chart_practice_enabled","true");' +
    'localStorage.setItem("crypto_chart_practice_consent","true");' +
    'localStorage.setItem("crypto_chart_onboarding_seen","true");' +
    'localStorage.setItem("crypto_chart_practice_basic","false");');
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const open = async () => {
    await page.goto("file://" + path.join(ROOT, "index.html"), { waitUntil: "load" });
    await page.waitForTimeout(1700);
    await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /Skip tour/i.test(n.innerText)); if (b) b.click(); })()`);
    await page.waitForTimeout(300);
    await page.keyboard.press("f");
    await page.waitForTimeout(900);
  };
  await open();
  // one contract, to make a real file, then bend it into the stuck shape
  await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /^Open long on/.test(n.innerText.trim())); if (b) b.click(); })()`);
  await page.waitForTimeout(600);
  await page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem("crypto_chart_practice"));
    s.schemaVersion = 1;
    s.positions = {};
    s.margin = 0;
    s.opened = 50;
    s.openedFrom = 0;
    s.ended = true;
    s.plan = { ...s.plan, maxPositions: 5, sessionLossPct: 2 };
    localStorage.setItem("crypto_chart_practice", JSON.stringify(s));
  })()`);
  await open();

  const state = () => page.evaluate(`(() => {
    const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
    return { n: Object.keys(p.positions || {}).length, opened: p.opened, ended: p.ended,
             schema: p.schemaVersion, quota: p.plan.maxPositions, loss: p.plan.sessionLossPct,
             balance: (p.balance / 100).toFixed(2) };
  })()`);
  const first = await state();
  console.log("loaded (the file is still the old one — the migration is in memory\n"
    + "          until the next write, which is what the assertions below check):",
    JSON.stringify(first));
  ok(first.opened === 50, "the account's own history is kept");

  const foot = await page.evaluate(`(() => { const f = document.querySelector("[data-practice-ticket-foot]"); return f ? f.innerText.split("\\n")[0] : null; })()`);
  ok(!/Cannot open/.test(foot || ""), "the ticket offers to open rather than refusing", foot);

  for (let i = 1; i <= 6; i += 1) {
    const side = i % 2 ? "Long" : "Short";
    await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => n.innerText.trim().split("\\n")[0] === "New contract"); if (b) b.click(); })()`);
    await page.waitForTimeout(200);
    await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => n.innerText.trim() === ${JSON.stringify(side)}); if (b) b.click(); })()`);
    await page.waitForTimeout(200);
    await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /^Open (long|short) on/.test(n.innerText.trim())); if (b && !b.disabled) b.click(); })()`);
    await page.waitForTimeout(450);
    const st = await state();
    ok(st.n === i, `#${i} ${side} opens on the account that was stuck`, `held ${st.n}, opened ${st.opened}`);
    if (st.n !== i) break;
    if (i === 1) {
      /* The first write is where the migrated shape lands on disk. */
      ok(st.quota === undefined, "…and the stored plan no longer carries the quota");
      ok(st.loss === 0, "…the loss stop it was ended by is off");
      ok(st.ended === false, "…and the session is not held shut by a rule that is gone");
      ok(st.schema === 3, "…written back at the new schema", String(st.schema));
    }
  }
  console.log(errs.length ? "ERRORS " + errs.join(" | ") : "no page errors");
  if (errs.length) bad += 1;
  await browser.close();
  console.log(bad ? `\n${bad} FAILURES` : "\nprobe clean");
  process.exit(bad ? 1 : 0);
})();
