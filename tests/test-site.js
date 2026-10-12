// The public pages that are not the extension: the website (site/), its
// thirteen languages, the privacy page and the README.
//
// Nothing tested them. A page that loads its words from a file per language
// fails quietly: a key missing from one file shows that sentence in English
// and nothing else is wrong, and an attribute that names its own English
// instead of a key (one gallery picture did, until 8 Oct 2026) is never
// translated at all. A screenshot renamed in one place is a broken image on a
// page nobody opened since. Zero dependencies, like the invariants suite.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

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
    for (const p of problems.slice(0, 12)) console.error(`    ${p}`);
    if (problems.length > 12) console.error(`    … and ${problems.length - 12} more`);
  } else {
    console.log(`✔ ${label}`);
  }
};

const html = read("site/index.html");
const LOCALES = fs.readdirSync(path.join(ROOT, "site", "i18n")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const dicts = Object.fromEntries(LOCALES.map((c) => [c, JSON.parse(read(`site/i18n/${c}.json`))]));
const en = dicts.en;

// Every key the page asks for, from the element text and the four attributes
const pageKeys = new Set();
const attrValues = [];
for (const m of html.matchAll(/\sdata-i18n(?:-(alt|aria|title|label))?="([^"]*)"/g)) {
  pageKeys.add(m[2]);
  if (m[1]) attrValues.push(m[2]);
}
// …and the ones the page's script reads itself (the chart's labels)
for (const m of html.matchAll(/SITE_T\("([^"]+)"/g)) pageKeys.add(m[1]);
// The English of an element marked data-i18n, as the page holds it
const pageEnglish = {};
for (const m of html.matchAll(/<(\w+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) pageEnglish[m[2]] = m[3];
const tags = (s) => (String(s).match(/<[^>]+>/g) || []).sort().join(" ");
const squash = (s) => String(s).replace(/\s+/g, " ").trim();

check("the site's languages are the thirteen the selector offers", () => {
  const offered = [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]).sort();
  return offered.join(",") === LOCALES.join(",") ? [] : [`selector ${offered.join(",")} vs files ${LOCALES.join(",")}`];
});

check("every translation attribute names a key, not its own English", () =>
  attrValues.filter((k) => !/^[a-z0-9]+(\.[a-zA-Z0-9]+)+$/.test(k)).map((k) => `data-i18n-*="${k.slice(0, 60)}…"`));

check("en.json holds exactly the keys the page asks for", () => {
  const out = [];
  for (const k of pageKeys) if (!(k in en)) out.push(`${k} is on the page, not in en.json`);
  for (const k of Object.keys(en)) if (!pageKeys.has(k)) out.push(`${k} is in en.json, not on the page`);
  return out;
});

check("en.json says what the page says", () =>
  Object.entries(pageEnglish)
    .filter(([k, v]) => k in en && squash(en[k]) !== squash(v))
    .map(([k]) => `${k}: en.json and the page differ`));

check("every language has every key, translated", () => {
  const out = [];
  for (const c of LOCALES) {
    if (c === "en") continue;
    for (const k of Object.keys(en)) {
      const v = dicts[c][k];
      if (typeof v !== "string" || !v.trim()) out.push(`${c}: ${k} missing`);
    }
    for (const k of Object.keys(dicts[c])) if (!(k in en)) out.push(`${c}: ${k} is not a key of the page`);
  }
  return out;
});

check("a translation carries the same markup as the English", () => {
  const out = [];
  for (const c of LOCALES) {
    if (c === "en") continue;
    for (const [k, v] of Object.entries(en)) {
      if (typeof dicts[c][k] === "string" && tags(dicts[c][k]) !== tags(v)) out.push(`${c}: ${k} — ${tags(dicts[c][k])} vs ${tags(v)}`);
    }
  }
  return out;
});

check("a translation names no script, handler or remote address", () => {
  const out = [];
  for (const c of LOCALES) {
    for (const [k, v] of Object.entries(dicts[c])) {
      if (/<script|\son\w+\s*=|javascript:|href="(?!\.\.\/"|https:\/\/zekuath\.github\.io\/)/i.test(v)) out.push(`${c}: ${k}`);
    }
  }
  return out;
});

// Local references: the page's images and links, the README's images and links
const local = (ref) => !/^(https?:|mailto:|#|data:)/.test(ref);
const exists = (from, ref) => {
  const clean = ref.split("#")[0].split("?")[0];
  if (!clean) return true;
  const p = path.normalize(path.join(path.dirname(path.join(ROOT, from)), clean));
  return fs.existsSync(p);
};

check("every image and link on the website resolves to a file", () =>
  [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((r) => local(r) && !r.startsWith("i18n/"))
    .filter((r) => !exists("site/index.html", r))
    .map((r) => `site/index.html → ${r}`));

check("every gallery picture is a 1280×800 PNG", () => {
  const out = [];
  for (const m of html.matchAll(/class="gallery-img" src="([^"]+)"/g)) {
    const p = path.join(ROOT, "site", m[1]);
    if (!fs.existsSync(p)) continue; // reported above
    const b = fs.readFileSync(p);
    const w = b.readUInt32BE(16);
    const h = b.readUInt32BE(20);
    if (b.toString("ascii", 1, 4) !== "PNG" || w !== 1280 || h !== 800) out.push(`${m[1]}: ${w}×${h}`);
  }
  return out;
});

check("every image and link in the README resolves to a file", () => {
  const md = read("README.md");
  return [...md.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((r) => local(r) && !exists("README.md", r))
    .map((r) => `README.md → ${r}`);
});

check("the README points nowhere private", () => {
  // The working notes and every dot-folder (editor and tool settings) stay local
  const md = read("README.md");
  return [...md.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((r) => /^docs\/internal\b|^\.\w|\/\.\w/.test(r))
    .map((r) => `README.md → ${r}`);
});

check("the privacy page and the policy carry the same date", () => {
  const a = (read("privacy.html").match(/Last updated: ([^<\n]+)/) || [])[1];
  const b = (read("docs/PRIVACY.md").match(/Last updated: ([^\n]+)/) || [])[1];
  return a && a === b ? [] : [`privacy.html "${a}" vs docs/PRIVACY.md "${b}"`];
});

check("the privacy page and the policy have the same sections", () => {
  const a = [...read("privacy.html").matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1].trim());
  const b = [...read("docs/PRIVACY.md").matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  return a.join(" | ") === b.join(" | ") ? [] : [`privacy.html: ${a.join(" | ")}`, `docs/PRIVACY.md: ${b.join(" | ")}`];
});

if (failures) {
  console.error(`\n${failures} SITE PROBLEM(S)`);
  process.exit(1);
}
console.log("ALL SITE TESTS PASSED");
