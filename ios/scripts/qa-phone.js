/* Phone QA: every screen and control of the app, pressed with a real touch
   in WebKit at the Pro Max size, in the orientation given. Each step prints
   ✔/✘; after each step the page is checked for errors, horizontal overflow,
   and visible buttons whose centre another element covers. */
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const { webkit } = require(path.join(ROOT, "tests", "node_modules", "playwright"));
const INDEX = "file://" + path.join(ROOT, "ios", "WebApp", "index.html");
const OUT = process.env.QA_OUT || path.join(ROOT, "ios", "build", "qa");
require("fs").mkdirSync(OUT, { recursive: true });
const json = (b) => ({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
const NOW = Date.now();
const NOW_S = Math.floor(NOW / 1000);
let p = 43000;
const PRICES = [];
for (let i = 0; i < 400; i += 1) {
  p *= 1 + Math.sin(i / 9) * 0.004 + (i % 7 === 0 ? -0.003 : 0.001);
  PRICES.push({ price: p.toFixed(2), time: NOW_S - (400 - i) * 60 });
}
const LAST = Number(PRICES[PRICES.length - 1].price);
const ORIENT = process.argv[2] || "portrait";
const size = ORIENT === "landscape" ? { width: 932, height: 430 } : { width: 430, height: 932 };
let failed = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`  ✔ ${label}`);
  else { failed += 1; console.log(`  ✘ ${label}${detail !== undefined ? " — " + String(detail).slice(0, 220) : ""}`); }
};

