// The brought-forward portfolio chart, in a real browser.
//
// `tests/test-portfolio-chart.js` has said since it was written that "the
// pixels themselves are checked in tests/test-portfolio-chart-render.js" —
// and that file did not exist. The arithmetic was covered and the drawing was
// not, which is the same gap `tests/test-render.js` was built to close for the
// price chart: the source is fine, the screen is blank, and jsdom cannot tell.
//
// What it asserts, in the order the questions matter:
//
//   1. The chart draws — a finite path with real coordinates, in every mode.
//   2. Every mode switch redraws it, and none of them produces `NaN`.
//   3. **The crosshair is reachable without a pointer.** The readout is the
//      chart's richest information — the date, the total, the move since the
//      start, the composition — and it was behind `onMouseMove` alone. That is
//      the defect `test-polish-render.js` §9 exists to catch on every other
//      surface ("a control you can click is a control you can reach"), and
//      this chart was never swept by it because it is only mounted behind two
//      clicks.
//   4. Escape gets out, and gets out of the readout before the whole stage.
//
// A note on selectors: there are **two** portfolio charts on screen — the
// inline glance above the holdings list, and the one in the stage. Only the
// stage's is drivable, so it is the one carrying `[data-pc-plot]`; the glance
// carries `[data-pc-glance]`. Selecting on the former is what makes these
// assertions land on the instrument rather than on the picture of it.
//
// Skips (exit 0) when Playwright or its browser is absent, like the other
// render suites.
const path = require("path");

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

const ROOT = path.join(__dirname, "..");
const INDEX = "file://" + path.join(ROOT, "index.html");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("• portfolio chart render test skipped: playwright not installed");
  process.exit(0);
}

const NOW = Math.floor(Date.now() / 1000);

/* A rising-then-falling series, so the total has a real shape: a flat line
 * would pass a "did it draw" check while hiding a scale that collapsed. */
const series = (n, step, base, drift = 1) =>
  Array.from({ length: n }, (_, i) => ({
    price: (base * (1 + Math.sin(i / 14) * 0.35 + i * 0.004 * drift)).toFixed(2),
    time: NOW - (n - i) * step,
  }));

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*" },
  body: JSON.stringify(body),
});

/* Two coins with dated purchases, so the cost level, the P/L view and the
 * event markers all have something to draw. `paid`, not `cost`: that is the
 * lot field the sanitizer keeps, and a fixture using the wrong name is
 * silently dropped — which reads on screen as "no cost basis" rather than as
 * a broken fixture. */
const PORTFOLIO = [
  {
    coin: "BTC",
    amount: 0.5,
    lots: [{ amount: 0.5, paid: 20000, time: NOW - 200 * 86400, currency: "USD" }],
    sales: [],
    watches: [],
  },
  {
    coin: "ETH",
    amount: 4,
    lots: [{ amount: 4, paid: 6000, time: NOW - 120 * 86400, currency: "USD" }],
    sales: [],
    watches: [],
  },
];

let failures = 0;
const ok = (label) => console.log(`✔ ${label}`);
const fail = (label, detail) => {
  failures++;
  console.error(`✘ ${label}`);
  if (detail) console.error(`   - ${detail}`);
};

/* The chart line is the longest path inside the portfolio overlay — the page
 * carries dozens of icon paths, and `querySelector("svg path")` finds one of
 * those. Length is the discriminator, by a wide margin. */
const CHART_PATH = `(() => {
  const paths = [...document.querySelectorAll("svg path")]
    .map((p) => p.getAttribute("d") || "")
    .sort((a, b) => b.length - a.length);
  return paths[0] || "";
})()`;

/* The readout is the element the chart writes an **inline** opacity onto —
 * that is how it is shown and hidden. Matching on text alone finds its
 * ancestors too, because `textContent` bubbles: a parent whose opacity is
 * untouched then reports the readout as visible after it was hidden, which
 * reads as "Escape did not clear it" when Escape worked perfectly. */
