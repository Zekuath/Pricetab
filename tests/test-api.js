const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

let fetchCalls = [];
const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number,
  parseInt, parseFloat, isFinite, isNaN, setTimeout, clearTimeout, Error, AbortController,
  fetch: async (url) => {
    fetchCalls.push(url);
    if (url.includes("/spot")) {
      return { ok: true, status: 200, json: async () => ({ data: { amount: "100", currency: "USD" } }) };
    }
    if (url.includes("historic")) {
      return { ok: true, status: 200, json: async () => ({ data: { prices: [
        { price: "80", time: 1 }, { price: "90", time: 2 },
      ] } }) };
    }
    if (url.includes("blockchair")) {
      return { ok: true, status: 200, json: async () => ({ data: [
        { source: "www.coindesk.com", title: "T".repeat(200), link: "https://x.com/a" },
        { source: 5, title: "", link: "http://insecure.com" },
        { source: "en.bitcoin.it", title: "Hello", link: "ftp://bad" },
      ] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  },
  NEWS_API_URL: "https://api.blockchair.com/news",
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "api.js"), "utf8"), sandbox, { filename: "api.js" });
const run = (c) => vm.runInContext(c, sandbox);

(async () => {
  // refreshPageTickerCoin: fetches, computes 24h change vs oldest price, caches
  await run('refreshPageTickerCoin("BTC", "USD", Date.now())');
  const entry = run('pageTickerCache.get("BTC-USD")');
  assert.strictEqual(entry.price, 100, "spot price cached");
  assert.strictEqual(entry.change, 25, "24h change = (100-80)/80");
  assert.strictEqual(entry.up, true, "direction up");
  assert.strictEqual(fetchCalls.length, 2, "two requests (spot + history)");

  // fresh cache → no new fetches
  fetchCalls = [];
  await run('refreshPageTickerCoin("BTC", "USD", Date.now())');
  assert.strictEqual(fetchCalls.length, 0, "fresh cache skips network");

  // news: title clamped to 140, junk filtered, http link dropped
  const news = await run("fetchBlockchairNews()");
  assert.strictEqual(news.length, 2, "empty-title article filtered");
  assert.strictEqual(news[0].title.length, 140, "title clamped");
  assert.strictEqual(news[0].source, "coindesk.com", "www. stripped");
  assert.strictEqual(news[0].url, "https://x.com/a", "https kept");
  assert.strictEqual(news[1].source, "bitcoin.it", "en. stripped");
  assert.strictEqual(news[1].url, null, "non-https dropped");

  console.log("ALL API TESTS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
