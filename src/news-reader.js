/* THE NEWS PREVIEW'S READER — a story's own text, without its pictures, and
 * a reading of it (1 Oct 2026, *"ilk tık ile sağda bir ön izleme … reading
 * mode ile o sayfadaki haberi çeksek bir kısmını resimsiz … algoritmik olarak
 * yorumlasak"*).
 *
 * **Which stories can be read here, measured 1 Oct 2026** with a
 * `chrome-extension://` Origin against each newsroom's newest article:
 *  - CryptoPotato answers its WordPress API with `Access-Control-Allow-Origin:
 *    *`, so its text needs no permission at all (~10 KB a post with `_fields`);
 *  - Bitcoin Magazine and CoinJournal answer the same API, readable once their
 *    optional host permission is granted — the one the panel already asks for;
 *  - Cointelegraph, Decrypt, CryptoSlate and CoinDesk serve the page itself,
 *    readable under the same grant (162 KB – 1.7 MB of HTML, parsed here and
 *    thrown away);
 *  - CNBC, Bitcoin.com and MarketWatch send no CORS header on an article (and
 *    MarketWatch answers 401), The Block answers 403, and BBC's articles live
 *    on a host its feed permission does not cover — none of these is read, and
 *    the preview says so and shows the feed's own summary.
 * No new host and no new permission: every origin here is a news source
 * already declared.
 *
 * **Nothing is persisted.** The text read is kept in memory for this tab
 * (`NEWS_READ_KEEP` stories) and nowhere else: a list of the articles someone
 * previewed, written to disk, would be a reading history — the one record
 * this extension has no business keeping. A new tab asks again, on a click.
 *
 * The HTML is parsed with DOMParser into an inert document — no script runs
 * and no image loads there — and only `textContent` leaves it. Never
 * innerHTML.
 *
 * **The reading is counted, never judged** — the rule `newsTone` set for a
 * row: the coins it names and how often, the words it is worded with, the
 * figures it cites, what kind of story its vocabulary says it is (with the
 * words, so a reader can disagree), the three sentences carrying its most
 * repeated words, how many newsrooms ran it, and what the chart's coin did in
 * the hours since — the same hours, never a cause. Nothing here says what a
 * price will do. */

const NEWS_READ_KEEP = 30;
const NEWS_READ_TIMEOUT_MS = 15000;
const NEWS_READ_PARAGRAPHS = 8;
const NEWS_READ_CHARS = 2400;
const NEWS_READ_MIN_PARAGRAPH = 50;

/* Where a story's text can come from, by its link's host. `via: "wp"` is the
   newsroom's WordPress API (the post found by its slug), `"page"` the article
   page itself. `source` is the NEWS_SOURCES id whose grant opens it. */
const NEWS_READ_RULES = {
  "cryptopotato.com": { via: "wp", source: "cryptopotato" },
  "bitcoinmagazine.com": { via: "wp", source: "bitcoinmagazine" },
  "coinjournal.net": { via: "wp", source: "coinjournal", lang: "en" },
  "cointelegraph.com": { via: "page", source: "cointelegraph" },
  "decrypt.co": { via: "page", source: "decrypt" },
  "cryptoslate.com": { via: "page", source: "cryptoslate" },
  "www.coindesk.com": { via: "page", source: "coindesk" },
};

const newsReadRule = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? NEWS_READ_RULES[u.host] || null : null;
  } catch (e) {
    return null;
  }
};

/* Can this story be read here, and if not, why not:
   "free" | "granted" | "ask" (an optional newsroom not yet allowed) | "no". */
const newsReadAccess = (url, granted) => {
  const rule = newsReadRule(url);
  if (!rule) return { state: "no" };
  const source = NEWS_SOURCES.find((s) => s.id === rule.source);
  if (!source) return { state: "no" };
  if (!source.optional) return { state: "free", rule, source };
  return (granted || []).includes(source.id) ? { state: "granted", rule, source } : { state: "ask", rule, source };
};

/* ── extraction ── */

const NEWS_READ_DROP =
  "script, style, noscript, template, svg, figure, figcaption, img, picture, video, audio, iframe, " +
  "aside, nav, form, header, footer, button, select, input, table, " +
  "[class*='related'], [class*='newsletter'], [class*='share'], [class*='social'], [class*='promo'], " +
  "[class*='advert'], [class*='sponsor'], [class*='subscribe'], [class*='author'], [class*='disclaimer'], " +
  "[aria-hidden='true'], [hidden]";

