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
    if (url.includes("hn.algolia.com")) {
      // Same story returned for two terms (id 1) + a text post without a URL
      return { ok: true, status: 200, json: async () => ({ hits: [
        { objectID: "1", title: "Bitcoin hits a milestone", url: "https://example.com/a", points: 120 },
        { objectID: "2", title: "Ask HN: Crypto custody?", url: null, points: 80 },
        { objectID: "3", title: "", url: "https://example.com/c", points: 300 },
      ] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  },
  NEWS_API_URL: "https://api.blockchair.com/news",
  HN_NEWS_API: "https://hn.algolia.com/api/v1/search",
  HN_NEWS_TERMS: ["bitcoin", "crypto"],
  HN_NEWS_MIN_POINTS: 30,
  HN_NEWS_MAX_AGE_S: 7 * 86400,
  HN_NEWS_MAX_ITEMS: 8,
  MAX_NEWS_ITEMS: 50,
  NEWS_SPAM_RE:
    /price (prediction|analysis)|presale|pre-sale|best (coins?|cryptos?) to buy|casino|airdrop|giveaway|sponsored/i,
  encodeURIComponent,
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

  // Hacker News: one request per term, story-id dedupe across terms,
  // empty titles dropped, text posts link to the HN discussion
  fetchCalls = [];
  const hn = await run("fetchHackerNewsStories()");
  assert.strictEqual(fetchCalls.length, 2, "one request per HN term");
  assert.strictEqual(hn.length, 2, "empty title dropped, ids deduped");
  assert.strictEqual(hn[0].title, "Bitcoin hits a milestone", "sorted by points");
  assert.strictEqual(hn[0].source, "Hacker News", "source label");
  assert.strictEqual(hn[0].points, undefined, "internal points field stripped");
  assert.strictEqual(
    hn[1].url,
    "https://news.ycombinator.com/item?id=2",
    "text post links to the HN discussion",
  );

  // mergeNewsItems: priority order kept, spam filtered, near-duplicate
  // titles collapsed across sources, cap respected
  sandbox.__a = [
    { source: "x", title: "Bitcoin ETF approved!", url: "https://a" },
    { source: "x", title: "XRP Price Prediction: to the moon", url: "https://spam" },
  ];
  sandbox.__b = [
    { source: "y", title: "BITCOIN — ETF Approved", url: "https://dupe" },
    { source: "y", title: "Fresh story", url: "https://b" },
    null,
  ];
  const merged = run("mergeNewsItems(__a, __b)");
  assert.strictEqual(merged.length, 2, "spam + duplicate + junk dropped");
  assert.strictEqual(merged[0].url, "https://a", "first source wins the duplicate");
  assert.strictEqual(merged[1].title, "Fresh story", "second source appended");

  console.log("ALL API TESTS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
