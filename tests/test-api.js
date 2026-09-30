const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

/* Pull the news regexes straight out of the source. Each is a single-line or
 * two-line `const NAME = /…/flags;` — anything that stops matching that shape
 * fails loudly here rather than silently reverting to a copy. */
const newsPatterns = () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "config.js"),
    "utf8",
  );
  const out = {};
  for (const name of [
    "NEWS_SPAM_RE",
    "NEWS_PROMO_PATH_RE",
    "NEWS_WIRE_RE",
    "NEWS_PROMO_CATEGORY_RE",
    "NEWS_PROMO_LEAD_RE",
  ]) {
    const m = src.match(
      new RegExp(`const ${name} =\\s*(/[\\s\\S]*?/[a-z]*);`),
    );
    if (!m) throw new Error(`${name} not found in config.js`);
    out[name] = eval(m[1]);
  }
  return out;
};

let fetchCalls = [];
// Whether each request could be abandoned — see NEWS_SOURCE_TIMEOUT_MS
let fetchSignals = [];
let chainFail = false; // simulates the balance providers going down
// A 200 with a body that is not the shape we asked for — the failure these
// two cards have to answer with null rather than with zeros
let mempoolBroken = false;
let coinbaseDown = false; // an edge error: a rejected fetch, as the browser sees it
let krakenError = false; // Kraken reports failures in a 200 response body
const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number,
  parseInt, parseFloat, isFinite, isNaN, setTimeout, clearTimeout, Error, AbortController,
  fetch: async (url, options) => {
    fetchCalls.push(url);
    fetchSignals.push(Boolean(options && options.signal));
    /* What a blocked or throttled edge looks like from inside the page: the
     * response carries no `Access-Control-Allow-Origin`, so the browser never
     * hands it over — `fetch` rejects with a TypeError and the console prints
     * a CORS complaint. Nothing distinguishes it from the network being down,
     * which is the point of the test. */
    if (coinbaseDown && url.includes("coinbase.com/api")) {
      throw new TypeError("Failed to fetch");
    }
    if (url.includes("/spot")) {
      return { ok: true, status: 200, json: async () => ({ data: { amount: "100", currency: "USD" } }) };
    }
    if (url.includes("historic")) {
      return { ok: true, status: 200, json: async () => ({ data: { prices: [
        { price: "80", time: 1 }, { price: "90", time: 2 },
      ] } }) };
    }
    /* The gas card asks the same node the ERC-20 sweep does, but with a
     * single (non-batched) call, so the stub branches on the method rather
     * than on the host. Base fees run 0x70fe2a2 → 0x864dcbe: the LAST entry
     * is the next block's, which is the reason `eth_feeHistory` is asked at
     * all rather than `eth_gasPrice`. Tips are 0.15 gwei ×3 then 0.2 ×2, so
     * the median is 0.15 and a mean would be wrong. */
    if (url.includes("ethereum-rpc") && options && String(options.body).includes("eth_feeHistory")) {
      return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result: {
        oldestBlock: "0x1",
        baseFeePerGas: ["0x70fe2a2", "0x787448f", "0x7793a70", "0x75ded4d", "0x7e255a7", "0x864dcbe"],
        reward: [["0x8f0d180"], ["0x8f0d180"], ["0x8f0d180"], ["0xbebc200"], ["0xbebc200"]],
        gasUsedRatio: [0.5, 0.5, 0.5, 0.5, 0.5],
      } }) };
    }
    /* The order book, and the instrument spec it cannot be read without.
       Sizes come off OKX in *contracts* — one BTC contract is 0.01 BTC — so
       the spec is what turns a wire figure into a number this panel can put
       beside a position. Both are answered here so the conversion is tested
       rather than assumed. */
    if (url.includes("public/instruments")) {
      return { ok: true, status: 200, json: async () => ({ code: "0", data: [
        { instId: "BTC-USDT-SWAP", ctVal: "0.01", ctValCcy: "BTC", tickSz: "0.1", lotSz: "0.01" },
      ] }) };
    }
    /* The perpetual the derivatives account trades at: a ticker, and candles
       that page back through history — the year range asks for more than one
       page holds. Candle times count down from a fixed hour so the order can
       be checked. */
    if (url.includes("okx.com") && url.includes("market/ticker")) {
      return { ok: true, status: 200, json: async () => ({ code: "0", data: [
        { instId: "BTC-USDT-SWAP", last: "50000", open24h: "40000", high24h: "51000", low24h: "39000" },
      ] }) };
    }
    if (url.includes("okx.com") && url.includes("candles")) {
      const lim = Number((url.match(/limit=(\d+)/) || [])[1]);
      const after = Number((url.match(/after=(\d+)/) || [])[1]) || 1e12 + 86400000;
      const data = Array.from({ length: lim }, (_, i) => {
        const t = after - (i + 1) * 86400000;
        return [String(t), "1", "1", "1", String(100 + i), "1", "1", "1", "1"];
      });
      return { ok: true, status: 200, json: async () => ({ code: "0", data }) };
    }
    if (url.includes("market/books")) {
      return { ok: true, status: 200, json: async () => ({ code: "0", data: [{
        /* asks ascending, bids descending, as the venue sends them */
        asks: [["100.5", "10", "0", "3"], ["100.6", "20", "0", "4"], ["0", "5", "0", "1"]],
        bids: [["100.4", "40", "0", "2"], ["100.3", "5", "0", "1"]],
      }] }) };
    }
    if (url.includes("fees/recommended")) {
      return { ok: true, status: 200, json: async () => (
        { fastestFee: 7, halfHourFee: 3, hourFee: 1, economyFee: 1, minimumFee: 1 }
      ) };
    }
    if (url.endsWith("/api/mempool")) {
      if (mempoolBroken) return { ok: true, status: 200, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => (
        { count: 82268, vsize: 3100000, total_fee: 7404202 }
      ) };
    }
    if (url.includes("difficulty-adjustment")) {
      if (mempoolBroken) return { ok: true, status: 200, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({
        progressPercent: 51.8,
        difficultyChange: 4.5078,
        remainingBlocks: 971,
        remainingTime: 558002628,
        previousRetarget: 1.3065,
      }) };
    }
    if (url.includes("ethereum-rpc")) {
      /* Answers the batch it was actually given, by method — the ether now
       * rides in the same request as the tokens (`eth_getBalance` beside the
       * `eth_call`s), so a stub returning two fixed rows would be testing a
       * request shape the code no longer sends.
       *
       * 2 ETH, then 1 LINK (18 decimals) and 2.5 USDC (6 decimals). */
      const sent = JSON.parse(String(options && options.body));
      const batch = Array.isArray(sent) ? sent : [sent];
      let token = 0;
      const token18 = "0x0de0b6b3a7640000"; // 1 × 10^18
      const token6 = "0x2625a0"; // 2.5 × 10^6
      return { ok: true, status: 200, json: async () => batch.map((call) => ({
        jsonrpc: "2.0",
        id: call.id,
        result: call.method === "eth_getBalance"
          ? "0x1bc16d674ec80000" // 2 × 10^18 wei = 2 ETH
          : (token++ === 0 ? token18 : token6),
      })) };
    }
    if (url.includes("coinlore.com/api/global")) {
      return { ok: true, status: 200, json: async () => ([
        { total_mcap: 2e12, total_volume: 1e11, btc_d: "55.5", eth_d: "17.2", mcap_change: "1.1" },
      ]) };
    }
    if (url.includes("exchange-rates")) {
      return { ok: true, status: 200, json: async () => ({ data: { rates: { TRY: "30" } } }) };
    }
    if (url.includes("kraken.com") && krakenError) {
      return { ok: true, status: 200, json: async () => ({ error: ["EQuery:Unknown asset pair"] }) };
    }
    if (url.includes("kraken.com/0/public/OHLC")) {
      // Kraken names the result key itself and returns strings; 4 rows so
      // the tail slice (points: 3) is exercised
      return { ok: true, status: 200, json: async () => ({ error: [], result: {
        XXMRZUSD: [
          [1000, "10", "12", "9", "11", "10.5", "100", 3],
          [2000, "11", "13", "10", "12", "11.5", "110", 4],
          [3000, "12", "14", "11", "13", "12.5", "120", 5],
          [4000, "13", "15", "12", "14", "13.5", "130", 6],
        ],
        last: 4000,
      } }) };
    }
    if (url.includes("kraken.com/0/public/Ticker")) {
      return { ok: true, status: 200, json: async () => ({ error: [], result: {
        XXMRZUSD: { c: ["380.5", "1.0"] },
      } }) };
    }
    if (url.includes("api.exchange.coinbase.com")) {
      // [time, low, high, open, close, volume], newest first + a junk row
      return { ok: true, status: 200, json: async () => ([
        [3000, 1, 2, 3, 4, 5],
        [2000, 1, 2, 3, 4, 5],
        [1, 2, 3],
        [1000, 1, 2, 3, 4, 5],
      ]) };
    }
    if (url.includes("mempool.space") && url.includes("/txs")) {
      if (chainFail) return { ok: false, status: 500, json: async () => ({}) };
      // Newest first, like the real API: a 0.25 spend after a 1 BTC receive
      const A = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
      return { ok: true, status: 200, json: async () => ([
        { status: { block_time: 200 },
          vin: [{ prevout: { scriptpubkey_address: A, value: 25000000 } }],
          vout: [{ scriptpubkey_address: "other", value: 24000000 }] },
        { status: { block_time: 100 },
          vin: [],
          vout: [{ scriptpubkey_address: A, value: 100000000 },
                 { scriptpubkey_address: "other", value: 5 }] },
      ]) };
    }
    if (url.includes("mempool.space/api/address/")) {
      if (chainFail) return { ok: false, status: 500, json: async () => ({}) };
      // 1.5 funded − 0.5 spent = 1 BTC
      return { ok: true, status: 200, json: async () => ({
        chain_stats: { funded_txo_sum: 150000000, spent_txo_sum: 50000000 },
      }) };
    }
    if (url.includes("dashboards/address")) {
      if (chainFail) return { ok: false, status: 430, json: async () => ({}) };
      // 2 ETH in wei, keyed by a re-cased address (provider quirk)
      return { ok: true, status: 200, json: async () => ({
        data: { RECASED: { address: { balance: "2000000000000000000" } } },
      }) };
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
    if (url.includes("okx.com/api/v5/public/funding-rate")) {
      /* A 4-hour instrument, with the premium the venue sends. The interval
         has to come from the two stamps, not from "three a day". */
      return { ok: true, status: 200, json: async () => ({ data: [{ fundingRate: "0.0001", fundingTime: "1790121600000", nextFundingTime: "1790136000000", premium: "-0.00052" }] }) };
    }
    if (url.includes("okx.com/api/v5/public/open-interest")) {
      return { ok: true, status: 200, json: async () => ({ data: [{ oiUsd: "1000000" }] }) };
    }
    /* Bybit's daily series for the structure readings. Funding: 200 a page,
       three settlements a day, walked back with endTime — the first page is
       full so the fetcher must ask again, the second is short so it stops.
       Open interest: 200 a page with a cursor, the second page without one. */
    if (url.includes("bybit.com/v5/market/funding/history")) {
      const m = url.match(/endTime=(\d+)/);
      const end = m ? Number(m[1]) : Date.now();
      const count = m ? 40 : 200;
      const list = Array.from({ length: count }, (_, i) => ({
        symbol: "BTCUSDT",
        fundingRate: String(0.0001 * (1 + (i % 3))),
        fundingRateTimestamp: String(end - (i + 1) * 8 * 3600e3),
      }));
      return { ok: true, status: 200, json: async () => ({ retCode: 0, result: { list } }) };
    }
    if (url.includes("bybit.com/v5/market/open-interest")) {
      const paged = url.includes("cursor=");
      const list = Array.from({ length: paged ? 50 : 200 }, (_, i) => ({
        openInterest: String(50000 + i),
        timestamp: String(Date.now() - ((paged ? 200 : 0) + i + 1) * 86400e3),
      }));
      return { ok: true, status: 200, json: async () => ({ retCode: 0, result: { list, nextPageCursor: paged ? "" : "page2" } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  },
  HN_NEWS_API: "https://hn.algolia.com/api/v1/search",
  HN_NEWS_TERMS: ["bitcoin", "crypto"],
  HN_NEWS_MIN_POINTS: 30,
  HN_NEWS_MAX_AGE_S: 7 * 86400,
  HN_NEWS_MAX_ITEMS: 8,
  MAX_NEWS_ITEMS: 50,
  COIN_NAMES: { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", OP: "Optimism", BAT: "Basic Attention Token", TON: "Toncoin" },
  /* The promo patterns are **read out of `config.js`** rather than copied.
   * Three of them used to be typed out here, and a pattern tightened in the
   * source while the copy stayed put is a test that passes against a rule the
   * app no longer has — the failure mode is silence. `isPromoNews` is the one
   * predicate every path to the screen goes through, so it is the last place
   * that should be tested against a stale copy. */
  ...newsPatterns(),
  encodeURIComponent,
  WATCH_CHAINS: {
    BTC: { provider: "mempool", decimals: 8 },
    ETH: { provider: "blockchair", chain: "ethereum", decimals: 18 },
  },
  WATCH_ADDRESS_RE: /^[A-Za-z0-9]{20,100}$/,
  WATCH_BALANCE_TTL: 600000,
  ERC20_TOKENS: {
    LINK: { address: "0xLINKCONTRACT", decimals: 18 },
    USDC: { address: "0xUSDCCONTRACT", decimals: 6 },
  },
  ETH_RPC: "https://ethereum-rpc.publicnode.com",
  ERC20_BALANCE_SELECTOR: "0x70a08231",
  BigInt,
  OHLC_GRANULARITY: {
    hour: { granularity: 60, points: 60 },
    day: { granularity: 900, points: 2 }, // small, so the window slice shows
    week: { granularity: 3600, points: 168 },
  },
  OHLC_CURRENCIES: ["USD", "EUR", "GBP"],
  OHLC_CACHE_TTL: 300000,
  providerFor: (coin) => (coin === "XMR" ? "kraken" : "coinbase"),
  // The runtime half of the same policy — the real one lives in config.js and
  // is exercised end to end in tests/test-provider.js
  effectiveProvider: (coin) => (coin === "XMR" ? "kraken" : "coinbase"),
  KRAKEN_API: "https://api.kraken.com/0/public/",
  KRAKEN_PERIODS: {
    day: { interval: 5, points: 3 }, // small, so the tail slice shows
    week: { interval: 60, points: 168 },
    all: { interval: 21600, points: 720 },
  },
};
/* A real (in-memory) localStorage, because the news archive is a persisted
 * store and "does it survive a new tab" is most of what there is to test about
 * it. Defined before the context is created so `api.js` hydrates through it at
 * load, exactly as it does in a browser. */
const lsStore = {};
sandbox.localStorage = {
  getItem: (k) => (k in lsStore ? lsStore[k] : null),
  setItem: (k, v) => { lsStore[k] = String(v); },
  removeItem: (k) => { delete lsStore[k]; },
};
vm.createContext(sandbox);
// `cleanFeedSummary` decodes entities the same way the titles do, and that
// lives in utils.js — loaded with the same chainable `line()` stub
// tests/test-storage.js uses, since utils.js touches d3 at load time
sandbox.line = () => {
  const o = {};
  o.x = () => o;
  o.y = () => o;
  o.curve = () => o;
  return o;
};
sandbox.String = String;
for (const f of ["i18n.js", "utils.js", "api.js", "widgets-data.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), sandbox, { filename: f });
}
const run = (c) => vm.runInContext(c, sandbox);
// vm-created objects need stringify comparison (see tests/README)
const json = (c) => JSON.parse(JSON.stringify(run(c)));

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

  /* isPromoNews — advertising must not reach the panel, and the three signals
   * are not equally strong. The order they are asked in is the finding:
   * measured against live feeds on 21 Aug 2026, the wording rule caught 0 of
   * the 5 advertisements in one CoinJournal response, while the outlet's own
   * filing caught every one. So the path and the byline carry this, and the
   * regex is the net under the net. */
  const promo = (item) => {
    sandbox.__item = item;
    return run("isPromoNews(__item)");
  };
  assert.strictEqual(
    promo({ title: "MEXC's Proof-of-Reserves Confirms User Assets Fully Backed",
            url: "https://coinjournal.net/news/mexc-proof-of-reserves/" }),
    false,
    "a press release that reads like a headline is not caught by wording — this is why the WordPress category is excluded server-side instead",
  );
  assert.strictEqual(
    promo({ title: "Aligned launches ALIGN, the native token of its stack",
            url: "https://cryptoslate.com/press-releases/aligned-launches-align/" }),
    true,
    "the outlet filed it under press-releases",
  );
  assert.strictEqual(
    promo({ title: "Some project announces a thing",
            url: "https://cryptoslate.com/some-project-announces-a-thing/",
            author: "Chainwire" }),
    true,
    "the byline is a press-release wire",
  );
  assert.strictEqual(
    promo({ title: "Exchange partners with a bank",
            url: "https://decrypt.co/1/exchange-partners-with-a-bank" }),
    false,
    "'partners' inside a slug is not a /partner-content/ section",
  );
  assert.strictEqual(
    promo({ title: "XRP Price Prediction: to the moon", url: "https://x/a" }),
    true,
    "the wording rule still earns its place on the obvious ones",
  );

  /* Bitcoin.com's word for it, from the live feed of 28 Aug 2026 — the poll
   * that qualified it as the fourth always-on source. One item of ten was a
   * paid post, and the outlet filed it three ways at once: a `Branded
   * Spotlight` category, a `/branded-spotlight/` path, and `Media` as the
   * byline. It slipped through **all** of the existing signals, because none
   * of them knew that word, which is the check the house rule asks for before
   * a source is added. Asserted from the path and the category separately, so
   * removing either one fails here rather than on somebody's screen. */
  assert.strictEqual(
    promo({
      title: "CoinRabbit Hits Six Years of Incident-Free Custody",
      url: "https://news.bitcoin.com/branded-spotlight/coinrabbit-hits-six-years/",
      author: "Media",
    }),
    true,
    "a branded-spotlight path is the outlet filing its own advertising",
  );
  assert.strictEqual(
    promo({
      title: "CoinRabbit Hits Six Years of Incident-Free Custody",
      url: "https://news.bitcoin.com/2026/08/coinrabbit-six-years/",
      categories: ["Branded Spotlight"],
    }),
    true,
    "…and so is the category, on its own",
  );
  assert.strictEqual(
    promo({
      title: "Circle Brings USDC Into UK Premier League With Chelsea Shirt Deal",
      url: "https://news.bitcoin.com/crypto-news/circle-usdc-chelsea/",
      author: "Emmanuel Musa",
      categories: ["Crypto News", "Circle", "USDC"],
    }),
    false,
    "a sponsorship deal reported as news is a story about branding, not a branded story",
  );

  /* Two signals that did not exist until the summary was read onto the row,
   * both taken from a live CryptoSlate item on 23 Aug 2026: an unremarkable
   * title, a human byline, and the outlet's own `Guest Post` category with a
   * summary that opens by disclosing it. Under the old three rules this
   * reached the panel. */
  assert.strictEqual(
    promo({
      title: "The next phase of tokenization is utility",
      url: "https://cryptoslate.com/the-next-phase-of-tokenization-is-utility/",
      author: "Vincent Maliepaard",
      categories: ["Guest Post"],
    }),
    true,
    "the outlet's own category says it is a guest post",
  );
  assert.strictEqual(
    promo({
      title: "The next phase of tokenization is utility",
      url: "https://cryptoslate.com/the-next-phase-of-tokenization-is-utility/",
      summary:
        "The following is a guest post and opinion from Vincent Maliepaard, VP of Marketing at Sentora.",
    }),
    true,
    "…and so does the disclosure it opens with, on its own",
  );
  assert.strictEqual(
    promo({
      title: "Crypto media is drowning in press releases",
      url: "https://decrypt.co/1/crypto-media-press-releases",
      categories: ["Markets", "Opinion"],
      summary:
        "A new study counts how many press releases ran as news last quarter.",
    }),
    false,
    "a story *about* press releases is not one — both rules are anchored",
  );

  /* The summary itself: tags stripped without touching innerHTML, entities
   * decoded like the titles, whitespace collapsed, and cut on a word. */
  {
    const clean = (v) => run(`cleanFeedSummary(${JSON.stringify(v)})`);
    assert.strictEqual(
      clean("<p>Spot bitcoin funds took in <b>$1.2bn</b> &amp; more.</p>"),
      "Spot bitcoin funds took in $1.2bn & more.",
      "tags out, entities decoded, spacing collapsed",
    );
    assert.strictEqual(
      clean("<script>alert(1)</script>Real text"),
      "Real text",
      "a script body is removed rather than flattened into the sentence",
    );
    assert.strictEqual(clean(null), "", "a missing summary is an empty string");
    const long = clean("word ".repeat(120));
    assert.ok(long.length <= 221, `clamped, got ${long.length}`);
    assert.ok(long.endsWith("…"), "…and says it was clamped");
    assert.ok(!/ …$/.test(long), "…without leaving a dangling space");
  }

  // Hacker News: one request per term, story-id dedupe across terms,
  // empty titles dropped, text posts link to the HN discussion
  fetchCalls = [];
  const hn = await run("fetchHackerNewsStories()");
  assert.strictEqual(fetchCalls.length, 2, "one request per HN term");
  assert.strictEqual(hn.length, 2, "empty title dropped, ids deduped");
  assert.strictEqual(hn[0].title, "Bitcoin hits a milestone", "sorted by points");
  assert.strictEqual(hn[0].source, "Hacker News", "source label");
  // Kept since 29 Sep 2026: the row prints it in place of a summary
  assert.strictEqual(hn[0].points, 120, "the story's points ride along for its row");
  assert.strictEqual(
    hn[1].url,
    "https://news.ycombinator.com/item?id=2",
    "text post links to the HN discussion",
  );

  /* **A source may not hold the feed open** (30 Sep 2026). With no limit, one
   * host that accepted the connection and never answered kept the whole
   * feed's fetch — and the latch behind it — open for the life of the tab.
   * Every request a source makes can now be abandoned. */
  fetchSignals = [];
  await run('fetchNewsSource({ id: "hn", name: "Hacker News", kind: "hn" })');
  assert.ok(fetchSignals.length === 2 && fetchSignals.every(Boolean),
    `every news request carries a signal it can be abandoned by — ${JSON.stringify(fetchSignals)}`);

  /* balanceNewsItems: the feed kept for the panel is the newest overall up to
   * its cap, and never at the cost of a whole source. It was the newest fifty
   * across every source, and a desk that publishes a few stories a day fell
   * off the end and was then called silent. */
  sandbox.__feed = [
    ...Array.from({ length: 30 }, (_, i) => ({ source: "Busy", title: `b${i}`, time: 1000 - i })),
    ...Array.from({ length: 3 }, (_, i) => ({ source: "Slow", title: `s${i}`, time: 500 - i })),
  ];
  const bal = json("balanceNewsItems(__feed, 10, 2)");
  assert.strictEqual(bal.length, 10, "the feed is capped");
  assert.deepStrictEqual(bal.filter((i) => i.source === "Slow").map((i) => i.title), ["s0", "s1"],
    "…a slow source keeps its newest two however old");
  assert.deepStrictEqual(bal.slice(0, 8).map((i) => i.title), ["b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7"],
    "…the rest are the newest overall, still newest first");
  assert.strictEqual(json("balanceNewsItems(__feed.slice(0, 5), 10, 2)").length, 5, "under the cap nothing is dropped");

  /* Headlines for a coin: a general crypto feed beside a falling chart
   * would mostly show other coins' news, and proximity alone reads as
   * explanation — so a story has to name the coin, and an empty result is
   * the right answer rather than filler. */
  const now = Date.now();
  sandbox.__news = [
    { title: "BTC breaks $70,000", tags: "", time: now - 1000, url: "a" },
    { title: "Ethereum staking update", tags: "", time: now - 2000, url: "b" },
    { title: "Analysts weigh in on Bitcoin", tags: "", time: now - 3000, url: "c" },
    { title: "Something about markets", tags: "Bitcoin (BTC)", time: now - 4000, url: "d" },
    { title: "BTC rally continues", tags: "", time: now - 999999999, url: "old" },
  ];
  const forCoin = (coin, since, limit) =>
    json(`headlinesForCoin(__news, ${JSON.stringify(coin)}, ${since}, ${limit || 2})`).map(
      (i) => i.url,
    );

  assert.deepStrictEqual(forCoin("BTC", now - 10000), ["a", "c"], "symbol and full name both match");
  assert.deepStrictEqual(forCoin("BTC", now - 10000, 4), ["a", "c", "d"], "the feed's own tag counts too");
  assert.deepStrictEqual(forCoin("ETH", now - 10000), ["b"], "matches by name for another coin");
  assert.deepStrictEqual(forCoin("SOL", now - 10000), [], "no mention → nothing, not filler");

  // Outside the window is out, however well it matches
  assert.ok(!forCoin("BTC", now - 10000, 5).includes("old"), "older than the window is excluded");
  assert.strictEqual(forCoin("BTC", now - 10000, 1).length, 1, "limit respected");

  // Tickers are written in caps; lowercase matching would make OP, BAT and
  // TON fire on ordinary English
  sandbox.__prose = [
    { title: "The op-ed on bats and tons of trading", tags: "", time: now, url: "prose" },
  ];
  for (const coin of ["OP", "BAT", "TON"]) {
    assert.deepStrictEqual(
      json(`headlinesForCoin(__prose, ${JSON.stringify(coin)}, 0, 2)`),
      [],
      `"${coin}" does not match lowercase prose`,
    );
  }
  // A word-boundary check, so a ticker inside a longer token doesn't match
  sandbox.__partial = [{ title: "BTCUSD pair listed", tags: "", time: now, url: "p" }];
  assert.deepStrictEqual(
    json('headlinesForCoin(__partial, "BTC", 0, 2)'),
    [],
    "a ticker inside a longer token is not a mention",
  );

  assert.deepStrictEqual(json('headlinesForCoin(null, "BTC", 0, 2)'), [], "no feed → nothing");
  assert.deepStrictEqual(json("headlinesForCoin(__news, null, 0, 2)"), [], "no coin → nothing");

  /* The scrolling headline row's own filter: the same "does this story name
   * this coin" rule, asked across a set instead of one coin. It shares
   * `newsMentionsCoin` with the line above precisely so the two cannot come
   * to disagree about what "about BTC" means. */
  const forCoins = (coins) =>
    json(`newsForCoins(__news, ${JSON.stringify(coins)})`).map((i) => i.url);

  assert.deepStrictEqual(
    forCoins(["BTC"]),
    ["a", "c", "d", "old"],
    "every story naming the coin, by symbol, by name and by the feed's tag",
  );
  assert.deepStrictEqual(
    forCoins(["ETH", "SOL"]),
    ["b"],
    "a set is a union, and a coin nobody wrote about adds nothing",
  );
  assert.deepStrictEqual(forCoins(["SOL"]), [], "no mention → an empty row, not filler");
  /* An empty set means "you are not tracking anything", not "show nothing":
   * a row that went blank because a portfolio has not been filled in yet
   * looks like a broken feature rather than an honoured setting. */
  assert.strictEqual(
    json("newsForCoins(__news, []).length"),
    5,
    "no coins to narrow to → the whole feed",
  );
  assert.strictEqual(json("newsForCoins(__news, null).length"), 5, "…and the same for nothing");
  assert.deepStrictEqual(json('newsForCoins(null, ["BTC"])'), [], "no feed → nothing");
  // The same word-boundary and case rules the single-coin version follows
  assert.deepStrictEqual(json('newsForCoins(__partial, ["BTC"])'), [], "not a mention inside a longer token");
  assert.deepStrictEqual(json('newsForCoins(__prose, ["OP", "BAT", "TON"])'), [], "not lowercase prose");

  /* The news cache, read back as untrusted input.
   *
   * It was the one stored shape with no sanitizer: accepted whenever `items`
   * was a non-empty array, with `url` going straight into an `href`. Measured
   * with a hand-edited cache, a `javascript:` URL and a plain `http://` one
   * both reached the DOM. */
  sandbox.__dirty = [
    { source: "www.evil.example", title: "click me", url: "javascript:alert(1)" },
    { source: "x", title: "downgrade", url: "http://insecure.example/a" },
    { source: "ok", title: "a real one", url: "https://example.com/ok", time: 123 },
    { source: "n", title: 42, url: "https://example.com/n" },
    null,
    "not an object",
    { source: "l", title: "x".repeat(400), url: "https://example.com/l" },
  ];
  const clean = json("sanitizeNewsItems(__dirty)");

  assert.strictEqual(clean.length, 4, `only the shaped rows survive — ${clean.length}`);
  assert.strictEqual(clean[0].url, null, "a javascript: URL never becomes an href");
  assert.strictEqual(clean[1].url, null, "nor does a plain http: one");
  assert.strictEqual(clean[2].url, "https://example.com/ok", "https is kept");
  assert.strictEqual(clean[0].source, "evil.example", "the source prefix is trimmed as on fetch");
  assert.strictEqual(clean[3].title.length, 140, "titles are capped at the fetcher's limit");
  /* The row is kept without its link rather than dropped: the headline is
   * still a headline, and silently losing rows would make a corrupt cache look
   * like a quiet news day. */
  assert.strictEqual(clean[0].title, "click me", "an unsafe link costs the link, not the row");
  assert.deepStrictEqual(json("sanitizeNewsItems(null)"), [], "no list → nothing");
  assert.deepStrictEqual(json('sanitizeNewsItems("nope")'), [], "…and a non-list is a non-list");

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

  /* clusterNewsItems: one event is one row, two events are two.
   *
   * The test is written from both sides on purpose. Asserting only that four
   * write-ups of the ETF story fold would pass with a threshold of zero, which
   * would fold the entire panel into one row; asserting only that the two Fed
   * stories stay apart would pass with a threshold of one, which folds
   * nothing. The pair is what pins the threshold down, and the second half is
   * the one that must never be relaxed to make a stubborn duplicate merge —
   * merging two different stories hides one of them, while failing to merge
   * two versions of one leaves what is on screen today. */
  const nowMs = Date.now();
  sandbox.__feed = [
    { source: "Decrypt", time: nowMs, title: "Bitcoin ETF Sees Record $1.2B Inflow as Price Nears $100K", url: "https://d" },
    { source: "CoinJournal", time: nowMs - 6e5, title: "Record inflows push Bitcoin ETFs past $1.2 billion", url: "https://cj" },
    { source: "Cointelegraph", time: nowMs - 9e5, title: "Bitcoin ETFs notch record $1.2B daily inflow", url: "https://ct" },
    { source: "CryptoSlate", time: nowMs - 12e5, title: "Bitcoin ETF inflows hit record high of $1.2B", url: "https://cs" },
    { source: "Bitcoin Magazine", time: nowMs - 2e6, title: "Ethereum upgrade goes live on mainnet", url: "https://bm" },
    { source: "CNBC", time: nowMs - 3e6, title: "Fed holds rates steady", url: "https://cnbc" },
    { source: "MarketWatch", time: nowMs - 4e6, title: "Fed signals rate cut in December", url: "https://mw" },
  ];
  const clustered = run("clusterNewsItems(__feed)");
  assert.strictEqual(clustered.length, 4, "four write-ups of one story become one row");
  assert.strictEqual(clustered[0].source, "Decrypt", "the newest leads, so the list stays sorted");
  assert.strictEqual(
    clustered[0].also.map((a) => a.source).join(","),
    "CoinJournal,Cointelegraph,CryptoSlate",
    "the rest ride along by name",
  );
  assert.ok(
    clustered[0].also.every((a) => a.url && a.title),
    "…with their own link and their own headline, so nothing is discarded",
  );
  /* The half that guards the threshold from above. Both name the Fed, both are
   * about rates, and they are not the same story. */
  assert.strictEqual(
    clustered.slice(2).map((i) => i.source).join(","),
    "CNBC,MarketWatch",
    "two different rate stories stay two rows",
  );
  assert.ok(
    clustered.slice(1).every((i) => !i.also),
    "a row with nothing folded into it carries no `also` at all",
  );

  // The same words months apart are a different event.
  sandbox.__old = [
    { source: "a", time: nowMs, title: "Bitcoin ETF inflows hit record high of $1.2B" },
    { source: "b", time: nowMs - 40 * 24 * 3600 * 1000, title: "Bitcoin ETF inflows hit record high of $1.2B" },
  ];
  assert.strictEqual(
    run("clusterNewsItems(__old)").length,
    2,
    "the same headline outside the window is a different story",
  );
  /* The same two headlines must get the same answer in a feed of six and a
   * feed of sixty. This is a regression test for a bug that failed **silently
   * in one direction**: the weights are `log(1 + n/df)`, so their scale moves
   * with the size of the feed, and a first version guarded the denominator
   * with an absolute number tuned on 116 live headlines. In a seven-item feed
   * every weight sits below that number, the guard swallowed every pair, and
   * clustering simply stopped happening — with nothing on screen to say so,
   * because "no duplicates found" and "the feature is off" look identical.
   * The floor is a fraction of the feed's own median now. */
  const SUBJECTS = ("regulator custodian brokerage exchange miner auditor insurer " +
    "clearinghouse depositary registrar underwriter arbitrator liquidator " +
    "ombudsman notary actuary assessor bailiff chancellor comptroller " +
    "curator dean escrow factor guarantor herald inspector juror keeper " +
    "lender").split(" ");
  const VERBS = ("expands withdraws reorganises publishes appeals defers " +
    "consolidates diversifies liquidates renegotiates").split(" ");
  const pair = [
    { source: "A", title: "Bitcoin ETF inflows hit record high of $1.2B", url: "https://a" },
    { source: "B", title: "Record inflows push Bitcoin ETFs past $1.2 billion", url: "https://b" },
  ];
  sandbox.__small = pair.map((i) => ({ ...i, time: nowMs }));
  sandbox.__big = [
    ...pair.map((i) => ({ ...i, time: nowMs })),
    /* Filler that is genuinely fifty-eight different stories. An earlier
     * version varied only a number, which `clusterNewsItems` correctly folded
     * into one row — the test then measured the filler rather than the pair it
     * was padding. Two rotating vocabularies, so no two share enough to pair
     * off. */
    ...Array.from({ length: 58 }, (_, k) => ({
      source: "C",
      title: `${SUBJECTS[k % SUBJECTS.length]} ${VERBS[k % VERBS.length]} ${k}`,
      time: nowMs - k * 60000,
    })),
  ];
  assert.strictEqual(
    run("clusterNewsItems(__small).length"),
    1,
    "two write-ups of one story fold in a small feed",
  );
  assert.strictEqual(
    run("clusterNewsItems(__big).length"),
    59,
    "…and in a feed ten times the size, where the weights are on a different scale",
  );

  assert.strictEqual(run("clusterNewsItems([]).length"), 0, "no items → nothing");
  assert.strictEqual(run("clusterNewsItems(null).length"), 0, "…and a non-list is a non-list");

  // fetchAddressBalance: provider parsing, unit conversion, caching, guards
  const btcAddr = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
  const ethAddr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  fetchCalls = [];
  assert.strictEqual(
    await run(`fetchAddressBalance("BTC", "${btcAddr}")`),
    1,
    "BTC: (funded − spent) satoshi → coins",
  );
  await run(`fetchAddressBalance("BTC", "${btcAddr}")`);
  assert.strictEqual(fetchCalls.length, 1, "second lookup within TTL is cached");
  /* The ether comes from the node the tokens come from, not from Blockchair —
   * one request to one host for an Ethereum address, and the provider whose
   * anonymous limit blacklists a whole IP is out of that path. The previous
   * version of this assertion checked Blockchair's re-cased response key,
   * which was correct about the design it was written for. */
  fetchCalls = [];
  assert.strictEqual(
    await run(`fetchAddressBalance("ETH", "${ethAddr}")`),
    2,
    "ETH: wei → coins",
  );
  assert.strictEqual(
    fetchCalls.filter((u) => u.includes("blockchair")).length,
    0,
    "…and Blockchair is never asked about an Ethereum address",
  );
  assert.strictEqual(fetchCalls.length, 1, "…one request, not one per balance");
  assert.strictEqual(
    await run(`fetchAddressBalance("SOL", "${ethAddr}")`),
    null,
    "unsupported chain → null (no request)",
  );
  assert.strictEqual(
    await run('fetchAddressBalance("BTC", "not a valid address!")'),
    null,
    "junk address shape → null (no request)",
  );
  assert.strictEqual(fetchCalls.length, 1, "guarded lookups never hit the network");

  // BTC tx history → chronological net deltas (receive +1 at t=100, then
  // the 0.25 spend at t=200); second call served from cache
  fetchCalls = [];
  assert.strictEqual(
    JSON.stringify(await run(`fetchBtcAddressDeltas("${btcAddr}")`)),
    JSON.stringify([{ time: 100, delta: 1 }, { time: 200, delta: -0.25 }]),
    "tx history reduced to chronological deltas",
  );
  await run(`fetchBtcAddressDeltas("${btcAddr}")`);
  assert.strictEqual(fetchCalls.length, 1, "tx history cached within TTL");
  assert.strictEqual(
    await run('fetchBtcAddressDeltas("junk!!")'),
    null,
    "junk address → null without a request",
  );

  // OHLC candles: parsed, unit-converted to ms, sorted oldest-first, cached
  fetchCalls = [];
  const candles = await run('fetchOhlcCandles("BTC", "day", "USD")');
  // The API ignores our window and always returns its own batch, so the
  // fetcher keeps only the newest `points` candles — otherwise a 1H chart
  // draws six hours of one-minute candles
  assert.strictEqual(candles.length, 2, "trimmed to the period's candle count");
  assert.strictEqual(candles[1].time, 3000000, "keeps the newest, not the oldest");
  assert.ok(
    candles[0].time < candles[1].time,
    "candles sorted oldest first (API returns newest first)",
  );
  assert.strictEqual(candles[0].time, 2000000, "seconds converted to ms");
  assert.strictEqual(candles[0].open, 3, "open mapped from column 3");
  assert.strictEqual(candles[0].high, 2, "high mapped from column 2");
  assert.strictEqual(candles[0].low, 1, "low mapped from column 1");
  assert.strictEqual(candles[0].close, 4, "close mapped from column 4");
  assert.strictEqual(candles[0].volume, 5, "volume mapped from column 5");
  await run('fetchOhlcCandles("BTC", "day", "USD")');
  assert.strictEqual(fetchCalls.length, 1, "second call served from cache");

  // Unsupported period/currency never hits the network — those charts keep
  // the price-only readout instead of borrowing wrong candles
  assert.strictEqual(await run('fetchOhlcCandles("BTC", "all", "USD")'), null, "ALL has no granularity");
  assert.strictEqual(await run('fetchOhlcCandles("BTC", "month", "USD")'), null, "period without a spec");
  assert.strictEqual(await run('fetchOhlcCandles("BTC", "day", "TRY")'), null, "unquoted currency");
  assert.strictEqual(fetchCalls.length, 1, "guarded cases make no request");

  // candleAt: nearest candle, but only within one step of the point
  sandbox.__candles = [
    { time: 1000, open: 1, high: 2, low: 0, close: 1.5, volume: 10 },
    { time: 2000, open: 2, high: 3, low: 1, close: 2.5, volume: 20 },
    { time: 3000, open: 3, high: 4, low: 2, close: 3.5, volume: 30 },
  ];
  assert.strictEqual(run("candleAt(__candles, 2000).close"), 2.5, "exact match");
  assert.strictEqual(run("candleAt(__candles, 2400).close"), 2.5, "nearest below");
  assert.strictEqual(run("candleAt(__candles, 2600).close"), 3.5, "nearest above");
  assert.strictEqual(run("candleAt(__candles, 3900).close"), 3.5, "within one step of the last");
  assert.strictEqual(run("candleAt(__candles, 9000)"), null, "far outside the range → null");
  assert.strictEqual(run("candleAt(__candles, -9000)"), null, "far before the range → null");
  assert.strictEqual(run("candleAt([], 1000)"), null, "no candles → null");
  assert.strictEqual(run("candleAt(null, 1000)"), null, "missing candles → null");

  /* ERC-20 balances: one batched request for every token asked about, and
   * balances scaled by each token's own decimals. Tokens are read from their
   * contract rather than matched by symbol — anyone can deploy a contract
   * calling itself USDC, so a name is not an identity. */
  fetchCalls = [];
  const balances = await run(`fetchErc20Balances("${ethAddr}", ["LINK", "USDC"])`);
  assert.strictEqual(fetchCalls.length, 1, "both tokens ride one request");
  assert.strictEqual(balances.LINK, 1, "18-decimal balance scaled");
  assert.strictEqual(balances.USDC, 2.5, "6-decimal balance scaled");

  // Cached per address+token, so the sweep doesn't re-ask
  fetchCalls = [];
  await run(`fetchErc20Balances("${ethAddr}", ["LINK", "USDC"])`);
  assert.strictEqual(fetchCalls.length, 0, "second lookup is cached");

  // A single lookup goes through the same path and cache
  assert.strictEqual(
    await run(`fetchAddressBalance("LINK", "${ethAddr}")`),
    1,
    "token balance via the shared address lookup",
  );

  // Unknown tokens and junk addresses never reach the network
  fetchCalls = [];
  // Objects made inside the vm need stringify comparison (see tests/README)
  assert.strictEqual(
    JSON.stringify(await run(`fetchErc20Balances("${ethAddr}", ["NOTATOKEN"])`)),
    "{}",
    "unsupported token → nothing",
  );
  assert.strictEqual(
    JSON.stringify(await run('fetchErc20Balances("not an address!", ["LINK"])')),
    "{}",
    "junk address → nothing",
  );
  assert.strictEqual(fetchCalls.length, 0, "and no requests for either");

  // Balance decoding must survive what an RPC can actually return
  assert.strictEqual(run('decodeErc20Balance("0x", 18)'), 0, "empty result is a zero balance");
  assert.strictEqual(run('decodeErc20Balance("0x0de0b6b3a7640000", 18)'), 1, "one whole token");
  assert.strictEqual(run('decodeErc20Balance("0x2625a0", 6)'), 2.5, "fractional token");
  assert.strictEqual(run('decodeErc20Balance("junk", 18)'), null, "non-hex → null, never NaN");
  assert.strictEqual(run("decodeErc20Balance(null, 18)"), null, "missing result → null");
  // 18-decimal balances exceed what a double can hold before scaling, so the
  // raw value is parsed as a BigInt and split before the division
  assert.strictEqual(
    run('decodeErc20Balance("0x152d02c7e14af6800000", 18)'),
    100000,
    "large balance keeps its magnitude",
  );

  // provider failure → stale cache wins; no cache → null
  chainFail = true;
  /* Ether is cached beside the tokens now, keyed the way that cache keys
   * things (`address:COIN`), because it comes back in the same batch. */
  run(`erc20Cache.get("${ethAddr}:ETH").timestamp = Date.now() - WATCH_BALANCE_TTL - 1`);
  assert.strictEqual(
    await run(`fetchAddressBalance("ETH", "${ethAddr}")`),
    2,
    "provider failure serves the last known balance",
  );
  assert.strictEqual(
    await run(`fetchAddressBalance("BTC", "${ethAddr.slice(2)}00")`),
    null,
    "failure with no cached balance → null",
  );
  chainFail = false;

  /* ── Kraken adapter (coins Coinbase doesn't list) ────────────────────── */

  fetchCalls = [];
  const kh = await run('fetchKrakenHistory("XMR", "day", "USD")');
  assert.strictEqual(kh.length, 3, "tail sliced to the period's point count");
  assert.strictEqual(kh[0].price, 12, "close column used for the line series");
  assert.ok(kh[0].time instanceof Date || Number(kh[0].time) > 0, "seconds became a Date");
  assert.strictEqual(Number(kh[2].time), 4000 * 1000, "timestamps in ms, ascending");

  // Kraken quotes USD; other currencies convert with the rate the ticker
  // already fetches, so every display currency works
  const khTry = await run('fetchKrakenHistory("XMR", "day", "TRY")');
  assert.strictEqual(khTry[0].price, 12 * 30, "converted with the USD rate");

  // Same rows serve the crosshair — no second request
  fetchCalls = [];
  const kc = await run('fetchKrakenCandles("XMR", "day", "USD")');
  assert.strictEqual(kc.length, 3, "candles come from the cached rows");
  assert.deepStrictEqual(
    { o: kc[0].open, h: kc[0].high, l: kc[0].low, c: kc[0].close, v: kc[0].volume },
    { o: 11, h: 13, l: 10, c: 12, v: 110 },
    "OHLC columns mapped, volume left in base units",
  );
  assert.strictEqual(
    fetchCalls.filter((u) => u.includes("OHLC")).length,
    0,
    "history and candles share one request",
  );

  // Spot comes from the ticker's last trade
  assert.strictEqual(await run('fetchKrakenSpot("XMR", "USD")'), 380.5, "last trade price");

  // An error array is a failure even with HTTP 200 — Kraken reports that way
  krakenError = true;
  await assert.rejects(
    () => run('fetchKrakenSpot("XMR", "USD")'),
    /Unknown asset pair/,
    "Kraken's error array is treated as a failure",
  );
  assert.strictEqual(
    await run('fetchKrakenCandles("XMR", "week", "USD")'),
    null,
    "candle failure degrades to the price-only readout",
  );
  krakenError = false;

  /* The ALL range has no Coinbase candles — its coarsest is a day and it
   * returns ~350 of them, which is under a year. In candlestick mode the
   * range borrows Kraken's 15-day candles instead; in line mode it stays
   * empty, because mixing one exchange's candles with another's line would
   * put two slightly different prices on the same chart. */
  fetchCalls = [];
  assert.strictEqual(
    await run('fetchOhlcCandles("BTC", "all", "USD")'),
    null,
    "ALL stays candle-less without the cross-provider opt-in",
  );
  assert.strictEqual(fetchCalls.length, 0, "and makes no request");

  const allCandles = await run('fetchOhlcCandles("BTC", "all", "USD", true)');
  assert.ok(allCandles && allCandles.length, "ALL gets candles from the other provider");
  assert.ok(
    fetchCalls.some((u) => u.includes("kraken.com")),
    "which is where they come from",
  );

  // A coin the other provider doesn't list falls back to no candles, and is
  // remembered so the miss isn't repeated on every visit to the range
  krakenError = true;
  fetchCalls = [];
  assert.strictEqual(
    await run('fetchOhlcCandles("ADA", "all", "USD", true)'),
    null,
    "unlisted pair → no candles",
  );
  const firstTry = fetchCalls.length;
  assert.ok(firstTry > 0, "it did try once");
  assert.strictEqual(
    await run('fetchOhlcCandles("ADA", "all", "USD", true)'),
    null,
    "still no candles on the second visit",
  );
  assert.strictEqual(fetchCalls.length, firstTry, "and it doesn't ask again");
  krakenError = false;

  // Routing: a Kraken coin never reaches the Coinbase candles endpoint
  fetchCalls = [];
  await run('fetchOhlcCandles("XMR", "day", "USD")');
  assert.ok(
    fetchCalls.every((u) => !u.includes("exchange.coinbase.com")),
    "fetchOhlcCandles routes Kraken coins away from Coinbase",
  );

  /* Coinlore's global figures feed two widgets. They each used to request
   * the same URL, so turning both on cost two identical round trips every
   * cycle — and one of them cached nothing, so it paid again on every
   * refresh. One shared, cached fetch now serves both. */
  fetchCalls = [];
  const [g1, g2] = await Promise.all([
    run("fetchCoinloreGlobal()"),
    run("fetchCoinloreGlobal()"),
  ]);
  assert.strictEqual(
    fetchCalls.filter((u) => u.includes("global")).length,
    1,
    "parallel callers share one in-flight request",
  );
  assert.ok(g1 && g2, "both callers get the data");

  fetchCalls = [];
  const overview = await run("fetchMarketOverview()");
  assert.strictEqual(overview.btcDominance, 55.5, "market overview reads the shared payload");
  assert.strictEqual(
    fetchCalls.filter((u) => u.includes("global")).length,
    0,
    "and takes it from cache rather than asking again",
  );

  /* The derivatives widgets are fetched per coin, and widgets are refetched
   * whenever the coin changes — so with auto-rotate on, an uncached fetcher
   * fires every few seconds and pays again for coins visited a minute ago.
   * They share the widget cache under a "name:COIN" key. */
  fetchCalls = [];
  const funding = await run('fetchFundingRate("BTC")');
  assert.strictEqual(funding.percent, "0.0100", "funding rate is read from the response");
  assert.strictEqual(funding.intervalHours, 4, "the settlement interval is measured from the two stamps");
  assert.strictEqual(funding.annualized, (0.0001 * 6 * 365 * 100).toFixed(2), "…and the yearly figure counts six settlements a day for it, not three");
  assert.strictEqual(funding.premium, -0.00052, "the venue's premium over index rides along");
  assert.strictEqual(funding.at, 1790121600000, "and the settlement time is the venue's");
  assert.strictEqual(fetchCalls.length, 1, "the first visit fetches");

  await run('fetchOpenInterest("ETH")');
  await run('fetchFundingRate("BTC")'); // rotated back round
  assert.strictEqual(
    fetchCalls.filter((u) => u.includes("funding-rate")).length,
    1,
    "returning to a coin serves funding from cache",
  );

  /* The two daily series behind the structure readings: folded to days,
     oldest first, paged as far as the window and no further, and cached.
     `fetchCalls` is not reset here: the funding-rate count below carries on. */
  const fh = await run('fetchFundingHistory("BTC")');
  assert.ok(Array.isArray(fh) && fh.length >= 60, "funding history is a daily series");
  assert.strictEqual(fetchCalls.filter((u) => u.includes("funding/history")).length, 2, "a full page asks for the next; a short page stops");
  assert.ok(fh.every((r, i) => i === 0 || r.t > fh[i - 1].t), "…oldest first");
  assert.ok(fh.every((r) => r.t % 86400000 === 0), "…each row at a UTC day's start");
  assert.ok(fh.some((r) => Math.abs(r.value - 0.0002) < 1e-12), "…and a day's value is the mean of its settlements");
  await run('fetchFundingHistory("BTC")');
  assert.strictEqual(fetchCalls.filter((u) => u.includes("funding/history")).length, 2, "…served from cache the second time");
  const oh = await run('fetchOpenInterestHistory("BTC")');
  assert.ok(Array.isArray(oh) && oh.length >= 200, "open-interest history follows the cursor onto the second page");
  assert.strictEqual(fetchCalls.filter((u) => u.includes("open-interest?category=linear")).length, 2, "…and stops where the cursor ends");
  assert.ok(oh.every((r, i) => i === 0 || r.t > oh[i - 1].t), "…oldest first as well");

  // Different coins are cached apart — one coin's data must never stand in
  // for another's
  await run('fetchFundingRate("SOL")');
  assert.strictEqual(
    fetchCalls.filter((u) => u.includes("funding-rate")).length,
    2,
    "a coin not seen before still fetches",
  );

  // TTLs are keyed on the widget name, not the whole "name:COIN" key, or every
  // per-coin entry would silently fall back to the default
  assert.strictEqual(
    run('WIDGET_CACHE_TTL[widgetCacheName("fundingRate:BTC")]'),
    900000,
    "per-coin keys resolve to their widget's TTL",
  );

  /* ── a wall is not a blip ───────────────────────────────────────────────
   *
   * `fetchWithRetry` climbs 1s → 2s → 4s before giving up, which is right for
   * a 500 or a 429: the server answered, and waiting is how you let it
   * recover. It was also being spent on a `TypeError`, which means no
   * response arrived at all — a CORS wall, a region block, something in front
   * of the API. That answers identically four seconds later, and every price
   * request here has somewhere else to go.
   *
   * Measured in a real browser with Coinbase refusing everything: the chart
   * took **7,131ms** to draw, against 54ms on a working Coinbase, and for
   * seven of those seconds the tab read "BTC PRICE" with nothing under it.
   * After: **1,063ms**. The assertion below is the mechanism — the seconds
   * are the delays this would have slept through.
   */
  {
    const delays = [];
    let calls = 0;
    let mode = "network";
    const box = {
      console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number,
      parseInt, parseFloat, isFinite, isNaN, Error, AbortController,
      localStorage: { getItem: () => null, setItem: () => {} },
      // Record what it *would* have waited, and don't actually wait
      setTimeout: (fn, ms) => { delays.push(ms || 0); return fn(); },
      clearTimeout: () => {},
      fetch: async () => {
        calls++;
        if (mode === "network") throw new TypeError("Failed to fetch");
        return { ok: false, status: 503, json: async () => ({}) };
      },
    };
    vm.createContext(box);
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", "src", "api.js"), "utf8"),
      box, { filename: "api.js" });

    const attempt = async (which) => {
      mode = which; calls = 0; delays.length = 0;
      try { await vm.runInContext('fetchWithRetry("https://example.test/x")', box); }
      catch (e) { /* expected */ }
      // The debounced cache persist also books a timer; only the backoff
      // sleeps are seconds long
      return { calls, waited: delays.filter((d) => d >= 1000).reduce((a, b) => a + b, 0) };
    };

    const net = await attempt("network");
    assert.strictEqual(net.calls, 2, "a network-level failure is tried twice, not four times");
    assert.strictEqual(net.waited, 1000, "…and waits one second in total, not seven");

    const server = await attempt("server");
    assert.strictEqual(server.calls, 4, "a 5xx still gets the full ladder — the server answered");
    assert.strictEqual(server.waited, 7000, "…and still backs off 1s + 2s + 4s");
  }

  /* NETWORK FEES — the two cards that are about using the chain rather than
   * about a price. Both readings are arithmetic on someone else's numbers, and
   * both are printed to the cent, so the arithmetic is the test. */
  {
    const gas = JSON.parse(JSON.stringify(await run("fetchEthGas()")));
    // 0x864dcbe = 140,827,838 wei base; median tip 0x8f0d180 = 150,000,000
    assert.strictEqual(
      Math.round(gas.baseGwei * 1e4) / 1e4, 0.1408,
      "the base fee is the LAST entry — the next block's, not the newest mined one",
    );
    assert.strictEqual(gas.tipGwei, 0.15, "the tip is the median of the window, not the mean (0.17) or the last (0.2)");
    assert.strictEqual(Math.round(gas.gwei * 1e4) / 1e4, 0.2908, "the quoted price is base + tip");
    // 21,000 gas is the protocol's own floor for a plain transfer, not a guess
    assert.strictEqual(
      Math.round(gas.transferEth * 1e10) / 1e10,
      Math.round(((140827838 + 150000000) * 21000) / 1e18 * 1e10) / 1e10,
      "a transfer is 21,000 gas at that price",
    );

    const fees = JSON.parse(JSON.stringify(await run("fetchBtcFees()")));
    assert.strictEqual(fees.rate, 3, "the headline is the half-hour rate, not the fastest (7)");
    assert.strictEqual(fees.fastest, 7, "…and the other tiers ride along, because the spread is the reading");
    assert.strictEqual(fees.hour, 1);
    assert.strictEqual(
      fees.transferBtc, (3 * 141) / 1e8,
      "a typical transfer is 141 vB — a one-in-two-out native SegWit spend",
    );

    // Both are cached, and the cache is a minute rather than the panel's five:
    // a gas price is a per-block auction
    assert.strictEqual(run("WIDGET_CACHE_TTL.ethGas"), 60000);
    assert.strictEqual(run("WIDGET_CACHE_TTL.btcFees"), 60000);
    fetchCalls = [];
    await run("fetchEthGas()");
    await run("fetchBtcFees()");
    assert.strictEqual(fetchCalls.length, 0, "a fresh widget cache skips the network for both");
  }

  /* ── the rolling headline archive ─────────────────────────────────────
   *
   * It exists because of a measurement: Blockchair's news archive lags three
   * to four weeks (0 items for windows 15 and 21 days old, 20 for 30 and
   * older, 12 Sep 2026) while the live feed holds about a week — so a mark on
   * a 1W or 1M chart fell between the two. Nothing new is fetched to close
   * that; the app simply stops throwing away what it has already been shown.
   */
  {
    const DAY = 86400000;
    const now = Date.now();
    const item = (n, ageDays, extra) =>
      Object.assign(
        {
          source: "bitcoincom",
          title: `Story number ${n}`,
          url: `https://news.bitcoin.com/${n}`,
          time: now - ageDays * DAY,
          tags: "",
          summary: "A summary that has no business being kept in the archive.",
        },
        extra || {},
      );

    run("newsArchive = []");
    sandbox.__batch = [item(1, 0.1), item(2, 14), item(3, 40), { ...item(4, 1), time: null }];
    run("archiveNewsItems(__batch)");

    const kept = json("newsArchive");
    assert.deepStrictEqual(
      kept.map((i) => i.title),
      ["Story number 1", "Story number 2"],
      "only dated items inside the month are kept — a story with no time cannot be placed in any window, and one older than the archive's age is what the network archive is for",
    );
    assert.ok(
      kept.every((i) => i.summary === undefined),
      "…and the summary is dropped: the card prints titles, and a headline with its summary measured 528 bytes against about 180 without",
    );

    // Windowed, because that is the only question this store is asked
    sandbox.__from = now - 20 * DAY;
    sandbox.__to = now - 10 * DAY;
    assert.deepStrictEqual(
      json("newsArchiveAround(__from, __to).map((i) => i.title)"),
      ["Story number 2"],
      "a window returns what fell inside it and nothing else",
    );
    assert.deepStrictEqual(
      json("newsArchiveAround(0, 1).map((i) => i.title)"),
      [],
      "…and a window it holds nothing for is empty rather than everything",
    );

    /* The same story arriving again — from a second newsroom, or on the next
     * ten-minute refresh — is one row, by the same title key the feed uses. */
    sandbox.__again = [item(1, 0.1, { source: "cointelegraph" }), item(5, 2)];
    run("archiveNewsItems(__again)");
    assert.strictEqual(
      json("newsArchive").filter((i) => i.title === "Story number 1").length,
      1,
      "a story that arrives twice is stored once",
    );
    assert.strictEqual(json("newsArchive").length, 3, "…and the new one is added");
    assert.deepStrictEqual(
      json("newsArchive.map((i) => i.title)"),
      ["Story number 1", "Story number 5", "Story number 2"],
      "the store stays newest-first, whatever order the fetches arrived in",
    );

    /* **Junk must not evict the archive.** `mergeNewsItems` fills to its cap
     * and returns, so items that would be dropped a line later still take
     * slots on the way through — a feed of five hundred undated rows would
     * push out everything already kept if they were not filtered first. */
    sandbox.__junk = Array.from({ length: 500 }, (_, i) => ({
      ...item(9000 + i, 0.5),
      time: null,
    }));
    run("archiveNewsItems(__junk)");
    assert.strictEqual(
      json("newsArchive").length,
      3,
      "a fetch of nothing usable leaves the archive exactly as it was",
    );

    // The cap is a cap on a page that is opened a hundred times a day
    sandbox.__many = Array.from({ length: 500 }, (_, i) => item(1000 + i, 0.5));
    run("archiveNewsItems(__many)");
    assert.strictEqual(
      json("newsArchive").length,
      run("NEWS_ARCHIVE_MAX"),
      "the archive is capped by count",
    );

    /* **It survives the tab.** Every new tab is a fresh JS context, so an
     * in-memory-only archive would be an archive that never holds anything —
     * the same reason every other cache here is persisted. */
    await new Promise((r) => setTimeout(r, 1100)); // the debounced write
    assert.ok(lsStore.crypto_chart_news_archive, "the archive is written to storage");
    run("newsArchive = []");
    run("hydrateNewsArchive()");
    assert.strictEqual(
      json("newsArchive").length,
      run("NEWS_ARCHIVE_MAX"),
      "…and comes back on the next tab",
    );

    /* Storage is untrusted input: it survives version upgrades and anyone can
     * edit it from DevTools, and every `url` here becomes an `href`. */
    lsStore.crypto_chart_news_archive = JSON.stringify([
      { title: "Fine", url: "https://example.test/a", time: now - DAY, source: "x" },
      { title: "Not a link", url: "javascript:alert(1)", time: now - DAY, source: "x" },
      { title: "Too old", url: "https://example.test/b", time: now - 400 * DAY, source: "x" },
      { title: "", url: "https://example.test/c", time: now, source: "x" },
      null,
    ]);
    run("hydrateNewsArchive()");
    const back = json("newsArchive");
    assert.deepStrictEqual(
      back.map((i) => i.title),
      ["Fine", "Not a link"],
      "a hand-edited archive keeps what is well-formed and recent",
    );
    assert.strictEqual(
      back.find((i) => i.title === "Not a link").url,
      null,
      "…and a url that is not https is dropped rather than rendered",
    );
  }

  /* ── the two mempool.space cards added 12 Sep 2026 ────────────────────
   *
   * Both endpoints were probed with a `chrome-extension://` Origin before any
   * of this was written: 200 with `access-control-allow-origin: *`, on a host
   * `ALLOWED_HOSTS` already carries. What is asserted here is the arithmetic
   * on top of them, because that is the part that can be wrong quietly.
   */
  {
    const m = await run("fetchMempool()");
    assert.strictEqual(m.count, 82268, "the queue's length comes back");
    /* **Blocks, not transactions, is the headline.** A block holds about a
     * million vbytes, so 3.1 Mvb is a three-block wait — a number somebody can
     * act on, where 82,268 is a number. */
    assert.ok(Math.abs(m.blocks - 3.1) < 1e-9, "…converted into blocks deep");
    assert.ok(
      Math.abs(m.feesBtc - 0.07404202) < 1e-9,
      "…and the fees waiting are satoshis turned into BTC",
    );
    assert.strictEqual(run("WIDGET_CACHE_TTL.mempool"), 60000,
      "cached for the same minute as the fee card it explains");

    const d = await run("fetchDifficulty()");
    assert.ok(Math.abs(d.change - 4.5078) < 1e-9, "the estimated change comes back");
    assert.strictEqual(d.remaining, 971, "…with the blocks left in the epoch");
    assert.strictEqual(d.remainingMs, 558002628, "…and their estimated time");
    assert.strictEqual(run("WIDGET_CACHE_TTL.difficulty"), 3600000,
      "cached for an hour: a retarget moves once a fortnight");

    /* **A count is a tally, not a measurement.** `formatCompactAmount` is
     * built for money and prints two decimals below its first unit, so the
     * card read "971.00 blocks" — which is what `formatCount` exists to stop,
     * handing over to the compact form only once the number is long enough to
     * need it. */
    assert.strictEqual(run("formatCount(971)"), "971", "a small count is whole");
    assert.strictEqual(run("formatCount(82268)"), "82.27K", "…and a big one is short");
    assert.strictEqual(run("formatCount(0)"), "0", "…and none is none");

    // Both are served from cache on the next call, like every other card here
    fetchCalls = [];
    await run("fetchMempool()");
    await run("fetchDifficulty()");
    assert.strictEqual(fetchCalls.length, 0, "a fresh widget cache skips the network");

    /* **A response that is not one is `null`, never a card of zeros.** A
     * difficulty card reading "+0.0% est." is a claim, and an empty mempool is
     * a real answer that must not look like a failed request. */
    run('widgetCache.delete("mempool")');
    run('widgetCache.delete("difficulty")');
    mempoolBroken = true;
    assert.strictEqual(await run("fetchMempool()"), null,
      "a mempool response with nothing usable in it is null");
    assert.strictEqual(await run("fetchDifficulty()"), null,
      "…and so is a difficulty response");
    mempoolBroken = false;
  }

  /* THE ORDER BOOK ---------------------------------------------------------
   *
   * A real book from a venue this extension already declares (`www.okx.com`,
   * the funding and open-interest provider) — no new host, verified 17 Sep
   * 2026 by reading `Access-Control-Allow-Origin: *` back from an extension
   * Origin. What is asserted here is everything the network cannot: the unit,
   * the running depth, the spread, and that a junk row is dropped rather than
   * drawn. */
  {
    fetchCalls = [];
    /* `run` returns the promise; `json` is for values already settled — the
       vm cannot parse a top-level await. */
    const book = JSON.parse(JSON.stringify(await run('fetchOrderBook("BTC")')));
    /* **Contracts on the wire, coins on the screen.** 10 contracts of 0.01 BTC
       is 0.1 BTC — printing the venue's 10 beside a 0.008 BTC position would
       be two units on one screen with nothing saying so. */
    assert.strictEqual(book.asks[0].size, 0.1, "a size is converted by the contract value");
    assert.strictEqual(book.asks[0].price, 100.5, "…and the price is left alone");
    assert.strictEqual(book.asks.length, 2, "a row with an impossible price is dropped");
    /* Depth is the *running* total, which is the only reason the fill behind a
       row means anything. */
    /* Compared with a tolerance, not for equality: these are sums of floats
       (0.1 + 0.2 is 0.30000000000000004) and the model's integer discipline
       stops at the model — a book is read, never settled against. */
    assert.ok(Math.abs(book.asks[1].depth - 0.3) < 1e-9, "depth accumulates down the side");
    assert.ok(Math.abs(book.bids[1].depth - 0.45) < 1e-9, "…on both sides");
    assert.ok(Math.abs(book.spread - 0.1) < 1e-9, "the spread is best ask less best bid");
    assert.ok(Math.abs(book.spreadBps - 9.95) < 0.1,
      `…and in basis points off the mid (${book.spreadBps})`);
    assert.ok(Math.abs(book.deepest - 0.45) < 1e-9, "both ladders are drawn against one scale");
    assert.strictEqual(book.tick, 0.1, "the venue's own price step comes with it");

    /* Two requests, then none: the book caches for five seconds because a book
       measured in minutes is a lie with a timestamp on it, and the spec caches
       for the widget cache's own life because a contract size is a fact about
       the venue rather than about the market. */
    const first = fetchCalls.length;
    assert.strictEqual(first, 2, "one book request and one spec request");
    await run('fetchOrderBook("BTC")');
    assert.strictEqual(fetchCalls.length, first, "a second read inside the TTL asks nothing");
  }

  /* **The perpetual's own price and history** — what the derivatives page
   * trades and draws at, in USDT. */
  {
    fetchCalls = [];
    const t = JSON.parse(JSON.stringify(await run('fetchPerpTicker("BTC")')));
    assert.strictEqual(t.last, 50000, "the ticker's last trade is the price");
    assert.strictEqual(t.change24h, 25, "…the day's move is measured from its open");
    assert.strictEqual(run('perpLastFor("BTC")'), 50000, "…and is read back synchronously for an order");
    assert.strictEqual(run('perpLastFor("ETH")'), null, "a market never asked about has no price, not a stale one");
    await run('fetchPerpTicker("BTC")');
    assert.strictEqual(fetchCalls.filter((u) => u.includes("market/ticker")).length, 1,
      "a second read inside five seconds asks nothing");

    const year = JSON.parse(JSON.stringify(await run('fetchPerpSeries("BTC", "year")')));
    const asked = fetchCalls.filter((u) => u.includes("candles"));
    assert.strictEqual(year.length, 365, "a year of daily bars, though one request holds 300");
    assert.ok(asked.length === 2 && asked[1].includes("history-candles") && asked[1].includes("after="),
      "…the rest is paged from history, after the oldest bar already read");
    assert.ok(year.every((p, i) => i === 0 || p.time > year[i - 1].time), "…oldest first, as the chart draws it");
    assert.strictEqual(await run('fetchPerpSeries("BTC", "decade")'), null, "a range the page does not have is no series");
  }

  /* **The ladder as drawn** (`bookLadder`): grouped, one side, small levels
   * hidden — and never a different book. */
  {
    sandbox.__book = {
      asks: [
        { price: 100.1, size: 1 }, { price: 100.4, size: 50 }, { price: 101.2, size: 2 },
      ],
      bids: [
        { price: 99.9, size: 3 }, { price: 99.6, size: 40 }, { price: 98.7, size: 1 },
      ],
    };
    const plain = JSON.parse(JSON.stringify(run("bookLadder(__book, {})")));
    assert.deepStrictEqual(plain.asks.map((r) => r.price), [100.1, 100.4, 101.2], "ungrouped, the book as it came");
    assert.deepStrictEqual(plain.asks.map((r) => r.depth), [1, 51, 53], "…with its running depth");

    const g = JSON.parse(JSON.stringify(run("bookLadder(__book, { step: 1 })")));
    assert.deepStrictEqual(g.asks.map((r) => [r.price, r.size]), [[101, 51], [102, 2]],
      "an ask is grouped into the bucket above it");
    assert.deepStrictEqual(g.bids.map((r) => [r.price, r.size]), [[99, 43], [98, 1]],
      "…a bid into the one below, so a grouped bid never sits above a grouped ask");

    const big = JSON.parse(JSON.stringify(run("bookLadder(__book, { min: 1000 })")));
    assert.deepStrictEqual(big.asks.map((r) => r.price), [100.4], "a level under the minimum size (in money) is not drawn");
    assert.strictEqual(big.asks[0].depth, 51, "…but its liquidity still counts in the depth beside the next row");
    assert.strictEqual(big.deepest, 51, "…and the fills are scaled to what is drawn");

    const bids = JSON.parse(JSON.stringify(run('bookLadder(__book, { view: "bids", rows: 2 })')));
    assert.ok(bids.asks.length === 0 && bids.bids.length === 2, "one side alone, to the rows asked for");
    assert.ok(Math.abs(plain.reach - 1.2) < 1e-9, "the reach is how far from the best price the fetched book went");

    assert.deepStrictEqual(JSON.parse(JSON.stringify(run("bookSteps(0.1)"))), [0.1, 1, 10], "steps are the tick, ten and a hundred of it");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(run("bookSteps(0, __book)"))), [0.3, 3, 30],
      "…and without a tick, the finest gap on the book");
  }

  /* **The book as a depth curve** (`bookDepthCurve` / `bookDepthAt`): the
   * notional displayed within a distance of the mid, per side — and nothing
   * past where the book was read. The same book: mid 100, asks 10 / 40 / 120
   * bp out, bids 10 / 40 / 130. */
  {
    const c = JSON.parse(JSON.stringify(run("bookDepthCurve(__book)")));
    const r2 = (v) => Math.round(v * 100) / 100;
    assert.strictEqual(c.mid, 100, "the mid is halfway between the best bid and ask");
    assert.deepStrictEqual(c.asks.map((p) => r2(p.bp)), [10, 40, 120], "distance is 10^4·|p/M − 1|, in basis points");
    assert.deepStrictEqual(c.asks.map((p) => r2(p.notional)), [100.1, 5120.1, 5322.5],
      "…and notional is price × size summed outwards, in money");
    assert.deepStrictEqual(c.bids.map((p) => r2(p.notional)), [299.7, 4283.7, 4382.4], "…on each side separately");
    assert.deepStrictEqual({ bid: r2(c.reach.bid), ask: r2(c.reach.ask) }, { bid: 130, ask: 120 },
      "the reach is the farthest level each side returned");
    const at = (side, bp) => run(`bookDepthAt(bookDepthCurve(__book).${side}, ${bp})`);
    assert.strictEqual(at("asks", 5), 0, "inside the first level there is nothing displayed — read, and zero");
    assert.strictEqual(r2(at("asks", 40)), 5120.1, "a level exactly at the distance counts");
    assert.strictEqual(at("asks", 121), null, "past the reach is not zero, it is not read — null");
    assert.strictEqual(r2(at("bids", 125)), 4283.7, "…while the deeper side still answers at the same distance");
    assert.strictEqual(run("bookDepthCurve({ asks: [], bids: [{ price: 1, size: 1 }] })"), null,
      "a book missing a side has no curve");
  }

  /* ── the tone of a headline: words counted, never an event judged ──────
   * A lexicon with the three-word negation rule; the row says "worded up"
   * or "worded down" and lists the words, so the reader argues with a count.
   * Every case here has its answer known before the function runs. */
  {
    const tone = (title, summary) => JSON.parse(JSON.stringify(run(`newsTone(${JSON.stringify({ title, summary })})`)));
    assert.strictEqual(tone("Bitcoin surges past $44,000 as ETF inflows hit record").tone, "up",
      "surges and inflows are worded up");
    assert.strictEqual(tone("Ethereum exploit drains $40 million from DeFi lending protocol").tone, "down",
      "an exploit that drains is worded down");
    const neg = tone("Regulator says it will not ban stablecoins");
    assert.strictEqual(neg.tone, "up", "a negator within three words flips the word after it");
    assert.deepStrictEqual(neg.up, ["not ban"], "…and the row can show the flipped word");
    assert.strictEqual(tone("Bitcoin hits record low against gold").tone, "down",
      "a two-word phrase wins over its second word — record low is down");
    assert.strictEqual(tone("Solana reaches all-time high").tone, "up", "all-time high is up");
    assert.strictEqual(tone("Rally halts as exchange freezes withdrawals").tone, "down",
      "one up word against two down words is worded down");
    assert.strictEqual(tone("Rally halts").tone, "mixed", "level on both sides is mixed, not nothing");
    assert.strictEqual(tone("Exchange lists a new stablecoin pair", "").tone, "up", "a listing is up");
    assert.strictEqual(tone("The weekly market wrap").tone, null, "a headline with none of the words has no tone");
    const both = tone("Miners' revenue falls as difficulty adjusts upward", "Hashprice dropped 6% after the retarget.");
    assert.strictEqual(both.tone, "down", "the summary is counted too");
    assert.deepStrictEqual(both.down, ["falls", "dropped"], "…and the words are the ones on the row");
  }

  /* ── politeness to a host that said no ────────────────────────────────
   * Per host, in memory: 15 min on the first 429/403, doubling to 2 h,
   * cleared by an answer. Any other status is not a refusal. */
  {
    const T0 = 1700000000000;
    assert.strictEqual(run(`hostCooling("https://cryptopotato.com/wp-json/x", ${T0})`), 0, "nothing is cooling at first");
    assert.strictEqual(run(`noteHostRefused("https://cryptopotato.com/wp-json/x", 500, ${T0})`), 0, "a 500 is not a refusal");
    assert.strictEqual(run(`noteHostRefused("https://cryptopotato.com/wp-json/x", 429, ${T0})`), 900000, "a 429 buys fifteen minutes");
    assert.strictEqual(run(`hostCooling("https://cryptopotato.com/feed/", ${T0 + 60000})`), 840000, "…for the whole host, whichever path");
    assert.strictEqual(run(`hostCooling("https://news.bitcoin.com/feed/", ${T0 + 60000})`), 0, "…and no other host");
    assert.strictEqual(run(`noteHostRefused("https://cryptopotato.com/wp-json/x", 403, ${T0 + 1000000})`), 1800000, "a second refusal doubles it");
    let wait = 0;
    for (let i = 0; i < 6; i += 1) wait = run(`noteHostRefused("https://cryptopotato.com/wp-json/x", 429, ${T0 + 2000000})`);
    assert.strictEqual(wait, 7200000, "…and it never exceeds two hours");
    run(`noteHostAnswered("https://cryptopotato.com/feed/")`);
    assert.strictEqual(run(`hostCooling("https://cryptopotato.com/wp-json/x", ${T0 + 2000001})`), 0, "an answer clears it");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(run(`hostCooldownsNow(${T0})`))), {}, "…and the readout is empty again");
  }

  /* ── politeFetch: the one door a card's request goes through ──────────
   * A cooling host is not asked at all; a 429 starts the wait; an answer
   * clears it. The sandbox's fetch is swapped for a counter. */
  {
    sandbox.__calls = [];
    sandbox.__status = 200;
    const realFetch = sandbox.fetch;
    sandbox.fetch = (url) => { sandbox.__calls.push(url); return Promise.resolve({ ok: sandbox.__status < 400, status: sandbox.__status, json: () => Promise.resolve({}) }); };
    const url = "https://api.alternative.me/fng/?limit=1";
    await run(`politeFetch(${JSON.stringify(url)})`);
    assert.strictEqual(sandbox.__calls.length, 1, "an ordinary request goes out");
    sandbox.__status = 429;
    await run(`politeFetch(${JSON.stringify(url)})`);
    assert.ok(run(`hostCooling(${JSON.stringify(url)})`) > 0, "a 429 starts the host's wait");
    sandbox.__status = 200;
    let refused = null;
    try { await run(`politeFetch(${JSON.stringify(url)})`); } catch (e) { refused = e; }
    assert.ok(refused && refused.cooling > 0, "while it waits, the host is not asked at all — the call rejects with the wait on it");
    assert.strictEqual(sandbox.__calls.length, 2, "…and no request went out");
    run(`noteHostAnswered(${JSON.stringify(url)})`);
    await run(`politeFetch(${JSON.stringify(url)})`);
    assert.strictEqual(sandbox.__calls.length, 3, "an answer clears it and the next request goes out");
    sandbox.fetch = realFetch;
  }

  /* ── US CPI releases: the calendar that ships, and what followed ────────
   *
   * The calendar is read straight out of config.js: every release must be
   * 08:30 in New York, in order, with no duplicate — the one fact the
   * markers and the count stand on. Then the measurement, on candles whose
   * answer is known: each half hour before the release moves exactly 0.1%
   * in log terms and the half hour after exactly 1%. */
  {
    const cfg = fs.readFileSync(path.join(__dirname, "..", "src", "config.js"), "utf8");
    const lit = cfg.match(/const CPI_RELEASES_UTC = (\[[\s\S]*?\]);/);
    assert.ok(lit, "config.js carries CPI_RELEASES_UTC as a literal");
    const cal = vm.runInNewContext(lit[1]);
    const ny = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    assert.ok(cal.length >= 140, `the calendar reaches back to 2015 (${cal.length} releases)`);
    assert.ok(cal.every((iso) => ny.format(new Date(iso)) === "08:30"),
      `every release is 08:30 in New York: ${cal.filter((iso) => ny.format(new Date(iso)) !== "08:30").join(", ")}`);
    assert.ok(cal.every((iso, i) => i === 0 || Date.parse(iso) > Date.parse(cal[i - 1])),
      "…in order, with no release twice");
    assert.ok(cal.includes("2025-10-24T12:30Z") && !cal.some((iso) => iso.startsWith("2025-11")),
      "the 2025 lapse is as published: September's CPI on 24 October, no release in November");

    /* A small calendar of our own for the rest, set before the first read
       (the instants are memoised). */
    const T = [Date.parse("2026-01-13T13:30Z"), Date.parse("2026-02-13T13:30Z"), Date.parse("2026-03-11T12:30Z")];
    sandbox.CPI_RELEASES_UTC = T.map((t) => new Date(t).toISOString());
    assert.strictEqual(run(`nextCpiRelease(${T[0]})`), T[1], "the next release is the first strictly after now");
    assert.strictEqual(run(`lastCpiRelease(${T[1]})`), T[1], "…and the last one includes this minute");
    assert.strictEqual(run(`cpiReleasesBetween(${T[0] - 1}, ${T[1]})`).length, 2, "between is inclusive at both ends");
    assert.strictEqual(run(`nextCpiRelease(${T[2]})`), null, "past the calendar's end there is no next release — nothing is guessed");

    const logc = (m) => (m <= -1 ? 0.001 * (m + 1) / 30 : 0.01 * Math.min(1, (m + 1) / 30));
    const rowsFor = (startMs, endMs, at, gap) => {
      const out = [];
      for (let t = startMs / 1000; t < endMs / 1000; t += 60) {
        const m = (t * 1000 - at) / 60000;
        if (gap && m === 29) continue;
        const c = 100 * Math.exp(logc(m));
        out.push([t, c, c, c, c, 1]);
      }
      return out.reverse(); // newest first, as the endpoint sends them
    };
    sandbox.__rows = rowsFor(T[0] - 211 * 60000, T[0] + 30 * 60000, T[0], false);
    const one = json(`cpiMoveFromCandles(__rows, ${T[0]})`);
    assert.ok(Math.abs(one.after - 0.01) < 1e-12, `the half hour after is |ln(close T+29 / close T−1)|: ${one.after}`);
    assert.ok(one.before.length === 7 && one.before.every((b) => Math.abs(b - 0.001) < 1e-12),
      `…and the control is the seven half hours before it, back to back: ${one.before}`);
    sandbox.__gappy = rowsFor(T[0] - 211 * 60000, T[0] + 30 * 60000, T[0], true);
    assert.strictEqual(run(`cpiMoveFromCandles(__gappy, ${T[0]})`), null, "a missing minute is not a flat one — no answer");

    const sum = json(`cpiMovesSummary([
      { after: 0.01, before: [0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001] },
      { after: 0.0005, before: [0.001, 0.002, 0.001, 0.001, 0.001, 0.001, 0.001] },
    ])`);
    assert.deepStrictEqual({ n: sum.n, top: sum.top, expect: sum.expect }, { n: 2, top: 1, expect: 0.25 },
      "the count: how many releases topped all seven half hours before them, against n/8");
    assert.strictEqual(sum.largest, 0.01, "…with the largest move after");

    /* The fetch: one request per finished release, none on the second read,
       and the answer kept for good; a gap is kept as "incomplete" rather than
       asked for again; a coin Coinbase does not list is not asked at all. */
    const realFetch = sandbox.fetch;
    const minute = [];
    sandbox.fetch = async (url) => {
      if (!url.includes("granularity=60")) return realFetch(url);
      minute.push(url);
      const start = Date.parse(decodeURIComponent(url.match(/start=([^&]+)/)[1]));
      const end = Date.parse(decodeURIComponent(url.match(/end=([^&]+)/)[1]));
      const at = start + 211 * 60000;
      return { ok: true, status: 200, json: async () => rowsFor(start, end, at, url.includes("/ETH-USD/")) };
    };
    const now = T[1] + 29 * 60000; // the second release's half hour is not over yet
    const ajson = async (c) => JSON.parse(JSON.stringify(await run(c)));
    const first = await ajson(`fetchCpiMoves("BTC", ${now})`);
    assert.ok(first.moves.length === 1 && minute.length === 1,
      `only a release whose half hour has finished is read (${minute.length} asked)`);
    const again = await ajson(`fetchCpiMoves("BTC", ${now})`);
    assert.ok(again.moves.length === 1 && minute.length === 1, "a second read asks nothing — a past window never changes");
    await new Promise((r) => setTimeout(r, 0));
    const stored = JSON.parse(lsStore.crypto_chart_cpi_moves || "[]");
    assert.ok(stored.some(([k]) => k === `BTC:${T[0]}`), "…and it is kept across tabs");
    const eth = await ajson(`fetchCpiMoves("ETH", ${now})`);
    assert.ok(eth.moves.length === 1 && eth.moves[0].incomplete === true, "a window with a gap is kept as incomplete");
    await ajson(`fetchCpiMoves("ETH", ${now})`);
    assert.strictEqual(minute.length, 2, "…and not asked for again");
    const xmr = await ajson(`fetchCpiMoves("XMR", ${now})`);
    assert.ok(xmr.unavailable === true && minute.length === 2, "a coin Coinbase does not list is not asked at all");

    lsStore.crypto_chart_cpi_moves = JSON.stringify([
      ["SOL:1", { at: 1, after: NaN, before: [0, 0, 0, 0, 0, 0, 0] }],
      ["SOL:2", { at: 2, after: 0.1, before: [0.1, 0.1] }],
      ["SOL:3", { at: 3, after: 0.1, before: [0, 0, 0, 0, 0, 0, 0] }],
    ]);
    run("cpiMovesCache.clear(); hydrateCpiMoves()");
    assert.deepStrictEqual(json("Array.from(cpiMovesCache.keys())"), ["SOL:3"],
      "a stored entry with a NaN or the wrong number of half hours is dropped on the way in");
    sandbox.fetch = realFetch;
  }

  /* The chart's window asks for finer candles (`fetchViewCandles`): pages
     of 300 bars aligned to the granularity, so the same window reached from
     two directions is the same request; a page in the past asked once and
     kept, on disk too; the page holding "now" asked again after a bar; rows
     it cannot use dropped; and nothing asked where Coinbase Exchange does not
     quote the pair. */
  {
    const realFetch = sandbox.fetch;
    const asked = [];
    sandbox.fetch = async (url) => {
      if (!url.includes("/candles?granularity=") || !url.includes("start=")) return realFetch(url);
      asked.push(url);
      const g = Number(url.match(/granularity=(\d+)/)[1]) * 1000;
      const start = Date.parse(decodeURIComponent(url.match(/start=([^&]+)/)[1]));
      const end = Date.parse(decodeURIComponent(url.match(/end=([^&]+)/)[1]));
      const rows = [];
      for (let t = start; t <= Math.min(end, Date.now()); t += g) rows.push([t / 1000, 99, 101, 100, 100.5, 2]);
      rows.push(["junk", 1, 2, 3, 4, 5], [start / 1000 + 1, -1, 2, 3, 0, 5]);
      return { ok: true, status: 200, json: async () => rows.reverse() };
    };
    const ajson = async (c) => JSON.parse(JSON.stringify(await run(c)));
    const g = 300;
    const size = 300 * g * 1000;
    const k = Math.floor(Date.now() / size) - 5; // a page well in the past
    const from = k * size + 10 * g * 1000;
    const to = from + 400 * g * 1000;
    const got = await ajson(`fetchViewCandles("BTC", "USD", ${g}, ${from}, ${to})`);
    assert.strictEqual(asked.length, 2, "410 bars from bar 10 of a page is two pages");
    assert.ok(asked[0].includes(`start=${new Date(k * size).toISOString()}`), "…aligned to 300 bars of the granularity");
    assert.ok(got.length === 402 && got[0].time === from - g * 1000 && got[got.length - 1].time === to,
      `every bar in the window, and the one still open at its start (${got.length})`);
    assert.ok(got.every((c, i) => c.close > 0 && c.low > 0 && (i === 0 || c.time > got[i - 1].time)),
      "no row it cannot use, oldest first, each bar once");
    assert.ok(got.every((c) => c.time >= from - g * 1000 && c.time <= to), "nothing outside the window");
    await ajson(`fetchViewCandles("BTC", "USD", ${g}, ${from + 20 * g * 1000}, ${to - 20 * g * 1000})`);
    assert.strictEqual(asked.length, 2, "a page in the past is asked once — a pan inside it asks nothing");
    await new Promise((r) => setTimeout(r, 1200));
    const stored = JSON.parse(lsStore.crypto_chart_view_candles || "[]");
    assert.strictEqual(stored.length, 2, "…and kept for the next tab");

    const now = Date.now();
    await ajson(`fetchViewCandles("BTC", "USD", 60, ${now - 50 * 60000}, ${now})`);
    const live = asked.length;
    await ajson(`fetchViewCandles("BTC", "USD", 60, ${now - 50 * 60000}, ${now})`);
    assert.strictEqual(asked.length, live, "the page holding now is not asked again within a bar");
    run("viewCandleCache.forEach((v) => { if (!v.complete) v.at -= 61000; })");
    await ajson(`fetchViewCandles("BTC", "USD", 60, ${now - 50 * 60000}, ${now})`);
    assert.strictEqual(asked.length, live + 1, "…and is asked again once a bar has passed");

    const before = asked.length;
    assert.strictEqual(await run(`fetchViewCandles("BTC", "TRY", 60, ${now - 3600000}, ${now})`), null, "a currency Coinbase Exchange does not quote: null");
    assert.strictEqual(await run(`fetchViewCandles("XMR", "USD", 60, ${now - 3600000}, ${now})`), null, "a coin it does not list: null");
    assert.strictEqual(asked.length, before, "…and neither asks anything");

    lsStore.crypto_chart_view_candles = JSON.stringify([
      ["BTC-USD-60-1", { at: Date.now() - 1000, rows: [[1, 2, 3, 4, 5, 6], [2, 0, 3, 4, 5, 6], [3, 2, 3, 4, NaN, 6]] }],
      ["BTC-USD-60-2", { at: Date.now() - 30 * 86400000, rows: [[1, 2, 3, 4, 5, 6]] }],
    ]);
    run("viewCandleCache.clear(); hydrateViewCandles()");
    assert.deepStrictEqual(json("Array.from(viewCandleCache.keys())"), ["BTC-USD-60-1"], "a stored page older than a week is dropped on the way in");
    assert.strictEqual(json('viewCandleCache.get("BTC-USD-60-1").rows').length, 1, "…and a row with a zero or a NaN in it");
    sandbox.fetch = realFetch;
    console.log("  ✔ the chart's window: pages, a cache, the page holding now, and no asks where there are no candles");
  }

  console.log("ALL API TESTS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
