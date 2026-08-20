// The classes of defect that neither throw nor look wrong in a screenshot:
// a control you can click but cannot tab to, a button with no name, a chart
// that silently draws nothing because a coordinate came out NaN, and a few
// state-machine edges in app.js — which has 4,600 lines and no unit tests.
//
// Written after a polish pass that found exactly these: the coin chip's remove
// control was a <span> inside a <button> that had no click handler at all, so
// there was no way to remove a coin without a pointer.
//
// Skips (exit 0) without the browser, like tests/test-render.js.
const path = require("path");

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

const INDEX = "file://" + path.join(__dirname, "..", "index.html");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("• polish render test skipped: playwright not installed");
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

// Every symbol the ticker sweeps, read from the source of truth rather than
// copied, so a new coin cannot quietly leave the full-coverage case partial
const SUGGESTED = (() => {
  const src = require("fs").readFileSync(
    path.join(__dirname, "..", "src", "config.js"), "utf8");
  const m = src.match(/const SUGGESTED_COINS = \[([\s\S]*?)\];/);
  return m ? (m[1].match(/"[A-Z0-9]{2,10}"/g) || []).map((q) => q.slice(1, -1)) : [];
})();

const TICKERS = ["BTC", "ETH", "XRP", "LTC"].map((c, i) => ({
  id: i, symbol: c, name: c, price_usd: String(43000 - i * 100),
  percent_change_24h: String(i - 1), market_cap_usd: "1000000", volume24: "50000",
}));

const newCtx = async (browser, init, prices = PRICES) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith("file://")) return r.continue();
    if (u.includes("historic")) return r.fulfill(json({ data: { prices } }));
    if (u.includes("spot"))
      return r.fulfill(json({ data: { amount: prices[prices.length - 1].price, currency: "USD" } }));
    if (u.includes("api.exchange.coinbase.com"))
      return r.fulfill(json(prices.map((p) => [+p.time, +p.price, +p.price, +p.price, +p.price, 1])));
    if (u.includes("coinlore") && u.includes("tickers"))
      return r.fulfill(json({ data: TICKERS, info: { coins_num: 100 } }));
    if (u.includes("alternative.me"))
      return r.fulfill(json({ data: [{ value: "31", value_classification: "Fear" }] }));
    return r.fulfill(json({ data: {} }));
  });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(INDEX, { waitUntil: "load" });
  await page.waitForSelector("svg path", { timeout: 20000 });
  await page.waitForTimeout(2400);
  return { ctx, page, errors };
};

/* React 16 attaches its listeners at the document, so a DOM node carries no
 * `onclick` to inspect — the handler lives on the fibre. Reading it from there
 * is what makes "clickable but not focusable" answerable at all. */
