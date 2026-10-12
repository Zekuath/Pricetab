// Modes and the Preferences tab, in a real browser.
//
// Three things here can only be checked by rendering: that the search box
// actually takes text (it silently took none for as long as it existed — the
// tab is a plain function and it reached for `this.setState`), that a mode moves
// the settings it names *through their own switches*, and that quiet controls
// fade without becoming unclickable.
//
// Skips (exit 0) without the browser, like tests/test-render.js.
const path = require("path");

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

const ROOT = path.join(__dirname, "..");
const INDEX = "file://" + path.join(ROOT, "index.html");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("• modes render test skipped: playwright not installed");
  process.exit(0);
}

const NOW_S = Math.floor(Date.now() / 1000);
const PRICES = Array.from({ length: 120 }, (_, i) => ({
  price: (43000 + i * 4 + Math.sin(i / 7) * 160).toFixed(2),
  time: NOW_S - (120 - i) * 30,
}));
const json = (b) => ({
  status: 200,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*" },
  body: JSON.stringify(b),
});

let failed = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failed++;
    console.error(`  ✘ ${label}${detail ? " — " + detail : ""}`);
  }
};

const newCtx = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith("file://")) return r.continue();
    if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
    if (u.includes("spot"))
      return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
    return r.fulfill(json({ data: {} }));
  });
  /* Seeded only where nothing is stored yet. `addInitScript` runs on every
   * navigation, so setting these outright put them back after the reload in
   * §4 — the test would have been asserting that a mode survives having three
   * of its settings undone. */
  await ctx.addInitScript(() => {
    const seed = (k, v) => {
      if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
    };
    seed("crypto_chart_onboarding_seen", "1");
    // Something to turn off, so Minimal has work to do
    seed(
      "crypto_chart_widgets",
      JSON.stringify({ watchlist: true, fearGreed: true, marketOverview: true }),
    );
    seed("crypto_chart_market_stats", "true");
    seed("crypto_chart_page_ticker_enabled", "true");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(INDEX, { waitUntil: "load" });
  await page.waitForSelector("svg path", { timeout: 20000 });
  await page.waitForTimeout(2200);
  return { ctx, page, errors };
};

/* Settings, on its Modes section: the first of the preferences in its
   menu since 26 Sep 2026, when the tabs and the accordions became a menu of
   sections. Pressed, not searched for by text — a conditional click on a
   moved control is how a test goes on passing against the wrong screen. */
const openPrefs = async (page) => {
  await page.keyboard.press("s");
  await page.waitForTimeout(500);
  await page.click("[data-tab='preferences']");
  await page.waitForTimeout(400);
};
const openSection = async (page, key) => {
  await page.click(`[data-pref-group='${key}']`);
  await page.waitForTimeout(350);
};

const HEADINGS = `[...document.querySelectorAll("h4")].map((h) => ({
  title: h.textContent.replace("▾", "").trim(),
  open: h.getAttribute("aria-expanded") === "true",
}))`;

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.log(`• modes render test skipped: no browser binary (${e.message.split("\n")[0]})`);
    process.exit(0);
  }

  // ── 1. a menu of sections, not a wall ──────────────────────────────────
  /* Every group open was one long scroll; accordions made it a list of
   * headings that said nothing of what was behind them; since 26 Sep 2026 it
   * is a menu naming every section with its count, and one section on screen
   * at a time. The count and the rows cannot disagree: they are one list. */
  {
    const { ctx, page, errors } = await newCtx(browser);
    await openPrefs(page);
    const menu = await page.evaluate(`[...document.querySelectorAll("[data-pref-group]")].map((b) => ({
      key: b.getAttribute("data-pref-group"),
      count: (b.children[1] || { textContent: "" }).textContent.trim(),
    }))`);
    check(menu.length >= 7 && menu.filter((m) => m.key !== "modes").every((m) => /^[0-9]+$/.test(m.count)),
      "the menu names every section, each group with its count", JSON.stringify(menu));
    const basics = menu.find((m) => m.key === "basics");
    await openSection(page, "basics");
    const shown = await page.evaluate(`(() => ({
      section: document.querySelector("[data-settings-section]").getAttribute("data-settings-section"),
      rows: document.querySelectorAll("[data-pref-section='basics'] > *").length,
    }))()`);
    check(shown.section === "basics" && String(shown.rows) === basics.count,
      "a section shows its own rows, as many as the menu says", JSON.stringify({ shown, basics }));
    await openSection(page, "chart");
    check(await page.evaluate(`!document.querySelector("[data-pref-section='basics']") &&
      Boolean(document.querySelector("[data-pref-section='chart']"))`),
      "and another section replaces it rather than stacking under it");
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 2. the search box takes text ───────────────────────────────────────
  // It never did: `this.setState` in a plain function threw on every keystroke,
  // so the box stayed empty and the panel never filtered.
  {
    const { ctx, page, errors } = await newCtx(browser);
    await openPrefs(page);
    const box = await page.$('input[aria-label="Search settings"]');
    check(Boolean(box), "the search box is there");
    await box.type("grid");
    await page.waitForTimeout(500);
    check((await box.inputValue()) === "grid", "it takes what is typed", await box.inputValue());
    check(errors.length === 0, "and typing throws nothing", errors[0]);
    const groups = await page.evaluate(`(${HEADINGS})`);
    check(
      /* The name is the group's own, so a regrouping updates it here too —
         which is the point: this check exists to catch the search collapsing
         to the *wrong* group, and a name it does not know is indistinguishable
         from that. "Chart" became "The chart" when the six groups became five
         and Chart Colour and Quiet Controls joined the settings they are
         about. */
      groups.length === 1 && groups[0].title === "The chart",
      "a search collapses the panel to the group that matches",
      groups.map((g) => g.title).join(","),
    );
    /* Modes are hidden while searching: a search is a hunt for one switch, and
     * a row that changes twelve of them is not the answer to it. */
    const modesRow = await page.evaluate(`(() => Boolean([...document.querySelectorAll("div")]
      .find((d) => d.textContent.trim() === "Modes")))()`);
    check(modesRow === false, "and the modes row stands aside");
    await ctx.close();
  }

  // ── 3. a mode moves the settings it names ──────────────────────────────
  {
    const { ctx, page, errors } = await newCtx(browser);
    await openPrefs(page);
    const stored = () =>
      page.evaluate(`(() => ({
        quiet: localStorage.getItem("crypto_chart_quiet_chrome"),
        stats: localStorage.getItem("crypto_chart_market_stats"),
        pageTicker: localStorage.getItem("crypto_chart_page_ticker_enabled"),
        refresh: localStorage.getItem("crypto_chart_refresh_interval"),
        widgets: localStorage.getItem("crypto_chart_widgets"),
      }))()`);

    const before = await stored();
    check(before.stats === "true" && before.pageTicker === "true",
      "there is something for Minimal to turn off");

    await page.click('button:text-is("Minimal")');
    await page.waitForTimeout(900);
    const after = await stored();
    check(after.quiet === "true", "Minimal quietens the controls", after.quiet);
    check(after.stats === "false", "…turns the stats line off", after.stats);
    check(after.pageTicker === "false", "…and the scrolling bar", after.pageTicker);
    check(after.refresh === "60000", "…and slows the polling", after.refresh);
    check(
      after.widgets && !Object.values(JSON.parse(after.widgets)).some(Boolean),
      "…and clears every widget",
      after.widgets,
    );
    /* Through the switches, not around them: the point of applying a mode by
     * calling each setting's own handler is that the panel below it tells the
     * truth afterwards. Quiet Controls is in the chart's section. */
    await openSection(page, "chart");
    const switches = await page.evaluate(`(() => {
      const rows = [...document.querySelectorAll("div")]
        .filter((d) => /QUIET CONTROLS/i.test(d.textContent) && d.children.length < 6);
      const label = [...document.querySelectorAll("div")]
        .find((d) => d.textContent.trim() === "On" || d.textContent.trim() === "Off");
      return { quietSectionFound: rows.length > 0, firstLabel: label ? label.textContent.trim() : null };
    })()`);
    check(switches.quietSectionFound, "the Quiet Controls row is in the panel");

    // The pill lights up because the settings say so, not because it was clicked
    await page.click("[data-tab='preferences']");
    await page.waitForTimeout(350);
    const activePill = await page.evaluate(`(() => {
      const pills = [...document.querySelectorAll("button")]
        .filter((b) => ["Minimal", "Fast", "Trader", "Holder"].includes(b.textContent.trim()));
      return pills.map((b) => b.textContent.trim() + ":" + getComputedStyle(b).backgroundColor);
    })()`);
    // A pill with no background is not lit. (This regex lives in Node, so it
    // is written once-escaped; the ones inside `page.evaluate` strings are not.)
    const lit = activePill.filter((p) => !/rgba\(0, 0, 0, 0\)/.test(p));
    check(
      lit.length === 1 && lit[0].startsWith("Minimal"),
      "one pill is lit, and it is the one that is in force",
      activePill.join(" "),
    );
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 4. a mode is recognised after a reload, not remembered ─────────────
  {
    const { ctx, page } = await newCtx(browser);
    await openPrefs(page);
    await page.click('button:text-is("Minimal")');
    await page.waitForTimeout(900);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(2000);
    await openPrefs(page);
    const lit = await page.evaluate(`(() => {
      const pills = [...document.querySelectorAll("button")]
        .filter((b) => ["Minimal", "Fast", "Trader", "Holder"].includes(b.textContent.trim()));
      return pills.filter((b) => !/rgba\\(0, 0, 0, 0\\)/.test(getComputedStyle(b).backgroundColor))
        .map((b) => b.textContent.trim());
    })()`);
    check(
      lit.length === 1 && lit[0] === "Minimal",
      "a fresh tab works out which mode is in force",
      lit.join(","),
    );

    /* And one switch away from it, no mode claims to be on — nothing stored
     * says "Minimal", so nothing can go on saying it. */
    await openSection(page, "tabTickers");
    await page.evaluate(`(() => {
      const row = [...document.querySelectorAll("div")]
        .find((d) => /Price Ticker Bar/.test(d.textContent) && d.children.length < 6);
      const sw = row && row.parentElement.querySelector("[aria-label='Toggle page ticker']");
      if (sw) sw.click();
    })()`);
    await page.waitForTimeout(700);
    const stillLit = await page.evaluate(`(() => {
      const pills = [...document.querySelectorAll("button")]
        .filter((b) => ["Minimal", "Fast", "Trader", "Holder"].includes(b.textContent.trim()));
      return pills.filter((b) => !/rgba\\(0, 0, 0, 0\\)/.test(getComputedStyle(b).backgroundColor))
        .map((b) => b.textContent.trim());
    })()`);
    check(
      stillLit.length === 0,
      "and changing one setting by hand puts every pill out",
      stillLit.join(","),
    );
    await ctx.close();
  }

  // ── 5. quiet controls fade, and stay usable ────────────────────────────
  {
    const { ctx, page } = await newCtx(browser);
    await openPrefs(page);
    await page.click('button:text-is("Minimal")');
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);

    /* **What rests on the page is the two pulls** (26 Sep 2026): the
       corner's openers became tabs on the two edges' spines, each resting in
       a drawer behind a pull, and Quiet Controls is the pulls' weight now.
       Measured without the setting as well, so the check cannot pass on a
       pull that is simply always faint. */
    const pulls = `(() => [...document.querySelectorAll("[data-drawer-tabs-handle], [data-screen-tabs-handle]")]
      .map((b) => +getComputedStyle(b).opacity))()`;
    const resting = await page.evaluate(pulls);
    check(resting.length === 2 && resting.every((o) => o < 0.5),
      "with Quiet Controls on, both pulls rest well under half opacity", JSON.stringify(resting));

    // Pointing at one brings it back — nothing is hidden or unclickable
    await page.hover("[data-screen-tabs-handle]");
    /* Past the 0.2s fade and short of the dwell, after which the column
       comes out and the pull steps aside under it. */
    await page.waitForTimeout(250);
    const hovered = await page.evaluate(
      `(() => +getComputedStyle(document.querySelector("[data-screen-tabs-handle]")).opacity)()`,
    );
    check(hovered > 0.9, "and comes back to full under the pointer", `${hovered}`);

    /* …and it still leads to Settings, which is the way out of the mode.
       Rested on for the dwell, the pull has already brought the column out
       — and stepped aside under it — so the next press is the tab's. */
    await page.waitForSelector("[data-screen-tabs-shown='true']", { timeout: 3000 });
    await page.click('[aria-label="Open settings"]');
    await page.waitForTimeout(600);
    const opened = await page.evaluate(`Boolean(document.querySelector("[data-tab='preferences']"))`);
    check(opened, "a quiet pull still leads to Settings");
    await ctx.close();

    /* And without the setting they rest in plain sight. */
    const loud = await newCtx(browser);
    const plain = await loud.page.evaluate(pulls);
    check(plain.length === 2 && plain.every((o) => o > 0.7),
      "with it off, the pulls rest in plain sight", JSON.stringify(plain));
    await loud.ctx.close();
  }

  // ── 6. the rings that explain the hard settings ───────────────────────
  /* A one-line caption answers "what does this do". The ring answers the
   * question that costs people time: what it costs, what it interacts with,
   * and the gotcha. The tab-title setting used to carry sixty words of that at
   * 0.65rem and half opacity, which is where text goes to not be read. */
  {
    const { ctx, page, errors } = await newCtx(browser);
    await openPrefs(page);
    /* One section at a time, so the rings are gathered section by section. */
    const rings = [];
    for (const key of ["basics", "chart", "underPrice", "tabTickers", "updating", "features", "data"]) {
      await openSection(page, key);
      rings.push(...(await page.evaluate(`(() => [...document.querySelectorAll("button")]
        .filter((b) => /^About /.test(b.getAttribute("aria-label") || ""))
        .map((b) => b.getAttribute("aria-label").replace("About ", "")))()`)));
    }
    await openSection(page, "basics");
    check(rings.length >= 8, "the settings with something to explain carry a ring",
      `${rings.length}: ${rings.slice(0, 4).join(", ")}…`);
    /* The ones that must have one: a cost, an interaction with another setting,
     * or a consequence nobody would guess. */
    for (const must of ["Currency", "Candlesticks", "Chart Grid", "Refresh Interval"]) {
      check(rings.includes(must), `…including ${must}`, rings.join(", "));
    }

    /* Clipped is not hidden: the note stays mounted so it can ease open, which
     * leaves its text in the accessibility tree unless it is marked hidden —
     * and then `aria-expanded="false"` on the ring would be a lie. */
    const noteState = (phrase) => page.evaluate(`(() => {
      const el = [...document.querySelectorAll("div")]
        .find((d) => d.children.length === 0 && d.textContent.includes(${JSON.stringify("PHRASE")}));
      if (!el) return "absent";
      let n = el, h = el.getBoundingClientRect().height;
      while (n && n !== document.body) {
        /* Skip a display:contents ancestor. Such an element has no box at all,
           so its height is 0 by definition and says nothing about whether the
           content inside it is clipped — the settings row dissolves its
           wrappers that way so the controls become grid items. Counting it
           reported an open note as clipped. */
        if (getComputedStyle(n).display !== "contents") {
          h = Math.min(h, n.getBoundingClientRect().height);
        }
        n = n.parentElement;
      }
      return (h > 4 ? "open" : "clipped") + (el.closest("[aria-hidden='true']") ? "+hidden" : "");
    })()`.replace("PHRASE", phrase));

    const CURRENCY = "pick up again when you switch back";
    check((await noteState(CURRENCY)) === "clipped+hidden",
      "a closed note is clipped and out of the accessibility tree",
      await noteState(CURRENCY));

    const press = (label) => page.evaluate(`(() => {
      const b = [...document.querySelectorAll("button")]
        .find((e) => e.getAttribute("aria-label") === ${JSON.stringify("LABEL")});
      if (b) b.click();
    })()`.replace("LABEL", label));

    await press("About Currency");
    await page.waitForTimeout(420);
    check((await noteState(CURRENCY)) === "open",
      "the ring opens it", await noteState(CURRENCY));
    /* The one people most need: nothing else in the panel says that a target
     * set in another currency stops watching. */
    check(
      await page.evaluate(`(() => [...document.querySelectorAll("div")]
        .some((d) => /targets and calls made in another currency pause/.test(d.textContent)))()`),
      "…and it says what switching currency does to your targets",
    );

    /* One at a time: two open notes push the switch you were reading off
       screen. Two rings in one section, since a section is what is on
       screen. */
    await openSection(page, "chart");
    await press("About Candlesticks");
    await page.waitForTimeout(420);
    await press("About Chart Grid");
    await page.waitForTimeout(420);
    check((await noteState("BTC goes to 2013")) === "clipped+hidden",
      "opening another closes the first",
      await noteState("BTC goes to 2013"));
    await press("About Chart Grid");
    await page.waitForTimeout(420);
    await press("About Candlesticks");
    await page.waitForTimeout(420);
    await press("About Candlesticks");
    await page.waitForTimeout(420);
    check((await noteState("BTC goes to 2013")) === "clipped+hidden",
      "and the ring puts it away again",
      await noteState("BTC goes to 2013"));
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  await browser.close();
  if (failed) {
    console.error(`\n✘ ${failed} MODE CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log("ALL MODE TESTS PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
