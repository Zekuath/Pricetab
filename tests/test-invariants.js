// Enforces the architectural invariants the codebase guide states in prose.
//
// Why this file exists: this repo has no compiler, no type system and no
// module graph, so the rules that protect the product's core claims — zero
// permissions, zero external requests, no eval, a known set of API hosts —
// are enforced today by whoever remembers to read the right
// paragraph. This turns each of them into a failing test instead.
//
// Deliberately zero-dependency: it runs on plain Node through the existing
// tests/run-all.js, so it works in CI as-is and adds no supply chain.
// Every rule below quotes the codebase guide line it enforces.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const srcFiles = fs
  .readdirSync(path.join(ROOT, "src"))
  .filter((f) => f.endsWith(".js"));

let failures = 0;
const check = (label, fn) => {
  let problems;
  try {
    problems = fn() || [];
  } catch (e) {
    problems = [`rule threw: ${e.message}`];
  }
  if (problems.length) {
    failures += problems.length;
    console.error(`✘ ${label}`);
    for (const p of problems) console.error(`    ${p}`);
  } else {
    console.log(`✔ ${label}`);
  }
};

// Strip // and /* */ comments so a rule name mentioned in a comment is not a
// violation. Crude but sufficient: these are lint rules, not a parser.
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const scanSrc = (re, why) => {
  const out = [];
  for (const f of srcFiles) {
    const lines = stripComments(read(`src/${f}`)).split("\n");
    lines.forEach((line, i) => {
      if (re.test(line)) out.push(`src/${f}:${i + 1} ${why} — ${line.trim().slice(0, 90)}`);
    });
  }
  return out;
};

// --- 1. Nothing is granted at install ------------------------------------
// The codebase guide: "Zero permissions required" / "Zero permissions = faster review".
// This is the product's central privacy claim and the store listing rests on it.
//
// The rule used to be "no manifest key matching /permission/i", which is the
// right default. It was changed deliberately on 21 Aug 2026 to admit
// `optional_host_permissions`: every news source worth reading (Cointelegraph,
// Decrypt, CryptoSlate, Bitcoin Magazine, CoinJournal, BBC) sends no CORS
// header, so a browser extension cannot read one without host access — and the
// only reachable keyless feed had gone 101 hours without publishing anything.
//
// **An optional host permission is not a permission at install.** Chrome grants
// it only when someone presses a button, it raises no install-time warning and
// it does not slow review, so the claim the listing makes is still true. This
// check now enforces the two things that keep it true, which is more than the
// old one did:
//
//   1. `permissions`, `host_permissions` and `optional_permissions` are empty —
//      nothing is granted without a person asking for it;
//   2. every entry in `optional_host_permissions` is on the list below, so a
//      new origin cannot appear without editing this file and saying why.
const OPTIONAL_ORIGINS = new Set([
  "https://cointelegraph.com/*",
  "https://decrypt.co/*",
  "https://cryptoslate.com/*",
  "https://bitcoinmagazine.com/*",
  "https://coinjournal.net/*",
  "https://feeds.bbci.co.uk/*",
]);
check("nothing is granted at install", () => {
  const m = JSON.parse(read("manifest.json"));
  const out = [];
  for (const key of ["permissions", "host_permissions", "optional_permissions"]) {
    if (m[key] && m[key].length) {
      out.push(
        `manifest declares "${key}": ${JSON.stringify(m[key])} — that is granted at install`,
      );
    }
  }
  const known = [
    "permissions",
    "host_permissions",
    "optional_permissions",
    "optional_host_permissions",
  ];
  for (const key of Object.keys(m)) {
    if (/permission/i.test(key) && !known.includes(key)) {
      out.push(`manifest declares an unreviewed permission key "${key}"`);
    }
  }
  for (const origin of m.optional_host_permissions || []) {
    if (!OPTIONAL_ORIGINS.has(origin)) {
      out.push(
        `${origin} is in optional_host_permissions but not in this test's list — ` +
          "add it here and to the codebase guide's provider list in the same change, with a reason",
      );
    }
  }
  return out;
});

