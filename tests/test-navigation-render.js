/* global window, document, innerHeight, practiceEmptySession */
// Exercise menu placement, confirmation, retained records, scoped deletion
// and every packaged locale through the rendered Settings controls.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("• navigation render test skipped: playwright not installed"); process.exit(0); }
const root = path.join(__dirname, "..");
const index = "file://" + path.join(root, "index.html");
(async () => {
  let browser;
  try { browser = await chromium.launch({ args: ["--allow-file-access-from-files"] }); }
  catch (e) { console.log("• navigation render test skipped: no browser binary (" + e.message.split("\n")[0] + ")"); process.exit(0); }
  const errors = [];
  const make = async (locale = "en", width = 1280, consent = true) => {
    const messages = JSON.parse(fs.readFileSync(path.join(root, "_locales", locale, "messages.json"), "utf8"));
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.route("**/*", (r) => {
      if (r.request().url().startsWith("file://")) return r.continue();
      if (r.request().url().includes("historic")) return r.fulfill({ json: { data: { prices: Array.from({ length: 60 }, (_, i) => ({ price: String(43000 + i), time: Math.floor(Date.now() / 1000) - (60 - i) * 60 })) } } });
      if (r.request().url().includes("spot")) return r.fulfill({ json: { data: { amount: "43060", currency: "USD" } } });
      return r.fulfill({ json: { data: [] } });
    });
    await ctx.addInitScript(({ messages, locale, consent }) => {
      window.chrome = { i18n: {
        getUILanguage: () => locale,
        getMessage: (key, subs) => {
          let text = messages[key] ? messages[key].message : "";
          (Array.isArray(subs) ? subs : subs == null ? [] : [subs]).forEach((v, i) => { text = text.split("$" + (i + 1)).join(String(v)); });
          return text;
        },
      } };
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      if (!sessionStorage.getItem("nav-test-seeded")) {
        sessionStorage.setItem("nav-test-seeded", "1");
        localStorage.setItem("crypto_chart_practice_consent", String(consent));
        localStorage.setItem("crypto_chart_portfolio", JSON.stringify([{ coin: "ETH", amount: 2, lots: [], sales: [], watches: [] }]));
      }
    }, { messages, locale, consent });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(index);
    await page.waitForSelector("[data-tour='price']");
    const open = async () => {
      if (!(await page.locator("[data-settings-card]").isVisible())) await page.keyboard.press("s");
      await page.locator('[data-pref-group="features"]').click();
      await page.locator("[data-navigation-settings]").waitFor({ state: "visible" });
    };
    await open();
    return { ctx, page, open, messages };
  };
  try {
    const { ctx, page, open } = await make();
    const row = (key) => page.locator('[data-nav-row="' + key + '"]');
    await row("futures").locator("select").selectOption("left");
    await row("futures").getByRole("button", { name: "Move Derivatives market up", exact: true }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("crypto_chart_nav_layout")));
    assert.strictEqual(saved.left.at(-2), "futures");
    await page.keyboard.press("Escape");
    await page.keyboard.press(",");
    await page.locator('[data-drawer-tab="futures"]').click();
    await page.waitForSelector("[data-practice-page]");
    await page.keyboard.press("Escape");
    await open();
    const kept = await page.evaluate(() => {
      const account = practiceEmptySession();
      localStorage.setItem("crypto_chart_practice", JSON.stringify(account));
      localStorage.setItem("crypto_chart_practice_history", JSON.stringify({ rows: [] }));
      localStorage.setItem("crypto_chart_practice_ticket", JSON.stringify({ leverage: { BTC: 5 } }));
      return { practice: localStorage.getItem("crypto_chart_practice"), portfolio: localStorage.getItem("crypto_chart_portfolio") };
    });
    await row("futures").locator('button[aria-pressed]').click();
    const prompt = page.locator('[data-nav-confirm="futures"]');
    await prompt.waitFor({ state: "visible" });
    assert.strictEqual(await prompt.locator('input[value="keep"]').isChecked(), true);
    assert.strictEqual(await page.evaluate(() => localStorage.getItem("crypto_chart_practice_enabled")), null, "asking does not disable");
    await page.keyboard.press("Escape");
    assert.strictEqual(await prompt.count(), 0);
    assert.strictEqual(await page.locator("[data-settings-card]").isVisible(), true, "Escape cancels confirmation, keeping Settings open");
    await row("futures").locator('button[aria-pressed]').click();
    await prompt.locator("[data-nav-hide-confirm]").click();
    assert.strictEqual(await page.evaluate(() => localStorage.getItem("crypto_chart_practice")), kept.practice);
    assert.strictEqual(await page.locator('[data-drawer-tab="futures"], [data-screen-tab="futures"]').count(), 0);
    await page.reload();
    await page.waitForSelector("[data-tour='price']");
    await open();
    assert.strictEqual(await row("futures").locator("select").inputValue(), "left");
    assert.strictEqual(await row("futures").locator('button[aria-pressed]').getAttribute("aria-pressed"), "false");
    await row("futures").locator('button[aria-pressed]').click();
    assert.strictEqual(await page.evaluate(() => localStorage.getItem("crypto_chart_practice")), kept.practice);
    await row("futures").locator('button[aria-pressed]').click();
    await prompt.locator('input[value="delete"]').check();
    assert.ok((await prompt.innerText()).includes("open positions"));
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), prompt.locator("[data-nav-hide-confirm]").click()]);
    assert.deepStrictEqual(await page.evaluate(() => ["crypto_chart_practice", "crypto_chart_practice_history", "crypto_chart_practice_ticket"].map((k) => localStorage.getItem(k))), [null, null, null]);
    assert.strictEqual(await page.evaluate(() => localStorage.getItem("crypto_chart_portfolio")), kept.portfolio);
    assert.strictEqual(await page.evaluate(() => localStorage.getItem("crypto_chart_practice_consent")), "true");
    // Every tab on one side must remain reachable, including a phone.
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await open();
      for (const key of ["widgets", "chart", "targets", "calls", "compare", "settings", "portfolio", "futures", "news", "monitor"]) {
        await row(key).locator("select").selectOption("right");
      }
      await page.keyboard.press("Escape");
      await page.keyboard.press(".");
      const nav = page.locator("#screen-tabs");
      const last = nav.locator("button").last();
      await last.scrollIntoViewIfNeeded();
      const box = await last.boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= 901, "crowded edge keeps the last tab on screen");
      assert.strictEqual(await page.locator("#drawer-tabs").count(), 0, "empty edge has no pull or tabs");
      await open();
      await page.locator("[data-nav-reset]").click();
      const reset = await page.evaluate(() => JSON.parse(localStorage.getItem("crypto_chart_nav_layout")));
      assert.deepStrictEqual(reset, { left: ["widgets", "chart", "targets", "calls", "compare"], right: ["settings", "portfolio", "futures", "news", "monitor"] });
    }
    await ctx.close();
    console.log("✔ Settings: placement, reorder, cancel, keep, re-enable, reload and scoped deletion");
    for (const locale of fs.readdirSync(path.join(root, "_locales"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
      for (const width of [390, 1280]) {
        const { ctx, page, messages } = await make(locale, width);
        assert.ok((await page.locator("[data-navigation-settings]").innerText()).includes(messages.nav_intro.message));
        const bounds = await page.locator("[data-navigation-settings]").evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
        assert.ok(bounds.scroll <= bounds.width + 1, `${locale} ${width}: menu fits ${JSON.stringify(bounds)}`);
        await page.locator('[data-nav-row="futures"] button[aria-pressed]').click();
        const prompt = page.locator("[data-nav-confirm]");
        await prompt.waitFor({ state: "visible" });
        assert.ok((await prompt.innerText()).includes(messages.nav_keep.message));
        await page.waitForFunction(() => {
          const node = document.querySelector("[data-nav-confirm]");
          if (!node) return false;
          const r = node.getBoundingClientRect();
          const bounds = node.closest("[data-pref-section]").getBoundingClientRect();
          return r.top >= bounds.top && r.bottom <= Math.min(innerHeight, bounds.bottom);
        });
        if (locale === "tr" && width === 1280) await page.screenshot({ path: "/private/tmp/pricetab-menu-layout-tr.png" });
        await ctx.close();
      }
    }
    const first = await make("en", 1280, false);
    const firstSwitch = first.page.locator('[data-nav-row="futures"] button[aria-pressed]');
    assert.strictEqual(await firstSwitch.getAttribute("aria-pressed"), "true", "visible terms-only tab is reported as visible");
    await firstSwitch.click();
    await first.page.locator("[data-nav-hide-confirm]").click();
    assert.strictEqual(await first.page.evaluate(() => localStorage.getItem("crypto_chart_practice_enabled")), "false", "first-time user can hide Futures without accepting terms");
    await firstSwitch.click();
    await first.page.locator("[data-practice-terms]").waitFor({ state: "visible" });
    assert.strictEqual(await first.page.evaluate(() => localStorage.getItem("crypto_chart_practice_consent")), "false");
    await first.page.locator("[data-practice-accept]").click();
    assert.strictEqual(await firstSwitch.getAttribute("aria-pressed"), "true");
    assert.strictEqual(await first.page.evaluate(() => localStorage.getItem("crypto_chart_practice_consent")), "true");
    await first.ctx.close();
    console.log("✔ First run: hide without accepting simulation terms; re-enable asks before granting consent");
    assert.deepStrictEqual(errors, []);
    console.log("✔ All 13 locales: menu and confirmation at 390px and 1280px; no page errors");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
