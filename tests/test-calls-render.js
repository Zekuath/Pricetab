// Calls mode, in a real browser.
//
// The defects this guards against were all invisible to jsdom: boxes drawn on
// top of each other, a bottom axis that turned into a smear of overlapping
// timestamps once you asked for more than about six squares, a locked call
// that could be replaced by clicking it, and a history area that grew and
// shrank unpredictably as the square count changed. Every one of them is a
// geometry question, so the only honest test is a rendered chart.
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
  console.log("• calls render test skipped: playwright not installed");
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

/* The chart keeps its nodes and hides the ones it is not using — the mesh is
 * no longer torn down and rebuilt on every redraw. A parked node still holds
 * the coordinates it had when it was last drawn, so anything reading geometry
 * out of the DOM has to skip them or it will measure last week's grid. */
const VIS = `((e) => e.getAttribute("visibility") !== "hidden")`;

// The page is full of SVG icons; the chart is the biggest one.
const CHART = `[...document.querySelectorAll("svg")]
  .map((e) => ({ e, r: e.getBoundingClientRect() }))
  .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0].e`;

// `series` decides what the next historic request answers with, so a test can
// make the price band move the way a real refresh does.
const newCtx = async (
  browser, share, calls, settleMs = 2000, series = () => PRICES, fakeClock = false,
  grid = true, predict = true,
) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  let served = 0;
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith("file://")) return r.continue();
    if (u.includes("historic")) return r.fulfill(json({ data: { prices: series(served++) } }));
    if (u.includes("spot"))
      return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
    return r.fulfill(json({ data: {} }));
  });
  await ctx.addInitScript(
    ([a, c, g, p]) => {
      localStorage.setItem("crypto_chart_predict", p);
      localStorage.setItem("crypto_chart_grid", g);
      // How much of the width the board takes — the only control there is
      localStorage.setItem("crypto_chart_future_share", a);
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      if (c) localStorage.setItem("crypto_chart_calls", c);
      else localStorage.removeItem("crypto_chart_calls");
    },
    [String(share), calls || "", grid ? "true" : "false", predict ? "true" : "false"],
  );
  const page = await ctx.newPage();
  // Installed before the first navigation or the app's timers are the real
  // ones and nothing can be wound forward later.
  if (fakeClock) await page.clock.install({ time: Date.now() });
  await page.goto(INDEX, { waitUntil: "load" });
  await page.waitForSelector("svg path", { timeout: 20000 });
  // The celebration fires as soon as a due call settles on load, so a caller
  // that wants to watch it asks for no settling pause at all.
  if (settleMs) await page.waitForTimeout(settleMs);
  return { ctx, page };
};

