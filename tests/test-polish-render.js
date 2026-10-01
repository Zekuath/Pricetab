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
// The toolbar popup is its own page with its own (much shorter) script list
const POPUP = "file://" + path.join(__dirname, "..", "popup.html");


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
/* A series at a **real** Bitcoin price, for §18. The ordinary fixture sits at
 * 43,000, which is a live price too — but the defect that section exists for
 * was a model ceiling of 10,000, and a fixture that clears the ceiling by a
 * factor of four clears it just as well at 43,000 as at 112,000. What this
 * one adds is that it is where the market actually is, so a future ceiling
 * chosen by looking at a chart is caught here rather than by a person. */
const BIG_PRICES = Array.from({ length: 120 }, (_, i) => ({
  price: (112480 + i * 9 + Math.sin(i / 7) * 340).toFixed(2),
  time: NOW_S - (120 - i) * 30,
}));
/* **The contract's card is opened from the page's table.** The desk holds
 * the ticket and whichever contract is being read; the list of what is open
 * is the bottom panel's Positions tab, and pressing a row brings that
 * contract over. Every block that used to press a desk tab called
 * "Positions" presses a row instead. */
const OPEN_CARD = `(() => {
  const tab = Array.from(document.querySelectorAll("[data-practice-readings-card] button"))
    .find((n) => /^Positions/.test(n.innerText.trim()));
  if (tab) tab.click();
  const row = document.querySelector("[data-practice-position] button");
  if (row) row.click();
  return Boolean(row);
})()`;

// A contract notice's time on screen, read from config.js rather than copied
const POSITION_TOAST_MS_TEST = (() => {
  const src = require("fs").readFileSync(path.join(__dirname, "..", "src", "config.js"), "utf8");
  const m = src.match(/const POSITION_TOAST_MS = (\d+);/);
  return m ? Number(m[1]) : 10000;
})();

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

/* The plot inside the chart's SVG: the SVG less the price scale on the right
 * and the time axis along the foot (29 Sep 2026). Read off the axes' own
 * frame hairlines; a chart with no axes is all plot. Every "edge to edge"
 * on the chart means the plot's edge now. */
const PLOT_BOX = `((s) => {
  const r = s.getBoundingClientRect();
  const lines = [...s.querySelectorAll("[data-axis-layer='lines'] line")].filter((l) => l.getAttribute("visibility") !== "hidden");
  const v = lines.find((l) => l.getAttribute("x1") === l.getAttribute("x2") && +l.getAttribute("y1") === 0);
  const h = lines.find((l) => l.getAttribute("y1") === l.getAttribute("y2") && +l.getAttribute("x1") === 0);
  return { w: v ? +v.getAttribute("x1") - 0.5 : r.width, h: h ? +h.getAttribute("y1") - 0.5 : r.height };
})`;
/* The last price's tag, which lives in the price scale's gutter since 29 Sep
 * 2026 (it was a group of its own inside the plot, candles only). */
const AXIS_TAG = `(() => {
  const vis = (n) => n.getAttribute("visibility") !== "hidden";
  const rect = [...document.querySelectorAll("[data-axes] rect[data-axis-last='tag']")].find(vis);
  if (!rect) return null;
  const text = [...document.querySelectorAll("[data-axes] text[data-axis-last]")].filter(vis)
    .find((t) => !/^(pointer|line|tag)/.test(t.getAttribute("data-axis-last")));
  return { x: +rect.getAttribute("x"), w: +rect.getAttribute("width"), y: +rect.getAttribute("y"), text: text ? text.textContent : "" };
})()`;

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

/* **The widget cards live in the widgets drawer** (W) since 26 Sep 2026, and
 * the drawer builds them only once it has first been opened — a dozen cards,
 * skeleton pulses included, inside a shut drawer is work nobody sees. So a
 * check about what a card says has to open the drawer first; without it the
 * page holds no card at all, and "no card is still pulsing" passes by finding
 * nothing. Required rather than attempted: a drawer that did not open fails
 * here, not three checks later as a missing sentence. */
const openWidgets = async (page) => {
  await page.keyboard.press("w");
  await page.waitForSelector("[data-widgets-drawer='open']", { timeout: 5000 });
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

/* **The derivatives account is priced by the perpetual (OKX, USDT), and every
 * test here already says what the market is doing through its Coinbase stub.**
 * Rather than teach thirty route handlers a second venue, each context's
 * handler is asked the Coinbase question for the same coin and its answer is
 * re-shaped into OKX's: `market/ticker` from the spot, `market/candles` and
 * `history-candles` from the historic series. A test that moves its spot price
 * therefore moves the perpetual with it, which is what every one of them was
 * written to mean. */
const perpFromCoinbase = (handler) => async (r) => {
  const u = r.request().url();
  const m = u.match(/okx\.com\/api\/v5\/market\/(ticker|candles|history-candles)\?instId=([A-Z0-9]+)-USDT-SWAP/);
  if (!m) return handler(r);
  const [, kind, coin] = m;
  const ask = kind === "ticker"
    ? `https://www.coinbase.com/api/v2/prices/${coin}-USD/spot`
    : `https://www.coinbase.com/api/v2/prices/${coin}-USD/historic?period=hour`;
  const res = await new Promise((resolve) => {
    const fake = {
      request: () => ({ url: () => ask, method: () => "GET", headers: () => ({}), postData: () => null, resourceType: () => "fetch" }),
      fulfill: (x) => resolve(x),
      continue: () => resolve(null),
      fallback: () => resolve(null),
      abort: () => resolve(null),
    };
    Promise.resolve(handler(fake)).catch(() => resolve(null));
  });
  let body = null;
  try { body = res && res.body ? JSON.parse(res.body) : null; } catch (e) { body = null; }
  const okx = (data) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ code: "0", data }) });
  if (kind === "ticker") {
    const last = body && body.data && Number(body.data.amount);
    if (!(last > 0)) return r.fulfill({ status: 503, body: "" });
    return okx([{ instId: `${coin}-USDT-SWAP`, last: String(last), open24h: String(last), high24h: String(last), low24h: String(last) }]);
  }
  if (kind === "history-candles") return okx([]);
  const prices = body && body.data && Array.isArray(body.data.prices) ? body.data.prices : [];
  const limit = Number((u.match(/limit=(\d+)/) || [])[1]) || 100;
  const rows = prices
    .map((p) => [Number(p.time) * 1000, Number(p.price)])
    .filter(([t, v]) => t > 0 && v > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map(([t, v]) => [String(t), String(v), String(v), String(v), String(v), "1", "1", "1", "1"]);
  return okx(rows);
};

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.log(`• polish render test skipped: no browser binary (${e.message.split("\n")[0]})`);
    process.exit(0);
  }
  /* Every context this file opens gets the adapter above in front of its own
     route handler. */
  const openContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => {
    const ctx = await openContext(...a);
    const route = ctx.route.bind(ctx);
    /* A handler marked answersOkx speaks for the venue itself and is left alone. */
    ctx.route = (pattern, handler) => route(pattern, handler.answersOkx ? handler : perpFromCoinbase(handler));
    return ctx;
  };

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
    /* The preferences are a menu of sections since 26 Sep 2026: into the
       section that holds the headline switch, by its menu entry. */
    await page.click("[data-pref-group='underPrice']");
    await page.waitForTimeout(500);

    /* The headline line under the price appears without being asked for, so
     * the switch that stops it has to be reachable without a hunt. It was
     * third in a closed accordion called "Under the price", and was reported
     * as missing — someone looking straight at the headlines does not think
     * "accordion". It is a named section in the menu now — "Under the
     * price" — and asserted visible there without anything else pressed.
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

    /* Every section, or most of the controls are never audited. The chart's
       is left on screen for the fade check below: it is the longest. */
    for (const key of ["modes", "basics", "underPrice", "tabTickers", "updating", "features", "data", "chart"]) {
      await page.click(`[data-pref-group='${key}']`);
      await page.waitForTimeout(300);
      await sweep(`settings · ${key}`);
    }
    await page.click("[data-tab='permissions']");
    await page.waitForTimeout(300);
    await sweep("settings · permissions");
    await page.click("[data-pref-group='chart']");
    await page.waitForTimeout(400);

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

    /* The widgets' switches left Settings for their own drawer on 26 Sep
       2026 (widgetChooser). Swept there, and asserted there: a conditional
       click on a tab that has moved would sweep the tab already open and
       pass. */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("w");
    await page.waitForTimeout(600);
    await page.click("[data-widgets-choose]");
    await page.waitForTimeout(400);
    check(await page.evaluate(`Boolean(document.querySelector("[data-widgets-drawer='open'] [data-widget-chooser]"))`),
      "the widgets' switches are in their drawer, behind Choose");
    await sweep("widgets drawer · choose");
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
    /* A select reached by going to its section — "Updating", which carries
       the refresh-interval select. It was a collapsed group until the
       groups became a menu of sections (26 Sep 2026). */
    await page.click("[data-pref-group='updating']");
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
      /* A filtered mode derives a new list. This makes the render-count check
         below prove that derived props retain identity too, rather than only
         exercising the default mode that returns `newsItems` itself. */
      localStorage.setItem("crypto_chart_news_filter", "coins");
      localStorage.removeItem("crypto_chart_ticker_cache");
    });
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.evaluate(`(() => {
      window.__c = { line: 0, root: 0, ticker: 0 };
      const L = LineBase.prototype.render;
      LineBase.prototype.render = function () { window.__c.line++; return L.apply(this, arguments); };
      const C = CryptoChart.prototype.render;
      CryptoChart.prototype.render = function () { window.__c.root++; return C.apply(this, arguments); };
      const T = PageTicker.prototype.render;
      PageTicker.prototype.render = function () { window.__c.ticker++; return T.apply(this, arguments); };
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
    await page.evaluate("window.__c.line = 0; window.__c.root = 0; window.__c.ticker = 0;");
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
      return { root: window.__c.root, line: window.__c.line, ticker: window.__c.ticker };
    })()`);
    /* `{ ...theme, color: colors }` was built inside render, so every root
     * update handed styled-components a new context value and `LineBase` —
     * which takes the theme through `withTheme` — re-rendered for a change to
     * the scrolling tab title. */
    check(un.root >= 5 && un.line === 0,
      "unrelated root state never redraws the chart",
      `${un.root} root, ${un.line} chart`);
    /* The filled ticker is about two thousand DOM nodes. It used to be built
     * inline in CryptoChart, so the same five tab-title updates reconciled
     * that entire stable tree five times. The component boundary must stay
     * closed when none of its price, news or layout inputs changed. */
    check(un.root >= 5 && un.ticker === 0,
      "unrelated root state never redraws the page ticker",
      `${un.root} root, ${un.ticker} ticker`);
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
          /* Twenty-six distinct stories, and *distinct* is now load-bearing.
           *
           * These were `Filler story ${i} on flows and positioning` — twenty-
           * six headlines differing only by a number, which is a duplicate by
           * any measure. `clusterNewsItems` correctly folded all of them into
           * one row, the list stopped overflowing, and the scrollbar check
           * below failed with `scroll: null` — the feature working exactly as
           * designed against a fixture that predated it. Each one now carries
           * its own subject, so the filler is filler rather than one story
           * repeated. None of them names a coin, by symbol or by name, so the
           * coin-scope assertion below is unaffected. */
          ...[
            "Regulators publish long-awaited custody guidance",
            "Payment processor opens a European settlement desk",
            "Central bank pilot enters its second phase",
            "Exchange volumes thin out ahead of the holiday",
            "Miners in Texas renegotiate power contracts",
            "A stablecoin issuer files for a banking charter",
            "Treasury desks report wider bid-ask spreads",
            "Custody insurer raises its underwriting limits",
            "Layer-two sequencer outage resolved after an hour",
            "Institutional desks shift to options for hedging",
            "A dormant wallet from 2013 moves its balance",
            "Court dismisses a long-running class action",
            "Hardware wallet maker recalls a firmware release",
            "Auditors flag reserve reporting at two venues",
            "Retail brokerage adds fractional settlement",
            "A market maker withdraws from three venues",
            "Tax authority clarifies staking income rules",
            "Data centre operator announces a cooling retrofit",
            "Pension consultant publishes an allocation study",
            "Cross-border remittance corridor opens in Asia",
            "Derivatives clearing house raises margin",
            "An index provider revises its inclusion rules",
            "Security firm reports a phishing campaign",
            "Venture funding falls for a fourth quarter",
            "Two custodians announce a merger",
            "Trading venue extends its weekend hours",
          ].map((title, i) => ({
            title,
            link: `https://cointelegraph.com/news/f${i}`,
            hoursAgo: 100 + i,
          })),
        ]));
      if (u.includes("hn.algolia.com"))
        return r.fulfill(json({ hits: [
          { objectID: "1", title: "Ethereum rollup costs fall again",
            url: "https://example.com/c", points: 200,
            created_at_i: Math.floor(Date.now() / 1000) - 1800 },
          /* A second write-up of the newsroom's Solana story, from a different
           * source. `clusterNewsItems` must fold these two into one row —
           * that is the only place in the suite where the fold is exercised
           * against real rendering rather than against a unit fixture. The
           * wording is deliberately not the newsroom's: the near-duplicate
           * title key in `mergeNewsItems` would already have caught a copy,
           * and what is being tested is the case it cannot catch. */
          { objectID: "2", title: "Validators on Solana finish the network upgrade",
            url: "https://example.com/d", points: 150,
            created_at_i: Math.floor(Date.now() / 1000) - 79 * 3600 },
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
      /* Ninety hours ago, which puts the divider at a knowable place rather
         than wherever the clock happens to fall: the three real stories are
         2h–80h old and every filler item is 100h+, so "new since you last
         looked" must land between them — after the stories, before the
         filler, and at neither end of the list. Without a stamp there is no
         divider at all, which is the first-visit case. */
      localStorage.setItem("crypto_chart_news_seen", String(Date.now() - 90 * 3600 * 1000));
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
        /* The fold. Two newsrooms wrote up the Solana upgrade in different
           words, so exactly one row must carry the other's name and a count,
           and the folded story must still be reachable — the whole promise is
           that nothing is discarded. */
        foldedCount: (card.textContent.match(/\\+\\d+ more/) || [""])[0],
        /* The divider, and where it sits. Its position is the assertion: drawn
           at the top it would have nothing above it to divide from, and at the
           foot it would be a rule under the whole list announcing that nothing
           is new. Counted in rows either side rather than by pixel. */
        divider: (() => {
          const line = [...card.querySelectorAll("div")]
            .find((d) => /New since you last looked/i.test(d.textContent) &&
                         d.children.length === 1);
          if (!line) return null;
          const rows = [...card.querySelectorAll("a[target=_blank]")];
          const before = rows.filter((a) =>
            line.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING).length;
          return { before, after: rows.length - before };
        })(),
        /* Addressed by the **head's** title, and which one that is, is not
           obvious: the head is the newest member, and here the aggregator's
           write-up is an hour newer than the newsroom's, so the row on screen
           carries the aggregator's wording and the newsroom is the one folded
           under it. Selecting on the newsroom's headline found nothing at all
           and the check failed before it ever ran. */
        foldRow: (() => {
          const head = [...card.querySelectorAll("a[target=_blank]")]
            .find((a) => /Validators on Solana/.test(a.textContent));
          if (!head) return null;
          /* The cluster wrapper is the row's parent: the also-line cannot live
             inside the anchor, so it is its sibling. */
          const wrap = head.parentElement;
          return {
            names: /Cointelegraph/i.test(wrap.textContent),
            /* Double-escaped: this whole object is the body of a template literal
               handed to page.evaluate, so JS eats one level of backslash
               before the regex is ever compiled. Written singly it reached
               the page as /+1 more/ and threw "Nothing to repeat". */
            count: /\\+1 more/.test(wrap.textContent),
            reachable: [...wrap.querySelectorAll("a[href]")].length,
            /* The folded story must not *also* still be a row of its own —
               that would be the panel showing it twice and calling it once. */
            once: [...card.querySelectorAll("a[target=_blank]")]
              .filter((a) => /Solana validators complete upgrade/.test(a.textContent))
              .length === 0,
          };
        })(),
      };
    })()`);
    const at = await read();
    check(at !== null, "N opens the news panel", JSON.stringify(at));
    /* One fragment per source. The Solana entry is the **aggregator's**
     * wording rather than the newsroom's, and deliberately so: two sources
     * wrote that story up, `clusterNewsItems` folds them into one row, and the
     * row carries the newer of the two headlines. The newsroom's version is
     * still reachable — asserted three checks below — but it is no longer a
     * row of its own, which is the whole point of the fold. */
    const named = ["drifts sideways", "Validators on Solana", "rollup costs"];
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
    /* The fold, rendered. Two newsrooms wrote up one upgrade in different
     * words; the unit tests in `tests/test-api.js` prove the scoring, and this
     * proves the row. All three parts are asserted because each can fail on
     * its own: the count without the names is a row that says four outlets ran
     * it and shows none of them, and the names without a working link are the
     * folded story discarded with extra steps. */
    check(at && at.foldRow && at.foldRow.names,
      "the same story from two newsrooms folds into one row, naming the other",
      at ? JSON.stringify(at.foldRow) : "none");
    check(at && at.foldRow && at.foldRow.count,
      "…and says how many ran it",
      at ? at.foldedCount : "none");
    check(at && at.foldRow && at.foldRow.once,
      "…and the folded write-up is not still sitting in the list as well",
      at && at.foldRow ? String(at.foldRow.once) : "none");
    check(at && at.foldRow && at.foldRow.reachable >= 2,
      "…and the folded write-up is still one click away",
      at && at.foldRow ? String(at.foldRow.reachable) : "none");
    check(at && at.divider,
      "the list marks what arrived since the panel was last opened",
      at ? JSON.stringify(at.divider) : "none");
    check(at && at.divider && at.divider.before > 0 && at.divider.after > 0,
      "…with rows on both sides of it, never at either end",
      at && at.divider ? JSON.stringify(at.divider) : "none");
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
      /* By name, not by position: the headline was the row's last child until
         it gained a summary and coin chips under it, and asking for the last
         child then measured the wrapper — default link blue, no underline,
         two checks failing for a reason that had nothing to do with the rule
         they protect. */
      const title = row.querySelector(".pt-news-title");
      if (!title) return { missing: true };
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
     * false, so it names all eight rather than the one this fixture serves.
     * §10 used to carry this check too and now grants from the start, so this
     * is the only place it lives — hence all eight. */
    const optional = /cointelegraph|decrypt\.co|cryptoslate|bitcoinmagazine|coinjournal|bbci|coindesk|theblock/;
    check(!asked.some((u) => optional.test(u)),
      "…and has contacted no opt-in newsroom meanwhile",
      asked.filter((u) => optional.test(u)).join(" "));

    /* The other half of the same claim, and the one that makes the panel worth
     * opening on a fresh install: the sources that need no permission are read
     * straight away. All three answer `Access-Control-Allow-Origin: *`, which
     * is the whole reason they can be. If one ever stops, this fails here
     * rather than quietly leaving new users on Hacker News alone. */
    const free = [
      ["CNBC", /search\.cnbc\.com/],
      ["MarketWatch", /feeds\.content\.dowjones\.io/],
      ["Hacker News", /hn\.algolia\.com/],
      ["CryptoPotato", /cryptopotato\.com\/wp-json/],
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

    /* The origins asked for are the manifest's, not a subset: asking for
     * seven of eight leaves one newsroom that quietly never loads. Counted
     * against the manifest itself, so the next newsroom is held too. */
    const requested = await page.evaluate(`(() => (window.__asked || {}).origins || [])()`);
    const declared = JSON.parse(require("fs").readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")).optional_host_permissions;
    check(requested.length === declared.length && declared.every((o) => requested.includes(o)),
      "the request names every origin the manifest declares", JSON.stringify(requested));

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

  // ── 9d. the money can be taken off the screen ──────────────────────────
  /* This portfolio is on the **new tab page**, which is the screen that is up
   * when a colleague leans over the desk or a call starts sharing. "H" masks
   * every figure that belongs to the person using it.
   *
   * Three things are asserted, and the third is the one that makes the feature
   * worth having rather than an off switch:
   *   - no money survives anywhere inside the overlay, in text **or in an
   *     input's value** — a field is not covered by a textContent sweep, and
   *     the holding amount is an editable one;
   *   - the quantities go with the money: 0.004 BTC and 40 BTC are not the
   *     same thing to know about somebody;
   *   - the percentages, and therefore the reason to keep looking at the
   *     screen, stay. A mask that hides everything is one nobody switches on.
   *
   * The "shown" snapshot is taken first and asserted to be full of money, so
   * that the masked one is measured against something rather than passing
   * because the query found nothing.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const T = Math.floor(Date.now() / 1000);
    const PRICED = [
      { symbol: "BTC", price_usd: "68000", percent_change_24h: "2.1" },
      { symbol: "ETH", price_usd: "3400", percent_change_24h: "-1.2" },
    ];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) {
        const m = u.match(/prices\/([A-Z0-9]+)-/);
        const base = { BTC: 68000, ETH: 3400 }[m && m[1]] || 100;
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
        { coin: "BTC", amount: 0.42, lots: [
          { amount: 0.42, paid: 12000, time: ${T - 86400 * 400}, currency: "USD" }] },
        { coin: "ETH", amount: 6.5, lots: [] }
      ]));
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("p");
    await page.waitForTimeout(3000);

    /* Everything is read **inside the overlay**, never off `document`: the
     * chart page stays mounted underneath and its own price is a currency
     * figure too, so a document-wide sweep would be measuring the wrong
     * screen (§14 learned this the same way). */
    const snap = () => page.evaluate(`(() => {
      /* Not a plain querySelector on "section" — the page under the overlay
       * has two of its own, and the first carries the chart's price, which is
       * a currency figure that never masks. The portfolio is the section
       * holding the holding's amount field. */
      const shells = [...document.querySelectorAll("section")].filter(
        (s) => s.querySelector("input[aria-label='BTC amount']"));
      const shell = shells[0];
      if (!shell) return null;
      const txt = (el) => (el.textContent || "").trim();
      const leaves = [...shell.querySelectorAll("*")].filter((el) => !el.children.length);
      const btn = [...shell.querySelectorAll("button")].find(
        (b) => /amounts$/.test(txt(b)));
      const amount = shell.querySelector("input[aria-label='BTC amount']");
      return {
        sections: shells.length,
        money: leaves.filter((el) => /[$€£¥]\\s?\\d/.test(txt(el))).length,
        masked: leaves.filter((el) => txt(el).indexOf("•") >= 0).length,
        percents: leaves.filter((el) => /\\d%/.test(txt(el))).length,
        amountValue: amount ? amount.value : null,
        amountReadOnly: amount ? amount.readOnly : null,
        label: btn ? txt(btn) : null,
        pressed: btn ? btn.getAttribute("aria-pressed") : null,
        typed: btn ? btn.getAttribute("type") : null,
      };
    })()`);

    const shown = await snap();
    check(shown !== null && shown.sections === 1,
      "the portfolio is the one overlay on screen", JSON.stringify(shown));
    check(shown && shown.money >= 4,
      "…and it is full of money before anything is hidden",
      shown ? String(shown.money) : "none");
    check(shown && shown.label === "Hide amounts" && shown.pressed === "false",
      "…with a switch that says what it will do",
      shown ? `${shown.label} / ${shown.pressed}` : "none");
    check(shown && shown.typed === "button",
      "…and carries an explicit type, like every button here",
      shown ? String(shown.typed) : "none");
    check(shown && /^0?\.42$/.test(String(shown.amountValue)),
      "…and the holding amount is an editable field",
      shown ? String(shown.amountValue) : "none");

    await page.keyboard.press("h");
    await page.waitForTimeout(400);
    const hidden = await snap();
    check(hidden && hidden.money === 0,
      "H leaves no money anywhere in the portfolio",
      hidden ? String(hidden.money) : "none");
    check(hidden && hidden.masked >= 4,
      "…every figure replaced by a mask rather than removed",
      hidden ? String(hidden.masked) : "none");
    check(hidden && hidden.amountValue === "•••" && hidden.amountReadOnly === true,
      "…the amount field too, and it cannot be typed over while blind",
      hidden ? `${hidden.amountValue} / ${hidden.amountReadOnly}` : "none");
    check(hidden && hidden.percents >= 1,
      "…while the percentages stay, so the screen is still worth looking at",
      hidden ? String(hidden.percents) : "none");
    check(hidden && hidden.label === "Show amounts" && hidden.pressed === "true",
      "…and the switch says how to get them back",
      hidden ? `${hidden.label} / ${hidden.pressed}` : "none");

    // A position about privacy, not a per-visit question
    const stored = await page.evaluate(
      `localStorage.getItem("crypto_chart_portfolio_hidden")`);
    check(stored === "true", "…the choice is remembered", String(stored));

    /* The value chart is the one place with a second formatter: its y-axis
     * gutter is drawn from `formatAxisPrice` rather than from the portfolio's
     * own `formatMoney`, so it kept printing the total in full while the
     * header above it was masked. The stage mounts inside the same overlay
     * and the holdings stay mounted under it, so the same scope still finds
     * both. */
    await page.getByRole("button", { name: "Explore chart" }).first().click();
    await page.waitForTimeout(1200);
    const stage = await snap();
    check(stage && stage.money === 0,
      "…and opening the value chart does not put the money back on the axis",
      stage ? String(stage.money) : "none");

    await page.keyboard.press("h");
    await page.waitForTimeout(400);
    const back = await snap();
    check(back && back.money > 0 && back.masked === 0,
      "pressing H again gives every figure back",
      back ? `${back.money} vs ${shown.money}` : "none");

    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }
  // ── 9e. a target share, and how far the holding has drifted from it ────
  /* The one thing every other tracker calls rebalancing, ending the sentence
   * with an instruction. Here it ends with a number, and this section is what
   * holds it to that: the block says what the drift *is* and never what to do
   * about it.
   *
   * Three claims worth a browser rather than a unit test:
   *   - typing a share stores it against that holding and it survives a
   *     reload — the sanitizer rebuilds the object, so a field it does not
   *     know about is silently gone at the next tab open;
   *   - a cell with no target still says something true (what the holding is
   *     now), so the row is never blank furniture and never changes height;
   *   - a share over 100 is refused rather than quietly rounded down to
   *     something nobody typed.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const T = Math.floor(Date.now() / 1000);
    const PRICED = [
      { symbol: "BTC", price_usd: "68000", percent_change_24h: "2.1" },
      { symbol: "ETH", price_usd: "3400", percent_change_24h: "-1.2" },
    ];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) {
        const m = u.match(/prices\/([A-Z0-9]+)-/);
        const base = { BTC: 68000, ETH: 3400 }[m && m[1]] || 100;
        return r.fulfill(json({ data: { prices: Array.from({ length: 60 }, (_, i) => ({
          price: (base * (1 + i * 0.0005)).toFixed(6), time: T - (60 - i) * 3600 })) } }));
      }
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "68000.00", currency: "USD" } }));
      if (u.includes("coinlore") && u.includes("tickers"))
        return r.fulfill(json({ data: PRICED, info: { coins_num: 100 } }));
      return r.fulfill(json({ data: {} }));
    });
    /* Two holdings worth the same money, so the shares are a flat 50/50 and
     * every figure below can be read without a fixture calculation: 1 BTC at
     * 68,000 and 20 ETH at 3,400. */
    /* Seeded only when there is nothing there. `addInitScript` runs on every
     * navigation, so the plain form would rewrite the holdings on the reload
     * below and the "did it survive" check would be testing the fixture. */
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      if (!localStorage.getItem("crypto_chart_portfolio")) {
        localStorage.setItem("crypto_chart_portfolio", JSON.stringify([
          { coin: "BTC", amount: 1, lots: [] },
          { coin: "ETH", amount: 20, lots: [] }
        ]));
      }
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("p");
    await page.waitForTimeout(3000);

    const cells = () => page.evaluate(`(() => {
      const shell = [...document.querySelectorAll("section")].find(
        (s) => s.querySelector("input[aria-label*='target share']"));
      if (!shell) return null;
      const txt = (el) => (el.textContent || "").trim();
      const out = [];
      for (const input of shell.querySelectorAll("input[aria-label*='target share']")) {
        const cell = input.parentElement.parentElement;
        out.push({
          label: input.getAttribute("aria-label"),
          value: input.value,
          invalid: input.getAttribute("aria-invalid"),
          // The drift line is the last child of the cell
          face: txt(cell.lastElementChild),
          hint: cell.lastElementChild.getAttribute("title"),
        });
      }
      // cell = field > input, block = cell's parent; the note is its last child
      const one = shell.querySelector("input[aria-label*='target share']");
      const block = one.parentElement.parentElement.parentElement;
      return { cells: out, note: txt(block.lastElementChild) };
    })()`);

    // Closed until asked for: the strip is the default, the editor is a place
    // you go
    const before = await page.evaluate(
      `document.querySelectorAll("input[aria-label*='target share']").length`);
    check(before === 0, "the target editor is shut until it is opened", String(before));

    /* **The portfolio's own Targets button, said positively.** Two other
       things on screen carry that word since 23 Sep — the panel tabs and the
       phone's menu — and a bare role-and-name lookup took the tab and
       switched panels. Excluding them one at a time was the first fix and the
       wrong shape: the second hidden Targets button broke it again within the
       hour. Scoped to the view instead, which is what the rule was always
       about. */
    await page
      .locator("[data-portfolio-view] button")
      .filter({ hasText: /^Targets$/ })
      .first()
      .click();
    await page.waitForTimeout(400);

    const fresh = await cells();
    check(fresh && fresh.cells.length === 2,
      "opening it gives one cell per holding", fresh ? String(fresh.cells.length) : "none");
    check(fresh && fresh.cells.every((c) => c.value === ""),
      "…empty, because no target has been set",
      fresh ? JSON.stringify(fresh.cells.map((c) => c.value)) : "none");
    /* The cell without a target is not blank: it says what the holding is
     * now, which is the figure somebody is looking for while deciding what to
     * type — and it keeps the row from changing height as targets are added. */
    check(fresh && fresh.cells.every((c) => /^now 50\.0%$/.test(c.face)),
      "…and each says what that holding is now instead of nothing",
      fresh ? JSON.stringify(fresh.cells.map((c) => c.face)) : "none");

    const btc = page.locator("input[aria-label='BTC target share in percent']");
    await btc.fill("30");
    await page.waitForTimeout(500);
    const set = await cells();
    check(set && /^\+20\.0 pts$/.test(set.cells[0].face),
      "a target of 30% on a holding that is half the portfolio reads as 20 points over",
      set ? set.cells[0].face : "none");
    /* Money and coins live in the title, not on the face: the gap is a share
     * of the whole, and what it is worth is the follow-up question. */
    check(set && /\$27,200\.00/.test(set.cells[0].hint) && /0\.4 BTC/.test(set.cells[0].hint),
      "…with what that is worth, and in coins, behind it",
      set ? String(set.cells[0].hint) : "none");
    check(set && /never|nothing is bought|Nothing is bought/i.test(set.note) === false,
      "…and the note under it states coverage rather than advice",
      set ? set.note : "none");
    check(set && /30\.0%/.test(set.note),
      "…naming how much of the portfolio the targets cover",
      set ? set.note : "none");

    // Over 100 is not a share of anything — refused, not rounded
    await btc.fill("150");
    await page.waitForTimeout(500);
    const tooBig = await cells();
    check(tooBig && tooBig.cells[0].invalid === "true",
      "a target over 100% is refused and the box says so",
      tooBig ? String(tooBig.cells[0].invalid) : "none");
    const stored = await page.evaluate(`(() => {
      const raw = JSON.parse(localStorage.getItem("crypto_chart_portfolio") || "[]");
      const btc = raw.find((h) => h.coin === "BTC");
      return btc ? btc.target : "missing";
    })()`);
    check(stored === 30,
      "…and what was stored is still the last share that was a share", String(stored));

    /* The field survives the sanitizer, which rebuilds the holding from
     * scratch on the way back out of storage — a field it does not know about
     * is gone at the next tab open, with nothing said. */
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("p");
    await page.waitForTimeout(3000);
    /* **The portfolio's own Targets button, said positively.** Two other
       things on screen carry that word since 23 Sep — the panel tabs and the
       phone's menu — and a bare role-and-name lookup took the tab and
       switched panels. Excluding them one at a time was the first fix and the
       wrong shape: the second hidden Targets button broke it again within the
       hour. Scoped to the view instead, which is what the rule was always
       about. */
    await page
      .locator("[data-portfolio-view] button")
      .filter({ hasText: /^Targets$/ })
      .first()
      .click();
    await page.waitForTimeout(400);
    const back = await cells();
    check(back && back.cells[0].value === "30",
      "the target is still there after a reload",
      back ? String(back.cells[0].value) : "none");
    // …and it is drawn on the row's own share bar, where the gap is visible
    const tick = await page.evaluate(`(() => {
      const marks = [...document.querySelectorAll("div[title^='Target:']")];
      return marks.map((m) => ({
        title: m.getAttribute("title"),
        w: Math.round(m.getBoundingClientRect().width),
        h: Math.round(m.getBoundingClientRect().height),
      }));
    })()`);
    check(tick.length === 1 && /30/.test(tick[0].title) && tick[0].w <= 2 && tick[0].h > 2,
      "…and marked on the row's share bar, one mark for the one target",
      JSON.stringify(tick));

    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }
  // ── 9f. the screen takes the screen, and the prose is behind one button ─
  /* This is a full-screen view that was drawn as a 760px strip: on the 1440px
   * window it is most often opened in, two thirds of the display was margin,
   * and the one place in the app with the most to show was showing it through
   * a letterbox. Above 1280 the content splits in two — what reads on the
   * left, what you do on the right — and below it nothing changes at all,
   * which is the half worth a test: the column wrappers are `display:
   * contents` there, so there is one layout with a column added rather than
   * two layouts to keep in step.
   *
   * The other half is the prose. Every figure here had grown a sentence
   * explaining it, each written for a first visit and then read on every
   * visit after. They are behind one button now — including the privacy
   * promise, which is why this section checks the promise is still *somewhere*
   * rather than merely gone.
   */
  {
    const T = Math.floor(Date.now() / 1000);
    const PRICED = [
      { symbol: "BTC", price_usd: "68000", percent_change_24h: "2.1" },
      { symbol: "ETH", price_usd: "3400", percent_change_24h: "-1.2" },
    ];
    const open = async (width) => {
      const ctx = await browser.newContext({ viewport: { width, height: 950 } });
      await ctx.route("**/*", (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        if (u.includes("historic")) {
          const m = u.match(/prices\/([A-Z0-9]+)-/);
          const base = { BTC: 68000, ETH: 3400 }[m && m[1]] || 100;
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
          { coin: "BTC", amount: 1, lots: [] },
          { coin: "ETH", amount: 20, lots: [] }
        ]));
      `);
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.keyboard.press("p");
      await page.waitForTimeout(3000);
      return { ctx, page, errs };
    };

    /* Where the two blocks sit relative to each other. The strip and the list
     * are the two halves: if they are side by side there are two columns, if
     * one is under the other there is one. Measured rather than asserted off a
     * class name, because the class is not the claim. */
    const boxes = (page) => page.evaluate(`(() => {
      const strip = [...document.querySelectorAll("div")].find(
        (d) => /^Allocation:/.test(d.getAttribute("aria-label") || ""));
      const amount = document.querySelector("input[aria-label='BTC amount']");
      if (!strip || !amount) return null;
      const a = strip.getBoundingClientRect();
      const b = amount.getBoundingClientRect();
      return {
        stripRight: Math.round(a.right), stripBottom: Math.round(a.bottom),
        listLeft: Math.round(b.left), listTop: Math.round(b.top),
        stripWidth: Math.round(a.width),
      };
    })()`);

    {
      const { ctx, page, errs } = await open(1440);
      const b = await boxes(page);
      check(b && b.listLeft >= b.stripRight,
        "at 1440 the holdings sit beside the allocation, not under it",
        JSON.stringify(b));
      check(b && b.stripWidth > 500,
        "…and the reading column is wider than the old 760px strip allowed",
        b ? String(b.stripWidth) : "none");

      /* The prose is behind the button, and the promise went with it — so the
       * promise has to be findable, or this change quietly dropped the one
       * claim the product is built on. */
      const beforeInfo = await page.evaluate(
        `document.body.innerText.includes("no wallet connection")`);
      check(beforeInfo === false,
        "the footer paragraph is off the screen once there are holdings",
        String(beforeInfo));

      await page.getByRole("button", { name: /What this screen is/ }).first().click();
      await page.waitForTimeout(300);
      const panel = await page.evaluate(`(() => {
        const text = document.body.innerText;
        return {
          promise: /nothing is sent anywhere/i.test(text),
          advice: /never says to buy or sell/i.test(text),
          terms: ["Unrealized", "Realized", "Return p.a.", "Worst fall", "vs BTC", "Long term"]
            .filter((t) => text.includes(t)).length,
        };
      })()`);
      check(panel.terms === 6,
        "pressing it explains every figure in the header", JSON.stringify(panel));
      check(panel.promise,
        "…and still makes the privacy promise, in the one place it now lives");
      check(panel.advice,
        "…and says plainly that the screen never tells you to buy or sell");

      await page.getByRole("button", { name: /What this screen is/ }).first().click();
      await page.waitForTimeout(300);
      const shut = await page.evaluate(
        `document.body.innerText.includes("never says to buy or sell")`);
      check(shut === false, "pressing it again puts it away", String(shut));
      check(errs.length === 0, "nothing threw", errs[0]);
      await ctx.close();
    }

    {
      // Below the breakpoint it is the layout it always was
      const { ctx, page, errs } = await open(1024);
      const b = await boxes(page);
      check(b && b.listTop >= b.stripBottom,
        "at 1024 the holdings are back under the allocation",
        JSON.stringify(b));
      check(errs.length === 0, "nothing threw at the narrow width", errs[0]);
      await ctx.close();
    }
  }
  // ── 9g. a watched address that is on the sanctions list says so ────────
  /* The one thing an address checker must not do is send the address
   * somewhere to ask about it. The list ships with the release and the
   * comparison happens in memory, so this section asserts the answer appears
   * **and** that asking for it costs no request at all.
   *
   * The address is read out of `src/sanctions.js` rather than written here:
   * the file is regenerated from OFAC's own publication, and a hard-coded
   * entry is a test that breaks the week that address is delisted.
   */
  {
    const listed = (() => {
      const src = require("fs").readFileSync(
        require("path").join(__dirname, "..", "src", "sanctions.js"), "utf8");
      const m = src.match(/BTC: "([^"\\]+)/);
      return m ? m[1] : null;
    })();
    check(!!listed, "the bundled list has a Bitcoin address to test with", String(listed));

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const asked = [];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      asked.push(u);
      if (u.includes("coinlore") && u.includes("tickers"))
        return r.fulfill(json({ data: [{ symbol: "BTC", price_usd: "68000", percent_change_24h: "1" }], info: { coins_num: 100 } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_portfolio", JSON.stringify([
        { coin: "BTC", amount: 0, lots: [],
          watches: [{ address: ${JSON.stringify(listed)}, amount: 0.5, lots: [] }] }
      ]));
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("p");
    await page.waitForTimeout(3000);
    // Open the holding's breakdown, which is where a watched address lives
    /* By title, not by accessible name: the control is the coin row, whose
     * name is the symbol on it. */
    await page.locator("[title^='Show where these coins came from']").first().click();
    await page.waitForTimeout(500);

    const said = await page.evaluate(`(() => {
      const text = document.body.innerText;
      return {
        note: /OFAC sanctions list published \\d{4}-\\d{2}-\\d{2}/.test(text),
        // …and it says what a sanctions list is not
        scoped: /says nothing about any address that is not on it/.test(
          [...document.querySelectorAll("[title]")]
            .map((el) => el.getAttribute("title")).join(" ")),
      };
    })()`);
    check(said.note,
      "a watched address on the list is named, with the list's own date",
      JSON.stringify(said));
    check(said.scoped,
      "…and the sentence behind it refuses to say anything about addresses that are not on it");

    /* **The check added no request, which is the whole design.**
     *
     * Not "the address went nowhere" — it goes to one balance provider,
     * because that is what watching an address *is*, and the screen says so.
     * The claim here is narrower and is the one that matters: after the list
     * check, the only host the address reaches is still that provider. A
     * lookup API would have put a second host in this list, and that second
     * host is the thing this design exists to avoid.
     *
     * The first run of this check caught the loose version of the claim
     * failing on mempool.space — the balance fetch — which is exactly the
     * distinction worth writing down rather than asserting away. */
    const carriers = [
      ...new Set(asked.filter((u) => u.includes(listed)).map((u) => new URL(u).host)),
    ];
    check(carriers.length === 1 && carriers[0] === "mempool.space",
      "the list check added no host: the address still reaches only its balance provider",
      JSON.stringify(carriers));

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
      if (/cointelegraph|decrypt|cryptoslate|bitcoinmagazine|coinjournal|bbci|coindesk|theblock|algolia/.test(u)) {
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

    /* **Each mark says which way the price went**, by its colour and by the
       way it points. The fixture above falls at i=60, rises at i=120 and
       falls again at i=160, so the row has to read red, green, red.
       Two earlier rules failed this and both are recorded in `chart.js`: the
       net move across a cluster (a drop and its rebound cancel out) and the
       largest step in it (these are log returns, so the rebound is always the
       larger). The step that *started* the cluster is the one that is true. */
    const ways = await page.evaluate(`(() => {
      const g = document.querySelector(".pt-moves");
      if (!g) return [];
      return [...g.querySelectorAll("path")]
        .filter((n) => n.getAttribute("visibility") !== "hidden" && n.getAttribute("d"))
        .map((n) => {
          const m = (n.getAttribute("d") || "").match(/M[0-9.-]+,([0-9.-]+) L[0-9.-]+,([0-9.-]+)/);
          const fill = (n.getAttribute("fill") || "").toLowerCase();
          return { up: m ? Number(m[1]) < Number(m[2]) : null, fill };
        });
    })()`);
    /* Read from the theme rather than copied, so a palette change cannot
       leave this check comparing against colours nothing draws any more. */
    const themeSrc = require("fs").readFileSync(path.join(__dirname, "..", "src", "theme.js"), "utf8");
    const inkOf = (name) => [...themeSrc.matchAll(new RegExp(name + ': "(#[0-9a-f]{6})"', "gi"))].map((m) => m[1].toLowerCase());
    const greens = inkOf("chartLineGreen");
    const reds = inkOf("chartLineRed");
    check(
      ways.length === marks.length &&
        ways.every((w) => (greens.includes(w.fill) ? w.up === true : reds.includes(w.fill) ? w.up === false : true)),
      "a mark's colour and the way it points always agree",
      JSON.stringify(ways));
    check(
      ways.some((w) => greens.includes(w.fill) && w.up === true) &&
        ways.some((w) => reds.includes(w.fill) && w.up === false),
      "…and a chart with a rise and a fall on it carries one of each",
      JSON.stringify(ways));
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

  /* §14 — the empty portfolio.
   *
   * It opened on `$0.00` in the largest type on the screen, under the words
   * "Total value": a statement about a person's money made about a portfolio
   * that does not exist. Zero is a measurement and an absence is not one — the
   * same rule the `worstFall` widget follows by saying "None", and the
   * base-rate panel by refusing a comparison it cannot support.
   *
   * Two further things this pins down, both of which were true on that screen
   * and are easy to undo by accident: the privacy promise is printed **once**
   * (the empty state repeated the footer's sentence four lines above it), and
   * all three ways to get data in are real controls — the two fields plus
   * Import JSON, which was a borderless label in secondary ink. */
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
      localStorage.removeItem("crypto_chart_portfolio");
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("p");
    await page.waitForTimeout(2500);

    const empty = await page.evaluate(`(() => {
      /* Scoped to the overlay, not the document: the chart page stays mounted
         underneath and its own price is a currency figure, so document-wide
         text answers a different question than the one being asked. */
      const shell = [...document.querySelectorAll("section, div")]
        .filter((n) => getComputedStyle(n).position === "fixed"
          && n.getBoundingClientRect().width > 900
          && /nothing tracked|add a holding/i.test(n.innerText || ""))
        .pop();
      if (!shell) return { missing: true };
      const text = shell.innerText;
      /* Any currency figure at all, not just "$0.00": the point is that no
         total is claimed, in whichever currency is selected. */
      const money = /[$€£¥₺]\\s?[0-9]/.test(text);
      const privacy = (text.match(/no wallet/gi) || []).length;
      /* The three routes in. A control is one you can reach and name: the two
         inputs by their labels, the import by being a button with a
         discernible box rather than a run of text. */
      const inputs = [...shell.querySelectorAll("input")]
        .filter((i) => i.offsetParent !== null).length;
      const importBtn = [...shell.querySelectorAll("button")]
        .find((b) => /import/i.test(b.textContent || ""));
      const box = importBtn && getComputedStyle(importBtn);
      return {
        money,
        privacy,
        says: /nothing tracked yet/i.test(text),
        inputs,
        importFound: !!importBtn,
        importTabbable: !!importBtn && importBtn.tabIndex >= 0,
        importHasBox: !!box && box.borderStyle !== "none" && parseFloat(box.borderTopWidth) > 0,
      };
    })()`);
    check(!empty.missing, "the empty portfolio is on screen");
    check(!empty.money, "the empty portfolio prints no money total at all", JSON.stringify(empty));
    check(empty.says, "…it says what the state is instead", JSON.stringify(empty));
    check(empty.privacy === 1, "the privacy promise is made once, not twice", "found " + empty.privacy);
    check(empty.inputs >= 2, "both ways to type something in are on screen", "inputs " + empty.inputs);
    check(empty.importFound && empty.importTabbable, "…and Import JSON is a reachable button");
    check(empty.importHasBox, "…that looks like one, next to two obvious fields");
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  /* §15 — how often this extension asks for a rating.
   *
   * The main-screen card was genuinely once. The Settings bar was gated on
   * "has it been dismissed" alone, so it appeared on a brand-new install the
   * first time Settings was ever opened, and again on every open after that —
   * while the comment beside it called it a one-time reminder. Asking before
   * anybody has used the thing is the worst moment to ask; asking every visit
   * is nagging; and the two prompts were the only routes to the listing, so
   * dismissing them left no way to rate at all. */
  {
    const DAY = 86400000;
    const openSettings = async (page) => {
      await page.keyboard.press("s");
      await page.waitForTimeout(700);
      /* The whole card: the bar sits under its head and the permanent link
         at the foot of its menu, on every section, since 26 Sep 2026. */
      const seen = await page.evaluate(`(() => {
        const card = document.querySelector("[data-settings-card]");
        const txt = card ? card.innerText : "";
        /* Matched on what the thing *is* — a request for a rating — not on
           the sentence it currently uses. Rewording the copy broke this once
           already, which is a test failing for a reason unrelated to the rule
           it protects. The permanent link says "Rate PriceTab" and never
           "rating", so the two cannot be confused. */
        return { bar: /rating/i.test(txt), link: /Rate PriceTab/i.test(txt) };
      })()`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      return seen;
    };
    const profile = async (ageDays) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.route("**/*", (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
        if (u.includes("spot"))
          return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
        return r.fulfill(json({ data: {} }));
      });
      await ctx.addInitScript(`
        localStorage.setItem("crypto_chart_onboarding_seen", "1");
        localStorage.setItem("crypto_chart_first_use", String(Date.now() - ${ageDays} * ${DAY}));
      `);
      const page = await ctx.newPage();
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(1500);
      const card = await page.evaluate(`/rating/i.test(document.body.innerText)`);
      const opens = [];
      for (let i = 0; i < 3; i++) opens.push(await openSettings(page));
      await ctx.close();
      return { card, opens };
    };

    const fresh = await profile(0);
    check(!fresh.card, "a brand-new install is not asked to rate");
    check(
      fresh.opens.every((o) => !o.bar),
      "…and is not asked on any visit to Settings either",
      JSON.stringify(fresh.opens),
    );
    check(
      fresh.opens.every((o) => o.link),
      "…but the way to the listing is there from the start",
    );

    /* Two days old, whatever `RATE_PROMPT_DELAY_MS` currently is — read from
     * the source rather than restated, so shortening the delay cannot leave
     * this test asserting the old one. */
    const delay = Number(
      (require("fs").readFileSync(path.join(__dirname, "..", "src", "config.js"), "utf8")
        .match(/const RATE_PROMPT_DELAY_MS = ([^;]+);/) || [])[1]
        .split("*")
        .reduce((a, b) => a * Number(b.trim()), 1),
    );
    check(delay > 0 && delay <= 2 * DAY, `the ask waits a day or two (${delay}ms)`);
    const used = await profile(delay / DAY + 1);
    const asks = (used.card ? 1 : 0) + used.opens.filter((o) => o.bar).length;
    check(asks === 1, `past the delay it asks exactly once, not ${asks} times`);
    check(
      used.opens.every((o) => o.link),
      "…and the permanent link survives the ask",
    );
  }

  /* §16 — nothing is drawn on top of an open panel.
   *
   * The six corner controls are `position: fixed` at `z-index: 120` while the
   * overlays are 100–110, so a control that fails to stand down does not slide
   * *under* the panel — it sits *on* it, over whatever that panel is showing.
   *
   * Each control carried its own hand-written list of the panels it hides for,
   * six lists that had to agree and did not: measured 28 Aug 2026,
   * `showBaseRates` appeared in **none** of them and `showShortcuts` in none,
   * so opening "B" or "?" drew all six buttons across the panel; the compare
   * control also stayed up over the news panel, and the widget control over
   * the shortcut list. Every panel added after a button was written had to be
   * remembered in six places, and none of them was.
   *
   * This is the check that makes the next one impossible to miss, which is why
   * it is written against **every panel** rather than against the three that
   * were broken. The offline and API-error banners are exempt by name: they
   * are deliberately above everything, because a connection that has failed is
   * worth knowing about whichever panel you are in.
   */
  {
    const { ctx, page, errors } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem(
        "crypto_chart_widgets",
        JSON.stringify({ fearGreed: true, marketCap: true }),
      );
      localStorage.setItem(
        "crypto_chart_portfolio",
        JSON.stringify([{ coin: "BTC", amount: 0.5 }]),
      );
    });
    await page.waitForTimeout(1200);

    /* **Over it, not merely above it.** Targets and calls became drawers
       docked to the right of a live chart on 23 Sep 2026, so two things
       changed here: a panel's surface is no longer always wider than 600px,
       and a control at a higher z-index no longer implies it is printed on
       the panel — the corner row sits clear of a 544px drawer by design.
       The question this section asks is whether anything is drawn *over* the
       panel, so it is asked as an overlap. */
    const leaks = () => page.evaluate(`(() => {
      const overlays = [...document.querySelectorAll("div")].filter((d) => {
        const cs = getComputedStyle(d);
        return cs.position === "fixed" && d.offsetWidth > 400 &&
               d.offsetHeight > 400 && cs.zIndex !== "auto";
      }).sort((a, b) => +getComputedStyle(b).zIndex - +getComputedStyle(a).zIndex);
      const top = overlays[0];
      if (!top) return null;
      const tz = +getComputedStyle(top).zIndex;
      const box = top.getBoundingClientRect();
      const out = [];
      document.querySelectorAll("button").forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed" && cs.position !== "absolute") return;
        if (cs.zIndex === "auto" || !(+cs.zIndex > tz)) return;
        if (top.contains(el)) return;
        if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const over = r.left < box.right && r.right > box.left &&
                     r.top < box.bottom && r.bottom > box.top;
        if (!over) return;
        const name = el.getAttribute("aria-label") || el.textContent.trim();
        /* A panel's own close button is the one control that belongs on top of
           it — that is what makes it pressable. */
        if (/^Close /i.test(name)) return;
        out.push(name);
      });
      return [...new Set(out)];
    })()`);

    for (const [name, key] of [
      ["Settings", "s"], ["News", "n"], ["Base rates", "b"],
      ["Targets", "a"], ["Calls", "k"], ["Settings' shortcuts", "?"], ["Quick switch", "/"],
    ]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(1100);
      const over = await leaks();
      check(over !== null && over.length === 0,
        `no control is drawn over the ${name} panel`,
        over === null ? "no overlay found" : over.join(" · "));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
    }
    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  /* §17 — a card that has finished and failed says so.
   *
   * The condition on every widget was "is there data yet", which cannot tell
   * *still asking* from *asked, and nothing came back*. Measured before the
   * fix, an empty-but-valid answer, an HTTP 500 and a dead network each left
   * four cards pulsing "Loading" with four infinite CSS animations running —
   * for ever, on a page that is somebody's every new tab.
   *
   * This is the same defect the news panel carried until `newsLoading`
   * replaced `newsItems.length === 0`, which is why it is worth a test rather
   * than a comment: the shape recurs. */
  {
    for (const [label, handler] of [
      ["an empty but valid answer", (r) => r.fulfill(json({ data: {} }))],
      ["a 500", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" })],
      ["a dead network", (r) => r.abort("failed")],
    ]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.route("**/*", (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
        if (u.includes("spot"))
          return r.fulfill(
            json({ data: { amount: PRICES[PRICES.length - 1].price, currency: "USD" } }),
          );
        return handler(r);
      });
      await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1");');
      const page = await ctx.newPage();
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await openWidgets(page);
      /* **Wait for the widgets to settle, not for a stopwatch.** A flat
         6,500ms pass was long enough when this suite ran alone and short
         enough to fail under the full check, where a dozen Chromium contexts
         are competing — the assertion was reading the page mid-flight and
         calling a card that had not answered yet a card that never would.
         Polling for the settled state also makes the check stronger: it now
         asserts what the page comes to rest on rather than what it happened
         to look like at one instant. */
      /* A string body, the way every other browser-side snippet in this file
         is written: lint reads this file as Node, so a bare `document` in a
         real arrow function is a `no-undef` error. */
      await page
        .waitForFunction(
          `(document.getAnimations().filter((a) =>
             a.effect.getTiming().iterations === Infinity &&
             a.effect.target && a.effect.target.tagName === "DIV").length === 0)`,
          null,
          { timeout: 25000 },
        )
        .catch(() => {});
      const state = await page.evaluate(() => ({
        pulsing: globalThis.document
          .getAnimations()
          .filter(
            (a) =>
              a.effect.getTiming().iterations === Infinity &&
              a.effect.target &&
              a.effect.target.tagName === "DIV",
          ).length,
        said: /Couldn.t load this one/.test(globalThis.document.body.innerText),
        cards: globalThis.document.querySelectorAll("[data-widgets-drawer='open'] [draggable='true']").length,
      }));
      /* The count first: with no card on the page the two checks below
         would pass on nothing. */
      check(state.cards >= 1, `the widgets drawer holds cards after ${label}`, `${state.cards} card(s)`);
      check(
        state.pulsing === 0,
        `no card is still pulsing after ${label}`,
        `${state.pulsing} skeleton animation(s) still running`,
      );
      check(state.said, `and at least one card says it could not load after ${label}`);
      await ctx.close();
    }
  }

  /* §18 — the futures section: the gate, and the number that must not be on
   * the shut row.
   *
   * Three things here are the kind that pass review and fail in use.
   *
   * **The gate.** A simulation with an imaginary balance has to say so before
   * it is used, not in a line under it, and "said once at the bottom" is what
   * a banner is. So the terms replace the ticket rather than sitting above
   * it: while they are up there is nothing to press past them, and the test
   * asserts the absence, because a gate you can scroll past is not one.
   *
   * **The shut row.** It printed the account total, which on a collapsed row
   * is a five-figure money number with nothing around it to say it is
   * imaginary. A count of open positions is a fact about the panel; the money
   * belongs inside, next to the badge that says what it is.
   *
   * **The button that could not do what it offered.** It was enabled whenever
   * the entry price parsed, so a refusal the model had already computed was
   * printed in the note above a button that still looked pressable and did
   * nothing. Measured on a live Bitcoin price: the note read `Cannot open:
   * price` and the button was `disabled: false` — and that particular
   * refusal was itself a bug, the model's price ceiling being 10,000.
   * Both halves are asserted: a real price opens, and a refusal disables. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: BIG_PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "112480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");',
    );
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    /* **F, not K.** Futures was a disclosure inside the calls panel and has a
       screen of its own now — its own corner control, its own icon and its
       own key. This pressed "k" and looked for a block that is no longer
       there: a test describing a shape the app has left. */
    await page.keyboard.press("f");
    await page.waitForTimeout(700);

    const press = (re) =>
      page.evaluate(
        `(() => {
           const b = Array.from(document.querySelectorAll("button")).find((n) =>
             ${re}.test(n.innerText));
           if (b) b.click();
           return Boolean(b);
         })()`,
      );

    const gated = await page.evaluate(
      `({
         head: /DERIVATIVES MARKET/i.test(document.body.innerText),
         terms: /Before you start/.test(document.body.innerText),
         ticket: Array.from(document.querySelectorAll("button")).some((b) =>
           /Open long on/i.test(b.innerText)),
         sliders: document.querySelectorAll('input[type="range"][aria-label="Leverage"]').length,
       })`,
    );
    check(gated.head, "the futures section has a screen and a key of its own");
    check(gated.terms, "…and asks you to read what it is before anything else");
    check(!gated.ticket, "…with no way to open a position until you have");
    check(gated.sliders === 0, "…and no leverage control behind the terms either");

    check(await press("/read this/i"), "the terms carry a button that accepts them");
    await page.waitForTimeout(500);

    /* **Nothing opens with a scrollbar**, and nothing draws the furniture of
       one either. Reported three times — the third time as "there is a
       scrollbar in the main area", which was the ticket's sticky foot drawing
       its upward shadow across empty space. The derivatives market is a page
       now (18 Sep 2026, Basic removed at the user's request), and the page
       itself may scroll the way the portfolio does; the desk may not, and the
       foot must stay quiet while the desk fits the window. The page's own
       scroll was exactly what lit the shadow the first time the page was
       built — the foot asked the page instead of the desk. */
    const quiet = await page.evaluate(
      `(() => {
         const desk = document.querySelector("[data-practice-desk]");
         if (!desk) return null;
         const scrolls = Array.from(desk.querySelectorAll("*")).filter((e) => {
           const s = getComputedStyle(e);
           return (["auto", "scroll"].includes(s.overflowY) && e.scrollHeight > e.clientHeight + 1)
             || (["auto", "scroll"].includes(s.overflowX) && e.scrollWidth > e.clientWidth + 1);
         }).length;
         const foot = document.querySelector("[data-practice-ticket-foot]");
         /* The desk's own column scrolls when the ticket is taller than the
            window; "fits" is about the desk inside that column, which is
            what the foot's shadow answers to. */
         let col = desk.parentElement;
         while (col && col !== document.body && !/(auto|scroll)/.test(getComputedStyle(col).overflowY)) {
           col = col.parentElement;
         }
         const box = col && col !== document.body ? col : { scrollHeight: 0, clientHeight: 1 };
         return {
           scrolls,
           fits: box.scrollHeight <= box.clientHeight + 1,
           shadow: foot ? getComputedStyle(foot).boxShadow : "none",
         };
       })()`,
    );
    check(quiet && quiet.scrolls === 0, "the derivatives desk opens without a scrollbar",
      JSON.stringify(quiet));
    /* **The foot answers to its own column.** The page is the window from
       the two-column breakpoint up, so a ticket taller than the column
       scrolls inside it — and *that* is when the foot's shadow belongs,
       because content really does pass under it. What must never happen is
       the shadow lighting up from the page's scroll, which is how it was
       drawn the first time this screen was built. */
    check(
      quiet && quiet.fits === (quiet.shadow === "none"),
      "…and the sticky foot's shadow follows its own column, not the page",
      JSON.stringify(quiet),
    );
    /* **Pro is a page, laid out like the portfolio** (18 Sep 2026): the
       account in the head, the market read on the left, the tabs on a desk
       on the right. The book is a reading, so it is in the reading column,
       beside the market's own figures — and the ticket has the desk to
       itself. The network is stubbed here, so what is asserted is the column
       and its head; the ladder itself is tested in `test-api.js`. */
    const pageShape = await page.evaluate(
      `(() => {
         const pg = document.querySelector("[data-practice-page]");
         const desk = document.querySelector("[data-practice-desk]");
         /* Every book, not the first: a second copy on the desk is exactly
            the regression, and querySelector would find the one in the
            reading column and call the desk clean. */
         const books = Array.from(document.querySelectorAll("[data-practice-book]"));
         const chart = document.querySelector("[data-practice-chart]");
         const ctx = document.querySelector("[data-practice-context]");
         return {
           page: Boolean(pg),
           books: books.length,
           bookInPage: books.length === 1 && Boolean(pg && pg.contains(books[0])),
           bookOnDesk: books.some((b) => desk && desk.contains(b)),
           ticketOnDesk: Boolean(desk && Array.from(desk.querySelectorAll("button"))
             .some((b) => /Open long on/.test(b.innerText))),
           /* The line, or the candles that replaced it as the default on
              27 Sep 2026 — either is the market drawn. */
           path: chart ? chart.querySelectorAll("svg path, svg .pp-candle-up, svg .pp-candle-down").length : 0,
           axis: chart ? chart.querySelectorAll("span").length : 0,
           context: Boolean(ctx),
           deskLeft: desk ? Math.round(desk.getBoundingClientRect().left) : null,
           chartRight: chart ? Math.round(chart.getBoundingClientRect().right) : null,
         };
       })()`,
    );
    check(pageShape.page, "Pro opens as a page, the way the portfolio does", JSON.stringify(pageShape));
    check(pageShape.ticketOnDesk, "…with the ticket on the desk in its right column");
    check(pageShape.bookInPage && !pageShape.bookOnDesk,
      "…and the book in the reading column, not squeezed beside the ticket", JSON.stringify(pageShape));
    check(pageShape.path >= 1 && pageShape.axis >= 4,
      "…under a chart of the market with its axis drawn", `${pageShape.path} path(s), ${pageShape.axis} label(s)`);
    check(pageShape.chartRight != null && pageShape.deskLeft != null &&
      pageShape.chartRight <= pageShape.deskLeft,
      "…in two columns at this width", `${pageShape.chartRight} / ${pageShape.deskLeft}`);
    check(pageShape.context, "…and the market's own readings under it");
    /* **Every control on the desk is its own hit target.** A sticky foot
       measures its limit from the scroll container's padding box, and the
       portfolio shell's 3rem of bottom padding pinned it 48px above the
       window's edge — over the stop chips, which drew and could not be
       pressed. Found in a screenshot on 18 Sep 2026; asserted by pressing
       nothing and asking the page what each control's centre belongs to. */
    const covered = await page.evaluate(`(() => {
      const desk = document.querySelector("[data-practice-desk]");
      if (!desk) return null;
      const clip = (() => {
        let n = desk.parentElement;
        while (n && n !== document.body) {
          const st = getComputedStyle(n);
          if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1) {
            return n.getBoundingClientRect();
          }
          n = n.parentElement;
        }
        return { top: 0, bottom: innerHeight };
      })();
      const out = [];
      let seen = 0;
      /* The sticky foot is allowed to cover what is under it at the initial
         scroll — that is what a sticky foot is, and the block further down
         scrolls to the end and asserts everything can be brought out from
         under it. What is *not* allowed is the regression this was written
         for: a foot pinned above the column's own edge, leaving a strip that
         no scroll ever clears. So the foot's bottom is measured against the
         clip's, and a control under the foot is excused only while the two
         agree. */
      const foot = document.querySelector("[data-practice-ticket-foot]");
      const fr = foot ? foot.getBoundingClientRect() : null;
      const footOnEdge = fr ? Math.abs(fr.bottom - clip.bottom) <= 2 : true;
      desk.querySelectorAll("button, input").forEach((el) => {
        const r = el.getBoundingClientRect();
        /* On a window with columns the desk scrolls inside its own column
           (the page is the window now), so "on screen" means inside that
           box, not merely inside the viewport: a control scrolled past the
           column's edge is clipped by it and belongs to nobody. */
        if (r.width < 2 || r.height < 2 || r.bottom > clip.bottom || r.top < clip.top) return;
        seen++;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !(hit === el || el.contains(hit))) {
          if (footOnEdge && foot && foot.contains(hit)) return;
          out.push((el.getAttribute("aria-label") || el.innerText || el.tagName).slice(0, 24));
        }
      });
      return { seen, out, footOnEdge, foot: fr ? Math.round(fr.bottom) : null, clip: Math.round(clip.bottom) };
    })()`);
    check(covered && covered.seen >= 20 && covered.out.length === 0,
      "every control on the desk is its own hit target", JSON.stringify(covered));
    check(covered && covered.footOnEdge,
      "…and the sticky foot sits on the column's own edge, not pinned above it", JSON.stringify(covered));
    /* **The crowd reading never leans without its record.** Stubbed to no
       history here, so it must say there is nothing to count rather than
       draw a pill; with history, the lean is asserted in test-crowd.js and
       the pill may only stand beside the sentence that counts it. */
    /* The crowd reading is a tab of the page's bottom panel now — one press,
       and everything that was stacked down the column is still here. */
    await page.evaluate(`(() => {
      const t = Array.from(document.querySelectorAll("[data-practice-readings-card] button"))
        .find((n) => /^Crowd$/.test(n.innerText.trim()));
      if (t) t.click();
      return Boolean(t);
    })()`);
    await page.waitForTimeout(400);
    const crowd = await page.evaluate(
      `(() => {
         const box = document.querySelector("[data-practice-crowd]");
         const lean = box && box.querySelector("[data-practice-lean]");
         return {
           box: box ? box.getAttribute("data-practice-crowd") : null,
           lean: lean ? lean.getAttribute("data-practice-lean") : null,
           record: Boolean(box && box.querySelector("[data-practice-crowd-record]")),
           text: box ? box.innerText : "",
         };
       })()`,
    );
    check(
      crowd.box === "none" && (crowd.lean == null || crowd.lean === "none") && /nothing to count/i.test(crowd.text),
      "the crowd reading says it has nothing to count when there is no history",
      JSON.stringify(crowd),
    );
    check(crowd.lean == null || crowd.lean === "none" || crowd.record,
      "…and never leans without the record that earns it");
    /* **The cursor reads the recent past off the chart itself**: a point,
       and what the price has done since it. A real mouse, because a
       dispatched event skips the hit-testing that decides whether the plot
       gets it at all; and the readout must go when the pointer does. */
    const plotBox = await page.evaluate(
      `(() => { const n = document.querySelector("[data-practice-plot]");
         if (!n) return null; const r = n.getBoundingClientRect();
         return [r.left, r.top, r.width, r.height]; })()`,
    );
    if (plotBox) {
      await page.mouse.move(plotBox[0] + plotBox[2] * 0.3, plotBox[1] + plotBox[3] / 2);
      await page.waitForTimeout(300);
    }
    const readout = await page.evaluate(
      `(document.querySelector("[data-practice-readout]") || {}).innerText || ""`,
    );
    check(
      /* The price is bare: the page is a USDT market and its quote is
         named in the strip, not on every level (`posPriceSign`). */
      /[+−-]\d+\.\d\d%/.test(readout) && /since/i.test(readout) && /(^|\n)[\d,]+\.\d\d(\n|$)/.test(readout),
      "the chart's cursor reads a point and what the price did since it",
      JSON.stringify(readout),
    );
    if (plotBox) await page.mouse.move(plotBox[0] - 40, plotBox[1] - 40);
    await page.waitForTimeout(300);
    check(
      (await page.evaluate(`document.querySelectorAll("[data-practice-readout]").length`)) === 0,
      "…and lets it go when the pointer leaves",
    );
    /* **The strip that counts, and the rule it lives under.** The daily
       candles are stubbed to nothing here, which is the case worth asserting
       on: below the history it needs, the strip says it cannot count rather
       than counting anyway — the refusal is the feature, exactly as it is in
       `baserates.js`. And whatever branch it is in, it never advises: a
       screen with an order button on it is the one place a count is most
       likely to be read as a recommendation. */
    /* Back to the Market tab, which the crowd check above left. */
    await page.evaluate(`(() => {
      const t = Array.from(document.querySelectorAll("[data-practice-readings-card] button"))
        .find((n) => /^Market$/.test(n.innerText.trim()));
      if (t) t.click();
      return Boolean(t);
    })()`);
    await page.waitForTimeout(400);
    const edge = await page.evaluate(
      `(() => {
         const pane = document.querySelector("[data-practice-page]");
         const n = pane && pane.querySelector("[data-practice-edge]");
         const rule = pane && pane.querySelector("[data-practice-edge-rule]");
         const ctx = pane && pane.querySelector("[data-practice-context]");
         return {
           kind: n ? n.getAttribute("data-practice-edge") : null,
           text: n ? n.innerText : "",
           rule: rule ? rule.innerText : "",
           pane: (n && n.parentElement ? n.parentElement.innerText : "") + " " + (ctx ? ctx.innerText : ""),
         };
       })()`,
    );
    check(Boolean(edge.kind), "…and a strip that counts what this market has done before",
      JSON.stringify(edge.kind));
    check(
      /not enough|reading this market/i.test(edge.text),
      "…which says it cannot count rather than counting on a history it does not have",
      edge.text.slice(0, 80),
    );
    check(
      /not a claim about what will/i.test(edge.rule),
      "…under a line saying it is a count and not a forecast",
      edge.rule.slice(0, 80),
    );
    check(
      !/\b(buy|sell|should|recommend|signal)\b/i.test(edge.pane),
      "…and nothing in that column tells you what to do",
      edge.pane.slice(0, 120),
    );
    const open = await page.evaluate(
      `(() => {
         const r = document.querySelector('input[type="range"][aria-label="Leverage"]');
         const typed = document.querySelector('input[inputmode="numeric"][aria-label^="Leverage"]');
         const btn = Array.from(document.querySelectorAll("button")).find((n) =>
           /Open long on/i.test(n.innerText));
         const bal = document.querySelector("input[aria-label*='Set the simulated balance']");
         return {
           terms: /Before you start/.test(document.body.innerText),
           lev: r ? { min: r.min, max: r.max, step: r.step } : null,
           typedLev: typed ? {
             value: typed.value,
             font: getComputedStyle(typed).fontFamily,
           } : null,
           ticks: Array.from(document.querySelectorAll("button"))
             .map((b) => b.innerText.trim())
             /* The digit class is doubled because this whole snippet is a
                template literal: an untagged template swallows a lone
                backslash-d into a bare d, so the single-backslash form
                silently became /^d+x$/ and matched none of the five ticks
                that were on screen. */
             .filter((t) => /^\\d+x$/.test(t)),
           btn: btn ? btn.disabled : null,
           typedBalance: Boolean(bal && bal.tagName === "INPUT"),
         };
       })()`,
    );
    check(!open.terms, "…and once accepted the terms are gone");
    check(
      open.lev && open.lev.min === "1" && open.lev.max === "200" && open.lev.step === "1",
      "the leverage control covers every whole number from 1 to 200",
      `got ${JSON.stringify(open.lev)}`,
    );
    check(
      open.typedLev && /Roboto Mono/.test(open.typedLev.font),
      "leverage can be typed directly in the app's own font",
      `got ${JSON.stringify(open.typedLev)}`,
    );
    check(
      open.ticks.join(" ") === "1x 50x 100x 150x 200x",
      "the leverage scale keeps an even visual rhythm",
      `got ${open.ticks.join(" ")}`,
    );
    /* Empty it first, because a field that only accepts a replacement but
       puts its old value back while empty cannot actually be typed into one
       digit at a time. Use the native setter so this does not depend on where
       Chromium happened to put the caret inside the `2`. */
    await page.click('input[inputmode="numeric"][aria-label^="Leverage"]');
    await page.evaluate(
      `(() => {
         const e = document.querySelector('input[inputmode="numeric"][aria-label^="Leverage"]');
         const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
         set.call(e, "");
         e.dispatchEvent(new Event("input", { bubbles: true }));
       })()`,
    );
    await page.keyboard.type("37");
    await page.waitForTimeout(250);
    const customLev = await page.evaluate(
      `(() => {
         const e = document.querySelector('input[inputmode="numeric"][aria-label^="Leverage"]');
         const r = document.querySelector('input[type="range"][aria-label="Leverage"]');
         const t = document.body.innerText.toLowerCase();
         const cell = Array.from(document.querySelectorAll("div")).find(
           (n) => n.innerText.trim().toLowerCase().startsWith("notional\\n"));
         return {
           typed: e ? e.value : null,
           slider: r ? r.value : null,
           scope: t.includes("isolated · account max 200x"),
           impact: ["notional", "initial margin", "margin rate", "to liquidation"]
             .filter((label) => t.includes(label)).length,
           impactFont: cell ? getComputedStyle(cell).fontFamily : null,
         };
       })()`,
    );
    check(
      customLev.typed === "37" && customLev.slider === "37",
      "a custom leverage keeps the field and slider in sync",
      `got ${JSON.stringify(customLev)}`,
    );
    check(customLev.scope, "the leverage control names its isolated scope and account ceiling");
    check(customLev.impact === 4, "the order shows all four leverage consequences before opening");
    /* **A size you can type, not only a share you can press.**
     *
     * The chips are shares of the plan's margin wall — the right shortcut and
     * the wrong only option: on a venue the size is usually the decision
     * itself, and a percentage of a wall you cannot see is a roundabout way of
     * saying "a tenth of a Bitcoin". Both units, for the reason the deposit
     * field takes both. Asserted as three behaviours: the box is never blank,
     * a typed size takes over, and a typed size the plan refuses is **told**
     * rather than quietly shrunk to fit. */
    const sizeBox = async () =>
      page.evaluate(
        `(() => {
           const f = document.querySelector("[data-practice-size] input");
           const btn = Array.from(document.querySelectorAll("button")).find(
             (n) => /^Open (long|short) on/i.test(n.innerText.trim()));
           const t = document.body.innerText;
           return { value: f ? f.value : null,
                    typed: (document.querySelector("[data-practice-size-mode]") || {})
                      .getAttribute
                      ? document.querySelector("[data-practice-size-mode]")
                          .getAttribute("data-practice-size-mode") === "typed"
                      : false,
                    refused: /Cannot open/.test(t),
                    live: btn ? !btn.disabled : null };
         })()`,
      );
    const typeSize = async (v) => {
      await page.evaluate(
        `(() => {
           const e = document.querySelector("[data-practice-size] input");
           const set = Object.getOwnPropertyDescriptor(
             window.HTMLInputElement.prototype, "value").set;
           set.call(e, ${JSON.stringify(v)});
           e.dispatchEvent(new Event("input", { bubbles: true }));
         })()`,
      );
      await page.waitForTimeout(320);
    };
    const fromChips = await sizeBox();
    check(
      fromChips.value && Number(fromChips.value) > 0 && !fromChips.typed,
      "the size box shows what the share chips come to rather than sitting blank",
      JSON.stringify(fromChips),
    );
    await typeSize("0.0023");
    const small = await sizeBox();
    check(
      small.typed && Number(small.value) > 0,
      "…and a typed size takes over from the share",
      JSON.stringify(small),
    );
    await typeSize("100");
    const huge = await sizeBox();
    check(
      huge.refused && huge.live === false,
      "…while a typed size the plan refuses is told, not quietly shrunk to fit",
      JSON.stringify(huge),
    );
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "50%");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(320);
    const onShare = await sizeBox();
    check(
      !onShare.typed && onShare.live === true,
      "…and pressing a share puts the ticket back on it",
    );
    /* **The two words everybody thinks they know.**
     *
     * Leverage and margin are where the misunderstandings that cost money
     * live, and general prose does not fix them — this panel's own rule is
     * that help written in advance goes stale, so it says where things stand
     * *right now*. Asserted the same way: the card is on screen, it names the
     * figures the ticket is showing, and it says the thing about each that
     * people get wrong — that leverage decides the room, and that the fee is
     * charged on the contract rather than on the margin. */
    const whatCard = async (which) => {
      await page.evaluate(
        `(() => {
           const b = Array.from(document.querySelectorAll("button")).find(
             (n) => (n.getAttribute("aria-label") || "").startsWith("What " + ${JSON.stringify(which)}));
           if (b) b.click();
         })()`,
      );
      await page.waitForTimeout(350);
      return page.evaluate(
        `(() => {
           const c = document.querySelector("[data-practice-what]");
           return c ? { kind: c.getAttribute("data-practice-what"), text: c.innerText } : null;
         })()`,
      );
    };
    const lev = await whatCard("leverage");
    check(lev && lev.kind === "leverage", "the leverage control explains itself on request");
    check(
      lev && /\d/.test(lev.text) && /x,/.test(lev.text),
      "…in this contract's own figures, not in general prose",
      lev ? lev.text.slice(0, 90) : "no card",
    );
    check(
      lev && /move against you/i.test(lev.text) && /0\.05% of the contract/i.test(lev.text),
      "…saying what it really decides, and what it really costs",
    );
    const mar = await whatCard("margin");
    check(mar && mar.kind === "margin", "…and so does margin");
    check(
      mar && /isolated/i.test(mar.text) && /maintenance/i.test(mar.text),
      "…covering isolation and the maintenance requirement",
    );
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => (n.getAttribute("aria-label") || "").startsWith("What margin"));
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(300);
    check(
      (await page.evaluate(`!document.querySelector("[data-practice-what]")`)) === true,
      "…and pressing the ring again puts it away",
    );
    /* **A stop and a take-profit that say what they are worth.** They were
       two price boxes with no consequence on the screen — you typed a number
       and nothing said what it costs, which is the one thing the number is
       for. Asserted as an outcome rather than as markup: press the −2% chip,
       and a money figure appears against the stop that was not there before.
       The figure itself comes from `practiceCloseQuote`, so it carries the
       exit fee; this only has to prove it reached the screen. */
    const levelsBefore = await page.evaluate(
      `(() => {
         const b = document.querySelector("[data-practice-levels]");
         return b ? b.innerText : null;
       })()`,
    );
    check(levelsBefore !== null, "the ticket says what a stop and a take-profit are worth");
    await page.evaluate(
      `(() => {
         const b = Array.from(
           document.querySelectorAll("[data-practice-levels] button")
         ).find((n) => /2%$/.test(n.innerText.trim()));
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(350);
    const levelled = await page.evaluate(
      `(() => {
         const b = document.querySelector("[data-practice-levels]");
         const stop = document.querySelector("input[aria-label='Stop price']");
         const labels = (b ? b.innerText : "").toLowerCase();
         const count = (word) => (labels.match(new RegExp(word, "g")) || []).length;
         return {
           text: b ? b.innerText : "",
           stop: stop ? stop.value : "",
           stops: count("stop"),
           takes: count("take profit"),
           /* The currency belongs to the field, as an adornment: the value is
              parsed straight back with Number(), so it cannot carry one. */
           symbols: b ? (b.innerText.match(/USDT/g) || []).length : 0,
         };
       })()`,
    );
    check(
      Number(levelled.stop) > 0,
      "…and a percentage shortcut writes a real price into the field",
      levelled.stop,
    );
    check(
      /[0-9]/.test(levelled.text.replace(/[^0-9]/g, "")) && levelled.text.includes(" USDT"),
      "…and what that level is worth appears in money beside it",
    );
    /* **One label per setting.** The stop and the take-profit each had two —
       a field up in one block and a second row below with its own copy of the
       name — so a ticket with two settings carried four labels, and each chip
       row ended in a bare dash that nothing explained. */
    check(
      levelled.stops === 1 && levelled.takes === 1,
      "each of the two levels is named once, not twice",
      `stop ${levelled.stops}, take ${levelled.takes}`,
    );
    check(
      levelled.symbols >= 3,
      "…and all three price boxes carry the currency, rather than one bare number",
      `${levelled.symbols} symbols`,
    );
    /* **Put the stop back.** A level set here is still in the field when the
       refusal case below drops the entry to 0.0001, which puts that stop far
       above it — so the note truthfully says the stop is on the wrong side
       instead of saying the order is refused, and an assertion two hundred
       lines away fails for something this block did. The ticket is shared
       state; a test that dirties it clears it. */
    await page.evaluate(
      `(() => {
         const e = document.querySelector("input[aria-label='Stop price']");
         const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
         set.call(e, "");
         e.dispatchEvent(new Event("input", { bubbles: true }));
       })()`,
    );
    await page.waitForTimeout(250);
    check(
      customLev.impactFont && /Roboto Mono/.test(customLev.impactFont),
      "…in the app's own font",
      `got ${customLev.impactFont}`,
    );
    await page.evaluate(
      `(() => {
         const e = document.querySelector('input[inputmode="numeric"][aria-label^="Leverage"]');
         const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
         set.call(e, "201");
         e.dispatchEvent(new Event("input", { bubbles: true }));
       })()`,
    );
    await page.waitForTimeout(250);
    const invalidLev = await page.evaluate(
      `(() => {
         const e = document.querySelector('input[inputmode="numeric"][aria-label^="Leverage"]');
         const btn = Array.from(document.querySelectorAll("button")).find((n) =>
           /Open long on/i.test(n.innerText));
         return {
           invalid: e && e.getAttribute("aria-invalid"),
           disabled: btn ? btn.disabled : null,
           said: /outside 1x to 200x/.test(document.body.innerText),
         };
       })()`,
    );
    check(
      invalidLev.invalid === "true" && invalidLev.disabled === true && invalidLev.said,
      "an out-of-range custom leverage is named and cannot open an order",
      `got ${JSON.stringify(invalidLev)}`,
    );
    await page.evaluate(
      `(() => {
         const e = document.querySelector('input[inputmode="numeric"][aria-label^="Leverage"]');
         const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
         set.call(e, "37");
         e.dispatchEvent(new Event("input", { bubbles: true }));
       })()`,
    );
    await page.waitForTimeout(150);
    /* **Not in the ticket any more.** The balance was at the foot of the
       ticket and only while nothing was open; it has a tab of its own now, so
       this goes and looks there. That it is *typed* rather than picked from a
       list is still the thing worth asserting — that was the defect — and §24
       covers the tab it moved to. Clicked and awaited rather than read in the
       same `evaluate`: the tab is a `setState`, so the field is not in the
       DOM until React has run. */
    /* **The money is a tab of its own — Funds.** Add funds and Withdraw are
       two cards on one pane beside the account, not a drawer at its foot;
       the Account tab carries none of it. */
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "Account");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(400);
    const onAccount = await page.evaluate(`Boolean(document.querySelector("[data-practice-fund]"))`);
    check(onAccount === false, "the Account tab carries no money controls");
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "Funds");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(500);
    const funds = await page.evaluate(
      `(() => {
         const pane = document.querySelector("[data-practice-funds]");
         return pane ? { fund: Boolean(pane.querySelector("[data-practice-fund]")), withdraw: Boolean(pane.querySelector("[data-practice-withdraw]")), game: /game/i.test(pane.innerText) } : null;
       })()`,
    );
    check(funds && funds.fund && funds.withdraw && funds.game, "…the Funds tab holds Add funds and Withdraw as two cards, under a note that says it is a game", JSON.stringify(funds));
    /* **Money is added, never set.** The field is typed; a preset *adds*
       its figure to what is typed (+1,000 twice is 2,000), and there is no
       control that sets the balance to a number — withdraw is the only way
       down, and it goes to zero. */
    const balanced = await page.evaluate(
      `(() => {
         const field = document.querySelector("input[aria-label*='add to the simulated balance']");
         const setter = document.querySelector("input[aria-label*='Set the simulated balance']");
         const presets = Array.from(document.querySelectorAll("[data-practice-fund] button")).filter((b) => /^\\+/.test(b.innerText.trim()));
         if (presets[0]) { presets[0].click(); presets[0].click(); }
         return { field: Boolean(field), setter: Boolean(setter), presets: presets.length, first: presets[0] ? presets[0].innerText.trim() : "", value: field ? field.value : "" };
       })()`,
    );
    check(balanced.field && !balanced.setter, "the amount is typed, and nothing sets the balance to a figure", JSON.stringify(balanced));
    check(balanced.presets >= 2 && Number(balanced.value) > 0 && Math.abs(Number(balanced.value) - 2 * Number((balanced.first.match(/([0-9.]+)/) || [0, 0])[1]) * (/[0-9.]+\s*K/i.test(balanced.first) ? 1000 : 1)) < 1,
      "…and a preset adds to what is typed — pressed twice, it is there twice", JSON.stringify(balanced));

    /* **Adding funds, and the four seconds it takes.**
     *
     * Three things are worth asserting and none of them is "a bar appeared":
     * that the money is *not* there yet while the bar is running (a deposit
     * that lands on the press has a decorative bar, which is the version this
     * replaces), that it is there afterwards, and that Cancel actually stops
     * it — a way out that does not is worse than none. The account's size is
     * read off the funding step's own head rather than off the body text,
     * since a currency figure appears in a dozen places on this screen.
     *
     * The bar is checked for `transform`, not for existence: this is the
     * new-tab page, and a progress bar animating `width` lays out and paints
     * every frame in every tab open on this screen. */
    const fundSize = () =>
      page.evaluate(
        `(() => {
           const step = document.querySelector("[data-practice-fund]");
           return step ? step.innerText.split("\\n")[1] || "" : "";
         })()`,
      );
    const before = await fundSize();
    await page.evaluate(
      `(() => {
         const e = document.querySelector("input[aria-label*='add to the simulated balance']");
         const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
         set.call(e, "2500");
         e.dispatchEvent(new Event("input", { bubbles: true }));
       })()`,
    );
    await page.waitForTimeout(200);
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("[data-practice-fund] button")).find(
           (n) => n.innerText.trim() === "Add funds");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(600);
    const landing = await page.evaluate(
      `(() => {
         const step = document.querySelector("[data-practice-fund]");
         if (!step) return null;
         const fill = step.querySelector("div[aria-hidden='true'] > div");
         const cs = fill ? getComputedStyle(fill) : null;
         return {
           size: step.innerText.split("\\n")[1] || "",
           bar: Boolean(fill),
           duration: cs ? cs.animationDuration : "",
           moves: cs ? cs.animationName !== "none" && /scale|matrix/.test(cs.transform) : false,
           /* The way out is the button that was pressed: while it is busy it
              is named as the cancel. */
           cancel: Array.from(step.querySelectorAll("button")).some(
             (n) => n.getAttribute("aria-busy") === "true" && /cancel/i.test(n.getAttribute("aria-label") || "")),
           status: (step.getAttribute("aria-busy") || "") + step.innerText,
         };
       })()`,
    );
    check(landing && landing.bar, "adding funds draws a bar rather than landing on the press");
    check(
      landing && landing.duration === "4s",
      "…that runs for the four seconds the money takes",
      landing ? landing.duration : "no bar",
    );
    check(
      landing && landing.moves,
      "…animated on a transform, never a width — this is the new-tab page",
    );
    check(
      landing && landing.size === before,
      "…and the account has not grown yet while it is running",
      `${before} -> ${landing ? landing.size : "?"}`,
    );
    check(landing && landing.cancel, "…with a way out for the whole wait — the same button, named as the cancel");
    check(
      landing && /four seconds/i.test(landing.status),
      "…and a sentence saying so, for anyone who cannot see it move",
    );
    await page.waitForTimeout(4200);
    const landed = await fundSize();
    check(
      landed !== before && landed !== "",
      "…then the money lands",
      `${before} -> ${landed}`,
    );

    /* **The amount can be typed in a coin, not only in the account's money.**
     *
     * Three things, and the middle one is the point: the toggle is there, the
     * conversion is *shown* with the rate it used, and what lands is the
     * converted figure rather than the typed one. A conversion nobody can see
     * is a number appearing from nowhere, and one that lands differently from
     * what was quoted is the `practiceCloseSize` defect wearing a new hat. */
    const unitToggle = await page.evaluate(
      `(() => {
         const step = document.querySelector("[data-practice-fund]");
         if (!step) return null;
         const units = Array.from(step.querySelectorAll("button"))
           .filter((n) => (n.getAttribute("aria-label") || "").startsWith("Type the amount in"))
           .map((n) => n.innerText.trim());
         return units;
       })()`,
    );
    check(
      unitToggle && unitToggle.includes("BTC"),
      "the amount can be typed in a coin, not only the account's own money",
      JSON.stringify(unitToggle),
    );
    const sizeBeforeCoin = await fundSize();
    await page.evaluate(
      `(() => {
         const step = document.querySelector("[data-practice-fund]");
         const b = Array.from(step.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "BTC" &&
             (n.getAttribute("aria-label") || "").startsWith("Type the amount in"));
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(250);
    await page.evaluate(
      `(() => {
         const e = document.querySelector("input[aria-label*='add to the simulated balance']");
         const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
         set.call(e, "0.01");
         e.dispatchEvent(new Event("input", { bubbles: true }));
       })()`,
    );
    await page.waitForTimeout(300);
    const converted = await page.evaluate(
      `(() => {
         const step = document.querySelector("[data-practice-fund]");
         const line = Array.from(step.querySelectorAll("p"))
           .map((n) => n.innerText.trim())
           .find((t) => t.indexOf(" ~ ") > 0 && t.indexOf(" at ") > 0);
         return { line: line || "" };
       })()`,
    );
    check(
      /BTC/.test(converted.line) &&
        converted.line.indexOf(" ~ ") > 0 &&
        converted.line.indexOf(" at ") > 0,
      "…and says what that coin amount is worth, at the rate it will use",
      converted.line || "no conversion line",
    );
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("[data-practice-fund] button")).find(
           (n) => n.innerText.trim() === "Add funds");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(4600);
    const afterCoin = await fundSize();
    check(
      afterCoin !== sizeBeforeCoin,
      "…and a coin amount actually lands as money in the account",
      `${sizeBeforeCoin} -> ${afterCoin}`,
    );

    /* Cancel is the only way it does not land, so it has to work. */
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("[data-practice-fund] button")).find(
           (n) => n.innerText.trim().charAt(0) === "+");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(400);
    /* The preset only prepares the amount; the button starts the wait. */
    await page.evaluate(`(() => { const b = document.querySelector("[data-practice-transfer='deposit']"); if (b) b.click(); })()`);
    await page.waitForTimeout(400);
    /* The button that started it is the button that stops it: pressed
       while the bar runs, it cancels — there is no second control to find. */
    const midway = await page.evaluate(
      `(() => {
         const b = document.querySelector("[data-practice-transfer='deposit']");
         const busy = b ? b.getAttribute("aria-busy") : null;
         const label = b ? (b.getAttribute("aria-label") || "") : "";
         if (b) b.click();
         return { busy, label };
       })()`,
    );
    await page.waitForTimeout(4400);
    check(midway.busy === "true" && /cancel/i.test(midway.label), "while it runs the same button is named as the cancel", JSON.stringify(midway));
    check(
      (await fundSize()) === afterCoin,
      "…and pressing it again keeps the money out of the account",
    );
    /* **Back to the ticket, by the tab's real name.** This said "Open
       contracts" and no button has been called that since the tabs became
       New contract / Positions / Closed / Account — so the click found
       nothing, `if (b)` swallowed the miss, and the run carried on sitting on
       the Account tab. The failure surfaced a hundred lines further down as
       `set.call(null, …)` → "Illegal invocation" on an Entry price field that
       was never on screen, which names neither the tab nor the rename. The
       label is asserted rather than optional now: a navigation step that
       silently does nothing is worse than one that fails where it is. */
    const backToTicket = await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim().startsWith("New contract"));
         if (b) b.click();
         return Boolean(b);
       })()`,
    );
    await page.waitForTimeout(400);
    check(backToTicket, "the contract ticket is reachable by its tab's name");
    /* **An order on a coin you already hold is another contract.**
     *
     * Every control in the ticket was once gated on whether the chart's coin
     * was held, so opening one turned the whole form off — reported as "the
     * long and short buttons are deactivated even though there is money in
     * the balance". The first attempt at a fix moved the ticket to a
     * *different* coin, which is worse: no venue does that. The second folded
     * a second order into the position it already had, which answered the
     * words of the report and not the thing being asked for: **twenty longs
     * and twenty shorts at once, on one market or many, as long as the
     * balance carries them.**
     *
     * So the ticket does not change what it offers. Every press opens a new
     * contract, on the symbol on screen, on the side pressed — which is why
     * the button below reads the same whether nothing is held or nine are. */
    const ticket = await page.evaluate(
      `(() => {
         const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
         const held = Object.keys(p.positions || {});
         const chart = (document.body.innerText.match(/([A-Z]{2,6}) PRICE/) || [])[1];
         const sides = Array.from(document.querySelectorAll("button"))
           .filter((n) => /^(Long|Short)$/.test(n.innerText.trim()));
         const act = Array.from(document.querySelectorAll("button")).find(
           (n) => /^(Open (long|short) on|Add to|Reduce) /i.test(n.innerText.trim()));
         return {
           chart, held,
           sides: sides.length,
           live: sides.filter((n) => !n.disabled).length,
           btn: act ? act.innerText.trim() : null,
           btnLive: act ? !act.disabled : null,
         };
       })()`,
    );
    if (ticket.held.length && ticket.chart && ticket.held.includes(ticket.chart)) {
      check(
        ticket.sides > 0 && ticket.live === ticket.sides,
        "holding a contract does not deaden the order form",
        `${ticket.live} of ${ticket.sides} sides live`,
      );
      check(
        ticket.btn && ticket.btn.includes(ticket.chart),
        "…and the ticket stays on the coin the chart is on",
        `${ticket.btn} while the chart is ${ticket.chart}`,
      );
      check(
        /^Open (long|short) on /i.test(ticket.btn || "") && ticket.btnLive === true,
        "…offering another contract rather than refusing or folding it in",
        `${ticket.btn} live=${ticket.btnLive}`,
      );
      /* And the press has to actually produce one. The button reading right
         while the store still keys by coin is exactly the defect that was
         reported three times, so this counts the contracts either side of a
         click rather than trusting the label. */
      const before = ticket.held.length;
      await page.evaluate(
        `(() => {
           const b = Array.from(document.querySelectorAll("button")).find(
             (n) => /^Open (long|short) on /i.test(n.innerText.trim()));
           if (b) b.click();
           return Boolean(b);
         })()`,
      );
      await page.waitForTimeout(450);
      const second = await page.evaluate(
        `(() => {
           const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
           const ids = Object.keys(p.positions || {});
           return { n: ids.length, coins: ids.map((k) => p.positions[k].coin) };
         })()`,
      );
      check(
        second.n === before + 1,
        "…and pressing it opens a second contract on the same market",
        `${before} before, ${second.n} after (${second.coins.join(", ")})`,
      );
    }
    check(
      open.btn === false,
      "a real Bitcoin price can actually be opened",
      "the open button was disabled at a live price",
    );

    /* **What the press costs, in money.** The second clause of the preview
       read "review the leverage impact before opening" on every ticket in
       every state — a caution stapled to a fill preview, true of nothing in
       particular. The fee is 0.05% of the *notional*, so at 200x it is a
       tenth of the margin behind the contract, and the only place it appeared
       was the ledger after the fact. */
    const priced = await page.evaluate(
      `(() => {
         const t = document.body.innerText;
         return {
           fee: /fee [\\d,.]+ USDT to open/i.test(t),
           caution: /review the leverage impact/i.test(t),
         };
       })()`,
    );
    check(priced.fee, "the ticket says what the press costs, in money");
    check(!priced.caution, "…rather than a caution stapled on with a dot");


    /* The refusal half, and it has to be a case that certainly refuses —
       an assertion behind an `if` that never fires is not an assertion.
       Full size at a price of 0.0001 asks for more margin than the plan
       commits at once, which is the refusal an ordinary press reaches. */
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find((n) =>
           /^100%$/.test(n.innerText.trim()));
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(300);
    await page.evaluate(
      `(() => {
         const e = document.querySelector("input[aria-label='Entry price']");
         const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
         set.call(e, "0.0001");
         e.dispatchEvent(new Event("input", { bubbles: true }));
       })()`,
    );
    await page.waitForTimeout(400);
    const refused = await page.evaluate(
      `(() => {
         const btn = Array.from(document.querySelectorAll("button")).find((n) =>
           /Open long on/i.test(n.innerText));
         return { text: document.body.innerText, disabled: btn ? btn.disabled : null };
       })()`,
    );
    check(/Cannot open/.test(refused.text), "an order the model will refuse says so");
    check(
      refused.disabled === true,
      "…and disables the button, instead of leaving one that does nothing",
      "the note said it could not open and the button was still pressable",
    );
    check(
      !/Cannot open . (planMargin|funds|notional|planLeverage|planLoss)\b/.test(
        refused.text,
      ),
      "…in words, not in the model's own field names",
      refused.text.slice(0, 120),
    );

    /* Closed again: the corner control comes back, and **nothing is drawn on
       top of it**. Futures and News carried the same hard-coded offset when
       Futures was added, so the later of the two covered the earlier — the
       control was in the DOM, reported a width, and could neither be seen nor
       pressed. Every corner control is slot-placed now; this asserts the
       outcome rather than the mechanism: no two of them at the same x. */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const back = await page.evaluate(
      `(() => {
         const named = Array.from(document.querySelectorAll("button")).filter(
           (n) => (n.getAttribute("aria-label") || "") === "Derivatives market",
         );
         const xs = Array.from(document.querySelectorAll("button"))
           .filter((n) => {
             const s = getComputedStyle(n);
             const r = n.getBoundingClientRect();
             /* **The lane, not everything near the top.** 60px keeps the
                chips (y=32) and leaves out a widget card's own hide button,
                which sits at y≈88 and shares an x with the last chip now
                that the chart group is in the left corner. It is not
                slot-placed and is not what this asserts. */
             return (s.position === "fixed" || s.position === "absolute") && r.width > 0 && r.top < 60;
           })
           .map((n) => ({ x: Math.round(n.getBoundingClientRect().x), name: (n.getAttribute("aria-label") || n.getAttribute("title") || "?").slice(0, 24) }))
           .sort((a, b) => a.x - b.x)
           .map((e) => e.x + ":" + e.name);
         let clashes = 0;
         const nums = xs.map((e) => Number(String(e).split(":")[0]));
         for (let i = 1; i < nums.length; i += 1) if (Math.abs(nums[i] - nums[i - 1]) < 4) clashes += 1;
         return { control: named.length, corners: xs.length, clashes, xs };
       })()`,
    );
    /* **A random walk over every control the panel offers.**
     *
     * Three defects were reported in a row that no targeted assertion here
     * could have caught, and all three lived on a seam: a tab preference that
     * outlived its subject, a liquidation search that threw on one settlement,
     * a plan limit met with the money still there. What finds that class is
     * pressing everything, in an order nobody designed, and asking one
     * question after each press — **is the panel still there**.
     *
     * The error boundary swallows a render throw, so a blank panel is the
     * symptom and there is no console error to look for. "Gone" only counts
     * when it will not come back: some controls close the panel on purpose.
     *
     * One fixed seed, so a failure is reproducible and the suite cannot flake.
     * 120 actions is a few seconds; the full sweep that found nothing lives in
     * `tests/local-audit.js` and runs to thousands. */
    let walkSeed = 20260904;
    const walkRnd = () => ((walkSeed = (walkSeed * 1103515245 + 12345) % 2147483648) / 2147483648);
    await page.keyboard.press("f");
    await page.waitForTimeout(700);
    const panelUp = () => page.evaluate(
      `(() => {
         const t = document.body.innerText;
         return ["New contract", "Positions", "Closed", "Account"].filter(
           (k) => t.includes(k)).length >= 2;
       })()`,
    );
    let blanked = null;
    const trail = [];
    if (await panelUp()) {
      for (let w = 0; w < 120 && !blanked; w += 1) {
        const roll = walkRnd();
        trail.push(await page.evaluate(
          `(() => {
             const roll = ${roll};
             const vis = (n) => !n.disabled && n.checkVisibility
               && n.checkVisibility({ checkVisibilityCSS: true });
             const btns = Array.from(document.querySelectorAll("button")).filter(vis);
             const ins = Array.from(document.querySelectorAll("input")).filter(vis);
             if (roll < 0.72 && btns.length) {
               const b = btns[Math.floor((roll / 0.72) * btns.length) % btns.length];
               const name = (b.getAttribute("aria-label") || b.innerText || "?").trim().slice(0, 40);
               b.click();
               return "click " + name;
             }
             if (!ins.length) return "idle";
             const n = ins[Math.floor(((roll - 0.72) / 0.28) * ins.length) % ins.length];
             const vals = ["", "0", "1", "37", "201", "0.001", "999999999", "-4", "abc", "1e30"];
             const v = vals[Math.floor(roll * 1000) % vals.length];
             const set = Object.getOwnPropertyDescriptor(
               window.HTMLInputElement.prototype, "value").set;
             set.call(n, v);
             n.dispatchEvent(new Event("input", { bubbles: true }));
             return "type " + (n.getAttribute("aria-label") || n.type).slice(0, 30) + " = " + v;
           })()`,
        ));
        await page.waitForTimeout(45);
        if (!(await panelUp())) {
          await page.keyboard.press("f");
          await page.waitForTimeout(300);
          if (!(await panelUp())) {
            await page.keyboard.press("Escape");
            await page.waitForTimeout(150);
            await page.keyboard.press("f");
            await page.waitForTimeout(400);
            if (!(await panelUp())) blanked = trail[trail.length - 1];
          }
        }
      }
      check(
        !blanked,
        "the futures panel survives every control pressed in any order",
        blanked ? `blanked after: ${blanked} | before it: ${trail.slice(-4, -1).join(" / ")}` : "",
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    check(back.control === 1, "closing it puts the corner control back", `${back.control}`);
    check(
      back.clashes === 0,
      "…and no corner control is drawn on top of another",
      `${back.clashes} of ${back.corners} share a position — ${JSON.stringify(back.xs)}`,
    );
    await ctx.close();
  }

  /* §19 — the board takes a drag as well as two clicks, and still refuses one
   * click.
   *
   * Two clicks is the deliberate guard: a chart is a surface people click for
   * other reasons, and a stray click must not commit a prediction that goes
   * on a record. A drag is a different gesture — you are holding the box the
   * whole way — so it can place in one, and it does not weaken the guard.
   * Which is exactly what makes this worth a test: the cheap implementation
   * is to draft on the press, and that quietly turns a *single* click into a
   * placed call while every comment goes on claiming two. All four are
   * asserted together, because any one of them alone would pass over that
   * mistake. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(
          json({ data: { amount: PRICES[PRICES.length - 1].price, currency: "USD" } }),
        );
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_predict", "true");',
    );
    const page = await ctx.newPage();
    const thrown = [];
    page.on("pageerror", (e) => thrown.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1800);

    /* The widest SVG is the chart; the first one on the page is an icon. */
    const geo = await page.evaluate(
      `(() => {
         const s = Array.from(document.querySelectorAll("svg")).sort(
           (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width,
         )[0];
         const r = s.getBoundingClientRect();
         const n = s.querySelector(".pt-now-line");
         return {
           nx: n ? Number(n.getAttribute("x1")) : null,
           w: ${PLOT_BOX}(s).w, h: r.height, left: r.left, top: r.top,
         };
       })()`,
    );
    const calls = () =>
      page.evaluate(
        `(() => {
           try {
             return (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || [])
               .length;
           } catch (e) {
             return -1;
           }
         })()`,
      );

    if (geo && geo.nx > 0) {
      // The middle of the board strip, well clear of the "now" handle
      const bx = geo.left + (geo.nx + geo.w) / 2;
      check((await calls()) === 0, "the board starts with nothing called");

      await page.mouse.click(bx, geo.top + geo.h * 0.55);
      await page.waitForTimeout(250);
      check((await calls()) === 0, "one click on a square does not call it");

      await page.mouse.click(bx, geo.top + geo.h * 0.55);
      await page.waitForTimeout(350);
      check((await calls()) === 1, "…and the second click does");

      const y = geo.top + geo.h * 0.25;
      await page.mouse.move(bx, y + 90);
      await page.mouse.down();
      for (let i = 1; i <= 8; i += 1) await page.mouse.move(bx, y + 90 - (90 * i) / 8);
      await page.mouse.up();
      await page.waitForTimeout(400);
      check((await calls()) === 2, "a drag onto a square calls it in one gesture");

      /* Let go outside the board: nothing placed, and no half-made call left
         sitting on the chart either. */
      await page.mouse.move(bx, y + 60);
      await page.mouse.down();
      for (let i = 1; i <= 8; i += 1) {
        await page.mouse.move(geo.left + geo.nx - (200 * i) / 8, y + 60);
      }
      await page.mouse.up();
      await page.waitForTimeout(400);
      check(
        (await calls()) === 2,
        "…while letting go off the board calls nothing",
        `${await calls()} call(s) after a drag that ended on the history`,
      );
    } else {
      check(false, "the board is drawn with a now line to measure from");
    }
    check(thrown.length === 0, "nothing threw", thrown.join(" | "));
    await ctx.close();
  }

  /* §20 — an open position is on the chart, not only in the panel.
   *
   * The panel gives four numbers in a list; the chart gives four lines the
   * price is either side of, which is the reading a list cannot produce. Two
   * things are asserted beyond "they are drawn": each level **names itself**
   * (four unlabelled lines are a puzzle), and a level outside the drawn range
   * is **absent rather than pinned to an edge** — the rule `priceToChartY`
   * already enforces for the cost basis, because a line clamped to the border
   * draws a crossing the window does not contain. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: BIG_PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "112480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    const blew = [];
    page.on("pageerror", (e) => blew.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1600);
    check(
      (await page.$$(".pt-position line")).length === 0,
      "with nothing open the chart draws no position levels",
    );

    /* F, not K — futures has a screen of its own now. */
    await page.keyboard.press("f");
    await page.waitForTimeout(700);
    const press = (re) =>
      page.evaluate(
        `(() => {
           const b = Array.from(document.querySelectorAll("button")).find((n) =>
             ${re}.test(n.innerText));
           if (b) b.click();
           return Boolean(b);
         })()`,
      );

    /* A take-profit inside the drawn range and a stop far outside it, so the
       same press tests both halves of the rule. */
    const put = await page.evaluate(
      `(() => {
         const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
         const put = (label, v) => {
           const e = document.querySelector("input[aria-label='" + label + "']");
           if (!e) return false;
           set.call(e, v);
           e.dispatchEvent(new Event("input", { bubbles: true }));
           return true;
         };
         return {
           take: put("Take-profit price", "112700"),
           stop: put("Stop price", "40000"),
         };
       })()`,
    );
    check(put.take && put.stop, "…and both fields take a price", JSON.stringify(put));
    await page.waitForTimeout(300);
    await press("/^Open long on/i");
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const drawn = await page.evaluate(
      `(() => {
         const g = document.querySelector(".pt-position");
         if (!g) return null;
         const shown = (n) => n.getAttribute("visibility") !== "hidden";
         const svg = g.closest("svg");
         const w = svg ? Math.round(${PLOT_BOX}(svg).w) : 0;
         const h = svg ? Math.round(${PLOT_BOX}(svg).h) : 0;
         return {
           lines: Array.from(g.querySelectorAll("line")).filter(shown).length,
           labels: Array.from(g.querySelectorAll("text")).filter(shown)
             .map((n) => n.textContent),
           /* **Edge to edge, like everything else the chart draws.** These
              were inset by 24px at both ends while the price line, its fill
              and the gridlines all ran the full width, so the levels and the
              tinted regions read as a rectangle laid *on* the chart. */
           spans: Array.from(g.querySelectorAll("line")).filter(shown).every(
             (n) => Number(n.getAttribute("x1")) === 0
               && Math.round(Number(n.getAttribute("x2"))) === w,
           ),
           fills: Array.from(g.querySelectorAll("rect")).filter(shown).map((n) => ({
             x: Number(n.getAttribute("x")),
             w: Math.round(Number(n.getAttribute("width"))),
             h: Math.round(Number(n.getAttribute("height"))),
             grad: (n.getAttribute("fill") || "").indexOf("url(") === 0,
           })),
           /* A label touching the frame reads as clipped, so the text keeps
              an inset the lines no longer have. */
           inset: Array.from(g.querySelectorAll("text")).filter(shown).every(
             (n) => Number(n.getAttribute("x")) <= w - 8,
           ),
           height: h,
           width: w,
         };
       })()`,
    );
    check(drawn !== null, "the chart has a layer for the position");
    if (drawn) {
      check(drawn.lines >= 2, "an open position puts its levels on the chart", `${drawn.lines}`);
      check(
        /* At least: a liquidation outside the drawn window has no line and
           still gets an edge marker, which is one label more than lines. */
        drawn.labels.length >= drawn.lines,
        "…and every level names itself",
        `${drawn.lines} line(s), ${drawn.labels.length} label(s)`,
      );
      check(
        drawn.spans,
        "…drawn edge to edge, not inset into a rectangle of their own",
        `${drawn.width}px wide`,
      );
      check(
        drawn.inset,
        "…while the labels keep an inset, so no number touches the frame",
      );
      check(
        drawn.fills.every((f) => f.x === 0 && f.w === drawn.width),
        "the tinted regions reach the sides too",
        JSON.stringify(drawn.fills),
      );
      /* **The danger past the liquidation falls away rather than flooding.**
         It used to tint everything beyond the level — at a high leverage
         that is most of the chart, at 12% over an area fill that is already
         tinted, and the price line came second to a wash. */
      check(
        drawn.fills.every((f) => !f.grad || f.h <= Math.ceil(drawn.height * 0.21)),
        "…and the one past the liquidation is a band, not half the chart",
        JSON.stringify(drawn.fills),
      );
      check(
        drawn.labels.some((t) => /entry/i.test(t)),
        "…including where you got in",
        drawn.labels.join(" | "),
      );
      check(
        drawn.labels.some((t) => /take/i.test(t)),
        "…and the level you get out at if you are right",
        drawn.labels.join(" | "),
      );
      check(
        !drawn.labels.some((t) => /stop/i.test(t)),
        "…while a level far outside the drawn range is absent, not pinned to the edge",
        drawn.labels.join(" | "),
      );
    }
    /* The levels say where the position sits; the dock says what it is doing
       and is the way back into managing it. A dot on a corner icon carried
       neither fact, so an open contract looked like chart decoration once
       its entry happened to be outside the visible range. */
    const dock = await page.evaluate(
      `(() => {
         const b = document.querySelector("[data-practice-dock]");
         return b ? { text: b.innerText, label: b.getAttribute("aria-label") } : null;
       })()`,
    );
    check(Boolean(dock), "an open position has a live control on the main chart");
    check(
      Boolean(dock) && /BTC/i.test(dock.text) && /LONG/i.test(dock.text) && /[+$-]/.test(dock.text),
      "…naming its coin, side and live result",
      dock ? dock.text : "no position dock",
    );
    if (dock) {
      /* **It opens where it stands now.** Pressing it used to throw you into
         the Futures panel to answer "how big is this and can I take some
         off"; both are two lines of figures and a row of shares, so the
         widget carries them and the panel is one further press. Asserted as
         the outcome — the size is on screen and it grew downward without
         moving its own top edge — rather than as markup. */
      const beforeBox = await page.evaluate(
        `(() => { const d = document.querySelector("[data-practice-dock]");
                  const r = d.getBoundingClientRect();
                  return { top: Math.round(r.top), h: Math.round(r.height) }; })()`,
      );
      await page.click("[data-practice-dock] button");
      await page.waitForTimeout(450);
      const opened = await page.evaluate(
        `(() => {
           const d = document.querySelector("[data-practice-dock]");
           const r = d.getBoundingClientRect();
           const t = d.innerText;
           return {
             top: Math.round(r.top),
             h: Math.round(r.height),
             facts: ["Size", "Worth", "Margin", "Liquidation"].filter((k) => t.includes(k)).length,
             shares: Array.from(d.querySelectorAll("button"))
               .filter((n) => /^(25%|50%|75%|All)$/.test(n.innerText.trim())).length,
           };
         })()`,
      );
      /* **The space either side of the widget was the point.** It sat centred
         at the top of the chart with a hundred empty pixels on each side,
         carrying the coin, the side, the leverage and the money — none of
         which answers what somebody with a chart open actually wants to know,
         which is *how close am I*. The three readings that answer it all cost
         nothing: the model already computes the margin ratio and the
         liquidation, and a perpetual's funding clock is arithmetic on the wall
         clock. */
      const strip = await page.evaluate(
        `(() => {
           const s = document.querySelector("[data-practice-strip]");
           const d = document.querySelector("[data-practice-dock]");
           if (!s || !d) return null;
           return { text: s.innerText,
                    gauge: Boolean(s.querySelector("span > span")),
                    w: Math.round(d.getBoundingClientRect().width) };
         })()`,
      );
      check(
        strip && /to liq/i.test(strip.text) && /%/.test(strip.text),
        "the chart widget says how far the price is from liquidating it",
        strip ? strip.text : "no strip",
      );
      check(
        strip && /on margin/i.test(strip.text) && /funding/i.test(strip.text),
        "…the result against the margin behind it, and the funding clock",
      );
      check(strip && strip.gauge, "…with the distance drawn as well as named");
      check(opened.facts === 4, "the chart widget opens in place and says what the contract is",
        `${opened.facts} of 4 figures`);
      check(opened.shares === 4, "…and offers a share of it to close, without leaving the chart",
        `${opened.shares} of 4`);
      check(
        /Close part of it/i.test(await page.evaluate(
          `document.querySelector("[data-practice-dock]").innerText`)),
        "…saying what the percentages are a percentage of",
      );
      /* **Nothing closes on one press.** A share button sits on a chart people
         click for other reasons and a close is not undoable, so the first
         press has to ask — and say what it is about to take. */
      const armed = await page.evaluate(
        `(() => {
           const d = document.querySelector("[data-practice-dock]");
           const b = Array.from(d.querySelectorAll("button")).find(
             (n) => n.innerText.trim() === "25%");
           if (b) b.click();
           return true;
         })()`,
      );
      await page.waitForTimeout(300);
      const asking = await page.evaluate(
        `(() => {
           const d = document.querySelector("[data-practice-dock]");
           const held = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}").positions || {};
           return {
             asks: /Sure\\?/.test(d.innerText),
             names: /[0-9]/.test(
               (d.querySelector("[data-dock-armed]") || {}).textContent || ""),
             qty: Object.keys(held).map((c) => held[c].qty).join(","),
           };
         })()`,
      );
      check(armed && asking.asks, "…and a share asks before it closes anything");
      check(asking.names, "…naming the quantity it is about to take");
      check(opened.h > beforeBox.h, "…growing downward", `${beforeBox.h}px -> ${opened.h}px`);
      check(
        Math.abs(opened.top - beforeBox.top) <= 1,
        "…and never upward: its top edge does not move",
        `${beforeBox.top}px -> ${opened.top}px`,
      );
      /* Clicking away puts it back, which is the other half of "in place".
         On the chart at the window's left edge, as it always was — but below
         the folder tabs, which hang down that edge from the top since 26 Sep
         2026: at (8, 400) the press landed on Calls and opened its drawer,
         which took the dock off the screen. */
      const away = await page.evaluate(`(() => {
        const spine = document.querySelector("[data-drawer-tabs]");
        const bottom = spine ? spine.getBoundingClientRect().bottom : 0;
        return { x: 8, y: Math.round(Math.max(400, bottom + 40)) };
      })()`);
      await page.mouse.click(away.x, away.y);
      await page.waitForTimeout(450);
      const shut = await page.evaluate(
        `Math.round(document.querySelector("[data-practice-dock]").getBoundingClientRect().height)`,
      );
      check(shut === beforeBox.h, "…and a click elsewhere closes it again", `${shut}px`);
      /* The panel is still one press away. */
      await page.click("[data-practice-dock] button");
      await page.waitForTimeout(350);
      await page.evaluate(
        `(() => { const b = Array.from(document.querySelectorAll("[data-practice-dock] button"))
             .find((n) => /Open derivatives/i.test(n.innerText)); if (b) b.click(); })()`,
      );
      await page.waitForTimeout(450);
      check(
        (await page.evaluate(`document.body.innerText`)).includes("Positions"),
        "…and it still leads to the derivatives screen",
      );
    }
    check(blew.length === 0, "nothing threw", blew.join(" | "));
    await ctx.close();
  }

  /* §21 — you can walk the board to a band that was not on it.
   *
   * The board reaches about three squares either side of the price, which is
   * the right default and is not everything: the call an hour chart most
   * invites — a real fall, a real spike — ends somewhere with no square on
   * the screen. Four arrows walk the window, and they repeat while held.
   *
   * The assertion that matters is the last one, and it is deliberately about
   * the *outcome* rather than about the control: a call actually placed at a
   * band that was off the board before. Everything else here — the arrows
   * being drawn, the way-back chip appearing — was true for a whole round of
   * this feature while the window never moved at all, because the geometry is
   * memoised and the pan was not in its cache key. A control that reports
   * success while changing nothing is the failure this section exists for. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: BIG_PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "112480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_predict", "true");',
    );
    const page = await ctx.newPage();
    const bang = [];
    page.on("pageerror", (e) => bang.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1800);

    const arrows = await page.evaluate(
      `Array.from(document.querySelectorAll(".pt-pan-btn")).map((n) =>
         n.getAttribute("aria-label"))`,
    );
    check(arrows.length === 4, "the board carries four arrows to walk it with", `${arrows.length}`);
    check(
      arrows.every((a) => a && a.length > 4),
      "…and every one of them says where it goes",
      arrows.join(" | "),
    );

    /* **The left arrow can be pressed, and it is beside the line it moves.**
     *
     * It could not be, and had not been at either of the two places it has
     * been put: it is the one control drawn under the price series, the line
     * layer was hit-testing over it, and its `pointerdown` never arrived — a
     * button that lit up on hover, took focus, and did nothing to the board.
     * Nothing caught it because every other arrow stands over empty chart.
     *
     * So this presses it with a real mouse rather than dispatching a click,
     * which is the whole difference: a synthetic click on the node would have
     * passed throughout. And it holds the placement that made the fault
     * visible — beside the "now" line, a grab-band clear of it so a press is
     * a step and not the start of a drag, and clear of the price labels. */
    const panGeo = await page.evaluate(
      `(() => {
         const box = (n) => (n ? n.getBoundingClientRect() : null);
         const left = Array.from(document.querySelectorAll(".pt-pan-btn")).find((n) =>
           /less board/i.test(n.getAttribute("aria-label")));
         const grip = document.querySelector(".pt-now-grip");
         /* The grid's price labels are on the price scale since 29 Sep
            2026; the arrow's box must still meet none of them. */
         const labels = Array.from(document.querySelectorAll("svg text"))
           .filter((n) => n.getAttribute("visibility") !== "hidden" && /^[$\u20ac\u00a3]/.test(n.textContent.trim()))
           .map((n) => n.getBoundingClientRect());
         const l = box(left);
         const g = box(grip);
         if (!l || !g) return null;
         return {
           gap: Math.round(g.x + g.width / 2 - l.right),
           clearsLabels: labels.length > 0 && labels.every((b) => b.right <= l.x || b.left >= l.right || b.bottom <= l.y || b.top >= l.bottom),
           at: [Math.round(l.x + l.width / 2), Math.round(l.y + l.height / 2)],
         };
       })()`,
    );
    check(
      panGeo && panGeo.gap >= 12 && panGeo.gap < 90,
      "the arrow that gives back history stands beside the line it moves",
      panGeo ? `${panGeo.gap}px from the line` : "not drawn",
    );
    check(
      panGeo && panGeo.clearsLabels,
      "…with its whole pointer area clear of the grid's price labels",
    );
    if (panGeo) {
      const share = () =>
        page.evaluate(`localStorage.getItem("crypto_chart_future_share")`);
      const shareBefore = await share();
      await page.mouse.click(panGeo.at[0], panGeo.at[1]);
      await page.waitForTimeout(500);
      check(
        (await share()) !== shareBefore,
        "…and a real press on it actually walks the board",
        `${shareBefore} -> ${await share()}`,
      );
      await page.mouse.move(640, 20);
      await page.waitForTimeout(200);
    }

    /* The top gridline label is the cheapest proof the window actually
       moved — it is a price, and panning changes which price. */
    const topLabel = () =>
      page.evaluate(
        `(() => {
           const t = Array.from(document.querySelectorAll("[data-axes] text[data-axis-tick]"))
             .filter((n) => n.getAttribute("visibility") !== "hidden")
             .sort((a, b) => Number(a.getAttribute("y")) - Number(b.getAttribute("y")))
             .map((n) => n.textContent);
           return t[0] || "";
         })()`,
      );
    const before = await topLabel();
    check(before.length > 0, "the board prints price levels to begin with", before);

    const upAt = await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll(".pt-pan-btn")).find((n) =>
           /higher/i.test(n.getAttribute("aria-label")));
         if (!b) return null;
         const r = b.getBoundingClientRect();
         return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
       })()`,
    );
    if (!upAt) {
      check(false, "the arrow that walks the board upward can be found");
    } else {
      check(
        (await page.$$(".pt-pan-home[tabindex]")).length === 0,
        "with the board at the price there is no way-back control to press",
      );
      await page.mouse.move(upAt.x, upAt.y);
      await page.mouse.down();
      await page.waitForTimeout(1500);
      await page.mouse.up();
      await page.waitForTimeout(500);
      const after = await topLabel();
      check(after !== before, "holding an arrow walks the board", `${before} -> ${after}`);
      check(
        (await page.$$(".pt-pan-home[tabindex]")).length === 1,
        "…and once walked, there is a control that brings it back",
      );

      /* The point of the walk: a band that was off the board is callable. */
      const geo = await page.evaluate(
        `(() => {
           const s = Array.from(document.querySelectorAll("svg")).sort(
             (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width,
           )[0];
           const r = s.getBoundingClientRect();
           const n = s.querySelector(".pt-now-line");
           return n
             ? { nx: Number(n.getAttribute("x1")), left: r.left, top: r.top, w: ${PLOT_BOX}(s).w, h: r.height }
             : null;
         })()`,
      );
      if (geo) {
        const bx = geo.left + (geo.nx + geo.w) / 2;
        const by = geo.top + geo.h * 0.5;
        await page.mouse.click(bx, by);
        await page.waitForTimeout(200);
        await page.mouse.click(bx, by);
        await page.waitForTimeout(500);
        const call = await page.evaluate(
          `(() => {
             try {
               const open = JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || [];
               return open[0] ? { lo: open[0].lo, hi: open[0].hi } : null;
             } catch (e) {
               return null;
             }
           })()`,
        );
        check(call !== null, "a square over there can still be called");
        check(
          call !== null && call.lo > 113500,
          "…at a band the board did not reach before the walk",
          call ? `${call.lo} – ${call.hi}` : "no call",
        );
      }

      await page.click(".pt-pan-home");
      await page.waitForTimeout(600);
      check(
        (await topLabel()) === before,
        "…and the way back puts the board where it was",
        `${await topLabel()} vs ${before}`,
      );
    }
    check(bang.length === 0, "nothing threw", bang.join(" | "));
    await ctx.close();
  }

  /* §22 — zooming twice quickly must not strobe.
   *
   * Nothing on the board actually moves during a zoom: the pitch comes from
   * the clock, so the lattice holds still to the frame. What moves is the
   * price labels, and they were dimmed by a bell over *one travel's* clock —
   * right for a single press, wrong for every other way the control is used.
   * A trackpad scroll or two quick presses restarted the bell per notch, so
   * the labels went bright-dim-bright as fast as the notches arrived. That
   * strobing was the whole of the reported shaking.
   *
   * The assertion is on the count of bright flashes through a chain of four
   * presses: one, at the end. Measured before the fix, on this exact
   * sequence: **four flashes and eighteen label rewrites**; after: one and
   * one. The lattice checks are here as the control — if they ever start
   * moving, the diagnosis above is wrong and this section should be
   * rewritten rather than relaxed. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: BIG_PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "112480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_predict", "true");',
    );
    const page = await ctx.newPage();
    const boom = [];
    page.on("pageerror", (e) => boom.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1800);
    await page.evaluate(
      `(() => {
         window.__zs = [];
         const s = Array.from(document.querySelectorAll("svg")).sort(
           (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width,
         )[0];
         const tick = () => {
           const mesh = s.querySelector(".pt-mesh");
           const shown = (n) => n.getAttribute("visibility") !== "hidden";
           const labs = mesh
             ? Array.from(mesh.querySelectorAll("text")).filter(shown)
             : [];
           const horiz = mesh
             ? Array.from(mesh.querySelectorAll("line"))
                 .filter((n) => shown(n) && n.getAttribute("y1") === n.getAttribute("y2"))
                 .map((n) => Number(n.getAttribute("y1")))
                 .sort((a, b) => a - b)
             : [];
           window.__zs.push({
             ink: labs[0] ? Number(labs[0].getAttribute("opacity")) : 1,
             lab: labs[0] ? labs[0].textContent : "",
             top: horiz[0] === undefined ? null : Number(horiz[0].toFixed(1)),
             pitch: horiz.length > 1 ? Number((horiz[1] - horiz[0]).toFixed(2)) : 0,
           });
           window.__zraf = requestAnimationFrame(tick);
         };
         tick();
       })()`,
    );
    const plus = await page.evaluate(
      `(() => {
         const n = Array.from(document.querySelectorAll(".pt-zoom-btn")).find((e) =>
           /out/i.test(e.getAttribute("aria-label")));
         if (!n) return null;
         const r = n.getBoundingClientRect();
         return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
       })()`,
    );
    if (!plus) {
      check(false, "the board carries a zoom control to press");
    } else {
      for (let i = 0; i < 4; i += 1) {
        await page.mouse.click(plus.x, plus.y);
        await page.waitForTimeout(180);
      }
      await page.waitForTimeout(900);
      const seen = await page.evaluate(
        `(() => {
           cancelAnimationFrame(window.__zraf);
           const s = window.__zs;
           let flashes = 0;
           let rewrites = 0;
           for (let i = 1; i < s.length; i += 1) {
             if (s[i - 1].ink <= 0.8 && s[i].ink > 0.8) flashes += 1;
             if (s[i - 1].lab !== s[i].lab) rewrites += 1;
           }
           return {
             flashes,
             rewrites,
             tops: Array.from(new Set(s.map((x) => x.top))).length,
             pitches: Array.from(new Set(s.map((x) => x.pitch))).length,
             dimmed: Math.min.apply(null, s.map((x) => x.ink)),
           };
         })()`,
      );
      check(seen.dimmed < 0.5, "a zoom dims the price labels while it travels", `${seen.dimmed}`);
      check(
        seen.flashes <= 1,
        "four zooms in a row bring them back once, not once each",
        `${seen.flashes} bright flashes`,
      );
      check(
        seen.rewrites <= 2,
        "…and the numbers are not rewritten on every frame of the travel",
        `${seen.rewrites} label rewrites`,
      );
      check(
        seen.tops === 1 && seen.pitches === 1,
        "…while the lattice itself does not move at all",
        `${seen.tops} top position(s), ${seen.pitches} pitch(es)`,
      );
    }
    check(boom.length === 0, "nothing threw", boom.join(" | "));
    await ctx.close();
  }

  /* §23 — the futures screen fits the card it is drawn in.
   *
   * Two defects with one cause, both reported as "the padding has gone
   * negative": you could not read the top or the bottom line, and the screen
   * ran past the card.
   *
   * **The fade was drawn over content.** `AlertsBody` fades 14px at each end
   * so a list ends by fading rather than by being sliced, and it had no
   * vertical padding at all — so on a screen that was not even scrolling,
   * "Equity" at the top and the note under the balance box at the foot were
   * both washed halfway out. Measured before the fix: the first line's box
   * started 0px into a 14px fade. The assertion is the outcome, and it reads
   * the fade distance out of the computed mask rather than repeating it, so
   * the two cannot drift apart.
   *
   * **Every open position was drawn open.** Three positions put three
   * settlement blocks, three fact rows and twelve buttons above the ticket,
   * which is the thing the screen exists to operate. They are an accordion
   * now — one open, the rest a line each — and the two halves that are easy
   * to get wrong are asserted together: a shut row must expose no control
   * (a `max-height: 0` reveal still hands its buttons to the Tab key, which
   * is why the collapse sets `visibility`), and opening one must shut the
   * one that was open, or it is a set of disclosures wearing an accordion's
   * name. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(700);

    /* Three positions, opened through the ticket rather than seeded into
       storage: `sanitizePractice` rebuilds a position field by field and
       drops anything it does not recognise, so a hand-written fixture can
       test nothing at all and still look right. One per coin is the model's
       rule, so each one needs the chart moved on first.

       **No tab is clicked here, deliberately.** This loop failed for months
       with one position of three, and the reason was the product: any held
       position sent every later visit to the list, so the form was not on the
       screen and `if (b)` swallowed the miss. Clicking "New contract" between
       rounds would make it pass over exactly the defect it exists to catch. */
    for (let i = 0; i < 3; i += 1) {
      /* **The middle one is a short**, so this loop also proves the thing
         reported as broken: contracts on different coins run side by side in
         *either* direction. One coin holds one contract — that part is real —
         but the account is not limited to one direction. */
      if (i === 1) {
        await page.evaluate(
          `(() => {
             const b = Array.from(document.querySelectorAll("button")).find(
               (n) => n.innerText.trim() === "Short" && !n.disabled);
             if (b) b.click();
           })()`,
        );
        await page.waitForTimeout(250);
      }
      await page.evaluate(
        `(() => {
           const b = Array.from(document.querySelectorAll("button")).find((n) =>
             /Open (long|short) on/i.test(n.innerText));
           if (b) b.click();
         })()`,
      );
      await page.waitForTimeout(500);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(900);
      await page.keyboard.press("f");
      await page.waitForTimeout(600);
    }

    /* The head of every position card, and what is behind it. `checkVisibility`
       rather than a bounding box: a collapsed reveal is `max-height: 0` with
       `overflow: hidden`, and the text inside it still reports its full rect. */
    /* **The page's table is the list**: a row per contract, and the contract
       itself unfolds as the row's own next sibling (the reveal). */
    const READ = `(() => {
      const rows = Array.from(document.querySelectorAll("[data-practice-position]"));
      return rows.map((row) => {
        const b = row.querySelector("button[aria-expanded]");
        const reveal = row.nextElementSibling;
        const inside = reveal
          ? Array.from(reveal.querySelectorAll("button, input, select, a[href]"))
          : [];
        return {
          coin: (b.innerText.match(/[A-Z]{2,6}/) || [""])[0],
          expanded: b.getAttribute("aria-expanded") === "true",
          shown: Boolean(
            reveal && reveal.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
          ),
          reachable: inside.filter((n) =>
            n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).length,
        };
      });
    })()`;

    /* **Now go and look at the list.** Until the landing-tab fix the panel
       was already sitting on Positions — because *any* held position sent it
       there — so this read happened to work without navigating. It lands on
       the ticket now, correctly, and the list is one press away. */
    await page.evaluate(OPEN_CARD);
    await page.waitForTimeout(500);
    const rows = await page.evaluate(READ);
    check(rows.length === 3, "three open positions are three rows", `${rows.length}`);
    const sides = await page.evaluate(
      `(() => {
         const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
         return Object.keys(p.positions || {}).map((c) => p.positions[c].side);
       })()`,
    );
    check(
      sides.includes("long") && sides.includes("short"),
      "…and a long and a short are held at the same time, on different coins",
      sides.join(","),
    );
    check(
      rows.filter((r) => r.shown).length === 1,
      "…of which exactly one is opened out",
      `${rows.filter((r) => r.shown).length} open`,
    );
    check(
      rows.length > 0 && rows[0].shown && rows[0].expanded,
      "…and it is the first, so one position looks as it always did",
    );
    check(
      rows.slice(1).every((r) => r.reachable === 0),
      "a shut position hands no control to the Tab key",
      `${rows.slice(1).reduce((n, r) => n + r.reachable, 0)} still reachable`,
    );

    /* Opening the last one closes the first. A set of independent
       disclosures passes every check above and fails this one. */
    await page.evaluate(
      `(() => {
         const heads = Array.from(document.querySelectorAll("button[aria-expanded]"))
           .filter((b) => /\\d+x/.test(b.innerText) && /#\\d/.test(b.innerText));
         heads[heads.length - 1].click();
       })()`,
    );
    await page.waitForTimeout(500);
    const after = await page.evaluate(READ);
    check(
      after.filter((r) => r.shown).length === 1 && after[after.length - 1].shown,
      "pressing another row opens it and shuts the one that was open",
      after.map((r) => `${r.coin}:${r.shown ? "open" : "shut"}`).join(" "),
    );

    /* The fade, and what is under it. The distance comes out of the computed
       mask so this cannot disagree with the CSS.

       **Measured on the targets card** since 18 Sep 2026: the derivatives
       market is a page now, which scrolls the way the portfolio does and has
       no card body to fade. The card — and the rule — live on in targets
       and calls, so the panel goes there and comes back. */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("a");
    await page.waitForTimeout(600);
    const fit = await page.evaluate(
      `(() => {
         const body = Array.from(document.querySelectorAll("div")).find(
           (e) => getComputedStyle(e).maskImage !== "none" && e.scrollHeight > 100);
         if (!body) return null;
         const cs = getComputedStyle(body);
         /* The **first non-zero** stop. The gradient opens on "transparent 0px",
            so taking the first px figure in the string reads the fade as zero —
            and a zero fade makes every assertion below trivially true, which is
            how this check passed while measuring nothing. */
         const fade = (cs.maskImage.match(/(\\d+(?:\\.\\d+)?)px/g) || [])
           .map(parseFloat).find((n) => n > 0) || 0;
         const r = body.getBoundingClientRect();
         const first = body.firstElementChild.getBoundingClientRect();
         const topGap = first.top - r.top;
         /* The foot is only clear of the fade once the list is scrolled to its
            end — that is where the padding lands. Read after scrolling, so the
            check runs whether or not the panel happens to overflow. */
         body.scrollTop = body.scrollHeight;
         const kids = Array.from(body.children);
         const last = kids[kids.length - 1].getBoundingClientRect();
         return {
           fade,
           padTop: parseFloat(cs.paddingTop),
           padBottom: parseFloat(cs.paddingBottom),
           topGap,
           bottomGap: r.bottom - last.bottom,
         };
       })()`,
    );
    check(Boolean(fit) && fit.fade > 0, "the panel's list fades at each end", JSON.stringify(fit));
    check(
      Boolean(fit) && fit.padTop >= fit.fade && fit.padBottom >= fit.fade,
      "…over its own padding, not over the first and last line",
      fit ? `${fit.padTop}/${fit.padBottom}px against a ${fit.fade}px fade` : "no body",
    );
    check(
      Boolean(fit) && fit.topGap >= fit.fade - 0.5,
      "the top line of the card is clear of the fade",
      fit ? `${fit.topGap.toFixed(1)}px into a ${fit.fade}px fade` : "no body",
    );
    check(
      Boolean(fit) && fit.bottomGap >= fit.fade - 0.5,
      "…and so is the bottom one, once the list is scrolled to its end",
      fit ? `${fit.bottomGap.toFixed(1)}px into a ${fit.fade}px fade` : "no body",
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("f");
    await page.waitForTimeout(700);
    /* Reopened, the panel has forgotten its tab and its open row — both
       are the panel's state, not the account's — so put back what the
       block had: the list, with the last contract opened out. */
    await page.evaluate(OPEN_CARD);
    await page.waitForTimeout(500);
    await page.evaluate(
      `(() => {
         const heads = Array.from(document.querySelectorAll("button[aria-expanded]"))
           .filter((b) => /\\d+x/.test(b.innerText) && /#\\d/.test(b.innerText));
         const last = heads[heads.length - 1];
         if (last && last.getAttribute("aria-expanded") !== "true") last.click();
       })()`,
    );
    await page.waitForTimeout(500);
    /* A position list is also navigation: selecting one should reveal its
       levels on the chart it belongs to, including when another coin was on
       the main screen when the panel opened. */
    const explored = await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "Explore chart" &&
             n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
         if (b) b.click();
         return Boolean(b);
       })()`,
    );
    check(explored, "an open position offers a direct route to its chart");
    await page.waitForTimeout(900);
    const focused = await page.evaluate(
      `({
         panel: /New contract/.test(document.body.innerText),
         coin: /XRP PRICE/.test(document.body.innerText),
         dock: /XRP/i.test((document.querySelector("[data-practice-dock]") || {}).innerText || ""),
       })`,
    );
    check(
      !focused.panel && focused.coin && focused.dock,
      "…closing the panel on that coin with its position still in view",
      JSON.stringify(focused),
    );
    await ctx.close();
  }

  /* §24 — the futures account: its own tab, its own currency, and a number
   * box that will not take letters.
   *
   * **The tab.** The simulated balance lived at the foot of the ticket and
   * only while nothing was open, so the one question it answers — how big is
   * this account — had nowhere to be asked from once the account was running.
   * Worse, the plan's limits were being enforced by the model and shown by
   * nothing — a rule you can be stopped by with nothing anywhere saying it was
   * there. (The worst of them, a quota on how many contracts a session could
   * open, was removed from the product on 16 Sep 2026: it refused the next
   * contract on an account with nearly all of its money untouched.)
   *
   * **The currency.** Every figure printed a bare number, so `10,000.00` sat
   * beside a `43,501.7400` price with nothing saying which was money.
   *
   * **The letters.** Every typed field here is `type="text"` with
   * `inputMode="decimal"` — right, because a spinner on a money field is
   * wrong — and that shape takes anything: `12ab` sat in the box looking
   * entered while the button quietly did nothing. The assertion is on all
   * three parts of the fix at once, because the filter alone is the silent
   * version of the same bug: the character does not land, the field says so,
   * and the screen says why. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(700);

    /* Letters, into the field the whole ticket is priced from. */
    await page.click("input[aria-label='Entry price']");
    await page.evaluate(
      `(() => {
         const e = document.querySelector("input[aria-label='Entry price']");
         const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
         set.call(e, "");
         e.dispatchEvent(new Event("input", { bubbles: true }));
       })()`,
    );
    await page.keyboard.type("41a2b0");
    await page.waitForTimeout(250);
    const typed = await page.evaluate(
      `(() => {
         const e = document.querySelector("input[aria-label='Entry price']");
         return {
           value: e.value,
           invalid: e.getAttribute("aria-invalid"),
           said: /Numbers only/.test(document.body.innerText),
           border: getComputedStyle(e).borderTopColor,
         };
       })()`,
    );
    check(typed.value === "4120", "a number box keeps the digits and drops the letters", typed.value);
    check(typed.invalid === "true", "…and marks itself as having refused something");
    check(typed.said, "…and the screen says why, rather than looking like a dead key");

    /* The money on this screen says which money it is. */
    const cur = await page.evaluate(
      `(() => {
         const t = document.body.innerText;
         return {
           /* A USDT account: the unit follows the amount (practiceSymbolFor). */
           equity: /[\\d,]+\\.\\d\\d USDT/.test(t),
           bare: /(^|\\s)10,000\\.00(?! USDT)(\\s|$)/m.test(t),
         };
       })()`,
    );
    check(cur.equity, "the futures figures carry their currency");
    check(!cur.bare, "…and none of them is left as a bare number", "a bare 10,000.00 is still on screen");

    /* **A price is printed to the precision the instrument trades in.**
       `PRICE_SCALE` is e4 so that a fraction-of-a-cent coin has somewhere to
       go; printing all four places for every coin put `$112,536.2400` beside
       the header's `$112,480.00` and `$56,579.9999` on the same card — three
       precisions for one kind of number. Asserted on the screen rather than
       on the helper: it is the mixture that was the defect. */
    const places = await page.evaluate(
      `(() => {
         const t = document.body.innerText;
         const four = t.match(/\\$[\\d,]+\\.\\d{4}(?!\\d)/g) || [];
         return { four: four.slice(0, 4), any: /\\$[\\d,]{4,}\\.\\d\\d(?!\\d)/.test(t) };
       })()`,
    );
    check(
      places.four.length === 0,
      "a four-figure price is printed to the cent, not to the model's own scale",
      places.four.join(" "),
    );
    check(places.any, "…and is still printed with its decimals, not rounded away");

    /* **The order button does not leave the screen.** Measured at 1280×720 it
       sat twelve pixels under the fold with the panel scrolling: reachable,
       and not there. 1366×768 is a live laptop, and no venue lets its order
       button off the screen. */
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);
    const pinned = await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button"))
           .find((n) => /Open (long|short) on/i.test(n.innerText));
         if (!b) return null;
         const r = b.getBoundingClientRect();
         const foot = document.querySelector("[data-practice-ticket-foot]");
         return {
           bottom: Math.round(r.bottom),
           vh: window.innerHeight,
           sticky: foot ? getComputedStyle(foot).position : null,
         };
       })()`,
    );
    check(
      pinned && pinned.bottom <= pinned.vh,
      "the order button is on the screen on a short window",
      pinned ? `${pinned.bottom} of ${pinned.vh}` : "no button",
    );
    check(pinned && pinned.sticky === "sticky", "…because its foot is pinned, not because it fits");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(400);

    /* **The ticket remembers what it was set to.** It was component state, on
       a page where every tab is a fresh JavaScript context — so somebody who
       trades at 20x set it again on every tab they ever opened. Leverage is
       held per coin, the way a venue holds it. */
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button"))
           .find((n) => n.innerText.trim() === "50x");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(400);
    const remembered = await page.evaluate(
      `(() => {
         const raw = localStorage.getItem("crypto_chart_practice_ticket");
         const t = raw ? JSON.parse(raw) : null;
         return t && t.leverage ? t.leverage : null;
       })()`,
    );
    check(
      remembered && Object.values(remembered).includes(50),
      "the leverage the ticket was set to is remembered against its coin",
      JSON.stringify(remembered),
    );

    /* The account tab, and the walls it is there to show. */
    const opened = await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "Account");
         if (b) b.click();
         return Boolean(b);
       })()`,
    );
    check(opened, "futures has an account tab");
    await page.waitForTimeout(400);
    /* The balance lives in the foot drawer now, and a shut drawer is
       `visibility: hidden` — so `innerText`, which returns what is rendered,
       correctly does not contain it. Open it before reading the tab. */
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find((n) => n.innerText.trim() === "Account");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(500);
    const acct = await page.evaluate(
      `(() => {
         const t = document.body.innerText;
         return {
           /* The money has a tab of its own now; what the Account tab
              carries is the way to it. */
           balance: Array.from(document.querySelectorAll("button")).some((b) => b.innerText.trim() === "Funds"),
           /* Lower-cased on both sides: these labels are drawn through a
              text-transform of uppercase, and innerText — unlike textContent
              — returns what is *rendered*, so the check for "Most leverage"
              matched none of the four that were on screen. */
           /* Two of these say "session", not "account", and the labels were
              corrected to match what the model does: the count is spent when a
              contract is opened and the loss limit is measured from where the
              session began, so both are reset by Start over and neither is a
              rule about the account's whole life. */
           limits: ["most leverage", "size-based leverage", "margin per contract", "contracts this session may open",
                    "loss that ends the session"].filter((s) => t.toLowerCase().includes(s)).length,
           /* Collapsed, this section is four labels and four values — the
              choices and the standing are one click in, so both are read
              from the drawer that has been opened rather than from the
              page. innerText is the right instrument for that: a shut
              drawer body reports none of its text, which is exactly the
              distinction being asserted. (No backticks in a comment inside
              a template literal — one ends the literal.) */
           standing: false,
           chips: 0,
         };
       })()`,
    );
    /* The control **sets** the balance now rather than naming the account's
       opening size — typing a figure moves the money and keeps the lots, the
       contracts and the record, where it used to replace the account. */
    check(acct.balance, "…with the Funds tab beside it, whatever is running");
    /* **Withdraw is a game action with a bar on the button.** Pressed once it
       asks; pressed again it runs the four-second fill inside the button,
       reading "Sending …", and the free balance goes to zero when it lands
       — the button then reads "Sent". Nothing sets a balance to a figure. */
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find((n) => n.innerText.trim() === "Funds");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(500);
    await page.evaluate(
      `(() => {
         const w = document.querySelector("[data-practice-transfer='withdraw']");
         if (w) w.click();
       })()`,
    );
    await page.waitForTimeout(400);
    const armed = await page.evaluate(
      `(() => {
         const b = document.querySelector("[data-practice-transfer='withdraw']");
         return { there: Boolean(b), label: b ? b.innerText.trim() : "", disabled: b ? b.disabled : null, game: /game/i.test(document.body.innerText) };
       })()`,
    );
    check(armed.there && /confirm/i.test(armed.label) && armed.disabled === false, "withdraw asks once before it runs", JSON.stringify(armed));
    check(armed.game, "…and the drawer says in words that this is a game, with no real money");
    await page.evaluate(`(() => { const b = document.querySelector("[data-practice-transfer='withdraw']"); if (b) b.click(); })()`);
    await page.waitForTimeout(600);
    const sending = await page.evaluate(
      `(() => {
         const b = document.querySelector("[data-practice-transfer='withdraw']");
         const fill = b ? b.querySelector("div > div") : null;
         const head = document.querySelector("[data-practice-withdraw]");
         const shown = head ? (head.innerText.split("\\n")[1] || "") : "";
         return { label: b ? b.innerText.trim() : "", busy: b ? b.getAttribute("aria-busy") : null, bar: Boolean(fill), inside: fill ? b.contains(fill) : false, shown };
       })()`,
    );
    check(/^Sending/.test(sending.label) && sending.busy === "true" && sending.bar && sending.inside, "…then the button itself carries the bar and reads Sending", JSON.stringify(sending));
    check(/[1-9]/.test(sending.shown), "…and the money is still there while it runs", sending.shown);
    await page.waitForTimeout(4600);
    const sent = await page.evaluate(
      `(() => {
         const b = document.querySelector("[data-practice-transfer='withdraw']");
         const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
         return { balance: p.balance, label: b ? b.innerText.trim() : "" };
       })()`,
    );
    check(sent.balance === 0 && /^Sent$/.test(sent.label), "…then the free balance is zero and the button reads Sent", JSON.stringify(sent));
    /* Back to the Account tab for the limits below. */
    await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => n.innerText.trim() === "Account"); if (b) b.click(); })()`);
    await page.waitForTimeout(500);
    /* Four since the contract quota was removed and the venue-style size
       ladder became an explicit account rule — see the
       block below, which now drives the one session rule that is left. */
    check(acct.limits === 4, "…and all four limits the model actually enforces", `${acct.limits} of 4`);
    /* **Four rules, one open at a time, each explaining itself.**
     *
     * They were four rows of chips with a line of standing under each — enough
     * for somebody who already knows what a margin cap is and nothing at all
     * for somebody who does not. Every one of them can stop you, and a rule you
     * can be stopped by is a rule you are owed an explanation of. The "is not"
     * line does the work: each of these gets mistaken for a neighbouring rule
     * — the loss limit for a stop-loss, the per-contract wall for a cap on the
     * account, the count for how many you may hold. */
    const limitCard = async (key) => {
      const sel = JSON.stringify(`[data-practice-limit='${key}']`);
      await page.evaluate(
        `(() => {
           const d = document.querySelector(${sel});
           if (d) d.querySelector("button").click();
         })()`,
      );
      await page.waitForTimeout(400);
      return page.evaluate(
        `(() => {
           const rows = Array.from(document.querySelectorAll("[data-practice-limit]"));
           const d = document.querySelector(${sel});
           /* Scoped to the drawer that was opened, never the first match: the
              other three cards are still in the DOM inside a collapsed body,
              where innerText is empty — a document-wide query reads one of
              those and reports the feature missing. */
           const w = d ? d.querySelector("[data-practice-limit-what]") : null;
           return {
             text: w ? w.innerText : "",
             rows: rows.length,
             open: rows.filter((n) =>
               n.querySelector("button").getAttribute("aria-expanded") === "true").length,
           };
         })()`,
      );
    };
    const loss = await limitCard("sessionLossPct");
    /* Four: the session contract quota was removed from the
       product, not hidden — it refused people with most of their money still
       in the account, and no venue rations how many positions you may take;
       the size-based leverage ladder is a real venue rule and is explicit. */
    check(loss.rows === 5, "the five risk limits are an accordion", `${loss.rows}`);
    check(loss.open === 1, "…with one open at a time");
    check(
      /what it is/i.test(loss.text) && /what it is not/i.test(loss.text)
        && /right now/i.test(loss.text),
      "…and the open one says what it is, what it is not, and where you stand",
      loss.text.slice(0, 80),
    );
    check(
      /stop-loss/i.test(loss.text),
      "…naming the rule it is most often mistaken for",
    );
    const another = await limitCard("marginSharePct");
    check(another.open === 1, "…and opening another puts the first away");
    check(
      another.rows === 5 && !/contracts this session/i.test(another.text),
      "…and no rule rations how many contracts a session may open",
      another.text.slice(0, 80),
    );
    /* **The two rules no exchange has are off, and the head says so.**
     *
     * Reported as: a real venue lets my account open a derivatives position,
     * and yours refused with "this session has opened every contract it is
     * allowed". It came from this panel's first life as a training drill, where
     * being stopped by a cap you had set was the exercise. Both rules are still
     * offered — off is simply the default now, so a fresh account behaves like
     * a market. Matched on the value in each drawer's head, which is the part
     * somebody reads without opening anything. */
    const offHeads = await page.evaluate(
      `(() => {
         const head = (k) => {
           const d = document.querySelector("[data-practice-limit='" + k + "']");
           return d ? d.querySelector("button").innerText.trim() : "";
         };
         return { count: document.querySelector("[data-practice-limit='maxPositions']") ? "present" : "gone",
                  loss: head("sessionLossPct"), tiers: head("sizeTiers"),
                  lev: head("maxLeverage"), margin: head("marginSharePct") };
       })()`,
    );
    check(
      offHeads.count === "gone" && /off$/i.test(offHeads.loss),
      "the contract quota is gone from the product, and the session loss stop is off by default",
      JSON.stringify(offHeads),
    );
    /* **And the per-contract wall is off by default too** since 18 Sep 2026,
       asked for as "bütün parayı türevliye sokabileyim": a venue lets one
       isolated contract take all the free balance there is. The leverage
       ceiling is the one plan rule still on, because every venue has one. */
    check(
      /200x$/.test(offHeads.lev) && /off$/i.test(offHeads.margin),
      "…the leverage ceiling stays on, and the per-contract wall is off until chosen",
      JSON.stringify(offHeads),
    );
    check(/on$/i.test(offHeads.tiers),
      "…while venue-style leverage tiers stay on until explicitly stood down",
      JSON.stringify(offHeads));
    check(
      /how many you may hold/i.test(another.text) && /\d/.test(another.text),
      "…each in the account's own figures rather than in general prose",
      another.text.slice(0, 80),
    );
    /* Opened, a rule gives you the values it will accept and where you stand
       in it. Read through the drawer rather than through the page, since the
       other three are shut and hold the same kinds of text. */
    const openLimit = async (key) => {
      const sel = JSON.stringify(`[data-practice-limit='${key}']`);
      await page.evaluate(
        `(() => {
           const d = document.querySelector(${sel});
           if (d && d.querySelector("button").getAttribute("aria-expanded") !== "true") {
             d.querySelector("button").click();
           }
         })()`,
      );
      await page.waitForTimeout(350);
      return page.evaluate(
        `(() => {
           const d = document.querySelector(${sel});
           return {
             text: d ? d.innerText : "",
             /* Every value this rule will accept, with whether it can be
                pressed — the two things a locked account has to get right at
                once: the choices are still there and none of them answers. */
             chips: d
               ? Array.from(d.querySelectorAll("button"))
                   /* "Off" is a value too — the wall's own default since
                      18 Sep 2026 — and a locked account must refuse it like
                      any other. */
                   .filter((n) => /^(\\d+(x|%)|on|off)$/i.test(n.innerText.trim()))
                   .map((n) => ({ label: n.innerText.trim(), off: n.disabled }))
               : [],
           };
         })()`,
      );
    };
    check(
      /all of the free balance, [\d,]+\.\d\d USDT now/i.test((await openLimit("marginSharePct")).text),
      "…each saying where this account stands in it — off, and how much that is",
    );
    const levLimit = await openLimit("maxLeverage");
    check(
      levLimit.chips.map((c) => c.label).join(" ") === "10x 50x 100x 200x",
      "…and offering the values the model will accept",
      levLimit.chips.map((c) => c.label).join(" ") || "none",
    );
    const tierLimit = await openLimit("sizeTiers");
    check(
      tierLimit.chips.map((c) => c.label).join(" ") === "On Off"
        && /real venue/i.test(tierLimit.text),
      "…and the size ladder can be stood down without pretending that is venue behaviour",
      `${tierLimit.chips.map((c) => c.label).join(" ")} · ${tierLimit.text.slice(0, 80)}`,
    );
    /* **The gauge below measures a rule that is off by default**, so it is not
       on screen until this presses the rule on — through its own chip, which is
       the control a person would use. Asserting it against the default would
       have been asserting the default, and the default moved on 16 Sep 2026
       when the two rules no venue has were switched off. */
    const turnedOn = await page.evaluate(
      `(() => {
         const d = document.querySelector("[data-practice-limit='sessionLossPct']");
         if (!d) return "no drawer";
         if (d.querySelector("button").getAttribute("aria-expanded") !== "true") {
           d.querySelector("button").click();
         }
         const b = Array.from(d.querySelectorAll("button"))
           .find((n) => n.innerText.trim() === "5%");
         if (!b) return "no 5% chip";
         if (b.disabled) return "chip disabled";
         b.click();
         return "pressed";
       })()`,
    );
    check(
      turnedOn === "pressed",
      "the session loss rule is switched back on from its own row",
      turnedOn,
    );
    await page.waitForTimeout(450);
    /* **The tab opens on where you stand, not on a control.** The complaint
       that produced this was that the screen looked unprofessional, and the
       shape behind it was measurable: one flat column in which the simulated
       balance and the loss limit had identical weight, with no summary and no
       divisions. Asserted as the two things that fixes — four facts you cannot
       change, above three named sections — rather than as markup. */
    const shape = await page.evaluate(
      `(() => {
         const tab = document.querySelector("[data-practice-account]");
         if (!tab) return null;
         const t = tab.innerText.toLowerCase();
         const gauge = tab.querySelector("[role='progressbar']");
         return {
           facts: ["equity", "free", "in contracts", "unrealised"]
             .filter((k) => t.includes(k)).length,
           sections: ["balance", "contract rules", "risk limits"]
             .filter((k) => t.includes(k)).length,
           gauge: Boolean(gauge && gauge.getAttribute("aria-valuenow") !== null),
           /* The summary has to be *above* the first thing you can press, or
              it is a footer rather than a header. */
           summaryFirst: (() => {
             const sum = tab.querySelector("[role='progressbar']");
             const btn = tab.querySelector("button");
             if (!sum || !btn) return false;
             return sum.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING
               ? true
               : false;
           })(),
         };
       })()`,
    );
    check(
      shape && shape.facts === 4,
      "the account tab opens on where you stand, not on a control",
      shape ? `${shape.facts} of 4 figures` : "no account tab",
    );
    check(
      shape && shape.sections === 3,
      "…and is divided into named sections instead of one flat column",
      shape ? `${shape.sections} of 3 headings` : "no account tab",
    );
    check(
      shape && shape.gauge,
      "…with the loss that ends the account drawn as a proportion, not a sentence",
    );
    /* **…and the proportion says what it is a proportion of.** It was a 4px
       rule with no caption, no figure and no colour until it was nearly full:
       on a capture it was indistinguishable from the section rule under it.
       The screen reader had the whole sentence the whole time; everybody else
       had a line. */
    const gauged = await page.evaluate(
      `(() => {
         const tab = document.querySelector("[data-practice-account]");
         const t = tab ? tab.innerText.toLowerCase() : "";
         return {
           named: /loss that ends the session/.test(t),
           standing: /[\\d.]+( usdt)? of [^\\n]*[\\d.]/.test(t),
         };
       })()`,
    );
    check(gauged.named, "…captioned with the rule it is measuring");
    check(gauged.standing, "…and carrying where this account stands in it");

    /* **How a contract is printed is not one of its rules.** Units sat in
       Contract rules beside Settlement, which decides what the contract *is*;
       its own note says "nothing about the account moves". */
    const filed = await page.evaluate(
      `(() => {
         const tab = document.querySelector("[data-practice-account]");
         const units = document.querySelector("[data-practice-units]");
         if (!tab || !units) return null;
         const heads = Array.from(tab.querySelectorAll("*")).filter(
           (n) => n.children.length === 0
             && /^(contract rules|display|risk limits|balance)$/i.test(n.textContent.trim()),
         );
         /* The head this block sits under is the last one before it in
            document order. */
         let under = null;
         for (const h of heads) {
           if (h.compareDocumentPosition(units) & Node.DOCUMENT_POSITION_FOLLOWING) {
             under = h.textContent.trim().toLowerCase();
           }
         }
         return { under, heads: heads.map((h) => h.textContent.trim().toLowerCase()) };
       })()`,
    );
    check(
      filed && filed.under === "display",
      "how a contract is read is filed under display, not under the contract's rules",
      filed ? `under "${filed.under}"` : "not found",
    );

    /* A lower account ceiling reshapes the control itself. Refusing 51x only
       after a 200x rail offered it would make the plan a hidden validation
       rule rather than the wall the Account tab says it is. */
    await openLimit("maxLeverage");
    await page.evaluate(
      `(() => {
         const d = document.querySelector("[data-practice-limit='maxLeverage']");
         const b = Array.from((d || document).querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "50x");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(300);

    /* Locked, not hidden, once a contract is running: `resetPractice` refuses
       while anything is open, so a control that still looked pressable would
       be the worse half of the bug the ticket's own button used to have. */
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim().startsWith("New contract"));
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(300);
    const tightened = await page.evaluate(
      `(() => {
         const r = document.querySelector('input[type="range"][aria-label="Leverage"]');
         const t = document.body.innerText.toLowerCase();
         const ticks = Array.from(document.querySelectorAll("button"))
           .map((b) => b.innerText.trim())
           .filter((s) => /^(1|15|25|40|50)x$/.test(s));
         return {
           max: r ? r.max : null,
           ticks,
           scope: t.includes("isolated · account max 50x"),
         };
       })()`,
    );
    check(tightened.max === "50", "a 50x account ends the leverage rail at 50x", tightened.max);
    check(
      tightened.ticks.join(" ") === "1x 15x 25x 40x 50x",
      "…and keeps five evenly placed marks across that range",
      tightened.ticks.join(" "),
    );
    check(tightened.scope, "…with the ceiling written beside the field");
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find((n) =>
           /Open long on/i.test(n.innerText));
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(600);

    /* The position keeps its quantity and leverage while added isolated
       margin moves its liquidation farther away. The preview is visible
       before the ledger event; the committed state then proves the same
       transition actually ran. */
    const marginBefore = await page.evaluate(
      `(() => {
         const s = JSON.parse(localStorage.getItem("crypto_chart_practice"));
         /* By coin, not by key: the store is keyed by contract id now that
            a market can carry several, and the newest BTC contract is the
            one this walk just opened. */
         const p = Object.values(s.positions || {})
           .filter((q) => q.coin === "BTC").pop();
         return { margin: p.margin, liq: practiceLiquidationPrice(p) };
       })()`,
    );
    /* The row's opener covers both directions now and is named for the thing
       rather than for one of them. It is inside the contract, which the
       page's table unfolds. */
    await page.evaluate(OPEN_CARD);
    await page.waitForTimeout(500);
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "Margin");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(250);
    await page.fill('input[aria-label="Add margin"]', "100");
    await page.waitForTimeout(250);
    const marginPreview = await page.evaluate(
      `(() => {
         const input = document.querySelector('input[aria-label="Add margin"]');
         const editor = input && input.parentElement.parentElement.parentElement;
         const preview = editor ? editor.innerText : "";
         return {
           said: /margin/i.test(preview) && /liquidation/i.test(preview),
           preview,
           enabled: Array.from(document.querySelectorAll("button"))
             .filter((n) => n.innerText.trim() === "Add margin")
             .some((n) => !n.disabled),
         };
       })()`,
    );
    check(
      marginPreview.said,
      "adding isolated margin previews both margin and liquidation",
      marginPreview.preview,
    );
    check(marginPreview.enabled, "…before offering the commit");
    await page.evaluate(
      `(() => {
         const buttons = Array.from(document.querySelectorAll("button"))
           .filter((n) => n.innerText.trim() === "Add margin" && !n.disabled);
         if (buttons.length) buttons[buttons.length - 1].click();
       })()`,
    );
    await page.waitForTimeout(400);
    const marginAfter = await page.evaluate(
      `(() => {
         const s = JSON.parse(localStorage.getItem("crypto_chart_practice"));
         /* By coin, not by key: the store is keyed by contract id now that
            a market can carry several, and the newest BTC contract is the
            one this walk just opened. */
         const p = Object.values(s.positions || {})
           .filter((q) => q.coin === "BTC").pop();
         const last = s.ledger[s.ledger.length - 1];
         return {
           margin: p.margin, liq: practiceLiquidationPrice(p), kind: last.kind,
           qty: p.qty, entry: p.entry,
         };
       })()`,
    );
    check(
      marginAfter.margin === marginBefore.margin + 10000,
      "the typed amount is transferred into the position exactly",
      `${marginBefore.margin} → ${marginAfter.margin}`,
    );
    check(marginAfter.liq < marginBefore.liq, "…and moves a long's liquidation farther away");
    check(marginAfter.kind === "margin", "…with the transfer recorded in the ledger");

    /* **And it comes back out.** Adding has been here since the card was;
       taking it out was never written — not a rule the model enforced, just a
       function nobody had written, and a venue lets you withdraw free margin
       from an isolated position exactly as it lets you post more. Asked as
       "why can we not change the margin afterwards". */
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "Margin");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(300);
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "Take out");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(350);
    const outHint = await page.evaluate(
      `(() => {
         const input = document.querySelector('input[aria-label="Take margin out"]');
         const editor = input && input.parentElement.parentElement.parentElement;
         return {
           there: Boolean(input),
           says: editor ? editor.innerText : "",
           /* The offer is bisected on the same predicate the withdrawal is
              refused by, so the figure and the rule cannot disagree. */
           offer: input ? input.getAttribute("placeholder") : null,
         };
       })()`,
    );
    check(outHint.there, "…and margin can be taken back out of the same editor");
    check(
      /up to/i.test(outHint.says) && /[0-9]/.test(String(outHint.offer)),
      "…which says the most it will let go of, rather than leaving it to be found by refusal",
      `${outHint.offer}`,
    );
    await page.fill('input[aria-label="Take margin out"]', "50");
    await page.waitForTimeout(300);
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button"))
           .filter((n) => n.innerText.trim() === "Take margin out" && !n.disabled);
         if (b.length) b[b.length - 1].click();
       })()`,
    );
    await page.waitForTimeout(450);
    const tookOut = await page.evaluate(
      `(() => {
         const s = JSON.parse(localStorage.getItem("crypto_chart_practice"));
         /* By coin, not by key: the store is keyed by contract id now that
            a market can carry several, and the newest BTC contract is the
            one this walk just opened. */
         const p = Object.values(s.positions || {})
           .filter((q) => q.coin === "BTC").pop();
         const rec = practiceReconcile(s);
         return {
           margin: p.margin,
           liq: practiceLiquidationPrice(p),
           qty: p.qty,
           entry: p.entry,
           ok: rec.ok === true,
         };
       })()`,
    );
    check(
      tookOut.margin === marginAfter.margin - 5000,
      "the typed amount leaves the position exactly",
      `${marginAfter.margin} → ${tookOut.margin}`,
    );
    check(
      tookOut.liq > marginAfter.liq
        && tookOut.qty === marginAfter.qty
        && tookOut.entry === marginAfter.entry,
      "…moving a long's liquidation closer and changing nothing else about the contract",
    );
    check(tookOut.ok, "…and the ledger still explains the balance");
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "Account");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(400);
    /* Two of the four rules carry chips, and they are one click apart now —
       so the sweep opens each in turn rather than reading the page, which
       with every drawer shut would find nothing and call that "all
       disabled". */
    const lockedChips = [
      ...(await openLimit("maxLeverage")).chips,
      ...(await openLimit("marginSharePct")).chips,
    ];
    /* The sentence is read on the Account tab, then the Funds tab is opened
       for the field: money is added there now, and adding re-scales nothing,
       so the field stays live while a contract runs. */
    const locked = await page.evaluate(
      `(() => {
         const said = /locked while a contract is running/i.test(document.body.innerText);
         const b = Array.from(document.querySelectorAll("button")).find((n) => n.innerText.trim() === "Funds");
         if (b) b.click();
         return { said };
       })()`,
    );
    await page.waitForTimeout(500);
    locked.balance = await page.evaluate(
      `(() => {
         const f = document.querySelector("input[aria-label*='add to the simulated balance']");
         return f ? f.disabled : null;
       })()`,
    );
    const stillLive = lockedChips.filter((c) => !c.off).length;
    check(lockedChips.length > 0 && stillLive === 0,
      "with a contract running the plan's chips are disabled",
      `${stillLive} of ${lockedChips.length} still pressable`);
    /* **This used to assert the balance field was disabled too, and that was
     * the wrong half of a contradiction.**
     *
     * Changed deliberately on 13 Sep 2026, not to make anything pass. The
     * evidence: `practiceSetBalance` accepts the change with a contract
     * running (it refuses on its own to take back committed margin); the
     * preset chips immediately above the field were never locked and their
     * comment says exactly why; and the field's own hint says "Nothing else
     * moves: your contracts, your lots and the whole record stay as they
     * are." The lock was a leftover from when setting the balance replaced
     * the account, and it greyed out the one control that gets somebody out
     * of "not enough free balance to open" — which is how the human met it.
     * §36 holds the new behaviour and the refusal that sends them here. */
    check(locked.balance === false,
      "…while adding money, which re-scales nothing, stays possible on the Funds tab",
      String(locked.balance));
    check(locked.said,
      "…and the tab says which of them are locked", String(locked.said));
    /* **A limit met on the ticket offers the way on, on the ticket.**
     *
     * Reported as "two contracts, even though I have money". A refusal that
     * means "this session is over" used to be cleared only from the Account
     * tab — a screen somebody stopped on the order form has no reason to open —
     * so the ticket refused and offered nothing, which reads as a broken
     * account with money in it.
     *
     * **Driven by the session loss stop, because the contract quota it used to
     * be driven by is gone** (16 Sep 2026: it refused people with most of their
     * money still there, and no venue has one). The stop is off by default, so
     * this fixture switches it on and puts the session past it — which is also
     * the only shape left in which that button can appear.
     *
     * Written at the current schema on purpose: an older file would be
     * *migrated* out of exactly this state on load, which is the fix for the
     * complaint and would leave this block testing nothing. */
    /* **Built by the model rather than typed.** A hand-written `realised` does
       not survive the loader: the account is rebuilt from its ledger, so a loss
       no ledger row explains comes back as zero and the session is not stopped
       at all — measured, `realised: -60000` loaded as `0`. The page has the
       model's own functions in scope, so the fixture opens a contract and
       closes it into a loss the way the app would, and stores what that
       produces. */
    const stopped = await page.evaluate(
      `(() => {
         const base = practiceEmptySession();
         let s = { ...base, plan: { ...base.plan, sessionLossPct: 5 } };
         const entry = 43480 * PRICE_SCALE;
         const o = practiceOpen(s, { coin: "BTC", side: "long", qty: 800, leverage: 50 }, entry);
         if (o.error) return { error: o.error };
         s = practiceReduce(o.state, o.id, 800, Math.round(entry * 0.95), "close").state;
         localStorage.setItem("crypto_chart_practice", JSON.stringify(s));
         return { loss: practiceSessionLoss(s, "BTC"), cap: practiceSessionLossCap(s, "BTC"),
                  balance: s.balance };
       })()`,
    );
    check(
      stopped.loss >= stopped.cap,
      "the fixture is a session that has lost its stop",
      JSON.stringify(stopped),
    );
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.keyboard.press("f");
    await page.waitForTimeout(800);
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim().startsWith("New contract"));
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(500);
    const capped = await page.evaluate(
      `(() => {
         const way = document.querySelector("[data-practice-ticket-session]");
         const btn = Array.from(document.querySelectorAll("button")).find(
           (n) => /Open (long|short) on/i.test(n.innerText));
         const t = document.body.innerText;
         return { way: Boolean(way), stopped: btn ? btn.disabled : null,
                  resets: /reset to start again/i.test(t) };
       })()`,
    );
    check(capped.stopped === true, "a session past its loss stop stops the ticket");
    check(capped.way, "…and offers the way on right there, not on another tab");
    check(!capped.resets, "…without telling anyone to reset, which destroys the record");
    await page.evaluate(
      `(() => { const b = document.querySelector("[data-practice-ticket-session]"); if (b) b.click(); })()`,
    );
    await page.waitForTimeout(700);
    const freed = await page.evaluate(
      `(() => {
         const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
         const btn = Array.from(document.querySelectorAll("button")).find(
           (n) => /Open (long|short) on/i.test(n.innerText));
         return { blocked: btn ? btn.disabled : null, balance: p.balance, from: p.openedFrom };
       })()`,
    );
    check(
      freed.blocked === false,
      "…and pressing it lets a contract be opened again",
      JSON.stringify(freed),
    );
    check(
      freed.balance === stopped.balance,
      "…with the money untouched — a new session is not a reset",
      JSON.stringify(freed),
    );

    await ctx.close();
  }

  /* §25 — closing a position in the piece you chose.
   *
   * The row offered 25%, 50% and All, each firing on the press with no figure
   * and no confirmation: three fractions that cannot express "take 0.35 off",
   * and the only irreversible control on the screen was one you could hit by
   * accident. It is a ticket now — type the size in the coin or in money, see
   * it quoted for that exact size, and see what is left standing.
   *
   * The assertions are the three things that are each silently wrong on their
   * own. **The unit toggle converts** rather than relabelling, or `0.5` means
   * half a coin one moment and fifty cents the next. **The quote is for the
   * piece**, not the position, or the ticket is decoration over a full close.
   * And **the amount the button names is the amount that leaves the
   * position** — the whole reason the sizing rules were moved into the model
   * is that the quote and the commit must be one arithmetic. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: BIG_PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "112480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(700);

    const press = (re) =>
      page.evaluate(
        `(() => {
           const b = Array.from(document.querySelectorAll("button")).find((n) =>
             ${re}.test(n.innerText.trim()));
           if (b) b.click();
           return Boolean(b);
         })()`,
      );
    const held = () =>
      page.evaluate(
        `(() => {
           const s = JSON.parse(localStorage.getItem("crypto_chart_practice") || "null");
           const p = s && s.positions
             && Object.values(s.positions).filter((q) => q.coin === "BTC").pop();
           return p ? p.qty : 0;
         })()`,
      );

    /* Full size, so a quarter of it is still several lots. */
    await press("/^100%$/");
    await page.waitForTimeout(200);
    await press("/Open long on/");
    await page.waitForTimeout(800);
    const opened = await held();
    check(opened > 4, "a position is open to close part of", `${opened} lots`);

    /* `Amount…` is the row's way into a size that is not a quarter of
       anything. It is asserted here rather than a bare "Close" because the
       shares are on the row itself now — and the guarantee being checked is
       unchanged: pressing it opens a ticket, it does not sell anything. */
    /* The shares and Amount… are inside the contract, which its row in the
       page's table unfolds. */
    await page.evaluate(OPEN_CARD);
    await page.waitForTimeout(500);
    check(await press("/^Amount…$/"), "the row opens a close ticket rather than firing");
    await page.waitForTimeout(400);
    /* Pressing Close must not have closed anything: that is the defect. */
    check((await held()) === opened, "…and opening it closes nothing");

    await press("/^25%$/");
    await page.waitForTimeout(350);
    const quarter = await page.evaluate(
      `(() => {
         const f = document.querySelector("input[aria-label^='Amount of']");
         const btn = Array.from(document.querySelectorAll("button")).find((n) =>
           /^Close [0-9]/.test(n.innerText.trim()));
         const t = document.body.innerText;
         return {
           value: f ? f.value : null,
           button: btn ? btn.innerText.trim() : null,
           split: /STILL OPEN/i.test(t),
         };
       })()`,
    );
    check(Number(quarter.value) > 0, "a share chip fills the same field it is a shortcut for", `${quarter.value}`);
    check(quarter.split, "…and the ticket says what would be left standing");
    check(
      quarter.button === `Close ${quarter.value} BTC`,
      "…and the button names exactly what it will take",
      `${quarter.button} against ${quarter.value}`,
    );

    /* The unit toggle converts the number rather than relabelling it. */
    const coinValue = Number(quarter.value);
    /* **A character class, not an escape.** The button's whole label is `$`,
       and this string is interpolated into a template literal — where `\$`
       collapses to a bare `$`, so `/^\$$/` arrived as `/^$$/`, matched
       nothing, and the toggle was never pressed. Every check under it then
       passed against a field that had not changed unit. */
    /* "USDT", the account's unit, where it was "$" (`posUnit`). */
    check(await press("/^USDT$/"), "the amount field carries a unit toggle");
    await page.waitForTimeout(350);
    const cash = await page.evaluate(
      `(() => {
         const f = document.querySelector("input[aria-label^='Amount of']");
         const btn = Array.from(document.querySelectorAll("button")).find((n) =>
           /^Close [0-9]/.test(n.innerText.trim()));
         return { value: f ? Number(f.value) : null, button: btn ? btn.innerText.trim() : null };
       })()`,
    );
    check(
      cash.value > coinValue * 1000,
      "switching the unit converts the amount instead of relabelling it",
      `${coinValue} became ${cash.value}`,
    );
    check(
      cash.button === `Close ${quarter.value} BTC`,
      "…and the same size is still being taken",
      `${cash.button}`,
    );

    /* A size typed in money, committed, against the position it leaves. */
    await page.fill("input[aria-label^='Amount of']", "");
    await page.waitForTimeout(150);
    /* A round sum that is a real *piece* of this position and not more than
       all of it: 35 lots at the 112,480 fixture is about $3,900 of notional,
       so 1,000 is roughly a quarter. Typed in money on purpose — the point of
       the check is that the ticket turns it back into a size in coins. */
    await page.type("input[aria-label^='Amount of']", "1000");
    await page.waitForTimeout(350);
    const named = await page.evaluate(
      `(() => {
         const btn = Array.from(document.querySelectorAll("button")).find((n) =>
           /^Close [0-9]/.test(n.innerText.trim()));
         return btn ? Number(btn.innerText.trim().split(" ")[1]) : null;
       })()`,
    );
    check(named > 0, "a size typed in money is quoted as a size in coins", `${named}`);
    const fired = await press("/^Close [0-9]/");
    await page.waitForTimeout(700);
    const left = await held();
    /* Guarded on `named` and on the press having happened. Without both, a
       run where the unit never switched read `named` as null, closed nothing,
       and `opened - 0 === opened` reported success — a check that passes
       loudest when the thing it is checking did not run. */
    check(
      fired && named > 0 && left === opened - Math.round(named * 1000),
      "the amount the button named is the amount that left the position",
      `${opened} - ${Math.round(named * 1000)} should be ${left}`,
    );
    check(left > 0, "…and the rest of the position is still open", `${left} lots`);

    /* **And it has to be reachable on every contract, at any moment.**
     *
     * The accordion opens one row at a time — right for the settlement
     * figures and the level editor, which are a study of one position, and
     * catastrophic for the way out: with the close control inside the reveal,
     * three running contracts had exactly **one** reachable Close, so taking
     * a piece off the second meant folding the first away to go and find it.
     * The strip lives outside the reveal now. This opens a second contract,
     * leaves it shut, and closes a quarter of it from the row — which is only
     * possible if the control is genuinely there. */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(900);
    await page.keyboard.press("f");
    await page.waitForTimeout(600);
    await press("/Open long on/");
    await page.waitForTimeout(700);
    /* **The way out is on the row, folded away or not.** The shares moved
       inside the contract when the table became the list (19 Sep 2026); what
       every row still carries, shut or open, is its own Close — which opens
       that contract's close ticket rather than firing. */
    const strips = await page.evaluate(
      `(() => {
         const rows = Array.from(document.querySelectorAll("[data-practice-position]"));
         return rows.map((row) => ({
           shut: row.querySelector("button[aria-expanded]").getAttribute("aria-expanded") === "false",
           controls: Array.from(row.querySelectorAll("button")).filter(
             (n) =>
               /^Close/.test(n.innerText.trim()) &&
               n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
           ).length,
         }));
       })()`,
    );
    check(strips.length === 2, "two contracts are running", `${strips.length}`);
    check(
      strips.length === 2 && strips.every((r) => r.controls >= 1),
      "every contract carries its own way out, open or shut",
      JSON.stringify(strips),
    );
    check(strips.every((r) => r.shut), "…and both start folded away");

    /* **`ratio 90.85` was the least legible number on the screen.** It was
       unlabelled, unexplained, and counted the opposite way up from the
       margin ratio every venue prints — where higher is worse and 100% is the
       end. Named for what it is, and given the ring the ticket's other two
       hard ideas already have. */
    const toTab = async (name) => {
      /* Built by concatenation, not in a template literal: an escape written
         inside one is resolved before the page ever sees it, and a newline
         escape in a page snippet ends the string it was meant to be in. */
      await page.evaluate(
        "(() => {" +
        "  const want = " + JSON.stringify(name) + ";" +
        "  const b = Array.from(document.querySelectorAll('button')).find(" +
        "    (n) => n.innerText.trim().split(String.fromCharCode(10))[0] === want);" +
        "  if (b) b.click();" +
        "})()",
      );
      await page.waitForTimeout(450);
    };
    await page.evaluate(OPEN_CARD);
    await page.waitForTimeout(450);
    /* `99+` counts: the readout clamps there, and since 16 Sep 2026 — when the
       maintenance requirement started being read off the size rather than off
       the leverage — a freshly opened contract of this size is routinely past
       it. The claim here is that the figure is *named* rather than printed as a
       bare `ratio 90.83`, and "cover 99+x" is that claim satisfied. */
    const cover = await page.evaluate(
      `(() => {
         const t = document.body.innerText;
         /* The cover is a labelled reading among the others now, so the
            label, its explaining ring and the value are three elements on
            three lines, so the regex allows whitespace and an optional ring
            where it used to want a single space. It stood
            alone under a rule of its own before, which is what an orphan
            looks like. */
         return { named: /cover\\s*\\??\\s*(?:[\\d.]+|99\\+)x/i.test(t), bare: /\\bratio \\d/i.test(t) };
       })()`,
    );
    check(cover.named, "the position's distance to liquidation is named, not a bare ratio");
    check(!cover.bare, "…and the unlabelled one is gone");
    /* **Scoped to the row that is open, not to the document.** Every folded
       row keeps its whole body in the DOM behind `visibility: hidden`, so a
       document-wide `querySelector` finds the *first* card's ring — pressing
       it opens an explanation inside a collapsed row, where `innerText` is
       empty and the feature looks missing. The card under test is the one
       whose head says `aria-expanded="true"`. */
    /* The contract that is unfolded: its row's own reveal, in the page's
       table. (The desk holds the ticket; there is no card column any more.) */
    const openCard = `(() => {
      const row = Array.from(document.querySelectorAll("[data-practice-position]"))
        .find((r) => {
          const b = r.querySelector("button[aria-expanded]");
          return b && b.getAttribute("aria-expanded") === "true";
        });
      return row ? row.nextElementSibling : null;
    })()`;
    const ringed = await page.evaluate(
      `(() => {
         const card = ${openCard};
         const ring = card && card.querySelector("[aria-label^='What cover']");
         if (ring) ring.click();
         return Boolean(ring);
       })()`,
    );
    await page.waitForTimeout(450);
    const coverCard = await page.evaluate(
      `(() => {
         const card = ${openCard};
         const n = card && card.querySelector("[data-practice-what='cover']");
         return n ? n.innerText : "";
       })()`,
    );
    check(ringed, "…and carries a ring that offers to explain it");
    check(
      /what it is/i.test(coverCard) && /what it is not/i.test(coverCard)
        && /1x/.test(coverCard),
      "…and the card says what it is, what it is not, and where the contract ends",
      coverCard ? coverCard.slice(0, 70) : "no card",
    );

    /* **The trailing stop is on the editor, and it is off until it is asked
       for.** The model's own suite proves the level ratchets and fires, and
       `scripts/trail-probe.js` walks a moving market end to end; what belongs
       here is the wiring nobody would notice going: that the control exists
       on the row's editor, that `off` is what a fresh contract shows, and
       that pressing a distance and saving actually reaches the stored
       contract. A control that renders and stores nothing is the defect this
       whole file was written for. */
    const trail = await page.evaluate(
      `(() => {
         const card = ${openCard};
         const edit = card && Array.from(card.querySelectorAll("button")).find(
           (b) => b.innerText.trim() === "Stop / TP");
         if (edit) edit.click();
         return Boolean(edit);
       })()`,
    );
    check(trail, "an open contract offers to change its levels");
    await page.waitForTimeout(400);
    const trailChips = await page.evaluate(
      `(() => {
         const box = document.querySelector("[data-practice-trail]");
         if (!box) return null;
         const chips = Array.from(box.querySelectorAll("button"));
         return {
           labels: chips.map((b) => b.innerText.trim()),
           pressed: chips.filter((b) => b.getAttribute("aria-pressed") === "true")
             .map((b) => b.innerText.trim()),
         };
       })()`,
    );
    check(
      trailChips && trailChips.labels.join(",") === "off,1%,2%,5%,10%",
      "…including a trailing stop, at four distances",
      JSON.stringify(trailChips),
    );
    check(
      trailChips && trailChips.pressed.join(",") === "off",
      "…off, which is where every contract starts",
      trailChips ? trailChips.pressed.join(",") : "no chips",
    );
    await page.evaluate(
      `(() => {
         const box = document.querySelector("[data-practice-trail]");
         const b = Array.from(box.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "5%");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(250);
    await press("/^Save levels$/");
    await page.waitForTimeout(500);
    const stored = await page.evaluate(
      `(() => {
         const p = JSON.parse(localStorage.getItem("crypto_chart_practice")).positions;
         return Object.values(p).map((q) => q.trail || 0);
       })()`,
    );
    check(
      stored.includes(50000),
      "…and saving one reaches the contract, as the distance in ppm",
      JSON.stringify(stored),
    );


    /* **A quarter off the row that was folded away, and nothing off the
       other.** Its Close is on the row whether it is open or shut; pressing
       it unfolds that contract with its close ticket armed, and the shares
       are in there. What is being checked is unchanged: the ticket that
       opens belongs to the row that was pressed. */
    const beforeBoth = await page.evaluate(
      `(() => {
         const p = JSON.parse(localStorage.getItem("crypto_chart_practice")).positions;
         /* Labelled by the contract's coin rather than by its key: the key is
            an id now, and the row this walk pressed is identified on screen
            by its market. The two contracts here are on different coins. */
         return Object.keys(p).map((k) => p[k].coin + ":" + p[k].qty).sort().join(" ");
       })()`,
    );
    const pressedShut = await page.evaluate(
      `(() => {
         const shut = Array.from(document.querySelectorAll("[data-practice-position]"))
           .find((r) => {
             const b = r.querySelector("button[aria-expanded]");
             return b && b.getAttribute("aria-expanded") === "false";
           });
         if (!shut) return null;
         const close = Array.from(shut.querySelectorAll("button")).find(
           (n) => /^Close/.test(n.innerText.trim()));
         if (!close) return null;
         close.click();
         return (shut.innerText.match(/[A-Z]{2,6}/) || [""])[0];
       })()`,
    );
    check(Boolean(pressedShut), "a folded-away contract can be closed from its own row");
    await page.waitForTimeout(600);
    /* The quarter chip, now that the contract it belongs to is unfolded. */
    await page.evaluate(
      `(() => {
         const row = Array.from(document.querySelectorAll("[data-practice-position]"))
           .find((r) => {
             const b = r.querySelector("button[aria-expanded]");
             return b && b.getAttribute("aria-expanded") === "true";
           });
         const detail = row && row.nextElementSibling;
         const b = detail && Array.from(detail.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "25%");
         if (b) b.click();
         return Boolean(b);
       })()`,
    );
    await page.waitForTimeout(500);
    const ticketed = await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find((n) =>
           /^Close [0-9]/.test(n.innerText.trim()));
         return b ? b.innerText.trim() : null;
       })()`,
    );
    check(
      Boolean(ticketed) && ticketed.endsWith(pressedShut),
      "…and it opens that contract's ticket, not another's",
      `${ticketed} for ${pressedShut}`,
    );
    await press("/^Close [0-9]/");
    await page.waitForTimeout(700);
    const afterBoth = await page.evaluate(
      `(() => {
         const p = JSON.parse(localStorage.getItem("crypto_chart_practice")).positions;
         /* Labelled by the contract's coin rather than by its key: the key is
            an id now, and the row this walk pressed is identified on screen
            by its market. The two contracts here are on different coins. */
         return Object.keys(p).map((k) => p[k].coin + ":" + p[k].qty).sort().join(" ");
       })()`,
    );
    const moved = beforeBoth
      .split(" ")
      .filter((x, i) => x !== afterBoth.split(" ")[i]);
    check(
      moved.length === 1 && moved[0].startsWith(pressedShut),
      "…and closes a piece of that one alone",
      `${beforeBoth} became ${afterBoth}`,
    );
    await ctx.close();
  }

  /* §26 — a contract walking toward its liquidation says so, and the record
   * can be tidied without moving the money.
   *
   * **The warning.** The margin ratio was computed, printed among the facts
   * as a bare `ratio 90.83`, and left there. Nothing raised its voice, so the
   * first announcement that a contract was in trouble was the toast saying it
   * had gone. The band is on the row *outside* the accordion, for the same
   * reason the way out is: it cannot wait for you to unfold the right row.
   *
   * **The record.** The ledger is not a list of things that happened, it is
   * what the balance is recomputed from — so a deleted row would delete the
   * money with it. The row is folded into the summary instead, which is the
   * mechanism compaction already uses, and the assertion that matters is the
   * one this whole model exists for: the balance does not move by a cent. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(700);

    const press = (re) =>
      page.evaluate(
        `(() => {
           const b = Array.from(document.querySelectorAll("button")).find((n) =>
             ${re}.test(n.innerText.trim()));
           if (b) b.click();
           return Boolean(b);
         })()`,
      );
    const account = () =>
      page.evaluate(
        `(() => {
           const s = JSON.parse(localStorage.getItem("crypto_chart_practice"));
           return {
             balance: s.balance,
             realised: s.realised,
             fees: s.fees,
             rows: (s.ledger || []).filter((e) =>
               ["close", "stop", "take", "liquidation"].includes(e.kind)).length,
             folded: (s.summary && s.summary.count) || 0,
           };
         })()`,
      );

    /* Three contracts opened and closed, so there is a record to tidy. */
    for (let i = 0; i < 3; i += 1) {
      await press("/Open long on/");
      await page.waitForTimeout(450);
      /* The shares are inside the contract, which its row unfolds. */
      await page.evaluate(OPEN_CARD);
      await page.waitForTimeout(450);
      await press("/^All$/");
      await page.waitForTimeout(350);
      /* The close ticket's own button ("Close all BTC", or "Close 0.002
         BTC" for a share) — not the positions table's bare "Close all",
         which starts the same way and comes first on the page. */
      await press("/^Close (all [A-Z]|[0-9])/");
      await page.waitForTimeout(550);
    }
    await press("/^Closed/");
    await page.waitForTimeout(450);
    const before = await account();
    check(before.rows === 3, "three settled contracts are on the record", `${before.rows}`);
    /* **Each settled contract is its own card now.** The record was twenty
       text lines in a column, where nothing said where one entry ended and
       the next began except a 0.28rem gap — and the × of one sat a few pixels
       from the coin of the next. Asserted as the outcome: each entry is a
       bounded box, and it says what the contract *was* rather than only that
       one ended. */
    const cards = await page.evaluate(
      `(() => {
         const list = Array.from(document.querySelectorAll("[data-practice-record]"));
         if (!list.length) return null;
         const cs = getComputedStyle(list[0]);
         return {
           n: list.length,
           bounded: cs.borderTopWidth !== "0px" && parseFloat(cs.borderRadius) >= 8,
           says: /out at/i.test(list[0].innerText),
           drop: list.every((c) => c.querySelector("button")),
         };
       })()`,
    );
    check(cards && cards.n === 3, "…each one drawn as its own entry",
      cards ? String(cards.n) : "no cards");
    check(cards && cards.bounded, "…in a bordered box, not another line of text");
    check(cards && cards.says, "…saying what the contract was, not only that it ended");
    check(cards && cards.drop, "…and each keeps its own way off the record");
    /* **The process scorecard grades what the trader did, not what the
       market paid.** Three contracts closed by hand with no stop set are
       three C grades; the card says its letter and the title says why; the
       head counts the grades and, under five contracts, says what it is
       waiting for instead of printing a win rate on three draws. */
    const score = await page.evaluate(
      `(() => {
         const head = document.querySelector("[data-practice-scorecard]");
         const chips = Array.from(document.querySelectorAll("[data-practice-record] [data-practice-grade]"));
         return {
           head: head ? head.innerText : "",
           grades: chips.map((c) => c.getAttribute("data-practice-grade")).join(""),
           why: chips.length ? chips[0].getAttribute("title") || "" : "",
           waits: /wait for 5/i.test(document.body.innerText),
         };
       })()`,
    );
    check(/A 0 · B 0 · C 3/.test(score.head), "three hand-closed contracts with no stop are three C grades", score.head.slice(0, 80));
    check(score.grades === "CCC", "…and every card wears its letter", score.grades);
    check(/no stop/i.test(score.why), "…with the reason in the chip's title", score.why);
    check(score.waits && !/win rate/i.test(score.head), "…and the averages wait for five contracts, said out loud", score.head.slice(0, 120));

    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find((n) =>
           /Remove the .* from the record/.test(n.getAttribute("aria-label") || ""));
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(450);
    const dropped = await account();
    check(dropped.rows === 2, "…one can be taken off it", `${dropped.rows}`);
    check(
      dropped.balance === before.balance &&
        dropped.realised === before.realised &&
        dropped.fees === before.fees,
      "…without moving the balance, the realised total or the fees",
      `${before.balance}/${before.realised}/${before.fees} became ` +
        `${dropped.balance}/${dropped.realised}/${dropped.fees}`,
    );
    check(dropped.folded === 1, "…because it was folded into the summary, not deleted");

    check(await press("/Clear the record/"), "the whole record can be cleared at once");
    await page.waitForTimeout(450);
    const cleared = await account();
    check(cleared.rows === 0, "…leaving nothing listed", `${cleared.rows}`);
    check(
      cleared.balance === before.balance && cleared.realised === before.realised,
      "…and still not a cent moved",
      `${cleared.balance} against ${before.balance}`,
    );
    /* Cleared and never-traded used to read identically, which is the sort of
       thing that makes someone think their account was wiped. */
    const said = await page.evaluate(
      `(() => {
         const t = document.body.innerText;
         return { cleared: /cleared it/.test(t), never: /lands here/.test(t) };
       })()`,
    );
    check(said.cleared && !said.never, "…and the empty record says it was cleared, not empty");

    /* The warning. Put the contract under water deterministically rather than
       waiting for a price to move: an entry of **44,200** against the
       fixture's 43,480 mark puts a 50x long at a cover of **1.26**, squarely
       in the warn band.
       It was 44,050 until 16 Sep 2026, when the maintenance requirement
       stopped being read off the leverage and started being read off the size.
       This contract is 24,958 of notional — the first bracket, which keeps
       0.25% where the old rule gave a 50x contract 0.5% — so the same entry
       now covers 2.38 and is not in trouble at all. Measured against the model
       rather than adjusted until green; the claim being tested is unchanged.

       **And the wall is switched on for it** (18 Sep 2026): the size chip is
       a share of the per-contract wall, which is off by default now, so 25%
       became a quarter of the whole balance — a contract five times the
       size, in another bracket, that the entry below no longer puts in the
       warn band. The claim is about the warning, so the fixture keeps the
       contract it has always tested: 20%, the wall's old default. */
    await page.evaluate(
      `(() => {
         const s = JSON.parse(localStorage.getItem("crypto_chart_practice"));
         s.plan.marginSharePct = 20;
         localStorage.setItem("crypto_chart_practice", JSON.stringify(s));
       })()`,
    );
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.keyboard.press("f");
    await page.waitForTimeout(900);
    await press("/^New contract/");
    await page.waitForTimeout(350);
    await page.evaluate(
      `(() => {
         const r = document.querySelector('input[type="range"][aria-label="Leverage"]');
         const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
         set.call(r, "50");
         r.dispatchEvent(new Event("input", { bubbles: true }));
       })()`,
    );
    await page.waitForTimeout(300);
    await press("/Open long on/");
    await page.waitForTimeout(600);
    const calm = await page.evaluate(
      `/Close to liquidation|About to be liquidated/.test(document.body.innerText)`,
    );
    check(!calm, "a contract just opened is not warned about");

    await page.evaluate(
      `(() => {
         const s = JSON.parse(localStorage.getItem("crypto_chart_practice"));
         /* By coin, not by key: the store is keyed by contract id now that
            a market can carry several, and the newest BTC contract is the
            one this walk just opened. */
         const p = Object.values(s.positions || {})
           .filter((q) => q.coin === "BTC").pop();
         p.entry = 442000000;
         delete p.margin;
         p.peak = p.entry;
         p.trough = p.entry;
         localStorage.setItem("crypto_chart_practice", JSON.stringify(s));
       })()`,
    );
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(2500);
    await page.keyboard.press("f");
    await page.waitForTimeout(900);
    /* The warning is on the page's row; the cover and the shading are on the
       card, which that row opens. */
    const alarmed = await page.evaluate(
      `(() => {
         const t = document.body.innerText;
         return {
           row: /Close to liquidation|About to be liquidated/.test(t),
           where: /away/.test(t),
           told: /is close to liquidation|is about to be liquidated/.test(t),
           /* Named "cover" on the row now, counted in multiples of what the
              contract must keep — 1x is where it ends. It was a bare
              "ratio 1.30": unlabelled, and the other way up from the margin
              ratio a venue prints. (No backticks in a comment inside a
              template literal — one ends the literal.) */
           ratio: (t.match(/cover\\s*\\??\\s*([0-9.]+)x/i) || [])[1],
         };
       })()`,
    );
    check(alarmed.row, "a contract near its liquidation says so on the row itself");
    check(alarmed.where, "…and says where the level is and how far away");
    check(alarmed.told, "…and is announced, rather than waiting to be found");
    /* **And the announcement goes by itself** (27 Sep 2026, "bu likidasyon
       uyarıları belli zaman sonra kendiliğinden animasyonla silinsin"): ten
       seconds on screen, a bar along its foot counting them down, the clock
       stopped while the pointer rests on it — and then it leaves, rather than
       staying until somebody finds the ×. */
    const toastSel = "[data-toast-timed]";
    const timed = await page.evaluate(`(() => {
      const t = document.querySelector("${toastSel}");
      return t ? { state: t.getAttribute("data-toast-timed"), bar: Boolean(t.querySelector("[aria-hidden='true']")), says: t.innerText } : null;
    })()`);
    check(timed && timed.state === "running" && /liquidat/i.test(timed.says),
      "the warning is a timed notice, its clock running", JSON.stringify(timed));
    await page.hover(toastSel);
    await page.waitForTimeout(POSITION_TOAST_MS_TEST - 1500);
    const held = await page.evaluate(`(document.querySelector("${toastSel}") || {}).getAttribute ? document.querySelector("${toastSel}").getAttribute("data-toast-timed") : null`);
    check(held === "held", "…held while the pointer rests on it, past the time it would have gone", JSON.stringify(held));
    await page.mouse.move(640, 700);
    await page.waitForTimeout(POSITION_TOAST_MS_TEST + 800);
    const gone = await page.evaluate(`Boolean(document.querySelector("${toastSel}"))`);
    check(!gone, "…and once let go it leaves by itself, the rest of its time later", JSON.stringify(gone));
    await page.evaluate(OPEN_CARD);
    await page.waitForTimeout(500);
    const carded = await page.evaluate(
      `(() => {
         const t = document.body.innerText;
         return { ratio: (t.match(/cover\\s*\\??\\s*([0-9.]+)x/i) || [])[1] };
       })()`,
    );
    alarmed.ratio = carded.ratio;
    check(
      Number(alarmed.ratio) > 1 && Number(alarmed.ratio) <= 1.5,
      "…at the cover the model draws the line at, not a price distance",
      `${alarmed.ratio}`,
    );
    /* **And the row shades itself.** The order book's trick — a fill as wide as
       the figure behind it — answers the question a position list is scanned
       for: which of these is in trouble? Width is the inverse of the cover
       ratio, so a contract at its edge is a full row; beyond five times the
       requirement nothing is drawn at all, which is why a healthy account is
       not a wall of red. */
    /* **And the row itself is tinted.** The table is the list now, so the
       warning is on the row it is read from: the same band the model answers
       (`practiceMarginBand`), in the same red as the card's own fill. */
    const shaded = await page.evaluate(
      `(() => {
         const row = document.querySelector("[data-practice-position]");
         if (!row) return null;
         return {
           band: row.querySelector("[data-practice-row-alarm]")
             ? row.querySelector("[data-practice-row-alarm]").getAttribute("data-practice-row-alarm")
             : null,
           tint: getComputedStyle(row).backgroundColor,
         };
       })()`,
    );
    const clearTint = (c) => !c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
    check(
      shaded && (shaded.band === "warn" || shaded.band === "danger") && !clearTint(shaded.tint),
      "…and the row is tinted by the band the model puts it in",
      JSON.stringify(shaded),
    );
    await ctx.close();
  }

  /* §27 — cleared is not the same as never traded.
   *
   * A brand-new account with one contract running and nothing ever settled
   * was told "the record is empty because you cleared it". The test behind
   * that line asked whether the account had ever *spent* anything —
   * `realised !== 0 || fees > 0` — and opening a contract charges a fee, so
   * it was true from the very first order. The same expression had a second
   * defect: `inverse ? a : b || c ? d : e` is right-associative, so a
   * coin-settled account was handed a **boolean** where the text should be
   * and drew a title with an empty paragraph under it.
   *
   * Traded rather than seeded: one press of the order button is exactly the
   * state in question — a contract running, its fee paid, nothing settled —
   * and it goes through the same path a person does.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1600);
    await page.keyboard.press("f");
    await page.waitForTimeout(800);
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => /Open long on/i.test(n.innerText) && !n.disabled);
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(700);
    const seen = await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim().split(String.fromCharCode(10))[0] === "Closed");
         if (b) b.click();
         return Boolean(b);
       })()`,
    );
    await page.waitForTimeout(500);
    const said = await page.evaluate(
      `(() => {
         const s = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
         const t = document.body.innerText;
         return {
           held: Object.keys(s.positions || {}).length,
           /* The account has spent something — which is what the old test
              mistook for having closed something. */
           fees: s.fees || 0,
           title: /Nothing closed yet/.test(t),
           cleared: /cleared it/.test(t),
           never: /lands here/.test(t),
         };
       })()`,
    );
    check(
      seen && said.held === 1 && said.fees > 0,
      "an account with one contract running has paid a fee and closed nothing",
      JSON.stringify(said),
    );
    check(said.title, "…and its record is empty");
    check(
      said.never && !said.cleared,
      "…and says nothing has been closed yet, not that the record was cleared",
      JSON.stringify(said),
    );
    await ctx.close();
  }

  /* §28 — a real alarm, and a permission that is asked for in the app.
   *
   * The tab title was the whole of the announcement, and it has a hole in it
   * that no amount of flashing closes: a title says nothing to somebody who
   * is looking at another tab, which is the only situation where being told
   * is worth anything. So a Chrome notification and a sound — and the
   * permission behind the first is `optional_permissions`, granted on a press
   * inside the panel and **never at install**. `permissions` in the manifest
   * is still `[]`; `test-invariants.js` §1 holds that.
   *
   * The property asserted here is the one that would be a lie if it broke:
   * **the switch never claims a permission it does not have.** In this
   * harness `chrome.permissions` does not exist, which is exactly the shape
   * of a refusal — so pressing the switch must leave it off and store off.
   * A switch that flipped on regardless would tell somebody they would be
   * warned about a liquidation that nothing was going to warn them about.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1600);

    const alarmRow = (which) =>
      page.evaluate(
        "(() => { const n = document.querySelector('[data-alarm=" + JSON.stringify(which) + "]');" +
        "  if (!n) return null;" +
        "  return { text: n.innerText," +
        /* The ring that opens the explanation is a button in this row and is
           not a switch — scanning every button counted it as one. Excluded by
           what it is rather than by its glyph: `aria-pressed` is what makes a
           chip a chip. */
        "    chips: Array.from(n.querySelectorAll('button'))" +
        "      .filter((b) => b.getAttribute('aria-pressed') !== null)" +
        "      .map((b) => b.innerText.trim())," +
        "    on: Array.from(n.querySelectorAll('button'))" +
        "      .filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.innerText.trim())," +
        "    notify: localStorage.getItem('crypto_chart_alarm_notify')," +
        "    sound: localStorage.getItem('crypto_chart_alarm_sound') }; })()",
      );
    const pressAlarm = (label) =>
      page.evaluate(
        "(() => { const n = document.querySelector('[data-alarm]'); if (!n) return false;" +
        "  const b = Array.from(n.querySelectorAll('button'))" +
        "    .find((x) => x.innerText.trim() === " + JSON.stringify(label) + ");" +
        "  if (b) b.click(); return Boolean(b); })()",
      );

    await page.keyboard.press("a");
    await page.waitForTimeout(700);
    const targets = await alarmRow("targets");
    check(Boolean(targets), "the Targets panel offers a real alarm");
    check(
      targets && targets.chips.join(" ") === "Chrome notification Sound",
      "…as two switches, a notification and a sound",
      targets ? targets.chips.join(" ") : "none",
    );
    /* The row has to say what it cannot do. There is no service worker in
       this extension — it is a new-tab page — so nothing fires with no tab
       open, and a row that implied a watchman would be selling one.
       **Behind the ring since 17 Sep 2026**, with the events it announces left
       on the row itself: four lines of prose about a permission under a list
       of running contracts was the heaviest thing on that screen. The claim is
       one press away and the press is what this now makes — a claim you can
       reach is kept; a claim nobody can find is not. */
    check(
      targets && /liquidated|target is hit/i.test(targets.text),
      "…saying on the row what it will tell you about",
      targets ? targets.text.slice(0, 60) : "none",
    );
    await page.evaluate(
      "(() => { const n = document.querySelector('[data-alarm]');" +
      "  const b = n && Array.from(n.querySelectorAll('button'))" +
      "    .find((x) => x.innerText.trim() === '?');" +
      "  if (b) b.click(); })()",
    );
    await page.waitForTimeout(350);
    const told = await alarmRow("targets");
    check(
      told && /while a PriceTab tab is open/i.test(told.text)
        && /never at install/i.test(told.text),
      "…and saying behind the ring that it is asked for on the press, and works only while a tab is open",
      told ? told.text.slice(0, 80) : "none",
    );
    check(
      targets && targets.on.length === 0 && targets.notify === null,
      "nothing is armed until somebody arms it",
      targets ? `${targets.on.join(" ")} ${targets.notify}` : "none",
    );
    check(await pressAlarm("Chrome notification"), "the notification switch can be pressed");
    await page.waitForTimeout(500);
    const asked = await alarmRow("targets");
    check(
      asked && asked.on.length === 0 && asked.notify === "false",
      "…and where Chrome will not grant it, the switch stays off rather than claiming it",
      asked ? `${asked.on.join(" ")} ${asked.notify}` : "none",
    );
    check(await pressAlarm("Sound"), "the sound switch can be pressed");
    await page.waitForTimeout(500);
    const sounded = await alarmRow("targets");
    check(
      sounded && sounded.on.join(" ") === "Sound" && sounded.sound === "true",
      "…and the sound, which needs no permission, turns on and is remembered",
      sounded ? `${sounded.on.join(" ")} ${sounded.sound}` : "none",
    );

    /* The same row, the same permission, in the other panel that raises it:
       arming it from Targets arms Futures, and somebody who found it in one
       place should not have to find it again in the other. */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("f");
    await page.waitForTimeout(800);
    /* The alarm sits in the page's own settings sheet since 27 Sep 2026
       (it was on the Account tab, and under the contracts before that). */
    await page.click("[data-practice-settings-open]");
    await page.waitForTimeout(500);
    const futures = await alarmRow("futures");
    check(Boolean(futures), "the Futures panel offers the same alarm");
    check(
      futures && futures.on.join(" ") === "Sound",
      "…already carrying what was armed in Targets, because it is one setting",
      futures ? futures.on.join(" ") : "none",
    );
    check(
      futures && /liquidated/i.test(futures.text),
      "…and naming the four things a contract has done to it, not what you pressed",
    );
    await ctx.close();
  }

  /* §29 — the professional pass, and the costs that are a setting.
   *
   * Everything here was named in the audit as missing rather than wrong: the
   * ticket never said what the press cost or what was left to commit; the
   * position card never said what it was marked against or where it stops
   * costing money; the record was a list with no shape; and the three
   * constants that decide the whole exercise were constants.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1600);
    await page.keyboard.press("f");
    await page.waitForTimeout(800);
    const pressRe = (re) =>
      page.evaluate(
        "(() => { const b = Array.from(document.querySelectorAll('button'))" +
        "  .find((n) => new RegExp(" + JSON.stringify(re) + ").test(n.innerText.trim()) && !n.disabled);" +
        "  if (b) b.click(); return Boolean(b); })()",
      );

    /* **The ticket says what the press costs and what is left to spend.** */
    const strip = await page.evaluate(
      `(() => {
         const t = document.body.innerText;
         const free = document.querySelector("[data-practice-free]");
         return {
           fee: /fee to open/i.test(t),
           free: free ? free.innerText : null,
           held: Boolean(document.querySelector("[data-practice-held]")),
         };
       })()`,
    );
    /* **Opening a contract has to move a number at the top of the screen.**
       Reported as "shouldn't that come out of the balance?" — and it does:
       free falls by the margin and the fee the moment the contract opens. But
       the headline is *equity*, which is your money plus what the open
       contracts are doing, and that deliberately does not move when money is
       merely committed. Both are in the head now, the way a venue prints
       them. */
    const headBefore = await page.evaluate(
      `(() => {
         const n = document.querySelector("[data-practice-head-free]");
         return { free: n ? n.innerText : null };
       })()`,
    );
    check(
      headBefore.free === null,
      "with nothing committed, the head does not print a second copy of the same figure",
    );
    check(strip.fee, "the order ticket prices the order, in its own cell");
    check(
      strip.free && /[\d]/.test(strip.free) && /free/i.test(strip.free),
      "…and says what is still free to commit, beside the box that commits it",
      strip.free || "absent",
    );
    check(!strip.held, "with nothing held, no position line is drawn");

    await pressRe("^Open long on|^Open short on");
    await page.waitForTimeout(700);
    /* Opening one lands you on the list — see the `pTab: "open"` written after
       a successful order — so the ticket has to be asked for again. */
    await pressRe("^New contract");
    await page.waitForTimeout(500);
    const holding = await page.evaluate(
      `(() => {
         const n = document.querySelector("[data-practice-held]");
         return n ? n.innerText.replace(/\\s+/g, " ") : null;
       })()`,
    );
    check(
      holding && /contract on/i.test(holding) && /long/i.test(holding) && /short/i.test(holding),
      "…and once one is, the ticket says what this market is already carrying",
      holding || "absent",
    );
    /* **And says that there can be another.** This line used to name the
       opposite rule — "one contract per coin, the same side adds to this
       one" — which was the store's shape written up as a decision, and was
       reported three times as a control that would not work. The line has to
       track the model: a summary of what is running, and an invitation to run
       more. */
    check(
      holding && /balance carries/i.test(holding)
        && !/one contract per coin/i.test(holding),
      "…and states the rule that now applies, rather than the one that was lifted",
      holding ? holding.slice(0, 120) : "absent",
    );
    /* The money left the balance, and the head says so. Read against the
       account itself so the claim is about the arithmetic and not about a
       string: free is exactly the balance the model holds. */
    const headAfter = await page.evaluate(
      `(() => {
         const n = document.querySelector("[data-practice-head-free]");
         const s = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
         return {
           free: n ? n.innerText : null,
           balance: s.balance,
           margin: s.margin,
           fees: s.fees,
           start: s.startBalance,
         };
       })()`,
    );
    check(
      headAfter.free && /[0-9]/.test(headAfter.free) && /free/i.test(headAfter.free),
      "opening a contract moves a figure at the top of the panel, not only one a tab away",
      headAfter.free || "absent",
    );
    check(
      headAfter.balance === headAfter.start - headAfter.margin - headAfter.fees,
      "…and what left the balance is exactly the margin and the fee",
      `${headAfter.start} − ${headAfter.margin} − ${headAfter.fees} = ${headAfter.balance}`,
    );
    /* The foot is the panel's own ground, not the page's: it painted white
       over a card at rgb(245,245,245), so the order button read as something
       nested inside a pale box. A sticky strip is invisible until something
       passes under it. */
    const footGround = await page.evaluate(
      `(() => {
         const foot = document.querySelector("[data-practice-ticket-foot]");
         if (!foot) return null;
         let n = foot.parentElement;
         while (n && getComputedStyle(n).backgroundColor === "rgba(0, 0, 0, 0)") {
           n = n.parentElement;
         }
         return {
           foot: getComputedStyle(foot).backgroundColor,
           panel: n ? getComputedStyle(n).backgroundColor : null,
         };
       })()`,
    );
    check(
      footGround && footGround.foot === footGround.panel,
      "…and the pinned foot is the panel's own ground, not a box around the button",
      footGround ? `${footGround.foot} on ${footGround.panel}` : "no foot",
    );
    /* Six pixels under the tab row read as a fourth tab. */
    const air = await page.evaluate(
      `(() => {
         const side = Array.from(document.querySelectorAll("button"))
           .find((n) => n.innerText.trim() === "Long");
         /* The desk's own first tab: "Positions" now names the page's
            bottom panel as well, and that one is higher up the document. */
         const tab = Array.from(document.querySelectorAll("button"))
           .find((n) => /^New contract/.test(n.innerText.trim()));
         if (!side || !tab) return null;
         return Math.round(side.getBoundingClientRect().top - tab.getBoundingClientRect().bottom);
       })()`,
    );
    check(
      air != null && air >= 10,
      "the side buttons are not stuck to the tab row above them",
      `${air}px`,
    );

    /* **The position card says what it is marked against and where it stops
       costing money.** Break-even is bisected through the same close quote the
       button runs, so it cannot disagree with what closing actually pays. */
    /* The contract's card is reached by pressing its row in the page's
       table — the desk holds the ticket and the contract being read. */
    await page.evaluate(`(() => {
      const row = document.querySelector("[data-practice-position] button");
      if (row) row.click();
      return Boolean(row);
    })()`);
    await page.waitForTimeout(600);
    const detail = await page.evaluate(
      `(() => {
         const n = document.querySelector("[data-practice-detail]");
         return n ? n.innerText.replace(/\\s+/g, " ") : null;
       })()`,
    );
    check(
      detail && /mark/i.test(detail) && /break-even/i.test(detail),
      "the position card says what it is marked against, and where it breaks even",
      detail ? detail.slice(0, 80) : "absent",
    );

    /* **Costs are a setting, and they are locked while a contract runs.** */
    await pressRe("^Account$");
    await page.waitForTimeout(600);
    const costsLocked = await page.evaluate(
      `(() => {
         const rows = Array.from(document.querySelectorAll("[data-practice-cost]"));
         const fee = document.querySelector("[data-practice-cost='feePpm']");
         if (fee) fee.querySelector("button").click();
         return {
           rows: rows.map((n) => n.getAttribute("data-practice-cost")),
         };
       })()`,
    );
    await page.waitForTimeout(450);
    const lockedChips = await page.evaluate(
      `(() => {
         const fee = document.querySelector("[data-practice-cost='feePpm']");
         /* The **body's** chips, not the drawer's buttons: the head is a
            button too and it carries the current value, so a document-wide
            "%" filter counts the head as a fifth chip and finds it live. */
         const body = fee && fee.querySelector("[aria-hidden='false']");
         const chips = body
           ? Array.from(body.querySelectorAll("button")).filter((b) => /%$/.test(b.innerText.trim()))
           : [];
         const what = fee && fee.querySelector("[data-practice-cost-what]");
         return {
           chips: chips.length,
           live: chips.filter((b) => !b.disabled).length,
           what: what ? what.innerText : "",
         };
       })()`,
    );
    check(
      costsLocked.rows.join(" ") === "feePpm slipPpm funding",
      "the account carries the three costs that decide the exercise",
      costsLocked.rows.join(" "),
    );
    check(
      lockedChips.chips > 0 && lockedChips.live === 0,
      "…locked while a contract is running, like every other rule here",
      `${lockedChips.live} of ${lockedChips.chips} pressable`,
    );
    check(
      /what it is/i.test(lockedChips.what) && /what it is not/i.test(lockedChips.what),
      "…and each explains what it is and what it is not",
    );

    /* **Close everything, and the same chips answer.** The costs unlock when
       *no* contract is running, and this walk has opened more than one — so
       the page's own "Close all" (two presses, like every irreversible press
       here) rather than one contract's share. */
    for (let i = 0; i < 2; i += 1) {
      await page.evaluate(`(() => {
        const b = document.querySelector("[data-practice-close-all]");
        if (b) b.click();
        return Boolean(b);
      })()`);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(600);
    await pressRe("^Account$");
    await page.waitForTimeout(600);
    /* Open the drawer if it is shut — it may have been left open by the
       locked check above, and pressing the head then would shut it. */
    const changed = await page.evaluate(
      `(() => {
         const fee = document.querySelector("[data-practice-cost='feePpm']");
         if (!fee) return false;
         if (!fee.querySelector("[aria-hidden='false']")) fee.querySelector("button").click();
         return true;
       })()`,
    );
    await page.waitForTimeout(450);
    const pressedZero = await page.evaluate(
      `(() => {
         const fee = document.querySelector("[data-practice-cost='feePpm']");
         const zero = fee
           && Array.from(fee.querySelectorAll("button")).find((b) => b.innerText.trim() === "0.00%");
         if (zero) zero.click();
         return zero ? (zero.disabled ? "disabled" : "pressed") : "absent";
       })()`,
    );
    await page.waitForTimeout(500);
    const stored = await page.evaluate(
      `(() => {
         const s = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
         return s.costs ? s.costs.feePpm : null;
       })()`,
    );
    check(changed, "the cost rows are reachable once nothing is running");
    check(
      stored === 0,
      "…and a cost pressed there is written to the account, not to a preference",
      `${stored} (${pressedZero})`,
    );

    /* **Futures has settings of its own, and they are about the app rather
       than about the account** — so they are in Preferences and not on the
       Account tab. */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    /* The corner control, not the key: `s` reaches the shortcut handler only
       when nothing else has the keyboard, and after an overlay has just
       closed it does not. A navigation step that silently does nothing is
       worse than one that fails where it is. */
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => (n.getAttribute("aria-label") || "") === "Open settings");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(900);
    /* **Found the way somebody would find it**: the Preferences tab, then the
       search box. A shut group does not render its sections at all, and the
       search is what forces every group open — so this also proves the
       keywords reach it, which is the only way a setting inside a collapsed
       group is discoverable. */
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "PREFERENCES");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(500);
    await page.click("input[aria-label='Search settings']");
    await page.keyboard.type("futures");
    await page.waitForTimeout(700);
    const prefs = await page.evaluate(
      `(() => {
         /* Two sections since 27 Sep 2026 — the strip and the confirmation
            each have a row of their own — read together. */
         const ns = [...document.querySelectorAll("[data-practice-prefs]")];
         return ns.length ? ns.map((n) => n.innerText).join(" ").replace(/\\s+/g, " ") : null;
       })()`,
    );
    check(
      prefs && /strip/i.test(prefs) && /ask before/i.test(prefs),
      "futures carries its own preferences once it is switched on",
      prefs ? prefs.slice(0, 90) : "absent",
    );
    /* **And the six words, in the main menu, before anything is opened.**
       The panel explains leverage and margin where they are used, which is
       right and is also in the middle of a leveraged order ticket. Somebody
       who has never traded a derivative needs them before they arrive there,
       and the main menu is where a person goes to find out what a thing is. */
    const gloss = await page.evaluate(
      `(() => {
         const n = document.querySelector("[data-practice-glossary]");
         if (!n) return null;
         const dl = n.querySelector("dl");
         return {
           terms: dl ? Array.from(dl.querySelectorAll("dt")).map((d) => d.innerText.trim()) : [],
           /* Prose, not a ribbon: a definition squeezed into the control lane
              is the padding fault this panel was reported for. */
           wide: dl
             ? Array.from(dl.querySelectorAll("dd"))
                 .every((d) => d.getBoundingClientRect().width > 300)
             : false,
           says: n.innerText,
         };
       })()`,
    );
    check(
      gloss && gloss.terms.length >= 6,
      "…and the six words that decide what happens to the money",
      gloss ? gloss.terms.join(" · ") : "absent",
    );
    check(
      gloss && /leverage/i.test(gloss.terms.join(" "))
        && /margin/i.test(gloss.terms.join(" "))
        && /liquidation/i.test(gloss.terms.join(" ")),
      "…naming the three that decide it most",
    );
    check(gloss && gloss.wide, "…set as prose across the panel, not squeezed into the label column");
    await ctx.close();
  }

  /* §30 — futures is not switched on until somebody has read what it is.
   *
   * The Features row used to carry a line of prose about the terms, and the
   * terms themselves lived only inside the section — so the switch could be
   * turned on by somebody who had read nothing, and the row's own state said
   * "on" for a section that opens onto a wall of text and nothing else.
   *
   * Now the switch does not move on the first press: the terms open under it
   * and the switch follows the answer. Asked again on every attempt until it
   * is accepted, and never again once it is — it is a fact about what the
   * thing is, and it does not change while the switch is down.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    /* A profile that has never been asked: no consent key at all. */
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1");');
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1600);
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => (n.getAttribute("aria-label") || "") === "Open settings");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(800);
    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => n.innerText.trim() === "PREFERENCES");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(500);
    await page.click("input[aria-label='Search settings']");
    await page.keyboard.type("futures");
    await page.waitForTimeout(700);

    const askState = () =>
      page.evaluate(
        `(() => {
           const terms = document.querySelector("[data-practice-terms]");
           const sw = Array.from(document.querySelectorAll("button")).find(
             (n) => (n.getAttribute("aria-label") || "").indexOf("Turn Derivatives market") === 0);
           return {
             terms: Boolean(terms),
             says: terms ? terms.innerText : "",
             enabled: localStorage.getItem("crypto_chart_practice_enabled"),
             consent: localStorage.getItem("crypto_chart_practice_consent"),
             sw: Boolean(sw),
           };
         })()`,
      );
    const flip = () =>
      page.evaluate(
        `(() => {
           const b = Array.from(document.querySelectorAll("button")).find(
             (n) => (n.getAttribute("aria-label") || "").indexOf("Turn Derivatives market") === 0);
           if (b) b.click();
           return Boolean(b);
         })()`,
      );

    const before = await askState();
    check(before.sw && !before.terms, "the futures switch is there, and asks nothing until it is pressed");
    check(await flip(), "the futures switch can be pressed");
    await page.waitForTimeout(500);
    const asked = await askState();
    check(asked.terms, "…and the first press opens what it is, rather than switching it on");
    check(
      /simulation/i.test(asked.says) && /imaginary/i.test(asked.says)
        && /no exchange|not financial advice|financial advice/i.test(asked.says),
      "…saying plainly that it is a simulation with imaginary money and no venue behind it",
      asked.says.slice(0, 70),
    );
    check(
      asked.consent === null && asked.enabled !== "true",
      "…and nothing is granted or switched on while the question is open",
      `${asked.enabled} / ${asked.consent}`,
    );

    await page.evaluate(
      `(() => {
         const b = Array.from(document.querySelectorAll("button")).find(
           (n) => /Not now/i.test(n.innerText));
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(450);
    const declined = await askState();
    check(
      !declined.terms && declined.consent === null && declined.enabled !== "true",
      "declining leaves it off, and remembers nothing",
      `${declined.enabled} / ${declined.consent}`,
    );

    await flip();
    await page.waitForTimeout(450);
    check((await askState()).terms, "…and it is asked again the next time it is pressed");
    await page.evaluate(
      `(() => {
         const b = document.querySelector("[data-practice-accept]");
         if (b) b.click();
       })()`,
    );
    await page.waitForTimeout(600);
    const accepted = await askState();
    check(
      !accepted.terms && accepted.consent === "true" && accepted.enabled === "true",
      "accepting turns it on and records that it was read",
      `${accepted.enabled} / ${accepted.consent}`,
    );

    await flip();
    await page.waitForTimeout(450);
    await flip();
    await page.waitForTimeout(450);
    const again = await askState();
    check(
      !again.terms && again.enabled === "true",
      "…and switching it off and on again never asks a second time",
      `${again.enabled} / terms=${again.terms}`,
    );
    await ctx.close();
  }

  /* §31 — the derivatives screen is wider than a list, and an open contract
   * fits inside it.
   *
   * Reported as *"open position da scroll bar olmadan her şeyi sığdıralım ve
   * genişletelim"*. Measured at 1280x900 before the change: the panel body was
   * 640px against 654px of content with **three** contracts and one of them
   * open — a scrollbar on a screen whose whole argument is that every contract
   * has a row you can reach. Two things pay for it and both are asserted here,
   * because either alone regresses quietly: the card is wider only on this
   * screen (targets and calls are one-line rows and 36rem is right for them),
   * and inside the open card the settlement block and the readings are a pair
   * of columns rather than a stack.
   *
   * The third check is the other half of the width: a shut row now carries
   * where you got in and where the contract ends, so three contracts can be
   * compared without unfolding three rows. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: BIG_PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "112480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    const blew = [];
    page.on("pageerror", (e) => blew.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1600);

    /* Built by concatenation so the regular expression is not resolved by the
       template literal before the page ever sees it. */
    const press = (re) =>
      page.evaluate(
        "(() => { const b = Array.from(document.querySelectorAll('button'))" +
        "  .find((n) => new RegExp(" + JSON.stringify(re) + ").test(n.innerText.trim()) && !n.disabled);" +
        "  if (b) b.click(); return Boolean(b); })()",
      );

    /* Targets first, so the widths are compared rather than asserted against a
       number that a spacing change would move. */
    await page.keyboard.press("a");
    await page.waitForTimeout(700);
    const narrow = await page.evaluate(
      "(() => { const n = document.querySelector('[data-alerts-card]');" +
      "  return n ? Math.round(n.getBoundingClientRect().width) : null; })()",
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("f");
    await page.waitForTimeout(800);
    for (let i = 0; i < 3; i += 1) {
      await press("^New contract");
      await page.waitForTimeout(180);
      await press(i === 2 ? "^Short$" : "^Long$");
      await page.waitForTimeout(140);
      await press(i === 2 ? "^Open short on" : "^Open long on");
      await page.waitForTimeout(360);
    }
    await press("^Positions");
    await page.waitForTimeout(700);
    const fit = await page.evaluate(`(() => {
      const heads = Array.from(document.querySelectorAll("button[aria-expanded]"))
        .filter((b) => /#[0-9]/.test(b.innerText));
      const open = heads.find((b) => b.getAttribute("aria-expanded") === "true");
      const body = document.querySelector("[data-practice-detail]");
      const study = body ? body.parentElement : null;
      const scrolling = [];
      /* **Only a box that can scroll can draw a scrollbar.** Changed 18 Sep
         2026, deliberately: the Pro page's chart places its date axis just
         under its plot box with overflow visible — 19px of content outside a
         box that clips nothing and scrolls nothing — and counting it said
         "scrollbar" about a screen that had none. The claim is about
         scrollbars, so the probe asks the question a scrollbar answers. */
      /* **The page's own columns are its scrollers** since 19 Sep 2026: the
         screen is the window and each column takes the height it is given,
         so a column scrolling is the design rather than a defect. What may
         not scroll is anything *inside* the desk — a scrollbar in the middle
         of the ticket — which is what this probe was written for. */
      const pageBox = document.querySelector("[data-practice-page]");
      const columns = document.querySelector("[data-practice-columns]");
      const desk = document.querySelector("[data-practice-desk]");
      document.querySelectorAll("div").forEach((n) => {
        const oy = getComputedStyle(n).overflowY;
        if (n === pageBox) return;
        if (columns && n.parentElement === columns) return;
        if ((oy === "auto" || oy === "scroll") &&
            n.scrollHeight > n.clientHeight + 2 && n.clientHeight > 200) {
          scrolling.push(n.clientHeight + "/" + n.scrollHeight);
        }
      });
      const card = open ? open.closest("div").parentElement : null;
      return {
        rows: heads.length,
        wide: card ? Math.round(card.getBoundingClientRect().width) : null,
        /* Two columns means the readings start to the right of the settlement
           block's left edge and share its line — one number each, compared,
           rather than a hard-coded pixel. */
        columns: study ? getComputedStyle(study).gridTemplateColumns.split(" ").length : 0,
        /* The settlement column and the readings on one ground: the pair
           carries the fill and the settlement column carries none of its
           own. And its rows read label over figure, like every reading
           beside them — the figure starts below where the label ends. */
        ground: study
          ? {
              study: getComputedStyle(study).backgroundColor,
              settle: study.children.length > 1
                ? getComputedStyle(study.children[0]).backgroundColor
                : null,
            }
          : null,
        stacked: (() => {
          const row = study && study.children.length > 1 ? study.children[0].children[0] : null;
          if (!row || row.children.length < 2) return null;
          const key = row.children[0].getBoundingClientRect();
          const value = row.children[1].getBoundingClientRect();
          return { keyBottom: Math.round(key.bottom), valueTop: Math.round(value.top) };
        })(),
        scrolling,
        /* The desk's column is what the window bounds; the ticket inside it
           may be taller and scroll. */
        deskBottom: desk && desk.parentElement
          ? Math.round(desk.parentElement.getBoundingClientRect().bottom)
          : null,
        /* Every shut row's own figures, so they can be read without opening
           anything: the table's cells, in the order its head names them. */
        shutText: Array.from(document.querySelectorAll("[data-practice-position]"))
          .filter((r) => {
            const b = r.querySelector("button[aria-expanded]");
            return b && b.getAttribute("aria-expanded") === "false";
          })
          .map((r) => Array.from(r.children).map((c) => c.innerText.trim()).join(" | ")),
      };
    })()`);
    const widePanel = await page.evaluate(
      "(() => { const n = document.querySelector('[data-alerts-card]');" +
      "  return n ? Math.round(n.getBoundingClientRect().width) : null; })()",
    );
    check(fit.rows === 3, "three contracts are running", `${fit.rows}`);
    check(
      narrow != null && widePanel != null && widePanel > narrow,
      "the derivatives screen is wider than the panel that holds one-line rows",
      `${widePanel}px against ${narrow}px`,
    );
    check(
      fit.columns === 2,
      "…and an open contract reads in two columns rather than one stack",
      `${fit.columns} column(s)`,
    );
    const clear = (c) => !c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
    check(
      fit.ground && !clear(fit.ground.study) && clear(fit.ground.settle),
      "…on one ground: the pair is filled and the settlement column is not a box of its own",
      JSON.stringify(fit.ground),
    );
    check(
      fit.stacked && fit.stacked.valueTop >= fit.stacked.keyBottom - 1,
      "…and the settlement reads label over figure, the same as the readings beside it",
      JSON.stringify(fit.stacked),
    );
    check(
      fit.scrolling.length === 0,
      "…so three contracts with one open need no scrollbar",
      fit.scrolling.join(" "),
    );
    check(
      fit.deskBottom != null && fit.deskBottom <= 900,
      "…and the whole desk is above the fold, whatever the reading column does",
      String(fit.deskBottom),
    );
    check(
      /* Contract · size · entry · mark · liq · margin · P/L · close — the
         two that matter here are a real entry and a real liquidation. */
      fit.shutText.length > 0 && fit.shutText.every((t) => {
        const cells = t.split(" | ");
        return cells.length >= 7 && /[0-9]/.test(cells[2]) && /[0-9]|1x/.test(cells[4]);
      }),
      "a shut row says where you got in and where the contract ends",
      fit.shutText[0] || "no shut row",
    );
    check(blew.length === 0, "nothing threw", blew.join(" | "));
    await ctx.close();
  }

  /* §32 — "what happened here?" answers about the coin that moved, and the
   * panel's own reading is wired to the chart.
   *
   * Measured 10 Sep 2026, fresh install: Blockchair returns **nothing** for
   * any window younger than a few months, so a mark on a 1H, 1D, 1W or 1M
   * chart was answered by Hacker News alone — four to six stories, of which
   * one named Bitcoin and none named XRP or SOL. The card said "what was
   * being written at the time" and showed four headlines about something
   * else. Three things fix it and all three are asserted here: the feed
   * already in memory answers first (no request), what names the coin is
   * separated from what does not, and the two readings the series can give —
   * how rare the step was, and what followed it — are on the card.
   *
   * The fixture is deliberately the hard case: the archive answers *empty*
   * for the window, and the only thing that names BTC is in the feed. */
  {
    const NOW_S = Math.floor(Date.now() / 1000);
    const spiky = Array.from({ length: 200 }, (_, i) => {
      let p = 43000 + Math.sin(i / 9) * 120 + i * 3;
      if (i === 60) p -= 2600;
      if (i === 150) p += 3100;
      return { price: p.toFixed(2), time: NOW_S - (200 - i) * 300 };
    });
    const hrsAgo = (h) => Date.now() - h * 3600e3;
    const feed = [
      { source: "CNBC", title: "BTC drops below support after an exchange halt",
        summary: "Withdrawals were paused for two hours.", url: "https://example.com/2",
        time: hrsAgo(11), tags: "" },
      /* Inside the same window as the CNBC story on purpose: what is being
         tested is the split between "about this coin" and "not", and a story
         that falls outside the window tests the window instead. */
      { source: "Hacker News", title: "Solana validator client rewritten in Rust",
        summary: "A second implementation reaches mainnet.", url: "https://example.com/3",
        time: hrsAgo(10.5), tags: "" },
    ];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: spiky } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      /* Both archives answer, and both answer with nothing — the measured
         case, not a contrived one. */
      if (u.includes("blockchair.com/news")) return r.fulfill(json({ data: [] }));
      if (u.includes("hn.algolia.com")) return r.fulfill(json({ hits: [] }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_move_news", "true");' +
        'localStorage.removeItem("crypto_chart_move_news_cache");' +
        'localStorage.setItem("crypto_chart_news_ticker_enabled", "true");' +
        'localStorage.setItem("crypto_chart_news_cache", ' +
        JSON.stringify(JSON.stringify({ t: Date.now(), items: feed })) + ");",
    );
    const page = await ctx.newPage();
    const blew = [];
    page.on("pageerror", (e) => blew.push(e.message));
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
    check(marks.length > 0, "the spikes still get their marks", `${marks.length}`);
    if (marks.length) {
      await page.mouse.click(marks[0].x, marks[0].y);
      await page.waitForTimeout(1200);
      const card = await page.evaluate(`(() => {
        const note = [...document.querySelectorAll("div")].find(
          (d) => d.children.length === 0 && /published around this move/i.test(d.textContent || ""));
        return note ? note.parentElement.innerText : null;
      })()`);
      check(card !== null, "the card opens with both archives empty", card || "no card");
      /* The feed answered where the archive could not — and the feed is not
         asked for over the network, it is already in the tab. */
      check(
        card && /BTC drops below support/.test(card),
        "…filled from the feed already in memory when the archive has nothing",
        card ? card.slice(0, 160) : "none",
      );
      check(
        card && /ELSEWHERE THAT DAY/i.test(card) && /Solana validator/.test(card),
        "…with what is not about this coin under its own heading",
        card ? card.slice(0, 220) : "none",
      );
      /* The order is the claim: the coin's own story is above the heading
         that says the rest are about something else. */
      check(
        card &&
          card.indexOf("BTC drops below support") < card.indexOf("Solana validator"),
        "…and the coin's own story above it, not below",
      );
      check(
        card && /Bigger than \d+% of steps on this chart/.test(card),
        "the card says how rare the step was, in this series' own terms",
        card ? card.slice(0, 200) : "none",
      );
      check(
        card && /over the next |Little changed over the next /.test(card),
        "…and what the price did next, which costs no request",
        card ? card.slice(0, 200) : "none",
      );
      check(
        card && !/because/i.test(card),
        "…while still never saying why",
        card ? card.slice(0, 200) : "none",
      );
    }

    /* And the two features that measure the same thing now mention each
       other: the panel's own unusual section can put the marks on the chart.
       It was silent for a different reason until today — the series was
       passed to it under a state field that does not exist, so it returned
       null on every render since it was written. */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.keyboard.press("n");
    await page.waitForTimeout(1000);
    const panel = await page.evaluate(`(() => {
      const t = document.body.innerText;
      return {
        unusual: /moved unusually for itself/i.test(t),
        go: /Mark it on the chart/i.test(t),
        /* Every source that was asked has a chip, including the ones that
           answered with nothing on this beat. */
        chips: [...document.querySelectorAll("button[aria-pressed]")]
          .map((b) => b.innerText.split(String.fromCharCode(10)).join(" ")),
      };
    })()`);
    check(
      panel.unusual,
      "the panel's own unusual section is drawn at all",
      JSON.stringify(panel).slice(0, 160),
    );
    check(
      panel.chips.some((c) => /MarketWatch/.test(c)),
      "a source that answered with nothing on the beat still has a chip",
      panel.chips.join(" | "),
    );
    check(
      panel.chips.some((c) => /none/.test(c)),
      "…and says so on it, rather than an age it does not have",
      panel.chips.join(" | "),
    );
    /* The search reads what the row shows: a word that exists only in a
       summary used to match nothing. */
    await page.evaluate(
      "(() => { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
      "  const e = [...document.querySelectorAll('input')].find((n) => (n.getAttribute('placeholder') || '').length);" +
      "  if (!e) return false; set.call(e, 'withdrawals');" +
      "  e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()",
    );
    await page.waitForTimeout(500);
    const searched = await page.evaluate(
      "(() => ({ hit: [...document.querySelectorAll('a')].some((a) => /exchange halt/i.test(a.innerText))," +
      "  empty: /Nothing matching/i.test(document.body.innerText) }))()",
    );
    check(
      searched.hit && !searched.empty,
      "searching a word that appears only in a summary finds the row",
      JSON.stringify(searched),
    );
    await page.evaluate(
      "(() => { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
      "  const e = [...document.querySelectorAll('input')].find((n) => (n.getAttribute('placeholder') || '').length);" +
      "  if (e) { set.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); } })()",
    );
    await page.waitForTimeout(300);
    if (panel.go) {
      await page.evaluate(
        "(() => { const b = [...document.querySelectorAll('button')]" +
        "  .find((n) => /Mark it on the chart/i.test(n.innerText)); if (b) b.click(); })()",
      );
      await page.waitForTimeout(900);
      const handed = await page.evaluate(
        "(() => ({ marks: document.querySelectorAll('.pt-moves path').length," +
        "  setting: localStorage.getItem('crypto_chart_move_news')," +
        "  panel: /Search headlines/i.test(document.body.innerText) }))()",
      );
      check(
        !handed.panel && handed.marks > 0 && handed.setting === "true",
        "…and its button closes the panel onto a chart that is actually marked",
        JSON.stringify(handed),
      );
    }
    check(blew.length === 0, "nothing threw", blew.join(" | "));
    await ctx.close();
  }

  /* §33 — the toolbar popup.
   *
   * The most persistent surface this extension owns: the icon is on every
   * page, and until now its popup was four lines that opened the store
   * listing, under the tooltip "PriceTab - Rate on Chrome Web Store". It shows
   * prices now, and the two properties worth holding are the ones that make
   * that affordable.
   *
   * **It paints from the cache, before anything is asked for.** Every tab that
   * has been open has already swept and persisted `crypto_chart_ticker_cache`
   * to the same origin, so opening the popup is a read. The first check here
   * is that no request is made at all when the cache is inside its minute.
   *
   * **A price out of a cache has an age, so the age is on screen.** The one
   * failure mode of a surface like this is printing a two-hour-old figure as
   * though it were live.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 600 } });
    const asked = [];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      asked.push(u);
      if (u.includes("coinlore") && u.includes("tickers")) {
        return r.fulfill(json({ data: [
          { symbol: "BTC", price_usd: "70000", percent_change_24h: "3.5", market_cap_usd: "1", volume24: "1" },
          { symbol: "ETH", price_usd: "3500", percent_change_24h: "-2.25", market_cap_usd: "1", volume24: "1" },
        ], info: { coins_num: 100 } }));
      }
      // The sweep prices in USD and converts; without a rate there is nothing
      // to write, which is a real behaviour and not one this section is about
      if (u.includes("exchange-rates")) {
        return r.fulfill(json({ data: { rates: { EUR: "0.9" } } }));
      }
      return r.fulfill(json({ data: {} }));
    });
    /* A cache written twelve minutes ago: old enough that the sweep guard has
     * expired (so the "no request" claim is about the *press*, not about a
     * fresh cache), and old enough for the age line to have something to say. */
    const written = Date.now() - 12 * 60000;
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_coin_options", JSON.stringify(["BTC", "ETH"]));
      localStorage.setItem("crypto_chart_currency", "EUR");
      localStorage.setItem("crypto_chart_theme", "light");
      localStorage.setItem("crypto_chart_ticker_cache", JSON.stringify({
        entries: [
          ["BTC-EUR", { price: 61234.5, change: 2.5, up: true, timestamp: ${written} }],
          ["ETH-EUR", { price: 2345.67, change: -1.25, up: false, timestamp: ${written} }]
        ],
        // A sweep stamped now: inside the minute, so opening the popup has
        // nothing to ask for. The entries are older on purpose — see above.
        sweeps: [["EUR", ${Date.now()}]],
      }));
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(POPUP, { waitUntil: "load" });
    await page.waitForTimeout(1200);

    const shown = await page.evaluate(`(() => {
      const rows = [...document.querySelectorAll(".row")].map((r) => ({
        coin: r.querySelector(".coin").textContent,
        price: r.querySelector(".price").textContent,
        change: r.querySelector(".change").textContent,
        tone: r.querySelector(".change").className.replace("change ", ""),
      }));
      return {
        rows,
        foot: (document.querySelector(".foot") || {}).textContent || "",
        theme: document.documentElement.getAttribute("data-theme"),
        buttons: [...document.querySelectorAll("button")].map((b) => b.type),
        // Not one node of the chart page: this is a popup, not the app
        // split, not a regex: a backslash in a page.evaluate template is
        // eaten by the template literal before the page ever sees it
        scripts: [...document.querySelectorAll("script")].map((s) =>
          s.src.split("/").pop()),
      };
    })()`);

    check(shown.rows.length === 2, "the popup lists the coins you follow",
      JSON.stringify(shown.rows));
    /* The currency and the number format are the ones chosen in Settings —
     * a popup that printed dollars at somebody who reads euros would be a
     * second app rather than the same one. */
    check(shown.rows[0] && shown.rows[0].price === "€61,234.50",
      "…in the currency and format the app is set to",
      shown.rows[0] ? shown.rows[0].price : "none");
    check(shown.rows[0] && shown.rows[0].change === "+2.50%" && shown.rows[0].tone === "up",
      "…with the day's move, coloured by direction",
      JSON.stringify(shown.rows[0]));
    check(shown.rows[1] && shown.rows[1].tone === "down",
      "…and a fall reads as a fall", JSON.stringify(shown.rows[1]));

    check(/12 min ago/.test(shown.foot),
      "the foot says how old the oldest price on screen is", shown.foot);
    check(shown.theme === "light",
      "an explicit theme choice reaches the popup too", String(shown.theme));
    check(shown.buttons.length > 0 && shown.buttons.every((t) => t === "button"),
      "…and every button carries an explicit type, like everywhere else here",
      JSON.stringify(shown.buttons));
    /* Five scripts and no more: React, styled-components and d3 have no
     * business in a page that prints numbers it already has. */
    check(!shown.scripts.some((s) => /react|styled|d3/.test(s)),
      "the popup does not ship the whole app to print four numbers",
      JSON.stringify(shown.scripts));

    check(asked.length === 0,
      "opening it asks the network for nothing at all", JSON.stringify(asked));

    /* …and the button is the way to ask, which is the whole bargain. One
     * sweep, not one request per coin — the second request here is the
     * exchange rate, which a non-USD currency needs whoever asks for it. */
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.waitForTimeout(1500);
    const after = await page.evaluate(`(() => ({
      foot: document.querySelector(".foot").textContent,
      first: document.querySelector(".row .price").textContent,
    }))()`);
    const sweeps = asked.filter((u) => u.includes("tickers"));
    check(sweeps.length === 1,
      "pressing Refresh is one sweep, not one request per coin",
      JSON.stringify(asked));
    check(/just now/.test(after.foot),
      "…and the age line says so afterwards", after.foot);
    check(after.first === "€63,000.00",
      "…and the list is redrawn from what came back, converted like the page does",
      after.first);

    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  /* §34 — everything this browser knows, in one file.
   *
   * Sixty-four `crypto_chart_*` keys and, before this, one export path: the
   * portfolio's. A new machine or a cleared profile took the calls record, the
   * targets, the practice account and every preference with it.
   *
   * The two properties worth a browser rather than a unit test are the ones a
   * person meets: **reading a file writes nothing** — the panel says what is
   * in it and waits — and **the write can be undone**, including the keys it
   * added, which is the half that is easy to get wrong.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      return r.fulfill(json({ data: {} }));
    });
    /* Seeded only when absent: `addInitScript` runs on every navigation, and a
     * restore is asserted *across a reload* — the plain form would rewrite the
     * settings it is meant to have replaced. */
    await ctx.addInitScript(`
      if (!localStorage.getItem("crypto_chart_onboarding_seen")) {
        localStorage.setItem("crypto_chart_onboarding_seen", "1");
        localStorage.setItem("crypto_chart_currency", "USD");
        localStorage.setItem("crypto_chart_price_cache", "{}");
      }
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });

    const openBackup = async () => {
      await page.keyboard.press("s");
      await page.waitForTimeout(400);
      // Through the search box, at the head of the menu, which also asserts
      // the section's keywords
      await page.getByLabel("Search settings").fill("backup");
      await page.waitForTimeout(400);
    };

    await openBackup();
    const found = await page.evaluate(
      `document.body.innerText.includes("Save a backup")`);
    check(found, "the backup section is reachable by searching for it", String(found));

    /* A file the panel has read but not applied. The cache key in it must be
     * refused whatever the file says — a backup is what a person chose, and a
     * price cache is neither. */
    const file = {
      app: "pricetab",
      at: Date.parse("2026-01-02T00:00:00Z"),
      keys: {
        crypto_chart_currency: "JPY",
        crypto_chart_refresh_interval: "60000",
        crypto_chart_price_cache: "SHOULD NOT LAND",
      },
    };
    await page.locator("input[type=file]").last().setInputFiles({
      name: "pricetab-settings.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(file)),
    });
    await page.waitForTimeout(600);

    const read = await page.evaluate(`(() => ({
      says: document.body.innerText.includes("That file holds 2 settings"),
      offers: document.body.innerText.includes("Replace my settings"),
      currency: localStorage.getItem("crypto_chart_currency"),
      interval: localStorage.getItem("crypto_chart_refresh_interval"),
    }))()`);
    check(read.says,
      "reading a file says what is in it — and counts only the keys it will write",
      JSON.stringify(read));
    check(read.currency === "USD" && read.interval === null,
      "…and writes nothing at all until the second press", JSON.stringify(read));

    await page.getByRole("button", { name: "Replace my settings" }).click();
    // The page reloads: almost every setting here is read once, at mount
    await page.waitForTimeout(2500);
    await page.waitForSelector("svg path", { timeout: 20000 });
    const after = await page.evaluate(`(() => ({
      currency: localStorage.getItem("crypto_chart_currency"),
      interval: localStorage.getItem("crypto_chart_refresh_interval"),
      cache: localStorage.getItem("crypto_chart_price_cache"),
      undo: localStorage.getItem("crypto_chart_backup_undo") !== null,
    }))()`);
    check(after.currency === "JPY" && after.interval === "60000",
      "the restore replaces what the file holds and adds what it did not have",
      JSON.stringify(after));
    check(after.cache !== "SHOULD NOT LAND",
      "…and a cache key inside a backup file is still refused", String(after.cache));
    check(after.undo, "…leaving a way back behind it", String(after.undo));

    await openBackup();
    await page.getByRole("button", { name: /Undo the last restore/ }).click();
    await page.waitForTimeout(2500);
    await page.waitForSelector("svg path", { timeout: 20000 });
    const undone = await page.evaluate(`(() => ({
      currency: localStorage.getItem("crypto_chart_currency"),
      interval: localStorage.getItem("crypto_chart_refresh_interval"),
      undo: localStorage.getItem("crypto_chart_backup_undo"),
    }))()`);
    check(undone.currency === "USD",
      "undo puts back what the restore overwrote", JSON.stringify(undone));
    /* …and removes what it added. A key that was not there before and is
     * there afterwards is a setting nobody ever chose. */
    check(undone.interval === null,
      "…and removes what it added", String(undone.interval));
    check(undone.undo === null, "…and the offer is spent", String(undone.undo));

    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  /* §35 — the logarithmic price axis, and the lattice that vetoes it.
   *
   * It exists because of a measurement: on Coinbase's own BTC `period=all`
   * series the first half of the history takes **15.8% of a linear y-range**
   * — 63 px of a 400 px chart — against 72.2% on a log one. Six years in a
   * strip at the foot of the chart is not a scale choice.
   *
   * Two claims here, and the second is the one that would break quietly. The
   * axis really changes the drawing; and it **stands down while the calls
   * board is up**, because the board's squares are a uniform step in price and
   * a log axis has no uniform step — a logarithmic board would be cells of a
   * dozen different heights and a call whose box changed shape depending on
   * where it sat.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const T = Math.floor(Date.now() / 1000);
    /* A series that spans three orders of magnitude, which is what a long
     * range actually looks like and what a linear axis cannot show. */
    const PRICES = Array.from({ length: 60 }, (_, i) => ({
      price: (10 * Math.pow(10, (i / 59) * 2)).toFixed(6),
      time: T - (60 - i) * 86400,
    }));
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "1000.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_log_scale", "true");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(2500);

    /* Where the *middle point in time* sits on the chart. The series is a
     * geometric ramp, so its middle price is the geometric middle of the
     * range: halfway up a log plot, and down near the floor on a linear one.
     * Read off the drawn path rather than off any state — the path is the
     * claim. */
    const midY = () => page.evaluate(`(() => {
      /* The price line is the longest path on the page — an icon is a handful
       * of commands and the series is sixty points. Picking by selector order
       * found a 14px glyph. */
      const paths = [...document.querySelectorAll("svg path")]
        .filter((p) => (p.getAttribute("d") || "").startsWith("M"))
        .sort((a, b) => b.getAttribute("d").length - a.getAttribute("d").length);
      const path = paths[0];
      if (!path) return null;
      /* Only the plain "x,y" pairs. The longest path is the filled area,
       * whose last commands close the shape — one unparseable pair makes the
       * min NaN and the whole reading comes back as null, which is how this
       * check first failed. (No backticks in here: this comment lives inside a
       * template literal and one would end it.) */
      const pts = path
        .getAttribute("d")
        .slice(1)
        .split("L")
        .map((p) => p.split(",").map(Number))
        .filter((p) => p.length === 2 && isFinite(p[0]) && isFinite(p[1]));
      if (pts.length < 5) return null;
      const box = path.getBoundingClientRect();
      const mid = pts[Math.floor(pts.length / 2)];
      const ys = pts.map((p) => p[1]);
      const lo = Math.min(...ys);
      const hi = Math.max(...ys);
      if (!(hi > lo)) return null;
      // 0 at the bottom of the drawn range, 1 at the top
      return { frac: (hi - mid[1]) / (hi - lo), height: Math.round(box.height) };
    })()`);

    const onLog = await midY();
    check(onLog && Math.abs(onLog.frac - 0.5) < 0.08,
      "with the log axis on, the middle of a geometric series is the middle of the chart",
      JSON.stringify(onLog));

    // "Y" is the key, and the list under "?" advertises it
    await page.keyboard.press("y");
    await page.waitForTimeout(1200);
    const offLog = await midY();
    check(offLog && offLog.frac < 0.25,
      "…and pressing Y puts it back near the floor, where a plain axis puts it",
      JSON.stringify(offLog));
    const stored = await page.evaluate(
      `localStorage.getItem("crypto_chart_log_scale")`);
    check(stored === "false", "…and the choice is remembered", String(stored));

    /* **The lattice vetoes it.** With calls on, the board's price step is the
     * scale, so the axis goes back to linear whatever the setting says — and
     * the setting is left alone, because turning the board on is not a request
     * to change how you read the axis everywhere else. */
    await page.keyboard.press("y");
    await page.waitForTimeout(800);
    await page.keyboard.press("l");
    await page.waitForTimeout(1500);
    const boarded = await midY();
    check(boarded && boarded.frac < 0.3,
      "with the calls board up the axis is linear again, whatever the setting says",
      JSON.stringify(boarded));
    const kept = await page.evaluate(
      `localStorage.getItem("crypto_chart_log_scale")`);
    check(kept === "true",
      "…and the setting itself is untouched by the board", String(kept));

    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  /* §36 — "I have money and it will not open", and the control that was
   * greyed out while you were in it.
   *
   * Reported by the human on 13 Sep 2026 as two problems, and they turned out
   * to be one. The model was right both times — what binds an open is the
   * **free** balance, not the account, and margin behind the open contracts is
   * committed rather than spent — but two things on the screen made that
   * impossible to act on:
   *
   *   - the refusal said "not enough left in the balance" while the header
   *     said ten thousand dollars, which reads as the app being wrong;
   *   - the balance field, the one control that could have fixed it, was
   *     disabled whenever a contract was open — a leftover from when setting
   *     the balance replaced the account. `practiceSetBalance` accepts the
   *     same change with a contract running, and the preset chips beside the
   *     field were never locked, so the screen contradicted itself twice.
   *
   * The fixture is built by the model rather than written here, so it cannot
   * drift from what the model would actually produce.
   */
  {
    const vm = require("vm");
    const mbox = {
      console, Date, JSON, Math, Array, Object, Set, Map, Number, String,
      Boolean, RegExp, Error, isFinite, isNaN, parseInt, parseFloat,
      setTimeout, clearTimeout,
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    };
    vm.createContext(mbox);
    for (const f of ["i18n.js", "config.js", "practice-math.js", "practice-model.js"]) {
      vm.runInContext(
        require("fs").readFileSync(path.join(__dirname, "..", "src", f), "utf8"),
        mbox,
        { filename: f },
      );
    }
    const model = (c) => vm.runInContext(c, mbox);
    let acct = model("practiceEmptySession(PRACTICE_START_BALANCE_E2, PRACTICE_SETTLEMENT_QUOTE, 0)");
    /* Contracts until the account cannot carry even one lot more — the state
     * the report was made from, drained the rest of the way so the ticket has
     * to refuse whatever size is asked for. Big steps first, then single lots:
     * the point is an account with money in it and nothing left to commit. */
    for (let i = 0; i < 10; i++) {
      mbox.__c = acct;
      const r = model('practiceOpen(__c, { coin: "BTC", side: "long", leverage: 10, qty: 200, at: 1 }, 680000000)');
      if (r.error) break;
      acct = r.state;
    }
    /* …and the free balance taken down to almost nothing, rather than drained
     * by opening hundreds of one-lot contracts — that runs into the slot
     * ceiling and refuses for a different reason entirely, which is what the
     * first draft of this fixture did. Withdrawing is the same movement the
     * field under test performs, and it leaves the committed margin alone. */
    mbox.__c = acct;
    const drained = model("practiceSetBalance(__c, 200, '')");
    if (drained.state) acct = drained.state;
    mbox.__f = acct;
    const free = model("practiceFreeBalance(__f, '')");
    const size = model("practiceAccountSize(__f, '')");
    check(free > 0 && free < size / 20,
      "the fixture is an account with money in it and nothing left to commit",
      `${free} of ${size}`);

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    const T = Math.floor(Date.now() / 1000);
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) {
        return r.fulfill(json({ data: { prices: Array.from({ length: 40 }, (_, i) => ({
          price: (68000 + i).toFixed(2), time: T - (40 - i) * 3600 })) } }));
      }
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "68000.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_practice_enabled", "true");
      localStorage.setItem("crypto_chart_practice_consent", "true");
      localStorage.setItem("crypto_chart_practice", ${JSON.stringify(JSON.stringify(acct))});
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(2000);
    await page.keyboard.press("f");
    await page.waitForTimeout(1200);

    await page.getByRole("button", { name: "New contract" }).first().click();
    await page.waitForTimeout(1500);
    const ticket = await page.evaluate(`(() => ({
      refused: (document.body.innerText.match(/Cannot open[^\\n]*/) || [""])[0],
      open: [...document.querySelectorAll("button")]
        .filter((b) => /Open long/.test(b.textContent || ""))
        .map((b) => b.disabled),
    }))()`);
    /* **The refusal names the figure it is talking about.** "Not enough left
     * in the balance" beside a header reading $10,000 is a sentence somebody
     * is right to disbelieve. */
    check(/uncommitted/.test(ticket.refused) && /\d USDT/.test(ticket.refused),
      "the refusal says how much is actually free, not just that there is not enough",
      ticket.refused);
    check(/margin behind your open contracts/.test(ticket.refused),
      "…and says where the rest of the money went", ticket.refused);
    check(ticket.open.length === 1 && ticket.open[0] === true,
      "…and the button it refuses is not left looking pressable",
      JSON.stringify(ticket.open));

    /* **And the way out is open.** The account's other controls are locked
     * while a contract runs because each of them re-scales what the open
     * contracts were sized against; setting the balance does not, and the
     * model accepts it — so the field is not disabled, and the note stops
     * claiming that every row there is locked. */
    await page.getByRole("button", { name: "Account", exact: true }).first().click();
    await page.waitForTimeout(900);
    /* **Adding works while a contract runs; withdrawing does not.** A
       deposit is money on top of what is recorded, so the field is live;
       withdraw means zero, which cannot be true with margin committed, so it
       is refused and the note says to close the contracts first. */
    await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => n.innerText.trim() === "Funds"); if (b) b.click(); })()`);
    await page.waitForTimeout(500);
    const account = await page.evaluate(`(() => {
      const el = document.querySelector("input[aria-label*='add to the simulated balance']");
      const w = document.querySelector("[data-practice-transfer='withdraw']");
      const text = document.body.innerText;
      return {
        found: Boolean(el),
        disabled: el ? el.disabled : null,
        withdraw: w ? w.disabled : null,
        closeFirst: /Close open contracts first/i.test(text),
        setter: Boolean(document.querySelector("input[aria-label*='Set the simulated balance']")),
      };
    })()`);
    check(account.found && account.disabled === false && !account.setter,
      "money can be added while contracts are running, and nothing sets the balance to a figure",
      JSON.stringify(account));
    check(account.withdraw === true && account.closeFirst,
      "…while withdraw is refused with the contracts named as the reason",
      JSON.stringify(account));

    check(errors.length === 0, "nothing threw", errors[0]);
    await ctx.close();
  }

  /* §37 — a 200x account may deliberately stand the venue ladder down.
   *
   * The report was that a $10,000 account could not use its balance at 200x.
   * That was not a hidden reserve: tier one permits 200x only below its
   * notional ceiling, so the ticket was correctly refusing the larger order
   * and giving no way to choose the less realistic exercise. The Account tab
   * now makes that choice explicit. This follows the whole human path because
   * the regression crossed three layers: the account rule, the 100% chip's
   * fee-aware fit, and the model's maintenance contract. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: BIG_PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "112480.00", currency: "USD" } }));
      if (u.includes("public/instruments") && !u.includes("instId=")) {
        return r.fulfill(json({
          code: "0",
          data: [{ instId: "BTC-USDT-SWAP", settleCcy: "USDT", state: "live" }],
        }));
      }
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    const blew = [];
    page.on("pageerror", (e) => blew.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1800);
    await page.keyboard.press("f");
    await page.waitForTimeout(900);

    await page.getByRole("button", { name: "Account", exact: true }).first().click();
    await page.waitForTimeout(350);
    await page.locator("[data-practice-limit='sizeTiers'] > button").click();
    await page.waitForTimeout(250);
    await page.locator("[data-practice-limit='sizeTiers']").getByRole("button", { name: "Off", exact: true }).click();
    await page.waitForTimeout(500);
    const flatPlan = await page.evaluate(`(() => {
      const s = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
      return {
        sizeTiers: s.plan && s.plan.sizeTiers,
        balance: s.balance,
        copy: (document.querySelector("[data-practice-limit='sizeTiers']") || {}).innerText || "",
      };
    })()`);
    check(flatPlan.sizeTiers === 0,
      "the Account tab can turn size-based leverage off", JSON.stringify(flatPlan));
    check(/not how a real venue/i.test(flatPlan.copy),
      "…and names that choice as an unrestricted exercise, not venue behaviour", flatPlan.copy);

    await page.getByRole("button", { name: "New contract" }).first().click();
    await page.waitForTimeout(500);
    /* Drive the continuous control rather than one of its visual tick marks:
       200 is a valid value whether or not a later layout chooses to label
       every end of the rail. React 16 listens to the input event here. */
    await page.evaluate(`(() => {
      const r = document.querySelector('input[type="range"][aria-label="Leverage"]');
      if (!r) throw new Error("the 200x leverage rail is not on the ticket");
      const set = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value").set;
      set.call(r, "200");
      r.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await page.getByRole("button", { name: "Size 100 percent", exact: true }).click();
    await page.waitForTimeout(500);
    const ready = await page.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll("button")).find(
        (n) => /^Open long on BTC/.test(n.innerText));
      const tier = document.querySelector("[data-practice-tier='off']");
      return {
        button: b ? b.innerText : null,
        disabled: b ? b.disabled : null,
        tier: tier ? tier.innerText : null,
      };
    })()`);
    check(ready.button && ready.disabled === false,
      "200x at 100% resolves to an order the model can open", JSON.stringify(ready));
    check(ready.tier && /200x/.test(ready.tier),
      "…with the flat 200x rule visible on the ticket", JSON.stringify(ready));

    await page.getByRole("button", { name: /^Open long on BTC/ }).click();
    await page.waitForTimeout(650);
    const opened = await page.evaluate(`(() => {
      const s = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
      const p = Object.values(s.positions || {})[0];
      const free = practiceFreeBalance(s, "BTC");
      return p ? {
        count: Object.keys(s.positions).length,
        leverage: p.leverage,
        sizeTiers: p.sizeTiers,
        margin: p.margin,
        start: s.startBalance,
        free,
        reconciles: practiceReconcile(s).ok,
        liquidatedAtEntry: practiceIsLiquidated(p, p.entry),
      } : { count: 0, free, start: s.startBalance };
    })()`);
    check(opened.count === 1 && opened.leverage === 200 && opened.sizeTiers === false,
      "the opened 200x contract keeps the chosen maintenance rule", JSON.stringify(opened));
    check(opened.margin > opened.start * 0.85 && opened.free >= 0 && opened.free < opened.start / 100,
      "…and commits almost all $10,000, leaving only costs and lot rounding", JSON.stringify(opened));
    check(opened.reconciles && !opened.liquidatedAtEntry,
      "…without breaking the ledger or liquidating on its own fill", JSON.stringify(opened));
    check(blew.length === 0, "nothing threw", blew.join(" | "));
    await ctx.close();
  }

  /* **The ticket's foot does not cover the ticket.** Found in a screenshot on
   * 18 Sep 2026: with one contract held, at 1440×900 — the user's own window —
   * the sticky order button sat over the stop and take-profit chips, which
   * drew and could not be pressed. A sticky element's limit is its scroll
   * container's padding box, and the portfolio shell's 3rem of bottom padding
   * pinned the foot 48px above the window's edge. The page has its own shell
   * now; this presses nothing and asks what each control's centre belongs to,
   * in the exact state the defect was seen in. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: BIG_PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "112480.00", currency: "USD" } }));
      /* P7 — the tape, and the contract value that turns its sizes into coins. */
      if (u.includes("market/trades")) {
        return r.fulfill(json({ code: "0", data: [
          { px: "112480.5", sz: "3", side: "buy", ts: String(Date.now()) },
          { px: "112479.0", sz: "7", side: "sell", ts: String(Date.now() - 900) },
        ] }));
      }
      if (u.includes("public/instruments") && u.includes("instId=")) {
        return r.fulfill(json({ code: "0", data: [{ ctVal: "0.01", ctValCcy: "BTC" }] }));
      }
      /* OKX's listing, without LTC: a tracked coin with no perpetual. */
      if (u.includes("public/instruments") && !u.includes("instId=")) {
        return r.fulfill(json({ code: "0", data: ["BTC", "ETH", "XRP", "SOL"].map((c) =>
          ({ instId: c + "-USDT-SWAP", settleCcy: "USDT", state: "live" })) }));
      }
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    const blew = [];
    page.on("pageerror", (e) => blew.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(900);
    const pressText = (re) =>
      page.evaluate(
        `(() => {
           const b = Array.from(document.querySelectorAll("button")).find((n) =>
             ${re}.test(n.innerText.trim().split(String.fromCharCode(10))[0]));
           if (b) b.click();
           return Boolean(b);
         })()`,
      );
    check(await pressText("/^Open long on/"), "a contract can be opened from the page");
    await page.waitForTimeout(700);
    check(await pressText("/^New contract$/"), "…and the ticket is one tab away");
    await page.waitForTimeout(600);
    /* **Scrolled to the end of its own column first.** The desk is bounded by
       the window now, and a sticky foot is *supposed* to cover what is under
       it — what must never happen is a control that cannot be brought out
       from under it, which is the defect this block was written for. */
    await page.evaluate(`(() => {
      const desk = document.querySelector("[data-practice-desk]");
      let n = desk && desk.parentElement;
      while (n && n !== document.body) {
        const st = getComputedStyle(n);
        if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1) {
          n.scrollTop = n.scrollHeight;
          return true;
        }
        n = n.parentElement;
      }
      return false;
    })()`);
    await page.waitForTimeout(400);
    const hits = await page.evaluate(`(() => {
      const desk = document.querySelector("[data-practice-desk]");
      if (!desk) return null;
      const clip = (() => {
        let n = desk.parentElement;
        while (n && n !== document.body) {
          const st = getComputedStyle(n);
          if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1) {
            return n.getBoundingClientRect();
          }
          n = n.parentElement;
        }
        return { top: 0, bottom: innerHeight };
      })();
      const out = [];
      let seen = 0;
      desk.querySelectorAll("button, input").forEach((el) => {
        const r = el.getBoundingClientRect();
        /* On a window with columns the desk scrolls inside its own column
           (the page is the window now), so "on screen" means inside that
           box, not merely inside the viewport: a control scrolled past the
           column's edge is clipped by it and belongs to nobody. */
        if (r.width < 2 || r.height < 2 || r.bottom > clip.bottom || r.top < clip.top) return;
        seen++;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !(hit === el || el.contains(hit))) {
          out.push((el.getAttribute("aria-label") || el.innerText || el.tagName).slice(0, 24));
        }
      });
      return { seen, out, held: Boolean(document.querySelector("[data-practice-held]")) };
    })()`);
    check(hits && hits.held, "…with the contract held named above the form", JSON.stringify(hits));
    check(hits && hits.seen >= 20 && hits.out.length === 0,
      "with a contract held, no control on the ticket is under its own foot", JSON.stringify(hits));
    /* **The result in the head, and the ticket's consequences.** Unrealized,
       realized and since-start as figures in money; the ticket's details
       with a liquidation price and a break-even that is a price, not a
       percentage. */
    const figures = await page.evaluate(`(() => {
      const t = (k) => (document.querySelector("[data-practice-result='" + k + "']") || {}).innerText || "";
      const more = document.querySelector("[data-practice-ticket-more]");
      return {
        unrealised: t("unrealised"), realised: t("realised"), since: t("since"),
        more: more ? Array.from(more.children).map((c) => c.innerText.replace(/\\s+/g, " ")) : [],
      };
    })()`);
    /* Money carries its unit after it; a price in a USDT market is bare. */
    const money = /[+−-]?[\d,]+\.\d\d USDT/;
    const price = /[\d,]+\.\d\d/;
    check(money.test(figures.unrealised) && money.test(figures.realised) && money.test(figures.since),
      "the head carries unrealized, realized and since-start P/L", JSON.stringify(figures));
    check(
      figures.more.length >= 4
        && figures.more.some((c) => /liquidation/i.test(c) && price.test(c))
        && figures.more.some((c) => /break-even/i.test(c) && price.test(c)),
      "…and the ticket names the liquidation and break-even prices before the press",
      JSON.stringify(figures.more),
    );

    /* **The market row.** The tracked coins, the held one marked, a coin with
       no perpetual quiet — and choosing a market switches the page without
       closing it. On LTC, which the listing above leaves out, the ticket
       says there is no market rather than offering a contract on nothing. */
    const market = (c) =>
      page.evaluate(
        `(() => {
           const b = document.querySelector("[data-practice-market='${c}']");
           if (b) b.click();
           return Boolean(b);
         })()`,
      );
    const bar = await page.evaluate(`(() => Array.from(document.querySelectorAll("[data-practice-market]"))
      .map((b) => b.getAttribute("data-practice-market") + (b.getAttribute("aria-pressed") === "true" ? "*" : "")))()`);
    check(bar.join(" ") === "BTC* ETH XRP LTC", "the page names the tracked markets, the one on screen pressed",
      bar.join(" "));
    check(await market("LTC"), "…and a market can be chosen from it");
    await page.waitForTimeout(1200);
    const ltc = await page.evaluate(`({
      page: Boolean(document.querySelector("[data-practice-page]")),
      noperp: (document.querySelector("[data-practice-noperp]") || {}).getAttribute
        ? document.querySelector("[data-practice-noperp]").getAttribute("data-practice-noperp") : null,
      ticket: Boolean(Array.from(document.querySelectorAll("button")).find((b) => /^Open long on/.test(b.innerText))),
      pressed: (document.querySelector("[data-practice-market][aria-pressed='true']") || {}).innerText || "",
    })`);
    check(ltc.page && /^LTC/.test(ltc.pressed), "…switching the page to it without closing it", JSON.stringify(ltc));
    check(ltc.noperp === "LTC" && !ltc.ticket,
      "…and a coin with no perpetual says so instead of offering a contract", JSON.stringify(ltc));
    check(await market("ETH"), "…while a coin with one");
    await page.waitForTimeout(1200);
    check(
      await page.evaluate(`Boolean(Array.from(document.querySelectorAll("button")).find((b) => /^Open long on ETH/.test(b.innerText)))`),
      "…gets its ticket back",
    );

    /* **P2 — every open contract under the chart, and a way into each.** One
       on BTC and one on ETH; standing on BTC, the ETH row switches the page to
       ETH and opens *that* contract's card — the switch clears the tab
       choice, so the wanted row has to be carried across it (`pWant`). */
    check(await pressText("/^Open long on ETH/"), "a second market's contract opens");
    await page.waitForTimeout(800);
    check(await market("BTC"), "…and the page goes back to the first market");
    await page.waitForTimeout(1200);
    const table = await page.evaluate(`(() => {
      const box = document.querySelector("[data-practice-positions]");
      const scroller = box && box.lastElementChild;
      return {
        rows: Array.from(document.querySelectorAll("[data-practice-position]")).map((r) => r.innerText.split(String.fromCharCode(10))[0]),
        fits: scroller ? scroller.scrollWidth <= scroller.clientWidth + 1 : null,
      };
    })()`);
    check(table.rows.length === 2 && table.rows.some((r) => /^ETH/.test(r)) && table.rows.some((r) => /^BTC/.test(r)),
      "the table under the chart lists every open contract, across markets", JSON.stringify(table));
    check(table.fits, "…and fits the reading column without scrolling sideways", JSON.stringify(table));
    /* **A column is a column.** Every row used to size its own grid, so the
       head's short words and a row's long figures resolved to different
       widths and the head drifted off the numbers it named — reported as
       "veriler birbirine giriyor". The table owns the tracks now (subgrid),
       and this asserts what that buys: each figure ends where its heading
       does, down the whole list. */
    const aligned = await page.evaluate(`(() => {
      const ink = (n) => { const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); return [b.left, b.right]; };
      const rows = Array.from(document.querySelectorAll("[data-practice-positions] [role='row']"));
      const cells = rows.map((r) => Array.from(r.children).filter((c) => getComputedStyle(c).display !== "none"));
      const head = cells[0];
      const out = [];
      for (let col = 1; col <= 4; col += 1) {
        const h = head[col] ? ink(head[col])[1] : null;
        cells.slice(1).forEach((row) => {
          const c = row[col];
          if (h != null && c) out.push(Math.round(Math.abs(ink(c)[1] - h)));
        });
      }
      return { drift: out, worst: out.length ? Math.max(...out) : null, rows: rows.length };
    })()`);
    check(aligned.rows >= 3 && aligned.worst != null && aligned.worst <= 1,
      "…with every figure ending where its own heading does", JSON.stringify(aligned));
    await page.evaluate(`(() => {
      const row = Array.from(document.querySelectorAll("[data-practice-position]")).find((r) => /^ETH/.test(r.innerText));
      row.querySelector("button").click();
    })()`);
    await page.waitForTimeout(1500);
    const landed = await page.evaluate(`(() => {
      const pressed = (document.querySelector("[data-practice-market][aria-pressed='true']") || {}).innerText || "";
      const open = Array.from(document.querySelectorAll("button[aria-expanded='true']"))
        .find((b) => /#[0-9]/.test(b.innerText) && /Long|Short/.test(b.innerText));
      return { pressed: pressed.split(String.fromCharCode(10))[0], open: open ? open.innerText.split(String.fromCharCode(10))[0] : "" };
    })()`);
    check(landed.pressed === "ETH" && /ETH/.test(landed.open),
      "…and its row switches to that market with that contract's card open", JSON.stringify(landed));

    /* **P7 — the tape beside the book.** Asked for only once its tab is up. */
    await page.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll("[data-practice-book-tab] button")).find((n) => n.innerText.trim() === "Trades");
      if (b) b.click();
    })()`);
    await page.waitForTimeout(1200);
    const tape = await page.evaluate(`(() => {
      const t = document.querySelector("[data-practice-trades]");
      return t ? { n: t.getAttribute("data-practice-trades"), text: t.innerText.replace(/\\s+/g, " ") } : null;
    })()`);
    check(tape && tape.n === "2" && /[\d,]+\.\d\d/.test(tape.text),
      "the book's Trades tab shows the last prints, each with its price", JSON.stringify(tape));

    /* **P8 — the page's keys.** S for the short side, 2 for half, Enter for
       the order button — and a contract actually opens, through the button's
       own press. Focus is taken off the last button pressed first: Enter on a
       focused button already means "press this" and is left alone. */
    const before8 = await page.evaluate(`Object.keys(JSON.parse(localStorage.getItem("crypto_chart_practice")).positions).length`);
    await page.evaluate(`document.activeElement && document.activeElement.blur()`);
    await page.keyboard.press("s");
    await page.waitForTimeout(250);
    await page.keyboard.press("2");
    await page.waitForTimeout(400);
    const keyed = await page.evaluate(`({
      short: Boolean(Array.from(document.querySelectorAll("button[aria-pressed='true']")).find((b) => b.innerText.trim() === "Short")),
      half: Boolean(Array.from(document.querySelectorAll("button[aria-pressed='true']")).find((b) => b.innerText.trim() === "50%")),
    })`);
    check(keyed.short && keyed.half, "S picks the short side and 2 the half-size share", JSON.stringify(keyed));
    await page.evaluate(`document.activeElement && document.activeElement.blur()`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    const after8 = await page.evaluate(`Object.values(JSON.parse(localStorage.getItem("crypto_chart_practice")).positions).map((p) => p.side)`);
    check(after8.length === before8 + 1 && after8.includes("short"),
      "…and Enter opens it, through the order button's own press", JSON.stringify({ before8, after8 }));

    /* **Coin-margined accounts are no longer offered, and still work.** A
       quote account's Account tab offers no settlement at all — a control
       with one choice is not one. An account written in the old mode loads,
       says it is no longer offered, and the one button on it leads back to
       quote money. */
    const legacy = () =>
      page.evaluate(`({
        step: Boolean(document.querySelector("[data-practice-legacy-coin]")),
        offered: /Contract coin/.test((document.querySelector("[data-practice-desk]") || {}).innerText || ""),
        settlement: (JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}")).settlement,
      })`);
    await pressText("/^Account$/");
    await page.waitForTimeout(500);
    const quote = await legacy();
    check(!quote.step && !quote.offered, "a quote account is offered no coin-margined mode", JSON.stringify(quote));
    await page.evaluate(
      `localStorage.setItem("crypto_chart_practice", JSON.stringify(practiceEmptySession(undefined, "coin")))`,
    );
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(900);
    await pressText("/^Account$/");
    await page.waitForTimeout(500);
    const old = await legacy();
    check(old.step && old.settlement === "coin",
      "an account still in coin mode loads and says it is no longer offered", JSON.stringify(old));
    check(await pressText("/^Switch to quote currency$/"), "…with the way back on it");
    await page.waitForTimeout(600);
    const back = await legacy();
    check(!back.step && back.settlement === "quote", "…which leads to quote money", JSON.stringify(back));

    check(blew.length === 0, "nothing threw", blew.join(" | "));
    await ctx.close();
  }

  /* **P4 — a level is moved by dragging it on the chart.** A real mouse,
   * because a dispatched event skips the hit-testing that decides whether
   * the tag gets the press at all. A stop dragged up stays a stop and moves;
   * a stop dragged above the price would close the contract on the next
   * tick, and is refused with the reason, leaving the stop where it was. */
  {
    const WIDE = Array.from({ length: 120 }, (_, i) => ({
      price: (112480 + Math.sin(i / 9) * 4200).toFixed(2),
      time: NOW_S - (120 - i) * 30,
    }));
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: WIDE } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "112480.00", currency: "USD" } }));
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    const blew = [];
    page.on("pageerror", (e) => blew.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(900);
    const stopChip = await page.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll("button"))
        .find((n) => /^Stop at 2 percent/.test(n.getAttribute("aria-label") || ""));
      if (b) b.click();
      return Boolean(b);
    })()`);
    check(stopChip, "a stop can be set on the ticket before opening");
    await page.waitForTimeout(300);
    const opened = await page.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll("button")).find((n) => /^Open long on/.test(n.innerText.trim()));
      if (b) b.click();
      return Boolean(b);
    })()`);
    check(opened, "…and the contract opened with it");
    await page.waitForTimeout(900);
    const stopNow = () =>
      page.evaluate(`(() => {
        const s = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
        const p = Object.values(s.positions || {})[0];
        return p ? p.stop : null;
      })()`);
    const before = await stopNow();
    const tagBox = () =>
      page.evaluate(`(() => {
        const t = Array.from(document.querySelectorAll("[data-practice-tag]"))
          .find((n) => /^s/.test(n.getAttribute("data-practice-tag")));
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
    const drag = async (dy) => {
      const at = await tagBox();
      if (!at) return false;
      await page.mouse.move(at[0], at[1]);
      await page.mouse.down();
      await page.mouse.move(at[0], at[1] + dy / 2, { steps: 4 });
      await page.mouse.move(at[0], at[1] + dy, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(600);
      return true;
    };
    check(before > 0 && (await tagBox()) != null, "the stop is drawn on the chart as a tag", String(before));
    check(await drag(-24), "…which can be pressed and dragged");
    const raised = await stopNow();
    check(raised > before, "…and dropping it higher moves the stop there", `${before} → ${raised}`);
    await drag(-600);
    const refused = await page.evaluate(
      `(document.querySelector("[data-practice-drag-why]") || {}).getAttribute
        ? document.querySelector("[data-practice-drag-why]").getAttribute("data-practice-drag-why") : null`,
    );
    const kept = await stopNow();
    check(refused === "fires" && kept === raised,
      "a stop dragged past the price is refused, with the reason, and stays where it was",
      `${refused} ${raised} → ${kept}`);

    /* **P3 — the line above the chart** carries the market's last price. */
    const strip = await page.evaluate(
      `(document.querySelector("[data-practice-strip-cell='last']") || {}).innerText || ""`,
    );
    check(/[\d,]+\.\d\d/.test(strip), "the strip above the chart carries the last price", strip);

    /* **P5 — sizing by risk.** Typed as the loss at the stop; with no stop it
       asks for one; with one, the size it settles on is opened and the model's
       own close at that stop — plus the fee opening charged — loses no more
       than was typed. Measured through the model, not read off the screen. */
    const pressFirst = (re) =>
      page.evaluate(`(() => {
        const b = Array.from(document.querySelectorAll("button")).find((n) => ${re}.test(n.innerText.trim().split(String.fromCharCode(10))[0]) || ${re}.test(n.getAttribute("aria-label") || ""));
        if (b) b.click();
        return Boolean(b);
      })()`);
    check(await pressFirst("/^New contract$/"), "the ticket is reached again");
    await page.waitForTimeout(400);
    /* The ticket keeps the stop it opened the last contract with — a
       convenience, and a fixture that would hand the risk mode a stop before
       the test asks whether it needs one. Cleared first. */
    await page.evaluate(`(() => {
      const el = document.querySelector("[data-practice-levels] input[aria-label='Stop price']");
      if (!el) return;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      set.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await page.waitForTimeout(300);
    check(await pressFirst("/Type the amount in Risk/"), "the size can be typed as a risk");
    await page.waitForTimeout(300);
    await page.evaluate(`(() => {
      const el = document.querySelector("input[aria-label='Contract size']");
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      set.call(el, "100");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await page.waitForTimeout(400);
    const noStop = await page.evaluate(
      `(document.querySelector("[data-practice-risk-size]") || {}).getAttribute ? document.querySelector("[data-practice-risk-size]").getAttribute("data-practice-risk-size") : null`,
    );
    const noStopText = await page.evaluate(`document.body.innerText`);
    check(/needs a stop/i.test(noStopText) && noStop !== "ok", "…which asks for a stop before it can size anything", String(noStop));
    check(await pressFirst("/^Stop at 2 percent/"), "a stop is set");
    await page.waitForTimeout(500);
    const sized = await page.evaluate(`(() => {
      const n = document.querySelector("[data-practice-risk-size]");
      return { state: n ? n.getAttribute("data-practice-risk-size") : null, text: n ? n.innerText : "" };
    })()`);
    check(sized.state === "ok" && /would lose [\d,]+\.\d\d USDT/.test(sized.text),
      "…and the ticket says the size and what it would lose at the stop", JSON.stringify(sized));
    check(await pressFirst("/^Open long on/"), "…and opens it");
    await page.waitForTimeout(900);
    const atStop = await page.evaluate(`(() => {
      const s = JSON.parse(localStorage.getItem("crypto_chart_practice"));
      const ids = Object.keys(s.positions).sort((a, b) => Number(a) - Number(b));
      const id = ids[ids.length - 1];
      const p = s.positions[id];
      const live = sanitizePractice(s);
      const q = practiceCloseQuote(live, id, p.stop);
      const fee = s.ledger.filter((e) => e.pos === id && e.kind === "open").reduce((a, e) => a + e.fee, 0);
      return { loss: -q.realised + fee, qty: p.qty };
    })()`);
    check(atStop.qty > 1 && atStop.loss > 0 && atStop.loss <= 10000,
      "…and at its stop it loses no more than the $100 typed, both fees in", JSON.stringify(atStop));

    /* **P6 — reverse, stop entries, reduce-only, close all.** Each through the
       screen, each read back from the account the model saved. */
    const acct = () => page.evaluate(`JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}")`);
    const setField = (label, value) =>
      page.evaluate(`(() => {
        const el = document.querySelector("[data-practice-levels] input[aria-label='${label}']");
        if (!el) return false;
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        set.call(el, "${value}");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
    check(await pressFirst("/^Positions/"), "the list is reached");
    await page.waitForTimeout(500);
    const revOnce = await page.evaluate(`(() => { const b = document.querySelector("[data-practice-reverse]"); if (b) b.click(); return Boolean(b); })()`);
    await page.waitForTimeout(300);
    const revTwice = await page.evaluate(`(() => { const b = document.querySelector("[data-practice-reverse]"); if (b) b.click(); return b ? b.innerText : ""; })()`);
    await page.waitForTimeout(700);
    const afterRev = await acct();
    const sides = Object.values(afterRev.positions || {}).map((p) => p.side);
    check(revOnce && sides.includes("short") && Object.keys(afterRev.positions).length === 2,
      "a contract is reversed with two presses — the long becomes a short", JSON.stringify({ revTwice, sides }));
    check(await pressFirst("/^New contract$/"), "…and the ticket is reached");
    await page.waitForTimeout(400);
    check(await pressFirst("/^Stop$/"), "the ticket offers a stop entry");
    await page.waitForTimeout(300);
    check(await setField("Entry price", "118000"), "…whose trigger is typed");
    await page.waitForTimeout(400);
    check(await pressFirst("/^Long if it breaks/"), "…and placed as 'long if it breaks'");
    await page.waitForTimeout(700);
    const stopOrders = Object.values((await acct()).orders || {});
    check(stopOrders.some((o) => o.kind === "stop" && o.side === "long" && o.limit === 1180000000),
      "…resting as a stop entry at its trigger", JSON.stringify(stopOrders));
    check(await pressFirst("/^New contract$/"), "back on the ticket");
    await page.waitForTimeout(400);
    check(await pressFirst("/^Limit$/"), "…a limit");
    await page.waitForTimeout(300);
    check(await pressFirst("/^Long$/"), "…on the side that reduces the short");
    await page.waitForTimeout(300);
    const reduceChip = await page.evaluate(`Boolean(document.querySelector("[data-practice-reduce]"))`);
    check(reduceChip, "…offers reduce-only, because there is a short to reduce");
    await page.evaluate(`document.querySelector("[data-practice-reduce]").click()`);
    await page.waitForTimeout(300);
    check(await setField("Entry price", "105000"), "…at a price below the market");
    await page.waitForTimeout(400);
    check(await pressFirst("/^Reduce at/"), "…placed as a reduce");
    await page.waitForTimeout(700);
    const allOrders = Object.values((await acct()).orders || {});
    const ro = allOrders.find((o) => o.reduce);
    const why = await page.evaluate(`(document.body.innerText.match(/Cannot open[^\\n]*|Not placed[^\\n]*|Takes up to[^\\n]*/g) || []).join(" | ")`);
    check(ro && ro.margin === 0 && ro.side === "long", "…resting as reduce-only, with nothing reserved",
      JSON.stringify({ orders: allOrders.map((o) => [o.kind, o.side, o.reduce, o.limit, o.qty]), why }));
    const armed = await page.evaluate(`(() => { const b = document.querySelector("[data-practice-close-all]"); if (b) b.click(); return Boolean(b); })()`);
    await page.waitForTimeout(300);
    await page.evaluate(`(() => { const b = document.querySelector("[data-practice-close-all]"); if (b) b.click(); })()`);
    await page.waitForTimeout(800);
    const emptied = await acct();
    check(armed && Object.keys(emptied.positions || {}).length === 0,
      "close all takes every contract off in two presses", JSON.stringify(Object.keys(emptied.positions || {})));

    /* **P9 — the record as a journal.** A note and tags on a closed
       contract, saved to the account and filterable by tag. */
    check(await pressFirst("/^Closed/"), "the record is reached");
    await page.waitForTimeout(500);
    const noteOpen = await page.evaluate(`(() => { const b = document.querySelector("[data-practice-note-open]"); if (b) b.click(); return Boolean(b); })()`);
    check(noteOpen, "a closed contract offers a note");
    await page.waitForTimeout(300);
    await page.evaluate(`(() => {
      const put = (el, v) => {
        const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const box = document.querySelector("[data-practice-note-editor]");
      put(box.querySelector("textarea"), "Broke the range on volume.");
      put(box.querySelector("input"), "Breakout, news");
    })()`);
    await page.waitForTimeout(300);
    check(await pressFirst("/^Save note$/"), "…and saves it");
    await page.waitForTimeout(600);
    const journal = await page.evaluate(`({
      note: (document.querySelector("[data-practice-note]") || {}).innerText || "",
      tags: Array.from(document.querySelectorAll("[data-practice-record-tags] button")).map((b) => b.innerText.trim()),
      stored: JSON.parse(localStorage.getItem("crypto_chart_practice")).ledger.filter((e) => e.note).map((e) => [e.note, e.tags]),
    })`);
    check(/Broke the range/.test(journal.note) && /#breakout/.test(journal.note) && journal.stored.length === 1,
      "…which the card shows and the account keeps", JSON.stringify(journal));
    check(journal.tags.includes("#breakout") && journal.tags.includes("#news"),
      "…and the record can be filtered by its tags", JSON.stringify(journal.tags));

    check(blew.length === 0, "nothing threw", blew.join(" | "));
    await ctx.close();
  }

  /* **The derivatives account is USDT, priced by the perpetual — not by the
     currency the app shows.** Every block above drives the perpetual from its
     own Coinbase stub (see perpFromCoinbase), so each would pass just as well
     against the display price. Here the two disagree on purpose: the chart is
     in euros at 43,000 and OKX's BTC-USDT-SWAP trades at 50,000. The page must
     quote, open and value at 50,000, name the unit, and never print a euro
     sign. Its own route handler answers OKX directly, before the adapter
     would be asked. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const NOW = Date.now();
    const answer = (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43000.00", currency: "EUR" } }));
      if (u.includes("okx.com") && u.includes("market/ticker")) {
        return r.fulfill(json({ code: "0", data: [{ last: "50000", open24h: "49000", high24h: "50500", low24h: "48800" }] }));
      }
      if (u.includes("okx.com") && u.includes("candles")) {
        const data = Array.from({ length: 60 }, (_, i) => [String(NOW - i * 60000), "50000", "50000", "50000", String(50000 + (i % 5) * 10), "1", "1", "1", "1"]);
        return r.fulfill(json({ code: "0", data: u.includes("history-candles") ? [] : data }));
      }
      /* The tape and the contract value it is read with, for the delta. */
      if (u.includes("public/instruments") && u.includes("instId=")) {
        return r.fulfill(json({ code: "0", data: [{ ctVal: "0.01", ctValCcy: "BTC", tickSz: "0.1", lotSz: "0.01" }] }));
      }
      if (u.includes("market/trades")) {
        return r.fulfill(json({ code: "0", data: Array.from({ length: 14 }, (_, i) => ({ px: String(50000 + i), sz: String(1 + i), side: i % 2 ? "buy" : "sell", ts: String(NOW - i * 4000) })) }));
      }
      return r.fulfill(json({}));
    };
    answer.answersOkx = true;
    await ctx.route("**/*", answer);
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_currency", "EUR");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    const blew = [];
    page.on("pageerror", (e) => blew.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(1200);
    const quoted = await page.evaluate(`({
      last: (document.querySelector("[data-practice-strip-cell='last']") || {}).innerText || "",
      entry: (document.querySelector("input[aria-label='Entry price']") || {}).value || "",
      head: (document.querySelector("[data-practice-equity]") || {}).innerText || "",
      /* The page, not the document: the euro chart is still mounted behind it. */
      euro: /€/.test((document.querySelector("[data-alerts-card]") || document.body).innerText),
    })`);
    check(/50,000\.00/.test(quoted.last), "the derivatives page quotes the perpetual, not the chart's currency", JSON.stringify(quoted));
    check(Number(quoted.entry) === 50000, "…and the ticket's entry is the perpetual's price", quoted.entry);
    check(/USDT/.test(quoted.head) && !quoted.euro, "…and the account is USDT, with no euro sign anywhere on it", JSON.stringify(quoted));
    const opened = await page.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll("button")).find((n) => /^Open long on/.test(n.innerText.trim()));
      if (b) b.click();
      return Boolean(b && !b.disabled);
    })()`);
    await page.waitForTimeout(800);
    const stored = await page.evaluate(`Object.values(JSON.parse(localStorage.getItem("crypto_chart_practice")).positions)`);
    check(opened && stored.length === 1, "a contract opens at the perpetual's price", String(stored.length));
    const pos = stored[0] || {};
    check(pos.currency === "USDT" && pos.entry >= 50000 * 10000 && pos.entry < 50100 * 10000,
      "…stamped USDT, and filled near 50,000 rather than the chart's 43,000",
      `${pos.currency} ${pos.entry}`);

    /* **The page is the window.** Asked for: nothing left below the fold.
       From the two-column breakpoint up the screen ends where the window
       does — the columns scroll inside themselves when their content is
       taller, and the page itself never grows a second screenful. */
    const fits = await page.evaluate(`(() => {
      const shell = document.querySelector("[data-alerts-card]").parentElement;
      const inner = document.querySelector("[data-alerts-card]");
      return {
        page: Math.round(inner.getBoundingClientRect().bottom),
        win: window.innerHeight,
        shellScroll: shell.scrollHeight - shell.clientHeight,
        readings: Boolean(document.querySelector("[data-practice-readings-card]")),
        book: Boolean(document.querySelector("[data-practice-book-card]")),
        table: Boolean(document.querySelector("[data-practice-positions]")),
      };
    })()`);
    check(fits.page <= fits.win && fits.shellScroll <= 1,
      "the whole screen fits the window, with nothing below the fold", JSON.stringify(fits));
    check(fits.readings && fits.book && fits.table,
      "…and the market's readings, the book and what you hold are all on it", JSON.stringify(fits));
    /* **The companions** (20 Sep 2026, from the order-flow research): the
       range's own volume profile as levels on the chart, the tape's delta
       under the Trades tab, and the outcome cone on the open contract —
       each a count with its denominator, none an arrow. The stubbed candles
       carry volume, so the profile can be built; the stubbed trades are
       half buys, so the delta is small and the share is near half. */
    const tags = await page.evaluate(`Array.from(document.querySelectorAll("[data-practice-tag]")).map((n) => n.innerText || "").filter(Boolean).join(" | ")`);
    check(/POC/.test(tags) && /value high/i.test(tags) && /value low/i.test(tags),
      "the market chart draws the range's point of control and value area", tags.slice(0, 160));
    /* **And no two of them on top of each other** (27 Sep 2026). The gap
       was a fixed 7% of the plot, which is a tag's height only on a 20rem
       chart; the chart shrinks with the window and the price, the POC and
       the value area's edge were printed over each other. */
    const tagBoxes = await page.evaluate(`(() => {
      const ts = Array.from(document.querySelectorAll("[data-practice-tag]")).filter((n) => n.offsetParent);
      const rs = ts.map((n) => n.getBoundingClientRect());
      const hits = [];
      rs.forEach((a, i) => rs.forEach((b, j) => {
        if (j > i && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1 && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1) hits.push(ts[i].innerText + " ⟂ " + ts[j].innerText);
      }));
      return { n: ts.length, hits };
    })()`);
    check(tagBoxes.n >= 4 && tagBoxes.hits.length === 0,
      "…and no level's tag is printed over another's", JSON.stringify(tagBoxes));
    /* On a short window the chart is 12rem and a fixed share of it is less
       than a tag: the case that printed them over each other. The spacing
       is re-read from the plot as drawn, so it holds here too. */
    await page.setViewportSize({ width: 1440, height: 640 });
    await page.waitForTimeout(900);
    const shortTags = await page.evaluate(`(() => {
      const ts = Array.from(document.querySelectorAll("[data-practice-tag]")).filter((n) => n.offsetParent);
      const rs = ts.map((n) => n.getBoundingClientRect()).sort((a, b) => a.top - b.top);
      const plot = document.querySelector("[data-practice-plot]");
      let worst = Infinity;
      for (let i = 1; i < rs.length; i++) worst = Math.min(worst, rs[i].top - rs[i - 1].bottom);
      return { n: rs.length, plotH: plot ? Math.round(plot.getBoundingClientRect().height) : null, worst: Math.round(worst * 10) / 10 };
    })()`);
    check(shortTags.n >= 4 && shortTags.plotH < 200 && shortTags.worst >= 0,
      "…on a short window as well, where the chart is at its smallest", JSON.stringify(shortTags));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(600);
    await page.evaluate(OPEN_CARD);
    await page.waitForTimeout(800);
    const cone = await page.evaluate(`(() => { const n = document.querySelector("[data-practice-cone]"); return n ? { n: n.getAttribute("data-practice-cone"), text: n.innerText } : null; })()`);
    check(cone && Number(cone.n) >= 1000 && /touched the liquidation first/.test(cone.text) && /reached the hour/.test(cone.text),
      "an open contract carries its outcome cone, as counts of resampled paths", JSON.stringify(cone).slice(0, 200));
    await page.evaluate(`(() => { const t = Array.from(document.querySelectorAll("[data-practice-book-tab] button")).find((n) => /^Trades$/.test(n.innerText.trim())); if (t) t.click(); })()`);
    await page.waitForTimeout(1200);
    const delta = await page.evaluate(`(() => { const n = document.querySelector("[data-practice-delta]"); return n ? n.innerText.replace(/\\n/g, " ") : null; })()`);
    check(delta && /Delta/i.test(delta) && /% buyers/.test(delta) && /BTC/.test(delta),
      "the tape sums who was hitting, as a delta and a share", delta);
    /* **The outlook, before a contract.** The Outlook tab replays the range
       forward and prints where the replays landed with their count, the
       regime with its n, and the location chain with its n — and the ticket
       reads the setup as codes that the contract opened above now carries.
       The stubbed candles are 60 minute bars, so the only horizon that fits
       in half the window is none (1h = 60 bars > 30) and the tab must say so
       rather than draw; the location needs 96 bars behind it and must say
       that too. What is asserted is the honesty, not a number. */
    await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /^Outlook$/.test(n.innerText.trim())); if (b) b.click(); })()`);
    await page.waitForTimeout(700);
    const outlook = await page.evaluate(`(() => {
      const box = document.querySelector("[data-practice-readings='outlook']");
      return {
        text: box ? box.innerText : "",
        refused: Boolean(document.querySelector("[data-practice-outlook='nocone']")),
        regime: (document.querySelector("[data-practice-outlook='regime']") || {}).innerText || "",
        location: (document.querySelector("[data-practice-location]") || { getAttribute: () => null }).getAttribute("data-practice-location"),
        rule: Boolean(document.querySelector("[data-practice-outlook-rule]")),
        overflow: box ? box.scrollWidth > box.clientWidth + 1 : null,
      };
    })()`);
    check(outlook.refused && /pick a longer range/i.test(outlook.text),
      "on a 60-bar range the outlook refuses a horizon it cannot resample, and says which range to pick", outlook.text.slice(0, 120));
    check(/n = \d+/.test(outlook.regime) && /percentile \d+/.test(outlook.regime),
      "…the regime prints its percentile and its n", outlook.regime.slice(0, 160));
    check(outlook.location === "none" && /\d+ needed/.test(outlook.text),
      "…and a location with too few bars behind it says how many it needs", `${outlook.location} · ${outlook.text.slice(-200)}`);
    check(outlook.rule && outlook.overflow === false, "…under a line that says what none of it is, with no horizontal overflow");
    const setup = await page.evaluate(`(() => {
      const card = document.querySelector("[data-practice-setup]");
      const pos = Object.values(JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}").positions || {})[0] || {};
      const detail = document.querySelector("[data-practice-setup-detail]");
      return {
        codes: card ? card.getAttribute("data-practice-setup") : null,
        chips: document.querySelectorAll("[data-practice-setup-codes] [data-practice-code]").length,
        gates: document.querySelectorAll("[data-practice-gate]").length,
        shut: detail ? detail.getAttribute("data-practice-setup-detail") === "shut" && getComputedStyle(detail).visibility === "hidden" : null,
        stamped: pos.setup || null,
      };
    })()`);
    check(setup.gates === 4 && setup.chips >= 2 && /env:/.test(setup.codes || "") && /mgmt:nostop/.test(setup.codes || ""),
      "the ticket asks the four setup questions and answers them as codes", JSON.stringify(setup).slice(0, 200));
    check(setup.shut === true, "…with the four facts folded away until asked, so the ticket stays a ticket", JSON.stringify(setup).slice(0, 120));
    /* **The assistant: a desk's checks as facts, never a verdict.** A
       contract is open with no stop and the ticket has none either, so two
       things are missing and the tab's badge says so; missing rows come
       first; the text carries counts and no direction word anywhere; and
       the one press a missing stop offers lands in the stop field. */
    await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /^Assistant/.test(n.innerText.trim())); if (b) b.click(); })()`);
    await page.waitForTimeout(700);
    const assist = await page.evaluate(`(() => {
      const box = document.querySelector("[data-practice-readings='assistant']");
      const tab = Array.from(document.querySelectorAll("button")).find((n) => /^Assistant/.test(n.innerText.trim()));
      const rows = Array.from(document.querySelectorAll("[data-practice-assist]"));
      return {
        badge: tab ? tab.innerText.trim() : null,
        kinds: rows.map((n) => n.getAttribute("data-practice-assist")),
        keys: rows.map((n) => n.getAttribute("data-practice-assist-key")),
        phases: Array.from(document.querySelectorAll("[data-practice-assist-phase]")).map((n) => n.getAttribute("data-practice-assist-phase")),
        text: box ? box.innerText : "",
        rule: Boolean(document.querySelector("[data-practice-assist-rule]")),
        overflow: box ? box.scrollWidth > box.clientWidth + 1 : null,
      };
    })()`);
    check(/^Assistant\s*\d+$/.test(assist.badge || "") && Number((assist.badge.match(/\d+$/) || [0])[0]) >= 2,
      "the assistant tab counts what is missing and what has a clock on it", assist.badge);
    check(assist.keys.includes("stop") && assist.keys.includes("posStop") && assist.kinds[0] === "missing",
      "…a ticket with no stop and a contract with none are both raised, first", assist.keys.join(","));
    check(assist.phases.includes("before") && assist.phases.includes("during"),
      "…in the desk's order — before, then the open contract", assist.phases.join(","));
    check(/\d+ of \d+ steps/.test(assist.text), "…and a threshold fact carries its count and denominator", assist.text.slice(0, 200));
    check(!/\b(should|must|buy|sell|bullish|bearish|long now|short now)\b/i.test(assist.text),
      "…with no direction and no instruction anywhere in it", (assist.text.match(/\b(should|must|buy|sell|bullish|bearish)\b/i) || [])[0]);
    check(assist.rule && assist.overflow === false, "…under a line that says what it is, with no horizontal overflow");
    const jumped = await page.evaluate(`(() => {
      const b = document.querySelector("[data-practice-assist-go='stop']");
      if (!b) return { pressed: false };
      b.click();
      return { pressed: true };
    })()`);
    await page.waitForTimeout(400);
    const focused = await page.evaluate(`(() => { const a = document.activeElement; return a ? a.getAttribute("aria-label") : null; })()`);
    check(jumped.pressed && focused === "Stop price", "…and the missing stop's one press lands in the stop field", `${JSON.stringify(jumped)} focus=${focused}`);
    /* **An assistant item can be seen on the chart.** Hovering a row that is
       about a price draws its band and level on the market chart; pressing
       "On the chart" pins it. The ticket has no stop, so the first row is
       "no stop" with the band of ordinary steps around the entry. */
    await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => /^Assistant/.test(n.innerText.trim())); if (b) b.click(); })()`);
    await page.waitForTimeout(500);
    /* A real hover: React's onMouseEnter listens to mouseover on the
       document, which a dispatched mouseenter never reaches. */
    const hinted = await page.evaluate(`(() => {
      const row = document.querySelector("[data-practice-assist-chart='yes']");
      return row ? { row: true, key: row.getAttribute("data-practice-assist-key") } : { row: false };
    })()`);
    if (hinted.row) await page.hover("[data-practice-assist-chart='yes']");
    await page.waitForTimeout(300);
    const drawn = await page.evaluate(`(() => {
      const band = document.querySelector("[data-practice-focus]");
      const line = document.querySelector(".pp-focus-level");
      return { band: band ? Number(band.getAttribute("height")) : null, line: Boolean(line) };
    })()`);
    check(hinted.row && drawn.band > 0, "hovering an assistant row about a price draws its band on the market chart", JSON.stringify({ hinted, drawn }));
    await page.evaluate(`(() => { const p = document.querySelector("[data-practice-assist-pin]"); if (p) p.click(); })()`);
    await page.waitForTimeout(300);
    const pinned = await page.evaluate(`(() => ({ pinned: Boolean(document.querySelector("[data-practice-assist-chart='pinned']")), band: Boolean(document.querySelector("[data-practice-focus]")) }))()`);
    check(pinned.pinned && pinned.band, "…and pressing On the chart pins it", JSON.stringify(pinned));
    /* **The assistant is on the chart too**, as chips under the strip — and
       the reading card's tabs stand together like a folder's, not spread to
       the card's edges: the gap between the first two is a fraction of the
       card, and the open one is joined to the body (same background, no rule
       under it). */
    const onChart = await page.evaluate(`(() => {
      const flags = Array.from(document.querySelectorAll("[data-practice-chart-flag]"));
      const tabs = Array.from(document.querySelectorAll("[data-practice-readings-card] [role='tab']"));
      const card = document.querySelector("[data-practice-readings-card]");
      const a = tabs[0] && tabs[0].getBoundingClientRect();
      const b = tabs[1] && tabs[1].getBoundingClientRect();
      const open = tabs.find((t) => t.getAttribute("aria-selected") === "true");
      const cs = open ? getComputedStyle(open) : null;
      const cardBg = card ? getComputedStyle(card).backgroundColor : null;
      const overlap = tabs.some((t, i) => tabs.some((u, j) => i !== j && (() => { const r = t.getBoundingClientRect(), q = u.getBoundingClientRect(); return r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1; })()));
      return {
        flags: flags.map((n) => n.getAttribute("data-practice-chart-flag") + ":" + n.innerText.replace(/\\s+/g, " ")),
        gap: a && b ? Math.round(b.left - a.right) : null,
        cardW: card ? Math.round(card.getBoundingClientRect().width) : null,
        joined: cs && cardBg ? cs.backgroundColor === cardBg && cs.borderBottomColor === cardBg : null,
        overlap,
        cone: Boolean(document.querySelector("[data-practice-cone-band]")),
      };
    })()`);
    check(onChart.flags.length >= 1 && onChart.flags.some((f) => /^missing:/.test(f) && /no stop/i.test(f)),
      "the chart card carries the assistant's missing items as chips", JSON.stringify(onChart.flags));
    check(onChart.gap != null && onChart.gap >= 0 && onChart.gap < 24, "the reading tabs stand together, a few pixels apart, not spread to the card's edges", `${onChart.gap}px of ${onChart.cardW}`);
    check(onChart.joined === true && onChart.overlap === false, "…the open tab is joined to the body, and no two tabs overlap", JSON.stringify(onChart));
    check(Array.isArray(setup.stamped) && setup.stamped.some((c) => /^env:/.test(c)) && setup.stamped.includes("mgmt:nostop"),
      "…and the contract opened earlier carries the codes it was opened under", JSON.stringify(setup.stamped));
    check(blew.length === 0, "nothing threw on the USDT page", blew.join(" | "));
    await ctx.close();
  }

  /* **The outlook widget** replays the chart's own range forward and prints
     the band with its count; on a range too short to fit a horizon it says
     so instead of drawing. Both states, on the two fixtures. */
  {
    const long = Array.from({ length: 400 }, (_, i) => ({
      price: (43000 + Math.sin(i / 9) * 400 + i * 2).toFixed(2),
      time: NOW_S - (400 - i) * 60,
    }));
    const { ctx, page, errors } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_widgets", JSON.stringify({ outlook: true }));
    }, long);
    await openWidgets(page);
    await page.waitForTimeout(1200);
    const card = await page.evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll("[data-widget-outlook]"));
      const head = Array.from(document.querySelectorAll("*")).find((n) => n.children.length === 0 && /Outlook/.test(n.textContent || "") && /BTC/.test(n.textContent || ""));
      return { rows: rows.map((n) => n.innerText), head: head ? head.textContent : "", body: document.body.innerText };
    })()`);
    check(card.rows.length >= 1 && /median/.test(card.rows[0]) && /of 2000 above/.test(card.rows[0]),
      "the outlook widget prints a median and a share above, with the count", JSON.stringify(card.rows));
    check(/BTC/.test(card.head) && /1H/i.test(card.head), "…named for the coin and the range on the chart", card.head);
    check(/a count, not a call/.test(card.body), "…and says what it is not");
    check(errors.length === 0, "nothing threw on the widget", errors.join(" | "));
    await ctx.close();
    const short = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_widgets", JSON.stringify({ outlook: true }));
    });
    await openWidgets(short.page);
    await short.page.waitForTimeout(1200);
    const said = await short.page.evaluate(`document.body.innerText`);
    check(/Too few points on this range/.test(said) && !/of 2000 above/.test(said),
      "on an hour of 30-second points no horizon fits, and the card says so instead of drawing one");
    await short.ctx.close();
  }

  /* **The order book's filters.** A side, a price step and a minimum size;
     each a reading of the same book. The venue answers with as many levels as
     it is asked for, so what the page asks for is checked too: the deep book
     only once a filter needs it. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1300 } });
    const asked = [];
    const answer = (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "100000.00", currency: "USD" } }));
      if (u.includes("okx.com") && u.includes("market/ticker")) {
        return r.fulfill(json({ code: "0", data: [{ last: "100000", open24h: "100000", high24h: "100000", low24h: "100000" }] }));
      }
      if (u.includes("public/instruments") && u.includes("instId=")) {
        return r.fulfill(json({ code: "0", data: [{ ctVal: "0.01", ctValCcy: "BTC", tickSz: "0.1", lotSz: "0.01" }] }));
      }
      if (u.includes("market/books")) {
        const n = Number((u.match(/sz=(\d+)/) || [])[1]) || 8;
        asked.push(n);
        /* Every 37th ask and 41st bid is a wall; the rest are 20-90 contracts. */
        const asks = Array.from({ length: n }, (_, i) => [(100000.1 + i * 0.4).toFixed(1), String(i % 37 === 5 ? 9000 : 20 + (i % 7) * 11), "0", "3"]);
        const bids = Array.from({ length: n }, (_, i) => [(99999.9 - i * 0.4).toFixed(1), String(i % 41 === 9 ? 12000 : 25 + (i % 5) * 13), "0", "3"]);
        return r.fulfill(json({ code: "0", data: [{ asks, bids }] }));
      }
      return r.fulfill(json({}));
    };
    answer.answersOkx = true;
    await ctx.route("**/*", answer);
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    const blew = [];
    page.on("pageerror", (e) => blew.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(1500);
    const ladder = () => page.evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll("[data-practice-book] [aria-label]"))
        .filter((n) => /^(Ask|Bid) /.test(n.getAttribute("aria-label")));
      return rows.map((n) => ({
        side: n.getAttribute("aria-label").split(" ")[0],
        price: Number(n.children[0].innerText.replace(/,/g, "")),
        size: n.children[1].innerText,
      }));
    })()`);
    const first = await ladder();
    /* As many a side as its column holds since 27 Sep 2026 — never under
       eight here, never past the sixteen the shallow request carries, and
       the same on both sides. */
    const firstAsks = first.filter((r) => r.side === "Ask").length;
    const firstBids = first.filter((r) => r.side === "Bid").length;
    check(firstAsks === firstBids && firstAsks >= 8 && firstAsks <= 16 && asked.every((n) => n <= 16),
      "the book draws as many a side as its column holds, and asks the venue only for what it can draw",
      `${firstAsks}+${firstBids} rows, asked ${asked.join(",")}`);
    const bidsBtn = await page.$("[data-practice-book-filters] button[aria-pressed='false']");
    await page.click("[data-practice-book-filters] >> text=Bids");
    await page.waitForTimeout(500);
    const bids = await ladder();
    check(bidsBtn && bids.length === 16 && bids.every((r) => r.side === "Bid"),
      "Bids draws that side alone, sixteen deep", `${bids.length} ${bids.map((r) => r.side).join("")}`);
    await page.click("[data-practice-book-filters] >> text=Both");
    await page.selectOption("select[aria-label='Group price levels by']", "2");
    await page.waitForTimeout(900);
    const grouped = await ladder();
    check(asked.includes(400), "grouping asks for the deep book", asked.join(","));
    check(grouped.length > 0 && grouped.every((r) => Math.abs(r.price / 10 - Math.round(r.price / 10)) < 1e-6),
      "…and every level is a multiple of the step chosen", grouped.map((r) => r.price).join(" "));
    await page.selectOption("select[aria-label='Group price levels by']", "0");
    await page.selectOption("select[aria-label='Hide levels smaller than']", "100000");
    await page.waitForTimeout(900);
    const walls = await ladder();
    const toNum = (t) => parseFloat(t) * (/M$/.test(t) ? 1e6 : /K$/.test(t) ? 1e3 : 1);
    check(walls.length > 0 && walls.every((r) => toNum(r.size) >= 100000),
      "a minimum size leaves only the levels that big", walls.map((r) => r.size).join(" "));
    /* **On a phone, the page is in the order you trade in**: the ticket
       straight after the market, the readings last — not after them. */
    await page.setViewportSize({ width: 420, height: 900 });
    await page.waitForTimeout(500);
    const tops = await page.evaluate(`(() => {
      const at = (k) => { const n = document.querySelector("[data-practice-" + k + "]"); return n ? n.getBoundingClientRect().top : null; };
      return { market: at("market-card"), desk: at("desk"), book: at("book-card"), readings: at("readings-card") };
    })()`);
    check(tops.market < tops.desk && tops.desk < tops.book && tops.book < tops.readings,
      "one column puts the ticket after the market and the readings last", JSON.stringify(tops));
    check(blew.length === 0, "nothing threw on the book's filters", blew.join(" | "));
    await ctx.close();
  }

  // ── 33. targets and calls read as a ledger; a comparison says what it shows ──
  /* The 21 Sep 2026 redesign, held to what it promised:
   *   - every armed target row carries a figure column (the distance, one
   *     weight up from its label) beside the sentence — the number the panel
   *     is opened to read, not the fourth token of its second line;
   *   - the calls record is a scoreboard whose hit-rate tile names its `n`,
   *     and an open call carries a neutral track to its settlement;
   *   - while two coins share the chart, the row under the price names both
   *     lines in their own inks with where each stands, the gap between them
   *     and the two actions, and the chart prints the axis it is read
   *     against; Swap puts the compared coin on the chart, Stop ends it. */
  {
    const T = Date.now();
    const alerts = JSON.stringify([
      { id: "p1", coin: "BTC", kind: "price", direction: "above", target: 99999, currency: "USD", startPrice: 43000, createdAt: T - 86400e3 },
      { id: "p2", coin: "ETH", kind: "price", direction: "below", target: 1, currency: "USD", startPrice: 2400, createdAt: T - 3600e3 },
      { id: "h1", coin: "LTC", kind: "price", direction: "above", target: 80, currency: "USD", startPrice: 76, createdAt: T - 259200e3, triggeredAt: T - 7200e3, hitPrice: 80.4 },
    ]);
    const calls = JSON.stringify({
      record: { hits: 7, total: 11, streak: 2, best: 4 },
      done: [],
      open: [{ id: "o1", coin: "BTC", currency: "USD", period: "day", target: T + 5400e3, span: 3600e3, lo: 52000, hi: 52200, placed: T - 600e3, placedPrice: 43250 }],
    });
    const { ctx, page, errors } = await newCtx(browser,
      `localStorage.setItem("crypto_chart_onboarding_seen", "1");
       localStorage.setItem("crypto_chart_predict", "true");
       localStorage.setItem("crypto_chart_alerts", ${JSON.stringify(alerts)});
       localStorage.setItem("crypto_chart_calls", ${JSON.stringify(calls)});`,
      PRICES, 0, true);
    await page.keyboard.press("a");
    await page.waitForTimeout(700);
    const ledger = await page.evaluate(`(() => {
      const card = document.querySelector("[data-alerts-card]");
      const rows = Array.from(card.querySelectorAll("[data-alerts-card] > * > * > div")).filter((n) => /\\u2191|\\u2193/.test(n.innerText.slice(0, 2)));
      const figs = Array.from(card.querySelectorAll("*")).filter((n) => n.children.length === 2 && /^(AWAY|TO GO|HIT)$/i.test((n.children[1].innerText || "").trim()));
      return {
        rows: rows.length,
        figures: figs.map((n) => ({ value: n.children[0].innerText.trim(), label: n.children[1].innerText.trim(),
          heavier: Number(getComputedStyle(n.children[0]).fontWeight) > Number(getComputedStyle(n.children[1]).fontWeight),
          right: Math.round(n.getBoundingClientRect().right) })),
      };
    })()`);
    check(ledger.figures.length === 3, "every target row carries a figure in its own column",
      JSON.stringify(ledger.figures));
    check(ledger.figures.every((f) => f.heavier), "…one weight up from the label under it");
    check(new Set(ledger.figures.map((f) => f.right)).size === 1,
      "…and the figures share one right edge, so the column reads as a column",
      ledger.figures.map((f) => f.right).join(","));
    check(ledger.figures.some((f) => f.label === "HIT" && /80\.40/.test(f.value)),
      "a hit row's figure is the price it hit at", JSON.stringify(ledger.figures));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("k");
    await page.waitForTimeout(700);
    const board = await page.evaluate(`(() => {
      const card = document.querySelector("[data-alerts-card]");
      const score = card.querySelector("[role='group'][aria-label*='settled']");
      const tiles = score ? Array.from(score.children) : [];
      const tracks = Array.from(card.querySelectorAll("[title*='of the way to settlement']"));
      return {
        tiles: tiles.map((t) => t.innerText.replace(/\\s+/g, " ").trim()),
        meter: score ? Boolean(score.querySelector("[aria-hidden='true']")) : false,
        tracks: tracks.length,
        trackFill: tracks.length ? getComputedStyle(tracks[0].firstElementChild).backgroundColor : null,
        needs: Array.from(card.querySelectorAll("*")).some((n) => /^NEEDS$/.test((n.innerText || "").trim()) && n.previousElementSibling && /%/.test(n.previousElementSibling.innerText)),
      };
    })()`);
    check(board.tiles.length === 3 && /^64%/.test(board.tiles[0]) && /OF 11/.test(board.tiles[0]),
      "the record is a scoreboard whose hit rate names its n", JSON.stringify(board.tiles));
    check(board.meter, "…with a meter of that share under it");
    check(board.tracks === 1, "an open call carries a track to its settlement", `${board.tracks}`);
    check(board.needs, "…and its own figure column says what it needs");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    await page.keyboard.press("c");
    await page.waitForTimeout(400);
    await page.keyboard.type("eth");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2200);
    const strip = () => page.evaluate(`(() => {
      const s = document.querySelector("[data-compare-strip]");
      const legs = s ? Array.from(s.querySelectorAll("[data-compare-leg]")) : [];
      /* The price scale reads in percent while comparing (29 Sep 2026); the
         three in-plot ticks stood down for it. */
      const ticks = Array.from(document.querySelectorAll("[data-axes] text[data-axis-tick]"))
        .filter((t) => t.getAttribute("visibility") !== "hidden");
      const svgNode = ticks.length ? ticks[0].ownerSVGElement : null;
      const plotW = svgNode ? ${PLOT_BOX}(svgNode).w : null;
      return {
        there: Boolean(s),
        legs: legs.map((l) => ({ coin: l.children[1].innerText.trim(), value: l.children[2].innerText.trim(),
          ink: getComputedStyle(l.children[0]).backgroundColor })),
        gap: s ? /GAP [+-]/.test(s.innerText) : false,
        since: s ? /SINCE THE START OF/.test(s.innerText) : false,
        buttons: s ? Array.from(s.querySelectorAll("button")).map((b) => b.innerText.trim()) : [],
        stats: Boolean(document.querySelector("[data-compare-strip]") === null && document.body.innerText.includes("MKT CAP")),
        ticks: ticks.map((t) => ({ text: t.textContent, inGutter: plotW != null && Number(t.getAttribute("x")) > plotW })),
        lineInk: (() => { const p = document.querySelector("[data-compare] path:nth-of-type(2)"); return p ? p.getAttribute("stroke") : null; })(),
      };
    })()`);
    const on = await strip();
    check(on.there && on.legs.length === 2 && on.legs[0].coin === "BTC" && on.legs[1].coin === "ETH",
      "a comparison names both lines under the price", JSON.stringify(on.legs));
    check(on.legs.every((l) => /^[+-]\d+\.\d\d%$/.test(l.value)),
      "…each with where it stands since the range began", JSON.stringify(on.legs));
    check(on.legs[0].ink !== on.legs[1].ink, "…in two different inks");
    check(on.gap && on.since, "…with the gap between them and since when", on.gap + " " + on.since);
    check(on.buttons.includes("SWAP") && on.buttons.includes("STOP"), "…and the two things you can do about it", on.buttons.join(","));
    check(on.ticks.length >= 3 && on.ticks.every((t) => /%$/.test(t.text)) && on.ticks.some((t) => /^0(\.0+)?%$/.test(t.text)),
      "the chart prints the axis the comparison is read against, zero included", JSON.stringify(on.ticks));
    check(on.ticks.every((t) => t.inGutter),
      "…on the scale at the right edge, where the widget column cannot cover it", JSON.stringify(on.ticks));
    const swap = await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("[data-compare-strip] button")).find((n) => n.innerText.trim() === "SWAP"); if (!b) return false; b.click(); return true; })()`);
    await page.waitForTimeout(2200);
    const swapped = await strip();
    check(swap && swapped.there && swapped.legs[0].coin === "ETH" && swapped.legs[1].coin === "BTC",
      "Swap puts the compared coin on the chart and the chart's coin over it", JSON.stringify(swapped.legs));
    const stop = await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("[data-compare-strip] button")).find((n) => n.innerText.trim() === "STOP"); if (!b) return false; b.click(); return true; })()`);
    await page.waitForTimeout(600);
    const off = await strip();
    check(stop && !off.there, "Stop ends the comparison and gives the stats row back");
    check(errors.length === 0, "nothing threw across the ledger, the scoreboard and the strip", errors.join(" | "));
    await ctx.close();
  }

  // ── 33b. the first open: the panels say what is on the chart and step aside for the board ──
  /* A fresh profile. Targets' empty screen names the coin on the chart and
   * writes its example from that coin's price, and shows the price as a
   * fact; "Turn calls on" turns the board on **and closes the card**, since
   * the board is behind it; the on-and-empty screen offers the way there. */
  {
    const { ctx, page, errors } = await newCtx(browser,
      `localStorage.setItem("crypto_chart_onboarding_seen", "1");
       localStorage.setItem("crypto_chart_ticker_enabled", "true");`, PRICES, 0, true);
    await page.waitForTimeout(1500);
    await page.keyboard.press("a");
    await page.waitForTimeout(700);
    const first = await page.evaluate(`(() => {
      const card = document.querySelector("[data-alerts-card]");
      const text = card ? card.innerText : "";
      return { body: /BTC rises above \\$4\\d,\\d{3}/.test(text) && !/80,000/.test(text),
               fact: /BTC NOW/.test(text) };
    })()`);
    check(first.body, "the empty targets screen writes its example from the coin on the chart");
    check(first.fact, "…and shows where that coin stands as a fact");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("k");
    await page.waitForTimeout(700);
    const pressed = await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("[data-alerts-card] button")).find((n) => /Turn calls on/i.test(n.innerText)); if (!b) return false; b.click(); return true; })()`);
    await page.waitForTimeout(900);
    const after = await page.evaluate(`({
      card: Boolean(document.querySelector("[data-alerts-card]")),
      on: localStorage.getItem("crypto_chart_predict") === "true",
      board: Boolean(document.querySelector(".pt-now-grip")),
    })`);
    check(pressed && !after.card && after.on, "Turn calls on turns the board on and steps aside", JSON.stringify(after));
    check(after.board, "…and the board is there to point at");
    await page.keyboard.press("k");
    await page.waitForTimeout(700);
    const way = await page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("[data-alerts-card] button")).find((n) => /Go to the board/i.test(n.innerText)); if (!b) return false; b.click(); return true; })()`);
    await page.waitForTimeout(500);
    const gone = await page.evaluate(`Boolean(document.querySelector("[data-alerts-card]"))`);
    check(way && !gone, "the empty calls screen offers the way to the board, and it goes there");
    check(errors.length === 0, "nothing threw on a first open", errors.join(" | "));
    await ctx.close();
  }

  // ── 33c. a note, a span, a repeat; how sure; the record broken down (21 Sep 2026) ──
  {
    const T = Date.now();
    const DAY = 86400000;
    const alerts = JSON.stringify([
      { id: "n1", coin: "BTC", kind: "price", direction: "above", target: 99999, currency: "USD", startPrice: 43000,
        created: T - 3600e3, note: "breakout retest", keepFor: 7 * DAY, repeat: true, repeated: 2 },
      { id: "x1", coin: "ETH", kind: "price", direction: "below", target: 1, currency: "USD", startPrice: 2400,
        created: T - 10 * DAY, keepFor: DAY, expiredAt: T - 9 * DAY },
    ]);
    const calls = JSON.stringify({
      record: { hits: 2, total: 3, streak: 1, best: 2 },
      done: [
        { id: "d1", coin: "BTC", currency: "USD", period: "day", target: T - 7200e3, span: 3600e3, lo: 1, hi: 2, placed: T - 90000e3, result: "hit", settledPrice: 1.5, settledAt: T - 7000e3, confidence: "sure" },
        { id: "d2", coin: "ETH", currency: "USD", period: "hour", target: T - 8200e3, span: 3600e3, lo: 1, hi: 2, placed: T - 90000e3, result: "miss", settledPrice: 3, settledAt: T - 8000e3, confidence: "hunch" },
      ],
      open: [{ id: "o1", coin: "BTC", currency: "USD", period: "day", target: T + 5400e3, span: 3600e3, lo: 52000, hi: 52200, placed: T - 600e3, placedPrice: 43250 }],
    });
    const { ctx, page, errors } = await newCtx(browser,
      `localStorage.setItem("crypto_chart_onboarding_seen", "1");
       localStorage.setItem("crypto_chart_predict", "true");
       localStorage.setItem("crypto_chart_alerts", ${JSON.stringify(alerts)});
       localStorage.setItem("crypto_chart_calls", ${JSON.stringify(calls)});`,
      PRICES, 0, true);
    await page.keyboard.press("a");
    await page.waitForTimeout(700);
    const t = await page.evaluate(`(() => {
      const card = document.querySelector("[data-alerts-card]");
      const text = card.innerText;
      const r = card.getBoundingClientRect();
      return {
        note: /“breakout retest”/.test(text),
        repeats: /↻ 2/.test(text),
        expires: /expires in \\d+ days/.test(text),
        expiredSection: /EXPIRED/.test(text) && /Expired \\d+ days ago/.test(text),
        rearms: Array.from(card.querySelectorAll("button")).filter((b) => /re-arm/i.test(b.innerText)).length,
        options: Boolean(card.querySelector("input[aria-label='A note to yourself']")) &&
                 Boolean(card.querySelector("select[aria-label='Keep the target for']")) &&
                 Array.from(card.querySelectorAll("button")).some((b) => b.innerText.trim() === "repeat"),
        centred: Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2) < 40,
      };
    })()`);
    check(t.note && t.repeats && t.expires, "a target row carries its note, its repeat count and when it expires", JSON.stringify(t));
    check(t.expiredSection && t.rearms === 1, "an expired target sits in its own section with a way back", JSON.stringify(t));
    check(t.options, "the form offers a note, a span and repeat");
    /* Enter at the cap keeps the draft: ten targets, the box does not empty */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("k");
    await page.waitForTimeout(700);
    const k = await page.evaluate(`(() => {
      const card = document.querySelector("[data-alerts-card]");
      const text = card.innerText;
      const chips = Array.from(card.querySelectorAll("[role='group'][aria-label*='How sure'] button"));
      return {
        byConf: /BY CONFIDENCE/.test(text) && /sure 1 of 1/.test(text) && /hunch 0 of 1/.test(text),
        byCoin: /BY COIN/.test(text) && /BTC 1 of 1/.test(text),
        byRange: /BY RANGE/.test(text) && /1D 1 of 1/.test(text),
        chips: chips.map((b) => b.innerText.trim()),
        exportBtn: Array.from(card.querySelectorAll("button")).some((b) => b.innerText.trim() === "export"),
      };
    })()`);
    check(k.byConf && k.byCoin && k.byRange, "the record is broken down by confidence, coin and range, as counts", JSON.stringify(k));
    check(k.chips.join(",") === "hunch,likely,sure", "an open call offers three confidence chips", k.chips.join(","));
    check(k.exportBtn, "…and the record can be exported");
    await page.click("[data-alerts-card] [role='group'][aria-label*='How sure'] button:has-text('sure')");
    await page.waitForTimeout(400);
    const stored = await page.evaluate(`JSON.parse(localStorage.getItem("crypto_chart_calls")).open[0].confidence`);
    check(stored === "sure", "pressing a chip stamps the call", String(stored));
    await page.click("[data-alerts-card] [role='group'][aria-label*='How sure'] button:has-text('sure')");
    await page.waitForTimeout(400);
    const cleared = await page.evaluate(`JSON.parse(localStorage.getItem("crypto_chart_calls")).open[0].confidence`);
    check(cleared === null, "…and pressing it again takes it off", String(cleared));
    check(errors.length === 0, "nothing threw on the stamped panels", errors.join(" | "));
    await ctx.close();
  }

  // ── 34. the news reading room, the tone mark, the ask asked once, and Settings → Permissions ──
  /* 21 Sep 2026. From 1100px the news panel has a column beside the feed:
   * the wording tally, your coins with counts, every source with its age,
   * and the permission line. A row carries a tone mark that counts words
   * and names them; the filter narrows by it. The one-time ask has "Not
   * now", after which the panel shows one line pointing at Settings →
   * Permissions, where every permission has its reasons and each newsroom
   * origin is its own switch — requested one origin at a time. */
  {
    const T = Date.now();
    const rss = (items) => "<rss version=\"2.0\"><channel>" + items.map(([t, d, m]) =>
      "<item><title><![CDATA[" + t + "]]></title><link>https://news.bitcoin.com/" + m + "</link><pubDate>" +
      new Date(T - m * 60000).toUTCString() + "</pubDate><description><![CDATA[" + d + "]]></description></item>").join("") +
      "</channel></rss>";
    const BTC = rss([
      ["Bitcoin surges past $44,000 as ETF inflows hit record", "Spot ETFs recorded their largest inflow.", 25],
      ["Ethereum exploit drains $40 million from lending protocol", "A flash-loan attack.", 80],
      ["Regulator says it will not ban stablecoins", "Draft rules published.", 140],
    ]);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("news.bitcoin.com")) return r.fulfill({ status: 200, contentType: "application/rss+xml",
        headers: { "access-control-allow-origin": "*" }, body: BTC });
      if (u.includes("hn.algolia.com")) return r.fulfill(json({ hits: [] }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      window.chrome = window.chrome || {}; window.chrome.runtime = window.chrome.runtime || {};
      window.__held = [];
      window.__requests = [];
      window.chrome.permissions = {
        contains: (o, cb) => cb((o.origins || o.permissions || []).every((x) => window.__held.includes(x))),
        request: (o, cb) => { window.__requests.push(o); (o.origins || o.permissions || []).forEach((x) => window.__held.push(x)); cb(true); },
        remove: (o, cb) => { window.__held = window.__held.filter((x) => !(o.origins || o.permissions || []).includes(x)); cb(true); },
      };
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_news_ticker_enabled", "false");
      localStorage.removeItem("crypto_chart_news_cache");
      localStorage.removeItem("crypto_chart_news_ask_seen");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.keyboard.press("n");
    await page.waitForTimeout(2500);
    const room = await page.evaluate(`(() => {
      const c = document.querySelector('[role="dialog"][aria-label="News"]');
      const aside = c.querySelector("[data-news-aside]");
      const visible = (n) => n && getComputedStyle(n).display !== "none";
      const tones = [...c.querySelectorAll("[data-news-row-tone]")].map((n) => n.getAttribute("data-news-row-tone"));
      const flipped = [...c.querySelectorAll("[data-news-row-tone]")].find((n) => /not ban/.test(n.getAttribute("title") || ""));
      return {
        wide: c.getBoundingClientRect().width > 1100,
        aside: visible(aside),
        tally: aside ? aside.innerText.replace(/\\s+/g, " ") : "",
        tones,
        flipped: Boolean(flipped),
        askVisible: [...c.querySelectorAll("button")].filter((b) => /Turn on full sources/i.test(b.textContent) && visible(b.closest("[data-news-aside]") || b)).length,
        notNow: [...c.querySelectorAll("button")].some((b) => /Not now/i.test(b.textContent)),
      };
    })()`);
    check(room.wide && room.aside, "at 1280px the news panel is a reading room with a column beside the feed", JSON.stringify({ wide: room.wide, aside: room.aside }));
    check(/WORDING · 3 STORIES/.test(room.tally) && /2 WORDED UP/.test(room.tally.replace(/\n/g, " ")) || /2\s+WORDED UP/.test(room.tally),
      "the column counts the wording of what is on screen", room.tally.slice(0, 120));
    check(room.tones.length === 3 && room.tones.filter((t) => t === "up").length === 2 && room.tones.includes("down"),
      "every row carries a tone mark that counts words", room.tones.join(","));
    check(room.flipped, "…and a word after a negator is flipped and named", "no 'not ban' in any title");
    check(/Bitcoin\.com\s+25m/.test(room.tally), "…and every source is listed with its age", room.tally.slice(-200));
    await page.click("[data-news-tone='down']");
    await page.waitForTimeout(400);
    const narrowed = await page.evaluate(`document.querySelectorAll('[role="dialog"][aria-label="News"] a[target=_blank]').length`);
    check(narrowed === 1, "the wording filter narrows the list", String(narrowed));
    await page.click("[data-news-tone='any']");
    check(room.notNow && room.askVisible >= 1, "the one-time ask offers Not now", JSON.stringify({ notNow: room.notNow, ask: room.askVisible }));
    await page.click("[data-news-aside] >> text=Not now");
    await page.waitForTimeout(400);
    const after = await page.evaluate(`(() => {
      const c = document.querySelector('[role="dialog"][aria-label="News"]');
      return {
        ask: [...c.querySelectorAll("button")].some((b) => /Turn on full sources/i.test(b.textContent)),
        line: /newsrooms need a permission/i.test(c.innerText),
        seen: localStorage.getItem("crypto_chart_news_ask_seen") === "true",
      };
    })()`);
    check(!after.ask && after.line && after.seen, "…after which the ask is gone for good and one quiet line points at Settings", JSON.stringify(after));
    await page.click("[data-news-aside] >> text=Settings → Permissions");
    await page.waitForTimeout(900);
    const tab = await page.evaluate(`(() => {
      const t = document.querySelector("[data-permissions-tab]");
      if (!t) return null;
      return {
        rows: [...t.querySelectorAll("[data-perm-row]")].map((r) => r.getAttribute("data-perm-row")),
        origins: [...t.querySelectorAll("[data-perm-origin]")].length,
        states: [...t.querySelectorAll("[data-perm-state]")].map((s) => s.getAttribute("data-perm-state")),
        ip: /no proxy and no server of ours/i.test(t.innerText),
        news: /newsroom/i.test(t.innerText) && /Chrome notification/.test(t.innerText),
      };
    })()`);
    check(tab && tab.rows.join(",") === "notifications,newsrooms,everything-else", "the news panel's line opens Settings → Permissions", tab ? tab.rows.join(",") : "no tab");
    check(tab && tab.origins === JSON.parse(require("fs").readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")).optional_host_permissions.length && tab.states.every((s) => s === "off"), "…with every newsroom origin as its own switch, all off", tab ? JSON.stringify(tab.states) : "");
    check(tab && tab.ip, "…and it says in words that there is no proxy and no server");
    await page.click("[data-perm-origin='decrypt'] button");
    await page.waitForTimeout(700);
    const one = await page.evaluate(`({
      asked: window.__requests.map((o) => (o.origins || []).join("|")),
      active: [...document.querySelectorAll("[data-perm-origin='decrypt'] [data-perm-state]")].map((s) => s.getAttribute("data-perm-state")),
      count: (document.querySelector("[data-perm-count]") || {}).textContent,
    })`);
    check(one.asked.length === 1 && one.asked[0] === "https://decrypt.co/*", "one newsroom's switch asks Chrome for that origin alone", JSON.stringify(one.asked));
    const origins = JSON.parse(require("fs").readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")).optional_host_permissions.length;
    check(one.active[0] === "active" && new RegExp(`^1 of ${origins}$`).test(one.count || ""), "…and the row reads Active, one of every newsroom the manifest declares", JSON.stringify(one));
    await page.click("[data-perm-origin='decrypt'] button");
    await page.waitForTimeout(700);
    const back = await page.evaluate(`[...document.querySelectorAll("[data-perm-origin='decrypt'] [data-perm-state]")].map((s) => s.getAttribute("data-perm-state"))`);
    check(back[0] === "off", "…and the same switch takes it back", back.join(","));
    check(errors.length === 0, "nothing threw across the reading room and the permissions tab", errors.join(" | "));
    await ctx.close();
  }

  // ── 34b. a host that says slow down: the card says paused, and so does the tab ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let fngAsked = 0;
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("alternative.me")) { fngAsked += 1; return r.fulfill({ status: 429, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" }); }
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      window.chrome = window.chrome || {}; window.chrome.runtime = window.chrome.runtime || {};
      window.chrome.permissions = { contains: (o, cb) => cb(false), request: (o, cb) => cb(false), remove: (o, cb) => cb(false) };
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_widgets", JSON.stringify({ fearGreed: true }));
      localStorage.removeItem("crypto_chart_widget_cache");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await openWidgets(page);
    await page.waitForTimeout(2500);
    const card = await page.evaluate(`(() => {
      const n = document.querySelector("[data-widget-paused]");
      return { paused: Boolean(n), text: n ? n.innerText : (document.body.innerText.match(/Couldn.t load this one/) || [""])[0] };
    })()`);
    check(card.paused && /Paused/.test(card.text), "a card whose host answered 429 says paused, with the wait", JSON.stringify(card));
    const askedBefore = fngAsked;
    await page.keyboard.press("r");
    await page.waitForTimeout(1500);
    check(fngAsked === askedBefore, "…and a refresh does not ask that host again while it waits", `${fngAsked} vs ${askedBefore}`);
    await page.keyboard.press("s");
    await page.waitForTimeout(600);
    await page.click("[data-tab='permissions']");
    await page.waitForTimeout(600);
    const tab = await page.evaluate(`(document.querySelector("[data-perm-paused]") || {}).innerText || ""`);
    check(/Paused right now: api\.alternative\.me/.test(tab), "…and Settings → Permissions names the host and the wait", tab);
    check(errors.length === 0, "nothing threw while a host was cooling", errors.join(" | "));
    await ctx.close();
  }

  /* §38 — Settings is the screen, and a dependent row is a row.
   *
   * Two reports on one tab (21 Sep 2026): "the News Headlines part is broken,
   * fallen on top of itself and not on the left", and "make Settings full
   * screen too". The first was three defects in one block: the reveal that
   * holds a dependent row had a fixed max-height (8rem) and the block was
   * 14rem, so its description was cut and the "Show" dropdown drew under the
   * next setting; the reveal laid each child out as a two-column grid, so a
   * bare ToggleRow's switch landed at the *start* of the control lane, 240px
   * left of every other switch; and the revealed label was centred in its
   * column. Each is asserted by geometry against the row above it, because
   * "in the lane" means "where the parent's control is" and nothing else.
   *
   * The second half: the default size is the window minus a rim, the coins
   * tab and the widget list go into two panes there, and a phone gets one
   * column and a lane sized to its control. */
  {
    const SEED = `
      window.chrome = window.chrome || {}; window.chrome.runtime = window.chrome.runtime || {};
      window.chrome.permissions = { contains: (o, cb) => cb(false), request: (o, cb) => cb(false), remove: (o, cb) => cb(false) };
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_rate_prompt_shown", "1");
      localStorage.setItem("crypto_chart_page_ticker_enabled", "true");
      localStorage.setItem("crypto_chart_news_ticker_enabled", "true");
      localStorage.setItem("crypto_chart_news_filter", "coins");
      localStorage.setItem("crypto_chart_widgets", JSON.stringify({ fearGreed: true, watchlist: true }));
    `;
    /* A group heading (h4) carries its chevron as a child, so it is matched on
       its text alone; everything else must be a leaf, or a wrapper's bubbling
       textContent answers for the row. */
    const BY_TEXT = `(text) => Array.from(document.querySelectorAll("label, span, div, h3, h4")).find(
      (n) => (n.childElementCount === 0 || n.tagName === "H4") && (n.textContent || "").trim() === text)`;
    const RECT = `(n) => { if (!n) return null; const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }`;
    const openTickers = async (page) => {
      await page.keyboard.press("s");
      await page.waitForTimeout(600);
      /* Its section in the menu since 26 Sep 2026; it was a chip. */
      await page.click("[data-pref-group='tabTickers']");
      await page.waitForTimeout(900);
    };
    const boot = async (viewport) => {
      const ctx = await browser.newContext({ viewport });
      await ctx.route("**/*", (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
        if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
        return r.fulfill(json({ data: {} }));
      });
      await ctx.addInitScript(SEED);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(1500);
      return { ctx, page, errors };
    };

    // ── the desk, 1280 wide ──
    {
      const { ctx, page, errors } = await boot({ width: 1280, height: 800 });
      await openTickers(page);
      const geo = await page.evaluate(`(() => {
        const byText = ${BY_TEXT}; const rect = ${RECT};
        /* **The Settings card's own heading, not the first h2 in the page.**
           The chart-settings drawer carries an h2 too and is mounted from the
           start, so a blind querySelector for h2 measured a 302x38 box off the
           right edge and called it the settings panel. No backticks in here:
           this comment lives inside a template literal and one pair of them
           ends it. That is three times in one day. */
        const card = document.querySelector("[data-settings-card]");
        const tickerSwitch = document.querySelector("button[aria-label='Toggle page ticker']");
        const newsSwitch = document.querySelector("button[aria-label='Toggle news headlines row']");
        const position = document.querySelector("select[aria-label='Price ticker bar position']");
        const show = document.querySelector("select[aria-label='Which headlines the news row carries']");
        const title = byText("Price Ticker Bar");
        const posLabel = byText("Position");
        const desc = Array.from(document.querySelectorAll("div")).find((n) => /^Headlines come from public feeds/.test((n.textContent || "").trim()) && n.childElementCount === 0);
        const nextTitle = byText("Browser Tab Title");
        const reveals = Array.from(document.querySelectorAll("[data-reveal-open='true']")).map((n) => ({ sh: n.scrollHeight, ch: n.clientHeight, mh: n.style.maxHeight }));
        return {
          card: rect(card), win: { w: innerWidth, h: innerHeight },
          tickerSwitch: rect(tickerSwitch), newsSwitch: rect(newsSwitch), position: rect(position), show: rect(show),
          title: rect(title), posLabel: rect(posLabel), desc: rect(desc), nextTitle: rect(nextTitle),
          descText: desc ? desc.textContent : "", reveals,
        };
      })()`);
      /* The window, less the screens' column that stands beside every open
         screen since 26 Sep 2026 — and no rim, and no second size. */
      check(geo.card && geo.card.w >= geo.win.w - 40 && geo.card.h >= geo.win.h - 2,
        "Settings is the window, beside the screens' column", JSON.stringify({ card: geo.card, win: geo.win }));
      check(geo.newsSwitch && geo.tickerSwitch && Math.abs(geo.newsSwitch.r - geo.tickerSwitch.r) <= 2,
        "the News Headlines switch ends where the Price Ticker Bar switch ends", JSON.stringify({ news: geo.newsSwitch, ticker: geo.tickerSwitch }));
      check(geo.show && geo.position && Math.abs(geo.show.r - geo.position.r) <= 2,
        "…and the Show dropdown ends where the Position dropdown ends", JSON.stringify({ show: geo.show, position: geo.position }));
      check(geo.posLabel && geo.title && geo.posLabel.l >= geo.title.l && geo.posLabel.l <= geo.title.l + 24,
        "the Position label sits on the left edge, indented once under its setting", JSON.stringify({ posLabel: geo.posLabel, title: geo.title }));
      check(geo.desc && geo.nextTitle && geo.desc.b <= geo.nextTitle.t && geo.show.b <= geo.nextTitle.t,
        "the disclosure and the Show row sit above the next setting rather than under it", JSON.stringify({ desc: geo.desc, show: geo.show, next: geo.nextTitle }));
      check(geo.reveals.length >= 3 && geo.reveals.every((r) => r.sh <= r.ch + 1),
        "no open reveal clips its own content", JSON.stringify(geo.reveals));

      // A shut reveal hands nothing to the Tab key
      await page.selectOption("select[aria-label='Which headlines the news row carries']", "all");
      await page.waitForTimeout(800);
      const shut = await page.evaluate(`(() => {
        const closed = Array.from(document.querySelectorAll("[data-reveal-open='false']"));
        return {
          count: closed.length,
          hidden: closed.filter((n) => getComputedStyle(n).visibility === "hidden").length,
          reachable: closed.reduce((k, n) => k + Array.from(n.querySelectorAll("button, select, input")).filter((c) => c.checkVisibility({ checkVisibilityCSS: true })).length, 0),
        };
      })()`);
      check(shut.count >= 1 && shut.hidden === shut.count && shut.reachable === 0,
        "a shut dependent row is hidden and exposes no control", JSON.stringify(shut));

      // Two panes on the coins tab, two columns on the widgets tab
      await page.click("[data-tab='coins']");
      await page.waitForTimeout(500);
      const panes = await page.evaluate(`(() => { const rect = ${RECT}; return { list: rect(document.querySelector("[data-coin-pane='list']")), add: rect(document.querySelector("[data-coin-pane='add']")) }; })()`);
      check(panes.list && panes.add && panes.add.l > panes.list.r && Math.abs(panes.add.t - panes.list.t) <= 2,
        "at full screen the coin list and the add box sit side by side", JSON.stringify(panes));
      /* The widget groups filled two columns here until 26 Sep 2026, when
         the widgets' switches moved into their own drawer. */
      check(!(await page.$("[data-tab='widgets']")),
        "…and Widgets is not a Settings tab: its switches are in its drawer");
      check(errors.length === 0, "nothing threw on the full-screen settings", errors.join(" | "));
      await ctx.close();
    }

    // ── the phone, 420 wide ──
    {
      const { ctx, page, errors } = await boot({ width: 420, height: 900 });
      await openTickers(page);
      const geo = await page.evaluate(`(() => {
        const byText = ${BY_TEXT}; const rect = ${RECT};
        /* **The Settings card's own heading, not the first h2 in the page.**
           The chart-settings drawer carries an h2 too and is mounted from the
           start, so a blind querySelector for h2 measured a 302x38 box off the
           right edge and called it the settings panel. No backticks in here:
           this comment lives inside a template literal and one pair of them
           ends it. That is three times in one day. */
        const card = document.querySelector("[data-settings-card]");
        const tickerSwitch = document.querySelector("button[aria-label='Toggle page ticker']");
        const newsSwitch = document.querySelector("button[aria-label='Toggle news headlines row']");
        const title = byText("Price Ticker Bar");
        const long = byText("Announce Targets In The Tab Title");
        const position = document.querySelector("select[aria-label='Price ticker bar position']");
        return { card: rect(card), win: { w: innerWidth }, tickerSwitch: rect(tickerSwitch), newsSwitch: rect(newsSwitch), title: rect(title), long: rect(long), position: rect(position) };
      })()`);
      check(geo.card && geo.card.w >= geo.win.w - 42, "the phone gets the screen too", JSON.stringify({ card: geo.card, win: geo.win }));
      /* The title is inline, so its width is its words' width; the line count
         is the height. One line of 0.85rem type is under 20px. */
      check(geo.title && geo.title.w >= 100 && geo.title.h < 24,
        "a switch row's title keeps its words on one line at 420px", JSON.stringify(geo.title));
      check(geo.long && geo.long.h < 60,
        "…and the longest title takes at most two lines", JSON.stringify(geo.long));
      check(geo.newsSwitch && geo.tickerSwitch && Math.abs(geo.newsSwitch.r - geo.tickerSwitch.r) <= 2,
        "the dependent switch is still in the lane on the phone", JSON.stringify({ news: geo.newsSwitch, ticker: geo.tickerSwitch }));
      check(geo.position && geo.position.w >= 130 && geo.position.r <= geo.card.r,
        "a dropdown keeps a lane wide enough to read its value", JSON.stringify({ position: geo.position, card: geo.card }));
      /* On a phone the menu is a row over the section rather than a column
         beside it: 420px has no room for both side by side. */
      const stack = await page.evaluate(`(() => { const rect = ${RECT};
        return { nav: rect(document.querySelector("[data-settings-card] nav")),
          pane: rect(document.querySelector("[data-settings-section]")) }; })()`);
      check(stack.nav && stack.pane && stack.nav.b <= stack.pane.t + 1 && stack.pane.w >= geo.win.w - 40,
        "on the phone the menu sits above the section, which takes the width", JSON.stringify(stack));
      check(errors.length === 0, "nothing threw on the phone", errors.join(" | "));
      await ctx.close();
    }
  }

  /* §39 — market structure under the crowd reading: three readings, each
   * with its counts and denominators, and no lean while the record is thin.
   *
   * The block is the crowd reading's rule on Bybit's funding and open
   * interest (and their pair). What can go wrong quietly: a series that did
   * not align with the closes and rendered nothing; a lean drawn on a record
   * under the floor; a count printed without the "of N" beside it. The
   * fixture gives about 107 days of funding, so every state is thin — which
   * is the case that must refuse to lean. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const DAY = 86400e3;
    const today = Math.floor(Date.now() / DAY) * DAY;
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("account-ratio") && u.includes("period=1d"))
        return r.fulfill(json({ retCode: 0, result: { list: Array.from({ length: 500 }, (_, i) => ({ buyRatio: String(0.5 + 0.2 * Math.sin(i / 3)), sellRatio: "0.5", timestamp: String(today - i * DAY) })) } }));
      if (u.includes("market/kline"))
        return r.fulfill(json({ retCode: 0, result: { list: Array.from({ length: 500 }, (_, i) => { const c = String(40000 + 3000 * Math.sin(i / 9)); return [String(today - i * DAY), c, c, c, c, "1", "1"]; }) } }));
      if (u.includes("funding/history")) {
        const m = u.match(/endTime=(\d+)/);
        const end = m ? Number(m[1]) : Date.now();
        return r.fulfill(json({ retCode: 0, result: { list: Array.from({ length: m ? 120 : 200 }, (_, i) => ({ symbol: "BTCUSDT", fundingRate: String(0.0001 * (1 + Math.sin((end - i * 8 * 3600e3) / 864000e3)) + (!m && i < 3 ? 0.0006 : 0)), fundingRateTimestamp: String(end - (i + 1) * 8 * 3600e3) })) } }));
      }
      if (u.includes("open-interest?category=linear")) {
        const paged = u.includes("cursor=");
        return r.fulfill(json({ retCode: 0, result: { list: Array.from({ length: 200 }, (_, i) => ({ openInterest: String(50000 + 5000 * Math.sin(i / 7) + (!paged && i === 0 ? 9000 : 0)), timestamp: String(today - ((paged ? 200 : 0) + i) * DAY) })), nextPageCursor: paged ? "" : "p2" } }));
      }
      if (u.includes("public/instruments")) return r.fulfill(json({ code: "0", data: [{ instId: "BTC-USDT-SWAP", ctVal: "0.01", settleCcy: "USDT", state: "live" }] }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_practice_enabled", "true");
      localStorage.setItem("crypto_chart_practice_consent", "true");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(2500);
    await page.evaluate(`(() => { const t = Array.from(document.querySelectorAll("[data-practice-readings-card] button")).find((b) => /^Crowd$/i.test(b.innerText.trim())); t.click(); })()`);
    await page.waitForTimeout(1200);
    const read = await page.evaluate(`(() => {
      const block = document.querySelector("[data-practice-structure='readings']");
      const items = Array.from(document.querySelectorAll("[data-practice-structure-lean]"));
      return {
        block: Boolean(block),
        crowdFirst: (() => { const c = document.querySelector("[data-practice-crowd]"); return Boolean(c && block && c.getBoundingClientRect().bottom <= block.getBoundingClientRect().top + 1); })(),
        items: items.map((n) => ({
          key: n.getAttribute("data-practice-structure"),
          lean: n.getAttribute("data-practice-structure-lean"),
          pill: (n.querySelector("[data-practice-lean]") || {}).innerText || "",
          record: (n.querySelector("[data-practice-structure-record]") || {}).innerText || "",
          fall: (n.querySelector("[data-practice-structure-fall]") || {}).innerText || "",
          text: n.innerText,
        })),
      };
    })()`);
    check(read.block, "the market-structure block is on the Crowd tab", JSON.stringify(read).slice(0, 200));
    check(read.crowdFirst, "…under the crowd reading, not above it");
    check(read.items.length === 3 && read.items.map((i) => i.key).join(",") === "funding,oi,joint",
      "…with the three readings in order: funding, open interest, the pair", read.items.map((i) => i.key).join(","));
    const counted = read.items.filter((i) => /After the last \d+ times/.test(i.record) && /\d+ of \d+, against \d+ of \d+/.test(i.fall));
    check(counted.length >= 2, "a counted reading prints its record and its fall count with both denominators", JSON.stringify(read.items.map((i) => [i.record.slice(0, 40), i.fall])));
    /* The pill is uppercased by CSS, so innerText reads "NO LEAN". */
    check(read.items.every((i) => i.lean === "none" && /no lean/i.test(i.pill)),
      "…and none of them leans on a record under the floor", JSON.stringify(read.items.map((i) => [i.key, i.lean, i.pill])));
    check(read.items.every((i) => /fifth of the last 60 days|middle of the last 60 days|middle of its range/.test(i.text)),
      "…each saying where today sits against its own window");
    check(errors.length === 0, "nothing threw on the structure readings", errors.join(" | "));
    await ctx.close();
  }

  /* §40 — the candle chart, drawn the way a venue draws one.
   *
   * Three things were wrong and none of them threw: every wick was a stroked
   * line at a fractional x, so the browser spread one pixel of ink over two
   * columns and the whole chart read as a grey smear; the volume band was
   * drawn over the last fifth of the bars, in the same two inks; and there
   * was no way to read a price off the plot at all. The first is asserted on
   * the path data (integers only), the second on geometry (no body reaches
   * the band), the third on the tag — which has to be *beside* the bars,
   * never over them, and has to stand down when the board owns the right
   * edge. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const T = Math.floor(Date.now() / 1000);
    /* Real-shaped candles: a walk with wicks either side, and volume, so the
       band has something to draw and the bars have highs and lows. */
    const OHLC = Array.from({ length: 120 }, (_, i) => {
      const base = 43000 + Math.sin(i / 7) * 900 + i * 4;
      const open = base;
      const close = base + (i % 3 === 0 ? -120 : 140);
      return [T - (120 - i) * 3600, Math.min(open, close) - 90, Math.max(open, close) + 90, open, close, 40 + (i % 9) * 10];
    }).reverse();
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("/candles")) return r.fulfill(json(OHLC));
      if (u.includes("historic"))
        return r.fulfill(json({ data: { prices: OHLC.slice().reverse().map((c) => ({ price: String(c[4]), time: c[0] })) } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: String(OHLC[0][4]), currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_chart_type", "candles");
      localStorage.setItem("crypto_chart_period", "day");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);
    // The candles are fetched on first hover, like the crosshair's
    await page.mouse.move(600, 420);
    await page.waitForTimeout(2500);

    const READ = `(() => {
      const layers = Array.from(document.querySelectorAll("[data-candles]"));
      const shown = layers.find((l) => Number(l.getAttribute("opacity")) > 0.5);
      const paths = shown ? Array.from(shown.querySelectorAll("path")) : [];
      const d = paths.slice(2).map((p) => p.getAttribute("d") || "").join("");
      const vol = paths.slice(0, 2).map((p) => p.getAttribute("d") || "").join("");
      const rects = [...d.matchAll(/M(-?[\\d.]+) (-?[\\d.]+)h(-?[\\d.]+)v(-?[\\d.]+)/g)]
        .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
      const volRects = [...vol.matchAll(/M(-?[\\d.]+) (-?[\\d.]+)h(-?[\\d.]+)/g)]
        .map((m) => ({ x: +m[1], y: +m[2] }));
      return {
        bars: rects.length,
        fractional: rects.filter((r) => r.x % 1 !== 0 || r.y % 1 !== 0 || r.w % 1 !== 0 || r.h % 1 !== 0).length,
        lowestBar: rects.length ? Math.max(...rects.map((r) => r.y + r.h)) : null,
        volumeTop: volRects.length ? Math.min(...volRects.map((r) => r.y)) : null,
        rightmostBar: rects.length ? Math.max(...rects.map((r) => r.x + r.w)) : null,
        tag: ${AXIS_TAG},
      };
    })()`;
    const read = await page.evaluate(READ);
    check(read.bars >= 40, "the candle chart draws its bars", `${read.bars} rectangles`);
    check(read.fractional === 0,
      "every candle edge lands on a pixel, so no wick is drawn across two columns at half strength",
      `${read.fractional} fractional of ${read.bars}`);
    check(read.volumeTop != null && read.lowestBar != null && read.lowestBar <= read.volumeTop,
      "…and the price stops above the volume band instead of being drawn through it",
      JSON.stringify({ lowestBar: read.lowestBar, volumeTop: read.volumeTop }));
    check(read.tag && /[0-9]/.test(read.tag.text), "the last close is named at the right edge", JSON.stringify(read.tag));
    check(read.tag && read.rightmostBar != null && read.tag.x >= read.rightmostBar,
      "…in a gutter of its own, never over the most recent candles",
      JSON.stringify({ tagX: read.tag && read.tag.x, rightmostBar: read.rightmostBar }));

    /* The board owns the right edge and marks the live price with its own
       dot, so the tag stands down — the rule the grid and the travel band
       already follow. */
    await page.keyboard.press("l");
    await page.waitForTimeout(900);
    const onBoard = await page.evaluate(`${AXIS_TAG} ? "visible" : "hidden"`);
    check(onBoard === "hidden", "with the board up the tag stands down", onBoard);
    await page.keyboard.press("l");
    await page.waitForTimeout(900);
    const back = await page.evaluate(`${AXIS_TAG} ? "visible" : "hidden"`);
    check(back === "visible", "…and comes back when the board goes", back);
    check(errors.length === 0, "nothing threw across the candle chart", errors.join(" | "));
    await ctx.close();
  }

  /* §41 — candlestick patterns, named and then counted.
   *
   * Asked for after a video that named a shape, showed a chart where it
   * worked, and called it an entry. The honest version is the one this panel
   * was already built for: name the shape, then print what followed the last
   * times it appeared, with its denominator. The three things that would
   * quietly betray that — a row with a rate and no count, a claim printed as
   * a finding rather than as folklore, and a comparison drawn on a handful of
   * episodes — are what this asserts.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    const DAY = 86400;
    const TODAY = Math.floor(Date.now() / 1000 / DAY) * DAY;
    /* 900 days of a plain walk, and then two candles forced into a bullish
       engulfing so the "today" branch has something to name. Deterministic:
       a pattern found in random data would make this pass by luck. */
    const DEEP = (() => {
      const out = [];
      let p = 30000;
      for (let i = 900; i >= 0; i--) {
        const open = p;
        const close = p * (1 + Math.sin(i / 9) * 0.02);
        const high = Math.max(open, close) * 1.01;
        const low = Math.min(open, close) * 0.99;
        out.push([TODAY - i * DAY, low, high, open, close, 100]);
        p = close;
      }
      const n = out.length;
      const base = out[n - 3][4];
      out[n - 2] = [out[n - 2][0], base * 0.95, base * 1.005, base, base * 0.96, 100];
      out[n - 1] = [out[n - 1][0], base * 0.945, base * 1.05, base * 0.958, base * 1.04, 100];
      return out.reverse(); // the endpoint answers newest first
    })();
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("granularity=86400")) {
        const m = u.match(/start=([^&]+)&end=([^&]+)/);
        const from = m ? Date.parse(decodeURIComponent(m[1])) / 1000 : 0;
        const to = m ? Date.parse(decodeURIComponent(m[2])) / 1000 : TODAY;
        return r.fulfill(json(DEEP.filter((c) => c[0] > from && c[0] <= to).slice(0, 300)));
      }
      if (u.includes("historic"))
        return r.fulfill(json({ data: { prices: DEEP.slice(0, 120).reverse().map((c) => ({ price: String(c[4]), time: c[0] })) } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: String(DEEP[0][4]), currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.removeItem("crypto_chart_daily_closes");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.keyboard.press("b");
    // The deep series pages backwards with a gap between requests
    await page.waitForTimeout(9000);

    const read = await page.evaluate(`(() => {
      const label = document.querySelector("[data-base-patterns]");
      if (!label) return { section: false };
      const body = label.parentElement;
      const after = [];
      let node = label.nextElementSibling;
      while (node) { after.push(node); node = node.nextElementSibling; }
      /* A pattern this coin's history has never shown renders no row at all —
         there is nothing to count — so the rows are the ones carrying a
         count, singular or plural. */
      const rows = after.filter((n) => /[0-9]+ times|(^|[^0-9])1 time([^s]|$)/.test(n.innerText || ""));
      return {
        section: true,
        label: label.innerText,
        intro: after.length ? after[0].innerText : "",
        rows: rows.map((n) => n.innerText),
        bodyText: body.innerText,
      };
    })()`);
    check(read.section, "the base-rate panel carries a candlestick section");
    check(/daily/i.test(read.label),
      "…and says the shapes are read off the daily candle, whatever range the chart is on",
      read.label);
    check(/engulfing/i.test(read.intro),
      "today's candle is named at the top of the section", read.intro.slice(0, 160));
    check(read.rows.length >= 6, "the shapes this history has shown each get a row", read.rows.length);
    check(/shapes this panel looks for|What followed the last times/.test(read.intro),
      "…and the sentence above them does not promise rows that are not there", read.intro.slice(0, 200));
    /* The rule the whole panel rests on: no rate without its denominator. */
    const withRate = read.rows.filter((t) => /% of the time/.test(t));
    check(withRate.length >= 5 && withRate.every((t) => /\d+ episodes|1 episode/.test(t)),
      "no row prints a rate without the count behind it",
      JSON.stringify(withRate.filter((t) => !/episodes|episode/.test(t)).slice(0, 2)));
    /* And a thin row refuses the comparison instead of dressing it up. */
    check(/too few to compare/.test(read.bodyText),
      "a shape with too little history says so rather than printing a difference");
    check(/said to/i.test(read.bodyText),
      "each shape carries what it is *said* to mean, as a claim and not as a finding");
    check(!/\b(buy|sell|enter|entry|target)\b/i.test(read.bodyText),
      "nothing on the panel tells anybody to do anything",
      (read.bodyText.match(/\b(buy|sell|enter|entry|target)\b/i) || [""])[0]);
    check(errors.length === 0, "nothing threw across the pattern section", errors.join(" | "));
    await ctx.close();
  }

  /* §42 — the chart's settings, beside the chart.
   *
   * The drawer exists for one reason: a panel that covers the chart cannot
   * show you what you just changed, and nine of these settings change the
   * chart. So the claim under test is not "a drawer opens" — it is **the
   * chart is still there and still redraws while you flip a switch in it**.
   * Three ways that could quietly fail: a scrim behind the drawer dimming
   * the chart, the corner controls printing themselves over its head (they
   * are drawn above it on purpose so they stay reachable), and the rows
   * drifting from the Settings tab's because somebody copied them instead of
   * sharing the definition.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1");`);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);

    const shut = await page.evaluate(
      `(() => { const d = document.querySelector("[data-chart-settings]"); return d ? d.getAttribute("data-chart-settings") : "missing"; })()`,
    );
    check(shut === "shut", "the drawer is mounted and shut on a fresh tab", shut);
    /* The opener is its folder tab on the left edge since 25 Sep 2026 — it
       spent a few hours at the end of the range row, where it read as a
       seventh range, and two days as a corner control. */
    /* The section's own viewport, for the side test below. */
    const window0Width = (page.viewportSize() || { width: 1280 }).width;
    const opener = await page.evaluate(`(() => {
      const b = document.querySelector("[data-drawer-tab='chart']");
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const ranges = [...document.querySelectorAll("button")]
        .filter((n) => /^(1H|1D|1W|1M|1Y|ALL)$/.test((n.innerText || "").trim()))
        .map((n) => n.getBoundingClientRect());
      const all = ranges[ranges.length - 1];
      return {
        top: Math.round(r.top),
        right: Math.round(innerWidth - r.right),
        left: Math.round(r.left),
        besideAll: Boolean(all && Math.abs(r.top - all.top) < 20),
      };
    })()`);
    check(opener, "the drawer has an opener");
    check(opener && !opener.besideAll,
      "…and it is not beside ALL on the range row", JSON.stringify(opener));
    /* **The left corner, since 23 Sep 2026.** The chrome is sorted by what a
       press does: this one changes what the chart shows, so it leads the
       chart group at the left edge rather than sitting among the screens on
       the right. */
    /* **In the corner its drawer opens from**, which is the left one since
       24 Sep 2026 — every control that opens a drawer is on the edge the
       drawer arrives at, so a press on one side never produces a panel on
       the other. Asserted as *the same side as the drawer* rather than as a
       named corner, so the pair cannot drift apart again: this check has
       been rewritten twice for a move it could have measured. */
    /* **No longer "up in the corner"** (26 Sep 2026): the opener is the
       second tab on the spine, which hangs from the top, so its own top is
       the first tab's height below that. What is left of the rule is the
       side, and that is what was always meant. */
    const drawerSide = await page.evaluate(`(() => {
      const d = document.querySelector("[data-chart-settings]");
      const r = d.getBoundingClientRect();
      return r.left < window.innerWidth - r.right ? "left" : "right";
    })()`);
    const openerSide =
      opener && opener.left < window0Width - opener.right ? "left" : "right";
    check(opener && openerSide === drawerSide,
      "…it is on the edge its own drawer opens from",
      JSON.stringify({ opener, drawerSide, openerSide }));

    await page.keyboard.press("v");
    await page.waitForTimeout(700);
    const open = await page.evaluate(`(() => {
      const d = document.querySelector("[data-chart-settings]");
      const box = d.getBoundingClientRect();
      /* **The widest path, not the first.** The document carries dozens of
         icon paths and one of them — the drawer's own opener, on the range
         row above the chart — now comes first in document order. The
         portfolio chart's suite already learned this; the chart's line is
         the one that spans the plot. */
      const chart = [...document.querySelectorAll("svg path")]
        .map((n) => n.getBoundingClientRect())
        .reduce((best, r) => (best && best.width >= r.width ? best : r), null);
      /* Anything drawn over the whole window would be a scrim — the one
         thing this drawer must not have. */
      const scrim = [...document.querySelectorAll("div, section, aside")].filter((n) => {
        const r = n.getBoundingClientRect();
        const st = getComputedStyle(n);
        return r.width >= innerWidth - 2 && r.height >= innerHeight - 2 &&
          st.position === "fixed" && st.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          Number(st.opacity) > 0 && st.visibility !== "hidden";
      }).length;
      /* The corner controls sit above the drawer so they stay pressable; the
         drawer has to start below them rather than under them. */
      /* **The corner controls, not every button whose box is wide.** The
         price-change figure in the header is a button 400px across with its
         text in the middle, so a bounding-box test called it an overlap when
         nothing of it comes near the drawer. The controls that really are
         drawn above this are the fixed ones. */
      const corners = [...document.querySelectorAll("button")].filter((b) => {
        if (d.contains(b)) return false; // its own × and switches are not "the corner"
        if (getComputedStyle(b).position !== "fixed") return false;
        const r = b.getBoundingClientRect();
        return r.width && r.bottom > box.top && r.right > box.left && r.left < box.right;
      }).map((b) => ({ label: (b.getAttribute("aria-label") || "").slice(0, 20), bottom: Math.round(b.getBoundingClientRect().bottom) }));
      return {
        state: d.getAttribute("data-chart-settings"),
        box: { top: Math.round(box.top), left: Math.round(box.left), right: Math.round(box.right) },
        chartWide: chart ? Math.round(chart.width) : 0,
        scrim,
        overlapping: corners.filter((c) => c.bottom > box.top),
        titles: [...d.querySelectorAll("h2, div")].map((n) => n.innerText).join(" ").slice(0, 400),
      };
    })()`);
    check(open.state === "open", "V opens it", open.state);
    check(open.scrim === 0,
      "…with no scrim over the window, because the chart is the thing it is there to show",
      `${open.scrim} full-window layers`);
    check(open.chartWide > 400, "…and the chart is still drawn beside it", `${open.chartWide}px of line`);
    check(open.overlapping.length === 0,
      "…and nothing in the corner is printed over its head",
      JSON.stringify(open.overlapping));

    /* The point of the whole thing: flip a switch here and the chart behind
       it changes. Chart Grid draws lines into the plot, so they are countable. */
    const linesBefore = await page.evaluate(`document.querySelectorAll("svg line").length`);
    const flipped = await page.evaluate(`(() => {
      const d = document.querySelector("[data-chart-settings]");
      const sw = [...d.querySelectorAll("button")].find((b) =>
        /toggle chart grid/i.test(b.getAttribute("aria-label") || ""));
      if (!sw) return false;
      sw.click();
      return true;
    })()`);
    check(flipped, "the grid switch is in the drawer, under its own name");
    await page.waitForTimeout(1200);
    const after = await page.evaluate(`(() => ({
      lines: document.querySelectorAll("svg line").length,
      stillOpen: document.querySelector("[data-chart-settings]").getAttribute("data-chart-settings"),
    }))()`);
    check(after.lines > linesBefore,
      "a switch flipped in the drawer redraws the chart behind it",
      `${linesBefore} lines → ${after.lines}`);
    check(after.stillOpen === "open",
      "…and the drawer stays open, so the next one can be flipped too");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    const closed = await page.evaluate(
      `document.querySelector("[data-chart-settings]").getAttribute("data-chart-settings")`,
    );
    check(closed === "shut", "Escape puts it away", closed);
    check(errors.length === 0, "nothing threw across the chart drawer", errors.join(" | "));
    await ctx.close();
  }

  /* §43 — the screens' column on the right edge.
   *
   * 26 Sep 2026, *"sol kısımdaki yaptığımız barı aynı şekilde sağ kısımdaki
   * chip tuşları için de yapalım, burayı da sağ kısma koyalım"*. The corner
   * icons that opened a screen, the folder strip that switched between
   * screens once one was open, and the phone's Panels menu became one column
   * on the right edge, resting in its drawer like the chart's (§49). What
   * could quietly go wrong: a screen that brings the column over its own
   * right edge; a switch that opens the new screen without closing the old
   * one — the toggles are not plain flags, they stamp what you have read and
   * start and stop price intervals; a column that offers a drawer; and a
   * corner that still holds openers.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_practice_enabled", "true");
      localStorage.setItem("crypto_chart_practice_consent", "true");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);

    const col = () => page.evaluate(`(() => {
      const el = document.querySelector("[data-screen-tabs]");
      const tabs = [...el.querySelectorAll("[data-screen-tab]")];
      return {
        open: el.getAttribute("data-screen-tabs"),
        shown: el.getAttribute("data-screen-tabs-shown"),
        right: Math.round(window.innerWidth - el.getBoundingClientRect().right),
        tabs: tabs.map((b) => b.getAttribute("data-screen-tab")),
        marked: tabs.filter((b) => b.getAttribute("aria-current") === "page")
          .map((b) => b.getAttribute("data-screen-tab")),
        /* The names read top to bottom on this edge, and run along it. */
        across: tabs.filter((b) => {
          const t = b.getBoundingClientRect();
          return getComputedStyle(b.children[1]).writingMode !== "sideways-rl" || t.height <= t.width * 1.5;
        }).map((b) => b.getAttribute("data-screen-tab")),
        corner: [...document.querySelectorAll("[data-chrome-cluster] button")]
          .map((b) => b.getAttribute("aria-label")),
        vis: getComputedStyle(el).visibility,
        left: Math.round(el.getBoundingClientRect().left),
        close: (() => { const x = document.querySelector("[data-screen-close]");
          if (!x) return null; const r = x.getBoundingClientRect();
          return { top: Math.round(r.top), right: Math.round(window.innerWidth - r.right) }; })(),
        frame: (() => { const f = document.querySelector("[data-portfolio-view]");
          if (!f) return null; let n = f; while (n && getComputedStyle(n).position !== "fixed") n = n.parentElement;
          return n ? Math.round(n.getBoundingClientRect().right) : null; })(),
      };
    })()`);

    const rest = await col();
    check(rest.shown === "false" && rest.corner.length === 0,
      "on a plain chart the screens' column is in its drawer and the corner holds nothing",
      JSON.stringify(rest));

    await page.keyboard.press("p");
    await page.waitForTimeout(1100);
    /* **An open screen keeps the column out** (26 Sep 2026, *"setting vs
       açıkken o sağ kenarlık kapanmasın, sürekli açık kalsın"*): pinned,
       with the screen ending where the column begins so nothing of it is
       under a tab, and the screen's × in its own top-right corner rather
       than on the corner controls' old line (*"çok aşağıda"*). */
    const out = await col();
    check(out.open === "portfolio" && out.vis === "visible" && out.right === 0 && out.corner.join() === "Close portfolio",
      "a screen opened from its key keeps the column out, and its × is the corner's one control",
      JSON.stringify(out));
    check(out.frame !== null && Math.abs(out.frame - out.left) <= 1,
      "…and the screen ends where the column begins", JSON.stringify({ frame: out.frame, column: out.left }));
    check(out.close && out.close.top <= 16 && out.close.right <= 8,
      "…with its × in the top-right corner", JSON.stringify(out.close));
    check(out.tabs.length >= 5 && out.tabs.includes("baserates") &&
      !out.tabs.includes("targets") && !out.tabs.includes("calls"),
      "…a tab for every screen, the base rates too, and none for the chart's drawers",
      JSON.stringify(out.tabs));
    check(out.marked.join() === "portfolio",
      "…with the screen you are in marked, once", JSON.stringify(out.marked));
    check(out.across.length === 0,
      "…and every name written down the right edge, not across it", JSON.stringify(out.across));

    /* The switch itself, pressed with the pointer: one press, and the screen
       you left is actually gone — not merely covered. */
    await page.click("[data-screen-tab='news']");
    await page.waitForTimeout(1400);
    const moved = await col();
    check(moved.open === "news" && moved.marked.length === 1,
      "one press moves you to another screen, and exactly one tab is marked", JSON.stringify(moved));
    check(await page.evaluate(`!document.querySelector("[data-portfolio-view]")`),
      "…with the one you left actually closed, not just covered");

    await page.click("[data-screen-tab='news']");
    await page.waitForTimeout(900);
    const shut = await col();
    check(shut.open === "none" && shut.corner.length === 0,
      "a press on the raised tab closes its screen", JSON.stringify(shut));
    check(errors.length === 0, "nothing threw across the screens' column", errors.join(" | "));
    await ctx.close();
  }

  /* §44 — on a phone both columns hang from the foot, and one order.
   *
   * Measured at 420px before the columns: nine corner controls filled the
   * top edge, so a phone had one button and a list instead. The two columns
   * do that job now, from the foot, where a phone's drawer is — and the
   * list is gone.
   *
   * And the order is the person's: dragged on the column, written down, and
   * read back by it. Dispatched rather than mimed, because HTML5
   * drag-and-drop is not something a synthetic mouse produces — the coin
   * list's own check dispatches the same three events.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 800 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_practice_enabled", "true");
      localStorage.setItem("crypto_chart_practice_consent", "true");
      localStorage.removeItem("crypto_chart_panel_order");
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1600);

    const phone = await page.evaluate(`(() => {
      const box = (s) => { const n = document.querySelector(s); if (!n) return null;
        const r = n.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom) }; };
      return {
        left: box("[data-drawer-tabs-handle]"),
        right: box("[data-screen-tabs-handle]"),
        menu: Boolean(document.querySelector("[data-chrome-menu-open], [data-chrome-menu]")),
        corner: document.querySelectorAll("[data-chrome-cluster] button").length,
        h: window.innerHeight, w: window.innerWidth,
      };
    })()`);
    check(phone.left && phone.right && phone.h - phone.left.b < 40 && phone.h - phone.right.b < 40 &&
      phone.left.l <= 0 && phone.right.r >= phone.w,
      "on a phone the two pulls sit at the foot, one at each edge", JSON.stringify(phone));
    check(!phone.menu && phone.corner === 0,
      "…and there is no Panels list and nothing in the corner", JSON.stringify(phone));

    await page.click("[data-screen-tabs-handle]");
    await page.waitForTimeout(500);
    const foot = await page.evaluate(`(() => {
      const r = document.querySelector("[data-screen-tabs]").getBoundingClientRect();
      return { bottom: Math.round(window.innerHeight - r.bottom), right: Math.round(window.innerWidth - r.right) };
    })()`);
    check(foot.bottom >= 0 && foot.bottom < 40 && foot.right === 0,
      "…and the screens' column comes out from the foot of the right edge", JSON.stringify(foot));
    await page.click("[data-screen-tab='news']");
    await page.waitForTimeout(1300);
    check((await page.evaluate(`document.querySelector("[data-screen-tabs]").getAttribute("data-screen-tabs")`)) === "news",
      "a tab there opens its screen");

    const order = () => page.evaluate(`[...document.querySelectorAll("[data-screen-tab]")].map((b) => b.getAttribute("data-screen-tab"))`);
    const before = await order();
    await page.evaluate(`(() => {
      const from = document.querySelector("[data-screen-tab='futures']");
      const to = document.querySelector("[data-screen-tab='portfolio']");
      const dt = new DataTransfer();
      from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
      to.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
      to.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
      from.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
    })()`);
    await page.waitForTimeout(700);
    const after = await order();
    const stored = await page.evaluate(`localStorage.getItem("crypto_chart_panel_order")`);
    check(after.join() !== before.join() && after.indexOf("futures") < after.indexOf("portfolio"),
      "a tab dragged onto another one moves to exactly where it was dropped",
      `${before.join()} → ${after.join()}`);
    check(after[0] === "settings",
      "…and Settings stays first, whatever is dragged over it", after.join());
    /* The column shows the screens; the stored order holds every panel, so
       the two are compared on the part they share. */
    check(stored && JSON.parse(stored).filter((k) => after.includes(k)).join() === after.join(),
      "…and the order is written down, not just drawn", stored);
    check(errors.length === 0, "nothing threw across the phone's columns and the reorder", errors.join(" | "));
    await ctx.close();
  }

  /* §45 — targets and calls are drawers laid over the page, which stays put.
   *
   * The rule they were built to (chartDrawerSurface, theme.js): a panel that
   * changes what the chart shows is see-through and beside it. Ways it
   * could quietly stop being true, each of which happened at least once:
   *   - the page moves when a drawer opens. The chart stopped being resized
   *     on 24 Sep 2026; the price readout and the range row went on stepping
   *     aside until 26 Sep (*"fiyat yazan kısım sağa kayıyor, o olduğu yerde
   *     kalsın"*), travelling 274px at 1280 every time Targets opened;
   *   - something other than that header ends up under the glass — the
   *     widget rail used to;
   *   - the chart stops bleeding to the window's left edge;
   *   - the outside press that replaced the scrim closes the drawer when it
   *     should not, or fails to when it should.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_widgets", JSON.stringify({ watchlist: true }));`);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);

    /* Where the page's own writing is with every drawer shut: the readout
       and the range row, by their tour hooks. */
    const HEADER = `(() => ["price", "change", "period"].map((k) => {
      const n = document.querySelector("[data-tour='" + k + "']");
      if (!n) return k + ":missing";
      const r = n.getBoundingClientRect();
      return k + ":" + Math.round(r.left) + "," + Math.round(r.top);
    }).join(" "))()`;
    const headerShut = await page.evaluate(HEADER);

    await page.keyboard.press("a");
    await page.waitForTimeout(900);
    const headerOpen = await page.evaluate(HEADER);
    const geo = await page.evaluate(`(() => {
      const d = document.querySelector("[data-alerts-drawer]");
      if (!d) return null;
      const box = d.getBoundingClientRect();
      const svg = document.querySelector("svg").getBoundingClientRect();
      const rail = document.querySelector("[data-tour='widgets']");
      const rb = rail ? rail.getBoundingClientRect() : null;
      /* Every fixed sheet over the window: a scrim would be one. */
      const scrims = [...document.querySelectorAll("div")].filter((n) => {
        const cs = getComputedStyle(n);
        return cs.position === "fixed" && n.offsetWidth > innerWidth * 0.9 &&
          n.offsetHeight > innerHeight * 0.9 && cs.zIndex !== "auto" &&
          +getComputedStyle(n).zIndex >= 90;
      }).length;
      /* Anything with words in it that the drawer is printed over — other
         than the page's own header, which stays where it is under the glass
         by request (see the header check below). The header is whatever the
         shell holds above the chart's surface. */
      const clashes = [];
      document.querySelectorAll("h1, h2, button, span, div").forEach((n) => {
        if (d.contains(n)) return;
        if (n.closest("main") && !n.closest("[data-chart-surface]")) return;
        /* Leaf nodes only — a wrapper's box says nothing about its words. */
        if (n.children.length) return;
        const t = (n.innerText || "").trim();
        if (!t) return;
        const r = n.getBoundingClientRect();
        if (!r.width || !r.height) return;
        /* **Opacity does not inherit into a child's computed style.** A
           widget card inside a faded panel still reads as opaque on its own,
           so the ancestors have to be walked — the cards stand down while a
           drawer is open, and counting them as printed under it is counting
           something nobody can see. */
        let hidden = false;
        for (let a = n; a && a !== document.body; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.visibility === "hidden" || acs.display === "none" || +acs.opacity === 0) {
            hidden = true;
            break;
          }
        }
        if (hidden) return;
        if (r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) {
          clashes.push(t.slice(0, 24));
        }
      });
      return {
        drawerLeft: Math.round(box.left),
        drawerTop: Math.round(box.top),
        drawerZ: Number(getComputedStyle(d).zIndex),
        chartLeft: Math.round(svg.left),
        chartRight: Math.round(svg.right),
        railRight: rb ? Math.round(rb.right) : 0,
        /* The glass is the second stop of a gradient since 27 Sep 2026:
           solid above the chart, see-through over it (chartDrawerSurface). */
        ground: getComputedStyle(d).backgroundImage + " " + getComputedStyle(d).backgroundColor,
        scrims,
        clashes: [...new Set(clashes)],
      };
    })()`);
    check(geo !== null, "A opens a docked drawer", JSON.stringify(geo));
    check(geo && geo.scrims === 0,
      "…with no sheet over the window, because the chart is what it is beside",
      JSON.stringify(geo && geo.scrims));
    /* **The chart keeps its shape; the drawer floats over it** (24 Sep 2026,
       *"böylelikle ana grafik yeniden şekil değiştirmek zorunda kalmaz"*).
       It spent a day giving the drawer its width back, and the price was the
       whole chart redrawing — a new x scale, every point replaced — each
       time a panel was opened for ten seconds. The line runs under the glass
       now, which is the reason the glass is there. */
    check(geo && geo.chartRight >= geo.drawerLeft,
      "the chart runs on under the drawer rather than being pushed aside",
      JSON.stringify(geo));
    check(geo && geo.drawerZ >= 160,
      "…and the drawer is the front layer over it", JSON.stringify(geo && geo.drawerZ));
    check(geo && geo.chartLeft <= 1,
      "…and still bleeds to the window's left edge, under the widgets",
      JSON.stringify(geo));
    check(geo && geo.clashes.length === 0,
      "nothing but the page's own header is under the drawer",
      geo ? geo.clashes.join(" · ") : "");
    /* **The header stays where it was** (26 Sep 2026). With the old
       padding rule restored, the readout moves from x=360 to x=634 here. */
    check(!/missing/.test(headerShut) && headerOpen === headerShut,
      "the price readout and the range row do not move when a drawer opens",
      `${headerShut} → ${headerOpen}`);
    check(geo && /0\.8/.test(geo.ground),
      "the drawer is see-through, because the chart is what is behind it",
      geo ? geo.ground : "");

    /* The four presses the document listener has to tell apart. */
    const alive = () => page.evaluate(`Boolean(document.querySelector("[data-alerts-drawer]"))`);
    /* **Inside the drawer, which is on the left edge since 24 Sep 2026** —
       measured off the drawer rather than written as a coordinate, so the
       press lands in it whatever its width becomes. */
    const inside = await page.evaluate(`(() => {
      const r = document.querySelector("[data-alerts-drawer]").getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    await page.mouse.click(inside.x, inside.y);
    await page.waitForTimeout(400);
    check(await alive(), "a press inside the drawer leaves it open");
    /* The drawers' own tabs on the left edge since 25 Sep 2026 — the
       screens' strip no longer lists them. Pressed with the real pointer
       (page.click), so a tab something else is drawn over fails here, where
       a synthetic click would pass whether or not anybody could reach it. */
    await page.click("[data-drawer-tab='calls']");
    await page.waitForTimeout(700);
    check(
      (await alive()) &&
        (await page.evaluate(`document.querySelector("[data-drawer-tabs]").getAttribute("data-drawer-tabs")`)) === "calls",
      "a press on a folder tab moves drawer rather than closing to nothing");
    /* And the chart, which is what is left of the window beside it. */
    const beside = await page.evaluate(`(() => {
      const r = document.querySelector("[data-alerts-drawer]").getBoundingClientRect();
      return { x: Math.round(r.right + (window.innerWidth - r.right) / 2), y: Math.round(r.top + r.height * 0.6) };
    })()`);
    await page.mouse.click(beside.x, beside.y);
    await page.waitForTimeout(700);
    check(!(await alive()), "a press on the chart closes it, the way the chart's own drawer closes");

    /* And it had the whole window all along — the drawer never took any. */
    const back = await page.evaluate(`(() => {
      const svg = document.querySelector("svg").getBoundingClientRect();
      return { right: Math.round(svg.right), width: Math.round(svg.width), win: window.innerWidth };
    })()`);
    check(back.right >= back.win - 2 && back.width >= back.win - 2,
      "…and the chart is the window's width with the drawer gone, as it was with it open",
      JSON.stringify(back));
    check(errors.length === 0, "nothing threw across the targets drawer", errors.join(" | "));
    await ctx.close();
  }

  /* §46 — a price target is a level on the chart, not a number in a list.
   *
   * Three things landed together on 23 Sep 2026, and each is only worth
   * anything with the other two: the armed targets are drawn on the axis they
   * were set against, a click on the chart fills the form, and the form says
   * how ordinary a move of that size is for this coin. What the section
   * guards is the part that can silently stop being true — the lines going
   * missing, the click closing the drawer instead of filling it, and the
   * count losing its denominator.
   */
  {
    /* Four hundred points, because the reach line refuses a record shorter
       than `DAILY_MOVE_MIN_DAYS` and the ordinary fixture is 120. */
    const LONG = Array.from({ length: 400 }, (_, i) => ({
      price: (43000 + i * 3 + Math.sin(i / 9) * 420).toFixed(2),
      time: NOW_S - (400 - i) * 30,
    }));
    /* **In range means inside the series, not near the last price.** The
       fixture rises across the window, so the newest price *is* about the
       highest one and anything above it is off the chart by construction —
       which is how the first draft of this section came to assert two lines
       and find one. */
    const lo = Math.min(...LONG.map((p) => Number(p.price)));
    const hi = Math.max(...LONG.map((p) => Number(p.price)));
    const at = (share) => Math.round(lo + (hi - lo) * share);
    /* **And "in range" is not enough on its own: it has to still be armed.**
       The price sits near the top of this window, so an *above* target inside
       it is one the price has already passed — it fires on the first check
       and stops being a level anybody is waiting for. Both of the drawn ones
       therefore watch for a fall; the up arrow comes from the pair beyond the
       top edge. */
    const targets = [
      { id: "g1", coin: "BTC", kind: "price", direction: "below", target: at(0.75), currency: "USD", created: Date.now(), triggeredAt: null },
      { id: "g2", coin: "BTC", kind: "price", direction: "below", target: at(0.25), currency: "USD", created: Date.now(), triggeredAt: null },
      { id: "g3", coin: "BTC", kind: "price", direction: "above", target: Math.round(hi * 3), currency: "USD", created: Date.now(), triggeredAt: null },
      { id: "g4", coin: "BTC", kind: "price", direction: "above", target: Math.round(hi * 4), currency: "USD", created: Date.now(), triggeredAt: null },
    ];
    const { ctx, page, errors } = await newCtx(
      browser,
      new Function(`localStorage.setItem("crypto_chart_onboarding_seen", "1");
        localStorage.setItem("crypto_chart_alerts", ${JSON.stringify(JSON.stringify(targets))});`),
      LONG,
    );
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);

    /* Only the live chart: the coin you were looking at a moment ago stays on
       screen while the next one loads, and its levels are still in its own
       SVG. */
    const drawn = () => page.evaluate(`(() => {
      const live = [...document.querySelectorAll("svg")].filter((n) => {
        const w = n.closest("section");
        return !w || +getComputedStyle(w).opacity > 0.9;
      });
      const all = (sel) => live.reduce((a, s) => a.concat([...s.querySelectorAll(sel)]), []);
      const shown = (n) => n.getAttribute("visibility") !== "hidden";
      const lines = all("line").filter((n) => n.getAttribute("stroke-dasharray") === "1 4" && shown(n));
      const tags = all("text").filter((n) => shown(n) && /target/i.test(n.textContent)).map((n) => n.textContent);
      return { lines: lines.length, tags };
    })()`);
    const first = await drawn();
    check(first.lines === 2,
      "the two targets inside the drawn range are lines on the chart", JSON.stringify(first));
    check(first.tags.length === 3,
      "…and the two above it share one marker on the edge rather than stacking", first.tags.join(" · "));
    check(first.tags.some((t) => /\u2191/.test(t)) && first.tags.some((t) => /\u2193/.test(t)),
      "each label says which way it is watching", first.tags.join(" · "));
    check(first.tags.some((t) => /\+1/.test(t)),
      "…and the marker counts the one further out", first.tags.join(" · "));

    await page.keyboard.press("a");
    await page.waitForTimeout(900);
    const field = () => page.evaluate(`(() => { const n = document.querySelector("[data-alerts-drawer] input[placeholder*='target']"); return n ? n.value : null; })()`);
    const dir = () => page.evaluate(`(() => { const s = document.querySelector("[data-alerts-drawer] select"); return s ? s.value : null; })()`);
    check((await field()) === "", "the form starts empty");
    /* Measured off the chart rather than guessed: this section runs in a
       900px window and a fixed y that is inside the plot at 800 lands in the
       header here, where a press really is outside the drawer. */
    const plot = await page.evaluate(`(() => {
      const live = [...document.querySelectorAll("svg")].filter((n) => {
        const w = n.closest("section");
        return !w || +getComputedStyle(w).opacity > 0.9;
      });
      const r = live[0].getBoundingClientRect();
      /* **Clear of the drawer**, which covers the chart's left side now: a
         press there is a press on the panel, not on the chart. */
      const d = document.querySelector("[data-alerts-drawer]");
      const from = d ? d.getBoundingClientRect().right : r.left;
      return { x: Math.round(from + (r.right - from) / 2), top: Math.round(r.top), h: Math.round(r.height) };
    })()`);
    await page.mouse.click(plot.x, Math.round(plot.top + plot.h * 0.25));
    await page.waitForTimeout(500);
    const high = await field();
    const dirHigh = await dir();
    check(Boolean(await page.evaluate(`Boolean(document.querySelector("[data-alerts-drawer]"))`)),
      "a press on the chart fills the form instead of closing the drawer");
    check(Number(high) > 0, "…with the price it landed on", String(high));
    await page.mouse.click(plot.x, Math.round(plot.top + plot.h * 0.8));
    await page.waitForTimeout(500);
    const low = await field();
    const dirLow = await dir();
    check(Number(low) < Number(high), "lower down the chart is a lower price", `${low} < ${high}`);
    /* **Which side is read off the price, not off where the click was.** The
       live price is wherever it is in the window — near the top in this
       fixture — so a rule written as "high on the chart means above" is a
       rule that fails on any series that is not mid-range. */
    const now = Number(
      await page.evaluate(`(() => {
        /* The app's own price readout: the label under it says "<COIN>
           PRICE", and the figure is its sibling. Read from the page rather
           than from the drawer, which prints several other numbers. */
        const label = [...document.querySelectorAll("div")].find(
          (n) => !n.children.length && /^[A-Z]+ PRICE$/.test((n.innerText || "").trim()),
        );
        const value = label && label.previousElementSibling;
        const m = value && (value.innerText || "").replace(/,/g, "").match(/([0-9]+(?:\\.[0-9]+)?)/);
        return m ? m[1] : "0";
      })()`),
    );
    const side = (v) => (Number(v) >= now ? "above" : "below");
    check(now > 0 && dirHigh === side(high) && dirLow === side(low),
      "each pick is watched from the side of the price it landed on",
      `${high}→${dirHigh}, ${low}→${dirLow}, now ${now}`);

    /* The count waits on this coin's daily closes, which are a request (cached
       for twelve hours and shared with the base-rate panel), so the line
       arrives after the form does. */
    await page.waitForFunction(
      `/has happened on/.test((document.querySelector("[data-alerts-drawer]") || document.body).innerText)`,
      { timeout: 8000 },
    ).catch(() => {});
    const reach = await page.evaluate(`(() => {
      const t = document.querySelector("[data-alerts-drawer]").innerText;
      const m = t.match(/[^\\n]*has happened on[^\\n]*/);
      return m ? m[0] : null;
    })()`);
    check(Boolean(reach) && /of the last [0-9]+ days/.test(reach),
      "the form counts how many days have moved that far", String(reach));
    const nums = reach ? reach.match(/on ([0-9]+) of the last ([0-9]+)/) : null;
    check(Boolean(nums) && Number(nums[1]) <= Number(nums[2]),
      "…and the count never exceeds its denominator", String(reach));

    /* The gesture belongs to the board whenever the board is up: two meanings
       for one click is neither. */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("l");
    await page.waitForTimeout(600);
    await page.keyboard.press("a");
    await page.waitForTimeout(800);
    const hinted = await page.evaluate(`/click the chart/i.test(document.querySelector("[data-alerts-drawer]").innerText)`);
    check(!hinted, "with the board on, the form does not offer the chart as a way to pick");
    check(errors.length === 0, "nothing threw across the targets on the chart", errors.join(" | "));
    await ctx.close();
  }

  /* §47 — the page at rest, with the price bar on top.
   *
   * The corner rested out of sight from 23 Sep 2026 and came back when the
   * pointer went near the top; since 26 Sep it holds nothing on a plain
   * chart — the openers are tabs on the two edges' columns — so what rests
   * on the page is the two pulls. What could quietly stop being true: a
   * corner control left behind; a pull sitting on the page ticker rather
   * than under it; the bar hiding or stopping; the chart moving with the
   * pointer; and an open screen's × drawn over the bar or boxed in.
   */
  {
    /* **With the bar actually on**, which takes the whole coin list: the
       sweep only marks the ticker ready when it can price what it was asked
       for, and a context without it tests the easy half of the rule. */
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const TICK = SUGGESTED.map((sym, i) => ({
      id: i, symbol: sym, name: sym, price_usd: String(100 + i),
      percent_change_24h: String((i % 7) - 3),
      market_cap_usd: "1000000", volume24: "50000",
    }));
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("coinlore") && u.includes("tickers"))
        return r.fulfill(json({ data: TICK, info: { coins_num: 100 } }));
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_page_ticker_enabled", "true");
      localStorage.setItem("crypto_chart_page_ticker_position", "top");
      localStorage.removeItem("crypto_chart_ticker_cache");
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    /* The bar arrives with the sweep, not with the page, and the rule under
       test is where things sit **once it is there**. */
    const BAR = `[...document.querySelectorAll("div")].find((d) => {
      const cs = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      return cs.position === "fixed" && d.offsetWidth > innerWidth * 0.9 &&
        d.offsetHeight > 20 && d.offsetHeight < 140 && Number(cs.zIndex) >= 50 && r.top < 10;
    })`;
    await page.waitForFunction(`Boolean(${BAR})`, { timeout: 15000 }).catch(() => {});
    await page.mouse.move(420, 620);
    await page.waitForTimeout(1200);

    const corner = () => page.evaluate(`[...document.querySelectorAll("[data-chrome-cluster] button")].map((b) => {
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      return { name: b.getAttribute("aria-label"), y: Math.round(r.top), o: Number(cs.opacity),
        z: Number(cs.zIndex), bg: cs.backgroundColor, ring: cs.boxShadow };
    })`);
    check((await corner()).length === 0,
      "on a plain chart the corner holds nothing: its openers are tabs on the two columns");

    const bar = await page.evaluate(`(() => { const n = ${BAR};
      return n ? { bottom: Math.round(n.getBoundingClientRect().bottom), o: Number(getComputedStyle(n).opacity) } : null; })()`);
    check(Boolean(bar), "the page ticker is on top in this context", JSON.stringify(bar));
    /* **The bar is never underneath them; it pushes them down** (24 Sep
       2026), and the pulls took that rule with the corner's line: the
       offset is the bar's *measured* height, on the bar's own clock. */
    const pulls = await page.evaluate(`[...document.querySelectorAll("[data-drawer-tabs-handle], [data-screen-tabs-handle]")].map((b) => ({
      y: Math.round(b.getBoundingClientRect().top), tr: getComputedStyle(b).transitionProperty }))`);
    check(bar && pulls.length === 2 && pulls.every((p) => p.y >= bar.bottom - 1),
      "…and both pulls sit below it, not on it", JSON.stringify({ bar, pulls }));
    check(pulls.every((p) => /(^|,\s*)top(,|$)/.test(p.tr)),
      "…having got there on a transition, not a jump", JSON.stringify(pulls.map((p) => p.tr)));

    /* **The bar never hides, and the page does not move** (25 Sep 2026,
       *"tickerlar şu an gizleniyor otomatik, bu olmayacak kesinlikle"*). */
    const chartBox = () => page.evaluate(`(() => { const s = document.querySelector("svg").getBoundingClientRect();
      return [Math.round(s.width), Math.round(s.height), Math.round(s.top)].join(); })()`);
    const away = await chartBox();
    await page.mouse.move(1180, 30);
    await page.waitForTimeout(500);
    const near = await chartBox();
    const barNear = await page.evaluate(`(() => { const n = ${BAR}; return n ? Number(getComputedStyle(n).opacity) : null; })()`);
    check(barNear === 1, "the bar stays on screen wherever the pointer is", String(barNear));
    check(near === away, "…and the chart does not move a pixel either way", `${away} / ${near}`);
    /* Read with the pointer off the bar: it pauses under the pointer so a
       price can be read, which is not stopping. */
    await page.mouse.move(420, 620);
    await page.waitForTimeout(400);
    check(await page.evaluate(`(() => { const n = ${BAR};
      return Boolean(n) && n.getAnimations({ subtree: true }).some((a) => a.playState === "running"); })()`),
      "…and it keeps scrolling");

    /* An open screen keeps its × on screen whatever the pointer is doing,
       below the bar, bare, and at the front. */
    await page.keyboard.press("n");
    await page.waitForTimeout(900);
    await page.mouse.move(420, 620);
    await page.waitForTimeout(400);
    const x = await corner();
    check(x.length === 1 && x[0].name === "Close news" && x[0].o > 0.5 && x[0].z >= 140,
      "an open screen's × is the corner's one control, in sight and at the front", JSON.stringify(x));
    check(x.length === 1 && x[0].bg === "rgba(0, 0, 0, 0)" && x[0].ring === "none",
      "…with nothing drawn around it", JSON.stringify(x));
    check(errors.length === 0, "nothing threw across the page at rest", errors.join(" | "));
    await ctx.close();
  }

  /* §48 — the chart's spine: hung from the top, with compare on it.
   *
   * 26 Sep 2026: *"şimdi bu sol tab yaptık, buna compare kısmını da
   * ekleyelim şu dikey sol tab'a, ve sol tab'ı iyice yukarı çıkaralım"*.
   * What could quietly stop being true: the column sliding back to the
   * middle of the window; compare turning up in the corner again, or twice;
   * the coin picker opening under a drawer's glass (it is drawn at 120, the
   * drawers at 160 — which V and W allowed before the tab ever did); and,
   * on a phone, the raised tab cutting into the price readout, which is
   * what hanging the column from the top did at 360-390px until the phone
   * got its own rule.
   */
  {
    const { ctx, page, errors } = await newCtx(browser, () => {
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
    });
    const spine = await page.evaluate(`(() => {
      const tabs = [...document.querySelectorAll("[data-drawer-tabs] [data-drawer-tab]")];
      const box = (b) => b.getBoundingClientRect();
      const gear = document.querySelector('[aria-label="Open settings"]');
      const gaps = tabs.slice(1).map((b, i) => Math.round(box(b).top - box(tabs[i]).bottom));
      return {
        keys: tabs.map((b) => b.getAttribute("data-drawer-tab")),
        top: tabs.length ? Math.round(box(tabs[0]).top) : null,
        gear: gear ? Math.round(box(gear).top) : null,
        gaps: gaps,
        tour: [...document.querySelectorAll('[data-tour="compare"]')]
          .map((n) => n.getAttribute("data-drawer-tab")),
      };
    })()`);
    /* With the old centring restored (top 50%, translateY(-50%)) the first
       tab starts at y=187 here, against the gear's 32. */
    check(spine.gear !== null && Math.abs(spine.top - spine.gear) <= 2,
      "the chart's tabs hang from the top, on the gear's line",
      JSON.stringify({ top: spine.top, gear: spine.gear }));
    /* **Spaced like the rest** (26 Sep 2026, *"compare diğerlerine kıyasla
       biraz daha düzensiz"*): for an afternoon it stood 16px off the others'
       4px, which read as a different kind of control. */
    check(spine.keys[spine.keys.length - 1] === "compare" &&
      spine.gaps.length > 0 && spine.gaps.every((g) => g === spine.gaps[0]),
      "…with compare last on the spine, spaced like the other tabs",
      JSON.stringify(spine));
    check(spine.tour.length === 1 && spine.tour[0] === "compare",
      "…and it is the one thing the tour's compare step can point at",
      JSON.stringify(spine.tour));

    /* A drawer open, then Compare pressed with the real pointer. **While
       the picker is up the column is not drawn at all** (modalUp), so an
       absent column reads as "none" and the chart's drawer is asked
       directly as well. */
    const drawerOpen = () =>
      page.evaluate(`(() => {
        const col = document.querySelector("[data-drawer-tabs]");
        if (col) return col.getAttribute("data-drawer-tabs");
        return document.querySelector("[data-chart-settings='open']") ? "chart" : "none";
      })()`);
    await page.keyboard.press("v");
    await page.waitForTimeout(700);
    check((await drawerOpen()) === "chart", "V opens the chart's drawer to start from");
    await page.click("[data-drawer-tab='compare']");
    await page.waitForTimeout(600);
    const picker = await page.evaluate(`(() => {
      const input = [...document.querySelectorAll("input")]
        .find((n) => /^Compare/.test(n.getAttribute("placeholder") || ""));
      if (!input) return null;
      const r = input.getBoundingClientRect();
      const top = document.elementFromPoint(Math.round(r.left + 12), Math.round(r.top + r.height / 2));
      return { reachable: top === input, focused: document.activeElement === input };
    })()`);
    check((await drawerOpen()) === "none" && picker && picker.reachable && picker.focused,
      "Compare shuts the open drawer and brings the coin picker up in front of everything",
      JSON.stringify({ drawer: await drawerOpen(), picker }));

    await page.keyboard.type("ETH");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
    const tabState = () => page.evaluate(`(() => {
      const t = document.querySelector("[data-drawer-tab='compare']");
      const other = document.querySelector("[data-drawer-tab='targets']");
      const iconOf = (b) => getComputedStyle(b.firstElementChild).color;
      return {
        pressed: t.getAttribute("aria-pressed"),
        name: t.textContent.replace(/\\s+/g, " ").trim(),
        h: Math.round(t.getBoundingClientRect().height),
        lit: iconOf(t) !== iconOf(other),
        ink: getComputedStyle(t).color === getComputedStyle(other).color,
        strip: Boolean(document.querySelector("[data-compare-strip]")),
      };
    })()`);
    const comparing = await tabState();
    check(comparing.pressed === "true" && comparing.lit && comparing.ink && comparing.strip,
      "picking a coin compares, and only the tab's icon says so",
      JSON.stringify(comparing));
    /* The column is back in its drawer once the pointer has gone, so the
       second press is the real gesture: the pull, then the tab. */
    await page.mouse.move(700, 600);
    await page.waitForTimeout(700);
    await page.click("[data-drawer-tabs-handle]");
    await page.waitForTimeout(400);
    await page.click("[data-drawer-tab='compare']");
    /* Read off the pointer, or the hover colour is what gets measured —
       and before the column's linger runs out, which does not matter to a
       computed colour but keeps the reading honest about what is on screen. */
    await page.mouse.move(700, 600);
    await page.waitForTimeout(250);
    const stopped = await tabState();
    check(stopped.pressed === "false" && !stopped.strip && !stopped.lit,
      "…and a second press on it stops comparing", JSON.stringify(stopped));
    /* With the coin in its name it grew to 142px against the others'
       85-114; the name no longer changes, so neither does the tab. */
    check(stopped.h === comparing.h && stopped.name === comparing.name,
      "…and the tab is the same size and says the same word either way",
      JSON.stringify({ comparing, stopped }));

    /* The phone, with the widgets drawer out, which raises the first tab to
       its full width. Measured on the text's own boxes, not the elements':
       the readout's box is the width of its column. */
    /* The column back in its drawer first, so the pull is there to press. */
    await page.waitForTimeout(600);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(500);
    await page.click("[data-drawer-tabs-handle]");
    await page.waitForTimeout(400);
    await page.click("[data-drawer-tab='widgets']");
    await page.waitForTimeout(700);
    const onPhone = await page.evaluate(`(() => {
      const tabs = [...document.querySelectorAll("[data-drawer-tab]")].map((b) => b.getBoundingClientRect());
      const hits = [];
      document.querySelectorAll("main *").forEach((n) => {
        if (n.closest("[data-chart-surface]")) return;
        for (const c of n.childNodes) {
          if (c.nodeType !== 3 || !c.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(c);
          for (const q of range.getClientRects()) {
            if (tabs.some((b) => q.left < b.right && q.right > b.left && q.top < b.bottom && q.bottom > b.top)) {
              hits.push(c.textContent.trim().slice(0, 16));
            }
          }
        }
      });
      return { hits, drawer: document.querySelector("[data-drawer-tabs]").getAttribute("data-drawer-tabs") };
    })()`);
    check(onPhone.drawer === "widgets" && onPhone.hits.length === 0,
      "on a phone no tab is printed over the page's writing, drawer out or not",
      JSON.stringify(onPhone));
    check(errors.length === 0, "nothing threw across the spine", errors.join(" | "));
    await ctx.close();
  }

  /* §49 — the chart's tabs rest in a drawer, and the widgets' switches live
   * in theirs.
   *
   * 26 Sep 2026: *"normalde bu kısım saklı kalsın, çekmece gibi olsun; ona
   * tıklanınca veya uzun bir süre hoverlayınca bu sol yan bar çıksın"*, and
   * *"widgets ayarları widget kısmının içerisinde olsun"*. What could
   * quietly stop being true: a column that is hidden but still takes a
   * press or the keyboard; a pull that opens the moment the pointer crosses
   * it; a column that never goes back; a hit target's dot lost behind the
   * drawer; the tour pointing at a tab that is off the edge of the window;
   * and a switch in the chooser that changes nothing on the desk.
   */
  {
    const hit = [{ id: "h1", coin: "BTC", kind: "price", direction: "above", target: 1,
      currency: "USD", created: Date.now() - 60000, triggeredAt: Date.now() - 30000 }];
    const { ctx, page, errors } = await newCtx(
      browser,
      new Function(`localStorage.setItem("crypto_chart_onboarding_seen", "1");
        localStorage.setItem("crypto_chart_widgets", JSON.stringify({ watchlist: true }));
        localStorage.setItem("crypto_chart_alerts", ${JSON.stringify(JSON.stringify(hit))});`),
    );
    const state = () => page.evaluate(`(() => {
      const n = document.querySelector("[data-drawer-tabs]");
      const h = document.querySelector("[data-drawer-tabs-handle]");
      const tab = n.querySelector("[data-drawer-tab='widgets']");
      const r = tab.getBoundingClientRect();
      const under = document.elementFromPoint(12, Math.round(r.top + r.height / 2));
      return {
        shown: n.getAttribute("data-drawer-tabs-shown"),
        vis: getComputedStyle(n).visibility,
        pressable: Boolean(under && under.closest("[data-drawer-tab]")),
        handle: h ? Math.round(h.getBoundingClientRect().right) : null,
        dot: Boolean(h && h.firstElementChild),
      };
    })()`);
    const rest = await state();
    check(rest.shown === "false" && rest.vis === "hidden" && !rest.pressable && rest.handle > 0,
      "at rest the column is in its drawer — nothing to press — and its pull is at the edge",
      JSON.stringify(rest));
    check(rest.dot, "…and the pull carries the dot of a target that was hit", JSON.stringify(rest));

    const pull = await page.evaluate(`(() => {
      const r = document.querySelector("[data-drawer-tabs-handle]").getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    await page.mouse.move(pull.x, pull.y);
    await page.waitForTimeout(250);
    const crossing = await state();
    await page.mouse.move(700, 600);
    await page.waitForTimeout(300);
    check(crossing.shown === "false",
      "a pointer passing over the pull does not open it", JSON.stringify(crossing));
    await page.mouse.move(pull.x, pull.y);
    await page.waitForTimeout(1100);
    const rested = await state();
    check(rested.shown === "true" && rested.vis === "visible" && rested.pressable && !rested.dot,
      "a pointer resting on it brings the column out, and the column takes the dot",
      JSON.stringify(rested));
    await page.mouse.move(700, 600);
    await page.waitForTimeout(800);
    check((await state()).shown === "false", "…and it goes back when the pointer leaves");

    await page.click("[data-drawer-tabs-handle]");
    await page.waitForTimeout(400);
    check((await state()).shown === "true", "a press on the pull brings it out at once");
    await page.mouse.click(700, 600);
    await page.waitForTimeout(500);
    check((await state()).shown === "false", "…and a press elsewhere puts it away");

    /* The keyboard: the pull is a button, and the column's tabs follow it. */
    await page.focus("[data-drawer-tabs-handle]");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(`document.activeElement.getAttribute("data-drawer-tab")`);
    check((await state()).shown === "true" && focused === "widgets",
      "from the keyboard, Enter on the pull opens it and Tab reaches the first tab",
      String(focused));
    await page.mouse.click(700, 600);
    await page.waitForTimeout(500);

    /* A drawer open by its key brings the column out with it, raised tab
       and all, and takes it away again when it shuts. */
    await page.keyboard.press("w");
    await page.waitForTimeout(700);
    const withDrawer = await state();
    check(withDrawer.shown === "true" &&
      (await page.evaluate(`document.querySelector("[data-drawer-tabs]").getAttribute("data-drawer-tabs")`)) === "widgets",
      "a drawer opened from the keyboard brings the column out with its tab raised",
      JSON.stringify(withDrawer));

    /* The widgets' switches, in the drawer: a card switched on is on the
       desk the moment the drawer is back on its cards. */
    const cards = () => page.evaluate(
      `document.querySelectorAll("[data-widgets-drawer='open'] [data-widget-cards] > *").length`);
    const before = await cards();
    await page.click("[data-widgets-choose]");
    await page.waitForTimeout(400);
    const chooser = await page.evaluate(`(() => {
      const c = document.querySelector("[data-widgets-drawer='open'] [data-widget-chooser]");
      if (!c) return null;
      const d = c.closest("[data-widgets-drawer]").getBoundingClientRect();
      return {
        switches: c.querySelectorAll("button[aria-pressed]").length,
        spills: [...c.querySelectorAll("*")].filter((n) => {
          const q = n.getBoundingClientRect();
          return q.width && (q.right > d.right + 1 || q.left < d.left - 1);
        }).length,
      };
    })()`);
    check(chooser && chooser.switches >= 10 && chooser.spills === 0,
      "Choose turns the drawer to the widgets' switches, inside its width", JSON.stringify(chooser));
    await page.click("[data-widgets-drawer='open'] [aria-label='Toggle Fear & Greed widget']");
    await page.waitForTimeout(300);
    await page.click("[data-widgets-choose]");
    await page.waitForTimeout(800);
    const after = await cards();
    check(after === before + 1,
      "…and a card switched on there is on the desk when it goes back", `${before} → ${after}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    check((await state()).shown === "false", "…and Escape shuts the drawer and the column with it");

    /* The phone's sheet: the four sizes share a row, and the head's × is
       still inside the sheet (they moved into the head on 27 Sep 2026, and
       at 390 wide the × was pushed past the edge until they took a line of
       their own — see WidgetsDrawerTools). */
    /* 600 as well as 390: at the phone rule's widest the four letters, Choose
       and × fit one line, and only the forced break keeps × last there. */
    await page.setViewportSize({ width: 600, height: 800 });
    await page.waitForTimeout(400);
    await page.keyboard.press("w");
    await page.waitForTimeout(700);
    const headAt = () => page.evaluate(`(() => {
      const d = document.querySelector("[data-widgets-drawer='open']");
      const sizes = [...d.querySelectorAll("[data-widgets-size] button")];
      const close = d.querySelector("[aria-label='Close the widgets']");
      const r = d.getBoundingClientRect();
      const c = close.getBoundingClientRect();
      return {
        tops: sizes.map((b) => Math.round(b.getBoundingClientRect().top)),
        closeInside: c.left >= r.left && c.right <= r.right + 0.5,
        /* Below the ×, not merely lower: on one line the shorter letters,
           centred, start a few pixels under the × too. */
        closeLast: Math.min(...sizes.map((b) => b.getBoundingClientRect().top)) >= c.bottom - 1,
      };
    })()`);
    const wideHead = await headAt();
    check(wideHead.tops.length === 4 && new Set(wideHead.tops).size === 1 && wideHead.closeInside && wideHead.closeLast,
      "at the phone rule's widest, where everything would fit one line, the sizes still go under Choose and ×", JSON.stringify(wideHead));
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(500);
    const phoneHead = await headAt();
    check(phoneHead.tops.length === 4 && new Set(phoneHead.tops).size === 1 && phoneHead.closeInside && phoneHead.closeLast,
      "on a phone the four sizes sit on one row under Choose and ×, and × stays inside the sheet", JSON.stringify(phoneHead));
    check(errors.length === 0, "nothing threw across the drawers", errors.join(" | "));
    await ctx.close();

    /* The tour points at five of these tabs; while it runs, the column is
       out, or the spotlight lands off the edge of the window. */
    const tour = await newCtx(browser, null);
    const tourShown = await tour.page.evaluate(
      `document.querySelector("[data-drawer-tabs]").getAttribute("data-drawer-tabs-shown")`);
    const tourUp = await tour.page.evaluate(`Boolean(document.querySelector("[aria-label^='Step ']"))`);
    check(tourUp && tourShown === "true",
      "while the tour runs, the column is out", JSON.stringify({ tourUp, tourShown }));
    await tour.ctx.close();
  }

  /* §50 — the screens, 26 Sep 2026: one × each, no chart between two of
   * them, the derivatives page closed by a press on nothing, and its account
   * drawn and exported.
   *
   * *"menü geçişleri futures ve portfolyoya geçerken ana ekran görünmesi
   * oluyor"*: the portfolio's shell faded in from nothing, ground included,
   * so the veil lifted onto a half-drawn screen and the chart showed through
   * — measured, 21–24% of it for a tenth of a second on the way to the
   * portfolio and up to 16% on the way to the derivatives page. *"futures
   * kısmında aktif olmayan yerlere tıklayınca kapanması gerekiyor"*: it
   * closed only on a press that landed on the shell, which the page covers.
   * And the account's value and its record as a file were asked for with it.
   */
  {
    const vm = require("vm");
    const sb = { console, Math, Number, Array, isFinite, JSON, Object, String, BigInt };
    vm.createContext(sb);
    for (const f of ["practice-math.js", "practice-model.js"]) {
      vm.runInContext(require("fs").readFileSync(path.join(__dirname, "..", "src", f), "utf8"), sb);
    }
    vm.runInContext(`var s = practiceEmptySession();
      for (const [a, b, q] of [[1000, 1100, 2], [1100, 1040, 1], [1040, 1180, 3]]) {
        s = practiceOpen(s, { coin: "BTC", side: "long", qty: 1000 * q, leverage: 5 }, a * 10000).state;
        const id = Object.keys(s.positions)[0];
        s = practiceReduce(s, id, s.positions[id].qty, b * 10000, "close").state;
      }
      s = practiceDeposit(s, 250000).state || s;`, sb);
    const ACCOUNT = JSON.stringify(vm.runInContext("s", sb));
    const LEDGER = vm.runInContext("s.ledger.length", sb);

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_practice_enabled", "true");
      localStorage.setItem("crypto_chart_practice_consent", "true");
      localStorage.setItem("crypto_chart_practice", ${JSON.stringify(ACCOUNT)});
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);

    /* How much of the chart shows at the window's centre, frame by frame,
       through every opaque layer over it and the swap's veil (which takes no
       pointer, so it is read on its own). */
    const SAMPLE = `(async () => {
      const seen = () => {
        let through = 1;
        for (const n of document.elementsFromPoint(innerWidth * 0.45, innerHeight * 0.62)) {
          if (n.closest("[data-chart-surface]")) break;
          let a = 1;
          for (let m = n; m && m !== document.documentElement; m = m.parentElement) a *= Number(getComputedStyle(m).opacity);
          const bg = getComputedStyle(n).backgroundColor;
          if (!/rgba\\([^)]*, 0(\\.\\d+)?\\)|transparent/.test(bg)) through *= 1 - a;
        }
        const v = document.querySelector("[data-panel-veil]");
        return through * (1 - (v ? Number(getComputedStyle(v).opacity) : 0));
      };
      const t0 = performance.now();
      let most = 0;
      await new Promise((done) => {
        const tick = () => { most = Math.max(most, seen()); performance.now() - t0 < 700 ? requestAnimationFrame(tick) : done(); };
        tick();
      });
      return Math.round(most * 100);
    })()`;
    const leaks = {};
    for (const [from, to] of [["s", "portfolio"], ["n", "futures"]]) {
      await page.keyboard.press(from);
      await page.waitForTimeout(1200);
      const sampling = page.evaluate(SAMPLE);
      await page.click(`[data-screen-tab='${to}']`);
      leaks[`${from}→${to}`] = await sampling;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
    }
    /* With the shell's own fade restored, 21% and 16%. */
    check(Object.values(leaks).every((p) => p <= 2),
      "a swap to the portfolio or the derivatives page never shows the chart", JSON.stringify(leaks));

    /* One × per screen, in the corner; the news and the base rates had their
       own besides, and no screen may draw a second one. */
    const closes = {};
    for (const [key, name] of [["n", "news"], ["b", "baserates"]]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(1000);
      /* Reachable ones only: the drawers behind a screen are mounted and
         carry their own ×, and a × nobody can press is not a second one. */
      closes[name] = await page.evaluate(`[...document.querySelectorAll("button")]
        .filter((b) => {
          if ((b.textContent || "").trim() !== "×") return false;
          const r = b.getBoundingClientRect();
          if (!r.width) return false;
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return Boolean(top && (top === b || b.contains(top)));
        }).length`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
    }
    check(closes.news === 1 && closes.baserates === 1, "the news and the base rates each have one ×", JSON.stringify(closes));

    /* The derivatives page: a press on its padding or its text stays; a
       press in a gap between its cards, or under them, closes it. */
    const open = () => page.evaluate(`Boolean(document.querySelector("[data-practice-page]"))`);
    await page.keyboard.press("f");
    await page.waitForTimeout(1200);
    const spots = await page.evaluate(`(() => {
      const framed = [...document.querySelectorAll("[data-practice-page] *")].filter((n) => {
        const cs = getComputedStyle(n);
        return ["Top", "Right", "Bottom", "Left"].filter((s) => parseFloat(cs["border" + s + "Width"]) > 0).length >= 3 &&
          n.getBoundingClientRect().width > 300;
      }).map((n) => n.getBoundingClientRect());
      const left = framed.filter((q) => q.left < 400).sort((a, b) => a.top - b.top)[0];
      const right = framed.filter((q) => q.left > 600).sort((a, b) => a.top - b.top)[0];
      const eq = document.querySelector("[data-practice-equity]").getBoundingClientRect();
      return {
        card: { x: Math.round(right.left + 6), y: Math.round(right.top + 60) },
        text: { x: Math.round(eq.left + 20), y: Math.round(eq.top + eq.height / 2) },
        gap: { x: Math.round((left.right + right.left) / 2), y: Math.round(right.top + 120) },
      };
    })()`);
    const pressed = {};
    for (const k of ["card", "text", "gap"]) {
      if (!(await open())) {
        await page.keyboard.press("f");
        await page.waitForTimeout(1200);
      }
      await page.mouse.click(spots[k].x, spots[k].y);
      await page.waitForTimeout(600);
      pressed[k] = await open();
    }
    /* Pressed with the old rule (the shell alone), the gap stays open. */
    check(pressed.card && pressed.text && !pressed.gap,
      "the derivatives page closes on a press on nothing, and not on a card or its words", JSON.stringify(pressed));

    /* The account's value: every recorded event, the start and now; what it
       made is the head's own figure, deposits aside; the file is every row. */
    await page.keyboard.press("f");
    await page.waitForTimeout(1200);
    await page.click("[data-practice-readings-card] button:has-text('Account value')");
    await page.waitForTimeout(500);
    const value = await page.evaluate(`(() => {
      const v = document.querySelector("[data-practice-readings='value']");
      const head = document.body.innerText.match(/SINCE START\\s+([+−-][0-9.,]+)/i);
      const made = v ? (v.innerText.match(/([+−-][0-9.,]+) USDT\\s+MADE/i) || [])[1] : null;
      return v ? { points: Number(v.getAttribute("data-practice-value-points")), path: Boolean(v.querySelector("path.pv-line")),
        made, head: head ? head[1] : null } : null;
    })()`);
    check(value && value.points === LEDGER + 2 && value.path,
      "the account value is drawn through every recorded event, from the start to now",
      JSON.stringify({ value, ledger: LEDGER }));
    check(value && value.made && value.made === value.head,
      "…and what it says was made is the head's own figure, deposits aside", JSON.stringify(value));
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click("[data-practice-export='csv']"),
    ]);
    const rows = require("fs").readFileSync(await download.path(), "utf8").trim().split("\n");
    check(/\.csv$/.test(download.suggestedFilename()) && rows[0].startsWith("event,") && rows.length - 1 === LEDGER,
      "Export CSV downloads one row per recorded event", `${download.suggestedFilename()} · ${rows.length - 1} of ${LEDGER}`);
    check(errors.length === 0, "nothing threw across the screens", errors.join(" | "));
    await ctx.close();
  }

  /* §51 — the keyboard shortcuts are a page of Settings, and every menu has
   * a key. 26 Sep 2026, *"keyboard shortcut'ları ayrı bir menü açılıyor…
   * ayarlar içerisinde açılmalı ve shortcut'ı olmayan menülere shortcut
   * vermeliyiz"*: "?" opened a card of its own in the middle of the window —
   * the one dialog left once every panel had become a screen or a drawer —
   * and the two columns and Settings' own menu had no key at all.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(`
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      localStorage.setItem("crypto_chart_portfolio", JSON.stringify([{ coin: "BTC", amount: 0.5 }]));
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1200);

    const where = () => page.evaluate(`(() => {
      const card = document.querySelector("[data-settings-card]");
      const pane = document.querySelector("[data-settings-section]");
      const list = document.querySelector("[data-shortcuts]");
      const screens = document.querySelector("[data-screen-tabs]");
      const current = card && card.querySelector("nav [aria-current='page']");
      const a = document.activeElement;
      return {
        settings: Boolean(card),
        section: pane ? pane.getAttribute("data-settings-section") : null,
        inside: Boolean(list && card && card.contains(list)),
        keys: list ? list.querySelectorAll("kbd").length : 0,
        /* The item's name, not its key: each menu item carries its key
           before the name since 27 Sep 2026 (KeyCap). */
        current: current ? (current.querySelector("span > span") || current).innerText.trim() : null,
        screen: screens ? screens.getAttribute("data-screen-tabs") : null,
        chartShown: (document.querySelector("[data-drawer-tabs]") || { getAttribute: () => null })
          .getAttribute("data-drawer-tabs-shown"),
        screensShown: screens ? screens.getAttribute("data-screen-tabs-shown") : null,
        focusLeft: Boolean(a && a.closest && a.closest("[data-drawer-tabs]")),
        focusRight: Boolean(a && a.closest && a.closest("[data-screen-tabs]")),
        focusTab: a ? a.getAttribute("data-screen-tab") || a.getAttribute("data-drawer-tab") : null,
      };
    })()`);

    /* "?" from the chart: Settings, on its shortcuts page, and the list is
       inside Settings' own card rather than a card of its own. */
    await page.keyboard.press("?");
    await page.waitForTimeout(900);
    let at = await where();
    check(at.settings && at.section === "shortcuts" && at.inside && at.keys > 30,
      "? opens Settings on its shortcuts page, the list inside Settings' own card", JSON.stringify(at));
    check(at.current === "Keyboard shortcuts",
      "…and the menu marks that page as the one on screen", JSON.stringify(at.current));
    await page.keyboard.press("?");
    await page.waitForTimeout(700);
    at = await where();
    check(!at.settings, "? again, on that page, closes Settings — as S would", JSON.stringify(at));

    /* From another screen: across it, the way a press on Settings' tab goes. */
    await page.keyboard.press("p");
    await page.waitForTimeout(1100);
    await page.keyboard.press("?");
    await page.waitForTimeout(1300);
    at = await where();
    check(at.settings && at.section === "shortcuts" && at.screen === "settings",
      "? from the portfolio swaps it for Settings, on the shortcuts page", JSON.stringify(at));

    /* Settings' menu is walked by number, 1 at the top and 0 the tenth, and
       each item says its number where the pointer rests. */
    const walked = [];
    for (const k of ["3", "1", "0", "2", "9"]) {
      await page.keyboard.press(k);
      await page.waitForTimeout(250);
      walked.push(`${k}:${(await where()).section}`);
    }
    check(walked.join(" ") === "3:basics 1:coins 0:permissions 2:modes 9:data",
      "the number keys walk Settings' menu, top to bottom", walked.join(" "));
    const titles = await page.evaluate(`[...document.querySelectorAll("[data-settings-card] nav button")]
      .filter((b) => b.getAttribute("title") !== null && (b.hasAttribute("data-tab") || b.hasAttribute("data-pref-group")))
      .map((b) => b.getAttribute("title"))`);
    const numbered = titles.map((t) => (t.match(/\((.)\)$/) || [])[1] || "none");
    check(numbered.join("") === "1234567890?",
      "…and every item in the menu names its key", titles.join(" · "));
    await page.focus("[data-settings-card] nav input");
    await page.keyboard.type("3");
    await page.waitForTimeout(300);
    at = await where();
    check(at.section === "search",
      "…but a digit typed into the search box is a search, not a jump", JSON.stringify(at.section));
    await page.fill("[data-settings-card] nav input", "");
    await page.locator("[data-settings-card] nav input").blur();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);

    /* "," and "." pull the two columns out, with the focus in them; the same
       key again puts the column back and takes the focus with it. */
    await page.keyboard.press(",");
    await page.waitForTimeout(450);
    const left = await where();
    await page.keyboard.press(",");
    await page.waitForTimeout(700);
    const leftBack = await where();
    check(left.chartShown === "true" && left.focusLeft && !left.settings,
      ", pulls out the chart's column and moves the focus into it", JSON.stringify(left));
    check(leftBack.chartShown === "false" && !leftBack.focusLeft,
      "…and , again puts it away", JSON.stringify(leftBack));
    await page.keyboard.press(".");
    await page.waitForTimeout(450);
    const right = await where();
    await page.keyboard.press(".");
    await page.waitForTimeout(700);
    const rightBack = await where();
    check(right.screensShown === "true" && right.focusRight,
      ". pulls out the screens' column and moves the focus into it", JSON.stringify(right));
    check(rightBack.screensShown === "false" && !rightBack.focusRight,
      "…and . again puts it away", JSON.stringify(rightBack));
    await page.keyboard.press(",");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    const entered = await page.evaluate(`(document.querySelector("[data-drawer-tabs]") || { getAttribute: () => null }).getAttribute("data-drawer-tabs")`);
    check(entered && entered !== "none", "…and Enter there opens the tab the focus is on", String(entered));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    /* With a screen up, "." lands on that screen's raised tab. */
    await page.keyboard.press("p");
    await page.waitForTimeout(1100);
    await page.keyboard.press(".");
    await page.waitForTimeout(450);
    at = await where();
    check(at.screen === "portfolio" && at.focusRight && at.focusTab === "portfolio",
      "with a screen open, . puts the focus on that screen's tab", JSON.stringify(at));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);

    /* Every tab in both columns, and both pulls, names its key — and every
       key named there is one the shortcuts page lists. */
    const named = await page.evaluate(`(() => {
      const listed = new Set(SHORTCUT_GROUPS.flatMap((g) => g.items.flatMap((i) => i.keys)));
      return [...document.querySelectorAll("[data-drawer-tab], [data-screen-tab], [data-drawer-tabs-handle], [data-screen-tabs-handle]")]
        .map((b) => {
          const t = b.getAttribute("title") || "";
          const k = (t.match(/\\((.)\\)$/) || [])[1] || null;
          return { t, k, listed: Boolean(k && listed.has(k)) };
        });
    })()`);
    const unkeyed = named.filter((n) => !n.k || !n.listed).map((n) => n.t);
    check(named.length >= 10 && unkeyed.length === 0,
      "every tab in both columns, and both pulls, names a key the shortcuts page lists",
      `${named.length} · missing: ${unkeyed.join(" · ")}`);
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §52 — near the pull counts as on it. 26 Sep 2026, *"sadece üstlerine
   * gelince yavaşça açılmayı birazcık daha uzatalım, sağa ve sola doğru…
   * hafiften yakınlaşması bile orasının açılmasını sağlasın"*: the pulls
   * opened only with the pointer on their 14px. The margin (SPINE_NEAR_X
   * inward, SPINE_NEAR_Y above and below) is a distance, not a box, so it
   * takes no press, and it is still on the dwell, so passing opens nothing.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1");');
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1200);

    const geo = await page.evaluate(`(() => {
      const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      return { left: box("[data-drawer-tabs-handle]"), right: box("[data-screen-tabs-handle]"),
        near: [SPINE_NEAR_X, SPINE_NEAR_Y], dwell: SPINE_DWELL_MS, w: innerWidth };
    })()`);
    const [NX] = geo.near;
    const shown = () => page.evaluate(`({
      left: document.querySelector("[data-drawer-tabs]").getAttribute("data-drawer-tabs-shown"),
      right: document.querySelector("[data-screen-tabs]").getAttribute("data-screen-tabs-shown"),
    })`);
    const pullX = (sel) => page.evaluate(`new DOMMatrixReadOnly(getComputedStyle(document.querySelector("${sel}")).transform).m41`);
    const midY = (b) => (b.top + b.bottom) / 2;
    const away = async () => {
      await page.mouse.move(640, 520, { steps: 4 });
      await page.waitForTimeout(geo.dwell);
    };
    await away();

    /* Resting in the margin, off the pull: the pull slides out over the
       dwell and the column follows. */
    const lx = geo.left.right + NX * 0.75;
    await page.mouse.move(lx, midY(geo.left), { steps: 6 });
    await page.waitForTimeout(geo.dwell * 0.45);
    const sliding = await pullX("[data-drawer-tabs-handle]");
    const hit = await page.evaluate(`(() => { const e = document.elementFromPoint(${lx}, ${midY(geo.left)});
      return e ? (e.closest("[data-drawer-tabs-handle]") ? "pull" : e.tagName) : null; })()`);
    await page.waitForTimeout(geo.dwell);
    const leftOpen = await shown();
    check(sliding > -5 && sliding < 0,
      "resting near the left pull slides it out over the dwell", `translateX ${sliding}`);
    check(leftOpen.left === "true",
      `…and brings the chart's column out, ${Math.round(NX * 0.75)}px past the pull's edge`, JSON.stringify(leftOpen));
    check(hit !== "pull", "…while a press there still lands on what is under it", String(hit));
    await away();
    check((await shown()).left === "false", "…and moving away puts it back", "");

    /* Passing through the margin opens nothing; beyond it, resting opens nothing. */
    await page.mouse.move(lx, midY(geo.left), { steps: 3 });
    await page.waitForTimeout(geo.dwell * 0.3);
    await page.mouse.move(640, 520, { steps: 3 });
    await page.waitForTimeout(geo.dwell * 1.2);
    const passed = await shown();
    await page.mouse.move(geo.left.right + NX + 24, midY(geo.left), { steps: 6 });
    await page.waitForTimeout(geo.dwell * 1.4);
    const beyond = await shown();
    check(passed.left === "false" && beyond.left === "false",
      "passing through the margin opens nothing, and resting beyond it opens nothing",
      JSON.stringify({ passed, beyond }));
    await away();

    /* The right pull, mirrored; and from the margin onto a tab it stays out. */
    const rx = geo.right.left - NX * 0.75;
    await page.mouse.move(rx, midY(geo.right), { steps: 6 });
    await page.waitForTimeout(geo.dwell * 1.45);
    const rightOpen = await shown();
    check(rightOpen.right === "true", "resting near the right pull brings the screens' column out", JSON.stringify(rightOpen));
    const tab = await page.evaluate(`(() => { const r = document.querySelector("[data-screen-tab]").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await page.mouse.move(tab.x, tab.y, { steps: 6 });
    await page.waitForTimeout(geo.dwell);
    check((await shown()).right === "true", "…and moving from the margin onto a tab keeps it out", "");
    await away();
    check((await shown()).right === "false", "…until the pointer leaves", "");
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §53 — the book as a depth curve (27 Sep 2026): cumulative displayed
   * notional against distance from the mid, per side, as in Figure 2 of the
   * user's paper — and nothing past the last level read. A stubbed book with
   * a known shape: asks from 100000.1 and bids from 99999.9, 0.4 apart,
   * 0.01 BTC a contract, so 400 levels reach 15.97 bp either side.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const asked = [];
    const size = (i) => 20 + (i % 7) * 11;
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "100000.00", currency: "USD" } }));
      if (u.includes("okx.com") && u.includes("market/ticker")) {
        return r.fulfill(json({ code: "0", data: [{ last: "100000", open24h: "100000", high24h: "100000", low24h: "100000" }] }));
      }
      if (u.includes("public/instruments") && u.includes("instId=")) {
        return r.fulfill(json({ code: "0", data: [{ ctVal: "0.01", ctValCcy: "BTC", tickSz: "0.1", lotSz: "0.01" }] }));
      }
      if (u.includes("market/books")) {
        const n = Number((u.match(/sz=(\d+)/) || [])[1]) || 8;
        asked.push(n);
        const asks = Array.from({ length: n }, (_, i) => [(100000.1 + i * 0.4).toFixed(1), String(size(i)), "0", "3"]);
        const bids = Array.from({ length: n }, (_, i) => [(99999.9 - i * 0.4).toFixed(1), String(size(i)), "0", "3"]);
        return r.fulfill(json({ code: "0", data: [{ asks, bids }] }));
      }
      return r.fulfill(json({}));
    });
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("f");
    await page.waitForTimeout(1500);
    const before = asked.length;
    await page.click("[data-practice-book-tab] button:has-text('Depth')");
    await page.waitForTimeout(1500);
    const d = await page.evaluate(`(() => {
      const box = document.querySelector("[data-practice-depth]");
      if (!box) return null;
      const paths = [...box.querySelectorAll("path")].map((p) => p.getAttribute("d"));
      const xs = paths.join(" ").match(/-?[0-9.]+(?=,)/g) || [];
      const table = box.querySelector("[data-practice-depth-table]");
      const cells = table ? [...table.children].map((c) => c.innerText.trim()) : [];
      /* The whole book the stub sent, in money, formatted by the page's own
         formatter: what "All read" must say. */
      let a = 0, b = 0;
      for (let i = 0; i < 400; i++) {
        const sz = (20 + (i % 7) * 11) * 0.01;
        a += (100000.1 + i * 0.4) * sz;
        b += (99999.9 - i * 0.4) * sz;
      }
      return {
        coin: box.getAttribute("data-practice-depth"),
        levels: box.getAttribute("data-practice-depth-levels"),
        reach: box.getAttribute("data-practice-depth-reach"),
        paths: paths.length,
        nan: paths.some((p) => /NaN|Infinity/.test(p || "")),
        maxX: Math.max(...xs.map(Number)),
        marks: table ? Number(table.getAttribute("data-practice-depth-table")) : null,
        cells,
        wantAll: [formatWidgetUsdt(b), formatWidgetUsdt(a)],
        axis: [...box.querySelectorAll("div")].map((n) => n.innerText).find((t) => /distance from the mid/.test(t)) || "",
      };
    })()`);
    check(asked.slice(before).includes(400),
      "the Depth tab reads the deep book, all 400 levels a side", asked.join(","));
    check(d && d.paths === 2 && !d.nan && d.levels === "400/400",
      "…and draws one curve per side, every coordinate a number", JSON.stringify(d && { paths: d.paths, nan: d.nan, levels: d.levels }));
    check(d && d.reach === "15.970/15.970" && d.maxX <= 100.0001,
      "…ending at the last level read, never past it", JSON.stringify(d && { reach: d.reach, maxX: d.maxX }));
    const allAt = d ? d.cells.indexOf("All read") : -1;
    check(d && d.marks === 4 && allAt > 0 && d.cells[allAt + 1] === d.wantAll[0] && d.cells[allAt + 2] === d.wantAll[1],
      "the table reads it at 1, 2, 5 and 10 bp — the marks inside the reach — and in full",
      JSON.stringify(d && { marks: d.marks, all: d.cells.slice(allAt, allAt + 3), want: d.wantAll }));
    check(d && /16 bp/.test(d.axis), "…with the axis ending at the reach", d && d.axis);
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §54 — US CPI releases (27 Sep 2026): marked on the chart where they
   * fall, said under the price when one is near, counted on the base-rate
   * screen — and nothing asked until that screen is opened. The clock is set
   * to 26 hours before the 10 November 2026 release; the year's prices are
   * stubbed as one point a day up to that clock; the minute candles move
   * 0.1% per half hour before each release and 1% in the half hour after.
   */
  {
    const cfg = require("fs").readFileSync(path.join(__dirname, "..", "src", "config.js"), "utf8");
    const cal = require("vm").runInNewContext(cfg.match(/const CPI_RELEASES_UTC = (\[[\s\S]*?\]);/)[1]).map(Date.parse);
    const REL = Date.parse("2026-11-10T13:30Z");
    const NOW = REL - 26 * 3600 * 1000;
    const YEAR = Array.from({ length: 366 }, (_, i) => ({
      price: (60000 + 8000 * Math.sin(i / 20)).toFixed(2),
      time: Math.floor((NOW - (365 - i) * 86400000) / 1000),
    }));
    const inRange = cal.filter((t) => t >= YEAR[0].time * 1000 && t <= YEAR[YEAR.length - 1].time * 1000);
    const logc = (m) => (m <= -1 ? 0.001 * (m + 1) / 30 : 0.01 * Math.min(1, (m + 1) / 30));
    const open = async (macro) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      const minute = [];
      await ctx.route("**/*", (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        if (u.includes("granularity=60")) {
          minute.push(u);
          const start = Date.parse(decodeURIComponent(u.match(/start=([^&]+)/)[1]));
          const end = Date.parse(decodeURIComponent(u.match(/end=([^&]+)/)[1]));
          const at = start + 211 * 60000;
          const rows = [];
          for (let t = start / 1000; t < end / 1000; t += 60) {
            const c = 100 * Math.exp(logc((t * 1000 - at) / 60000));
            rows.push([t, c, c, c, c, 1]);
          }
          return r.fulfill(json(rows.reverse()));
        }
        if (u.includes("historic")) {
          return r.fulfill(json({ data: { prices: u.includes("period=year") ? YEAR : PRICES } }));
        }
        if (u.includes("spot")) return r.fulfill(json({ data: { amount: "60000.00", currency: "USD" } }));
        return r.fulfill(json({ data: {} }));
      });
      await ctx.addInitScript(`(() => {
        localStorage.setItem("crypto_chart_onboarding_seen", "1");
        ${macro === false ? 'localStorage.setItem("crypto_chart_macro_events", "false");' : ""}
        const real = Date.now.bind(Date);
        const off = ${NOW} - real();
        Date.now = () => real() + off;
      })()`);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(1200);
      await page.keyboard.press("5");
      await page.waitForTimeout(2500);
      const read = () => page.evaluate(`(() => ({
        marks: [...document.querySelectorAll("[data-events] line[data-macro]")]
          .filter((l) => getComputedStyle(l).display !== "none" && l.getAttribute("visibility") !== "hidden")
          .map((l) => Number(l.getAttribute("data-macro"))),
        xs: [...document.querySelectorAll("[data-events] line[data-macro]")]
          .filter((l) => getComputedStyle(l).display !== "none" && l.getAttribute("visibility") !== "hidden")
          .map((l) => Number(l.getAttribute("x1"))),
        width: (() => { const g = document.querySelector("[data-events]"); const svg = g && g.ownerSVGElement;
          return svg ? ${PLOT_BOX}(svg).w : null; })(),
        tags: [...document.querySelectorAll("[data-events] text")].filter((t) => getComputedStyle(t).display !== "none").map((t) => t.textContent),
        line: (document.querySelector("[data-cpi-line]") || {}).innerText || null,
        lineKind: (document.querySelector("[data-cpi-line]") || { getAttribute: () => null }).getAttribute("data-cpi-line"),
      }))()`);
      return { ctx, page, errors, minute, read };
    };

    const on = await open(true);
    const r = await on.read();
    const same = r.marks.length === inRange.length && r.marks.every((t, i) => t === inRange[i]);
    check(same && r.tags.every((t) => t === "CPI"),
      "the year range marks every CPI release inside it, each tagged CPI",
      `${r.marks.length} drawn, ${inRange.length} in the calendar`);
    /* With no board the series spans the plot, so a release sits where its
       instant falls between the first and last price — to the pixel. */
    const t0 = YEAR[0].time * 1000;
    const t1 = YEAR[YEAR.length - 1].time * 1000;
    const want = inRange.map((t) => ((t - t0) / (t1 - t0)) * r.width);
    const miss = r.xs.map((x, i) => Math.abs(x - want[i]));
    check(r.xs.length === want.length && miss.every((d) => d < 1),
      "…each at the x its instant falls on, within a pixel", `worst ${Math.max(...miss).toFixed(2)}px of ${r.width}`);
    check(r.lineKind === "soon" && /^US CPI tomorrow/.test(r.line || ""),
      "26 hours before a release the line under the price says it is tomorrow", String(r.line));
    check(on.minute.length === 0, "…and no minute candle has been asked for yet", on.minute.join(" "));
    await on.page.keyboard.press("b");
    await on.page.waitForTimeout(4000);
    const base = await on.page.evaluate(`(() => {
      const row = document.querySelector("[data-base-cpi-row]");
      return { row: row && row.getAttribute("data-base-cpi-row"), text: row ? row.innerText : "" };
    })()`);
    check(on.minute.length === 12 && base.row === "12/12" && /about 1\.5 would/.test(base.text),
      "the base-rate screen reads the last twelve releases, one request each, and counts them against 1.5",
      JSON.stringify({ asked: on.minute.length, row: base.row }));
    check(on.errors.length === 0, "nothing threw", on.errors.join(" | "));
    await on.ctx.close();

    const off = await open(false);
    const r2 = await off.read();
    check(r2.marks.length === 0 && r2.line === null,
      "switched off, no marker and no line", JSON.stringify({ marks: r2.marks.length, line: r2.line }));
    await off.ctx.close();
  }

  /* §55 — the chart companion (27 Sep 2026): the chart names a setup where
   * it is, with the coin's record for it — and asks for nothing until it is
   * switched on. The daily history is flat at 95 but for one early dip and,
   * at its end, the drawn head and shoulders of test-price-patterns.js cut at
   * its breakout bar: the pattern is complete and nothing has happened since,
   * so it is drawn in full with a record of none resolved.
   */
  {
    const DAY = 86400;
    const END = Math.floor(Date.now() / 1000 / DAY) * DAY - DAY;
    const knots = [[0, 95], [20, 100], [30, 90], [40, 110], [50, 90], [60, 101], [80, 70]];
    const drawn = [];
    for (let k = 0; k < knots.length - 1; k++) {
      const [a, pa] = knots[k];
      const [b, pb] = knots[k + 1];
      for (let i = a; i < b; i++) drawn.push(pa + ((pb - pa) * (i - a)) / (b - a));
    }
    const N = 400;
    const tail = drawn.slice(0, 69); // through the breakout bar
    const closes = Array.from({ length: N }, (_, i) => {
      const j = i - (N - tail.length);
      if (j >= 0) return tail[j];
      return i === 50 ? 60 : 95;
    });
    const bar = (i) => {
      const c = closes[i];
      const w = i >= N - tail.length || i === 50 ? 0.5 : 0;
      return { t: END - (N - 1 - i) * DAY, lo: c - w, hi: c + w, c };
    };
    const open = async (on, compare) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      const daily = [];
      await ctx.route("**/*", (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        if (u.includes("granularity=86400")) {
          daily.push(u);
          const start = Date.parse(decodeURIComponent(u.match(/start=([^&]+)/)[1])) / 1000;
          const end = Date.parse(decodeURIComponent(u.match(/end=([^&]+)/)[1])) / 1000;
          const rows = [];
          for (let i = N - 1; i >= 0; i--) {
            const b = bar(i);
            if (b.t >= start && b.t < end) rows.push([b.t, b.lo, b.hi, b.c, b.c, 1]);
          }
          return r.fulfill(json(rows));
        }
        if (u.includes("historic")) {
          const year = Array.from({ length: 366 }, (_, k) => {
            const b = bar(N - 366 + k);
            return { price: b.c.toFixed(2), time: b.t };
          });
          return r.fulfill(json({ data: { prices: u.includes("period=year") ? year : PRICES } }));
        }
        if (u.includes("spot")) return r.fulfill(json({ data: { amount: "88.60", currency: "USD" } }));
        return r.fulfill(json({ data: {} }));
      });
      await ctx.addInitScript(
        'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
          (on ? 'localStorage.setItem("crypto_chart_companion", "true");' : ""),
      );
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.keyboard.press("5");
      await page.waitForTimeout(2500);
      if (compare) {
        await page.keyboard.press("c");
        await page.waitForTimeout(500);
        await page.keyboard.type("ETH");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(1500);
      }
      const read = await page.evaluate(`(() => {
        const vis = (n) => getComputedStyle(n).display !== "none" && n.getAttribute("visibility") !== "hidden";
        const pick = (sel) => [...document.querySelectorAll(sel)].filter(vis);
        const nums = [...document.querySelectorAll("[data-companion-neck], [data-companion-target], [data-companion-stop]")]
          .filter(vis).flatMap((l) => ["x1", "x2", "y1", "y2"].map((a) => Number(l.getAttribute(a))));
        return {
          names: pick("[data-companion-name]").map((t) => t.textContent),
          record: (pick("[data-companion-record]")[0] || {}).textContent || null,
          neck: pick("[data-companion-neck]").length,
          target: pick("[data-companion-target]").length,
          stop: pick("[data-companion-stop]").length,
          finite: nums.length > 0 && nums.every(Number.isFinite),
          op: (pick("[data-companion-name]")[0] || { getAttribute: () => null }).getAttribute("opacity"),
        };
      })()`);
      /* Pointing at the name opens its card — with a real mouse, since the
         chart finds marks from the pointer, not from the element under it. */
      let card = null;
      const nameAt = await page.evaluate(`(() => { const n = [...document.querySelectorAll("[data-companion-name]")].filter((t) => t.getAttribute("visibility") !== "hidden")[0]; if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (nameAt) {
        await page.mouse.move(nameAt.x, nameAt.y);
        await page.waitForTimeout(300);
        card = await page.evaluate(`(() => { const vis = (n) => getComputedStyle(n).display !== "none" && n.getAttribute("visibility") !== "hidden"; const t = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((n) => n.textContent).join(" "); return { title: t("[data-companion-card-title]"), record: t("[data-companion-card-record]"), claim: t("[data-companion-card-claim]"), action: t("[data-companion-card-action]"), cards: [...document.querySelectorAll("[data-companion-card]")].filter(vis).length }; })()`);
      }
      await ctx.close();
      return { read, card, daily, errors };
    };

    const off = await open(false, false);
    check(off.daily.length === 0 && off.read.names.length === 0,
      "switched off (the default), the companion asks for no daily history and names nothing",
      JSON.stringify({ asked: off.daily.length, names: off.read.names }));
    const on = await open(true, false);
    check(on.read.names.join(",") === "Head and shoulders",
      "switched on, it names the head and shoulders where it completed", JSON.stringify(on.read.names));
    check(on.read.record === null, "…with only its name on the chart — the record is in its card", String(on.read.record));
    check(on.card && on.card.cards === 1 && /^Head and shoulders · said to mark a top/.test(on.card.title) &&
      /0 of 0 that resolved reached the measured move first · found 1 time/.test(on.card.record) && /too few to compare/.test(on.card.record),
      "pointing at its name opens its card: the claim in reported speech, and this coin's count with its size", JSON.stringify(on.card));
    check(on.read.neck === 1 && on.read.target === 1 && on.read.stop === 1 && on.read.finite,
      "…its neckline, measured target and invalidation drawn, every coordinate a number", JSON.stringify(on.read));
    check(on.read.op === "0.95", "…in full, because it has reached neither yet", String(on.read.op));
    check(on.errors.length === 0, "nothing threw", on.errors.join(" | "));
    const cmp = await open(true, true);
    check(cmp.read.names.length === 0, "under a comparison — percent change on the axis — it stands down", JSON.stringify(cmp.read.names));
  }

  /* §56 — strategy setups in the companion (27 Sep 2026): each setup's
   * latest entry, when recent, numbered on the chart and listed in its
   * corner with its record — and the twelve on the base-rate screen, with
   * no row calling one better or worse. The history is flat at 100 for 380
   * days and then rises 101…105, so several setups enter on the same close
   * four days before the end and share one ring.
   */
  {
    const DAY = 86400;
    const END = Math.floor(Date.now() / 1000 / DAY) * DAY - DAY;
    const N = 385;
    const closes = Array.from({ length: N }, (_, i) => (i < N - 5 ? 100 : 100 + (i - (N - 6))));
    const bar = (i) => ({ t: END - (N - 1 - i) * DAY, c: closes[i] });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("granularity=86400")) {
        /* The crosshair's own candles (asked once the pointer is on the
           chart) carry no window; answer them with the whole history. */
        const sm = u.match(/start=([^&]+)/);
        const em = u.match(/end=([^&]+)/);
        const start = sm ? Date.parse(decodeURIComponent(sm[1])) / 1000 : -Infinity;
        const end = em ? Date.parse(decodeURIComponent(em[1])) / 1000 : Infinity;
        const rows = [];
        for (let i = N - 1; i >= 0; i--) {
          const b = bar(i);
          if (b.t >= start && b.t < end) rows.push([b.t, b.c, b.c, b.c, b.c, 1]);
        }
        return r.fulfill(json(rows));
      }
      if (u.includes("historic")) {
        const year = Array.from({ length: 366 }, (_, k) => {
          const b = bar(N - 366 + k);
          return { price: b.c.toFixed(2), time: b.t };
        });
        return r.fulfill(json({ data: { prices: u.includes("period=year") ? year : PRICES } }));
      }
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "105.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_companion", "true");');
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.keyboard.press("5");
    await page.waitForTimeout(3000);
    const chart = await page.evaluate(`(() => {
      const vis = (n) => getComputedStyle(n).display !== "none" && n.getAttribute("visibility") !== "hidden";
      return {
        list: [...document.querySelectorAll("[data-companion-setup-name]")].filter(vis).map((t) => t.textContent),
        rings: [...document.querySelectorAll("[data-companion-ring]")].filter(vis).map((t) => t.getAttribute("data-companion-ring")),
        plate: (() => { const p = [...document.querySelectorAll("[data-companion-list]")].filter(vis)[0]; return p ? Number(p.getAttribute("data-companion-list")) : 0; })(),
      };
    })()`);
    /* Nothing before it in a flat history, and its ten days after are not
       over: a record of nothing, said as one. */
    const breakout = chart.list.find((t) => /20-day breakout/.test(t)) || "";
    check(/· 4d ago$/.test(breakout),
      "the companion's index lists the 20-day breakout, four days ago", JSON.stringify(chart.list));
    const sameDay = chart.list.filter((t) => /· 4d ago/.test(t)).map((t) => t.split(" ")[0]);
    check(chart.plate === chart.list.length && chart.rings.includes(sameDay.join("·")),
      "…the setups entered on that close share one ring, numbered like the list", JSON.stringify({ rings: chart.rings, sameDay }));
    check(chart.list.every((t) => !/better|worse|buy|sell/i.test(t)), "…and no line says better, worse, buy or sell", chart.list.join(" | "));

    /* The card (29 Sep 2026, *"üzerine gelince veya tıklayınca açıklamalar
       yazsın"*): pointing at a row of the index opens that setup's card in
       its place; a click keeps it open with the pointer gone; a click on the
       chart puts it away. Real mouse throughout. */
    const rowAt = await page.evaluate(`(() => { const n = [...document.querySelectorAll("[data-companion-setup-name='breakout-high']")].filter((t) => t.getAttribute("visibility") !== "hidden")[0]; if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
    const cardNow = () => page.evaluate(`(() => { const vis = (n) => getComputedStyle(n).display !== "none" && n.getAttribute("visibility") !== "hidden"; const t = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((n) => n.textContent).join(" "); return { title: t("[data-companion-card-title]"), record: t("[data-companion-card-record]"), claim: t("[data-companion-card-claim]"), action: t("[data-companion-card-action]"), cards: [...document.querySelectorAll("[data-companion-card]")].filter(vis).length }; })()`);
    let hovered = null;
    let kept = null;
    let away = null;
    if (rowAt) {
      await page.mouse.move(rowAt.x, rowAt.y);
      await page.waitForTimeout(300);
      hovered = await cardNow();
      await page.mouse.click(rowAt.x, rowAt.y);
      await page.waitForTimeout(200);
      await page.mouse.move(640, 700);
      await page.waitForTimeout(300);
      kept = await cardNow();
      await page.mouse.click(640, 700);
      await page.waitForTimeout(300);
      away = await cardNow();
    }
    check(hovered && hovered.cards === 1 && /20-day breakout/.test(hovered.title) && /nothing earlier on this coin to count/.test(hovered.record) &&
      /Said to run on/.test(hovered.claim) && !/better|worse|buy|sell/i.test(hovered.title + hovered.record + hovered.claim),
      "pointing at its row opens the setup's card: what it is, what it is said to mean, and a record of nothing said as one", JSON.stringify(hovered));
    check(kept && kept.cards === 1 && /Kept open/.test(kept.action), "…a click keeps it open after the pointer has gone", JSON.stringify(kept));
    check(away && away.cards === 0, "…and a click on the chart puts it away", JSON.stringify(away));
    await page.keyboard.press("b");
    await page.waitForTimeout(3000);
    const base = await page.evaluate(`(() => ({
      rows: [...document.querySelectorAll("[data-base-setup]")].map((r) => r.getAttribute("data-base-setup")),
      now: [...document.querySelectorAll("[data-base-setup]")].filter((r) => /· now/.test(r.innerText)).map((r) => r.getAttribute("data-base-setup")),
      note: (document.querySelector("[data-base-setups-note]") || {}).innerText || "",
      judged: [...document.querySelectorAll("[data-base-setup]")].some((r) => /That is|better than|worse than/.test(r.innerText)),
    }))()`);
    check(base.rows.length === 12 && base.now.includes("breakout-high"),
      "the base-rate screen lists all twelve setups, the breakout marked as now", JSON.stringify(base.now));
    check(!base.judged && /none of these twelve was distinguishable from an ordinary day/.test(base.note),
      "…with no row judged and the test's result said once under them", base.note.slice(0, 80));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §57 — indicator lines (27 Sep 2026): classic overlays from the daily
   * candles, labelled as daily, not drawn on a range too short to hold five
   * of its days, gone under a comparison, and chosen from the chart's own
   * drawer — several at once, their names never printed over each other, and
   * None taking them all away. The stored value is the single choice the
   * setting used to be, so the first read is also the migration. A gently
   * waving daily history, so every line has values.
   */
  {
    const DAY = 86400;
    const END = Math.floor(Date.now() / 1000 / DAY) * DAY - DAY;
    const N = 420;
    const close = (i) => 100 + 10 * Math.sin(i / 15) + i * 0.05;
    const bar = (i) => ({ t: END - (N - 1 - i) * DAY, c: close(i) });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("granularity=86400")) {
        const start = Date.parse(decodeURIComponent(u.match(/start=([^&]+)/)[1])) / 1000;
        const end = Date.parse(decodeURIComponent(u.match(/end=([^&]+)/)[1])) / 1000;
        const rows = [];
        for (let i = N - 1; i >= 0; i--) {
          const b = bar(i);
          if (b.t >= start && b.t < end) rows.push([b.t, b.c - 1, b.c + 1, b.c, b.c, 1]);
        }
        return r.fulfill(json(rows));
      }
      if (u.includes("historic")) {
        const year = Array.from({ length: 366 }, (_, k) => {
          const b = bar(N - 366 + k);
          return { price: b.c.toFixed(2), time: b.t };
        });
        return r.fulfill(json({ data: { prices: u.includes("period=year") ? year : PRICES } }));
      }
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "110.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_indicator_overlay", "bollinger");');
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1500);
    const read = () => page.evaluate(`(() => {
      const vis = (n) => getComputedStyle(n).display !== "none" && n.getAttribute("visibility") !== "hidden";
      const lines = [...document.querySelectorAll("[data-overlay-line]")].filter(vis);
      const tags = [...document.querySelectorAll("[data-overlay-label]")].filter(vis);
      const boxes = tags.map((t) => t.getBoundingClientRect());
      return {
        ids: lines.filter((l) => (l.getAttribute("d") || "").length > 0).map((l) => l.getAttribute("data-overlay-line")),
        kinds: [...new Set(lines.filter((l) => (l.getAttribute("d") || "").length > 0).map((l) => l.getAttribute("data-overlay-kind")))],
        nan: lines.some((l) => /NaN|Infinity/.test(l.getAttribute("d") || "")),
        label: tags[0] ? tags[0].textContent : null,
        labels: tags.map((t) => t.textContent),
        overlap: boxes.some((a, i) => boxes.some((b, j) => j > i && a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right)),
      };
    })()`);
    const hour = await read();
    check(hour.ids.length === 0 && hour.label === null,
      "on the hour range — fewer than five of its days — no daily band is drawn", JSON.stringify(hour));
    await page.keyboard.press("5");
    await page.waitForTimeout(2500);
    const year = await read();
    check(year.ids.join(",") === "upper,mid,lower" && !year.nan && year.label === "Bollinger 20, 2σ · daily",
      "on the year, the Bollinger lines are drawn and labelled as daily, every coordinate a number", JSON.stringify(year));
    await page.keyboard.press("v");
    await page.waitForTimeout(700);
    await page.click("[data-chart-settings='open'] [data-overlay-choice='supertrend']");
    await page.waitForTimeout(800);
    const st = await read();
    check(st.kinds.join(",") === "bollinger,supertrend" && st.labels.length === 2 && !st.nan,
      "pressed in the chart's drawer, Supertrend is drawn beside the Bollinger lines rather than instead of them", JSON.stringify(st));
    check(!st.overlap, "…and the two names are not printed over each other", JSON.stringify(st.labels));
    const stored = await page.evaluate('localStorage.getItem("crypto_chart_indicator_overlays")');
    check(stored === '["bollinger","supertrend"]', "…kept as a set under the new key, the old single choice read as its first member", stored);
    await page.click("[data-chart-settings='open'] [data-overlay-choice='none']");
    await page.waitForTimeout(800);
    const none = await read();
    const nonePressed = await page.evaluate(`document.querySelector("[data-chart-settings='open'] [data-overlay-choice='none']").getAttribute("aria-pressed")`);
    check(none.ids.length === 0 && none.labels.length === 0 && nonePressed === "true",
      "None takes every line away and is the one pill pressed", JSON.stringify({ none, nonePressed }));
    await page.click("[data-chart-settings='open'] [data-overlay-choice='averages']");
    await page.waitForTimeout(800);
    const avg = await read();
    check(avg.kinds.join(",") === "averages" && avg.ids.join(",") === "sma50,sma200",
      "…and a pill pressed after it starts a new set", JSON.stringify(avg));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.keyboard.press("c");
    await page.waitForTimeout(500);
    await page.keyboard.type("ETH");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    const cmp = await read();
    check(cmp.ids.length === 0, "under a comparison the lines stand down", JSON.stringify(cmp));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §58 — the companion's metrics one by one (27 Sep 2026, "bu metrikler
   * grafik ayarlarında da olsun"): under the companion's switch, while it
   * is on, a chip for each of the four patterns and twelve setups, in the
   * chart's drawer as in Settings. A chip pressed off takes that setup off
   * the chart and out of its list and keeps it off across a reload; the
   * others stay, numbered afresh. §56's history: several setups entered on
   * the same close four days before the end.
   */
  {
    const DAY = 86400;
    const END = Math.floor(Date.now() / 1000 / DAY) * DAY - DAY;
    const N = 385;
    const closes = Array.from({ length: N }, (_, i) => (i < N - 5 ? 100 : 100 + (i - (N - 6))));
    const bar = (i) => ({ t: END - (N - 1 - i) * DAY, c: closes[i] });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("granularity=86400")) {
        const start = Date.parse(decodeURIComponent(u.match(/start=([^&]+)/)[1])) / 1000;
        const end = Date.parse(decodeURIComponent(u.match(/end=([^&]+)/)[1])) / 1000;
        const rows = [];
        for (let i = N - 1; i >= 0; i--) {
          const b = bar(i);
          if (b.t >= start && b.t < end) rows.push([b.t, b.c, b.c, b.c, b.c, 1]);
        }
        return r.fulfill(json(rows));
      }
      if (u.includes("historic")) {
        const year = Array.from({ length: 366 }, (_, k) => {
          const b = bar(N - 366 + k);
          return { price: b.c.toFixed(2), time: b.t };
        });
        return r.fulfill(json({ data: { prices: u.includes("period=year") ? year : PRICES } }));
      }
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "105.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_companion", "true");');
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const open = async () => {
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.keyboard.press("5");
      await page.waitForTimeout(3000);
    };
    const list = () => page.evaluate(`(() => {
      const vis = (n) => getComputedStyle(n).display !== "none" && n.getAttribute("visibility") !== "hidden";
      return [...document.querySelectorAll("[data-companion-setup-name]")].filter(vis).map((t) => t.textContent);
    })()`);
    const chips = () => page.evaluate(`(() => {
      const drawer = document.querySelector("[data-chart-settings='open']");
      if (!drawer) return null;
      const wrap = drawer.querySelector("[data-companion-metrics]");
      const all = [...drawer.querySelectorAll("[data-companion-metric]")];
      return {
        ids: all.map((b) => b.getAttribute("data-companion-metric")),
        off: all.filter((b) => b.getAttribute("aria-pressed") === "false").map((b) => b.getAttribute("data-companion-metric")),
        typed: all.every((b) => b.getAttribute("type") === "button"),
        /* The reveal clips its row rather than unmounting it, so what is
           measured is the reveal around it, not the row's own height. */
        shown: !!wrap && wrap.parentElement.getBoundingClientRect().height > 20,
      };
    })()`);
    await open();
    const before = await list();
    await page.keyboard.press("v");
    await page.waitForTimeout(800);
    const c0 = await chips();
    check(c0 && c0.ids.length === 16 && c0.off.length === 0 && c0.typed && c0.shown,
      "with the companion on, the chart's drawer shows a chip for each of the four patterns and twelve setups, all on", JSON.stringify(c0));
    check(before.some((t) => /20-day breakout/.test(t)) && before.length >= 3,
      "…and the chart lists the breakout among the setups entered four days ago", JSON.stringify(before));
    await page.click("[data-chart-settings='open'] [data-companion-metric='breakout-high']");
    await page.waitForTimeout(800);
    const after = await list();
    check(!after.some((t) => /20-day breakout/.test(t)) && after.length === before.length - 1,
      "pressed off, the breakout leaves the chart's list and the others stay", JSON.stringify(after));
    check(after.map((t) => t.split(" ")[0]).join(",") === after.map((_, i) => String(i + 1)).join(","),
      "…numbered afresh from one", JSON.stringify(after));
    await page.keyboard.press("Escape");
    await open();
    const reloaded = await list();
    check(!reloaded.some((t) => /20-day breakout/.test(t)) && reloaded.length === after.length,
      "…and it stays off after a reload", JSON.stringify(reloaded));
    await page.keyboard.press("v");
    await page.waitForTimeout(800);
    const c1 = await chips();
    check(c1 && c1.off.join(",") === "breakout-high", "…its chip the one not pressed", JSON.stringify(c1 && c1.off));
    await page.click("[data-chart-settings='open'] [data-companion-metric='breakout-high']");
    await page.waitForTimeout(800);
    const back = await list();
    check(back.length === before.length && back.some((t) => /20-day breakout/.test(t)),
      "pressed again, it comes back", JSON.stringify(back));
    const toggle = await page.$("[data-chart-settings='open'] [aria-label='Toggle the chart companion']");
    check(!!toggle, "the drawer carries the companion's switch", "");
    if (toggle) await toggle.click();
    await page.waitForTimeout(900);
    const c2 = await chips();
    check(c2 && !c2.shown, "switched off, the chips fold away with it", JSON.stringify(c2));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §59 — a screen opened by its key shuts the chart's drawers, as its tab
   * does (27 Sep 2026). The widgets' and the chart's drawers float over the
   * screens (160 against 100–110); the right-hand tabs shut them when a
   * screen comes, and the keys went round that door — W then S left the
   * widgets over Settings, and a press on Settings' Permissions tab landed
   * on the drawer. Found when §17's cards moved into the widgets drawer.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1");');
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(800);
    const where = () => page.evaluate(`(() => ({
      screen: (document.querySelector("[data-screen-close]") || { getAttribute: () => null }).getAttribute("data-screen-close"),
      widgets: (document.querySelector("[data-widgets-drawer]") || { getAttribute: () => null }).getAttribute("data-widgets-drawer"),
      chart: (document.querySelector("[data-chart-settings]") || { getAttribute: () => null }).getAttribute("data-chart-settings"),
    }))()`);
    await openWidgets(page);
    await page.keyboard.press("s");
    await page.waitForTimeout(900);
    const settings = await where();
    check(settings.screen === "settings" && settings.widgets === "shut",
      "W then S: Settings opens and the widgets' drawer goes, as it does when Settings' tab is pressed", JSON.stringify(settings));
    let pressed;
    try {
      await page.click("[data-tab='permissions']", { timeout: 5000 });
      await page.waitForTimeout(500);
      pressed = await page.evaluate(`document.querySelectorAll("[data-perm-origin]").length`);
    } catch (e) {
      pressed = String(e.message).split("\n")[0];
    }
    check(typeof pressed === "number" && pressed > 0, "…so a press on its Permissions tab lands on the tab", JSON.stringify(pressed));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    await page.keyboard.press("v");
    await page.waitForSelector("[data-chart-settings='open']", { timeout: 5000 });
    await page.keyboard.press("b");
    await page.waitForTimeout(900);
    const base = await where();
    check(base.screen === "baserates" && base.chart === "shut",
      "V then B: the base rates open and the chart's drawer goes", JSON.stringify(base));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §60 — the design pass of 27 Sep 2026 ("tasarım hatalarını bul ve
   * çözüm bul", "özellikle chart ayarlarında", "Settings kısmına el atalım",
   * "her menünün altında keyboard shortcut'ı yazıyor, bu tasarım genele
   * yayılmalı"). Each claim here was a defect the audit measured:
   *  - the drawers' glass let the page's text through ("…overnight.1H 1D");
   *  - a key was only in a tooltip, except on two drawers' foot lines;
   *  - the chart's twelve settings were one undivided list;
   *  - five indicator names squeezed into one segmented row ran together;
   *  - a shut dependent row (Volume Bars) left a 1.4rem hole;
   *  - a closed column tab's label was 3.36:1.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_theme", "light");');
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.keyboard.press("a");
    await page.waitForTimeout(700);
    const glass = await page.evaluate(`(() => {
      const card = document.querySelector("[data-alerts-card]");
      const drawer = card && card.parentElement;
      const plot = document.querySelector("[data-chart-surface]");
      const top = getComputedStyle(document.documentElement).getPropertyValue("--plot-top").trim();
      const price = [...document.querySelectorAll("h1, div, span")].find((n) => n.children.length === 0 && /^\\$43,48/.test(n.textContent || ""));
      const pr = price ? price.getBoundingClientRect() : null;
      const dr = drawer ? drawer.getBoundingClientRect() : null;
      /* What is drawn at a point of the price that the drawer covers: the
         drawer's own ground, not the price. */
      const under = pr && dr && pr.left < dr.right ? document.elementFromPoint(Math.min(pr.left + 4, dr.right - 4), pr.top + pr.height / 2) : null;
      return {
        top: parseFloat(top),
        plotTop: plot ? Math.round(plot.getBoundingClientRect().top) : null,
        bg: drawer ? getComputedStyle(drawer).backgroundImage : "",
        covered: Boolean(under && drawer && drawer.contains(under)),
      };
    })()`);
    check(glass.top > 0 && glass.top === glass.plotTop && /linear-gradient/.test(glass.bg),
      "an open drawer is solid down to where the chart starts and glass over it", JSON.stringify(glass));
    const keys = await page.evaluate(`(() => {
      const tabs = [...document.querySelectorAll("[data-drawer-tab]")].map((t) => ({
        tab: t.getAttribute("data-drawer-tab"),
        key: (t.querySelector("[data-key-hint]") || {}).textContent || null,
        says: (t.getAttribute("title") || "").match(/\\((.)\\)$/),
      }));
      const head = document.querySelector("[data-alerts-card] h2 [data-key-hint]");
      return { tabs: tabs.map((t) => ({ tab: t.tab, key: t.key, title: t.says ? t.says[1] : null })), head: head ? head.textContent : null };
    })()`);
    check(keys.tabs.length >= 5 && keys.tabs.every((t) => t.key && t.key === t.title),
      "every tab on the chart's column shows its key under its name, the same key its tooltip names", JSON.stringify(keys.tabs));
    check(keys.head === "A", "…and the open drawer's head carries its own key", JSON.stringify(keys.head));
    const tabInk = await page.evaluate(`(() => {
      const t = [...document.querySelectorAll("[data-drawer-tab]")].find((n) => n.getAttribute("aria-pressed") === "false");
      return t ? getComputedStyle(t).opacity : null;
    })()`);
    check(tabInk === "1", "a closed tab is drawn at full strength, its name in the secondary ink", tabInk);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("v");
    await page.waitForTimeout(700);
    const drawer = await page.evaluate(`(() => {
      const d = document.querySelector("[data-chart-settings='open']");
      const heads = [...d.querySelectorAll("[data-chart-group]")].map((h) => h.getAttribute("data-chart-group"));
      const chips = [...d.querySelectorAll("[data-overlay-choice]")].map((b) => b.getBoundingClientRect());
      const overlap = chips.some((a, i) => chips.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
      const clipped = [...d.querySelectorAll("[data-overlay-choice]")].some((b) => b.scrollWidth > b.clientWidth + 1);
      const shut = [...d.querySelectorAll("[data-reveal-open='false']")].map((r) => r.parentElement).filter((row) => row && row.children.length === 1);
      const holes = shut.map((row) => Math.round(row.getBoundingClientRect().height));
      const title = d.querySelector("h2");
      return { heads, overlap, clipped, holes, key: (title.querySelector("[data-key-hint]") || {}).textContent, save: Boolean(d.querySelector("[data-chart-save-image]")) };
    })()`);
    check(drawer.heads.join(",") === "candlesticks,chartAverage,chartDetails",
      "the chart's drawer names its three kinds — drawn, on it, around it — above the rows they head", JSON.stringify(drawer.heads));
    check(!drawer.overlap && !drawer.clipped, "the indicator choices wrap rather than running into each other", JSON.stringify(drawer));
    check(drawer.holes.length >= 1 && drawer.holes.every((h) => h <= 2),
      "a row that is only a shut reveal takes no room", JSON.stringify(drawer.holes));
    check(drawer.key === "V" && drawer.save, "…its head carries V, and its foot the one action it has", JSON.stringify(drawer));
    const rowKeys = await page.evaluate(`[...document.querySelectorAll("[data-chart-settings='open'] [data-key-hint]")].map((k) => k.textContent).join("")`);
    check(/T/.test(rowKeys) && /G/.test(rowKeys) && /Y/.test(rowKeys),
      "…and the rows a key also flips — candlesticks, grid, log scale — show that key beside their names", rowKeys);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("s");
    await page.waitForTimeout(900);
    const settings = await page.evaluate(`(() => {
      const items = [...document.querySelectorAll("[data-settings-card] nav button, [data-settings-card] button")].filter((b) => b.querySelector("[data-key-hint]") && b.getAttribute("title"));
      const menu = items.map((b) => ({ key: b.querySelector("[data-key-hint]").textContent, title: b.getAttribute("title") }));
      const head = document.querySelector("[data-settings-card] h2 [data-key-hint]");
      return { menu, head: head ? head.textContent : null };
    })()`);
    const menuOk = settings.menu.filter((m) => /\((.)\)$/.test(m.title));
    check(menuOk.length >= 10 && menuOk.every((m) => m.title.endsWith(`(${m.key})`)),
      "Settings' menu shows each item's key, the one its tooltip names", JSON.stringify(settings.menu.slice(0, 4)));
    check(settings.head === "S", "…and its head shows S", JSON.stringify(settings.head));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §61 — the chart as an image (27 Sep 2026): I, or the chart drawer's one
   * action, hands the browser a PNG of the chart under a heading, named for
   * the coin, the range and the minute. Nothing is sent anywhere. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    const asked = [];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://") || u.startsWith("blob:") || u.startsWith("data:")) return r.continue();
      asked.push(u);
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1");');
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1200);
    const before = asked.length;
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.keyboard.press("i")]);
    const file = await dl.path();
    const bytes = file ? require("fs").readFileSync(file) : Buffer.alloc(0);
    check(/^pricetab-BTC-1H-\d{4}-\d{2}-\d{2}-\d{4}\.png$/.test(dl.suggestedFilename()),
      "I saves the chart as a PNG named for the coin, the range and the minute", dl.suggestedFilename());
    check(bytes.length > 5000 && bytes.slice(1, 4).toString() === "PNG" && bytes.readUInt32BE(16) === 2560,
      "…a real PNG, drawn at twice the window's width", `${bytes.length} bytes, width ${bytes.length > 20 ? bytes.readUInt32BE(16) : "?"}`);
    check(asked.slice(before).every((u) => /historic|spot/.test(u)), "…and saving it asks nothing of anybody", asked.slice(before).join(" "));
    await page.keyboard.press("v");
    await page.waitForTimeout(700);
    const [dl2] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.click("[data-chart-save-image]")]);
    check(/\.png$/.test(dl2.suggestedFilename()), "the chart drawer's button does the same", dl2.suggestedFilename());
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §62 — headlines saved to read later (27 Sep 2026). A saved headline stays
   * after it has left the feed — the feed here is empty — and the saved view
   * ignores the scope, because a filter chosen later must not hide what was
   * kept on purpose. Only an https link is kept. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    const kept = [
      { url: "https://example.com/a", title: "Kept story A", source: "Bitcoin.com", time: Date.now() - 86400000 * 40, savedAt: 2 },
      { url: "https://example.com/b", title: "Kept story B", source: "CNBC", time: Date.now() - 86400000 * 2, savedAt: 5 },
      { url: "javascript:alert(1)", title: "Not a link", source: "X", savedAt: 9 },
    ];
    await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_news_saved", ${JSON.stringify(JSON.stringify(kept))});`);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.keyboard.press("n");
    await page.waitForTimeout(1200);
    const chip = await page.evaluate(`(document.querySelector("[data-news-saved-view]") || {}).textContent || null`);
    check(chip === "Saved · 2", "the news panel counts what was saved — the script link was never kept", JSON.stringify(chip));
    await page.click("[data-news-saved-view]");
    await page.waitForTimeout(400);
    const view = await page.evaluate(`[...document.querySelectorAll(".pt-news-title")].map((n) => n.textContent)`);
    check(view.join("|") === "Kept story B|Kept story A",
      "pressed, it shows them — newest saved first — with the feed empty and the story a month old", JSON.stringify(view));
    const marks = await page.evaluate(`[...document.querySelectorAll("[data-news-save]")].map((b) => b.getAttribute("data-news-save") + ":" + (b.closest("a") ? "in-link" : "beside"))`);
    check(marks.length === 2 && marks.every((m) => m === "on:beside"),
      "…each with its bookmark on, beside the link rather than inside it", JSON.stringify(marks));
    await page.click("[data-news-save]");
    await page.waitForTimeout(400);
    const after = await page.evaluate(`({
      rows: [...document.querySelectorAll(".pt-news-title")].map((n) => n.textContent),
      stored: JSON.parse(localStorage.getItem("crypto_chart_news_saved") || "[]").map((x) => x.title),
    })`);
    check(after.rows.join("|") === "Kept story A" && after.stored.join("|") === "Kept story A",
      "pressing a bookmark takes that one off, on screen and in storage", JSON.stringify(after));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §72 — the news list read by day and by coverage (29 Sep 2026, "haber
   * sekmesini düzenleyelim … her şeyi daha iyi hale getirelim"). A heading per
   * day in the newest-first list; "Most covered" puts the story the most
   * newsrooms ran first and drops the headings, since its order is not time;
   * a fold of one newsroom's two write-ups is counted as write-ups, not as
   * another newsroom; and a discussion's row carries its points. The feed is
   * seeded through the news cache, so no source is asked. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    const noon = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(12, 0, 0, 0); return d.getTime(); };
    const now = Date.now();
    /* Today's four sit within the last hour and a half so they stay "today"
       at any time of day past 01:30; before then the check says so. */
    const items = [
      { source: "CNBC", title: "Senate fails to advance the Clarity Act crypto market bill", time: now - 20 * 60000, url: "https://example.com/3" },
      { source: "CNBC", title: "Clarity Act crypto market bill stalls as Senate fails to advance it", time: now - 30 * 60000, url: "https://example.com/4" },
      { source: "Bitcoin.com", title: "Ethereum developers set the Fusaka upgrade date for December", time: now - 60 * 60000, url: "https://example.com/1" },
      { source: "CryptoPotato", title: "Fusaka upgrade date for December set by Ethereum developers", time: now - 80 * 60000, url: "https://example.com/2" },
      { source: "Hacker News", title: "Show HN: A full bitcoin node on a single-board computer", time: noon(1), url: "https://example.com/5", points: 312 },
      { source: "MarketWatch", title: "Gold and bitcoin both climb as the dollar weakens", time: noon(3), url: "https://example.com/6" },
    ];
    await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_news_cache", ${JSON.stringify(JSON.stringify({ t: Date.now(), items }))});`);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.keyboard.press("n");
    await page.waitForTimeout(1200);
    const read = () => page.evaluate(`({
      days: [...document.querySelectorAll("[data-news-day]")].map((n) => n.textContent),
      titles: [...document.querySelectorAll(".pt-news-title")].map((n) => n.textContent),
      points: [...document.querySelectorAll("[data-news-points]")].map((n) => n.getAttribute("data-news-points")),
      also: [...document.querySelectorAll("span")].filter((n) => !n.children.length && /more$|write-ups here$/.test(n.textContent)).map((n) => n.textContent),
    })`);
    const newest = await read();
    const earlyMorning = new Date().getHours() * 60 + new Date().getMinutes() < 90;
    check(earlyMorning || (newest.days[0] === "today" && newest.days[1] === "yesterday" && newest.days.length === 3),
      "newest first, with a heading for each day: today, yesterday, then the date", JSON.stringify(newest.days));
    check(/^Senate fails/.test(newest.titles[0]) && /^Ethereum developers/.test(newest.titles[1]),
      "…the newest story leading, whoever ran it", JSON.stringify(newest.titles));
    check(newest.also.includes("+1 more") && newest.also.includes("2 write-ups here") && !newest.also.includes("+2 more"),
      "a fold of one newsroom's two write-ups is counted as write-ups; two newsrooms' as one more", JSON.stringify(newest.also));
    check(newest.points.join() === "312", "the discussion's row carries its points in place of a summary", JSON.stringify(newest.points));
    await page.click("[data-news-order='covered']");
    await page.waitForTimeout(300);
    const covered = await read();
    check(/^Ethereum developers/.test(covered.titles[0]) && covered.days.length === 0,
      "\"Most covered\" puts the story two newsrooms ran first, and drops the day headings", JSON.stringify(covered));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §63 — the coin sweep goes as far as something on screen reads (27 Sep
   * 2026). With the bar and the movers off, the watchlist — on by default —
   * reads only this person's coins, and each new tab used to ask a spot
   * price and a day's history for twelve other coins as well. Coinlore's
   * answer here carries none of them, which is the case that sent them to
   * the per-coin path. Switching the bar on asks for them at once. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const perCoin = [];
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      const m = u.match(/prices\/([A-Z0-9]+)-USD\/(spot|historic\?period=day)/);
      if (m && !["BTC", "ETH", "XRP", "LTC"].includes(m[1])) perCoin.push(m[1]);
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("coinlore") && u.includes("tickers")) return r.fulfill(json({ data: TICKERS, info: { coins_num: 4 } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1");');
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(6000);
    check(perCoin.length === 0, "with only the watchlist reading it, the sweep asks for no coin outside this person's list", perCoin.join(","));
    await page.keyboard.press("s");
    await page.waitForTimeout(700);
    await page.keyboard.press("6");
    await page.waitForTimeout(700);
    // Required, not attempted: a moved switch fails here rather than as "0 requests"
    const toggled = Boolean(await page.$("[aria-label='Toggle page ticker']"));
    await page.click("[aria-label='Toggle page ticker']");
    await page.waitForTimeout(4500);
    check(toggled && perCoin.length > 0, "switching the price bar on asks for the rest at once, not at the next two-minute tick", `${toggled} ${perCoin.length}`);
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §64 — no control drawn over another (27 Sep 2026, "ayarlarda show the
   * contract kısmı açıkta olsa kapalı da olsa hep açık görünüyor ve bir
   * birinin üzerine biniyor"). The derivatives section was one row carrying
   * two switches, and a row pins its control to its first line, so the
   * confirmation's switch was drawn exactly over the strip's: the strip's
   * could not be seen or pressed, and the row showed the other's state. A
   * pairwise overlap check cannot see this — the switch underneath is never
   * visible to be paired — so the check here is the other way round: every
   * control inside Settings (and the chart's drawer) that is inside its
   * scroller's visible part must be the topmost thing at some point of
   * itself. Walked through every section, top to bottom.
   */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_practice_enabled", "true"); localStorage.setItem("crypto_chart_practice_consent", "true");');
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(800);
    const COVERED = (scope) => `(() => {
      const root = document.querySelector(${JSON.stringify(scope)});
      if (!root) return { missing: true, seen: 0, covered: [] };
      const on = (el) => {
        const r = el.getBoundingClientRect();
        return [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + r.height / 2], [r.right - 3, r.top + r.height / 2]]
          .some(([x, y]) => { const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t) || t.contains(el)); });
      };
      const clip = (el) => { for (let n = el.parentElement; n && n !== root.parentElement; n = n.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n.getBoundingClientRect(); } return root.getBoundingClientRect(); };
      const hidden = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return true; } return false; };
      const out = { seen: 0, covered: [] };
      for (const el of root.querySelectorAll("button, select, input, [role=switch]")) {
        if (hidden(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const k = clip(el);
        if (r.top < k.top - 1 || r.bottom > k.bottom + 1 || r.left < k.left - 1 || r.right > k.right + 1) continue;
        out.seen += 1;
        if (!on(el)) out.covered.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 50));
      }
      return out;
    })()`;
    const walk = async (scope, scroller) => {
      const all = { seen: 0, covered: new Set() };
      for (let step = 0; step < 14; step++) {
        const r = await page.evaluate(COVERED(scope));
        all.seen += r.seen || 0;
        (r.covered || []).forEach((c) => all.covered.add(c));
        /* Instant, not smooth: the section scroller eases its scroll, and an
           eased scrollTop still reads the old value on the next line — the
           walk stopped at the top of every section and passed on what it
           had not looked at (seen failing that way with the bug put back). */
        const more = await page.evaluate(`(() => { const n = document.querySelector(${JSON.stringify(scroller)}); if (!n) return false; n.style.scrollBehavior = "auto"; const b = n.scrollTop; n.scrollTop = b + n.clientHeight * 0.7; return n.scrollTop > b; })()`);
        if (!more) break;
        await page.waitForTimeout(150);
      }
      return { seen: all.seen, covered: [...all.covered] };
    };
    await page.keyboard.press("s");
    await page.waitForTimeout(800);
    const report = {};
    let seen = 0;
    for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
      await page.keyboard.press(k);
      await page.waitForTimeout(500);
      const r = await walk("[data-settings-card]", "[data-settings-card] [data-pref-section], [data-settings-card] section > div:last-child");
      seen += r.seen;
      if (r.covered.length) report[k] = r.covered;
    }
    check(seen > 150 && Object.keys(report).length === 0,
      "in every section of Settings, no control is drawn over another", `${seen} seen · ${JSON.stringify(report)}`);
    await page.keyboard.press("8");
    await page.waitForTimeout(500);
    const strips = await page.evaluate(`(() => {
      const on = (label) => { const b = document.querySelector("[aria-label='" + label + "']"); return b ? b.getBoundingClientRect() : null; };
      return { dock: on("Toggle the contract strip on the chart"), confirm: on("Toggle asking before a contract is opened") };
    })()`);
    check(strips.dock && strips.confirm && Math.abs(strips.dock.top - strips.confirm.top) > 20,
      "…the contract strip's switch and the confirmation's are two rows, not one drawn over the other", JSON.stringify(strips));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.keyboard.press("v");
    await page.waitForTimeout(800);
    const drawer = await walk("[data-chart-settings='open']", "[data-chart-settings='open'] > div:nth-child(2)");
    check(drawer.seen > 10 && drawer.covered.length === 0, "…and none in the chart's drawer", JSON.stringify(drawer));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §65 — the regime grid (27 Sep 2026): the sector's 3×3 "Markov" picture,
   * counted the way this app counts — each entry into rising / flat /
   * falling and the state twenty days on, beside any day. Worked by hand on
   * a step: 100 for 200 days, then 110. Days 20–199 are flat (180), 200–219
   * rising (20), 220–399 flat (180). Entries: flat at 20, rising at 200, flat
   * at 220 — each flat twenty days later. Today: flat, for 180 days. */
  {
    const DAY = 86400;
    const END = Math.floor(Date.now() / 1000 / DAY) * DAY - DAY;
    const N = 400;
    const close = (i) => (i < 200 ? 100 : 110);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("granularity=86400")) {
        const start = Date.parse(decodeURIComponent(u.match(/start=([^&]+)/)[1])) / 1000;
        const end = Date.parse(decodeURIComponent(u.match(/end=([^&]+)/)[1])) / 1000;
        const rows = [];
        for (let i = N - 1; i >= 0; i--) {
          const t = END - (N - 1 - i) * DAY;
          if (t >= start && t < end) rows.push([t, close(i), close(i), close(i), close(i), 1]);
        }
        return r.fulfill(json(rows));
      }
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "110.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript('localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_widgets", JSON.stringify({ regimes: true }));');
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await openWidgets(page);
    await page.waitForTimeout(2500);
    const card = await page.evaluate(`(() => {
      const t = document.querySelector("[data-widget-regimes]");
      if (!t) return null;
      const cell = (ij) => (t.querySelector("[data-regime-cell='" + ij + "']") || {}).textContent;
      const now = document.querySelector("[data-widget-regime-now]");
      return {
        now: now ? now.textContent : null,
        rise: [cell("00"), cell("01"), cell("02")].join(" "),
        flat: [cell("10"), cell("11"), cell("12")].join(" "),
        fall: [cell("20"), cell("21"), cell("22")].join(" "),
        text: t.parentElement.innerText.replace(/\\s+/g, " "),
      };
    })()`);
    check(card && card.now === "flat · 180d", "the card names today's state and how long it has held", JSON.stringify(card && card.now));
    check(card && card.rise === "0% 100% 0%" && card.flat === "0% 100% 0%" && card.fall === "— — —",
      "…each state's entries and where they were twenty days on — episodes, not every flat day", JSON.stringify(card));
    check(card && /rise 1/.test(card.text) && /flat 2/.test(card.text) && /any day 5% 95% 0%/.test(card.text),
      "…the counts beside the rows, and any day's shares under them", card && card.text);
    check(card && /Too few episodes/.test(card.text) && !/forecast|will|next regime/i.test(card.text.replace(/not a forecast/, "")),
      "…and with too few episodes it says so rather than comparing — and forecasts nothing", card && card.text);
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §66 — the widgets drawer resized (27 Sep 2026, *"widgetları yeniden
   * boyutlandıralım … widget penceresini de yeniden boyutlandırabilelim,
   * sağa ve sola, aşağı yukarı yok"*). The S/M/L/XL row was on the Choose
   * view only; it is in the head now, beside the cards it sizes. The right
   * edge drags the width and nothing else, is kept across a reload, answers
   * the arrow keys without switching the coin, and a double-click puts it
   * back. The column floor follows the card size, so XL cards take fewer
   * columns in the same width instead of wrapping every line. */
  {
    const { ctx, page, errors } = await newCtx(browser, `localStorage.setItem("crypto_chart_onboarding_seen", "1");`);
    await openWidgets(page);
    await page.waitForTimeout(500);
    const read = () => page.evaluate(`(() => {
      const d = document.querySelector("[data-widgets-drawer='open']");
      const g = d.querySelector("[data-widget-cards]");
      const r = d.getBoundingClientRect();
      return {
        width: Math.round(r.width),
        height: Math.round(r.height),
        edge: d.querySelector("[data-widgets-resize]").getAttribute("data-widgets-resize"),
        cols: g ? getComputedStyle(g).gridTemplateColumns.split(" ").length : 0,
        cards: g ? g.children.length : 0,
        size: d.querySelector("[data-widgets-size]").getAttribute("data-widgets-size"),
        stored: localStorage.getItem("crypto_chart_widgets_width"),
      };
    })()`);
    const start = await read();
    const sizesInHead = await page.evaluate(`[...document.querySelectorAll("[data-widgets-drawer='open'] [data-widgets-size] button")].map((b) => b.textContent)`);
    check(sizesInHead.join(" ") === "S M L XL" && start.size === "medium",
      "the drawer's head carries the four card sizes, on the stored one", JSON.stringify({ sizesInHead, size: start.size }));
    check(start.edge === "default" && start.stored === null && start.cols === 2,
      "…it opens at its default width, two medium cards across, with nothing stored", JSON.stringify(start));

    /* A real mouse on the edge, dragged right and down at once: the width
       follows the pointer, the height does not move. */
    const box = await page.locator("[data-widgets-resize]").boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(x + i * 25, y + i * 15);
    await page.mouse.up();
    await page.waitForTimeout(300);
    const wide = await read();
    check(Math.abs(wide.width - (start.width + 300)) <= 2 && wide.height === start.height,
      "dragging the right edge 300px right and 180px down widens the drawer 300px and leaves its height alone",
      JSON.stringify({ start: [start.width, start.height], wide: [wide.width, wide.height] }));
    check(wide.cols >= 3 && wide.stored === String(wide.width) && wide.edge === String(wide.width),
      "…the wider drawer holds more columns, and the width is stored where the edge was let go", JSON.stringify(wide));

    /* The card size, from the head: XL in the same width is fewer, wider
       columns, and the setting is the one Choose used to hold. */
    await page.click("[data-widgets-drawer='open'] [data-widgets-size] button[aria-label='Extra large cards']");
    await page.waitForTimeout(300);
    const xl = await read();
    check(xl.size === "xlarge" && xl.cols < wide.cols && xl.width === wide.width &&
      (await page.evaluate(`localStorage.getItem("crypto_chart_widget_size")`)) === "xlarge",
      "XL from the head makes the columns fewer in the same width, and is stored",
      JSON.stringify({ wide: wide.cols, xl: xl.cols, size: xl.size }));

    /* The keyboard: the edge is a window splitter, and its arrows are its
       own — the chart's ←/→ would switch the coin. */
    const coinOnScreen = () => page.evaluate(`((document.body.innerText.match(/\\b([A-Z0-9]{2,6}) PRICE\\b/i) || [])[1] || null)`);
    await page.focus("[data-widgets-resize]");
    const coinBefore = await coinOnScreen();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(600);
    const stepped = await read();
    const coinAfter = await coinOnScreen();
    check(stepped.width === xl.width - 24 && coinBefore && coinBefore === coinAfter,
      "← on the focused edge narrows it one step and does not switch the coin",
      JSON.stringify({ from: xl.width, to: stepped.width, coinBefore, coinAfter }));
    await page.keyboard.press("Home");
    await page.waitForTimeout(250);
    const least = await read();
    check(least.width === 280 && least.cols === 1, "…Home takes it to its floor, one column", JSON.stringify(least));
    await page.keyboard.press("End");
    await page.waitForTimeout(250);
    const most = await read();
    check(most.width > 1000 && most.width <= Math.round(1280 * 0.92) + 1 && most.width + 36 + 48 <= 1280 + 1,
      "…End takes it to the window's ceiling, clear of the right edge's pull", JSON.stringify(most));

    /* Kept across a reload; a double-click is the way back to the default. */
    await page.reload();
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(1200);
    await openWidgets(page);
    await page.waitForTimeout(500);
    const again = await read();
    check(again.width === most.width && again.size === "xlarge",
      "the width and the size are both there after a reload", JSON.stringify({ was: most.width, now: again.width, size: again.size }));
    await page.dblclick("[data-widgets-resize]");
    await page.waitForTimeout(300);
    const reset = await read();
    check(reset.width === start.width && reset.edge === "default",
      "a double-click on the edge puts the default width back", JSON.stringify(reset));

    /* The Choose view no longer carries a second size row. */
    await page.click("[data-widgets-choose]");
    await page.waitForTimeout(400);
    const chooserSizes = await page.evaluate(`[...document.querySelectorAll("[data-widget-chooser] button")]
      .filter((b) => /^(S|M|L|XL)$/.test(b.textContent.trim())).length`);
    check(chooserSizes === 0, "…and Choose has no second size row", String(chooserSizes));

    /* No edge on a phone, where the drawer is a sheet the screen's width. */
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(400);
    const phone = await page.evaluate(`getComputedStyle(document.querySelector("[data-widgets-resize]")).display`);
    check(phone === "none", "no resize edge on a phone's sheet", phone);
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §67 — the derivatives terminal (27 Sep 2026, *"futures kısmı borsa
   * deneyimi yaşatmıyor, yeniden boyutlandırılabilir itemler lazım … futures'ın
   * ayarları da yine burada bulunsun"*). One grid — chart, book, ticket, the
   * positions panel under the chart and the book — with three seams that
   * drag, step from the keyboard, double-click back and are kept; the page's
   * settings in a sheet of its own; candles with volume; a level of the book
   * or a press on the chart puts a limit on the ticket; a resting order
   * carries its own stop and take and hands them to the contract it fills
   * into; and a fill is announced as a fill. Its own market, answered as
   * OKX answers, with a price the block moves. */
  {
    let PX = 100000;
    const NOW = Date.now();
    const okx = (data) => json({ code: "0", data });
    const answer = (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: Array.from({ length: 120 }, (_, i) => ({ price: String(PX + Math.sin(i / 6) * 800), time: String(Math.floor(NOW / 1000) - i * 30) })) } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: String(PX), currency: "USD" } }));
      if (!u.includes("okx.com")) return r.fulfill(json({}));
      if (u.includes("market/ticker")) return r.fulfill(okx([{ last: String(PX), open24h: String(PX * 0.99), high24h: String(PX * 1.01), low24h: String(PX * 0.98) }]));
      if (u.includes("history-candles")) return r.fulfill(okx([]));
      if (u.includes("market/candles")) {
        return r.fulfill(okx(Array.from({ length: 60 }, (_, i) => {
          const c = PX + Math.sin(i / 5) * 600;
          const o = c + ((i % 3) - 1) * 150;
          return [String(NOW - i * 60000), String(o), String(Math.max(o, c) + 80), String(Math.min(o, c) - 80), String(c), "10", String(3 + (i % 7)), "1000", "1"];
        })));
      }
      if (u.includes("market/books")) {
        const sz = Number((u.match(/sz=(\d+)/) || [])[1]) || 16;
        return r.fulfill(okx([{ asks: Array.from({ length: sz }, (_, i) => [String(PX + 0.1 * (i + 1)), String(5 + i), "0", "1"]), bids: Array.from({ length: sz }, (_, i) => [String(PX - 0.1 * i), String(6 + i), "0", "1"]), ts: String(NOW) }]));
      }
      if (u.includes("public/instruments")) return r.fulfill(okx([{ instId: "BTC-USDT-SWAP", ctVal: "0.01", tickSz: "0.1", lotSz: "1", minSz: "1", state: "live" }]));
      return r.fulfill(okx([]));
    };
    answer.answersOkx = true;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route("**/*", answer);
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("f");
    await page.waitForSelector("[data-practice-cell='chart']", { timeout: 8000 });
    await page.waitForTimeout(2500);

    const cells = () => page.evaluate(`(() => {
      const r = (a) => { const n = document.querySelector("[data-practice-cell='" + a + "']"); if (!n) return null; const b = n.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.left), y: Math.round(b.top) }; };
      return { chart: r("chart"), book: r("book"), desk: r("desk"), bottom: r("bottom"),
        stored: localStorage.getItem("crypto_chart_practice_layout"),
        seams: [...document.querySelectorAll("[data-practice-split][role='separator']")].map((n) => n.getAttribute("data-practice-split")) };
    })()`);
    const start = await cells();
    check([...start.seams].sort().join(" ") === "book bottom desk" && start.chart && start.book && start.desk && start.bottom,
      "the terminal is four areas with three seams — book, ticket, panel", JSON.stringify(start));
    check(start.bottom.x === start.chart.x && start.bottom.w >= start.chart.w + start.book.w,
      "…the positions panel runs under the chart and the book", JSON.stringify({ chart: start.chart, book: start.book, bottom: start.bottom }));
    check(start.desk.y === start.chart.y && start.desk.h > start.chart.h + start.bottom.h - 2,
      "…and the ticket runs the full height beside them", JSON.stringify({ desk: start.desk }));

    /* Real drags, one per seam. */
    const drag = async (which, dx, dy) => {
      const b = await page.locator(`[data-practice-split='${which}']`).boundingBox();
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i += 1) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
      await page.mouse.up();
      await page.waitForTimeout(250);
    };
    /* The book first — at 1440 both the book and the ticket open at their
       floors, so the ticket's seam has room only once the book has some. */
    await drag("book", -100, 0);
    const d1 = await cells();
    check(Math.abs(d1.book.w - (start.book.w + 100)) <= 2 && Math.abs(d1.chart.w - (start.chart.w - 100)) <= 2,
      "the book's seam widens the book out of the chart", JSON.stringify({ book: [start.book.w, d1.book.w], chart: [start.chart.w, d1.chart.w] }));
    await drag("desk", -80, 40);
    const d2 = await cells();
    check(Math.abs(d2.desk.w - (d1.desk.w + 80)) <= 2 && Math.abs(d2.book.w - (d1.book.w - 80)) <= 2 && Math.abs(d2.chart.w - d1.chart.w) <= 2,
      "the ticket's seam trades width between the book and the ticket, and the chart does not move",
      JSON.stringify({ book: [d1.book.w, d2.book.w], desk: [d1.desk.w, d2.desk.w], chart: [d1.chart.w, d2.chart.w] }));
    await drag("desk", 400, 0);
    const floor = await cells();
    check(floor.desk.w === 416 && floor.book.w === d2.book.w + (d2.desk.w - 416),
      "…and stops at the ticket's floor, where its leverage row still fits", JSON.stringify({ desk: floor.desk.w, book: floor.book.w }));
    await drag("desk", -(d2.desk.w - 416), 0);
    await drag("bottom", 30, -120);
    const d3 = await cells();
    check(Math.abs(d3.bottom.h - (d2.bottom.h + 120)) <= 2 && Math.abs(d3.chart.h - (d2.chart.h - 120)) <= 2 && d3.chart.w === d2.chart.w,
      "the panel's seam moves up and down only, and the chart gives up the height",
      JSON.stringify({ bottom: [d2.bottom.h, d3.bottom.h], chart: [d2.chart.h, d3.chart.h] }));
    const stored = JSON.parse(d3.stored || "{}");
    check(stored.book === d3.book.w && stored.desk === d3.desk.w && stored.bottom === d3.bottom.h,
      "…and all three are stored where they were let go", d3.stored);

    /* The keyboard. (The coin cannot move here whatever the seam does —
       app.js's chart keys stand down behind any open panel — so the coin is
       read as a guard on the page, not as a test of a guard of its own.) */
    const coin = () => page.evaluate(`(document.querySelector("[data-practice-strip]") || {}).getAttribute ? document.querySelector("[data-practice-strip]").getAttribute("data-practice-strip") : null`);
    const coinBefore = await coin();
    await page.focus("[data-practice-split='book']");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
    const k1 = await cells();
    check(k1.book.w === d3.book.w - 16 && (await coin()) === coinBefore,
      "→ on the focused book seam narrows the book one step, and the coin stays", JSON.stringify({ book: [d3.book.w, k1.book.w], coinBefore, coinAfter: await coin() }));
    await page.focus("[data-practice-split='bottom']");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    const k2 = await cells();
    check(k2.bottom.h === k1.bottom.h - 16, "↓ on the panel's seam lowers it one step", JSON.stringify([k1.bottom.h, k2.bottom.h]));

    /* Kept across a reload, and a double-click puts one back. */
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("f");
    await page.waitForSelector("[data-practice-cell='chart']", { timeout: 8000 });
    await page.waitForTimeout(1500);
    const again = await cells();
    check(again.book.w === k2.book.w && again.desk.w === k2.desk.w && again.bottom.h === k2.bottom.h,
      "the three sizes are there after a reload", JSON.stringify({ was: [k2.book.w, k2.desk.w, k2.bottom.h], now: [again.book.w, again.desk.w, again.bottom.h] }));
    await page.dblclick("[data-practice-split='bottom']");
    await page.waitForTimeout(300);
    const reset1 = await cells();
    check(reset1.bottom.h === start.bottom.h && !("bottom" in JSON.parse(reset1.stored || "{}")),
      "a double-click on the panel's seam gives it back to the window", JSON.stringify({ start: start.bottom.h, now: reset1.bottom.h, stored: reset1.stored }));

    /* The page's settings, on the page. */
    await page.click("[data-practice-settings-open]");
    await page.waitForTimeout(400);
    const sheet = await page.evaluate(`(() => {
      const s = document.querySelector("[data-practice-settings]");
      if (!s) return null;
      return {
        groups: [...s.querySelectorAll("[data-practice-settings-group]")].filter((g) => g.children.length).map((g) => g.getAttribute("data-practice-settings-group")),
        confirm: Boolean(s.querySelector("[data-practice-prefs='confirm']")),
        dock: Boolean(s.querySelector("[data-practice-prefs='dock']")),
        alarm: /liquidat/i.test(s.innerText),
        layout: s.querySelector("[data-practice-settings-layout]").getAttribute("data-practice-settings-layout"),
      };
    })()`);
    check(sheet && sheet.confirm && sheet.dock && sheet.alarm && sheet.groups.includes("page") && sheet.groups.includes("account"),
      "the page's Settings holds the chart, the layout, the confirmation, the contract strip, the alarm and the way to the account", JSON.stringify(sheet));
    check(sheet && sheet.layout === "stored", "…and says the layout is a stored one", sheet && sheet.layout);
    await page.click("[data-practice-layout-reset]");
    await page.waitForTimeout(300);
    const reset2 = await cells();
    check(reset2.stored === "{}" && reset2.book.w === start.book.w && reset2.desk.w === start.desk.w,
      "…where Reset layout gives every seam back to the window", JSON.stringify({ stored: reset2.stored, book: [start.book.w, reset2.book.w], desk: [start.desk.w, reset2.desk.w] }));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const afterEsc = await page.evaluate(`[Boolean(document.querySelector("[data-practice-settings]")), Boolean(document.querySelector("[data-practice-page]"))]`);
    check(!afterEsc[0] && afterEsc[1], "Escape closes the sheet and leaves the page open", JSON.stringify(afterEsc));
    const accountAlarm = await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((n) => /^Account$/.test(n.innerText.trim())); if (b) b.click(); return true; })()`);
    await page.waitForTimeout(300);
    check(accountAlarm && !(await page.evaluate(`/Chrome notification/.test((document.querySelector("[data-practice-desk]") || {}).innerText || "")`)),
      "…and the alarm is said once, in the sheet — the Account tab no longer repeats it");
    await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((n) => /^New contract$/.test(n.innerText.trim())); if (b) b.click(); })()`);
    await page.waitForTimeout(300);

    /* Candles, volume, and the style switch. */
    const drawn = () => page.evaluate(`({
      candles: document.querySelectorAll("[data-practice-plot] .pp-candle-up, [data-practice-plot] .pp-candle-down").length,
      volume: document.querySelectorAll("[data-practice-plot] .pp-vol-up, [data-practice-plot] .pp-vol-down").length,
      line: document.querySelectorAll("[data-practice-plot] .pp-line").length,
      legend: (document.querySelector("[data-practice-chart-legend]") || {}).textContent || "",
      bad: [...document.querySelectorAll("[data-practice-plot] rect, [data-practice-plot] line")].filter((n) => ["x", "y", "width", "height", "x1", "y1"].some((a) => n.hasAttribute(a) && !isFinite(Number(n.getAttribute(a))))).length,
    })`);
    const c1 = await drawn();
    check(c1.candles >= 50 && c1.volume >= 50 && c1.line === 0 && /candles/.test(c1.legend) && /volume/.test(c1.legend) && c1.bad === 0,
      "the chart draws the perpetual as candles with volume under them, says so in its corner, and every coordinate is a number", JSON.stringify(c1));
    await page.click("[data-practice-chart-style] button:nth-child(2)");
    await page.waitForTimeout(300);
    const c2 = await drawn();
    check(c2.candles === 0 && c2.line === 1 && /closes/.test(c2.legend) && (await page.evaluate(`localStorage.getItem("crypto_chart_practice_chart_style")`)) === "line",
      "…Line draws the closes instead, and is kept", JSON.stringify(c2));
    await page.click("[data-practice-chart-style] button:nth-child(1)");
    await page.waitForTimeout(300);

    /* A level of the book onto the ticket. */
    const stops = await page.evaluate(`[...document.querySelectorAll("[data-practice-book-row]")].filter((n) => n.tabIndex === 0).length`);
    check(stops === 1, "the book is one tab stop, however many levels it draws", String(stops));
    const bid = await page.evaluate(`(() => { const r = [...document.querySelectorAll("[data-practice-book-row='bid']")]; return r[3].getAttribute("data-price"); })()`);
    await page.click(`[data-practice-book-row='bid'][data-price='${bid}']`);
    await page.waitForTimeout(300);
    const picked = await page.evaluate(`({ kind: document.querySelector("[data-practice-kind]").getAttribute("data-practice-kind"), entry: document.querySelector("input[aria-label='Entry price']").value, button: document.querySelector("[data-practice-order-button]").innerText })`);
    check(picked.kind === "limit" && Number(picked.entry) === Number(bid) && /long/i.test(picked.button),
      "a bid level puts a long limit at its price on the ticket", JSON.stringify({ bid, picked }));
    const ask = await page.evaluate(`document.querySelector("[data-practice-book-row='ask']").getAttribute("data-price")`);
    await page.focus(`[data-practice-book-row='bid'][data-price='${bid}']`);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(150);
    const walked = await page.evaluate(`document.activeElement && document.activeElement.getAttribute("data-price")`);
    check(walked && walked !== bid, "↑ walks the ladder from the focused level", `${bid} → ${walked}`);
    await page.click(`[data-practice-book-row='ask'][data-price='${ask}']`);
    await page.waitForTimeout(300);
    const pickedAsk = await page.evaluate(`document.querySelector("[data-practice-order-button]").innerText`);
    check(/short/i.test(pickedAsk), "…and an ask level a short one", pickedAsk);

    /* A press on the chart prices a limit and places nothing. */
    const plot = await page.locator("[data-practice-plot]").boundingBox();
    await page.mouse.click(plot.x + plot.width * 0.4, plot.y + plot.height * 0.7);
    await page.waitForTimeout(300);
    const fromChart = await page.evaluate(`({ entry: Number(document.querySelector("input[aria-label='Entry price']").value), orders: Object.keys(JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}").orders || {}).length, button: document.querySelector("[data-practice-order-button]").innerText })`);
    check(fromChart.entry > 0 && fromChart.entry < 100000 && /long/i.test(fromChart.button) && fromChart.orders === 0,
      "a press low on the chart puts a long limit at that price on the ticket, and places nothing", JSON.stringify(fromChart));

    /* A resting order with its own stop and take — drawn, and handed to the
       contract it fills into; the fill is said as a fill. */
    await page.click(`[data-practice-book-row='bid'][data-price='${bid}']`);
    await page.waitForTimeout(200);
    const setField = (label, v) => page.evaluate(`(() => { const e = document.querySelector("input[aria-label='${label}']"); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; set.call(e, "${v}"); e.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await setField("Stop price", String(Math.round(Number(bid) * 0.95)));
    await setField("Take-profit price", String(Math.round(Number(bid) * 1.05)));
    await page.waitForTimeout(200);
    await page.click("[data-practice-order-button]");
    await page.waitForTimeout(600);
    const resting = await page.evaluate(`(() => {
      const o = document.querySelector("[data-practice-order]");
      return { row: o ? o.innerText.replace(/\\s+/g, " ") : null, tags: [...document.querySelectorAll("[data-practice-tag]")].map((n) => n.getAttribute("data-practice-tag")) };
    })()`);
    check(resting.row && /SL /.test(resting.row) && /TP /.test(resting.row),
      "the order carries the stop and the take typed with it", resting.row);
    check(resting.tags.some((t) => /^os/.test(t)) && resting.tags.some((t) => /^ot/.test(t)),
      "…and the chart draws them beside the order's own line", JSON.stringify(resting.tags));
    PX = Number(bid) - 40;
    await page.waitForFunction(`Object.keys(JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}").positions || {}).length === 1`, null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(600);
    const filled = await page.evaluate(`(() => {
      const p = JSON.parse(localStorage.getItem("crypto_chart_practice") || "{}");
      const pos = Object.values(p.positions || {})[0] || null;
      const toasts = [...document.querySelectorAll("div")].filter((n) => n.children.length <= 3 && /order filled|stopped out/.test(n.textContent || "")).map((n) => n.textContent.replace(/\\s+/g, " ")).slice(-2);
      return { pos: pos && [pos.entry, pos.stop, pos.take], toasts };
    })()`);
    check(filled.pos && filled.pos[1] === Math.round(Number(bid) * 0.95) * 10000 && filled.pos[2] === Math.round(Number(bid) * 1.05) * 10000,
      "the market comes to the order: the contract opens with the order's stop and take", JSON.stringify(filled.pos));
    check(filled.toasts.length > 0 && filled.toasts.every((t) => /order filled/.test(t) && !/stopped out/.test(t)),
      "…and the notice says the order filled — it said \"stopped out\" before", JSON.stringify(filled.toasts));

    /* The book fills its column and does not run past it. */
    const book = await page.evaluate(`(() => {
      const cell = document.querySelector("[data-practice-cell='book']");
      const rows = cell.querySelectorAll("[data-practice-book-row='bid']").length;
      return { rows, over: cell.scrollHeight - cell.clientHeight };
    })()`);
    check(book.rows >= 4 && book.over <= 1, "the book draws as many levels as its column holds, and no more", JSON.stringify(book));
    /* …and more of them when the panel under it is made smaller. */
    await drag("bottom", 0, 160);
    await page.waitForTimeout(400);
    const taller = await page.evaluate(`(() => { const cell = document.querySelector("[data-practice-cell='book']"); return { rows: cell.querySelectorAll("[data-practice-book-row='bid']").length, over: cell.scrollHeight - cell.clientHeight }; })()`);
    check(taller.rows > book.rows && taller.over <= 1, "…and more of them when the panel below is dragged down", JSON.stringify({ before: book.rows, after: taller }));

    /* On a phone the chart's drawing fills its plot — a global rule made it
       a square of its width, under axis labels and tags laid out for the
       whole height. */
    await page.setViewportSize({ width: 420, height: 860 });
    await page.waitForTimeout(600);
    const phone = await page.evaluate(`(() => { const p = document.querySelector("[data-practice-plot]"); const s = p.querySelector("svg"); return [Math.round(p.getBoundingClientRect().height), Math.round(s.getBoundingClientRect().height)]; })()`);
    check(phone[0] > 100 && Math.abs(phone[0] - phone[1]) <= 1, "on a phone the chart draws in the whole of its plot", JSON.stringify(phone));
    const phoneSeams = await page.evaluate(`[...document.querySelectorAll("[data-practice-split]")].filter((n) => getComputedStyle(n).display !== "none").length`);
    check(phoneSeams === 0, "…and there are no seams on a one-column page", String(phoneSeams));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §68 — a revealed switch sits in the lane (28 Sep 2026, *"the chart
   * ayarlarındaki volume bars on/off slider switch'i sağa yasla, solda
   * durmamalı"*). A dependent row whose content is a whole section — title,
   * description, switch — was auto-placed inside the reveal's grid: the
   * description took the lane and the switch fell to the text column,
   * 240px left of every other switch. Every visible switch in the chart's
   * drawer and in Settings → The chart must end where the others end. */
  {
    const { ctx, page, errors } = await newCtx(browser,
      `localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_chart_type", "candles");`);
    const edges = (scope) => page.evaluate(`(() => {
      const d = document.querySelector(${JSON.stringify(scope)});
      const sw = [...d.querySelectorAll("button[aria-pressed][aria-label^='Toggle']")].filter((n) => n.offsetParent && n.getBoundingClientRect().width > 0);
      return sw.map((n) => ({ label: n.getAttribute("aria-label"), right: Math.round(n.getBoundingClientRect().right) }));
    })()`);
    await page.keyboard.press("v");
    await page.waitForTimeout(900);
    const drawer = await edges("[data-chart-settings='open']");
    const vol = drawer.find((x) => /volume bars/i.test(x.label));
    const rights = new Set(drawer.map((x) => x.right));
    check(vol && drawer.length >= 8 && rights.size === 1,
      "in the chart's drawer every switch ends on one edge — Volume Bars, revealed under Candlesticks, with them",
      JSON.stringify({ count: drawer.length, rights: [...rights], vol }));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.keyboard.press("s");
    await page.waitForTimeout(600);
    await page.keyboard.press("4");
    await page.waitForTimeout(700);
    const pane = await edges("[data-settings-card]");
    const paneVol = pane.find((x) => /volume bars/i.test(x.label));
    const paneRights = new Set(pane.map((x) => x.right));
    check(paneVol && pane.length >= 8 && paneRights.size === 1,
      "…and in Settings → The chart", JSON.stringify({ count: pane.length, rights: [...paneRights], paneVol }));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §69 — scaled orders and the order history (28 Sep 2026, the two
   * improvements left open by the terminal round). A scale lays one size
   * across a range as 3, 5 or 10 resting limits, placed whole or not at all;
   * the Orders tab says how each order that is gone ended — and its rows
   * never draw a figure under the Cancel button, at the desk's narrowest. */
  {
    const NOW = Date.now();
    const okx = (data) => json({ code: "0", data });
    const answer = (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: Array.from({ length: 120 }, (_, i) => ({ price: String(100000 + Math.sin(i / 6) * 800), time: String(Math.floor(NOW / 1000) - i * 30) })) } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "100000", currency: "USD" } }));
      if (!u.includes("okx.com")) return r.fulfill(json({}));
      if (u.includes("market/ticker")) return r.fulfill(okx([{ last: "100000", open24h: "99000", high24h: "101000", low24h: "98000" }]));
      if (u.includes("market/candles")) return r.fulfill(okx(Array.from({ length: 60 }, (_, i) => [String(NOW - i * 60000), "100000", "100100", "99900", String(100000 + (i % 5) * 20), "10", "3", "1000", "1"])));
      if (u.includes("public/instruments")) return r.fulfill(okx([{ instId: "BTC-USDT-SWAP", ctVal: "0.01", tickSz: "0.1", lotSz: "1", minSz: "1", state: "live" }]));
      return r.fulfill(okx([]));
    };
    answer.answersOkx = true;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route("**/*", answer);
    await ctx.addInitScript(
      'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
        'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
        'localStorage.setItem("crypto_chart_practice_consent", "true");',
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("f");
    await page.waitForSelector("[data-practice-kind]", { timeout: 8000 });
    await page.waitForTimeout(1500);
    const put = (label, v) => page.evaluate(`(() => { const e = document.querySelector("input[aria-label='${label}']"); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; set.call(e, "${v}"); e.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await page.click("[data-practice-kind] >> text=Scale");
    await page.waitForTimeout(300);
    await put("Entry price", "99000");
    await put("The last price of the scaled order", "95000");
    await page.waitForTimeout(300);
    await page.click("[data-practice-scale] >> text=5");
    await page.waitForTimeout(300);
    const ticket = await page.evaluate(`({
      button: document.querySelector("[data-practice-order-button]").innerText,
      levels: (document.querySelector("[data-practice-scale-levels]") || { getAttribute: () => null }).getAttribute("data-practice-scale-levels"),
      prices: [...document.querySelectorAll("[data-practice-scale-levels] > span")].map((n) => n.firstChild.textContent),
      grid: Boolean(document.querySelector("[data-practice-impact]")),
    })`);
    check(/Place 5 longs from 99,000.00 to 95,000.00/.test(ticket.button) && ticket.levels === "5",
      "Scale names what it will place — five longs from the From price to the To", JSON.stringify(ticket));
    check(ticket.prices.join(" ") === "99,000.00 98,000.00 97,000.00 96,000.00 95,000.00",
      "…and lists the five levels, evenly spaced", JSON.stringify(ticket.prices));
    check(!ticket.grid, "…without the one-contract grid, which would price the whole size at one level");
    await put("The last price of the scaled order", "101000");
    await page.waitForTimeout(300);
    const crossing = await page.evaluate(`({ disabled: document.querySelector("[data-practice-order-button]").disabled, note: document.querySelector("[data-practice-ticket-foot]").innerText })`);
    check(crossing.disabled && /Cannot open/.test(crossing.note),
      "a range reaching past the market cannot be placed, and says why", JSON.stringify(crossing));
    await put("The last price of the scaled order", "95000");
    await page.waitForTimeout(300);
    await page.click("[data-practice-order-button]");
    await page.waitForTimeout(600);
    const placed = await page.evaluate(`(() => {
      const rows = [...document.querySelectorAll("[data-practice-order]")];
      let overlaps = 0;
      for (const r of rows) {
        const kids = [...r.querySelectorAll("span, button")].map((n) => n.getBoundingClientRect()).filter((b) => b.width);
        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i], b = kids[j];
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
        }
      }
      return { rows: rows.length, overlaps, desk: Math.round(document.querySelector("[data-practice-desk]").getBoundingClientRect().width) };
    })()`);
    check(placed.rows === 5, "pressing places all five, on the Orders tab", JSON.stringify(placed));
    check(placed.overlaps === 0, "…and no order row draws a figure over another or under its Cancel", JSON.stringify(placed));

    /* The history: one cancelled by hand, the rest by Cancel all. */
    await page.click("[data-practice-order-cancel='1']");
    await page.waitForTimeout(400);
    const one = await page.evaluate(`[...document.querySelectorAll("[data-practice-history-row]")].map((n) => n.getAttribute("data-practice-history-row"))`);
    check(one.join(" ") === "cancelled", "a cancelled order moves to the history as cancelled", JSON.stringify(one));
    await page.click("[data-practice-cancel-all]");
    await page.waitForTimeout(200);
    const armed = await page.evaluate(`document.querySelector("[data-practice-cancel-all]").getAttribute("data-practice-cancel-all")`);
    check(armed === "armed", "Cancel all asks once before it takes them all", armed);
    await page.click("[data-practice-cancel-all]");
    await page.waitForTimeout(500);
    const after = await page.evaluate(`({
      resting: document.querySelectorAll("[data-practice-order]").length,
      history: [...document.querySelectorAll("[data-practice-history-row]")].map((n) => n.getAttribute("data-practice-history-row")),
      reserved: (JSON.parse(localStorage.getItem("crypto_chart_practice")).margin),
    })`);
    check(after.resting === 0 && after.history.length === 5 && after.history.every((h) => h === "cancelled") && after.reserved === 0,
      "…the second press takes back the other four, returns every reserve, and all five are in the history",
      JSON.stringify(after));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }

  /* §70 — the portfolio's ledger views and the tax report helper (28 Sep
   * 2026, *"portföy kısmını da detaylandıralım … ülkeye göre rapor
   * yardımcısı"*). Records seeded the way the portfolio stores them: the
   * activity puts a partly sold purchase back together, a holding opens in
   * detail and Esc puts it away without closing the portfolio, the tax
   * screen estimates from the rate typed and downloads the country's form,
   * the lot form records a dated receipt as income, and on a phone no
   * ledger table runs off the screen. */
  {
    const d = (iso) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 1000);
    const PF = [
      { coin: "BTC", amount: 0.9, target: null, watches: [],
        lots: [
          { amount: 0.2, paid: 6000, time: d("2024-03-01"), source: "manual", currency: "USD" },
          { amount: 0.7, paid: 42000, time: d("2025-11-01"), source: "manual", currency: "USD" },
        ],
        sales: [{ amount: 0.3, received: 28000, basis: 9000, basisAmount: 0.3, time: d("2025-02-10"), currency: "USD", method: "fifo",
          matched: [{ amount: 0.3, cost: 9000, acquired: d("2024-03-01"), source: "manual" }] }] },
      { coin: "ETH", amount: 2, target: null, watches: [], sales: [],
        lots: [
          { amount: 1.9, paid: 5000, time: d("2025-01-15"), source: "manual", currency: "USD" },
          { amount: 0.1, paid: 300, time: d("2025-08-01"), source: "manual", currency: "USD", kind: "income" },
        ] },
    ];
    const seed = `localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_portfolio", ${JSON.stringify(JSON.stringify(PF))});`;
    const { ctx, page, errors } = await newCtx(browser, seed);
    await page.keyboard.press("p");
    await page.waitForSelector("[data-portfolio-head]", { timeout: 8000 });
    await page.waitForTimeout(1500);
    const activity = await page.evaluate(`[...document.querySelectorAll("[data-portfolio-activity] [data-label='What'] button")].map((n) => n.textContent)`);
    check(activity.join(" | ") === "Bought BTC | Received ETH | Sold BTC | Bought ETH | Bought BTC",
      "the activity lists every record newest first — the sold slice and the held part of the 2024 purchase are one line again",
      JSON.stringify(activity));
    const first2024 = await page.evaluate(`(() => { const rows = [...document.querySelectorAll("[data-portfolio-activity] [data-label='What']")]; const last = rows[rows.length - 1].parentNode; return [...last.children].map((n) => n.textContent); })()`);
    check(first2024[2] === "0.5", "…as the 0.5 BTC that was bought, not the 0.2 still held", JSON.stringify(first2024));
    const perf = await page.evaluate(`(() => { const n = document.querySelector("[data-portfolio-performance] strong"); return n ? n.textContent : null; })()`);
    check(perf && /^[+−]?\d+\.\d%$/.test(perf), "the performance panel prints the time-weighted return as a figure", String(perf));

    /* One holding in detail, and Esc takes only the detail away. */
    await page.click("button[aria-label='BTC purchase lots']");
    await page.waitForTimeout(400);
    await page.click("[data-portfolio-details='BTC']");
    await page.waitForSelector("[data-portfolio-asset='BTC']", { timeout: 4000 });
    const asset = await page.evaluate(`(() => { const n = document.querySelector("[data-portfolio-asset='BTC']"); return { text: n.innerText, lots: n.querySelectorAll("[data-label='Held']").length }; })()`);
    check(asset.lots === 2 && /Realized\s*\+\$19,000\.00/i.test(asset.text), "Details opens the holding: its two lots held and the gain its sale realized", JSON.stringify(asset));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const afterEsc = await page.evaluate(`({ asset: !!document.querySelector("[data-portfolio-asset]"), portfolio: !!document.querySelector("[data-portfolio-head]") })`);
    check(!afterEsc.asset && afterEsc.portfolio, "Esc puts the detail away and leaves the portfolio open", JSON.stringify(afterEsc));

    /* The tax helper: the country from the currency, the estimate from the rate. */
    await page.click("[data-portfolio-tax-open]");
    await page.waitForSelector("[data-portfolio-tax]", { timeout: 4000 });
    const estimate = () => page.evaluate(`document.querySelector("[data-portfolio-tax] strong").textContent`);
    const country = await page.evaluate(`document.querySelector("[data-portfolio-tax]").getAttribute("data-portfolio-tax")`);
    check(country === "us", "a portfolio shown in dollars opens on the United States", country);
    check((await estimate()) === "$4,246.00", "19,000 short-term at 22% and 300 of income at 22%: $4,246.00", await estimate());
    await page.fill("input[aria-label='Short-term (your income rate) %']", "30");
    await page.waitForTimeout(300);
    check((await estimate()) === "$5,766.00", "typing 30% re-estimates at once", await estimate());
    const kept = await page.evaluate(`JSON.parse(localStorage.getItem("crypto_chart_tax_settings"))`);
    check(kept && kept.rates && kept.rates.us && kept.rates.us.short === 30, "…and the rate is kept", JSON.stringify(kept));
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-portfolio-tax] button:has-text('(CSV)')")]);
    const csv = require("fs").readFileSync(await dl.path(), "utf8");
    check(/Part I — Short-term \(box I\)/.test(csv) && /0\.3 BTC,03\/01\/2024,02\/10\/2025,28000\.00,9000\.00,,,19000\.00/.test(csv) && /not tax advice/i.test(csv),
      "the download is Form 8949's columns, the sale in Part I, and says it is an estimate", csv.slice(0, 400));
    const unnamed = await page.evaluate(`[...document.querySelectorAll("[data-portfolio-tax] button, [data-portfolio-tax] input")].filter((n) => (n.tagName === "BUTTON" && !n.getAttribute("type")) || !(n.getAttribute("aria-label") || n.textContent.trim())).length`);
    check(unnamed === 0, "every control on the tax screen has a type and a name", String(unnamed));
    await page.click("[data-portfolio-tax] button:has-text('Germany')");
    await page.waitForTimeout(300);
    const de = await page.evaluate(`({ c: document.querySelector("[data-portfolio-tax]").getAttribute("data-portfolio-tax"), kept: JSON.parse(localStorage.getItem("crypto_chart_tax_settings")).country, text: document.querySelector("[data-portfolio-tax]").innerText })`);
    check(de.c === "de" && de.kept === "de" && /only records entered while EUR was on screen/i.test(de.text),
      "Germany reports in euros, says the dollar records are set aside, and is remembered", JSON.stringify({ c: de.c, kept: de.kept }));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    check(await page.evaluate(`!document.querySelector("[data-portfolio-tax]") && !!document.querySelector("[data-portfolio-head]")`),
      "Esc puts the tax screen away and leaves the portfolio open");

    /* A dated receipt, recorded through the form. */
    await page.click("button[aria-label='ETH purchase lots']");
    await page.waitForTimeout(400);
    await page.click("button[title^='Record coins received']");
    await page.fill("input[type='date']", "2026-03-02");
    await page.fill("input[aria-label='Lot amount']", "0.05");
    await page.fill("input[aria-label='Value when received']", "140");
    await page.click("button:text-is('Record')");
    await page.waitForTimeout(400);
    const lot = await page.evaluate(`JSON.parse(localStorage.getItem("crypto_chart_portfolio")).find((h) => h.coin === "ETH").lots.pop()`);
    check(lot && lot.kind === "income" && lot.time === d("2026-03-02") && lot.paid === 140,
      "Received with a date records an income lot at noon UTC on that day, worth what was typed", JSON.stringify(lot));
    const eth = await page.evaluate(`JSON.parse(localStorage.getItem("crypto_chart_portfolio")).find((h) => h.coin === "ETH").amount`);
    check(Math.abs(eth - 2.05) < 1e-9, "…and the amount grows by the 0.05 received, so no older purchase is trimmed to make room", String(eth));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();

    /* On a phone, a record is a card: no ledger table is wider than its screen. */
    const phone = await browser.newContext({ viewport: { width: 420, height: 860 } });
    await phone.route("**/*", (r) => (r.request().url().startsWith("file://") ? r.continue()
      : r.request().url().includes("historic") ? r.fulfill(json({ data: { prices: PRICES } }))
        : r.request().url().includes("spot") ? r.fulfill(json({ data: { amount: "43000", currency: "USD" } })) : r.fulfill(json({}))));
    await phone.addInitScript(seed);
    const pp = await phone.newPage();
    await pp.goto(INDEX, { waitUntil: "load" });
    await pp.waitForSelector("svg path", { timeout: 20000 });
    await pp.keyboard.press("p");
    await pp.waitForSelector("[data-portfolio-head]", { timeout: 8000 });
    await pp.waitForTimeout(1200);
    const wide = (scope) => pp.evaluate(`[...document.querySelectorAll(${JSON.stringify(scope)})].map((n) => n.scrollWidth - n.clientWidth).filter((x) => x > 1).length`);
    check((await wide("[data-portfolio-activity] > div:last-of-type")) === 0, "on a phone the activity fits its panel");
    await pp.click("[data-portfolio-tax-open]");
    await pp.waitForSelector("[data-portfolio-tax]", { timeout: 4000 });
    const stage = await pp.evaluate(`(() => { const n = document.querySelector("[data-portfolio-tax]"); return n.scrollWidth - n.clientWidth; })()`);
    const cards = await pp.evaluate(`[...document.querySelectorAll("[data-portfolio-tax] [data-label]")].filter((n) => { const b = n.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1); }).length`);
    check(stage <= 1 && cards === 0, "…and the tax screen's tables become cards, none past the screen's edge", JSON.stringify({ stage, cards }));
    await phone.close();
  }

  /* §71 — the tax guide covers every country (28 Sep 2026, *"tax
   * muhabbetini sadece dört ülkeye vermeyelim … bütün dünya ülkeleri"*).
   * 244 countries and territories, each with a card that says what is and
   * is not taxed, read from official sources only (28 Sep 2026, *"ciddi
   * devlet kuruluşları olmalı"*): a search finds one, the filter counts are
   * the data's, the list moves on the arrow keys, a territory under another
   * country's law shows that law, a country with no official source
   * confirmed claims nothing, and the glossary's world totals add up. */
  {
    const { ctx, page, errors } = await newCtx(browser,
      `localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_portfolio", ${JSON.stringify(JSON.stringify([{ coin: "BTC", amount: 1, target: null, watches: [], sales: [], lots: [] }]))});`);
    await page.keyboard.press("p");
    await page.waitForSelector("[data-portfolio-head]", { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.click("[data-portfolio-tax-open]");
    await page.waitForSelector("[data-tax-picker]", { timeout: 4000 });
    const all = await page.evaluate(`document.querySelectorAll("[data-tax-picker] [role=option]").length`);
    check(all === 244, "the guide lists 244 countries and territories", String(all));

    await page.fill("[data-tax-picker] input", "fran");
    await page.waitForTimeout(200);
    await page.click('[data-tax-code="fr"]');
    await page.waitForTimeout(300);
    const fr = await page.evaluate(`(() => { const c = document.querySelector("[data-tax-card]"); const v = {}; c.querySelectorAll("[data-tax-verdict]").forEach((n, i) => { v[i] = n.getAttribute("data-tax-verdict"); }); return { code: c.getAttribute("data-tax-card"), verdicts: v, text: c.innerText }; })()`);
    check(fr.code === "fr" && fr.verdicts[4] === "N" && fr.verdicts[3] === "T" && /€305/.test(fr.text) && /From official sources/i.test(fr.text) && /impots\.gouv\.fr/.test(await page.evaluate(`[...document.querySelectorAll("[data-tax-card] a[href]")].map((a) => a.href).join(" ")`)),
      "France: selling is taxed, swapping is not, the €305 sales limit is a rule, and the card says it was read from official sources, linked", JSON.stringify(fr.verdicts));
    const kept = await page.evaluate(`JSON.parse(localStorage.getItem("crypto_chart_tax_settings")).country`);
    check(kept === "fr", "…and the choice is kept", String(kept));

    await page.fill("[data-tax-picker] input", "");
    await page.click("[data-tax-picker] button:has-text('Banned')");
    await page.waitForTimeout(200);
    const banned = await page.evaluate(`[...document.querySelectorAll("[data-tax-picker] [role=option]")].map((n) => n.getAttribute("data-tax-code"))`);
    check(banned.length === 6 && banned.includes("dz") && banned.includes("cn"), "the Banned filter shows the six countries whose prohibition an official source confirms", JSON.stringify(banned));
    await page.click("[data-tax-picker] button:has-text('All')");
    await page.waitForTimeout(200);

    await page.focus('[data-tax-code="fr"]');
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    const moved = await page.evaluate(`({ selected: document.querySelector("[data-tax-picker] [aria-selected=true]").getAttribute("data-tax-code"), focused: document.activeElement.getAttribute("data-tax-code"), card: document.querySelector("[data-tax-card]").getAttribute("data-tax-card") })`);
    check(moved.selected !== "fr" && moved.selected === moved.focused && moved.card === moved.selected, "ArrowDown moves the selection and the focus to the next country, and the card follows", JSON.stringify(moved));

    await page.fill("[data-tax-picker] input", "réunion");
    await page.waitForTimeout(200);
    await page.click('[data-tax-code="re"]');
    await page.waitForTimeout(300);
    const re = await page.evaluate(`document.querySelector("[data-tax-card]").innerText`);
    check(/tax law of France applies here/.test(re) && /€305/.test(re), "Réunion shows France's rules, and says why", re.slice(0, 200));

    await page.fill("[data-tax-picker] input", "chad");
    await page.waitForTimeout(200);
    await page.click('[data-tax-code="td"]');
    await page.waitForTimeout(300);
    const td = await page.evaluate(`({ v: [...document.querySelectorAll("[data-tax-card] [data-tax-verdict]")].map((n) => n.getAttribute("data-tax-verdict")), note: !!document.querySelector("[data-tax-card] [data-tax-unverified]"), text: document.querySelector("[data-tax-card]").innerText })`);
    check(td.v.length === 0 && td.note && /No official source was confirmed/.test(td.text) && !/Official sources/.test(td.text),
      "a country with no official source confirmed claims nothing — no verdict, no sources heading — and says to check with its tax authority", JSON.stringify(td));

    await page.click('[data-tax-tab="guide"]');
    await page.waitForTimeout(300);
    const guide = await page.evaluate(`(() => { const n = document.querySelector("[data-portfolio-tax]"); const cells = [...n.querySelectorAll("strong")].slice(0, 11).map((x) => Number(x.textContent)); return { terms: n.querySelectorAll("dt").length, sum: cells.reduce((a, b) => a + b, 0) }; })()`);
    check(guide.terms === 20 && guide.sum === 244, "What is what: twenty terms, and the world's statuses add up to 244", JSON.stringify(guide));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();

    /* On a phone: one column, the list short, nothing past the edge. */
    const phone = await browser.newContext({ viewport: { width: 420, height: 860 } });
    await phone.route("**/*", (r) => (r.request().url().startsWith("file://") ? r.continue()
      : r.request().url().includes("historic") ? r.fulfill(json({ data: { prices: PRICES } }))
        : r.request().url().includes("spot") ? r.fulfill(json({ data: { amount: "43000", currency: "USD" } })) : r.fulfill(json({}))));
    await phone.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_portfolio", ${JSON.stringify(JSON.stringify([{ coin: "BTC", amount: 1, target: null, watches: [], sales: [], lots: [] }]))});`);
    const pp = await phone.newPage();
    await pp.goto(INDEX, { waitUntil: "load" });
    await pp.waitForSelector("svg path", { timeout: 20000 });
    await pp.keyboard.press("p");
    await pp.waitForSelector("[data-portfolio-head]", { timeout: 8000 });
    await pp.waitForTimeout(800);
    await pp.click("[data-portfolio-tax-open]");
    await pp.waitForSelector("[data-tax-picker]", { timeout: 4000 });
    await pp.waitForTimeout(400);
    const lay = await pp.evaluate(`(() => { const stage = document.querySelector("[data-portfolio-tax]"); const list = document.querySelector("[data-tax-picker] [role=listbox]"); const sel = list.querySelector("[aria-selected=true]"); const lb = list.getBoundingClientRect(); const sb = sel.getBoundingClientRect(); return { over: stage.scrollWidth - stage.clientWidth, listH: Math.round(lb.height), selectedVisible: sb.top >= lb.top - 1 && sb.bottom <= lb.bottom + 1 }; })()`);
    check(lay.over <= 1 && lay.listH <= 260 && lay.selectedVisible, "on a phone the guide fits, its list is short, and the chosen country is in view", JSON.stringify(lay));
    await phone.close();
  }

  /* §73 — the chart's frame (29 Sep 2026, the chart plan's Phase 1): a
   * price scale on the right and a time axis along the foot in every mode,
   * one tick system for the axis and the grid, the last price as a tag in
   * the gutter, and the pointer's price and time as pills on the axes —
   * snapped to the point the readout describes, so the two cannot name
   * different prices. Measured with a real mouse, in every mode, at 1280
   * and 420: no two labels overlap and none is cut off. */
  {
    const AXES = `(() => {
      const layer = document.querySelector("[data-axes]");
      if (!layer) return null;
      const svg = layer.ownerSVGElement;
      const sb = svg.getBoundingClientRect();
      const shown = (n) => { for (let m = n; m && m !== svg; m = m.parentNode) { if (m.getAttribute && m.getAttribute("visibility") === "hidden") return false; } return true; };
      const texts = [...svg.querySelectorAll("text")].filter((t) => t.textContent.trim() && shown(t) && Number(getComputedStyle(t).opacity) > 0.05);
      const boxes = texts.map((t) => ({ t: t.textContent, b: t.getBoundingClientRect(), axis: !!t.closest("[data-axes]") }));
      const overlaps = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].b, b = boxes[j].b;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2 && (boxes[i].axis || boxes[j].axis)) overlaps.push(boxes[i].t + " / " + boxes[j].t);
      }
      const clipped = boxes.filter((x) => x.axis && (x.b.left < sb.left - 1 || x.b.right > sb.right + 1 || x.b.top < sb.top - 1 || x.b.bottom > sb.bottom + 1)).map((x) => x.t);
      const ticks = [...layer.querySelectorAll("[data-axis-tick]")].filter(shown);
      const times = [...layer.querySelectorAll("[data-axis-time]")].filter(shown);
      const frame = [...layer.querySelectorAll("line")].filter(shown).find((l) => l.getAttribute("x1") === l.getAttribute("x2") && Number(l.getAttribute("y1")) === 0);
      const plotW = frame ? Number(frame.getAttribute("x1")) - 0.5 : NaN;
      const tag = [...layer.querySelectorAll("rect[data-axis-last='tag']")].filter(shown)[0];
      const pill = [...layer.querySelectorAll("[data-axis-last='pointer-price']")].filter(shown)[0];
      const pillTime = [...layer.querySelectorAll("[data-axis-last='pointer-time']")].filter(shown)[0];
      const readout = texts.filter((t) => !t.closest("[data-axes]") && /^[$€£]?[\\d,]+\\.\\d+$/.test(t.textContent.trim())).map((t) => t.textContent.trim());
      return {
        svg: { x: sb.x, y: sb.y, w: sb.width, h: sb.height },
        plotW,
        ticks: ticks.map((t) => ({ text: t.textContent, y: Number(t.getAttribute("y")) - 3.5, x: Number(t.getAttribute("x")) })),
        times: times.map((t) => t.textContent),
        tag: tag ? { x: Number(tag.getAttribute("x")), y: Number(tag.getAttribute("y")) + Number(tag.getAttribute("height")) / 2 } : null,
        pill: pill ? { text: pill.textContent, y: Number(pill.getAttribute("y")) - 3.5 } : null,
        pillTime: pillTime ? pillTime.textContent : null,
        readout,
        overlaps, clipped,
      };
    })()`;
    const series = Array.from({ length: 200 }, (_, i) => ({
      price: (43000 + i * 6 + Math.sin(i / 11) * 420).toFixed(2),
      time: NOW_S - (200 - i) * 18,
    }));
    const modes = [
      ["line", ""],
      ["candles", `localStorage.setItem("crypto_chart_chart_type", "candles");`],
      ["grid", `localStorage.setItem("crypto_chart_grid", "true");`],
      ["board", `localStorage.setItem("crypto_chart_predict", "true");`],
      ["log", `localStorage.setItem("crypto_chart_log_scale", "true");`],
    ];
    for (const [mode, init] of modes) {
      const { ctx, page, errors } = await newCtx(browser, `localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_page_ticker_enabled", "false"); ${init}`, series);
      await page.mouse.move(640, 5);
      await page.waitForTimeout(300);
      const a = await page.evaluate(AXES);
      check(a && a.ticks.length >= 3 && a.times.length >= 3,
        `${mode}: the chart has a price scale and a time axis`, JSON.stringify(a && { ticks: a.ticks.length, times: a.times }));
      check(a && a.ticks.every((t) => t.x > a.plotW), `${mode}: every price label sits in the gutter, outside the plot`, JSON.stringify(a && a.ticks.slice(0, 3)));
      check(a && a.overlaps.length === 0 && a.clipped.length === 0, `${mode}: no axis label overlaps another or is cut off`, JSON.stringify(a && { o: a.overlaps, c: a.clipped }));
      if (mode === "board") {
        check(a && a.tag === null, "board: the last price has no tag in the gutter, the board's now line carries it", JSON.stringify(a && a.tag));
      } else {
        check(a && a.tag && a.tag.x > a.plotW, `${mode}: the last price is a tag in the gutter`, JSON.stringify(a && a.tag));
      }
      if (mode === "grid") {
        const mesh = await page.evaluate(`[...document.querySelectorAll(".pt-mesh line")].filter((l) => l.getAttribute("visibility") !== "hidden" && l.getAttribute("y1") === l.getAttribute("y2")).map((l) => Number(l.getAttribute("y1")))`);
        const off = a.ticks.filter((t) => !mesh.some((y) => Math.abs(y - t.y) <= 1));
        check(mesh.length >= 3 && off.length === 0, "grid: every price label sits on a gridline — one tick system", JSON.stringify({ mesh: mesh.length, off }));
      }
      if (mode === "line" || mode === "candles") {
        // A real pointer over the plot: the pills sit on the point the readout names
        await page.mouse.move(a.svg.x + a.plotW * 0.55, a.svg.y + a.svg.h * 0.45);
        await page.waitForTimeout(250);
        const on = await page.evaluate(AXES);
        check(on.pill && on.pillTime && on.readout.includes(on.pill.text),
          `${mode}: hovering prints the pointed price on the scale and the time on the foot — the readout's own price`, JSON.stringify({ pill: on.pill, time: on.pillTime, readout: on.readout }));
        check(on.overlaps.length === 0, `${mode}: …and the pills cover no label`, JSON.stringify(on.overlaps));
        await page.mouse.move(a.svg.x + a.plotW + 20, a.svg.y + a.svg.h * 0.45);
        await page.waitForTimeout(250);
        const gutter = await page.evaluate(AXES);
        check(!gutter.pill && !gutter.pillTime, `${mode}: the pointer over the scale is off the chart — the pills go`, JSON.stringify({ pill: gutter.pill, time: gutter.pillTime }));
        await page.mouse.move(a.svg.x + a.plotW * 0.55, a.svg.y - 40);
        await page.waitForTimeout(250);
        const off = await page.evaluate(AXES);
        check(!off.pill && !off.pillTime, `${mode}: …and leave with the pointer`, JSON.stringify({ pill: off.pill }));
      }
      check(errors.length === 0, `${mode}: nothing threw`, errors.join(" | "));
      await ctx.close();
    }

    /* The comparison: the scale reads in percent, and nothing prints twice. */
    {
      const { ctx, page, errors } = await newCtx(browser, `localStorage.setItem("crypto_chart_onboarding_seen", "1");`, series, 0, true);
      await page.keyboard.press("c");
      await page.waitForTimeout(400);
      await page.keyboard.type("ETH");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1600);
      await page.mouse.move(640, 5);
      await page.waitForTimeout(300);
      const a = await page.evaluate(AXES);
      check(a && a.ticks.length >= 3 && a.ticks.every((t) => /%$/.test(t.text)), "compare: the scale reads in percent", JSON.stringify(a && a.ticks.map((t) => t.text)));
      const byY = a ? a.ticks.slice().sort((p, q) => p.y - q.y).map((t) => Number(t.text.replace("−", "-").replace(/[+%]/g, ""))) : [];
      check(byY.every((v, i) => i === 0 || v < byY[i - 1]), "compare: …higher on the scale is a larger change", JSON.stringify(byY));
      const inside = await page.evaluate(`[...document.querySelectorAll("[data-compare-tick]")].filter((n) => n.getAttribute("visibility") !== "hidden" && n.textContent.trim()).length`);
      check(inside === 0, "compare: the in-plot percent ticks stand down for the axis", String(inside));
      check(a && a.overlaps.length === 0 && a.clipped.length === 0, "compare: no axis label overlaps another or is cut off", JSON.stringify(a && { o: a.overlaps, c: a.clipped }));
      check(errors.length === 0, "compare: nothing threw", errors.join(" | "));
      await ctx.close();
    }

    /* Prices the chart cannot refresh say how old they are: a fresh chart
       carries no note, and the same prices fifteen minutes later with the
       network gone say "Prices from 15 min ago". */
    {
      const { ctx, page, errors } = await newCtx(browser, `localStorage.setItem("crypto_chart_onboarding_seen", "1"); if (sessionStorage.getItem("offline") === "1") Object.defineProperty(Navigator.prototype, "onLine", { get: () => false, configurable: true });`, series);
      const fresh = await page.evaluate(`document.querySelectorAll("[data-chart-age]").length`);
      await page.evaluate(`(() => { const k = "crypto_chart_price_cache"; const e = JSON.parse(localStorage.getItem(k)); for (const x of e) x[1].timestamp -= 15 * 60000; localStorage.setItem(k, JSON.stringify(e)); sessionStorage.setItem("offline", "1"); })()`);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(1200);
      const aged = await page.evaluate(`(document.querySelector("[data-chart-age]") || {}).textContent || null`);
      check(fresh === 0 && /^Prices from 1[56] min ago$/.test(aged || ""), "prices the chart cannot refresh say how old they are, and fresh ones say nothing", JSON.stringify({ fresh, aged }));
      check(errors.length === 0, "…nothing threw", errors.join(" | "));
      await ctx.close();
    }

    /* A phone: a narrower gutter and fewer labels, still a frame. */
    {
      const phone = await browser.newContext({ viewport: { width: 420, height: 860 } });
      await phone.route("**/*", (r) => (r.request().url().startsWith("file://") ? r.continue()
        : r.request().url().includes("historic") ? r.fulfill(json({ data: { prices: series } }))
          : r.request().url().includes("spot") ? r.fulfill(json({ data: { amount: series[series.length - 1].price, currency: "USD" } })) : r.fulfill(json({ data: {} }))));
      await phone.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1");`);
      const pp = await phone.newPage();
      await pp.goto(INDEX, { waitUntil: "load" });
      await pp.waitForSelector("svg path", { timeout: 20000 });
      await pp.waitForTimeout(1500);
      const a = await pp.evaluate(AXES);
      check(a && a.ticks.length >= 3 && a.times.length >= 2 && a.overlaps.length === 0 && a.clipped.length === 0 && a.svg.w - a.plotW <= 90,
        "on a phone the chart keeps its frame: labels on both axes, none overlapping or cut, a gutter under 90px", JSON.stringify(a && { ticks: a.ticks.length, times: a.times, gutter: a.svg.w - a.plotW, o: a.overlaps, c: a.clipped }));
      await phone.close();
    }
  }

  /* §74 — the chart's window in time (29 Sep 2026, the chart plan's Phase
   * 2). A range is a preset; inside it the wheel zooms around the pointer,
   * a drag pans, + and − zoom, the arrows walk it while the chart has the
   * focus, a double-click or the chip puts the whole range back. A narrow
   * window asks Coinbase Exchange for finer bars and draws them; the 1H
   * range, whose own points are finer than any candle, asks nothing. It
   * stands down with calls on, and a coin switch lets it go. Driven with a
   * real wheel, a real drag and real keys. */
  {
    const DAY_MS = 86400000;
    const NOW_MS = Date.now();
    const priceAt = (t) => 43000 + Math.sin(t / 3.6e6) * 700 + Math.sin(t / 4e5) * 90;
    const daySeries = Array.from({ length: 300 }, (_, i) => {
      const t = NOW_MS - DAY_MS + (DAY_MS * i) / 299;
      return { price: priceAt(t).toFixed(2), time: Math.floor(t / 1000) };
    });
    const hourSeries = Array.from({ length: 360 }, (_, i) => {
      const t = NOW_MS - 3600000 + 10000 * i;
      return { price: priceAt(t).toFixed(2), time: Math.floor(t / 1000) };
    });
    const openView = async (init) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const asked = [];
      const route = (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        if (u.includes("historic")) return r.fulfill(json({ data: { prices: /period=hour/.test(u) ? hourSeries : daySeries } }));
        if (u.includes("/spot")) return r.fulfill(json({ data: { amount: daySeries[daySeries.length - 1].price, currency: "USD" } }));
        const m = u.match(/candles\?granularity=(\d+)(?:&start=([^&]+)&end=([^&]+))?/);
        if (m) {
          if (m[2]) asked.push(Number(m[1]));
          const g = Number(m[1]) * 1000;
          const s = m[2] ? Date.parse(decodeURIComponent(m[2])) : NOW_MS - DAY_MS;
          const e = m[3] ? Math.min(Date.parse(decodeURIComponent(m[3])), NOW_MS) : NOW_MS;
          const rows = [];
          for (let t = Math.ceil(s / g) * g; t <= e; t += g) {
            const o = priceAt(t);
            const c = priceAt(t + g);
            rows.push([t / 1000, Math.min(o, c) - 3, Math.max(o, c) + 3, o, c, 2]);
          }
          return r.fulfill(json(rows.reverse()));
        }
        return r.fulfill(json({ data: {} }));
      };
      route.answersOkx = true;
      await ctx.route("**/*", route);
      await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_page_ticker_enabled", "false"); ${init || ""}`);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(1200);
      return { ctx, page, errors, asked };
    };
    const READ = `(() => {
      const box = document.querySelector("[data-chart-viewport]");
      const svg = document.querySelector("[data-axes]").ownerSVGElement;
      const r = svg.getBoundingClientRect();
      const lines = [...svg.querySelectorAll("[data-axis-layer='lines'] line")].filter((l) => l.getAttribute("visibility") !== "hidden");
      const v = lines.find((l) => l.getAttribute("x1") === l.getAttribute("x2") && +l.getAttribute("y1") === 0);
      const hz = lines.find((l) => l.getAttribute("y1") === l.getAttribute("y2") && +l.getAttribute("x1") === 0);
      const path = svg.querySelector("g[data-line] path:nth-of-type(2)");
      return {
        viewport: Boolean(box),
        win: box ? box.getAttribute("data-chart-window") : null,
        chip: (document.querySelector("[data-chart-view-chip]") || {}).innerText || null,
        points: path ? (path.getAttribute("d").match(/[ML]/g) || []).length : 0,
        box: { x: r.x, y: r.y, w: v ? +v.getAttribute("x1") - 0.5 : r.width, h: hz ? +hz.getAttribute("y1") - 0.5 : r.height },
        coin: (document.querySelector("[data-tour='coin']") || document.body).innerText.slice(0, 40),
      };
    })()`;
    const win = (s) => (s && s.win ? s.win.split("-").map(Number) : null);

    // Line, 1D
    {
      const { ctx, page, errors, asked } = await openView("");
      await page.keyboard.press("2");
      await page.waitForTimeout(1500);
      const start = await page.evaluate(READ);
      check(start.viewport && start.win === null && start.chip === null, "the chart can be zoomed, and opens on the whole range", JSON.stringify(start));
      const b = start.box;
      await page.mouse.move(b.x + b.w * 0.5, b.y + b.h * 0.5);
      for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(25);
      }
      await page.waitForTimeout(1100);
      const zoomed = await page.evaluate(READ);
      const zw = win(zoomed);
      check(zw && zw[1] - zw[0] < 4 * 3600000 && /^Zoomed/.test(zoomed.chip || ""), "the wheel zooms in around the pointer, and the chip says so", JSON.stringify({ win: zoomed.win, chip: zoomed.chip }));
      const mid = (zw[0] + zw[1]) / 2;
      check(Math.abs(mid - (NOW_MS - DAY_MS / 2)) < 20 * 60000, "…the instant under the pointer stays under it", `${Math.round((mid - (NOW_MS - DAY_MS / 2)) / 60000)} min off`);
      check(asked.includes(60), "a window this narrow asks for 1-minute bars", JSON.stringify(asked));
      check(zoomed.points > ((zw[1] - zw[0]) / DAY_MS) * 300 * 3, "…and draws them: more points than the range had in that window", `${zoomed.points} points`);

      // A drag pans, and the click that ends it picks nothing
      await page.keyboard.press("a");
      await page.waitForTimeout(700);
      const before = await page.evaluate(`(document.querySelector("[data-alerts-card] input[inputmode='decimal'], [data-alerts-card] input") || {}).value || ""`);
      await page.mouse.move(b.x + b.w * 0.6, b.y + b.h * 0.5);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.w * 0.6 + i * 25, b.y + b.h * 0.5);
      await page.mouse.up();
      await page.waitForTimeout(900);
      const panned = await page.evaluate(READ);
      const pw = win(panned);
      check(pw && pw[0] < zw[0] && Math.abs(pw[1] - pw[0] - (zw[1] - zw[0])) < 1000, "a drag to the right walks the window back in time, the same width", JSON.stringify({ from: zoomed.win, to: panned.win }));
      const after = await page.evaluate(`(document.querySelector("[data-alerts-card] input[inputmode='decimal'], [data-alerts-card] input") || {}).value || ""`);
      check(after === before, "…and the click that ends a pan picks no price for a target", JSON.stringify({ before, after }));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);

      // The crosshair reads a real point, never the edge the line was cut at
      await page.mouse.move(b.x + 1, b.y + b.h * 0.5);
      await page.waitForTimeout(300);
      // The crosshair's own dot: the r=3.5 circle in the group the hover shows
      const dot = await page.evaluate(`(() => { const d = document.querySelector("[data-axes]").ownerSVGElement.querySelector("g[visibility='visible'] > circle[r='3.5']"); return d ? Number(d.getAttribute("cx")) : null; })()`);
      check(dot != null && dot > 1, "the readout at the window's edge is a real price, not the interpolated edge", String(dot));

      // A double-click puts the whole range back
      await page.mouse.dblclick(b.x + b.w * 0.4, b.y + b.h * 0.5);
      await page.waitForTimeout(800);
      const whole = await page.evaluate(READ);
      check(whole.win === null && whole.chip === null && whole.points === 300, "a double-click shows the whole range again", JSON.stringify({ win: whole.win, points: whole.points }));

      /* Keys: = zooms onto the latest price, − out, Shift with ← and →
         walks while the chart has the focus — the plain arrows read it
         point by point since 30 Sep 2026 (§79). */
      await page.mouse.move(b.x + b.w * 0.5, b.y - 60);
      await page.keyboard.press("=");
      await page.keyboard.press("=");
      await page.waitForTimeout(700);
      const k1 = win(await page.evaluate(READ));
      check(k1 && Math.abs(k1[1] - daySeries[daySeries.length - 1].time * 1000) < 1000 && k1[1] - k1[0] < DAY_MS * 0.5, "= zooms in on the latest price", JSON.stringify(k1));
      await page.focus("[data-chart-viewport]");
      await page.keyboard.press("Shift+ArrowLeft");
      await page.waitForTimeout(700);
      const k2 = win(await page.evaluate(READ));
      const coinBefore = await page.evaluate(`document.title`);
      check(k2 && k2[0] < k1[0] && Math.abs((k1[0] - k2[0]) - (k1[1] - k1[0]) * 0.2) < 1000, "with the chart focused, Shift + ← walks a fifth of the window back", JSON.stringify(k2));
      await page.keyboard.press("-");
      await page.waitForTimeout(700);
      const k3 = win(await page.evaluate(READ));
      check(k3 && k3[1] - k3[0] > (k2[1] - k2[0]) * 1.4, "− zooms out", JSON.stringify(k3));
      check((await page.evaluate(`document.title`)) === coinBefore, "…and the arrows did not switch the coin");

      // The chip's button
      const reset = await page.$("[data-chart-view-chip] button");
      check(Boolean(reset) && (await reset.getAttribute("type")) === "button", "the chip carries a real button");
      if (reset) {
        await reset.click();
        await page.waitForTimeout(700);
        const r = await page.evaluate(READ);
        check(r.win === null && r.chip === null, "…which puts the whole range back", JSON.stringify(r.win));
      }

      // A coin switch lets the window go
      await page.keyboard.press("=");
      await page.waitForTimeout(600);
      await page.evaluate(`document.activeElement && document.activeElement.blur()`);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(1500);
      const next = await page.evaluate(READ);
      check(next.win === null && next.chip === null, "switching the coin shows its whole range", JSON.stringify(next.win));
      check(errors.length === 0, "nothing threw", errors.join(" | "));
      await ctx.close();
    }

    // The 1H range asks nothing: its own points are finer than a candle
    {
      const { ctx, page, errors, asked } = await openView("");
      const s = await page.evaluate(READ);
      await page.mouse.move(s.box.x + s.box.w * 0.5, s.box.y + s.box.h * 0.5);
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(25);
      }
      await page.waitForTimeout(1000);
      const z = await page.evaluate(READ);
      check(z.win !== null && asked.length === 0, "the hour zooms on its own ten-second points and asks for nothing", JSON.stringify({ win: z.win, asked }));
      check(errors.length === 0, "…nothing threw", errors.join(" | "));
      await ctx.close();
    }

    // Candles: a narrow window draws 1-minute bars
    {
      const { ctx, page, errors, asked } = await openView(`localStorage.setItem("crypto_chart_chart_type", "candles");`);
      await page.keyboard.press("2");
      await page.waitForTimeout(1600);
      const s = await page.evaluate(READ);
      await page.mouse.move(s.box.x + s.box.w * 0.5, s.box.y + s.box.h * 0.4);
      for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(25);
      }
      await page.waitForTimeout(1200);
      const z = await page.evaluate(READ);
      const zw = win(z);
      // A candle is two rectangles in the path — its wick and its body
      const bars = await page.evaluate(`(() => { const l = [...document.querySelectorAll("[data-candles]")].find((g) => Number(g.getAttribute("opacity")) > 0.5); return l ? [...l.querySelectorAll("path")].slice(2).map((p) => (p.getAttribute("d").match(/M/g) || []).length).reduce((a, b) => a + b, 0) / 2 : 0; })()`);
      const minutes = zw ? (zw[1] - zw[0]) / 60000 : 0;
      check(asked.includes(60) && bars >= minutes * 0.8 && bars <= minutes + 3, "candles in a narrow window are 1-minute bars, one a minute", JSON.stringify({ bars, minutes: Math.round(minutes), asked }));
      check(errors.length === 0, "…nothing threw", errors.join(" | "));
      await ctx.close();
    }

    // Calls on: the window stands down and the wheel is the page's
    {
      const { ctx, page, errors } = await openView(`localStorage.setItem("crypto_chart_predict", "true");`);
      const s = await page.evaluate(READ);
      await page.mouse.move(s.box.x + s.box.w * 0.3, s.box.y + s.box.h * 0.5);
      for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
      await page.waitForTimeout(700);
      const z = await page.evaluate(READ);
      check(!z.viewport && z.win === null, "with calls on the chart cannot be zoomed in time — the board keeps its own geometry", JSON.stringify({ viewport: z.viewport, win: z.win }));
      check(errors.length === 0, "…nothing threw", errors.join(" | "));
      await ctx.close();
    }
  }

  /* §75 — the chart's tools (29 Sep 2026, the chart plan's Phase 3): a
   * ruler on Shift + drag that counts how often the series moved that far
   * over that long; lines, rays, boxes and notes anchored in time and price,
   * kept per coin and currency, moved by a drag, taken away by Delete, listed
   * in the chart's drawer; a horizontal line that becomes a price target
   * through the targets drawer. Driven with a real mouse and real keys. */
  {
    const NOW_MS = Date.now();
    const priceAt = (t) => 43000 + Math.sin(t / 3.6e6) * 700 + Math.sin(t / 4e5) * 90;
    const spanOf = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3, year: 365 * 86400e3, all: 3650 * 86400e3 };
    const seriesFor = (period) => Array.from({ length: 300 }, (_, i) => {
      const span = spanOf[period] || spanOf.day;
      const t = NOW_MS - span + (span * i) / 299;
      return { price: priceAt(t).toFixed(2), time: Math.floor(t / 1000) };
    });
    const openTools = async (init) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const route = (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        if (u.includes("historic")) return r.fulfill(json({ data: { prices: seriesFor((u.match(/period=(\w+)/) || [])[1]) } }));
        if (u.includes("/spot")) return r.fulfill(json({ data: { amount: priceAt(NOW_MS).toFixed(2), currency: "USD" } }));
        if (u.includes("candles")) return r.fulfill(json([]));
        return r.fulfill(json({ data: {} }));
      };
      route.answersOkx = true;
      await ctx.route("**/*", route);
      await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_page_ticker_enabled", "false"); ${init || ""}`);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(1200);
      return { ctx, page, errors };
    };
    const PLOT = `(() => { const s = document.querySelector("[data-axes]").ownerSVGElement; const r = s.getBoundingClientRect(); const ls = [...s.querySelectorAll("[data-axis-layer='lines'] line")]; const v = ls.find((l) => l.getAttribute("x1") === l.getAttribute("x2") && +l.getAttribute("y1") === 0); const h = ls.find((l) => l.getAttribute("y1") === l.getAttribute("y2") && +l.getAttribute("x1") === 0); return { x: r.x, y: r.y, w: +v.getAttribute("x1") - 0.5, h: +h.getAttribute("y1") - 0.5 }; })()`;
    /* A tool from the strip, opening the + first when it is folded. The
       folded tools are in the document (so they can fade), hidden. */
    const pickTool = async (page, kind) => {
      if ((await page.getAttribute("[data-chart-tools]", "data-chart-tools")) !== "open") await page.click("[data-chart-tools-open]");
      await page.click(`[data-tool='${kind}']`);
    };
    const SHOWN_TOOLS = `[...document.querySelectorAll("[data-chart-tools] button")].filter((n) => getComputedStyle(n).visibility !== "hidden")`;
    const stored = (page) => page.evaluate(`JSON.parse(localStorage.getItem("crypto_chart_drawings") || "{}")`);
    const shapes = (page) => page.evaluate(`(() => { const out = {}; for (const n of document.querySelectorAll("[data-tools] [data-drawing]")) { if (n.getAttribute("visibility") === "hidden") continue; const id = n.getAttribute("data-drawing"); (out[id] = out[id] || []).push({ tag: n.tagName, x1: +n.getAttribute("x1"), x2: +n.getAttribute("x2"), y1: +n.getAttribute("y1"), y2: +n.getAttribute("y2") }); } return out; })()`);

    {
      const { ctx, page, errors } = await openTools("");
      await page.keyboard.press("2");
      await page.waitForTimeout(1500);
      const b = await page.evaluate(PLOT);
      const at = (fx, fy) => [b.x + b.w * fx, b.y + b.h * fy];
      /* At rest the tools are one + (30 Sep 2026): resting on it opens them
         after a second, and pointing at a tool says its name and its use. */
      const shut = await page.evaluate(`({ state: document.querySelector("[data-chart-tools]").getAttribute("data-chart-tools"), buttons: ${SHOWN_TOOLS}.length })`);
      check(shut.state === "shut" && shut.buttons === 1, "at rest the tools are a single +", JSON.stringify(shut));
      /* **Off the plot** (30 Sep 2026): the + sat in the plot's top-left, on
         the companion's index and the study labels. It is at the range
         row's right end now — level with the ranges, over the price scale,
         clear of ALL, and nowhere on the plot. */
      const place = await page.evaluate(`(() => {
        const box = (n) => { const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        const plus = box(document.querySelector("[data-chart-tools-open]"));
        const ranges = [...document.querySelectorAll("[data-tour='period'] button")].map(box);
        const svg = document.querySelector("[data-axes]").ownerSVGElement.getBoundingClientRect();
        const mid = (plus.t + plus.b) / 2;
        return { plus, lastRange: ranges[ranges.length - 1], level: ranges.every((r) => mid > r.t && mid < r.b), plotTop: svg.top, width: innerWidth };
      })()`);
      check(place.plus.b <= place.plotTop && place.level && place.plus.l > place.lastRange.r + 100 && place.plus.r > place.width - 100,
        "the + sits at the range row's right end: level with the ranges, far from ALL, above the plot", JSON.stringify(place));
      /* Folded, the tools are hidden, not merely transparent: a Tab from the
         + leaves the strip. */
      await page.focus("[data-chart-tools-open]");
      await page.keyboard.press("Tab");
      check(!(await page.evaluate(`Boolean(document.activeElement.closest("[data-chart-tools]"))`)), "…and a folded tool cannot be tabbed to");
      await page.evaluate(`document.activeElement.blur()`);
      const plus = await page.evaluate(`(() => { const r = document.querySelector("[data-chart-tools-open]").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      await page.mouse.move(plus[0], plus[1]);
      await page.waitForTimeout(400);
      check((await page.getAttribute("[data-chart-tools]", "data-chart-tools")) === "shut", "…a passing pointer does not open it");
      await page.waitForTimeout(900);
      const strip = await page.evaluate(`[...document.querySelectorAll("[data-chart-tools] [data-tool]")].filter((n) => getComputedStyle(n).visibility !== "hidden").map((n) => ({ tool: n.getAttribute("data-tool"), name: n.getAttribute("aria-label"), type: n.getAttribute("type"), pressed: n.getAttribute("aria-pressed") }))`);
      check(strip.length === 6 && strip.every((t) => t.name && t.type === "button" && t.pressed === "false"),
        "resting on it a second opens six tools, each a named button, none in the hand", JSON.stringify(strip.map((t) => t.tool)));
      await page.hover("[data-tool='trend']");
      await page.waitForTimeout(200);
      const hint = await page.evaluate(`(document.querySelector("[data-tool-hint]") || {}).innerText || ""`);
      check(/Trend line/.test(hint) && /Two presses/.test(hint), "pointing at a tool says its name and what it does", JSON.stringify(hint));
      /* Open, the pill grows out of the + to the left and stays clear of the
         ranges; the hint stays inside the window. It moves: the width is a
         transition, not a jump. */
      const open = await page.evaluate(`(() => {
        const box = (n) => { const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        const tray = document.querySelector("[data-chart-tools] [role='toolbar']");
        const ranges = [...document.querySelectorAll("[data-tour='period'] button")].map(box);
        const t = box(tray), h = box(document.querySelector("[data-tool-hint]"));
        return { tray: t, lastRange: ranges[ranges.length - 1], hint: h, width: innerWidth, moves: getComputedStyle(tray).transitionProperty };
      })()`);
      check(open.tray.l > open.lastRange.r && open.hint.r <= open.width && open.hint.l >= 0 && /width/.test(open.moves),
        "…the open tools stay clear of the ranges, the words stay in the window, and the pill opens as a movement", JSON.stringify(open));
      await page.mouse.move(b.x + b.w * 0.5, b.y + b.h * 0.9);
      await page.waitForTimeout(1000);
      check((await page.getAttribute("[data-chart-tools]", "data-chart-tools")) === "shut", "…and it folds back once the pointer has left");
      await page.click("[data-chart-tools-open]");
      await page.waitForTimeout(200);
      check((await page.getAttribute("[data-chart-tools]", "data-chart-tools")) === "open", "a press on the + opens it at once");
      await page.click("[data-chart-tools-open]");
      await page.waitForTimeout(200);

      // The ruler: Shift + drag
      await page.keyboard.down("Shift");
      await page.mouse.move(...at(0.3, 0.3));
      await page.mouse.down();
      await page.mouse.move(...at(0.5, 0.5), { steps: 8 });
      await page.mouse.move(...at(0.62, 0.6), { steps: 6 });
      await page.mouse.up();
      await page.keyboard.up("Shift");
      await page.waitForTimeout(300);
      const ruler = await page.evaluate(`[...document.querySelectorAll("[data-measure-line]")].filter((n) => n.getAttribute("visibility") !== "hidden").map((n) => n.textContent)`);
      check(ruler.length === 3 && /%/.test(ruler[0]) && /bars/.test(ruler[1]) && /of \d+ stretches/.test(ruler[2]),
        "Shift + drag measures: the change, the time and the bars, and how often it moved that far over that long", JSON.stringify(ruler));
      check(Object.keys(await stored(page)).length === 0, "…and keeps nothing");
      await page.mouse.click(...at(0.8, 0.8));
      await page.waitForTimeout(200);
      check((await page.evaluate(`[...document.querySelectorAll("[data-measure-line]")].filter((n) => n.getAttribute("visibility") !== "hidden").length`)) === 0,
        "…and is gone at the next press");

      // A horizontal line, one press
      await pickTool(page, "hline");
      check((await page.getAttribute("[data-tool='hline']", "aria-pressed")) === "true", "a tool in the hand says so");
      await page.mouse.click(...at(0.5, 0.25));
      await page.waitForTimeout(300);
      let st = await stored(page);
      const line = st.BTC && st.BTC[0];
      check(line && line.kind === "hline" && line.currency === "USD" && line.a.p > 0, "one press draws a line across and keeps it, for this coin and currency", JSON.stringify(line));
      check((await page.getAttribute("[data-chart-tools]", "data-chart-tools")) === "shut" && !(await page.$("[data-tool][aria-pressed='true']")), "…and puts the tool down, the tools folding back to their +");

      // A trend line, two presses
      await pickTool(page, "trend");
      await page.mouse.click(...at(0.2, 0.8));
      await page.mouse.move(...at(0.4, 0.6), { steps: 4 });
      await page.mouse.click(...at(0.6, 0.45));
      await page.waitForTimeout(300);
      st = await stored(page);
      const trend = st.BTC.find((d) => d.kind === "trend");
      check(trend && trend.b && trend.b.t > trend.a.t && trend.b.p > trend.a.p, "two presses draw a trend line between them", JSON.stringify(trend));
      const dayShapes = await shapes(page);
      const t1d = dayShapes[trend.id] && dayShapes[trend.id][0];

      // Select the line with a press on it, drag it, delete it with the key
      const y0 = b.y + (await page.evaluate(`(() => { const n = document.querySelector("[data-tools] [data-drawing='${line.id}']"); return n ? +n.getAttribute("y1") : 0; })()`));
      await page.mouse.click(b.x + b.w * 0.35, y0);
      await page.waitForTimeout(300);
      const menu = await page.evaluate(`(document.querySelector("[data-draw-menu]") || {}).innerText || ""`);
      check(/Price target here/.test(menu) && /Delete/.test(menu), "a press on a drawing selects it and opens its menu", JSON.stringify(menu));
      await page.mouse.move(b.x + b.w * 0.35, y0);
      await page.mouse.down();
      await page.mouse.move(b.x + b.w * 0.37, y0 + 60, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      st = await stored(page);
      const moved = st.BTC.find((d) => d.id === line.id);
      check(moved.a.p < line.a.p, "a drag moves it — lower on the chart is a lower price", `${line.a.p} → ${moved.a.p}`);

      // "Price target here": the targets drawer, with the line's price in its form
      await page.click("[data-draw-target]");
      await page.waitForTimeout(900);
      const form = await page.evaluate(`[...document.querySelectorAll("[data-alerts-card] input")].map((n) => Number(n.value)).filter((v) => v > 1000)`);
      check(form.some((v) => Math.abs(v - moved.a.p) / moved.a.p < 0.001), "a line's menu sets a price target at its price, in the targets drawer", JSON.stringify({ form, price: moved.a.p }));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);

      // A note: one press, then type
      await pickTool(page, "note");
      await page.mouse.click(...at(0.45, 0.15));
      await page.waitForTimeout(300);
      await page.keyboard.type("look here");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      st = await stored(page);
      check(st.BTC.some((d) => d.kind === "note" && d.note === "look here"), "a note takes its words where it was put", JSON.stringify(st.BTC.map((d) => d.kind)));

      // Delete takes the selected one away
      const note = st.BTC.find((d) => d.kind === "note");
      await page.click(`[data-chart-settings-open], body`).catch(() => {});
      await page.keyboard.press("v");
      await page.waitForTimeout(700);
      const rows = await page.evaluate(`[...document.querySelectorAll("[data-drawing-row]")].map((r) => ({ id: r.getAttribute("data-drawing-row"), text: r.innerText, buttons: [...r.querySelectorAll("button")].every((b) => b.getAttribute("type") === "button") }))`);
      check(rows.length === 3 && rows.every((r) => r.buttons), "the chart's drawer lists every drawing, each row made of real buttons", JSON.stringify(rows.map((r) => r.text)));
      await page.click(`[data-drawing-row='${note.id}'] button`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      await page.evaluate(`document.activeElement && document.activeElement.blur()`);
      await page.keyboard.press("Delete");
      await page.waitForTimeout(300);
      st = await stored(page);
      check(!st.BTC.some((d) => d.id === note.id) && st.BTC.length === 2, "Delete takes the selected drawing away", JSON.stringify(st.BTC.map((d) => d.kind)));

      // Anchored in time: on the week the same trend spans a seventh of the width
      await page.keyboard.press("3");
      await page.waitForTimeout(1500);
      const weekShapes = await shapes(page);
      const t1w = weekShapes[trend.id] && weekShapes[trend.id][0];
      const ratio = t1d && t1w ? (t1w.x2 - t1w.x1) / (t1d.x2 - t1d.x1) : null;
      check(ratio != null && Math.abs(ratio - 1 / 7) < 0.03, "a drawing is anchored in time: on 1W the day's trend line is a seventh as wide", String(ratio && ratio.toFixed(3)));

      // Kept across a reload
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(1200);
      const again = await shapes(page);
      check(Object.keys(again).length === 2, "…and they are there after a reload", JSON.stringify(Object.keys(again)));
      check(errors.length === 0, "nothing threw", errors.join(" | "));
      await ctx.close();
    }

    // Another currency shows none of them; with calls on the tools stand down
    {
      const seed = JSON.stringify({ BTC: [{ id: "d-a", kind: "hline", currency: "USD", a: { t: NOW_MS - 3600e3, p: 43000 }, at: 1 }] });
      const { ctx, page, errors } = await openTools(`localStorage.setItem("crypto_chart_drawings", ${JSON.stringify(seed)}); localStorage.setItem("crypto_chart_currency", "EUR");`);
      check(Object.keys(await shapes(page)).length === 0, "a dollar line is not drawn on a euro chart");
      await ctx.close();
      /* The chart's settings can take the + away — and only the +: a drawing
         stays drawn. */
      const hidden = await openTools(`localStorage.setItem("crypto_chart_drawings", ${JSON.stringify(seed)});`);
      check((await hidden.page.$$("[data-chart-tools]")).length === 1, "the tools' + is there by default");
      await hidden.page.keyboard.press("v");
      await hidden.page.waitForTimeout(700);
      await hidden.page.click("[data-chart-settings] [data-chart-tools-setting]");
      await hidden.page.waitForTimeout(400);
      const noTools = await hidden.page.evaluate(`({ plus: document.querySelectorAll("[data-chart-tools]").length, drawn: [...document.querySelectorAll("[data-tools] [data-drawing]")].filter((n) => n.getAttribute("visibility") !== "hidden").length, stored: localStorage.getItem("crypto_chart_tools") })`);
      check(noTools.plus === 0 && noTools.drawn >= 1 && noTools.stored === "false", "the chart's settings take the + away, keep the choice, and leave the drawings drawn", JSON.stringify(noTools));
      await hidden.ctx.close();
      const board = await openTools(`localStorage.setItem("crypto_chart_drawings", ${JSON.stringify(seed)}); localStorage.setItem("crypto_chart_predict", "true");`);
      const off = await board.page.evaluate(`({ strip: document.querySelectorAll("[data-chart-tools]").length, drawn: [...document.querySelectorAll("[data-tools] [data-drawing]")].filter((n) => n.getAttribute("visibility") !== "hidden").length })`);
      check(off.strip === 0 && off.drawn === 0, "with calls on the tools and the drawings stand down — the board has its own price window", JSON.stringify(off));
      check(errors.length === 0 && board.errors.length === 0, "…nothing threw", errors.concat(board.errors).join(" | "));
      await board.ctx.close();
    }
  }

  /* §76 — the chart's counted studies (29 Sep 2026, the chart plan's Phase
   * 4): six chips in the chart's drawer, all off by default; each study draws
   * what it counts and nothing else — volume by price, where the price sits,
   * unusual volume, regimes, the usual range in a strip of future, where
   * price has turned with the base beside every count — their words never on
   * each other, and none of it under the board. The comparison's ratio: this
   * coin priced in the other, on its own axis. Real clicks on real chips. */
  {
    const NOW_MS = Date.now();
    const DAY = 86400e3;
    /* Bounces off 80,000 every 60 days, sharply enough that the day before a
       bottom closes more than 1% above it (a touch comes from somewhere) and
       each bottom's low is its own (a strict swing point) — levels and
       regimes both. */
    const dailyAt = (t) => { const d = Math.floor(t / DAY); const phase = (d % 60) / 60; return 80000 + 30000 * Math.abs(Math.sin(Math.PI * phase)); };
    const dipAt = (t) => { const d = Math.floor(t / DAY); return d % 60 === 0 ? 5 + 30 * (Math.floor(d / 60) % 3) : 2; };
    const priceAt = (t) => dailyAt(t) + Math.sin(t / 3.6e6) * 120;
    const spanOf = { hour: 3600e3, day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY, all: 3650 * DAY };
    const seriesFor = (period, coin) => Array.from({ length: 300 }, (_, i) => {
      const span = spanOf[period] || DAY;
      const t = NOW_MS - span + (span * i) / 299;
      return { price: (coin === "ETH" ? priceAt(t) / 30 * (1 + 0.1 * i / 299) : priceAt(t)).toFixed(2), time: Math.floor(t / 1000) };
    });
    const openStudies = async (init) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const route = (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        const h = u.match(/prices\/([A-Z]+)-USD\/historic\?period=(\w+)/);
        if (h) return r.fulfill(json({ data: { prices: seriesFor(h[2], h[1]) } }));
        if (u.includes("/spot")) return r.fulfill(json({ data: { amount: priceAt(NOW_MS).toFixed(2), currency: "USD" } }));
        const m = u.match(/candles\?granularity=(\d+)(?:&start=([^&]+)&end=([^&]+))?/);
        if (m) {
          const g = Number(m[1]) * 1000;
          const s = m[2] ? Date.parse(decodeURIComponent(m[2])) : NOW_MS - (g === 900e3 ? DAY : 30 * DAY);
          const e = m[3] ? Math.min(Date.parse(decodeURIComponent(m[3])), NOW_MS) : NOW_MS;
          const rows = [];
          let k = 0;
          for (let t = Math.ceil(s / g) * g; t <= e; t += g, k++) {
            const o = g === DAY ? dailyAt(t) : priceAt(t);
            const c = g === DAY ? dailyAt(t + g) : priceAt(t + g);
            const low = g === DAY ? Math.min(o, c) - dipAt(t) : Math.min(o, c) * 0.999;
            rows.push([t / 1000, low, Math.max(o, c) * 1.001, o, c, 10 + (k % 7) + (k === 50 ? 900 : 0)]);
          }
          return r.fulfill(json(rows.reverse()));
        }
        return r.fulfill(json({ data: {} }));
      };
      route.answersOkx = true;
      await ctx.route("**/*", route);
      await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_page_ticker_enabled", "false"); ${init || ""}`);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(1200);
      return { ctx, page, errors };
    };
    const READ = `(() => {
      const vis = (n) => n.getAttribute("visibility") !== "hidden";
      const back = [...document.querySelectorAll("[data-studies='back'] > *")].filter(vis).map((n) => n.getAttribute("data-study"));
      const words = [...document.querySelectorAll("[data-studies='front'] text")].filter(vis);
      const boxes = words.map((n) => n.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) overlaps++;
      }
      const svg = document.querySelector("[data-axes]").ownerSVGElement;
      const frame = [...svg.querySelectorAll("[data-axis-layer='lines'] line")].find((l) => l.getAttribute("visibility") !== "hidden" && l.getAttribute("x1") === l.getAttribute("x2") && +l.getAttribute("y1") === 0);
      const path = svg.querySelector("g[data-line] path:nth-of-type(2)");
      const d = path ? path.getAttribute("d") : "";
      const xs = [...d.matchAll(/[ML](-?[\\d.]+)[, ](-?[\\d.]+)/g)].map((m) => +m[1]);
      return {
        count: (k) => back.filter((x) => x === k).length,
        back, words: words.map((n) => ({ tag: n.getAttribute("data-study"), text: n.textContent })), overlaps,
        plotW: frame ? +frame.getAttribute("x1") - 0.5 : null, lastX: xs.length ? Math.max(...xs) : null,
        where: [...document.querySelectorAll("[data-where-range]")].map((n) => n.innerText.replace(/\\s+/g, " ")),
      };
    })()`;
    const read = async (page) => {
      const r = await page.evaluate(READ.replace("count: (k) => back.filter((x) => x === k).length,", ""));
      r.count = (k) => r.back.filter((x) => x === k).length;
      return r;
    };

    {
      const { ctx, page, errors } = await openStudies("");
      await page.keyboard.press("4");
      await page.waitForTimeout(1500);
      await page.keyboard.press("v");
      await page.waitForTimeout(800);
      const chips = await page.evaluate(`[...document.querySelectorAll("[data-chart-settings] [data-study-choice]")].map((n) => ({ id: n.getAttribute("data-study-choice"), on: n.getAttribute("aria-pressed"), type: n.getAttribute("type") }))`);
      check(chips.length === 6 && chips.every((c) => c.on === "false" && c.type === "button"), "the chart's drawer carries six study chips, all off by default", JSON.stringify(chips));
      let r = await read(page);
      check(r.back.length === 0 && r.words.length === 0 && r.where.length === 0, "…and with all of them off nothing is drawn", JSON.stringify(r.back));

      // Volume by price
      await page.click("[data-chart-settings] [data-study-choice='profile']");
      await page.waitForTimeout(1500);
      r = await read(page);
      check(r.count("profile") >= 10 && r.words.some((w) => /^Volume by price · 70% between/.test(w.text)) && r.words.some((w) => /^Most traded/.test(w.text)),
        "Volume by price draws the bands, the busiest one and the 70% around it", JSON.stringify(r.words.map((w) => w.text)));
      check((await page.evaluate(`JSON.parse(localStorage.getItem("crypto_chart_studies"))`)).join() === "profile", "…and is kept");

      // The usual range makes room for itself
      const before = r.lastX;
      await page.click("[data-chart-settings] [data-study-choice='usualRange']");
      await page.waitForTimeout(1200);
      r = await read(page);
      check(r.count("usual-range") === 1 && r.lastX < r.plotW * 0.9 && before > r.plotW * 0.95,
        "Usual range gives itself a strip of future: the price line now ends short of the edge", JSON.stringify({ before, lastX: r.lastX, plotW: r.plotW }));
      const range = r.words.filter((w) => w.tag === "usual-range").map((w) => w.text);
      check(range.some((t) => /^80% of \d+ past stretches of .+ ended in here$/.test(t)) && range.some((t) => /held 92% on later data/.test(t)),
        "…and says what it counts, and what the out-of-sample test found", JSON.stringify(range));

      // Where it sits, regimes, turn levels
      for (const id of ["where", "regimes", "turnLevels"]) {
        await page.click(`[data-chart-settings] [data-study-choice='${id}']`);
        await page.waitForTimeout(600);
      }
      await page.waitForTimeout(2500);
      r = await read(page);
      check(r.where.length >= 1 && r.where.every((w) => /\d+%$/.test(w)), "Where it sits prints the price's place in each range at hand", JSON.stringify(r.where));
      check(r.count("regime") >= 1 && r.words.some((w) => w.tag === "regime" && /the 20 days to each day rose ≥5%/.test(w.text)), "Regimes shades the days by their last 20, and says so", JSON.stringify(r.back.filter((x) => x === "regime").length));
      const turns = r.words.filter((w) => w.tag === "turn-level").map((w) => w.text);
      check(turns.length >= 1 && turns.every((t) => /Turned here \d+ of \d+/.test(t)), "Turn levels label every level with its count", JSON.stringify(turns));
      check(r.words.every((w) => !/support|resistance|will |likely|signal/i.test(w.text)), "…and no study's words claim what comes next");
      check(r.overlaps === 0, "no study's words land on another's", String(r.overlaps));

      // Off again: everything goes, and the line reaches the edge again
      for (const id of ["profile", "usualRange", "where", "regimes", "turnLevels"]) {
        await page.click(`[data-chart-settings] [data-study-choice='${id}']`);
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(1200);
      r = await read(page);
      check(r.back.length === 0 && r.words.length === 0 && r.lastX > r.plotW * 0.95, "switched off, each takes all of itself away — the strip of future too", JSON.stringify({ back: r.back.length, lastX: r.lastX }));
      check(errors.length === 0, "nothing threw", errors.join(" | "));
      await ctx.close();
    }

    // Unusual volume, on the volume pane of the candle chart
    {
      const { ctx, page, errors } = await openStudies(`localStorage.setItem("crypto_chart_chart_type", "candles"); localStorage.setItem("crypto_chart_studies", JSON.stringify(["volumeEvents"]));`);
      await page.keyboard.press("2");
      await page.waitForTimeout(2500);
      const r = await read(page);
      const marks = r.words.filter((w) => w.tag === "volume-event").map((w) => w.text);
      check(marks.length >= 1 && marks.every((t) => /^\d+(\.\d)?×$/.test(t)), "Unusual volume marks the bar that stands out with its multiple, and says nothing else", JSON.stringify(marks));
      check(errors.length === 0, "…nothing threw", errors.join(" | "));
      await ctx.close();
    }

    // Under the board nothing is drawn
    {
      const { ctx, page, errors } = await openStudies(`localStorage.setItem("crypto_chart_predict", "true"); localStorage.setItem("crypto_chart_studies", JSON.stringify(["profile", "regimes", "usualRange", "turnLevels"]));`);
      await page.waitForTimeout(1500);
      const r = await read(page);
      check(r.back.length === 0 && r.words.length === 0, "with calls on the studies stand down — the board has its own price window", JSON.stringify(r.back));
      check(errors.length === 0, "…nothing threw", errors.join(" | "));
      await ctx.close();
    }

    // The ratio: this coin priced in the compared one
    {
      const { ctx, page, errors } = await openStudies("");
      await page.keyboard.press("4");
      await page.waitForTimeout(1200);
      await page.keyboard.press("c");
      await page.waitForTimeout(400);
      await page.keyboard.type("ETH");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1600);
      const ticks = () => page.evaluate(`[...document.querySelectorAll("[data-axis-tick]")].filter((n) => n.getAttribute("visibility") !== "hidden").map((n) => n.textContent)`);
      const pct = await ticks();
      await page.click("[data-compare-ratio]");
      await page.waitForTimeout(1200);
      const ratio = await ticks();
      const tag = await page.evaluate(`[...document.querySelectorAll("[data-axes] text[data-axis-last]")].filter((n) => n.getAttribute("visibility") !== "hidden").map((n) => n.textContent)`);
      check(pct.every((t) => /%$/.test(t)) && ratio.length >= 3 && ratio.every((t) => /^\d+(\.\d+)?$/.test(t)) && tag.some((t) => / ETH$/.test(t)),
        "the ratio draws this coin priced in the compared one, on its own axis", JSON.stringify({ pct: pct.slice(0, 3), ratio: ratio.slice(0, 3), tag }));
      check((await page.getAttribute("[data-compare-ratio]", "aria-pressed")) === "true", "…and its button says it is down");
      await page.click("[data-compare-ratio]");
      await page.waitForTimeout(1200);
      check((await ticks()).every((t) => /%$/.test(t)), "…and pressed again the axis reads in percent", "");
      check(errors.length === 0, "nothing threw", errors.join(" | "));
      await ctx.close();
    }
  }

  /* §77 — the board on the new frame (30 Sep 2026, the chart plan's Phase
   * 5): a callable square's readout says how ordinary its move is — how many
   * of the series' own stretches as long as the time left went as far, the
   * ruler's count — and + / − zoom the board's reach, the same keys that
   * zoom the chart in time when the board is down. */
  {
    /* The suite's series ends when the suite started; this far into the run
       that is many minutes ago, and every square it lays out has settled.
       The series here is the same one moved to end now. */
    const shift = Math.floor(Date.now() / 1000) - NOW_S;
    const fresh = PRICES.map((p) => ({ price: p.price, time: p.time + shift }));
    const { ctx, page, errors } = await newCtx(browser, `localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_predict", "true");`, fresh);
    const g = await page.evaluate(`(() => { const s = document.querySelector("[data-axes]").ownerSVGElement; const r = s.getBoundingClientRect(); const n = s.querySelector(".pt-now-line"); return { x: r.x, y: r.y, w: r.width, h: r.height, nowX: n ? +n.getAttribute("x1") : null }; })()`);
    const plotW = await page.evaluate(`${PLOT_BOX}(document.querySelector("[data-axes]").ownerSVGElement).w`);
    await page.mouse.move(g.x + g.nowX + (plotW - g.nowX) * 0.55, g.y + g.h * 0.3);
    await page.waitForTimeout(400);
    const note = await page.evaluate(`[...document.querySelectorAll("svg text")].map((t) => t.textContent).find((t) => /settles/.test(t)) || ""`);
    check(/as far in as long: \d+ of \d+/.test(note), "a callable square says how often a move that far came in that long", JSON.stringify(note));
    const zoom = () => page.evaluate(`localStorage.getItem("crypto_chart_board_zoom_hour")`);
    const z0 = await zoom();
    await page.mouse.move(g.x + 20, g.y - 60);
    await page.keyboard.press("-");
    await page.waitForTimeout(600);
    const z1 = await zoom();
    await page.keyboard.press("+");
    await page.waitForTimeout(600);
    const z2 = await zoom();
    check(z1 !== z0 && z2 === (z0 === null ? z2 : z0) && Number(z1) > Number(z2 || 1), "− zooms the board out and + brings it back", JSON.stringify({ z0, z1, z2 }));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();

    /* The grid follows the window in time: zoomed in, its step is finer, and
       every label on the price scale still sits on one of its lines. */
    const series = Array.from({ length: 300 }, (_, i) => ({ price: (43000 + Math.sin(i / 11) * 900 + i * 3).toFixed(2), time: NOW_S - 86400 + i * 288 }));
    const gc = await newCtx(browser, `localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_grid", "true"); localStorage.setItem("crypto_chart_page_ticker_enabled", "false");`, series);
    const GRID = `(() => {
      const mesh = [...document.querySelectorAll(".pt-mesh line")].filter((l) => l.getAttribute("visibility") !== "hidden" && l.getAttribute("y1") === l.getAttribute("y2")).map((l) => +l.getAttribute("y1"));
      const ticks = [...document.querySelectorAll("[data-axis-tick]")].filter((n) => n.getAttribute("visibility") !== "hidden").map((n) => ({ y: +n.getAttribute("y") - 3.5, v: Number(n.textContent.replace(/[^0-9.]/g, "")) * (/K/.test(n.textContent) ? 1000 : 1) }));
      const vs = ticks.map((t) => t.v).sort((a, b) => a - b);
      return { onMesh: ticks.every((t) => mesh.some((y) => Math.abs(y - t.y) <= 1)), n: ticks.length, step: vs.length > 1 ? vs[1] - vs[0] : null };
    })()`;
    const whole = await gc.page.evaluate(GRID);
    const gb = await gc.page.evaluate(`${PLOT_BOX}(document.querySelector("[data-axes]").ownerSVGElement)`);
    const r = await gc.page.evaluate(`(() => { const r = document.querySelector("[data-axes]").ownerSVGElement.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
    await gc.page.mouse.move(r.x + gb.w * 0.5, r.y + gb.h * 0.5);
    for (let i = 0; i < 10; i++) {
      await gc.page.mouse.wheel(0, -120);
      await gc.page.waitForTimeout(25);
    }
    await gc.page.waitForTimeout(1200);
    const zoomed = await gc.page.evaluate(GRID);
    check(whole.onMesh && zoomed.onMesh && zoomed.n >= 3 && zoomed.step < whole.step,
      "the grid follows the window in time: a finer step zoomed in, and every price label on a gridline", JSON.stringify({ whole, zoomed }));
    check(gc.errors.length === 0, "…nothing threw", gc.errors.join(" | "));
    await gc.ctx.close();
  }

  /* §78 — the news room, redesigned (30 Sep 2026, "news kısmının dizayn
   * kısmını bir yeniden gözden geçirelim … en iyi şekline getir"). The
   * controls are trays — one line at 1440, the wording and the order wrapping
   * together below that, two selects on a phone — and no label breaks inside
   * its button. From 1100px the sources are switches in the column beside the
   * feed and the chips over the list stand down; below it the chips are the
   * only switches. A row is one left edge: the newsroom first on screen, the
   * age first in the link's text. A day's heading says how many stories the
   * day holds and stays on screen while its day scrolls. */
  {
    const now = Date.now();
    const items = [
      ["CNBC", 18, "Bitcoin climbs above $86,000 as ETF inflows hit a three-week high"],
      ["CryptoPotato", 34, "Ethereum gas fees hit a five-year low as layer-2 activity surges"],
      ["Bitcoin.com", 52, "Tether mints another $1 billion USDT on Tron"],
      ["CNBC", 70, "Coinbase shares fall after quarterly trading volume disappoints"],
      ["MarketWatch", 95, "Gold and bitcoin both climb as the dollar weakens against the yen"],
    ].map(([source, ago, title], i) => ({ source, title, summary: "A sentence the feed sent with it.", time: now - ago * 60000, url: `https://example.com/r${i}` }));
    const open = async (width, height) => {
      const ctx = await browser.newContext({ viewport: { width, height } });
      await ctx.route("**/*", (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
        if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
        return r.fulfill(json({ data: {} }));
      });
      await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_news_ask_seen", "true"); localStorage.setItem("crypto_chart_news_cache", ${JSON.stringify(JSON.stringify({ t: Date.now(), items }))});`);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("svg path", { timeout: 20000 });
      await page.waitForTimeout(800);
      await page.keyboard.press("n");
      await page.waitForTimeout(1200);
      return { ctx, page, errors };
    };
    const TRAYS = `(() => {
      /* Drawn at all: a chip inside a display:none row keeps its own
         computed display, so the box is what answers, not the style. */
      const shown = (n) => Boolean(n && n.getClientRects().length);
      const trays = {};
      for (const t of document.querySelectorAll("[data-news-tray]")) {
        const r = t.getBoundingClientRect();
        trays[t.getAttribute("data-news-tray")] = { shown: shown(t), top: Math.round(r.top), tall: Math.max(...[...t.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().height))) };
      }
      const chips = [...document.querySelectorAll("[data-news-chip]")].filter(shown).length;
      const aside = shown(document.querySelector("[data-news-aside]"));
      const selects = shown(document.querySelector("[data-news-selects]"));
      return { trays, chips, aside, selects };
    })()`;

    {
      const { ctx, page, errors } = await open(1440, 900);
      const wide = await page.evaluate(TRAYS);
      const t = wide.trays;
      check(t.scope && t.saved && t.tone && t.order && [t.saved, t.tone, t.order].every((x) => x.shown && x.top === t.scope.top),
        "at 1440 the news controls are one line of trays", JSON.stringify(t));
      check(Object.values(t).every((x) => x.tall <= 30), "…and no label breaks inside its button", JSON.stringify(t));
      check(wide.chips === 0 && wide.aside && !wide.selects, "…the sources live in the column, not as chips over the list", JSON.stringify(wide));
      const rows = () => page.evaluate(`[...document.querySelectorAll('[role="dialog"][aria-label="News"] a[target=_blank]')].map((a) => a.textContent)`);
      const before = await rows();
      await page.click("[data-news-source='cnbc']");
      await page.waitForTimeout(300);
      const after = await rows();
      const pressed = await page.getAttribute("[data-news-source='cnbc']", "aria-pressed");
      check(before.length === 5 && after.length === 3 && pressed === "false",
        "a source's line in the column is its switch", JSON.stringify({ before: before.length, after: after.length, pressed }));
      await page.click("[data-news-source='cnbc']");
      await page.waitForTimeout(300);
      const row = await page.evaluate(`(() => {
        const a = document.querySelector('[role="dialog"][aria-label="News"] a[target=_blank]');
        const [age, source] = [a.querySelector("span span"), a.querySelector("span span + span")].map((n) => n.getBoundingClientRect().left);
        const title = a.querySelector(".pt-news-title").getBoundingClientRect();
        return { text: a.textContent.slice(0, 12), sourceFirst: source < age, oneEdge: Math.abs(title.left - Math.min(age, source)) < 2 };
      })()`);
      check(/^18m/.test(row.text) && row.sourceFirst && row.oneEdge,
        "a row reads newsroom · age over the headline, on one left edge, with the age first in its text", JSON.stringify(row));
      const day = await page.evaluate(`(() => { const d = document.querySelector("[data-news-day]"); return { text: d.parentElement.textContent, sticky: getComputedStyle(d.parentElement).position }; })()`);
      check(/\d+ stor(y|ies)/.test(day.text) && day.sticky === "sticky", "a day's heading counts its stories and stays while its day scrolls", JSON.stringify(day));
      const mark = await page.evaluate(`(() => { const b = document.querySelector("[data-news-save]"); return +getComputedStyle(b).opacity; })()`);
      const box = await page.evaluate(`(() => { const r = document.querySelector('[role="dialog"][aria-label="News"] a[target=_blank]').getBoundingClientRect(); return [r.x + 60, r.y + r.height / 2]; })()`);
      await page.mouse.move(box[0], box[1]);
      await page.waitForTimeout(250);
      const lit = await page.evaluate(`+getComputedStyle(document.querySelector("[data-news-save]")).opacity`);
      check(mark < 0.6 && lit === 1, "a bookmark rests faint and comes up with its row", JSON.stringify({ mark, lit }));
      check(errors.length === 0, "nothing threw", errors.join(" | "));
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await open(1100, 800);
      const mid = await page.evaluate(TRAYS);
      const t = mid.trays;
      check(t.tone.top === t.order.top && t.tone.top > t.scope.top && Object.values(t).every((x) => x.tall <= 30),
        "at 1100 the wording and the order wrap together, whole", JSON.stringify(t));
      check(errors.length === 0, "nothing threw", errors.join(" | "));
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await open(1000, 800);
      const narrow = await page.evaluate(TRAYS);
      check(narrow.chips >= 4 && !narrow.aside, "under 1100 the chips are the sources' switches again", JSON.stringify(narrow));
      await ctx.close();
      const phone = await open(420, 860);
      const small = await phone.page.evaluate(TRAYS);
      check(small.selects && !small.trays.tone.shown && !small.trays.order.shown && small.trays.scope.top === small.trays.saved.top,
        "on a phone the wording and the order are two selects, and scope and Saved share a line", JSON.stringify(small));
      await phone.page.selectOption("[data-news-selects] select", "down");
      await phone.page.waitForTimeout(300);
      const n = await phone.page.evaluate(`document.querySelectorAll('[role="dialog"][aria-label="News"] a[target=_blank]').length`);
      check(n > 0 && n < 5, "…and the wording select narrows the list", String(n));
      check(errors.length === 0 && phone.errors.length === 0, "nothing threw", errors.concat(phone.errors).join(" | "));
      await phone.ctx.close();
    }
  }
  /* §78b — the feed's own faults (30 Sep 2026, "arka yapılarını ve bugları
   * ve optimizasyonları da ayarla"). A newsroom granted while a fetch was in
   * flight did not arrive until the next poll: the fetch landed, wrote a fresh
   * cache, and the re-run meant for the grant found it fresh and asked
   * nothing. A poll landing just under the refresh period found the cache
   * fresh the same way and skipped a whole period. And a cache the tab
   * already shows is not handed over again. Driven through the app itself,
   * with one source slow enough to be caught in flight. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    let cnbc = 0;
    const rss = "<rss><channel><item><title>Bitcoin holds its range as volumes thin</title><link>https://www.cnbc.com/x</link><pubDate>" + new Date(Date.now() - 600000).toUTCString() + "</pubDate></item></channel></rss>";
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      if (u.includes("search.cnbc.com")) {
        cnbc += 1;
        return setTimeout(() => r.fulfill({ status: 200, contentType: "application/xml", headers: { "access-control-allow-origin": "*" }, body: rss }), 1200);
      }
      return r.fulfill(json({ data: {} }));
    });
    const seed = { t: Date.now(), items: [{ source: "CNBC", title: "A story already in the cache", time: Date.now() - 3600000, url: "https://example.com/c" }] };
    await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_news_ask_seen", "true"); localStorage.setItem("crypto_chart_news_cache", ${JSON.stringify(JSON.stringify(seed))});`);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.keyboard.press("n");
    await page.waitForTimeout(800);
    const APP = `(() => {
      const host = document.querySelector("[data-news-controls]");
      const key = Object.keys(host).find((k) => k.startsWith("__reactInternalInstance") || k.startsWith("__reactFiber"));
      let f = key ? host[key] : null;
      while (f) {
        if (f.stateNode && f.stateNode.state && "newsItems" in f.stateNode.state) return f.stateNode;
        f = f.return;
      }
      return null;
    })()`;
    check(cnbc === 0, "a fresh cache answers the panel's open without a request", String(cnbc));
    const same = await page.evaluate(`(() => { const app = ${APP}; const before = app.state.newsItems; app.fetchNewsData(); return new Promise((ok) => setTimeout(() => ok(app.state.newsItems === before), 100)); })()`);
    check(same, "…and asked again, a cache the tab already shows is not handed over as a new list");
    await page.evaluate(`(() => { const app = ${APP}; app.fetchNewsData({ force: true }); setTimeout(() => app.refreshNewsSources(), 200); })()`);
    await page.waitForTimeout(3600);
    check(cnbc === 2, "a source granted while a fetch is in flight is asked again when it lands, not at the next poll", String(cnbc));
    await page.evaluate(`localStorage.setItem("crypto_chart_news_cache", JSON.stringify({ t: Date.now() - 0.6 * ${600000}, items: JSON.parse(localStorage.getItem("crypto_chart_news_cache")).items }))`);
    await page.evaluate(`${APP}.fetchNewsData({ poll: true })`);
    await page.waitForTimeout(2000);
    check(cnbc === 3, "a poll refreshes a cache past half the period — it used to wait a whole one more", String(cnbc));
    await page.evaluate(`${APP}.fetchNewsData()`);
    await page.waitForTimeout(600);
    check(cnbc === 3, "…while an ordinary ask still takes the cache it just wrote", String(cnbc));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }
  /* §79 — the chart plan's Phase 6: reading it without a pointer, motion,
   * colour (30 Sep 2026, "aşama 6 ile devam et"). Focused, the chart reads
   * point by point: ← and → move a cursor whose words go to a live region,
   * Home and End reach its ends, a step past a zoomed window's edge moves the
   * window and reads on, Esc puts the cursor away; the chart carries a
   * one-sentence summary as its description and a visible focus ring. With
   * reduced motion nothing runs at rest and a range switch lands at once.
   * The blue/orange palette paints up and down and survives a reload. */
  {
    const open = async (opts, init) => {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opts));
      await ctx.route("**/*", (r) => {
        const u = r.request().url();
        if (u.startsWith("file://")) return r.continue();
        if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
        if (u.includes("spot")) return r.fulfill(json({ data: { amount: PRICES[PRICES.length - 1].price, currency: "USD" } }));
        return r.fulfill(json(u.includes("candles") ? [] : { data: {} }));
      });
      await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1"); ${init || ""}`);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(INDEX, { waitUntil: "load" });
      await page.waitForSelector("[data-axes]", { timeout: 20000 });
      await page.waitForTimeout(1500);
      return { ctx, page, errors };
    };
    const READ = `(() => ({
      said: document.querySelector("[data-chart-reading]").textContent,
      window: document.querySelector("[data-chart-viewport]").getAttribute("data-chart-window"),
      readout: document.querySelector("[data-axes]").ownerSVGElement.querySelector("text[data-axis-pill], [data-axis-pill]") !== null,
    }))()`;

    {
      const { ctx, page, errors } = await open({});
      const summary = await page.evaluate(`(() => { const v = document.querySelector("[data-chart-viewport]"); const id = v.getAttribute("aria-describedby"); const s = id && document.getElementById(id); return { said: s ? s.textContent : "", label: v.getAttribute("aria-label") }; })()`);
      check(/^BTC in USD, .+: from \$[\d,.]+ to \$[\d,.]+, (up|down) [\d.]+%\. Highest \$[\d,.]+ at .+, lowest \$[\d,.]+ at .+\.$/.test(summary.said),
        "the chart describes itself in one sentence: coin, stretch, from, to, how much, highest, lowest", JSON.stringify(summary.said));
      check(/point by point/.test(summary.label), "…and its label says how to read it from the keyboard", JSON.stringify(summary.label));
      await page.evaluate(`document.querySelectorAll("[data-tour='period'] button")[5].focus()`);
      await page.keyboard.press("Tab");
      const ring = await page.evaluate(`(() => { const el = document.activeElement; const cs = getComputedStyle(el); return { onChart: el.hasAttribute("data-chart-viewport"), style: cs.outlineStyle, width: cs.outlineWidth }; })()`);
      check(ring.onChart && ring.style === "solid" && parseFloat(ring.width) >= 2,
        "Tab from the ranges reaches the chart, which shows a 2px ring", JSON.stringify(ring));
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(100);
      const first = await page.evaluate(READ);
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(100);
      const second = await page.evaluate(READ);
      check(/ — \$[\d,.]+$/.test(first.said) && second.said !== first.said && / — \$[\d,.]+$/.test(second.said),
        "← reads the latest point, then the one before, each said with its time and price", JSON.stringify([first.said, second.said]));
      const hover = await page.evaluate(`(() => { const g = [...document.querySelectorAll("svg g")].find((n) => n.getAttribute("visibility") === "visible"); return Boolean(g); })()`);
      check(hover, "…with the crosshair drawn where a pointer would have put it");
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(100);
      const edge = await page.evaluate(READ);
      check(edge.said === "The first point on the chart" && edge.window === null,
        "Home reaches the first point, and a step past it on the whole range says so and moves nothing", JSON.stringify(edge));
      await page.keyboard.press("End");
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(100);
      check((await page.evaluate(READ)).said === "The latest point", "…End and a step past the latest say so too");
      await page.keyboard.press("+");
      await page.waitForTimeout(250);
      await page.keyboard.press("+");
      await page.waitForTimeout(400);
      await page.keyboard.press("Home");
      await page.waitForTimeout(100);
      const before = await page.evaluate(READ);
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(700);
      const followed = await page.evaluate(READ);
      check(before.window && followed.window && followed.window !== before.window && / — \$/.test(followed.said) && followed.said !== before.said,
        "zoomed, a step past the window's first point moves the window and reads the point before", JSON.stringify({ before, followed }));
      await page.keyboard.press("Shift+ArrowRight");
      await page.waitForTimeout(700);
      const panned = await page.evaluate(READ);
      check(panned.window !== followed.window, "Shift with an arrow moves the window through time", JSON.stringify(panned));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      const away = await page.evaluate(`(() => ({ said: document.querySelector("[data-chart-reading]").textContent, focused: document.activeElement.hasAttribute("data-chart-viewport"), coin: document.querySelector("[data-tour='period']") !== null }))()`);
      check(away.said === "" && away.focused, "Esc puts the cursor away and leaves the focus on the chart", JSON.stringify(away));
      check(errors.length === 0, "nothing threw", errors.join(" | "));
      await ctx.close();
    }

    {
      const { ctx, page, errors } = await open({ reducedMotion: "reduce" });
      const motion = await page.evaluate(`(async () => {
        const idle = document.getAnimations().filter((a) => a.playState === "running").length;
        document.querySelectorAll("[data-tour='period'] button")[1].click();
        const t0 = performance.now();
        let frames = 0, last = null;
        await new Promise((ok) => { const tick = () => { const p = document.querySelector("[data-axes]").ownerSVGElement.querySelector("path"); const d = p && p.getAttribute("d"); if (d !== last) { frames++; last = d; } if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else ok(); }; requestAnimationFrame(tick); });
        const easing = [...document.querySelectorAll("*")].filter((n) => getComputedStyle(n).transitionDuration.split(",").some((v) => parseFloat(v) > 0.02)).length;
        return { idle, frames, easing };
      })()`);
      check(motion.idle === 0 && motion.frames <= 3 && motion.easing === 0,
        "with reduced motion nothing runs at rest, a range switch lands in a frame or two, and nothing eases", JSON.stringify(motion));
      check(errors.length === 0, "nothing threw", errors.join(" | "));
      await ctx.close();
    }

    {
      const { ctx, page, errors } = await open({ colorScheme: "light" }, `localStorage.setItem("crypto_chart_direction_palette", "cvd");`);
      const ink = () => page.evaluate(`document.querySelector("rect[data-axis-last]").getAttribute("fill")`);
      const cvd = await ink();
      check(["#0068a8", "#b04a00"].includes(cvd), "the blue/orange palette paints the chart's direction", cvd);
      await page.keyboard.press("s");
      await page.waitForTimeout(700);
      await page.click('input[placeholder="Search settings…"]');
      await page.keyboard.type("colour");
      await page.waitForTimeout(400);
      check((await page.getAttribute("[data-direction-choice='cvd']", "aria-pressed")) === "true", "…Settings says which palette is on");
      await page.click("[data-direction-choice='classic']");
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      const classic = await ink();
      const stored = await page.evaluate(`localStorage.getItem("crypto_chart_direction_palette")`);
      check(["#0a7d4f", "#c81e1e"].includes(classic) && stored === "classic", "…and green / red puts it back, and is kept", JSON.stringify({ classic, stored }));
      /* A theme change repaints what the chart draws itself — the tag kept
         the old theme's green after D until the next price landed. */
      await page.keyboard.press("d");
      await page.waitForTimeout(600);
      const dark = await ink();
      check(["#34d399", "#f87171"].includes(dark), "D repaints the chart's own drawing in the other theme's inks at once", dark);
      check(errors.length === 0, "nothing threw", errors.join(" | "));
      await ctx.close();
    }
  }
  /* §80 — the work Phases 1 and 2 left (30 Sep 2026, "ertelenen işlerle
   * devam et"): the readout's head says the move since the first point
   * where the pills already print the time; the window has a navigator at
   * the range row's left end, dragged to move it; zooming out past the whole
   * range moves to the next range, framed on the old one's span; and two
   * fingers pinch. */
  {
    const NOW80 = Date.now();
    const spans = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3, year: 365 * 86400e3, all: 3650 * 86400e3 };
    const mk = (span) => Array.from({ length: 300 }, (_, i) => { const t = NOW80 - span + (span * i) / 299; return { price: (43000 + Math.sin(t / 3e6) * 400 + i).toFixed(2), time: Math.floor(t / 1000) }; });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: mk(spans[(u.match(/period=(\w+)/) || [])[1]] || spans.day) } }));
      if (u.includes("spot")) return r.fulfill(json({ data: { amount: "43300.00", currency: "USD" } }));
      return r.fulfill(json(u.includes("candles") ? [] : { data: {} }));
    });
    await ctx.addInitScript(`localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_page_ticker_enabled", "false");`);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("[data-axes]", { timeout: 20000 });
    await page.waitForTimeout(1500);
    const box = await page.evaluate(`(() => { const r = document.querySelector("[data-axes]").ownerSVGElement.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    const win = () => page.evaluate(`(() => { const w = document.querySelector("[data-chart-viewport]").getAttribute("data-chart-window"); return w ? w.split("-").map(Number) : null; })()`);
    const period = () => page.evaluate(`[...document.querySelectorAll("[data-tour='period'] button")].find((b) => b.querySelector("span") && Number(getComputedStyle(b.querySelector("span")).fontWeight) >= 500).textContent`);

    // The readout's head
    await page.mouse.move(box.x + box.w * 0.6, box.y + box.h * 0.5);
    await page.waitForTimeout(250);
    const head = await page.evaluate(`[...document.querySelectorAll("svg text")].map((t) => t.textContent).find((t) => / since /.test(t)) || ""`);
    check(/^[+−-]?\d+\.\d\d% since /.test(head), "the readout's head is the move since the first point — the time is on the axis", JSON.stringify(head));

    // Zoom out past the whole 1H: the next range, framed on an hour
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(30); }
    await page.waitForTimeout(1500);
    const past = { period: await period(), win: await win() };
    /* The notches after the switch go on widening it inside 1D — the zoom
       carries on from the hour just left, it does not restart. */
    check(past.period === "1D" && past.win && past.win[1] - past.win[0] >= 3500e3 && past.win[1] - past.win[0] < 3 * 3600e3,
      "wheeling out past the whole 1H opens 1D on a window about the hour just left", JSON.stringify(past));

    // The navigator, at the range row's left end
    const nav = await page.evaluate(`(() => { const s = document.querySelector("[data-chart-nav-strip]"); const r = document.querySelector("[data-chart-nav-window]"); const ranges = document.querySelector("[data-tour='period'] button").getBoundingClientRect(); if (!s || !r) return null; const a = s.getBoundingClientRect(), b = r.getBoundingClientRect(); return { left: a.right < ranges.left, level: a.top < ranges.bottom && a.bottom > ranges.top, x: b.x + b.width / 2, y: b.y + b.height / 2, sx: a.x, sw: a.width, chip: document.querySelector("[data-chart-view-chip]").innerText }; })()`);
    check(nav && nav.left && nav.level && /^Zoomed/.test(nav.chip), "zoomed, the navigator sits at the range row's left end, level with the ranges", JSON.stringify(nav));
    await page.mouse.move(nav.x, nav.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(nav.x - i * 8, nav.y);
    await page.mouse.up();
    await page.waitForTimeout(800);
    const moved = await win();
    check(moved && moved[1] < past.win[1] - 3600e3 && Math.abs(moved[1] - moved[0] - (past.win[1] - past.win[0])) < 120e3,
      "dragging the navigator's box walks the window back, the same width", JSON.stringify({ before: past.win, after: moved }));

    // Two fingers
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
    const cx = box.x + box.w * 0.5, cy = box.y + box.h * 0.5;
    const before = await win();
    await touch("touchStart", [[cx - 150, cy]]);
    await touch("touchStart", [[cx - 150, cy], [cx + 150, cy]]);
    for (let i = 1; i <= 8; i++) { await touch("touchMove", [[cx - 150 + i * 12, cy], [cx + 150 - i * 12, cy]]); await page.waitForTimeout(16); }
    await touch("touchEnd", []);
    await page.waitForTimeout(800);
    const pinched = await win();
    check(before && pinched && (pinched[1] - pinched[0]) > (before[1] - before[0]) * 2,
      "two fingers pinched together widen the window", JSON.stringify({ before, pinched }));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
    await ctx.close();
  }
  /* §81 — the plot's labels share one lane (30 Sep 2026, left from Phase 1).
   * Three targets a hair apart, a drawn line between them and the average's
   * label were each kept clear of their own kind and printed over each
   * other. With `edgeMark` / `layoutEdge` (chart-axes.js) no two labels in
   * the plot overlap, and the most urgent — a target — stays nearest its
   * own line. */
  {
    const last = Number(PRICES[PRICES.length - 1].price);
    const alerts = [
      { id: "l1", coin: "BTC", kind: "price", direction: "above", target: Math.round(last * 1.0003), currency: "USD", created: Date.now() },
      { id: "l2", coin: "BTC", kind: "price", direction: "above", target: Math.round(last * 1.0006), currency: "USD", created: Date.now() },
      { id: "l3", coin: "BTC", kind: "price", direction: "below", target: Math.round(last * 0.9997), currency: "USD", created: Date.now() },
    ];
    const drawings = { BTC: [{ id: "d-l", kind: "hline", currency: "USD", a: { t: Date.now() - 600000, p: Math.round(last * 1.00045) }, at: 1 }] };
    const { ctx, page, errors } = await newCtx(browser, `localStorage.setItem("crypto_chart_onboarding_seen", "1"); localStorage.setItem("crypto_chart_average", "true"); localStorage.setItem("crypto_chart_alerts", ${JSON.stringify(JSON.stringify(alerts))}); localStorage.setItem("crypto_chart_drawings", ${JSON.stringify(JSON.stringify(drawings))});`);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(500);
    const lane = await page.evaluate(`(() => {
      const svg = document.querySelector("[data-axes]").ownerSVGElement;
      const shown = (n) => { for (let m = n; m && m !== svg; m = m.parentNode) { if (m.getAttribute && (m.getAttribute("visibility") === "hidden" || m.getAttribute("opacity") === "0")) return false; } return Number(getComputedStyle(n).opacity) > 0.05; };
      const boxes = [...svg.querySelectorAll("text")].filter((t) => t.textContent.trim() && !t.closest("[data-axes]") && shown(t)).map((t) => ({ t: t.textContent.trim(), b: t.getBoundingClientRect() }));
      const over = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].b, c = boxes[j].b;
        if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) over.push(boxes[i].t + " × " + boxes[j].t);
      }
      return { targets: boxes.filter((x) => /^target/.test(x.t)).length, over };
    })()`);
    check(lane.targets === 3 && lane.over.length === 0, "three targets, a drawn line and the average's label share the plot's lane — none printed over another", JSON.stringify(lane));
    check(errors.length === 0, "nothing threw", errors.join(" | "));
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
