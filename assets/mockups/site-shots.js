#!/usr/bin/env node
/* The website's screenshots, from the live extension page.
 *
 *   node assets/mockups/site-shots.js            # every scene → site/shots/
 *   node assets/mockups/site-shots.js tax news   # just these
 *   node assets/mockups/site-shots.js --lang=tr --out=<dir> hero widgets
 *       # the app in one of its 13 languages, into another folder — the
 *       # store's localized images (11 Oct 2026); site/shots stays English
 *
 * Why a script of its own rather than more scenes in `scenes.html`: that
 * pipeline fires its clicks on fixed timers and its seeds were written against
 * a price that has since moved (its calls sat at BTC ≈ 68,800), so a scene
 * either lands on a half-drawn screen or draws its levels off the chart. This
 * one seeds from the live price at capture time, drives the page with its own
 * keyboard shortcuts, waits for the screen it is shooting to exist, and fails
 * — rather than writing a valid black PNG — when a scene throws or comes out
 * nearly empty.
 *
 * Real market data, real requests: run it on a machine with a network. It
 * serves the repository on localhost so the page's requests carry an ordinary
 * origin. Local tooling — never shipped (package.sh builds from an allowlist).
 * Playwright comes from `tests/` (`npm --prefix tests ci` and
 * `npm --prefix tests run browsers`). */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { createRequire } = require("module");

// The browser `npm --prefix tests run browsers` installed, inside node_modules — as the render suites use it
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "site", "shots");
const { chromium } = createRequire(path.join(ROOT, "tests", "package.json"))("playwright");

const W = 1280;
const H = 800;
const MIN_BYTES = 30000; // an all-black 1280×800 PNG is ~5 KB; a real screen is far more
const DAY = 86400;
const HOUR_MS = 3600000;
const ago = (days) => Math.floor(Date.now() / 1000) - days * DAY;
const WIDGET_KEYS = ["watchlist", "topMovers", "fearGreed", "marketOverview", "halvingCountdown", "difficulty",
  "ethGas", "btcFees", "mempool", "rsiWidget", "outlook", "regimes", "worstFall", "fundingRate",
  "longShortRatio", "openInterest", "liquidations", "altcoinSeason", "modelOutlook",
  "options", "fundingBoard", "oiLeaders", "stablecoins", "ethBtc", "etfFlows", "macroCalendar"];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf" };

const serve = () => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
    const file = path.normalize(path.join(ROOT, rel || "index.html"));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(0, "127.0.0.1", () => resolve(server));
});

const spot = async (coin) => {
  const r = await fetch(`https://www.coinbase.com/api/v2/prices/${coin}-USD/spot`);
  if (!r.ok) throw new Error(`spot ${coin}: HTTP ${r.status}`);
  return Number((await r.json()).data.amount);
};

/* Fifteen-minute BTC candles for the last day, oldest first: [t, low, high,
 * open, close]. The replay scene places its settled calls on the price that
 * actually traded, so the squares sit on the line rather than beside it. */