const T = Date.now();

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.log(`• calls render test skipped: no browser binary (${e.message.split("\n")[0]})`);
    process.exit(0);
  }

  // ── 1. the time axis stays readable at every square count ──────────────
  for (const share of [0.16, 0.3, 0.43]) {
    const { ctx, page } = await newCtx(browser, share);
    const clashes = await page.evaluate(`(() => {
      const chart = ${CHART};
      const texts = [...chart.querySelectorAll("text")].filter(${VIS})
        .map((t) => ({ s: t.textContent, bb: t.getBBox() }))
        .filter((o) => o.bb.width > 0);
      const maxY = Math.max(...texts.map((o) => o.bb.y));
      const row = texts.filter((o) => o.bb.y > maxY - 6).sort((a, b) => a.bb.x - b.bb.x);
      const out = [];
      for (let i = 1; i < row.length; i++) {
        if (row[i].bb.x < row[i - 1].bb.x + row[i - 1].bb.width) {
          out.push(row[i - 1].s + " / " + row[i].s);
        }
      }
      return out;
    })()`);
    check(clashes.length === 0, `time labels never overlap (${share * 100}% board)`, clashes.join(", "));
    await ctx.close();
  }

  // ── 2. stored calls are never drawn on top of one another ──────────────
  // Seeded as they end up after drift: made at different moments, so their
  // rectangles are not on a common lattice.
  const MIN = 60e3;
  const mk = (tMin, spanMin, lo, hi, col, placedOffset) => ({
    id: `c${tMin}`, coin: "BTC", currency: "USD", period: "hour",
    target: T + tMin * MIN, span: spanMin * MIN, lo, hi, col,
    placed: T - 600e3 + placedOffset, placedPrice: 43400,
  });
  const seeded = JSON.stringify({
    record: { hits: 1, total: 2, streak: 1, best: 1 },
    done: [],
    open: [
      mk(6, 6, 43300, 43450, 1, 0),
      mk(9, 6, 43380, 43530, 2, 1000),
      mk(11, 6, 43340, 43490, 3, 2000),
      mk(24, 6, 43500, 43650, 4, 3000),
    ],
  });
  {
    const { ctx, page } = await newCtx(browser, 0.36, seeded);
    const res = await page.evaluate(`(() => {
      const chart = ${CHART};
      const r = [...chart.querySelectorAll("rect")].filter(${VIS})
        .filter((e) => e.getAttribute("stroke-dasharray") === "3 3")
        .map((e) => ({
          x: +e.getAttribute("x"), y: +e.getAttribute("y"),
          w: +e.getAttribute("width"), h: +e.getAttribute("height"),
        }))
        .filter((b) => b.w > 2 && b.h > 2);
      let n = 0;
      for (let i = 0; i < r.length; i++)
        for (let j = i + 1; j < r.length; j++) {
          const a = r[i], b = r[j];
          if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 &&
              Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5) n++;
        }
      return { drawn: r.length, overlaps: n };
    })()`);
    check(res.overlaps === 0, "call boxes never overlap on screen",
      `${res.overlaps} overlapping pairs of ${res.drawn}`);
    check(res.drawn > 0, "the surviving calls are still drawn", `${res.drawn} boxes`);
    await ctx.close();
  }

  // ── 3. a lock cannot be undone ─────────────────────────────────────────
  {
    const { ctx, page } = await newCtx(browser, 0.3);
    const g = await page.evaluate(`(() => {
      const chart = ${CHART};
      const r = chart.getBoundingClientRect();
      const now = [...chart.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      return { x: r.x, y: r.y, w: r.width, h: r.height,
               nowX: now ? +now.getAttribute("x1") : null };
    })()`);
    check(g.nowX > 0, "a future strip is reserved");
    const px = g.x + g.nowX + (g.w - g.nowX) * 0.25;
    const py = g.y + g.h * 0.45;
    const count = () =>
      page.evaluate(() => {
        try {
          return (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || []).length;
        } catch { return -1; }
      });

    await page.mouse.click(px, py);          // draft
    await page.waitForTimeout(250);
    check((await count()) === 0, "a draft is not a stored call");
    await page.mouse.click(px, py);          // lock
    await page.waitForTimeout(900);
    check((await count()) === 1, "the second click locks it");

    await page.mouse.click(px, py);
    await page.waitForTimeout(250);
    await page.mouse.click(px, py);
    await page.waitForTimeout(700);
    check((await count()) === 1, "clicking a locked square cannot replace or clear it");
    await ctx.close();
  }

  // ── 4. a wider board never gives back more history ─────────────────────
  // The board's width used to be a count of squares, and the pitch was chosen
  // to fit that many: with only three or four round price steps to pick from,
  // asking for eight squares could hand back *more* history than asking for
  // six. The width is set directly now, so this should be trivially true —
  // which is the point of checking it, since the geometry underneath still has
  // a quantised pitch in it.
  {
    const seen = [];
    for (const share of [0.13, 0.2, 0.3, 0.45, 0.6, 0.8]) {
      const { ctx, page } = await newCtx(browser, share);
      const m = await page.evaluate(`(() => {
        const chart = ${CHART};
        const r = chart.getBoundingClientRect();
        const now = [...chart.querySelectorAll("line")].filter(${VIS})
          .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
        const verticals = [...chart.querySelectorAll("line")].filter(${VIS})
          .filter((l) => Math.abs(+l.getAttribute("x1") - +l.getAttribute("x2")) < 0.01
                         && !l.getAttribute("stroke-dasharray"))
          .map((l) => +l.getAttribute("x1")).sort((a, b) => a - b);
        return { nowX: now ? +now.getAttribute("x1") : null,
                 pitch: verticals.length > 1 ? verticals[1] - verticals[0] : null };
      })()`);
      seen.push({ share, ...m });
      await ctx.close();
    }
    const backwards = seen.filter((r, i) => i > 0 && r.nowX > seen[i - 1].nowX + 1);
    check(backwards.length === 0, "a wider board never gives back more history",
      seen.map((r) => `${r.share}:${Math.round(r.nowX)}`).join(" "));
    /* And however far it is pulled, two whole squares of chart are left to
     * read. A limit in squares rather than in percent means the same thing on
     * every window — and it is what stops a drag from taking the handle off
     * the screen with the board. */
    const squeezed = seen.filter((r) => r.nowX < r.pitch * 2 - 1);
    check(squeezed.length === 0,
      "and always leaves two squares of it on screen",
      squeezed.map((r) => `${r.share}: ${Math.round(r.nowX)}px < ${Math.round(r.pitch * 2)}px`).join(" "));
  }

  // ── 5. the animations, including the one that only plays on a hit ──────
  // A call whose target is already in the past, with a band around the price
  // the series actually had then, so it settles as a hit on load and the
  // celebration runs. Nothing it draws may outlive it: the burst used to fade
  // its rays to nothing and leave every one of them in the document.
  {
    const at = (secAgo) => {
      const t = NOW_S - secAgo;
      let best = PRICES[0];
      for (const p of PRICES) {
        if (Math.abs(p.time - t) < Math.abs(best.time - t)) best = p;
      }
      return +best.price;
    };
    const hitPrice = at(12 * 60);
    const seededHit = JSON.stringify({
      record: { hits: 1, total: 2, streak: 1, best: 1 },
      done: [],
      open: [{
        id: "settle-me", coin: "BTC", currency: "USD", period: "hour",
        target: T - 12 * 60e3, span: 6 * 60e3,
        lo: hitPrice - 60, hi: hitPrice + 60, col: 1,
        placed: T - 40 * 60e3, placedPrice: 43100,
      }],
    });
    const { ctx, page } = await newCtx(browser, 0.23, seededHit, 0);
    /* Counted inside the burst's own layer. It used to be every round-capped
     * line on the chart, which is a style and not an identity — the board's
     * grip bars are round-capped too, and the test started counting the
     * handle as a ray the celebration had failed to clean up. */
    const rayCount = `${CHART}.querySelectorAll(".pt-burst line").length`;

    let peak = 0;
    for (let i = 0; i < 24; i++) {
      peak = Math.max(peak, await page.evaluate(rayCount));
      await page.waitForTimeout(120);
    }
    check(peak > 0, "a settled hit plays its celebration", `${peak} rays at peak`);

    const rec = await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}");
      return { open: (c.open || []).length, done: (c.done || []).length,
               result: ((c.done || [])[0] || {}).result };
    });
    check(rec.open === 0 && rec.done === 1 && rec.result === "hit",
      "the hit is settled and kept in the record", JSON.stringify(rec));

    await page.waitForTimeout(2500);
    check((await page.evaluate(rayCount)) === 0,
      "the celebration removes every element it drew");
    check(
      (await page.evaluate(`document.querySelectorAll(".pt-draft-fill").length`)) === 0,
      "no draft pulse is left running",
    );
    await ctx.close();
  }

  // ── 6. the hover hint leaves with the pointer ──────────────────────────
  // Every other piece of the hover drawing was hidden on the way out and this
  // one was not, so the square vanished and CALL IT stayed behind — an
  // invitation floating over a chart nobody was pointing at.
  {
    const { ctx, page } = await newCtx(browser, 0.23);
    const hintVisible = () =>
      page.evaluate(`(() => {
        const t = [...${CHART}.querySelectorAll("text")]
          .find((e) => e.textContent === "CALL IT" || e.textContent === "LOCKED");
        return t ? t.getAttribute("visibility") !== "hidden" : false;
      })()`);
    const g = await page.evaluate(`(() => {
      const c = ${CHART}, r = c.getBoundingClientRect();
      const n = [...c.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top,
               nowX: n ? +n.getAttribute("x1") : null };
    })()`);
    const px = g.x + g.nowX + (g.w - g.nowX) * 0.4;
    const py = g.y + g.h * 0.45;

    await page.mouse.move(px, py);
    await page.waitForTimeout(300);
    check(await hintVisible(), "hovering a free future square shows the hint");

    await page.mouse.move(px, g.top - 5);
    await page.mouse.move(px, 0);
    await page.waitForTimeout(400);
    check(!(await hintVisible()), "the hint leaves with the pointer");

    // A redraw while the pointer is away must not resurrect it either: every
    // hover drawing reads the last known position, so that position has to be
    // parked out of bounds rather than left inside the plot.
    await page.mouse.move(px, py);
    await page.waitForTimeout(250);
    await page.mouse.move(px, 0);
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 1180, height: 760 });
    await page.waitForTimeout(900);
    check(!(await hintVisible()), "a redraw with the pointer away does not bring it back");
    await ctx.close();
  }

  // ── 7. every square the chart offers can actually be locked ────────────
  // The strip is sized a little wider than the squares asked for, so its right
  // hand end held a part-column running off the edge — and that part-column
  // was clickable. Measured at 1280px: two squares asked for, three clickable;
  // eight asked for, twelve, and a call locked in the twelfth was refused by
  // the store on its way to localStorage. The chart drew a call that no longer
  // existed, and the next reload showed an empty board with nothing said.
  for (const share of [0.16, 0.36]) {
    const { ctx, page } = await newCtx(browser, share);
    const g = await page.evaluate(`(() => {
      const chart = ${CHART};
      const r = chart.getBoundingClientRect();
      const now = [...chart.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      const nowX = now ? +now.getAttribute("x1") : null;
      const future = [...chart.querySelectorAll("line")].filter(${VIS})
        .filter((l) => Math.abs(+l.getAttribute("x1") - +l.getAttribute("x2")) < 0.01)
        .map((l) => +l.getAttribute("x1"))
        .filter((x) => x > nowX + 0.5)
        .sort((a, b) => a - b);
      return { x: r.x, y: r.y, w: r.width, h: r.height, nowX,
               last: future.length ? future[future.length - 1] : null,
               pitch: future.length > 1 ? future[1] - future[0] : null };
    })()`);
    const stored = () =>
      page.evaluate(() => {
        try {
          return (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || [])
            .length;
        } catch { return -1; }
      });

    const py = g.y + g.h * 0.45;
    // The centre of the last column the chart drew whole
    const px = g.x + g.last - g.pitch / 2;
    await page.mouse.click(px, py);
    await page.waitForTimeout(220);
    await page.mouse.click(px, py);
    await page.waitForTimeout(800);
    check(
      (await stored()) === 1,
      `the furthest square on offer is stored when locked (${share * 100}% board)`,
    );

    // And the strip's leftover tail is chart, not board: a square the chart
    // cannot draw whole must not take a call either.
    const tail = g.w - g.last;
    if (tail > 12) {
      await page.mouse.click(g.x + g.last + tail / 2, py);
      await page.waitForTimeout(220);
      await page.mouse.click(g.x + g.last + tail / 2, py);
      await page.waitForTimeout(800);
      check(
        (await stored()) === 1,
        `a part-square past the last line takes no call (${share * 100}% board)`,
      );
    }
    await ctx.close();
  }

  // ── 8. a refresh in the middle of the gesture ──────────────────────────
  // Placing a call is two clicks, and prices arrive every thirty seconds. The
  // draft used to be stored as geometry, so a refresh that moved the price
  // band by a hair changed what the very same square's edges came out as: the
  // second click no longer matched the first and re-drafted instead of
  // locking. The gesture failed for the most ordinary reason there is, and it
  // failed without saying anything.
  {
    // Second and later responses sit a little higher, which is what moves the
    // domain — exactly what a real refresh does.
    const shifted = (n) =>
      n === 0 ? PRICES : PRICES.map((p) => ({ ...p, price: (+p.price + 90).toFixed(2) }));
    const { ctx, page } = await newCtx(browser, 0.23, null, 2000, shifted, true);
    const g = await page.evaluate(`(() => {
      const chart = ${CHART};
      const r = chart.getBoundingClientRect();
      const now = [...chart.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      return { x: r.x, y: r.y, w: r.width, h: r.height,
               nowX: now ? +now.getAttribute("x1") : null };
    })()`);
    const px = g.x + g.nowX + (g.w - g.nowX) * 0.3;
    const py = g.y + g.h * 0.45;

    await page.mouse.click(px, py);        // draft
    await page.waitForTimeout(250);
    /* A real refresh, not a nudge: the price cache holds for thirty seconds,
     * so pressing R here would be answered from memory and nothing would
     * move. The clock is wound past the cache instead, which is the poll the
     * user is not doing anything about when they place a call. */
    await page.clock.fastForward(45_000);
    await page.waitForTimeout(2500);
    await page.mouse.click(px, py);        // lock
    await page.waitForTimeout(900);
    const stored = await page.evaluate(() => {
      try {
        return (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || [])
          .length;
      } catch { return -1; }
    });
    check(stored === 1, "a refresh between the two clicks does not lose the second one",
      `${stored} calls stored`);
    await ctx.close();
  }

  // ── 9. calls stand down while two coins share the chart ────────────────
  // Comparison puts percent change on the y axis. The mesh, its price labels
  // and the squares you call are all built from the price scale, so with both
  // on the chart offered a band no drawn line was measured against — and took
  // a locked prediction on it. Candles and the volume band were already
  // switched off here for exactly that reason; this was the one left behind.
  {
    const { ctx, page } = await newCtx(browser, 0.23);
    /* Visible ones. The chart keeps its nodes and hides them rather than
     * tearing the mesh down and rebuilding it every redraw, so "is it drawn"
     * is a question about visibility now, not about existence. */
    const nowLine = () =>
      page.evaluate(`[...${CHART}.querySelectorAll("line")]
        .filter((l) => l.getAttribute("stroke-dasharray") === "2 3"
                       && getComputedStyle(l).visibility !== "hidden").length`);
    check((await nowLine()) === 1, "the future strip is there to begin with");

    await page.keyboard.press("c");                    // compare picker
    await page.waitForTimeout(400);
    await page.keyboard.type("eth");
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);

    const comparing = await page.evaluate(
      `[...${CHART}.querySelectorAll("text")].some((t) => /ETH/.test(t.textContent))`,
    );
    check(comparing, "the comparison is actually drawn");
    check((await nowLine()) === 0, "no future strip while comparing");

    const g = await page.evaluate(`(() => {
      const r = ${CHART}.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })()`);
    // Where the callable squares used to be
    await page.mouse.click(g.x + g.w * 0.9, g.y + g.h * 0.45);
    await page.waitForTimeout(200);
    await page.mouse.click(g.x + g.w * 0.9, g.y + g.h * 0.45);
    await page.waitForTimeout(700);
    const stored = await page.evaluate(() => {
      try {
        return (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || [])
          .length;
      } catch { return -1; }
    });
    check(stored === 0, "and no call can be placed on it", `${stored} stored`);
    await ctx.close();
  }

  // ── 10. the lattice is anchored to the clock, not to the right edge ────
  // Counted back from "now", the lines stayed still on screen and the time
  // underneath them moved: a column meant five minutes later than it had a
  // moment ago. A locked call is a fixed rectangle of real time, so it slid
  // out from under the lattice that made it — after a couple of refreshes the
  // box sat across two squares and there was no square left on the chart that
  // was the one that had been pointed at.
  {
    /* The window slides forward the way a live series does — only the
     * timestamps move, so any drift is the lattice's own. The slide is a
     * third of a square, deliberately: a whole square would land back on the
     * old lattice and a pinned grid would look anchored when it was not. */
    let slide = 0;
    const slid = () =>
      slide === 0 ? PRICES : PRICES.map((p) => ({ ...p, time: p.time + slide }));
    const { ctx, page } = await newCtx(browser, 0.3, null, 2000, slid, true);
    const geometry = `(() => {
      const chart = ${CHART};
      const lines = [...chart.querySelectorAll("line")].filter(${VIS})
        .filter((l) => Math.abs(+l.getAttribute("x1") - +l.getAttribute("x2")) < 0.01
                       && !l.getAttribute("stroke-dasharray"))
        .map((l) => +l.getAttribute("x1"));
      const box = [...chart.querySelectorAll("rect")].filter(${VIS})
        .filter((e) => e.getAttribute("stroke-dasharray") === "3 3")
        .map((e) => ({ x: +e.getAttribute("x"), w: +e.getAttribute("width") }))
        .filter((b) => b.w > 2)[0] || null;
      if (!box || !lines.length) return null;
      const off = (v) => Math.min(...lines.map((L) => Math.abs(L - v)));
      return { drift: Math.max(off(box.x), off(box.x + box.w)), x: box.x };
    })()`;

    const g = await page.evaluate(`(() => {
      const chart = ${CHART};
      const r = chart.getBoundingClientRect();
      const now = [...chart.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      return { x: r.x, y: r.y, w: r.width, h: r.height,
               nowX: now ? +now.getAttribute("x1") : null };
    })()`);
    const px = g.x + g.nowX + (g.w - g.nowX) * 0.6;
    const py = g.y + g.h * 0.45;
    await page.mouse.click(px, py);
    await page.waitForTimeout(220);
    await page.mouse.click(px, py);
    await page.waitForTimeout(900);

    const before = await page.evaluate(geometry);
    check(before && before.drift < 1.5, "a locked call sits on the lattice",
      before ? `${before.drift.toFixed(1)}px off` : "no box drawn");

    // Twice, so a lattice that only looked right once cannot pass
    for (const seconds of [50, 100]) {
      slide = seconds;
      await page.clock.fastForward(45_000);   // past the poll and the cache
      await page.waitForTimeout(2200);
    }

    const after = await page.evaluate(geometry);
    check(after && after.drift < 1.5,
      "and is still on it after the series moves on",
      after ? `${after.drift.toFixed(1)}px off` : "no box drawn");
    check(after && before && Math.abs(after.x - before.x) > 1,
      "the chart did move — the box travelled with the data",
      after && before ? `${(after.x - before.x).toFixed(1)}px` : "n/a");
    await ctx.close();
  }

  // ── 11. the readout describes the square under the pointer ─────────────
  // It was guarded on the nearest data point, and the future strip has no
  // data — the nearest point there is always the last one drawn. So across
  // the whole board, the only place a call can be made, the numbers stayed on
  // whichever square was entered first and the box stayed parked beside the
  // live dot: a band and a pair of times belonging to a box somewhere else.
  {
    const { ctx, page } = await newCtx(browser, 0.23);
    const READ = `(() => {
      const c = ${CHART};
      const texts = [...c.querySelectorAll("text")].filter(${VIS})
        .filter((t) => t.getAttribute("visibility") !== "hidden")
        .map((t) => t.textContent);
      const cell = [...c.querySelectorAll("rect")].filter(${VIS})
        .filter((e) => e.getAttribute("visibility") === "visible"
                       && +e.getAttribute("width") > 4)
        .map((e) => ({ y: +e.getAttribute("y"), h: +e.getAttribute("height"),
                       x: +e.getAttribute("x"), w: +e.getAttribute("width") }))[0] || null;
      const box = [...c.querySelectorAll("rect")].filter(${VIS})
        .map((e) => ({ x: +e.getAttribute("x"), y: +e.getAttribute("y"),
                       w: +e.getAttribute("width"), h: +e.getAttribute("height") }))
        .filter((r) => r.w > 100 && r.h > 20 && r.h < 90)[0] || null;
      return {
        band: texts.find((t) => /^[^A-Za-z]*\\d[\\d.,KMB]* – /.test(t)) || null,
        span: texts.find((t) => /[A-Z][a-z]{2} \\d+.* – /.test(t)) || null,
        note: texts.find((t) => /settles/.test(t)) || null,
        cell, box,
      };
    })()`;
    /* Aimed at the lattice, not at a fixed offset from "now".
     *
     * It used to hover `nowX + 60`, which is only a callable square when the
     * column boundary happens to fall in the right place — and the boundaries
     * are anchored to absolute time, so where they fall depends on the clock
     * at the moment the fixture was built. That made the note check a
     * coin-toss between "a whole future square" and "the part-column `cellAt`
     * deliberately refuses", and a refused square correctly has no note.
     * Reading the boundaries off the chart and pointing at the middle of a
     * whole column asks the question the check is actually about.
     */
    const g = await page.evaluate(`(() => {
      const c = ${CHART}, r = c.getBoundingClientRect();
      const vis = ${VIS};
      const lines = [...c.querySelectorAll("line")].filter(vis);
      const n = lines.find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      const nowX = n ? +n.getAttribute("x1") : null;
      /* Full-height verticals only, and not the dashed "now" line.
       *
       * The grip on that line is three upright bars 4px apart, drawn as line
       * elements in the same group — picked up as lattice boundaries they put
       * the "first future column" 4px wide and straddling "now", which is the
       * one column cellAt refuses. */
      const tall = (l) => Math.abs(+l.getAttribute("y2") - +l.getAttribute("y1")) > r.height * 0.9;
      const cols = [...new Set(lines
        .filter((l) => Math.abs(+l.getAttribute("x1") - +l.getAttribute("x2")) < 0.5)
        .filter((l) => tall(l) && l.getAttribute("stroke-dasharray") !== "2 3")
        .map((l) => +l.getAttribute("x1")))].sort((a, b) => a - b);
      /* Full-width horizontals only. "Any horizontal line" also catches the
       * rule under the zoom pill's readout, which is 40px long and sits at
       * y=21 — read as a lattice row it puts the first row's middle inside the
       * top fade, where nothing is callable and the readout says nothing. */
      const wide = (l) =>
        Math.abs(+l.getAttribute("x2") - +l.getAttribute("x1")) > r.width * 0.9;
      const rows = [...new Set(lines
        .filter((l) => Math.abs(+l.getAttribute("y1") - +l.getAttribute("y2")) < 0.5)
        .filter(wide)
        .map((l) => +l.getAttribute("y1")))].sort((a, b) => a - b);
      // Boundaries right of "now": the first whole future column starts at the
      // first of them, since the one before it is the part-column
      return { x: r.x, y: r.y, w: r.width, h: r.height, nowX, cols: cols.filter((v) => v > nowX + 0.5), rows };
    })()`);
    // Centres of whole cells, so every hover lands on something callable
    const colMid = (i) => (g.cols[i] + g.cols[i + 1]) / 2 - g.nowX;
    const rowMid = (i) => (g.rows[i] + g.rows[i + 1]) / 2;
    /* Waits for the readout rather than sampling once. The hover is drawn off
     * a rAF, and under the load of the whole suite running one after another a
     * fixed 400ms was occasionally short — the check failed about one run in
     * five and passed every time it was run alone, which is the worst kind of
     * test to leave in place. */
    const look = async (dx, dy) => {
      await page.mouse.move(g.x + g.nowX + dx, g.y + dy);
      let seen = null;
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(100);
        seen = await page.evaluate(READ);
        if (seen && seen.band && seen.span) return seen;
      }
      return seen;
    };

    /* Rows counted from the bottom, columns from "now": row 1 is a whole
     * square well clear of the top fade, row `length - 3` sits low on the
     * board, and both are two different bands of the same lattice. */
    const low = await look(colMid(0), rowMid(g.rows.length - 3));
    const high = await look(colMid(0), rowMid(1));
    const far = await look(colMid(2), rowMid(1));

    check(low.band && low.span, "a square reads out a band and a span",
      JSON.stringify([low.band, low.span]));
    check(low.band !== high.band,
      "another row is another band", `${low.band} / ${high.band}`);
    check(high.span !== far.span,
      "another column is another span", `${high.span} / ${far.span}`);
    check(/needs [+-]|in the band now/.test(high.note || "") && /settles/.test(high.note || ""),
      "and what naming it would claim", high.note || "(no note)");

    // Beside the square, not beside the price line
    const near = [low, high, far].every(
      (s) => s.cell && s.box &&
        Math.abs(s.box.y + s.box.h / 2 - (s.cell.y + s.cell.h / 2)) < 24,
    );
    check(near, "the box sits beside the square it describes",
      JSON.stringify([low, high, far].map((s) => s.box && s.cell &&
        Math.round(s.box.y + s.box.h / 2 - s.cell.y - s.cell.h / 2))));

    // …and never on top of it, or it would cover what you are about to click
    const clear = [low, high, far].every(
      (s) => s.box.x + s.box.w <= s.cell.x + 0.5 || s.box.x >= s.cell.x + s.cell.w - 0.5,
    );
    check(clear, "and never covers it");

    // Over history there is nothing to decide, so nothing is claimed
    const past = await look(-300, g.h * 0.5);
    check(!past.note, "no claim is offered over history", past.note || "");

    /* And what it says agrees with the axis underneath it. The square's times
     * and the axis labels come from the same scale, but only if the lattice's
     * step is read off that scale rather than recomputed from the range — the
     * two parted company the moment the strip started pushing the past off
     * the left edge instead of squeezing it. */
    const axis = await page.evaluate(`(() => {
      const c = ${CHART}, r = c.getBoundingClientRect();
      const verticals = [...c.querySelectorAll("line")].filter(${VIS})
        .filter((l) => Math.abs(+l.getAttribute("x1") - +l.getAttribute("x2")) < 0.01
                       && !l.getAttribute("stroke-dasharray"))
        .map((l) => +l.getAttribute("x1")).sort((a, b) => a - b);
      const labels = [...c.querySelectorAll("text")].filter(${VIS})
        .filter((t) => /\\d{2}:\\d{2}/.test(t.textContent)
                       && +t.getAttribute("y") > r.height - 30)
        .map((t) => ({ x: +t.getAttribute("x"), s: t.textContent }));
      return { verticals, labels };
    })()`);
    if (axis.labels.length > 2) {
      const label = axis.labels[Math.floor(axis.labels.length / 2)];
      const boundary = axis.verticals.reduce((a, b) =>
        Math.abs(b - (label.x - 4)) < Math.abs(a - (label.x - 4)) ? b : a);
      await page.mouse.move(g.x + boundary + 8, g.y + g.h * 0.5);
      await page.waitForTimeout(400);
      const here = await page.evaluate(READ);
      check(here.span && here.span.startsWith(label.s),
        "the square's clock agrees with the axis under it",
        `axis ${label.s} / square ${here.span}`);
    }
    await ctx.close();
  }

  // ── 12. the "now" line is a handle ─────────────────────────────────────
  // How much future the board holds is a number in the calls panel, but the
  // thing it moves is a line on the chart that people reach for. Dragging it
  // sets the same number — so the two must agree, and letting go of it must
  // not also read as the click that drafts a call.
  {
    const { ctx, page } = await newCtx(browser, 0.2);
    const G = `(() => {
      const c = ${CHART}, r = c.getBoundingClientRect();
      const n = [...c.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      return { x: r.x, y: r.y, w: r.width, h: r.height,
               nowX: n ? +n.getAttribute("x1") : null,
               weight: n ? n.getAttribute("stroke-width") : null,
               cursor: getComputedStyle(c).cursor,
               share: +localStorage.getItem("crypto_chart_future_share"),
               drafts: document.querySelectorAll(".pt-draft-fill").length,
               readout: (() => {
                 const b = [...c.querySelectorAll("rect")].filter(${VIS})
                   .find((e) => +e.getAttribute("width") > 100
                                && +e.getAttribute("height") > 20
                                && +e.getAttribute("height") < 90);
                 return b ? getComputedStyle(b).visibility : "none";
               })(),
               calls: (() => { try {
                 return (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}")
                   .open || []).length;
               } catch { return -1; } })() };
    })()`;
    let mid = null;
    const drag = async (from, to, y) => {
      await page.mouse.move(from, y);
      await page.waitForTimeout(250);
      await page.mouse.down();
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(from + ((to - from) * i) / steps, y);
        await page.waitForTimeout(25);
        if (i === Math.round(steps / 2)) mid = await page.evaluate(G);
      }
      await page.mouse.up();
      await page.waitForTimeout(700);
      return page.evaluate(G);
    };

    const start = await page.evaluate(G);
    const y = start.y + start.h * 0.5;
    await page.mouse.move(start.x + start.nowX, y);
    await page.waitForTimeout(300);
    const over = await page.evaluate(G);
    check(over.cursor === "ew-resize", "the line says it can be taken hold of",
      over.cursor);
    check(over.weight === "2" && start.weight === "1",
      "and comes up to full strength under the pointer",
      `${start.weight} → ${over.weight}`);

    const left = await drag(start.x + start.nowX, start.x + start.nowX - 210, y);
    check(left.share > start.share && left.nowX < start.nowX - 20,
      "dragging it left buys more board",
      `${start.share.toFixed(2)} → ${left.share.toFixed(2)}, x ${start.nowX} → ${left.nowX}`);

    /* Nothing the pointer drew survives the grab: mid-drag the readout is
     * describing a square the redraw has already moved out from under it. */
    /* "none" as well as "hidden": reaching for the line now clears the hover
     * drawing outright, so by the time the drag starts there is no readout box
     * left to hide. Both answers satisfy the thing being protected — nothing
     * the pointer drew survives the grab. */
    check(mid && (mid.readout === "hidden" || mid.readout === "none"),
      "the readout leaves when the line is taken hold of", mid && mid.readout);

    const right = await drag(left.x + left.nowX, left.x + left.nowX + 210, y);
    check(right.share < left.share && right.nowX > left.nowX + 20,
      "and right gives the room back to the price line",
      `${left.share.toFixed(2)} → ${right.share.toFixed(2)}`);

    // Let go inside the board: a drag is not the first click of a call
    const deep = await drag(
      right.x + right.nowX,
      right.x + right.nowX - 150,
      y,
    );
    await page.mouse.move(deep.x + deep.nowX + (deep.w - deep.nowX) * 0.6, y);
    await page.waitForTimeout(300);
    const after = await page.evaluate(G);
    check(after.drafts === 0 && after.calls === 0,
      "letting go of it drafts nothing",
      `${after.drafts} drafts, ${after.calls} calls`);

    // …and the ordinary gesture still works afterwards
    const px = deep.x + deep.nowX + (deep.w - deep.nowX) * 0.6;
    await page.mouse.click(px, y);
    await page.waitForTimeout(250);
    await page.mouse.click(px, y);
    await page.waitForTimeout(800);
    const placed = await page.evaluate(G);
    check(placed.calls === 1, "two clicks still place a call after a drag",
      `${placed.calls} calls`);
    await ctx.close();
  }

  // ── 13. the board is taken out of the left, not out of the price line ──
  // The series used to be squeezed into whatever width the strip left over,
  // so asking for more future redrew the past: every peak moved and every
  // locked call slid against the line it was called on.
  {
    const SHAPE = `(() => {
      const c = ${CHART};
      const p = [...c.querySelectorAll("path")]
        .map((e) => ({ b: e.getBBox() }))
        .filter((o) => o.b.width > 50)
        .sort((a, b) => b.b.width - a.b.width)[0];
      const n = [...c.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      return { w: c.getBoundingClientRect().width,
               nowX: n ? +n.getAttribute("x1") : null,
               x: p ? p.b.x : null, width: p ? p.b.width : null };
    })()`;
    const shapes = [];
    for (const share of [0.16, 0.55]) {
      const { ctx, page } = await newCtx(browser, share);
      shapes.push(await page.evaluate(SHAPE));
      await ctx.close();
    }
    const [small, big] = shapes;
    check(Math.abs(small.width - big.width) < 2,
      "the price line keeps its scale as the board grows",
      `${small.width.toFixed(0)}px → ${big.width.toFixed(0)}px`);
    check(big.x < small.x - 20 && big.nowX < small.nowX - 20,
      "the past slides off the left edge instead",
      `x ${small.x.toFixed(0)} → ${big.x.toFixed(0)}`);
  }

  // ── 14. a price on its own low can still be called lower ───────────────
  // The one prediction a chart that has just fallen off a cliff invites is
  // "further down", and it was the one thing the board could not say: the
  // price sat on the bottom edge of the plot and every square below it was
  // off the chart. The data band is now kept a square clear of both edges.
  {
    const FALLING = Array.from({ length: 120 }, (_, i) => ({
      price: (43000 - i * 9 + Math.sin(i / 9) * 120).toFixed(2),
      time: NOW_S - (120 - i) * 30,
    }));
    const { ctx, page } = await newCtx(browser, 0.23, null, 2000, () => FALLING);
    const g = await page.evaluate(`(() => {
      const c = ${CHART}, r = c.getBoundingClientRect();
      const n = [...c.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      const dot = c.querySelector(".pt-live-dot");
      const verticals = [...c.querySelectorAll("line")].filter(${VIS})
        .filter((l) => Math.abs(+l.getAttribute("x1") - +l.getAttribute("x2")) < 0.01
                       && !l.getAttribute("stroke-dasharray"))
        .map((l) => +l.getAttribute("x1")).sort((a, b) => a - b);
      return { x: r.x, y: r.y, w: r.width, h: r.height,
               nowX: n ? +n.getAttribute("x1") : null,
               pitch: verticals.length > 1 ? verticals[1] - verticals[0] : null,
               dotY: dot ? +dot.getAttribute("cy") : null };
    })()`);
    // A whole square of room, not "some" room: half a square is a cell the
    // hint will not sit in and a click cannot land squarely in either
    check(g.dotY != null && g.pitch && g.h - g.dotY >= g.pitch * 0.95,
      "the falling price is kept a whole square clear of the bottom edge",
      `${(g.h - g.dotY).toFixed(0)}px of room, square is ${g.pitch.toFixed(0)}px`);

    const px = g.x + g.nowX + (g.w - g.nowX) * 0.25;
    const py = g.y + g.dotY + 45;          // a square below where it is now
    await page.mouse.move(px, py);
    await page.waitForTimeout(400);
    const hint = await page.evaluate(`(() => {
      const t = [...${CHART}.querySelectorAll("text")]
        .find((e) => e.textContent === "CALL IT");
      return t ? t.getAttribute("visibility") : "none";
    })()`);
    check(hint === "visible", "a square below it offers the call", hint);

    await page.mouse.click(px, py);
    await page.waitForTimeout(250);
    await page.mouse.click(px, py);
    await page.waitForTimeout(800);
    const stored = await page.evaluate(() => {
      try {
        return (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || [])
          .length;
      } catch { return -1; }
    });
    check(stored === 1, "and takes it", `${stored} stored`);
    await ctx.close();
  }

  // ── 15. a big move pans the board; it does not rescale it ──────────────
  // The chart's ordinary habit is to fit whatever it is given, which under a
  // board means "one square" is worth something different every refresh and
  // the boxes already locked drift off the gridlines they were called on. The
  // square is fixed now and the window follows the price instead.
  {
    let drop = 0;
    const flat = () =>
      Array.from({ length: 120 }, (_, i) => ({
        price: (43000 - drop + Math.sin(i / 9) * 90).toFixed(2),
        time: NOW_S - (120 - i) * 30,
      }));
    const { ctx, page } = await newCtx(browser, 0.3, null, 2200, flat, true);
    const M = `(() => {
      const c = ${CHART};
      const W = c.getBoundingClientRect().width;
      const horiz = [...new Set([...c.querySelectorAll("line")].filter(${VIS})
        .filter((l) => Math.abs(+l.getAttribute("y1") - +l.getAttribute("y2")) < 0.01
                       && Math.abs(+l.getAttribute("x1")) < 1
                       && Math.abs(+l.getAttribute("x2") - W) < 1)
        .map((l) => +(+l.getAttribute("y1")).toFixed(2)))].sort((a, b) => a - b);
      const pitch = horiz.length > 1 ? horiz[1] - horiz[0] : 0;
      const box = [...c.querySelectorAll("rect")].filter(${VIS})
        .filter((e) => e.getAttribute("stroke-dasharray") === "3 3"
                       && +e.getAttribute("width") > 2)
        .map((e) => ({ y: +e.getAttribute("y"), h: +e.getAttribute("height") }))[0] || null;
      const dot = c.querySelector(".pt-live-dot");
      const call = (() => { try {
        return (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || [])[0]
          || null;
      } catch { return null; } })();
      // Against the lattice extended past the drawn lines, so a box that has
      // panned off the top is judged on its alignment, not on being off screen
      const off = (v) => {
        if (!pitch) return null;
        const m = (((v - horiz[0]) % pitch) + pitch) % pitch;
        return Math.min(m, pitch - m);
      };
      return { pitch: +pitch.toFixed(2),
               top: horiz.length ? horiz[0] : null,
               boxH: box ? +box.h.toFixed(2) : null,
               drift: box ? +Math.max(off(box.y), off(box.y + box.h)).toFixed(2) : null,
               band: call ? +(call.hi - call.lo).toFixed(2) : null,
               dotY: dot ? +dot.getAttribute("cy") : null,
               h: c.getBoundingClientRect().height };
    })()`;
    const g = await page.evaluate(`(() => {
      const c = ${CHART}, r = c.getBoundingClientRect();
      const n = [...c.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      return { x: r.x, y: r.y, w: r.width, h: r.height,
               nowX: n ? +n.getAttribute("x1") : 0 };
    })()`);
    const px = g.x + g.nowX + (g.w - g.nowX) * 0.4;
    const py = g.y + g.h * 0.45;
    await page.mouse.click(px, py);
    await page.waitForTimeout(250);
    await page.mouse.click(px, py);
    await page.waitForTimeout(900);

    const seen = [];
    const first = await page.evaluate(M);
    // Falls the board can still show the call through — far enough to pan it,
    // near enough that the box is on screen to be measured
    for (const squares of [1, 2]) {
      drop = squares * first.band;
      await page.clock.fastForward(45_000);
      await page.waitForTimeout(2500);
      seen.push({ squares, ...(await page.evaluate(M)) });
    }
    check(seen.every((m) => Math.abs(m.boxH - m.pitch) < 1.5),
      "a locked call stays exactly one square tall through the fall",
      seen.map((m) => `-${m.squares}: ${m.boxH}/${m.pitch}`).join(" "));
    check(seen.every((m) => m.drift < 1.5),
      "and stays welded to the lattice",
      seen.map((m) => `-${m.squares}: ${m.drift}px`).join(" "));
    check(seen.every((m) => m.dotY > 0 && m.dotY < m.h),
      "and the price itself is still on screen after every one of them",
      seen.map((m) => `-${m.squares}: y ${Math.round(m.dotY)} of ${Math.round(m.h)}`).join(" "));
    /* And the lattice itself never moved. It is placed in whole steps, so a
     * pan lands the lines exactly where the old ones were: what moves is the
     * labels and the price, not the board. Centred on the range instead, a new
     * high a dollar above the old one shifted everything by a pixel. */
    check(seen.every((m) => Math.abs(m.top - seen[0].top) < 0.5),
      "and the board itself has not moved a pixel",
      seen.map((m) => `-${m.squares}: top ${m.top}`).join(" "));

    /* And a fall that takes the call right off the top stops drawing it. A box
     * two thousand pixels above the viewport is still a rectangle the browser
     * clips on every frame, and there can be forty of them. */
    drop = 40 * first.band;
    await page.clock.fastForward(45_000);
    await page.waitForTimeout(2500);
    const gone = await page.evaluate(M);
    check(gone.boxH === null, "a call the board has panned away from is not drawn",
      `box ${gone.boxH}`);
    check(gone.dotY > 0 && gone.dotY < gone.h,
      "and the price is on screen after a fall of forty squares",
      `y ${Math.round(gone.dotY)} of ${Math.round(gone.h)}`);
    await ctx.close();
  }

  // ── 16. the board is scaled to what you can see ────────────────────────
  // With most of the width given to the board, the visible sliver of history
  // used to be drawn on a scale sized for the whole range — a flat squiggle in
  // the middle of an empty chart, with the price twenty squares from anything.
  {
    // Wild early, quiet late: the two halves want completely different scales
    const TWO_HALVES = Array.from({ length: 120 }, (_, i) => ({
      price: (i < 60 ? 40000 + i * 100 : 43000 + Math.sin(i / 4) * 40).toFixed(2),
      time: NOW_S - (120 - i) * 30,
    }));
    const priceOf = (s) => {
      const m = /([\d.,]+)\s*([KMB]?)/.exec(s.replace(/[^\d.,KMB]/g, ""));
      if (!m) return null;
      const n = parseFloat(m[1].replace(/,/g, ""));
      return n * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1);
    };
    const spans = [];
    for (const share of [0.16, 0.8]) {
      const { ctx, page } = await newCtx(browser, share, null, 2200, () => TWO_HALVES);
      /* The price gutter, and only the price gutter. Filtering on x alone
       * also caught the time axis whenever a column boundary happened to land
       * in the left few pixels — and "Aug 14, 05:33 PM" parses as 140533
       * followed by the M of PM, which is to say $140 billion. The boundaries
       * sit on round clock instants now, so whether one lands there depends
       * on the time of day the suite is run at. The two rows are unambiguous
       * by height: the dates are on the axis at the foot of the chart. */
      const labels = await page.evaluate(`(() => {
        const c = ${CHART}, r = c.getBoundingClientRect();
        return [...c.querySelectorAll("text")].filter(${VIS})
          .filter((t) => +t.getAttribute("x") < 30
                         && +t.getAttribute("y") < r.height - 12
                         && /\\d/.test(t.textContent))
          .map((t) => t.textContent);
      })()`);
      const prices = labels.map(priceOf).filter((v) => v && isFinite(v));
      spans.push({ share, span: Math.max(...prices) - Math.min(...prices) });
      await ctx.close();
    }
    const [narrowBoard, wideBoard] = spans;
    check(wideBoard.span < narrowBoard.span / 3,
      "a wider board rescales to the window it leaves",
      `${Math.round(narrowBoard.span)} → ${Math.round(wideBoard.span)}`);
  }

  // ── 17. a call survives a trip to another range ────────────────────────
  // Reported: call a few squares on the hour, look at the week and the year,
  // come back — and the boxes are a different shape. Both halves of the
  // lattice were being re-derived from whatever the data looked like on the
  // way back. The square's width in *time* was read off the pixel pitch, so
  // it was a fresh accidental figure whenever the series changed length; and
  // the price step, sticky within a range, was thrown away at every switch of
  // range and picked again from a band that had moved in the meantime. A call
  // is a fixed rectangle of real time and real price: nothing about coming
  // back to it may depend on when you came back.
  {
    /* The hour range as it is when the call is made, and as it is on the way
     * back: a slightly different cadence (so the pixels-per-minute move) over
     * a quieter band (so the old code would step the price scale down a
     * rung). Both are ordinary things for half an hour of trading to do. */
    let visit = 0;
    const hourly = (wide, step) =>
      Array.from({ length: 120 }, (_, i) => ({
        price: (43000 + Math.sin(i / 7) * wide).toFixed(2),
        time: NOW_S - (120 - i) * step,
      }));
    const YEARLY = Array.from({ length: 200 }, (_, i) => ({
      price: (18000 + i * 130).toFixed(2),
      time: NOW_S - (200 - i) * 86400 * 2,
    }));
    const series = () => {
      if (visit === 1) return YEARLY;
      return visit === 0 ? hourly(150, 30) : hourly(90, 31);
    };
    const { ctx, page } = await newCtx(browser, 0.3, null, 2000, series, true);
    const shape = `(() => {
      const chart = ${CHART};
      const box = [...chart.querySelectorAll("rect")].filter(${VIS})
        .filter((e) => e.getAttribute("stroke-dasharray") === "3 3")
        .map((e) => ({ x: +e.getAttribute("x"), y: +e.getAttribute("y"),
                       w: +e.getAttribute("width"), h: +e.getAttribute("height") }))
        .filter((b) => b.w > 2)[0] || null;
      const at = (horizontal) => [...chart.querySelectorAll("line")].filter(${VIS})
        .filter((l) => Math.abs(+l.getAttribute(horizontal ? "y1" : "x1")
                                - +l.getAttribute(horizontal ? "y2" : "x2")) < 0.01
                       && !l.getAttribute("stroke-dasharray"))
        .map((l) => +l.getAttribute(horizontal ? "y1" : "x1"))
        .sort((a, b) => a - b);
      if (!box) return null;
      const off = (lines, v) => Math.min(...lines.map((L) => Math.abs(L - v)));
      const xs = at(false), ys = at(true);
      if (xs.length < 2 || ys.length < 2) return null;
      return {
        box,
        // In squares, not in pixels: the chart is the same width whatever
        // range is on it, so a series covering slightly more minutes draws
        // every square a little narrower. What has to hold is that the call
        // is still *one square* — that is the claim it was made as.
        cells: { w: box.w / (xs[1] - xs[0]), h: box.h / (ys[1] - ys[0]) },
        drift: Math.max(off(xs, box.x), off(xs, box.x + box.w),
                        off(ys, box.y), off(ys, box.y + box.h)),
      };
    })()`;
    const g = await page.evaluate(`(() => {
      const c = ${CHART}, r = c.getBoundingClientRect();
      const n = [...c.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      return { x: r.x, y: r.y, w: r.width, h: r.height,
               nowX: n ? +n.getAttribute("x1") : null };
    })()`);
    const px = g.x + g.nowX + (g.w - g.nowX) * 0.45;
    const py = g.y + g.h * 0.45;
    await page.mouse.click(px, py);
    await page.waitForTimeout(220);
    await page.mouse.click(px, py);
    await page.waitForTimeout(900);
    const made = await page.evaluate(shape);
    const bandBefore = await page.evaluate(`(() => {
      const c = (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || [])[0];
      return c ? c.hi - c.lo : null;
    })()`);
    check(made && made.drift < 1.5, "a call is made on the hour's lattice",
      made ? `${made.drift.toFixed(1)}px off` : "no box drawn");

    const period = async (label) => {
      await page.evaluate(`(() => {
        const b = [...document.querySelectorAll("button")]
          .find((e) => e.textContent.trim() === ${JSON.stringify(label)});
        if (b) b.click();
      })()`);
      await page.waitForTimeout(1400);
    };
    visit = 1;
    await period("1Y");
    /* Long enough away that the hour is fetched again rather than answered
     * out of the 30-second cache — which is the whole scenario: the range you
     * come back to is not the range you left. */
    await page.clock.fastForward(45_000);
    await page.waitForTimeout(1200);
    visit = 2;
    await period("1H");
    await page.waitForTimeout(1800);

    const back = await page.evaluate(shape);
    check(back && back.drift < 1.5,
      "and is still on it after a look at the year",
      back ? `${back.drift.toFixed(1)}px off` : "no box drawn");
    /* A whole number of squares, and the same band of price.
     *
     * Not "exactly one square". The square is sized by what the price does in
     * one square's worth of time, so a market that quietens re-steps it — and
     * a call made when a square was $100 is then two $50 squares tall. That is
     * the honest outcome: the *ruler* changed, the claim did not. What must
     * hold is that the box still lands on whole gridlines (checked above as
     * drift) and still names the band it was made on. */
    const whole = (s) =>
      s &&
      Math.abs(s.cells.w - Math.round(s.cells.w)) < 0.06 &&
      Math.abs(s.cells.h - Math.round(s.cells.h)) < 0.06 &&
      // …and at least one, with the tolerance: a box measured at 0.9999999
      // squares is one square, not a collapsed one
      s.cells.h > 0.94;
    check(whole(made) && whole(back),
      "and is still a whole number of squares",
      made && back
        ? `${made.cells.w.toFixed(4)}×${made.cells.h.toFixed(4)} → ` +
          `${back.cells.w.toFixed(4)}×${back.cells.h.toFixed(4)} squares`
        : "n/a");
    const band = await page.evaluate(`(() => {
      const c = (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || [])[0];
      return c ? c.hi - c.lo : null;
    })()`);
    check(band && bandBefore && Math.abs(band - bandBefore) < 1e-6,
      "and the band it claims has not moved",
      `${bandBefore} → ${band}`);
    await ctx.close();
  }

  // ── 18. calls do not reach into the grid's setting ─────────────────────
  // Reported: turn calls on and the Chart Grid switch in Settings is on too —
  // and turning calls off again does not put it back. Calls used to write
  // `chartGrid` when they were switched on, which was needed while the squares
  // depended on the grid being drawn and stopped being needed the moment
  // `updateGrid` began drawing on `predict` alone. What was left was one
  // switch silently rewriting another, persisted, in every tab, for a choice
  // nobody made — and nothing recording what it had been.
  {
    const { ctx, page } = await newCtx(browser, 0.3, null, 2000, () => PRICES, false, false);
    const gridKey = () => page.evaluate(() => localStorage.getItem("crypto_chart_grid"));
    const mesh = `(() => {
      const chart = ${CHART};
      return [...chart.querySelectorAll("line")].filter(${VIS})
        .filter((l) => Math.abs(+l.getAttribute("x1") - +l.getAttribute("x2")) < 0.01
                       && !l.getAttribute("stroke-dasharray")).length;
    })()`;

    check((await gridKey()) === "false", "the grid setting starts off", `${await gridKey()}`);
    /* …and the game is still visible, which is the whole reason the coupling
     * can go: with calls on the mesh is the board, so it is drawn either way. */
    const lines = await page.evaluate(mesh);
    check(lines > 2, "the board is drawn with the grid setting off", `${lines} columns`);

    // Off and on again through the shortcut — the setting must not move
    await page.keyboard.press("l");
    await page.waitForTimeout(500);
    await page.keyboard.press("l");
    await page.waitForTimeout(900);
    check(
      (await gridKey()) === "false",
      "turning calls off and on leaves it off",
      `${await gridKey()}`,
    );
    const after = await page.evaluate(mesh);
    check(after > 2, "and the board came back with them", `${after} columns`);

    // A call can still be placed on it — an invisible game would fail here
    const g = await page.evaluate(`(() => {
      const c = ${CHART}, r = c.getBoundingClientRect();
      const n = [...c.querySelectorAll("line")].filter(${VIS})
        .find((l) => l.getAttribute("stroke-dasharray") === "2 3");
      return { x: r.x, y: r.y, w: r.width, h: r.height,
               nowX: n ? +n.getAttribute("x1") : null };
    })()`);
    const px = g.x + g.nowX + (g.w - g.nowX) * 0.4;
    const py = g.y + g.h * 0.45;
    await page.mouse.click(px, py);
    await page.waitForTimeout(220);
    await page.mouse.click(px, py);
    await page.waitForTimeout(900);
    const stored = await page.evaluate(() => {
      try {
        return (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || [])
          .length;
      } catch { return -1; }
    });
    check(stored === 1, "and a square on it can be called", `${stored} stored`);
    await ctx.close();
  }

  // ── 19. the tab can say what it is ─────────────────────────────────────
  // A tally of "0 open" says nothing about what an open call is, and the key
  // that gets you here is written down in an overlay you are not looking at.
  // One ring in the corner of the head answers both, for whichever tab is up.
  {
    const { ctx, page } = await newCtx(browser, 0.3);
    await page.keyboard.press("a");
    await page.waitForTimeout(600);

    const card = `(() => {
      const p = [...document.querySelectorAll("p")]
        .find((e) => /target is a request|call is a claim/.test(e.textContent));
      if (!p) return null;
      const box = p.parentElement;
      return {
        text: box.textContent,
        keys: [...box.querySelectorAll("kbd")].map((k) => k.textContent),
      };
    })()`;
    const press = async () => {
      await page.evaluate(`(() => {
        const b = [...document.querySelectorAll("button")]
          .find((e) => e.getAttribute("aria-label") === "About this panel");
        if (b) b.click();
      })()`);
      await page.waitForTimeout(400);
    };

    check((await page.evaluate(card)) === null, "the panel opens without it");
    await press();
    const targets = await page.evaluate(card);
    check(
      targets && /tell me when/.test(targets.text),
      "the ring says what a target is",
      targets ? targets.text.slice(0, 40) : "no card",
    );
    check(
      targets && targets.keys.includes("A") && targets.keys.includes("Esc"),
      "…and which keys reach it",
      targets ? targets.keys.join(",") : "none",
    );

    /* It follows the panel rather than being remembered per panel: you asked
     * "what is this", and the two lists are two different things. They were
     * tabs in one card; each has its own corner control and its own key now,
     * so the way across is the key, not a tab. */
    /* Esc first, because the targets panel puts the caret in its own box on
     * open and the app's shortcut handler stands down inside a text field —
     * so "k" typed there is a letter, not a key. That is the same rule "a"
     * has always followed; the way between the two lists is from the chart. */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.keyboard.press("k");
    await page.waitForTimeout(450);
    await press();
    const calls = await page.evaluate(card);
    check(
      calls && /I say where/.test(calls.text),
      "K opens calls, and it explains calls instead",
      calls ? calls.text.slice(0, 40) : "no card",
    );
    check(
      calls && calls.keys.includes("K") && calls.keys.includes("L"),
      "…with the key that opens it and the key that turns them on",
      calls ? calls.keys.join(",") : "none",
    );
    // Live state, not a help page: the board it is describing is switched on
    check(
      calls && /On ·/.test(calls.text),
      "and says where things stand right now",
      calls ? (calls.text.match(/On ·[^·]*·[^A-Z]*/) || ["no state"])[0] : "none",
    );

    await press();
    check((await page.evaluate(card)) === null, "the ring puts it away again");
    await ctx.close();
  }

  // ── 20. the "now" line is a slider, and works like one ─────────────────
  /* It is the only control for how far ahead you can call, and it used to be
   * an 18×20 tab at 55% opacity whose two chevrons closed into a diamond at
   * that size — plus no keyboard path at all, since the stepper that once set
   * this was removed when the drag replaced it. */
  {
    const { ctx, page } = await newCtx(browser, 0.3);
    const grip = `document.querySelector(".pt-now-grip")`;
    const read = () => page.evaluate(`(() => {
      const g = ${grip};
      if (!g) return null;
      const r = g.getBoundingClientRect();
      return {
        role: g.getAttribute("role"),
        tabindex: g.getAttribute("tabindex"),
        now: +g.getAttribute("aria-valuenow"),
        min: +g.getAttribute("aria-valuemin"),
        max: +g.getAttribute("aria-valuemax"),
        text: g.getAttribute("aria-valuetext") || "",
        w: Math.round(r.width),
        h: Math.round(r.height),
        opacity: +getComputedStyle(g).opacity,
        share: Number(localStorage.getItem("crypto_chart_future_share")),
      };
    })()`);

    const at = await read();
    check(at && at.role === "slider" && at.tabindex === "0",
      "the handle is a slider and can be focused", JSON.stringify(at));
    check(at && at.w >= 24 && at.h >= 20,
      "…big enough to aim at", at ? `${at.w}×${at.h}` : "none");
    check(at && at.opacity >= 0.7,
      "…and visible at rest", at ? String(at.opacity) : "none");
    check(at && at.min < at.now && at.now < at.max && /square/.test(at.text),
      "…reporting its value in squares of board", at ? at.text : "none");

    // The arrows move it, and the value and the stored share move together
    await page.evaluate(`(() => ${grip}.focus())()`);
    await page.waitForTimeout(250);
    const before = await read();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(450);
    const wider = await read();
    check(wider.now === before.now + 1 && wider.share > before.share,
      "the right arrow buys a square of board",
      `${before.now}→${wider.now} squares, share ${before.share.toFixed(2)}→${wider.share.toFixed(2)}`);
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(450);
    check((await read()).now === before.now, "and the left arrow gives it back");

    await page.keyboard.press("End");
    await page.waitForTimeout(450);
    const end = await read();
    check(end.now === end.max, "End goes to the far edge", `${end.now} of ${end.max}`);
    await page.keyboard.press("Home");
    await page.waitForTimeout(450);
    const home = await read();
    check(home.now === home.min, "Home comes back to the near one",
      `${home.now} of ${home.min}`);

    /* The chart's own arrows walk the coin list. While the handle has focus
     * they belong to it — moving the coin out from under the board you are
     * sizing would be the wrong answer to the same key. */
    const coin = `(() => {
      const t = [...document.querySelectorAll("div")].filter((d) => d.children.length === 0)
        .map((d) => d.textContent.trim()).find((s) => /^[A-Za-z0-9]{2,6} Price$/.test(s));
      return t || null;
    })()`;
    check((await page.evaluate(coin)) === "BTC Price",
      "and the coin did not change under it", await page.evaluate(coin));

    /* Reaching for the handle stops the chart offering a price readout: the
     * pointer is on a control, not on a square. The readout used to cover the
     * label the handle was trying to show. */
    const g = await page.evaluate(`(() => {
      const r = ${grip}.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await page.mouse.move(g.x, g.y);
    await page.waitForTimeout(400);
    const onHandle = await page.evaluate(`(() => {
      const texts = [...${CHART}.querySelectorAll("text")]
        .filter(${VIS}).map((t) => t.textContent);
      return {
        ahead: texts.some((t) => /ahead$/.test(t)),
        readout: texts.some((t) => / – /.test(t)),
      };
    })()`);
    check(onHandle.ahead, "hovering it says how far ahead the board reaches");
    check(!onHandle.readout, "…and the crosshair stands out of the way");
    await ctx.close();
  }

  // ── 21. the first call in a contested column outranks the rest ─────────
  /* Several calls can share a column — same minutes, different bands — and
   * they are not equal: the first one placed is the claim and the others are
   * hedges around it. The mark appears only where the column is contested,
   * because a mark every lone call carries says nothing about being first. */
  {
    /* This block builds its calls from its *own* `Date.now()`, and it has to
     * hand the chart a price series anchored to the same instant.
     *
     * It used to take the module-level `PRICES`, whose timestamps are fixed
     * when the file is loaded. The calls therefore sat `suite runtime` further
     * into the future than the series knew about, and the board's reach is
     * finite — so as the suite grew, the seeded calls drifted off the
     * right-hand edge and stopped being drawn. It failed as three boxes, then
     * two, then none, on unchanged product code, and passed every time the
     * block was run on its own. A fixture that depends on how long the suite
     * takes is a fixture that reports on the suite, not on the chart. */
    const T = Date.now();
    const T_S = Math.floor(T / 1000);
    const seriesAtT = Array.from({ length: 120 }, (_, i) => ({
      price: (43000 + i * 4 + Math.sin(i / 7) * 160).toFixed(2),
      time: T_S - (120 - i) * 30,
    }));
    const shared = JSON.stringify({
      record: { hits: 0, total: 0, streak: 0, best: 0 },
      done: [],
      open: [
        { id: "first", coin: "BTC", currency: "USD", period: "hour",
          target: T + 6e5, span: 18e4, lo: 43300, hi: 43350, placed: T - 9e5, col: 2 },
        { id: "later", coin: "BTC", currency: "USD", period: "hour",
          target: T + 6e5, span: 18e4, lo: 43400, hi: 43450, placed: T - 3e5, col: 2 },
        { id: "alone", coin: "BTC", currency: "USD", period: "hour",
          target: T + 9e5, span: 18e4, lo: 43350, hi: 43400, placed: T - 6e5, col: 3 },
      ],
    });
    const { ctx, page } = await newCtx(browser, 0.42, shared, 2000, () => seriesAtT);
    const drawn = await page.evaluate(`(() => {
      const c = ${CHART};
      const boxes = [...c.querySelectorAll("rect")].filter(${VIS})
        .filter((e) => +e.getAttribute("width") > 8 && +e.getAttribute("height") > 4
                       && e.getAttribute("stroke-width"))
        .map((e) => ({ y: Math.round(+e.getAttribute("y")),
                       sw: +e.getAttribute("stroke-width"),
                       fill: +e.getAttribute("fill-opacity"),
                       stroke: +e.getAttribute("stroke-opacity") }))
        .sort((a, b) => a.y - b.y);
      const marks = [...c.querySelectorAll("rect")].filter(${VIS})
        .filter((e) => e.getAttribute("width") === "3")
        .map((e) => ({ y: Math.round(+e.getAttribute("y")),
                       h: Math.round(+e.getAttribute("height")) }));
      const tags = [...c.querySelectorAll("text")].filter(${VIS})
        .map((t) => t.textContent).filter((t) => /CALLED/.test(t));
      return { boxes, marks, tags };
    })()`);

    check(drawn.boxes.length === 3, "all three calls are drawn",
      `${drawn.boxes.length}`);
    /* One mark, on one box: the earliest of the two that share a column. The
     * lone call in the next column gets none. */
    check(drawn.marks.length === 1, "exactly one leading-edge mark",
      `${drawn.marks.length}`);
    const marked = drawn.boxes.find((b) => drawn.marks.some((m) => m.y === b.y));
    check(Boolean(marked), "…and it sits on a call's own edge");
    check(marked && marked.sw > 1, "the first call is drawn heavier",
      marked ? `stroke-width ${marked.sw}` : "none");
    const hedge = drawn.boxes.find((b) => b !== marked && b.stroke < 0.5);
    check(Boolean(hedge), "…and the one that followed it steps back",
      JSON.stringify(drawn.boxes.map((b) => b.stroke)));
    const lone = drawn.boxes.find((b) => b !== marked && b !== hedge);
    check(lone && lone.stroke > 0.5 && lone.sw === 1,
      "a call alone in its column is drawn as it always was",
      lone ? JSON.stringify(lone) : "none");
    /* The bar is invisible to anything that is not a pair of eyes, so the tag
     * says it too. */
    check(drawn.tags.filter((t) => /1ST/.test(t)).length === 1,
      "and one tag says which is first", drawn.tags.join(" | "));
    await ctx.close();
  }

  // ── 22. the board's reach can be zoomed ────────────────────────────────
  /* One square size cannot serve both calls. Sized to what the price usually
   * does, the board reaches about three squares either side of the price — so
   * the call an hour chart most invites, "it falls off a cliff", has nothing
   * to point at. Zoom is the answer, and it has to actually move the scale. */
  {
    const { ctx, page } = await newCtx(browser, 0.3);
    const board = () => page.evaluate(`(() => {
      const c = ${CHART};
      /* The price gutter only. Filtering on x alone also catches the time axis
       * whenever a column boundary lands in the left few pixels — and
       * "Aug 17, 11:05 PM" parses as a number in the billions. The boundaries
       * sit on round clock instants, so whether one lands there depends on the
       * time of day the suite runs at: it passed alone and failed in the full
       * run. The two rows are unambiguous by height. */
      const h = c.getBoundingClientRect().height;
      const labels = [...c.querySelectorAll("text")].filter(${VIS})
        .filter((t) => +t.getAttribute("x") < 30 && +t.getAttribute("y") < h - 12
                       && /\\d/.test(t.textContent))
        .map((t) => t.textContent);
      const num = (s) => {
        const m = /([\\d.,]+)\\s*([KMB]?)/.exec(s.replace(/[^\\d.,KMB]/g, ""));
        return m ? parseFloat(m[1].replace(/,/g, "")) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1) : null;
      };
      const vals = labels.map(num).filter((v) => v != null).sort((a, b) => a - b);
      return {
        step: vals.length > 1 ? vals[1] - vals[0] : null,
        covers: vals.length > 1 ? vals[vals.length - 1] - vals[0] : null,
        zoom: localStorage.getItem("crypto_chart_board_zoom_hour"),
        dot: (() => {
          const d = c.querySelector(".pt-live-dot");
          return d ? +d.getAttribute("cy") : null;
        })(),
        h,
      };
    })()`);

    const start = await board();
    check(start.step > 0, "the board starts at a square worth something",
      `$${start.step}`);

    await page.keyboard.press("[");
    await page.waitForTimeout(650);
    const out = await board();
    check(out.step > start.step && out.covers > start.covers,
      "zooming out makes each square worth more and the board reach further",
      `$${start.step}/$${start.covers} → $${out.step}/$${out.covers}`);
    check(out.zoom === "2", "…and the notch is remembered", String(out.zoom));

    await page.keyboard.press("]");
    await page.waitForTimeout(650);
    const back = await board();
    check(back.step === start.step,
      "zooming back in returns the square it started at",
      `$${start.step} → $${back.step}`);

    /* Out to the far end and the price is still on screen — a board whose
     * current price has scrolled off is one you cannot bet against. */
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("[");
      await page.waitForTimeout(400);
    }
    const far = await board();
    check(far.covers > start.covers * 4,
      "the far end reaches far enough to call a big move",
      `$${start.covers} → $${far.covers}`);
    check(far.dot > 0 && far.dot < far.h,
      "and the live price is still on the chart",
      `y ${Math.round(far.dot)} of ${Math.round(far.h)}`);
    /* The ladder ends rather than running on — a zoom you cannot get back from
     * is a trap. */
    const atEnd = far.zoom;
    await page.keyboard.press("[");
    await page.waitForTimeout(400);
    check((await board()).zoom === atEnd, "the ladder stops at its end",
      `${atEnd} → ${(await board()).zoom}`);

    // The wheel is the same gesture it is everywhere else
    await page.mouse.move(400, 500);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(650);
    check((await board()).zoom !== atEnd, "the wheel zooms too",
      `${atEnd} → ${(await board()).zoom}`);

    /* And the reason anyone knows any of this is possible: a control on the
     * board itself. The wheel worked in silence, the two keys are in a list
     * nobody has open while they are calling, and the panel is another
     * overlay — so "can I reach further?" was answerable only by people who
     * already knew. */
    const ui = () => page.evaluate(`(() => {
      const z = document.querySelector(".pt-zoom");
      if (!z) return null;
      const r = z.getBoundingClientRect();
      const chart = ${CHART}.getBoundingClientRect();
      return {
        text: [...z.querySelectorAll("text")].map((t) => t.textContent).join(" "),
        buttons: [...z.querySelectorAll(".pt-zoom-btn")].map((b) => ({
          label: b.getAttribute("aria-label") || "",
          tab: b.getAttribute("tabindex"),
          off: b.getAttribute("aria-disabled") === "true",
        })),
        opacity: +getComputedStyle(z).opacity,
        onBoard: r.x > chart.x + chart.width / 2,
        box: { x: r.x, y: r.y, w: r.width, h: r.height },
      };
    })()`);
    const control = await ui();
    check(Boolean(control), "the board carries its own zoom control");
    check(control && control.buttons.length === 2 &&
      control.buttons.every((b) => b.tab === "0" && /zoom/i.test(b.label)),
      "…two named buttons, both reachable by keyboard",
      control ? JSON.stringify(control.buttons) : "none");
    /* It says what the board covers — the number that decides whether the call
     * you have in mind has a square at all. */
    check(control && /±/.test(control.text),
      "…and says how far the board reaches in price", control && control.text);
    check(control && control.opacity < 0.6,
      "quiet at rest", control && String(control.opacity));
    check(control && control.onBoard,
      "…and sits on the board it governs");

    await page.mouse.move(control.box.x + control.box.w / 2, control.box.y + control.box.h / 2);
    await page.waitForTimeout(350);
    check((await ui()).opacity > 0.9, "full under the pointer",
      String((await ui()).opacity));

    // Pressing it does what the key does
    const beforeClick = (await board()).zoom;
    await page.mouse.click(control.box.x + 9, control.box.y + control.box.h / 2);
    await page.waitForTimeout(650);
    check((await board()).zoom !== beforeClick, "and pressing one zooms",
      `${beforeClick} → ${(await board()).zoom}`);
    await ctx.close();
  }

  // ── 23. the top of the board arrives rather than being sliced ──────────
  /* The lattice used to stop dead at the chart's top edge: a hard line of
   * cut-off squares directly under the range switcher. It fades now — and the
   * row being faded is not one you can call, because a square you can barely
   * see is not a square anyone can point at. */
  {
    const { ctx, page } = await newCtx(browser, 0.3);
    const state = await page.evaluate(`(() => {
      const c = ${CHART};
      const box = c.getBoundingClientRect();
      const mesh = c.querySelector("g[mask]");
      const grip = c.querySelector(".pt-now-grip");
      const zoom = c.querySelector(".pt-zoom");
      const ramp = [...c.querySelectorAll("stop")]
        .filter((s) => s.getAttribute("stop-color") === "#fff");
      return {
        top: box.y,
        h: box.height,
        meshMasked: Boolean(mesh) && mesh.querySelectorAll("line").length > 4,
        // The two controls live where the fade is strongest — masked with the
        // lattice they would be the ones you cannot see
        gripMasked: grip ? Boolean(grip.closest("g[mask]")) : null,
        zoomMasked: zoom ? Boolean(zoom.closest("g[mask]")) : null,
        stops: ramp.map((s) => s.getAttribute("stop-opacity")),
        endsAt: (() => {
          const full = ramp.find((s) => s.getAttribute("stop-opacity") === "1");
          return full ? parseFloat(full.getAttribute("offset")) : null;
        })(),
      };
    })()`);
    check(state.meshMasked, "the mesh is drawn through a fade");
    /* A ramp, not a step: per-row opacity was tried and every boundary between
     * two rows became a seam, which is the thing the fade exists to remove. */
    check(state.stops.includes("0") && state.stops.includes("1"),
      "…a continuous ramp from nothing to full", state.stops.join(","));
    check(state.gripMasked === false && state.zoomMasked === false,
      "the board's own controls are not faded with it",
      `grip ${state.gripMasked}, zoom ${state.zoomMasked}`);
    /* Gone well before the range switcher above the chart — that is the whole
     * complaint: the mesh must not run into the furniture. */
    check(state.endsAt > 2 && state.endsAt < 40,
      "and it finishes inside the top third of the chart",
      `${state.endsAt}%`);

    const offers = async (dy) => {
      await page.mouse.move(state.top ? 1100 : 1100, state.top + dy);
      await page.waitForTimeout(320);
      return page.evaluate(`(() => {
        const t = [...${CHART}.querySelectorAll("text")]
          .find((e) => e.textContent === "CALL IT");
        return t ? t.getAttribute("visibility") === "visible" : false;
      })()`);
    };
    check((await offers(8)) === false,
      "the faded row is not offered as a call");
    check((await offers(state.h * 0.5)) === true,
      "…while the board below it still is");
    await ctx.close();
  }

  // ── 25. the board fills the chart, and every callable square is whole ───
  /* The lattice used to be laid out inside the line chart's own 24px inset.
   * `base` is a whole multiple of the step, so the lowest gridline landed on
   * `height - PADDING` and what was left underneath was a strip with vertical
   * lines running through it and no horizontal one to close them — measured at
   * 1280x800, the mesh stopped at y=471 on a 495px chart. Two things followed
   * and both were wrong in the same way: the bottom square of the board was
   * never a square, and it was callable anyway, so a call could be locked on a
   * box whose lower half had never been drawn. Meanwhile the fade at the top
   * was a whole pitch tall while the sliced row it was there for was 19px, so
   * it swallowed the first *complete* square — drawn in full, in the middle of
   * the board, and quietly refusing to be called.
   *
   * One rule now, applied at both ends: a square you can see whole is a square
   * you can point at.
   */
  {
    const { ctx, page } = await newCtx(browser, 0.3);
    const geo = await page.evaluate(`(() => {
      const c = ${CHART}, r = c.getBoundingClientRect();
      const vis = ${VIS};
      // Full-width only, for the reason given in the readout block: the
      // zoom pill's underline is a horizontal line too, and is not a gridline
      const rows = [...new Set([...c.querySelectorAll("line")].filter(vis)
        .filter((l) => Math.abs(+l.getAttribute("y1") - +l.getAttribute("y2")) < 0.5)
        .filter((l) => Math.abs(+l.getAttribute("x2") - +l.getAttribute("x1")) > r.width * 0.9)
        .map((l) => +l.getAttribute("y1")))].sort((a, b) => a - b);
      return { top: r.y, h: r.height, rows };
    })()`);
    const last = geo.rows[geo.rows.length - 1];
    check(Math.abs(last - geo.h) < 1.5,
      "the lowest gridline is the foot of the chart",
      `line at ${last.toFixed(1)} of ${geo.h.toFixed(1)}`);

    const offers = async (y) => {
      await page.mouse.move(1100, geo.top + y);
      await page.waitForTimeout(320);
      return page.evaluate(`(() => {
        const t = [...${CHART}.querySelectorAll("text")]
          .find((e) => e.textContent === "CALL IT");
        return t ? t.getAttribute("visibility") === "visible" : false;
      })()`);
    };
    /* The lattice counted up from the foot, not read off `rows[0]` — the
     * chart draws a line at y=0 of its own, and a lattice line only lands
     * there by coincidence. */
    const pitch = last - geo.rows[geo.rows.length - 2];
    let topWhole = last;
    while (topWhole - pitch >= -0.5) topWhole -= pitch;
    // The first square the chart draws in full: it starts at that line, which
    // is where the fade now finishes rather than a full pitch further down
    const firstWhole = topWhole + pitch / 2;
    check((await offers(firstWhole)) === true,
      "the topmost whole square is callable",
      `y ${firstWhole.toFixed(1)}`);
    // …and the last one, which reaches the very bottom edge
    const lastWhole = last - pitch / 2;
    check((await offers(lastWhole)) === true,
      "so is the one against the bottom edge",
      `y ${lastWhole.toFixed(1)}`);
    await ctx.close();
  }

  // ── 26. a call is judged whether or not you are still playing ──────────
  /* Settling used to be gated on the feature being on, so a week with calls
   * switched off left every open call frozen mid-flight — and when they were
   * switched back on, the ones whose moment had scrolled off the start of the
   * range came back "expired" and were dropped without ever being judged. A
   * call is a claim someone already made; whether they are still looking at
   * the board does not change whether it came true.
   *
   * What being off does change is that nothing is *announced*: no toast, and
   * the win is shown on the chart instead. That is the whole of the
   * difference, and both halves are checked here.
   */
  {
    const at = (secAgo) => {
      const t = NOW_S - secAgo;
      let best = PRICES[0];
      for (const p of PRICES) {
        if (Math.abs(p.time - t) < Math.abs(best.time - t)) best = p;
      }
      return +best.price;
    };
    const hitPrice = at(12 * 60);
    const seeded = JSON.stringify({
      record: { hits: 1, total: 2, streak: 1, best: 1 },
      done: [],
      open: [{
        id: "quiet-win", coin: "BTC", currency: "USD", period: "hour",
        target: T - 12 * 60e3, span: 6 * 60e3,
        lo: hitPrice - 60, hi: hitPrice + 60, col: 1,
        placed: T - 40 * 60e3, placedPrice: 43100,
      }],
    });
    const { ctx, page } = await newCtx(
      browser, 0.23, seeded, 2500, () => PRICES, false, true, false,
    );
    const stored = await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}");
      return { open: (c.open || []).length, done: (c.done || []).length,
               result: ((c.done || [])[0] || {}).result,
               stamped: isFinite(((c.done || [])[0] || {}).settledAt) };
    });
    check(stored.open === 0 && stored.done === 1 && stored.result === "hit",
      "a due call settles with the feature switched off",
      JSON.stringify(stored));
    check(stored.stamped,
      "…and records when the answer was found, which is what the unseen mark reads");

    // Nothing is pushed at someone who has put the game down
    const announced = await page.evaluate(`(() => [...document.querySelectorAll("*")]
      .some((e) => e.children.length === 0 && /Called it/i.test(e.textContent || "")))()`);
    check(announced === false, "and nothing is announced while it is off");

    /* The one thing that does happen: the big celebration, because with the
     * board undrawn it is the only thing that can say a call came home. */
    const sparks = await page.evaluate(`${CHART}.querySelectorAll(".pt-burst line").length`);
    check(sparks === 0, "the show has finished and cleaned up after itself",
      `${sparks} left behind`);
    await ctx.close();
  }

  // ── 27. the board's readout is also the way back to the default reach ──
  /* The zoom is held per range and outlives the tab, so a board left several
   * notches out is still out a week later — and counting clicks back is
   * guesswork, because nothing on the strip said which notch was the ordinary
   * one. Pressing the number returns it. It is a control only while it leads
   * somewhere: at the default it carries no role, no focus stop and no rule
   * under it, because a button that cannot change anything is a promise the
   * next click breaks. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (u.includes("historic")) return r.fulfill(json({ data: { prices: PRICES } }));
      if (u.includes("spot"))
        return r.fulfill(json({ data: { amount: "43480.00", currency: "USD" } }));
      return r.fulfill(json({ data: {} }));
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("crypto_chart_predict", "true");
      localStorage.setItem("crypto_chart_future_share", "0.3");
      localStorage.setItem("crypto_chart_onboarding_seen", "1");
      // As a board comes back after being pushed out and left
      localStorage.setItem("crypto_chart_board_zoom_hour", "8");
    });
    const page = await ctx.newPage();
    await page.goto(INDEX, { waitUntil: "load" });
    await page.waitForSelector("svg path", { timeout: 20000 });
    await page.waitForTimeout(2200);

    const READ = `(() => {
      const g = document.querySelector(".pt-zoom-home");
      if (!g) return null;
      // The rule is a one-pixel rect, deliberately not a line: on this chart
      // a line is the lattice, and a decorative one corrupts every reader
      // that derives the pitch from consecutive gridlines
      const rule = g.querySelector('rect[height="1"]');
      return {
        role: g.getAttribute("role"),
        tabbable: g.getAttribute("tabindex") === "0",
        named: Boolean(g.getAttribute("aria-label")),
        rule: rule ? Number(rule.getAttribute("opacity")) : null,
        text: (g.querySelector("text") || {}).textContent || null,
        zoom: localStorage.getItem("crypto_chart_board_zoom_hour"),
      };
    })()`;
    const out = await page.evaluate(READ);
    check(out && out.role === "button" && out.tabbable && out.named,
      "off the default, the readout offers itself as a control",
      JSON.stringify(out));
    check(out && out.rule > 0, "…and is underlined to say so", out ? String(out.rule) : "none");

    await page.evaluate(`document.querySelector(".pt-zoom-home")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }))`);
    await page.waitForTimeout(1500);
    const back = await page.evaluate(READ);
    check(back && back.zoom === "1", "pressing it returns the default reach",
      back ? `zoom ${back.zoom}` : "none");
    check(back && back.text !== out.text, "…and the reach it reports changes with it",
      back && out ? `${out.text} → ${back.text}` : "n/a");
    /* Standing down matters as much as working: an inert control that still
     * looks live is the thing this test exists to prevent. */
    check(back && !back.role && !back.tabbable && !back.named && back.rule === 0,
      "at the default it stops being a control at all",
      JSON.stringify(back));
    await ctx.close();
  }

  await browser.close();
  if (failed) {
    console.error(`\n✘ ${failed} CALLS RENDER CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log("ALL CALLS RENDER TESTS PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
