#!/usr/bin/env node
/* The main chart's baseline — what it costs and how it reads, per mode.
 *
 *   node scripts/chart-baseline.js before     # → docs/internal/research/chart-baseline/before/
 *   node scripts/chart-baseline.js after
 *
 * Written for the chart plan's Phase 0 (docs/internal/research/
 * chart-plan-2026-09-29.md): every later phase is compared against a run of
 * this, so "it reads better" is a pair of numbers and a pair of pictures
 * rather than a feeling. The network is stubbed with one fixed series, so two
 * runs a day apart measure the code and not the market.
 *
 * Per mode (line, candles, grid, board, compare, log) × width (1280, 420) ×
 * theme (dark, light):
 *   - nodes      elements inside the chart's SVG
 *   - texts      visible <text> elements
 *   - overlaps   pairs of visible texts whose boxes intersect by more than 2px
 *   - clipped    visible texts reaching past the SVG's own box
 *   - frameMs    median frame while the pointer crosses the plot
 *   - a screenshot of the chart surface
 *
 * Local tooling, never shipped. Playwright from tests/ (`npm --prefix tests ci`
 * and `npm --prefix tests run browsers`). */
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const ROOT = path.join(__dirname, "..");
const label = process.argv[2] || "run";
const OUT = path.join(ROOT, "docs", "internal", "research", "chart-baseline", label);
const INDEX = "file://" + path.join(ROOT, "index.html");
const { chromium } = createRequire(path.join(ROOT, "tests", "package.json"))("playwright");

/* One fixed series per range: a slow wave with a trend and a few sharp steps,
   so the move marks, the grid and the labels all have something to do. */
const NOW = Math.floor(Date.UTC(2026, 8, 29, 12, 0, 0) / 1000);
const SPAN = { hour: 3600, day: 86400, week: 7 * 86400, month: 30 * 86400, year: 365 * 86400, all: 12 * 365 * 86400 };
const series = (period, base) => {
  const n = 300;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = NOW - SPAN[period] + Math.round((SPAN[period] * i) / (n - 1));
    const wave = Math.sin(i / 17) * 0.018 + Math.sin(i / 5.3) * 0.006;
    const trend = (i / n) * 0.05;
    const step = i > 180 && i < 184 ? -0.035 : 0;
    out.push({ price: (base * (1 + wave + trend + step)).toFixed(2), time: t });
  }
  return out;
};
const json = (b) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });

