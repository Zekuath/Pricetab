#!/usr/bin/env node
/* What each always-on news source actually yields, sampled once per run.
 *
 * Why this exists: three of the five sources that need no permission are
 * general finance desks read through a `cryptoOnly` filter, so what matters is
 * not whether they answer but how much of what they answer is on this beat —
 * and that number moves with the news cycle. `ref/news.md` records 11 of 50
 * from Yahoo Finance on 21 Aug 2026; the same feed gave **0 of 50** on 10 Sep
 * 2026. One sample is a day, not a finding, and dropping a source on one bad
 * afternoon is how a feed loses the outlet that would have carried next
 * week's story.
 *
 *     node scripts/news-yield.js            # sample now, print, append
 *     node scripts/news-yield.js --report   # what the log holds so far
 *
 * The log is `docs/internal/research/news-yield.log` — one JSON line per run, inside
 * the git-ignored working directory. Run it a few times a day for a week
 * before touching `NEWS_SOURCES`, then read `--report`.
 *
 * Local tooling: never shipped (package.sh builds from an allowlist), no
 * dependencies, and it reads the feeds exactly as the extension does — same
 * URLs, same crypto test — so a yield here is a yield there.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOG = path.join(ROOT, "docs", "internal", "research", "news-yield.log");

/* The URLs and the beat test are read out of `src/config.js` rather than
 * copied, so this cannot drift from what the extension asks for. */
const config = fs.readFileSync(path.join(ROOT, "src", "config.js"), "utf8");

const cryptoRe = (() => {
  const m = config.match(/const CRYPTO_TERMS_RE\s*=\s*\n?\s*(\/[\s\S]*?\/i);/);
  if (!m) throw new Error("CRYPTO_TERMS_RE not found in src/config.js");
  // eslint-disable-next-line no-eval
  return eval(m[1]);
})();

const sources = (() => {
  const start = config.indexOf("const NEWS_SOURCES = [");
  if (start < 0) throw new Error("NEWS_SOURCES not found in src/config.js");
  const body = config.slice(start, config.indexOf("\n];", start));
  const out = [];
  const re = /\{[^{}]*?id:\s*"([a-z]+)"[\s\S]*?\}/g;
  let m;
  while ((m = re.exec(body))) {
    const block = m[0];
    const name = (block.match(/name:\s*"([^"]+)"/) || [])[1] || m[1];
    const url = (block.match(/url:\s*"([^"]+)"/) || [])[1] || null;
    out.push({
      id: m[1],
      name,
      url,
      optional: /optional:\s*true/.test(block),
      cryptoOnly: /cryptoOnly:\s*true/.test(block),
    });
  }
  return out;
})();

/* RSS only, and crudely: the question is how many items and how many of them
 * are on the beat, not whether the parser is the extension's. Anything the
 * extension reads through `wp-json` is skipped rather than half-measured. */
const sample = async (src) => {
  if (!src.url || !/\.(xml|rss)|feed|rss/i.test(src.url)) {
    return { ...src, skipped: "not an RSS url" };
  }
  try {
    const res = await fetch(src.url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return { ...src, error: `HTTP ${res.status}` };
    const xml = await res.text();
    const items = xml.split(/<item[\s>]/).slice(1);
    let onBeat = 0;
    let newest = null;
    for (const item of items) {
      const title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1];
      const when = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
      if (title && cryptoRe.test(title.replace(/<[^>]*>/g, ""))) onBeat += 1;
      const t = when ? Date.parse(when) : NaN;
      if (isFinite(t) && (newest === null || t > newest)) newest = t;
    }
    return {
      ...src,
      items: items.length,
      onBeat,
      kept: src.cryptoOnly ? onBeat : items.length,
      newestAgeH: newest === null ? null : Number(((Date.now() - newest) / 3600e3).toFixed(1)),
    };
  } catch (error) {
    return { ...src, error: String(error.message || error).slice(0, 60) };
  }
};

const report = () => {
  if (!fs.existsSync(LOG)) {
    console.log("no samples yet — run it with no arguments first");
    return;
  }
  const runs = fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const per = new Map();
  for (const run of runs) {
    for (const row of run.rows) {
      if (row.skipped || row.error) continue;
      const acc = per.get(row.name) || { runs: 0, items: 0, kept: 0, empty: 0 };
      acc.runs += 1;
      acc.items += row.items;
      acc.kept += row.kept;
      if (!row.kept) acc.empty += 1;
      per.set(row.name, acc);
    }
  }
  const first = runs[0] && new Date(runs[0].at).toISOString().slice(0, 16);
  const last = runs[runs.length - 1] && new Date(runs[runs.length - 1].at).toISOString().slice(0, 16);
  console.log(`${runs.length} samples, ${first} → ${last}\n`);
  for (const [name, a] of [...per.entries()].sort((x, y) => y[1].kept - x[1].kept)) {
    console.log(
      `${name.padEnd(16)} kept ${String(a.kept).padStart(4)} of ${String(a.items).padStart(5)}` +
      `  (${((a.kept / Math.max(1, a.items)) * 100).toFixed(1)}%)` +
      `  empty in ${a.empty} of ${a.runs} samples`,
    );
  }
  console.log("\nA source empty in every sample of a full week is one to demote.");
};

(async () => {
  if (process.argv.includes("--report")) return report();
  const rows = [];
  for (const src of sources) {
    /* Optional sources need a Chrome host permission the extension asks for;
       from here they are just URLs, but they are not what a fresh install
       reads, so they are sampled and reported separately. */
    rows.push(await sample(src));
    await new Promise((r) => setTimeout(r, 600));
  }
  for (const r of rows) {
    const tag = r.optional ? "opt" : "   ";
    if (r.skipped) console.log(`${tag} ${r.name.padEnd(16)} skipped (${r.skipped})`);
    else if (r.error) console.log(`${tag} ${r.name.padEnd(16)} ${r.error}`);
    else
      console.log(
        `${tag} ${r.name.padEnd(16)} ${String(r.kept).padStart(3)} kept of ${String(r.items).padStart(3)}` +
        `${r.cryptoOnly ? " (beat filter)" : ""}` +
        `${r.newestAgeH === null ? "" : `  newest ${r.newestAgeH}h ago`}`,
      );
  }
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, JSON.stringify({ at: Date.now(), rows }) + "\n");
  console.log(`\nappended to ${path.relative(ROOT, LOG)} — run --report after a few days`);
})();