// Lines that are the page talking about itself, not the story
const NEWS_READ_BOILER = /^(read more|related|also read|subscribe|sign up|follow us|disclaimer|this article|editor'?s note|image:|photo:|source:|share this|advertisement|sponsored)\b/i;

// A teaser's own timestamp — "… 4 hours ago" — ends a link to another story
const NEWS_READ_AGO = /\d+\s?(?:minutes?|hours?|days?)\s+ago$/i;

const newsReadClean = (s) => String(s || "").replace(/\s+/g, " ").trim();

/* The article's body as paragraphs, from an HTML string. JSON-LD's
   `articleBody` first where a page carries one; otherwise the container with
   the most paragraph text, stripped of everything that is not the story. */
const newsReadParagraphs = (html) => {
  if (typeof DOMParser === "undefined" || typeof html !== "string" || !html) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const node of doc.querySelectorAll("script[type='application/ld+json']")) {
    try {
      const data = JSON.parse(node.textContent || "");
      const list = Array.isArray(data) ? data : data && Array.isArray(data["@graph"]) ? data["@graph"] : [data];
      const art = list.find((d) => d && typeof d.articleBody === "string" && d.articleBody.length > 200);
      if (art) {
        const parts = art.articleBody.split(/\n+/).map(newsReadClean).filter((p) => p.length >= NEWS_READ_MIN_PARAGRAPH);
        if (parts.length) return parts;
      }
    } catch (e) {
      /* a malformed block is not the story */
    }
  }
  doc.querySelectorAll(NEWS_READ_DROP).forEach((n) => n.remove());
  const textOf = (root) => [...root.querySelectorAll("p")].reduce((s, p) => s + newsReadClean(p.textContent).length, 0);
  const candidates = [...doc.querySelectorAll("article, [itemprop='articleBody'], main, [class*='article'], [class*='post-content'], [class*='entry-content']")];
  let root = doc.body;
  let best = 0;
  for (const c of candidates) {
    const n = textOf(c);
    if (n > best) {
      best = n;
      root = c;
    }
  }
  if (!root) return [];
  const out = [];
  for (const p of root.querySelectorAll("p, h2, h3, li")) {
    // A paragraph inside a list item is read once, as the paragraph
    if (p.tagName === "LI" && p.querySelector("p")) continue;
    const text = newsReadClean(p.textContent);
    const isHead = p.tagName === "H2" || p.tagName === "H3";
    if (isHead ? text.length < 12 : text.length < NEWS_READ_MIN_PARAGRAPH) continue;
    if (NEWS_READ_BOILER.test(text) || NEWS_READ_AGO.test(text)) continue;
    // Mostly link text is a list of other stories (measured: CoinDesk's
    // trending column, Cointelegraph's "Magazine:" teaser at the foot)
    const linked = [...p.querySelectorAll("a")].reduce((n, a) => n + newsReadClean(a.textContent).length, 0);
    if (linked > text.length * 0.5) continue;
    if (out.length && out[out.length - 1].text === text) continue;
    out.push({ text, head: isHead });
  }
  // A heading with no paragraph after it is page furniture
  return out.filter((p, i) => !p.head || (out[i + 1] && !out[i + 1].head)).map((p) => (p.head ? `§ ${p.text}` : p.text));
};

/* What is shown: the opening paragraphs up to a measure, and the whole
   story's length. A part of the article, as asked — the rest is a link. */
const newsReadExcerpt = (paragraphs) => {
  const shown = [];
  let chars = 0;
  for (const p of paragraphs) {
    if (shown.length >= NEWS_READ_PARAGRAPHS || (shown.length && chars + p.length > NEWS_READ_CHARS)) break;
    shown.push(p);
    chars += p.length;
  }
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  return { shown, total: paragraphs.length, words };
};

/* ── fetching ── */

const newsReadCache = new Map();