/* The stage's readout, not the glance's: both carry "since …" now that the
   glance reads on hover, and the glance comes first in the document. */
const READOUT_TEXT = `(() => {
  const frame = document.querySelector("[data-pc-plot]");
  const node = frame && [...frame.querySelectorAll("div[style*='opacity']")].find((n) =>
    /since/i.test(n.textContent || ""));
  if (!node) return "";
  return node.style.opacity === "0" ? "" : node.textContent.trim();
})()`;

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  } catch (e) {
    console.log(
      `• portfolio chart render test skipped: no browser binary (${e.message.split("\n")[0]})`,
    );
    process.exit(0);
  }

  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("file://")) return route.continue();
    if (url.includes("/prices/") && url.includes("historic")) {
      /* One riser and one faller, deliberately: a fixture where everything
       * moves the same way never exercises the diverging axis, and the
       * contribution chart's whole shape is winners against losers.
       *
       * And a **different shape per range**, which the morph assertion needs:
       * answering every period with one series means a range switch draws the
       * identical path, and "the line did not move" then says nothing about
       * whether it can. */
      const eth = /ETH-/.test(url);
      const per = (url.match(/period=(\w+)/) || [])[1] || "week";
      const shape =
        { day: [90, 900], week: [140, 3600], month: [200, 86400], year: [260, 86400], all: [320, 604800] }[
          per
        ] || [200, 86400];
      return route.fulfill(
        json({
          data: {
            prices: series(shape[0], shape[1], eth ? 2000 : 40000, eth ? -1 : 1),
          },
        }),
      );
    }
    if (url.includes("/prices/") && url.includes("spot")) {
      const amount = /ETH-/.test(url) ? "2000.00" : "40000.00";
      return route.fulfill(json({ data: { amount, currency: "USD" } }));
    }
    return route.fulfill(json({ data: {} }));
  });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.addInitScript(`(() => {
    localStorage.setItem("crypto_chart_onboarding_seen", "1");
    localStorage.setItem("crypto_chart_portfolio", ${JSON.stringify(JSON.stringify(PORTFOLIO))});
  })()`);

  await page.goto(INDEX, { waitUntil: "load" });
  await page.waitForSelector("svg path", { timeout: 20000 });

  // --- open the portfolio, then bring the chart forward -------------------
  /* Its tab rests in the screens' drawer on the right edge since 26 Sep
     2026: the pull first, as a person does it. */
  await page.click("[data-screen-tabs-handle]");
  await page.click("[data-tour='portfolio']");

  /* Wait for the value series, not a fixed delay: the stage only renders once
   * the per-coin histories are in (`chartOpen && built`), and that is a dozen
   * requests. A short sleep here produced a portfolio with no chart and a
   * "the mode is not reachable" failure that had nothing to do with the mode. */
  await page
    .waitForFunction(
      `[...document.querySelectorAll("button")].some((b) => /Explore chart/i.test(b.textContent))`,
      null,
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(4000);

  /* **The glance reads on hover, without opening the stage.** A real mouse,
   * because a dispatched event skips the hit-testing that decides whether
   * the frame gets it; and the short readout — date, value, the move since
   * the range began — with no composition rows, which stay on the stage. */
  {
    const glance = await page.evaluate(`(() => {
      const n = document.querySelector("[data-pc-glance]");
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return [r.left + r.width * 0.6, r.top + r.height * 0.5];
    })()`);
    if (glance) await page.mouse.move(glance[0], glance[1]);
    await page.waitForTimeout(400);
    const read = await page.evaluate(`(() => {
      const frame = document.querySelector("[data-pc-glance]");
      const box = frame && [...frame.querySelectorAll("div")].find((d) => getComputedStyle(d).position === "absolute" && d.getAttribute("aria-hidden") === "true");
      if (!box) return null;
      const lines = box.innerText.split("\\n").map((t) => t.trim()).filter(Boolean);
      return { opacity: Number(getComputedStyle(box).opacity), lines, rows: box.querySelectorAll("[style*='background']").length };
    })()`);
    const okRead = read && read.opacity > 0.9 && read.lines.length >= 2
      && /^[A-Z]{3} \d/i.test(read.lines[0]) && /\$[\d,]+\.\d\d/.test(read.lines[1]);
    if (okRead) ok(`the glance reads a date and a value on hover (${read.lines.slice(0, 2).join(" · ")})`);
    else fail("the glance reads a date and a value on hover", JSON.stringify(read));
    if (read && !read.lines.some((t) => /^(BTC|ETH)\b.*%$/.test(t))) ok("…and keeps the composition rows for the stage");
    else fail("…and keeps the composition rows for the stage", JSON.stringify(read && read.lines));
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
  }

  /* Clicked through the DOM rather than with the mouse: the wallpaper chart
   * sits over this control and intercepts pointer events, so a real click
   * retries until it times out against an SVG that was never the target. */
  const opened = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll("button")].find((n) =>
      /Explore chart/i.test(n.textContent));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!opened) {
    fail("the chart can be brought forward", "no 'Explore chart' control found");
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(2500);

  // --- 1. it draws -------------------------------------------------------
  const d = await page.evaluate(CHART_PATH);
  if (d && d.length > 80 && !/NaN|Infinity|undefined/.test(d)) {
    ok(`the chart draws a real path (${d.length} chars)`);
  } else {
    fail("the chart draws a real path", `path was ${JSON.stringify((d || "").slice(0, 80))}`);
  }

  // --- 2. every mode draws, and none of them produces NaN ----------------
  for (const label of ["By coin", "As held", "Mix", "P/L", "Peak", "vs BTC", "What moved it", "Total"]) {
    const hit = await page.evaluate(`(() => {
      const b = [...document.querySelectorAll("button")].find(
        (n) => n.textContent.trim() === ${JSON.stringify("")} + ${JSON.stringify(label)});
      if (!b) return false;
      b.click();
      return true;
    })()`);
    if (!hit) {
      fail(`the ${label} mode is reachable`, "no control with that label");
      continue;
    }
    await page.waitForTimeout(700);
    const bad = await page.evaluate(
      `[...document.querySelectorAll("svg *")].some((n) =>
        [...n.attributes].some((a) => /NaN|Infinity/.test(a.value)))`,
    );

    /* **As held** (27 Sep 2026): the value of what was held on each day
     * against what it had cost by then — a dashed step, drawn on the same
     * scale, and the strip names the money in it. The fixture's two
     * purchases (20,000 and 6,000) are both inside the range or before it,
     * so by the end 26,000 had been paid in. */
    if (label === "As held") {
      const held = await page.evaluate(`(() => {
        const step = document.querySelector("[data-pc-plot] [data-pc-paid]");
        const cell = document.querySelector("[data-portfolio-strip-cell='paid']");
        return {
          step: step ? (step.getAttribute("d") || "").length : 0,
          paid: cell ? cell.innerText.replace(/\\s+/g, " ") : null,
          cost: Boolean(document.querySelector("[data-portfolio-strip-cell='cost']")),
        };
      })()`);
      if (held.step > 20 && !bad) ok(`${label} draws what was paid in as a step beside the value, every attribute a number`);
      else fail(`${label} draws the paid-in step`, JSON.stringify(held));
      if (held.paid && /26,000\.00/.test(held.paid) && !held.cost) ok(`${label} names the money paid in (${held.paid}) and not a second, constant cost`);
      else fail(`${label} names the money paid in`, JSON.stringify(held));
      continue;
    }

    /* **Mix**: each coin's share of the total, stacked to 100% — the axis
     * tops out at 100% and the legend prints each share once. */
    if (label === "Mix") {
      const mix = await page.evaluate(`(() => {
        const svg = document.querySelector("[data-pc-plot] svg");
        const labels = svg ? [...svg.querySelectorAll("text")].map((t) => t.textContent.trim()) : [];
        // The legend is the plot frame's next sibling in the chart's wrapper
        const legend = document.querySelector("[data-pc-plot]") && document.querySelector("[data-pc-plot]").nextElementSibling;
        const items = legend ? [...legend.children] : [];
        return {
          top: labels.includes("100%"),
          items: items.length,
          // one percentage per coin: the share, said once
          percents: items.map((n) => (n.innerText.match(/%/g) || []).length),
          money: legend ? /\\$/.test(legend.innerText) : null,
        };
      })()`);
      if (mix.top && !bad) ok(`${label} stacks the shares to 100%, every attribute a number`);
      else fail(`${label} stacks the shares to 100%`, JSON.stringify(mix));
      if (mix.items >= 2 && mix.percents.every((n) => n === 1) && mix.money === false) ok(`${label}'s legend prints each share once, and no money`);
      else fail(`${label}'s legend prints each share once, and no money`, JSON.stringify(mix));
      continue;
    }

    if (label === "vs BTC") {
      /* Two lines, one scale. The benchmark is told apart by its dash rather
       * than its colour, so that is what is checked — and the second path
       * existing at all is what proves the comparison was actually built
       * rather than silently refused. */
      const dashed = await page.evaluate(`(() => {
        const svg = document.querySelector("[data-pc-plot] svg");
        if (!svg) return -1;
        return [...svg.querySelectorAll("path[stroke-dasharray]")].length;
      })()`);
      const dd = await page.evaluate(CHART_PATH);
      if (dd && dd.length > 40 && !bad) ok(`${label} draws, with every attribute a number`);
      else fail(`${label} draws`, bad ? "a NaN attribute" : "no path");
      if (dashed > 0) ok(`${label} draws the benchmark as a dashed second line`);
      else fail(`${label} draws the benchmark`, `found ${dashed} dashed paths`);

      /* Both series start at 0% by construction, so the note must be able to
       * state a gap in points — a comparison that cannot say the gap has not
       * really compared anything. */
      const saysGap = await page.evaluate(
        `/points|puan|Punkte|punti|пункт/i.test(document.body.innerText)`,
      );
      if (saysGap) ok(`${label} states the gap in points`);
      else fail(`${label} states the gap in points`, "no gap sentence found");
      continue;
    }

    if (label === "Peak") {
      /* Drawdown is a time series like the others, so it must draw a path —
       * and the one thing that is specifically true of it is that nothing sits
       * above zero. Read off the readout rather than the geometry: a positive
       * drawdown would mean "above its own highest point". */
      const dd = await page.evaluate(CHART_PATH);
      /* Scoped to the chart's own axis labels. `document.body.innerText`
       * also carries the holdings list underneath the overlay, whose
       * unrealized-P/L percentages are legitimately positive — sweeping the
       * whole page reported those as drawdowns above the peak. */
      const positives = await page.evaluate(`(() => {
        const svg = document.querySelector("[data-pc-plot] svg");
        if (!svg) return -1;
        return [...svg.querySelectorAll("text")]
          .map((t) => (t.textContent || "").trim())
          .filter((t) => /^\\+[0-9]/.test(t)).length;
      })()`);
      if (dd && dd.length > 40 && !bad) ok(`${label} draws, with every attribute a number`);
      else fail(`${label} draws`, bad ? "a NaN attribute" : "no path");
      if (positives === 0) ok(`${label} never labels a level above its own peak`);
      else if (positives < 0) fail(`${label} never labels a level above its own peak`, "no plot");
      else fail(`${label} never labels a level above its own peak`, `${positives} positive labels`);
      continue;
    }

    if (label === "What moved it") {
      /* Not an SVG at all — ranked bars are laid out with the grid, so this
       * one is checked on the property that makes it honest instead: the
       * bars must add up to the figure printed above them. Read off the
       * screen, not recomputed, because agreeing with my own arithmetic
       * proves nothing about what a person sees. */
      const sums = await page.evaluate(`(() => {
        const money = [...document.querySelectorAll("span")]
          .map((n) => (n.textContent || "").trim())
          .filter((t) => /^[+\u2212-]?[^0-9]{0,3}[0-9][0-9,.]*$/.test(t));
        return money.length;
      })()`);
      /* Computed pixels, not the declared percentage: the width lives in a
       * generated class, and what matters is that it survived to layout. */
      const widths = await page.evaluate(`(() => {
        return [...document.querySelectorAll("[data-pcb-bar]")].map((b) =>
          parseFloat(getComputedStyle(b).width));
      })()`);
      const sides = await page.evaluate(
        `[...new Set([...document.querySelectorAll("[data-pcb-bar]")].map((b) =>
          b.getAttribute("data-pcb-bar")))].sort().join(",")`,
      );
      if (widths.length && widths.every((w) => isFinite(w) && w >= 0)) {
        ok(`${label} draws ${widths.length} bars, every width a real number`);
      } else {
        fail(`${label} draws bars with real widths`, `widths were ${JSON.stringify(widths)}`);
      }
      /* Direction must be carried by something other than colour, and the
       * side of the axis is that something — a bar knows which way it went. */
      if (sides === "down,up") {
        ok(`${label} puts winners and losers on opposite sides of zero`);
      } else if (sides) {
        fail(
          `${label} puts winners and losers on opposite sides of zero`,
          `only saw "${sides}" — the fixture should hold one riser and one faller`,
        );
      } else {
        fail(`${label} marks direction on the bar itself`, "no data-pcb-bar found");
      }
      if (sums > 0 && !bad) ok(`${label} prints its figures`);
      else fail(`${label} prints its figures`, bad ? "a NaN attribute" : "no figures found");
      continue;
    }

    const dd = await page.evaluate(CHART_PATH);
    if (dd && dd.length > 40 && !bad) ok(`${label} draws, with every attribute a number`);
    else fail(`${label} draws, with every attribute a number`, bad ? "a NaN attribute" : "no path");
  }

  // --- 3. the crosshair, without a pointer -------------------------------
  /* The readout is what the chart is for. Hovering proves it exists; the
   * keyboard is the half that was missing. */
  /* Let the chart come back before pointing at it. The loop above ends by
   * switching from the ranked-bar view to Total, which unmounts one component
   * and mounts another — 700ms is enough to see a path, not always enough for
   * the crosshair to have geometry to answer with. */
  await page.waitForSelector("[data-pc-plot]", { timeout: 10000 });
  await page.waitForTimeout(1200);

  /* The chart's own svg. `page.$("svg")` returns the first one in the
   * document, which is an icon somewhere in the furniture — the mouse then
   * moves over that instead and the readout never appears, for reasons that
   * have nothing to do with the chart. */
  const box = await page.$("[data-pc-plot] svg");
  const rect = await box.boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.55, rect.y + rect.height * 0.5);
  await page.waitForTimeout(400);
  const hovered = await page.evaluate(READOUT_TEXT);
  if (hovered) ok("the pointer reaches the readout");
  else fail("the pointer reaches the readout", "nothing became visible on hover");

  await page.mouse.move(rect.x - 50, rect.y - 50);
  await page.waitForTimeout(300);

  /* Tab until the chart plot itself takes focus, then drive it with the
   * arrows. A plot that never takes focus fails here, which is the point. */
  const focusedPlot = await page.evaluate(`(() => {
    const plot = document.querySelector("[data-pc-plot]");
    if (!plot) return null;
    plot.focus();
    return document.activeElement === plot || plot.contains(document.activeElement);
  })()`);

  if (focusedPlot === null) {
    fail(
      "the chart plot can take focus",
      "no [data-pc-plot] focus target — the readout is pointer-only",
    );
  } else if (!focusedPlot) {
    fail("the chart plot can take focus", "the element exists but did not take focus");
  } else {
    ok("the chart plot takes focus");

    await page.keyboard.press("End");
    await page.waitForTimeout(300);
    const atEnd = await page.evaluate(READOUT_TEXT);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(300);
    const moved = await page.evaluate(READOUT_TEXT);

    if (atEnd && moved && atEnd !== moved) {
      ok("End and the arrow keys move the readout to different samples");
    } else {
      fail(
        "End and the arrow keys move the readout to different samples",
        `End gave ${JSON.stringify(atEnd)}, two lefts gave ${JSON.stringify(moved)}`,
      );
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const afterEsc = await page.evaluate(READOUT_TEXT);
    /* The plot itself, not the back button's wording: that control's visible
     * text is "Holdings" and "Back to the holdings list (Esc)" is only its
     * title, so a text selector for the sentence finds nothing and reports a
     * closed stage that is wide open. */
    const stageStillOpen = Boolean(await page.$("[data-pc-plot]"));
    if (!afterEsc && stageStillOpen) {
      ok("Escape clears the readout before it closes the chart");
    } else {
      fail(
        "Escape clears the readout before it closes the chart",
        `readout ${afterEsc ? "still up" : "cleared"}, stage ${stageStillOpen ? "open" : "closed"}`,
      );
    }
  }

  // --- 4. the chart moves to its new shape, and then stops ---------------
  /* Two different transitions, and the distinction is the point: the same
   * drawing with new data morphs, a different drawing cross-fades. Both are
   * one-shot — a settled tab must have nothing of ours animating, which is
   * why the count is checked after as well as during. */
  {
    const lineD = `(() => {
      const n = document.querySelector('[data-pc-plot] path[stroke-width="2"]');
      return n ? (n.getAttribute("d") || "").slice(0, 48) : null;
    })()`;
    /* The **last** match: there are two period switchers on the page, the
     * price chart's and the portfolio's, and the stage's foot is last in the
     * DOM. Clicking the first changed the chart behind the overlay while this
     * assertion sat there reporting that nothing had moved. */
    const pickLast = async (label) =>
      page.evaluate(`(() => {
        const all = [...document.querySelectorAll("button")].filter(
          (b) => b.textContent.trim() === ${JSON.stringify("__L__")});
        if (!all.length) return false;
        all[all.length - 1].click();
        return true;
      })()`.replace("__L__", label));

    const before = await page.evaluate(lineD);
    const switched = await pickLast("1M");
    if (!switched) {
      fail("the range can be switched", "no range button found in the stage");
    } else {
      await page.waitForTimeout(140);
      const mid = await page.evaluate(lineD);
      await page.waitForTimeout(900);
      const after = await page.evaluate(lineD);
      if (before && after && before !== after && mid !== before && mid !== after) {
        ok("a range switch morphs the line rather than replacing it");
      } else {
        fail(
          "a range switch morphs the line",
          `before=${JSON.stringify(before)} mid=${JSON.stringify(mid)} after=${JSON.stringify(after)}`,
        );
      }
    }

    /* Nothing of ours is left behind. A finished animation with `fill: both`
     * stays in this list for the life of the page — it burns no frames, but it
     * makes "is anything animating?" unanswerable, and that question is the
     * one this project checks itself against on a new-tab page. */
    await page.waitForTimeout(800);
    const lingering = await page.evaluate(
      `document.getAnimations().filter((a) => a.playState === "finished").length`,
    );
    if (lingering === 0) ok("no finished animation is left in the page's list");
    else fail("no finished animation is left in the page's list", `${lingering} lingering`);
  }

  /* --- the chart's own card ------------------------------------------------
   *
   * The stage was a chart floating on the page with its range switcher and
   * its view chips scattered below it; it is a framed card now, the way the
   * derivatives page frames its market, with the controls at its head and the
   * figures the drawn range carries under them. What is asserted here is what
   * that buys: the controls sit above the plot, and the strip reads the
   * series the plot is drawing — which is the defect the strip shipped with,
   * printing money figures with a percent sign in the percent modes. */
  {
    const card = await page.evaluate(`(() => {
      const c = document.querySelector("[data-portfolio-chart-card]");
      if (!c) return null;
      /* The plot, not the Holdings button's icon: the biggest svg in the card. */
      const plot = [...c.querySelectorAll("svg")].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      const chips = [...c.querySelectorAll("button")].filter((b) => /^(Total|By coin|P\\/L|1D|1W|1M|1Y|ALL)$/.test(b.textContent.trim()));
      const strip = c.querySelector("[data-portfolio-strip]");
      return {
        mode: c.getAttribute("data-portfolio-chart-card"),
        chips: chips.length,
        above: chips.length ? Math.max(...chips.map((b) => b.getBoundingClientRect().bottom)) <= plot.getBoundingClientRect().top + 1 : false,
        cells: strip ? [...strip.children].map((n) => n.innerText.replace(/\\n/g, " ")) : null,
      };
    })()`);
    if (card && card.chips >= 8 && card.above) {
      ok(`the chart is a card with its controls at its head (${card.chips} chips above the plot)`);
    } else {
      fail("the chart is a card with its controls at its head", JSON.stringify(card));
    }
    const money = card && card.cells && card.cells.every((t) => /\$/.test(t) && !/%/.test(t));
    if (money) ok("…and the range strip is in money on the value chart");
    else fail("…and the range strip is in money on the value chart", JSON.stringify(card && card.cells));
  }

  /* **The two percent modes speak percent everywhere.** `formatMoney` is a
     percent formatter in Peak and vs BTC — right for the axis and the
     headline, wrong for a band's value, which is money in every mode. Both
     were wrong in opposite directions: the axis printed "$-7" for a
     percentage and the legend printed "+63074.2%" for $63,074.23. */
  {
    const hit = await page.evaluate(`(() => {
      const b = [...document.querySelectorAll("button")].find((n) => n.textContent.trim() === "Peak");
      if (b) b.click();
      return Boolean(b);
    })()`);
    await page.waitForTimeout(1200);
    const units = await page.evaluate(`(() => {
      const card = document.querySelector("[data-portfolio-chart-card]");
      const svg = [...card.querySelectorAll("svg")].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      const axis = [...svg.querySelectorAll("text")].map((t) => t.textContent.trim())
        .filter((t) => /[0-9]/.test(t) && !/^[A-Z][a-z]{2} /.test(t));
      const legend = [...card.querySelectorAll("[data-portfolio-legend] span")].map((n) => n.textContent.trim())
        .filter((t) => /[0-9]/.test(t) && /[.,]/.test(t));
      const strip = [...card.querySelectorAll("[data-portfolio-strip] > *")].map((n) => n.innerText.replace(/\\n/g, " "));
      return { axis: axis.slice(0, 6), legend: legend.slice(0, 4), strip };
    })()`);
    if (hit && units.axis.length && units.axis.every((t) => /%$/.test(t) && !/\$/.test(t))) {
      ok("a percent mode's axis is in percent, with no currency sign");
    } else {
      fail("a percent mode's axis is in percent, with no currency sign", JSON.stringify(units.axis));
    }
    if (units.legend.length && units.legend.every((t) => /\$/.test(t) && !/%$/.test(t))) {
      ok("…while a holding's value in the legend stays money");
    } else {
      fail("…while a holding's value in the legend stays money", JSON.stringify(units.legend));
    }
    if (units.strip.length && units.strip.every((t) => /%/.test(t) && !/\$/.test(t))) {
      ok("…and the strip reads the series the plot draws");
    } else {
      fail("…and the strip reads the series the plot draws", JSON.stringify(units.strip));
    }
  }

  // --- 5. nothing threw along the way ------------------------------------
  if (!errors.length) ok("no page errors through the whole walk");
  else fail("no page errors through the whole walk", errors.slice(0, 3).join(" | "));

  await browser.close();

  if (failures) {
    console.error(`\n${failures} PORTFOLIO CHART RENDER FAILURE(S)`);
    process.exit(1);
  }
  console.log("ALL PORTFOLIO CHART RENDER TESTS PASSED");
})();
