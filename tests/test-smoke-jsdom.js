// Boot the real extension page (React + styled-components + d3 + app code)
// in jsdom with a fake network, and assert the chart renders valid data.
//
// Needs jsdom: run `npm install` inside tests/ first.
// Covers two scenarios:
//   cold       — empty localStorage (first run); also asserts the coin
//                prefetch stays off while the tab ticker / auto-rotate are off
//   hydrated   — persisted price cache from a "previous tab", including the
//                Date→ISO-string round trip that once produced NaN chart paths
//   background — tab opens hidden: no price requests may fire until the tab
//                becomes visible, then the chart must load normally
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let JSDOM;
try {
  ({ JSDOM } = require("jsdom"));
} catch (e) {
  console.log("SKIPPED: jsdom not installed (run `npm install` in tests/)");
  process.exit(0);
}

const NET_LATENCY = 100; // ms per fake request
const DEADLINE = 5000; // chart must be ready within this window

const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [...indexHtml.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map(
  (m) => m[1],
);

const runScenario = ({ hydrated = false, background = false } = {}) =>
  new Promise((resolve) => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      pretendToBeVisual: true,
      runScripts: "dangerously",
      url: "https://localhost/index.html",
    });
    const w = dom.window;

    let hiddenFlag = background;
    Object.defineProperty(w.document, "hidden", {
      configurable: true,
      get: () => hiddenFlag,
    });

    w.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    });

    if (hydrated) {
      // Persisted exactly as the app writes it: JSON turns the Date "time"
      // fields into ISO strings — hydration must revive them
      const histo = Array.from({ length: 24 }, (_, i) => ({
        price: 50000 + i * 10,
        time: new Date(Date.now() - (24 - i) * 3600000).toISOString(),
      }));
      w.localStorage.setItem(
        "crypto_chart_price_cache",
        JSON.stringify([
          ["BTC-hour-USD-history", { data: histo, timestamp: Date.now() - 120000 }],
          ["BTC-current-USD-spot", { data: 50240, timestamp: Date.now() - 120000 }],
        ]),
      );
    }

    const json = (body) => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    const requestLog = [];
    w.fetch = (url) => {
      requestLog.push(String(url));
      return new Promise((res) =>
        setTimeout(() => {
          const u = String(url);
          if (u.includes("/spot")) res(json({ data: { amount: "50250.55", currency: "USD" } }));
          else if (u.includes("historic"))
            res(json({ data: { prices: Array.from({ length: 24 }, (_, i) => ({
              price: String(50000 + i * 10),
              time: Math.floor(Date.now() / 1000) - (24 - i) * 3600,
            })) } }));
          else if (u.includes("exchange-rates"))
            res(json({ data: { currency: "USD", rates: { EUR: "0.9", TRY: "30" } } }));
          else if (u.includes("coinlore") && u.includes("tickers"))
            res(json({ data: [
              { symbol: "BTC", price_usd: "50250", percent_change_24h: "1.2" },
              { symbol: "ETH", price_usd: "1700", percent_change_24h: "-0.5" },
            ] }));
          else if (u.includes("coinlore"))
            res(json([{ btc_d: "55", total_mcap: 2e12, total_volume: 1e11, eth_d: "17" }]));
          else if (u.includes("alternative.me"))
            res(json({ data: [{ value: "50", value_classification: "Neutral", timestamp: "0" }] }));
          else if (u.includes("mempool")) res(json(840000));
          else res(json({ data: [] }));
        }, NET_LATENCY),
      );
    };

    let scriptError = null;
    w.addEventListener("error", (e) => {
      if (!scriptError) scriptError = e.message;
    });
    for (const s of scripts) {
      const el = w.document.createElement("script");
      el.textContent = fs.readFileSync(path.join(ROOT, s), "utf8");
      w.document.body.appendChild(el);
    }

    let chartReadyAt = null;
    let nanSeenAt = null;
    let requestsWhileHidden = null;
    const t0 = Date.now();
    if (background) {
      // Stay hidden for a while, then reveal the tab
      setTimeout(() => {
        requestsWhileHidden = requestLog.length;
        hiddenFlag = false;
        w.document.dispatchEvent(new w.Event("visibilitychange"));
      }, 1500);
    }
    const poll = setInterval(() => {
      const t = Date.now() - t0;
      for (const p of w.document.querySelectorAll("path[stroke]")) {
        const d = p.getAttribute("d");
        if (!d) continue;
        if (d.includes("NaN") && !nanSeenAt) nanSeenAt = t;
        if (d.length > 30 && !d.includes("NaN") && !chartReadyAt) chartReadyAt = t;
      }
      if ((chartReadyAt && t > 1500) || t > DEADLINE + 500) {
        clearInterval(poll);
        dom.window.close();
        resolve({ scriptError, chartReadyAt, nanSeenAt, requestLog, requestsWhileHidden });
      }
    }, 25);
  });

(async () => {
  let failed = false;
  for (const scenario of [
    { label: "cold" },
    { label: "hydrated", hydrated: true },
    { label: "background", background: true },
  ]) {
    const { label } = scenario;
    const r = await runScenario(scenario);
    const problems = [];
    if (r.scriptError) problems.push(`script error: ${r.scriptError}`);
    if (r.nanSeenAt !== null) problems.push(`NaN chart path at ${r.nanSeenAt}ms`);
    if (r.chartReadyAt === null) problems.push(`chart not ready within ${DEADLINE}ms`);
    if (label === "cold") {
      // Ticker + auto-rotate are off by default → prefetch must not run.
      // Prefetch is recognizable: period=hour history for non-current coins
      // (the background sweep only ever asks for period=day).
      const prefetched = r.requestLog.filter(
        (u) => u.includes("period=hour") && !u.includes("BTC-"),
      );
      if (prefetched.length) problems.push(`prefetch ran: ${prefetched[0]}`);
    }
    if (label === "background" && r.requestsWhileHidden > 0) {
      problems.push(`${r.requestsWhileHidden} requests fired while hidden`);
    }
    if (problems.length) {
      failed = true;
      console.error(`FAIL [${label}]: ${problems.join("; ")}`);
    } else {
      console.log(`PASS [${label}]: chart ready at ${r.chartReadyAt}ms, no NaN, no script errors`);
    }
  }
  if (failed) process.exit(1);
  console.log("ALL SMOKE TESTS PASSED");
  process.exit(0);
})();