const newsReadFetch = async (url, rule) => {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), NEWS_READ_TIMEOUT_MS) : null;
  try {
    if (rule.via === "wp") {
      const u = new URL(url);
      const slug = u.pathname.split("/").filter(Boolean).pop() || "";
      if (!/^[a-z0-9%-]+$/i.test(slug)) return null;
      const api = `https://${u.host}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=content${rule.lang ? `&lang=${rule.lang}` : ""}`;
      const res = await politeFetch(api, ctrl ? { signal: ctrl.signal } : undefined);
      if (!res.ok) return null;
      const posts = await res.json();
      const post = Array.isArray(posts) ? posts[0] : null;
      const html = post && post.content && typeof post.content.rendered === "string" ? post.content.rendered : "";
      return html ? `<article>${html}</article>` : null;
    }
    const res = await politeFetch(url, ctrl ? { signal: ctrl.signal, credentials: "omit" } : { credentials: "omit" });
    if (!res.ok) return null;
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/* A story's text, or why there is none: `{ state: "read", paragraphs, … }`,
   `{ state: "ask", source }`, `{ state: "no" }` or `{ state: "failed" }`.
   One request per story per tab; a second open answers from memory. */
const fetchNewsArticle = async (item, granted) => {
  const url = item && item.url;
  const access = newsReadAccess(url, granted);
  if (access.state === "no") return { state: "no" };
  if (access.state === "ask") return { state: "ask", source: access.source };
  if (newsReadCache.has(url)) return newsReadCache.get(url);
  let answer;
  try {
    const html = await newsReadFetch(url, access.rule);
    const paragraphs = newsReadParagraphs(html);
    answer = paragraphs.length ? { state: "read", paragraphs, ...newsReadExcerpt(paragraphs) } : { state: "failed" };
  } catch (e) {
    answer = { state: "failed", cooling: e && e.cooling };
  }
  // A failure is not kept: the next click may well succeed
  if (answer.state === "read") {
    newsReadCache.set(url, answer);
    while (newsReadCache.size > NEWS_READ_KEEP) newsReadCache.delete(newsReadCache.keys().next().value);
  }
  return answer;
};

/* ── the reading ── */

/* What a story is about, by its own vocabulary. Each kind names the words
   that put it there, so the label can be checked against the text. */
const NEWS_READ_KINDS = [
  ["regulation", ["sec", "cftc", "regulator", "regulators", "regulatory", "regulation", "law", "lawmakers", "bill", "senate", "congress", "court", "judge", "lawsuit", "compliance", "license", "licence", "mica", "treasury", "legislation", "ban", "enforcement"]],
  ["funds", ["etf", "etfs", "inflows", "outflows", "spot etf", "blackrock", "fidelity", "grayscale", "aum", "treasury company"]],
  ["security", ["hack", "hacked", "exploit", "exploited", "stolen", "breach", "drained", "attacker", "attackers", "phishing", "scam", "vulnerability", "malware", "theft"]],
  ["macro", ["fed", "rates", "rate cut", "inflation", "cpi", "dollar", "yields", "jobs", "recession", "tariff", "tariffs", "powell", "economy", "gdp"]],
  ["technology", ["upgrade", "fork", "mainnet", "testnet", "protocol", "developers", "layer", "rollup", "validator", "validators", "smart contract", "node", "nodes", "client", "eip"]],
  ["markets", ["price", "rally", "traders", "trading", "futures", "liquidations", "open interest", "funding rate", "volatility", "resistance", "support level", "sell-off", "selloff", "options", "leverage"]],
  ["business", ["partnership", "acquires", "acquisition", "launch", "launches", "payments", "bank", "banks", "company", "firm", "startup", "raises", "funding round", "valuation", "listing"]],
  ["mining", ["miners", "mining", "hashrate", "hash rate", "difficulty", "halving", "block reward"]],
];

const NEWS_READ_STOP = new Set(
  "the a an and or but of to in on at for with by from as is are was were be been being it its this that these those has have had will would could should may might can not no than then there their they them he she his her we our you your i into over under after before about up down out more most less said says also which who whom what when where while just new one two year years week weeks day days per cent percent".split(
    " ",
  ),
);

const newsReadWords = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^a-z0-9'$%.-]+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter(Boolean);

const newsReadCount = (text, phrase) => {
  const re = new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^a-z0-9]|$)`, "g");
  return (String(text).toLowerCase().match(re) || []).length;
};

/* The kinds the text reads as, strongest first, at most two, each with its
   words. A whole article needs three hits, a headline and summary two. */
const newsReadKinds = (text, full) => {
  const lower = String(text || "").toLowerCase();
  const scored = NEWS_READ_KINDS.map(([kind, words]) => {
    const hits = words.map((w) => [w, newsReadCount(lower, w)]).filter(([, n]) => n > 0);
    return { kind, n: hits.reduce((s, [, k]) => s + k, 0), words: hits.sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w) };
  }).filter((k) => k.n >= (full ? 3 : 2));
  scored.sort((a, b) => b.n - a.n);
  return scored.slice(0, 2);
};

// The coins it names, counted the way a row decides "about BTC"
const newsReadCoins = (text, coins) => {
  const out = [];
  const lower = String(text || "").toLowerCase();
  for (const coin of coins || []) {
    const name = String((typeof COIN_NAMES !== "undefined" && COIN_NAMES[coin]) || "").toLowerCase();
    let n = (String(text).match(new RegExp(`\\b${coin}\\b`, "g")) || []).length;
    if (name.length > 2) n += newsReadCount(lower, name);
    if (n > 0) out.push({ coin, n });
  }
  return out.sort((a, b) => b.n - a.n).slice(0, 5);
};

// The figures it cites, in the order it cites them: money, percentages, sizes
const newsReadFigures = (text) => {
  const re = /(?:[$€£]\s?\d[\d,.]*(?:\s?(?:billion|million|trillion|thousand|bn|m|k|b)\b)?|\b\d[\d,.]*\s?%|\b\d[\d,.]*\s(?:billion|million|trillion)\b)/gi;
  const seen = [];
  for (const m of String(text || "").match(re) || []) {
    const f = m.replace(/\s+/g, " ").replace(/[.,]$/, "").trim();
    if (f.length > 1 && !seen.includes(f)) seen.push(f);
    if (seen.length >= 6) break;
  }
  return seen;
};

/* A paragraph's sentences: an end mark, a space, then a capital or a quote —
   so "$3.8 million" and "Sept. 24" stay whole — with a piece ending in an
   abbreviation joined to the next ("U.S. Treasury"). */
const NEWS_READ_ABBR = /(?:^|\s)(?:[A-Z]|U\.S|U\.K|Mr|Ms|Mrs|Dr|St|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec|Inc|Corp|Co|Ltd|vs|No|Gov|Sen|Rep)\.$/;
const newsReadSentences = (p) => {
  const out = [];
  for (const piece of String(p).split(/(?<=[.!?]["”’)]?)\s+(?=[A-Z“"‘(])/)) {
    if (out.length && NEWS_READ_ABBR.test(out[out.length - 1])) out[out.length - 1] += ` ${piece}`;
    else out.push(piece);
  }
  return out;
};

/* The three sentences that carry the story's most repeated content words —
   its own words, in its own order, never rewritten. Sentences under eight
   words or over fifty are left out (captions, run-ons). */
const newsReadKeySentences = (paragraphs, title) => {
  const body = paragraphs.filter((p) => !p.startsWith("§ "));
  const sentences = [];
  body.forEach((p) => {
    for (const s of newsReadSentences(p)) {
      const text = newsReadClean(s);
      const n = text.split(/\s+/).length;
      if (n >= 8 && n <= 50) sentences.push(text);
    }
  });
  if (sentences.length <= 3) return sentences;
  const tf = new Map();
  for (const s of sentences) {
    for (const w of new Set(newsReadWords(s))) {
      if (w.length > 2 && !NEWS_READ_STOP.has(w)) tf.set(w, (tf.get(w) || 0) + 1);
    }
  }
  const inTitle = new Set(newsReadWords(title).filter((w) => !NEWS_READ_STOP.has(w)));
  const scored = sentences.map((s, i) => {
    const words = new Set(newsReadWords(s).filter((w) => w.length > 2 && !NEWS_READ_STOP.has(w)));
    let score = 0;
    for (const w of words) score += (tf.get(w) || 0) - 1 + (inTitle.has(w) ? 1 : 0);
    return { s, i, score: score / Math.sqrt(Math.max(words.size, 1)) };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
};

/* The chart's coin from the story's time to now, from the series already on
   screen: `{ change, ms }` or null when the series does not reach back. */
const newsReadSince = (prices, time, now) => {
  if (!Array.isArray(prices) || prices.length < 2 || !(time > 0)) return null;
  const at = (p) => (p.time instanceof Date ? p.time.getTime() : Number(p.time) < 1e12 ? Number(p.time) * 1000 : Number(p.time));
  const first = at(prices[0]);
  if (!(first <= time)) return null;
  let from = null;
  for (const p of prices) {
    if (at(p) <= time) from = p;
    else break;
  }
  const last = prices[prices.length - 1];
  const a = Number(from && from.price);
  const b = Number(last && last.price);
  if (!(a > 0) || !(b > 0)) return null;
  return { change: (b / a - 1) * 100, ms: Math.max(0, (now || Date.now()) - time) };
};

/* The whole reading of one story. `text` is the article when it was read,
   or the headline and summary when it was not — `full` says which, and the
   preview says so above the reading. */
const newsReading = (item, article, ctx) => {
  const paragraphs = article && article.state === "read" ? article.paragraphs : [];
  const full = paragraphs.length > 0;
  const text = full ? `${item.title}. ${paragraphs.join(" ")}` : `${item.title}. ${item.summary || ""}`;
  const tone = newsTone({ title: item.title, summary: full ? paragraphs.join(" ") : item.summary });
  const coins = newsReadCoins(text, ctx && ctx.coins);
  const chartCoin = ctx && ctx.coin;
  const since = chartCoin && coins.some((c) => c.coin === chartCoin) ? newsReadSince(ctx.prices, item.time, ctx.now) : null;
  const others = Array.isArray(item.also) ? new Set(item.also.map((a) => a.source).filter((s) => s !== item.source)).size : 0;
  return {
    full,
    words: full ? article.words : 0,
    coins,
    tone,
    kinds: newsReadKinds(text, full),
    figures: newsReadFigures(text),
    sentences: full ? newsReadKeySentences(paragraphs, item.title) : [],
    since,
    newsrooms: others + 1,
  };
};