// --- 2. The new tab page stays the new tab page -------------------------
// The codebase guide: 'index.html — extension entry point (new tab page) — NEVER repurpose'
check("manifest newtab override still points at index.html", () => {
  const m = JSON.parse(read("manifest.json"));
  const nt = (m.chrome_url_overrides || {}).newtab;
  return nt === "index.html" ? [] : [`newtab override is ${JSON.stringify(nt)}`];
});

// --- 3. No external resources ------------------------------------------
// The codebase guide: "External resources: None" — Normalize.css and Roboto Mono are
// bundled locally precisely so the extension makes zero external font/CSS
// requests. A CDN <script> would also break the MV3 CSP.
check("no remote <script>/<link> in shipped HTML", () => {
  const out = [];
  for (const f of ["index.html", "privacy.html", "rate.html"]) {
    const html = read(f);
    const re = /<(script|link)\b[^>]*\b(?:src|href)\s*=\s*["']https?:\/\/[^"']+["']/gi;
    let m;
    while ((m = re.exec(html))) out.push(`${f}: ${m[0].slice(0, 100)}`);
  }
  return out;
});

// --- 4. MV3 CSP ---------------------------------------------------------
// The codebase guide: "No eval() or inline scripts".
check("no eval() or new Function() in src/", () =>
  scanSrc(/\beval\s*\(|\bnew\s+Function\s*\(/, "MV3 CSP forbids dynamic code"),
);

// --- 5. XSS -------------------------------------------------------------
// The codebase guide security checklist: "No innerHTML with user data (XSS risk)".
// Blanket ban: this codebase builds every node through React, so an
// innerHTML assignment anywhere is a new pattern that deserves a look.
check("no innerHTML / outerHTML assignment in src/", () =>
  scanSrc(/\.(inner|outer)HTML\s*=/, "assign through React instead"),
);

// --- 6. Production cleanliness -----------------------------------------
// The codebase guide code-quality checklist: "No console.log in production (removed)".
check("no console.log in src/", () =>
  scanSrc(/\bconsole\.log\s*\(/, "left-over debug output"),
);

// --- 7. Every module is actually loaded ---------------------------------
// The codebase guide: "Add a new src file: Add a <script> tag to index.html — order
// matters". A file that exists but is never loaded is dead weight; a file
// referenced but missing is a blank new tab.
check("src/*.js and index.html agree (rate.js is loaded by rate.html)", () => {
  const html = read("index.html");
  const listed = new Set(
    [...html.matchAll(/src="\.\/src\/([^"]+)"/g)].map((m) => m[1]),
  );
  const actual = new Set(srcFiles);
  const out = [];
  for (const f of actual) {
    if (f !== "rate.js" && !listed.has(f)) out.push(`src/${f} exists but has no <script> tag`);
  }
  for (const f of listed) {
    if (!actual.has(f)) out.push(`index.html loads src/${f} which does not exist`);
  }
  if (!read("rate.html").includes("src/rate.js")) out.push("rate.html no longer loads src/rate.js");
  return out;
});

// --- 8. The tab-title gate ---------------------------------------------
// The codebase guide, updateTabTitle(): "Never call it directly from app.js — go
// through this.setTabTitle(), which stands down while a hit target owns the
// title". The single legitimate call site is inside setTabTitle itself, so
// exactly one occurrence is expected.
check("updateTabTitle() is called from app.js only inside setTabTitle", () => {
  const body = stripComments(read("src/app.js"));
  const hits = [...body.matchAll(/updateTabTitle\s*\(/g)].length;
  if (hits === 1) return [];
  return [
    `expected exactly 1 call in src/app.js (the one inside setTabTitle), found ${hits}. ` +
      `Route new callers through this.setTabTitle().`,
  ];
});

// --- 9. Widget cards scale from one font-size ---------------------------
// The codebase guide: "Style anything inside a widget card: Use em, never rem."
// The rule is scoped to the card interior. These three components are the
// panel chrome that sits OUTSIDE the card, where rem is correct.
const REM_ALLOWED_OUTSIDE_CARD = new Set([
  "WidgetRestoreButton",
  "CompareToggleButton",
  "WidgetPanel",
  "WidgetHideButton",
]);
check("no rem units inside widget-card components", () => {
  const lines = read("src/styles-widgets.js").split("\n");
  const out = [];
  let current = null;
  lines.forEach((line, i) => {
    const m = /^const ([A-Za-z0-9_]+) = styled/.exec(line);
    if (m) current = m[1];
    if (line.startsWith("`;")) current = null;
    if (!current || REM_ALLOWED_OUTSIDE_CARD.has(current)) return;
    if (/[0-9.]rem\b/.test(line)) {
      out.push(
        `src/styles-widgets.js:${i + 1} ${current} uses rem — the card sets one ` +
          `font-size and everything inside must scale off it (use em)`,
      );
    }
  });
  return out;
});

// --- 10. The set of remote hosts is a deliberate list -------------------
// The codebase guide documents every provider and records which ones were rejected
// (CORS, API keys, geo-blocking). A new host appearing quietly is both a
// privacy-claim change and a Chrome Web Store single-purpose question, so
// adding one should be a conscious edit to this list.
const ALLOWED_HOSTS = new Set([
  /* The six opt-in newsrooms. These are only ever fetched once the user has
   * pressed "Turn on full sources" and Chrome has granted the matching
   * `optional_host_permissions` — see §1 above, which holds the same list and
   * is what stops one being added without a reason. They are here rather than
   * absent because `src/config.js` names their URLs whether or not anyone has
   * granted them, and a host this file has not seen is a host nobody reviewed. */
  "bitcoinmagazine.com",
  "cointelegraph.com",
  "coinjournal.net",
  "cryptoslate.com",
  "decrypt.co",
  "feeds.bbci.co.uk",

  /* Four newsrooms that need **no permission at all**: each answers
   * `Access-Control-Allow-Origin: *`, verified by sending a
   * `chrome-extension://` Origin and reading the header back — the first three
   * on 21 Aug 2026, Bitcoin.com on 28 Aug. That is what separates them from
   * the six above, and it is why they are `optional: false` in `NEWS_SOURCES`
   * while Cointelegraph and the rest are not. Three of them are finance desks;
   * Bitcoin.com is the only one on the crypto beat, which is what a fresh
   * install had none of. */
  "feeds.content.dowjones.io",
  "finance.yahoo.com",
  "news.bitcoin.com",
  "search.cnbc.com",

  "api.alternative.me",
  "api.blockchair.com",
  "api.bybit.com",
  "api.coinlore.com",
  "api.exchange.coinbase.com",
  "api.kraken.com",
  "chromewebstore.google.com",
  "ethereum-rpc.publicnode.com",
  "hn.algolia.com",
  "mempool.space",
  "news.ycombinator.com",
  "www.coinbase.com",
  "www.okx.com",
  // Not an endpoint: the SVG XML namespace, used as an identifier by
  // createElementNS in chart.js. Nothing is ever fetched from it.
  "www.w3.org",
]);
check("no undeclared remote hosts in src/", () => {
  const out = [];
  for (const f of srcFiles) {
    const body = stripComments(read(`src/${f}`));
    for (const m of body.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) {
      if (!ALLOWED_HOSTS.has(m[1])) {
        out.push(
          `src/${f} references ${m[1]} — add it to ALLOWED_HOSTS here and to ` +
            `the codebase guide's provider list if it is intended`,
        );
      }
    }
  }
  return [...new Set(out)];
});

// --- 11. No credentials in the extension --------------------------------
// The codebase guide: "No hardcoded secrets or API keys" / "localStorage for
// preferences only (no secrets)". Every provider used here is keyless by
// design; a key appearing at all means a provider was swapped for one that
// is not, which changes the privacy story.
check("no hardcoded API keys or tokens in src/", () =>
  scanSrc(
    /\b(api[_-]?key|apikey|secret|access[_-]?token|bearer)\b\s*[:=]\s*["'][^"']{12,}["']/i,
    "possible hardcoded credential",
  ),
);


/* The store summary is written in three places, and drift between them is not
 * a tidiness problem here — it is this listing's specific failure mode.
 *
 * Both rejections were Yellow Argon (keyword spam), and the second one came
 * from a *duplicate* copy: `STORE_ASSETS.md` still held an old description
 * with a coin list in it, and that was the copy someone submitted. The rule
 * that came out of it — one canonical source — is only enforceable if
 * something checks the copies still agree.
 *
 * Conditional like the rest: the store docs are tracked, but this stays quiet
 * if a checkout does not have them. */
check("the store summary says the same thing everywhere", () => {
  const out = [];
  const manifestPath = path.join(ROOT, "manifest.json");
  if (!fs.existsSync(manifestPath)) return out;
  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(manifestPath, "utf8")).description;
  } catch {
    return ["manifest.json is not valid JSON"];
  }
  if (typeof summary !== "string" || !summary) {
    return ["manifest.json has no description for the store summary"];
  }
  // The dashboard's own limit. A summary over it is silently truncated in
  // search results, which is where most of the clicks are decided.
  if (summary.length > 132) {
    out.push(`manifest description is ${summary.length} chars — the store cuts at 132`);
  }
  for (const doc of [
    "docs/store/STORE_DESCRIPTION.md",
    "docs/store/STORE_ASSETS.md",
  ]) {
    const full = path.join(ROOT, doc);
    if (!fs.existsSync(full)) continue;
    if (!fs.readFileSync(full, "utf8").includes(summary)) {
      out.push(
        `${doc} does not carry the manifest's summary verbatim — a copy that ` +
          "drifted is what caused the second Yellow Argon rejection",
      );
    }
  }
  /* And the thing that got it rejected in the first place: a run of tickers.
   * Checked on the detailed description, which is the block that is pasted
   * into the dashboard. */
  const descPath = path.join(ROOT, "docs/store/STORE_DESCRIPTION.md");
  if (fs.existsSync(descPath)) {
    const text = fs.readFileSync(descPath, "utf8");
    const at = text.indexOf("## Detailed Description");
    if (at !== -1) {
      const open = text.indexOf("```", at);
      const close = text.indexOf("```", open + 3);
      const body = open !== -1 && close !== -1 ? text.slice(open + 3, close) : "";
      const run = body.match(/\b[A-Z]{2,5},\s*[A-Z]{2,5},\s*[A-Z]{2,5}/);
      if (run) {
        out.push(`the detailed description contains a ticker list ("${run[0]}") — Yellow Argon`);
      }
    }
  }
  return out;
});


/* --- the palette has one blue, and it belongs to one thing --------------
 *
 * `chartLine` is a blue, and the only hue in this interface that is not green,
 * red or ink. It exists for the **second line in comparison mode**, where two
 * series have to be told apart and up/down are already spoken for.
 *
 * It kept leaking out of there into accents: hovering a coin in the portfolio
 * turned its symbol Tailwind-blue, an active widget control used the same
 * token, and the allocation strip's Other bar fell back to it. On a word, at
 * that saturation, it reads as a hyperlink; on a bar it reads as a seventh
 * identity rather than the absence of one. Interaction has its own token now
 * (`accent`, green-family and deliberately not the up-green), so this fails
 * the moment the blue is borrowed for something that is not a plotted line.
 */
check("the palette's blue is only ever a plotted line", () => {
  const out = [];
  /* `chart.js` is the comparison overlay, which is what the colour is for.
   * Everything else has to justify itself here rather than in review. */
  const allowed = new Set(["chart.js"]);
  for (const file of srcFiles) {
    if (allowed.has(file)) continue;
    read(`src/${file}`)
      .split("\n")
      .forEach((line, i) => {
        if (!/color\.chartLine\b/.test(line)) return;
        out.push(
          `src/${file}:${i + 1} uses the palette's blue outside the ` +
            `comparison chart — interaction and "on" states use color.accent`,
        );
      });
  }
  return out;
});

if (failures) {
  console.error(`\n${failures} INVARIANT VIOLATION(S)`);
  process.exit(1);
}
console.log("ALL INVARIANT TESTS PASSED");
