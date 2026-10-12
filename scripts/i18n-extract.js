#!/usr/bin/env node
/* Builds `_locales/en/messages.json` from the code that uses it.
 *
 * Every translatable string in this project is written at its call site with
 * its English beside it:
 *
 *     msg("stats_mkt_cap", "Mkt Cap")
 *
 * so English is never a table that can drift from what is on screen — it *is*
 * what is on screen. Chrome still needs a catalogue for `default_locale`,
 * though, and its fallback chain runs through it: a key missing from `tr`
 * falls back to `en`, not to nothing. So the catalogue is generated from the
 * calls rather than maintained beside them.
 *
 *     node scripts/i18n-extract.js          # write _locales/en/messages.json
 *     node scripts/i18n-extract.js --check  # fail if it is out of date
 *
 * `--check` is what `tests/test-i18n.js` runs, so a string added in `src/`
 * without regenerating fails the suite instead of shipping a key Chrome cannot
 * resolve.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "_locales", "en", "messages.json");

/* `msg("key", "English")` with either quote style, across a line break, and
 * with escaped quotes inside the English. Template literals are deliberately
 * not matched: a string with `${…}` in it cannot be translated as a unit, and
 * the placeholder form ($1) exists for exactly that. */
const CALL = /\bmsg\(\s*"([a-z0-9_]+)"\s*,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;

const unquote = (literal) => {
  const body = literal.slice(1, -1);
  return body.replace(/\\(["'\\nt])/g, (_, c) =>
    c === "n" ? "\n" : c === "t" ? "\t" : c,
  );
};

const collect = () => {
  const messages = {};
  const clashes = [];
  for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith(".js"))) {
    const text = fs.readFileSync(path.join(SRC, file), "utf8");
    let m;
    while ((m = CALL.exec(text))) {
      const key = m[1];
      const english = unquote(m[2]);
      if (messages[key] && messages[key].message !== english) {
        clashes.push(
          `${key}: "${messages[key].message}" in one place, "${english}" in ${file}`,
        );
      }
      /* `$1` in the English is a placeholder, and Chrome refuses a message
       * that uses one without declaring it. Declared positionally, which is
       * what `msg()` substitutes. */
      const holes = [...new Set(english.match(/\$(\d+)/g) || [])];
      const entry = { message: english };
      if (holes.length) {
        entry.placeholders = {};
        for (const hole of holes) {
          const n = hole.slice(1);
          entry.placeholders[`arg${n}`] = { content: `$${n}` };
        }
      }
      messages[key] = entry;
    }
  }
  return { messages, clashes };
};

const { messages, clashes } = collect();
if (clashes.length) {
  console.error("✘ the same key is used for two different English strings:");
  for (const c of clashes) console.error(`   - ${c}`);
  process.exit(1);
}

/* Sorted, so a regeneration is a diff of what changed rather than of the order
 * files happened to be read in. */
const sorted = {};
for (const key of Object.keys(messages).sort()) sorted[key] = messages[key];
const text = `${JSON.stringify(sorted, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== text) {
    console.error(
      "✘ _locales/en/messages.json is out of date — run `node scripts/i18n-extract.js`",
    );
    process.exit(1);
  }
  console.log(`✔ _locales/en/messages.json matches src/ (${Object.keys(sorted).length} keys)`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text);
console.log(`✔ wrote ${Object.keys(sorted).length} keys to _locales/en/messages.json`);
