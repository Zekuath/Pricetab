// Language: the catalogues, and the two ways they can silently lie.
//
// A translation cannot throw. It goes wrong by being *absent* — a key that
// only exists in English, so a German panel prints one English row in the
// middle of it — or by being *wrong in shape*: a message whose `$1` was
// dropped in translation prints a sentence with the number missing, and
// nothing anywhere reports it.
//
// So this suite asserts three things, none of which a human reviewer of a
// JSON file reliably catches:
//   1. Every locale in `SUPPORTED_LOCALES` has a catalogue, and every
//      catalogue on disk is a locale we offer. A picker offering a language
//      whose file is not there is a picker that switches to English.
//   2. `_locales/en/messages.json` matches the `msg()` calls in `src/` — run
//      through `scripts/i18n-extract.js --check`, so English is generated from
//      what is on screen rather than maintained beside it.
//   3. Every non-English catalogue carries exactly the English key set, with
//      the same placeholders in each message.
//
// Zero-dependency, like `test-invariants.js`.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const LOCALES = path.join(ROOT, "_locales");

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
    for (const p of problems) console.error(`   - ${p}`);
  } else {
    console.log(`✔ ${label}`);
  }
};

/* The offered list, read out of `src/i18n.js` rather than repeated here — a
 * copy of it in the test is a copy that goes stale the day a language is
 * added, which is the one day this check matters. */
const offeredLocales = () => {
  const text = fs.readFileSync(path.join(ROOT, "src", "i18n.js"), "utf8");
  const block = text.slice(
    text.indexOf("const SUPPORTED_LOCALES = ["),
    text.indexOf("];", text.indexOf("const SUPPORTED_LOCALES = [")),
  );
  return [...block.matchAll(/value:\s*"([A-Za-z_]+)"/g)].map((m) => m[1]);
};

const readCatalogue = (code) =>
  JSON.parse(fs.readFileSync(path.join(LOCALES, code, "messages.json"), "utf8"));

/* Which substitutions a message actually carries.
 *
 * Two ways to carry one, and both count. `$1` straight in the text is the
 * common form. The other is Chrome's **named** placeholder — `$FIRST$` in the
 * text with `placeholders: { first: { content: "$1" } }` beside it — which is
 * the only way to put two substitutions **side by side**: written plainly,
 * `$1$2` reads as a placeholder named `1`, and the extension will not load at
 * all. Japanese, Korean and Chinese need exactly that adjacency, because they
 * do not put a space between the number and its unit.
 *
 * Reading only the text called those translations broken for carrying their
 * values correctly. */
const placeholdersIn = (message, entry) => {
  const found = new Set(String(message).match(/\$\d+/g) || []);
  for (const p of Object.values((entry && entry.placeholders) || {})) {
    for (const n of String((p && p.content) || "").match(/\$\d+/g) || []) {
      found.add(n);
    }
  }
  return [...found].sort();
};

check("every offered language has a catalogue, and every catalogue is offered", () => {
  const out = [];
  const offered = offeredLocales();
  if (!offered.length) return ["src/i18n.js has no SUPPORTED_LOCALES to read"];
  if (!offered.includes("en")) out.push("English is not in SUPPORTED_LOCALES");
  const onDisk = fs
    .readdirSync(LOCALES)
    .filter((d) => fs.existsSync(path.join(LOCALES, d, "messages.json")));
  for (const code of offered) {
    if (!onDisk.includes(code)) {
      out.push(
        `${code} is offered in Settings but _locales/${code}/messages.json is missing — ` +
          "choosing it silently gives English",
      );
    }
  }
  for (const code of onDisk) {
    if (!offered.includes(code)) {
      out.push(`_locales/${code}/ exists but no one can choose it — add it to SUPPORTED_LOCALES`);
    }
  }
  return out;
});

