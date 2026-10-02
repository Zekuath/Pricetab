// The news preview's reader (src/news-reader.js): which stories may be read
// here at all, what is kept of a page (its text, never its pictures or its
// lists of other stories), and the counted reading of it. The rendered
// preview is polish §87; the hosts were measured 1 Oct 2026 (ref/news.md).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const win = new JSDOM("").window;
const sandbox = {
  console,
  Math,
  URL,
  DOMParser: win.DOMParser,
  COIN_NAMES: { BTC: "Bitcoin", ETH: "Ethereum", OP: "Optimism" },
  NEWS_SOURCES: [
    { id: "cryptopotato", name: "CryptoPotato", optional: false },
    { id: "cointelegraph", name: "Cointelegraph", optional: true },
    { id: "coinjournal", name: "CoinJournal", optional: true },
  ],
  newsTone: (item) => ({ tone: /hack/.test(item.summary || "") ? "down" : null, up: [], down: [] }),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "news-reader.js"), "utf8"), sandbox, { filename: "news-reader.js" });
const R = vm.runInContext(
  "({ newsReadAccess, newsReadParagraphs, newsReadExcerpt, newsReadSentences, newsReadFigures, newsReadKinds, newsReadCoins, newsReadKeySentences, newsReadSince, newsReading, NEWS_READ_PARAGRAPHS })",
  sandbox,
);
let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const same = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — ${JSON.stringify(a)}`);

/* ── who may be read ── */
same(R.newsReadAccess("https://cryptopotato.com/a-story/", []).state, "free", "CryptoPotato answers CORS: no permission needed");
same(R.newsReadAccess("https://cointelegraph.com/news/a", []).state, "ask", "an optional newsroom not granted is asked, never fetched");
same(R.newsReadAccess("https://cointelegraph.com/news/a", ["cointelegraph"]).state, "granted", "…and read once it is granted");
same(R.newsReadAccess("https://www.cnbc.com/2026/10/01/a.html", ["cointelegraph"]).state, "no", "a newsroom with no CORS and no permission is never asked");
same(R.newsReadAccess("http://cryptopotato.com/a/", []).state, "no", "only https is read");
same(R.newsReadAccess("https://evil.cryptopotato.com.example/a", []).state, "no", "a host is matched whole, not by its prefix");
same(R.newsReadAccess("not a url", []).state, "no", "a broken link is not read");

/* ── what is kept of a page ── */
{
  const long = (s) => `${s} — a sentence long enough to be a paragraph of the story itself.`;
  const html = `<html><body><header><p>${long("Site header")}</p></header>
    <nav><p>${long("Navigation")}</p></nav>
    <article>
      <p>${long("First paragraph")}</p>
      <figure><img src="x.png"><figcaption>${long("A caption")}</figcaption></figure>
      <h2>A subhead of the story</h2>
      <p>${long("Second paragraph")}</p>
      <p><a href="/other">${long("Related: a link to another story only")}</a></p>
      <p>${long("Bitcoin slips as markets wait")} 4 hours ago</p>
      <p>Read more: ${long("subscribe to our list")}</p>
      <div class="author-bio"><p>${long("The author writes about crypto")}</p></div>
      <p>${long("Third paragraph")}</p>
      <h3>A heading with nothing after it</h3>
    </article>
    <aside><p>${long("Sidebar")}</p></aside>
    <script>${long("var x = 1")}</script></body></html>`;
  const ps = R.newsReadParagraphs(html);
  same(ps.map((p) => p.split(" — ")[0]), ["First paragraph", "§ A subhead of the story", "Second paragraph", "Third paragraph"],
    "the story's paragraphs and its subhead, in order — no caption, link list, teaser, prompt, bio, header, nav, aside or script");
}
{
  const body = "The whole story, as the newsroom filed it in its structured data, long enough to count.\n\nIts second paragraph, also long enough to be kept as one of the story's own paragraphs.";
  const ld = JSON.stringify({ "@graph": [{ "@type": "WebPage" }, { "@type": "NewsArticle", articleBody: body.repeat(3) }] });
  const ps = R.newsReadParagraphs(`<html><head><script type="application/ld+json">${ld}</script></head><body><p>Something else entirely on the page, long enough to be a paragraph.</p></body></html>`);
  ok(ps.length >= 2 && ps[0].startsWith("The whole story"), "JSON-LD's articleBody is preferred to scraping the page");
}
same(R.newsReadParagraphs(""), [], "nothing in, nothing out");
{
  const many = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} of a long story, with enough words in it to be counted as one.`);
  const ex = R.newsReadExcerpt(many);
  ok(ex.shown.length === R.NEWS_READ_PARAGRAPHS && ex.total === 20, "a part of the story is shown, and how much of it");
  ok(ex.words === many.join(" ").split(/\s+/).length, "…with the whole story's length");
}

