/* The phone shim's bridge, exercised in WebKit with a fake native side:
   the alarm's notification switch must ask the app (notifyRequest), turn on
   when the app answers true, and turn off through notifyOff; the sound
   switch must play through the one unlocked AudioContext. */
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const { webkit } = require(path.join(ROOT, "tests", "node_modules", "playwright"));
const INDEX = "file://" + path.join(ROOT, "ios", "WebApp", "index.html");
const json = (b) => ({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
let failed = 0;
const check = (ok, label, detail) => { if (ok) console.log(`  ✔ ${label}`); else { failed += 1; console.log(`  ✘ ${label}${detail !== undefined ? " — " + String(detail).slice(0, 300) : ""}`); } };
(async () => {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  await ctx.route("**/*", (r) => (r.request().url().startsWith("file://") ? r.continue() : r.fulfill(json({ data: { amount: "43000", currency: "USD", prices: [] } }))));
  await ctx.addInitScript(`
    localStorage.setItem("crypto_chart_onboarding_seen", "1");
    window.__native = [];
    window.__grant = true;
    window.webkit = { messageHandlers: { pricetab: { postMessage: (m) => {
      window.__native.push(m);
      if (m.kind === "notifyStatus") setTimeout(() => window.PriceTabIOS.resolve(m.id, window.__granted === true), 0);
      if (m.kind === "notifyRequest") setTimeout(() => { window.__granted = window.__grant; window.PriceTabIOS.resolve(m.id, window.__grant); }, 0);
      if (m.kind === "notifyOff") window.__granted = false;
    } } } };
  `);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(INDEX, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const platform = await page.evaluate("window.PriceTabPlatform + '/' + document.documentElement.dataset.platform");
  check(platform === "ios/ios", "the page knows it is on the phone", platform);
  const kinds0 = await page.evaluate("window.__native.map((m) => m.kind)");
  check(kinds0.includes("theme"), "the page's ground was reported to the app", kinds0.join(","));

  await page.evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }))`);
  await page.waitForTimeout(700);
  const labels = await page.evaluate(`Array.from(document.querySelectorAll("[data-alerts-card] button")).map((n) => (n.getAttribute("aria-label") || n.innerText).trim()).filter((t) => /notif|sound/i.test(t))`);
  check(labels.some((t) => /^Raise a notification|notification/i.test(t)) && !labels.join(" ").includes("Chrome"), "the alarm row names a notification, not Chrome", labels.join(" | "));

  /* status was asked on open */
  const asked = await page.evaluate("window.__native.filter((m) => m.kind === 'notifyStatus').length");
  check(asked >= 1, "opening the panel asked the app whether notifications are on", asked);

  const tap = async (re) => {
    const pt = await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("[data-alerts-card] button")).find((n) => ${re}.test(n.getAttribute("aria-label") || n.innerText)); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!pt) return false;
    await page.touchscreen.tap(pt.x, pt.y);
    await page.waitForTimeout(700);
    return true;
  };
  check(await tap("/notification/i"), "the notification switch can be pressed");
  const req = await page.evaluate("window.__native.filter((m) => m.kind === 'notifyRequest').length");
  check(req === 1, "…which asked the app for permission straight out of the press", req);
  const on = await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("[data-alerts-card] button")).find((n) => /Raise a notification/.test(n.getAttribute("aria-label") || "")); return b && (b.getAttribute("aria-pressed") || b.getAttribute("aria-checked") || b.dataset.on || getComputedStyle(b).fontWeight); })()`);
  const drop = await page.evaluate(`Boolean(document.querySelector("[data-alarm-drop]"))`);
  check(drop, "the app said yes: the switch is on and the 'give it back' control appeared", `state ${on}`);
  check(await tap("/Stop raising notifications/"), "pressing 'give it back'…");
  const off = await page.evaluate("window.__native.filter((m) => m.kind === 'notifyOff').length");
  check(off === 1, "…told the app to stop posting", off);
  check(!(await page.evaluate(`Boolean(document.querySelector("[data-alarm-drop]"))`)), "…and the control went away");
  /* the sound switch: play through the patched context */
  await page.evaluate(`window.__osc = 0; const P = AudioContext.prototype.createOscillator; AudioContext.prototype.createOscillator = function () { window.__osc += 1; return P.call(this); };`);
  check(await tap("/sound/i"), "the sound switch can be pressed");
  const played = await page.evaluate("window.__osc");
  check(played >= 1, "turning the sound on played its tone through the (unlocked) AudioContext", played);
  const same = await page.evaluate("new AudioContext() === new AudioContext()");
  check(same, "every AudioContext the page asks for is the one unlocked context");

  /* a notification while the panel is up: create → the app */
  await page.evaluate(`chrome.notifications.create("t1", { title: "PriceTab", message: "BTC reached 50,000" })`);
  const posted = await page.evaluate("window.__native.filter((m) => m.kind === 'notify').map((m) => m.title + ': ' + m.message)");
  check(posted.length === 1 && posted[0].includes("50,000"), "chrome.notifications.create reaches the app with its words", posted.join(" | "));

  /* the news permission is a Chrome host permission: refused honestly */
  const news = await page.evaluate(`new Promise((r) => chrome.permissions.request({ origins: ["https://example.com/*"] }, r))`);
  check(news === false, "a host permission is refused rather than faked");
  check(errors.length === 0, "no page error through all of it", errors.join(" | "));
  console.log(failed ? `✘ ${failed} SHIM CHECK(S) FAILED` : "SHIM OK");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
