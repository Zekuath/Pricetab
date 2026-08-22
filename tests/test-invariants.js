// Enforces the architectural invariants CLAUDE.md states in prose.
//
// Why this file exists: this repo has no compiler, no type system and no
// module graph, so the rules that protect the product's core claims — zero
// permissions, zero external requests, no eval, a known set of API hosts —
// are enforced today by an agent (or a human) remembering to read the right
// paragraph. This turns each of them into a failing test instead.
//
// Deliberately zero-dependency: it runs on plain Node through the existing
// tests/run-all.js, so it works in CI as-is and adds no supply chain.
// Every rule below quotes the CLAUDE.md line it enforces.
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
// CLAUDE.md: "Zero permissions required" / "Zero permissions = faster review".
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
          "add it here and to CLAUDE.md's provider list in the same change, with a reason",
      );
    }
  }
  return out;
});

// --- 2. The new tab page stays the new tab page -------------------------
// CLAUDE.md: 'index.html — extension entry point (new tab page) — NEVER repurpose'
check("manifest newtab override still points at index.html", () => {
  const m = JSON.parse(read("manifest.json"));
  const nt = (m.chrome_url_overrides || {}).newtab;
  return nt === "index.html" ? [] : [`newtab override is ${JSON.stringify(nt)}`];
});

// --- 3. No external resources ------------------------------------------
// CLAUDE.md: "External resources: None" — Normalize.css and Roboto Mono are
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
// CLAUDE.md: "No eval() or inline scripts".
check("no eval() or new Function() in src/", () =>
  scanSrc(/\beval\s*\(|\bnew\s+Function\s*\(/, "MV3 CSP forbids dynamic code"),
);

// --- 5. XSS -------------------------------------------------------------
// CLAUDE.md security checklist: "No innerHTML with user data (XSS risk)".
// Blanket ban: this codebase builds every node through React, so an
// innerHTML assignment anywhere is a new pattern that deserves a look.
check("no innerHTML / outerHTML assignment in src/", () =>
  scanSrc(/\.(inner|outer)HTML\s*=/, "assign through React instead"),
);

// --- 6. Production cleanliness -----------------------------------------
// CLAUDE.md code-quality checklist: "No console.log in production (removed)".
check("no console.log in src/", () =>
  scanSrc(/\bconsole\.log\s*\(/, "left-over debug output"),
);

// --- 7. Every module is actually loaded ---------------------------------
// CLAUDE.md: "Add a new src file: Add a <script> tag to index.html — order
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
// CLAUDE.md, updateTabTitle(): "Never call it directly from app.js — go
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
// CLAUDE.md: "Style anything inside a widget card: Use em, never rem."
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
// CLAUDE.md documents every provider and records which ones were rejected
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

  /* Three financial newsrooms that need **no permission at all**: each answers
   * `Access-Control-Allow-Origin: *`, verified 21 Aug 2026 by sending a
   * `chrome-extension://` Origin and reading the header back. That is what
   * separates them from the six above, and it is why they are `optional:
   * false` in `NEWS_SOURCES` while Cointelegraph and the rest are not. */
  "feeds.content.dowjones.io",
  "finance.yahoo.com",
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
            `CLAUDE.md's provider list if it is intended`,
        );
      }
    }
  }
  return [...new Set(out)];
});

// --- 11. No credentials in the extension --------------------------------
// CLAUDE.md: "No hardcoded secrets or API keys" / "localStorage for
// preferences only (no secrets)". Every provider used here is keyless by
// design; a key appearing at all means a provider was swapped for one that
// is not, which changes the privacy story.
check("no hardcoded API keys or tokens in src/", () =>
  scanSrc(
    /\b(api[_-]?key|apikey|secret|access[_-]?token|bearer)\b\s*[:=]\s*["'][^"']{12,}["']/i,
    "possible hardcoded credential",
  ),
);