const MODES = {
  line: {},
  candles: { crypto_chart_chart_type: "candles", crypto_chart_volume_bars: "true" },
  grid: { crypto_chart_grid: "true" },
  board: { crypto_chart_predict: "true", crypto_chart_future_share: "0.3" },
  compare: { __compare: "ETH" },
  log: { crypto_chart_log_scale: "true", __period: "6" },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const rows = [];
  for (const [mode, store] of Object.entries(MODES)) {
    for (const [w, h] of [[1280, 800], [420, 860]]) {
      for (const theme of ["dark", "light"]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
        await ctx.route("**/*", (r) => {
          const u = r.request().url();
          if (u.startsWith("file://")) return r.continue();
          const m = u.match(/prices\/([A-Z]+)-USD\/historic\?period=(\w+)/);
          if (m) return r.fulfill(json({ data: { prices: series(m[2], m[1] === "ETH" ? 2600 : 83000) } }));
          if (u.includes("/spot")) return r.fulfill(json({ data: { amount: u.includes("ETH") ? "2650.00" : "84000.00", currency: "USD" } }));
          if (u.includes("/candles")) {
            const s = series("month", 83000);
            return r.fulfill(json(s.map((p, i) => { const c = Number(p.price); const o = i ? Number(s[i - 1].price) : c; return [p.time, Math.min(o, c) * 0.997, Math.max(o, c) * 1.003, o, c, 10 + (i % 7)]; }).reverse()));
          }
          return r.fulfill(json({ data: {} }));
        });
        const seed = Object.assign({ crypto_chart_onboarding_seen: "1", crypto_chart_theme: theme, crypto_chart_widgets: "{}", crypto_chart_page_ticker_enabled: "false" }, store);
        await ctx.addInitScript((s) => { if (sessionStorage.getItem("seeded")) return; for (const [k, v] of Object.entries(s)) if (!k.startsWith("__")) localStorage.setItem(k, v); sessionStorage.setItem("seeded", "1"); }, seed);
        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(INDEX, { waitUntil: "load" });
        await page.waitForSelector("svg path", { timeout: 20000 });
        await page.waitForTimeout(900);
        await page.keyboard.press(store.__period || "4");
        await page.waitForTimeout(1200);
        if (store.__compare) {
          await page.keyboard.press("c");
          await page.waitForTimeout(400);
          await page.keyboard.type(store.__compare);
          await page.keyboard.press("Enter");
          await page.waitForTimeout(1500);
        }
        const box = await page.evaluate(() => {
          const svg = [...document.querySelectorAll("svg")].sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
          const r = svg.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
        // Frame time while the pointer crosses the plot
        const frames = await page.evaluate(() => new Promise((resolve) => {
          const out = [];
          let last = performance.now();
          let n = 0;
          const tick = (t) => { out.push(t - last); last = t; if (++n < 40) requestAnimationFrame(tick); else resolve(out); };
          requestAnimationFrame(tick);
        }).then((f) => f));
        for (let i = 0; i < 30; i++) await page.mouse.move(box.x + box.w * (0.2 + (0.6 * i) / 30), box.y + box.h * 0.5);
        const moving = await page.evaluate(() => new Promise((resolve) => {
          const out = [];
          let last = performance.now();
          let n = 0;
          const tick = (t) => { out.push(t - last); last = t; if (++n < 20) requestAnimationFrame(tick); else resolve(out); };
          requestAnimationFrame(tick);
        }));
        await page.mouse.move(box.x + box.w * 0.5, Math.max(0, box.y - 60));
        await page.waitForTimeout(300);
        const read = await page.evaluate(() => {
          const svg = [...document.querySelectorAll("svg")].sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
          const sb = svg.getBoundingClientRect();
          const shown = (n) => {
            for (let m = n; m && m !== svg; m = m.parentNode) {
              if (m.getAttribute && (m.getAttribute("visibility") === "hidden" || m.getAttribute("display") === "none")) return false;
              const cs = getComputedStyle(m);
              if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
            }
            return true;
          };
          const texts = [...svg.querySelectorAll("text")].filter((t) => t.textContent.trim() && shown(t)).map((t) => t.getBoundingClientRect()).filter((b) => b.width > 0);
          let overlaps = 0;
          for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
            const a = texts[i], b = texts[j];
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 2 && oy > 2) overlaps++;
          }
          const clipped = texts.filter((b) => b.left < sb.left - 1 || b.right > sb.right + 1 || b.top < sb.top - 1 || b.bottom > sb.bottom + 1).length;
          return { nodes: svg.querySelectorAll("*").length, texts: texts.length, overlaps, clipped, axisLabels: svg.querySelectorAll("[data-axis-tick]").length };
        });
        const file = `${mode}-${w}-${theme}.png`;
        await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: Math.max(0, box.y - 140), width: w, height: Math.min(h - Math.max(0, box.y - 140), box.h + 160) } });
        const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
        const row = { mode, w, theme, ...read, idleFrameMs: +med(frames).toFixed(1), frameMs: +med(moving).toFixed(1), errors: errors.length };
        rows.push(row);
        console.log(`${mode.padEnd(8)} ${String(w).padEnd(5)} ${theme.padEnd(6)} nodes ${String(read.nodes).padStart(4)} texts ${String(read.texts).padStart(3)} overlaps ${read.overlaps} clipped ${read.clipped} axis ${read.axisLabels} frame ${row.frameMs}ms${errors.length ? " ERRORS " + errors[0] : ""}`);
        await ctx.close();
      }
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${rows.length} rows and screenshots to ${path.relative(ROOT, OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