const AUDIT = `(() => {
  const out = { unreachable: [], unnamed: [], unlabelled: [] };
  const propsOf = (el) => {
    const key = Object.keys(el).find(
      (k) => k.startsWith("__reactProps$") || k.startsWith("__reactInternalInstance$") ||
             k.startsWith("__reactEventHandlers$"));
    if (!key) return null;
    const v = el[key];
    if (v && v.onClick) return v;
    return v && v.memoizedProps ? v.memoizedProps : v;
  };
  const focusable = (el) =>
    el.matches("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const props = propsOf(el);
    const text = (el.textContent || "").trim().slice(0, 24);
    if (props && typeof props.onClick === "function" && !focusable(el) &&
        el.getAttribute("role") !== "button") {
      out.unreachable.push(el.tagName + ' "' + text + '"');
    }
    if (el.tagName === "BUTTON" &&
        !(el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim()) {
      out.unnamed.push(el.tagName + "." + (el.className || "").toString().split(" ")[0]);
    }
    if ((el.tagName === "INPUT" || el.tagName === "SELECT") &&
        !el.getAttribute("aria-label") && !el.getAttribute("placeholder") &&
        !(el.id && document.querySelector("label[for='" + el.id + "']"))) {
      out.unlabelled.push(el.tagName + "." + (el.className || "").toString().split(" ")[0]);
    }
  }
  return out;
})()`;

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.log(`• polish render test skipped: no browser binary (${e.message.split("\n")[0]})`);
    process.exit(0);
  }

  // ── 1. everything you can click, you can reach ─────────────────────────
  {
    const { ctx, page } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_widgets", JSON.stringify({ watchlist: true, fearGreed: true }));
      localStorage.setItem("crypto_chart_portfolio", JSON.stringify([
        { coin: "BTC", amount: 0.5,
          lots: [{ amount: 0.5, paid: 15000, time: Math.floor(Date.now() / 1000) - 3456000, source: "manual" }],
          sales: [] }]));
      localStorage.setItem("crypto_chart_alerts", JSON.stringify([
        { id: "a", coin: "BTC", kind: "price", direction: "above", target: 99999,
          currency: "USD", startPrice: 43000, createdAt: Date.now() }]));
    });
    const found = { unreachable: [], unnamed: [], unlabelled: [] };
    const sweep = async (where) => {
      const r = await page.evaluate(AUDIT);
      for (const k of Object.keys(found)) {
        for (const item of r[k]) found[k].push(`${where}: ${item}`);
      }
    };
    await sweep("chart");
    await page.keyboard.press("s");
    await page.waitForTimeout(600);
    await sweep("settings · coins");
    await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")]
      .find((e) => e.textContent.trim() === "Preferences"); if (b) b.click(); })()`);
    await page.waitForTimeout(500);
    // Every group open, or half the controls are never audited
    await page.evaluate(`(() => { document.querySelectorAll("h4").forEach((h) => {
      if (h.getAttribute("aria-expanded") === "false") h.click(); }); })()`);
    await page.waitForTimeout(500);
    await sweep("settings · preferences");
    await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")]
      .find((e) => e.textContent.trim() === "Widgets"); if (b) b.click(); })()`);
    await page.waitForTimeout(500);
    await sweep("settings · widgets");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("a");
    await page.waitForTimeout(700);
    await sweep("targets");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.keyboard.press("p");
    await page.waitForTimeout(2600);
    await sweep("portfolio");

    const uniq = (a) => [...new Set(a)];
    check(uniq(found.unreachable).length === 0,
      "nothing is clickable that cannot be tabbed to",
      uniq(found.unreachable).slice(0, 3).join(" | "));
    check(uniq(found.unnamed).length === 0,
      "every button has a name",
      uniq(found.unnamed).slice(0, 3).join(" | "));
    check(uniq(found.unlabelled).length === 0,
      "every input and select has one too",
      uniq(found.unlabelled).slice(0, 3).join(" | "));
    await ctx.close();
  }

  // ── 2. the only way to remove a coin works from the keyboard ───────────
  {
    const { ctx, page, errors } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_coin_options", JSON.stringify(["BTC", "ETH", "XRP"]));
    });
    await page.keyboard.press("s");
    await page.waitForTimeout(600);
    const removed = await page.evaluate(`(() => {
      const b = [...document.querySelectorAll("button")]
        .find((e) => e.getAttribute("aria-label") === "Remove ETH");
      if (!b) return "no labelled remove control";
      b.focus();
      return document.activeElement === b ? "focused" : "could not focus it";
    })()`);
    check(removed === "focused", "the remove control takes focus", removed);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    const left = await page.evaluate(`(() => localStorage.getItem("crypto_chart_coin_options"))()`);
    check(left && !JSON.parse(left).includes("ETH"),
      "…and Enter on it removes the coin", String(left));
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 3. removing the coin you are looking at ────────────────────────────
  {
    const { ctx, page, errors } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_coin_options", JSON.stringify(["BTC", "ETH", "XRP", "LTC"]));
    });
    const onScreen = `(() => {
      const t = [...document.querySelectorAll("div")].filter((d) => d.children.length === 0)
        .map((d) => d.textContent.trim()).find((s) => /^[A-Za-z0-9]{2,6} Price$/.test(s));
      return t ? t.split(" ")[0] : null;
    })()`;
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(600);
    }
    check((await page.evaluate(onScreen)) === "LTC", "the arrows reach the last coin");
    await page.keyboard.press("s");
    await page.waitForTimeout(600);
    await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")]
      .find((e) => e.getAttribute("aria-label") === "Remove LTC"); if (b) b.click(); })()`);
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    const after = await page.evaluate(onScreen);
    const stored = await page.evaluate(`(() => localStorage.getItem("crypto_chart_coin_options"))()`);
    check(after && JSON.parse(stored).includes(after),
      "removing the coin on screen lands on one that is still in the list",
      `${after} of ${stored}`);
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 4. auto-rotate moves on, and holds while a panel is open ───────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_auto_rotate", "true");
      localStorage.setItem("crypto_chart_auto_rotate_interval", "10000");
    });
    const page = await ctx.newPage();
    await page.clock.install({ time: Date.now() });
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(2000);
    const onScreen = `(() => {
      const t = [...document.querySelectorAll("div")].filter((d) => d.children.length === 0)
        .map((d) => d.textContent.trim()).find((s) => /^[A-Za-z0-9]{2,6} Price$/.test(s));
      return t ? t.split(" ")[0] : null;
    })()`;
    const first = await page.evaluate(onScreen);
    await page.clock.fastForward(11000);
    await page.waitForTimeout(1400);
    const second = await page.evaluate(onScreen);
    check(first && second && first !== second, "auto-rotate moves on", `${first} → ${second}`);
    await page.keyboard.press("s");
    await page.waitForTimeout(400);
    const held = await page.evaluate(onScreen);
    await page.clock.fastForward(40000);
    await page.waitForTimeout(1000);
    check(held === (await page.evaluate(onScreen)),
      "…and holds still while a panel is open", held);
    await ctx.close();
  }

  // ── 5. a target that is already true fires, once ───────────────────────
  {
    const { ctx, page, errors } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_alerts", JSON.stringify([
        { id: "sure", coin: "BTC", kind: "price", direction: "above", target: 100,
          currency: "USD", startPrice: 50, createdAt: Date.now() - 60000 }]));
    });
    await page.waitForTimeout(2200);
    const stored = await page.evaluate(
      `(() => JSON.parse(localStorage.getItem("crypto_chart_alerts") || "[]"))()`);
    check(stored.filter((a) => a.triggeredAt).length === 1,
      "a target that is already true fires", JSON.stringify(stored));
    check(stored.length === 1, "…and is not duplicated", String(stored.length));
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 6. awkward series still draw ───────────────────────────────────────
  /* A NaN in a path's `d` draws nothing at all — the chart goes blank and
   * says nothing. These are the shapes that produce one: no spread to scale
   * against, a single spike, and values at the ends of the number line. */
  const awkward = {
    "a flat line": Array.from({ length: 60 }, (_, i) => ({ price: "42000", time: NOW_S - (60 - i) * 60 })),
    "one spike": Array.from({ length: 60 }, (_, i) => ({ price: i === 30 ? "900000" : "100", time: NOW_S - (60 - i) * 60 })),
    "sub-cent prices": Array.from({ length: 60 }, (_, i) => ({ price: (0.00000012 + i * 1e-9).toFixed(12), time: NOW_S - (60 - i) * 60 })),
    "two points": [{ price: "100", time: NOW_S - 60 }, { price: "101", time: NOW_S }],
  };
  for (const [name, prices] of Object.entries(awkward)) {
    const { ctx, page, errors } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      // With the board on, every coordinate goes through the lattice too
      localStorage.setItem("crypto_chart_predict", "true");
      localStorage.setItem("crypto_chart_grid", "true");
    }, prices);
    await page.mouse.move(640, 500);
    await page.waitForTimeout(400);
    const state = await page.evaluate(`(() => ({
      bad: [...document.querySelectorAll("svg *")].flatMap((el) =>
        [...el.attributes].filter((a) => /NaN|Infinity/.test(a.value))
          .map((a) => el.tagName + "@" + a.name)).slice(0, 4),
      drawn: ([...document.querySelectorAll("svg path")]
        .map((e) => (e.getAttribute("d") || "").length).sort((a, b) => b - a)[0] || 0),
    }))()`);
    check(state.bad.length === 0, `${name}: no NaN reaches the drawing`, state.bad.join(","));
    check(state.drawn > 5, `${name}: something is actually drawn`, `${state.drawn} chars`);
    check(errors.length === 0, `${name}: nothing threw`, errors[0]);
    await ctx.close();
  }

  // ── 7. the coin chips still reorder by dragging ────────────────────────
  /* The chip stopped being a `<button>` when the × inside it became one, and
   * dragging is the other thing it is for. Playwright's mouse does not fire
   * HTML5 drag events, so they are dispatched directly — the point is the
   * handlers, not the pointer. */
  {
    const { ctx, page, errors } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_coin_options", JSON.stringify(["BTC", "ETH", "XRP", "LTC"]));
    });
    await page.keyboard.press("s");
    await page.waitForTimeout(700);
    const chips = await page.evaluate(`(() => [...document.querySelectorAll("[data-symbol]")]
      .map((e) => e.getAttribute("draggable")))()`);
    check(chips.length === 4 && chips.every((d) => d === "true"),
      "every tracked coin is a drag handle", JSON.stringify(chips));
    await page.evaluate(`(() => {
      const dt = new DataTransfer();
      const from = document.querySelector('[data-symbol="LTC"]');
      const to = document.querySelector('[data-symbol="BTC"]');
      from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
      to.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
      to.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
      from.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
    })()`);
    await page.waitForTimeout(700);
    const after = await page.evaluate(`(() => localStorage.getItem("crypto_chart_coin_options"))()`);
    /* Exactly where the live preview put it. Dropping used to apply the move a
     * second time, so the coin you dragged to the front landed second. */
    check(after === JSON.stringify(["LTC", "BTC", "ETH", "XRP"]),
      "…and dropping one on another leaves it where the drag showed it",
      String(after));
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  /* ── The three state-machine edges from the August 2026 bug audit ──────
   *
   * All three were "the code queued something and then read the old value",
   * or "a key we claimed belonged to the browser". None of them throws, none
   * looks wrong in a screenshot, and each is one line away from coming back.
   */

  // Quick Switch: picking a coin you do not own must open the coin you picked
  {
    const { ctx, page } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem(
        "crypto_chart_coin_options",
        JSON.stringify(["BTC", "ETH", "XRP", "LTC"]),
      );
    });
    await page.keyboard.press("/");
    await page.waitForTimeout(400);
    await page.keyboard.type("BNB");
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);
    const after = await page.evaluate(`(() => ({
      shown: ([...document.querySelectorAll("*")]
        .filter((e) => e.children.length === 0)
        .map((e) => (e.textContent || "").trim())
        .find((t) => /^[A-Z]{2,6}\\s+PRICE$/i.test(t)) || null),
      list: JSON.parse(localStorage.getItem("crypto_chart_coin_options") || "[]"),
    }))()`);
    check(after.list.includes("BNB"), "quick switch adds the coin picked",
      JSON.stringify(after.list));
    /* It added BNB and opened LTC: `handleAddCoinOption` queues its update, so
     * the index was computed from the list as it was before the add and
     * `length - 1` landed on whatever used to be last. */
    check(/BNB/i.test(after.shown || ""), "…and opens it, not the old last coin",
      after.shown);
    await ctx.close();
  }

  // A focused SELECT owns its own letters
  {
    const { ctx, page } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
    });
    await page.keyboard.press("s");
    await page.waitForTimeout(600);
    await page.evaluate(`(() => {
      const b = [...document.querySelectorAll("button")].find((e) => /Preferences/i.test(e.textContent));
      if (b) b.click();
    })()`);
    await page.waitForTimeout(600);
    await page.evaluate(`(() => {
      const h = [...document.querySelectorAll("h4")].find((e) => /NUMBERS/i.test(e.textContent));
      if (h) h.click();
    })()`);
    await page.waitForTimeout(500);
    const focused = await page.evaluate(`(() => {
      const s = document.querySelector("select");
      if (!s) return null;
      s.focus();
      return document.activeElement.tagName;
    })()`);
    check(focused === "SELECT", "a settings dropdown can take focus", String(focused));
    await page.keyboard.press("s");
    await page.waitForTimeout(600);
    const still = await page.evaluate(`(() => ({
      open: Boolean([...document.querySelectorAll("input")]
        .find((e) => (e.getAttribute("aria-label") || "") === "Search settings")),
      focus: document.activeElement.tagName,
    }))()`);
    /* Native dropdowns are driven by letters — "s" jumps to the first option
     * starting with s — so the global shortcut used to close Settings out from
     * under the control the user was operating. */
    check(still.open && still.focus === "SELECT",
      "…and \"S\" there does not close Settings",
      `open ${still.open}, focus ${still.focus}`);
    await ctx.close();
  }

  // The shared news loader starts for either of its two consumers
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const asked = [];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      asked.push(u);
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("blockchair.com/news"))
        return r.fulfill(json({ data: [] }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_move_headlines", "true");
      localStorage.setItem("crypto_chart_news_ticker_enabled", "false");
      localStorage.removeItem("crypto_chart_news_cache");
    });
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(3000);
    const news = asked.filter((u) => /blockchair\.com\/news|hn\.algolia\.com/.test(u));
    /* `fetchNewsData` always served both the row and the move-headlines line,
     * but `startNewsTicker` only ran for the row — so a tab with headlines on
     * and the row off made no news request at all. */
    check(news.length > 0,
      "move headlines alone still loads the feed on a new tab",
      `${news.length} requests`);
    await ctx.close();
  }

  /* A portfolio refresh asked for while one is running must not be dropped.
   *
   * A run lasts as long as its slowest address lookup, and both callers —
   * opening the view and adding a holding — land inside that window. The
   * in-flight guard used to return and leave nothing behind, so a coin added
   * mid-run had no price until the sixty-second interval. The route below
   * holds the price path open so the add reliably lands inside the run. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let slow = true;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await ctx.route("**/*", async (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (slow && (u.includes("coinlore") || u.includes("spot"))) await sleep(2200);
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("coinlore") && u.includes("tickers"))
        return r.fulfill(json({ data: TICKERS, info: { coins_num: 100 } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_portfolio", JSON.stringify([
        { coin: "BTC", amount: 1, lots: [], watches: [] },
      ]));
    });
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1200);
    // Reaching the app instance through the fibre: `handleAddHolding` is the
    // path the portfolio's own form takes, without depending on its markup
    const REACH = `(() => {
      const host = document.querySelector("[data-tour='portfolio']") || document.body;
      const key = Object.keys(host).find(
        (k) => k.startsWith("__reactInternalInstance") || k.startsWith("__reactFiber"));
      let f = key ? host[key] : null;
      while (f) {
        if (f.stateNode && f.stateNode.state && "portfolioPrices" in f.stateNode.state) {
          return f.stateNode;
        }
        f = f.return;
      }
      return null;
    })()`;
    await page.keyboard.press("p");     // opens the view → starts a refresh
    await page.waitForTimeout(250);     // …still in flight
    const added = await page.evaluate(`(() => {
      const app = ${REACH};
      if (!app) return false;
      app.handleAddHolding("ETH", 2);
      return true;
    })()`);
    check(added, "the portfolio app is reachable to add a holding");
    slow = false;
    await page.waitForTimeout(6000);    // long past the run, far short of the 60s interval
    const state = await page.evaluate(`(() => {
      const app = ${REACH};
      if (!app) return null;
      return { coins: app.state.portfolio.map((h) => h.coin),
               priced: Object.keys(app.state.portfolioPrices) };
    })()`);
    const missing = state ? state.coins.filter((c) => !state.priced.includes(c)) : ["?"];
    check(missing.length === 0,
      "a holding added mid-refresh is priced without waiting for the interval",
      missing.length ? `no price for ${missing.join(", ")}` : "");
    await ctx.close();
  }

  /* ── Two structural costs from the August 2026 optimization review ─────
   *
   * Counts, never wall-clock: a timing threshold in CI measures the machine.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // Full coverage: the bulk response already holds every coin the ticker wants
    const FULL = SUGGESTED.map((sym, i) => ({
      id: i, symbol: sym, name: sym, price_usd: String(100 + i),
      percent_change_24h: String((i % 7) - 3),
      market_cap_usd: "1000000", volume24: "50000",
    }));
    const asked = [];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      asked.push(u);
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("coinlore") && u.includes("tickers"))
        return r.fulfill(json({ data: FULL, info: { coins_num: 100 } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_page_ticker_enabled", "true");
      localStorage.removeItem("crypto_chart_ticker_cache");
    });
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.evaluate(`(() => {
      window.__c = { line: 0, root: 0 };
      const L = LineBase.prototype.render;
      LineBase.prototype.render = function () { window.__c.line++; return L.apply(this, arguments); };
      const C = CryptoChart.prototype.render;
      CryptoChart.prototype.render = function () { window.__c.root++; return C.apply(this, arguments); };
      return true;
    })()`);
    await page.waitForFunction(`(() => {
      const h = document.querySelector("[data-tour='portfolio']") || document.body;
      const k = Object.keys(h).find((x) => x.startsWith("__reactInternalInstance") || x.startsWith("__reactFiber"));
      let f = k ? h[k] : null;
      while (f) {
        if (f.stateNode && f.stateNode.state && f.stateNode.state.pageTickerReady) return true;
        f = f.return;
      }
      return false;
    })()`, { timeout: 30000 });
    await page.waitForTimeout(1200);

    const sweep = await page.evaluate(`(() => {
      const h = document.querySelector("[data-tour='portfolio']") || document.body;
      const k = Object.keys(h).find((x) => x.startsWith("__reactInternalInstance") || x.startsWith("__reactFiber"));
      let f = k ? h[k] : null;
      while (f) {
        if (f.stateNode && f.stateNode.state && "coinOptions" in f.stateNode.state) {
          return { root: window.__c.root, line: window.__c.line,
                   items: (f.stateNode.state.pageTickerItems || []).length };
        }
        f = f.return;
      }
      return null;
    })()`);
    check(sweep && sweep.items > 40,
      "the ticker is filled from the bulk response",
      sweep ? `${sweep.items} items` : "no state");
    /* The fallback loop used to walk all 66 coins in fours whatever the bulk
     * sweep achieved — publishing after each group and sleeping 500ms before
     * the next. Measured at 19 root renders for a sweep that needed none of
     * them. The `needsCoinSweep()` guard does not prevent this: it asks
     * whether anything is watching, not whether there is work. */
    check(sweep && sweep.root <= 6,
      "a fully covered sweep publishes once, not once per batch",
      sweep ? `${sweep.root} root renders` : "n/a");

    // Unrelated root state must not reach the chart
    await page.evaluate("window.__c.line = 0; window.__c.root = 0;");
    const un = await page.evaluate(`(async () => {
      const h = document.querySelector("[data-tour='portfolio']") || document.body;
      const k = Object.keys(h).find((x) => x.startsWith("__reactInternalInstance") || x.startsWith("__reactFiber"));
      let f = k ? h[k] : null, app = null;
      while (f) {
        if (f.stateNode && f.stateNode.state && "coinOptions" in f.stateNode.state) { app = f.stateNode; break; }
        f = f.return;
      }
      for (let i = 0; i < 5; i++) {
        await new Promise((res) => app.setState({ tickerText: "x".repeat(i + 1) }, res));
      }
      return { root: window.__c.root, line: window.__c.line };
    })()`);
    /* `{ ...theme, color: colors }` was built inside render, so every root
     * update handed styled-components a new context value and `LineBase` —
     * which takes the theme through `withTheme` — re-rendered for a change to
     * the scrolling tab title. */
    check(un.root >= 5 && un.line === 0,
      "unrelated root state never redraws the chart",
      `${un.root} root, ${un.line} chart`);
    await ctx.close();
  }

  await browser.close();
  if (failed) {
    console.error(`\n✘ ${failed} POLISH CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log("ALL POLISH TESTS PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