// --- 12. The agent rulebook is wired to every entry point ----------------
/* `docs/internal/AGENT_RULES.md` is what binds Claude, Codex and Gemini to the same way
 * of working, and each of them arrives by a different door: Claude and Codex
 * through `CLAUDE.md` (`AGENTS.md` is a symlink to it), Gemini through
 * `GEMINI.md`. A rename that leaves one door pointing at nothing is silent —
 * the agent simply never reads the rules and nobody finds out until it behaves
 * like an agent with no rules.
 *
 * Conditional on purpose: all of these files are git-ignored local notes, so a
 * clean CI checkout has none of them. Where the file is absent there is nothing
 * to keep honest; where it is present, it has to point somewhere real. */
check("the agent rulebook is reachable from every entry point", () => {
  const out = [];
  const rules = path.join(ROOT, "docs", "internal", "AGENT_RULES.md");
  const doors = [
    ["CLAUDE.md", "Claude, and Codex through the AGENTS.md symlink"],
    ["GEMINI.md", "Gemini"],
  ];
  const present = doors.filter(([f]) => fs.existsSync(path.join(ROOT, f)));
  if (!present.length && !fs.existsSync(rules)) return out; // clean checkout
  if (!fs.existsSync(rules)) {
    out.push("docs/internal/AGENT_RULES.md is missing but an entry point exists");
    return out;
  }
  for (const [file, who] of present) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (!text.includes("docs/internal/AGENT_RULES.md")) {
      out.push(`${file} does not point at docs/internal/AGENT_RULES.md (the door for ${who})`);
    }
  }
  // The one command has to be spelled the same everywhere it is promised
  const text = fs.readFileSync(rules, "utf8");
  if (!text.includes("npm --prefix tests run check")) {
    out.push("docs/internal/AGENT_RULES.md never names the command that must be green");
  }
  if (!text.includes("docs/internal/agents/")) {
    out.push("docs/internal/AGENT_RULES.md never says where the journals live");
  }
  return out;
});

// --- 13. Local-only files are not tracked by git -------------------------
/* `.gitignore` does nothing for a file that is already tracked — add one once,
 * with `git add -f` or before the ignore rule existed, and it is in the history
 * forever, on every clone and on the public remote. That has already happened
 * here: an early `CLAUDE.md` and `docs/internal/AI_GUIDELINES.md` live in commits
 * `dfdd536`…`4b00b34` on `origin/main`, removed from the tree but not from the
 * history.
 *
 * So the ignore list is not the guard — this is. It fails the moment one of
 * these appears in the index, which is before it can reach a commit.
 *
 * Skipped where there is no git (a tarball, a packaged build): there is nothing
 * to be tracked by. */
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

check("no local-only agent file is tracked by git", () => {
  const { execFileSync } = require("child_process");
  if (!fs.existsSync(path.join(ROOT, ".git"))) return [];
  const LOCAL_ONLY = [
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    /* The whole directory, not a file per line. Every piece of working
     * material lives under it now, so a new note dropped in beside the others
     * is covered the day it is written — the old list named four paths and a
     * fifth file would have walked straight past this check onto a public
     * remote. */
    "docs/internal",
    "MONETIZATION.md",
    "BUSINESS_IDEAS.md",
    ".claude",
  ];
  let listed;
  try {
    listed = execFileSync("git", ["ls-files", "--", ...LOCAL_ONLY], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return []; // no git binary, or not a work tree
  }
  return listed
    .split("\n")
    .filter(Boolean)
    .map(
      (f) =>
        `${f} is tracked — it is working material, not part of the published ` +
        `extension. Untrack it with \`git rm --cached\` before committing; ` +
        `once it is in a commit that has been sent to the remote, it is public.`,
    );
});

if (failures) {
  console.error(`\n${failures} INVARIANT VIOLATION(S)`);
  process.exit(1);
}
console.log("ALL INVARIANT TESTS PASSED");