const candles15 = async () => {
  const end = new Date();
  const start = new Date(end.getTime() - 26 * HOUR_MS);
  const r = await fetch(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900&start=${start.toISOString()}&end=${end.toISOString()}`);
  if (!r.ok) throw new Error(`candles: HTTP ${r.status}`);
  return (await r.json()).map(([t, lo, hi, o, c]) => [t * 1000, lo, hi, o, c]).sort((a, b) => a[0] - b[0]);
};

/* Honest rather than flattering: up overall with one clearly red row, one
 * small old sale so Realized has something to show, and a staking receipt so
 * the ledger's income line is not empty. Paid figures are worked back from
 * the live price so the picture holds whatever the market did since. */
const portfolioFor = (px) => {
  const lot = (coin, amount, gain, days) => ({ amount, paid: Math.round(amount * px[coin] / (1 + gain)), time: ago(days), source: "manual" });
  return [
    { coin: "BTC", amount: 0.42, target: null, watches: [], sales: [], lots: [lot("BTC", 0.42, 0.18, 430)] },
    { coin: "ETH", amount: 3.1, target: null, watches: [], sales: [], lots: [lot("ETH", 3.1, 0.09, 295)] },
    {
      coin: "SOL", amount: 24, target: null, watches: [],
      lots: [lot("SOL", 24, 0.14, 150)],
      sales: [{
        amount: 6, received: Math.round(6 * px.SOL * 1.04), basis: Math.round(6 * px.SOL / 1.14), basisAmount: 6, time: ago(38),
        matched: [{ amount: 6, cost: Math.round(6 * px.SOL / 1.14), acquired: ago(150), source: "manual" }],
      }],
    },
    { coin: "LINK", amount: 90, target: null, watches: [], sales: [], lots: [lot("LINK", 90, 0.11, 88)] },
    { coin: "DOGE", amount: 12000, target: null, watches: [], sales: [], lots: [lot("DOGE", 12000, -0.21, 210)] },
  ];
};

/* Three armed, one hit a few hours ago — both sections of the panel show.
 * Levels sit 5–9% from the live price: near enough to be plausible, far
 * enough that none fires the moment the page loads. */
const alertsFor = (px) => [
  { id: "a1", coin: "BTC", kind: "price", direction: "above", target: Math.round(px.BTC * 1.06 / 100) * 100,
    currency: "USD", created: Date.now() - 9 * 24 * HOUR_MS, startPrice: Math.round(px.BTC * 0.95), triggeredAt: null, hitPrice: null },
  { id: "a2", coin: "ETH", kind: "percent", direction: "below", target: 5, window: 4 * HOUR_MS,
    currency: "USD", created: Date.now() - 4 * 24 * HOUR_MS, startPrice: null, triggeredAt: null, hitPrice: null },
  { id: "a3", coin: "SOL", kind: "price", direction: "below", target: Math.round(px.SOL * 0.92),
    currency: "USD", created: Date.now() - 2 * 24 * HOUR_MS, startPrice: Math.round(px.SOL * 1.02), triggeredAt: null, hitPrice: null },
  { id: "a4", coin: "LINK", kind: "price", direction: "above", target: Number((px.LINK * 0.99).toFixed(2)),
    currency: "USD", created: Date.now() - 6 * 24 * HOUR_MS, startPrice: Number((px.LINK * 0.9).toFixed(2)),
    triggeredAt: Date.now() - 3 * HOUR_MS, hitPrice: Number((px.LINK * 0.995).toFixed(2)) },
];

const BASE = {
  crypto_chart_coin_options: JSON.stringify(["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK"]),
  crypto_chart_theme: "dark",
  crypto_chart_currency: "USD",
  crypto_chart_onboarding_seen: "1",
  crypto_chart_rate_prompt_dismissed: "true",
  crypto_chart_refresh_interval: "300000",
  crypto_chart_news_ticker_enabled: "false",
  crypto_chart_page_ticker_enabled: "false",
  // Every card off, said explicitly: absent keys fall back to the starter set
  crypto_chart_widgets: JSON.stringify(Object.fromEntries(WIDGET_KEYS.map((k) => [k, false]))),
};

/* Each scene: the storage it starts from, then what a person would do. */
const SCENES = {
  calls: {
    /* One notch out on the day, so the day's whole range fits the board's
     * window; at the default a volatile day runs off the top by design. */
    store: () => ({ crypto_chart_predict: "true", crypto_chart_future_share: "0.32", crypto_chart_board_zoom_day: "2" }),
    run: async (page) => {
      await page.keyboard.press("2"); // 1D
      await page.waitForTimeout(3500);
      // Lock two squares by hand, the way a person does: two clicks each.
      const g = await page.evaluate(() => {
        const chart = [...document.querySelectorAll("svg")].sort((a, b) =>
          b.getBoundingClientRect().width * b.getBoundingClientRect().height -
          a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
        const r = chart.getBoundingClientRect();
        // Pooled nodes are hidden by attribute, not by style — the calls suite's own test
        const lines = [...chart.querySelectorAll("line")].filter((l) => l.getAttribute("visibility") !== "hidden");
        // "Now" is the rightmost dashed vertical: the crosshair shares its dash
        const nows = lines.filter((l) => l.getAttribute("stroke-dasharray") === "2 3" &&
          Math.abs(+l.getAttribute("x1") - +l.getAttribute("x2")) < 0.01).map((l) => +l.getAttribute("x1"));
        const nowX = nows.length ? Math.max(...nows) : null;
        const future = lines.map((l) => [+l.getAttribute("x1"), +l.getAttribute("x2")])
          .filter(([a, b]) => Math.abs(a - b) < 0.01 && a > nowX + 0.5).map(([a]) => a).sort((a, b) => a - b);
        /* A square's own width when the chances are drawn: the gridlines
           past now include more than the board's, and read off them the
           pitch came out a third of a square — both calls landed side by
           side. */
        const cell = [...chart.querySelectorAll("rect[data-odds-cell]")].find((n) => n.getAttribute("visibility") !== "hidden");
        const pitch = cell ? Number(cell.getAttribute("width")) + 2 : future.length > 1 ? future[1] - future[0] : null;
        return { x: r.x, y: r.y, w: r.width, h: r.height, nowX, pitch };
      });
      if (g.nowX == null || !g.pitch) throw new Error("calls: no board on screen");
      if (process.env.DEBUG) console.log("calls geometry", JSON.stringify(g));
      // Three columns apart, so the two CALLED tags never touch
      for (const [col, row] of [[1.5, 0.42], [4.5, 0.5]]) {
        const px = g.x + g.nowX + g.pitch * col;
        const py = g.y + g.h * row;
        await page.mouse.click(px, py);
        await page.waitForTimeout(250);
        await page.mouse.click(px, py);
        await page.waitForTimeout(600);
      }
      await page.mouse.move(W / 2, 40); // off the chart, so no hover square is left behind
      await page.waitForTimeout(1500);
      const open = await page.evaluate(() => (JSON.parse(localStorage.getItem("crypto_chart_calls") || "{}").open || []).length);
      if (open < 2) throw new Error(`calls: ${open} locked, expected 2`);
    },
  },
  /* Bitcoin against the S&P 500 (Kraken's SPYx) over a month — the compare
     drawer's markets, 1 Oct 2026. */
  compare: {
    store: () => ({}),
    run: async (page) => {
      await page.keyboard.press("4"); // 1M
      await page.waitForTimeout(2500);
      await page.keyboard.press("c");
      await page.waitForSelector("[data-compare-pick='SPYx']", { timeout: 6000 });
      await page.click("[data-compare-pick='SPYx']");
      await page.waitForSelector("[data-compare-strip]", { timeout: 10000 });
      await page.waitForTimeout(5000);
    },
  },
  /* The store's first frame: the new tab as it opens — one coin, a day,
     nothing switched on. Written to site/shots/hero.png; the store frame
     reads it from there (assets/mockups/store-frames.html). */
  hero: {
    // Shorter than the rest: the store frame shows the top of a shot, and at 800 tall the chart sat below it
    size: [1280, 540],
    store: () => ({}),
    run: async (page) => {
      await page.keyboard.press("2"); // 1D
      await page.waitForTimeout(6000);
      await page.mouse.move(640, 790);
    },
  },
  /* The widgets drawer arranged the way a phone arranges them: three sizes
     on one grid. */
  widgets: {
    store: () => ({
      crypto_chart_widgets: JSON.stringify({ ...Object.fromEntries(WIDGET_KEYS.map((k) => [k, false])),
        watchlist: true, fearGreed: true, marketOverview: true, etfFlows: true, options: true, modelOutlook: true, regimes: true }),
      crypto_chart_widget_card_sizes: JSON.stringify({ watchlist: "m", fearGreed: "s", marketOverview: "s", etfFlows: "s", options: "s", modelOutlook: "m", regimes: "m" }),
      crypto_chart_widgets_width: "560",
    }),
    run: async (page) => {
      await page.keyboard.press("w");
      await page.waitForSelector("[data-widgets-drawer='open'] [data-widget]", { timeout: 8000 });
      await page.waitForTimeout(9000);
    },
  },
  /* Three widgets pinned to the home screen's corner, one under the pointer. */
  pinned: {
    store: () => ({
      crypto_chart_widgets: JSON.stringify({ ...Object.fromEntries(WIDGET_KEYS.map((k) => [k, false])), fearGreed: true, btcFees: true, watchlist: true }),
      crypto_chart_pinned_widgets: JSON.stringify(["fearGreed", "btcFees", "watchlist"]),
    }),
    run: async (page) => {
      await page.keyboard.press("2"); // 1D
      await page.waitForTimeout(9000);
      const box = await (await page.waitForSelector("[data-pinned='btcFees']", { timeout: 8000 })).boundingBox();
      await page.mouse.move(box.x + 30, box.y + 18);
      await page.waitForTimeout(800);
    },
  },
  /* A story read beside the list, with the counted reading of it. */
  newspreview: {
    store: () => ({}),
    run: async (page) => {
      await page.keyboard.press("n");
      await page.waitForTimeout(12000);
      const rows = await page.$$("a:has(.pt-news-title)");
      let target = null;
      for (const r of rows) if (/cryptopotato/i.test((await r.getAttribute("href")) || "")) { target = r; break; }
      await (target || rows[0]).click();
      await page.waitForSelector("[data-news-preview] [data-news-read-state]:not([data-news-read-state='loading'])", { timeout: 15000 });
      await page.waitForTimeout(1200);
    },
  },
  companion: {
    // The companion alone — the CPI marks and overlays each have their own shot's worth of lines
    store: () => ({ crypto_chart_companion: "true", crypto_chart_macro_events: "false" }),
    run: async (page) => {
      await page.keyboard.press("5"); // 1Y
      await page.waitForTimeout(14000); // years of daily candles, paged
      // Pointed at the newest badge, its card opens beside it (9 Oct 2026)
      const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll("[data-companion-badge]")].map((n) => n.getBoundingClientRect()).sort((a, c) => c.x - a.x)[0]; return b ? [b.x + b.width / 2, b.y + b.height / 2] : null; })()`);
      if (!at) throw new Error("companion: no badge on the chart");
      await page.mouse.move(at[0], at[1]);
      await page.waitForTimeout(800);
    },
  },
  portfolio: {
    store: (px) => ({ crypto_chart_portfolio: JSON.stringify(portfolioFor(px)), crypto_chart_portfolio_period: "month" }),
    run: async (page) => {
      await page.keyboard.press("p");
      await page.waitForSelector("[data-portfolio-head]", { timeout: 10000 });
      await page.waitForTimeout(6000);
    },
  },
  tax: {
    store: (px) => ({ crypto_chart_portfolio: JSON.stringify(portfolioFor(px)), crypto_chart_tax_settings: JSON.stringify({ country: "us" }) }),
    run: async (page) => {
      await page.keyboard.press("p");
      await page.waitForSelector("[data-portfolio-head]", { timeout: 10000 });
      await page.waitForTimeout(1500);
      await page.click("[data-portfolio-tax-open]");
      await page.waitForSelector("[data-tax-card]", { timeout: 6000 });
      await page.waitForTimeout(1500);
    },
  },
  practice: {
    store: () => ({ crypto_chart_practice_enabled: "true", crypto_chart_practice_consent: "true" }),
    run: async (page) => {
      await page.keyboard.press("f");
      await page.waitForSelector("[data-practice-page]", { timeout: 10000 });
      await page.waitForTimeout(9000); // the perpetual's candles, book and readings
    },
  },
  news: {
    store: () => ({}),
    run: async (page) => {
      await page.keyboard.press("n");
      await page.waitForTimeout(12000); // six feeds, each on its own clock
    },
  },
  baserates: {
    store: () => ({}),
    run: async (page) => {
      await page.keyboard.press("b");
      await page.waitForTimeout(14000);
    },
  },
  /* The chart's own tools (30 Sep 2026): zoomed into the day — the navigator
   * at the range row's left end — with a level, a trend line and a note drawn
   * on it, the price scale and the time axis round it. Anchored to the live
   * price, so the drawings sit on the line whatever the market did. */
  tools: {
    store: (px) => {
      const now = Date.now();
      const p = px.BTC;
      return {
        crypto_chart_drawings: JSON.stringify({
          BTC: [
            { id: "d-1", kind: "hline", currency: "USD", a: { t: now - 3 * HOUR_MS, p: Math.round(p * 1.004) }, at: 1 },
            { id: "d-2", kind: "trend", currency: "USD", a: { t: now - 7 * HOUR_MS, p: Math.round(p * 0.993) }, b: { t: now - HOUR_MS, p: Math.round(p * 0.999) }, at: 2 },
            { id: "d-3", kind: "note", currency: "USD", a: { t: now - 5 * HOUR_MS, p: Math.round(p * 1.006) }, note: "Watching this level", at: 3 },
          ],
        }),
      };
    },
    run: async (page) => {
      await page.keyboard.press("2"); // 1D
      await page.waitForTimeout(3000);
      await page.mouse.move(W / 2, 40);
      await page.keyboard.press("=");
      await page.waitForTimeout(600);
      await page.keyboard.press("=");
      await page.waitForTimeout(3500); // the finer candles for the window
      if (!(await page.$("[data-chart-nav-strip]"))) throw new Error("tools: no navigator — the chart did not zoom");
    },
  },
  /* Counted studies (30 Sep 2026): volume by price, the usual range's cone,
   * the regimes' shading and the levels where the price has turned, on a
   * month, over a year of daily candles. */
  studies: {
    store: () => ({
      crypto_chart_studies: JSON.stringify(["where", "profile", "regimes", "usualRange", "turnLevels"]),
      crypto_chart_macro_events: "false",
      crypto_chart_chart_type: "candles",
    }),
    run: async (page) => {
      await page.keyboard.press("4"); // 1M
      await page.waitForTimeout(14000); // years of daily candles, paged
      await page.mouse.move(W / 2, 40);
    },
  },
  /* The economic calendar and the next 24 hours (7–8 Oct 2026): a month
     with the US inflation, jobs, Fed and PCE releases marked, and the ranges
     for a day from now in the Chances line under the price. */
  events: {
    store: () => ({ crypto_chart_macro_events: "true", crypto_chart_chances: JSON.stringify(["tomorrow", "range"]) }),
    run: async (page) => {
      await page.keyboard.press("4"); // 1M
      await page.waitForSelector("[data-chance='tomorrow']", { timeout: 30000 }); // ten pages of 6-hour bars
      await page.mouse.move(W / 2, 40);
      await page.waitForTimeout(2500);
    },
  },
  /* The monitor ("M", 2 Oct 2026): every followed coin on one table, each
     from its own 30 days. */
  monitor: {
    store: () => ({}),
    run: async (page) => {
      await page.keyboard.press("m");
      await page.waitForSelector("[data-monitor-table]", { timeout: 10000 });
      await page.waitForTimeout(9000); // eight coins' months
      // The table is the screen's first tab; the correlation is the second
      const rows = await page.$$("[data-monitor-row]");
      if (rows.length < 8) throw new Error(`monitor: ${rows.length} rows, expected 8`);
    },
  },
  /* A settled call drawn again (8 Oct 2026). Three calls from the last day,
     placed on bands around what actually traded, two hits and a miss, the
     newest replayed. */
  replay: {
    store: (px, extra) => {
      const bars = extra.candles;
      const at = (ms) => bars.reduce((best, b) => (Math.abs(b[0] - ms) < Math.abs(best[0] - ms) ? b : best))[4];
      const hour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
      const call = (id, hoursAgo, hit) => {
        const target = hour - hoursAgo * HOUR_MS;
        const p = at(target);
        const mid = hit ? p : p * 1.006;
        return {
          id, coin: "BTC", currency: "USD", period: "day", target, span: HOUR_MS,
          lo: Math.round(mid * 0.9975), hi: Math.round(mid * 1.0025),
          placed: target - 3 * HOUR_MS, placedPrice: Math.round(at(target - 3 * HOUR_MS)),
          result: hit ? "hit" : "miss", settledPrice: Math.round(p), settledAt: target + 60e3, confidence: "likely",
        };
      };
      const done = [call("r1", 3, true), call("r2", 9, false), call("r3", 16, true)];
      return {
        crypto_chart_predict: "true",
        crypto_chart_calls: JSON.stringify({ record: { hits: 2, total: 3, streak: 1, best: 1 }, open: [], done }),
      };
    },
    run: async (page) => {
      await page.keyboard.press("2"); // 1D
      await page.waitForTimeout(3000);
      await page.keyboard.press("k");
      await page.waitForSelector("[data-call-replay-toggle='r1']", { timeout: 8000 });
      await page.click("[data-call-replay-toggle='r1']");
      await page.waitForSelector("[data-call-replay='r1'] [data-call-replay-square]", { timeout: 15000 });
      await page.mouse.move(W / 2, 40);
      await page.waitForTimeout(1500);
    },
  },
  /* On a phone (3–8 Oct 2026): three screens of the page as it runs from the
     home screen — the chart with its tab bar, a square being called on the
     sheet from the top, and More — laid side by side on one 1280×800 frame. */
  phone: {
    size: [390, 844],
    context: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    store: () => ({ crypto_chart_touch_hint_seen: "true" }),
    run: async (page, browser) => {
      const tapOn = async (sel) => {
        const at = await page.evaluate((s) => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
        if (!at) throw new Error(`phone: ${sel} is not on the page`);
        await page.touchscreen.tap(at[0], at[1]);
        await page.waitForTimeout(800);
      };
      await page.waitForSelector("[data-phone-bar]", { timeout: 10000 });
      await page.waitForTimeout(4000);
      const shots = [await page.screenshot()];
      // A call by touch: the board on, the first square that can be called, its sheet
      await page.keyboard.press("l");
      await page.waitForTimeout(2500);
      const at = await page.evaluate(() => {
        const svg = document.querySelector("[data-axes]").ownerSVGElement;
        const k = Object.keys(svg).find((x) => x.startsWith("__reactInternalInstance"));
        let f = svg[k];
        while (f && !(f.stateNode && f.stateNode.handleChartClick)) f = f.return;
        const c = f.stateNode;
        const r = svg.getBoundingClientRect();
        for (let x = c.nowX + 30; x < c.width; x += 4) {
          for (const y of [0.45, 0.35, 0.55]) {
            const cell = c.cellAt(x, c.height * y);
            if (cell && !c.callOccupying(cell)) return [r.x + x + 6, r.y + c.height * y];
          }
        }
        return null;
      });
      if (!at) throw new Error("phone: no square to call");
      await page.touchscreen.tap(at[0], at[1]);
      await page.waitForSelector("[data-phone-sheet='call']", { timeout: 6000 });
      await page.waitForTimeout(900);
      shots.push(await page.screenshot());
      await tapOn("[data-call-cancel]");
      await page.keyboard.press("l");
      await page.waitForTimeout(1200);
      await tapOn("[data-phone-tab='more']");
      await page.waitForSelector("[data-phone-more]", { timeout: 6000 });
      await page.waitForTimeout(900);
      shots.push(await page.screenshot());
      // Lay the three on one frame, the way the gallery shows every shot
      const frame = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      const imgs = shots.map((b) => `<img src="data:image/png;base64,${b.toString("base64")}">`).join("");
      await frame.setContent(`<!doctype html><style>
        html,body{margin:0;height:100%;background:#000}
        body{display:flex;align-items:center;justify-content:center;gap:56px;
          background:radial-gradient(ellipse at 50% 40%,#16181c 0%,#050506 70%)}
        img{height:704px;border-radius:40px;border:6px solid #2a2d33;
          box-shadow:0 0 0 1px #3a3e45,0 30px 60px -20px rgba(0,0,0,.9)}
      </style><body>${imgs}</body>`);
      await frame.waitForTimeout(300);
      const out = await frame.screenshot();
      await frame.close();
      return out;
    },
  },
  targets: {
    store: (px) => ({ crypto_chart_alerts: JSON.stringify(alertsFor(px)) }),
    run: async (page) => {
      await page.keyboard.press("3"); // 1W
      await page.waitForTimeout(2500);
      await page.keyboard.press("a");
      await page.waitForTimeout(4000);
    },
  },
};