check("the English catalogue matches the msg() calls in src/", () => {
  try {
    execFileSync("node", [path.join(ROOT, "scripts", "i18n-extract.js"), "--check"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return [];
  } catch (e) {
    const said = `${e.stdout || ""}${e.stderr || ""}`.trim();
    return [said || "scripts/i18n-extract.js --check failed"];
  }
});

check("every translation carries the English key set, with the same placeholders", () => {
  const out = [];
  const en = readCatalogue("en");
  const enKeys = Object.keys(en).sort();
  for (const code of offeredLocales().filter((c) => c !== "en")) {
    if (!fs.existsSync(path.join(LOCALES, code, "messages.json"))) continue;
    const cat = readCatalogue(code);
    const keys = Object.keys(cat).sort();
    for (const key of enKeys) {
      if (!keys.includes(key)) {
        out.push(`${code} is missing "${key}" — that row prints English inside a ${code} screen`);
        continue;
      }
      const message = cat[key] && cat[key].message;
      if (typeof message !== "string" || !message.trim()) {
        out.push(`${code}.${key} has no message`);
        continue;
      }
      const want = placeholdersIn(en[key].message, en[key]);
      const got = placeholdersIn(message, cat[key]);
      if (want.join(",") !== got.join(",")) {
        out.push(
          `${code}.${key} has placeholders ${got.join(" ") || "(none)"} where English has ` +
            `${want.join(" ") || "(none)"} — the value would be missing from the sentence`,
        );
      }
    }
    for (const key of keys) {
      if (!enKeys.includes(key)) {
        out.push(`${code}.${key} is not a key anything asks for — a rename left it behind`);
      }
    }
  }
  return out;
});

/* The manifest has to point at the catalogue, or Chrome ignores `_locales/`
 * entirely and every `chrome.i18n.getMessage` answers "". Nothing on screen
 * changes — every call site carries its English — which is exactly why this
 * needs a test rather than an eye. */
check("the manifest declares a default locale that exists", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  if (!manifest.default_locale) {
    return ["manifest.json has no default_locale, so _locales/ is ignored by Chrome"];
  }
  const file = path.join(LOCALES, manifest.default_locale, "messages.json");
  return fs.existsSync(file)
    ? []
    : [`default_locale is "${manifest.default_locale}" but ${file} does not exist`];
});

/* ── no two positional placeholders side by side ─────────────────────────
 *
 * `$1$2` does not mean "substitution one then substitution two". Chrome's
 * named-placeholder syntax is `$NAME$`, so it reads the `$1$` and looks for a
 * placeholder called `1`; not finding one it refuses the **whole extension**:
 *
 *     Variable $1$ used but not defined.
 *     Could not load manifest.
 *
 * Nothing in the app fails first — the extension simply will not install, and
 * the message names a variable no one wrote. Two strings carried this shape
 * ("Hit $1$2", "Removed $1$2") across all thirteen catalogues.
 *
 * A hand-rolled check for this missed it once already by looking for
 * `$[A-Za-z_]\w*$` — the name Chrome objects to is a **digit**, so the
 * pattern that finds real named placeholders steps straight over the one
 * shape that breaks. This asks the question the loader asks: any `$…$` whose
 * name is not declared, digits included.
 */
check("no message reads as an undeclared placeholder", () => {
  const offenders = [];
  for (const locale of fs.readdirSync(LOCALES)) {
    const file = path.join(LOCALES, locale, "messages.json");
    if (!fs.existsSync(file)) continue;
    const catalogue = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [key, entry] of Object.entries(catalogue)) {
      const text = (entry && entry.message) || "";
      const declared = new Set(
        Object.keys((entry && entry.placeholders) || {}).map((p) => p.toLowerCase()),
      );
      for (const name of text.match(/\$[A-Za-z0-9_]+\$/g) || []) {
        if (!declared.has(name.slice(1, -1).toLowerCase())) {
          offenders.push(
            `${locale}.${key} uses ${name} with nothing declaring it — Chrome refuses the manifest`,
          );
        }
      }
    }
  }
  return offenders;
});

console.log("ALL I18N TESTS PASSED");

if (failures) {
  console.error(`\n${failures} I18N PROBLEM(S)`);
  process.exit(1);
}
