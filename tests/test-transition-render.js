// What the chart does between two ranges, in a real browser.
//
// The complaint this exists for was "the chart just changes when I switch the
// range", and the first fix was aimed at the wrong thing: measured frame by
// frame, the price line *already* eased from 0% to 100% of its travel with no
// single-frame jump. Nothing was broken. What was missing was any sense that a
// redraw had happened — a morph between two waves on a scale that refits
// itself to both is silent — and one thing was genuinely wrong underneath it:
// the fill ran its own interpolation and came apart from the line it hangs
// from, a wedge of green with no line on it, 112ms into every change.
//
// And the mesh — the lattice and its labels, which on a chart with a board on
// is most of the ink — was rewritten in place, so it changed between two
// frames while the line took half a second. That is what "the chart just
// changes" actually was.
//
// So the things asserted here are the ones that can each break on their own
// and none of which throws:
//
//   1. the shape travels over many frames and never in one jump
//   2. the fill's top edge *is* the line, at every frame of the change
//   3. the lattice dissolves rather than being swapped, and leaves exactly one
//      of itself behind
//   4. a resize is not a redraw and gets none of it
//   5. with a board up — the case a clean profile never reproduces — the line
//      still travels
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
  console.log("• transition render test skipped: playwright not installed");
  process.exit(0);
}

// Comparing two path shapes that have different numbers of points: take the
// y of every vertex, resample both to the same length, and average the gap.
const ys = (d) =>
  (d || "").split(/[ML]/).slice(1).map((seg) => +seg.split(",")[1]).filter(Number.isFinite);
const resample = (arr) =>
  Array.from({ length: 100 }, (_, i) => arr[Math.round((i * (arr.length - 1)) / 99)] || 0);
const dist = (a, b) => a.reduce((t, v, i) => t + Math.abs(v - b[i]), 0) / a.length;

let failed = 0;
const check = (ok, label, detail) => {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failed++;
    console.error(`  ✘ ${label}${detail ? " — " + detail : ""}`);
  }
};

