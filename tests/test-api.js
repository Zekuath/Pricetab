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
let chainFail = false; // simulates the balance providers going down
let coinbaseDown = false; // an edge error: a rejected fetch, as the browser sees it
let krakenError = false; // Kraken reports failures in a 200 response body
const sandbox = {
  console, Date, JSON, Math, Array, Object, Set, Map, Promise, Number,
  parseInt, parseFloat, isFinite, isNaN, setTimeout, clearTimeout, Error, AbortController,
  fetch: async (url, options) => {
    fetchCalls.push(url);
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
    if (url.includes("fees/recommended")) {
      return { ok: true, status: 200, json: async () => (
        { fastestFee: 7, halfHourFee: 3, hourFee: 1, economyFee: 1, minimumFee: 1 }
      ) };
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
      return { ok: true, status: 200, json: async () => ({ data: [{ fundingRate: "0.0001" }] }) };
    }
    if (url.includes("okx.com/api/v5/public/open-interest")) {
      return { ok: true, status: 200, json: async () => ({ data: [{ oiUsd: "1000000" }] }) };
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
  assert.strictEqual(hn[0].points, undefined, "internal points field stripped");
  assert.strictEqual(
    hn[1].url,
    "https://news.ycombinator.com/item?id=2",
    "text post links to the HN discussion",
  );

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
  assert.strictEqual(fetchCalls.length, 1, "the first visit fetches");

  await run('fetchOpenInterest("ETH")');
  await run('fetchFundingRate("BTC")'); // rotated back round
  assert.strictEqual(
    fetchCalls.filter((u) => u.includes("funding-rate")).length,
    1,
    "returning to a coin serves funding from cache",
  );

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

  console.log("ALL API TESTS PASSED");
})().catch((e) => { console.error(e); process.exit(1); });