(async () => {
  const args = process.argv.slice(2);
  const flag = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1] || "";
  const LANG = flag("lang");
  const outDir = flag("out") ? path.resolve(flag("out")) : OUT;
  const only = args.filter((a) => !a.startsWith("--"));
  const names = only.length ? only : Object.keys(SCENES);
  for (const n of names) if (!SCENES[n]) throw new Error(`unknown scene "${n}" — ${Object.keys(SCENES).join(", ")}`);

  const px = {};
  for (const c of ["BTC", "ETH", "SOL", "LINK", "DOGE"]) px[c] = await spot(c);
  const extra = { candles: names.includes("replay") ? await candles15() : [] };
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const name of names) {
      const scene = SCENES[name];
      const [vw, vh] = scene.size || [W, H];
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, colorScheme: "dark", ...(scene.context || {}) });
      const store = { ...BASE, ...scene.store(px, extra), ...(LANG ? { crypto_chart_language: LANG } : {}) };
      await ctx.addInitScript((s) => {
        if (sessionStorage.getItem("__seeded")) return;
        localStorage.clear();
        for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
        sessionStorage.setItem("__seeded", "1");
      }, store);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.goto(url, { waitUntil: "load" });
        await page.waitForSelector("svg path", { timeout: 20000 });
        /* Another language: its catalogue is fetched on the first load and
           kept, and labels built at load read the kept copy — so one more
           load, and every string is in that language. */
        if (LANG) {
          await page.waitForTimeout(1500);
          await page.reload({ waitUntil: "load" });
          await page.waitForSelector("svg path", { timeout: 20000 });
        }
        await page.waitForTimeout(2500);
        // A scene may lay out its own frame (the phone's three screens) and hand it back
        const own = await scene.run(page, browser);
        const file = path.join(outDir, `${name}.png`);
        if (Buffer.isBuffer(own)) fs.writeFileSync(file, own);
        else await page.screenshot({ path: file });
        const bytes = fs.statSync(file).size;
        if (errors.length) throw new Error(`page error: ${errors[0]}`);
        if (bytes < MIN_BYTES) throw new Error(`${bytes} bytes — nearly empty`);
        console.log(`✔ ${name}.png  ${(bytes / 1024).toFixed(0)} KB`);
      } catch (e) {
        failed++;
        console.log(`✘ ${name}: ${e.message}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