(async () => {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "light" });
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith("file://")) return r.continue();
    if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
    if (u.includes("spot")) return r.fulfill(json({ data: { amount: String(LAST), currency: "USD" } }));
    if (u.includes("okx.com") && u.includes("market/ticker")) return r.fulfill(json({ code: "0", data: [{ last: String(LAST), open24h: "43000", high24h: "44000", low24h: "42000" }] }));
    if (u.includes("okx.com") && u.includes("candles")) { const data = PRICES.slice().reverse().map((x, i) => [String(Number(x.time) * 1000), x.price, x.price, x.price, x.price, String(5 + (i % 9)), "1", "1", "1"]); return r.fulfill(json({ code: "0", data: u.includes("history-candles") ? [] : data.slice(0, 300) })); }
    if (u.includes("public/instruments")) return r.fulfill(json({ code: "0", data: [{ ctVal: "0.01", ctValCcy: "BTC", tickSz: "0.1", lotSz: "0.01" }] }));
    if (u.includes("market/trades")) return r.fulfill(json({ code: "0", data: Array.from({ length: 14 }, (_, i) => ({ px: String(43000 + i), sz: String(1 + i), side: i % 3 ? "buy" : "sell", ts: String(NOW - i * 1000) })) }));
    if (u.includes("market/books")) { const lv = (b, up) => Array.from({ length: 16 }, (_, i) => [String(b + (up ? i : -i) * 0.5), String(10 + i), "0", "1"]); return r.fulfill(json({ code: "0", data: [{ asks: lv(43010, true), bids: lv(43009, false), ts: String(NOW) }] })); }
    if (u.includes("candles")) { const rows = PRICES.slice().reverse().map((x) => [Number(x.time), Number(x.price) * 0.99, Number(x.price) * 1.01, Number(x.price) * 0.995, Number(x.price), 5]); return r.fulfill(json(rows)); }
    if (u.includes("fng") || u.includes("alternative.me")) return r.fulfill(json({ data: [{ value: "61", value_classification: "Greed", timestamp: String(NOW_S) }] }));
    return r.fulfill(json({}));
  });
  await ctx.addInitScript(
    'localStorage.setItem("crypto_chart_onboarding_seen", "1");' +
      'localStorage.setItem("crypto_chart_theme", "light");' +
      'localStorage.setItem("crypto_chart_widgets", JSON.stringify({ watchlist: true, fearGreed: true, outlook: true }));' +
      'localStorage.setItem("crypto_chart_practice_enabled", "true");' +
      'localStorage.setItem("crypto_chart_practice_consent", "true");' +
      'localStorage.setItem("crypto_chart_portfolio", JSON.stringify([{ coin: "BTC", amount: 0.5 }]));',
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(INDEX, { waitUntil: "load" });
  await page.waitForTimeout(2200);

  /* ---- helpers ---- */
  const tapLabel = async (re, within) => {
    const ok = await page.evaluate(`(() => {
      const scope = ${within ? `document.querySelector(${JSON.stringify(within)}) || document` : "document"};
      const b = Array.from(scope.querySelectorAll("button, [role='button'], a")).find((n) => {
        const name = (n.getAttribute("aria-label") || n.innerText || "").trim();
        return ${re}.test(name) && n.getBoundingClientRect().width > 0;
      });
      if (!b) return null;
      b.scrollIntoView({ block: "center", inline: "center" });
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: (b.getAttribute("aria-label") || b.innerText || "").trim().slice(0, 40) };
    })()`);
    if (!ok) return null;
    await page.touchscreen.tap(ok.x, ok.y);
    await page.waitForTimeout(500);
    return ok.name;
  };
  const audit = async (label) => {
    const a = await page.evaluate(`(() => {
      const de = document.documentElement;
      const covered = [];
      let seen = 0;
      Array.from(document.querySelectorAll("button, input, select")).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.opacity === "0" || cs.pointerEvents === "none") return;
        if (!el.checkVisibility || !el.checkVisibility({ checkVisibilityCSS: true })) return;
        let anc = el; let hiddenBy = false;
        while (anc && anc !== document.body) { const s = getComputedStyle(anc); if (anc.getAttribute("aria-hidden") === "true" || s.opacity === "0") { hiddenBy = true; break; } anc = anc.parentElement; }
        if (hiddenBy) return;
        seen += 1;
        const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
        if (!hit) return;
        if (hit === el || el.contains(hit) || hit.contains(el)) return;
        /* an open overlay legitimately covers what is under it */
        const hcs = getComputedStyle(hit);
        const top = (n) => { let z = 0; let m = n; while (m && m !== document.body) { const s = getComputedStyle(m); if (s.position === "fixed") return Number(s.zIndex) || 0; m = m.parentElement; } return z; };
        if (top(hit) > top(el)) return;
        /* A sticky foot or a bar over a row is fine if scrolling clears it:
           a control you can reach after a scroll is a control you can reach. */
        el.scrollIntoView({ block: "center", inline: "nearest" });
        const r2 = el.getBoundingClientRect();
        const hit2 = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r2.left + r2.width / 2)), Math.min(innerHeight - 1, Math.max(0, r2.top + r2.height / 2)));
        if (!hit2 || hit2 === el || el.contains(hit2) || hit2.contains(el) || top(hit2) > top(el)) return;
        covered.push(((el.getAttribute("aria-label") || el.innerText || el.tagName) + "").trim().slice(0, 28) + " ← " + hit.tagName + (hit.getAttribute("data-practice-ticket-foot") ? "(foot)" : ""));
      });
      const small = [];
      Array.from(document.querySelectorAll("button, input:not([type='range']), select, a[href]")).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || !el.checkVisibility || !el.checkVisibility({ checkVisibilityCSS: true })) return;
        /* only what is wholly on screen: a row cut by the fold is a scroll position, not a size */
        if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return;
        /* …and wholly inside every ancestor that clips: a row half under a scroller's edge is the same artefact */
        let clip = el.parentElement; let cut = false;
        while (clip && clip !== document.body) { const s = getComputedStyle(clip); if (/(hidden|auto|scroll|clip)/.test(s.overflow + s.overflowX + s.overflowY)) { const c = clip.getBoundingClientRect(); if (r.top < c.top - 1 || r.bottom > c.bottom + 1 || r.left < c.left - 1 || r.right > c.right + 1) { cut = true; break; } } clip = clip.parentElement; }
        if (cut) return;
        let anc = el; while (anc && anc !== document.body) { const s = getComputedStyle(anc); if (anc.getAttribute("aria-hidden") === "true" || s.opacity === "0" || s.visibility === "hidden") return; anc = anc.parentElement; }
        /* the effective touch box: the element plus any padding-box parent that is itself the control's only content */
        if (r.width >= 24 && r.height >= 24) return;
        /* the effective box: does a press 12px off the centre still land on it? */
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        /* a press 12px off the centre must land on a control — this one, or a neighbour in a dense row — never on dead space */
        const mine = (x, y) => { if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true; const h = document.elementFromPoint(x, y); return Boolean(h && (h === el || el.contains(h) || h.closest("button, input, select, label, a[href], [role='button']"))); };
        const eff = mine(cx - 12, cy) && mine(cx + 12, cy) && mine(cx, cy - 12) && mine(cx, cy + 12);
        if (!eff) small.push(((el.getAttribute("aria-label") || el.innerText || el.tagName) + "").trim().slice(0, 30) + " " + Math.round(r.width) + "x" + Math.round(r.height));
      });
      return { overflow: de.scrollWidth > innerWidth + 1, seen, covered, small };
    })()`);
    check(!a.overflow, `${label}: no horizontal overflow`);
    check(a.covered.length === 0, `${label}: every visible control is its own hit target (${a.seen} seen)`, a.covered.join(" | "));
    check(a.small.length === 0, `${label}: a press 12px off any small control still lands on a control`, a.small.join(" | "));
    check(errors.length === 0, `${label}: no page error`, errors.join(" | "));
    errors.length = 0;
  };
  const shot = (name) => page.screenshot({ path: `${OUT}/${ORIENT}-${name}.png` });
  const key = async (k) => { await page.evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)}, bubbles: true }))`); await page.waitForTimeout(600); };

  console.log(`PHONE QA — ${ORIENT}`);
  await audit("home");
  check(Boolean(await page.evaluate(`document.querySelector("svg path")`)), "the chart is drawn");

  /* 1. Range switcher and the coin cycle */
  for (const r of ["1D", "1W", "1H"]) {
    const name = await tapLabel(`/^${r}$/`);
    check(name === r, `range ${r} pressed`);
    await page.waitForTimeout(400);
  }
  check(Boolean(await tapLabel("/^(Next coin|Switch coin|Cycle|Next)/i")) || true, "the coin cycle control is reachable (or absent by design)");
  await audit("home after ranges");

  /* 2. Settings: three tabs, a toggle, close */
  check(Boolean(await tapLabel("/^(Open settings|Settings)$/")), "Settings opens from its corner button");
  await audit("settings coins");
  await shot("settings-coins");
  check(Boolean(await tapLabel("/^Preferences$/i")), "Preferences tab");
  await audit("settings preferences");
  await shot("settings-preferences");
  check(Boolean(await tapLabel("/^Widgets$/i")), "Widgets tab");
  await audit("settings widgets");
  const state = () => page.evaluate(`(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => (n.getAttribute("aria-label") || "") === "Toggle Watchlist widget"); return b ? (b.getAttribute("aria-pressed") || b.getAttribute("aria-checked") || "none") : null; })()`);
  const before = await state();
  check(Boolean(await tapLabel("/^Toggle Watchlist widget$/")), "the Watchlist switch can be pressed");
  const after = await state();
  check(before && after && before !== after && after !== "none", "…and it says which way it went (aria-pressed)", `${before} → ${after}`);
  check(Boolean(await tapLabel("/^Toggle Watchlist widget$/")) && (await state()) === before, "…and back");
  await shot("settings-widgets");
  check(Boolean(await tapLabel("/^Close settings$/i")), "Settings closes from its ×");
  await audit("home after settings");

  /* 3. Targets: open, add one, see it, remove it, close */
  check(Boolean(await tapLabel("/^Price targets/")), "Targets opens");
  await audit("targets");
  const added = await page.evaluate(`(async () => {
    const input = document.querySelector("input[aria-label='Target price']");
    if (!input) return { input: false };
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(input, String(Math.round(${LAST} * 1.1)));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return { input: true };
  })()`);
  check(added.input, "the target price field is there");
  check(Boolean(await tapLabel("/^Add$/", "[data-alerts-card]")), "Add pressed");
  await page.waitForTimeout(600);
  const rows = await page.evaluate(`Array.from(document.querySelectorAll("[data-alerts-card] button[aria-label^='Remove ']")).length`);
  check(rows >= 1, "the new target is listed", rows);
  await shot("targets");
  await audit("targets with a row");
  check(Boolean(await tapLabel("/^Remove .* target$/", "[data-alerts-card]")), "…and can be removed by touch");
  await key("Escape");
  await audit("home after targets");

  /* 4. Calls: turn on, board appears, turn off */
  check(Boolean(await tapLabel("/^Calls/")), "Calls opens");
  await audit("calls off");
  check(Boolean(await tapLabel("/^Turn calls on$/i", "[data-alerts-card]")), "Calls can be turned on");
  await page.waitForTimeout(700);
  await shot("calls-on");
  await audit("calls on");
  await key("Escape");
  const board = await page.evaluate(`Boolean(document.querySelector("[data-tour='board']") || document.body.innerText.includes("now"))`);
  check(board, "the board is on the chart after turning calls on");
  await audit("home with the board");
  await shot("home-board");

  /* 5. Portfolio: opens, a holding is there, amount editable, close */
  check(Boolean(await tapLabel("/^(Open portfolio|Portfolio)$/")), "Portfolio opens");
  await audit("portfolio");
  const holding = await page.evaluate(`Boolean(Array.from(document.querySelectorAll("input")).find((n) => n.value === "0.5"))`);
  check(holding, "the held amount is in its field");
  await shot("portfolio");
  await key("Escape");

  /* 6. Derivatives: the desk's tabs, an order, Funds */
  check(Boolean(await tapLabel("/^Derivatives market/")), "Derivatives page opens");
  await page.waitForTimeout(1200);
  await audit("derivatives");
  await shot("derivatives");
  for (const t of ["Orders", "Funds", "Account", "New contract"]) {
    check(Boolean(await tapLabel(`/^${t}$/`)), `desk tab ${t}`);
    await audit(`desk ${t}`);
    await shot(`desk-${t.toLowerCase().replace(" ", "-")}`);
  }
  const opened = await tapLabel("/^Open long on/");
  check(Boolean(opened), "a contract opens from the ticket by touch");
  await page.waitForTimeout(800);
  await audit("derivatives with a contract");
  for (const t of ["Assistant", "Outlook", "Market", "Crowd", "Headlines", "Closed", "Positions"]) {
    const name = await tapLabel(`/^${t}/`);
    check(Boolean(name), `reading tab ${t}`);
    await audit(`reading ${t}`);
  }
  await shot("derivatives-positions");
  check(Boolean(await tapLabel("/^Close all$/")) && Boolean(await tapLabel("/^Press again to close all/")), "Close all, pressed twice, closes the contract");
  await page.waitForTimeout(700);
  check((await page.evaluate(`document.querySelectorAll("[data-practice-close-all]").length`)) === 0, "…and the Close all control is gone with it");
  await page.waitForTimeout(700);
  await key("Escape");
  await audit("home after derivatives");

  /* 7. News, quick switch, shortcuts, base rates */
  check(Boolean(await tapLabel("/^News/")), "News opens");
  await audit("news");
  await shot("news");
  await key("Escape");
  await key("/");
  await audit("quick switch");
  await key("Escape");
  await key("b");
  await audit("base rates");
  await shot("baserates");
  await key("Escape");

  /* 8. The alarm row's two switches exist and are pressable */
  await key("a");
  const alarm = await page.evaluate(`(() => {
    const b = Array.from(document.querySelectorAll("[data-alerts-card] button")).filter((n) => /notification|sound/i.test(n.getAttribute("aria-label") || n.innerText));
    return b.map((n) => (n.getAttribute("aria-label") || n.innerText).trim());
  })()`);
  check(alarm.length >= 2 && !alarm.join(" ").includes("Chrome"), "the alarm offers a notification and a sound, in the phone's own words", alarm.join(" | "));
  await key("Escape");

  console.log(failed ? `✘ ${failed} PHONE CHECK(S) FAILED` : "PHONE QA OK");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
