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

/* `delay` holds the history endpoint back so a switch can be watched while it
 * is still in flight — answered instantly, the loading state never happens and
 * §8 would be testing nothing. `perCoin` gives each symbol its own shape, so a
 * switch has something to morph into; off by default because §6 hands in
 * deliberately degenerate series and scaling them would make them ordinary. */
const newCtx = async (browser, init, prices = PRICES, delay = 0, perCoin = false) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith("file://")) return r.continue();
    if (u.includes("historic")) {
      const m = perCoin && u.match(/prices\/([A-Z]+)-/);
      const seed = m ? (m[1].charCodeAt(0) % 7) + 2 : 0;
      const body = json({
        data: {
          prices: seed
            ? prices.map((p, i) => ({
                price: (Number(p.price) * seed + Math.sin(i / seed) * 900 * seed).toFixed(2),
                time: p.time,
              }))
            : prices,
        },
      });
      if (!delay) return r.fulfill(body);
      return setTimeout(() => r.fulfill(body), delay);
    }
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
  const out = { unreachable: [], unnamed: [], unlabelled: [], untyped: [], unthemed: [] };
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
    /* A button with no type attribute IS a submit button, and this app has a
     * form on its busiest tab. Read the attribute, never the property — the
     * property answers "submit" for a button that never said so, which is
     * exactly the confusion that let this ship. */
    if (el.tagName === "BUTTON" && !el.getAttribute("type")) {
      out.untyped.push(
        'BUTTON "' + (text || (el.getAttribute("aria-label") || "?")) + '"');
    }
    /* A scrollbar the browser draws itself is drawn by the operating system:
     * on the dark theme it arrives as a pale grey bar on a black panel, which
     * is the loudest thing on screen and belongs to nothing around it. Half
     * the scrolling surfaces here were themed and half were not, so this
     * checks the half nobody would think to look at. Only elements that can
     * actually scroll — a themed rule on a box that never overflows proves
     * nothing either way. */
    const scrolls =
      (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) ||
      (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 4);
    if (scrolls && cs.scrollbarWidth !== "thin") {
      out.unthemed.push(el.tagName + "." + (el.className || "").toString().split(" ")[0]);
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
    const found = { unreachable: [], unnamed: [], unlabelled: [], untyped: [], unthemed: [] };
    const sweep = async (where) => {
      const r = await page.evaluate(AUDIT);
      for (const k of Object.keys(found)) {
        for (const item of r[k]) found[k].push(`${where}: ${item}`);
      }
    };
    await sweep("chart");
    await page.keyboard.press("s");
    await page.waitForTimeout(600);
    /* With something typed, or the suggestion chips are not on the page and
     * the sweep never sees them — which is exactly where the missing `type`
     * did its damage (§9). A surface only counts as audited when the controls
     * that appear on demand have been made to appear. */
    await page.click('input[placeholder="Search name or symbol"]');
    await page.keyboard.type("in");
    await page.waitForTimeout(700);
    await sweep("settings · coins");
    await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")]
      .find((e) => e.textContent.trim() === "Preferences"); if (b) b.click(); })()`);
    await page.waitForTimeout(500);

    /* The headline line under the price appears without being asked for, so
     * the switch that stops it has to be reachable without a hunt. It was
     * third in a closed accordion called "Under the price", and was reported
     * as missing — someone looking straight at the headlines does not think
     * "accordion". Asserted before anything is expanded, on purpose.
     *
     * Scrolling to it is fine and is not what this tests: with eighteen
     * settings, something is always below the fold. What is not fine is a
     * control that is not there at all until you guess which accordion holds
     * it. `checkVisibility` with the opacity check is exactly that line — a
     * shut group is opacity 0, a scrolled-past one is not. */
    const reachable = await page.evaluate(`(() => {
      const t = [...document.querySelectorAll("*")].find(
        (e) => e.children.length === 0 && /^Move Headlines$/i.test((e.textContent || "").trim()));
      if (!t) return { found: false };
      const b = t.getBoundingClientRect();
      /* getBoundingClientRect is not a visibility test here, and that is the
         whole trap: a collapsed group is max-height 0 with opacity 0 and
         overflow hidden, and the text inside it still reports its full box.
         The first version of this check passed with the group shut. What does
         answer is checkVisibility with the opacity check on, plus asking
         whether the element is inside the box that is clipping it.
         (No backticks in here: this is inside a template literal.) */
      const vis = typeof t.checkVisibility === "function"
        ? t.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : b.height > 0;
      return { found: true, visible: vis, offset: Math.round(b.top) };
    })()`);
    check(reachable.found && reachable.visible,
      "the move-headlines switch is not hidden inside a shut group",
      JSON.stringify(reachable));

    // Every group open, or half the controls are never audited
    await page.evaluate(`(() => { document.querySelectorAll("h4").forEach((h) => {
      if (h.getAttribute("aria-expanded") === "false") h.click(); }); })()`);
    await page.waitForTimeout(500);
    await sweep("settings · preferences");

    /* The settings list scrolls under the tab strip, and its content has to
     * **arrive** rather than be sliced. With nothing here, scrolling put a
     * group heading half a line under the PREFERENCES underline, cut clean
     * through its letters — two lines of type meeting with nothing between
     * them. Found by screenshotting the panel, not by measuring it: every box
     * was exactly where it belonged and the defect was the clipping edge, so
     * a geometry assertion could never have seen it. The same treatment the
     * news list and the targets panel use at their foot. */
    const fade = await page.evaluate(`(() => {
      const el = [...document.querySelectorAll("div")].find((d) => {
        const cs = getComputedStyle(d);
        return cs.overflowY === "auto" && d.scrollHeight > d.clientHeight + 20;
      });
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { mask: cs.maskImage || cs.webkitMaskImage || "none",
               padTop: cs.scrollPaddingTop };
    })()`);
    check(fade && /gradient/.test(fade.mask),
      "the settings list fades at its edges instead of slicing the text",
      fade ? JSON.stringify(fade) : "no scrolling settings list found");

    await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")]
      .find((e) => e.textContent.trim() === "Widgets"); if (b) b.click(); })()`);
    await page.waitForTimeout(500);
    await sweep("settings · widgets");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("a");
    await page.waitForTimeout(700);
    await sweep("targets");

    /* Finding a coin here used to mean scrolling a native select over all 81,
     * in a panel people come to type a number. It is a search box now, sharing
     * the matcher the "/" jumper uses — so a full name finds a symbol, and the
     * two pickers cannot disagree about what a query means. */
    const coinField = 'input[aria-label="Target coin"]';
    check(await page.evaluate(`(() => Boolean(document.querySelector('${coinField}')))()`),
      "the target form's coin field is searchable");
    await page.click(coinField);
    await page.keyboard.type("synth");
    await page.waitForTimeout(350);
    const hits = await page.evaluate(`(() => [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((t) => /Synthetix/.test(t)))()`);
    check(hits.length === 1,
      "…and a full name finds the symbol", JSON.stringify(hits));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    check((await page.inputValue(coinField)) === "SNX",
      "…and Enter takes the highlighted row",
      await page.inputValue(coinField));

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
    /* `styled.button.attrs(() => ({ type: "button" }))` is a no-op in
     * styled-components 3.4.6 — v3's `attrs` takes an object and the callback
     * form is v4+ — so 34 buttons across five files defaulted to `submit`. The
     * coin chips sit inside a `<form onSubmit>`, which is §9. */
    check(uniq(found.untyped).length === 0,
      "…and every button says what kind of button it is",
      uniq(found.untyped).slice(0, 3).join(" | "));
    check(uniq(found.unthemed).length === 0,
      "…and every scrollbar is the theme's, not the operating system's",
      uniq(found.unthemed).slice(0, 3).join(" | "));
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

  // ── 8. a switch is a transition, not a teardown ────────────────────────
  /* Switching coin used to unmount `LineBase`: the skeleton took the chart,
   * the range switcher and the price block for the length of the fetch, and
   * the chart that came back afterwards was a new component drawing itself in
   * from the left. Run against that code every check here fails: the chart
   * element leaves the document, the column collapses 119px at this viewport
   * because the skeleton is shorter than the figures it replaced, the range
   * switcher goes with it, nothing is ever shown as superseded, and the path
   * arrives in one step (1 shape) instead of growing out of the old one (38). */
  {
    const { ctx, page } = await newCtx(
      browser,
      () => {
        localStorage.setItem("crypto_chart_onboarding_seen", "1");
        localStorage.setItem("crypto_chart_coin_options", JSON.stringify(["BTC", "ETH"]));
      },
      PRICES,
      600,
      true,
    );
    const watch = page.evaluate(`(() => new Promise((res) => {
      const chart = [...document.querySelectorAll("svg")]
        .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      const line = () => [...chart.querySelectorAll("path")]
        .sort((a, b) => (b.getAttribute("d") || "").length - (a.getAttribute("d") || "").length)[0];
      const named = (t) => [...document.querySelectorAll("button, span")]
        .some((e) => e.textContent.trim() === t);
      /* The slot, not the drawing: it is there in both states, so "did the
       * layout hold still" stays an answerable question even in the version
       * where the chart itself is taken away. Everything here is recorded
       * every frame for the same reason — a check that stops looking once the
       * chart is gone passes for the wrong reason. */
      const slot = chart.closest("section");
      const shapes = [];
      const out = { kept: true, tops: [], switcher: true, blanked: false };
      const t0 = performance.now();
      const tick = () => {
        if (!document.contains(chart)) out.kept = false;
        out.tops.push(Math.round(slot.getBoundingClientRect().top));
        if (!named("1W")) out.switcher = false;
        if (Number(getComputedStyle(slot).opacity) < 1) out.blanked = true;
        const path = document.contains(chart) && line();
        const d = path && path.getAttribute("d");
        if (d && shapes[shapes.length - 1] !== d) shapes.push(d);
        if (performance.now() - t0 < 1600) requestAnimationFrame(tick);
        else { out.shapes = shapes.length; res(out); }
      };
      requestAnimationFrame(tick);
    }))()`);
    await page.waitForTimeout(60);
    await page.keyboard.press("ArrowRight");
    const w = await watch;
    const travel = w.tops.length ? Math.max(...w.tops) - Math.min(...w.tops) : -1;
    check(w.kept, "the chart is never taken off screen by a coin switch");
    check(travel === 0, "the column holds still while the new coin loads", `${travel}px of travel`);
    check(w.switcher, "the range switcher keeps its buttons through the switch");
    check(w.blanked, "the superseded chart is visibly stale, not solid");
    check(w.shapes > 5,
      "the new series grows out of the old one", `${w.shapes} intermediate shapes`);
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

  // ── 9. clicking a coin suggestion adds one coin ────────────────────────
  /* The symptom §1's `untyped` check guards against, asserted where a person
   * would actually notice it. The suggestion chips are inside the search
   * `<form onSubmit>`, so while they carried no `type` a click ran
   * `handleSuggestionClick(clicked)` *and* submitted the form, which ran it
   * again on `suggestions[0]`: typing "in" and clicking DOGE added DOGE and
   * USDC. `preventDefault` in `handleSubmit` stopped the page reloading, which
   * is the only reason it was ever invisible. Counting the coins is what makes
   * this test independent of which second coin the bug happens to pick. */
  {
    const { ctx, page, errors } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_coin_options", JSON.stringify(["BTC", "ETH"]));
    });
    await page.keyboard.press("s");
    await page.waitForTimeout(700);
    const read = () =>
      page.evaluate(`(() => JSON.parse(localStorage.getItem("crypto_chart_coin_options") || "[]"))()`);
    const before = await read();
    await page.click('input[placeholder="Search name or symbol"]');
    await page.keyboard.type("in");
    await page.waitForTimeout(800);
    /* Not the first suggestion, and this is the whole test.
     *
     * `handleSubmit` falls back to `suggestions[0]` when what was typed is not
     * itself a symbol, so the stray submit adds the *top* result — click the
     * top result and the bug adds the same coin twice, the list grows by one,
     * and the check passes while the defect is live. It has to be a chip
     * further down the list, which is also how the bug was originally seen:
     * typing "in" and clicking DOGE added DOGE and USDC.
     *
     * Suggestions and tracked coins both carry `data-symbol`; only the tracked
     * ones are drag handles. */
    const picked = await page.evaluate(`(() => {
      const have = JSON.parse(localStorage.getItem("crypto_chart_coin_options") || "[]");
      const chips = [...document.querySelectorAll("[data-symbol]")]
        .filter((e) => e.getAttribute("draggable") !== "true" &&
                       !have.includes(e.getAttribute("data-symbol")));
      if (chips.length < 2) return null;
      const chip = chips[chips.length - 1];
      const sym = chip.getAttribute("data-symbol");
      chip.click();
      return { picked: sym, first: chips[0].getAttribute("data-symbol"), n: chips.length };
    })()`);
    check(picked && picked.picked !== picked.first,
      "the search offers more than one coin, and a chip below the top one is clicked",
      picked ? `${picked.n} offered, clicked ${picked.picked}, top was ${picked.first}` : "none");
    await page.waitForTimeout(900);
    const after = await read();
    check(after.length === before.length + 1,
      "clicking a suggestion adds exactly one coin",
      `${before.length} → ${after.length}: ${after.join(",")}`);
    check(Boolean(picked) && after.includes(picked.picked),
      "…and it is the one that was clicked",
      picked ? `${picked.picked} in ${after.join(",")}` : "none");
    check(Boolean(picked) && !after.includes(picked.first),
      "…and the top of the list, which nobody clicked, was not added too",
      picked ? `${picked.first} vs ${after.join(",")}` : "none");
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 10. the news panel ─────────────────────────────────────────────────
  /* The panel replaced a strip inside the portfolio, and it exists because the
   * news itself was the problem: the one keyless feed carried seven outlets and
   * had published nothing for 101 hours. So the two things asserted here are
   * the two the strip could not do — narrow the list, and say how old it is.
   *
   * The opt-in newsrooms are not exercised: they need a real
   * `chrome.permissions` grant, which a file:// page has no API for. What *is*
   * asserted is the half that matters without it — that nothing is fetched
   * from them while nothing is granted. */
  {
    /* An RSS document, built the way a newsroom serves one — including
     * `dc:creator`, because the byline is one of the three things the promo
     * filter reads and a fixture without it cannot exercise that path. */
    const rss = (items) => ({
      status: 200,
      contentType: "application/xml",
      headers: { "access-control-allow-origin": "*" },
      body:
        '<?xml version="1.0"?>' +
        '<rss xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>' +
        items
          .map(
            (i) =>
              "<item><title>" + i.title + "</title>" +
              "<link>" + i.link + "</link>" +
              "<pubDate>" +
              new Date(Date.now() - i.hoursAgo * 3600000).toUTCString() +
              "</pubDate>" +
              (i.author ? "<dc:creator>" + i.author + "</dc:creator>" : "") +
              "</item>",
          )
          .join("") +
        "</channel></rss>",
    });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const asked = [];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      asked.push(u);
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("cointelegraph.com"))
        /* The two stories the assertions are about, plus filler so the list
         * actually overflows — the scrollbar check needs a list that scrolls,
         * and a themed rule on a box that never overflows proves nothing. The
         * filler goes here rather than in the Hacker News response because
         * that fetcher caps itself at `HN_NEWS_MAX_ITEMS`. It names no coin,
         * so the coin-scope assertion below is unaffected.
         *
         * A newsroom rather than Blockchair, which used to carry this and is
         * no longer a source at all. That makes this the RSS path, which is
         * what actually ships. */
        return r.fulfill(rss([
          { title: "Bitcoin drifts sideways in thin trade",
            link: "https://cointelegraph.com/news/a", hoursAgo: 72 },
          { title: "Solana validators complete upgrade",
            link: "https://cointelegraph.com/news/b", hoursAgo: 80 },
          /* One advertisement, filed by the outlet in its own press-releases
           * section exactly as CryptoSlate and Cointelegraph file theirs. It
           * must not appear in the panel — see the check below. */
          { title: "TokenX announces its groundbreaking Series B and new exchange listing",
            link: "https://cointelegraph.com/press-releases/tokenx-series-b", hoursAgo: 2 },
          /* And one filed as ordinary news but written by the wire that
           * distributes press releases. The path cannot catch this one. */
          { title: "GreatChain unveils its next-generation settlement layer",
            link: "https://cointelegraph.com/news/greatchain-settlement", hoursAgo: 3,
            author: "Chainwire" },
          ...Array.from({ length: 26 }, (_, i) => ({
            title: `Filler story ${i} on flows and positioning`,
            link: `https://cointelegraph.com/news/f${i}`,
            hoursAgo: 100 + i,
          })),
        ]));
      if (u.includes("hn.algolia.com"))
        return r.fulfill(json({ hits: [
          { objectID: "1", title: "Ethereum rollup costs fall again",
            url: "https://example.com/c", points: 200,
            created_at_i: Math.floor(Date.now() / 1000) - 1800 },
        ] }));
      if (u.includes("coinlore") && u.includes("tickers"))
        return r.fulfill(json({ data: TICKERS, info: { coins_num: 100 } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      /* Granted from the start here, so the panel has a real newsroom to fill
       * with. Whether anything is fetched *before* a grant is §10b's subject,
       * where it is tested properly from both sides. (No backticks in this
       * comment: it is inside a template literal and one would end it.) */
      window.chrome = window.chrome || {};
      window.chrome.runtime = window.chrome.runtime || {};
      window.chrome.permissions = {
        contains: (o, cb) => cb(true),
        request: (o, cb) => cb(true),
        remove: (o, cb) => cb(true),
      };
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_news_ticker_enabled", "false");
      localStorage.setItem("crypto_chart_move_headlines", "false");
      localStorage.removeItem("crypto_chart_news_cache");
      localStorage.setItem("crypto_chart_coin_options", JSON.stringify(["BTC", "ETH"]));
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.keyboard.press("n");
    await page.waitForTimeout(2500);
    const read = () => page.evaluate(`(() => {
      const card = document.querySelector('[role="dialog"][aria-label="News"]');
      if (!card) return null;
      const rows = [...card.querySelectorAll("a[target=_blank]")];
      return {
        head: (card.textContent.match(/\\d+ stor(y|ies)/) || [""])[0],
        rows: rows.map((a) => a.textContent),
        hrefs: rows.map((a) => a.getAttribute("href")),
        stale: /has published nothing since then/i.test(card.textContent),
        /* The list's own scrollbar. On the dark theme an unthemed one is a
         * pale grey bar down a black panel — the loudest thing on screen, and
         * belonging to nothing around it. Checked here rather than in §1's
         * sweep because this is a list that is guaranteed to overflow. */
        scroll: (() => {
          const l = [...card.querySelectorAll("div")]
            .find((d) => d.scrollHeight > d.clientHeight + 20);
          if (!l) return null;
          const cs = getComputedStyle(l);
          return { width: cs.scrollbarWidth, color: cs.scrollbarColor };
        })(),
        access: /newsrooms are one click away/i.test(card.textContent),
      };
    })()`);
    const at = await read();
    check(at !== null, "N opens the news panel", JSON.stringify(at));
    const named = ["drifts sideways", "Solana validators", "rollup costs"];
    check(at && named.every((t) => at.rows.some((r) => r.includes(t))),
      "…listing every story from every source",
      at ? `${at.rows.length} rows` : "none");
    /* The age column is the panel's reason for existing. A three-day-old story
     * that says "3d" is a fact; the same story with nothing beside it is what
     * the ticker was doing for four days. */
    check(at && at.rows.some((t) => /^3d/.test(t)) && at.rows.some((t) => /^30m/.test(t)),
      "…each with its age against it", at ? JSON.stringify(at.rows.map((r) => r.slice(0, 6))) : "none");
    check(at && at.stale,
      "…and a source that has gone quiet is called out rather than left looking live");
    check(at && at.scroll && at.scroll.width === "thin",
      "…and the list it scrolls in uses the theme's scrollbar, not the OS one",
      at ? JSON.stringify(at.scroll) : "none");
    check(at && at.hrefs.every((h) => /^https:\/\//.test(h || "")),
      "every headline is a link out", at ? JSON.stringify(at.hrefs) : "none");

    /* A headline says it is a link when you reach for it, and not before.
     * The underline is always present and starts transparent, so the line's
     * box never changes and a row of headlines does not twitch as the pointer
     * runs down it — which is why this reads the decoration *colour* rather
     * than whether a decoration exists. */
    const ink = async () => page.evaluate(`(() => {
      const card = document.querySelector('[role="dialog"][aria-label="News"]');
      const row = card && card.querySelector("a[target=_blank]");
      if (!row) return null;
      const title = row.lastElementChild;
      const cs = getComputedStyle(title);
      return { color: cs.textDecorationColor, line: cs.textDecorationLine,
               offset: cs.textUnderlineOffset };
    })()`);
    const rest = await ink();
    const rowBox = await page.evaluate(`(() => {
      const card = document.querySelector('[role="dialog"][aria-label="News"]');
      const r = card.querySelector("a[target=_blank]").getBoundingClientRect();
      /* The **age** column, deliberately: the whole row is the link, so
         hovering the timestamp has to underline the headline too. Hovering the
         title itself proves nothing here — the shared fragment carries its own
         hover rule, so that case passes with the row-level rule deleted. */
      return { x: Math.round(r.x + 18), y: Math.round(r.y + r.height / 2) };
    })()`);
    await page.mouse.move(rowBox.x, rowBox.y);
    await page.waitForTimeout(400);
    const hovered = await ink();
    check(rest && /underline/.test(rest.line) &&
      /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(rest.color),
      "a headline is not underlined until you reach for it",
      JSON.stringify(rest));
    check(hovered && hovered.color !== rest.color &&
      !/rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(hovered.color),
      "…and is underlined the moment you do",
      JSON.stringify(hovered));
    await page.mouse.move(4, 4);
    await page.waitForTimeout(300);

    /* ADVERTISING DOES NOT REACH THE PANEL.
     *
     * Two of the fixture's stories are advertisements and neither is caught by
     * wording — they are the two shapes measured on the live feeds. One is
     * filed by the outlet under `/press-releases/`; the other is filed as
     * ordinary news and given away only by its byline, `Chainwire`, the wire
     * that distributes press releases. Both are newer than everything else in
     * the feed, so a panel sorted newest-first would put them at the very top.
     *
     * Dropped rather than labelled: a "sponsored" badge is still the
     * advertisement on screen. */
    check(at && !at.rows.some((t) => /TokenX/.test(t)),
      "the press release the outlet filed as one never reaches the list",
      at ? JSON.stringify(at.rows.filter((t) => /TokenX/.test(t))) : "none");
    check(at && !at.rows.some((t) => /GreatChain/.test(t)),
      "…nor the one that only its byline gives away",
      at ? JSON.stringify(at.rows.filter((t) => /GreatChain/.test(t))) : "none");
    check(at && at.rows.some((t) => /drifts sideways/.test(t)),
      "…while the reporting beside them is untouched");

    // Narrowing by coin: "My coins" is BTC and ETH, so the SOL story goes
    await page.evaluate(`(() => {
      const b = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === "My coins");
      if (b) b.click();
    })()`);
    await page.waitForTimeout(400);
    const scoped = await read();
    check(scoped && scoped.rows.length === 2 && !scoped.rows.some((t) => /Solana/.test(t)),
      "the coin scope drops what is not about your coins",
      scoped ? JSON.stringify(scoped.rows.map((r) => r.slice(0, 40))) : "none");

    // Search narrows further, and the count in the head follows the list
    await page.click('input[placeholder="Search headlines…"]');
    await page.keyboard.type("rollup");
    await page.waitForTimeout(400);
    const searched = await read();
    check(searched && searched.rows.length === 1 && /1 story/.test(searched.head),
      "search narrows the list, and the head agrees with it",
      searched ? `${searched.head} / ${searched.rows.length}` : "none");

    // Esc from inside the search box closes the panel, not just the search
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    check((await read()) === null, "Escape in the search box closes the panel");
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 10b. the opt-in newsrooms ──────────────────────────────────────────
  /* The permission flow, with `chrome.permissions` stubbed — a file:// page has
   * no extension APIs, so without a stub this whole surface never renders and
   * the most important claim the panel makes goes untested.
   *
   * The claim: nothing is fetched from a newsroom until Chrome says yes, and
   * everything is fetched the moment it does. Both halves are one line away
   * from being false, and neither would look wrong on screen. */
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
      if (u.includes("blockchair.com/news")) return r.fulfill(json({ data: [] }));
      if (u.includes("hn.algolia.com")) return r.fulfill(json({ hits: [] }));
      if (u.includes("cointelegraph.com"))
        return r.fulfill({
          status: 200,
          contentType: "application/xml",
          headers: { "access-control-allow-origin": "*" },
          body:
            "<rss><channel><item><title>Bitcoin breaks above its 200-day average</title>" +
            "<link>https://cointelegraph.com/x</link>" +
            "<pubDate>" + new Date(Date.now() - 3600000).toUTCString() + "</pubDate>" +
            "</item></channel></rss>",
        });
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      /* A stub that behaves like Chrome's: contains answers what is granted
       * now, request grants and answers true. The real one only grants from a
       * user gesture, which is why the panel calls it straight out of the
       * click rather than after an await. (No backticks in here: this comment
       * is inside a template literal, and one would end it.) */
      window.chrome = window.chrome || {};
      window.chrome.runtime = window.chrome.runtime || {};
      window.__granted = false;
      window.chrome.permissions = {
        contains: (o, cb) => cb(window.__granted === true),
        request: (o, cb) => { window.__asked = o; window.__granted = true; cb(true); },
        remove: (o, cb) => { window.__granted = false; cb(true); },
      };
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_news_ticker_enabled", "false");
      localStorage.setItem("crypto_chart_move_headlines", "false");
      localStorage.removeItem("crypto_chart_news_cache");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.keyboard.press("n");
    await page.waitForTimeout(1200);

    const card = () => page.evaluate(`(() => {
      const c = document.querySelector('[role="dialog"][aria-label="News"]');
      if (!c) return null;
      const btn = [...c.querySelectorAll("button")].find(
        (b) => /Turn on full sources/i.test(b.textContent));
      return {
        asks: /newsrooms are one click away/i.test(c.textContent),
        on: /Reading \\d+ newsrooms directly/i.test(c.textContent),
        off: Boolean([...c.querySelectorAll("button")].find((b) => b.textContent.trim() === "Turn off")),
        hasBtn: Boolean(btn),
        rows: [...c.querySelectorAll("a[target=_blank]")].map((a) => a.textContent),
      };
    })()`);

    const before = await card();
    check(before && before.asks && before.hasBtn,
      "with nothing granted the panel offers to ask", JSON.stringify(before));
    /* Nothing is fetched from *any* newsroom nobody has granted. This is the
     * whole privacy claim of the opt-in design and it is one line from being
     * false, so it names all six rather than the one this fixture serves.
     * §10 used to carry this check too and now grants from the start, so this
     * is the only place it lives — hence all six. */
    const optional = /cointelegraph|decrypt\.co|cryptoslate|bitcoinmagazine|coinjournal|bbci/;
    check(!asked.some((u) => optional.test(u)),
      "…and has contacted no opt-in newsroom meanwhile",
      asked.filter((u) => optional.test(u)).join(" "));

    /* The other half of the same claim, and the one that makes the panel worth
     * opening on a fresh install: the sources that need no permission are read
     * straight away. All three answer `Access-Control-Allow-Origin: *`, which
     * is the whole reason they can be. If one ever stops, this fails here
     * rather than quietly leaving new users on Hacker News alone. */
    const free = [
      ["Yahoo Finance", /finance\.yahoo\.com/],
      ["CNBC", /search\.cnbc\.com/],
      ["MarketWatch", /feeds\.content\.dowjones\.io/],
      ["Hacker News", /hn\.algolia\.com/],
    ];
    const missing = free.filter(([, re]) => !asked.some((u) => re.test(u)));
    check(missing.length === 0,
      "…while every source that needs no permission is read straight away",
      missing.map(([n]) => n).join(", "));

    await page.evaluate(`(() => {
      const c = document.querySelector('[role="dialog"][aria-label="News"]');
      [...c.querySelectorAll("button")]
        .find((b) => /Turn on full sources/i.test(b.textContent)).click();
    })()`);
    await page.waitForTimeout(2500);

    /* The origins asked for are the manifest's, not a subset: asking for five
     * of six leaves one newsroom that quietly never loads. */
    const requested = await page.evaluate(`(() => (window.__asked || {}).origins || [])()`);
    check(requested.length === 6 && requested.every((o) => /^https:\/\//.test(o)),
      "the request names all six origins", JSON.stringify(requested));

    const after = await card();
    check(after && after.on && after.off,
      "…and once granted the panel says so, and offers the way back",
      JSON.stringify(after));
    check(asked.some((u) => u.includes("cointelegraph.com")),
      "…and the newsrooms are read immediately, not at the next poll",
      String(asked.filter((u) => u.includes("cointelegraph")).length));
    check(after && after.rows.some((t) => /200-day average/.test(t)),
      "…with their stories in the list",
      after ? JSON.stringify(after.rows) : "none");
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 9b. the crosshair fills itself when the candles it asked for land ──
  /* Chart Details showed nothing on the first hover of a session and filled in
   * only when the pointer moved again. It read as "1H has no chart details",
   * because 1H is the range a tab opens on and is therefore always the hover
   * that pays for the cold candle fetch; switching to 1D and back appeared to
   * fix it only because that is another pointer move.
   *
   * Two things had to be true and neither was: the chart has to redraw the
   * readout when the candles arrive, and `drawCrosshair` has to be told that
   * the point it already described is no longer described correctly — its memo
   * returns early while the nearest data point is unchanged, which is exactly
   * the case here. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const NOW_C = Math.floor(Date.now() / 1000);
    const LINE = Array.from({ length: 120 }, (_, i) => ({
      price: (43000 + Math.sin(i / 7) * 300).toFixed(2), time: NOW_C - (120 - i) * 30 }));
    // Newest first, like the real endpoint
    const BARS = Array.from({ length: 300 }, (_, i) => {
      const t = NOW_C - i * 60, b = 43000 + Math.sin(i / 7) * 300;
      return [t, b - 40, b + 40, b - 10, b + 10, 12.5];
    });
    await ctx.route("**/*", async (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: LINE } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("api.exchange.coinbase.com")) {
        // A cold fetch takes time, which is the whole point of this block
        await new Promise((s) => setTimeout(s, 400));
        return r.fulfill(json(BARS));
      }
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_ohlc_enabled", "true");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);
    const box = await page.evaluate(`(() => {
      const s = [...document.querySelectorAll("svg")].sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height; })[0];
      window.__chart = s;
      const b = s.getBoundingClientRect();
      return { x: Math.round(b.x + b.width * 0.5), y: Math.round(b.y + b.height * 0.5) };
    })()`);
    // ONE move, then hold perfectly still while the request lands
    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(1800);
    const rows = await page.evaluate(`(() => [...window.__chart.querySelectorAll("text")]
      .map((n) => (n.textContent || "").trim()).filter(Boolean))()`);
    const named = ["Open", "High", "Low", "Close"];
    check(named.every((k) => rows.includes(k)),
      "one hover, held still, fills the OHLC readout when the candles land",
      JSON.stringify(rows));
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 9c. the portfolio's allocation strip ───────────────────────────────
  /* "How much" was answered six ways in the header and "of what" was not
   * answered at all — five percentages down a column is a table, not a shape.
   *
   * It was a donut until 22 Aug 2026, and two things were wrong with it. The
   * hole is 102px across, the label under the figure measured 97.6px, and at
   * that label's height the chord is 99.6px — so it filled the hole wall to
   * wall and read as text spilling onto the ring. Worse, at rest the centre
   * fell back to `slices[0]`, so a ring nobody was touching read `BTC 46.0%`:
   * the hovered state, for a coin the pointer was nowhere near.
   *
   * The strip that replaced it is the same drawing as the share bar on every
   * row below it, which is the claim asserted here: same palette, same order,
   * same ink, so the list is the legend and no second block of colour keys is
   * needed. If those ever drift apart the strip becomes unreadable.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const T = Math.floor(Date.now() / 1000);
    const PRICED = [
      { symbol: "BTC", price_usd: "68000", percent_change_24h: "2.1" },
      { symbol: "ETH", price_usd: "3400", percent_change_24h: "-1.2" },
      { symbol: "SOL", price_usd: "180", percent_change_24h: "5.4" },
    ];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) {
        const m = u.match(/prices\/([A-Z0-9]+)-/);
        const base = { BTC: 68000, ETH: 3400, SOL: 180 }[m && m[1]] || 100;
        return r.fulfill(json({ data: { prices: Array.from({ length: 60 }, (_, i) => ({
          price: (base * (1 + i * 0.0005)).toFixed(6), time: T - (60 - i) * 3600 })) } }));
      }
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "68000.00", currency: "USD" } }));
      if (u.includes("coinlore") && u.includes("tickers"))
        return r.fulfill(json({ data: PRICED, info: { coins_num: 100 } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_portfolio", JSON.stringify([
        { coin: "BTC", amount: 0.42, lots: [] },
        { coin: "ETH", amount: 6.5, lots: [] },
        { coin: "SOL", amount: 40, lots: [] }
      ]));
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // A React error boundary swallows the throw, so `pageerror` alone reports
    // "errors: none" while the whole view reads "Something went wrong."
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("p");
    await page.waitForTimeout(3000);

    const strip = await page.evaluate(`(() => {
      const bar = [...document.querySelectorAll("div")].find(
        (d) => /^Allocation:/.test(d.getAttribute("aria-label") || ""));
      if (!bar) return null;
      const segs = [...bar.children];
      return {
        label: bar.getAttribute("aria-label"),
        segments: segs.length,
        inks: segs.map((a) => getComputedStyle(a).backgroundColor),
        reachable: segs.every((a) => a.getAttribute("tabindex") === "0"),
        named: segs.every((a) => (a.getAttribute("aria-label") || "").length > 2),
        text: segs.map((a) => (a.textContent || "").trim()).filter(Boolean),
        height: Math.round(bar.getBoundingClientRect().height),
      };
    })()`);
    check(strip !== null, "the portfolio draws an allocation strip", JSON.stringify(strip));
    check(strip && strip.segments === 3,
      "…one segment per holding", strip ? String(strip.segments) : "none");
    check(strip && new Set(strip.inks).size === 3,
      "…each a different colour", strip ? JSON.stringify(strip.inks) : "none");
    check(strip && strip.reachable && strip.named,
      "…and every segment can be reached and named from the keyboard");
    check(strip && /Allocation: BTC \d/.test(strip.label),
      "…with the whole split readable without a pointer", strip ? strip.label : "none");

    /* A segment names itself when it is wide enough to hold a label, which is
     * the whole reason this replaced a shape you had to hover. */
    check(strip && strip.text.some((t) => /^BTC \d+%$/.test(t)),
      "…and a wide segment carries its own label",
      strip ? JSON.stringify(strip.text) : "none");

    /* The header must not name a coin as though it were being pointed at —
     * the defect the donut's centre had at rest. */
    const head = await page.evaluate(`(() => {
      const bar = [...document.querySelectorAll("div")].find(
        (d) => /^Allocation:/.test(d.getAttribute("aria-label") || ""));
      const block = bar && bar.parentElement;
      const label = block && block.firstElementChild;
      return label ? (label.textContent || "").trim() : null;
    })()`);
    check(head !== null && /in one holding/.test(head) && !/BTC|ETH|SOL/.test(head),
      "the strip's label states concentration without naming a coin",
      String(head));

    /* The list is the legend: a row's share bar is the same ink as its
     * segment in the strip. Checked against the strip's own colours rather
     * than against a hard-coded palette, because the point is that they
     * agree, not what they are. */
    const bars = await page.evaluate(`(() => {
      // The share bar is the only 2px-tall absolutely-positioned strip here
      return [...document.querySelectorAll("div")]
        .filter((d) => {
          const cs = getComputedStyle(d);
          return cs.position === "absolute" && cs.height === "2px" &&
            d.getBoundingClientRect().width > 0;
        })
        .map((d) => getComputedStyle(d).backgroundColor);
    })()`);
    const toRgb = (s) => s.replace(/\s/g, "");
    check(bars.length >= 3 && strip !== null && bars.slice(0, 3).every((b) =>
        strip.inks.map(toRgb).includes(toRgb(b))),
      "…and each holding's bar is its own segment's colour",
      JSON.stringify({ bars, inks: strip && strip.inks }));

    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 10c. a fetch that comes back with nothing has to say so ────────────
  /* "Fetching headlines…" used to be shown whenever the list was empty,
   * because the loading flag was `newsItems.length === 0` — an emptiness flag
   * wearing a loading flag's name. A fetch where nothing answered never
   * reached `setState` at all, so the panel sat on "Fetching headlines…" for
   * ever, and a refresh that had failed was indistinguishable on screen from
   * one still running. That is what "turn on full sources does nothing" looks
   * like: the grant succeeds, the panel says it is reading six newsrooms, and
   * the list below it waits for a fetch that finished long ago.
   *
   * Everything is granted here and every source refuses, which is also the
   * one case where a reload is the answer — so the panel has to name it
   * rather than leave someone watching a spinner that is not spinning. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      // Every news source refuses, the way a blocked origin does
      if (/cointelegraph|decrypt|cryptoslate|bitcoinmagazine|coinjournal|bbci|algolia/.test(u)) {
        return r.abort();
      }
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      window.chrome = window.chrome || {};
      window.chrome.runtime = window.chrome.runtime || {};
      window.chrome.permissions = {
        contains: (o, cb) => cb(true),
        request: (o, cb) => cb(true),
        remove: (o, cb) => cb(true),
      };
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_news_ticker_enabled", "false");
      localStorage.setItem("crypto_chart_move_headlines", "false");
      localStorage.removeItem("crypto_chart_news_cache");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("n");
    await page.waitForTimeout(3000);

    const said = await page.evaluate(`(() => {
      const c = document.querySelector('[role="dialog"][aria-label="News"]');
      return c ? c.textContent : null;
    })()`);
    check(said !== null && !/Fetching headlines/.test(said),
      "a finished fetch stops claiming to be fetching",
      said ? said.slice(0, 160) : "no panel");
    check(said !== null && /No headlines came back/.test(said),
      "…and says what actually happened instead",
      said ? said.slice(0, 160) : "no panel");
    check(said !== null && /reload/i.test(said),
      "…including the one thing that fixes it when every granted source fails",
      said ? said.slice(0, 240) : "no panel");
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 11. "what happened here?" — marks, and what one costs ──────────────
  /* The economics are the feature: where the marks go is worked out from the
   * series already on screen, so a chart nobody points at makes no request,
   * and only a hover asks for a window. If that ever inverts — a request per
   * chart, or a request per mark on load — the feature stops being affordable
   * and nothing on screen would say so. */
  {
    const NOW_MS = Math.floor(Date.now() / 1000);
    /* A calm series with three deliberate spikes. Calm matters: the threshold
     * is in standard deviations of the series' own steps, so on a series that
     * is spikes all the way down nothing stands out and there is nothing to
     * mark — which is correct, and would make this test prove nothing. */
    const spiky = Array.from({ length: 200 }, (_, i) => {
      let p = 43000 + Math.sin(i / 9) * 120 + i * 3;
      if (i === 60) p -= 2600;
      if (i === 120) p += 3100;
      if (i === 160) p -= 2200;
      return { price: p.toFixed(2), time: NOW_MS - (200 - i) * 300 };
    });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const asked = [];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      asked.push(u);
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: spiky } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      /* **Blockchair answers, and answers empty.** That is not a contrived
       * case: measured on 21 Aug 2026 it had published nothing for five days,
       * so every mark on a 1H, 1D or 1W chart got exactly this — a 200 with an
       * empty list — and the card said "nothing in the archive" about days
       * that were full of news. The card is fed from more than one archive now,
       * and this fixture is the dead one. */
      if (u.includes("blockchair.com/news"))
        return r.fulfill(json({ data: [] }));
      if (u.includes("hn.algolia.com"))
        return r.fulfill(json({ hits: [{
          objectID: "9001", title: "Exchange outage halts crypto withdrawals",
          url: "https://example.com/x", points: 240,
          created_at_i: Math.floor(Date.parse("2026-08-20T09:00:00Z") / 1000),
        }] }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_move_news", "true");
      localStorage.removeItem("crypto_chart_move_news_cache");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(2500);

    const marks = await page.evaluate(`(() => {
      const g = document.querySelector(".pt-moves");
      if (!g) return [];
      return [...g.querySelectorAll("path")]
        .filter((n) => n.getAttribute("visibility") !== "hidden")
        .map((n) => { const b = n.getBoundingClientRect();
          return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; });
    })()`);
    check(marks.length >= 2 && marks.length <= 6,
      "the spikes get marks, and no more than the cap",
      `${marks.length} marks`);
    /* `encodeURIComponent` leaves parentheses alone, so the query arrives as
     * `time(2026-08-19..2026-08-21)` and a pattern looking for `%28` matches
     * nothing — which made "drawing them costs no request" pass by describing
     * a URL that never existed. A test that cannot see the thing it is
     * counting reports zero and looks green. */
    const archive = (u) => /blockchair\.com\/news\?q=.*time\(/.test(u);
    check(!asked.some(archive),
      "drawing them costs no request at all",
      String(asked.filter(archive).length));

    if (marks.length) {
      await page.mouse.move(marks[0].x, marks[0].y);
      await page.waitForTimeout(900);
      const after = asked.filter(archive);
      check(after.length === 1,
        "hovering one asks for its window, once",
        `${after.length}: ${after[0] || ""}`);
      /* And asks the second archive for the *same* window. Blockchair alone
       * was the bug: it is the deepest archive and the least current, so a
       * mark on any recent range got a 200 with nothing in it. */
      const hnArchive = asked.filter((u) =>
        /hn\.algolia\.com.*created_at_i%3E/.test(u));
      check(hnArchive.length === 1,
        "…and asks the archive that does not need a permission",
        `${hnArchive.length}: ${hnArchive[0] || ""}`);
      /* The window is a date range, not "now". Without the time filter this
       * would silently return today's headlines for a spike in 2021, which is
       * the one failure the feature could not survive and would look fine. */
      check(after[0] && /time\(\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}\)/.test(after[0]),
        "…and asks about those days, not about today", after[0] || "none");

      // Back on, and again: the cache means the second hover is free
      await page.mouse.move(640, 700);
      await page.waitForTimeout(300);
      await page.mouse.move(marks[0].x, marks[0].y);
      await page.waitForTimeout(700);
      check(asked.filter(archive).length === 1,
        "…and hovering it again costs nothing",
        String(asked.filter(archive).length));

      await page.mouse.click(marks[0].x, marks[0].y);
      await page.waitForTimeout(900);
      const card = await page.evaluate(`(() => {
        const note = [...document.querySelectorAll("div")].find(
          (d) => d.children.length === 0 && /published around this move/i.test(d.textContent || ""));
        if (!note) return null;
        const box = note.parentElement;
        return {
          note: note.textContent.trim(),
          text: box.textContent,
          links: [...box.querySelectorAll("a")].map((a) => a.getAttribute("href")),
        };
      })()`);
      check(card !== null, "clicking one opens the card", JSON.stringify(card));
      /* The wording is the feature, not decoration: headlines from the day of
       * a move are what was being said, not the cause. If this assertion ever
       * has to be relaxed, the feature has started making a claim it cannot
       * support. */
      check(card && /not why the price moved/.test(card.note),
        "…saying what it is and, plainly, what it is not", card ? card.note : "none");
      check(card && !/because/i.test(card.text),
        "…and the word 'because' appears nowhere on it", card ? card.text : "none");
      check(card && card.links.length > 0 && card.links.every((h) => /^https:\/\//.test(h || "")),
        "…with every headline a link out", card ? JSON.stringify(card.links) : "none");
      /* The whole point of this block's fixture: the deepest archive answered
       * with nothing, and the card is filled anyway. Before the second source
       * this read "Nothing in the archive for those days" on every mark of
       * every recent range, which is what the user reported as the feature
       * returning nothing. */
      check(card && /Exchange outage halts crypto withdrawals/.test(card.text),
        "…filled from the second archive when the first comes back empty",
        card ? card.text.slice(0, 200) : "none");

      /* Clicking away closes it. The card floats over a chart people click for
       * other reasons, so the next click plainly not about it has to dismiss
       * it — Escape and the × are only two ways out for someone who knows they
       * are there. Clicking *inside* must not close it, or the links on the
       * card cannot be reached. */
      const cardBox = await page.evaluate(`(() => {
        const note = [...document.querySelectorAll("div")].find(
          (d) => d.children.length === 0 && /published around this move/i.test(d.textContent || ""));
        if (!note) return null;
        const b = note.parentElement.getBoundingClientRect();
        return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
      })()`);
      const cardUp = () => page.evaluate(`(() => [...document.querySelectorAll("div")]
        .some((d) => d.children.length === 0 && /published around this move/i.test(d.textContent || "")))()`);
      await page.mouse.click(cardBox.x, cardBox.y);
      await page.waitForTimeout(300);
      check(await cardUp(), "clicking inside the card leaves it open");
      await page.mouse.click(12, 12);
      await page.waitForTimeout(300);
      check(!(await cardUp()), "…and clicking outside it closes it");

      // And Escape still does, for the keyboard
      await page.mouse.click(marks[0].x, marks[0].y);
      await page.waitForTimeout(700);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      const gone = !(await cardUp());
      check(gone, "…and Escape closes it");
    }
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 12. nothing on this screen throws data away without a way back ─────
  /* Removing a holding takes its purchases and its recorded sales with it,
   * and Import replaces the whole list. Both were one click, with no
   * confirmation and no undo, on the one screen in this app holding numbers
   * that exist nowhere else — no account, no cloud, no export unless you made
   * one. `alerts.js` already had the pattern for a removed price target.
   *
   * The assertion is not that a bar appears. It is that the *records* come
   * back: a restore that returns the coin with an empty lot list would look
   * identical on the row and would have silently eaten the cost basis. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
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
        {
          coin: "BTC",
          amount: 1,
          lots: [
            { amount: 1, paid: 20000, time: 1709596800, source: "manual", currency: "USD" },
          ],
          sales: [
            { amount: 0.2, received: 9000, basis: 4000, basisAmount: 0.2, matched: [], time: 1720000000 },
          ],
          watches: [],
        },
        { coin: "ETH", amount: 3, lots: [], watches: [] },
      ]));
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("p");
    await page.waitForTimeout(1200);

    const shape = `(() => {
      const raw = localStorage.getItem("crypto_chart_portfolio");
      const list = raw ? JSON.parse(raw) : [];
      return list.map((h) => h.coin + ":" + (h.lots || []).length + ":" + (h.sales || []).length).join("|");
    })()`;
    const before = await page.evaluate(shape);
    check(before === "BTC:1:1|ETH:0:0", "the fixture holds a lot and a sale", before);

    // The row's own × — found by its accessible name, not by position
    const removed = await page.evaluate(`(() => {
      const b = [...document.querySelectorAll("button")]
        .find((n) => (n.getAttribute("aria-label") || "") === "Remove BTC");
      if (!b) return false;
      b.click();
      return true;
    })()`);
    check(removed, "the holding row has a named remove control");
    await page.waitForTimeout(400);
    check(
      (await page.evaluate(shape)) === "ETH:0:0",
      "removing a holding removes it",
    );

    const undoBtn = `[...document.querySelectorAll("button")].find((n) => (n.textContent || "").trim() === "Undo")`;
    check(
      await page.evaluate(`Boolean(${undoBtn})`),
      "…and offers it back",
    );
    await page.evaluate(`${undoBtn}.click()`);
    await page.waitForTimeout(500);
    const after = await page.evaluate(shape);
    /* The lot and the sale are the point. A restore that put "BTC" back with
     * no records would pass a coin-list check and still have destroyed the
     * cost basis, which is the part nobody can retype. */
    check(after === before, "…with its purchases and its sales intact", after);
    check(
      !(await page.evaluate(`Boolean(${undoBtn})`)),
      "…and the offer is spent once taken",
    );
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  // ── 13. the total and the change beside it cover the same portfolio ────
  /* They did not. The header prints every holding; the percentage next to it
   * comes from the value chart, which is built only from coins that returned
   * a history — the twelve biggest, and nothing Coinbase and Kraken both 404
   * on. stETH is held at plenty of Ethereum addresses, priced by the ticker
   * sweep, and charted by neither. So a total covering three holdings sat
   * beside a percentage covering two, and nothing said so.
   *
   * The fixture prices stETH and refuses it a history, which is exactly the
   * live shape. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const priced = [...TICKERS, {
      id: 90, symbol: "STETH", name: "Lido Staked Ether",
      price_usd: "3000", percent_change_24h: "1", market_cap_usd: "1000000", volume24: "50000",
    }];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      // No exchange quotes a series for it — the failover has nowhere to go
      if (u.includes("STETH") || u.includes("stETH")) return r.fulfill(json({ errors: [{ id: "not_found" }] }));
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("coinlore") && u.includes("tickers"))
        return r.fulfill(json({ data: priced, info: { coins_num: 100 } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_portfolio", JSON.stringify([
        { coin: "BTC", amount: 1, lots: [], watches: [] },
        { coin: "ETH", amount: 3, lots: [], watches: [] },
        { coin: "STETH", amount: 4, lots: [], watches: [] },
      ]));
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("p");
    await page.waitForTimeout(3000);

    const text = await page.evaluate(`document.body.innerText`);
    check(
      /covers?\s+2 of 3 holdings/i.test(text),
      "the chart says how many holdings it covers",
      text.split("\n").filter((l) => /holdings/i.test(l)).join(" / "),
    );
    check(
      /STETH/i.test(text) && /no price history/i.test(text),
      "…and names the one it cannot draw, and why",
    );
    // The total is still the whole portfolio — the note explains the gap, it
    // does not shrink the figure to match the chart
    const total = await page.evaluate(`(() => {
      const raw = localStorage.getItem("crypto_chart_portfolio");
      return JSON.parse(raw).length;
    })()`);
    check(total === 3, "…while the portfolio still holds all three");
    check(errors.length === 0, "nothing threw", errors[0]);
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