const NOW = Math.floor(Date.now() / 1000);
// A different shape and a different point count per range, the way real data
// is — equal counts would let a broken interpolation look fine.
// Keyed on the coin as well as the range: served the same numbers for two
// coins, the path comes back byte-identical and the chart correctly does
// nothing at all — which would have looked like the sweep being broken.
const series = (period, coin) => {
  const n = { hour: 60, day: 96, week: 168, month: 120, year: 365, all: 300 }[period] || 100;
  const coinSeed = String(coin || "BTC").charCodeAt(0) % 7;
  const seed = ({ hour: 1, day: 2, week: 3, month: 4, year: 5, all: 6 }[period] || 1) + coinSeed;
  const step = { hour: 60, day: 900, week: 3600, month: 21600, year: 86400, all: 604800 }[period] || 60;
  return Array.from({ length: n }, (_, i) => ({
    price: (40000 + seed * 2000 + Math.sin(i / (2 + seed)) * 1500 * seed + i * seed * 12).toFixed(2),
    time: NOW - (n - i) * step,
  }));
};
const json = (b) => ({
  status: 200,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*" },
  body: JSON.stringify(b),
});

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  } catch (e) {
    console.log(`• transition render test skipped: no browser (${e.message.split("\n")[0]})`);
    process.exit(0);
  }

  const route = async (r) => {
    const u = r.request().url();
    if (u.startsWith("file://")) return r.continue();
    if (u.includes("historic")) {
      const m = /period=(\w+)/.exec(u);
      const c = /prices\/([A-Z0-9]+)-/.exec(u);
      return r.fulfill(json({ data: { prices: series(m && m[1], c && c[1]) } }));
    }
    if (u.includes("spot")) {
      return r.fulfill(json({ data: { amount: "43250.50", currency: "USD" } }));
    }
    return r.fulfill(json({ data: {} }));
  };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(`(() => localStorage.setItem("crypto_chart_onboarding_seen", "1"))()`);
  await ctx.route("**/*", route);
  const page = await ctx.newPage();
  await page.goto(INDEX, { waitUntil: "load" });
  await page.waitForSelector("svg path", { timeout: 15000 });
  await page.waitForTimeout(2500); // let the load reveal finish

  /* Record every frame of whatever the next action does to the chart.
   *
   * Written as a string, like every other in-page body in tests/: the suite
   * lints as Node, so `window` and `requestAnimationFrame` are undefined names
   * here even though they are the only names that exist where this runs. */
  await page.evaluate(`(() => {
    window.__svg = [...document.querySelectorAll("svg")]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0].e;
    window.__record = (ms) =>
      new Promise((done) => {
        const g = window.__svg.querySelector("g[data-line]");
        const [area, line] = [...g.querySelectorAll("path")];
        const out = [];
        const t0 = performance.now();
        const tick = () => {
          out.push({
            t: Math.round(performance.now() - t0),
            line: line.getAttribute("d"),
            area: area.getAttribute("d"),
          });
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      });
  })()`);

  const runAndRecord = async (action, ms = 1600) => {
    const p = page.evaluate(`window.__record(${ms})`);
    await page.waitForTimeout(30);
    await action();
    return p;
  };

  const clickRange = (label) => () =>
    page.evaluate(`(() => {
      [...document.querySelectorAll("button")]
        .find((x) => (x.textContent || "").trim() === ${JSON.stringify(label)})
        .click();
    })()`);

  // ── 1. a range switch, frame by frame ────────────────────────────────
  const frames = await runAndRecord(clickRange("1W"));

  const first = resample(ys(frames[0].line));
  const last = resample(ys(frames[frames.length - 1].line));
  const total = dist(first, last);
  check(total > 5, "the range switch actually changed the shape", `${total.toFixed(1)}px`);

  const progress = frames.map((f) => 1 - dist(resample(ys(f.line)), last) / total);
  const moved = frames.filter((_, i) => i > 0 && progress[i] - progress[i - 1] > 0.001).length;
  check(moved >= 12, "the shape travels over many frames", `${moved} frames moved`);

  let biggestStep = 0;
  for (let i = 1; i < progress.length; i++) {
    biggestStep = Math.max(biggestStep, progress[i] - progress[i - 1]);
  }
  check(
    biggestStep < 0.5,
    "and never in one jump",
    `biggest single frame = ${(biggestStep * 100).toFixed(0)}% of the change`,
  );

  // ── 2. the fill hangs from the line, at every frame ───────────────────
  // `buildAreaD` is the line plus three commands, so the fill's top edge must
  // be the line exactly. Before this, the two ran separate interpolations and
  // parted company in the middle of every change.
  let worstGap = 0;
  let worstAt = null;
  for (const f of frames) {
    if (!f.line || !f.area) continue;
    if (!f.area.startsWith(f.line)) {
      const a = resample(ys(f.area));
      const l = resample(ys(f.line));
      const gap = dist(a, l);
      if (gap > worstGap) {
        worstGap = gap;
        worstAt = f.t;
      }
    }
  }
  check(
    worstGap === 0,
    "the fill's top edge is the line, at every frame",
    worstAt === null ? "" : `${worstGap.toFixed(1)}px apart at ${worstAt}ms`,
  );

  // ── 3. changing the coin animates too ────────────────────────────────
  // The other half of a redraw: a new coin replaces every point on the chart
  // exactly as a new range does.
  await page.waitForTimeout(900);
  const coinFrames = await runAndRecord(() => page.keyboard.press("ArrowRight"), 1800);
  const cLast = resample(ys(coinFrames[coinFrames.length - 1].line));
  const cTotal = dist(resample(ys(coinFrames[0].line)), cLast);
  check(cTotal > 5, "changing the coin changed the shape", `${cTotal.toFixed(1)}px`);
  const cProgress = coinFrames.map((f) => 1 - dist(resample(ys(f.line)), cLast) / cTotal);
  let cStep = 0;
  for (let i = 1; i < cProgress.length; i++) {
    cStep = Math.max(cStep, cProgress[i] - cProgress[i - 1]);
  }
  check(cStep < 0.5, "and travels rather than snapping",
    `biggest single frame = ${(cStep * 100).toFixed(0)}% of the change`);

  await ctx.close();

  /* ── 6. the board's own case, which is the one that was broken ─────────
   *
   * The reach is held per range (`BOARD_ZOOM_KEY`), so two ranges zoomed
   * differently means `setPeriod` changes the `boardZoom` prop on every switch
   * between them — and that used to start a zoom *travel*, which drives the
   * chart from its own rAF and therefore has to write the path straight
   * instead of tweening it. The new series then arrived mid-travel and was
   * simply set: a range switch with no animation on it at all, on the one
   * chart where most of the ink is the lattice. A clean profile never showed
   * it, because there every range is at the default and the prop never
   * changes — which is why it survived a round of measuring.
   */
  const boardCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await boardCtx.addInitScript(`(() => {
    localStorage.setItem("crypto_chart_onboarding_seen", "1");
    localStorage.setItem("crypto_chart_predict", "true");
    localStorage.setItem("crypto_chart_grid", "true");
    // Two ranges, two different reaches — the shape of a real profile
    localStorage.setItem("crypto_chart_board_zoom_hour", "2");
    localStorage.setItem("crypto_chart_board_zoom_week", "8");
  })()`);
  await boardCtx.route("**/*", route);
  const board = await boardCtx.newPage();
  await board.goto(INDEX, { waitUntil: "load" });
  await board.waitForSelector("svg path", { timeout: 15000 });
  await board.waitForTimeout(2500);

  const meshCount = `[...window.__svg.querySelectorAll("line")]
    .filter((e) => e.getAttribute("visibility") !== "hidden").length`;
  await board.evaluate(`(() => {
    window.__svg = [...document.querySelectorAll("svg")]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0].e;
    window.__record = (ms) =>
      new Promise((done) => {
        const g = window.__svg.querySelector("g[data-line]");
        const [, line] = [...g.querySelectorAll("path")];
        const out = [];
        const t0 = performance.now();
        const tick = () => {
          out.push({
            t: Math.round(performance.now() - t0),
            line: line.getAttribute("d"),
            mesh: ${meshCount},
          });
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      });
  })()`);

  const boardFrames = await (async () => {
    const p = board.evaluate("window.__record(2000)");
    await board.waitForTimeout(30);
    await board.evaluate(`(() => {
      [...document.querySelectorAll("button")]
        .find((x) => (x.textContent || "").trim() === "1W")
        .click();
    })()`);
    return p;
  })();

  const bFirst = resample(ys(boardFrames[0].line));
  const bLast = resample(ys(boardFrames[boardFrames.length - 1].line));
  const bTotal = dist(bFirst, bLast);
  check(bTotal > 5, "the board's range switch changed the shape", `${bTotal.toFixed(1)}px`);
  const bProgress = boardFrames.map((f) => 1 - dist(resample(ys(f.line)), bLast) / bTotal);
  let bStep = 0;
  for (let i = 1; i < bProgress.length; i++) {
    bStep = Math.max(bStep, bProgress[i] - bProgress[i - 1]);
  }
  check(
    bStep < 0.5,
    "with a board up, the line still travels rather than snapping",
    `biggest single frame = ${(bStep * 100).toFixed(0)}% of the change`,
  );

  // The lattice dissolves: two of them are briefly on screen, and exactly one
  // is left when it settles.
  const meshes = boardFrames.map((f) => f.mesh);
  const settled = meshes[meshes.length - 1];
  check(
    Math.max(...meshes) > settled,
    "the old lattice is still there while the new one arrives",
    `peak ${Math.max(...meshes)} lines vs ${settled} settled`,
  );
  check(
    meshes[0] > 0 && settled > 0 && Math.abs(settled - meshes[0]) < meshes[0],
    "and only one lattice is left when it settles",
    `${meshes[0]} → ${settled}`,
  );

  /* A resize is not a redraw. Every point moves and every gridline is written
   * again, so it goes through all of the same code — but the chart is still
   * about exactly what it was about a moment ago, and dissolving through a
   * second lattice would be announcing something that did not happen. This is
   * the guard against the dissolve being wired to "the drawing changed"
   * instead of "the subject changed". */
  await board.waitForTimeout(1200);
  const resized = await (async () => {
    const p = board.evaluate("window.__record(900)");
    await board.waitForTimeout(30);
    await board.setViewportSize({ width: 1100, height: 780 });
    return p;
  })();
  const rMoved = resized.some((f, i) => i > 0 && f.line !== resized[i - 1].line);
  check(rMoved, "the resize did redraw the chart", "nothing moved, so the next check is empty");
  const rMeshes = resized.map((f) => f.mesh);
  check(
    Math.max(...rMeshes) <= rMeshes[rMeshes.length - 1],
    "a resize redraws without dissolving",
    `peak ${Math.max(...rMeshes)} vs ${rMeshes[rMeshes.length - 1]} settled`,
  );

  await browser.close();
  if (failed) {
    console.error(`\n✘ ${failed} TRANSITION CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log("\n✔ transitions behave");
})();