/* ── the reading ── */
same(R.newsReadSentences("Losses reached $3.8 million in Q3. The U.S. Treasury said on Sept. 24 it would act. Then it did!"),
  ["Losses reached $3.8 million in Q3.", "The U.S. Treasury said on Sept. 24 it would act.", "Then it did!"],
  "sentences end at an end mark, not inside $3.8, U.S. or Sept.");
same(R.newsReadFigures("Funds took in $640 million, up 12% on the week; 1.2 billion tokens moved and $3.8 million was lost, again $640 million."),
  ["$640 million", "12%", "1.2 billion", "$3.8 million"], "figures in the order cited, each once");
same(R.newsReadKinds("The SEC ruled on the bill", false).map((k) => k.kind), ["regulation"], "a headline needs two words of a kind");
same(R.newsReadKinds("The SEC ruled on the bill", true), [], "…a whole article three");
ok(R.newsReadKinds("A hack drained the bridge; the exploit was stolen funds; attackers fled", true)[0].words.includes("hack"), "a kind carries the words that put it there");
same(R.newsReadCoins("BTC rose. Bitcoin and BTC again; Ethereum once. option and opt", ["BTC", "ETH", "OP"]),
  [{ coin: "BTC", n: 3 }, { coin: "ETH", n: 1 }], "coins counted by symbol and name — 'option' is not OP");
{
  const ps = [
    "The bridge was drained in a hack on Tuesday, the third hack on a bridge this month.",
    "Weather was mild in the city where the company has its office this autumn season.",
    "The hack drained the bridge of funds, and the bridge has halted withdrawals after the hack.",
    "Lunch was served at noon in the cafeteria on the second floor of the building.",
    "Officials said the bridge hack is under investigation by the bridge's own security team.",
  ];
  const key = R.newsReadKeySentences(ps, "Bridge drained in hack");
  ok(key.length === 3 && key.every((s) => /hack/.test(s)), "the three sentences carrying the story's repeated words, never the filler");
  ok(ps.indexOf(key[0]) < ps.indexOf(key[1]) && ps.indexOf(key[1]) < ps.indexOf(key[2]), "…in the story's own order");
}
{
  const t0 = Date.UTC(2026, 9, 1, 9);
  const prices = [0, 1, 2, 3].map((i) => ({ time: new Date(t0 + i * 3600e3), price: 100 + i * 2 }));
  const s = R.newsReadSince(prices, t0 + 3600e3, t0 + 3 * 3600e3);
  ok(Math.abs(s.change - (106 / 102 - 1) * 100) < 1e-9 && s.ms === 2 * 3600e3, "the chart's move since publication, from the series on screen");
  same(R.newsReadSince(prices, t0 - 3600e3, t0 + 3 * 3600e3), null, "…and nothing when the series does not reach back that far");
}
{
  const item = { title: "Bitcoin hack drains $3.8 million", summary: "A hack hit a BTC bridge.", time: 0, source: "A", also: [{ source: "B" }, { source: "A" }, { source: "C" }] };
  const r = R.newsReading(item, { state: "no" }, { coins: ["BTC", "ETH"] });
  ok(!r.full && r.sentences.length === 0, "unread: counted from the headline and summary, and no sentences are invented");
  ok(r.newsrooms === 3, "coverage counts newsrooms, not write-ups");
  ok(r.tone.tone === "down" && r.since === null, "the wording is read; no chart move without the chart's coin");
}

console.log(`✔ ${checks} news-reader checks`);
console.log("NEWS READER TESTS OK");
